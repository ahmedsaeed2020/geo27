/**
 * Cost verifier writes (BUD-EXT-02): allocation and exception review documents are created and submitted through the
 * shared document API (permissions, naming, controller hooks, posting.ts submit), never inserted directly. Kept apart
 * from domain/costVerify.ts so the report graph does not import the posting engine.
 */
import { adapter } from "@/lib/adapter";
import { cachedMeta } from "@/lib/catalog";
import { createDraft, saveDocument, submitDocument } from "@/lib/documentApi";
import { currentUser } from "@/lib/session";
import { EXCEPTION_LABEL, type ExceptionItem } from "./costVerify";

export interface ActionResult { ok: boolean; name?: string; errors: string[] }
/** Creates and submits one document through the shared document API (permissions, naming, hooks, posting). */
function createSubmitted(doctype: string, values: Record<string, unknown>, user = currentUser()): ActionResult {
  const meta = cachedMeta(doctype); if (!meta) return { ok: false, errors: [`${doctype}: metadata unavailable`] };
  const d = createDraft(meta); if (!d.doc) return { ok: false, errors: d.errors };
  const saved = saveDocument(meta, d.doc.name, values, { user });
  if (saved.errors.length) { if (adapter.get(doctype, d.doc.name)?.["__islocal"]) adapter.remove(doctype, d.doc.name); return { ok: false, errors: saved.errors }; }
  const errs = submitDocument(meta, saved.name, user);
  return errs.length ? { ok: false, name: saved.name, errors: errs } : { ok: true, name: saved.name, errors: [] };
}
/** Allocate one pending source row to a budget line (submitted Digit Cost Allocation). */
export const allocateSource = (project: string, source: { doctype: string; name: string; row: number }, budgetLine: string, reason: string, user = currentUser()) =>
  createSubmitted("Digit Cost Allocation", { project, source_doctype: source.doctype, source_name: source.name, source_row: source.row, budget_line: budgetLine, reason }, user);
/** Record a decision on an exception (submitted Digit Cost Exception Review). */
export const reviewException = (project: string, ex: Pick<ExceptionItem, "code" | "source_doctype" | "source_name" | "row">, resolution: "Accepted as Is" | "Correction Requested", note: string, user = currentUser()) =>
  createSubmitted("Digit Cost Exception Review", { project, exception: EXCEPTION_LABEL[ex.code], source_doctype: ex.source_doctype, source_name: ex.source_name, source_row: ex.row, resolution, note }, user);
