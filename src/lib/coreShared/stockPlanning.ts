/**
 * DIGIT shared Core stock planning (Part B: CF-09 demand forecast & replenishment, CF-10 wave / batch picking, CF-12
 * cross-dock planning). Read models compute from posted Stock Ledger Entry rows and open orders at render time; actions
 * create native drafts (Material Request, Pick List) through the shared document API, so permissions, naming, defaults and
 * submit rules stay the source's. Forecasts are explainable: monthly outflow, exponential smoothing, safety stock and the
 * reorder point are all shown with the numbers used.
 */
import { adapter, type Doc } from "@/lib/adapter";
import { currentUser } from "@/lib/session";
import { qtyAt } from "@/lib/stock";
import { newVoucher } from "./finance";

export type Bi = [string, string];
const s = (v: unknown) => String(v ?? "");
const n = (v: unknown) => Number(v) || 0;
const r2 = (x: number) => Math.round(x * 100) / 100;
const rows = (d: Doc | undefined, f = "items") => (Array.isArray(d?.[f]) ? (d![f] as Doc[]) : []);
const today = () => new Date().toISOString().slice(0, 10);
const addDays = (d: string, k: number) => new Date(Date.parse(d) + k * 864e5).toISOString().slice(0, 10);
const monthKey = (d: string) => d.slice(0, 7);
const monthsBack = (asOf: string, k: number) => { const [y, m] = asOf.split("-").map(Number) as [number, number]; const out: string[] = []; for (let i = k; i >= 1; i--) { const d = new Date(Date.UTC(y, m - 1 - i, 1)); out.push(d.toISOString().slice(0, 7)); } return out; };
const whCompany = (wh: string) => s(adapter.get("Warehouse", wh)?.["company"]);

/* ------------------------------------------------------------------ CF-09 demand forecast ------------------------------------------------------------------ */
export interface ForecastRow { item: string; itemName: string; warehouse: string; history: { month: string; qty: number }[]; forecast: number; safety: number; leadDays: number; reorderPoint: number;
  onHand: number; onOrder: number; committed: number; projected: number; suggest: number; uom: string; why: Bi }
/** Outflow per month (delivered / issued / consumed stock) of an item in a warehouse. */
export function monthlyOutflow(item: string, wh: string, months: string[]): number[] {
  const m = new Map(months.map((k) => [k, 0]));
  for (const e of adapter.list("Stock Ledger Entry")) {
    if (s(e["item_code"]) !== item || s(e["warehouse"]) !== wh || n(e["is_cancelled"]) || n(e["actual_qty"]) >= 0) continue;
    if (s(e["voucher_type"]) === "Stock Reconciliation") continue; // counts are corrections, not demand
    const k = monthKey(s(e["posting_date"])); if (m.has(k)) m.set(k, m.get(k)! - n(e["actual_qty"]));
  }
  return months.map((k) => r2(m.get(k)!));
}
const openOrdered = (item: string, wh: string) => r2(adapter.list("Purchase Order").filter((p) => n(p.docstatus) === 1 && !["Closed", "Completed", "On Hold"].includes(s(p["status"])))
  .flatMap((p) => rows(p)).filter((r) => s(r["item_code"]) === item && (s(r["warehouse"]) || "") === wh).reduce((a, r) => a + Math.max(0, n(r["stock_qty"] ?? r["qty"]) - n(r["received_qty"])), 0));
const openCommitted = (item: string, wh: string) => r2(adapter.list("Sales Order").filter((p) => n(p.docstatus) === 1 && !["Closed", "Completed", "On Hold"].includes(s(p["status"])))
  .flatMap((p) => rows(p)).filter((r) => s(r["item_code"]) === item && (s(r["warehouse"]) || "") === wh).reduce((a, r) => a + Math.max(0, n(r["stock_qty"] ?? r["qty"]) - n(r["delivered_qty"])), 0));
/**
 * Next-month demand by simple exponential smoothing (alpha 0.4) over the last 12 months; safety stock = 1.65 × σ(monthly) ×
 * √(lead time in months) (95 % service); reorder point = daily demand × lead days + safety; suggestion = what brings the
 * projected quantity (on hand + on order − committed) back above the reorder point plus one month of demand, at least the
 * item's minimum order quantity.
 */
export function forecastFor(item: string, wh: string, asOf = today()): ForecastRow {
  const it = adapter.get("Item", item); const months = monthsBack(asOf, 12); const qty = monthlyOutflow(item, wh, months);
  let level = qty.find((q) => q > 0) ?? 0; for (const q of qty) level = 0.4 * q + 0.6 * level;
  const forecast = r2(level); const mean = qty.reduce((a, b) => a + b, 0) / qty.length; const sd = Math.sqrt(qty.reduce((a, b) => a + (b - mean) ** 2, 0) / qty.length);
  const leadDays = n(it?.["lead_time_days"]) || 14; const safety = r2(1.65 * sd * Math.sqrt(leadDays / 30)); const reorderPoint = r2((forecast / 30) * leadDays + safety);
  const onHand = r2(qtyAt(item, wh, asOf)); const onOrder = openOrdered(item, wh); const committed = openCommitted(item, wh); const projected = r2(onHand + onOrder - committed);
  const gap = reorderPoint + forecast - projected; const moq = n(it?.["min_order_qty"]);
  const suggest = projected < reorderPoint && gap > 0 ? Math.ceil(Math.max(gap, moq)) : 0;
  return { item, itemName: s(it?.["item_name"]) || item, warehouse: wh, history: months.map((m, i) => ({ month: m, qty: qty[i]! })), forecast, safety, leadDays, reorderPoint, onHand, onOrder, committed, projected, suggest, uom: s(it?.["stock_uom"]) || "Nos",
    why: [`Demand ≈ ${forecast}/month (smoothed 12 months), lead time ${leadDays} days, safety ${safety} → reorder point ${reorderPoint}; projected ${projected} (on hand ${onHand} + on order ${onOrder} − committed ${committed}).`,
      `الطلب ≈ ${forecast} شهريًا (تمهيد 12 شهرًا)، مهلة التوريد ${leadDays} يومًا، مخزون أمان ${safety} ← نقطة إعادة الطلب ${reorderPoint}؛ المتوقع ${projected} (المتوفر ${onHand} + تحت الطلب ${onOrder} − المحجوز ${committed}).`] };
}
/** Every stock item × warehouse of the company with outflow in the last 12 months or a reorder level. */
export function forecastRows(company: string, asOf = today()): ForecastRow[] {
  const since = `${monthsBack(asOf, 12)[0]}-01`; const pairs = new Set<string>();
  for (const e of adapter.list("Stock Ledger Entry")) if (!n(e["is_cancelled"]) && n(e["actual_qty"]) < 0 && s(e["posting_date"]) >= since && whCompany(s(e["warehouse"])) === company) pairs.add(`${s(e["item_code"])}\u0000${s(e["warehouse"])}`);
  for (const it of adapter.list("Item")) for (const rl of rows(it, "reorder_levels")) if (whCompany(s(rl["warehouse"])) === company) pairs.add(`${it.name}\u0000${s(rl["warehouse"])}`);
  return [...pairs].map((p) => { const [i, w] = p.split("\u0000") as [string, string]; return forecastFor(i, w, asOf); }).filter((r) => n(adapter.get("Item", r.item)?.["is_stock_item"]))
    .sort((a, b) => b.suggest - a.suggest || b.forecast - a.forecast || a.item.localeCompare(b.item));
}
/** One draft Material Request (Purchase) for the chosen suggestions, required by the end of the lead time. */
export function requestFromForecast(company: string, picks: { item: string; warehouse: string; qty: number }[], user = currentUser()): { ok: true; name: string } | { ok: false; reason: Bi } {
  const ok = picks.filter((p) => p.qty > 0 && adapter.get("Item", p.item) && whCompany(p.warehouse) === company); if (!ok.length) return { ok: false, reason: ["Choose at least one suggestion.", "اختر اقتراحًا واحدًا على الأقل."] };
  const items = ok.map((p, i) => { const it = adapter.get("Item", p.item)!; return { idx: i + 1, item_code: p.item, item_name: it["item_name"] ?? p.item, description: it["description"] ?? it["item_name"] ?? p.item, qty: p.qty, stock_qty: p.qty, uom: it["stock_uom"] ?? "Nos", stock_uom: it["stock_uom"] ?? "Nos", conversion_factor: 1, warehouse: p.warehouse, schedule_date: addDays(today(), n(it["lead_time_days"]) || 14) }; });
  const r = newVoucher("Material Request", { company, material_request_type: "Purchase", transaction_date: today(), schedule_date: items[0]!.schedule_date, items }, { user });
  return r.errors.length || !r.name ? { ok: false, reason: [r.errors.join("; "), r.errors.join("؛ ")] } : { ok: true, name: r.name };
}

/* ------------------------------------------------------------------ CF-10 wave / batch picking ------------------------------------------------------------------ */
export interface PickLine { order: string; orderItem: string; customer: string; item: string; itemName: string; warehouse: string; qty: number; due: string; available: number }
export interface Wave { key: string; warehouse: string; due: string; lines: PickLine[]; items: { item: string; qty: number }[]; orders: number }
/** Child-row identity: the row name, or parent + idx where stored rows carry no name (preview demo rows). */
const rid = (parent: Doc, r: Doc) => s(r.name) || `${parent.name}:${s(r["idx"])}`;
const pickedAlready = () => { const m = new Map<string, number>(); for (const p of adapter.list("Pick List")) if (n(p.docstatus) !== 2) for (const l of rows(p, "locations")) if (s(l["sales_order_item"])) m.set(s(l["sales_order_item"]), (m.get(s(l["sales_order_item"])) ?? 0) + n(l["stock_qty"] ?? l["qty"])); return m; };
/** Undelivered sales order lines due within the horizon and not yet on a pick list, grouped into waves by warehouse and due date. */
export function waves(company: string, horizonDays = 7, asOf = today()): Wave[] {
  const until = addDays(asOf, horizonDays); const picked = pickedAlready(); const out = new Map<string, Wave>();
  for (const so of adapter.list("Sales Order").filter((x) => n(x.docstatus) === 1 && s(x["company"]) === company && !["Closed", "Completed", "On Hold"].includes(s(x["status"])))) for (const r of rows(so)) {
    const open = n(r["stock_qty"] ?? r["qty"]) - n(r["delivered_qty"]) - (picked.get(rid(so, r)) ?? 0); if (open <= 0) continue;
    const due = s(r["delivery_date"]) || s(so["delivery_date"]) || asOf; if (due > until) continue;
    const wh = s(r["warehouse"]) || s(so["set_warehouse"]); if (!wh || !n(adapter.get("Item", s(r["item_code"]))?.["is_stock_item"])) continue;
    const day = due < asOf ? asOf : due; const key = `${wh}\u0000${day}`;
    const w = out.get(key) ?? { key, warehouse: wh, due: day, lines: [], items: [], orders: 0 };
    w.lines.push({ order: so.name, orderItem: rid(so, r), customer: s(so["customer"]), item: s(r["item_code"]), itemName: s(r["item_name"]) || s(r["item_code"]), warehouse: wh, qty: r2(open), due, available: qtyAt(s(r["item_code"]), wh, asOf) });
    out.set(key, w);
  }
  return [...out.values()].map((w) => { const t = new Map<string, number>(); for (const l of w.lines) t.set(l.item, r2((t.get(l.item) ?? 0) + l.qty)); return { ...w, items: [...t].map(([item, qty]) => ({ item, qty })).sort((a, b) => a.item.localeCompare(b.item)), orders: new Set(w.lines.map((l) => l.order)).size }; })
    .sort((a, b) => a.due.localeCompare(b.due) || b.lines.length - a.lines.length);
}
/** One batch Pick List for the wave's lines (group same items so each item is picked once for all orders). */
export function pickWave(company: string, lines: PickLine[], user = currentUser()): { ok: true; name: string } | { ok: false; reason: Bi } {
  if (!lines.length) return { ok: false, reason: ["Choose the lines to pick.", "اختر السطور المطلوب انتقاؤها."] };
  const short = lines.filter((l) => l.available < l.qty); if (short.length === lines.length) return { ok: false, reason: ["None of these lines has stock to pick yet.", "لا يوجد مخزون لأي من هذه السطور بعد."] };
  const locations = lines.filter((l) => l.available > 0).sort((a, b) => a.item.localeCompare(b.item) || a.order.localeCompare(b.order)).map((l, i) => { const it = adapter.get("Item", l.item)!; const q = Math.min(l.qty, l.available);
    return { idx: i + 1, item_code: l.item, item_name: l.itemName, warehouse: l.warehouse, qty: q, stock_qty: q, picked_qty: 0, uom: it["stock_uom"] ?? "Nos", stock_uom: it["stock_uom"] ?? "Nos", conversion_factor: 1, sales_order: l.order, sales_order_item: l.orderItem }; });
  const r = newVoucher("Pick List", { company, purpose: "Delivery", parent_warehouse: "", group_same_items: 1, locations }, { user });
  return r.errors.length || !r.name ? { ok: false, reason: [r.errors.join("; "), r.errors.join("؛ ")] } : { ok: true, name: r.name };
}

/* ------------------------------------------------------------------ CF-12 cross-dock ------------------------------------------------------------------ */
export interface CrossDock { po: string; poItem: string; supplier: string; expected: string; item: string; incoming: number; received: number; order: string; orderItem: string; customer: string; due: string; qty: number; warehouse: string; ready: boolean }
/**
 * Inbound order lines matched to waiting sales order lines of the same item that stock cannot cover: the goods go straight
 * from receiving to dispatch. A pair is ready once the receipt is in (received quantity on the order line).
 */
export function crossDockPlan(company: string, horizonDays = 14, asOf = today()): CrossDock[] {
  const until = addDays(asOf, horizonDays); const picked = pickedAlready(); const live = (x: Doc) => n(x.docstatus) === 1 && s(x["company"]) === company && !["Closed", "Completed", "On Hold"].includes(s(x["status"]));
  const due = (so: Doc, r: Doc) => s(r["delivery_date"]) || s(so["delivery_date"]) || asOf;
  // 1. what stock cannot cover: free stock is given to the earliest-due order lines first
  const free = new Map<string, number>(); const short: { so: Doc; r: Doc; wh: string; left: number }[] = [];
  const waiting = adapter.list("Sales Order").filter(live).flatMap((so) => rows(so).map((r) => ({ so, r, wh: s(r["warehouse"]) || s(so["set_warehouse"]), open: n(r["stock_qty"] ?? r["qty"]) - n(r["delivered_qty"]) - (picked.get(rid(so, r)) ?? 0) })))
    .filter((x) => x.open > 0 && x.wh && due(x.so, x.r) <= until).sort((a, b) => due(a.so, a.r).localeCompare(due(b.so, b.r)) || a.so.name.localeCompare(b.so.name));
  for (const w of waiting) {
    const key = `${s(w.r["item_code"])}\u0000${w.wh}`; if (!free.has(key)) free.set(key, Math.max(0, qtyAt(s(w.r["item_code"]), w.wh, asOf)));
    const cover = Math.min(free.get(key)!, w.open); free.set(key, free.get(key)! - cover);
    if (w.open - cover > 0) short.push({ so: w.so, r: w.r, wh: w.wh, left: r2(w.open - cover) });
  }
  // 2. inbound order lines, earliest expected first, fill those shortages of the same item
  const out: CrossDock[] = [];
  const inbound = adapter.list("Purchase Order").filter(live).flatMap((po) => rows(po).map((r) => ({ po, r, exp: s(r["schedule_date"]) || s(po["schedule_date"]) || asOf }))).filter((x) => x.exp <= until).sort((a, b) => a.exp.localeCompare(b.exp));
  for (const { po, r, exp } of inbound) {
    const incoming = n(r["stock_qty"] ?? r["qty"]); let left = incoming; let received = n(r["received_qty"]);
    for (const w of short) {
      if (left <= 0) break; if (w.left <= 0 || s(w.r["item_code"]) !== s(r["item_code"])) continue;
      const q = r2(Math.min(w.left, left)); left -= q; w.left = r2(w.left - q); const ready = received >= q; if (ready) received -= q;
      out.push({ po: po.name, poItem: rid(po, r), supplier: s(po["supplier"]), expected: exp, item: s(r["item_code"]), incoming, received: n(r["received_qty"]), order: w.so.name, orderItem: rid(w.so, w.r), customer: s(w.so["customer"]), due: due(w.so, w.r), qty: q, warehouse: s(r["warehouse"]) || w.wh, ready });
    }
  }
  return out.sort((a, b) => a.expected.localeCompare(b.expected) || a.due.localeCompare(b.due));
}
/** For a ready pair: a draft Pick List from the receiving warehouse to the waiting order (dispatch straight from the dock). */
export function dispatchCrossDock(company: string, c: CrossDock, user = currentUser()): { ok: true; name: string } | { ok: false; reason: Bi } {
  if (!c.ready) return { ok: false, reason: ["The goods are not received yet.", "لم تُستلم البضاعة بعد."] };
  const available = qtyAt(c.item, c.warehouse, today());
  return pickWave(company, [{ order: c.order, orderItem: c.orderItem, customer: c.customer, item: c.item, itemName: s(adapter.get("Item", c.item)?.["item_name"]) || c.item, warehouse: c.warehouse, qty: c.qty, due: c.due, available }], user);
}
