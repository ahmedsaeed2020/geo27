import { createFileRoute } from "@tanstack/react-router";
import { Manager } from "@/plugins/digit_crm/CrmApp";

export const Route = createFileRoute("/digit-crm/manager")({
  head: () => ({ meta: [
    { title: "Manager Workbench — DIGIT CRM" },
    { name: "description", content: "Unassigned leads and overdue follow-ups by owner, with assignment actions." },
    { property: "og:title", content: "Manager Workbench — DIGIT CRM" },
    { property: "og:description", content: "Exception-first sales manager review." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: Manager,
});
