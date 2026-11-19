import { computeChart, fmtNum, type ChartData } from "@/lib/insightsChart";
import type { FilterRule } from "@/lib/insights";

const PALETTE = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];
const color = (i: number) => PALETTE[i % PALETTE.length];

/** Renders an Insights Chart v3 (charts/ChartView.vue) from local query results. `reading` picks one Number column (dashboard cells). */
export function ChartView({ chart, filters = [], reading, compact }: { chart: Record<string, unknown>; filters?: FilterRule[]; reading?: string | undefined; compact?: boolean }) {
  const d = computeChart(chart, filters);
  return (
    <div className="flex h-full flex-col" data-insights-chart={String(chart["name"])}>
      {!compact && <div className="mb-2 text-sm font-medium">{String(chart["title"] ?? "")}</div>}
      <div className="min-h-0 flex-1"><Body d={d} reading={reading} title={String(chart["title"] ?? "")} /></div>
      {d.server.length > 0 && <p className="mt-1 text-[10px] text-crm-muted">Server-dependent steps skipped: {d.server.join("; ")}</p>}
    </div>
  );
}

function Body({ d, reading, title }: { d: ChartData; reading?: string | undefined; title: string }) {
  if (d.kind === "unsupported") return <p className="rounded border border-dashed border-crm-line p-3 text-xs text-crm-muted">{d.reason}</p>;
  if (d.kind === "number") {
    const cards = reading ? d.cards.filter((c) => c.name === reading) : d.cards;
    return (
      <div className="flex h-full flex-wrap gap-3">
        {cards.map((c) => {
          const delta = c.previous ? ((c.value - c.previous) / Math.abs(c.previous || 1)) * 100 : null;
          return (
            <div key={c.name} className="min-w-32 flex-1 rounded-lg border border-crm-line p-3" data-number={c.name}>
              <div className="text-xs text-crm-muted">{c.name}</div>
              <div className="text-2xl font-semibold" data-value>{fmtNum(c.value)}</div>
              {delta !== null && <div className="text-[11px] text-crm-muted">{delta >= 0 ? "▲" : "▼"} {Math.abs(delta).toFixed(1)}% vs previous period</div>}
            </div>
          );
        })}
      </div>
    );
  }
  if (d.kind === "table") {
    return (
      <div className="h-full overflow-auto rounded border border-crm-line">
        <table className="w-full text-xs"><thead className="sticky top-0 bg-crm-sidebar"><tr>{d.columns.map((c) => <th key={c} className="px-2 py-1 text-left font-medium">{c}</th>)}</tr></thead>
          <tbody>{d.rows.map((r, i) => <tr key={i} className="border-t border-crm-line">{d.columns.map((c) => <td key={c} className="px-2 py-1">{typeof r[c] === "number" ? fmtNum(r[c] as number) : String(r[c] ?? "")}</td>)}</tr>)}</tbody></table>
      </div>
    );
  }
  if (d.kind === "sankey") return <Sankey d={d} title={title} />;
  if (d.kind === "heatmap") return <Heatmap d={d} />;
  if (d.kind === "pie") {
    const total = d.values.reduce((a, b) => a + b, 0) || 1;
    let acc = 0;
    return (
      <div className="flex h-full items-center gap-4">
        <svg viewBox="-1 -1 2 2" className="h-36 w-36 -rotate-90" role="img" aria-label={`${title} donut`}>
          {d.values.map((v, i) => {
            const a0 = (acc / total) * 2 * Math.PI; acc += v; const a1 = (acc / total) * 2 * Math.PI;
            const large = a1 - a0 > Math.PI ? 1 : 0;
            return <path key={i} d={`M ${Math.cos(a0)} ${Math.sin(a0)} A 1 1 0 ${large} 1 ${Math.cos(a1)} ${Math.sin(a1)} L ${Math.cos(a1) * 0.6} ${Math.sin(a1) * 0.6} A 0.6 0.6 0 ${large} 0 ${Math.cos(a0) * 0.6} ${Math.sin(a0) * 0.6} Z`} fill={color(i)} />;
          })}
        </svg>
        <ul className="space-y-0.5 text-xs">{d.labels.map((l, i) => <li key={l} className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: color(i) }} />{l} <span className="text-crm-muted">{fmtNum(d.values[i]!)}</span></li>)}</ul>
      </div>
    );
  }
  if (d.kind === "bubble") return <Bubble d={d} title={title} />;
  const max = Math.max(1, ...d.series.flatMap((s) => s.values));
  const W = Math.max(300, d.labels.length * 28), H = 160;
  return (
    <div className="h-full">
      <svg viewBox={`0 0 ${W} ${H + 30}`} className="h-44 w-full" preserveAspectRatio="none" role="img" aria-label={`${title} chart`}>
        {d.series.map((s, si) => {
          const bw = (W / Math.max(d.labels.length, 1)) / (d.series.length + 1);
          return s.values.map((v, i) => {
            const x = (i * W) / d.labels.length + si * bw + bw / 2, h = (v / max) * H;
            return <rect key={`${si}-${i}`} x={x} y={H - h} width={bw} height={h} fill={color(si)}><title>{`${d.labels[i]}: ${fmtNum(v)}`}</title></rect>;
          });
        })}
      </svg>
      <div className="flex flex-wrap gap-3 text-[10px] text-crm-muted">
        <span>{d.labels[0]} … {d.labels.at(-1)} ({d.labels.length} points)</span>
        {d.series.map((s, i) => <span key={s.name} className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm" style={{ background: color(i) }} />{s.name}</span>)}
      </div>
    </div>
  );
}

/** Sankey (ECharts sankey): source → target ribbons sized by value, computed over the local query result. */
function Sankey({ d, title }: { d: Extract<ChartData, { kind: "sankey" }>; title: string }) {
  const srcT = new Map<string, number>(), tgtT = new Map<string, number>();
  for (const l of d.links) { srcT.set(l.source, (srcT.get(l.source) ?? 0) + l.value); tgtT.set(l.target, (tgtT.get(l.target) ?? 0) + l.value); }
  const total = d.links.reduce((a, l) => a + l.value, 0) || 1;
  const srcs = [...srcT.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12), tgts = [...tgtT.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
  const W = 420, H = Math.max(160, (srcs.length + tgts.length) * 24 + 20), NW = 8, gap = 6;
  const inner = (items: [string, number][]) => H - 20 - gap * items.length;
  const yOf = (items: [string, number][], i: number) => items.slice(0, i).reduce((a, s) => a + (s[1] / total) * inner(items) + gap, 10);
  const ySrc = (name: string) => { const i = srcs.findIndex((s) => s[0] === name); return i < 0 ? null : { top: yOf(srcs, i), h: Math.max(2, (srcs[i]![1] / total) * inner(srcs)) }; };
  const yTgt = (name: string) => { const i = tgts.findIndex((s) => s[0] === name); return i < 0 ? null : { top: yOf(tgts, i), h: Math.max(2, (tgts[i]![1] / total) * inner(tgts)) }; };
  return (
    <div className="h-full overflow-auto" role="img" aria-label={`${title} sankey`}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-h-44">
        {d.links.slice(0, 120).map((l, i) => {
          const a = ySrc(l.source), b = yTgt(l.target);
          if (!a || !b) return null;
          const h = Math.max(1, (l.value / total) * inner(tgts));
          const x0 = 10 + NW, x1 = W - 10 - NW, c = (x1 - x0) / 2;
          const off = d.links.slice(0, i).filter((p) => p.source === l.source).reduce((s, p) => s + (p.value / total) * inner(srcs), 0);
          return <path key={i} d={`M ${x0} ${a.top + off} C ${x0 + c} ${a.top + off}, ${x1 - c} ${b.top}, ${x1} ${b.top} L ${x1} ${b.top + h} C ${x1 - c} ${b.top + h}, ${x0 + c} ${a.top + off + h}, ${x0} ${a.top + off + h} Z`} fill={color(srcs.findIndex((s) => s[0] === l.source))} opacity={0.35}><title>{`${l.source} → ${l.target}: ${fmtNum(l.value)}`}</title></path>;
        })}
        {srcs.map(([n, v], i) => { const y = ySrc(n)!; return <g key={n}><rect x={10} y={y.top} width={NW} height={y.h} fill={color(i)} /><text x={22} y={y.top + y.h / 2 + 3} fontSize={9} fill="currentColor">{n} · {fmtNum(v)}</text></g>; })}
        {tgts.map(([n, v], i) => { const y = yTgt(n)!; return <g key={n}><rect x={W - 10 - NW} y={y.top} width={NW} height={y.h} fill={color(i)} /><text x={W - 22} y={y.top + y.h / 2 + 3} fontSize={9} fill="currentColor" textAnchor="end">{n} · {fmtNum(v)}</text></g>; })}
      </svg>
    </div>
  );
}

/** Heatmap: row × column grid colored by the aggregated value. */
function Heatmap({ d }: { d: Extract<ChartData, { kind: "heatmap" }> }) {
  const max = Math.max(1, ...d.cells.flat());
  return (
    <div className="h-full overflow-auto" role="img" aria-label="heatmap">
      <table className="text-[10px]">
        <thead><tr><th />{d.colLabels.map((c) => <th key={c} className="px-1 py-0.5 font-normal text-crm-muted">{c}</th>)}</tr></thead>
        <tbody>{d.rowLabels.map((r, ri) => (
          <tr key={r}><th className="pr-1 text-right font-normal text-crm-muted">{r}</th>
            {d.colLabels.map((c, ci) => { const v = d.cells[ri]?.[ci] ?? 0; return <td key={c} className="p-0"><div className="m-px flex h-6 min-w-10 items-center justify-center rounded-sm text-[9px] text-crm-ink" style={{ background: "var(--chart-1)", opacity: 0.12 + 0.88 * (v / max) }} title={`${r} × ${c}: ${fmtNum(v)}`}>{v ? fmtNum(v) : ""}</div></td>; })}
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

/** Bubble: X/Y scatter with sized points, colored by split-by series. */
function Bubble({ d, title }: { d: Extract<ChartData, { kind: "bubble" }>; title: string }) {
  const xs = d.points.map((p) => p.x), ys = d.points.map((p) => p.y);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(0, ...ys), y1 = Math.max(...ys);
  const W = 420, H = 180, pad = 34;
  const px = (x: number) => pad + ((x - x0) / (x1 - x0 || 1)) * (W - pad - 10);
  const py = (y: number) => H - 20 - ((y - y0) / (y1 - y0 || 1)) * (H - pad - 20);
  const groups = [...new Set(d.points.map((p) => p.s))].slice(0, 10);
  const yMax = Math.max(1, ...ys);
  return (
    <div className="h-full">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-h-44" role="img" aria-label={`${title} bubble`}>
        <line x1={pad} y1={H - 20} x2={W - 10} y2={H - 20} stroke="currentColor" opacity={0.2} />
        <line x1={pad} y1={10} x2={pad} y2={H - 20} stroke="currentColor" opacity={0.2} />
        {[0.25, 0.5, 0.75, 1].map((t) => <text key={t} x={pad - 4} y={H - 20 - t * (H - pad - 20) + 3} fontSize={8} fill="currentColor" opacity={0.5} textAnchor="end">{fmtNum(yMax * t)}</text>)}
        {d.points.map((p, i) => { const r = 3 + (Math.abs(p.y) / (yMax || 1)) * 8; return <circle key={i} cx={px(p.x)} cy={py(p.y)} r={r} fill={color(groups.indexOf(p.s))} opacity={0.65}><title>{`${p.s}: (${fmtNum(p.x)}, ${fmtNum(p.y)})`}</title></circle>; })}
      </svg>
      <div className="flex flex-wrap gap-3 text-[10px] text-crm-muted">{groups.map((g, i) => <span key={g} className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: color(i) }} />{g}</span>)}</div>
    </div>
  );
}
