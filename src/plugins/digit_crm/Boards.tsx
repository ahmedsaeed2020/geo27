import { Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";
import { CrmFrame } from "./CrmApp";
import { BOARD_IDS, buildBoard, filterActive, type BoardFilter, type BoardId, type Widget } from "./wf10";
import { useLang } from "@/i18n";
import { useSettings } from "@/lib/userSettings";
import { canPublishTeam, publishTeam, resetPersonal, resolveBoardLayout, savePersonal } from "./boardLayout";
import { FilterBar, LayoutEditor, LayoutSourceChip, URGENT, WidgetCard } from "./WidgetKit";
import { useStoreVersion } from "@/lib/adapter";
import { BOARD_GROUPS, BOARD_INFO } from "./modules";

const BOARD_LABEL: Record<BoardId, string> = { exec: "Executive", mgr: "Sales Manager", rep: "Salesperson", lead: "Lead Acquisition", pipe: "Pipeline", act: "Activity & Follow-up", fcb: "Forecast", health: "Customer Health", comm: "Communication", ops: "Operations Exceptions" };

/** System default composition (presentation only: widget formulas and IDs remain in wf10). */
const ORDER: Record<BoardId, number[]> = {
  exec: [1, 2, 4, 6, 7, 5, 3, 8], mgr: [7, 3, 2, 4, 1, 6, 5, 8], rep: [2, 1, 3, 5, 6, 4, 7, 8],
  lead: [4, 5, 1, 6, 2, 3, 8, 7], pipe: [7, 1, 2, 3, 5, 4, 8, 6], act: [1, 5, 4, 7, 2, 3, 8, 6],
  fcb: [1, 2, 4, 6, 3, 8, 5, 7], health: [4, 5, 6, 1, 2, 3, 7, 8], comm: [6, 7, 3, 1, 2, 4, 5, 8], ops: [2, 8, 1, 3, 5, 6, 4, 7],
};
/** Default order: composition order with dependency-blocked widgets last, so they never interrupt the review. */
export function defaultBoardOrder(board: BoardId, widgets: Widget[]): string[] {
  const byIdx = new Map(widgets.map((w, i) => [i + 1, w]));
  const ordered = ORDER[board].flatMap((i) => { const w = byIdx.get(i); return w ? [w] : []; });
  return [...ordered.filter((w) => w.kind !== "blocked"), ...ordered.filter((w) => w.kind === "blocked")].map((w) => w.id);
}
export type BoardSearch = { board?: BoardId; from?: string; to?: string; owner?: string };

export function CrmBoards({ board, search }: { board: BoardId; search: BoardSearch }) {
  const lang = useLang();
  const nav = useNavigate();
  useSettings(); useStoreVersion();
  const [editing, setEditing] = useState(false);
  const f: BoardFilter = { from: search.from, to: search.to, owner: search.owner };
  const setF = (x: BoardFilter) => void nav({ to: "/digit-crm/dashboards", search: { board, ...(x.from ? { from: x.from } : {}), ...(x.to ? { to: x.to } : {}), ...(x.owner ? { owner: x.owner } : {}) } as never, replace: true });
  const keep = (id: BoardId) => ({ board: id, ...(f.from ? { from: f.from } : {}), ...(f.to ? { to: f.to } : {}), ...(f.owner ? { owner: f.owner } : {}) });
  return <CrmFrame title="CRM Dashboards" subtitle="">{(user) => {
    const b = buildBoard(board, user, new Date(), f);
    const byId = new Map(b.widgets.map((w) => [w.id, w]));
    const dash = `board:${board}`, defaults = defaultBoardOrder(board, b.widgets);
    const { layout, source } = resolveBoardLayout(dash, user, defaults);
    const widgets = layout.order.filter((id) => !layout.hidden.includes(id)).flatMap((id) => { const w = byId.get(id); return w ? [w] : []; });
    const focus = ["exec", "mgr", "rep", "pipe"].includes(board);
    return <>
      {/* Board selector grouped by audience (presentation only — the ten boards and their widgets are unchanged). */}
      <nav className="grid gap-3 border-b border-border pb-4 md:grid-cols-2 xl:grid-cols-4" aria-label="Dashboards" data-dc="board-tabs">{BOARD_GROUPS.map((g) => <div key={g.label} className="min-w-0" data-dc-board-group={g.label}>
        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{g.label}</p>
        <div className="grid gap-1">{g.boards.map((id) => <Link key={id} to="/digit-crm/dashboards" search={keep(id) as never} aria-current={id === board ? "page" : undefined} data-dc-board-tab={id}
          className={`block rounded-md border px-3 py-2 text-sm ${id === board ? "border-primary bg-primary/10 text-primary" : "border-border bg-card hover:bg-muted"}`}>
          <span className="block font-medium">{lang === "ar" && id === "exec" ? "الإدارة العليا" : BOARD_LABEL[id]}</span><span className="block truncate text-[11px] text-muted-foreground">{BOARD_INFO[id].audience}</span></Link>)}</div>
      </div>)}</nav>
      <div className="mt-5 flex flex-wrap items-end justify-between gap-2"><h2 className="text-2xl font-semibold">{b.title}</h2>
        <div className="flex flex-wrap items-center gap-2"><LayoutSourceChip source={source} /><span className="text-xs text-muted-foreground">{new Date().toLocaleDateString(lang === "ar" ? "ar-SA-u-ca-gregory-nu-latn" : "en-US", { dateStyle: "long" })}</span>
          <button type="button" className="btn-ghost inline-flex items-center gap-1 border border-border text-xs" onClick={() => setEditing((v) => !v)} aria-expanded={editing} data-dc-customize><SlidersHorizontal className="h-3.5 w-3.5" /><span>Customize</span></button></div></div>
      <div className="mt-3"><FilterBar user={user} f={f} onChange={setF} note={filterActive(f) ? <>Filtered widgets use deal/lead created-on and owner; widgets marked “All permitted records” keep their own basis.</> : undefined} /></div>
      {editing && <div className="mt-3"><LayoutEditor titles={new Map(b.widgets.map((w) => [w.id, w.title]))} layout={layout} canPublish={canPublishTeam(user)}
        onSave={(l) => { savePersonal(dash, user, l); setEditing(false); toast.success("Layout saved"); }}
        onPublish={(l) => { const r = publishTeam(dash, user, l); if (r.ok) { setEditing(false); toast.success("Team default published"); } else toast.error(r.error); }}
        onReset={() => { resetPersonal(dash, user); setEditing(false); toast.success("Layout reset"); }} onCancel={() => setEditing(false)} /></div>}
      {layout.hidden.length > 0 && !editing && <p className="mt-2 text-xs text-muted-foreground" data-dc-hidden-count><span>Hidden widgets</span>: <span dir="ltr" data-no-i18n>{layout.hidden.length}</span></p>}
      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-12" data-dc="board" data-board={board}>{widgets.map((w) => {
        const span = focus && URGENT.has(w.id) && w.kind === "list" ? "md:col-span-2 xl:col-span-12" : w.kind === "kpi" || w.kind === "progress" ? "xl:col-span-3" : "xl:col-span-6";
        return <WidgetCard key={w.id} w={w} className={span} lang={lang} />;
      })}</div>
    </>;
  }}</CrmFrame>;
}
