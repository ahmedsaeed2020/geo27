import { createFileRoute } from "@tanstack/react-router";
import { adapter, useStoreVersion } from "@/lib/adapter";
import { useInsightsReady } from "@/components/insights/InsightsShell";
import { DashboardGrid } from "@/components/insights/DashboardGrid";

export const Route = createFileRoute("/insights/shared/dashboard/$dashboardName")({
  head: () => ({ meta: [{ title: "Shared dashboard — Insights" }, { name: "description", content: "Read-only shared Insights dashboard." }, { property: "og:title", content: "Shared Insights Dashboard" }, { property: "og:description", content: "Read-only shared Insights dashboard." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: Shared,
});

/** dashboard/SharedDashboard.vue (guest view, no sidebar). Public access checks are server-side. */
function Shared() {
  useStoreVersion();
  const ready = useInsightsReady();
  const { dashboardName } = Route.useParams();
  const d = ready ? adapter.get("Insights Dashboard v3", dashboardName) : undefined;
  return <div className="min-h-screen bg-crm-surface p-5 text-crm-ink"><h1 className="mb-3 text-lg font-semibold">{String(d?.["title"] ?? "")}</h1>{d ? <DashboardGrid dash={d} /> : <p className="text-sm text-crm-muted">{ready ? "Dashboard not found." : "Loading…"}</p>}<p className="mt-4 text-[10px] text-crm-muted">Shared view · public visibility is enforced by the server in source.</p></div>;
}
