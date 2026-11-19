/**
 * Change log of one document (Construction phase 4 C4-05) from the Framework `Version` records the adapter writes —
 * one entry per saved version (who, when) with every field changed old → new, child-row edits and added / removed
 * rows. Read-only; labels come from the DocType definition when it is loaded.
 */
import { adapter } from "./adapter";
import { cachedMeta } from "./catalog";

export interface FieldChange { field: string; label: string; from: string; to: string; table?: string | undefined; row?: number | undefined; /** a Select / state value (shown through the translation layer, stored value kept) */ select?: boolean | undefined }
export interface ChangeEntry { key: string; at: string; who: string; changes: FieldChange[]; added: number; removed: number }
const s = (v: unknown) => (v === null || v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : String(v));
const HIDDEN = /^(modified|modified_by|creation|owner|idx|docstatus_changed|__.*)$/;

export function changeLog(doctype: string, name: string): ChangeEntry[] {
  const meta = cachedMeta(doctype);
  const label = (f: string, table?: string) => {
    if (table) { const tf = meta?.fields.find((x) => x.fieldname === table); const cm = tf?.options ? cachedMeta(String(tf.options)) : undefined; return String(cm?.fields.find((x) => x.fieldname === f)?.label ?? f); }
    return String(meta?.fields.find((x) => x.fieldname === f)?.label ?? (f === "docstatus" ? "Document status" : f === "workflow_state" ? "Workflow State" : f));
  };
  const isSelect = (f: string) => ["workflow_state", "status", "docstatus"].includes(f) || meta?.fields.find((x) => x.fieldname === f)?.fieldtype === "Select";
  const out: ChangeEntry[] = [];
  for (const v of adapter.list("Version")) {
    if (v["ref_doctype"] !== doctype || v["docname"] !== name) continue;
    let data: { changed?: unknown[]; row_changed?: unknown[]; added?: unknown[]; removed?: unknown[] } = {};
    try { data = JSON.parse(s(v["data"])) as typeof data; } catch { continue; }
    const changes: FieldChange[] = [];
    for (const c of data.changed ?? []) if (Array.isArray(c) && c.length >= 3 && !HIDDEN.test(s(c[0]))) changes.push({ field: s(c[0]), label: label(s(c[0])), from: s(c[1]), to: s(c[2]), ...(isSelect(s(c[0])) ? { select: true } : {}) });
    for (const r of data.row_changed ?? []) {
      if (!Array.isArray(r) || r.length < 4 || !Array.isArray(r[3])) continue;
      for (const c of r[3] as unknown[]) if (Array.isArray(c) && c.length >= 3 && !HIDDEN.test(s(c[0]))) changes.push({ field: s(c[0]), label: label(s(c[0]), s(r[0])), from: s(c[1]), to: s(c[2]), table: s(r[0]), row: Number(r[1]) || undefined });
    }
    const added = Array.isArray(data.added) ? data.added.length : 0, removed = Array.isArray(data.removed) ? data.removed.length : 0;
    if (!changes.length && !added && !removed) continue;
    out.push({ key: v.name, at: s(v["creation"]), who: s(v["owner"]), changes, added, removed });
  }
  return out.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
}
