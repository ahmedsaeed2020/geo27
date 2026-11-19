import { createFileRoute, Link } from "@tanstack/react-router";
import { adapter, useStoreVersion } from "@/lib/adapter";
import { InsightsShell } from "@/components/insights/InsightsShell";

export const Route = createFileRoute("/insights/dashboards/")({
  head: () => ({ meta: [{ title: "Dashboards — Insights · Digit Virtual Core" }, { name: "description", content: "Insights dashboards built from workbook charts." }, { property: "og:title", content: "Dashboards — Insights" }, { property: "og:description", content: "Insights dashboards built from workbook charts." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: DashboardList,
});

/** dashboard/DashboardList.vue */
function DashboardList() {
  useStoreVersion();
  const rows = adapter.list("Insights Dashboard v3");
  return (
    <InsightsShell header={<span className="text-lg font-semibold">Dashboards</span>}>
      <div className="grid gap-3 p-5 md:grid-cols-3">
        {rows.map((d) => (
          <Link key={d.name} to="/insights/dashboards/$name" params={{ name: d.name }} className="rounded-lg border border-crm-line p-4 hover:bg-crm-hover">
            <div className="font-medium">{String(d["title"])}</div>
            <div className="text-xs text-crm-muted">Workbook {String(adapter.get("Insights Workbook", String(d["workbook"]))?.["title"] ?? d["workbook"])} · {String(d["visibility"] ?? "Private")}</div>
          </Link>
        ))}
        {!rows.length && <p className="text-sm text-crm-muted">No dashboards. Create one inside a workbook.</p>}
      </div>
    </InsightsShell>
  );
}
