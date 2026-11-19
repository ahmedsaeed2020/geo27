/**
 * Deleted Document tombstones (frappe/model/delete_doc.py add_to_deleted_document): every delete stores the removed
 * record as a `Deleted Document` row. Insert-if-missing seeds read this index so a deleted demo record is never
 * re-created on the next load — Frappe never resurrects a deleted document.
 */
import { adapter } from "./adapter";

export const deletedKey = (doctype: string, name: string) => `${doctype}\u0000${name}`;

/** Keys (doctype + name) of deleted records that were not restored. Build once per seed pass. */
export function deletedIndex(): Set<string> {
  return new Set(
    adapter.list("Deleted Document")
      .filter((d) => !Number(d["restored"] ?? 0))
      .map((d) => deletedKey(String(d["deleted_doctype"] ?? ""), String(d["deleted_name"] ?? ""))),
  );
}
