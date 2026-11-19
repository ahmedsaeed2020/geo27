/**
 * ScreenHost — the shared Shell's one content host names the registered screen it renders.
 *
 * Every page renders the shared Shell (src/components/Shell.tsx), whose single `<main data-shell-main>` is the content
 * host. This hook resolves the current path against the shared-experience registry (registry.ts screenAtPath) and
 * returns the host attributes `data-screen-host` / `data-screen-id` / `data-screen-app` / `data-screen-kind`, so the
 * trace "registered screen → route → rendered host" is read from the live page instead of inferred. It also keeps one
 * receipt per path for this browser session (hosts counted after commit: more than one `[data-shell-main]` means a
 * nested Shell), which the Developer "App experience registry" page lists.
 *
 * The registry module is loaded lazily after hydration, so the first paint (server and client) carries no screen
 * attributes and the Shell bundle does not pull every app's declaration.
 */
import { useEffect, useState, useSyncExternalStore } from "react";

export type ScreenHostState = "REGISTERED" | "UNREGISTERED" | "CONFLICT";
export interface ScreenReceipt { path: string; state: ScreenHostState; screenId?: string; appId?: string; kind?: string; conflict?: string[]; hosts: number; at: number }

type Hit = { screenId: string; appId: string; kind: string } | { conflict: string[] } | null;

const receipts = new Map<string, ScreenReceipt>();
const subs = new Set<() => void>();
let version = 0;
const MAX_RECEIPTS = 200;

/** Receipts of this browser session, oldest first. */
export function screenReceipts(): ScreenReceipt[] { return [...receipts.values()]; }
export function useScreenReceipts(): ScreenReceipt[] {
  useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, () => version, () => 0);
  return screenReceipts();
}

let registry: Promise<typeof import("./registry")> | null = null;

export function useScreenHost(path: string): Record<string, string> {
  const [hit, setHit] = useState<{ path: string; v: Hit } | null>(null);
  useEffect(() => {
    let live = true;
    (registry ??= import("./registry")).then((R) => {
      if (!live) return;
      const r = R.screenAtPath(path);
      setHit({ path, v: !r ? null : "conflict" in r ? { conflict: r.conflict } : { screenId: r.screen.screenId, appId: r.app.appId, kind: r.screen.kind ?? "WORKSPACE" } });
    }).catch(() => { if (live) setHit({ path, v: null }); });
    return () => { live = false; };
  }, [path]);
  useEffect(() => {
    if (!hit || hit.path !== path) return;
    const v = hit.v;
    const hosts = document.querySelectorAll("[data-shell-main]").length;
    const base = { path, hosts, at: Date.now() };
    receipts.delete(path);
    receipts.set(path, !v ? { ...base, state: "UNREGISTERED" } : "conflict" in v ? { ...base, state: "CONFLICT", conflict: v.conflict } : { ...base, state: "REGISTERED", ...v });
    if (receipts.size > MAX_RECEIPTS) receipts.delete(receipts.keys().next().value as string);
    version++; subs.forEach((f) => f());
  }, [hit, path]);
  if (!hit || hit.path !== path) return {};
  const v = hit.v;
  if (!v) return { "data-screen-host": "unregistered" };
  if ("conflict" in v) return { "data-screen-host": "conflict" };
  return { "data-screen-host": "registered", "data-screen-id": v.screenId, "data-screen-app": v.appId, "data-screen-kind": v.kind };
}
