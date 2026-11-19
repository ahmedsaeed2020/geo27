import { createFileRoute } from "@tanstack/react-router";
import { ServiceRoute } from "@/components/enterprise/ServicePages";
import { WavePickingPage } from "@/components/enterprise/PlanningDesk";

export const Route = createFileRoute("/stock/wave-picking")({
  head: () => ({ meta: [
    { title: "Wave picking — DIGIT Enterprise" },
    { name: "description", content: "Order lines grouped into picking waves and picked once per item with a batch pick list." },
    { property: "og:title", content: "Wave picking — DIGIT Enterprise" },
    { property: "og:description", content: "Order lines grouped into picking waves and picked once per item with a batch pick list." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: () => <ServiceRoute en="Wave picking" ar="الانتقاء بالموجات"><WavePickingPage /></ServiceRoute>,
});
