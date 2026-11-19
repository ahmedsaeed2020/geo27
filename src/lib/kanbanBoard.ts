/**
 * Desk Kanban board (frappe/public/js/frappe/views/kanban/kanban_board.bundle.js + kanban_view.js): columns come from a
 * Select field (or a saved Kanban Board record's columns), cards move between columns only through documentApi
 * saveDocument, so permissions, submitted-document locks and validation are the same as editing the form.
 * v16 additions: bulk move of selected cards (drag or "Move to") and windowed card rendering for large columns.
 */
import type { Doc } from "./adapter";
import { adapter } from "./adapter";
import type { DocField, DocTypeMeta } from "./catalog";
import { saveDocument } from "./documentApi";
import { hasPerm } from "./session";
import { activeWorkflow } from "./workflow";

export const NOT_SET = "";
/** Fields a board can group by: visible Select fields of the DocType (frappe kanban settings "Field Name" options). */
export function kanbanFields(meta: DocTypeMeta): DocField[] {
  return meta.fields.filter((f) => f.fieldtype === "Select" && f.fieldname && !Number((f as { hidden?: number }).hidden ?? 0) && String(f.options ?? "").trim().length > 0);
}
/** Default group field: a saved Kanban Board for the DocType, else `status`, else the first Select field. */
export function defaultKanbanField(meta: DocTypeMeta, boards: Doc[] = adapter.list("Kanban Board")): string | null {
  const fs = kanbanFields(meta); if (!fs.length) return null;
  const b = boards.find((x) => x["reference_doctype"] === meta.name && fs.some((f) => f.fieldname === x["field_name"]));
  if (b) return String(b["field_name"]);
  return (fs.find((f) => f.fieldname === "status") ?? fs[0]!).fieldname!;
}
export interface KanbanColumnDef { key: string; label: string; indicator?: string; docs: Doc[] }
/** Column order: a saved board's active columns, then the field's options, then any other stored values, then "Not set". */
export function kanbanColumns(meta: DocTypeMeta, field: string, docs: Doc[], boards: Doc[] = adapter.list("Kanban Board")): KanbanColumnDef[] {
  const f = meta.fields.find((x) => x.fieldname === field);
  const opts = String(f?.options ?? "").split("\n").map((s) => s.trim()).filter(Boolean);
  const board = boards.find((x) => x["reference_doctype"] === meta.name && x["field_name"] === field);
  const bcols = Array.isArray(board?.["columns"]) ? (board!["columns"] as Record<string, unknown>[]).filter((c) => (c["status"] ?? "Active") === "Active") : [];
  const order: { key: string; indicator?: string }[] = [];
  const push = (k: string, ind?: string) => { if (!order.some((o) => o.key === k)) order.push({ key: k, ...(ind ? { indicator: ind } : {}) }); };
  bcols.forEach((c) => push(String(c["column_name"] ?? ""), c["indicator"] ? String(c["indicator"]) : undefined));
  opts.forEach((o) => push(o));
  const by = new Map<string, Doc[]>();
  for (const d of docs) { const v = String(d[field] ?? "").trim(); by.set(v, [...(by.get(v) ?? []), d]); if (v) push(v); }
  const cols: KanbanColumnDef[] = order.filter((o) => o.key).map((o) => ({ key: o.key, label: o.key, ...(o.indicator ? { indicator: o.indicator.toLowerCase() } : {}), docs: by.get(o.key) ?? [] }));
  if ((by.get(NOT_SET) ?? []).length) cols.push({ key: NOT_SET, label: "Not set", docs: by.get(NOT_SET)! });
  return cols;
}
/** Why a card cannot move (null = it can): write permission, docstatus lock, read-only field, workflow-owned field. */
export function moveRefusal(meta: DocTypeMeta, field: string, doc: Doc, user?: string): string | null {
  const f = meta.fields.find((x) => x.fieldname === field);
  if (!f) return "Unknown field";
  if (!hasPerm(meta, "write", doc, user)) return `No permission to write ${meta.name}`;
  const ds = Number(doc.docstatus ?? 0);
  if (ds === 2) return "Cancelled documents cannot be changed";
  if (ds === 1 && !Number((f as { allow_on_submit?: number }).allow_on_submit ?? 0)) return "Submitted documents cannot be changed";
  if (Number((f as { read_only?: number }).read_only ?? 0)) return "This field is read only";
  const wf = activeWorkflow(meta.name);
  if (wf && wf.workflow_state_field === field) return "Use the workflow actions to change this state";
  return null;
}
/** Move cards to a column value through the normal save path; each card is moved or refused with its reason. */
export function moveCards(meta: DocTypeMeta, names: string[], field: string, value: string, user?: string): { moved: string[]; refused: { name: string; reason: string }[] } {
  const moved: string[] = []; const refused: { name: string; reason: string }[] = [];
  for (const n of names) {
    const d = adapter.get(meta.name, n);
    if (!d) { refused.push({ name: n, reason: "Not found" }); continue; }
    if (String(d[field] ?? "") === value) continue;
    const why = moveRefusal(meta, field, d, user);
    if (why) { refused.push({ name: n, reason: why }); continue; }
    const r = saveDocument(meta, n, { [field]: value }, user ? { user } : {});
    if (r.errors.length) refused.push({ name: n, reason: r.errors[0]! }); else moved.push(n);
  }
  return { moved, refused };
}
/** Windowed rendering of a column (v16 card virtualization): only the cards inside the scroll viewport (+ overscan) render. */
export function cardWindow(total: number, scrollTop: number, viewport: number, cardH: number, overscan = 4): { start: number; end: number; before: number; after: number } {
  const start = Math.max(0, Math.floor(scrollTop / cardH) - overscan);
  const end = Math.min(total, Math.ceil((scrollTop + viewport) / cardH) + overscan);
  return { start, end, before: start * cardH, after: Math.max(0, (total - end) * cardH) };
}
