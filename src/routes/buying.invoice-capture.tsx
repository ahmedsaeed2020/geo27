import { createFileRoute } from "@tanstack/react-router";
import { ServiceRoute } from "@/components/enterprise/ServicePages";
import { InvoiceCapturePage } from "@/components/enterprise/TradeAssist";

export const Route = createFileRoute("/buying/invoice-capture")({
  head: () => ({ meta: [
    { title: "Invoice capture — DIGIT Enterprise" },
    { name: "description", content: "Read supplier e-invoices and scanned invoices, match them to open purchase orders and prepare the draft invoice." },
    { property: "og:title", content: "Invoice capture — DIGIT Enterprise" },
    { property: "og:description", content: "Read supplier e-invoices and scanned invoices, match them to open purchase orders and prepare the draft invoice." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: () => <ServiceRoute en="Invoice capture" ar="التقاط فواتير الموردين"><InvoiceCapturePage /></ServiceRoute>,
});
