/**
 * digit_construction — DIGIT Construction as an additive Virtual Core app (owner goal 2026-10-17).
 * Native ERPNext Project/Task/Customer/Supplier/Item/Employee/Company and all procurement, invoice, payment and stock
 * documents are reused; construction-only objects are app DocTypes linked to them. Behaviour: controller hooks
 * (domain/hooks.ts), services (domain/services.ts), workflows (workflows.ts), reports (reports.ts), virtual pages (ui/).
 * Hooks and the demo installer load from boot.ts (src/plugins/builtinBoot.ts) after the adapter, never from this manifest,
 * so the manifest stays import-cycle free (catalog → runtime → registry → manifest).
 * Disabled by default; disabling hides the overlay and never deletes records. Trace: docs/digit-app-builder/construction/.
 */
import { CONSTRUCTION_CALENDARS } from "./listViews";
import { PRINT_FORMATS } from "./domain/print";
import type { PluginManifest, PluginNavGroup, PluginPage } from "../types";
import { analyticsTranslations } from "./analytics/catalog";
import { CONSTRUCTION_CUSTOM_FIELDS, CONSTRUCTION_DOCTYPES, CONSTRUCTION_ROLES, SCHEMA_TRANSLATIONS } from "./schema";
import { ACTION_AR, CONSTRUCTION_WORKFLOWS } from "./workflows";
import { CONSTRUCTION_REPORTS } from "./reports";
import { DESC_AR, R19_LABEL_KEYS, UI_AR } from "./i18n";
import { DEPT_NAMES, DEPT_SLUGS, wsNavItems } from "./r19/wsIndex";
import { CONSTRUCTION_ALERTS } from "./domain/alertDefs";

export const CONSTRUCTION_PAGES: PluginPage[] = [
  { path: "", component: "home", label: "Management home", label_ar: "الصفحة الرئيسية للإدارة" },
  { path: "portfolio", component: "portfolio", label: "Project portfolio", label_ar: "محفظة المشاريع" },
  { path: "hub", component: "hub", label: "Management hub", label_ar: "مركز الإدارة" },
  { path: "reports", component: "reports", label: "Report centre", label_ar: "مركز التقارير" },
  { path: "reports/:report", component: "report", label: "Report", label_ar: "تقرير" },
  { path: "governance", component: "governance", label: "Reporting governance & audit", label_ar: "حوكمة التقارير والتدقيق" },
  { path: "integration", component: "integration", label: "Integration map", label_ar: "خريطة التكامل" },
  { path: "inbox", component: "inbox", label: "My approvals & tasks", label_ar: "اعتماداتي ومهامي" },
  { path: "follow-up", component: "followUp", label: "Decision follow-up", label_ar: "متابعة القرارات" },
  { path: "insights", component: "insightsHome", label: "Insights dashboards", label_ar: "لوحات التحليلات" },
  { path: "insights/:key", component: "dashboard", label: "Insights dashboard", label_ar: "لوحة التحليلات" },
  { path: "metrics", component: "metrics", label: "Metric library", label_ar: "مكتبة المؤشرات" },
  { path: "projects", component: "projects", label: "Projects register", label_ar: "سجل المشاريع" },
  { path: "project/:id", component: "project360", label: "Project 360", label_ar: "مساحة المشروع 360" },
  { path: "wbs", component: "wbs", label: "WBS explorer", label_ar: "مستكشف هيكل تجزئة العمل" },
  { path: "team", component: "team", label: "Project team & responsibilities", label_ar: "فريق المشروع والمسؤوليات" },
  { path: "dept/:key", component: "dept", label: "Department workspace", label_ar: "مساحة القسم" },
  { path: "estimating/version/:id", component: "estimate", label: "Estimate version", label_ar: "إصدار التقدير" },
  { path: "estimating/boq-compare", component: "boqCompare", label: "BOQ revision comparison", label_ar: "مقارنة مراجعات جدول الكميات" },
  { path: "estimating/tender/:id/boq", component: "tenderBoq", label: "Tender → BOQ draft", label_ar: "مسودة جدول الكميات من العطاء" },
  { path: "sub/review", component: "qsReview", label: "QS review & certification", label_ar: "مراجعة الكميات والاعتماد" },
  { path: "cost/sheet", component: "costSheet", label: "Cost sheet", label_ar: "ورقة التكلفة" },
  { path: "cost/verify", component: "costVerify", label: "Cost source verifier", label_ar: "محقق مصادر التكلفة" },
  { path: "proc/plan", component: "procPlan", label: "Procurement plan", label_ar: "خطة المشتريات" },
  { path: "proc/materials", component: "materialPosition", label: "Project material position", label_ar: "موقف مواد المشروع" },
  { path: "proc/comparison", component: "comparison", label: "Quotation comparison", label_ar: "مقارنة العروض" },
  { path: "proc/matching", component: "matching", label: "Invoice matching", label_ar: "مطابقة الفواتير" },
  { path: "fin/cashflow", component: "cashFlow", label: "Project cash flow", label_ar: "التدفق النقدي للمشروع" },
  { path: "fin/advances", component: "advances", label: "Advances & retention", label_ar: "السلف والمحتجزات" },
  { path: "contracts/versions", component: "contractVersions", label: "Contract versions & terms", label_ar: "إصدارات العقد وشروطه" },
  { path: "finance", component: "finance", label: "Financial position", label_ar: "الموقف المالي" },
  { path: "settings", component: "settings", label: "Construction settings", label_ar: "إعدادات المقاولات" },
  { path: "settings/policies", component: "policies", label: "Policy decisions", label_ar: "قرارات السياسات" },
  { path: "outputs", component: "outputs", label: "Controlled print outputs", label_ar: "المخرجات المطبوعة المضبوطة" },
  { path: "modules/:key", component: "moduleDirectory", label: "Module directory", label_ar: "دليل الوحدة" },
  // R19 (owner goal 2026-11-09): the 36 contract workspaces, three tabs each (ui/r19Workspace.tsx); older pages above stay unchanged
  { path: "ws", component: "r19Index", label: "Workspaces", label_ar: "مساحات العمل" },
  { path: "ws/:id", component: "r19Workspace", label: "Workspace", label_ar: "مساحة العمل" },
  // owner ruling 2026-11-14: each department and its four workspaces open at /construction/<department>/<workspace>/<tab>
  ...Object.entries(DEPT_SLUGS).flatMap(([d, slug]) => [
    { path: slug, component: "r19Dept", label: DEPT_NAMES[d]![0], label_ar: DEPT_NAMES[d]![1] },
    { path: `${slug}/:ws`, component: "r19Workspace", label: "Workspace", label_ar: "مساحة العمل" },
    { path: `${slug}/:ws/:tab`, component: "r19Workspace", label: "Workspace", label_ar: "مساحة العمل" },
  ]),
];

const dt = (d: string, label: string, label_ar: string, featured?: true) => ({ label, label_ar, to: `doctype:${d}`, ...(featured ? { featured } : {}) });
const pg = (to: string, label: string, label_ar: string, featured?: true) => ({ label, label_ar, to, ...(featured ? { featured } : {}) });
const F = true as const;
/**
 * Contextual navigation. Module rail layout (theme.module_rail): nine owner-approved modules on the rail — Reports and
 * Settings fold into module 9 — each with an overview, its frequent sections (`featured`) and a full module directory
 * (`modules/<key>`), so every entry below stays one click from its module.
 */
/** R19: each module lists its four contract workspaces right after its overview (labels kept distinct from older entries). */
const WS_DEPT: Record<string, string> = { MGT: "01", PRJ: "02", ET: "03", CON: "04", SUB: "05", CST: "06", PROC: "07", RSP: "08", FIN: "09" };
const withWorkspaces = (groups: PluginNavGroup[]): PluginNavGroup[] => groups.map((g) => {
  const d = WS_DEPT[g.key]; if (!d) return g;
  const ws = wsNavItems(d, g.items.map((i) => i.label));
  // the department page and its workspaces (/construction/<department>/…) belong to this module
  return { ...g, match: [...(g.match ?? []), DEPT_SLUGS[d]!], items: [g.items[0]!, ...ws, ...(d === "01" ? [pg("ws", "All workspaces", "كل مساحات العمل")] : []), ...g.items.slice(1)] };
});
export const CONSTRUCTION_NAV: PluginNavGroup[] = withWorkspaces([
  { key: "MGT", label: "Management & home", label_ar: "الإدارة والرئيسية", short: "Home", short_ar: "الرئيسية", icon: "home", directory: "modules/mgt", match: ["insights/"],
    items: [pg("", "Management home", "الصفحة الرئيسية", F), pg("portfolio", "Project portfolio", "محفظة المشاريع", F), pg("hub", "Management hub", "مركز الإدارة", F), pg("inbox", "My approvals & tasks", "اعتماداتي ومهامي", F), pg("follow-up", "Decision follow-up", "متابعة القرارات"), pg("reports", "Report centre", "مركز التقارير"), pg("insights", "Insights dashboards", "لوحات التحليلات", F), pg("metrics", "Metric library", "مكتبة المؤشرات"), pg("integration", "Integration map", "خريطة التكامل")] },
  { key: "PRJ", label: "Projects & execution", label_ar: "المشاريع والتنفيذ", short: "Projects", short_ar: "المشاريع", icon: "projects", directory: "modules/prj", match: ["project/"],
    items: [pg("dept/prj", "Projects workspace", "مساحة المشاريع", F), pg("projects", "Projects register", "سجل المشاريع", F), dt("Task", "Tasks", "المهام", F), dt("Digit Work Package", "Work packages", "حزم العمل", F),
    dt("Digit Stage Planning", "Stage plans", "تخطيط المراحل"), dt("Digit WBS Version", "WBS versions", "إصدارات WBS"), pg("wbs", "WBS explorer", "مستكشف هيكل تجزئة العمل", F), pg("team", "Project team & responsibilities", "فريق المشروع والمسؤوليات"), dt("Digit Task Dependency", "Task dependencies", "اعتماديات المهام"), dt("Digit Progress Update", "Progress updates", "تحديثات الإنجاز", F), dt("Digit Site Activity Report", "Daily site activity", "نشاط الموقع اليومي")] },
  { key: "ET", label: "Estimating & tenders", label_ar: "التقدير والعطاءات", short: "Estimating", short_ar: "التقدير", icon: "estimating", directory: "modules/et", match: ["estimating/"],
    items: [pg("dept/et", "Estimating workspace", "مساحة التقدير", F), dt("Digit Tender", "Tenders", "العطاءات", F), dt("Digit Estimate Version", "Estimate versions", "نسخ التقدير", F), dt("Digit Construction Rate", "Rate library", "مكتبة الأسعار", F),
    dt("Digit Assembly", "Assemblies", "التجميعات"), dt("Digit Estimate Template", "Estimate templates", "قوالب التقدير"), dt("Digit BOQ", "Bills of quantities", "جداول الكميات", F), pg("estimating/boq-compare", "BOQ revision comparison", "مقارنة مراجعات جدول الكميات", F)] },
  { key: "CON", label: "Contracts & claims", label_ar: "العقود والمستخلصات", short: "Contracts", short_ar: "العقود", icon: "contracts", directory: "modules/con",
    items: [pg("dept/con", "Contracts workspace", "مساحة العقود", F), dt("Digit Client Contract", "Client contracts", "عقود العملاء", F), dt("Digit Client Variation", "Variations", "الأوامر التغييرية", F),
    dt("Digit Client Claim", "Progress claims", "المطالبات", F), dt("Digit Client Certificate", "Certificates", "الشهادات", F), dt("Sales Invoice", "Client invoices", "فواتير العملاء", F), pg("contracts/versions", "Contract versions & terms", "إصدارات العقد وشروطه")] },
  { key: "SUB", label: "Subcontracts & measurement", label_ar: "مقاولو الباطن والقياس", short: "Subcontracts", short_ar: "الباطن", icon: "subcontracts", directory: "modules/sub", match: ["sub/"],
    items: [pg("dept/sub", "Subcontracts workspace", "مساحة مقاولي الباطن", F), dt("Supplier", "Subcontractor register", "سجل المقاولين", F), dt("Digit Subcontractor Profile", "Subcontractor profiles", "ملفات المقاولين"),
    dt("Digit Subcontract Work Order", "Work orders", "أوامر العمل", F), dt("Digit Measurement Book", "Measurement books", "دفاتر القياس", F), pg("sub/review", "QS review & certification", "مراجعة الكميات والاعتماد", F), dt("Digit Subcontractor Bill", "Subcontract bills", "مستخلصات المقاولين", F)] },
  { key: "CST", label: "Budget & cost control", label_ar: "الموازنة والتحكم بالتكلفة", short: "Cost", short_ar: "التكلفة", icon: "cost", directory: "modules/cst", match: ["cost/"],
    items: [pg("dept/cst", "Cost control workspace", "مساحة التحكم بالتكلفة", F), dt("Digit Project Cost Budget", "Budgets", "الموازنات", F), pg("cost/sheet", "Cost sheet", "ورقة التكلفة", F), pg("cost/verify", "Cost source verifier", "محقق مصادر التكلفة", F),
    dt("Digit Budget Revision", "Budget revisions", "تعديلات الموازنة", F), dt("Digit Budget Transfer", "Budget transfers", "مناقلات الموازنة"), dt("Digit Cost Forecast Snapshot", "Forecasts", "التوقعات", F), dt("Digit Cost Sheet Definition", "Cost sheet designer", "مصمم ورقة التكلفة"), dt("Digit Cost Allocation", "Cost allocations", "تخصيصات التكلفة"), dt("Digit Cost Exception Review", "Cost exception reviews", "مراجعات استثناءات التكلفة")] },
  { key: "PROC", label: "Procurement & materials", label_ar: "المشتريات والمواد", short: "Procurement", short_ar: "المشتريات", icon: "procurement", directory: "modules/proc", match: ["proc/"],
    items: [pg("dept/proc", "Procurement workspace", "مساحة المشتريات", F), pg("proc/plan", "Procurement plan", "خطة المشتريات", F), dt("Material Request", "Material requests", "طلبات المواد", F), dt("Request for Quotation", "Requests for quotation", "طلبات عروض الأسعار"),
    dt("Supplier Quotation", "Supplier quotations", "عروض الموردين"), pg("proc/comparison", "Quotation comparison", "مقارنة العروض", F), dt("Purchase Order", "Purchase orders", "أوامر الشراء", F), dt("Purchase Receipt", "Receipts", "الاستلام"), dt("Stock Entry", "Material issues", "صرف المواد"),
    pg("proc/materials", "Material position", "موقف المواد", F), pg("proc/matching", "Invoice matching", "مطابقة الفواتير"), dt("Purchase Invoice", "Purchase invoices", "فواتير المشتريات")] },
  { key: "RSP", label: "Resources & spending", label_ar: "الموارد والمصروفات", short: "Resources", short_ar: "الموارد", icon: "resources", directory: "modules/rsp",
    items: [pg("dept/rsp", "Resources workspace", "مساحة الموارد", F), dt("Digit Machinery", "Equipment", "المعدات", F), dt("Digit Machinery Usage", "Machinery usage", "استخدام المعدات"), dt("Digit Crew", "Crews", "الطواقم", F),
    dt("Digit Field Attendance", "Site attendance", "الحضور الميداني", F), dt("Digit Petty Cash Fund", "Petty cash", "العهد النقدية", F), dt("Digit Site Expense", "Site expenses", "مصروفات الموقع", F)] },
  { key: "FIN", label: "Financial position & closeout", label_ar: "الموقف المالي والإغلاق", short: "Finance", short_ar: "المالية", icon: "finance", directory: "modules/fin", match: ["fin/"],
    items: [pg("dept/fin", "Finance workspace", "مساحة المالية", F), pg("finance", "Financial position", "الموقف المالي", F), pg("fin/cashflow", "Project cash flow", "التدفق النقدي للمشروع", F), pg("fin/advances", "Advances & retention", "السلف والمحتجزات", F), dt("Digit Retention Release Request", "Retention releases", "الإفراج عن المحتجزات"),
    dt("Digit Final Account", "Final accounts", "الحسابات الختامية"), dt("Digit Closeout Assessment", "Project closeout", "إغلاق المشروع", F), dt("Digit Cashflow Forecast Item", "Cashflow forecast", "توقع التدفق النقدي"), dt("Digit Opening Balance", "Opening balances", "الأرصدة الافتتاحية"), dt("Payment Entry", "Payments", "المدفوعات", F)] },
  { key: "REP", module: "FIN", label: "Reports", label_ar: "التقارير", icon: "reports", items: [pg("reports", "Report centre", "مركز التقارير", F), pg("governance", "Reporting governance & audit", "حوكمة التقارير والتدقيق"), ...CONSTRUCTION_REPORTS.slice(0, 6).map((r) => pg(`reports/${encodeURIComponent(r.name)}`, r.name, UI_AR[r.name] ?? r.name))] },
  { key: "SET", module: "FIN", label: "Settings", label_ar: "الإعدادات", icon: "settings", match: ["settings"], items: [pg("settings", "Construction settings", "إعدادات المقاولات", F), pg("settings/policies", "Policy decisions", "قرارات السياسات", F), pg("outputs", "Controlled print outputs", "المخرجات المطبوعة المضبوطة"), dt("Digit Construction Settings", "Defaults", "الإعدادات الافتراضية")] },
]);

export const digitConstruction: PluginManifest = {
  name: "digit_construction", title: "DIGIT Construction", title_ar: "ديجيت للمقاولات", version: "1.0.0-virtual", publisher: "Digit", email: "dev@example.com", license: "Proprietary",
  description: "Construction vertical: projects & execution, estimating & tenders, client contracts & claims, subcontracts, budget & cost, procurement, resources, financial position & closeout.",
  description_ar: "تطبيق المقاولات: المشاريع والتنفيذ، التقدير والعطاءات، عقود العملاء والمستخلصات، مقاولو الباطن، الموازنة والتكلفة، المشتريات، الموارد، الموقف المالي والإغلاق.",
  host_app: "erpnext", module: "Digit Construction", required_apps: ["frappe", "erpnext"],
  source_application: { name: "digit_construction", namespace: "digit_construction", version: "1.0.0-virtual", host_app: "erpnext", optional: true,
    dependencies: [{ name: "frappe", optional: false }, { name: "erpnext", optional: false }, { name: "hrms", optional: true }], execution: "VIRTUAL_PARTIAL",
    commit: "17f4d9b0717c7dbe6b15fa8262b9459ab43b8ad9", commit_status: "HISTORICAL_SOURCE_ARCHIVE", owned_doctypes: CONSTRUCTION_DOCTYPES.map((d) => d.name),
    frontend_routes: CONSTRUCTION_PAGES.map((p) => `/plugins/digit_construction/${p.path}`), provenance_references: ["digit-construction-full-history-20261011-17f4d9b.zip", "docs/handoff/RECONCILED_SCHEMAS.json", "src/app/screens.ts", "src/entities/project360.tsx"] } as never,
  source_references: { screens: "historical src/app/screens.ts (54 screen IDs)", schemas: "historical docs/handoff/RECONCILED_SCHEMAS.json", crosswalk: "docs/digit-app-builder/construction/SCREEN_CONTRACTS.md" },
  compatibility: { frappe: ">=17.0.0-dev,<18.0.0", erpnext: "^17.0.0-dev" },
  roles: CONSTRUCTION_ROLES,
  doctypes: CONSTRUCTION_DOCTYPES, custom_fields: CONSTRUCTION_CUSTOM_FIELDS, workflows: CONSTRUCTION_WORKFLOWS, reports: CONSTRUCTION_REPORTS, print_formats: PRINT_FORMATS,
  number_cards: [
    { name: "Construction Active Projects", label: "Active construction projects", document_type: "Project", function: "Count", filters: [["Project", "status", "=", "Open"], ["Project", "digit_contract_type", "is", "set"]] },
    { name: "Construction Claims Awaiting Certificate", label: "Claims awaiting certificate", document_type: "Digit Client Claim", function: "Count", filters: [["Digit Client Claim", "workflow_state", "=", "Submitted"]] },
    { name: "Construction Books Awaiting QS", label: "Measurement books awaiting QS", document_type: "Digit Measurement Book", function: "Count", filters: [["Digit Measurement Book", "workflow_state", "=", "Submitted"]] },
    { name: "Construction Certified Gross", label: "Certified gross (confirmed)", document_type: "Digit Client Certificate", function: "Sum", aggregate_function_based_on: "gross_this", filters: [["Digit Client Certificate", "docstatus", "=", 1]] },
  ],
  dashboard_charts: [
    { name: "Construction Tenders by Status", chart_name: "Tenders by status", chart_type: "Group By", document_type: "Digit Tender", group_by_based_on: "status", type: "Pie", filters: [] },
    { name: "Construction Certified by Project", chart_name: "Certified gross by project", chart_type: "Sum", document_type: "Digit Client Certificate", group_by_based_on: "project", value_based_on: "gross_this", type: "Bar", filters: [["Digit Client Certificate", "docstatus", "=", 1]] },
  ],
  workspaces: [{ name: "DIGIT Construction", label: "DIGIT Construction", module: "Digit Construction", number_cards: ["Construction Active Projects", "Construction Claims Awaiting Certificate", "Construction Books Awaiting QS", "Construction Certified Gross"], charts: ["Construction Tenders by Status", "Construction Certified by Project"],
    shortcuts: [{ label: "Project", type: "DocType", link_to: "Project" }, { label: "Tender", type: "DocType", link_to: "Digit Tender" }, { label: "Client Contract", type: "DocType", link_to: "Digit Client Contract" }, { label: "Subcontract Work Order", type: "DocType", link_to: "Digit Subcontract Work Order" }, { label: "Construction Portfolio Status", type: "Report", link_to: "Construction Portfolio Status" }] }],
  notifications: [
    { name: "Construction Certificate Confirmed", document_type: "Digit Client Certificate", event: "Submit", subject: "Certificate {name} confirmed — create the Sales Invoice", subject_ar: "تم اعتماد الشهادة {name} — أنشئ فاتورة المبيعات", message: "Certificate {name} for project {project} was confirmed (net {net_certified}).", recipients: [{ receiver_by_role: "Digit Accountant" }] },
    { name: "Construction Bill Approved", document_type: "Digit Subcontractor Bill", event: "Submit", subject: "Subcontract bill {name} approved — create the Purchase Invoice", subject_ar: "تم اعتماد مستخلص مقاول الباطن {name} — أنشئ فاتورة المشتريات", message: "Bill {name} ({subcontractor}) net {net_amount} is approved.", recipients: [{ receiver_by_role: "Digit Accountant" }] },
    ...CONSTRUCTION_ALERTS,
  ],
  settings: [{ name: "digit_construction_settings", doctype: "Digit Construction Settings", label: "Construction Settings", label_ar: "إعدادات المقاولات", description: "Defaults and alert thresholds; policy decisions are recorded separately." }],
  department_sections: [{ department: "projects", label: "DIGIT Construction", label_ar: "ديجيت للمقاولات", doctypes: ["Digit Work Package", "Digit Stage Planning", "Digit Progress Update", "Digit Site Activity Report"], reports: ["Construction Portfolio Status"] }],
  actions: [
    { name: "pay_subcontractor_server", doctype: "Digit Subcontractor Bill", label: "Pay via bank integration", label_ar: "سداد عبر التكامل البنكي", kind: "server", permission: "submit", server_method: "pay_subcontractor_bill", description: "Bank payment file / integration needs the DIGIT server and an approved P3 payment policy." },
  ],
  frontend: { framework: "react", strategy: "none" },
  // R19 report labels only fill gaps: a schema / workflow label of the same text keeps its Arabic
  translations: { ...SCHEMA_TRANSLATIONS, ...ACTION_AR, ...Object.fromEntries(Object.entries(UI_AR).filter(([k]) => !(R19_LABEL_KEYS.has(k) && k in SCHEMA_TRANSLATIONS))), ...DESC_AR, ...analyticsTranslations(),
    // owner work list AR-001…003 / AR-076: print format names show in Arabic (the stored name stays English)
    ...Object.fromEntries(PRINT_FORMATS.map((f) => [f.name, `${SCHEMA_TRANSLATIONS[f.doc_type] ?? f.doc_type} (ثنائي اللغة)`])) },
  pages: CONSTRUCTION_PAGES, navigation: CONSTRUCTION_NAV,
  // owner UX depth round: Calendar / Gantt list views of dated Construction documents (listViews.ts)
  calendar_views: CONSTRUCTION_CALENDARS,
  dock: { label: "Construction", label_ar: "المقاولات", icon: "/icons/digit/ind/digit-ind-contracting-light.svg" },
  // Final Core enterprise shell: persistent app experience (module rail slots in ./slots.tsx) and enabled once on a clean browser
  // shared global rail services: Compliance opens the reporting governance & audit page
  rail_services: { compliance: "governance" },
  experience: { home: "/plugins/digit_construction" /* shown as /construction (src/lib/appUrls.ts) */ }, default_enabled: true, // BRAND_ASSET_OR_FONT_NOT_VERIFIED: no official app logo supplied; the dock shows a token-coloured monogram
  // DIGIT palette (Run 1, presentation only): deep green structure, emerald actions/active context, mint tints, warm canvas, dark ink.
  // Mint is used as a tint, not as a selected bar, because mint on white is below the 3:1 non-text contrast minimum.
  // visual round R3: every value is a Phase 3 token (src/components/enterprise/tokens.css), so the app follows the one palette
  theme: {
    full_width: true,
    tokens: {
      background: "var(--paper)", foreground: "var(--ink)", card: "var(--white)", "card-foreground": "var(--ink)", popover: "var(--white)", "popover-foreground": "var(--ink)",
      primary: "var(--emerald)", "primary-foreground": "var(--on-deep)", ring: "var(--emerald)",
      secondary: "color-mix(in oklab, var(--deep) 6%, var(--white))", "secondary-foreground": "var(--deep)",
      muted: "color-mix(in oklab, var(--deep) 6%, var(--paper))", "muted-foreground": "var(--grey)",
      accent: "color-mix(in oklab, var(--mint) 16%, var(--white))", "accent-foreground": "var(--deep)",
      border: "color-mix(in oklab, var(--deep) 13%, var(--white))", input: "color-mix(in oklab, var(--deep) 22%, var(--white))",
      "chart-1": "var(--emerald)", "chart-2": "var(--deep)", "chart-3": "var(--mint)", "chart-4": "var(--tone-warning)", "chart-5": "var(--grey)",
      "app-nav": "var(--deep)", "app-nav-foreground": "var(--on-deep)", "app-highlight": "var(--emerald)",
    },
    // Run 2: deep-green contextual sidebar; mint is the selected bar here because mint on deep green clears 3:1 (it does not on white).
    sidebar: {
      card: "var(--em-900)", "card-foreground": "var(--on-deep)", foreground: "var(--on-deep)", primary: "var(--mint)", "primary-foreground": "var(--em-900)", ring: "var(--mint)",
      muted: "color-mix(in oklab, var(--mint) 14%, var(--em-900))", "muted-foreground": "var(--on-deep-muted)", accent: "color-mix(in oklab, var(--mint) 22%, var(--em-900))", "accent-foreground": "var(--on-deep)",
      border: "color-mix(in oklab, var(--mint) 22%, var(--em-900))", input: "color-mix(in oklab, var(--mint) 30%, var(--em-900))",
      "app-nav": "var(--mint)", "app-nav-foreground": "var(--em-900)", "app-highlight": "var(--mint)",
    },
    tablet_drawer: true,
    module_rail: true,
  },
};
