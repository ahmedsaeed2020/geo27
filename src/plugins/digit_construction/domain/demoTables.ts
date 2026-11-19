/**
 * Keeps Construction demo records free of preview sample child rows.
 *
 * The shared Core child grid (src/components/form/ChildGrid.tsx) fills a child table whose value is *undefined* with two
 * generated sample rows the first time a form opens, and saves them. On demo invoices, receipts, customers and items that
 * would silently add timesheets, advances, payment schedules, credit limits or reorder levels to records the demo never
 * had. Frappe stores an empty table as [], so this module:
 *   1. sets every undefined Table / Table MultiSelect field of a demo record to [] (no sample fill is triggered), and
 *   2. removes rows that are byte-identical to the generator output (makeDoc(childMeta, 1|2), same name, no other keys),
 *      i.e. rows the preview wrote, never rows a user typed or edited.
 * Only records carrying the demo marker (__plugin = "digit_construction") are touched; Core is unchanged.
 */
import { adapter, makeDoc, type Doc } from "@/lib/adapter";
import { cachedMeta, ensureMetas, TABLE_TYPES, type DocTypeMeta } from "@/lib/catalog";

const PLUGIN = "digit_construction";
const VOLATILE = new Set(["name", "creation", "modified", "idx", "parent", "parentfield", "parenttype", "doctype", "docstatus", "owner"]);
type MetaOf = (doctype: string) => DocTypeMeta | undefined;

/** True only for a row the preview generator wrote: idx 1|2, generator name, every generated value unchanged, no extra keys. */
export function isPreviewSampleRow(child: DocTypeMeta, row: Doc): boolean {
  const idx = Number(row["idx"]);
  if (idx !== 1 && idx !== 2) return false;
  const exp = makeDoc(child, idx);
  if (row.name !== exp.name) return false;
  for (const [k, v] of Object.entries(exp)) if (!VOLATILE.has(k) && row[k] !== v) return false;
  for (const k of Object.keys(row)) if (!VOLATILE.has(k) && !(k in exp)) return false;
  return true;
}

const demoDoctypes = () => adapter.doctypes().filter((dt) => adapter.list(dt).some((d) => d["__plugin"] === PLUGIN));
const tableFields = (m: DocTypeMeta) => m.fields.filter((f) => TABLE_TYPES.has(f.fieldtype) && f.fieldname);

export type DemoTableRepair = { records: number; tablesSet: number; rowsRemoved: number; skipped: string[] };

/** Normalises demo records whose meta is available (metaOf); DocTypes without meta are listed in `skipped`, never guessed. */
export function normalizeDemoTables(metaOf: MetaOf = cachedMeta): DemoTableRepair {
  const out: DemoTableRepair = { records: 0, tablesSet: 0, rowsRemoved: 0, skipped: [] };
  for (const dt of demoDoctypes()) {
    const meta = metaOf(dt); if (!meta) { out.skipped.push(dt); continue; }
    const tables = tableFields(meta); if (!tables.length) continue;
    for (const doc of adapter.list(dt)) {
      if (doc["__plugin"] !== PLUGIN) continue;
      const patch: Record<string, unknown> = {};
      for (const f of tables) {
        const fn = f.fieldname!; const v = doc[fn];
        if (v === undefined || v === null) { patch[fn] = []; out.tablesSet++; continue; }
        const child = f.options ? metaOf(f.options) : undefined;
        if (!child || !Array.isArray(v) || !v.length) continue;
        const kept = (v as Doc[]).filter((r) => !isPreviewSampleRow(child, r));
        if (kept.length !== v.length) { out.rowsRemoved += v.length - kept.length; patch[fn] = kept.map((r, i) => ({ ...r, idx: i + 1 })); }
      }
      if (Object.keys(patch).length) { adapter.insertDocQuiet(dt, { ...doc, ...patch }); out.records++; }
    }
  }
  if (out.records) adapter.flush();
  return out;
}

/** Browser only: loads the demo DocTypes' meta (parents, then their child tables) and normalises; never throws into boot. */
export async function repairDemoTables(): Promise<DemoTableRepair | null> {
  if (typeof window === "undefined" || typeof fetch === "undefined") return null;
  try {
    const parents = demoDoctypes();
    await ensureMetas(parents);
    const children = [...new Set(parents.flatMap((dt) => { const m = cachedMeta(dt); return m ? tableFields(m).map((f) => String(f.options ?? "")).filter(Boolean) : []; }))];
    await ensureMetas(children);
    return normalizeDemoTables();
  } catch (e) {
    if (import.meta.env?.DEV) console.warn("[digit_construction] demo table repair skipped:", e);
    return null;
  }
}
