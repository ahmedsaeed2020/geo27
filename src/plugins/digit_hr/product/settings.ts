/**
 * HR policy settings (owner brief 2026-11-15, skill rule "every policy number is an effective-dated setting with an owner,
 * filled with the Saudi default, never hard-coded"). Each key has the Saudi default named here; an Approved DIGIT HR
 * Policy Setting record (company-specific first, then company-wide) effective on the date replaces it, so a change
 * applies from its own date and history keeps the old value. A key without a default (e.g. an overtime budget) stays
 * unconfigured until HR enters a value; figures that need it say so instead of assuming one.
 */
import { adapter, type Doc } from "@/lib/adapter";

export const DHPS = "DIGIT HR Policy Setting";
export type PolicyArea = "Contract" | "Leave" | "Time" | "End of Service" | "GOSI" | "Saudization" | "Payroll" | "Accruals" | "Recruitment" | "Service" | "Compensation" | "Benefits" | "Security" | "Platform" | "Analytics";
export interface PolicyKey { key: string; area: PolicyArea; en: string; ar: string; unit: "days" | "weeks" | "hours" | "pct" | "months" | "SAR" | "day" | "count" | "seconds" | "minutes" | "metres"; default: number | null; source: string }

/** Saudi defaults: Labour Law (Royal Decree M/51 and amendments), GOSI regulation, Nitaqat programme, Mudad WPS. */
export const POLICY_KEYS: PolicyKey[] = [
  { key: "probation_days", area: "Contract", en: "Probation period", ar: "فترة التجربة", unit: "days", default: 90, source: "Labour Law art. 53" },
  { key: "probation_max_days", area: "Contract", en: "Maximum probation (with extension)", ar: "الحد الأقصى للتجربة (مع التمديد)", unit: "days", default: 180, source: "Labour Law art. 53" },
  { key: "notice_days_employer", area: "Contract", en: "Notice by the employer (unlimited contract)", ar: "مهلة الإشعار من صاحب العمل (عقد غير محدد)", unit: "days", default: 60, source: "Labour Law art. 75" },
  { key: "notice_days_employee", area: "Contract", en: "Notice by the employee (unlimited contract)", ar: "مهلة الإشعار من العامل (عقد غير محدد)", unit: "days", default: 30, source: "Labour Law art. 75" },
  { key: "annual_leave_days", area: "Leave", en: "Annual leave (first 5 years)", ar: "الإجازة السنوية (أول 5 سنوات)", unit: "days", default: 21, source: "Labour Law art. 109" },
  { key: "annual_leave_days_after_5y", area: "Leave", en: "Annual leave (after 5 years)", ar: "الإجازة السنوية (بعد 5 سنوات)", unit: "days", default: 30, source: "Labour Law art. 109" },
  { key: "sick_full_days", area: "Leave", en: "Sick leave at full pay", ar: "إجازة مرضية بأجر كامل", unit: "days", default: 30, source: "Labour Law art. 117" },
  { key: "sick_75_days", area: "Leave", en: "Sick leave at 75% pay", ar: "إجازة مرضية بثلاثة أرباع الأجر", unit: "days", default: 60, source: "Labour Law art. 117" },
  { key: "sick_unpaid_days", area: "Leave", en: "Sick leave unpaid", ar: "إجازة مرضية بدون أجر", unit: "days", default: 30, source: "Labour Law art. 117" },
  { key: "hajj_days", area: "Leave", en: "Hajj leave (once)", ar: "إجازة الحج (مرة واحدة)", unit: "days", default: 10, source: "Labour Law art. 114" },
  { key: "marriage_days", area: "Leave", en: "Marriage leave", ar: "إجازة الزواج", unit: "days", default: 5, source: "Labour Law art. 113" },
  { key: "bereavement_days", area: "Leave", en: "Bereavement leave", ar: "إجازة الوفاة", unit: "days", default: 5, source: "Labour Law art. 113" },
  { key: "paternity_days", area: "Leave", en: "Paternity leave", ar: "إجازة المولود", unit: "days", default: 3, source: "Labour Law art. 113" },
  { key: "maternity_weeks", area: "Leave", en: "Maternity leave", ar: "إجازة الوضع", unit: "weeks", default: 12, source: "Labour Law art. 151 (2024 amendment)" },
  // owner round H2 (2026-11-17): carried-forward leave needs the employer's agreement (art. 109); the cap and the warning window are company settings with these defaults
  { key: "leave_carry_forward_max_days", area: "Leave", en: "Annual leave carried into the next period (maximum)", ar: "الحد الأعلى لرصيد الإجازة المرحّل للفترة التالية", unit: "days", default: 10, source: "Labour Law art. 109 (postponement by agreement) — company cap, best practice" },
  { key: "leave_lose_warn_days", area: "Leave", en: "Warn about balance to be lost this many days before the period ends", ar: "التنبيه بالرصيد الذي سيُفقد قبل نهاية الفترة بعدد أيام", unit: "days", default: 90, source: "Best practice (leave planning)" },
  { key: "late_grace_minutes", area: "Time", en: "Grace before a check-in counts as late / a check-out as early", ar: "مهلة السماح قبل احتساب التأخير أو الخروج المبكر", unit: "minutes", default: 15, source: "Company attendance rule (Shift Type grace when set)" },
  { key: "work_hours_week", area: "Time", en: "Normal working hours per week", ar: "ساعات العمل الأسبوعية", unit: "hours", default: 48, source: "Labour Law art. 98" },
  { key: "work_hours_day", area: "Time", en: "Normal working hours per day", ar: "ساعات العمل اليومية", unit: "hours", default: 8, source: "Labour Law art. 98" },
  { key: "ramadan_hours_day", area: "Time", en: "Working hours per day in Ramadan (Muslim employees)", ar: "ساعات العمل اليومية في رمضان (للمسلمين)", unit: "hours", default: 6, source: "Labour Law art. 98" },
  { key: "overtime_rate_pct", area: "Time", en: "Overtime pay rate (of hourly wage)", ar: "أجر العمل الإضافي (من أجر الساعة)", unit: "pct", default: 150, source: "Labour Law art. 107" },
  { key: "overtime_budget_hours_month", area: "Time", en: "Overtime budget per month", ar: "ميزانية العمل الإضافي الشهرية", unit: "hours", default: null, source: "Company budget (HR sets)" },
  { key: "eos_months_first5", area: "End of Service", en: "End of service — months of wage per year (first 5 years)", ar: "مكافأة نهاية الخدمة — أشهر أجر لكل سنة (أول 5 سنوات)", unit: "months", default: 0.5, source: "Labour Law art. 84" },
  { key: "eos_months_after5", area: "End of Service", en: "End of service — months of wage per year (after 5 years)", ar: "مكافأة نهاية الخدمة — أشهر أجر لكل سنة (بعد 5 سنوات)", unit: "months", default: 1, source: "Labour Law art. 84" },
  { key: "eos_resign_2_5_pct", area: "End of Service", en: "Resignation 2–5 years — share of the award", ar: "الاستقالة من 2 إلى 5 سنوات — نسبة المكافأة", unit: "pct", default: 33.33, source: "Labour Law art. 85" },
  { key: "eos_resign_5_10_pct", area: "End of Service", en: "Resignation 5–10 years — share of the award", ar: "الاستقالة من 5 إلى 10 سنوات — نسبة المكافأة", unit: "pct", default: 66.67, source: "Labour Law art. 85" },
  { key: "eos_resign_10_pct", area: "End of Service", en: "Resignation 10 years or more — share of the award", ar: "الاستقالة 10 سنوات فأكثر — نسبة المكافأة", unit: "pct", default: 100, source: "Labour Law art. 85" },
  { key: "gosi_saudi_employee_pct", area: "GOSI", en: "GOSI — Saudi employee share (annuities 9% + SANED 0.75%)", ar: "التأمينات — حصة الموظف السعودي (المعاشات 9% + ساند 0.75%)", unit: "pct", default: 9.75, source: "GOSI regulation" },
  { key: "gosi_saudi_employer_pct", area: "GOSI", en: "GOSI — employer share for Saudis (annuities 9% + SANED 0.75% + hazards 2%)", ar: "التأمينات — حصة صاحب العمل للسعوديين (المعاشات 9% + ساند 0.75% + الأخطار 2%)", unit: "pct", default: 11.75, source: "GOSI regulation" },
  { key: "gosi_non_saudi_employer_pct", area: "GOSI", en: "GOSI — employer share for non-Saudis (occupational hazards)", ar: "التأمينات — حصة صاحب العمل لغير السعوديين (الأخطار المهنية)", unit: "pct", default: 2, source: "GOSI regulation" },
  { key: "gosi_wage_cap", area: "GOSI", en: "GOSI — maximum contributory wage", ar: "التأمينات — الحد الأعلى للأجر الخاضع", unit: "SAR", default: 45000, source: "GOSI regulation" },
  { key: "gosi_wage_min", area: "GOSI", en: "GOSI — minimum contributory wage", ar: "التأمينات — الحد الأدنى للأجر الخاضع", unit: "SAR", default: 1500, source: "GOSI regulation" },
  { key: "saudization_target_pct", area: "Saudization", en: "Saudization target (Nitaqat green band threshold)", ar: "مستهدف التوطين (حد النطاق الأخضر في نطاقات)", unit: "pct", default: 30, source: "Nitaqat programme — set per activity and size" },
  { key: "saudization_platinum_pct", area: "Saudization", en: "Nitaqat platinum band threshold", ar: "حد النطاق البلاتيني في نطاقات", unit: "pct", default: 40, source: "Nitaqat programme — set per activity and size" },
  { key: "saudization_red_pct", area: "Saudization", en: "Nitaqat red band (below)", ar: "النطاق الأحمر في نطاقات (أقل من)", unit: "pct", default: 10, source: "Nitaqat programme — set per activity and size" },
  { key: "payroll_cutoff_day", area: "Payroll", en: "Payroll cut-off day of the month", ar: "يوم إقفال مدخلات الرواتب في الشهر", unit: "day", default: 25, source: "Company payroll calendar" },
  { key: "payroll_variance_pct", area: "Payroll", en: "Net pay change that needs an explanation", ar: "تغير صافي الراتب الذي يحتاج إلى تفسير", unit: "pct", default: 10, source: "Company payroll control" },
  { key: "air_ticket_accrual_month", area: "Accruals", en: "Air ticket accrual per eligible employee per month", ar: "استحقاق تذكرة السفر لكل موظف مستحق شهريًا", unit: "SAR", default: null, source: "Company policy (HR sets)" },
  { key: "leave_salary_accrual", area: "Accruals", en: "Accrue leave salary monthly (1 = yes)", ar: "استحقاق راتب الإجازة شهريًا (1 = نعم)", unit: "count", default: 1, source: "IAS 19 short-term absences" },
  // HR round 2 (owner ruling 7, 2026-11-15): each open owner decision is a setting with the best-practice default named here
  { key: "earned_wage_enabled", area: "Payroll", en: "On-demand pay enabled (1 = yes)", ar: "تفعيل الأجر عند الطلب (1 = نعم)", unit: "count", default: 1, source: "Best practice (PAY-13), company may switch off" },
  { key: "earned_wage_pct", area: "Payroll", en: "On-demand pay — share of the wage earned to date", ar: "الأجر عند الطلب — نسبة المكتسب حتى اليوم", unit: "pct", default: 50, source: "Best practice (PAY-13)" },
  { key: "payroll_four_eyes", area: "Payroll", en: "Independent verification before payroll posting (1 = required)", ar: "تحقق مستقل قبل ترحيل الرواتب (1 = إلزامي)", unit: "count", default: 1, source: "Best practice (PAY-15, segregation of duties)" },
  { key: "rest_day_ot_rate_pct", area: "Time", en: "Overtime on the weekly rest day (of hourly wage)", ar: "العمل الإضافي في يوم الراحة الأسبوعية (من أجر الساعة)", unit: "pct", default: 150, source: "Labour Law art. 107" },
  { key: "holiday_ot_rate_pct", area: "Time", en: "Overtime on an official holiday (of hourly wage)", ar: "العمل الإضافي في العطلة الرسمية (من أجر الساعة)", unit: "pct", default: 150, source: "Labour Law art. 107" },
  { key: "checkin_repeat_seconds", area: "Time", en: "Ignore a repeated check-in within", ar: "تجاهل تكرار تسجيل الحضور خلال", unit: "seconds", default: 60, source: "Best practice (ATT-01)" },
  { key: "geofence_radius_m", area: "Time", en: "Check-in radius when a branch has none", ar: "نطاق تسجيل الحضور عند عدم تحديده للفرع", unit: "metres", default: 200, source: "Best practice (ATT-01)" },
  { key: "min_rest_hours", area: "Time", en: "Minimum rest between two shifts", ar: "أقل راحة بين ورديتين", unit: "hours", default: 8, source: "Best practice (shift swap eligibility)" },
  { key: "long_leave_days", area: "Leave", en: "Leave longer than this opens an HR case", ar: "الإجازة الأطول من ذلك تفتح حالة موارد بشرية", unit: "days", default: 30, source: "Best practice (LEV-06)" },
  { key: "candidate_retention_months", area: "Recruitment", en: "Keep candidate data for", ar: "مدة الاحتفاظ ببيانات المرشحين", unit: "months", default: 24, source: "PDPL best practice (REC-14)" },
  { key: "regretted_min_score", area: "Analytics", en: "Regretted leaver — last appraisal score at least", ar: "الفقد غير المرغوب — آخر درجة تقييم لا تقل عن", unit: "count", default: 4, source: "Best practice (KPIR Regretted Attrition)" },
  { key: "absence_alert_pct", area: "Analytics", en: "Absence rate alert above", ar: "تنبيه نسبة الغياب فوق", unit: "pct", default: 5, source: "Best practice (KPIC Absence Rate)" },
  { key: "turnover_alert_pct", area: "Analytics", en: "Turnover rate highlighted in reports above", ar: "إبراز نسبة الدوران في التقارير فوق", unit: "pct", default: 10, source: "Best practice (KPIR Turnover Rate)" },
  { key: "span_of_control_max", area: "Analytics", en: "Span of control — direct reports above", ar: "نطاق الإشراف — المرؤوسون المباشرون فوق", unit: "count", default: 12, source: "Best practice (KPIR Span of Control)" },
  { key: "quality_of_hire_days", area: "Recruitment", en: "Quality-of-hire review after", ar: "تقييم جودة التعيين بعد", unit: "days", default: 90, source: "Best practice (REC-13)" },
  { key: "case_duplicate_days", area: "Service", en: "Warn about a duplicate case within", ar: "التنبيه عن حالة مكررة خلال", unit: "days", default: 7, source: "Best practice (CAS-02)" },
  { key: "case_sla_alert_pct", area: "Service", en: "Alert when a case has used this share of its time", ar: "التنبيه عند استهلاك الحالة لهذه النسبة من مهلتها", unit: "pct", default: 80, source: "Best practice (CAS-03)" },
  { key: "comp_budget_pct", area: "Compensation", en: "Default merit budget (of base payroll)", ar: "ميزانية الزيادات الافتراضية (من الرواتب الأساسية)", unit: "pct", default: 3, source: "Best practice (CMP-02)" },
  { key: "compa_ratio_alert_pct", area: "Compensation", en: "Compa-ratio above this needs a justification", ar: "نسبة الموقع من النطاق فوق هذا تحتاج مبررًا", unit: "pct", default: 120, source: "Best practice (CMP-05)" },
  { key: "benefits_window_days", area: "Benefits", en: "Open enrolment window length", ar: "مدة فترة التسجيل المفتوح في المزايا", unit: "days", default: 30, source: "Best practice (BEN-03)" },
  { key: "session_expiry_hours", area: "Security", en: "Session expires after", ar: "تنتهي الجلسة بعد", unit: "hours", default: 8, source: "Best practice (SHL-06)" },
  { key: "mfa_sensitive_roles", area: "Security", en: "Two-step sign-in for payroll and HR managers (1 = required)", ar: "التحقق بخطوتين لمديري الرواتب والموارد البشرية (1 = إلزامي)", unit: "count", default: 1, source: "Best practice (SHL-06)" },
  { key: "reset_token_minutes", area: "Security", en: "Password reset link valid for", ar: "صلاحية رابط استعادة كلمة المرور", unit: "minutes", default: 30, source: "Best practice (SHL-06)" },
  { key: "access_revoke_days", area: "Security", en: "Revoke system access this many days after the last working day", ar: "سحب صلاحيات الأنظمة بعد آخر يوم عمل بعدد أيام", unit: "days", default: 0, source: "Best practice (ONB-06)" },
  { key: "dsr_due_days", area: "Security", en: "Answer a personal-data request within", ar: "الرد على طلب البيانات الشخصية خلال", unit: "days", default: 30, source: "PDPL (Personal Data Protection Law)" },
  { key: "loan_max_deduction_pct", area: "Payroll", en: "Loan installment at most (of the monthly wage)", ar: "قسط القرض بحد أقصى (من الأجر الشهري)", unit: "pct", default: 10, source: "Labour Law art. 92 (loan deductions)" },
  { key: "ess_edit_open_case", area: "Service", en: "Employee may edit their own case while it is open and unassigned (1 = yes)", ar: "يعدّل الموظف حالته ما دامت مفتوحة وغير مسندة (1 = نعم)", unit: "count", default: 1, source: "Best practice (HR-B3)" },
  { key: "expiry_reminder_days", area: "Contract", en: "Remind HR about a document expiring within", ar: "تذكير الموارد البشرية بوثيقة تنتهي خلال", unit: "days", default: 30, source: "Best practice (GAP-20 expiry job)" },
  { key: "create_user_automatically", area: "Security", en: "Create a sign-in account when an employee with an e-mail is saved (1 = on)", ar: "إنشاء حساب دخول عند حفظ موظف لديه بريد إلكتروني (1 = مفعل)", unit: "count", default: 0, source: "HR research 2026 (FR26-0137)" },
  { key: "ai_assist_enabled", area: "Platform", en: "AI provider for HR assistants (0 = rule-based only)", ar: "مزود الذكاء الاصطناعي لمساعدي الموارد البشرية (0 = قواعد فقط)", unit: "count", default: 0, source: "Owner ruling 4 (AI later)" },
  { key: "bulk_atomic_limit", area: "Platform", en: "Largest all-or-nothing batch", ar: "أكبر دفعة تنفذ كاملة أو لا شيء", unit: "count", default: 50, source: "Best practice (SHL-10, TIM-01)" },
  { key: "integration_max_attempts", area: "Platform", en: "Retries before an exchange is parked", ar: "عدد المحاولات قبل إيقاف التبادل", unit: "count", default: 5, source: "Best practice (PLT-04)" },
  { key: "integration_retry_minutes", area: "Platform", en: "Wait before retrying an exchange", ar: "الانتظار قبل إعادة محاولة التبادل", unit: "minutes", default: 15, source: "Best practice (PLT-04)" },
];
const BY_KEY = new Map(POLICY_KEYS.map((k) => [k.key, k]));
export const policyKey = (key: string) => BY_KEY.get(key);

function records(key: string): Doc[] {
  try { return adapter.list(DHPS).filter((d) => d["setting"] === key && (d["setting_status"] ?? "Approved") === "Approved"); } catch { return []; }
}
/** The record in force for `key` on `on` (company-specific before company-wide; latest effective date wins). */
export function policyRecord(key: string, on: string, company?: string): Doc | undefined {
  const live = records(key).filter((d) => String(d["effective_from"] ?? "") <= on && (!d["effective_to"] || String(d["effective_to"]) >= on));
  const pick = (l: Doc[]) => l.sort((a, b) => String(b["effective_from"]).localeCompare(String(a["effective_from"])))[0];
  return (company ? pick(live.filter((d) => d["company"] === company)) : undefined) ?? pick(live.filter((d) => !d["company"]));
}
/** The value in force on a date: the effective record, else the Saudi default, else null (not configured). */
export function policyValue(key: string, on: string, company?: string): number | null {
  const r = policyRecord(key, on, company);
  if (r && r["value"] !== undefined && r["value"] !== null && r["value"] !== "") return Number(r["value"]);
  return BY_KEY.get(key)?.default ?? null;
}
/** Where a value comes from (record name or "default"), for the settings screen and the calculation notes. */
export function policySource(key: string, on: string, company?: string): { from: "record" | "default" | "unset"; record?: string | undefined; effective_from?: string | undefined } {
  const r = policyRecord(key, on, company);
  if (r) return { from: "record", record: r.name, effective_from: String(r["effective_from"] ?? "") };
  return BY_KEY.get(key)?.default === null ? { from: "unset" } : { from: "default" };
}

const PERMS = [
  { role: "HR Manager", read: 1, write: 1, create: 1, delete: 1, report: 1, export: 1, print: 1, share: 1 },
  { role: "HR User", read: 1, report: 1, print: 1 },
  { role: "System Manager", read: 1, write: 1, create: 1, delete: 1, report: 1, export: 1 },
];
export const POLICY_DOCTYPE = {
  name: DHPS, module: "DIGIT HR", autoname: "format:DHPS-{YYYY}-{#####}", naming_rule: "Expression", title_field: "setting", track_changes: 1, permissions: PERMS,
  fields: [
    { fieldname: "setting", fieldtype: "Select", label: "Setting", options: POLICY_KEYS.map((k) => k.key).join("\n"), reqd: 1, in_list_view: 1, in_standard_filter: 1 },
    { fieldname: "company", fieldtype: "Link", label: "Company", options: "Company", in_standard_filter: 1, description: "Empty = all companies" },
    { fieldname: "setting_status", fieldtype: "Select", label: "Setting Status", options: "Approved\nDraft\nSuperseded", default: "Approved", in_list_view: 1, in_standard_filter: 1 },
    { fieldname: "column_break_1", fieldtype: "Column Break" },
    { fieldname: "effective_from", fieldtype: "Date", label: "Effective From", reqd: 1, in_list_view: 1 },
    { fieldname: "effective_to", fieldtype: "Date", label: "Effective To" },
    { fieldname: "section_value", fieldtype: "Section Break", label: "Value" },
    { fieldname: "value", fieldtype: "Float", label: "Value", reqd: 1, in_list_view: 1 },
    { fieldname: "rule_set", fieldtype: "Link", label: "Rule Set", options: "DIGIT Saudi Rule Set" },
    { fieldname: "source_reference", fieldtype: "Data", label: "Source Reference" },
    { fieldname: "owner_user", fieldtype: "Link", label: "Setting Owner", options: "User" },
    { fieldname: "notes", fieldtype: "Small Text", label: "Notes" },
  ],
};
export const POLICY_RULES: [string, string, string][] = [
  [DHPS, "doc.effective_to && doc.effective_from && doc.effective_to < doc.effective_from", "Effective To cannot be before Effective From"],
];
export const POLICY_AR: Record<string, string> = {
  [DHPS]: "إعداد سياسة الموارد البشرية", Setting: "الإعداد", "Setting Status": "حالة الإعداد", "Setting Owner": "مالك الإعداد", "Rule Set": "مجموعة القواعد", "Source Reference": "المرجع النظامي", Superseded: "مستبدل",
  "Empty = all companies": "فارغ = كل الشركات",
  ...Object.fromEntries(POLICY_KEYS.map((k) => [k.key, k.ar])),
};
