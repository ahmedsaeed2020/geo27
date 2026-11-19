/**
 * Port of erpnext/accounts/doctype/opening_invoice_creation_tool/opening_invoice_creation_tool.py
 * (make_invoices / get_invoice_dict / add_party / get_temporary_opening_account) over adapter records.
 * Each row becomes a submitted Sales/Purchase Invoice with is_opening "Yes", one item booked to the
 * Temporary Opening account; ledger rows come only from posting.ts submit.
 */
import { adapter, type Doc } from "./adapter";
import { resolveName } from "./rename";
import { submit } from "./posting";

const n = (v: unknown) => Number(v) || 0;
const today = () => new Date().toISOString().slice(0, 10);

export function temporaryOpeningAccount(company: string): string {
  const co = resolveName("Company", company);
  const ab = String(adapter.get("Company", co)?.["abbr"] ?? "");
  const tmp = adapter.list("Account").filter((x) => x["account_type"] === "Temporary" && !n(x["is_group"]));
  const a = tmp.find((x) => resolveName("Company", String(x["company"] ?? "")) === co) ?? (ab ? tmp.find((x) => x.name.endsWith(` - ${ab}`)) : undefined);
  if (!a) throw new Error("Please add a Temporary Opening account in Chart of Accounts");
  return a.name;
}

export function makeInvoices(d: Doc): { created: string[] } {
  const company = String(d["company"] ?? ""); if (!company) throw new Error("Company is mandatory");
  const sales = d["invoice_type"] !== "Purchase"; const dt = sales ? "Sales Invoice" : "Purchase Invoice"; const pt = sales ? "Customer" : "Supplier";
  const rows = (d["invoices"] as Record<string, unknown>[] | undefined) ?? [];
  if (!rows.length) throw new Error("Please add at least one row in Invoices");
  const co = adapter.get("Company", resolveName("Company", company)); const abbr = String(co?.["abbr"] ?? "");
  const tmp = temporaryOpeningAccount(company);
  // validate all rows first (source throws before creating anything)
  rows.forEach((r, i) => {
    const row = i + 1;
    if (!(n(r["outstanding_amount"]) > 0)) throw new Error(`Row #${row}: Outstanding Amount is mandatory`);
    if (!r["party"] && !n(d["create_missing_party"])) throw new Error(`Row #${row}: Party is mandatory`);
    if (r["party"] && !adapter.get(pt, String(r["party"])) && !n(d["create_missing_party"])) throw new Error(`Row #${row}: ${pt} ${r["party"]} does not exist`);
  });
  const created: string[] = [];
  for (const r of rows) {
    let party = String(r["party"] || r["party_name"] || "");
    if (!adapter.get(pt, party)) { // add_party
      const nm = String(r["party_name"] || r["party"]);
      party = adapter.insertDoc(pt, { name: nm, [sales ? "customer_name" : "supplier_name"]: nm, [sales ? "customer_group" : "supplier_group"]: sales ? "Corporate" : "Local Supplier", ...(sales ? { territory: "All Territories" } : {}) }).name;
    }
    const qty = n(r["qty"]) || 1, amt = n(r["outstanding_amount"]);
    const date = String(r["posting_date"] || today());
    const inv = adapter.insertDoc(dt, {
      company, is_opening: "Yes", set_posting_time: 1, posting_date: date, due_date: String(r["due_date"] || date),
      [sales ? "customer" : "supplier"]: party, [sales ? "customer_name" : "supplier_name"]: String(adapter.get(pt, party)?.[sales ? "customer_name" : "supplier_name"] ?? party),
      ...(sales ? { debit_to: `Debtors - ${abbr}` } : { credit_to: `Creditors - ${abbr}`, bill_no: r["invoice_number"] ?? "", bill_date: r["supplier_invoice_date"] ?? "" }),
      cost_center: r["cost_center"] || d["cost_center"] || "", project: r["project"] || d["project"] || "",
      items: [{ idx: 1, item_name: String(r["item_name"] || "Opening Invoice Item"), description: String(r["item_name"] || "Opening Invoice Item"), qty, uom: "Nos", conversion_factor: 1, rate: amt / qty, amount: amt, net_amount: amt, [sales ? "income_account" : "expense_account"]: String(r["temporary_opening_account"] || tmp), cost_center: r["cost_center"] || d["cost_center"] || "" }],
      net_total: amt, total: amt, grand_total: amt, rounded_total: amt, disable_rounded_total: 1, outstanding_amount: amt, docstatus: 0,
    });
    const e = submit(dt, inv.name); if (e.length) throw new Error(e.join("; "));
    created.push(inv.name);
  }
  return { created };
}

/** get_opening_invoice_summary: per company, count + outstanding of opening invoices by type. */
export function openingSummary(company: string) {
  const co = resolveName("Company", company);
  return (["Sales Invoice", "Purchase Invoice"] as const).map((dt) => {
    const l = adapter.list(dt).filter((x) => x["is_opening"] === "Yes" && n(x["docstatus"]) === 1 && resolveName("Company", String(x["company"] ?? "")) === co);
    return { doctype: dt, count: l.length, outstanding: l.reduce((s, x) => s + n(x["outstanding_amount"]), 0) };
  });
}
