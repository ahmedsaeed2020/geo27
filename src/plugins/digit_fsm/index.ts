import { VISIT_DT } from "@/plugins/digit_fsm/schema";
/**
 * digit_fsm — DIGIT FSM + ITM as the fifth additive Virtual Core app (owner goal 2026-10-21, kit
 * DIGIT_FSM_ITM_LOVABLE_REMIX_BUILD_KIT_2026-10-21). One product: field service management + inspection, testing &
 * maintenance, with Fire & Life Safety as the first trade pack. Native Customer / Contact / Item / Employee / Supplier /
 * Issue / Quotation / Material Request / Stock Entry / Timesheet / Sales Invoice are reused; FSM objects are app
 * DocTypes linked to them (docs/digit_fsm/FIT_GAP.csv). Navigation and the screen coverage register derive from ONE
 * table (screens.ts). Hooks and the demo installer load from boot.ts (src/plugins/builtinBoot.ts), never from this
 * manifest, so the manifest stays import-cycle free. Disabling hides the overlay and never deletes records.
 */
import type { PluginManifest, PluginNavGroup, PluginPage, PluginReport } from "../types";
import { FSM_VISIT_PERMISSIONS, FSM_CUSTOM_FIELDS, FSM_DOCTYPES, FSM_MODULE, FSM_ROLES, FSM_TRANSLATIONS } from "./schema";
import { ACTION_AR, FSM_WORKFLOWS } from "./workflows";
import { FSM_CROSS_LINKS, FSM_DESTINATIONS, FSM_EXPERIENCES, FSM_MODULES, groupScreens, screenById, type FsmScreen } from "./screens";
import { FSM_REPORTS } from "./domain/reports";

export const FSM_APP = "digit_fsm";
export const FSM_PAGES: PluginPage[] = [
  { path: "", component: "home", label: "My work", label_ar: "عملي" },
  { path: "executive", component: "executive", label: "Executive overview", label_ar: "النظرة التنفيذية" },
  { path: "operations", component: "operations", label: "Operations control", label_ar: "مركز التحكم بالعمليات" },
  { path: "sites", component: "sites", label: "Service sites", label_ar: "مواقع الخدمة" },
  { path: "site/:id", component: "site360", label: "Site 360", label_ar: "الموقع 360" },
  { path: "device/:id", component: "device360", label: "Device 360", label_ar: "الجهاز 360" },
  { path: "agreement/:id", component: "agreement360", label: "Agreement 360", label_ar: "الاتفاقية 360" },
  { path: "job/:id", component: "job360", label: "Job 360", label_ar: "أمر العمل 360" },
  { path: "deficiency/:id", component: "deficiency360", label: "Deficiency 360", label_ar: "الملاحظة 360" },
  { path: "technician/:id", component: "technician360", label: "Technician 360", label_ar: "الفني 360" },
  { path: "report-preview/:id", component: "reportPreview", label: "Customer inspection report", label_ar: "تقرير الفحص للعميل" },
  { path: "run/:id", component: "run", label: "Inspection run", label_ar: "تشغيل الفحص" },
  { path: "dispatch", component: "dispatch", label: "Dispatch board", label_ar: "لوحة الجدولة" },
  { path: "list/:doctype", component: "register", label: "Register", label_ar: "السجل" },
  { path: "emergency", component: "emergency", label: "Emergency triage", label_ar: "فرز الطوارئ" },
  { path: "queue/:key", component: "queue", label: "Work queue", label_ar: "طابور العمل" },
  { path: "my/:key", component: "my", label: "My field work", label_ar: "عملي الميداني" },
  { path: "reports", component: "reports", label: "Dashboard & report catalogue", label_ar: "دليل اللوحات والتقارير" },
  { path: "reports/:id", component: "report", label: "Report", label_ar: "تقرير" },
  { path: "config/:key", component: "config", label: "Configuration", label_ar: "التهيئة" },
  { path: "portal/:key", component: "portal", label: "Customer portal preview", label_ar: "معاينة بوابة العميل" },
  { path: "portal", component: "portalHub", label: "Customer portal (staff preview)", label_ar: "بوابة العميل (معاينة للموظفين)" },
  { path: "field/day", component: "fieldDay", label: "My day", label_ar: "يومي" },
  { path: "field/visit/:id", component: "fieldVisit", label: "Field visit", label_ar: "الزيارة الميدانية" },
  { path: "field/offline", component: "fieldOffline", label: "Offline queue & recovery", label_ar: "طابور العمل دون اتصال والاسترداد" },
  { path: "field", component: "fieldHub", label: "Technician workspace", label_ar: "مساحة الفني الميدانية" },
  { path: "deferred/:key", component: "deferred", label: "Server-required capability", label_ar: "قدرة تتطلب الخادم" },
  { path: "modules/:key", component: "moduleDirectory", label: "Group workspace", label_ar: "مساحة المجموعة" },
  { path: "ws/:key", component: "destination", label: "Workspace", label_ar: "مساحة العمل" },
  { path: "ops-center", component: "opsCenter", label: "Service manager centre", label_ar: "مركز مدير الخدمة" },
  { path: "visits", component: "visits", label: "Visits portfolio", label_ar: "محفظة الزيارات" },
  { path: "visits/:view", component: "visits", label: "Visits portfolio", label_ar: "محفظة الزيارات" },
  { path: "visit/:id", component: "visit360", label: "Visit 360", label_ar: "الزيارة 360" },
  { path: "technicians", component: "technicians", label: "Team & technicians", label_ar: "الفريق والفنيون" },
  { path: "site-explorer", component: "siteExplorer", label: "Site explorer", label_ar: "مستكشف المواقع" },
];

/**
 * Three-level navigation (owner low-credit goal 2026-10-21 14:29): nine rail groups (screens.ts FSM_MODULES); the
 * context sidebar of a group lists only its WORKSPACE DESTINATIONS (FSM_DESTINATIONS, featured; the first one is what
 * the rail opens). Every N/P/X screen stays a non-featured navigation item of its group, so deep links, the "All …"
 * directory (modules/<key>) and the crosswalk keep working without being sidebar entries; Home also keeps the two
 * separate experiences (technician workspace, portal preview hub) and cross-links stay reachable in the directory.
 */
const navItem = (s: FsmScreen) => ({ label: s.label, label_ar: s.label_ar, to: s.to });
export const FSM_NAV: PluginNavGroup[] = FSM_MODULES.map((m) => {
  const dests = FSM_DESTINATIONS.filter((d) => d.group === m.key);
  const taken = new Set(dests.map((d) => d.to));
  return {
    key: m.key, label: m.label, label_ar: m.label_ar, short: m.short, short_ar: m.short_ar, icon: m.icon, directory: `modules/${m.key.toLowerCase()}`, ...(m.match ? { match: m.match } : {}),
    items: [
      ...dests.map((d) => ({ label: d.label, label_ar: d.label_ar, to: d.to, featured: true })),
      ...groupScreens(m.key).filter((s) => !taken.has(s.to)).map(navItem),
      ...(m.key === "HOME" ? FSM_EXPERIENCES.map((x) => ({ label: x.label, label_ar: x.label_ar, to: x.to })) : []),
      ...(FSM_CROSS_LINKS[m.key] ?? []).map((id) => screenById(id)).filter((s): s is FsmScreen => !!s).map(navItem),
    ],
  };
});

/** Report Builder definitions for the Frappe export; the virtual run() is the same function the app's report page uses. */
export const FSM_PLUGIN_REPORTS: PluginReport[] = FSM_REPORTS.map((r) => ({
  name: `FSM ${r.id} ${r.title}`, ref_doctype: r.ref_doctype, report_type: "Script Report",
  columns: r.columns.map((c) => ({ fieldname: c.fieldname, label: c.label, fieldtype: c.fieldtype === "Percent" ? "Percent" : c.fieldtype, ...(c.options ? { options: c.options } : {}) })),
  filters: r.filters.map((k) => ({ fieldname: String(k), label: String(k).replace(/_/g, " "), fieldtype: k === "from" || k === "to" || k === "as_of" ? "Date" : "Data" })),
  script: `# SERVER_OR_STAGING_REQUIRED: port of src/plugins/digit_fsm/domain/reports.ts ${r.id} (grain: ${r.grain}).\ndef execute(filters=None):\n    raise NotImplementedError("${r.id} must be implemented in digit_fsm/report before staging")\n`,
  run: (f) => r.run(f as Record<string, string>),
}));

export const digitFsm: PluginManifest = {
  name: FSM_APP, title: "DIGIT FSM + ITM", title_ar: "ديجيت للخدمات الميدانية والفحص", version: "0.1.0-virtual", publisher: "Digit", email: "dev@example.com", license: "Proprietary",
  description: "Field service management with inspection, testing & maintenance: sites, systems and devices; agreements and recurring obligations; jobs, visits and dispatch; inspection runs, findings, quotes, repairs and retests; Fire & Life Safety trade pack.",
  description_ar: "إدارة الخدمات الميدانية مع الفحص والاختبار والصيانة: المواقع والأنظمة والأجهزة؛ العقود والالتزامات الدورية؛ أوامر العمل والزيارات والجدولة؛ تشغيلات الفحص والملاحظات والعروض والإصلاحات وإعادة الفحص؛ حزمة السلامة من الحريق.",
  host_app: "erpnext", module: FSM_MODULE, required_apps: ["frappe", "erpnext"],
  source_application: { name: FSM_APP, namespace: FSM_APP, version: "0.1.0-virtual", host_app: "erpnext", optional: true, dependencies: [{ name: "frappe", optional: false }, { name: "erpnext", optional: false }], execution: "VIRTUAL_PARTIAL",
    commit: "", commit_status: "NEW_APP_IN_THIS_REMIX", owned_doctypes: FSM_DOCTYPES.map((d) => d.name), frontend_routes: FSM_PAGES.map((p) => `/plugins/${FSM_APP}/${p.path}`), provenance_references: ["DIGIT_FSM_ITM_LOVABLE_REMIX_BUILD_KIT_2026-10-21.zip", "docs/digit_fsm/FIT_GAP.csv"] } as never,
  source_references: { screens: "src/plugins/digit_fsm/screens.ts (N01–N88, P01–P08)", fit_gap: "docs/digit_fsm/FIT_GAP.csv", kit: "DIGIT_FSM_ITM_LOVABLE_REMIX_BUILD_KIT_2026-10-21" },
  compatibility: { frappe: ">=17.0.0-dev,<18.0.0", erpnext: "^17.0.0-dev" },
  docperms: FSM_VISIT_PERMISSIONS.map(p => ({ ...p, parent: VISIT_DT, permlevel: 0 })) as NonNullable<PluginManifest["docperms"]>, roles: FSM_ROLES, doctypes: FSM_DOCTYPES, custom_fields: FSM_CUSTOM_FIELDS, workflows: FSM_WORKFLOWS, reports: FSM_PLUGIN_REPORTS,
  number_cards: [
    { name: "FSM Critical Open Findings", label: "Critical open findings", document_type: "FSM Deficiency", function: "Count", filters: [["FSM Deficiency", "severity", "=", "Critical"], ["FSM Deficiency", "workflow_state", "in", ["Open", "Quoted", "Approved for Repair", "Retest Pending", "Disputed"]]] },
    { name: "FSM Runs Awaiting Review", label: "Runs awaiting review", document_type: "FSM Inspection Run", function: "Count", filters: [["FSM Inspection Run", "workflow_state", "=", "Submitted for Review"]] },
    { name: "FSM Unscheduled Visits", label: "Unscheduled visits", document_type: VISIT_DT, function: "Count", filters: [[VISIT_DT, "workflow_state", "=", "Unscheduled"]] },
  ],
  dashboard_charts: [{ name: "FSM Findings by Severity", chart_name: "Findings by severity", chart_type: "Group By", document_type: "FSM Deficiency", group_by_based_on: "severity", type: "Pie", filters: [] }],
  workspaces: [{ name: "DIGIT FSM + ITM", label: "DIGIT FSM + ITM", module: FSM_MODULE, number_cards: ["FSM Critical Open Findings", "FSM Runs Awaiting Review", "FSM Unscheduled Visits"], charts: ["FSM Findings by Severity"],
    shortcuts: [{ label: "Service Site", type: "DocType", link_to: "FSM Service Site" }, { label: "Service Agreement", type: "DocType", link_to: "FSM Service Agreement" }, { label: "Job", type: "DocType", link_to: "FSM Job" }, { label: "Inspection Run", type: "DocType", link_to: "FSM Inspection Run" }, { label: "Deficiency", type: "DocType", link_to: "FSM Deficiency" }] }],
  notifications: [
    { name: "FSM Run Submitted", document_type: "FSM Inspection Run", event: "Value Change", condition: "doc.workflow_state == 'Submitted for Review'", subject: "Inspection run {name} submitted for review", subject_ar: "تم تقديم تشغيل الفحص {name} للمراجعة", message: "Run {name} at {site} is waiting for technical review.", recipients: [{ receiver_by_role: "FSM Reviewer" }] },
    { name: "FSM Critical Finding", document_type: "FSM Deficiency", event: "New", condition: "doc.severity == 'Critical'", subject: "Critical finding {name} at {site}", subject_ar: "ملاحظة حرجة {name} في {site}", message: "{title}", recipients: [{ receiver_by_role: "FSM Manager" }] },
  ],
  settings: [{ name: "digit_fsm_settings", doctype: "FSM Settings", label: "FSM Settings", label_ar: "إعدادات الخدمة الميدانية", description: "Generation horizon, retest due days, review and eligibility rules." }],
  department_sections: [{ department: "projects", label: "DIGIT FSM + ITM", label_ar: "ديجيت للخدمات الميدانية والفحص", doctypes: ["FSM Job", VISIT_DT, "FSM Inspection Run", "FSM Deficiency"] }],
  actions: [
    { name: "fsm_handoff_charge", doctype: "FSM Charge Proposal", label: "Create Sales Invoice (server)", label_ar: "إنشاء فاتورة المبيعات (الخادم)", kind: "server", permission: "write", server_method: "handoff_charge", description: "The native Sales Invoice is created and posted by the DIGIT server; the Virtual Core records an Integration Exception instead." },
    { name: "fsm_portal_publish", doctype: "FSM Report Revision", label: "Publish to customer portal (server)", label_ar: "النشر في بوابة العميل (الخادم)", kind: "server", permission: "write", server_method: "publish_to_portal", description: "Customer site grants are enforced only by the server." },
  ],
  frontend: { framework: "react", strategy: "none" },
  // report record names appear in the Standard Desk app menu; their Arabic display names come from the report catalogue
  translations: { ...FSM_TRANSLATIONS, ...ACTION_AR, ...Object.fromEntries(FSM_REPORTS.map((r) => [`FSM ${r.id} ${r.title}`, `${r.id} ${r.title_ar}`])) },
  pages: FSM_PAGES, navigation: FSM_NAV,
  dock: { label: "FSM + ITM", label_ar: "الخدمات الميدانية", icon: "/icons/digit/svc/digit-svc-maintenance-light.svg" },
  experience: { home: "/plugins/digit_fsm" }, default_enabled: true,
  // shared global rail services: Reports / Settings are the RPT / SET groups; Compliance opens the quality & compliance workspace
  rail_services: { compliance: "ws/rpt-quality" },
  // inherits the shared DIGIT Enterprise tokens (enterprise.css); only the module-rail layout is declared, like Construction
  theme: { full_width: true, tablet_drawer: true, module_rail: true },
};
