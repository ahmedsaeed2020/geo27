/**
 * DIGIT Core control records (owner DEC-01 / OWN-60): invoice disputes, per-company control policy (matching tolerances,
 * review thresholds, discount and margin limits), period close tasks and correction tasks. Records live in the shared
 * Core DocTypes (doctypes.ts); every app reads the same rules. Writes go through the adapter only.
 */
import { adapter, type Doc } from "@/lib/adapter";
import { CORE_DT } from "./doctypes";

type Bi = [string, string];
const str = (v: unknown) => (v === undefined || v === null ? "" : String(v));
const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const today = () => new Date().toISOString().slice(0, 10);

/* ------------------------------------------------------------------ disputes ------------------------------------------------------------------ */
export interface Dispute { name: string; company: string; invoice_type: string; invoice: string; party_type: string; party: string; disputed_amount: number; status: string; opened_on: string; reason: string }
const asDispute = (d: Doc): Dispute => ({ name: d.name, company: str(d["company"]), invoice_type: str(d["invoice_type"]), invoice: str(d["invoice"]), party_type: str(d["party_type"]), party: str(d["party"]),
  disputed_amount: num(d["disputed_amount"]), status: str(d["status"]) || "Open", opened_on: str(d["opened_on"]), reason: str(d["reason"]) });
export const OPEN_DISPUTE = ["Open", "Under Review"];
export function disputes(f: { invoice?: string; company?: string; type?: string } = {}): Dispute[] {
  return adapter.list(CORE_DT.dispute).map(asDispute).filter((d) => (!f.invoice || d.invoice === f.invoice) && (!f.company || d.company === f.company) && (!f.type || d.invoice_type === f.type));
}
export const openDisputes = (f: { invoice?: string; company?: string; type?: string } = {}) => disputes(f).filter((d) => OPEN_DISPUTE.includes(d.status));
export function raiseDispute(dt: "Sales Invoice" | "Purchase Invoice", inv: Doc, reason: string, amount: number): { ok: true; name: string } | { ok: false; reason: Bi } {
  if (Number(inv["docstatus"]) !== 1) return { ok: false, reason: ["Only a submitted invoice can be disputed.", "لا يمكن فتح نزاع إلا على فاتورة معتمدة."] };
  if (!reason.trim()) return { ok: false, reason: ["Enter the reason for the dispute.", "أدخل سبب النزاع."] };
  const max = Math.abs(num(inv["grand_total"]));
  if (!(amount > 0) || amount > max + 0.005) return { ok: false, reason: [`The disputed amount must be above 0 and not more than the invoice total (${max.toFixed(2)}).`, `يجب أن يكون المبلغ المتنازع عليه أكبر من صفر ولا يتجاوز إجمالي الفاتورة (${max.toFixed(2)}).`] };
  if (openDisputes({ invoice: inv.name }).length) return { ok: false, reason: ["This invoice already has an open dispute.", "توجد على هذه الفاتورة نزاع مفتوح بالفعل."] };
  const party_type = dt === "Sales Invoice" ? "Customer" : "Supplier";
  const d = adapter.insertDoc(CORE_DT.dispute, { company: str(inv["company"]), invoice_type: dt, invoice: inv.name, party_type, party: str(inv[dt === "Sales Invoice" ? "customer" : "supplier"]), disputed_amount: amount, status: "Open", opened_on: today(), reason: reason.trim() });
  return { ok: true, name: d.name };
}
export function resolveDispute(name: string, status: "Resolved" | "Rejected" = "Resolved") { adapter.update(CORE_DT.dispute, name, { status, resolved_on: today() }); }

/* ------------------------------------------------------------------ control policy ------------------------------------------------------------------ */
export interface ControlPolicy { company: string; price_tolerance_pct: number; qty_tolerance_pct: number; amount_tolerance: number; journal_review_amount: number; journal_reviewer_role: string;
  stock_variance_approval_amount: number; stock_variance_role: string; max_discount_pct: number; min_margin_pct: number; bank_match_days: number;
  review_before_posting: number; variance_approval_required: number; quarantine_warehouse: string; landed_cost_foreign: number; rfq_reminder_days: number; enforce_contract_price: number; contract_price_tolerance: number;
  custody_approval_required: number; custody_approver_role: string; asset_verification_days: number; configured: boolean }
/** Safest defaults when a company has no policy record yet (owner: block / require approval). */
export const POLICY_DEFAULTS: Omit<ControlPolicy, "company" | "configured"> = { price_tolerance_pct: 2, qty_tolerance_pct: 5, amount_tolerance: 50, journal_review_amount: 50000, journal_reviewer_role: "Accounts Manager",
  stock_variance_approval_amount: 5000, stock_variance_role: "Stock Manager", max_discount_pct: 10, min_margin_pct: 15, bank_match_days: 5,
  review_before_posting: 0, variance_approval_required: 0, quarantine_warehouse: "", landed_cost_foreign: 1, rfq_reminder_days: 2, enforce_contract_price: 1, contract_price_tolerance: 0,
  custody_approval_required: 0, custody_approver_role: "Accounts Manager", asset_verification_days: 365 };
export function controlPolicy(company: string): ControlPolicy {
  const d = adapter.get(CORE_DT.controlPolicy, company);
  if (!d) return { company, ...POLICY_DEFAULTS, configured: false };
  const g = <K extends keyof typeof POLICY_DEFAULTS>(k: K) => (d[k] === undefined || d[k] === null || d[k] === "" ? POLICY_DEFAULTS[k] : (typeof POLICY_DEFAULTS[k] === "number" ? num(d[k]) : str(d[k]))) as (typeof POLICY_DEFAULTS)[K];
  return { company, price_tolerance_pct: g("price_tolerance_pct"), qty_tolerance_pct: g("qty_tolerance_pct"), amount_tolerance: g("amount_tolerance"), journal_review_amount: g("journal_review_amount"),
    journal_reviewer_role: g("journal_reviewer_role"), stock_variance_approval_amount: g("stock_variance_approval_amount"), stock_variance_role: g("stock_variance_role"), max_discount_pct: g("max_discount_pct"),
    min_margin_pct: g("min_margin_pct"), bank_match_days: g("bank_match_days"), review_before_posting: g("review_before_posting"), variance_approval_required: g("variance_approval_required"),
    quarantine_warehouse: g("quarantine_warehouse"), landed_cost_foreign: g("landed_cost_foreign"), rfq_reminder_days: g("rfq_reminder_days"), enforce_contract_price: g("enforce_contract_price"), contract_price_tolerance: g("contract_price_tolerance"),
    custody_approval_required: g("custody_approval_required"), custody_approver_role: g("custody_approver_role"), asset_verification_days: g("asset_verification_days"), configured: true };
}
/** Three-way match of one invoice line against its order/receipt line under the company tolerance. */
export function withinTolerance(p: ControlPolicy, ordered: { qty: number; rate: number }, billed: { qty: number; rate: number }): { ok: boolean; priceVarPct: number; qtyVarPct: number; amountVar: number } {
  const priceVarPct = ordered.rate ? ((billed.rate - ordered.rate) / ordered.rate) * 100 : 0;
  const qtyVarPct = ordered.qty ? ((billed.qty - ordered.qty) / ordered.qty) * 100 : 0;
  const amountVar = billed.qty * billed.rate - ordered.qty * ordered.rate;
  const ok = priceVarPct <= p.price_tolerance_pct + 1e-9 && qtyVarPct <= p.qty_tolerance_pct + 1e-9 && amountVar <= p.amount_tolerance + 1e-9;
  return { ok, priceVarPct, qtyVarPct, amountVar };
}

/* ------------------------------------------------------------------ close tasks ------------------------------------------------------------------ */
export interface CloseTask { name: string; company: string; period_end: string; task: string; area: string; owner_user: string; due_date: string; status: string; evidence: string }
const asTask = (d: Doc): CloseTask => ({ name: d.name, company: str(d["company"]), period_end: str(d["period_end"]), task: str(d["task"]), area: str(d["area"]), owner_user: str(d["owner_user"]), due_date: str(d["due_date"]), status: str(d["status"]) || "Open", evidence: str(d["evidence"]) });
export function closeTasks(company: string, periodEnd?: string): CloseTask[] {
  return adapter.list(CORE_DT.closeTask).map(asTask).filter((t) => t.company === company && (!periodEnd || t.period_end === periodEnd)).sort((a, b) => a.due_date.localeCompare(b.due_date) || a.name.localeCompare(b.name));
}
/** The period a company is closing now: the latest period end with a task not done yet, else the latest period end ("" when none). */
export function currentClosePeriod(company: string): string {
  const ts = closeTasks(company); const ends = [...new Set(ts.map((t) => t.period_end))].sort().reverse();
  return ends.find((e) => ts.some((t) => t.period_end === e && t.status !== "Done")) ?? ends[0] ?? "";
}
/** Progress of one period's checklist; without a period, the period being closed now (earlier months are history). */
export function closeProgress(company: string, periodEnd?: string) {
  const ts = closeTasks(company, periodEnd || currentClosePeriod(company) || undefined); const done = ts.filter((t) => t.status === "Done").length;
  return { total: ts.length, done, blocked: ts.filter((t) => t.status === "Blocked").length, open: ts.length - done, pct: ts.length ? Math.round((done / ts.length) * 100) : 0 };
}
export function setCloseTaskStatus(name: string, status: "Open" | "In Progress" | "Blocked" | "Done", evidence?: string): { ok: true } | { ok: false; reason: Bi } {
  if (status === "Done" && !(evidence ?? str(adapter.get(CORE_DT.closeTask, name)?.["evidence"])).trim()) return { ok: false, reason: ["Add the evidence (what was checked) before marking the task done.", "أضف الدليل (ما الذي رُوجع) قبل إنهاء المهمة."] };
  adapter.update(CORE_DT.closeTask, name, { status, ...(evidence !== undefined ? { evidence } : {}) });
  return { ok: true };
}

/* ------------------------------------------------------------------ correction tasks ------------------------------------------------------------------ */
export function correctionTasks(f: { company?: string; status?: string } = {}) {
  return adapter.list(CORE_DT.correctionTask).filter((d) => (!f.company || d["company"] === f.company) && (!f.status || d["status"] === f.status));
}
