/**
 * Construction Insights catalog: the chart and dashboard definitions seeded as Insights Chart v3 / Dashboard v3 records
 * of workbook DCON-WB (analytics/insightsSeed.ts). Charts read the `digit_construction` data source tables (one per
 * Script Report), so a chart mark, its drill report and the source documents are the same rows. Measures in one chart
 * are separate series (contract ≠ certified ≠ invoiced ≠ collected), never added together.
 */
import type { Dept } from "../domain/queues";
import { METRICS, type RowFilter } from "./metricDefs";

export const WORKBOOK = "DCON-WB";
export interface ChartMeasure { column: string; agg: "sum" | "count"; en: string; ar: string }
export interface ChartDef { id: string; en: string; ar: string; report: string; type: "Bar" | "Donut"; x: string; measures: ChartMeasure[]; filters: RowFilter[]; split?: string; unit: "SAR" | "count" | "hours" | "qty" }
const cnt: ChartMeasure = { column: "count", agg: "count", en: "Count", ar: "العدد" };
const sum = (column: string, en: string, ar: string): ChartMeasure => ({ column, agg: "sum", en, ar });

export const CHARTS: ChartDef[] = [
  { id: "DCON-C-EXEC-REVENUE", en: "Contract, certified, invoiced and collected by project", ar: "العقد والمعتمد والمفوتر والمحصل حسب المشروع", report: "Construction Portfolio Status", type: "Bar", x: "project", unit: "SAR", filters: [],
    measures: [sum("revised", "Revised contract", "العقد المعدل"), sum("certified", "Certified gross", "المعتمد الإجمالي"), sum("invoiced", "Invoiced (net)", "المفوتر (صافي)"), sum("collected", "Collected", "المحصل")] },
  { id: "DCON-C-EXEC-RISK", en: "Open projects by risk", ar: "المشاريع المفتوحة حسب الخطر", report: "Construction Portfolio Status", type: "Donut", x: "risk", unit: "count", filters: [["status", "=", "Open"]], measures: [cnt] },
  { id: "DCON-C-EXEC-COST", en: "Budget, commitments, actual and EAC by project", ar: "الموازنة والالتزامات والفعلي والمتوقع حسب المشروع", report: "Construction Portfolio Status", type: "Bar", x: "project", unit: "SAR", filters: [],
    measures: [sum("budget", "Revised budget", "الموازنة المعدلة"), sum("committed", "Open commitments", "الالتزامات المفتوحة"), sum("actual", "Actual cost", "التكلفة الفعلية"), sum("eac", "EAC", "المتوقع عند الإنجاز")] },
  { id: "DCON-C-PRJ-OVERDUE", en: "Overdue tasks by project", ar: "المهام المتأخرة حسب المشروع", report: "Construction Tasks", type: "Bar", x: "project", unit: "count", filters: [["overdue", "=", 1]], measures: [cnt] },
  { id: "DCON-C-PRJ-STATUS", en: "Tasks by status", ar: "المهام حسب الحالة", report: "Construction Tasks", type: "Donut", x: "status", unit: "count", filters: [], measures: [cnt] },
  { id: "DCON-C-PRJ-CONFLICTS", en: "Open dependency conflicts by project", ar: "تعارضات الاعتماديات المفتوحة حسب المشروع", report: "Schedule Dependency Conflicts", type: "Bar", x: "project", unit: "count", filters: [["historical", "=", 0]], measures: [cnt] },
  { id: "DCON-C-ET-STATUS", en: "Tenders by status", ar: "العطاءات حسب الحالة", report: "Tender Pipeline", type: "Donut", x: "status", unit: "count", filters: [], measures: [cnt] },
  { id: "DCON-C-ET-BID", en: "Bid value by tender (before tax)", ar: "قيمة العرض حسب العطاء (قبل الضريبة)", report: "Tender Pipeline", type: "Bar", x: "tender", unit: "SAR", filters: [["bid", "is_set"]], measures: [sum("bid", "Bid value", "قيمة العرض"), sum("cost", "Estimated cost", "التكلفة التقديرية")] },
  { id: "DCON-C-ET-RATES", en: "Enabled rates by validity", ar: "الأسعار المفعلة حسب الصلاحية", report: "Rate Validity", type: "Donut", x: "validity", unit: "count", filters: [["disabled", "=", 0]], measures: [cnt] },
  { id: "DCON-C-ET-EST", en: "Estimate versions by status", ar: "إصدارات التقدير حسب الحالة", report: "Estimate Versions", type: "Donut", x: "state", unit: "count", filters: [], measures: [cnt] },
  { id: "DCON-C-CON-CERT", en: "Net certified, invoiced and collected by contract", ar: "صافي المعتمد والمفوتر والمحصل حسب العقد", report: "Client Contract Position", type: "Bar", x: "contract", unit: "SAR", filters: [],
    measures: [sum("net", "Net certified", "صافي المعتمد"), sum("invoiced", "Invoiced (net)", "المفوتر (صافي)"), sum("collected", "Collected", "المحصل")] },
  { id: "DCON-C-CON-AGING", en: "Receivables by aging bucket", ar: "الذمم المدينة حسب فئة العمر", report: "Construction Receivables Aging", type: "Bar", x: "bucket", unit: "SAR", filters: [], measures: [sum("outstanding", "Outstanding", "المتبقي")] },
  { id: "DCON-C-CON-CLAIMS", en: "Claimed value by claim status", ar: "قيمة المطالبات حسب الحالة", report: "Claims and Certificates Register", type: "Donut", x: "state", unit: "SAR", filters: [], measures: [sum("claimed", "Claimed", "المطالب به")] },
  { id: "DCON-C-SUB-POS", en: "Work order value, certified, billed and paid", ar: "قيمة أمر العمل والمعتمد والمستخلص والمدفوع", report: "Subcontract Position", type: "Bar", x: "work_order", unit: "SAR", filters: [],
    measures: [sum("value", "Work order value", "قيمة أمر العمل"), sum("certified", "Certified measurement", "القياس المعتمد"), sum("billed", "Billed gross", "المستخلص الإجمالي"), sum("paid", "Paid", "المدفوع")] },
  { id: "DCON-C-SUB-RET", en: "Retention withheld by subcontractor", ar: "المحتجزات حسب مقاول الباطن", report: "Subcontract Position", type: "Bar", x: "subcontractor", unit: "SAR", filters: [], measures: [sum("retention", "Retention withheld", "المحتجزات")] },
  { id: "DCON-C-CST-SOURCES", en: "Commitments and actuals by cost code", ar: "الالتزامات والفعلي حسب رمز التكلفة", report: "Project Cost Sources", type: "Bar", x: "cost_code", split: "measure", unit: "SAR", filters: [], measures: [sum("amount", "Amount", "المبلغ")] },
  { id: "DCON-C-CST-EXCEPTIONS", en: "Open cost source exceptions by project and type", ar: "استثناءات مصادر التكلفة المفتوحة حسب المشروع والنوع", report: "Cost Source Exceptions", type: "Bar", x: "project", split: "exception", unit: "count", filters: [["status", "=", "Open"]], measures: [cnt] },
  { id: "DCON-C-CST-DOCS", en: "Cost control documents by status", ar: "مستندات التحكم بالتكلفة حسب الحالة", report: "Cost Control Documents", type: "Donut", x: "state", unit: "count", filters: [], measures: [cnt] },
  { id: "DCON-C-PROC-COMMIT", en: "Open PO commitment by supplier", ar: "التزامات أوامر الشراء المفتوحة حسب المورد", report: "Open Purchase Order Lines", type: "Bar", x: "supplier", unit: "SAR", filters: [["open_commitment", ">", 0]], measures: [sum("open_commitment", "Open commitment", "الالتزام المفتوح")] },
  { id: "DCON-C-PROC-MR", en: "Material requests by status", ar: "طلبات المواد حسب الحالة", report: "Material Request Status", type: "Donut", x: "status", unit: "count", filters: [], measures: [cnt] },
  { id: "DCON-C-PROC-RNI", en: "Received not invoiced by supplier", ar: "المستلم غير المفوتر حسب المورد", report: "Received Not Invoiced", type: "Bar", x: "supplier", unit: "SAR", filters: [], measures: [sum("unbilled", "Received not invoiced", "مستلم غير مفوتر")] },
  { id: "DCON-C-MAT-BAL", en: "Site balance quantity by item", ar: "رصيد الموقع حسب الصنف (كمية)", report: "Project Material Balance", type: "Bar", x: "item_code", unit: "qty", filters: [], measures: [sum("balance", "Site balance qty", "رصيد الموقع")] },
  { id: "DCON-C-MAT-ISSUED", en: "Material issued to work (valuation) by project", ar: "المواد المصروفة للأعمال (تقييم) حسب المشروع", report: "Project Material Balance", type: "Bar", x: "project", unit: "SAR", filters: [], measures: [sum("issued_value", "Issued value", "قيمة المصروف")] },
  { id: "DCON-C-RSP-OT", en: "Overtime hours by project", ar: "ساعات العمل الإضافي حسب المشروع", report: "Site Attendance Overtime", type: "Bar", x: "project", unit: "hours", filters: [["submitted", "=", 1]], measures: [sum("overtime_hours", "Overtime hours", "ساعات إضافية")] },
  { id: "DCON-C-RSP-MH", en: "Machine hours by project", ar: "ساعات المعدات حسب المشروع", report: "Machinery Usage Register", type: "Bar", x: "project", unit: "hours", filters: [["submitted", "=", 1]], measures: [sum("hours", "Machine hours", "ساعات المعدات")] },
  { id: "DCON-C-RSP-SPEND", en: "Approved site spend by category", ar: "مصروفات الموقع المعتمدة حسب الفئة", report: "Site Spend Register", type: "Donut", x: "category", unit: "SAR", filters: [["state", "=", "Approved"]], measures: [sum("amount", "Amount", "المبلغ")] },
  { id: "DCON-C-FIN-CASH", en: "Cash by month — actual and forecast", ar: "النقد حسب الشهر — فعلي ومتوقع", report: "Construction Cashflow", type: "Bar", x: "period", unit: "SAR", filters: [],
    measures: [sum("collected", "Collected (actual)", "المحصل (فعلي)"), sum("paid", "Paid (actual)", "المدفوع (فعلي)"), sum("forecast_in", "Forecast inflow", "تدفق داخل متوقع"), sum("forecast_out", "Forecast outflow", "تدفق خارج متوقع")] },
  { id: "DCON-C-FIN-RET", en: "Client retention held and advances outstanding by contract", ar: "محتجزات العملاء والدفعات المقدمة القائمة حسب العقد", report: "Retention and Advances", type: "Bar", x: "contract", unit: "SAR", filters: [],
    measures: [sum("retention_held", "Retention held", "المحتجزات"), sum("advance_outstanding", "Advance outstanding", "الدفعة المقدمة القائمة")] },
  { id: "DCON-C-FIN-PAY", en: "Supplier invoices outstanding by aging bucket", ar: "فواتير الموردين المستحقة حسب فئة العمر", report: "Supplier Invoices Outstanding", type: "Bar", x: "bucket", unit: "SAR", filters: [], measures: [sum("outstanding", "Outstanding", "المتبقي")] },
];
export const chartById = (id: string) => CHARTS.find((c) => c.id === id);
export const metricChartId = (metric: string) => `DCON-C-M-${metric}`;
/** Metrics that have an Insights Number chart (ratio and unavailable metrics are computed by the metric engine only). */
export const CHARTED_METRICS = METRICS.filter((m) => m.status !== "UNAVAILABLE_SOURCE" && m.agg !== "ratio");

export interface DashboardDef { key: string; id: string; dept: Dept | "DQ" | "MAT"; en: string; ar: string; metrics: string[]; charts: string[] }
export const DASHBOARDS: DashboardDef[] = [
  { key: "executive", id: "DCON-D-EXEC", dept: "MGT", en: "Executive portfolio", ar: "المحفظة التنفيذية", metrics: ["mgt.active_projects", "mgt.contract_value", "mgt.certified", "mgt.collected", "mgt.receivable", "mgt.at_risk"], charts: ["DCON-C-EXEC-REVENUE", "DCON-C-EXEC-RISK", "DCON-C-EXEC-COST"] },
  { key: "project-control", id: "DCON-D-PRJ", dept: "PRJ", en: "Project control", ar: "ضبط المشاريع", metrics: ["prj.overdue", "prj.silent", "prj.blockers", "rep.tasks", "prj.physical"], charts: ["DCON-C-PRJ-OVERDUE", "DCON-C-PRJ-STATUS", "DCON-C-PRJ-CONFLICTS"] },
  { key: "estimating", id: "DCON-D-ET", dept: "ET", en: "Tenders & estimating", ar: "العطاءات والتقدير", metrics: ["et.open_tenders", "et.awaiting", "et.win_rate", "et.expired_rates"], charts: ["DCON-C-ET-STATUS", "DCON-C-ET-BID", "DCON-C-ET-RATES", "DCON-C-ET-EST"] },
  { key: "commercial", id: "DCON-D-CON", dept: "CON", en: "Client commercial", ar: "الموقف التجاري مع العملاء", metrics: ["con.claimed", "con.certified", "con.invoiced", "con.collected", "con.overdue", "con.over_invoiced"], charts: ["DCON-C-CON-CERT", "DCON-C-CON-AGING", "DCON-C-CON-CLAIMS"] },
  { key: "subcontracts", id: "DCON-D-SUB", dept: "SUB", en: "Subcontracts", ar: "مقاولو الباطن", metrics: ["fin.retention", "fin.sub_out"], charts: ["DCON-C-SUB-POS", "DCON-C-SUB-RET"] },
  { key: "cost", id: "DCON-D-CST", dept: "CST", en: "Budget & cost", ar: "الموازنة والتكلفة", metrics: ["cst.budget", "cst.committed", "cst.actual", "cst.eac", "cst.drafts", "cst.forecasts", "cst.exceptions_open", "cst.unmapped"], charts: ["DCON-C-EXEC-COST", "DCON-C-CST-SOURCES", "DCON-C-CST-DOCS", "DCON-C-CST-EXCEPTIONS"] },
  { key: "procurement", id: "DCON-D-PROC", dept: "PROC", en: "Procurement", ar: "المشتريات", metrics: ["proc.mr", "proc.po", "proc.rni", "proc.inp"], charts: ["DCON-C-PROC-COMMIT", "DCON-C-PROC-MR", "DCON-C-PROC-RNI"] },
  { key: "materials", id: "DCON-D-MAT", dept: "MAT", en: "Materials & stock", ar: "المواد والمخزون", metrics: ["proc.po", "proc.rni"], charts: ["DCON-C-MAT-BAL", "DCON-C-MAT-ISSUED"] },
  { key: "resources", id: "DCON-D-RSP", dept: "RSP", en: "Resources", ar: "الموارد", metrics: ["rsp.ot", "rsp.hours_review", "rsp.equip", "rsp.petty", "rsp.exp"], charts: ["DCON-C-RSP-OT", "DCON-C-RSP-MH", "DCON-C-RSP-SPEND"] },
  { key: "finance", id: "DCON-D-FIN", dept: "FIN", en: "Finance & cash", ar: "المالية والنقد", metrics: ["fin.cash_in", "fin.cash_out", "mgt.receivable", "proc.inp", "fin.client_retention", "fin.advances", "fin.final"], charts: ["DCON-C-FIN-CASH", "DCON-C-FIN-RET", "DCON-C-FIN-PAY"] },
  { key: "data-quality", id: "DCON-D-DQ", dept: "DQ", en: "Data quality & exceptions", ar: "جودة البيانات والاستثناءات", metrics: ["con.over_invoiced", "prj.blockers", "et.expired_rates", "prj.silent"], charts: ["DCON-C-PRJ-CONFLICTS"] },
  { key: "project-360", id: "DCON-D-P360", dept: "PRJ", en: "Project 360 (project scope)", ar: "المشروع 360 (نطاق المشروع)", metrics: ["mgt.certified", "con.invoiced", "con.collected", "cst.eac", "prj.overdue", "proc.po"], charts: ["DCON-C-EXEC-REVENUE", "DCON-C-EXEC-COST", "DCON-C-CST-SOURCES", "DCON-C-PRJ-STATUS"] },
];
export const dashboardByKey = (k: string) => DASHBOARDS.find((d) => d.key === k);

/**
 * Arabic display text of the seeded Insights records (chart, Number chart and dashboard titles, measure labels) for the
 * plugin translation overlay, so the Insights editor shows the workbook in Arabic while the stored titles stay English.
 */
export function analyticsTranslations(): Record<string, string> {
  const out: Record<string, string> = { "DIGIT Construction": "ديجيت للمقاولات", "DIGIT Construction (read models)": "ديجيت للمقاولات (نماذج القراءة)" };
  for (const m of METRICS) out[m.en] = m.ar;
  for (const c of CHARTS) { out[c.en] = c.ar; for (const x of c.measures) if (x.en !== "Count") out[x.en] = x.ar; }
  for (const d of DASHBOARDS) { out[d.en] = d.ar; out[`DIGIT Construction — ${d.en}`] = `ديجيت للمقاولات — ${d.ar}`; }
  return out;
}
