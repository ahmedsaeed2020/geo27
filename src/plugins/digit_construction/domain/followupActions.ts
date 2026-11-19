/**
 * RPT-MGT-04 follow-up writes. A follow-up is a native ToDo on the decided document whose `digit_decision` names the
 * decision (Workflow Comment), created through the shared document API (ToDo permissions, naming, hooks). The decision
 * and the document are never edited. Kept apart from domain/followup.ts so the report graph imports no writer.
 */
import { adapter } from "@/lib/adapter";
import { cachedMeta } from "@/lib/catalog";
import { createDraft, saveDocument } from "@/lib/documentApi";
import { ADMIN, currentUser, hasPerm, userRoles } from "@/lib/session";
import { list } from "./data";

export interface FollowUpInput { allocated_to: string; description: string; date?: string | undefined; priority?: "Low" | "Medium" | "High" | undefined }
export interface FollowUpResult { ok: boolean; name?: string; errors: string[] }

/** Users who can receive a follow-up on a document: enabled desk users who may read it (frappe assign_to rule). */
export function assignableUsers(doctype: string, name: string): string[] {
  const meta = cachedMeta(doctype); const doc = adapter.get(doctype, name);
  if (!meta || !doc) return [];
  return adapter.list("User").filter((u) => Number(u["enabled"] ?? 1) !== 0 && u.name !== "Guest" && (u["user_type"] ?? "System User") === "System User" && hasPerm(meta, "read", doc, u.name)).map((u) => u.name).sort();
}

export function addFollowUp(decision: string, input: FollowUpInput, user = currentUser()): FollowUpResult {
  const c = adapter.get("Comment", decision);
  if (!c || c["comment_type"] !== "Workflow") return { ok: false, errors: ["Decision not found in the workflow log"] };
  const dt = String(c["reference_doctype"] ?? ""), name = String(c["reference_name"] ?? "");
  // the user must be able to read the decided document (session-scoped read)
  if (!list(dt, (d) => d.name === name).length) return { ok: false, errors: [`No permission to read ${dt} ${name}`] };
  const description = input.description.trim();
  if (!description) return { ok: false, errors: ["Describe the follow-up action"] };
  if (!input.allocated_to) return { ok: false, errors: ["Choose who follows up"] };
  if (!assignableUsers(dt, name).includes(input.allocated_to)) return { ok: false, errors: [`${input.allocated_to} cannot read ${dt} ${name}, so the follow-up cannot be assigned to them`] };
  if (input.date && !/^\d{4}-\d{2}-\d{2}$/.test(input.date)) return { ok: false, errors: ["The due date is not a valid date"] };
  const dup = adapter.list("ToDo").some((t) => t["digit_decision"] === decision && (t["status"] ?? "Open") === "Open" && t["allocated_to"] === input.allocated_to && String(t["description"] ?? "").trim() === description);
  if (dup) return { ok: false, errors: ["The same open follow-up already exists for this user"] };
  const meta = cachedMeta("ToDo"); if (!meta) return { ok: false, errors: ["ToDo: metadata unavailable"] };
  if (!hasPerm(meta, "create", undefined, user)) return { ok: false, errors: ["No permission to create assignments"] };
  const d = createDraft(meta); if (!d.doc) return { ok: false, errors: d.errors };
  const saved = saveDocument(meta, d.doc.name, {
    status: "Open", priority: input.priority ?? "Medium", date: input.date || "", allocated_to: input.allocated_to, description,
    reference_type: dt, reference_name: name, assigned_by: user, digit_decision: decision,
  }, { user });
  if (saved.errors.length) { if (adapter.get("ToDo", d.doc.name)?.["__islocal"]) adapter.remove("ToDo", d.doc.name); return { ok: false, errors: saved.errors }; }
  return { ok: true, name: saved.name, errors: [] };
}

/** Closes a follow-up: its assignee, its assigner or a System Manager (frappe ToDo rule). */
export function closeFollowUp(todo: string, user = currentUser()): string[] {
  const t = adapter.get("ToDo", todo);
  if (!t || !t["digit_decision"]) return ["Follow-up not found"];
  if ((t["status"] ?? "Open") !== "Open") return ["This follow-up is already closed"];
  const may = user === ADMIN || userRoles(user).includes("System Manager") || t["allocated_to"] === user || t["assigned_by"] === user;
  if (!may) return ["Only the assignee or the person who assigned it can close this follow-up"];
  adapter.update("ToDo", todo, { status: "Closed", modified: new Date().toISOString(), modified_by: user });
  return [];
}
