/**
 * S2 Recent & pinned documents (Frappe keeps "recent" per user in frappe.boot.user.recent; DIGIT adds pinning).
 * Per simulated user, stored in browser storage like the other personal UI preferences; a deleted document drops out.
 */
import { useSyncExternalStore } from "react";
import { adapter } from "./adapter";

export const RECENT_KEY = "digit-virtual-core:recent-docs";
export const RECENT_MAX = 10;
export interface DocRef { doctype: string; name: string; app: string; title?: string; at: string }
interface Store { recent: DocRef[]; pinned: DocRef[] }
const listeners = new Set<() => void>();
let version = 0;
const storage = (): Storage | undefined => (typeof localStorage === "undefined" ? undefined : localStorage);
function readAll(): Record<string, Store> {
  try { return JSON.parse(storage()?.getItem(RECENT_KEY) ?? "{}") as Record<string, Store>; } catch { return {}; }
}
function read(user: string): Store { const s = readAll()[user]; return { recent: s?.recent ?? [], pinned: s?.pinned ?? [] }; }
function write(user: string, s: Store) {
  const all = readAll(); all[user] = s;
  try { storage()?.setItem(RECENT_KEY, JSON.stringify(all)); } catch { /* storage full: keep in memory only for this render */ }
  version++; listeners.forEach((l) => l());
}
const same = (a: Pick<DocRef, "doctype" | "name">, b: Pick<DocRef, "doctype" | "name">) => a.doctype === b.doctype && a.name === b.name;
const alive = (r: DocRef) => !!adapter.get(r.doctype, r.name);

/** Records that `user` opened a saved document (unsaved drafts are never recorded). Newest first, at most ten. */
export function recordOpen(user: string, ref: Omit<DocRef, "at">, at = new Date().toISOString()): void {
  if (!user || !ref.name || ref.name.startsWith("new-")) return;
  const s = read(user);
  if (s.recent[0] && same(s.recent[0], ref) && s.recent[0].title === ref.title) return; // re-render of the same document
  write(user, { ...s, recent: [{ ...ref, at }, ...s.recent.filter((r) => !same(r, ref))].slice(0, RECENT_MAX) });
}
export function recentDocs(user: string): DocRef[] { return read(user).recent.filter(alive).slice(0, RECENT_MAX); }
export function pinnedDocs(user: string): DocRef[] { return read(user).pinned.filter(alive); }
export function isPinned(user: string, ref: Pick<DocRef, "doctype" | "name">): boolean { return read(user).pinned.some((r) => same(r, ref)); }
/** Pins or unpins; returns the new pinned state. */
export function togglePin(user: string, ref: Omit<DocRef, "at">, at = new Date().toISOString()): boolean {
  const s = read(user); const on = s.pinned.some((r) => same(r, ref));
  write(user, { ...s, pinned: on ? s.pinned.filter((r) => !same(r, ref)) : [{ ...ref, at }, ...s.pinned] });
  return !on;
}
export function useRecentVersion(): number {
  return useSyncExternalStore((l) => { listeners.add(l); return () => { listeners.delete(l); }; }, () => version, () => 0);
}
