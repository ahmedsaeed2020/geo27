/**
 * DIGIT shared Core group reporting (Run11.1 E6 group consolidation, R6 financial statement designer).
 *
 * Both read the General Ledger at call time. Consolidation sums the selected companies account by account (accounts are
 * matched by name without the company abbreviation), translates each company to the presentation currency (balance
 * sheet at the closing rate, profit and loss at the period's average rate; the difference is shown as the translation
 * reserve) and eliminates intercompany vouchers — postings against a Customer or Supplier that represents another
 * company of the group (native `represents_company`). Statement layouts are Core "Digit Statement Layout" records
 * (rows: accounts by root type / account type / name prefix, totals of earlier rows, headings) rendered with column sets
 * current / prior period / prior year / budget.
 */
import { adapter, type Doc } from "@/lib/adapter";
import { scopedList } from "@/lib/scope";
import { CORE_DT } from "./doctypes";
import type { Bi, ListDrill } from "./finance";

const n = (v: unknown) => Number(v) || 0;
const s = (v: unknown) => String(v ?? "");
const r2 = (x: number) => Math.round(x * 100) / 100;
const BS = new Set(["Asset", "Liability", "Equity"]);
const debitNature = (root: string) => root === "Asset" || root === "Expense";
export const accountKey = (a: Doc) => `${s(a["root_type"])}|${s(a["account_name"] || a.name.replace(/\s+-\s+[^-]+$/, "")).trim().toLowerCase()}`;
const glOf = (company: string) => adapter.list("GL Entry").filter((g) => s(g["company"]) === company && !n(g["is_cancelled"]));

/** Exchange rate from → to on or before a date (Currency Exchange; inverse rates are used when only the reverse is recorded). */
export function rateOn(from: string, to: string, date: string): number {
  if (!from || !to || from === to) return 1;
  const xs = adapter.list("Currency Exchange").filter((x) => s(x["date"]) <= date).sort((a, b) => s(b["date"]).localeCompare(s(a["date"])));
  const d = xs.find((x) => x["from_currency"] === from && x["to_currency"] === to); if (d) return n(d["exchange_rate"]);
  const i = xs.find((x) => x["from_currency"] === to && x["to_currency"] === from); return i && n(i["exchange_rate"]) ? 1 / n(i["exchange_rate"]) : 1;
}
export function averageRate(from: string, to: string, start: string, end: string): number {
  if (from === to) return 1;
  const xs = adapter.list("Currency Exchange").filter((x) => s(x["date"]) >= start && s(x["date"]) <= end && ((x["from_currency"] === from && x["to_currency"] === to) || (x["from_currency"] === to && x["to_currency"] === from)));
  if (!xs.length) return rateOn(from, to, end);
  return xs.reduce((t, x) => t + (x["from_currency"] === from ? n(x["exchange_rate"]) : 1 / n(x["exchange_rate"])), 0) / xs.length;
}
export interface ConsolRow { key: string; label: string; rootType: string; local: Record<string, number>; translated: Record<string, number>; elimination: number; consolidated: number; accounts: string[] }
export interface Consolidation {
  companies: { name: string; currency: string; closing: number; average: number }[]; presentation: string; from: string; to: string;
  rows: ConsolRow[]; eliminated: { company: string; voucher: string; account: string; party: string; amount: number }[];
  totals: { assets: number; liabilities: number; equity: number; income: number; expense: number; profit: number; translationReserve: number; check: number };
}
/** Intercompany parties: Customers / Suppliers whose `represents_company` is another company of the group. */
export function intercompanyParties(group: string[]): Set<string> {
  const g = new Set(group); const out = new Set<string>();
  for (const dt of ["Customer", "Supplier"]) for (const d of adapter.list(dt)) if (g.has(s(d["represents_company"]))) out.add(`${dt}|${d.name}`);
  return out;
}
export function consolidate(group: string[], from: string, to: string, presentation = "SAR"): Consolidation {
  const ic = intercompanyParties(group);
  const accounts = new Map(adapter.list("Account").map((a) => [a.name, a]));
  const rows = new Map<string, ConsolRow>(); const eliminated: Consolidation["eliminated"] = [];
  const companies = group.map((c) => { const cur = s(adapter.get("Company", c)?.["default_currency"]) || "SAR"; return { name: c, currency: cur, closing: rateOn(cur, presentation, to), average: averageRate(cur, presentation, from, to) }; });
  for (const co of companies) {
    const gl = glOf(co.name);
    const icVouchers = new Set(gl.filter((g) => g["party"] && ic.has(`${s(g["party_type"])}|${s(g["party"])}`) && s(g["party"]) && adapter.get(s(g["party_type"]), s(g["party"]))?.["represents_company"] !== co.name).map((g) => `${s(g["voucher_type"])}|${s(g["voucher_no"])}`));
    for (const g of gl) {
      const a = accounts.get(s(g["account"])); if (!a) continue; const root = s(a["root_type"]); if (!root) continue;
      const date = s(g["posting_date"]); if (date > to || (!BS.has(root) && date < from)) continue;
      const k = accountKey(a); const row = rows.get(k) ?? { key: k, label: s(a["account_name"] || a.name), rootType: root, local: {}, translated: {}, elimination: 0, consolidated: 0, accounts: [] };
      if (!row.accounts.includes(a.name)) row.accounts.push(a.name);
      const v = debitNature(root) ? n(g["debit"]) - n(g["credit"]) : n(g["credit"]) - n(g["debit"]);
      const rate = BS.has(root) ? co.closing : co.average;
      row.local[co.name] = r2((row.local[co.name] ?? 0) + v); row.translated[co.name] = r2((row.translated[co.name] ?? 0) + v * rate);
      const isIc = icVouchers.has(`${s(g["voucher_type"])}|${s(g["voucher_no"])}`) && (root === "Income" || root === "Expense" || (g["party"] && ic.has(`${s(g["party_type"])}|${s(g["party"])}`)));
      if (isIc) { row.elimination = r2(row.elimination - v * rate); eliminated.push({ company: co.name, voucher: s(g["voucher_no"]), account: a.name, party: s(g["party"]), amount: r2(v * rate) }); }
      rows.set(k, row);
    }
  }
  for (const r of rows.values()) r.consolidated = r2(Object.values(r.translated).reduce((t, v) => t + v, 0) + r.elimination);
  const sum = (root: string) => r2([...rows.values()].filter((r) => r.rootType === root).reduce((t, r) => t + r.consolidated, 0));
  const assets = sum("Asset"), liabilities = sum("Liability"), equity = sum("Equity"), income = sum("Income"), expense = sum("Expense"), profit = r2(income - expense);
  // what is left after assets = liabilities + equity + profit is the currency translation reserve (zero when every company reports in the presentation currency)
  const translationReserve = r2(assets - liabilities - equity - profit);
  const order = ["Asset", "Liability", "Equity", "Income", "Expense"];
  return { companies, presentation, from, to, rows: [...rows.values()].filter((r) => Object.values(r.local).some((v) => Math.abs(v) > 0.004) || Math.abs(r.elimination) > 0.004).sort((a, b) => order.indexOf(a.rootType) - order.indexOf(b.rootType) || a.label.localeCompare(b.label)),
    eliminated, totals: { assets, liabilities, equity, income, expense, profit, translationReserve, check: r2(assets - liabilities - equity - profit - translationReserve) } };
}

/* ------------------------------------------- consolidated receivables / payables (2026: per company and currency) ------------------------------------------- */
export type DueSide = "Receivable" | "Payable";
export interface DueLine { company: string; party: string; partyName: string; currency: string; voucher: string; date: string; due: string; outstanding: number; overdue: boolean; intercompany: boolean }
export interface DueGroup { company: string; currency: string; parties: number; invoices: number; outstanding: number; overdue: number }
export interface DueParty { company: string; party: string; partyName: string; currency: string; invoices: number; outstanding: number; overdue: number; intercompany: boolean }
/** Open receivables (Sales Invoice) or payables (Purchase Invoice) of the group companies as of a date, in each invoice's own
 *  currency: subtotals per company × currency and per currency, never one mixed-currency figure; parties that represent a group
 *  company are flagged intercompany. Rows are the documents the user may read (scopedList), so a restricted user sees fewer. */
export function consolidatedOutstanding(group: string[], asOf: string, side: DueSide, user?: string): { lines: DueLine[]; groups: DueGroup[]; parties: DueParty[]; currencies: { currency: string; outstanding: number; overdue: number; invoices: number }[] } {
  const dt = side === "Receivable" ? "Sales Invoice" : "Purchase Invoice"; const pf = side === "Receivable" ? "customer" : "supplier";
  const g = new Set(group); const ic = intercompanyParties(group);
  const lines: DueLine[] = scopedList(dt, user).filter((d) => g.has(s(d["company"])) && n(d.docstatus) === 1 && s(d["posting_date"]) <= asOf && Math.abs(n(d["outstanding_amount"])) > 0.004)
    .map((d) => ({ company: s(d["company"]), party: s(d[pf]), partyName: s(d[`${pf}_name`] || d[pf]), currency: s(d["party_account_currency"] || d["currency"]) || "SAR", voucher: d.name,
      date: s(d["posting_date"]), due: s(d["due_date"]), outstanding: r2(n(d["outstanding_amount"])), overdue: !!d["due_date"] && s(d["due_date"]) < asOf && n(d["outstanding_amount"]) > 0,
      intercompany: ic.has(`${side === "Receivable" ? "Customer" : "Supplier"}|${s(d[pf])}`) }));
  const gm = new Map<string, DueGroup & { ps: Set<string> }>(); const pm = new Map<string, DueParty>(); const cm = new Map<string, { currency: string; outstanding: number; overdue: number; invoices: number }>();
  for (const l of lines) {
    const gk = `${l.company}|${l.currency}`; const x = gm.get(gk) ?? { company: l.company, currency: l.currency, parties: 0, invoices: 0, outstanding: 0, overdue: 0, ps: new Set<string>() };
    x.ps.add(l.party); x.invoices++; x.outstanding = r2(x.outstanding + l.outstanding); if (l.overdue) x.overdue = r2(x.overdue + l.outstanding); x.parties = x.ps.size; gm.set(gk, x);
    const pk = `${l.company}|${l.party}|${l.currency}`; const p = pm.get(pk) ?? { company: l.company, party: l.party, partyName: l.partyName, currency: l.currency, invoices: 0, outstanding: 0, overdue: 0, intercompany: l.intercompany };
    p.invoices++; p.outstanding = r2(p.outstanding + l.outstanding); if (l.overdue) p.overdue = r2(p.overdue + l.outstanding); pm.set(pk, p);
    const c = cm.get(l.currency) ?? { currency: l.currency, outstanding: 0, overdue: 0, invoices: 0 }; c.invoices++; c.outstanding = r2(c.outstanding + l.outstanding); if (l.overdue) c.overdue = r2(c.overdue + l.outstanding); cm.set(l.currency, c);
  }
  return { lines, groups: [...gm.values()].map(({ ps: _ps, ...x }) => x).sort((a, b) => a.company.localeCompare(b.company) || a.currency.localeCompare(b.currency)),
    parties: [...pm.values()].sort((a, b) => a.currency.localeCompare(b.currency) || b.outstanding - a.outstanding), currencies: [...cm.values()].sort((a, b) => a.currency.localeCompare(b.currency)) };
}

/* ------------------------------------------------------------------ statement designer (R6) ------------------------------------------------------------------ */
export type ColumnSet = "Current" | "Current | Prior period | Change" | "Current | Prior year | Change" | "Current | Budget | Variance";
export interface LayoutRow { label: string; label_ar?: string; row_type: "Accounts" | "Total" | "Heading"; root_type?: string; account_type?: string; account_prefix?: string; sum_rows?: string; sign?: "Natural" | "Reversed"; bold?: number }
export interface RenderedRow { label: string; labelAr: string; kind: LayoutRow["row_type"]; bold: boolean; values: number[]; accounts: string[]; drill?: ListDrill }
const shiftYear = (d: string, k: number) => `${Number(d.slice(0, 4)) + k}${d.slice(4)}`;
function periodBefore(from: string, to: string): [string, string] {
  const len = Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 864e5) + 1;
  const end = new Date(Date.parse(`${from}T00:00:00Z`) - 864e5).toISOString().slice(0, 10);
  return [new Date(Date.parse(`${end}T00:00:00Z`) - (len - 1) * 864e5).toISOString().slice(0, 10), end];
}
export const COLUMN_LABELS: Record<string, Bi> = { Current: ["Current", "الحالي"], "Prior period": ["Prior period", "الفترة السابقة"], "Prior year": ["Prior year", "السنة السابقة"], Budget: ["Budget", "الموازنة"], Change: ["Change", "التغير"], Variance: ["Variance", "الانحراف"] };
function matchAccounts(company: string, r: LayoutRow): Doc[] {
  const pre = s(r.account_prefix).trim().toLowerCase();
  return adapter.list("Account").filter((a) => s(a["company"]) === company && !n(a["is_group"]) && (!r.root_type || a["root_type"] === r.root_type) && (!r.account_type || a["account_type"] === r.account_type)
    && (!pre || s(a["account_name"] || a.name).toLowerCase().startsWith(pre) || s(a["account_number"]).startsWith(pre) || a.name.toLowerCase().startsWith(pre)));
}
function accountValue(company: string, names: Set<string>, from: string, to: string, balance: boolean): number {
  let v = 0; const acc = new Map(adapter.list("Account").map((a) => [a.name, a]));
  for (const g of glOf(company)) { if (!names.has(s(g["account"]))) continue; const d = s(g["posting_date"]); if (d > to || (!balance && d < from)) continue; const root = s(acc.get(s(g["account"]))?.["root_type"]); v += debitNature(root) ? n(g["debit"]) - n(g["credit"]) : n(g["credit"]) - n(g["debit"]); }
  return r2(v);
}
function budgetValue(company: string, names: Set<string>, from: string, to: string): number {
  let v = 0;
  for (const b of adapter.list("Budget").filter((x) => s(x["company"]) === company && n(x.docstatus) === 1)) {
    const fy = adapter.get("Fiscal Year", s(b["fiscal_year"])); const ys = s(fy?.["year_start_date"]), ye = s(fy?.["year_end_date"]); if (!ys || !ye) continue;
    const lo = from > ys ? from : ys, hi = to < ye ? to : ye; if (lo > hi) continue;
    const share = (Date.parse(hi) - Date.parse(lo) + 864e5) / (Date.parse(ye) - Date.parse(ys) + 864e5);
    for (const a of (b["accounts"] as Doc[] | undefined) ?? []) if (names.has(s(a["account"]))) v += n(a["budget_amount"]) * share;
  }
  return r2(v);
}
export function layoutRows(layout: Doc): LayoutRow[] { return ((layout["rows"] as Doc[] | undefined) ?? []).map((r) => ({ label: s(r["label"]), label_ar: s(r["label_ar"]), row_type: (s(r["row_type"]) || "Accounts") as LayoutRow["row_type"], root_type: s(r["root_type"]), account_type: s(r["account_type"]), account_prefix: s(r["account_prefix"]), sum_rows: s(r["sum_rows"]), sign: (s(r["sign"]) || "Natural") as "Natural", bold: n(r["bold"]) })); }
export function renderLayout(rowsIn: LayoutRow[], opts: { company: string; from: string; to: string; basis?: string; columns?: string }): { columns: Bi[]; rows: RenderedRow[]; errors: Bi[] } {
  const balance = opts.basis === "Balance as of date"; const set = (opts.columns || "Current").split("|").map((x) => x.trim());
  const periods: ([string, string] | "budget" | "diff")[] = set.map((c) => c === "Current" ? [opts.from, opts.to] : c === "Prior period" ? periodBefore(opts.from, opts.to) : c === "Prior year" ? [shiftYear(opts.from, -1), shiftYear(opts.to, -1)] : c === "Budget" ? "budget" : "diff");
  const out: RenderedRow[] = []; const errors: Bi[] = []; const byLabel = new Map<string, number[]>();
  for (const r of rowsIn) {
    if (r.row_type === "Heading") { out.push({ label: r.label, labelAr: r.label_ar || r.label, kind: "Heading", bold: true, values: [], accounts: [] }); continue; }
    let base: number[]; let accounts: string[] = [];
    if (r.row_type === "Total") {
      const parts = s(r.sum_rows).split(",").map((x) => x.trim()).filter(Boolean);
      const missing = parts.filter((p) => !byLabel.has(p.replace(/^-\s*/, ""))); if (missing.length) errors.push([`${r.label}: unknown rows ${missing.join(", ")} (a total can only add rows above it)`, `${r.label_ar || r.label}: أسطر غير معروفة ${missing.join("، ")} (يجمع الإجمالي الأسطر التي فوقه فقط)`]);
      base = periods.map((_, i) => r2(parts.reduce((t, p) => { const neg = p.startsWith("-"); const v = byLabel.get(p.replace(/^-\s*/, ""))?.[i] ?? 0; return t + (neg ? -v : v); }, 0)));
    } else {
      const accs = matchAccounts(opts.company, r); accounts = accs.map((a) => a.name); const names = new Set(accounts);
      base = periods.map((p) => (p === "budget" ? budgetValue(opts.company, names, opts.from, opts.to) : p === "diff" ? 0 : accountValue(opts.company, names, p[0], p[1], balance)));
      if (r.sign === "Reversed") base = base.map((v) => -v);
    }
    // the last column of a three-column set is current minus the comparison
    const vals = base.map((v, i) => (periods[i] === "diff" ? r2(base[0]! - base[i - 1]!) : v));
    byLabel.set(r.label, vals);
    out.push({ label: r.label, labelAr: r.label_ar || r.label, kind: r.row_type, bold: !!r.bold || r.row_type === "Total", values: vals, accounts, ...(accounts.length ? { drill: { doctype: "GL Entry", filters: [["company", "=", opts.company], ["account", "in", accounts], ["posting_date", "between", [balance ? "2000-01-01" : opts.from, opts.to]], ["is_cancelled", "=", 0]] } } : {}) });
  }
  return { columns: set.map((c) => COLUMN_LABELS[c] ?? [c, c]), rows: out, errors };
}
export const statementLayouts = () => adapter.list(CORE_DT.statementLayout);
