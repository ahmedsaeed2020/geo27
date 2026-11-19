/**
 * DIGIT Construction — app-owned DocTypes and Custom Fields (plugin digit_construction).
 * Reconciled from the historical Construction source (docs/handoff/RECONCILED_SCHEMAS.json, 45 candidates + 29 proposals)
 * against the current Core: native Project/Task/Customer/Supplier/Item/Employee/Company and all procurement/invoice
 * documents are reused, never cloned. Every label carries an Arabic label (translations are generated from it).
 * Workflow-driven documents use `workflow_state` (Frappe convention) so posting.submit never rewrites their status.
 */
import type { DocField } from "@/lib/catalog";
import type { CustomField, PluginDocType } from "../types";
import R19_SOURCE from "./r19/source.generated.json";
import SPEC_SOURCE from "./spec/schema.generated.json";
import { SPEC_AR } from "./spec/ar";
import { SPEC_ROLES, SPEC_ROLE_AR, SPEC_ROLE_WRITES, SPEC_STATE_AR, specStates } from "./spec/workflowSpec";
import { RULING_FIELDS, RULING_OPTIONS, RULING_AR } from "./spec/rulingFields";
import { R19_AR } from "./r19/translationsAr";

type X = Partial<DocField>;
type ArField = DocField & { label_ar?: string };
const AR: Record<string, string> = {};
const F = (fieldname: string, label: string, ar: string, fieldtype: string, x: X = {}): ArField => { AR[label] = ar; return { fieldname, label, fieldtype, ...x }; };
const D = (fn: string, label: string, ar: string, x: X = {}) => F(fn, label, ar, "Data", x);
const L = (fn: string, label: string, ar: string, options: string, x: X = {}) => F(fn, label, ar, "Link", { options, ...x });
const C = (fn: string, label: string, ar: string, x: X = {}) => F(fn, label, ar, "Currency", { options: "currency", ...x });
const N = (fn: string, label: string, ar: string, x: X = {}) => F(fn, label, ar, "Float", x);
const I = (fn: string, label: string, ar: string, x: X = {}) => F(fn, label, ar, "Int", x);
const P = (fn: string, label: string, ar: string, x: X = {}) => F(fn, label, ar, "Percent", x);
const DT = (fn: string, label: string, ar: string, x: X = {}) => F(fn, label, ar, "Date", x);
const TX = (fn: string, label: string, ar: string, x: X = {}) => F(fn, label, ar, "Small Text", x);
const CK = (fn: string, label: string, ar: string, x: X = {}) => F(fn, label, ar, "Check", x);
const S = (fn: string, label: string, ar: string, options: string[], x: X = {}) => F(fn, label, ar, "Select", { options: options.join("\n"), default: options[0] ?? "", ...x });
const T = (fn: string, label: string, ar: string, options: string) => F(fn, label, ar, "Table", { options });
const SB = (fn: string, label: string, ar: string, x: X = {}) => F(fn, label, ar, "Section Break", x);
const CB = (n: number): DocField => ({ fieldname: `column_break_${n}`, fieldtype: "Column Break" });
const RO = { read_only: 1 } as const;
const LV = { in_list_view: 1 } as const;
const LVF = { in_list_view: 1, in_standard_filter: 1 } as const;
const REQ = { reqd: 1 } as const;
const WF = (states: string[]) => S("workflow_state", "Status", "الحالة", states, { read_only: 1, in_list_view: 1, in_standard_filter: 1, no_copy: 1, allow_on_submit: 1 });

/** Option values used by Select fields → Arabic (stored values stay English, display-only translation). */
export const OPTION_AR: Record<string, string> = {
  "Whole Project": "المشروع كاملاً", Task: "مهمة", Ended: "منتهٍ", Upcoming: "قادم",
  Draft: "مسودة", Submitted: "مُرسل", Approved: "معتمد", Rejected: "مرفوض", Returned: "مُعاد", Superseded: "مُستبدل", Active: "نشط", Suspended: "موقوف",
  Completed: "مكتمل", Closed: "مغلق", Cancelled: "ملغى", "Not Started": "لم يبدأ", "In Progress": "قيد التنفيذ", "On Hold": "معلّق", Reviewed: "تمت المراجعة",
  Pricing: "قيد التسعير", Won: "تمت الترسية", Lost: "لم تتم الترسية", Certified: "معتمد فنياً", "Partly Certified": "معتمد جزئياً", Confirmed: "مؤكدة",
  Invoiced: "مفوترة", "Under Review": "قيد المراجعة", "Under Negotiation": "قيد التفاوض", Agreed: "متفق عليه", Disputed: "متنازع عليه",
  "Pending Approval": "بانتظار الاعتماد", Requested: "مطلوب", Planned: "مخطط", Committed: "ملتزم به", Pending: "معلّق", Done: "منجز", "Not Applicable": "لا ينطبق",
  Open: "مفتوح", Resolved: "تمت التسوية", Withdrawn: "مسحوب", Undefined: "غير محدد", Defined: "محدد", Available: "متاح", Deployed: "مُشغّل",
  "Under Maintenance": "تحت الصيانة", Retired: "خارج الخدمة", Owned: "مملوكة", Rented: "مستأجرة", Inactive: "غير نشط", Verified: "تم التحقق",
  Present: "حاضر", Absent: "غائب", "Half Day": "نصف يوم", "On Leave": "في إجازة", Material: "مواد", Labour: "عمالة", Equipment: "معدات", Subcontract: "مقاولو باطن",
  Overhead: "مصاريف عامة", Contingency: "احتياطي", Contract: "العقد", Variation: "أمر تغييري", "Client Variation": "أمر تغييري للعميل",
  "Internal Scope Change": "تغيير نطاق داخلي", "Client Instruction": "تعليمات العميل", "Design Change": "تغيير تصميم", "Site Condition": "ظروف الموقع",
  "Value Engineering": "هندسة القيمة", Partial: "جزئي", Final: "نهائي", Addition: "إضافة", Deduction: "خصم", Remeasurement: "إعادة قياس",
  Technical: "فني", Commercial: "تجاري", Financial: "مالي", Inflow: "تدفق داخل", Outflow: "تدفق خارج", "Client Collection": "تحصيل من العميل",
  "Subcontractor Payment": "دفعة مقاول باطن", "Supplier Payment": "دفعة مورّد", Other: "أخرى", "Budget Line": "بند الموازنة", Category: "الفئة", "WBS Node": "عقدة WBS",
  "Original Budget": "الموازنة الأصلية", "Revised Budget": "الموازنة المعدلة", Actual: "الفعلي", ETC: "التكلفة المتبقية المتوقعة", EAC: "التكلفة النهائية المتوقعة",
  Variance: "الانحراف", "Percent Spent": "نسبة الصرف", "Budget Remaining": "متبقي الموازنة", "Committed + Uncommitted": "الملتزم + غير الملتزم", "Manual ETC": "تقدير يدوي", "Qty × Rate": "الكمية × السعر", "Average Performance": "متوسط الأداء", "Percent Complete": "نسبة الإنجاز", "Burn Rate": "معدل الصرف",
  High: "عالية", Medium: "متوسطة", Low: "منخفضة", Phase: "مرحلة", "Work Package": "حزمة عمل", "Cost Code": "رمز تكلفة", Clear: "صافٍ", Hot: "حار", Windy: "رياح",
  Dusty: "غبار", Rain: "أمطار", Building: "مبانٍ", Infrastructure: "بنية تحتية", "Fit-out": "تشطيبات داخلية", MEP: "كهروميكانيك", Civil: "مدني", Structural: "إنشائي",
  Finishing: "تشطيبات", Landscaping: "تنسيق مواقع", Steel: "حديد", Unclassified: "غير مصنف", "1st": "الأولى", "2nd": "الثانية", "3rd": "الثالثة", "4th": "الرابعة", "5th": "الخامسة",
  Excavator: "حفّار", Crane: "رافعة", Loader: "لودر", Truck: "شاحنة", "Concrete Pump": "مضخة خرسانة", Generator: "مولد", Compactor: "مدحلة", Foreman: "مراقب عمال",
  Skilled: "عامل ماهر", Helper: "مساعد", Operator: "مشغل", Fuel: "وقود", Transport: "نقل", Consumables: "مستهلكات", "Site Services": "خدمات الموقع", Meals: "إعاشة",
  Permits: "تصاريح", "Not Determined": "غير محدد", Inclusive: "شامل الضريبة", Exempt: "معفى", Client: "العميل", Contractor: "المقاول", Subcontractor: "مقاول الباطن",
  Supplier: "المورّد", Consultant: "الاستشاري", "Force Majeure": "قوة قاهرة", "Lump Sum": "مقطوعية", "Re-measurement": "إعادة قياس", "Cost Plus": "التكلفة زائد",
  "Design & Build": "تصميم وتنفيذ", "Project Manager": "مدير المشروع", QS: "مهندس الكميات", "Site Engineer": "مهندس الموقع", Procurement: "المشتريات",
  Commitment: "التزام", "Unmapped Cost Code": "رمز تكلفة غير محدد", "Cost Code Not in Budget": "رمز تكلفة خارج الموازنة", "Possible Double Count": "احتمال احتساب مزدوج",
  "Billed Amount Mismatch": "عدم تطابق المفوتر", "Bill Not Invoiced": "مستخلص غير مفوتر", "Expense Not Posted": "مصروف غير مرحّل", "Allocation Source Changed": "تغيّر مصدر التخصيص",
  "Allocation Source Missing": "مصدر التخصيص غير موجود", "Accepted as Is": "مقبول كما هو", "Correction Requested": "طُلب التصحيح",
  Issued: "مُصدرة", Void: "مُبطلة", Bilingual: "ثنائي اللغة", "Draft copy": "نسخة مسودة",
  Personal: "شخصي", Archived: "مؤرشف", User: "مستخدم", Role: "دور", Company: "شركة", Metric: "مؤشر", Chart: "مخطط",
  Accountant: "المحاسب", Planner: "المخطط", Safety: "السلامة", FS: "نهاية-بداية", SS: "بداية-بداية", FF: "نهاية-نهاية", SF: "بداية-نهاية",
};

const SYS = "System Manager";
const R = { DIR: "Digit Director", PM: "Digit Project Manager", QS: "Digit QS", EST: "Digit Estimator", PROC: "Digit Procurement Officer", SE: "Digit Site Engineer", ACC: "Digit Accountant", SK: "Digit Store Keeper" };
/** Roles of the app before the R19 source merge (scripts/construction-r19-current.ts compares against these). */
export const CONSTRUCTION_BASE_ROLES = Object.values(R);
/** Every role of the app: the base roles plus roles the supplied source snapshot adds (R19: Digit Construction Viewer). */
export const CONSTRUCTION_PRE_SPEC_ROLES = [...CONSTRUCTION_BASE_ROLES, ...(R19_SOURCE.roles as string[]).filter((r) => !CONSTRUCTION_BASE_ROLES.includes(r))];
/** + the roles the owner test list's workflows name (spec/workflowSpec.ts: Quality Engineer, Document Controller). */
export const CONSTRUCTION_ROLES = [...CONSTRUCTION_PRE_SPEC_ROLES, ...Object.values(SPEC_ROLES).filter((r) => !CONSTRUCTION_PRE_SPEC_ROLES.includes(r))];
type Perm = PluginDocType["permissions"][number];
const full = (role: string, sub = false): Perm => ({ role, read: 1, write: 1, create: 1, delete: 1, report: 1, export: 1, print: 1, email: 1, share: 1, ...(sub ? { submit: 1, cancel: 1 } : {}) });
const reader = (role: string): Perm => ({ role, read: 1, report: 1, print: 1, export: 1 });
/** System Manager + Director full; `writers` create/edit (and submit when submittable); everyone else in the app reads. */
const perms = (writers: string[], sub = false): Perm[] => {
  const w = [...new Set([SYS, R.DIR, ...writers])];
  return [...w.map((r) => full(r, sub)), ...CONSTRUCTION_ROLES.filter((r) => !w.includes(r)).map(reader)];
};
const MOD = "Digit Construction";
const doc = (name: string, x: Omit<PluginDocType, "name" | "permissions" | "fields"> & { fields: ArField[]; writers?: string[]; permissions?: Perm[] }): PluginDocType => {
  const { writers, fields, permissions, ...rest } = x;
  return { name, module: MOD, track_changes: 1, ...rest, fields, permissions: permissions ?? (rest.istable ? [] : perms(writers ?? [], !!rest.is_submittable)) };
};
const child = (name: string, fields: ArField[]) => doc(name, { istable: 1, fields });

// ------------------------------------------------------------------ Projects & execution (PRJ)
const execution: PluginDocType[] = [
  child("Digit Project Team Member", [L("employee", "Employee", "الموظف", "Employee", { ...REQ, ...LV }), S("project_role", "Project Role", "الدور في المشروع", ["Project Manager", "QS", "Site Engineer", "Foreman", "Procurement", "Accountant", "Planner", "Safety"], LV), L("user", "User", "المستخدم", "User", LV), DT("from_date", "From Date", "من تاريخ", { ...LV, description: "Effective from; blank = from the project start" }), DT("to_date", "To Date", "إلى تاريخ", { description: "Effective to; blank = open-ended. End an assignment instead of deleting it" }),
    // PRJ-TEAM-EXT (DOC-PROJECT-TEAM-ASSIGNMENT): responsibility scope inside the same project; membership never grants permissions or assigns tasks
    S("responsibility", "Responsibility Scope", "نطاق المسؤولية", ["Whole Project", "Work Package", "Task"]), L("work_package", "Work Package", "حزمة العمل", "Digit Work Package", { depends_on: "eval:doc.responsibility=='Work Package'", mandatory_depends_on: "eval:doc.responsibility=='Work Package'" }),
    L("task", "Task", "المهمة", "Task", { depends_on: "eval:doc.responsibility=='Task'", mandatory_depends_on: "eval:doc.responsibility=='Task'" }), CK("is_primary", "Primary for Role", "أساسي لهذا الدور"), TX("notes", "Notes", "ملاحظات", { description: "Project responsibility notes only — not an HR record" })]),
  doc("Digit Work Package", { autoname: "WP-.####", title_field: "work_package_name", search_fields: "code,work_package_name,project", writers: [R.PM, R.SE], fields: [
    L("project", "Project", "المشروع", "Project", { ...REQ, ...LVF }), D("code", "Code", "الرمز", { ...REQ, ...LV }), D("work_package_name", "Work Package Name", "اسم حزمة العمل", { ...REQ, ...LV }),
    L("company", "Company", "الشركة", "Company", { fetch_from: "project.company" }), CB(1),
    S("status", "Status", "الحالة", ["Not Started", "In Progress", "Completed", "On Hold"], LVF), P("progress", "Progress", "نسبة الإنجاز", { ...LV, read_only: 1, description: "Mean progress of the linked native Tasks" }),
    DT("start_date", "Start Date", "تاريخ البدء"), DT("end_date", "End Date", "تاريخ الانتهاء"), C("budget", "Planned Budget", "الموازنة المخططة"), D("currency", "Currency", "العملة", { default: "SAR", hidden: 1 }),
    SB("sb_desc", "Description", "الوصف"), TX("description", "Description", "الوصف")] }),
  child("Digit Stage Planning Task", [L("task", "Task", "المهمة", "Task", { ...REQ, ...LV }), DT("planned_start", "Planned Start", "البداية المخططة", LV), DT("planned_end", "Planned End", "النهاية المخططة", LV), N("planned_qty", "Planned Qty", "الكمية المخططة", LV), L("qty_unit", "Unit", "الوحدة", "UOM")]),
  child("Digit Stage Delay Reason", [D("reason", "Reason", "السبب", { ...REQ, ...LV }), S("responsible_party", "Responsible Party", "الجهة المسؤولة", ["Client", "Contractor", "Subcontractor", "Supplier", "Consultant", "Force Majeure"], LV), N("days_delayed", "Days Delayed", "أيام التأخير", LV), DT("logged_on", "Logged On", "تاريخ التسجيل"), TX("note", "Note", "ملاحظة")]),
  doc("Digit Stage Planning", { autoname: "STG-.####", title_field: "stage_name", is_submittable: 1, writers: [R.PM, R.SE], fields: [
    D("stage_name", "Stage Name", "اسم المرحلة", { ...REQ, ...LV }), L("project", "Project", "المشروع", "Project", { ...REQ, ...LVF }), L("work_package", "Work Package", "حزمة العمل", "Digit Work Package", LV),
    L("company", "Company", "الشركة", "Company", { fetch_from: "project.company" }), CB(1), WF(["Draft", "Submitted", "Approved", "Rejected"]),
    DT("planned_start", "Planned Start", "البداية المخططة", { ...REQ, ...LV }), DT("planned_end", "Planned End", "النهاية المخططة", { ...REQ, ...LV }),
    I("planned_task_count", "Planned Tasks", "عدد المهام المخططة", RO), P("mean_progress", "Mean Progress", "متوسط الإنجاز", RO),
    SB("sb_tasks", "Planned Tasks", "المهام المخططة"), T("stage_planning_tasks", "Stage Tasks", "مهام المرحلة", "Digit Stage Planning Task"),
    SB("sb_delay", "Delays", "التأخيرات", { collapsible: 1 }), T("delay_reasons", "Delay Reasons", "أسباب التأخير", "Digit Stage Delay Reason"),
    SB("sb_notes", "Notes", "ملاحظات", { collapsible: 1 }), TX("description", "Description", "الوصف"), TX("reject_reason", "Reject Reason", "سبب الرفض")] }),
  doc("Digit Task Dependency", { autoname: "TDEP-.#####", writers: [R.PM, R.SE], fields: [
    L("project", "Project", "المشروع", "Project", { ...REQ, ...LVF }), L("task", "Task", "المهمة", "Task", { ...REQ, ...LV }), L("predecessor", "Predecessor", "المهمة السابقة", "Task", { ...REQ, ...LV }), CB(1),
    S("dependency_type", "Dependency Type", "نوع الاعتمادية", ["FS", "SS", "FF", "SF"], LV), I("lag_days", "Lag (days)", "الفاصل (أيام)", LV)] }),
  child("Digit WBS Node", [D("node_code", "Node Code", "رمز العقدة", { ...REQ, ...LV }), D("parent_code", "Parent Code", "رمز العقدة الأم", LV), D("title", "Title", "العنوان", { ...REQ, ...LV }), S("node_type", "Node Type", "نوع العقدة", ["Phase", "Work Package", "Cost Code"], LV),
    L("work_package", "Work Package", "حزمة العمل", "Digit Work Package"), L("task", "Task", "المهمة", "Task"), D("boq_item_ref", "BOQ Line", "بند جدول الكميات"), D("budget_line_ref", "Budget Line", "بند الموازنة")]),
  doc("Digit WBS Version", { autoname: "WBS-.####", is_submittable: 1, writers: [R.PM], fields: [
    L("project", "Project", "المشروع", "Project", { ...REQ, ...LVF }), I("version", "Version", "الإصدار", { ...REQ, ...LV }), L("base_version", "Base Version", "الإصدار الأساسي", "Digit WBS Version"), CB(1),
    WF(["Draft", "Approved", "Superseded"]), D("approved_by", "Approved By", "اعتمد بواسطة", RO), DT("approved_on", "Approved On", "تاريخ الاعتماد", RO),
    SB("sb_nodes", "WBS Nodes", "عقد هيكل تجزئة العمل"), T("nodes", "Nodes", "العقد", "Digit WBS Node"), TX("notes", "Notes", "ملاحظات")] }),
  doc("Digit Progress Update", { autoname: "PRG-.YYYY.-.####", is_submittable: 1, writers: [R.SE, R.PM], fields: [
    L("project", "Project", "المشروع", "Project", { ...REQ, ...LVF }), DT("update_date", "Update Date", "تاريخ التحديث", { ...REQ, ...LV }), L("task", "Task", "المهمة", "Task", LV), L("work_package", "Work Package", "حزمة العمل", "Digit Work Package"), CB(1),
    WF(["Draft", "Submitted", "Reviewed", "Returned"]), P("progress_pct", "Reported Progress", "الإنجاز المُبلغ عنه", { ...REQ, ...LV }), N("qty_done", "Quantity Done", "الكمية المنجزة"), L("uom", "Unit", "الوحدة", "UOM"),
    L("reported_by", "Reported By", "أبلغ بواسطة", "Employee"), SB("sb_n", "Notes", "ملاحظات"), TX("notes", "Notes", "ملاحظات"), TX("review_note", "Review Note", "ملاحظة المراجعة"),
    D("operational_note", "Operational Note", "ملاحظة تشغيلية", { read_only: 1, default: "Operational progress only — never measured, certified or invoiced automatically." })] }),
  child("Digit Site Activity Line", [D("activity", "Activity", "النشاط", { ...REQ, ...LV }), L("task", "Task", "المهمة", "Task", LV), L("crew", "Crew", "الطاقم", "Digit Crew", LV), N("hours", "Hours", "الساعات", LV), N("qty", "Quantity", "الكمية", LV), L("uom", "Unit", "الوحدة", "UOM")]),
  doc("Digit Site Activity Report", { autoname: "SAR-.YYYY.-.####", is_submittable: 1, writers: [R.SE, R.PM], fields: [
    L("project", "Project", "المشروع", "Project", { ...REQ, ...LVF }), DT("report_date", "Report Date", "تاريخ التقرير", { ...REQ, ...LV }), S("weather", "Weather", "الطقس", ["Clear", "Hot", "Windy", "Dusty", "Rain"], LV),
    L("prepared_by", "Prepared By", "أعده", "Employee"), CB(1), S("status", "Status", "الحالة", ["Draft", "Submitted"], { ...LVF, read_only: 1 }),
    I("manpower_count", "Manpower on Site", "العمالة في الموقع", LV), I("equipment_count", "Equipment on Site", "المعدات في الموقع"), I("safety_incidents", "Safety Incidents", "حوادث السلامة"),
    SB("sb_act", "Activities", "الأنشطة"), T("activities", "Activities", "الأنشطة", "Digit Site Activity Line"), SB("sb_iss", "Issues", "المعوقات"), TX("issues", "Issues & Constraints", "المعوقات والقيود")] }),
];

// ------------------------------------------------------------------ Estimating & tenders (ET)
const estimating: PluginDocType[] = [
  child("Digit Construction Rate History", [C("rate", "Rate", "السعر", { ...REQ, ...LV }), DT("effective_from", "Effective From", "ساري من", LV), DT("effective_to", "Effective To", "ساري حتى", LV), L("supplier", "Supplier", "المورّد", "Supplier", LV), L("purchase_order", "Purchase Order", "أمر الشراء", "Purchase Order"), TX("reason", "Reason", "السبب")]),
  doc("Digit Construction Rate", { autoname: "field:rate_code", title_field: "rate_name", search_fields: "rate_name,category", writers: [R.EST, R.PROC], fields: [
    D("rate_code", "Rate Code", "رمز السعر", { ...REQ, ...LV, unique: 1 }), D("rate_name", "Rate Name", "اسم السعر", { ...REQ, ...LV }), S("category", "Category", "الفئة", ["Material", "Labour", "Equipment", "Subcontract", "Overhead"], { ...REQ, ...LVF }),
    L("uom", "Unit", "الوحدة", "UOM", { ...REQ, ...LV }), L("item", "Item", "الصنف", "Item"), CB(1), C("current_rate", "Current Rate", "السعر الحالي", { ...REQ, ...LV }), L("currency", "Currency", "العملة", "Currency", { default: "SAR" }),
    DT("effective_date", "Effective Date", "تاريخ السريان"), DT("valid_until", "Valid Until", "صالح حتى", { ...LV, description: "Warning only: the expired-rate block/override policy (P6) is an owner decision." }),
    D("validity_reference", "Validity Reference", "مرجع الصلاحية"), L("supplier", "Supplier", "المورّد", "Supplier"), CK("disabled", "Disabled", "معطل", { in_standard_filter: 1 }),
    SB("sb_hist", "Rate History", "سجل الأسعار", { collapsible: 1 }), T("rate_history", "Rate History", "سجل الأسعار", "Digit Construction Rate History"), TX("notes", "Notes", "ملاحظات")] }),
  child("Digit Assembly Component", [L("rate", "Rate", "السعر", "Digit Construction Rate", { ...REQ, ...LV }), D("description", "Description", "الوصف", { ...LV, fetch_from: "rate.rate_name" }), L("uom", "Unit", "الوحدة", "UOM", { fetch_from: "rate.uom" }), N("coefficient", "Coefficient", "المعامل", { ...REQ, ...LV }), C("unit_rate", "Unit Rate", "سعر الوحدة", { ...LV, fetch_from: "rate.current_rate" }), C("amount", "Amount", "المبلغ", { ...LV, ...RO })]),
  doc("Digit Assembly", { autoname: "field:assembly_code", title_field: "title", writers: [R.EST], fields: [
    D("assembly_code", "Assembly Code", "رمز التجميعة", { ...REQ, ...LV, unique: 1 }), D("title", "Title", "العنوان", { ...REQ, ...LV }), L("uom", "Unit", "الوحدة", "UOM", { ...REQ, ...LV }), CB(1),
    S("category", "Category", "الفئة", ["Material", "Labour", "Equipment", "Subcontract", "Overhead"], LVF), C("unit_cost", "Unit Cost", "تكلفة الوحدة", { ...LV, ...RO }),
    SB("sb_c", "Components", "المكونات"), T("components", "Components", "المكونات", "Digit Assembly Component"), TX("description", "Description", "الوصف")] }),
  child("Digit Estimate Template Row", [D("group_code", "Group", "المجموعة", LV), D("code", "Code", "الرمز", { ...REQ, ...LV }), D("description", "Description", "الوصف", { ...REQ, ...LV }), L("uom", "Unit", "الوحدة", "UOM", LV), L("assembly", "Assembly", "التجميعة", "Digit Assembly", LV), N("default_qty", "Default Qty", "الكمية الافتراضية")]),
  doc("Digit Estimate Template", { autoname: "ETPL-.####", title_field: "title", writers: [R.EST], fields: [
    D("title", "Title", "العنوان", { ...REQ, ...LV }), S("scope", "Scope", "النطاق", ["Building", "Infrastructure", "Fit-out", "MEP"], LVF), CB(1), TX("description", "Description", "الوصف"),
    SB("sb_r", "Template Rows", "بنود القالب"), T("rows", "Rows", "البنود", "Digit Estimate Template Row")] }),
  child("Digit Tender Item", [D("item_key", "Item Key", "مفتاح البند", { hidden: 1, read_only: 1, no_copy: 1 }), D("code", "Code", "الرمز", { ...REQ, ...LV }), D("description", "Description", "الوصف", { ...REQ, ...LV }), L("uom", "Unit", "الوحدة", "UOM", { ...REQ, ...LV }), N("qty", "Quantity", "الكمية", { ...REQ, ...LV }), TX("notes", "Notes", "ملاحظات")]),
  doc("Digit Tender", { autoname: "TND-.YYYY.-.####", title_field: "title", search_fields: "title,customer,status", writers: [R.EST], fields: [
    D("title", "Title", "العنوان", { ...REQ, ...LV }), L("customer", "Customer", "العميل", "Customer", { ...REQ, ...LVF }), L("company", "Company", "الشركة", "Company", REQ), L("project", "Project", "المشروع", "Project", { description: "Set when the tender is won and a project is opened" }),
    D("issuing_body", "Issuing Body", "الجهة الطارحة"), D("tender_reference", "Tender Reference", "مرجع المنافسة"), CB(1),
    S("status", "Status", "الحالة", ["Draft", "Pricing", "Submitted", "Won", "Lost", "Cancelled"], LVF), DT("submission_deadline", "Submission Deadline", "موعد التقديم", { ...REQ, ...LV }),
    L("currency", "Currency", "العملة", "Currency", { default: "SAR" }), P("margin_percent", "Target Margin", "الهامش المستهدف"), L("estimate_template", "Estimate Template", "قالب التقدير", "Digit Estimate Template"),
    SB("sb_bond", "Bonds", "الضمانات", { collapsible: 1 }), C("emd_amount", "Bid Bond Amount", "مبلغ الضمان الابتدائي"), DT("emd_valid_until", "Bid Bond Valid Until", "صلاحية الضمان الابتدائي"), CB(2), P("performance_guarantee_percent", "Performance Guarantee", "ضمان حسن التنفيذ"),
    SB("sb_items", "Tender Items", "بنود المنافسة"), T("items", "Items", "البنود", "Digit Tender Item"),
    SB("sb_res", "Result", "النتيجة"), L("approved_estimate", "Approved Estimate", "التقدير المعتمد", "Digit Estimate Version", RO), L("boq", "BOQ Draft", "مسودة جدول الكميات", "Digit BOQ", RO), CB(3),
    I("items_count", "Items", "عدد البنود", RO), C("est_cost", "Estimated Cost", "التكلفة التقديرية", { ...RO, ...LV }), C("est_selling", "Bid Value (before tax)", "قيمة العرض (قبل الضريبة)", { ...RO, ...LV }), TX("notes", "Notes", "ملاحظات")] }),
  child("Digit Estimate Line", [D("line_key", "Line Key", "مفتاح البند", { ...REQ, read_only: 1, no_copy: 0 }), D("tender_item", "Tender Item", "بند المنافسة", { read_only: 1 }), D("code", "Code", "الرمز", LV), D("description", "Description", "الوصف", { ...REQ, ...LV }), L("uom", "Unit", "الوحدة", "UOM", LV),
    N("qty", "Quantity", "الكمية", { ...REQ, ...LV }), L("assembly", "Assembly", "التجميعة", "Digit Assembly"), C("cost_rate", "Cost Rate", "سعر التكلفة", { ...REQ, ...LV }), C("selling_rate", "Selling Rate", "سعر البيع", LV),
    C("cost_amount", "Cost Amount", "مبلغ التكلفة", RO), C("selling_amount", "Selling Amount", "مبلغ البيع", { ...RO, ...LV }), TX("change_reason", "Change Reason", "سبب التغيير")]),
  doc("Digit Estimate Version", { autoname: "EST-.YYYY.-.####", is_submittable: 1, search_fields: "tender,version", writers: [R.EST], fields: [
    L("tender", "Tender", "المنافسة", "Digit Tender", { ...REQ, ...LVF }), I("version", "Version", "الإصدار", { ...REQ, ...LV }), L("base_version", "Base Version", "الإصدار الأساسي", "Digit Estimate Version"), L("project", "Project", "المشروع", "Project"), L("company", "Company", "الشركة", "Company", { fetch_from: "tender.company" }), CB(1),
    WF(["Draft", "Submitted", "Approved", "Returned", "Superseded"]), L("currency", "Currency", "العملة", "Currency", { default: "SAR" }), DT("submitted_on", "Submitted On", "تاريخ الإرسال", RO), D("approved_by", "Approved By", "اعتمد بواسطة", RO), DT("approved_on", "Approved On", "تاريخ الاعتماد", RO),
    TX("revision_reason", "Revision Reason", "سبب المراجعة"), TX("return_reason", "Return Reason", "سبب الإعادة"),
    SB("sb_lines", "Estimate Lines", "بنود التقدير"), T("lines", "Lines", "البنود", "Digit Estimate Line"),
    SB("sb_tot", "Totals", "الإجماليات"), C("total_cost", "Total Cost", "إجمالي التكلفة", { ...RO, ...LV }), C("total_selling", "Total Selling", "إجمالي البيع", { ...RO, ...LV }), CB(2), C("margin_amount", "Margin", "الهامش", RO), P("margin_pct", "Margin %", "نسبة الهامش", RO)] }),
  child("Digit BOQ Group", [D("group_code", "Group Code", "رمز المجموعة", { ...REQ, ...LV }), D("description", "Description", "الوصف", { ...REQ, ...LV })]),
  child("Digit BOQ Item", [D("line_key", "Line Key", "مفتاح البند", { ...REQ, read_only: 1 }), D("group_code", "Group", "المجموعة", LV), D("code", "Code", "الرمز", { ...REQ, ...LV }), D("description", "Description", "الوصف", { ...REQ, ...LV }), L("uom", "Unit", "الوحدة", "UOM", LV),
    N("qty", "Quantity", "الكمية", { ...REQ, ...LV }), C("rate", "Rate", "السعر", LV), C("amount", "Amount", "المبلغ", { ...RO, ...LV }), D("source_estimate_line", "Source Estimate Line", "بند التقدير المصدر", RO),
    L("work_package", "Work Package", "حزمة العمل", "Digit Work Package"), L("task", "Task", "المهمة", "Task"), D("cost_code", "Cost Code", "رمز التكلفة")]),
  doc("Digit BOQ", { autoname: "BOQ-.YYYY.-.####", title_field: "title", is_submittable: 1, writers: [R.QS, R.EST], fields: [
    D("title", "Title", "العنوان", { ...REQ, ...LV }), L("project", "Project", "المشروع", "Project", { ...LVF }), L("company", "Company", "الشركة", "Company"), L("tender", "Tender", "المنافسة", "Digit Tender", RO), L("estimate_version", "Estimate Version", "إصدار التقدير", "Digit Estimate Version", RO), CB(1),
    WF(["Draft", "Approved", "Superseded"]), I("revision", "Revision", "المراجعة", { default: "0" }), L("base_revision", "Base Revision", "المراجعة الأساسية", "Digit BOQ"), L("currency", "Currency", "العملة", "Currency", { default: "SAR" }), D("approved_by", "Approved By", "اعتمد بواسطة", RO), DT("approved_on", "Approved On", "تاريخ الاعتماد", RO),
    SB("sb_g", "Sections", "الأقسام", { collapsible: 1 }), T("groups", "Groups", "المجموعات", "Digit BOQ Group"), SB("sb_i", "BOQ Items", "بنود جدول الكميات"), T("items", "Items", "البنود", "Digit BOQ Item"),
    C("total_amount", "Total Amount", "المبلغ الإجمالي", { ...RO, ...LV })] }),
];

// ------------------------------------------------------------------ Client contracts & claims (CON)
const commercial: PluginDocType[] = [
  child("Digit Contract SOV Line", [D("line_key", "Line Key", "مفتاح البند", { ...REQ, read_only: 1 }), D("boq_item", "BOQ Line", "بند جدول الكميات", RO), D("description", "Description", "الوصف", { ...REQ, ...LV }), L("uom", "Unit", "الوحدة", "UOM", LV), N("qty", "Quantity", "الكمية", { ...REQ, ...LV }),
    C("rate", "Rate", "السعر", { ...REQ, ...LV }), C("amount", "Amount", "المبلغ", { ...RO, ...LV }), S("origin", "Origin", "المصدر", ["Contract", "Variation"], { read_only: 1 }), L("variation", "Variation", "الأمر التغييري", "Digit Client Variation", RO)]),
  child("Digit Contract Terms Revision", [S("term", "Term", "البند", ["advance_recovery_pct", "retention_pct", "retention_cap_pct", "payment_days"], { ...REQ, ...LV }), D("from_value", "From", "من", { ...LV, read_only: 1 }), D("to_value", "To", "إلى", { ...REQ, ...LV }),
    S("status", "Status", "الحالة", ["Requested", "Approved", "Rejected"], { ...LV, read_only: 1 }), D("requested_by", "Requested By", "طلب بواسطة", RO), D("decided_by", "Decided By", "قرر بواسطة", RO), DT("decided_on", "Decided On", "تاريخ القرار", RO), TX("reason", "Reason", "السبب")]),
  doc("Digit Client Contract", { autoname: "CC-.YYYY.-.####", title_field: "title", search_fields: "title,customer,project", writers: [R.QS, R.PM], fields: [
    D("title", "Title", "العنوان", { ...REQ, ...LV }), L("project", "Project", "المشروع", "Project", { ...REQ, ...LVF }), L("customer", "Customer", "العميل", "Customer", { ...REQ, ...LVF, fetch_from: "project.customer" }), L("company", "Company", "الشركة", "Company", { ...REQ, fetch_from: "project.company" }),
    D("reference", "Contract Reference", "مرجع العقد"), L("boq", "Source BOQ", "جدول الكميات المصدر", "Digit BOQ"), CB(1), WF(["Draft", "Active", "Suspended", "Completed", "Closed"]),
    L("currency", "Currency", "العملة", "Currency", { default: "SAR" }), DT("start_date", "Start Date", "تاريخ البدء"), DT("end_date", "End Date", "تاريخ الانتهاء"), I("payment_days", "Payment Days", "مدة السداد (أيام)"),
    L("taxes_and_charges", "Sales Taxes Template", "قالب ضريبة المبيعات", "Sales Taxes and Charges Template", { description: "Invoices use this verified template; certificates never compute VAT (P9)." }),
    SB("sb_terms", "Advance & Retention", "الدفعة المقدمة والمحتجزات"), C("advance_amount", "Advance Amount", "مبلغ الدفعة المقدمة"), P("advance_recovery_pct", "Advance Recovery %", "نسبة استرداد الدفعة المقدمة"), CB(2), P("retention_pct", "Retention %", "نسبة المحتجزات"), P("retention_cap_pct", "Retention Cap %", "سقف المحتجزات"),
    SB("sb_sov", "Schedule of Values", "جدول القيم"), I("sov_version", "SOV Version", "إصدار جدول القيم", RO), T("sov_lines", "SOV Lines", "بنود جدول القيم", "Digit Contract SOV Line"),
    SB("sb_val", "Contract Value", "قيمة العقد"), C("original_value", "Original Value", "القيمة الأصلية", { ...RO, ...LV }), C("approved_variations", "Approved Variations", "الأوامر التغييرية المعتمدة", RO), CB(3), C("revised_value", "Revised Value", "القيمة المعدلة", { ...RO, ...LV }),
    SB("sb_rev", "Terms Revisions", "مراجعات الشروط", { collapsible: 1 }), T("terms_revisions", "Terms Revisions", "مراجعات الشروط", "Digit Contract Terms Revision")] }),
  child("Digit Variation Line", [D("line_key", "Line Key", "مفتاح البند", RO), D("sov_line_key", "Existing SOV Line", "بند جدول القيم الحالي", { ...LV, description: "Leave empty to add a new SOV line" }), D("description", "Description", "الوصف", { ...REQ, ...LV }), L("uom", "Unit", "الوحدة", "UOM", LV),
    N("qty", "Quantity Change", "تغير الكمية", { ...REQ, ...LV }), C("rate", "Rate", "السعر", { ...REQ, ...LV }), C("amount", "Amount", "المبلغ", { ...RO, ...LV })]),
  doc("Digit Client Variation", { autoname: "VO-.YYYY.-.####", title_field: "title", is_submittable: 1, writers: [R.QS, R.PM], fields: [
    D("title", "Title", "العنوان", { ...REQ, ...LV }), L("contract", "Client Contract", "عقد العميل", "Digit Client Contract", { ...REQ, ...LVF }), L("project", "Project", "المشروع", "Project", { fetch_from: "contract.project", ...LVF }), L("customer", "Customer", "العميل", "Customer", { fetch_from: "contract.customer" }),
    S("change_kind", "Change Kind", "نوع التغيير", ["Client Variation", "Internal Scope Change"], { ...REQ, ...LV, description: "Client variations change revenue; internal scope changes never change the contract value." }),
    S("origin", "Origin", "المنشأ", ["Client Instruction", "Design Change", "Site Condition", "Value Engineering"]), CB(1), WF(["Draft", "Submitted", "Approved", "Rejected"]),
    DT("requested_on", "Requested On", "تاريخ الطلب"), DT("approved_on", "Approved On", "تاريخ الاعتماد", RO), D("approved_by", "Approved By", "اعتمد بواسطة", RO), I("time_days", "Time Impact (days)", "الأثر الزمني (أيام)"),
    SB("sb_l", "Variation Lines", "بنود الأمر التغييري"), T("lines", "Lines", "البنود", "Digit Variation Line"), C("amount", "Variation Amount", "مبلغ الأمر التغييري", { ...RO, ...LV }),
    SB("sb_n", "Notes", "ملاحظات", { collapsible: 1 }), TX("cost_effect_note", "Cost Effect Note", "ملاحظة الأثر على التكلفة"), TX("decision_note", "Decision Note", "ملاحظة القرار")] }),
  child("Digit Claim Line", [D("sov_line_key", "SOV Line", "بند جدول القيم", { ...REQ, read_only: 1 }), D("description", "Description", "الوصف", { ...LV, read_only: 1 }), L("uom", "Unit", "الوحدة", "UOM", RO), N("contract_qty", "Contract Qty", "كمية العقد", { ...RO, ...LV }), C("rate", "Rate", "السعر", RO),
    N("previous_qty", "Previous Qty", "الكمية السابقة", { ...RO, ...LV }), N("cumulative_qty", "Cumulative Qty", "الكمية التراكمية", { ...REQ, ...LV }), N("this_period_qty", "This Period Qty", "كمية الفترة", { ...RO, ...LV }), C("amount", "This Period Amount", "مبلغ الفترة", { ...RO, ...LV }),
    D("evidence", "Evidence", "الإثبات"), D("location", "Location", "الموقع")]),
  doc("Digit Client Claim", { autoname: "CLM-.YYYY.-.####", is_submittable: 1, search_fields: "contract,claim_no", writers: [R.QS], fields: [
    L("contract", "Client Contract", "عقد العميل", "Digit Client Contract", { ...REQ, ...LVF }), L("project", "Project", "المشروع", "Project", { fetch_from: "contract.project", ...LVF }), L("customer", "Customer", "العميل", "Customer", { fetch_from: "contract.customer" }), L("company", "Company", "الشركة", "Company", { fetch_from: "contract.company" }),
    I("claim_no", "Claim No.", "رقم المطالبة", { ...RO, ...LV }), CB(1), WF(["Draft", "Submitted", "Certified", "Partly Certified", "Rejected"]), DT("period_start", "Period Start", "بداية الفترة"), DT("period_end", "Period End", "نهاية الفترة", { ...REQ, ...LV }), DT("claim_date", "Claim Date", "تاريخ المطالبة"), D("submission_ref", "Submission Reference", "مرجع التقديم"),
    SB("sb_l", "Claim Lines", "بنود المطالبة"), T("lines", "Lines", "البنود", "Digit Claim Line"),
    SB("sb_t", "Totals", "الإجماليات"), C("gross_to_date", "Gross to Date", "الإجمالي حتى تاريخه", RO), C("previous_claimed", "Previously Claimed", "المطالب به سابقاً", RO), CB(2), C("this_claim", "This Claim", "قيمة المطالبة", { ...RO, ...LV })] }),
  child("Digit Certificate Line", [D("sov_line_key", "SOV Line", "بند جدول القيم", { ...REQ, read_only: 1 }), D("description", "Description", "الوصف", { ...LV, read_only: 1 }), N("claimed_qty", "Claimed Qty", "الكمية المطالب بها", { ...RO, ...LV }), N("accepted_qty", "Accepted Qty", "الكمية المقبولة", { ...REQ, ...LV }),
    N("rejected_qty", "Rejected Qty", "الكمية المرفوضة", LV), N("disputed_qty", "Disputed Qty", "الكمية المتنازع عليها"), C("rate", "Rate", "السعر", RO), C("amount", "Certified Amount", "المبلغ المعتمد", { ...RO, ...LV }), TX("reason", "Reason", "السبب")]),
  doc("Digit Client Certificate", { autoname: "CERT-.YYYY.-.####", is_submittable: 1, search_fields: "claim,contract", writers: [R.QS, R.PM], fields: [
    L("claim", "Client Claim", "مطالبة العميل", "Digit Client Claim", { ...REQ, ...LV }), L("contract", "Client Contract", "عقد العميل", "Digit Client Contract", { fetch_from: "claim.contract", ...LVF }), L("project", "Project", "المشروع", "Project", { fetch_from: "claim.project", ...LVF }),
    L("customer", "Customer", "العميل", "Customer", { fetch_from: "claim.customer" }), L("company", "Company", "الشركة", "Company", { fetch_from: "claim.company" }), CB(1), WF(["Draft", "Confirmed", "Invoiced", "Cancelled"]),
    DT("cert_date", "Certificate Date", "تاريخ الشهادة", { ...REQ, ...LV }), D("reviewer", "Reviewer", "المراجع"), D("external_ref", "Consultant Reference", "مرجع الاستشاري"),
    SB("sb_l", "Certified Lines", "البنود المعتمدة"), T("lines", "Lines", "البنود", "Digit Certificate Line"),
    SB("sb_m", "Certified Value", "القيمة المعتمدة"), C("gross_this", "Gross This Certificate", "إجمالي هذه الشهادة", { ...RO, ...LV }), C("gross_previous", "Gross Previous", "الإجمالي السابق", RO), C("gross_cumulative", "Gross Cumulative", "الإجمالي التراكمي", RO), CB(2),
    C("advance_recovery", "Advance Recovery", "استرداد الدفعة المقدمة", RO), C("retention", "Retention", "المحتجزات", RO), C("other_deductions", "Other Deductions", "خصومات أخرى"), D("other_deductions_note", "Other Deductions Note", "بيان الخصومات الأخرى"), C("net_certified", "Net Certified (before tax)", "صافي المعتمد (قبل الضريبة)", { ...RO, ...LV }),
    SB("sb_inv", "Invoice", "الفاتورة"), L("sales_invoice", "Sales Invoice", "فاتورة المبيعات", "Sales Invoice", { read_only: 1, allow_on_submit: 1 }), F("approved_snapshot", "Approved Snapshot", "لقطة الاعتماد", "Long Text", { read_only: 1, hidden: 1 })] }),
];

// ------------------------------------------------------------------ Subcontracting (SUB)
const subcontract: PluginDocType[] = [
  doc("Digit Subcontractor Profile", { autoname: "SCP-.####", title_field: "supplier", search_fields: "supplier,trade", writers: [R.PROC, R.QS], fields: [
    L("supplier", "Subcontractor", "مقاول الباطن", "Supplier", { ...REQ, ...LV }), S("trade", "Trade", "التخصص", ["Civil", "Structural", "MEP", "Finishing", "Landscaping", "Steel", "Other"], LVF), S("classification_grade", "Classification Grade", "درجة التصنيف", ["Unclassified", "1st", "2nd", "3rd", "4th", "5th"], LV), CB(1),
    WF(["Draft", "Under Review", "Approved", "Suspended", "Rejected"]), D("cr_number", "CR Number", "رقم السجل التجاري"), DT("cr_expiry", "CR Expiry", "انتهاء السجل التجاري", LV), D("vat_number", "VAT Number", "الرقم الضريبي"), DT("insurance_expiry", "Insurance Expiry", "انتهاء التأمين"),
    F("score", "Performance Score", "تقييم الأداء", "Rating", { options: "5" }), D("approved_by", "Approved By", "اعتمد بواسطة", RO), SB("sb_n", "Notes", "ملاحظات", { collapsible: 1 }), TX("notes", "Notes", "ملاحظات")] }),
  child("Digit Work Order Line", [D("line_key", "Line Key", "مفتاح البند", { ...REQ, read_only: 1 }), D("scope", "Scope", "نطاق العمل", { ...REQ, ...LV }), D("cost_code", "Cost Code", "رمز التكلفة", LV), S("cost_category", "Cost Category", "فئة التكلفة", ["", "Material", "Labour", "Equipment", "Subcontract", "Overhead", "Contingency"]), D("boq_item", "BOQ Line", "بند جدول الكميات"), L("uom", "Unit", "الوحدة", "UOM", LV),
    N("qty", "Quantity", "الكمية", { ...REQ, ...LV }), C("rate", "Rate", "السعر", { ...REQ, ...LV }), C("amount", "Amount", "المبلغ", { ...RO, ...LV })]),
  doc("Digit Subcontract Work Order", { autoname: "SWO-.YYYY.-.####", is_submittable: 1, search_fields: "subcontractor,project", writers: [R.PROC, R.PM], fields: [
    L("subcontractor", "Subcontractor", "مقاول الباطن", "Supplier", { ...REQ, ...LVF }), L("project", "Project", "المشروع", "Project", { ...REQ, ...LVF }), L("company", "Company", "الشركة", "Company", { ...REQ, fetch_from: "project.company" }), L("profile", "Subcontractor Profile", "ملف المقاول", "Digit Subcontractor Profile", RO), CB(1),
    WF(["Draft", "Active", "Completed", "Cancelled"]), DT("wo_date", "Work Order Date", "تاريخ أمر العمل", { ...REQ, ...LV }), P("retention_percent", "Retention %", "نسبة المحتجزات"), C("advance_amount", "Advance Amount", "مبلغ الدفعة المقدمة"), P("advance_recovery_pct", "Advance Recovery %", "نسبة استرداد الدفعة المقدمة"),
    D("currency", "Currency", "العملة", { default: "SAR", hidden: 1 }), SB("sb_l", "Schedule of Values", "جدول القيم"), T("lines", "Lines", "البنود", "Digit Work Order Line"), C("total_value", "Total Value", "القيمة الإجمالية", { ...RO, ...LV }),
    SB("sb_t", "Terms", "الشروط", { collapsible: 1 }), TX("terms", "Terms", "الشروط"), L("amended_from", "Amended From", "معدل من", "Digit Subcontract Work Order", { read_only: 1, no_copy: 1 })] }),
  child("Digit Measurement Entry", [D("wo_line_key", "Work Order Line", "بند أمر العمل", { ...REQ, ...LV }), D("description", "Description", "الوصف", LV), D("location", "Location", "الموقع"), N("nos", "Nos", "العدد"), N("length", "Length", "الطول"), N("breadth", "Breadth", "العرض"), N("depth", "Depth", "العمق"),
    N("quantity", "Quantity", "الكمية", { ...LV, description: "Product of the dimensions, or the direct quantity when no dimension is entered" }), CK("is_deduction", "Deduction", "خصم"), N("accepted_qty", "Accepted Qty", "الكمية المقبولة", LV), N("rejected_qty", "Rejected Qty", "الكمية المرفوضة", LV), TX("reject_reason", "Reject Reason", "سبب الرفض")]),
  doc("Digit Measurement Book", { autoname: "MB-.YYYY.-.####", is_submittable: 1, search_fields: "work_order,project", writers: [R.SE, R.QS], fields: [
    L("work_order", "Work Order", "أمر العمل", "Digit Subcontract Work Order", { ...REQ, ...LVF }), L("project", "Project", "المشروع", "Project", { fetch_from: "work_order.project", ...LVF }), L("subcontractor", "Subcontractor", "مقاول الباطن", "Supplier", { fetch_from: "work_order.subcontractor", ...LV }), L("company", "Company", "الشركة", "Company", { fetch_from: "work_order.company" }), CB(1),
    WF(["Draft", "Submitted", "Certified", "Returned"]), DT("mb_date", "Measurement Date", "تاريخ القياس", { ...REQ, ...LV }), L("measured_by", "Measured By", "قاس بواسطة", "Employee"), D("reviewed_by", "Reviewed By", "روجع بواسطة", RO),
    SB("sb_e", "Measurements", "القياسات"), T("entries", "Entries", "القيود", "Digit Measurement Entry"),
    SB("sb_t", "Totals", "الإجماليات"), N("measured_total", "Measured Quantity", "الكمية المقاسة", RO), C("accepted_value", "Accepted Value", "القيمة المقبولة", { ...RO, ...LV }), TX("return_reason", "Return Reason", "سبب الإعادة")] }),
  child("Digit Subcontractor Bill Line", [D("wo_line_key", "Work Order Line", "بند أمر العمل", { ...REQ, read_only: 1 }), D("scope", "Scope", "نطاق العمل", { ...LV, read_only: 1 }), L("uom", "Unit", "الوحدة", "UOM", RO), C("rate", "Rate", "السعر", RO),
    N("previous_qty", "Previous Qty", "الكمية السابقة", { ...RO, ...LV }), N("this_period_qty", "This Period Qty", "كمية الفترة", { ...REQ, ...LV }), N("cumulative_qty", "Cumulative Qty", "الكمية التراكمية", { ...RO, ...LV }), C("amount", "Amount", "المبلغ", { ...RO, ...LV })]),
  doc("Digit Subcontractor Bill", { autoname: "SCB-.YYYY.-.####", is_submittable: 1, search_fields: "work_order,subcontractor", writers: [R.QS, R.PM], fields: [
    L("work_order", "Work Order", "أمر العمل", "Digit Subcontract Work Order", { ...REQ, ...LVF }), L("measurement_book", "Measurement Book", "دفتر القياس", "Digit Measurement Book", LV), L("subcontractor", "Subcontractor", "مقاول الباطن", "Supplier", { fetch_from: "work_order.subcontractor", ...LV }),
    L("project", "Project", "المشروع", "Project", { fetch_from: "work_order.project", ...LVF }), L("company", "Company", "الشركة", "Company", { fetch_from: "work_order.company" }), CB(1), WF(["Draft", "Approved", "Invoiced", "Cancelled"]),
    I("ra_no", "Running Bill No.", "رقم المستخلص الجاري", RO), DT("bill_date", "Bill Date", "تاريخ المستخلص", { ...REQ, ...LV }), D("supplier_invoice_no", "Supplier Invoice No.", "رقم فاتورة المورّد"),
    L("taxes_and_charges", "Purchase Taxes Template", "قالب ضريبة المشتريات", "Purchase Taxes and Charges Template", { description: "The Purchase Invoice applies this verified template; the bill never computes VAT." }),
    SB("sb_l", "Bill Lines", "بنود المستخلص"), T("lines", "Lines", "البنود", "Digit Subcontractor Bill Line"),
    SB("sb_t", "Totals", "الإجماليات"), C("gross_amount", "Gross Amount", "المبلغ الإجمالي", { ...RO, ...LV }), C("retention_amount", "Retention", "المحتجزات", RO), C("advance_recovery", "Advance Recovery", "استرداد الدفعة المقدمة", RO), CB(2),
    C("other_deductions", "Other Deductions", "خصومات أخرى"), C("net_amount", "Net Amount (before tax)", "الصافي (قبل الضريبة)", { ...RO, ...LV }), L("purchase_invoice", "Purchase Invoice", "فاتورة المشتريات", "Purchase Invoice", { read_only: 1, allow_on_submit: 1 })] }),
  // DEC-070: the subcontract retention release mirrors the client release (same approver as P2); posting stays native (Purchase Invoice draft)
  doc("Digit Subcontract Retention Release Request", { autoname: "SRR-.YYYY.-.####", is_submittable: 1, search_fields: "work_order,subcontractor", writers: [R.QS, R.ACC], fields: [
    L("work_order", "Work Order", "أمر العمل", "Digit Subcontract Work Order", { ...REQ, ...LVF }), L("project", "Project", "المشروع", "Project", { fetch_from: "work_order.project", ...LVF }), L("subcontractor", "Subcontractor", "مقاول الباطن", "Supplier", { fetch_from: "work_order.subcontractor", ...LV }),
    L("company", "Company", "الشركة", "Company", { fetch_from: "work_order.company" }), S("release_type", "Release Type", "نوع الإفراج", ["Partial", "Final"], { ...REQ, ...LV }), CB(1), WF(["Draft", "Pending Approval", "Approved", "Rejected"]),
    C("held_amount", "Retention Held", "المحتجزات المحتفظ بها", RO), C("reserved_other", "Reserved by Other Requests", "محجوز لطلبات أخرى", RO), C("eligible_amount", "Eligible to Release", "القابل للإفراج", RO), C("requested_amount", "Requested Amount", "المبلغ المطلوب", { ...REQ, ...LV }),
    D("currency", "Currency", "العملة", { default: "SAR", hidden: 1 }), L("purchase_invoice", "Purchase Invoice", "فاتورة المشتريات", "Purchase Invoice", { read_only: 1, allow_on_submit: 1 }), SB("sb_b", "Basis", "الأساس"), TX("basis", "Basis", "الأساس")] }),
];

// ------------------------------------------------------------------ Budget & cost (CST)
const cost: PluginDocType[] = [
  child("Digit Budget Line", [D("line_key", "Line Key", "مفتاح البند", { ...REQ, read_only: 1 }), D("cost_code", "Cost Code", "رمز التكلفة", { ...REQ, ...LV }), D("description", "Description", "الوصف", { ...REQ, ...LV }),
    S("category", "Category", "الفئة", ["Material", "Labour", "Equipment", "Subcontract", "Overhead", "Contingency"], { ...REQ, ...LV }), C("original_amount", "Original Amount", "المبلغ الأصلي", { ...REQ, ...LV })]),
  // DEC-156: a contract pay item (SOV line) linked to budget lines by share; one budget line at most 100 % across pay items
  child("Digit Pay Item Link", [L("contract", "Contract", "العقد", "Digit Client Contract", LV), D("sov_line", "SOV Line", "بند جدول القيم", { ...REQ, ...LV }), D("budget_line", "Budget Line", "بند الموازنة", { ...REQ, ...LV }),
    D("cost_code", "Cost Code", "رمز التكلفة", { ...LV, read_only: 1 }), P("share_pct", "Share %", "نسبة الربط", { ...REQ, ...LV })]),
  doc("Digit Project Cost Budget", { autoname: "BUD-.YYYY.-.####", is_submittable: 1, search_fields: "project,version", writers: [R.QS, R.PM], fields: [
    L("project", "Project", "المشروع", "Project", { ...REQ, ...LVF }), L("company", "Company", "الشركة", "Company", { fetch_from: "project.company" }), I("version", "Version", "الإصدار", { ...REQ, ...LV }), L("source_boq", "Source BOQ", "جدول الكميات المصدر", "Digit BOQ"), CB(1),
    WF(["Draft", "Approved", "Superseded"]), DT("effective_date", "Effective Date", "تاريخ السريان"), D("approved_by", "Approved By", "اعتمد بواسطة", RO), DT("approved_on", "Approved On", "تاريخ الاعتماد", RO), D("currency", "Currency", "العملة", { default: "SAR", hidden: 1 }),
    SB("sb_l", "Budget Lines", "بنود الموازنة"), T("lines", "Lines", "البنود", "Digit Budget Line"), C("total_original", "Original Budget", "الموازنة الأصلية", { ...RO, ...LV })] }),
  child("Digit Budget Revision Delta", [D("line_key", "Budget Line", "بند الموازنة", { ...REQ, ...LV }), D("cost_code", "Cost Code", "رمز التكلفة", { ...LV, read_only: 1 }), C("delta_amount", "Change Amount", "مبلغ التغيير", { ...REQ, ...LV }), TX("reason", "Reason", "السبب")]),
  doc("Digit Budget Revision", { autoname: "BREV-.YYYY.-.####", is_submittable: 1, writers: [R.QS, R.PM], fields: [
    L("budget", "Budget", "الموازنة", "Digit Project Cost Budget", { ...REQ, ...LVF }), L("project", "Project", "المشروع", "Project", { fetch_from: "budget.project", ...LVF }), L("linked_variation", "Linked Variation", "الأمر التغييري المرتبط", "Digit Client Variation"), CB(1),
    WF(["Draft", "Submitted", "Approved", "Rejected"]), D("approved_by", "Approved By", "اعتمد بواسطة", RO), DT("approved_on", "Approved On", "تاريخ الاعتماد", RO), D("currency", "Currency", "العملة", { default: "SAR", hidden: 1 }),
    TX("reason", "Reason", "السبب", REQ), SB("sb_d", "Changes", "التغييرات"), T("deltas", "Deltas", "التغييرات", "Digit Budget Revision Delta"), C("net_change", "Net Change", "صافي التغيير", { ...RO, ...LV })] }),
  doc("Digit Budget Transfer", { autoname: "BTR-.YYYY.-.####", is_submittable: 1, writers: [R.QS, R.PM], fields: [
    L("budget", "Budget", "الموازنة", "Digit Project Cost Budget", { ...REQ, ...LVF }), L("project", "Project", "المشروع", "Project", { fetch_from: "budget.project", ...LVF }), D("from_line", "From Budget Line", "من بند الموازنة", { ...REQ, ...LV }), D("to_line", "To Budget Line", "إلى بند الموازنة", { ...REQ, ...LV }), CB(1),
    WF(["Draft", "Approved", "Rejected"]), C("amount", "Amount", "المبلغ", { ...REQ, ...LV }), D("currency", "Currency", "العملة", { default: "SAR", hidden: 1 }), D("approved_by", "Approved By", "اعتمد بواسطة", RO), TX("reason", "Reason", "السبب", REQ)] }),
  // BUD-EXT-02/03 cost source verification: an allocation re-attributes one unmapped source row to a budget line; a review records the decision on a source exception. Sources are never edited.
  doc("Digit Cost Allocation", { autoname: "CAL-.YYYY.-.####", is_submittable: 1, writers: [R.QS, R.PM, R.ACC], search_fields: "source_name,budget_line", fields: [
    L("project", "Project", "المشروع", "Project", { ...REQ, ...LVF }), L("company", "Company", "الشركة", "Company", { fetch_from: "project.company", read_only: 1 }), L("budget", "Budget", "الموازنة", "Digit Project Cost Budget", { ...REQ, read_only: 1 }),
    S("source_doctype", "Source Type", "نوع المصدر", ["Purchase Order", "Purchase Invoice", "Digit Subcontract Work Order", "Journal Entry"], { ...REQ, ...LVF }), F("source_name", "Source Document", "مستند المصدر", "Dynamic Link", { options: "source_doctype", ...REQ, ...LV }),
    I("source_row", "Source Row", "سطر المصدر", { ...REQ, ...LV }), D("source_detail", "Item / Account", "الصنف / الحساب", RO), D("source_code", "Source Cost Code", "رمز تكلفة المصدر", RO), CB(1),
    D("budget_line", "Budget Line", "بند الموازنة", { ...REQ, ...LV }), D("cost_code", "Allocated Cost Code", "رمز التكلفة المخصص", { ...RO, ...LV }), S("relationship_type", "Relationship", "نوع العلاقة", ["Commitment", "Actual"], RO),
    C("amount", "Amount at Allocation", "المبلغ عند التخصيص", { ...RO, ...LV }), D("currency", "Currency", "العملة", { default: "SAR", hidden: 1 }), D("source_watermark", "Source Version", "إصدار المصدر", RO), D("allocated_by", "Allocated By", "خصّص بواسطة", RO),
    SB("sb_r", "Reason", "السبب"), TX("reason", "Reason", "السبب", REQ)] }),
  doc("Digit Cost Exception Review", { autoname: "CXR-.YYYY.-.####", is_submittable: 1, writers: [R.QS, R.PM, R.ACC], search_fields: "source_name,exception", fields: [
    L("project", "Project", "المشروع", "Project", { ...REQ, ...LVF }), L("company", "Company", "الشركة", "Company", { fetch_from: "project.company", read_only: 1 }),
    S("exception", "Exception", "الاستثناء", ["Unmapped Cost Code", "Cost Code Not in Budget", "Possible Double Count", "Billed Amount Mismatch", "Bill Not Invoiced", "Expense Not Posted", "Allocation Source Changed", "Allocation Source Missing"], { ...REQ, ...LVF }),
    D("source_doctype", "Source Type", "نوع المصدر", { ...REQ, ...LV }), F("source_name", "Source Document", "مستند المصدر", "Dynamic Link", { options: "source_doctype", ...REQ, ...LV }), I("source_row", "Source Row", "سطر المصدر"), CB(1),
    S("resolution", "Resolution", "القرار", ["Accepted as Is", "Correction Requested"], { ...REQ, ...LVF }), C("amount", "Amount at Review", "المبلغ عند المراجعة", { ...RO, ...LV }), D("currency", "Currency", "العملة", { default: "SAR", hidden: 1 }),
    D("source_watermark", "Source Version", "إصدار المصدر", RO), D("reviewed_by", "Reviewed By", "راجع بواسطة", RO), DT("reviewed_on", "Reviewed On", "تاريخ المراجعة", RO), SB("sb_n", "Note", "الملاحظة"), TX("note", "Note", "الملاحظة", REQ)] }),
  // DEC-117: a non-financial, immutable snapshot of the actual-cost attribution at a cut-off (series ACA)
  child("Digit Actual Cost Attribution Row", [D("cost_code", "Cost Code", "رمز التكلفة", LV), S("kind", "Kind", "النوع", ["Commitment", "Actual"], LV), D("source_doctype", "Source Type", "نوع المصدر", LV),
    F("source_name", "Source Document", "مستند المصدر", "Dynamic Link", { options: "source_doctype", ...LV }), I("source_row", "Source Row", "سطر المصدر", LV), C("amount", "Amount", "المبلغ", LV), D("allocation", "Allocation", "التخصيص")]),
  // DEC-119: least privilege — no store keeper access, export only DIR / PM / ACC
  doc("Digit Actual Cost Attribution", { autoname: "ACA-.YYYY.-.####", is_submittable: 1, permissions: perms([R.QS, R.PM, R.ACC], true).filter((p) => p.role !== R.SK).map((p) => ([SYS, R.DIR, R.PM, R.ACC].includes(p.role) ? p : { ...p, export: 0 })), fields: [
    L("project", "Project", "المشروع", "Project", { ...REQ, ...LVF }), L("company", "Company", "الشركة", "Company", { fetch_from: "project.company", read_only: 1 }), DT("as_of", "As of", "حتى تاريخ", { ...REQ, ...LV }), L("budget", "Approved Budget", "الموازنة المعتمدة", "Digit Project Cost Budget", { read_only: 1 }), CB(1),
    C("total_committed", "Open Commitments", "الالتزامات المفتوحة", { ...RO, ...LV }), C("total_actual", "Actual Cost", "التكلفة الفعلية", { ...RO, ...LV }), D("currency", "Currency", "العملة", { default: "SAR", hidden: 1 }),
    SB("sb_r", "Attribution", "الإسناد"), T("attribution_rows", "Rows", "الصفوف", "Digit Actual Cost Attribution Row")] }),
  child("Digit Forecast Line", [D("line_key", "Budget Line", "بند الموازنة", { ...REQ, read_only: 1 }), D("cost_code", "Cost Code", "رمز التكلفة", { ...LV, read_only: 1 }), C("revised_budget", "Revised Budget", "الموازنة المعدلة", { ...RO, ...LV }), C("committed", "Open Commitments", "الالتزامات المفتوحة", { ...RO, ...LV }), C("actual", "Actual Cost", "التكلفة الفعلية", { ...RO, ...LV }),
    S("method", "ETC Method", "طريقة التقدير", ["Budget Remaining", "Committed + Uncommitted", "Manual ETC", "Qty × Rate", "Average Performance", "Percent Complete", "Burn Rate"], LV), C("uncommitted_remaining", "Uncommitted Remaining", "غير الملتزم المتبقي"), C("manual_etc", "Manual ETC", "تقدير يدوي"),
    // phase 4 C4-07: percent-complete and burn-rate methods; the planned finish date per line
    P("pct_complete", "Percent Complete", "نسبة الإنجاز"), DT("planned_finish", "Planned Finish", "تاريخ الانتهاء المخطط"),
    C("etc", "ETC", "التكلفة المتبقية المتوقعة", { ...RO, ...LV }), C("eac", "EAC", "التكلفة النهائية المتوقعة", { ...RO, ...LV }), C("variance", "Variance", "الانحراف", { ...RO, ...LV }), S("confidence", "Confidence", "الثقة", ["Medium", "High", "Low"]), TX("note", "Note", "ملاحظة")]),
  doc("Digit Cost Forecast Snapshot", { autoname: "FCS-.YYYY.-.####", is_submittable: 1, writers: [R.QS, R.PM], fields: [
    L("project", "Project", "المشروع", "Project", { ...REQ, ...LVF }), L("budget", "Budget", "الموازنة", "Digit Project Cost Budget", REQ), D("period", "Period (YYYY-MM)", "الفترة", { ...REQ, ...LV }), DT("cutoff_date", "Cut-off Date", "تاريخ القطع", REQ), CB(1),
    WF(["Draft", "Approved", "Superseded"]), I("version", "Version", "الإصدار", RO), D("prepared_by", "Prepared By", "أعده"), D("approved_by", "Approved By", "اعتمد بواسطة", RO), D("currency", "Currency", "العملة", { default: "SAR", hidden: 1 }),
    SB("sb_l", "Forecast Lines", "بنود التوقع"), T("lines", "Lines", "البنود", "Digit Forecast Line"),
    SB("sb_t", "Totals", "الإجماليات"), C("total_revised", "Revised Budget", "الموازنة المعدلة", RO), C("total_committed", "Open Commitments", "الالتزامات المفتوحة", RO), C("total_actual", "Actual Cost", "التكلفة الفعلية", RO), CB(2),
    C("total_etc", "ETC", "التكلفة المتبقية المتوقعة", RO), C("total_eac", "EAC", "التكلفة النهائية المتوقعة", { ...RO, ...LV }), C("total_variance", "Variance at Completion", "الانحراف عند الإكمال", { ...RO, ...LV }), C("contract_revenue", "Revised Contract Value", "قيمة العقد المعدلة", RO), P("forecast_margin", "Forecast Margin", "الهامش المتوقع", RO)] }),
  child("Digit Cost Sheet Column", [S("measure", "Measure", "المقياس", ["Original Budget", "Revised Budget", "Committed", "Actual", "ETC", "EAC", "Variance", "Percent Spent"], { ...REQ, ...LV }), D("label", "Label", "التسمية", LV), CK("show_total", "Show Total", "إظهار الإجمالي", { default: "1" })]),
  doc("Digit Cost Sheet Definition", { autoname: "CSD-.####", title_field: "title", writers: [R.QS, R.PM], fields: [
    D("title", "Title", "العنوان", { ...REQ, ...LV }), S("row_basis", "Row Basis", "أساس الصفوف", ["Budget Line", "Category", "WBS Node"], { ...REQ, ...LV }), L("project", "Project", "المشروع", "Project", LVF), CB(1), CK("is_default", "Default", "افتراضي", LV),
    SB("sb_c", "Columns", "الأعمدة"), T("columns", "Columns", "الأعمدة", "Digit Cost Sheet Column")] }),
];

// ------------------------------------------------------------------ Resources & spend (RSP)
const resources: PluginDocType[] = [
  doc("Digit Machinery", { autoname: "field:machine_code", title_field: "machine_name", writers: [R.PM, R.SE], fields: [
    D("machine_code", "Machine Code", "رمز المعدة", { ...REQ, ...LV, unique: 1 }), D("machine_name", "Machine Name", "اسم المعدة", { ...REQ, ...LV }), S("machine_type", "Machine Type", "نوع المعدة", ["Excavator", "Crane", "Loader", "Truck", "Concrete Pump", "Generator", "Compactor", "Other"], LVF), CB(1),
    S("ownership", "Ownership", "الملكية", ["Owned", "Rented"], { ...REQ, ...LV }), L("supplier", "Rental Supplier", "مورّد الإيجار", "Supplier", { depends_on: "eval:doc.ownership=='Rented'" }), S("status", "Status", "الحالة", ["Available", "Deployed", "Under Maintenance", "Retired"], LVF),
    L("current_project", "Current Project", "المشروع الحالي", "Project", LV), C("hourly_rate", "Planning Hourly Rate", "سعر الساعة التخطيطي", { description: "Operational planning rate — not a posted accounting charge" }), D("currency", "Currency", "العملة", { default: "SAR", hidden: 1 }),
    // DEC-261 serial number of an owned machine; DEC-265 equipment location
    D("serial_no", "Serial Number", "الرقم التسلسلي", { ...LV, mandatory_depends_on: "eval:doc.ownership=='Owned'" }), L("current_location", "Current Location", "الموقع الحالي", "Digit Equipment Location", LV)] }),
  doc("Digit Machinery Usage", { autoname: "MU-.YYYY.-.#####", is_submittable: 1, writers: [R.SE, R.PM], fields: [
    L("machinery", "Machinery", "المعدة", "Digit Machinery", { ...REQ, ...LVF }), L("project", "Project", "المشروع", "Project", { ...REQ, ...LVF }), L("task", "Task", "المهمة", "Task"), DT("usage_date", "Usage Date", "تاريخ الاستخدام", { ...REQ, ...LV }), CB(1),
    S("status", "Status", "الحالة", ["Draft", "Submitted"], { ...LVF, read_only: 1 }), N("hours", "Hours", "الساعات", { ...REQ, ...LV }), C("rate", "Planning Rate", "السعر التخطيطي", { fetch_from: "machinery.hourly_rate" }), C("fuel_cost", "Fuel Cost (estimate)", "تكلفة الوقود (تقديرية)"),
    C("total", "Operational Cost (estimate)", "التكلفة التشغيلية (تقديرية)", { ...RO, ...LV }), L("operator", "Operator", "المشغل", "Employee"), L("crew", "Crew", "الطاقم", "Digit Crew", LV), D("currency", "Currency", "العملة", { default: "SAR", hidden: 1 }),
    // F08-08-2 fuel per operating hour and anomaly against the machine's own average
    N("fuel_per_hour", "Fuel per Hour (litres)", "الوقود لكل ساعة (لتر)", RO), CK("fuel_anomaly", "Fuel Anomaly", "استهلاك وقود غير طبيعي", { ...RO, ...LV })] }),
  child("Digit Crew Member", [L("employee", "Employee", "الموظف", "Employee", { ...REQ, ...LV }), D("employee_name", "Employee Name", "اسم الموظف", { fetch_from: "employee.employee_name", read_only: 1, ...LV }), S("crew_role", "Crew Role", "الدور في الطاقم", ["Skilled", "Foreman", "Helper", "Operator"], LV),
    C("planned_daily_cost", "Planned Daily Cost (estimate)", "التكلفة اليومية المخططة (تقديرية)", { description: "Planning estimate; payroll stays in DIGIT HR" })]),
  doc("Digit Crew", { autoname: "CREW-.####", title_field: "crew_name", writers: [R.SE, R.PM], fields: [
    D("crew_name", "Crew Name", "اسم الطاقم", { ...REQ, ...LV }), L("project", "Project", "المشروع", "Project", { ...REQ, ...LVF }), S("trade", "Trade", "التخصص", ["Civil", "Structural", "MEP", "Finishing", "Landscaping", "Steel", "Other"], LV), CB(1),
    L("foreman", "Foreman", "مراقب العمال", "Employee", LV), S("status", "Status", "الحالة", ["Active", "Inactive"], LVF), D("currency", "Currency", "العملة", { default: "SAR", hidden: 1 }),
    L("default_task", "Default Task", "المهمة الافتراضية", "Task", { description: "Used when the attendance sheet is filled from the crew" }), SB("sb_m", "Members", "الأعضاء"), T("members", "Members", "الأعضاء", "Digit Crew Member")] }),
  child("Digit Field Attendance Employee", [L("employee", "Employee", "الموظف", "Employee", { ...REQ, ...LV }), D("employee_name", "Employee Name", "اسم الموظف", { fetch_from: "employee.employee_name", read_only: 1, ...LV }), S("attendance", "Attendance", "الحضور", ["Present", "Absent", "Half Day", "On Leave"], { ...REQ, ...LV }),
    N("hours", "Hours", "الساعات", LV), N("overtime_hours", "Overtime Hours", "ساعات العمل الإضافي", LV), L("task", "Task", "المهمة", "Task")]),
  doc("Digit Field Attendance", { autoname: "FATT-.YYYY.-.#####", is_submittable: 1, writers: [R.SE], fields: [
    L("project", "Project", "المشروع", "Project", { ...REQ, ...LVF }), DT("attendance_date", "Attendance Date", "تاريخ الحضور", { ...REQ, ...LV }), L("crew", "Crew", "الطاقم", "Digit Crew", LV), CB(1),
    S("status", "Status", "الحالة", ["Draft", "Submitted"], { ...LVF, read_only: 1 }), I("present_count", "Present", "الحاضرون", { ...RO, ...LV }), N("overtime_hours", "Overtime Hours", "ساعات العمل الإضافي", RO),
    D("operational_note", "Operational Note", "ملاحظة تشغيلية", { read_only: 1, default: "Site attendance register — HR Attendance and payroll are not created from it." }),
    S("shift", "Shift", "الوردية", ["Day", "Night"], { default: "Day", ...LV }), TX("induction_note", "Induction Warning", "تنبيه التعريف بالموقع", RO),
    SB("sb_e", "Employees", "الموظفون"), T("employees", "Employees", "الموظفون", "Digit Field Attendance Employee")] }),
  doc("Digit Petty Cash Fund", { autoname: "PCF-.####", title_field: "fund_name", writers: [R.ACC, R.PM], fields: [
    D("fund_name", "Fund Name", "اسم العهدة", { ...REQ, ...LV }), L("project", "Project", "المشروع", "Project", { ...REQ, ...LVF }), L("company", "Company", "الشركة", "Company", { fetch_from: "project.company" }), L("custodian", "Custodian", "أمين العهدة", "Employee", { ...REQ, ...LV }), CB(1),
    S("status", "Status", "الحالة", ["Open", "Closed"], LVF), C("fund_limit", "Fund Limit", "حد العهدة", { ...REQ, ...LV }), DT("opened_on", "Opened On", "تاريخ الفتح"), D("currency", "Currency", "العملة", { default: "SAR", hidden: 1 }),
    C("spent", "Approved Spend", "المصروف المعتمد", { ...RO, ...LV }), C("balance", "Remaining Balance", "الرصيد المتبقي", { ...RO, ...LV })] }),
  doc("Digit Site Expense", { autoname: "EXP-.YYYY.-.#####", is_submittable: 1, writers: [R.SE, R.ACC, R.PM], fields: [
    L("project", "Project", "المشروع", "Project", { ...REQ, ...LVF }), L("fund", "Petty Cash Fund", "العهدة النقدية", "Digit Petty Cash Fund", LV), DT("expense_date", "Expense Date", "تاريخ المصروف", { ...REQ, ...LV }),
    S("category", "Category", "الفئة", ["Fuel", "Transport", "Consumables", "Site Services", "Meals", "Permits", "Other"], { ...REQ, ...LVF }), CB(1), WF(["Draft", "Submitted", "Approved", "Rejected"]),
    C("amount", "Amount", "المبلغ", { ...REQ, ...LV }), S("vat_status", "VAT Status", "الحالة الضريبية", ["Not Determined", "Inclusive", "Exempt"], { description: "No VAT is computed here; accounting treatment needs a verified template." }), L("supplier", "Supplier", "المورّد", "Supplier"),
    D("receipt_ref", "Receipt Reference", "مرجع الإيصال"), D("currency", "Currency", "العملة", { default: "SAR", hidden: 1 }), SB("sb_d", "Details", "التفاصيل"), TX("description", "Description", "الوصف", REQ), TX("reject_reason", "Reject Reason", "سبب الرفض"),
    L("journal_entry", "Journal Entry", "قيد اليومية", "Journal Entry", { read_only: 1, allow_on_submit: 1 })] }),
  // DEC-225: the company's site location dictionary; a location points to a Warehouse only when it is a real store
  // DEC-265: equipment locations (site / yard) with an optional Warehouse and Project
  doc("Digit Equipment Location", { autoname: "field:location_name", writers: [R.PM, R.SE], fields: [
    D("location_name", "Location", "الموقع", { ...REQ, ...LV, unique: 1 }), L("company", "Company", "الشركة", "Company", LVF), L("project", "Project", "المشروع", "Project", LVF),
    L("warehouse", "Store", "المخزن", "Warehouse", LV), S("location_type", "Location Type", "نوع الموقع", ["Site", "Yard", "Workshop"], LV)] }),
  doc("Digit Site Location", { autoname: "field:location_name", writers: [R.PM, R.SK], fields: [
    D("location_name", "Location", "الموقع", { ...REQ, ...LV, unique: 1 }), L("company", "Company", "الشركة", "Company", { ...REQ, ...LVF }), L("project", "Project", "المشروع", "Project", LVF),
    L("warehouse", "Store", "المخزن", "Warehouse", LV), TX("description", "Description", "الوصف")] }),
  // DEC-224 / 226 / 228: a store issue request — PM (not the requester) approves, the store keeper creates one native Stock Entry from it; a return reverses an issued request
  child("Digit Issue Request Line", [L("item_code", "Item", "الصنف", "Item", { ...REQ, ...LV }), F("qty", "Qty", "الكمية", "Float", { ...REQ, ...LV }), D("uom", "UOM", "الوحدة", LV),
    D("cost_code", "Cost Code", "رمز التكلفة", { ...REQ, ...LV }), L("task", "Task", "المهمة", "Task"), F("issued_qty", "Issued Qty", "الكمية المصروفة", "Float", { ...RO, ...LV })]),
  doc("Digit Issue Request", { autoname: "MIR-.YYYY.-.####", is_submittable: 1, search_fields: "project,warehouse", writers: [R.SE, R.SK, R.PM], fields: [
    L("project", "Project", "المشروع", "Project", { ...REQ, ...LVF }), L("company", "Company", "الشركة", "Company", { fetch_from: "project.company", read_only: 1 }), L("warehouse", "Store", "المخزن", "Warehouse", { ...REQ, ...LVF }),
    DT("required_on", "Required On", "مطلوب في", LV), L("location", "Site Location", "موقع الاستخدام", "Digit Site Location"), CB(1), WF(["Draft", "Pending Approval", "Approved", "Rejected", "Issued"]), D("approved_by", "Approved By", "اعتمد بواسطة", RO), L("stock_entry", "Stock Entry", "حركة المخزون", "Stock Entry", RO),
    CK("is_return", "Return to Store", "مرتجع للمخزن"), L("return_against", "Return Against", "مرتجع من طلب", "Digit Issue Request", { depends_on: "eval:doc.is_return" }), TX("reason", "Reason", "السبب"),
    SB("sb_l", "Lines", "البنود"), T("lines", "Lines", "البنود", "Digit Issue Request Line")] }),
];

// ------------------------------------------------------------------ Financial position & closeout (FIN)
const finance: PluginDocType[] = [
  doc("Digit Retention Release Request", { autoname: "RRR-.YYYY.-.####", is_submittable: 1, writers: [R.QS, R.ACC], fields: [
    L("contract", "Client Contract", "عقد العميل", "Digit Client Contract", { ...REQ, ...LVF }), L("project", "Project", "المشروع", "Project", { fetch_from: "contract.project", ...LVF }), L("customer", "Customer", "العميل", "Customer", { fetch_from: "contract.customer" }),
    S("release_type", "Release Type", "نوع الإفراج", ["Partial", "Final"], { ...REQ, ...LV }), CB(1), WF(["Draft", "Pending Approval", "Approved", "Rejected"]),
    C("held_amount", "Retention Held", "المحتجزات المحتفظ بها", RO), C("reserved_other", "Reserved by Other Requests", "محجوز لطلبات أخرى", RO), C("eligible_amount", "Eligible to Release", "القابل للإفراج", RO), C("requested_amount", "Requested Amount", "المبلغ المطلوب", { ...REQ, ...LV }),
    D("currency", "Currency", "العملة", { default: "SAR", hidden: 1 }), SB("sb_b", "Basis", "الأساس"), TX("basis", "Basis", "الأساس")] }),
  child("Digit Final Account Adjustment", [D("description", "Description", "الوصف", { ...REQ, ...LV }), S("adjustment_type", "Adjustment Type", "نوع التسوية", ["Addition", "Deduction", "Remeasurement"], { ...REQ, ...LV }), C("amount", "Amount", "المبلغ", { ...REQ, ...LV }), D("reference", "Reference", "المرجع")]),
  child("Digit Final Account Dispute", [D("item", "Item", "البند", { ...REQ, ...LV }), C("claimed_amount", "Claimed Amount", "المبلغ المطالب به", LV), C("offered_amount", "Offered Amount", "المبلغ المعروض", LV), S("status", "Status", "الحالة", ["Open", "Resolved", "Withdrawn"], LV), TX("note", "Note", "ملاحظة")]),
  doc("Digit Final Account", { autoname: "FA-.YYYY.-.####", is_submittable: 1, writers: [R.QS, R.PM], fields: [
    L("contract", "Client Contract", "عقد العميل", "Digit Client Contract", { ...REQ, ...LVF }), L("project", "Project", "المشروع", "Project", { fetch_from: "contract.project", ...LVF }), L("customer", "Customer", "العميل", "Customer", { fetch_from: "contract.customer" }), CB(1),
    WF(["Draft", "Under Negotiation", "Agreed", "Disputed", "Approved"]), DT("agreed_on", "Agreed On", "تاريخ الاتفاق"), D("currency", "Currency", "العملة", { default: "SAR", hidden: 1 }),
    SB("sb_v", "Values", "القيم"), C("original_value", "Original Contract Value", "قيمة العقد الأصلية", RO), C("approved_variations", "Approved Variations", "الأوامر التغييرية المعتمدة", RO), C("certified_to_date", "Certified to Date", "المعتمد حتى تاريخه", RO), CB(2),
    C("adjustments_total", "Adjustments", "التسويات", RO), C("final_value", "Final Account Value", "قيمة الحساب الختامي", { ...RO, ...LV }), C("open_disputes", "Open Disputes", "النزاعات المفتوحة", RO),
    SB("sb_a", "Adjustments", "التسويات"), T("adjustments", "Adjustments", "التسويات", "Digit Final Account Adjustment"), SB("sb_d", "Disputes", "النزاعات"), T("disputes", "Disputes", "النزاعات", "Digit Final Account Dispute")] }),
  child("Digit Closeout Assessment Row", [S("area", "Area", "المجال", ["Technical", "Commercial", "Financial"], { ...REQ, ...LV }), D("item", "Item", "البند", { ...REQ, ...LV }), S("status", "Status", "الحالة", ["Pending", "Done", "Not Applicable"], { ...REQ, ...LV }), D("evidence", "Evidence", "الإثبات", LV),
    L("responsible", "Responsible", "المسؤول", "User"), D("na_approved_by", "N/A Approved By", "اعتماد عدم الانطباق", { read_only: 1 }), TX("note", "Note", "ملاحظة")]),
  doc("Digit Closeout Assessment", { autoname: "CLO-.####", writers: [R.PM, R.QS, R.ACC], fields: [
    L("project", "Project", "المشروع", "Project", { ...REQ, ...LVF }), DT("assessment_date", "Assessment Date", "تاريخ التقييم", { ...REQ, ...LV }), CB(1), S("status", "Status", "الحالة", ["Draft", "In Progress", "Completed"], { ...LVF, read_only: 1 }),
    D("technical_status", "Technical Closeout", "الإغلاق الفني", { ...RO, ...LV }), D("commercial_status", "Commercial Closeout", "الإغلاق التجاري", { ...RO, ...LV }), D("financial_status", "Financial Closeout", "الإغلاق المالي", { ...RO, ...LV }),
    SB("sb_r", "Checklist", "قائمة التحقق"), T("rows", "Rows", "البنود", "Digit Closeout Assessment Row")] }),
  // DEC-014 (owner ruling): manual cash-forecast lines are entered only by the Finance role
  doc("Digit Cashflow Forecast Item", { autoname: "CFI-.#####", writers: [R.ACC], fields: [
    L("project", "Project", "المشروع", "Project", { ...REQ, ...LVF }), D("period", "Period (YYYY-MM)", "الفترة", { ...REQ, ...LV }), S("direction", "Direction", "الاتجاه", ["Inflow", "Outflow"], { ...REQ, ...LVF }), CB(1),
    S("category", "Category", "الفئة", ["Client Collection", "Subcontractor Payment", "Supplier Payment", "Labour", "Equipment", "Overhead", "Other"], { ...REQ, ...LV }), C("amount", "Amount", "المبلغ", { ...REQ, ...LV }), S("status", "Status", "الحالة", ["Planned", "Committed"], LV),
    D("currency", "Currency", "العملة", { default: "SAR", hidden: 1 }), TX("basis", "Basis", "الأساس")] }),
  doc("Digit Opening Balance", { autoname: "OPB-.####", writers: [R.ACC], fields: [
    L("project", "Project", "المشروع", "Project", { ...REQ, ...LVF }), DT("as_of", "As Of", "حتى تاريخ", { ...REQ, ...LV }), S("status", "Status", "الحالة", ["Draft", "Confirmed"], LVF), CB(1), D("currency", "Currency", "العملة", { default: "SAR", hidden: 1 }),
    C("certified_to_date", "Certified to Date", "المعتمد حتى تاريخه"), C("invoiced_to_date", "Invoiced to Date", "المفوتر حتى تاريخه"), C("collected_to_date", "Collected to Date", "المحصل حتى تاريخه"),
    C("retention_held", "Retention Held", "المحتجزات المحتفظ بها"), C("advance_outstanding", "Advance Outstanding", "رصيد الدفعة المقدمة"), C("cost_to_date", "Cost to Date", "التكلفة حتى تاريخه"), TX("source_note", "Source Note", "مصدر الأرصدة", REQ)] }),
  doc("Digit Construction Settings", { issingle: 1, writers: [], fields: [
    L("default_company", "Default Company", "الشركة الافتراضية", "Company"), P("overrun_alert_pct", "Overrun Alert %", "نسبة تنبيه التجاوز", { default: "2" }), CB(1),
    I("stale_forecast_days", "Stale Forecast (days)", "تقادم التوقع (أيام)", { default: "45" }), I("rate_expiry_warning_days", "Rate Expiry Warning (days)", "تنبيه انتهاء الأسعار (أيام)", { default: "30" }),
    // owner rulings (Finance values, empty until Finance sets them): budget warning-only grace period (DEC-155) and the Project Manager budget approval cap (DEC-099 / DEC-151)
    I("budget_grace_months", "Budget Warning-Only Grace Period (months)", "مهلة التحذير فقط للموازنة (أشهر)"), C("budget_pm_approval_cap", "Project Manager Budget Approval Cap", "سقف اعتماد مدير المشروع للموازنة"),
    // phase 5 cost screens: the budget sheet / ranked list / KPI lines turn amber at the alert share and red past the limit (blank or 0 = 80 / 100)
    P("budget_warn_pct", "Budget Use Alert %", "نسبة تنبيه استهلاك الموازنة", { default: "80", description: "Committed + actual share of a budget line that turns it amber (blank = 80)" }), P("budget_over_pct", "Budget Use Limit %", "حد استهلاك الموازنة", { default: "100", description: "Share past which a budget line is red (blank = 100)" })] }),
  // DEC-009 (owner ruling OD-22): project roles that must be staffed per construction contract type (owner-maintained list; empty = no staffing check)
  doc("Digit Mandatory Project Role", { autoname: "DMR-.#####", title_field: "project_role", search_fields: "contract_type,project_role", writers: [R.DIR], fields: [
    S("contract_type", "Construction Contract Type", "نوع عقد المقاولات", ["", "Lump Sum", "Re-measurement", "Cost Plus", "Design & Build"], { ...LVF, description: "Blank = every construction project" }),
    S("project_role", "Project Role", "الدور في المشروع", ["Project Manager", "QS", "Site Engineer", "Foreman", "Procurement", "Accountant", "Planner", "Safety"], { ...REQ, ...LVF }), CB(1),
    CK("disabled", "Disabled", "معطّل")] }),
  // P7 (owner ruling W0-02): expense account per expense category per company, named by Finance
  doc("Digit Expense Account", { autoname: "DEA-.#####", title_field: "account", search_fields: "company,expense_category,account", writers: [R.ACC], fields: [
    L("company", "Company", "الشركة", "Company", { ...REQ, ...LVF }), S("expense_category", "Expense Category", "فئة المصروف", ["Fuel", "Transport", "Consumables", "Site Services", "Meals", "Permits", "Other"], { ...REQ, ...LVF }), CB(1),
    L("account", "Expense Account", "حساب المصروف", "Account", { ...REQ, ...LV }), L("cost_center", "Cost Center", "مركز التكلفة", "Cost Center"), CK("disabled", "Disabled", "معطّل")] }),
  // P5 (owner ruling W0-02): the Procurement manager accepts a matching variance beyond the Finance tolerance, with a reason
  doc("Digit Match Acceptance", { autoname: "DMA-.#####", title_field: "purchase_order", search_fields: "purchase_order,item_code,project", writers: [R.PROC], fields: [
    L("purchase_order", "Purchase Order", "أمر الشراء", "Purchase Order", { ...REQ, ...LVF }), L("item_code", "Item", "الصنف", "Item", { ...REQ, ...LVF }), L("project", "Project", "المشروع", "Project", { ...LV }), CB(1),
    TX("reason", "Acceptance Reason", "سبب القبول", { ...REQ }), D("accepted_by", "Accepted By", "قبِل بواسطة", { read_only: 1, ...LV }), DT("accepted_on", "Accepted On", "تاريخ القبول", { read_only: 1 })] }),
  doc("Digit Policy Decision", { autoname: "field:policy_key", title_field: "title", writers: [], fields: [
    S("policy_key", "Policy Key", "رمز السياسة", ["P1", "P2", "P3", "P4", "P5", "P6", "P7", "P8", "P9", "P10"], { ...REQ, ...LV, unique: 1 }), D("title", "Title", "العنوان", { ...REQ, ...LV }), S("status", "Status", "الحالة", ["Undefined", "Draft", "Defined"], { ...REQ, ...LVF }), CB(1),
    DT("effective_date", "Effective Date", "تاريخ السريان", LV), D("authority", "Decision Authority", "جهة القرار"), D("value", "Decision Value", "قيمة القرار"),
    SB("sb_d", "Decision", "القرار"), TX("decision", "Decision", "القرار"), TX("affects", "Blocked Final Actions", "الإجراءات النهائية المتأثرة", RO), TX("missing_reason", "Why Undefined", "سبب عدم التحديد")] }),
];

// ------------------------------------------------------------------ Saved views & dashboard layouts (FIN-05)
/** Personal records: every user creates and edits only their own (if_owner); System Manager administers. */
const ownRecords = (extra: Perm[] = []): Perm[] => [full(SYS), ...extra, { role: "All", read: 1, write: 1, create: 1, delete: 1, report: 1, export: 1, print: 1, if_owner: 1 }];
const analytics: PluginDocType[] = [
  doc("Digit Saved View", { autoname: "DSV-.#####", title_field: "view_name", search_fields: "view_name,report", permissions: ownRecords(), fields: [
    D("view_name", "View Name", "اسم العرض", { ...REQ, ...LV }), D("report", "Report", "التقرير", { ...REQ, ...LVF }), CB(1),
    S("visibility", "Visibility", "الظهور", ["Personal"], { ...LV, read_only: 1, description: "Sharing a view with others needs an owner sharing policy; views are personal until then." }),
    S("status", "Status", "الحالة", ["Active", "Archived"], LVF), I("version", "Version", "الإصدار", RO),
    SB("sb_f", "Filters", "المرشحات"), F("filters_json", "Filters (JSON)", "المرشحات (JSON)", "Code", { ...REQ, options: "JSON" })] }),
  child("Digit Layout Item", [S("item_type", "Item Type", "نوع العنصر", ["Metric", "Chart"], { ...REQ, ...LV }), D("item_id", "Item", "العنصر", { ...REQ, ...LV }), CK("hidden", "Hidden", "مخفي", LV)]),
  doc("Digit Dashboard Layout", { autoname: "DDL-.#####", search_fields: "dashboard,level", permissions: ownRecords([full(R.DIR)]), fields: [
    D("dashboard", "Dashboard", "اللوحة", { ...REQ, ...LVF }), S("level", "Level", "المستوى", ["User", "Role", "Company"], { ...REQ, ...LVF }), CB(1),
    L("for_user", "For User", "للمستخدم", "User", { ...LV, depends_on: "eval:doc.level=='User'" }), L("for_role", "For Role", "للدور", "Role", { ...LV, depends_on: "eval:doc.level=='Role'" }),
    L("for_company", "For Company", "للشركة", "Company", { ...LV, depends_on: "eval:doc.level=='Company'" }),
    SB("sb_i", "Cards and charts", "البطاقات والمخططات"), T("items", "Items", "العناصر", "Digit Layout Item")] }),
];

// ------------------------------------------------------------------ Controlled print outputs (EXT-03, DOC-PRN-01)
/** Issued copies keep provenance: nobody deletes them; issuers and directors may only void (hook-enforced). */
const printPerms: Perm[] = [{ role: SYS, read: 1, write: 1, create: 1, report: 1, export: 1, print: 1 }, ...CONSTRUCTION_ROLES.map((role): Perm => ({ role, read: 1, write: 1, create: 1, report: 1, print: 1 }))];
const printing: PluginDocType[] = [
  doc("Digit Print Artifact", { autoname: "PRN-.YYYY.-.#####", search_fields: "source_name,print_format", permissions: printPerms, fields: [
    L("source_doctype", "Source DocType", "نوع المصدر", "DocType", { ...REQ, ...LVF, read_only: 1 }), F("source_name", "Source", "المصدر", "Dynamic Link", { options: "source_doctype", ...REQ, ...LV, read_only: 1 }),
    L("project", "Project", "المشروع", "Project", { ...LVF, read_only: 1 }), L("company", "Company", "الشركة", "Company", RO), CB(1),
    S("status", "Status", "الحالة", ["Issued", "Void"], { ...LVF, read_only: 1 }), S("finality", "Finality", "النهائية", ["Final", "Draft copy"], { ...LV, read_only: 1 }),
    D("print_format", "Template", "القالب", { ...REQ, read_only: 1 }), D("template_version", "Template Version", "إصدار القالب", RO), S("language", "Language", "اللغة", ["Bilingual"], RO),
    SB("sb_l", "Lineage", "المصدر والتتبع"), D("source_state", "Source Status", "حالة المصدر", RO), I("source_docstatus", "Source Docstatus", "حالة الترحيل للمصدر", RO), D("source_modified", "Source Revision", "مراجعة المصدر", RO), CB(2),
    DT("as_of", "As Of", "حتى تاريخ", RO), F("generated_at", "Generated At", "وقت الإصدار", "Datetime", RO), D("content_hash", "Content Hash (SHA-256)", "بصمة المحتوى (SHA-256)", RO), TX("copy_reason", "Copy Reason", "سبب النسخة", RO),
    SB("sb_v", "Void details", "بيانات الإبطال", { depends_on: "eval:doc.status=='Void'" }), TX("void_reason", "Void Reason", "سبب الإبطال", RO), D("voided_by", "Voided By", "أبطله", RO), F("voided_on", "Voided On", "وقت الإبطال", "Datetime", RO),
    SB("sb_s", "Issued copy", "النسخة المصدرة", { collapsible: 1 }), F("html_snapshot", "Snapshot (HTML)", "لقطة النسخة (HTML)", "Code", { options: "HTML", read_only: 1 })] }),
];

/**
 * R4-I company isolation: every app DocType that links a Project but has no Company link gets a read-only `company`
 * fetched from that project (inserted right after the project field), so a Company User Permission scopes it exactly
 * like native documents — on Desk lists, link search, reports and app screens alike.
 */
export const COMPANY_FROM_PROJECT: Record<string, string> = {};
function withCompany(list: PluginDocType[]): PluginDocType[] {
  for (const d of list) {
    if (d.istable || d.issingle || d.fields.some((f) => f.fieldtype === "Link" && f.options === "Company") || d.fields.some((f) => f.fieldname === "company")) continue;
    const i = d.fields.findIndex((f) => f.fieldtype === "Link" && f.options === "Project");
    if (i < 0) continue;
    const pf = d.fields[i]!.fieldname ?? "project";
    d.fields.splice(i + 1, 0, L("company", "Company", "الشركة", "Company", { fetch_from: `${pf}.company`, read_only: 1, in_standard_filter: 1 }));
    COMPANY_FROM_PROJECT[d.name] = pf;
  }
  return list;
}
const BASE_DOCTYPES: PluginDocType[] = withCompany([...execution, ...estimating, ...commercial, ...subcontract, ...cost, ...resources, ...finance, ...analytics, ...printing]);
/** The plugin DocTypes before the R19 source merge (a deep copy; scripts/construction-r19-current.ts and the import test read it). */
export const CONSTRUCTION_BASE_DOCTYPES: PluginDocType[] = BASE_DOCTYPES.map((d) => ({ ...d, fields: [...d.fields] }));

/**
 * R19 source merge (owner goal 2026-11-09). r19/source.generated.json is produced by scripts/construction-r19-import.py
 * from the supplied Frappe source snapshot and lists ONLY what this plugin did not have: DocTypes, fields of existing
 * DocTypes (placed after the source field that precedes them), DocType `links` and translations. Nothing already here
 * is replaced, so the older snapshot can never downgrade newer code. Python controllers stay server-side.
 */
type SrcField = DocField & Record<string, unknown>;
const SRC = R19_SOURCE as unknown as { doctypes: PluginDocType[]; extra_fields: Record<string, { after: string | null; field: SrcField }[]>; custom_fields: CustomField[]; links: Record<string, { link_doctype: string; link_fieldname: string; group?: string }[]>; translations: Record<string, string>; doctype_ar?: Record<string, string> };
// source translations (translations/ar.csv) then r19/translationsAr.ts; labels already translated here keep their Arabic
for (const [en, ar] of [...Object.entries(SRC.translations), ...Object.entries(R19_AR)]) if (!(en in AR)) AR[en] = ar;
for (const d of BASE_DOCTYPES) {
  for (const { after, field } of SRC.extra_fields[d.name] ?? []) {
    if (d.fields.some((f) => f.fieldname === field.fieldname)) continue;
    const i = after ? d.fields.findIndex((f) => f.fieldname === after) : -1;
    d.fields.splice(i < 0 ? d.fields.length : i + 1, 0, field);
  }
}
/** DocTypes imported from the supplied source snapshot (R19), with their source permissions and fields. */
export const R19_IMPORTED_DOCTYPES: PluginDocType[] = withCompany(SRC.doctypes.filter((d) => !BASE_DOCTYPES.some((b) => b.name === d.name)).map((d) => ({ ...d, fields: [...d.fields], module: MOD })));
/** Every DocType before the owner test-list spec merge (deep copy; scripts/construction-spec-schema.ts diffs against it). */
export const CONSTRUCTION_PRE_SPEC_DOCTYPES: PluginDocType[] = [...BASE_DOCTYPES, ...R19_IMPORTED_DOCTYPES].map((d) => ({ ...d, fields: d.fields.map((f) => ({ ...f })) }));

/**
 * Owner test-list spec merge (2026-11-13, DIGIT_CON_TEST_LIST.csv sheet 5 + the spec catalog's current-document and
 * proposed-field sheets). spec/schema.generated.json is produced by scripts/construction-spec-schema.ts and lists ONLY
 * what is missing here: fields appended to existing DocTypes (in a "Spec details" section), extra Select values,
 * DocTypes the old base or the new departments name and this app lacked, and Custom Fields on native documents.
 * Equivalent fields (spec/aliases.ts) are never added twice; nothing existing is replaced.
 */
type SpecField = ArField & { tid?: string; label_ar?: string };
const SPEC = SPEC_SOURCE as unknown as {
  doctypes: (Omit<PluginDocType, "permissions" | "fields"> & { fields: SpecField[]; writers: string[]; label_ar: string })[];
  fields: Record<string, SpecField[]>; options: Record<string, Record<string, string[]>>; props: Record<string, Record<string, Partial<DocField>>>;
  custom_fields: (CustomField & { label_ar?: string; tid?: string })[]; ar: Record<string, string>;
};
for (const [en, ar] of Object.entries(SPEC.ar)) if (!(en in AR)) AR[en] = ar;
for (const [en, ar] of Object.entries(SPEC_AR)) if (!(en in AR) && !(en in OPTION_AR)) AR[en] = ar;
for (const [en, ar] of Object.entries({ ...SPEC_ROLE_AR, ...SPEC_STATE_AR })) AR[en] ??= ar;
const ROLE_OF: Record<string, string> = R;
const stripSpec = (f: SpecField): DocField => { const { tid: _t, label_ar: _a, ...rest } = f; return rest; };
for (const d of [...BASE_DOCTYPES, ...R19_IMPORTED_DOCTYPES]) {
  const add = SPEC.fields[d.name] ?? [];
  if (add.length && !d.fields.some((f) => f.fieldname === "sb_spec")) d.fields.push({ fieldname: "sb_spec", label: "Spec Details", fieldtype: "Section Break", collapsible: 1 } as DocField);
  for (const f of add) if (!d.fields.some((x) => x.fieldname === f.fieldname)) d.fields.push(stripSpec(f));
  for (const [fn, extra] of Object.entries(SPEC.options[d.name] ?? {})) {
    const f = d.fields.find((x) => x.fieldname === fn); if (!f) continue;
    const have = String(f.options ?? "").split("\n"); f.options = [...have, ...extra.filter((o) => !have.includes(o))].join("\n");
  }
  for (const [fn, props] of Object.entries(SPEC.props[d.name] ?? {})) { const f = d.fields.find((x) => x.fieldname === fn); if (f) Object.assign(f, props); }
}
AR["Spec Details"] = "تفاصيل إضافية";
/** DocTypes added by the spec merge: old-base documents restored + new department documents and child tables. */
export const SPEC_DOCTYPES: PluginDocType[] = withCompany(SPEC.doctypes.filter((d) => ![...BASE_DOCTYPES, ...R19_IMPORTED_DOCTYPES].some((b) => b.name === d.name)).map((d) => {
  const { writers, label_ar: _a, fields, ...rest } = d;
  return doc(d.name, { ...rest, fields: fields.map(stripSpec), writers: writers.map((w) => ROLE_OF[w] ?? w) });
}));
/** Department 09 (owner test list) fields neither the source nor the spec carries, and spec field properties the rules need. */
const RUN09_FIELDS: Record<string, ArField[]> = {
  "Digit Commissioning Test": [CK("critical", "Critical Test", "اختبار حرج"), S("witness_party", "Witness", "جهة الشهادة", ["Project Manager", "Consultant"]), L("defect", "Defect", "العيب", "Digit Defect", RO)],
  "Digit Defect": [L("origin_commissioning", "Commissioning Test", "اختبار التشغيل", "Digit Commissioning Test", RO)],
  "Digit Handover Requirement": [L("asset", "Asset", "الأصل", "Digit Handover Asset")],
  // round 2026-11-14 (J07 drawing → transmittal → inspection → defect): the transmittal an inspection checks the work against
  "Digit Inspection": [L("transmittal", "Transmittal", "خطاب الإرسال", "Digit Transmittal")],
  // the drawing a transmittal was raised from (Create from on the drawing), so the drawing lists its transmittals under Connections
  "Digit Transmittal": [L("drawing", "Main Drawing", "المخطط الرئيسي", "Digit Drawing")],
};
const RUN09_PROPS: Record<string, Record<string, Partial<DocField>>> = {
  "Digit Commissioning Test": { certificate: { reqd: 0, mandatory_depends_on: 'eval:doc.result=="Pass"' } },
  "Digit Handover Asset": { completeness_pct: RO, missing_required_count: RO },
  "Digit WIP Adjustment": { over_under: RO, wip_adjustment: RO, posted_unposted_status: RO },
};
for (const d of [...BASE_DOCTYPES, ...R19_IMPORTED_DOCTYPES, ...SPEC_DOCTYPES]) {
  for (const f of RUN09_FIELDS[d.name] ?? []) if (!d.fields.some((x) => x.fieldname === f.fieldname)) d.fields.push(f);
  for (const [fn, props] of Object.entries(RUN09_PROPS[d.name] ?? {})) { const f = d.fields.find((x) => x.fieldname === fn); if (f) Object.assign(f, props); }
}
export const CONSTRUCTION_DOCTYPES: PluginDocType[] = [...BASE_DOCTYPES, ...R19_IMPORTED_DOCTYPES, ...SPEC_DOCTYPES].map((d) => { const l = SRC.links[d.name]; return l?.length ? { ...d, links: l } : d; });
// workflow rows of the owner test list (spec/workflowSpec.ts): their states are workflow_state values, the two new roles
// read every app DocType and write only the documents whose workflow names them
for (const [en, ar] of Object.entries(RULING_AR)) AR[en] ??= ar;
for (const d of CONSTRUCTION_DOCTYPES) {
  // owner policy rulings P1–P9 (spec/rulingFields.ts)
  for (const f of RULING_FIELDS[d.name] ?? []) if (!d.fields.some((x) => x.fieldname === f.fieldname)) { const { label_ar, ...rest } = f; AR[f.label] ??= label_ar; d.fields = [...d.fields, rest as DocField]; }
  for (const [fn, extra] of Object.entries(RULING_OPTIONS[d.name] ?? {})) { const f = d.fields.find((x) => x.fieldname === fn); if (f) { const have = String(f.options ?? "").split("\n"); f.options = [...have, ...extra.filter((x) => !have.includes(x))].join("\n"); } }
  const ws = d.fields.find((f) => f.fieldname === "workflow_state" && f.fieldtype === "Select");
  const extra = specStates(d.name);
  if (ws && extra.length) { const have = String(ws.options ?? "").split("\n"); ws.options = [...have, ...extra.filter((x) => !have.includes(x))].join("\n"); }
  if (d.istable) continue;
  let p = [...(d.permissions ?? [])];
  for (const role of Object.values(SPEC_ROLES)) if (!p.some((x) => x.role === role)) p.push(reader(role));
  for (const role of SPEC_ROLE_WRITES[d.name] ?? []) p = p.map((x) => (x.role === role ? full(role, !!d.is_submittable) : x));
  // DEC-031 (owner ruling): a cost code is retired by setting Active = No, never deleted
  if (d.name === "Digit Cost Code") p = p.map((x) => (x.delete ? { ...x, delete: 0 } : x));
  // DEC-042 (owner ruling): only the Director records the award decision; once submitted it is immutable (no cancel)
  if (d.name === "Digit Tender Award Decision") p = p.map((x) => (x.create ? { ...x, submit: 1, cancel: 0, amend: 0 } : x));
  d.permissions = p;
}

// ------------------------------------------------------------------ Custom Fields on native documents
const cf = (dt: string, fieldname: string, label: string, ar: string, fieldtype: string, insert_after: string, x: Partial<CustomField> = {}): CustomField => { AR[label] = ar; return { dt, fieldname, label, fieldtype, insert_after, description: "DIGIT Construction", ...x }; };
const BASE_CUSTOM_FIELDS: CustomField[] = [
  cf("Project", "digit_name_en", "English Project Name", "اسم المشروع بالإنجليزية", "Data", "project_name"),
  cf("Project", "digit_contract_type", "Construction Contract Type", "نوع عقد المقاولات", "Select", "project_type", { options: "\nLump Sum\nRe-measurement\nCost Plus\nDesign & Build" }),
  cf("Project", "digit_city", "Site City", "مدينة الموقع", "Data", "digit_contract_type"),
  cf("Project", "digit_project_manager", "Construction Project Manager", "مدير مشروع المقاولات", "Link", "digit_city", { options: "Employee" }),
  cf("Project", "digit_team", "Construction Team", "فريق المشروع", "Table", "users", { options: "Digit Project Team Member" }),
  cf("Task", "digit_work_package", "Work Package", "حزمة العمل", "Link", "project", { options: "Digit Work Package", in_standard_filter: 1 }),
  cf("Task", "digit_stage", "Construction Stage", "مرحلة التنفيذ", "Link", "digit_work_package", { options: "Digit Stage Planning" }),
  cf("Task", "digit_wbs_code", "WBS Code", "رمز WBS", "Data", "digit_stage"),
  cf("Customer", "digit_customer_name_en", "English Customer Name", "اسم العميل بالإنجليزية", "Data", "customer_name"),
  cf("Material Request Item", "digit_cost_code", "Cost Code", "رمز التكلفة", "Data", "cost_center"),
  // F02-04-3: the task a material request line is for (an unreceived line is a Material constraint on the lookahead)
  cf("Material Request Item", "digit_task", "Task", "المهمة", "Link", "digit_cost_code", { options: "Task" }),
  cf("Purchase Order Item", "digit_cost_code", "Cost Code", "رمز التكلفة", "Data", "cost_center"),
  // owner ruling: budget lines are cost code × category, so purchase / invoice / journal rows may name the category they cost against
  cf("Purchase Order Item", "digit_cost_category", "Cost Category", "فئة التكلفة", "Select", "digit_cost_code", { options: "\nMaterial\nLabour\nEquipment\nSubcontract\nOverhead\nContingency" }),
  // DEC-153: optional task (same project) on purchase order and stock entry rows, like material request rows
  cf("Purchase Order Item", "digit_task", "Task", "المهمة", "Link", "digit_cost_code", { options: "Task" }),
  cf("Stock Entry Detail", "digit_task", "Task", "المهمة", "Link", "digit_cost_code", { options: "Task" }),
  cf("Purchase Invoice Item", "digit_cost_code", "Cost Code", "رمز التكلفة", "Data", "cost_center"),
  // ENT-NEED-25 (owner ruling 2026-11-14): journal expense rows carry the same cost code × category as purchase rows (custom fields only; Pro logic unchanged)
  cf("Journal Entry Account", "digit_cost_code", "Cost Code", "رمز التكلفة", "Data", "project"),
  cf("Journal Entry Account", "digit_cost_category", "Cost Category", "فئة التكلفة", "Select", "digit_cost_code", { options: "\nMaterial\nLabour\nEquipment\nSubcontract\nOverhead\nContingency" }),
  cf("Purchase Invoice Item", "digit_cost_category", "Cost Category", "فئة التكلفة", "Select", "digit_cost_code", { options: "\nMaterial\nLabour\nEquipment\nSubcontract\nOverhead\nContingency" }),
  cf("Stock Entry Detail", "digit_cost_code", "Cost Code", "رمز التكلفة", "Data", "cost_center"),
  cf("Sales Invoice", "digit_client_certificate", "Client Certificate", "شهادة العميل", "Link", "project", { options: "Digit Client Certificate", read_only: 1 }),
  cf("Purchase Invoice", "digit_subcontractor_bill", "Subcontractor Bill", "مستخلص مقاول الباطن", "Link", "project", { options: "Digit Subcontractor Bill", read_only: 1 }),
  // RPT-MGT-04: the explicit link from a follow-up assignment to the workflow decision (Workflow Comment) it follows up
  cf("ToDo", "digit_decision", "Follow-up of Decision", "متابعة للقرار", "Link", "reference_name", { options: "Comment", read_only: 1 }),
  // department 07 procurement and stores (domain/supply.ts)
  cf("Purchase Receipt Item", "digit_claim_gap", "Claim Gap", "فرق المطالبة", "Float", "digit_claimed_qty", { read_only: 1 }),
  cf("Purchase Receipt Item", "digit_rejection_reason", "Rejection Reason", "سبب الرفض", "Small Text", "rejected_qty"),
  cf("Purchase Order Item", "digit_promised_date", "Supplier Promised Date", "التاريخ الذي وعد به المورد", "Date", "schedule_date"),
  cf("Purchase Order Item", "digit_promise_accepted_by", "Promise Accepted By", "قبل الموعد", "Link", "digit_promised_date", { options: "User", read_only: 1 }),
  cf("Purchase Order Item", "digit_promise_accepted_on", "Promise Accepted On", "تاريخ قبول الموعد", "Date", "digit_promise_accepted_by", { read_only: 1 }),
  cf("Stock Entry", "digit_write_off", "Write-off", "شطب (هالك)", "Check", "stock_entry_type"),
  cf("Warehouse", "digit_project", "Project", "المشروع", "Link", "warehouse_name", { options: "Project" }),
  cf("Supplier Quotation", "digit_excluded", "Excluded from Comparison", "مستبعد من المقارنة", "Check", "supplier"),
  cf("Supplier Quotation", "digit_exclusion_reason", "Exclusion Reason", "سبب الاستبعاد", "Small Text", "digit_excluded", { depends_on: "eval:doc.digit_excluded" }),
  cf("Request for Quotation Item", "digit_cost_code", "Cost Code", "رمز التكلفة", "Data", "project_name"),
  cf("Request for Quotation", "digit_cancel_reason", "Cancellation Reason", "سبب الإلغاء", "Small Text", "transaction_date"),
  cf("Stock Entry", "digit_issue_request", "Issue Request", "طلب الصرف", "Link", "digit_reason", { options: "Digit Issue Request", read_only: 1 }),
  cf("Stock Entry Detail", "digit_issue_line", "Issue Request Line", "سطر طلب الصرف", "Data", "digit_cost_code", { read_only: 1 }),
  cf("Material Request Item", "digit_shortage_of", "Shortage Of", "نقص من طلب", "Data", "digit_task", { read_only: 1 }),
  // DEC-271: the native Expense Claim keeps its project; the only added field is the cost code on the expense line
  cf("Expense Claim Detail", "digit_cost_code", "Cost Code", "رمز التكلفة", "Data", "project"),
  // F09-14-1: the reason an order submitted over its revised budget gives (written to the override log)
  cf("Purchase Order", "digit_override_reason", "Override Reason", "سبب التجاوز", "Small Text", "schedule_date"),
  // DEC-112: who approved closing an order that still had open quantity or amount
  cf("Purchase Order", "digit_close_approved_by", "Close Approved By", "اعتمد الإغلاق", "Link", "digit_override_reason", { options: "User", read_only: 1 }),
  cf("Purchase Order", "digit_close_approved_on", "Close Approved On", "تاريخ اعتماد الإغلاق", "Date", "digit_close_approved_by", { read_only: 1 }),
  // owner round 2026-11-14: the approved budget revision an order was raised from (Create From on the revision; Connections both ways)
  cf("Purchase Order", "digit_budget_revision", "Budget Revision", "مراجعة الموازنة", "Link", "digit_close_approved_on", { options: "Digit Budget Revision" }),
];
/** Custom Fields on native DocTypes before the R19 merge. */
export const CONSTRUCTION_BASE_CUSTOM_FIELDS: CustomField[] = [...BASE_CUSTOM_FIELDS];
/** + the source snapshot's native Custom Fields this plugin did not have (Task milestone/deadline/SOV line, PO long lead…). */
const R19_CUSTOM_FIELDS: CustomField[] = [...BASE_CUSTOM_FIELDS, ...SRC.custom_fields.filter((c) => !BASE_CUSTOM_FIELDS.some((b) => b.dt === c.dt && b.fieldname === c.fieldname))];
/** Custom Fields before the owner test-list spec merge (scripts/construction-spec-schema.ts diffs against them). */
export const CONSTRUCTION_PRE_SPEC_CUSTOM_FIELDS: CustomField[] = R19_CUSTOM_FIELDS.map((c) => ({ ...c }));
export const CONSTRUCTION_CUSTOM_FIELDS: CustomField[] = [...R19_CUSTOM_FIELDS, ...SPEC.custom_fields.filter((c) => !R19_CUSTOM_FIELDS.some((b) => b.dt === c.dt && b.fieldname === c.fieldname)).map((c) => { const { label_ar, tid: _t, ...rest } = c; if (label_ar && c.label) AR[c.label] ??= label_ar; return { description: "DIGIT Construction", ...rest }; })];

/** DocType names → Arabic (sidebar/register titles). */
export const DOCTYPE_AR: Record<string, string> = {
  "Digit Project Team Member": "عضو فريق المشروع", "Digit Work Package": "حزمة عمل", "Digit Stage Planning Task": "مهمة مرحلة", "Digit Stage Delay Reason": "سبب تأخير مرحلة", "Digit Stage Planning": "تخطيط مرحلة",
  "Digit Task Dependency": "اعتمادية مهمة", "Digit WBS Node": "عقدة WBS", "Digit WBS Version": "إصدار WBS", "Digit Progress Update": "تحديث إنجاز", "Digit Site Activity Line": "بند نشاط موقع", "Digit Site Activity Report": "تقرير نشاط الموقع",
  "Digit Construction Rate History": "سجل سعر", "Digit Construction Rate": "سعر إنشائي", "Digit Assembly Component": "مكون تجميعة", "Digit Assembly": "تجميعة", "Digit Estimate Template Row": "بند قالب تقدير", "Digit Estimate Template": "قالب تقدير",
  "Digit Tender Item": "بند منافسة", "Digit Tender": "منافسة", "Digit Estimate Line": "بند تقدير", "Digit Estimate Version": "إصدار تقدير", "Digit BOQ Group": "قسم جدول كميات", "Digit BOQ Item": "بند جدول كميات", "Digit BOQ": "جدول كميات",
  "Digit Contract SOV Line": "بند جدول قيم", "Digit Contract Terms Revision": "مراجعة شروط العقد", "Digit Client Contract": "عقد عميل", "Digit Variation Line": "بند أمر تغييري", "Digit Client Variation": "أمر تغييري",
  "Digit Claim Line": "بند مطالبة", "Digit Client Claim": "مطالبة عميل", "Digit Certificate Line": "بند شهادة", "Digit Client Certificate": "شهادة دفع", "Digit Subcontractor Profile": "ملف مقاول باطن",
  "Digit Work Order Line": "بند أمر عمل", "Digit Subcontract Work Order": "أمر عمل مقاول باطن", "Digit Measurement Entry": "قيد قياس", "Digit Measurement Book": "دفتر قياس", "Digit Subcontractor Bill Line": "بند مستخلص", "Digit Subcontractor Bill": "مستخلص مقاول باطن",
  "Digit Budget Line": "بند موازنة", "Digit Project Cost Budget": "موازنة تكلفة المشروع", "Digit Budget Revision Delta": "تغيير موازنة", "Digit Issue Request": "طلب صرف مواد", "Digit Equipment Location": "موقع معدات", "Digit Site Location": "موقع بالمشروع", "Digit Issue Request Line": "بند طلب صرف", "Digit Budget Revision": "تعديل موازنة", "Digit Budget Transfer": "مناقلة موازنة", "Digit Cost Allocation": "تخصيص تكلفة", "Digit Cost Exception Review": "مراجعة استثناء تكلفة", "Digit Saved View": "عرض محفوظ", "Digit Print Artifact": "مخرج طباعة مضبوطة", "Digit Layout Item": "عنصر تخطيط", "Digit Dashboard Layout": "تخطيط لوحة",
  "Digit Forecast Line": "بند توقع", "Digit Pay Item Link": "ربط بند العقد", "Digit Actual Cost Attribution": "لقطة إسناد التكلفة الفعلية", "Digit Actual Cost Attribution Row": "صف إسناد التكلفة", "Digit Cost Forecast Snapshot": "لقطة توقع التكلفة", "Digit Cost Sheet Column": "عمود ورقة التكلفة", "Digit Cost Sheet Definition": "تعريف ورقة التكلفة", "Digit Machinery": "معدة",
  "Digit Machinery Usage": "استخدام معدة", "Digit Crew Member": "عضو طاقم", "Digit Crew": "طاقم", "Digit Field Attendance Employee": "حضور موظف", "Digit Field Attendance": "حضور ميداني", "Digit Petty Cash Fund": "عهدة نقدية",
  "Digit Site Expense": "مصروف موقع", "Digit Retention Release Request": "طلب إفراج عن محتجزات", "Digit Final Account Adjustment": "تسوية حساب ختامي", "Digit Final Account Dispute": "نزاع حساب ختامي", "Digit Final Account": "حساب ختامي",
  "Digit Closeout Assessment Row": "بند تقييم إغلاق", "Digit Closeout Assessment": "تقييم إغلاق", "Digit Cashflow Forecast Item": "بند توقع تدفق نقدي", "Digit Opening Balance": "رصيد افتتاحي", "Digit Construction Settings": "إعدادات المقاولات", "Digit Policy Decision": "قرار سياسة", "Digit Expense Account": "حساب مصروف الموقع", "Digit Mandatory Project Role": "دور إلزامي في المشروع", "Digit Match Acceptance": "قبول فرق مطابقة",
  // R19 imported DocTypes: the source translation when it has one, else the V4 document contract's Arabic title
  ...Object.fromEntries(R19_IMPORTED_DOCTYPES.map((d) => [d.name, SRC.translations[d.name] ?? SRC.doctype_ar?.[d.name] ?? d.name])),
  ...Object.fromEntries(SPEC.doctypes.map((d) => [d.name, d.label_ar || d.name])),
  // spec DocTypes the source left without an Arabic name (round 2026-11-14: printed titles and Arabic screens)
  "Digit Subcontract Retention Release Request": "طلب إفراج محتجزات مقاول الباطن", "Digit Review Workflow": "مسار المراجعة", "Digit Change RFQ": "طلب عرض سعر للتغيير",
  "Digit Adjustment Reason": "سبب التسوية", "Digit Maintenance Order": "أمر صيانة", "Digit Site Induction": "تعريف السلامة بالموقع", "Digit Work Permit": "تصريح عمل",
  "Digit WIP Adjustment": "تسوية الأعمال تحت التنفيذ", "Digit Job Snapshot": "لقطة وضع المشروع", "Digit Override Log": "سجل التجاوزات", "Digit Commissioning Test": "اختبار تشغيل",
  "Digit Handover Asset": "أصل تسليم",
};

/** EN → AR overlay for every label, option and DocType of this app (plugin translations). */
export const SCHEMA_TRANSLATIONS: Record<string, string> = { ...AR, ...OPTION_AR, ...DOCTYPE_AR };
