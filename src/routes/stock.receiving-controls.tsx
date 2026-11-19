import { createFileRoute } from "@tanstack/react-router";
import { ServiceRoute } from "@/components/enterprise/ServicePages";
import { ReceivingControlsPage } from "@/components/enterprise/ControlPanels";

export const Route = createFileRoute("/stock/receiving-controls")({
  head: () => ({ meta: [
    { title: "Receiving controls — DIGIT Enterprise" },
    { name: "description", content: "Landed-cost queue, putaway and slotting capacity, rejected stock and inspections waiting to be submitted." },
    { property: "og:title", content: "Receiving controls — DIGIT Enterprise" },
    { property: "og:description", content: "Landed-cost queue, putaway and slotting capacity, rejected stock and inspections waiting to be submitted." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: () => <ServiceRoute en="Receiving controls" ar="ضوابط الاستلام"><ReceivingControlsPage /></ServiceRoute>,
});
