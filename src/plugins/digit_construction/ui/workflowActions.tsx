/** Workflow transition buttons for app documents (same engine as the Desk form: src/lib/workflow.ts), with reason prompts and self-approval explanations. */
import { notifyError, notifySaved } from "./notify";
import { adapter } from "@/lib/adapter";
import { activeWorkflow, applyWorkflow, selfApprovalBlocked, transitionsFor } from "@/lib/workflow";
import { ACTION_AR } from "../workflows";
import { workflowStateLabel } from "../../runtime";
import { BTN, useCx } from "./kit";

/** Actions needing a reason field set before the transition (validated by the controller hooks). */
const REASON: Record<string, Record<string, string>> = {
  "Digit Estimate Version": { Return: "return_reason" }, "Digit Client Variation": { Reject: "decision_note" }, "Digit Measurement Book": { Return: "return_reason" },
  "Digit Stage Planning": { Reject: "reject_reason" }, "Digit Site Expense": { Reject: "reject_reason" }, "Digit Progress Update": { Return: "review_note" },
};
export function WorkflowActions({ doctype, name, onDone }: { doctype: string; name: string; onDone?: () => void }) {
  const { t, ar } = useCx();
  const w = activeWorkflow(doctype); const doc = adapter.get(doctype, name);
  if (!w || !doc) return null;
  // one button per action → state (a workflow may list the same move once per allowed role)
  const ts = transitionsFor(w, doc).filter((x, i, all) => all.findIndex((y) => y.action === x.action && y.next_state === x.next_state) === i);
  const blocked = selfApprovalBlocked(w, doc).filter((x, i, all) => all.findIndex((y) => y.action === x.action) === i);
  const run = (action: string) => {
    const field = REASON[doctype]?.[action];
    if (field) {
      const reason = window.prompt(t(`Reason for "${action}"`, `سبب «${ACTION_AR[action] ?? action}»`), String(doc[field] ?? ""));
      if (reason === null) return;
      if (!reason.trim()) { notifyError(t("A reason is required", "السبب مطلوب")); return; }
      try { adapter.update(doctype, name, { [field]: reason.trim() }); } catch (e) { notifyError((e as Error).message); return; }
    }
    const errs = applyWorkflow(doctype, name, action);
    if (errs.length) { notifyError(t("Action not completed", "لم يكتمل الإجراء"), { description: errs.join("\n") }); return; }
    notifySaved(t(`${action} → ${adapter.get(doctype, name)?.["workflow_state"]}`, `${ACTION_AR[action] ?? action} ← ${workflowStateLabel(doctype, String(adapter.get(doctype, name)?.["workflow_state"] ?? ""), "ar")}`));
    onDone?.();
  };
  if (!ts.length && !blocked.length) return null;
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5" data-workflow-actions={doctype}>
      {ts.map((x) => <button key={x.action + x.next_state} type="button" onClick={() => run(x.action)} className={/Approve|Certify|Confirm|Activate|Review/.test(x.action) ? BTN.primary : /Reject|Cancel|Suspend|Disputed/.test(x.action) ? BTN.danger : BTN.secondary}>{ar ? ACTION_AR[x.action] ?? x.action : x.action}</button>)}
      {blocked.map((x) => <span key={`b-${x.action}`} className="text-xs text-muted-foreground" title={t("Segregation of duties: the document owner cannot take this action.", "فصل المهام: لا يمكن لمنشئ المستند تنفيذ هذا الإجراء.")}>{t(`${x.action}: another user must approve`, `${ACTION_AR[x.action] ?? x.action}: يجب أن يعتمد مستخدم آخر`)}</span>)}
    </span>
  );
}
