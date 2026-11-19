/**
 * Department 04 reports (owner spec catalog RPT-N15 change exposure by stage, F04-09-2 change chain). Each runs the
 * read model the commercial screens use (domain/changes.ts eventStage, domain/commercial.ts changeChain), so a report
 * row and the document figures count the same records. Python scripts stay server stubs.
 */
import type { PluginReport } from "../types";
import { eventStage, EVENT_STAGES } from "./domain/changes";
import { changeChain } from "./domain/commercial";
import { num, r2 } from "./domain/calc";
import { list, today } from "./domain/data";
import { constructionProjects } from "./domain/queues";

const C = (fieldname: string, label: string, fieldtype = "Data", options?: string) => ({ fieldname, label, fieldtype, ...(options ? { options } : {}), width: 130 });
const S = (q: string) => `# FRAPPE_SERVER_REQUIRED: the Virtual Core computes this report in digit_construction/reportsCommercial.ts (${q}).\n# Port it to Python and test it on staging before enabling this report.\n\n\ndef execute(filters=None):\n\tfrappe.throw("${q} is computed by the DIGIT Construction preview; the server port is pending staging.")\n`;
const L = (fieldname: string, label: string, options: string, reqd = 0) => ({ fieldname, label, fieldtype: "Link", options, ...(reqd ? { reqd: 1 } : {}) });
const day = (v: unknown) => String(v ?? "").slice(0, 10);

/** RPT-N15: one row per change event — stage, scope, cost / revenue ROM, variation, age in days since the event date. */
export function changeExposureStages(f: Record<string, unknown>, on = today()) {
  const ps = new Set(constructionProjects({ company: (f["company"] as string) || undefined, project: (f["project"] as string) || undefined }).map((p) => p.name));
  return list("Digit Change Event", (d) => ps.has(String(d["project"] ?? "")))
    .map((d) => {
      const from = day(d["ce_date"]) || day(d["creation"]);
      return { change_event: d.name, title: d["title"] ?? "", stage: eventStage(d), scope: d["scope"] || "Not Determined", cost_rom: r2(num(d["total_cost_rom"])), revenue_rom: r2(num(d["total_revenue_rom"])),
        variation: d["variation"] || d["associated_variation"] || "", age_days: from ? Math.max(0, Math.round((Date.parse(on) - Date.parse(from)) / 86400000)) : null };
    })
    .filter((r) => !f["stage"] || r.stage === f["stage"])
    .sort((a, b) => EVENT_STAGES.indexOf(a.stage) - EVENT_STAGES.indexOf(b.stage) || a.change_event.localeCompare(b.change_event));
}

export const COMMERCIAL_REPORTS: PluginReport[] = [
  { name: "Change Exposure by Stage", ref_doctype: "Digit Change Event", report_type: "Script Report", script: S("change exposure by stage"),
    filters: [L("company", "Company", "Company"), L("project", "Project", "Project"), { fieldname: "stage", label: "Stage", fieldtype: "Select", options: ["", ...EVENT_STAGES].join("\n") }] as never,
    columns: [C("change_event", "Change Event", "Link", "Digit Change Event"), C("stage", "Stage"), C("scope", "Scope"), C("cost_rom", "Cost ROM", "Currency"), C("revenue_rom", "Revenue ROM", "Currency"), C("variation", "Variation", "Link", "Digit Client Variation"), C("age_days", "Age", "Int")],
    run: (f) => changeExposureStages(f) },
  { name: "Change Chain", ref_doctype: "Digit Change Event", report_type: "Script Report", script: S("change chain"),
    filters: [L("change_event", "Change Event", "Digit Change Event", 1)] as never,
    columns: [C("doctype", "Document Type"), C("document", "Document", "Dynamic Link", "doctype"), C("state", "Status"), C("amount", "Amount", "Currency"), C("measure", "Figure")],
    run: (f) => (f["change_event"] ? changeChain(String(f["change_event"])) as never : []) },
];
