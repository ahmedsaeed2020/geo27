import { createFileRoute } from "@tanstack/react-router";
import { ServiceRoute } from "@/components/enterprise/ServicePages";
import { EInvoicingPage } from "@/components/enterprise/SaudiTax";

export const Route = createFileRoute("/tax/e-invoicing")({
  head: () => ({ meta: [
    { title: "ZATCA e-invoicing — DIGIT Enterprise" },
    { name: "description", content: "Sales invoices with their ZATCA status, QR checks and hand-over to the e-invoicing provider." },
    { property: "og:title", content: "ZATCA e-invoicing — DIGIT Enterprise" },
    { property: "og:description", content: "Sales invoices with their ZATCA status, QR checks and hand-over to the e-invoicing provider." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: () => <ServiceRoute en="ZATCA e-invoicing" ar="الفوترة الإلكترونية"><EInvoicingPage /></ServiceRoute>,
});
