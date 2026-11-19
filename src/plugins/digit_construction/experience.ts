/**
 * DIGIT Construction's shared-experience declaration (src/plugins/experience/contract.ts). Screens are the 36 R19
 * workspaces (r19/workspaces.ts, three tabs each) with their generated feature ids; registers count the R19 contract
 * itself. The shared Overview block reads construction projects only through domain/queues.ts constructionProjects —
 * the same definition and scoped reader the R19 dashboards use — so the Core never computes Construction figures.
 */
import CONTRACT from "./r19/contract.generated.json";
import { wsRoute } from "./r19/wsIndex";
import { R19_WORKSPACES } from "./r19/workspaces";
import { CONSTRUCTION_ROLES, OPTION_AR } from "./schema";
import { constructionProjects } from "./domain/queues";
import { canReadType, readLimited } from "@/lib/scope";
import { EXPERIENCE_CONTRACT_VERSION, type Adoption, type AdapterInput, type AdapterResult, type ExperienceDeclaration } from "../experience/contract";
import type { SeriesPoint } from "@/lib/dashboards/registry";

const APP = "digit_construction";
/** Native Project.status options in source order (erpnext/projects/doctype/project/project.json). */
const PROJECT_STATUS = ["Open", "Completed", "Cancelled"] as const;

/** Construction projects (contract type set or linked from a contract/tender/budget/subcontract/work package) by native status. */
export function portfolioStatus(i: AdapterInput): AdapterResult {
  if (!canReadType("Project", i.user)) return { state: "DENIED" };
  const rows = constructionProjects(i.company ? { company: i.company } : {});
  const limited = readLimited("Project", i.user);
  if (!rows.length) return { state: "EMPTY", total: 0, limited };
  const by = new Map<string, string[]>();
  for (const p of rows) { const s = String(p["status"] ?? "") || "—"; by.set(s, [...(by.get(s) ?? []), p.name]); }
  const order = [...PROJECT_STATUS.filter((s) => by.has(s)), ...[...by.keys()].filter((s) => !(PROJECT_STATUS as readonly string[]).includes(s))];
  // The drill carries the exact project names: "construction project" is a derived set, not one native filter.
  const points: SeriesPoint[] = order.map((s) => ({ key: s, label: s, value: by.get(s)!.length, drill: { doctype: "Project", filters: [["name", "in", by.get(s)!]] } }));
  const labels = Object.fromEntries(order.filter((s) => OPTION_AR[s]).map((s) => [s, [s, OPTION_AR[s]!] as [string, string]]));
  return { state: "OK", total: rows.length, limited, labels, data: { kind: "series", status: "ok", points, valueLabel: ["Projects", "المشاريع"] } };
}

type Bi = [string, string];
const UI = "src/plugins/digit_construction/ui/";
/**
 * The R19 contract's 11 GLOBAL / SHARED screens (SCR-00-xx: ws and tab "GLOBAL / SHARED") sit outside the 36
 * workspaces. Each is registered on the existing page its contract `historical` source names (index.ts
 * CONSTRUCTION_PAGES path → ui/register.ts component → file), with the kind the contract implies: an app-level page
 * (GLOBAL) or the Project record profile (PROFILE). SCR-00-11 "site app (PWA)" (type جوال, historical "—") has no
 * route or source in this project, so it is UNMATCHED_SOURCE_REQUIRED and registers no screen.
 */
export const R19_SHARED_SCREENS: { scr: string; kind: "GLOBAL" | "PROFILE"; basis: string; pages: [path: string, title: Bi, file: string][] }[] = [
  { scr: "SCR-00-01", kind: "GLOBAL", basis: 'historical: index.ts page "" → home.tsx', pages: [["", ["Management home", "الصفحة الرئيسية للإدارة"], "home.tsx"]] },
  { scr: "SCR-00-02", kind: "GLOBAL", basis: "historical: inbox.tsx + domain/inbox.ts, queues.ts", pages: [["inbox", ["My approvals & tasks", "اعتماداتي ومهامي"], "inbox.tsx"]] },
  { scr: "SCR-00-03", kind: "GLOBAL", basis: "historical: followup.tsx", pages: [["follow-up", ["Decision follow-up", "متابعة القرارات"], "followup.tsx"]] },
  { scr: "SCR-00-04", kind: "GLOBAL", basis: "historical: reports.tsx + reports*.ts", pages: [["reports", ["Report centre", "مركز التقارير"], "reports.tsx"], ["reports/$report", ["Report", "تقرير"], "reports.tsx"]] },
  { scr: "SCR-00-05", kind: "GLOBAL", basis: "historical: governance.tsx", pages: [["governance", ["Reporting governance & audit", "حوكمة التقارير والتدقيق"], "governance.tsx"]] },
  { scr: "SCR-00-06", kind: "GLOBAL", basis: "historical: analytics/* (insights dashboards + metric library)", pages: [["insights", ["Insights dashboards", "لوحات التحليلات"], "analytics.tsx"], ["insights/$key", ["Insights dashboard", "لوحة التحليلات"], "analytics.tsx"], ["metrics", ["Metric library", "مكتبة المؤشرات"], "analytics.tsx"]] },
  { scr: "SCR-00-07", kind: "PROFILE", basis: "historical: project360.tsx (8 groups) — one Project record", pages: [["project/$id", ["Project 360", "مساحة المشروع 360"], "project360.tsx"]] },
  { scr: "SCR-00-08", kind: "GLOBAL", basis: "historical: settings.tsx, Digit Construction Settings, Digit Policy Decision", pages: [["settings", ["Construction settings", "إعدادات المقاولات"], "settings.tsx"], ["settings/policies", ["Policy decisions", "قرارات السياسات"], "settings.tsx"]] },
  { scr: "SCR-00-09", kind: "GLOBAL", basis: "historical: printOutputs.tsx, Digit Print Artifact, 4 Print Formats", pages: [["outputs", ["Controlled print outputs", "المخرجات المطبوعة المضبوطة"], "printOutputs.tsx"]] },
  { scr: "SCR-00-10", kind: "GLOBAL", basis: "historical: directory.tsx; title names the integration map (reports.tsx IntegrationPage)", pages: [["modules/$key", ["Module directory", "دليل الوحدة"], "directory.tsx"], ["integration", ["Integration map", "خريطة التكامل"], "reports.tsx"]] },
];
/**
 * R19 operating pages (type "صفحة تشغيل" / report) whose contract `historical` names one existing page of index.ts
 * CONSTRUCTION_PAGES exactly (component or file in ui/register.ts). They belong to the workspace the contract gives
 * (`ws`), so they register as that workspace's screens on their own route. Pages no R19 row names (projects, dept/:key,
 * cost/sheet, estimating/version/:id, estimating/tender/:id/boq, ws index) stay unregistered rather than guessed.
 */
export const R19_PAGE_SCREENS: { scr: string; ws: string; basis: string; pages: [path: string, title: Bi, file: string][] }[] = [
  { scr: "SCR-01-02", ws: "01-01", basis: "historical: portfolio (Construction Portfolio Status)", pages: [["portfolio", ["Project portfolio", "محفظة المشاريع"], "home.tsx"]] },
  { scr: "SCR-01-07", ws: "01-02", basis: "historical: hub", pages: [["hub", ["Management hub", "مركز الإدارة"], "home.tsx"]] },
  { scr: "SCR-01-08", ws: "01-04", basis: "historical: team.tsx", pages: [["team", ["Project team & responsibilities", "فريق المشروع والمسؤوليات"], "team.tsx"]] },
  { scr: "SCR-02-03", ws: "02-01", basis: "historical: wbs.tsx", pages: [["wbs", ["WBS explorer", "مستكشف هيكل تجزئة العمل"], "wbs.tsx"]] },
  { scr: "SCR-03-06", ws: "03-02", basis: "historical: boqCompare.tsx", pages: [["estimating/boq-compare", ["BOQ revision comparison", "مقارنة مراجعات جدول الكميات"], "boqCompare.tsx"]] },
  { scr: "SCR-04-03", ws: "04-01", basis: "historical: contractVersions.tsx", pages: [["contracts/versions", ["Contract versions & terms", "إصدارات العقد وشروطه"], "contractVersions.tsx"]] },
  { scr: "SCR-05-05", ws: "05-03", basis: "historical: qsReview", pages: [["sub/review", ["QS review & certification", "مراجعة الكميات والاعتماد"], "subcontract.tsx"]] },
  { scr: "SCR-06-06", ws: "06-03", basis: "historical: costVerify.tsx", pages: [["cost/verify", ["Cost source verifier", "محقق مصادر التكلفة"], "costVerify.tsx"]] },
  { scr: "SCR-07-02", ws: "07-01", basis: "historical: procPlan.tsx, materialPosition", pages: [["proc/plan", ["Procurement plan", "خطة المشتريات"], "procPlan.tsx"], ["proc/materials", ["Project material position", "موقف مواد المشروع"], "procPlan.tsx"]] },
  { scr: "SCR-07-05", ws: "07-02", basis: "historical: comparison", pages: [["proc/comparison", ["Quotation comparison", "مقارنة العروض"], "procurement.tsx"]] },
  { scr: "SCR-07-10", ws: "07-04", basis: "historical: matching.tsx", pages: [["proc/matching", ["Invoice matching", "مطابقة الفواتير"], "procurement.tsx"]] },
  { scr: "SCR-09-02", ws: "09-01", basis: "historical: finance.tsx", pages: [["finance", ["Financial position", "الموقف المالي"], "finance.tsx"]] },
  { scr: "SCR-09-05", ws: "09-02", basis: "historical: cashAdv.tsx (title السلف والمحتجزات)", pages: [["fin/advances", ["Advances & retention", "السلف والمحتجزات"], "cashAdv.tsx"]] },
  { scr: "SCR-09-06", ws: "09-02", basis: "historical: cashflow", pages: [["fin/cashflow", ["Project cash flow", "التدفق النقدي للمشروع"], "cashAdv.tsx"]] },
];
const UNMATCHED: Record<string, string> = { "SCR-00-11": "Mobile site app (PWA): R19 historical source is \"—\" and this project has no mobile route or PWA source; its features (FT-02-05/12/13/17, FT-07-01, FT-08-03) are served on their desktop workspace screens. Needs the owner's PWA source or decision." };

const ADOPTIONS: Adoption[] = [
  { sourceApp: "digit_core", sourceFeatureId: "shared.overview_block.status_breakdown", sharedPatternId: "overview_block", targetApp: APP, decision: "REUSE", ownerApproval: "APPROVED", evidence: "src/components/experience/ExperienceBlocks.tsx on /plugins/digit_construction/ws/01-01 via digit_construction.portfolio_status (browser AR/EN 1440+390, admin + restricted users, 2026-11-09; experience.test.ts)", implementationState: "VERIFIED_IN_CURRENT_LOVABLE" },
  { sourceApp: "digit_pro", sourceFeatureId: "DashboardDesigner (proDashboards.tsx)", sharedPatternId: "dashboard_designer", targetApp: APP, decision: "REUSE", ownerApproval: "APPROVED", evidence: "src/plugins/digit_construction/ui/r19Workspace.tsx registers one contract per workspace", implementationState: "IMPLEMENTED_NEEDS_RUNTIME_PROOF" },
  { sourceApp: "digit_pro", sourceFeatureId: "three_tab_workspace", sharedPatternId: "three_tab_workspace", targetApp: APP, decision: "ADAPT", ownerApproval: "APPROVED", evidence: "R19 36 workspaces × Dashboard · Work & documents · Reports (r19Workspace.tsx TABS)", implementationState: "IMPLEMENTED_NEEDS_RUNTIME_PROOF" },
];

export function digitConstructionExperience(): ExperienceDeclaration {
  const c = CONTRACT as { workspaces: unknown[]; screens: { id: string; ft?: string[] }[]; features: { id: string }[]; report_contracts: unknown[] };
  const ftOf = (scr: string) => c.screens.find((s) => s.id === scr)?.ft ?? [];
  const shared = R19_SHARED_SCREENS.flatMap((g) => g.pages.map(([path, title, file]) => ({
    screenId: `${APP}.${g.kind === "PROFILE" ? "profile" : "global"}.${path ? path.replace(/\/?\$\w+/g, "").replace(/\//g, "-") || "home" : "home"}${path.includes("$") ? "-item" : ""}`,
    title, featureIds: [g.scr, ...ftOf(g.scr)], kind: g.kind, approvedTabs: [], route: `/plugins/digit_construction${path ? `/${path}` : ""}`, roles: [],
    companyScope: "company" as const, rendererOwner: `${UI}${file}`, mountMode: "APP_RENDERER" as const, blocks: [],
    sourceContract: `R19 ${g.scr} GLOBAL / SHARED (${g.basis})`, stateCapabilities: ["OK" as const, "LOADING" as const, "EMPTY" as const, "DENIED" as const, "ERROR" as const],
  })));
  const pagesOf = R19_PAGE_SCREENS.flatMap((g) => g.pages.map(([path, title, file]) => ({
    screenId: `${APP}.page.${path.replace(/\//g, "-")}`, title, featureIds: [g.scr, ...ftOf(g.scr)], kind: "WORKSPACE" as const, workspace: g.ws, department: g.ws.slice(0, 2),
    approvedTabs: [], route: `/plugins/digit_construction/${path}`, roles: [], companyScope: "company" as const, rendererOwner: `${UI}${file}`, mountMode: "APP_RENDERER" as const, blocks: [],
    sourceContract: `R19 ${g.scr} operating page of workspace ${g.ws} (${g.basis})`, stateCapabilities: ["OK" as const, "LOADING" as const, "EMPTY" as const, "DENIED" as const, "ERROR" as const],
  })));
  return {
    experience: {
      appId: APP, contractVersion: EXPERIENCE_CONTRACT_VERSION, runtime: "VIRTUAL_PLUGIN", sourceVersion: "R19 contract (r19/contract.generated.json)",
      entryRoute: "/plugins/digit_construction", owner: APP, title: ["DIGIT Construction", "ديجيت للمقاولات"],
      supportedSharedPatterns: ["shell", "navigation", "rtl", "states", "three_tab_workspace", "dashboard_designer", "overview_block", "report_runner", "record_360"],
      registers: [
        { id: "r19_features", label: ["R19 features", "ميزات R19"], count: c.features.length, evidence: "r19/contract.generated.json features", ids: c.features.map((f) => f.id) },
        { id: "r19_screens", label: ["R19 screens", "شاشات R19"], count: c.screens.length, evidence: "r19/contract.generated.json screens", ids: c.screens.map((s) => s.id),
          statuses: Object.fromEntries(Object.keys(UNMATCHED).map((k) => [k, "UNMATCHED_SOURCE_REQUIRED" as const])), reasons: UNMATCHED },
        { id: "r19_workspaces", label: ["R19 workspaces", "مساحات عمل R19"], count: c.workspaces.length, evidence: "r19/contract.generated.json workspaces" },
        { id: "r19_reports", label: ["R19 report contracts", "عقود تقارير R19"], count: c.report_contracts.length, evidence: "r19/contract.generated.json report_contracts" },
      ],
      screens: [...R19_WORKSPACES.map((w) => ({
        screenId: `${APP}.ws.${w.id}`, title: w.title, featureIds: [...w.features, ...w.screens], kind: "WORKSPACE" as const, department: String(w.dept), workspace: w.id, approvedTabs: ["dashboard", "work", "reports"],
        route: `/plugins/digit_construction/${wsRoute(w.id).replace(/\/overview$/, "/$tab")}`, actor: w.roles, roles: [], companyScope: "company", rendererOwner: "src/plugins/digit_construction/ui/r19Workspace.tsx", mountMode: "APP_RENDERER",
        sourceContract: `R19 workspace ${w.id} (screens ${w.screens.join(", ") || "—"})`, stateCapabilities: ["OK", "LOADING", "EMPTY", "DENIED", "ERROR"],
        blocks: w.id !== "01-01" ? [] : [{
          semanticBlockId: `${APP}.portfolio_status`, title: ["Construction projects by status", "مشاريع المقاولات حسب الحالة"], componentKind: "overview", presentationVariant: "status-breakdown",
          ownerApiOrAdapterId: `${APP}.portfolio_status`, inputSchema: { company: "optional" },
          source: { kind: "DocType", name: "Project", definition: ["Projects with a construction contract type, or linked from a client contract, tender, cost budget, subcontract or work package — grouped by the native status field.", "المشاريع ذات نوع عقد مقاولات أو المرتبطة بعقد عميل أو مناقصة أو موازنة تكاليف أو أمر مقاول باطن أو حزمة عمل — مجمّعة حسب حقل الحالة الأصلي."] },
          filters: [], period: "AS_OF_TODAY", drill: { doctype: "Project" }, permission: { roles: [...CONSTRUCTION_ROLES, "Projects Manager", "Projects User", "System Manager"], doctypes: ["Project"] },
          reads: ["Digit Client Contract", "Digit Tender", "Digit Project Cost Budget", "Digit Subcontract Work Order", "Digit Work Package"],
          visibility: "ALWAYS", placement: "after_content",
          states: { empty: ["No construction projects in this scope.", "لا توجد مشاريع مقاولات في هذا النطاق."], denied: ["Your role cannot read Project records.", "دورك لا يسمح بقراءة سجلات المشاريع."] },
        }],
      })), ...shared, ...pagesOf],
    },
    adapters: { [`${APP}.portfolio_status`]: portfolioStatus },
    adoptions: ADOPTIONS,
  };
}
