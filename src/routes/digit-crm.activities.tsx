import { createFileRoute } from "@tanstack/react-router";
import { type ActivitySearch } from "@/plugins/digit_crm/Wave2";
import { ActivityListPage } from "@/plugins/digit_crm/ActivityList";

export const Route = createFileRoute("/digit-crm/activities")({
  validateSearch: (q: Record<string, unknown>): ActivitySearch => ({
    kind: q["kind"] === "Task" || q["kind"] === "Note" || q["kind"] === "Call" ? q["kind"] : undefined,
    q: typeof q["q"] === "string" && q["q"] ? q["q"] : undefined,
    owner: typeof q["owner"] === "string" && q["owner"] ? q["owner"] : undefined,
    ...(typeof q["view"] === "string" && q["view"] ? { view: q["view"] } : {}), ...(typeof q["strip"] === "string" && q["strip"] ? { strip: q["strip"] } : {}),
  }),
  head: () => ({ meta: [
    { title: "Activities — DIGIT CRM" }, { name: "description", content: "Tasks, notes and calls across leads and opportunities." },
    { property: "og:title", content: "Activities — DIGIT CRM" }, { property: "og:description", content: "Tasks, notes and calls across leads and opportunities." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: function R() { const q = Route.useSearch(); return <ActivityListPage kind={q.kind} />; },
});
