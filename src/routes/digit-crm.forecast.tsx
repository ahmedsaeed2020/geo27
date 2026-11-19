import { createFileRoute } from "@tanstack/react-router";
import { Forecast } from "@/plugins/digit_crm/Wave5";

import { validateForecastSearch } from "@/plugins/digit_crm/screenSearch";

export const Route = createFileRoute("/digit-crm/forecast")({
  validateSearch: validateForecastSearch,
  head: () => ({ meta: [
    { title: "Forecast — DIGIT CRM" }, { name: "description", content: "Open opportunities by expected closure month." },
    { property: "og:title", content: "Forecast — DIGIT CRM" }, { property: "og:description", content: "Open opportunities by expected closure month." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: function Screen() { return <Forecast search={Route.useSearch()} />; },
});
