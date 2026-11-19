/**
 * Document status strip (Enterprise Visual Round 1 §6): the one set of states every document list shows above its rows —
 * «الكل · مسودة · بانتظار الاعتماد · مستحق · متأخر · مدفوع · …» with counts (and amounts for money documents). A row's state is
 * read from the document itself (docstatus, workflow state, approval status, outstanding and due date, status field), so the
 * counts equal the rows the list shows when the same tab is picked (one function decides both).
 */
import type { Doc } from "./adapter";
import { activeWorkflow, currentState } from "./workflow";

export type StripTone = "neutral" | "warn" | "info" | "bad" | "ok";
export interface StripMeta { name: string; is_submittable?: number | undefined; fields: { fieldname?: string | undefined; fieldtype?: string | undefined }[] }
export interface StripTab { key: string; label: [string, string]; tone: StripTone; count: number; amount?: number | undefined; currency?: string | undefined }

const has = (m: StripMeta, f: string) => m.fields.some((x) => x.fieldname === f);
const AMOUNT = ["grand_total", "rounded_total", "base_grand_total", "paid_amount", "total_debit", "total_amount", "claim_amount", "this_claim", "net_certified", "net_amount", "net_pay", "gross_pay", "deal_value", "amount", "total"]; // a deal shows its deal value, not the (often empty) products total
const DUE = ["due_date", "payment_due_date", "expected_closure_date"];
/** The amount field a money document shows (the list's amount column). */
export function amountField(m: StripMeta): string | undefined {
  return AMOUNT.find((f) => m.fields.some((x) => x.fieldname === f && (x.fieldtype === "Currency" || x.fieldtype === "Float")));
}
const PENDING = /(pending|awaiting|waiting|for approval|submitted for|under review|in review|review|بانتظار|قيد الاعتماد|قيد المراجعة)/i;
const APPROVED = /^(approved|completed|closed|paid|active|accepted|won|converted|delivered|received|issued|done|معتمد|مكتمل)$/i;
const REJECTED = /^(rejected|lost|stopped|on hold|left|expired|cancelled|مرفوض)$/i;
const TODAY = () => new Date().toISOString().slice(0, 10);
/** Days a document is past its due date (0 when not overdue). */
export function overdueDays(m: StripMeta, d: Doc, today = TODAY()): number {
  if ((d.docstatus ?? 0) !== 1 && m.is_submittable) return 0;
  const out = Number(d["outstanding_amount"] ?? 0);
  const due = DUE.map((f) => String(d[f] ?? "")).find(Boolean)?.slice(0, 10);
  if (!due || !(has(m, "outstanding_amount") ? out > 0.005 : String(d["status"] ?? "") === "Overdue")) return 0;
  const n = Math.floor((Date.parse(today) - Date.parse(due)) / 86400000);
  return n > 0 ? n : 0;
}
/** The strip state of one document. */
export function stripKey(m: StripMeta, d: Doc, today = TODAY()): string {
  const ds = Number(d.docstatus ?? 0);
  if (m.is_submittable && ds === 2) return "cancelled";
  const wf = activeWorkflow(m.name);
  const wfState = wf ? currentState(wf, d) : String(d["workflow_state"] ?? "");
  const approval = String(d["approval_status"] ?? "");
  const status = String(d["status"] ?? "");
  if ((wfState && PENDING.test(wfState)) || PENDING.test(approval) || PENDING.test(status) || (status === "Open" && (has(m, "leave_approver") || has(m, "expense_approver") || has(m, "approver")))) return "pending";
  if (m.is_submittable && ds === 0) return "draft";
  if (!m.is_submittable && /^draft$/i.test(status)) return "draft";
  if (has(m, "outstanding_amount") && ds === 1) {
    if (status === "Return" || status === "Credit Note Issued" || status === "Debit Note Issued") return `s:${status}`;
    const out = Number(d["outstanding_amount"] ?? 0);
    if (out <= 0.005) return "paid";
    return overdueDays(m, d, today) > 0 ? "overdue" : "due";
  }
  if (status === "Overdue") return "overdue";
  if (status) return `s:${status}`;
  return m.is_submittable && ds === 1 ? "submitted" : "other";
}
const FIXED: Record<string, { label: [string, string]; tone: StripTone; order: number }> = {
  all: { label: ["All", "الكل"], tone: "neutral", order: 0 }, draft: { label: ["Draft", "مسودة"], tone: "neutral", order: 1 },
  pending: { label: ["Awaiting approval", "بانتظار الاعتماد"], tone: "warn", order: 2 }, due: { label: ["Due", "مستحق"], tone: "info", order: 3 },
  overdue: { label: ["Overdue", "متأخر"], tone: "bad", order: 4 }, paid: { label: ["Paid", "مدفوع"], tone: "ok", order: 5 },
  submitted: { label: ["Submitted", "معتمد"], tone: "ok", order: 7 }, other: { label: ["No status", "بدون حالة"], tone: "neutral", order: 8 }, cancelled: { label: ["Cancelled", "ملغى"], tone: "bad", order: 9 },
};
const statusTone = (s: string): StripTone => (APPROVED.test(s) ? "ok" : REJECTED.test(s) ? "bad" : /^(to |partly|partially|unpaid|open|in progress|ongoing|planned|scheduled|قيد)/i.test(s) ? "info" : "neutral");
/** The strip tabs of a list: «الكل» then each state present, in lifecycle order, with counts and amounts. */
export function stripTabs(m: StripMeta, rows: Doc[], today = TODAY()): StripTab[] {
  const af = amountField(m);
  const cur = String(rows.find((r) => r["currency"])?.["currency"] ?? "");
  const by = new Map<string, Doc[]>();
  for (const r of rows) { const k = stripKey(m, r, today); by.set(k, [...(by.get(k) ?? []), r]); }
  const sum = (a: Doc[]) => (af ? a.reduce((t, r) => t + (Number(r[af]) || 0), 0) : undefined);
  const tab = (key: string, list: Doc[]): StripTab => {
    const f = FIXED[key]; const s = key.startsWith("s:") ? key.slice(2) : "";
    return { key, label: f ? f.label : [s, s], tone: f ? f.tone : statusTone(s), count: list.length, ...(af ? { amount: sum(list), currency: cur } : {}) };
  };
  const order = (k: string) => FIXED[k]?.order ?? 6;
  return [tab("all", rows), ...[...by.entries()].sort((a, b) => order(a[0]) - order(b[0]) || b[1].length - a[1].length).map(([k, l]) => tab(k, l))];
}
/** The strip with the given states always present (a state with no row shows a real 0), kept in lifecycle order. */
export function ensureTabs(tabs: StripTab[], keys: string[]): StripTab[] {
  const [all, ...rest] = tabs; if (!all) return tabs;
  const add = keys.filter((k) => FIXED[k] && !rest.some((t) => t.key === k)).map((k): StripTab => ({ key: k, label: FIXED[k]!.label, tone: FIXED[k]!.tone, count: 0, ...(all.amount !== undefined ? { amount: 0, currency: all.currency } : {}) }));
  const order = (k: string) => FIXED[k]?.order ?? 6;
  return [all, ...[...rest, ...add].sort((a, b) => order(a.key) - order(b.key) || b.count - a.count)];
}
/** Whether a row belongs to the picked tab (the list filter and the tab count use this one rule). */
export const inStripTab = (m: StripMeta, d: Doc, key: string | undefined, today = TODAY()) => !key || key === "all" || stripKey(m, d, today) === key;
