/**
 * DIGIT shared-experience contract v1 (owner goal DIGIT_ENTERPRISE_LOVABLE_FULL_REPAIR_GOAL_20261109, Slice A).
 *
 * A versioned, typed description of WHERE an installed DIGIT app's screens live and WHICH shared presentation blocks they
 * opt into. It sits on top of the existing plugin registry (src/plugins/registry.ts) and experience slots
 * (src/plugins/slotRegistry.ts): it never replaces routes, renderers or app data. Apps own data, permissions, workflows
 * and formulas through their own adapters; the Core only resolves and renders. Frappe-host contracts (the Enterprise
 * archive's api/apps.py + api/shared.py APP_CONTRACTS) are mirrored as labels — a server method id is only a string here
 * and is never imported or called from the browser.
 *
 * Schema validation is strict (zod, unknown keys rejected) so an incompatible or malformed registration fails closed
 * with a diagnostic instead of granting access.
 */
import { z } from "zod";
import type { Bi } from "@/lib/dashboards/views";
import type { WidgetData } from "@/lib/dashboards/registry";

export const EXPERIENCE_CONTRACT_VERSION = 1;

export const RUNTIMES = ["VIRTUAL_PLUGIN", "FRAPPE_HOST", "COMPILED_EXTENSION"] as const;
export type Runtime = (typeof RUNTIMES)[number];

/** Distinct outcomes a shared block may report (never collapsed into a fake 0 or an empty "success"). */
export const BLOCK_STATES = ["OK", "LOADING", "EMPTY", "TRUE_ZERO", "NOT_CONFIGURED", "NO_HISTORY", "PARTIAL", "DENIED", "ERROR", "CONTRACT_NOT_READY"] as const;
export type BlockState = (typeof BLOCK_STATES)[number];

/** App discovery outcome for one user (fail-closed: anything but OK shows no enabled link and no data). */
export const APP_ACCESS = ["OK", "NOT_REGISTERED", "NOT_INSTALLED", "PERMISSION_DENIED", "INCOMPATIBLE"] as const;
export type AppAccess = (typeof APP_ACCESS)[number];

/** Shared patterns. Mandatory ones every app with a registered experience uses; optional ones are opted into per app. */
export const MANDATORY_PATTERNS = ["shell", "navigation", "rtl", "states"] as const;
export const OPTIONAL_PATTERNS = ["three_tab_workspace", "dashboard_designer", "document_hub", "overview_block", "report_runner", "record_360"] as const;
export const SHARED_PATTERNS = [...MANDATORY_PATTERNS, ...OPTIONAL_PATTERNS] as const;
export type SharedPattern = (typeof SHARED_PATTERNS)[number];

/** Who renders the screen body: the app's own renderer (shared blocks are additive), or only a Frappe host. */
export const MOUNT_MODES = ["APP_RENDERER", "FRAPPE_HOST_ONLY"] as const;
export const COMPONENT_KINDS = ["overview"] as const;
export const PRESENTATION_VARIANTS = ["status-breakdown"] as const;
export const ADOPTION_DECISIONS = ["REUSE", "ADAPT", "DOMAIN_ONLY", "N_A", "DEFER"] as const;
export const IMPLEMENTATION_STATES = ["VERIFIED_IN_CURRENT_LOVABLE", "IMPLEMENTED_NEEDS_RUNTIME_PROOF", "PARTIAL", "BLOCKED", "NOT_STARTED", "ADOPTION_PENDING"] as const;
export type ImplementationState = (typeof IMPLEMENTATION_STATES)[number];

/** Where a registered screen sits (owner brief 2026-11-10 "LOVABLE NEXT GOAL"): a page inside a workspace, an
 *  app-level page outside every workspace, a record profile, an action surfaced on other screens, or a mobile route.
 *  Absent = WORKSPACE, so v1 declarations written before this field keep their meaning. */
export const SCREEN_KINDS = ["WORKSPACE", "GLOBAL", "PROFILE", "CONTEXTUAL_ACTION", "MOBILE_ROUTE"] as const;
export type ScreenKind = (typeof SCREEN_KINDS)[number];

/** Evidence status of one register id. Set only from evidence (a source table, a browser receipt of this run);
 *  UNMATCHED_SOURCE_REQUIRED = the id has no source in this project and stays out of "not linked" until the owner
 *  supplies one, so a missing source is never hidden by an arbitrary mapping. */
export const TRACE_STATUSES = ["VISIBLE_VERIFIED", "HIDDEN_AFTER_LOAD", "EXISTS_NOT_MOUNTED", "BACKEND_ONLY", "CONTRACT_ONLY", "DUPLICATE", "POLICY_REQUIRED", "NOT_INSPECTED", "PROVEN_MISSING", "UNMATCHED_SOURCE_REQUIRED"] as const;
export type TraceStatus = (typeof TRACE_STATUSES)[number];

const ID = /^[a-z][a-z0-9_]*(\.[a-z0-9][a-z0-9_-]*)+$/;
const APP_ID = /^[a-z][a-z0-9_]*$/;
const bi = z.tuple([z.string().min(1), z.string().min(1)]);
/** An in-app path ("/digit-hr/m/01"); never an absolute URL or a script. */
const route = z.string().regex(/^\/[A-Za-z0-9_\-./$]*$/, "route must be an in-app path");
const filter = z.tuple([z.string().min(1), z.string().min(1), z.unknown()]);

export const blockSchema = z.object({
  semanticBlockId: z.string().regex(ID),
  title: bi,
  componentKind: z.enum(COMPONENT_KINDS),
  presentationVariant: z.enum(PRESENTATION_VARIANTS),
  /** "<appId>.<name>" = an adapter the same app registers; "server:<appId>.<dotted>" = a Frappe whitelisted method (label only). */
  ownerApiOrAdapterId: z.string().regex(/^(server:)?[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$/),
  inputSchema: z.object({ company: z.enum(["optional", "none"]) }).strict(),
  source: z.object({ kind: z.enum(["DocType", "Report", "ServerMethod"]), name: z.string().min(1), definition: bi }).strict(),
  /** Static filters the adapter applies (also carried by the drill), e.g. [["status","=","Active"]]. */
  filters: z.array(filter),
  period: z.enum(["AS_OF_TODAY", "PERIOD"]),
  drill: z.object({ doctype: z.string().min(1) }).strict(),
  permission: z.object({ roles: z.array(z.string().min(1)), doctypes: z.array(z.string().min(1)).min(1) }).strict(),
  /** Further DocTypes the adapter reads through scoped readers (their definitions load first; not a permission requirement). */
  reads: z.array(z.string().min(1)),
  /** DEV_ONLY = preview diagnostic (Developer mode), never shown to business users. */
  visibility: z.enum(["ALWAYS", "DEV_ONLY"]),
  placement: z.enum(["after_content"]),
  states: z.object({ empty: bi, denied: bi }).strict(),
}).strict();

export const screenSchema = z.object({
  screenId: z.string().regex(ID),
  title: bi,
  featureIds: z.array(z.string().min(1)),
  kind: z.enum(SCREEN_KINDS).optional(),
  department: z.string().optional(),
  section: z.string().optional(),
  workspace: z.string().optional(),
  /** The approved in-content tabs of this screen (Pro / Construction: exactly three), or [] for app-specific structures. */
  approvedTabs: z.array(z.string().min(1)),
  route,
  actor: z.string().optional(),
  /** Roles that may open the screen (empty = the app's own entry rule only). */
  roles: z.array(z.string().min(1)),
  companyScope: z.enum(["company", "none"]),
  rendererOwner: z.string().min(1),
  mountMode: z.enum(MOUNT_MODES),
  blocks: z.array(blockSchema),
  sourceContract: z.string().min(1),
  stateCapabilities: z.array(z.enum(BLOCK_STATES)),
}).strict();

export const appSchema = z.object({
  appId: z.string().regex(APP_ID),
  contractVersion: z.number().int(),
  runtime: z.enum(RUNTIMES),
  sourceVersion: z.string().min(1),
  entryRoute: route,
  owner: z.string().min(1),
  title: bi,
  screens: z.array(screenSchema),
  supportedSharedPatterns: z.array(z.enum(SHARED_PATTERNS)),
  /** Historical per-ID registers this app's adoption is traced against (counts as recorded in the project, not proof).
   *  `ids` lists the register's ids when they live in app source; then `count` must equal it and registry.ts
   *  featureCoverage() reports which ids no registered screen links (unlinked) and which screen ids no register lists
   *  (unknown). Registers whose ids exist only in documents omit `ids` and stay count-only. `statuses` / `reasons`
   *  (keys must be listed ids) carry each id's evidence status and its one-line basis. */
  registers: z.array(z.object({
    id: z.string().min(1), label: bi, count: z.number().int().nonnegative(), evidence: z.string().min(1), ids: z.array(z.string().min(1)).optional(),
    statuses: z.record(z.string(), z.enum(TRACE_STATUSES)).optional(), reasons: z.record(z.string(), z.string().min(1)).optional(),
  }).strict()),
}).strict();

export type BlockExperience = z.infer<typeof blockSchema>;
export type ScreenExperience = z.infer<typeof screenSchema>;
export type AppExperience = z.infer<typeof appSchema>;

/** One adoption decision: a shared pattern taken (or not) from a source app's feature into a target app. */
export interface Adoption {
  sourceApp: string; sourceFeatureId: string; sharedPatternId: SharedPattern; targetApp: string;
  decision: (typeof ADOPTION_DECISIONS)[number];
  ownerApproval: "APPROVED" | "PENDING" | "NOT_REQUIRED";
  evidence: string;
  implementationState: ImplementationState;
}

/** What an app-owned adapter receives: the host's company (if any), today's date and the session user. */
export interface AdapterInput { company?: string | undefined; asOf: string; user: string }
export interface AdapterResult {
  state: BlockState;
  data?: WidgetData | undefined;
  /** Records counted (after permission scope). */
  total?: number | undefined;
  /** The user's read of the source is narrowed (only-if-creator / User Permission): figures are "limited to records you can see". */
  limited?: boolean | undefined;
  reason?: Bi | undefined;
  /** The owning app's display labels per point key (e.g. stored option "Left" → ["Left","غادر"]); stored values never change. */
  labels?: Record<string, Bi> | undefined;
}
export type ExperienceAdapter = (input: AdapterInput) => AdapterResult;

/** What an app module hands to the experience registry (src/plugins/experienceRegistry.ts). */
export interface ExperienceDeclaration { experience: unknown; adapters?: Record<string, ExperienceAdapter> | undefined; adoptions?: Adoption[] | undefined }
