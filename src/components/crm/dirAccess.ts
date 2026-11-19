import type { Doc } from "@/lib/adapter";
import type { DocTypeMeta } from "@/lib/catalog";
import { assertPerm, filterReadable, type PType } from "@/lib/session";

export function directoryRows(meta: DocTypeMeta, rows: Doc[], user: string) {
  return filterReadable(meta, rows, user);
}
export function assertDirectoryAction(meta: DocTypeMeta, rows: Doc[], action: PType, user: string) {
  for (const row of rows) {
    assertPerm(meta, "read", row, user);
    assertPerm(meta, action, row, user);
  }
}