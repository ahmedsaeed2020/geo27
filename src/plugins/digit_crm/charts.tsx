/**
 * DIGIT CRM chart kit — presentation of EXISTING widget data (wf10/wf11 Widget) only. Each renderer is chosen by the
 * module composition (modules.ts) for the meaning of the metric; every segment, point, cell and row navigates to the
 * widget's own drill destination, so the records opened are the records counted. No values are computed here except
 * display proportions (share of the shown total, bar lengths). Colors are CRM-scoped series tokens (styles.css).
 */
import { plainSource } from "./sourceLabel";
import { Link, useNavigate } from "@tanstack/react-router";
import { useState, type KeyboardEvent, type ReactNode } from "react";
import { ArrowUpRight, CircleAlert } from "lucide-react";
import { boardOfWidget, type Bar, type Row, type Widget } from "./wf10";
import { DevOnly } from "@/components/DevOnly";
import { tLabel, useLang } from "@/i18n";
import { AreaChart, Donut as KitDonut, type Datum } from "@/components/enterprise/kit";
import { Go, N, ScopeChip, WidgetBody } from "./WidgetKit";
import type { PanelSpec } from "./modules";
import type { Activity } from "./wf02";
import { userLabel } from "./wf01";
import { RefLink } from "./Wave2";

/** Record codes and user ids stay untranslated; business labels (stages, states, bands) go through i18n. */
export const Lbl = ({ v, rec }: { v: string; rec?: boolean | undefined }) => (rec || /^[A-Z]{2,}-[A-Z0-9-]+$|@/.test(v) ? <bdi data-no-i18n>{v}</bdi> : <>{v}</>);
const series = (i: number) => `var(--dc-s${i % 8})`;
const shareOf = (v: number, total: number) => (total ? Math.round((v / total) * 100) : 0);
type Dest = { to?: string | undefined; search?: Record<string, string> | undefined };

/** Keyboard + pointer navigation for SVG marks (an SVG <path> cannot host a router Link). */
function useGo() {
  const nav = useNavigate();
  return (d: Dest) => ({
    role: d.to ? "link" : undefined, tabIndex: d.to ? 0 : undefined, "data-dc-go": d.to ? "" : undefined,
    onClick: () => { if (d.to) void nav({ to: d.to as never, search: (d.search ?? {}) as never }); },
    onKeyDown: (e: KeyboardEvent) => { if (d.to && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); void nav({ to: d.to as never, search: (d.search ?? {}) as never }); } },
  });
}

export function Empty({ children = "No data yet." }: { children?: ReactNode }) {
  return <p className="py-6 text-center text-sm text-muted-foreground" data-dc-state="empty">{children}</p>;
}

/* ---------- Donut: part-to-whole (shared Enterprise chart kit, ONE STANDARD R4) ---------- */
const CODE = /^[A-Z]{2,}-[A-Z0-9-]+$|@/;
const crmDatum = (b: Bar, i: number): Datum => ({ key: `${b.label}-${i}`, label: b.label, value: b.value, data: CODE.test(b.label), ...(b.to ? { drill: { to: b.to, search: b.search } } : {}), attrs: { "data-dc-seg": b.label } });
const crmWrap = (drill: unknown, n: ReactNode) => { const d = drill as Dest; return <Go to={d.to} search={d.search} className="block">{n}</Go>; };
export function Donut({ bars, unit }: { bars: Bar[]; unit?: string | undefined }) {
  const ar = useLang() === "ar";
  if (!bars.reduce((a, b) => a + b.value, 0)) return <Empty />;
  return <div data-dc-viz="donut"><KitDonut data={bars.map(crmDatum)} ar={ar} wrap={crmWrap} max={6} {...(unit ? { centerLabel: unit } : {})} /></div>;
}

/* ---------- Funnel: progression ---------- */
export function Funnel({ bars }: { bars: Bar[] }) {
  const max = Math.max(1, ...bars.map((b) => b.value));
  if (!bars.some((b) => b.value)) return <Empty />;
  return <ol className="space-y-1.5" data-dc-viz="funnel">{bars.map((b, i) => <li key={b.label}>
    <Go to={b.to} search={b.search} className="group grid grid-cols-[minmax(6rem,9rem)_1fr_auto] items-center gap-3">
      <span className="truncate text-xs text-muted-foreground group-hover:text-foreground"><Lbl v={b.label} rec={b.rec} /></span>
      <span className="flex justify-center"><span className="block h-8 rounded transition-opacity group-hover:opacity-85" style={{ width: `${Math.max(3, (b.value / max) * 100)}%`, background: series(i) }} /></span>
      <span className="w-20 text-end text-sm font-semibold"><N v={b.display ?? b.value.toLocaleString("en-US")} /></span>
    </Go></li>)}</ol>;
}

/* ---------- Area trend: values over time (shared Enterprise chart kit) ---------- */
export function AreaTrend({ bars, unit }: { bars: Bar[]; unit?: string | undefined }) {
  const ar = useLang() === "ar";
  if (!bars.length) return <Empty />;
  return <div data-dc-viz="area"><AreaChart data={bars.map(crmDatum)} ar={ar} wrap={crmWrap} {...(unit ? { valueLabel: unit } : {})} /></div>;
}

/* ---------- Columns: discrete periods or bands ---------- */
export function Columns({ bars }: { bars: Bar[] }) {
  const max = Math.max(1, ...bars.map((b) => b.value));
  if (!bars.length) return <Empty />;
  return <div className="overflow-x-auto" data-dc-viz="columns"><div className={`flex h-48 items-end gap-2 border-b border-border pb-1 ${bars.length > 10 ? "min-w-[36rem]" : ""}`}>
    {bars.map((b) => <Go key={b.label} to={b.to} search={b.search} className="group flex h-full min-w-0 flex-1 flex-col items-center justify-end text-center" label={`${b.label}: ${b.display ?? b.value}`}>
      <span className="mb-1 text-xs font-medium"><N v={b.display ?? b.value.toLocaleString("en-US")} /></span>
      <span className="block w-full max-w-14 rounded-t transition-opacity group-hover:opacity-80" style={{ height: `${(b.value / max) * 78}%`, minHeight: b.value ? 3 : 0, background: "var(--dc-s0)" }} />
    </Go>)}
  </div><div className={`mt-1 flex gap-2 ${bars.length > 10 ? "min-w-[36rem]" : ""}`}>{bars.map((b) => <span key={b.label} className="min-w-0 flex-1 truncate text-center text-[10px] text-muted-foreground" title={b.label}><Lbl v={b.label} rec={b.rec} /></span>)}</div></div>;
}

/* ---------- Ranked horizontal bars ---------- */
const BAR_LIMIT = 8;
export function HBars({ bars }: { bars: Bar[] }) {
  const [all, setAll] = useState(false);
  if (!bars.length) return <Empty />;
  const sorted = [...bars].sort((a, b) => b.value - a.value), max = Math.max(1, ...sorted.map((b) => b.value));
  const shown = all ? sorted : sorted.slice(0, BAR_LIMIT);
  return <div data-dc-viz="bars"><ol className="space-y-2">{shown.map((b, i) => <li key={b.label}>
    <Go to={b.to} search={b.search} className="group block">
      <div className="mb-0.5 flex items-baseline gap-2 text-sm"><span className="w-5 text-[11px] text-muted-foreground"><N v={i + 1} /></span><span className="min-w-0 flex-1 truncate group-hover:text-primary"><Lbl v={b.label} rec={b.rec} /></span><span className="font-medium"><N v={b.display ?? b.value.toLocaleString("en-US")} /></span></div>
      <div className="ms-7 h-1.5 rounded bg-muted"><div className="h-1.5 rounded" style={{ width: `${(b.value / max) * 100}%`, background: "var(--dc-s0)" }} /></div>
    </Go></li>)}</ol>
    {sorted.length > BAR_LIMIT && <button type="button" className="mt-2 text-xs text-primary hover:underline" aria-expanded={all} onClick={() => setAll((v) => !v)} data-dc-bars-toggle>{all ? <span>Show fewer</span> : <><span>Show all</span> (<N v={sorted.length} />)</>}</button>}
  </div>;
}

/* ---------- Stacked bars: owner × category (heat-shaped widgets) ---------- */
export function Stacked({ w }: { w: Widget }) {
  const h = w.heat, [off, setOff] = useState<Set<number>>(new Set()), [all, setAll] = useState(false);
  if (!h || !h.rows.length) return <Empty />;
  const on = (j: number) => !off.has(j);
  const totals = h.rows.map((_, i) => (h.cells[i] ?? []).reduce((a, v, j) => a + (on(j) ? v : 0), 0));
  const max = Math.max(1, ...totals);
  const colTotals = h.cols.map((_, j) => h.rows.reduce((a, _r, i) => a + (h.cells[i]?.[j] ?? 0), 0));
  const rows = all ? h.rows : h.rows.slice(0, 10);
  const toggle = (j: number) => setOff((s) => { const n = new Set(s); if (n.has(j)) n.delete(j); else if (n.size < h.cols.length - 1) n.add(j); return n; });
  return <div data-dc-viz="stacked">
    <div className="mb-3 flex flex-wrap gap-1.5" role="group" aria-label="Series" data-dc-legend>{h.cols.map((c, j) => <button key={c} type="button" aria-pressed={on(j)} onClick={() => toggle(j)} data-dc-series={c}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs ${on(j) ? "border-border bg-card" : "border-dashed border-border bg-muted/40 text-muted-foreground line-through"}`}>
      <span className="h-2 w-2 rounded-sm" style={{ background: series(j) }} aria-hidden /><Lbl v={c} /><span className="text-muted-foreground"><N v={colTotals[j] ?? 0} /></span></button>)}</div>
    <ol className="space-y-1.5">{rows.map((r, i) => <li key={r} className="grid grid-cols-[minmax(7rem,11rem)_1fr_3rem] items-center gap-3 text-sm" data-dc-row={r}>
      <span className="truncate" title={r}><Lbl v={r} rec={!!h.recRows && r !== "Unassigned"} /></span>
      <span className="flex h-5 overflow-hidden rounded bg-muted" style={{ width: `${Math.max(2, ((totals[i] ?? 0) / max) * 100)}%` }}>
        {h.cols.map((c, j) => { const v = h.cells[i]?.[j] ?? 0; if (!v || !on(j)) return null; const d = w.heatCell?.(r, c);
          return <Link key={c} to={(d?.to ?? ".") as never} search={(d?.search ?? {}) as never} className="block h-full hover:opacity-80 focus:outline-none focus:ring-2 focus:ring-ring" style={{ width: `${(v / (totals[i] || 1)) * 100}%`, background: series(j) }} aria-label={`${r} · ${c}: ${v}`} title={`${c}: ${v}`} data-dc-cell={`${r}|${c}`} />; })}
      </span>
      <span className="text-end font-medium"><N v={totals[i] ?? 0} /></span>
    </li>)}</ol>
    {h.rows.length > 10 && <button type="button" className="mt-2 text-xs text-primary hover:underline" aria-expanded={all} onClick={() => setAll((v) => !v)} data-dc-bars-toggle>{all ? <span>Show fewer</span> : <><span>Show all</span> (<N v={h.rows.length} />)</>}</button>}
  </div>;
}

/* ---------- Heatmap: two-dimensional distribution ---------- */
export function Heat({ w }: { w: Widget }) {
  const h = w.heat; if (!h || !h.rows.length) return <Empty />;
  const max = Math.max(1, ...h.cells.flat());
  return <div className="overflow-x-auto" data-dc-viz="heat"><table className="w-full border-separate border-spacing-1 text-sm">
    <thead><tr><th />{h.cols.map((c) => <th key={c} className="px-1 pb-1 text-center text-xs font-normal text-muted-foreground"><N v={c} /></th>)}</tr></thead>
    <tbody>{h.rows.map((r, i) => <tr key={r}><th scope="row" className="max-w-40 truncate pe-2 text-start text-xs font-normal"><Lbl v={r} /></th>
      {(h.cells[i] ?? []).map((v, j) => { const d = w.heatCell?.(r, h.cols[j] ?? ""); return <td key={j} className="p-0">
        <Go to={d?.to} search={d?.search} className="block rounded py-2.5 text-center text-xs font-medium focus:outline-none focus:ring-2 focus:ring-ring" label={`${r} · ${h.cols[j]}: ${v}`}>
          <span className="block rounded py-0.5" style={{ background: `color-mix(in oklab, var(--dc-s0) ${Math.round((v / max) * 70)}%, var(--muted))`, color: v / max > 0.55 ? "var(--dc-on-deep)" : undefined }}><N v={v} /></span>
        </Go></td>; })}</tr>)}</tbody>
  </table></div>;
}

/* ---------- Bullets: attainment against a target ---------- */
const pctOf = (s?: string) => { const m = /^(-?\d+(?:\.\d+)?)%$/.exec(String(s ?? "").trim()); return m ? Number(m[1]) : null; };
export function Bullets({ w }: { w: Widget }) {
  if (w.kind === "progress") {
    const p = w.pct ?? 0;
    return <Go to={w.to} search={w.search} className="block" data-dc-viz="bullet">
      <div className="flex items-baseline gap-2"><span className="text-3xl font-semibold"><N v={`${p}%`} /></span>{w.hint && <span className="text-xs text-muted-foreground"><N v={w.hint} /></span>}</div>
      <div className="relative mt-3 h-3 rounded bg-muted"><div className="h-3 rounded" style={{ width: `${Math.min(100, Math.max(0, p))}%`, background: p >= 100 ? "var(--dc-tone-positive)" : "var(--dc-s0)" }} /><span className="absolute inset-y-[-3px] end-0 w-0.5 rounded bg-foreground/60" aria-hidden /></div>
      <div className="mt-2 text-xs text-muted-foreground"><N v={w.value} /></div>
    </Go>;
  }
  const rows = w.rows ?? []; if (!rows.length) return <Empty>Nothing needs action.</Empty>;
  return <ol className="space-y-2.5" data-dc-viz="bullets">{rows.slice(0, 10).map((r) => { const p = pctOf(r.value); return <li key={r.label + (r.sub ?? "")}>
    <Go to={r.to} search={r.search} className="group block">
      <div className="mb-1 flex items-baseline gap-2 text-sm"><span className="min-w-0 flex-1 truncate group-hover:text-primary" data-no-i18n>{r.label}</span><span className="font-medium"><N v={r.value ?? "—"} /></span></div>
      <div className="relative h-2 rounded bg-muted">{p !== null && <div className="h-2 rounded" style={{ width: `${Math.min(100, Math.max(0, p))}%`, background: p >= 100 ? "var(--dc-tone-positive)" : p < 50 ? "var(--dc-tone-warning)" : "var(--dc-s0)" }} />}<span className="absolute inset-y-[-2px] end-0 w-0.5 bg-foreground/50" aria-hidden /></div>
    </Go></li>; })}</ol>;
}

/* ---------- Ranked worklist rows (list widgets) ---------- */
export function Ranked({ w, limit = 6 }: { w: Widget; limit?: number }) {
  const rows: Row[] = w.rows ?? [];
  if (!rows.length) return <Empty>Nothing needs action.</Empty>;
  return <div data-dc-viz="ranked"><ol className="divide-y divide-border">{rows.slice(0, limit).map((r, i) => <li key={r.to + r.label} className="flex items-center gap-3 py-2 text-sm">
    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-medium"><N v={i + 1} /></span>
    <Go to={r.to} search={r.search} className="min-w-0 flex-1 hover:text-primary"><span className="block truncate font-medium" data-no-i18n>{r.label}</span>{r.sub && <span className="block truncate text-[11px] text-muted-foreground" data-no-i18n>{r.sub}</span>}</Go>
    {r.value && <span className="shrink-0 text-xs font-medium"><N v={r.value} /></span>}
    <Go to={r.to} search={r.search} label={r.label}><ArrowUpRight className="h-4 w-4 text-muted-foreground" /></Go>
  </li>)}</ol>
    <div className="mt-2 flex items-center gap-3 text-xs">{w.to ? <Go to={w.to} search={w.search} className="inline-flex items-center gap-1 text-primary hover:underline"><span>View all</span> (<N v={rows.length} />)<ArrowUpRight className="h-3 w-3" /></Go> : rows.length > limit ? <span className="text-muted-foreground"><N v={`+${rows.length - limit}`} /></span> : null}</div>
  </div>;
}

/* ---------- Exceptions: one ranked row per exception widget ---------- */
const TONE_OF: Record<string, "critical" | "warning"> = { "W-078": "warning", "W-080": "critical", "W-015": "critical", "W-075": "warning", "W-029": "critical", "W-076": "warning", "C-MT-02": "warning" };
const countOf = (w: Widget) => (w.kind === "list" ? (w.rows?.length ?? 0) : w.kind === "kpi" ? w.value ?? "0" : w.kind === "progress" ? `${w.pct ?? 0}%` : "—");
export function Exceptions({ widgets }: { widgets: Widget[] }) {
  if (!widgets.length) return <Empty />;
  return <ul className="divide-y divide-border" data-dc-viz="exceptions">{widgets.map((w) => {
    const blocked = w.kind === "blocked", n = countOf(w), zero = n === 0 || n === "0";
    // A list widget without its own register (e.g. W-075) opens its board, where every listed record links to its form.
    const dest: Dest = w.to ? { to: w.to, search: w.search } : w.kind === "list" && w.rows?.length ? { to: "/digit-crm/dashboards", search: { board: boardOfWidget(w.id) ?? "ops" } } : {};
    const body = <>
      <span className="dc-tone-dot" data-tone={blocked || zero ? "neutral" : TONE_OF[w.id] ?? "warning"} aria-hidden />
      <span className="min-w-0 flex-1"><span className="block truncate text-sm">{w.title}</span>{blocked ? <span className="block text-[11px] text-muted-foreground" data-dc-state="blocked">{w.reason}</span> : <span className="block truncate text-[11px] text-muted-foreground">{w.calc}</span>}</span>
      <span className="shrink-0 text-lg font-semibold"><N v={blocked ? "—" : n} /></span>
      {!blocked && dest.to && <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
    </>;
    return <li key={w.id} data-dc-exception={w.id}>{!blocked && dest.to ? <Go to={dest.to} search={dest.search} className="flex items-center gap-3 rounded px-1 py-2.5 hover:bg-muted">{body}</Go> : <div className="flex items-center gap-3 px-1 py-2.5">{body}</div>}</li>;
  })}</ul>;
}

/* ---------- Timeline: recent customer activities ---------- */
export function Timeline({ rows, lang }: { rows: Activity[]; lang: string }) {
  if (!rows.length) return <Empty>No activities.</Empty>;
  const when = (s: string) => { const t = Date.parse(s.replace(" ", "T")); return Number.isFinite(t) ? new Date(t).toLocaleString(lang === "ar" ? "ar-SA-u-ca-gregory-nu-latn" : "en-US", { dateStyle: "medium", timeStyle: "short" }) : "—"; };
  const slug = (k: Activity["kind"]) => (k === "Task" ? "crm_task" : k === "Note" ? "fcrm_note" : "crm_call_log");
  return <ol className="relative ms-2 border-s border-border ps-5" data-dc-viz="timeline">{rows.map((a) => <li key={a.kind + a.name} className="relative pb-4 last:pb-0">
    <span className="dc-tone-dot absolute -start-[1.65rem] top-1.5" data-tone={a.kind === "Task" ? "positive" : a.kind === "Call" ? "warning" : "neutral"} aria-hidden />
    <div className="flex flex-wrap items-baseline gap-x-2 text-sm"><span className="rounded bg-muted px-1.5 text-[11px]">{a.kind}</span>
      <Link to="/app/$app/$doctype/$name" params={{ app: "crm", doctype: slug(a.kind), name: a.name }} className="font-medium text-primary hover:underline" data-no-i18n>{a.title}</Link>
      <span className="text-xs text-muted-foreground" data-no-i18n>{when(a.when)}</span></div>
    <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-muted-foreground"><RefLink dt={a.refDt} name={a.refName} />{a.owner && <span data-no-i18n>{userLabel(a.owner)}</span>}{a.status && <span>{a.status}</span>}</div>
  </li>)}</ol>;
}

/** Truthful unavailable state: the reason the source cannot answer, never a zero. */
export function Unavailable({ reason, hint }: { reason?: string | undefined; hint?: string | undefined }) {
  return <div className="flex gap-2 rounded-md border border-dashed border-border bg-muted/30 p-3 text-sm text-muted-foreground" data-dc-state="blocked">
    <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /><div><p>{reason}</p>{hint && <p className="mt-1 text-xs"><N v={hint} /></p>}</div>
  </div>;
}

/* ---------- Chart panel: one widget drawn with the visualization its module composition chose ---------- */
export function PanelHead({ title, id, unit, w }: { title: string; id: string; unit?: string | undefined; w?: Widget }) {
  return <div className="mb-3 flex flex-wrap items-start gap-x-2 gap-y-1"><h3 className="min-w-0 flex-1 text-sm font-semibold">{title}</h3>
    {unit && <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground" data-dc-unit><span>Unit</span>: <span>{unit}</span></span>}
    {w && <ScopeChip w={w} />}<DevOnly><span className="text-[10px] text-muted-foreground" data-dc-code><N v={id} /></span></DevOnly></div>;
}
export function ChartPanel({ w, p, lang, className = "" }: { w: Widget; p: { viz: PanelSpec["viz"]; unit?: string | undefined; title?: string | undefined }; lang: string; className?: string }) {
  return <section className={`dc-panel ${className}`} data-widget={w.id} data-viz={p.viz} data-kind={w.kind} data-chart={drawnViz(w, p.viz)}>
    <PanelHead title={p.title ?? w.title} id={w.id} unit={w.kind === "blocked" ? undefined : p.unit} w={w} />
    <VizBody w={w} viz={p.viz} unit={p.unit} />
    <details className="mt-3 border-t border-border pt-2 text-[11px] text-muted-foreground"><summary className="cursor-pointer">{lang === "ar" ? "المصدر والحساب" : "Source and calculation"}</summary><p className="mt-1">{w.calc}</p>{plainSource(w.source, tLabel, lang === "ar") && <p className="mt-1" data-no-i18n data-dc-source-plain>{plainSource(w.source, tLabel, lang === "ar")}</p>}<DevOnly><p className="mt-1" data-no-i18n dir="ltr">{w.source}</p></DevOnly></details>
  </section>;
}
/** The visual VizBody actually draws for a widget + requested viz (shared R9 row-kind marker). */
function drawnViz(w: Widget, viz: PanelSpec["viz"]): string {
  if (w.kind === "blocked") return "unavailable";
  if (w.kind === "bars" && (viz === "donut" || viz === "funnel" || viz === "area" || viz === "columns" || viz === "bars")) return viz;
  if (w.kind === "heat") return viz === "stacked" ? "stacked" : "heat";
  if (viz === "bullets" && (w.kind === "progress" || w.kind === "list")) return "bullets";
  if (viz === "ranked" && w.kind === "list") return "ranked";
  return w.kind;
}
function VizBody({ w, viz, unit }: { w: Widget; viz: PanelSpec["viz"]; unit?: string | undefined }) {
  if (w.kind === "blocked") return <Unavailable reason={w.reason} />;
  const bars = w.bars ?? [];
  if (w.kind === "bars") {
    if (viz === "donut") return <Donut bars={bars} unit={unit} />;
    if (viz === "funnel") return <Funnel bars={bars} />;
    if (viz === "area") return <AreaTrend bars={bars} unit={unit ?? w.title} />;
    if (viz === "columns") return <Columns bars={bars} />;
    if (viz === "bars") return <HBars bars={bars} />;
  }
  if (w.kind === "heat") return viz === "stacked" ? <Stacked w={w} /> : <Heat w={w} />;
  if (viz === "bullets" && (w.kind === "progress" || w.kind === "list")) return <Bullets w={w} />;
  if (viz === "ranked" && w.kind === "list") return <Ranked w={w} />;
  return <WidgetBody w={w} />;
}
