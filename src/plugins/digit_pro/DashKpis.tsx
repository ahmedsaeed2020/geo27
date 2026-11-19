/** KPI cards + monthly trend chart for the department dashboards, rendered from the shared metric registry (dashMetrics.ts). */
import { Link } from "@tanstack/react-router";
import { translateTo, useLang } from "@/i18n";
import { fmtCurrency } from "@/lib/format";
import { useScopeMetas } from "@/lib/scope";
import { slug } from "./finance";
import { SourceState } from "./ProFrame";
import { deptDash, type DashId, type Kpi, type Trend, type TrendOpen } from "./dashMetrics";
import { GroupedColumns, money, moneyShort, monthLabel, type Wrap } from "@/components/enterprise/kit";
import { DrillLink } from "./CommandUi";
import type { Drill } from "./command";

export const DASH_KPI_DTS = ["Sales Invoice", "Purchase Invoice", "Sales Order", "Quotation", "Purchase Order", "Material Request", "Payment Entry", "Account", "GL Entry", "Journal Entry", "Bin", "Warehouse", "Stock Ledger Entry", "Stock Entry", "Asset", "Asset Depreciation Schedule"];

export function KpiCard({ k, currency }: { k: Kpi; currency: string }) {
  const body = <>
    <p className="text-xs text-muted-foreground">{k.label}</p>
    {k.status !== "ok" ? <SourceState status={k.status} doctype={k.source.split(".")[0]} /> : <>
      <p className={`dp-kpi-v mt-1 text-lg font-semibold tabular-nums ${k.tone === "bad" ? "text-destructive" : ""}`} data-no-i18n>{k.money ? fmtCurrency(k.value, currency) : k.value.toLocaleString("en-US")}</p>
      {k.count !== undefined && k.money && <p className="text-xs text-muted-foreground"><span data-no-i18n>{k.count}</span> <span>documents</span></p>}</>}
  </>;
  const cls = `dp-card block text-start hover:ring-1 hover:ring-primary ${k.tone === "warn" ? "border-warning" : ""}`;
  const title = k.definition;
  if (k.status !== "ok") return <div className={cls} data-dp-kpi={k.id}>{body}</div>;
  return k.open.kind === "pro"
    ? <Link to={k.open.to as never} search={(k.open.search ?? {}) as never} className={cls} title={title} data-dp-kpi={k.id}>{body}</Link>
    : <Link to="/app/$app/$doctype" params={{ app: "erpnext", doctype: slug(k.open.doctype) }} search={(k.open.filters ? { filters: JSON.stringify(k.open.filters) } : {}) as never} className={cls} title={title} data-dp-kpi={k.id}>{body}</Link>;
}

/** Monthly trend drawn with the Enterprise kit: grouped columns per month (each bar opens that month's documents), totals in the legend. */
export function TrendChart({ t, currency }: { t: Trend; currency: string }) {
  const lang = useLang(); const ar = lang === "ar"; const tr = (x: string) => translateTo(x, ar ? "ar" : "en");
  if (t.status !== "ok") return <SourceState status={t.status} doctype={t.source.split(".")[0]} />;
  const drill = (o: TrendOpen | undefined, m: string): Drill | undefined => {
    if (!o) return undefined;
    const [y, mm] = m.split("-").map(Number) as [number, number]; const last = new Date(Date.UTC(y, mm, 0)).toISOString().slice(0, 10);
    if (o.pro) { const company = o.filters?.find(([field]) => field === "company")?.[2]; return { kind: "pro", to: o.pro, search: { from: `${m}-01`, to: last, ...(typeof company === "string" ? { company } : {}) } }; }
    return { kind: "list", doctype: o.doctype, filters: [...(o.filters ?? []), [o.dateField, ">=", `${m}-01`], [o.dateField, "<=", last]] as never };
  };
  const wrap: Wrap = (d, children, attrs) => <DrillLink drill={d as Drill} {...(attrs ?? {})}>{children}</DrillLink>;
  return <figure data-dp-trend>
    <GroupedColumns ar={ar} wrap={wrap} fmt={money(currency)} axisFmt={moneyShort(currency)}
      groups={t.months.map((m) => ({ key: m, label: monthLabel(m, ar) }))}
      series={t.series.map((sr) => ({ label: tr(sr.label), values: sr.values, drills: t.months.map((m) => drill(sr.open, m)) }))} />
    <figcaption className="ek-note mt-1">{tr(t.definition)}</figcaption>
  </figure>;
}

export function DeptDashboard({ id, company, currency, period = 6 }: { id: DashId; company: string; currency: string; period?: number }) {
  useScopeMetas(DASH_KPI_DTS);
  const d = deptDash(id, company, undefined, undefined, period);
  return <section className="dp-card" data-dp-dept-dash={id} aria-label="Dashboard">
    <h2 className="dp-ws-h">Dashboard</h2>
    <div className="mt-2 grid gap-3 grid-cols-2 lg:grid-cols-4">{d.kpis.map((k) => <KpiCard key={k.id} k={k} currency={currency} />)}</div>
    <h3 className="mt-4 text-sm font-semibold">{d.trend.label}</h3>
    <TrendChart t={d.trend} currency={currency} />
  </section>;
}
