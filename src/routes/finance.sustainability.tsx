import { createFileRoute } from "@tanstack/react-router";
import { ServiceRoute } from "@/components/enterprise/ServicePages";
import { SustainabilityPage } from "@/components/enterprise/PlanningDesk";

export const Route = createFileRoute("/finance/sustainability")({
  head: () => ({ meta: [
    { title: "Sustainability & emissions — DIGIT Enterprise" },
    { name: "description", content: "Estimated emissions from purchases and expenses by scope, month, source and supplier, with factor coverage." },
    { property: "og:title", content: "Sustainability & emissions — DIGIT Enterprise" },
    { property: "og:description", content: "Estimated emissions from purchases and expenses by scope, month, source and supplier, with factor coverage." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: () => <ServiceRoute en="Sustainability & emissions" ar="الاستدامة والانبعاثات"><SustainabilityPage /></ServiceRoute>,
});
