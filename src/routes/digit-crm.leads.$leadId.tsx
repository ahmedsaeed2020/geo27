import { createFileRoute } from "@tanstack/react-router";
import { LeadRecordPage } from "@/plugins/digit_crm/LeadRecord";

export const Route = createFileRoute("/digit-crm/leads/$leadId")({
  validateSearch: (q: Record<string, unknown>): { convert?: "1" | undefined } => (q["convert"] === "1" || q["convert"] === 1 ? { convert: "1" } : {}),
  head: () => ({ meta: [
    { title: "Lead record — DIGIT CRM" }, { name: "description", content: "Lead status path, fields, activity timeline, next step, score and conversion to a deal." },
    { property: "og:title", content: "Lead record — DIGIT CRM" }, { property: "og:description", content: "Status path, timeline, next step, score and conversion." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: function LeadRecordRoute() { const p = Route.useParams(); return <LeadRecordPage leadId={p.leadId} />; },
});
