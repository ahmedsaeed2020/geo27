/** Chart evaluation for Insights Chart v3 configs (frontend/src2/types/chart.types.ts) over a local query result. */
import { adapter } from "./adapter";
import { aggregate, applyFilterGroup, bucket, parseJSON, runQuery, summarize, pivot, type Dimension, type FilterRule, type Measure, type Operation, type Row } from "./insights";

export const CHART_TYPES = ["Number", "Bar", "Line", "Row", "Donut", "Funnel", "Table", "Map", "Bubble", "Sankey", "Heatmap"] as const;
export const LOCAL_TYPES = new Set(["Number", "Bar", "Line", "Row", "Donut", "Funnel", "Table", "Bubble", "Sankey", "Heatmap"]);
export type ChartConfig = Record<string, unknown> & {
  x_axis?: { dimension?: Dimension | undefined }; y_axis?: { series?: { measure: Measure }[] }; split_by?: Dimension | undefined;
  label_column?: Dimension | undefined; value_column?: Measure | undefined; number_columns?: Measure[]; date_column?: Dimension | undefined;
  rows?: Dimension[]; columns?: Dimension[]; values?: unknown[]; filters?: { logical_operator?: string; filters?: FilterRule[] };
  order_by?: { column: { column_name: string }; direction: string }[]; limit?: number | string;
};
export type Series = { name: string; values: number[] };
export type ChartData =
  | { kind: "axis"; labels: string[]; series: Series[] }
  | { kind: "pie"; labels: string[]; values: number[] }
  | { kind: "number"; cards: { name: string; value: number; previous: number | null }[] }
  | { kind: "table"; columns: string[]; rows: Row[] }
  | { kind: "bubble"; points: { x: number; y: number; s: string }[] }
  | { kind: "sankey"; links: { source: string; target: string; value: number }[] }
  | { kind: "heatmap"; rowLabels: string[]; colLabels: string[]; cells: number[][] }
  | { kind: "unsupported"; reason: string };

export const measuresOf = (cfg: ChartConfig): Measure[] => (cfg.y_axis?.series ?? []).map((s) => s.measure).filter((m) => m?.measure_name);
const valuesOf = (cfg: ChartConfig): Measure[] => (cfg.values ?? []).map((v) => (v && typeof v === "object" && "measure_name" in v ? v : Object.values(v as object)[0]) as Measure).filter(Boolean);

export function chartRows(chart: Record<string, unknown>, extra: FilterRule[] = []) {
  const q = adapter.get("Insights Query v3", String(chart["query"] ?? ""));
  const res = runQuery(parseJSON<Operation[]>(q?.["operations"], []));
  const cfg = parseJSON<ChartConfig>(chart["config"], {});
  let rows = applyFilterGroup(res.rows, cfg.filters);
  if (extra.length) rows = applyFilterGroup(rows, { logical_operator: "And", filters: extra });
  return { res, rows, cfg };
}

export function computeChart(chart: Record<string, unknown>, extra: FilterRule[] = []): ChartData & { server: string[]; total: number } {
  const type = String(chart["chart_type"] ?? "");
  const { res, rows, cfg } = chartRows(chart, extra);
  const meta = { server: res.server, total: rows.length };
  if (!LOCAL_TYPES.has(type)) return { kind: "unsupported", reason: `${type} renderer needs the ECharts geo map asset, which is not bundled in this preview`, ...meta };
  const limit = Number(cfg.limit) || 100;
  if (type === "Number") {
    const cols = cfg.number_columns ?? [];
    const dc = cfg.date_column?.column_name;
    let cur = rows, prev: Row[] | null = null;
    if (dc) {
      const months = [...new Set(rows.map((r) => bucket(r[dc], "month")).filter(Boolean))].sort();
      const last = months.at(-1), before = months.at(-2);
      if (last) { cur = rows; prev = before ? rows.filter((r) => bucket(r[dc], "month") <= before) : null; }
    }
    return { kind: "number", cards: cols.map((m) => ({ name: m.measure_name, value: aggregate(cur, m), previous: prev ? aggregate(prev, m) : null })), ...meta };
  }
  if (type === "Donut" || type === "Funnel") {
    const d = cfg.label_column, m = cfg.value_column;
    if (!d?.column_name || !m) return { kind: "unsupported", reason: "Pick a label column and a value column", ...meta };
    const s = summarize(rows, [m], [{ ...d, dimension_name: d.column_name }]).sort((a, b) => Number(b[m.measure_name]) - Number(a[m.measure_name])).slice(0, limit);
    return { kind: "pie", labels: s.map((r) => String(r[d.column_name])), values: s.map((r) => Number(r[m.measure_name])), ...meta };
  }
  if (type === "Table") {
    const rd = cfg.rows ?? [], cd = cfg.columns ?? [], vs = valuesOf(cfg);
    if (!rd.length && !vs.length) return { kind: "table", columns: res.columns.map((c) => c.name), rows: rows.slice(0, limit), ...meta };
    const out = cd.length ? pivot(rows, rd, cd, vs) : summarize(rows, vs, rd.map((d) => ({ ...d, dimension_name: d.column_name })));
    const sorted = sortBy(out, cfg.order_by ?? []).slice(0, limit);
    return { kind: "table", columns: [...new Set(sorted.flatMap((r) => Object.keys(r)))], rows: sorted, ...meta };
  }
  if (type === "Sankey" || type === "Heatmap") {
    const rd = cfg.rows?.[0], cd = cfg.columns?.[0], vs = valuesOf(cfg);
    if (!rd?.column_name || !cd?.column_name) return { kind: "unsupported", reason: `Pick a ${type === "Sankey" ? "source (Rows) and target (Columns)" : "row and column"} dimension`, ...meta };
    const m = vs[0] ?? { measure_name: "count", column_name: "count", aggregation: "count", data_type: "Integer" };
    const s = summarize(rows, [m], [{ ...rd, dimension_name: rd.column_name }, { ...cd, dimension_name: cd.column_name }]).filter((r) => Number(r[m.measure_name]) !== 0).slice(0, limit);
    const pairs = s.map((r) => ({ source: String(r[rd.column_name]), target: String(r[cd.column_name]), value: Number(r[m.measure_name]) }));
    if (type === "Sankey") return { kind: "sankey", links: pairs, ...meta };
    const rowLabels = [...new Set(pairs.map((p) => p.source))], colLabels = [...new Set(pairs.map((p) => p.target))];
    const cells = rowLabels.map((r) => colLabels.map((c) => pairs.find((p) => p.source === r && p.target === c)?.value ?? 0));
    return { kind: "heatmap", rowLabels, colLabels, cells, ...meta };
  }
  if (type === "Bubble") {
    const x = cfg.x_axis?.dimension, ms = measuresOf(cfg);
    if (!x?.column_name || !ms.length) return { kind: "unsupported", reason: "Pick an X axis column and a Y axis measure", ...meta };
    const split = cfg.split_by?.column_name ? cfg.split_by : undefined;
    const s = summarize(rows, [ms[0]!], [{ ...x, dimension_name: x.column_name }, ...(split ? [{ ...split, dimension_name: split.column_name }] : [])]);
    const points = s.map((r) => ({ x: Number(r[x.column_name]), y: Number(r[ms[0]!.measure_name]), s: split ? String(r[split.column_name]) : "Value" })).filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y)).slice(0, 500);
    return { kind: "bubble", points, ...meta };
  }
  const x = cfg.x_axis?.dimension, ms = measuresOf(cfg);
  if (!x?.column_name || !ms.length) return { kind: "unsupported", reason: "Pick an X axis dimension and at least one Y axis measure", ...meta };
  const xd = { ...x, dimension_name: x.column_name };
  const split = cfg.split_by?.column_name ? cfg.split_by : undefined;
  const s = sortBy(summarize(rows, ms, split ? [xd, { ...split, dimension_name: split.column_name }] : [xd]), cfg.order_by?.length ? cfg.order_by : [{ column: { column_name: x.column_name }, direction: "asc" }]);
  const labels = [...new Set(s.map((r) => String(r[x.column_name])))].slice(0, limit);
  const series: Series[] = split
    ? [...new Set(s.map((r) => String(r[split.column_name])))].slice(0, 10).map((g) => ({ name: g, values: labels.map((l) => Number(s.find((r) => String(r[x.column_name]) === l && String(r[split.column_name]) === g)?.[ms[0]!.measure_name] ?? 0)) }))
    : ms.map((m) => ({ name: m.measure_name, values: labels.map((l) => Number(s.find((r) => String(r[x.column_name]) === l)?.[m.measure_name] ?? 0)) }));
  return { kind: "axis", labels, series, ...meta };
}
function sortBy(rows: Row[], by: { column: { column_name: string }; direction: string }[]) {
  return [...rows].sort((a, b) => { for (const o of by) { const x = a[o.column.column_name], y = b[o.column.column_name]; const c = typeof x === "number" && typeof y === "number" ? x - y : String(x ?? "").localeCompare(String(y ?? ""), undefined, { numeric: true }); if (c) return o.direction === "desc" ? -c : c; } return 0; });
}
export const fmtNum = (n: number) => (Math.abs(n) >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : Math.abs(n) >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : String(Math.round(n * 100) / 100));

/**
 * Bucket bounds for an axis label produced by insights.ts bucket(): [start, nextStart) as ISO dates, so a drill filter
 * `>= start` and `< nextStart` selects exactly the rows grouped into that column (date or datetime values alike).
 */
export function bucketRange(label: string, granularity: string | undefined): [string, string] | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(label);
  if (!granularity || !m) return null;
  const y = Number(m[1]), mo = Number(m[2]) - 1, d = Number(m[3]);
  const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
  const start = Date.UTC(y, mo, d);
  const next = granularity === "year" ? Date.UTC(y + 1, 0, 1) : granularity === "quarter" ? Date.UTC(y, mo + 3, 1) : granularity === "month" ? Date.UTC(y, mo + 1, 1) : granularity === "week" ? Date.UTC(y, mo, d + 7) : Date.UTC(y, mo, d + 1);
  return [iso(start), iso(next)];
}

/**
 * List filters that reproduce one mark of an axis chart: the x value (category `=` or the date bucket range) plus the
 * split-by value when the chart is split. Measure series add nothing, since every measure reads the same rows.
 */
export function axisMarkFilters(cfg: ChartConfig, label: string, seriesName: string): [string, string, unknown][] {
  const x = cfg.x_axis?.dimension;
  if (!x?.column_name) return [];
  const range = bucketRange(label, x.granularity);
  const out: [string, string, unknown][] = range ? [[x.column_name, ">=", range[0]], [x.column_name, "<", range[1]]] : [[x.column_name, "=", label]];
  const split = cfg.split_by?.column_name;
  if (split) out.push([split, "=", seriesName]);
  return out;
}
