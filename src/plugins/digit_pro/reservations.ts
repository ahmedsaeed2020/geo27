/**
 * IN6-b / INV-009-b — Stock Reservation Entry exposure on the Sales Order (Sage "detailed reservation"): per order
 * line the ordered, delivered, reserved-for-this-order, free-to-reserve and backorder quantities. Reads only native
 * records (Sales Order, Delivery Note, Stock Reservation Entry, Bin via stock.qtyAt) through the user's scope; the
 * native Reserve / Unreserve / Reserved Stock buttons (sales_order.js → src/lib/localActions.ts) do the writing.
 */
import { adapter, type Doc } from "@/lib/adapter";
import { qtyAt, reservedQty } from "@/lib/stock";
import { scopedList } from "@/lib/scope";
import { currentUser } from "@/lib/session";
import { sourceStatus, type SourceStatus } from "./finance";

export type LineState = "reserved" | "partial" | "backorder" | "can_reserve" | "delivered" | "non_stock";
export interface ReservationLine { idx: number; item: string; warehouse: string; ordered: number; delivered: number; reserved: number; free: number; backorder: number; state: LineState; entries: string[] }
export interface OrderReservations { status: SourceStatus; enabled: boolean; lines: ReservationLine[]; entries: number }

const n = (v: unknown) => Number(v ?? 0) || 0;
const r3 = (v: number) => Math.round(v * 1000) / 1000;

export function orderReservations(so: Doc, user = currentUser()): OrderReservations {
  const enabled = !!n(adapter.get("Stock Settings", "Stock Settings")?.["enable_stock_reservation"]);
  const st = sourceStatus("Stock Reservation Entry", user);
  if (st !== "ok") return { status: st, enabled, lines: [], entries: 0 };
  const sre = scopedList("Stock Reservation Entry", user).filter((s) => n(s["docstatus"]) === 1 && s["voucher_no"] === so.name);
  const dn = sourceStatus("Delivery Note", user) === "ok" ? scopedList("Delivery Note", user).filter((x) => n(x["docstatus"]) === 1) : [];
  const lines: ReservationLine[] = [];
  for (const r of (so["items"] as Doc[] | undefined) ?? []) {
    const item = String(r["item_code"] ?? ""); if (!item) continue;
    const wh = String(r["warehouse"] || so["set_warehouse"] || "");
    const ordered = n(r["stock_qty"]) || n(r["qty"]);
    const stock = Number(adapter.get("Item", item)?.["is_stock_item"] ?? 1) !== 0;
    // same delivered formula as stock.reserveStock (submitted Delivery Note rows against this order)
    const delivered = r3(dn.flatMap((x) => (x["items"] as Doc[] | undefined) ?? []).filter((x) => x["against_sales_order"] === so.name && x["item_code"] === item && (!x["so_detail"] || !r["name"] || x["so_detail"] === r["name"])).reduce((a, x) => a + n(x["qty"]), 0));
    const mine = sre.filter((s) => s["item_code"] === item && (!s["voucher_detail_no"] || !r["name"] || s["voucher_detail_no"] === r["name"]));
    const reserved = r3(mine.reduce((a, s) => a + Math.max(n(s["reserved_qty"]) - n(s["delivered_qty"]), 0), 0));
    const pending = Math.max(ordered - delivered, 0);
    const free = stock && wh ? r3(Math.max(qtyAt(item, wh) - reservedQty(item, wh), 0)) : 0;
    const backorder = stock ? r3(Math.max(pending - reserved - free, 0)) : 0;
    const state: LineState = !stock ? "non_stock" : pending <= 0.0001 ? "delivered" : reserved >= pending - 0.0001 ? "reserved"
      : backorder > 0.0001 ? (reserved > 0 ? "partial" : "backorder") : reserved > 0 ? "partial" : "can_reserve";
    lines.push({ idx: n(r["idx"]) || lines.length + 1, item, warehouse: wh, ordered: r3(ordered), delivered, reserved, free, backorder, state, entries: mine.map((s) => s.name) });
  }
  return { status: "ok", enabled, lines, entries: sre.length };
}
