import { createFileRoute } from "@tanstack/react-router";
import { DealRecordPage } from "@/plugins/digit_crm/DealRecord";

export const Route = createFileRoute("/digit-crm/deals/$dealId")({
  head: () => ({ meta: [
    { title: "Deal record — DIGIT CRM" }, { name: "description", content: "Deal stage path with requirements, summary, products with VAT, buying committee, documents chain and timeline." },
    { property: "og:title", content: "Deal record — DIGIT CRM" }, { property: "og:description", content: "Stage path, summary, products, buying committee and documents chain." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: function DealRecordRoute() { const p = Route.useParams(); return <DealRecordPage dealId={p.dealId} />; },
});
