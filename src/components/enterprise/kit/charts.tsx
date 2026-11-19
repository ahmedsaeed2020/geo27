/**
 * DIGIT Enterprise chart kit (presentation layer, owner 2026-11-12 §B). One dependency-free implementation of every
 * chart the Enterprise templates use — Pro, HR, Construction, CRM and FSM pass data in, never draw their own charts.
 * Colours come only from the brand roles in kit.css (good / attention / risk / secondary / info / neutral + the
 * categorical --dx-chart-* palette); bars fill their card; every mark has a text equivalent (label, value, tooltip and
 * aria-label) and every datum with a drill opens its records through the caller's `wrap`. Record values (party, item,
 * warehouse…) carry `data` and are never translated (data-no-i18n). Display only: nothing here reads or writes records.
 */
import { KpiCard, signOf } from "./KpiCard";
import { createContext, Fragment, isValidElement, useContext, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { fmtCurrency, riyal } from "@/lib/format";
import { SAUDI_REGIONS, SAUDI_VIEWBOX } from "./saudiRegions";

/* ------------------------------------------------------------------ contract ------------------------------------------------------------------ */
export type Tone = "good" | "attention" | "risk" | "secondary" | "info" | "neutral";
export type Bi = readonly [string, string];
export interface Datum { key: string; label: string; value: number; drill?: unknown; tone?: Tone | undefined; /** change vs the comparison period, shown as a chip in legends that list values (donut) */ delta?: Delta | undefined; /** a fixed colour token (e.g. a record category's hue), so one category keeps one colour across a page */ color?: string | undefined; data?: boolean | undefined; count?: number | undefined; target?: number | undefined; sub?: string | undefined; cross?: { key: string; value: string } | undefined; /** extra attributes on the mark's link (test/automation markers) */ attrs?: Record<string, string> | undefined; /** a rich label (an app's own translated / record node) drawn instead of `label`; `label` stays the plain text for screen readers */ node?: ReactNode }
/** Opens the records behind a mark (the caller's link component: DrillLink, router Link…). */
export type Wrap = (drill: unknown, children: ReactNode, attrs?: Record<string, string>) => ReactNode;
export type Fmt = (v: number) => string;

export const TONE_VAR: Record<Tone, string> = { good: "var(--ek-good)", attention: "var(--ek-attention)", risk: "var(--ek-risk)", secondary: "var(--ek-secondary)", info: "var(--ek-info)", neutral: "var(--ek-neutral)" };
/** The eight categorical colours of the active chart palette (kit/palettes.ts; Emerald by default, module hue first). */
export const SERIES = ["var(--ek-s1)", "var(--ek-s2)", "var(--ek-s3)", "var(--ek-s4)", "var(--ek-s5)", "var(--ek-s6)", "var(--ek-s7, var(--cat-7))", "var(--ek-s8, var(--cat-8))"];
const colorOf = (d: { tone?: Tone | undefined; color?: string | undefined }, i: number, fallback?: string) => (d.color ?? (d.tone ? TONE_VAR[d.tone] : fallback ?? SERIES[i % SERIES.length]!));

/* ------------------------------------------------------------------ number formats ------------------------------------------------------------------ */
/** Negative chart figures carry the real minus sign (U+2212), as every amount on the page does (owner GL-09). */
const minus = (t: string) => t.replace(/^-/, "\u2212");
export const num: Fmt = (v) => minus(Math.abs(v) >= 1000 ? Math.round(v).toLocaleString("en-US") : String(Math.round(v * 100) / 100));
export const short: Fmt = (v) => { const a = Math.abs(v); return minus(a >= 1e9 ? `${(v / 1e9).toFixed(1)}B` : a >= 1e6 ? `${(v / 1e6).toFixed(a >= 1e8 ? 0 : 1)}M` : a >= 1e4 ? `${Math.round(v / 1e3)}K` : num(v)); };
export const pct = (v: number, digits = 0) => `${(Math.round(v * 10 ** digits) / 10 ** digits).toLocaleString("en-US")}%`;
/** Full amount with the official Riyal sign (SAR) or the ISO code (other currencies). */
export const money = (currency?: string): Fmt => (v) => fmtCurrency(v, currency);
/** Compact amount for axes and tiles ("⃁ 1.2M"); the full amount stays in the tooltip. */
const MONTHS_AR = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
const MONTHS_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "2026-11" → "نوفمبر" / "Nov" (Gregorian, as the source dates are). */
export const monthLabel = (ym: string, ar: boolean) => { const m = Number(ym.slice(5, 7)); return m >= 1 && m <= 12 ? (ar ? MONTHS_AR : MONTHS_EN)[m - 1]! : ym; };
export const moneyShort = (currency?: string): Fmt => (v) => (!currency || currency === "SAR" ? riyal(short(v)) : `${currency} ${short(v)}`);

function L({ d }: { d: { label: string; data?: boolean | undefined; node?: ReactNode } }) {
  if (d.node !== undefined && d.node !== null) return <span>{d.node}</span>;
  return d.data ? <bdi data-no-i18n dir="auto">{d.label || "—"}</bdi> : <span>{d.label || "—"}</span>;
}
const wrapIf = (wrap: Wrap | undefined, drill: unknown, node: ReactNode, attrs?: Record<string, string>) => (drill !== undefined && drill !== null && wrap ? wrap(drill, node, attrs) : node);
export function KitEmpty({ text, ar }: { text?: Bi | undefined; ar: boolean }) {
  return <p className="ek-empty" data-ek-empty>{text ? (ar ? text[1] : text[0]) : ar ? "لا توجد بيانات في هذه الفترة." : "No data in this period."}</p>;
}

/* ------------------------------------------------------------------ rich tooltip ------------------------------------------------------------------ */
export interface TipContent { title: ReactNode; value?: ReactNode | undefined; rows?: [ReactNode, ReactNode][] | undefined; note?: ReactNode | undefined }
/** One floating tooltip per chart: hover or keyboard focus shows title · value · detail rows. */
export function useTip() {
  const ref = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<{ x: number; y: number; c: TipContent } | null>(null);
  const place = (cx: number, cy: number, c: TipContent) => { const r = ref.current?.getBoundingClientRect(); if (r) setTip({ x: cx - r.left, y: cy - r.top, c }); };
  const on = (c: TipContent) => ({
    onMouseMove: (e: React.MouseEvent) => place(e.clientX, e.clientY, c),
    onMouseLeave: () => setTip(null),
    onFocus: (e: React.FocusEvent<Element>) => { const b = e.currentTarget.getBoundingClientRect(); place(b.left + b.width / 2, b.top, c); },
    onBlur: () => setTip(null),
  });
  const layer = tip ? <div className="ek-tip" role="tooltip" style={{ left: tip.x, top: tip.y }} data-ek-tip>
    <div className="ek-tip-title">{tip.c.title}</div>
    {tip.c.value !== undefined && <div className="ek-tip-value" data-no-i18n>{tip.c.value}</div>}
    {tip.c.rows?.map(([k, v], i) => <div key={i} className="ek-tip-row"><span>{k}</span><b data-no-i18n>{v}</b></div>)}
    {tip.c.note && <div className="ek-tip-note">{tip.c.note}</div>}
  </div> : null;
  return { ref, on, layer };
}

/* ------------------------------------------------------------------ cross-filter + slicers ------------------------------------------------------------------ */
export interface CrossFilter { active: Record<string, string>; set: (key: string, value: string | null) => void }
const CrossCtx = createContext<CrossFilter | null>(null);
/** Page-level cross-filter: a click on a slicer chip or a chart mark filters every chart on the page that reads it. */
export function CrossFilterProvider({ children, initial = {} }: { children: ReactNode; initial?: Record<string, string> }) {
  const [active, setActive] = useState<Record<string, string>>(initial);
  const value = useMemo<CrossFilter>(() => ({ active, set: (key, v) => setActive((a) => { const n = { ...a }; if (v === null) delete n[key]; else n[key] = v; return n; }) }), [active]);
  return <CrossCtx.Provider value={value}>{children}</CrossCtx.Provider>;
}
export const useCrossFilter = () => useContext(CrossCtx);
export function SlicerChips({ label, options, value, onChange, crossKey, ar }: { label: string; options: { value: string; label: string; count?: number | undefined; data?: boolean | undefined }[]; value?: string | null | undefined; onChange?: (v: string | null) => void; crossKey?: string | undefined; ar: boolean }) {
  const cf = useCrossFilter();
  const cur = crossKey && cf ? cf.active[crossKey] ?? null : value ?? null;
  const set = (v: string | null) => { if (crossKey && cf) cf.set(crossKey, v); onChange?.(v); };
  return <div className="ek-slicers" role="group" aria-label={label} data-ek-slicer={crossKey ?? label}>
    <span className="ek-slicers-label">{label}</span>
    <button type="button" className="ek-chip" aria-pressed={cur === null} onClick={() => set(null)}>{ar ? "الكل" : "All"}</button>
    {options.map((o) => <button key={o.value} type="button" className="ek-chip" aria-pressed={cur === o.value} onClick={() => set(cur === o.value ? null : o.value)} data-ek-slicer-option={o.value}>
      {o.data ? <bdi data-no-i18n>{o.label}</bdi> : o.label}{o.count !== undefined && <span className="ek-chip-n" data-no-i18n>{o.count}</span>}</button>)}
  </div>;
}

/* ------------------------------------------------------------------ sparkline + KPI tile ------------------------------------------------------------------ */
export function Spark({ values, tone = "good", height = 30, area = true, label }: { values: number[]; tone?: Tone; height?: number; area?: boolean; label?: string }) {
  if (values.length < 2) return null;
  const max = Math.max(...values), min = Math.min(...values), span = max - min || 1;
  const xy = values.map((v, i) => [(i / (values.length - 1)) * 100, 28 - ((v - min) / span) * 24] as const);
  const line = xy.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
  const last = xy[xy.length - 1]!;
  return <svg className="ek-spark" viewBox="0 0 100 30" preserveAspectRatio="none" style={{ height, color: TONE_VAR[tone] }} role="img" aria-label={label ?? values.map(num).join(", ")} data-ek-chart="spark">
    {area && <polygon points={`0,30 ${line} 100,30`} fill="currentColor" opacity={0.12} />}
    <polyline points={line} fill="none" stroke="currentColor" strokeWidth={1.6} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
    <circle cx={last[0]} cy={last[1]} r={2.2} fill="currentColor" vectorEffect="non-scaling-stroke" />
  </svg>;
}
export interface Delta { /** change in percent (signed) */ pct: number; /** which direction is good for this figure ("none": neither) */ better?: "up" | "down" | "none" | undefined; label?: string | undefined }
export function DeltaChip({ d, ar }: { d: Delta; ar: boolean }) {
  const up = d.pct > 0, flat = Math.abs(d.pct) < 0.05;
  // better "none": the figure has no good direction — the chip shows the change without a good / bad colour
  const good = flat || d.better === "none" ? undefined : (d.better ?? "up") === "up" ? up : !up;
  return <span className="ek-delta" data-good={good === undefined ? "flat" : good ? "yes" : "no"} title={d.label} data-ek-delta={d.pct}>
    <span aria-hidden>{flat ? "■" : up ? "▲" : "▼"}</span><bdi data-no-i18n>{pct(Math.abs(d.pct), 1)}</bdi>{d.label && <span className="ek-delta-l">{d.label}</span>}
    <span className="sr-only">{flat ? (ar ? "دون تغيير" : "unchanged") : up ? (ar ? "ارتفاع" : "up") : ar ? "انخفاض" : "down"}</span>
  </span>;
}
export interface KpiTileProps { /** the page's one Hero KPI (owner 2026-11-12): wider card, ~3x visual weight */ hero?: boolean | undefined; /** actual vs target, only where a target exists */ target?: { actual: number; target: number; label?: ReactNode } | undefined; /** last-updated stamp */ updated?: ReactNode; label: ReactNode; value: ReactNode; sub?: ReactNode; delta?: Delta | undefined; spark?: number[] | undefined; tone?: Tone | undefined; wrap?: ((node: ReactNode) => ReactNode) | undefined; info?: ReactNode; ar: boolean; attrs?: Record<string, string | undefined>; state?: ReactNode }
/** KPI tile (kit API kept for every caller): drawn by the one Enterprise KPI card (kit/KpiCard.tsx, Round 1 §4). */
export function KpiTile({ label, value, sub, delta, spark, tone, wrap, info, ar, attrs, state, hero, target, updated }: KpiTileProps) {
  const pct = target && target.target > 0 ? Math.max(0, Math.min(1.2, target.actual / target.target)) : null;
  const extra = <>{pct !== null && target && <div className="ek-kpi-target" data-ek-target={Math.round(pct * 100)}>
      <span className="ek-kpi-target-bar"><span style={{ width: `${Math.min(100, pct * 100)}%` }} data-over={pct > 1 || undefined} /></span>
      <span className="ek-kpi-target-l">{ar ? "الفعلي مقابل المستهدف" : "Actual vs target"} <bdi data-no-i18n>{Math.round(pct * 100)}%</bdi>{target.label ? <> · {target.label}</> : null}</span>
    </div>}
    {updated && <p className="ek-kpi-updated">{ar ? "آخر تحديث" : "Updated"} <bdi data-no-i18n>{updated}</bdi></p>}</>;
  return <KpiCard label={label} value={value} meta={sub} delta={delta} spark={spark} tone={tone} wrap={wrap} info={info} ar={ar} state={state} extra={extra}
    className={hero ? "ek-kpi-hero" : undefined} attrs={{ ...(hero ? { "data-ek-hero": "" } : {}), ...attrs }} />;
}

/* ------------------------------------------------------------------ gauges ------------------------------------------------------------------ */
export function HalfGauge({ value, target, label, fmt = num, ar, tone }: { value: number; target: number; label?: ReactNode; fmt?: Fmt; ar: boolean; tone?: Tone }) {
  const f = target > 0 ? Math.max(0, Math.min(1.2, value / target)) : 0;
  const arc = (from: number, to: number) => { const a0 = Math.PI * (1 - from), a1 = Math.PI * (1 - Math.min(1, to)); const p = (a: number) => `${50 + 40 * Math.cos(a)},${50 - 40 * Math.sin(a)}`; return `M${p(a0)} A40,40 0 0 1 ${p(a1)}`; };
  const t = tone ?? (f >= 1 ? "good" : f >= 0.75 ? "attention" : "risk");
  const gid = `ekg${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  // brand gradient fill (owner 2026-11-13: gauges in green / mint gradients); status tones keep their own colour
  return <div className="ek-gauge" data-ek-chart="half-gauge" role="img" aria-label={`${fmt(value)} / ${fmt(target)}`}>
    <svg viewBox="0 0 100 56">{t === "good" && <defs><linearGradient id={gid} x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor="var(--ek-deep)" /><stop offset="100%" stopColor="var(--ek-mint)" /></linearGradient></defs>}
      <path d={arc(0, 1)} className="ek-gauge-track" /><path d={arc(0, f)} style={{ stroke: t === "good" ? `url(#${gid})` : TONE_VAR[t] }} className="ek-gauge-fill" /></svg>
    <div className="ek-gauge-c"><b data-no-i18n>{target > 0 ? pct(f * 100) : "—"}</b><span>{label ?? (ar ? "من المستهدف" : "of target")}</span></div>
    <div className="ek-gauge-foot" data-no-i18n><span>{fmt(value)}</span><span>{fmt(target)}</span></div>
  </div>;
}
export function ProgressRings({ items, ar }: { items: { key: string; label: string; value: number; max: number; tone?: Tone | undefined; drill?: unknown; data?: boolean }[]; ar: boolean; wrap?: Wrap }) {
  if (!items.length) return <KitEmpty ar={ar} />;
  return <ul className="ek-rings" data-ek-chart="rings">{items.map((it) => { const f = it.max > 0 ? Math.max(0, Math.min(1, it.value / it.max)) : 0; const C = 2 * Math.PI * 16;
    return <li key={it.key} className="ek-ring"><svg viewBox="0 0 40 40" role="img" aria-label={`${it.label} ${pct(f * 100)}`}><circle cx="20" cy="20" r="16" className="ek-ring-track" /><circle cx="20" cy="20" r="16" className="ek-ring-fill" style={{ stroke: TONE_VAR[it.tone ?? (f >= 0.8 ? "good" : f >= 0.5 ? "attention" : "risk")], strokeDasharray: `${f * C} ${C}` }} /></svg>
      <b className="ek-ring-v" data-no-i18n>{pct(f * 100)}</b><span className="ek-ring-l"><L d={it} /></span><span className="ek-ring-s" data-no-i18n>{num(it.value)} / {num(it.max)}</span></li>; })}</ul>;
}
/**
 * Inline meter for table cells and row lists (share of total, progress, value against the largest row): the brand deep-green →
 * mint gradient for good, tone colours otherwise; `signed` draws a centred diverging bar (negative to the left, positive to the right).
 * Every Pro bar cell uses this one component, so no screen paints its own bar.
 */
export function Meter({ value, max = 100, tone = "good", label, size = "md", signed, showPct, minPct = 2 }: { value: number; max?: number; tone?: Tone | undefined; label?: string | undefined; size?: "sm" | "md" | "lg"; signed?: boolean; showPct?: boolean; minPct?: number }) {
  const f = max > 0 ? Math.max(0, Math.min(1, Math.abs(value) / max)) : 0;
  const w = `${value ? Math.max(minPct, f * 100) : 0}%`;
  const paint = (t: Tone | undefined) => (t && t !== "good" ? { background: TONE_VAR[t] } : {});
  return <span className="ek-meter" data-size={size} data-tone={tone} data-ek-chart="meter" role="img" aria-label={label ?? pct(f * 100)} {...(signed ? { "data-signed": value < 0 ? "neg" : "pos" } : {})}>
    <span className="ek-meter-track">{signed
      ? <><span className="ek-meter-half" data-side="neg">{value < 0 && <span style={{ width: w, ...paint(tone === "good" ? "risk" : tone) }} />}</span><span className="ek-meter-half" data-side="pos">{value > 0 && <span style={{ width: w, ...paint(tone) }} />}</span></>
      : <span className="ek-meter-fill" style={{ width: w, ...paint(tone) }} />}</span>
    {showPct && <b data-no-i18n>{pct(f * 100)}</b>}
  </span>;
}
export function BulletRows({ rows, fmt = num, ar, wrap, targetLabel }: { rows: Datum[]; fmt?: Fmt; ar: boolean; wrap?: Wrap; targetLabel?: string }) {
  if (!rows.length) return <KitEmpty ar={ar} />;
  const max = Math.max(1, ...rows.flatMap((r) => [Math.abs(r.value), Math.abs(r.target ?? 0)])) * 1.06;
  return <ul className="ek-bullets" data-ek-chart="bullet">{rows.map((r) => { const over = r.target !== undefined && r.value > r.target;
    return <li key={r.key}><div className="ek-bullet-h">{wrapIf(wrap, r.drill, <span className="ek-bullet-l"><L d={r} /></span>)}<span data-no-i18n>{fmt(r.value)}{r.target !== undefined && <span className="ek-muted"> / {fmt(r.target)}</span>}</span></div>
      <div className="ek-bullet-track"><span className="ek-bullet-bar" style={{ width: `${(Math.abs(r.value) / max) * 100}%`, background: r.tone ? TONE_VAR[r.tone] : over ? TONE_VAR.risk : TONE_VAR.good }} />{r.target !== undefined && <span className="ek-bullet-target" style={{ insetInlineStart: `${(Math.abs(r.target) / max) * 100}%` }} title={targetLabel} />}</div></li>; })}</ul>;
}

/* ------------------------------------------------------------------ columns / combo / area ------------------------------------------------------------------ */
export function Columns({ data, fmt = num, axisFmt = short, ar, wrap, height = 170, tone, crossKey }: { data: Datum[]; fmt?: Fmt; axisFmt?: Fmt; ar: boolean; wrap?: Wrap | undefined; height?: number; tone?: Tone; crossKey?: string }) {
  const { ref, on, layer } = useTip(); const cf = useCrossFilter();
  if (!data.length) return <KitEmpty ar={ar} />;
  const max = Math.max(1, ...data.map((d) => Math.abs(d.value)));
  const act = crossKey && cf ? cf.active[crossKey] : undefined;
  return <div ref={ref} className="ek-chart" data-ek-chart="columns">
    <div className="ek-cols" style={{ height, gridTemplateColumns: `repeat(${data.length}, minmax(0, 1fr))` }} role="list">
      {data.map((d, i) => { const h = Math.max(2, (Math.abs(d.value) / max) * 100); const dim = act !== undefined && act !== (d.cross?.value ?? d.key);
        const bar = <span className="ek-col-bar" style={{ height: `${h}%`, background: colorOf(d, i, tone ? TONE_VAR[tone] : "var(--ek-s1)"), opacity: dim ? 0.35 : 1 }} tabIndex={d.drill ? -1 : 0} {...on({ title: <L d={d} />, value: fmt(d.value), rows: d.count !== undefined ? [[ar ? "السجلات" : "Records", String(d.count)]] : undefined })} />;
        return <div key={d.key} className="ek-col" role="listitem" aria-label={`${d.label}: ${fmt(d.value)}`}>
          <span className="ek-col-v" data-no-i18n {...(d.value < 0 ? { "data-neg": "" } : {})}>{axisFmt(d.value)}</span>
          <div className="ek-col-plot">{crossKey && cf && !d.drill ? <button type="button" className="ek-col-hit" aria-pressed={act === (d.cross?.value ?? d.key)} onClick={() => cf.set(crossKey, act === (d.cross?.value ?? d.key) ? null : d.cross?.value ?? d.key)}>{bar}</button> : wrapIf(wrap, d.drill, bar, { ...d.attrs, "aria-label": `${d.label}: ${fmt(d.value)}` })}</div>
        </div>; })}
    </div>
    <div className="ek-cols-x" style={{ gridTemplateColumns: `repeat(${data.length}, minmax(0, 1fr))` }}>{data.map((d) => <span key={d.key} title={d.label}><L d={d} /></span>)}</div>
    {layer}
  </div>;
}
/** Stacked columns: one column per period with its parts stacked bottom-up in tone / series colours, a caption above
 *  (e.g. total or share) and an optional pick per column (sets a page filter); every column is one keyboard stop with a tooltip. */
export function StackedColumns({ cols, parts, ar, fmt = num, height = 170, onPick, picked, attrs, colAttr }: {
  cols: { key: string; label: string; values: number[]; caption?: string | undefined }[]; parts: { label: string; tone?: Tone | undefined }[];
  ar: boolean; fmt?: Fmt; height?: number; onPick?: ((key: string) => void) | undefined; picked?: string | undefined;
  attrs?: Record<string, string> | undefined; colAttr?: string | undefined;
}) {
  const { ref, on, layer } = useTip();
  if (!cols.length) return <KitEmpty ar={ar} />;
  const total = (c: { values: number[] }) => c.values.reduce((a, v) => a + Math.max(0, v), 0);
  const max = Math.max(1, ...cols.map(total));
  const color = (i: number) => { const t = parts[i]?.tone; return t ? TONE_VAR[t] : SERIES[i % SERIES.length]!; };
  const grid = { gridTemplateColumns: `repeat(${cols.length}, minmax(0, 1fr))` };
  return <div ref={ref} className="ek-chart" data-ek-chart="stacked-columns" {...attrs}>
    <div className="ek-cols" style={{ height, ...grid }} role="list">
      {cols.map((c) => { const t = total(c); const h = t ? Math.max(2, (t / max) * 100) : 0;
        const label = `${c.label}: ${c.values.map((v, i) => `${parts[i]?.label ?? ""} ${fmt(v)}`).join(", ")}`;
        const stack = <span className="ek-col-bar ek-col-stack" style={{ height: `${h}%` }} tabIndex={onPick ? -1 : 0} {...on({ title: c.label, value: fmt(t), rows: c.values.map((v, i) => [parts[i]?.label ?? "", fmt(v)] as [ReactNode, ReactNode]) })}>
          {c.values.map((v, i) => (v > 0 ? <span key={i} style={{ flexGrow: v, background: color(i) }} /> : null))}</span>;
        return <div key={c.key} className="ek-col" role="listitem" aria-label={label} {...(colAttr ? { [colAttr]: c.key } : {})}>
          <span className="ek-col-v" data-no-i18n>{c.caption ?? ""}</span>
          <div className="ek-col-plot">{onPick ? <button type="button" className="ek-col-hit" aria-pressed={picked === c.key} aria-label={label} onClick={() => onPick(c.key)} {...(picked === c.key ? { "data-selected": "" } : {})}>{stack}</button> : stack}</div>
        </div>; })}
    </div>
    <div className="ek-cols-x" style={grid}>{cols.map((c) => <span key={c.key} title={c.label} data-no-i18n>{c.label}</span>)}</div>
    <ul className="ek-legend">{parts.map((p, i) => <li key={p.label}><i style={{ background: color(i) }} />{p.label}</li>)}</ul>
    {layer}
  </div>;
}
/** Grouped columns: two or three series side by side per period (e.g. invoices vs returns), every bar drillable; bars fill the card. */
export function GroupedColumns({ groups, series, fmt = num, axisFmt = short, ar, wrap, height = 180, line }: { groups: { key: string; label: string; data?: boolean }[]; series: { label: string; values: number[]; drills?: (unknown | undefined)[]; tone?: Tone }[]; fmt?: Fmt; axisFmt?: Fmt; ar: boolean; wrap?: Wrap | undefined; height?: number; /** optional line on the same value axis (e.g. net result over income/expense); negatives sit on the baseline */ line?: { label: string; values: number[]; tone?: Tone } | undefined }) {
  const { ref, on, layer } = useTip();
  if (!groups.length || !series.length) return <KitEmpty ar={ar} />;
  // the optional line shares the value axis, so it is part of the scale (a line above every bar stays inside the plot)
  const max = Math.max(1, ...series.flatMap((s) => s.values.map(Math.abs)), ...(line?.values ?? []).map(Math.abs)) * (line ? 1.12 : 1);
  const col = (i: number, s: { tone?: Tone }) => (s.tone ? TONE_VAR[s.tone] : i === 0 ? "var(--ek-s1)" : i === 1 ? "var(--ek-s3)" : "var(--ek-s5)");
  const lineCol = line ? (line.tone ? TONE_VAR[line.tone] : "var(--ek-attention)") : "";
  const ly = (v: number) => 100 - (Math.max(0, v) / max) * 100;
  const tipRows = (gi: number) => [...series.map((x) => [x.label, fmt(x.values[gi] ?? 0)] as [string, string]), ...(line ? [[line.label, fmt(line.values[gi] ?? 0)] as [string, string]] : [])];
  return <div ref={ref} className="ek-chart" data-ek-chart="grouped-columns">
    <div className={line ? "ek-combo" : undefined} style={line ? { height } : undefined}>
    <div className="ek-cols" style={{ height, gridTemplateColumns: `repeat(${groups.length}, minmax(0, 1fr))` }} role="list">
      {groups.map((g, gi) => <div key={g.key} className="ek-col ek-gcol" role="listitem" aria-label={`${g.label}: ${series.map((s) => `${s.label} ${fmt(s.values[gi] ?? 0)}`).join(", ")}`}>
        {groups.length * series.length <= 18 ? <span className="ek-col-v" data-no-i18n>{axisFmt(series[0]!.values[gi] ?? 0)}</span> : line ? <span className="ek-col-v" aria-hidden>{"\u00a0"}</span> : null}
        <div className="ek-col-plot ek-gcol-plot">{series.map((s, si) => { const v = s.values[gi] ?? 0; const bar = <span className="ek-col-bar" style={{ height: `${Math.max(v ? 2 : 0, (Math.abs(v) / max) * 100)}%`, background: col(si, s) }} {...on({ title: <L d={g} />, rows: tipRows(gi) })} />;
          return <span key={s.label} className="ek-gcol-slot">{v && s.drills?.[gi] !== undefined ? wrapIf(wrap, s.drills[gi], bar, { "aria-label": `${s.label} ${g.label}: ${fmt(v)}`, "data-ek-bar": `${si}:${g.key}` }) : bar}</span>; })}</div>
      </div>)}
    </div>
    {line && <svg className="ek-combo-line" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden><polyline points={groups.map((_, i) => `${((i + 0.5) / groups.length) * 100},${ly(line.values[i] ?? 0)}`).join(" ")} fill="none" stroke={lineCol} strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      {groups.map((_, i) => <circle key={i} cx={((i + 0.5) / groups.length) * 100} cy={ly(line.values[i] ?? 0)} r={1.4} fill={lineCol} />)}</svg>}
    </div>
    <div className="ek-cols-x" style={{ gridTemplateColumns: `repeat(${groups.length}, minmax(0, 1fr))` }}>{groups.map((g, gi) => { const every = Math.ceil(groups.length / 7); return <span key={g.key}>{(groups.length - 1 - gi) % every === 0 ? <L d={g} /> : null}</span>; })}</div>
    <ul className="ek-legend">{series.map((s, i) => <li key={s.label}><i style={{ background: col(i, s) }} />{s.label} <b data-no-i18n>{fmt(s.values.reduce((a, b) => a + b, 0))}</b></li>)}{line && <li><i className="ek-legend-line" style={{ background: lineCol }} />{line.label} <b data-no-i18n>{fmt(line.values.reduce((a, b) => a + b, 0))}</b></li>}</ul>
    {layer}
  </div>;
}
export function ComboChart({ data, line, barLabel, lineLabel, fmt = num, lineFmt = num, axisFmt = short, ar, wrap, height = 180 }: { data: Datum[]; line: number[]; barLabel: string; lineLabel: string; fmt?: Fmt; lineFmt?: Fmt; axisFmt?: Fmt; ar: boolean; wrap?: Wrap | undefined; height?: number }) {
  const { ref, on, layer } = useTip();
  if (!data.length) return <KitEmpty ar={ar} />;
  const max = Math.max(1, ...data.map((d) => Math.abs(d.value))); const lmax = Math.max(1, ...line.map(Math.abs)); const lmin = Math.min(0, ...line);
  const n = data.length; const pts = line.slice(0, n).map((v, i) => `${((i + 0.5) / n) * 100},${96 - ((v - lmin) / (lmax - lmin || 1)) * 88}`).join(" ");
  return <div ref={ref} className="ek-chart" data-ek-chart="combo">
    <div className="ek-combo" style={{ height }}>
      <div className="ek-cols" style={{ height: "100%", gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
        {data.map((d, i) => <div key={d.key} className="ek-col" aria-label={`${d.label}: ${fmt(d.value)} · ${lineFmt(line[i] ?? 0)}`}>
          <span className="ek-col-v" data-no-i18n {...(d.value < 0 ? { "data-neg": "" } : {})}>{axisFmt(d.value)}</span>
          <div className="ek-col-plot">{wrapIf(wrap, d.drill, <span className="ek-col-bar" style={{ height: `${Math.max(2, (Math.abs(d.value) / max) * 100)}%`, background: colorOf(d, i, "var(--ek-s1)") }} {...on({ title: <L d={d} />, rows: [[barLabel, fmt(d.value)], [lineLabel, lineFmt(line[i] ?? 0)]] })} />, d.attrs)}</div>
        </div>)}
      </div>
      <svg className="ek-combo-line" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden><polyline points={pts} fill="none" stroke="var(--ek-s3)" strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
        {line.slice(0, n).map((v, i) => <circle key={i} cx={((i + 0.5) / n) * 100} cy={96 - ((v - lmin) / (lmax - lmin || 1)) * 88} r={1.6} fill="var(--ek-s3)" />)}</svg>
    </div>
    <div className="ek-cols-x" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>{data.map((d) => <span key={d.key}><L d={d} /></span>)}</div>
    <ul className="ek-legend"><li><i style={{ background: "var(--ek-s1)" }} />{barLabel}</li><li><i className="ek-legend-line" style={{ background: "var(--ek-s3)" }} />{lineLabel}</li></ul>
    {layer}
  </div>;
}
export function AreaChart({ data, fmt = num, axisFmt = short, ar, wrap, height = 170, tone = "good", compare, compareLabel, valueLabel }: { data: Datum[]; fmt?: Fmt; axisFmt?: Fmt; ar: boolean; wrap?: Wrap | undefined; height?: number; tone?: Tone; compare?: number[] | undefined; compareLabel?: string; valueLabel?: string }) {
  const { ref, on, layer } = useTip();
  if (!data.length) return <KitEmpty ar={ar} />;
  const vals = data.map((d) => d.value); const all = [...vals, ...(compare ?? [])];
  const max = Math.max(1, ...all), min = Math.min(0, ...all), span = max - min || 1; const n = data.length;
  const x = (i: number) => (n === 1 ? 50 : (i / (n - 1)) * 100); const y = (v: number) => 94 - ((v - min) / span) * 86;
  const line = vals.map((v, i) => `${x(i).toFixed(2)},${y(v).toFixed(2)}`).join(" ");
  const gid = `ekg-${tone}`;
  return <div ref={ref} className="ek-chart" data-ek-chart="area">
    <div className="ek-area" style={{ height }}>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="ek-area-svg" style={{ color: TONE_VAR[tone] }} role="img" aria-label={data.map((d) => `${d.label} ${fmt(d.value)}`).join(", ")}>
        <defs><linearGradient id={gid} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="currentColor" stopOpacity="0.08" /><stop offset="1" stopColor="currentColor" stopOpacity="0.08" /></linearGradient></defs>
        {[0.25, 0.5, 0.75].map((g) => <line key={g} x1="0" x2="100" y1={8 + g * 86} y2={8 + g * 86} className="ek-grid" vectorEffect="non-scaling-stroke" />)}
        {min < 0 && <line x1="0" x2="100" y1={y(0)} y2={y(0)} className="ek-zero" vectorEffect="non-scaling-stroke" />}
        {compare && <polyline points={compare.slice(0, n).map((v, i) => `${x(i)},${y(v)}`).join(" ")} fill="none" stroke="var(--ek-neutral)" strokeDasharray="4 3" strokeWidth={1.4} vectorEffect="non-scaling-stroke" />}
        <polygon points={`0,${y(Math.max(min, 0))} ${line} 100,${y(Math.max(min, 0))}`} fill={`url(#${gid})`} />
        <polyline points={line} fill="none" stroke="currentColor" strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
      </svg>
      <div className="ek-area-hits" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>{data.map((d, i) => <Fragment key={d.key}>{wrapIf(wrap, d.drill, <span className="ek-area-hit" tabIndex={d.drill ? -1 : 0} {...on({ title: <L d={d} />, value: fmt(d.value), rows: compare ? [[compareLabel ?? (ar ? "المقارنة" : "Compare"), fmt(compare[i] ?? 0)]] : undefined })} />, { ...d.attrs, "aria-label": `${d.label}: ${fmt(d.value)}` })}</Fragment>)}</div>
      <span className="ek-area-last" style={{ insetInlineEnd: 0, top: `calc(${y(vals[n - 1]!)}% - 22px)` }} data-no-i18n {...(vals[n - 1]! < 0 ? { "data-neg": "" } : {})}>{axisFmt(vals[n - 1]!)}</span>
    </div>
    <div className="ek-area-x">{data.map((d, i) => { const step = n > 6 ? Math.ceil(n / 6) : 1; return <span key={d.key} style={{ visibility: (n - 1 - i) % step === 0 ? undefined : "hidden" }}><L d={d} /></span>; })}</div>
    {(compare || valueLabel) && <ul className="ek-legend"><li><i style={{ background: TONE_VAR[tone] }} />{valueLabel ?? (ar ? "الفترة الحالية" : "Current")}</li>{compare && <li><i className="ek-legend-line" style={{ background: "var(--ek-neutral)" }} />{compareLabel ?? (ar ? "المقارنة" : "Compare")}</li>}</ul>}
    {layer}
  </div>;
}
export function SmallMultiples({ items, ar, wrap }: { items: { key: string; label: string; values: number[]; total: string; drill?: unknown; data?: boolean; tone?: Tone }[]; ar: boolean; wrap?: Wrap }) {
  if (!items.length) return <KitEmpty ar={ar} />;
  return <ul className="ek-multiples" data-ek-chart="small-multiples">{items.map((it) => <li key={it.key} className="ek-multiple">
    <div className="ek-multiple-h">{wrapIf(wrap, it.drill, <span className="ek-multiple-l"><L d={it} /></span>)}<b data-no-i18n>{it.total}</b></div>
    <Spark values={it.values} tone={it.tone ?? "good"} height={38} label={`${it.label}: ${it.values.map(num).join(", ")}`} /></li>)}</ul>;
}

/* ------------------------------------------------------------------ ranked / stacked / donut ------------------------------------------------------------------ */
export function RankedBars({ data, fmt = num, ar, wrap, max = 8, crossKey, tone, more, sort = true }: { data: Datum[]; fmt?: Fmt; ar: boolean; wrap?: Wrap | undefined; max?: number; crossKey?: string; tone?: Tone; more?: ReactNode; /** false keeps the caller's order (an already ranked or ordered list) */ sort?: boolean }) {
  const { ref, on, layer } = useTip(); const cf = useCrossFilter();
  if (!data.length) return <KitEmpty ar={ar} />;
  const rows = (sort ? [...data].sort((a, b) => Math.abs(b.value) - Math.abs(a.value)) : data).slice(0, max);
  const top = Math.max(1, ...rows.map((r) => Math.abs(r.value))); const total = data.reduce((s, d) => s + Math.max(0, d.value), 0) || 1;
  const act = crossKey && cf ? cf.active[crossKey] : undefined;
  return <div ref={ref} className="ek-chart" data-ek-chart="ranked">
    <ol className="ek-ranked">{rows.map((r, i) => { const v = r.cross?.value ?? r.key; const on2 = act === v;
      const body = <><span className="ek-ranked-n" data-no-i18n>{i + 1}</span><span className="ek-ranked-l"><L d={r} /></span><span className="ek-ranked-v" data-no-i18n>{fmt(r.value)} <span className="ek-muted">{pct((Math.max(0, r.value) / total) * 100)}</span></span>
        <span className="ek-ranked-track"><span style={{ width: `${Math.max(1.5, (Math.abs(r.value) / top) * 100)}%`, background: colorOf(r, 0, tone ? TONE_VAR[tone] : i === 0 ? "var(--ek-s1)" : "var(--ek-s1-soft)") }} /></span></>;
      return <li key={r.key} data-on={on2 || undefined} {...on({ title: <L d={r} />, value: fmt(r.value), rows: [[ar ? "الحصة" : "Share", pct((Math.max(0, r.value) / total) * 100, 1)], ...(r.count !== undefined ? [[ar ? "السجلات" : "Records", String(r.count)] as [string, string]] : [])] })}>
        {wrapIf(wrap, r.drill, <span className="ek-ranked-row">{body}</span>, { ...r.attrs, "aria-label": `${r.label}: ${fmt(r.value)}` })}
        {crossKey && cf && <button type="button" className="ek-ranked-x" aria-pressed={on2} onClick={() => cf.set(crossKey, on2 ? null : v)} title={ar ? "تصفية الصفحة" : "Filter the page"} aria-label={on2 ? (ar ? `إلغاء التصفية حسب ${r.label}` : `Clear filter ${r.label}`) : ar ? `تصفية الصفحة حسب ${r.label}` : `Filter the page by ${r.label}`} data-ek-cross={`${crossKey}:${v}`}>⧩</button>}
      </li>; })}</ol>
    {more}{layer}
  </div>;
}
/** Aging buckets read as an ordered sequential scale (visual round R3 §4): newest lightest, oldest darkest. */
export const AGING_TONES = ["var(--em-100)", "var(--em-300)", "var(--emerald)", "var(--deep)", "var(--em-900)"];
/** Stacked aging: one horizontal bar per row split by age bucket (green → amber → red), bucket totals in the legend. */
export function StackedAging({ rows, buckets, fmt = num, ar, wrap }: { rows: { key: string; label: string; values: number[]; drill?: unknown; data?: boolean }[]; buckets: string[]; fmt?: Fmt; ar: boolean; wrap?: Wrap }) {
  const { ref, on, layer } = useTip();
  const totals = buckets.map((_, b) => rows.reduce((s, r) => s + Math.max(0, r.values[b] ?? 0), 0));
  if (!rows.length || totals.every((t) => !t)) return <KitEmpty ar={ar} />;
  const rmax = Math.max(1, ...rows.map((r) => r.values.reduce((s, v) => s + Math.max(0, v), 0)));
  return <div ref={ref} className="ek-chart" data-ek-chart="stacked-aging">
    <ul className="ek-aging">{rows.map((r) => { const t = r.values.reduce((s, v) => s + Math.max(0, v), 0);
      return <li key={r.key}><div className="ek-aging-h">{wrapIf(wrap, r.drill, <span><L d={r} /></span>)}<b data-no-i18n>{fmt(t)}</b></div>
        <div className="ek-aging-bar" style={{ width: `${Math.max(4, (t / rmax) * 100)}%` }}>{r.values.map((v, b) => v > 0 ? <span key={b} style={{ flex: v, background: AGING_TONES[b] ?? AGING_TONES[4] }} tabIndex={0} {...on({ title: <><L d={r} /> · {buckets[b]}</>, value: fmt(v), rows: [[ar ? "من الإجمالي" : "Of total", pct((v / (t || 1)) * 100, 1)]] })} /> : null)}</div></li>; })}</ul>
    <ul className="ek-legend">{buckets.map((b, i) => <li key={b}><i style={{ background: AGING_TONES[i] ?? AGING_TONES[4] }} />{b} <b data-no-i18n>{fmt(totals[i]!)}</b></li>)}</ul>
    {layer}
  </div>;
}
/** One stacked bar for a single breakdown (aging buckets, stages, mix): every segment and every legend row drills; the
 *  legend lists each part with its value and share so the bar never needs axis labels. `tones` = aging colours in order. */
export function SegmentBar({ data, fmt = num, ar, wrap, tones = "series" }: { data: Datum[]; fmt?: Fmt; ar: boolean; wrap?: Wrap | undefined; tones?: "series" | "aging" }) {
  const { ref, on, layer } = useTip();
  const parts = data.filter((d) => d.value > 0);
  const total = parts.reduce((s, d) => s + d.value, 0);
  if (!parts.length || !total) return <KitEmpty ar={ar} />;
  const colour = (i: number) => (tones === "aging" ? AGING_TONES[Math.min(i, AGING_TONES.length - 1)]! : SERIES[i % SERIES.length]!);
  return <div ref={ref} className="ek-chart" data-ek-chart="segment-bar">
    <div className="ek-seg-total"><span>{ar ? "الإجمالي" : "Total"}</span><b data-no-i18n>{fmt(total)}</b></div>
    <div className="ek-seg-bar">{data.map((d, i) => d.value > 0 ? <span key={d.key} style={{ flex: d.value, background: colour(i) }}>{wrapIf(wrap, d.drill, <i tabIndex={0} {...on({ title: <L d={d} />, value: fmt(d.value), rows: [[ar ? "من الإجمالي" : "Of total", pct((d.value / total) * 100, 1)]] })} />, { "data-ek-seg": d.key })}</span> : null)}</div>
    <ul className="ek-seg-legend">{data.map((d, i) => <li key={d.key} data-ek-seg-row={d.key}>{wrapIf(wrap, d.drill, <span className="ek-seg-row"><i style={{ background: colour(i) }} /><L d={d} /><b data-no-i18n>{fmt(d.value)}</b><em data-no-i18n>{pct(total ? (Math.max(0, d.value) / total) * 100 : 0, 0)}</em></span>)}</li>)}</ul>
    {layer}
  </div>;
}
export function Stacked100({ rows, parts, ar, fmt = num }: { rows: { key: string; label: string; values: number[]; data?: boolean }[]; parts: string[]; ar: boolean; fmt?: Fmt }) {
  const { ref, on, layer } = useTip();
  if (!rows.length) return <KitEmpty ar={ar} />;
  return <div ref={ref} className="ek-chart" data-ek-chart="stacked-100">
    <ul className="ek-s100">{rows.map((r) => { const t = r.values.reduce((s, v) => s + Math.max(0, v), 0) || 1;
      return <li key={r.key}><span className="ek-s100-l"><L d={r} /></span><div className="ek-s100-bar">{r.values.map((v, i) => v > 0 ? <span key={i} style={{ flex: v, background: SERIES[i % SERIES.length] }} tabIndex={0} {...on({ title: <><L d={r} /> · {parts[i]}</>, value: pct((v / t) * 100, 1), rows: [[ar ? "القيمة" : "Value", fmt(v)]] })}>{v / t >= 0.12 && <em data-no-i18n>{pct((v / t) * 100)}</em>}</span> : null)}</div></li>; })}</ul>
    <ul className="ek-legend">{parts.map((p, i) => <li key={p}><i style={{ background: SERIES[i % SERIES.length] }} />{p}</li>)}</ul>
    {layer}
  </div>;
}
/** Donut: at most five slices (the rest join "Other"), the total in the centre. */
export function Donut({ data, fmt = num, centerFmt = short, ar, wrap, centerLabel, max = 5 }: { data: Datum[]; fmt?: Fmt; centerFmt?: Fmt; ar: boolean; wrap?: Wrap | undefined; centerLabel?: string; max?: number }) {
  const { ref, on, layer } = useTip();
  const pos = [...data].filter((d) => d.value > 0).sort((a, b) => b.value - a.value);
  if (!pos.length) return <KitEmpty ar={ar} />;
  const head = pos.length > max ? pos.slice(0, max - 1) : pos; const rest = pos.length > max ? pos.slice(max - 1) : [];
  const slices: Datum[] = rest.length ? [...head, { key: "__other", label: ar ? `أخرى (${rest.length})` : `Other (${rest.length})`, value: rest.reduce((s, d) => s + d.value, 0), tone: "neutral" }] : head;
  const total = slices.reduce((s, d) => s + d.value, 0) || 1; const C = 2 * Math.PI * 15.9155; let acc = 0;
  return <div ref={ref} className="ek-chart ek-donut" data-ek-chart="donut">
    <div className="ek-donut-fig"><svg viewBox="0 0 42 42" role="img" aria-label={slices.map((s) => `${s.label} ${pct((s.value / total) * 100)}`).join(", ")}>
      <circle cx="21" cy="21" r="15.9155" className="ek-ring-track" strokeWidth={6} />
      {slices.map((s, i) => { const f = s.value / total; const off = acc; acc += f; return <circle key={s.key} cx="21" cy="21" r="15.9155" fill="none" stroke={colorOf(s, i)} strokeWidth={6} strokeDasharray={`${Math.max(0, f * C - 0.4)} ${C}`} strokeDashoffset={-off * C} transform="rotate(-90 21 21)" tabIndex={0} {...on({ title: <L d={s} />, value: fmt(s.value), rows: [[ar ? "الحصة" : "Share", pct(f * 100, 1)]] })} />; })}
    </svg><div className="ek-donut-c"><b data-no-i18n>{centerFmt(total)}</b><span>{centerLabel ?? (ar ? "الإجمالي" : "Total")}</span></div></div>
    <ul className="ek-donut-legend">{slices.map((s, i) => <li key={s.key}><i style={{ background: colorOf(s, i) }} />{wrapIf(wrap, s.drill, <span className="ek-donut-l"><L d={s} /></span>, s.attrs)}<b data-no-i18n>{pct((s.value / total) * 100)}</b><span className="ek-muted" data-no-i18n>{fmt(s.value)}</span>{s.delta && <DeltaChip d={s.delta} ar={ar} />}</li>)}</ul>
    {layer}
  </div>;
}
export function Funnel({ data, fmt = num, ar, wrap, between = "drop" }: { data: Datum[]; fmt?: Fmt; ar: boolean; wrap?: Wrap | undefined; /** what sits between two stages: the drop-off (default) or the conversion % from the previous stage (CRM C1) */ between?: "drop" | "conversion" | undefined }) {
  if (!data.length) return <KitEmpty ar={ar} />;
  // bars are scaled to the largest stage (a later stage can exceed the first) and never wider than the chart: an
  // unbounded width (e.g. 7,000%) makes the browser drop the whole page's painting
  const top = Math.max(1, ...data.map((d) => d.value));
  return <ol className="ek-funnel" data-ek-chart="funnel">{data.map((d, i) => { const prev = i ? data[i - 1]!.value : 0; const drop = i && prev > 0 ? ((prev - d.value) / prev) * 100 : null;
    return <li key={d.key}>
      {drop !== null && (between === "conversion"
        ? <span className="ek-funnel-conv" data-no-i18n data-ek-conv={Math.round((d.value / prev) * 1000) / 10} title={ar ? "نسبة التحويل من المرحلة السابقة" : "Conversion from the previous stage"}>↓ {pct((d.value / prev) * 100)} <span className="ek-funnel-conv-l">{ar ? "تحويل" : "converted"}</span></span>
        : <span className="ek-funnel-drop" data-no-i18n title={ar ? "نسبة التسرب من المرحلة السابقة" : "Drop-off from the previous stage"}>▼ {pct(Math.max(0, drop))}</span>)}
      {between === "conversion" && i > 0 && prev <= 0 && <span className="ek-funnel-conv" data-no-i18n data-ek-conv="" title={ar ? "لا توجد صفقات في المرحلة السابقة" : "No deals in the previous stage"}>— <span className="ek-funnel-conv-l">{ar ? "لا يوجد سابق" : "no previous"}</span></span>}
      {wrapIf(wrap, d.drill, <span className="ek-funnel-bar" style={{ width: `${Math.min(100, Math.max(22, (Math.max(0, d.value) / top) * 100))}%`, background: colorOf(d, i, `color-mix(in oklab, var(--ek-s1) ${Math.max(30, 100 - i * 14)}%, var(--ek-secondary))`) }}><span className="ek-funnel-l"><L d={d} /></span><b data-no-i18n>{fmt(d.value)}</b></span>, d.attrs)}
    </li>; })}</ol>;
}
/** Bridge: a datum whose key starts with "=" is a total drawn from zero; the others are signed steps from the running value. */
export function Waterfall({ data, fmt = num, axisFmt = short, ar, wrap, height = 190 }: { data: Datum[]; fmt?: Fmt; axisFmt?: Fmt; ar: boolean; wrap?: Wrap | undefined; height?: number }) {
  const { ref, on, layer } = useTip();
  if (!data.length) return <KitEmpty ar={ar} />;
  let run = 0;
  const bars = data.map((p) => { const total = p.key.startsWith("="); const from = total ? 0 : run; const to = total ? p.value : run + p.value; run = to; return { p, total, lo: Math.min(from, to), hi: Math.max(from, to), up: to >= from }; });
  const max = Math.max(1, ...bars.map((b) => b.hi)); const steps = bars.filter((b) => !b.total), totals = bars.filter((b) => b.total);
  const lowest = Math.min(...totals.map((b) => b.hi), ...steps.map((b) => b.lo));
  const zoom = steps.length > 0 && totals.length > 0 && bars.every((b) => b.lo >= 0) && max - lowest < max * 0.15;
  const min = zoom ? Math.max(0, lowest - Math.max((max - lowest) * 1.5, max * 0.01)) : Math.min(0, ...bars.map((b) => b.lo)); const span = max - min || 1;
  const y = (v: number) => ((max - Math.max(v, min)) / span) * 100;
  return <div ref={ref} className="ek-chart" data-ek-chart="waterfall" {...(zoom ? { "data-axis-from": String(min) } : {})}>
    <div className="ek-wf" style={{ height, gridTemplateColumns: `repeat(${bars.length}, minmax(0, 1fr))` }}>
      {min < 0 && <span className="ek-wf-zero" style={{ top: `${y(0)}%` }} aria-hidden />}
      {bars.map(({ p, total, lo, hi, up }) => <div key={p.key} className="ek-wf-col">{wrapIf(wrap, p.drill, <span className="ek-wf-bar" style={{ top: `${y(hi)}%`, height: `${Math.max(1.5, y(lo) - y(hi))}%`, background: total ? "var(--deep, var(--ek-s1))" : up ? "var(--positive, var(--ek-good))" : "var(--negative, var(--ek-risk))" }} tabIndex={0} {...on({ title: <L d={p} />, value: fmt(p.value) })} />, { ...p.attrs, "aria-label": `${p.label}: ${fmt(p.value)}` })}
        <span className="ek-wf-val" style={{ top: `calc(${y(hi)}% - 18px)` }} data-tone={total ? "total" : up ? "up" : "down"} aria-hidden data-no-i18n>{!total && p.value > 0 ? "+" : ""}{axisFmt(p.value)}</span></div>)}
    </div>
    <div className="ek-cols-x ek-wf-x" style={{ gridTemplateColumns: `repeat(${bars.length}, minmax(0, 1fr))` }}>{bars.map(({ p, total }) => <span key={p.key} className={total ? "ek-strong" : undefined} title={p.label}><span className="ek-wf-l"><L d={p} /></span><bdi data-no-i18n>{!total && p.value > 0 ? "+" : ""}{axisFmt(p.value)}</bdi></span>)}</div>
    {/* phones: the same bridge as rows (label · floating bar · value), so no label is cut */}
    <ol className="ek-wf-rows">{bars.map(({ p, total, lo, hi, up }) => { const l = ((Math.max(lo, min) - min) / span) * 100, w = Math.max(1.5, ((hi - Math.max(lo, min)) / span) * 100);
      return <li key={p.key} data-tone={total ? "total" : up ? "up" : "down"}><span className="ek-wf-rl"><L d={p} /></span><span className="ek-wf-rt"><i style={{ insetInlineStart: `${l}%`, width: `${w}%`, background: total ? "var(--deep, var(--ek-s1))" : up ? "var(--positive, var(--ek-good))" : "var(--negative, var(--ek-risk))" }} /></span><bdi className="ek-wf-rv" data-no-i18n>{!total && p.value > 0 ? "+" : ""}{axisFmt(p.value)}</bdi></li>; })}</ol>
    {zoom && <p className="ek-note">{ar ? "يبدأ المحور من " : "Axis starts at "}<bdi data-no-i18n>{axisFmt(min)}</bdi>{ar ? " لإظهار التغييرات" : " so the changes are visible"}</p>}
    {layer}
  </div>;
}

/* ------------------------------------------------------------------ treemap / heatmap / bubble ------------------------------------------------------------------ */
type Tile = { d: Datum; i: number; x: number; y: number; w: number; h: number };
function split(items: { d: Datum; i: number }[], x: number, y: number, w: number, h: number, out: Tile[]) {
  if (!items.length) return; if (items.length === 1) { out.push({ ...items[0]!, x, y, w, h }); return; }
  const total = items.reduce((s, it) => s + Math.max(0, it.d.value), 0) || 1; let acc = 0, k = 0;
  while (k < items.length - 1 && acc + Math.max(0, items[k]!.d.value) <= total / 2) { acc += Math.max(0, items[k]!.d.value); k++; }
  if (k === 0) { acc = Math.max(0, items[0]!.d.value); k = 1; }
  const f = acc / total; const a = items.slice(0, k), b = items.slice(k);
  if (w >= h) { split(a, x, y, w * f, h, out); split(b, x + w * f, y, w * (1 - f), h, out); } else { split(a, x, y, w, h * f, out); split(b, x, y + h * f, w, h * (1 - f), out); }
}
export function Treemap({ data, fmt = num, ar, wrap, height = 210 }: { data: Datum[]; fmt?: Fmt; ar: boolean; wrap?: Wrap | undefined; height?: number }) {
  const { ref, on, layer } = useTip();
  const items = data.map((d, i) => ({ d, i })).filter((x) => x.d.value > 0).sort((a, b) => b.d.value - a.d.value).slice(0, 14);
  if (!items.length) return <KitEmpty ar={ar} />;
  const tiles: Tile[] = []; split(items, 0, 0, 100, 100, tiles); const total = items.reduce((s, x) => s + x.d.value, 0) || 1;
  return <div ref={ref} className="ek-chart" data-ek-chart="treemap"><div className="ek-tree" style={{ height }} role="list">
    {tiles.map(({ d, i, x, y, w, h }) => <div key={d.key} role="listitem" className="ek-tree-tile" style={{ insetInlineStart: `${x}%`, top: `${y}%`, width: `${w}%`, height: `${h}%`, background: colorOf(d, i) }} tabIndex={0} {...on({ title: <L d={d} />, value: fmt(d.value), rows: [[ar ? "الحصة" : "Share", pct((d.value / total) * 100, 1)]] })}>
      {w > 11 && h > 16 && wrapIf(wrap, d.drill, <span className="ek-tree-l"><L d={d} /></span>, d.attrs)}{w > 11 && h > 28 && <span className="ek-tree-v" data-no-i18n>{pct((d.value / total) * 100)}</span>}
    </div>)}</div>{layer}</div>;
}
export function Heatmap({ rows, cols, values, fmt = num, ar, dataRows, dataCols, scale = "good", rowLink }: { rows: string[]; cols: string[]; values: number[][]; fmt?: Fmt; ar: boolean; dataRows?: boolean; dataCols?: boolean; scale?: Tone; /** wraps a row label in the link to the record the row stands for */ rowLink?: ((ri: number, node: ReactNode) => ReactNode) | undefined }) {
  const max = Math.max(1, ...values.flat().map(Math.abs));
  if (!rows.length) return <KitEmpty ar={ar} />;
  return <div className="ek-heat-wrap" data-ek-chart="heatmap"><table className="ek-heat"><thead><tr><th />{cols.map((c) => <th key={c} {...(dataCols ? { "data-no-i18n": "" } : {})}>{c}</th>)}</tr></thead>
    <tbody>{rows.map((r, ri) => <tr key={r}><th {...(dataRows ? { "data-no-i18n": "" } : {})}>{rowLink ? rowLink(ri, r) : r}</th>{(values[ri] ?? []).map((v, ci) => { const f = Math.abs(v) / max;
      // visual round R3 §4: the default scale is the sequential brand ramp (--em-50 → --deep); other tones keep their colour
      return <td key={ci} style={{ background: v ? (scale === "good" ? `color-mix(in oklab, var(--deep, var(--ek-s1)) ${Math.round(8 + f * 84)}%, var(--em-50, var(--ek-surface)))` : `color-mix(in oklab, ${TONE_VAR[scale]} ${Math.round(12 + f * 78)}%, var(--ek-surface))`) : undefined, color: f > 0.55 ? "var(--ek-on-strong)" : undefined }} title={`${r} · ${cols[ci]}: ${fmt(v)}`} data-no-i18n>{v ? short(v) : "·"}</td>; })}</tr>)}</tbody></table>
    <p className="ek-note">{ar ? "اللون الأغمق = قيمة أعلى" : "Darker = higher value"}</p></div>;
}
export function CalendarHeatmap({ days, weeks = 13, ar, fmt = num, today }: { days: { date: string; value: number }[]; weeks?: number; ar: boolean; fmt?: Fmt; today: string }) {
  const by = new Map(days.map((d) => [d.date.slice(0, 10), d.value])); const end = new Date(`${today}T00:00:00Z`);
  // weeks start on Saturday (Saudi working week); the last column ends today
  const back = (end.getUTCDay() + 1) % 7; const start = new Date(end.getTime() - (back + (weeks - 1) * 7) * 86400000);
  const cells: { date: string; v: number; future: boolean }[] = [];
  for (let i = 0; i < weeks * 7; i++) { const d = new Date(start.getTime() + i * 86400000); const k = d.toISOString().slice(0, 10); cells.push({ date: k, v: by.get(k) ?? 0, future: d > end }); }
  const max = Math.max(1, ...cells.map((c) => c.v)); const wk = ar ? ["س", "ح", "ن", "ث", "ر", "خ", "ج"] : ["S", "S", "M", "T", "W", "T", "F"];
  return <div className="ek-cal" data-ek-chart="calendar-heatmap"><div className="ek-cal-days">{wk.map((w, i) => <span key={i}>{w}</span>)}</div>
    <div className="ek-cal-grid" style={{ gridTemplateColumns: `repeat(${weeks}, minmax(0, 1fr))` }}>{Array.from({ length: weeks }, (_, w) => <div key={w} className="ek-cal-col">{cells.slice(w * 7, w * 7 + 7).map((c) => <span key={c.date} className="ek-cal-cell" data-future={c.future || undefined} style={c.v ? { background: `color-mix(in oklab, var(--ek-good) ${Math.round(18 + (c.v / max) * 77)}%, var(--ek-surface))` } : undefined} title={`${c.date}: ${fmt(c.v)}`} />)}</div>)}</div>
    <p className="ek-note">{ar ? "كل مربع يوم؛ الأغمق = نشاط أعلى" : "Each square is a day; darker = more activity"}</p></div>;
}
export function Bubble({ points, axes, ar, fmt = num, wrap }: { points: { key: string; label: string; x: number; y: number; size: number; tone?: Tone; drill?: unknown; data?: boolean }[]; axes: [string, string, string]; ar: boolean; fmt?: Fmt; wrap?: Wrap }) {
  const { ref, on, layer } = useTip();
  if (!points.length) return <KitEmpty ar={ar} />;
  const xs = points.map((p) => p.x), ys = points.map((p) => p.y); const x0 = Math.min(0, ...xs), x1 = Math.max(1, ...xs), y0 = Math.min(0, ...ys), y1 = Math.max(1, ...ys); const smax = Math.max(1, ...points.map((p) => p.size));
  return <div ref={ref} className="ek-chart" data-ek-chart="bubble"><div className="ek-bubble" role="img" aria-label={points.map((p) => `${p.label}: ${fmt(p.x)}, ${fmt(p.y)}`).join("; ")}>
    {points.map((p, i) => { const r = 7 + Math.sqrt(Math.max(0, p.size) / smax) * 22;
      return <span key={p.key} className="ek-bubble-dot" style={{ insetInlineStart: `${((p.x - x0) / (x1 - x0 || 1)) * 92 + 4}%`, top: `${96 - ((p.y - y0) / (y1 - y0 || 1)) * 88}%`, width: r * 2, height: r * 2, background: colorOf(p, i) }} tabIndex={0} {...on({ title: <L d={p} />, rows: [[axes[0], fmt(p.x)], [axes[1], fmt(p.y)], [axes[2], fmt(p.size)]] })}>{wrapIf(wrap, p.drill, <span className="sr-only">{p.label}</span>)}</span>; })}
  </div><div className="ek-bubble-axes"><span>↑ {axes[1]}</span><span>{axes[0]} →</span></div>{layer}</div>;
}

/* ------------------------------------------------------------------ Saudi regions map ------------------------------------------------------------------ */
const REGION_WORDS: [string, string[]][] = [
  ["SA-01", ["riyadh", "الرياض", "kharj", "الخرج"]], ["SA-02", ["makkah", "mecca", "مكة", "jeddah", "jedda", "جدة", "taif", "الطائف"]], ["SA-03", ["madinah", "medina", "المدينة", "yanbu", "ينبع"]],
  ["SA-04", ["eastern", "الشرقية", "dammam", "الدمام", "khobar", "الخبر", "jubail", "الجبيل", "dhahran", "الظهران", "ahsa", "الأحساء", "hofuf", "الهفوف", "qatif", "القطيف"]],
  ["SA-05", ["qassim", "القصيم", "buraydah", "بريدة", "unaizah", "عنيزة"]], ["SA-06", ["hail", "حائل", "hayel"]], ["SA-07", ["tabuk", "تبوك", "neom", "نيوم"]], ["SA-08", ["northern borders", "الحدود الشمالية", "arar", "عرعر"]],
  ["SA-09", ["jazan", "jizan", "جازان", "جيزان"]], ["SA-10", ["najran", "نجران"]], ["SA-11", ["bahah", "baha", "الباحة"]], ["SA-12", ["jawf", "الجوف", "sakaka", "سكاكا"]], ["SA-14", ["asir", "عسير", "abha", "أبها", "khamis", "خميس"]],
];
/** Region (ISO 3166-2:SA) of a place, branch, warehouse or territory name — matched on Arabic and English city words. */
export function regionOf(text: string): string | undefined {
  const t = text.toLowerCase();
  return REGION_WORDS.find(([, ws]) => ws.some((w) => t.includes(w)))?.[0];
}
export function SaudiMap({ values, fmt = num, ar, wrap, label }: { values: { region: string; value: number; drill?: unknown }[]; fmt?: Fmt; ar: boolean; wrap?: Wrap; label?: string }) {
  const { ref, on, layer } = useTip();
  const by = new Map<string, { value: number; drill?: unknown }>(); for (const v of values) { const p = by.get(v.region); by.set(v.region, { value: (p?.value ?? 0) + v.value, drill: p?.drill ?? v.drill }); }
  const max = Math.max(1, ...[...by.values()].map((v) => v.value)); const total = [...by.values()].reduce((s, v) => s + v.value, 0);
  if (!total) return <KitEmpty ar={ar} />;
  const ranked = SAUDI_REGIONS.filter((r) => by.get(r.id)?.value).sort((a, b) => by.get(b.id)!.value - by.get(a.id)!.value);
  return <div ref={ref} className="ek-chart ek-map" data-ek-chart="saudi-map">
    <svg viewBox={SAUDI_VIEWBOX} className="ek-map-svg" role="img" aria-label={label ?? ranked.map((r) => `${r.label[ar ? 1 : 0]} ${fmt(by.get(r.id)!.value)}`).join(", ")}>
      {SAUDI_REGIONS.map((r) => { const v = by.get(r.id)?.value ?? 0; const f = v / max;
        return <path key={r.id} d={r.d} className="ek-map-region" style={{ fill: v ? `color-mix(in oklab, var(--ek-s1) ${Math.round(18 + f * 82)}%, var(--ek-surface))` : undefined }} tabIndex={0} {...on({ title: r.label[ar ? 1 : 0], value: v ? fmt(v) : "—", rows: v ? [[ar ? "الحصة" : "Share", pct((v / total) * 100, 1)]] : undefined })} data-ek-region={r.id} />; })}
      {ranked.slice(0, 4).map((r) => <text key={r.id} x={r.cx} y={r.cy} className="ek-map-label" textAnchor="middle">{r.label[ar ? 1 : 0]}</text>)}
    </svg>
    <ol className="ek-map-list">{ranked.map((r) => <li key={r.id}>{wrapIf(wrap, by.get(r.id)!.drill, <span>{r.label[ar ? 1 : 0]}</span>)}<b data-no-i18n>{fmt(by.get(r.id)!.value)}</b><span className="ek-muted" data-no-i18n>{pct((by.get(r.id)!.value / total) * 100)}</span></li>)}</ol>
    {layer}
  </div>;
}

/* ------------------------------------------------------------------ tables ------------------------------------------------------------------ */
export interface MatrixCol { key: string; label: ReactNode; numeric?: boolean; bar?: boolean; fmt?: Fmt; data?: boolean; tone?: Tone }
export interface MatrixRow { id: string; cells: Record<string, ReactNode | number | string | null | undefined>; drill?: unknown; tone?: Tone | undefined }
/** Matrix table with data bars inside numeric columns; sticky header inside a fixed-height panel. */
export function MatrixTable({ columns, rows, ar, wrap, empty }: { columns: MatrixCol[]; rows: MatrixRow[]; ar: boolean; wrap?: Wrap; empty?: Bi }) {
  if (!rows.length) return <KitEmpty ar={ar} text={empty} />;
  const maxOf = Object.fromEntries(columns.filter((c) => c.bar).map((c) => [c.key, Math.max(1, ...rows.map((r) => Math.abs(Number(r.cells[c.key]) || 0)))]));
  return <table className="ek-matrix" data-ek-chart="matrix"><thead><tr>{columns.map((c) => <th key={c.key} data-num={c.numeric || undefined}>{c.label}</th>)}</tr></thead>
    <tbody>{rows.map((r) => <tr key={r.id} data-tone={r.tone}>{columns.map((c, i) => { const v = r.cells[c.key];
      const shown = typeof v === "number" ? (c.fmt ?? num)(v) : v ?? "—";
      const inner = c.data || typeof v === "number" ? <bdi data-no-i18n>{shown}</bdi> : shown;
      return <td key={c.key} data-num={c.numeric || undefined} style={c.bar && typeof v === "number" ? { ["--ek-bar" as string]: `${(Math.abs(v) / maxOf[c.key]!) * 100}%`, ["--ek-bar-c" as string]: v < 0 ? "var(--ek-risk-soft)" : c.tone ? `color-mix(in oklab, ${TONE_VAR[c.tone]} 22%, transparent)` : "var(--ek-s1-wash)" } : undefined} className={c.bar ? "ek-databar" : undefined}>{i === 0 ? wrapIf(wrap, r.drill, inner) : inner}</td>; })}</tr>)}</tbody></table>;
}
export function SparkTable({ rows, ar, fmt = num, wrap, labels }: { rows: { id: string; label: string; values: number[]; total: number; drill?: unknown; data?: boolean; better?: "up" | "down" }[]; ar: boolean; fmt?: Fmt; wrap?: Wrap; labels: [string, string, string] }) {
  if (!rows.length) return <KitEmpty ar={ar} />;
  return <table className="ek-matrix ek-sparktable" data-ek-chart="spark-table"><thead><tr><th>{labels[0]}</th><th>{labels[1]}</th><th data-num>{labels[2]}</th><th data-num>{ar ? "التغير" : "Change"}</th></tr></thead>
    <tbody>{rows.map((r) => { const a = r.values[r.values.length - 2] ?? 0, b = r.values[r.values.length - 1] ?? 0; const ch = a ? ((b - a) / Math.abs(a)) * 100 : null;
      return <tr key={r.id}><td>{wrapIf(wrap, r.drill, <L d={r} />)}</td><td className="ek-sparkcell"><Spark values={r.values} height={24} area={false} /></td><td data-num><bdi data-no-i18n>{fmt(r.total)}</bdi></td><td data-num>{ch === null ? "—" : <DeltaChip d={{ pct: ch, better: r.better }} ar={ar} />}</td></tr>; })}</tbody></table>;
}

/* ------------------------------------------------------------------ scorecard + mini stats (owner 2026-11-13 rich pages) ------------------------------------------------------------------ */
/** One scorecard row: an indicator with this period, the previous period and the change (green up / red down by its good direction). */
export interface ScoreRow { id: string; label: ReactNode; value: ReactNode; /** why a zero value is zero (default: no record matches now) */ zeroReason?: ReactNode; prev?: ReactNode; pct?: number | null | undefined; better?: "up" | "down" | "none" | undefined; sub?: ReactNode; wrap?: ((node: ReactNode) => ReactNode) | undefined; tone?: Tone | undefined; state?: ReactNode; attrs?: Record<string, string | undefined> }
export function ScoreDelta({ pct: p, better, ar, reason }: { pct: number | null | undefined; better?: "up" | "down" | "none" | undefined; ar: boolean; reason?: string }) {
  if (p === null || p === undefined || !Number.isFinite(p)) return reason ? <span className="ek-score-flat ek-score-why">{reason}</span> : <span className="ek-score-flat" aria-label={ar ? "لا مقارنة" : "No comparison"}>—</span>;
  const flat = Math.abs(p) < 0.05, up = p > 0; const good = flat || better === "none" ? undefined : (better ?? "up") === "up" ? up : !up;
  return <span className="ek-score-d" data-good={good === undefined ? "flat" : good ? "yes" : "no"} data-ek-delta={p}><span aria-hidden>{flat ? "■" : up ? "▲" : "▼"}</span><bdi data-no-i18n>{pct(Math.abs(p), 1)}</bdi><span className="sr-only">{flat ? (ar ? "دون تغيير" : "unchanged") : up ? (ar ? "ارتفاع" : "up") : ar ? "انخفاض" : "down"}</span></span>;
}
/** A scorecard row without a previous period: no comparison value, or a current-state measure that reads the same on both dates. */
function noPrev(r: ScoreRow): boolean {
  return r.prev === undefined || (isValidElement(r.prev) && (r.prev.props as Record<string, unknown>)["data-ek-prev"] === "current");
}
/** KPI scorecard table: indicator · this period · previous period · change % — a different visual from the card row, fixed height with inner scroll.
 *  Owner notes A-10: rows without a previous period share one merged «لا توجد فترة سابقة» cell (never «حالة حالية» on every row) and the
 *  change column states the reason instead of «—». */
/** A shown value that is zero (0, 0.00, ⃁ 0.00 …). */
const zeroValue = (v: ReactNode) => typeof v === "string" ? /^[^\d]*0(?:[.,]0+)?[^\d]*$/.test(v.trim()) : typeof v === "number" ? v === 0 : false;
export function Scorecard({ rows, ar, title, sub, height = 300, id, prevLabel, rowWrap }: { rows: ScoreRow[]; ar: boolean; title?: ReactNode; sub?: ReactNode; height?: number; id?: string | undefined; prevLabel?: ReactNode; rowWrap?: ((r: ScoreRow, tr: ReactNode) => ReactNode) | undefined }) {
  if (!rows.length) return null;
  const np = rows.map(noPrev);
  const span = (i: number) => { let n = 0; while (i + n < rows.length && np[i + n]) n++; return n; };
  return <section className="ek-card ek-score" data-ek-score={id ?? ""} data-ek-chart="scorecard">
    {title && <header className="ek-card-head"><div className="min-w-0"><h3 className="ek-h3">{title}</h3>{sub && <p className="ek-card-sub">{sub}</p>}</div><span className="ek-tab-n" data-no-i18n>{rows.length}</span></header>}
    <div className="ek-score-body" style={{ maxHeight: height }}><table className="ek-score-t">
      <thead><tr><th>{ar ? "المؤشر" : "Indicator"}</th><th data-num>{ar ? "هذه الفترة" : "This period"}</th><th data-num>{prevLabel ?? (ar ? "الفترة السابقة" : "Previous period")}</th><th data-num>{ar ? "التغير" : "Change"}</th></tr></thead>
      <tbody>{rows.map((r, i) => {
        const runStart = np[i] && (i === 0 || !np[i - 1]); const n = runStart ? span(i) : 0;
        const tr = <tr key={r.id} data-tone={r.tone} data-ek-score-row={r.id} {...r.attrs}>
        <td><span className="ek-score-l">{r.label}</span>{r.sub && <span className="ek-score-sub">{r.sub}</span>}</td>
        <td data-num className="ek-score-v">{r.state ?? (() => { const sg = signOf(r.value); return <><bdi data-no-i18n {...(sg.sign < 0 ? { "data-sign": "neg" } : {})}>{r.wrap ? r.wrap(sg.node) : sg.node}</bdi>
          {/* owner notes B-07: a zero says why instead of a silent 0 */}
          {zeroValue(r.value) && <span className="ek-score-zero" data-ek-score-zero>{r.zeroReason ?? (ar ? "لا يوجد سجل يطابق المؤشر الآن" : "No record matches this indicator now")}</span>}</>; })()}</td>
        {!np[i] ? <>
          <td data-num className="ek-score-p">{r.prev}</td>
          <td data-num><ScoreDelta pct={r.pct} better={r.better} ar={ar} reason={ar ? "لا تُحسب نسبة: السابق صفر أو غير رقمي" : "No % change: previous is zero or not a number"} /></td>
        </> : runStart ? <>
          <td data-num className="ek-score-p ek-score-none" rowSpan={n} data-ek-noprev={n}>{ar ? "لا توجد فترة سابقة" : "No previous period"}</td>
          <td data-num className="ek-score-none" rowSpan={n}>{ar ? "لا يُحسب التغير بلا فترة سابقة" : "No change without a previous period"}</td>
        </> : null}
      </tr>; return rowWrap ? rowWrap(r, tr) : tr; })}</tbody></table></div>
  </section>;
}
/** A strip of 3–4 mini indicators above a chart (total, average, best, worst), all computed from the chart's own data. */
export function MiniStats({ data, fmt = num, ar }: { data: Datum[]; fmt?: Fmt; ar: boolean }) {
  const vals = data.filter((d) => Number.isFinite(d.value));
  if (vals.length < 2) return null;
  const total = vals.reduce((a, d) => a + d.value, 0);
  const best = vals.reduce((a, d) => (d.value > a.value ? d : a)), worst = vals.reduce((a, d) => (d.value < a.value ? d : a));
  // long amounts shorten (13.98M) so a narrow block never truncates them; the exact value stays in the tooltip
  const cell = (k: string, l: string, v: string, who?: Datum, raw?: number) => <li key={k} data-ek-mini={k} title={v}><span className="ek-mini-l">{l}</span><b className="ek-mini-v" data-no-i18n>{v.length > 11 && raw !== undefined ? (v.includes("\u20C1") ? `\u2066\u20C1 ${short(raw)}\u2069` : short(raw)) : v}</b>{who && <span className="ek-mini-s">{who.data ? <bdi data-no-i18n>{who.label}</bdi> : who.label}</span>}</li>;
  return <ul className="ek-mini" data-ek-chart="mini-stats">
    {cell("total", ar ? "الإجمالي" : "Total", fmt(total), undefined, total)}
    {cell("avg", ar ? "المتوسط" : "Average", fmt(Math.round((total / vals.length) * 100) / 100), undefined, total / vals.length)}
    {cell("best", ar ? "الأعلى" : "Highest", fmt(best.value), best, best.value)}
    {cell("worst", ar ? "الأدنى" : "Lowest", fmt(worst.value), worst, worst.value)}
  </ul>;
}
