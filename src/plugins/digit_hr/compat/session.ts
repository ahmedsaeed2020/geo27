/**
 * src/lib/session.ts for DIGIT HR code: the Core session unchanged, with hasPerm / filterReadable / assertPerm narrowed
 * by the DIGIT HR identity rule (compat/identity.ts). Explicit exports below shadow the star re-export.
 */
import type { Doc } from "@/lib/adapter";
import type { DocTypeMeta } from "@/lib/catalog";
import * as core from "@/lib/session";
import { hrIdentityAllows } from "./identity";

export * from "@/lib/session";

export function hasPerm(meta: DocTypeMeta, ptype: core.PType, doc?: Doc, user = core.currentUser()): boolean {
  return core.hasPerm(meta, ptype, doc, user) && (!doc || hrIdentityAllows(meta.name, doc, user, ptype));
}
export function filterReadable(meta: DocTypeMeta, rows: Doc[], user = core.currentUser()): Doc[] {
  return core.filterReadable(meta, rows, user).filter((d) => hrIdentityAllows(meta.name, d, user, "read"));
}
export function assertPerm(meta: DocTypeMeta, ptype: core.PType, doc?: Doc, user = core.currentUser()): void {
  core.assertPerm(meta, ptype, doc, user);
  if (doc && !hrIdentityAllows(meta.name, doc, user, ptype)) throw new core.PermissionError(`No permission to ${ptype} ${meta.name}`);
}
