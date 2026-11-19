/**
 * DIGIT Pro department dashboard contract (digit_pro/dashboards.py, R5-1) and the V9.2 dash92 boards (digit_pro/dash92.py:
 * the six Executive CFO boards cfo-01..06 and the four Accounting boards acc-ops/dues/cash/report), evaluated over the
 * permission-scoped adapter records of the Virtual Core.
 *
 * Definitions are NOT written here: proDashboards.generated.json is extracted from the original source archive by
 * scripts/extract-pro-dashboards.py (metric contracts with their Arabic definitions, department questions, report lists,
 * board block outlines with span and provenance). This module only evaluates them with the same predicates the native
 * lists use (desk.matchFilter through sections.ts), so every figure equals the rows its drill opens. A source the reader
 * cannot read is DENIED (never 0); a capability without its setup is NOT_CONFIGURED. Nothing here writes records.
 * Frappe adapter targets: digit_pro.dashboards.get_department_dashboard and digit_pro.dash92.get_dashboard.
 */
import raw from "./proDashboards.generated.json";
import type { Doc } from "@/lib/adapter";
import { matchFilter, type Filter } from "@/lib/desk";
import { scopedList } from "@/lib/scope";
import { currentUser } from "@/lib/session";
import { allDimensions } from "@/lib/dimensions";
import { financeContext, sourceStatus, todayIso, type SourceStatus } from "./finance";
import { aging } from "./aging";
import { blockerSummary, closeBlockers, type Blocker } from "./closeReview";
import { threeWay } from "./procurementCommand";
import { addDaysIso, evalChart, isLinkField, evalKpi, evalQueue, listDrill, monthsBack, sectionCtx, type ChartDef, type ChartResult, type KpiDef, type KpiResult, type QueueDef, type QueueResult, type SectionCtx } from "./sections";
import type { Bi, Drill } from "./command";

const n = (v: unknown) => (typeof v === "number" ? v : Number(v) || 0);
const r2 = (v: number) => Math.round(v * 100) / 100;
const s10 = (v: unknown) => String(v ?? "").slice(0, 10);
const monthEnd = (ym: string) => { const [y, m] = ym.split("-").map(Number) as [number, number]; return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); };

/* ------------------------------------------------------------------ generated contract ------------------------------------------------------------------ */
export type DeptKey = "finance" | "selling" | "purchasing" | "inventory" | "assets";
export const DEPT_KEYS: DeptKey[] = ["finance", "selling", "purchasing", "inventory", "assets"];
export interface MetricDef {
  metric_id: string; department: DeptKey; title_en: string; title_ar: string; business_meaning: string; formula: string; native_source: string; role: string; period: string; date_basis: string; unit: string;
  exclusions: string; source_route: string; drill_action: string; empty_state: string; kind: "metric" | "insight"; test_id: string;
  business_meaning_ar: string | null; formula_ar: string | null; native_source_ar: string | null; period_ar: string | null; exclusions_ar: string | null;
}
export interface DeptContract { route: string; question: Bi; metrics: MetricDef[]; reports: [string, string][]; work: [string, Record<string, unknown>][] }
type RawFilter = [string, string, unknown];
export interface RawBlock { type: string; span: number; source: Bi; label?: Bi; part?: string; metric?: string; party_type?: "Customer" | "Supplier"; report?: string; items?: unknown[]; spec?: Record<string, unknown>; series?: Record<string, unknown>[]; doctype?: string; base?: RawFilter[]; states?: [Bi, RawFilter[]][] }
export interface BoardDef { title: Bi; blocks: RawBlock[] }
const DATA = raw as unknown as { source: string; departments: Record<DeptKey, DeptContract>; dash92: Record<string, BoardDef> };
export const DEPT_CONTRACTS = DATA.departments;
export const BOARDS = DATA.dash92;
export const CFO_KEYS = ["cfo-01", "cfo-02", "cfo-03", "cfo-04", "cfo-05", "cfo-06"] as const;
export const ACC_BOARD: Record<string, string> = { "ACC-OPS": "acc-ops", "ACC-DUES": "acc-dues", "ACC-CASH": "acc-cash", "ACC-REPORT": "acc-report" };
export const NAV_DEPT: Record<string, DeptKey> = { accounting: "finance", selling: "selling", purchasing: "purchasing", inventory: "inventory", assets: "assets" };

/* ------------------------------------------------------------------ routes → in-app drills ------------------------------------------------------------------ */
const titleOf = (slugv: string) => slugv.split("_").map((w) => (w ? w[0]!.toUpperCase() + w.slice(1) : w)).join(" ");
/** A source route (/digit/...) as a DIGIT drill: native lists stay lists, reports open in the hosted report runner. */
export function routeDrill(route: string, company: string): Drill {
  const [path = "", query = ""] = route.replace(/^\/digit/, "").split("?");
  const q = Object.fromEntries(new URLSearchParams(query));
  const list = /^\/app\/erpnext\/([a-z_]+)$/.exec(path);
  if (list) return listDrill(titleOf(list[1]!), [["company", "=", company], ...Object.entries(q).map(([k, v]) => [k, "=", v] as Filter)]);
  const rep = /^\/report\/(.+)$/.exec(path);
  if (rep) return { kind: "report", name: decodeURIComponent(rep[1]!), filters: { company } };
  return { kind: "pro", to: path, search: { company, ...q } };
}
const glDrill = (company: string, accounts: string[], from: string, to: string): Drill => ({ kind: "pro", to: "/pro/general-ledger", search: { company, from_date: from, to_date: to, account: accounts.length === 1 ? accounts[0] : JSON.stringify(accounts) } });

/* ------------------------------------------------------------------ department metrics (dashboards.compute) ------------------------------------------------------------------ */
export type MState = "OK" | "DENIED" | "NOT_CONFIGURED" | "NO_DATA" | "UNAVAILABLE";
export interface MSeries { labels: string[]; values: number[]; drills?: Drill[] }
export interface MetricValue { state: MState; value: number | null; count?: number | undefined; series?: MSeries | undefined; buckets?: Record<string, { state: MState; buckets: number[] }> | undefined; groups?: { label: string; value: number; drill: Drill }[] | undefined; detail?: Record<string, number | string> | undefined; note?: Bi | undefined; drill: Drill }
export interface MetricCtx { company: string; asOf: string; currency: string; fy?: [string, string] | undefined; user: string }

const deny = (st: SourceStatus): MState => (st === "denied" ? "DENIED" : "UNAVAILABLE");
function readable(user: string, ...dts: string[]): MState | null {
  for (const dt of dts) { const st = sourceStatus(dt, user); if (st !== "ok") return deny(st); }
  return null;
}
const rowsOf = (dt: string, fs: Filter[], user: string) => scopedList(dt, user).filter((d) => fs.every((f) => matchFilter(d, f)));
function agg(dt: string, fs: Filter[], user: string, field?: string): [number, number] {
  const rows = rowsOf(dt, fs, user);
  return [rows.length, r2(field ? rows.reduce((t, d) => t + n(d[field]), 0) : 0)];
}
function cnt(dt: string, fs: Filter[], c: MetricCtx, field?: string): MetricValue {
  const drill = listDrill(dt, fs);
  const bad = readable(c.user, dt); if (bad) return { state: bad, value: null, drill };
  const [k, sum] = agg(dt, fs, c.user, field);
  return { state: "OK", value: field ? sum : k, count: k, drill };
}
const accountsOf = (company: string, types: string[], user: string) => scopedList("Account", user).filter((a) => a["company"] === company && !n(a["is_group"]) && types.includes(String(a["account_type"] ?? ""))).map((a) => a.name);
function glBalance(c: MetricCtx, types: string[], trend = false): MetricValue {
  const fallback: Drill = { kind: "pro", to: "/pro/general-ledger", search: { company: c.company } };
  const bad = readable(c.user, "GL Entry", "Account"); if (bad) return { state: bad, value: null, drill: fallback };
  const accs = accountsOf(c.company, types, c.user);
  if (!accs.length) return { state: "NOT_CONFIGURED", value: null, note: ["No ledger account of this type exists.", "لا يوجد حساب أستاذ من هذا النوع."], drill: fallback };
  const set = new Set(accs);
  const gl = scopedList("GL Entry", c.user).filter((g) => g["company"] === c.company && !n(g["is_cancelled"]) && set.has(String(g["account"])) && s10(g["posting_date"]) <= c.asOf);
  const start = c.fy?.[0] ?? `${c.asOf.slice(0, 4)}-01-01`;
  if (!trend) return { state: "OK", value: r2(gl.reduce((t, g) => t + n(g["debit"]) - n(g["credit"]), 0)), detail: { accounts: accs.length }, drill: glDrill(c.company, accs, start, c.asOf) };
  const months = monthsBack(c.asOf, 12);
  const values = months.map((m) => r2(gl.filter((g) => s10(g["posting_date"]).slice(0, 7) === m).reduce((t, g) => t + n(g["debit"]) - n(g["credit"]), 0)));
  const drills = months.map((m) => glDrill(c.company, accs, `${m}-01`, monthEnd(m) < c.asOf ? monthEnd(m) : c.asOf));
  return { state: "OK", value: r2(values.reduce((a, b) => a + b, 0)), series: { labels: months, values, drills }, drill: glDrill(c.company, accs, `${months[0]}-01`, c.asOf) };
}
function overdue(c: MetricCtx, dt: "Sales Invoice" | "Purchase Invoice", soon = false): MetricValue {
  const fs: Filter[] = [["company", "=", c.company], ["docstatus", "=", 1], ["outstanding_amount", ">", 0], ...(soon ? [["due_date", ">=", c.asOf], ["due_date", "<=", addDaysIso(c.asOf, 14)]] as Filter[] : [["due_date", "<", c.asOf]] as Filter[])];
  return cnt(dt, fs, c, "outstanding_amount");
}
function assetsValue(mid: string, c: MetricCtx, drill: Drill): MetricValue {
  const bad = readable(c.user, "Asset"); if (bad) return { state: bad, value: null, drill };
  const assets = scopedList("Asset", c.user).filter((a) => a["company"] === c.company && n(a.docstatus) === 1 && !["Sold", "Scrapped"].includes(String(a["status"])));
  const cost = r2(assets.reduce((t, a) => t + n(a["net_purchase_amount"] ?? a["gross_purchase_amount"]), 0));
  if (mid === "AST.COST") return { state: "OK", value: cost, count: assets.length, drill };
  if (mid === "AST.BY_CATEGORY") {
    const by = new Map<string, number>(); for (const a of assets) { const k = String(a["asset_category"] || "—"); by.set(k, r2((by.get(k) ?? 0) + n(a["net_purchase_amount"] ?? a["gross_purchase_amount"]))); }
    return { state: "OK", value: cost, count: assets.length, groups: [...by].sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value, drill: listDrill("Asset", [["company", "=", c.company], ["docstatus", "=", 1], ["asset_category", "=", label]]) })), drill };
  }
  const bad2 = readable(c.user, "Asset Depreciation Schedule"); if (bad2) return { state: bad2, value: null, drill };
  const ids = new Set(assets.map((a) => a.name));
  const rows = scopedList("Asset Depreciation Schedule", c.user).filter((s) => ids.has(String(s["asset"])) && n(s.docstatus) === 1).flatMap((s) => ((s["depreciation_schedule"] as Doc[] | undefined) ?? []));
  const isPosted = (r: Doc) => !!r["journal_entry"] && r["journal_entry"] !== "preview";
  const posted = r2(rows.filter(isPosted).reduce((t, r) => t + n(r["depreciation_amount"]), 0));
  const opening = r2(assets.reduce((t, a) => t + n(a["opening_accumulated_depreciation"]), 0));
  if (mid === "AST.DEP_POSTED") return { state: "OK", value: r2(opening + posted), detail: { opening_accumulated: opening, posted_through_journal_entries: posted }, drill };
  if (mid === "AST.NBV") return { state: "OK", value: r2(cost - opening - posted), detail: { cost, accumulated_posted: r2(opening + posted) }, drill };
  const due = rows.filter((r) => !isPosted(r) && s10(r["schedule_date"]) <= c.asOf);
  return { state: "OK", value: r2(due.reduce((t, r) => t + n(r["depreciation_amount"]), 0)), count: due.length, drill };
}

/** ACTUAL_VALUE of one department metric (port of digit_pro.dashboards.compute). */
export function metricValue(def: MetricDef, c: MetricCtx): MetricValue {
  const mid = def.metric_id, co = c.company, t = c.asOf;
  const drill = routeDrill(def.source_route, co);
  const CO: Filter = ["company", "=", co], SUB: Filter = ["docstatus", "=", 1];
  switch (mid) {
    case "FIN.CASH_BANK": return glBalance(c, ["Cash", "Bank"]);
    case "FIN.CASH_TREND": return glBalance(c, ["Cash", "Bank"], true);
    case "FIN.AR_OVERDUE": case "SEL.AR_OVERDUE": return overdue(c, "Sales Invoice");
    case "FIN.AP_DUE_SOON": case "PUR.AP_DUE_SOON": return overdue(c, "Purchase Invoice", true);
    case "FIN.AP_OVERDUE": return overdue(c, "Purchase Invoice");
    case "FIN.CLOSE_BLOCKERS": {
      const from = c.fy?.[0] ?? `${t.slice(0, 4)}-01-01`;
      const sum = blockerSummary(closeBlockers(co, from, t, c.user, t));
      if (!sum.open && !sum.clear) return { state: "DENIED", value: null, drill };
      return { state: "OK", value: sum.open, detail: { clear: sum.clear, restricted: sum.restricted }, drill: { kind: "pro", to: "/pro/period-control", search: { company: co } } };
    }
    case "FIN.JE_DRAFT": return cnt("Journal Entry", [CO, ["docstatus", "=", 0]], c);
    case "FIN.BANK_UNMATCHED": {
      const bad = readable(c.user, "Bank Account", "Bank Transaction"); if (bad) return { state: bad, value: null, drill };
      if (!scopedList("Bank Account", c.user).some((b) => b["company"] === co && n(b["is_company_account"]))) return { state: "NOT_CONFIGURED", value: null, note: ["No company bank account is set up.", "لا يوجد حساب بنكي للشركة."], drill };
      return { ...cnt("Bank Transaction", [CO, SUB, ["status", "not in", ["Reconciled", "Settled", "Cancelled"]]], c), drill: { kind: "pro", to: "/pro/bank-reconciliation", search: { company: co } } };
    }
    case "FIN.AGING": {
      const out: Record<string, { state: MState; buckets: number[] }> = {};
      for (const side of ["receivable", "payable"] as const) {
        const a = aging(side, co, c.user);
        out[side === "receivable" ? "Customer" : "Supplier"] = a.status === "ok" ? { state: "OK", buckets: a.totals.map(r2) } : { state: deny(a.status), buckets: [] };
      }
      return { state: Object.values(out).every((x) => x.state !== "OK") ? "DENIED" : "OK", value: null, buckets: out, drill };
    }
    case "SEL.QTN_OPEN": return cnt("Quotation", [CO, SUB, ["status", "in", ["Open", "Replied", "Partially Ordered"]]], c, "base_grand_total");
    case "SEL.SO_OPEN": return cnt("Sales Order", [CO, SUB, ["status", "in", ["To Deliver and Bill", "To Deliver", "To Bill"]]], c);
    case "SEL.LATE_DELIVERY": return cnt("Sales Order", [CO, SUB, ["status", "in", ["To Deliver and Bill", "To Deliver"]], ["delivery_date", "<", t]], c);
    case "SEL.DN_TO_BILL": return cnt("Delivery Note", [CO, SUB, ["status", "=", "To Bill"]], c);
    case "SEL.RETURNS_DRAFT": {
      const bad = readable(c.user, "Sales Invoice", "Delivery Note"); if (bad) return { state: bad, value: null, drill };
      const fs: Filter[] = [CO, ["docstatus", "=", 0], ["is_return", "=", 1]];
      const a = agg("Sales Invoice", fs, c.user)[0], b = agg("Delivery Note", fs, c.user)[0];
      return { state: "OK", value: a + b, count: a + b, detail: { "Sales Invoice": a, "Delivery Note": b }, drill: listDrill("Sales Invoice", fs) };
    }
    case "SEL.CONVERSION": {
      const bad = readable(c.user, "Quotation"); if (bad) return { state: bad, value: null, drill };
      if (!c.fy) return { state: "NOT_CONFIGURED", value: null, note: ["No fiscal year covers today.", "لا توجد سنة مالية تغطي اليوم."], drill };
      const base: Filter[] = [CO, SUB, ["transaction_date", "between", [c.fy[0], c.fy[1]]]];
      const sub = agg("Quotation", base, c.user)[0], ordered = agg("Quotation", [...base, ["status", "in", ["Ordered", "Partially Ordered"]]], c.user)[0];
      return sub ? { state: "OK", value: Math.round((1000 * ordered) / sub) / 10, count: sub, detail: { numerator: ordered, denominator: sub }, drill: listDrill("Quotation", base) } : { state: "NO_DATA", value: null, count: 0, drill };
    }
    case "SEL.SALES_TREND": {
      const bad = readable(c.user, "Sales Invoice"); if (bad) return { state: bad, value: null, drill };
      const months = monthsBack(t, 12);
      const rows = rowsOf("Sales Invoice", [CO, SUB, ["posting_date", ">=", `${months[0]}-01`], ["posting_date", "<=", t]], c.user);
      const values = months.map((m) => r2(rows.filter((d) => s10(d["posting_date"]).slice(0, 7) === m).reduce((x, d) => x + n(d["base_grand_total"] ?? d["grand_total"]), 0)));
      return { state: "OK", value: r2(values.reduce((a, b) => a + b, 0)), series: { labels: months, values, drills: months.map((m) => listDrill("Sales Invoice", [CO, SUB, ["posting_date", "between", [`${m}-01`, monthEnd(m)]]])) }, drill };
    }
    case "PUR.MR_PENDING": return cnt("Material Request", [CO, SUB, ["status", "in", ["Pending", "Partially Ordered"]]], c);
    case "PUR.RFQ_AWAITING": {
      const bad = readable(c.user, "Request for Quotation"); if (bad) return { state: bad, value: null, drill };
      const rfqs = rowsOf("Request for Quotation", [CO, SUB], c.user);
      const pend = rfqs.filter((r) => ((r["suppliers"] as Doc[] | undefined) ?? []).some((x) => String(x["quote_status"] ?? "Pending") === "Pending"));
      return { state: "OK", value: pend.length, count: pend.length, detail: { submitted_rfqs: rfqs.length }, drill: listDrill("Request for Quotation", [CO, SUB, ["name", "in", pend.map((p) => p.name)]]) };
    }
    case "PUR.PO_OPEN": return { ...cnt("Purchase Order", [CO, SUB, ["status", "in", ["To Receive and Bill", "To Receive", "To Bill"]]], c), drill };
    case "PUR.PO_LATE": return { ...cnt("Purchase Order", [CO, SUB, ["status", "in", ["To Receive and Bill", "To Receive"]], ["schedule_date", "<", t]], c), drill };
    case "PUR.PR_TO_BILL": return cnt("Purchase Receipt", [CO, SUB, ["status", "=", "To Bill"]], c);
    case "PUR.MATCH_EXCEPTIONS": {
      const bad = readable(c.user, "Purchase Invoice", "Purchase Order"); if (bad) return { state: bad, value: null, drill };
      const tw = threeWay(co, c.user, t);
      const pos = [...new Set(tw.rows.filter((r) => r.flag).map((r) => r.po))];
      return { state: "OK", value: pos.length, count: tw.flagged, detail: { lines_flagged: tw.flagged, lines_scanned: tw.rows.length }, drill: listDrill("Purchase Order", [CO, ["name", "in", pos]]) };
    }
    case "PUR.COMMITMENT": {
      const bad = readable(c.user, "Purchase Order"); if (bad) return { state: bad, value: null, drill };
      const pos = rowsOf("Purchase Order", [CO, SUB, ["status", "in", ["To Receive and Bill", "To Receive", "To Bill"]]], c.user);
      const total = r2(pos.reduce((t2, p) => t2 + ((p["items"] as Doc[] | undefined) ?? []).reduce((x, i) => x + (n(i["amount"]) - n(i["billed_amt"])) * (n(p["conversion_rate"]) || 1), 0), 0));
      return { state: "OK", value: total, count: pos.length, drill };
    }
    case "INV.STOCK_VALUE": {
      const bad = readable(c.user, "Stock Ledger Entry"); if (bad) return { state: bad, value: null, drill };
      const sle = agg("Stock Ledger Entry", [CO, ["is_cancelled", "!=", 1], ["posting_date", "<=", t]], c.user, "stock_value_difference")[1];
      const gl = glBalance(c, ["Stock"]);
      const whs = new Set(scopedList("Warehouse", c.user).filter((w) => w["company"] === co && !n(w["is_group"])).map((w) => w.name));
      const bin = r2(scopedList("Bin", c.user).filter((b) => whs.has(String(b["warehouse"]))).reduce((x, b) => x + n(b["stock_value"]), 0));
      const detail: Record<string, number | string> = { stock_ledger: sle, bin_snapshot: bin, gl_stock_accounts: gl.state === "OK" ? gl.value ?? 0 : gl.state };
      if (gl.state === "OK") detail["difference_sle_vs_gl"] = r2(sle - (gl.value ?? 0));
      return { state: "OK", value: sle, detail, drill };
    }
    case "INV.SHORTAGE": case "INV.RESERVED": {
      const bad = readable(c.user, "Bin", "Warehouse"); if (bad) return { state: bad, value: null, drill };
      const whs = scopedList("Warehouse", c.user).filter((w) => w["company"] === co && !n(w["is_group"])).map((w) => w.name);
      if (!whs.length) return { state: "NOT_CONFIGURED", value: null, drill };
      const fs: Filter[] = [["warehouse", "in", whs], mid === "INV.SHORTAGE" ? ["projected_qty", "<", 0] : ["reserved_qty", ">", 0]];
      const k = agg("Bin", fs, c.user)[0];
      return { state: "OK", value: k, count: k, drill: { kind: "report", name: "Stock Projected Qty", filters: { company: co } } };
    }
    case "INV.MOVES_DRAFT": return cnt("Stock Entry", [CO, ["docstatus", "=", 0]], c);
    case "INV.RECON_DRAFT": return cnt("Stock Reconciliation", [CO, ["docstatus", "=", 0]], c);
    case "INV.BATCH_EXPIRY": {
      const bad = readable(c.user, "Batch"); if (bad) return { state: bad, value: null, drill };
      if (!scopedList("Batch", c.user).length) return { state: "NOT_CONFIGURED", value: null, note: ["No batch exists.", "لا توجد دفعات."], drill };
      return cnt("Batch", [["expiry_date", "between", [t, addDaysIso(t, 30)]], ["batch_qty", ">", 0]], c);
    }
    case "INV.VALUE_TREND": {
      const bad = readable(c.user, "Stock Ledger Entry"); if (bad) return { state: bad, value: null, drill };
      const months = monthsBack(t, 12);
      const rows = rowsOf("Stock Ledger Entry", [CO, ["is_cancelled", "!=", 1], ["posting_date", "<=", t]], c.user);
      let acc = r2(rows.filter((r) => s10(r["posting_date"]) < `${months[0]}-01`).reduce((x, r) => x + n(r["stock_value_difference"]), 0));
      const values = months.map((m) => { acc = r2(acc + rows.filter((r) => s10(r["posting_date"]).slice(0, 7) === m).reduce((x, r) => x + n(r["stock_value_difference"]), 0)); return acc; });
      return { state: "OK", value: values.at(-1) ?? 0, series: { labels: months, values, drills: months.map((m) => ({ kind: "pro", to: "/pro/stock-balance", search: { company: co, to_date: monthEnd(m) } }) as Drill) }, drill };
    }
    case "AST.COST": case "AST.DEP_POSTED": case "AST.NBV": case "AST.DEP_DUE": case "AST.BY_CATEGORY": return assetsValue(mid, c, drill);
    case "AST.MOVES_30": return cnt("Asset Movement", [CO, SUB, ["transaction_date", ">=", addDaysIso(t, -30)]], c);
    case "AST.MAINT_DUE": {
      const bad = readable(c.user, "Asset Maintenance"); if (bad) return { state: bad, value: null, drill };
      const am = scopedList("Asset Maintenance", c.user).filter((a) => a["company"] === co);
      if (!am.length) return { state: "NOT_CONFIGURED", value: null, note: ["No asset maintenance is set up.", "لا توجد صيانة أصول مُعدّة."], drill };
      const late = am.filter((a) => ((a["asset_maintenance_tasks"] as Doc[] | undefined) ?? []).some((x) => s10(x["next_due_date"]) && s10(x["next_due_date"]) < t && !["Completed", "Cancelled"].includes(String(x["maintenance_status"]))));
      const k = am.flatMap((a) => ((a["asset_maintenance_tasks"] as Doc[] | undefined) ?? [])).filter((x) => s10(x["next_due_date"]) && s10(x["next_due_date"]) < t && !["Completed", "Cancelled"].includes(String(x["maintenance_status"]))).length;
      return { state: "OK", value: k, count: k, drill: listDrill("Asset Maintenance", [CO, ["name", "in", late.map((a) => a.name)]]) };
    }
    case "AST.DISPOSAL_EXC": {
      const bad = readable(c.user, "Asset"); if (bad) return { state: bad, value: null, drill };
      const gone = scopedList("Asset", c.user).filter((a) => a["company"] === co && n(a.docstatus) === 1 && ["Sold", "Scrapped"].includes(String(a["status"])));
      const sold = new Set(scopedList("Sales Invoice", c.user).filter((x) => n(x.docstatus) === 1).flatMap((x) => ((x["items"] as Doc[] | undefined) ?? []).map((i) => String(i["asset"] ?? ""))));
      const exc = gone.filter((a) => !a["journal_entry_for_scrap"] && !sold.has(a.name));
      return { state: "OK", value: exc.length, count: exc.length, detail: { disposed: gone.length }, drill: listDrill("Asset", [CO, ["name", "in", exc.map((a) => a.name)]]) };
    }
  }
  return { state: "UNAVAILABLE", value: null, drill };
}

export interface DeptDashboardResult { dept: DeptKey; company: string; currency: string; asOf: string; fy?: [string, string] | undefined; question: Bi; metrics: { def: MetricDef; v: MetricValue }[]; insights: { def: MetricDef; v: MetricValue }[]; reports: { report: string; drill: Drill }[] }
export function metricCtx(company: string | undefined, user = currentUser(), asOf = todayIso()): MetricCtx {
  const fc = financeContext(company, user);
  return { company: fc.company, currency: fc.currency, asOf, user, fy: fc.fiscalYear ? [fc.fiscalYear.start, fc.fiscalYear.end] : undefined };
}
/** Port of digit_pro.dashboards.get_department_dashboard(department, company). */
export function deptDashboard(dept: DeptKey, c: MetricCtx): DeptDashboardResult {
  const k = DEPT_CONTRACTS[dept];
  const all = k.metrics.map((def) => ({ def, v: metricValue(def, c) }));
  return { dept, company: c.company, currency: c.currency, asOf: c.asOf, fy: c.fy, question: k.question, metrics: all.filter((x) => x.def.kind === "metric"), insights: all.filter((x) => x.def.kind === "insight"),
    reports: k.reports.map(([report, route]) => ({ report, drill: routeDrill(route, c.company) })) };
}

/* ------------------------------------------------------------------ dash92 boards ------------------------------------------------------------------ */
export interface BoardCtx extends MetricCtx { from: string; to: string; compare: "prior_period" | "prior_year"; sec: SectionCtx }
export function boardCtx(company: string | undefined, from?: string, to?: string, compare: "prior_period" | "prior_year" = "prior_period", user = currentUser(), asOf = todayIso()): BoardCtx {
  const c = metricCtx(company, user, asOf);
  const t = to || asOf; const f = from || c.fy?.[0] || `${t.slice(0, 4)}-01-01`;
  return { ...c, from: f, to: t, compare, sec: sectionCtx(c.company, c.currency, t) };
}
function resolve<T>(x: T, c: SectionCtx): T {
  const tok: Record<string, string> = { company: c.company, as_of: c.asOf, d7: c.d7, d30: c.d30, from12: c.from12, from90: c.from90, month_from: c.monthFrom, from30: c.from30 };
  return JSON.parse(JSON.stringify(x), (_k, v) => (typeof v === "string" ? v.replace(/\{([a-z0-9_]+)\}/g, (m, k: string) => tok[k] ?? m) : v)) as T;
}
const toneOf = (t: unknown): "risk" | "action" | "info" => (t === "warn" ? "action" : t === "risk" ? "risk" : "info");
const kpiDef = (k: Record<string, unknown>): KpiDef => ({ id: String(k["id"]), label: k["label"] as Bi, hint: k["hint"] as Bi, doctype: String(k["doctype"]), filters: k["filters"] as Filter[], ...(k["measure"] ? { measure: String(k["measure"]) } : {}), ...(k["cur"] ? { cur: String(k["cur"]) } : {}), tone: toneOf(k["tone"]) });
const chartDef = (k: Record<string, unknown>): ChartDef => ({ id: String(k["id"]), label: k["label"] as Bi, kind: k["kind"] === "field" ? "field" : "month", doctype: String(k["doctype"]), filters: k["filters"] as Filter[], field: String(k["field"]), ...(k["measure"] ? { measure: String(k["measure"]) } : {}) });
const queueDef = (k: Record<string, unknown>): QueueDef => ({ id: String(k["id"]), label: k["label"] as Bi, doctype: String(k["doctype"]), filters: k["filters"] as Filter[], date: String(k["date"]), ...(k["party"] ? { party: String(k["party"]) } : {}), ...(k["amount"] ? { amount: String(k["amount"]) } : {}), order: k["order"] === "desc" ? "desc" : "asc", action: (k["action"] as Bi) ?? ["Open", "فتح"], severity: "medium", ...(k["overdueFrom"] ? { overdueFrom: String(k["overdueFrom"]) } : {}) });

export interface Bar { key: string; label: string; ar?: string | undefined; value: number; count: number; drill: Drill; data?: boolean | undefined }
export type BlockResult = { span: number; source: Bi; title: Bi; type: string; status: "ok" | "empty" | "denied" | "unavailable" | "not_configured"; note?: Bi | undefined; drill?: Drill | undefined } & (
  | { type: "kpis"; items: KpiResult[] }
  | { type: "chart" | "top" | "week" | "insight" | "states" | "ranking" | "dimension_cost_centers"; bars: Bar[]; valued: boolean }
  | { type: "compare"; series: { label: Bi; bars: Bar[] }[] }
  | { type: "queue"; queue: QueueResult }
  | { type: "aging"; bars: Bar[]; report: Drill }
  | { type: "parties"; rows: { party: string; outstanding: number; overdue: number; invoices: number; drill: Drill; overdueDrill: Drill }[] }
  | { type: "allocations"; rows: { name: string; date: string; payment_type: string; party: string; paid: number; allocated: number; unallocated: number; references: { doctype: string; name: string; allocated: number }[] }[] }
  | { type: "bank"; state: "READY" | "NOT_CONFIGURED"; accounts: number }
  | { type: "metrics"; items: { def: MetricDef; v: MetricValue }[] }
  | { type: "close"; blockers: Blocker[]; summary: { open: number; clear: number; restricted: number } }
  | { type: "performance_kpis"; items: PlKpi[]; compare: { from: string; to: string; basis: string; has: boolean } }
  | { type: "bridge"; steps: { key: string; label: Bi; value: number; kind: "total" | "delta"; drill?: Drill }[]; check: boolean }
  | { type: "period_table"; rows: { key: string; income: number; expense: number; net: number; drill: Drill }[] }
  | { type: "dimension_budgets"; rows: { name: string; against: string; budget: number; actual: number; drill: Drill }[] }
  | { type: "dimension_dimensions"; rows: { label: string; doctype: string; fieldname: string }[] }
  | { type: "statement"; report: string; lines: { label: Bi; value: number }[]; ok: boolean }
  | { type: "reports"; items: { report: string; drill: Drill; state: "ok" | "denied" }[] }
);
export interface PlKpi { key: string; label: Bi; value: number | null; prev: number | null; change: number | null; pct: number | null; unit: "currency" | "percent"; state: "OK" | "NOT_APPLICABLE"; drill?: Drill | undefined }
const PL_L: Record<string, Bi> = { income: ["Income", "الإيرادات"], expense: ["Expenses", "المصروفات"], net_profit: ["Net profit", "صافي الربح"], net_margin: ["Net margin", "هامش صافي الربح"], cogs: ["Cost of goods sold", "تكلفة البضاعة المباعة"], gross_profit: ["Gross profit", "إجمالي الربح"], gross_margin: ["Gross margin", "هامش إجمالي الربح"] };

export interface Pl { income: number; expense: number; cogs: number; net: number; leaves: { account: string; value: number }[]; byCc: Map<string, number>; byMonth: Map<string, { income: number; expense: number }> }
export function plFigures(company: string, from: string, to: string, user: string): Pl {
  const acc = new Map(scopedList("Account", user).filter((a) => a["company"] === company).map((a) => [a.name, a]));
  const out: Pl = { income: 0, expense: 0, cogs: 0, net: 0, leaves: [], byCc: new Map(), byMonth: new Map() };
  const leaf = new Map<string, number>();
  for (const g of scopedList("GL Entry", user)) {
    if (g["company"] !== company || n(g["is_cancelled"]) || s10(g["posting_date"]) < from || s10(g["posting_date"]) > to) continue;
    const a = acc.get(String(g["account"])); const rt = String(a?.["root_type"] ?? "");
    if (rt !== "Income" && rt !== "Expense") continue;
    const v = rt === "Income" ? n(g["credit"]) - n(g["debit"]) : n(g["debit"]) - n(g["credit"]);
    const m = s10(g["posting_date"]).slice(0, 7); const bm = out.byMonth.get(m) ?? { income: 0, expense: 0 };
    if (rt === "Income") { out.income += v; bm.income += v; } else { out.expense += v; bm.expense += v; leaf.set(String(g["account"]), (leaf.get(String(g["account"])) ?? 0) + v); if (a?.["account_type"] === "Cost of Goods Sold") out.cogs += v; }
    out.byMonth.set(m, bm);
    const cc = String(g["cost_center"] || "—"); out.byCc.set(cc, (out.byCc.get(cc) ?? 0) + (rt === "Income" ? v : -v));
  }
  out.income = r2(out.income); out.expense = r2(out.expense); out.cogs = r2(out.cogs); out.net = r2(out.income - out.expense);
  out.leaves = [...leaf].map(([account, value]) => ({ account, value: r2(value) })).sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
  return out;
}
export function compareRange(f: string, t: string, basis: "prior_period" | "prior_year"): [string, string] {
  if (basis === "prior_year") { const back = (d: string) => { const y = Number(d.slice(0, 4)) - 1; const md = d.slice(5) === "02-29" ? "02-28" : d.slice(5); return `${y}-${md}`; }; return [back(f), back(t)]; }
  const days = Math.round((Date.parse(t) - Date.parse(f)) / 86_400_000); const end = addDaysIso(f, -1);
  return [addDaysIso(end, -days), end];
}
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : null);
const plDrill = (company: string, f: string, t: string): Drill => ({ kind: "pro", to: "/pro/statements", search: { report: "Profit and Loss Statement", company, from_date: f, to_date: t } });

function performance(c: BoardCtx) {
  const cur = plFigures(c.company, c.from, c.to, c.user);
  const [cf, ct] = compareRange(c.from, c.to, c.compare);
  const prev = plFigures(c.company, cf, ct, c.user);
  const has = !!(prev.income || prev.expense);
  const drill = plDrill(c.company, c.from, c.to);
  const k = (key: string, value: number | null, pv: number | null, unit: "currency" | "percent" = "currency", state: "OK" | "NOT_APPLICABLE" = "OK", d: Drill | undefined = drill): PlKpi => {
    const change = state === "OK" && has && value !== null && pv !== null ? r2(value - pv) : null;
    return { key, label: PL_L[key]!, value, prev: pv, change, pct: change !== null && pv ? Math.round((change / Math.abs(pv)) * 1000) / 10 : null, unit, state, drill: d };
  };
  const hasCogs = !!(cur.cogs || prev.cogs);
  const kpis = [k("income", cur.income, prev.income), k("expense", cur.expense, prev.expense), k("net_profit", cur.net, prev.net), k("net_margin", pct(cur.net, cur.income), pct(prev.net, prev.income), "percent", cur.income ? "OK" : "NOT_APPLICABLE"),
    k("cogs", cur.cogs, prev.cogs, "currency", hasCogs ? "OK" : "NOT_APPLICABLE"), k("gross_profit", r2(cur.income - cur.cogs), r2(prev.income - prev.cogs), "currency", hasCogs ? "OK" : "NOT_APPLICABLE"),
    k("gross_margin", pct(cur.income - cur.cogs, cur.income), pct(prev.income - prev.cogs, prev.income), "percent", hasCogs && cur.income ? "OK" : "NOT_APPLICABLE")];
  return { cur, kpis, compare: { from: cf, to: ct, basis: c.compare, has }, drill };
}

const SB = (status: string): BlockResult["status"] => (status === "ok" ? "ok" : status === "denied" ? "denied" : status === "empty" ? "empty" : "unavailable");
const barsOf = (r: ChartResult): Bar[] => r.bars.map((b) => ({ key: b.key, label: b.label || b.key, value: b.value ?? b.count, count: b.count, drill: b.drill, data: r.kind === "field" && isLinkField(r.doctype, r.field) }));

function evalBlock(b: RawBlock, c: BoardCtx): BlockResult {
  const base = { span: b.span, source: b.source };
  const st = (dt: string) => sourceStatus(dt, c.user);
  const t = b.type;
  if (t === "kpis") { const items = (resolve(b.items ?? [], c.sec) as Record<string, unknown>[]).map((k) => evalKpi(kpiDef(k), c.sec, c.user)); return { ...base, type: "kpis", title: ["Key figures", "المؤشرات الرئيسية"], status: items.every((i) => i.status === "denied") ? "denied" : "ok", items }; }
  if (t === "chart") { const r = evalChart(chartDef(resolve(b.spec!, c.sec)), c.sec, c.user, { months: 12 }); return { ...base, type: "chart", title: r.label, status: SB(r.status), bars: barsOf(r), valued: r.bars.some((x) => x.value !== null) }; }
  if (t === "top" || t === "week") {
    const spec = resolve(b.spec!, c.sec) as Record<string, unknown>; const dt = String(spec["doctype"]); const field = String(spec["field"]); const measure = String(spec["measure"] ?? ""); const fs = spec["filters"] as Filter[];
    if (st(dt) !== "ok") return { ...base, type: t, title: spec["label"] as Bi, status: SB(st(dt)), bars: [], valued: true };
    if (t === "top") {
      const g = new Map<string, [number, number]>(); for (const d of rowsOf(dt, fs, c.user)) { const key = String(d[field] ?? ""); const x = g.get(key) ?? [0, 0]; x[0] += n(d[measure]); x[1] += 1; g.set(key, x); }
      const bars = [...g].sort((a, b2) => b2[1][0] - a[1][0]).slice(0, 8).map(([key, [v, k]]) => ({ key: key || "—", label: key || "—", value: r2(v), count: k, data: true, drill: listDrill(dt, [...fs, key ? [field, "=", key] : [field, "is", "not set"]] as Filter[]) }));
      return { ...base, type: "top", title: spec["label"] as Bi, status: bars.length ? "ok" : "empty", bars, valued: true };
    }
    const rows = rowsOf(dt, fs, c.user);
    const bars = Array.from({ length: 8 }, (_, i) => { const lo = addDaysIso(c.sec.asOf, 7 * i), hi = addDaysIso(c.sec.asOf, 7 * i + 6); const rs = rows.filter((d) => s10(d[field]) >= lo && s10(d[field]) <= hi);
      return { key: lo, label: `${lo.slice(5)} → ${hi.slice(5)}`, value: r2(rs.reduce((x, d) => x + n(d[measure]), 0)), count: rs.length, drill: listDrill(dt, [...fs, [field, "between", [lo, hi]]]) }; });
    return { ...base, type: "week", title: spec["label"] as Bi, status: "ok", bars, valued: true };
  }
  if (t === "compare") { const series = (b.series ?? []).map((sx) => { const r = evalChart(chartDef(resolve(sx, c.sec)), c.sec, c.user, { months: 12 }); return { label: r.label, bars: barsOf(r), status: r.status }; });
    return { ...base, type: "compare", title: b.label!, status: series.every((x) => x.status === "denied") ? "denied" : "ok", series: series.map(({ label, bars }) => ({ label, bars })) }; }
  if (t === "states") { const dt = b.doctype!; if (st(dt) !== "ok") return { ...base, type: "states", title: b.label!, status: SB(st(dt)), bars: [], valued: false };
    const bars = (resolve(b.states ?? [], c.sec)).map(([label, extra], i) => { const fs = [...resolve(b.base ?? [], c.sec), ...extra] as Filter[]; const k = rowsOf(dt, fs, c.user).length; return { key: String(i), label: label[0], ar: label[1], value: k, count: k, drill: listDrill(dt, fs) }; });
    return { ...base, type: "states", title: b.label!, status: "ok", bars, valued: false }; }
  if (t === "queue") { const q = evalQueue(queueDef(resolve(b.spec!, c.sec)), c.sec, c.user, 8); return { ...base, type: "queue", title: q.label, status: SB(q.status), queue: q, drill: q.drill }; }
  if (t === "aging") {
    const side = b.party_type === "Supplier" ? "payable" : "receivable"; const dt = side === "payable" ? "Purchase Invoice" : "Sales Invoice"; const a = aging(side, c.company, c.user);
    const report: Drill = { kind: "report", name: side === "payable" ? "Accounts Payable" : "Accounts Receivable", filters: { company: c.company } };
    if (a.status !== "ok") return { ...base, type: "aging", title: b.label!, status: SB(a.status), bars: [], report };
    const as = c.sec.asOf; const d = (k: number) => addDaysIso(as, -k);
    const baseF: Filter[] = [["company", "=", c.company], ["docstatus", "=", 1], ["outstanding_amount", "!=", 0], ["posting_date", "<=", as]];
    const win: Filter[][] = [[["due_date", ">=", as]], [["due_date", "between", [d(30), d(1)]]], [["due_date", "between", [d(60), d(31)]]], [["due_date", "between", [d(90), d(61)]]], [["due_date", "<=", d(91)]]];
    const labels: Bi[] = [["Not due", "غير مستحق"], ["1–30 days", "1–30 يومًا"], ["31–60 days", "31–60 يومًا"], ["61–90 days", "61–90 يومًا"], ["Over 90 days", "أكثر من 90 يومًا"]];
    const counts = [0, 0, 0, 0, 0]; for (const p of a.parties) for (const inv of p.invoices) counts[inv.bucket] = (counts[inv.bucket] ?? 0) + 1;
    return { ...base, type: "aging", title: b.label!, status: a.total ? "ok" : "empty", report, bars: labels.map((l, i) => ({ key: String(i), label: l[0], value: r2(a.totals[i] ?? 0), count: counts[i] ?? 0, drill: listDrill(dt, [...baseF, ...win[i]!]), ar: l[1] })) };
  }
  if (t === "parties") {
    const [dt, field] = b.party_type === "Supplier" ? ["Purchase Invoice", "supplier"] : ["Sales Invoice", "customer"];
    if (st(dt!) !== "ok") return { ...base, type: "parties", title: b.label!, status: SB(st(dt!)), rows: [] };
    const baseF: Filter[] = [["company", "=", c.company], ["docstatus", "=", 1], ["outstanding_amount", "!=", 0]];
    const m = new Map<string, { party: string; outstanding: number; overdue: number; invoices: number }>();
    for (const r of rowsOf(dt!, baseF, c.user)) { const p = String(r[field!] ?? ""); const x = m.get(p) ?? { party: p, outstanding: 0, overdue: 0, invoices: 0 }; const amt = n(r["outstanding_amount"]); x.outstanding += amt; x.invoices += 1; if (s10(r["due_date"]) && s10(r["due_date"]) < c.sec.asOf && amt > 0) x.overdue += amt; m.set(p, x); }
    const rows = [...m.values()].sort((a2, b2) => b2.outstanding - a2.outstanding).slice(0, 15).map((x) => ({ ...x, outstanding: r2(x.outstanding), overdue: r2(x.overdue), drill: listDrill(dt!, [...baseF, [field!, "=", x.party]]), overdueDrill: listDrill(dt!, [...baseF, [field!, "=", x.party], ["outstanding_amount", ">", 0], ["due_date", "<", c.sec.asOf]]) }));
    return { ...base, type: "parties", title: b.label!, status: rows.length ? "ok" : "empty", rows };
  }
  if (t === "allocations") {
    if (st("Payment Entry") !== "ok") return { ...base, type: "allocations", title: b.label!, status: SB(st("Payment Entry")), rows: [] };
    const rows = rowsOf("Payment Entry", [["company", "=", c.company], ["docstatus", "=", 1], ["payment_type", "in", ["Receive", "Pay"]]], c.user).sort((a2, b2) => s10(b2["posting_date"]).localeCompare(s10(a2["posting_date"])) || b2.name.localeCompare(a2.name)).slice(0, 12)
      .map((p) => ({ name: p.name, date: s10(p["posting_date"]), payment_type: String(p["payment_type"]), party: String(p["party_name"] || p["party"] || ""), paid: n(p["paid_amount"]), allocated: n(p["total_allocated_amount"]), unallocated: n(p["unallocated_amount"]),
        references: ((p["references"] as Doc[] | undefined) ?? []).slice(0, 5).map((r) => ({ doctype: String(r["reference_doctype"]), name: String(r["reference_name"]), allocated: n(r["allocated_amount"]) })) }));
    return { ...base, type: "allocations", title: b.label!, status: rows.length ? "ok" : "empty", rows };
  }
  if (t === "bank") { if (st("Bank Account") !== "ok") return { ...base, type: "bank", title: ["Company bank account setup", "إعداد الحساب البنكي للشركة"], status: SB(st("Bank Account")), state: "NOT_CONFIGURED", accounts: 0 };
    const k = scopedList("Bank Account", c.user).filter((x) => x["company"] === c.company && n(x["is_company_account"])).length;
    return { ...base, type: "bank", title: ["Company bank account setup", "إعداد الحساب البنكي للشركة"], status: k ? "ok" : "not_configured", state: k ? "READY" : "NOT_CONFIGURED", accounts: k, drill: { kind: "pro", to: "/pro/bank-reconciliation", search: { company: c.company } },
      ...(k ? {} : { note: ["No company bank account is set up; bank lines cannot be imported or matched yet.", "لا يوجد حساب بنكي للشركة؛ لا يمكن استيراد الحركات البنكية أو مطابقتها بعد."] as Bi }) }; }
  if (t === "metrics") { const d = deptDashboard("finance", c); return { ...base, type: "metrics", title: ["Finance metrics", "المؤشرات المالية"], status: "ok", items: d.metrics }; }
  if (t === "insight") { const def = DEPT_CONTRACTS.finance.metrics.find((m) => m.metric_id === b.metric)!; const v = metricValue(def, c);
    return { ...base, type: "insight", title: [def.title_en, def.title_ar], status: v.state === "OK" ? "ok" : v.state === "DENIED" ? "denied" : "unavailable", valued: true, drill: v.drill,
      bars: (v.series?.labels ?? []).map((l, i) => ({ key: l, label: l, value: v.series!.values[i] ?? 0, count: 0, drill: v.series!.drills?.[i] ?? v.drill })) }; }
  if (t === "close") { const bs = closeBlockers(c.company, c.from, c.to, c.user, c.sec.asOf); return { ...base, type: "close", title: b.label!, status: bs.every((x) => x.status !== "ok") ? "denied" : "ok", blockers: bs, summary: blockerSummary(bs), drill: { kind: "pro", to: "/pro/period-control", search: { company: c.company } } }; }
  if (t === "performance") {
    const glSt = sourceStatus("GL Entry", c.user) === "ok" && sourceStatus("Account", c.user) === "ok" ? "ok" : "denied";
    const title: Bi = b.part === "kpis" ? ["Profit and loss — key figures", "الأرباح والخسائر — المؤشرات"] : b.part === "bridge" ? ["Profit bridge", "جسر الربح"] : b.part === "mix" ? ["Expense contribution", "مساهمة المصروفات"] : ["Income, expense and net by period", "الإيراد والمصروف والصافي حسب الفترة"];
    const type = b.part === "kpis" ? "performance_kpis" : b.part === "bridge" ? "bridge" : b.part === "mix" ? "ranking" : "period_table";
    if (glSt !== "ok") return { ...base, type, title, status: "denied", items: [], steps: [], rows: [], bars: [], valued: true, check: false, compare: { from: "", to: "", basis: c.compare, has: false } } as BlockResult;
    const p = performance(c);
    if (b.part === "kpis") return { ...base, type: "performance_kpis", title, status: "ok", items: p.kpis, compare: p.compare, drill: p.drill };
    if (b.part === "bridge") {
      if (!p.cur.cogs) return { ...base, type: "bridge", title, status: "not_configured", steps: [], check: false, note: ["No Cost of Goods Sold postings in this period: the bridge has no gross step.", "لا توجد ترحيلات على تكلفة البضاعة المباعة في هذه الفترة: لا يوجد خطوة إجمالي ربح."], drill: p.drill };
      const gross = r2(p.cur.income - p.cur.cogs), other = r2(p.cur.expense - p.cur.cogs);
      return { ...base, type: "bridge", title, status: "ok", drill: p.drill, check: r2(gross - other - p.cur.net) === 0, steps: [{ key: "income", label: ["Income", "الإيرادات"], value: p.cur.income, kind: "total" }, { key: "cogs", label: ["Cost of goods sold", "تكلفة البضاعة المباعة"], value: -p.cur.cogs, kind: "delta" }, { key: "gross", label: ["Gross profit", "إجمالي الربح"], value: gross, kind: "total" }, { key: "other", label: ["Other expenses", "المصروفات الأخرى"], value: -other, kind: "delta" }, { key: "net", label: ["Net profit", "صافي الربح"], value: p.cur.net, kind: "total", drill: p.drill }] };
    }
    if (b.part === "mix") { const head = p.cur.leaves.filter((x) => x.value).slice(0, 8); const tail = p.cur.leaves.filter((x) => x.value).slice(8);
      const bars: Bar[] = head.map((x) => ({ key: x.account, label: x.account, value: x.value, count: 0, data: true, drill: glDrill(c.company, [x.account], c.from, c.to) }));
      if (tail.length) bars.push({ key: "other", label: "Other", value: r2(tail.reduce((a2, x) => a2 + x.value, 0)), count: tail.length, drill: p.drill });
      return { ...base, type: "ranking", title, status: bars.length ? "ok" : "empty", bars, valued: true, drill: p.drill }; }
    const months = monthsBack(c.to, Math.min(12, Math.max(1, (Number(c.to.slice(0, 4)) - Number(c.from.slice(0, 4))) * 12 + Number(c.to.slice(5, 7)) - Number(c.from.slice(5, 7)) + 1)));
    return { ...base, type: "period_table", title, status: "ok", drill: p.drill, rows: months.map((m) => { const x = p.cur.byMonth.get(m) ?? { income: 0, expense: 0 }; return { key: m, income: r2(x.income), expense: r2(x.expense), net: r2(x.income - x.expense), drill: plDrill(c.company, `${m}-01` < c.from ? c.from : `${m}-01`, monthEnd(m) > c.to ? c.to : monthEnd(m)) }; }) };
  }
  if (t === "dimensions") {
    if (b.part === "cost_centers") { if (sourceStatus("GL Entry", c.user) !== "ok") return { ...base, type: "dimension_cost_centers", title: ["Profit by cost center", "الربحية حسب مركز التكلفة"], status: "denied", bars: [], valued: true };
      const p = plFigures(c.company, c.from, c.to, c.user); const bars = [...p.byCc].sort((a2, b2) => b2[1] - a2[1]).map(([cc, v]) => ({ key: cc, label: cc === "—" ? "No cost center" : cc, ar: cc === "—" ? "بدون مركز تكلفة" : undefined, value: r2(v), count: 0, data: cc !== "—", drill: { kind: "pro", to: "/pro/general-ledger", search: { company: c.company, from_date: c.from, to_date: c.to, cost_center: cc === "—" ? undefined : cc } } as Drill }));
      return { ...base, type: "dimension_cost_centers", title: ["Profit by cost center", "الربحية حسب مركز التكلفة"], status: bars.length ? "ok" : "empty", bars, valued: true, drill: { kind: "report", name: "Profitability Analysis", filters: { company: c.company, based_on: "Cost Center", from_date: c.from, to_date: c.to } } }; }
    if (b.part === "budgets") { if (sourceStatus("Budget", c.user) !== "ok") return { ...base, type: "dimension_budgets", title: ["Submitted budgets", "الموازنات المعتمدة"], status: "denied", rows: [] };
      const budgets = scopedList("Budget", c.user).filter((x) => x["company"] === c.company && n(x.docstatus) === 1);
      if (!budgets.length) return { ...base, type: "dimension_budgets", title: ["Submitted budgets", "الموازنات المعتمدة"], status: "not_configured", rows: [], note: ["No submitted budget for this company: the Budget Variance Report has no figures until one is set up.", "لا توجد موازنة معتمدة لهذه الشركة: تقرير انحراف الموازنة لا يعرض أرقامًا قبل إعدادها."], drill: listDrill("Budget", [["company", "=", c.company]]) };
      const gl = scopedList("GL Entry", c.user).filter((g) => g["company"] === c.company && !n(g["is_cancelled"]) && s10(g["posting_date"]) >= c.from && s10(g["posting_date"]) <= c.to);
      const rows = budgets.map((bd) => { const against = String(bd["budget_against"] ?? "Cost Center"); const dimF = against === "Project" ? "project" : "cost_center"; const dimV = String(bd[dimF] ?? ""); const accs = ((bd["accounts"] as Doc[] | undefined) ?? []);
        const set = new Set(accs.map((a2) => String(a2["account"]))); const actual = r2(gl.filter((g) => set.has(String(g["account"])) && (!dimV || g[dimF] === dimV)).reduce((x, g) => x + n(g["debit"]) - n(g["credit"]), 0));
        return { name: bd.name, against: `${against}: ${dimV || "—"}`, budget: r2(accs.reduce((x, a2) => x + n(a2["budget_amount"]), 0)), actual, drill: { kind: "report", name: "Budget Variance Report", filters: { company: c.company, budget_against: against } } as Drill }; });
      return { ...base, type: "dimension_budgets", title: ["Submitted budgets", "الموازنات المعتمدة"], status: "ok", rows }; }
    const dims = allDimensions().filter((d) => !["Cost Center", "Project"].includes(d.document_type));
    return { ...base, type: "dimension_dimensions", title: ["Accounting dimensions", "الأبعاد المحاسبية"], status: dims.length ? "ok" : "not_configured", rows: dims.map((d) => ({ label: d.label, doctype: d.document_type, fieldname: d.fieldname })), drill: listDrill("Accounting Dimension", []),
      ...(dims.length ? {} : { note: ["No additional accounting dimension is enabled (Cost Center and Project remain available).", "لا توجد أبعاد محاسبية إضافية مفعّلة (مركز التكلفة والمشروع متاحان)."] as Bi }) };
  }
  if (t === "statement") {
    const report = b.report!; const drill: Drill = report === "Trial Balance" ? { kind: "pro", to: "/pro/trial-balance", search: { company: c.company, from_date: c.from, to_date: c.to } } : { kind: "pro", to: "/pro/statements", search: { report, company: c.company, from_date: c.from, to_date: c.to } };
    if (sourceStatus("GL Entry", c.user) !== "ok") return { ...base, type: "statement", title: [report, report], status: "denied", report, lines: [], ok: false, drill };
    const acc = new Map(scopedList("Account", c.user).filter((a2) => a2["company"] === c.company).map((a2) => [a2.name, String(a2["root_type"] ?? "")]));
    const gl = scopedList("GL Entry", c.user).filter((g) => g["company"] === c.company && !n(g["is_cancelled"]) && s10(g["posting_date"]) <= c.to);
    if (report === "Trial Balance") { const inP = gl.filter((g) => s10(g["posting_date"]) >= c.from); const dr = r2(inP.reduce((x, g) => x + n(g["debit"]), 0)), cr = r2(inP.reduce((x, g) => x + n(g["credit"]), 0));
      return { ...base, type: "statement", title: ["Trial Balance", "ميزان المراجعة"], status: inP.length ? "ok" : "empty", report, drill, ok: r2(dr - cr) === 0, lines: [{ label: ["Period debit", "مدين الفترة"], value: dr }, { label: ["Period credit", "دائن الفترة"], value: cr }, { label: ["Difference", "الفرق"], value: r2(dr - cr) }] }; }
    const bal = (rt: string) => r2(gl.filter((g) => acc.get(String(g["account"])) === rt).reduce((x, g) => x + (rt === "Asset" ? n(g["debit"]) - n(g["credit"]) : n(g["credit"]) - n(g["debit"])), 0));
    const assets = bal("Asset"), liab = bal("Liability"), eq = bal("Equity"), pl = r2(bal("Income") - gl.filter((g) => acc.get(String(g["account"])) === "Expense").reduce((x, g) => x + n(g["debit"]) - n(g["credit"]), 0));
    return { ...base, type: "statement", title: ["Balance Sheet", "قائمة المركز المالي"], status: gl.length ? "ok" : "empty", report, drill, ok: r2(assets - liab - eq - pl) === 0,
      lines: [{ label: ["Total assets", "إجمالي الأصول"], value: assets }, { label: ["Total liabilities", "إجمالي الخصوم"], value: liab }, { label: ["Equity", "حقوق الملكية"], value: eq }, { label: ["Provisional profit / loss", "الربح / الخسارة المؤقتة"], value: pl }] };
  }
  if (t === "reports") { const items = (b.items as string[]).map((report) => ({ report, drill: reportDrill(report, c.company), state: "ok" as const })); return { ...base, type: "reports", title: ["Reports", "التقارير"], status: "ok", items }; }
  return { ...base, type: "reports", title: ["Unsupported block", "كتلة غير مدعومة"], status: "unavailable", items: [] };
}
const CANON: Record<string, string> = { "General Ledger": "/pro/general-ledger", "Trial Balance": "/pro/trial-balance", "Profit and Loss Statement": "/pro/statements", "Balance Sheet": "/pro/statements", "Cash Flow": "/pro/statements", "Stock Ledger": "/pro/stock-ledger", "Stock Balance": "/pro/stock-balance", "Fixed Asset Register": "/pro/asset-register" };
/** One canonical destination per report (digit_pro.report_registry.route_for): Pro pages for the hosted registers, the report runner otherwise. */
export function reportDrill(report: string, company: string): Drill {
  const to = CANON[report];
  if (to) return { kind: "pro", to, search: { company, ...(to === "/pro/statements" ? { report } : {}) } };
  return { kind: "report", name: report, filters: { company } };
}
export interface BoardResult { key: string; title: Bi; company: string; currency: string; from: string; to: string; blocks: BlockResult[] }
/** Port of digit_pro.dash92.get_dashboard(key, company, from_date, to_date, compare). One failing block never hides the others. */
export function evalBoard(key: string, c: BoardCtx): BoardResult {
  const def = BOARDS[key]; if (!def) throw new Error(`Invalid value for key: ${key}`);
  const blocks = def.blocks.map((b) => { try { return evalBlock(b, c); } catch (e) { return { span: b.span, source: b.source, type: "reports", title: b.label ?? ["Block", "كتلة"], status: "unavailable", note: [String((e as Error).message), String((e as Error).message)], items: [] } as BlockResult; } });
  return { key, title: def.title, company: c.company, currency: c.currency, from: c.from, to: c.to, blocks };
}
export const _test = { plFigures };
