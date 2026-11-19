/**
 * Round-2 controller rules as adapter doc hooks (registered once from ../boot.ts; inert while DIGIT HR is disabled).
 * Each rule has its Python twin in R10_HOOK_SCRIPTS (exported to the Frappe app and listed in FRAPPE_DEVELOPER_GUIDE.md).
 *  - PAY-13 approved on-demand pay → one Employee Advance draft; the amount never exceeds the earned limit
 *  - PAY-15 the preflight verifier is not the payroll preparer (four eyes)
 *  - ORG-05 a Job Opening links only an approved, open position
 *  - SET-03 WPS Submission / Payroll Bank File need the company's GOSI establishment number
 *  - LEV-06 long leave opens one Long Leave case; LEV-07 approved leave writes On Leave attendance
 *  - CAS-03 a case cannot be resolved / closed with open tasks or sub-cases
 *  - CMP-02 the proposals of a compensation cycle stay inside its budget
 *  - REC-14 a new applicant gets retain_until from the retention setting
 *  - ONB-06 a completed onboarding grants system access; a submitted separation schedules the revoke
 *  - PLT-01 native Webhook records fire on HR document events
 *  - CQ rows (features/guards.ts): no attendance / punch before joining or after relieving, none inside a locked payroll
 *    period, relieving ends the shift assignments, an advance recovery never exceeds the unrecovered advance
 *  - FR26 native-first (features/native.ts): account on employee save / import, imported slip naming, overlapping active
 *    shifts block a new assignment while cancelled ones never do
 */
import { adapter, registerDocHook, type Doc, type DocHook } from "@/lib/adapter";
import { isEnabled } from "@/plugins/runtime";
import { currentUser } from "@/lib/session";
import { policyValue } from "../product/settings";
import { jobOpeningPositionError, wpsRegistrationError } from "./features/setup";
import { longLeaveCase, openChildren, DSC } from "./features/service";
import { leaveToAttendance } from "./features/time";
import { provisionAccess } from "./features/talent";
import { cycleBudget, earnedWage } from "./features/payroll";
import { fireWebhooks } from "./features/platform";
import { s, n, d10, todayISO, addDays } from "./write";
import { advanceRecoveryErrors, endShiftsOnExit, shiftAssignmentErrors, timeRecordErrors } from "./features/guards";
import { autoUserAfterInsert, salarySlipName, shiftOverlapErrors } from "./features/native";

const isNew = (before: Doc | undefined) => !before;
const changedTo = (doc: Doc, before: Doc | undefined, f: string, v: string) => s(doc[f]) === v && s(before?.[f]) !== v;

const earnedWageRule: DocHook = (doc, before) => {
  const errors: string[] = [];
  if (isNew(before) && s(doc["employee"]) && n(doc["amount"]) > 0) { const w = earnedWage(s(doc["employee"]), d10(doc["request_date"]) || todayISO()); if (n(doc["amount"]) > w.limit + 0.005) errors.push(`The amount is above the on-demand limit of ${w.limit} for this month`); }
  const after = changedTo(doc, before, "approval_status", "Approved") && !s(doc["employee_advance"]) ? (d: Doc) => {
    const e = adapter.get("Employee", s(d["employee"]));
    const adv = adapter.insertDoc("Employee Advance", { employee: d["employee"], employee_name: d["employee_name"], company: d["company"] ?? e?.["company"], posting_date: todayISO(), purpose: `On-demand pay ${d.name}`, advance_amount: d["amount"], currency: "SAR", repay_unclaimed_amount_from_salary: 1, status: "Draft", docstatus: 0 });
    adapter.update("DIGIT Earned Wage Request", d.name, { employee_advance: adv.name });
  } : undefined;
  return { doc, errors, ...(after ? { after } : {}) };
};
const preflightRule: DocHook = (doc, before) => {
  const by = s(doc["verified_by"]); if (!by || by === s(before?.["verified_by"])) return { doc };
  const pe = adapter.get("Payroll Entry", s(doc["payroll_entry"]));
  const preparer = s(pe?.["digit_prepared_by"]) || s(pe?.["owner"]);
  if ((policyValue("payroll_four_eyes", todayISO(), s(doc["company"])) ?? 1) > 0 && preparer && by === preparer) return { doc, errors: ["The verifier must be a different person than the payroll preparer"] };
  return { doc };
};
const jobOpeningRule: DocHook = (doc, before) => {
  if (s(doc["digit_position"]) === s(before?.["digit_position"])) return { doc };
  const e = jobOpeningPositionError(doc); return e ? { doc, errors: [e] } : { doc };
};
const wpsRule: DocHook = (doc, before) => {
  if (!isNew(before) || !s(doc["company"])) return { doc };
  const e = wpsRegistrationError(s(doc["company"])); return e ? { doc, errors: [e] } : { doc };
};
const leaveRule: DocHook = (doc, before) => {
  const after = (d: Doc) => {
    if (!s(d["digit_case"])) longLeaveCase(d);
    if (Number(d.docstatus) === 1 && s(d["status"]) === "Approved" && !(Number(before?.docstatus) === 1 && s(before?.["status"]) === "Approved")) leaveToAttendance(d);
  };
  return { doc, after };
};
const caseRule: DocHook = (doc, before) => {
  const st = s(doc["case_status"]);
  if (before && ["Resolved", "Closed"].includes(st) && !["Resolved", "Closed"].includes(s(before["case_status"]))) {
    const kids = openChildren(doc.name);
    if (kids.length) return { doc, errors: [`Close the open tasks or sub-cases first: ${kids.map((k) => k.name).join(", ")}`] };
  }
  return { doc };
};
const proposalRule: DocHook = (doc, before) => {
  const cy = s(doc["cycle"]); if (!cy || s(doc["status"]) === "Rejected") return { doc };
  const b = cycleBudget(cy); if (!b.budget) return { doc };
  const mine = (n(doc["proposed_base"]) - n(doc["current_base"])) * 12; const prev = before && s(before["status"]) !== "Rejected" ? (n(before["proposed_base"]) - n(before["current_base"])) * 12 : 0;
  if (b.used - prev + mine > b.budget + 0.005) return { doc, errors: [`The increase exceeds the cycle budget: ${Math.round(b.budget - b.used + prev)} remains`] };
  return { doc };
};
const applicantRule: DocHook = (doc, before) => {
  if (!isNew(before) || s(doc["retain_until"])) return { doc };
  const m = policyValue("candidate_retention_months", todayISO()) ?? 24;
  return { doc: { ...doc, retain_until: addDays(d10(doc["creation"]) || todayISO(), Math.round(m * 30.4)) } };
};
const onboardingRule: DocHook = (doc, before) => (changedTo(doc, before, "boarding_status", "Completed") && s(doc["employee"]) ? { doc, after: (d: Doc) => void provisionAccess(s(d["employee"]), "Grant", undefined, todayISO(), ["Employee Onboarding", d.name], currentUser()) } : { doc });
const separationRule: DocHook = (doc, before) => (Number(doc.docstatus) === 1 && Number(before?.docstatus ?? 0) === 0 && s(doc["employee"]) ? { doc, after: (d: Doc) => { const e = adapter.get("Employee", s(d["employee"])); void provisionAccess(s(d["employee"]), "Revoke", undefined, d10(e?.["relieving_date"]) || d10(d["boarding_begins_on"]) || todayISO(), ["Employee Separation", d.name], currentUser()); } } : { doc });
const timeRule = (dt: string): DocHook => (doc, before) => ({ doc, errors: timeRecordErrors(dt, doc, before) });
const shiftRule: DocHook = (doc, before) => ({ doc, errors: [...shiftAssignmentErrors(doc, before), ...shiftOverlapErrors(doc, before)] });
/** FR26-0137/0139: the account is created after the employee is stored; an import row's create_user flag is not kept. */
const employeeUserRule: DocHook = (doc, before) => {
  if (before) return { doc };
  const flag = Number(doc["create_user"] ?? 0) === 1; const rest = { ...doc }; delete rest["create_user"];
  return { doc: rest as Doc, after: (d: Doc) => autoUserAfterInsert(flag ? { ...d, create_user: 1 } : d) };
};
/** FR26-0348: an unnamed (imported) slip takes the controller name Sal Slip/<employee>/#####. */
const slipNameRule: DocHook = (doc, before) => { if (before) return { doc }; const nm = salarySlipName(doc); return nm && !adapter.get("Salary Slip", nm) ? { doc: { ...doc, name: nm } } : { doc }; };
const advanceRecoveryRule: DocHook = (doc, before) => ({ doc, errors: advanceRecoveryErrors(doc, before) });
const exitShiftsRule: DocHook = (doc, before) => (d10(doc["relieving_date"]) && d10(doc["relieving_date"]) !== d10(before?.["relieving_date"]) ? { doc, after: (d: Doc) => void endShiftsOnExit(d.name) } : { doc });
const WEBHOOK_DT = ["Employee", "Leave Application", "Job Applicant", "Job Offer", DSC, "Attendance", "Employee Checkin", "Expense Claim"];
const webhookRule = (dt: string): DocHook => (doc, before) => ({ doc, after: (d: Doc) => { if (adapter.list("Webhook").length) fireWebhooks(dt, !before ? "after_insert" : Number(d.docstatus) === 1 && Number(before.docstatus) === 0 ? "on_submit" : "on_update", d); } });

const only = (h: DocHook): DocHook => (doc, before) => (isEnabled("digit_hr") && !doc["__synthetic"] ? h(doc, before) : { doc });
let done = false;
export function registerR10Hooks(): void {
  if (done) return; done = true;
  const table: [string, DocHook][] = [["DIGIT Earned Wage Request", earnedWageRule], ["DIGIT Payroll Preflight", preflightRule], ["Job Opening", jobOpeningRule], ["DIGIT WPS Submission", wpsRule], ["DIGIT Payroll Bank File", wpsRule],
    ["Leave Application", leaveRule], [DSC, caseRule], ["DIGIT Salary Change Proposal", proposalRule], ["Job Applicant", applicantRule], ["Employee Onboarding", onboardingRule], ["Employee Separation", separationRule],
    ["Attendance", timeRule("Attendance")], ["Employee Checkin", timeRule("Employee Checkin")], ["Attendance Request", timeRule("Attendance Request")], ["Shift Assignment", shiftRule], ["Additional Salary", advanceRecoveryRule], ["Employee", exitShiftsRule], ["Employee", employeeUserRule], ["Salary Slip", slipNameRule], ...WEBHOOK_DT.map((dt) => [dt, webhookRule(dt)] as [string, DocHook])];
  for (const [dt, h] of table) registerDocHook(dt, only(h));
}
registerR10Hooks();

