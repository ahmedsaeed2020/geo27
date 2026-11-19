/**
 * SC-I-01 Inventory Overview — read-only selectors over native Core stock records.
 * Values come from posted Stock Ledger Entry rows (written only by src/lib/posting.ts), Bin quantities,
 * Item Reorder child rows and Batch/Serial No records;
 * permission-aware via src/lib/scope.ts; a source the user may not read reports "denied" and contributes no rows.
 */
import type { Doc } from "@/lib/adapter";
import { scopedList } from "@/lib/scope";
import { currentUser } from "@/lib/session";
import { sourceStatus, type SourceStatus } from "./finance";

const n = (v: unknown) => Number(v) || 0;
const r2 = (x: number) => Math.round(x * 100) / 100;

export interface WarehouseValue { warehouse: string; value: number; qty: number }
export interface Shortage { item: string; warehouse: string; actual: number; reserved: number; projected: number }
export interface Movement { doctype: string; name: string; date: string; value: number; lines: number }
export interface ItemBalance { item: string; uom: string; qty: number; value: number; warehouses: number }
export interface ReorderRow { item: string; warehouse: string; level: number; actual: number; projected: number; requestType: string; reorderQty: number }
export interface TrackingSummary { status: SourceStatus; batches: number; serials: number; expiringSoon: number; nextExpiry: string | null }

export interface InventoryOverview {
  company: string;
  ledger: { status: SourceStatus; value: number; byWarehouse: WarehouseValue[]; recent: Movement[] };
  bins: { status: SourceStatus; short: Shortage[]; count: number };
  drafts: { status: SourceStatus; count: number; rows: { name: string; purpose: string; date: string }[] };
  items: { status: SourceStatus; byItem: ItemBalance[]; count: number };
  /** rows = first 8 for display; all = every below-reorder row (bulk Material Request, IN7). */
  reorder: { status: SourceStatus; rows: ReorderRow[]; count: number; all: ReorderRow[] };
  tracking: TrackingSummary;
}

const EXPIRY_SOON_DAYS = 30;

/** Native Item Reorder child rows (per warehouse) compared with the Bin actual/projected quantity of the same item and
 * warehouse; only warehouses owned by `company`. Shared by Inventory Overview and the Inventory Control exception queue. */
export function belowReorder(items: Doc[], bins: Doc[], whCo: Map<string, string>, company: string): ReorderRow[] {
  const binOf = new Map(bins.map((b) => [`${b["item_code"]}::${b["warehouse"]}`, b]));
  const out: ReorderRow[] = [];
  for (const it of items) {
    const levels = Array.isArray(it["reorder_levels"]) ? (it["reorder_levels"] as Doc[]) : [];
    for (const rl of levels) {
      const warehouse = String(rl["warehouse"] ?? "");
      if (company && whCo.get(warehouse) !== company) continue;
      const level = n(rl["warehouse_reorder_level"]);
      if (!warehouse || !level) continue;
      const b = binOf.get(`${it.name}::${warehouse}`);
      const actual = n(b?.["actual_qty"]);
      const projected = b ? (b["projected_qty"] !== undefined && b["projected_qty"] !== null ? n(b["projected_qty"]) : actual) : 0;
      if (projected < level || actual < level) out.push({ item: it.name, warehouse, level, actual, projected, requestType: String(rl["material_request_type"] ?? ""), reorderQty: n(rl["warehouse_reorder_qty"]) });
    }
  }
  return out.sort((a, b) => (a.projected - a.level) - (b.projected - b.level));
}

export function inventoryOverview(company: string, user = currentUser()): InventoryOverview {
  const whStatus = sourceStatus("Warehouse",user);
  const whCo = new Map(whStatus === "ok" ? scopedList("Warehouse", user).map((w) => [w.name, String(w["company"] ?? "")]) : []);
  const coOk = (d: Doc) => !company || d["company"] === company;

  const ledgerStatus = sourceStatus("Stock Ledger Entry", user);
  const lStatus = ledgerStatus === "ok" ? whStatus : ledgerStatus;
  const sle = lStatus === "ok" ? scopedList("Stock Ledger Entry", user).filter((d) => (coOk(d) || !d["company"] && whCo.get(String(d["warehouse"]))===company) && !n(d["is_cancelled"])) : [];
  const wh = new Map<string, WarehouseValue>();
  const mv = new Map<string, Movement>();
  for (const s of sle) {
    const w = String(s["warehouse"] ?? "");
    const c = wh.get(w) ?? { warehouse: w, value: 0, qty: 0 };
    c.value = r2(c.value + n(s["stock_value_difference"])); c.qty = r2(c.qty + n(s["actual_qty"])); wh.set(w, c);
    const k = `${s["voucher_type"]}::${s["voucher_no"]}`;
    const m = mv.get(k) ?? { doctype: String(s["voucher_type"]), name: String(s["voucher_no"]), date: String(s["posting_date"] ?? ""), value: 0, lines: 0 };
    m.value = r2(m.value + n(s["stock_value_difference"])); m.lines += 1; mv.set(k, m);
  }
  const byWarehouse = [...wh.values()].filter((w) => w.qty !== 0 || w.value !== 0).sort((a, b) => b.value - a.value);

  // Bin has no company field: scope it through the warehouse's Core company.
  const binStatus = sourceStatus("Bin", user);
  const bStatus = binStatus === "ok" ? whStatus : binStatus;
  const bins = bStatus === "ok" ? scopedList("Bin", user).filter((b) => { const c = whCo.get(String(b["warehouse"])); return !company || c === company; }) : [];
  const short = bins.filter((b) => n(b["reserved_qty"]) > n(b["actual_qty"]) || n(b["projected_qty"]) < 0)
    .map((b) => ({ item: String(b["item_code"]), warehouse: String(b["warehouse"]), actual: n(b["actual_qty"]), reserved: n(b["reserved_qty"]), projected: n(b["projected_qty"]) }))
    .sort((a, b) => a.projected - b.projected);

  const iStatus = sourceStatus("Item", user);
  const items = iStatus === "ok" ? scopedList("Item", user) : [];
  const uomOf = new Map(items.map((it) => [it.name, String(it["stock_uom"] ?? "")]));
  const byItemMap = new Map<string, ItemBalance>();
  for (const b of bins) {
    const item = String(b["item_code"]);
    const c = byItemMap.get(item) ?? { item, uom: uomOf.get(item) ?? String(b["stock_uom"] ?? ""), qty: 0, value: 0, warehouses: 0 };
    c.qty = r2(c.qty + n(b["actual_qty"])); c.value = r2(c.value + (b["stock_value"] !== undefined && b["stock_value"] !== null ? n(b["stock_value"]) : r2(n(b["actual_qty"]) * n(b["valuation_rate"])))); c.warehouses += 1;
    byItemMap.set(item, c);
  }
  const byItem = [...byItemMap.values()].filter((x) => x.qty !== 0 || x.value !== 0).sort((a, b) => b.value - a.value);

  // Reorder levels are native Item Reorder child rows (per warehouse); compared against Bin actual/projected.
  const rStatus = iStatus === "ok" ? bStatus : iStatus;
  const reorderRows: ReorderRow[] = rStatus === "ok" ? belowReorder(items, bins, whCo, company) : [];

  // Batches carry no company: scope them through items held in the company's warehouses.
  // Held = Bin snapshot ∪ posted Stock Ledger Entries (the ledger is authoritative for tracked items without a Bin).
  // Serial No has its own company field.
  const batchStatus = sourceStatus("Batch", user);
  const serialStatus = sourceStatus("Serial No", user);
  const tStatus: SourceStatus = batchStatus === "ok" ? serialStatus : batchStatus;
  const inScopeItem = new Set(bins.map((b) => String(b["item_code"])));
  if (lStatus === "ok") {
    for (const s of sle) {
      const c = whCo.get(String(s["warehouse"] ?? ""));
      if (!company || c === company) inScopeItem.add(String(s["item_code"] ?? ""));
    }
  }
  let batches = 0, serials = 0, expiringSoon = 0, nextExpiry: string | null = null;
  if (tStatus === "ok") {
    const today = new Date().toISOString().slice(0, 10);
    const horizon = new Date(Date.now() + EXPIRY_SOON_DAYS * 86400000).toISOString().slice(0, 10);
    for (const bt of scopedList("Batch", user)) {
      if (!inScopeItem.has(String(bt["item"] ?? ""))) continue;
      if (n(bt["disabled"])) continue;
      batches += 1;
      const exp = String(bt["expiry_date"] ?? "");
      if (exp && exp >= today) { if (!nextExpiry || exp < nextExpiry) nextExpiry = exp; if (exp <= horizon) expiringSoon += 1; }
    }
    for (const sn of scopedList("Serial No", user)) {
      if (!coOk(sn)) continue;
      if (inScopeItem.size && !inScopeItem.has(String(sn["item_code"] ?? ""))) continue;
      serials += 1;
    }
  }

  const dStatus = sourceStatus("Stock Entry", user);
  const drafts = dStatus === "ok" ? scopedList("Stock Entry", user).filter((d) => coOk(d) && n(d.docstatus) === 0) : [];

  return {
    company,
    ledger: { status: lStatus, value: r2(byWarehouse.reduce((s, w) => s + w.value, 0)), byWarehouse,
      recent: [...mv.values()].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8) },
    bins: { status: bStatus, short:short.slice(0,8), count:short.length },
    drafts: { status: dStatus, count: drafts.length,
      rows: drafts.map((d) => ({ name: d.name, purpose: String(d["stock_entry_type"] ?? d["purpose"] ?? ""), date: String(d["posting_date"] ?? "") })).slice(0, 8) },
    items: { status: iStatus === "ok" ? bStatus : iStatus, byItem: byItem.slice(0, 10), count:byItem.length },
    reorder: { status: rStatus, rows: reorderRows.slice(0, 8), count:reorderRows.length, all: reorderRows },
    tracking: { status: tStatus, batches, serials, expiringSoon, nextExpiry },
  };
}
