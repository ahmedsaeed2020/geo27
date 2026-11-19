/**
 * DIGIT Enterprise composition (shared Core layer, owner directive 2026-10-18 "one Core, one DIGIT Enterprise experience").
 *
 * Enterprise mode is ON while at least one installed DIGIT app that provides experience slots with a dock entry is
 * enabled. Then the shared Shell shows ONE app selector: Enterprise Home on top, the enabled and permitted DIGIT apps,
 * and — only for Desk-authorised users (Administrator, System Manager or Developer mode) — one "Desk" entry that keeps
 * every native ERPNext / Frappe HR / CRM / Insights / Reports launcher reachable. Nothing is unregistered: with every
 * DIGIT app disabled, enterprise mode is OFF and the original Core dock and Desk Home return exactly.
 *
 * Selection controls presentation only; records, permissions and posting stay the shared Core engines.
 */
import { useSyncExternalStore } from "react";
import { useHydrated } from "@/components/hrms/HrShell";
import { matchFilter } from "@/lib/desk";
import { useDevMode } from "@/lib/mode";
import { canReadType, scopedList } from "@/lib/scope";
import { ADMIN, currentUser, subscribeSession, userRoles } from "@/lib/session";
import { featureOn } from "@/lib/coreShared/features";
import { defaultCompany } from "@/lib/sessionDefaults";
import { allSlotProviders, type EnterpriseIndicator, type ExperienceSlots } from "./experienceSlots";
import { enabledPlugins, usePluginsVersion } from "./runtime";

export const ENTERPRISE_HOME = "/enterprise";
export const DESK_HOME = "/desk";

export interface EnterpriseApp {
  name: string;
  title: string;
  title_ar: string;
  version: string;
  dock: NonNullable<ExperienceSlots["dock"]>;
  entry?: ExperienceSlots["enterprise"];
}

/** Enabled DIGIT apps with a dock entry, in registry order (no permission filter). */
export function installedEnterpriseApps(): EnterpriseApp[] {
  const enabled = new Map(enabledPlugins().map((p) => [p.name, p]));
  return allSlotProviders().flatMap(([name, s]) => {
    const p = enabled.get(name);
    if (!p || !s.dock) return [];
    return [{ name, title: p.title, title_ar: p.title_ar ?? p.title, version: p.version, dock: s.dock, entry: s.enterprise }];
  });
}

/** Whether `user` may see an app in the enterprise selector: app-declared roles, then the administrator's per-role /
 *  company switch "app:<name>" (Administration → Feature Control); Administrator always. */
export function appPermitted(app: Pick<EnterpriseApp, "entry"> & { name?: string | undefined }, user = currentUser()): boolean {
  if (user === ADMIN) return true;
  const roles = app.entry?.roles;
  const mine = userRoles(user);
  if (roles?.length && !roles.some((r) => mine.includes(r))) return false;
  return !app.name || featureOn(`app:${app.name}`, { user, roles: mine, company: defaultCompany(user) });
}

/** Installed, enabled AND permitted DIGIT apps for the user. */
export function enterpriseApps(user = currentUser()): EnterpriseApp[] {
  return installedEnterpriseApps().filter((a) => appPermitted(a, user));
}

/** Enterprise mode: at least one enabled DIGIT app with a dock entry. */
export function isEnterpriseMode(): boolean { return installedEnterpriseApps().length > 0; }

/** The native Desk launchers stay visible to administrators, System Managers and Developer mode only. */
export function deskAuthorized(user = currentUser(), dev = false): boolean {
  return dev || user === ADMIN || userRoles(user).includes("System Manager");
}

/**
 * Owner decision 2026-10-19 (13:23 published site, 13:45 preview too): the dock's "Desk" entry and the Desk Home link
 * (native ERPNext / Frappe launchers) are hidden everywhere. Only the entries are hidden — /desk routes stay reachable
 * and the admin links (Apps & Plugins, Settings) keep following `desk`. Flip this flag to bring the entry back.
 */
export const DESK_ENTRY_ENABLED = false;
export const deskEntryVisible = (): boolean => DESK_ENTRY_ENABLED;

/** Reactive enterprise state for shell components (Standard Desk before hydration, so SSR stays stable). */
export function useEnterprise(): { on: boolean; apps: EnterpriseApp[]; desk: boolean; deskEntry: boolean; user: string } {
  const hyd = useHydrated(); usePluginsVersion(); const dev = useDevMode();
  const user = useSyncExternalStore(subscribeSession, currentUser, () => ADMIN);
  if (!hyd) return { on: false, apps: [], desk: true, deskEntry: deskEntryVisible(), user };
  const desk = deskAuthorized(user, dev);
  return { on: isEnterpriseMode(), apps: enterpriseApps(user), desk, deskEntry: desk && deskEntryVisible(), user };
}

/** The first enabled + permitted DIGIT app whose navigation hosts `doctype` (cross-app deep links keep that app's shell). */
export function owningApp(doctype: string, user = currentUser()): string | undefined {
  return enterpriseApps(user).find((a) => a.entry?.owns?.(doctype))?.name;
}

/** Value of one indicator: permitted rows matching every filter; `undefined` when the DocType is not readable. */
export function indicatorValue(ind: EnterpriseIndicator, user = currentUser()): number | undefined {
  if (!canReadType(ind.doctype, user)) return undefined;
  return scopedList(ind.doctype, user).filter((d) => ind.filters.every((f) => matchFilter(d, f as [string, string, unknown]))).length;
}

/** Native list route + filters for an indicator drill (same filters as the count). */
export function indicatorHref(ind: EnterpriseIndicator, app = ind.app ?? "erpnext"): { to: "/app/$app/$doctype"; params: { app: string; doctype: string }; search: { filters: string } } {
  return { to: "/app/$app/$doctype", params: { app, doctype: ind.doctype.toLowerCase().replace(/[^a-z0-9]+/g, "_") }, search: { filters: JSON.stringify(ind.filters) } };
}
