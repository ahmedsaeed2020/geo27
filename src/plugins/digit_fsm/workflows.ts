import { VISIT_DT } from "@/plugins/digit_fsm/schema";
/**
 * Frappe Workflow definitions of DIGIT FSM + ITM (kit 14 W01–W10; run virtually by src/lib/workflow.ts). Every state
 * stays docstatus 0: no ledger effect. Invariants that a state change must satisfy (no untested checks on submission,
 * reviewed passing retest before closure, cancellation reason, …) are enforced by the controller hooks in
 * domain/hooks.ts, so the native Actions menu and the app pages refuse the same transitions.
 */
import type { Workflow } from "../types";

const wf = (dt: string, states: string[], transitions: [string, string, string, string][]): Workflow => ({
  name: `${dt} Workflow`, document_type: dt, workflow_state_field: "workflow_state", is_active: 1,
  states: states.map((state) => ({ state, doc_status: "0" as const, allow_edit: "FSM Manager" })),
  transitions: transitions.map(([state, action, next_state, allowed]) => ({ state, action, next_state, allowed, allow_self_approval: 0 })),
});

export const FSM_WORKFLOWS: Workflow[] = [
  wf("FSM Service Agreement", ["Draft", "Active", "Suspended", "Expired", "Terminated"], [
    ["Draft", "Activate", "Active", "FSM Manager"], ["Active", "Suspend", "Suspended", "FSM Manager"], ["Suspended", "Resume", "Active", "FSM Manager"],
    ["Active", "Expire", "Expired", "FSM Manager"], ["Active", "Terminate", "Terminated", "FSM Manager"], ["Suspended", "Terminate", "Terminated", "FSM Manager"]]),
  wf("FSM Job", ["Draft", "Scheduled", "In Progress", "On Hold", "Completed", "Closed", "Cancelled"], [
    ["Draft", "Schedule", "Scheduled", "FSM Dispatcher"], ["Scheduled", "Start", "In Progress", "FSM Technician"], ["In Progress", "Hold", "On Hold", "FSM Dispatcher"],
    ["On Hold", "Resume Job", "In Progress", "FSM Dispatcher"], ["In Progress", "Complete", "Completed", "FSM Technician"], ["Completed", "Close", "Closed", "FSM Manager"],
    ["Draft", "Cancel Job", "Cancelled", "FSM Dispatcher"], ["Scheduled", "Cancel Job", "Cancelled", "FSM Dispatcher"]]),
  wf(VISIT_DT, ["Unscheduled", "Planned", "Dispatched", "On Site", "Completed", "Cancelled"], [
    ["Unscheduled", "Plan", "Planned", "FSM Dispatcher"], ["Planned", "Dispatch", "Dispatched", "FSM Dispatcher"], ["Dispatched", "Arrive", "On Site", "FSM Technician"],
    ["On Site", "Finish Visit", "Completed", "FSM Technician"], ["Unscheduled", "Cancel Visit", "Cancelled", "FSM Dispatcher"], ["Planned", "Cancel Visit", "Cancelled", "FSM Dispatcher"], ["Dispatched", "Cancel Visit", "Cancelled", "FSM Dispatcher"]]),
  wf("FSM Inspection Run", ["Draft", "In Progress", "Submitted for Review", "Reviewed", "Published"], [
    ["Draft", "Start Run", "In Progress", "FSM Technician"], ["In Progress", "Submit for Review", "Submitted for Review", "FSM Technician"],
    ["Submitted for Review", "Return", "In Progress", "FSM Reviewer"], ["Submitted for Review", "Approve Review", "Reviewed", "FSM Reviewer"], ["Reviewed", "Publish", "Published", "FSM Manager"]]),
  wf("FSM Deficiency", ["Open", "Quoted", "Approved for Repair", "Retest Pending", "Verified Closed", "Rejected", "Duplicate", "Disputed"], [
    ["Open", "Reject Finding", "Rejected", "FSM Reviewer"], ["Open", "Dispute", "Disputed", "FSM Estimator"], ["Quoted", "Dispute", "Disputed", "FSM Estimator"], ["Disputed", "Resolve Dispute", "Open", "FSM Reviewer"],
    ["Retest Pending", "Verify Close", "Verified Closed", "FSM Reviewer"], ["Verified Closed", "Reopen", "Open", "FSM Reviewer"], ["Rejected", "Reopen", "Open", "FSM Reviewer"]]),
];

export const ACTION_AR: Record<string, string> = {
  Activate: "تفعيل", Suspend: "إيقاف", Resume: "استئناف", Expire: "إنهاء المدة", Terminate: "إنهاء", Schedule: "جدولة", Start: "بدء", Hold: "إيقاف مؤقت", "Resume Job": "استئناف أمر العمل",
  Complete: "إكمال", Close: "إغلاق", "Cancel Job": "إلغاء أمر العمل", Plan: "تخطيط", Dispatch: "إرسال", Arrive: "الوصول", "Finish Visit": "إنهاء الزيارة", "Cancel Visit": "إلغاء الزيارة",
  "Start Run": "بدء الفحص", "Submit for Review": "تقديم للمراجعة", Return: "إعادة للفني", "Approve Review": "اعتماد المراجعة", Publish: "نشر", "Reject Finding": "رفض الملاحظة",
  Dispute: "اعتراض", "Resolve Dispute": "حسم الاعتراض", "Verify Close": "إغلاق بعد التحقق", Reopen: "إعادة فتح",
};
