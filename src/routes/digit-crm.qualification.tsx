import { createFileRoute } from "@tanstack/react-router";
import { QualificationPage } from "@/plugins/digit_crm/LeadBoard";

export const Route = createFileRoute("/digit-crm/qualification")({
  head: () => ({ meta: [
    { title: "Qualification & Conversion — DIGIT CRM" }, { name: "description", content: "Lead path board with score, first-response time, next step and the qualification funnel." },
    { property: "og:title", content: "Qualification & Conversion — DIGIT CRM" }, { property: "og:description", content: "Lead path board with score, first-response time, next step and the qualification funnel." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: QualificationPage,
});
