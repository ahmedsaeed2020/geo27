import { createFileRoute } from "@tanstack/react-router";
import { LeadListPage } from "@/plugins/digit_crm/LeadList";

export const Route = createFileRoute("/digit-crm/leads/")({
  head: () => ({ meta: [
    { title: "Leads — DIGIT CRM" }, { name: "description", content: "Every lead with saved views, quick filters, status strip, score, first-response time and bulk actions." },
    { property: "og:title", content: "Leads — DIGIT CRM" }, { property: "og:description", content: "Lead list with saved views, filters, score and first-response time." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: LeadListPage,
});
