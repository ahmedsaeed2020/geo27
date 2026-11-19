/**
 * RXP-01 Reports Center personal preferences: favorite reports and reports recently opened from the Reports Center.
 * Same scope as Saved Views — this browser, per simulated session user — and only directory keys are stored
 * (never report rows or values). Entries are always re-checked against the current, permission-filtered directory,
 * so a favorite never grants access to a report the user can no longer open.
 * Future Frappe destination: per-user `__UserSettings` or an app-owned preference DocType (owner decision; gap register RXP-01).
 */
import { useSyncExternalStore } from "react";
import { currentUser } from "@/lib/session";

export const REPORT_PREFS_KEY = "digit-pro:report-prefs:v1";
export const RECENT_LIMIT = 8;
interface UserPrefs { fav: string[]; recent: { key: string; at: string }[] }
type Store = Record<string, UserPrefs>;

const subs = new Set<() => void>();
let cache: Store | null = null;
let version = 0;
const hasWindow = () => typeof window !== "undefined" && typeof localStorage !== "undefined";

function read(): Store {
  if (!hasWindow()) return {};
  if (!cache) {
    try { const raw: unknown = JSON.parse(localStorage.getItem(REPORT_PREFS_KEY) ?? "{}"); cache = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Store) : {}; }
    catch { cache = {}; }
  }
  return cache;
}
function write(next: Store) {
  cache = next; version++;
  if (hasWindow()) localStorage.setItem(REPORT_PREFS_KEY, JSON.stringify(next));
  subs.forEach((f) => f());
}
function prefsOf(user: string): UserPrefs {
  const p = read()[user];
  return { fav: Array.isArray(p?.fav) ? p.fav.filter((k) => typeof k === "string") : [], recent: Array.isArray(p?.recent) ? p.recent.filter((r) => r && typeof r.key === "string") : [] };
}
export function reloadReportPrefs() { cache = null; version++; subs.forEach((f) => f()); }
if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
  window.addEventListener("storage", (e) => { if (e.key === REPORT_PREFS_KEY) reloadReportPrefs(); });
}
export function useReportPrefsVersion(): number {
  return useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => version, () => 0);
}

export const favorites = (user = currentUser()): string[] => prefsOf(user).fav;
export const isFavorite = (key: string, user = currentUser()) => prefsOf(user).fav.includes(key);
export function toggleFavorite(key: string, user = currentUser()): boolean {
  const p = prefsOf(user); const on = !p.fav.includes(key);
  write({ ...read(), [user]: { ...p, fav: on ? [...p.fav, key] : p.fav.filter((k) => k !== key) } });
  return on;
}
/** Most recent first, de-duplicated, capped at RECENT_LIMIT. */
export const recent = (user = currentUser()): string[] => prefsOf(user).recent.map((r) => r.key);
export function recordOpen(key: string, user = currentUser(), at = new Date().toISOString()) {
  const p = prefsOf(user);
  write({ ...read(), [user]: { ...p, recent: [{ key, at }, ...p.recent.filter((r) => r.key !== key)].slice(0, RECENT_LIMIT) } });
}
export function clearRecent(user = currentUser()) { const p = prefsOf(user); write({ ...read(), [user]: { ...p, recent: [] } }); }

/** Keep only keys still present in the caller's permitted directory (stale or now-denied entries are counted, never shown). */
export function resolvePrefs<T extends { key: string }>(keys: string[], visible: T[]): { items: T[]; hidden: number } {
  const byKey = new Map(visible.map((e) => [e.key, e]));
  const items = keys.map((k) => byKey.get(k)).filter((e): e is T => !!e);
  return { items, hidden: keys.length - items.length };
}
