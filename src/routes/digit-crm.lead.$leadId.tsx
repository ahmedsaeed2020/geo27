import { createFileRoute, redirect } from "@tanstack/react-router";

/** CRM C4: the lead record moved to /digit-crm/leads/<name> (a superset of the qualification page); old links keep working. */
export const Route = createFileRoute("/digit-crm/lead/$leadId")({
  beforeLoad: ({ params }) => { throw redirect({ to: "/digit-crm/leads/$leadId", params: { leadId: params.leadId }, replace: true }); },
  head: () => ({ meta: [
    { title: "Lead record — DIGIT CRM" }, { name: "description", content: "Moved to the lead record." },
    { property: "og:title", content: "Lead record — DIGIT CRM" }, { property: "og:description", content: "Moved to the lead record." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex" },
  ] }),
});
