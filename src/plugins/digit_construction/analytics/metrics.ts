/**
 * DIGIT Construction metric registry (Insights-first KPI contracts). Every metric is ONE definition: a Script Report
 * (reportRows), Insights-style row filters and an aggregation. The KPI card value, the Insights Number chart
 * (DCON-C-<id>, seeded from this registry) and the drill report (the same report with the same filters in the URL)
 * therefore show the same rows and the same total. Historical IDs from the source app (src/domain/metrics.ts, 38) are
 * kept stable. Status says how far the formula is proven: SOURCE_BACKED (native/app records with a defined rule),
 * REQUIRES_VALIDATION (DIGIT proposal the owner must confirm), NEEDS_POLICY (operational value, accounting treatment
 * open), UNAVAILABLE_SOURCE (no legitimate source — never shown as 0).
 */
import { aggregate, applyFilterGroup, type FilterRule, type Measure } from "@/lib/insights";
import { reportRows, type Row, type Scope } from "./reportRows";
import type { MetricDef, RowFilter } from "./metricDefs";
export * from "./metricDefs";


/** The Insights measure of a metric (sum/count/count_distinct over its column). Ratio metrics have no single Insights measure and are never seeded as Number charts. */
export function measureOf(m: MetricDef): Measure {
  if (m.agg === "sum") return { measure_name: `sum_${m.column}`, column_name: m.column ?? "", aggregation: "sum", data_type: "Decimal" };
  if (m.agg === "count_distinct") return { measure_name: `count_distinct_${m.column}`, column_name: m.column ?? "", aggregation: "count_distinct", data_type: "Integer" };
  return { measure_name: "count", column_name: "count", aggregation: "count", data_type: "Integer" };
}
export const toRules = (fs: RowFilter[]): FilterRule[] => fs.map(([c, op, v]) => ({ column: { column_name: c }, operator: op, value: v }));
/** Applies compact row filters with the Insights filter engine (the same function Insights charts use). */
export const filterRows = (rows: Row[], fs: RowFilter[]) => (fs.length ? applyFilterGroup(rows, { logical_operator: "And", filters: toRules(fs) }) : rows);

export interface MetricResult { value: number | null; rows: Row[]; reason?: [string, string] | undefined; denominator?: number }
/** Value of a metric for a scope: the metric's report rows → filters → aggregation. null (never 0) when unavailable. */
export function metricValue(m: MetricDef, scope: Scope = {}): MetricResult {
  if (m.status === "UNAVAILABLE_SOURCE") return { value: null, rows: [], reason: m.unavailable };
  const rows = filterRows(reportRows(m.report, scope), m.filters);
  if (m.agg === "ratio") {
    const num = filterRows(rows, m.numerator ?? []).length;
    return rows.length ? { value: Math.round((num / rows.length) * 1000) / 10, rows, denominator: rows.length } : { value: null, rows, reason: m.empty_reason };
  }
  const currencies = new Set(rows.map((r) => r["currency"]).filter(Boolean).map(String));
  if (m.unit === "SAR" && currencies.size > 1) return { value: null, rows, reason: ["Rows are in more than one currency; no converted total without an approved exchange-rate policy", "الصفوف بأكثر من عملة؛ لا يُجمع دون سياسة أسعار صرف معتمدة"] };
  if (!rows.length && m.empty_reason) return { value: null, rows, reason: m.empty_reason };
  const value = aggregate(rows, measureOf(m));
  return { value: m.unit === "SAR" ? Math.round(value * 100) / 100 : value, rows };
}
