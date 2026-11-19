import { useState } from "react";
import { adapter, useStoreVersion, type Doc } from "@/lib/adapter";
import { useDevMode } from "@/lib/mode";
import { CrmShell } from "./CrmShell";
import { useCrm } from "./useCrm";
import { CRM_AR, money, useL } from "./crmI18n";
import { linkTitle } from "@/lib/linkTitle";
import { DateInput } from "@/components/form/DateInput";
import { Link } from "@tanstack/react-router";
import { ChartCard, ChartRow, Funnel, GroupedColumns, RankedBars } from "@/components/enterprise/kit";
import { KpiCard, KpiSlots, useLeadRow } from "@/components/enterprise/kit/KpiCard";

/**
 * pages/Dashboard.vue over crm/api/dashboard.py: 8 number cards and 10 charts
 * (sales trend, forecasted revenue, funnel conversion, deals by ongoing & won stage, deals by stage,
 * lost deal reasons, leads/deals by source, deals by territory), with from/to date and user filters.
 * Computed from adapter records at render time.
 */
export function CrmDashboard() {
  const b = useCrm();
  useStoreVersion();
  const { L, lang } = useL();
  const dev = useDevMode();
  const [from, setFrom] = useState(""); const [to, setTo] = useState(""); const [user, setUser] = useState("");
  const header = <span className="text-lg font-semibold">{L("Dashboard")}</span>;
  if (!b) return <CrmShell header={header}><p className="p-6 text-crm-muted">…</p></CrmShell>;
  const day = (d: Doc) => String(d["creation"] ?? "").slice(0, 10);
  const inRange = (d: Doc) => (!from || day(d) >= from) && (!to || day(d) <= to);
  const leads = adapter.list("CRM Lead").filter((d) => inRange(d) && (!user || d["lead_owner"] === user));
  const deals = adapter.list("CRM Deal").filter((d) => inRange(d) && (!user || d["deal_owner"] === user));
  const st = b.defaults.deal_statuses;
  const type = (d: Doc) => st[String(d["status"])]?.type;
  const ongoing = deals.filter((d) => type(d) === "Ongoing" || type(d) === "Open");
  const won = deals.filter((d) => type(d) === "Won");
  const lost = deals.filter((d) => type(d) === "Lost");
  const val = (d: Doc) => Number(d["deal_value"] || d["expected_deal_value"] || 0) * Number(d["exchange_rate"] || 1);
  const avg = (a: Doc[]) => (a.length ? a.reduce((s, d) => s + val(d), 0) / a.length : 0);
  const days = (a: unknown, c: unknown) => (new Date(String(c)).getTime() - new Date(String(a)).getTime()) / 864e5;
  const closeDeal = won.filter((d) => d["closed_date"]).map((d) => days(d["creation"], d["closed_date"]));
  const closeLead = won.filter((d) => d["lead"]).map((d) => { const l = adapter.get("CRM Lead", String(d["lead"])); return l && d["closed_date"] ? days(l["creation"], d["closed_date"]) : NaN; }).filter((x) => !isNaN(x));
  const mean = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
  const cards: [string, string, string][] = [
    ["Total leads", String(leads.length), "/crm/leads"], ["Ongoing deals", String(ongoing.length), "/crm/deals"], ["Avg. ongoing deal value", money(avg(ongoing).toFixed(0), lang), "/crm/deals"],
    ["Won deals", String(won.length), "/crm/deals"], ["Avg. won deal value", money(avg(won).toFixed(0), lang), "/crm/deals"], ["Avg. deal value", money(avg(deals).toFixed(0), lang), "/crm/deals"],
    ["Avg. time to close a lead", closeLead.length ? `${mean(closeLead).toFixed(1)} ${L("days")}` : L("No closed leads yet"), "/crm/leads"], ["Avg. time to close a deal", closeDeal.length ? `${mean(closeDeal).toFixed(1)} ${L("days")}` : L("No closed deals yet"), "/crm/deals"],
  ];
  const count = (rows: Doc[], k: (d: Doc) => string) => { const m = new Map<string, number>(); rows.forEach((r) => { const x = k(r) || L("Not set"); m.set(x, (m.get(x) ?? 0) + 1); }); return [...m.entries()].sort((a, c) => c[1] - a[1]); };
  const month = (s: unknown) => String(s ?? "").slice(0, 7);
  const trendKeys = [...new Set([...leads, ...deals].map((d) => month(d["creation"])).filter(Boolean))].sort();
  const trend = trendKeys.map((m) => [m, leads.filter((d) => month(d["creation"]) === m).length, deals.filter((d) => month(d["creation"]) === m).length, won.filter((d) => month(d["closed_date"] ?? d["creation"]) === m).length] as const);
  const fc = new Map<string, [number, number]>();
  deals.filter((d) => d["expected_closure_date"] && type(d) !== "Lost").forEach((d) => { const m = month(d["expected_closure_date"]); const p = fc.get(m) ?? [0, 0]; fc.set(m, [p[0] + val(d) * Number(d["probability"] ?? 0) / 100, p[1] + (type(d) === "Won" ? val(d) : 0)]); });
  const stages = Object.entries(st).sort((a, c) => a[1].position - c[1].position);
  const funnel: [string, number][] = [[L("Leads"), leads.length], ...stages.filter(([, s]) => s.type !== "Lost").map(([n]) => [n, deals.filter((d) => d["status"] === n).length] as [string, number])];
  const tr = (s: string) => (lang === "ar" ? CRM_AR[s] ?? s : s);
  // sparkline per card: the last six months of the card's own records
  const last6 = trendKeys.slice(-6);
  const spark: Record<string, number[]> = {
    "Total leads": last6.map((m) => leads.filter((d) => month(d["creation"]) === m).length),
    "Ongoing deals": last6.map((m) => ongoing.filter((d) => month(d["creation"]) === m).length),
    "Won deals": last6.map((m) => won.filter((d) => month(d["closed_date"] ?? d["creation"]) === m).length),
    "Avg. deal value": last6.map((m) => avg(deals.filter((d) => month(d["creation"]) === m))),
  };
  return (
    <CrmShell header={header}>
      <div className="space-y-5 p-5">
        <div className="flex flex-wrap items-end gap-2 text-sm">
          <label>{L("From")}<DateInput className="crm-input mt-1" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From date" /></label>
          <label>{L("To")}<DateInput className="crm-input mt-1" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To date" /></label>
          <label>{L("Sales user")}<select className="crm-input mt-1" value={user} onChange={(e) => setUser(e.target.value)} aria-label="Sales user"><option value="">{L("All users")}</option>{[...new Set(adapter.list("CRM Deal").map((d) => String(d["deal_owner"] ?? "")).filter(Boolean))].map((u) => <option key={u} value={u} data-no-i18n>{u}</option>)}</select></label>
          {(from || to || user) && <button className="crm-input w-auto" onClick={() => { setFrom(""); setTo(""); setUser(""); }}>{L("Clear filters")}</button>}
        </div>
        {dev && <p className="text-xs text-crm-muted">Computed locally from crm/api/dashboard.py definitions over adapter records.</p>}
        {/* Enterprise KPI cards and chart cards (Round 1 §0/§4/§5): CRM passes its figures only */}
        <CrmKpis cards={cards} spark={spark} ar={lang === "ar"} />
        <ChartRow cols={2}>
          <CrmChart title={L("Sales trend")} rows={trend.map(([m, a, c, w]) => [m, a, c, w])} series={[L("Leads"), L("Deals"), L("Won deals")]} ar={lang === "ar"} />
          <CrmChart title={`${L("Forecasted revenue")} (${lang === "ar" ? "ر.س" : "SAR"})`} rows={[...fc.entries()].sort().map(([m, [f, w]]) => [m, Math.round(f), Math.round(w)])} series={[L("Forecasted"), L("Actual")]} ar={lang === "ar"} />
          <CrmChart title={L("Funnel conversion")} rows={funnel.map(([n, c]) => [tr(n), c])} ar={lang === "ar"} funnel />
          <CrmChart title={L("Deals by ongoing & won stage")} rows={stages.filter(([, s]) => s.type !== "Lost").map(([n]) => [tr(n), deals.filter((d) => d["status"] === n).length])} ar={lang === "ar"} />
          <CrmChart title={L("Deals by stage")} rows={stages.map(([n]) => [tr(n), deals.filter((d) => d["status"] === n).length])} ar={lang === "ar"} />
          <CrmChart title={L("Lost deal reasons")} rows={count(lost, (d) => String(d["lost_reason"] ?? "")).map(([k, n]) => [tr(k), n])} ar={lang === "ar"} />
          <CrmChart title={L("Leads by source")} rows={count(leads, (d) => String(d["source"] ?? "")).map(([k, n]) => [tr(k), n])} ar={lang === "ar"} />
          <CrmChart title={L("Deals by source")} rows={count(deals, (d) => String(d["source"] ?? "")).map(([k, n]) => [tr(k), n])} ar={lang === "ar"} />
          <CrmChart title={L("Deals by territory")} rows={count(deals, (d) => String(d["territory"] ?? "")).map(([k, n]) => [tr(linkTitle("CRM Territory", k)), n])} ar={lang === "ar"} />
        </ChartRow>
      </div>
    </CrmShell>
  );
}

function CrmKpis({ cards, spark, ar }: { cards: [string, string, string][]; spark: Record<string, number[]>; ar: boolean }) {
  const { L } = useL(); const lead = useLeadRow();
  return <div className="ek-kpi-grid" data-crm-kpis><KpiSlots lead={lead}>{cards.map(([l, v, to]) => <KpiCard key={l} ar={ar} label={L(l)} value={v} spark={spark[l]}
    meta={L(to === "/crm/leads" ? "Open leads list" : "Open deals list")} attrs={{ "data-card": l }}
    Root={(rp) => <Link to={to as never} {...(rp as Record<string, unknown>)}>{rp.children}</Link>} />)}</KpiSlots></div>;
}

/** CRM chart as the Enterprise chart card: grouped columns for several series, ranked bars or a funnel for one. */
function CrmChart({ title, rows, series, ar, funnel }: { title: string; rows: (string | number)[][]; series?: string[]; ar: boolean; funnel?: boolean }) {
  const { L } = useL();
  const total = rows.reduce((s, r) => s + r.slice(1).reduce<number>((a, v) => a + Number(v), 0), 0);
  const body = !rows.length ? <p className="ek-note">{L("No records in this period")}</p>
    : series && series.length > 1 ? <GroupedColumns ar={ar} groups={rows.map((r) => ({ key: String(r[0]), label: String(r[0]) }))} series={series.map((label, i) => ({ label, values: rows.map((r) => Number(r[i + 1] ?? 0)) }))} />
    : funnel ? <Funnel ar={ar} data={rows.map((r) => ({ key: String(r[0]), label: String(r[0]), value: Number(r[1] ?? 0) }))} />
    : <RankedBars ar={ar} sort={false} data={rows.map((r) => ({ key: String(r[0]), label: String(r[0]), value: Number(r[1] ?? 0) }))} />;
  return <ChartCard title={title} sub={<><bdi data-no-i18n>{total.toLocaleString("en-US")}</bdi> {L(series && series.length > 1 ? "in all series" : "records")}</>} attrs={{ "aria-label": title }}>{body}</ChartCard>;
}
