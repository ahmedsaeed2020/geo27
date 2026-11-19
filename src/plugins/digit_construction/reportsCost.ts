/**
 * Department 06 reports (owner spec catalog RPT-N16 … RPT-N19, F06-03-1 revised and potential budget, F06-13-1 earned
 * revenue). Each runs the read model the cost screens use (domain/costControl.ts), so a report row and a KPI card
 * count the same rows. Python scripts stay server stubs.
 */
import type { PluginReport } from "../types";
import { costFollowUpRows, earnedRevenueRows, marginFadeRows, overrunRows, payItemMarginRows, revisedPotentialRows, unregisteredCodeRows } from "./domain/costControl";

const C = (fieldname: string, label: string, fieldtype = "Currency", options?: string) => ({ fieldname, label, fieldtype, ...(options ? { options } : {}), width: 130 });
const S = (q: string) => `# FRAPPE_SERVER_REQUIRED: the Virtual Core computes this report in digit_construction/reportsCost.ts (${q}).\n# Port it to Python and test it on staging before enabling this report.\n\n\ndef execute(filters=None):\n\tfrappe.throw("${q} is computed by the DIGIT Construction preview; the server report is not enabled yet.")\n`;
const L = (fieldname: string, label: string, options: string) => ({ fieldname, label, fieldtype: "Link", options });
const PRJ = [L("company", "Company", "Company"), L("project", "Project", "Project")];

export const COST_REPORTS: PluginReport[] = [
  { name: "Unregistered Cost Codes", ref_doctype: "Digit Cost Code", report_type: "Script Report", script: S("Unregistered Cost Codes"), filters: PRJ,
    columns: [C("project", "Project", "Link", "Project"), C("cost_code", "Cost Code", "Data"), C("source_doctype", "Source DocType", "Data"), C("document", "Document", "Dynamic Link", "source_doctype"), C("row", "Row", "Int"), C("amount", "Amount")],
    run: (f) => unregisteredCodeRows(f) },
  { name: "Budget Overruns", ref_doctype: "Digit Project Cost Budget", report_type: "Script Report", script: S("Budget Overruns"), filters: PRJ,
    columns: [C("project", "Project", "Link", "Project"), C("cost_code", "Cost Code", "Data"), C("description", "Description", "Data"), C("revised", "Revised"), C("committed", "Committed"), C("actual", "Actual"), C("over", "Over By"), C("pct", "Over %", "Percent")],
    run: (f) => overrunRows(f) },
  { name: "Revised and Potential Budget", ref_doctype: "Digit Budget Revision", report_type: "Script Report", script: S("Revised and Potential Budget"), filters: PRJ,
    columns: [C("project", "Project", "Link", "Project"), C("budget", "Budget", "Link", "Digit Project Cost Budget"), C("cost_code", "Cost Code", "Data"), C("description", "Description", "Data"), C("original", "Original Budget"), C("revisions", "Approved Revisions"),
      C("transfers", "Net Transfers"), C("revised", "Revised Budget"), C("pending", "Pending Revisions"), C("potential", "Potential Budget")],
    run: (f) => revisedPotentialRows(f) },
  { name: "Pay Item Margin", ref_doctype: "Digit Client Contract", report_type: "Script Report", script: S("Pay Item Margin"), filters: [L("contract", "Contract", "Digit Client Contract"), ...PRJ],
    columns: [C("contract", "Contract", "Link", "Digit Client Contract"), C("sov_line", "SOV Line", "Data"), C("description", "Description", "Data"), C("revised_amount", "Revised Amount"), C("links", "Linked Budget Lines", "Int"), C("linked_eac", "Linked EAC"),
      C("margin", "Margin"), C("margin_pct", "Margin %", "Percent"), C("certified", "Certified"), C("actual", "Actual"), C("earned_margin", "Earned Margin")],
    run: (f) => payItemMarginRows(f) },
  { name: "Earned Revenue by Pay Item", ref_doctype: "Digit Client Contract", report_type: "Script Report", script: S("Earned Revenue by Pay Item"), filters: [L("contract", "Contract", "Digit Client Contract"), ...PRJ],
    columns: [C("contract", "Contract", "Link", "Digit Client Contract"), C("sov_line", "SOV Line", "Data"), C("description", "Description", "Data"), C("rule", "Earned Rule", "Data"), C("value", "Revised Amount"), C("progress_pct", "Progress %", "Percent"),
      C("certified", "Certified"), C("percent_earned", "Percent Complete", "Percent"), C("percent_earned_amount", "Earned at Percent Complete"), C("cost_to_cost", "Cost-to-Cost"), C("start_earned", "Start"), C("finish_earned", "Finish"), C("earned_by_rule", "Earned by Rule"), C("booked", "Booked Revenue (certified)")],
    run: (f) => earnedRevenueRows(f) },
  { name: "Margin Fade", ref_doctype: "Digit Cost Forecast Snapshot", report_type: "Script Report", script: S("Margin Fade"), filters: PRJ,
    columns: [C("project", "Project", "Link", "Project"), C("snapshot", "Snapshot", "Link", "Digit Cost Forecast Snapshot"), C("period", "Period", "Data"), C("revised_contract", "Revised Contract"), C("eac", "EAC"), C("margin", "Margin"),
      C("margin_pct", "Margin %", "Percent"), C("fade", "Fade vs Previous (points)", "Float"), C("revenue_effect", "Revenue Effect (points)", "Float"), C("cost_effect", "Cost Effect (points)", "Float")],
    run: (f) => marginFadeRows(f) },
  { name: "Cost Approval Follow-up", ref_doctype: "Digit Project Cost Budget", report_type: "Script Report", script: S("Cost Approval Follow-up"), filters: PRJ,
    columns: [C("doctype", "Document Type", "Data"), C("document", "Document", "Dynamic Link", "doctype"), C("project", "Project", "Link", "Project"), C("since", "Waiting Since", "Date"), C("reminder_on", "Reminder On", "Date"),
      C("escalate_on", "Escalate On", "Date"), C("escalate_to", "Escalated To", "Data"), C("state", "Follow-up", "Data"), C("ruling", "Ruling", "Data")],
    run: (f) => costFollowUpRows(f) },
];
