import { createFileRoute } from "@tanstack/react-router";
import { SalesTeams } from "@/plugins/digit_crm/Wave6";

import { validateDirectorySearch } from "@/plugins/digit_crm/screenSearch";

export const Route = createFileRoute("/digit-crm/sales-teams")({
  validateSearch: validateDirectorySearch,
  head: () => ({ meta: [
    { title: "Sales Teams — DIGIT CRM" }, { name: "description", content: "Sales person hierarchy with pipeline, wins and target achievement." },
    { property: "og:title", content: "Sales Teams — DIGIT CRM" }, { property: "og:description", content: "Sales person hierarchy with pipeline, wins and target achievement." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: function Screen() { return <SalesTeams search={Route.useSearch()} />; },
});
