import { Link, useHydrated } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { indexQuery, loadMeta } from "@/lib/catalog";
import { adapter, useStoreVersion } from "@/lib/adapter";
import { DevOnly } from "@/components/DevOnly";
import { computeCard, computeChart, fmt, INTERVALS, TIMESPANS, type Chart, type NumberCard } from "@/lib/desk";

function useSeedDoctype(dt?: string) {
  const idx = useQuery(indexQuery);
  const [, setReady] = useState(0);
  // meta load also lets the scoped read (src/lib/scope.ts) evaluate permissions for the session user
  useEffect(() => { if (idx.data && dt) loadMeta(idx.data, dt).then((m) => { if (m) adapter.ensureSeed(m); setReady((x) => x + 1); }); }, [idx.data, dt]);
  return idx.data?.find((d) => d.name === dt);
}

/** Number Card widget (frappe/public/js/frappe/widgets/number_card_widget.js). Drill-down opens the filtered list. */
export function NumberCardWidget({ card, label }: { card?: NumberCard | undefined; label: string }) {
  useStoreVersion();
  const e = useSeedDoctype(card?.document_type);
  // a card the workspace names but the sources do not define renders nothing outside Developer mode, as in Desk
  if (!card) return <DevOnly><div className="panel p-4 text-xs text-muted-foreground">{label}: card definition not in sources</div></DevOnly>;
  const v = computeCard(card);
  return (
    <div className="panel p-4" data-card={card.name}>
      <div className="text-xs text-muted-foreground">{label}</div>
      {v.status === "computed" ? (
        <>
          <div className="mt-1 break-all text-xl font-semibold tabular-nums sm:text-2xl" data-value>{fmt(v.value)}</div>
          {e && <Link to="/app/$app/$doctype" params={{ app: e.app, doctype: e.slug }} search={{ filters: JSON.stringify(v.filters) }} className="text-[11px] text-primary">View {card.document_type} →</Link>}
          <DevOnly><div className="text-[10px] text-muted-foreground">Preview value from synthetic records{v.ignored.length ? `; ${v.ignored.join("; ")}` : ""}</div></DevOnly>
        </>
      ) : <div className="mt-1 text-xs text-warning" data-card-server={v.status}><span>{v.status === "denied" ? "Not permitted" : "Needs the DIGIT server"}</span><DevOnly><span className="block break-all font-mono text-[10px]" data-no-i18n>{v.reason}</span></DevOnly></div>}
    </div>
  );
}

/** Dashboard Chart widget — renders a simple bar chart of preview values; Report/Custom charts show the source empty state. */
export function ChartWidget({ chart, label }: { chart?: Chart | undefined; label: string }) {
  useStoreVersion();
  const e = useSeedDoctype(chart?.document_type);
  const hydrated = useHydrated();
  if (!chart) return <DevOnly><div className="panel p-4 text-xs text-muted-foreground">{label}: chart definition not in sources</div></DevOnly>;
  if (!hydrated) return <div className="panel p-4 text-xs text-muted-foreground" data-chart={chart.name}>{label}</div>;
  return <ChartBody chart={chart} label={label} e={e} />;
}

/** Timeseries charts expose the source chart_widget.js timespan and time-interval filters. */
function ChartBody({ chart, label, e }: { chart: Chart; label: string; e: ReturnType<typeof useSeedDoctype> }) {
  const [span, setSpan] = useState(chart.timespan || "Last Year");
  const [iv, setIv] = useState(chart.time_interval || "Monthly");
  const ts = !!chart.timeseries && chart.chart_type !== "Report" && chart.chart_type !== "Custom" && chart.chart_type !== "Group By";
  const v = computeChart(chart, ts ? { timespan: span, time_interval: iv } : undefined);
  return (
    <div className="panel p-4" data-chart={chart.name}>
      <div className="flex items-baseline justify-between gap-2"><h3 className="text-sm font-semibold">{label}</h3>
        <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
          {ts && <select aria-label={`${label} timespan`} className="rounded border border-border bg-background px-1" value={span} onChange={(x) => setSpan(x.target.value)}>{TIMESPANS.map((t) => <option key={t} value={t}>{t}</option>)}</select>}
          {ts && <select aria-label={`${label} interval`} className="rounded border border-border bg-background px-1" value={iv} onChange={(x) => setIv(x.target.value)}>{INTERVALS.map((t) => <option key={t} value={t}>{t}</option>)}</select>}
          <DevOnly>{chart.chart_type} · {chart.type}</DevOnly>
        </span></div>
      {v.status === "computed" ? (
        v.values.length ? (
          <div className="mt-3">
            <svg viewBox={`0 0 ${Math.max(v.values.length * 60, 300)} 140`} className="h-36 w-full" role="img" aria-label={`${label} chart`}>
              {v.values.map((n, i) => {
                const max = Math.max(...v.values, 1); const h = (n / max) * 100;
                return <g key={i}><rect x={i * 60 + 10} y={110 - h} width={40} height={h} rx={3} className="fill-primary" /><text x={i * 60 + 30} y={128} textAnchor="middle" className="fill-muted-foreground text-[9px]">{v.labels[i]!.slice(0, 10)}</text><text x={i * 60 + 30} y={105 - h} textAnchor="middle" className="fill-foreground text-[9px]">{fmt(n)}</text></g>;
              })}
            </svg>
            <div className="flex justify-between text-[10px] text-muted-foreground"><DevOnly><span>{v.note} · preview values</span></DevOnly><span />{e && <Link to="/app/$app/$doctype" params={{ app: e.app, doctype: e.slug }} search={{ filters: JSON.stringify(v.filters) }} className="text-primary">Open {chart.document_type} →</Link>}</div>
          </div>
        ) : <p className="mt-3 text-xs text-muted-foreground">No matching synthetic records.</p>
      ) : (
        <div className="mt-3 rounded border border-dashed border-border p-4 text-xs text-muted-foreground">
          <p>{chart.empty_state_message ?? "No data"}</p><p className="mt-1 text-warning" data-chart-server={v.status}><span>{v.status === "denied" ? "Not permitted" : "Needs the DIGIT server"}</span><DevOnly><span className="block break-all font-mono text-[10px]" data-no-i18n>{v.reason}</span></DevOnly></p>
        </div>
      )}
    </div>
  );
}
