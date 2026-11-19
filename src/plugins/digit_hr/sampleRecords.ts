/**
 * Preview-only sample records for DIGIT HR extension DocTypes (positions, assignment history, a position budget,
 * employment contracts, one contract amendment review, three service cases and one team leave request awaiting Sara) so the Position/Contract/Case 360 pages
 * have real adapter rows (plus one succession plan) to read. Installed insert-if-missing by plugins/runtime.installFixtures for the enabled plugin
 * (records carry `__plugin: digit_hr`, so resetPluginData removes them). Manifest `fixtures` are NOT written into the
 * Frappe export (plugins/export.ts exports only configuration fixtures), so this demo data never ships to a site.
 * Dates are relative to the day the preview loads so the sample stays meaningful (an overdue case, an upcoming contract end).
 * No salary, cost or statutory values are seeded.
 */
const COMPANY = "Digit Demo Trading Co.";
const FIN = "Finance - DDT";
const SYN_CO = "Digit Synthetic Co";

const iso = (d: Date) => d.toISOString().slice(0, 10);
const shift = (days: number) => { const d = new Date(); d.setUTCHours(0, 0, 0, 0); d.setUTCDate(d.getUTCDate() + days); return d; };
const day = (days: number) => iso(shift(days));
const at = (days: number, hm: string) => `${day(days)} ${hm}:00`;

export type SampleRecord = { doctype: string; name: string; data: Record<string, unknown> };

export function digitHrSampleRecords(): SampleRecord[] {
  return [
    // Positions: one filled manager seat, one filled accountant seat reporting to it, one vacant accountant seat.
    { doctype: "DIGIT Position", name: "SYN-POS-001", data: { position_title: "Finance Manager", company: COMPANY, department: FIN, designation: "Finance Manager", position_status: "Filled", incumbent: "DDT-EMP-002", reports_to: "", effective_from: "2024-01-01" } },
    { doctype: "DIGIT Position", name: "SYN-POS-002", data: { position_title: "Accountant", company: COMPANY, department: FIN, designation: "Accountant", position_status: "Filled", incumbent: "DDT-EMP-008", reports_to: "SYN-POS-001", effective_from: "2024-01-01" } },
    { doctype: "DIGIT Position", name: "SYN-POS-003", data: { position_title: "Accountant", company: COMPANY, department: FIN, designation: "Accountant", position_status: "Vacant", incumbent: "", reports_to: "SYN-POS-001", effective_from: "2026-07-01" } },
    // Assignment history: SYN-POS-002 changed holder once; the current holder's row is open-ended.
    { doctype: "DIGIT Assignment History", name: "SYN-DAH-001", data: { employee: "DDT-EMP-002", company: COMPANY, position: "SYN-POS-001", department: FIN, designation: "Finance Manager", from_date: "2024-01-01", to_date: "", change_reason: "Hire" } },
    { doctype: "DIGIT Assignment History", name: "SYN-DAH-002", data: { employee: "DDT-EMP-014", company: COMPANY, position: "SYN-POS-002", department: FIN, designation: "Accountant", from_date: "2024-01-01", to_date: "2025-06-30", change_reason: "Hire" } },
    { doctype: "DIGIT Assignment History", name: "SYN-DAH-003", data: { employee: "DDT-EMP-008", company: COMPANY, position: "SYN-POS-002", department: FIN, designation: "Accountant", from_date: "2025-07-01", to_date: "", change_reason: "Transfer" } },
    // One succession plan for the manager seat; the vacant accountant seat deliberately has none.
    { doctype: "DIGIT Succession Plan", name: "SYN-DSP-001", data: { position: "SYN-POS-001", successor: "DDT-EMP-008", readiness: "1-2 Years", risk_of_loss: "Low", development_notes: "برنامج تطوير قيادي ومهام إشراف على الإغلاق الشهري." } },
    // Approved headcount only (no cost figure is seeded).
    { doctype: "DIGIT Position Budget", name: "SYN-DPB-2026", data: { budget_title: "ميزانية مناصب المالية 2026", company: COMPANY, department: FIN, from_date: "2026-01-01", to_date: "2026-12-31", approved_headcount: 3, budget_status: "Approved", docstatus: 1 } },
    // Contracts: an active fixed-term contract ending soon, an unlimited contract and an expired earlier contract.
    { doctype: "DIGIT Employment Contract", name: "SYN-DEC-001", data: { employee: "DDT-EMP-008", company: COMPANY, contract_type: "Fixed Term", start_date: "2025-07-01", end_date: day(75), contract_status: "Active", probation_days: 90, notice_days: 60, docstatus: 1 } },
    { doctype: "DIGIT Employment Contract", name: "SYN-DEC-002", data: { employee: "DDT-EMP-002", company: COMPANY, contract_type: "Unlimited", start_date: "2024-01-01", end_date: "", contract_status: "Active", probation_days: 90, notice_days: 60, docstatus: 1 } },
    { doctype: "DIGIT Employment Contract", name: "SYN-DEC-003", data: { employee: "DDT-EMP-014", company: COMPANY, contract_type: "Fixed Term", start_date: "2024-01-01", end_date: "2025-06-30", contract_status: "Expired", probation_days: 90, notice_days: 30, docstatus: 1 } },
    // A submitted extension review: amendments never rewrite the contract, so the contract still shows its own end date.
    { doctype: "DIGIT Contract Amendment", name: "SYN-DCA-001", data: { contract: "SYN-DEC-001", effective_date: day(-20), amendment_type: "Extension", new_end_date: day(440), details: "مراجعة تمديد العقد لسنة إضافية بعد موافقة مدير القسم.", docstatus: 1 } },
    // Job architecture (01.2): two families (Accounting nested under Finance) and three profiles linked to designations
    // that employees already hold, so the section can show family → profile → designation → incumbents. Other designations
    // deliberately have no profile (shown as coverage findings, not hidden).
    { doctype: "DIGIT Job Family", name: "SYN-DJF-001", data: { family_name: "Finance", description: "وظائف الإدارة المالية والرقابة." } },
    { doctype: "DIGIT Job Family", name: "SYN-DJF-002", data: { family_name: "Accounting", parent_family: "SYN-DJF-001", description: "وظائف القيد والإقفال والتسويات." } },
    { doctype: "DIGIT Job Family", name: "SYN-DJF-003", data: { family_name: "Operations and Warehousing", description: "وظائف التشغيل والتخزين." } },
    { doctype: "DIGIT Job Profile", name: "SYN-DJP-001", data: { profile_name: "Finance Manager", job_family: "SYN-DJF-001", designation: "Finance Manager", grade_band: "Lead", responsibilities: "قيادة الإقفال الشهري والموازنة والتقارير المالية.", competencies: "التخطيط المالي، القيادة، الامتثال." } },
    { doctype: "DIGIT Job Profile", name: "SYN-DJP-002", data: { profile_name: "Accountant", job_family: "SYN-DJF-002", designation: "Accountant", grade_band: "Professional", responsibilities: "القيود اليومية والتسويات البنكية ودعم الإقفال.", competencies: "المحاسبة، الدقة، أنظمة ERP." } },
    { doctype: "DIGIT Job Profile", name: "SYN-DJP-003", data: { profile_name: "Warehouse Supervisor", job_family: "SYN-DJF-003", designation: "Warehouse Supervisor", grade_band: "Senior", responsibilities: "الإشراف على الاستلام والصرف والجرد.", competencies: "إدارة المخزون، السلامة، الإشراف." } },
    // Employment changes (01.5): one submitted historical promotion, one past-dated draft promotion ready for review and one
    // future-dated draft transfer (cannot be submitted before its date). No CTC values are seeded.
    { doctype: "Employee Promotion", name: "SYN-EPR-001", data: { employee: "DDT-EMP-002", employee_name: "محمد الدوسري", company: COMPANY, department: FIN, promotion_date: "2025-01-01", promotion_details: [{ property: "Designation", fieldname: "designation", current: "Accountant", new: "Finance Manager" }], docstatus: 1 } },
    { doctype: "Employee Promotion", name: "SYN-EPR-002", data: { employee: "DDT-EMP-010", employee_name: "يوسف العتيبي", company: COMPANY, department: "HR - DDT", promotion_date: day(-3), promotion_details: [{ property: "Designation", fieldname: "designation", current: "HR Officer", new: "HR Manager" }], docstatus: 0 } },
    { doctype: "Employee Transfer", name: "SYN-ETR-001", data: { employee: "DDT-EMP-020", employee_name: "حصة العتيبي", company: COMPANY, department: FIN, transfer_date: day(12), transfer_details: [{ property: "Department", fieldname: "department", current: FIN, new: "Operations - DDT" }], docstatus: 0 } },
    // Onboarding (02.2): one template and one submitted onboarding for a dedicated accepted offer (SYN-JO-101), so Lama's
    // accepted offer keeps its own "start onboarding" journey. Two activities already have native Tasks (one completed, one
    // open and past due); two have none yet, so the board shows every state.
    { doctype: "Job Applicant", name: "SYN-JA-101", data: { applicant_name: "Noor Applicant", email_id: "noor.a@digit.test", job_title: "SYN-JOB-003", status: "Accepted" } },
    { doctype: "Job Offer", name: "SYN-JO-101", data: { job_applicant: "SYN-JA-101", applicant_name: "Noor Applicant", designation: "Sales Executive", offer_date: day(-20), status: "Accepted", company: SYN_CO, docstatus: 1 } },
    { doctype: "Employee Onboarding Template", name: "SYN-EOT-001", data: { title: "Standard office onboarding", company: SYN_CO, activities: [
      { activity_name: "Prepare laptop and accounts", user: "Administrator", begin_on: 0, duration: 3, task_weight: 2 },
      { activity_name: "Issue access badge", role: "HR User", begin_on: 1, duration: 2, task_weight: 1 },
      { activity_name: "Policy acknowledgement", role: "HR User", begin_on: 8, duration: 2, task_weight: 1 },
      { activity_name: "Welcome meeting with manager", begin_on: 11, duration: 1, task_weight: 1 },
    ] } },
    { doctype: "Task", name: "SYN-TASK-ONB-001", data: { subject: "Prepare laptop and accounts : Noor Applicant", company: SYN_CO, status: "Completed", exp_start_date: day(-6), exp_end_date: day(-3), completed_on: day(-4), task_weight: 2 } },
    { doctype: "Task", name: "SYN-TASK-ONB-002", data: { subject: "Issue access badge : Noor Applicant", company: SYN_CO, status: "Open", exp_start_date: day(-5), exp_end_date: day(-3), task_weight: 1 } },
    { doctype: "Employee Onboarding", name: "SYN-EON-001", data: { job_applicant: "SYN-JA-101", job_offer: "SYN-JO-101", employee_onboarding_template: "SYN-EOT-001", company: SYN_CO, boarding_status: "In Process", employee_name: "Noor Applicant", designation: "Sales Executive", date_of_joining: day(5), boarding_begins_on: day(-6), docstatus: 1, activities: [
      { activity_name: "Prepare laptop and accounts", user: "Administrator", begin_on: 0, duration: 3, task_weight: 2, task: "SYN-TASK-ONB-001" },
      { activity_name: "Issue access badge", role: "HR User", begin_on: 1, duration: 2, task_weight: 1, task: "SYN-TASK-ONB-002" },
      { activity_name: "Policy acknowledgement", role: "HR User", begin_on: 8, duration: 2, task_weight: 1 },
      { activity_name: "Welcome meeting with manager", user: "sara.employee@digit.test", begin_on: 11, duration: 1, task_weight: 1 },
    ] } },
    // Skills (02.4): native Skill records and Employee Skill Maps for three DDT accountants (DDT-EMP-014 deliberately has
    // none). Proficiency is a Rating fraction (0–1) as stored by Frappe. No required-skill list is seeded (see skills.ts).
    ...["Financial Reporting", "Bank Reconciliation", "ERP Systems", "Spreadsheet Modelling"].map((skill) => ({ doctype: "Skill", name: skill, data: { skill_name: skill } })),
    { doctype: "Employee Skill Map", name: "DDT-EMP-008", data: { employee: "DDT-EMP-008", employee_name: "ناصر الزهراني", designation: "Accountant", employee_skills: [{ skill: "Financial Reporting", proficiency: 0.8, evaluation_date: "2026-03-15" }, { skill: "Bank Reconciliation", proficiency: 1, evaluation_date: "2026-03-15" }, { skill: "ERP Systems", proficiency: 0.6, evaluation_date: "2025-09-01" }], trainings: [{ training: "SYN-TEV-0001", training_date: "2026-10-05" }] } },
    { doctype: "Employee Skill Map", name: "DDT-EMP-020", data: { employee: "DDT-EMP-020", employee_name: "حصة العتيبي", designation: "Accountant", employee_skills: [{ skill: "Bank Reconciliation", proficiency: 0.6, evaluation_date: "2026-02-01" }, { skill: "Spreadsheet Modelling", proficiency: 0.8, evaluation_date: "2026-02-01" }] } },
    { doctype: "Employee Skill Map", name: "DDT-EMP-026", data: { employee: "DDT-EMP-026", employee_name: "روان العنزي", designation: "Accountant", employee_skills: [{ skill: "Financial Reporting", proficiency: 0.4, evaluation_date: "2025-11-20" }, { skill: "ERP Systems", proficiency: 0.8, evaluation_date: "2025-11-20" }] } },
    // Performance (02.3): two goals for Sara in the open 2026 cycle (no appraisal yet), so cycle completion shows goals
    // alongside a not-started appraisal.
    { doctype: "Goal", name: "SYN-GOAL-001", data: { goal_name: "Close monthly books within five working days", employee: "SYN-EMP-001", employee_name: "سارة", company: SYN_CO, appraisal_cycle: "SYN-APC-2026", start_date: "2026-07-01", end_date: "2026-12-31", progress: 40, status: "In Progress" } },
    { doctype: "Goal", name: "SYN-GOAL-002", data: { goal_name: "Reconcile bank accounts weekly", employee: "SYN-EMP-001", employee_name: "سارة", company: SYN_CO, appraisal_cycle: "SYN-APC-2026", start_date: "2026-07-01", end_date: "2026-12-31", progress: 80, status: "In Progress" } },
    // Manager self-service: Huda (SYN-EMP-003, reports to Sara) asks for casual leave with Sara as leave approver, so Sara's
    // Experience home opens on the Team lens automatically. Allocation mirrors the other synthetic employees (12 casual days).
    { doctype: "Leave Allocation", name: "SYN-LAL-0004", data: { employee: "SYN-EMP-003", employee_name: "Huda Synthetic", leave_type: "Casual Leave", from_date: "2026-01-01", to_date: "2026-12-31", new_leaves_allocated: 12, total_leaves_allocated: 12, docstatus: 1, company: "Digit Synthetic Co" } },
    { doctype: "Leave Application", name: "SYN-LAP-0004", data: { employee: "SYN-EMP-003", employee_name: "Huda Synthetic", leave_type: "Casual Leave", from_date: day(14), to_date: day(15), total_leave_days: 2, status: "Open", docstatus: 0, leave_approver: "sara.employee@digit.test", description: "طلب إجازة عارضة لظرف عائلي.", posting_date: day(-1), company: "Digit Synthetic Co" } },
    // Service cases: one in progress and overdue, one open and unassigned, one resolved.
    { doctype: "DIGIT HR Service Case", name: "SYN-DSC-001", data: { subject: "طلب خطاب تعريف بالراتب للبنك", employee: "DDT-EMP-008", company: COMPANY, category: "HR Letter", severity: "Medium", case_status: "In Progress", opened_on: at(-3, "09:15"), due_at: at(-1, "17:00"), assigned_to: "Administrator", description: "يحتاج الموظف خطاب تعريف موجهاً إلى البنك لفتح حساب.", resolution_notes: "" } },
    { doctype: "DIGIT HR Service Case", name: "SYN-DSC-002", data: { subject: "استفسار عن رصيد الإجازة السنوية", employee: "DDT-EMP-002", company: COMPANY, category: "Leave Query", severity: "Low", case_status: "Open", opened_on: at(-1, "11:30"), due_at: at(2, "17:00"), assigned_to: "", description: "يرغب الموظف في التحقق من رصيد الإجازة السنوية المتبقي.", resolution_notes: "" } },
    { doctype: "DIGIT HR Service Case", name: "SYN-DSC-003", data: { subject: "طلب نسخة من شهادة الخبرة", employee: "DDT-EMP-014", company: COMPANY, category: "Document Request", severity: "Low", case_status: "Resolved", opened_on: at(-10, "10:00"), due_at: at(-7, "17:00"), assigned_to: "Administrator", description: "طلب نسخة من شهادة الخبرة السابقة.", resolution_notes: "سُلّمت النسخة للموظف عبر البريد الداخلي." } },
  ];
}
