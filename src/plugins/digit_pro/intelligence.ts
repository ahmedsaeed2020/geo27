/** Presentation-only analysis of native Core runner results. No ledger writes or substitute accounting totals. */
import { adapter, type Doc } from "@/lib/adapter";
import { scopedList } from "@/lib/scope";
import { RUNNERS, type F, type RResult, type Row } from "@/lib/reportRunner";
import { sourceStatus } from "./finance";

export const INTELLIGENCE_SOURCES = ["Finance Book", "Cost Center", "Project", "Accounting Dimension", "Budget", "Budget Account", "Bank Transaction", "Stock Ledger Entry"];
export const FINANCIAL_REPORTS = ["Profit and Loss Statement", "Balance Sheet", "Cash Flow", "Trial Balance", "Budget Variance Report"] as const;
export type FinancialReport = typeof FINANCIAL_REPORTS[number];
const round = (v: number) => Math.round(v * 100) / 100;
const num = (v: unknown) => Number(v) || 0;
export function variance(current: number, previous: number) {
  return { amount: round(current - previous), percent: previous === 0 ? null : round((current - previous) / Math.abs(previous) * 100) };
}
/** Immediately preceding, non-overlapping period of identical inclusive day count. */
export function previousPeriod(from: string, to: string): { from: string; to: string } | null {
  const a = Date.parse(`${from}T00:00:00Z`), b = Date.parse(`${to}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || !Number.isFinite(a) || !Number.isFinite(b) || b < a || new Date(a).toISOString().slice(0,10) !== from || new Date(b).toISOString().slice(0,10) !== to) return null;
  const day = 86400000;
  return { from: new Date(a - (b - a + day)).toISOString().slice(0, 10), to: new Date(a - day).toISOString().slice(0, 10) };
}
/** Aggregated runner results cannot be permission-filtered after summation. Fail closed if any contributing source
 * in this company is unreadable; partial-ledger totals are never presented as complete statements. */
export function guardedReport(report: string, filters: F, user: string): { status: "ok" | "denied" | "unavailable"; result?: RResult } {
  const runner = RUNNERS[report]; if (!runner || !filters["company"]) return { status: "unavailable" };
  const sources = report === "Budget Variance Report" ? ["GL Entry", "Account", "Budget", "Fiscal Year"] : ["GL Entry", "Account"];
  for (const dt of sources) {
    const status = sourceStatus(dt, user); if (status !== "ok") return { status };
    const readable = new Set(scopedList(dt, user).map(d => d.name));
    if (adapter.list(dt).some(d => (!d["company"] || d["company"] === filters["company"]) && !readable.has(d.name))) return { status: "denied" };
  }
  return { status: "ok", result: runner.run(filters) };
}
export function resultValue(row: Row | undefined, result: RResult): number {
  if (!row) return 0;
  if (row["total"] !== undefined) return num(row["total"]);
  const last = result.columns.filter(c => c.fieldname.startsWith("p_")).at(-1);
  return last ? num(row[last.fieldname]) : num(row["closing_debit"]) - num(row["closing_credit"]);
}
export function comparisonRows(current: RResult, previous?: RResult, ytd?: RResult): Row[] {
  const key = current.columns[0]?.fieldname ?? "account";
  const old = new Map((previous?.rows ?? []).map(r => [String(r[key]), r]));
  const year = new Map((ytd?.rows ?? []).map(r => [String(r[key]), r]));
  return current.rows.map(row => {
    const id = String(row[key]), c = resultValue(row, current), p = previous ? resultValue(old.get(id), previous) : 0;
    const v = variance(c, p);
    return { ...row, current: c, previous: previous ? p : null, variance: previous ? v.amount : null, variance_percent: previous ? v.percent : null, ...(ytd ? { ytd: resultValue(year.get(id), ytd) } : {}) };
  });
}
/** Current invoice exposure only, segregated by currency. Never a historical balance or promised cash date. */
export function invoiceExposure(rows: Doc[], company: string, currency: string, asOn: string) {
  const eligible = rows.filter(d => d["company"] === company && num(d.docstatus) === 1 && num(d["outstanding_amount"]) > 0);
  const invoices = eligible.filter(d => d["currency"] === currency);
  const overdue = invoices.filter(d => typeof d["due_date"] === "string" && d["due_date"] < asOn);
  return { invoices, outstanding: round(invoices.reduce((s,d) => s + num(d["outstanding_amount"]),0)), overdue: round(overdue.reduce((s,d) => s + num(d["outstanding_amount"]),0)), excluded: eligible.length - invoices.length, undated: invoices.filter(d => !d["due_date"]).length };
}
export const INTELLIGENCE_GROUPS = [
  ["Financial Performance", "/pro/finance-intelligence", "performance"],
  ["Cash and Liquidity", "/pro/finance-intelligence", "cash"],
  ["Receivables and Collections", "/pro/receivables", ""],
  ["Payables and Payment Requirements", "/pro/payables", ""],
  ["Budgets and Variance", "/pro/finance-intelligence", "budget"],
  ["Profitability and Dimensions", "/pro/cost-centers", ""],
  ["Working Capital", "/pro/finance-intelligence", "cash"],
  ["Financial Reconciliation", "/pro/bank-reconciliation", ""],
  ["Period Closing and Exceptions", "/pro/period-control", ""],
  ["Management Report Pack", "/pro/reports", ""],
] as const;