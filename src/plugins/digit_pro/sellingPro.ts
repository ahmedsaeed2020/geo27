/**
 * SC-S-01 Selling Overview — read-only selectors over native Core selling records.
 * Statuses and amounts are Core-owned fields (status, outstanding_amount, grand_total); nothing is computed
 * by re-deriving document logic here. Every source goes through src/lib/scope.ts (role perms, if_owner,
 * User Permission); a source the user may not read reports status "denied" and contributes no rows.
 */
import type { Doc } from "@/lib/adapter";
import { scopedList } from "@/lib/scope";
import { currentUser } from "@/lib/session";
import { sourceStatus, todayIso, type SourceStatus } from "./finance";

const n = (v: unknown) => Number(v) || 0;
const r2 = (x: number) => Math.round(x * 100) / 100;

export interface StatusCount { status: string; count: number; amount: number }
export interface SellingDoc { doctype: string; name: string; date: string; party: string; status: string; amount: number; outstanding?: number }

export interface SellingOverview {
  company: string; currency: string;
  quotations: { status: SourceStatus; open: number; expiring: SellingDoc[] };
  orders: { status: SourceStatus; byStatus: StatusCount[]; toDeliver: StatusCount; toBill: StatusCount };
  invoices: { status: SourceStatus; outstanding: number; overdueCount: number; overdueAmount: number };
  topCustomers: { status: SourceStatus; rows: { customer: string; outstanding: number }[] };
  recent: SellingDoc[];
}

const coOk = (d: Doc, company: string) => !company || !d["company"] || d["company"] === company;
const partyOf = (d: Doc) => String(d["customer"] ?? d["party_name"] ?? "");

export function sellingOverview(company: string, currency: string, user = currentUser()): SellingOverview {
  const t = todayIso();
  const soon = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);

  // Quotations: open (submitted, not ordered/expired) and expiring within 7 days.
  const qStatus = sourceStatus("Quotation", user);
  const qs = qStatus === "ok" ? scopedList("Quotation", user).filter((d) => coOk(d, company)) : [];
  const openQs = qs.filter((d) => n(d.docstatus) === 1 && d["status"] === "Open");
  const expiring = openQs.filter((d) => d["valid_till"] && String(d["valid_till"]) >= t && String(d["valid_till"]) <= soon)
    .map((d) => ({ doctype: "Quotation", name: d.name, date: String(d["valid_till"]), party: partyOf(d), status: String(d["status"]), amount: r2(n(d["grand_total"])) }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // Sales Orders grouped by Core status; the two actionable buckets surfaced as cards.
  const oStatus = sourceStatus("Sales Order", user);
  const orders = oStatus === "ok" ? scopedList("Sales Order", user).filter((d) => coOk(d, company) && n(d.docstatus) === 1) : [];
  const byStatus = new Map<string, StatusCount>();
  for (const d of orders) {
    const s = String(d["status"] ?? "");
    const c = byStatus.get(s) ?? { status: s, count: 0, amount: 0 };
    c.count += 1; c.amount = r2(c.amount + n(d["grand_total"])); byStatus.set(s, c);
  }
  const bucket = (s: string) => byStatus.get(s) ?? { status: s, count: 0, amount: 0 };

  // Receivables side: outstanding + overdue from Core Sales Invoice fields.
  const iStatus = sourceStatus("Sales Invoice", user);
  const invs = iStatus === "ok" ? scopedList("Sales Invoice", user).filter((d) => coOk(d, company) && n(d.docstatus) === 1) : [];
  const openInv = invs.filter((d) => n(d["outstanding_amount"]) > 0);
  const overdue = openInv.filter((d) => d["due_date"] && String(d["due_date"]) < t);

  const perCust = new Map<string, number>();
  for (const d of openInv) perCust.set(partyOf(d), r2((perCust.get(partyOf(d)) ?? 0) + n(d["outstanding_amount"])));
  const topCustomers = [...perCust.entries()].map(([customer, outstanding]) => ({ customer, outstanding }))
    .sort((a, b) => b.outstanding - a.outstanding).slice(0, 5);

  const recent: SellingDoc[] = [
    ...orders.map((d) => ({ doctype: "Sales Order", name: d.name, date: String(d["transaction_date"] ?? ""), party: partyOf(d), status: String(d["status"] ?? ""), amount: r2(n(d["grand_total"])) })),
    ...invs.map((d) => ({ doctype: "Sales Invoice", name: d.name, date: String(d["posting_date"] ?? ""), party: partyOf(d), status: String(d["status"] ?? ""), amount: r2(n(d["grand_total"])), outstanding: r2(n(d["outstanding_amount"])) })),
  ].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8);

  return {
    company, currency,
    quotations: { status: qStatus, open: openQs.length, expiring },
    orders: { status: oStatus, byStatus: [...byStatus.values()].sort((a, b) => b.amount - a.amount), toDeliver: bucket("To Deliver"), toBill: bucket("To Bill") },
    invoices: { status: iStatus, outstanding: r2(openInv.reduce((s, d) => s + n(d["outstanding_amount"]), 0)), overdueCount: overdue.length, overdueAmount: r2(overdue.reduce((s, d) => s + n(d["outstanding_amount"]), 0)) },
    topCustomers: { status: iStatus, rows: topCustomers },
    recent,
  };
}
