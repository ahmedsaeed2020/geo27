import { createFileRoute, redirect } from "@tanstack/react-router";

/** CRM C4: the deal record moved to /digit-crm/deals/<name> (a superset of the opportunity page); old links keep working. */
export const Route = createFileRoute("/digit-crm/deal/$dealId")({
  beforeLoad: ({ params }) => { throw redirect({ to: "/digit-crm/deals/$dealId", params: { dealId: params.dealId }, replace: true }); },
  head: () => ({ meta: [
    { title: "Deal record — DIGIT CRM" }, { name: "description", content: "Moved to the deal record." },
    { property: "og:title", content: "Deal record — DIGIT CRM" }, { property: "og:description", content: "Moved to the deal record." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex" },
  ] }),
});
