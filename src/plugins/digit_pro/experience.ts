/**
 * DIGIT Pro's shared-experience declaration (src/plugins/experience/contract.ts): the 20 section workspaces
 * (nav.ts SECTION_PAGES, exactly three tabs RUN11_TABS, rendered by SectionWorkspace.tsx), the five department homes and
 * the executive dashboard, each linking the original Run11.1 ids whose approved destination it is (run11Catalog.ts:
 * 321 requirement + 448 placement ids with evidence statuses). Pro declares no shared Overview block: its approved
 * dashboards stay its own (proDashboards.tsx), so this declaration is traceability only and changes no Pro screen.
 */
import { CONTEXTS, DEPARTMENTS, NAV_AR, SECTION_PAGES, SERVICES, type DeptId, type NavTarget } from "./nav";
import { RUN11_SLICE, RUN11_TABS, RUN11_ROLLOUT } from "./run11";
import { RUN11_CATALOG_META, run11Catalog } from "./run11Catalog";
import { EXPERIENCE_CONTRACT_VERSION, type Adoption, type ExperienceDeclaration } from "../experience/contract";

const APP = "digit_pro";

const ADOPTIONS: Adoption[] = [
  { sourceApp: "digit_pro", sourceFeatureId: "three_tab_workspace", sharedPatternId: "three_tab_workspace", targetApp: APP, decision: "REUSE", ownerApproval: "APPROVED", evidence: `20 SECTION_PAGES × RUN11_TABS (${RUN11_ROLLOUT})`, implementationState: "IMPLEMENTED_NEEDS_RUNTIME_PROOF" },
  { sourceApp: "digit_core", sourceFeatureId: "shared.overview_block.status_breakdown", sharedPatternId: "overview_block", targetApp: APP, decision: "DEFER", ownerApproval: "PENDING", evidence: "Pro dashboards already carry sourced KPIs; adding a shared block needs owner placement (PLACEMENTS_448)", implementationState: "ADOPTION_PENDING" },
];

const DEPTS: [DeptId, string][] = [["accounting", "Accounting"], ["selling", "Selling"], ["purchasing", "Purchasing"], ["inventory", "Inventory"], ["assets", "Fixed Assets"]];
const srcEvidence = (file: string) => { const k = Object.keys(RUN11_CATALOG_META.sources).find((x) => x.endsWith(file))!; return `${k} sha256 ${RUN11_CATALOG_META.sources[k]!.slice(0, 16)}… (owner knowledge pack, imported by scripts/pro-run11-catalog.py)`; };

/**
 * Pro's dedicated pages (/pro/finance, /pro/selling-overview, /pro/general-ledger, …) as Pro's own navigation source names
 * them (nav.ts: department homes and section items, the executive context, the shared services). One screen per route,
 * labelled by its first plain (no worklist search) nav item; the department it is listed under, if any, is kept.
 * Routes already declared (department homes /pro/<dept>, the executive dashboard) and /pro/home (the role-based entry
 * redirect, never a page of its own) are not pages here.
 */
export function proNavPages(): { to: string; label: string; dept?: DeptId; source: string }[] {
  const out = new Map<string, { to: string; label: string; dept?: DeptId; source: string }>();
  const take = (label: unknown, t: NavTarget | undefined, source: string, dept?: DeptId) => {
    if (!t || t.kind !== "pro" || t.search || typeof label !== "string" || out.has(t.to)) return;
    out.set(t.to, { to: t.to, label, ...(dept ? { dept } : {}), source });
  };
  const items = (xs: unknown, source: string, dept?: DeptId) => { for (const i of (Array.isArray(xs) ? xs : []) as { label?: unknown; target?: NavTarget }[]) take(i.label, i.target, source, dept); };
  for (const d of DEPARTMENTS) {
    take(d.home.label, d.home.target, `nav.ts DEPARTMENTS ${d.id} home`, d.id);
    for (const sct of d.sections) { items(sct.items, `nav.ts DEPARTMENTS ${d.id} section ${sct.id}`, d.id); items(sct.more, `nav.ts DEPARTMENTS ${d.id} section ${sct.id} (more)`, d.id); }
    for (const g of d.extra) items(g.items, `nav.ts DEPARTMENTS ${d.id} extra`, d.id);
  }
  for (const c of CONTEXTS) { take(c.home?.label, c.home?.target, `nav.ts CONTEXTS ${c.id} home`); items(c.links, `nav.ts CONTEXTS ${c.id}`); for (const sct of c.sections ?? []) items(sct.items, `nav.ts CONTEXTS ${c.id} section ${sct.id}`); }
  for (const sv of SERVICES) if (!out.has(sv.to)) out.set(sv.to, { to: sv.to, label: sv.label, source: `nav.ts SERVICES ${sv.id}` });
  const declared = new Set(["/pro/dashboard", "/pro/home", ...DEPTS.map(([d]) => `/pro/${d}`)]);
  return [...out.values()].filter((p) => !declared.has(p.to));
}

export function digitProExperience(): ExperienceDeclaration {
  const cat = run11Catalog();
  const at = (dest: string) => [...(cat.placements.byDestination.get(dest) ?? []), ...(cat.requirements.byDestination.get(dest) ?? [])];
  const state = ["OK", "LOADING", "EMPTY", "DENIED", "ERROR"] as const;
  return {
    experience: {
      appId: APP, contractVersion: EXPERIENCE_CONTRACT_VERSION, runtime: "VIRTUAL_PLUGIN", sourceVersion: RUN11_ROLLOUT,
      entryRoute: "/pro/home", owner: APP, title: ["DIGIT Pro", "ديجيت برو"],
      supportedSharedPatterns: ["shell", "navigation", "rtl", "states", "three_tab_workspace", "dashboard_designer", "document_hub", "report_runner"],
      registers: [
        { id: "run11_requirements", label: ["Run11.1 requirement IDs", "معرّفات متطلبات Run11.1"], count: cat.requirements.ids.length, evidence: srcEvidence("MASTER_321_REQUIREMENTS_TARGET_NOT_LIVE.csv"), ids: cat.requirements.ids, statuses: cat.requirements.statuses, reasons: cat.requirements.reasons },
        { id: "run11_placements", label: ["Run11.1 UI placements", "مواضع واجهة Run11.1"], count: cat.placements.ids.length, evidence: srcEvidence("PLACEMENTS_448_RUN11_1.csv"), ids: cat.placements.ids, statuses: cat.placements.statuses, reasons: cat.placements.reasons },
      ],
      screens: [
        ...SECTION_PAGES.map((p) => ({
          screenId: `${APP}.ws.${p.id.toLowerCase()}`, title: [p.label, NAV_AR[p.label] ?? p.label] as [string, string], featureIds: at(`ws:${p.id}`), kind: "WORKSPACE" as const, department: p.dept, section: p.slug, workspace: p.id,
          approvedTabs: [...RUN11_TABS], route: `/pro/${p.dept}/${p.slug}`, roles: [], companyScope: "company" as const, rendererOwner: "src/plugins/digit_pro/SectionWorkspace.tsx", mountMode: "APP_RENDERER" as const,
          blocks: [], sourceContract: RUN11_SLICE.has(p.id) ? "run11.ts PLACEMENTS (mapped) + run11Catalog (source ids)" : "run11Rollout.ts PLACEMENTS (crosswalked) + run11Catalog (source ids)", stateCapabilities: [...state],
        })),
        // department homes and the executive dashboard: destinations of the department-level and executive requirement ids
        ...DEPTS.map(([d, label]) => ({
          screenId: `${APP}.dept.${d}`, title: [label, NAV_AR[label] ?? label] as [string, string], featureIds: at(`dept:${d}`), kind: "GLOBAL" as const, department: d, approvedTabs: [], route: `/pro/${d}`, roles: [],
          companyScope: "company" as const, rendererOwner: "src/plugins/digit_pro/DeptWorkspace.tsx", mountMode: "APP_RENDERER" as const, blocks: [], sourceContract: "run11Catalog department column", stateCapabilities: [...state],
        })),
        // dedicated Pro pages named by Pro's navigation source (proNavPages); Customer 360 is one Customer's record profile
        ...proNavPages().map((p) => ({
          screenId: `${APP}.page.${p.to.slice("/pro/".length).replace(/\//g, ".")}`, title: [p.label, NAV_AR[p.label] ?? p.label] as [string, string], featureIds: [], kind: (["/pro/customer-360", "/pro/supplier-360", "/pro/item-360", "/pro/asset-360"].includes(p.to) ? "PROFILE" : "GLOBAL") as "PROFILE" | "GLOBAL",
          ...(p.dept ? { department: p.dept } : {}), approvedTabs: [], route: p.to, roles: [], companyScope: "company" as const, rendererOwner: `src/routes/pro.${p.to.slice("/pro/".length).replace(/\//g, ".")}.tsx`,
          mountMode: "APP_RENDERER" as const, blocks: [], sourceContract: `${p.source} "${p.label}"`, stateCapabilities: [...state],
        })),
        { screenId: `${APP}.global.dashboard`, title: ["Executive dashboard", "اللوحة التنفيذية"], featureIds: at("exec"), kind: "GLOBAL", approvedTabs: [], route: "/pro/dashboard", roles: [], companyScope: "company",
          rendererOwner: "src/plugins/digit_pro/MainDashboard.tsx (ExecQuestions.tsx)", mountMode: "APP_RENDERER", blocks: [], sourceContract: "run11Catalog Executive department + EXE-01…12", stateCapabilities: [...state] },
      ],
    },
    adoptions: ADOPTIONS,
  };
}
