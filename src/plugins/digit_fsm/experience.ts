/**
 * DIGIT FSM + ITM's shared-experience declaration (src/plugins/experience/contract.ts), derived only from screens.ts:
 *   - the contextual destinations (FSM_DESTINATIONS, Overview · Work · Documents · Reports · Details), each linked to the
 *     N/X screen ids it carries: the screen whose route it is, its Documents ids (`docs`), the queue screens of its
 *     Work tab (`queue/<key>`) and the report-view screens of its Reports tab (`reports/<RP>`);
 *   - the nine group directories (`modules/<key>`, GroupWorkspacePage) listing every screen of the group plus its
 *     cross-links (FSM_CROSS_LINKS), and the two separate experiences (technician workspace, portal preview hub).
 * Registers list the kit's N01–N88 + P01–P08 ids (FSM_SCREENS) and the X01–X09 registers (FSM_EXTRA_NAV), so the
 * registry's coverage shows which ids a registered screen links. ITM ships inside this app — there is no separate
 * digit_itm plugin, so ITM resolves NOT_REGISTERED on its own. Traceability only — no FSM screen changes.
 */
import { FSM_CROSS_LINKS, FSM_DESTINATIONS, FSM_EXPERIENCES, FSM_EXTRA_NAV, FSM_MODULES, FSM_SCREENS, groupScreens, type FsmDestination } from "./screens";
import { EXPERIENCE_CONTRACT_VERSION, type ExperienceDeclaration, type ScreenExperience } from "../experience/contract";

const APP = "digit_fsm";
const BASE = "/plugins/digit_fsm";
const ALL = [...FSM_SCREENS, ...FSM_EXTRA_NAV];
const slug = (k: string) => k.toLowerCase().replace(/[^a-z0-9_-]/g, "_");
const uniq = (ids: string[]) => [...new Set(ids)];
const routeOf = (to: string) => (to ? `${BASE}/${to.split("?")[0]}` : BASE);

/** N/X screen ids a destination carries, in tab order: its own page, Documents, Work queues, Reports views. */
export function destinationFeatureIds(d: FsmDestination): string[] {
  const at = (to: string) => ALL.filter((s) => s.to === to).map((s) => s.id);
  return uniq([
    ...(d.to.startsWith("ws/") ? [] : at(d.to)),
    ...d.docs.filter((id) => ALL.some((s) => s.id === id)),
    ...d.queues.flatMap((q) => at(`queue/${q}`)),
    ...d.reports.flatMap((rp) => at(`reports/${rp}`)),
  ]);
}

type Screen = Omit<ScreenExperience, "blocks"> & { blocks: [] };
const screen = (s: Omit<Screen, "roles" | "companyScope" | "mountMode" | "blocks" | "stateCapabilities">): Screen => ({
  ...s, roles: [], companyScope: "company", mountMode: "APP_RENDERER", blocks: [], stateCapabilities: ["OK", "LOADING", "EMPTY", "DENIED"],
});

export function digitFsmExperience(): ExperienceDeclaration {
  const destinations = FSM_DESTINATIONS.map((d) => screen({
    screenId: `${APP}.dest.${slug(d.key)}`, title: [d.label, d.label_ar], featureIds: destinationFeatureIds(d), department: d.group,
    approvedTabs: ["overview", "documents", "reports"], route: routeOf(d.to),
    rendererOwner: "src/plugins/digit_fsm (destination workspace)", sourceContract: `screens.ts FSM_DESTINATIONS.${d.key}`,
  }));
  const groups = FSM_MODULES.map((m) => screen({
    screenId: `${APP}.group.${slug(m.key)}`, title: [m.label, m.label_ar],
    featureIds: uniq([...groupScreens(m.key).map((s) => s.id), ...(FSM_CROSS_LINKS[m.key] ?? [])]), department: m.key, approvedTabs: [],
    route: `${BASE}/modules/${m.key.toLowerCase()}`, rendererOwner: "src/plugins/digit_fsm/ui/workspace.tsx GroupWorkspacePage", sourceContract: `screens.ts FSM_MODULES.${m.key} + groupScreens + FSM_CROSS_LINKS`,
  }));
  const hubs = FSM_EXPERIENCES.map((x) => screen({
    screenId: `${APP}.hub.${slug(x.to)}`, title: [x.label, x.label_ar], featureIds: groupScreens(x.key).map((s) => s.id), department: x.key, approvedTabs: [],
    route: `${BASE}/${x.to}`, rendererOwner: `src/plugins/digit_fsm/ui/workspace.tsx ${x.key === "FIELD" ? "FieldHubPage" : "PortalHubPage"}`, sourceContract: `screens.ts FSM_EXPERIENCES.${x.key}`,
  }));
  return {
    experience: {
      appId: APP, contractVersion: EXPERIENCE_CONTRACT_VERSION, runtime: "VIRTUAL_PLUGIN", sourceVersion: "digit_fsm screens.ts",
      entryRoute: BASE, owner: APP, title: ["DIGIT FSM + ITM", "ديجيت للخدمة الميدانية وإدارة تقنية المعلومات"],
      supportedSharedPatterns: ["shell", "navigation", "rtl", "states", "report_runner"],
      registers: [
        { id: "fsm_screens", label: ["FSM/ITM kit screens (N01–N88, P01–P08)", "شاشات FSM/ITM (N01–N88، P01–P08)"], count: FSM_SCREENS.length, evidence: "src/plugins/digit_fsm/screens.ts FSM_SCREENS", ids: FSM_SCREENS.map((s) => s.id) },
        { id: "fsm_registers", label: ["FSM registers outside the kit numbering (X01–X09)", "سجلات FSM خارج ترقيم الحزمة (X01–X09)"], count: FSM_EXTRA_NAV.length, evidence: "src/plugins/digit_fsm/screens.ts FSM_EXTRA_NAV", ids: FSM_EXTRA_NAV.map((s) => s.id) },
      ],
      screens: [...destinations, ...groups, ...hubs],
    },
  };
}
