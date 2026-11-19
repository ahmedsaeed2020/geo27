import { createFileRoute } from "@tanstack/react-router";
import { ServiceRoute } from "@/components/enterprise/ServicePages";
import { NettingPage } from "@/components/enterprise/FinanceDesk";

export const Route = createFileRoute("/finance/netting")({
  head: () => ({ meta: [
    { title: "Customer and supplier netting — DIGIT Enterprise" },
    { name: "description", content: "Offset open receivables and payables of parties that are both customer and supplier." },
    { property: "og:title", content: "Customer and supplier netting — DIGIT Enterprise" },
    { property: "og:description", content: "Offset open receivables and payables of parties that are both customer and supplier." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: () => <ServiceRoute en="Customer and supplier netting" ar="مقاصة العميل والمورد"><NettingPage /></ServiceRoute>,
});
