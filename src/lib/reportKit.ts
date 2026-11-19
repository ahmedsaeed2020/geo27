/**
 * Shared helpers for the local report ports (reportRunner*.ts): filter parsing, fiscal periods, party/account
 * lookups and ledger reads over adapter records. Read-only — no report stores rows.
 */
import { adapter, type Doc } from "./adapter";
import { defaultCompany } from "./sessionDefaults";

export interface RCol { fieldname: string; label: string; fieldtype: "Data" | "Link" | "Dynamic Link" | "Currency" | "Float" | "Int" | "Date" | "Percent"; options?: string; width?: number; hidden?: number; /** display only: values above this limit (from a setting) are coloured */ alertAbove?: number | undefined }
export type Row = Record<string, unknown> & { indent?: number; is_total?: boolean; bold?: boolean };
export interface RCheck { label: string; ok: boolean; detail: string }
export interface RResult { columns: RCol[]; rows: Row[]; summary?: { label: string; value: number }[]; checks?: RCheck[]; error?: string }
export interface RFilter { fieldname: string; label: string; fieldtype: string; options?: string | string[]; default?: string }
export type F = Record<string, string>;
export interface Runner { src: string; filters: RFilter[]; base?: RFilter[]; run: (f: F) => RResult }

export const n = (v: unknown) => Number(v) || 0;
export const r2 = (x: number) => Math.round(x * 100) / 100;
export const r3 = (x: number) => Math.round(x * 1000) / 1000;
export const today = () => new Date().toISOString().slice(0, 10);
export const S = (v: unknown) => (v === undefined || v === null ? "" : String(v));
export const cur = (fieldname: string, label: string, width = 120): RCol => ({ fieldname, label, fieldtype: "Currency", options: "currency", width });
export const col = (fieldname: string, label: string, fieldtype: RCol["fieldtype"] = "Data", options?: string, width = 140): RCol => (options ? { fieldname, label, fieldtype, options, width } : { fieldname, label, fieldtype, width });
export const flt = (fieldname: string, label: string, width = 100): RCol => ({ fieldname, label, fieldtype: "Float", width });
export const sub = (d: Doc) => n(d.docstatus) === 1;
export const rows = (d: Doc, k = "items") => (Array.isArray(d[k]) ? (d[k] as Doc[]) : []);
export const COMPANY = () => defaultCompany();

/** MultiSelectList values arrive as a JSON array string (frappe) or comma text. */
export function ms(v: unknown): string[] {
  const s = S(v).trim(); if (!s) return [];
  if (s.startsWith("[")) { try { const a = JSON.parse(s) as unknown[]; return a.map(String).filter(Boolean); } catch { /* fall through */ } }
  return s.split(",").map((x) => x.trim()).filter(Boolean);
}
export const inMs = (v: unknown, f: string) => { const xs = ms(f); return !xs.length || xs.includes(S(v)); };
export const eqOpt = (v: unknown, f: string | undefined) => !f || S(v) === f;
export const between = (d: unknown, from?: string, to?: string) => (!from || S(d) >= from) && (!to || S(d) <= to);
export const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
export const addDays = (d: string, k: number) => { const x = new Date(`${d}T00:00:00Z`); x.setUTCDate(x.getUTCDate() + k); return x.toISOString().slice(0, 10); };

/** erpnext.utils.get_fiscal_year(today) / a named Fiscal Year. */
export function fiscalYear(name?: string): { name: string; start: string; end: string } {
  const all = adapter.list("Fiscal Year");
  const y = (name ? all.find((x) => x.name === name) : undefined) ?? all.find((x) => S(x["year_start_date"]) <= today() && S(x["year_end_date"]) >= today());
  return y ? { name: y.name, start: S(y["year_start_date"]), end: S(y["year_end_date"]) } : { name: today().slice(0, 4), start: `${today().slice(0, 4)}-01-01`, end: `${today().slice(0, 4)}-12-31` };
}
export const fyStart = () => fiscalYear().start;
export const fyEnd = () => fiscalYear().end;

/** Period buckets (financial_statements.get_period_list / trends.get_period_date_ranges). */
export type Periodicity = "Monthly" | "Quarterly" | "Half-Yearly" | "Yearly" | "Weekly";
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function periods(from: string, to: string, p: string): { key: string; label: string; from: string; to: string }[] {
  const out: { key: string; label: string; from: string; to: string }[] = [];
  if (!from || !to || from > to) return out;
  if (p === "Weekly") { let d = from; while (d <= to) { const e = addDays(d, 6) > to ? to : addDays(d, 6); out.push({ key: `w${d}`, label: `${d}`, from: d, to: e }); d = addDays(d, 7); } return out; }
  const step = p === "Quarterly" ? 3 : p === "Half-Yearly" ? 6 : p === "Yearly" ? 12 : 1;
  let y = Number(from.slice(0, 4)), m = Number(from.slice(5, 7)) - 1;
  while (true) {
    const start = `${y}-${String(m + 1).padStart(2, "0")}-01`;
    if (start > to) break;
    const em = m + step - 1; const ey = y + Math.floor(em / 12); const emm = em % 12;
    const last = new Date(Date.UTC(ey, emm + 1, 0)).toISOString().slice(0, 10);
    const s = start < from ? from : start; const e = last > to ? to : last;
    const label = step === 12 ? `${y}` : step === 1 ? `${MON[m]} ${y}` : `${MON[m]}-${MON[emm]} ${ey}`;
    out.push({ key: `p${s.replace(/-/g, "")}`, label, from: s, to: e });
    m += step; y += Math.floor(m / 12); m %= 12;
  }
  return out;
}

export const partyName = (type: string, party: string) => {
  const d = adapter.get(type, party); if (!d) return party;
  return S(d[type === "Customer" ? "customer_name" : type === "Supplier" ? "supplier_name" : type === "Employee" ? "employee_name" : "title"] ?? party) || party;
};
export const itemName = (code: string) => S(adapter.get("Item", code)?.["item_name"] ?? code);
export const account = (name: string) => adapter.get("Account", name);
export const companyCurrency = (c: string) => S(adapter.get("Company", c)?.["default_currency"] ?? "SAR") || "SAR";

/** Live GL entries of one company (is_cancelled = 0). */
export const glOf = (company?: string) => adapter.list("GL Entry").filter((g) => !n(g["is_cancelled"]) && (!company || g["company"] === company));
/** Live Stock Ledger entries, in posting order. */
export const sleOf = (company?: string) => adapter.list("Stock Ledger Entry").filter((e) => !n(e["is_cancelled"]) && (!company || !e["company"] || e["company"] === company))
  .sort((a, b) => `${a["posting_date"]}${a["posting_time"] ?? ""}${a["creation"] ?? ""}`.localeCompare(`${b["posting_date"]}${b["posting_time"] ?? ""}${b["creation"] ?? ""}`));
export const submitted = (dt: string, company?: string) => adapter.list(dt).filter((d) => sub(d) && (!company || d["company"] === company));

/** accounts whose account_type is Receivable / Payable (Payment Ledger Entry source accounts). */
export function partyAccounts(company?: string): Map<string, "Receivable" | "Payable"> {
  const m = new Map<string, "Receivable" | "Payable">();
  for (const a of adapter.list("Account")) if ((!company || a["company"] === company) && (a["account_type"] === "Receivable" || a["account_type"] === "Payable")) m.set(a.name, a["account_type"] as "Receivable" | "Payable");
  return m;
}

/** Payment Ledger Entries as erpnext/accounts/utils.py create_payment_ledger_entry builds them from the GL map of
 *  receivable/payable lines: amount = debit − credit (account currency), against = against_voucher or the voucher itself. */
export interface Ple { posting_date: string; company: string; account: string; account_type: string; party_type: string; party: string; voucher_type: string; voucher_no: string; against_voucher_type: string; against_voucher_no: string; amount: number; amount_in_account_currency: number; account_currency: string; due_date: string; remarks: string }
export function paymentLedger(company?: string): Ple[] {
  const acc = partyAccounts(company); const out: Ple[] = [];
  for (const g of glOf(company)) {
    const t = acc.get(S(g["account"])); if (!t || !g["party"]) continue;
    const amt = r2(n(g["debit"]) - n(g["credit"])); const amtAc = r2(n(g["debit_in_account_currency"] ?? g["debit"]) - n(g["credit_in_account_currency"] ?? g["credit"]));
    const avt = S(g["against_voucher_type"]) || S(g["voucher_type"]); const av = S(g["against_voucher"]) || S(g["voucher_no"]);
    const inv = adapter.get(avt, av);
    out.push({ posting_date: S(g["posting_date"]), company: S(g["company"]), account: S(g["account"]), account_type: t, party_type: S(g["party_type"]), party: S(g["party"]), voucher_type: S(g["voucher_type"]), voucher_no: S(g["voucher_no"]),
      against_voucher_type: avt, against_voucher_no: av, amount: amt, amount_in_account_currency: amtAc, account_currency: S(account(S(g["account"]))?.["account_currency"]) || companyCurrency(S(g["company"])),
      due_date: S(inv?.["due_date"] ?? inv?.["posting_date"] ?? g["posting_date"]), remarks: S(g["remarks"]) });
  }
  return out;
}

/** Group subtotal helper: inserts a bold total row after each group of `key`. */
export function withGroupTotals(list: Row[], key: string, sumKeys: string[], label = "Total"): Row[] {
  const out: Row[] = []; let cur: string | null = null; let acc: Record<string, number> = {};
  const flush = () => { if (cur === null) return; out.push({ [key]: `${label} — ${cur}`, ...Object.fromEntries(sumKeys.map((k) => [k, r2(acc[k] ?? 0)])), is_total: true, bold: true }); };
  for (const r of list) {
    const g = S(r[key]);
    if (g !== cur) { flush(); cur = g; acc = {}; }
    for (const k of sumKeys) acc[k] = (acc[k] ?? 0) + n(r[k]);
    out.push(r);
  }
  flush();
  return out;
}
export function totalRow(list: Row[], labelKey: string, sumKeys: string[], label = "Total"): Row {
  return { [labelKey]: label, ...Object.fromEntries(sumKeys.map((k) => [k, r2(list.filter((r) => !r.is_total).reduce((a, r) => a + n(r[k]), 0))])), is_total: true, bold: true };
}

export const C0: RFilter = { fieldname: "company", label: "Company", fieldtype: "Link", options: "Company", default: "__company" };
export const FROM: RFilter = { fieldname: "from_date", label: "From Date", fieldtype: "Date", default: "__fy_start" };
export const TO: RFilter = { fieldname: "to_date", label: "To Date", fieldtype: "Date", default: "__fy_end" };
export const fl = (fieldname: string, label: string, fieldtype = "Link", options?: string | string[], dflt?: string): RFilter => ({ fieldname, label, fieldtype, ...(options ? { options } : {}), ...(dflt !== undefined ? { default: dflt } : {}) });
