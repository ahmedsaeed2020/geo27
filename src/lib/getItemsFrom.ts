/**
 * "Get Items From" (owner OWN-52 / native erpnext.utils.map_current_doc): pulls items, party and header values from one
 * or more submitted source documents into the current draft — the direction the native button works (source → this
 * document), with the source's own field_map and the remaining (not yet billed / delivered / received / ordered) qty.
 * Sources come from the generated form_actions.json "Get Items From" group; candidates are permission-filtered.
 */
import { adapter, type Doc } from "@/lib/adapter";
import { TABLE_TYPES, type DocTypeMeta } from "@/lib/catalog";
import { mapDoc, type FormAction } from "@/lib/engines";
import { filterReadable } from "@/lib/session";

export interface GifSource { label: string; source: string; fieldMap?: Record<string, string> | undefined }
/** Source DocTypes offered for a target: the group's actions whose label is a DocType with a native mapper target. */
export function gifSources(acts: FormAction[] | undefined, target: string, isDocType: (dt: string) => boolean): GifSource[] {
  return (acts ?? []).filter((a) => a.group === "Get Items From" && a.target && a.target.toLowerCase() === target.toLowerCase() && isDocType(a.label))
    .map((a) => ({ label: a.label, source: a.label, fieldMap: (a as { field_map?: Record<string, string> }).field_map }));
}

const SELLING = new Set(["Quotation", "Sales Order", "Delivery Note", "Sales Invoice", "Maintenance Schedule", "Maintenance Visit"]);
const BUYING = new Set(["Material Request", "Request for Quotation", "Supplier Quotation", "Purchase Order", "Purchase Receipt", "Purchase Invoice", "Subcontracting Order", "Subcontracting Receipt"]);
const num = (v: unknown) => Number(v ?? 0) || 0;
/** Share already done on the source for this target (per_billed / per_delivered / per_received / per_ordered, 0–100). */
export function percentDone(src: Doc, target: string): number {
  if (/Invoice$/.test(target)) return num(src["per_billed"]);
  if (target === "Delivery Note") return num(src["per_delivered"]);
  if (target === "Purchase Receipt" || target === "Stock Entry" || target === "Subcontracting Receipt") return num(src["per_received"] ?? src["per_transferred"]);
  if (target === "Purchase Order" || target === "Sales Order" || target === "Supplier Quotation") return num(src["per_ordered"]);
  return 0;
}
/** Submitted, open, same company and same party as the draft (when set), readable by the user. */
export function gifCandidates(srcMeta: DocTypeMeta, target: DocTypeMeta, draft: Doc, user?: string): Doc[] {
  const company = String(draft["company"] ?? "");
  const party: [string | null, unknown] = SELLING.has(target.name) ? ["customer", draft["customer"] ?? draft["party_name"]] : BUYING.has(target.name) ? ["supplier", draft["supplier"]] : [null, null];
  const rows = filterReadable(srcMeta, adapter.list(srcMeta.name), user).filter((d) => Number(d.docstatus ?? 0) === 1);
  return rows.filter((d) => (!company || !d["company"] || d["company"] === company)
    && (!party[0] || !party[1] || !(party[0] in d) || d[party[0]] === party[1] || (srcMeta.name === "Quotation" && d["party_name"] === party[1]))
    && !["Closed", "Completed", "Cancelled", "Lost", "Ordered", "Stopped", "Expired"].includes(String(d["status"] ?? ""))
    && percentDone(d, target.name) < 100)
    .sort((a, b) => String(b["transaction_date"] ?? b["posting_date"] ?? b["modified"] ?? "").localeCompare(String(a["transaction_date"] ?? a["posting_date"] ?? a["modified"] ?? "")));
}

/**
 * The patch for the draft: header values the draft does not have yet (party, currency, price list, taxes template …)
 * and the mapped rows appended to each table (existing empty rows dropped), renumbered. Taxes are copied only when the
 * draft has none, as map_current_doc does.
 */
export function gifPatch(draft: Doc, target: DocTypeMeta, picks: { meta: DocTypeMeta; doc: Doc; fieldMap?: Record<string, string> | undefined }[], childMetas: Record<string, DocTypeMeta>): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  const tables = target.fields.filter((f) => TABLE_TYPES.has(f.fieldtype) && f.fieldname).map((f) => f.fieldname!);
  const filled = (v: unknown) => v !== undefined && v !== null && v !== "" && !(Array.isArray(v) && v.length === 0);
  const rowsOf = (k: string) => (Array.isArray(patch[k]) ? (patch[k] as Record<string, unknown>[]) : Array.isArray(draft[k]) ? (draft[k] as Record<string, unknown>[]).filter((r) => Object.entries(r).some(([rk, rv]) => !["idx", "name", "doctype", "parent", "parentfield", "parenttype", "__islocal", "__unsaved"].includes(rk) && filled(rv))) : []);
  for (const p of picks) {
    const mapped = mapDoc(p.meta, p.doc, target, childMetas, p.fieldMap);
    for (const [k, v] of Object.entries(mapped)) {
      if (k.startsWith("__") || k === "name" || k === "naming_series" || k === "posting_date" || k === "transaction_date") continue;
      if (tables.includes(k)) {
        const add = (v as Record<string, unknown>[]) ?? [];
        if (k === "taxes" || k === "sales_team" || k === "payment_schedule") { if (!rowsOf(k).length && add.length) patch[k] = add; continue; }
        patch[k] = [...rowsOf(k), ...add];
        continue;
      }
      if (!filled(draft[k]) && !filled(patch[k]) && filled(v)) patch[k] = v;
    }
  }
  for (const k of tables) if (Array.isArray(patch[k])) patch[k] = (patch[k] as Record<string, unknown>[]).map((r, i) => ({ ...r, idx: i + 1 }));
  return patch;
}
