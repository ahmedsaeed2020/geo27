/**
 * App-owned virtual pages (C1 SDK extension). Built-in apps register React components under their plugin name; the
 * manifest (`pages`) only names the component key and path pattern, so manifests stay serializable for import/export.
 * Paths use `:param` segments ("project/:id"). Rendered by src/routes/plugins.$name.$.tsx inside the shared Shell.
 */
import type { ComponentType } from "react";
import type { PluginManifest, PluginPage } from "./types";

export interface PluginPageProps { plugin: PluginManifest; page: PluginPage; params: Record<string, string>; path: string }
const registry = new Map<string, ComponentType<PluginPageProps>>();

export function registerPluginPages(plugin: string, components: Record<string, ComponentType<PluginPageProps>>) {
  for (const [k, c] of Object.entries(components)) registry.set(`${plugin}:${k}`, c);
}
export const pageComponent = (plugin: string, key: string) => registry.get(`${plugin}:${key}`);

/** Match a request path ("project/PRJ-1") against the manifest page patterns; static segments win over params. */
export function matchPluginPage(p: PluginManifest, path: string): { page: PluginPage; params: Record<string, string> } | undefined {
  const segs = path.split("/").filter(Boolean).map(decodeURIComponent);
  let best: { page: PluginPage; params: Record<string, string>; score: number } | undefined;
  for (const page of p.pages ?? []) {
    const pat = page.path.split("/").filter(Boolean);
    if (pat.length !== segs.length) continue;
    const params: Record<string, string> = {}; let score = 0; let ok = true;
    pat.forEach((s, i) => { if (!ok) return; if (s.startsWith(":")) params[s.slice(1)] = segs[i]!; else if (s === segs[i]) score++; else ok = false; });
    if (ok && (!best || score > best.score)) best = { page, params, score };
  }
  return best && { page: best.page, params: best.params };
}

/** Last location visited inside an app page (session), so native records opened from the app offer a way back. */
const RET = "digit-virtual-core:app-return:";
export function rememberAppLocation(plugin: string, href: string, label: string) {
  if (typeof window !== "undefined") sessionStorage.setItem(RET + plugin, JSON.stringify({ href, label }));
}
export function appReturn(plugin: string): { href: string; label: string } | null {
  if (typeof window === "undefined") return null;
  try { return JSON.parse(sessionStorage.getItem(RET + plugin) ?? "null"); } catch { return null; }
}
