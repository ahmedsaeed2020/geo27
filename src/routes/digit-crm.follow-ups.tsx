import { createFileRoute } from "@tanstack/react-router";
import { FollowUps, type FollowSearch } from "@/plugins/digit_crm/CrmApp";

const TABS = ["today", "overdue", "upcoming", "exceptions", "deals"] as const;
export const Route = createFileRoute("/digit-crm/follow-ups")({
  validateSearch: (q: Record<string, unknown>): FollowSearch => ({
    tab: TABS.includes(q["tab"] as never) ? (q["tab"] as FollowSearch["tab"]) : undefined,
    owner: typeof q["owner"] === "string" && q["owner"] ? q["owner"] : undefined,
    pg: Number(q["pg"]) > 1 ? Math.floor(Number(q["pg"])) : undefined,
    pl: [20, 100].includes(Number(q["pl"])) ? Number(q["pl"]) : undefined,
  }),
  head: () => ({ meta: [
    { title: "Follow-up Center — DIGIT CRM" },
    { name: "description", content: "Due today, overdue, upcoming and exception follow-ups on CRM leads." },
    { property: "og:title", content: "Follow-up Center — DIGIT CRM" },
    { property: "og:description", content: "One list for every open lead follow-up." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: () => <FollowUps search={Route.useSearch()} />,
});
