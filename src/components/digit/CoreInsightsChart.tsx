/**
 * An existing Insights Chart v3 record rendered in the DIGIT Experience style for DIGIT Core department homes. Values
 * come only from the Core Insights engine (computeChart) over the chart's own query, plus the page scope as extra
 * filters. Date x-axes render as columns and label/value charts as ranked buckets; every column / row opens the native
 * list with the same filters (chart query + page scope + that mark). Nothing is computed here, and a missing chart / no rows / no permission shows an honest state.
 */
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { adapter } from "@/lib/adapter";
import { axisMarkFilters, computeChart, type ChartConfig } from "@/lib/insightsChart";
import { parseJSON, type FilterRule } from "@/lib/insights";
import { fmtNumber } from "@/lib/format";
import { canReadType } from "@/lib/scope";
import { t as tr } from "@/i18n";
import type { IndexEntry } from "@/lib/catalog";
import { BucketBars, ColumnChart, DxPanel, DxState } from "./Experience";

type Tx = (en: string, ar: string) => string;
const short = (v: number) => { const a = Math.abs(v); return a >= 1e6 ? `${fmtNumber(v / 1e6, 1)}M` : a >= 1e3 ? `${fmtNumber(v / 1e3, 1)}K` : fmtNumber(v, Number.isInteger(v) ? 0 : 1); };

export function CoreInsightsChart({ id, title, extra = [], drillFilters = [], entry, tx, height = 190, expect }: {
  id: string; title: string; extra?: FilterRule[]; drillFilters?: [string, string, unknown][]; entry: (doctype: string) => IndexEntry | undefined; tx: Tx; height?: number;
  /** DocType the chart is expected to read; a stored chart pointing at another query is reported, not drawn */
  expect?: string;
}) {
  const chart = adapter.get("Insights Chart v3", id);
  const query = chart ? adapter.get("Insights Query v3", String(chart["query"] ?? "")) : undefined;
  const ops = parseJSON<{ type?: string; table?: { table_name?: string }; filters?: FilterRule[] }[]>(query?.["operations"], []);
  const doctype = String(ops[0]?.table?.table_name ?? "").replace(/^tab/, "");
  const wb = String(chart?.["workbook"] ?? "");
  const open = chart && wb ? <Link to="/insights/workbook/$workbookName/chart/$chartName" params={{ workbookName: wb, chartName: id }} className="font-medium text-primary hover:underline">{tx("Open in Insights", "فتح في التحليلات")}</Link> : undefined;
  const wrap = (body: ReactNode, footer?: ReactNode) => (
    <DxPanel title={title} subtitle={<>{tx("Insights", "التحليلات")}{doctype ? <> · <span>{doctype}</span></> : null}</>} actions={open} footer={footer} className="h-[calc(100%-1rem)]" attrs={{ "data-core-insights": id }}>{body}</DxPanel>
  );
  if (!chart) return wrap(<DxState kind="empty" title={tx("This Insights chart is not available yet.", "مخطط التحليلات هذا غير متاح بعد.")} />);
  if (expect && doctype !== expect) return wrap(<DxState kind="error" title={tx(`This stored Insights chart reads ${doctype || "no table"} instead of ${expect}.`, `مخطط التحليلات المخزن هذا يقرأ ${doctype ? tr(doctype) : "لا جدول"} بدلاً من ${tr(expect)}.`)} detail={tx("Its query was saved by an earlier demo seed; open it in Insights and pick the right query, or reset the demo Insights workbooks.", "حُفظ استعلامه من بيانات تجريبية سابقة؛ افتحه في التحليلات واختر الاستعلام الصحيح، أو أعد تهيئة دفاتر التحليلات التجريبية.")} />);
  if (doctype && !canReadType(doctype)) return wrap(<DxState kind="denied" title={tx("Your role cannot read the records behind this chart.", "لا يسمح دورك بقراءة السجلات التي يقوم عليها هذا المخطط.")} />);
  const d = computeChart(chart, extra);
  const cfg = parseJSON<ChartConfig>(chart["config"], {});
  const footer = <><span data-no-i18n>{d.total}</span> {tx("source rows", "صف مصدر")} · <code data-no-i18n>{id}</code></>;
  if (d.kind === "unsupported") return wrap(<DxState kind="error" title={d.reason} />);
  const e = doctype ? entry(doctype) : undefined;
  const baseFilters = ops.filter((o) => o.type === "filter").flatMap((o) => (o.filters ?? []).filter((f) => f.column?.column_name).map((f) => [f.column!.column_name, String(f.operator ?? "="), f.value] as [string, string, unknown]));
  if (d.kind === "pie") {
    const col = cfg.label_column?.column_name;
    const total = d.values.reduce((a, b) => a + b, 0);
    if (!d.labels.length || !total) return wrap(<DxState kind="empty" title={tx("No source rows for this scope", "لا صفوف مصدر لهذا النطاق")} />, footer);
    return wrap(<BucketBars format={short} empty={tx("No source rows", "لا صفوف مصدر")} items={d.labels.map((l, i) => ({
      key: l, label: <span data-chart-mark={l}>{l || tx("(blank)", "(فارغ)")}</span>, value: d.values[i] ?? 0, share: `${fmtNumber(((d.values[i] ?? 0) / total) * 100, 0)}%`,
      wrap: e && col ? (node) => <Link to="/app/$app/$doctype" params={{ app: e.app, doctype: e.slug }} search={{ filters: JSON.stringify([...baseFilters, ...drillFilters, [col, "=", l]]) } as never} className="block rounded hover:bg-muted/60" title={tx("Open the records", "فتح السجلات")}>{node}</Link> : undefined,
    }))} />, footer);
  }
  if (d.kind !== "axis") return wrap(<DxState kind="error" title={tx("Chart type not shown here; open it in Insights.", "نوع المخطط غير معروض هنا؛ افتحه في التحليلات.")} />, footer);
  if (!d.labels.length || d.series.every((s) => s.values.every((v) => !v))) return wrap(<DxState kind="empty" title={tx("No source rows for this scope", "لا صفوف مصدر لهذا النطاق")} />, footer);
  const gran = cfg.x_axis?.dimension?.granularity;
  const ar = tx("en", "ar") === "ar";
  const labelText = gran === "month" || gran === "quarter" || gran === "year"
    ? (l: string) => { const dt = new Date(`${l}T00:00:00Z`); return isNaN(dt.getTime()) ? l : gran === "year" ? String(dt.getUTCFullYear()) : dt.toLocaleDateString(ar ? "ar" : "en-GB", { month: "short", year: "2-digit", timeZone: "UTC" }); }
    : undefined;
  const mark = e && cfg.x_axis?.dimension?.column_name
    ? (li: number, si: number, node: ReactNode) => {
        const l = d.labels[li] ?? "", s = d.series[si];
        return <Link to="/app/$app/$doctype" params={{ app: e.app, doctype: e.slug }} search={{ filters: JSON.stringify([...baseFilters, ...drillFilters, ...axisMarkFilters(cfg, l, s?.name ?? "")]) } as never} className="flex h-full items-end" data-chart-mark={l} aria-label={`${labelText ? labelText(l) : l}: ${short(s?.values[li] ?? 0)} — ${tx("open the records", "فتح السجلات")}`}>{node}</Link>;
      }
    : undefined;
  return wrap(<ColumnChart labels={d.labels} series={d.series.map((s) => ({ name: s.name, label: s.name, values: s.values }))} format={short} ariaLabel={title} height={height} mark={mark} labelText={labelText} />, footer);
}
