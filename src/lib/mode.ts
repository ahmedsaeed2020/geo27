/**
 * Preview mode + customization layer. "Original" renders only the baseline
 * catalog. "Customized" applies entries from src/customizations/registry.ts
 * on top. Both modes share the same VirtualERPAdapter records.
 */
import { useSyncExternalStore } from "react";
import { customizations } from "@/customizations/registry";

export type Mode = "original" | "customized";
const KEY = "digit-virtual-core:mode";
const ls = new Set<() => void>();
const userKey = () => `${KEY}:${localStorage.getItem("digit-virtual-core:session-user-v1") || "Administrator"}`;
const read = (): Mode => (typeof window !== "undefined" && (localStorage.getItem(userKey()) ?? localStorage.getItem(KEY)) === "customized" ? "customized" : "original");

export function setMode(m: Mode) { localStorage.setItem(userKey(), m); ls.forEach((l) => l()); }
export function useMode(): Mode {
  return useSyncExternalStore((l) => { ls.add(l); return () => ls.delete(l); }, read, () => "original");
}

/** Developer mode (avatar menu): reveals preview diagnostics that real Frappe never shows (Developer drawer, field tags, filter chips). */
const DEV_KEY = "digit-virtual-core:developer-mode";
const dls = new Set<() => void>();
export function setDevMode(on: boolean) { localStorage.setItem(DEV_KEY, on ? "1" : "0"); dls.forEach((l) => l()); }
export function getDevMode() { return typeof window !== "undefined" && localStorage.getItem(DEV_KEY) === "1"; }
export function useDevMode(): boolean {
  return useSyncExternalStore((l) => { dls.add(l); return () => dls.delete(l); }, getDevMode, () => false);
}
export function activeCustomizations(mode: Mode, doctype?: string) {
  if (mode === "original") return [];
  return customizations.filter((c) => !doctype || c.targetDoctype === doctype);
}
