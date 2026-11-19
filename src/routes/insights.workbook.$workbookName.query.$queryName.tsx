import { createFileRoute } from "@tanstack/react-router";
import { adapter } from "@/lib/adapter";
import { QueryEditor } from "@/components/insights/QueryEditor";

export const Route = createFileRoute("/insights/workbook/$workbookName/query/$queryName")({
  head: () => ({ meta: [{ title: "Query — Insights Workbook" }, { name: "description", content: "Build an Insights query step by step." }, { property: "og:title", content: "Insights Query" }, { property: "og:description", content: "Build an Insights query step by step." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: () => { const { queryName } = Route.useParams(); const q = adapter.get("Insights Query v3", queryName); return q ? <QueryEditor key={queryName} query={q} /> : <p className="p-6 text-sm">Query not found.</p>; },
});
