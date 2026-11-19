/**
 * Module rail model of an app's manifest navigation (theme.module_rail). Pure functions: which modules the rail shows,
 * which module and item the current location belongs to, and which sections the contextual sidebar lists. Every
 * navigation item stays reachable — either as a frequent section or through the module directory — so the layout never
 * drops a destination.
 */
import type { PluginManifest, PluginNavGroup, PluginNavItem } from "./types";

export interface RailModule {
  key: string; label: string; label_ar?: string | undefined; short?: string | undefined; short_ar?: string | undefined; icon?: string | undefined;
  /** navigation groups shown under this module (its own group first, then groups folded in with `module`) */
  groups: PluginNavGroup[];
  /** the module's landing item (first item of its own group) */
  overview: PluginNavItem | undefined;
  directory?: string | undefined;
}

/** Rail modules in manifest order; groups with `module` fold into that module (kept after its own group). */
export function railModules(app: Pick<PluginManifest, "navigation">): RailModule[] {
  const groups = app.navigation ?? [];
  const out = new Map<string, RailModule>();
  for (const g of groups) {
    const k = g.module && groups.some((x) => x.key === g.module) ? g.module : g.key;
    let m = out.get(k);
    if (!m) {
      const host = groups.find((x) => x.key === k) ?? g;
      m = { key: k, label: host.label, label_ar: host.label_ar, short: host.short, short_ar: host.short_ar, icon: host.icon, groups: [], overview: undefined, directory: host.directory };
      out.set(k, m);
    }
    if (g.key === k) m.groups.unshift(g); else m.groups.push(g);
  }
  for (const m of out.values()) m.overview = m.groups[0]?.items[0];
  return [...out.values()];
}

/** Frequent sections of a group: items flagged `featured`, else its first `limit` items. */
export function featuredItems(g: PluginNavGroup, limit = 5): PluginNavItem[] {
  const f = g.items.filter((i) => i.featured);
  return f.length ? f : g.items.slice(0, limit);
}

/** Navigation item whose target is the current path. Lists also match their own forms (`<list>/<name>`). */
/** `prefer`: when the same destination sits in several modules (e.g. Report centre), the preferred module's entry wins. */
export function activeItem(app: Pick<PluginManifest, "navigation">, path: string, hrefOf: (to: string) => string, prefer?: string): { group: PluginNavGroup; item: PluginNavItem } | undefined {
  const p = safeDecode(path);
  const modOf = (g: PluginNavGroup) => g.module ?? g.key;
  let exact: { group: PluginNavGroup; item: PluginNavItem } | undefined;
  let prefix: { group: PluginNavGroup; item: PluginNavItem; len: number } | undefined;
  for (const group of app.navigation ?? []) {
    for (const item of group.items) {
      const h = safeDecode(hrefOf(item.to));
      if (!h) continue;
      if (p === h) { if (!exact || (prefer && modOf(group) === prefer && modOf(exact.group) !== prefer)) exact = { group, item }; continue; }
      if (item.to.startsWith("doctype:") && p.startsWith(`${h}/`) && (!prefix || h.length > prefix.len || (h.length === prefix.len && prefer && modOf(group) === prefer))) prefix = { group, item, len: h.length };
    }
  }
  return exact ?? (prefix && { group: prefix.group, item: prefix.item });
}

/** Rail module of a location: its navigation item, else a module directory or `match` prefix; undefined when unknown. */
export function moduleOfPath(app: Pick<PluginManifest, "navigation" | "name">, path: string, hrefOf: (to: string) => string, prefer?: string): string | undefined {
  const mods = railModules(app);
  const hit = activeItem(app, path, hrefOf, prefer);
  if (hit) return mods.find((m) => m.groups.includes(hit.group))?.key;
  const base = `/plugins/${app.name}/`;
  const p = safeDecode(path);
  if (!p.startsWith(base)) return undefined;
  const rest = p.slice(base.length);
  for (const m of mods) if (m.directory && (rest === m.directory || rest.startsWith(`${m.directory}?`))) return m.key;
  for (const m of mods) for (const g of m.groups) for (const pre of g.match ?? []) if (rest === pre || rest.startsWith(pre)) return m.key;
  return undefined;
}

/** Every navigation item of a module, grouped (directory view); used to prove no destination is lost. */
export function moduleItems(m: RailModule): PluginNavItem[] { return m.groups.flatMap((g) => g.items); }

function safeDecode(s: string) { try { return decodeURIComponent(s); } catch { return s; } }
