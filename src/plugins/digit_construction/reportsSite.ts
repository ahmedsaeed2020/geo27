/**
 * Department 02 reports (owner spec catalog RPT-N05, N07, N09, N10, N11). Each runs the domain/site.ts read model the
 * screens use, so a report row and the matching card count the same records. Python scripts stay server stubs.
 */
import type { PluginReport } from "../types";
import { defectRegister, drawingRegister, lookaheadMissReasons, reviewStatusRows, wbsCoverage } from "./domain/site";

const C = (fieldname: string, label: string, fieldtype = "Data", options?: string) => ({ fieldname, label, fieldtype, ...(options ? { options } : {}), width: 130 });
const S = (q: string) => `# FRAPPE_SERVER_REQUIRED: the Virtual Core computes this report in digit_construction/domain/site.ts (${q}).\n# Port it to Python and test it on staging before enabling this report.\n\n\ndef execute(filters=None):\n\tfrappe.throw("${q} is computed by the DIGIT Construction screens")\n`;
const P = { fieldname: "project", label: "Project", fieldtype: "Link", options: "Project" };

export const SITE_REPORTS: PluginReport[] = [
  { name: "WBS Structure & Task Coverage", ref_doctype: "Digit WBS Version", report_type: "Script Report", script: S("wbs coverage"),
    filters: [{ ...P, reqd: 1 } as never, { fieldname: "version", label: "Version", fieldtype: "Link", options: "Digit WBS Version" }],
    columns: [C("code", "Code"), C("title", "Title"), C("node_type", "Type"), C("work_package", "Work Package", "Link", "Digit Work Package"), C("task", "Task", "Link", "Task"), C("boq_item", "BOQ Item"), C("budget_line", "Budget Line"), C("covered", "Covered", "Check")],
    run: (f) => (f["project"] ? wbsCoverage(String(f["project"]), f["version"] ? String(f["version"]) : undefined).nodes : []) },
  { name: "Lookahead Reasons for Non-completion", ref_doctype: "Digit Lookahead", report_type: "Script Report", script: S("lookahead miss reasons"), filters: [P],
    columns: [C("week", "Week", "Date"), C("reason", "Reason"), C("count", "Count", "Int"), C("pct_of_misses", "% of Misses", "Percent"), C("lookaheads", "Lookaheads")],
    run: (f) => lookaheadMissReasons(f) },
  { name: "Drawing Register", ref_doctype: "Digit Drawing", report_type: "Script Report", script: S("drawing register"),
    filters: [P, { fieldname: "discipline", label: "Discipline", fieldtype: "Select", options: "\nArchitecture\nStructure\nMEP\nCivil\nSurvey\nOther\nLAND" }],
    columns: [C("drawing", "Drawing", "Link", "Digit Drawing"), C("drawing_no", "Drawing No"), C("title", "Title"), C("discipline", "Discipline"), C("current_revision", "Current Rev"), C("issue_date", "Issue Date", "Date"), C("purpose", "Purpose"), C("status", "Status")],
    run: (f) => drawingRegister(f) },
  { name: "Workflow Review Status", ref_doctype: "Digit Review Workflow", report_type: "Script Report", script: S("review status"),
    filters: [P, { fieldname: "reviewer", label: "Reviewer", fieldtype: "Link", options: "User" }],
    columns: [C("workflow", "Workflow", "Link", "Digit Review Workflow"), C("document", "Document"), C("step", "Step", "Int"), C("reviewer", "Reviewer", "Link", "User"), C("due", "Due", "Date"), C("status", "Status"), C("days_late", "Days Late", "Int"), C("outcome", "Outcome")],
    run: (f) => reviewStatusRows(f) },
  { name: "Defects & NCR Register", ref_doctype: "Digit Defect", report_type: "Script Report", script: S("defect register"),
    filters: [P, { fieldname: "severity", label: "Severity", fieldtype: "Select", options: "\nCritical\nMajor\nMinor" }, { fieldname: "status", label: "Status", fieldtype: "Select", options: "\nOpen\nIn Progress\nReady to Inspect\nClosed\nDisputed" },
      { fieldname: "responsible", label: "Responsible", fieldtype: "Select", options: "\nOwn Forces\nSubcontractor\nSupplier" }],
    columns: [C("defect", "Defect", "Link", "Digit Defect"), C("defect_type", "Type"), C("severity", "Severity"), C("location", "Location"), C("responsible", "Responsible"), C("status", "Status"), C("due_date", "Due", "Date"), C("days_open", "Days Open", "Int"), C("backcharge", "Back-charge", "Currency")],
    run: (f) => defectRegister(f) },
];
