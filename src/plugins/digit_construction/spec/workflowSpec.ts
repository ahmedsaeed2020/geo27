/**
 * Workflow additions from the owner test list (sheet 6 "المسارات", WF-001 … WF-141). Pure data, imported by workflows.ts
 * (merge) and schema.ts (workflow_state options), so states, transitions and Select values never drift.
 *  - NEW_WORKFLOWS: DocTypes the specification puts under approval that had no workflow.
 *  - EXTEND: states / transitions added to an existing workflow; existing transitions are never changed or removed.
 * Approval transitions carry allow_self_approval 0 where the list says «الاعتماد الذاتي: ممنوع» (Frappe enforces it on
 * the server through the exported Workflow fixture; src/lib/workflow.ts enforces the same rule here).
 */
export const SPEC_ROLES = { QE: "Digit Quality Engineer", DC: "Digit Document Controller" } as const;
export const SPEC_ROLE_AR: Record<string, string> = { "Digit Quality Engineer": "مهندس الجودة", "Digit Document Controller": "مراقب الوثائق" };
/** New roles write only the documents whose workflow names them (every other app DocType gives them read). */
export const SPEC_ROLE_WRITES: Record<string, string[]> = {
  "Digit Defect": [SPEC_ROLES.QE], "Digit Inspection": [SPEC_ROLES.QE], "Digit NCR": [SPEC_ROLES.QE], "Digit Punch Item": [SPEC_ROLES.QE],
  "Digit Submittal": [SPEC_ROLES.DC], "Digit Transmittal": [SPEC_ROLES.DC], "Digit Drawing": [SPEC_ROLES.DC],
};

const R = { DIR: "Digit Director", PM: "Digit Project Manager", QS: "Digit QS", EST: "Digit Estimator", PROC: "Digit Procurement Officer", SE: "Digit Site Engineer", ACC: "Digit Accountant", SK: "Digit Store Keeper", QE: SPEC_ROLES.QE, DC: SPEC_ROLES.DC };
export type SpecState = [state: string, docstatus: 0 | 1 | 2, allowEdit: string];
export type SpecTr = [state: string, action: string, next: string, allowed: string, selfApproval?: 0 | 1];
export interface SpecWorkflow { dt: string; states: SpecState[]; transitions: SpecTr[] }

export const NEW_WORKFLOWS: SpecWorkflow[] = [
  // DEC-224: the requester submits, a project manager other than the requester approves; Issued is set when the store keeper's Stock Entry is submitted
  { dt: "Digit Issue Request", states: [["Draft", 0, R.SE], ["Pending Approval", 0, R.PM], ["Approved", 1, R.PM], ["Rejected", 0, R.PM], ["Issued", 1, R.SK]],
    transitions: [["Draft", "Submit", "Pending Approval", R.SE], ["Draft", "Submit", "Pending Approval", R.SK], ["Draft", "Submit", "Pending Approval", R.PM], ["Pending Approval", "Approve", "Approved", R.PM, 0],
      ["Pending Approval", "Reject", "Rejected", R.PM], ["Rejected", "Revise", "Draft", R.SE], ["Rejected", "Revise", "Draft", R.SK]] },
  { dt: "Digit Portfolio Scenario", states: [["Draft", 0, R.PM], ["Submitted", 0, R.DIR], ["Shared", 1, R.DIR], ["Rejected", 0, R.PM]],
    transitions: [["Draft", "Submit for Approval", "Submitted", R.PM], ["Submitted", "Approve and Share", "Shared", R.DIR, 0], ["Submitted", "Reject", "Rejected", R.DIR], ["Rejected", "Revise", "Draft", R.PM]] },
  { dt: "Digit Risk", states: [["Proposed", 0, R.PM], ["Open", 0, R.PM], ["Rejected", 0, R.PM], ["Active", 0, R.PM], ["Managed", 0, R.PM], ["Impacted", 0, R.PM]],
    transitions: [["Proposed", "Accept", "Open", R.PM], ["Proposed", "Reject", "Rejected", R.PM], ["Open", "Activate", "Active", R.PM], ["Active", "Mark Managed", "Managed", R.PM], ["Active", "Mark Impacted", "Impacted", R.PM]] },
  { dt: "Digit RFI", states: [["Draft", 0, R.SE], ["Open", 0, R.PM], ["Answered", 0, R.PM], ["Closed", 0, R.PM]],
    transitions: [["Draft", "Submit", "Open", R.SE], ["Draft", "Submit", "Open", R.PM], ["Draft", "Submit", "Open", R.QS], ["Open", "Answer", "Answered", R.PM], ["Answered", "Close", "Closed", R.PM], ["Answered", "Reopen", "Open", R.SE], ["Answered", "Reopen", "Open", R.PM]] },
  { dt: "Digit Submittal", states: [["Draft", 0, R.SE], ["Submitted", 0, R.DC], ["Under Review", 0, R.DC], ["Returned", 0, R.SE], ["Closed", 0, R.PM]],
    transitions: [["Draft", "Submit", "Submitted", R.SE], ["Submitted", "Send to Consultant", "Under Review", R.DC], ["Under Review", "Record Decision", "Returned", R.DC], ["Returned", "Resubmit as New Revision", "Draft", R.SE], ["Returned", "Close", "Closed", R.PM]] },
  { dt: "Digit Defect", states: [["Open", 0, R.SE], ["In Progress", 0, R.SE], ["Ready to Inspect", 0, R.QE], ["Closed", 0, R.QE], ["Disputed", 0, R.PM]],
    transitions: [["Open", "Start Repair", "In Progress", R.SE], ["In Progress", "Ready to Inspect", "Ready to Inspect", R.SE], ["Ready to Inspect", "Close", "Closed", R.QE, 0], ["Ready to Inspect", "Reject Repair", "In Progress", R.QE], ["Open", "Dispute", "Disputed", R.SE], ["Disputed", "Resolve", "Open", R.PM]] },
  { dt: "Digit Bid Leveling", states: [["Draft", 0, R.EST], ["Recommended", 0, R.DIR], ["Awarded", 0, R.DIR]],
    transitions: [["Draft", "Recommend", "Recommended", R.EST], ["Recommended", "Award", "Awarded", R.DIR, 0], ["Recommended", "Return", "Draft", R.DIR]] },
  { dt: "Digit PO Change", states: [["Draft", 0, R.PROC], ["Under Review", 0, R.PM], ["Approved", 0, R.PM], ["Rejected", 0, R.PROC]],
    transitions: [["Draft", "Submit for Review", "Under Review", R.PROC], ["Draft", "Submit for Review", "Under Review", R.QS], ["Under Review", "Approve", "Approved", R.PM, 0], ["Under Review", "Reject", "Rejected", R.PM], ["Rejected", "Revise", "Draft", R.PROC],
      // DEC-187: a change whose new order total is above the project manager's level is approved by the director
      ["Under Review", "Approve", "Approved", R.DIR, 0]] },
  { dt: "Digit Field Attendance", states: [["Draft", 0, R.SE], ["Reviewed", 0, R.PM], ["Approved", 1, R.PM]],
    transitions: [["Draft", "Review", "Reviewed", R.SE], ["Reviewed", "Approve", "Approved", R.PM, 0], ["Reviewed", "Return", "Draft", R.PM],
      // DEC-269: the project manager approves, the director is the alternate; the author never approves
      ["Reviewed", "Approve", "Approved", R.DIR, 0]] },
];

export const EXTEND: SpecWorkflow[] = [
  // WF-036 … WF-041: notice and negotiation stages next to the source assessment path
  { dt: "Digit Commercial Claim", states: [["Notice", 0, R.QS], ["Under Negotiation", 0, R.PM]],
    transitions: [["Draft", "Issue Notice", "Notice", R.QS], ["Notice", "Submit", "Submitted", R.QS], ["Submitted", "Start Negotiation", "Under Negotiation", R.PM], ["Under Negotiation", "Record Agreement", "Agreed", R.DIR, 0],
      ["Under Negotiation", "Record Dispute", "Disputed", R.DIR], ["Under Negotiation", "Reject", "Rejected", R.DIR], ["Disputed", "Resume Negotiation", "Under Negotiation", R.PM]] },
  // WF-043 … WF-045: the Director grants or rejects (the source lets the Project Manager do it too)
  { dt: "Digit EOT", states: [],
    transitions: [["Submitted", "Grant", "Granted", R.DIR, 0], ["Submitted", "Partially Grant", "Partially Granted", R.DIR, 0], ["Submitted", "Reject", "Rejected", R.DIR]] },
  // WF-046 … WF-051, WF-135 … WF-141: pricing stage and closing an unneeded event
  { dt: "Digit Change Event", states: [["Priced", 0, R.QS], ["Closed", 0, R.PM]],
    transitions: [["Draft", "Price", "Priced", R.QS], ["Priced", "Submit for Review", "Under Review", R.QS], ["Priced", "Revise", "Draft", R.QS], ["Under Review", "Return", "Priced", R.PM], ["Draft", "Close", "Closed", R.PM]] },
  // WF-052 … WF-054: review stage before approval
  { dt: "Digit Subcontract Change", states: [["Under Review", 0, R.PM]],
    transitions: [["Draft", "Submit for Review", "Under Review", R.QS], ["Under Review", "Approve", "Approved", R.PM, 0], ["Under Review", "Reject", "Rejected", R.PM]] },
];

export const SPEC_ACTION_AR: Record<string, string> = {
  "Submit for Approval": "إرسال للاعتماد", "Approve and Share": "اعتماد ومشاركة", Accept: "قبول", "Mark Managed": "تمت إدارتها", "Mark Impacted": "وقع الأثر", Answer: "الرد", Reopen: "إعادة فتح",
  "Send to Consultant": "إرسال للاستشاري", "Record Decision": "تسجيل القرار", "Resubmit as New Revision": "إعادة التقديم (مراجعة جديدة)", "Start Repair": "بدء الإصلاح", "Ready to Inspect": "جاهز للفحص",
  "Reject Repair": "رفض الإصلاح", Dispute: "اعتراض", Resolve: "حسم", Recommend: "توصية", Award: "ترسية", "Issue Notice": "تسجيل الإشعار", "Record Agreement": "تسجيل الاتفاق", "Record Dispute": "تسجيل النزاع",
  Grant: "منح كامل", "Partially Grant": "منح جزئي", Price: "تسعير",
};

/** workflow_state Select values each DocType needs for the states above. */
export function specStates(dt: string): string[] {
  return [...NEW_WORKFLOWS, ...EXTEND].filter((w) => w.dt === dt).flatMap((w) => w.states.map((s) => s[0]));
}
/** Arabic for workflow states the specification adds that have no Arabic label yet (display-only). */
export const SPEC_STATE_AR: Record<string, string> = { Priced: "مُسعَّر" };
