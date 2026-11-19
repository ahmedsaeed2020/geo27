/**
 * DIGIT Experience primitives (presentation only). One visual language for every DIGIT app and DIGIT Core department
 * home: page identity, two-tone command band, semantic signal cards, comparison chips, mini trends, chart panels,
 * ranked exceptions, tab bars, directories and honest empty / denied / error / loading states.
 *
 * Rules: these components never compute business values. Callers pass values, tones and series they already read from
 * the shared adapter / report rows / Insights engine; a mini trend renders only when a real series is passed. Links are
 * passed in by the caller (each app keeps its own link helpers and context), so these components stay router-agnostic.
 */
import { Children, Fragment, isValidElement, type CSSProperties, type ReactNode } from "react";
import { GroupedColumns, type Tone } from "@/components/enterprise/kit/charts";
import { ContextStrip } from "@/components/enterprise/kit/templates";
import { useLang } from "@/i18n";

export type DxTone = "good" | "warn" | "bad" | "info" | "neutral";
const FOCUS = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";
const STRIP: Record<DxTone, string> = { good: "bg-dx-good", warn: "bg-dx-warn", bad: "bg-dx-bad", info: "bg-dx-info", neutral: "bg-dx-neutral/50" };
const INK: Record<DxTone, string> = { good: "text-dx-good", warn: "text-dx-warn", bad: "text-dx-bad", info: "text-dx-info", neutral: "text-foreground" };
const SOFT: Record<DxTone, string> = { good: "bg-dx-good-soft text-dx-good", warn: "bg-dx-warn-soft text-dx-warn", bad: "bg-dx-bad-soft text-dx-bad", info: "bg-dx-info-soft text-dx-info", neutral: "bg-dx-neutral-soft text-dx-neutral" };
// tone colours follow the Enterprise kit colour roles (green good, amber attention, red risk)
const STROKE: Record<DxTone, string> = { good: "var(--ek-good)", warn: "var(--ek-attention)", bad: "var(--ek-risk)", info: "var(--ek-info)", neutral: "var(--ek-neutral)" };
export const dxSoft = (t: DxTone) => SOFT[t];
export const dxInk = (t: DxTone) => INK[t];

/** Forward chevron that mirrors in RTL (drill / open affordance). */
export function Chev() { return <span aria-hidden className="inline-block rtl:-scale-x-100">›</span>; }

// ---------------------------------------------------------------- page identity + command band
/** Breadcrumb trail above the band (no title: the title lives in the shared band, owner 2026-11-12 "band first"). */
export function DxCrumbs({ crumbs, back, ariaCrumbs = "Breadcrumb" }: { crumbs?: ReactNode[] | undefined; back?: ReactNode | undefined; ariaCrumbs?: string | undefined }) {
  if (!crumbs?.length && !back) return null;
  return <nav className="mb-2 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground" aria-label={ariaCrumbs} data-dx-crumbs>
    {back}{crumbs?.map((c, i) => <span key={i} className="flex items-center gap-1.5">{i > 0 && <span aria-hidden className="text-muted-foreground/60">/</span>}{c}</span>)}
  </nav>;
}
/** Page identity drawn as the shared Enterprise band (ContextStrip): breadcrumb trail, then icon / title / subtitle / actions. */
export function DxIdentity({ crumbs, back, icon, title, subtitle, aside, ariaCrumbs = "Breadcrumb" }: { crumbs?: ReactNode[] | undefined; back?: ReactNode | undefined; icon?: ReactNode | undefined; title: ReactNode; subtitle?: ReactNode | undefined; aside?: ReactNode | undefined; ariaCrumbs?: string | undefined }) {
  return <header className="mb-4" data-page-header data-dx-identity>
    <DxCrumbs crumbs={crumbs} back={back} ariaCrumbs={ariaCrumbs} />
    <ContextStrip icon={icon} title={title} sub={subtitle} actions={aside} />
  </header>;
}

export interface BandMeta { label: ReactNode; value: ReactNode }
/**
 * Command band = the shared Enterprise band (ContextStrip): eyebrow, title, data basis, scope meta (facts), scope controls
 * and the permitted primary actions, so every app inherits one header (owner 2026-11-12 ONE STANDARD R1).
 */
export function CommandBand({ eyebrow, title, description, meta, controls, actions, compact, children, id, icon }: { eyebrow?: ReactNode | undefined; title: ReactNode; description?: ReactNode | undefined; meta?: BandMeta[] | undefined; controls?: ReactNode | undefined; actions?: ReactNode | undefined; compact?: boolean | undefined; children?: ReactNode | undefined; id?: string | undefined; icon?: ReactNode | undefined }) {
  return (
    <section className="mb-4" data-command-band={compact ? "compact" : "full"} aria-labelledby={id ? `${id}-q` : undefined}>
      <ContextStrip icon={icon} eyebrow={eyebrow} title={<span id={id ? `${id}-q` : undefined}>{title}</span>} sub={description}
        facts={(meta ?? []).map((m, i) => ({ id: `m${i}`, label: m.label, value: m.value, i18n: true }))}
        aside={controls ? <div className="ek-band-controls" role="search" data-band-controls>{controls}</div> : undefined}
        actions={actions ? <span className="contents" data-band-actions>{actions}</span> : undefined} />
      {children}
    </section>
  );
}
/** A labelled scope control placed inside the band. */
export function BandField({ label, children }: { label: string; children: ReactNode }) {
  return <label className="flex min-w-[10rem] flex-col gap-1 text-[11px] font-medium text-dx-on-band-muted">{label}{children}</label>;
}
export const bandInput = `min-h-9 rounded-md border border-dx-on-band/25 bg-dx-on-band/10 px-2.5 py-1.5 text-sm text-dx-on-band transition-colors hover:border-dx-on-band/45 max-md:min-h-11 ${FOCUS}`;
/** Band actions use the shared Enterprise band buttons (mint on the band, hover glow; framed on light surfaces). */
export const BAND_BTN = {
  primary: `ek-context-btn ek-btn-on-dark max-md:min-h-11 ${FOCUS}`,
  secondary: `ek-context-btn max-md:min-h-11 ${FOCUS}`,
} as const;

// ---------------------------------------------------------------- signal cards
/** Comparison / delta chip. Only for comparisons the source already computes (variance, overdue of total, …). */
export function Chip({ tone = "neutral", children, title }: { tone?: DxTone | undefined; children: ReactNode; title?: string | undefined }) {
  return <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium leading-4 ${SOFT[tone]}`} title={title} data-dx-chip={tone}>{children}</span>;
}
/** Mini trend of a real series (≥ 2 points). Returns null otherwise, so no decorative line is ever drawn. */
export function Sparkline({ values, tone = "good", label, className }: { values: number[]; tone?: DxTone | undefined; label: string; className?: string | undefined }) {
  const v = values.filter((x) => Number.isFinite(x));
  if (v.length < 2 || v.every((x) => x === 0)) return null;
  const w = 96, h = 26, min = Math.min(...v), max = Math.max(...v), span = max - min || 1;
  const pts = v.map((x, i) => [(i / (v.length - 1)) * w, h - 2 - ((x - min) / span) * (h - 4)] as const);
  const d = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} className={`overflow-visible ${className ?? ""}`} role="img" aria-label={label} data-sparkline={v.length}>
      <path d={`${d} L${w},${h} L0,${h} Z`} fill={STROKE[tone]} opacity={0.1} />
      <path d={d} fill="none" stroke={STROKE[tone]} strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={pts[pts.length - 1]![0]} cy={pts[pts.length - 1]![1]} r={2.2} fill={STROKE[tone]} />
    </svg>
  );
}
export interface SignalProps {
  label: ReactNode; value: ReactNode; tone?: DxTone | undefined; unit?: ReactNode | undefined; basis?: ReactNode | undefined; delta?: { text: ReactNode; tone?: DxTone | undefined; title?: string | undefined } | undefined;
  spark?: { values: number[]; label: string } | undefined; footer?: ReactNode | undefined; corner?: ReactNode | undefined;
  /** progress against a budget / target under the value (Construction phase 5: no number-only card) */
  meter?: { pct: number; level?: "ok" | "warn" | "over" | undefined; label: string } | undefined;
  /** wraps the card body in the caller's link (keeps each app's drill/link context); omitted → static card */
  link?: ((body: ReactNode, className: string) => ReactNode) | undefined;
  attrs?: Record<string, string | undefined>;
}
/** Enterprise kit tone of a DIGIT Experience tone (owner 2026-11-12: one KPI tile for every app). */
export const kitTone = (t: DxTone): Tone => (t === "warn" ? "attention" : t === "bad" ? "risk" : t);
/**
 * Semantic signal card — drawn as the Enterprise kit KPI tile (src/components/enterprise/kit: white framed card, tone
 * marker, emphasised value, comparison chip, basis, optional real mini trend, open link), so every app's indicators match.
 */
export function SignalCard({ label, value, tone = "neutral", unit, basis, delta, spark, footer, corner, link, attrs, meter }: SignalProps) {
  const body = (
    <>
      <span className="ek-kpi-head pe-5"><span className="ek-kpi-label">{label}</span></span>
      <span className="ek-kpi-main">
        <span className="ek-kpi-value" data-no-i18n>{value}</span>
        {unit && <span className="ek-kpi-unit">{unit}</span>}
        {delta && <Chip tone={delta.tone ?? "neutral"} title={delta.title}>{delta.text}</Chip>}
      </span>
      {meter && <span className="ek-kpi-target" data-kpi-meter={Math.round(meter.pct * 10) / 10}><span className="ek-kpi-target-bar"><span style={{ width: `${Math.max(0, Math.min(100, meter.pct))}%` }} {...(meter.level ? { "data-level": meter.level } : {})} /></span><span className="ek-kpi-target-l" data-no-i18n>{meter.label}</span></span>}
      {(basis || spark) && <span className="flex items-end justify-between gap-2">
        {basis ? <span className="ek-kpi-sub line-clamp-2">{basis}</span> : <span />}
        {spark && <Sparkline values={spark.values} label={spark.label} tone={tone === "neutral" ? "good" : tone} className="shrink-0" />}
      </span>}
      {footer && <span className="ek-kpi-open">{footer}</span>}
    </>
  );
  return (
    <div className="relative min-w-0" data-signal={tone} {...attrs}>
      {link ? link(body, `ek-kpi h-full ek-tone-${kitTone(tone)} ${FOCUS}`) : <div className="ek-kpi h-full" data-tone={kitTone(tone)}>{body}</div>}
      {corner && <div className="absolute end-1.5 top-2">{corner}</div>}
    </div>
  );
}
/** Responsive signal row: one kit KPI row (up to six across; `3` keeps the section 3×2 layout for six). */
export function SignalGrid({ children, cols = "auto" }: { children: ReactNode; cols?: "auto" | 3 | 4 | 6 | undefined }) {
  // a fragment of tiles counts as its tiles, so a page passing <>…</> still gets one column per tile
  const flat = (c: ReactNode): ReactNode[] => Children.toArray(c).flatMap((x) => (isValidElement(x) && x.type === Fragment ? flat((x.props as { children?: ReactNode }).children) : [x]));
  const n = Math.max(1, Math.min(6, cols === "auto" ? flat(children).length : cols));
  return <div className="ek-kpi-grid mb-4" style={{ "--ek-kpi-n": n } as CSSProperties} data-signal-grid>{children}</div>;
}

// ---------------------------------------------------------------- panels and layout
export function DxPanel({ title, subtitle, actions, children, footer, id, className, flush, attrs }: { title: ReactNode; subtitle?: ReactNode | undefined; actions?: ReactNode | undefined; children: ReactNode; footer?: ReactNode | undefined; id?: string | undefined; className?: string | undefined; flush?: boolean | undefined; attrs?: Record<string, string | undefined> }) {
  return (
    <section className={`ek-card mb-4 flex min-w-0 flex-col overflow-hidden ${className ?? ""}`} id={id} aria-labelledby={id ? `${id}-h` : undefined} data-dx-panel {...attrs}>
      <div className="ek-card-head">
        <div className="min-w-0">
          <h2 id={id ? `${id}-h` : undefined} className="ek-h3">{title}</h2>
          {subtitle && <p className="ek-card-sub">{subtitle}</p>}
        </div>
        {actions && <div className="ek-card-action flex flex-wrap items-center gap-2 text-xs">{actions}</div>}
      </div>
      <div className={`min-w-0 flex-1 ${flush ? "" : "ek-card-body"}`}>{children}</div>
      {footer && <div className="ek-card-foot">{footer}</div>}
    </section>
  );
}
/** Two-column analytic row (default 7:5) that stacks below lg. */
export function DxSplit({ children, ratio = "7:5" }: { children: ReactNode; ratio?: "7:5" | "8:4" | "1:1" | undefined }) {
  const c = ratio === "8:4" ? "lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]" : ratio === "1:1" ? "lg:grid-cols-2" : "lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]";
  return <div className={`grid grid-cols-[minmax(0,1fr)] gap-x-4 ${c}`} data-dx-split={ratio}>{children}</div>;
}

// ---------------------------------------------------------------- charts
// Enterprise kit brand-led categorical series (green, amber, teal, blue, deep green)
const SERIES = ["var(--ek-s1)", "var(--ek-s3)", "var(--ek-s4)", "var(--ek-s5)", "var(--ek-s2)"];
export const seriesColor = (i: number) => SERIES[i % SERIES.length]!;
/**
 * Vertical column chart for period / volume series (grouped when several series). Each mark is wrapped by `mark`
 * so the caller links it to the exact report rows behind it. Values are drawn as passed — nothing is computed here.
 */
export function ColumnChart({ labels, series, format, mark, labelText, height = 180, ariaLabel }: { labels: string[]; series: { name: string; label: string; values: number[] }[]; format: (v: number) => string; mark?: ((li: number, si: number, node: ReactNode) => ReactNode) | undefined; labelText?: ((l: string) => string) | undefined; height?: number | undefined; ariaLabel: string }) {
  // drawn by the Enterprise kit grouped columns (bars fill the card); each mark keeps the caller's link to its source rows
  const ar = useLang() === "ar";
  return (
    <div className="min-w-0" data-chart="columns" role="figure" aria-label={ariaLabel}>
      <GroupedColumns ar={ar} height={height} fmt={format} axisFmt={format}
        groups={labels.map((l) => ({ key: l, label: labelText ? labelText(l) : l, data: true }))}
        series={series.map((x, si) => ({ label: x.label, values: x.values, ...(mark ? { drills: x.values.map((_, li) => `${li}:${si}`) } : {}) }))}
        wrap={mark ? (drill, node) => { const [li, si] = String(drill).split(":").map(Number); return mark(li!, si!, node); } : undefined} />
    </div>
  );
}
/** Horizontal bucket / ranking bars. `wrap` links a row to the source rows behind it. */
export function BucketBars({ items, format, empty }: { items: { key: string; label: ReactNode; value: number; tone?: DxTone | undefined; share?: string | undefined; wrap?: ((node: ReactNode) => ReactNode) | undefined }[]; format: (v: number) => string; empty: ReactNode }) {
  if (!items.length || items.every((i) => !i.value)) return <DxState kind="empty" title={empty} />;
  const max = Math.max(...items.map((i) => Math.abs(i.value))) || 1;
  // Enterprise kit ranked bars: rank, label, value and share above a full-width track
  return (
    <ol className="ek-ranked" role="list" data-chart="buckets">
      {items.map((i, idx) => {
        const node = (
          <span className="ek-ranked-row">
            <span className="ek-ranked-n" data-no-i18n>{idx + 1}</span>
            <span className="ek-ranked-l">{i.label}</span>
            {/* value and share keep one reading order in Arabic ("1.2K 90%"), so the two numbers never run together */}
            <span className="ek-ranked-v" dir="ltr" data-no-i18n>{format(i.value)}{i.share && <span className="ek-muted">{" "}{i.share}</span>}</span>
            <span className="ek-ranked-track"><span style={{ width: `${i.value ? Math.max(1.5, (Math.abs(i.value) / max) * 100) : 0}%`, background: i.tone ? STROKE[i.tone] : idx === 0 ? "var(--ek-s1)" : "var(--ek-s1-soft)" }} /></span>
          </span>
        );
        return <li key={i.key}>{i.wrap ? i.wrap(node) : node}</li>;
      })}
    </ol>
  );
}

// ---------------------------------------------------------------- exceptions, worklists, tabs
export interface ExceptionItem { key: string; severity: "bad" | "warn" | "info"; title: ReactNode; detail?: ReactNode | undefined; count: number; action?: ReactNode | undefined; attrs?: Record<string, string | undefined> }
/** Ranked exception list: highest severity first, then by count; each row names its source and opens it. */
export function ExceptionList({ items, empty, severityLabel }: { items: ExceptionItem[]; empty: ReactNode; severityLabel: (s: ExceptionItem["severity"]) => string }) {
  const rank = { bad: 0, warn: 1, info: 2 } as const;
  const open = items.filter((i) => i.count > 0).sort((a, b) => rank[a.severity] - rank[b.severity] || b.count - a.count);
  if (!open.length) return <DxState kind="empty" title={empty} />;
  return (
    <ol className="divide-y divide-border/70" data-exception-list>
      {open.map((i, n) => (
        <li key={i.key} className="flex items-center gap-3 py-2.5 text-sm" {...i.attrs}>
          <span className="w-4 shrink-0 text-center text-[11px] tabular-nums text-muted-foreground" data-no-i18n>{n + 1}</span>
          <span className={`inline-flex h-6 min-w-7 shrink-0 items-center justify-center rounded-md px-1.5 text-xs font-semibold tabular-nums ${SOFT[i.severity]}`} data-no-i18n>{i.count}</span>
          <div className="min-w-0 flex-1">
            <div className="flex items-start gap-2"><span className="line-clamp-2 font-medium leading-snug">{i.title}</span><span className={`hidden shrink-0 rounded px-1.5 text-[10px] font-semibold uppercase tracking-wide sm:inline ${SOFT[i.severity]}`}>{severityLabel(i.severity)}</span></div>
            {i.detail && <div className="truncate text-xs text-muted-foreground">{i.detail}</div>}
          </div>
          {i.action && <div className="shrink-0 text-xs">{i.action}</div>}
        </li>
      ))}
    </ol>
  );
}
export interface TabDef { key: string; label: ReactNode; count?: number | undefined }
/** Underlined section / worklist tabs (2px emerald active line). `render` lets the caller use its own router links. */
export function TabBar({ tabs, value, onChange, render, ariaLabel, size = "md", wrap }: { tabs: TabDef[]; value: string; onChange?: (k: string) => void; render?: (t: TabDef, className: string, active: boolean, content: ReactNode) => ReactNode; ariaLabel: string; size?: "md" | "sm" | undefined; wrap?: boolean | undefined }) {
  return (
    <div className={`${size === "md" ? "mb-4" : ""} flex min-w-0 gap-1 overflow-x-auto border-b border-border [scrollbar-width:none] ${wrap ? "lg:flex-wrap lg:overflow-visible" : ""}`} role="tablist" aria-label={ariaLabel} data-tab-bar>
      {tabs.map((t) => {
        const on = t.key === value;
        const cls = `relative -mb-px inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 ${size === "md" ? "py-2.5 text-[13.5px]" : "py-2 text-[12.5px]"} font-medium transition-colors max-md:min-h-11 ${on ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:border-border hover:text-foreground"} ${FOCUS}`;
        const content = <>{t.label}{t.count !== undefined && <span className={`rounded-full px-1.5 text-[11px] tabular-nums ${on ? "bg-primary/12 text-primary" : "bg-muted text-muted-foreground"}`} data-no-i18n>{t.count}</span>}</>;
        if (render) return <span key={t.key} className="contents" data-tab={t.key}>{render(t, cls, on, content)}</span>;
        return <button key={t.key} type="button" role="tab" aria-selected={on} className={cls} data-tab={t.key} onClick={() => onChange?.(t.key)}>{content}</button>;
      })}
    </div>
  );
}

// ---------------------------------------------------------------- directory and report cards
export interface DirItem { key: string; node: (className: string, inner: ReactNode) => ReactNode; label: ReactNode; meta?: ReactNode | undefined; count?: number | undefined }
/** Categorized module directory: every navigation entry of a module stays reachable here. */
export function DirectoryGroups({ groups }: { groups: { key: string; title: ReactNode; items: DirItem[] }[] }) {
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,17rem),1fr))] gap-4" data-directory>
      {groups.filter((g) => g.items.length).map((g) => (
        <section key={g.key} className="rounded-lg border border-border bg-card shadow-sm" data-directory-group={g.key}>
          <h3 className="border-b border-border px-4 py-2.5 text-[13px] font-semibold text-foreground">{g.title}<span className="ms-1.5 text-[11px] font-normal text-muted-foreground" data-no-i18n>({g.items.length})</span></h3>
          <ul className="p-1.5" role="list">
            {g.items.map((i) => (
              <li key={i.key}>{i.node(`flex items-center justify-between gap-2 rounded-md px-2.5 py-2 text-[13px] text-foreground hover:bg-muted ${FOCUS}`, <>
                <span className="min-w-0"><span className="block truncate">{i.label}</span>{i.meta && <span className="block truncate text-[11px] text-muted-foreground">{i.meta}</span>}</span>
                {i.count !== undefined && <span className="shrink-0 rounded-full bg-muted px-1.5 text-[11px] tabular-nums text-muted-foreground" data-no-i18n>{i.count}</span>}
              </>)}</li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- states
/** Honest state panel: empty (no rows), denied (no permission), error (source failed), loading (skeleton). */
export function DxState({ kind, title, detail, action }: { kind: "empty" | "denied" | "error" | "loading"; title?: ReactNode | undefined; detail?: ReactNode | undefined; action?: ReactNode | undefined }) {
  if (kind === "loading") return <div className="space-y-2 py-2" role="status" aria-busy="true" data-dx-state="loading">{[0, 1, 2].map((i) => <div key={i} className="h-3.5 animate-pulse rounded bg-muted" style={{ width: `${88 - i * 18}%` }} />)}<span className="sr-only">{title ?? "Loading"}</span></div>;
  const tone = kind === "denied" ? "warn" : kind === "error" ? "bad" : "neutral";
  return (
    <div className={`flex flex-col items-center justify-center gap-1 rounded-md px-4 py-6 text-center ${kind === "empty" ? "" : SOFT[tone]}`} role={kind === "empty" ? "status" : "alert"} data-dx-state={kind}>
      {title && <div className={`text-sm ${kind === "empty" ? "text-muted-foreground" : "font-medium"}`}>{title}</div>}
      {detail && <div className="max-w-md text-xs text-muted-foreground">{detail}</div>}
      {action && <div className="mt-1 text-xs">{action}</div>}
    </div>
  );
}
