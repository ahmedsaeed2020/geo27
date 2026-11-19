/**
 * Shared receivables / payables read model (moved from DIGIT Pro P3, owner 2026-11-17, so DIGIT CRM Customer 360 shows the
 * same invoices-by-status strip and payment score — CRM C3). Rule: invoiced ≠ collected; ordered ≠ received ≠ billed ≠ paid.
 *  - invoice status strip: the shared Enterprise strip over a company's (or every readable company's, company "") sales /
 *    purchase invoices posted on or before the as-of date, cancelled excluded, the five lifecycle states always shown; each
 *    tab's amount is the invoice total (grand_total), so the tabs add up to the list total.
 *  - payment score: the party's last invoices; settled on the latest submitted payment (Payment Entry reference or Journal
 *    Entry account row) that references the invoice; on time when settled on or before the due date.
 *  - approval and payment states as two separate states of one invoice.
 * A party is one name or a list of names (one CRM company can map to several Customers). Read only; nothing here writes.
 */
import type { Doc } from "@/lib/adapter";
import { scopedList } from "@/lib/scope";
import { currentUser } from "@/lib/session";
import { activeWorkflow, currentState } from "@/lib/workflow";
import { overdueDays, stripTabs, ensureTabs, type StripMeta, type StripTab } from "@/lib/statusStrip";
import type { PillState } from "@/components/enterprise/kit/ApprovalQueue";

export type Side = "receivable" | "payable";
export const sideDoctype = (side: Side) => (side === "receivable" ? "Sales Invoice" : "Purchase Invoice");
/** One party, several parties (a CRM company linked to more than one Customer) or none (every party). */
export type PartySel = string | readonly string[] | undefined;
const hasParty = (p: PartySel) => (typeof p === "string" ? !!p : !!p?.length);
const partyMatch = (d: Doc, pf: string, p: PartySel) => !hasParty(p) || (typeof p === "string" ? d[pf] === p : p!.includes(String(d[pf] ?? "")));

const n = (v: unknown) => Number(v) || 0;
const s = (v: unknown) => String(v ?? "");
const r2 = (v: number) => Math.round(v * 100) / 100;
const d10 = (v: unknown) => s(v).slice(0, 10);
const days = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
const todayIso = () => new Date().toISOString().slice(0, 10);
export const partyField = (side: Side) => (side === "receivable" ? "customer" : "supplier");

/** The five states the receivables / payables strip always shows (P3-01). */
export const AR_STRIP_KEYS = ["draft", "pending", "due", "overdue", "paid"] as const;

/** Invoices of the company posted on or before the as-of date (cancelled excluded), optionally of one party. */
export function invoiceDocs(side: Side, company: string, asOf = todayIso(), user = currentUser(), party?: PartySel): Doc[] {
  const pf = partyField(side);
  return scopedList(sideDoctype(side), user).filter((d) => (!company || d["company"] === company) && n(d.docstatus) !== 2 && d10(d["posting_date"]) <= asOf && partyMatch(d, pf, party))
    .sort((a, b) => d10(b["posting_date"]).localeCompare(d10(a["posting_date"])) || b.name.localeCompare(a.name));
}
/** P3-01 strip tabs (counts + invoice-total amounts) of a set of invoices. */
export function invoiceStrip(meta: StripMeta, docs: Doc[], today = todayIso()): StripTab[] {
  return ensureTabs(stripTabs(meta, docs, today), [...AR_STRIP_KEYS]);
}
/** collected (receivable) / paid (payable) on a submitted invoice = total − outstanding; nothing for drafts. */
export const settledPart = (d: Doc) => (n(d.docstatus) === 1 ? Math.max(0, r2((n(d["rounded_total"]) || n(d["grand_total"])) - n(d["outstanding_amount"]))) : 0);
export const openPart = (d: Doc) => (n(d.docstatus) === 1 ? r2(n(d["outstanding_amount"])) : 0);

/* ------------------------------------------------------------------ P3-06 approval / payment states ------------------------------------------------------------------ */
const P = (key: string, en: string, ar: string, tone: PillState["tone"], hint?: [string, string]) => ({ key, en, ar, tone, hint });
export type InvState = ReturnType<typeof P>;
const PENDING = /(pending|awaiting|waiting|for approval|review|بانتظار|قيد)/i;
export function invoiceApproval(dt: string, d: Doc): InvState {
  if (n(d.docstatus) === 2) return P("cancelled", "Cancelled", "ملغاة", "neutral");
  const wf = activeWorkflow(dt); const st = wf ? currentState(wf, d) : s(d["workflow_state"]);
  if (st && /rejected/i.test(st)) return P("rejected", "Rejected", "مرفوضة", "bad");
  if (st && PENDING.test(st)) return P("pending", "Awaiting approval", "بانتظار الاعتماد", "info", [`Workflow state: ${st}`, `حالة سير العمل: ${st}`]);
  if (n(d.docstatus) === 0) return P("draft", "Draft", "مسودة", "neutral", ["Not submitted yet — it does not count in the ledger.", "لم تُعتمد بعد — لا تدخل في الدفاتر."]);
  return P("approved", "Approved", "معتمدة", "ok");
}
export function invoicePayment(dt: string, d: Doc, today = todayIso()): InvState {
  if (n(d.docstatus) === 2) return P("na", "Not applicable", "لا ينطبق", "neutral");
  if (n(d.docstatus) === 0) return P("before", "After approval", "بعد الاعتماد", "neutral", ["Payment starts once the invoice is approved.", "يبدأ السداد بعد اعتماد الفاتورة."]);
  if (n(d["is_return"]) || s(d["status"]) === "Return") return P("return", "Return", "مرتجع", "neutral");
  const out = n(d["outstanding_amount"]), total = n(d["grand_total"]);
  if (out <= 0.005) return P("paid", dt === "Purchase Invoice" ? "Paid" : "Collected", dt === "Purchase Invoice" ? "مدفوعة" : "محصّلة", "ok");
  if (dt === "Purchase Invoice" && n(d["on_hold"])) return P("hold", "On hold", "موقوفة", "warn", d["release_date"] ? [`Until ${d10(d["release_date"])}`, `حتى ${d10(d["release_date"])}`] : undefined);
  const late = overdueDays({ name: dt, is_submittable: 1, fields: [{ fieldname: "outstanding_amount" }] }, d, today);
  const part = out < total - 0.005;
  if (late > 0) return P("overdue", `Overdue ${late} days`, `متأخرة ${late} يوم`, "bad", part ? ["Partly paid", "مدفوعة جزئيًا"] : undefined);
  if (part) return P("partly", dt === "Purchase Invoice" ? "Partly paid" : "Partly collected", dt === "Purchase Invoice" ? "مدفوعة جزئيًا" : "محصّلة جزئيًا", "info");
  const left = days(today, d10(d["due_date"]) || today);
  return left <= 7 ? P("due-soon", `Due in ${left} days`, left <= 0 ? "مستحقة اليوم" : `مستحقة خلال ${left} يوم`, "warn") : P("not-due", "Not due yet", "غير مستحقة بعد", "neutral");
}

/* ------------------------------------------------------------------ P3-03 payment score ------------------------------------------------------------------ */
export type TickState = "ontime" | "late" | "overdue" | "open";
export interface ScoreItem { name: string; posting: string; due: string; settled: string | null; state: TickState; days: number; amount: number }
export interface PartyScore { items: ScoreItem[]; score: number | null; ontime: number; late: number; overdue: number; open: number; avgLate: number | null }
/** Latest settling date per invoice from submitted Payment Entries (references) and Journal Entries (account rows). */
export function settleDates(user = currentUser()): Map<string, string> {
  const out = new Map<string, string>();
  const put = (inv: string, d: string) => { if (inv && d && (!out.has(inv) || d > out.get(inv)!)) out.set(inv, d); };
  for (const p of scopedList("Payment Entry", user)) if (n(p.docstatus) === 1) for (const r of (p["references"] as Doc[] | undefined) ?? []) put(s(r["reference_name"]), d10(p["posting_date"]));
  for (const j of scopedList("Journal Entry", user)) if (n(j.docstatus) === 1) for (const a of (j["accounts"] as Doc[] | undefined) ?? []) if (/Invoice$/.test(s(a["reference_type"]))) put(s(a["reference_name"]), d10(j["posting_date"]));
  return out;
}
/** `party` empty = every party of the company (the page-level card), last `count` invoices. */
export function partyScore(side: Side, company: string, party: PartySel, user = currentUser(), today = todayIso(), count = hasParty(party) ? 12 : 24): PartyScore {
  const pf = partyField(side);
  const docs = scopedList(sideDoctype(side), user).filter((d) => (!company || d["company"] === company) && partyMatch(d, pf, party) && n(d.docstatus) === 1 && !n(d["is_return"]) && n(d["grand_total"]) > 0 && d10(d["posting_date"]) <= today)
    .sort((a, b) => d10(b["posting_date"]).localeCompare(d10(a["posting_date"])) || b.name.localeCompare(a.name)).slice(0, count).reverse();
  const settle = docs.length ? settleDates(user) : new Map<string, string>();
  const items = docs.map((d): ScoreItem => {
    const due = d10(d["due_date"]) || d10(d["posting_date"]); const out = n(d["outstanding_amount"]);
    if (out <= 0.005) { const st = settle.get(d.name) ?? null; const late = st ? days(due, st) : 0; return { name: d.name, posting: d10(d["posting_date"]), due, settled: st, state: late > 0 ? "late" : "ontime", days: Math.max(0, late), amount: r2(n(d["grand_total"])) }; }
    const over = days(due, today);
    return { name: d.name, posting: d10(d["posting_date"]), due, settled: null, state: over > 0 ? "overdue" : "open", days: Math.max(0, over), amount: r2(out) };
  });
  const c = (k: TickState) => items.filter((i) => i.state === k).length;
  const ontime = c("ontime"), late = c("late"), overdue = c("overdue"), open = c("open");
  const decided = ontime + late + overdue; const lates = items.filter((i) => i.state === "late");
  return { items, score: decided ? Math.round((ontime / decided) * 100) : null, ontime, late, overdue, open, avgLate: lates.length ? Math.round(lates.reduce((a, i) => a + i.days, 0) / lates.length) : null };
}
