/**
 * One authoritative mount per app + screen + semantic block (Slice B). The first mounted instance of a key owns it;
 * any further instance on the same page renders nothing (and a Developer-mode DUPLICATE_MOUNT note), so a shared block
 * can never stack twice even when two hosts place it. Distinct blocks — even of the same kind — have different keys and
 * are never deduplicated. Ownership is released on unmount, so route changes and React strict re-mounts hand over cleanly.
 */
const owners = new Map<string, string>();
const dupes = new Map<string, number>();

export const mountKey = (app: string, screen: string, block: string) => `${app}|${screen}|${block}`;

/** Claim `key` for instance `id`; false when another live instance already owns it. */
export function claimMount(key: string, id: string): boolean {
  const o = owners.get(key);
  if (o && o !== id) { dupes.set(key, (dupes.get(key) ?? 0) + 1); return false; }
  owners.set(key, id);
  return true;
}
export function releaseMount(key: string, id: string): void { if (owners.get(key) === id) owners.delete(key); }
/** Live owners (diagnostics/tests). */
export const mountedKeys = (): string[] => [...owners.keys()];
/** Duplicate mount attempts seen since start (diagnostics/tests). */
export const duplicateMounts = (): Record<string, number> => Object.fromEntries(dupes);
export function resetMounts(): void { owners.clear(); dupes.clear(); }
