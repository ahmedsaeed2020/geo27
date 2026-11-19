/**
 * SC-P-09 Open Purchase Orders — read-only per-line position over native submitted Purchase Orders.
 * Uses Core-owned child fields (qty, received_qty, returned_qty, amount, billed_amt, schedule_date); never posts.
 * RXP-01 (PUR-OPEN-PO): expected-delivery bands are a line-level predicate (same predicate for rows, totals and the
 * distribution), and each line links the PO's submitted Purchase Receipts / Purchase Invoices from their child rows.
 * Commitments are not payables: values here are order-currency amounts still to receive or bill, not posted AP.
 */
import { scopedList } from "@/lib/scope";
import { currentUser } from "@/lib/session";
import { sourceStatus, todayIso, type SourceStatus } from "./finance";
import { PO_BANDS, type PoBand } from "./viewSpecs";

const n = (v: unknown) => Number(v) || 0;
const r2 = (x: number) => Math.round(x * 100) / 100;
const OPEN = ["To Receive and Bill", "To Receive", "To Bill"];
const addDays = (iso: string, k: number) => new Date(Date.parse(iso) + k * 864e5).toISOString().slice(0, 10);

export interface OpenPoLine {
  po: string; supplier: string; status: string; date: string; due: string; overdue: boolean; band: PoBand;
  item: string; uom: string; currency: string; qty: number; received: number; returned: number; toReceive: number; amount: number; billed: number; toBill: number;
  receipts: string[]; invoices: string[];
}
/** `sched_from`/`sched_to` (inclusive expected-delivery window, RXP-02 AP calendar drill): lines without an expected date never match a window. */
export interface OpenPoFilter { company?: string | undefined; supplier?: string | undefined; status?: string | undefined; due?: string | undefined; q?: string | undefined; band?: string | undefined; sched_from?: string | undefined; sched_to?: string | undefined }
/** Same window predicate for the AP calendar commitment series and the Open Purchase Orders register. */
export const inSchedule = (due: string, from?: string, to?: string) => (!from && !to) || (!!due && (!from || due >= from) && (!to || due <= to));

export function bandOf(toReceive: number, due: string, today: string): PoBand {
  if (toReceive <= 0) return "billing";
  if (!due) return "nodate";
  if (due < today) return "overdue";
  if (due <= addDays(today, 7)) return "week";
  return due <= addDays(today, 30) ? "month" : "later";
}

export function openPurchaseOrders(f: OpenPoFilter, user = currentUser(), today = todayIso()): { status: SourceStatus; lines: OpenPoLine[]; suppliers: string[]; bands: { band: PoBand; lines: number; orders: number }[]; totals: { currencies: { currency: string; toReceive: number; toBill: number }[]; overdue: number; orders: number } } {
  const status = sourceStatus("Purchase Order", user);
  const empty = { currencies: [], overdue: 0, orders: 0 };
  if (status !== "ok") return { status, lines: [], suppliers: [], bands: [], totals: empty };
  const pos = scopedList("Purchase Order", user).filter((d) => n(d.docstatus) === 1 && OPEN.includes(String(d["status"])) && (!f.company || d["company"] === f.company));
  const suppliers = [...new Set(pos.map((d) => String(d["supplier"] ?? "")))].filter(Boolean).sort();
  // Related submitted receipts/invoices by their child rows' purchase_order link (permission-scoped; unreadable → none listed)
  const linked = (dt: string) => {
    const m = new Map<string, Set<string>>();
    if (sourceStatus(dt, user) !== "ok") return m;
    for (const d of scopedList(dt, user)) { if (n(d.docstatus) !== 1) continue; for (const it of (d["items"] as Record<string, unknown>[] | undefined) ?? []) { const po = String(it["purchase_order"] ?? ""); if (po) m.set(po, (m.get(po) ?? new Set()).add(d.name)); } }
    return m;
  };
  const prBy = linked("Purchase Receipt"), piBy = linked("Purchase Invoice");
  const ql = (f.q ?? "").trim().toLowerCase();
  const pre: OpenPoLine[] = [];
  for (const d of pos) {
    const sup = String(d["supplier"] ?? ""); const st = String(d["status"]);
    if (f.supplier && sup !== f.supplier) continue;
    if (f.status && st !== f.status) continue;
    for (const it of (d["items"] as Record<string, unknown>[] | undefined) ?? []) {
      const qty = n(it["qty"]); const received = n(it["received_qty"]) - n(it["returned_qty"]);
      const amount = n(it["amount"]); const billed = n(it["billed_amt"]);
      const toReceive = Math.max(0, r2(qty - received)); const toBill = Math.max(0, r2(amount - billed));
      if (toReceive <= 0 && toBill <= 0) continue;
      const due = String(it["schedule_date"] ?? d["schedule_date"] ?? "");
      const overdue = toReceive > 0 && !!due && due < today;
      if (f.due === "overdue" && !overdue) continue;
      if (!inSchedule(due, f.sched_from, f.sched_to)) continue;
      const item = String(it["item_code"] ?? "");
      if (ql && !`${d.name} ${sup} ${item} ${it["item_name"] ?? ""}`.toLowerCase().includes(ql)) continue;
      pre.push({ po: d.name, supplier: sup, status: st, date: String(d["transaction_date"] ?? ""), due, overdue, band: bandOf(toReceive, due, today), item, uom: String(it["uom"] || ""), currency: String(d["currency"] || ""), qty, received: r2(received), returned: n(it["returned_qty"]), toReceive, amount: r2(amount), billed: r2(billed), toBill,
        receipts: [...(prBy.get(d.name) ?? [])].sort(), invoices: [...(piBy.get(d.name) ?? [])].sort() });
    }
  }
  const bands = PO_BANDS.map((band) => { const ls = pre.filter((l) => l.band === band); return { band, lines: ls.length, orders: new Set(ls.map((l) => l.po)).size }; });
  const lines = f.band ? pre.filter((l) => l.band === f.band) : pre;
  lines.sort((a, b) => Number(b.overdue) - Number(a.overdue) || a.due.localeCompare(b.due));
  return { status, lines, suppliers, bands, totals: {
    currencies: [...new Set(lines.map((l) => l.currency))].sort().map((currency) => ({ currency, toReceive: r2(lines.filter((l) => l.currency === currency).reduce((s, l) => s + l.amount * (l.qty ? l.toReceive / l.qty : 0), 0)), toBill: r2(lines.filter((l) => l.currency === currency).reduce((s, l) => s + l.toBill, 0)) })),
    overdue: lines.filter((l) => l.overdue).length,
    orders: new Set(lines.map((l) => l.po)).size,
  } };
}

export function sortPoLines(lines: OpenPoLine[], sort: { field: string; dir: "asc" | "desc" } | null): OpenPoLine[] {
  if (!sort) return lines;
  const m = sort.dir === "asc" ? 1 : -1;
  const v = (l: OpenPoLine): string | number => sort.field === "po" ? l.po : sort.field === "supplier" ? l.supplier : sort.field === "toReceive" ? l.toReceive : sort.field === "toBill" ? l.toBill : (l.due || "9999-12-31");
  return [...lines].sort((a, b) => { const x = v(a), y = v(b); return (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y))) * m || a.po.localeCompare(b.po); });
}
