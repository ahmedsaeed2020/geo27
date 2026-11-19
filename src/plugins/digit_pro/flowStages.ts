/**
 * Document-flow work queues for Selling and Purchasing (Phase 2). Each stage is a filter over a native Core
 * DocType using Core-owned status/percent fields; counts are permission-scoped through scopedList and every
 * stage opens the native list with the same filters. Nothing here posts or re-derives document logic.
 */
import type { Doc } from "@/lib/adapter";
import { scopedList } from "@/lib/scope";
import { currentUser } from "@/lib/session";
import { sourceStatus, todayIso, type SourceStatus } from "./finance";

export type Cond = [string, "=" | "!=" | "in" | "<" | ">", unknown];
export interface StageDef { id: string; label: string; next: string; doctype: string; where: Cond[]; amount?: string; /** false: the DocType has no company field (Packing Slip) */ company?: false; /** owner notes B-06: why the step shows 0, and the document a user creates to start it */ empty?: string; create?: string }
export interface Stage extends StageDef { status: SourceStatus; count: number; total: number; filters: Cond[] }

const n = (v: unknown) => Number(v) || 0;
const r2 = (x: number) => Math.round(x * 100) / 100;

export function matches(d: Doc, c: Cond[]): boolean {
  return c.every(([f, op, v]) => {
    const x = d[f];
    if (op === "=") return String(x ?? "") === String(v);
    if (op === "!=") return String(x ?? "") !== String(v);
    if (op === "in") return (v as unknown[]).map(String).includes(String(x ?? ""));
    if (typeof v === "number") return op === "<" ? n(x) < v : n(x) > v;
    const a = String(x ?? ""), b = String(v); return a !== "" && (op === "<" ? a < b : a > b);
  });
}

const TODAY = "__today__";
export const SELLING_FLOW: StageDef[] = [
  { id: "q-open", label: "Open quotations", next: "Convert to Sales Order", doctype: "Quotation", where: [["docstatus", "=", 1], ["status", "in", ["Open", "Replied", "Partially Ordered"]]], amount: "grand_total" },
  { id: "so-deliver", label: "Orders to deliver", next: "Create Delivery Note", doctype: "Sales Order", where: [["docstatus", "=", 1], ["status", "in", ["To Deliver and Bill", "To Deliver"]]], amount: "grand_total" },
  { id: "so-bill", label: "Delivered, not billed", next: "Create Sales Invoice", doctype: "Sales Order", where: [["docstatus", "=", 1], ["status", "=", "To Bill"]], amount: "grand_total" },
  { id: "dn-bill", label: "Delivery notes to bill", next: "Create Sales Invoice", doctype: "Delivery Note", where: [["docstatus", "=", 1], ["status", "=", "To Bill"]], amount: "grand_total" },
  { id: "si-unpaid", label: "Invoices to collect", next: "Create Payment Entry", doctype: "Sales Invoice", where: [["docstatus", "=", 1], ["outstanding_amount", ">", 0]], amount: "outstanding_amount" },
  { id: "si-overdue", label: "Overdue invoices", next: "Follow up the customer", doctype: "Sales Invoice", where: [["docstatus", "=", 1], ["outstanding_amount", ">", 0], ["due_date", "<", TODAY]], amount: "outstanding_amount" },
];
/** SL9-b — directed pick → pack → ship (Pick List, Packing Slip, Delivery Trip) for the Delivery & Billing workspace. */
export const PICK_PACK_SHIP: StageDef[] = [
  { id: "so-pick", label: "Orders to pick", next: "Create Pick List", empty: "No submitted orders waiting for delivery yet", create: "Sales Order", doctype: "Sales Order", where: [["docstatus", "=", 1], ["status", "in", ["To Deliver and Bill", "To Deliver"]]], amount: "grand_total" },
  { id: "pl-open", label: "Pick lists to deliver", next: "Create Delivery Note", empty: "No pick lists yet", create: "Pick List", doctype: "Pick List", where: [["docstatus", "=", 1], ["purpose", "=", "Delivery"], ["status", "in", ["Open", "Partly Delivered"]]] },
  { id: "dn-pack", label: "Draft deliveries to pack", next: "Create Packing Slip", empty: "No draft delivery notes to pack yet", create: "Delivery Note", doctype: "Delivery Note", where: [["docstatus", "=", 0], ["is_return", "!=", 1]], amount: "grand_total" },
  { id: "ps-packed", label: "Packing slips", next: "Submit the Delivery Note", empty: "No packing slips yet", create: "Packing Slip", doctype: "Packing Slip", where: [["docstatus", "=", 1]], company: false },
  { id: "dt-route", label: "Delivery trips on the road", next: "Complete the trip", empty: "No delivery trips on the road", create: "Delivery Trip", doctype: "Delivery Trip", where: [["docstatus", "=", 1], ["status", "in", ["Scheduled", "In Transit"]]] },
];

export const PURCHASING_FLOW: StageDef[] = [
  { id: "mr-pending", label: "Requests awaiting sourcing", next: "Create RFQ or Purchase Order", doctype: "Material Request", where: [["docstatus", "=", 1], ["material_request_type", "=", "Purchase"], ["status", "in", ["Pending", "Partially Ordered"]]] },
  { id: "rfq-open", label: "RFQs sent", next: "Record Supplier Quotation", doctype: "Request for Quotation", where: [["docstatus", "=", 1]] },
  { id: "sq-received", label: "Quotations received", next: "Compare and create Purchase Order", doctype: "Supplier Quotation", where: [["docstatus", "=", 1], ["status", "=", "Submitted"]], amount: "grand_total" },
  { id: "po-receive", label: "Orders to receive", next: "Create Purchase Receipt", doctype: "Purchase Order", where: [["docstatus", "=", 1], ["status", "in", ["To Receive and Bill", "To Receive"]]], amount: "grand_total" },
  { id: "pr-bill", label: "Received, not invoiced", next: "Create Purchase Invoice", doctype: "Purchase Receipt", where: [["docstatus", "=", 1], ["status", "=", "To Bill"]], amount: "grand_total" },
  { id: "pi-unpaid", label: "Invoices to pay", next: "Create Payment Entry", doctype: "Purchase Invoice", where: [["docstatus", "=", 1], ["outstanding_amount", ">", 0]], amount: "outstanding_amount" },
];

export function flowStages(defs: StageDef[], company: string, user = currentUser(), today = todayIso()): Stage[] {
  return defs.map((s) => {
    const where = s.where.map(([f, o, v]) => [f, o, v === TODAY ? today : v] as Cond);
    const filters: Cond[] = company && s.company !== false ? [...where, ["company", "=", company]] : where;
    const status = sourceStatus(s.doctype, user);
    const rows = status === "ok" ? scopedList(s.doctype, user).filter((d) => (!company || !d["company"] || d["company"] === company) && matches(d, where)) : [];
    return { ...s, where, filters, status, count: rows.length, total: r2(rows.reduce((a, d) => a + n(s.amount ? d[s.amount] : 0), 0)) };
  });
}

/** Sales Orders partly delivered or partly billed, from Core per_delivered / per_billed. */
export interface Fulfil { name: string; customer: string; date: string; delivered: number; billed: number; total: number; status: string }
export function partialOrders(doctype: "Sales Order" | "Purchase Order", company: string, user = currentUser()): { status: SourceStatus; rows: Fulfil[] } {
  const status = sourceStatus(doctype, user);
  const delivered = doctype === "Sales Order" ? "per_delivered" : "per_received";
  const rows = status === "ok" ? scopedList(doctype, user)
    .filter((d) => (!company || d["company"] === company) && n(d.docstatus) === 1 && !["Completed", "Closed", "On Hold"].includes(String(d["status"])))
    .map((d) => ({ name: d.name, customer: String(d["customer"] ?? d["supplier"] ?? ""), date: String(d["delivery_date"] ?? d["schedule_date"] ?? d["transaction_date"] ?? ""), delivered: r2(n(d[delivered])), billed: r2(n(d["per_billed"])), total: r2(n(d["grand_total"])), status: String(d["status"] ?? "") }))
    .sort((a, b) => a.date.localeCompare(b.date)).slice(0, 10) : [];
  return { status, rows };
}

/** Supplier Quotation comparison per item: actual rate, qty, delivery date and supplier — no weighted score.
 * Rates are comparable only within the same item, unit and quotation currency; "lowest" is marked inside such a group
 * and never across currencies or units (EC-R1 P6). Each row keeps its own currency for display. */
export interface QuoteRow { item: string; supplier: string; sq: string; rate: number; qty: number; uom: string; currency: string; date: string; best: boolean; comparable: boolean }
export function quoteComparison(company: string, user = currentUser()): { status: SourceStatus; items: { item: string; rows: QuoteRow[] }[] } {
  const status = sourceStatus("Supplier Quotation", user);
  if (status !== "ok") return { status, items: [] };
  const by = new Map<string, QuoteRow[]>();
  for (const d of scopedList("Supplier Quotation", user)) {
    if ((company && d["company"] !== company) || n(d.docstatus) !== 1) continue;
    for (const it of (d["items"] as Doc[] | undefined) ?? []) {
      const item = String(it["item_code"] ?? ""); if (!item) continue;
      const list = by.get(item) ?? [];
      list.push({ item, supplier: String(d["supplier"] ?? ""), sq: d.name, rate: r2(n(it["rate"])), qty: n(it["qty"]), uom: String(it["uom"] ?? ""), currency: String(d["currency"] ?? ""), date: String(it["expected_delivery_date"] ?? d["valid_till"] ?? ""), best: false, comparable: false });
      by.set(item, list);
    }
  }
  const items = [...by.entries()].map(([item, rows]) => {
    const groups = new Map<string, QuoteRow[]>();
    for (const r of rows) { const k = `${r.uom}|${r.currency}`; groups.set(k, [...(groups.get(k) ?? []), r]); }
    for (const g of groups.values()) { if (g.length < 2 || g.some((r) => !r.uom || !r.currency)) continue; g.forEach((r) => (r.comparable = true)); const low = Math.min(...g.map((r) => r.rate)); g.forEach((r) => (r.best = r.rate === low)); }
    rows.sort((a, b) => a.currency.localeCompare(b.currency) || a.uom.localeCompare(b.uom) || a.rate - b.rate); return { item, rows };
  }).sort((a, b) => b.rows.length - a.rows.length);
  return { status, items };
}
