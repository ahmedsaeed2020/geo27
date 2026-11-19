/**
 * Read-only Insights data source `digit_construction`: one table per Construction Script Report (tableName), rows =
 * reportRows(report) for the session user (construction projects only, scoped reads). Registered through the Core
 * provider registry (src/lib/insights.ts registerDataSource), so Insights queries, charts and dashboards analyse the same
 * rows as the app's reports and KPI cards. Nothing is stored; when the app is disabled the source has no tables.
 */
import { columnsOf, registerDataSource } from "@/lib/insights";
import { isEnabled } from "@/plugins/runtime";
import { CONSTRUCTION_REPORTS } from "../reports";
import { APP } from "../domain/data";
import { reportOfTable, reportRows, tableName } from "./reportRows";

export const DATA_SOURCE = "digit_construction";
const flat = (r: Record<string, unknown>) => Object.fromEntries(Object.entries(r).filter(([k, v]) => !k.startsWith("__") && (typeof v !== "object" || v === null)));

export function constructionTable(table: string) {
  if (!isEnabled(APP)) return null;
  const r = reportOfTable(table); if (!r) return null;
  const rows = reportRows(r.name).map(flat);
  return { columns: columnsOf(rows, [...r.columns.map((c) => c.fieldname), "company"]), rows };
}
let done = false;
export function registerConstructionDataSource() {
  if (done) return; done = true;
  registerDataSource(DATA_SOURCE, { title: "DIGIT Construction (read models)", tables: () => (isEnabled(APP) ? CONSTRUCTION_REPORTS.map((r) => tableName(r.name)) : []), table: constructionTable });
}
