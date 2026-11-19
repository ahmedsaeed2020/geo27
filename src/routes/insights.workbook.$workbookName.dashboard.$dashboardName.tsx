import { createFileRoute, Link } from "@tanstack/react-router";
import { adapter } from "@/lib/adapter";
import { DashboardGrid } from "@/components/insights/DashboardGrid";

export const Route = createFileRoute("/insights/workbook/$workbookName/dashboard/$dashboardName")({
  head: () => ({ meta: [{ title: "Dashboard builder — Insights Workbook" }, { name: "description", content: "Arrange charts, filters and text on an Insights dashboard." }, { property: "og:title", content: "Insights Dashboard Builder" }, { property: "og:description", content: "Arrange charts, filters and text on an Insights dashboard." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: () => {
    const { dashboardName } = Route.useParams();
    const d = adapter.get("Insights Dashboard v3", dashboardName);
    if (!d) return <p className="p-6 text-sm">Dashboard not found.</p>;
    return (
      <div className="h-full overflow-auto p-4">
        <div className="mb-3 flex items-center gap-2">
          <input aria-label="Dashboard title" className="crm-input max-w-64 font-medium" defaultValue={String(d["title"])} onBlur={(e) => adapter.update("Insights Dashboard v3", d.name, { title: e.target.value })} />
          <Link to="/insights/dashboards/$name" params={{ name: d.name }} className="text-xs text-crm-muted">Open view →</Link>
        </div>
        <DashboardGrid key={dashboardName} dash={d} edit />
      </div>
    );
  },
});
