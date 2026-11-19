/**
 * Universal Dashboard Designer — generic, dependency-free visualizations (SVG/CSS) for every view family.
 * Colors come from the theme chart/status tokens; layouts use logical properties so Arabic (RTL) mirrors naturally;
 * every chart keeps a text equivalent (values in the legend / an accessible table) so no figure is colour-only.
 * Labels flagged `data` are record values (customer, warehouse…) and are never translated.
 */
import { useEffect, useState, type ReactNode } from "react";
import type { SeriesPoint, WidgetData, WidgetRow } from "@/lib/dashboards/registry";
import type { Bi, ViewKind } from "@/lib/dashboards/views";
import { sampleNameAr, t as tAr } from "@/i18n";
import { DeltaChip, Spark } from "@/components/enterprise/kit/charts";
import { KpiCard } from "@/components/enterprise/kit/KpiCard";
import { SplitBars } from "@/components/enterprise/kit/SplitCard";
import { fmtCurrency } from "@/lib/format";
import { usePublishChip } from "@/components/enterprise/kit/heroFeed";
import { AreaChart, Columns as KColumns, Donut, Funnel as KFunnel, Heatmap as KHeatmap, RankedBars, SERIES, Waterfall as KWaterfall, type Datum } from "@/components/enterprise/kit";

export type LinkFor = (drill: unknown, children: ReactNode, attrs?: Record<string, string>) => ReactNode;
// brand chart roles from the Enterprise kit (kit.css): the eight colours of the active palette for every dashboard in every
// app (Enterprise Visual Round 1 §3: no colour cap; colours repeat after the eighth series)
const PALETTE = SERIES;
const OTHER = "var(--cat-other, var(--ek-neutral))";
const OTHER_KEY = "__other";
const isOther = (k: string) => k === OTHER_KEY || k === "أخرى" || k === "Other";
const seriesColor = (k: string, i: number) => (isOther(k) ? OTHER : PALETTE[i % PALETTE.length]!);
/** Optional grouping of the smallest series into «أخرى» when a caller asks for a maximum (no cap by default, Round 1 §2). */
export function capMatrix<D extends { colKeys: string[]; values: number[][] }>(d: D, ar: boolean, max = Infinity): D {
  if (d.colKeys.length <= max) return d;
  const tot = d.colKeys.map((_, c) => d.values.reduce((s, row) => s + Math.abs(row[c] ?? 0), 0));
  const keep = d.colKeys.map((_, c) => c).sort((a, b) => tot[b]! - tot[a]!).slice(0, max).sort((a, b) => a - b);
  const rest = d.colKeys.map((_, c) => c).filter((c) => !keep.includes(c));
  return { ...d, colKeys: [...keep.map((c) => d.colKeys[c]!), ar ? "أخرى" : "Other"], values: d.values.map((row) => [...keep.map((c) => row[c] ?? 0), rest.reduce((s, c) => s + (row[c] ?? 0), 0)]) };
}
/** Optional grouping of the smallest parts into «أخرى» when a caller asks for a maximum (no cap by default, Round 1 §2). */
export function capPoints(pts: SeriesPoint[], ar: boolean, max = Infinity): SeriesPoint[] {
  if (pts.length <= max) return pts;
  const sorted = [...pts].sort((a, b) => b.value - a.value); const head = sorted.slice(0, max - 1); const rest = sorted.slice(max - 1);
  return [...head, { key: OTHER_KEY, label: ar ? `أخرى (${rest.length})` : `Other (${rest.length})`, value: rest.reduce((s, p) => s + p.value, 0), count: rest.every((p) => p.count !== undefined) ? rest.reduce((s, p) => s + (p.count ?? 0), 0) : undefined }];
}
const TONE: Record<string, string> = { ok: "var(--ek-good)", warn: "var(--ek-attention)", bad: "var(--ek-risk)", info: "var(--ek-info)" };
const KTONE = { ok: "good", warn: "attention", bad: "risk", info: "info" } as const;
const toDatum = (p: SeriesPoint): Datum => ({ key: p.key, label: p.label, value: p.value, drill: p.drill, tone: p.tone ? KTONE[p.tone] : undefined, data: p.data, count: p.count, target: p.target, cross: p.cross });
const colorOf = (p: SeriesPoint, i: number) => (p.tone ? TONE[p.tone] : undefined) ?? seriesColor(p.key, i);
const fmt = (n: number) => (Math.abs(n) >= 1000 ? n.toLocaleString("en-US", { maximumFractionDigits: 0 }) : String(Math.round(n * 100) / 100));
const pick = (ar: boolean, b: Bi) => (ar ? b[1] : b[0]);
/** Short axis label (1.2M / 340K); the full value stays in the title and aria label. */
const fmtShort = (n: number) => { const a = Math.abs(n); return a >= 1e6 ? `${(n / 1e6).toFixed(a >= 1e8 ? 0 : 1)}M` : a >= 1e4 ? `${Math.round(n / 1e3)}K` : fmt(n); };

function Label({ p }: { p: SeriesPoint }) {
  return p.data ? <span data-no-i18n className="bidi-iso" dir="auto">{p.label || "—"}</span> : <span>{p.label || "—"}</span>;
}
const maybeLink = (link: LinkFor | undefined, drill: unknown, node: ReactNode, attrs?: Record<string, string>) => (drill && link ? link(drill, node, attrs) : node);

export function EmptyState({ ar, text }: { ar: boolean; text?: Bi | undefined }) {
  return <p className="py-6 text-center text-sm text-muted-foreground" data-dash-empty>{pick(ar, text ?? ["No records match this widget.", "لا توجد سجلات مطابقة لهذه الأداة."])}</p>;
}

/* ------------------------------------------------------------------ number ------------------------------------------------------------------ */
const QUALITY: Record<string, Bi> = { partial: ["Partial", "جزئي"], stale: ["Stale", "قديم"] };
/** dd/mm/yyyy of an ISO date (visual round R3: one date format everywhere) */
const dmy = (s: string) => s.replace(/^(\d{4})-(\d{2})-(\d{2})$/, "$3/$2/$1");
// values seen on the previous visit (read once per page load, per browser), so a moved card keeps its dot during this visit
const SEEN_KEY = "digit:kpi-last-visit:v1";
let seenPrev: Record<string, number> | null = null;
function lastVisit(): Record<string, number> {
  if (seenPrev) return seenPrev;
  try { seenPrev = JSON.parse(localStorage.getItem(SEEN_KEY) ?? "{}") as Record<string, number>; } catch { seenPrev = {}; }
  return seenPrev!;
}
function remember(key: string, v: number) {
  try { const cur = JSON.parse(localStorage.getItem(SEEN_KEY) ?? "{}") as Record<string, number>; if (cur[key] === v) return; cur[key] = v; localStorage.setItem(SEEN_KEY, JSON.stringify(cur)); } catch { /* storage unavailable */ }
}
/** «كان X — أصبح Y» when the figure moved more than 5% since the user's last visit (null: first visit or unchanged). */
export function movedSinceVisit(prev: number | undefined, now: number): boolean {
  if (prev === undefined || !Number.isFinite(prev)) return false;
  if (prev === 0) return now !== 0;
  return Math.abs((now - prev) / prev) > 0.05;
}
/**
 * KPI card (visual round R3 §3.3): value + change vs the previous period + sparkline + one meta line «حتى dd/mm/yyyy · كل
 * الشركات»; the whole card opens the drill list whose rows add up to the value, and a dot marks a figure that moved more
 * than 5% since the last visit.
 */
function Kpi({ d, ar, link }: { d: Extract<WidgetData, { kind: "number" }>; ar: boolean; link?: LinkFor | undefined }) {
  const meta = [d.asOf ? `${ar ? "حتى" : "As of"} ${dmy(d.asOf)}` : "", d.scopeLabel ? pick(ar, d.scopeLabel) : ""].filter(Boolean);
  const [prev, setPrev] = useState<number | undefined>(undefined);
  useEffect(() => { if (!d.seenKey) return; setPrev(lastVisit()[d.seenKey]); remember(d.seenKey, d.value); }, [d.seenKey, d.value]);
  const moved = d.seenKey && movedSinceVisit(prev, d.value);
  const shown = d.display ?? fmt(d.value);
  return (
    <div className="flex h-full flex-col gap-1" data-dash-view="kpi" {...(d.quality ? { "data-dash-quality": d.quality } : {})}>
      <span className="flex flex-wrap items-baseline gap-2">
        {maybeLink(link, d.drill, <span className="text-3xl font-semibold tabular-nums text-foreground" data-kpi-value data-no-i18n>{shown}</span>, { className: "r3-stretch" })}
        {d.delta && <DeltaChip d={d.delta} ar={ar} />}
        {moved && <span className="r3-moved" role="img" data-kpi-moved title={ar ? `كان ${fmt(prev!)} — أصبح ${fmt(d.value)}` : `Was ${fmt(prev!)} — now ${fmt(d.value)}`} aria-label={ar ? `تغيّر منذ زيارتك الأخيرة: كان ${fmt(prev!)} — أصبح ${fmt(d.value)}` : `Changed since your last visit: was ${fmt(prev!)} — now ${fmt(d.value)}`} />}
        {d.quality && <span className="chip bg-warning/15 text-warning-text" title={d.qualityNote ? pick(ar, d.qualityNote) : undefined}>{pick(ar, QUALITY[d.quality]!)}</span>}
      </span>
      {d.spark && d.spark.length > 1 && <Spark values={d.spark} tone={d.delta && d.delta.pct !== 0 && (d.delta.better ?? "up") === (d.delta.pct > 0 ? "up" : "down") ? "good" : d.delta && Math.abs(d.delta.pct) >= 0.05 ? "risk" : "info"} height={24} label={`${ar ? "الاتجاه" : "Trend"}: ${d.spark.map(fmt).join(", ")}`} />}
      {d.sub?.map((s) => <span key={s} className="text-xs text-muted-foreground tabular-nums" data-no-i18n>{s}</span>)}
      {meta.length > 0 && <span className="r3-kpi-meta mt-auto text-[12px] text-muted-foreground" data-dash-meta>{meta.join(" · ")}</span>}
      {d.note && <span className="text-xs text-muted-foreground">{pick(ar, d.note)}</span>}
    </div>
  );
}

/** Progress line under a KPI value (share of its budget / target, coloured by level), shared by Designer and signal cards. */
export function KpiMeter({ m }: { m: { pct: number; level?: "ok" | "warn" | "over" | undefined; label: string } }) {
  return <span className="ek-kpi-target" data-kpi-meter={Math.round(m.pct * 10) / 10}>
    <span className="ek-kpi-target-bar"><span style={{ width: `${Math.max(0, Math.min(100, m.pct))}%` }} {...(m.level ? { "data-level": m.level } : {})} /></span>
    <span className="ek-kpi-target-l" data-no-i18n>{m.label}</span>
  </span>;
}
/**
 * A Designer number widget drawn as the one Enterprise KPI card (Round 1 §4): title, ⓘ meaning, value opening the drill list
 * (the whole card is the link), change pill, sparkline, one meta line «حتى dd/mm/yyyy · كل الشركات», moved-since-visit dot.
 */
export function KpiWidgetCard({ d, ar, link, title, info, attrs }: { d: Extract<WidgetData, { kind: "number" }>; ar: boolean; link?: LinkFor | undefined; title: ReactNode; info?: ReactNode; attrs?: Record<string, unknown> | undefined }) {
  const metaParts = [d.asOf ? `${ar ? "حتى" : "As of"} ${dmy(d.asOf)}` : "", d.scopeLabel ? pick(ar, d.scopeLabel) : ""].filter(Boolean);
  const [prev, setPrev] = useState<number | undefined>(undefined);
  useEffect(() => { if (!d.seenKey) return; setPrev(lastVisit()[d.seenKey]); remember(d.seenKey, d.value); }, [d.seenKey, d.value]);
  const moved = d.seenKey && movedSinceVisit(prev, d.value);
  const shown = d.display ?? fmt(d.value);
  const off = d.status === "denied" || d.status === "unavailable" || d.status === "pending" || d.status === "unconfigured";
  const meta = <>{d.sub?.map((x) => <span key={x} className="tabular-nums" data-no-i18n>{x} · </span>)}{d.note && <span>{pick(ar, d.note)} · </span>}<span data-dash-meta>{metaParts.join(" · ")}</span></>;
  const extra = <>{moved && <span className="r3-moved" role="img" data-kpi-moved title={ar ? `كان ${fmt(prev!)} — أصبح ${fmt(d.value)}` : `Was ${fmt(prev!)} — now ${fmt(d.value)}`} aria-label={ar ? `تغيّر منذ زيارتك الأخيرة: كان ${fmt(prev!)} — أصبح ${fmt(d.value)}` : `Changed since your last visit: was ${fmt(prev!)} — now ${fmt(d.value)}`} />}
    {d.quality && <span className="chip bg-warning/15 text-warning-text" title={d.qualityNote ? pick(ar, d.qualityNote) : undefined}>{pick(ar, QUALITY[d.quality]!)}</span>}
    {d.meter && <KpiMeter m={d.meter} />}</>;
  const tone = d.tone === "bad" ? "risk" : d.tone === "warn" ? "attention" : d.tone === "info" ? "info" : d.tone === "ok" ? "good" : undefined;
  return <KpiCard ar={ar} label={title} info={info} value={shown} delta={d.delta} spark={d.spark} meta={meta} extra={extra} tone={tone}
    state={off ? <WidgetView data={d} view="kpi" ar={ar} link={link} /> : undefined}
    wrap={d.drill && link ? (node) => link(d.drill, node, { className: "r3-stretch" }) : undefined}
    attrs={{ "data-dash-frame": "", "data-dash-kind": "number", "data-dash-view": "kpi", ...(d.quality ? { "data-dash-quality": d.quality } : {}), ...attrs }}
    Root={(rp) => <section {...(rp as Record<string, unknown>)}>{rp.children}</section>} />;
}

/** Publishes a KPI card's figure to the page band (shared band chip feed): same shown value, same drill, display only. */
export function KpiChip({ k, order, label, d, link }: { k: string; order: number; label: ReactNode; d: Extract<WidgetData, { kind: "number" }>; link?: LinkFor | undefined }) {
  const shown = d.display ?? fmt(d.value);
  const ok = d.status === "ok";
  usePublishChip(k, ok ? { id: k, order, label, value: shown, delta: d.delta ? { pct: d.delta.pct, better: d.delta.better } : undefined, wrap: d.drill && link ? (node) => link(d.drill, node) : undefined } : null,
    `${typeof label === "string" ? label : ""}|${shown}|${d.delta?.pct ?? ""}|${ok}`);
  return null;
}

/* ------------------------------------------------------------------ series ------------------------------------------------------------------ */
const compactFmt = (v: number, ar: boolean) => (Math.abs(v) >= 100_000 ? new Intl.NumberFormat(ar ? "ar-u-nu-latn" : "en-US", { notation: "compact", maximumFractionDigits: 1 }).format(v) : fmt(v));
function Columns({ pts, link, ar = false }: { pts: SeriesPoint[]; link?: LinkFor | undefined; ar?: boolean | undefined }) {
  return <div data-dash-view="bar"><KColumns data={pts.map(toDatum)} ar={ar} wrap={link} fmt={fmt} axisFmt={(v) => compactFmt(v, ar)} /></div>;
}

function HBars({ pts, link, ar = false }: { pts: SeriesPoint[]; link?: LinkFor | undefined; ar?: boolean | undefined }) {
  if (pts.some((p) => p.delta !== undefined)) return <DeltaBars pts={pts} link={link} ar={ar} />;
  return <div data-dash-view="bar"><RankedBars data={pts.map(toDatum)} ar={ar} wrap={link} fmt={fmt} max={pts.length} sort={false} /></div>;
}
/** Ranking with the value written on the bar and the change vs the previous period beside it (visual round R3 §3.5). */
function DeltaBars({ pts, link, ar }: { pts: SeriesPoint[]; link?: LinkFor | undefined; ar: boolean }) {
  const top = Math.max(1, ...pts.map((p) => Math.abs(p.value)));
  return <ol className="r3-hbars" data-dash-view="bar" data-dash-delta-bars>{pts.map((p, i) => {
    const w = Math.max(2, (Math.abs(p.value) / top) * 100); const dl = p.delta;
    return <li key={p.key} className="r3-hbar" data-other={isOther(p.key) || undefined}>
      <span className="r3-hbar-l" title={p.label}>{maybeLink(link, p.drill, <Label p={p} />)}</span>
      <span className="r3-hbar-track"><i style={{ width: `${w}%`, background: isOther(p.key) ? OTHER : i === 0 ? "var(--deep, var(--ek-s1))" : "var(--emerald, var(--ek-s2))" }} /><b data-no-i18n>{compactFmt(p.value, ar)}</b></span>
      <span className="r3-hbar-d" data-good={dl === undefined || Math.abs(dl) < 0.05 ? "flat" : dl < 0 ? "yes" : "no"} title={ar ? "التغير عن الشهر السابق" : "Change vs last month"} data-no-i18n>{dl === undefined ? "—" : Math.abs(dl) < 0.05 ? "0%" : `${dl > 0 ? "▲" : "▼"}${Math.abs(dl).toFixed(1)}%`}</span>
    </li>; })}</ol>;
}
/** A ranking with its per-period view behind a toggle (this month as bars ↔ months as lines of the top series). */
function SeriesWithTrend({ d, ar, link }: { d: Extract<WidgetData, { kind: "series" }>; ar: boolean; link?: LinkFor | undefined }) {
  const [mode, setMode] = useState<"now" | "trend">("now");
  const tr = d.trend!;
  return <div data-dash-trend-toggle>
    <div className="r3-toggle mb-2" role="group" aria-label={ar ? "طريقة العرض" : "View"}>
      <button type="button" aria-pressed={mode === "now"} onClick={() => setMode("now")} data-dash-toggle="now">{ar ? "هذا الشهر" : "This month"}</button>
      <button type="button" aria-pressed={mode === "trend"} onClick={() => setMode("trend")} data-dash-toggle="trend">{tr.label ? pick(ar, tr.label) : ar ? "حسب الشهر" : "By month"}</button>
    </div>
    {mode === "now" ? <HBars pts={d.points} link={link} ar={ar} /> : <MultiLine d={{ kind: "matrix", status: "ok", rowKeys: tr.rowKeys, colKeys: tr.colKeys, values: tr.values }} ar={ar} />}
  </div>;
}

function Line({ pts, area, ar = false, link }: { pts: SeriesPoint[]; area?: boolean; ar?: boolean | undefined; link?: LinkFor | undefined }) {
  return <div data-dash-view={area ? "area" : "line"}><AreaChart data={pts.map(toDatum)} ar={ar} wrap={link} fmt={fmt} axisFmt={fmtShort} /></div>;
}

function Ring({ pts, donut, link, ar = false }: { pts: SeriesPoint[]; donut: boolean; link?: LinkFor | undefined; ar?: boolean | undefined }) {
  return <div data-dash-view={donut ? "donut" : "pie"}><Donut data={pts.map(toDatum)} ar={ar} wrap={link} fmt={fmt} centerFmt={fmtShort} max={6} /></div>;
}

function Funnel({ pts, ar, link }: { pts: SeriesPoint[]; ar: boolean; link?: LinkFor | undefined }) {
  return <div data-dash-view="funnel"><KFunnel data={pts.map(toDatum)} ar={ar} wrap={link} fmt={fmt} /></div>;
}

function Status({ pts, link }: { pts: SeriesPoint[]; link?: LinkFor | undefined }) {
  const total = pts.reduce((s, p) => s + Math.max(0, p.value), 0) || 1;
  return (
    <div data-dash-view="status">
      <div className="flex h-4 w-full overflow-hidden rounded-full bg-muted" role="img" aria-label={pts.map((p) => `${p.label} ${fmt(p.value)}`).join(", ")}>
        {pts.map((p, i) => <span key={p.key} style={{ width: `${(Math.max(0, p.value) / total) * 100}%`, background: colorOf(p, i) }} />)}
      </div>
      <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
        {pts.map((p, i) => (
          <li key={p.key} className="flex items-center gap-2">
            <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: colorOf(p, i) }} aria-hidden />
            {maybeLink(link, p.drill, <span className="truncate"><Label p={p} /></span>)}
            <span className="ms-auto tabular-nums text-muted-foreground" data-no-i18n>{fmt(p.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
/** Ordered process steps as a chain of boxes (count per step, arrow to the next); each box drills to the documents it counts. */
function Chain({ pts, link }: { pts: SeriesPoint[]; link?: LinkFor | undefined }) {
  return (
    <ol className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,9rem),1fr))] gap-2" data-dash-view="chain">
      {pts.map((p, i) => (
        <li key={p.key} className="relative">
          {maybeLink(link, p.drill, (
            <span className="flex h-full flex-col gap-1 rounded-lg border border-border bg-card p-3 shadow-sm transition-colors hover:border-primary/50" style={{ borderTop: `3px solid ${colorOf(p, i)}` }}>
              <span className="text-[11px] font-medium text-muted-foreground"><span className="me-1 tabular-nums" data-no-i18n>{i + 1}</span><Label p={p} /></span>
              <b className="text-2xl tabular-nums leading-none" style={p.tone ? { color: TONE[p.tone] } : undefined} data-no-i18n>{fmt(p.value)}</b>
            </span>
          ), { className: "block h-full" })}
          {i < pts.length - 1 && <span aria-hidden className="pointer-events-none absolute top-1/2 hidden -translate-y-1/2 text-muted-foreground sm:block ltr:-right-2 rtl:-left-2 rtl:-scale-x-100">›</span>}
        </li>
      ))}
    </ol>
  );
}
function SeriesTable({ pts, ar, valueLabel, link }: { pts: SeriesPoint[]; ar: boolean; valueLabel?: Bi | undefined; link?: LinkFor | undefined }) {
  return (
    <table className="w-full text-sm" data-dash-view="table">
      <thead><tr className="text-start text-xs text-muted-foreground"><th className="py-1 text-start font-medium">{ar ? "البند" : "Item"}</th><th className="py-1 text-end font-medium">{pick(ar, valueLabel ?? ["Value", "القيمة"])}</th>{pts.some((p) => p.count !== undefined) && <th className="py-1 text-end font-medium">{ar ? "السجلات" : "Records"}</th>}</tr></thead>
      <tbody>{pts.map((p) => <tr key={p.key} className="border-t border-border"><td className="py-1">{maybeLink(link, p.drill, <Label p={p} />)}</td><td className="py-1 text-end tabular-nums" data-no-i18n>{fmt(p.value)}</td>{p.count !== undefined && <td className="py-1 text-end tabular-nums text-muted-foreground" data-no-i18n>{p.count}</td>}</tr>)}</tbody>
    </table>
  );
}

/* ------------------------------------------------------------------ matrix ------------------------------------------------------------------ */
const PERIODISH = /^(\d{4}-\d{2}|\d{2}-\d{2}|\d+[–-]\d+|\d+\+|0–30|Not due)/;
function Stacked({ d: d0, ar = false, link }: { d: Extract<WidgetData, { kind: "matrix" }>; ar?: boolean; link?: LinkFor | undefined }) {
  const d = capMatrix(d0, ar);
  if (d.values.some((row) => row.some((v) => v < 0))) return <Diverging d={d} />;
  const totals = d.rowKeys.map((_, r) => d.values[r]!.reduce((s, v) => s + Math.max(0, v), 0));
  const colTotals = d.colKeys.map((_, c) => d.rowKeys.reduce((s, _r, r) => s + Math.max(0, d.values[r]![c] ?? 0), 0));
  const max = Math.max(1, ...totals);
  const legend = <ul className="mt-2 flex flex-wrap gap-3 text-xs">{d.colKeys.map((ck, c) => <li key={ck} className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: seriesColor(ck, c) }} aria-hidden /><span data-no-i18n>{ck}</span> <b className="tabular-nums" data-no-i18n>{fmtShort(colTotals[c]!)}</b></li>)}</ul>;
  // record names (customers, contracts, work orders) read best as ranked horizontal bars; periods and age buckets stay columns
  if (!d.rowKeys.every((k) => PERIODISH.test(k))) {
    const order = d.rowKeys.map((rk, r) => ({ rk, r })).sort((a, b) => totals[b.r]! - totals[a.r]!);
    return (
      <div data-dash-view="stacked-bar" data-dash-layout="rows">
        <ul className="space-y-2">{order.map(({ rk, r }) => (
          <li key={rk} className="text-sm">
            <div className="mb-0.5 flex items-baseline gap-2"><span className="min-w-0 flex-1 truncate bidi-iso" dir="auto" data-no-i18n title={rk}>{rk}</span><b className="tabular-nums text-xs" data-no-i18n>{fmtShort(totals[r]!)}</b></div>
            <div className="flex h-3.5 overflow-hidden rounded-sm bg-muted/50" style={{ width: `${Math.max(3, (totals[r]! / max) * 100)}%` }} role="img" aria-label={`${rk}: ${d.colKeys.map((ck, c) => `${ck} ${fmt(d.values[r]![c]!)}`).join(", ")}`}>
              {d.colKeys.map((ck, c) => (d.values[r]![c]! > 0 ? <span key={ck} style={{ flex: d.values[r]![c]!, background: seriesColor(ck, c) }} title={`${rk} · ${ck}: ${fmt(d.values[r]![c]!)}`} /> : null))}
            </div>
          </li>))}</ul>
        {legend}
        {link && d.drill ? <p className="mt-1 text-[11px]">{link(d.drill, <span>{ar ? "فتح السجلات" : "Open the records"}</span>, { className: "text-primary hover:underline" })}</p> : null}
      </div>
    );
  }
  return (
    <div data-dash-view="stacked-bar">
      <div className="flex h-40 items-end gap-2">
        {d.rowKeys.map((rk, r) => (
          <div key={rk} className="flex min-w-0 flex-1 flex-col items-center gap-1">
            <span className="text-[10px] tabular-nums text-muted-foreground" data-no-i18n>{totals[r] ? fmtShort(totals[r]!) : ""}</span>
            <div className="flex w-full flex-col-reverse overflow-hidden rounded-t-[4px]" style={{ height: `${Math.max(2, (totals[r]! / max) * 116)}px` }}>
              {d.colKeys.map((ck, c) => <span key={ck} style={{ flex: Math.max(0, d.values[r]![c]!), background: seriesColor(ck, c) }} title={`${rk} · ${ck}: ${fmt(d.values[r]![c]!)}`} />)}
            </div>
            <span className="w-full truncate text-center text-[11px] text-muted-foreground" data-no-i18n>{rk}</span>
          </div>
        ))}
      </div>
      {legend}
    </div>
  );
}
/**
 * Signed stacked columns (visual round R3 §4 diverging): positive series grow up from the zero line in --positive, negative
 * series grow down in --negative (e.g. joiners up, leavers down); each column keeps its values in the title and the legend.
 */
function Diverging({ d }: { d: Extract<WidgetData, { kind: "matrix" }> }) {
  const up = d.rowKeys.map((_, r) => d.values[r]!.reduce((s, v) => s + Math.max(0, v), 0)), dn = d.rowKeys.map((_, r) => d.values[r]!.reduce((s, v) => s + Math.min(0, v), 0));
  const hi = Math.max(1, ...up), lo = Math.min(-1, ...dn); const span = hi - lo; const H = 160;
  const neg = d.colKeys.map((_, c) => d.values.reduce((s, row) => s + (row[c] ?? 0), 0) < 0);
  const col = (c: number) => (neg[c] ? "var(--negative, var(--ek-risk))" : c === 0 ? "var(--positive, var(--ek-good))" : seriesColor(d.colKeys[c]!, c));
  const tot = d.colKeys.map((_, c) => d.values.reduce((s, row) => s + (row[c] ?? 0), 0));
  return (
    <div data-dash-view="stacked-bar" data-dash-layout="diverging">
      <div className="relative flex items-stretch gap-2" style={{ height: H }}>
        <span className="pointer-events-none absolute inset-x-0 border-t border-[var(--line)]" style={{ top: `${(hi / span) * 100}%` }} aria-hidden />
        {d.rowKeys.map((rk, r) => (
          <div key={rk} className="relative min-w-0 flex-1" title={`${rk}: ${d.colKeys.map((ck, c) => `${ck} ${fmt(Math.abs(d.values[r]![c] ?? 0))}`).join(" · ")}`} role="img" aria-label={`${rk}: ${d.colKeys.map((ck, c) => `${ck} ${fmt(Math.abs(d.values[r]![c] ?? 0))}`).join(", ")}`}>
            <div className="absolute inset-x-[12%] flex flex-col-reverse overflow-hidden rounded-t-[4px]" style={{ bottom: `${(-lo / span) * 100}%`, height: `${(up[r]! / span) * 100}%` }}>{d.colKeys.map((ck, c) => (d.values[r]![c]! > 0 ? <span key={ck} style={{ flex: d.values[r]![c]!, background: col(c) }} /> : null))}</div>
            <div className="absolute inset-x-[12%] flex flex-col overflow-hidden rounded-b-[4px]" style={{ top: `${(hi / span) * 100}%`, height: `${(-dn[r]! / span) * 100}%` }}>{d.colKeys.map((ck, c) => (d.values[r]![c]! < 0 ? <span key={ck} style={{ flex: -d.values[r]![c]!, background: col(c) }} /> : null))}</div>
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-2">{d.rowKeys.map((rk) => <span key={rk} className="min-w-0 flex-1 truncate text-center text-[12px] text-muted-foreground" data-no-i18n>{rk}</span>)}</div>
      <ul className="mt-2 flex flex-wrap gap-3 text-xs">{d.colKeys.map((ck, c) => <li key={ck} className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: col(c) }} aria-hidden /><span data-no-i18n>{ck}</span> <b className="tabular-nums" data-no-i18n>{fmt(Math.abs(tot[c]!))}</b></li>)}</ul>
    </div>
  );
}
/** Several series over ordered periods (matrix: rows = periods, columns = series) as lines on one axis. */
function MultiLine({ d: d0, area, ar = false }: { d: Extract<WidgetData, { kind: "matrix" }>; area?: boolean; ar?: boolean }) {
  const d = capMatrix(d0, ar);
  const W = 560, H = 190, P = { l: 46, r: 10, t: 10, b: 24 }; const iw = W - P.l - P.r, ih = H - P.t - P.b;
  const all = d.values.flat(); const hi = Math.max(1, ...all), lo = Math.min(0, ...all); const span = hi - lo || 1;
  const x = (i: number) => P.l + (d.rowKeys.length === 1 ? iw / 2 : (i * iw) / (d.rowKeys.length - 1));
  const y = (v: number) => P.t + ih - ((v - lo) / span) * ih;
  const ticks = [0, 1, 2, 3, 4].map((k) => lo + (span * k) / 4);
  const every = Math.max(1, Math.ceil(d.rowKeys.length / 8));
  return (
    <div data-dash-view={area ? "area" : "line"} data-dash-series={d.colKeys.length}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" direction="ltr" aria-label={d.colKeys.map((c, ci) => `${c}: ${d.rowKeys.map((r, ri) => `${r} ${fmt(d.values[ri]![ci]!)}`).join(", ")}`).join("; ")}>
        {ticks.map((t) => <g key={t}><line x1={P.l} x2={W - P.r} y1={y(t)} y2={y(t)} stroke="var(--surface, var(--border))" /><text x={P.l - 6} y={y(t) + 4} textAnchor="end" fontSize="12" fill="var(--grey, var(--muted-foreground))">{fmtShort(t)}</text></g>)}
        {lo < 0 && <line x1={P.l} x2={W - P.r} y1={y(0)} y2={y(0)} stroke="var(--muted-foreground)" strokeDasharray="3 3" />}
        {d.rowKeys.map((r, i) => (i % every === 0 || i === d.rowKeys.length - 1 ? <text key={r} x={x(i)} y={H - 5} textAnchor="middle" fontSize="12" fill="var(--grey, var(--muted-foreground))" data-month-key={r}>{r}</text> : null))}
        {d.colKeys.map((c, ci) => { const pts = d.rowKeys.map((_, ri) => [x(ri), y(d.values[ri]![ci] ?? 0)] as const); const path = `M${pts.map((q) => q.join(",")).join("L")}`; const col = seriesColor(c, ci);
          return <g key={c}>{(area || ci === 0) && pts.length > 1 && <path d={`${path}L${pts[pts.length - 1]![0]},${y(Math.max(lo, 0))}L${pts[0]![0]},${y(Math.max(lo, 0))}Z`} fill={col} opacity={0.08} />}
            <path d={path} fill="none" stroke={col} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />{pts.length > 0 && <circle cx={pts[pts.length - 1]![0]} cy={pts[pts.length - 1]![1]} r={3.5} fill={col} />}</g>; })}
      </svg>
      <ul className="mt-1 flex flex-wrap gap-3 text-xs">{d.colKeys.map((c, ci) => <li key={c} className="flex items-center gap-1"><span className="inline-block h-0.5 w-4" style={{ background: seriesColor(c, ci) }} aria-hidden /><span data-no-i18n>{c}</span> <b className="tabular-nums" data-no-i18n>{fmtShort(d.legend === "sum" ? d.values.reduce((t, row) => t + (row[ci] ?? 0), 0) : d.values[d.values.length - 1]?.[ci] ?? 0)}</b></li>)}</ul>
    </div>
  );
}
function Pivot({ d, ar, link }: { d: Extract<WidgetData, { kind: "matrix" }>; ar: boolean; link?: LinkFor | undefined }) {
  return (
    <div className="overflow-x-auto" data-dash-view="pivot">
      <table className="w-full text-sm">
        <thead><tr className="text-xs text-muted-foreground"><th className="py-1 text-start font-medium" />{d.colKeys.map((c) => <th key={c} className="py-1 text-end font-medium" data-no-i18n>{c}</th>)}<th className="py-1 text-end font-medium">{ar ? "الإجمالي" : "Total"}</th></tr></thead>
        <tbody>{d.rowKeys.map((rk, r) => <tr key={rk} className="border-t border-border"><td className="py-1" data-no-i18n>{maybeLink(link, d.rowDrill?.[r], rk, { className: "text-primary hover:underline", "data-dash-row-link": rk })}</td>{d.values[r]!.map((v, c) => <td key={c} className="py-1 text-end tabular-nums" data-no-i18n>{fmt(v)}</td>)}<td className="py-1 text-end font-medium tabular-nums" data-no-i18n>{fmt(d.values[r]!.reduce((s, v) => s + v, 0))}</td></tr>)}</tbody>
      </table>
    </div>
  );
}

/* ------------------------------------------------------------------ rows ------------------------------------------------------------------ */
function Cell({ v, data }: { v: string | number | null | undefined; data?: boolean | undefined }) {
  if (v === null || v === undefined || v === "") return <span className="text-muted-foreground">—</span>;
  return data || typeof v === "number" ? <span data-no-i18n className="bidi-iso" dir="auto">{typeof v === "number" ? fmt(v) : v}</span> : <span>{v}</span>;
}
const PILL_WORD: Record<string, string> = { ok: "success", warn: "warning", bad: "error", info: "info", neutral: "neutral" };
/**
 * Table widget (visual round R3 §3.4 / §5): header 12/16 grey on paper, 44px rows, status cells as semantic pills, rows
 * needing action with a 3px start border (blocker red / review amber), «افتح» on rows that open their records, an
 * optional one-line status headline and inline data bars in amount / percent columns.
 */
function RowsTable({ d, ar, link }: { d: Extract<WidgetData, { kind: "rows" }>; ar: boolean; link?: LinkFor | undefined }) {
  const hasOpen = d.rows.some((r) => r.open && r.drill);
  const maxOf = Object.fromEntries(d.columns.filter((c) => c.bar).map((c) => [c.key, Math.max(1e-9, ...d.rows.map((r) => Math.abs(Number(r.cells[c.key]) || 0)))]));
  return (
    <div className="overflow-x-auto" data-dash-view="table">
      {d.headline && <p className={`r3-headline mb-2`} data-tone={PILL_WORD[d.headline.tone]} data-dash-headline>{pick(ar, d.headline.text)}</p>}
      <table className="r3-table w-full text-sm">
        <thead><tr>{d.columns.map((c) => <th key={c.key} className={c.numeric ? "text-end" : "text-start"} {...(c.numeric ? { "data-num": "" } : {})}>{pick(ar, c.label)}</th>)}{hasOpen && <th className="text-end"><span className="sr-only">{ar ? "إجراء" : "Action"}</span></th>}</tr></thead>
        <tbody>{d.rows.map((r) => <tr key={r.id} {...(r.tone === "bad" || r.tone === "warn" ? { "data-row-tone": r.tone } : {})}>
          {d.columns.map((c, i) => { const v = r.cells[c.key];
            const inner = c.pill && v !== null && v !== undefined && v !== "" ? <span className="r3-pill" data-tone={PILL_WORD[r.pills?.[c.key] ?? "neutral"]}>{String(v)}</span> : <Cell v={v} data={c.data} />;
            const cell = c.bar && typeof v === "number" ? <span className="r3-bar"><i style={{ width: `${Math.min(100, (Math.abs(v) / maxOf[c.key]!) * 100)}%` }} /><span><Cell v={v} data={c.data} /></span></span> : inner;
            return <td key={c.key} className={c.numeric ? "text-end tabular-nums" : ""} {...(c.numeric ? { "data-num": "" } : {})}>{i === 0 ? maybeLink(link, r.drill, cell) : cell}</td>; })}
          {hasOpen && <td className="text-end">{r.open && r.drill ? maybeLink(link, r.drill, <span>{ar ? "افتح" : "Open"}</span>, { className: "r3-open", "data-row-open": r.id }) : null}</td>}
        </tr>)}</tbody>
      </table>
    </div>
  );
}
function Queue({ d, link }: { d: Extract<WidgetData, { kind: "rows" }>; link?: LinkFor | undefined }) {
  const [first, ...rest] = d.columns;
  return (
    <ul className="divide-y divide-border" data-dash-view="queue">
      {d.rows.map((r) => (
        <li key={r.id} className="flex items-center gap-3 py-2 text-sm">
          {r.tone && <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: TONE[r.tone] }} aria-hidden />}
          <span className="min-w-0 flex-1 truncate font-medium">{first ? maybeLink(link, r.drill, <Cell v={r.cells[first.key]} data={first.data} />) : null}</span>
          {rest.slice(0, 3).map((c) => <span key={c.key} className={`shrink-0 text-xs text-muted-foreground ${c.numeric ? "tabular-nums" : ""}`}><Cell v={r.cells[c.key]} data={c.data} /></span>)}
        </li>
      ))}
    </ul>
  );
}
function Timeline({ d, link }: { d: Extract<WidgetData, { kind: "rows" }>; link?: LinkFor | undefined }) {
  const rows = [...d.rows].sort((a, b) => String(a.date ?? "").localeCompare(String(b.date ?? "")));
  const [first, ...rest] = d.columns;
  return (
    <ol className="relative space-y-3 border-s border-border ps-4" data-dash-view="timeline">
      {rows.map((r) => (
        <li key={r.id} className="relative text-sm">
          <span className="absolute -start-[1.32rem] top-1.5 inline-block h-2.5 w-2.5 rounded-full border-2 border-background" style={{ background: r.tone ? TONE[r.tone] : "var(--chart-1)" }} aria-hidden />
          <span className="block text-xs text-muted-foreground tabular-nums" data-no-i18n>{r.date ?? "—"}</span>
          {first && maybeLink(link, r.drill, <span className="font-medium"><Cell v={r.cells[first.key]} data={first.data} /></span>)}
          {rest[0] && <span className="ms-2 text-xs text-muted-foreground"><Cell v={r.cells[rest[0].key]} data={rest[0].data} /></span>}
        </li>
      ))}
    </ol>
  );
}
function Calendar({ d, ar, link }: { d: Extract<WidgetData, { kind: "rows" }>; ar: boolean; link?: LinkFor | undefined }) {
  const dated = d.rows.filter((r) => /^\d{4}-\d{2}-\d{2}/.test(r.date ?? ""));
  const months = [...new Set(dated.map((r) => r.date!.slice(0, 7)))].sort();
  const [mi, setMi] = useState(Math.max(0, months.length - 1));
  const [day, setDay] = useState<string | null>(null);
  const ym = months[mi];
  if (!ym) return <EmptyState ar={ar} text={["No dated records to place on a calendar.", "لا توجد سجلات مؤرخة لعرضها على التقويم."]} />;
  const [y, m] = ym.split("-").map(Number) as [number, number];
  const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay(); const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const byDay = new Map<string, WidgetRow[]>();
  for (const r of dated) if (r.date!.startsWith(ym)) { const k = r.date!.slice(0, 10); byDay.set(k, [...(byDay.get(k) ?? []), r]); }
  const wk = ar ? ["أحد", "إثن", "ثلا", "أرب", "خمي", "جمع", "سبت"] : ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const sel = day ? byDay.get(day) ?? [] : [];
  const firstCol = d.columns[0];
  return (
    <div data-dash-view="calendar">
      <div className="mb-2 flex items-center gap-2 text-sm">
        <button type="button" className="btn-ghost min-h-9 px-2" onClick={() => { setMi((x) => Math.max(0, x - 1)); setDay(null); }} disabled={mi === 0} aria-label={ar ? "الشهر السابق" : "Previous month"}>‹</button>
        <span className="font-medium tabular-nums" data-no-i18n>{ym}</span>
        <button type="button" className="btn-ghost min-h-9 px-2" onClick={() => { setMi((x) => Math.min(months.length - 1, x + 1)); setDay(null); }} disabled={mi >= months.length - 1} aria-label={ar ? "الشهر التالي" : "Next month"}>›</button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[11px]">
        {wk.map((w) => <span key={w} className="text-muted-foreground" data-no-i18n>{w}</span>)}
        {Array.from({ length: first }, (_, i) => <span key={`b${i}`} />)}
        {Array.from({ length: days }, (_, i) => {
          const k = `${ym}-${String(i + 1).padStart(2, "0")}`; const n = byDay.get(k)?.length ?? 0;
          return <button key={k} type="button" onClick={() => setDay(n ? k : null)} disabled={!n} aria-pressed={day === k} aria-label={`${k}: ${n}`} className={`min-h-8 rounded-sm tabular-nums ${n ? "bg-primary/15 font-semibold text-foreground hover:bg-primary/25" : "text-muted-foreground"} ${day === k ? "ring-2 ring-primary" : ""}`} data-no-i18n>{i + 1}{n ? <sup className="ms-0.5">{n}</sup> : null}</button>;
        })}
      </div>
      {sel.length > 0 && firstCol && <ul className="mt-2 space-y-1 text-sm">{sel.map((r) => <li key={r.id}>{maybeLink(link, r.drill, <Cell v={r.cells[firstCol.key]} data={firstCol.data} />)}</li>)}</ul>}
    </div>
  );
}

/* ------------------------------------------------------------------ construction-grade views (additive) ------------------------------------------------------------------ */
/** Dashboard cross-filter wiring passed down by the designer. */
export interface CrossFilter { active: Record<string, string>; set: (key: string, value: string | null) => void }
function CrossBtn({ p, cross, ar }: { p: { cross?: { key: string; value: string } | undefined; label: string }; cross?: CrossFilter | undefined; ar: boolean }) {
  if (!p.cross || !cross) return null;
  const on = cross.active[p.cross.key] === p.cross.value;
  return (
    <button type="button" className={`inline-flex min-h-7 min-w-7 shrink-0 items-center justify-center rounded text-[11px] ${on ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
      aria-pressed={on} onClick={() => cross.set(p.cross!.key, on ? null : p.cross!.value)} data-dash-cross={`${p.cross.key}:${p.cross.value}`}
      aria-label={on ? (ar ? `إلغاء التصفية حسب ${p.label}` : `Clear filter ${p.label}`) : (ar ? `تصفية اللوحة حسب ${p.label}` : `Filter dashboard by ${p.label}`)} title={ar ? "تصفية اللوحة" : "Filter dashboard"}>⧩</button>
  );
}
function HBarsX({ pts, link, cross, ar }: { pts: SeriesPoint[]; link?: LinkFor | undefined; cross?: CrossFilter | undefined; ar: boolean }) {
  const max = Math.max(1, ...pts.map((p) => Math.abs(p.value)));
  return (
    <ul className="space-y-2" data-dash-view="bar">
      {pts.map((p, i) => (
        <li key={p.key} className="grid grid-cols-[minmax(0,9rem)_1fr_auto_auto] items-center gap-2 text-sm">
          <span className="truncate"><Label p={p} /></span>
          {maybeLink(link, p.drill, <span className="block h-3 rounded-sm" style={{ width: `${Math.max(2, (Math.abs(p.value) / max) * 100)}%`, background: colorOf(p, i) }} aria-hidden />, { "aria-label": `${p.label}: ${fmt(p.value)}` })}
          <span className="tabular-nums text-muted-foreground" data-no-i18n>{fmt(p.value)}</span>
          <CrossBtn p={p} cross={cross} ar={ar} />
        </li>
      ))}
    </ul>
  );
}
/** bridge: a point whose key starts with "=" is a total drawn from zero; the others are signed steps from the running value. */
function Waterfall({ pts, ar, link }: { pts: SeriesPoint[]; ar: boolean; link?: LinkFor | undefined }) {
  return <div data-dash-view="waterfall"><KWaterfall data={pts.map(toDatum)} ar={ar} wrap={link} fmt={fmt} axisFmt={fmtShort} /></div>;
}

const ZONE: Record<string, string> = { error: "var(--error)", warning: "var(--tone-warning, var(--warning))", g1: "var(--em-300)", g2: "var(--emerald)", g3: "var(--deep)", platinum: "var(--ink-700)" };
/** A half-circle gauge per point with zones behind (e.g. Nitaqat red → platinum), the needle at the value and the zone named. */
function Gauge({ pts, zones, ar, link }: { pts: SeriesPoint[]; zones: { to: number; tone: string; label: Bi }[]; ar: boolean; link?: LinkFor | undefined }) {
  const max = zones[zones.length - 1]?.to ?? 100; const R = 40, cx = 50, cy = 48;
  const at = (v: number) => { const a = Math.PI * (1 - Math.min(1, Math.max(0, v / max))); return [cx + R * Math.cos(a), cy - R * Math.sin(a)] as const; };
  const arc = (a: number, b: number) => { const [x1, y1] = at(a), [x2, y2] = at(b); return `M${x1.toFixed(2)},${y1.toFixed(2)} A${R},${R} 0 0 1 ${x2.toFixed(2)},${y2.toFixed(2)}`; };
  const zoneOf = (v: number) => zones.find((z) => v < z.to) ?? zones[zones.length - 1]!;
  return (
    <div data-dash-view="gauge">
      <ul className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,12rem),1fr))] gap-4">{pts.map((p) => { const z = zoneOf(p.value); const [nx, ny] = at(p.value);
        return <li key={p.key} className="text-center" data-gauge-zone={z.tone}>
          <svg viewBox="0 0 100 56" className="mx-auto w-full max-w-[14rem]" role="img" direction="ltr" aria-label={`${p.label}: ${fmt(p.value)}% — ${pick(ar, z.label)}`}>
            {zones.map((zz, i) => <path key={zz.tone} d={arc(i ? zones[i - 1]!.to : 0, zz.to)} fill="none" stroke={ZONE[zz.tone] ?? "var(--quiet)"} strokeWidth={9} />)}
            <line x1={cx} y1={cy} x2={nx} y2={ny} stroke="var(--ink)" strokeWidth={2} strokeLinecap="round" /><circle cx={cx} cy={cy} r={3} fill="var(--ink)" />
          </svg>
          <b className="block text-2xl tabular-nums" data-no-i18n>{fmt(p.value)}%</b>
          <span className="r3-pill" data-tone={z.tone === "error" ? "error" : z.tone === "warning" ? "warning" : z.tone === "platinum" ? "info" : "success"}>{pick(ar, z.label)}</span>
          <span className="mt-1 block truncate text-xs text-muted-foreground">{maybeLink(link, p.drill, <Label p={p} />)}</span>
        </li>; })}</ul>
      <ul className="mt-3 flex flex-wrap justify-center gap-3 text-[12px] text-muted-foreground">{zones.map((z, i) => <li key={z.tone} className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: ZONE[z.tone] ?? "var(--quiet)" }} aria-hidden />{pick(ar, z.label)} <bdi data-no-i18n>{i ? `${fmt(zones[i - 1]!.to)}–` : "<"}{fmt(z.to)}%</bdi></li>)}</ul>
    </div>
  );
}
function Bullet({ pts, ar, link, cross, targetLabel }: { pts: SeriesPoint[]; ar: boolean; link?: LinkFor | undefined; cross?: CrossFilter | undefined; targetLabel?: Bi | undefined }) {
  const max = Math.max(1, ...pts.flatMap((p) => [Math.abs(p.value), Math.abs(p.target ?? 0)])) * 1.08;
  return (
    <ul className="space-y-3" data-dash-view="bullet">
      {pts.map((p) => {
        const over = p.target !== undefined && p.value > p.target;
        return (
          <li key={p.key} className="text-sm">
            <div className="mb-1 flex items-center gap-2"><span className="min-w-0 flex-1 truncate">{maybeLink(link, p.drill, <Label p={p} />)}</span>
              <span className="tabular-nums text-xs text-muted-foreground" dir="ltr" data-no-i18n>{fmt(p.value)}{p.target !== undefined ? ` / ${fmt(p.target)}${p.target ? ` · ${Math.round((p.value / p.target) * 100)}%` : ""}` : ""}</span><CrossBtn p={p} cross={cross} ar={ar} /></div>
            <div className="relative h-4 rounded-sm bg-[var(--surface,var(--muted))]" aria-hidden>
              {p.target !== undefined && <span className="absolute inset-y-0 start-0 rounded-sm border border-dashed border-[var(--quiet,var(--border))]" style={{ width: `${(Math.abs(p.target) / max) * 100}%` }} />}
              <span className="absolute inset-y-1 start-0 rounded-sm" style={{ width: `${(Math.abs(p.value) / max) * 100}%`, background: p.tone ? TONE[p.tone] : over ? "var(--negative, var(--destructive))" : "var(--emerald, var(--chart-1))" }} />
              {p.target !== undefined && <span className="absolute inset-y-0 w-0.5 bg-[var(--ink-700,var(--foreground))]" style={{ insetInlineStart: `${(Math.abs(p.target) / max) * 100}%` }} />}
            </div>
          </li>
        );
      })}
      <li className="text-[11px] text-muted-foreground">{ar ? `الخط العمودي = ${pick(ar, targetLabel ?? ["Target", "المستهدف"])}` : `Vertical mark = ${pick(ar, targetLabel ?? ["Target", "المستهدف"])}`}</li>
    </ul>
  );
}
function Heatmap({ d, ar, link }: { d: Extract<WidgetData, { kind: "matrix" }>; ar: boolean; link?: LinkFor | undefined }) {
  const rowLink = link && d.rowDrill?.some(Boolean) ? (ri: number, node: ReactNode) => maybeLink(link, d.rowDrill?.[ri], node, { className: "text-primary hover:underline", "data-dash-row-link": d.rowKeys[ri] ?? "" }) : undefined;
  return <div data-dash-view="heatmap"><KHeatmap rows={d.rowKeys} cols={d.colKeys} values={d.values} ar={ar} fmt={fmt} dataRows dataCols rowLink={rowLink} /></div>;
}

function SCurve({ pts, ar, valueLabel, targetLabel }: { pts: SeriesPoint[]; ar: boolean; valueLabel?: Bi | undefined; targetLabel?: Bi | undefined }) {
  const hasT = pts.some((p) => p.target !== undefined);
  const max = Math.max(1, ...pts.flatMap((p) => [p.value, p.target ?? 0]));
  const xy = (v: number, i: number) => `${pts.length === 1 ? 50 : (i / (pts.length - 1)) * 100},${56 - (v / max) * 52}`;
  return (
    <div data-dash-view="scurve">
      <svg viewBox="0 0 100 60" preserveAspectRatio="none" className="h-40 w-full rtl:-scale-x-100" role="img" aria-label={pts.map((p) => `${p.label} ${fmt(p.value)}${p.target !== undefined ? ` / ${fmt(p.target)}` : ""}`).join(", ")}>
        {hasT && <polyline points={pts.map((p, i) => xy(p.target ?? 0, i)).join(" ")} fill="none" stroke="var(--chart-5)" strokeWidth={1.2} strokeDasharray="3 2" vectorEffect="non-scaling-stroke" />}
        <polyline points={pts.map((p, i) => xy(p.value, i)).join(" ")} fill="none" stroke="var(--chart-1)" strokeWidth={1.6} vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="mt-1 flex justify-between gap-1 text-[11px] text-muted-foreground">{pts.map((p) => <span key={p.key} className="min-w-0 truncate text-center"><Label p={p} /></span>)}</div>
      <ul className="mt-1 flex flex-wrap gap-3 text-[11px]"><li className="flex items-center gap-1"><span className="inline-block h-0.5 w-4" style={{ background: "var(--chart-1)" }} aria-hidden />{pick(ar, valueLabel ?? ["Actual (cumulative)", "الفعلي (تراكمي)"])} <span className="tabular-nums" data-no-i18n>{fmt(pts[pts.length - 1]?.value ?? 0)}</span></li>
        {hasT && <li className="flex items-center gap-1"><span className="inline-block h-0.5 w-4 border-t border-dashed" style={{ borderColor: "var(--chart-5)" }} aria-hidden />{pick(ar, targetLabel ?? ["Planned (cumulative)", "المخطط (تراكمي)"])} <span className="tabular-nums" data-no-i18n>{fmt(pts[pts.length - 1]?.target ?? 0)}</span></li>}</ul>
    </div>
  );
}
// Arabic names open with a generic noun (برج، مجمع، مستودعات …), so they keep two words; Latin names keep the first
const shortName = (s: string) => { const w = s.replace(/^(Al|ال)[- ]/i, "").split(/[\s—–-]+/).filter(Boolean); return /[\u0600-\u06FF]/.test(w[0] ?? "") ? w.slice(0, 2).join(" ").slice(0, 14) : (w[0] ?? s).slice(0, 12); };
function niceTicks(lo: number, hi: number, n = 5) { const span = hi - lo || 1; const step0 = span / (n - 1); const mag = 10 ** Math.floor(Math.log10(step0)); const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= step0) ?? step0; const a = Math.floor(lo / step) * step, b = Math.ceil(hi / step) * step; const out: number[] = []; for (let v = a; v <= b + step / 2; v += step) out.push(Math.round(v * 1000) / 1000); return out; }
function Bubble({ d, ar, link, cross }: { d: Extract<WidgetData, { kind: "xy" }>; ar: boolean; link?: LinkFor | undefined; cross?: CrossFilter | undefined }) {
  // the plot is inset by the largest bubble radius so a project at 100 % or at the top never runs off the card
  const W = 560, H = 270, P = { l: 44 + 31, r: 16 + 31, t: 14 + 24, b: 34 + 10 }; const iw = W - P.l - P.r, ih = H - P.t - P.b;
  const xs = d.points.map((p) => p.x), ys = [...d.points.map((p) => p.y), ...(d.refY ? [d.refY.value] : [])];
  const xt = d.xPct ? [0, 25, 50, 75, 100] : niceTicks(Math.min(0, ...xs), Math.max(1, ...xs));
  const yt = niceTicks(Math.min(0, ...ys), Math.max(1, ...ys) * 1.1);
  const x0 = xt[0]!, x1 = xt[xt.length - 1]!, y0 = yt[0]!, y1 = yt[yt.length - 1]!;
  const sx = (v: number) => P.l + ((v - x0) / (x1 - x0 || 1)) * iw, sy = (v: number) => P.t + ih - ((v - y0) / (y1 - y0 || 1)) * ih;
  const smax = Math.max(1, ...d.points.map((p) => p.size));
  const unitX = d.xPct ? "%" : "", unitY = /%/.test(d.axes.y[0]) ? "%" : "";
  return (
    <div data-dash-view="bubble">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" direction="ltr" aria-label={d.points.map((p) => `${p.label}: ${fmt(p.x)}, ${fmt(p.y)}, ${fmt(p.size)}`).join("; ")}>
        {xt.map((t) => <g key={`x${t}`}><line x1={sx(t)} x2={sx(t)} y1={P.t} y2={P.t + ih} stroke="var(--border)" /><text x={sx(t)} y={H - 18} textAnchor="middle" fontSize="10" fill="var(--muted-foreground)">{fmtShort(t)}{unitX}</text></g>)}
        {yt.map((t) => <g key={`y${t}`}><line x1={P.l} x2={W - P.r} y1={sy(t)} y2={sy(t)} stroke={t === 0 ? "var(--muted-foreground)" : "var(--border)"} /><text x={P.l - 34} y={sy(t) + 3} textAnchor="end" fontSize="10" fill="var(--muted-foreground)">{fmtShort(t)}{unitY}</text></g>)}
        {d.refY && <g data-dash-ref><line x1={P.l} x2={W - P.r} y1={sy(d.refY.value)} y2={sy(d.refY.value)} stroke="var(--muted-foreground)" strokeDasharray="5 4" /><text x={W - P.r} y={sy(d.refY.value) - 4} textAnchor="end" fontSize="10" fill="var(--muted-foreground)">{pick(ar, d.refY.label)} {fmt(d.refY.value)}{unitY}</text></g>}
        {[...d.points].sort((a, b) => b.size - a.size).map((p) => { const i = d.points.indexOf(p); const r = 7 + Math.sqrt(Math.max(0, p.size) / smax) * 24; const col = p.tone ? TONE[p.tone]! : PALETTE[i % PALETTE.length]!;
          const dot = <g><title>{`${p.label} — ${pick(ar, d.axes.x)} ${fmt(p.x)} · ${pick(ar, d.axes.y)} ${fmt(p.y)} · ${pick(ar, d.axes.size)} ${fmt(p.size)}`}</title><circle cx={sx(p.x)} cy={sy(p.y)} r={r} fill={col} fillOpacity={0.32} stroke={col} strokeWidth={1.5} /><text x={sx(p.x)} y={sy(p.y) + 3} textAnchor="middle" fontSize="10" fontWeight={600} fill="var(--foreground)">{shortName(p.label)}</text></g>;
          return <g key={p.key} data-dash-point={p.key}>{maybeLink(link, p.drill, dot)}</g>; })}
        <text x={P.l + iw / 2} y={H - 3} textAnchor="middle" fontSize="10.5" fill="var(--muted-foreground)">{pick(ar, d.axes.x)} →</text>
        <text x={12} y={P.t + ih / 2} textAnchor="middle" fontSize="10.5" fill="var(--muted-foreground)" transform={`rotate(-90 12 ${P.t + ih / 2})`}>{pick(ar, d.axes.y)}</text>
      </svg>
      <p className="mt-0.5 text-[11px] text-muted-foreground">{ar ? `حجم الفقاعة = ${pick(ar, d.axes.size)}` : `Bubble size = ${pick(ar, d.axes.size)}`}</p>
      <details className="mt-1 text-xs" data-dash-values>
        <summary className="cursor-pointer text-muted-foreground">{ar ? `القيم (${d.points.length})` : `Values (${d.points.length})`}</summary>
        <table className="mt-1 w-full text-xs">
          <thead><tr className="text-muted-foreground"><th className="text-start font-medium" /><th className="text-end font-medium">{pick(ar, d.axes.x)}</th><th className="text-end font-medium">{pick(ar, d.axes.y)}</th><th className="text-end font-medium">{pick(ar, d.axes.size)}</th><th /></tr></thead>
          <tbody>{d.points.map((p, i) => <tr key={p.key} className="border-t border-border"><td className="py-0.5"><span className="me-1 inline-block h-2 w-2 rounded-full" style={{ background: p.tone ? TONE[p.tone] : PALETTE[i % PALETTE.length] }} aria-hidden />{maybeLink(link, p.drill, p.data ? <span data-no-i18n>{p.label}</span> : <span>{p.label}</span>)}</td><td className="text-end tabular-nums" data-no-i18n>{fmt(p.x)}</td><td className="text-end tabular-nums" data-no-i18n>{fmt(p.y)}</td><td className="text-end tabular-nums" data-no-i18n>{fmt(p.size)}</td><td className="text-end"><CrossBtn p={p} cross={cross} ar={ar} /></td></tr>)}</tbody>
        </table>
      </details>
    </div>
  );
}
function Radar({ pts }: { pts: SeriesPoint[] }) {
  // scaled to the largest axis value, so a profile of small counts stays readable (values are listed beside it)
  const n = Math.max(3, pts.length); const max = Math.max(1, ...pts.map((p) => Math.abs(p.value)));
  const at = (i: number, v: number) => { const a = (Math.PI * 2 * i) / n - Math.PI / 2; const r = (v / max) * 40; return [50 + r * Math.cos(a), 50 + r * Math.sin(a)] as const; };
  return (
    <div className="flex flex-wrap items-center gap-4" data-dash-view="radar">
      <svg viewBox="0 0 100 100" className="h-44 w-44 shrink-0" role="img" aria-label={pts.map((p) => `${p.label} ${fmt(p.value)}`).join(", ")}>
        {[0.25, 0.5, 0.75, 1].map((k) => <polygon key={k} points={Array.from({ length: n }, (_, i) => at(i, max * k).join(",")).join(" ")} fill="none" stroke="var(--border)" strokeWidth={0.4} />)}
        {Array.from({ length: n }, (_, i) => { const [x, y] = at(i, max); return <line key={i} x1={50} y1={50} x2={x} y2={y} stroke="var(--border)" strokeWidth={0.4} />; })}
        <polygon points={pts.map((p, i) => at(i, p.value).join(",")).join(" ")} fill="var(--chart-1)" fillOpacity={0.25} stroke="var(--chart-1)" strokeWidth={1} />
      </svg>
      <ul className="min-w-0 flex-1 space-y-1 text-sm">{pts.map((p) => <li key={p.key} className="flex gap-2"><span className="min-w-0 truncate"><Label p={p} /></span><span className="ms-auto tabular-nums text-muted-foreground" data-no-i18n>{fmt(p.value)}</span></li>)}</ul>
    </div>
  );
}
function Gantt({ d, ar, link }: { d: Extract<WidgetData, { kind: "rows" }>; ar: boolean; link?: LinkFor | undefined }) {
  const ok = d.rows.filter((r) => /^\d{4}-\d{2}-\d{2}/.test(r.date ?? "") && /^\d{4}-\d{2}-\d{2}/.test(r.end ?? r.date ?? ""));
  if (!ok.length) return <EmptyState ar={ar} text={["No records with a start and end date.", "لا توجد سجلات بتاريخ بداية ونهاية."]} />;
  const t = (s: string) => Date.parse(`${s.slice(0, 10)}T00:00:00Z`);
  const lo = Math.min(...ok.map((r) => t(r.date!))), hi = Math.max(...ok.map((r) => t(r.end ?? r.date!))) + 86400000; const span = hi - lo || 1;
  const today = Date.parse(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`);
  const first = d.columns[0];
  return (
    <div data-dash-view="gantt">
      <div className="mb-1 flex justify-between text-[11px] tabular-nums text-muted-foreground" data-no-i18n><span>{new Date(lo).toISOString().slice(0, 10)}</span><span>{new Date(hi - 86400000).toISOString().slice(0, 10)}</span></div>
      <ul className="relative space-y-1.5">
        {today >= lo && today <= hi && <span className="pointer-events-none absolute inset-y-0 w-px bg-destructive/60" style={{ insetInlineStart: `calc(40% + ${((today - lo) / span) * 60}%)` }} aria-hidden />}
        {ok.map((r) => { const s = t(r.date!), e = t(r.end ?? r.date!) + 86400000; return (
          <li key={r.id} className="grid grid-cols-[40%_60%] items-center text-xs">
            <span className="truncate pe-2">{first ? maybeLink(link, r.drill, <Cell v={r.cells[first.key]} data={first.data} />) : null}</span>
            <span className="relative h-4 rounded-sm bg-muted/50" title={`${r.date} → ${r.end ?? r.date}${r.progress !== undefined ? ` · ${r.progress}%` : ""}`}>
              <span className="absolute inset-y-0 overflow-hidden rounded-sm" style={{ insetInlineStart: `${((s - lo) / span) * 100}%`, width: `${Math.max(1, ((e - s) / span) * 100)}%`, background: r.tone ? TONE[r.tone] : "color-mix(in oklab, var(--chart-1) 45%, transparent)" }}>
                {r.progress !== undefined && <span className="absolute inset-y-0 start-0" style={{ width: `${Math.max(0, Math.min(100, r.progress))}%`, background: "var(--chart-1)" }} aria-hidden />}
              </span>
            </span>
          </li>
        ); })}
      </ul>
      <p className="mt-1 text-[11px] text-muted-foreground">{ar ? "الجزء الداكن = نسبة الإنجاز؛ الخط الأحمر = اليوم" : "Dark part = progress; red line = today"}</p>
    </div>
  );
}
/** Recursive binary split (alternating direction) of non-negative values — a dependency-free treemap. */
function split(items: { p: SeriesPoint; i: number }[], x: number, y: number, w: number, h: number, out: { p: SeriesPoint; i: number; x: number; y: number; w: number; h: number }[]) {
  if (!items.length) return;
  if (items.length === 1) { out.push({ ...items[0]!, x, y, w, h }); return; }
  const total = items.reduce((s, it) => s + Math.max(0, it.p.value), 0) || 1;
  let acc = 0, k = 0; while (k < items.length - 1 && acc + Math.max(0, items[k]!.p.value) <= total / 2) { acc += Math.max(0, items[k]!.p.value); k++; }
  if (k === 0) { acc = Math.max(0, items[0]!.p.value); k = 1; }
  const f = acc / total; const a = items.slice(0, k), b = items.slice(k);
  if (w >= h) { split(a, x, y, w * f, h, out); split(b, x + w * f, y, w * (1 - f), h, out); }
  else { split(a, x, y, w, h * f, out); split(b, x, y + h * f, w, h * (1 - f), out); }
}
function Treemap({ pts, ar, link, cross }: { pts: SeriesPoint[]; ar: boolean; link?: LinkFor | undefined; cross?: CrossFilter | undefined }) {
  const items = pts.map((p, i) => ({ p, i })).filter((x) => x.p.value > 0).sort((a, b) => b.p.value - a.p.value);
  const tiles: { p: SeriesPoint; i: number; x: number; y: number; w: number; h: number }[] = []; split(items, 0, 0, 100, 100, tiles);
  const total = items.reduce((s, x) => s + x.p.value, 0) || 1;
  return (
    <div data-dash-view="treemap">
      <div className="relative h-48 overflow-hidden rounded-sm" role="list">
        {tiles.map(({ p, i, x, y, w, h }) => (
          <div key={p.key} role="listitem" className="absolute border border-background p-1 text-[11px] text-primary-foreground" style={{ insetInlineStart: `${x}%`, top: `${y}%`, width: `${w}%`, height: `${h}%`, background: colorOf(p, i) }} title={`${p.label}: ${fmt(p.value)}`}>
            {w > 12 && h > 14 && <span className="r3-tm-label">{/* label on its own card surface: readable on every tile colour, light and dark */}
              <span className="block truncate font-medium">{maybeLink(link, p.drill, <Label p={p} />)}</span>
              {h > 24 && <span className="block tabular-nums" data-no-i18n>{fmt(p.value)} · {Math.round((p.value / total) * 100)}%</span>}
            </span>}
          </div>
        ))}
      </div>
      <ul className="mt-2 grid grid-cols-1 gap-x-4 gap-y-0.5 text-xs sm:grid-cols-2">{items.map(({ p, i }) => <li key={p.key} className="flex items-center gap-2"><span className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: colorOf(p, i) }} aria-hidden /><span className="min-w-0 truncate">{maybeLink(link, p.drill, <Label p={p} />)}</span><span className="ms-auto tabular-nums text-muted-foreground" data-no-i18n>{fmt(p.value)}</span><CrossBtn p={p} cross={cross} ar={ar} /></li>)}</ul>
    </div>
  );
}
function Kanban({ d, ar, link }: { d: Extract<WidgetData, { kind: "rows" }>; ar: boolean; link?: LinkFor | undefined }) {
  const lanes = d.lanes?.length ? d.lanes : [...new Set(d.rows.map((r) => r.lane ?? "—"))];
  const [first, ...rest] = d.columns;
  return (
    <div className="flex gap-2 overflow-x-auto pb-1" data-dash-view="kanban">
      {lanes.map((l) => { const cards = d.rows.filter((r) => (r.lane ?? "—") === l); return (
        <section key={l} className="flex w-52 shrink-0 flex-col rounded-md bg-muted/60 p-1.5" aria-label={l} data-dash-lane={l}>
          <header className="mb-1 flex items-center px-1 text-xs font-semibold"><span className="min-w-0 flex-1 truncate">{l}</span><span className="tabular-nums text-muted-foreground" data-no-i18n>{cards.length}</span></header>
          <ul className="space-y-1">{cards.map((r) => <li key={r.id} className="rounded border border-border bg-card p-1.5 text-xs shadow-sm">
            {r.tone && <span className="me-1 inline-block h-2 w-2 rounded-full" style={{ background: TONE[r.tone] }} aria-hidden />}
            <span className="font-medium">{first ? maybeLink(link, r.drill, <Cell v={r.cells[first.key]} data={first.data} />) : null}</span>
            {rest.slice(0, 2).map((c) => <span key={c.key} className="block truncate text-muted-foreground"><Cell v={r.cells[c.key]} data={c.data} /></span>)}
          </li>)}{!cards.length && <li className="px-1 py-2 text-center text-[11px] text-muted-foreground">{ar ? "لا شيء" : "None"}</li>}</ul>
        </section>
      ); })}
    </div>
  );
}

/* ------------------------------------------------------------------ chart footer (visual round R3 §4) ------------------------------------------------------------------ */
const MON = { ar: ["ينا", "فبر", "مار", "أبر", "ماي", "يون", "يول", "أغس", "سبت", "أكت", "نوف", "ديس"], en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] };
const monthOf = (k: string, ar: boolean) => { const m = k.match(/^(\d{4})-(\d{2})$/); return m ? `${MON[ar ? "ar" : "en"][Number(m[2]) - 1] ?? m[2]} ${m[1]}` : k; };
const isMonth = (k: string) => /^\d{4}-\d{2}$/.test(k);
const pctTxt = (v: number) => `${v > 0 ? "▲" : v < 0 ? "▼" : ""}${Math.abs(v).toFixed(1)}%`;
/** The one computed sentence under a chart: the latest period against the one before, or the largest part and its share. */
/** A data label inside an insight sentence: the display-only translation of a sample / catalogue name on Arabic screens
 * (the DOM layer translates exact-match labels only, not names inside a sentence). */
const name = (s: string, ar: boolean) => { if (!ar) return s; const x = tAr(s); return x !== s ? x : sampleNameAr(s) ?? s; };
export function chartInsight(d: WidgetData, ar: boolean): string | null {
  if (d.insight) return d.insight;
  if (d.status !== "ok") return null;
  if (d.kind === "series" && d.points.length) {
    const pts = d.points;
    if (pts.length > 1 && pts.every((p) => isMonth(p.key))) {
      const a = pts[pts.length - 1]!, b = pts[pts.length - 2]!; const ch = b.value ? ((a.value - b.value) / Math.abs(b.value)) * 100 : null;
      return ar ? `${monthOf(a.key, ar)}: ${fmt(a.value)}${ch === null ? "" : ` · ${pctTxt(ch)} عن ${monthOf(b.key, ar)}`}` : `${monthOf(a.key, ar)}: ${fmt(a.value)}${ch === null ? "" : ` · ${pctTxt(ch)} vs ${monthOf(b.key, ar)}`}`;
    }
    if (pts.some((p) => p.key.startsWith("="))) {
      // bridge: start → end and the largest step
      const tots = pts.filter((p) => p.key.startsWith("=")); const a = tots[0]!, b = tots[tots.length - 1]!; const steps = pts.filter((p) => !p.key.startsWith("="));
      const big = [...steps].sort((x, y) => Math.abs(y.value) - Math.abs(x.value))[0]; const ch = a.value ? ((b.value - a.value) / Math.abs(a.value)) * 100 : null;
      const lbl = (p: SeriesPoint) => (isMonth(p.label) ? monthOf(p.label, ar) : name(p.label, ar));
      return ar ? `من ${lbl(a)} إلى ${lbl(b)}: ${fmt(b.value - a.value)}${ch === null ? "" : ` (${pctTxt(ch)})`}${big ? ` · أكبر تغير: ${lbl(big)} ${fmt(big.value)}` : ""}` : `${lbl(a)} to ${lbl(b)}: ${fmt(b.value - a.value)}${ch === null ? "" : ` (${pctTxt(ch)})`}${big ? ` · largest step: ${lbl(big)} ${fmt(big.value)}` : ""}`;
    }
    const total = pts.reduce((s, p) => s + Math.max(0, p.value), 0); const top = [...pts].filter((p) => !isOther(p.key) && !/^(أخرى|Other)\b/.test(p.label)).sort((x, y) => y.value - x.value)[0];
    if (!top) return null;
    if (!total || top.value <= 0) return null;
    const share = (top.value / total) * 100;
    return ar ? `الأعلى: ${name(top.label, ar)} — ${fmt(top.value)} (${share.toFixed(1)}% من الإجمالي ${fmt(total)})` : `Largest: ${top.label} — ${fmt(top.value)} (${share.toFixed(1)}% of ${fmt(total)})`;
  }
  if (d.kind === "matrix" && d.rowKeys.length) {
    const tot = d.colKeys.map((_, c) => d.values.reduce((s, row) => s + (row[c] ?? 0), 0)); let ci = 0; tot.forEach((v, i) => { if (v > tot[ci]!) ci = i; });
    const all = tot.reduce((s, v) => s + Math.max(0, v), 0);
    if (!all || !d.colKeys.length) return null;
    return ar ? `أكبر سلسلة: ${d.colKeys[ci]} — ${((tot[ci]! / all) * 100).toFixed(1)}% من المجموع` : `Largest series: ${d.colKeys[ci]} — ${((tot[ci]! / all) * 100).toFixed(1)}% of the total`;
  }
  if (d.kind === "rows" && d.rows.length) {
    const act = d.rows.filter((r) => r.tone === "bad" || r.tone === "warn").length;
    return ar ? `${d.rows.length} صفًا${act ? ` · ${act} يحتاج إجراء` : " · لا شيء يحتاج إجراء"}` : `${d.rows.length} rows${act ? ` · ${act} need action` : " · nothing needs action"}`;
  }
  return null;
}
/** The date range a chart covers: first – last month of its periods, else the as-of date. */
export function chartRange(d: WidgetData, ar: boolean, on: string): string {
  if (d.range) return d.range;
  const keys = d.kind === "series" ? d.points.map((p) => p.key) : d.kind === "matrix" ? d.rowKeys : [];
  const months = keys.filter(isMonth).sort();
  if (months.length > 1) return `${monthOf(months[0]!, ar)} – ${monthOf(months[months.length - 1]!, ar)}`;
  if (months.length === 1) return monthOf(months[0]!, ar);
  const asOf = d.asOf ?? on;
  return `${ar ? "حتى" : "As of"} ${dmy(asOf)}`;
}
export function ChartFoot({ data, ar, on }: { data: WidgetData; ar: boolean; on: string }) {
  if (data.kind === "number" || data.kind === "panel" || data.status === "denied" || data.status === "unavailable" || data.status === "pending" || data.status === "unconfigured") return null;
  const ins = chartInsight(data, ar);
  return <footer className="r3-chart-foot" data-dash-foot>{ins && <p className="r3-insight" data-dash-insight>{ins}</p>}<span className="r3-range" data-dash-range>{chartRange(data, ar, on)}</span></footer>;
}

/** Render widget data in a view (the composer has already validated view ↔ shape compatibility). */
export function WidgetView({ data, view, ar, link, cross }: { data: WidgetData; view: ViewKind; ar: boolean; link?: LinkFor | undefined; cross?: CrossFilter | undefined }) {
  if (data.status === "denied") return <EmptyState ar={ar} text={data.reason ?? ["You do not have permission to see this data.", "ليست لديك صلاحية لعرض هذه البيانات."]} />;
  if (data.status === "unavailable") return <EmptyState ar={ar} text={data.reason ?? ["This source is not available in this system.", "هذا المصدر غير متاح في هذا النظام."]} />;
  if (data.status === "pending") return <EmptyState ar={ar} text={data.reason ?? ["The definition of this figure is pending approval.", "تعريف هذا الرقم بانتظار الاعتماد."]} />;
  if (data.status === "unconfigured") return <EmptyState ar={ar} text={data.reason ?? ["Not configured: this figure needs a setting that has not been entered yet.", "غير مُعَدّ: يحتاج هذا الرقم إلى إعداد لم يُدخل بعد."]} />;
  if (data.kind === "number") return <Kpi d={data} ar={ar} link={link} />;
  if (data.kind === "series") {
    if (!data.points.length || data.status === "empty") return <EmptyState ar={ar} text={data.reason} />;
    const pts = data.points;
    // money split cards show the Riyal sign (unit SAR, or the generic "Amount" value label used by app money series)
    const splitMoney = (v: number) => (data.unitLabel?.[0] === "SAR" || data.valueLabel?.[0] === "Amount" ? fmtCurrency(v, "SAR") : fmt(v));
    if (view === "split") return <SplitBars ar={ar} wrap={link} value={data.split?.display || splitMoney(pts[0]?.value ?? 0)}
      pct={data.split?.pct ? { value: data.split.pct.value, label: pick(ar, data.split.pct.label) } : undefined} delta={data.split?.delta} review={data.split?.review}
      bars={pts.map((p, i) => ({ key: p.key, label: p.label, solid: p.value, pending: p.pending, display: p.display ?? splitMoney(p.value), pendingDisplay: p.pendingDisplay ?? (p.pending ? splitMoney(p.pending) : undefined), tone: (["emerald", "blue", "teal", "amber"] as const)[i % 4], drill: p.drill }))} />;
    if (data.trend && (view === "bar" || view === "table")) return <SeriesWithTrend d={data} ar={ar} link={link} />;
    if (view === "line" || view === "area") return <Line pts={pts} area={view === "area"} ar={ar} link={link} />;
    if (view === "donut" || view === "pie") return <Ring pts={capPoints(pts, ar)} donut={view === "donut"} link={link} ar={ar} />;
    if (view === "funnel") return <Funnel pts={pts} ar={ar} link={link} />;
    if (view === "status") return data.steps ? <Chain pts={pts} link={link} /> : <Status pts={pts.some((p) => p.tone) ? pts : capPoints(pts, ar)} link={link} />;
    if (view === "table") return <SeriesTable pts={pts} ar={ar} valueLabel={data.valueLabel} link={link} />;
    if (view === "waterfall") return <Waterfall pts={pts} ar={ar} link={link} />;
    if (view === "bullet") return data.zones?.length ? <Gauge pts={pts} zones={data.zones} ar={ar} link={link} /> : <Bullet pts={pts} ar={ar} link={link} cross={cross} targetLabel={data.targetLabel} />;
    if (view === "scurve") return <SCurve pts={pts} ar={ar} valueLabel={data.valueLabel} targetLabel={data.targetLabel} />;
    if (view === "radar") return <Radar pts={pts} />;
    if (view === "treemap") return <Treemap pts={pts} ar={ar} link={link} cross={cross} />;
    if (pts.every((p) => /^\d{4}-\d{2}/.test(p.key))) return <Columns pts={pts} link={link} ar={ar} />;
    return pts.some((p) => p.cross) && cross ? <HBarsX pts={pts} link={link} cross={cross} ar={ar} /> : <HBars pts={pts} link={link} ar={ar} />;
  }
  if (data.kind === "matrix") {
    if (!data.rowKeys.length) return <EmptyState ar={ar} text={data.reason} />;
    if (view === "heatmap") return <Heatmap d={data} ar={ar} link={link} />;
    if (view === "line" || view === "area") return <MultiLine d={data} area={view === "area"} ar={ar} />;
    return view === "pivot" || view === "table" ? <Pivot d={data} ar={ar} link={link} /> : <Stacked d={data} ar={ar} link={link} />;
  }
  if (data.kind === "xy") {
    if (!data.points.length) return <EmptyState ar={ar} text={data.reason} />;
    if (view === "table") return <table className="w-full text-sm" data-dash-view="table"><thead><tr className="text-xs text-muted-foreground"><th className="text-start font-medium" /><th className="text-end font-medium">{pick(ar, data.axes.x)}</th><th className="text-end font-medium">{pick(ar, data.axes.y)}</th><th className="text-end font-medium">{pick(ar, data.axes.size)}</th></tr></thead><tbody>{data.points.map((p) => <tr key={p.key} className="border-t border-border"><td className="py-1">{maybeLink(link, p.drill, p.data ? <span data-no-i18n>{p.label}</span> : <span>{p.label}</span>)}</td><td className="text-end tabular-nums" data-no-i18n>{fmt(p.x)}</td><td className="text-end tabular-nums" data-no-i18n>{fmt(p.y)}</td><td className="text-end tabular-nums" data-no-i18n>{fmt(p.size)}</td></tr>)}</tbody></table>;
    return <Bubble d={data} ar={ar} link={link} cross={cross} />;
  }
  if (data.kind === "rows") {
    if (!data.rows.length) return <EmptyState ar={ar} text={data.reason} />;
    if (view === "timeline") return <Timeline d={data} link={link} />;
    if (view === "calendar") return <Calendar d={data} ar={ar} link={link} />;
    if (view === "queue") return <Queue d={data} link={link} />;
    if (view === "gantt") return <Gantt d={data} ar={ar} link={link} />;
    if (view === "kanban") return <Kanban d={data} ar={ar} link={link} />;
    return <RowsTable d={data} ar={ar} link={link} />;
  }
  return null;
}
