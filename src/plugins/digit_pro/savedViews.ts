/**
 * RXP-01 personal Saved Views for DIGIT Pro report/register surfaces.
 *
 * A view stores presentation preferences only — typed filter predicates, visible column order, sort and density —
 * never report rows, totals or business values. Views belong to the (simulated) session user and are persisted in
 * this browser's localStorage, the same scope as Core User Settings and List Layouts. Selecting a company in a
 * view is a filter inside the user's authorised companies, never an authorisation: views are re-validated against
 * the report spec and the caller's companies every time they are applied.
 *
 * URL is the effective state (shareable, refresh- and Back-safe). Precedence for a visit:
 *   explicit drill / URL predicate  >  consciously selected view (`view=<id>`)  >  personal default  >  native default.
 * A drill overlay never writes to a stored view; only Save / Save as do.
 *
 * Future Frappe destination (not built here): per-user `__UserSettings` via frappe.model.user_settings, or an
 * app-owned view DocType after owner approval — see docs/DIGIT_PRO_GAP_REGISTER.md (RXP-01).
 */
import { useSyncExternalStore } from "react";
import { currentUser, userRoles } from "@/lib/session";

export const VIEW_SCHEMA = 1;
export const VIEW_STORE_KEY = "digit-pro:saved-views:v1";
/** URL keys owned by the view model (all others are report filters declared by the spec). */
export const VIEW_KEYS = ["view", "cols", "sort", "density", "fs"] as const;
export const NATIVE = "native";
export const DRILL = "drill";

export type FilterOp = "=" | ">=" | "<=" | "like";
export interface ViewFilter { field: string; op: FilterOp; value: string }
export interface ViewSort { field: string; dir: "asc" | "desc" }
export type Density = "comfortable" | "compact";
export interface SavedView {
  id: string; app: "digit_pro"; report: string; owner: string; name: string;
  filters: ViewFilter[]; columns: string[] | null; sort: ViewSort | null; density: Density;
  isDefault: boolean; schemaVersion: number; createdAt: string; updatedAt: string;
  /** SH-029 multi-scope: personal (default), shared with one role of the owner, or with everyone who can open the report. Others can apply or copy it, never change it. */
  scope?: ViewScope; scopeRole?: string;
}
export type ViewScope = "personal" | "role" | "everyone";

export interface SpecFilter { key: string; label: string; ar: string; op?: FilterOp; /** company filters are re-validated against authorised companies */ company?: boolean; display?: (v: string, ar: boolean) => string }
export interface SpecColumn { key: string; label: string; ar: string; locked?: boolean; align?: "start" | "end"; /** available in the column picker but not shown until chosen (native report columns kept reachable) */ defaultHidden?: boolean }
export interface ViewSpec {
  /** Stable contract identity (never the translated title). */
  id: string; label: string; ar: string; route: string;
  filters: SpecFilter[]; columns: SpecColumn[]; sorts: string[]; defaultSort: ViewSort | null;
}
export type Search = Record<string, string | undefined>;
/** URL keys every Saved View register route accepts in addition to its report filters. */
export interface ViewSearchKeys { view?: string | undefined; cols?: string | undefined; sort?: string | undefined; density?: string | undefined; fs?: string | undefined }
export interface ViewState { filters: ViewFilter[]; columns: string[] | null; sort: ViewSort | null; density: Density }

/* ---------------- storage ---------------- */
const subs = new Set<() => void>();
let cache: SavedView[] | null = null;
let version = 0;
const hasWindow = () => typeof window !== "undefined" && typeof localStorage !== "undefined";

function readAll(): SavedView[] {
  if (!hasWindow()) return [];
  if (!cache) {
    try { const raw = JSON.parse(localStorage.getItem(VIEW_STORE_KEY) ?? "[]"); cache = Array.isArray(raw) ? raw.filter(isView) : []; }
    catch { cache = []; }
  }
  return cache;
}
function writeAll(list: SavedView[]) {
  cache = list; version++;
  if (hasWindow()) localStorage.setItem(VIEW_STORE_KEY, JSON.stringify(list));
  subs.forEach((f) => f());
}
function isView(v: unknown): v is SavedView {
  const x = v as SavedView;
  return !!x && typeof x.id === "string" && typeof x.report === "string" && typeof x.owner === "string" && typeof x.name === "string" && Array.isArray(x.filters);
}
/** Drop the in-memory cache (tests, other-tab writes). */
export function reloadViews() { cache = null; version++; subs.forEach((f) => f()); }
if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
  window.addEventListener("storage", (e) => { if (e.key === VIEW_STORE_KEY) reloadViews(); });
}
export function useViewsVersion(): number {
  return useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => version, () => 0);
}

export class ViewError extends Error { constructor(public code: "empty-name" | "duplicate-name" | "not-found" | "not-owner") { super(code); } }

const now = () => new Date().toISOString();
const newId = () => `dpv-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const norm = (s: string) => s.trim().replace(/\s+/g, " ");

/** A view is visible to its owner, and to others only when it is shared with everyone or with a role they hold. */
export function visibleTo(v: SavedView, user = currentUser()): boolean {
  if (v.owner === user) return true;
  if (v.scope === "everyone") return true;
  return v.scope === "role" && !!v.scopeRole && userRoles(user).includes(v.scopeRole);
}
/** The user's own views, then views shared with them — another user's private views are never listed. */
export function listViews(report: string, user = currentUser()): SavedView[] {
  return readAll().filter((v) => v.report === report && visibleTo(v, user))
    .sort((a, b) => Number(a.owner !== user) - Number(b.owner !== user) || a.name.localeCompare(b.name));
}
const ownViews = (report: string, user: string) => listViews(report, user).filter((v) => v.owner === user);
export function allOwnViews(user = currentUser()): SavedView[] {
  return readAll().filter((v) => v.owner === user).sort((a, b) => a.report.localeCompare(b.report) || a.name.localeCompare(b.name));
}
export function getView(id: string, user = currentUser()): SavedView | undefined {
  return readAll().find((v) => v.id === id && visibleTo(v, user));
}
export function defaultView(report: string, user = currentUser()): SavedView | undefined {
  return ownViews(report, user).find((v) => v.isDefault);
}
function own(id: string, user: string): SavedView {
  const v = readAll().find((x) => x.id === id);
  if (!v) throw new ViewError("not-found");
  if (v.owner !== user) throw new ViewError("not-owner");
  return v;
}
function checkName(report: string, name: string, user: string, except?: string) {
  const n = norm(name); if (!n) throw new ViewError("empty-name");
  if (ownViews(report, user).some((v) => v.id !== except && v.name.toLowerCase() === n.toLowerCase())) throw new ViewError("duplicate-name");
  return n;
}

export function createView(report: string, name: string, state: ViewState, user = currentUser(), opts: { isDefault?: boolean; scope?: ViewScope; scopeRole?: string } = {}): SavedView {
  const n = checkName(report, name, user);
  const t = now();
  // a role share is limited to a role the owner holds; anything else stays personal
  const scope: ViewScope = opts.scope === "everyone" ? "everyone" : opts.scope === "role" && opts.scopeRole && userRoles(user).includes(opts.scopeRole) ? "role" : "personal";
  const v: SavedView = { id: newId(), app: "digit_pro", report, owner: user, name: n, filters: state.filters, columns: state.columns, sort: state.sort, density: state.density, isDefault: false, schemaVersion: VIEW_SCHEMA, createdAt: t, updatedAt: t,
    // a personal view keeps the original stored shape (no scope key)
    ...(scope !== "personal" ? { scope } : {}), ...(scope === "role" ? { scopeRole: opts.scopeRole! } : {}) };
  writeAll([...readAll(), v]);
  if (opts.isDefault) setDefault(report, v.id, user);
  return getView(v.id, user)!;
}
export function updateView(id: string, state: ViewState, user = currentUser()): SavedView {
  const v = own(id, user);
  writeAll(readAll().map((x) => (x.id === v.id ? { ...x, filters: state.filters, columns: state.columns, sort: state.sort, density: state.density, schemaVersion: VIEW_SCHEMA, updatedAt: now() } : x)));
  return getView(id, user)!;
}
export function renameView(id: string, name: string, user = currentUser()): SavedView {
  const v = own(id, user); const n = checkName(v.report, name, user, v.id);
  writeAll(readAll().map((x) => (x.id === v.id ? { ...x, name: n, updatedAt: now() } : x)));
  return getView(id, user)!;
}
/** Copies an own or shared view into a personal view of the caller. */
export function duplicateView(id: string, user = currentUser(), copyLabel = "copy"): SavedView {
  const v = getView(id, user); if (!v) throw new ViewError("not-found");
  let name = `${v.name} (${copyLabel})`; let i = 2;
  while (ownViews(v.report, user).some((x) => x.name.toLowerCase() === name.toLowerCase())) name = `${v.name} (${copyLabel} ${i++})`;
  return createView(v.report, name, { filters: v.filters, columns: v.columns, sort: v.sort, density: v.density }, user);
}
export function deleteView(id: string, user = currentUser()) {
  const v = own(id, user);
  writeAll(readAll().filter((x) => x.id !== v.id));
}
/** One personal default per user and report; `id=null` clears it. */
export function setDefault(report: string, id: string | null, user = currentUser()) {
  if (id) own(id, user);
  writeAll(readAll().map((x) => (x.owner === user && x.report === report ? { ...x, isDefault: x.id === id } : x)));
}

/* ---------------- URL <-> view state ---------------- */
export const sortOf = (raw: string | undefined, spec: ViewSpec): ViewSort | null => {
  if (!raw) return spec.defaultSort;
  const [field = "", dir = "asc"] = raw.split(":");
  return spec.sorts.includes(field) ? { field, dir: dir === "desc" ? "desc" : "asc" } : spec.defaultSort;
};
const sortStr = (s: ViewSort | null) => (s ? `${s.field}:${s.dir}` : undefined);

/** Ordered visible column keys; unknown keys dropped, locked columns always kept. `null` = native column set. */
/** Columns a register shows before any personal choice (native report order minus defaultHidden extras). */
export const initialColumns = (spec: ViewSpec): string[] => spec.columns.filter((c) => !c.defaultHidden).map((c) => c.key);
export function columnsOf(raw: string | undefined, spec: ViewSpec): string[] {
  const all = spec.columns.map((c) => c.key);
  const initial = initialColumns(spec);
  if (!raw) return initial;
  const picked = [...new Set(raw.split(",").filter((k) => all.includes(k)))];
  for (const c of spec.columns) if (c.locked && !picked.includes(c.key)) picked.splice(Math.min(spec.columns.indexOf(c), picked.length), 0, c.key);
  return picked.length ? picked : initial;
}

export function stateFromSearch(spec: ViewSpec, s: Search): ViewState {
  const filters: ViewFilter[] = spec.filters.filter((f) => s[f.key]).map((f) => ({ field: f.key, op: f.op ?? "=", value: String(s[f.key]) }));
  const cols = s["cols"] ? columnsOf(s["cols"], spec) : null;
  return { filters, columns: cols && cols.join(",") !== initialColumns(spec).join(",") ? cols : null, sort: sortOf(s["sort"], spec), density: s["density"] === "compact" ? "compact" : "comfortable" };
}

/** Full URL search for a view: every spec key and view key is set or explicitly cleared (no stale overlay). */
export function searchFromState(spec: ViewSpec, st: ViewState, extra: Search = {}): Search {
  const out: Search = {};
  for (const f of spec.filters) out[f.key] = undefined;
  for (const k of VIEW_KEYS) out[k] = undefined;
  for (const f of st.filters) out[f.field] = f.value;
  out["cols"] = st.columns ? st.columns.join(",") : undefined;
  const ss = sortStr(st.sort); out["sort"] = ss && ss !== sortStr(spec.defaultSort) ? ss : undefined;
  out["density"] = st.density === "compact" ? "compact" : undefined;
  return { ...out, ...extra };
}

export interface Sanitized { state: ViewState; warnings: string[] }
/** Validate a stored view against the current spec and the caller's authorised companies (stale fields dropped, never applied). */
export function sanitizeView(v: Pick<SavedView, "filters" | "columns" | "sort" | "density">, spec: ViewSpec, companies: string[]): Sanitized {
  const warnings: string[] = [];
  const filters: ViewFilter[] = [];
  for (const f of v.filters ?? []) {
    const sf = spec.filters.find((x) => x.key === f.field);
    if (!sf) { warnings.push(`filter:${f.field}`); continue; }
    if (sf.company && !companies.includes(f.value)) { warnings.push(`company:${f.value}`); continue; }
    if (typeof f.value !== "string" || !f.value) continue;
    filters.push({ field: f.field, op: sf.op ?? "=", value: f.value });
  }
  let columns: string[] | null = null;
  if (Array.isArray(v.columns)) {
    const known = spec.columns.map((c) => c.key);
    for (const c of v.columns) if (!known.includes(c)) warnings.push(`column:${c}`);
    const cols = columnsOf(v.columns.join(","), spec);
    columns = cols.join(",") === initialColumns(spec).join(",") ? null : cols;
  }
  let sort = v.sort ?? null;
  if (sort && !spec.sorts.includes(sort.field)) { warnings.push(`sort:${sort.field}`); sort = spec.defaultSort; }
  return { state: { filters, columns, sort: sort ?? spec.defaultSort, density: v.density === "compact" ? "compact" : "comfortable" }, warnings };
}

const canon = (st: ViewState, spec: ViewSpec) => JSON.stringify({
  f: [...st.filters].sort((a, b) => a.field.localeCompare(b.field)).map((f) => [f.field, f.value]),
  c: (st.columns ?? initialColumns(spec)).join(","),
  s: sortStr(st.sort ?? spec.defaultSort) ?? "", d: st.density,
});
/** True when the current URL state differs from the selected view (or from the native default). */
export function isDirty(spec: ViewSpec, s: Search, view: SavedView | undefined, companies: string[]): boolean {
  const cur = stateFromSearch(spec, s);
  const base: ViewState = view ? sanitizeView(view, spec, companies).state : { filters: [], columns: null, sort: spec.defaultSort, density: "comfortable" };
  if (!view) { // native default: only predicate/presentation keys beyond company count as changes
    const filters = cur.filters.filter((f) => !spec.filters.find((x) => x.key === f.field)?.company);
    return canon({ ...cur, filters }, spec) !== canon(base, spec);
  }
  return canon(cur, spec) !== canon(base, spec);
}

export type EntryKind = "drill" | "explicit" | "view" | "default" | "native";
export interface Entry { kind: EntryKind; view?: SavedView | undefined; redirect?: Search | undefined; warnings: string[]; missingView?: string | undefined }
/**
 * Decide what governs this visit, applying the precedence rule. `redirect` is a replace-navigation that writes a view's
 * definition into the URL: a personal default on a plain visit, or a bookmarked/shared `?view=<id>` that carries no filters.
 */
export function resolveEntry(spec: ViewSpec, s: Search, companies: string[], user = currentUser()): Entry {
  const vid = s["view"];
  const hasPredicate = spec.filters.some((f) => s[f.key]) || !!(s["cols"] || s["sort"] || s["density"]);
  if (vid && vid !== NATIVE) {
    const v = getView(vid, user);
    if (!v || v.report !== spec.id) return { kind: s["fs"] === DRILL ? "drill" : "explicit", warnings: [], missingView: vid };
    const z = sanitizeView(v, spec, companies);
    // `?view=<id>` alone (bookmark, Reports Center, another tab): apply the stored definition instead of showing it as "unsaved changes".
    const redirect = !hasPredicate && isDirty(spec, s, v, companies) ? searchFromState(spec, z.state, { view: v.id }) : undefined;
    return { kind: "view", view: v, warnings: z.warnings, redirect };
  }
  if (vid === NATIVE) return { kind: "native", warnings: [] };
  if (hasPredicate) return { kind: s["fs"] === DRILL ? "drill" : "explicit", warnings: [] };
  const d = defaultView(spec.id, user);
  if (d) { const z = sanitizeView(d, spec, companies); return { kind: "default", view: d, warnings: z.warnings, redirect: searchFromState(spec, z.state, { view: d.id }) }; }
  return { kind: "native", warnings: [] };
}

/** Human chip values for active filters (labels resolved by the caller's language). */
export function activeFilters(spec: ViewSpec, s: Search, ar = false): { key: string; spec: SpecFilter; value: string }[] {
  return spec.filters.filter((f) => s[f.key]).map((f) => ({ key: f.key, spec: f, value: f.display ? f.display(String(s[f.key]), ar) : String(s[f.key]) }));
}
