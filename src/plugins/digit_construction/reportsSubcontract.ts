/**
 * Department 05 reports (owner spec catalog FT-05-01 compliance, DEC-069 measurement evidence, DEC-064 compliance
 * shown as information on payables). Each runs the read model the subcontract screens use (domain/subcontract.ts),
 * so a report row and the document figures count the same records. Python scripts stay server stubs.
 */
import type { PluginReport } from "../types";
import { complianceOf, evidenceCounts, profileOf } from "./domain/subcontract";
import { list, today } from "./domain/data";
import { constructionProjects } from "./domain/queues";

const C = (fieldname: string, label: string, fieldtype = "Data", options?: string) => ({ fieldname, label, fieldtype, ...(options ? { options } : {}), width: 130 });
const S = (q: string) => `# FRAPPE_SERVER_REQUIRED: the Virtual Core computes this report in digit_construction/reportsSubcontract.ts (${q}).\n# Port it to Python and test it on staging before enabling this report.\n\n\ndef execute(filters=None):\n\tfrappe.throw("${q} is computed by the DIGIT Construction preview; the server port is pending staging.")\n`;
const L = (fieldname: string, label: string, options: string) => ({ fieldname, label, fieldtype: "Link", options });

/** F05-01-1: every subcontractor profile with its compliance status today, the expired and the expiring documents. */
export function complianceRows(f: Record<string, unknown>, on = today()) {
  return list("Digit Subcontractor Profile", (p) => !f["supplier"] || p["supplier"] === f["supplier"]).map((p) => {
    const c = complianceOf(p, on);
    return { profile: p.name, supplier: p["supplier"], status: c.status, expired: c.expired.join(", "), expiring: c.expiring.join(", "), max_contract_value: p["max_contract_value"] ?? null };
  }).filter((r) => !f["status"] || r.status === f["status"]).sort((a, b) => String(a.profile).localeCompare(String(b.profile)));
}
/** DEC-069: evidence per measurement book — entries, accepted, rejected, pending and the missing-evidence count. */
export function evidenceRows(f: Record<string, unknown>) {
  const ps = new Set(constructionProjects({ company: (f["company"] as string) || undefined, project: (f["project"] as string) || undefined }).map((p) => p.name));
  return list("Digit Measurement Book", (b) => ps.has(String(b["project"] ?? "")) && (!f["work_order"] || b["work_order"] === f["work_order"]))
    .map((b) => ({ measurement_book: b.name, work_order: b["work_order"], subcontractor: b["subcontractor"], status: b["workflow_state"], compliance: complianceOf(profileOf(b["subcontractor"])).status, ...evidenceCounts(b) }))
    .sort((a, b) => a.measurement_book.localeCompare(b.measurement_book));
}
export const SUBCONTRACT_REPORTS: PluginReport[] = [
  { name: "Subcontractor Compliance", ref_doctype: "Digit Subcontractor Profile", report_type: "Script Report", script: S("Subcontractor Compliance"),
    filters: [L("supplier", "Subcontractor", "Supplier"), { fieldname: "status", label: "Compliance", fieldtype: "Select", options: "\nCompliant\nExpiring\nNon-compliant" }],
    columns: [C("profile", "Subcontractor Profile", "Link", "Digit Subcontractor Profile"), C("supplier", "Subcontractor", "Link", "Supplier"), C("status", "Compliance"), C("expired", "Expired Documents"), C("expiring", "Expiring within 30 days"), C("max_contract_value", "Max Contract Value", "Currency")],
    run: (f) => complianceRows(f) },
  { name: "Measurement Evidence", ref_doctype: "Digit Measurement Book", report_type: "Script Report", script: S("Measurement Evidence"),
    filters: [L("company", "Company", "Company"), L("project", "Project", "Project"), L("work_order", "Work Order", "Digit Subcontract Work Order")],
    columns: [C("measurement_book", "Measurement Book", "Link", "Digit Measurement Book"), C("work_order", "Work Order", "Link", "Digit Subcontract Work Order"), C("subcontractor", "Subcontractor", "Link", "Supplier"), C("status", "Status"), C("compliance", "Compliance"),
      C("entries", "Entries", "Int"), C("accepted", "Evidence Accepted", "Int"), C("rejected", "Evidence Rejected", "Int"), C("pending", "Evidence Pending", "Int"), C("missing", "Missing Evidence", "Int")],
    run: (f) => evidenceRows(f) },
];
