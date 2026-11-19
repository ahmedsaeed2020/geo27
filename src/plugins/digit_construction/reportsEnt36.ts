/**
 * Sheet 16 BUILD documents (owner work list MISS-*): one register report each for the documents that had none (Job
 * Snapshot and Handover Asset already have Job Snapshot Comparison and O&M Manual Index). Rows are the saved records of
 * the session's readable construction projects (domain/queues constructionProjects); the report runner then applies
 * the DocType's own read permission, so a register never shows a record its list hides. Nothing here posts. Python
 * scripts stay server stubs, like every other Construction script report.
 */
import type { PluginReport } from "../types";
import { list, today } from "./domain/data";
import { constructionProjects } from "./domain/queues";
import { FIN_ROLES } from "./reportsFin";
import { currentUser, userRoles } from "@/lib/session";

type F = Record<string, unknown>;
type Row = Record<string, unknown>;
const C = (fieldname: string, label: string, fieldtype = "Data", options?: string) => ({ fieldname, label, fieldtype, ...(options ? { options } : {}), width: 130 });
const S = (q: string) => `# FRAPPE_SERVER_REQUIRED: the Virtual Core computes this report in digit_construction/reportsEnt36.ts (${q}).\n# Port it to Python and test it on staging before enabling this report on the DIGIT server site.\nraise NotImplementedError("${q}")\n`;
const L = (fieldname: string, label: string, options: string) => ({ fieldname, label, fieldtype: "Link", options });
const PRJ = [L("company", "Company", "Company"), L("project", "Project", "Project")];
const s = (v: unknown) => (v === undefined || v === null ? "" : String(v));
const scope = (f: F) => new Set(constructionProjects({ ...(f["company"] ? { company: s(f["company"]) } : {}), ...(f["project"] ? { project: s(f["project"]) } : {}) }).map((p) => p.name));
const inScope = (dt: string, f: F) => { const p = scope(f); return list(dt, (d) => p.has(s(d["project"]))); };
const finance = () => { const u = currentUser(); return u === "Administrator" || userRoles(u).some((r) => FIN_ROLES.includes(r)); };
const pick = (d: Row, keys: string[]) => Object.fromEntries([["name", d["name"]], ...keys.map((k) => [k, d[k] ?? ""])]);

/** A permit is live when issued and its validity covers now; expired when issued and past Valid To. */
export function permitState(d: Row, on = today()): "Live" | "Expired" | "Not issued" | "Closed" {
  const st = s(d["status"]);
  if (st === "Closed") return "Closed";
  if (st !== "Issued") return "Not issued";
  return s(d["valid_to"]).slice(0, 10) && s(d["valid_to"]).slice(0, 10) < on ? "Expired" : "Live";
}
/** An induction is valid on a day when approved (or not yet decided) and that day is within its validity. */
export function inductionValid(d: Row, on = today()): boolean {
  if (s(d["approval_status"]) === "Rejected") return false;
  const from = s(d["inducted_on"]).slice(0, 10), to = s(d["valid_until"]).slice(0, 10);
  return !!from && from <= on && (!to || to >= on);
}

export const ENT36_REPORTS: PluginReport[] = [
  { name: "Work Permit Register", ref_doctype: "Digit Work Permit", report_type: "Script Report", script: S("Work Permit Register"), filters: PRJ,
    columns: [C("name", "Work Permit", "Link", "Digit Work Permit"), C("project", "Project", "Link", "Project"), C("permit_type", "Permit Type"), C("location", "Location"), C("status", "Status"),
      C("valid_from", "Valid From", "Datetime"), C("valid_to", "Valid To", "Datetime"), C("issuer", "Issuer", "Link", "User"), C("state", "Validity")],
    run: (f) => inScope("Digit Work Permit", f).map((d) => ({ ...pick(d, ["project", "permit_type", "location", "status", "valid_from", "valid_to", "issuer"]), state: permitState(d) })) },
  { name: "Site Induction Register", ref_doctype: "Digit Site Induction", report_type: "Script Report", script: S("Site Induction Register"), filters: PRJ,
    columns: [C("name", "Site Induction", "Link", "Digit Site Induction"), C("project", "Project", "Link", "Project"), C("person", "Person"), C("employee", "Employee", "Link", "Employee"),
      C("inducted_on", "Inducted On", "Date"), C("valid_until", "Valid Until", "Date"), C("approval_status", "Approval"), C("valid", "Valid Today", "Check")],
    run: (f) => inScope("Digit Site Induction", f).map((d) => ({ ...pick(d, ["project", "person", "employee", "inducted_on", "valid_until", "approval_status"]), valid: inductionValid(d) ? 1 : 0 })) },
  { name: "Maintenance Order Register", ref_doctype: "Digit Maintenance Order", report_type: "Script Report", script: S("Maintenance Order Register"), filters: [L("machinery", "Machinery", "Digit Machinery")],
    columns: [C("name", "Maintenance Order", "Link", "Digit Maintenance Order"), C("machinery", "Machinery", "Link", "Digit Machinery"), C("order_type", "Order Type"), C("status", "Status"),
      C("approval_status", "Approval"), C("work_date", "Work Date", "Date"), C("downtime_hours", "Downtime Hours", "Float"), C("cost", "Cost", "Currency"), C("next_due_date", "Next Due Date", "Date")],
    run: (f) => list("Digit Maintenance Order", (d) => !f["machinery"] || d["machinery"] === f["machinery"]).map((d) => pick(d, ["machinery", "order_type", "status", "approval_status", "work_date", "downtime_hours", "cost", "next_due_date"])) },
  { name: "Commissioning Test Register", ref_doctype: "Digit Commissioning Test", report_type: "Script Report", script: S("Commissioning Test Register"), filters: PRJ,
    columns: [C("name", "Commissioning Test", "Link", "Digit Commissioning Test"), C("project", "Project", "Link", "Project"), C("system", "System"), C("test_type", "Test Type"), C("critical", "Critical", "Check"),
      C("planned_date", "Planned Date", "Date"), C("test_date", "Test Date", "Date"), C("result", "Result"), C("witness_party", "Witness")],
    run: (f) => inScope("Digit Commissioning Test", f).map((d) => pick(d, ["project", "system", "test_type", "critical", "planned_date", "test_date", "result", "witness_party"])) },
  { name: "WIP Adjustment Register", ref_doctype: "Digit WIP Adjustment", report_type: "Script Report", script: S("WIP Adjustment Register"), filters: PRJ,
    columns: [C("name", "WIP Adjustment", "Link", "Digit WIP Adjustment"), C("project", "Project", "Link", "Project"), C("period", "Period"), C("billed", "Billed", "Currency"), C("unposted_billings", "Unposted Billings", "Currency"),
      C("earned_revenue", "Earned Revenue", "Currency"), C("over_under", "Over / Under Billing", "Currency"), C("posted_unposted_status", "Posting Status")],
    run: (f) => (finance() ? inScope("Digit WIP Adjustment", f) : []).map((d) => pick(d, ["project", "period", "billed", "unposted_billings", "earned_revenue", "over_under", "posted_unposted_status"])) },
  { name: "Override Log Register", ref_doctype: "Digit Override Log", report_type: "Script Report", script: S("Override Log Register"), filters: [L("user", "User", "User")],
    columns: [C("name", "Override Log", "Link", "Digit Override Log"), C("ref_doctype", "Document Type"), C("ref_name", "Document"), C("rule", "Rule"), C("user", "User", "Link", "User"), C("reason", "Reason"), C("creation", "Created On", "Datetime")],
    run: (f) => (finance() ? list("Digit Override Log", (d) => !f["user"] || d["user"] === f["user"]) : []).map((d) => pick(d, ["ref_doctype", "ref_name", "rule", "user", "reason", "creation"])) },
];
