/**
 * digit_app_template — the generic, reversible starting point for a new DIGIT app (copy this folder, rename, register).
 * It shows every supported extension point once, on canonical ERPNext objects, with no business schema of its own:
 *  - an owned DocType with a naming series, Links to native Company / Project / Customer and a child table with Task links
 *  - a Custom Field on native Project (added on a copy of the meta; disabling restores the Original)
 *  - a declarative Server Script validation and a Client Script button (never executed as JS/Python in the browser)
 *  - a number card, a chart and a Report Builder report that read the SAME permission-scoped rows (src/lib/scope.ts)
 *  - Arabic translations
 *  - P4–P7 extension points: a Single settings DocType, a virtual manifest action and a server-declared action,
 *    a Projects department subsection, version compatibility and a plugin-owned frontend candidate (frontend/)
 * Disabled by default; enable from /plugins. Export via the Plugin Manager (src/plugins/export.ts).
 */
import { scopedList } from "@/lib/scope";
import type { PluginManifest } from "../types";

export const digitAppTemplate: PluginManifest = {
  name: "digit_app_template", title: "Digit App Template", title_ar: "قالب تطبيق ديجيت", version: "0.1.0",
  publisher: "Digit", email: "dev@example.com", license: "MIT",
  description: "Generic app scaffold: owned DocType + child table linked to native Company, Project, Customer and Task.",
  description_ar: "هيكل تطبيق عام: نوع مستند خاص وجدول فرعي مرتبطان بالشركة والمشروع والعميل والمهمة الأصلية.",
  host_app: "erpnext", module: "Digit App Template", required_apps: ["frappe", "erpnext"],
  source_application: { name: 'digit_app_template', namespace: 'digit_app_template', version: '0.1.0', host_app: 'erpnext', optional: true,
    dependencies: [{ name: 'frappe', optional: false }, { name: 'erpnext', optional: false }], execution: 'VIRTUAL_PARTIAL',
    commit: null, commit_status: 'UNKNOWN', owned_doctypes: ['Template Work Log', 'Template Work Log Entry'],
    frontend_routes: ['/app/template-work-board'], provenance_references: ['src/plugins/_template/index.ts'] },
  compatibility: { frappe: ">=17.0.0-dev,<18.0.0", erpnext: "^17.0.0-dev" },
  roles: ["Template User"],
  doctypes: [
    { name: "Template Work Log Entry", istable: 1, module: "Digit App Template", permissions: [],
      fields: [
        { fieldname: "description", label: "Description", fieldtype: "Data", reqd: 1, in_list_view: 1 },
        { fieldname: "task", label: "Task", fieldtype: "Link", options: "Task", in_list_view: 1 },
        { fieldname: "hours", label: "Hours", fieldtype: "Float", in_list_view: 1 },
      ] },
    { name: "Template Work Log", module: "Digit App Template", autoname: "TWL-.YYYY.-.#####", naming_rule: "Expression (old style)", title_field: "title", track_changes: 1,
      permissions: [
        { role: "System Manager", read: 1, write: 1, create: 1, delete: 1, report: 1, export: 1 },
        { role: "Template User", read: 1, write: 1, create: 1, report: 1 },
      ],
      fields: [
        { fieldname: "title", label: "Title", fieldtype: "Data", reqd: 1, in_list_view: 1 },
        { fieldname: "company", label: "Company", fieldtype: "Link", options: "Company", reqd: 1, in_list_view: 1, in_standard_filter: 1 },
        { fieldname: "project", label: "Project", fieldtype: "Link", options: "Project", in_list_view: 1, in_standard_filter: 1 },
        { fieldname: "customer", label: "Customer", fieldtype: "Link", options: "Customer" },
        { fieldname: "column_break_1", fieldtype: "Column Break" },
        { fieldname: "status", label: "Status", fieldtype: "Select", options: "Open\nDone", default: "Open", in_list_view: 1, in_standard_filter: 1 },
        { fieldname: "log_date", label: "Log Date", fieldtype: "Date" },
        { fieldname: "planned_hours", label: "Planned Hours", fieldtype: "Float", in_list_view: 1 },
        { fieldname: "actual_duration", label: "Actual Duration", fieldtype: "Duration", hide_seconds: 1 },
        { fieldname: "quality_rating", label: "Quality Rating", fieldtype: "Rating", options: "5" },
        { fieldname: "section_entries", fieldtype: "Section Break", label: "Entries" },
        { fieldname: "entries", label: "Entries", fieldtype: "Table", options: "Template Work Log Entry" },
      ],
      controller: `import frappe\nfrom frappe import _\nfrom frappe.model.document import Document\n\n\nclass TemplateWorkLog(Document):\n\tdef validate(self):\n\t\tif (self.planned_hours or 0) < 0:\n\t\t\tfrappe.throw(_("Planned Hours cannot be negative"))\n` },
    { name: "Template Settings", module: "Digit App Template", issingle: 1, track_changes: 1,
      permissions: [{ role: "System Manager", read: 1, write: 1, create: 1 }, { role: "Template User", read: 1 }],
      fields: [
        { fieldname: "default_status", label: "Default Status", fieldtype: "Select", options: "Open\nDone", default: "Open" },
        { fieldname: "max_planned_hours", label: "Max Planned Hours", fieldtype: "Float", description: "Informational limit shown to users" },
      ] },
  ],
  actions: [
    { name: "reopen", doctype: "Template Work Log", label: "Reopen", label_ar: "إعادة فتح", kind: "virtual", condition: "doc.status == 'Done'", permission: "write",
      effect: { type: "set_value", values: { status: "'Open'" } }, description: "Sets the work log back to Open", reversal: "Mark Done" },
    { name: "recalculate_hours", doctype: "Template Work Log", label: "Recalculate Hours", label_ar: "إعادة احتساب الساعات", kind: "server", permission: "write",
      server_method: "recalculate_hours", description: "Sums timesheet hours on the server (requires the DIGIT server)" },
  ],
  settings: [{ name: "template_settings", doctype: "Template Settings", label: "Template Settings", label_ar: "إعدادات القالب", description: "Defaults for Template Work Log" }],
  department_sections: [{ department: "projects", label: "Template work logs", label_ar: "سجلات عمل القالب", doctypes: ["Template Work Log", "Template Settings"], reports: ["Template Work Log Summary"] }],
  frontend: { framework: "react", strategy: "desk_page", route: "template-work-board", entry: "WorkLogBoard.tsx",
    dependencies: { react: "^19.0.0", "react-dom": "^19.0.0" }, build_command: "vite build", output_dir: "digit_app_template/public/frontend",
    routes: [{ path: "/app/template-work-board", component: "WorkLogBoard" }] },
  custom_fields: [
    { dt: "Project", fieldname: "template_tag", label: "Template Tag", fieldtype: "Data", insert_after: "project_name", description: "Added by digit_app_template" },
  ],
  server_scripts: [
    { name: "Template Work Log Validate", script_type: "DocType Event", reference_doctype: "Template Work Log", doctype_event: "Before Save",
      validate: [{ condition: "doc.planned_hours < 0", message: "Planned Hours cannot be negative" }],
      script: `if (doc.planned_hours or 0) < 0:\n    frappe.throw(_("Planned Hours cannot be negative"))\n` },
  ],
  client_scripts: [
    { name: "Template Work Log Form", dt: "Template Work Log", view: "Form",
      buttons: [{ label: "Mark Done", label_ar: "تعليم كمنجز", condition: "doc.status == 'Open'", action: { type: "set_value", values: { status: "'Done'" } } }],
      script: `frappe.ui.form.on("Template Work Log", {\n\trefresh(frm) {\n\t\tif (frm.doc.status === "Open") frm.add_custom_button(__("Mark Done"), () => frm.set_value("status", "Done"));\n\t},\n});\n` },
  ],
  number_cards: [
    { name: "Open Work Logs", label: "Open Work Logs", document_type: "Template Work Log", function: "Count", filters: [["Template Work Log", "status", "=", "Open"]] },
    { name: "Planned Hours", label: "Planned Hours", document_type: "Template Work Log", function: "Sum", aggregate_function_based_on: "planned_hours", filters: [] },
  ],
  dashboard_charts: [
    { name: "Work Logs by Status", chart_name: "Work Logs by Status", chart_type: "Group By", document_type: "Template Work Log", group_by_based_on: "status", type: "Bar", filters: [] },
  ],
  reports: [
    { name: "Template Work Log Summary", ref_doctype: "Template Work Log", report_type: "Report Builder",
      columns: [
        { fieldname: "name", label: "ID", fieldtype: "Link", options: "Template Work Log" },
        { fieldname: "title", label: "Title", fieldtype: "Data" },
        { fieldname: "company", label: "Company", fieldtype: "Link", options: "Company" },
        { fieldname: "project", label: "Project", fieldtype: "Link", options: "Project" },
        { fieldname: "status", label: "Status", fieldtype: "Data" },
        { fieldname: "planned_hours", label: "Planned Hours", fieldtype: "Float" },
      ],
      filters: [{ fieldname: "status", label: "Status", fieldtype: "Select", options: "Open\nDone" }],
      // same scoped rows as the list and the number cards
      run: (f) => scopedList("Template Work Log").filter((d) => !f["status"] || d["status"] === f["status"]).map((d) => ({ name: d.name, title: d["title"], company: d["company"], project: d["project"], status: d["status"], planned_hours: d["planned_hours"] })) },
  ],
  workspaces: [{ name: "Digit App Template", label: "Digit App Template", module: "Digit App Template", number_cards: ["Open Work Logs", "Planned Hours"], charts: ["Work Logs by Status"],
    shortcuts: [{ label: "Template Work Log", type: "DocType", link_to: "Template Work Log" }, { label: "Project", type: "DocType", link_to: "Project" }, { label: "Template Work Log Summary", type: "Report", link_to: "Template Work Log Summary" }] }],
  translations: {
    "Digit App Template": "قالب تطبيق ديجيت", "Template Work Log": "سجل عمل القالب", "Template Work Log Entry": "بند سجل عمل القالب",
    "Template Work Log Summary": "ملخص سجلات عمل القالب", "Open Work Logs": "سجلات العمل المفتوحة", "Planned Hours": "الساعات المخططة",
    "Work Logs by Status": "سجلات العمل حسب الحالة", "Template Tag": "وسم القالب", "Log Date": "تاريخ السجل", "Mark Done": "تعليم كمنجز",
    "Planned Hours cannot be negative": "لا يمكن أن تكون الساعات المخططة سالبة", "Entries": "البنود", "Done": "منجز", "Hours": "الساعات",
    "Actual Duration": "المدة الفعلية", "Quality Rating": "تقييم الجودة", "Template Settings": "إعدادات القالب", "Default Status": "الحالة الافتراضية",
    "Max Planned Hours": "الحد الأقصى للساعات المخططة", "Informational limit shown to users": "حد إرشادي يظهر للمستخدمين", "Reopen": "إعادة فتح",
    "Recalculate Hours": "إعادة احتساب الساعات", "Template work logs": "سجلات عمل القالب", "Defaults for Template Work Log": "القيم الافتراضية لسجل عمل القالب",
  },
};
