/**
 * DIGIT shared Core exchange differences on allocated payments (ERPNext 2026, U26F-07). Port of payment_entry.py
 * set_exchange_gain_loss + accounts/utils.py create_gain_loss_journal: when a payment in the party account's foreign
 * currency settles an invoice booked at another rate, the allocated amount × (payment rate − invoice rate) is left on the
 * party account in company currency. An authorised user books it as a native Journal Entry of type "Exchange Gain Or
 * Loss" (party row in account currency 0, against the invoice; the other row on the company exchange gain/loss account),
 * posted by posting.ts, linked back to the payment, so the party account and the invoice close at zero in both currencies.
 */
import { adapter, type Doc } from "@/lib/adapter";
import { cachedMeta } from "@/lib/catalog";
import { createDraft, saveDocument, submitDocument } from "@/lib/documentApi";
import { foreignRate, postVouchers } from "@/lib/posting";
import { currentUser, hasPerm } from "@/lib/session";
import { resolveName, wasRenamed } from "@/lib/rename";

const n = (v: unknown) => Number(v) || 0;
const s = (v: unknown) => String(v ?? "");
const r2 = (x: number) => Math.round(x * 100) / 100;
export const FX_JE_TYPE = "Exchange Gain Or Loss";
export const FX_LINK = "digit_against_payment";

export interface FxLine { idx: number; doctype: string; invoice: string; currency: string; allocated: number; invoiceRate: number; paymentRate: number; difference: number; kind: "gain" | "loss" | "none" }

const coCurrency = (company: string) => s(adapter.get("Company", company)?.["default_currency"]) || "SAR";

/** One line per allocated invoice in a foreign currency: difference in company currency (positive = gain). */
export function exchangeLines(pe: Doc): FxLine[] {
  const recv = pe["payment_type"] === "Receive"; const rate = n(recv ? pe["source_exchange_rate"] : pe["target_exchange_rate"]) || 1; const coCur = coCurrency(s(pe["company"]));
  const out: FxLine[] = [];
  for (const r of (pe["references"] as Doc[] | undefined) ?? []) {
    const dt = s(r["reference_doctype"]); if (dt !== "Sales Invoice" && dt !== "Purchase Invoice") continue;
    const inv = adapter.get(dt, s(r["reference_name"])); if (!inv || foreignRate(inv) === 1) continue;
    const invRate = n(inv["conversion_rate"]) || 1; const alloc = n(r["allocated_amount"]); if (!alloc) continue;
    // receivable: paying at a higher rate than the invoice clears more riyals than were booked → gain; payable: the reverse
    const diff = r2(alloc * (rate - invRate) * (recv ? 1 : -1));
    out.push({ idx: n(r["idx"]), doctype: dt, invoice: inv.name, currency: s(inv["currency"]) || coCur, allocated: alloc, invoiceRate: invRate, paymentRate: rate, difference: diff, kind: Math.abs(diff) < 0.005 ? "none" : diff > 0 ? "gain" : "loss" });
  }
  return out;
}

/** The submitted exchange gain/loss journal already booked for this payment, if any. */
export function bookedJournal(pe: string): Doc | undefined {
  return adapter.list("Journal Entry").find((j) => j[FX_LINK] === pe && n(j.docstatus) === 1);
}

/** create_gain_loss_journal needs create + submit on Journal Entry (Accounts User / Manager in source). */
export function mayBookExchange(user = currentUser()): boolean { const m = cachedMeta("Journal Entry"); return !!m && hasPerm(m, "create", undefined, user) && hasPerm(m, "submit", undefined, user); }

export function exchangeAccount(company: string): string {
  const co = adapter.get("Company", company); const ab = s(co?.["abbr"]);
  const fallback = resolveName("Account", `Exchange Gain/Loss - ${ab}`);
  return (s(co?.["exchange_gain_loss_account"]) && resolveName("Account", s(co?.["exchange_gain_loss_account"]))) || (adapter.get("Account", fallback) ? fallback : "");
}

export function bookExchangeDifference(peName: string, user = currentUser()): { ok: true; journal: string; amount: number } | { ok: false; reason: [string, string] } {
  const pe = adapter.get("Payment Entry", peName);
  if (!pe || n(pe.docstatus) !== 1) return { ok: false, reason: ["The payment must be submitted first", "يجب ترحيل الدفعة أولاً"] };
  if (!mayBookExchange(user)) return { ok: false, reason: ["Not permitted", "غير مسموح"] };
  const done = bookedJournal(peName); if (done) return { ok: false, reason: [`Already booked in ${done.name}`, `سُجّل مسبقًا في ${done.name}`] };
  const lines = exchangeLines(pe).filter((l) => l.kind !== "none"); if (!lines.length) return { ok: false, reason: ["No exchange difference on this payment", "لا يوجد فرق عملة في هذه الدفعة"] };
  const company = s(pe["company"]); const gl = exchangeAccount(company); if (!gl) return { ok: false, reason: ["Set the company Exchange Gain / Loss Account first", "حدّد حساب أرباح وخسائر فروق العملة للشركة أولاً"] };
  const recv = pe["payment_type"] === "Receive"; const pacct = s(recv ? pe["paid_from"] : pe["paid_to"]); const acCur = s(adapter.get("Account", pacct)?.["account_currency"]);
  const accounts: Record<string, unknown>[] = []; let net = 0;
  for (const l of lines) {
    // the party row clears the riyal residue left on the party account: receivable debit = gain; payable credit = loss
    const v = recv ? l.difference : -l.difference; net = r2(net + v);
    accounts.push({ idx: accounts.length + 1, account: pacct, account_currency: acCur, exchange_rate: l.paymentRate, party_type: pe["party_type"], party: pe["party"], reference_type: l.doctype, reference_name: l.invoice,
      debit_in_account_currency: 0, credit_in_account_currency: 0, debit: Math.max(v, 0), credit: Math.max(-v, 0) });
  }
  const g = -net; // the exchange gain/loss account takes the other side (credit = gain)
  accounts.push({ idx: accounts.length + 1, account: gl, account_currency: coCurrency(company), exchange_rate: 1, debit_in_account_currency: Math.max(g, 0), credit_in_account_currency: Math.max(-g, 0), debit: Math.max(g, 0), credit: Math.max(-g, 0) });
  const tot = r2(accounts.reduce((t, a) => t + n(a["debit"]), 0));
  const meta = cachedMeta("Journal Entry"); if (!meta) return { ok: false, reason: ["Journal Entry is not available", "قيد اليومية غير متاح"] };
  const dr = createDraft(meta, { mapped: { company, posting_date: pe["posting_date"], voucher_type: FX_JE_TYPE, multi_currency: 1, [FX_LINK]: peName, user_remark: `Exchange gain/loss on ${peName}`, accounts, total_debit: tot, total_credit: tot } });
  if (dr.errors.length || !dr.doc) return { ok: false, reason: [dr.errors.join("; "), dr.errors.join("؛ ")] };
  const saved = saveDocument(meta, dr.doc.name, {}, { user }); if (saved.errors.length || !saved.name) return { ok: false, reason: [saved.errors.join("; "), saved.errors.join("؛ ")] };
  const err = submitDocument(meta, saved.name, user); if (err.length) return { ok: false, reason: [err.join("; "), err.join("؛ ")] };
  const refs = ((pe["references"] as Doc[] | undefined) ?? []).map((r) => { const l = lines.find((x) => x.idx === n(r["idx"]) && x.invoice === r["reference_name"]); return l ? { ...r, exchange_rate: l.invoiceRate, exchange_gain_loss: l.difference } : r; });
  adapter.update("Payment Entry", peName, { references: refs });
  adapter.insertDoc("Comment", { comment_type: "Info", reference_doctype: "Payment Entry", reference_name: peName, content: `Exchange ${net >= 0 === recv ? "gain" : "loss"} ${Math.abs(net).toFixed(2)} booked in ${saved.name}`, owner: user });
  return { ok: true, journal: saved.name, amount: net };
}

/** Demo (insert-if-missing, explicit names): a USD receivable account, an exchange gain/loss account, a USD customer, a
 *  USD invoice at 3.75 and a part payment at 3.76 — 25.00 riyals of exchange gain waiting to be booked. */
export function seedExchangeDemo(): number {
  // the demo company is the one holding the USD bank account (seedDemo masters), whatever other companies exist
  const usdBank = adapter.list("Account").find((a) => /^USD Bank - /.test(a.name) && s(a["account_currency"]) === "USD");
  const co = usdBank ? adapter.get("Company", s(usdBank["company"])) : undefined; if (!co || s(co["default_currency"]) !== "SAR") return 0;
  const A = s(co["abbr"]); const C = co.name; let added = 0;
  // insert-if-missing; a demo record renamed (Arabic-first demo names) or deleted by the user is never re-created
  const put = (dt: string, name: string, data: Record<string, unknown>) => { if (adapter.get(dt, name) || wasRenamed(dt, name)) return false; adapter.insertDoc(dt, { ...data, name, __synthetic: 1 }); added++; return true; };
  const ac = (x: string) => resolveName("Account", `${x} - ${A}`);
  if (!adapter.get("Account", ac("Current Assets")) || !adapter.get("Account", ac("USD Bank"))) return 0;
  put("Account", `Debtors USD - ${A}`, { account_name: "Debtors USD", parent_account: ac("Current Assets"), root_type: "Asset", account_type: "Receivable", is_group: 0, company: C, account_currency: "USD" });
  const exp = adapter.get("Account", ac("Expenses")) ? ac("Expenses") : "";
  put("Account", `Exchange Gain/Loss - ${A}`, { account_name: "Exchange Gain/Loss", parent_account: exp, root_type: "Expense", account_type: "", is_group: 0, company: C, account_currency: "SAR" });
  if (!co["exchange_gain_loss_account"] && adapter.get("Account", ac("Exchange Gain/Loss"))) adapter.update("Company", C, { exchange_gain_loss_account: ac("Exchange Gain/Loss") });
  const cust = `${A}-CUST-USD-01`;
  put("Customer", cust, { customer_name: "شركة الخليج للتجارة الدولية", customer_type: "Company", customer_group: adapter.list("Customer Group").find((g) => !n(g["is_group"]))?.name ?? "", territory: adapter.list("Territory").find((t) => !n(t["is_group"]))?.name ?? "",
    default_currency: "USD", accounts: [{ idx: 1, company: C, account: ac("Debtors USD") }] });
  const income = adapter.get("Account", ac("Service Income")) ? ac("Service Income") : ac("Sales");
  const item = adapter.list("Item").find((i) => !n(i["disabled"]) && !n(i["is_stock_item"]) && !n(i["has_variants"])) ?? adapter.list("Item").find((i) => !n(i["disabled"]));
  const si = `${A}-SINV-USD-0001`, pe = `${A}-PE-USD-0001`; const vouchers: [string, Doc][] = [];
  if (item && put("Sales Invoice", si, { company: C, customer: cust, customer_name: "شركة الخليج للتجارة الدولية", posting_date: "2026-10-05", due_date: "2026-11-04", currency: "USD", conversion_rate: 3.75, party_account_currency: "USD", debit_to: ac("Debtors USD"),
    selling_price_list: "Standard Selling", price_list_currency: "USD", plc_conversion_rate: 3.75, update_stock: 0,
    items: [{ idx: 1, item_code: item.name, item_name: item["item_name"], qty: 1, rate: 4000, amount: 4000, net_amount: 4000, base_rate: 15000, base_amount: 15000, base_net_amount: 15000, uom: item["stock_uom"], conversion_factor: 1, income_account: income }],
    total: 4000, net_total: 4000, grand_total: 4000, rounded_total: 4000, base_total: 15000, base_net_total: 15000, base_grand_total: 15000, base_rounded_total: 15000, outstanding_amount: 4000, taxes: [], status: "Unpaid", docstatus: 1, creation: "2026-10-05 10:00:00" }))
    vouchers.push(["Sales Invoice", adapter.get("Sales Invoice", si)!]);
  if (adapter.get("Sales Invoice", si) && put("Payment Entry", pe, { payment_type: "Receive", party_type: "Customer", party: cust, party_name: "شركة الخليج للتجارة الدولية", company: C, posting_date: "2026-11-03",
    paid_from: ac("Debtors USD"), paid_from_account_currency: "USD", paid_to: ac("USD Bank"), paid_to_account_currency: "USD", paid_amount: 2500, received_amount: 2500, source_exchange_rate: 3.76, target_exchange_rate: 3.76,
    base_paid_amount: 9400, base_received_amount: 9400, mode_of_payment: "Wire Transfer", reference_no: "SWIFT-77120", reference_date: "2026-11-03",
    references: [{ idx: 1, reference_doctype: "Sales Invoice", reference_name: si, total_amount: 4000, outstanding_amount: 4000, allocated_amount: 2500, exchange_rate: 3.75 }], docstatus: 1, creation: "2026-11-03 11:00:00" }))
    vouchers.push(["Payment Entry", adapter.get("Payment Entry", pe)!]);
  if (vouchers.length) postVouchers(vouchers);
  return added;
}
