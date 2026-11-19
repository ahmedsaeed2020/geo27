/**
 * Record scope of the round-2 HR roles (the "scope" column of the role matrix). Consulted by identityScope.ts for users
 * without HR User / HR Manager / System Manager, and — for confidential cases — for every user. It only narrows or passes
 * through what the Core DocPerm rows already allow; it never grants a DocType the role has no permission row on.
 */
import { adapter, type Doc } from "@/lib/adapter";

const v = (x: unknown) => String(x ?? "");
const READS = new Set(["read", "print", "report", "export", "email"]);
export const RECRUITING = new Set(["Job Opening", "Job Applicant", "Interview", "Interview Feedback", "Job Offer", "Job Requisition", "Appointment Letter", "Employee Referral", "DIGIT Job Posting", "DIGIT Candidate Consent", "DIGIT Candidate Stage History", "DIGIT Hiring Scorecard", "DIGIT Offer Approval", "DIGIT Recruiting Source", "DIGIT Talent Pool", "DIGIT Quality of Hire Review", "DIGIT Pending Worker", "Interview Round"]);
export const CASES = new Set(["DIGIT HR Service Case", "Employee Grievance", "DIGIT Confidential Grievance", "DIGIT Disciplinary Case"]);
export const TIME = new Set(["Attendance", "Employee Checkin", "Attendance Request", "Shift Assignment", "Shift Request", "Shift Type", "Shift Schedule", "Shift Location", "DIGIT Timecard Exception", "DIGIT Time Approval Batch", "DIGIT Attendance Correction", "DIGIT Shift Swap Request", "DIGIT Work Availability", "DIGIT Coverage Rule", "DIGIT Site Worker Assignment", "DIGIT Geo Timecard Snapshot", "DIGIT Geo Event Receipt", "DIGIT Geo Sync Exception", "DIGIT Time Source Mapping", "DIGIT Workforce Capability Profile"]);
export const PAY = new Set(["DIGIT Employee Loan", "Salary Slip", "Payroll Entry", "Salary Structure Assignment", "Salary Structure", "Salary Component", "Additional Salary", "Retention Bonus", "Employee Incentive", "Gratuity", "Full and Final Statement", "Employee Advance", "Payroll Period", "DIGIT Payroll Preflight", "DIGIT Payroll Variance", "DIGIT WPS Submission", "DIGIT GOSI Assessment", "DIGIT Payroll Period Lock", "DIGIT Payroll Exception", "DIGIT Payroll Trial Run", "DIGIT Payroll Reconciliation", "DIGIT Retro Pay Adjustment", "DIGIT Payroll Bank File", "DIGIT GOSI Contribution Snapshot", "DIGIT End of Service Calculation", "Employee Loan", "DIGIT Earned Wage Request", "DIGIT Bonus Pool Distribution", "DIGIT Compensation Review", "DIGIT Salary Change Proposal", "DIGIT Total Rewards Statement", "DIGIT Final Settlement Case", "Journal Entry"]);
/** Individual pay records: never shown to finance (totals only), executives or the system administrator by default. */
export const INDIVIDUAL_PAY = new Set(["Salary Slip", "Salary Structure Assignment", "Additional Salary", "Retention Bonus", "Employee Incentive", "Employee Loan", "DIGIT Employee Loan", "DIGIT Earned Wage Request", "DIGIT Salary Change Proposal", "DIGIT Total Rewards Statement", "DIGIT Retro Pay Adjustment", "DIGIT End of Service Calculation", "Full and Final Statement", "Gratuity", "DIGIT Compensation Review", "DIGIT Payroll Trial Run"]);
const FINANCE = new Set(["Payroll Entry", "Journal Entry", "DIGIT Payroll Reconciliation", "DIGIT Labor Cost Budget", "DIGIT Position Budget", "DIGIT Payroll Bank File", "DIGIT WPS Submission", "DIGIT GOSI Contribution Snapshot", "Employee Advance", "Expense Claim", "Travel Request", "DIGIT Employee Reimbursement", "DIGIT Expense Card Allocation", "DIGIT Per Diem Rate", "DIGIT Travel Policy", "DIGIT Position", "DIGIT Headcount Plan", "DIGIT Workforce Plan", "Cost Center"]);
const PLANNING = new Set(["DIGIT Workforce Plan", "DIGIT Headcount Plan", "DIGIT Position Forecast", "DIGIT Labor Cost Budget", "DIGIT Vacancy Plan", "DIGIT Workforce Scenario", "DIGIT Workforce Plan Approval", "DIGIT Position Budget", "DIGIT Nitaqat Snapshot", "DIGIT HR Metric Definition", "DIGIT Saved HR Query"]);
const SAUDI = new Set(["DIGIT Saudi Rule Set", "DIGIT Saudi Employment Rule Set", "DIGIT Saudi Rule Version", "DIGIT Statutory Eligibility", "DIGIT Government Reference", "DIGIT Nitaqat Snapshot", "DIGIT Compliance Exception", "DIGIT GOSI Enrollment Check", "DIGIT Qiwa Contract Reference", "DIGIT WPS File Check", "DIGIT WPS Submission", "DIGIT GOSI Assessment", "DIGIT HR Audit Event", "DIGIT Policy Version", "DIGIT Retention Policy", "DIGIT Data Subject Request"]);
const PLATFORM = new Set(["DIGIT HR Provider Setting", "DIGIT Provider Exchange", "DIGIT External System", "DIGIT Employee External ID", "DIGIT Integration Run", "DIGIT Integration Event", "DIGIT Dead Letter Item", "DIGIT Reconciliation Case", "DIGIT HR Integration Log", "DIGIT Upgrade Readiness Run", "DIGIT Import Batch", "Webhook", "Data Import", "Scheduled Job Type", "Error Log"]);

export function isConfidential(doctype: string, doc: Doc): boolean {
  if (doctype === "DIGIT Confidential Grievance" || doctype === "DIGIT Disciplinary Case") return true;
  if (doctype === "DIGIT HR Service Case") return Number(doc["is_confidential"] ?? 0) === 1 || v(doc["category"]) === "Confidential";
  return false;
}
/** Confidential cases: Employee Relations, HR Manager / CHRO, the employee concerned and the assigned handler only (CAS-05). */
export function confidentialAllowed(doc: Doc, user: string, roles: string[]): boolean {
  if (roles.some((r) => r === "Employee Relations Specialist" || r === "HR Manager" || r === "CHRO" || r === "System Manager")) return true;
  if (v(doc["assigned_to"]) === user || v(doc["assigned_specialist"]) === user) return true;
  const me = adapter.list("Employee").find((e) => e["user_id"] === user);
  return !!me && v(doc["employee"]) === me.name;
}
/** Values a User Permission allows (empty = no restriction of that kind). */
export function allowedValues(user: string, allow: string): Set<string> {
  return new Set(adapter.list("User Permission").filter((p) => p["user"] === user && p["allow"] === allow).map((p) => v(p["for_value"])));
}
const openingOf = (doctype: string, doc: Doc): string => {
  if (doctype === "Job Opening") return doc.name;
  if (doctype === "Job Applicant") return v(doc["job_title"]);
  const app = v(doc["job_applicant"]); if (app) return v(adapter.get("Job Applicant", app)?.["job_title"]);
  if (doctype === "DIGIT Job Posting") return v(doc["job_opening"]);
  return "";
};
const empField = (doctype: string, doc: Doc) => (doctype === "Employee" ? doc : adapter.get("Employee", v(doc["employee"])));
const interviewsOf = (user: string) => adapter.list("Interview").filter((i) => (Array.isArray(i["interview_details"]) ? (i["interview_details"] as Doc[]) : []).some((r) => r["interviewer"] === user));

type Verdict = boolean | undefined;
const RULES: Record<string, (dt: string, d: Doc, user: string, op: string) => Verdict> = {
  Recruiter: (dt, d, user) => {
    if (!RECRUITING.has(dt)) return undefined;
    if (dt === "Job Requisition" || dt === "DIGIT Recruiting Source" || dt === "DIGIT Talent Pool" || dt === "Interview Round" || dt === "Employee Referral") return true;
    const op = openingOf(dt, d); if (!op) return !d.name || dt === "Job Applicant"; // a new applicant without an opening yet
    return v(adapter.get("Job Opening", op)?.["digit_recruiter"]) === user;
  },
  Interviewer: (dt, d, user, op) => {
    if (dt === "Interview") return (Array.isArray(d["interview_details"]) ? (d["interview_details"] as Doc[]) : []).some((r) => r["interviewer"] === user);
    if (dt === "Interview Feedback" || dt === "DIGIT Hiring Scorecard") return !d.name || v(d["interviewer"]) === user;
    if (dt === "Job Applicant") return READS.has(op) && interviewsOf(user).some((i) => i["job_applicant"] === d.name);
    return RECRUITING.has(dt) ? false : undefined;
  },
  "HR Service Agent": (dt, d) => (dt === "DIGIT HR Service Case" ? !isConfidential(dt, d) : CASES.has(dt) ? false : undefined),
  "Employee Relations Specialist": (dt) => (CASES.has(dt) ? true : undefined),
  Timekeeper: (dt, d, user) => {
    if (!TIME.has(dt)) return undefined;
    const allowed = allowedValues(user, "Branch"); if (!allowed.size) return true;
    const e = empField(dt, d); const br = v(e?.["branch"] ?? d["branch"]);
    return !br || allowed.has(br);
  },
  "Payroll Officer": (dt) => (PAY.has(dt) || dt === "Employee" ? true : undefined),
  "Payroll Manager": (dt) => (PAY.has(dt) || dt === "Employee" ? true : undefined),
  "Payroll Specialist": (dt) => (PAY.has(dt) || dt === "Employee" ? true : undefined),
  "Finance Controller": (dt) => (FINANCE.has(dt) ? true : INDIVIDUAL_PAY.has(dt) ? false : undefined),
  "Executive Leadership": (dt) => (PLANNING.has(dt) ? true : INDIVIDUAL_PAY.has(dt) ? false : undefined),
  "Compliance Officer": (dt) => (SAUDI.has(dt) ? true : INDIVIDUAL_PAY.has(dt) ? false : undefined),
  "HR Auditor": (_dt, _d, _u, op) => READS.has(op),
  "HR Admin": (dt) => (INDIVIDUAL_PAY.has(dt) ? false : PLATFORM.has(dt) || dt.startsWith("DIGIT ") ? true : undefined),
  "Integration Admin": (dt) => (PLATFORM.has(dt) ? true : undefined),
  "HR Operations": (dt) => (INDIVIDUAL_PAY.has(dt) ? false : true),
  "HR Talent": (dt) => (INDIVIDUAL_PAY.has(dt) ? false : true),
  "HR Business Partner": (dt, d, user) => {
    if (INDIVIDUAL_PAY.has(dt)) return false;
    const allowed = allowedValues(user, "Department"); if (!allowed.size) return true;
    const e = empField(dt, d); const dep = v(e?.["department"] ?? d["department"]);
    return !dep || allowed.has(dep);
  },
  CHRO: () => true,
};
export const SCOPED_ROLES = new Set(Object.keys(RULES));
/** Verdict of the user's specialist roles: true if any role passes the record, false if every concerned role refuses,
 *  undefined when none of the user's roles concerns this DocType (the self/team rule then applies). */
export function specialistVerdict(doctype: string, doc: Doc, user: string, roles: string[], operation: string): Verdict {
  let seen = false;
  for (const r of roles) { const f = RULES[r]; if (!f) continue; const out = f(doctype, doc, user, operation); if (out === true) return true; if (out === false) seen = true; }
  return seen ? false : undefined;
}

/* ------------------------------------------------------------------ GAP-19 company-less HRMS DocTypes */
/** HRMS DocTypes without a company field take the company of the record they hang on, so a company-restricted HR user
 *  sees only their own companies' applicants, interviews, check-ins and grievances (frappe User Permission on Company). */
const VIA_EMPLOYEE: Record<string, string> = { "Employee Checkin": "employee", "Employee Grievance": "raised_by", "Employee Skill Map": "employee", "Employee Performance Feedback": "employee", "Training Feedback": "employee" };
export function linkedCompany(doctype: string, doc: Doc, depth = 0): string {
  if (depth > 3) return "";
  if (v(doc["company"])) return v(doc["company"]);
  const emp = VIA_EMPLOYEE[doctype]; if (emp) return v(adapter.get("Employee", v(doc[emp]))?.["company"]);
  if (doctype === "Job Applicant") { const jo = adapter.get("Job Opening", v(doc["job_title"]) || v(doc["job_opening"])); return jo ? linkedCompany("Job Opening", jo, depth + 1) : ""; }
  if (doctype === "Interview" || doctype === "Job Offer") { const jo = adapter.get("Job Opening", v(doc["job_opening"])); if (jo) return linkedCompany("Job Opening", jo, depth + 1); const ja = adapter.get("Job Applicant", v(doc["job_applicant"])); return ja ? linkedCompany("Job Applicant", ja, depth + 1) : ""; }
  if (doctype === "Interview Feedback") { const iv = adapter.get("Interview", v(doc["interview"])); return iv ? linkedCompany("Interview", iv, depth + 1) : ""; }
  return "";
}
export const COMPANYLESS = new Set(["Job Applicant", "Interview", "Interview Feedback", ...Object.keys(VIA_EMPLOYEE)]);
/** Companies the user is restricted to (User Permission allow = Company); empty = not restricted. */
export function userCompanies(user: string): Set<string> {
  return new Set(adapter.list("User Permission").filter((p) => v(p["user"]) === user && v(p["allow"]) === "Company").map((p) => v(p["for_value"])));
}
export function companylessAllowed(doctype: string, doc: Doc, user: string): boolean {
  if (!COMPANYLESS.has(doctype) || v(doc["company"])) return true;
  const allowed = userCompanies(user); if (!allowed.size) return true;
  const co = linkedCompany(doctype, doc); return !co || allowed.has(co);
}
