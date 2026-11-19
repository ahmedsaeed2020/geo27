/**
 * Universal Dashboard Designer — versioned layouts, precedence and permission (DIGIT-CORE-PRO-UX-006 §9).
 *
 * Precedence (first valid wins): active named dashboard of the user → personal layout → role template (latest saved
 * among the user's roles) → company preset (company in context) → global default → the application's default layout. Every stored layout is re-validated against the CURRENT dashboard
 * contract before use (normalizeLayout): unknown widgets dropped, sizes clamped, incompatible views and unapproved
 * options removed, mandatory widgets restored, widgets added by a newer app version appended, and per-widget
 * customizations reset when the widget's version changed. A layout written by a newer format version is ignored
 * (the next precedence level applies) instead of being guessed.
 *
 * Storage: personal layouts live in the Core per-user settings (userSettings.widget_layout, key <app>:<dashboard>:<user>);
 * role/global templates are records of the Core virtual DocType "DIGIT Dashboard Template" (adapter). On a Frappe site
 * the same contract maps to a User Settings value and a digit_enterprise DocType (docs/run11_1/native_document_hub_dashboard_designer/05).
 */
import { adapter } from "../adapter";
import { ADMIN } from "../session";
import { getSettings, setWidgetLayout, widgetLayoutOf, type DesignerItem, type DesignerLayout } from "../userSettings";
import { HEIGHTS, WIDTHS, type DashboardDef, type Height, type Width } from "./registry";
import { checkView, type Bi } from "./views";

export const LAYOUT_V = 1;
export const TEMPLATE_DOCTYPE = "DIGIT Dashboard Template";
export const MANAGER_ROLE = "System Manager";

export const VIEW_DOCTYPE = "DIGIT Dashboard View";
/** Saved versions kept per named dashboard (oldest dropped first). */
export const VIEW_VERSIONS = 10;

export type { DesignerItem, DesignerLayout };
/** Company = a preset for one company (used by everyone working in that company context). */
export type TemplateScope = "Role" | "Global" | "Company";
export interface DashboardTemplate { app: string; dashboard: string; scope: TemplateScope; role?: string | undefined; company?: string | undefined; layout: DesignerLayout; modified: string; modified_by: string }
export type LayoutSource = { kind: "personal" } | { kind: "named"; id: string; title: string } | { kind: "role"; role: string } | { kind: "company"; company: string } | { kind: "global" } | { kind: "default" };

/**
 * A named personal dashboard: the owner's own saved arrangement of one dashboard contract (several per user; one may be
 * active). `revision` increases on every save; a save names the revision it started from, so a concurrent change made
 * in another tab is reported as a conflict instead of being overwritten. The last VIEW_VERSIONS layouts are kept.
 */
export interface NamedView { id: string; app: string; dashboard: string; user: string; title: string; layout: DesignerLayout; revision: number; active: boolean; modified: string; versions: { revision: number; savedAt: string; layout: DesignerLayout }[] }

export interface LayoutStore {
  getPersonal(app: string, dashboard: string, user: string): DesignerLayout | undefined;
  setPersonal(app: string, dashboard: string, user: string, layout: DesignerLayout | null): void;
  templates(app: string, dashboard: string): DashboardTemplate[];
  saveTemplate(t: DashboardTemplate): void;
  removeTemplate(app: string, dashboard: string, scope: TemplateScope, role?: string, company?: string): void;
  /** Named personal dashboards (optional for custom stores; both built-in stores implement them). */
  views?(app: string, dashboard: string, user: string): NamedView[];
  putView?(v: NamedView): void;
  dropView?(id: string): void;
}

/* ------------------------------------------------------------------ layout model ------------------------------------------------------------------ */
const nearest = <T extends number>(allowed: readonly T[], v: number): T => allowed.reduce((b, x) => (Math.abs(x - v) < Math.abs(b - v) ? x : b), allowed[0]!);

export function defaultLayout(def: DashboardDef<never> | DashboardDef<unknown>): DesignerLayout {
  const ws = def.widgets as DashboardDef<unknown>["widgets"];
  return {
    v: LAYOUT_V,
    items: ws.filter((w) => w.inDefault !== false || w.required).map((w) => ({ id: w.id, w: w.size.w, ...(w.size.h ? { h: w.size.h } : {}) })),
    seen: ws.map((w) => w.id),
    widgetVersions: Object.fromEntries(ws.map((w) => [w.id, w.version])),
  };
}

export interface Normalized { layout: DesignerLayout; changes: string[] }
/** Validate a stored layout against the current contract; null when the format is newer than this Core understands. */
export function normalizeLayout(def: DashboardDef<unknown>, layout: DesignerLayout): Normalized | null {
  if (typeof layout.v !== "number" || layout.v > LAYOUT_V) return null;
  const byId = new Map(def.widgets.map((w) => [w.id, w]));
  const changes: string[] = [];
  const out: DesignerItem[] = []; const used = new Set<string>();
  for (const it of layout.items) {
    const w = byId.get(it.id);
    if (!w) { changes.push(`removed unknown widget ${it.id}`); continue; }
    if (used.has(it.id)) { changes.push(`removed duplicate ${it.id}`); continue; }
    used.add(it.id);
    const stale = (layout.widgetVersions?.[it.id] ?? w.version) !== w.version;
    let width = nearest(WIDTHS, it.w) as Width;
    if (w.minW && width < w.minW) width = w.minW;
    const next: DesignerItem = { id: it.id, w: width };
    if (width !== it.w) changes.push(`resized ${it.id}`);
    if (typeof it.h === "number") next.h = nearest(HEIGHTS, it.h) as Height;
    if (stale) { changes.push(`reset customizations of ${it.id} (widget version changed)`); out.push(next); continue; }
    if (it.view && it.view !== w.defaultView) {
      if (checkView(w.shape, it.view, w.views, w.facts).ok) next.view = it.view; else changes.push(`dropped invalid view ${it.view} of ${it.id}`);
    }
    if (it.title && it.title.trim()) next.title = it.title.trim().slice(0, 80);
    if (it.opts) {
      const ok: Record<string, string> = {};
      for (const [k, v] of Object.entries(it.opts)) {
        const o = w.options?.find((x) => x.key === k);
        if (o && (o.choices.some((c) => c.value === v) || (o.pattern && typeof v === "string" && o.pattern.test(v)))) { if (v !== o.default) ok[k] = v; } else changes.push(`dropped option ${k} of ${it.id}`);
      }
      if (Object.keys(ok).length) next.opts = ok;
    }
    out.push(next);
  }
  const seen = new Set(layout.seen);
  for (const w of def.widgets) {
    if (used.has(w.id)) continue;
    if (w.required) { out.push({ id: w.id, w: w.size.w, ...(w.size.h ? { h: w.size.h } : {}) }); used.add(w.id); changes.push(`restored mandatory ${w.id}`); }
    else if (!seen.has(w.id) && w.inDefault !== false) { out.push({ id: w.id, w: w.size.w, ...(w.size.h ? { h: w.size.h } : {}) }); used.add(w.id); changes.push(`added new widget ${w.id}`); }
  }
  return { layout: { v: LAYOUT_V, items: out, seen: def.widgets.map((w) => w.id), widgetVersions: Object.fromEntries(def.widgets.map((w) => [w.id, w.version])), ...(layout.savedAt ? { savedAt: layout.savedAt } : {}) }, changes };
}

/** Two layouts render the same dashboard (order, size, view, title, options). */
export function sameLayout(a: DesignerLayout, b: DesignerLayout): boolean {
  const k = (l: DesignerLayout) => JSON.stringify(l.items.map((i) => [i.id, i.w, i.h ?? null, i.view ?? null, i.title ?? null, i.opts ?? null]));
  return k(a) === k(b);
}

/* ------------------------------------------------------------------ permission ------------------------------------------------------------------ */
const isManager = (user: string, roles: string[]) => user === ADMIN || roles.includes(MANAGER_ROLE) || roles.includes("Administrator");

export type ManageCheck = { ok: true } | { ok: false; reason: Bi };
/** Who may save at each scope: personal = any signed-in user; role = managers (or app-declared roles, for roles they hold); global = managers (or app global roles). */
export function canManage(def: DashboardDef<unknown>, scope: "personal" | TemplateScope, user: string, roles: string[], role?: string, company?: string): ManageCheck {
  if (!user || user === "Guest") return { ok: false, reason: ["Sign in to personalize dashboards.", "سجّل الدخول لتخصيص لوحات المعلومات."] };
  if (scope === "personal") return { ok: true };
  if (scope === "Company") {
    if (!company) return { ok: false, reason: ["Choose a company first; a company preset applies to one company.", "اختر شركة أولًا؛ إعداد الشركة المسبق يخص شركة واحدة."] };
    if (isManager(user, roles) || (def.companyRoles ?? []).some((r) => roles.includes(r))) return { ok: true };
    return { ok: false, reason: ["You are not allowed to publish a company preset.", "غير مسموح لك بنشر إعداد مسبق للشركة."] };
  }
  if (scope === "Global") {
    if (isManager(user, roles) || (def.globalRoles ?? []).some((r) => roles.includes(r))) return { ok: true };
    return { ok: false, reason: ["Only a System Manager can publish the global default layout.", "مدير النظام فقط يمكنه نشر التخطيط الافتراضي العام."] };
  }
  if (!role) return { ok: false, reason: ["Choose the role this template is for.", "اختر الدور الذي يخص هذا القالب."] };
  if (isManager(user, roles)) return { ok: true };
  if ((def.managerRoles ?? []).some((r) => roles.includes(r)) && roles.includes(role)) return { ok: true };
  return { ok: false, reason: ["You are not allowed to publish a team template for this role.", "غير مسموح لك بنشر قالب فريق لهذا الدور."] };
}

/* ------------------------------------------------------------------ resolution ------------------------------------------------------------------ */
export interface Resolved { layout: DesignerLayout; source: LayoutSource; changes: string[] }
/**
 * Precedence: active named dashboard → personal layout → role template → company preset (company in context) →
 * global default → app default. Each level is re-validated against the current contract; an invalid level is skipped.
 */
export function resolveLayout(def: DashboardDef<unknown>, user: string, roles: string[], store: LayoutStore = defaultStore, company?: string): Resolved {
  const active = store.views?.(def.app, def.id, user).find((v) => v.active);
  const an = active ? normalizeLayout(def, active.layout) : null;
  if (active && an) return { ...an, source: { kind: "named", id: active.id, title: active.title } };
  const mine = store.getPersonal(def.app, def.id, user);
  const n = mine ? normalizeLayout(def, mine) : null;
  if (n) return { ...n, source: { kind: "personal" } };
  const ts = store.templates(def.app, def.id);
  const roleT = ts.filter((t) => t.scope === "Role" && t.role && roles.includes(t.role)).sort((a, b) => b.modified.localeCompare(a.modified));
  for (const t of roleT) { const r = normalizeLayout(def, t.layout); if (r) return { ...r, source: { kind: "role", role: t.role! } }; }
  const ct = company ? ts.find((t) => t.scope === "Company" && t.company === company) : undefined;
  const cn = ct ? normalizeLayout(def, ct.layout) : null;
  if (ct && cn) return { ...cn, source: { kind: "company", company: ct.company! } };
  const g = ts.find((t) => t.scope === "Global");
  const gn = g ? normalizeLayout(def, g.layout) : null;
  if (gn) return { ...gn, source: { kind: "global" } };
  return { layout: defaultLayout(def), source: { kind: "default" }, changes: [] };
}

export type SaveResult = { ok: true; layout: DesignerLayout } | { ok: false; reason: Bi };
/** Persist a layout at a scope after permission + contract validation. */
export function saveLayout(def: DashboardDef<unknown>, scope: "personal" | TemplateScope, layout: DesignerLayout, user: string, roles: string[], role?: string, store: LayoutStore = defaultStore, company?: string): SaveResult {
  const can = canManage(def, scope, user, roles, role, company);
  if (!can.ok) return can;
  const n = normalizeLayout(def, layout);
  if (!n) return { ok: false, reason: ["This layout was made by a newer version and cannot be saved here.", "هذا التخطيط من إصدار أحدث ولا يمكن حفظه هنا."] };
  const stamped: DesignerLayout = { ...n.layout, savedAt: new Date().toISOString() };
  if (scope === "personal") store.setPersonal(def.app, def.id, user, stamped);
  else store.saveTemplate({ app: def.app, dashboard: def.id, scope, ...(scope === "Role" ? { role } : {}), ...(scope === "Company" ? { company } : {}), layout: stamped, modified: stamped.savedAt!, modified_by: user });
  return { ok: true, layout: stamped };
}
/** Remove a saved layout at a scope (personal reset is always allowed for the user's own layout). */
export function clearLayout(def: DashboardDef<unknown>, scope: "personal" | TemplateScope, user: string, roles: string[], role?: string, store: LayoutStore = defaultStore, company?: string): ManageCheck {
  const can = canManage(def, scope, user, roles, role, company);
  if (!can.ok) return can;
  if (scope === "personal") store.setPersonal(def.app, def.id, user, null);
  else store.removeTemplate(def.app, def.id, scope, role, company);
  return { ok: true };
}

/* ------------------------------------------------------------------ named personal dashboards ------------------------------------------------------------------ */
export type ViewResult = { ok: true; view: NamedView } | { ok: false; reason: Bi; conflict?: true | undefined };
const NO_VIEWS: Bi = ["Named dashboards are not available in this system.", "اللوحات المسماة غير متاحة في هذا النظام."];
const viewId = (app: string, dashboard: string, user: string, n: number) => `${app}::${dashboard}::${user}::${n}`;
export function namedViews(def: DashboardDef<unknown>, user: string, store: LayoutStore = defaultStore): NamedView[] {
  return (store.views?.(def.app, def.id, user) ?? []).filter((v) => v.user === user).sort((a, b) => a.title.localeCompare(b.title));
}
function titleProblem(def: DashboardDef<unknown>, user: string, title: string, store: LayoutStore, except?: string): Bi | null {
  const t = title.trim();
  if (!t) return ["Give the dashboard a name.", "أدخل اسمًا للوحة."];
  if (t.length > 60) return ["Use a name of at most 60 characters.", "استخدم اسمًا لا يتجاوز 60 حرفًا."];
  if (namedViews(def, user, store).some((v) => v.id !== except && v.title.toLowerCase() === t.toLowerCase())) return ["You already have a dashboard with this name.", "لديك لوحة بهذا الاسم بالفعل."];
  return null;
}
/** Create a named dashboard of the signed-in user from a layout (it becomes active). */
export function createView(def: DashboardDef<unknown>, user: string, title: string, layout: DesignerLayout, store: LayoutStore = defaultStore): ViewResult {
  if (!store.views || !store.putView) return { ok: false, reason: NO_VIEWS };
  if (!user || user === "Guest") return { ok: false, reason: ["Sign in to personalize dashboards.", "سجّل الدخول لتخصيص لوحات المعلومات."] };
  const bad = titleProblem(def, user, title, store); if (bad) return { ok: false, reason: bad };
  const n = normalizeLayout(def, layout); if (!n) return { ok: false, reason: ["This layout was made by a newer version and cannot be saved here.", "هذا التخطيط من إصدار أحدث ولا يمكن حفظه هنا."] };
  const now = new Date().toISOString(); const mine = store.views(def.app, def.id, user);
  let k = mine.length + 1; while (mine.some((v) => v.id === viewId(def.app, def.id, user, k))) k++;
  const lay: DesignerLayout = { ...n.layout, savedAt: now };
  for (const v of mine) if (v.active) store.putView({ ...v, active: false });
  const view: NamedView = { id: viewId(def.app, def.id, user, k), app: def.app, dashboard: def.id, user, title: title.trim(), layout: lay, revision: 1, active: true, modified: now, versions: [{ revision: 1, savedAt: now, layout: lay }] };
  store.putView(view);
  return { ok: true, view };
}
const ownView = (def: DashboardDef<unknown>, user: string, id: string, store: LayoutStore) => namedViews(def, user, store).find((v) => v.id === id);
const MISSING: Bi = ["This dashboard no longer exists (it may have been deleted in another tab).", "هذه اللوحة لم تعد موجودة (ربما حُذفت في تبويب آخر)."];
const CONFLICT: Bi = ["This dashboard was changed in another tab or session after you opened it. Reload the latest version, then apply your change again.", "تغيّرت هذه اللوحة في تبويب أو جلسة أخرى بعد فتحها. أعد تحميل أحدث نسخة ثم طبّق تعديلك مرة أخرى."];
/** Save a layout into a named dashboard; `expected` is the revision the edit started from (conflict check). */
export function saveView(def: DashboardDef<unknown>, user: string, id: string, layout: DesignerLayout, expected: number, store: LayoutStore = defaultStore): ViewResult {
  const v = ownView(def, user, id, store); if (!v || !store.putView) return { ok: false, reason: MISSING };
  if (v.revision !== expected) return { ok: false, reason: CONFLICT, conflict: true };
  const n = normalizeLayout(def, layout); if (!n) return { ok: false, reason: ["This layout was made by a newer version and cannot be saved here.", "هذا التخطيط من إصدار أحدث ولا يمكن حفظه هنا."] };
  const now = new Date().toISOString(); const lay: DesignerLayout = { ...n.layout, savedAt: now }; const revision = v.revision + 1;
  const next: NamedView = { ...v, layout: lay, revision, modified: now, versions: [...v.versions, { revision, savedAt: now, layout: lay }].slice(-VIEW_VERSIONS) };
  store.putView(next);
  return { ok: true, view: next };
}
export function renameView(def: DashboardDef<unknown>, user: string, id: string, title: string, expected: number, store: LayoutStore = defaultStore): ViewResult {
  const v = ownView(def, user, id, store); if (!v || !store.putView) return { ok: false, reason: MISSING };
  if (v.revision !== expected) return { ok: false, reason: CONFLICT, conflict: true };
  const bad = titleProblem(def, user, title, store, id); if (bad) return { ok: false, reason: bad };
  const next: NamedView = { ...v, title: title.trim(), revision: v.revision + 1, modified: new Date().toISOString() };
  store.putView(next);
  return { ok: true, view: next };
}
/** Copy a named dashboard (or the layout shown now) under a new name; the copy becomes active. */
export function cloneView(def: DashboardDef<unknown>, user: string, from: NamedView | DesignerLayout, title: string, store: LayoutStore = defaultStore): ViewResult {
  return createView(def, user, title, "layout" in from ? from.layout : from, store);
}
export function deleteView(def: DashboardDef<unknown>, user: string, id: string, store: LayoutStore = defaultStore): ManageCheck {
  const v = ownView(def, user, id, store); if (!v || !store.dropView) return { ok: false, reason: MISSING };
  store.dropView(id);
  return { ok: true };
}
/** Make one named dashboard active (null = back to the shared / personal layout). */
export function activateView(def: DashboardDef<unknown>, user: string, id: string | null, store: LayoutStore = defaultStore): ManageCheck {
  if (!store.putView) return { ok: false, reason: NO_VIEWS };
  const mine = namedViews(def, user, store);
  if (id && !mine.some((v) => v.id === id)) return { ok: false, reason: MISSING };
  for (const v of mine) if (v.active !== (v.id === id)) store.putView({ ...v, active: v.id === id });
  return { ok: true };
}
/** Restore an earlier saved version as a new revision (the history is kept). */
export function restoreViewVersion(def: DashboardDef<unknown>, user: string, id: string, revision: number, expected: number, store: LayoutStore = defaultStore): ViewResult {
  const v = ownView(def, user, id, store); if (!v) return { ok: false, reason: MISSING };
  const old = v.versions.find((x) => x.revision === revision);
  if (!old) return { ok: false, reason: ["That version is no longer kept.", "هذه النسخة لم تعد محفوظة."] };
  return saveView(def, user, id, old.layout, expected, store);
}

/* ------------------------------------------------------------------ default store ------------------------------------------------------------------ */
const tName = (app: string, dashboard: string, scope: TemplateScope, role?: string, company?: string) => `${app}::${dashboard}::${scope}::${scope === "Role" ? role ?? "" : scope === "Company" ? company ?? "" : "*"}`;
function parseTemplate(d: Record<string, unknown>): DashboardTemplate | undefined {
  try {
    const layout = JSON.parse(String(d["layout_json"] ?? "")) as DesignerLayout;
    if (!layout || !Array.isArray(layout.items)) return undefined;
    const scope = d["scope"] === "Global" ? "Global" : d["scope"] === "Role" ? "Role" : d["scope"] === "Company" ? "Company" : undefined;
    if (!scope) return undefined;
    return { app: String(d["app"]), dashboard: String(d["dashboard"]), scope, role: typeof d["role"] === "string" && d["role"] ? (d["role"] as string) : undefined, company: typeof d["company"] === "string" && d["company"] ? (d["company"] as string) : undefined, layout, modified: String(d["modified"] ?? ""), modified_by: String(d["modified_by"] ?? d["owner"] ?? "") };
  } catch { return undefined; }
}
function parseView(d: Record<string, unknown>): NamedView | undefined {
  try {
    const layout = JSON.parse(String(d["layout_json"] ?? "")) as DesignerLayout;
    if (!layout || !Array.isArray(layout.items)) return undefined;
    const versions = JSON.parse(String(d["versions_json"] ?? "[]")) as NamedView["versions"];
    return { id: String(d["name"]), app: String(d["app"]), dashboard: String(d["dashboard"]), user: String(d["owner_user"]), title: String(d["title"] ?? ""), layout, revision: Number(d["revision"]) || 1, active: Number(d["active"]) === 1, modified: String(d["modified"] ?? ""), versions: Array.isArray(versions) ? versions : [] };
  } catch { return undefined; }
}
export const defaultStore: LayoutStore = {
  getPersonal: (app, dashboard, user) => widgetLayoutOf(getSettings(), app, dashboard, user)?.designer,
  setPersonal: (app, dashboard, user, layout) => {
    if (!layout) { const cur = widgetLayoutOf(getSettings(), app, dashboard, user); if (cur && !cur.designer) return; setWidgetLayout(app, dashboard, user, null); return; }
    const ids = layout.items.map((i) => i.id);
    setWidgetLayout(app, dashboard, user, { order: ids, hidden: layout.seen.filter((s) => !ids.includes(s)), designer: layout });
  },
  templates: (app, dashboard) => adapter.list(TEMPLATE_DOCTYPE).filter((d) => d["app"] === app && d["dashboard"] === dashboard).map(parseTemplate).filter((t): t is DashboardTemplate => !!t),
  saveTemplate: (t) => {
    const name = tName(t.app, t.dashboard, t.scope, t.role, t.company);
    const fields = { app: t.app, dashboard: t.dashboard, scope: t.scope, role: t.role ?? "", company: t.company ?? "", layout_json: JSON.stringify(t.layout), layout_version: t.layout.v, modified_by: t.modified_by };
    if (adapter.get(TEMPLATE_DOCTYPE, name)) adapter.update(TEMPLATE_DOCTYPE, name, fields);
    else adapter.insertDoc(TEMPLATE_DOCTYPE, { name, ...fields });
  },
  removeTemplate: (app, dashboard, scope, role, company) => { const n = tName(app, dashboard, scope, role, company); if (adapter.get(TEMPLATE_DOCTYPE, n)) adapter.remove(TEMPLATE_DOCTYPE, n); },
  // named personal dashboards: owner-only records of the Core virtual DocType "DIGIT Dashboard View"
  views: (app, dashboard, user) => adapter.list(VIEW_DOCTYPE).filter((d) => d["app"] === app && d["dashboard"] === dashboard && d["owner_user"] === user).map(parseView).filter((v): v is NamedView => !!v),
  putView: (v) => {
    const fields = { app: v.app, dashboard: v.dashboard, owner_user: v.user, title: v.title, layout_json: JSON.stringify(v.layout), versions_json: JSON.stringify(v.versions), revision: v.revision, active: v.active ? 1 : 0, layout_version: v.layout.v };
    if (adapter.get(VIEW_DOCTYPE, v.id)) adapter.update(VIEW_DOCTYPE, v.id, fields); else adapter.insertDoc(VIEW_DOCTYPE, { name: v.id, ...fields });
  },
  dropView: (id) => { if (adapter.get(VIEW_DOCTYPE, id)) adapter.remove(VIEW_DOCTYPE, id); },
};

/** In-memory store (tests and previews that must not persist). */
export function memoryStore(): LayoutStore & { personal: Map<string, DesignerLayout>; list: DashboardTemplate[]; named: Map<string, NamedView> } {
  const personal = new Map<string, DesignerLayout>(); const list: DashboardTemplate[] = []; const named = new Map<string, NamedView>();
  const pk = (a: string, d: string, u: string) => `${a}:${d}:${u}`;
  const same = (x: DashboardTemplate, s: TemplateScope, r?: string, c?: string) => x.scope === s && (s === "Global" || (s === "Role" ? (x.role ?? "") === (r ?? "") : (x.company ?? "") === (c ?? "")));
  return {
    personal, list, named,
    getPersonal: (a, d, u) => personal.get(pk(a, d, u)),
    setPersonal: (a, d, u, l) => { if (l) personal.set(pk(a, d, u), l); else personal.delete(pk(a, d, u)); },
    templates: (a, d) => list.filter((t) => t.app === a && t.dashboard === d),
    saveTemplate: (t) => { const i = list.findIndex((x) => x.app === t.app && x.dashboard === t.dashboard && same(x, t.scope, t.role, t.company)); if (i >= 0) list[i] = t; else list.push(t); },
    removeTemplate: (a, d, s, r, c) => { const i = list.findIndex((x) => x.app === a && x.dashboard === d && same(x, s, r, c)); if (i >= 0) list.splice(i, 1); },
    views: (a, d, u) => [...named.values()].filter((v) => v.app === a && v.dashboard === d && v.user === u).map((v) => ({ ...v })),
    putView: (v) => { named.set(v.id, { ...v }); },
    dropView: (id) => { named.delete(id); },
  };
}
