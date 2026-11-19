/**
 * HR-owned workflow adapter. The DIGIT HR snapshot's Core ran plugin "Before Save" validations against the next workflow
 * state inside applyWorkflow (frappe apply_workflow saves the document first). The Final Core applyWorkflow does not, so
 * every DIGIT HR screen that moves a document through a workflow calls hrApplyWorkflow: the same Before Save rules
 * (declared in the HR manifest server_scripts, evaluated by the Core runtime) run on the next state first, then the
 * Core workflow engine performs the transition unchanged. Native-form workflow buttons use the Core engine directly
 * (see docs/digit-app-builder/HR_INTEGRATION_BLOCKERS.md).
 */
import { adapter } from "@/lib/adapter";
import { activeWorkflow, applyWorkflow, transitionsFor } from "@/lib/workflow";
import { currentUser } from "@/lib/session";
import { runDocEvent } from "@/plugins/runtime";

export function hrApplyWorkflow(dt: string, name: string, action: string, user = currentUser()): string[] {
  const w = activeWorkflow(dt); const doc = adapter.get(dt, name);
  if (w && doc) {
    const t = transitionsFor(w, doc, user).find((x) => x.action === action);
    if (t) { const pre = runDocEvent(dt, "before_save", { ...doc, [w.workflow_state_field]: t.next_state }); if (pre.errors.length) return pre.errors; }
  }
  return applyWorkflow(dt, name, action, user);
}
