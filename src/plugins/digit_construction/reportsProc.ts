/**
 * Department 07 reports (owner spec catalog RPT-N20 … RPT-N25). Each runs the read model the procurement screens use
 * (domain/supply.ts, domain/procControl.ts, reportsGap.ts supplyOnTime), so a report row and a screen figure count the
 * same rows. Python scripts stay server stubs.
 */
import type { PluginReport } from "../types";
import { adjustmentsByReason, commitmentRows, matchRows, poByCostCode, poChangeLog, procFollowUpRows, supplierScorecard } from "./domain/supply";
import { supplyOnTime } from "./reportsGap";

const C = (fieldname: string, label: string, fieldtype = "Currency", options?: string) => ({ fieldname, label, fieldtype, ...(options ? { options } : {}), width: 130 });
const S = (q: string) => `# FRAPPE_SERVER_REQUIRED: the Virtual Core computes this report in digit_construction/reportsProc.ts (${q}).\n# Port it to Python and test it on staging before enabling this report.\n\n\ndef execute(filters=None):\n\tfrappe.throw("${q} is computed by the DIGIT Construction preview; the server port is pending staging.")\n`;
const L = (fieldname: string, label: string, options: string) => ({ fieldname, label, fieldtype: "Link", options });
const D = (fieldname: string, label: string) => ({ fieldname, label, fieldtype: "Date" });
const PRJ = [L("company", "Company", "Company"), L("project", "Project", "Project")];
const RANGE = [D("from_date", "From Date"), D("to_date", "To Date")];

export const PROC_REPORTS: PluginReport[] = [
  { name: "Stock Adjustments by Reason", ref_doctype: "Stock Entry", report_type: "Script Report", script: S("Stock Adjustments by Reason"), filters: [...PRJ, ...RANGE],
    columns: [C("reason", "Reason", "Link", "Digit Adjustment Reason"), C("movements", "Movements", "Int"), C("qty", "Qty", "Float"), C("value", "Value"), C("projects", "Projects", "Data")],
    run: (f) => adjustmentsByReason(f) },
  { name: "Commitments Register", ref_doctype: "Purchase Order", report_type: "Script Report", script: S("Commitments Register"), filters: [...PRJ, L("supplier", "Supplier", "Supplier")],
    columns: [C("po", "Purchase Order", "Link", "Purchase Order"), C("project", "Project", "Link", "Project"), C("supplier", "Supplier", "Link", "Supplier"), C("original", "Original"), C("changes", "Approved Changes"), C("revised", "Revised"),
      C("billed", "Billed"), C("remaining", "Remaining"), C("pending_change", "Pending Change")],
    run: (f) => commitmentRows(f) },
  { name: "PO Change Log", ref_doctype: "Digit PO Change", report_type: "Script Report", script: S("PO Change Log"), filters: PRJ,
    columns: [C("change", "Change", "Link", "Digit PO Change"), C("purchase_order", "Purchase Order", "Link", "Purchase Order"), C("reason", "Reason", "Data"), C("status", "Status", "Data"), C("item_code", "Item", "Link", "Item"),
      C("before", "Before"), C("amount_change", "Change Amount"), C("after", "After"), C("approved_by", "Approved By", "Data")],
    run: (f) => poChangeLog(f) },
  { name: "PO Detail by Cost Code", ref_doctype: "Purchase Order", report_type: "Script Report", script: S("PO Detail by Cost Code"), filters: PRJ,
    columns: [C("cost_code", "Cost Code", "Data"), C("purchase_order", "Purchase Order", "Link", "Purchase Order"), C("item_code", "Item", "Link", "Item"), C("qty", "Qty", "Float"), C("rate", "Rate"), C("amount", "Amount"),
      C("received", "Received", "Float"), C("billed", "Billed")],
    run: (f) => poByCostCode(f) },
  { name: "Match Exceptions", ref_doctype: "Purchase Invoice", report_type: "Script Report", script: S("Match Exceptions"), filters: PRJ,
    columns: [C("po", "Purchase Order", "Link", "Purchase Order"), C("item", "Item", "Link", "Item"), C("received", "Received", "Float"), C("invoiced", "Invoiced", "Float"), C("qtyPct", "Qty Var %", "Percent"),
      C("poRate", "PO Rate"), C("invRate", "Invoice Rate"), C("pricePct", "Price Var %", "Percent"), C("overTolerance", "Over Tolerance", "Check")],
    run: (f) => matchRows(f) },
  { name: "Supplier Scorecard", ref_doctype: "Supplier", report_type: "Script Report", script: S("Supplier Scorecard"), filters: RANGE,
    columns: [C("supplier", "Supplier", "Link", "Supplier"), C("orders", "Orders", "Int"), C("on_time_pct", "On-time %", "Percent"), C("rejected_pct", "Rejected %", "Percent"), C("price_variance_pct", "Price Variance %", "Percent"), C("score", "Score", "Float")],
    run: (f) => supplierScorecard(f, (x) => supplyOnTime(x)) },
  { name: "Procurement Follow-up", ref_doctype: "Digit PO Change", report_type: "Script Report", script: S("Procurement Follow-up"), filters: PRJ,
    columns: [C("doctype", "Document Type", "Data"), C("document", "Document", "Dynamic Link", "doctype"), C("project", "Project", "Link", "Project"), C("since", "Waiting Since", "Date"), C("reminder_on", "Reminder On", "Date"),
      C("escalate_on", "Escalate On", "Date"), C("escalate_to", "Escalated To", "Data"), C("state", "Follow-up", "Data"), C("ruling", "Ruling", "Data")],
    run: (f) => procFollowUpRows(f) },
];
