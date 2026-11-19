/**
 * HR R9 controller rules as adapter doc hooks (ports of the validate / before_insert methods of the 10 R9 controllers,
 * DIGIT HR Service Case.before_insert/apply_service_item, the PAY-04 Salary Slip / Additional Salary guard and the APR-02
 * before_submit gate from digit_hr hooks.py). Registered once from ../boot.ts; inert while DIGIT HR is disabled, so the
 * Standard Desk is unchanged. Python source of each rule: ./source/*.py.txt and digit_hr/api/*.py (SOURCE.md).
 */
import { adapter, registerDocHook, type Doc, type DocHook } from "@/lib/adapter";
import { isEnabled } from "@/plugins/runtime";
import { currentUser } from "@/plugins/digit_hr/compat/session";
import { _, can, dateOnly, flagged, nowDatetime, s, toDate, userEnabled } from "./core";
import { DAD, DBC, DCR, DOI, DPA, DPL, DSC_ITEM } from "./doctypes";
import { autoRoute, applyServiceItem, ibanOk, locksFor, payrollDates, roundFor, SUPPORTED } from "./logic";

const DSC = "DIGIT HR Service Case";
const n = (v: unknown) => Number(v ?? 0) || 0;
const changed = (doc: Doc, before: Doc | undefined, fields: readonly string[]) => fields.some((f) => s(doc[f]) !== s(before?.[f]));

/** DIGITApprovalDelegation.validate */
const delegation: DocHook = (doc, before) => {
  const errors: string[] = [];
  if (s(doc["delegator"]) && s(doc["delegator"]) === s(doc["delegate"])) errors.push(_("The delegate must be a different user than the approver"));
  for (const u of [doc["delegator"], doc["delegate"]]) if (s(u) && !userEnabled(u)) errors.push(_("User {0} is not active", s(u)));
  if (s(doc["to_date"]) && s(doc["from_date"]) && toDate(doc["to_date"]) < toDate(doc["from_date"])) errors.push(_("To Date cannot be before From Date"));
  if (before && s(before["delegation_status"]) !== "Draft" && changed(doc, before, ["delegator", "delegate", "company"]))
    errors.push(_("Revoke the delegation before changing its approver, delegate or company"));
  return { doc, errors };
};

const DECISION_FIELDS = ["decided_by", "decided_on", "decision_note", "applied_by", "applied_on", "previous_account_masked"] as const;
/** DIGITBankChangeRequest.validate (+ utils.set_employee_context) */
const bankChange: DocHook = (doc, before) => {
  const errors: string[] = []; let d = doc;
  if (s(d["employee"])) {
    const emp = adapter.get("Employee", s(d["employee"]));
    if (!emp) errors.push(_("Employee {0} does not exist", s(d["employee"])));
    else d = { ...d, employee_name: emp["employee_name"] ?? "", company: emp["company"] ?? "" };
  }
  if (s(d["new_iban"])) {
    const iban = s(d["new_iban"]).replace(/ /g, "").toUpperCase(); d = { ...d, new_iban: iban };
    if (!ibanOk(iban)) errors.push(_("IBAN {0} is not valid", iban));
  }
  if (!(s(d["new_bank_ac_no"]) || s(d["new_iban"]))) errors.push(_("Enter the new account number or IBAN"));
  const action = flagged("digit_bank_action");
  const oldStatus = before ? s(before["request_status"]) || "Draft" : "Draft";
  const status = s(d["request_status"]) || "Draft";
  if (status !== oldStatus && !action && !(oldStatus === "Draft" && status === "Submitted")) errors.push(_("Use the Approve, Reject or Apply action to change the status"));
  if (!action && changed(d, before, DECISION_FIELDS)) errors.push(_("Only HR can decide or apply a bank change request"));
  if (before && oldStatus !== "Draft" && changed(d, before, ["employee", "new_bank_name", "new_bank_ac_no", "new_iban"]))
    errors.push(_("A submitted request can no longer be changed; reject it and file a new one"));
  return { doc: d, errors };
};

/** DIGITHRCaseRoutingRule.validate */
const routingRule: DocHook = (doc) => {
  const errors: string[] = [];
  for (const f of ["assign_to", "escalate_to"]) if (s(doc[f]) && !userEnabled(doc[f])) errors.push(_("Handler {0} is not an active user", s(doc[f])));
  if (s(doc["escalate_to"]) && s(doc["escalate_to"]) === s(doc["assign_to"])) errors.push(_("Escalate To must be a different user than Assign To"));
  return { doc, errors };
};

const GUARDED = ["token_hash", "invite_status", "expires_on", "submitted_on", "applied_by", "applied_on", "employee_onboarding",
  "personal_email", "cell_number", "current_address", "person_to_be_contacted", "emergency_phone_number", "relation"] as const;
/** DIGITOnboardingInvite.validate */
const invite: DocHook = (doc, before) => {
  if (!flagged("digit_invite_action") && (!before || changed(doc, before, GUARDED))) return { doc, errors: [_("Use the invitation actions (create, apply, revoke)")] };
  const ob = adapter.get("Employee Onboarding", s(doc["employee_onboarding"]));
  return { doc: { ...doc, employee_name: ob?.["employee_name"] ?? "", company: ob?.["company"] ?? "" } };
};

/** DIGITParallelApproval.validate */
const parallel: DocHook = (doc, before) => {
  const errors: string[] = []; let d = doc;
  const dt = s(d["reference_doctype"]);
  if (!SUPPORTED.includes(dt)) return { doc, errors: [_("Parallel approval is available for: {0}", SUPPORTED.map((x) => _(x)).join(", "))] };
  const ref = adapter.get(dt, s(d["reference_name"]));
  if (!ref) return { doc, errors: [_("Document {0} not found", s(d["reference_name"]))] };
  d = { ...d, company: ref["company"] ?? "" };
  const rows = (Array.isArray(d["approvers"]) ? d["approvers"] : []) as Doc[];
  const users = rows.map((r) => s(r["approver"]));
  if (!users.length || new Set(users).size !== users.length) errors.push(_("List each approver once"));
  const owner = s(ref["owner"]) || "Administrator";
  for (const r of rows) {
    if ([s(r["approver"]), s(r["substitute"])].includes(owner)) errors.push(_("The creator of the document cannot be one of its approvers"));
    if (s(r["substitute"]) && s(r["substitute"]) === s(r["approver"])) errors.push(_("A substitute must be a different user"));
    for (const u of [s(r["approver"]), s(r["substitute"])]) {
      if (!u) continue;
      if (!userEnabled(u)) errors.push(_("User {0} is not active", u));
      // no blind approvals: every approver / substitute must already be able to read the document (no access is granted)
      else if (!can(dt, "read", ref, u)) errors.push(_("{0} cannot read this document, so cannot approve it", u));
    }
  }
  if (s(d["rule"]) === "Quorum" && !(n(d["quorum"]) >= 1 && n(d["quorum"]) <= users.length)) errors.push(_("Quorum must be between 1 and the number of approvers"));
  if (!flagged("digit_parallel_action") && before) {
    const sig = (x: Doc) => JSON.stringify(((Array.isArray(x["approvers"]) ? x["approvers"] : []) as Doc[]).map((r) => [s(r["approver"]), s(r["decision"]) || "Pending", s(r["decided_by"])]));
    if (sig(before) !== sig(d) || s(before["approval_status"]) !== s(d["approval_status"]) || s(before["rule"]) !== s(d["rule"]) || n(before["quorum"]) !== n(d["quorum"]))
      errors.push(_("Approvers, rule and decisions change only through the approval actions"));
  }
  return { doc: d, errors: [...new Set(errors)] };
};

/** DIGITPayrollPeriodLock.validate */
const periodLock: DocHook = (doc, before) => {
  const errors: string[] = []; let d = doc;
  if (toDate(d["to_date"]) < toDate(d["from_date"])) errors.push(_("To Date cannot be before From Date"));
  const status = s(d["lock_status"]) || "Locked";
  if (status === "Locked") {
    const overlap = adapter.list(DPL).find((x) => x.name !== d.name && s(x["company"]) === s(d["company"]) && s(x["lock_status"]) === "Locked"
      && dateOnly(x["from_date"]) <= dateOnly(d["to_date"]) && dateOnly(x["to_date"]) >= dateOnly(d["from_date"]));
    if (overlap) errors.push(_("This period overlaps the locked period {0}", overlap.name));
    if (!before || s(before["lock_status"]) !== "Locked") d = { ...d, locked_by: currentUser(), locked_on: nowDatetime() };
  } else if (status === "Reopened" && (!before || s(before["lock_status"]) !== "Reopened")) {
    if (!before) errors.push(_("A new lock starts as Locked"));
    else if (!s(d["reopen_reason"]).trim()) errors.push(_("A reason is required to reopen a locked payroll period"));
    else d = { ...d, reopened_by: currentUser(), reopened_on: nowDatetime() };
  }
  if (before && s(before["lock_status"]) === "Locked" && (s(before["company"]) !== s(d["company"]) || dateOnly(before["from_date"]) !== dateOnly(d["from_date"]) || dateOnly(before["to_date"]) !== dateOnly(d["to_date"])))
    errors.push(_("Reopen the lock before changing its company or dates"));
  return { doc: d, errors };
};

/** DIGITServiceCatalogItem.validate */
const catalogItem: DocHook = (doc) => {
  const errors: string[] = [];
  if (doc["sla_hours"] != null && s(doc["sla_hours"]) !== "" && n(doc["sla_hours"]) < 0) errors.push(_("SLA hours cannot be negative"));
  const seen = new Set<string>();
  ((Array.isArray(doc["eligibility"]) ? doc["eligibility"] : []) as Doc[]).forEach((r, i) => {
    const key = `${s(r["based_on"])}\u0000${s(r["value"])}`;
    if (seen.has(key)) errors.push(_("Row {0}: duplicate eligibility rule {1}: {2}", n(r["idx"]) || i + 1, _(s(r["based_on"])), s(r["value"])));
    seen.add(key);
  });
  return { doc, errors };
};

/** DIGITHRServiceCase.before_insert (CAS-04 auto_route) + validate.apply_service_item (POR-03, new cases only). */
const serviceCase: DocHook = (doc, before) => {
  if (before) return { doc };
  const r = applyServiceItem(doc);
  if (r.error) return { doc, errors: [r.error] };
  return { doc: autoRoute(r.doc) };
};

/** payroll_lock.guard (doc_events validate + before_cancel on Salary Slip / Additional Salary). */
const payrollGuard = (dt: string): DocHook => (doc) => {
  const [start, end] = payrollDates(dt, doc);
  const hit = locksFor(s(doc["company"]), start, end)[0];
  if (!hit) return { doc };
  return { doc, errors: [_("The payroll period {0} – {1} of {2} is locked ({3}). Ask an HR Manager to reopen it first.", dateOnly(hit["from_date"]), dateOnly(hit["to_date"]), s(doc["company"]), hit.name)] };
};

/** parallel_approval.before_submit_gate (doc_events before_submit on the three supported DIGIT DocTypes). */
const submitGate = (dt: string): DocHook => (doc, before) => {
  if (!before || n(before.docstatus) !== 0 || n(doc.docstatus) !== 1) return { doc };
  const round = roundFor(dt, doc.name);
  if (round && s(round["approval_status"]) !== "Approved")
    return { doc, errors: [`${_("Approval pending")}: ${_("Approval round {0} is {1}: the document cannot be submitted yet", round.name, _(s(round["approval_status"])))}`] };
  return { doc };
};

const only = (h: DocHook): DocHook => (doc, before) => (isEnabled("digit_hr") ? h(doc, before) : { doc });
let done = false;
export function registerR9Hooks(): void {
  if (done) return; done = true;
  const table: [string, DocHook][] = [[DAD, delegation], [DBC, bankChange], [DCR, routingRule], [DOI, invite], [DPA, parallel], [DPL, periodLock],
    [DSC_ITEM, catalogItem], [DSC, serviceCase], ["Salary Slip", payrollGuard("Salary Slip")], ["Additional Salary", payrollGuard("Additional Salary")],
    ...SUPPORTED.map((dt) => [dt, submitGate(dt)] as [string, DocHook])];
  for (const [dt, h] of table) registerDocHook(dt, only(h));
}
registerR9Hooks();
