/**
 * Workspace layout resolution: System default (registry) → Published org/role default → User personal override.
 * Virtual Core limitation: published and personal layouts live in this browser's localStorage, keyed per
 * simulated session user — no cross-device persistence and no server-side Workspace customisation.
 */
import { useSyncExternalStore } from "react";
import type { Size, WorkspaceDef } from "./registry";

export type Layout = { order: string[]; sizes: Record<string, Size>; scope: { company?: string | undefined; days?: number | undefined } };
const P = "digit-ws:v1";
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());
const key = (ws: string, who: string) => `${P}:${who}:${ws}`;
const load = (k: string): Layout | null => { if (typeof window === "undefined") return null; try { const v = localStorage.getItem(k); return v ? (JSON.parse(v) as Layout) : null; } catch { return null; } };

export const systemDefault = (d: WorkspaceDef): Layout => ({ order: d.defaultOrder, sizes: {}, scope: {} });
export const publishedDefault = (d: WorkspaceDef) => load(key(d.id, "__published__")) ?? systemDefault(d);
export function resolveLayout(d: WorkspaceDef, user: string): { layout: Layout; source: "personal" | "published" | "system" } {
  const mine = load(key(d.id, user)); if (mine) return { layout: mine, source: "personal" };
  const pub = load(key(d.id, "__published__")); if (pub) return { layout: pub, source: "published" };
  return { layout: systemDefault(d), source: "system" };
}
export function savePersonal(ws: string, user: string, l: Layout) { localStorage.setItem(key(ws, user), JSON.stringify(l)); emit(); }
export function resetPersonal(ws: string, user: string) { localStorage.removeItem(key(ws, user)); emit(); }
export function publish(ws: string, l: Layout) { localStorage.setItem(key(ws, "__published__"), JSON.stringify({ ...l, scope: {} })); emit(); }
export function unpublish(ws: string) { localStorage.removeItem(key(ws, "__published__")); emit(); }

/**
 * Layouts saved by the pre-designer HR composer (read-only). The shared Dashboard Designer imports them once per user /
 * workspace (Composer.tsx) so nobody loses a saved arrangement; the legacy keys are kept for rollback.
 */
export function legacyLayouts(ws: string, user: string): { personal: Layout | null; published: Layout | null } {
  return { personal: load(key(ws, user)), published: load(key(ws, "__published__")) };
}

let ver = 0; subs.add(() => { ver++; });
export const useLayoutVersion = () => useSyncExternalStore((l) => { subs.add(l); return () => subs.delete(l); }, () => ver, () => 0);
