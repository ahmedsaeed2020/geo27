/**
 * Selling/buying cycle validations — synthetic-preview ports of:
 *  - erpnext/controllers/status_updater.py validate_qty / limits_crossed_error (over-delivery, over-billing, over-receipt allowance)
 *  - erpnext/selling/doctype/customer/customer.py check_credit_limit / get_customer_outstanding
 *  - erpnext/selling/doctype/sales_order/sales_order.py validate_with_previous_doc (expired quotation)
 *  - erpnext/controllers/accounts_controller.py validate_qty_is_not_zero (allow_zero_qty_in_quotation / _sales_order)
 *  - frappe/model/document.py check_no_back_links_exist (cancel blocked by submitted next documents)
 * Runs only over adapter records; no server code is executed.
 */
import { adapter, type Doc } from "./adapter";
import { userRoles } from "./session";

const n = (v: unknown) => Number(v) || 0;
const r2 = (x: number) => Math.round(x * 100) / 100;
const rows = (d: Doc, f = "items") => ((d[f] as Doc[] | undefined) ?? []);
const single = (dt: string) => adapter.get(dt, dt) ?? {} as Doc;
const hasRole = (r: unknown) => !!r && userRoles().includes(String(r));

/** status_updater.py status_map links: target row field → source document, compared by qty or amount. */
export const NEXT_LINKS: { sdt: string; tdt: string; field: string; by: "qty" | "amount" }[] = [
  { sdt: "Quotation", tdt: "Sales Order", field: "prevdoc_docname", by: "qty" },
  { sdt: "Sales Order", tdt: "Delivery Note", field: "against_sales_order", by: "qty" },
  { sdt: "Sales Order", tdt: "Sales Invoice", field: "sales_order", by: "amount" },
  { sdt: "Delivery Note", tdt: "Sales Invoice", field: "delivery_note", by: "amount" },
  { sdt: "Material Request", tdt: "Purchase Order", field: "material_request", by: "qty" },
  { sdt: "Supplier Quotation", tdt: "Purchase Order", field: "supplier_quotation", by: "qty" },
  { sdt: "Purchase Order", tdt: "Purchase Receipt", field: "purchase_order", by: "qty" },
  { sdt: "Purchase Order", tdt: "Purchase Invoice", field: "purchase_order", by: "amount" },
  { sdt: "Purchase Receipt", tdt: "Purchase Invoice", field: "purchase_receipt", by: "amount" },
];
/** Child-row link to the exact source row (get_mapped_doc field_map, e.g. so_detail, po_detail, purchase_order_item). */
export const DETAIL: Record<string, string> = {
  "Quotation>Sales Order": "quotation_item", "Sales Order>Delivery Note": "so_detail", "Sales Order>Sales Invoice": "so_detail", "Delivery Note>Sales Invoice": "dn_detail",
  "Material Request>Purchase Order": "material_request_item", "Material Request>Purchase Receipt": "material_request_item", "Purchase Order>Purchase Receipt": "purchase_order_item",
  "Purchase Order>Purchase Invoice": "po_detail", "Purchase Receipt>Purchase Invoice": "pr_detail", "Supplier Quotation>Purchase Order": "supplier_quotation_item",
};
/** Does target row t belong to source row s? By row link when present, else by item (older records). */
export function rowMatch(sdt: string, tdt: string, s: Record<string, unknown>, t: Record<string, unknown>, srcRows?: Record<string, unknown>[]): boolean {
  const f = DETAIL[`${sdt}>${tdt}`]; const v = f ? t[f] : undefined;
  if (v) return v === s["name"];
  // legacy row without a source-line link: attribute by item only when that item is on exactly one source line
  if (srcRows && srcRows.filter((x) => x["item_code"] === t["item_code"]).length > 1) return false;
  return t["item_code"] === s["item_code"];
}
/** Legacy (no row link) target row whose item appears on several source lines — cannot be attributed safely. */
export function ambiguousRow(sdt: string, tdt: string, t: Record<string, unknown>, srcRows: Record<string, unknown>[]): boolean {
  const f = DETAIL[`${sdt}>${tdt}`]; return !!f && !t[f] && srcRows.filter((x) => x["item_code"] === t["item_code"]).length > 1;
}
/** New submits must name the source line when the item is on several lines (no silent item-code allocation). */
function ambiguityErrors(dt: string, d: Doc): string[] {
  const e: string[] = [];
  for (const l of NEXT_LINKS.filter((x) => x.tdt === dt)) for (const r of rows(d)) {
    const sn = r[l.field]; if (!sn) continue; const src = adapter.get(l.sdt, String(sn)); if (!src) continue;
    if (ambiguousRow(l.sdt, dt, r, rows(src))) e.push(`Row #${r["idx"] ?? 1}: Item ${r["item_code"]} appears on more than one line of ${l.sdt} ${sn}; select the source line`);
  }
  return e;
}
const amt = (r: Doc) => n(r["amount"] ?? n(r["qty"]) * n(r["rate"]));

/** validate_qty: quantity/amount beyond the source row plus allowance % is refused, unless the user has the allowed role. */
function overLimitErrors(dt: string, d: Doc): string[] {
  if (n(d["is_return"])) return [];
  const e: string[] = []; const ss = single("Stock Settings"), as = single("Accounts Settings");
  for (const l of NEXT_LINKS.filter((x) => x.tdt === dt)) {
    if (l.sdt === "Quotation" || l.sdt === "Supplier Quotation") continue; // quotation → order is not limit-checked in ERPNext
    const mine = rows(d).filter((r) => r[l.field]); const srcs = new Set(mine.map((r) => String(r[l.field])));
    for (const sn of srcs) {
      const src = adapter.get(l.sdt, sn); if (!src || n(src["docstatus"]) !== 1) continue;
      const others = adapter.list(dt).filter((t) => n(t["docstatus"]) === 1 && t.name !== d.name && !n(t["is_return"])).flatMap((t) => rows(t)).filter((r) => r[l.field] === sn);
      for (const it of rows(src)) {
        const code = it["item_code"]; const m = (r: Doc) => rowMatch(l.sdt, dt, it, r, rows(src)); const cur = mine.filter((r) => r[l.field] === sn && m(r)); if (!cur.length) continue;
        const item = adapter.get("Item", String(code));
        const allow = l.tdt === "Purchase Order" ? n(single("Buying Settings")["over_order_allowance"]) : l.by === "qty" ? n(item?.["over_delivery_receipt_allowance"] || ss["over_delivery_receipt_allowance"]) : n(item?.["over_billing_allowance"] || as["over_billing_allowance"]);
        const role = l.by === "qty" ? ss["role_allowed_to_over_deliver_receive"] : as["role_allowed_to_over_bill"];
        const val = (r: Doc) => (l.by === "qty" ? n(r["qty"]) : amt(r));
        const limit = val(it) * (1 + allow / 100); const total = [...others, ...cur].filter(m).reduce((s, r) => s + val(r), 0);
        if (total > limit + 0.005 && !hasRole(role)) {
          const what = l.by === "qty" ? (dt === "Purchase Receipt" ? "received" : dt === "Purchase Order" ? "ordered" : "delivered") : "billed";
          e.push(`This document is over limit by ${r2(total - val(it))} for item ${code}. Are you making another ${dt} against the same ${l.sdt} ${sn}? (${what} allowance ${allow}%)`);
        }
      }
    }
  }
  return e;
}

/** get_customer_outstanding: receivable GL balance + unbilled Sales Orders + unbilled Delivery Notes not against an order. */
export function customerOutstanding(customer: string, company: string, exclude?: string): number {
  const gl = adapter.list("GL Entry").filter((g) => !n(g["is_cancelled"]) && g["party_type"] === "Customer" && g["party"] === customer && (!company || g["company"] === company)).reduce((s, g) => s + n(g["debit"]) - n(g["credit"]), 0);
  const so = adapter.list("Sales Order").filter((o) => n(o["docstatus"]) === 1 && o["customer"] === customer && o.name !== exclude && !["Closed", "Completed"].includes(String(o["status"]))).reduce((s, o) => s + n(o["base_grand_total"] ?? o["grand_total"]) * (100 - n(o["per_billed"])) / 100, 0);
  const dn = adapter.list("Delivery Note").filter((o) => n(o["docstatus"]) === 1 && o["customer"] === customer && o.name !== exclude && !n(o["is_return"]) && !rows(o).some((r) => r["against_sales_order"])).reduce((s, o) => s + n(o["grand_total"]) * (100 - n(o["per_billed"])) / 100, 0);
  return r2(gl + so + dn);
}
export function creditLimit(customer: string, company: string): { limit: number; bypass: boolean } {
  const c = adapter.get("Customer", customer); const row = rows(c ?? ({} as Doc), "credit_limits").find((x) => !x["company"] || x["company"] === company);
  if (row) return { limit: n(row["credit_limit"]), bypass: !!n(row["bypass_credit_limit_check"]) };
  const grp = adapter.get("Customer Group", String(c?.["customer_group"] ?? "")); const g = rows(grp ?? ({} as Doc), "credit_limits").find((x) => !x["company"] || x["company"] === company);
  return { limit: n(g?.["credit_limit"]), bypass: !!n(g?.["bypass_credit_limit_check"]) };
}
/** check_credit_limit: Sales Order checks unless bypassed at order level; Sales Invoice checks when bypassed at order, or when a row has no order/delivery. */
function creditErrors(dt: string, d: Doc): string[] {
  if (!["Sales Order", "Sales Invoice"].includes(dt) || n(d["is_return"])) return [];
  const cust = String(d["customer"] ?? ""), co = String(d["company"] ?? ""); const { limit, bypass } = creditLimit(cust, co); if (!limit) return [];
  if (dt === "Sales Order" && bypass) return [];
  if (dt === "Sales Invoice" && !bypass && rows(d).every((r) => r["sales_order"] || r["delivery_note"])) return [];
  if (hasRole(single("Accounts Settings")["credit_controller"])) return [];
  // an invoice against an order replaces that order's unbilled part, so it is not counted twice
  const viaOrder = rows(d).filter((r) => r["sales_order"]).reduce((s, r) => s + amt(r), 0);
  const total = r2(customerOutstanding(cust, co, d.name) + n(d["base_grand_total"] ?? d["grand_total"]) - (dt === "Sales Invoice" ? viaOrder : 0));
  return total > limit + 0.005 ? [`Credit limit has been crossed for customer ${cust} (${total}/${limit})`] : [];
}

function quotationErrors(dt: string, d: Doc): string[] {
  const e: string[] = []; const sset = single("Selling Settings");
  if (dt === "Sales Order" && !n(sset["allow_sales_order_creation_for_expired_quotation"])) {
    for (const q of new Set(rows(d).map((r) => String(r["prevdoc_docname"] ?? "")).filter(Boolean))) {
      const qd = adapter.get("Quotation", q); const vt = String(qd?.["valid_till"] ?? "");
      if (vt && vt < String(d["transaction_date"] ?? new Date().toISOString().slice(0, 10))) e.push(`Validity period of this quotation ${q} has ended.`);
      if (qd && n(qd["docstatus"]) !== 1) e.push(`Quotation ${q} is not submitted`);
    }
  }
  const zero = (dt === "Quotation" && n(sset["allow_zero_qty_in_quotation"])) || (dt === "Sales Order" && n(sset["allow_zero_qty_in_sales_order"]));
  if (["Quotation", "Sales Order", "Delivery Note", "Sales Invoice"].includes(dt) && !zero && !n(d["is_return"]))
    for (const r of rows(d)) if (!n(r["qty"])) e.push(`Row #${r["idx"] ?? 1}: Quantity for Item ${r["item_code"]} cannot be zero.`);
  return e;
}

/** Buying side: supplier hold (party.py validate_party_frozen / is_party_on_hold), scorecard prevent/warn (purchase_order.py
 *  validate_supplier), check_supplier_invoice_uniqueness, Buying Settings po_required / pr_required and allow_zero_qty_in_*. */
function buyingErrors(dt: string, d: Doc): string[] {
  const e: string[] = []; const bs = single("Buying Settings"); const date = String(d["posting_date"] ?? d["transaction_date"] ?? new Date().toISOString().slice(0, 10));
  const supName = dt === "Payment Entry" ? (d["party_type"] === "Supplier" ? String(d["party"] ?? "") : "") : String(d["supplier"] ?? "");
  const sup = supName ? adapter.get("Supplier", supName) : undefined;
  if (sup && n(sup["on_hold"]) && !(sup["release_date"] && String(sup["release_date"]) <= date)) {
    const ht = String(sup["hold_type"] || "All");
    const hit = ht === "All" ? ["Purchase Order", "Purchase Receipt", "Purchase Invoice", "Payment Entry", "Supplier Quotation"].includes(dt) : ht === "Invoices" ? dt === "Purchase Invoice" : ht === "Payments" ? dt === "Payment Entry" : false;
    if (hit) e.push(`Supplier ${supName} is blocked so this transaction cannot proceed`);
  }
  if (sup && dt === "Purchase Order" && n(sup["prevent_pos"])) e.push(`Purchase Orders are not allowed for ${supName} due to a scorecard standing of ${sup["supplier_scorecard_standing"] ?? sup["standing"] ?? "Poor"}.`);
  if (dt === "Purchase Invoice" && !n(d["is_return"]) && d["bill_no"] && n(single("Accounts Settings")["check_supplier_invoice_uniqueness"])) {
    const fyr = adapter.list("Fiscal Year").find((y) => String(y["year_start_date"]) <= date && String(y["year_end_date"]) >= date);
    const dup = adapter.list("Purchase Invoice").find((x) => x.name !== d.name && n(x["docstatus"]) !== 2 && !n(x["is_return"]) && x["supplier"] === d["supplier"] && x["bill_no"] === d["bill_no"] && x["company"] === d["company"] && (!fyr || (String(x["posting_date"]) >= String(fyr["year_start_date"]) && String(x["posting_date"]) <= String(fyr["year_end_date"]))));
    if (dup) e.push(`Supplier Invoice No exists in Purchase Invoice ${dup.name}`);
  }
  if (dt === "Purchase Invoice" && !n(d["is_return"]))
    for (const r of rows(d)) {
      if (bs["po_required"] === "Yes" && !r["purchase_order"]) e.push(`Purchase Order Required for item ${r["item_code"]}`);
      if (bs["pr_required"] === "Yes" && !r["purchase_receipt"] && !n(d["update_stock"])) e.push(`Purchase Receipt Required for item ${r["item_code"]}`);
    }
  const zeroOk = (dt === "Supplier Quotation" && n(bs["allow_zero_qty_in_supplier_quotation"])) || (dt === "Request for Quotation" && n(bs["allow_zero_qty_in_request_for_quotation"])) || (dt === "Purchase Order" && n(bs["allow_zero_qty_in_purchase_order"]));
  if (["Supplier Quotation", "Request for Quotation", "Purchase Order", "Purchase Receipt", "Purchase Invoice", "Material Request"].includes(dt) && !zeroOk && !n(d["is_return"]))
    for (const r of rows(d)) if (!n(r["qty"])) e.push(`Row #${r["idx"] ?? 1}: Quantity for Item ${r["item_code"]} cannot be zero.`);
  return e;
}

/** check_on_hold_or_closed_status: no next document against a held, closed or stopped source. */
function heldErrors(dt: string, d: Doc): string[] {
  const e: string[] = [];
  for (const l of NEXT_LINKS.filter((x) => x.tdt === dt)) for (const sn of new Set(rows(d).map((r) => String(r[l.field] ?? "")).filter(Boolean))) {
    const st = String(adapter.get(l.sdt, sn)?.["status"] ?? ""); if (["Closed", "On Hold", "Stopped"].includes(st)) e.push(`${l.sdt} ${sn} is ${st}`);
  }
  return e;
}
/** sales_order.py / purchase_order.py update_status (Hold, Resume, Close, Re-open) and material_request.py update_status (Stop). */
export function setOrderStatus(dt: string, name: string, action: string, refresh: (dt: string, name: string) => void, reason?: string): string {
  const d = adapter.get(dt, name); if (!d) throw new Error(`${dt} ${name} not found`);
  if (n(d["docstatus"]) !== 1) throw new Error(`${dt} ${name} must be submitted`);
  const st = String(d["status"] ?? "");
  if (action === "Hold") {
    if (["Closed", "Completed"].includes(st)) throw new Error(`Cannot hold a ${st} ${dt}`);
    if (!reason?.trim()) throw new Error("Reason for Hold is mandatory");
    adapter.update(dt, name, { status: "On Hold" });
    adapter.insertDoc("Comment", { comment_type: "Comment", reference_doctype: dt, reference_name: name, content: `Reason for hold: ${reason.trim()}` });
    return "On Hold";
  }
  if (action === "Close" || action === "Stop") { if (st === "Cancelled") throw new Error(`Cannot close a cancelled ${dt}`); adapter.update(dt, name, { status: action === "Stop" ? "Stopped" : "Closed" }); if (dt === "Sales Order") for (const s of adapter.list("Stock Reservation Entry").filter((x) => n(x["docstatus"]) === 1 && x["voucher_no"] === name && x["status"] !== "Delivered")) adapter.update("Stock Reservation Entry", s.name, { docstatus: 2, status: "Cancelled" }); return action === "Stop" ? "Stopped" : "Closed"; }
  if (action === "Resume" || action === "Re-open") {
    if (action === "Resume" && st !== "On Hold") throw new Error(`${dt} ${name} is not On Hold`);
    if (action === "Re-open" && !["Closed", "Stopped"].includes(st)) throw new Error(`${dt} ${name} is not Closed`);
    adapter.update(dt, name, { status: "Submitted" }); refresh(dt, name); return String(adapter.get(dt, name)!["status"]);
  }
  throw new Error(`Unknown action ${action}`);
}

/** Quantity / amount already made against one source row's item by submitted next documents of a given link. */
function doneAgainst(sdt: string, name: string, src: Doc, by: "qty" | "amount"): number {
  return NEXT_LINKS.filter((l) => l.sdt === sdt && l.by === by).reduce((s, l) => s + adapter.list(l.tdt).filter((t) => n(t["docstatus"]) === 1 && !n(t["is_return"])).flatMap((t) => rows(t)).filter((r) => r[l.field] === name && rowMatch(sdt, l.tdt, src, r)).reduce((a, r) => a + (by === "qty" ? n(r["qty"]) : amt(r)), 0), 0);
}
/** controllers/accounts_controller.py update_child_qty_rate: change qty/rate of a submitted order's rows.
 *  spec per row "qty" or "qty@rate", separated by ";". Refuses qty below delivered/received/billed and rate change on billed rows. */
export function updateItems(dt: string, name: string, spec: string, refresh: (dt: string, name: string) => void): number {
  const d = adapter.get(dt, name); if (!d) throw new Error(`${dt} ${name} not found`);
  if (n(d["docstatus"]) !== 1) throw new Error(`${dt} ${name} must be submitted`);
  const st = String(d["status"] ?? ""); if (["Closed", "On Hold", "Completed"].includes(st)) throw new Error(`Cannot update items of a ${st} ${dt}`);
  const parts = spec.split(";").map((x) => x.trim()); const items = rows(d).map((r) => ({ ...r })); let changed = 0;
  items.forEach((r, i) => {
    const p = parts[i]; if (!p) return;
    const [q, rt] = p.split("@").map((x) => x.trim()); const qty = q === "" ? n(r["qty"]) : Number(q); const rate = rt === undefined || rt === "" ? n(r["rate"]) : Number(rt);
    if (!(qty > 0) || !(rate >= 0) || Number.isNaN(qty) || Number.isNaN(rate)) throw new Error(`Row #${i + 1}: Invalid quantity or rate`);
    const moved = doneAgainst(dt, name, r, "qty"), billed = doneAgainst(dt, name, r, "amount");
    const what = dt === "Purchase Order" ? "received" : "delivered";
    if (qty < moved - 0.005) throw new Error(`Row #${i + 1}: Cannot set quantity less than ${what} quantity`);
    if (billed > 0.005 && Math.abs(rate - n(r["rate"])) > 0.005) throw new Error(`Row #${i + 1}: Cannot update rate as the item is already billed`);
    if (qty * rate < billed - 0.005) throw new Error(`Row #${i + 1}: Cannot set amount less than billed amount`);
    if (qty !== n(r["qty"]) || rate !== n(r["rate"])) changed++;
    Object.assign(r, { qty, rate, amount: r2(qty * rate), base_rate: rate, base_amount: r2(qty * rate), net_rate: rate, net_amount: r2(qty * rate), stock_qty: qty * (n(r["conversion_factor"]) || 1) });
  });
  if (!changed) throw new Error("No changes to update");
  const net = r2(items.reduce((s, r) => s + n(r["amount"]), 0)); const tax = n(d["total_taxes_and_charges"]);
  const oldNet = n(d["net_total"] ?? d["total"]); const newTax = oldNet ? r2(tax * net / oldNet) : tax;
  adapter.update(dt, name, { items, total: net, net_total: net, base_total: net, base_net_total: net, total_taxes_and_charges: newTax, grand_total: r2(net + newTax), base_grand_total: r2(net + newTax), rounded_total: Math.round(net + newTax), total_qty: items.reduce((s, r) => s + n(r["qty"]), 0) });
  adapter.insertDoc("Comment", { comment_type: "Info", reference_doctype: dt, reference_name: name, content: `Items updated (${changed} row(s))` });
  refresh(dt, name); return changed;
}

export function sellingErrors(dt: string, d: Doc): string[] {
  return [...ambiguityErrors(dt, d), ...heldErrors(dt, d), ...quotationErrors(dt, d), ...buyingErrors(dt, d), ...overLimitErrors(dt, d), ...creditErrors(dt, d)];
}

/** check_no_back_links_exist: a document cannot be cancelled while a submitted next document still links to it. */
export function backLinkErrors(dt: string, name: string): string[] {
  const e: string[] = [];
  for (const l of NEXT_LINKS.filter((x) => x.sdt === dt))
    for (const t of adapter.list(l.tdt)) if (n(t["docstatus"]) === 1 && rows(t).some((r) => r[l.field] === name)) e.push(`Cannot delete or cancel because ${dt} ${name} is linked with ${l.tdt} ${t.name}`);
  return e;
}
