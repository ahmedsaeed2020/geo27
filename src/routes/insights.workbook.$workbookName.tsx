import { createFileRoute, Link, Outlet, useNavigate } from "@tanstack/react-router";
import { adapter, useStoreVersion } from "@/lib/adapter";
import { useInsightsReady } from "@/components/insights/InsightsShell";
import { DEMO } from "@/lib/insights";

export const Route = createFileRoute("/insights/workbook/$workbookName")({
  head: () => ({ meta: [{ title: "Workbook — Insights · Digit Virtual Core" }, { name: "description", content: "Edit Insights queries, charts and dashboards in a workbook." }, { property: "og:title", content: "Insights Workbook" }, { property: "og:description", content: "Edit Insights queries, charts and dashboards in a workbook." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: Workbook,
});

/** workbook/Workbook.vue + WorkbookSidebar.vue (hideSidebar: the app sidebar is replaced by the workbook sidebar). */
function Workbook() {
  useStoreVersion();
  const ready = useInsightsReady();
  const { workbookName: wb } = Route.useParams();
  const nav = useNavigate();
  const w = adapter.get("Insights Workbook", wb);
  const of = (dt: string) => adapter.list(dt).filter((x) => x["workbook"] === wb).sort((a, b) => Number(a["sort_order"] ?? 0) - Number(b["sort_order"] ?? 0));
  const queries = of("Insights Query v3"), charts = of("Insights Chart v3"), dashes = of("Insights Dashboard v3");
  const id = () => Math.random().toString(36).slice(2, 12);
  const newQuery = () => { const n = id(); adapter.insertDoc("Insights Query v3", { name: n, title: `Query ${queries.length + 1}`, workbook: wb, operations: JSON.stringify([{ type: "source", table: { type: "table", data_source: DEMO, table_name: "orders" } }]), sort_order: queries.length, use_live_connection: 1 }); nav({ to: "/insights/workbook/$workbookName/query/$queryName", params: { workbookName: wb, queryName: n } }); };
  const newChart = () => { const n = id(); adapter.insertDoc("Insights Chart v3", { name: n, title: `Chart ${charts.length + 1}`, workbook: wb, query: queries[0]?.name ?? "", chart_type: "Bar", config: "{}", visibility: "Private", sort_order: charts.length }); nav({ to: "/insights/workbook/$workbookName/chart/$chartName", params: { workbookName: wb, chartName: n } }); };
  const newDash = () => { const n = id(); adapter.insertDoc("Insights Dashboard v3", { name: n, title: `Dashboard ${dashes.length + 1}`, workbook: wb, items: "[]", visibility: "Private" }); nav({ to: "/insights/workbook/$workbookName/dashboard/$dashboardName", params: { workbookName: wb, dashboardName: n } }); };
  const sec = (label: string, rows: typeof queries, to: string, key: string, add: () => void) => (
    <div className="mb-3"><div className="flex items-center justify-between px-2 text-xs font-medium text-crm-muted">{label}<button aria-label={`New ${label}`} onClick={add}>+</button></div>
      {rows.map((r) => <Link key={r.name} to={to} params={{ workbookName: wb, [key]: r.name }} className="block truncate rounded px-2 py-1 text-sm hover:bg-crm-hover" activeProps={{ className: "bg-crm-surface shadow-sm" }}>{String(r["title"])}</Link>)}</div>
  );
  return (
    <div className="flex h-screen bg-crm-surface text-crm-ink">
      <aside className="w-56 shrink-0 overflow-auto border-e border-crm-line bg-crm-sidebar p-2">
        <Link to="/insights/workbook" className="mb-2 block px-2 text-xs text-crm-muted">← Workbooks</Link>
        {ready && w ? <>
          <input aria-label="Workbook title" className="crm-input mb-3 font-semibold" defaultValue={String(w["title"])} onBlur={(e) => adapter.update("Insights Workbook", wb, { title: e.target.value })} />
          {sec("Queries", queries, "/insights/workbook/$workbookName/query/$queryName", "queryName", newQuery)}
          {sec("Charts", charts, "/insights/workbook/$workbookName/chart/$chartName", "chartName", newChart)}
          {sec("Dashboards", dashes, "/insights/workbook/$workbookName/dashboard/$dashboardName", "dashboardName", newDash)}
        </> : <p className="px-2 text-sm text-crm-muted">{ready ? "Workbook not found." : "Loading…"}</p>}
      </aside>
      <main className="min-w-0 flex-1 overflow-hidden">{ready && w && <Outlet />}</main>
    </div>
  );
}
