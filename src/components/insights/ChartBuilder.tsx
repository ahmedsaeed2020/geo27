import { useState } from "react";
import { adapter, type Doc } from "@/lib/adapter";
import { AGGREGATIONS, GRANULARITIES, OPERATORS, parseJSON, runQuery, type FilterRule, type Measure, type Operation } from "@/lib/insights";
import { CHART_TYPES, measuresOf, type ChartConfig } from "@/lib/insightsChart";
import { ChartView } from "./ChartView";

/** Chart builder (charts/ChartBuilder.vue): chart type, query, axes/measures and chart filters, saved to Insights Chart v3.config. */
export function ChartBuilder({ chart }: { chart: Doc }) {
  const [type, setType] = useState(String(chart["chart_type"] ?? "Bar"));
  const [query, setQuery] = useState(String(chart["query"] ?? ""));
  const [cfg, setCfg] = useState<ChartConfig>(parseJSON<ChartConfig>(chart["config"], {}));
  const [saved, setSaved] = useState(true);
  const queries = adapter.list("Insights Query v3").filter((q) => q["workbook"] === chart["workbook"]);
  const q = adapter.get("Insights Query v3", query);
  const cols = runQuery(parseJSON<Operation[]>(q?.["operations"], [])).columns.map((c) => c.name);
  const up = (p: Partial<ChartConfig>) => { setCfg({ ...cfg, ...p }); setSaved(false); };
  const save = () => { adapter.update("Insights Chart v3", chart.name, { chart_type: type, query, config: JSON.stringify(cfg) }); setSaved(true); };
  const draft = { ...chart, chart_type: type, query, config: JSON.stringify(cfg) };
  const sel = (label: string, v: string, on: (x: string) => void, opts: string[]) => (
    <label className="block text-xs"><span className="text-crm-muted">{label}</span>
      <select aria-label={label} className="crm-input mt-0.5" value={v} onChange={(e) => on(e.target.value)}><option value="">—</option>{opts.map((o) => <option key={o} value={o}>{o}</option>)}</select></label>
  );
  const m0: Measure = measuresOf(cfg)[0] ?? { measure_name: "", column_name: "", aggregation: "sum" };
  const mk = (col: string, agg: string): Measure => ({ measure_name: `${agg}_of_${col || "rows"}`, column_name: col || "count", aggregation: agg, data_type: "Decimal" });
  const dim = (c: string, g?: string) => (c ? { dimension_name: c, column_name: c, data_type: "String", ...(g ? { granularity: g } : {}) } : undefined);
  const filters = cfg.filters?.filters ?? [];
  const setF = (f: FilterRule[]) => up({ filters: { logical_operator: cfg.filters?.logical_operator ?? "And", filters: f } });
  return (
    <div className="flex h-full min-h-0">
      <div className="w-72 shrink-0 space-y-3 overflow-auto border-e border-crm-line p-3">
        <input aria-label="Chart title" className="crm-input font-medium" defaultValue={String(chart["title"] ?? "")} onBlur={(e) => adapter.update("Insights Chart v3", chart.name, { title: e.target.value })} />
        {sel("Chart type", type, (v) => { setType(v); setSaved(false); }, [...CHART_TYPES])}
        {type === "Map" && <p className="text-[11px] text-crm-muted">Map needs the ECharts geo map asset on a server; config still saves.</p>}
        <label className="block text-xs"><span className="text-crm-muted">Query</span>
          <select aria-label="Query" className="crm-input mt-0.5" value={query} onChange={(e) => { setQuery(e.target.value); setSaved(false); }}>{queries.map((x) => <option data-no-i18n key={x.name} value={x.name}>{String(x["title"])}</option>)}</select></label>
        {["Bar", "Line", "Row", "Bubble"].includes(type) && <>
          {sel("X axis", cfg.x_axis?.dimension?.column_name ?? "", (v) => up({ x_axis: { dimension: dim(v, cfg.x_axis?.dimension?.granularity) } }), cols)}
          {sel("Granularity", cfg.x_axis?.dimension?.granularity ?? "", (v) => up({ x_axis: { dimension: dim(cfg.x_axis?.dimension?.column_name ?? "", v) } }), GRANULARITIES)}
          {sel("Y axis column", m0.column_name ?? "", (v) => up({ y_axis: { ...(cfg.y_axis ?? {}), series: [{ measure: mk(v, m0.aggregation ?? "sum") }] } }), cols)}
          {sel("Aggregation", m0.aggregation ?? "", (v) => up({ y_axis: { ...(cfg.y_axis ?? {}), series: [{ measure: mk(m0.column_name ?? "", v) }] } }), AGGREGATIONS)}
          {sel("Split by", cfg.split_by?.column_name ?? "", (v) => up({ split_by: dim(v) }), cols)}
        </>}
        {(type === "Donut" || type === "Funnel") && <>
          {sel("Label column", cfg.label_column?.column_name ?? "", (v) => up({ label_column: dim(v) }), cols)}
          {sel("Value column", cfg.value_column?.column_name ?? "", (v) => up({ value_column: mk(v, cfg.value_column?.aggregation ?? "sum") }), cols)}
          {sel("Value aggregation", cfg.value_column?.aggregation ?? "", (v) => up({ value_column: mk(cfg.value_column?.column_name ?? "", v) }), AGGREGATIONS)}
        </>}
        {type === "Number" && <>
          {sel("Add number column", "", (v) => v && up({ number_columns: [...(cfg.number_columns ?? []), { ...mk(v, "sum"), measure_name: `sum_of_${v}` }] }), cols)}
          <ul className="text-xs">{(cfg.number_columns ?? []).map((m, i) => <li key={i} className="flex justify-between">{m.measure_name}<button aria-label={`Remove ${m.measure_name}`} onClick={() => up({ number_columns: (cfg.number_columns ?? []).filter((_, j) => j !== i) })}>✕</button></li>)}</ul>
          {sel("Date column (comparison)", cfg.date_column?.column_name ?? "", (v) => up({ date_column: dim(v) }), cols)}
        </>}
        {["Table", "Sankey", "Heatmap"].includes(type) && <>
          {sel(type === "Sankey" ? "Source (Rows)" : "Rows", cfg.rows?.[0]?.column_name ?? "", (v) => up({ rows: v ? [dim(v)!] : [] }), cols)}
          {sel(type === "Sankey" ? "Target (Columns)" : "Columns", cfg.columns?.[0]?.column_name ?? "", (v) => up({ columns: v ? [dim(v, cfg.columns?.[0]?.granularity)!] : [] }), cols)}
          {sel(type === "Table" ? "Value column" : "Value", (cfg.values?.[0] as Measure | undefined)?.column_name ?? "", (v) => up({ values: v ? [mk(v, "sum")] : [] }), cols)}
        </>}
        <div className="space-y-1 border-t border-crm-line pt-2" aria-label="Chart filters">
          <div className="text-xs font-medium">Filters</div>
          {filters.map((f, i) => (
            <div key={i} className="flex flex-wrap gap-1">
              <select aria-label={`Chart filter column ${i + 1}`} className="crm-input w-28" value={f.column?.column_name ?? ""} onChange={(e) => setF(filters.map((x, j) => (j === i ? { ...x, column: { type: "column", column_name: e.target.value } } : x)))}><option value="">Column</option>{cols.map((c) => <option key={c} value={c}>{c}</option>)}</select>
              <select aria-label={`Chart filter operator ${i + 1}`} className="crm-input w-24" value={f.operator ?? "="} onChange={(e) => setF(filters.map((x, j) => (j === i ? { ...x, operator: e.target.value } : x)))}>{OPERATORS.map((o) => <option key={o.op} value={o.op}>{o.label}</option>)}</select>
              <input aria-label={`Chart filter value ${i + 1}`} className="crm-input w-24" value={Array.isArray(f.value) ? f.value.join(", ") : String(f.value ?? "")} onChange={(e) => setF(filters.map((x, j) => (j === i ? { ...x, value: ["in", "not_in"].includes(x.operator ?? "") ? e.target.value.split(",").map((s) => s.trim()) : e.target.value } : x)))} />
              <button aria-label={`Remove chart filter ${i + 1}`} onClick={() => setF(filters.filter((_, j) => j !== i))}>✕</button>
            </div>
          ))}
          <button className="text-xs text-crm-muted" onClick={() => setF([...filters, { column: { type: "column", column_name: "" }, operator: "=", value: "" }])}>+ Add filter</button>
        </div>
        <button className="crm-btn-solid w-full justify-center" onClick={save} disabled={saved}>{saved ? "Saved" : "Save chart"}</button>
      </div>
      <div className="min-w-0 flex-1 p-4"><ChartView chart={draft} /></div>
    </div>
  );
}
