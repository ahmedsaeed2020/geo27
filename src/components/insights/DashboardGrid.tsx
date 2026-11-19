import { useState } from "react";
import { adapter, type Doc } from "@/lib/adapter";
import { OPERATORS, parseJSON, type FilterRule } from "@/lib/insights";
import { ChartView } from "./ChartView";

export type Item = { type: "chart" | "filter" | "text"; chart?: string; reading?: string; text?: string; filter_name?: string; filter_type?: string; links?: Record<string, string>; default_operator?: string; default_value?: unknown; layout: { i: string; x: number; y: number; w: number; h: number } };
type FV = Record<string, { operator: string; value: string }>;

/** Dashboard grid (dashboard/StaticGridLayout + DashboardFilter.vue). 20-column grid from item layouts; filter items apply to linked chart columns. */
export function DashboardGrid({ dash, edit }: { dash: Doc; edit?: boolean }) {
  const [items, setItems] = useState<Item[]>(parseJSON<Item[]>(dash["items"], []));
  const [fv, setFv] = useState<FV>(() => Object.fromEntries(items.filter((i) => i.type === "filter").map((i) => [i.filter_name!, { operator: i.default_operator ?? "=", value: String(i.default_value ?? "") }])));
  const [dirty, setDirty] = useState(false);
  const charts = adapter.list("Insights Chart v3").filter((c) => c["workbook"] === dash["workbook"]);
  const set = (n: Item[]) => { setItems(n); setDirty(true); };
  const maxY = Math.max(0, ...items.map((i) => i.layout.y + i.layout.h));
  const add = (it: Omit<Item, "layout">, w: number, h: number) => set([...items, { ...it, layout: { i: Math.random().toString(36).slice(2, 10), x: 0, y: maxY, w, h } }]);
  const filtersFor = (chart: string): FilterRule[] => items.filter((i) => i.type === "filter" && i.links?.[chart] && fv[i.filter_name!]?.value).map((i) => {
    const s = fv[i.filter_name!]!;
    return { column: { type: "column", column_name: i.links![chart]! }, operator: s.operator, value: ["in", "not_in"].includes(s.operator) ? s.value.split(",").map((x) => x.trim()) : s.value };
  });
  const filters = items.filter((i) => i.type === "filter");
  return (
    <div>
      {edit && (
        <div className="mb-3 flex flex-wrap items-center gap-2 text-sm" aria-label="Dashboard edit actions">
          <select aria-label="Add chart" className="crm-input w-auto" value="" onChange={(e) => { const c = charts.find((x) => x.name === e.target.value); if (c) add({ type: "chart", chart: c.name }, c["chart_type"] === "Number" ? 5 : 10, c["chart_type"] === "Number" ? 7 : 20); }}>
            <option value="">+ Chart</option>{charts.map((c) => <option key={c.name} value={c.name}>{String(c["title"])}</option>)}
          </select>
          <button className="crm-input w-auto" onClick={() => { const n = window.prompt("Filter name"); if (n) add({ type: "filter", filter_name: n, filter_type: "String", links: {} }, 5, 2); }}>+ Filter</button>
          <button className="crm-input w-auto" onClick={() => { const t = window.prompt("Text"); if (t) add({ type: "text", text: t }, 20, 3); }}>+ Text</button>
          <button className="crm-btn-solid ms-auto" disabled={!dirty} onClick={() => { adapter.update("Insights Dashboard v3", dash.name, { items: JSON.stringify(items) }); setDirty(false); }}>{dirty ? "Save dashboard" : "Saved"}</button>
        </div>
      )}
      {filters.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2" aria-label="Dashboard filters">
          {filters.map((f) => (
            <div key={f.layout.i} className="flex items-center gap-1 rounded-md border border-crm-line px-2 py-1 text-xs">
              <span className="font-medium">{f.filter_name}</span>
              <select aria-label={`${f.filter_name} operator`} className="crm-input w-auto" value={fv[f.filter_name!]?.operator ?? "="} onChange={(e) => setFv({ ...fv, [f.filter_name!]: { value: fv[f.filter_name!]?.value ?? "", operator: e.target.value } })}>{OPERATORS.map((o) => <option key={o.op} value={o.op}>{o.label}</option>)}</select>
              <input aria-label={`${f.filter_name} value`} className="crm-input w-32" value={fv[f.filter_name!]?.value ?? ""} onChange={(e) => setFv({ ...fv, [f.filter_name!]: { operator: fv[f.filter_name!]?.operator ?? "=", value: e.target.value } })} />
              {edit && <FilterLinks item={f} charts={charts.filter((c) => items.some((i) => i.chart === c.name))} onChange={(links) => set(items.map((i) => (i === f ? { ...i, links } : i)))} />}
            </div>
          ))}
        </div>
      )}
      <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(20, minmax(0, 1fr))", gridAutoRows: "14px" }}>
        {items.filter((i) => i.type !== "filter").map((it) => {
          const c = it.chart ? adapter.get("Insights Chart v3", it.chart) : undefined;
          return (
            <div key={it.layout.i} className="relative overflow-hidden rounded-lg border border-crm-line bg-crm-surface p-3" style={{ gridColumn: `${it.layout.x + 1} / span ${it.layout.w}`, gridRow: `${it.layout.y + 1} / span ${it.layout.h}` }}>
              {edit && <button aria-label="Remove item" className="absolute right-2 top-1 text-xs text-crm-muted" onClick={() => set(items.filter((x) => x !== it))}>✕</button>}
              {it.type === "text" ? <p className="text-sm">{it.text}</p> : c ? <ChartView chart={c} reading={it.reading} filters={filtersFor(c.name)} compact={c["chart_type"] === "Number" && !!it.reading} /> : <p className="text-xs text-crm-muted">Chart {it.chart} not found</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FilterLinks({ item, charts, onChange }: { item: Item; charts: Doc[]; onChange: (l: Record<string, string>) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative">
      <button className="text-crm-muted" onClick={() => setOpen(!open)}>links ({Object.keys(item.links ?? {}).length})</button>
      {open && (
        <div className="absolute z-10 mt-1 w-72 space-y-1 rounded-md border border-crm-line bg-crm-surface p-2 shadow" aria-label={`${item.filter_name} links`}>
          {charts.map((c) => (
            <label key={c.name} className="flex items-center justify-between gap-2">{String(c["title"])}
              <input aria-label={`Link ${c["title"]}`} className="crm-input w-28" placeholder="column" value={item.links?.[c.name] ?? ""} onChange={(e) => { const l = { ...(item.links ?? {}) }; if (e.target.value) l[c.name] = e.target.value; else delete l[c.name]; onChange(l); }} />
            </label>
          ))}
        </div>
      )}
    </span>
  );
}
