import { createFileRoute } from "@tanstack/react-router";
import { ServiceRoute } from "@/components/enterprise/ServicePages";
import { SetupGuidePage } from "@/components/enterprise/SetupGuide";

export const Route = createFileRoute("/control/setup-guide")({
  head: () => ({ meta: [
    { title: "Setup guide and data completeness — DIGIT Enterprise" },
    { name: "description", content: "Go-live steps of the company and the master data each tax invoice, payment and stock move needs." },
    { property: "og:title", content: "Setup guide and data completeness — DIGIT Enterprise" },
    { property: "og:description", content: "Go-live steps of the company and the master data each tax invoice, payment and stock move needs." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: () => <ServiceRoute en="Setup guide and data completeness" ar="دليل الإعداد واكتمال البيانات"><SetupGuidePage /></ServiceRoute>,
});
