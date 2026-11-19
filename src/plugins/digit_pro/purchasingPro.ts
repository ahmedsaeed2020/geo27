/**
 * SC-P-01 Purchasing Overview — read-only selectors over native Core buying records.
 * Statuses and amounts are Core-owned fields (status, outstanding_amount, grand_total); permission-aware via
 * src/lib/scope.ts; a source the user may not read reports "denied" and contributes no rows.
 */
import type { Doc } from "@/lib/adapter";
import { scopedList } from "@/lib/scope";
import { currentUser } from "@/lib/session";
import { sourceStatus, todayIso, type SourceStatus } from "./finance";
import type { SellingDoc, StatusCount } from "./sellingPro";

const n = (v: unknown) => Number(v) || 0;
const r2 = (x: number) => Math.round(x * 100) / 100;

export interface PurchasingOverview {
  company: string; currency: string;
  requests: { status: SourceStatus; pending: number; rows: SellingDoc[] };
  orders: { status: SourceStatus; byStatus: StatusCount[]; toReceive: StatusCount; toBill: StatusCount };
  invoices: { status: SourceStatus; outstanding: number; overdueCount: number; overdueAmount: number };
  topSuppliers: { status: SourceStatus; rows: { supplier: string; outstanding: number }[] };
  recent: SellingDoc[];
}

const coOk = (d: Doc, company: string) => !company || !d["company"] || d["company"] === company;
const sup = (d: Doc) => String(d["supplier"] ?? "");
const sum = (xs: StatusCount[], s: string): StatusCount => ({ status: s, count: xs.reduce((a, x) => a + x.count, 0), amount: r2(xs.reduce((a, x) => a + x.amount, 0)) });

export function purchasingOverview(company: string, currency: string, user = currentUser()): PurchasingOverview {
  const t = todayIso();

  const mStatus = sourceStatus("Material Request", user);
  const mrs = mStatus === "ok" ? scopedList("Material Request", user).filter((d) => coOk(d, company) && n(d.docstatus) === 1) : [];
  const pending = mrs.filter((d) => ["Pending", "Partially Ordered"].includes(String(d["status"])))
    .map((d) => ({ doctype: "Material Request", name: d.name, date: String(d["schedule_date"] ?? d["transaction_date"] ?? ""), party: String(d["material_request_type"] ?? ""), status: String(d["status"]), amount: 0 }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const oStatus = sourceStatus("Purchase Order", user);
  const orders = oStatus === "ok" ? scopedList("Purchase Order", user).filter((d) => coOk(d, company) && n(d.docstatus) === 1) : [];
  const byStatus = new Map<string, StatusCount>();
  for (const d of orders) {
    const s = String(d["status"] ?? "");
    const c = byStatus.get(s) ?? { status: s, count: 0, amount: 0 };
    c.count += 1; c.amount = r2(c.amount + n(d["grand_total"])); byStatus.set(s, c);
  }
  const b = (s: string) => byStatus.get(s) ?? { status: s, count: 0, amount: 0 };

  const iStatus = sourceStatus("Purchase Invoice", user);
  const invs = iStatus === "ok" ? scopedList("Purchase Invoice", user).filter((d) => coOk(d, company) && n(d.docstatus) === 1) : [];
  const openInv = invs.filter((d) => n(d["outstanding_amount"]) > 0);
  const overdue = openInv.filter((d) => d["due_date"] && String(d["due_date"]) < t);
  const per = new Map<string, number>();
  for (const d of openInv) per.set(sup(d), r2((per.get(sup(d)) ?? 0) + n(d["outstanding_amount"])));

  const recent: SellingDoc[] = [
    ...orders.map((d) => ({ doctype: "Purchase Order", name: d.name, date: String(d["transaction_date"] ?? ""), party: sup(d), status: String(d["status"] ?? ""), amount: r2(n(d["grand_total"])) })),
    ...invs.map((d) => ({ doctype: "Purchase Invoice", name: d.name, date: String(d["posting_date"] ?? ""), party: sup(d), status: String(d["status"] ?? ""), amount: r2(n(d["grand_total"])), outstanding: r2(n(d["outstanding_amount"])) })),
  ].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8);

  return {
    company, currency,
    requests: { status: mStatus, pending: pending.length, rows: pending.slice(0, 8) },
    // Core PO statuses: "To Receive and Bill" counts toward both buckets, as in ERPNext.
    orders: { status: oStatus, byStatus: [...byStatus.values()].sort((a, b) => b.amount - a.amount),
      toReceive: sum([b("To Receive and Bill"), b("To Receive")], "To Receive"), toBill: sum([b("To Receive and Bill"), b("To Bill")], "To Bill") },
    invoices: { status: iStatus, outstanding: r2(openInv.reduce((s, d) => s + n(d["outstanding_amount"]), 0)), overdueCount: overdue.length, overdueAmount: r2(overdue.reduce((s, d) => s + n(d["outstanding_amount"]), 0)) },
    topSuppliers: { status: iStatus, rows: [...per.entries()].map(([supplier, outstanding]) => ({ supplier, outstanding })).sort((a, b) => b.outstanding - a.outstanding).slice(0, 5) },
    recent,
  };
}
