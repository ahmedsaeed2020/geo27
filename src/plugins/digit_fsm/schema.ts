/**
 * DIGIT FSM + ITM — app-owned DocTypes and Custom Fields (plugin digit_fsm).
 * Native Customer / Contact / Address / Company / Item / Employee / Supplier / Issue / Quotation / Material Request /
 * Stock Entry / Timesheet / Sales Invoice are reused through Link fields and Custom Fields, never cloned
 * (docs/digit_fsm/FIT_GAP.csv). The conceptual ontology (kit 04, 46 candidates) folds into the DocTypes below;
 * candidates that need a server (portal grants, offline queue, message providers) stay explicit gaps
 * (docs/digit_fsm/OPEN_GAPS.md). State axes are deliberately separate: Job.workflow_state, Visit.workflow_state +
 * access_outcome, Run.workflow_state + technical_result, Deficiency.workflow_state + commercial_decision,
 * Charge Proposal.status, Integration Exception.status. Every transaction carries `company` and (where it has one)
 * `site`, so Company / Service Site User Permissions scope lists, pickers, reports and exports.
 */
import type { DocField } from "@/lib/catalog";
import type { CustomField, PluginDocType } from "../types";

export const VISIT_DT = "Maintenance Visit";
/** Native company is reused; the generated layout collision is remapped once here. */
export const VISIT_FIELD_MAP: Record<string, string> = { column_break_14: "fsm_column_break_14" };

type X = Partial<DocField>;
const AR: Record<string, string> = {};
const F = (fieldname: string, label: string, ar: string, fieldtype: string, x: X = {}): DocField => { AR[label] = ar; return { fieldname, label, fieldtype, ...x }; };
const D = (fn: string, l: string, ar: string, x: X = {}) => F(fn, l, ar, "Data", x);
const L = (fn: string, l: string, ar: string, options: string, x: X = {}) => F(fn, l, ar, "Link", { options, ...x });
const S = (fn: string, l: string, ar: string, opts: string[], x: X = {}) => F(fn, l, ar, "Select", { options: opts.join("\n"), default: opts[0] ?? "", ...x });
const DT = (fn: string, l: string, ar: string, x: X = {}) => F(fn, l, ar, "Date", x);
const DTT = (fn: string, l: string, ar: string, x: X = {}) => F(fn, l, ar, "Datetime", x);
const TX = (fn: string, l: string, ar: string, x: X = {}) => F(fn, l, ar, "Small Text", x);
const LT = (fn: string, l: string, ar: string, x: X = {}) => F(fn, l, ar, "Long Text", x);
const I = (fn: string, l: string, ar: string, x: X = {}) => F(fn, l, ar, "Int", x);
const N = (fn: string, l: string, ar: string, x: X = {}) => F(fn, l, ar, "Float", x);
const CUR = (fn: string, l: string, ar: string, x: X = {}) => F(fn, l, ar, "Currency", x);
const CK = (fn: string, l: string, ar: string, x: X = {}) => F(fn, l, ar, "Check", x);
const T = (fn: string, l: string, ar: string, options: string) => F(fn, l, ar, "Table", { options });
const SB = (fn: string, l: string, ar: string) => F(fn, l, ar, "Section Break");
let cb = 0;
const CB = (): DocField => ({ fieldname: `column_break_${++cb}`, fieldtype: "Column Break" } as DocField);
const LV = { in_list_view: 1 } as const;
const LVF = { in_list_view: 1, in_standard_filter: 1 } as const;
const REQ = { reqd: 1 } as const;
const RO = { read_only: 1 } as const;
const NC = { no_copy: 1 } as const;
const WF = (states: string[]) => S("workflow_state", "Status", "الحالة", states, { read_only: 1, in_list_view: 1, in_standard_filter: 1, no_copy: 1 } as X);
const CO = () => L("company", "Company", "الشركة", "Company", { in_standard_filter: 1 });

export const FSM_ROLES = ["FSM Manager", "FSM Dispatcher", "FSM Technician", "FSM Reviewer", "FSM Estimator"];
const perms = (write: string[] = []) => [
  { role: "System Manager", read: 1, write: 1, create: 1, delete: 1, report: 1, export: 1, print: 1 },
  { role: "FSM Manager", read: 1, write: 1, create: 1, delete: 1, report: 1, export: 1, print: 1 },
  ...(["FSM Dispatcher", "FSM Technician", "FSM Reviewer", "FSM Estimator"]).map((role) => ({ role, read: 1, report: 1, print: 1, ...(write.includes(role) ? { write: 1, create: 1 } : {}) })),
];
/** Append-only records (events, revisions): created by the app services, never edited or deleted from a form. */
const appendOnly = () => [
  { role: "System Manager", read: 1, report: 1, export: 1, print: 1 },
  ...FSM_ROLES.map((role) => ({ role, read: 1, report: 1, print: 1 })),
];
export const FSM_MODULE = "DIGIT FSM + ITM";
export const DOCTYPE_AR: Record<string, string> = {};
const doc = (name: string, ar: string, fields: DocField[], x: Partial<PluginDocType> = {}, write: string[] = []): PluginDocType => {
  DOCTYPE_AR[name] = ar;
  return { name, module: FSM_MODULE, track_changes: 1, fields, permissions: x.istable ? [] : perms(write), ...x } as PluginDocType;
};

export const SYSTEM_TYPES = ["Fire Alarm", "Sprinkler", "Fire Pump", "Extinguishers", "Emergency Lighting", "Kitchen Suppression", "HVAC", "Electrical"];
export const FREQUENCIES = ["Monthly", "Quarterly", "Semi-Annual", "Annual"];
export const RESULT_OUTCOMES = ["Untested", "Pass", "Fail", "Inaccessible", "Not Applicable"];
export const BLOCK_REASONS = ["None", "Access", "Parts", "Customer Hold", "Safety", "Weather"];
export const SKILLS = ["Fire Alarm", "Sprinkler", "Fire Pump", "Extinguishers", "Emergency Lighting", "Kitchen Suppression", "HVAC", "Electrical", "Confined Space", "Work at Height"];

const ALL_FSM_DOCTYPES: PluginDocType[] = [
  // ---------------------------------------------------------------- portfolio (D02–D06)
  doc("FSM Site Contact", "جهة اتصال الموقع", [L("contact", "Contact", "جهة الاتصال", "Contact", LV), S("contact_role", "Contact Role", "دور جهة الاتصال", ["Site Access", "Facility Manager", "Billing", "Emergency"], LV), D("phone", "Phone", "الهاتف", LV), CK("notify", "Receives Notices", "يستلم الإشعارات", LV)], { istable: 1 }),
  doc("FSM Service Site", "موقع خدمة", [
    D("site_name", "Site Name", "اسم الموقع", { ...REQ, ...LV }), D("site_code", "Site Code", "رمز الموقع", LV), L("customer", "Customer", "العميل", "Customer", { ...REQ, ...LVF }), CO(),
    CB(), L("address", "Address", "العنوان", "Address"), D("city", "City", "المدينة", LVF), D("branch", "Branch", "الفرع", { in_standard_filter: 1 }), S("status", "Site Status", "حالة الموقع", ["Active", "Inactive"], LVF),
    N("latitude", "Latitude", "خط العرض", { precision: "6" } as X), N("longitude", "Longitude", "خط الطول", { precision: "6" } as X),
    SB("access_sb", "Access", "الوصول"), TX("access_instructions", "Access Instructions", "تعليمات الوصول"), D("service_window", "Service Window", "نافذة الخدمة"), CB(), CK("requires_escort", "Escort Required", "يتطلب مرافقاً"), CK("requires_permit", "Work Permit Required", "يتطلب تصريح عمل"),
    SB("contacts_sb", "Contacts", "جهات الاتصال"), T("contacts", "Site Contacts", "جهات اتصال الموقع", "FSM Site Contact"),
  ], { autoname: "FSM-SITE-.####", title_field: "site_name", search_fields: "customer,city,site_code" }, ["FSM Dispatcher"]),
  doc("FSM Location Node", "عقدة موقع", [
    L("site", "Site", "الموقع", "FSM Service Site", { ...REQ, ...LVF }), S("node_type", "Node Type", "نوع العقدة", ["Building", "Floor", "Zone", "Room"], LVF),
    D("node_label", "Label", "التسمية", { ...REQ, ...LV }), L("parent_node", "Parent Node", "العقدة الأم", "FSM Location Node", LV), CB(), DT("effective_from", "Effective From", "ساري من"), CO(),
  ], { autoname: "FSM-LOC-.#####", title_field: "node_label" }, ["FSM Dispatcher", "FSM Technician"]),
  doc("FSM Service System", "نظام خدمة", [
    D("system_name", "System Name", "اسم النظام", { ...REQ, ...LV }), L("site", "Site", "الموقع", "FSM Service Site", { ...REQ, ...LVF }), L("location", "Location", "المكان", "FSM Location Node"),
    CB(), S("system_type", "System Type", "نوع النظام", SYSTEM_TYPES, LVF), D("identifier", "Panel / Identifier", "المعرّف"),
    S("operating_status", "Operating Status", "الحالة التشغيلية", ["In Service", "Impaired", "Out of Service"], LVF), CO(),
  ], { autoname: "FSM-SYS-.#####", title_field: "system_name", search_fields: "site,system_type" }, ["FSM Dispatcher"]),
  doc("FSM Device", "جهاز", [
    D("device_label", "Device Label", "تسمية الجهاز", { ...REQ, ...LV }), L("system", "System", "النظام", "FSM Service System", { ...REQ, ...LVF }), L("site", "Site", "الموقع", "FSM Service Site", { ...RO, ...LVF }),
    L("location", "Location", "المكان", "FSM Location Node", LV), CB(), D("device_type", "Device Type", "نوع الجهاز", LV), L("item", "Item", "الصنف", "Item"), D("serial_no", "Serial No", "الرقم التسلسلي", LV), D("barcode", "Barcode / Tag", "الباركود / الوسم"),
    S("lifecycle", "Lifecycle", "دورة الحياة", ["Active", "Removed", "Retired"], LVF), DT("install_date", "Install Date", "تاريخ التركيب"), CO(),
  ], { autoname: "FSM-DEV-.#####", title_field: "device_label", search_fields: "serial_no,barcode,system" }, ["FSM Dispatcher", "FSM Technician"]),
  doc("FSM Asset Change", "تغيير أصل", [
    L("device", "Device", "الجهاز", "FSM Device", { ...REQ, ...LVF }), S("change_type", "Change Type", "نوع التغيير", ["Found in Field", "Moved", "Replaced", "Removed", "Missing"], LVF), DT("effective_date", "Effective Date", "تاريخ السريان", { ...REQ, ...LV }),
    CB(), L("old_location", "Old Location", "المكان السابق", "FSM Location Node"), L("new_location", "New Location", "المكان الجديد", "FSM Location Node"), L("source_run", "Source Run", "تشغيل الفحص المصدر", "FSM Inspection Run"),
    S("status", "Review Status", "حالة المراجعة", ["Proposed", "Approved", "Rejected"], LVF), TX("note", "Note", "ملاحظة"), L("site", "Site", "الموقع", "FSM Service Site", RO), CO(),
  ], { autoname: "FSM-CHG-.#####" }, ["FSM Technician", "FSM Reviewer"]),

  // ---------------------------------------------------------------- workforce (D07–D09)
  doc("FSM Technician Skill", "مهارة الفني", [S("skill", "Skill", "المهارة", SKILLS, { ...REQ, ...LV }), D("certificate_no", "Certificate No", "رقم الشهادة", LV), DT("valid_until", "Valid Until", "صالحة حتى", LV)], { istable: 1 }),
  doc("FSM Technician", "فني الخدمة", [
    L("employee", "Employee", "الموظف", "Employee", { ...REQ, ...LVF }), D("technician_name", "Technician Name", "اسم الفني", { ...REQ, ...LV }), L("user", "User", "المستخدم", "User"),
    CB(), D("crew", "Crew", "الطاقم", LVF), D("territory", "Territory", "المنطقة", LVF), S("status", "Technician Status", "حالة الفني", ["Active", "Inactive"], LVF), N("daily_hours", "Daily Available Hours", "ساعات التوفر اليومية", { default: "8" }), CO(),
    D("phone", "Mobile", "الجوال", { options: "Phone" } as X), L("van_warehouse", "Van (warehouse)", "سيارة الخدمة (المستودع)", "Warehouse"),
    SB("skills_sb", "Skills & certifications", "المهارات والشهادات"), T("skills", "Skills", "المهارات", "FSM Technician Skill"),
  ], { autoname: "FSM-TECH-.###", title_field: "technician_name", search_fields: "employee,crew" }, ["FSM Dispatcher"]),
  doc("FSM Calendar Exception", "استثناء تقويم", [
    L("technician", "Technician", "الفني", "FSM Technician", { ...REQ, ...LVF }), S("exception_type", "Exception Type", "نوع الاستثناء", ["Unavailable", "On-call", "Training", "Leave"], LVF),
    DTT("from_time", "From", "من", { ...REQ, ...LV }), DTT("to_time", "To", "إلى", { ...REQ, ...LV }), CB(), TX("reason", "Reason", "السبب"), S("status", "Approval", "الاعتماد", ["Requested", "Approved", "Revoked"], LVF), CO(),
  ], { autoname: "FSM-CAL-.#####" }, ["FSM Dispatcher", "FSM Technician"]),

  // ---------------------------------------------------------------- agreements & PM (D13–D17, D42)
  doc("FSM Coverage Line", "بند تغطية", [
    L("system", "System", "النظام", "FSM Service System", { ...REQ, ...LV }), S("service_type", "Service Type", "نوع الخدمة", ["Inspection", "Test", "Maintenance"], LV),
    L("template", "Template", "القالب", "FSM Inspection Template", LV), S("frequency", "Frequency", "التكرار", FREQUENCIES, LV), I("window_days", "Window (days)", "نافذة التنفيذ (أيام)", { default: "14", ...LV }),
    CK("included", "Included in Fee", "مشمول بالرسوم", { default: "1" }),
  ], { istable: 1 }),
  doc("FSM Service Agreement", "اتفاقية خدمة", [
    D("agreement_title", "Agreement Title", "عنوان الاتفاقية", { ...REQ, ...LV }), L("customer", "Customer", "العميل", "Customer", { ...REQ, ...LVF }), L("site", "Site", "الموقع", "FSM Service Site", { ...REQ, ...LVF }),
    CO(), CB(), DT("start_date", "Start Date", "تاريخ البداية", REQ), DT("end_date", "End Date", "تاريخ النهاية", { ...REQ, ...LV }), I("revision", "Revision", "المراجعة", { default: "1", ...RO }),
    S("billing_basis", "Billing Basis", "أساس الفوترة", ["Fixed Periodic", "Per Visit", "Time & Materials"]), CUR("annual_value", "Annual Value", "القيمة السنوية"), L("quotation", "Source Quotation", "عرض السعر المصدر", "Quotation"),
    WF(["Draft", "Active", "Suspended", "Expired", "Terminated"]),
    SB("coverage_sb", "Coverage", "التغطية"), T("coverage", "Coverage Lines", "بنود التغطية", "FSM Coverage Line"),
  ], { autoname: "FSM-AGR-.YYYY.-.###", title_field: "agreement_title", search_fields: "customer,site" }, ["FSM Estimator"]),
  doc("FSM Obligation", "التزام خدمة", [
    L("agreement", "Agreement", "الاتفاقية", "FSM Service Agreement", { ...REQ, ...LVF, ...RO }), D("coverage_row", "Coverage Row", "بند التغطية", RO), L("site", "Site", "الموقع", "FSM Service Site", { ...LVF, ...RO }),
    L("system", "System", "النظام", "FSM Service System", { ...LV, ...RO }), L("template", "Template", "القالب", "FSM Inspection Template", RO), S("service_type", "Service Type", "نوع الخدمة", ["Inspection", "Test", "Maintenance"], RO), CB(),
    DT("due_date", "Due Date", "تاريخ الاستحقاق", { ...REQ, ...LV, ...RO }), DT("window_end", "Window End", "نهاية النافذة", { ...LV, ...RO }),
    S("status", "Obligation Status", "حالة الالتزام", ["Due", "Scheduled", "Fulfilled", "Missed", "Waived"], { ...LVF, ...RO }), L("fulfilled_by", "Fulfilled By Job", "منفّذ بأمر العمل", "FSM Job", RO), DT("fulfilled_on", "Fulfilled On", "تاريخ التنفيذ", RO),
    TX("waiver_reason", "Waiver Reason", "سبب الإعفاء", RO), L("generation_run", "Generation Run", "دورة التوليد", "FSM Generation Run", RO), D("idempotency_key", "Generation Key", "مفتاح التوليد", { ...RO, hidden: 1, ...NC }), CO(),
  ], { autoname: "FSM-OBL-.#####", search_fields: "agreement,site,due_date" }),
  doc("FSM Generation Run", "دورة توليد الالتزامات", [
    L("agreement", "Agreement", "الاتفاقية", "FSM Service Agreement", { ...REQ, ...LVF }), I("horizon_months", "Horizon (months)", "الأفق (أشهر)", LV), DTT("run_on", "Run On", "تاريخ التشغيل", LV),
    CB(), I("created_count", "Created", "تم إنشاؤه", LV), I("skipped_count", "Skipped (already existed)", "تم تخطيه (موجود مسبقاً)", LV), S("outcome", "Outcome", "النتيجة", ["Success", "No Change", "Refused"], LVF), TX("message", "Message", "الرسالة"), CO(),
  ], { autoname: "FSM-GEN-.#####", permissions: appendOnly() }),
  doc("FSM Renewal Case", "حالة تجديد", [
    L("agreement", "Agreement", "الاتفاقية", "FSM Service Agreement", { ...REQ, ...LVF }), L("customer", "Customer", "العميل", "Customer", { ...LVF, ...RO }), DT("current_end", "Current End", "النهاية الحالية", { ...LV, ...RO }), DT("proposed_end", "Proposed End", "النهاية المقترحة", LV),
    CB(), CUR("proposed_value", "Proposed Annual Value", "القيمة السنوية المقترحة"), S("status", "Renewal Status", "حالة التجديد", ["Open", "Proposed", "Renewed", "Lost"], LVF), TX("risk_note", "Risk Note", "ملاحظة المخاطر"), CO(),
  ], { autoname: "FSM-REN-.####" }, ["FSM Estimator"]),

  // ---------------------------------------------------------------- operations & dispatch (D18–D20, D39)
  doc("FSM Job Obligation", "التزام أمر العمل", [L("obligation", "Obligation", "الالتزام", "FSM Obligation", { ...REQ, ...LV }), L("system", "System", "النظام", "FSM Service System", LV), S("outcome", "Fulfilment Outcome", "نتيجة التنفيذ", ["Pending", "Fulfilled", "Partial", "Not Fulfilled"], LV)], { istable: 1 }),
  doc("FSM Job", "أمر عمل خدمة", [
    D("job_title", "Job Title", "عنوان أمر العمل", { ...REQ, ...LV }), L("customer", "Customer", "العميل", "Customer", { ...REQ, ...LVF }), L("site", "Site", "الموقع", "FSM Service Site", { ...REQ, ...LVF }),
    S("job_type", "Job Type", "نوع أمر العمل", ["PM Inspection", "Corrective", "Repair", "Retest", "Emergency"], LVF), S("priority", "Priority", "الأولوية", ["Normal", "High", "Urgent"], LV), I("planned_days", "Planned Days", "الأيام المخططة", { default: "1" }),
    CB(), L("agreement", "Agreement", "الاتفاقية", "FSM Service Agreement"), L("issue", "Service Request", "طلب الخدمة", "Issue"), L("deficiency", "Source Deficiency", "الملاحظة المصدر", "FSM Deficiency", RO), L("quotation", "Quotation", "عرض السعر", "Quotation", RO),
    WF(["Draft", "Scheduled", "In Progress", "On Hold", "Completed", "Closed", "Cancelled"]), S("hold_reason", "Hold Reason", "سبب الإيقاف", BLOCK_REASONS), DTT("completed_on", "Completed On", "تاريخ الإكمال", RO), CO(),
    SB("scope_sb", "Scope", "النطاق"), TX("scope", "Scope of Work", "نطاق العمل"),
    SB("obl_sb", "Obligations fulfilled", "الالتزامات المنفّذة"), T("obligations", "Obligations", "الالتزامات", "FSM Job Obligation"),
  ], { autoname: "FSM-JOB-.YYYY.-.#####", title_field: "job_title", search_fields: "customer,site,job_type" }, ["FSM Dispatcher"]),
  doc(VISIT_DT, "زيارة خدمة", [
    L("job", "Job", "أمر العمل", "FSM Job", { ...REQ, ...LVF }), L("site", "Site", "الموقع", "FSM Service Site", { ...LVF, ...RO }), L("technician", "Lead Technician", "الفني الرئيسي", "FSM Technician", LVF),
    S("visit_purpose", "Visit Purpose", "غرض الزيارة", ["Planned", "Return Visit", "Emergency"], LV), L("predecessor_visit", "Previous Visit", "الزيارة السابقة", VISIT_DT), S("return_reason", "Return Reason", "سبب العودة", ["", "Parts", "Access", "Rework", "Customer Request", "Planned Continuation"]),
    CB(), DTT("scheduled_start", "Scheduled Start", "بداية الموعد", LV), DTT("scheduled_end", "Scheduled End", "نهاية الموعد"),
    WF(["Unscheduled", "Planned", "Dispatched", "On Site", "Completed", "Cancelled"]), DTT("acknowledged_on", "Acknowledged On", "تاريخ الإقرار", RO), DTT("arrived_on", "Arrived On", "تاريخ الوصول", RO), DTT("completed_on", "Completed On", "تاريخ الإكمال", RO),
    SB("out_sb", "Outcome", "النتيجة"), S("access_outcome", "Access Outcome", "نتيجة الوصول", ["Not Recorded", "Accessed", "Partial Access", "No Access"], LVF), S("block_reason", "Block Reason", "سبب التعطّل", BLOCK_REASONS, { in_standard_filter: 1 }),
    CB(), TX("handover_note", "Handover Note", "ملاحظة التسليم"), TX("cancel_reason", "Cancellation Reason", "سبب الإلغاء"), CO(),
    SB("sign_sb", "Customer sign-off", "توقيع العميل"), D("signed_by", "Signed By", "وقّع باسم"), DTT("signed_on", "Signed On", "تاريخ التوقيع", RO), CB(), F("customer_signature", "Customer Signature", "توقيع العميل", "Signature"),
  ], { autoname: "FSM-VIS-.YYYY.-.#####", search_fields: "job,site,technician" }, ["FSM Dispatcher", "FSM Technician"]),
  doc("FSM Booking", "حجز مورد", [
    L("visit", "Visit", "الزيارة", VISIT_DT, { ...REQ, ...LVF }), L("technician", "Technician", "الفني", "FSM Technician", { ...REQ, ...LVF }), DTT("booking_start", "Start", "البداية", { ...REQ, ...LV }), DTT("booking_end", "End", "النهاية", { ...REQ, ...LV }),
    CB(), S("booking_role", "Booking Role", "دور الحجز", ["Lead", "Assistant"], LV), S("status", "Booking Status", "حالة الحجز", ["Reserved", "Cancelled"], LVF), L("site", "Site", "الموقع", "FSM Service Site", RO), CO(),
  ], { autoname: "FSM-BKG-.#####" }, ["FSM Dispatcher"]),
  doc("FSM Subcontract Assignment", "إسناد لمقاول باطن", [
    L("job", "Job", "أمر العمل", "FSM Job", { ...REQ, ...LVF }), L("supplier", "Supplier", "المورد", "Supplier", { ...REQ, ...LVF }), TX("scope", "Scope", "النطاق", REQ), CB(),
    CUR("agreed_cost", "Agreed Cost", "التكلفة المتفق عليها", LV), S("status", "Assignment Status", "حالة الإسناد", ["Proposed", "Accepted", "Completed", "Disputed"], LVF), L("purchase_order", "Purchase Order", "أمر الشراء", "Purchase Order"), L("site", "Site", "الموقع", "FSM Service Site", RO), CO(),
  ], { autoname: "FSM-SUB-.####" }, ["FSM Dispatcher"]),

  // ---------------------------------------------------------------- ITM (D22–D28, D34, D35)
  doc("FSM Template Check", "بند فحص", [D("check_code", "Code", "الرمز", { ...REQ, ...LV }), D("check_text", "Check", "الفحص", { ...REQ, ...LV }), S("applies_to", "Applies To", "ينطبق على", ["System", "Device"], LV), D("unit", "Unit", "الوحدة"), N("min_value", "Min", "الحد الأدنى"), N("max_value", "Max", "الحد الأقصى"), CK("evidence_required", "Photo Required", "الصورة مطلوبة")], { istable: 1 }),
  doc("FSM Inspection Template", "قالب فحص", [
    D("template_name", "Template Name", "اسم القالب", { ...REQ, ...LV }), S("system_type", "System Type", "نوع النظام", SYSTEM_TYPES, LVF), D("trade_pack", "Trade Pack", "حزمة التخصص", { default: "Fire & Life Safety", ...LV }),
    CB(), I("version", "Version", "الإصدار", { default: "1", ...LV, ...RO }), S("status", "Template Status", "حالة القالب", ["Draft", "Active", "Superseded"], { ...LVF, ...RO }), D("standard_ref", "Standard Reference", "المرجع القياسي"),
    L("supersedes", "Supersedes", "يحل محل", "FSM Inspection Template", RO), DTT("published_on", "Published On", "تاريخ النشر", RO),
    SB("checks_sb", "Checks", "بنود الفحص"), T("checks", "Checks", "بنود الفحص", "FSM Template Check"),
  ], { autoname: "FSM-TPL-.####", title_field: "template_name", search_fields: "system_type,version" }, ["FSM Reviewer"]),
  doc("FSM Inspection Result", "نتيجة فحص", [
    D("check_code", "Code", "الرمز", { ...RO, ...LV }), D("check_text", "Check", "الفحص", { ...RO, ...LV }), L("device", "Device", "الجهاز", "FSM Device", { ...LV, ...RO }),
    S("outcome", "Outcome", "النتيجة", RESULT_OUTCOMES, LV), N("measurement", "Measurement", "القياس"), D("note", "Note", "ملاحظة"), CK("evidence_required", "Photo Required", "الصورة مطلوبة", RO), L("deficiency", "Deficiency", "الملاحظة", "FSM Deficiency", RO),
  ], { istable: 1 }),
  doc("FSM Inspection Run", "تشغيل فحص", [
    L("job", "Job", "أمر العمل", "FSM Job", { ...REQ, ...LVF }), L("visit", "Visit", "الزيارة", VISIT_DT), L("site", "Site", "الموقع", "FSM Service Site", { ...LVF, ...RO }), L("system", "System", "النظام", "FSM Service System", { ...REQ, ...LV }),
    L("retest_for", "Retest For", "إعادة فحص لـ", "FSM Deficiency", RO), CB(), L("template", "Template", "القالب", "FSM Inspection Template", { ...REQ, ...RO }), I("template_version", "Template Version", "إصدار القالب", RO), I("expected_devices", "Expected Devices (snapshot)", "الأجهزة المتوقعة (لقطة)", RO),
    WF(["Draft", "In Progress", "Submitted for Review", "Reviewed", "Published"]), S("technical_result", "Technical Result", "النتيجة الفنية", ["Pending", "Pass", "Fail", "Incomplete"], { ...RO, ...LVF }), CO(),
    SB("rev_sb", "Review", "المراجعة"), DTT("submitted_on", "Submitted On", "تاريخ التقديم", RO), DTT("reviewed_on", "Reviewed On", "تاريخ المراجعة", RO), L("reviewed_by", "Reviewed By", "راجعه", "User", RO), CB(), I("return_count", "Times Returned", "مرات الإعادة", RO), TX("return_reason", "Return Reason", "سبب الإعادة", RO), DTT("published_on", "Published On", "تاريخ النشر", RO),
    SB("res_sb", "Results", "النتائج"), T("results", "Results", "النتائج", "FSM Inspection Result"),
  ], { autoname: "FSM-RUN-.YYYY.-.#####", search_fields: "job,system,site" }, ["FSM Technician", "FSM Reviewer"]),
  doc("FSM Result Event", "حدث نتيجة", [
    L("run", "Run", "تشغيل الفحص", "FSM Inspection Run", { ...REQ, ...LVF }), D("result_row", "Result Row", "صف النتيجة", LV), D("check_code", "Code", "الرمز", LV), L("device", "Device", "الجهاز", "FSM Device", LV),
    CB(), S("previous_outcome", "Previous Outcome", "النتيجة السابقة", RESULT_OUTCOMES, LV), S("new_outcome", "New Outcome", "النتيجة الجديدة", RESULT_OUTCOMES, LV), N("measurement", "Measurement", "القياس"), D("recorded_by", "Recorded By", "سجّله", LV), DTT("recorded_on", "Recorded On", "تاريخ التسجيل", LV), L("site", "Site", "الموقع", "FSM Service Site", RO), CO(),
  ], { autoname: "FSM-EVT-.######", permissions: appendOnly() }),
  doc("FSM Report Revision", "إصدار تقرير منشور", [
    L("run", "Run", "تشغيل الفحص", "FSM Inspection Run", { ...REQ, ...LVF }), I("revision", "Revision", "المراجعة", LV), L("site", "Site", "الموقع", "FSM Service Site", LVF), L("system", "System", "النظام", "FSM Service System", LV),
    CB(), S("technical_result", "Technical Result", "النتيجة الفنية", ["Pass", "Fail", "Incomplete"], LVF), DTT("published_on", "Published On", "تاريخ النشر", LV), D("published_by", "Published By", "نشره"), S("status", "Revision Status", "حالة الإصدار", ["Current", "Superseded"], LVF),
    SB("cnt_sb", "Counts", "الأعداد"), I("expected", "Expected", "المتوقع"), I("passed", "Passed", "ناجح"), I("failed", "Failed", "راسب"), CB(), I("inaccessible", "Inaccessible", "يتعذر الوصول"), I("not_applicable", "Not Applicable", "لا ينطبق"), I("untested", "Untested", "لم يُفحص"),
    LT("snapshot", "Results Snapshot (JSON)", "لقطة النتائج", RO), CO(),
  ], { autoname: "FSM-REV-.#####", permissions: appendOnly() }),
  doc("FSM Test Instrument", "أداة اختبار", [
    D("instrument_name", "Instrument", "الأداة", { ...REQ, ...LV }), D("serial_no", "Serial No", "الرقم التسلسلي", LV), D("calibration_ref", "Calibration Certificate", "شهادة المعايرة"), CB(),
    DT("calibrated_on", "Calibrated On", "تاريخ المعايرة"), DT("calibration_due", "Calibration Due", "استحقاق المعايرة", LV), L("custodian", "Custodian", "العهدة لدى", "FSM Technician", LVF), CO(),
  ], { autoname: "FSM-INS-.###", title_field: "instrument_name" }, ["FSM Technician"]),

  // ---------------------------------------------------------------- deficiencies & safety (D29–D33)
  doc("FSM Deficiency", "ملاحظة / عيب", [
    D("title", "Finding", "الملاحظة", { ...REQ, ...LV }), L("site", "Site", "الموقع", "FSM Service Site", { ...REQ, ...LVF }), L("system", "System", "النظام", "FSM Service System", LVF), L("device", "Device", "الجهاز", "FSM Device"),
    S("severity", "Severity", "الخطورة", ["Critical", "Major", "Minor"], LVF), DT("opened_on", "Opened On", "تاريخ الفتح", { ...LV, ...RO }),
    CB(), L("source_run", "Source Run", "تشغيل الفحص المصدر", "FSM Inspection Run", RO), D("source_check", "Source Check", "الفحص المصدر", RO),
    WF(["Open", "Quoted", "Approved for Repair", "Retest Pending", "Verified Closed", "Rejected", "Duplicate", "Disputed"]), S("commercial_decision", "Customer Decision", "قرار العميل", ["None", "Quoted", "Accepted", "Declined"], { ...LVF, ...RO }),
    SB("links_sb", "Commercial & repair", "التسعير والإصلاح"), L("quotation", "Quotation", "عرض السعر", "Quotation", RO), L("repair_job", "Repair Job", "أمر الإصلاح", "FSM Job", RO), CB(), DT("closed_on", "Closed On", "تاريخ الإغلاق", RO), L("duplicate_of", "Duplicate Of", "مكررة من", "FSM Deficiency"), I("reopen_count", "Times Reopened", "مرات إعادة الفتح", RO),
    TX("observation", "Observation", "الوصف"), D("source_key", "Source Key", "مفتاح المصدر", { ...RO, hidden: 1, ...NC }), CO(),
  ], { autoname: "FSM-DEF-.YYYY.-.#####", title_field: "title", search_fields: "site,system,severity" }, ["FSM Technician", "FSM Reviewer", "FSM Estimator"]),
  doc("FSM Impairment", "تعطّل نظام", [
    L("system", "System", "النظام", "FSM Service System", { ...REQ, ...LVF }), L("site", "Site", "الموقع", "FSM Service Site", { ...LVF, ...RO }), S("scope", "Impairment Scope", "نطاق التعطّل", ["Full System", "Partial / Zone"], LV),
    DTT("started_on", "Started", "بدأ", { ...REQ, ...LV }), DTT("restored_on", "Restored", "عاد للخدمة", LV), CB(), S("status", "Impairment Status", "حالة التعطّل", ["Active", "Restored"], LVF),
    CK("authority_notified", "Authority / Insurer Notified", "تم إبلاغ الجهة / المؤمِّن"), CK("fire_watch", "Fire Watch in Place", "حراسة حريق قائمة"), L("deficiency", "Deficiency", "الملاحظة", "FSM Deficiency"), TX("note", "Note", "ملاحظة"), CO(),
  ], { autoname: "FSM-IMP-.#####" }, ["FSM Technician", "FSM Reviewer", "FSM Dispatcher"]),
  doc("FSM Retest", "إعادة فحص", [
    L("deficiency", "Deficiency", "الملاحظة", "FSM Deficiency", { ...REQ, ...LVF, ...RO }), L("repair_job", "Repair Job", "أمر الإصلاح", "FSM Job", { ...LV, ...RO }), L("retest_run", "Retest Run", "تشغيل إعادة الفحص", "FSM Inspection Run", RO),
    CB(), S("status", "Retest Status", "حالة إعادة الفحص", ["Required", "Scheduled", "Passed", "Failed"], { ...LVF, ...RO }), DT("due_date", "Due Date", "تاريخ الاستحقاق", LV), L("site", "Site", "الموقع", "FSM Service Site", RO), CO(),
  ], { autoname: "FSM-RT-.#####" }, ["FSM Reviewer", "FSM Technician"]),

  // ---------------------------------------------------------------- commercial control & integration (D40, D41)
  doc("FSM Charge Proposal", "مقترح تحصيل", [
    L("job", "Job", "أمر العمل", "FSM Job", { ...REQ, ...LVF, ...RO }), L("customer", "Customer", "العميل", "Customer", { ...LVF, ...RO }), S("coverage_decision", "Coverage Decision", "قرار التغطية", ["Covered", "Chargeable", "Partly Covered"], LV),
    CUR("amount", "Proposed Amount", "المبلغ المقترح", LV), TX("basis", "Basis", "الأساس", RO), CB(),
    S("status", "Handoff Status", "حالة التسليم", ["Proposed", "Approved", "Handed Off", "Error"], { ...LVF, ...RO }), L("sales_invoice", "Sales Invoice", "فاتورة المبيعات", "Sales Invoice", RO), TX("error", "Error", "الخطأ", RO),
    L("site", "Site", "الموقع", "FSM Service Site", RO), D("idempotency_key", "Idempotency Key", "مفتاح عدم التكرار", { ...RO, hidden: 1, ...NC }), CO(),
  ], { autoname: "FSM-CP-.#####" }, ["FSM Estimator"]),
  doc("FSM Integration Exception", "استثناء تكامل", [
    S("source", "Source", "المصدر", ["Finance Handoff", "Import", "Offline Sync", "Notification", "Generation"], LVF), D("reference_doctype", "Reference Type", "نوع المرجع", LV), D("reference_name", "Reference", "المرجع", LV),
    CB(), S("status", "Exception Status", "حالة الاستثناء", ["Open", "Retrying", "Resolved"], LVF), I("attempts", "Attempts", "المحاولات", LV), DTT("last_attempt", "Last Attempt", "آخر محاولة"),
    TX("error", "Error", "الخطأ"), TX("resolution", "Resolution", "المعالجة"), D("idempotency_key", "Idempotency Key", "مفتاح عدم التكرار", { ...RO, hidden: 1, ...NC }), CO(),
  ], { autoname: "FSM-EXC-.#####" }, ["FSM Dispatcher", "FSM Estimator"]),
  // ---------------------------------------------------------------- technician device queue and customer portal (owner round 2026-11-17 F4-06)
  doc("FSM Offline Action", "إجراء دون اتصال", [
    L("technician", "Technician", "الفني", "FSM Technician", { ...REQ, ...LVF }), D("device_id", "Device", "جهاز الفني", LV), S("action", "Action", "الإجراء", ["Check-in", "Result", "Photo", "Signature", "Time", "Parts"], LVF),
    D("reference_doctype", "Reference Type", "نوع المرجع"), D("reference_name", "Reference", "المرجع", LV), CB(), DTT("captured_on", "Captured On", "وقت الالتقاط", { ...LV, ...RO }), DTT("synced_on", "Synced On", "وقت المزامنة", RO),
    S("sync_state", "Sync State", "حالة المزامنة", ["Pending", "Synced", "Conflict", "Discarded"], { ...LVF, ...RO }), TX("conflict_note", "Conflict", "التعارض", RO), LT("payload", "Payload (JSON)", "البيانات", RO), L("site", "Site", "الموقع", "FSM Service Site", RO), CO(),
  ], { autoname: "FSM-OFF-.#####" }, ["FSM Technician", "FSM Dispatcher"]),
  doc("FSM Portal Grant", "منحة بوابة العميل", [
    L("customer", "Customer", "العميل", "Customer", { ...REQ, ...LVF }), L("contact", "Contact", "جهة الاتصال", "Contact", { ...REQ, ...LV }), L("site", "Site", "الموقع", "FSM Service Site", { ...REQ, ...LVF }),
    CB(), CK("access_reports", "Published reports", "التقارير المنشورة", { default: "1" }), CK("access_findings", "Findings & impairments", "الملاحظات والتعطلات", { default: "1" }), CK("access_requests", "Raise service requests", "رفع طلبات الخدمة"),
    S("status", "Grant Status", "حالة المنحة", ["Active", "Revoked"], LVF), DT("granted_on", "Granted On", "تاريخ المنح", LV), CO(),
  ], { autoname: "FSM-PG-.####" }, ["FSM Manager"]),
  doc("FSM Settings", "إعدادات الخدمة الميدانية", [
    L("default_company", "Default Company", "الشركة الافتراضية", "Company"), I("generation_horizon_months", "Generation Horizon (months)", "أفق التوليد (أشهر)", { default: "12" }), I("retest_due_days", "Retest Due (days)", "استحقاق إعادة الفحص (أيام)", { default: "14" }),
    CB(), CK("require_review", "Require technical review before publishing", "اشتراط المراجعة الفنية قبل النشر", { default: "1" }), CK("block_expired_certification", "Block dispatch of technicians with expired certification", "منع إرسال الفنيين ذوي الشهادات المنتهية", { default: "1" }),
    S("default_severity", "Default Finding Severity", "خطورة الملاحظة الافتراضية", ["Major", "Critical", "Minor"]),
    CB(), CUR("labour_rate", "Labour Rate per Hour", "سعر ساعة العمل", { default: "250" }), CUR("callout_fee", "Emergency Call-out Fee", "رسوم الاستدعاء الطارئ", { default: "350" }),
  ], { issingle: 1 }),
];

export const FSM_VISIT_SCHEMA = ALL_FSM_DOCTYPES.find(d => d.name === VISIT_DT)!;
export const FSM_DOCTYPES = ALL_FSM_DOCTYPES.filter(d => d.name !== VISIT_DT);
export const FSM_VISIT_PERMISSIONS = FSM_VISIT_SCHEMA.permissions ?? [];

/** Native extensions: controlled links from native documents to FSM records (read-only where the app writes them). */
export const FSM_CUSTOM_FIELDS: CustomField[] = [
  ...FSM_VISIT_SCHEMA.fields.filter(f => f.fieldname !== "company").map(f => ({ ...f, fieldname: VISIT_FIELD_MAP[f.fieldname!] ?? f.fieldname })).map((f, i, fields) => ({ ...f, dt: VISIT_DT, insert_after: i ? fields[i - 1]!.fieldname : "company" } as CustomField)),
  { dt: "Quotation Item", fieldname: "digit_fsm_deficiency", label: "FSM Deficiency", fieldtype: "Link", options: "FSM Deficiency", insert_after: "item_code", read_only: 1, description: "Finding this quoted line repairs (DIGIT FSM bridge)." },
  { dt: "Issue", fieldname: "digit_fsm_site", label: "FSM Service Site", fieldtype: "Link", options: "FSM Service Site", insert_after: "customer", description: "Service site the request concerns (DIGIT FSM intake)." },
  { dt: "Issue", fieldname: "digit_fsm_job", label: "FSM Job", fieldtype: "Link", options: "FSM Job", insert_after: "digit_fsm_site", read_only: 1, description: "Service job created from this request." },
  { dt: "Issue", fieldname: "digit_fsm_system", label: "FSM Service System", fieldtype: "Link", options: "FSM Service System", insert_after: "digit_fsm_job", description: "System the request concerns, so dispatch checks the technician's skill for it." },
  { dt: "Material Request", fieldname: "digit_fsm_job", label: "FSM Job", fieldtype: "Link", options: "FSM Job", insert_after: "customer", description: "Service job the materials are requested for." },
  { dt: "Stock Entry", fieldname: "digit_fsm_job", label: "FSM Job", fieldtype: "Link", options: "FSM Job", insert_after: "project", description: "Service job the stock movement belongs to (issue, van transfer, return)." },
  { dt: "Sales Invoice", fieldname: "digit_fsm_job", label: "FSM Job", fieldtype: "Link", options: "FSM Job", insert_after: "customer", read_only: 1, description: "Service job this draft invoice bills (DIGIT FSM finance hand-off, one invoice per charge)." },
  { dt: "Timesheet", fieldname: "digit_fsm_job", label: "FSM Job", fieldtype: "Link", options: "FSM Job", insert_after: "parent_project", description: "Service job the labour was booked against." },
  { dt: "Timesheet", fieldname: "digit_fsm_visit", label: VISIT_DT, fieldtype: "Link", options: VISIT_DT, insert_after: "digit_fsm_job", read_only: 1, description: "Field visit the technician recorded this time on (one draft per visit)." },
  { dt: "Stock Entry", fieldname: "digit_fsm_visit", label: VISIT_DT, fieldtype: "Link", options: VISIT_DT, insert_after: "digit_fsm_job", read_only: 1, description: "Field visit the parts were used on or returned from (one draft per visit)." },
];
AR["FSM Deficiency"] = "ملاحظة الخدمة الميدانية"; AR["FSM Service Site"] = "موقع الخدمة الميدانية"; AR["FSM Job"] = "أمر عمل الخدمة الميدانية";

export const OPTION_AR: Record<string, string> = {
  "Never tested": "لم يُفحص قط", "Job created": "إنشاء أمر عمل", "Job completed": "إكمال أمر عمل", "Visit completed": "إكمال زيارة", "Retest reviewed": "مراجعة إعادة الفحص", "Inspection reviewed": "مراجعة الفحص", "Finding opened": "فتح ملاحظة", "Finding closed": "إغلاق ملاحظة", "Report published": "نشر تقرير", Visit: "زيارة", Obligation: "التزام",
  Discarded: "مستبعد",
  Active: "نشط", Inactive: "غير نشط", Draft: "مسودة", Suspended: "موقوف", Expired: "منتهٍ", Terminated: "منهى", Due: "مستحق", Scheduled: "مجدول", Fulfilled: "منفّذ", Missed: "فائت", Waived: "معفى",
  "In Progress": "قيد التنفيذ", "On Hold": "موقوف مؤقتاً", Completed: "مكتمل", Closed: "مغلق", Cancelled: "ملغى", Unscheduled: "غير مجدول", Planned: "مخطط", Dispatched: "مُرسل", "On Site": "في الموقع",
  "Not Recorded": "غير مسجل", Accessed: "تم الوصول", "Partial Access": "وصول جزئي", "No Access": "تعذر الوصول", "Submitted for Review": "مقدّم للمراجعة", Reviewed: "تمت المراجعة", Published: "منشور",
  Pending: "معلّق", Pass: "ناجح", Fail: "راسب", Incomplete: "غير مكتمل", Untested: "لم يُفحص", Inaccessible: "يتعذر الوصول", "Not Applicable": "لا ينطبق", Open: "مفتوح", Quoted: "مُسعّر",
  "Approved for Repair": "معتمد للإصلاح", "Retest Pending": "بانتظار إعادة الفحص", "Verified Closed": "مغلق بعد التحقق", Rejected: "مرفوض", Duplicate: "مكررة", Disputed: "متنازع عليها", None: "لا يوجد", Accepted: "مقبول", Declined: "مرفوض من العميل",
  Required: "مطلوب", Passed: "ناجح", Failed: "راسب", Proposed: "مقترح", Approved: "معتمد", "Handed Off": "تم التسليم", Error: "خطأ", Retrying: "إعادة المحاولة", Resolved: "تمت المعالجة",
  Critical: "حرجة", Major: "رئيسية", Minor: "ثانوية", Normal: "عادية", High: "عالية", Urgent: "عاجلة", "PM Inspection": "فحص صيانة دورية", Corrective: "تصحيحي", Repair: "إصلاح", Retest: "إعادة فحص", Emergency: "طارئ",
  Monthly: "شهري", Quarterly: "ربع سنوي", "Semi-Annual": "نصف سنوي", Annual: "سنوي", Inspection: "فحص", Test: "اختبار", Maintenance: "صيانة", "In Service": "في الخدمة", Impaired: "متعطل جزئياً", "Out of Service": "خارج الخدمة",
  Removed: "مُزال", Retired: "خارج الخدمة نهائياً", Building: "مبنى", Floor: "طابق", Zone: "منطقة", Room: "غرفة", System: "نظام", Device: "جهاز", Lead: "رئيسي", Assistant: "مساعد",
  "Site Access": "الوصول للموقع", "Facility Manager": "مدير المرفق", Billing: "الفوترة", Covered: "مغطى", Chargeable: "قابل للتحصيل", "Partly Covered": "مغطى جزئياً",
  "Fixed Periodic": "دوري ثابت", "Per Visit": "لكل زيارة", "Time & Materials": "وقت ومواد", "Finance Handoff": "تسليم مالي", Import: "استيراد", "Offline Sync": "مزامنة دون اتصال", Notification: "إشعار", Generation: "توليد",
  "Fire Alarm": "إنذار الحريق", Sprinkler: "الرشاشات", "Fire Pump": "مضخة الحريق", Extinguishers: "الطفايات", "Emergency Lighting": "إنارة الطوارئ", "Kitchen Suppression": "إطفاء المطابخ", HVAC: "التكييف", Electrical: "الكهرباء",
  "Confined Space": "الأماكن المحصورة", "Work at Height": "العمل على ارتفاع", Superseded: "مستبدل", Current: "حالي", Success: "نجاح", "No Change": "بدون تغيير", Refused: "مرفوض",
  "Found in Field": "مكتشف في الموقع", Moved: "منقول", Replaced: "مستبدل", Missing: "مفقود", Unavailable: "غير متاح", "On-call": "مناوبة", Training: "تدريب", Leave: "إجازة", Requested: "مطلوب", Revoked: "ملغى",
  Synced: "تمت المزامنة", Conflict: "تعارض", "Check-in": "تسجيل وصول", Photo: "صورة", Signature: "توقيع", Time: "وقت",
  Reserved: "محجوز", "Return Visit": "زيارة عودة", Parts: "قطع غيار", Access: "الوصول", "Customer Hold": "إيقاف من العميل", Safety: "السلامة", Weather: "الطقس", Rework: "إعادة عمل", "Customer Request": "طلب العميل", "Planned Continuation": "استكمال مخطط",
  "Full System": "النظام بالكامل", "Partial / Zone": "جزئي / منطقة", Restored: "عاد للخدمة", Renewed: "مجدد", Lost: "مفقود",
};
export const FSM_TRANSLATIONS: Record<string, string> = { ...AR, ...OPTION_AR, ...DOCTYPE_AR };
export const FSM_DOCTYPE_NAMES = new Set(FSM_DOCTYPES.map((d) => d.name));
