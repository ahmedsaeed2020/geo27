/**
 * digit_hr — DIGIT HR / HCM app (W1 vertical slice). Reuses canonical HRMS/ERPNext records (Employee, Leave Application,
 * Attendance, Salary Slip, Identification Document Type). Owns ONE proposed DocType, `DIGIT Document Renewal`, because the
 * frozen source has no employee document/expiry DocType (only Employee.passport_number/valid_upto and
 * Identification Document Type). Enabled once per clean browser (default_enabled); no sample fixtures. Payroll/GL is untouched.
 */
import type { PluginManifest } from "../types";
import { V8_DOCTYPES, V8_SCRIPTS, V8_AR } from "./v8/doctypes";
import { R9_DOCTYPES, DSC_SERVICE_ITEM_FIELD } from "./r9/doctypes";
import { R9_AR } from "./r9/ar";
import { POLICY_AR, POLICY_DOCTYPE, POLICY_RULES } from "./product/settings";
import { REPORT_AR } from "./product/reportLabels";
import { HR_PRINT_FORMATS, PRINT_AR } from "./product/prints";
import { R10_DOCTYPES, R10_SCRIPTS, R10_WORKFLOWS, R10_PRINTS, R10_CUSTOM, withOwnedFields } from "./r10/doctypes";
import { R10_EXTRA_PRINTS } from "./r10/prints";
import { R10_HOOK_SCRIPTS } from "./r10/hookScripts";
import { ACCOUNT_NEED_AR, ACCOUNT_NEED_FIELDS, ACCOUNT_NEED_SCRIPT } from "./accountNeedSpec";
import { R10_TRANSLATIONS } from "./r10/ar";
import { HR_ROLE_NAMES, HR_ROLE_AR } from "./r10/roles";
import { R10_NATIVE_DOCPERMS, withMatrixPerms } from "./r10/nativePerms";
/** Employee salary and bank fields readable only at permission level 1 (HR roles). */
export const SENSITIVE_EMPLOYEE_FIELDS = ["ctc", "salary_currency", "salary_mode", "bank_name", "bank_ac_no", "iban"];

const PERMS = [
  { role: "HR Manager", read: 1, write: 1, create: 1, delete: 1, report: 1, export: 1, print: 1, share: 1 },
  { role: "HR User", read: 1, write: 1, create: 1, report: 1, print: 1 },
];

export const DDR = "DIGIT Document Renewal";
export const DSC = "DIGIT HR Service Case";

/** Employees create/read/update only their own service cases (source DocPerm if_owner; passed through to session.ts unchanged). */
const EMPLOYEE_OWN_CASES = { role: "Employee", read: 1, write: 1, create: 1, if_owner: 1 };
export const digitHr: PluginManifest = {
  name: "digit_hr", title: "DIGIT HR", title_ar: "ديجيت للموارد البشرية", version: "0.1.0",
  publisher: "Digit", email: "apps@digit.example", license: "MIT",
  description: "DIGIT HR / HCM W1: employee directory, Employee 360 and permission-scoped document renewal on canonical DIGIT HR records.",
  description_ar: "ديجيت للموارد البشرية (المرحلة الأولى): دليل الموظفين، ملف الموظف 360، وتجديد الوثائق ضمن الصلاحيات على سجلات الموارد البشرية الأصلية.",
  host_app: "hrms", module: "DIGIT HR", required_apps: ["frappe", "erpnext", "hrms"],
  // HR round 2 (ruling 3): every role the definition names, with the section permission matrix (r10/roles.ts)
  roles: [...new Set(["HR Manager", "HR User", ...HR_ROLE_NAMES])],
  // No `fixtures`: the snapshot's preview sample rows (sampleRecords.ts) are never installed automatically in the Final
  // Core; they remain available to tests only. Enabled once per clean browser; the Plugin Manager keeps the choice.
  default_enabled: true,
  // App experience: while DIGIT HR is the active app, Core Home "/" opens Mission Control and native screens keep the
  // HR navigation (experience slots in ./slots.tsx).
  experience: { home: "/digit-hr" },
  doctypes: withMatrixPerms(withOwnedFields([{
    name: DDR, module: "DIGIT HR", autoname: "format:DDR-{YYYY}-{#####}", naming_rule: "Expression", title_field: "employee_name", track_changes: 1,
    search_fields: "employee_name,document_number",
    fields: [
      { fieldname: "employee", fieldtype: "Link", label: "Employee", options: "Employee", reqd: 1, in_list_view: 1, in_standard_filter: 1 },
      { fieldname: "employee_name", fieldtype: "Data", label: "Employee Name", fetch_from: "employee.employee_name", read_only: 1, in_list_view: 1 },
      { fieldname: "company", fieldtype: "Link", label: "Company", options: "Company", fetch_from: "employee.company", read_only: 1, reqd: 1, in_standard_filter: 1 },
      { fieldname: "column_break_1", fieldtype: "Column Break" },
      { fieldname: "document_type", fieldtype: "Link", label: "Document Type", options: "Identification Document Type", reqd: 1, in_list_view: 1 },
      { fieldname: "document_number", fieldtype: "Data", label: "Document Number", reqd: 1 },
      { fieldname: "section_dates", fieldtype: "Section Break", label: "Validity" },
      { fieldname: "issue_date", fieldtype: "Date", label: "Issue Date", reqd: 1 },
      { fieldname: "expiry_date", fieldtype: "Date", label: "Expiry Date", reqd: 1, in_list_view: 1 },
      { fieldname: "status", fieldtype: "Select", label: "Status", options: "Valid\nExpiring\nExpired\nRenewed", default: "Valid", in_list_view: 1, in_standard_filter: 1 },
      { fieldname: "renewal_of", fieldtype: "Link", label: "Renewal Of", options: DDR, read_only: 1 },
      { fieldname: "section_file", fieldtype: "Section Break", label: "Attachment" },
      { fieldname: "is_private", fieldtype: "Check", label: "Private Attachment", default: "1" },
      { fieldname: "attachment", fieldtype: "Attach", label: "Attachment" },
      { fieldname: "notes", fieldtype: "Small Text", label: "Notes" },
    ],
    permissions: [...PERMS,{role:'Employee',read:1}],
    controller: `import frappe\nfrom frappe import _\nfrom frappe.model.document import Document\nfrom frappe.utils import getdate, nowdate, date_diff\n\n\nclass DIGITDocumentRenewal(Document):\n\tdef validate(self):\n\t\tif getdate(self.expiry_date) <= getdate(self.issue_date):\n\t\t\tfrappe.throw(_("Expiry Date must be after Issue Date"))\n\t\tself.company = frappe.db.get_value("Employee", self.employee, "company")\n\t\tif self.status != "Renewed":\n\t\t\tdays = date_diff(self.expiry_date, nowdate())\n\t\t\tself.status = "Expired" if days < 0 else ("Expiring" if days <= 30 else "Valid")\n`,
  }, {
    name: DSC, module: "DIGIT HR", autoname: "format:DSC-{YYYY}-{#####}", naming_rule: "Expression", title_field: "subject", track_changes: 1,
    search_fields: "employee_name,subject,category",
    fields: [
      { fieldname: "subject", fieldtype: "Data", label: "Subject", reqd: 1, in_list_view: 1 },
      { fieldname: "employee", fieldtype: "Link", label: "Employee", options: "Employee", reqd: 1, in_list_view: 1, in_standard_filter: 1 },
      { fieldname: "employee_name", fieldtype: "Data", label: "Employee Name", fetch_from: "employee.employee_name", read_only: 1 },
      { fieldname: "company", fieldtype: "Link", label: "Company", options: "Company", fetch_from: "employee.company", read_only: 1, in_standard_filter: 1 },
      { fieldname: "column_break_sc1", fieldtype: "Column Break" },
      { fieldname: "category", fieldtype: "Select", label: "Category", options: "\nHR Letter\nPayroll Query\nLeave Query\nDocument Request\nIT & Access\nConfidential", reqd: 1, in_list_view: 1, in_standard_filter: 1 },
      // POR-03 (owner-approved HR R9, 2026-11-10): the catalog service the case was opened from — digit_hr_service_case.json, after category
      DSC_SERVICE_ITEM_FIELD,
      { fieldname: "severity", fieldtype: "Select", label: "Severity", options: "Low\nMedium\nHigh\nCritical", default: "Medium" },
      { fieldname: "case_status", fieldtype: "Select", label: "Case Status", options: "Open\nAssigned\nIn Progress\nResolved\nClosed", default: "Open", in_list_view: 1, in_standard_filter: 1, read_only: 1 },
      { fieldname: "section_sla", fieldtype: "Section Break", label: "Handling" },
      { fieldname: "opened_on", fieldtype: "Datetime", label: "Opened On", default: "Now" },
      { fieldname: "due_at", fieldtype: "Datetime", label: "Due At" },
      { fieldname: "column_break_sc2", fieldtype: "Column Break" },
      { fieldname: "assigned_to", fieldtype: "Link", label: "Assigned To", options: "User" },
      { fieldname: "grievance", fieldtype: "Link", label: "Related Grievance", options: "Employee Grievance" },
      { fieldname: "section_res", fieldtype: "Section Break", label: "Resolution" },
      { fieldname: "description", fieldtype: "Text", label: "Description" },
      { fieldname: "resolution_notes", fieldtype: "Text", label: "Resolution Notes" },
      { fieldname: "private_attachment", fieldtype: "Attach", label: "Private Attachment" },
    ],
    permissions: [...PERMS, EMPLOYEE_OWN_CASES],
    controller: `import frappe\nfrom frappe import _\nfrom frappe.model.document import Document\nfrom frappe.utils import get_datetime\n\n\nclass DIGITHRServiceCase(Document):\n\tdef validate(self):\n\t\tif self.due_at and self.opened_on and get_datetime(self.due_at) < get_datetime(self.opened_on):\n\t\t\tfrappe.throw(_("Due At cannot be before Opened On"))\n\t\tif self.case_status in ("Assigned", "In Progress") and not self.assigned_to:\n\t\t\tfrappe.throw(_("Assign the case to a handler first"))\n\t\tif self.case_status in ("Resolved", "Closed") and not self.resolution_notes:\n\t\t\tfrappe.throw(_("Resolution Notes are required to resolve a case"))\n`,
  }, ...(V8_DOCTYPES as unknown as NonNullable<PluginManifest["doctypes"]>), ...R9_DOCTYPES, POLICY_DOCTYPE as unknown as NonNullable<PluginManifest["doctypes"]>[number], ...R10_DOCTYPES])),
  // HR round 2: data-model changes on native DocTypes (Company registration numbers, geofence, position links, …)
  // DEC-015: «يحتاج حساب مستخدم» on Employee (blank = default rule; Python twin fills it on save)
  custom_fields: [...R10_CUSTOM, ...ACCOUNT_NEED_FIELDS],
  server_scripts: [...(V8_SCRIPTS as unknown as NonNullable<PluginManifest["server_scripts"]>), ...R10_SCRIPTS, ...R10_HOOK_SCRIPTS, ACCOUNT_NEED_SCRIPT, ...POLICY_RULES.map(([dt, condition, message]) => ({ name: `${dt} Validate: ${message}`, script_type: "DocType Event" as const, reference_doctype: dt, doctype_event: "Before Save" as const, validate: [{ condition, message }], script: "" })), {
    name: "DIGIT HR Service Case Validate", script_type: "DocType Event", reference_doctype: DSC, doctype_event: "Before Save",
    validate: [
      { condition: "doc.due_at && doc.opened_on && doc.due_at < doc.opened_on", message: "Due At cannot be before Opened On" },
      { condition: "(doc.case_status == 'Assigned' || doc.case_status == 'In Progress') && !doc.assigned_to", message: "Assign the case to a handler first" },
      { condition: "(doc.case_status == 'Resolved' || doc.case_status == 'Closed') && !doc.resolution_notes", message: "Resolution Notes are required to resolve a case" },
    ],
    script: `if doc.case_status in ("Resolved", "Closed") and not doc.resolution_notes:\n    frappe.throw(_("Resolution Notes are required to resolve a case"))\n`,
  }],
  workflows: [...R10_WORKFLOWS, {
    name: "DIGIT HR Service Case Flow", document_type: DSC, workflow_state_field: "case_status", is_active: 1,
    states: ["Open", "Assigned", "In Progress", "Resolved", "Closed"].map((state) => ({ state, doc_status: "0" as const, allow_edit: state === "Closed" ? "HR Manager" : "HR User" })),
    transitions: [
      { state: "Open", action: "Assign", next_state: "Assigned", allowed: "HR User" },
      { state: "Assigned", action: "Start", next_state: "In Progress", allowed: "HR User" },
      { state: "In Progress", action: "Resolve", next_state: "Resolved", allowed: "HR User" },
      { state: "Resolved", action: "Reopen", next_state: "In Progress", allowed: "HR User" },
      { state: "Resolved", action: "Close", next_state: "Closed", allowed: "HR Manager" },
    ],
  }],
  reports: [{
    name: "DIGIT Service Case Register", ref_doctype: DSC, report_type: "Report Builder",
    columns: [
      { fieldname: "name", label: "ID", fieldtype: "Link", options: DSC }, { fieldname: "employee_name", label: "Employee Name", fieldtype: "Data" },
      { fieldname: "category", label: "Category", fieldtype: "Data" }, { fieldname: "severity", label: "Severity", fieldtype: "Data" },
      { fieldname: "case_status", label: "Case Status", fieldtype: "Data" }, { fieldname: "due_at", label: "Due At", fieldtype: "Datetime" },
    ],
  }, {
    name: "DIGIT Document Expiry", ref_doctype: DDR, report_type: "Report Builder",
    columns: [
      { fieldname: "name", label: "ID", fieldtype: "Link", options: DDR }, { fieldname: "employee_name", label: "Employee Name", fieldtype: "Data" },
      { fieldname: "document_type", label: "Document Type", fieldtype: "Data" }, { fieldname: "expiry_date", label: "Expiry Date", fieldtype: "Date" },
      { fieldname: "status", label: "Status", fieldtype: "Data" },
    ],
  }],
  print_formats: [...HR_PRINT_FORMATS, ...R10_PRINTS, ...R10_EXTRA_PRINTS],
  // SEC-03 / DM-SEC-03: salary and bank fields of Employee at permission level 1, readable only by HR roles (managers see the rest of their team's record)
  property_setters: [...SENSITIVE_EMPLOYEE_FIELDS.map((f) => ({ doc_type: "Employee", doctype_or_field: "DocField" as const, field_name: f, property: "permlevel", value: "1", property_type: "Int" })),
    // GAP-14: overtime slips on by default (best practice), so approved overtime reaches payroll; HR can switch it off
    { doc_type: "Payroll Settings", doctype_or_field: "DocField" as const, field_name: "create_overtime_slip", property: "default", value: "1", property_type: "Check" }],
  docperms: [{ parent: "Employee", role: "HR Manager", permlevel: 1, read: 1, write: 1 }, { parent: "Employee", role: "HR User", permlevel: 1, read: 1, write: 1 }, ...R10_NATIVE_DOCPERMS],
  translations: {
    // HR round 2 Arabic first: every existing HR wording below keeps precedence
    ...R10_TRANSLATIONS, ...HR_ROLE_AR, ...ACCOUNT_NEED_AR,
    // HR R9 Arabic from the app's own translations/ar.csv; the existing DIGIT HR wording below keeps precedence
    ...R9_AR,
    "Assign the case to a handler first": "أسند الحالة إلى مسؤول معالجة أولاً", "Resolution Notes are required to resolve a case": "ملاحظات الحل مطلوبة لتسجيل حل الحالة",
    [DDR]: "تجديد وثيقة ديجيت", "Document Type": "نوع الوثيقة", "Document Number": "رقم الوثيقة", "Issue Date": "تاريخ الإصدار",
    "Expiry Date": "تاريخ الانتهاء", "Renewal Of": "تجديد لـ", "Private Attachment": "مرفق خاص", Validity: "الصلاحية",
    Expiring: "قارب على الانتهاء", [DSC]: "حالة خدمة الموارد البشرية", "DIGIT Service Case Register": "سجل حالات الخدمة", Subject: "الموضوع", Category: "الفئة", Severity: "الأهمية", "Case Status": "حالة الطلب", "Opened On": "تاريخ الفتح", "Due At": "موعد الاستحقاق", "Assigned To": "مسند إلى", "Related Grievance": "التظلم المرتبط", Handling: "المعالجة", Resolution: "الحل", "Resolution Notes": "ملاحظات الحل", "HR Letter": "خطاب موارد بشرية", "Payroll Query": "استفسار رواتب", "Leave Query": "استفسار إجازات", "Document Request": "طلب مستند", "IT & Access": "تقنية وصلاحيات", Confidential: "سري", Assigned: "مُسند", "In Progress": "قيد المعالجة", Resolved: "تم الحل", Closed: "مغلق", Assign: "إسناد", Start: "بدء", Resolve: "حل", Reopen: "إعادة فتح", Close: "إغلاق", Critical: "حرج", Renewed: "مُجدّد", "DIGIT Document Expiry": "انتهاء وثائق ديجيت", ...V8_AR, ...POLICY_AR, ...REPORT_AR, ...PRINT_AR,
  },
};
