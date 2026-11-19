/**
 * Construction phase 4 C4-04 — approval / payment / payout as three separate statuses with distinct meanings, plus the
 * current approver's decisions, for client claims, client certificates, subcontractor bills (subcontract certificates)
 * and client change orders. Read-only over the stored records; decisions go through domain/inbox.ts decide (workflow
 * engine, stale guard, reason fields, self-approval rule) — nothing here writes a ledger row.
 *
 *  Approval (الاعتماد): مسودة · بانتظار مدخلات المقاول · بانتظار الاعتماد · طلب تعديل · مقبول · معتمد (جزئيًا) · مرفوض · ملغى
 *     «مقبول» = the reviewer accepted the quantities/claim and the final approval is still open; «معتمد» = final approval.
 *  Payment (الفوترة والسداد): the invoice of the approved amount — لم يُفوتر · فاتورة مسودة · مستحق · متأخر · مدفوع جزئيًا · مدفوع
 *  Payout (صرف المحتجز): the retention withheld on it — لا محتجز · محتجز · طلب صرف · صُرف جزئيًا · صُرف
 * A change order is billed through the claims that include it, so its payment / payout read «يُفوتر ضمن المستخلصات» /
 * «لا ينطبق» (never a zero).
 */
import { adapter, type Doc } from "@/lib/adapter";
import { activeWorkflow, currentState, transitionsFor } from "@/lib/workflow";
import { actionVerb } from "@/lib/approvalPath";
import { currentUser } from "@/lib/session";
import { num, r2, sumBy } from "./calc";
import { get, invoicesOfCert, isSubmitted, list, rows } from "./data";
import { decide as inboxDecide } from "./inbox";

export const PAY_DOCTYPES = ["Digit Client Claim", "Digit Client Certificate", "Digit Subcontractor Bill", "Digit Client Variation"] as const;
export type PayDoctype = (typeof PAY_DOCTYPES)[number];
export const isPayDoctype = (dt: string): dt is PayDoctype => (PAY_DOCTYPES as readonly string[]).includes(dt);

export type Tone = "neutral" | "info" | "warn" | "ok" | "bad" | "accent";
export interface PayState { key: string; en: string; ar: string; tone: Tone; hint?: [string, string] | undefined }
const S = (key: string, en: string, ar: string, tone: Tone, hint?: [string, string]): PayState => ({ key, en, ar, tone, ...(hint ? { hint } : {}) });
const s = (v: unknown) => String(v ?? "");
const day = (v: unknown) => s(v).slice(0, 10);
const today = () => new Date().toISOString().slice(0, 10);
const stampMs = (v: unknown) => { const t = Date.parse(s(v).replace(" ", "T")); return Number.isNaN(t) ? 0 : t; };
const payableOf = (d: Doc) => r2(num(d["disable_rounded_total"]) || !d["rounded_total"] ? num(d["grand_total"]) : num(d["rounded_total"]));
export const CHANGES_REQUESTED = "Changes Requested";

/** The latest open change request on a document: a «Changes Requested» workflow log line newer than the document's last change. */
export function changeRequest(dt: string, d: Doc): Doc | undefined {
  const cs = adapter.list("Comment").filter((c) => c["reference_doctype"] === dt && c["reference_name"] === d.name && c["comment_type"] === "Workflow" && s(c["content"]).replace(/<[^>]+>/g, "").trim() === CHANGES_REQUESTED);
  const last = cs.sort((a, b) => stampMs(b["creation"]) - stampMs(a["creation"]))[0];
  return last && stampMs(last["creation"]) >= stampMs(d["modified"]) ? last : undefined;
}
const certsOfClaim = (claim: string) => list("Digit Client Certificate", (c) => c["claim"] === claim && num(c.docstatus) !== 2);

/** Approval status (meaning, not the raw workflow state). */
export function approvalState(dt: PayDoctype, d: Doc): PayState {
  const w = activeWorkflow(dt); const st = w ? currentState(w, d) : s(d["workflow_state"] || "Draft");
  if (num(d.docstatus) === 2 || st === "Cancelled") return S("cancelled", "Cancelled", "ملغى", "neutral");
  if (st === "Rejected") return S("rejected", "Rejected", "مرفوض", "bad");
  if (changeRequest(dt, d)) return S("changes", "Changes requested", "طلب تعديل", "warn", ["The approver asked the preparer to change it; it returns to the queue when it is edited.", "طلب المعتمد من المُعِدّ تعديله؛ يعود إلى قائمة الاعتماد عند تعديله."]);
  if (dt === "Digit Client Claim") {
    if (st === "Certified") return S("approved", "Approved", "معتمد", "ok");
    if (st === "Partly Certified") return S("approved-part", "Partly approved", "معتمد جزئيًا", "ok");
    if (st === "Submitted") return certsOfClaim(d.name).some((c) => num(c.docstatus) === 0)
      ? S("accepted", "Accepted", "مقبول", "accent", ["The client accepted the claim; its certificate is being prepared.", "قبل العميل المطالبة؛ وشهادتها قيد الإعداد."])
      : S("pending", "Awaiting approval", "بانتظار الاعتماد", "info", ["Sent to the client; waiting for the client's certificate.", "أُرسلت للعميل؛ بانتظار شهادة العميل."]);
    return S("draft", "Draft", "مسودة", "neutral");
  }
  if (dt === "Digit Client Certificate") {
    if (st === "Confirmed" || st === "Invoiced") return S("approved", "Approved", "معتمد", "ok");
    return S("pending", "Awaiting approval", "بانتظار الاعتماد", "info");
  }
  if (dt === "Digit Subcontractor Bill") {
    if (st === "Approved" || st === "Invoiced") return S("approved", "Approved", "معتمد", "ok");
    if (!s(d["supplier_invoice_no"]).trim()) return S("input", "Awaiting contractor input", "بانتظار مدخلات المقاول", "warn", ["The subcontractor's invoice number is not recorded yet.", "لم يُسجَّل رقم فاتورة مقاول الباطن بعد."]);
    const mb = get("Digit Measurement Book", d["measurement_book"]);
    if (mb && s(mb["workflow_state"]) === "Certified") return S("accepted", "Accepted", "مقبول", "accent", ["The measured quantities are certified; the bill waits for the final approval.", "الكميات المقاسة معتمدة؛ والفاتورة بانتظار الاعتماد النهائي."]);
    return S("pending", "Awaiting approval", "بانتظار الاعتماد", "info");
  }
  // client change order
  if (st === "Approved") return S("approved", "Approved", "معتمد", "ok");
  if (st === "Submitted") return S("pending", "Awaiting approval", "بانتظار الاعتماد", "info");
  const ce = get("Digit Change Event", d["source_change_event"]);
  if (ce && ce["pricing_sent_on"] && rows(ce, "pricing_responses").some((r) => !r["received_on"])) return S("input", "Awaiting contractor input", "بانتظار مدخلات المقاول", "warn", ["Subcontractor prices requested on the source change event are still missing.", "أسعار مقاولي الباطن المطلوبة في حدث التغيير المصدر لم تصل بعد."]);
  return S("draft", "Draft", "مسودة", "neutral");
}

/** Invoices that bill the document (non-cancelled). */
function invoicesOf(dt: PayDoctype, d: Doc): Doc[] {
  if (dt === "Digit Client Certificate") return invoicesOfCert(d.name);
  if (dt === "Digit Client Claim") return certsOfClaim(d.name).filter(isSubmitted).flatMap((c) => invoicesOfCert(c.name));
  if (dt === "Digit Subcontractor Bill") { const pi = get("Purchase Invoice", d["purchase_invoice"]); return pi && num(pi.docstatus) !== 2 ? [pi] : []; }
  return [];
}
/** Payment status of the approved amount (its invoice): billed, due, overdue, partly paid, paid. */
export function paymentState(dt: PayDoctype, d: Doc, on = today()): PayState {
  if (dt === "Digit Client Variation") return S("in-claims", "Billed through claims", "يُفوتر ضمن المستخلصات", "neutral", ["A change order is billed through the claims and certificates that include it.", "يُفوتر أمر التغيير ضمن المستخلصات والشهادات التي تتضمنه."]);
  const inv = invoicesOf(dt, d);
  const posted = inv.filter(isSubmitted);
  if (!inv.length) return S("not-billed", "Not invoiced", "لم يُفوتر", "neutral");
  if (!posted.length) return S("draft-invoice", "Invoice in draft", "فاتورة مسودة", "info");
  const total = sumBy(posted, payableOf), out = sumBy(posted, (x) => num(x["outstanding_amount"]));
  if (out <= 0.005) return S("paid", "Paid", "مدفوع", "ok");
  if (out < total - 0.005) return S("part-paid", "Partly paid", "مدفوع جزئيًا", "info");
  if (posted.some((x) => day(x["due_date"]) && day(x["due_date"]) < on && num(x["outstanding_amount"]) > 0)) return S("overdue", "Overdue", "متأخر السداد", "bad");
  return S("due", "Invoiced — due", "مفوتر — مستحق", "warn");
}

/** Payout status of the retention withheld on the document (release requests of its contract / work order). */
export function payoutState(dt: PayDoctype, d: Doc): PayState {
  if (dt === "Digit Client Variation") return S("na", "Not applicable", "لا ينطبق", "neutral");
  const held = dt === "Digit Subcontractor Bill" ? num(d["retention_amount"]) : dt === "Digit Client Certificate" ? num(d["retention"]) : sumBy(certsOfClaim(d.name).filter(isSubmitted), (c) => num(c["retention"]));
  if (held <= 0.005) return S("none", "No retention", "لا محتجز", "neutral");
  const contract = dt === "Digit Subcontractor Bill" ? s(d["work_order"]) : s(d["contract"]);
  const reqs = dt === "Digit Subcontractor Bill" ? list("Digit Subcontract Retention Release Request", (r) => r["work_order"] === contract && num(r.docstatus) !== 2) : list("Digit Retention Release Request", (r) => r["contract"] === contract && num(r.docstatus) !== 2);
  const released = sumBy(reqs.filter((r) => isSubmitted(r) || r["workflow_state"] === "Approved"), (r) => num(r["requested_amount"]));
  const heldAll = dt === "Digit Subcontractor Bill"
    ? sumBy(list("Digit Subcontractor Bill", (b) => b["work_order"] === contract && isSubmitted(b)), (b) => num(b["retention_amount"]))
    : sumBy(list("Digit Client Certificate", (c) => c["contract"] === contract && isSubmitted(c)), (c) => num(c["retention"]));
  const scope: [string, string] = dt === "Digit Subcontractor Bill" ? ["Retention is released per work order.", "يُصرف المحتجز على مستوى أمر العمل."] : ["Retention is released per client contract.", "يُصرف المحتجز على مستوى عقد العميل."];
  if (released > 0.005 && released >= heldAll - 0.005) return S("released", "Released", "صُرف", "ok", scope);
  if (released > 0.005) return S("part-released", "Partly released", "صُرف جزئيًا", "info", scope);
  if (reqs.some((r) => !isSubmitted(r) && r["workflow_state"] !== "Rejected")) return S("requested", "Release requested", "طلب صرف", "info", scope);
  return S("held", "Held", "محتجز", "warn", scope);
}

/** One claim's money stages (C4-02): awaiting a certificate → certified not invoiced → invoiced not collected → collected. */
export interface ClaimStageFigs { claimed: number; certified: number; invoiced: number; collected: number }
export function claimRowStages(claim: Doc): ClaimStageFigs {
  const certs = certsOfClaim(claim.name).filter(isSubmitted);
  const posted = certs.flatMap((c) => invoicesOfCert(c.name)).filter(isSubmitted);
  const netCertified = sumBy(certs, (x) => num(x["net_certified"]));
  const invoicedNet = sumBy(posted, (x) => num(x["net_total"]));
  const outstanding = sumBy(posted, (x) => num(x["outstanding_amount"]));
  const collected = sumBy(posted, (x) => payableOf(x) - num(x["outstanding_amount"]));
  const pending = s(claim["workflow_state"]) === "Submitted" && !certs.length ? num(claim["this_claim"]) : 0;
  const z = (v: number) => r2(Math.max(0, v));
  return { claimed: z(pending), certified: z(netCertified - invoicedNet), invoiced: z(outstanding), collected: z(collected) };
}

export interface Can { approve?: boolean; reject?: boolean; changes?: boolean }
interface Picked { approve?: string | undefined; reject?: string | undefined; changes?: string | undefined }
/** The workflow actions behind each decision the user may take now; never on the user's own document (no self-approval). */
function pick(dt: string, d: Doc, user: string): Picked {
  const w = activeWorkflow(dt); if (!w || num(d.docstatus) === 2 || s(d["owner"]) === user) return {};
  const ts = transitionsFor(w, d, user);
  const by = (k: string[]) => ts.find((t) => { const v = actionVerb(t.action); return !!v && k.includes(v); })?.action;
  return { approve: by(["approve"]), reject: by(["reject"]), changes: by(["changes", "return"]) };
}
export function decisionsFor(dt: string, d: Doc, user = currentUser()): Can {
  const p = pick(dt, d, user);
  // «طلب تعديل» is always open to the person who may approve or reject (a back transition when the workflow has one,
  // else a recorded change request + a task for the preparer)
  return { approve: !!p.approve, reject: !!p.reject, changes: !!(p.changes || p.approve || p.reject) };
}

/** Applies one decision with its comment and attachments (one store write). */
export function applyDecision(dt: string, d: Doc, decision: "approve" | "reject" | "changes", comment: string, files: File[], user = currentUser()): string[] {
  const p = pick(dt, d, user);
  if ((decision === "reject" || decision === "changes") && !comment.trim()) return ["A comment is required"];
  return adapter.batch(() => {
    const action = p[decision];
    if (action) {
      const r = inboxDecide(dt, d.name, action, String(d["modified"] ?? d["creation"] ?? ""), comment, user);
      if (!r.ok) return r.errors;
    } else if (decision === "changes" && (p.approve || p.reject)) {
      const now = new Date().toISOString();
      adapter.insertDoc("Comment", { comment_type: "Workflow", reference_doctype: dt, reference_name: d.name, content: CHANGES_REQUESTED, comment_email: user, owner: user, creation: now });
      const owner = s(d["owner"]);
      if (owner) adapter.insertDoc("ToDo", { allocated_to: owner, reference_type: dt, reference_name: d.name, description: `${CHANGES_REQUESTED}: ${comment.trim()}`, status: "Open", priority: "High", date: now.slice(0, 10), assigned_by: user });
    } else return ["Not permitted"];
    if (comment.trim()) adapter.insertDoc("Comment", { comment_type: "Comment", reference_doctype: dt, reference_name: d.name, content: comment.trim(), comment_email: user, owner: user, creation: new Date().toISOString() });
    for (const f of files) {
      adapter.insertDoc("File", { file_name: f.name, file_url: `/files/${f.name}`, file_size: f.size, attached_to_doctype: dt, attached_to_name: d.name, is_private: 1 });
      adapter.insertDoc("Comment", { comment_type: "Attachment", reference_doctype: dt, reference_name: d.name, content: f.name, comment_email: user, owner: user, creation: new Date().toISOString() });
    }
    return [];
  });
}
