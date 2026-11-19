import { createFileRoute } from "@tanstack/react-router";
import { ServiceRoute } from "@/components/enterprise/ServicePages";
import { DemandForecastPage } from "@/components/enterprise/PlanningDesk";

export const Route = createFileRoute("/stock/demand-forecast")({
  head: () => ({ meta: [
    { title: "Demand forecast — DIGIT Enterprise" },
    { name: "description", content: "Explainable demand forecast, safety stock and reorder suggestions turned into material requests." },
    { property: "og:title", content: "Demand forecast — DIGIT Enterprise" },
    { property: "og:description", content: "Explainable demand forecast, safety stock and reorder suggestions turned into material requests." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: () => <ServiceRoute en="Demand forecast" ar="التنبؤ بالطلب"><DemandForecastPage /></ServiceRoute>,
});
