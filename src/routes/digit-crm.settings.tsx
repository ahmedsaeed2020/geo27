import { createFileRoute } from "@tanstack/react-router";
import { Settings } from "@/plugins/digit_crm/Wave3";

export const Route = createFileRoute("/digit-crm/settings")({
  head: () => ({ meta: [
    { title: "Settings — DIGIT CRM" }, { name: "description", content: "Pipeline stages, sources, reasons and price lists." },
    { property: "og:title", content: "Settings — DIGIT CRM" }, { property: "og:description", content: "Pipeline stages, sources, reasons and price lists." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: Settings,
});
