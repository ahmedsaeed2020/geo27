/**
 * Child-table register (owner 2026-11-13 §2f): a child table (e.g. Asset Maintenance Task) has no records of its own —
 * its rows live inside parent documents. Its list shows every saved row across the parents that hold it in a Table
 * field, each row carrying its parent (name, DocType, field), so the row opens the document that owns it. Parents come
 * from the generated reverse-link index (a link inside a child row names its child table) plus the loaded metas;
 * rows are read only from parents the user may read (session.ts filterReadable). Nothing is stored.
 */
import { adapter, type Doc } from "@/lib/adapter";
import { cachedMeta } from "@/lib/catalog";
import { filterReadable } from "@/lib/session";

/** Every saved row of `child` across the readable records of its parents (parent metas must be loaded). */
export function childRows(child: string, parents: string[]): Doc[] {
  const rows: Doc[] = [];
  for (const p of parents) {
    const m = cachedMeta(p); if (!m) continue;
    const fields = m.fields.filter((f) => (f.fieldtype === "Table" || f.fieldtype === "Table MultiSelect") && f.options === child && f.fieldname);
    if (!fields.length) continue;
    for (const d of filterReadable(m, adapter.list(p))) for (const f of fields) {
      const list = Array.isArray(d[f.fieldname!]) ? (d[f.fieldname!] as Record<string, unknown>[]) : [];
      list.forEach((r, i) => rows.push({ ...r, doctype: child, name: String(r["name"] || `${d.name}-${f.fieldname}-${i + 1}`), parent: d.name, parenttype: p, parentfield: f.fieldname,
        idx: Number(r["idx"] ?? i + 1), docstatus: Number(d.docstatus ?? 0), modified: String(d.modified ?? d["creation"] ?? ""), creation: d["creation"], owner: d["owner"] }));
    }
  }
  return rows;
}
