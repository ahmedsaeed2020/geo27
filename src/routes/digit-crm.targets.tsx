import { createFileRoute } from "@tanstack/react-router";
import { Targets } from "@/plugins/digit_crm/Wave3";

export const Route = createFileRoute("/digit-crm/targets")({
  head: () => ({ meta: [
    { title: "Targets — DIGIT CRM" }, { name: "description", content: "Sales targets per Sales Person and fiscal year." },
    { property: "og:title", content: "Targets — DIGIT CRM" }, { property: "og:description", content: "Sales targets per Sales Person and fiscal year." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: Targets,
});
