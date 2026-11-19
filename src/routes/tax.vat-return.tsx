import { createFileRoute } from "@tanstack/react-router";
import { ServiceRoute } from "@/components/enterprise/ServicePages";
import { VatReturnPage } from "@/components/enterprise/SaudiTax";

export const Route = createFileRoute("/tax/vat-return")({
  head: () => ({ meta: [
    { title: "VAT return — DIGIT Enterprise" },
    { name: "description", content: "The ZATCA VAT return boxes for sales and purchases, prepared from submitted invoices, with export." },
    { property: "og:title", content: "VAT return — DIGIT Enterprise" },
    { property: "og:description", content: "The ZATCA VAT return boxes for sales and purchases, prepared from submitted invoices, with export." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: () => <ServiceRoute en="VAT return" ar="إقرار ضريبة القيمة المضافة"><VatReturnPage /></ServiceRoute>,
});
