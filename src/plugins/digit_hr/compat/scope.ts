/**
 * src/lib/scope.ts for DIGIT HR code: the Core helpers unchanged, with scopedList / scopedGet / assertScoped narrowed by
 * the DIGIT HR identity rule (compat/identity.ts). Explicit exports below shadow the star re-export.
 */
import type { Doc } from "@/lib/adapter";
import * as core from "@/lib/scope";
import { currentUser, PermissionError, type PType } from "@/lib/session";
import { hrIdentityAllows } from "./identity";

export * from "@/lib/scope";

/** A File attached to a record is readable only by who may read that record (frappe file.has_permission), so an
 *  attachment never opens another company's or employee's document. Unattached files keep the Core rule. */
function attachmentAllowed(dt: string, d: Doc, user: string): boolean {
  if (dt !== "File" || !d["attached_to_doctype"] || !d["attached_to_name"]) return true;
  try { const at = core.scopedGet(String(d["attached_to_doctype"]), String(d["attached_to_name"]), user); return !!at && hrIdentityAllows(String(d["attached_to_doctype"]), at, user, "read"); } catch { return false; }
}
export function scopedList(dt: string, user = currentUser()): Doc[] {
  return core.scopedList(dt, user).filter((d) => hrIdentityAllows(dt, d, user, "read") && attachmentAllowed(dt, d, user));
}
export function scopedGet(dt: string, name: string, user = currentUser()): Doc | undefined {
  const d = core.scopedGet(dt, name, user);
  return d && hrIdentityAllows(dt, d, user, "read") && attachmentAllowed(dt, d, user) ? d : undefined;
}
export function assertScoped(dt: string, ptype: PType, doc?: Doc, user = currentUser()): void {
  core.assertScoped(dt, ptype, doc, user);
  if (doc && !hrIdentityAllows(dt, doc, user, ptype)) throw new PermissionError(`No permission to ${ptype} ${dt}`);
}
