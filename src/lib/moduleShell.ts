/**
 * Module shell context — which module sidebar a Desk page shows (port of frappe/public/js/frappe/ui/sidebar/sidebar.js
 * shell_for_route + frappe/desk/doctype/sidebar/sidebar.py build_canonical_shells, over the generated
 * public/catalog/module_sidebars.json).
 *
 * A list, form or report keeps the sidebar on screen when that sidebar lists the entity; otherwise it opens in the
 * entity's canonical shell, resolved by the source ladder:
 *   owned (is_default_module claim, last-installed app wins, then shell name) → module+listed → linked (any shell
 *   listing it, same app first, then shell name) → module (the entity's module has a shell) → same app.
 * Heirs and computed shells are not generated in the virtual Core, so those ladder steps never apply here.
 * The on-screen shell is kept per browser tab (sessionStorage), like frappe.app.sidebar.current_module.
 */
import type { ModuleSidebar, SidebarItem } from "./desk";

export type EntityKind = "DocType" | "Report" | "Page" | "Dashboard";
const KEY = "digit-virtual-core:module-shell";
/** frappe.get_installed_apps() order on a frappe + erpnext + hrms site (dependency order). */
const INSTALL_ORDER = ["frappe", "erpnext", "hrms"];
const rank = (app: string) => INSTALL_ORDER.indexOf(app);

export function currentShell(): string | null {
  if (typeof window === "undefined") return null;
  try { return sessionStorage.getItem(KEY); } catch { return null; }
}
export function setCurrentShell(name: string | null) {
  if (typeof window === "undefined") return;
  try { if (name) sessionStorage.setItem(KEY, name); else sessionStorage.removeItem(KEY); } catch { /* storage disabled */ }
}

export const itemTargets = (i: SidebarItem, kind: EntityKind, name: string) => i.type !== "Section Break" && i.link_type === kind && i.link_to === name;
export const shellLists = (sb: ModuleSidebar, kind: EntityKind, name: string) => sb.items.some((i) => itemTargets(i, kind, name));

/** build_canonical_shells ladder (see module doc). `module` is the entity's own module (DocType/Report module). */
export function canonicalShell(sidebars: ModuleSidebar[], kind: EntityKind, name: string, module?: string, app?: string): ModuleSidebar | undefined {
  const byName = (a: ModuleSidebar, b: ModuleSidebar) => a.name.localeCompare(b.name);
  const owned = sidebars.filter((s) => s.items.some((i) => itemTargets(i, kind, name) && Number((i as { is_default_module?: number }).is_default_module ?? 0) === 1));
  if (owned.length) return [...owned].sort((a, b) => rank(b.app) - rank(a.app) || byName(a, b))[0];
  const own = module ? sidebars.find((s) => s.module === module || s.name === module) : undefined;
  if (own && shellLists(own, kind, name)) return own;
  const linked = sidebars.filter((s) => shellLists(s, kind, name));
  if (linked.length) return [...linked].sort((a, b) => Number(b.app === app) - Number(a.app === app) || rank(b.app) - rank(a.app) || byName(a, b))[0];
  if (own) return own;
  return app ? sidebars.filter((s) => s.app === app).sort(byName)[0] : undefined;
}

/** shell_for_route without a URL-stated shell: the shell on screen when it lists the entity, else the canonical one. */
export function shellForEntity(sidebars: ModuleSidebar[], kind: EntityKind, name: string, module?: string, app?: string, onScreen = currentShell()): ModuleSidebar | undefined {
  const screen = onScreen ? sidebars.find((s) => s.name === onScreen) : undefined;
  if (screen && shellLists(screen, kind, name)) return screen;
  return canonicalShell(sidebars, kind, name, module, app);
}
