import { createFileRoute } from "@tanstack/react-router";
import { ServiceRoute } from "@/components/enterprise/ServicePages";
import { RecurringPage } from "@/components/enterprise/FinanceDesk";

export const Route = createFileRoute("/finance/recurring")({
  head: () => ({ meta: [
    { title: "Recurring documents — DIGIT Enterprise" },
    { name: "description", content: "Monthly journals, contract orders and repeat invoices created on schedule." },
    { property: "og:title", content: "Recurring documents — DIGIT Enterprise" },
    { property: "og:description", content: "Monthly journals, contract orders and repeat invoices created on schedule." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: () => <ServiceRoute en="Recurring documents" ar="المستندات المتكررة"><RecurringPage /></ServiceRoute>,
});
