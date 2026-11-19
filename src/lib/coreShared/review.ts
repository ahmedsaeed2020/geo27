/**
 * DIGIT shared Core review before posting (Part B: F2-b reviewer role before posting; IN8-b / INV-011-b stock variance approval).
 * The company Control Policy says when a document needs a second person: a journal entry at or above the review amount, or a
 * stock reconciliation whose value difference reaches the approval amount. The reviewer must hold the policy role and must
 * not be the preparer; the decision is a Core "Digit Review Stamp" record (with a timeline comment), and submit is refused
 * until an Approved stamp for the current amount exists. Nothing in the native document changes.
 */
import { adapter, registerDocHook, type Doc } from "@/lib/adapter";
import { currentUser, userRoles } from "@/lib/session";
import { qtyAt, rateAt } from "@/lib/stock";
import { CORE_DT } from "./doctypes";
import { controlPolicy } from "./controls";

export type Bi = [string, string];
export type ReviewKind = "Journal review" | "Stock variance approval";
const s = (v: unknown) => String(v ?? "");
const n = (v: unknown) => Number(v) || 0;
const r2 = (x: number) => Math.round(x * 100) / 100;
const rows = (d: Doc | undefined, f = "items") => (Array.isArray(d?.[f]) ? (d![f] as Doc[]) : []);
const nowStamp = () => new Date().toISOString().slice(0, 19).replace("T", " ");

/** Value difference a stock reconciliation would post (new qty × rate − current qty × rate, per line). */
export function stockVarianceValue(d: Doc): number {
  const date = s(d["posting_date"]) || "9999-12-31"; let t = 0;
  for (const r of rows(d)) {
    const item = s(r["item_code"]); const wh = s(r["warehouse"]) || s(d["set_warehouse"]); if (!item || !wh) continue;
    const cq = qtyAt(item, wh, date, d.name), cr = rateAt(item, wh, date);
    const q = r["qty"] === "" || r["qty"] === undefined || r["qty"] === null ? cq : n(r["qty"]); const rt = r["valuation_rate"] === "" || r["valuation_rate"] === undefined || r["valuation_rate"] === null ? cr : n(r["valuation_rate"]);
    t += q * rt - cq * cr;
  }
  return r2(t);
}
const jeAmount = (d: Doc) => r2(n(d["total_debit"]) || rows(d, "accounts").reduce((a, r) => a + n(r["debit_in_account_currency"] ?? r["debit"]), 0));

export interface ReviewNeed { kind: ReviewKind; amount: number; threshold: number; role: string; required: boolean; enabled: boolean }
/** Whether the document needs a review stamp under its company's policy (null when the rule does not cover the type). */
export function reviewNeed(dt: string, d: Doc): ReviewNeed | null {
  const pol = controlPolicy(s(d["company"]));
  if (dt === "Journal Entry") { const amount = jeAmount(d); const enabled = !!pol.review_before_posting; return { kind: "Journal review", amount, threshold: pol.journal_review_amount, role: pol.journal_reviewer_role, enabled, required: enabled && amount >= pol.journal_review_amount }; }
  if (dt === "Stock Reconciliation") { const amount = Math.abs(stockVarianceValue(d)); const enabled = !!pol.variance_approval_required; return { kind: "Stock variance approval", amount, threshold: pol.stock_variance_approval_amount, role: pol.stock_variance_role, enabled, required: enabled && amount >= pol.stock_variance_approval_amount }; }
  return null;
}
export const stampsOf = (dt: string, name: string) => adapter.list(CORE_DT.reviewStamp).filter((x) => x["reference_doctype"] === dt && x["reference_name"] === name).sort((a, b) => s(b["reviewed_on"]).localeCompare(s(a["reviewed_on"])) || b.name.localeCompare(a.name));
export interface ReviewState { need: ReviewNeed | null; stamp?: Doc; approved: boolean; stale: boolean }
export function reviewState(dt: string, d: Doc): ReviewState {
  const need = reviewNeed(dt, d); const stamp = d.name ? stampsOf(dt, d.name)[0] : undefined;
  const stale = !!stamp && stamp["decision"] === "Approved" && Math.abs(n(stamp["amount"]) - (need?.amount ?? 0)) > 0.005;
  return { need, ...(stamp ? { stamp } : {}), approved: !!stamp && stamp["decision"] === "Approved" && !stale, stale };
}
/** Who may stamp: the policy role (or System Manager), never the preparer. */
export function mayReview(dt: string, d: Doc, user = currentUser()): { ok: true } | { ok: false; reason: Bi } {
  const need = reviewNeed(dt, d); if (!need) return { ok: false, reason: ["This document type has no review rule.", "لا توجد قاعدة مراجعة لهذا النوع."] };
  if (n(d.docstatus) !== 0 || d["__islocal"]) return { ok: false, reason: ["Save the draft first; only a saved draft can be reviewed.", "احفظ المسودة أولًا؛ تُراجع المسودة المحفوظة فقط."] };
  if (s(d["owner"]) && s(d["owner"]) === user) return { ok: false, reason: ["The preparer cannot review their own document.", "لا يراجع المُعِدّ مستنده."] };
  const roles = userRoles(user); if (user !== "Administrator" && !roles.includes(need.role) && !roles.includes("System Manager")) return { ok: false, reason: [`Only a ${need.role} can review this document.`, `لا يراجع هذا المستند إلا ${need.role}.`] };
  return { ok: true };
}
export function recordReview(dt: string, name: string, decision: "Approved" | "Returned", note: string, user = currentUser()): { ok: true; name: string } | { ok: false; reason: Bi } {
  const d = adapter.get(dt, name); if (!d) return { ok: false, reason: ["Document not found.", "المستند غير موجود."] };
  const m = mayReview(dt, d, user); if (!m.ok) return m;
  if (decision === "Returned" && !note.trim()) return { ok: false, reason: ["Say what must change before it is reviewed again.", "اذكر ما يجب تعديله قبل المراجعة مجددًا."] };
  const need = reviewNeed(dt, d)!; const on = nowStamp();
  const st = adapter.insertDoc(CORE_DT.reviewStamp, { kind: need.kind, reference_doctype: dt, reference_name: name, decision, reviewed_by: user, reviewed_on: on, amount: need.amount, note });
  adapter.insertDoc("Comment", { name: `CMT-${st.name}`, comment_type: "Comment", reference_doctype: dt, reference_name: name, comment_email: user, owner: user, creation: on,
    content: `${need.kind}: ${decision}${note ? ` — ${note}` : ""} (${st.name})` });
  return { ok: true, name: st.name };
}
/** Submit refusal while the rule applies and no current Approved stamp exists. */
export function reviewErrors(dt: string, d: Doc): string[] {
  const st = reviewState(dt, d); if (!st.need?.required || st.approved) return [];
  const what = st.need.kind === "Journal review" ? `Journal Entry ${d.name} of ${st.need.amount} is at or above the review amount ${st.need.threshold}` : `Stock Reconciliation ${d.name} changes stock value by ${st.need.amount}, at or above the approval amount ${st.need.threshold}`;
  return [`${what}: a ${st.need.role} other than the preparer must approve it before it is submitted${st.stale ? " (the amount changed after the last approval)" : st.stamp?.["decision"] === "Returned" ? " (it was returned for changes)" : ""}.`];
}
let hooked = false;
export function registerReviewHooks() {
  if (hooked) return; hooked = true;
  for (const dt of ["Journal Entry", "Stock Reconciliation"]) registerDocHook(dt, (doc, before) => {
    if (n(doc.docstatus) !== 1 || n(before?.docstatus) === 1) return { doc };
    const e = reviewErrors(dt, doc); return e.length ? { doc, errors: e } : { doc };
  });
}
