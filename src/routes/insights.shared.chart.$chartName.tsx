import { createFileRoute } from "@tanstack/react-router";
import { adapter } from "@/lib/adapter";
import { useInsightsReady } from "@/components/insights/InsightsShell";
import { ChartView } from "@/components/insights/ChartView";

export const Route = createFileRoute("/insights/shared/chart/$chartName")({
  head: () => ({ meta: [{ title: "Shared chart — Insights" }, { name: "description", content: "Read-only shared Insights chart." }, { property: "og:title", content: "Shared Insights Chart" }, { property: "og:description", content: "Read-only shared Insights chart." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: () => {
    const ready = useInsightsReady();
    const { chartName } = Route.useParams();
    const c = ready ? adapter.get("Insights Chart v3", chartName) : undefined;
    return <div className="min-h-screen bg-crm-surface p-5 text-crm-ink">{c ? <div className="h-80"><ChartView chart={c} /></div> : <p className="text-sm text-crm-muted">{ready ? "Chart not found." : "Loading…"}</p>}</div>;
  },
});
