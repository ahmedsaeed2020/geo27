import { createFileRoute } from "@tanstack/react-router";
import { LeadFullCreatePage } from "@/plugins/digit_crm/LeadFullCreate";

export const Route = createFileRoute("/digit-crm/leads/new")({
  validateSearch: (q: Record<string, unknown>): { draft?: string | undefined } => ({ draft: typeof q["draft"] === "string" && q["draft"] ? q["draft"] : undefined }),
  head: () => ({ meta: [
    { title: "New lead — DIGIT CRM" }, { name: "description", content: "Designed full Create page for a lead with editable person, contact, company, qualification and consent fields." },
    { property: "og:title", content: "New lead — DIGIT CRM" }, { property: "og:description", content: "Full lead Create page with live validation and duplicate checks." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: function LeadFullCreateRoute() { const q = Route.useSearch(); return <LeadFullCreatePage draft={q.draft} />; },
});
