/**
 * Exchange Rate Revaluation — synthetic-preview port of
 * erpnext/accounts/doctype/exchange_rate_revaluation/exchange_rate_revaluation.py
 * (get_accounts_data / calculate_new_account_balance / make_jv_for_revaluation, rounding_loss_allowance).
 * Reads balances from GL Entry; the gain/loss is booked only through a Journal Entry submitted by posting.ts.
 */
import { adapter, type Doc } from "./adapter";
import { resolveName } from "./rename";

const n = (v: unknown) => Number(v) || 0;
const r2 = (x: number) => Math.round(x * 100) / 100;
const sameCo = (a: unknown, b: unknown) => resolveName("Company", String(a ?? "")) === resolveName("Company", String(b ?? ""));
const company = (d: Doc) => adapter.get("Company", resolveName("Company", String(d["company"] ?? "")));

/** Latest Currency Exchange rate on or before date (setup/utils.py get_exchange_rate). */
export function rateOn(from: string, to: string, date: string): number {
  if (from === to) return 1;
  const xs = adapter.list("Currency Exchange").filter((x) => String(x["date"]) <= date);
  const direct = xs.filter((x) => x["from_currency"] === from && x["to_currency"] === to).sort((a, b) => String(b["date"]).localeCompare(String(a["date"])))[0];
  if (direct) return n(direct["exchange_rate"]);
  const inv = xs.filter((x) => x["from_currency"] === to && x["to_currency"] === from).sort((a, b) => String(b["date"]).localeCompare(String(a["date"])))[0];
  return inv && n(inv["exchange_rate"]) ? 1 / n(inv["exchange_rate"]) : 0;
}

/** "Get Entries": foreign-currency account (and party) balances revalued at the posting-date rate. */
export function getEntries(d: Doc): Record<string, unknown> {
  const co = company(d); const base = String(co?.["default_currency"] ?? "SAR"); const date = String(d["posting_date"] ?? new Date().toISOString().slice(0, 10));
  const allow = n(d["rounding_loss_allowance"] ?? 0.05);
  if (allow < 0 || allow >= 1) throw new Error("Rounding Loss Allowance should be between 0 and 1");
  const bal = new Map<string, { account: string; party_type: string; party: string; ac: number; bc: number }>();
  for (const g of adapter.list("GL Entry")) {
    if (n(g["is_cancelled"]) || !sameCo(g["company"], d["company"]) || String(g["posting_date"]) > date) continue;
    const a = adapter.get("Account", String(g["account"])); const cur = String(a?.["account_currency"] ?? base);
    if (!a || cur === base) continue;
    const k = `${g["account"]}\u0000${g["party_type"] ?? ""}\u0000${g["party"] ?? ""}`;
    const e = bal.get(k) ?? { account: String(g["account"]), party_type: String(g["party_type"] ?? ""), party: String(g["party"] ?? ""), ac: 0, bc: 0 };
    e.ac += n(g["debit_in_account_currency"]) - n(g["credit_in_account_currency"]); e.bc += n(g["debit"]) - n(g["credit"]); bal.set(k, e);
  }
  const accounts: Record<string, unknown>[] = []; let unbooked = 0, booked = 0;
  for (const e of bal.values()) {
    const cur = String(adapter.get("Account", e.account)?.["account_currency"]);
    const ac = r2(e.ac), bc = r2(e.bc); if (!ac && !bc) continue;
    const zero = Math.abs(ac) <= allow || Math.abs(bc) <= allow ? 1 : 0;
    const newRate = zero ? 0 : rateOn(cur, base, date);
    const newBc = zero ? 0 : r2(ac * newRate); const gain = r2(newBc - bc);
    if (!gain) continue;
    if (zero) booked += gain; else unbooked += gain;
    accounts.push({ idx: accounts.length + 1, account: e.account, party_type: e.party_type, party: e.party, account_currency: cur,
      balance_in_account_currency: ac, new_balance_in_account_currency: zero ? 0 : ac, current_exchange_rate: ac ? r2((bc / ac) * 1e6) / 1e6 : 0, new_exchange_rate: newRate,
      balance_in_base_currency: bc, new_balance_in_base_currency: newBc, gain_loss: gain, zero_balance: zero });
  }
  return { accounts, gain_loss_unbooked: r2(unbooked), gain_loss_booked: r2(booked), total_gain_loss: r2(unbooked + booked) };
}

export function revaluationErrors(d: Doc): string[] {
  const rows = (d["accounts"] as Record<string, unknown>[] | undefined) ?? [];
  if (!rows.length) return ["Please select Get Entries to fetch the accounts to revalue"];
  const co = company(d); if (!co?.["exchange_gain_loss_account"]) return [`Please set Unrealized Exchange Gain/Loss Account in Company ${d["company"]}`];
  return [];
}

/** "Create > Journal Entries": base-currency adjustment per row, offset to the company exchange gain/loss account. */
export function makeRevaluationJournal(d: Doc, reverse = false): string {
  const errs = revaluationErrors(d); if (errs.length) throw new Error(errs[0]);
  const prior = adapter.list("Journal Entry").find((j) => j["revaluation_reference"] === d.name && !!j["is_reversal"] === reverse && n(j.docstatus) !== 2);
  if (prior) return prior.name;
  const s = reverse ? -1 : 1; const co = company(d)!; const gl = resolveName("Account", String(co["exchange_gain_loss_account"]));
  const lines = ((d["accounts"] as Record<string, unknown>[]) ?? []).map((r, i) => {
    const g = s * n(r["gain_loss"]);
    return { idx: i + 1, account: r["account"], party_type: r["party_type"] || undefined, party: r["party"] || undefined, account_currency: r["account_currency"], exchange_rate: r["new_exchange_rate"],
      debit_in_account_currency: 0, credit_in_account_currency: 0, debit: Math.max(r2(g), 0), credit: Math.max(r2(-g), 0), reference_type: "Exchange Rate Revaluation", reference_name: d.name };
  });
  const tot = s * n(d["total_gain_loss"]);
  lines.push({ idx: lines.length + 1, account: gl, party_type: undefined, party: undefined, account_currency: co["default_currency"], exchange_rate: 1,
    debit_in_account_currency: Math.max(r2(-tot), 0), credit_in_account_currency: Math.max(r2(tot), 0), debit: Math.max(r2(-tot), 0), credit: Math.max(r2(tot), 0), reference_type: "Exchange Rate Revaluation", reference_name: d.name });
  const j = adapter.insertDoc("Journal Entry", { voucher_type: "Exchange Rate Revaluation", company: d["company"], posting_date: d["posting_date"], multi_currency: 1, revaluation_reference: d.name, is_reversal: reverse ? 1 : 0,
    user_remark: `${reverse ? "Reversal of " : ""}Revaluation Journal with reference to Exchange Rate Revaluation ${d.name}`, accounts: lines, docstatus: 0 });
  return j.name;
}
