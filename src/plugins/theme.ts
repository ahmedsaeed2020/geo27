/**
 * Plugin experience themes. A plugin manifest may declare `theme` (a CSS class scope); it is applied to <html>
 * only while that plugin is enabled AND the user is inside its experience. An applied app owns the whole visual
 * experience: there is NO user-facing "Standard Desk" exit — leaving happens only by choosing another DIGIT app
 * from the dock or by administrator deactivation in Apps & Plugins. Tokens only — Core components, data and routes
 * are unchanged.
 */
import { useEffect, useSyncExternalStore } from "react";
import { enabledPlugins, usePluginsVersion } from "./runtime";

const KEY = "digit-virtual-core:active-experience";
const ls = new Set<() => void>();
/**
 * Active app is held PER BROWSER TAB (sessionStorage), so one tab switching apps never hijacks another.
 * A brand-new tab starts from the last deliberate choice (localStorage default); after that each tab is independent.
 */
const read = () => {
  if (typeof window === "undefined") return "";
  const t = sessionStorage.getItem(KEY); if (t !== null) return t;
  const d = localStorage.getItem(KEY) ?? ""; sessionStorage.setItem(KEY, d); return d;
};
export function getActiveExperience() { return read(); }
/** Deliberate app switch only (dock app choice, app entry page, admin deactivation, ?experience=). */
export function setActiveExperience(name: string) { sessionStorage.setItem(KEY, name); if (name) localStorage.setItem(KEY, name); else localStorage.removeItem(KEY); ls.forEach((l) => l()); }

/**
 * Central app-aware resolver (shared Core, used by every app with an `experience` manifest): maps a generic Core entry
 * path to the active app's in-app target. Native /app, /report/<name>, /dashboard, /page routes are returned unchanged —
 * they render inside the active shell via Shell. Returns the input when no app is active.
 */
export function resolveInApp(path: string, active = read()): string {
  const p = enabledPlugins().find((x) => x.name === active)?.experience; if (!p) return path;
  const clean = path.replace(/[?#].*$/, "").replace(/(.)\/$/, "$1");
  if (clean === "/") return p.home;
  return p.aliases?.[clean] ?? path;
}
export function useActiveExperience() { return useSyncExternalStore((l) => { ls.add(l); return () => ls.delete(l); }, read, () => ""); }

/** Theme class currently in force, or "" for Standard Core. */
export function activeThemeClass(active = read()) {
  return enabledPlugins().find((p) => p.name === active)?.theme?.className ?? "";
}

/** Mounted once in __root: keeps <html> class in sync with enabled + active experience. */
export function useExperienceTheme() {
  const active = useActiveExperience(); const v = usePluginsVersion();
  useEffect(() => {
    const el = document.documentElement;
    const all = enabledPlugins().map((p) => p.theme?.className).filter(Boolean) as string[];
    for (const c of [...all, "theme-digit-pro"]) el.classList.remove(c);
    const c = activeThemeClass(active); if (c) el.classList.add(c);
    el.dataset["experience"] = c ? active : "standard";
  }, [active, v]);
}
