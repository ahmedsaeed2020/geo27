import { createFileRoute } from "@tanstack/react-router";
import { Customer360 } from "@/plugins/digit_crm/Wave2";

export const Route = createFileRoute("/digit-crm/customers/$org")({
  head: () => ({ meta: [
    { title: "Customer 360 — DIGIT CRM" }, { name: "description", content: "One company across CRM and ERP documents." },
    { property: "og:title", content: "Customer 360 — DIGIT CRM" }, { property: "og:description", content: "One company across CRM and ERP documents." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: function R() { const p = Route.useParams(); return <Customer360 org={p.org} />; },
});
