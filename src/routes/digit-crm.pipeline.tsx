import { createFileRoute } from "@tanstack/react-router";
import { Pipeline } from "@/plugins/digit_crm/Wave2";

export const Route = createFileRoute("/digit-crm/pipeline")({
  head: () => ({ meta: [
    { title: "Pipeline — DIGIT CRM" }, { name: "description", content: "Opportunities by stage with value and weighted forecast." },
    { property: "og:title", content: "Pipeline — DIGIT CRM" }, { property: "og:description", content: "Opportunities by stage with value and weighted forecast." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  validateSearch: (s: Record<string, unknown>): { tab?: "board" | undefined } => (s["tab"] === "board" ? { tab: "board" } : {}),
  component: Page,
});
function Page() { const { tab } = Route.useSearch(); return <Pipeline tab={tab === "board" ? "board" : "analysis"} />; }
