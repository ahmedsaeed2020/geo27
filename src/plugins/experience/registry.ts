/**
 * Shared-experience registry (Slice A/F): registerAppExperience + fail-closed discovery + screen/block resolution.
 *
 * Extends — never replaces — the existing plugin registry: a VIRTUAL_PLUGIN experience must name a plugin of
 * src/plugins/registry.ts, its visibility follows the plugin's enabled state (runtime.ts) and the app's own entry roles
 * (enterprise.ts appPermitted), and its screens point at routes the app already renders. Registrations come from one line
 * per app in src/plugins/experienceRegistry.ts and are validated strictly; an invalid one is rejected with diagnostics and
 * its app resolves INCOMPATIBLE (no links, no data). Adapters are namespaced by the owning app id, so one app can never
 * feed another app's block, and a `server:` adapter id is a Frappe method label that this preview never calls.
 */
import type { Bi } from "@/lib/dashboards/views";
import { canReadType } from "@/lib/scope";
import { isServerHosted } from "@/lib/serverHost";
import { ADMIN, currentUser, userRoles } from "@/lib/session";
import { appPermitted } from "../enterprise";
import { slotsOf } from "../experienceSlots";
import { experienceDeclarations } from "../experienceRegistry";
import { allPlugins, isEnabled } from "../runtime";
import { appSchema, BLOCK_STATES, EXPERIENCE_CONTRACT_VERSION, MANDATORY_PATTERNS, type TraceStatus, type Adoption, type AppAccess, type AppExperience, type BlockExperience, type BlockState, type ExperienceAdapter, type ExperienceDeclaration, type ScreenExperience } from "./contract";
import { isHostApp } from "./hostApps";

export interface Rejection { appId: string; errors: string[] }
export interface ExperienceRegistry {
  apps: Map<string, AppExperience>;
  adapters: Map<string, ExperienceAdapter>;
  adoptions: Adoption[];
  rejected: Rejection[];
}

/** Context of the environment a registration is checked against (overridable in tests). */
export interface RegistryEnv { pluginNames: ReadonlySet<string> }
const defaultEnv = (): RegistryEnv => ({ pluginNames: new Set(allPlugins().map((p) => p.name)) });

/** Validate one declaration; returns the parsed experience or the reasons it is rejected. */
export function validateDeclaration(decl: ExperienceDeclaration, env: RegistryEnv, taken: ReadonlySet<string> = new Set()): { ok: true; app: AppExperience } | { ok: false; appId: string; errors: string[] } {
  const raw = decl.experience as { appId?: unknown } | null | undefined;
  const appId = typeof raw?.appId === "string" ? raw.appId : "(unknown)";
  const parsed = appSchema.safeParse(decl.experience);
  if (!parsed.success) return { ok: false, appId, errors: parsed.error.issues.slice(0, 12).map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`) };
  const app = parsed.data;
  const errors: string[] = [];
  if (app.contractVersion !== EXPERIENCE_CONTRACT_VERSION) errors.push(`INCOMPATIBLE_CONTRACT: version ${app.contractVersion}, this Core reads ${EXPERIENCE_CONTRACT_VERSION}`);
  if (taken.has(app.appId)) errors.push(`DUPLICATE_APP: ${app.appId} is already registered`);
  if (app.runtime === "VIRTUAL_PLUGIN" && !env.pluginNames.has(app.appId)) errors.push(`UNKNOWN_PLUGIN: no plugin named ${app.appId} in src/plugins/registry.ts`);
  if (app.runtime === "FRAPPE_HOST" && !isHostApp(app.appId)) errors.push(`UNKNOWN_HOST_APP: ${app.appId} is not in the Enterprise host app list (api/apps.py DIGIT_APPS)`);
  for (const p of MANDATORY_PATTERNS) if (!app.supportedSharedPatterns.includes(p)) errors.push(`MISSING_MANDATORY_PATTERN: ${p}`);
  const adapters = decl.adapters ?? {};
  for (const id of Object.keys(adapters)) if (!id.startsWith(`${app.appId}.`)) errors.push(`FOREIGN_ADAPTER: adapter ${id} is not namespaced by ${app.appId}`);
  const registers = new Set<string>();
  for (const r of app.registers) {
    if (registers.has(r.id)) errors.push(`DUPLICATE_REGISTER: ${r.id}`);
    registers.add(r.id);
    if (!r.ids) { if (r.statuses || r.reasons) errors.push(`REGISTER_STATUS_WITHOUT_IDS: ${r.id} sets statuses but lists no ids`); continue; }
    if (r.ids.length !== r.count) errors.push(`REGISTER_COUNT_MISMATCH: ${r.id} lists ${r.ids.length} ids but declares ${r.count}`);
    const ids = new Set(r.ids);
    if (ids.size !== r.ids.length) errors.push(`DUPLICATE_REGISTER_ID: ${r.id} lists an id twice`);
    const stray = [...Object.keys(r.statuses ?? {}), ...Object.keys(r.reasons ?? {})].filter((k) => !ids.has(k));
    if (stray.length) errors.push(`REGISTER_STATUS_UNKNOWN_ID: ${r.id} sets a status for ${stray.slice(0, 5).join(", ")}${stray.length > 5 ? ` +${stray.length - 5}` : ""}`);
  }
  const screens = new Set<string>();
  for (const s of app.screens) {
    if (!s.screenId.startsWith(`${app.appId}.`)) errors.push(`FOREIGN_SCREEN_ID: ${s.screenId}`);
    if (screens.has(s.screenId)) errors.push(`DUPLICATE_SCREEN: ${s.screenId}`);
    screens.add(s.screenId);
    const blocks = new Set<string>();
    for (const b of s.blocks) {
      if (!b.semanticBlockId.startsWith(`${app.appId}.`)) errors.push(`FOREIGN_BLOCK_ID: ${b.semanticBlockId}`);
      if (blocks.has(b.semanticBlockId)) errors.push(`DUPLICATE_BLOCK: ${s.screenId} / ${b.semanticBlockId}`);
      blocks.add(b.semanticBlockId);
      const owner = b.ownerApiOrAdapterId.replace(/^server:/, "");
      if (!owner.startsWith(`${app.appId}.`)) errors.push(`FOREIGN_OWNER: block ${b.semanticBlockId} reads ${b.ownerApiOrAdapterId}, not owned by ${app.appId}`);
    }
  }
  return errors.length ? { ok: false, appId: app.appId, errors } : { ok: true, app };
}

/** Build a registry from declarations (pure; the app's default registry uses experienceDeclarations()). */
export function buildRegistry(decls: ExperienceDeclaration[], env: RegistryEnv = defaultEnv()): ExperienceRegistry {
  const reg: ExperienceRegistry = { apps: new Map(), adapters: new Map(), adoptions: [], rejected: [] };
  for (const d of decls) {
    const v = validateDeclaration(d, env, new Set(reg.apps.keys()));
    if (!v.ok) { reg.rejected.push({ appId: v.appId, errors: v.errors }); continue; }
    reg.apps.set(v.app.appId, v.app);
    for (const [id, fn] of Object.entries(d.adapters ?? {})) reg.adapters.set(id, fn);
    reg.adoptions.push(...(d.adoptions ?? []));
  }
  return reg;
}

let current: ExperienceRegistry | null = null;
/** The app's registry, built once on first use (lazy, so app modules that cycle through the Shell are initialised first). */
export function experienceRegistry(): ExperienceRegistry { return (current ??= buildRegistry(experienceDeclarations())); }
/** Tests only: replace (or with no argument, rebuild) the registry. */
export function setExperienceRegistry(reg?: ExperienceRegistry) { current = reg ?? null; }
/** Additive registration for apps loaded after start-up (same validation as the static table). */
export function registerAppExperience(decl: ExperienceDeclaration): { ok: boolean; errors: string[] } {
  const reg = experienceRegistry();
  const v = validateDeclaration(decl, defaultEnv(), new Set(reg.apps.keys()));
  if (!v.ok) { reg.rejected.push({ appId: v.appId, errors: v.errors }); return { ok: false, errors: v.errors }; }
  reg.apps.set(v.app.appId, v.app);
  for (const [id, fn] of Object.entries(decl.adapters ?? {})) reg.adapters.set(id, fn);
  reg.adoptions.push(...(decl.adoptions ?? []));
  return { ok: true, errors: [] };
}

/* --------------------------------------------------------------- feature coverage --------------------------------------------------------------- */

/** `unlinked` = listed ids no screen links that still have a source to map; `blocked` = ids marked
 *  UNMATCHED_SOURCE_REQUIRED (no source in this project — waiting on the owner, never force-mapped); `byStatus` counts
 *  the register's declared evidence statuses (ids without one count as NOT_INSPECTED). */
export interface RegisterCoverage { id: string; label: Bi; count: number; evidence: string; listed: boolean; linked: number; unlinked: string[]; blocked: string[]; byStatus: Partial<Record<TraceStatus, number>>; reasons: Record<string, string> }
export interface AppCoverage {
  appId: string;
  registers: RegisterCoverage[];
  /** Distinct feature ids the app's screens link (counted even when no register lists ids). */
  linkedFeatureIds: number;
  /** Screen feature ids that no listed register contains (only checked when at least one register lists ids). */
  unknown: string[];
  screensWithoutFeatures: string[];
}

/** Which register ids each app's registered screens link — traceability of source ids to screens, not runtime proof. */
export function featureCoverage(app: AppExperience): AppCoverage {
  const used = new Set(app.screens.flatMap((s) => s.featureIds));
  const listed = app.registers.filter((r) => r.ids);
  const known = new Set(listed.flatMap((r) => r.ids ?? []));
  return {
    appId: app.appId,
    registers: app.registers.map((r) => {
      if (!r.ids) return { id: r.id, label: r.label, count: r.count, evidence: r.evidence, listed: false, linked: 0, unlinked: [], blocked: [], byStatus: {}, reasons: {} };
      const st = r.statuses ?? {};
      const byStatus: Partial<Record<TraceStatus, number>> = {};
      for (const id of r.ids) { const s = st[id] ?? "NOT_INSPECTED"; byStatus[s] = (byStatus[s] ?? 0) + 1; }
      const open = r.ids.filter((id) => !used.has(id));
      return { id: r.id, label: r.label, count: r.count, evidence: r.evidence, listed: true, linked: r.ids.length - open.length,
        unlinked: open.filter((id) => st[id] !== "UNMATCHED_SOURCE_REQUIRED"), blocked: open.filter((id) => st[id] === "UNMATCHED_SOURCE_REQUIRED"), byStatus, reasons: r.reasons ?? {} };
    }),
    linkedFeatureIds: used.size,
    unknown: listed.length ? [...used].filter((id) => !known.has(id)) : [],
    screensWithoutFeatures: app.screens.filter((s) => !s.featureIds.length).map((s) => s.screenId),
  };
}

/* ------------------------------------------------------------------ discovery ------------------------------------------------------------------ */
export interface AccessResult { state: AppAccess; reason?: string | undefined }

const hasAnyRole = (roles: string[], user: string) => user === ADMIN || roles.length === 0 || roles.some((r) => userRoles(user).includes(r));

/**
 * Whether `user` may open `appId` here. Fail-closed order: unregistered → rejected contract → runtime not present
 * (Frappe-host / compiled apps have no runtime in this preview) → plugin not enabled → app entry roles → OK.
 */
export function appAccess(appId: string, user = currentUser(), reg = experienceRegistry()): AccessResult {
  const app = reg.apps.get(appId);
  if (!app) {
    const bad = reg.rejected.find((r) => r.appId === appId);
    return bad ? { state: "INCOMPATIBLE", reason: bad.errors.join("; ") } : { state: "NOT_REGISTERED" };
  }
  if (app.runtime === "FRAPPE_HOST") return { state: "NOT_INSTALLED", reason: isServerHosted() ? "Host capabilities (digit_enterprise.api.apps.capabilities) are read by the DIGIT host, not this registry" : "DIGIT-host app: no runtime in this preview" };
  if (app.runtime === "COMPILED_EXTENSION") return { state: "NOT_INSTALLED", reason: "Compiled extension bundle is not part of this project" };
  if (!isEnabled(appId)) return { state: "NOT_INSTALLED", reason: "Plugin is not enabled (Apps & Plugins)" };
  const entry = slotsOf(appId)?.enterprise;
  if (!appPermitted({ entry, name: appId }, user)) return { state: "PERMISSION_DENIED", reason: "App entry roles or Feature Control" };
  return { state: "OK" };
}

/** Discovery label in the owner's wording, e.g. ITM_NOT_REGISTERED / DISTRIBUTION_NOT_INSTALLED / HR_PERMISSION_DENIED. */
export function accessLabel(appId: string, user = currentUser(), reg = experienceRegistry()): string {
  const s = appAccess(appId, user, reg).state;
  return s === "OK" ? "OK" : `${appId.replace(/^digit_/, "").toUpperCase()}_${s}`;
}

export type ScreenState = AppAccess | "SCREEN_NOT_REGISTERED" | "SCREEN_DENIED";
export interface ScreenResolution { state: ScreenState; app?: AppExperience | undefined; screen?: ScreenExperience | undefined; reason?: string | undefined }

export function resolveScreen(appId: string, screenId: string, user = currentUser(), reg = experienceRegistry()): ScreenResolution {
  const a = appAccess(appId, user, reg);
  const app = reg.apps.get(appId);
  if (a.state !== "OK" || !app) return { state: a.state, app, reason: a.reason };
  const screen = app.screens.find((s) => s.screenId === screenId);
  if (!screen) return { state: "SCREEN_NOT_REGISTERED", app };
  if (!hasAnyRole(screen.roles, user)) return { state: "SCREEN_DENIED", app, screen };
  return { state: "OK", app, screen };
}

const cleanPath = (path: string) => { const p = path.replace(/[?#].*$/, "").replace(/(.)\/$/, "$1"); try { return decodeURI(p); } catch { return p; } };
const routeRe = new Map<string, RegExp>();
const routeMatches = (route: string, clean: string) => {
  let re = routeRe.get(route);
  if (!re) routeRe.set(route, (re = new RegExp(`^${route.replace(/[.*+?^{}()|[\]\\]/g, "\\$&").replace(/\$[A-Za-z_]+/g, "[^/]+")}$`)));
  return re.test(clean);
};

/** Screens an app registered for a concrete path (route templates "$param" match one segment). */
export function screensForPath(appId: string, path: string, reg = experienceRegistry()): ScreenExperience[] {
  const app = reg.apps.get(appId); if (!app) return [];
  const clean = cleanPath(path);
  return app.screens.filter((s) => routeMatches(s.route, clean));
}

/** The one registered screen a concrete path renders, across every app — the shared Shell's ScreenHost reads this.
 *  A literal route wins over a "$param" template (/settings/policies over /settings/$x); two literal claimants for one
 *  path return `conflict` instead of guessing. */
export function screenAtPath(path: string, reg = experienceRegistry()): { app: AppExperience; screen: ScreenExperience } | { conflict: string[] } | undefined {
  const clean = cleanPath(path);
  const hits: { app: AppExperience; screen: ScreenExperience }[] = [];
  for (const app of reg.apps.values()) for (const screen of app.screens) if (routeMatches(screen.route, clean)) hits.push({ app, screen });
  if (hits.length <= 1) return hits[0];
  const literal = hits.filter((h) => !h.screen.route.includes("$"));
  const pick = literal.length ? literal : hits;
  return pick.length === 1 ? pick[0] : { conflict: pick.map((h) => h.screen.screenId) };
}

/* ------------------------------------------------------------------ blocks ------------------------------------------------------------------ */
export interface BlockOutcome {
  state: BlockState;
  block?: BlockExperience | undefined;
  app?: AppExperience | undefined;
  screen?: ScreenExperience | undefined;
  data?: import("@/lib/dashboards/registry").WidgetData | undefined;
  total?: number | undefined;
  limited?: boolean | undefined;
  reason?: Bi | undefined;
  labels?: Record<string, Bi> | undefined;
  /** Engineering diagnostics (rendered only in Developer mode). */
  diagnostics: string[];
  company?: string | undefined;
  asOf: string;
}

const today = () => new Date().toISOString().slice(0, 10);

/**
 * Resolve one shared block for the user: discovery + screen roles + block roles + source read permission, then the
 * owning app's adapter. `metasReady` = the DocType definitions the permission check needs are loaded (before that the
 * outcome is LOADING, never a denial or a zero).
 */
export function resolveBlock(appId: string, screenId: string, blockId: string, input: { company?: string | undefined }, opts: { metasReady: boolean; user?: string; asOf?: string } = { metasReady: true }, reg = experienceRegistry()): BlockOutcome {
  const user = opts.user ?? currentUser(); const asOf = opts.asOf ?? today();
  const sr = resolveScreen(appId, screenId, user, reg);
  const base = { app: sr.app, screen: sr.screen, asOf, diagnostics: [] as string[] };
  if (sr.state !== "OK" || !sr.screen) {
    const denied = sr.state === "PERMISSION_DENIED" || sr.state === "SCREEN_DENIED";
    const why: Bi | undefined = sr.state === "PERMISSION_DENIED" ? ["Your roles do not include this app.", "أدوارك لا تشمل هذا التطبيق."] : sr.state === "SCREEN_DENIED" ? ["Your role cannot open this screen.", "دورك لا يسمح بفتح هذه الشاشة."] : undefined;
    return { ...base, state: denied ? "DENIED" : "CONTRACT_NOT_READY", ...(denied ? { reason: why } : {}), diagnostics: [`SCREEN_${sr.state}${sr.reason ? `: ${sr.reason}` : ""}`] };
  }
  const block = sr.screen.blocks.find((b) => b.semanticBlockId === blockId);
  if (!block) return { ...base, state: "CONTRACT_NOT_READY", diagnostics: [`BLOCK_NOT_REGISTERED: ${blockId}`] };
  const company = block.inputSchema.company === "none" ? undefined : input.company || undefined;
  const out = { ...base, block, company };
  if (!hasAnyRole(block.permission.roles, user)) return { ...out, state: "DENIED", reason: block.states.denied, diagnostics: ["BLOCK_ROLE_DENIED"] };
  if (block.ownerApiOrAdapterId.startsWith("server:")) return { ...out, state: "CONTRACT_NOT_READY", diagnostics: [`SERVER_METHOD_NOT_CONNECTED: ${block.ownerApiOrAdapterId.slice(7)} (declared by ${appId}; DIGIT is not running in this preview)`] };
  const fn = reg.adapters.get(block.ownerApiOrAdapterId);
  if (!fn) return { ...out, state: "CONTRACT_NOT_READY", diagnostics: [`MISSING_ADAPTER: ${block.ownerApiOrAdapterId}`] };
  if (!opts.metasReady) return { ...out, state: "LOADING", diagnostics: [] };
  const unreadable = block.permission.doctypes.filter((d) => !canReadType(d, user));
  if (unreadable.length) return { ...out, state: "DENIED", reason: block.states.denied, diagnostics: [`SOURCE_NOT_READABLE: ${unreadable.join(", ")}`] };
  try {
    const r = fn({ company, asOf, user });
    if (!(BLOCK_STATES as readonly string[]).includes(r.state)) return { ...out, state: "ERROR", diagnostics: [`ADAPTER_BAD_STATE: ${String(r.state)}`] };
    return { ...out, state: r.state, data: r.data, total: r.total, limited: r.limited, labels: r.labels, reason: r.reason ?? (r.state === "EMPTY" ? block.states.empty : r.state === "DENIED" ? block.states.denied : undefined) };
  } catch (e) {
    return { ...out, state: "ERROR", diagnostics: [`ADAPTER_THREW: ${e instanceof Error ? e.message : String(e)}`] };
  }
}
