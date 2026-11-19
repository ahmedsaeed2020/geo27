import { useSyncExternalStore } from "react";
import { adapter } from "./adapter";
import { setDisplayCalendar } from "./format";
import { ADMIN, currentUser, subscribeSession } from "./session";
import { migrateLegacyDefaultCompany } from "./sessionDefaults";

/**
 * User Settings (spec §6) — per simulated user (Switch User), stored in this browser and applied live to <html> as
 * classes. Session defaults (Default Company …) are a separate scope in src/lib/sessionDefaults.ts; presentation mode
 * lives in mode.ts and the active app in plugins/appShell.ts. These are virtual preferences, NOT server-backed Frappe
 * settings: see FRAPPE_PREFERENCE_MAP for where each value lives in a real Frappe site.
 */
export type UserSettings = {
  first_name: string; middle_name: string; last_name: string; username: string; email: string;
  thread_notify: boolean; send_me_a_copy: boolean; read_receipts: boolean; email_signature: string;
  theme: "Automatic" | "Light" | "Dark"; layout: "Compact" | "Full Width"; dock: "Pinned" | "Floating";
  allow_notifications: boolean; show_search_bar: boolean; show_my_space: boolean; mute_sounds: boolean; time_zone: string;
  list_sidebar: boolean; bulk_actions: boolean; view_switcher: boolean;
  form_sidebar: boolean; form_timeline: boolean; form_dashboard: boolean; absolute_datetime: boolean; form_nav_buttons: boolean;
  report_split_view: boolean;
  module_sidebar: boolean;
  /** S9 date display calendar (entry stays Gregorian, as stored by Frappe). */
  calendar: "Gregorian" | "Hijri" | "Both";
  /** Personal dashboard widget layouts, key `<app>:<dashboard>:<user>` (System Default → Role/Company Default → this override). */
  widget_layout: Record<string, WidgetLayout>;
  /** Saved register views of the shared Document Hub, key `<doctype>` (owner-only: each user's own list). */
  register_views: Record<string, RegisterView[]>;
  /** Fields the user chose for the cards of a board, key `<app>:<board>` (e.g. `digit_crm:pipeline`; CRM C1-01). */
  card_fields: Record<string, string[]>;
  /** Column order / hidden columns / pinned first column / page size of an Enterprise record list, key `<app>:<list>` (CRM C4 A-05). */
  list_layouts: Record<string, ListLayout>;
};
/** One record list's personal layout (Enterprise RecordList «إدارة الأعمدة» + rows per page). */
export type ListLayout = { order: string[]; hidden: string[]; pin: boolean; size: number };
/** One saved register view: standard view, status, search and grouping of a Document Hub register. */
export type RegisterView = { id: string; title: string; v?: string; st?: string; q?: string; g?: string };
/**
 * `order`/`hidden` are the original personal layout (CRM boards). The shared Dashboard Designer (src/lib/dashboards)
 * adds a versioned `designer` layout on the same per-user key; entries without it are unchanged.
 */
export type WidgetLayout = { order: string[]; hidden: string[]; designer?: DesignerLayout };
export type DesignerItem = { id: string; w: number; h?: number; view?: string; title?: string; opts?: Record<string, string> };
export type DesignerLayout = { v: number; items: DesignerItem[]; seen: string[]; widgetVersions?: Record<string, number>; savedAt?: string };

export const DEFAULTS: UserSettings = {
  first_name: "Administrator", middle_name: "", last_name: "", username: "administrator", email: "admin@example.com",
  thread_notify: true, send_me_a_copy: false, read_receipts: false, email_signature: "",
  // owner 2026-11-12 (Part A add §3): night mode follows the system setting until the user picks Light or Dark
  theme: "Automatic", layout: "Full Width", dock: "Pinned",
  allow_notifications: true, show_search_bar: true, show_my_space: true, mute_sounds: false, time_zone: "Asia/Riyadh",
  list_sidebar: true, bulk_actions: true, view_switcher: true,
  form_sidebar: true, form_timeline: true, form_dashboard: true, absolute_datetime: false, form_nav_buttons: true,
  report_split_view: true,
  module_sidebar: true,
  calendar: "Gregorian",
  widget_layout: {},
  register_views: {},
  card_fields: {},
  list_layouts: {},
};

/** Where each preference lives in a real Frappe site (User DocType fieldnames unless noted). Documentation only. */
export const FRAPPE_PREFERENCE_MAP: Record<keyof UserSettings, string> = {
  first_name: "User.first_name", middle_name: "User.middle_name", last_name: "User.last_name", username: "User.username", email: "User.email (read-only)",
  thread_notify: "User.thread_notify", send_me_a_copy: "User.send_me_a_copy", read_receipts: "User.send_read_receipt", email_signature: "User.email_signature",
  theme: "User.desk_theme", layout: "browser localStorage container_fullwidth (frappe.ui.toolbar.toggle_full_width)", dock: "User.dock_mode",
  allow_notifications: "User.notifications", show_search_bar: "User.search_bar", show_my_space: "User.show_my_space", mute_sounds: "User.mute_sounds", time_zone: "User.time_zone",
  list_sidebar: "User.list_sidebar", bulk_actions: "User.bulk_actions", view_switcher: "User.view_switcher",
  form_sidebar: "User.form_sidebar", form_timeline: "User.timeline", form_dashboard: "User.dashboard", absolute_datetime: "User.show_absolute_datetime_in_timeline", form_nav_buttons: "User.form_navigation_buttons",
  report_split_view: "User.report_split_view (boot desk_settings)",
  module_sidebar: "browser-side sidebar collapse state",
  calendar: "browser preference (DIGIT display only; DIGIT stores Gregorian)",
  widget_layout: "DIGIT app workspace personalization (per user; a real site stores it as a User Settings / app preference record)",
  register_views: "DIGIT Document Hub saved register views (per user; a real site stores them as User Settings / Report saved filters)",
  card_fields: "DIGIT board card fields (per user; a real site stores them as a User Settings / kanban view preference record)",
  list_layouts: "DIGIT record list columns and page size (per user; a real site stores them as a User Settings / list view preference record)",
};

const LEGACY_KEY = "digit-virtual-core:user-settings";
const LEGACY_DONE = "digit-virtual-core:user-settings:legacy-migrated";
/** The pre-1.1 hard-coded Default Company; a legacy value equal to it was never a user choice. */
const LEGACY_DEFAULT_COMPANY = "شركة ديجيت التجريبية للتجارة";
const PREFIX = "digit-virtual-core:user-settings:v2:";
export const settingsKey = (user: string) => `${PREFIX}${user}`;
const isB = typeof window !== "undefined";

const ENUMS: Partial<Record<keyof UserSettings, readonly string[]>> = { theme: ["Automatic", "Light", "Dark"], layout: ["Compact", "Full Width"], dock: ["Pinned", "Floating"] };
const strs = (a: unknown) => Array.isArray(a) && a.every((x) => typeof x === "string");
/** Structural check of a designer layout (values are re-validated against the dashboard contract when resolved). */
export function sanitizeDesignerLayout(v: unknown): DesignerLayout | undefined {
  const x = v as { v?: unknown; items?: unknown; seen?: unknown; widgetVersions?: unknown; savedAt?: unknown } | null;
  if (!x || typeof x !== "object" || typeof x.v !== "number" || !Array.isArray(x.items) || !strs(x.seen)) return undefined;
  const items: DesignerItem[] = [];
  for (const it of x.items as unknown[]) {
    const i = it as { id?: unknown; w?: unknown; h?: unknown; view?: unknown; title?: unknown; opts?: unknown } | null;
    if (!i || typeof i.id !== "string" || typeof i.w !== "number" || !Number.isFinite(i.w)) continue;
    const opts = i.opts && typeof i.opts === "object" && !Array.isArray(i.opts) ? Object.fromEntries(Object.entries(i.opts as Record<string, unknown>).filter(([, s]) => typeof s === "string")) as Record<string, string> : undefined;
    items.push({ id: i.id, w: i.w, ...(typeof i.h === "number" ? { h: i.h } : {}), ...(typeof i.view === "string" ? { view: i.view } : {}), ...(typeof i.title === "string" ? { title: i.title.slice(0, 120) } : {}), ...(opts && Object.keys(opts).length ? { opts } : {}) });
  }
  const wv = x.widgetVersions && typeof x.widgetVersions === "object" && !Array.isArray(x.widgetVersions) ? Object.fromEntries(Object.entries(x.widgetVersions as Record<string, unknown>).filter(([, n]) => typeof n === "number")) as Record<string, number> : undefined;
  return { v: x.v, items, seen: [...(x.seen as string[])], ...(wv ? { widgetVersions: wv } : {}), ...(typeof x.savedAt === "string" ? { savedAt: x.savedAt } : {}) };
}
function sanitizeWidgetLayouts(v: unknown): Record<string, WidgetLayout> | undefined {
  if (!v || typeof v !== "object" || Array.isArray(v)) return undefined;
  const out: Record<string, WidgetLayout> = {};
  for (const [k, l] of Object.entries(v as Record<string, unknown>)) {
    const x = l as { order?: unknown; hidden?: unknown; designer?: unknown } | null;
    if (!x || !strs(x.order) || !strs(x.hidden)) continue;
    const designer = x.designer === undefined ? undefined : sanitizeDesignerLayout(x.designer);
    out[k] = { order: [...(x.order as string[])], hidden: [...(x.hidden as string[])], ...(designer ? { designer } : {}) };
  }
  return out;
}
const str_ = (v: unknown) => (typeof v === "string" && v.length <= 200 ? v : undefined);
function sanitizeRegisterViews(v: unknown): Record<string, RegisterView[]> {
  const out: Record<string, RegisterView[]> = {};
  if (!v || typeof v !== "object" || Array.isArray(v)) return out;
  for (const [dt, list] of Object.entries(v as Record<string, unknown>)) {
    if (!Array.isArray(list)) continue;
    const views = list.flatMap((x): RegisterView[] => {
      if (!x || typeof x !== "object") return [];
      const r = x as Record<string, unknown>; const id = str_(r["id"]), title = str_(r["title"]);
      if (!id || !title) return [];
      const o: RegisterView = { id, title };
      for (const k of ["v", "st", "q", "g"] as const) { const s = str_(r[k]); if (s) o[k] = s; }
      return [o];
    }).slice(0, 20);
    if (views.length) out[dt] = views;
  }
  return out;
}
/** Keeps only known keys with the right type (and allowed enum values), so a corrupt or foreign blob cannot leak in. */
export function sanitizeSettings(raw: unknown): Partial<UserSettings> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!(k in DEFAULTS) || typeof v !== typeof DEFAULTS[k as keyof UserSettings]) continue;
    const allowed = ENUMS[k as keyof UserSettings];
    if (allowed && !allowed.includes(String(v))) continue;
    if (k === "widget_layout") { const w = sanitizeWidgetLayouts(v); if (w) out[k] = w; continue; }
    if (k === "register_views") { out[k] = sanitizeRegisterViews(v); continue; }
    if (k === "list_layouts") { out[k] = Object.fromEntries(Object.entries(v as Record<string, unknown>).flatMap(([b, x]) => { const l = x as Record<string, unknown> | null; if (!l || !strs(l["order"]) || !strs(l["hidden"])) return []; return [[b, { order: (l["order"] as string[]).slice(0, 60), hidden: (l["hidden"] as string[]).slice(0, 60), pin: l["pin"] === true, size: [10, 25, 50, 100].includes(Number(l["size"])) ? Number(l["size"]) : 25 }]]; })); continue; }
    if (k === "card_fields") { out[k] = Object.fromEntries(Object.entries(v as Record<string, unknown>).filter(([, x]) => Array.isArray(x)).map(([b, x]) => [b, (x as unknown[]).filter((f): f is string => typeof f === "string").slice(0, 40)])); continue; }
    out[k] = v;
  }
  return out as Partial<UserSettings>;
}

/** Profile and preference defaults of a non-Administrator user come from its User record (as the Frappe dialog does). */
function recordDefaults(user: string): { values: Partial<UserSettings>; fromRecord: boolean } {
  if (user === ADMIN) return { values: {}, fromRecord: true };
  const u = adapter.get("User", user);
  if (!u) return { values: { first_name: user.split("@")[0] ?? user, last_name: "", middle_name: "", username: "", email: user }, fromRecord: false };
  const s = (k: string) => (typeof u[k] === "string" ? (u[k] as string) : "");
  const b = (k: string) => (u[k] === undefined || u[k] === null || u[k] === "" ? undefined : Number(u[k]) === 1);
  const v: Partial<UserSettings> = { first_name: s("first_name") || user.split("@")[0] || user, middle_name: s("middle_name"), last_name: s("last_name"), username: s("username"), email: s("email") || user };
  const theme = s("desk_theme"); if (theme === "Light" || theme === "Dark" || theme === "Automatic") v.theme = theme;
  const dock = s("dock_mode"); if (dock === "Pinned" || dock === "Floating") v.dock = dock;
  const checks: [keyof UserSettings, string][] = [["list_sidebar", "list_sidebar"], ["bulk_actions", "bulk_actions"], ["view_switcher", "view_switcher"], ["form_sidebar", "form_sidebar"], ["form_timeline", "timeline"], ["form_dashboard", "dashboard"], ["form_nav_buttons", "form_navigation_buttons"], ["report_split_view", "report_split_view"], ["show_my_space", "show_my_space"], ["allow_notifications", "notifications"], ["show_search_bar", "search_bar"], ["thread_notify", "thread_notify"], ["mute_sounds", "mute_sounds"], ["send_me_a_copy", "send_me_a_copy"], ["read_receipts", "send_read_receipt"], ["absolute_datetime", "show_absolute_datetime_in_timeline"]];
  for (const [k, f] of checks) { const x = b(f); if (x !== undefined) (v as Record<string, unknown>)[k] = x; }
  return { values: v, fromRecord: true };
}

/** One-time: the legacy browser-wide blob becomes Administrator's preferences only (no other user inherits it). */
function migrateLegacy() {
  if (!isB || localStorage.getItem(LEGACY_DONE)) return;
  localStorage.setItem(LEGACY_DONE, "1");
  let raw: unknown; try { raw = JSON.parse(localStorage.getItem(LEGACY_KEY) ?? "null"); } catch { raw = null; }
  if (!raw) return;
  const clean = sanitizeSettings(raw);
  if (Object.keys(clean).length && !localStorage.getItem(settingsKey(ADMIN))) localStorage.setItem(settingsKey(ADMIN), JSON.stringify(clean));
  migrateLegacyDefaultCompany((raw as Record<string, unknown>)["default_company"], LEGACY_DEFAULT_COMPANY);
}

export function readOverrides(user: string): Partial<UserSettings> {
  if (!isB) return {};
  if (user === ADMIN) migrateLegacy();
  try { return sanitizeSettings(JSON.parse(localStorage.getItem(settingsKey(user)) ?? "{}")); } catch { return {}; }
}

const subs = new Set<() => void>();
let cache: { user: string; fromRecord: boolean; value: UserSettings } | null = null;
const refresh = () => { cache = null; applySettings(); subs.forEach((f) => f()); };
if (isB) {
  subscribeSession(refresh);
  window.addEventListener("storage", (e) => { if (e.key === settingsKey(currentUser())) refresh(); });
}

export function getSettings(): UserSettings {
  if (!isB) return DEFAULTS;
  const user = currentUser();
  if (cache && cache.user === user && (cache.fromRecord || !adapter.get("User", user))) return cache.value;
  const rec = recordDefaults(user);
  cache = { user, fromRecord: rec.fromRecord, value: { ...DEFAULTS, ...rec.values, ...readOverrides(user) } };
  setDisplayCalendar(cache.value.calendar);
  return cache.value;
}
/** Saves the given preferences for the CURRENT simulated user only. */
export function setSettings(p: Partial<UserSettings>) {
  if (!isB) return;
  const user = currentUser();
  const next = { ...readOverrides(user), ...sanitizeSettings(p) };
  localStorage.setItem(settingsKey(user), JSON.stringify(next));
  refresh();
}
/** Drops the current user's saved preferences (system / User record defaults apply again). */
/** Personal widget layout saved by `user` for dashboard `dash` of DIGIT app `app`; undefined until saved. */
export function widgetLayoutOf(s: UserSettings, app: string, dash: string, user: string): WidgetLayout | undefined {
  const v = s.widget_layout?.[`${app}:${dash}:${user}`];
  return v && Array.isArray(v.order) && Array.isArray(v.hidden) ? v : undefined;
}
/** Save (or with null, clear) the personal widget layout; other users' and other apps' layouts are untouched. */
export function setWidgetLayout(app: string, dash: string, user: string, layout: WidgetLayout | null) {
  const all = { ...(getSettings().widget_layout ?? {}) }, k = `${app}:${dash}:${user}`;
  if (layout) all[k] = { order: [...layout.order], hidden: [...layout.hidden], ...(layout.designer ? { designer: layout.designer } : {}) }; else delete all[k];
  setSettings({ widget_layout: all });
}
export function resetSettings() { if (!isB) return; localStorage.removeItem(settingsKey(currentUser())); refresh(); }
export function toggleFullWidth() { setSettings({ layout: getSettings().layout === "Full Width" ? "Compact" : "Full Width" }); }
export function useSettings(): UserSettings {
  return useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, getSettings, () => DEFAULTS);
}

let followingSystem = false;
/** Every toggle is reflected on <html> so all renderers react immediately via CSS (styles.css "us-" rules). */
export function applySettings() {
  if (typeof document === "undefined") return;
  const s = getSettings(), h = document.documentElement;
  const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
  const dark = s.theme === "Dark" || (s.theme === "Automatic" && !!mq?.matches);
  h.classList.toggle("dark", !!dark);
  // Automatic follows a system change live (one listener per page)
  if (mq && !followingSystem) { followingSystem = true; mq.addEventListener?.("change", () => { if (getSettings().theme === "Automatic") applySettings(); }); }
  const flags: Record<string, boolean> = {
    compact: s.layout === "Compact", "full-width": s.layout === "Full Width", "dock-floating": s.dock === "Floating", "no-search": !s.show_search_bar,
    "no-list-sidebar": !s.list_sidebar, "no-bulk": !s.bulk_actions, "no-view-switcher": !s.view_switcher,
    "no-form-sidebar": !s.form_sidebar, "no-form-timeline": !s.form_timeline, "no-form-dashboard": !s.form_dashboard,
    "no-form-nav": !s.form_nav_buttons, "no-module-sidebar": !s.module_sidebar, "no-my-space": !s.show_my_space,
  };
  for (const [k, v] of Object.entries(flags)) h.classList.toggle(`us-${k}`, v);
}

/* Event bus for opening shell dialogs from anywhere (avatar menu, keyboard shortcuts). */
export type ShellDialog = "settings" | "global-search" | "shortcuts" | "dock";
const dlg = new Set<(d: ShellDialog, section?: string) => void>();
export function openShellDialog(d: ShellDialog, section?: string) { dlg.forEach((f) => f(d, section)); }
export function onShellDialog(f: (d: ShellDialog, section?: string) => void) { dlg.add(f); return () => { dlg.delete(f); }; }

/* Dock (app rail) — pinned apps, managed via "Manage Dock". */
export const DOCK_APPS = [
  { id: "home", label: "Home", to: "/", icon: "⌂", app: undefined },
  { id: "erpnext", label: "ERPNext", to: "/app/$app", app: "erpnext", icon: "E" },
  { id: "frappe", label: "Framework", to: "/app/$app", app: "frappe", icon: "F" },
  { id: "hrms", label: "Frappe HR", to: "/app/$app", app: "hrms", icon: "H" },
  { id: "crm", label: "Frappe CRM", to: "/crm/leads", app: undefined, icon: "C" },
  { id: "insights", label: "Insights", to: "/insights", app: undefined, icon: "I" },
  { id: "hrapp", label: "HR app", to: "/hr/home", app: undefined, icon: "M" },
  { id: "reports", label: "Reports", to: "/report", app: undefined, icon: "R" },
] as const;
const DKEY = "digit-virtual-core:dock";
const dsubs = new Set<() => void>();
let dcache: string[] | null = null;
export function getDock(): string[] {
  if (typeof window === "undefined") return DOCK_APPS.map((a) => a.id);
  if (!dcache) { try { dcache = JSON.parse(localStorage.getItem(DKEY) ?? "null") ?? DOCK_APPS.map((a) => a.id); } catch { dcache = DOCK_APPS.map((a) => a.id); } }
  return dcache!;
}
export function setDock(ids: string[]) { dcache = ids; localStorage.setItem(DKEY, JSON.stringify(ids)); dsubs.forEach((f) => f()); }
const SERVER_DOCK = DOCK_APPS.map((a) => a.id) as string[];
export function useDock(): string[] {
  return useSyncExternalStore((f) => { dsubs.add(f); return () => dsubs.delete(f); }, getDock, () => SERVER_DOCK);
}

/** The card fields the current user chose for a board (`undefined` = never chosen: the board's defaults apply). */
export function cardFieldsOf(board: string): string[] | undefined { return getSettings().card_fields[board]; }
/** Save (or with `null` reset) the current user's card fields for a board. */
export function setCardFields(board: string, fields: string[] | null) {
  const cur = { ...getSettings().card_fields };
  if (fields) cur[board] = fields; else delete cur[board];
  setSettings({ card_fields: cur });
}

/** The current user's layout of a record list (`undefined` = never changed: the list's defaults apply). */
export function listLayoutOf(list: string): ListLayout | undefined { return getSettings().list_layouts?.[list]; }
/** Save (or with `null` reset) the current user's layout of a record list. */
export function setListLayout(list: string, layout: ListLayout | null) {
  const cur = { ...(getSettings().list_layouts ?? {}) };
  if (layout) cur[list] = layout; else delete cur[list];
  setSettings({ list_layouts: cur });
}
