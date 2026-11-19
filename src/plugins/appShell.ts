/**
 * Active DIGIT app shell (P4). Entering an app (its workspace, or any deep link carrying `?app=<name>`) keeps the
 * Shell branded with that app and its contextual navigation — workspace, owned registers, extended native DocTypes,
 * reports and settings — while lists/forms/reports keep using the shared native routes and data underneath.
 * Exiting (or disabling the app) restores the standard Desk. Session-scoped, display-only state.
 */
import { useSyncExternalStore } from "react";
import { enabledPlugins, pluginSlug, subscribePlugins } from "./runtime";
import type { PluginManifest } from "./types";

const KEY = "digit-virtual-core:active-app";
const isB = typeof window !== "undefined";
const subs = new Set<() => void>();
const read = () => (isB ? sessionStorage.getItem(KEY) ?? "" : "");
export function activeAppName(): string { const n = read(); return n && enabledPlugins().some((p) => p.name === n) ? n : ""; }
export function enterApp(name: string) { if (!isB || read() === name) return; sessionStorage.setItem(KEY, name); subs.forEach((f) => f()); }
export function exitApp() { if (!isB || !read()) return; sessionStorage.removeItem(KEY); subs.forEach((f) => f()); }
const subscribe = (f: () => void) => { subs.add(f); const u = subscribePlugins(f); return () => { subs.delete(f); u(); }; };
export function useActiveApp(): PluginManifest | undefined {
  const name = useSyncExternalStore(subscribe, activeAppName, () => "");
  return name ? enabledPlugins().find((p) => p.name === name) : undefined;
}

export interface AppNavEntry { group: "workspace" | "documents" | "extended" | "reports" | "settings"; label: string; label_ar?: string | undefined; to: string; params?: Record<string, string> | undefined }
/** Contextual navigation derived only from the manifest (no hard-coded menus). Extended native DocTypes route to their native slot. */
export function appNavigation(p: PluginManifest, nativeSlot: (dt: string) => { app: string; slug: string } | undefined): AppNavEntry[] {
  const out: AppNavEntry[] = [{ group: "workspace", label: p.workspaces?.[0]?.label ?? p.title, label_ar: p.title_ar, to: "/plugins/$name", params: { name: p.name } }];
  for (const d of p.doctypes ?? []) if (!d.istable && !d.issingle) out.push({ group: "documents", label: d.name, to: "/app/$app/$doctype", params: { app: p.host_app, doctype: pluginSlug(d.name) } });
  for (const dt of [...new Set((p.custom_fields ?? []).map((c) => c.dt))]) { const s = nativeSlot(dt); if (s) out.push({ group: "extended", label: dt, to: "/app/$app/$doctype", params: { app: s.app, doctype: s.slug } }); }
  for (const r of p.reports ?? []) out.push({ group: "reports", label: r.name, to: "/plugins/$name/report/$report", params: { name: p.name, report: r.name } });
  for (const s of p.settings ?? []) out.push({ group: "settings", label: s.label, label_ar: s.label_ar, to: "/app/$app/$doctype/$name", params: { app: p.host_app, doctype: pluginSlug(s.doctype), name: s.doctype } });
  return out;
}
