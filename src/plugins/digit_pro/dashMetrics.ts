/**
 * One metric registry for the six DIGIT Pro dashboards (Main + 5 departments). Each KPI declares its source
 * DocType, Core fields and the native list/screen it opens, so dashboards and the Reports Center read the same
 * definition. Values are sums/counts of Core-owned fields only (outstanding_amount, grand_total, Bin.stock_value,
 * GL debit/credit, Depreciation Schedule rows) — no derived accounting, stock valuation or depreciation.
 */
import type { Doc } from "@/lib/adapter";
import { scopedList } from "@/lib/scope";
import { currentUser } from "@/lib/session";
import { sourceStatus, todayIso, type SourceStatus } from "./finance";

const n = (v: unknown) => Number(v) || 0;
const r2 = (x: number) => Math.round(x * 100) / 100;
const s = (v: unknown) => String(v ?? "");
export type DashId = "accounting" | "selling" | "purchasing" | "inventory" | "assets";
export interface KpiLink { kind: "list"; doctype: string; filters?: [string, string, string | number | string[]][] }
export interface KpiProLink { kind: "pro"; to: string; search?: Record<string, string> }
export interface Kpi { id: string; label: string; source: string; definition: string; status: SourceStatus; value: number; money: boolean; count?: number; tone?: "bad" | "warn" | undefined; open: KpiLink | KpiProLink }
export interface Trend { label: string; source: string; definition: string; status: SourceStatus; months: string[]; series: { label: string; values: number[]; open?: TrendOpen }[] }
/** Bar drill-down: native list filtered to the bar's month on dateField (plus series filters). */
export interface TrendOpen { doctype: string; dateField: string; filters?: [string, string, string | number | string[]][]; pro?: string }
export interface DeptDash { kpis: Kpi[]; trend: Trend }

export function lastMonths(today: string, k = 6): string[] {
  const [y, m] = today.split("-").map(Number) as [number, number];
  return Array.from({ length: k }, (_, i) => { const d = new Date(Date.UTC(y, m - 1 - (k - 1 - i), 1)); return d.toISOString().slice(0, 7); });
}
const mon = (d: Doc, f = "posting_date") => s(d[f]).slice(0, 7);
function src(dt: string, company: string, user: string, f: (d: Doc) => boolean = () => true): { status: SourceStatus; rows: Doc[] } {
  const st = sourceStatus(dt, user);
  return { status: st, rows: st === "ok" ? scopedList(dt, user).filter((d) => (!company || d["company"] === undefined || d["company"] === company) && f(d)) : [] };
}
const sub = (d: Doc) => n(d.docstatus) === 1;
const sum = (rows: Doc[], f: string) => r2(rows.reduce((t, d) => t + n(d[f]), 0));
/** Month series: sums field over rows grouped by month of dateField. */
export function series(rows: Doc[], months: string[], field: string, dateField = "posting_date"): number[] {
  return months.map((m) => r2(rows.filter((d) => mon(d, dateField) === m).reduce((t, d) => t + n(d[field]), 0)));
}

export function deptDash(id: DashId, company: string, user = currentUser(), today = todayIso(), period = 6): DeptDash {
  const dashboard = buildDeptDash(id, company, user, today, period);
  if (!company) return dashboard;
  return { ...dashboard,
    kpis: dashboard.kpis.map((k) => ({ ...k, open: k.open.kind === "pro"
      ? { ...k.open, search: { ...k.open.search, company } }
      : { ...k.open, filters: [...(k.open.filters ?? []), ["company", "=", company]] } })),
    trend: { ...dashboard.trend, series: dashboard.trend.series.map((sr) => sr.open
      ? { ...sr, open: { ...sr.open, filters: [...(sr.open.filters ?? []), ["company", "=", company]] } }
      : sr) },
  };
}

function buildDeptDash(id: DashId, company: string, user: string, today: string, period: number): DeptDash {
  const months = lastMonths(today, period); const thisMonth = today.slice(0, 7);
  const monthStart = `${thisMonth}-01`;
  const monthEnd = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 0)).toISOString().slice(0, 10);
  const k = (x: Omit<Kpi, "money"> & { money?: boolean }): Kpi => ({ money: true, ...x });
  if (id === "selling" || id === "accounting") {
    const si = src("Sales Invoice", company, user, sub); const pi = src("Purchase Invoice", company, user, sub);
    const open = si.rows.filter((d) => n(d["outstanding_amount"]) > 0); const od = open.filter((d) => s(d["due_date"]) < today);
    if (id === "selling") {
      const so = src("Sales Order", company, user, (d) => sub(d) && ["To Deliver and Bill", "To Deliver", "To Bill"].includes(s(d["status"])));
      const qt = src("Quotation", company, user, (d) => sub(d) && d["status"] === "Open");
      const sales = si.rows.filter((d) => !n(d["is_return"]));
      return { kpis: [
        k({ id: "invoiced_month", label: "Invoiced this month", source: "Sales Invoice.grand_total", definition: "Submitted, non-return sales invoices posted this month.", status: si.status, value: sum(sales.filter((d) => mon(d) === thisMonth), "grand_total"), open: { kind: "list", doctype: "Sales Invoice", filters: [["docstatus", "=", 1], ["is_return", "=", 0], ["posting_date", ">=", monthStart], ["posting_date", "<=", monthEnd]] } }),
        k({ id: "open_orders", label: "Open sales orders", source: "Sales Order.grand_total", definition: "Submitted orders still to deliver and/or bill.", status: so.status, value: sum(so.rows, "grand_total"), count: so.rows.length, open: { kind: "list", doctype: "Sales Order", filters: [["docstatus", "=", 1], ["status", "in", ["To Deliver and Bill", "To Deliver", "To Bill"]]] } }),
        k({ id: "open_quotes", label: "Open quotations", source: "Quotation.grand_total", definition: "Submitted quotations with status Open.", status: qt.status, value: sum(qt.rows, "grand_total"), count: qt.rows.length, open: { kind: "list", doctype: "Quotation", filters: [["status", "=", "Open"]] } }),
        k({ id: "overdue", label: "Overdue receivables", source: "Sales Invoice.outstanding_amount", definition: "Outstanding on submitted invoices past due date.", status: si.status, value: sum(od, "outstanding_amount"), count: od.length, tone: od.length ? "bad" : undefined, open: { kind: "pro", to: "/pro/collections", search: { bucket: "overdue" } } }),
      ], trend: { label: "Monthly sales", source: "Sales Invoice.grand_total by posting_date", definition: "Submitted sales invoices; returns shown separately.", status: si.status, months,
        series: [{ label: "Invoiced", open: { doctype: "Sales Invoice", dateField: "posting_date", filters: [["docstatus", "=", 1], ["is_return", "=", 0]] }, values: series(sales, months, "grand_total") }, { label: "Returns", open: { doctype: "Sales Invoice", dateField: "posting_date", filters: [["docstatus", "=", 1], ["is_return", "=", 1]] }, values: series(si.rows.filter((d) => n(d["is_return"])), months, "grand_total").map(Math.abs) }] } };
    }
    const pe = src("Payment Entry", company, user, sub);
    const banks = new Set(src("Account", company, user, (a) => ["Bank", "Cash"].includes(s(a["account_type"]))).rows.map((a) => a.name));
    const gl = src("GL Entry", company, user, (g) => !n(g["is_cancelled"]) && banks.has(s(g["account"])));
    const popen = pi.rows.filter((d) => n(d["outstanding_amount"]) > 0);
    const je = src("Journal Entry", company, user, (d) => n(d.docstatus) === 0);
    return { kpis: [
      k({ id: "cash", label: "Cash and bank", source: "GL Entry.debit − credit on Bank/Cash accounts", definition: "Posted balance of accounts with type Bank or Cash.", status: gl.status, value: r2(sum(gl.rows, "debit") - sum(gl.rows, "credit")), open: { kind: "pro", to: "/pro/general-ledger" } }),
      k({ id: "receivable", label: "Receivable", source: "Sales Invoice.outstanding_amount", definition: "Positive outstanding on submitted sales invoices; overpaid invoices with a credit balance are excluded.", status: si.status, value: sum(open, "outstanding_amount"), count: open.length, open: { kind: "pro", to: "/pro/receivables" } }),
      k({ id: "payable", label: "Payable", source: "Purchase Invoice.outstanding_amount", definition: "Positive outstanding on submitted purchase invoices; overpaid invoices with a debit balance are excluded.", status: pi.status, value: sum(popen, "outstanding_amount"), count: popen.length, open: { kind: "pro", to: "/pro/payables" } }),
      k({ id: "draft_je", label: "Draft journal entries", source: "Journal Entry.docstatus = 0", definition: "Journal entries saved but not submitted.", status: je.status, value: je.rows.length, money: false, tone: je.rows.length ? "warn" : undefined, open: { kind: "list", doctype: "Journal Entry", filters: [["docstatus", "=", 0]] } }),
    ], trend: { label: "Cash in and out", source: "Payment Entry.base_paid_amount by posting_date", definition: "Submitted payment entries: Receive vs Pay.", status: pe.status, months,
      series: [{ label: "Received", open: { doctype: "Payment Entry", dateField: "posting_date", filters: [["docstatus", "=", 1], ["payment_type", "=", "Receive"]] }, values: series(pe.rows.filter((d) => d["payment_type"] === "Receive"), months, "base_paid_amount") }, { label: "Paid", open: { doctype: "Payment Entry", dateField: "posting_date", filters: [["docstatus", "=", 1], ["payment_type", "=", "Pay"]] }, values: series(pe.rows.filter((d) => d["payment_type"] === "Pay"), months, "base_paid_amount") }] } };
  }
  if (id === "purchasing") {
    const pi = src("Purchase Invoice", company, user, sub); const po = src("Purchase Order", company, user, (d) => sub(d) && ["To Receive and Bill", "To Receive", "To Bill"].includes(s(d["status"])));
    const mr = src("Material Request", company, user, (d) => sub(d) && d["status"] === "Pending"); const popen = pi.rows.filter((d) => n(d["outstanding_amount"]) > 0);
    const od = popen.filter((d) => s(d["due_date"]) < today); const buys = pi.rows.filter((d) => !n(d["is_return"]));
    return { kpis: [
      k({ id: "billed_month", label: "Billed this month", source: "Purchase Invoice.grand_total", definition: "Submitted, non-return purchase invoices posted this month.", status: pi.status, value: sum(buys.filter((d) => mon(d) === thisMonth), "grand_total"), open: { kind: "list", doctype: "Purchase Invoice", filters: [["docstatus", "=", 1], ["is_return", "=", 0], ["posting_date", ">=", monthStart], ["posting_date", "<=", monthEnd]] } }),
      k({ id: "open_po", label: "Open purchase orders", source: "Purchase Order.grand_total", definition: "Submitted orders still to receive and/or bill.", status: po.status, value: sum(po.rows, "grand_total"), count: po.rows.length, open: { kind: "list", doctype: "Purchase Order", filters: [["docstatus", "=", 1], ["status", "in", ["To Receive and Bill", "To Receive", "To Bill"]]] } }),
      k({ id: "pending_mr", label: "Pending material requests", source: "Material Request.status = Pending", definition: "Submitted requests not yet ordered.", status: mr.status, value: mr.rows.length, money: false, tone: mr.rows.length ? "warn" : undefined, open: { kind: "list", doctype: "Material Request", filters: [["status", "=", "Pending"]] } }),
      k({ id: "overdue_pay", label: "Overdue payables", source: "Purchase Invoice.outstanding_amount", definition: "Outstanding on submitted purchase invoices past due date.", status: pi.status, value: sum(od, "outstanding_amount"), count: od.length, tone: od.length ? "bad" : undefined, open: { kind: "pro", to: "/pro/payables", search: { overdue: "1" } } }),
    ], trend: { label: "Monthly purchases", source: "Purchase Invoice.grand_total by posting_date", definition: "Submitted purchase invoices; returns shown separately.", status: pi.status, months,
      series: [{ label: "Billed", open: { doctype: "Purchase Invoice", dateField: "posting_date", filters: [["docstatus", "=", 1], ["is_return", "=", 0]] }, values: series(buys, months, "grand_total") }, { label: "Returns", open: { doctype: "Purchase Invoice", dateField: "posting_date", filters: [["docstatus", "=", 1], ["is_return", "=", 1]] }, values: series(pi.rows.filter((d) => n(d["is_return"])), months, "grand_total").map(Math.abs) }] } };
  }
  if (id === "inventory") {
    const bin = src("Bin", "", user); const whs = new Set(src("Warehouse", company, user).rows.map((w) => w.name));
    const bins = bin.rows.filter((b) => !company || whs.has(s(b["warehouse"])));
    const neg = bins.filter((b) => n(b["projected_qty"]) < 0);
    const sle = src("Stock Ledger Entry", company, user, (e) => !n(e["is_cancelled"]));
    const se = src("Stock Entry", company, user, (d) => n(d.docstatus) === 0);
    return { kpis: [
      // Round 1 X05: the card states the Stock Balance report figure (posted Stock Ledger value), not the Bin snapshot
      k({ id: "stock_value", label: "Stock value", source: "Stock Ledger Entry.stock_value_difference", definition: "Posted stock ledger value of the company's warehouses — the Stock Balance report total.", status: sle.status, value: Math.round(sle.rows.filter((e) => !company || whs.has(s(e["warehouse"]))).reduce((x, e) => x + (Number(e["stock_value_difference"]) || 0), 0) * 100) / 100, open: { kind: "pro", to: "/pro/stock-balance" } }),
      k({ id: "items_held", label: "Items in stock", source: "Bin.actual_qty > 0", definition: "Item–warehouse pairs with stock on hand.", status: bin.status, value: bins.filter((b) => n(b["actual_qty"]) > 0).length, money: false, open: { kind: "pro", to: "/pro/stock-balance" } }),
      k({ id: "short", label: "Short (projected < 0)", source: "Bin.projected_qty", definition: "Item–warehouse pairs whose projected quantity is below zero.", status: bin.status, value: neg.length, money: false, tone: neg.length ? "bad" : undefined, open: { kind: "list", doctype: "Bin", filters: [["projected_qty", "<", 0]] } }),
      k({ id: "draft_se", label: "Draft stock entries", source: "Stock Entry.docstatus = 0", definition: "Stock entries saved but not submitted.", status: se.status, value: se.rows.length, money: false, tone: se.rows.length ? "warn" : undefined, open: { kind: "list", doctype: "Stock Entry", filters: [["docstatus", "=", 0]] } }),
    ], trend: { label: "Stock movement value", source: "Stock Ledger Entry.stock_value_difference by posting_date", definition: "Posted value of stock received vs issued per month.", status: sle.status, months,
      series: [{ label: "In", open: { doctype: "Stock Ledger Entry", dateField: "posting_date", filters: [["docstatus", "=", 1], ["actual_qty", ">", 0]] }, values: series(sle.rows.filter((e) => n(e["stock_value_difference"]) > 0), months, "stock_value_difference") }, { label: "Out", open: { doctype: "Stock Ledger Entry", dateField: "posting_date", filters: [["docstatus", "=", 1], ["actual_qty", "<", 0]] }, values: series(sle.rows.filter((e) => n(e["stock_value_difference"]) < 0), months, "stock_value_difference").map(Math.abs) }] } };
  }
  const as = src("Asset", company, user, sub);
  const ads = src("Asset Depreciation Schedule", company, user, sub);
  const rowsAll = ads.rows.flatMap((d) => (Array.isArray(d["depreciation_schedule"]) ? (d["depreciation_schedule"] as Doc[]) : []));
  const soon = new Date(Date.parse(today) + 30 * 864e5).toISOString().slice(0, 10);
  const due = rowsAll.filter((r) => !r["journal_entry"] && s(r["schedule_date"]) <= soon);
  const maint = as.rows.filter((a) => ["In Maintenance", "Out of Order"].includes(s(a["status"])));
  return { kpis: [
    k({ id: "cost", label: "Asset cost", source: "Asset.net_purchase_amount", definition: "Purchase cost of submitted assets (gross_purchase_amount on v15).", status: as.status, value: r2(as.rows.reduce((t, a) => t + n(a["net_purchase_amount"] ?? a["gross_purchase_amount"]), 0)), count: as.rows.length, open: { kind: "list", doctype: "Asset", filters: [["docstatus", "=", 1]] } }),
    k({ id: "book", label: "Book value", source: "Asset.value_after_depreciation", definition: "Value after depreciation as stored on each asset.", status: as.status, value: sum(as.rows, "value_after_depreciation"), open: { kind: "pro", to: "/pro/assets-overview" } }),
    k({ id: "dep_due", label: "Depreciation due (30 days)", source: "Depreciation Schedule.depreciation_amount", definition: "Unbooked schedule rows dated within the next 30 days or earlier.", status: ads.status, value: r2(due.reduce((t, r) => t + n(r["depreciation_amount"]), 0)), count: due.length, tone: due.length ? "warn" : undefined, open: { kind: "pro", to: "/pro/depreciation", search: { state: "unbooked", to: soon } } }),
    k({ id: "maint", label: "In maintenance / out of order", source: "Asset.status", definition: "Submitted assets with status In Maintenance or Out of Order.", status: as.status, value: maint.length, money: false, tone: maint.length ? "bad" : undefined, open: { kind: "list", doctype: "Asset", filters: [["docstatus", "=", 1], ["status", "in", ["In Maintenance", "Out of Order"]]] } }),
  ], trend: { label: "Depreciation by month", source: "Depreciation Schedule.depreciation_amount by schedule_date", definition: "Scheduled depreciation per month from submitted schedules.", status: ads.status, months,
    series: [{ label: "Scheduled", open: { doctype: "Asset Depreciation Schedule", dateField: "schedule_date", pro: "/pro/depreciation" }, values: series(rowsAll, months, "depreciation_amount", "schedule_date") }] } };
}
