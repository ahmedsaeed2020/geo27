/**
 * Bank & payment reconciliation — synthetic-preview ports of
 *  - erpnext/accounts/doctype/bank_transaction/bank_transaction.py (allocated/unallocated, status, clearance_date)
 *  - erpnext/accounts/doctype/bank_clearance/bank_clearance.py (get_payment_entries / update_clearance_date)
 *  - erpnext/accounts/doctype/payment_reconciliation/payment_reconciliation.py (get_unreconciled_entries / allocate_entries / reconcile)
 * Ledger links and outstanding are changed only through posting.ts reconcileAllocations.
 */
import { adapter, registerDocHook, type Doc } from "./adapter";
import { resolveName } from "./rename";
import { reconcileAllocations, type Allocation } from "./posting";

const n = (v: unknown) => Number(v) || 0;
const r2 = (x: number) => Math.round(x * 100) / 100;
const rows = (d: Doc, f: string) => ((d[f] as Record<string, unknown>[] | undefined) ?? []);
const sameCo = (a: unknown, b: unknown) => resolveName("Company", String(a ?? "")) === resolveName("Company", String(b ?? ""));

// ---------------- Bank Transaction ----------------
const setClearance = (dt: unknown, name: unknown, date: string | null) => { if (dt && name && adapter.get(String(dt), String(name))) adapter.update(String(dt), String(name), { clearance_date: date ?? "" }); };
registerDocHook("Bank Transaction", (doc, before) => {
  const amount = r2(n(doc["deposit"]) || n(doc["withdrawal"]));
  const pe: Record<string, unknown>[] = rows(doc, "payment_entries").map((r, i) => ({ ...r, idx: i + 1, clearance_date: r["clearance_date"] || doc["date"] }));
  const allocated = r2(pe.reduce((s, r) => s + n(r["allocated_amount"]), 0)); const unallocated = r2(amount - allocated);
  const errors: string[] = [];
  if (n(doc["deposit"]) && n(doc["withdrawal"])) errors.push("Only one of Deposit or Withdrawal should be non-zero when applying an Excluded Fee.".replace(" when applying an Excluded Fee", ""));
  if (allocated > amount + 0.005) errors.push(`Allocated Amount ${allocated} cannot be greater than the transaction amount ${amount}`);
  const seen = new Set<string>();
  for (const r of pe) { const k = `${r["payment_document"]}:${r["payment_entry"]}`; if (seen.has(k)) errors.push(`${r["payment_entry"]} is already allocated in this Bank Transaction`); seen.add(k); }
  const ds = n(doc.docstatus);
  const status = ds === 2 ? "Cancelled" : ds === 0 ? "Pending" : unallocated <= 0.005 ? "Reconciled" : "Unreconciled";
  const d = { ...doc, payment_entries: pe, allocated_amount: allocated, unallocated_amount: unallocated, status };
  const prev = rows(before ?? ({} as Doc), "payment_entries");
  return { doc: d, ...(errors.length ? { errors } : {}), after: (x) => {
    const live = n(x.docstatus) === 1;
    for (const r of prev) if (!live || !rows(x, "payment_entries").some((q) => q["payment_entry"] === r["payment_entry"])) setClearance(r["payment_document"], r["payment_entry"], null);
    if (live) for (const r of rows(x, "payment_entries")) setClearance(r["payment_document"], r["payment_entry"], String(x["date"]));
  } };
});
/** bank_transaction.js "Unreconcile Transaction" → remove_payment_entries */
export function unreconcileTransaction(name: string) { adapter.update("Bank Transaction", name, { payment_entries: [] }); }

// ---------------- Bank Clearance ----------------
export function getPaymentEntries(d: Doc): Record<string, unknown> {
  const acct = String(d["account"] || adapter.get("Bank Account", String(d["bank_account"] ?? ""))?.["account"] || "");
  if (!acct) throw new Error("Account is mandatory to get payment entries");
  if (!d["from_date"] || !d["to_date"]) throw new Error("From Date and To Date are mandatory");
  const out: Record<string, unknown>[] = [];
  for (const g of adapter.list("GL Entry")) {
    if (n(g["is_cancelled"]) || resolveName("Account", String(g["account"])) !== resolveName("Account", acct)) continue;
    const dt = String(g["voucher_type"]); if (dt !== "Payment Entry" && dt !== "Journal Entry") continue;
    const pd = String(g["posting_date"]); if (pd < String(d["from_date"]) || pd > String(d["to_date"])) continue;
    const v = adapter.get(dt, String(g["voucher_no"])); if (!v) continue;
    if (v["clearance_date"] && !n(d["include_reconciled_entries"])) continue;
    out.push({ idx: out.length + 1, payment_document: dt, payment_entry: v.name, posting_date: pd, amount: `${r2(n(g["debit"]) - n(g["credit"]))}`,
      against_account: String(dt === "Payment Entry" ? (n(g["debit"]) ? v["paid_from"] : v["paid_to"]) ?? "" : ""), cheque_number: v["reference_no"] ?? v["cheque_no"] ?? "", cheque_date: v["reference_date"] ?? v["cheque_date"] ?? "", clearance_date: v["clearance_date"] ?? "" });
  }
  out.sort((a, b) => String(a["posting_date"]).localeCompare(String(b["posting_date"])));
  return { payment_entries: out.map((r, i) => ({ ...r, idx: i + 1 })) };
}
export function updateClearanceDate(d: Doc): number {
  let k = 0;
  for (const r of rows(d, "payment_entries")) {
    const cd = r["clearance_date"] ? String(r["clearance_date"]) : "";
    if (cd && cd < String(r["posting_date"])) throw new Error(`Row #${r["idx"]}: Clearance date ${cd} cannot be before Cheque Date ${r["posting_date"]}`);
    const v = adapter.get(String(r["payment_document"]), String(r["payment_entry"])); if (!v || String(v["clearance_date"] ?? "") === cd) continue;
    adapter.update(String(r["payment_document"]), String(r["payment_entry"]), { clearance_date: cd }); k++;
  }
  return k;
}

// ---------------- Payment Reconciliation ----------------
export function getUnreconciledEntries(d: Doc): Record<string, unknown> {
  const pt = String(d["party_type"] ?? ""), party = String(d["party"] ?? "");
  if (!d["company"] || !pt || !party) throw new Error("Company, Party Type and Party are mandatory");
  const idt = pt === "Customer" ? "Sales Invoice" : pt === "Supplier" ? "Purchase Invoice" : "";
  const pf = pt === "Customer" ? "customer" : "supplier";
  const within = (x: unknown, a: unknown, b: unknown) => (!a || String(x) >= String(a)) && (!b || String(x) <= String(b));
  const invoices = idt ? adapter.list(idt).filter((x) => n(x.docstatus) === 1 && !n(x["is_return"]) && x[pf] === party && sameCo(x["company"], d["company"]) && n(x["outstanding_amount"]) > 0.005
    && within(x["posting_date"], d["from_invoice_date"], d["to_invoice_date"]) && (!n(d["minimum_invoice_amount"]) || n(x["outstanding_amount"]) >= n(d["minimum_invoice_amount"])) && (!n(d["maximum_invoice_amount"]) || n(x["outstanding_amount"]) <= n(d["maximum_invoice_amount"])))
    .sort((a, b) => String(a["posting_date"]).localeCompare(String(b["posting_date"])))
    .map((x) => ({ invoice_type: idt, invoice_number: x.name, invoice_date: x["posting_date"], amount: x["grand_total"], outstanding_amount: x["outstanding_amount"], currency: x["currency"] ?? "SAR", exchange_rate: 1 })) : [];
  // unallocated party GL rows (advances): Payment Entry / Journal Entry party lines not linked to an invoice
  const sign = pt === "Customer" ? -1 : 1; const payments: Record<string, unknown>[] = [];
  for (const g of adapter.list("GL Entry")) {
    if (n(g["is_cancelled"]) || g["party_type"] !== pt || g["party"] !== party || !sameCo(g["company"], d["company"])) continue;
    const vt = String(g["voucher_type"]); if (vt !== "Payment Entry" && vt !== "Journal Entry") continue;
    if (g["against_voucher"] && g["against_voucher"] !== g["voucher_no"]) continue;
    const amt = r2(sign * (n(g["debit"]) - n(g["credit"]))); if (amt <= 0.005) continue;
    if (!within(g["posting_date"], d["from_payment_date"], d["to_payment_date"])) continue;
    payments.push({ reference_type: vt, reference_name: g["voucher_no"], posting_date: g["posting_date"], is_advance: vt === "Payment Entry" ? "Yes" : "No", amount: amt, currency: "SAR", exchange_rate: 1, remarks: "" });
  }
  payments.sort((a, b) => String(a["posting_date"]).localeCompare(String(b["posting_date"])));
  const lim = (xs: Record<string, unknown>[], l: unknown): Record<string, unknown>[] => (n(l) ? xs.slice(0, n(l)) : xs).map((x, i) => ({ ...x, idx: i + 1 }));
  const inv = lim(invoices, d["invoice_limit"] ?? 50), pay = lim(payments, d["payment_limit"] ?? 50);
  const ti = r2(inv.reduce((s, x) => s + n(x["outstanding_amount"]), 0)), tp = r2(pay.reduce((s, x) => s + n(x["amount"]), 0));
  return { invoices: inv, payments: pay, allocation: [], total_invoice_amount: ti, total_payment_amount: tp, difference_amount: r2(tp - ti) };
}
/** allocate_entries: FIFO payments against invoices. */
export function allocateEntries(d: Doc): Record<string, unknown> {
  const inv: (Record<string, unknown> & { left: number })[] = rows(d, "invoices").map((x) => ({ ...x, left: n(x["outstanding_amount"]) })); const out: Record<string, unknown>[] = [];
  for (const p of rows(d, "payments")) {
    let left = n(p["amount"]);
    for (const i of inv) {
      if (left <= 0.005) break; if (i.left <= 0.005) continue;
      const a = r2(Math.min(left, i.left)); left = r2(left - a); i.left = r2(i.left - a);
      out.push({ idx: out.length + 1, reference_type: p["reference_type"], reference_name: p["reference_name"], invoice_type: i["invoice_type"], invoice_number: i["invoice_number"], allocated_amount: a, unreconciled_amount: p["amount"], amount: p["amount"], is_advance: p["is_advance"], difference_amount: 0, currency: "SAR", exchange_rate: 1 });
    }
  }
  if (!out.length) throw new Error("No records found in the Invoices and Payments tables to allocate");
  return { allocation: out };
}
export function reconcile(d: Doc): { patch: Record<string, unknown>; count: number } {
  const al = rows(d, "allocation"); if (!al.length) throw new Error("No records found in Allocation table");
  // Unsafe path blocked: realized exchange gain/loss (difference JE) is not ported, so foreign-currency allocations are refused; company-currency flows are unaffected
  const co = adapter.list("Company").find((c) => c.name === d["company"] || c["company_name"] === d["company"]); const cc = String(co?.["default_currency"] ?? "SAR");
  for (const a of al) { const inv = adapter.get(String(a["invoice_type"]), String(a["invoice_number"])); const cur = String(inv?.["currency"] ?? cc);
    if (cur !== cc || (n(inv?.["conversion_rate"]) && Math.abs(n(inv?.["conversion_rate"]) - 1) > 1e-9 && cur !== cc)) throw new Error(`Invoice ${a["invoice_number"]} is in ${cur}; foreign-currency reconciliation with exchange gain/loss is not supported in this preview`); }
  const errs = reconcileAllocations(al as unknown as Allocation[]); if (errs.length) throw new Error(errs.join("\n"));
  return { patch: getUnreconciledEntries(d), count: al.length };
}
