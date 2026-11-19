import { createFileRoute } from "@tanstack/react-router";
import { ReportsCenter, validateReportSearch } from "@/plugins/digit_crm/Wave4";

export const Route = createFileRoute("/digit-crm/reports")({
  validateSearch: validateReportSearch,
  head: () => ({ meta: [
    { title: "Reports Center — DIGIT CRM" }, { name: "description", content: "Topic-scoped CRM reports with filters and drill-down to source records." },
    { property: "og:title", content: "Reports Center — DIGIT CRM" }, { property: "og:description", content: "Topic-scoped CRM reports with filters and drill-down to source records." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: function R() { return <ReportsCenter search={Route.useSearch()} />; },
});
