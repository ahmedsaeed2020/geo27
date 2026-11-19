import { createFileRoute } from "@tanstack/react-router";
import { CustomersList } from "@/plugins/digit_crm/Wave2";

export const Route = createFileRoute("/digit-crm/customers/")({
  head: () => ({ meta: [
    { title: "Customer 360 — DIGIT CRM" }, { name: "description", content: "Companies with opportunities, leads and ERP documents." },
    { property: "og:title", content: "Customer 360 — DIGIT CRM" }, { property: "og:description", content: "Companies with opportunities, leads and ERP documents." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: CustomersList,
});
