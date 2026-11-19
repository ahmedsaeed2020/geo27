/**
 * List bulk operations — port of frappe/desk/doctype/bulk_update/bulk_update.py submit_cancel_or_update_docs /
 * _bulk_action over the shared document API (documentApi.ts submit/cancel/save/update), so a bulk action runs the
 * exact same lifecycle, permission and posting rules as the form. Each record succeeds or fails on its own.
 */
import { adapter } from "./adapter";
import type { DocTypeMeta } from "./catalog";
import { TABLE_TYPES } from "./catalog";
import { cancelDocument, saveDocument, submitDocument, updateDocument } from "./documentApi";
import { currentUser } from "./session";

export const BULK_LIMIT = 500;
export const BULK_LIMIT_MESSAGE = "Bulk operations only support up to 500 documents.";
export interface BulkResult { done: string[]; failed: { name: string; errors: string[] }[]; error?: string }

/** action submit: drafts only; cancel: submitted only — anything else is reported as failed, as in _bulk_action. */
export function bulkSubmitCancel(meta: DocTypeMeta, names: string[], action: "submit" | "cancel", user = currentUser()): BulkResult {
  if (names.length > BULK_LIMIT) return { done: [], failed: [], error: BULK_LIMIT_MESSAGE };
  const done: string[] = []; const failed: BulkResult["failed"] = [];
  for (const n of names) {
    const d = adapter.get(meta.name, n);
    const ds = Number(d?.docstatus ?? 0);
    let errs: string[];
    if (!d) errs = [`${meta.name} ${n} not found`];
    else if (action === "submit" && ds === 0) errs = submitDocument(meta, n, user);
    else if (action === "cancel" && ds === 1) errs = cancelDocument(meta, n, user);
    else errs = [];
    if (d && errs.length === 0 && ((action === "submit" && ds === 0) || (action === "cancel" && ds === 1))) done.push(n);
    else failed.push({ name: n, errors: errs });
  }
  return { done, failed };
}

/**
 * action update: regular fields via doc.update(data); `childUpdates` (child DocType → field → value) set the field on
 * every row of each table holding that child DocType. Drafts go through saveDocument (full save); submitted records
 * through updateDocument (allow_on_submit only); cancelled records fail.
 */
export function bulkUpdate(meta: DocTypeMeta, names: string[], data: Record<string, unknown>, childUpdates: Record<string, Record<string, unknown>> = {}, user = currentUser()): BulkResult {
  if (names.length > BULK_LIMIT) return { done: [], failed: [], error: BULK_LIMIT_MESSAGE };
  const done: string[] = []; const failed: BulkResult["failed"] = [];
  const tables = meta.fields.filter((f) => TABLE_TYPES.has(f.fieldtype) && f.fieldname && f.options && childUpdates[f.options]);
  for (const n of names) {
    const d = adapter.get(meta.name, n);
    if (!d || Number(d.docstatus ?? 0) === 2) { failed.push({ name: n, errors: d ? [] : [`${meta.name} ${n} not found`] }); continue; }
    const patch: Record<string, unknown> = { ...data };
    for (const t of tables) {
      const rows = Array.isArray(d[t.fieldname!]) ? (d[t.fieldname!] as Record<string, unknown>[]) : [];
      patch[t.fieldname!] = rows.map((r) => ({ ...r, ...childUpdates[t.options!] }));
    }
    const errs = Number(d.docstatus ?? 0) === 1 ? updateDocument(meta, n, patch, user) : saveDocument(meta, n, { ...d, ...patch }, { user }).errors;
    if (errs.length) failed.push({ name: n, errors: errs }); else done.push(n);
  }
  return { done, failed };
}
