/**
 * R2 M-01 / M-13 — role-based DIGIT Pro home with a personal pinned home.
 * Entering DIGIT Pro (dock icon, rail logo, "DIGIT Pro" breadcrumb, the app's "/" entry) opens /pro/home, which resolves:
 *   1. the user's pinned home, when it is still a permitted home page for them;
 *   2. else the first role home whose roles the user holds AND whose source DocType the user may read
 *      (executive → accounting → selling → purchasing → inventory);
 *   3. else the first readable home page, else the Reports Center (always available; it filters itself).
 * Only page paths are stored (this browser, per simulated session user) — never business values. A pinned home never
 * grants access: it is re-checked against the same session permission rules every time.
 * Future Frappe destination: per-user default workspace (`User.default_workspace`) — see the R2 gap register.
 */
import { useSyncExternalStore } from "react";
import { canReadType } from "@/lib/scope";
import { ADMIN, currentUser, userRoles } from "@/lib/session";

export const HOME_KEY = "digit-pro:home:v1";
export interface HomeCandidate { to: string; label: string; ar: string; source?: string; roles: string[] }

/** Ordered by default priority. `source` is the DocType whose read permission the page's primary figures need. */
export const HOME_CANDIDATES: readonly HomeCandidate[] = [
  { to: "/pro/dashboard", label: "Executive Dashboard", ar: "لوحة التحكم التنفيذية", source: "GL Entry", roles: ["System Manager", "Accounts Manager"] },
  { to: "/pro/finance", label: "Accounting Overview", ar: "نظرة عامة على المحاسبة", source: "GL Entry", roles: ["Accounts User", "Accounts Manager"] },
  { to: "/pro/selling-overview", label: "Selling Overview", ar: "نظرة عامة على المبيعات", source: "Sales Order", roles: ["Sales User", "Sales Manager", "Sales Master Manager"] },
  { to: "/pro/purchasing-overview", label: "Purchasing Overview", ar: "نظرة عامة على المشتريات", source: "Purchase Order", roles: ["Purchase User", "Purchase Manager", "Purchase Master Manager"] },
  { to: "/pro/inventory-overview", label: "Inventory Overview", ar: "نظرة عامة على المخزون", source: "Bin", roles: ["Stock User", "Stock Manager", "Item Manager"] },
  { to: "/pro/assets-overview", label: "Assets Overview", ar: "نظرة عامة على الأصول", source: "Asset", roles: [] },
  { to: "/pro/reports", label: "Reports Center", ar: "مركز التقارير", roles: [] },
];
export const HOME_SOURCES = [...new Set(HOME_CANDIDATES.map((c) => c.source).filter((s): s is string => !!s))];
export const isHomeCandidate = (path: string) => HOME_CANDIDATES.some((c) => c.to === path.replace(/\/$/, ""));

type Store = Record<string, string>;
const subs = new Set<() => void>();
let version = 0;
const hasWindow = () => typeof window !== "undefined" && typeof localStorage !== "undefined";
function read(): Store {
  if (!hasWindow()) return {};
  try { const v: unknown = JSON.parse(localStorage.getItem(HOME_KEY) ?? "{}"); return v && typeof v === "object" && !Array.isArray(v) ? (v as Store) : {}; } catch { return {}; }
}
export function pinnedHome(user = currentUser()): string | undefined { const v = read()[user]; return typeof v === "string" && isHomeCandidate(v) ? v : undefined; }
export function setPinnedHome(user: string, to: string | undefined) {
  if (!hasWindow()) return;
  const s = read();
  if (to && isHomeCandidate(to)) s[user] = to; else delete s[user];
  localStorage.setItem(HOME_KEY, JSON.stringify(s)); version++; subs.forEach((f) => f());
}
export function usePinnedHome(user: string): string | undefined {
  useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => version, () => 0);
  return pinnedHome(user);
}

const readable = (c: HomeCandidate, user: string) => !c.source || canReadType(c.source, user);
/** Home pages this user may open (pin choices). */
export function permittedHomes(user = currentUser()): HomeCandidate[] { return HOME_CANDIDATES.filter((c) => readable(c, user)); }

/** Resolves where "DIGIT Pro" opens for this user, and why (for the page's own disclosure and tests). */
export function resolveHome(user = currentUser()): { to: string; reason: "pinned" | "role" | "readable" | "fallback" } {
  const pin = pinnedHome(user); const pinC = pin ? HOME_CANDIDATES.find((c) => c.to === pin) : undefined;
  if (pinC && readable(pinC, user)) return { to: pinC.to, reason: "pinned" };
  const roles = user === ADMIN ? ["System Manager"] : userRoles(user);
  const byRole = HOME_CANDIDATES.find((c) => c.roles.some((r) => roles.includes(r)) && readable(c, user));
  if (byRole) return { to: byRole.to, reason: "role" };
  const any = HOME_CANDIDATES.find((c) => c.source && readable(c, user));
  if (any) return { to: any.to, reason: "readable" };
  return { to: "/pro/reports", reason: "fallback" };
}
