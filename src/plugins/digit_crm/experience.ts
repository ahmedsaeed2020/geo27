/**
 * DIGIT CRM's shared-experience declaration (src/plugins/experience/contract.ts): its seven module workspaces
 * (modules.ts MODULE_IDS, CRM's own five-tab structure) plus the Reports & Intelligence pages, which no module owns.
 * Each screen links the research IA node ids (workspaces.ts IA_NODES, 37) it serves, derived from CRM's own menu:
 * a node belongs to the menu group whose item owns its route (nav.ts groupOfPath); a node whose route is not a menu
 * item (e.g. the ERPNext Quotation hand-off) follows the group of its department's other nodes; a module with a `docs`
 * filter (Customer Health) links only the nodes of those sections. Traceability only — no shared block, no CRM screen
 * changes.
 */
import { MODULE_IDS, MODULES, TABS, workspacePath, type ModuleSpec } from "./modules";
import { CRM_NAV, groupOfPath, type NavItem } from "./nav";
import { IA_NODES, type IaNode } from "./workspaces";
import { EXPERIENCE_CONTRACT_VERSION, type ExperienceDeclaration } from "../experience/contract";

const APP = "digit_crm";
const norm = (p: string) => p.replace(/\/$/, "") || "/";
const owns = (i: NavItem, route: string) => { const p = norm(route); return !!i.to && (p === i.to || (i.to !== "/digit-crm" && p.startsWith(i.to + "/"))); };

/** Menu group whose item owns the route; undefined when groupOfPath only fell back to the first group. */
function strictGroup(route: string): string | undefined {
  const g = groupOfPath(route);
  if (g.id !== CRM_NAV[0]?.id) return g.id;
  return g.items.some((i) => owns(i, route)) ? g.id : undefined;
}

/** Menu group of every IA node (own route first, else its department's). */
export function iaNodeGroups(): Map<string, string> {
  const own = new Map(IA_NODES.map((n) => [n.id, strictGroup(n.route)] as const));
  const ofDept = (n: IaNode) => IA_NODES.find((x) => x.dept && x.dept === n.dept && own.get(x.id))?.id;
  return new Map(IA_NODES.flatMap((n) => {
    const g = own.get(n.id) ?? own.get(ofDept(n) ?? "");
    return g ? [[n.id, g] as const] : [];
  }));
}

/** IA node ids a module workspace serves. */
function moduleNodes(m: ModuleSpec, groups: Map<string, string>): string[] {
  const nav = CRM_NAV.find((g) => g.id === m.nav);
  const sections = m.docs && nav ? nav.items.filter((i) => m.docs!.includes(i.label)) : null;
  return IA_NODES.filter((n) => groups.get(n.id) === m.nav && (!sections || sections.some((i) => owns(i, n.route)))).map((n) => n.id);
}

export function digitCrmExperience(): ExperienceDeclaration {
  const groups = iaNodeGroups();
  const moduleNavs = new Set(MODULE_IDS.map((m) => MODULES[m].nav));
  /** Pages of menu groups no module owns (Reports & Intelligence): one screen per route, linking the nodes it serves. */
  const pageRoutes = [...new Set(IA_NODES.filter((n) => !moduleNavs.has(groups.get(n.id) ?? "")).map((n) => norm(n.route)))];
  const pages = pageRoutes.map((route) => {
    const label = CRM_NAV.flatMap((g) => g.items).find((i) => i.to === route && !i.search)?.label ?? IA_NODES.find((n) => norm(n.route) === route)!.label;
    const seg = route.split("/").filter(Boolean).pop() ?? "page";
    return {
      screenId: `${APP}.page.${seg.replace(/[^a-z0-9_-]/g, "_")}`, title: [label, label] as [string, string], featureIds: IA_NODES.filter((n) => norm(n.route) === route).map((n) => n.id),
      department: groups.get(IA_NODES.find((n) => norm(n.route) === route)!.id) ?? "", approvedTabs: [], route, roles: [], companyScope: "company" as const,
      rendererOwner: `src/routes${route.replace(/\//g, ".")}.tsx`, mountMode: "APP_RENDERER" as const, blocks: [], sourceContract: `nav.ts CRM_NAV item ${route}`, stateCapabilities: ["OK", "LOADING", "EMPTY", "DENIED"] as ("OK" | "LOADING" | "EMPTY" | "DENIED")[],
    };
  });
  return {
    experience: {
      appId: APP, contractVersion: EXPERIENCE_CONTRACT_VERSION, runtime: "VIRTUAL_PLUGIN", sourceVersion: "digit_crm modules.ts + workspaces.ts IA_NODES",
      entryRoute: "/digit-crm/home", owner: APP, title: ["DIGIT CRM", "ديجيت لإدارة العملاء"],
      supportedSharedPatterns: ["shell", "navigation", "rtl", "states", "dashboard_designer", "report_runner"],
      registers: [{ id: "crm_ia_nodes", label: ["CRM research IA nodes", "عُقد هيكلة معلومات CRM البحثية"], count: IA_NODES.length, evidence: "src/plugins/digit_crm/workspaces.ts IA_NODES", ids: IA_NODES.map((n) => n.id) }],
      screens: [
        ...MODULE_IDS.map((m) => {
          const t = MODULES[m].title || m;
          return {
            screenId: `${APP}.module.${m}`, title: [t, t] as [string, string], featureIds: moduleNodes(MODULES[m], groups), department: m, approvedTabs: [...TABS], route: workspacePath(m), roles: [], companyScope: "company" as const,
            rendererOwner: "src/plugins/digit_crm (module workspace)", mountMode: "APP_RENDERER" as const, blocks: [], sourceContract: `modules.ts MODULES.${m}`, stateCapabilities: ["OK", "LOADING", "EMPTY", "DENIED"] as ("OK" | "LOADING" | "EMPTY" | "DENIED")[],
          };
        }),
        ...pages,
      ],
    },
  };
}
