/**
 * Enterprise Workspace widget registry (reusable by DIGIT HR now, DIGIT Pro later).
 * Every widget declares its canonical DocType, calculation filters and drill-down; values are computed at render
 * from permission-scoped adapter records (scope.ts), never stored. Unknown/unsupported → "unavailable", never 0.
 */
import { scopedList } from "@/plugins/digit_hr/compat/scope";
import { matchFilter, type Filter } from "@/lib/desk";
import { SECTION_WORKSPACES } from "./registry.sections";

export type Scope = { company?: string | undefined; days?: number | undefined };
export type Size = 3 | 4 | 6 | 12;
export type Txt = { ar: string; en: string };
type Base = { id: string; title: Txt; def: Txt; doctype: string; app: string; slug: string; dateField?: string; filters: Filter[]; size: Size; optional?: boolean };
export type KpiWidget = Base & { kind: "kpi" };
export type BarWidget = Base & { kind: "bar"; groupBy: string; groups: { value: string; label: Txt; tone?: "ok" | "warn" | "bad" | "info" }[] };
export type QueueWidget = Base & { kind: "queue"; titleField: string; subField?: string };
export type Widget = KpiWidget | BarWidget | QueueWidget;

export type WorkspaceDef = { id: string; widgets: Widget[]; defaultOrder: string[] };

/** DocTypes whose source meta has no company field: the company filter cannot apply (shown as such, not faked). */
export const NO_COMPANY = new Set(["Job Applicant", "Interview", "Company", "Branch", "Designation", "Employee Checkin", "Skill", "Employee Grievance", "Leave Type", "Workflow Action", "Workflow", "Role", "User Permission", "Print Format", "Notification", "Email Template", "Scheduled Job Type", "Error Log"]);
const isoDaysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);

/** Filters that reproduce the widget's calculation in the native list (company + period are part of the drill-down). */
export function drillFilters(w: Widget, s: Scope, extra: Filter[] = []): Filter[] {
  const f: Filter[] = [...w.filters, ...extra];
  if (s.company && !NO_COMPANY.has(w.doctype)) f.push(["company", "=", s.company]);
  if (s.days && w.dateField) f.push([w.dateField, ">=", isoDaysAgo(s.days)]);
  return f;
}

/** Rows behind a widget; null = source not readable for this user (denied/unavailable, not zero). */
export function rows(w: Widget, s: Scope, extra: Filter[] = []) {
  let all;
  try { all = scopedList(w.doctype); } catch { return null; }
  const f = drillFilters(w, s, extra);
  return all.filter((d) => f.every((x) => matchFilter(d, x)));
}

const C = (ar: string, en: string): Txt => ({ ar, en });
const hr = (doctype: string, slug: string, app = "hrms") => ({ doctype, slug, app });

export const WORKSPACES: Record<string, WorkspaceDef> = {
  "digit-hr/02.1": {
    id: "digit-hr/02.1",
    widgets: [
      { id: "rec.open_vacancies", kind: "kpi", title: C("الوظائف الشاغرة المفتوحة", "Open vacancies"), def: C("عدد الوظائف الشاغرة بحالة مفتوح ضمن الشركات المصرّح بها.", "Job Opening records with status Open in authorised companies."), ...hr("Job Opening", "job_opening"), filters: [["status", "=", "Open"]], size: 3 },
      { id: "rec.active_applicants", kind: "kpi", title: C("المتقدمون النشطون", "Active applicants"), def: C("المتقدمون بحالة مفتوح أو تم الرد أو مُدرج بالقائمة المختصرة أو معلّق.", "Job Applicants in Open, Replied, Shortlisted or Hold."), ...hr("Job Applicant", "job_applicant"), filters: [["status", "in", ["Open", "Replied", "Shortlisted", "Hold"]]], size: 3 },
      { id: "rec.scheduled_interviews", kind: "kpi", title: C("المقابلات المجدولة", "Scheduled interviews"), def: C("مقابلات بحالة بانتظار أو قيد المراجعة (عدد المقابلات، لا عدد المرشحين).", "Interviews Pending or Under Review (interviews, not distinct candidates)."), ...hr("Interview", "interview"), dateField: "scheduled_on", filters: [["status", "in", ["Pending", "Under Review"]]], size: 3 },
      { id: "rec.offers_awaiting", kind: "kpi", title: C("عروض بانتظار الرد", "Offers awaiting response"), def: C("عروض وظيفية بحالة بانتظار الرد. العرض المقبول لا يعني اكتمال التعيين.", "Job Offers Awaiting Response. An accepted offer does not prove a completed hire."), ...hr("Job Offer", "job_offer"), dateField: "offer_date", filters: [["status", "=", "Awaiting Response"]], size: 3 },
      { id: "rec.applicant_pipeline", kind: "bar", title: C("مسار المتقدمين حسب الحالة", "Applicant pipeline by status"), def: C("أين يتكدس المرشحون؟ كل عمود يفتح قائمة المتقدمين بنفس الفلتر.", "Where are candidates piling up? Each bar opens the applicant list with the same filter."), ...hr("Job Applicant", "job_applicant"), filters: [], groupBy: "status", size: 6,
        groups: [{ value: "Open", label: C("مفتوح", "Open"), tone: "info" }, { value: "Replied", label: C("تم الرد", "Replied"), tone: "info" }, { value: "Shortlisted", label: C("قائمة مختصرة", "Shortlisted"), tone: "ok" }, { value: "Hold", label: C("معلّق", "Hold"), tone: "warn" }, { value: "Accepted", label: C("مقبول", "Accepted"), tone: "ok" }, { value: "Rejected", label: C("مرفوض", "Rejected"), tone: "bad" }] },
      { id: "rec.offer_status", kind: "bar", title: C("العروض الوظيفية حسب الحالة", "Job offers by status"), def: C("نتيجة العروض المقدّمة في الفترة المحددة.", "Outcome of offers made in the selected period."), ...hr("Job Offer", "job_offer"), dateField: "offer_date", filters: [], groupBy: "status", size: 6, optional: true,
        groups: [{ value: "Awaiting Response", label: C("بانتظار الرد", "Awaiting response"), tone: "warn" }, { value: "Accepted", label: C("مقبول", "Accepted"), tone: "ok" }, { value: "Rejected", label: C("مرفوض", "Rejected"), tone: "bad" }, { value: "Cancelled", label: C("ملغى", "Cancelled") }] },
      { id: "rec.interview_queue", kind: "queue", title: C("قائمة المقابلات القادمة", "Interview queue"), def: C("مقابلات لم تُحسم بعد، الأقرب موعداً أولاً.", "Undecided interviews, soonest first."), ...hr("Interview", "interview"), dateField: "scheduled_on", filters: [["status", "in", ["Pending", "Under Review"]]], titleField: "job_applicant", subField: "scheduled_on", size: 6 },
      { id: "rec.offer_queue", kind: "queue", title: C("عروض تحتاج متابعة", "Offers needing follow-up"), def: C("عروض بانتظار رد المرشح.", "Offers waiting for the candidate's answer."), ...hr("Job Offer", "job_offer"), dateField: "offer_date", filters: [["status", "=", "Awaiting Response"]], titleField: "applicant_name", subField: "offer_date", size: 6, optional: true },
    ],
    defaultOrder: ["rec.open_vacancies", "rec.active_applicants", "rec.scheduled_interviews", "rec.offers_awaiting", "rec.applicant_pipeline", "rec.interview_queue", "rec.offer_status"],
  },
  "digit-hr/03.1": {
    id: "digit-hr/03.1",
    widgets: [
      { id: "lv.pending", kind: "kpi", title: C("إجازات بانتظار الاعتماد", "Leave awaiting approval"), def: C("طلبات إجازة بحالة مفتوح وغير معتمدة نهائياً.", "Leave Applications with status Open, not submitted."), ...hr("Leave Application", "leave_application"), dateField: "from_date", filters: [["status", "=", "Open"], ["docstatus", "=", 0]], size: 4 },
      { id: "lv.approved", kind: "kpi", title: C("إجازات معتمدة", "Approved leave"), def: C("طلبات إجازة بحالة معتمد.", "Leave Applications with status Approved."), ...hr("Leave Application", "leave_application"), dateField: "from_date", filters: [["status", "=", "Approved"]], size: 4 },
      { id: "att.absent", kind: "kpi", title: C("سجلات الغياب", "Absence records"), def: C("سجلات حضور بحالة غائب.", "Attendance records with status Absent."), ...hr("Attendance", "attendance"), dateField: "attendance_date", filters: [["status", "=", "Absent"]], size: 4 },
      { id: "lv.by_status", kind: "bar", title: C("طلبات الإجازة حسب الحالة", "Leave applications by status"), def: C("هل تتراكم الطلبات دون قرار؟", "Are requests piling up undecided?"), ...hr("Leave Application", "leave_application"), dateField: "from_date", filters: [], groupBy: "status", size: 6,
        groups: [{ value: "Open", label: C("مفتوح", "Open"), tone: "warn" }, { value: "Approved", label: C("معتمد", "Approved"), tone: "ok" }, { value: "Rejected", label: C("مرفوض", "Rejected"), tone: "bad" }, { value: "Cancelled", label: C("ملغى", "Cancelled") }] },
      { id: "att.by_status", kind: "bar", title: C("الحضور حسب الحالة", "Attendance by status"), def: C("توزيع سجلات الحضور في الفترة.", "Distribution of attendance records in the period."), ...hr("Attendance", "attendance"), dateField: "attendance_date", filters: [], groupBy: "status", size: 6, optional: true,
        groups: [{ value: "Present", label: C("حاضر", "Present"), tone: "ok" }, { value: "Absent", label: C("غائب", "Absent"), tone: "bad" }, { value: "On Leave", label: C("في إجازة", "On leave"), tone: "info" }, { value: "Half Day", label: C("نصف يوم", "Half day"), tone: "warn" }, { value: "Work From Home", label: C("عمل عن بُعد", "Work from home"), tone: "info" }] },
      { id: "lv.queue", kind: "queue", title: C("طلبات بانتظار القرار", "Requests awaiting decision"), def: C("طلبات الإجازة المفتوحة، الأقرب بداية أولاً.", "Open leave requests, earliest start first."), ...hr("Leave Application", "leave_application"), dateField: "from_date", filters: [["status", "=", "Open"], ["docstatus", "=", 0]], titleField: "employee_name", subField: "from_date", size: 6 },
    ],
    defaultOrder: ["lv.pending", "lv.approved", "att.absent", "lv.by_status", "lv.queue", "att.by_status"],
  },
  "digit-hr/01.4": {
    id: "digit-hr/01.4",
    widgets: [
      { id: "emp.active", kind: "kpi", title: C("الموظفون النشطون", "Active employees"), def: C("سجلات الموظفين بحالة نشط.", "Employee records with status Active."), ...hr("Employee", "employee", "erpnext"), filters: [["status", "=", "Active"]], size: 4 },
      { id: "emp.no_dept", kind: "kpi", title: C("موظفون بلا قسم", "Employees without department"), def: C("موظفون نشطون لم يُحدَّد لهم قسم.", "Active employees with no department set."), ...hr("Employee", "employee", "erpnext"), filters: [["status", "=", "Active"], ["department", "is", "not set"]], size: 4 },
      { id: "emp.joined", kind: "kpi", title: C("المنضمون في الفترة", "Joiners in period"), def: C("موظفون تاريخ التحاقهم ضمن الفترة المحددة.", "Employees whose joining date falls in the period."), ...hr("Employee", "employee", "erpnext"), dateField: "date_of_joining", filters: [], size: 4 },
      { id: "emp.by_status", kind: "bar", title: C("الموظفون حسب الحالة", "Employees by status"), def: C("توزيع سجل الموظفين حسب حالة التوظيف.", "Workforce by employment status."), ...hr("Employee", "employee", "erpnext"), filters: [], groupBy: "status", size: 6,
        groups: [{ value: "Active", label: C("نشط", "Active"), tone: "ok" }, { value: "Inactive", label: C("غير نشط", "Inactive"), tone: "warn" }, { value: "Suspended", label: C("موقوف", "Suspended"), tone: "bad" }, { value: "Left", label: C("منتهية خدمته", "Left") }] },
      { id: "emp.queue", kind: "queue", title: C("موظفون يحتاجون استكمال البيانات", "Records needing completion"), def: C("موظفون نشطون بلا قسم.", "Active employees missing a department."), ...hr("Employee", "employee", "erpnext"), filters: [["status", "=", "Active"], ["department", "is", "not set"]], titleField: "employee_name", subField: "designation", size: 6 },
    ],
    defaultOrder: ["emp.active", "emp.no_dept", "emp.joined", "emp.by_status", "emp.queue"],
  },
  "digit-hr/03.3": {
    id: "digit-hr/03.3",
    widgets: [
      { id: "sh.active", kind: "kpi", title: C("تعيينات الورديات النشطة", "Active shift assignments"), def: C("تعيينات ورديات بحالة نشط.", "Shift Assignments with status Active."), ...hr("Shift Assignment", "shift_assignment"), dateField: "start_date", filters: [["status", "=", "Active"]], size: 6 },
      { id: "sh.requests", kind: "kpi", title: C("طلبات ورديات بانتظار القرار", "Shift requests awaiting decision"), def: C("طلبات ورديات بحالة مسودة.", "Shift Requests in Draft status."), ...hr("Shift Request", "shift_request"), dateField: "from_date", filters: [["status", "=", "Draft"]], size: 6 },
      { id: "sh.by_type", kind: "bar", title: C("التعيينات حسب الحالة", "Assignments by status"), def: C("نشط مقابل غير نشط.", "Active versus inactive."), ...hr("Shift Assignment", "shift_assignment"), dateField: "start_date", filters: [], groupBy: "status", size: 6,
        groups: [{ value: "Active", label: C("نشط", "Active"), tone: "ok" }, { value: "Inactive", label: C("غير نشط", "Inactive") }] },
      { id: "sh.queue", kind: "queue", title: C("الورديات الجارية", "Current assignments"), def: C("تعيينات نشطة، الأقرب بداية أولاً.", "Active assignments, earliest start first."), ...hr("Shift Assignment", "shift_assignment"), dateField: "start_date", filters: [["status", "=", "Active"]], titleField: "employee_name", subField: "shift_type", size: 6 },
    ],
    defaultOrder: ["sh.active", "sh.requests", "sh.by_type", "sh.queue"],
  },
  "digit-hr/04.1": {
    id: "digit-hr/04.1",
    widgets: [
      { id: "pay.draft", kind: "kpi", title: C("قسائم رواتب مسودة", "Draft salary slips"), def: C("قسائم رواتب لم تُعتمد بعد — تحتاج مراجعة قبل الصرف.", "Salary Slips not yet submitted."), ...hr("Salary Slip", "salary_slip"), dateField: "posting_date", filters: [["docstatus", "=", 0]], size: 4 },
      { id: "pay.submitted", kind: "kpi", title: C("قسائم رواتب معتمدة", "Submitted salary slips"), def: C("قسائم رواتب معتمدة في الفترة.", "Submitted Salary Slips in the period."), ...hr("Salary Slip", "salary_slip"), dateField: "posting_date", filters: [["docstatus", "=", 1]], size: 4 },
      { id: "pay.entries", kind: "kpi", title: C("دورات رواتب مفتوحة", "Open payroll runs"), def: C("قيود رواتب لم تُعتمد بعد.", "Payroll Entries not yet submitted."), ...hr("Payroll Entry", "payroll_entry"), dateField: "posting_date", filters: [["docstatus", "=", 0]], size: 4 },
      { id: "pay.by_status", kind: "bar", title: C("القسائم حسب الحالة", "Slips by status"), def: C("مسودة ومعتمد وملغى.", "Draft, submitted and cancelled."), ...hr("Salary Slip", "salary_slip"), dateField: "posting_date", filters: [], groupBy: "status", size: 6,
        groups: [{ value: "Draft", label: C("مسودة", "Draft"), tone: "warn" }, { value: "Submitted", label: C("معتمد", "Submitted"), tone: "ok" }, { value: "Withheld", label: C("محجوز", "Withheld"), tone: "bad" }, { value: "Cancelled", label: C("ملغى", "Cancelled") }] },
      { id: "pay.queue", kind: "queue", title: C("قسائم بانتظار الاعتماد", "Slips awaiting submission"), def: C("قسائم مسودة، الأقدم أولاً.", "Draft slips, oldest first."), ...hr("Salary Slip", "salary_slip"), dateField: "posting_date", filters: [["docstatus", "=", 0]], titleField: "employee_name", subField: "posting_date", size: 6 },
    ],
    defaultOrder: ["pay.draft", "pay.submitted", "pay.entries", "pay.by_status", "pay.queue"],
  },
  "digit-hr/04.5": {
    id: "digit-hr/04.5",
    widgets: [
      { id: "exp.pending", kind: "kpi", title: C("مطالبات بانتظار الاعتماد", "Claims awaiting approval"), def: C("مطالبات مصروفات بحالة اعتماد مسودة.", "Expense Claims with approval status Draft."), ...hr("Expense Claim", "expense_claim"), dateField: "posting_date", filters: [["approval_status", "=", "Draft"]], size: 4 },
      { id: "exp.unpaid", kind: "kpi", title: C("مطالبات معتمدة غير مدفوعة", "Approved unpaid claims"), def: C("مطالبات معتمدة لم تُصرف بعد.", "Approved claims not yet paid."), ...hr("Expense Claim", "expense_claim"), dateField: "posting_date", filters: [["approval_status", "=", "Approved"], ["status", "=", "Unpaid"]], size: 4 },
      { id: "adv.open", kind: "kpi", title: C("سلف الموظفين غير المسددة", "Unsettled employee advances"), def: C("سلف بحالة غير مدفوعة أو مدفوعة دون تسوية.", "Employee Advances Unpaid or Paid, not settled."), ...hr("Employee Advance", "employee_advance"), dateField: "posting_date", filters: [["status", "in", ["Unpaid", "Paid"]]], size: 4 },
      { id: "exp.by_status", kind: "bar", title: C("المطالبات حسب الاعتماد", "Claims by approval"), def: C("أين تتوقف المطالبات؟", "Where do claims stall?"), ...hr("Expense Claim", "expense_claim"), dateField: "posting_date", filters: [], groupBy: "approval_status", size: 6,
        groups: [{ value: "Draft", label: C("مسودة", "Draft"), tone: "warn" }, { value: "Approved", label: C("معتمد", "Approved"), tone: "ok" }, { value: "Rejected", label: C("مرفوض", "Rejected"), tone: "bad" }] },
      { id: "exp.queue", kind: "queue", title: C("مطالبات تحتاج قراراً", "Claims needing a decision"), def: C("مطالبات مسودة، الأقدم أولاً.", "Draft claims, oldest first."), ...hr("Expense Claim", "expense_claim"), dateField: "posting_date", filters: [["approval_status", "=", "Draft"]], titleField: "employee_name", subField: "posting_date", size: 6 },
    ],
    defaultOrder: ["exp.pending", "exp.unpaid", "adv.open", "exp.by_status", "exp.queue"],
  },
  ...Object.fromEntries(Object.entries(SECTION_WORKSPACES).map(([k, v]) => [`digit-hr/${k}`, v])),
};
