/**
 * Stock cycle rules — synthetic-preview ports of:
 *  - erpnext/stock/doctype/stock_entry/stock_entry.py validate_warehouse (purpose vs source/target)
 *  - erpnext/stock/stock_ledger.py validate_negative_qty_in_future_sle / NegativeStockError (Stock Settings allow_negative_stock)
 *  - erpnext/stock/doctype/stock_reconciliation/stock_reconciliation.py remove_items_with_no_change / get_sle_for_items
 *  - erpnext/stock/doctype/landed_cost_voucher/landed_cost_voucher.py distribute charges + update_landed_cost (repost PR valuation)
 * Runs only over adapter records; repost is passed in by posting.ts so this module never imports it.
 */
import { adapter, type Doc } from "./adapter";
import { pickForReservation, hasSerial, hasBatch } from "./serialBatch";

const n = (v: unknown) => Number(v) || 0;
const r2 = (x: number) => Math.round(x * 100) / 100;
const rows = (d: Doc, f = "items") => ((d[f] as Doc[] | undefined) ?? []);

/** Qty of item in warehouse up to and including date (posted, not cancelled), excluding one voucher. */
export function qtyAt(item: string, wh: string, date = "9999-12-31", exclude?: string): number {
  return r2(adapter.list("Stock Ledger Entry").filter((s) => !n(s["is_cancelled"]) && s["item_code"] === item && s["warehouse"] === wh && String(s["posting_date"]) <= date && s["voucher_no"] !== exclude).reduce((a, s) => a + n(s["actual_qty"]), 0));
}
export function rateAt(item: string, wh: string, date = "9999-12-31"): number {
  const xs = adapter.list("Stock Ledger Entry").filter((s) => !n(s["is_cancelled"]) && s["item_code"] === item && s["warehouse"] === wh && String(s["posting_date"]) <= date)
    .sort((a, b) => `${a["posting_date"]}${a["posting_time"] ?? ""}${a["creation"]}`.localeCompare(`${b["posting_date"]}${b["posting_time"] ?? ""}${b["creation"]}`));
  const last = xs[xs.length - 1]; return n(last?.["valuation_rate"]) || n(adapter.get("Item", item)?.["valuation_rate"]);
}

const isStock = (item: string) => Number(adapter.get("Item", item)?.["is_stock_item"] ?? 1) !== 0;

export function stockEntryErrors(d: Doc): string[] {
  const e: string[] = []; const p = String(d["purpose"] ?? d["stock_entry_type"] ?? "");
  for (const r of rows(d)) {
    const s = String(r["s_warehouse"] || d["from_warehouse"] || ""), t = String(r["t_warehouse"] || d["to_warehouse"] || ""); const i = r["idx"] ?? 1;
    if (["Material Issue", "Material Transfer", "Material Transfer for Manufacture", "Send to Subcontractor"].includes(p) && !s) e.push(`Row #${i}: Source warehouse is mandatory for item ${r["item_code"]}`);
    if (["Material Receipt", "Material Transfer", "Material Transfer for Manufacture", "Send to Subcontractor"].includes(p) && !t) e.push(`Row #${i}: Target warehouse is mandatory for item ${r["item_code"]}`);
    if (p === "Material Receipt" && s) e.push(`Row #${i}: Source warehouse must not be set for Material Receipt`);
    if (p === "Material Issue" && t) e.push(`Row #${i}: Target warehouse must not be set for Material Issue`);
    if (s && t && s === t && p !== "Manufacture") e.push(`Row #${i}: Source and target warehouse cannot be same for row ${i}`);
  }
  return e;
}

/** NegativeStockError: an outgoing movement may not take a warehouse below zero (unless allowed). */
export function negativeStockErrors(dt: string, d: Doc, lines: { item_code: string; warehouse: string; actual_qty: number }[]): string[] {
  const ss = adapter.get("Stock Settings", "Stock Settings"); const e: string[] = [];
  const date = String(d["posting_date"] ?? new Date().toISOString().slice(0, 10)); const need = new Map<string, number>();
  for (const l of lines) if (l.actual_qty < 0 && isStock(l.item_code)) need.set(`${l.item_code}\u0000${l.warehouse}`, (need.get(`${l.item_code}\u0000${l.warehouse}`) ?? 0) - l.actual_qty);
  // stock_ledger.py validate_reserved_stock: stock reserved for other Sales Orders cannot be consumed (even when negative stock is allowed)
  const ownSo = new Set(rows(d).map((r) => String(r["against_sales_order"] ?? r["sales_order"] ?? "")).filter(Boolean));
  for (const [k, q] of need) {
    const [item, wh] = k.split("\u0000") as [string, string]; const have = qtyAt(item, wh, date, d.name);
    const negOk = n(ss?.["allow_negative_stock"]) || n(adapter.get("Item", item)?.["allow_negative_stock"]);
    if (!negOk && q > have + 0.0001) { e.push(`${r2(q - have)} units of Item ${item} needed in Warehouse ${wh} on ${date} to complete this transaction.`); continue; }
    const res = reservedQty(item, wh, ownSo); const free = Math.max(Math.min(have, qtyAt(item, wh, "9999-12-31", d.name)) - res, 0);
    if (res > 0.0001 && q > free + 0.0001) e.push(`Stock Reservation: ${r2(res)} units of Item ${item} are reserved in Warehouse ${wh} for other Sales Orders; only ${r2(free)} available.`);
  }
  void dt; return e;
}

/** Open reserved quantity (reserved − delivered) of submitted Stock Reservation Entries, excluding given Sales Orders. */
export function reservedQty(item: string, wh: string, excludeSo: Set<string> = new Set()): number {
  return r2(adapter.list("Stock Reservation Entry").filter((s) => n(s["docstatus"]) === 1 && s["item_code"] === item && s["warehouse"] === wh && !excludeSo.has(String(s["voucher_no"]))).reduce((a, s) => a + Math.max(n(s["reserved_qty"]) - n(s["delivered_qty"]), 0), 0));
}

const sreStatus = (s: Doc) => n(s["delivered_qty"]) >= n(s["reserved_qty"]) - 0.0001 ? "Delivered" : n(s["delivered_qty"]) > 0 ? "Partially Delivered" : n(s["reserved_qty"]) < n(s["voucher_qty"]) - 0.0001 ? "Partially Reserved" : "Reserved";

/** sales_order.py create_stock_reservation_entries: reserve pending qty of each row up to free stock (Stock Settings enable_stock_reservation). */
export function reserveStock(so: string): string[] {
  if (!n(adapter.get("Stock Settings", "Stock Settings")?.["enable_stock_reservation"])) throw new Error("Please enable Allow Stock Reservation in Stock Settings");
  const d = adapter.get("Sales Order", so); if (!d || n(d["docstatus"]) !== 1) throw new Error(`Sales Order ${so} must be submitted`);
  if (["Closed", "On Hold", "Completed"].includes(String(d["status"]))) throw new Error(`Cannot reserve stock for a ${d["status"]} Sales Order`);
  const made: string[] = [];
  for (const r of rows(d)) {
    const item = String(r["item_code"] ?? ""), wh = String(r["warehouse"] || d["set_warehouse"] || ""); if (!item || !wh || !isStock(item)) continue;
    const delivered = adapter.list("Delivery Note").filter((x) => n(x["docstatus"]) === 1).flatMap((x) => rows(x)).filter((x) => x["against_sales_order"] === so && x["item_code"] === item).reduce((a, x) => a + n(x["qty"]), 0);
    const mine = adapter.list("Stock Reservation Entry").filter((s) => n(s["docstatus"]) === 1 && s["voucher_no"] === so && s["item_code"] === item).reduce((a, s) => a + n(s["reserved_qty"]) - n(s["delivered_qty"]), 0);
    const pending = n(r["qty"]) - delivered - mine; if (pending <= 0.0001) continue;
    const free = qtyAt(item, wh) - reservedQty(item, wh); const q = r2(Math.min(pending, free)); if (q <= 0.0001) continue;
    const sb = hasSerial(item) || hasBatch(item) ? pickForReservation(item, wh, q) : [];
    const rq = sb.length ? r2(sb.reduce((a, e) => a + e.qty, 0)) : q; if (rq <= 0.0001) continue;
    const s = adapter.insertDoc("Stock Reservation Entry", { company: d["company"], voucher_type: "Sales Order", voucher_no: so, voucher_detail_no: r["name"], item_code: item, warehouse: wh, voucher_qty: r2(pending + mine), reserved_qty: rq, delivered_qty: 0, available_qty: qtyAt(item, wh), stock_uom: r["stock_uom"] ?? r["uom"], reservation_based_on: sb.length ? "Serial and Batch" : "Qty", ...(sb.length ? { sb_entries: sb } : {}), docstatus: 1 });
    adapter.update("Stock Reservation Entry", s.name, { status: sreStatus(adapter.get("Stock Reservation Entry", s.name)!) }); made.push(s.name);
  }
  if (!made.length) throw new Error("No stock available to reserve");
  return made;
}
/** sales_order.py cancel_stock_reservation_entries: cancel open (not fully delivered) reservations. */
export function unreserveStock(so: string): number {
  const xs = adapter.list("Stock Reservation Entry").filter((s) => n(s["docstatus"]) === 1 && s["voucher_no"] === so && s["status"] !== "Delivered");
  if (!xs.length) throw new Error(`No reserved stock for Sales Order ${so}`);
  for (const s of xs) adapter.update("Stock Reservation Entry", s.name, { docstatus: 2, status: "Cancelled" });
  return xs.length;
}
/** Delivery Note submit (+1) / cancel (−1): consume reservations of the linked Sales Order (update_stock_reservation_entries). */
export function consumeReservation(dn: Doc, sign: 1 | -1): void {
  for (const r of rows(dn)) {
    const so = r["against_sales_order"]; if (!so) continue; let left = n(r["qty"]);
    const xs = adapter.list("Stock Reservation Entry").filter((s) => n(s["docstatus"]) === 1 && s["voucher_no"] === so && s["item_code"] === r["item_code"] && s["warehouse"] === (r["warehouse"] || dn["set_warehouse"]));
    for (const s of sign === 1 ? xs : [...xs].reverse()) {
      if (left <= 0.0001) break;
      const room = sign === 1 ? n(s["reserved_qty"]) - n(s["delivered_qty"]) : n(s["delivered_qty"]); const q = Math.min(room, left); if (q <= 0) continue;
      const nd = r2(n(s["delivered_qty"]) + sign * q); left -= q;
      const sers = String(r["serial_no"] ?? "").split(/[\n,]+/).map((x) => x.trim()).filter(Boolean);
      const sb = Array.isArray(s["sb_entries"]) ? (s["sb_entries"] as { serial_no?: string; batch_no?: string; qty: number; delivered_qty?: number }[]).map((e) => ({ ...e })) : undefined;
      if (sb) { let bl = q; for (const e of sign === 1 ? sb : [...sb].reverse()) { if (e.serial_no) { if (sers.includes(e.serial_no) || (!sers.length && bl > 0)) { const was = n(e.delivered_qty); e.delivered_qty = sign === 1 ? 1 : 0; bl -= Math.abs(n(e.delivered_qty) - was); } } else if (!r["batch_no"] || e.batch_no === r["batch_no"]) { const room2 = sign === 1 ? n(e.qty) - n(e.delivered_qty) : n(e.delivered_qty); const t2 = Math.min(room2, bl); e.delivered_qty = r2(n(e.delivered_qty) + sign * t2); bl -= t2; } } }
      adapter.update("Stock Reservation Entry", s.name, { delivered_qty: nd, status: sreStatus({ ...s, delivered_qty: nd }), ...(sb ? { sb_entries: sb } : {}) });
    }
  }
}

/** Stock Reconciliation rows → absolute targets; rows with no qty/rate change are refused as a whole when none change. */
export function recoLines(d: Doc) {
  const date = String(d["posting_date"] ?? "9999-12-31"); const out: { item_code: string; warehouse: string; reco_qty: number; reco_rate: number; actual_qty: number; incoming_rate: number }[] = [];
  for (const r of rows(d)) {
    const item = String(r["item_code"] ?? ""), wh = String(r["warehouse"] || d["set_warehouse"] || ""); if (!item || !wh) continue;
    const cq = qtyAt(item, wh, date, d.name), cr = rateAt(item, wh, date);
    const q = r["qty"] === "" || r["qty"] === undefined || r["qty"] === null ? cq : n(r["qty"]); const rt = r["valuation_rate"] === "" || r["valuation_rate"] === undefined || r["valuation_rate"] === null ? cr : n(r["valuation_rate"]);
    if (Math.abs(q - cq) < 0.0001 && Math.abs(rt - cr) < 0.005) continue;
    out.push({ item_code: item, warehouse: wh, reco_qty: q, reco_rate: rt, actual_qty: r2(q - cq), incoming_rate: rt });
  }
  return out;
}
export function recoErrors(d: Doc): string[] {
  const e: string[] = [];
  for (const r of rows(d)) { if (n(r["qty"]) < 0) e.push(`Row #${r["idx"] ?? 1}: Negative Quantity is not allowed`); if (n(r["valuation_rate"]) < 0) e.push(`Row #${r["idx"] ?? 1}: Negative Valuation Rate is not allowed`); }
  if (!e.length && !recoLines(d).length) e.push("None of the items have any change in quantity or value.");
  return e;
}

/** Landed Cost Voucher: distribute total charges over receipt items by Qty / Amount / manual, then raise their incoming rate. */
export function lcvDistribution(d: Doc): { receipt_document_type: string; receipt_document: string; item_code: string; row: string; qty: number; amount: number; applicable_charges: number }[] {
  const total = rows(d, "taxes").reduce((s, t) => s + n(t["base_amount"] ?? t["amount"]), 0) + rows(d, "vendor_invoices").reduce((s, t) => s + n(t["amount"]), 0);
  let items = rows(d).map((x) => ({ receipt_document_type: String(x["receipt_document_type"] ?? "Purchase Receipt"), receipt_document: String(x["receipt_document"] ?? x["purchase_receipt"] ?? ""), item_code: String(x["item_code"]), row: String(x["purchase_receipt_item"] ?? ""), qty: n(x["qty"]), amount: n(x["amount"]), applicable_charges: n(x["applicable_charges"]) }));
  if (!items.length) items = rows(d, "purchase_receipts").flatMap((p) => { const pr = adapter.get(String(p["receipt_document_type"] ?? "Purchase Receipt"), String(p["receipt_document"])); return rows(pr ?? ({} as Doc)).filter((x) => isStock(String(x["item_code"]))).map((x) => ({ receipt_document_type: String(p["receipt_document_type"] ?? "Purchase Receipt"), receipt_document: String(p["receipt_document"]), item_code: String(x["item_code"]), row: String(x["name"] ?? ""), qty: n(x["qty"]), amount: n(x["amount"] ?? n(x["qty"]) * n(x["rate"])), applicable_charges: 0 })); });
  const basis = String(d["distribute_charges_based_on"] || "Qty");
  if (basis !== "Distribute Manually") {
    const base = items.reduce((s, x) => s + (basis === "Amount" ? x.amount : x.qty), 0); let left = r2(total);
    items.forEach((x, i) => { const v = i === items.length - 1 ? left : r2(base ? total * (basis === "Amount" ? x.amount : x.qty) / base : 0); x.applicable_charges = v; left = r2(left - v); });
  }
  return items;
}
export function lcvErrors(d: Doc): string[] {
  const e: string[] = []; if (!rows(d, "purchase_receipts").length && !rows(d).length) e.push("Please enter Receipt Document");
  for (const p of rows(d, "purchase_receipts")) { const pr = adapter.get(String(p["receipt_document_type"] ?? "Purchase Receipt"), String(p["receipt_document"])); if (!pr || n(pr["docstatus"]) !== 1) e.push(`Receipt document ${p["receipt_document"]} must be submitted`); }
  const total = rows(d, "taxes").reduce((s, t) => s + n(t["base_amount"] ?? t["amount"]), 0) + rows(d, "vendor_invoices").reduce((s, t) => s + n(t["amount"]), 0);
  if (!total) e.push("Please enter the Landed Cost charges");
  // Unsafe path blocked: with perpetual inventory, a late LCV on stock already consumed would need COGS repost of the outward vouchers, which this preview does not port
  for (const p of rows(d, "purchase_receipts")) {
    const dt = String(p["receipt_document_type"] ?? "Purchase Receipt"), pr = adapter.get(dt, String(p["receipt_document"])); if (!pr) continue;
    const co = adapter.list("Company").find((c) => c.name === pr["company"] || c["company_name"] === pr["company"]); if (!n(co?.["enable_perpetual_inventory"])) continue;
    for (const s of adapter.list("Stock Ledger Entry").filter((s) => s["voucher_no"] === pr.name && !n(s["is_cancelled"]) && n(s["actual_qty"]) > 0)) {
      const later = adapter.list("Stock Ledger Entry").some((o) => !n(o["is_cancelled"]) && o["item_code"] === s["item_code"] && o["warehouse"] === s["warehouse"] && n(o["actual_qty"]) < 0 && String(o["posting_date"]) >= String(s["posting_date"]) && o["voucher_no"] !== pr.name);
      if (later) { e.push(`Item ${s["item_code"]} from ${pr.name} has already been consumed; Landed Cost Voucher after consumption needs a COGS repost that is not supported in this preview`); break; }
    }
  }
  const dist = lcvDistribution(d); const sum = r2(dist.reduce((s, x) => s + x.applicable_charges, 0));
  if (Math.abs(sum - r2(total)) > 0.01) e.push(`Total Applicable Charges in Purchase Receipt Items table must be same as Total Taxes and Charges (${sum} ≠ ${r2(total)})`);
  return e;
}
/** update_landed_cost: add (sign=1) or remove (sign=-1) the per-unit charge on each receipt SLE, then repost those item/warehouses. */
export function applyLcv(d: Doc, sign: 1 | -1, repost: (item: string, wh: string) => void) {
  const keys = new Set<string>();
  for (const x of lcvDistribution(d)) {
    if (!x.qty) continue; const per = x.applicable_charges / x.qty;
    const sles = adapter.list("Stock Ledger Entry").filter((s) => s["voucher_no"] === x.receipt_document && s["item_code"] === x.item_code && !n(s["is_cancelled"]) && n(s["actual_qty"]) > 0);
    for (const s of sles) { adapter.update("Stock Ledger Entry", s.name, { incoming_rate: r2(n(s["incoming_rate"]) + sign * per), landed_cost: r2(n(s["landed_cost"]) + sign * per) }); keys.add(`${s["item_code"]}\u0000${s["warehouse"]}`); }
    const pr = adapter.get(x.receipt_document_type, x.receipt_document);
    if (pr) adapter.update(x.receipt_document_type, pr.name, { items: rows(pr).map((r) => (r["item_code"] === x.item_code ? { ...r, landed_cost_voucher_amount: r2(n(r["landed_cost_voucher_amount"]) + sign * x.applicable_charges) } : r)) });
  }
  keys.forEach((k) => { const [i, w] = k.split("\u0000"); repost(i!, w!); });
  adapter.update("Landed Cost Voucher", d.name, { items: lcvDistribution(d).map((x, i) => ({ idx: i + 1, ...x, purchase_receipt_item: x.row })) });
}
