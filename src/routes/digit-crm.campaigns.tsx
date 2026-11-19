import { createFileRoute } from "@tanstack/react-router";
import { CampaignResults } from "@/plugins/digit_crm/Wave3";

export const Route = createFileRoute("/digit-crm/campaigns")({
  head: () => ({ meta: [
    { title: "Campaign Results — DIGIT CRM" }, { name: "description", content: "Leads, pipeline and won value by source." },
    { property: "og:title", content: "Campaign Results — DIGIT CRM" }, { property: "og:description", content: "Leads, pipeline and won value by source." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: CampaignResults,
});
