import { createFileRoute } from "@tanstack/react-router";
import { CrmBoards, type BoardSearch } from "@/plugins/digit_crm/Boards";
import { BOARD_IDS, type BoardId } from "@/plugins/digit_crm/wf10";

const date = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);
export const Route = createFileRoute("/digit-crm/dashboards")({
  validateSearch: (q: Record<string, unknown>): BoardSearch => {
    const out: BoardSearch = {};
    if (BOARD_IDS.includes(q["board"] as BoardId)) out.board = q["board"] as BoardId;
    const from = date(q["from"]), to = date(q["to"]), owner = typeof q["owner"] === "string" && q["owner"] ? q["owner"] : undefined;
    if (from) out.from = from; if (to) out.to = to; if (owner) out.owner = owner;
    return out;
  },
  head: () => ({ meta: [
    { title: "CRM Dashboards — DIGIT CRM" }, { name: "description", content: "Ten role-based CRM boards computed live from current records." },
    { property: "og:title", content: "CRM Dashboards — DIGIT CRM" }, { property: "og:description", content: "Ten role-based CRM boards computed live from current records." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: function R() { const s = Route.useSearch(); return <CrmBoards board={s.board ?? "exec"} search={s} />; },
});
