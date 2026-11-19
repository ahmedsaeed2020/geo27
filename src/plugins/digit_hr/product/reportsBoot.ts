/**
 * Registers the HR report library on the shared report page (CORE_REPORT_ENTRIES + RUNNERS). Loaded from the HR boot
 * module (after the adapter), never from the manifest, so the report runner is not pulled into the catalog import graph.
 */
import type { ReportEntry } from "@/lib/catalog";
import { CORE_REPORT_ENTRIES } from "@/lib/coreShared/coreReportEntries";
import { RUNNERS } from "@/lib/reportRunner";
import type { Runner } from "@/lib/reportKit";
import { HR_REPORTS, type HrReport } from "./reports";

const entry = (r: HrReport): ReportEntry => ({ app: "hrms", name: r.name, ref_doctype: r.ref, report_type: "Script Report", module: "HR", source: `digit_hr:product/reports.ts ${r.id}`, status: "core", columns: [], has_query: false, has_py_execute: true, roles: r.roles,
  filters: r.filters.map((f) => ({ fieldname: f.fieldname, label: f.label, fieldtype: f.fieldtype, ...(typeof f.options === "string" ? { options: f.options } : {}), reqd: false })) } as ReportEntry);
let done = false;
/** Register the library once (HR boot): entries on the report list, runners on the report page. */
export function registerHrReports(): void {
  if (done) return; done = true;
  for (const r of HR_REPORTS) {
    if (!CORE_REPORT_ENTRIES.some((x) => x.name === r.name)) CORE_REPORT_ENTRIES.push(entry(r));
    const runner: Runner = { src: `digit_hr/product/reports.ts ${r.id}`, filters: r.filters, run: r.run };
    RUNNERS[r.name] = runner;
  }
}
registerHrReports();
