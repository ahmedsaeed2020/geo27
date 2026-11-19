/**
 * Approval-request page read model (owner 2026-11-16 idea 6 «صفحة طلب الاعتماد»): for a change event, a client variation
 * and a client certificate — the decision timeline (who opened, priced, commented, moved and approved, then the step still
 * waiting) and the three impact figures (revenue / cost / duration; claimed / certified / not certified) with what is
 * still pending approval. Read-only over the stored records: Version state moves, Workflow and user Comments, the
 * documents' own decision fields and their linked documents; no figure is stored or invented.
 */
import { adapter, type Doc } from "@/lib/adapter";
import { approvalModel, intoVerb, moveVerb, VERBS, type VerbKind } from "@/lib/approvalPath";
import { eventStage } from "./changes";

export const DECISION_DOCTYPES = ["Digit Change Event", "Digit Client Variation", "Digit Client Certificate"] as const;
export type DecisionDoctype = (typeof DECISION_DOCTYPES)[number];
export const isDecisionDoctype = (dt: string): dt is DecisionDoctype => (DECISION_DOCTYPES as readonly string[]).includes(dt);

const s = (v: unknown) => String(v ?? "");
const num = (v: unknown) => Number(v ?? 0) || 0;
const r2 = (v: number) => Math.round(v * 100) / 100;
const rows = (d: Doc | undefined, f: string) => (Array.isArray(d?.[f]) ? (d![f] as Record<string, unknown>[]) : []);
const live = (d: Doc | undefined) => !!d && Number(d["docstatus"] ?? 0) !== 2;
const stamp = (v: unknown) => s(v).replace(" ", "T");

export type EvtKind = "open" | "comment" | "move" | "approve" | "reject" | "price" | "link" | "pending";
export interface DecisionEvt {
  key: string; at: string; kind: EvtKind;
  /** who acted: a user id, or a supplier / subcontractor id when `whoKind` says so */
  who: string; whoKind: "user" | "supplier";
  en: string; ar: string;
  /** the shared trail verb of a state move (أرسل، اعتمد، رفض، طلب تعديل، أعاد …), from lib/approvalPath.ts */
  verb?: VerbKind | undefined;
  /** the workflow state moved into (moves / decisions), shown with the app's state label */
  state?: string | undefined;
  detail?: string | undefined;
  amount?: number | undefined;
  ref?: { doctype: string; name: string } | undefined;
  /** pending step only */
  waitingH?: number | undefined; overdueH?: number | undefined;
}

const APPROVE = /(approv|certif|confirm|award|accept|invoic)/i;
const REJECT = /(reject|cancel|declin|return)/i;
const kindOf = (state: string): EvtKind => (REJECT.test(state) ? "reject" : APPROVE.test(state) ? "approve" : "move");
const stripHtml = (h: string) => h.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").trim();

/** Workflow-state moves of one document from its Version history (who / when / into which state). */
function versionMoves(dt: string, name: string): { at: string; who: string; from: string; to: string }[] {
  const out: { at: string; who: string; from: string; to: string }[] = [];
  for (const v of adapter.list("Version")) {
    if (v["ref_doctype"] !== dt || v["docname"] !== name) continue;
    let data: { changed?: unknown[] } = {}; try { data = JSON.parse(s(v["data"])) as { changed?: unknown[] }; } catch { continue; }
    for (const c of data.changed ?? []) if (Array.isArray(c) && c[0] === "workflow_state" && s(c[2])) out.push({ at: stamp(v["creation"]), who: s(v["owner"]), from: s(c[1]), to: s(c[2]) });
  }
  return out;
}

const OPEN: Record<DecisionDoctype, [string, string]> = {
  "Digit Change Event": ["created the change event", "أنشأ حدث التغيير"],
  "Digit Client Variation": ["created the change order", "أنشأ أمر التغيير"],
  "Digit Client Certificate": ["created the certificate", "أنشأ الشهادة"],
};

/** The decision timeline of one document, oldest first; the step still waiting (if any) comes last. */
export function decisionEvents(dt: DecisionDoctype, doc: Doc, now = Date.now()): DecisionEvt[] {
  const out: DecisionEvt[] = [];
  const push = (e: DecisionEvt) => { if (e.at) out.push(e); };
  const opener = s(doc["raised_by"] || doc["owner"]);
  push({ key: "open", at: stamp(doc["creation"] || doc["ce_date"] || doc["requested_on"] || doc["cert_date"]), kind: "open", who: opener, whoKind: "user", en: OPEN[dt][0], ar: OPEN[dt][1] });

  // state moves: Version history, then the workflow log (Comment «Workflow») where no Version records the same move
  const moves = versionMoves(dt, doc.name);
  // every move reads with the shared trail verb (C4-03): the workflow action from → to, else the move's direction
  const kindOfVerb = (k: VerbKind, to: string): EvtKind => (k === "reject" || k === "cancel" || k === "return" || k === "changes" ? "reject" : k === "approve" ? "approve" : kindOf(to));
  moves.forEach((m, i) => { const k = moveVerb(dt, m.from, m.to); push({ key: `v${i}`, at: m.at, kind: kindOfVerb(k, m.to), who: m.who, whoKind: "user", en: VERBS[k][0], ar: VERBS[k][1], verb: k, state: m.to }); });
  const comments = adapter.list("Comment").filter((c) => c["reference_doctype"] === dt && c["reference_name"] === doc.name);
  for (const c of comments) {
    const at = stamp(c["creation"]); const who = s(c["comment_email"] || c["owner"]);
    if (c["comment_type"] === "Workflow") {
      const to = stripHtml(s(c["content"]));
      if (moves.some((m) => m.to === to && Math.abs(Date.parse(m.at) - Date.parse(at)) < 5 * 60000)) continue;
      const k = intoVerb(dt, to);
      push({ key: `w${c.name}`, at, kind: kindOfVerb(k, to), who, whoKind: "user", en: VERBS[k][0], ar: VERBS[k][1], verb: k, state: to });
    } else if (c["comment_type"] === "Comment" || !c["comment_type"]) {
      push({ key: `c${c.name}`, at, kind: "comment", who, whoKind: "user", en: "commented", ar: "علّق", detail: stripHtml(s(c["content"])) });
    }
  }
  const moved = (st: RegExp) => out.some((e) => e.state && st.test(e.state));

  if (dt === "Digit Change Event") {
    if (doc["pricing_sent_on"]) push({ key: "price-sent", at: stamp(doc["pricing_sent_on"]), kind: "price", who: s(doc["raised_by"] || doc["owner"]), whoKind: "user", en: "sent the pricing request to subcontractors", ar: "أرسل طلب التسعير لمقاولي الباطن" });
    rows(doc, "pricing_responses").forEach((r, i) => {
      if (!r["received_on"]) return;
      push({ key: `price-${i}`, at: stamp(r["received_on"]), kind: "price", who: s(r["supplier"]), whoKind: "supplier", en: "sent a price", ar: "أرسل سعرًا", amount: num(r["quoted_amount"]), detail: r["quoted_days"] ? String(num(r["quoted_days"])) : undefined });
    });
    const st = s(doc["workflow_state"]);
    if (doc["decided_on"] && !moved(st === "Rejected" ? /reject/i : /approv/i)) push({ key: "decided", at: stamp(doc["decided_on"]), kind: st === "Rejected" ? "reject" : "approve", who: s(doc["decided_by"]), whoKind: "user", en: st === "Rejected" ? "rejected the change event" : "approved the change event", ar: st === "Rejected" ? "رفض حدث التغيير" : "اعتمد حدث التغيير", detail: s(doc["decision_note"]) || undefined });
    const vn = s(doc["associated_variation"] || doc["variation"]); const v = vn ? adapter.get("Digit Client Variation", vn) : undefined;
    if (v) {
      push({ key: "vo", at: stamp(v["creation"] || v["requested_on"]), kind: "link", who: s(v["owner"]), whoKind: "user", en: "created the client change order", ar: "أنشأ أمر التغيير للعميل", ref: { doctype: "Digit Client Variation", name: v.name } });
      if (v["approved_on"]) push({ key: "vo-ok", at: stamp(v["approved_on"]), kind: "approve", who: s(v["approved_by"]), whoKind: "user", en: "approved the change order (client)", ar: "اعتمد أمر التغيير (العميل)", ref: { doctype: "Digit Client Variation", name: v.name } });
    }
  } else if (dt === "Digit Client Variation") {
    const ev = s(doc["source_change_event"]); const e = ev ? adapter.get("Digit Change Event", ev) : undefined;
    if (e) push({ key: "src", at: stamp(e["creation"] || e["ce_date"]), kind: "link", who: s(e["raised_by"] || e["owner"]), whoKind: "user", en: "created the source change event", ar: "أنشأ حدث التغيير المصدر", ref: { doctype: "Digit Change Event", name: e.name } });
    if (doc["approved_on"] && !moved(/approv/i)) push({ key: "approved", at: stamp(doc["approved_on"]), kind: "approve", who: s(doc["approved_by"]), whoKind: "user", en: "approved the change order", ar: "اعتمد أمر التغيير", detail: s(doc["decision_note"]) || undefined });
    for (const b of adapter.list("Digit Budget Revision").filter((x) => x["linked_variation"] === doc.name && live(x)))
      push({ key: `brev-${b.name}`, at: stamp(b["approved_on"] || b["creation"]), kind: "link", who: s(b["approved_by"] || b["owner"]), whoKind: "user", en: "revised the budget", ar: "عدّل الموازنة", ref: { doctype: "Digit Budget Revision", name: b.name }, amount: rows(b, "deltas").reduce((a, r) => a + num(r["delta_amount"]), 0) });
  } else {
    const cl = adapter.get("Digit Client Claim", s(doc["claim"]));
    if (cl) push({ key: "claim", at: stamp(cl["claim_date"] || cl["creation"]), kind: "link", who: s(cl["owner"]), whoKind: "user", en: "sent the claim", ar: "أرسل المطالبة", ref: { doctype: "Digit Client Claim", name: cl.name } });
    const st = s(doc["workflow_state"]);
    if (doc["cert_date"] && st !== "Draft" && !moved(/confirm|certif/i)) push({ key: "certified", at: stamp(doc["cert_date"]), kind: "approve", who: s(doc["modified_by"] || doc["owner"]), whoKind: "user", en: "approved the certificate", ar: "اعتمد الشهادة", detail: s(doc["reviewer"]) ? `${s(doc["reviewer"])}${doc["external_ref"] ? ` · ${s(doc["external_ref"])}` : ""}` : undefined });
    const si = s(doc["sales_invoice"]); const inv = si ? adapter.get("Sales Invoice", si) : undefined;
    if (inv) push({ key: "si", at: stamp(inv["posting_date"] || inv["creation"]), kind: "link", who: s(inv["owner"]), whoKind: "user", en: "invoiced the certificate", ar: "فوتر الشهادة", ref: { doctype: "Sales Invoice", name: si } });
  }

  // a business date without a time sorts at midday, so same-day stamped events (e.g. the certificate prepared at 09:00) come first
  const key = (e: DecisionEvt) => (e.at.length <= 10 ? `${e.at}T12:00` : e.at);
  out.sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0));
  const m = approvalModel(dt, doc, undefined, now);
  if (m?.current && !REJECT.test(s(doc["workflow_state"]))) {
    const c = m.current;
    out.push({ key: "pending", at: stamp(c.since), kind: "pending", who: s(c.approver), whoKind: "user", en: "is to decide", ar: "بانتظار قراره", state: c.state, waitingH: c.waitingH, overdueH: c.overdueH });
  }
  return out;
}

export type ImpactKey = "revenue" | "cost" | "time" | "claimed" | "certified" | "held";
export interface ImpactFig {
  key: ImpactKey; en: string; ar: string; unit: "money" | "days";
  /** null = not determined yet (shown as such, never as zero) */
  value: number | null; pending: boolean;
  /** the line under the figure: label parts, each optionally followed by an amount the screen formats */
  note?: NotePart[] | undefined;
}
export interface NotePart { en: string; ar: string; amount?: number | undefined }

const priceNote = (doc: Doc): NotePart[] => {
  const rs = rows(doc, "pricing_responses"); const got = rs.filter((r) => r["received_on"]);
  if (!rs.length) return [{ en: "subcontract pricing not requested", ar: "لم يُطلب تسعير من مقاولي الباطن" }];
  const low = got.length ? Math.min(...got.map((r) => num(r["quoted_amount"]))) : undefined;
  return [{ en: `${got.length} of ${rs.length} prices received`, ar: `${got.length} من ${rs.length} أسعار مستلمة` }, ...(low !== undefined ? [{ en: "lowest", ar: "الأقل", amount: low }] : [])];
};

/** The three impact cards of the decision page. */
export function decisionImpact(dt: DecisionDoctype, doc: Doc): ImpactFig[] {
  if (dt === "Digit Client Certificate") {
    const ls = rows(doc, "lines");
    const claimed = r2(ls.reduce((a, l) => a + num(l["claimed_qty"]) * num(l["rate"]), 0));
    const certified = r2(num(doc["gross_this"]) || ls.reduce((a, l) => a + num(l["amount"]), 0));
    const rej = r2(ls.reduce((a, l) => a + num(l["rejected_qty"]) * num(l["rate"]), 0)), dis = r2(ls.reduce((a, l) => a + num(l["disputed_qty"]) * num(l["rate"]), 0));
    const pending = s(doc["workflow_state"] || "Draft") === "Draft" && live(doc);
    const held = r2(Math.max(0, claimed - certified));
    return [
      { key: "claimed", en: "Claimed", ar: "المطالَب", unit: "money", value: claimed, pending: false, note: [{ en: `${ls.length} lines`, ar: `${ls.length} بند` }] },
      { key: "certified", en: "Certified", ar: "المعتمد", unit: "money", value: certified, pending, note: [{ en: "net after deductions", ar: "الصافي بعد الخصومات", amount: r2(num(doc["net_certified"])) }] },
      { key: "held", en: "Not certified", ar: "غير المعتمد", unit: "money", value: held, pending, note: [{ en: "rejected", ar: "مرفوض", amount: rej }, { en: "disputed", ar: "متنازع عليه", amount: dis }] },
    ];
  }
  if (dt === "Digit Change Event") {
    const stage = eventStage(doc); const closed = stage === "Closed";
    const decided = ["Approved – not transferred", "In pending variation", "Approved variation"].includes(stage);
    const vn = s(doc["associated_variation"] || doc["variation"]); const v = vn ? adapter.get("Digit Client Variation", vn) : undefined;
    const cost = r2(num(doc["total_cost_rom"]) || num(doc["cost_impact"]) || rows(doc, "lines").reduce((a, l) => a + (s(l["direction"]) === "Omission" ? -1 : 1) * num(l["amount"]), 0));
    const romRev = r2(num(doc["total_revenue_rom"]));
    const vAmt = v && live(v) ? r2(num(v["amount"]) || rows(v, "lines").reduce((a, l) => a + num(l["amount"] ?? num(l["qty"]) * num(l["rate"])), 0)) : null;
    const revenue = vAmt ?? (romRev || null);
    const days = num(doc["time_impact_days"]);
    const closedNote = [{ en: "Rejected / closed — no impact", ar: "مرفوض / مغلق — بلا أثر" }];
    return [
      { key: "revenue", en: "Revenue impact", ar: "أثر الإيراد", unit: "money", value: revenue, pending: !closed && stage !== "Approved variation",
        note: closed ? closedNote : vAmt != null ? (s(v!["workflow_state"]) === "Approved" ? [{ en: "client change order approved", ar: "أمر التغيير معتمد من العميل" }] : [{ en: "client change order awaiting approval", ar: "أمر التغيير بانتظار اعتماد العميل" }]) : romRev ? [{ en: "rough estimate — no client change order yet", ar: "تقدير أولي — لم يُنشأ أمر تغيير للعميل" }] : [{ en: "not priced to the client yet", ar: "لم يُسعّر للعميل بعد" }] },
      { key: "cost", en: "Cost impact", ar: "أثر التكلفة", unit: "money", value: cost || null, pending: !closed && !decided, note: closed ? closedNote : priceNote(doc) },
      { key: "time", en: "Duration impact", ar: "أثر المدة", unit: "days", value: days || (closed ? 0 : null), pending: !closed && !decided, note: closed ? closedNote : undefined },
    ];
  }
  // client variation
  const st = s(doc["workflow_state"] || "Draft"); const out = st === "Rejected" || !live(doc); const internal = s(doc["change_kind"]) === "Internal Scope Change";
  const rev = internal ? 0 : r2(num(doc["amount"]) || rows(doc, "lines").reduce((a, l) => a + num(l["amount"] ?? num(l["qty"]) * num(l["rate"])), 0));
  const ev = s(doc["source_change_event"]); const e = ev ? adapter.get("Digit Change Event", ev) : undefined;
  const cost = r2(num(doc["cost_rom"]) || num(e?.["total_cost_rom"]) || num(e?.["cost_impact"]));
  const pending = !out && st !== "Approved";
  const outNote = [{ en: "Rejected — no impact", ar: "مرفوض — بلا أثر" }];
  return [
    { key: "revenue", en: "Revenue impact", ar: "أثر الإيراد", unit: "money", value: rev, pending, note: out ? outNote : internal ? [{ en: "internal scope change — contract value unchanged", ar: "تغيير داخلي — قيمة العقد لا تتغير" }] : rev && cost ? [{ en: "margin", ar: "الهامش", amount: r2(rev - cost) }] : undefined },
    { key: "cost", en: "Cost impact", ar: "أثر التكلفة", unit: "money", value: cost || null, pending, note: out ? outNote : e ? [{ en: "rough estimate of the source change event", ar: "تقدير حدث التغيير المصدر" }] : undefined },
    { key: "time", en: "Duration impact", ar: "أثر المدة", unit: "days", value: num(doc["time_days"]) || null, pending, note: out ? outNote : undefined },
  ];
}
