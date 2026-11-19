/**
 * SC-F-13 VAT selectors — read-only trace of posted tax: GL Entry rows on Tax-type accounts (is_cancelled = 0),
 * grouped by account and by voucher, with the voucher's native net/grand totals. No filing logic, no ZATCA.
 */
import type { Doc } from "@/lib/adapter";

const n = (v: unknown) => Number(v) || 0;
const r2 = (x: number) => Math.round(x * 100) / 100;
export interface VatAccount { account: string; side: "Output" | "Input"; debit: number; credit: number; net: number; entries: number }
export interface VatVoucher { voucherType: string; voucherNo: string; date: string; party: string; tax: number; side: "Output" | "Input"; account: string }

/** taxAccounts: Account names with account_type Tax; side from GL sign (credit-heavy = Output). */
export function vatTrace(gl: Doc[], taxAccounts: Set<string>, company: string, from: string, to: string) {
  const rows = gl.filter((g) => !n(g["is_cancelled"]) && taxAccounts.has(String(g["account"])) && (!company || g["company"] === company)
    && (!from || String(g["posting_date"]) >= from) && (!to || String(g["posting_date"]) <= to));
  const acc = new Map<string, VatAccount>(); const vch = new Map<string, VatVoucher>();
  for (const g of rows) {
    const a = String(g["account"]); const x = acc.get(a) ?? { account: a, side: "Output", debit: 0, credit: 0, net: 0, entries: 0 };
    x.debit = r2(x.debit + n(g["debit"])); x.credit = r2(x.credit + n(g["credit"])); x.entries++; acc.set(a, x);
    const k = `${g["voucher_type"]}|${g["voucher_no"]}|${a}`; const v = vch.get(k) ?? { voucherType: String(g["voucher_type"] ?? ""), voucherNo: String(g["voucher_no"] ?? ""), date: String(g["posting_date"] ?? ""), party: String(g["party"] ?? ""), tax: 0, side: "Output", account: a };
    v.tax = r2(v.tax + n(g["credit"]) - n(g["debit"])); vch.set(k, v);
  }
  const accounts = [...acc.values()].map((x) => ({ ...x, net: r2(x.credit - x.debit), side: (x.credit >= x.debit ? "Output" : "Input") as VatAccount["side"] })).sort((a, b) => a.account.localeCompare(b.account));
  // side follows the tax account (returns stay on their account as negative tax), as in ERPNext VAT reports
  const sideOf = new Map(accounts.map((a) => [a.account, a.side]));
  const vouchers = [...vch.values()].map((v) => { const side = sideOf.get(v.account) ?? "Output"; return { ...v, side, tax: side === "Output" ? v.tax : r2(-v.tax) }; }).sort((a, b) => b.date.localeCompare(a.date));
  const output = r2(accounts.reduce((s, a) => s + a.net, 0) + accounts.filter((a) => a.side === "Input").reduce((s, a) => s - a.net, 0));
  const input = r2(accounts.filter((a) => a.side === "Input").reduce((s, a) => s - a.net, 0));
  return { accounts, vouchers, output, input, net: r2(output - input) };
}
