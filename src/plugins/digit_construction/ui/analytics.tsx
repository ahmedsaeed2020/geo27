/**
 * Insights-backed KPI cards, charts and dashboards of DIGIT Construction. Values come only from the metric registry
 * (analytics/metrics.ts → reportRows) and Insights Chart v3 records of workbook DCON-WB evaluated by the Core Insights
 * engine (computeChart). Every card and chart mark opens the drill report with the same rows (report filters + `rf`
 * row filters in the URL), each report row opens its source document, and browser Back restores the dashboard.
 */
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { adapter } from "@/lib/adapter";
import { computeChart, type ChartConfig } from "@/lib/insightsChart";
import { parseJSON, type FilterRule } from "@/lib/insights";
import { fmtNumber } from "@/lib/format";
import type { PluginPageProps } from "@/plugins/pages";
import { APP, get, projectTitle } from "../domain/data";
import { constructionProjects } from "../domain/queues";
import { OPTION_AR, DOCTYPE_AR } from "../schema";
import { CHARTS, DASHBOARDS, WORKBOOK, chartById, dashboardByKey, metricChartId, type DashboardDef } from "../analytics/catalog";
import { dashboardCharts, type ResolvedLayout } from "../domain/layouts";
import { LayoutBar, useLayout } from "./layoutEditor";
import { METRICS, metricById, metricValue, type MetricDef, type RowFilter } from "../analytics/metrics";
import { definitionHash } from "../analytics/metricDefs";
import { ROLE_AR as ROLE_AR_M } from "./layoutEditor";
import { projectRequired, reportByName, reportOfTable, type Scope } from "../analytics/reportRows";
import { MOVE_AR, reportLink, reportTitle } from "./reports";
import { AppLink, BTN, compact, Empty, Field, Filters, inputCls, Note, PageHeader, Section, STATE_AR, useCx, DataTable, type Col } from "./kit";
import { ColumnChart, DxPanel, SignalCard, type DxTone, Chev } from "@/components/digit/Experience";

// ---------------------------------------------------------------- formatting and labels
const STATUS_TXT: Record<string, [string, string]> = {
  SOURCE_BACKED: ["Source-backed", "مدعوم بالمصدر"], REQUIRES_VALIDATION: ["Rule to validate", "قاعدة بانتظار التحقق"], NEEDS_POLICY: ["Needs policy", "يحتاج قرار سياسة"], UNAVAILABLE_SOURCE: ["Unavailable source", "مصدر غير متاح"],
};
export const statusText = (s: MetricDef["status"], ar: boolean) => (ar ? STATUS_TXT[s]![1] : STATUS_TXT[s]![0]);
export function fmtUnit(v: number | null, unit: string, ar: boolean, full = false): string {
  if (v === null || !Number.isFinite(v)) return "—";
  if (unit === "SAR") return full ? fmtNumber(v, 2) : compact(v, ar);
  if (unit === "pct") return `${fmtNumber(v, 1)}%`;
  if (unit === "hours") return `${fmtNumber(v, Number.isInteger(v) ? 0 : 1)} ${ar ? "س" : "h"}`;
  return fmtNumber(v, Number.isInteger(v) ? 0 : 2);
}
const UNIT_HINT: Record<string, [string, string]> = { SAR: ["SAR", "ر.س"], count: ["count", "عدد"], hours: ["hours", "ساعات"], pct: ["percent", "نسبة"], qty: ["quantity", "كمية"] };
const AGING_AR: Record<string, string> = { "Not due": "غير مستحق", "No due date": "بلا تاريخ استحقاق", "1-30": "1-30", "31-60": "31-60", "61-90": "61-90", "90+": "90+" };
const RISK_AR: Record<string, string> = { High: "مرتفع", Medium: "متوسط", Low: "منخفض", "Not rated": "غير مقيم" };
const VALIDITY_AR: Record<string, string> = { Expired: "منتهي", Expiring: "ينتهي قريباً", Valid: "ساري", "No validity date": "بلا تاريخ صلاحية" };
const MEASURE_AR: Record<string, string> = { Commitment: "التزام", Actual: "فعلي" };
/** Display text of a chart label / report filter value (stored values stay English; codes and names are not translated). */
export function valueLabel(col: string, v: unknown, ar: boolean): string {
  const s = String(v ?? ""); if (!s) return ar ? "(فارغ)" : "(blank)";
  if (col === "project") { const p = get("Project", s); return p ? projectTitle(p, !ar) : s; }
  if (!ar) return s;
  if (col === "bucket") return AGING_AR[s] ?? s;
  if (col === "risk") return RISK_AR[s] ?? s;
  if (col === "validity") return VALIDITY_AR[s] ?? s;
  if (col === "measure") return MEASURE_AR[s] ?? s;
  if (col === "move") return MOVE_AR[s] ?? s;
  if (col === "source_doctype") return DOCTYPE_AR[s] ?? s;
  if (["status", "state", "final_state", "category"].includes(col)) return OPTION_AR[s] ?? STATE_AR[s] ?? s;
  return s;
}

// ---------------------------------------------------------------- scope (company / project in the URL)
export function useScope(locked?: Scope): { scope: Scope; set: (p: Partial<Scope>) => void; companies: string[] } {
  const search = useRouterState({ select: (s) => s.location.search as Record<string, unknown> });
  const path = useRouterState({ select: (s) => s.location.pathname });
  const nav = useNavigate();
  const str = (k: string) => (typeof search[k] === "string" ? String(search[k]) : "");
  const companies = [...new Set(constructionProjects().map((p) => String(p["company"] ?? "")))].filter(Boolean);
  const scope: Scope = locked ?? { company: str("company") || undefined, project: str("project") || undefined };
  const set = (p: Partial<Scope>) => void nav({ to: path as never, search: Object.fromEntries(Object.entries({ ...search, ...p }).filter(([, v]) => v !== "" && v !== undefined)) as never, replace: true });
  return { scope, set, companies };
}
export function ScopeBar({ scope, set, companies, lockProject }: ReturnType<typeof useScope> & { lockProject?: boolean }) {
  const { t, ar } = useCx();
  const projects = constructionProjects({ company: scope.company });
  return (
    <Filters>
      <Field label={t("Company", "الشركة")}><select className={inputCls} value={scope.company ?? ""} data-scope="company" onChange={(e) => set({ company: e.target.value || undefined, project: undefined })}><option value="">{t("All companies", "كل الشركات")}</option>{companies.map((c) => <option key={c} value={c} data-no-i18n>{c}</option>)}</select></Field>
      {!lockProject && <Field label={t("Project", "المشروع")}><select className={inputCls} value={scope.project ?? ""} data-scope="project" onChange={(e) => set({ project: e.target.value || undefined })}><option value="">{t("All construction projects", "كل مشاريع المقاولات")}</option>{projects.map((p) => <option key={p.name} value={p.name} data-no-i18n>{projectTitle(p, !ar)}</option>)}</select></Field>}
    </Filters>
  );
}

/** Report URL for a drill: report scope + `rf` row filters (+ the metric/chart that opened it, for the report header). */
export function drillLink(report: string, scope: Scope, filters: RowFilter[], from?: { metric?: string; chart?: string }) {
  const r = reportByName(report);
  const project = scope.project || (r && projectRequired(r) ? "__all__" : undefined);
  return reportLink(report, { company: scope.company, project, rf: filters.length ? JSON.stringify(filters) : undefined, metric: from?.metric, chart: from?.chart });
}

// ---------------------------------------------------------------- KPI card
export function MetricCard({ id, scope }: { id: string; scope: Scope }) {
  const { t, ar } = useCx();
  const [open, setOpen] = useState(false);
  const m = metricById(id);
  if (!m) return null;
  const r = metricValue(m, scope);
  // status from the metric definition: tone applies only when the value is non-zero; unknown values stay neutral
  const tone: DxTone = r.value === null ? "neutral" : m.tone === "bad" && r.value ? "bad" : m.tone === "warn" && r.value ? "warn" : "neutral";
  const label = ar ? m.ar : m.en;
  const hint = r.value === null ? (r.reason ? (ar ? r.reason[1] : r.reason[0]) : t("Not available", "غير متاح")) : m.unit === "SAR" ? fmtUnit(r.value, "SAR", ar, true) : m.agg === "ratio" ? t(`${r.denominator} decided`, `${r.denominator} محسومة`) : t(`${r.rows.length} source rows`, `${r.rows.length} صف مصدر`);
  const value = <span data-metric-value={r.value === null ? "" : String(r.value)}>{fmtUnit(r.value, m.unit, ar)}</span>;
  const basis = <span data-no-i18n={m.unit === "SAR" && r.value !== null ? true : undefined}>{hint}</span>;
  return (
    <div className="relative min-w-0" data-metric={m.id} data-metric-status={m.status}>
      <SignalCard label={label} value={value} tone={tone} basis={basis}
        footer={m.status === "UNAVAILABLE_SOURCE" ? undefined : <>{t(`Open ${r.rows.length} source rows`, `فتح ${r.rows.length} صف مصدر`)} <Chev /></>}
        link={m.status === "UNAVAILABLE_SOURCE" ? undefined : (b, cls) => <AppLink to={drillLink(m.report, scope, m.filters, { metric: m.id })} className={cls} title={t(`Open the ${r.rows.length} source rows`, `فتح ${r.rows.length} صف مصدر`)}>{b}</AppLink>} />
      <button type="button" className="absolute end-1.5 top-2 inline-flex h-6 w-6 items-center justify-center rounded-full text-[11px] text-muted-foreground hover:bg-muted max-md:h-9 max-md:w-9" aria-expanded={open} aria-label={t(`Definition of ${m.en}`, `تعريف ${m.ar}`)} data-metric-info={m.id} onClick={() => setOpen(!open)}>ⓘ</button>
      {open && <MetricInspector m={m} scope={scope} onClose={() => setOpen(false)} />}
    </div>
  );
}
export function MetricInspector({ m, scope, onClose }: { m: MetricDef; scope: Scope; onClose?: () => void }) {
  const { t, ar } = useCx();
  const r = metricValue(m, scope);
  const chart = adapter.get("Insights Chart v3", metricChartId(m.id));
  const row = (k: string, v: ReactNode) => <div className="grid grid-cols-[8rem_minmax(0,1fr)] gap-2 py-0.5"><dt className="text-muted-foreground">{k}</dt><dd className="min-w-0 break-words">{v}</dd></div>;
  return (
    <div className="absolute inset-x-0 top-full z-20 mt-1 rounded-md border border-border bg-popover p-3 text-xs text-popover-foreground shadow-lg" role="dialog" aria-label={t("Metric definition", "تعريف المؤشر")} data-metric-inspector={m.id}>
      <dl>
        {row(t("Metric ID", "رمز المؤشر"), <code data-no-i18n>{m.id}</code>)}
        {row(t("Definition", "التعريف"), ar ? m.def_ar : m.def_en)}
        {row(t("Status", "الحالة"), <span>{statusText(m.status, ar)}{m.policy ? <span data-no-i18n> · {m.policy}</span> : null}</span>)}
        {row(t("Unit", "الوحدة"), ar ? UNIT_HINT[m.unit]![1] : UNIT_HINT[m.unit]![0])}
        {row(t("Report", "التقرير"), <AppLink to={drillLink(m.report, scope, m.filters, { metric: m.id })}>{reportTitle(m.report, ar)}</AppLink>)}
        {row(t("Row filters", "مرشحات الصفوف"), m.filters.length ? <code data-no-i18n>{m.filters.map((f) => `${f[0]} ${f[1]} ${f[2] ?? ""}`.trim()).join(" · ")}</code> : t("none", "لا يوجد"))}
        {row(t("Aggregation", "التجميع"), <code data-no-i18n>{m.agg}{m.column ? `(${m.column})` : ""}</code>)}
        {row(t("Source DocTypes", "أنواع المستندات المصدر"), <span data-no-i18n>{m.sources.map((s) => (ar ? DOCTYPE_AR[s] ?? s : s)).join("، ")}</span>)}
        {row(t("Owner role", "الدور المالك"), <span>{ar ? ROLE_AR_M[m.owner] ?? m.owner : m.owner}</span>)}
        {m.status !== "UNAVAILABLE_SOURCE" && row(t("Definition", "التعريف"), <code data-no-i18n>{definitionHash(m)}</code>)}
        {row(t("Rows now", "الصفوف الآن"), <span data-no-i18n>{r.rows.length}</span>)}
        {row(t("Insights chart", "مخطط التحليلات"), chart ? <Link to="/insights/workbook/$workbookName/chart/$chartName" params={{ workbookName: WORKBOOK, chartName: chart.name }} className="text-primary hover:underline" data-no-i18n>{chart.name}</Link> : <span>{m.agg === "ratio" ? t("ratio — computed by the metric engine", "نسبة — يحسبها محرك المؤشرات") : t("none", "لا يوجد")}</span>)}
        {m.same_as && row(t("Same as", "مطابق لـ"), <code data-no-i18n>{m.same_as}</code>)}
      </dl>
      {onClose && <button type="button" className={`${BTN.compact} mt-2`} onClick={onClose}>{t("Close", "إغلاق")}</button>}
    </div>
  );
}
export function MetricGrid({ ids, scope }: { ids: string[]; scope: Scope }) {
  // even rows for 3/4/6 cards (no orphan card on its own row), else auto-fit
  const c = ids.length === 6 ? "grid-cols-2 md:grid-cols-3 xl:grid-cols-6" : ids.length === 4 ? "grid-cols-1 sm:grid-cols-2 xl:grid-cols-4" : ids.length === 3 ? "grid-cols-1 sm:grid-cols-3" : "grid-cols-[repeat(auto-fit,minmax(min(100%,11.5rem),1fr))]";
  return <div className={`mb-4 grid gap-3 ${c}`} data-metric-grid>{ids.map((id) => <MetricCard key={id} id={id} scope={scope} />)}</div>;
}

// ---------------------------------------------------------------- Insights chart panel
const COLORS = ["bg-[color:var(--chart-1)]", "bg-[color:var(--chart-2)]", "bg-[color:var(--chart-3)]", "bg-[color:var(--chart-4)]", "bg-[color:var(--chart-5)]"];
const toRowFilters = (rules: FilterRule[] | undefined): RowFilter[] => (rules ?? []).filter((f) => f.column?.column_name).map((f) => [f.column!.column_name, String(f.operator ?? "="), f.value]);
/** Renders one Insights Chart v3 record with the scope as extra filters; each mark drills to the report rows behind it. */
export function InsightsChartPanel({ id, scope }: { id: string; scope: Scope }) {
  const { t, ar } = useCx();
  const chart = adapter.get("Insights Chart v3", id);
  const def = chartById(id);
  const title = def ? (ar ? def.ar : def.en) : String(chart?.["title"] ?? id);
  const unitTxt = def ? (ar ? UNIT_HINT[def.unit]?.[1] : UNIT_HINT[def.unit]?.[0]) : undefined;
  const wrap = (body: ReactNode, extra?: ReactNode) => (
    <DxPanel title={title} subtitle={<>{t("Insights", "التحليلات")}{unitTxt ? <> · {unitTxt}</> : null}{def ? <> · {reportTitle(def.report, ar)}</> : null}</>} className="h-[calc(100%-1rem)]"
      actions={<>{extra}{chart && <Link to="/insights/workbook/$workbookName/chart/$chartName" params={{ workbookName: WORKBOOK, chartName: id }} className="text-xs font-medium text-primary hover:underline">{t("Open in Insights", "فتح في التحليلات")}</Link>}</>}>
      <div data-insights-panel={id}>{body}</div>
    </DxPanel>
  );
  if (!chart) return wrap(<Note tone="warn">{t("This Insights chart is not installed yet. Enable DIGIT Construction (or reinstall its demo) to create the DIGIT Construction workbook.", "مخطط التحليلات هذا غير مثبت بعد. فعّل ديجيت للمقاولات (أو أعد تثبيت بياناته التجريبية) لإنشاء دفتر ديجيت للمقاولات.")}</Note>);
  const query = adapter.get("Insights Query v3", String(chart["query"] ?? ""));
  const table = String(parseJSON<{ table?: { table_name?: string } }[]>(query?.["operations"], [])[0]?.table?.table_name ?? "");
  const report = reportOfTable(table);
  const cfg = parseJSON<ChartConfig>(chart["config"], {});
  const hasCol = (c: string) => !!report?.columns.some((x) => x.fieldname === c) || c === "company";
  if (scope.project && !report?.columns.some((x) => x.fieldname === "project")) return wrap(<Empty>{t("This chart has no project dimension in its source report, so it is shown on department dashboards only.", "لا يحتوي التقرير المصدر لهذا المخطط على بُعد المشروع، لذلك يظهر في لوحات الأقسام فقط.")}</Empty>);
  const extra: FilterRule[] = [];
  if (scope.company && hasCol("company")) extra.push({ column: { column_name: "company" }, operator: "=", value: scope.company });
  if (scope.project) extra.push({ column: { column_name: "project" }, operator: "=", value: scope.project });
  const d = computeChart(chart, extra);
  const base = toRowFilters(cfg.filters?.filters);
  const unit = def?.unit ?? "SAR";
  const fmt = (v: number) => (unit === "SAR" ? compact(v, ar) : fmtUnit(v, unit === "qty" ? "count" : unit, ar));
  const drill = (x: string | undefined, label: string, split?: { col: string; value: string }) => report ? drillLink(report.name, scope, [...base, ...(x ? [[x, "=", label] as RowFilter] : []), ...(split ? [[split.col, "=", split.value] as RowFilter] : [])], { chart: id }) : undefined;
  const seriesLabel = (name: string) => { const m = def?.measures.find((x) => x.en === name || (x.agg === "count" ? "count" : `sum_${x.column}`) === name); if (m) return ar ? m.ar : m.en; return def?.split ? valueLabel(def.split, name, ar) : name; };
  const footer = <p className="mt-2 text-[11px] text-muted-foreground"><span data-no-i18n>{d.total}</span> {t("source rows", "صف مصدر")} · {t("Insights chart", "مخطط التحليلات")} <code data-no-i18n>{id}</code>{report ? <> · <AppLink to={drillLink(report.name, scope, base, { chart: id })}>{reportTitle(report.name, ar)}</AppLink></> : null}</p>;
  if (d.kind === "unsupported") return wrap(<Note tone="warn">{d.reason}</Note>);
  if (d.server.length) return wrap(<Note tone="warn">{t("Server-dependent steps were skipped: ", "تم تخطي خطوات تعتمد على الخادم: ")}<span data-no-i18n>{d.server.join("; ")}</span></Note>);
  if (d.kind === "pie") {
    const x = cfg.label_column?.column_name ?? def?.x;
    const total = d.values.reduce((a, b) => a + b, 0);
    if (!d.labels.length || !total) return wrap(<><Empty>{t("No source rows for this scope", "لا صفوف مصدر لهذا النطاق")}</Empty>{footer}</>);
    return wrap(<><ul className="space-y-1.5" role="list" data-chart="share">{d.labels.map((l, i) => { const v = d.values[i] ?? 0; const href = drill(x, l);
      const bar = <div className="grid grid-cols-[minmax(0,9rem)_minmax(3rem,1fr)_minmax(4.5rem,auto)] items-center gap-2 text-sm"><span className="flex min-w-0 items-center gap-1.5"><span className={`h-2.5 w-2.5 shrink-0 rounded-sm ${COLORS[i % COLORS.length]}`} aria-hidden /><span className="truncate" data-no-i18n>{valueLabel(x ?? "", l, ar)}</span></span><span className="relative h-3 overflow-hidden rounded bg-muted" aria-hidden><span className={`absolute inset-y-0 start-0 rounded ${COLORS[i % COLORS.length]}`} style={{ width: `${Math.max(2, (v / total) * 100)}%` }} /></span><span className="text-end tabular-nums" dir="ltr" data-no-i18n>{fmt(v)} <span className="text-[11px] text-muted-foreground">{fmtNumber((v / total) * 100, 0)}%</span></span></div>;
      return <li key={l}>{href ? <AppLink to={href} className="block rounded hover:bg-muted/60" title={`${valueLabel(x ?? "", l, ar)}: ${fmt(v)}`}><span data-chart-mark={l}>{bar}</span></AppLink> : bar}</li>; })}</ul>{footer}</>);
  }
  if (d.kind !== "axis") return wrap(<Note tone="warn">{t("Chart type not shown here; open it in Insights.", "نوع المخطط غير معروض هنا؛ افتحه في التحليلات.")}</Note>);
  const x = cfg.x_axis?.dimension?.column_name ?? def?.x;
  const max = Math.max(0, ...d.series.flatMap((s) => s.values.map((v) => Math.abs(v))));
  if (!d.labels.length || !max) return wrap(<><Empty>{t("No source rows for this scope", "لا صفوف مصدر لهذا النطاق")}</Empty>{footer}</>);
  if (x === "period") {
    // time series (Insights x-axis = period): vertical columns, each column opens the report rows of that period and series
    const cols = d.series.map((s) => ({ name: s.name, label: seriesLabel(s.name), values: s.values }));
    return wrap(<><ColumnChart labels={d.labels} series={cols} format={fmt} ariaLabel={title} height={200}
      mark={(li, si, node) => { const l = d.labels[li]!; const s = d.series[si]!; const href = drill(x, l, def?.split ? { col: def.split, value: s.name } : undefined);
        return href ? <AppLink to={href} className="flex h-full items-end rounded-sm" title={`${l} — ${seriesLabel(s.name)}: ${fmt(s.values[li] ?? 0)}`}><span data-chart-mark={`${l}|${s.name}`} className="flex h-full items-end">{node}</span></AppLink> : node; }} />{footer}</>);
  }
  const legend = d.series.length > 1 ? <ul className="mb-2 flex flex-wrap gap-3 text-[11px] text-muted-foreground" aria-label={t("Series", "السلاسل")}>{d.series.map((s, i) => <li key={s.name} className="flex items-center gap-1"><span className={`h-2 w-2 rounded-sm ${COLORS[i % COLORS.length]}`} aria-hidden />{seriesLabel(s.name)}</li>)}</ul> : null;
  return wrap(<>{legend}<ul className="space-y-2.5" role="list" data-chart="bars">{d.labels.map((l, li) => (
    <li key={l} className="text-sm">
      <div className="mb-0.5 truncate font-medium" data-no-i18n>{valueLabel(x ?? "", l, ar)}</div>
      <div className="space-y-0.5">{d.series.map((s, si) => { const v = s.values[li] ?? 0; const href = drill(x, l, def?.split ? { col: def.split, value: s.name } : undefined);
        const bar = <div className="grid grid-cols-[minmax(3rem,1fr)_minmax(4.5rem,auto)] items-center gap-2"><span className="relative h-2.5 overflow-hidden rounded-full bg-muted" aria-hidden><span className={`absolute inset-y-0 start-0 rounded-full ${COLORS[si % COLORS.length]}`} style={{ width: `${v ? Math.max(1.5, (Math.abs(v) / max) * 100) : 0}%` }} /></span><span className="text-end text-xs tabular-nums" data-no-i18n>{fmt(v)}</span></div>;
        return <div key={s.name}>{href ? <AppLink to={href} className="block rounded hover:bg-muted/60" title={`${valueLabel(x ?? "", l, ar)} — ${seriesLabel(s.name)}: ${fmt(v)}`}><span data-chart-mark={`${l}|${s.name}`} className="block">{bar}</span></AppLink> : bar}</div>; })}</div>
    </li>))}</ul>{footer}</>);
}

// ---------------------------------------------------------------- experience helpers (layout-aware chart ids, real series)
/** Chart ids of a workspace dashboard in the user's effective layout order (personal → role → company → system). */
export function useWorkspaceChartIds({ dept, dashKey, scope = {} }: { dept?: DashboardDef["dept"]; dashKey?: string; scope?: Scope }) {
  const dash = dashKey ? dashboardByKey(dashKey) : DASHBOARDS.find((d) => d.dept === dept);
  const layout = useLayout(dash ?? DASHBOARDS[0]!, scope.company);
  if (!dash) return { dash: undefined, ids: [] as string[], to: "insights" };
  return { dash, ids: layout.charts, to: `insights/${dash.key}${scope.project ? `?project=${encodeURIComponent(scope.project)}` : ""}` };
}
/**
 * One series of an Insights axis chart (e.g. monthly collected of DCON-C-FIN-CASH) evaluated by the Core Insights engine
 * for a scope — the only source of mini trends on signal cards. Empty when the chart, series or rows are missing.
 */
export function insightsSeries(id: string, seriesName: string, scope: Scope): number[] {
  const chart = adapter.get("Insights Chart v3", id);
  if (!chart) return [];
  const extra: FilterRule[] = [];
  if (scope.company) extra.push({ column: { column_name: "company" }, operator: "=", value: scope.company });
  if (scope.project) extra.push({ column: { column_name: "project" }, operator: "=", value: scope.project });
  const d = computeChart(chart, extra);
  if (d.kind !== "axis") return [];
  const def = chartById(id);
  const m = def?.measures.find((x) => x.en === seriesName);
  const s = d.series.find((x) => x.name === seriesName || (m && x.name === (m.agg === "count" ? "count" : `sum_${m.column}`)));
  return s ? s.values : [];
}

// ---------------------------------------------------------------- dashboards
/** Charts of a dashboard (Insights Dashboard v3 items, else the definition) — one implementation in domain/layouts.ts. */
export { dashboardCharts };
/** Cards then charts in the given (resolved) order; without a layout the system default (definition metrics + dashboard charts). */
export function DashboardView({ dash, scope, layout }: { dash: DashboardDef; scope: Scope; layout?: ResolvedLayout }) {
  const { t } = useCx();
  const metrics = layout ? layout.metrics : dash.metrics;
  const charts = layout ? layout.charts : dashboardCharts(dash);
  return (
    <div data-dashboard={dash.id}>
      {metrics.length > 0 && <MetricGrid ids={metrics} scope={scope} />}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 xl:grid-cols-2">{charts.map((c) => <InsightsChartPanel key={c} id={c} scope={scope} />)}</div>
      {!metrics.length && !charts.length && <Empty>{t("Every card and chart is hidden in this layout. Use Customize to show them again.", "كل البطاقات والمخططات مخفية في هذا التخطيط. استخدم «تخصيص» لإظهارها.")}</Empty>}
    </div>
  );
}
/**
 * Charts of the department's Insights dashboard embedded in a workspace (department page, management home, Project 360).
 * Cards stay the workspace's own operational tiles; the full dashboard (registry cards + charts) is one click away.
 * The user's effective layout (personal → role → company → system) decides which charts come first.
 */
export function WorkspaceAnalytics({ dept, dashKey, scope = {}, max = 2 }: { dept?: DashboardDef["dept"]; dashKey?: string; scope?: Scope; max?: number }) {
  const { t, ar } = useCx();
  const dash = dashKey ? dashboardByKey(dashKey) : DASHBOARDS.find((d) => d.dept === dept);
  if (!dash) return null;
  return <WorkspaceCharts dash={dash} scope={scope} max={max} t={t} ar={ar} />;
}
function WorkspaceCharts({ dash, scope, max, t, ar }: { dash: DashboardDef; scope: Scope; max: number; t: (en: string, a: string) => string; ar: boolean }) {
  const charts = useLayout(dash, scope.company).charts.slice(0, max);
  const to = `insights/${dash.key}${scope.project ? `?project=${encodeURIComponent(scope.project)}` : ""}`;
  return (
    <section className="mb-4" data-workspace-analytics={dash.id} aria-label={ar ? dash.ar : dash.en}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-foreground">{t("Insights", "التحليلات")} · {ar ? dash.ar : dash.en}</h2>
        <AppLink to={to} className="text-xs">{t("Open the full dashboard", "فتح اللوحة كاملة")}</AppLink>
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 xl:grid-cols-2">{charts.map((c) => <InsightsChartPanel key={c} id={c} scope={scope} />)}</div>
    </section>
  );
}
export function DashboardPage({ params }: PluginPageProps) {
  const { t, ar } = useCx();
  const sc = useScope();
  const dash = dashboardByKey(String(params["key"] ?? ""));
  if (!dash) return <div className="p-6"><PageHeader title={t("Dashboard not found", "اللوحة غير موجودة")} crumbs={[{ label: t("Insights dashboards", "لوحات التحليلات"), to: "insights" }]} /><Empty><span data-no-i18n>{params["key"]}</span></Empty></div>;
  return <DashboardBody dash={dash} sc={sc} t={t} ar={ar} />;
}
function DashboardBody({ dash, sc, t, ar }: { dash: DashboardDef; sc: ReturnType<typeof useScope>; t: (en: string, a: string) => string; ar: boolean }) {
  const layout = useLayout(dash, sc.scope.company);
  return (
    <div className="w-full min-w-0" data-page="construction-dashboard" data-dashboard-key={dash.key}>
      <PageHeader title={ar ? dash.ar : dash.en} crumbs={[{ label: t("Insights dashboards", "لوحات التحليلات"), to: "insights" }]}
        subtitle={t("Insights dashboard over the Construction read models: every card and bar opens the report rows behind it.", "لوحة التحليلات على نماذج القراءة للمقاولات: كل بطاقة وشريط يفتح صفوف التقرير التي يقوم عليها.")}
        actions={<Link to="/insights/workbook/$workbookName/dashboard/$dashboardName" params={{ workbookName: WORKBOOK, dashboardName: dash.id }} className={BTN.secondary}>{t("Open in Insights", "فتح في التحليلات")}</Link>} />
      <ScopeBar {...sc} />
      <LayoutBar dash={dash} layout={layout} scopeCompany={sc.scope.company} />
      <DashboardView dash={dash} scope={sc.scope} layout={layout} />
    </div>
  );
}
export function AnalyticsHomePage() {
  const { t, ar } = useCx();
  return (
    <div className="w-full min-w-0" data-page="construction-insights">
      <PageHeader title={t("Insights dashboards", "لوحات التحليلات")} subtitle={t("Twelve dashboards of the DIGIT Construction Insights workbook. They read the same report rows as the workspaces; ledgers stay with the native accounting reports.", "اثنتا عشرة لوحة في دفتر التحليلات لديجيت للمقاولات. تقرأ صفوف التقارير نفسها التي تقرأها المساحات؛ وتبقى الدفاتر المحاسبية في التقارير الأصلية.")}
        actions={<><AppLink to="metrics" className={BTN.secondary}>{t("Metric library", "مكتبة المؤشرات")}</AppLink><Link to="/insights/workbook/$workbookName" params={{ workbookName: WORKBOOK }} className={BTN.secondary}>{t("Open workbook in Insights", "فتح الدفتر في التحليلات")}</Link></>} />
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,17rem),1fr))] gap-3">
        {DASHBOARDS.map((d) => (
          <AppLink key={d.key} to={`insights/${d.key}`} className="panel block p-4 shadow-sm transition-shadow hover:shadow-md">
            <div className="font-semibold text-foreground">{ar ? d.ar : d.en}</div>
            <div className="mt-1 text-xs text-muted-foreground"><span data-no-i18n>{d.metrics.length}</span> {t("KPI cards", "بطاقات مؤشرات")} · <span data-no-i18n>{dashboardCharts(d).length}</span> {t("charts", "مخططات")} · <code data-no-i18n>{d.id}</code></div>
          </AppLink>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- metric library (FIN-05 KPI definitions)
export function MetricLibraryPage() {
  const { t, ar } = useCx();
  const sc = useScope();
  const [dept, setDept] = useState(""); const [status, setStatus] = useState(""); const [q, setQ] = useState("");
  const rows = METRICS.filter((m) => (!dept || m.dept === dept) && (!status || m.status === status) && (!q || `${m.id} ${m.en} ${m.ar}`.toLowerCase().includes(q.toLowerCase()))).map((m) => ({ ...m, name: m.id, value: metricValue(m, sc.scope).value }));
  type R = (typeof rows)[number] & Record<string, unknown>;
  return (
    <div className="w-full min-w-0" data-page="construction-metrics">
      <PageHeader title={t("Metric library", "مكتبة المؤشرات")} crumbs={[{ label: t("Insights dashboards", "لوحات التحليلات"), to: "insights" }]}
        subtitle={t("One definition per KPI: report, row filters and aggregation. Card, Insights chart and drill report use it unchanged.", "تعريف واحد لكل مؤشر: التقرير ومرشحات الصفوف والتجميع. تستخدمه البطاقة ومخطط التحليلات وتقرير التفصيل دون تغيير.")} />
      <ScopeBar {...sc} />
      <Filters>
        <Field label={t("Department", "القسم")}><select className={inputCls} value={dept} onChange={(e) => setDept(e.target.value)}><option value="">{t("All", "الكل")}</option>{[...new Set(METRICS.map((m) => m.dept))].map((d) => <option key={d} value={d} data-no-i18n>{d}</option>)}</select></Field>
        <Field label={t("Status", "الحالة")}><select className={inputCls} value={status} onChange={(e) => setStatus(e.target.value)}><option value="">{t("All", "الكل")}</option>{Object.keys(STATUS_TXT).map((s) => <option key={s} value={s}>{statusText(s as MetricDef["status"], ar)}</option>)}</select></Field>
        <Field label={t("Search", "بحث")}><input className={inputCls} value={q} onChange={(e) => setQ(e.target.value)} placeholder="mgt.certified" /></Field>
      </Filters>
      <Section title={<span>{t("Metrics", "المؤشرات")} <span className="text-xs font-normal text-muted-foreground" data-no-i18n>({rows.length})</span></span>}>
        <DataTable<R> rows={rows as R[]} empty={t("No metrics match", "لا مؤشرات مطابقة")} cols={[
          { key: "id", label: t("Metric ID", "رمز المؤشر"), render: (r) => <code className="text-xs" data-no-i18n>{r.id}</code> },
          { key: "title", label: t("Metric", "المؤشر"), render: (r) => <span>{ar ? r.ar : r.en}</span> },
          { key: "dept", label: t("Department", "القسم"), render: (r) => <span data-no-i18n>{r.dept}</span> },
          { key: "status", label: t("Status", "الحالة"), render: (r) => <span className={r.status === "SOURCE_BACKED" ? "text-success" : r.status === "UNAVAILABLE_SOURCE" ? "text-destructive" : "text-warning"}>{statusText(r.status, ar)}</span> },
          { key: "value", label: t("Current value", "القيمة الحالية"), align: "end", render: (r) => r.status === "UNAVAILABLE_SOURCE" ? <span className="text-muted-foreground">—</span> : <AppLink to={drillLink(r.report, sc.scope, r.filters, { metric: r.id })}><span data-no-i18n>{fmtUnit(r.value as number | null, r.unit, ar, true)}</span></AppLink> },
          { key: "report", label: t("Report", "التقرير"), render: (r) => <span>{reportTitle(r.report, ar)}</span> },
          { key: "owner", label: t("Owner", "المالك"), render: (r) => <span>{ar ? ROLE_AR_M[r.owner] ?? r.owner : r.owner}</span> },
          { key: "defn", label: t("Definition", "التعريف"), render: (r) => r.status === "UNAVAILABLE_SOURCE" ? <span className="text-muted-foreground">—</span> : <code className="text-[11px]" title={t("Changes whenever the rule changes", "يتغير كلما تغيرت القاعدة")} data-no-i18n data-metric-def={r.id}>{definitionHash(r)}</code> },
          { key: "formula", label: t("Rule", "القاعدة"), render: (r) => <code className="text-[11px]" data-no-i18n>{r.agg}{r.column ? `(${r.column})` : ""}{r.filters.length ? ` | ${r.filters.map((f) => `${f[0]} ${f[1]} ${f[2] ?? ""}`.trim()).join(" · ")}` : ""}</code> },
          { key: "chart", label: t("Insights chart", "مخطط التحليلات"), render: (r) => { const c = adapter.get("Insights Chart v3", metricChartId(r.id)); return c ? <Link to="/insights/workbook/$workbookName/chart/$chartName" params={{ workbookName: WORKBOOK, chartName: c.name }} className="text-xs text-primary hover:underline" data-no-i18n>{c.name}</Link> : <span className="text-xs text-muted-foreground">—</span>; } },
        ] as Col<R>[]} />
      </Section>
      <p className="text-xs text-muted-foreground">{t(`${CHARTS.length} Insights charts and ${DASHBOARDS.length} dashboards belong to workbook ${WORKBOOK}.`, `${CHARTS.length} مخطط التحليلات و${DASHBOARDS.length} لوحات تتبع الدفتر ${WORKBOOK}.`)}</p>
    </div>
  );
}
export { APP };
