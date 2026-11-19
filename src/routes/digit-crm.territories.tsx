import { createFileRoute } from "@tanstack/react-router";
import { Territories } from "@/plugins/digit_crm/Wave6";

import { validateDirectorySearch } from "@/plugins/digit_crm/screenSearch";

export const Route = createFileRoute("/digit-crm/territories")({
  validateSearch: validateDirectorySearch,
  head: () => ({ meta: [
    { title: "Territories — DIGIT CRM" }, { name: "description", content: "Coverage by territory — leads, open deals and pipeline per region." },
    { property: "og:title", content: "Territories — DIGIT CRM" }, { property: "og:description", content: "Coverage by territory — leads, open deals and pipeline per region." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: function Screen() { return <Territories search={Route.useSearch()} />; },
});
