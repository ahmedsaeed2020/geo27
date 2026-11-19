import { createFileRoute } from "@tanstack/react-router";
import { ServiceRoute } from "@/components/enterprise/ServicePages";
import { PaymentRunPage } from "@/components/enterprise/FinanceDesk";

export const Route = createFileRoute("/finance/payment-run")({
  head: () => ({ meta: [
    { title: "Supplier payment run — DIGIT Enterprise" },
    { name: "description", content: "Prepare, approve and pay supplier invoices with the Saudi bank transfer file; blocked invoices are never paid." },
    { property: "og:title", content: "Supplier payment run — DIGIT Enterprise" },
    { property: "og:description", content: "Prepare, approve and pay supplier invoices with the Saudi bank transfer file; blocked invoices are never paid." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: () => <ServiceRoute en="Supplier payment run" ar="دفعات سداد الموردين"><PaymentRunPage /></ServiceRoute>,
});
