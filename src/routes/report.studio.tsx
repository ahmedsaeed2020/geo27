import { createFileRoute } from "@tanstack/react-router";
import { ServiceRoute } from "@/components/enterprise/ServicePages";
import { QueryStudioPage } from "@/components/enterprise/PlanningDesk";

export const Route = createFileRoute("/report/studio")({
  head: () => ({ meta: [
    { title: "Query studio — DIGIT Enterprise" },
    { name: "description", content: "Pick records, fields, linked fields, filters and totals; see a table and chart and save it as a report." },
    { property: "og:title", content: "Query studio — DIGIT Enterprise" },
    { property: "og:description", content: "Pick records, fields, linked fields, filters and totals; see a table and chart and save it as a report." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: () => <ServiceRoute en="Query studio" ar="استوديو الاستعلامات"><QueryStudioPage /></ServiceRoute>,
});
