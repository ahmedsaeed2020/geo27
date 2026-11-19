import { isServerHosted } from "@/lib/serverHost";
/**
 * Seeds the DIGIT Construction Insights workbook (DCON-WB): the `digit_construction` data source record, one Query v3 per
 * report table, one Number chart per charted metric (DCON-C-M-<metric id>), the catalog charts and twelve Dashboard v3
 * records. Insert-if-missing; a record is refreshed to a newer definition only while it is still exactly what this
 * seeder wrote (`__dcon_seed` signature), so edits made in Insights are never overwritten. Analysis records only — no
 * business record and no ledger value is created here.
 */
import { adapter, type Doc } from "@/lib/adapter";
import { measureOf, toRules } from "./metrics";
import { CHARTED_METRICS, CHARTS, DASHBOARDS, WORKBOOK, metricChartId, type ChartDef } from "./catalog";
import { DATA_SOURCE } from "./insightsSource";
import { tableName } from "./reportRows";

const SEED = "__dcon_seed";
function put(dt: string, name: string, data: Record<string, unknown>): number {
  const sig = JSON.stringify(data);
  const cur = adapter.get(dt, name);
  if (!cur) { adapter.insertDocQuiet(dt, { ...data, name, doctype: dt, [SEED]: sig, __synthetic: 1, __plugin: "digit_construction" } as Doc); return 1; }
  if (cur[SEED] === sig || !cur[SEED]) return 0;
  // refresh only an untouched seeded record (every seeded field still equals the previous seed)
  let prev: Record<string, unknown> = {};
  try { prev = JSON.parse(String(cur[SEED])) as Record<string, unknown>; } catch { return 0; }
  const untouched = Object.entries(prev).every(([k, v]) => JSON.stringify(cur[k]) === JSON.stringify(v));
  if (!untouched) return 0;
  adapter.insertDocQuiet(dt, { ...cur, ...data, [SEED]: sig } as Doc); return 1;
}
const queryId = (table: string) => `DCON-Q-${table}`;
const dim = (c: string) => ({ column_name: c, data_type: "String", dimension_name: c, label: c, value: c });
// measure_name is the series name Insights displays (Insights v3 alias), so it carries the readable English label; the plugin translation overlay shows it in Arabic
const measure = (m: ChartDef["measures"][number]) => (m.agg === "count" ? { aggregation: "count", column_name: "count", data_type: "Integer", label: m.en, measure_name: m.en } : { aggregation: "sum", column_name: m.column, data_type: "Decimal", label: m.en, measure_name: m.en });
export function chartConfig(c: ChartDef): Record<string, unknown> {
  const filters = { filters: toRules(c.filters), logical_operator: "And" };
  if (c.type === "Donut") return { label_column: dim(c.x), value_column: measure(c.measures[0]!), filters, limit: "50" };
  return { x_axis: { dimension: dim(c.x) }, y_axis: { series: c.measures.map((m) => ({ measure: measure(m) })) }, ...(c.split ? { split_by: dim(c.split) } : {}), filters, limit: "100" };
}

/** Installs / refreshes the Construction Insights records; returns how many records were written. */
export function seedConstructionInsights(): number {
  if (isServerHosted()) return 0 as never;
  let n = 0;
  n += put("Insights Data Source v3", DATA_SOURCE, { title: "DIGIT Construction (read models)", status: "Active", database_type: "Virtual", type: "Database", is_site_db: 0, is_frappe_db: 0 });
  n += put("Insights Workbook", WORKBOOK, { title: "DIGIT Construction", is_standard: 0 });
  const reports = new Set([...CHARTS.map((c) => c.report), ...CHARTED_METRICS.map((m) => m.report)]);
  let i = 0;
  for (const r of reports) { const t = tableName(r); n += put("Insights Query v3", queryId(t), { title: r, workbook: WORKBOOK, operations: JSON.stringify([{ type: "source", table: { type: "table", data_source: DATA_SOURCE, table_name: t } }]), use_live_connection: 1, is_builder_query: 1, is_script_query: 0, is_native_query: 0, sort_order: i++ }); }
  i = 0;
  for (const m of CHARTED_METRICS) n += put("Insights Chart v3", metricChartId(m.id), { title: m.en, workbook: WORKBOOK, query: queryId(tableName(m.report)), chart_type: "Number", config: JSON.stringify({ number_columns: [{ ...measureOf(m), measure_name: m.en, label: m.en }], filters: { filters: toRules(m.filters), logical_operator: "And" } }), visibility: "Private", sort_order: i++ });
  for (const c of CHARTS) n += put("Insights Chart v3", c.id, { title: c.en, workbook: WORKBOOK, query: queryId(tableName(c.report)), chart_type: c.type, config: JSON.stringify(chartConfig(c)), visibility: "Private", sort_order: i++ });
  const charted = new Set(CHARTED_METRICS.map((m) => m.id));
  for (const d of DASHBOARDS) {
    // Core grid = 20 columns × 14px rows: Number cards three per row (w 6, h 7), then charts two per row (w 10, h 16), no overlap
    const nums = d.metrics.filter((m) => charted.has(m)).map(metricChartId);
    const top = Math.ceil(nums.length / 3) * 7;
    const items = [
      ...nums.map((chart, k) => ({ type: "chart", chart, layout: { i: chart, x: (k % 3) * 6, y: Math.floor(k / 3) * 7, w: 6, h: 7 } })),
      ...d.charts.map((chart, k) => ({ type: "chart", chart, layout: { i: chart, x: (k % 2) * 10, y: top + Math.floor(k / 2) * 16, w: 10, h: 16 } })),
    ];
    n += put("Insights Dashboard v3", d.id, { title: `DIGIT Construction — ${d.en}`, workbook: WORKBOOK, items: JSON.stringify(items), visibility: "Private", vertical_compact_layout: 1 });
  }
  if (n) adapter.flush();
  return n;
}
