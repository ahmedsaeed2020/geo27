/**
 * Runtime host of the app. The Lovable preview runs the Virtual Core (synthetic data in the browser). The Frappe v16
 * package hosts the same React screens at /digit-hr on a real site; its page sets window.__DIGIT_FRAPPE__ before the
 * bundle loads, and then records come from (and are written to) the real site through the DIGIT HR bridge API.
 * Shared modules read this flag only to choose persistence/identity; business rules stay identical in both hosts.
 */
export interface FrappeHost {
  user: string;
  full_name: string;
  lang: "ar" | "en";
  csrf_token: string;
  /** whitelisted method prefix, e.g. /api/method/digit_hr.api.bridge */
  api: string;
  /** static asset base of the SPA build, e.g. /assets/digit_hr/frontend */
  assets: string;
  /** Frappe desk route prefix (v16: /desk) */
  desk: string;
  site?: string;
  /** filled by the bridge after boot */
  roles?: string[];
  employee?: string | null;
}

type HostWindow = { __DIGIT_FRAPPE__?: FrappeHost };

export function frappeHost(): FrappeHost | null {
  if (typeof window === "undefined") return null;
  return (window as unknown as HostWindow).__DIGIT_FRAPPE__ ?? null;
}

export const isFrappeHosted = (): boolean => frappeHost() !== null;

/** Frappe desk route slug (frappe.router.slug): lower case, spaces to hyphens. */
export const deskSlug = (doctype: string): string => doctype.toLowerCase().replace(/[\s_]+/g, "-");

/** Real Desk URL for a DocType list, a record, or a new record (with optional field prefill as route options). */
export function deskUrl(doctype: string, name?: string, prefill?: Record<string, unknown>): string {
  const base = `${frappeHost()?.desk ?? "/desk"}/${deskSlug(doctype)}`;
  if (!name) return base;
  const url = `${base}/${encodeURIComponent(name)}`;
  if (name !== "new" || !prefill) return url;
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(prefill)) if (v !== undefined && v !== null && v !== "") q.set(k, String(v));
  const s = q.toString();
  return s ? `${url}?${s}` : url;
}

/** Write operations the host accepts for a DocType (set by the Frappe bridge after boot from the server policy). */
let hostPolicy: ((doctype: string, op: "insert" | "update" | "submit" | "cancel" | "delete" | "workflow") => boolean) | null = null;
export function setHostPolicy(f: typeof hostPolicy) { hostPolicy = f; }
/** In the preview every operation is available; on a Frappe site only what the server policy allows. */
export function hostAllows(doctype: string, op: "insert" | "update" | "submit" | "cancel" | "delete" | "workflow"): boolean {
  if (!frappeHost()) return true;
  return hostPolicy ? hostPolicy(doctype, op) : false;
}

