/**
 * PRO-01 Procurement plan and MAT-01 / PRO-EXT-08 project material position — read models over native documents only.
 *  - plan: one line per Material Request item of the project, followed through its own references
 *    (RFQ / Supplier Quotation material_request_item, PO material_request_item, Purchase Receipt purchase_order_item,
 *    Purchase Invoice po_detail) to a supply stage, quantities and dated exceptions;
 *  - position: per item + warehouse, the separate measures ordered / received / returned / issued / on hand, consumption
 *    valuation (stock ledger) and invoiced material cost (purchase invoices) — never summed into one "actual".
 * No document is created here; creating a Material Request or RFQ stays on the native forms (Create menu).
 */
import { num, r2, sumBy } from "./calc";
import { get, isSubmitted, list, materialBalance, materialMovements, rows, today, type MaterialMovement } from "./data";
import type { Doc } from "@/lib/adapter";
import { orderBy } from "./supply";

type Row = Record<string, unknown>;
export type SupplyStage = "Draft request" | "Requested" | "Quotation requested" | "Quoted" | "Ordered" | "Partly received" | "Received" | "Invoiced" | "Stopped";
export const SUPPLY_STAGES: SupplyStage[] = ["Draft request", "Requested", "Quotation requested", "Quoted", "Ordered", "Partly received", "Received", "Invoiced", "Stopped"];
export type PlanFlag = "NOT_ORDERED_BY_DATE" | "DELIVERY_LATE" | "RECEIVED_NOT_INVOICED" | "OVER_ORDERED" | "QUOTE_OVERDUE";
export interface Ref { doctype: string; name: string; row: number; party?: string; qty?: number; rate?: number; date?: string }
export interface PlanLine {
  key: string; mr: string; mr_row: number; mr_status: string; item_code: string; item_name: string; uom: string; warehouse: string; cost_code: string;
  qty: number; required_by: string; order_by: string; ordered: number; received: number; invoiced: number; pending_order: number; pending_receipt: number;
  rfqs: Ref[]; quotes: Ref[]; orders: Ref[]; receipts: Ref[]; invoices: Ref[]; stage: SupplyStage; flags: PlanFlag[]; next_delivery: string;
}
const live = (d: Doc) => num(d.docstatus) !== 2;
const qtyOf = (r: Row) => num(r["stock_qty"] ?? r["qty"]);
const idx = (r: Row, i: number) => num(r["idx"]) || i + 1;

/** Every Material Request line of the project with its downstream supply chain (scoped to what the user may read). */
export function procurementPlan(project: string, on = today()): PlanLine[] {
  const rfqs = list("Request for Quotation", live), sqs = list("Supplier Quotation", live);
  const pos = list("Purchase Order", (d) => isSubmitted(d) && d["status"] !== "Cancelled");
  const prs = list("Purchase Receipt", isSubmitted), pis = list("Purchase Invoice", isSubmitted);
  const out: PlanLine[] = [];
  for (const mr of list("Material Request", live)) rows(mr, "items").forEach((it, i) => {
    if (it["project"] !== project || !it["item_code"]) return;
    const rowName = String(it["name"] ?? ""), item = String(it["item_code"]);
    // a downstream row belongs to this MR line by its material_request_item, else by (material_request, item) when the row key is absent
    const fromMr = (r: Row) => (rowName && r["material_request_item"] ? r["material_request_item"] === rowName : r["material_request"] === mr.name && r["item_code"] === item);
    const rfqRefs: Ref[] = []; for (const q of rfqs) rows(q, "items").forEach((r, j) => { if (fromMr(r)) rfqRefs.push({ doctype: "Request for Quotation", name: q.name, row: idx(r, j), date: String(q["schedule_date"] ?? ""), qty: qtyOf(r) }); });
    const quoteRefs: Ref[] = []; for (const s of sqs) rows(s, "items").forEach((r, j) => { if (fromMr(r)) quoteRefs.push({ doctype: "Supplier Quotation", name: s.name, row: idx(r, j), party: String(s["supplier"] ?? ""), qty: qtyOf(r), rate: num(r["rate"]), date: String(s["transaction_date"] ?? "") }); });
    const poRows: { po: Doc; r: Row; j: number }[] = []; for (const po of pos) rows(po, "items").forEach((r, j) => { if (fromMr(r)) poRows.push({ po, r, j }); });
    const poNames = new Set(poRows.map((x) => String(x.r["name"] ?? "")).filter(Boolean));
    const orders: Ref[] = poRows.map(({ po, r, j }) => ({ doctype: "Purchase Order", name: po.name, row: idx(r, j), party: String(po["supplier"] ?? ""), qty: qtyOf(r), rate: num(r["rate"]), date: String(r["schedule_date"] ?? po["schedule_date"] ?? "") }));
    const receipts: Ref[] = []; for (const pr of prs) rows(pr, "items").forEach((r, j) => { if (poNames.has(String(r["purchase_order_item"] ?? ""))) receipts.push({ doctype: "Purchase Receipt", name: pr.name, row: idx(r, j), qty: qtyOf(r) * (num(pr["is_return"]) && qtyOf(r) > 0 ? -1 : 1), date: String(pr["posting_date"] ?? "") }); });
    const invoices: Ref[] = []; for (const pi of pis) rows(pi, "items").forEach((r, j) => { if (poNames.has(String(r["po_detail"] ?? ""))) invoices.push({ doctype: "Purchase Invoice", name: pi.name, row: idx(r, j), qty: qtyOf(r) * (num(pi["is_return"]) && qtyOf(r) > 0 ? -1 : 1), date: String(pi["posting_date"] ?? "") }); });
    const qty = qtyOf(it), ordered = r2(sumBy(orders, (o) => o.qty ?? 0)), received = r2(sumBy(receipts, (o) => o.qty ?? 0)), invoiced = r2(sumBy(invoices, (o) => o.qty ?? 0));
    const required_by = String(it["schedule_date"] ?? mr["schedule_date"] ?? "");
    // F07-01-1: order by = date needed − the item's lead time; a line not ordered by then is flagged
    const order_by = String(it["digit_order_by"] ?? "") || orderBy(required_by, item, it["digit_lead_days"]);
    const stopped = ["Stopped", "Cancelled"].includes(String(mr["status"]));
    const stage: SupplyStage = num(mr.docstatus) === 0 ? "Draft request" : stopped ? "Stopped"
      : ordered > 0 && received >= ordered - 0.0001 && invoiced >= received - 0.0001 && received > 0 ? "Invoiced"
      : received > 0 && received >= Math.min(qty, ordered) - 0.0001 && ordered >= qty - 0.0001 ? "Received"
      : received > 0 ? "Partly received" : ordered > 0 ? "Ordered" : quoteRefs.length ? "Quoted" : rfqRefs.length ? "Quotation requested" : "Requested";
    const pending_order = r2(Math.max(0, qty - ordered)), pending_receipt = r2(Math.max(0, ordered - received));
    const openDates = orders.filter((o) => o.date).map((o) => o.date!).sort();
    const next_delivery = pending_receipt > 0 ? openDates.find((d) => d >= on) ?? openDates[openDates.length - 1] ?? "" : "";
    const flags: PlanFlag[] = [];
    const active = num(mr.docstatus) === 1 && !stopped;
    if (active && pending_order > 0 && order_by && order_by < on) flags.push("NOT_ORDERED_BY_DATE");
    if (active && pending_receipt > 0 && openDates.length && openDates.every((d) => d < on)) flags.push("DELIVERY_LATE");
    if (received - invoiced > 0.0001) flags.push("RECEIVED_NOT_INVOICED");
    if (ordered - qty > 0.0001) flags.push("OVER_ORDERED");
    if (active && rfqRefs.length && !quoteRefs.length && !ordered && rfqRefs.every((q) => q.date && q.date < on)) flags.push("QUOTE_OVERDUE");
    out.push({ key: `${mr.name}|${idx(it, i)}`, mr: mr.name, mr_row: idx(it, i), mr_status: String(mr["status"] ?? (num(mr.docstatus) === 0 ? "Draft" : "")), item_code: item, item_name: String(it["item_name"] ?? get("Item", item)?.["item_name"] ?? item),
      uom: String(it["stock_uom"] ?? it["uom"] ?? ""), warehouse: String(it["warehouse"] ?? mr["set_warehouse"] ?? ""), cost_code: String(it["digit_cost_code"] ?? ""), qty, required_by, order_by, ordered, received, invoiced, pending_order, pending_receipt,
      rfqs: rfqRefs, quotes: quoteRefs, orders, receipts, invoices, stage, flags, next_delivery });
  });
  return out.sort((a, b) => (a.required_by || "9999").localeCompare(b.required_by || "9999") || a.key.localeCompare(b.key));
}
/** Project purchase-order lines raised without a Material Request (direct orders) — listed beside the plan so no ordered quantity is hidden. */
export function ordersWithoutRequest(project: string): (Ref & { item_code: string; received: number })[] {
  const out: (Ref & { item_code: string; received: number })[] = [];
  for (const po of list("Purchase Order", (d) => isSubmitted(d) && d["status"] !== "Cancelled")) rows(po, "items").forEach((r, j) => {
    if ((r["project"] ?? po["project"]) !== project || r["material_request"] || r["material_request_item"]) return;
    out.push({ doctype: "Purchase Order", name: po.name, row: idx(r, j), party: String(po["supplier"] ?? ""), qty: qtyOf(r), rate: num(r["rate"]), date: String(r["schedule_date"] ?? po["schedule_date"] ?? ""), item_code: String(r["item_code"] ?? ""), received: num(r["received_qty"]) });
  });
  return out;
}
export const stageCounts = (lines: PlanLine[]) => Object.fromEntries(SUPPLY_STAGES.map((s) => [s, lines.filter((l) => l.stage === s).length])) as Record<SupplyStage, number>;

// ---------------------------------------------------------------- MAT-01 / PRO-EXT-08 position
export type PositionFlag = "NEGATIVE_BALANCE" | "UOM_MISMATCH" | "UNMATCHED_INVOICE" | "RECEIVED_NOT_INVOICED";
export type PositionMeasure = "ordered" | "received" | "issued" | "invoiced";
export const POSITION_MEASURES: PositionMeasure[] = ["ordered", "received", "issued", "invoiced"];
export interface PositionRow { key: string; item_code: string; item_name: string; uom: string; warehouse: string; received: number; returned: number; issued: number; transfers: number; other: number; on_hand: number; issued_value: number }
export interface PositionException { code: PositionFlag; item_code: string; doctype: string; name: string; table: string; row: number; detail: string; qty: number }
/** One source row behind a value strip: the strip equals the sum of `value` over its rows. */
export interface StripSource { doctype: string; name: string; table: string; row: number; item_code: string; date: string; qty: number; value: number }
export interface MaterialPosition {
  project: string; as_of: string; rows: PositionRow[]; items: ReturnType<typeof materialBalance>; exceptions: PositionException[]; movements: MaterialMovement[];
  strips: { ordered_value: number; received_value: number; issued_value: number; invoiced_cost: number; on_hand_lines: number };
  sources: Record<PositionMeasure, StripSource[]>;
}
const lineValue = (r: Row) => num(r["base_net_amount"] ?? r["net_amount"] ?? r["amount"]);
/**
 * Item + warehouse position from the stock ledger rows of the project's vouchers, plus four separate value strips, each
 * the exact sum of its `sources` rows: ordered (submitted PO stock lines), received (submitted PR stock lines, returns
 * negative), issued (stock-ledger valuation of issues to work) and invoiced (submitted PI stock lines).
 */
export function materialPosition(project: string, asOf?: string): MaterialPosition {
  const movements = materialMovements(project, asOf);
  const m = new Map<string, PositionRow>();
  const sources: Record<PositionMeasure, StripSource[]> = { ordered: [], received: [], issued: [], invoiced: [] };
  for (const x of movements) {
    const key = `${x.item_code}|${x.warehouse}`;
    const it = get("Item", x.item_code);
    const p = m.get(key) ?? { key, item_code: x.item_code, item_name: String(it?.["item_name"] ?? x.item_code), uom: String(it?.["stock_uom"] ?? ""), warehouse: x.warehouse, received: 0, returned: 0, issued: 0, transfers: 0, other: 0, on_hand: 0, issued_value: 0 };
    if (x.move === "Receipt") p.received = r2(p.received + x.qty);
    else if (x.move === "Return to Supplier") p.returned = r2(p.returned - x.qty);
    else if (x.move === "Issue to Work") { p.issued = r2(p.issued - x.qty); p.issued_value = r2(p.issued_value - x.value); sources.issued.push({ doctype: x.voucher_type, name: x.voucher_no, table: x.table, row: x.row, item_code: x.item_code, date: x.posting_date, qty: r2(-x.qty), value: r2(-x.value) }); }
    else if (x.move === "Transfer In" || x.move === "Transfer Out") p.transfers = r2(p.transfers + x.qty);
    else p.other = r2(p.other + x.qty);
    p.on_hand = r2(p.on_hand + x.qty); m.set(key, p);
  }
  const dated = (d: Doc, f: string) => !asOf || String(d[f] ?? "") <= asOf;
  const projRow = (d: Doc, r: Row) => (r["project"] ?? d["project"]) === project;
  const exceptions: PositionException[] = [];
  const stockItem = (code: unknown) => num(get("Item", String(code ?? ""))?.["is_stock_item"]) === 1;
  const src = (dt: string, d: Doc, r: Row, j: number, date: string, sign = 1): StripSource => ({ doctype: dt, name: d.name, table: "items", row: idx(r, j), item_code: String(r["item_code"] ?? ""), date, qty: r2(qtyOf(r) * sign), value: r2(lineValue(r) * sign) });
  for (const po of list("Purchase Order", (d) => isSubmitted(d) && d["status"] !== "Cancelled" && dated(d, "transaction_date"))) rows(po, "items").forEach((r, j) => {
    if (!projRow(po, r) || !stockItem(r["item_code"])) return;
    sources.ordered.push(src("Purchase Order", po, r, j, String(po["transaction_date"] ?? "")));
    const it = get("Item", String(r["item_code"]));
    if (r["uom"] && it?.["stock_uom"] && r["uom"] !== it["stock_uom"] && num(r["conversion_factor"] || 1) === 1) exceptions.push({ code: "UOM_MISMATCH", item_code: String(r["item_code"]), doctype: "Purchase Order", name: po.name, table: "items", row: idx(r, j), detail: `${String(r["uom"])} ≠ ${String(it["stock_uom"])}`, qty: num(r["qty"]) });
  });
  for (const pr of list("Purchase Receipt", (d) => isSubmitted(d) && dated(d, "posting_date"))) rows(pr, "items").forEach((r, j) => {
    if (!projRow(pr, r) || !stockItem(r["item_code"])) return;
    // a return row stored with a positive amount still reduces what was received
    sources.received.push(src("Purchase Receipt", pr, r, j, String(pr["posting_date"] ?? ""), num(pr["is_return"]) && lineValue(r) > 0 ? -1 : 1));
  });
  for (const pi of list("Purchase Invoice", (d) => isSubmitted(d) && dated(d, "posting_date"))) rows(pi, "items").forEach((r, j) => {
    if (!projRow(pi, r) || !stockItem(r["item_code"])) return;
    sources.invoiced.push(src("Purchase Invoice", pi, r, j, String(pi["posting_date"] ?? ""), num(pi["is_return"]) && lineValue(r) > 0 ? -1 : 1));
    // a stock item invoiced without a receipt or order line: the quantity never came through the site store
    if (!r["po_detail"] && !r["purchase_receipt"] && !num(pi["update_stock"])) exceptions.push({ code: "UNMATCHED_INVOICE", item_code: String(r["item_code"]), doctype: "Purchase Invoice", name: pi.name, table: "items", row: idx(r, j), detail: String(r["item_name"] ?? ""), qty: num(r["qty"]) });
  });
  const posRows = [...m.values()].sort((a, b) => a.item_code.localeCompare(b.item_code) || a.warehouse.localeCompare(b.warehouse));
  for (const p of posRows) if (p.on_hand < -0.0001) exceptions.push({ code: "NEGATIVE_BALANCE", item_code: p.item_code, doctype: "", name: "", table: "", row: 0, detail: p.warehouse, qty: p.on_hand });
  for (const l of procurementPlan(project, asOf)) if (l.flags.includes("RECEIVED_NOT_INVOICED")) {
    const last = l.receipts[l.receipts.length - 1];
    if (last) exceptions.push({ code: "RECEIVED_NOT_INVOICED", item_code: l.item_code, doctype: last.doctype, name: last.name, table: "items", row: last.row, detail: l.mr, qty: r2(l.received - l.invoiced) });
  }
  const total = (k: PositionMeasure) => r2(sumBy(sources[k], (x) => x.value));
  return { project, as_of: asOf ?? "", rows: posRows, items: materialBalance(project, asOf), exceptions, movements, sources,
    strips: { ordered_value: total("ordered"), received_value: total("received"), issued_value: total("issued"), invoiced_cost: total("invoiced"), on_hand_lines: posRows.filter((p) => Math.abs(p.on_hand) > 0.0001).length } };
}

// ---------------------------------------------------------------- phase 4 C4-08 row actions on the position
export interface ItemPositionRow extends PositionRow { warehouses: PositionRow[] }
/** One row per item: the sum of its item + warehouse rows; the expanded ▸ rows are those original per-warehouse rows. */
export function positionByItem(rows: PositionRow[]): ItemPositionRow[] {
  const m = new Map<string, ItemPositionRow>();
  for (const r of rows) {
    const p = m.get(r.item_code) ?? { ...r, key: r.item_code, warehouse: "", received: 0, returned: 0, issued: 0, transfers: 0, other: 0, on_hand: 0, issued_value: 0, warehouses: [] };
    p.received = r2(p.received + r.received); p.returned = r2(p.returned + r.returned); p.issued = r2(p.issued + r.issued); p.transfers = r2(p.transfers + r.transfers);
    p.other = r2(p.other + r.other); p.on_hand = r2(p.on_hand + r.on_hand); p.issued_value = r2(p.issued_value + r.issued_value); p.warehouses.push(r); m.set(r.item_code, p);
  }
  return [...m.values()];
}
export interface ItemLocation { warehouse: string; qty: number; last: string; project: boolean }
/** Where the item is held: each warehouse's stock-ledger balance (every project the user may read), this project's warehouses marked. */
export function itemLocations(item_code: string, projectWarehouses: Set<string>, asOf?: string): ItemLocation[] {
  const m = new Map<string, ItemLocation>();
  for (const e of list("Stock Ledger Entry", (d) => d["item_code"] === item_code && !num(d["is_cancelled"]) && (!asOf || String(d["posting_date"] ?? "") <= asOf))) {
    const w = String(e["warehouse"] ?? ""); if (!w) continue;
    const x = m.get(w) ?? { warehouse: w, qty: 0, last: "", project: projectWarehouses.has(w) };
    x.qty = r2(x.qty + num(e["actual_qty"])); const d = String(e["posting_date"] ?? ""); if (d > x.last) x.last = d; m.set(w, x);
  }
  return [...m.values()].sort((a, b) => Number(b.project) - Number(a.project) || b.qty - a.qty || a.warehouse.localeCompare(b.warehouse));
}
export interface ItemForecast { requested: number; ordered: number; received: number; issued: number; on_hand: number; pending_order: number; pending_receipt: number; projected_on_hand: number; next_delivery: string; late_lines: number; lines: number; direct: number }
/**
 * What the project still expects for the item: requested (active Material Request lines), ordered (their PO lines +
 * direct orders), what is still to order and to receive, and the projected on hand once open orders arrive
 * (on hand + still to receive). Each figure is a separate measure; nothing is posted.
 */
export function itemForecast(project: string, item_code: string, pos: MaterialPosition, on = today()): ItemForecast {
  const lines = procurementPlan(project, on).filter((l) => l.item_code === item_code && l.stage !== "Stopped" && l.stage !== "Draft request");
  const direct = ordersWithoutRequest(project).filter((o) => o.item_code === item_code);
  const at = pos.rows.filter((r) => r.item_code === item_code);
  const on_hand = r2(sumBy(at, (r) => r.on_hand)), issued = r2(sumBy(at, (r) => r.issued));
  const directPending = r2(sumBy(direct, (o) => Math.max(0, (o.qty ?? 0) - o.received)));
  const pending_receipt = r2(sumBy(lines, (l) => l.pending_receipt) + directPending);
  const dates = lines.map((l) => l.next_delivery).filter(Boolean).sort();
  return { requested: r2(sumBy(lines, (l) => l.qty)), ordered: r2(sumBy(lines, (l) => l.ordered) + sumBy(direct, (o) => o.qty ?? 0)), received: r2(sumBy(at, (r) => r.received - r.returned)), issued, on_hand,
    pending_order: r2(sumBy(lines, (l) => l.pending_order)), pending_receipt, projected_on_hand: r2(on_hand + pending_receipt), next_delivery: dates.find((d) => d >= on) ?? dates[0] ?? "",
    late_lines: lines.filter((l) => l.flags.includes("DELIVERY_LATE") || l.flags.includes("NOT_ORDERED_BY_DATE")).length, lines: lines.length, direct: direct.length };
}
