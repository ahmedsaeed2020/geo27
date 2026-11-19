/**
 * Report contract registry (P5). Classifies every indexed report by how it can actually run in the Virtual Core:
 * LOCAL_VIRTUAL_REPORT (a registered local runner or a Report Builder over ref_doctype rows), SERVER_QUERY_REQUIRED /
 * SERVER_SCRIPT_REQUIRED (source SQL / Python execute() without a local port), SOURCE_METADATA_ONLY (no runnable
 * definition) and INSIGHTS_SERVER_REQUIRED (Insights queries/data sources need the Insights server).
 */
import type { ReportEntry } from "./catalog";

export type ReportClass = "LOCAL_VIRTUAL_REPORT" | "SOURCE_METADATA_ONLY" | "SERVER_QUERY_REQUIRED" | "SERVER_SCRIPT_REQUIRED" | "INSIGHTS_SERVER_REQUIRED";
export interface ReportContract {
  name: string; app: string; module: string; primary_doctype: string | null; related_doctypes: string[]; filters: ReportEntry["filters"];
  columns: unknown[]; calculation: string; roles: string[]; execution: ReportClass; drill_down: "DOCUMENT_ROWS" | "RUNNER_ROWS" | "NONE"; source: string; route: string | null;
}
type RunnerLike = { src?: string | undefined; filters?: { fieldname: string; fieldtype?: string | undefined; options?: string | string[] | undefined }[] | undefined };

export function reportClass(r: Pick<ReportEntry, "app" | "report_type" | "has_query" | "has_py_execute" | "ref_doctype">, hasRunner: boolean): ReportClass {
  if (String(r.app) === "insights") return "INSIGHTS_SERVER_REQUIRED";
  if (hasRunner) return "LOCAL_VIRTUAL_REPORT";
  // Report Builder = saved columns/filters over ref_doctype rows: the generic runner reads the same scoped records
  if (r.report_type === "Report Builder") return r.ref_doctype ? "LOCAL_VIRTUAL_REPORT" : "SOURCE_METADATA_ONLY";
  if (r.report_type === "Query Report") return r.has_query ? "SERVER_QUERY_REQUIRED" : "SOURCE_METADATA_ONLY";
  if (r.report_type === "Script Report") return r.has_py_execute ? "SERVER_SCRIPT_REQUIRED" : "SOURCE_METADATA_ONLY";
  return "SOURCE_METADATA_ONLY";
}
export function reportContract(r: ReportEntry, runner?: RunnerLike): ReportContract {
  const execution = reportClass(r, !!runner);
  const linkTargets = [...(runner?.filters ?? []), ...(r.filters ?? [])].filter((f) => f.fieldtype === "Link" && f.options).map((f) => String(f.options));
  const colTargets = (r.columns ?? []).flatMap((c) => (c && typeof c === "object" && (c as { fieldtype?: string }).fieldtype === "Link" && (c as { options?: string }).options ? [String((c as { options?: string }).options)] : []));
  return { name: r.name, app: r.app, module: r.module, primary_doctype: r.ref_doctype ?? null,
    related_doctypes: [...new Set([...linkTargets, ...colTargets])].filter((d) => d !== r.ref_doctype).sort(), filters: r.filters ?? [], columns: r.columns ?? [],
    calculation: runner?.src ? `local port of ${runner.src} (src/lib/reportRunner.ts)` : r.report_type === "Report Builder" ? `ref_doctype rows (${r.ref_doctype}) with saved Report Builder JSON` : r.has_query ? "source SQL query" : r.has_py_execute ? `${r.source.replace(/\.json$/, ".py")} execute()` : "no runnable definition",
    roles: r.roles ?? [], execution, drill_down: execution !== "LOCAL_VIRTUAL_REPORT" ? "NONE" : runner ? "RUNNER_ROWS" : "DOCUMENT_ROWS", source: r.source,
    route: execution === "LOCAL_VIRTUAL_REPORT" ? `/report/${r.name}` : null };
}
export function reportsForDocType(reports: ReportEntry[], dt: string, runners: Record<string, RunnerLike>): ReportContract[] {
  return reports.filter((r) => r.ref_doctype === dt).map((r) => reportContract(r, runners[r.name]));
}
export function reportCoverage(reports: ReportEntry[], runners: Record<string, RunnerLike>): Record<ReportClass, number> {
  const out = { LOCAL_VIRTUAL_REPORT: 0, SOURCE_METADATA_ONLY: 0, SERVER_QUERY_REQUIRED: 0, SERVER_SCRIPT_REQUIRED: 0, INSIGHTS_SERVER_REQUIRED: 0 } as Record<ReportClass, number>;
  for (const r of reports) out[reportClass(r, !!runners[r.name])]++;
  return out;
}
/** Insights objects (optional source) that hold queries/data sources: always INSIGHTS_SERVER_REQUIRED for real execution. */
export const INSIGHTS_QUERY_DOCTYPES = ["Insights Query v3", "Insights Data Source v3", "Insights Chart v3", "Insights Dashboard v3", "Insights Workbook", "Insights Table v3"];
