/**
 * One scoped-read / scoped-write boundary for every virtual access surface (generic list, virtual REST/RPC,
 * plugin number cards and charts, Desk number cards and charts, global search, Insights site tables,
 * plugin Client Script buttons). It only composes src/lib/session.ts rules (role perms, if_owner,
 * User Permission incl. company) — it is not a second permission engine.
 * Unknown meta fails closed for non-admin users, matching api.ts. This is a DEV SIMULATION of Frappe's
 * has_permission / get_list permission query; the real server always enforces ACL.
 */
import { useEffect, useState } from "react";
import { adapter, type Doc } from "./adapter";
import { cachedMeta, ensureMetas, type DocTypeMeta } from "./catalog";
import { ADMIN, assertPerm, currentUser, filterReadable, hasPerm, PermissionError, permRules, userPermissions, userRoles, type PType } from "./session";

export { PermissionError };

/** Rows of `dt` the user may read (frappe.get_list with permission query). */
export function scopedList(dt: string, user = currentUser()): Doc[] {
  const rows = adapter.list(dt);
  if (user === ADMIN) return rows;
  const meta = cachedMeta(dt); if (!meta) return [];
  return filterReadable(meta, rows, user);
}
/** One record if readable (frappe.get_doc + has_permission), else undefined. */
export function scopedGet(dt: string, name: string, user = currentUser()): Doc | undefined {
  const d = adapter.get(dt, name); if (!d) return undefined;
  if (user === ADMIN) return d;
  const meta = cachedMeta(dt); if (!meta) return undefined;
  return hasPerm(meta, "read", d, user) ? d : undefined;
}
/** Throws PermissionError unless the user holds `ptype` on `dt` (and on `doc`, incl. User Permission values). */
export function assertScoped(dt: string, ptype: PType, doc?: Doc, user = currentUser()): void {
  if (user === ADMIN) return;
  const meta = cachedMeta(dt); if (!meta) throw new PermissionError(`No permission to ${ptype} ${dt} (meta not loaded)`);
  assertPerm(meta, ptype, doc, user);
}
/** Whether a DocType is readable at all (count / aggregate surfaces render "—" instead of a fake 0 when not). */
export function canReadType(dt: string, user = currentUser()): boolean {
  if (user === ADMIN) return true;
  const meta = cachedMeta(dt); return !!meta && hasPerm(meta, "read", undefined, user);
}

/**
 * Whether the user's read of `dt` is narrowed to a subset of records — every read rule is "only if creator" or a User
 * Permission applies to the DocType itself or one of its Link fields (same rules filterReadable applies). Count and
 * aggregate surfaces use it to label a figure "limited to records you can see" instead of presenting it as the total.
 * It inspects only the user's own permission rules, never the hidden rows, so it reveals nothing about them.
 */
export function readLimited(dt: string, user = currentUser()): boolean {
  const meta = cachedMeta(dt);
  return !!meta && readLimitedFor(meta, user);
}
/** readLimited for an already-resolved definition (relation counts pass the meta they evaluated). */
export function readLimitedFor(meta: DocTypeMeta, user = currentUser()): boolean {
  if (user === ADMIN || !hasPerm(meta, "read", undefined, user)) return false;
  const dt = meta.name;
  const roles = new Set(userRoles(user));
  const rules = permRules(meta).filter((p) => roles.has(p.role) && Number(p.permlevel ?? 0) === 0 && Number(p["read"] ?? 0) === 1);
  if (rules.length && rules.every((p) => Number(p.if_owner ?? 0) === 1)) return true;
  const up = userPermissions(user, dt); if (!up.size) return false;
  if (up.has(dt)) return true;
  return meta.fields.some((f) => f.fieldtype === "Link" && !!f.options && up.has(f.options) && !f["ignore_user_permissions"]);
}

/** Loads catalog meta for the given DocTypes so non-admin scoped reads can evaluate permissions; re-renders when ready. */
export function useScopeMetas(doctypes: string[]): number {
  const [v, setV] = useState(0);
  const key = [...new Set(doctypes)].sort().join("|");
  useEffect(() => {
    let live = true;
    const need = key ? key.split("|").filter((d) => !cachedMeta(d)) : [];
    if (!need.length) return;
    void ensureMetas(need).then(() => { if (live) setV((x) => x + 1); });
    return () => { live = false; };
  }, [key]);
  return v;
}
