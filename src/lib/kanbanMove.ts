import { adapter, type Doc } from "./adapter";
import type { DocTypeMeta } from "./catalog";
import { currentUser, hasPerm } from "./session";
import { activeWorkflow, applyWorkflow, transitionsFor } from "./workflow";

/** Guard the existing native update path; never reinterpret posting state as a label. */
export function canMoveKanban(meta: DocTypeMeta, doc: Doc, field: string, target?: string): boolean {
  const f = meta.fields.find((x) => x.fieldname === field);
  if (field === "docstatus" || !f || f.read_only || !hasPerm(meta, "write", doc)) return false;
  const w = activeWorkflow(meta.name);
  if (w && w.workflow_state_field === field) return transitionsFor(w, doc).some((t) => !target || t.next_state === target);
  return !meta.is_submittable || Number(doc.docstatus ?? 0) === 0;
}
export function moveKanban(meta: DocTypeMeta, doc: Doc, field: string, target: string, details: Record<string, unknown> = {}): string | null {
  if (!canMoveKanban(meta, doc, field, target)) return "Not permitted";
  const w = activeWorkflow(meta.name);
  try {
    if (w && w.workflow_state_field === field) {
      const t = transitionsFor(w, doc).find((x) => x.next_state === target);
      if (!t) return "Not permitted";
      return applyWorkflow(meta.name, doc.name, t.action, currentUser()).join("; ") || null;
    }
    const f = meta.fields.find((x) => x.fieldname === field);
    if (f?.fieldtype === "Select" && !(f.options ?? "").split("\n").includes(target)) return "Unknown stage";
    adapter.update(meta.name, doc.name, { ...details, [field]: target });
    return adapter.get(meta.name, doc.name)?.[field] === target ? null : "Stage update failed";
  } catch (e) { return e instanceof Error ? e.message : String(e); }
}