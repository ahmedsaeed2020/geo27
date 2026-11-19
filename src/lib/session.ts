/**
 * Session user + permission engine (port of frappe/permissions.py: has_permission, get_role_permissions,
 * if_owner, user permissions, permlevel). Runs over adapter records so every view enforces the same rules.
 * Administrator bypasses everything, as in Frappe. Switch User is a preview simulation of logging in as another user.
 */
import { useSyncExternalStore } from "react";
import { adapter, type Doc } from "./adapter";
import type { DocTypeMeta } from "./catalog";

const KEY = "digit-virtual-core:session-user-v1";
const subs = new Set<() => void>();
const isB = typeof window !== "undefined";
export const ADMIN = "Administrator";
export function currentUser(): string { if (!isB) return ADMIN; return localStorage.getItem(KEY) || ADMIN; }
export function switchUser(u: string) { if (u === ADMIN) localStorage.removeItem(KEY); else localStorage.setItem(KEY, u); subs.forEach((f) => f()); }
export function subscribeSession(f: () => void) { subs.add(f); return () => { subs.delete(f); }; }
export function useSessionUser() { return useSyncExternalStore(subscribeSession, currentUser, () => ADMIN); }

export type PType = "read" | "write" | "create" | "submit" | "cancel" | "delete" | "amend" | "report" | "export" | "import" | "print" | "email" | "share";
type Perm = Record<string, unknown> & { role: string; permlevel?: number; if_owner?: number };

export function userRoles(user = currentUser()): string[] {
  if (user === ADMIN) return ["Administrator", "System Manager", "All", "Guest"];
  const u = adapter.get("User", user);
  const rows = (Array.isArray(u?.["roles"]) ? (u!["roles"] as Record<string, unknown>[]) : []).map((r) => String(r["role"] ?? "")).filter(Boolean);
  return [...new Set([...rows, "All", "Guest"])];
}
/** Custom DocPerm replaces the DocType JSON permissions once present (frappe get_perms_for). */
export function permRules(meta: DocTypeMeta): Perm[] {
  const custom = adapter.list("Custom DocPerm").filter((p) => p["parent"] === meta.name) as unknown as Perm[];
  return custom.length ? custom : ((meta.permissions ?? []) as unknown as Perm[]);
}
const isAdmin = (user: string) => user === ADMIN;
const mine = (meta: DocTypeMeta, user: string, level = 0) => { const roles = new Set(userRoles(user)); return permRules(meta).filter((p) => roles.has(p.role) && Number(p.permlevel ?? 0) === level); };

/** User Permission records restricting this user (allow DocType → allowed values), honouring applicable_for. */
export function userPermissions(user = currentUser(), forDoctype?: string): Map<string, Set<string>> {
  const m = new Map<string, Set<string>>();
  if (user === ADMIN) return m;
  for (const p of adapter.list("User Permission")) {
    if (p["user"] !== user || !p["allow"]) continue;
    const af = String(p["applicable_for"] ?? ""); const all = Number(p["apply_to_all_doctypes"] ?? (af ? 0 : 1)) === 1;
    if (forDoctype && !all && af && af !== forDoctype) continue;
    const s = m.get(String(p["allow"])) ?? new Set<string>(); s.add(String(p["for_value"] ?? "")); m.set(String(p["allow"]), s);
  }
  return m;
}
export function userPermOk(meta: DocTypeMeta, doc: Doc, user = currentUser()): boolean {
  const up = userPermissions(user, meta.name); if (!up.size) return true;
  for (const [allow, vals] of up) {
    if (meta.name === allow) { if (!vals.has(doc.name)) return false; continue; }
    for (const f of meta.fields) if (f.fieldtype === "Link" && f.options === allow && f.fieldname && !f["ignore_user_permissions"]) {
      const v = doc[f.fieldname]; if (v && !vals.has(String(v))) return false;
    }
  }
  return true;
}

export function hasPerm(meta: DocTypeMeta, ptype: PType, doc?: Doc, user = currentUser()): boolean {
  if (isAdmin(user)) return true;
  const rules = mine(meta, user).filter((p) => Number(p[ptype] ?? 0) === 1);
  if (!rules.length) return false;
  if (doc) {
    if (rules.every((p) => Number(p.if_owner ?? 0) === 1) && String(doc["owner"] ?? ADMIN) !== user) return false;
    if (ptype !== "create" && !userPermOk(meta, doc, user)) return false;
  }
  return true;
}
/** Rows this user may read (list view, link search, report source rows). */
export function filterReadable(meta: DocTypeMeta, rows: Doc[], user = currentUser()): Doc[] {
  if (isAdmin(user)) return rows;
  if (!hasPerm(meta, "read", undefined, user)) return [];
  return rows.filter((d) => hasPerm(meta, "read", d, user));
}
/** permlevel access: fields at a level the user cannot read are hidden; levels without write are read-only. */
export function levelAccess(meta: DocTypeMeta, user = currentUser()): { read: Set<number>; write: Set<number> } {
  const read = new Set<number>(), write = new Set<number>();
  if (isAdmin(user)) return { read: new Set([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]), write: new Set([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]) };
  const roles = new Set(userRoles(user));
  for (const p of permRules(meta)) if (roles.has(p.role)) { const l = Number(p.permlevel ?? 0); if (Number(p["read"] ?? 0) || Number(p["write"] ?? 0)) read.add(l); if (Number(p["write"] ?? 0)) write.add(l); }
  return { read, write };
}
/** Report rows: drop rows whose link-named columns (customer, company, …) hold values outside the user's permissions. */
export function filterReportRows<T extends Record<string, unknown>>(rows: T[], user = currentUser()): T[] {
  const up = userPermissions(user); if (!up.size) return rows;
  const keys = [...up].map(([a, v]) => [a.toLowerCase().replace(/[^a-z0-9]+/g, "_"), v] as const);
  const ok = (r: T) => [...up].every(([a, v]) => !r["party"] || (r["party_type"] ? r["party_type"] !== a : !adapter.get(a, String(r["party"]))) || v.has(String(r["party"])));
  return rows.filter((r) => ok(r) && keys.every(([k, v]) => r[k] === undefined || r[k] === null || r[k] === "" || v.has(String(r[k]))));
}

/** Data-boundary guard (frappe has_permission + user permissions on create): throws PermissionError instead of trusting the UI. */
export class PermissionError extends Error { constructor(m: string) { super(m); this.name = "PermissionError"; } }
export function assertPerm(meta: DocTypeMeta, ptype: PType, doc?: Doc, user = currentUser()): void {
  if (!hasPerm(meta, ptype, doc, user)) throw new PermissionError(`No permission to ${ptype} ${meta.name}${doc?.name ? " " + doc.name : ""}`);
  if (doc && ptype === "create" && !userPermOk(meta, doc, user)) throw new PermissionError(`Not permitted: ${meta.name} values are outside your User Permissions`);
}
