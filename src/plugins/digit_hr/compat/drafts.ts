/**
 * HR-owned draft helpers adapting the DIGIT HR snapshot to the Final Core adapter contract.
 *
 * The snapshot's adapter applied dynamic DocField defaults (Now, Today, user, session company) inside adapter.insert and
 * listed unsaved first-save drafts. In the Final Core, adapter.insert applies literal defaults only (dynamic ones come
 * from documentApi.createDraft → sessionDefaults.newDocDefaults) and adapter.list hides unsaved `__islocal` drafts unless
 * asked. These helpers give HR's contextual drafts the same defaults as the Core "+ Add" path and let HR reopen its own
 * unfinished drafts instead of creating duplicates — using public Core APIs only.
 */
import { adapter, type Doc } from "@/lib/adapter";
import { cachedMeta, type DocTypeMeta } from "@/lib/catalog";
import { ADMIN, currentUser, filterReadable } from "@/lib/session";
import { newDocDefaults } from "@/lib/sessionDefaults";
import { saveDocument } from "@/lib/documentApi";

/** A new draft with the Core's resolved defaults, then the contextual HR fields (which win). */
export function insertHrDraft(meta: DocTypeMeta, fields: Record<string, unknown> = {}): Doc {
  return adapter.insert(meta, { ...(meta.issingle ? {} : newDocDefaults(meta)), ...fields });
}

/** Saved records plus unsaved first-save drafts, for "reopen the unfinished draft" lookups. */
export function listWithDrafts(doctype: string): Doc[] {
  return adapter.list(doctype, { includeLocal: true });
}

/** scope.scopedList including the caller's unsaved first-save drafts (same permission filter as the Core list). */
export function scopedListWithDrafts(doctype: string, user = currentUser()): Doc[] {
  const rows = listWithDrafts(doctype);
  if (user === ADMIN) return rows;
  const meta = cachedMeta(doctype); if (!meta) return [];
  return filterReadable(meta, rows, user);
}

/**
 * A saved record (not an open form): the draft is created like insertHrDraft, then saved through the Core first-save path
 * (documentApi.saveDocument → autoname, validation, Version), exactly as the native form's Save would. On failure the
 * draft is removed and the Core messages are thrown.
 */
export function saveHrRecord(meta: DocTypeMeta, fields: Record<string, unknown>): Doc {
  const draft = insertHrDraft(meta, fields);
  const r = saveDocument(meta, draft.name, fields);
  const saved = r.errors.length || r.cancelled ? undefined : adapter.get(meta.name, r.name);
  if (!saved) { if (adapter.get(meta.name, draft.name)) adapter.remove(meta.name, draft.name); throw new Error(r.errors.join(" · ") || `${meta.name} could not be saved`); }
  return saved;
}
