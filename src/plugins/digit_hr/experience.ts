/**
 * DIGIT HR's shared-experience declaration (src/plugins/experience/contract.ts). HR owns the data, permissions and
 * definitions: its screens are the existing module homes (/digit-hr/m/01–07), section workspaces (/digit-hr/s/<id>) and
 * Employee 360, traced to the 98 v5 screen contracts (v5/data.ts SCREENS) by section. The one shared Overview block reads
 * Employee through HR's identity-scoped reader (compat/scope.ts), so the Core never computes HR figures.
 */
import { scopedList, canReadType, readLimited } from "./compat/scope";
import { MODULES, SECTIONS, SCREENS } from "./v5/data";
import { HR_PAGES } from "@/components/digithr/navigation";
import { EXPERIENCE_CONTRACT_VERSION, type Adoption, type AdapterInput, type AdapterResult, type ExperienceDeclaration } from "../experience/contract";
import type { SeriesPoint } from "@/lib/dashboards/registry";

const APP = "digit_hr";
/** Native Employee.status options in their source order (erpnext/setup/doctype/employee/employee.json). */
const EMPLOYEE_STATUS = ["Active", "Inactive", "Suspended", "Left"] as const;
const HR_ROLES = ["HR Manager", "HR User", "System Manager"];
/** HR's own wording for the status options (same as components/digithr/ui.tsx StatusBadge). */
const STATUS_LABEL: Record<string, [string, string]> = { Active: ["Active", "نشط"], Inactive: ["Inactive", "غير نشط"], Suspended: ["Suspended", "موقوف"], Left: ["Left", "غادر"] };

type Sec = { id: string; module: string; ar: string; en: string };
type Scr = { id: string; sub: string };
const sections = SECTIONS as Sec[];
const screens = SCREENS as Scr[];
const screenIdsOf = (secs: Sec[]) => { const subs = new Set(secs.map((s) => s.ar)); return screens.filter((s) => subs.has(s.sub)).map((s) => s.id); };

/** Workforce by employment status: Employee rows the user may read (HR identity + User Permission scope), optionally one company. */
export function workforceStatus(i: AdapterInput): AdapterResult {
  if (!canReadType("Employee", i.user)) return { state: "DENIED" };
  const rows = scopedList("Employee", i.user).filter((e) => !i.company || e["company"] === i.company);
  const limited = readLimited("Employee", i.user);
  if (!rows.length) return { state: "EMPTY", total: 0, limited };
  const by = new Map<string, number>();
  for (const e of rows) { const s = String(e["status"] ?? "") || "—"; by.set(s, (by.get(s) ?? 0) + 1); }
  const order = [...EMPLOYEE_STATUS.filter((s) => by.has(s)), ...[...by.keys()].filter((s) => !(EMPLOYEE_STATUS as readonly string[]).includes(s))];
  const scope: [string, string, unknown][] = i.company ? [["company", "=", i.company]] : [];
  const points: SeriesPoint[] = order.map((s) => ({ key: s, label: s, value: by.get(s) ?? 0, drill: { doctype: "Employee", filters: [["status", "=", s], ...scope] } }));
  return { state: "OK", total: rows.length, limited, labels: STATUS_LABEL, data: { kind: "series", status: "ok", points, valueLabel: ["Employees", "الموظفون"] } };
}

const ADOPTIONS: Adoption[] = [
  { sourceApp: "digit_core", sourceFeatureId: "shared.overview_block.status_breakdown", sharedPatternId: "overview_block", targetApp: APP, decision: "REUSE", ownerApproval: "APPROVED", evidence: "src/components/experience/ExperienceBlocks.tsx on /digit-hr/m/01 via digit_hr.workforce_status (browser AR/EN 1440+390, admin + restricted users, 2026-11-09; experience.test.ts)", implementationState: "VERIFIED_IN_CURRENT_LOVABLE" },
  { sourceApp: "digit_pro", sourceFeatureId: "DashboardDesigner (proDashboards.tsx)", sharedPatternId: "dashboard_designer", targetApp: APP, decision: "REUSE", ownerApproval: "APPROVED", evidence: "src/components/digithr/workspace/Composer.tsx registers HR contracts on the shared DashboardDesigner", implementationState: "IMPLEMENTED_NEEDS_RUNTIME_PROOF" },
  { sourceApp: "digit_pro", sourceFeatureId: "three_tab_workspace", sharedPatternId: "three_tab_workspace", targetApp: APP, decision: "DOMAIN_ONLY", ownerApproval: "NOT_REQUIRED", evidence: "HR keeps its approved module/section structure (v5 blueprint); three-tab rule is the Pro/Construction contract", implementationState: "VERIFIED_IN_CURRENT_LOVABLE" },
];

export function digitHrExperience(): ExperienceDeclaration {
  const modules = MODULES as { id: string; ar: string; en: string }[];
  return {
    experience: {
      appId: APP, contractVersion: EXPERIENCE_CONTRACT_VERSION, runtime: "VIRTUAL_PLUGIN", sourceVersion: "digit_hr v5 blueprint (src/plugins/digit_hr/v5/data.ts)",
      entryRoute: "/digit-hr", owner: APP, title: ["DIGIT HR", "ديجيت للموارد البشرية"],
      supportedSharedPatterns: ["shell", "navigation", "rtl", "states", "dashboard_designer", "overview_block", "record_360", "report_runner"],
      registers: [{ id: "hr_v5_screens", label: ["HR v5 screen contracts", "عقود شاشات الموارد البشرية v5"], count: screens.length, evidence: "src/plugins/digit_hr/v5/data.ts SCREENS", ids: screens.map((s) => s.id) }],
      screens: [
        ...modules.map((m) => ({
          screenId: `${APP}.module.${m.id}`, title: [m.en, m.ar] as [string, string], featureIds: screenIdsOf(sections.filter((s) => s.module === m.id)),
          department: m.id, approvedTabs: [], route: `/digit-hr/m/${m.id}`, roles: [], companyScope: "company" as const,
          rendererOwner: "src/routes/digit-hr.m.$module.tsx + components/digithr/workspace/Composer.tsx", mountMode: "APP_RENDERER" as const,
          sourceContract: "v5/data.ts MODULES", stateCapabilities: ["OK", "LOADING", "EMPTY", "DENIED", "ERROR", "CONTRACT_NOT_READY"] as ("OK" | "LOADING" | "EMPTY" | "DENIED" | "ERROR" | "CONTRACT_NOT_READY")[],
          blocks: m.id !== "01" ? [] : [
            {
              semanticBlockId: `${APP}.workforce_status`, title: ["Workforce by status", "القوى العاملة حسب الحالة"] as [string, string], componentKind: "overview" as const, presentationVariant: "status-breakdown" as const,
              ownerApiOrAdapterId: `${APP}.workforce_status`, inputSchema: { company: "optional" as const },
              source: { kind: "DocType" as const, name: "Employee", definition: ["Employee records you may read, grouped by the native status field.", "سجلات الموظفين المسموح لك بقراءتها مجمّعة حسب حقل الحالة الأصلي."] as [string, string] },
              filters: [], period: "AS_OF_TODAY" as const, drill: { doctype: "Employee" }, permission: { roles: HR_ROLES, doctypes: ["Employee"] }, reads: [], visibility: "ALWAYS" as const, placement: "after_content" as const,
              states: { empty: ["No employee records in this scope.", "لا توجد سجلات موظفين في هذا النطاق."] as [string, string], denied: ["Your role cannot read Employee records.", "دورك لا يسمح بقراءة سجلات الموظفين."] as [string, string] },
            },
            {
              semanticBlockId: `${APP}.module_home_contract`, title: ["HR module home (server contract)", "الصفحة الرئيسية للوحدة (عقد الخادم)"] as [string, string], componentKind: "overview" as const, presentationVariant: "status-breakdown" as const,
              ownerApiOrAdapterId: "server:digit_hr.api.workspace.module_home", inputSchema: { company: "optional" as const },
              source: { kind: "ServerMethod" as const, name: "digit_hr.api.workspace.module_home", definition: ["DIGIT whitelisted method declared in the Enterprise APP_CONTRACTS.", "دالة DIGIT معتمدة ومعلنة في عقود تطبيقات المؤسسة."] as [string, string] },
              filters: [], period: "AS_OF_TODAY" as const, drill: { doctype: "Employee" }, permission: { roles: ["HR Manager", "System Manager"], doctypes: ["Employee"] }, reads: [], visibility: "DEV_ONLY" as const, placement: "after_content" as const,
              states: { empty: ["No data.", "لا توجد بيانات."] as [string, string], denied: ["Not permitted.", "غير مسموح."] as [string, string] },
            },
          ],
        })),
        ...sections.map((s) => ({
          screenId: `${APP}.section.${s.id.replace(/\./g, "_")}`, title: [s.en, s.ar] as [string, string], featureIds: screenIdsOf([s]), department: s.module, section: s.id,
          approvedTabs: [], route: `/digit-hr/s/${s.id}`, roles: [], companyScope: "company" as const, rendererOwner: "src/routes/digit-hr.s.$section.tsx", mountMode: "APP_RENDERER" as const,
          blocks: [], sourceContract: "v5/data.ts SECTIONS", stateCapabilities: ["OK", "LOADING", "EMPTY", "DENIED"] as ("OK" | "LOADING" | "EMPTY" | "DENIED")[],
        })),
        // HR's dedicated pages as HR's page registry names them (components/digithr/navigation.ts HR_PAGES: route → section).
        // /digit-hr (Mission Control, section 06.1) and /digit-hr/reports (Report Center) are HR's cross-module utilities
        // (docs/digit_hr/nb1/TOKENS_AND_NAVIGATION.md), the other pages are section boards of the section they name.
        ...HR_PAGES.map((pg) => {
          const sec = sections.find((s) => s.id === pg.section);
          const cross = pg.to === "/digit-hr" || pg.to === "/digit-hr/reports";
          const tail = pg.to.slice("/digit-hr".length).replace(/^\//, "") || "home";
          return {
            screenId: `${APP}.page.${tail}`, title: [pg.en, pg.ar] as [string, string], featureIds: sec ? screenIdsOf([sec]) : [], kind: (cross ? "GLOBAL" : "WORKSPACE") as "GLOBAL" | "WORKSPACE",
            ...(sec ? { department: sec.module, section: sec.id } : {}), approvedTabs: [], route: pg.to, roles: [], companyScope: "company" as const,
            rendererOwner: `src/routes/digit-hr.${tail === "home" ? "index" : tail === "employees" ? "employees.index" : tail}.tsx`, mountMode: "APP_RENDERER" as const, blocks: [],
            sourceContract: `components/digithr/navigation.ts HR_PAGES (section ${pg.section})`, stateCapabilities: ["OK", "LOADING", "EMPTY", "DENIED"] as ("OK" | "LOADING" | "EMPTY" | "DENIED")[],
          };
        }),
        { screenId: `${APP}.employee_360`, title: ["Employee 360", "ملف الموظف 360"], featureIds: [], approvedTabs: [], route: "/digit-hr/employees/$name", roles: [], companyScope: "company", rendererOwner: "src/routes/digit-hr.employees.$name.tsx", mountMode: "APP_RENDERER", blocks: [], sourceContract: "Employee (native) + HR identity scope", stateCapabilities: ["OK", "LOADING", "DENIED"] },
      ],
    },
    adapters: { [`${APP}.workforce_status`]: workforceStatus },
    adoptions: ADOPTIONS,
  };
}
