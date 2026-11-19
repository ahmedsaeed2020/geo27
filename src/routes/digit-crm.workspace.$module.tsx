import { createFileRoute, notFound } from "@tanstack/react-router";
import { CommandCenter } from "@/plugins/digit_crm/CommandCenter";
import { isModuleId, isTab, MODULES, type TabId } from "@/plugins/digit_crm/modules";

type WorkspaceSearch = { tab?: TabId | undefined; pf?: string | undefined; pt?: string | undefined; po?: string | undefined; pg?: number | undefined; pl?: number | undefined };
const date = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);
const int = (v: unknown) => { const n = Number(v); return Number.isInteger(n) && n > 0 ? n : undefined; };

export const Route = createFileRoute("/digit-crm/workspace/$module")({
  validateSearch: (s: Record<string, unknown>): WorkspaceSearch => ({
    tab: isTab(s["tab"]) && s["tab"] !== "overview" ? s["tab"] : undefined, pf: date(s["pf"]), pt: date(s["pt"]),
    po: typeof s["po"] === "string" && s["po"] ? s["po"] : undefined, pg: int(s["pg"]), pl: int(s["pl"]),
  }),
  beforeLoad: ({ params }) => { if (!isModuleId(params.module) || params.module === "home") throw notFound(); },
  head: ({ params }) => {
    const m = isModuleId(params.module) ? MODULES[params.module] : undefined;
    const title = m ? `${m.title} — DIGIT CRM` : "Workspace — DIGIT CRM";
    const description = m ? `${m.question} Live figures from CRM records; every figure opens the records it counts.` : "DIGIT CRM module workspace.";
    return { meta: [
      { title }, { name: "description", content: description },
      { property: "og:title", content: title }, { property: "og:description", content: description },
      { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
    ] };
  },
  component: Page,
});

function Page() {
  const { module } = Route.useParams();
  return isModuleId(module) ? <CommandCenter key={module} module={module} /> : null;
}
