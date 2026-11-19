import { createFileRoute } from "@tanstack/react-router";
import { Automation } from "@/plugins/digit_crm/Wave3";

export const Route = createFileRoute("/digit-crm/automation")({
  head: () => ({ meta: [
    { title: "Automation — DIGIT CRM" }, { name: "description", content: "Assignment, alerts and response-time rules." },
    { property: "og:title", content: "Automation — DIGIT CRM" }, { property: "og:description", content: "Assignment, alerts and response-time rules." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: Automation,
});
