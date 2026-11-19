/**
 * Department 03 reports (owner spec catalog RPT-N12, N13, N14). Each runs the domain/tendering.ts read model the
 * estimating screens use, so a report row and the form figures count the same records. Python scripts stay server stubs.
 */
import type { PluginReport } from "../types";
import { estimateResourceSummary, levelingCells, levelingSummary, takeoffComparison } from "./domain/tendering";
import { asSystem, list, rows } from "./domain/data";

const C = (fieldname: string, label: string, fieldtype = "Data", options?: string) => ({ fieldname, label, fieldtype, ...(options ? { options } : {}), width: 130 });
const S = (q: string) => `# FRAPPE_SERVER_REQUIRED: the Virtual Core computes this report in digit_construction/domain/tendering.ts (${q}).\n# Port it to Python and test it on staging before enabling this report.\n\n\ndef execute(filters=None):\n\tfrappe.throw("${q} is computed by the DIGIT Construction preview; the server port is pending staging.")\n`;
const L = (fieldname: string, label: string, options: string, reqd = 0) => ({ fieldname, label, fieldtype: "Link", options, ...(reqd ? { reqd: 1 } : {}) });

export const EST_REPORTS: PluginReport[] = [
  { name: "Takeoff Revision Comparison", ref_doctype: "Digit Takeoff Sheet", report_type: "Script Report", script: S("takeoff revision comparison"),
    filters: [L("tender", "Tender", "Digit Tender"), L("old_sheet", "Old Sheet", "Digit Takeoff Sheet", 1), L("new_sheet", "New Sheet", "Digit Takeoff Sheet", 1)] as never,
    columns: [C("item", "Item"), C("old_qty", "Old Qty", "Float"), C("new_qty", "New Qty", "Float"), C("delta_qty", "Δ Qty", "Float"), C("selling_rate", "Selling Rate", "Currency"), C("delta_value", "Δ Value", "Currency")],
    run: (f) => (f["old_sheet"] && f["new_sheet"] ? takeoffComparison(String(f["old_sheet"]), String(f["new_sheet"])) : []) },
  { name: "Estimate Resource Summary", ref_doctype: "Digit Estimate Version", report_type: "Script Report", script: S("estimate resource summary"),
    filters: [L("estimate_version", "Estimate Version", "Digit Estimate Version", 1)] as never,
    columns: [C("resource_type", "Resource Type"), C("cost", "Cost", "Currency"), C("pct_of_total", "% of Total", "Percent"), C("man_hours", "Man-hours", "Float")],
    run: (f) => (f["estimate_version"] ? estimateResourceSummary(String(f["estimate_version"])) : []) },
  { name: "Bid Leveling Summary", ref_doctype: "Digit Bid Package", report_type: "Script Report", script: S("bid leveling summary"),
    filters: [L("bid_package", "Bid Package", "Digit Bid Package", 1)] as never,
    columns: [C("supplier", "Supplier", "Link", "Supplier"), C("submitted_total", "Submitted Total", "Currency"), C("excluded", "Excluded", "Int"), C("plugs", "Plugs", "Currency"), C("leveled_total", "Leveled Total", "Currency"), C("rank", "Rank", "Int"), C("exclusions", "Exclusions")],
    run: (f) => {
      if (!f["bid_package"]) return [];
      const lev = asSystem(() => list("Digit Bid Leveling", (l) => l["bid_package"] === f["bid_package"]))[0];
      return levelingSummary(levelingCells(f["bid_package"], rows(lev, "cells")), f["bid_package"]) as never;
    } },
];
