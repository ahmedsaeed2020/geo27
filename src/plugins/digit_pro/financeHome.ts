/**
 * PRO P1 — Finance home read model (/pro/dashboard and /pro/accounting). Every figure is a sum of permission-scoped
 * native records and each one carries the drill that opens exactly the rows it sums (card total = drill rows):
 *  - P&L split: posted Income / Expense GL Entry of the fiscal year to date (dash92 plFigures — the P&L statement basis).
 *    Draft Sales / Purchase Invoices of the same window are the hatched part; «N للمراجعة» opens those drafts.
 *  - Cash flow: Bank / Cash GL Entry per month — in = debit, out = credit, balance = posted balance at month end.
 *  - Bank accounts: books = posted ledger balance; bank = the native Bank Reconciliation Statement's calculated statement
 *    balance (books − uncleared deposits + uncleared payments); «N للمطابقة» = submitted bank lines not yet reconciled.
 *  - Expenses: leaf Expense accounts, month to date vs the same days of last month (top five + «أخرى»).
 * Invoiced is never called collected, and nothing here writes a record.
 */
import { scopedList } from "@/lib/scope";
import { RUNNERS } from "@/lib/reportRunner";
import { currentUser } from "@/lib/session";
import { monthEnd, type Drill, type Status } from "./command";
import { plFigures } from "./dash92";
import { financeContext, sourceStatus, todayIso } from "./finance";
import { compareAsOf } from "./sections";
import { companyScope } from "./closeReview";

const n = (v: unknown) => Number(v) || 0;
const s = (v: unknown) => String(v ?? "");
const d10 = (v: unknown) => s(v).slice(0, 10);
const r2 = (v: number) => Math.round(v * 100) / 100;
const worst = (...st: Status[]): Status => st.find((x) => x !== "ok") ?? "ok";
const monthStart = (iso: string) => `${iso.slice(0, 7)}-01`;
const yearBack = (iso: string) => { const y = Number(iso.slice(0, 4)) - 1; const md = iso.slice(5) === "02-29" ? "02-28" : iso.slice(5); return `${y}-${md}`; };
const addMonths = (ym: string, k: number) => { const [y, m] = ym.split("-").map(Number) as [number, number]; const d = new Date(Date.UTC(y, m - 1 + k, 1)); return d.toISOString().slice(0, 7); };

/** Fiscal year start for the company (Fiscal Year master; 1 January of today's year when none is defined). */
export function fyStart(company: string, user = currentUser(), today = todayIso()): string {
  const fy = financeContext(company, user).fiscalYear;
  return fy && fy.start <= today ? fy.start : `${today.slice(0, 4)}-01-01`;
}

/* ---------------- P1-01 · P&L split ---------------- */
export interface DraftSet { count: number; amount: number; drill: Drill }
export interface PlSplit { status: Status; from: string; to: string; income: number; expense: number; net: number; prevIncome: number | null; prevFrom: string; prevTo: string;
  drafts: { income: DraftSet; expense: DraftSet }; review: { count: number; drill: Drill } | null; report: Drill }
const draftDrill = (doctype: string, company: string, from: string, to: string): Drill =>
  ({ kind: "list", doctype, filters: [["docstatus", "=", 0], ["company", "=", company], ["posting_date", ">=", from], ["posting_date", "<=", to]] });
export const plReport = (company: string, from: string, to: string): Drill => ({ kind: "pro", to: "/pro/statements", search: { report: "Profit and Loss Statement", company, from_date: from, to_date: to } });

export function plSplit(company: string, user = currentUser(), today = todayIso()): PlSplit {
  const from = fyStart(company, user, today), to = today;
  const prevFrom = yearBack(from), prevTo = yearBack(to);
  const status = worst(companyScope("GL Entry", company, user), sourceStatus("Account", user));
  const drafts = (doctype: "Sales Invoice" | "Purchase Invoice"): DraftSet => {
    const rows = sourceStatus(doctype, user) === "ok" ? scopedList(doctype, user).filter((x) => n(x.docstatus) === 0 && x["company"] === company && d10(x["posting_date"]) >= from && d10(x["posting_date"]) <= to) : [];
    return { count: rows.length, amount: r2(rows.reduce((t, x) => t + n(x["base_net_total"] ?? x["net_total"] ?? x["grand_total"]), 0)), drill: draftDrill(doctype, company, from, to) };
  };
  const base = { from, to, prevFrom, prevTo, report: plReport(company, from, to) };
  const di = drafts("Sales Invoice"), de = drafts("Purchase Invoice");
  // one «N للمراجعة» link only when one list holds every draft (card total = drill rows); otherwise each bar carries its own
  const review = di.count && de.count ? null : di.count ? { count: di.count, drill: di.drill } : de.count ? { count: de.count, drill: de.drill } : null;
  if (status !== "ok") return { ...base, status, income: 0, expense: 0, net: 0, prevIncome: null, drafts: { income: di, expense: de }, review };
  const cur = plFigures(company, from, to, user), prev = plFigures(company, prevFrom, prevTo, user);
  return { ...base, status: cur.income || cur.expense ? "ok" : "empty", income: cur.income, expense: cur.expense, net: cur.net, prevIncome: prev.income || prev.expense ? prev.income : null, drafts: { income: di, expense: de }, review };
}

/* ---------------- P1-02 · monthly cash flow on Bank / Cash accounts ---------------- */
export interface FlowMonth { ym: string; from: string; to: string; inflow: number; outflow: number; balance: number; rows: number; drill: Drill }
export interface CashFlow { status: Status; accounts: string[]; opening: number; months: FlowMonth[]; report: Drill }
const cashAccountNames = (company: string, user: string) => scopedList("Account", user).filter((a) => a["company"] === company && !n(a["is_group"]) && ["Bank", "Cash"].includes(s(a["account_type"]))).map((a) => a.name).sort();

export function cashFlowMonths(company: string, user = currentUser(), today = todayIso(), months = 6): CashFlow {
  const accounts = sourceStatus("Account", user) === "ok" ? cashAccountNames(company, user) : [];
  const report: Drill = { kind: "pro", to: "/pro/statements", search: { report: "Cash Flow", company, from_date: fyStart(company, user, today), to_date: today } };
  const status = worst(companyScope("GL Entry", company, user), sourceStatus("Account", user));
  if (status !== "ok") return { status, accounts, opening: 0, months: [], report };
  if (!accounts.length) return { status: "empty", accounts, opening: 0, months: [], report };
  const set = new Set(accounts);
  const gl = scopedList("GL Entry", user).filter((g) => g["company"] === company && !n(g["is_cancelled"]) && set.has(s(g["account"])) && d10(g["posting_date"]) <= today);
  const k = Math.max(1, Math.min(24, Math.round(months)));
  const first = addMonths(today.slice(0, 7), -(k - 1)); const start = `${first}-01`;
  const opening = r2(gl.filter((g) => d10(g["posting_date"]) < start).reduce((t, g) => t + n(g["debit"]) - n(g["credit"]), 0));
  let bal = opening;
  const out: FlowMonth[] = [];
  for (let i = 0; i < k; i++) {
    const ym = addMonths(first, i); const from = `${ym}-01`; const end = monthEnd(ym); const to = end < today ? end : today;
    const rows = gl.filter((g) => { const d = d10(g["posting_date"]); return d >= from && d <= to; });
    const inflow = r2(rows.reduce((t, g) => t + n(g["debit"]), 0)), outflow = r2(rows.reduce((t, g) => t + n(g["credit"]), 0));
    bal = r2(bal + inflow - outflow);
    out.push({ ym, from, to, inflow, outflow, balance: bal, rows: rows.length,
      drill: { kind: "list", doctype: "GL Entry", filters: [["company", "=", company], ["account", "in", accounts], ["is_cancelled", "=", 0], ["posting_date", ">=", from], ["posting_date", "<=", to]] } });
  }
  return { status: out.some((m) => m.rows) || opening ? "ok" : "empty", accounts, opening, months: out, report };
}

/* ---------------- P1-03 · bank balance vs books balance ---------------- */
export interface BankRow { account: string; type: "Bank" | "Cash"; books: number; bank: number | null; diff: number | null; unreconciled: number | null; bankAccounts: string[];
  booksDrill: Drill; bankDrill: Drill | null; reconDrill: Drill | null }
export interface BankCompare { status: Status; asOf: string; rows: BankRow[]; toReconcile: number; reconDrill: Drill | null; workDrill: Drill }
const OPEN_BT = ["Reconciled", "Cancelled"];

export function bankCompare(company: string, user = currentUser(), today = todayIso()): BankCompare {
  const workDrill: Drill = { kind: "pro", to: "/pro/bank-reconciliation", search: { company } };
  const status = worst(companyScope("GL Entry", company, user), sourceStatus("Account", user));
  if (status !== "ok") return { status, asOf: today, rows: [], toReconcile: 0, reconDrill: null, workDrill };
  const accts = scopedList("Account", user).filter((a) => a["company"] === company && !n(a["is_group"]) && ["Bank", "Cash"].includes(s(a["account_type"])));
  if (!accts.length) return { status: "empty", asOf: today, rows: [], toReconcile: 0, reconDrill: null, workDrill };
  const gl = scopedList("GL Entry", user).filter((g) => g["company"] === company && !n(g["is_cancelled"]) && d10(g["posting_date"]) <= today);
  const bankOk = sourceStatus("Bank Account", user) === "ok", btOk = sourceStatus("Bank Transaction", user) === "ok";
  const banks = bankOk ? scopedList("Bank Account", user).filter((b) => !b["company"] || b["company"] === company) : [];
  const bts = btOk ? scopedList("Bank Transaction", user).filter((t) => n(t.docstatus) === 1 && !OPEN_BT.includes(s(t["status"]))) : [];
  const brs = RUNNERS["Bank Reconciliation Statement"];
  const reconList = (ba: string[]): Drill => ({ kind: "list", doctype: "Bank Transaction", filters: [["bank_account", "in", ba], ["docstatus", "=", 1], ["status", "not in", OPEN_BT]] });
  const rows = accts.map((a): BankRow => {
    const type = s(a["account_type"]) === "Cash" ? "Cash" as const : "Bank" as const;
    const books = r2(gl.filter((g) => g["account"] === a.name).reduce((t, g) => t + n(g["debit"]) - n(g["credit"]), 0));
    const ba = banks.filter((b) => b["account"] === a.name).map((b) => b.name);
    const unreconciled = btOk && bankOk ? bts.filter((t) => ba.includes(s(t["bank_account"]))).length : null;
    let bank: number | null = null;
    if (type === "Bank" && brs) {
      const res = brs.run({ company, account: a.name, report_date: today });
      const calc = res.summary?.find((x) => x.label === "Calculated bank statement balance")?.value;
      bank = typeof calc === "number" ? r2(calc) : null;
    }
    return { account: a.name, type, books, bank, diff: bank === null ? null : r2(books - bank), unreconciled, bankAccounts: ba,
      booksDrill: { kind: "report", name: "General Ledger", filters: { company, account: a.name, from_date: fyStart(company, user, today), to_date: today } },
      bankDrill: type === "Bank" ? { kind: "report", name: "Bank Reconciliation Statement", filters: { company, account: a.name, report_date: today } } : null,
      reconDrill: unreconciled && ba.length ? reconList(ba) : null };
  }).sort((x, y) => Math.abs(y.books) - Math.abs(x.books) || x.account.localeCompare(y.account));
  const toReconcile = rows.reduce((t, r) => t + (r.unreconciled ?? 0), 0);
  const allBa = rows.flatMap((r) => (r.unreconciled ? r.bankAccounts : []));
  return { status: "ok", asOf: today, rows, toReconcile, reconDrill: toReconcile && allBa.length ? reconList(allBa) : null, workDrill };
}

/* ---------------- P1-04 · expenses by account, month to date vs last month ---------------- */
export interface ExpenseSlice { key: string; account: string | null; value: number; prev: number; accounts: number; drill: Drill | null }
export interface ExpenseMix { status: Status; from: string; to: string; prevFrom: string; prevTo: string; slices: ExpenseSlice[]; total: number; prevTotal: number; report: Drill }

export function expenseMix(company: string, user = currentUser(), today = todayIso(), max = 6): ExpenseMix {
  const from = monthStart(today), to = today, prevTo = compareAsOf(today, "month"), prevFrom = monthStart(prevTo);
  const report = plReport(company, from, to);
  const status = worst(companyScope("GL Entry", company, user), sourceStatus("Account", user));
  const empty = { from, to, prevFrom, prevTo, slices: [], total: 0, prevTotal: 0, report };
  if (status !== "ok") return { status, ...empty };
  const cur = plFigures(company, from, to, user).leaves.filter((l) => l.value > 0);
  const prevMap = new Map(plFigures(company, prevFrom, prevTo, user).leaves.map((l) => [l.account, l.value]));
  if (!cur.length) return { status: "empty", ...empty, prevTotal: r2([...prevMap.values()].reduce((t, v) => t + Math.max(0, v), 0)) };
  const sorted = [...cur].sort((a, b) => b.value - a.value || a.account.localeCompare(b.account));
  const head = sorted.length > max ? sorted.slice(0, max - 1) : sorted, rest = sorted.length > max ? sorted.slice(max - 1) : [];
  const gl = (account: string): Drill => ({ kind: "report", name: "General Ledger", filters: { company, account, from_date: from, to_date: to } });
  const slices: ExpenseSlice[] = head.map((l) => ({ key: l.account, account: l.account, value: l.value, prev: r2(prevMap.get(l.account) ?? 0), accounts: 1, drill: gl(l.account) }));
  if (rest.length) slices.push({ key: "__other", account: null, value: r2(rest.reduce((t, l) => t + l.value, 0)), prev: r2(rest.reduce((t, l) => t + (prevMap.get(l.account) ?? 0), 0)), accounts: rest.length, drill: report });
  const total = r2(cur.reduce((t, l) => t + l.value, 0));
  const prevTotal = r2([...prevMap.values()].reduce((t, v) => t + Math.max(0, v), 0));
  return { status: "ok", from, to, prevFrom, prevTo, slices, total, prevTotal, report };
}

/** Percentage change with one decimal, or null when there is no base to compare with (never an invented 100%). */
export const changePct = (cur: number, prev: number | null): number | null => (prev ? Math.round(((cur - prev) / Math.abs(prev)) * 1000) / 10 : null);
export type { Status };
