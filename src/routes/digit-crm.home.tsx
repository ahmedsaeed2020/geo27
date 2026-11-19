import { redirect, createFileRoute } from "@tanstack/react-router";
import { CommandCenter } from "@/plugins/digit_crm/CommandCenter";

export const Route = createFileRoute("/digit-crm/home")({
  head: () => ({ meta: [
    { title: "CRM Home — DIGIT CRM" }, { name: "description", content: "Daily priorities, follow-ups, pipeline, targets and exceptions from CRM records." },
    { property: "og:title", content: "CRM Home — DIGIT CRM" }, { property: "og:description", content: "Daily priorities, follow-ups, pipeline, targets and exceptions from CRM records." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: Page,
});

function Page() { return <CommandCenter module="home" />; }
