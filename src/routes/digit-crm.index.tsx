import { redirect, createFileRoute } from "@tanstack/react-router";
import { MyWork } from "@/plugins/digit_crm/CrmApp";

export const Route = createFileRoute("/digit-crm/")({
  beforeLoad: () => { throw redirect({ href: "/admin/crm" }); },
  head: () => ({ meta: [
    { title: "My Work — DIGIT CRM" },
    { name: "description", content: "Ranked overdue, due-today and upcoming lead follow-ups for the signed-in sales user." },
    { property: "og:title", content: "My Work — DIGIT CRM" },
    { property: "og:description", content: "Daily lead follow-up queue on native CRM records." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: MyWork,
});
