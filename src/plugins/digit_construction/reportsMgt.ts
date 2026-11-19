/**
 * Run 6 management reports. RPT-MGT-04 Decision Follow-up: one row per workflow decision event (domain/followup.ts),
 * opening the decided document, with the counts of follow-up assignments explicitly linked to it. No SLA, response
 * target or compliance status (owner decision OD-27); "past due" is the ToDo's own due date.
 */
import type { PluginReport } from "../types";
import { CONSTRUCTION_WORKFLOWS } from "./workflows";
import { DECISIONS } from "./reportsGap";
import { decisionFollowUpRows } from "./domain/followup";
import { milestoneRows, portfolioExposure, riskRegister, scenarioComparison } from "./domain/mgt";

const C = (fieldname: string, label: string, fieldtype = "Data", options?: string) => ({ fieldname, label, fieldtype, ...(options ? { options } : {}), width: 130 });
const S = (q: string) => `# FRAPPE_SERVER_REQUIRED: the Virtual Core computes this report in digit_construction/domain/followup.ts (${q}).\n# Port it to Python and test it on staging before enabling this report.\n\n\ndef execute(filters=None):\n\tfrappe.throw(_("This report is not implemented on the server yet"))\n`;

export const MGT_REPORTS: PluginReport[] = [
  { name: "Decision Follow-up", ref_doctype: "Project", report_type: "Script Report", script: S("decision follow-up"),
    filters: [
      { fieldname: "company", label: "Company", fieldtype: "Link", options: "Company" }, { fieldname: "project", label: "Project", fieldtype: "Link", options: "Project" },
      { fieldname: "from_date", label: "From Date", fieldtype: "Date" }, { fieldname: "to_date", label: "To Date", fieldtype: "Date" },
      { fieldname: "decision", label: "Decision", fieldtype: "Select", options: ["", ...DECISIONS].join("\n") },
      { fieldname: "document_type", label: "Document Type", fieldtype: "Select", options: ["", ...new Set(CONSTRUCTION_WORKFLOWS.map((w) => w.document_type))].join("\n") },
    ],
    columns: [C("decided_on", "Decided On", "Date"), C("decision", "Decision"), C("source_doctype", "Source Type"), C("source", "Source Document", "Dynamic Link", "source_doctype"), C("row_no", "Row", "Int"),
      C("title", "Title"), C("project", "Project", "Link", "Project"), C("from_state", "From State"), C("to_state", "To State"), C("decided_by", "Decided By", "Link", "User"), C("action_basis", "Decision Basis"),
      C("current_state", "Current State"), C("current_reason", "Reason on Document (current value)"), C("followups", "Follow-ups Linked", "Int"), C("open_followups", "Open Follow-ups", "Int"),
      C("past_due_followups", "Follow-ups Past Due Date", "Int"), C("followup_state", "Follow-up Status"), C("other_open_assignments", "Other Open Assignments (not linked)", "Int"), C("decision_log", "Decision Log Entry", "Link", "Comment")],
    run: (f) => decisionFollowUpRows(f) },
  // Department 01 (spec catalog RPT-N01 … RPT-N04), read models in domain/mgt.ts
  { name: "Portfolio Scenario Comparison", ref_doctype: "Digit Portfolio Scenario", report_type: "Script Report", script: S("portfolio scenario comparison, domain/mgt.ts scenarioComparison"),
    filters: [{ fieldname: "company", label: "Company", fieldtype: "Link", options: "Company" }, { fieldname: "plan_year", label: "Plan Year", fieldtype: "Int" }],
    columns: [C("scenario", "Scenario", "Link", "Digit Portfolio Scenario"), C("title", "Title"), C("plan_year", "Plan Year", "Int"), C("status", "Status"), C("weighted_revenue", "Weighted Revenue", "Currency"), C("cost", "Cost", "Currency"),
      C("margin_pct", "Margin %", "Percent"), C("peak_negative_cash", "Peak Negative Cash", "Currency"), C("projects", "Projects", "Int"), C("based_on", "Based On", "Link", "Digit Portfolio Scenario")],
    run: (f) => scenarioComparison(f) },
  { name: "Portfolio Exposure", ref_doctype: "Project", report_type: "Script Report", script: S("portfolio exposure, domain/mgt.ts portfolioExposure"),
    filters: [{ fieldname: "company", label: "Company", fieldtype: "Link", options: "Company" }, { fieldname: "as_of", label: "As Of", fieldtype: "Date" }],
    columns: [C("project", "Project", "Link", "Project"), C("change_exposure", "Change Exposure", "Currency"), C("disputes_gap", "Disputes Gap", "Currency"), C("forecast_overrun", "Forecast Overrun", "Currency"),
      C("receivables_90", "Receivables > 90d", "Currency"), C("total_exposure", "Total Exposure", "Currency"), C("pct", "Exposure % of Contract", "Percent")],
    run: (f) => portfolioExposure(f).map(({ changes: _c, disputes: _d, invoices: _i, ...r }) => r) },
  { name: "Risk Register", ref_doctype: "Digit Risk", report_type: "Script Report", script: S("risk register, domain/mgt.ts riskRegister"),
    filters: [{ fieldname: "company", label: "Company", fieldtype: "Link", options: "Company" }, { fieldname: "project", label: "Project", fieldtype: "Link", options: "Project" },
      { fieldname: "status", label: "Status", fieldtype: "Select", options: "\nProposed\nOpen\nRejected\nActive\nManaged\nImpacted" }, { fieldname: "category", label: "Category", fieldtype: "Select", options: "\nCommercial\nTechnical\nSchedule\nHSE\nSupply\nOther" }],
    columns: [C("risk", "Risk", "Link", "Digit Risk"), C("title", "Title"), C("project", "Project", "Link", "Project"), C("category", "Category"), C("owner", "Owner", "Link", "User"), C("status", "Status"), C("score", "Score", "Int"),
      C("probability_pct", "Probability %", "Percent"), C("potential_cost", "Potential Cost", "Currency"), C("cost_exposure", "Cost Exposure", "Currency"), C("review_date", "Review Date", "Date"), C("change_event", "Change Event", "Link", "Digit Change Event")],
    run: (f) => riskRegister(f) },
  { name: "Milestone Summary", ref_doctype: "Task", report_type: "Script Report", script: S("milestone summary, domain/mgt.ts milestoneRows"),
    filters: [{ fieldname: "project", label: "Project", fieldtype: "Link", options: "Project" }, { fieldname: "only_contract", label: "Contract Milestones Only", fieldtype: "Check" }],
    columns: [C("project", "Project", "Link", "Project"), C("task", "Milestone", "Link", "Task"), C("milestone", "Milestone Title"), C("locked_deadline", "Locked Deadline", "Date"), C("expected_finish", "Expected Finish", "Date"),
      C("actual_finish", "Actual Finish", "Date"), C("variance_days", "Variance (days)", "Int"), C("status", "Status")],
    run: (f) => milestoneRows(f) as unknown as Record<string, unknown>[] },
];
