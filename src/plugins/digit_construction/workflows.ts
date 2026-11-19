/**
 * Frappe Workflow definitions of DIGIT Construction (exported as Workflow fixtures; run virtually by src/lib/workflow.ts).
 * Approval transitions set allow_self_approval: 0 (segregation of duties; Administrator exempt as in Frappe).
 */
import type { Workflow } from "../types";
import R19_SOURCE from "./r19/source.generated.json";
import { NEW_WORKFLOWS, EXTEND, SPEC_ACTION_AR } from "./spec/workflowSpec";
import { ENT36_ACTION_AR, ENT36_WORKFLOWS } from "./spec/ent36Docs";

const R = { DIR: "Digit Director", PM: "Digit Project Manager", QS: "Digit QS", EST: "Digit Estimator", PROC: "Digit Procurement Officer", SE: "Digit Site Engineer", ACC: "Digit Accountant" };
type St = [state: string, docstatus: 0 | 1 | 2, allowEdit: string];
type Tr = [state: string, action: string, next: string, allowed: string, selfApproval?: 0 | 1];
const wf = (dt: string, states: St[], transitions: Tr[]): Workflow => ({
  name: `${dt} Workflow`, document_type: dt, workflow_state_field: "workflow_state", is_active: 1,
  states: states.map(([state, d, allow_edit]) => ({ state, doc_status: String(d) as "0" | "1" | "2", allow_edit })),
  transitions: transitions.map(([state, action, next_state, allowed, s]) => ({ state, action, next_state, allowed, allow_self_approval: s ?? 1 })),
});

/** Workflows of the app before the R19 source merge. */
export const CONSTRUCTION_BASE_WORKFLOWS: Workflow[] = [
  wf("Digit Estimate Version", [["Draft", 0, R.EST], ["Submitted", 0, R.DIR], ["Approved", 1, R.DIR], ["Returned", 0, R.EST], ["Superseded", 1, R.DIR]],
    [["Draft", "Submit", "Submitted", R.EST], ["Submitted", "Approve", "Approved", R.DIR, 0], ["Submitted", "Return", "Returned", R.DIR], ["Returned", "Revise", "Draft", R.EST]]),
  wf("Digit BOQ", [["Draft", 0, R.QS], ["Approved", 1, R.PM], ["Superseded", 1, R.PM]], [["Draft", "Approve", "Approved", R.PM, 0]]),
  wf("Digit Client Contract", [["Draft", 0, R.QS], ["Active", 0, R.QS], ["Suspended", 0, R.DIR], ["Completed", 0, R.PM], ["Closed", 0, R.DIR]],
    [["Draft", "Activate", "Active", R.DIR, 0], ["Active", "Suspend", "Suspended", R.DIR], ["Suspended", "Resume", "Active", R.DIR], ["Active", "Complete", "Completed", R.PM], ["Completed", "Close", "Closed", R.DIR]]),
  wf("Digit Client Variation", [["Draft", 0, R.QS], ["Submitted", 0, R.PM], ["Approved", 1, R.DIR], ["Rejected", 0, R.DIR]],
    [["Draft", "Submit", "Submitted", R.QS], ["Submitted", "Approve", "Approved", R.DIR, 0], ["Submitted", "Reject", "Rejected", R.DIR]]),
  wf("Digit Client Claim", [["Draft", 0, R.QS], ["Submitted", 1, R.QS], ["Certified", 1, R.QS], ["Partly Certified", 1, R.QS], ["Rejected", 1, R.PM]],
    [["Draft", "Submit to Client", "Submitted", R.QS], ["Submitted", "Reject", "Rejected", R.PM]]),
  wf("Digit Client Certificate", [["Draft", 0, R.QS], ["Confirmed", 1, R.PM], ["Invoiced", 1, R.PM], ["Cancelled", 2, R.DIR]],
    [["Draft", "Confirm", "Confirmed", R.PM, 0], ["Confirmed", "Cancel", "Cancelled", R.DIR]]),
  wf("Digit Subcontractor Profile", [["Draft", 0, R.PROC], ["Under Review", 0, R.QS], ["Approved", 0, R.DIR], ["Suspended", 0, R.DIR], ["Rejected", 0, R.DIR]],
    [["Draft", "Submit for Review", "Under Review", R.PROC], ["Under Review", "Approve", "Approved", R.DIR, 0], ["Under Review", "Reject", "Rejected", R.DIR], ["Approved", "Suspend", "Suspended", R.DIR], ["Suspended", "Reinstate", "Approved", R.DIR, 0]]),
  wf("Digit Subcontract Work Order", [["Draft", 0, R.PROC], ["Active", 1, R.PM], ["Completed", 1, R.PM], ["Cancelled", 2, R.DIR]],
    [["Draft", "Activate", "Active", R.PM, 0], ["Active", "Complete", "Completed", R.PM], ["Active", "Cancel", "Cancelled", R.DIR]]),
  wf("Digit Measurement Book", [["Draft", 0, R.SE], ["Submitted", 0, R.QS], ["Certified", 1, R.QS], ["Returned", 0, R.SE]],
    [["Draft", "Submit", "Submitted", R.SE], ["Submitted", "Certify", "Certified", R.QS, 0], ["Submitted", "Return", "Returned", R.QS], ["Returned", "Resubmit", "Submitted", R.SE]]),
  wf("Digit Subcontractor Bill", [["Draft", 0, R.QS], ["Approved", 1, R.PM], ["Invoiced", 1, R.PM], ["Cancelled", 2, R.DIR]],
    [["Draft", "Approve", "Approved", R.PM, 0], ["Approved", "Cancel", "Cancelled", R.DIR]]),
  // DEC-099 / DEC-151: the Project Manager may approve up to the Finance cap (hooks.ts budgetCapErrors; empty cap = Director only)
  wf("Digit Project Cost Budget", [["Draft", 0, R.QS], ["Approved", 1, R.DIR], ["Superseded", 1, R.DIR]], [["Draft", "Approve", "Approved", R.DIR, 0], ["Draft", "Approve", "Approved", R.PM, 0]]),
  wf("Digit Budget Revision", [["Draft", 0, R.QS], ["Submitted", 0, R.PM], ["Approved", 1, R.DIR], ["Rejected", 0, R.DIR]],
    [["Draft", "Submit", "Submitted", R.QS], ["Submitted", "Approve", "Approved", R.DIR, 0], ["Submitted", "Reject", "Rejected", R.DIR]]),
  wf("Digit Budget Transfer", [["Draft", 0, R.QS], ["Approved", 1, R.PM], ["Rejected", 0, R.PM]], [["Draft", "Approve", "Approved", R.PM, 0], ["Draft", "Reject", "Rejected", R.PM]]),
  wf("Digit Cost Forecast Snapshot", [["Draft", 0, R.QS], ["Approved", 1, R.PM], ["Superseded", 1, R.PM]], [["Draft", "Approve", "Approved", R.PM, 0]]),
  wf("Digit Stage Planning", [["Draft", 0, R.SE], ["Submitted", 0, R.PM], ["Approved", 1, R.PM], ["Rejected", 0, R.PM]],
    [["Draft", "Submit", "Submitted", R.SE], ["Submitted", "Approve", "Approved", R.PM, 0], ["Submitted", "Reject", "Rejected", R.PM]]),
  wf("Digit WBS Version", [["Draft", 0, R.PM], ["Approved", 1, R.DIR], ["Superseded", 1, R.DIR]], [["Draft", "Approve", "Approved", R.DIR, 0]]),
  wf("Digit Progress Update", [["Draft", 0, R.SE], ["Submitted", 0, R.PM], ["Reviewed", 1, R.PM], ["Returned", 0, R.SE]],
    [["Draft", "Submit", "Submitted", R.SE], ["Submitted", "Review", "Reviewed", R.PM, 0], ["Submitted", "Return", "Returned", R.PM], ["Returned", "Resubmit", "Submitted", R.SE]]),
  wf("Digit Site Expense", [["Draft", 0, R.SE], ["Submitted", 0, R.ACC], ["Approved", 1, R.ACC], ["Rejected", 0, R.ACC]],
    [["Draft", "Submit", "Submitted", R.SE], ["Submitted", "Approve", "Approved", R.ACC, 0], ["Submitted", "Approve", "Approved", R.PM, 0], ["Submitted", "Reject", "Rejected", R.ACC]]),
  wf("Digit Retention Release Request", [["Draft", 0, R.QS], ["Pending Approval", 0, R.DIR], ["Approved", 1, R.DIR], ["Rejected", 0, R.DIR]],
    [["Draft", "Request Approval", "Pending Approval", R.QS], ["Pending Approval", "Approve", "Approved", R.DIR, 0], ["Pending Approval", "Reject", "Rejected", R.DIR]]),
  wf("Digit Subcontract Retention Release Request", [["Draft", 0, R.QS], ["Pending Approval", 0, R.DIR], ["Approved", 1, R.DIR], ["Rejected", 0, R.DIR]],
    [["Draft", "Request Approval", "Pending Approval", R.QS], ["Pending Approval", "Approve", "Approved", R.DIR, 0], ["Pending Approval", "Reject", "Rejected", R.DIR]]),
  wf("Digit Final Account", [["Draft", 0, R.QS], ["Under Negotiation", 0, R.QS], ["Agreed", 0, R.PM], ["Disputed", 0, R.QS], ["Approved", 1, R.DIR]],
    [["Draft", "Start Negotiation", "Under Negotiation", R.QS], ["Under Negotiation", "Mark Agreed", "Agreed", R.PM], ["Under Negotiation", "Mark Disputed", "Disputed", R.QS], ["Disputed", "Resume Negotiation", "Under Negotiation", R.QS], ["Agreed", "Approve", "Approved", R.DIR, 0]]),
];

/**
 * + the supplied source snapshot's workflows for the R19 imported DocTypes (Change Event, EOT, Commercial Claim, Back
 * Charge, Subcontract Change, Subcontract Final Account), copied verbatim from its Workflow fixture (r19/source.generated.json).
 */
export const CONSTRUCTION_PRE_SPEC_WORKFLOWS: Workflow[] = [...CONSTRUCTION_BASE_WORKFLOWS, ...(R19_SOURCE.workflows as unknown as Workflow[]).filter((w) => !CONSTRUCTION_BASE_WORKFLOWS.some((b) => b.name === w.name))];
/**
 * + the owner test list's workflow rows (spec/workflowSpec.ts): new workflows for DocTypes that had none, and states /
 * transitions appended to existing ones (an existing transition is never changed or removed).
 */
export const CONSTRUCTION_WORKFLOWS: Workflow[] = [
  ...CONSTRUCTION_PRE_SPEC_WORKFLOWS.map((w0) => {
    const ext = EXTEND.filter((e) => e.dt === w0.document_type);
    if (!ext.length) return w0;
    const w: Workflow = { ...w0, states: [...w0.states], transitions: [...w0.transitions] };
    for (const e of ext) {
      for (const [state, d, allow_edit] of e.states) if (!w.states.some((x) => x.state === state)) w.states.push({ state, doc_status: String(d) as "0" | "1" | "2", allow_edit });
      for (const [state, action, next_state, allowed, sa] of e.transitions)
        if (!w.transitions.some((t) => t.state === state && t.action === action && t.next_state === next_state && t.allowed === allowed)) w.transitions.push({ state, action, next_state, allowed, allow_self_approval: sa ?? 1 });
    }
    return w;
  }),
  ...NEW_WORKFLOWS.filter((n) => !CONSTRUCTION_PRE_SPEC_WORKFLOWS.some((w) => w.document_type === n.dt)).map((n) => wf(n.dt, n.states, n.transitions)),
  // sheet 16 BUILD documents (spec/ent36Docs.ts): only for DocTypes that still have no workflow
  ...ENT36_WORKFLOWS.filter((n) => !CONSTRUCTION_PRE_SPEC_WORKFLOWS.some((w) => w.document_type === n.document_type) && !NEW_WORKFLOWS.some((w) => w.dt === n.document_type)),
];

export const ACTION_AR: Record<string, string> = {
  ...ENT36_ACTION_AR, // sheet 16 actions; the entries below win where they name the same action
  Submit: "إرسال", Approve: "اعتماد", Return: "إعادة", Revise: "مراجعة", Activate: "تفعيل", Suspend: "إيقاف", Resume: "استئناف", Complete: "إكمال", Close: "إغلاق", Reject: "رفض",
  "Submit to Client": "تقديم للعميل", Confirm: "تأكيد", Cancel: "إلغاء", "Submit for Review": "إرسال للمراجعة", Reinstate: "إعادة تفعيل", Certify: "اعتماد فني", Resubmit: "إعادة الإرسال",
  Review: "مراجعة واعتماد", "Request Approval": "طلب الاعتماد", "Start Negotiation": "بدء التفاوض", "Mark Agreed": "تسجيل الاتفاق", "Mark Disputed": "تسجيل النزاع", "Resume Negotiation": "استئناف التفاوض",
  ...SPEC_ACTION_AR,
};

/** Actions that need a reason recorded on the document before the transition (validated by the app's hooks); pure data so read models can name the reason field without importing the workflow engine. */
export const REASON_FIELDS: Record<string, Record<string, string>> = {
  "Digit Estimate Version": { Return: "return_reason" }, "Digit Client Variation": { Reject: "decision_note" }, "Digit Measurement Book": { Return: "return_reason" },
  "Digit Stage Planning": { Reject: "reject_reason" }, "Digit Site Expense": { Reject: "reject_reason" }, "Digit Progress Update": { Return: "review_note" },
  // ported prototype rules: these actions refuse without their note, so the inbox asks for it
  "Digit Change Event": { Reject: "decision_note", Close: "decision_note", Return: "decision_note" }, "Digit PO Change": { Reject: "decision_note" }, "Digit Field Attendance": { Return: "return_reason" }, "Digit RFI": { Reopen: "reopen_reason" },
};
