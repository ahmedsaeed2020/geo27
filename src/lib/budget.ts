/**
 * Budget control — synthetic-preview port of erpnext/accounts/doctype/budget/budget.py
 * validate_expense_against_budget for Journal Entry / Purchase Invoice (actual), Purchase Order and Material Request.
 * Compares annual and accumulated-monthly budget against GL actuals (+ ordered / requested amounts) plus the
 * voucher's own amount; action Stop → submit error, Warn → warning. Reads adapter records only.
 */
import { adapter, type Doc } from "./adapter";
import { resolveName } from "./rename";

const n = (v: unknown) => Number(v) || 0;
const r2 = (x: number) => Math.round(x * 100) / 100;
const rows = (d: Doc, f: string) => ((d[f] as Record<string, unknown>[] | undefined) ?? []);
export const BUDGET_DOCTYPES = ["Journal Entry", "Purchase Invoice", "Purchase Order", "Material Request"];
type Key = { account: string; against: "Cost Center" | "Project"; value: string; amount: number };

/** Expense lines of the voucher: account × cost center / project × amount. */
export function voucherLines(dt: string, d: Doc): Key[] {
  const out: Key[] = []; const push = (account: unknown, cc: unknown, pr: unknown, amt: number) => {
    const a = resolveName("Account", String(account ?? "")); if (!a || !amt) return;
    if (cc) out.push({ account: a, against: "Cost Center", value: String(cc), amount: amt });
    if (pr) out.push({ account: a, against: "Project", value: String(pr), amount: amt });
  };
  if (dt === "Journal Entry") for (const x of rows(d, "accounts")) push(x["account"], x["cost_center"], x["project"], n(x["debit"] ?? x["debit_in_account_currency"]) - n(x["credit"] ?? x["credit_in_account_currency"]));
  else for (const x of rows(d, "items")) push(x["expense_account"], x["cost_center"] ?? d["cost_center"], x["project"] ?? d["project"], n(x["net_amount"] ?? x["amount"]) || n(x["qty"]) * n(x["rate"]));
  return out;
}

function fyRange(b: Doc): [string, string] {
  const f = adapter.get("Fiscal Year", String(b["from_fiscal_year"])), t = adapter.get("Fiscal Year", String(b["to_fiscal_year"]));
  return [String(b["budget_start_date"] || f?.["year_start_date"] || "0000"), String(b["budget_end_date"] || t?.["year_end_date"] || "9999")];
}
const months = (a: string, b: string) => (Number(b.slice(0, 4)) - Number(a.slice(0, 4))) * 12 + Number(b.slice(5, 7)) - Number(a.slice(5, 7)) + 1;

/** Accumulated budget up to the posting month (budget_distribution rows, else equal monthly split). */
export function accumulatedBudget(b: Doc, date: string): number {
  const dist = rows(b, "budget_distribution");
  if (dist.length) return r2(dist.filter((x) => String(x["start_date"]) <= date).reduce((s, x) => s + n(x["amount"]), 0));
  const [s, e] = fyRange(b); const total = Math.max(months(s, e), 1);
  return r2(n(b["budget_amount"]) * Math.min(Math.max(months(s, date), 0), total) / total);
}

const sameCo = (x: Doc, co: string) => resolveName("Company", String(x["company"] ?? "")) === co;
function actual(k: Key, co: string, from: string, to: string): number {
  const f = k.against === "Cost Center" ? "cost_center" : "project";
  return adapter.list("GL Entry").filter((g) => !n(g["is_cancelled"]) && g["account"] === k.account && g[f] === k.value && sameCo(g, co) && String(g["posting_date"]) >= from && String(g["posting_date"]) <= to).reduce((s, g) => s + n(g["debit"]) - n(g["credit"]), 0);
}
function pending(dt: "Purchase Order" | "Material Request", k: Key, co: string, from: string, to: string, skip: string): number {
  const f = k.against === "Cost Center" ? "cost_center" : "project"; const df = dt === "Purchase Order" ? "transaction_date" : "transaction_date";
  let s = 0;
  for (const d of adapter.list(dt)) {
    if (d.name === skip || n(d["docstatus"]) !== 1 || !sameCo(d, co) || ["Closed", "Completed", "Stopped"].includes(String(d["status"]))) continue;
    const dd = String(d[df] ?? d["schedule_date"] ?? ""); if (dd < from || dd > to) continue;
    for (const x of rows(d, "items")) if (resolveName("Account", String(x["expense_account"] ?? "")) === k.account && String(x[f] ?? d[f] ?? "") === k.value) {
      const amt = n(x["amount"]) || n(x["qty"]) * n(x["rate"]);
      const done = dt === "Purchase Order" ? n(x["billed_amt"]) : (n(x["ordered_qty"]) * (n(x["rate"]) || 0));
      s += Math.max(amt - done, 0);
    }
  }
  return s;
}

export type BudgetResult = { errors: string[]; warnings: string[] };
/** validate_expense_against_budget for one voucher (posting date / transaction date). */
export function budgetCheck(dt: string, d: Doc): BudgetResult {
  const res: BudgetResult = { errors: [], warnings: [] };
  if (!BUDGET_DOCTYPES.includes(dt)) return res;
  const co = resolveName("Company", String(d["company"] ?? "")); const date = String(d["posting_date"] ?? d["transaction_date"] ?? "").slice(0, 10);
  const agg = new Map<string, Key>();
  for (const k of voucherLines(dt, d)) { const id = `${k.account}|${k.against}|${k.value}`; const p = agg.get(id); if (p) p.amount += k.amount; else agg.set(id, { ...k }); }
  const fmt = (x: number) => r2(x).toLocaleString("en", { minimumFractionDigits: 2 });
  for (const k of agg.values()) {
    if (k.amount <= 0) continue;
    const f = k.against === "Cost Center" ? "cost_center" : "project";
    for (const b of adapter.list("Budget")) {
      if (n(b["docstatus"]) !== 1 || b["budget_against"] !== k.against || String(b[f]) !== k.value || resolveName("Account", String(b["account"] ?? "")) !== k.account || !sameCo(b, co)) continue;
      const [from, to] = fyRange(b); if (date < from || date > to) continue;
      const act = actual(k, co, from, to), ord = pending("Purchase Order", k, co, from, to, d.name), req = pending("Material Request", k, co, from, to, d.name);
      const ctx = dt === "Material Request" ? ["applicable_on_material_request", "_on_mr", req] as const : dt === "Purchase Order" ? ["applicable_on_purchase_order", "_on_po", ord] as const : ["applicable_on_booking_actual_expenses", "", act] as const;
      const checks: [string, string, number, number][] = [];
      if (n(b[ctx[0]])) { checks.push(["Annual", `action_if_annual_budget_exceeded${ctx[1]}`, n(b["budget_amount"]), ctx[2] + k.amount]); checks.push(["Accumulated Monthly", `action_if_accumulated_monthly_budget_exceeded${ctx[1]}`, accumulatedBudget(b, date), ctx[2] + k.amount]); }
      if (n(b["applicable_on_cumulative_expense"])) { const cum = act + ord + req + k.amount; checks.push(["Annual", "action_if_annual_exceeded_on_cumulative_expense", n(b["budget_amount"]), cum]); checks.push(["Accumulated Monthly", "action_if_accumulated_monthly_exceeded_on_cumulative_expense", accumulatedBudget(b, date), cum]); }
      for (const [label, field, budget, spent] of checks) {
        const action = String(b[field] || ""); if (!["Stop", "Warn"].includes(action) || spent <= budget + 0.005) continue;
        const msg = `${label} Budget for Account ${k.account} against ${k.against} ${k.value} is ${fmt(budget)}. It will exceed by ${fmt(spent - budget)}`;
        (action === "Stop" ? res.errors : res.warnings).push(msg);
      }
    }
  }
  res.errors = [...new Set(res.errors)]; res.warnings = [...new Set(res.warnings)];
  return res;
}

/** PU1-b — budget position of the voucher's expense lines (read-only; same rule inputs as budgetCheck). */
export interface BudgetPosition { budget: string; account: string; against: "Cost Center" | "Project"; value: string; annual: number; actual: number; ordered: number; requested: number; thisDoc: number; remaining: number; remainingAfter: number }
export function budgetPosition(dt: string, d: Doc): BudgetPosition[] {
  if (!BUDGET_DOCTYPES.includes(dt)) return [];
  const co = resolveName("Company", String(d["company"] ?? "")); const date = String(d["posting_date"] ?? d["transaction_date"] ?? "").slice(0, 10);
  const agg = new Map<string, Key>();
  for (const k of voucherLines(dt, d)) { const id = `${k.account}|${k.against}|${k.value}`; const p = agg.get(id); if (p) p.amount += k.amount; else agg.set(id, { ...k }); }
  const out: BudgetPosition[] = [];
  for (const k of agg.values()) {
    if (k.amount <= 0) continue;
    const f = k.against === "Cost Center" ? "cost_center" : "project";
    for (const b of adapter.list("Budget")) {
      if (n(b["docstatus"]) !== 1 || b["budget_against"] !== k.against || String(b[f]) !== k.value || resolveName("Account", String(b["account"] ?? "")) !== k.account || !sameCo(b, co)) continue;
      const [from, to] = fyRange(b); if (date && (date < from || date > to)) continue;
      const act = actual(k, co, from, to), ord = pending("Purchase Order", k, co, from, to, d.name), req = pending("Material Request", k, co, from, to, d.name);
      const annual = n(b["budget_amount"]); const used = act + ord + req;
      out.push({ budget: b.name, account: k.account, against: k.against, value: k.value, annual: r2(annual), actual: r2(act), ordered: r2(ord), requested: r2(req), thisDoc: r2(k.amount), remaining: r2(annual - used), remainingAfter: r2(annual - used - k.amount) });
    }
  }
  return out;
}
