/**
 * Visible addresses of DIGIT HR (owner brief 2026-11-15): /hr/<department>/<section>/<tab>, /hr/doc/<doctype>/<name>,
 * /hr/mission-control, /hr/<department>, /hr/boards/{hiring,separation}, /hr/<kind>/<name> for the five 360 profiles and
 * /hr/report/<name>. The router keeps the internal paths (/digit-hr/…, /app/<app>/<doctype>/…?app=digit_hr, /report/…);
 * src/lib/appUrls.ts applies this pair as the router's URL rewrite, so every menu, link, drill and redirect shows one map
 * and an old /digit-hr/… address opens the same page and is shown at its new address. Phone self-service pages
 * (/hr, /hr/home, /hr/leave-applications, …) are not HR addresses here and are never touched.
 */
import NATIVE from "../nativeMap";
import { deptById, deptBySlug, HR_DEPTS, HR_PAGE_ADDRESSES, HR_PROFILE_ADDRESSES, HR_SECTIONS, HR_TABS, sectionById, sectionBySlug, type HrTab } from "./structure";

export const HR_APP = "digit_hr";
export const HR_INTERNAL = "/digit-hr";
export const HR_PUBLIC = "/hr";

/** Native slot (app) of every DocType slug the HR sections open; other slugs carry ?src=<app> on the visible address. */
const SLUG_APP: Record<string, string> = {};
for (const list of Object.values(NATIVE)) for (const d of list) SLUG_APP[d.slug] ??= d.app;
export const hrSlugApp = (slug: string) => SLUG_APP[slug];

const TAB_SET = new Set<string>(HR_TABS);
const PAGE_BY_INTERNAL = new Map(HR_PAGE_ADDRESSES.map((p) => [p.internal, p]));
const PROFILE_TO_VISIBLE = new Map(HR_PROFILE_ADDRESSES);
const PROFILE_TO_INTERNAL = new Map(HR_PROFILE_ADDRESSES.map(([i, v]) => [v, i]));
const segsOf = (p: string) => p.split("/").filter(Boolean).map((s) => { try { return decodeURIComponent(s); } catch { return s; } });
const enc = (s: string) => encodeURIComponent(s);

/** Visible address → internal router path (undefined when the address is not a DIGIT HR address). */
export function hrInput(url: URL): URL | undefined {
  const p = url.pathname;
  if (!(p === `${HR_PUBLIC}/` || p.startsWith(`${HR_PUBLIC}/`))) return undefined;
  const segs = segsOf(p.slice(HR_PUBLIC.length));
  const head = segs[0];
  if (!head) return undefined;
  const out = new URL(url.href);
  const to = (path: string) => { out.pathname = path; return out; };
  if (head === "mission-control" && segs.length === 1) return to(HR_INTERNAL);
  if (head === "doc" && segs.length >= 2 && segs.length <= 3) {
    const slug = segs[1]!; const app = url.searchParams.get("src") || SLUG_APP[slug] || "erpnext";
    out.searchParams.delete("src"); out.searchParams.set("app", HR_APP);
    return to(`/app/${app}/${enc(slug)}${segs[2] ? `/${enc(segs[2])}` : ""}`);
  }
  if (head === "report" && segs.length === 2) { out.searchParams.set("app", HR_APP); return to(`/report/${enc(segs[1]!)}`); }
  if (head === "boards" && segs.length === 2) { const pg = HR_PAGE_ADDRESSES.find((x) => x.visible === `/hr/boards/${segs[1]}`); return pg ? to(`${HR_INTERNAL}/${pg.internal}`) : undefined; }
  if (head === "metrics" && segs.length === 2) return to(`${HR_INTERNAL}/metrics/${enc(segs[1]!)}`);
  const prof = PROFILE_TO_INTERNAL.get(head);
  if (prof && segs.length === 2) return to(`${HR_INTERNAL}/${prof}/${enc(segs[1]!)}`);
  const dept = deptBySlug(head);
  if (!dept) return undefined;
  if (segs.length === 1) return to(`${HR_INTERNAL}/m/${dept.id}`);
  const sec = sectionBySlug(dept.id, segs[1]!);
  if (!sec || segs.length > 3) return undefined;
  const third = segs[2];
  if (!third || TAB_SET.has(third)) {
    if (third && third !== "overview") out.searchParams.set("tab", third); else out.searchParams.delete("tab");
    return to(`${HR_INTERNAL}/s/${sec.id}`);
  }
  const page = HR_PAGE_ADDRESSES.find((x) => x.section === sec.id && x.visible === third);
  return page ? to(`${HR_INTERNAL}/${page.internal}`) : undefined;
}

/** Internal router path → visible address (undefined when the path is not a DIGIT HR path). */
export function hrOutput(url: URL): URL | undefined {
  const p = url.pathname;
  const out = new URL(url.href);
  const show = (path: string) => { out.pathname = path; return out; };
  if (p === HR_INTERNAL || p === `${HR_INTERNAL}/`) return show(`${HR_PUBLIC}/mission-control`);
  if (p.startsWith(`${HR_INTERNAL}/`)) {
    const segs = segsOf(p.slice(HR_INTERNAL.length));
    const [a, b] = segs;
    if (a === "m" && b && segs.length === 2) { const d = deptById(b); return d ? show(`${HR_PUBLIC}/${d.slug}`) : undefined; }
    if (a === "s" && b && segs.length === 2) {
      const s = sectionById(b); const d = s ? deptById(s.dept) : undefined; if (!s || !d) return undefined;
      const raw = url.searchParams.get("tab") ?? "overview"; out.searchParams.delete("tab");
      const tab: HrTab = raw === "documents" || raw === "actions" || raw === "relations" ? "documents" : raw === "reports" || raw === "planned" ? "reports" : "overview";
      return show(`${HR_PUBLIC}/${d.slug}/${s.slug}/${tab}`);
    }
    if (a === "metrics" && b && segs.length === 2) return show(`${HR_PUBLIC}/metrics/${enc(b)}`);
    const prof = a ? PROFILE_TO_VISIBLE.get(a) : undefined;
    if (prof && b && segs.length === 2) return show(`${HR_PUBLIC}/${prof}/${enc(b)}`);
    const page = a && segs.length === 1 ? PAGE_BY_INTERNAL.get(a) : undefined;
    if (page) {
      if (page.visible.startsWith("/")) return show(page.visible);
      const s = sectionById(page.section!); const d = s ? deptById(s.dept) : undefined;
      return s && d ? show(`${HR_PUBLIC}/${d.slug}/${s.slug}/${page.visible}`) : undefined;
    }
    return undefined;
  }
  if (url.searchParams.get("app") !== HR_APP) return undefined;
  const a = /^\/app\/([^/]+)\/([^/]+)(\/[^/]+)?\/?$/.exec(p);
  if (a) {
    out.searchParams.delete("app");
    if ((SLUG_APP[a[2]!] ?? "erpnext") !== a[1]) out.searchParams.set("src", a[1]!);
    return show(`${HR_PUBLIC}/doc/${a[2]}${a[3] ?? ""}`);
  }
  const r = /^\/report\/([^/]+)\/?$/.exec(p);
  if (r) { out.searchParams.delete("app"); return show(`${HR_PUBLIC}/report/${r[1]}`); }
  return undefined;
}

/** Search params that keep a native list / form / report inside the HR frame (shown at /hr/doc/… or /hr/report/…). */
export const HR_DOC_SEARCH = { app: HR_APP } as const;
export const hrSearch = <T extends Record<string, unknown>>(s?: T): T & { app: string } => ({ ...(s ?? ({} as T)), app: HR_APP });

/** Every visible HR address the menu offers (departments, sections × tabs, Mission Control) — used by tests and crawlers. */
export function hrAddresses(): string[] {
  return [`${HR_PUBLIC}/mission-control`, ...HR_DEPTS.map((d) => `${HR_PUBLIC}/${d.slug}`),
    ...HR_SECTIONS.flatMap((s) => HR_TABS.map((t) => `${HR_PUBLIC}/${deptById(s.dept)!.slug}/${s.slug}/${t}`))];
}
