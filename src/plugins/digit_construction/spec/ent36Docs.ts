/**
 * Sheet 16 missing documents (owner work list MISS-*): workflows for the BUILD documents that carry a state field but
 * had no workflow. Each workflow drives the document's own state field (no second status), roles are the DocType's
 * writers, and approvals refuse self-approval. Rules stay in the save hooks (domain/resourcing.ts, domain/finance.ts and
 * their Python twins), so a workflow button and a direct save are checked by the same rule. Digit WIP Adjustment's Post
 * transition is refused by wipRule while the revenue basis (P10 / DEC-304) is undefined, so it stays a draft.
 * Digit Job Snapshot and Digit Override Log are immutable records and have no workflow by design.
 */
import type { Workflow } from "../../types";

const R = { DIR: "Digit Director", PM: "Digit Project Manager", QS: "Digit QS", SE: "Digit Site Engineer", ACC: "Digit Accountant" };
type St = [state: string, allowEdit: string];
type Tr = [state: string, action: string, next: string, allowed: string, selfApproval?: 0 | 1];
const wf = (dt: string, field: string, states: St[], transitions: Tr[]): Workflow => ({
  name: `${dt} Workflow`, document_type: dt, workflow_state_field: field, is_active: 1,
  states: states.map(([state, allow_edit]) => ({ state, doc_status: "0", allow_edit })),
  transitions: transitions.map(([state, action, next_state, allowed, s]) => ({ state, action, next_state, allowed, allow_self_approval: s ?? 1 })),
});

export const ENT36_WORKFLOWS: Workflow[] = [
  wf("Digit Work Permit", "status", [["Requested", R.SE], ["Issued", R.PM], ["Suspended", R.PM], ["Closed", R.PM]],
    [["Requested", "Issue", "Issued", R.PM, 0], ["Issued", "Suspend", "Suspended", R.PM], ["Suspended", "Resume", "Issued", R.PM], ["Issued", "Close", "Closed", R.SE], ["Issued", "Close", "Closed", R.PM]]),
  wf("Digit Maintenance Order", "approval_status", [["Pending", R.SE], ["Approved", R.PM], ["Rejected", R.PM]],
    [["Pending", "Approve", "Approved", R.PM, 0], ["Pending", "Reject", "Rejected", R.PM], ["Rejected", "Resubmit", "Pending", R.SE]]),
  wf("Digit Site Induction", "approval_status", [["Pending", R.SE], ["Approved", R.PM], ["Rejected", R.PM]],
    [["Pending", "Approve", "Approved", R.PM, 0], ["Pending", "Reject", "Rejected", R.PM], ["Rejected", "Resubmit", "Pending", R.SE]]),
  wf("Digit Commissioning Test", "result", [["Pending", R.QS], ["Pass", R.DIR], ["Fail", R.DIR]],
    [["Pending", "Record Pass", "Pass", R.DIR, 0], ["Pending", "Record Fail", "Fail", R.DIR], ["Fail", "Retest", "Pending", R.QS]]),
  wf("Digit Handover Asset", "status", [["Draft", R.QS], ["In Progress", R.QS], ["Ready for Review", R.QS], ["Reviewed", R.DIR], ["Returned", R.QS]],
    [["Draft", "Start", "In Progress", R.QS], ["In Progress", "Submit for Review", "Ready for Review", R.QS], ["Ready for Review", "Review", "Reviewed", R.DIR, 0],
      ["Ready for Review", "Return", "Returned", R.DIR], ["Returned", "Resume", "In Progress", R.QS]]),
  wf("Digit WIP Adjustment", "posted_unposted_status", [["Unposted", R.ACC], ["Posted", R.ACC], ["Reversed", R.ACC]],
    [["Unposted", "Post", "Posted", R.ACC, 0], ["Posted", "Reverse", "Reversed", R.ACC]]),
];

export const ENT36_ACTION_AR: Record<string, string> = {
  Issue: "إصدار", Resume: "استئناف", Close: "إقفال", Approve: "اعتماد", Reject: "رفض", Resubmit: "إعادة الإرسال", "Record Pass": "تسجيل النجاح",
  "Record Fail": "تسجيل الإخفاق", Retest: "إعادة الاختبار", Start: "بدء", "Submit for Review": "إرسال للمراجعة", Review: "مراجعة واعتماد", Return: "إعادة",
  Post: "ترحيل", Reverse: "عكس", Suspend: "إيقاف",
};
/** The immutable records of sheet 16 (no workflow by design). */
export const ENT36_NO_WORKFLOW = ["Digit Job Snapshot", "Digit Override Log"] as const;
