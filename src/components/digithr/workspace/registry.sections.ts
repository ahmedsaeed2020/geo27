/**
 * V7.1 workspaces for the remaining 24 DIGIT HR sections. Same widget contract as registry.ts:
 * canonical DocType + calculation filters = drill-down filters, computed from scoped records at render.
 * Compositions differ per section (KPI mix, chart and queue chosen from the section's own native documents).
 */
import type { Filter } from "@/lib/desk";
import type { Size, Txt, Widget, WorkspaceDef } from "./registry";

const C = (ar: string, en: string): Txt => ({ ar, en });
type Src = { doctype: string; slug: string; app: string; dateField?: string };
const H = (doctype: string, slug: string, dateField?: string): Src => ({ doctype, slug, app: "hrms", ...(dateField ? { dateField } : {}) });
const E = (doctype: string, slug: string, dateField?: string): Src => ({ doctype, slug, app: "erpnext", ...(dateField ? { dateField } : {}) });
const F = (doctype: string, slug: string): Src => ({ doctype, slug, app: "frappe" });
const kpi = (id: string, title: Txt, def: Txt, s: Src, filters: Filter[] = [], size: Size = 3): Widget => ({ id, kind: "kpi", title, def, ...s, filters, size });
const bar = (id: string, title: Txt, def: Txt, s: Src, groupBy: string, groups: [string, string, string, ("ok" | "warn" | "bad" | "info")?][], filters: Filter[] = []): Widget =>
  ({ id, kind: "bar", title, def, ...s, filters, groupBy, size: 6, groups: groups.map(([value, ar, en, tone]) => ({ value, label: C(ar, en), ...(tone ? { tone } : {}) })) });
const queue = (id: string, title: Txt, def: Txt, s: Src, filters: Filter[], titleField: string, subField?: string): Widget =>
  ({ id, kind: "queue", title, def, ...s, filters, titleField, ...(subField ? { subField } : {}), size: 6 });
const ws = (id: string, widgets: Widget[]): WorkspaceDef => ({ id: `digit-hr/${id}`, widgets, defaultOrder: widgets.map((w) => w.id) });

const EMP = E("Employee", "employee", "date_of_joining");
const EMP_ST: [string, string, string, ("ok" | "warn" | "bad" | "info")?][] = [["Active", "نشط", "Active", "ok"], ["Inactive", "غير نشط", "Inactive", "warn"], ["Suspended", "موقوف", "Suspended", "bad"], ["Left", "منتهية خدمته", "Left"]];
const DOC_ST: [string, string, string, ("ok" | "warn" | "bad" | "info")?][] = [["0", "مسودة", "Draft", "warn"], ["1", "معتمد", "Submitted", "ok"], ["2", "ملغى", "Cancelled", "bad"]];
const SLIP = H("Salary Slip", "salary_slip", "posting_date");
const LEAVE = H("Leave Application", "leave_application", "from_date");
const ATT = H("Attendance", "attendance", "attendance_date");
const ACTIVE: Filter = ["status", "=", "Active"];

export const SECTION_WORKSPACES: Record<string, WorkspaceDef> = {
  "01.1": ws("01.1", [
    kpi("org.companies", C("الشركات", "Companies"), C("عدد سجلات الشركة المصرّح بها.", "Authorised Company records."), E("Company", "company"), [], 4),
    kpi("org.departments", C("الأقسام", "Departments"), C("عدد سجلات الأقسام ضمن الشركة.", "Department records in scope."), E("Department", "department"), [], 4),
    kpi("org.branches", C("الفروع", "Branches"), C("عدد سجلات الفروع.", "Branch records."), E("Branch", "branch"), [], 4),
    bar("org.emp_status", C("القوى العاملة حسب الحالة", "Workforce by status"), C("حجم الهيكل الفعلي حسب حالة التوظيف.", "Actual structure size by employment status."), E("Employee", "employee"), "status", EMP_ST),
    queue("org.no_dept", C("موظفون خارج الهيكل", "Employees outside the structure"), C("موظفون نشطون بلا قسم.", "Active employees with no department."), E("Employee", "employee"), [ACTIVE, ["department", "is", "not set"]], "employee_name", "designation"),
  ]),
  "01.2": ws("01.2", [
    kpi("job.designations", C("المسميات الوظيفية", "Designations"), C("عدد سجلات المسمى الوظيفي.", "Designation records."), E("Designation", "designation"), [], 6),
    kpi("job.no_desig", C("موظفون بلا مسمى", "Employees without designation"), C("موظفون نشطون لم يُحدَّد مسماهم.", "Active employees with no designation."), E("Employee", "employee"), [ACTIVE, ["designation", "is", "not set"]], 6),
    queue("job.queue", C("استكمال التصنيف الوظيفي", "Job classification to complete"), C("موظفون نشطون بلا مسمى وظيفي.", "Active employees missing a designation."), E("Employee", "employee"), [ACTIVE, ["designation", "is", "not set"]], "employee_name", "department"),
  ]),
  "01.3": ws("01.3", [
    kpi("pos.open", C("شواغر مفتوحة", "Open positions"), C("وظائف شاغرة بحالة مفتوح.", "Job Openings with status Open."), H("Job Opening", "job_opening"), [["status", "=", "Open"]], 4),
    kpi("pos.closed", C("شواغر مغلقة", "Closed positions"), C("وظائف شاغرة بحالة مغلق.", "Job Openings with status Closed."), H("Job Opening", "job_opening"), [["status", "=", "Closed"]], 4),
    kpi("pos.cost_centers", C("مراكز التكلفة", "Cost centres"), C("مراكز التكلفة المتاحة لربط المناصب.", "Cost centres available for positions."), E("Cost Center", "cost_center"), [], 4),
    bar("pos.by_status", C("الشواغر حسب الحالة", "Openings by status"), C("مفتوح مقابل مغلق.", "Open versus closed."), H("Job Opening", "job_opening"), "status", [["Open", "مفتوح", "Open", "info"], ["Closed", "مغلق", "Closed"]]),
    queue("pos.queue", C("شواغر تحتاج تعبئة", "Openings to fill"), C("وظائف مفتوحة، الأقرب إغلاقاً أولاً.", "Open roles, closing soonest first."), H("Job Opening", "job_opening", "closes_on"), [["status", "=", "Open"]], "job_title", "closes_on"),
  ]),
  "01.5": ws("01.5", [
    kpi("asg.transfers", C("طلبات النقل المسودة", "Draft transfers"), C("مستندات نقل موظف غير معتمدة.", "Employee Transfers not submitted."), H("Employee Transfer", "employee_transfer", "transfer_date"), [["docstatus", "=", 0]], 4),
    kpi("asg.promotions", C("ترقيات مسودة", "Draft promotions"), C("مستندات ترقية غير معتمدة.", "Employee Promotions not submitted."), H("Employee Promotion", "employee_promotion", "promotion_date"), [["docstatus", "=", 0]], 4),
    kpi("asg.done", C("ترقيات معتمدة في الفترة", "Promotions submitted in period"), C("ترقيات معتمدة ضمن الفترة.", "Submitted promotions in the period."), H("Employee Promotion", "employee_promotion", "promotion_date"), [["docstatus", "=", 1]], 4),
    bar("asg.transfer_status", C("النقل حسب حالة المستند", "Transfers by document status"), C("مسودة ومعتمد وملغى.", "Draft, submitted, cancelled."), H("Employee Transfer", "employee_transfer", "transfer_date"), "docstatus", DOC_ST),
    queue("asg.queue", C("ترقيات بانتظار الاعتماد", "Promotions awaiting submission"), C("ترقيات مسودة، الأقرب تاريخاً أولاً.", "Draft promotions, soonest first."), H("Employee Promotion", "employee_promotion", "promotion_date"), [["docstatus", "=", 0]], "employee_name", "promotion_date"),
  ]),
  "01.6": ws("01.6", [
    kpi("doc.offers", C("عروض بانتظار الرد (قبل العقد)", "Offers awaiting response (pre-contract)"), C("عروض وظيفية بانتظار رد المرشح — مرحلة ما قبل العقد.", "Job Offers awaiting the candidate's response — the pre-contract stage."), H("Job Offer", "job_offer", "offer_date"), [["status", "=", "Awaiting Response"]], 6),
    kpi("doc.accepted", C("عروض مقبولة", "Accepted offers"), C("عروض قبلها المرشح — ليست عقداً موقعاً بعد.", "Accepted offers — not yet a signed contract."), H("Job Offer", "job_offer", "offer_date"), [["status", "=", "Accepted"]], 6),
    bar("doc.offer_status", C("حالة العروض", "Offer status"), C("نتائج العروض في الفترة.", "Offer outcomes in the period."), H("Job Offer", "job_offer", "offer_date"), "status", [["Awaiting Response", "بانتظار الرد", "Awaiting", "warn"], ["Accepted", "مقبول", "Accepted", "ok"], ["Rejected", "مرفوض", "Rejected", "bad"], ["Cancelled", "ملغى", "Cancelled"]]),
    queue("doc.queue", C("عروض للمتابعة", "Offers to follow up"), C("عروض بانتظار الرد، الأقدم أولاً.", "Awaiting offers, oldest first."), H("Job Offer", "job_offer", "offer_date"), [["status", "=", "Awaiting Response"]], "applicant_name", "offer_date"),
  ]),
  "02.2": ws("02.2", [
    kpi("onb.open", C("تهيئة قيد التنفيذ", "Onboarding in progress"), C("مستندات تهيئة موظف غير معتمدة.", "Employee Onboarding not submitted."), H("Employee Onboarding", "employee_onboarding", "date_of_joining"), [["docstatus", "=", 0]], 4),
    kpi("onb.done", C("تهيئة مكتملة", "Onboarding completed"), C("مستندات تهيئة معتمدة.", "Submitted Employee Onboarding."), H("Employee Onboarding", "employee_onboarding", "date_of_joining"), [["docstatus", "=", 1]], 4),
    kpi("onb.joiners", C("المنضمون في الفترة", "Joiners in period"), C("موظفون تاريخ التحاقهم ضمن الفترة.", "Employees joining in the period."), EMP, [], 4),
    queue("onb.queue", C("قائمة التهيئة الجارية", "Active onboarding queue"), C("تهيئة غير مكتملة، الأقرب التحاقاً أولاً.", "Open onboarding, soonest joining first."), H("Employee Onboarding", "employee_onboarding", "date_of_joining"), [["docstatus", "=", 0]], "employee_name", "date_of_joining"),
  ]),
  "02.3": ws("02.3", [
    kpi("perf.goals_open", C("أهداف قيد التنفيذ", "Goals in progress"), C("أهداف بحالة معلّق أو قيد التنفيذ.", "Goals Pending or In Progress."), H("Goal", "goal", "start_date"), [["status", "in", ["Pending", "In Progress"]]], 4),
    kpi("perf.appraisals", C("تقييمات مسودة", "Draft appraisals"), C("تقييمات أداء غير معتمدة.", "Appraisals not submitted."), H("Appraisal", "appraisal", "start_date"), [["docstatus", "=", 0]], 4),
    kpi("perf.cycles", C("دورات تقييم جارية", "Active appraisal cycles"), C("دورات تقييم بحالة قيد التنفيذ.", "Appraisal Cycles In Progress."), H("Appraisal Cycle", "appraisal_cycle", "start_date"), [["status", "=", "In Progress"]], 4),
    bar("perf.goal_status", C("الأهداف حسب الحالة", "Goals by status"), C("أين تتعثر الأهداف؟", "Where are goals stalling?"), H("Goal", "goal", "start_date"), "status", [["Pending", "معلّق", "Pending", "warn"], ["In Progress", "قيد التنفيذ", "In progress", "info"], ["Completed", "مكتمل", "Completed", "ok"], ["Closed", "مغلق", "Closed"]]),
    queue("perf.queue", C("تقييمات بانتظار الإكمال", "Appraisals to complete"), C("تقييمات مسودة.", "Draft appraisals."), H("Appraisal", "appraisal", "start_date"), [["docstatus", "=", 0]], "employee_name", "appraisal_cycle"),
  ]),
  "02.4": ws("02.4", [
    kpi("lrn.scheduled", C("برامج تدريب مجدولة", "Scheduled programmes"), C("برامج تدريب بحالة مجدول.", "Training Programs Scheduled."), H("Training Program", "training_program"), [["status", "=", "Scheduled"]], 4),
    kpi("lrn.events", C("فعاليات تدريب مسودة", "Draft training events"), C("فعاليات تدريب غير معتمدة.", "Training Events not submitted."), H("Training Event", "training_event"), [["docstatus", "=", 0]], 4),
    kpi("lrn.skills", C("المهارات المعرّفة", "Defined skills"), C("سجلات المهارة.", "Skill records."), H("Skill", "skill"), [], 4),
    bar("lrn.prog_status", C("البرامج حسب الحالة", "Programmes by status"), C("مجدول ومكتمل وملغى.", "Scheduled, completed, cancelled."), H("Training Program", "training_program"), "status", [["Scheduled", "مجدول", "Scheduled", "info"], ["Completed", "مكتمل", "Completed", "ok"], ["Cancelled", "ملغى", "Cancelled", "bad"]]),
    queue("lrn.queue", C("فعاليات تحتاج اعتماد", "Events awaiting submission"), C("فعاليات تدريب مسودة.", "Draft training events."), H("Training Event", "training_event"), [["docstatus", "=", 0]], "event_name", "training_program"),
  ]),
  "02.5": ws("02.5", [
    kpi("tal.submitted", C("تقييمات معتمدة", "Submitted appraisals"), C("تقييمات معتمدة — أساس قرار المواهب.", "Submitted appraisals — the talent decision base."), H("Appraisal", "appraisal", "start_date"), [["docstatus", "=", 1]], 6),
    kpi("tal.active", C("مجموعة المواهب المحتملة", "Potential talent pool"), C("موظفون نشطون (لا يوجد مستند أصلي لمجموعة المواهب — امتداد بانتظار قرار المالك).", "Active employees (no native talent-pool DocType — extension awaiting owner decision)."), E("Employee", "employee"), [ACTIVE], 6),
    queue("tal.queue", C("تقييمات حديثة للمراجعة", "Recent appraisals to review"), C("تقييمات معتمدة في الفترة.", "Submitted appraisals in the period."), H("Appraisal", "appraisal", "start_date"), [["docstatus", "=", 1]], "employee_name", "final_score"),
  ]),
  "03.2": ws("03.2", [
    kpi("atx.absent", C("غياب في الفترة", "Absences in period"), C("سجلات حضور بحالة غائب.", "Attendance Absent."), ATT, [["status", "=", "Absent"]], 4),
    kpi("atx.half", C("أنصاف أيام", "Half days"), C("سجلات حضور بحالة نصف يوم.", "Attendance Half Day."), ATT, [["status", "=", "Half Day"]], 4),
    kpi("atx.draft", C("حضور غير معتمد", "Unsubmitted attendance"), C("سجلات حضور مسودة تحتاج اعتماد.", "Draft attendance needing submission."), ATT, [["docstatus", "=", 0]], 4),
    bar("atx.by_status", C("الحضور حسب الحالة", "Attendance by status"), C("توزيع الحضور والاستثناءات.", "Attendance and exceptions mix."), ATT, "status", [["Present", "حاضر", "Present", "ok"], ["Absent", "غائب", "Absent", "bad"], ["On Leave", "في إجازة", "On leave", "info"], ["Half Day", "نصف يوم", "Half day", "warn"], ["Work From Home", "عن بُعد", "WFH", "info"]]),
    queue("atx.queue", C("استثناءات الغياب", "Absence exceptions"), C("سجلات غياب، الأحدث أولاً.", "Absences, latest first."), ATT, [["status", "=", "Absent"]], "employee_name", "attendance_date"),
  ]),
  "03.4": ws("03.4", [
    kpi("cap.checkins", C("تسجيلات الدخول والخروج", "Check-in logs"), C("سجلات تسجيل الحضور الأصلية — مصدر داخلي دون جهاز خارجي.", "Native Employee Checkin logs — internal source, no external device."), H("Employee Checkin", "employee_checkin"), [], 4),
    kpi("cap.in", C("تسجيلات دخول", "IN logs"), C("سجلات بنوع دخول.", "Logs with type IN."), H("Employee Checkin", "employee_checkin"), [["log_type", "=", "IN"]], 4),
    kpi("cap.unlinked", C("تسجيلات غير مربوطة بحضور", "Logs not linked to attendance"), C("تسجيلات بلا سجل حضور مرتبط.", "Logs with no linked attendance."), H("Employee Checkin", "employee_checkin"), [["attendance", "is", "not set"]], 4),
    bar("cap.by_type", C("التسجيلات حسب النوع", "Logs by type"), C("دخول مقابل خروج.", "In versus out."), H("Employee Checkin", "employee_checkin"), "log_type", [["IN", "دخول", "IN", "ok"], ["OUT", "خروج", "OUT", "info"]]),
    queue("cap.queue", C("تسجيلات تحتاج معالجة", "Logs to process"), C("تسجيلات لم تتحول إلى حضور.", "Logs not yet turned into attendance."), H("Employee Checkin", "employee_checkin"), [["attendance", "is", "not set"]], "employee_name", "time"),
  ]),
  "04.2": ws("04.2", [
    kpi("dsb.ready", C("قسائم جاهزة للصرف", "Slips ready to pay"), C("قسائم رواتب معتمدة.", "Submitted salary slips."), SLIP, [["docstatus", "=", 1]], 4),
    kpi("dsb.withheld", C("رواتب محجوزة", "Withheld salaries"), C("قسائم بحالة محجوز.", "Slips with status Withheld."), SLIP, [["status", "=", "Withheld"]], 4),
    kpi("dsb.payments", C("دفعات مسودة", "Draft payments"), C("قيود دفع غير معتمدة — لا يُنشأ قيد محاسبي من هنا.", "Payment Entries not submitted — no ledger posting from here."), E("Payment Entry", "payment_entry", "posting_date"), [["docstatus", "=", 0]], 4),
    bar("dsb.runs", C("دورات الرواتب حسب الحالة", "Payroll runs by status"), C("مسودة ومعتمد وفاشل.", "Draft, submitted, failed."), H("Payroll Entry", "payroll_entry", "posting_date"), "status", [["Draft", "مسودة", "Draft", "warn"], ["Submitted", "معتمد", "Submitted", "ok"], ["Failed", "فاشل", "Failed", "bad"], ["Cancelled", "ملغى", "Cancelled"]]),
    queue("dsb.queue", C("رواتب محجوزة للمراجعة", "Withheld salaries to review"), C("قسائم محجوزة.", "Withheld slips."), SLIP, [["status", "=", "Withheld"]], "employee_name", "posting_date"),
  ]),
  "04.3": ws("04.3", [
    kpi("ksa.gratuity", C("مكافآت نهاية خدمة مسودة", "Draft gratuity"), C("مستندات مكافأة نهاية الخدمة غير معتمدة — الحساب من قاعدة المكافأة الأصلية فقط.", "Gratuity not submitted — computed by the native gratuity rule only."), H("Gratuity", "gratuity", "posting_date"), [["docstatus", "=", 0]], 4),
    kpi("ksa.fnf", C("تسويات نهائية غير مدفوعة", "Unpaid final settlements"), C("تسويات نهائية بحالة غير مدفوع.", "Full and Final Statements Unpaid."), H("Full and Final Statement", "full_and_final_statement", "transaction_date"), [["status", "=", "Unpaid"]], 4),
    kpi("ksa.left", C("موظفون منتهية خدمتهم", "Leavers"), C("موظفون بحالة منتهية خدمته.", "Employees with status Left."), E("Employee", "employee"), [["status", "=", "Left"]], 4),
    bar("ksa.fnf_status", C("التسويات النهائية حسب الحالة", "Final settlements by status"), C("مدفوع وغير مدفوع وملغى.", "Paid, unpaid, cancelled."), H("Full and Final Statement", "full_and_final_statement", "transaction_date"), "status", [["Unpaid", "غير مدفوع", "Unpaid", "warn"], ["Paid", "مدفوع", "Paid", "ok"], ["Cancelled", "ملغى", "Cancelled"]]),
    queue("ksa.queue", C("مكافآت بانتظار الاعتماد", "Gratuity awaiting submission"), C("مستندات مكافأة مسودة. التأمينات وحماية الأجور تحتاج امتداداً معتمداً.", "Draft gratuity. GOSI/WPS need an approved extension."), H("Gratuity", "gratuity", "posting_date"), [["docstatus", "=", 0]], "employee_name", "posting_date"),
  ]),
  "04.4": ws("04.4", [
    kpi("cmp.ssa", C("تعيينات هياكل رواتب معتمدة", "Submitted structure assignments"), C("تعيينات هيكل راتب معتمدة.", "Submitted Salary Structure Assignments."), H("Salary Structure Assignment", "salary_structure_assignment", "from_date"), [["docstatus", "=", 1]], 4),
    kpi("cmp.additional", C("رواتب إضافية مسودة", "Draft additional salary"), C("مستندات راتب إضافي غير معتمدة.", "Additional Salary not submitted."), H("Additional Salary", "additional_salary", "from_date"), [["docstatus", "=", 0]], 4),
    kpi("cmp.benefits", C("طلبات مزايا مسودة", "Draft benefit applications"), C("طلبات مزايا غير معتمدة.", "Employee Benefit Applications not submitted."), H("Employee Benefit Application", "employee_benefit_application", "date"), [["docstatus", "=", 0]], 4),
    bar("cmp.add_status", C("الرواتب الإضافية حسب الحالة", "Additional salary by status"), C("مسودة ومعتمد وملغى.", "Draft, submitted, cancelled."), H("Additional Salary", "additional_salary", "from_date"), "docstatus", DOC_ST),
    queue("cmp.queue", C("رواتب إضافية للمراجعة", "Additional salary to review"), C("مستندات مسودة.", "Draft documents."), H("Additional Salary", "additional_salary", "from_date"), [["docstatus", "=", 0]], "employee_name", "salary_component"),
  ]),
  "05.1": ws("05.1", [
    kpi("ess.leave", C("طلبات إجازة مفتوحة", "Open leave requests"), C("طلبات إجازة مفتوحة ضمن ما يحق لك رؤيته.", "Open leave requests you may see."), LEAVE, [["status", "=", "Open"]], 4),
    kpi("ess.claims", C("مطالباتي المسودة", "Draft claims"), C("مطالبات مصروفات بحالة اعتماد مسودة.", "Expense Claims with approval Draft."), H("Expense Claim", "expense_claim", "posting_date"), [["approval_status", "=", "Draft"]], 4),
    kpi("ess.slips", C("قسائم رواتب متاحة", "Available payslips"), C("قسائم رواتب معتمدة.", "Submitted salary slips."), SLIP, [["docstatus", "=", 1]], 4),
    queue("ess.queue", C("طلباتي قيد الانتظار", "My pending requests"), C("طلبات إجازة مفتوحة.", "Open leave requests."), LEAVE, [["status", "=", "Open"]], "employee_name", "leave_type"),
  ]),
  "05.2": ws("05.2", [
    kpi("mss.leave", C("إجازات الفريق بانتظار قراري", "Team leave awaiting me"), C("طلبات إجازة مفتوحة غير معتمدة.", "Open, unsubmitted leave requests."), LEAVE, [["status", "=", "Open"], ["docstatus", "=", 0]], 4),
    kpi("mss.actions", C("إجراءات سير عمل مفتوحة", "Open workflow actions"), C("إجراءات سير عمل بحالة مفتوح.", "Workflow Actions Open."), F("Workflow Action", "workflow_action"), [["status", "=", "Open"]], 4),
    kpi("mss.absent", C("غياب الفريق", "Team absences"), C("سجلات غياب في الفترة.", "Absences in the period."), ATT, [["status", "=", "Absent"]], 4),
    queue("mss.queue", C("قرارات معلّقة", "Pending decisions"), C("إجازات بانتظار القرار.", "Leave awaiting decision."), LEAVE, [["status", "=", "Open"], ["docstatus", "=", 0]], "employee_name", "from_date"),
  ]),
  "05.3": ws("05.3", [
    kpi("svc.open", C("تظلمات مفتوحة", "Open grievances"), C("تظلمات بحالة مفتوح.", "Employee Grievances Open."), H("Employee Grievance", "employee_grievance", "date"), [["status", "=", "Open"]], 6),
    kpi("svc.investigated", C("تظلمات قيد التحقيق", "Under investigation"), C("تظلمات بحالة تم التحقيق.", "Grievances Investigated."), H("Employee Grievance", "employee_grievance", "date"), [["status", "=", "Investigated"]], 6),
    bar("svc.by_status", C("التظلمات حسب الحالة", "Grievances by status"), C("مسار الحالات حتى الحل.", "Case flow to resolution."), H("Employee Grievance", "employee_grievance", "date"), "status", [["Open", "مفتوح", "Open", "warn"], ["Investigated", "تم التحقيق", "Investigated", "info"], ["Resolved", "تم الحل", "Resolved", "ok"], ["Invalid", "غير صالح", "Invalid", "bad"]]),
    queue("svc.queue", C("حالات تحتاج متابعة", "Cases to follow up"), C("تظلمات مفتوحة، الأقدم أولاً.", "Open grievances, oldest first."), H("Employee Grievance", "employee_grievance", "date"), [["status", "=", "Open"]], "subject", "raised_by"),
  ]),
  "06.1": ws("06.1", [
    kpi("cmd.headcount", C("القوى العاملة النشطة", "Active headcount"), C("موظفون بحالة نشط.", "Active employees."), E("Employee", "employee"), [ACTIVE]),
    kpi("cmd.vacancies", C("شواغر مفتوحة", "Open vacancies"), C("وظائف شاغرة مفتوحة.", "Open Job Openings."), H("Job Opening", "job_opening"), [["status", "=", "Open"]]),
    kpi("cmd.leave", C("إجازات معلّقة", "Pending leave"), C("طلبات إجازة مفتوحة.", "Open leave requests."), LEAVE, [["status", "=", "Open"]]),
    kpi("cmd.slips", C("قسائم مسودة", "Draft payslips"), C("قسائم رواتب غير معتمدة.", "Unsubmitted salary slips."), SLIP, [["docstatus", "=", 0]]),
    bar("cmd.emp", C("القوى العاملة حسب الحالة", "Workforce by status"), C("صورة سريعة للقوى العاملة.", "Workforce at a glance."), E("Employee", "employee"), "status", EMP_ST),
    queue("cmd.queue", C("أهم القرارات المعلّقة", "Top pending decisions"), C("إجراءات سير عمل مفتوحة.", "Open workflow actions."), F("Workflow Action", "workflow_action"), [["status", "=", "Open"]], "reference_name", "reference_doctype"),
  ]),
  "06.2": ws("06.2", [
    kpi("wfp.active", C("القوى العاملة الفعلية", "Actual headcount"), C("موظفون نشطون.", "Active employees."), E("Employee", "employee"), [ACTIVE], 4),
    kpi("wfp.joiners", C("المنضمون في الفترة", "Joiners in period"), C("التحاق ضمن الفترة.", "Joined in the period."), EMP, [], 4),
    kpi("wfp.ssa", C("تعيينات رواتب سارية", "Active pay assignments"), C("تعيينات هيكل راتب معتمدة — أساس تكلفة القوى العاملة.", "Submitted structure assignments — the workforce cost base."), H("Salary Structure Assignment", "salary_structure_assignment", "from_date"), [["docstatus", "=", 1]], 4),
    bar("wfp.emp", C("الفعلي حسب الحالة", "Actual by status"), C("لا توجد خطة قوى عاملة أصلية — الانحراف عن الخطة امتداد بانتظار القرار.", "No native staffing plan — plan variance is an extension awaiting decision."), E("Employee", "employee"), "status", EMP_ST),
  ]),
  "06.3": ws("06.3", [
    kpi("ana.applicants", C("المتقدمون", "Applicants"), C("كل سجلات المتقدمين.", "All Job Applicants."), H("Job Applicant", "job_applicant"), [], 4),
    kpi("ana.offers", C("عروض مقبولة", "Accepted offers"), C("عروض بحالة مقبول.", "Job Offers Accepted."), H("Job Offer", "job_offer", "offer_date"), [["status", "=", "Accepted"]], 4),
    kpi("ana.runs", C("دورات رواتب معتمدة", "Submitted payroll runs"), C("قيود رواتب معتمدة.", "Submitted Payroll Entries."), H("Payroll Entry", "payroll_entry", "posting_date"), [["docstatus", "=", 1]], 4),
    bar("ana.leave", C("الإجازات حسب الحالة", "Leave by status"), C("نظرة تحليلية على قرارات الإجازة.", "Analytical view of leave decisions."), LEAVE, "status", [["Open", "مفتوح", "Open", "warn"], ["Approved", "معتمد", "Approved", "ok"], ["Rejected", "مرفوض", "Rejected", "bad"]]),
    bar("ana.att", C("الحضور حسب الحالة", "Attendance by status"), C("نظرة تحليلية على الحضور.", "Analytical view of attendance."), ATT, "status", [["Present", "حاضر", "Present", "ok"], ["Absent", "غائب", "Absent", "bad"], ["On Leave", "في إجازة", "On leave", "info"]]),
  ]),
  "07.1": ws("07.1", [
    kpi("set.leave_types", C("أنواع الإجازات", "Leave types"), C("سجلات نوع الإجازة.", "Leave Type records."), H("Leave Type", "leave_type"), [], 4),
    kpi("set.structures", C("هياكل الرواتب", "Salary structures"), C("هياكل رواتب معتمدة.", "Submitted salary structures."), H("Salary Structure", "salary_structure"), [["docstatus", "=", 1]], 4),
    kpi("set.workflows", C("مسارات الاعتماد", "Workflows"), C("سجلات سير العمل.", "Workflow records."), F("Workflow", "workflow"), [], 4),
    queue("set.queue", C("هياكل رواتب مسودة", "Draft salary structures"), C("هياكل لم تُعتمد بعد.", "Structures not yet submitted."), H("Salary Structure", "salary_structure"), [["docstatus", "=", 0]], "name", "company"),
  ]),
  "07.2": ws("07.2", [
    kpi("prv.roles", C("الأدوار", "Roles"), C("سجلات الدور.", "Role records."), F("Role", "role"), [], 6),
    kpi("prv.uperm", C("صلاحيات المستخدمين", "User permissions"), C("قيود صلاحية على مستوى المستخدم.", "User Permission restrictions."), F("User Permission", "user_permission"), [], 6),
    bar("prv.by_allow", C("الصلاحيات حسب النوع", "Permissions by type"), C("على أي مستند تُقيَّد الصلاحية؟", "Which document is restricted?"), F("User Permission", "user_permission"), "allow", [["Company", "الشركة", "Company", "info"], ["Employee", "الموظف", "Employee", "ok"], ["Department", "القسم", "Department", "warn"]]),
    queue("prv.queue", C("قيود الصلاحية", "Permission restrictions"), C("آخر قيود صلاحية المستخدمين.", "User permission restrictions."), F("User Permission", "user_permission"), [], "user", "for_value"),
  ]),
  "07.3": ws("07.3", [
    kpi("tpl.print", C("قوالب الطباعة", "Print formats"), C("سجلات قالب الطباعة.", "Print Format records."), F("Print Format", "print_format"), [], 4),
    kpi("tpl.notif", C("الإشعارات المفعّلة", "Enabled notifications"), C("إشعارات مفعّلة.", "Enabled Notification records."), F("Notification", "notification"), [["enabled", "=", 1]], 4),
    kpi("tpl.email", C("قوالب البريد", "Email templates"), C("سجلات قالب البريد.", "Email Template records."), F("Email Template", "email_template"), [], 4),
    queue("tpl.queue", C("إشعارات معطّلة", "Disabled notifications"), C("إشعارات غير مفعّلة للمراجعة.", "Disabled notifications to review."), F("Notification", "notification"), [["enabled", "=", 0]], "name", "document_type"),
  ]),
  "07.4": ws("07.4", [
    kpi("int.jobs", C("المهام المجدولة", "Scheduled jobs"), C("أنواع المهام المجدولة — التشغيل الفعلي يحتاج الخادم.", "Scheduled job types — actual execution is server-dependent."), F("Scheduled Job Type", "scheduled_job_type"), [], 6),
    kpi("int.errors", C("سجلات الأخطاء", "Error logs"), C("سجلات الخطأ.", "Error Log records."), F("Error Log", "error_log"), [], 6),
    queue("int.queue", C("أخطاء للمراجعة", "Errors to review"), C("أحدث سجلات الأخطاء.", "Latest error logs."), F("Error Log", "error_log"), [], "method", "creation"),
  ]),
};
