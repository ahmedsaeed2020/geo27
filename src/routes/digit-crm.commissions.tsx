import { createFileRoute } from "@tanstack/react-router";
import { Commissions } from "@/plugins/digit_crm/Wave3";

export const Route = createFileRoute("/digit-crm/commissions")({
  head: () => ({ meta: [
    { title: "Commissions — DIGIT CRM" }, { name: "description", content: "Commission setup status; blocked until rules are approved." },
    { property: "og:title", content: "Commissions — DIGIT CRM" }, { property: "og:description", content: "Commission setup status; blocked until rules are approved." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: Commissions,
});
