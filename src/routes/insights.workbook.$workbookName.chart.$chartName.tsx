import { createFileRoute } from "@tanstack/react-router";
import { adapter } from "@/lib/adapter";
import { ChartBuilder } from "@/components/insights/ChartBuilder";

export const Route = createFileRoute("/insights/workbook/$workbookName/chart/$chartName")({
  head: () => ({ meta: [{ title: "Chart — Insights Workbook" }, { name: "description", content: "Configure an Insights chart." }, { property: "og:title", content: "Insights Chart" }, { property: "og:description", content: "Configure an Insights chart." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: () => { const { chartName } = Route.useParams(); const c = adapter.get("Insights Chart v3", chartName); return c ? <ChartBuilder key={chartName} chart={c} /> : <p className="p-6 text-sm">Chart not found.</p>; },
});
