/**
 * FSM workspace insight kit (owner enterprise UI goal 2026-10-21, Lock 2): every operational workspace Overview opens with
 * source-backed chart panels, then KPI cards, queues, connected documents, recent changes and a transparency note.
 * Each Insight states its source DocTypes, grain / joins, formula, the filters in force, the permission scope, its drill
 * target and how missing data is treated, so nothing on screen is a black box. Charts only draw the values passed in —
 * they are computed by the workspace from permitted records (domain/data.ts → scope boundary) or from the RP report rows,
 * and every bar, slice, column and cell opens exactly the records it counts (app page, RP report with the same column
 * filter, or the filtered native list). A source that cannot supply a number renders an explicit unavailable state.
 */
import { DateInput } from "@/components/form/DateInput";
import { useMemo, type ReactNode } from "react";
import { DashboardDesigner } from "@/components/dashboards/DashboardDesigner";
import type { DashboardDef, WidgetDef, Width } from "@/lib/dashboards/registry";
import { BucketBars, ColumnChart, seriesColor, SignalGrid, type DxTone } from "@/components/digit/Experience";
import { canReadType, scopedList } from "@/lib/scope";
import type { Doc } from "@/lib/adapter";
import type { Filters } from "../domain/data";
import { list } from "../domain/data";
import { s } from "../domain/rules";
import { screenById, type FsmDestination } from "../screens";
import { QUEUES } from "./queues";
import { WorklistTabs } from "./home";
import { Donut } from "./charts";
import { AppLink, DocRef, INPUT, ListRef, Panel, dtLabel, dtTxt, numTxt, opt, useFx, useUrlState } from "./kit";

export type Txt = [string, string];
type Fx = ReturnType<typeof useFx>;
/** Drill target of one mark: app page (relative path + query) or a filtered native list. */
export interface Drill { to?: string | undefined; list?: [string, [string, string, unknown][]?] | undefined }
export interface Pt extends Drill { key: string; label: ReactNode; value: number; tone?: DxTone | undefined }
export interface Meta { src: string[]; grain: Txt; formula: Txt; drill: Txt; missing?: Txt | undefined }

const TONE_BG: Record<DxTone, string> = { good: "var(--dx-good)", warn: "var(--dx-warn)", bad: "var(--dx-bad)", info: "var(--dx-info)", neutral: "var(--dx-neutral)" };
export const toneColor = (t: DxTone | undefined, i: number) => (t ? TONE_BG[t] : seriesColor(i));

/** Wrap a chart mark in its drill link (keyboard-reachable, opens the counted records). */
export function wrapDrill(d: Drill, node: ReactNode, cls = "block rounded hover:bg-muted"): ReactNode {
  if (d.to !== undefined) return <AppLink to={d.to} className={cls}>{node}</AppLink>;
  if (d.list) return <ListRef doctype={d.list[0]} filters={d.list[1]} className={cls}>{node}</ListRef>;
  return node;
}

// ---------------------------------------------------------------- scope (URL-backed: Back restores company / site / period)
const SCOPE = ["company", "site", "from", "to"] as const;
export function scopeOf(f: Record<string, string>): Filters { const o: Filters = {}; for (const k of SCOPE) if (f[k]) o[k] = f[k]; return o; }
export const qs = (o: Record<string, string | undefined>) => { const p = new URLSearchParams(Object.entries(o).filter(([, v]) => !!v) as [string, string][]).toString(); return p ? `?${p}` : ""; };
/** RP report drill carrying the workspace scope plus exact column filters (report page reconciles to the same rows). */
export const rp = (id: string, F: Filters, extra: Record<string, string | undefined> = {}) => `reports/${id}${qs({ ...(F as Record<string, string | undefined>), ...extra })}`;
export const inWin = (d: unknown, F: Filters) => { const x = s(d).slice(0, 10); if (!F.from && !F.to) return true; if (!x) return false; return (!F.from || x >= F.from) && (!F.to || x <= F.to); };
/** Site / company filter for a record carrying those fields (records without the field are not excluded). */
export const inF = (d: Doc | Record<string, unknown>, F: Filters) => (!F.company || !d["company"] || s(d["company"]) === F.company) && (!F.site || d["site"] === undefined || s(d["site"]) === F.site);

export function countBy<T extends Record<string, unknown>>(rows: T[], f: string | ((r: T) => string)): Map<string, number> {
  const m = new Map<string, number>(); for (const r of rows) { const k = (typeof f === "string" ? s(r[f]) : f(r)) || "—"; m.set(k, (m.get(k) ?? 0) + 1); } return m;
}
export function sumBy<T extends Record<string, unknown>>(rows: T[], f: string | ((r: T) => string), v: (r: T) => number): Map<string, number> {
  const m = new Map<string, number>(); for (const r of rows) { const k = (typeof f === "string" ? s(r[f]) : f(r)) || "—"; m.set(k, (m.get(k) ?? 0) + v(r)); } return m;
}
/** Map → chart points, in `order` first (fixed category order), then by value. */
export function pts(m: Map<string, number>, o: { label?: (k: string) => ReactNode; tone?: (k: string) => DxTone | undefined; drill?: (k: string) => Drill; order?: string[]; limit?: number } = {}): Pt[] {
  const keys = [...(o.order ?? []).filter((k) => m.has(k)), ...[...m.keys()].filter((k) => !(o.order ?? []).includes(k)).sort((a, b) => (m.get(b) ?? 0) - (m.get(a) ?? 0))];
  return keys.slice(0, o.limit ?? 50).map((k) => ({ key: k, label: o.label ? o.label(k) : k, value: m.get(k) ?? 0, tone: o.tone?.(k), ...(o.drill ? o.drill(k) : {}) }));
}
export const SEV_TONE = (k: string): DxTone | undefined => (k === "Critical" ? "bad" : k === "Major" ? "warn" : k === "Minor" ? "info" : undefined);

/** Month axis (YYYY-MM): the URL period when set, else the span of the data (latest 12 months). */
export function monthAxis(dates: unknown[], F: Filters, max = 12): string[] {
  const ds = dates.map((d) => s(d).slice(0, 7)).filter((d) => /^\d{4}-\d{2}$/.test(d)).sort();
  const a = F.from ? F.from.slice(0, 7) : ds[0]; const b = F.to ? F.to.slice(0, 7) : ds[ds.length - 1];
  if (!a || !b || a > b) return [];
  const out: string[] = []; let [y, m] = a.split("-").map(Number) as [number, number];
  while (out.length < 120) { const k = `${y}-${String(m).padStart(2, "0")}`; out.push(k); if (k >= b) break; m++; if (m > 12) { m = 1; y++; } }
  return out.slice(-max);
}
export const monthEnd = (m: string) => { const [y, mo] = m.split("-").map(Number) as [number, number]; return new Date(Date.UTC(y, mo, 0)).toISOString().slice(0, 10); };
export const monthLabel = (m: string, ar: boolean) => { const [y, mo] = m.split("-").map(Number) as [number, number]; return new Date(Date.UTC(y, mo - 1, 1)).toLocaleDateString(ar ? "ar-SA-u-ca-gregory-nu-latn" : "en-GB", { month: "short", year: "2-digit", timeZone: "UTC" }); };
export const perMonth = (rows: Record<string, unknown>[], f: string | ((r: Record<string, unknown>) => unknown), months: string[]) => months.map((m) => rows.filter((r) => s(typeof f === "string" ? r[f] : f(r)).slice(0, 7) === m).length);

// ---------------------------------------------------------------- insight card
export function Insight({ id, title, q, meta, children, wide }: { id: string; title: Txt; q: Txt; meta: Meta; children: ReactNode; wide?: boolean }) {
  const { t, ar } = useFx(); const [f] = useUrlState();
  const F = scopeOf(f);
  const applied = Object.entries(F).map(([k, v]) => `${({ company: t("Company", "الشركة"), site: t("Site", "الموقع"), from: t("From", "من"), to: t("To", "إلى") } as Record<string, string>)[k] ?? k}: ${v}`).join(" · ");
  return (
    <section className={`flex min-w-0 flex-col overflow-hidden rounded-lg border border-border bg-card shadow-sm ${wide ? "xl:col-span-2" : ""}`} data-insight={id} aria-labelledby={`ins-${id}`}>
      <header className="border-b border-border px-4 py-2.5">
        <h3 id={`ins-${id}`} className="text-[14px] font-semibold leading-snug text-foreground">{t(...title)}</h3>
        <p className="text-[11.5px] text-muted-foreground">{t(...q)}</p>
      </header>
      <div className="min-w-0 flex-1 p-4">{children}</div>
      <details className="border-t border-border/70 bg-muted/30 px-4 py-2 text-[11.5px] text-muted-foreground" data-insight-source>
        <summary className="cursor-pointer select-none font-medium text-foreground/80">{t("How this is calculated", "طريقة الحساب")}</summary>
        <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1">
          <dt>{t("Source", "المصدر")}</dt><dd data-no-i18n>{meta.src.map((d) => (ar ? `${dtLabel(d, true)} (${d})` : d)).join(" · ")}</dd>
          <dt>{t("Grain & joins", "الحبيبة والربط")}</dt><dd>{t(...meta.grain)}</dd>
          <dt>{t("Formula", "المعادلة")}</dt><dd>{t(...meta.formula)}</dd>
          <dt>{t("Filters", "المرشحات")}</dt><dd data-no-i18n>{applied || t("None — all records you may read", "لا شيء — كل السجلات المسموح لك بقراءتها")}</dd>
          <dt>{t("Permissions", "الصلاحيات")}</dt><dd>{t("Only records your role, company and site permissions allow", "فقط السجلات التي تسمح بها صلاحيات دورك وشركتك وموقعك")}</dd>
          <dt>{t("Drill", "التفصيل")}</dt><dd>{t(...meta.drill)}</dd>
          <dt>{t("Missing data", "البيانات الناقصة")}</dt><dd>{meta.missing ? t(...meta.missing) : t("Records without the value are shown as — and never counted as a pass, on time or compliant", "السجلات بلا قيمة تظهر «—» ولا تُحسب ناجحة أو في الموعد أو ممتثلة")}</dd>
          <dt>{t("Freshness", "الحداثة")}</dt><dd>{t("Computed from current records when the page opened", "محسوب من السجلات الحالية عند فتح الصفحة")}</dd>
        </dl>
      </details>
    </section>
  );
}
export function InsightGrid({ children }: { children: ReactNode }) {
  return <div className="mb-4 grid grid-cols-[minmax(0,1fr)] gap-4 xl:grid-cols-2" data-insight-grid>{children}</div>;
}

// ---------------------------------------------------------------- charts
const Empty = ({ children }: { children: ReactNode }) => <p className="py-6 text-center text-sm text-muted-foreground" data-chart-empty>{children}</p>;
/** Ranked / bucket bars (shared BucketBars), each row opens its records. */
export function Bars({ items, empty, fmt = (v) => numTxt(v), share }: { items: Pt[]; empty: ReactNode; fmt?: (v: number) => string; share?: boolean }) {
  const total = items.reduce((a, b) => a + b.value, 0);
  return <BucketBars items={items.map((p) => ({ key: p.key, label: p.label, value: p.value, tone: p.tone, ...(share && total ? { share: `${Math.round((p.value / total) * 100)}%` } : {}), wrap: (n: ReactNode) => wrapDrill(p, n) }))} format={fmt} empty={empty} />;
}
/** Part-to-whole ring (FSM Donut); legend rows are the drill targets. */
export function Ring({ items, total, empty }: { items: Pt[]; total: ReactNode; empty: ReactNode }) {
  return <Donut items={items.map((p) => ({ key: p.key, label: p.label, value: p.value, tone: p.tone, wrap: (n: ReactNode) => wrapDrill(p, n, "block") }))} total={total} empty={empty} />;
}
/** Period columns (shared ColumnChart); `drill(li, si)` opens the rows of one column. */
export function Cols({ labels, series, drill, labelText, empty, fmt = (v) => numTxt(v) }: { labels: string[]; series: { name: string; label: string; values: number[] }[]; drill?: (li: number, si: number) => Drill | undefined; labelText?: (l: string) => string; empty: ReactNode; fmt?: (v: number) => string }) {
  if (!labels.length || series.every((x) => x.values.every((v) => !v))) return <Empty>{empty}</Empty>;
  return <ColumnChart labels={labels} series={series} format={fmt} labelText={labelText} ariaLabel={series.map((x) => x.label).join(", ")}
    mark={drill ? (li, si, node) => { const d = drill(li, si); return d ? wrapDrill(d, node, "flex h-full items-end") : node; } : undefined} />;
}
/** Horizontal stacked bars: one row per entity, one segment per category (legend shows the category colours). */
export interface StackRow extends Drill { key: string; label: ReactNode; segs: (Drill & { key: string; value: number })[] }
export function Stack({ rows, legend, empty, fmt = (v) => numTxt(v) }: { rows: StackRow[]; legend: { key: string; label: ReactNode; tone?: DxTone | undefined }[]; empty: ReactNode; fmt?: (v: number) => string }) {
  const shown = rows.filter((r) => r.segs.some((x) => x.value > 0));
  if (!shown.length) return <Empty>{empty}</Empty>;
  const max = Math.max(...shown.map((r) => r.segs.reduce((a, b) => a + b.value, 0))) || 1;
  const color = (k: string) => { const i = legend.findIndex((l) => l.key === k); return toneColor(legend[i]?.tone, i < 0 ? 0 : i); };
  return (
    <div data-chart="stack">
      <ul className="mb-3 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">{legend.map((l) => <li key={l.key} className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm" style={{ background: color(l.key) }} aria-hidden />{l.label}</li>)}</ul>
      <ul className="space-y-2" role="list">{shown.map((r) => { const tot = r.segs.reduce((a, b) => a + b.value, 0); return (
        <li key={r.key} className="grid grid-cols-[minmax(0,9rem)_minmax(3rem,1fr)_auto] items-center gap-2.5 text-[13px]">
          <span className="truncate">{wrapDrill(r, r.label, "hover:underline")}</span>
          <span className="flex h-3 overflow-hidden rounded-full bg-muted" style={{ width: `${Math.max(4, (tot / max) * 100)}%` }}>
            {r.segs.filter((x) => x.value > 0).map((x) => <span key={x.key} className="h-full" style={{ width: `${(x.value / tot) * 100}%`, background: color(x.key) }} title={`${s(x.key)}: ${fmt(x.value)}`}>{wrapDrill(x, <span className="block h-3 w-full" aria-label={`${s(x.key)}: ${fmt(x.value)}`} />, "block h-full")}</span>)}
          </span>
          <span className="tabular-nums text-end" dir="ltr" data-no-i18n>{fmt(tot)}</span>
        </li>
      ); })}</ul>
    </div>
  );
}
/** Pipeline funnel: each step's share of the first step; each step opens its records. */
export function Funnel({ steps, empty }: { steps: Pt[]; empty: ReactNode }) {
  const first = steps[0]?.value ?? 0;
  if (!first) return <Empty>{empty}</Empty>;
  return (
    <ol className="space-y-1.5" data-chart="funnel">{steps.map((p, i) => (
      <li key={p.key}>{wrapDrill(p, <div className="grid grid-cols-[minmax(0,10rem)_minmax(3rem,1fr)_auto] items-center gap-2.5 rounded px-1 py-0.5 text-[13px]">
        <span className="truncate">{p.label}</span>
        <span className="relative flex h-5 justify-center" aria-hidden><span className="h-full rounded" style={{ width: `${Math.max(3, (p.value / first) * 100)}%`, background: toneColor(p.tone, i) }} /></span>
        <span className="tabular-nums text-end" dir="ltr" data-no-i18n>{numTxt(p.value)} <span className="text-[11px] text-muted-foreground">{Math.round((p.value / first) * 100)}%</span></span>
      </div>)}</li>
    ))}</ol>
  );
}
/** Heat map table: rows × columns, cell intensity = count; each non-zero cell opens its records. */
export function Heat({ rows, cols, cell, empty }: { rows: { key: string; label: ReactNode }[]; cols: { key: string; label: ReactNode }[]; cell: (r: string, c: string) => Drill & { value: number }; empty: ReactNode }) {
  const grid = rows.map((r) => cols.map((c) => cell(r.key, c.key)));
  const max = Math.max(0, ...grid.flat().map((x) => x.value));
  if (!max) return <Empty>{empty}</Empty>;
  return (
    <div className="overflow-x-auto" data-chart="heat"><table className="w-full text-[12.5px]">
      <thead><tr><th />{cols.map((c) => <th key={c.key} className="px-1.5 pb-1 text-center font-medium text-muted-foreground">{c.label}</th>)}</tr></thead>
      <tbody>{rows.map((r, ri) => <tr key={r.key}><th className="whitespace-nowrap pe-2 text-start font-normal">{r.label}</th>{cols.map((c, ci) => { const x = grid[ri]![ci]!;
        const node = <span className="block rounded px-1.5 py-1 text-center tabular-nums" style={{ background: x.value ? `color-mix(in oklab, var(--chart-1) ${Math.round(15 + (x.value / max) * 70)}%, transparent)` : "var(--muted)" }} data-no-i18n>{x.value || "·"}</span>;
        return <td key={c.key} className="p-0.5">{x.value ? wrapDrill(x, node, "block") : node}</td>; })}</tr>)}</tbody>
    </table></div>
  );
}
/** Explicit unavailable-source state (never a demo number). */
export function Unavailable({ need, backlog }: { need: Txt; backlog: Txt }) {
  const { t } = useFx();
  return <div className="rounded-md border border-dx-warn/40 bg-dx-warn-soft px-3 py-3 text-sm text-dx-warn" role="note" data-unavailable-source>
    <strong className="block">{t("Source unavailable", "المصدر غير متاح")}</strong>{t(...need)}<span className="mt-1 block text-[11.5px] opacity-80">{t("Backlog", "المتطلب")}: {t(...backlog)}</span>
  </div>;
}

// ---------------------------------------------------------------- scope bar
export function ScopeBar({ fields = ["company", "site", "from", "to"] }: { fields?: ("company" | "site" | "from" | "to")[] }) {
  const { t } = useFx(); const [f, set] = useUrlState();
  const sites = list("FSM Service Site");
  const companies = [...new Set(sites.map((x) => s(x["company"])).filter(Boolean))];
  const lbl = "grid gap-1 text-[11px] font-medium text-muted-foreground";
  const active = fields.some((k) => f[k]);
  return (
    <div className="mb-4 grid grid-cols-2 items-end gap-3 rounded-[10px] border border-border bg-card px-3 py-2.5 sm:flex sm:flex-wrap" data-scope-bar>
      {fields.includes("company") && <label className={`${lbl} min-w-0`}>{t("Company", "الشركة")}<select className={`${INPUT} w-full min-w-0 sm:w-auto sm:min-w-[10rem]`} value={f["company"] ?? ""} onChange={(e) => set({ company: e.target.value || undefined })} data-scope="company"><option value="">{t("All companies", "كل الشركات")}</option>{companies.map((c) => <option key={c} value={c} data-no-i18n>{c}</option>)}</select></label>}
      {fields.includes("site") && <label className={`${lbl} min-w-0`}>{t("Site", "الموقع")}<select className={`${INPUT} w-full min-w-0 sm:w-auto sm:min-w-[11rem]`} value={f["site"] ?? ""} onChange={(e) => set({ site: e.target.value || undefined })} data-scope="site"><option value="">{t("All sites", "كل المواقع")}</option>{sites.map((x) => <option key={x.name} value={x.name} data-no-i18n>{s(x["site_name"]) || x.name}</option>)}</select></label>}
      {fields.includes("from") && <label className={`${lbl} min-w-0`}>{t("From", "من")}<DateInput className={`${INPUT} w-full min-w-0 sm:w-auto`} value={f["from"] ?? ""} onChange={(e) => set({ from: e.target.value || undefined })} data-scope="from" /></label>}
      {fields.includes("to") && <label className={`${lbl} min-w-0`}>{t("To", "إلى")}<DateInput className={`${INPUT} w-full min-w-0 sm:w-auto`} value={f["to"] ?? ""} onChange={(e) => set({ to: e.target.value || undefined })} data-scope="to" /></label>}
      {active && <button type="button" className="min-h-9 rounded-md px-2 text-sm text-primary hover:underline" onClick={() => set(Object.fromEntries(fields.map((k) => [k, undefined])))} data-scope-clear>{t("Clear filters", "مسح المرشحات")}</button>}
    </div>
  );
}

// ---------------------------------------------------------------- shared overview frame
export interface OverviewSpec { charts: ReactNode; kpis?: ReactNode; extra?: ReactNode; scope?: ("company" | "site" | "from" | "to")[] | false; queues?: string[] | false; next?: { to: string; label: Txt }[] }
const docTypes = (d: FsmDestination) => [...new Set(d.docs.map((id) => screenById(id)?.to ?? "").filter((x) => x.startsWith("doctype:")).map((x) => x.slice(8)))];

/** Order (Lock 2): scope bar → insight charts → KPI cards → page extras → queues → connected documents & recent changes → next steps. */
export function OverviewFrame({ dest, spec }: { dest: FsmDestination; spec: OverviewSpec }) {
  const fx = useFx(); const { t } = fx;
  const queues = (spec.queues === false ? [] : spec.queues ?? dest.queues).map((k) => QUEUES.find((x) => x.key === k)).filter((x): x is NonNullable<typeof x> => !!x).slice(0, 2);
  // ONE STANDARD R9: the overview blocks are hosted by the shared Dashboard Designer (block menu, customise, saved per
  // user); each block keeps the source-backed panel of the ov spec, in the Lock 2 order as the default layout
  const def = useMemo(() => overviewDashboard(dest), [dest.key]); // eslint-disable-line react-hooks/exhaustive-deps
  const ctx: OvCtx = { dest, spec, fx, queues };
  return (
    <div data-overview={dest.key}>
      {spec.scope !== false && <ScopeBar {...(spec.scope ? { fields: spec.scope } : {})} />}
      <DashboardDesigner def={def} ctx={ctx} />
      <p className="sr-only">{t("End of overview", "نهاية النظرة العامة")}</p>
    </div>
  );
}

interface OvCtx { dest: FsmDestination; spec: OverviewSpec; fx: Fx; queues: (typeof QUEUES)[number][] }
function overviewDashboard(dest: FsmDestination): DashboardDef<OvCtx> {
  const sources = docTypes(dest);
  const block = (id: string, title: Txt, meaning: Txt, render: (c: OvCtx) => ReactNode, absent?: (c: OvCtx) => boolean, w: Width = 12): WidgetDef<OvCtx> => ({
    id, version: 1, title, meaning, sources, shape: "panel", defaultView: "panel", size: { w }, render, ...(absent ? { absent } : {}),
  });
  return {
    app: "digit_fsm", id: `ov:${dest.key}`, title: [dest.label, dest.label_ar],
    widgets: [
      block("charts", ["Insights", "التحليلات"], ["Source-backed charts of this workspace; every mark opens the records it counts.", "تحليلات هذه المساحة من مصادرها؛ كل علامة تفتح السجلات التي تعدّها."], (c) => <InsightGrid>{c.spec.charts}</InsightGrid>),
      block("kpis", ["Indicators", "المؤشرات"], ["Counts of this workspace's permitted records.", "أعداد السجلات المسموح بها في هذه المساحة."], (c) => <SignalGrid>{c.spec.kpis}</SignalGrid>, (c) => !c.spec.kpis),
      block("extra", ["Workspace detail", "تفاصيل المساحة"], ["The workspace's own panels.", "اللوحات الخاصة بهذه المساحة."], (c) => <>{c.spec.extra}</>, (c) => !c.spec.extra),
      block("queues", ["Work queues", "قوائم العمل"], ["Open work waiting in this workspace.", "العمل المفتوح المنتظر في هذه المساحة."], (c) => <div data-overview-queues><WorklistTabs defs={c.queues} fx={c.fx} /></div>, (c) => !c.queues.length, sources.length ? 6 : 12),
      block("connected", ["Connected documents", "المستندات المرتبطة"], ["Permitted record counts and the latest changes to them.", "أعداد السجلات المسموح بها وأحدث التغييرات عليها."], (c) => <Connected dest={c.dest} fx={c.fx} />, () => !sources.length, 6),
      block("next", ["Next steps", "الخطوات التالية"], ["Pages and reports to continue from here.", "الصفحات والتقارير للمتابعة من هنا."], (c) => <NextSteps dest={c.dest} spec={c.spec} fx={c.fx} />, (c) => !(c.spec.next?.length || c.dest.reports.length)),
    ],
  };
}

/** Connected documents (permitted counts → filtered lists) and the latest changes to them (Version audit records). */
function Connected({ dest, fx }: { dest: FsmDestination; fx: Fx }) {
  const { t, ar } = fx;
  const dts = docTypes(dest);
  const recent = useMemo(() => {
    if (!dts.length || !canReadType("Version")) return [] as Doc[];
    const set = new Set(dts);
    return scopedList("Version").filter((v) => set.has(s(v["ref_doctype"]))).sort((a, b) => s(b["creation"]).localeCompare(s(a["creation"]))).slice(0, 8);
  }, [dts.join("|")]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!dts.length) return null;
  const change = (v: Doc) => { try { const d = JSON.parse(s(v["data"]) || "{}") as { created?: boolean; changed?: unknown[] }; return d.created ? t("Created", "إنشاء") : `${t("Edited", "تعديل")} · ${(d.changed ?? []).length}`; } catch { return "—"; } };
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-x-4" data-connected>
      <Panel title={t("Connected documents", "المستندات المرتبطة")} subtitle={t("Records you may read; each opens its list", "السجلات المسموح بقراءتها؛ كل منها يفتح قائمته")}>
        <ul className="grid gap-1.5 text-sm">{dts.map((dt) => { const ok = canReadType(dt); return (
          <li key={dt} className="flex items-center justify-between gap-3 rounded px-1 py-1 hover:bg-muted" data-connected-doc={dt}>
            {ok ? <ListRef doctype={dt} className="min-w-0 truncate text-primary hover:underline"><span data-no-i18n>{dtLabel(dt, ar)}</span></ListRef> : <span className="min-w-0 truncate" data-no-i18n>{dtLabel(dt, ar)}</span>}
            <span className="tabular-nums text-muted-foreground" data-no-i18n>{ok ? numTxt(list(dt).length) : t("Restricted", "مقيّد")}</span>
          </li>); })}</ul>
      </Panel>
      <Panel title={t("Recent changes", "أحدث التغييرات")} subtitle={t("From the change history (Version) of these documents", "من سجل التغييرات لهذه المستندات")}>
        {recent.length ? <ul className="grid gap-1.5 text-sm" data-recent-changes>{recent.map((v) => <li key={v.name} className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
          <span className="min-w-0 truncate"><DocRef doctype={s(v["ref_doctype"])} name={v["docname"]} /> <span className="text-xs text-muted-foreground">· {change(v)}</span></span>
          <span className="text-xs tabular-nums text-muted-foreground" data-no-i18n>{dtTxt(s(v["creation"]).replace("T", " "))}</span></li>)}</ul>
          : <p className="text-sm text-muted-foreground">{canReadType("Version") ? t("No recorded change to these documents yet.", "لا تغييرات مسجلة على هذه المستندات بعد.") : t("You may not read the change history.", "لا يحق لك قراءة سجل التغييرات.")}</p>}
      </Panel>
    </div>
  );
}

function NextSteps({ dest, spec, fx }: { dest: FsmDestination; spec: OverviewSpec; fx: Fx }) {
  const { t } = fx;
  const items = [...(spec.next ?? []), ...dest.reports.slice(0, 4).map((id) => ({ to: `reports/${id}`, label: [`Open ${id}`, `فتح ${id}`] as Txt }))];
  if (!items.length) return null;
  return (
    <nav className="mb-2 flex flex-wrap items-center gap-2 rounded-[10px] border border-border bg-card px-4 py-2.5 text-sm" aria-label={t("Next steps", "الخطوات التالية")} data-next-steps>
      <span className="text-xs font-medium text-muted-foreground">{t("Next steps", "الخطوات التالية")}</span>
      {items.map((x) => <AppLink key={x.to} to={x.to} className="rounded-md border border-border px-2.5 py-1 text-[13px] hover:bg-muted"><span data-no-i18n={/^Open RP/.test(x.label[0]) || undefined}>{t(...x.label)}</span></AppLink>)}
    </nav>
  );
}

/** Label helpers shared by the overview specs. */
export const optL = (ar: boolean) => (k: string) => <span>{opt(k, ar)}</span>;
export const titleL = (fn: (k: string) => string) => (k: string) => <span data-no-i18n>{fn(k)}</span>;
