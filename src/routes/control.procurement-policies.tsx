import { createFileRoute } from "@tanstack/react-router";
import { ServiceRoute } from "@/components/enterprise/ServicePages";
import { ProcurementPoliciesPage } from "@/components/enterprise/OpsDesk";

export const Route = createFileRoute("/control/procurement-policies")({
  head: () => ({ meta: [
    { title: "Procurement policies — DIGIT Enterprise" },
    { name: "description", content: "What may be bought, from whom and at what catalog price, by item group — checked on every request and purchase order." },
    { property: "og:title", content: "Procurement policies — DIGIT Enterprise" },
    { property: "og:description", content: "What may be bought, from whom and at what catalog price, by item group — checked on every request and purchase order." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: () => <ServiceRoute en="Procurement policies" ar="سياسات الشراء"><ProcurementPoliciesPage /></ServiceRoute>,
});
