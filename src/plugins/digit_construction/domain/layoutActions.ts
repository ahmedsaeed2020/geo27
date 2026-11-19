/**
 * FIN-05 writes: personal / role / company dashboard layouts and personal saved report views, created, updated and
 * deleted only through the shared document API (permission rules incl. owner-only, naming, validation hooks).
 */
import { adapter } from "@/lib/adapter";
import { cachedMeta } from "@/lib/catalog";
import { createDraft, deleteDraft, saveDocument, updateDocument } from "@/lib/documentApi";
import { currentUser } from "@/lib/session";
import { layoutRecordFor, type LayoutItem, type LayoutLevel, type ViewState } from "./layouts";

export interface ActionResult { ok: boolean; name?: string; errors: string[] }
const LAYOUT = "Digit Dashboard Layout", VIEW = "Digit Saved View";
function create(doctype: string, values: Record<string, unknown>, user: string): ActionResult {
  const meta = cachedMeta(doctype); if (!meta) return { ok: false, errors: [`${doctype}: metadata unavailable`] };
  const d = createDraft(meta); if (!d.doc) return { ok: false, errors: d.errors };
  const saved = saveDocument(meta, d.doc.name, values, { user });
  if (saved.errors.length) { if (adapter.get(doctype, d.doc.name)?.["__islocal"]) adapter.remove(doctype, d.doc.name); return { ok: false, errors: saved.errors }; }
  return { ok: true, name: saved.name, errors: [] };
}
const itemRows = (items: LayoutItem[]) => items.map((i, k) => ({ idx: k + 1, item_type: i.type, item_id: i.id, hidden: i.hidden ? 1 : 0 }));
const targetField = (level: Exclude<LayoutLevel, "System">) => (level === "User" ? "for_user" : level === "Role" ? "for_role" : "for_company");

/** Save the layout of one level: personal (target = the user), a role default or a company default. Updates the existing record of that target. */
export function saveLayout(dashboard: string, level: Exclude<LayoutLevel, "System">, target: string, items: LayoutItem[], user = currentUser()): ActionResult {
  if (level === "User" && target !== user) return { ok: false, errors: ["A personal layout can only be saved for yourself"] };
  if (!target) return { ok: false, errors: [`${level} is required`] };
  const existing = layoutRecordFor(dashboard, level, target);
  const values = { dashboard, level, [targetField(level)]: target, items: itemRows(items) };
  if (existing) {
    const meta = cachedMeta(LAYOUT); if (!meta) return { ok: false, errors: [`${LAYOUT}: metadata unavailable`] };
    const errs = updateDocument(meta, existing.name, values, user);
    return errs.length ? { ok: false, name: existing.name, errors: errs } : { ok: true, name: existing.name, errors: [] };
  }
  return create(LAYOUT, values, user);
}
/** Remove the layout of one level (Reset): the next level down applies again. */
export function resetLayout(dashboard: string, level: Exclude<LayoutLevel, "System">, target: string, user = currentUser()): ActionResult {
  const existing = layoutRecordFor(dashboard, level, target);
  if (!existing) return { ok: true, errors: [] };
  const meta = cachedMeta(LAYOUT); if (!meta) return { ok: false, errors: [`${LAYOUT}: metadata unavailable`] };
  const errs = deleteDraft(meta, existing.name, user);
  return errs.length ? { ok: false, name: existing.name, errors: errs } : { ok: true, name: existing.name, errors: [] };
}

/** Save the current report filters as a personal view (new), or update an existing view of the user. */
export function saveView(report: string, viewName: string, state: ViewState, existing?: string, user = currentUser()): ActionResult {
  const values = { report, view_name: viewName, status: "Active", filters_json: JSON.stringify(state) };
  if (existing) {
    const meta = cachedMeta(VIEW); if (!meta) return { ok: false, errors: [`${VIEW}: metadata unavailable`] };
    const errs = updateDocument(meta, existing, values, user);
    return errs.length ? { ok: false, name: existing, errors: errs } : { ok: true, name: existing, errors: [] };
  }
  return create(VIEW, values, user);
}
export function archiveView(name: string, user = currentUser()): ActionResult {
  const meta = cachedMeta(VIEW); if (!meta) return { ok: false, errors: [`${VIEW}: metadata unavailable`] };
  const errs = updateDocument(meta, name, { status: "Archived" }, user);
  return errs.length ? { ok: false, name, errors: errs } : { ok: true, name, errors: [] };
}
export function deleteView(name: string, user = currentUser()): ActionResult {
  const meta = cachedMeta(VIEW); if (!meta) return { ok: false, errors: [`${VIEW}: metadata unavailable`] };
  const errs = deleteDraft(meta, name, user);
  return errs.length ? { ok: false, name, errors: errs } : { ok: true, name, errors: [] };
}
