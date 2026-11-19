/**
 * One row source for reports, KPI metrics and Insights: `reportRows(report, scope)` runs the app's Script Report once
 * per scope (project-required reports run for every readable construction project and stamp `project`), adds the
 * project's company when a row has none, and memoises the result per store version + session user. Cards, charts,
 * Insights tables and the report page therefore read the very same rows.
 */
import { adapter } from "@/lib/adapter";
import { currentUser } from "@/lib/session";
import { pluginsVersion } from "@/plugins/runtime";
import type { PluginReport } from "@/plugins/types";
import { CONSTRUCTION_REPORTS } from "../reports";
import { constructionProjects } from "../domain/queues";

export type Row = Record<string, unknown>;
export interface Scope { company?: string | undefined; project?: string | undefined }

export const reportByName = (name: string) => CONSTRUCTION_REPORTS.find((r) => r.name === name);
/** A report that only runs for one explicitly chosen project (filter `project` with reqd). */
export const projectRequired = (r: PluginReport) => !!r.filters?.some((f) => f.fieldname === "project" && (f as { reqd?: number }).reqd);
/** Insights table name of a report (snake case of the report name), stable across releases. */
export const tableName = (report: string) => report.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
export const reportOfTable = (table: string) => CONSTRUCTION_REPORTS.find((r) => tableName(r.name) === table);

let memoKey = ""; const memo = new Map<string, Row[]>();
const companyOf = (p: unknown) => String(adapter.get("Project", String(p ?? ""))?.["company"] ?? "");

/** Rows of a report for a scope. Project-required reports without a project run per construction project in scope. */
export function reportRows(name: string, scope: Scope = {}, extra: Record<string, unknown> = {}): Row[] {
  const r = reportByName(name); if (!r?.run) return [];
  const key = `${adapter.version()}|${currentUser()}|${pluginsVersion()}`;
  if (key !== memoKey) { memoKey = key; memo.clear(); }
  const k = `${name}|${scope.company ?? ""}|${scope.project ?? ""}|${JSON.stringify(extra)}`;
  const hit = memo.get(k); if (hit) return hit;
  const base = { ...extra, company: scope.company || undefined };
  const raw: Row[] = projectRequired(r) && !scope.project
    ? constructionProjects({ company: scope.company }).flatMap((p) => r.run!({ ...base, project: p.name }).map((x) => ({ project: p.name, ...x })))
    : r.run({ ...base, project: scope.project || undefined }).map((x) => (projectRequired(r) && scope.project ? { project: scope.project, ...x } : x));
  const out = raw.map((x) => (x["company"] || !x["project"] ? x : { ...x, company: companyOf(x["project"]) }));
  memo.set(k, out);
  return out;
}
