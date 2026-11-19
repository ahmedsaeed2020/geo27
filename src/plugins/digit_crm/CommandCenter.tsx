/**
 * DIGIT CRM module command center: command header (business question + context + existing actions), contextual tabs
 * (Overview | Work & Activities | Documents | Reports | Details) and an Overview composed from existing widgets.
 * Composition lives in modules.ts; numbers come from wf10/wf11 widgets and wf04 drill keys; every mark navigates to the
 * records it counts. Tab and owner/period filter live in the URL (tab, pf/pt/po), so refresh, Back and links keep them.
 */
import { DevOnly } from "@/components/DevOnly";
import { Link, useRouterState } from "@tanstack/react-router";
import { useMemo, useState, type ReactNode } from "react";
import { ArrowUpRight, CalendarPlus, LayoutGrid, Plus } from "lucide-react";
import { tLabel, useLang } from "@/i18n";
import { plainSource } from "./sourceLabel";
import { adapter, useStoreVersion, type Doc } from "@/lib/adapter";
import { canReadType, scopedList, useScopeMetas } from "@/lib/scope";
import { useSettings } from "@/lib/userSettings";
import { linkTitle } from "@/lib/linkTitle";
import { CrmFrame, LeadDialog, PriorityQueue, TaskDialog, TaskTable, TeamPerformance, UnassignedPanel } from "./CrmApp";
import { DataReadiness, IaCoverage, SCOPE_DTS, useAfterPaint, useDeptFilter } from "./Workspace";
import { resolveWidgets } from "./workspaces";
import { FILTERABLE, filterActive, filterSearch, type Widget } from "./wf10";
import { CTX_FILTERABLE } from "./wf11";
import { drillRecords, type RFilter } from "./wf04";
import { bucketOf, isManager, rankQueue, scopedTasks, unassignedLeads, userLabel } from "./wf01";
import { activities, scopedDeals } from "./wf02";
import { dealsMoney, fmtMoney } from "./wf05";
import { demoEnabled } from "./demoAnalytics";
import { CURRENT_REPORTS, isReportRef, refTitle } from "./wf12";
import { CRM_NAV } from "./nav";
import { ManagerExceptions } from "./Wave5";
import { DeskLink, RefLink } from "./Wave2";
import { FilterBar, Go, N, ScopeChip, WidgetBody } from "./WidgetKit";
import { PageBlocks, pageDashboard, type PageBlockDef, type PageNodes } from "@/components/dashboards/PageBlocks";
import { ChartPanel, Empty, Exceptions, PanelHead, Timeline } from "./charts";
import {
  BOARD_INFO, DOC_OF_ROUTE, isTab, layoutIds, MODULES, moduleWidgetIds, TAB_LABEL, TABS, workspacePath,
  type DocLink, type ModuleId, type ModuleSpec, type PanelSpec, type ReasonSpec, type TabId, type Tone, type WorkBlock,
} from "./modules";
import { ContextStrip, CustomizeScope } from "@/components/enterprise/kit/templates";
import { KpiCard, KpiSlots, useLeadRow } from "@/components/enterprise/kit/KpiCard";
import { appIconFor } from "@/components/enterprise/iconMap";
import { ActivityVolumeCard, ExceptionCards, ForecastRingCard, HomeKpis, LeadersStrip, PipelineStageBar, TodayPriorities } from "./HomeBoard";

const TONE_RANK: Record<Tone, number> = { critical: 0, warning: 1, neutral: 2, positive: 3 };
const fmtTime = (lang: string) => new Date().toLocaleTimeString(lang === "ar" ? "ar-SA-u-ca-gregory-nu-latn" : "en-US", { hour: "2-digit", minute: "2-digit" });
const isFilterable = (id: string) => (id.startsWith("C-") ? CTX_FILTERABLE.has(id) : FILTERABLE.has(id));

/** Current tab from the URL; unknown values fall back to Overview. */
function useTab(): TabId { const s = useRouterState({ select: (x) => x.location.search as Record<string, unknown> }); return isTab(s["tab"]) ? s["tab"] : "overview"; }

export function CommandCenter({ module }: { module: ModuleId }) {
  const spec = MODULES[module];
  return <CrmFrame title={spec.title} subtitle={spec.question} bare>{(user) => <Center spec={spec} user={user} />}</CrmFrame>;
}

function Center({ spec, user }: { spec: ModuleSpec; user: string }) {
  const lang = useLang(), tab = useTab(), path = useRouterState({ select: (s) => s.location.pathname });
  const metas = useScopeMetas(SCOPE_DTS); const ver = useStoreVersion(); useSettings();
  const [f, setF] = useDeptFilter();
  const filter: RFilter = spec.filters ? f : {};
  const rep = Boolean(spec.rep) && !isManager(user);
  const signals = rep && spec.rep ? spec.rep.signals : spec.signals, panels = rep && spec.rep ? spec.rep.panels : spec.panels;
  const ids = moduleWidgetIds(spec, rep);
  const live = useAfterPaint();
  const fKey = `${filter.from ?? ""}|${filter.to ?? ""}|${filter.owner ?? ""}`;
  // Whole-dataset widgets are computed right after the first paint (header, tabs and skeletons paint first).
  const computed = useMemo(() => (live ? { widgets: resolveWidgets(ids, user, filter), at: fmtTime(lang) } : null), [live, ids.join(), user, fKey, ver, metas]); // eslint-disable-line react-hooks/exhaustive-deps
  const byId = new Map((computed?.widgets ?? []).map((w) => [w.id, w]));
  const lids = layoutIds(spec, rep);
  const titleOf = (id: string) => panels.find((p) => p.id === id)?.title ?? byId.get(id)?.title ?? id;
  // ONE STANDARD R9 (owner 2026-11-13): the Overview is a dashboard of the shared Designer — one block per indicator row,
  // chart panel, worklist and priority queue, each with its own block menu, saved per user and published per role by Admin.
  const sigIds = lids.filter((id) => signals.some((x) => x.id === id));
  const panelIds = lids.flatMap((id) => panels.filter((p) => p.id === id));
  // owner notes C-01 «لوحة علاقات العملاء»: KPI cards with change, pipeline by stage, activity volume by type, forecast ring vs
  // target, team leaders, critical exceptions — added ahead of the existing home blocks (nothing removed)
  const home = spec.id === "home", ar = lang === "ar";
  const homeBlocks: PageBlockDef[] = home ? [
    { id: "home:kpis", title: ["Key figures", "المؤشرات الرئيسية"], w: 12 },
    { id: "home:pipeline", title: ["Pipeline by stage", "خط الأنابيب حسب المرحلة"], w: 6 }, { id: "home:activity", title: ["Activity volume by type", "حجم الأنشطة حسب النوع"], w: 6 },
    { id: "home:forecast", title: ["Forecast vs target", "التوقع مقابل الهدف"], w: 6 }, { id: "home:leaders", title: ["Team leaders", "قادة الفريق"], w: 6 },
    { id: "home:exceptions", title: ["Critical exceptions", "الاستثناءات الحرجة"], w: 12 },
  ] : [];
  const blocks: PageBlockDef[] = [
    ...homeBlocks,
    ...(sigIds.length ? [{ id: "signals", title: ["Indicators", "المؤشرات"] as [string, string], w: 12 as const, required: true }] : []),
    ...panelIds.map((p) => ({ id: `panel:${p.id}`, title: [titleOf(p.id), tLabel(titleOf(p.id))] as [string, string], w: (p.wide ? 12 : 6) as 6 | 12 })),
    ...(spec.worklist ? [{ id: "worklist", title: [spec.worklist.title, tLabel(spec.worklist.title)] as [string, string], w: 12 as const }] : []),
    ...(spec.priorities ? [{ id: "priorities", title: ["Daily priorities", "أولويات اليوم"] as [string, string], w: 12 as const }] : []),
  ];
  const dash = pageDashboard("digit_crm", `crm-board:${spec.dash}${rep ? ":rep" : ""}`, [spec.title, tLabel(spec.title)], blocks);
  const nodes: PageNodes = {
    ...(home ? {
      "home:kpis": computed ? <HomeKpis user={user} ar={ar} /> : <Skeleton h="h-32" />,
      "home:pipeline": computed ? <PipelineStageBar user={user} ar={ar} /> : <Skeleton h="h-40" />, "home:activity": computed ? <ActivityVolumeCard user={user} ar={ar} /> : <Skeleton h="h-40" />,
      "home:forecast": computed ? <ForecastRingCard user={user} ar={ar} /> : <Skeleton h="h-56" />, "home:leaders": computed ? <LeadersStrip user={user} ar={ar} /> : <Skeleton h="h-56" />,
      "home:exceptions": computed ? <ExceptionCards user={user} ar={ar} /> : <Skeleton h="h-40" />,
    } : {}),
    signals: <Signals ids={sigIds} tones={new Map(signals.map((x) => [x.id, x.tone]))} byId={byId} ready={!!computed} />,
    ...Object.fromEntries(panelIds.map((p) => [`panel:${p.id}`, <PanelFor key={p.id} p={p} byId={byId} ready={!!computed} lang={lang} />])),
    ...(spec.worklist ? { worklist: computed ? <Worklist user={user} f={filter} title={spec.worklist.title} reasons={spec.worklist.reasons} /> : <Skeleton h="h-64" /> } : {}),
    // C-01: on CRM Home the same daily-priorities block shows status pills, Arabic names, relative dates and one-click actions
    ...(spec.priorities ? { priorities: computed ? (home ? <TodayPriorities user={user} ar={ar} /> : <PriorityQueue user={user} title="Daily priorities" empty="No priorities — every open record has a scheduled next action." />) : <Skeleton h="h-40" /> } : {}),
  };
  return <div className="space-y-4" data-dc-center={spec.id} data-dc-tab={tab}>
    <CustomizeScope on={tab === "overview"}><CommandHeader spec={spec} user={user} f={filter} at={computed?.at} /></CustomizeScope>
    <nav className="dc-tabs" role="tablist" aria-label={spec.title} data-dc-tabs>
      {TABS.map((t) => <Link key={t} role="tab" aria-selected={tab === t} data-dc-tabid={t} to={path as never}
        search={((prev: Record<string, unknown>) => { const n = { ...prev }; delete n["pg"]; delete n["pl"]; if (t === "overview") delete n["tab"]; else n["tab"] = t; return n; }) as never}
        className="dc-tab">{TAB_LABEL[t]}</Link>)}
    </nav>
    {spec.filters && (tab === "overview" || tab === "work") && <FilterBar user={user} f={f} onChange={setF} note={filterActive(f) ? <>Filtered metrics use deal/lead created-on and owner; others show all permitted records.</> : undefined} />}
    {tab === "overview" && <div data-dc-panels><PageBlocks def={dash} nodes={nodes} /></div>}
    {tab === "work" && <WorkTab spec={spec} user={user} byId={byId} ready={!!computed} lang={lang} />}
    {tab === "documents" && <DocumentsTab spec={spec} user={user} />}
    {tab === "reports" && <ReportsTab spec={spec} f={filter} />}
    {tab === "details" && <DetailsTab spec={spec} user={user} widgets={ids.flatMap((id) => byId.get(id) ?? [])} at={computed?.at} />}
  </div>;
}

/* ---------- Command header ---------- */
function companies(user: string) {
  return adapter.list("User Permission").filter((p) => p["user"] === user && p["allow"] === "Company").map((p) => linkTitle("Company", p["for_value"]) || String(p["for_value"] ?? ""));
}
function CommandHeader({ spec, user, f, at }: { spec: ModuleSpec; user: string; f: RFilter; at?: string | undefined }) {
  const [dlg, setDlg] = useState<"lead" | "task" | null>(null);
  const group = CRM_NAV.find((g) => g.id === spec.nav), comp = companies(user);
  const ctx: [string, ReactNode][] = [
    ["Period", f.from || f.to ? <N v={`${f.from ?? "…"} – ${f.to ?? "…"}`} /> : <>All dates</>],
    ["Owner", f.owner ? <bdi data-no-i18n>{userLabel(f.owner)}</bdi> : isManager(user) ? <>All owners</> : <bdi data-no-i18n>{userLabel(user)}</bdi>],
    ["Company", comp.length ? <bdi data-no-i18n>{comp.join(" · ")}</bdi> : <>All permitted companies</>],
    ["Data", demoEnabled() ? <>Demo dataset</> : <>Operational records</>],
    ...(at ? [["Updated", <N key="t" v={at} />] as [string, ReactNode]] : []),
  ];
  // ONE STANDARD (owner 2026-11-12): the module command header is the shared Enterprise band (title, question, context facts, actions)
  return <header data-dc-command={spec.id}>
    <ContextStrip icon={<img src={appIconFor("digit_crm", "band")} alt="" className="h-7 w-7" data-app-badge="digit_crm" />}
      eyebrow={spec.id === "home" || !group ? <span data-no-i18n>DIGIT CRM</span> : group.label} title={spec.title} sub={spec.question}
      facts={ctx.map(([k, v]) => ({ id: k, label: k, value: v, i18n: true }))}
      actions={<>{spec.actions.map((a, i) => a.kind === "add-lead"
        ? <button key={i} type="button" className="ek-context-btn ek-btn-on-dark" onClick={() => setDlg("lead")} data-dc-add-lead><Plus className="h-4 w-4" /><span>Add Lead</span></button>
        : a.kind === "schedule" ? <button key={i} type="button" className="ek-context-btn" onClick={() => setDlg("task")} data-dc-add-task><CalendarPlus className="h-4 w-4" /><span>Schedule Next Action</span></button>
        : <Link key={i} to={a.to as never} search={(a.search ?? {}) as never} className="ek-context-btn" data-dc-action={a.to}><span>{a.label}</span><ArrowUpRight className="h-3.5 w-3.5" /></Link>)}</>} />
    <span hidden data-dc-context />
    {dlg === "lead" && <LeadDialog user={user} onClose={() => setDlg(null)} />}
    {dlg === "task" && <TaskDialog user={user} onClose={() => setDlg(null)} />}
  </header>;
}

/* ---------- KPI signal cards ---------- */
function signalValue(w: Widget) {
  return w.kind === "blocked" ? "—" : w.kind === "list" ? String(w.rows?.length ?? 0) : w.kind === "progress" ? `${w.pct ?? 0}%` : w.kind === "bars" ? String((w.bars ?? []).reduce((a, b) => a + b.value, 0)) : w.value ?? "—";
}
function Signals({ ids, tones, byId, ready }: { ids: string[]; tones: Map<string, Tone>; byId: Map<string, Widget>; ready: boolean }) {
  const lead = useLeadRow();
  if (!ids.length) return null;
  if (!ready) return <div className="ek-kpi-grid" aria-busy="true" data-ws-kpis-pending>{ids.map((id) => <div key={id} className="h-[118px] animate-pulse rounded-lg border border-border bg-muted/40" />)}</div>;
  // the Enterprise KPI cards (Round 1 §0/§4): CRM passes the figure, unit, note and drill only
  return <div className="ek-kpi-grid" data-ws-kpis data-dc-signals data-chart="kpi"><KpiSlots lead={lead}>{ids.flatMap((id) => { const w = byId.get(id); return w ? [<Signal key={id} w={w} tone={tones.get(id) ?? "neutral"} />] : []; })}</KpiSlots></div>;
}
const CRM_TONE: Record<Tone, "risk" | "attention" | "good" | undefined> = { critical: "risk", warning: "attention", positive: "good", neutral: undefined };
function Signal({ w, tone }: { w: Widget; tone: Tone }) {
  const lang = useLang();
  const blocked = w.kind === "blocked";
  const value = <>{signalValue(w)}{w.unit && !blocked ? <span className="ms-1 text-xs font-normal">{w.unit}</span> : null}</>;
  const meta = <>{w.note ?? w.calc}{w.hint ? <> · <N v={w.hint} /></> : null} <ScopeChip w={w} /></>;
  return <KpiCard ar={lang === "ar"} label={w.title} value={value} meta={meta} tone={blocked ? undefined : CRM_TONE[tone]} className="ek-kpi-tile"
    state={blocked ? <span data-dc-state="blocked">{w.reason}</span> : undefined} attrs={{ "data-ws-kpi": w.id, "data-tone": blocked ? "neutral" : tone, "data-kind": w.kind }}
    Root={w.to && !blocked ? (rp) => <Link to={w.to as never} search={(w.search ?? {}) as never} {...(rp as Record<string, unknown>)}>{rp.children}</Link> : undefined} />;
}

/* ---------- Chart panels ---------- */
const Skeleton = ({ h = "h-56" }: { h?: string }) => <div className={`${h} animate-pulse rounded-lg border border-border bg-muted/40`} aria-busy="true" />;
function PanelFor({ p, byId, ready, lang }: { p: PanelSpec; byId: Map<string, Widget>; ready: boolean; lang: string }) {
  const span = "";
  if (!ready) return <div className={span}><Skeleton /></div>;
  if (p.viz === "exceptions") {
    const ws = (p.ids ?? []).flatMap((id) => byId.get(id) ?? []);
    return <section className={`dc-panel ${span}`} data-dc-panel={p.id} data-viz="exceptions" data-chart="exceptions"><PanelHead title={p.title ?? ""} id={p.id} /><Exceptions widgets={ws} /></section>;
  }
  const w = byId.get(p.id); if (!w) return null;
  return <ChartPanel w={w} p={p} lang={lang} className={span} />;
}

/* ---------- Decision worklist (wf04 drill keys → canonical records) ---------- */
type WRow = { dt: string; name: string; title: string; status: string; reasons: ReasonSpec[]; owner: string; date: string; dateLabel: string; value?: string; ref?: { dt: string; name: string } };
function rowOf(r: { dt: string; name: string; title: string; status: string }, reason: ReasonSpec): WRow {
  const d: Doc | undefined = adapter.get(r.dt, r.name);
  const owner = String(d?.["lead_owner"] ?? d?.["deal_owner"] ?? d?.["assigned_to"] ?? "");
  const [date, dateLabel] = r.dt === "CRM Task" ? [d?.["due_date"], "Due"] : r.dt === "CRM Deal" ? [d?.["expected_closure_date"], "Expected close"] : r.dt === "Event" ? [d?.["starts_on"], "Starts"] : [d?.["creation"], "Created"];
  const ref = r.dt === "CRM Task" && d?.["reference_docname"] ? { dt: String(d["reference_doctype"] ?? ""), name: String(d["reference_docname"]) } : undefined;
  return { ...r, reasons: [reason], owner, date: String(date ?? "").slice(0, 10), dateLabel: String(dateLabel), ...(r.dt === "CRM Deal" && d ? { value: fmtMoney(dealsMoney([d])) } : {}), ...(ref ? { ref } : {}) };
}
export function buildWorklist(user: string, f: RFilter, reasons: ReasonSpec[]) {
  const seen = new Map<string, WRow>(), counts: { r: ReasonSpec; n: number }[] = [];
  for (const reason of reasons) {
    const recs = drillRecords(user, f, reason.key); counts.push({ r: reason, n: recs.length });
    for (const x of recs) { const k = `${x.dt}\u0000${x.name}`, prev = seen.get(k); if (prev) prev.reasons.push(reason); else seen.set(k, rowOf(x, reason)); }
  }
  const rows = [...seen.values()].sort((a, b) => TONE_RANK[a.reasons[0]!.tone] - TONE_RANK[b.reasons[0]!.tone] || (a.date || "9999").localeCompare(b.date || "9999") || a.name.localeCompare(b.name));
  return { rows, counts };
}
const WORK_LIMIT = 12;
function recordLink(r: { dt: string; name: string; title: string }) {
  const label = <><span className="block truncate font-medium" data-no-i18n>{r.title || r.name}</span><span className="block truncate text-[11px] text-muted-foreground" data-no-i18n>{r.name}</span></>;
  if (r.dt === "CRM Lead") return <Link to="/digit-crm/leads/$leadId" params={{ leadId: r.name }} className="block min-w-0 hover:text-primary" data-dc-record={r.name}>{label}</Link>;
  if (r.dt === "CRM Deal") return <Link to="/digit-crm/deals/$dealId" params={{ dealId: r.name }} className="block min-w-0 hover:text-primary" data-dc-record={r.name}>{label}</Link>;
  if (r.dt === "CRM Organization") return <Link to="/digit-crm/customers/$org" params={{ org: r.name }} className="block min-w-0 hover:text-primary" data-dc-record={r.name}>{label}</Link>;
  return <span className="block min-w-0" data-dc-record={r.name}><DeskLink app="crm" dt={r.dt} name={r.name} label={r.title || r.name} /><span className="block truncate text-[11px] text-muted-foreground" data-no-i18n>{r.name}</span></span>;
}
function Worklist({ user, f, title, reasons }: { user: string; f: RFilter; title: string; reasons: ReasonSpec[] }) {
  const ver = useStoreVersion(), fKey = `${f.from ?? ""}|${f.to ?? ""}|${f.owner ?? ""}`;
  const { rows, counts } = useMemo(() => buildWorklist(user, f, reasons), [user, fKey, ver, reasons]); // eslint-disable-line react-hooks/exhaustive-deps
  const fs = filterSearch(f);
  return <section className="dc-panel" data-dc-worklist>
    <div className="mb-3 flex flex-wrap items-center gap-2"><h3 className="text-sm font-semibold">{title}</h3><span className="text-xs text-muted-foreground"><N v={rows.length.toLocaleString("en-US")} /> <span>records</span></span>
      <span className="ms-auto flex flex-wrap gap-1.5">{counts.map(({ r, n }) => <Link key={r.key} to="/digit-crm/reports" search={{ cat: r.cat, drill: r.key, ...fs } as never} className="dc-reason" data-tone={n ? r.tone : "neutral"} data-dc-reason={r.key}><span>{r.reason}</span> <N v={n.toLocaleString("en-US")} /><ArrowUpRight className="h-3 w-3" /></Link>)}</span></div>
    {!rows.length ? <Empty>Nothing needs action.</Empty> : <div className="overflow-x-auto"><table className="w-full text-sm" data-dc-worklist-rows><thead><tr className="text-start text-xs text-muted-foreground">
      <th className="w-8 px-2 py-1.5 text-start font-medium">#</th><th className="px-2 py-1.5 text-start font-medium">Record</th><th className="px-2 py-1.5 text-start font-medium">Reason</th><th className="px-2 py-1.5 text-start font-medium">Status</th><th className="px-2 py-1.5 text-start font-medium">Owner</th><th className="px-2 py-1.5 text-start font-medium">Date</th><th className="px-2 py-1.5 text-end font-medium">Value</th></tr></thead>
      <tbody>{rows.slice(0, WORK_LIMIT).map((r, i) => <tr key={r.dt + r.name} className="border-t border-border align-top" data-dc-work-row={r.name}>
        <td className="px-2 py-2 text-xs text-muted-foreground"><N v={i + 1} /></td>
        <td className="max-w-72 px-2 py-2">{recordLink(r)}{r.ref && <span className="mt-0.5 block text-[11px]"><span className="text-muted-foreground">Linked</span>: <RefLink dt={r.ref.dt} name={r.ref.name} /></span>}</td>
        <td className="px-2 py-2"><span className="flex flex-wrap gap-1">{r.reasons.map((x) => <span key={x.key} className="dc-reason" data-tone={x.tone}>{x.reason}</span>)}</span></td>
        <td className="px-2 py-2 text-xs">{r.status || "—"}</td>
        <td className="px-2 py-2 text-xs" data-no-i18n>{r.owner ? userLabel(r.owner) : "—"}</td>
        <td className="whitespace-nowrap px-2 py-2 text-xs">{r.date ? <><span className="text-muted-foreground">{r.dateLabel}</span> <N v={r.date} /></> : "—"}</td>
        <td className="whitespace-nowrap px-2 py-2 text-end text-xs"><N v={r.value ?? "—"} /></td>
      </tr>)}</tbody></table></div>}
    {rows.length > WORK_LIMIT && <p className="mt-2 text-xs text-muted-foreground"><span>Showing the first</span> <N v={WORK_LIMIT} /> · <span>Open a reason above to see every record.</span></p>}
  </section>;
}

/* ---------- Work & Activities ---------- */
function WorkTab({ spec, user, byId, ready, lang }: { spec: ModuleSpec; user: string; byId: Map<string, Widget>; ready: boolean; lang: string }) {
  const blocks = spec.work;
  return <div className="space-y-4" data-dc-work>{blocks.map((b, i) => <WorkBlockView key={i} b={b} user={user} byId={byId} ready={ready} lang={lang} />)}</div>;
}
function WorkBlockView({ b, user, byId, ready, lang }: { b: WorkBlock; user: string; byId: Map<string, Widget>; ready: boolean; lang: string }) {
  switch (b.kind) {
    case "queue": return <PriorityQueue user={user} {...(b.only ? { only: b.only } : {})} title={b.title} empty="Every open record has a scheduled next action." />;
    case "widget": { if (!ready) return <Skeleton />; const w = byId.get(b.id); return w ? <ChartPanel w={w} p={{ viz: b.viz, unit: b.unit }} lang={lang} /> : null; }
    case "unassigned": { const un = unassignedLeads(user); return isManager(user) ? (un.length ? <UnassignedPanel leads={un} user={user} /> : <div className="panel p-6 text-center text-sm text-muted-foreground" data-dc-state="empty">No unassigned leads.</div>) : null; }
    case "followups": return <FollowupsNow user={user} />;
    case "teams": return <TeamPerformance user={user} />;
    case "manager-exceptions": return <ManagerExceptions user={user} />;
    case "recent-deals": return <RecentDeals user={user} />;
    case "timeline": return <RecentTimeline user={user} lang={lang} />;
    case "coverage": return <><DataReadiness user={user} /><IaCoverage /></>;
  }
}
function FollowupsNow({ user }: { user: string }) {
  const ver = useStoreVersion();
  const rows = useMemo(() => rankQueue(scopedTasks(user)).filter((t) => { const b = bucketOf(t); return b === "overdue" || b === "today"; }), [user, ver]);
  return <section className="space-y-2" data-dc-followups>
    <div className="flex items-center gap-2"><h3 className="text-sm font-semibold">Follow-ups due now</h3><span className="text-xs text-muted-foreground"><N v={rows.length.toLocaleString("en-US")} /></span>
      <Link to="/digit-crm/follow-ups" search={{ tab: "overdue" }} className="ms-auto inline-flex items-center gap-1 text-xs text-primary hover:underline"><span>Follow-up Center</span><ArrowUpRight className="h-3 w-3" /></Link></div>
    <TaskTable tasks={rows} user={user} empty="No overdue or due-today follow-ups." />
  </section>;
}
function RecentDeals({ user }: { user: string }) {
  const ver = useStoreVersion();
  const recent = useMemo(() => scopedDeals(user).sort((a, b) => String(b["modified"] ?? "").localeCompare(String(a["modified"] ?? ""))).slice(0, 8), [user, ver]);
  return <section className="dc-panel" data-dc-recent-deals><h3 className="mb-3 text-sm font-semibold">Recently updated opportunities</h3>
    {!recent.length ? <Empty>No opportunities yet.</Empty> : <div className="overflow-x-auto"><table className="dp-table w-full text-sm"><tbody>{recent.map((d) =>
      <tr key={d.name}><td><RefLink dt="CRM Deal" name={d.name} /></td><td data-no-i18n>{linkTitle("CRM Organization", d["organization"])}</td><td>{String(d["status"] ?? "")}</td><td className="text-end"><N v={fmtMoney(dealsMoney([d]))} /></td></tr>)}</tbody></table></div>}
  </section>;
}
function RecentTimeline({ user, lang }: { user: string; lang: string }) {
  const ver = useStoreVersion();
  const rows = useMemo(() => { const now = new Date().toISOString(); return activities(user).filter((a) => a.when && a.when <= now).sort((a, b) => b.when.localeCompare(a.when)).slice(0, 15); }, [user, ver]);
  return <section className="dc-panel" data-dc-timeline><div className="mb-3 flex items-center gap-2"><h3 className="text-sm font-semibold">Recent business activity</h3>
    <Link to="/digit-crm/activities" className="ms-auto inline-flex items-center gap-1 text-xs text-primary hover:underline"><span>All Activities</span><ArrowUpRight className="h-3 w-3" /></Link></div><Timeline rows={rows} lang={lang} /></section>;
}

/* ---------- Documents (All sections) ---------- */
const KIND_LABEL = { digit: "DIGIT CRM screen", native: "Frappe CRM", desk: "DIGIT / DIGIT document", missing: "Not available" } as const;
function DocumentsTab({ spec, user }: { spec: ModuleSpec; user: string }) {
  const group = CRM_NAV.find((g) => g.id === spec.nav);
  const self = workspacePath(spec.id);
  const items: (DocLink | { label: string; kind: "missing"; reason?: string | undefined; to?: undefined; search?: undefined })[] = [
    ...(group?.items ?? []).filter((i) => i.to !== self && !(spec.docs && !spec.docs.includes(i.label))).map((i) => (i.to ? { label: i.label, to: i.to, kind: i.kind as DocLink["kind"], ...(i.search ? { search: i.search } : {}) } : { label: i.label, kind: "missing" as const, reason: i.reason })),
    ...(spec.extraDocs ?? []),
  ];
  const dts = [...new Set(items.flatMap((i) => (i.to && DOC_OF_ROUTE[i.to] ? [DOC_OF_ROUTE[i.to]!] : [])))];
  const metas = useScopeMetas(dts); const ver = useStoreVersion();
  const counts = useMemo(() => new Map(dts.map((dt) => [dt, canReadType(dt, user) ? scopedList(dt, user).length : null])), [dts.join(), user, metas, ver]); // eslint-disable-line react-hooks/exhaustive-deps
  return <section data-dc-documents><div className="mb-3 flex items-center gap-2"><LayoutGrid className="h-4 w-4 text-muted-foreground" aria-hidden /><h2 className="text-sm font-semibold">All sections</h2><span className="text-xs text-muted-foreground"><N v={items.length} /></span></div>
    <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{items.map((i) => {
      const dt = i.to ? DOC_OF_ROUTE[i.to] : undefined, n = dt ? counts.get(dt) : undefined;
      const body = <>
        <div className="flex items-start gap-2"><span className="min-w-0 flex-1 font-medium">{i.label}</span>{i.to && <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground" />}</div>
        <div className="mt-1 text-[11px] text-muted-foreground">{KIND_LABEL[i.kind]}</div>
        {i.kind === "missing" ? <p className="mt-2 text-xs text-muted-foreground" data-dc-state="blocked">{"reason" in i ? i.reason : null}</p>
          : dt ? <p className="mt-2 text-xs">{n === null ? <span className="text-muted-foreground" data-dc-state="denied">No access</span> : <><span className="text-muted-foreground">Visible to you</span>: <strong><N v={(n ?? 0).toLocaleString("en-US")} /></strong></>}</p> : null}
      </>;
      return <li key={i.label} data-dc-doc={i.label}>{i.to ? <Link to={i.to as never} search={(i.search ?? {}) as never} className="dc-doc-card block">{body}</Link> : <div className="dc-doc-card opacity-70" aria-disabled="true">{body}</div>}</li>;
    })}</ul>
    {spec.id === "admin" && <div className="mt-4"><IaCoverage /></div>}
  </section>;
}

/* ---------- Reports ---------- */
function ReportsTab({ spec, f }: { spec: ModuleSpec; f: RFilter }) {
  const fs = filterSearch(f);
  const tables = CURRENT_REPORTS.filter((r) => spec.topics.includes(r.topic));
  return <div className="grid gap-4 lg:grid-cols-2" data-dc-reports>
    <section className="dc-panel"><h3 className="mb-3 text-sm font-semibold">Reports for this module</h3><ul className="divide-y divide-border">{spec.reports.map((r) => <li key={isReportRef(r) ? r.table : r.to + JSON.stringify(r.search ?? {})}>
      {isReportRef(r) ? <Link to="/digit-crm/reports" search={{ cat: r.topic, rpt: r.table, ...fs } as never} className="flex items-center gap-2 py-2 text-sm hover:text-primary" data-ws-report={r.table}><span className="flex-1">{refTitle(r)}</span><ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground" /></Link>
        : <Link to={r.to as never} search={(r.search ?? {}) as never} className="flex items-center gap-2 py-2 text-sm hover:text-primary" data-ws-report={r.to}><span className="flex-1">{r.label}</span><ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground" /></Link>}</li>)}</ul></section>
    <section className="dc-panel"><h3 className="mb-3 text-sm font-semibold">Analytical boards</h3><ul className="grid gap-2">{spec.boards.map((b) => <li key={b}>
      <Link to="/digit-crm/dashboards" search={{ board: b, ...(f.from ? { from: f.from } : {}), ...(f.to ? { to: f.to } : {}), ...(f.owner ? { owner: f.owner } : {}) } as never} className="dc-doc-card block" data-dc-board={b}>
        <div className="flex items-center gap-2"><span className="flex-1 font-medium">{BOARD_INFO[b].title}</span><ArrowUpRight className="h-4 w-4 text-muted-foreground" /></div>
        <p className="mt-1 text-xs text-muted-foreground">{BOARD_INFO[b].audience}</p><p className="text-xs text-muted-foreground">{BOARD_INFO[b].purpose}</p></Link></li>)}</ul></section>
    <section className="dc-panel lg:col-span-2"><h3 className="mb-3 text-sm font-semibold">Report tables</h3>
      <div className="overflow-x-auto"><table className="dp-table w-full text-sm"><thead><tr><th className="text-start">ID</th><th className="text-start">Report</th><th className="text-start">Source</th></tr></thead>
        <tbody>{tables.map((r) => <tr key={r.table}><td data-no-i18n dir="ltr">{r.rid}</td><td><Link to="/digit-crm/reports" search={{ cat: r.topic, rpt: r.table, ...fs } as never} className="text-primary hover:underline">{r.title}</Link></td><td data-no-i18n>{r.source}</td></tr>)}</tbody></table></div>
      <p className="mt-2 text-xs text-muted-foreground">Every row in these reports opens the records behind it. Generated DIGIT add-on reports are not installed on a live site from this preview.</p></section>
  </div>;
}

/* ---------- Details ---------- */
function DetailsTab({ spec, user, widgets, at }: { spec: ModuleSpec; user: string; widgets: Widget[]; at?: string | undefined }) {
  const lang = useLang();
  const blocked = widgets.filter((w) => w.kind === "blocked");
  return <div className="space-y-4" data-dc-details>
    <section className="dc-panel"><h3 className="mb-2 text-sm font-semibold">Business question</h3><p className="text-sm">{spec.question}</p>
      <p className="mt-2 text-xs text-muted-foreground"><span>Figures are computed live from the records you may read.</span>{at ? <> · <span>Updated</span> <N v={at} /></> : null} · <span>Every value opens the records it counts.</span></p>
      {spec.filters ? <p className="mt-1 text-xs text-muted-foreground">Period and owner filters apply to deals and leads by created-on date and owner; other figures show all permitted records and are labelled.</p> : <p className="mt-1 text-xs text-muted-foreground">This module has no period filter; figures cover all permitted records.</p>}</section>
    <section className="dc-panel overflow-x-auto"><h3 className="mb-2 text-sm font-semibold">Definitions</h3>
      {!widgets.length ? <Skeleton h="h-32" /> : <table className="dp-table w-full text-sm" data-dc-definitions><thead><tr><th className="text-start">ID</th><th className="text-start">Figure</th><th className="text-start">Calculation</th><th className="text-start">Source</th><th className="text-start">Period filter</th><th className="text-start">Status</th></tr></thead>
        <tbody>{widgets.map((w) => <tr key={w.id} data-dc-def={w.id}><td data-no-i18n dir="ltr">{w.id}</td><td className="min-w-40 whitespace-normal!">{w.title}</td><td className="min-w-56 whitespace-normal!">{w.calc}</td><td className="min-w-40 whitespace-normal! break-words text-xs" data-no-i18n>{plainSource(w.source, tLabel, lang === "ar") || "—"}<DevOnly><span className="block text-muted-foreground" dir="ltr">{w.source}</span></DevOnly></td>
          <td>{spec.filters && isFilterable(w.id) ? "Applies" : "All permitted records"}</td><td>{w.kind === "blocked" ? <span className="text-muted-foreground">Unavailable</span> : "Live"}</td></tr>)}</tbody></table>}</section>
    {(blocked.length > 0 || (spec.notes ?? []).length > 0) && <section className="dc-panel"><h3 className="mb-2 text-sm font-semibold">Unavailable data dependencies</h3><ul className="space-y-1.5 text-sm">
      {blocked.map((w) => <li key={w.id} className="flex gap-2"><span className="w-14 shrink-0 text-xs text-muted-foreground" data-no-i18n dir="ltr">{w.id}</span><span className="font-medium">{w.title}</span><span className="text-muted-foreground">— {w.reason}</span></li>)}
      {(spec.notes ?? []).map((n) => <li key={n.label} className="flex gap-2"><span className="w-14 shrink-0" /><span className="font-medium">{n.label}</span><span className="text-muted-foreground">— {n.reason}</span></li>)}</ul></section>}
    <DataReadiness user={user} doctypes={spec.doctypes} />
  </div>;
}
