/**
 * Work tabs (owner decision 2 / OWN-55): every page or document the user opens is kept as a tab above the work area,
 * per simulated user, so switching back never loses the place. Pure store over localStorage; WorkTabs.tsx renders it.
 */
/** `titles` keeps the page's visible heading per UI language (Arabic screens show the Arabic heading, never the English route title). */
export interface WorkTab { key: string; href: string; title: string; at: string; titles?: Partial<Record<"en" | "ar", string>> }
export const WORK_TABS_KEY = "digit-virtual-core:work-tabs";
export const WORK_TABS_MAX = 12;
const EXCLUDED = /^\/(login|logout|print|__)/;
const k = (user: string) => `${WORK_TABS_KEY}:${user || "Guest"}`;
const listeners = new Set<() => void>();
let version = 0;
const emit = () => { version++; for (const l of listeners) l(); };
export const subscribeWorkTabs = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
export const workTabsVersion = () => version;

/** One tab per page path (a list keeps its latest filters in href); the three in-content tabs of a workspace
 * (…/<workspace>/overview | documents | reports, at least three segments deep) share the workspace's one tab. */
export const tabKey = (pathname: string) => { const p = pathname.replace(/\/+$/, "") || "/"; const m = p.match(/^(.*)\/(overview|documents|reports)$/); return m && m[1]!.split("/").filter(Boolean).length >= 3 ? m[1]! : p; };
export function workTabs(user: string): WorkTab[] {
  if (typeof localStorage === "undefined") return [];
  try { const v = JSON.parse(localStorage.getItem(k(user)) ?? "[]") as WorkTab[]; return Array.isArray(v) ? v.filter((t) => t && typeof t.href === "string") : []; } catch { return []; }
}
function save(user: string, tabs: WorkTab[]) { if (typeof localStorage !== "undefined") localStorage.setItem(k(user), JSON.stringify(tabs)); emit(); }

/** "Sales Invoice — DIGIT Pro" → "Sales Invoice"; empty titles fall back to the last path segment. */
export function tabTitle(docTitle: string, pathname: string): string {
  const t = docTitle.split(/\s[—|·-]\s/)[0]?.trim();
  if (t) return t.slice(0, 60);
  const seg = decodeURIComponent(pathname.split("/").filter(Boolean).pop() ?? "");
  return seg ? seg.replace(/[-_]/g, " ") : "Home";
}

/** Open (or refresh) the tab of a path; the oldest unpinned tab beyond the limit is dropped. Returns the tabs. */
export function openWorkTab(user: string, pathname: string, search: string, title: string, at = new Date().toISOString(), local?: { lang: "en" | "ar"; text: string }): WorkTab[] {
  if (EXCLUDED.test(pathname)) return workTabs(user);
  const key = tabKey(pathname); const href = `${pathname}${search}`;
  const cur = workTabs(user); const i = cur.findIndex((t) => t.key === key);
  const heading = local?.text.replace(/\s+/g, " ").trim().slice(0, 60);
  let next: WorkTab[];
  if (i >= 0) { const prev = cur[i]!; if (prev.href === href && prev.title === title && (!heading || prev.titles?.[local!.lang] === heading)) return cur; next = cur.map((t, j) => (j === i ? { ...t, href, title: title || t.title, at, ...(heading ? { titles: { ...t.titles, [local!.lang]: heading } } : {}) } : t)); }
  else {
    next = [...cur, { key, href, title, at, ...(heading ? { titles: { [local!.lang]: heading } } : {}) }];
    while (next.length > WORK_TABS_MAX) { let o = 0; for (let j = 1; j < next.length - 1; j++) if (next[j]!.at < next[o]!.at) o = j; next.splice(o, 1); }
  }
  save(user, next); return next;
}
/** Tab caption in the UI language: the page heading seen in that language, else the route title. */
export const tabCaption = (t: WorkTab, lang: "en" | "ar") => t.titles?.[lang] ?? t.title;
/** Close a tab; returns the href to show next when the closed tab was the current one (its neighbour), else undefined. */
export function closeWorkTab(user: string, key: string, currentKey: string): string | undefined {
  const cur = workTabs(user); const i = cur.findIndex((t) => t.key === key); if (i < 0) return undefined;
  const next = cur.filter((t) => t.key !== key); save(user, next);
  if (key !== currentKey) return undefined;
  return (next[i] ?? next[i - 1])?.href ?? "/";
}
export function closeOtherWorkTabs(user: string, key: string) { save(user, workTabs(user).filter((t) => t.key === key)); }
export function moveWorkTab(user: string, key: string, delta: -1 | 1) {
  const cur = workTabs(user); const i = cur.findIndex((t) => t.key === key); const j = i + delta;
  if (i < 0 || j < 0 || j >= cur.length) return;
  const next = [...cur]; [next[i], next[j]] = [next[j]!, next[i]!]; save(user, next);
}
