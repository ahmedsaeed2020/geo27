/** Report centre (MGT-04), report runner and the integration map (MGT-05). Reports run the same read models as every workspace. */
import { BudgetVsActualSummary } from "./costScreens";
import { DevOnly } from "@/components/DevOnly";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ensureMetas } from "@/lib/catalog";
import { translateTo } from "@/i18n";
import { formatRowAnchor } from "@/lib/rowAnchor";
import { canReadType } from "@/lib/scope";
import type { PluginPageProps } from "@/plugins/pages";
import type { PluginReport } from "@/plugins/types";
import { CONSTRUCTION_REPORTS } from "../reports";
import { COL_AR_RUN4, REPORT_VALUE_AR, UI_AR, uomLabel } from "../i18n";
import { DOCTYPE_AR, OPTION_AR } from "../schema";
import { ACTION_AR } from "../workflows";
import { isFrappeHost } from "../domain/host";
import { APP, get, linkTitle, list, projectTitle } from "../domain/data";
import { constructionProjects } from "../domain/queues";
import { projectRequired, reportRows } from "../analytics/reportRows";
import { filterRows, metricById, type RowFilter } from "../analytics/metrics";
import { ROLE_AR, SavedViewsBar } from "./layoutEditor";
import { AppLink, DataTable, DocRef, Empty, Field, Filters, inputCls, ListRef, Note, OWN, PageHeader, ProjectRef, Section, STATE_AR, useCx, type Col, BTN } from "./kit";

/** Arabic for report column labels not in the app overlay (kept local so common words never override other apps). */
const COL_AR: Record<string, string> = {
  Project: "المشروع", Customer: "العميل", Tender: "المنافسة", Title: "العنوان", Status: "الحالة", "Submission Deadline": "موعد التقديم", "Client Contract": "عقد العميل", "Client Claim": "مطالبة العميل",
  "Sales Invoice": "فاتورة المبيعات", "Due Date": "تاريخ الاستحقاق", "Work Order": "أمر العمل", Subcontractor: "مقاول الباطن", "Cost Code": "رمز التكلفة", Description: "الوصف", Category: "الفئة",
  ETC: "التكلفة المتبقية المتوقعة", EAC: "التكلفة المتوقعة عند الإنجاز", "Material Request": "طلب المواد", "Purchase Order": "أمر الشراء", "Overtime Hours": "ساعات العمل الإضافي", Company: "الشركة",
  "Project Cost Sources": "مصادر تكلفة المشروع", Measure: "المقياس", "Source Type": "نوع المصدر", "Source Document": "المستند المصدر", Row: "السطر", "Item / Account": "الصنف / الحساب", "As of": "حتى تاريخ", Amount: "المبلغ",
  Exception: "الاستثناء", Severity: "الخطورة", Review: "المراجعة",
};
/** Drill chip display: operator sign and a readable value (Check → Yes/No, project → title); display only, the URL keeps the raw filter. */
const OP_SIGN: Record<string, string> = { "=": "=", "!=": "≠", ">": ">", "<": "<", ">=": "≥", "<=": "≤", in: "∈", not_in: "∉" };
function chipValue(report: PluginReport, col: string, v: unknown, ar: boolean): string {
  const ft = report.columns.find((c) => c.fieldname === col)?.fieldtype;
  if (ft === "Check") return Number(v) ? (ar ? "نعم" : "Yes") : (ar ? "لا" : "No");
  if (col === "project") { const p = get("Project", String(v)); return p ? projectTitle(p, !ar) : String(v); }
  return Array.isArray(v) ? v.map(String).join("، ") : String(v);
}
export const colLabel = (label: string, ar: boolean) => (ar ? UI_AR[label] ?? COL_AR[label] ?? COL_AR_RUN4[label] ?? label : label);
export const reportTitle = (name: string, ar: boolean) => (ar ? UI_AR[name] ?? name : name);
/** In-app link to a report with its filters in the URL (the report page reads them back), e.g. reportLink("Project Cost Sources", { project, measure: "Actual" }). */
export const reportLink = (name: string, f: Record<string, string | undefined> = {}) => {
  const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => !!v) as [string, string][]).toString();
  return `reports/${encodeURIComponent(name)}${qs ? `?${qs}` : ""}`;
};
export { projectRequired };
/** Explicit "all construction projects" choice of a project-required report (never a silent default). */
export const ALL_PROJECTS = "__all__";
/** Row filters of a drill (`rf` URL param: JSON [column, operator, value][]); invalid input is ignored. */
export function parseRowFilters(v: unknown): RowFilter[] {
  if (typeof v !== "string" || !v) return [];
  try { const x = JSON.parse(v) as unknown; return Array.isArray(x) ? x.filter((f): f is RowFilter => Array.isArray(f) && typeof f[0] === "string" && typeof f[1] === "string") : []; } catch { return []; }
}
/** Rows of a report for filters (company / project / report filters) and drill row filters — the same rows cards and Insights charts sum. */
export function reportResult(report: PluginReport, filters: Record<string, unknown>, rowFilters: RowFilter[] = []) {
  const { company, project, ...extra } = filters;
  const scope = { company: (company as string) || undefined, project: project === ALL_PROJECTS ? undefined : ((project as string) || undefined) };
  const all = reportRows(report.name, scope, Object.fromEntries(Object.entries(extra).filter(([, v]) => v !== undefined && v !== "")));
  return { all, rows: filterRows(all, rowFilters) };
}
/** Display-only Arabic for the measure values of Project Cost Sources (stored/filter values stay English). */
const MEASURE_AR: Record<string, string> = { Commitment: "التزام", Actual: "فعلي" };
/** Display-only Arabic for Project Material Movements `move` values (report rows and filter options keep the English value). */
export const MOVE_AR: Record<string, string> = { Receipt: "استلام", "Return to Supplier": "مرتجع للمورد", "Issue to Work": "صرف للأعمال", "Transfer In": "تحويل وارد", "Transfer Out": "تحويل صادر", "Other Receipt": "وارد آخر", "Other Issue": "صادر آخر" };
/** Display-only Arabic for Cost Source Exceptions status values. */
const EX_STATUS_AR: Record<string, string> = { Open: "مفتوح", Reviewed: "تمت المراجعة", "Correction requested": "طُلب التصحيح" };
const optionLabel = (fieldname: string, v: string, ar: boolean) => (ar && fieldname === "decision" ? ACTION_AR[v] ?? v : ar && fieldname === "measure" ? MEASURE_AR[v] ?? v : ar && fieldname === "move" ? MOVE_AR[v] ?? v : ar && fieldname === "status" ? EX_STATUS_AR[v] ?? codedValue(v, ar) : ar && fieldname === "document_type" ? DOCTYPE_AR[v] ?? translateTo(v, "ar") : codedValue(v, ar));
/** Report columns that carry coded English values (statuses, flags, buckets); record content columns are never translated. */
const CODED = new Set(["risk", "risk_reason", "technical", "commercial", "financial", "final_state", "validity", "state", "status", "task_status", "bucket", "age_bucket", "origin", "change_kind", "variance_status", "recon_status", "delivery_status", "entered_basis", "flags", "exception", "sov_line_key", "waiting_on", "action_basis", "from_state", "to_state", "current_state", "followup_state"]);
const SLIP = /^Schedule slip (\d+) days$/, OVERDUE = /^(\d+) overdue tasks$/;
/** Display-only Arabic of a coded value ("; "-joined lists part by part); unknown values are shown as stored. */
export function codedValue(v: string, ar: boolean): string {
  if (!ar || !v) return v;
  return v.split("; ").map((x) => { const m = SLIP.exec(x), o = OVERDUE.exec(x); return m ? `انزلاق الجدول ${m[1]} يوماً` : o ? `${o[1]} مهام متأخرة` : REPORT_VALUE_AR[x] ?? ROLE_AR[x] ?? OPTION_AR[x] ?? STATE_AR[x] ?? EX_STATUS_AR[x] ?? x; }).join("؛ ");
}

export const REPORT_DEPT: Record<string, [string, string, string]> = {
  "Construction Portfolio Status": ["MGT", "Portfolio contract, cost and schedule position per project.", "موقف العقد والتكلفة والجدول لكل مشروع."],
  "Tender Pipeline": ["ET", "Open and decided tenders with estimate cost, bid value and deadline.", "العطاءات المفتوحة والمحسومة مع التكلفة وقيمة العرض والموعد."],
  "Client Contract Position": ["CON", "Original, variations, certified, retention, invoiced and collected per contract.", "الأصلي والتغييرات والمعتمد والمحتجزات والمفوتر والمحصل لكل عقد."],
  "Claims and Certificates Register": ["CON", "Every claim with its certificate and sales invoice.", "كل مطالبة مع شهادتها وفاتورة المبيعات."],
  "Construction Receivables Aging": ["FIN", "Outstanding client invoices by aging bucket.", "فواتير العملاء المستحقة حسب فئة العمر."],
  "Subcontract Position": ["SUB", "Work order value, certified measurement, billed, retention, invoiced and paid.", "قيمة أمر العمل والقياس المعتمد والمستخلص والمحتجزات والمفوتر والمدفوع."],
  "Project Cost Report": ["CST", "Budget, commitments, actuals, ETC and EAC by cost code.", "الموازنة والالتزامات والفعلي والمتبقي والمتوقع حسب رمز التكلفة."],
  "Project Cost Sources": ["CST", "Every purchase order, work order, purchase invoice and journal row behind the project's commitments and actual cost.", "كل سطر أمر شراء وأمر عمل وفاتورة شراء وقيد يقف خلف التزامات المشروع وتكلفته الفعلية."],
  "Cost Source Exceptions": ["CST", "Cost rows and approved documents that make a cost figure doubtful (unmapped codes, possible double counts, bills not invoiced, expenses not posted), with their review status.", "سطور التكلفة والمستندات المعتمدة التي تجعل رقم التكلفة موضع شك (رموز غير مخصّصة، احتمال احتساب مزدوج، مستخلصات غير مفوترة، مصروفات غير مرحّلة) مع حالة مراجعتها."],
  "Material Request Status": ["PROC", "Material requests with ordering and receipt progress.", "طلبات المواد مع تقدم الطلب والاستلام."],
  "Project Material Balance": ["PROC", "Per item: requested, ordered, received, returned, issued to work and the project's balance at site, from the stock ledger.", "لكل صنف: المطلوب والمطلوب بأوامر شراء والمستلم والمرتجع والمصروف للأعمال ورصيد المشروع في الموقع من دفتر المخزون."],
  "Project Material Movements": ["PROC", "Every stock ledger row of the project's receipts, returns and issues, opening the exact source row.", "كل حركة مخزون لاستلامات المشروع ومرتجعاته وصرفه، وتفتح السطر المصدر نفسه."],
  "Resource Utilization": ["RSP", "Crews, man-days, overtime, machine hours and site spend per project.", "الطواقم وأيام العمل والإضافي وساعات المعدات والمصروفات لكل مشروع."],
  "Construction Cashflow": ["FIN", "Actual collections and payments plus forecast items by month.", "التحصيل والمدفوعات الفعلية مع بنود التوقع حسب الشهر."],
  "Retention and Advances": ["FIN", "Client advance recovery and retention held/released per contract.", "استرداد الدفعة المقدمة والمحتجزات لكل عقد."],
  "Closeout Readiness": ["FIN", "Technical, commercial and financial closeout status per project.", "حالة الإغلاق الفني والتجاري والمالي لكل مشروع."],
  "BOQ Estimate Variance": ["ET", "Each BOQ line against the estimate line it came from: quantity, rate and amount differences (BOQ − estimate), lines added in the BOQ and estimate lines it dropped. No tolerance is applied.", "كل بند في جدول الكميات مقابل بند التقدير الذي جاء منه: فروق الكمية والسعر والمبلغ (الجدول − التقدير)، والبنود المضافة في الجدول وبنود التقدير المحذوفة. لا يُطبق أي هامش سماح."],
  "Assembly Components": ["ET", "Every assembly component with its rate master's current rate and validity, its share of the assembly unit cost and checks (stored rate differs, expired or disabled rate, unit differs).", "كل مكون في المركّبات مع السعر الحالي وصلاحيته من سجل الأسعار وحصته من تكلفة وحدة المركّبة والفحوصات (اختلاف السعر المحفوظ، سعر منتهٍ أو معطل، اختلاف الوحدة)."],
  "BOQ Measurement Reconciliation": ["CON", "Per contract schedule-of-values line: original and revised quantity, claimed to date (latest claim), certified, rejected and disputed quantities and what remains, with reconciliation flags.", "لكل بند في جدول قيم العقد: الكمية الأصلية والمعدلة، والمطالب به حتى تاريخه (آخر مطالبة)، والمعتمد والمرفوض والمتنازع عليه والمتبقي، مع مؤشرات المطابقة."],
  "Variations Register": ["CON", "Every client variation line with pending, approved and rejected amounts kept apart (only approved amounts enter the revised contract value) and whether it is in the contract SOV.", "كل بند تغيير للعميل مع فصل المبالغ المعلقة والمعتمدة والمرفوضة (المعتمد فقط يدخل قيمة العقد المعدلة) وهل أُضيف إلى جدول قيم العقد."],
  "Decision Follow-up": ["MGT", "Each workflow decision (approve, reject, return, certify or review) from the workflow log, with the follow-up assignments explicitly linked to it. Other assignments on the same document are counted separately. No response-time target is defined.", "كل قرار في سير العمل (اعتماد أو رفض أو إرجاع أو اعتماد كميات أو مراجعة) من سجل سير العمل، مع تكليفات المتابعة المرتبطة به صراحة. تُحتسب التكليفات الأخرى على المستند نفسه منفصلة. لم يُحدد زمن استجابة مستهدف."],
  "Approval Aging": ["MGT", "Documents waiting for a decision (approve, reject, return, certify or review): since when (workflow log, else last change), the roles that decide, assigned users and age. No SLA is defined yet.", "المستندات المنتظرة لقرار (اعتماد أو رفض أو إرجاع أو اعتماد كميات أو مراجعة): منذ متى (سجل سير العمل وإلا آخر تعديل)، والأدوار صاحبة القرار، والمستخدمون المسند إليهم، والعمر. لم تُحدد مهلة خدمة بعد."],
  "Measurement Availability and Exceptions": ["SUB", "Per work-order line: ordered, measured, pending review, accepted, billed, still available to measure and accepted not billed, with exception flags.", "لكل بند في أمر العمل: المطلوب والمقاس وبانتظار المراجعة والمقبول والمستخلص والمتاح للقياس والمقبول غير المستخلص، مع مؤشرات الاستثناء."],
  "Supply Progress and On-time Delivery": ["PROC", "Per purchase-order line: ordered, received, returned and remaining quantity, the date it was fully received and whether that was by its schedule date (no tolerance), with each supplier's on-time rate.", "لكل بند في أمر الشراء: الكمية المطلوبة والمستلمة والمرتجعة والمتبقية، وتاريخ اكتمال الاستلام وهل كان قبل تاريخه المجدول (بلا هامش سماح)، مع نسبة التزام كل مورد بالمواعيد."],
  "Baseline Finish Variance": ["PRJ", "Current task dates against the approved stage-plan baseline in calendar days; tasks outside the baseline are listed. A project without an approved baseline shows no rows.", "تواريخ المهام الحالية مقابل خط الأساس في خطة المراحل المعتمدة بالأيام التقويمية، مع المهام خارج خط الأساس. لا تظهر صفوف لمشروع بلا خط أساس معتمد."],
  // R19 — the supplied source snapshot's seven reports (reportsR19.ts ports their formulas)
  "Change Exposure": ["CON", "Every change event with its cost impact: open exposure while under review or pricing, approved but not yet a variation, age and pricing overdue.", "كل حدث تغيير مع أثره على التكلفة: التعرض المفتوح أثناء المراجعة أو التسعير، المعتمد ولم يصبح أمر تغيير بعد، العمر وتأخر التسعير."],
  "Commercial Claims Register": ["CON", "Commercial claims with notice dates, late notice and claimed, assessed, agreed and disputed amounts.", "المطالبات التجارية مع تواريخ الإشعار والإشعار المتأخر والمبالغ المطالب بها والمقيّمة والمتفق عليها والمتنازع عليها."],
  "Contract Line Margin": ["CST", "Per contract pay item: value, certified, actual cost, EAC, margin and pay-vs-cost. Cost reaches a pay item only through the budget line's pay item.", "لكل بند دفع في العقد: القيمة والمعتمد والتكلفة الفعلية والتكلفة المتوقعة عند الإنجاز والهامش والمدفوع مقابل التكلفة. لا تصل التكلفة إلى البند إلا عبر بند الدفع في سطر الموازنة."],
  "Open Commitments": ["CST", "Open commitments per source line: original, relieved (invoiced or billed) and open.", "الالتزامات المفتوحة لكل سطر مصدر: الأصلي والمُخفَّض (المفوتر أو المستخلص) والمفتوح."],
  "Risk Quality Outstanding Actions": ["PRJ", "Open risks, RFIs and defects in one list with severity, responsible, due date, age and overdue.", "المخاطر وطلبات الاستيضاح والعيوب المفتوحة في قائمة واحدة مع الخطورة والمسؤول والاستحقاق والعمر والتأخر."],
  "Site Labour and Equipment Register": ["RSP", "Daily attendance per crew with trade, overtime and the equipment mobilised on the same project and date.", "الحضور اليومي لكل طاقم مع الحرفة والعمل الإضافي والمعدات المحشودة في المشروع والتاريخ نفسه."],
  "Tender Pipeline and Awards": ["ET", "Tenders with their award decision; the win rate counts resolved tenders only (won ÷ (won + lost)).", "العطاءات مع قرار الترسية؛ نسبة الفوز تحسب العطاءات المحسومة فقط (الفائزة ÷ (الفائزة + الخاسرة))."],
  // R19 — design-contract reports (reportsR19Contract.ts) over existing read models
  "Budget vs Actual": ["CST", "Per approved budget line: original, revisions, transfers, revised budget, committed, actual, remaining and EAC — the same lines as the cost sheet; cost without a budget line is listed as unallocated.", "لكل بند موازنة معتمد: الأصلي والتعديلات والمناقلات والموازنة المعدلة والملتزم والفعلي والمتبقي والتكلفة المتوقعة — نفس بنود ورقة التكلفة؛ والتكلفة بلا بند موازنة تظهر كغير موزعة."],
  "RFI Aging": ["PRJ", "Open RFIs by days since they were sent, with due date, overdue flag and who holds the action.", "طلبات الاستيضاح المفتوحة حسب الأيام منذ إرسالها مع تاريخ الاستحقاق والتأخر ولدى من الإجراء."],
  "Submittal Log": ["PRJ", "Every submittal with type, revision, decision code, planned and actual return and days late.", "كل المقدمات مع النوع والمراجعة ورمز القرار والإعادة المخططة والفعلية وأيام التأخير."],
  "Team Workload": ["MGT", "Active project-team assignments per person across construction projects, with total allocation % (only where recorded).", "التكليفات النشطة في فرق المشاريع لكل شخص عبر مشاريع المقاولات مع إجمالي نسبة التخصيص (حيث سُجلت فقط)."],
  "Bid Comparison": ["ET", "Each subcontract bid ranked within its bid package, with the difference from the lowest bid and the awarded supplier.", "كل عرض باطن مرتب داخل حزمته مع الفرق عن أقل عرض والمورد الذي رُسيت عليه."],
  "Compliance Expiry": ["RSP", "Subcontractor commercial registration and insurance expiry — the only compliance dates the source records; work permits and inductions have no source document.", "انتهاء السجل التجاري والتأمين لمقاولي الباطن — تواريخ الامتثال الوحيدة في المصدر؛ لا يوجد مستند مصدر لتصاريح العمل أو التهيئة."],
  "Project Profitability": ["FIN", "Management view per project: earned (certified) value against purchase-basis actual cost, and forecast margin against EAC. Not a general-ledger report.", "عرض إداري لكل مشروع: القيمة المكتسبة (المعتمدة) مقابل التكلفة الفعلية على أساس الشراء، والهامش المتوقع مقابل التكلفة المتوقعة. ليس تقريرًا من دفتر الأستاذ العام."],
};

const kindOf = (c: PluginReport["columns"][number]): Col<Record<string, unknown>>["kind"] => {
  if (c.fieldtype === "Currency") return "money";
  if (c.fieldtype === "Percent") return "pct";
  if (c.fieldtype === "Int" || c.fieldtype === "Float") return "num";
  if (c.fieldtype === "Date") return "date";
  if (c.fieldtype === "Check") return "check";
  if (c.fieldtype === "Link") return c.options === "Project" ? "project" : "doc";
  if (/status|state/i.test(c.fieldname)) return "state";
  return "text";
};
/** Link column cell: the ID opens the record; its title (stored record content) shows underneath. */
function LinkCell({ doctype, name }: { doctype: string; name: unknown }) {
  const title = linkTitle(doctype, name);
  return <span className="inline-flex flex-col">{doctype === "Project" ? <ProjectRef project={String(name ?? "")} /> : <DocRef doctype={doctype} name={name} />}{title && <span className="text-xs text-muted-foreground" data-no-i18n>{title}</span>}</span>;
}
/** Runs a report with filters and renders its columns (Link columns drill to the source record and show its title). */
/** `rows`: rows the caller already computed with the same reportResult (e.g. an as-of run); otherwise the table runs the report itself. */
export function ReportTable({ report, filters, pageSize, rowFilters, rows: given }: { report: PluginReport; filters: Record<string, unknown>; pageSize?: number; rowFilters?: RowFilter[]; rows?: Record<string, unknown>[] | undefined }) {
  const { t, ar } = useCx();
  const linkTypes = [...new Set(report.columns.filter((c) => c.fieldtype === "Link" && c.options).map((c) => c.options!))];
  // titles need the linked DocTypes' meta (title_field); re-render once it is loaded
  const metas = useQuery({ queryKey: ["construction-link-meta", report.ref_doctype, ...linkTypes], queryFn: async () => { await ensureMetas([report.ref_doctype, ...linkTypes]); return true; }, staleTime: Infinity });
  // a user who cannot read the report's source DocType sees a denial, never an empty result that looks like "no data"
  if (metas.data && !canReadType(report.ref_doctype)) return <Note tone="bad">{t("Your role cannot read the source records of this report.", "لا يسمح دورك بقراءة السجلات المصدر لهذا التقرير.")} <span data-no-i18n>({ar ? DOCTYPE_AR[report.ref_doctype] ?? translateTo(report.ref_doctype, "ar") : report.ref_doctype})</span></Note>;
  let rows: Record<string, unknown>[] = []; let error = "";
  if (given) rows = given; else try { rows = reportResult(report, filters, rowFilters).rows; } catch (e) { error = (e as Error).message; }
  if (error) return <Note tone="bad">{t("The report could not run: ", "تعذر تشغيل التقرير: ")}<span data-no-i18n>{error}</span></Note>;
  const cols: Col<Record<string, unknown>>[] = report.columns.map((c) => {
    const base = { key: c.fieldname, label: colLabel(c.label, ar), total: c.fieldtype === "Currency" && report.name !== "Construction Cashflow" ? true : undefined };
    // Dynamic Link: the row's own DocType column (options) decides which form opens — the exact source document.
    if (c.fieldtype === "Dynamic Link") return { ...base, render: (r: Record<string, unknown>) => <DocRef doctype={String(r[c.options ?? ""] ?? "")} name={r[c.fieldname]} row={formatRowAnchor(r["source_table"] as string | undefined, r["row_no"])} /> } as Col<Record<string, unknown>>;
    // the DocType column feeding a Dynamic Link shows the DocType's display name (stored value stays the DocType name)
    if (report.columns.some((x) => x.fieldtype === "Dynamic Link" && x.options === c.fieldname)) return { ...base, render: (r: Record<string, unknown>) => { const dt = String(r[c.fieldname] ?? ""); return <span data-no-i18n>{ar ? DOCTYPE_AR[dt] ?? translateTo(dt, "ar") : dt}</span>; } } as Col<Record<string, unknown>>;
    // cost category is a stored Select option value — Arabic display label, stored value unchanged
    // exception / severity / detail values that are stored option values (Cost Source Exceptions, site-expense categories) — Arabic display only
    if (c.fieldname === "exception" || c.fieldname === "severity" || c.fieldname === "detail") return { ...base, render: (r: Record<string, unknown>) => { const v = String(r[c.fieldname] ?? ""); return <span data-no-i18n>{v ? (ar ? OPTION_AR[v] ?? codedValue(v, ar) : v) : "—"}</span>; } } as Col<Record<string, unknown>>;
    // workflow decision actions ("Approve", or "Approve / Reinstate" when the log cannot tell them apart): the same Arabic as the action buttons
    if (c.fieldname === "decision") return { ...base, render: (r: Record<string, unknown>) => { const v = String(r["decision"] ?? ""); return <span data-no-i18n data-coded="decision">{v ? (ar ? v.split(" / ").map((x) => ACTION_AR[x] ?? x).join(" / ") : v) : "—"}</span>; } } as Col<Record<string, unknown>>;
    if (c.fieldname === "category") return { ...base, render: (r: Record<string, unknown>) => { const v = String(r["category"] ?? ""); return <span data-no-i18n>{ar ? OPTION_AR[v] ?? v : v}</span>; } } as Col<Record<string, unknown>>;
    // coded status / flag values (risk, validity, closeout, variance, delivery …): Arabic display only, stored value unchanged
    if (c.fieldtype === "Data" && CODED.has(c.fieldname)) return { ...base, render: (r: Record<string, unknown>) => { const v = String(r[c.fieldname] ?? ""); return <span data-no-i18n data-coded={c.fieldname}>{v ? codedValue(v, ar) : "—"}</span>; } } as Col<Record<string, unknown>>;
    if (c.fieldname === "measure" || c.fieldname === "move") return { ...base, render: (r: Record<string, unknown>) => <span data-no-i18n>{optionLabel(c.fieldname, String(r[c.fieldname] ?? ""), ar)}</span> } as Col<Record<string, unknown>>;
    // unit of measure is a stored UOM name — shown through the shared dictionary in Arabic, stored value unchanged
    if (c.fieldname === "uom") return { ...base, render: (r: Record<string, unknown>) => { const v = String(r["uom"] ?? ""); return <span data-no-i18n>{uomLabel(v, ar)}</span>; } } as Col<Record<string, unknown>>;
    if (c.fieldtype === "Link" && c.options) { const dt = c.options; return { ...base, kind: kindOf(c), doctype: dt, render: (r: Record<string, unknown>) => <LinkCell doctype={dt} name={r[c.fieldname]} /> } as Col<Record<string, unknown>>; }
    return { ...base, kind: kindOf(c), doctype: c.options } as Col<Record<string, unknown>>;
  });
  return <DataTable rows={rows.map((r, i) => ({ ...r, __k: i }))} rowKey={(_, i) => String(i)} cols={cols} empty={t("No rows for these filters", "لا صفوف لهذه المرشحات")} caption={reportTitle(report.name, ar)} pageSize={pageSize ?? 100} />;
}
export function toCsv(report: PluginReport, rows: Record<string, unknown>[]) {
  const esc = (v: unknown) => { const s = v === null || v === undefined ? "" : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return [report.columns.map((c) => esc(c.label)).join(","), ...rows.map((r) => report.columns.map((c) => esc(r[c.fieldname])).join(","))].join("\n");
}

export function ReportsCentrePage() {
  const { t, ar } = useCx();
  const groups = ["MGT", "PRJ", "ET", "CON", "SUB", "CST", "PROC", "RSP", "FIN"];
  const label: Record<string, [string, string]> = { MGT: ["Management", "الإدارة"], PRJ: ["Projects & execution", "المشاريع والتنفيذ"], ET: ["Estimating & tenders", "التقدير والعطاءات"], CON: ["Contracts & claims", "العقود والمستخلصات"], SUB: ["Subcontracts", "مقاولو الباطن"], CST: ["Budget & cost", "الموازنة والتكلفة"], PROC: ["Procurement & materials", "المشتريات والمواد"], RSP: ["Resources & spend", "الموارد والمصروفات"], FIN: ["Financial position & closeout", "الموقف المالي والإغلاق"] };
  const rest = CONSTRUCTION_REPORTS.filter((r) => !REPORT_DEPT[r.name]);
  return (
    <div className="w-full min-w-0" data-page="construction-reports">
      <PageHeader title={t("Report centre", "مركز التقارير")} subtitle={t("Script reports computed from the same records as the workspaces. Native DIGIT reports (General Ledger, Accounts Receivable, Stock Balance…) remain available in the Desk.", "تقارير محسوبة من نفس سجلات المساحات. تبقى تقارير DIGIT الأصلية (دفتر الأستاذ، الذمم المدينة، رصيد المخزون…) متاحة في المكتب.")} />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-2">
        {groups.map((g) => {
          const rs = CONSTRUCTION_REPORTS.filter((r) => REPORT_DEPT[r.name]?.[0] === g);
          if (!rs.length) return null;
          return (
            <Section key={g} title={ar ? label[g]![1] : label[g]![0]}>
              <ul className="space-y-2" role="list">{rs.map((r) => <li key={r.name}><AppLink to={`reports/${encodeURIComponent(r.name)}`} className="font-medium text-primary hover:underline">{reportTitle(r.name, ar)}</AppLink><p className="text-xs text-muted-foreground">{ar ? REPORT_DEPT[r.name]?.[2] : REPORT_DEPT[r.name]?.[1]}</p></li>)}</ul>
            </Section>
          );
        })}
        {rest.length > 0 && (
          <Section title={t("Row-level operational reports", "تقارير تشغيلية على مستوى السطر")}>
            <p className="mb-2 text-xs text-muted-foreground">{t("One row per source document line; KPI cards and Insights charts drill into these.", "صف لكل سطر مستند مصدر؛ تفتحها بطاقات المؤشرات ومخططات التحليلات.")}</p>
            <ul className="space-y-1" role="list" data-report-group="ops">{rest.map((r) => <li key={r.name}><AppLink to={`reports/${encodeURIComponent(r.name)}`} className="font-medium text-primary hover:underline">{reportTitle(r.name, ar)}</AppLink></li>)}</ul>
          </Section>
        )}
      </div>
    </div>
  );
}

/** Report runner. Filter state lives in the URL (?company=&project=&measure=…), so reload, Back and deep links reopen the same scope; projects are construction projects the session user may read. */
export function ReportPage({ params }: PluginPageProps) {
  const { t, ar } = useCx();
  const name = params["report"] ?? "";
  const search = useRouterState({ select: (s) => s.location.search as Record<string, unknown> });
  const nav = useNavigate();
  const report = CONSTRUCTION_REPORTS.find((r) => r.name === name);
  const projects = constructionProjects();
  const companies = [...new Set(projects.map((p) => String(p["company"] ?? "")))].filter(Boolean);
  if (!report) return <div className="p-6"><PageHeader title={t("Report not found", "التقرير غير موجود")} crumbs={[{ label: t("Report centre", "مركز التقارير"), to: "reports" }]} /><Empty><span data-no-i18n>{name}</span></Empty></div>;
  const needsProject = projectRequired(report);
  const val = (k: string) => (typeof search[k] === "string" ? String(search[k]) : "");
  const company = val("company");
  const scoped = projects.filter((p) => !company || p["company"] === company);
  const asked = val("project");
  // a project-required report runs only for the project named in the URL — never a silent first project; the user picks one below
  const project = asked;
  const projectOk = !project || (project === ALL_PROJECTS && needsProject) || scoped.some((p) => p.name === project);
  const set = (patch: Record<string, string>) => void nav({ to: "/plugins/$name/$", params: { name: APP, _splat: `reports/${report.name}` }, search: Object.fromEntries(Object.entries({ ...search, ...patch }).filter(([, v]) => v !== "" && v !== undefined)) as never, replace: true });
  const extra = (report.filters ?? []).filter((f) => f.fieldname !== "company" && f.fieldname !== "project");
  const filters: Record<string, unknown> = { company: company || undefined, project: projectOk ? project || undefined : "__not_permitted__" };
  for (const f of extra) if (val(f.fieldname)) filters[f.fieldname] = val(f.fieldname);
  const rf = parseRowFilters(search["rf"]);
  const metric = metricById(val("metric"));
  const res = projectOk && (!needsProject || project) ? reportResult(report, filters, rf) : { all: [], rows: [] };
  const dropRf = (i: number) => set({ rf: rf.length > 1 ? JSON.stringify(rf.filter((_, j) => j !== i)) : "", metric: "", chart: "" });
  const download = () => {
    const rows = res.rows;
    const blob = new Blob(["\ufeff" + toCsv(report, rows)], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `${report.name}.csv`; a.click(); URL.revokeObjectURL(a.href);
  };
  const hasF = (f: string) => report.filters?.some((x) => x.fieldname === f);
  return (
    <div className="w-full min-w-0" data-page="construction-report" data-report={report.name} data-report-project={projectOk ? project : undefined}>
      <PageHeader title={reportTitle(report.name, ar)} crumbs={[{ label: t("Report centre", "مركز التقارير"), to: "reports" }, ...(project && projectOk && project !== ALL_PROJECTS ? [{ label: t("Project 360", "المشروع 360"), to: `project/${encodeURIComponent(project)}` }] : [])]} subtitle={ar ? REPORT_DEPT[report.name]?.[2] : REPORT_DEPT[report.name]?.[1]}
        actions={<><button type="button" className={BTN.secondary} onClick={download}>{t("Export CSV", "تصدير CSV")}</button><ListRef doctype={report.ref_doctype} className={BTN.secondary}>{t("Source documents", "المستندات المصدر")}</ListRef></>} />
      <SavedViewsBar report={report.name} />
      <Filters>
        {hasF("company") && companies.length > 0 && <Field label={t("Company", "الشركة")}><select className={inputCls} value={company} data-report-filter="company" onChange={(e) => set({ company: e.target.value, project: scoped.some((p) => p.name === asked && (!e.target.value || p["company"] === e.target.value)) ? asked : "" })}><option value="">{t("All", "الكل")}</option>{companies.map((c) => <option key={c} value={c} data-no-i18n>{c}</option>)}</select></Field>}
        {hasF("project") && <Field label={t("Project", "المشروع")}><select className={inputCls} value={projectOk ? project : ""} data-report-filter="project" onChange={(e) => set({ project: e.target.value })}>{(!needsProject || !projectOk || !project) && <option value="">{needsProject ? t("Select a project", "اختر مشروعاً") : t("All", "الكل")}</option>}{needsProject && scoped.length > 1 && <option value={ALL_PROJECTS}>{t("All construction projects (combined)", "كل مشاريع المقاولات (مجمعة)")}</option>}{scoped.map((p) => <option key={p.name} value={p.name} data-no-i18n>{projectTitle(p, !ar)}</option>)}</select></Field>}
        {extra.map((f) => (
          <Field key={f.fieldname} label={colLabel(f.label, ar)}>
            {f.fieldtype === "Select"
              ? <select className={inputCls} value={val(f.fieldname)} data-report-filter={f.fieldname} onChange={(e) => set({ [f.fieldname]: e.target.value })}>{String(f.options ?? "").split("\n").map((o) => <option key={o} value={o} data-no-i18n>{o ? optionLabel(f.fieldname, o, ar) : t("All", "الكل")}</option>)}</select>
              : <input className={inputCls} type={f.fieldtype === "Date" ? "date" : "text"} value={val(f.fieldname)} data-report-filter={f.fieldname} onChange={(e) => set({ [f.fieldname]: e.target.value })} />}
          </Field>
        ))}
      </Filters>
      {!projectOk && <Note tone="bad"><span>{t("This project is not available here: it is not a construction project, or your role cannot read it.", "هذا المشروع غير متاح هنا: ليس مشروع مقاولات أو أن دورك لا يسمح بقراءته.")}</span> <span data-no-i18n>{asked}</span></Note>}
      {projectOk && needsProject && !project && (scoped.length
        ? <Section title={t("Select a project", "اختر مشروعاً")}>
            <p className="mb-2 text-sm text-muted-foreground">{t("This report is calculated for one project. Choose the project to run it for.", "يُحسب هذا التقرير لمشروع واحد. اختر المشروع الذي تريد تشغيله له.")}</p>
            <div className="flex flex-wrap gap-2" data-report-project-picker>{scoped.map((p) => <button key={p.name} type="button" className={BTN.secondary} data-pick-project={p.name} onClick={() => set({ project: p.name })}><span data-no-i18n>{projectTitle(p, !ar)}</span></button>)}{scoped.length > 1 && <button type="button" className={BTN.secondary} data-pick-project={ALL_PROJECTS} onClick={() => set({ project: ALL_PROJECTS })}>{t("All construction projects (combined)", "كل مشاريع المقاولات (مجمعة)")}</button>}</div>
          </Section>
        : <Note tone="warn">{t("No construction project is available to you, so this report has nothing to show.", "لا يوجد مشروع مقاولات متاح لك، لذلك لا يعرض هذا التقرير بيانات.")}</Note>)}
      {(metric || rf.length > 0) && projectOk && (
        <div className="mb-3 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm" role="note" data-report-drill>
          {metric && <div className="font-medium">{t("Rows behind the KPI", "الصفوف خلف المؤشر")} «{ar ? metric.ar : metric.en}» <code className="text-xs" data-no-i18n>{metric.id}</code></div>}
          {!metric && val("chart") && <div className="font-medium">{t("Rows behind the Insights chart mark", "الصفوف خلف علامة مخطط التحليلات")} <code className="text-xs" data-no-i18n>{val("chart")}</code></div>}
          <div className="mt-1 flex flex-wrap items-center gap-1.5" data-row-filters>
            {rf.map((f, i) => <span key={i} className="inline-flex items-center gap-1 rounded-full border border-input bg-card px-2 py-0.5 text-xs" data-row-filter={f[0]}><span>{colLabel(report.columns.find((c) => c.fieldname === f[0])?.label ?? f[0], ar)}</span><span data-no-i18n>{OP_SIGN[f[1]] ?? f[1]}</span>{f[1] === "is_set" || f[1] === "is_not_set" ? <span>{f[1] === "is_set" ? t("set", "محدد") : t("not set", "غير محدد")}</span> : f[2] !== undefined && <span data-no-i18n>{chipValue(report, f[0], f[2], ar)}</span>}<button type="button" className="ms-0.5 rounded-full px-1 hover:bg-muted" aria-label={t("Remove filter", "إزالة المرشح")} onClick={() => dropRf(i)}>×</button></span>)}
            <span className="text-xs text-muted-foreground"><span data-no-i18n data-drill-count>{res.rows.length}</span> {t("of", "من")} <span data-no-i18n>{res.all.length}</span> {t("rows", "صف")}</span>
          </div>
        </div>
      )}
      {projectOk && (!needsProject || project) && report.name === "Budget vs Actual" && <BudgetVsActualSummary rows={res.rows} />}
      {projectOk && (!needsProject || project) && <Section title={t("Result", "النتيجة")}><ReportTable report={report} filters={filters} rowFilters={rf} /></Section>}
      <p className="text-xs text-muted-foreground" data-report-basis>{isFrappeHost()
        ? t("Computed in the DIGIT screens from the records you may read on this site. A DIGIT Script Report version of this report is not part of the package yet.", "يُحسب في شاشات ديجيت من السجلات التي يحق لك قراءتها على هذا الموقع. لا تتضمن الحزمة بعدُ نسخة من هذا التقرير كتقرير برمجي في DIGIT.")
        : t("Computed from the records you may read; every figure opens the rows it sums.", "يُحسب من السجلات التي يحق لك قراءتها؛ كل رقم يفتح السطور التي يجمعها.")}</p>
      {/* preview-only note about the exported server version (Developer mode) */}
      {!isFrappeHost() && <DevOnly><p className="text-xs text-muted-foreground" data-report-virtual>{t("Virtual Script Report: the exported Python execute() must be implemented and staged on DIGIT before production use.", "تقرير افتراضي: يجب برمجة دالة التنفيذ بلغة بايثون واختبارها على DIGIT قبل الاستخدام الفعلي.")}</p></DevOnly>}
    </div>
  );
}

/** Integration map: the construction document chain over native ERPNext documents, with live counts and the owning layer. */
const CHAINS: { en: string; ar: string; steps: [string, "app" | "native"][] }[] = [
  { en: "Win work", ar: "الفوز بالأعمال", steps: [["Digit Tender", "app"], ["Digit Estimate Version", "app"], ["Digit BOQ", "app"], ["Digit Client Contract", "app"], ["Project", "native"]] },
  { en: "Client billing", ar: "فوترة العميل", steps: [["Digit Client Contract", "app"], ["Digit Client Variation", "app"], ["Digit Client Claim", "app"], ["Digit Client Certificate", "app"], ["Sales Invoice", "native"], ["Payment Entry", "native"]] },
  { en: "Subcontracting", ar: "مقاولات الباطن", steps: [["Supplier", "native"], ["Digit Subcontractor Profile", "app"], ["Digit Subcontract Work Order", "app"], ["Digit Measurement Book", "app"], ["Digit Subcontractor Bill", "app"], ["Purchase Invoice", "native"], ["Payment Entry", "native"]] },
  { en: "Materials", ar: "المواد", steps: [["Material Request", "native"], ["Request for Quotation", "native"], ["Supplier Quotation", "native"], ["Purchase Order", "native"], ["Purchase Receipt", "native"], ["Stock Entry", "native"], ["Purchase Invoice", "native"]] },
  { en: "Cost control", ar: "التحكم بالتكلفة", steps: [["Digit BOQ", "app"], ["Digit Project Cost Budget", "app"], ["Digit Budget Revision", "app"], ["Digit Budget Transfer", "app"], ["Digit Cost Forecast Snapshot", "app"]] },
  { en: "Execution", ar: "التنفيذ", steps: [["Project", "native"], ["Task", "native"], ["Digit Work Package", "app"], ["Digit Stage Planning", "app"], ["Digit Progress Update", "app"], ["Digit Site Activity Report", "app"]] },
  { en: "Site resources", ar: "موارد الموقع", steps: [["Employee", "native"], ["Digit Crew", "app"], ["Digit Field Attendance", "app"], ["Digit Machinery", "app"], ["Digit Machinery Usage", "app"], ["Digit Site Expense", "app"], ["Journal Entry", "native"]] },
  { en: "Closeout", ar: "الإغلاق", steps: [["Digit Client Contract", "app"], ["Digit Retention Release Request", "app"], ["Digit Final Account", "app"], ["Digit Closeout Assessment", "app"]] },
];
export function IntegrationPage() {
  const { t, ar } = useCx();
  return (
    <div className="w-full min-w-0" data-page="construction-integration">
      <PageHeader title={t("Integration map", "خريطة التكامل")} subtitle={t("App documents link to native DIGIT records by stable keys; ledgers are written only by native posting (Sales/Purchase Invoice, Payment Entry, Journal Entry, Stock Entry).", "مستندات التطبيق ترتبط بسجلات DIGIT الأصلية بمفاتيح ثابتة؛ لا تُكتب القيود إلا عبر الترحيل الأصلي (فواتير المبيعات والمشتريات وسندات الدفع والقيود وحركات المخزون).")} />
      {CHAINS.map((c) => (
        <Section key={c.en} title={ar ? c.ar : c.en}>
          <ol className="flex flex-wrap items-stretch gap-2">
            {c.steps.map(([dt, layer], i) => (
              <li key={dt + i} className="flex items-center gap-2">
                <ListRef doctype={dt} className={`block rounded-md border px-3 py-2 text-sm hover:bg-muted ${layer === "app" ? "border-primary/40 bg-primary/5" : "border-border"}`}>
                  <div className="font-medium">{layer === "app" ? (ar ? DOCTYPE_AR[dt] ?? dt : dt.replace(/^Digit /, "")) : dt}</div>
                  <div className="text-[11px] text-muted-foreground"><span data-no-i18n>{list(dt).length}</span> · {layer === "app" ? t("app document", "مستند التطبيق") : t("native DIGIT", "أصلي من DIGIT")}</div>
                </ListRef>
                {i < c.steps.length - 1 && <span className="text-muted-foreground" aria-hidden>{ar ? "←" : "→"}</span>}
              </li>
            ))}
          </ol>
        </Section>
      ))}
      <Section title={t("Ownership summary", "ملخص الملكية")}>
        <p className="text-sm">{t(`${OWN.size} app DocTypes (module Digit Construction) and ${new Set(CHAINS.flatMap((c) => c.steps.filter((s) => s[1] === "native").map((s) => s[0]))).size} reused native DocTypes. No native master, invoice or ledger is duplicated.`, `${OWN.size} نوع مستند للتطبيق (وحدة ديجيت للمقاولات) و${new Set(CHAINS.flatMap((c) => c.steps.filter((s) => s[1] === "native").map((s) => s[0]))).size} نوع مستند أصلي مُعاد استخدامه. لا يتكرر أي سجل رئيسي أو فاتورة أو قيد أصلي.`)}</p>
        <p className="mt-1 text-xs text-muted-foreground">{t("States shown on app documents come from their Workflow; Sales/Purchase Invoices keep their native status.", "حالات مستندات التطبيق تأتي من سير العمل؛ وتحتفظ الفواتير بحالتها الأصلية.")}</p>
      </Section>
    </div>
  );
}
