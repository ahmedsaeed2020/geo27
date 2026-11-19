/**
 * Visible addresses of DIGIT Construction (owner ruling 2026-11-14): the app opens under its own path like Pro —
 * /construction/<department>/<workspace>/<tab>, /construction/doc/<doctype>/<name> (and /construction/doc/<doctype> for
 * the list) — and no "/plugins/…" address is ever shown. The code stays in src/plugins/digit_construction (it exports as
 * its own Frappe app); the router keeps its internal paths (/plugins/digit_construction/…, /app/<app>/<doctype>/…?app=…)
 * and src/lib/appUrls.ts applies this pair as the router's URL rewrite, so every menu, link, drill and redirect follows
 * one map. An old /plugins/digit_construction/… address resolves to the same page and is replaced by its new address.
 */
import { WS_INDEX, WS_SLUGS, DEPT_NAMES, deptBySlug, wsBySlug, wsRoute } from "./r19/wsIndex";

export const CON_APP = "digit_construction";
export const CON_INTERNAL = `/plugins/${CON_APP}`;
export const CON_PUBLIC = "/construction";
const inside = (p: string, base: string) => p === base || p.startsWith(`${base}/`);
const LEGACY_TAB: Record<string, "documents" | "reports"> = { work: "documents", reports: "reports" };

/** Visible address → internal router path (undefined when the address is not a Construction address). */
export function conInput(url: URL): URL | undefined {
  if (!inside(url.pathname, CON_PUBLIC)) return undefined;
  const rest = url.pathname.slice(CON_PUBLIC.length).replace(/^\/+/, "").replace(/\/+$/, "");
  const segs = rest.split("/").filter(Boolean);
  const out = new URL(url.href);
  if (segs[0] === "doc" && segs.length >= 2 && segs.length <= 3) {
    // a document of the app context: the native list / form route, with the app kept so the app menu stays
    out.pathname = `/app/${url.searchParams.get("src") || "erpnext"}/${segs.slice(1).join("/")}`;
    out.searchParams.delete("src"); out.searchParams.set("app", CON_APP);
    return out;
  }
  out.pathname = rest ? `${CON_INTERNAL}/${rest}` : CON_INTERNAL;
  return out;
}

/** Internal router path → visible address (undefined when the path is not a Construction path). */
export function conOutput(url: URL): URL | undefined {
  const p = url.pathname;
  if (inside(p, CON_INTERNAL)) {
    let rest = p.slice(CON_INTERNAL.length).replace(/^\/+/, "");
    const out = new URL(url.href);
    // an older workspace link (ws/<id>?tab=…) is shown at its department / workspace / tab address
    const legacy = /^ws\/(\d\d-\d\d)$/.exec(rest);
    if (legacy && WS_SLUGS[legacy[1]!]) { rest = wsRoute(legacy[1]!, LEGACY_TAB[url.searchParams.get("tab") ?? ""] ?? "overview"); out.searchParams.delete("tab"); }
    if (out.searchParams.get("app") === CON_APP) out.searchParams.delete("app");
    out.pathname = rest ? `${CON_PUBLIC}/${rest}` : CON_PUBLIC;
    return out;
  }
  const a = /^\/app\/([^/]+)\/([^/]+)(\/[^/]+)?\/?$/.exec(p);
  if (a && url.searchParams.get("app") === CON_APP) {
    const out = new URL(url.href);
    out.pathname = `${CON_PUBLIC}/doc/${a[2]}${a[3] ?? ""}`;
    out.searchParams.delete("app");
    if (a[1] !== "erpnext") out.searchParams.set("src", a[1]!);
    return out;
  }
  return undefined;
}

/** Internal href (path + search) → visible href; for code that writes the address bar or copies a link itself. */
export function conPublicHref(href: string): string {
  const u = new URL(href, "http://x");
  const o = conOutput(u);
  return o ? `${o.pathname}${o.search}${o.hash}` : href;
}

const TAB_EN: Record<string, string> = { overview: "Overview", documents: "Documents & work", reports: "Full reports" };
/** English page title of an app page path (<department>/<workspace>/<tab>), for the route head; undefined when not a workspace path. */
export function conTitle(splat: string): string | undefined {
  const [d, w, tab] = splat.split("/");
  const dept = d ? deptBySlug(d) : undefined; if (!dept) return undefined;
  const id = w ? wsBySlug(d!, w) : undefined; const ws = id ? WS_INDEX.find((x) => x[0] === id)?.[1] : undefined;
  return [ws, ws && tab && TAB_EN[tab] ? TAB_EN[tab] : undefined, ws ? undefined : DEPT_NAMES[dept]?.[0], "DIGIT Construction"].filter(Boolean).join(" — ");
}
