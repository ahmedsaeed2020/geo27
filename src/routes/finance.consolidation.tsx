import { createFileRoute } from "@tanstack/react-router";
import { ServiceRoute } from "@/components/enterprise/ServicePages";
import { ConsolidationPage } from "@/components/enterprise/FinanceDesk";

export const Route = createFileRoute("/finance/consolidation")({
  head: () => ({ meta: [
    { title: "Group consolidation — DIGIT Enterprise" },
    { name: "description", content: "Consolidated trial balance across group companies with currency translation and intercompany elimination." },
    { property: "og:title", content: "Group consolidation — DIGIT Enterprise" },
    { property: "og:description", content: "Consolidated trial balance across group companies with currency translation and intercompany elimination." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: () => <ServiceRoute en="Group consolidation" ar="التوحيد المالي للمجموعة"><ConsolidationPage /></ServiceRoute>,
});
