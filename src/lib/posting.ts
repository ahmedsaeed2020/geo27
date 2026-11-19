import { departmentSubmitErrors, departmentSubmitPatch, departmentAfter, departmentCancelErrors, KEEP_STATUS } from "./departments";
import { resolveName } from "./rename";
import { crmAfter } from "./crmHandoff";
/**
 * Local posting engine — synthetic-preview port of the ERPNext controllers' on_submit / on_cancel ledger logic:
 *  - erpnext/accounts/general_ledger.py make_gl_entries / make_reverse_gl_entries
 *  - erpnext/controllers/accounts_controller.py set outstanding / status (Unpaid, Partly Paid, Paid, Overdue, Return)
 *  - erpnext/stock/stock_ledger.py make_sl_entries + repost (moving average, qty_after_transaction)
 *  - frappe/model/document.py amend (name-1, amended_from)
 * Runs only over adapter records. Perpetual inventory is off for the demo company, so stock vouchers write
 * Stock Ledger Entries only (ERPNext behaviour with enable_perpetual_inventory = 0). Server hooks beyond this are not run.
 */
import { adapter, DocValidationError, type Doc } from "./adapter";
import { revaluationErrors } from "./revaluation";
import { budgetCheck } from "./budget";
import { userRoles } from "./session";
import { rowMatch, ambiguousRow, sellingErrors, backLinkErrors } from "./selling";
import { serialBatchErrors, applySerialBatch, serialCancelErrors, autoSerialBatch, autoPickOutward } from "./serialBatch";
import { stockEntryErrors, negativeStockErrors, recoLines, recoErrors, lcvErrors, applyLcv, lcvDistribution, rateAt, consumeReservation } from "./stock";
import { isDeferred, deferredAccount, deferredErrors } from "./deferred";
import { rowDims, dimensionErrors, offsetLines, offsettingErrors } from "./dimensions";

const n = (v: unknown) => Number(v) || 0;
const r2 = (x: number) => Math.round(x * 100) / 100;
const today = () => new Date().toISOString().slice(0, 10);
type Line = { account: string; debit: number; credit: number; dac?: number; cac?: number; party_type?: string; party?: string; against?: [string, string] | undefined; cost_center?: string; project?: string; dims?: Record<string, string>; remarks?: string; posting_date?: string };
type Sl = { item_code: string; warehouse: string; actual_qty: number; incoming_rate: number; reco_qty?: number; reco_rate?: number };

export const GL_DOCTYPES = ["Sales Invoice", "Purchase Invoice", "Payment Entry", "Journal Entry", "Period Closing Voucher", "Process Deferred Accounting"];
export const STOCK_DOCTYPES = ["Stock Entry", "Purchase Receipt", "Delivery Note", "Stock Reconciliation"];
/** Company.enable_perpetual_inventory (ERPNext default 1 for new companies). */
export const perpetual = (d: Doc) => n(adapter.get("Company", resolveName("Company", String(d["company"] ?? "")))?.["enable_perpetual_inventory"]) === 1;
const coAcct = (d: Doc, field: string, fallback: string) => RA(String(adapter.get("Company", resolveName("Company", String(d["company"] ?? "")))?.[field] || `${fallback} - ${abbr(d)}`));
const abbr = (d: Doc) => String(adapter.get("Company", String(d["company"]))?.["abbr"] ?? "");
const RA = (a: string) => resolveName("Account", a);
const acct = (name: string, fallback: string) => (adapter.get("Account", RA(name)) ? RA(name) : RA(fallback));
const dc = (x: number): [number, number] => [Math.max(r2(x), 0), Math.max(r2(-x), 0)];
const rows = (d: Doc, f: string) => ((d[f] as Record<string, unknown>[] | undefined) ?? []);

/** Payable amount used for outstanding and party GL (accounts_controller: rounded_total unless disable_rounded_total). */
export const payable = (d: Doc) => r2(n(d["disable_rounded_total"]) || !d["rounded_total"] ? n(d["grand_total"]) : n(d["rounded_total"]));

/** GL lines a submitted voucher produces (sales_invoice.py / purchase_invoice.py / payment_entry.py / journal_entry.py get_gl_entries). */
/** conversion_rate of a document whose currency differs from its company's default currency, else 1. */
export function foreignRate(d: Doc): number {
  const coCur = String(adapter.get("Company", String(d["company"]))?.["default_currency"] ?? "SAR"); const cur = String(d["currency"] ?? coCur) || coCur;
  return cur !== coCur ? n(d["conversion_rate"]) || 1 : 1;
}
export function glLines(dt: string, d: Doc): Line[] {
  const ab = abbr(d); const L: Line[] = [];
  const add = (account: string, amt: number, extra: Partial<Line> = {}) => { const [debit, credit] = dc(amt); if (debit || credit) L.push({ account: RA(account), debit, credit, ...extra }); };
  if (dt === "Sales Invoice" || dt === "Purchase Invoice") {
    const sales = dt === "Sales Invoice"; const sign = sales ? 1 : -1;
    const party = sales ? String(d["customer"] ?? "") : String(d["supplier"] ?? "");
    const pacct = String(d[sales ? "debit_to" : "credit_to"] ?? `${sales ? "Debtors" : "Creditors"} - ${ab}`);
    const pay = payable(d), grand = n(d["grand_total"]), net = n(d["net_total"] ?? grand);
    // accounts_controller / general_ledger: a foreign-currency invoice posts company-currency amounts (x conversion_rate);
    // the party account keeps the invoice currency amount when it is held in that currency (party_account_currency)
    const fx = foreignRate(d); const cur = String(d["currency"] ?? "");
    if (fx !== 1) {
      const pa = RA(pacct); const inAc = String(adapter.get("Account", pa)?.["account_currency"] ?? "") === cur; const v = sign * pay;
      const [debit, credit] = dc(v * fx); if (debit || credit) L.push({ account: pa, debit, credit, ...(inAc ? { dac: Math.max(r2(v), 0), cac: Math.max(r2(-v), 0) } : {}), party_type: sales ? "Customer" : "Supplier", party, against: [dt, String(d["return_against"] || d.name)] });
    } else
    add(pacct, sign * pay, { party_type: sales ? "Customer" : "Supplier", party, against: [dt, String(d["return_against"] || d.name)] });
    const addX = (account: string, amt: number, extra: Partial<Line> = {}) => add(account, amt * fx, extra);
    // item lines: income/expense account per item on net amounts (discount already applied to net_amount)
    const items = rows(d, "items"); const by = new Map<string, number>();
    const itemNet = items.reduce((s, x) => s + n(x["net_amount"] ?? x["amount"]), 0) || net;
    const srbnb = !sales && perpetual(d) ? coAcct(d, "stock_received_but_not_billed", "Stock Received But Not Billed") : "";
    for (const x of items) { const a = isDeferred(dt, x) && deferredAccount(dt, x) ? deferredAccount(dt, x) : srbnb && x["purchase_receipt"] ? srbnb : String(x[sales ? "income_account" : "expense_account"] || (sales ? `Sales - ${ab}` : `Stock In Hand - ${ab}`)); const k = `${a}\u0001${JSON.stringify(rowDims(x, d))}`; by.set(k, (by.get(k) ?? 0) + n(x["net_amount"] ?? x["amount"]) * (net / itemNet)); }
    if (!items.length) by.set(`${sales ? `Sales - ${ab}` : `Stock In Hand - ${ab}`}\u0001${JSON.stringify(rowDims(undefined, d))}`, net);
    for (const [k, v] of by) { const [a, dj] = k.split("\u0001"); const dims = dj ? JSON.parse(dj) as Record<string, string> : {}; addX(a!, -sign * v, { dims, ...(dims["cost_center"] ? { cost_center: dims["cost_center"] } : {}), ...(dims["project"] ? { project: dims["project"] } : {}) }); }
    // tax lines (taxes table account_head / tax_amount_after_discount_amount)
    // purchase taxes and charges with add_deduct_tax "Deduct" (e.g. retention held) reduce the total and credit their account
    const taxAmt = (t: Record<string, unknown>) => { const v = n(t["tax_amount_after_discount_amount"] ?? t["tax_amount"]); return !sales && t["add_deduct_tax"] === "Deduct" ? -Math.abs(v) : v; };
    const taxes = rows(d, "taxes"); const tsum = taxes.reduce((s, t) => s + taxAmt(t), 0);
    if (taxes.length && Math.abs(tsum - (grand - net)) < 0.05) for (const t of taxes) addX(String(t["account_head"] || `VAT 15% ${sales ? "Output" : "Input"} - ${ab}`), -sign * taxAmt(t));
    else if (grand - net) addX(`VAT 15% ${sales ? "Output" : "Input"} - ${ab}`, -sign * (grand - net));
    // rounding adjustment (make_gle_for_rounding_adjustment) to the company Round Off account
    if (Math.abs(pay - grand) >= 0.005) addX(acct(`Round Off - ${ab}`, sales ? `Sales - ${ab}` : `Stock In Hand - ${ab}`), -sign * (pay - grand));
  } else if (dt === "Payment Entry") {
    const a = n(d["paid_amount"]); const pt = String(d["party_type"] ?? ""), party = String(d["party"] ?? "");
    const ref = rows(d, "references")[0]; const against: [string, string] | undefined = ref ? [String(ref["reference_doctype"]), String(ref["reference_name"])] : undefined;
    // payment_entry.py add_party_gl_entries: one party line per allocated reference (against that voucher), the
    // unallocated rest on its own line — so one receipt for several invoices settles each of them in the ledger
    const alloc = rows(d, "references").filter((r) => n(r["allocated_amount"]) > 0 && r["reference_name"]);
    const partyGl = (account: string, sign: 1 | -1) => {
      if (!alloc.length || alloc.reduce((t, r) => t + n(r["allocated_amount"]), 0) > a + 0.005) { add(account, sign * a, { party_type: pt, party, against }); return; }
      let left = a;
      for (const r of alloc) { const amt = r2(Math.min(left, n(r["allocated_amount"]))); if (amt <= 0) break; add(account, sign * amt, { party_type: pt, party, against: [String(r["reference_doctype"]), String(r["reference_name"])] }); left = r2(left - amt); }
      if (left > 0.005) add(account, sign * left, { party_type: pt, party });
    };
    // payment_entry.py with exchange rates: company-currency amounts are paid_amount x source_exchange_rate and
    // received_amount x target_exchange_rate; each account keeps its own currency amount (party lines per allocation)
    const sr = n(d["source_exchange_rate"]) || 1, tr = n(d["target_exchange_rate"]) || 1;
    if ((sr !== 1 || tr !== 1) && (d["payment_type"] === "Receive" || d["payment_type"] === "Pay") && (pt === "Customer" || pt === "Supplier")) {
      const recv = d["payment_type"] === "Receive"; const pacct = String(recv ? d["paid_from"] : d["paid_to"]), bank = String(recv ? d["paid_to"] : d["paid_from"]);
      const pAmt = recv ? a : n(d["received_amount"] ?? a), pRate = recv ? sr : tr, bAmt = recv ? n(d["received_amount"] ?? a) : a, bRate = recv ? tr : sr;
      const fxAdd = (account: string, ac: number, rate: number, extra: Partial<Line> = {}) => { const acc = RA(account); const coCur = String(adapter.get("Company", String(d["company"]))?.["default_currency"] ?? "SAR"); const inAc = String(adapter.get("Account", acc)?.["account_currency"] ?? coCur) !== coCur;
        const [debit, credit] = dc(ac * rate); if (debit || credit) L.push({ account: acc, debit, credit, ...(inAc ? { dac: Math.max(r2(ac), 0), cac: Math.max(r2(-ac), 0) } : {}), ...extra }); };
      const ps = recv ? -1 : 1; let left = pAmt;
      if (alloc.length && alloc.reduce((t, r) => t + n(r["allocated_amount"]), 0) <= pAmt + 0.005) for (const r of alloc) { const amt = r2(Math.min(left, n(r["allocated_amount"]))); if (amt <= 0) break; fxAdd(pacct, ps * amt, pRate, { party_type: pt, party, against: [String(r["reference_doctype"]), String(r["reference_name"])] }); left = r2(left - amt); }
      if (left > 0.005) fxAdd(pacct, ps * left, pRate, { party_type: pt, party, ...(alloc.length ? {} : { against }) });
      fxAdd(bank, -ps * bAmt, bRate);
    } else if (d["payment_type"] === "Pay") { partyGl(String(d["paid_to"]), 1); add(String(d["paid_from"]), -a); }
    else if (d["payment_type"] === "Receive") { add(String(d["paid_to"]), a); partyGl(String(d["paid_from"]), -1); }
    else { add(String(d["paid_to"]), a); add(String(d["paid_from"]), -a); }
  } else if (dt === "Journal Entry") {
    for (const x of rows(d, "accounts")) {
      // multi-currency rows (journal_entry.py: base = account currency x exchange_rate) keep both amounts
      if (x["account_currency"] && x["exchange_rate"] !== undefined && (x["debit"] !== undefined || x["credit"] !== undefined)) {
        const base = n(x["debit"]) - n(x["credit"]); const ac = n(x["debit_in_account_currency"]) - n(x["credit_in_account_currency"]);
        if (base || ac) L.push({ account: RA(String(x["account"])), debit: Math.max(r2(base), 0), credit: Math.max(r2(-base), 0), dac: Math.max(r2(ac), 0), cac: Math.max(r2(-ac), 0),
          ...(x["party"] ? { party_type: String(x["party_type"] ?? ""), party: String(x["party"]), against: x["reference_name"] ? [String(x["reference_type"]), String(x["reference_name"])] as [string, string] : undefined } : {}) });
        continue;
      }
      const dims = rowDims(x, d); const dim = { dims, ...(x["cost_center"] ? { cost_center: String(x["cost_center"]) } : {}), ...(x["project"] ? { project: String(x["project"]) } : {}) };
      add(String(x["account"]), n(x["debit_in_account_currency"] ?? x["debit"]) - n(x["credit_in_account_currency"] ?? x["credit"]), x["party"] ? { ...dim, party_type: String(x["party_type"] ?? ""), party: String(x["party"]), against: x["reference_name"] ? [String(x["reference_type"]), String(x["reference_name"])] : undefined } : dim);
    }
  } else if (dt === "Period Closing Voucher") {
    for (const [a, v] of pclBalances(d)) add(a, -v);
    const net = r2([...pclBalances(d).values()].reduce((x, y) => x + y, 0));
    add(String(d["closing_account_head"]), net);
  } else if (dt === "Process Deferred Accounting") {
    // process_deferred_accounting.py make_gl_entries (book_deferred_entries_via_journal_entry = 0): one pair per period, dated at period end
    if (!n(d["via_journal_entry"])) for (const e of rows(d, "entries")) {
      const dims = (e["dims"] ?? {}) as Record<string, string>; const against: [string, string] = [String(e["invoice_type"]), String(e["invoice"])]; const amt = n(e["amount"]); const pd = String(e["posting_date"]);
      const x = { dims, against, posting_date: pd, ...(dims["cost_center"] ? { cost_center: dims["cost_center"] } : {}), ...(dims["project"] ? { project: dims["project"] } : {}) };
      add(String(e["debit_account"]), amt, x); add(String(e["credit_account"]), -amt, x);
    }
  }
  return L;
}

/** Income/Expense balances (Dr-Cr) for a PCV period (period_closing_voucher.py get_pcv_gl_entries / get_account_closing_balances). */
export function pclBalances(d: Doc): Map<string, number> {
  const from = String(d["period_start_date"] ?? ""), to = String(d["period_end_date"] ?? ""); const m = new Map<string, number>();
  for (const g of adapter.list("GL Entry")) {
    if (n(g["is_cancelled"]) || g["voucher_type"] === "Period Closing Voucher" || !sameCo(g["company"], d["company"])) continue;
    const pd = String(g["posting_date"] ?? ""); if (pd < from || pd > to || (g["finance_book"] && g["finance_book"] !== "")) continue;
    const rt = adapter.get("Account", String(g["account"]))?.["root_type"]; if (rt !== "Income" && rt !== "Expense") continue;
    m.set(String(g["account"]), r2((m.get(String(g["account"])) ?? 0) + n(g["debit"]) - n(g["credit"])));
  }
  for (const [k, v] of m) if (Math.abs(v) < 0.005) m.delete(k);
  return m;
}
const sameCo = (a: unknown, b: unknown) => resolveName("Company", String(a ?? "")) === resolveName("Company", String(b ?? ""));
/** Latest closed date for a company from submitted PCVs (general_ledger.py validate_against_pcv). */
export function closedTill(company: unknown): string {
  return adapter.list("Period Closing Voucher").filter((x) => n(x.docstatus) === 1 && sameCo(x["company"], company)).map((x) => String(x["period_end_date"] ?? "")).sort().pop() ?? "";
}
export function pcvErrors(dt: string, d: Doc, cancelling = false): string[] {
  const e: string[] = [];
  if (dt === "Period Closing Voucher") {
    const rt = adapter.get("Account", String(d["closing_account_head"] ?? ""))?.["root_type"];
    if (!cancelling) {
      if (rt !== "Liability" && rt !== "Equity") e.push(`Closing Account ${d["closing_account_head"]} must be of type Liability / Equity`);
      if (String(d["period_start_date"] ?? "") > String(d["period_end_date"] ?? "")) e.push("Period Start Date cannot be after Period End Date");
      const fy = adapter.get("Fiscal Year", String(d["fiscal_year"] ?? ""));
      if (fy && (String(d["period_end_date"]) > String(fy["year_end_date"]) || String(d["period_start_date"]) < String(fy["year_start_date"]))) e.push(`Period dates must be within Fiscal Year ${d["fiscal_year"]}`);
      const prev = adapter.list("Period Closing Voucher").find((x) => x.name !== d.name && n(x.docstatus) === 1 && sameCo(x["company"], d["company"]) && String(x["period_end_date"]) >= String(d["period_start_date"]));
      if (prev) e.push(`Another Period Closing Entry ${prev.name} has been made after ${d["period_start_date"]}`);
    } else {
      const later = adapter.list("Period Closing Voucher").find((x) => x.name !== d.name && n(x.docstatus) === 1 && sameCo(x["company"], d["company"]) && String(x["period_end_date"]) > String(d["period_end_date"]));
      if (later) e.push(`Cannot cancel: a later Period Closing Voucher ${later.name} exists`);
    }
    return e;
  }
  if (!GL_DOCTYPES.includes(dt)) return e;
  // Native ERPNext: a PCV does NOT lock later postings; only opening entries after it are refused (general_ledger.py validate_against_pcv).
  // Posting restrictions come from Company.accounts_frozen_till_date (check_freezing_date) and Accounting Period closed documents.
  const pd = String(d["posting_date"] ?? d["transaction_date"] ?? ""); if (!pd) return e;
  const till = closedTill(d["company"]);
  if (till && d["is_opening"] === "Yes" && pd <= till) e.push(`Opening Entry can not be created after Period Closing Voucher is created.`);
  e.push(...lockErrors(dt, d, pd));
  return e;
}

/** Accounts Frozen Till Date (Company) and closed Accounting Periods — apply to submit and cancel alike. */
export function lockErrors(dt: string, d: Doc, pd: string): string[] {
  const e: string[] = []; const roles = userRoles();
  const co = adapter.get("Company", resolveName("Company", String(d["company"] ?? "")));
  const frozen = String(co?.["accounts_frozen_till_date"] ?? ""); const allowed = String(co?.["role_allowed_for_frozen_entries"] ?? "");
  if (frozen && pd <= frozen && !(allowed && roles.includes(allowed))) e.push(`You are not authorized to add or update entries before ${frozen}`);
  for (const ap of adapter.list("Accounting Period")) {
    if (n(ap["disabled"]) || !sameCo(ap["company"], d["company"]) || pd < String(ap["start_date"] ?? "") || pd > String(ap["end_date"] ?? "")) continue;
    if (!rows(ap, "closed_documents").some((r) => r["document_type"] === dt && n(r["closed"]))) continue;
    if (ap["exempted_role"] && roles.includes(String(ap["exempted_role"]))) continue;
    e.push(`You cannot create or cancel any accounting entries with in the closed Accounting Period ${ap.name}`);
  }
  return e;
}

/** Stock movements a submitted stock voucher produces (stock_entry.py / purchase_receipt.py / delivery_note.py get_sle). */
export function slLines(dt: string, d: Doc): Sl[] {
  const S: Sl[] = []; const ret = n(d["is_return"]) ? -1 : 1;
  if (dt === "Stock Reconciliation") return recoLines(d);
  for (const x of rows(d, "items")) {
    const item = String(x["item_code"] ?? ""); const q = n(x["transfer_qty"] ?? x["stock_qty"] ?? x["qty"]) || n(x["qty"]);
    if (!item || !q) continue;
    // only stock items move stock (stock_controller: is_stock_item)
    const it = adapter.get("Item", item); if (it && Number(it["is_stock_item"] ?? 1) === 0) continue;
    if (dt === "Stock Entry") {
      if (x["s_warehouse"]) S.push({ item_code: item, warehouse: String(x["s_warehouse"]), actual_qty: -q, incoming_rate: 0 });
      if (x["t_warehouse"]) S.push({ item_code: item, warehouse: String(x["t_warehouse"]), actual_qty: q, incoming_rate: n(x["basic_rate"] ?? x["valuation_rate"]) || (x["s_warehouse"] ? rateAt(item, String(x["s_warehouse"]), String(d["posting_date"] ?? "9999-12-31")) : 0) });
    // returns carry negative row qty (validate_returned_items); the movement direction follows is_return, never a double negation
    } else if (dt === "Purchase Receipt") S.push({ item_code: item, warehouse: String(x["warehouse"] || d["set_warehouse"]), actual_qty: ret < 0 ? -Math.abs(q) : q, incoming_rate: n(x["net_rate"] ?? x["rate"]) });
    else if (dt === "Delivery Note") S.push({ item_code: item, warehouse: String(x["warehouse"] || d["set_warehouse"]), actual_qty: ret < 0 ? Math.abs(q) : -q, incoming_rate: 0 });
  }
  return S;
}

/** Perpetual inventory GL for a stock voucher from its posted SLE stock_value_difference (stock_controller.py get_gl_entries). */
export function stockGlLines(dt: string, d: Doc, sles?: Doc[]): Line[] {
  if (!perpetual(d)) return [];
  const L: Line[] = []; const add = (account: string, amt: number) => { const [debit, credit] = dc(amt); if (debit || credit) L.push({ account: RA(account), debit, credit }); };
  const byWh = new Map<string, number>(); let total = 0;
  for (const s of sles ?? sleOf(dt, d.name)) { if (n(s["is_cancelled"])) continue; const v = n(s["stock_value_difference"]); const wa = String(adapter.get("Warehouse", String(s["warehouse"]))?.["account"] || coAcct(d, "default_inventory_account", "Stock In Hand")); byWh.set(wa, (byWh.get(wa) ?? 0) + v); total += v; }
  for (const [a, v] of byWh) add(a, v);
  if (dt === "Purchase Receipt") {
    // landed_cost_voucher.py: landed charges are credited to the LCV tax rows' expense accounts, not SRBNB
    let lct = 0; for (const [a, v] of lcvCredits(d.name)) { add(a, -v); lct += v; }
    add(coAcct(d, "stock_received_but_not_billed", "Stock Received But Not Billed"), -(total - lct));
  }
  else if (dt === "Delivery Note") add(String(rows(d, "items")[0]?.["expense_account"] || coAcct(d, "default_expense_account", "Cost of Goods Sold")), -total);
  else add(String(d["expense_account"] || rows(d, "items")[0]?.["expense_account"] || coAcct(d, "stock_adjustment_account", "Stock Adjustment")), -total);
  // net zero per account (e.g. transfer within the same account) collapses
  const net = new Map<string, number>(); for (const l of L) net.set(l.account, (net.get(l.account) ?? 0) + l.debit - l.credit);
  return [...net].filter(([, v]) => Math.abs(v) >= 0.005).map(([account, v]) => { const [debit, credit] = dc(v); return { account, debit, credit }; });
}
/** Submitted LCV charges landing on a receipt, by LCV expense account (taxes expense_account). */
export function lcvCredits(receipt: string): Map<string, number> {
  const m = new Map<string, number>();
  for (const v of adapter.list("Landed Cost Voucher").filter((x) => n(x["docstatus"]) === 1)) {
    const share = lcvDistribution(v).filter((x) => x.receipt_document === receipt).reduce((s, x) => s + x.applicable_charges, 0); if (!share) continue;
    const tx = rows(v, "taxes"); const tt = tx.reduce((s, t) => s + n(t["base_amount"] ?? t["amount"]), 0);
    if (!tt) { const a = coAcct(v, "expenses_included_in_valuation", "Expenses Included In Valuation"); m.set(a, r2((m.get(a) ?? 0) + share)); continue; }
    for (const t of tx) { const a = String(t["expense_account"] || coAcct(v, "expenses_included_in_valuation", "Expenses Included In Valuation")); m.set(a, r2((m.get(a) ?? 0) + share * n(t["base_amount"] ?? t["amount"]) / tt)); }
  }
  return m;
}
/** LCV submit/cancel: rebuild the receipt's perpetual stock GL (old rows marked cancelled) from reposted SLE. */
export function repostReceiptGl(dt: string, name: string) {
  const d = adapter.get(dt, name); if (!d || !perpetual(d) || n(d["docstatus"]) !== 1) return;
  glOf(dt, name).filter((g) => String(g.name).includes("-S") && !n(g["is_cancelled"])).forEach((g) => adapter.update("GL Entry", g.name, { is_cancelled: 1 }));
  const k = glOf(dt, name).length; const date = String(d["posting_date"] ?? today());
  stockGlLines(dt, d).forEach((l, i) => adapter.insertDoc("GL Entry", { name: `GLE-${name}-S${k + i + 1}`, posting_date: date, account: l.account, party_type: "", party: "", debit: l.debit, credit: l.credit,
    debit_in_account_currency: l.debit, credit_in_account_currency: l.credit, voucher_type: dt, voucher_no: name, against_voucher_type: "", against_voucher: "", company: d["company"], cost_center: d["cost_center"] ?? "", is_cancelled: 0, docstatus: 1, fiscal_year: date.slice(0, 4), creation: d["creation"] }));
}
const repostLcvReceipts = (d: Doc) => { const seen = new Set<string>(); for (const x of lcvDistribution(d)) { const k = x.receipt_document_type + "|" + x.receipt_document; if (seen.has(k)) continue; seen.add(k); repostReceiptGl(x.receipt_document_type, x.receipt_document); } };
export function postStockGl(dt: string, d: Doc, quiet = false, idx?: PostIndex, sles?: Doc[]) {
  if (!STOCK_DOCTYPES.includes(dt) || (idx ? idx.gl.has(vkey(dt, d.name)) : glOf(dt, d.name).length)) return;
  const date = String(d["posting_date"] ?? today());
  idx?.gl.add(vkey(dt, d.name));
  stockGlLines(dt, d, sles).forEach((l, i) => (quiet ? adapter.insertDocQuiet : adapter.insertDoc).call(adapter, "GL Entry", { name: `GLE-${d.name}-S${i + 1}`, posting_date: date, account: l.account, party_type: "", party: "", debit: l.debit, credit: l.credit,
    debit_in_account_currency: l.debit, credit_in_account_currency: l.credit, voucher_type: dt, voucher_no: d.name, against_voucher_type: "", against_voucher: "", company: d["company"], cost_center: d["cost_center"] ?? "", is_cancelled: 0, docstatus: 1, fiscal_year: date.slice(0, 4), creation: d["creation"] }));
}

const glOf = (dt: string, name: string) => adapter.list("GL Entry").filter((g) => g["voucher_type"] === dt && g["voucher_no"] === name);
const sleOf = (dt: string, name: string) => adapter.list("Stock Ledger Entry").filter((g) => g["voucher_type"] === dt && g["voucher_no"] === name);
/** Vouchers that already have GL / stock ledger rows — one scan for bulk posting instead of one scan per voucher. */
type PostIndex = { gl: Set<string>; sle: Set<string> };
const vkey = (dt: unknown, name: unknown) => `${dt}\u0000${name}`;
function postIndex(): PostIndex {
  return { gl: new Set(adapter.list("GL Entry").map((g) => vkey(g["voucher_type"], g["voucher_no"]))), sle: new Set(adapter.list("Stock Ledger Entry").map((g) => vkey(g["voucher_type"], g["voucher_no"]))) };
}

/** Re-post one item/warehouse: moving-average valuation and qty_after_transaction in posting order (repost_item_valuation.py). */
export function repost(item: string, wh: string, quiet = false) {
  repostRows(item, adapter.list("Stock Ledger Entry").filter((e) => e["item_code"] === item && e["warehouse"] === wh), quiet);
}
/** repost() over the given rows of ONE item/warehouse (bulk posting groups the ledger once). */
function repostRows(item: string, rows: Doc[], quiet: boolean) {
  const xs = rows.filter((e) => !n(e["is_cancelled"]))
    .sort((a, b) => `${a["posting_date"]}${a["posting_time"] ?? ""}${a["creation"]}`.localeCompare(`${b["posting_date"]}${b["posting_time"] ?? ""}${b["creation"]}`));
  let qty = 0, val = 0;
  const fallback = n(adapter.get("Item", item)?.["valuation_rate"]) || n(adapter.get("Item", item)?.["standard_rate"]);
  for (const e of xs) {
    const reco = e["voucher_type"] === "Stock Reconciliation" && e["reco_qty"] !== undefined;
    const q = reco ? r2(n(e["reco_qty"]) - qty) : n(e["actual_qty"]); const rate = qty > 0 ? val / qty : fallback;
    // stock_reconciliation: qty and value are set absolutely; the difference is what the ledger records
    const diff = reco ? r2(n(e["reco_qty"]) * n(e["reco_rate"]) - val) : q > 0 ? q * (n(e["incoming_rate"]) || rate) : q * rate;
    qty = r2(qty + q); val = r2(val + diff);
    const patch = { ...(reco ? { actual_qty: q } : {}), qty_after_transaction: qty, stock_value: val, stock_value_difference: r2(diff), valuation_rate: qty ? r2(val / qty) : r2(rate) };
    if (quiet) adapter.insertDocQuiet("Stock Ledger Entry", { ...e, ...patch }); else adapter.update("Stock Ledger Entry", e.name, patch);
  }
}

/** Write the ledgers for one submitted voucher (idempotent: skipped if its ledger rows exist). */
function writeGl(dt: string, d: Doc, ins: (t: string, x: Record<string, unknown>) => unknown, date: string) {
  offsetLines(d["company"], glLines(dt, d)).forEach((l, i) => ins("GL Entry", {
    name: `GLE-${d.name}-${i + 1}`, posting_date: l.posting_date ?? date, account: l.account, party_type: l.party ? l.party_type : "", party: l.party ?? "", debit: l.debit, credit: l.credit,
    debit_in_account_currency: l.dac ?? l.debit, credit_in_account_currency: l.cac ?? l.credit, voucher_type: dt, voucher_no: d.name, against_voucher_type: l.against?.[0] ?? "", against_voucher: l.against?.[1] ?? "",
    company: d["company"], ...(l.dims ?? rowDims(undefined, d)), cost_center: l.cost_center ?? d["cost_center"] ?? "", project: l.project ?? d["project"] ?? "", finance_book: d["finance_book"] ?? "", ...(l.remarks ? { remarks: l.remarks } : {}), is_cancelled: 0, docstatus: 1, fiscal_year: (l.posting_date ?? date).slice(0, 4), creation: d["creation"] }));
}
/** The GL lines a submitted voucher should carry now (what post() would write), for the repost comparison. */
export function expectedGl(dt: string, d: Doc): { account: string; party: string; debit: number; credit: number }[] {
  return GL_DOCTYPES.includes(dt) ? offsetLines(d["company"], glLines(dt, d)).map((l) => ({ account: l.account, party: l.party ?? "", debit: r2(l.debit), credit: r2(l.credit) })) : [];
}
/** repost_accounting_ledger.py start_repost for one voucher: its own (non-stock) GL rows are replaced by freshly computed
 *  ones. Refused for a voucher in a locked period or whose rows were split by a reconciliation (unreconcile first). */
export function repostVoucherGl(dt: string, name: string): string[] {
  const d = adapter.get(dt, name);
  if (!d || n(d.docstatus) !== 1 || !GL_DOCTYPES.includes(dt)) return [`${dt} ${name} is not a submitted voucher with ledger entries.`];
  const date = String(d["posting_date"] ?? d["transaction_date"] ?? today());
  const lock = lockErrors(dt, d, date); if (lock.length) return lock;
  const own = glOf(dt, name).filter((g) => !n(g["is_cancelled"]) && !String(g.name).startsWith(`GLE-${name}-S`));
  if (own.some((g) => /-A\d+$/.test(String(g.name)))) return [`${dt} ${name} has reconciled allocations; unreconcile it before reposting.`];
  own.forEach((g) => adapter.remove("GL Entry", g.name));
  writeGl(dt, d, (t, x) => adapter.insertDoc(t, x), date);
  return [];
}
export function post(dt: string, d: Doc, quiet = false, idx?: PostIndex) {
  const ins = (t: string, x: Record<string, unknown>) => (quiet ? adapter.insertDocQuiet(t, x) : adapter.insertDoc(t, x));
  const date = String(dt === "Period Closing Voucher" ? d["period_end_date"] : d["posting_date"] ?? d["transaction_date"] ?? today());
  const k = vkey(dt, d.name);
  const hasGl = idx ? idx.gl.has(k) : glOf(dt, d.name).length > 0;
  const hasSle = idx ? idx.sle.has(k) : sleOf(dt, d.name).length > 0;
  if (idx && GL_DOCTYPES.includes(dt)) idx.gl.add(k);
  if (idx && STOCK_DOCTYPES.includes(dt)) idx.sle.add(k);
  if (GL_DOCTYPES.includes(dt) && !hasGl) writeGl(dt, d, ins, date);
  if (STOCK_DOCTYPES.includes(dt) && !hasSle) {
    const sl = slLines(dt, d);
    sl.forEach((s, i) => ins("Stock Ledger Entry", { name: `SLE-${d.name}-${i + 1}`, ...s, posting_date: date, posting_time: d["posting_time"] ?? "00:00:00", voucher_type: dt, voucher_no: d.name, company: d["company"], is_cancelled: 0, docstatus: 1, creation: d["creation"] }));
    if (!quiet) { new Set(sl.map((s) => `${s.item_code}\u0000${s.warehouse}`)).forEach((k) => { const [i, w] = k.split("\u0000"); repost(i!, w!); }); postStockGl(dt, d); }
  }
}

/** Invoice status from outstanding (sales_invoice.py / purchase_invoice.py set_status). */
export function invoiceStatus(d: Doc): string {
  if (n(d["docstatus"]) === 2) return "Cancelled";
  if (n(d["docstatus"]) === 0) return "Draft";
  if (n(d["is_return"])) return "Return";
  const o = r2(n(d["outstanding_amount"])), total = payable(d);
  if (o <= 0) return "Paid";
  if (o < total) return "Partly Paid";
  if (d["due_date"] && String(d["due_date"]) < today()) return "Overdue";
  return "Unpaid";
}

/** Payment Entry references reduce (or on cancel restore) the referenced invoice outstanding (update_outstanding_amounts). */
function allocate(d: Doc, sign: 1 | -1) {
  for (const r of rows(d, "references")) {
    const rdt = String(r["reference_doctype"]), rn = String(r["reference_name"]); const inv = adapter.get(rdt, rn); if (!inv) continue;
    const o = r2(n(inv["outstanding_amount"]) - sign * n(r["allocated_amount"]));
    const nx = { ...inv, outstanding_amount: o };
    adapter.update(rdt, rn, { outstanding_amount: o, ...(rdt.endsWith("Invoice") ? { status: invoiceStatus(nx) } : {}) });
  }
}

/** Journal Entry rows against an invoice reduce (or on cancel restore) its outstanding (journal_entry.py update_outstanding_for_invoices). */
function allocateJournal(d: Doc, sign: 1 | -1) {
  for (const r of rows(d, "accounts")) {
    const rdt = String(r["reference_type"] ?? ""), rn = String(r["reference_name"] ?? ""); if (!rn || (rdt !== "Sales Invoice" && rdt !== "Purchase Invoice")) continue;
    const inv = adapter.get(rdt, rn); if (!inv || n(inv.docstatus) !== 1) continue;
    // a sales invoice is settled by credits on the receivable row, a purchase invoice by debits on the payable row
    const amt = rdt === "Sales Invoice" ? n(r["credit_in_account_currency"] ?? r["credit"]) - n(r["debit_in_account_currency"] ?? r["debit"]) : n(r["debit_in_account_currency"] ?? r["debit"]) - n(r["credit_in_account_currency"] ?? r["credit"]);
    const o = r2(n(inv["outstanding_amount"]) - sign * amt);
    adapter.update(rdt, rn, { outstanding_amount: o, status: invoiceStatus({ ...inv, outstanding_amount: o }) });
  }
}

/** Server-side validations ported for submit (journal_entry.py validate_total_debit_and_credit, payment_entry.py validate_allocated_amount). */
export function submitErrors(dt: string, d: Doc): string[] {
  const e: string[] = [];
  if (dt === "Journal Entry") { const mc = (x: Record<string, unknown>) => !!x["account_currency"] && x["exchange_rate"] !== undefined && (x["debit"] !== undefined || x["credit"] !== undefined); const dr = rows(d, "accounts").reduce((s, x) => s + n(mc(x) ? x["debit"] : x["debit_in_account_currency"] ?? x["debit"]), 0), cr = rows(d, "accounts").reduce((s, x) => s + n(mc(x) ? x["credit"] : x["credit_in_account_currency"] ?? x["credit"]), 0); if (Math.abs(dr - cr) >= 0.005) e.push(`Total Debit must be equal to Total Credit. The difference is ${r2(dr - cr)}`); }
  if (dt === "Payment Entry") for (const r of rows(d, "references")) { const inv = adapter.get(String(r["reference_doctype"]), String(r["reference_name"])); if (inv && n(r["allocated_amount"]) > n(inv["outstanding_amount"]) + 0.005) e.push(`Row #${r["idx"] ?? 1}: Allocated Amount cannot be greater than outstanding amount.`); }
  e.push(...returnErrors(dt, d));
  e.push(...sellingErrors(dt, d));
  if (dt === "Stock Entry") e.push(...stockEntryErrors(d));
  if (dt === "Stock Reconciliation") e.push(...recoErrors(d));
  else if (STOCK_DOCTYPES.includes(dt)) e.push(...negativeStockErrors(dt, d, slLines(dt, d)));
  e.push(...serialBatchErrors(dt, d));
  if (dt === "Landed Cost Voucher") e.push(...lcvErrors(d));
  e.push(...pcvErrors(dt, d));
  if (dt === "Exchange Rate Revaluation") e.push(...revaluationErrors(d));
  e.push(...budgetCheck(dt, d).errors);
  e.push(...deferredErrors(dt, d));
  e.push(...departmentSubmitErrors(dt, d));
  if (GL_DOCTYPES.includes(dt) && dt !== "Period Closing Voucher") { e.push(...dimensionErrors(d, glLines(dt, d))); e.push(...offsettingErrors(d["company"])); }
  return e;
}

/** Port of erpnext/controllers/sales_and_purchase_return.py validate_return / validate_returned_items. */
export const RETURN_DOCTYPES = ["Sales Invoice", "Purchase Invoice", "Delivery Note", "Purchase Receipt"];
export function returnErrors(dt: string, d: Doc): string[] {
  if (!RETURN_DOCTYPES.includes(dt) || !n(d["is_return"])) return [];
  const e: string[] = []; const against = String(d["return_against"] ?? "");
  if (!against) return dt.endsWith("Invoice") ? [] : ["Return Against is mandatory"];
  const orig = adapter.get(dt, against);
  if (!orig) return [`Return Against ${dt} ${against} does not exist`];
  if (n(orig.docstatus) !== 1) return [`${dt} ${against} must be submitted`];
  const party = dt.startsWith("Sales") || dt === "Delivery Note" ? "customer" : "supplier";
  if (orig[party] && d[party] && orig[party] !== d[party]) e.push(`${party === "customer" ? "Customer" : "Supplier"} must be same as ${dt} ${against}`);
  if (orig["company"] && d["company"] && orig["company"] !== d["company"]) e.push(`Company must be same as ${dt} ${against}`);
  const prev = adapter.list(dt).filter((x) => x.name !== d.name && n(x.docstatus) === 1 && n(x["is_return"]) && x["return_against"] === against);
  const qtyOf = (docs: Doc[], code: unknown) => docs.flatMap((x) => rows(x, "items")).filter((r) => r["item_code"] === code).reduce((s, r) => s + Math.abs(n(r["qty"])), 0);
  for (const r of rows(d, "items")) {
    const code = r["item_code"]; const q = n(r["qty"]); const idx = r["idx"] ?? 1;
    if (q > 0) { e.push(`Row #${idx}: Quantity for Item ${code} must be negative`); continue; }
    const origQty = qtyOf([orig], code);
    if (!origQty) { e.push(`Row #${idx}: Returned Item ${code} does not exist in ${dt} ${against}`); continue; }
    const already = qtyOf(prev, code);
    if (Math.abs(q) > origQty - already + 1e-9) e.push(`Row #${idx}: Cannot return more than ${r2(origQty - already)} for Item ${code}`);
    const or = rows(orig, "items").find((x) => x["item_code"] === code);
    if (or && n(r["rate"]) > n(or["rate"]) + 0.005) e.push(`Row #${idx}: Rate cannot be greater than the rate used in ${dt} ${against}`);
  }
  const prevAmt = prev.reduce((s, x) => s + Math.abs(n(x["grand_total"])), 0);
  if (Math.abs(n(d["grand_total"])) > Math.abs(n(orig["grand_total"])) - prevAmt + 0.005) e.push(`Return amount ${r2(Math.abs(n(d["grand_total"])))} cannot exceed the remaining amount ${r2(Math.abs(n(orig["grand_total"])) - prevAmt)} of ${dt} ${against}`);
  return e;
}

// ---- status_updater.py: previous-document progress (per_delivered / per_billed / per_received / per_ordered) ----
type Link = { tdt: string; field: string; qty?: string; amt?: string; per: string };
const LINKS: Record<string, Link[]> = {
  "Sales Order": [{ tdt: "Delivery Note", field: "against_sales_order", qty: "delivered_qty", per: "per_delivered" }, { tdt: "Sales Invoice", field: "sales_order", amt: "billed_amt", per: "per_billed" }],
  "Delivery Note": [{ tdt: "Sales Invoice", field: "delivery_note", amt: "billed_amt", per: "per_billed" }],
  "Purchase Order": [{ tdt: "Purchase Receipt", field: "purchase_order", qty: "received_qty", per: "per_received" }, { tdt: "Purchase Invoice", field: "purchase_order", amt: "billed_amt", per: "per_billed" }],
  "Purchase Receipt": [{ tdt: "Purchase Invoice", field: "purchase_receipt", amt: "billed_amt", per: "per_billed" }],
  "Material Request": [{ tdt: "Purchase Order", field: "material_request", qty: "ordered_qty", per: "per_ordered" }, { tdt: "Purchase Receipt", field: "material_request", qty: "received_qty", per: "per_received" }],
  "Quotation": [{ tdt: "Sales Order", field: "prevdoc_docname", qty: "ordered_qty", per: "per_ordered" }],
  "Supplier Quotation": [{ tdt: "Purchase Order", field: "supplier_quotation", qty: "ordered_qty", per: "per_ordered" }],
};
/** request_for_quotation.py update_rfq_supplier_status: a submitted Supplier Quotation marks its supplier's row Received. */
function updateRfq(d: Doc) {
  for (const rfq of new Set(rows(d, "items").map((r) => String(r["request_for_quotation"] ?? "")).filter(Boolean))) {
    const q = adapter.get("Request for Quotation", rfq); if (!q) continue;
    const got = (sup: unknown) => adapter.list("Supplier Quotation").some((x) => n(x.docstatus) === 1 && x["supplier"] === sup && rows(x, "items").some((r) => r["request_for_quotation"] === rfq));
    adapter.update("Request for Quotation", rfq, { suppliers: rows(q, "suppliers").map((s) => ({ ...s, quote_status: got(s["supplier"]) ? "Received" : "Pending" })) });
  }
}
/** purchase_order.py update_delivered_qty_in_sales_order: a submitted drop-ship Purchase Order marked Delivered delivers
 *  its lines on the Sales Order (lines the supplier ships are never on a Delivery Note). */
function dropShipDelivered(so: string, it: Record<string, unknown>): number {
  if (!n(it["delivered_by_supplier"])) return 0;
  return adapter.list("Purchase Order").filter((p) => n(p.docstatus) === 1 && p["status"] === "Delivered").flatMap((p) => rows(p, "items"))
    .filter((r) => r["sales_order"] === so && (r["sales_order_item"] && it["name"] ? r["sales_order_item"] === it["name"] : r["item_code"] === it["item_code"]))
    .reduce((s, r) => s + n(r["qty"]), 0);
}
export function refreshPrev(sdt: string, sname: string) {
  const src = adapter.get(sdt, sname); if (!src) return;
  const items = rows(src, "items").map((r) => ({ ...r })); const patch: Record<string, unknown> = {};
  for (const l of LINKS[sdt] ?? []) {
    const tr = adapter.list(l.tdt).filter((t) => n(t.docstatus) === 1).flatMap((t) => rows(t, "items")).filter((r) => r[l.field] === sname);
    for (const it of items) {
      const mine = tr.filter((r) => rowMatch(sdt, l.tdt, it, r, items));
      if (l.qty) it[l.qty] = r2(mine.reduce((s, r) => s + n(r["qty"]), 0) + (sdt === "Sales Order" && l.tdt === "Delivery Note" ? dropShipDelivered(sname, it) : 0));
      if (l.amt) it[l.amt] = r2(mine.reduce((s, r) => s + n(r["amount"] ?? n(r["qty"]) * n(r["rate"])), 0));
    }
    let done = items.reduce((s, it) => s + (l.qty ? Math.min(n(it[l.qty]), n(it["qty"])) : Math.min(n(it[l.amt!]), n(it["amount"]))), 0);
    // historical rows that can't be tied to one line still count toward the document total (capped per item), never toward a line
    for (const code of new Set(tr.filter((r) => ambiguousRow(sdt, l.tdt, r, items)).map((r) => r["item_code"]))) {
      const amb = tr.filter((r) => r["item_code"] === code && ambiguousRow(sdt, l.tdt, r, items)).reduce((s, r) => s + (l.qty ? n(r["qty"]) : n(r["amount"] ?? n(r["qty"]) * n(r["rate"]))), 0);
      const room = items.filter((it) => it["item_code"] === code).reduce((s, it) => s + Math.max((l.qty ? n(it["qty"]) - n(it[l.qty]) : n(it["amount"]) - n(it[l.amt!])), 0), 0);
      done += Math.min(amb, room);
    }
    const whole = items.reduce((s, it) => s + (l.qty ? n(it["qty"]) : n(it["amount"])), 0);
    patch[l.per] = whole ? r2((done / whole) * 100) : 0;
  }
  const p = (k: string) => n(patch[k] ?? src[k]);
  let status = String(src["status"] ?? "");
  // update_status: a held or closed order keeps that status until Resume / Re-open
  if (n(src.docstatus) === 1 && !["Closed", "On Hold", "Stopped", "Delivered"].includes(status)) {
    if (sdt === "Sales Order") status = p("per_delivered") >= 100 && p("per_billed") >= 100 ? "Completed" : p("per_delivered") >= 100 ? "To Bill" : p("per_billed") >= 100 ? "To Deliver" : "To Deliver and Bill";
    if (sdt === "Purchase Order") status = p("per_received") >= 100 && p("per_billed") >= 100 ? "Completed" : p("per_received") >= 100 ? "To Bill" : p("per_billed") >= 100 ? "To Receive" : "To Receive and Bill";
    if (sdt === "Delivery Note" || sdt === "Purchase Receipt") status = p("per_billed") >= 100 ? "Completed" : "To Bill";
    if (sdt === "Material Request") status = p("per_received") >= 100 ? "Received" : p("per_received") > 0 ? "Partially Received" : p("per_ordered") >= 100 ? "Ordered" : p("per_ordered") > 0 ? "Partially Ordered" : "Pending";
    if (sdt === "Supplier Quotation") status = p("per_ordered") >= 100 ? "Ordered" : p("per_ordered") > 0 ? "Partially Ordered" : "Submitted";
    if (sdt === "Quotation") status = p("per_ordered") >= 100 ? "Ordered" : p("per_ordered") > 0 ? "Partially Ordered" : "Open";
  }
  adapter.update(sdt, sname, { ...patch, items, status });
}
function updatePrev(dt: string, d: Doc) {
  const seen = new Set<string>();
  for (const [sdt, ls] of Object.entries(LINKS)) for (const l of ls) if (l.tdt === dt) for (const r of rows(d, "items")) { const v = r[l.field]; if (v && !seen.has(`${sdt}:${v}`)) { seen.add(`${sdt}:${v}`); refreshPrev(sdt, String(v)); } }
}

/** Controller hooks (adapter.registerDocHook) throw DocValidationError; submit/cancel return those messages instead of
 *  letting the button handler swallow them, so a refused document never looks posted. */
const guardErrors = (f: () => string[]): string[] => { try { return f(); } catch (e) { if (e instanceof DocValidationError) return e.errors; throw e; } };
/** Scope around a submit / cancel and everything it simulates (ledger rows, attendance, statuses of linked documents).
 *  Identity in the preview. The Frappe-hosted build (frappe_apps/digit_enterprise/ui/src/bridge.ts) sets it so that only
 *  the submitted / cancelled document itself is sent to the server; the real controllers there produce the side effects
 *  and the bridge replaces the simulated ones with the server's records. */
type PostingScope = (op: "submit" | "cancel", dt: string, name: string, run: () => string[]) => string[];
let postingScope: PostingScope = (_op, _dt, _name, run) => run();
export function setPostingScope(f: PostingScope) { postingScope = f; }
export function submit(dt: string, name: string): string[] { return postingScope("submit", dt, name, () => guardErrors(() => submitInner(dt, name))); }
export function cancel(dt: string, name: string): string[] { return postingScope("cancel", dt, name, () => guardErrors(() => cancelInner(dt, name))); }
/**
 * A credit / debit note against an invoice (is_return + return_against) posts its party line against the original
 * invoice (glLines `against`), so on submit and cancel the original's outstanding and status follow the payment
 * ledger at once — as accounts_controller update_outstanding_amt does — and the note itself keeps no outstanding.
 */
function settleReturn(dt: string, d: Doc, dir: 1 | -1) {
  if ((dt !== "Sales Invoice" && dt !== "Purchase Invoice") || !n(d["is_return"]) || !d["return_against"]) return;
  const orig = adapter.get(dt, String(d["return_against"])); if (!orig || n(orig["docstatus"]) !== 1) return;
  const sign = dt === "Sales Invoice" ? 1 : -1;
  const o = r2(adapter.list("GL Entry").filter((g) => !n(g["is_cancelled"]) && g["party"] && g["against_voucher_type"] === dt && g["against_voucher"] === orig.name)
    .reduce((t, g) => t + sign * (n(g["debit"]) - n(g["credit"])), 0));
  adapter.update(dt, orig.name, { outstanding_amount: o, status: invoiceStatus({ ...orig, outstanding_amount: o }) });
  if (dir === 1) adapter.update(dt, d.name, { outstanding_amount: 0, status: "Return" });
}
function submitInner(dt: string, name: string): string[] {
  const raw = adapter.get(dt, name); if (!raw) return ["not found"];
  const d0 = autoPickOutward(dt, autoSerialBatch(dt, raw));
  const errs = submitErrors(dt, d0); if (errs.length) return errs;
  const patch: Record<string, unknown> = { docstatus: 1 };
  if (dt === "Sales Invoice" || dt === "Purchase Invoice") { patch["outstanding_amount"] = payable(d0); patch["status"] = invoiceStatus({ ...d0, ...patch }); }
  else if (["Sales Order", "Purchase Order"].includes(dt)) patch["status"] = dt === "Sales Order" ? "To Deliver and Bill" : "To Receive and Bill";
  else if (dt === "Material Request") patch["status"] = "Pending";
  else if (dt === "Quotation") patch["status"] = "Open";
  else if (["Delivery Note", "Purchase Receipt"].includes(dt)) patch["status"] = "To Bill";
  else if (d0["status"] !== undefined && !KEEP_STATUS.has(dt)) patch["status"] = "Submitted";
  Object.assign(patch, departmentSubmitPatch(dt, d0));
  adapter.update(dt, name, patch);
  const d = adapter.get(dt, name)!;
  post(dt, d);
  if (dt === "Payment Entry") allocate(d, 1);
  if (dt === "Journal Entry") allocateJournal(d, 1);
  settleReturn(dt, d, 1);
  if (dt === "Landed Cost Voucher") { applyLcv(d, 1, (i, w) => repost(i, w)); repostLcvReceipts(d); }
  if (dt === "Delivery Note" && !n(d["is_return"])) consumeReservation(d, 1);
  applySerialBatch(dt, d, 1);
  if (dt === "Supplier Quotation") updateRfq(d);
  updatePrev(dt, d);
  departmentAfter(dt, d, 1);
  crmAfter(dt, d);
  return [];
}

/** Cancel: mark ledger rows cancelled and post reversals (make_reverse_gl_entries), restore allocations, repost stock. */
function cancelInner(dt: string, name: string): string[] {
  const d = adapter.get(dt, name); if (!d || n(d["docstatus"]) !== 1) return [];
  const ce = [...backLinkErrors(dt, name), ...pcvErrors(dt, d, true), ...serialCancelErrors(dt, d), ...departmentCancelErrors(dt, name)]; if (ce.length) return ce;
  for (const g of glOf(dt, name)) {
    if (n(g["is_cancelled"])) continue;
    adapter.update("GL Entry", g.name, { is_cancelled: 1 });
    adapter.insertDoc("GL Entry", { ...g, name: `${g.name}-R`, debit: g["credit"], credit: g["debit"], debit_in_account_currency: g["credit_in_account_currency"], credit_in_account_currency: g["debit_in_account_currency"], is_cancelled: 1, remarks: `On cancellation of ${name}` });
  }
  const keys = new Set<string>();
  for (const s of sleOf(dt, name)) {
    if (n(s["is_cancelled"])) continue;
    adapter.update("Stock Ledger Entry", s.name, { is_cancelled: 1 }); keys.add(`${s["item_code"]}\u0000${s["warehouse"]}`);
    adapter.insertDoc("Stock Ledger Entry", { ...s, name: `${s.name}-R`, actual_qty: -n(s["actual_qty"]), is_cancelled: 1 });
  }
  if (dt === "Payment Entry") allocate(d, -1);
  if (dt === "Journal Entry") allocateJournal(d, -1);
  settleReturn(dt, d, -1);
  if (dt === "Landed Cost Voucher") { applyLcv(d, -1, (i, w) => repost(i, w)); adapter.update(dt, name, { docstatus: 2 }); repostLcvReceipts(d); }
  if (dt === "Delivery Note" && !n(d["is_return"])) consumeReservation(d, -1);
  applySerialBatch(dt, d, -1);
  if (dt === "Sales Order") for (const s of adapter.list("Stock Reservation Entry").filter((x) => n(x["docstatus"]) === 1 && x["voucher_no"] === name)) adapter.update("Stock Reservation Entry", s.name, { docstatus: 2, status: "Cancelled" });
  adapter.update(dt, name, { docstatus: 2, status: "Cancelled" });
  updatePrev(dt, adapter.get(dt, name)!);
  departmentAfter(dt, d, -1);
  crmAfter(dt, adapter.get(dt, name)!);
  if (dt === "Supplier Quotation") updateRfq(d);
  keys.forEach((k) => { const [i, w] = k.split("\u0000"); repost(i!, w!); });
  return [];
}

/** Amend a cancelled document: copy as draft named <name>-1 (or next -n) with amended_from (frappe.model.copy_doc + amend naming). */
export function amend(dt: string, name: string): string | undefined {
  const d = adapter.get(dt, name); if (!d || n(d["docstatus"]) !== 2) return undefined;
  const base = d["amended_from"] ? name.replace(/-\d+$/, "") : name;
  let i = 1; while (adapter.get(dt, `${base}-${i}`)) i++;
  const nn = `${base}-${i}`;
  const { creation: _c, modified: _m, ...rest } = d;
  adapter.insertDoc(dt, { ...rest, name: nn, amended_from: name, docstatus: 0, status: "Draft" });
  return nn;
}

/** Seed hook: post every submitted voucher through the engine (insert-if-missing), then repost all touched stock. */
export function postAll() { postBatch(null); }
/**
 * postAll() restricted to the given submitted vouchers (bulk sample installers): ledger rows for those vouchers only,
 * outstanding/status of those invoices only, repost of the item/warehouse pairs their stock rows touch.
 */
export function postVouchers(vouchers: [string, Doc][]) { postBatch(vouchers); }
function postBatch(only: [string, Doc][] | null) {
  const vouchers: [string, Doc][] = only ? only.filter(([, d]) => n(d.docstatus) === 1) : [];
  if (!only) for (const dt of [...GL_DOCTYPES, ...STOCK_DOCTYPES]) for (const d of adapter.list(dt)) if (n(d.docstatus) === 1) vouchers.push([dt, d]);
  vouchers.sort((a, b) => String(a[1]["posting_date"] ?? "").localeCompare(String(b[1]["posting_date"] ?? "")));
  const idx = postIndex();
  for (const [dt, d] of vouchers) post(dt, d, true, idx);
  // outstanding_amount and status follow the ledger (payment ledger against_voucher), as accounts_controller keeps them
  const scope = only ? new Set(vouchers.map(([dt, d]) => vkey(dt, d.name))) : null;
  const gl = adapter.list("GL Entry").filter((g) => !n(g["is_cancelled"]) && g["party"]);
  for (const dt of ["Sales Invoice", "Purchase Invoice"]) {
    const sign = dt === "Sales Invoice" ? 1 : -1; const bal = new Map<string, number>();
    for (const g of gl) if (g["against_voucher_type"] === dt) bal.set(String(g["against_voucher"]), (bal.get(String(g["against_voucher"])) ?? 0) + sign * (n(g["debit_in_account_currency"] ?? g["debit"]) - n(g["credit_in_account_currency"] ?? g["credit"]))); // payment ledger: party account currency
    for (const d of adapter.list(dt)) if (n(d.docstatus) === 1 && (!scope || scope.has(vkey(dt, d.name)))) {
      const o = n(d["is_return"]) && d["return_against"] ? 0 : r2(bal.get(d.name) ?? 0); const nx = { ...d, outstanding_amount: o };
      adapter.insertDocQuiet(dt, { ...nx, status: n(d["is_return"]) ? "Return" : invoiceStatus(nx) });
    }
  }
  // one grouped pass over the stock ledger (repost per item/warehouse in posting order)
  const groups = new Map<string, Doc[]>(); const touched = new Set<string>();
  for (const e of adapter.list("Stock Ledger Entry")) {
    const k = `${e["item_code"]}\u0000${e["warehouse"]}`;
    let g = groups.get(k); if (!g) groups.set(k, (g = [])); g.push(e);
    if (scope?.has(vkey(e["voucher_type"], e["voucher_no"]))) touched.add(k);
  }
  for (const [k, rows] of groups) if (!scope || touched.has(k)) repostRows(k.split("\u0000")[0]!, rows, true);
  // perpetual inventory GL needs final valuations, so stock vouchers post their GL after the repost pass
  const byVoucher = new Map<string, Doc[]>();
  for (const e of adapter.list("Stock Ledger Entry")) { const k = vkey(e["voucher_type"], e["voucher_no"]); let g = byVoucher.get(k); if (!g) byVoucher.set(k, (g = [])); g.push(e); }
  for (const [dt, d] of vouchers) if (STOCK_DOCTYPES.includes(dt)) postStockGl(dt, d, true, idx, byVoucher.get(vkey(dt, d.name)) ?? []);
}

/** Port of payment_entry.py get_payment_entry: a Payment Entry draft against an invoice (amount defaults to outstanding). */
export function makePaymentEntry(dt: "Sales Invoice" | "Purchase Invoice", name: string, amount?: number): Doc {
  const inv = adapter.get(dt, name)!; const ab = abbr(inv); const sales = dt === "Sales Invoice";
  const out = n(inv["outstanding_amount"]); const amt = r2(amount ?? out);
  const bank = adapter.list("Account").find((a) => a["company"] === inv["company"] && a["account_type"] === "Bank")?.name ?? RA(`Al-Demo Bank - ${ab}`);
  const party = String(inv[sales ? "customer" : "supplier"]);
  return adapter.insertDoc("Payment Entry", {
    payment_type: sales ? "Receive" : "Pay", party_type: sales ? "Customer" : "Supplier", party, company: inv["company"], posting_date: today(),
    paid_from: sales ? String(inv["debit_to"] ?? RA(`Debtors - ${ab}`)) : bank, paid_to: sales ? bank : String(inv["credit_to"] ?? RA(`Creditors - ${ab}`)),
    paid_amount: amt, received_amount: amt, mode_of_payment: "Bank Transfer", reference_no: `REF-${name}`, reference_date: today(),
    references: [{ idx: 1, reference_doctype: dt, reference_name: name, total_amount: payable(inv), outstanding_amount: out, allocated_amount: amt }], docstatus: 0,
  });
}

/**
 * Payment reconciliation (accounts/utils.py reconcile_against_document): link an unallocated payment (Payment Entry
 * or Journal Entry party row) to an invoice. Splits the voucher's unlinked party GL row so the allocated part points
 * at the invoice (against_voucher), records the reference on the voucher and updates invoice outstanding/status.
 */
export type Allocation = { reference_type: string; reference_name: string; invoice_type: string; invoice_number: string; allocated_amount: number };
export function reconcileAllocations(allocs: Allocation[]): string[] {
  const errs: string[] = [];
  for (const a of allocs) {
    const amt = r2(n(a.allocated_amount)); if (amt <= 0) continue;
    const inv = adapter.get(a.invoice_type, a.invoice_number); const v = adapter.get(a.reference_type, a.reference_name);
    if (!inv || !v || n(v.docstatus) !== 1) { errs.push(`${a.reference_name}: not found or not submitted`); continue; }
    if (amt > n(inv["outstanding_amount"]) + 0.005) { errs.push(`Allocated amount ${amt} cannot be greater than outstanding amount ${inv["outstanding_amount"]} of ${a.invoice_number}`); continue; }
    const g = glOf(a.reference_type, a.reference_name).find((x) => !n(x["is_cancelled"]) && x["party"] && (!x["against_voucher"] || x["against_voucher"] === a.reference_name));
    if (!g) { errs.push(`${a.reference_name}: no unallocated amount`); continue; }
    const side = n(g["debit"]) > 0 ? "debit" : "credit"; const left = r2(n(g[side]) - amt);
    if (left < -0.005) { errs.push(`${a.reference_name}: allocated amount exceeds unallocated amount ${g[side]}`); continue; }
    const k = glOf(a.reference_type, a.reference_name).length + 1;
    adapter.insertDoc("GL Entry", { ...g, name: `${g.name}-A${k}`, [side]: amt, [`${side}_in_account_currency`]: amt, against_voucher_type: a.invoice_type, against_voucher: a.invoice_number });
    if (left > 0.005) adapter.update("GL Entry", g.name, { [side]: left, [`${side}_in_account_currency`]: left }); else adapter.remove("GL Entry", g.name);
    if (a.reference_type === "Payment Entry") {
      const refs = rows(v, "references");
      adapter.update("Payment Entry", v.name, { references: [...refs, { idx: refs.length + 1, reference_doctype: a.invoice_type, reference_name: a.invoice_number, allocated_amount: amt, outstanding_amount: inv["outstanding_amount"], total_amount: inv["grand_total"] }],
        unallocated_amount: r2(n(v["paid_amount"]) - refs.reduce((s, r) => s + n(r["allocated_amount"]), 0) - amt) });
    } else {
      const acc = rows(v, "accounts").map((r) => ({ ...r })); const row = acc.find((r) => r["party"] === g["party"] && !r["reference_name"]);
      if (row) { row["reference_type"] = a.invoice_type; row["reference_name"] = a.invoice_number; }
      adapter.update("Journal Entry", v.name, { accounts: acc });
    }
    const o = r2(n(inv["outstanding_amount"]) - amt);
    adapter.update(a.invoice_type, a.invoice_number, { outstanding_amount: o, status: invoiceStatus({ ...inv, outstanding_amount: o }) });
  }
  return errs;
}
