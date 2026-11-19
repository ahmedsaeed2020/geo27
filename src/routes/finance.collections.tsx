import { createFileRoute } from "@tanstack/react-router";
import { ServiceRoute } from "@/components/enterprise/ServicePages";
import { CollectionsPage } from "@/components/enterprise/FinanceDesk";

export const Route = createFileRoute("/finance/collections")({
  head: () => ({ meta: [
    { title: "Collections — DIGIT Enterprise" },
    { name: "description", content: "Overdue invoices with reminder levels, promises to pay, disputes, write-off reasons and customer statements." },
    { property: "og:title", content: "Collections — DIGIT Enterprise" },
    { property: "og:description", content: "Overdue invoices with reminder levels, promises to pay, disputes, write-off reasons and customer statements." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: () => <ServiceRoute en="Collections" ar="التحصيل"><CollectionsPage /></ServiceRoute>,
});
