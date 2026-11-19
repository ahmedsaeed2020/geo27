/**
 * SC-S-02 / SC-S-04 — read-only selling lineage and Customer 360 selectors over native Core records.
 * Lineage follows the native child-row links ERPNext's mappers write (Sales Order Item.prevdoc_docname,
 * Delivery Note Item.against_sales_order, Sales Invoice Item.sales_order/delivery_note, Payment Entry Reference),
 * so nothing is stored or computed beyond what Core already holds. Permission-aware via scope.ts.
 */
import type { Doc } from "@/lib/adapter";
import { scopedList } from "@/lib/scope";
import { currentUser } from "@/lib/session";
import { creditLimit, customerOutstanding } from "@/lib/selling";
import { sourceStatus, type SourceStatus } from "./finance";
import { lineage, SELLING, type FlowDoc as DF } from "./docFlow";

const n = (v: unknown) => Number(v) || 0;
const r2 = (x: number) => Math.round(x * 100) / 100;

export { nextStep, type FlowStage } from "./docFlow";
export const FLOW = SELLING.stages as readonly string[];
export type FlowDoc = DF;
/** Selling lineage — the shared spec-driven graph in docFlow.ts (same component and rules as Purchasing). */
export const salesLineage = (doctype: string, name: string, user = currentUser()) => lineage(SELLING, doctype, name, user);
const dateOf = (d: Doc) => String(d["posting_date"] ?? d["transaction_date"] ?? "");
type FlowDoctype = string;

export interface Customer360 {
  customer: string; company: string;
  outstanding: number; creditLimit: number; creditAvailable: number | null;
  orders: { status: SourceStatus; open: number; toDeliver: number; toBill: number };
  invoices: { status: SourceStatus; unpaid: number; unpaidAmount: number; overdue: number; lastDate: string };
  quotations: { status: SourceStatus; open: number };
  recent: FlowDoc[];
}

export function customer360(customer: string, company: string, today: string, user = currentUser()): Customer360 {
  const mine = (d: Doc) => d["customer"] === customer && (!company || d["company"] === company);
  const ok = (dt: FlowDoctype) => sourceStatus(dt, user);
  const list = (dt: FlowDoctype) => ok(dt) === "ok" ? scopedList(dt, user).filter(mine) : [];
  const so = list("Sales Order").filter((d) => n(d.docstatus) === 1);
  const si = list("Sales Invoice").filter((d) => n(d.docstatus) === 1);
  const qt = list("Quotation");
  const open = so.filter((d) => !["Closed", "Completed", "On Hold"].includes(String(d["status"])));
  const unpaid = si.filter((d) => n(d["outstanding_amount"]) > 0);
  const lim = creditLimit(customer, company).limit;
  const out = ok("Sales Invoice") === "ok" ? customerOutstanding(customer, company) : 0;
  const recent = [...list("Quotation").map((d) => ["Quotation", d] as const), ...so.map((d) => ["Sales Order", d] as const), ...list("Sales Invoice").map((d) => ["Sales Invoice", d] as const)]
    .map(([dt, d]) => ({ doctype: dt as FlowDoctype, name: d.name, docstatus: n(d.docstatus), status: String(d["status"] ?? ""), date: dateOf(d), total: n(d["grand_total"]), isReturn: !!n(d["is_return"]), returnAgainst: String(d["return_against"] ?? "") }))
    .sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6);
  return {
    customer, company, outstanding: out, creditLimit: lim, creditAvailable: lim ? r2(lim - out) : null,
    orders: { status: ok("Sales Order"), open: open.length, toDeliver: open.filter((d) => n(d["per_delivered"]) < 100).length, toBill: open.filter((d) => n(d["per_billed"]) < 100).length },
    invoices: { status: ok("Sales Invoice"), unpaid: unpaid.length, unpaidAmount: r2(unpaid.reduce((s, d) => s + n(d["outstanding_amount"]), 0)),
      overdue: unpaid.filter((d) => String(d["due_date"] ?? "") < today).length, lastDate: si.map(dateOf).sort().pop() ?? "" },
    quotations: { status: ok("Quotation"), open: qt.filter((d) => n(d.docstatus) === 1 && String(d["status"]) === "Open").length },
    recent,
  };
}
