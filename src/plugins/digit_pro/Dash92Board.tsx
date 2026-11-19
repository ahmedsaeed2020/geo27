/**
 * Renderers for the source dashboard contracts evaluated in dash92.ts:
 *  - <DeptContractPanel>: digit_pro.dashboards.get_department_dashboard on each department home (question, metric cards
 *    with their owner definition, insight charts, the department's report buttons).
 *  - <Dash92Board>: one V9.2 board (cfo-01..06, acc-*) as a 12-column composition of source blocks with span and provenance.
 * Every figure links to the filtered list, document or report it was computed from (DrillLink); denied / not configured
 * states are shown as such, never as 0. Presentation only — no record is written here.
 */
import { useState, type ReactNode } from "react";
import { DateInput } from "@/components/form/DateInput";
import { Info } from "lucide-react";
import { fmtCurrency } from "@/lib/format";
import { translateTo, useLang } from "@/i18n";
import { amountFigure, ChartCard, money as kmoney, recordLabel, SegmentBar, StackedAging, useFigure, type KpiItem, type StripItem, type Tone, type Wrap, Signed } from "@/components/enterprise/kit";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { WidgetView, type LinkFor } from "@/components/dashboards/views";
import type { WidgetData } from "@/lib/dashboards/registry";
import type { ViewKind } from "@/lib/dashboards/views";
import { DrillLink } from "./CommandUi";
import type { Bi, Drill } from "./command";
import { BOARD_VIEWS, type BoardView } from "./execPages";
import { boardCtx, DEPT_CONTRACTS, evalBoard, type Bar, type BlockResult, type BoardResult, type DeptKey, type MetricDef, type MetricValue } from "./dash92";

const pick = (ar: boolean, b: Bi) => (ar ? b[1] : b[0]);
const kitWrap: Wrap = (d, children, attrs) => <DrillLink drill={d as Drill} {...(attrs ?? {})}>{children}</DrillLink>;
const link: LinkFor = (drill, children, attrs) => <DrillLink drill={drill as Drill} {...(attrs as Record<`data-${string}`, string>)} className="hover:underline">{children}</DrillLink>;
const monthLabel = (m: string, ar: boolean) => { const d = new Date(`${m}-01T00:00:00Z`); return /^\d{4}-\d{2}$/.test(m) && Number.isFinite(d.getTime()) ? d.toLocaleDateString(ar ? "ar-u-ca-gregory-nu-latn" : "en-US", { month: "short", year: "2-digit", timeZone: "UTC" }) : m; };
const STATE: Record<string, Bi> = { DENIED: ["Not permitted for your role", "غير مسموح لدورك"], NOT_CONFIGURED: ["Not set up yet", "غير مُعدّ بعد"], NO_DATA: ["No data in this period", "لا توجد بيانات في هذه الفترة"], UNAVAILABLE: ["Source not available", "المصدر غير متاح"],
  denied: ["Not permitted for your role", "غير مسموح لدورك"], not_configured: ["Not set up yet", "غير مُعدّ بعد"], empty: ["Nothing in this period", "لا شيء في هذه الفترة"], unavailable: ["Source not available", "المصدر غير متاح"] };

function series(bars: Bar[], ar: boolean, status: BlockResult["status"], tone?: (b: Bar, i: number) => "ok" | "warn" | "bad" | "info" | undefined): WidgetData {
  return { kind: "series", status: status === "ok" ? (bars.length ? "ok" : "empty") : status === "denied" ? "denied" : status === "empty" ? "empty" : "unavailable",
    points: bars.map((b, i) => ({ key: b.key, label: /^\d{4}-\d{2}$/.test(b.key) ? monthLabel(b.key, ar) : ar && b.ar ? b.ar : b.data ? recordLabel(b.label) : b.label, value: b.value, count: b.count, drill: b.drill, data: b.data, tone: tone?.(b, i) })) };
}
export const fmtVal = (v: number | null | undefined, unit: string, currency: string) => (v === null || v === undefined ? "—" : unit.includes("currency") ? fmtCurrency(v, currency) : unit.startsWith("percent") ? `${v.toLocaleString("en-US")}%` : v.toLocaleString("en-US"));

/* ------------------------------------------------------------------ department contract ------------------------------------------------------------------ */
function MetricCard({ def, v, ar, currency }: { def: MetricDef; v: MetricValue; ar: boolean; currency: string }) {
  const t = (en: string, a: string | null | undefined) => (ar && a ? a : en);
  const ok = useFigure(v.state === "OK" && def.unit.includes("currency") && v.value !== null && v.value !== undefined ? amountFigure(v.value) : undefined);
  const tone = v.state !== "OK" ? undefined : /OVERDUE|LATE|BLOCKERS|EXCEPTIONS|EXC|SHORTAGE|DUE/.test(def.metric_id) && (v.value ?? 0) > 0 ? "risk" : /DRAFT|PENDING|AWAITING|TO_BILL|UNMATCHED/.test(def.metric_id) && (v.value ?? 0) > 0 ? "attention" : undefined;
  if (!ok) return null;
  return <article className="ek-kpi" data-tone={tone} data-dp-metric={def.metric_id} data-state={v.state}>
    <div className="ek-kpi-head"><span className="ek-kpi-label">{ar ? def.title_ar : def.title_en}</span>
      <MetricInfo def={def} ar={ar} /></div>
    {v.state === "OK"
      ? <DrillLink drill={v.drill} className="ek-kpi-value" data-dp-metric-value={def.metric_id}><bdi data-no-i18n>{v.series || v.buckets || v.groups ? fmtVal(v.value ?? 0, def.unit, currency) : fmtVal(v.value, def.unit, currency)}</bdi></DrillLink>
      : <p className="ek-kpi-state" data-dp-metric-state={v.state}>{pick(ar, STATE[v.state] ?? STATE["UNAVAILABLE"]!)}{v.note ? ` — ${pick(ar, v.note)}` : ""}</p>}
    {v.state === "OK" && v.count !== undefined && def.unit.includes("currency") && <p className="text-xs text-muted-foreground"><bdi data-no-i18n>{v.count}</bdi> {ar ? "مستند" : "documents"}</p>}
    {v.state === "OK" && def.metric_id === "SEL.CONVERSION" && v.detail && <p className="text-xs text-muted-foreground" data-no-i18n>{String(v.detail["numerator"])} / {String(v.detail["denominator"])}</p>}
    {v.state === "OK" && def.metric_id === "INV.STOCK_VALUE" && v.detail && <p className="text-xs text-muted-foreground">{ar ? "الأستاذ" : "GL"}: <bdi data-no-i18n>{typeof v.detail["gl_stock_accounts"] === "number" ? fmtCurrency(v.detail["gl_stock_accounts"], currency) : String(v.detail["gl_stock_accounts"])}</bdi> · {ar ? "لقطة الأرصدة" : "Bin"}: <bdi data-no-i18n>{fmtCurrency(Number(v.detail["bin_snapshot"]), currency)}</bdi></p>}
    <p className="ek-kpi-sub">{meaningOf(def, ar)}</p>
  </article>;
}
/** The owner definition of a metric (formula · source · period · exclusions), opened from the tile's info button. */
export function MetricInfo({ def, ar }: { def: MetricDef; ar: boolean }) {
  const t = (en: string, a: string | null | undefined) => (ar && a ? a : en);
  return <Popover><PopoverTrigger asChild><button type="button" className="text-muted-foreground hover:text-foreground" aria-label={ar ? "تعريف المؤشر" : "Metric definition"} data-dp-metric-info><Info className="h-3.5 w-3.5" /></button></PopoverTrigger>
    <PopoverContent align="start" className="w-80 text-xs" data-dp-metric-def><dl className="space-y-1.5">
      <div><dt className="font-semibold">{ar ? "المعادلة" : "Formula"}</dt><dd className="text-muted-foreground">{t(def.formula, def.formula_ar)}</dd></div>
      <div><dt className="font-semibold">{ar ? "المصدر" : "Source"}</dt><dd className="text-muted-foreground">{t(def.native_source, def.native_source_ar)}</dd></div>
      <div><dt className="font-semibold">{ar ? "الفترة" : "Period"}</dt><dd className="text-muted-foreground">{t(def.period, def.period_ar)}</dd></div>
      <div><dt className="font-semibold">{ar ? "الاستثناءات" : "Exclusions"}</dt><dd className="text-muted-foreground">{t(def.exclusions, def.exclusions_ar)}</dd></div>
    </dl></PopoverContent></Popover>;
}
/** A department contract metric as a kit KPI tile (same value, drill, tone and definition as the metric card). */
/** A metric's business meaning for display: a reference to another canonical metric id shows that metric's title, never its code. */
export function meaningOf(def: MetricDef, ar: boolean): string {
  const text = ar && def.business_meaning_ar ? def.business_meaning_ar : def.business_meaning;
  return text.replace(/\b[A-Z]{2,5}\.[A-Z0-9_]+\b/g, (id) => {
    for (const dep of Object.values(DEPT_CONTRACTS) as { metrics: MetricDef[] }[]) { const m = dep.metrics.find((x) => x.metric_id === id); if (m) return `«${ar ? m.title_ar : m.title_en}»`; }
    return "";
  }).replace(/\s{2,}/g, " ").trim();
}
export function metricKpi(def: MetricDef, v: MetricValue, ar: boolean, currency: string): KpiItem {
  const tone: Tone | undefined = v.state !== "OK" ? undefined : /OVERDUE|LATE|BLOCKERS|EXCEPTIONS|EXC|SHORTAGE|DUE/.test(def.metric_id) && (v.value ?? 0) > 0 ? "risk" : /DRAFT|PENDING|AWAITING|TO_BILL|UNMATCHED/.test(def.metric_id) && (v.value ?? 0) > 0 ? "attention" : undefined;
  const money = def.unit.includes("currency");
  return {
    id: `metric:${def.metric_id}`, figure: v.state === "OK" && money && v.value !== null ? amountFigure(v.value) ?? `metric:${def.metric_id}` : `metric:${def.metric_id}`,
    label: ar ? def.title_ar : def.title_en, value: fmtVal(v.value ?? 0, def.unit, currency), tone, info: <MetricInfo def={def} ar={ar} />,
    ...(v.state !== "OK" ? { state: <span data-dp-metric-state={v.state}>{pick(ar, STATE[v.state] ?? STATE["UNAVAILABLE"]!)}{v.note ? ` — ${pick(ar, v.note)}` : ""}</span> } : {}),
    sub: <>{v.state === "OK" && v.count !== undefined && money && <><bdi data-no-i18n>{v.count}</bdi> {ar ? "مستند" : "documents"} · </>}
      {v.state === "OK" && def.metric_id === "SEL.CONVERSION" && v.detail && <><bdi data-no-i18n>{String(v.detail["numerator"])} / {String(v.detail["denominator"])}</bdi> · </>}
      {v.state === "OK" && def.metric_id === "INV.STOCK_VALUE" && v.detail && <>{ar ? "الأستاذ" : "GL"}: <bdi data-no-i18n>{typeof v.detail["gl_stock_accounts"] === "number" ? fmtCurrency(v.detail["gl_stock_accounts"], currency) : String(v.detail["gl_stock_accounts"])}</bdi> · {ar ? "لقطة الأرصدة" : "Bin"}: <bdi data-no-i18n>{fmtCurrency(Number(v.detail["bin_snapshot"]), currency)}</bdi> · </>}
      {meaningOf(def, ar)}</>,
    wrap: (node) => <DrillLink drill={v.drill} data-dp-metric-value={def.metric_id}>{node}</DrillLink>,
    attrs: { "data-dp-metric": def.metric_id, "data-state": v.state },
  };
}
export function InsightCard({ def, v, ar, currency }: { def: MetricDef; v: MetricValue; ar: boolean; currency: string }) {
  let data: WidgetData; let view: ViewKind = "bar";
  if (v.state !== "OK") data = { kind: "series", status: v.state === "DENIED" ? "denied" : "unavailable", points: [], reason: STATE[v.state] };
  else if (v.series) { data = { kind: "series", status: "ok", points: v.series.labels.map((l, i) => ({ key: l, label: monthLabel(l, ar), value: v.series!.values[i] ?? 0, drill: v.series!.drills?.[i] })) }; view = def.metric_id === "INV.VALUE_TREND" ? "area" : def.metric_id === "FIN.CASH_TREND" ? "line" : "bar"; }
  else if (v.groups) { data = { kind: "series", status: v.groups.length ? "ok" : "empty", points: v.groups.map((g) => ({ key: g.label, label: g.label, value: g.value, drill: g.drill, data: true })) }; view = "donut"; }
  else if (v.buckets) {
    // ageing of customers vs suppliers: the kit's stacked ageing bars (green not due → red 90+), each side opening the source register
    const labels: Bi[] = [["Not due", "غير مستحق"], ["0–30", "0–30"], ["31–60", "31–60"], ["61–90", "61–90"], ["90+", "+90"]];
    return <ChartCard id={def.metric_id} size="md" title={ar ? def.title_ar : def.title_en} sub={meaningOf(def, ar)}
      action={<DrillLink drill={v.drill}>{ar ? "فتح المصدر" : "Open source"}</DrillLink>} attrs={{ "data-dp-insight": def.metric_id, "data-state": v.state }}>
      <StackedAging ar={ar} fmt={kmoney(currency)} buckets={labels.map((l) => pick(ar, l))} wrap={kitWrap}
        rows={Object.entries(v.buckets).map(([k, b]) => ({ key: k, label: k === "Customer" ? (ar ? "العملاء" : "Customers") : ar ? "الموردون" : "Suppliers", values: b.buckets, drill: v.drill }))} />
    </ChartCard>;
  } else data = { kind: "number", status: "ok", value: v.value ?? 0, display: fmtVal(v.value, def.unit, currency), drill: v.drill };
  return <ChartCard id={def.metric_id} size="md" title={ar ? def.title_ar : def.title_en} sub={meaningOf(def, ar)}
    action={<DrillLink drill={v.drill}>{ar ? "فتح المصدر" : "Open source"}</DrillLink>} attrs={{ "data-dp-insight": def.metric_id, "data-state": v.state }}>
    <WidgetView data={data} view={view} ar={ar} link={link} />
  </ChartCard>;
}
/* ------------------------------------------------------------------ dash92 boards ------------------------------------------------------------------ */
const SPAN: Record<number, string> = { 35: "lg:col-span-4", 50: "lg:col-span-6", 65: "lg:col-span-8", 100: "lg:col-span-12" };
function Table({ head, rows }: { head: ReactNode[]; rows: ReactNode[][] }) {
  return <div className="ek-table-wrap" style={{ maxHeight: 300 }}><table className="ek-table min-w-[420px] [overflow-wrap:normal]"><thead><tr>{head.map((h, i) => <th key={i} className={`whitespace-nowrap ${i ? "text-end" : "text-start"}`}>{h}</th>)}</tr></thead>
    <tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className={j ? "whitespace-nowrap text-end tabular-nums" : "whitespace-nowrap"}>{c}</td>)}</tr>)}</tbody></table></div>;
}
/** The tiles of a tile block (kpis · metrics · P&L figures) with the figure identities they show, so a page can fold them into its one indicator row. */
export function tileItems(b: BlockResult, ar: boolean, currency: string): StripItem[] {
  if (b.status === "denied" || b.status === "unavailable") return [];
  if (b.type === "kpis") return b.items.map((k) => ({ key: `kpi:${k.id}`, figures: [k.totals.length === 1 ? amountFigure(k.totals[0]!.amount) : undefined], node: <DrillLink key={k.id} drill={k.drill} className="ek-kpi" data-dp-kpi={k.id} data-tone={k.tone === "risk" && k.count ? "risk" : k.tone === "action" && k.count ? "attention" : undefined}>
      <span className="ek-kpi-label">{pick(ar, k.label)}</span>{k.status === "denied" ? <p className="ek-kpi-state">{pick(ar, STATE["denied"]!)}</p> : <><span className="ek-kpi-value" data-no-i18n>{k.totals.length ? k.totals.map((x) => fmtCurrency(x.amount, x.currency)).join(" · ") : k.count}</span><p className="ek-kpi-sub"><bdi data-no-i18n>{k.count}</bdi> {ar ? "مستند" : "documents"} · {pick(ar, k.hint)}</p></>}</DrillLink> }));
  if (b.type === "metrics") return b.items.map(({ def, v }) => ({ key: `metric:${def.metric_id}`, figures: [v.state === "OK" && def.unit.includes("currency") ? amountFigure(v.value) : undefined], node: <MetricCard key={def.metric_id} def={def} v={v} ar={ar} currency={currency} /> }));
  if (b.type === "performance_kpis") return b.items.map((k) => ({ key: `pl:${k.key}`, figures: [k.unit === "percent" ? undefined : amountFigure(k.value)], node: <div key={k.key} className="ek-kpi" data-dp-pl={k.key} data-tone={k.key === "net_profit" && (k.value ?? 0) < 0 ? "risk" : undefined}><span className="ek-kpi-label">{pick(ar, k.label)}</span>
      {k.state !== "OK" ? <p className="ek-kpi-state">{ar ? "غير منطبق" : "Not applicable"}</p> : <>{k.drill ? <DrillLink drill={k.drill} className="ek-kpi-value" data-no-i18n><Signed text={k.unit === "percent" ? `${k.value ?? "—"}%` : fmtCurrency(k.value ?? 0, currency)} /></DrillLink> : null}
        <p className="ek-kpi-sub">{b.compare.has && k.change !== null ? <><Signed text={`${k.change > 0 ? "+" : ""}${k.unit === "percent" ? k.change : fmtCurrency(k.change, currency)}${k.pct !== null ? ` (${k.pct}%)` : ""}`} /> {ar ? "مقابل الفترة السابقة" : "vs previous period"}</> : ar ? "لا مقارنة" : "No comparison"}</p></>}</div> }));
  return [];
}
const segWrap: Wrap = (drill, children, attrs) => <DrillLink drill={drill as Drill} className="ek-hit" {...(attrs as Record<`data-${string}`, string>)}>{children}</DrillLink>;
/** A bar series as one stacked bar (design contract: composition / ageing → stacked bar), every segment and legend row drills. */
function Segments({ b, ar, currency, aging }: { b: Extract<BlockResult, { bars: Bar[] }>; ar: boolean; currency: string; aging: boolean }) {
  const pts = series(b.bars, ar, b.status); if (pts.kind !== "series") return null;
  return <SegmentBar data={pts.points.map((x) => ({ key: x.key, label: x.label, value: x.value, data: x.data, drill: x.drill }))} fmt={(v) => fmtCurrency(v, currency)} ar={ar} wrap={segWrap} tones={aging ? "aging" : "series"} />;
}
function BlockBody({ b, ar, currency, views = {} }: { b: BlockResult; ar: boolean; currency: string; views?: Partial<Record<string, BoardView>> | undefined }) {
  // signed amounts (net, variance) read «−» in the negative colour, as on the Enterprise KPI card (owner OPEN_ITEMS #2)
  const money = (v: number) => <Signed text={fmtCurrency(v, currency)} />;
  // each Executive page draws its board in its own archetype (execPages BOARD_VIEWS): same figures and drills, different chart
  const v = views[b.type];
  if (v === "stacked" && "bars" in b && b.status === "ok" && b.bars.length) return <>{<Segments b={b} ar={ar} currency={currency} aging={b.type === "aging"} />}{b.type === "aging" && <DrillLink drill={b.report} className="mt-2 inline-block text-xs text-primary hover:underline">{ar ? "التقرير الكامل" : "Full report"}</DrillLink>}</>;
  if (v && v !== "stacked" && "bars" in b && b.status === "ok") return <WidgetView data={series(b.bars, ar, b.status)} view={v} ar={ar} link={link} />;
  if (b.status === "denied" || b.status === "unavailable" || (b.status === "not_configured" && b.type !== "bank")) return <p className="py-4 text-sm text-muted-foreground" data-dp-block-state={b.status}>{pick(ar, STATE[b.status]!)}{b.note ? ` — ${pick(ar, b.note)}` : ""}</p>;
  switch (b.type) {
    case "kpis": return <TileGrid>{tileItems(b, ar, currency).map((x) => x.node)}</TileGrid>;
    case "chart": case "insight": case "week": return <WidgetView data={series(b.bars, ar, b.status)} view={b.type === "insight" ? "area" : "bar"} ar={ar} link={link} />;
    case "top": case "ranking": case "dimension_cost_centers": return <WidgetView data={series(b.bars, ar, b.status, b.type === "dimension_cost_centers" ? (x) => (x.value < 0 ? "bad" : "ok") : undefined)} view={b.type === "ranking" ? "donut" : "bar"} ar={ar} link={link} />;
    case "states": return <WidgetView data={series(b.bars, ar, b.status)} view="status" ar={ar} link={link} />;
    // design contract (composition / ageing → stacked bar): an ageing block reads as one segmented bar, so it never repeats the ranked bars of the concentration row
    case "aging": return <>{b.status === "ok" && b.bars.some((x) => x.value) ? <Segments b={b} ar={ar} currency={currency} aging /> : <WidgetView data={series(b.bars, ar, b.status, (_x, i) => (i === 0 ? "ok" : i >= 3 ? "bad" : "warn"))} view="bar" ar={ar} link={link} />}<DrillLink drill={b.report} className="mt-2 inline-block text-xs text-primary hover:underline">{ar ? "التقرير الأصلي" : "Native report"}</DrillLink></>;
    case "compare": { const keys = b.series[0]?.bars.map((x) => x.key) ?? [];
      return <WidgetView data={{ kind: "matrix", status: keys.length ? "ok" : "empty", rowKeys: keys.map((k) => monthLabel(k, ar)), colKeys: b.series.map((s) => pick(ar, s.label)), values: keys.map((_, i) => b.series.map((s) => s.bars[i]?.value ?? 0)) }} view="stacked-bar" ar={ar} link={link} />; }
    case "queue": return b.queue.rows.length ? <><Table head={[ar ? "المستند" : "Document", ar ? "الطرف" : "Party", ar ? "التاريخ" : "Date", ar ? "المبلغ" : "Amount"]} rows={b.queue.rows.map((r) => [<DrillLink key="n" drill={{ kind: "doc", doctype: r.doctype, name: r.name }} className="text-primary hover:underline" data-no-i18n>{r.name}</DrillLink>, <bdi key="p" data-no-i18n>{r.party ? recordLabel(r.party, ["Customer", "Supplier"]) : "—"}</bdi>, <bdi key="d" data-no-i18n>{r.date}</bdi>, r.amount === null ? "—" : <bdi key="a" data-no-i18n>{fmtCurrency(r.amount, r.currency)}</bdi>])} />
      <DrillLink drill={b.queue.drill} className="mt-2 inline-block text-xs text-primary hover:underline">{ar ? `عرض الكل (${b.queue.count})` : `View all (${b.queue.count})`}</DrillLink></> : <p className="py-4 text-sm text-muted-foreground">{ar ? "لا يوجد ما ينتظر." : "Nothing waiting."}</p>;
    case "parties": return b.rows.length ? <Table head={[ar ? "الطرف" : "Party", ar ? "المفتوح" : "Open", ar ? "المتأخر" : "Overdue", ar ? "الفواتير" : "Invoices"]} rows={b.rows.map((r) => [<DrillLink key="p" drill={r.drill} className="text-primary hover:underline" data-no-i18n><span title={r.party}>{recordLabel(r.party, ["Customer", "Supplier"])}</span></DrillLink>, money(r.outstanding), r.overdue ? <DrillLink key="o" drill={r.overdueDrill} className="text-destructive hover:underline">{money(r.overdue)}</DrillLink> : "—", <bdi key="i" data-no-i18n>{r.invoices}</bdi>])} /> : <p className="py-4 text-sm text-muted-foreground">{pick(ar, STATE["empty"]!)}</p>;
    case "allocations": return b.rows.length ? <Table head={[ar ? "السند" : "Payment", ar ? "الطرف" : "Party", ar ? "المخصص" : "Allocated", ar ? "غير المخصص" : "Unallocated"]} rows={b.rows.map((r) => [<DrillLink key="n" drill={{ kind: "doc", doctype: "Payment Entry", name: r.name }} className="text-primary hover:underline" data-no-i18n>{r.name}</DrillLink>, <bdi key="p" data-no-i18n>{recordLabel(r.party, ["Customer", "Supplier"])}</bdi>, money(r.allocated), r.unallocated ? <span key="u" className="text-warning">{money(r.unallocated)}</span> : money(0)])} /> : <p className="py-4 text-sm text-muted-foreground">{pick(ar, STATE["empty"]!)}</p>;
    case "bank": return <div className="py-2 text-sm" data-dp-bank-state={b.state}>{b.state === "READY" ? <p>{ar ? "حسابات بنكية للشركة:" : "Company bank accounts:"} <b data-no-i18n>{b.accounts}</b></p> : <p className="text-muted-foreground">{b.note ? pick(ar, b.note) : pick(ar, STATE["not_configured"]!)}</p>}{b.drill && <DrillLink drill={b.drill} className="mt-2 inline-block text-xs text-primary hover:underline">{ar ? "التسوية البنكية" : "Bank reconciliation"}</DrillLink>}</div>;
    case "metrics": return <TileGrid>{tileItems(b, ar, currency).map((x) => x.node)}</TileGrid>;
    case "close": return <ul className="grid gap-2 sm:grid-cols-2" data-dp-close-summary={b.summary.open}>{b.blockers.map((x) => <li key={x.id} className="flex items-center justify-between gap-2 rounded border border-border p-2 text-sm" data-dp-close-item={x.id}><span>{pick(ar, x.label)}</span>
      {x.status !== "ok" ? <span className="text-xs text-muted-foreground">{pick(ar, STATE["denied"]!)}</span> : <DrillLink drill={x.target.kind === "list" ? { kind: "list", doctype: x.target.doctype, filters: x.target.filters as never } : x.target.kind === "route" ? { kind: "pro", to: x.target.to, search: x.target.search as Record<string, string> } : { kind: "pro", to: "/pro/period-control", search: {} }} className={x.count ? "font-semibold text-destructive hover:underline" : "text-muted-foreground"}><bdi data-no-i18n>{x.count}</bdi></DrillLink>}</li>)}</ul>;
    case "performance_kpis": return <><TileGrid>{tileItems(b, ar, currency).map((x) => x.node)}</TileGrid>
      <p className="mt-2 text-xs text-muted-foreground">{ar ? "فترة المقارنة" : "Comparison window"} <bdi data-no-i18n>{b.compare.from} → {b.compare.to}</bdi></p></>;
    case "bridge": return <WidgetView data={{ kind: "series", status: b.steps.length ? "ok" : "empty", points: b.steps.map((s) => ({ key: s.key, label: pick(ar, s.label), value: s.value, drill: s.drill, tone: s.kind === "total" ? "info" : s.value < 0 ? "bad" : "ok" })) }} view="waterfall" ar={ar} link={link} />;
    case "period_table": return <Table head={[ar ? "الفترة" : "Period", ar ? "الإيرادات" : "Income", ar ? "المصروفات" : "Expense", ar ? "الصافي" : "Net"]} rows={b.rows.map((r) => [<DrillLink key="k" drill={r.drill} className="text-primary hover:underline">{monthLabel(r.key, ar)}</DrillLink>, money(r.income), money(r.expense), <span key="n" className={r.net < 0 ? "text-destructive" : ""}>{money(r.net)}</span>])} />;
    case "dimension_budgets": return <Table head={[ar ? "الموازنة" : "Budget", ar ? "مقابل" : "Against", ar ? "الموازنة" : "Budget", ar ? "الفعلي" : "Actual"]} rows={b.rows.map((r) => [<DrillLink key="n" drill={r.drill} className="text-primary hover:underline" data-no-i18n>{r.name}</DrillLink>, <bdi key="a" data-no-i18n>{r.against}</bdi>, money(r.budget), <span key="x" className={r.actual > r.budget ? "text-destructive" : ""}>{money(r.actual)}</span>])} />;
    case "dimension_dimensions": return <ul className="space-y-1 text-sm">{b.rows.map((r) => <li key={r.fieldname} className="flex justify-between gap-2"><span data-no-i18n>{r.label}</span><span className="text-xs text-muted-foreground" data-no-i18n>{r.doctype}</span></li>)}</ul>;
    case "statement": return <><Table head={[ar ? "البند" : "Line", ar ? "المبلغ" : "Amount"]} rows={b.lines.map((l) => [pick(ar, l.label), money(l.value)])} /><p className={`mt-2 text-xs ${b.ok ? "text-success" : "text-destructive"}`} data-dp-statement-check={b.ok ? "ok" : "fail"}>{b.ok ? (ar ? "متوازن" : "Balanced") : ar ? "غير متوازن — راجع التقرير" : "Out of balance — review the report"}</p></>;
    case "reports": return <nav className="flex flex-wrap gap-2">{b.items.map((r) => <DrillLink key={r.report} drill={r.drill} className="dp-d92-chip" data-dp-board-report={r.report} data-no-i18n>{ar ? translateTo(r.report, "ar") : r.report}</DrillLink>)}</nav>;
  }
  return null;
}
export function BoardBlocks({ blocks, ar, currency, boardKey, tiles: withTiles = true, skip }: { blocks: BlockResult[]; ar: boolean; currency: string; boardKey: string; tiles?: boolean; skip?: ((b: BlockResult) => boolean) | undefined }) {
  // Tile blocks (metrics / counts / P&L figures) form the page's KPI row without a frame; every other block is a white framed card.
  // tiles=false: the host page already folded them into its one indicator row (tileItems); skip: blocks the page draws itself.
  // a block the page draws itself leaves a hole in the source spans: the remaining cards then pair up in halves (last one full)
  const kept = blocks.filter((b) => !((TILE_BLOCKS.has(b.type) && !withTiles) || skip?.(b)));
  const reflow = !!skip && blocks.some((b) => skip(b));
  const cards = kept.filter((b) => !TILE_BLOCKS.has(b.type));
  const spanOf = (b: BlockResult) => (!reflow || TILE_BLOCKS.has(b.type) ? b.span : cards.length % 2 && cards[cards.length - 1] === b ? 100 : 50);
  return <div className="dp-d92-grid" data-dp-board={boardKey}>{kept.map((b, i) => { const tiles = TILE_BLOCKS.has(b.type);
    return <section key={i} className={`${tiles ? "ek-d92-tiles" : "ek-card ek-d92-block"} col-span-12 ${SPAN[spanOf(b)] ?? "lg:col-span-12"}`} data-dp-block={b.type} data-span={b.span} data-status={b.status}>
      <header className={tiles ? "ek-d92-tiles-h" : "ek-card-head"}><h3 className="ek-h3">{pick(ar, b.title)}</h3>{b.drill && <DrillLink drill={b.drill} className="ek-card-link">{ar ? "فتح" : "Open"}</DrillLink>}</header>
      <div className={tiles ? "" : "ek-card-body"}><BlockBody b={b} ar={ar} currency={currency} views={BOARD_VIEWS[boardKey]} /></div>
      <p className={tiles ? "ek-note" : "ek-note ek-d92-src"} data-dp-block-source>{ar ? "المصدر: " : "Source: "}{pick(ar, b.source)}</p>
    </section>; })}</div>;
}
const TILE_BLOCKS = new Set(["metrics", "kpis", "performance_kpis"]);
/** KPI tiles of a board block: one row of six, every further tile visible in the compact indicator list (owner 2026-11-13: no fold). */
function TileGrid({ children }: { children: ReactNode[] }) {
  const ar = useLang() === "ar";
  // up to eight tiles stay cards (seven or eight wrap into two even rows); only a longer set lists the rest compactly
  const all = children.length <= 8, head = all ? children : children.slice(0, 6), rest = all ? [] : children.slice(6);
  const cols = head.length <= 6 ? head.length : Math.ceil(head.length / 2);
  return <div className="ek-kpis">
    <div className="ek-kpi-grid" data-ek-kpi-wrap={head.length > 6 ? "" : undefined} style={{ ["--ek-kpi-n" as string]: String(Math.max(1, cols)) }}>{head}</div>
    {rest.length > 0 && <div className="ek-kpi-rest"><section className="ek-card ek-kpi-list" data-ek-kpi-list={rest.length}><header className="ek-card-head"><h3 className="ek-h3">{ar ? "مؤشرات إضافية" : "More indicators"}</h3></header>
      <div className="ek-kpi-list-b">{rest.map((x, i) => <div key={i} className="ek-kpi-li">{x}</div>)}</div></section></div>}
  </div>;
}
/** One V9.2 board for a company and period (digit_pro.dash92.get_dashboard). `bare` = the page's context strip already names the board and period. */
export function Dash92Board({ boardKey, company, user, ar, from, to, compare = "prior_period", bare = false, result, tiles = true, skip }: { boardKey: string; company: string; user: string; ar: boolean; from?: string | undefined; to?: string | undefined; compare?: "prior_period" | "prior_year"; bare?: boolean; result?: BoardResult | undefined; tiles?: boolean; skip?: ((b: BlockResult) => boolean) | undefined }) {
  const r = result ?? evalBoard(boardKey, boardCtx(company, from, to, compare, user));
  return <section className="dp-d92" data-dp-board-key={boardKey} aria-label={pick(ar, r.title)}>
    {!bare && <header className="dp-d92-head"><h2 className="dp-d92-title">{pick(ar, r.title)}</h2><span className="text-xs text-muted-foreground"><bdi data-no-i18n>{r.from} → {r.to}</bdi></span></header>}
    <BoardBlocks blocks={r.blocks} ar={ar} currency={r.currency} boardKey={boardKey} tiles={tiles} skip={skip} />
  </section>;
}

/* ------------------------------------------------------------------ Executive sub-dashboards (OWN-08 / OWN-11) ------------------------------------------------------------------ */
export interface BoardSearch { cfo?: string | undefined; from?: string | undefined; to?: string | undefined; cmp?: string | undefined }
const iso = (d: Date) => d.toISOString().slice(0, 10);
/** Period presets of the small fixed context bar; weeks start on Saturday (Saudi working week). */
export function periodPreset(p: "week" | "month" | "quarter" | "ytd", today: string): [string, string] {
  const d = new Date(`${today}T00:00:00Z`);
  if (p === "week") { const back = (d.getUTCDay() + 1) % 7; return [iso(new Date(d.getTime() - back * 86_400_000)), today]; }
  if (p === "month") return [`${today.slice(0, 7)}-01`, today];
  if (p === "quarter") { const q = Math.floor(d.getUTCMonth() / 3) * 3; return [`${today.slice(0, 4)}-${String(q + 1).padStart(2, "0")}-01`, today]; }
  return [`${today.slice(0, 4)}-01-01`, today];
}
export function PeriodBar({ from, to, cmp, today, ar, onChange, company, companies, onCompany }: { from: string; to: string; cmp: string; today: string; ar: boolean; onChange: (p: BoardSearch) => void; company: string; companies: string[]; onCompany: (c: string) => void }) {
  const PRE: { id: "week" | "month" | "quarter" | "ytd"; label: Bi }[] = [{ id: "week", label: ["This week", "هذا الأسبوع"] }, { id: "month", label: ["This month", "هذا الشهر"] }, { id: "quarter", label: ["This quarter", "هذا الربع"] }, { id: "ytd", label: ["Year to date", "منذ بداية السنة"] }];
  return <div className="dp-d92-ctx" role="group" aria-label={ar ? "الشركة والفترة" : "Company and period"} data-dp-period-bar>
    {companies.length > 1 ? <select className="field-input w-auto" value={company} onChange={(e) => onCompany(e.target.value)} aria-label={ar ? "الشركة" : "Company"} data-no-i18n>{companies.map((c) => <option key={c}>{c}</option>)}</select> : <b data-no-i18n>{company}</b>}
    <span className="text-muted-foreground" aria-hidden>·</span>
    {PRE.map((p) => { const [f, t] = periodPreset(p.id, today); const on = f === from && t === to; return <button key={p.id} type="button" className={`rounded px-2 py-1 ${on ? "bg-primary text-primary-foreground" : "hover:bg-accent"}`} aria-pressed={on} onClick={() => onChange({ from: f, to: t })} data-dp-period={p.id}>{pick(ar, p.label)}</button>; })}
    <label className="flex items-center gap-1"><span className="text-muted-foreground">{ar ? "من" : "From"}</span><DateInput className="field-input w-auto" value={from} max={to} onChange={(e) => e.target.value && onChange({ from: e.target.value })} data-dp-period-from /></label>
    <label className="flex items-center gap-1"><span className="text-muted-foreground">{ar ? "إلى" : "To"}</span><DateInput className="field-input w-auto" value={to} min={from} onChange={(e) => e.target.value && onChange({ to: e.target.value })} data-dp-period-to /></label>
    <label className="flex items-center gap-1"><span className="text-muted-foreground">{ar ? "مقارنة" : "Compare"}</span><select className="field-input w-auto" value={cmp} onChange={(e) => onChange({ cmp: e.target.value === "prior_period" ? undefined : e.target.value })} data-dp-period-cmp>
      <option value="prior_period">{ar ? "الفترة السابقة" : "Previous period"}</option><option value="prior_year">{ar ? "نفس الفترة من العام السابق" : "Same period last year"}</option></select></label>
  </div>;
}
