/**
 * NB-3 service-case journeys on DIGIT HR Service Case: "Assign to me" (sets assigned_to, then the native Assign workflow
 * transition) and "Resolve with notes" (writes resolution_notes, then the native Resolve transition). Both re-check
 * scope, roll the field back if the workflow refuses, and read the record back. Synthetic preview, not Frappe ACL.
 */
import { adapter, type Doc } from "@/lib/adapter";
import { assertScoped, scopedGet } from "@/plugins/digit_hr/compat/scope";
import { currentUser } from "@/plugins/digit_hr/compat/session";
import { activeWorkflow, transitionsFor } from "@/lib/workflow";
import { hrApplyWorkflow } from "@/plugins/digit_hr/compat/workflow";

const DT = "DIGIT HR Service Case";
const s = (v: unknown) => (v == null ? "" : String(v));

function load(name: string): Doc {
  const doc = scopedGet(DT, name);
  if (!doc) throw new Error("Case not found or not permitted");
  assertScoped(DT, "write", doc);
  return doc;
}
function transition(doc: Doc, action: string, user: string) {
  const w = activeWorkflow(DT);
  if (!w || !transitionsFor(w, doc, user).some((t) => t.action === action)) throw new Error(`“${action}” is not available to you at this stage`);
}

/** Whether "Assign to me" is offered: an Open case the user may write with an Assign transition available. */
export function mayAssignToMe(doc: Doc, user = currentUser()): boolean {
  try { assertScoped(DT, "write", doc); transition(doc, "Assign", user); return s(doc["case_status"]) === "Open"; } catch { return false; }
}

export function assignCaseToMe(name: string, user = currentUser()): Doc {
  const doc = load(name);
  if (s(doc["case_status"]) !== "Open") throw new Error("Only open cases can be assigned");
  transition(doc, "Assign", user);
  const prev = doc["assigned_to"] ?? "";
  adapter.update(DT, name, { assigned_to: user });
  const errors = hrApplyWorkflow(DT, name, "Assign", user);
  if (errors.length) { adapter.update(DT, name, { assigned_to: prev }); throw new Error(errors.join(" · ")); }
  const back = scopedGet(DT, name);
  if (!back || s(back["case_status"]) !== "Assigned" || s(back["assigned_to"]) !== user) throw new Error("Record could not be read back");
  return back;
}

/** Whether the inline resolution form is offered: an In Progress case the user may write with Resolve available. */
export function mayResolve(doc: Doc, user = currentUser()): boolean {
  try { assertScoped(DT, "write", doc); transition(doc, "Resolve", user); return s(doc["case_status"]) === "In Progress"; } catch { return false; }
}

export function resolveCaseWithNotes(name: string, notes: string, user = currentUser()): Doc {
  const text = notes.trim();
  if (!text) throw new Error("Resolution Notes are required to resolve a case");
  const doc = load(name);
  if (s(doc["case_status"]) !== "In Progress") throw new Error("Only cases in progress can be resolved");
  transition(doc, "Resolve", user);
  const prev = doc["resolution_notes"] ?? "";
  adapter.update(DT, name, { resolution_notes: text });
  const errors = hrApplyWorkflow(DT, name, "Resolve", user);
  if (errors.length) { adapter.update(DT, name, { resolution_notes: prev }); throw new Error(errors.join(" · ")); }
  const back = scopedGet(DT, name);
  if (!back || s(back["case_status"]) !== "Resolved" || s(back["resolution_notes"]) !== text) throw new Error("Record could not be read back");
  return back;
}
