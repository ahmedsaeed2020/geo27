/**
 * Workflow engine (port of frappe/model/workflow.py: get_transitions, apply_workflow, validate_workflow).
 * Reads active workflows from enabled plugins + live Workflow records, so the same definition renders
 * actions, moves states, and changes docstatus through src/lib/posting.ts (submit/cancel).
 */
import { adapter, DocValidationError, type Doc } from "./adapter";
import { enabledPlugins, value, logEvent } from "@/plugins/runtime";
import type { Workflow } from "@/plugins/types";
import { submit, cancel } from "./posting";
import { currentUser, userRoles, ADMIN } from "./session";
import { cachedMeta } from "./catalog";
import { cachedRuntimeContract, documentCapability } from "./runtimeContract";

export function activeWorkflow(dt: string): Workflow | undefined {
  return enabledPlugins().flatMap((p) => p.workflows ?? []).find((w) => w.document_type === dt && (w.is_active ?? 1) === 1);
}
/** frappe.workflow.get_default_state: the first state whose doc_status matches the document's docstatus. */
export function defaultState(w: Workflow, docstatus = 0): string {
  return String(w.states.find((x) => Number(x.doc_status ?? 0) === docstatus)?.state ?? w.states[0]?.state ?? "");
}
export function currentState(w: Workflow, doc: Doc): string { return String(doc[w.workflow_state_field] || w.states[0]?.state || ""); }
const roleOk = (role: string, user: string) => user === ADMIN || !role || userRoles(user).includes(role);

export function transitionsFor(w: Workflow, doc: Doc, user = currentUser()) {
  const st = currentState(w, doc);
  // frappe has_approval_access: Administrator, allow_self_approval (default 1) or a user other than the owner
  const approvalOk = (t: Workflow["transitions"][number]) => user === ADMIN || (t.allow_self_approval ?? 1) !== 0 || String(doc["owner"] ?? "") !== user;
  return w.transitions.filter((t) => t.state === st && roleOk(t.allowed, user) && approvalOk(t) && (!t.condition || !!value(t.condition.replace(/frm\.doc\./g, "doc."), doc)));
}
/** allow_edit role of the current state: users without it see the form read-only (frappe workflow.js). */
export function canEditInState(w: Workflow, doc: Doc, user = currentUser()): boolean {
  const s = w.states.find((x) => x.state === currentState(w, doc));
  return !s || roleOk(s.allow_edit, user);
}

/** Transitions hidden from the user only by the self-approval rule (for an explicit message instead of a missing button). */
export function selfApprovalBlocked(w: Workflow, doc: Doc, user = currentUser()) {
  if (user === ADMIN || String(doc["owner"] ?? "") !== user) return [];
  const st = currentState(w, doc);
  return w.transitions.filter((t) => t.state === st && roleOk(t.allowed, user) && (t.allow_self_approval ?? 1) === 0);
}
export function applyWorkflow(dt: string, name: string, action: string, user = currentUser()): string[] {
  const w = activeWorkflow(dt); const doc = adapter.get(dt, name);
  if (!w || !doc) return ["Workflow not found"];
  const t = transitionsFor(w, doc, user).find((x) => x.action === action);
  if (!t && selfApprovalBlocked(w, doc, user).some((x) => x.action === action)) return [`Self-approval is not allowed: ${action} must be taken by a user other than the document owner.`];
  if (!t) return [`Not a valid Workflow Action: ${action}`];
  const next = w.states.find((s) => s.state === t.next_state);
  if (!next) return [`Workflow State ${t.next_state} not set`];
  const from = Number(doc.docstatus ?? 0), to = Number(next.doc_status ?? 0);
  if (from === 2 || (from === 1 && to === 0)) return ["Cannot change docstatus from " + from + " to " + to];
  // a transition that submits/cancels obeys the source-backed lifecycle gate (runtimeContract.ts), so a workflow can
  // never execute a server-only submit/cancel in the Virtual Core (checked once the runtime contract is loaded)
  const meta = cachedMeta(dt);
  if (meta && to !== from && (cachedRuntimeContract() || String(meta.source ?? "").startsWith("plugin:"))) {
    const cap = documentCapability(meta); const op = to === 1 ? "submit" : "cancel";
    if (cap[op] !== "VIRTUAL") return [`${dt}: ${op} requires the DIGIT server — ${cap.reasons[0] ?? ""}`.trim()];
  }
  // controller validation (adapter doc hooks) can refuse the state change; report it instead of throwing
  try { adapter.update(dt, name, { [w.workflow_state_field]: t.next_state, modified: new Date().toISOString(), modified_by: user }); }
  catch (e) { if (e instanceof DocValidationError) return e.errors; throw e; }
  let errs: string[] = [];
  if (from === 0 && to === 1) errs = submit(dt, name);
  else if (from === 1 && to === 2) errs = cancel(dt, name);
  if (errs.length) { adapter.update(dt, name, { [w.workflow_state_field]: t.state }); return errs; }
  adapter.insertDoc("Comment", { comment_type: "Workflow", reference_doctype: dt, reference_name: name, content: t.next_state, comment_email: user, owner: user });
  logEvent({ kind: "doc", doctype: dt, name, event: `workflow ${t.action} → ${t.next_state}` });
  return [];
}
