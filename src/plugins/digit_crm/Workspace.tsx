/**
 * Department workspace panel (regions B–H of the research floorplan): owner/period filter, KPI band, operational and
 * analytical panels, related reports and personalization. It renders above the existing page content (region F: the
 * working register/board stays the native component), composes widgets by id (workspaces.ts) and never computes its own
 * numbers — every value is a wf10/wf11 widget whose click opens its drill records.
 */
import { DevOnly } from "@/components/DevOnly";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowUpRight, BarChart3, ChevronDown, ChevronUp, FileText, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";
import { useLang } from "@/i18n";
import { adapter, useStoreVersion } from "@/lib/adapter";
import { scopedList, useScopeMetas } from "@/lib/scope";
import { isManager } from "./wf01";
import { demoEnabled } from "./demoAnalytics";
import { useSessionUser } from "@/lib/session";
import { useSettings } from "@/lib/userSettings";
import { canPublishTeam, publishTeam, resetPersonal, resolveBoardLayout, savePersonal } from "./boardLayout";
import { DEPTS, deptWidgetIds, IA_NODES, resolveWidgets, type DeptId } from "./workspaces";
import { filterActive, type BoardFilter, type Widget } from "./wf10";
import { isReportRef, refTitle } from "./wf12";
import { FilterBar, Go, LayoutEditor, LayoutSourceChip, N, ScopeChip, URGENT, WidgetCard } from "./WidgetKit";
import { DEMO_TYPES } from "./demoSchema";
import { PANEL_VIZ } from "./modules";
import { ChartPanel } from "./charts";
import { registerListInsights } from "@/components/crm/listExt";

export const SCOPE_DTS = ["CRM Lead", "CRM Deal", "CRM Deal Status", "CRM Task", "Communication", "CRM Call Log", "FCRM Note", "Campaign", "Sales Person", "Company", "CRM Organization", "Contact", "Customer", "Sales Invoice", "Sales Order", "Quotation", "Payment Entry", "Fiscal Year", "Event", "Employee", "CRM Dashboard", ...Object.values(DEMO_TYPES)];
const date = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);

/** Workspace filter lives in the page URL as pf/pt/po (period from/to, owner), so refresh, Back and deep links keep it
 *  without colliding with a page's own search keys. */
export function useDeptFilter(): [BoardFilter, (f: BoardFilter) => void] {
  const loc = useRouterState({ select: (s) => s.location });
  const nav = useNavigate();
  const s = (loc.search ?? {}) as Record<string, unknown>;
  const f: BoardFilter = { from: date(s["pf"]), to: date(s["pt"]), owner: typeof s["po"] === "string" && s["po"] ? s["po"] : undefined };
  const set = (x: BoardFilter) => {
    const next: Record<string, unknown> = { ...s }; delete next["pf"]; delete next["pt"]; delete next["po"];
    if (x.from) next["pf"] = x.from; if (x.to) next["pt"] = x.to; if (x.owner) next["po"] = x.owner;
    void nav({ to: loc.pathname as never, search: next as never, replace: true });
  };
  return [f, set];
}

/** Compact KPI card: value, unit hint, scope and click-through to the widget's own drill. */
function KpiCard({ w, dense }: { w: Widget; dense?: boolean }) {
  const list = w.kind === "list", blocked = w.kind === "blocked";
  const value = blocked ? "—" : list ? String(w.rows?.length ?? 0) : w.kind === "progress" ? `${w.pct ?? 0}%` : w.kind === "bars" ? String((w.bars ?? []).reduce((a, b) => a + b.value, 0)) : w.value;
  const to = w.to, search = w.search; // list widgets: their register destination applies the same predicate as the rows
  const body = <>
    <div className="text-xs text-muted-foreground">{w.title}</div>{w.scope && <div className="mt-1"><ScopeChip w={w} /></div>}
    <div className="mt-1 flex items-baseline gap-1"><span className={`min-w-0 break-words font-semibold leading-tight ${dense ? "text-xl" : "text-2xl"}`}><N v={value} /></span>{to && !blocked && <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}</div>
    {blocked ? <p className="mt-1 text-[11px] text-muted-foreground" data-dc-state="blocked">{w.reason}</p> : w.hint ? <p className="mt-1 text-[11px] text-muted-foreground"><N v={w.hint} /></p> : null}
    {/* Source DocType/field names stay available (tooltip + the board's "Source and calculation" panel) without English text on Arabic card faces. */}
    <p className="mt-1 truncate text-[10px] text-muted-foreground" title={w.source} data-ws-source={w.source}><DevOnly><N v={w.id} /></DevOnly></p>
  </>;
  const cls = `panel block h-full min-w-0 p-3 ${blocked ? "bg-muted/30" : "hover:bg-muted"}`;
  // Signal grammar: thin semantic top border (critical for exception widgets), same as the module command centers.
  const tone = blocked ? "neutral" : URGENT.has(w.id) ? "critical" : "neutral";
  const card = <div className={cls} data-ws-kpi={w.id} data-tone={tone}>{body}</div>;
  return to && !blocked ? <Go to={to} search={search} className="block min-w-0">{card}</Go> : card;
}

export function DeptPanel({ dept, compact }: { dept: DeptId; compact?: boolean }) {
  const spec = DEPTS[dept], lang = useLang(), user = useSessionUser();
  const metas = useScopeMetas(SCOPE_DTS); const ver = useStoreVersion(); useSettings();
  const [f, setF] = useDeptFilter();
  const isCompact = compact ?? spec.compact ?? false;
  const [open, setOpen] = useState(!isCompact);
  const [editing, setEditing] = useState(false);
  const fKey = `${f.from ?? ""}|${f.to ?? ""}|${f.owner ?? ""}`;
  const ids = deptWidgetIds(spec), dash = `dept:${dept}`;
  /** The band reads every permitted record (whole-dataset metrics), so the page's own rows paint first and the band
   *  is computed right after that paint; values and drills are identical, only their arrival is later. */
  const live = useAfterPaint();
  const widgets = useMemo(() => live ? resolveWidgets(ids, user, spec.filters ? f : {}) : [], [live, ids.join(), user, fKey, ver, metas, spec.filters]); // eslint-disable-line react-hooks/exhaustive-deps
  const byId = new Map(widgets.map((w) => [w.id, w]));
  const { layout, source } = resolveBoardLayout(dash, user, ids);
  const visible = layout.order.filter((id) => !layout.hidden.includes(id));
  const kpis = visible.filter((id) => spec.kpis.includes(id)).flatMap((id) => byId.get(id) ?? []);
  const panels = visible.filter((id) => spec.panels.includes(id)).flatMap((id) => byId.get(id) ?? []);
  return <section className="mb-4 space-y-3" data-ws-dept={dept} aria-label={spec.title}>
    <div className="flex flex-wrap items-center gap-2">
      <BarChart3 className="h-4 w-4 text-muted-foreground" aria-hidden /><h2 className="text-sm font-semibold">Department metrics</h2>
      <DevOnly><span className="text-[11px] text-muted-foreground" data-no-i18n dir="ltr">{spec.nodes.join(" · ")}</span></DevOnly>
      <span className="ms-auto flex flex-wrap items-center gap-2"><LayoutSourceChip source={source} />
        <button type="button" className="btn-ghost inline-flex items-center gap-1 text-xs" onClick={() => setEditing((v) => !v)} aria-expanded={editing} data-ws-customize><SlidersHorizontal className="h-3.5 w-3.5" /><span>Customize</span></button>
        {isCompact && <button type="button" className="btn-ghost inline-flex items-center gap-1 text-xs" onClick={() => setOpen((v) => !v)} aria-expanded={open} data-ws-toggle>{open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}<span>{open ? "Hide analysis" : "Show analysis"}</span></button>}
      </span>
    </div>
    {spec.filters && <FilterBar user={user} f={f} onChange={setF} note={filterActive(f) ? <>Filtered metrics use deal/lead created-on and owner; others show all permitted records.</> : undefined} />}
    {editing && <LayoutEditor titles={new Map(widgets.map((w) => [w.id, w.title]))} layout={layout} canPublish={canPublishTeam(user)}
      onSave={(l) => { savePersonal(dash, user, l); setEditing(false); toast.success("Layout saved"); }}
      onPublish={(l) => { const r = publishTeam(dash, user, l); if (r.ok) { setEditing(false); toast.success("Team default published"); } else toast.error(r.error); }}
      onReset={() => { resetPersonal(dash, user); setEditing(false); toast.success("Layout reset"); }} onCancel={() => setEditing(false)} />}
    {!live && (() => { const n = visible.filter((id) => spec.kpis.includes(id)).length; return n > 0 && <div className={`grid gap-3 sm:grid-cols-2 ${n >= 5 ? "lg:grid-cols-5" : n === 4 ? "lg:grid-cols-4" : "lg:grid-cols-3"}`} aria-busy="true" data-ws-kpis-pending>{Array.from({ length: n }, (_, i) => <div key={i} className="h-[104px] animate-pulse rounded-lg border border-border bg-muted/40" />)}</div>; })()}
    {kpis.length > 0 && <div className={`grid gap-3 sm:grid-cols-2 ${kpis.length >= 5 ? "lg:grid-cols-5" : kpis.length === 4 ? "lg:grid-cols-4" : "lg:grid-cols-3"}`} data-ws-kpis>{kpis.map((w) => <KpiCard key={w.id} w={w} dense={kpis.length >= 5} />)}</div>}
    {open && <>
      {panels.length > 0 && <div className="grid gap-4 lg:grid-cols-2" data-ws-panels>{panels.map((w) => { const cls = w.kind === "list" && panels.length % 2 === 1 && w === panels[panels.length - 1] ? "lg:col-span-2" : ""; const viz = PANEL_VIZ.get(w.id); return viz ? <ChartPanel key={w.id} w={w} p={viz} lang={lang} className={cls} /> : <WidgetCard key={w.id} w={w} lang={lang} className={cls} />; })}</div>}
      {spec.reports.length > 0 && <nav className="panel flex flex-wrap items-center gap-2 p-3 text-sm" aria-label="Related reports" data-ws-reports>
        <FileText className="h-4 w-4 text-muted-foreground" aria-hidden /><span className="text-xs font-medium text-muted-foreground">Related reports</span>
        {spec.reports.map((r) => isReportRef(r)
          ? <Link key={`${r.topic}:${r.table}`} to="/digit-crm/reports" search={{ cat: r.topic, rpt: r.table } as never} className="rounded-full border border-border px-3 py-1 text-xs hover:bg-muted" data-ws-report={r.table}>{refTitle(r)}</Link>
          : <Link key={r.to + JSON.stringify(r.search ?? {})} to={r.to as never} search={(r.search ?? {}) as never} className="rounded-full border border-border px-3 py-1 text-xs hover:bg-muted" data-ws-report={r.to}>{r.label}</Link>)}
      </nav>}
    </>}
  </section>;
}

/** Native registers (Core list-insights slot) → department panel; shown only inside the DIGIT CRM experience. */
const REGISTER_DEPTS: [string, DeptId][] = [["CRM Lead", "leads"], ["CRM Deal", "deals"], ["Contact", "contacts"], ["CRM Organization", "accounts"], ["CRM Task", "tasks"], ["CRM Call Log", "calls"]];
export function registerCrmInsights() {
  for (const [dt, dept] of REGISTER_DEPTS) registerListInsights("digit_crm", dt, function DeptInsights() { return <DeptPanel dept={dept} />; });
}

/** P2 data readiness: records stored in this preview vs records the current user may read, per CRM source DocType.
 *  Stored totals are shown to managers only (they would otherwise disclose records a salesperson cannot open). */
const READINESS: { dt: string; to?: string }[] = [
  { dt: "CRM Lead", to: "/crm/leads" }, { dt: "CRM Deal", to: "/crm/deals" }, { dt: "CRM Task", to: "/crm/tasks" }, { dt: "FCRM Note", to: "/crm/notes" },
  { dt: "CRM Call Log", to: "/crm/call-logs" }, { dt: "Communication" }, { dt: "CRM Organization", to: "/crm/organizations" }, { dt: "Contact", to: "/crm/contacts" },
  { dt: "Event" }, { dt: "Customer" }, { dt: "Quotation" }, { dt: "Sales Order" }, { dt: "Sales Invoice" }, { dt: "Payment Entry" },
  { dt: "Campaign" }, { dt: "Sales Person" }, { dt: "CRM Deal Status" },
];
export function DataReadiness({ user, doctypes }: { user: string; doctypes?: string[] | undefined }) {
  const list = doctypes ? READINESS.filter((r) => doctypes.includes(r.dt)) : READINESS;
  const metas = useScopeMetas(list.map((r) => r.dt)); const ver = useStoreVersion();
  const manager = isManager(user);
  const rows = useMemo(() => list.map((r) => ({ ...r, stored: adapter.list(r.dt).length, visible: scopedList(r.dt, user).length })), [user, metas, ver, list.length]); // eslint-disable-line react-hooks/exhaustive-deps
  return <section className="panel overflow-x-auto p-4" data-ws-readiness>
    <div className="mb-2 flex items-center gap-2"><h2 className="text-sm font-semibold">Data readiness</h2><span className="ms-auto text-xs text-muted-foreground">{demoEnabled() ? "Demo dataset active (synthetic records)" : "Operational records"}</span></div>
    <table className="dp-table w-full text-sm"><thead><tr><th className="text-start">Source</th>{manager && <th className="text-end">Stored</th>}<th className="text-end">Visible to you</th><th /></tr></thead>
      <tbody>{rows.map((r) => <tr key={r.dt} data-ws-source={r.dt}><td data-no-i18n>{r.dt}</td>{manager && <td className="text-end"><N v={r.stored} /></td>}<td className="text-end" data-ws-visible><N v={r.visible} /></td>
        <td className="text-end">{r.to ? <Link to={r.to as never} className="text-xs text-primary hover:underline">Open list</Link> : null}</td></tr>)}</tbody></table>
    <p className="mt-2 text-xs text-muted-foreground">Visible counts apply your role and user permissions — the same rule every list, dashboard and report uses.</p>
  </section>;
}

/** Coverage of the 37 research IA nodes: current route and the department panel carrying their context. */
export function IaCoverage() {
  const groups = [...new Set(IA_NODES.map((n) => n.group))];
  return <details className="panel p-4" data-ws-ia>
    <summary className="cursor-pointer text-sm font-semibold"><span>Workspace coverage</span> (<N v={IA_NODES.length} />)</summary>
    <div className="mt-3 space-y-3">{groups.map((g) => <div key={g}><h3 className="mb-1 text-xs font-medium text-muted-foreground">{g}</h3>
      <ul className="grid gap-1 text-sm md:grid-cols-2">{IA_NODES.filter((n) => n.group === g).map((n) => <li key={n.id} className="flex items-start gap-2" data-ws-node={n.id}>
        <span className="w-12 shrink-0 text-xs text-muted-foreground" data-no-i18n dir="ltr">{n.id}</span>
        <span className="min-w-0">{n.route.includes("$") ? <span>{n.label}</span> : <Link to={n.route as never} className="text-primary hover:underline">{n.label}</Link>}
          {n.dept && <span className="ms-1 text-[11px] text-muted-foreground">· {DEPTS[n.dept].title}</span>}{n.note && <span className="block text-[11px] text-muted-foreground">{n.note}</span>}</span>
      </li>)}</ul></div>)}</div>
  </details>;
}

/** False on the first render, true once the browser has painted the frame that contains it. */
export function useAfterPaint() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let timer = 0;
    const frame = requestAnimationFrame(() => { timer = window.setTimeout(() => setReady(true), 0); });
    return () => { cancelAnimationFrame(frame); clearTimeout(timer); };
  }, []);
  return ready;
}
