// @ts-nocheck -- DIGIT Pro/HR apps are switched off in the merged site build; their original /pro/* and /hr/* app routes are not in this route tree (re-enabling the app needs those routes, then remove this line)
/**
 * RXP-NAV-CORRECTIVE-02 — business SECTION WORKSPACE page (/pro/$dept/$section).
 * One reusable frame, section-specific content from sections.ts SPECS: header (purpose, company, as-of, role,
 * freshness, primary action) → exactly three in-content tabs on every workspace (Run11.1 contract, owner 2026-11-09):
 * Dashboard | Documents & work | Full reports. The earlier five tabs are re-homed: Work and Documents → Documents & work,
 * Reports and Details → Full reports. Every workspace carries its PLACEMENTS_448 ids (run11.ts slice + run11Rollout.ts).
 * Every figure links to the exact native rows it counts (same Frappe filter predicate); native documents open in
 * their original forms and routes. A link click records this section as the history entry's context, so breadcrumbs,
 * the highlighted sidebar page and Back all return here with the same tab and filters.
 */
import { Link, useNavigate } from "@tanstack/react-router";
import { useState, type KeyboardEvent, type ReactNode } from "react";
import { fmtCurrency, riyal } from "@/lib/format";
import { translateTo, useLang } from "@/i18n";
import { hasMasterName, masterName } from "@/lib/coreShared/masterName";
import { RUNNERS } from "@/lib/reportRunner";
import { useDevMode } from "@/lib/mode";
import { canonicalPlacementId, IMPL_LABEL, insightsOf, PENDING, placementIds, plainNote, placementsOf, type PlacementType, RUN11_ACTIONS, RUN11_CAPS, RUN11_DOCS, RUN11_QUEUES, RUN11_ROLLOUT, RUN11_SLICE, RUN11_TAB_LABEL, RUN11_TABS, RUN11_VERSION, run11Tab, type Placement, type Run11Tab } from "./run11";
import { can, financeContext } from "./finance";
import { ACCOUNTING_CREATE, CreateMenu, type CreateItem } from "@/components/enterprise/CreateMenu";
import { asOfOf } from "./aging";
import { freshness, roleLabel, type Bi, type Drill } from "./command";
import { ProFrame, SourceBoundary, SourceState } from "./ProFrame";
import { NavText, useNavResolver } from "./ProSidebar";
import { actionState } from "./navAccess";
import { enterContext } from "./navContext";
import { deptById, NAV_AR, pageItems, SECTION_PAGES, targetHref, type NavItem, type SectionPage } from "./nav";
import { reportTabEntries, type ReportEntry, type ReportTab } from "./reportTab";
import { workspaceSpec } from "./run11Formulas";
import { compareAsOf, compareKpi, compareMode, evalChart, evalDoc, evalKpi, evalQueue, figureText, isLinkField, listDrill, sectionCtx, withinWindow, type KpiCompare, type ChartResult, type DocResult, type Filter, type KpiResult, type QueueResult, type SectionCtx, type SectionSpec } from "./sections";
import { ExtraOverview, ExtraWork, extraLeadTiles, hasOverviewExtra, hasWorkExtra } from "./SectionExtras";
import { bi, SecLink, SecState, type SectionSearch } from "./SectionLink";
import { DateInput } from "@/components/form/DateInput";
import { KpiFormulaTip } from "@/components/enterprise/kit/KpiFormula";
import { KpiCard as EntKpiCard } from "@/components/enterprise/kit/KpiCard";
import { DashboardDesigner, openDashboardEditor } from "@/components/dashboards/DashboardDesigner";
import { InsightLines, InsightNotes } from "./InsightLines";
import { WS_CONTRACT, type ContractChart } from "./wsContract";
import type { LinkFor } from "@/components/dashboards/views";
import { blockPane, overviewDashboard, type ProDashParts, type ProPane } from "./proDashboards";
import { Dash92Board, tileItems } from "./Dash92Board";
import { featureEnabled } from "./admin/featureControl";
import { ACC_BOARD, boardCtx, evalBoard, type BlockResult, type BoardResult } from "./dash92";
import { ProDocumentHub } from "./ProHub";
import { readLimited } from "@/lib/scope";
import { amountFigure, AreaChart, ChartCard, ChartRow, ContextStrip, cleanLabel, recordLabel, Columns, DeltaChip, Donut, Funnel, KpiStrip, LINK_CHIP, LinkGroup, MiniStats, Page, RankedBars, SegmentBar, Treemap, Waterfall, WorkPanel, Zone, type Datum, type ScoreRow, type StripItem, type Wrap } from "@/components/enterprise/kit";
import { cachedMeta } from "@/lib/catalog";
/** fixed bucket status → Enterprise chart tone (credit use: within limit / 80–100% / over) */
const BUCKET_TONE = { ok: "good", warn: "attention", bad: "risk", info: "info" } as const;
export { SECTION_KEYS, type SectionSearch } from "./SectionLink";

/** Every DocType a section reads (for meta/permission loading). */
export function sectionDoctypes(spec: SectionSpec): string[] {
  const c = sectionCtx("", "", "2000-01-01");
  return [...new Set([...spec.docs.map((d) => d.doctype), ...spec.kpis(c).map((k) => k.doctype), ...spec.queues(c).map((q) => q.doctype), ...spec.charts(c).map((x) => x.doctype),
    "Sales Invoice", "Purchase Invoice", "GL Entry", "Payment Entry", "Company", "Account", "Bin", "Warehouse", "Stock Ledger Entry", "Item", "Asset", "Asset Depreciation Schedule", "Journal Entry", "Purchase Order", "Purchase Receipt", "Supplier Quotation", "Sales Order", "Delivery Note", "Bank Transaction"])];
}

export function SectionWorkspace({ page, search }: { page: SectionPage; search: SectionSearch }) {
  const ar = useLang() === "ar";
  const spec = workspaceSpec(page.id)!;
  const title = ar ? NAV_AR[page.label] ?? page.label : page.label;
  return <ProFrame bare title={title} subtitle={bi(ar, spec.purpose)} tabs={false} doctypes={sectionDoctypes(spec)} icon={`/icons/digit/mod/digit-mod-${deptById(page.dept)?.icon ?? "reports"}-light.svg`}>
    {({ user }) => <SectionBody page={page} spec={spec} search={search} user={user} ar={ar} />}
  </ProFrame>;
}

/** «+ جديد ▾» of a workspace band (owner CR-01): accounting areas list every accounting document; every workspace lists its own creatable documents. */
export function sectionCreateItems(dept: string, docs: { doctype: string; create?: boolean | undefined }[]): CreateItem[] {
  const own = docs.filter((d) => d.create).map((d) => ({ key: d.doctype, doctype: d.doctype }));
  return dept === "accounting" ? [...ACCOUNTING_CREATE, ...own.filter((o) => !ACCOUNTING_CREATE.some((a) => a.doctype === o.doctype && !a.values))] : own;
}

function SectionBody({ page, spec, search, user, ar }: { page: SectionPage; spec: SectionSpec; search: SectionSearch; user: string; ar: boolean }) {
  const nav = useNavigate();
  const t = (en: string, arabic: string) => (ar ? arabic : en);
  // Exactly three in-content tabs on every workspace (legacy ?tab=work / ?tab=details are rewritten by the route's beforeLoad).
  const slice = RUN11_SLICE.has(page.id);
  const fc = financeContext(search.company, user);
  if (!fc.companies.length) return <SecState status="denied" doctype="Company" />;
  const asOf = asOfOf(search.as_of);
  const ctx = sectionCtx(fc.company, fc.currency, asOf);
  // ADM-01 Feature Control: tabs switched off for every role of this user at this company are not offered
  const tabs = RUN11_TABS.filter((k) => featureEnabled(`ws:${page.id}:${k}`, { user, company: fc.company }));
  const want: Run11Tab = run11Tab(search.tab); const tab: Run11Tab = tabs.includes(want) ? want : tabs[0] ?? want;
  const set = (p: Partial<SectionSearch>) => void nav({ to: "/pro/$dept/$section", params: { dept: page.dept, section: page.slug }, search: ((prev: SectionSearch) => ({ ...prev, ...p })) as never, replace: true });
  const docs = [...spec.docs, ...(RUN11_DOCS[page.id] ?? [])].map((d) => evalDoc(d, ctx, user));
  const primary = spec.docs.find((d) => d.create && can(d.doctype, "create", undefined, user));
  const updated = freshness(spec.docs.map((d) => d.doctype), user);
  const dept = deptById(page.dept)!;
  return <div className="mt-4 space-y-4" data-dp-section-page={page.id} data-dp-section-tab={tab} data-run11-rollout={RUN11_ROLLOUT} {...(slice ? { "data-run11-slice": RUN11_VERSION } : {})}>
    <section aria-label={t("Section context", "سياق القسم")} data-dp-sw-band><ContextStrip icon={<img src={`/icons/digit/mod/digit-mod-${dept.icon ?? "reports"}-dark.svg`} alt="" className="h-7 w-7" />} eyebrow={<><NavText label={dept.label} /> · {bi(ar, spec.role)}</>}
      title={<span data-dp-section-title>{ar ? NAV_AR[page.label] ?? page.label : page.label}</span>} sub={<span data-dp-section-question>{bi(ar, spec.questions)}</span>}
      facts={[{ label: t("Currency", "العملة"), value: <span data-no-i18n>{fc.currency || "—"}</span> }, { label: t("Your role", "دورك"), value: <span>{roleLabel(user).split(" · ").map((x, i) => <span key={x}>{i > 0 && " · "}<NavText label={x} /></span>)}</span> }, { label: t("Data updated", "آخر تحديث للبيانات"), value: <span data-no-i18n>{updated || "—"}</span> }]}
      aside={<span className="contents"><label className="ek-context-select"><span>{t("Company", "الشركة")}</span>{fc.companies.length > 1 ? <select aria-label={t("Company", "الشركة")} className="input h-7 py-0 text-xs" value={fc.company} onChange={(e) => set({ company: e.target.value, bucket: undefined })} data-dp-section-company>
            {fc.companies.map((c) => <option key={c} value={c} data-no-i18n>{c}</option>)}</select> : <span data-no-i18n>{fc.company}</span>}</label><label className="ek-context-select"><span>{t("As of", "حتى تاريخ")}</span><DateInput aria-label={t("As of", "حتى تاريخ")} className="input h-7 py-0 text-xs" value={asOf} onChange={(e) => set({ as_of: e.target.value || undefined })} data-dp-section-asof /></label><label className="ek-context-select"><span>{t("Compare with", "مقارنة مع")}</span><select aria-label={t("Compare with", "مقارنة مع")} className="input h-7 py-0 text-xs" value={compareMode(search.cmp) ?? ""} onChange={(e) => set({ cmp: e.target.value || undefined })} data-dp-section-compare>
          <option value="">{t("No comparison", "بدون مقارنة")}</option><option value="month">{t("Same day last month", "اليوم نفسه من الشهر السابق")}</option><option value="year">{t("Same day last year", "اليوم نفسه من العام السابق")}</option></select></label></span>}
      actions={<>{tab === "overview" && <button type="button" className="ek-context-btn" onClick={() => openDashboardEditor()} data-dash-band-edit>✎ {t("Customize dashboard", "تخصيص اللوحة")}</button>}
          <CreateMenu items={sectionCreateItems(page.dept, spec.docs)} ar={ar} attrs={{ "data-dp-primary": "", "data-dp-section-primary": primary?.doctype ?? "" }} /></>} /></section>

    <nav className="dp-tabs dp-sw-tabs" role="tablist" aria-label={t("Section views", "عروض القسم")} data-dp-section-tabs data-dp-tab-contract="run11-3" onKeyDown={onTabKey}>
      {tabs.map((k) => <Link key={k} role="tab" aria-selected={tab === k} tabIndex={tab === k ? 0 : -1} aria-controls="dp-section-tabpanel" to="/pro/$dept/$section" params={{ dept: page.dept, section: page.slug }} search={((prev: SectionSearch) => ({ ...prev, tab: k === "overview" ? undefined : k })) as never} replace
        className={`dp-tab ${tab === k ? "dp-tab-active" : ""}`} data-dp-section-tab-link={k}>{bi(ar, RUN11_TAB_LABEL[k])}</Link>)}
    </nav>

    <SourceBoundary title={page.label} resetKey={`${page.id}-${tab}`}>
      <div role="tabpanel" id="dp-section-tabpanel" tabIndex={-1} data-dp-tabpanel={tab}>
        {tab === "overview" && <Run11Overview page={page} spec={spec} ctx={ctx} user={user} ar={ar} search={search} set={set} />}
        {tab === "documents" && <Run11Work page={page} spec={spec} ctx={ctx} user={user} ar={ar} search={search} set={set} docs={docs} />}
        {tab === "reports" && <Run11Reports page={page} spec={spec} ctx={ctx} user={user} ar={ar} search={search} set={set} docs={docs} />}
      </div>
    </SourceBoundary>
  </div>;
}

type PaneProps = { page: SectionPage; spec: SectionSpec; ctx: SectionCtx; user: string; ar: boolean; search: SectionSearch; set: (p: Partial<SectionSearch>) => void };

/* ------------------------------------------------------------------ Overview ------------------------------------------------------------------ */
/** Original Overview renderers handed to the shared Dashboard Designer contract (proDashboards.tsx), so defaults stay identical. */
const DASH_PARTS: ProDashParts = {
  kpi: (k, p, placement) => <KpiCard k={k} page={p.page} ar={p.ar} currency={p.ctx.currency} placement={placement} cmp={kpiCmp(k, p)} asOf={p.ctx.asOf} window={(p as PaneProps & Partial<Pick<ProPane, "win">>).win} />,
  chart: (c, p, placement, force, x) => <ChartPanel c={c} page={p.page} ar={p.ar} currency={p.ctx.currency} placement={placement} force={force} stats={x?.stats} cmp={(p as ProPane).blockCmp} />,
  queue: (q, p, placement) => <QueuePanel q={q} page={p.page} ar={p.ar} compact placement={placement} />,
  queueAuto: (p, golden) => <AutoQueue p={p} golden={golden} />,
  extra: (p, part, golden) => (golden && part === "lead"
    ? <div data-run11-placement={idsWith(p.page.id, (k) => k.startsWith("dues:") || k.startsWith("ageing:"))}><ExtraOverview {...p} part="lead" folded /></div>
    : <ExtraOverview {...p} part={part} />),
  pending: (p) => <PendingFigures page={p.page} ctx={p.ctx} ar={p.ar} />,
  hasExtra: (spec, part) => hasOverviewExtra(spec, part),
  hasPending: (id) => placementsOf(id).some((x) => (x.type === "KPI" || x.type === "CHART") && (PENDING.has(x.impl) || x.impl === "PARTIAL")),
  placement: (id, key) => placementIds(id, key),
};
/** The registered dashboard contract of a workspace (ADM-02 Dashboard Control lists and publishes its blocks). */
export function sectionDashboardDef(pageId: string) { const page = SECTION_PAGES.find((p) => p.id === pageId); const spec = workspaceSpec(pageId); return page && spec ? overviewDashboard(page, spec, true, DASH_PARTS) : undefined; }

const proLink = (page: SectionPage): LinkFor => (drill, children, attrs) => <SecLink drill={drill as Drill} page={page} className="hover:underline" {...(attrs ?? {})}>{children}</SecLink>;
function AutoQueue({ p }: { p: PaneProps; golden: boolean }) {
  const { page, spec, ctx, user, ar } = p;
  const t = (en: string, arabic: string) => (ar ? arabic : en);
  // owner 2026-11-13: the worklist holds EVERY queue of the section as a tab (most urgent first), fixed height, rows open their documents
  const queues = spec.queues(ctx).map((q) => evalQueue(q, ctx, user, 10)).filter((q) => q.status !== "denied");
  const first = queues.find((q) => q.status === "ok" && q.count) ?? queues[0];
  const [sel, setSel] = useQueueTab(page.id, first?.id);
  if (!first) return null;
  const cur = queues.find((q) => q.id === sel) ?? first;
  const goto = <Link to="/pro/$dept/$section" params={{ dept: page.dept, section: page.slug }} search={toTab("documents")} className="ek-card-link" data-dp-section-goto-work>{t("All work in Documents & work", "كل الأعمال في المستندات والعمليات")} {ar ? "←" : "→"}</Link>;
  return <div data-dp-worklist={page.id}><WorkPanel id={`ws-${page.id}-work`} title={t("Worklist", "قائمة العمل")} sub={bi(ar, cur.action)} height={340} actions={goto} active={cur.id} onTab={setSel}
    tabs={queues.map((q) => ({ id: q.id, label: bi(ar, q.label), count: q.status === "ok" ? q.count : undefined, tone: q.severity === "high" && q.count ? "risk" as const : q.count ? "attention" as const : undefined, attrs: { "data-dp-queue-tab": q.id },
      content: q.id === cur.id ? <QueuePanel q={q} page={page} ar={ar} compact bare placement={placementIds(page.id, `queue:${q.id}`)} /> : null }))} /></div>;
}
function useQueueTab(pageId: string, first: string | undefined): [string | undefined, (id: string) => void] {
  const [v, setV] = useState<{ page: string; id: string } | null>(null);
  return [v && v.page === pageId ? v.id : first, (id) => setV({ page: pageId, id })];
}
/** S6-b: the KPI for the comparison date chosen in the context bar (same control on all 20 workspaces). */
function kpiCmp(k: KpiResult, p: PaneProps): KpiCompare | undefined {
  const bp = p as PaneProps & Partial<Pick<ProPane, "win" | "blockCmp">>;
  if (bp.blockCmp === "none") return undefined;
  // a block with its own period compares with the window before it (or the same window a year earlier)
  if (bp.win) {
    const mode = bp.blockCmp ?? (compareMode(p.search.cmp) === "year" ? "year" : "prev");
    const shift = (iso: string) => (mode === "year" ? compareAsOf(iso, "year") : new Date(Date.parse(`${iso}T00:00:00Z`) - bp.win!.days * 86400000).toISOString().slice(0, 10));
    const from = shift(bp.win.from), to = shift(bp.win.to);
    const prev = { ...sectionCtx(p.ctx.company, p.ctx.currency, to), from30: from, from90: from, from12: from, monthFrom: from };
    const d = p.spec.kpis(prev).find((x) => x.id === k.id);
    return compareKpi(k, d ? withinWindow(d, from, to) : undefined, prev, p.user);
  }
  const mode = bp.blockCmp === "prev" ? "month" : bp.blockCmp === "year" ? "year" : compareMode(p.search.cmp); if (!mode) return undefined;
  const prev = sectionCtx(p.ctx.company, p.ctx.currency, compareAsOf(p.ctx.asOf, mode));
  return compareKpi(k, p.spec.kpis(prev).find((x) => x.id === k.id), prev, p.user);
}
/** A workspace KPI as a scorecard row: this period, the comparison period (the page's compare choice, else the month before) and the change. */
export function kpiScore(p: PaneProps, kid: string, o: Record<string, string>): ScoreRow | undefined {
  const pane = blockPane(p as ProPane, o) as PaneProps;
  const d0 = p.spec.kpis(pane.ctx).find((x) => x.id === kid); if (!d0) return undefined;
  const pw = pane as PaneProps & Partial<Pick<ProPane, "win">>;
  const k = evalKpi(pw.win ? withinWindow(d0, pw.win.from, pw.win.to) : d0, pane.ctx, p.user);
  if (k.status === "denied" || k.status === "unavailable") return undefined;
  const money = (k.measure || k.value) && k.totals.length === 1;
  const fmt = (count: number, totals: { currency: string; amount: number }[]) => (k.figure && totals === k.totals ? figureText(k.figure, p.ar).split(" · ")[0]! : money && totals.length === 1 ? fmtCurrency(totals[0]!.amount, totals[0]!.currency || p.ctx.currency) : count.toLocaleString("en-US"));
  const base = compareMode(p.search.cmp) || (pane as Partial<ProPane>).blockCmp ? pane : ({ ...pane, blockCmp: "prev" } as PaneProps);
  const c = kpiCmp(k, base);
  const cur = money ? k.totals[0]!.amount : k.count, was = c?.comparable ? (money ? c.totals.find((x) => x.currency === k.totals[0]!.currency)?.amount ?? 0 : c.count) : null;
  const pctV = was !== null && was !== 0 ? Math.round(((cur - was) / Math.abs(was)) * 1000) / 10 : null;
  return { id: `kpi:${kid}`, label: <>{bi(p.ar, k.label)}<KpiFormulaTip def={k} asOf={pane.ctx.asOf} window={pw.win} ar={p.ar} label={bi(p.ar, k.label)} /></>, value: fmt(k.count, k.totals), prev: c?.comparable ? <bdi data-no-i18n>{fmt(c.count, c.totals)}</bdi> : <span className="ek-score-flat" data-ek-prev="current">{p.ar ? "حالة حالية" : "Current state"}</span>,
    pct: pctV, better: k.tone === "risk" || k.tone === "action" ? "down" : "up", sub: bi(p.ar, k.hint), tone: k.count > 0 ? (k.tone === "risk" ? "risk" : k.tone === "action" ? "attention" : undefined) : undefined,
    wrap: (n) => <SecLink drill={k.drill} page={p.page} data-dp-score-kpi={kid}>{n}</SecLink>, attrs: { "data-dp-kpi": kid, "data-status": k.status } };
}
export function KpiCard({ k, page, ar, currency, placement, cmp, asOf, window }: { k: KpiResult; page: SectionPage; ar: boolean; currency: string; placement?: string | undefined; cmp?: KpiCompare | undefined; asOf?: string | undefined; window?: { from: string; to: string } | undefined }) {
  const t = (en: string, arabic: string) => (ar ? arabic : en);
  const tone = k.count > 0 ? (k.tone === "risk" ? "risk" : k.tone === "action" ? "attention" : undefined) : undefined;
  const pl = placement ? { "data-run11-placement": placement } : {};
  const off = k.status === "denied" || k.status === "unavailable";
  const delta = cmp?.comparable && cmp.count ? Math.round(((k.count - cmp.count) / Math.abs(cmp.count)) * 100) : null;
  const shown = k.figure ? figureText(k.figure, ar).split(" · ")[0]! : (k.measure || k.value) && k.totals.length === 1 ? fmtCurrency(k.totals[0]!.amount, k.totals[0]!.currency || currency) : k.count.toLocaleString("en-US");
  const meta = <>
    {k.figure && figureText(k.figure, ar).includes(" · ") && <span data-no-i18n>{figureText(k.figure, ar).split(" · ").slice(1).join(" · ")} · </span>}
    {(k.figure || ((k.measure || k.value) && k.totals.length === 1)) && <span data-dp-kpi-records><bdi className="tabular-nums" data-no-i18n>{k.count.toLocaleString("en-US")}{k.base !== undefined ? ` / ${k.base.toLocaleString("en-US")}` : ""}</bdi> {t("records", "سجل")} · </span>}
    {(k.measure || k.value) && k.totals.length > (k.figure ? 0 : 1) && <span data-dp-kpi-total>{k.totals.map((x) => <bdi key={x.currency} className="me-2 inline-block whitespace-nowrap tabular-nums" data-no-i18n>{fmtCurrency(x.amount, x.currency || currency)}</bdi>)}</span>}
    {k.status === "empty" && <span>{t("None at the moment", "لا يوجد حاليًا")} · </span>}
    {cmp && (cmp.comparable
      ? <span data-dp-kpi-compare={cmp.count} data-dp-kpi-delta={k.count - cmp.count}>{t("vs", "مقابل")} <bdi className="tabular-nums" data-no-i18n>{cmp.asOf}</bdi>: <bdi className="tabular-nums" data-no-i18n>{cmp.count.toLocaleString("en-US")}</bdi> · </span>
      : <span data-dp-kpi-compare="none">{t("Current state — no history to compare", "حالة حالية — لا سجل سابق للمقارنة")} · </span>)}
    {readLimited(k.doctype) && <span data-dp-limited>{t("Limited to records you can see", "يقتصر على السجلات المسموح لك برؤيتها")} · </span>}
    <span data-dp-kpi-basis>{bi(ar, k.hint)}</span>
  </>;
  // the one Enterprise KPI card (Round 1 §4); the section only passes its figure, comparison, basis and drill
  const card = (Root?: (p: { className: string; children: ReactNode } & Record<string, unknown>) => ReactNode) => <EntKpiCard ar={ar} label={bi(ar, k.label)} info={asOf ? <KpiFormulaTip def={k} asOf={asOf} window={window} ar={ar} label={bi(ar, k.label)} /> : undefined}
    value={shown} delta={delta !== null ? { pct: delta } : undefined} meta={meta} tone={tone}
    state={off ? <SecState status={k.status as "denied" | "unavailable"} doctype={k.doctype} /> : undefined}
    attrs={{ "data-dp-kpi": k.id, "data-status": k.status, "data-dp-kpi-count": k.count, ...(k.figure ? { "data-dp-kpi-figure": k.figure.value } : {}), ...pl }} Root={Root} />;
  if (off) return card();
  return card((rp) => <SecLink drill={k.drill} page={page} {...(rp as Record<string, unknown>)} title={`${t("Open the matching documents", "فتح المستندات المطابقة")} — ${bi(ar, k.label)}`} qvTitle={bi(ar, k.label)}>{rp.children}</SecLink>);
}
/** A workspace KPI as an item of the page's one indicator row (its id is the figure a matching insight line names). */
export function kpiStripItem(k: KpiResult, page: SectionPage, ar: boolean, currency: string, placement?: string, cmp?: KpiCompare, asOf?: string): StripItem {
  return { key: `kpi:${k.id}`, figures: [k.totals.length === 1 && (k.measure || k.value) ? amountFigure(k.totals[0]!.amount) : undefined], node: <KpiCard key={k.id} k={k} page={page} ar={ar} currency={currency} asOf={asOf} placement={placement} cmp={cmp} /> };
}

const monthLabel = (m: string, ar: boolean) => { const d = new Date(`${m}-01T00:00:00Z`); return Number.isFinite(d.getTime()) ? d.toLocaleDateString(ar ? "ar-u-ca-gregory-nu-latn" : "en-US", { month: "short", year: "numeric", timeZone: "UTC" }) : m; };
export function ChartPanel({ c, page, ar, currency, placement, force, stats, cmp }: { c: ChartResult; page: SectionPage; ar: boolean; currency: string; placement?: string | undefined; force?: ContractChart | undefined; stats?: boolean | undefined; cmp?: "prev" | "year" | "none" | undefined }) {
  const t = (en: string, arabic: string) => (ar ? arabic : en);
  const valued = c.bars.some((b) => b.value !== null);
  const cur = c.currencies[0] || currency;
  const dataLabel = c.kind === "field" && isLinkField(c.doctype, c.field);
  type Bar = (typeof c.bars)[number];
  const val = (b: Bar) => (valued ? b.value ?? 0 : b.count);
  // display label as text for the kit: record values (party, warehouse, branch …) stay untranslated and lose the company suffix
  const lab = (b: Bar): { label: string; data: boolean } => c.labels?.[b.key] ? { label: bi(ar, c.labels[b.key]!), data: false } : c.kind === "month" && /^\d{4}-\d{2}$/.test(b.key) ? { label: monthLabel(b.key, ar), data: true }
    : c.bucket || c.fn ? { label: cleanLabel(b.label), data: true } : b.label ? (dataLabel && !cachedMeta(b.label) ? { label: ar ? translateTo(recordLabel(b.label), "ar") : recordLabel(b.label), data: true } : { label: ar ? NAV_AR[b.label] ?? translateTo(b.label, "ar") : b.label, data: false }) : { label: t("Not set", "غير محدد"), data: false };
  const amount = (v: number) => (valued ? (c.unit === "qty" ? v.toLocaleString("en-US", { maximumFractionDigits: 2 }) : fmtCurrency(v, cur)) : String(v));
  const short = (v: number) => { const k = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(v); return valued && c.unit !== "qty" ? (cur === "SAR" ? riyal(k) : `${cur} ${k}`) : k; };
  // OWN-44: months and ordered bands (ageing, expiry horizon, cohorts) read as columns, a split of up to five parts as a donut
  // (owner 2026-11-12: donut max 5), longer rankings as ranked bars — every bar, column and legend row drills
  // OWN-67: a chart the workspace's design contract names is drawn in the contract's type (trend → line, composition/ageing →
  // stacked bar, ranking → ranked bar, bridge → waterfall, conversion → funnel with drop-off)
  const auto: "area" | "columns" | "donut" | "bars" = c.view === "area" && c.bars.length >= 3 ? "area" : c.kind === "month" || ((c.bucket || c.fn) && c.bars.length <= 12) ? "columns"
    : c.bars.length >= 2 && c.bars.length <= 5 && c.bars.every((b) => val(b) >= 0) ? "donut" : "bars";
  const nonNeg = c.bars.every((b) => val(b) >= 0);
  const view: "area" | "columns" | "donut" | "bars" | "segments" | "waterfall" | "funnel" | "treemap" = force === "ranked" ? "bars" : force === "line" ? (c.bars.length >= 2 ? "area" : "bars")
    : force === "stacked" ? (nonNeg ? "segments" : "bars") : force === "waterfall" ? "waterfall" : force === "funnel" ? "funnel"
    : force === "columns" ? "columns" : force === "donut" ? (nonNeg && c.bars.length >= 2 ? "donut" : "bars") : force === "treemap" ? (nonNeg && c.bars.length >= 2 ? "treemap" : "bars") : auto;
  const data: Datum[] = c.bars.map((b) => { const l = lab(b); const v = val(b); return { key: b.key, label: l.label, data: l.data, value: v, count: b.count, drill: b.drill, tone: c.tones?.[b.key] ? BUCKET_TONE[c.tones[b.key]!] : v < 0 ? "risk" : undefined, attrs: { "data-dp-chart-bar": b.key, "data-count": String(b.count) } }; });
  const wrap: Wrap = (drill, children, attrs) => <SecLink drill={drill as Drill} page={page} className="ek-hit" {...(attrs ?? {})}>{children}</SecLink>;
  const yearCmp = cmp === "year" && c.status === "ok" && c.kind === "month" && c.bars.length >= 13 ? (() => {
    const a = c.bars[c.bars.length - 2]!, b = c.bars[c.bars.length - 14] ?? c.bars[0]!; const va = val(a), vb = val(b);
    const pctV = vb ? Math.round(((va - vb) / Math.abs(vb)) * 100) : null;
    return <p className="flex flex-wrap items-center gap-1" data-dp-chart-compare={c.id} data-compare="year" data-delta={pctV ?? ""}><span>{t("Last full month", "آخر شهر مكتمل")}</span> <bdi data-no-i18n>{monthLabel(a.key, ar)}</bdi>: <bdi className="font-medium" data-no-i18n>{amount(va)}</bdi><span>·</span>
      {pctV === null ? <span>{t("no figure a year earlier", "لا رقم قبل عام")}</span> : <><DeltaChip d={{ pct: pctV }} ar={ar} /> <span>{t("vs", "مقابل")}</span> <bdi data-no-i18n>{monthLabel(b.key, ar)}</bdi> (<bdi data-no-i18n>{amount(vb)}</bdi>)</>}</p>;
  })() : undefined;
  const compare = cmp === "none" ? undefined : yearCmp ?? (c.status === "ok" && c.kind === "month" && c.bars.length >= 3 ? (() => {
    // SH-012 period comparison: the last complete month against the month before it (the current month is still open)
    const a = c.bars[c.bars.length - 2]!, b = c.bars[c.bars.length - 3]!; const va = val(a), vb = val(b);
    const pct = vb ? Math.round(((va - vb) / Math.abs(vb)) * 100) : null;
    return <p className="flex flex-wrap items-center gap-1" data-dp-chart-compare={c.id} data-delta={pct ?? ""}>
      <span>{t("Last full month", "آخر شهر مكتمل")}</span> <bdi data-no-i18n>{monthLabel(a.key, ar)}</bdi>: <bdi className="font-medium" data-no-i18n>{amount(va)}</bdi>
      <span>·</span>
      {pct === null ? <span>{t("no figure the month before", "لا رقم في الشهر السابق")}</span>
        : <><DeltaChip d={{ pct }} ar={ar} /> <span>{t("vs", "مقابل")}</span> <bdi data-no-i18n>{monthLabel(b.key, ar)}</bdi> (<bdi data-no-i18n>{amount(vb)}</bdi>)</>}
    </p>;
  })() : undefined);
  return <ChartCard title={bi(ar, c.label)} sub={<><NavText label={c.doctype} />{c.measure && !valued && c.currencies.length > 1 ? ` · ${t("several currencies — showing document counts", "عملات متعددة — يعرض عدد المستندات")}` : ""}{c.status === "ok" && readLimited(c.doctype) ? <span data-dp-limited> · {t("Limited to records you can see", "يقتصر على السجلات المسموح لك برؤيتها")}</span> : null}</>}
    footer={compare} attrs={{ "data-dp-section-chart": c.id, "data-dp-chart-view": view, ...(placement ? { "data-run11-placement": placement } : {}) }}>
    {c.status !== "ok" ? <SecState status={c.status} doctype={c.doctype} />
      : !c.bars.length || c.bars.every((b) => !b.count) ? <SecState status="empty" doctype={c.doctype} />
      : <>{stats && <MiniStats data={data} fmt={amount} ar={ar} />}{view === "columns" ? <div data-dp-chart-cols={c.bars.length}><Columns data={data} fmt={amount} axisFmt={short} ar={ar} wrap={wrap} height={196} /></div>
      : view === "area" ? <div data-dp-chart-area={c.bars.length}><AreaChart data={data} fmt={amount} axisFmt={short} ar={ar} wrap={wrap} height={190} /></div>
      : view === "donut" ? <div data-dp-chart-donut={c.bars.length}><Donut data={data} fmt={amount} centerFmt={short} ar={ar} wrap={wrap} /></div>
      : view === "treemap" ? <div data-dp-chart-treemap={c.bars.length}><Treemap data={data} fmt={amount} ar={ar} wrap={wrap} height={220} /></div>
      : view === "segments" ? <SegmentBar data={data} fmt={amount} ar={ar} wrap={wrap} tones={c.bucket ? "aging" : "series"} />
      : view === "waterfall" ? <Waterfall data={data.map((d, i) => (i === 0 || i === data.length - 1 ? { ...d, key: `=${d.key}` } : d))} fmt={amount} axisFmt={short} ar={ar} wrap={wrap} height={200} />
      : view === "funnel" ? <Funnel data={data} fmt={amount} ar={ar} wrap={wrap} />
      : <RankedBars data={data} fmt={amount} ar={ar} wrap={wrap} max={c.bars.length} sort={force === "ranked" && c.kind === "field" && !c.bucket && !c.fn} />}</>}
  </ChartCard>;
}

export function QueuePanel({ q, page, ar, compact = false, footer, placement, bare = false }: { q: QueueResult; page: SectionPage; ar: boolean; compact?: boolean; footer?: ReactNode; placement?: string | undefined; bare?: boolean }) {
  const t = (en: string, arabic: string) => (ar ? arabic : en);
  if (q.status === "denied") return null; // a queue over a document type the role cannot read is hidden (owner decision 2026-11-11)
  const showParty = q.rows.some((r) => r.party && !(hasMasterName(r.doctype) && r.party === masterName(r.doctype, r.name)));
  const all = q.status === "ok" && q.count > 0 && <SecLink drill={q.drill} page={page} className="ms-auto text-xs text-primary hover:underline" data-dp-queue-all={q.id}>{t("Open all in the native list", "فتح الكل في القائمة الأصلية")} ({q.count})</SecLink>;
  return <section className={bare ? "dp-cc-queue-bare" : "dp-cc-panel"} data-dp-section-queue={q.id} {...(placement ? { "data-run11-placement": placement } : {})}>
    {bare ? (all ? <div className="flex items-center px-4 py-1.5">{all}</div> : null) : <header className="dp-cc-panel-h">
      <h3>{bi(ar, q.label)}</h3>
      <span className="dp-cc-badge" {...(q.severity === "high" && q.count ? { "data-tone": "bad" } : {})} data-no-i18n>{q.count}</span>
      <span className="dp-cc-note">{t("Next step", "الخطوة التالية")}: {bi(ar, q.action)}</span>
      {all}
    </header>}
    <div className="dp-cc-panel-b overflow-auto p-0" style={{ maxHeight: compact ? 320 : 440 }} data-dp-queue-scroll>
      {q.status !== "ok" ? <div className="px-4"><SecState status={q.status} doctype={q.doctype} /></div>
        : !q.rows.length ? <div className="px-4 py-3" data-dp-queue-clear={q.id} data-dp-state="empty">
          {/* EQ-01: an empty queue explains itself and stays verifiable in the native list (same filter), never a bare "Nothing to show". */}
          <p className="text-sm font-medium text-success">✓ {t("Nothing waiting", "لا يوجد ما ينتظر")}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{t("No document matches this check for the current company and date, so no action is needed now.", "لا يوجد مستند يطابق هذا الفحص للشركة والتاريخ الحاليين، لذلك لا يلزم أي إجراء الآن.")}</p>
          <SecLink drill={q.drill} page={page} className="mt-1 inline-block text-xs text-primary hover:underline" data-dp-queue-verify={q.id}>{t("Check in the native list", "التحقق في القائمة الأصلية")}</SecLink>
        </div>
        : <table className="dp-cc-table">
          {/* owner notes A-07: a master row (customer, supplier, item …) shows its name, the code stays in the tooltip; the party
              column repeats nothing already shown */}
          <thead><tr><th><NavText label={q.doctype} /></th>{showParty && <th>{t("Party / reference", "الطرف / المرجع")}</th>}<th>{t("Date", "التاريخ")}</th>{q.overdueFrom && <th>{t("Days", "الأيام")}</th>}{q.rows.some((r) => r.amount !== null) && <th className="text-end">{t("Amount", "المبلغ")}</th>}</tr></thead>
          <tbody>{q.rows.map((r) => <tr key={r.name} data-dp-queue-row={r.name}>
            <td className="whitespace-nowrap"><SecLink drill={{ kind: "doc", doctype: r.doctype, name: r.name }} page={page} className="font-medium text-primary hover:underline" data-dp-doc-link={r.name}><bdi data-no-i18n title={hasMasterName(r.doctype) ? r.name : undefined}>{hasMasterName(r.doctype) ? (ar ? translateTo(masterName(r.doctype, r.name), "ar") : masterName(r.doctype, r.name)) : r.name}</bdi></SecLink></td>
            {showParty && <td className="max-w-[16rem] truncate">{r.party ? <bdi data-no-i18n>{ar ? translateTo(r.party, "ar") : r.party}</bdi> : "—"}</td>}
            <td className="whitespace-nowrap" data-no-i18n>{r.date || "—"}</td>
            {q.overdueFrom && <td className="whitespace-nowrap">{r.days === null ? "—" : r.days > 0 ? <span className="text-destructive">{t(`${r.days} days late`, `متأخر ${r.days} يوم`)}</span> : <span className="text-muted-foreground">{t(`in ${-r.days} days`, `خلال ${-r.days} يوم`)}</span>}</td>}
            {q.rows.some((x) => x.amount !== null) && <td className="whitespace-nowrap text-end tabular-nums" data-no-i18n>{r.amount === null ? "—" : QTY_FIELDS.has(q.amount ?? "") ? r.amount.toLocaleString("en-US") : fmtCurrency(r.amount, r.currency)}</td>}
          </tr>)}</tbody>
        </table>}
      {compact && q.count > q.rows.length && <p className="px-4 py-2 text-xs text-muted-foreground">{t(`Showing ${q.rows.length} of ${q.count}`, `عرض ${q.rows.length} من ${q.count}`)}</p>}
    </div>
    {footer && <div className="border-t border-border px-4 py-2">{footer}</div>}
  </section>;
}

/* ------------------------------------------------------------------ Documents ------------------------------------------------------------------ */
/** `more={false}` when the native document hub renders the section's other documents in its process groups (no duplicate list). */
function Documents({ page, docs, ar, placementOf, more: showMore = true }: { page: SectionPage; docs: DocResult[]; ar: boolean; placementOf?: (doctype: string) => string | undefined; more?: boolean }) {
  const t = (en: string, arabic: string) => (ar ? arabic : en);
  const r = useNavResolver();
  const canonical = new Set(docs.map((d) => d.doctype));
  const more = dedupe(pageItems(page).filter((i) => (i.target.kind === "doctype" || i.target.kind === "tree") && !(i.target.kind === "doctype" && !i.target.filters && canonical.has(i.target.doctype))));
  return <div className="space-y-4">
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3" data-dp-section-docs>
      {docs.filter((d) => d.status !== "denied").map((d) => { // a document type the role cannot read is hidden (owner decision 2026-11-11)
        const owner = d.owner !== page.dept ? deptById(d.owner) : undefined;
        const creatable = d.create && d.status === "ok" && can(d.doctype, "create");
        const pl = placementOf?.(d.doctype);
        return <article key={d.doctype} className="dp-cc-panel flex flex-col" data-dp-section-doc={d.doctype} data-status={d.status} {...(pl ? { "data-run11-placement": pl } : {})}>
          <header className="dp-cc-panel-h">
            <h3><NavText label={d.doctype} /></h3>
            {owner && <span className="chip bg-muted text-[11px]" data-dp-doc-owner={owner.id}><NavText label="Owner" />: <NavText label={owner.label} /></span>}
          </header>
          <div className="dp-cc-panel-b flex flex-1 flex-col gap-2 text-sm">
            <p className="text-xs text-muted-foreground">{bi(ar, d.role)}</p>
            {d.ledger && <p className="text-[11px] text-muted-foreground" data-dp-doc-ledger>{t("Read-only: these rows are written only when documents are submitted.", "للقراءة فقط: تُكتب هذه القيود عند اعتماد المستندات فقط.")}</p>}
            {d.status !== "ok" ? <SecState status={d.status} doctype={d.doctype} /> : d.tool ? <p className="text-[11px] text-muted-foreground" data-dp-doc-tool>{t("A single native tool screen; it changes records only when you confirm inside it.", "شاشة أداة أصلية واحدة؛ لا تغيّر السجلات إلا عند التأكيد داخلها.")}</p> : <dl className="grid grid-cols-3 gap-2 text-center">
              <div><dt className="text-[11px] text-muted-foreground">{t("Records", "السجلات")}</dt><dd className="font-semibold tabular-nums" data-no-i18n data-dp-doc-total>{d.total}</dd></div>
              <div><dt className="text-[11px] text-muted-foreground">{t("Drafts", "مسودات")}</dt><dd className="font-semibold tabular-nums" data-no-i18n>{d.drafts ?? "—"}</dd></div>
              <div><dt className="text-[11px] text-muted-foreground">{t("Submitted", "معتمدة")}</dt><dd className="font-semibold tabular-nums" data-no-i18n>{d.submitted ?? "—"}</dd></div>
            </dl>}
            {!d.tool && d.latest && <p className="text-[11px] text-muted-foreground">{t("Last change", "آخر تعديل")}: <bdi data-no-i18n>{d.latest}</bdi></p>}
            {d.status === "ok" && <div className="mt-auto flex flex-wrap gap-2 pt-1">
              <SecLink drill={d.drill} page={page} className="btn-ghost py-0.5 text-xs" data-dp-doc-open={d.doctype}>{d.tool ? t("Open tool", "فتح الأداة") : t("Open register", "فتح السجل")}</SecLink>
              {d.submittable && !!d.drafts && <SecLink drill={d.draftDrill} page={page} className="btn-ghost py-0.5 text-xs" data-dp-doc-drafts={d.doctype}>{t("Drafts", "المسودات")} ({d.drafts})</SecLink>}
              {creatable && <SecLink drill={{ kind: "doc", doctype: d.doctype, name: "new" }} page={page} className="btn-primary ms-auto py-0.5 text-xs" data-dp-doc-new={d.doctype}>+ {t("New", "جديد")}</SecLink>}
            </div>}
          </div>
        </article>;
      })}
    </div>
    {showMore && more.length > 0 && <section className="dp-cc-panel" data-dp-section-more>
      <header className="dp-cc-panel-h"><h3>{t("More documents and filtered views in this section", "مستندات وعروض مصفّاة أخرى في هذا القسم")}</h3></header>
      <ul className="dp-cc-chips pt-3">{more.filter((i) => r.state(i) !== "denied").map((i, k) => <li key={k}><ItemLink i={i} page={page} r={r} className="dp-cc-chip" /></li>)}</ul>
    </section>}
  </div>;
}

const dedupe = (xs: NavItem[]) => { const seen = new Set<string>(); return xs.filter((i) => { const k = `${i.label}|${JSON.stringify(i.target)}`; if (seen.has(k)) return false; seen.add(k); return true; }); };
/** `clear` = a clarified bilingual label (reportTab.ts CLEAR_LABEL) shown instead of the shared translation of i.label. */
function ItemLink({ i, page, r, className, clear }: { i: NavItem; page: SectionPage; r: ReturnType<typeof useNavResolver>; className: string; clear?: Bi | undefined }) {
  const st = r.state(i); const h = st === "unavailable" || st === "denied" ? undefined : targetHref(i.target, r.appOf);
  const ar = useLang() === "ar";
  const text = clear ? <span data-no-i18n data-dp-label-clarified>{bi(ar, clear)}</span> : <NavText label={i.label} />;
  if (!h) return <span className={`${className} opacity-60`} data-dp-item-state={st} data-dp-item={i.label} title={i.target.kind === "missing" ? i.target.reason : undefined}>{text} <span className="text-[10px] text-muted-foreground">{st === "denied" ? <NavText label="Not Permitted" /> : <NavText label="Unavailable" />}</span></span>;
  return <Link to={h.to as never} params={h.params as never} search={(h.search ?? {}) as never} className={className} data-dp-item={i.label} data-dp-kind={i.target.kind}
    onClick={() => enterContext(page.dept, h.to.replace(/\$(\w+)/g, (_, k: string) => h.params?.[k] ?? ""), page.slug)} {...(i.hint ? { title: ar ? NAV_AR[i.hint] ?? i.hint : i.hint } : {})}>
    <span className="min-w-0">{text}{i.hint && <span className="block text-[11px] text-muted-foreground">{ar ? NAV_AR[i.hint] ?? i.hint : i.hint}</span>}</span>
  </Link>;
}

/* ------------------------------------------------------------------ Reports ------------------------------------------------------------------ */
function Reports({ page, ar, tab }: { page: SectionPage; ar: boolean; tab: ReportTab }) {
  const t = (en: string, arabic: string) => (ar ? arabic : en);
  const r = useNavResolver();
  // one entry per destination with clarified labels (reportTab.ts); gaps = capabilities this Core does not have: shown honestly, never linked
  const { pro, native, gaps } = tab;
  const items = [...pro, ...native];
  const group = (label: Bi, all: ReportEntry[], id: string) => { const xs = all.filter((e) => r.state(e.item) !== "denied"); return xs.length > 0 && <section className="dp-cc-panel" data-dp-section-reports={id}>
    <header className="dp-cc-panel-h"><h3>{bi(ar, label)}</h3><span className="dp-cc-badge" data-no-i18n>{xs.length}</span></header>
    <ul className="grid gap-2 p-3 sm:grid-cols-2 xl:grid-cols-3">{xs.map((e) => <li key={e.key}><ItemLink i={e.item} page={page} r={r} className="dp-cc-chip w-full" clear={e.clear} /></li>)}</ul>
  </section>; };
  return <div className="space-y-4" data-dp-reports-contract="source-v1">
    {/* OWN-03: the section's own analysis screens, then its reports — each once, no "original system" label */}
    {group(["Analysis", "التحليلات"], pro, "pro")}
    {group(["Reports", "التقارير"], native, "native")}
    {gaps.length > 0 && <section className="dp-cc-panel" data-dp-section-gaps>
      <header className="dp-cc-panel-h"><h3>{t("Not available in this system", "غير متاح في هذا النظام")}</h3><span className="dp-cc-badge" data-no-i18n>{gaps.length}</span></header>
      <ul className="grid gap-2 p-3 sm:grid-cols-2">{gaps.map((i) => <li key={i.label} className="dp-cc-chip w-full opacity-75" data-dp-item-state="unavailable" data-dp-item={i.label}>
        <span className="min-w-0"><NavText label={i.label} /><span className="block text-[11px] text-muted-foreground">{i.target.kind === "missing" ? (ar ? NAV_AR[i.target.reason] ?? i.target.reason : i.target.reason) : ""}</span></span>
      </li>)}</ul>
    </section>}
    {!items.length && <SourceState status="empty" />}
  </div>;
}

/* ------------------------------------------------------------------ Details ------------------------------------------------------------------ */
export function filterText(fs: Filter[]): string {
  return fs.map(([f, op, v]) => `${f} ${op} ${Array.isArray(v) ? v.join(", ") : String(v)}`).join(" · ");
}
function Details({ page, spec, ctx, docs, ar }: { page: SectionPage; spec: SectionSpec; ctx: SectionCtx; docs: DocResult[]; ar: boolean }) {
  const t = (en: string, arabic: string) => (ar ? arabic : en);
  const siblings = SECTION_PAGES.filter((x) => x.dept === page.dept && x.id !== page.id);
  const d = deptById(page.dept)!;
  const kpis = spec.kpis(ctx);
  return <div className="space-y-4">
    <section className="dp-cc-panel" data-dp-section-flow>
      <header className="dp-cc-panel-h"><h3>{t("Process flow", "مسار العملية")}</h3></header>
      <ol className="dp-sw-flow">{spec.flow.map((s, i) => <li key={i}><span className="dp-sw-step" data-no-i18n>{i + 1}</span><span>{bi(ar, s)}</span></li>)}</ol>
    </section>
    <div className="dp-cc-split dp-cc-split-even">
      <section className="dp-cc-panel" data-dp-section-guards>
        <header className="dp-cc-panel-h"><h3>{t("Data rules and safeguards", "قواعد البيانات والضوابط")}</h3></header>
        <ul className="dp-cc-panel-b list-disc space-y-1.5 ps-8 text-sm">{spec.guards.map((g, i) => <li key={i}>{bi(ar, g)}</li>)}</ul>
      </section>
      <section className="dp-cc-panel" data-dp-section-scope>
        <header className="dp-cc-panel-h"><h3>{t("Scope and filters", "النطاق والمرشحات")}</h3></header>
        <div className="dp-cc-panel-b space-y-2 text-sm">
          <ul className="flex flex-wrap gap-1.5">{spec.scope.map((s, i) => <li key={i} className="chip bg-muted text-xs">{bi(ar, s)}</li>)}</ul>
          <p className="text-xs text-muted-foreground">{t("Company and as-of date apply to every figure on this page; date-relative figures (overdue, expiring) are measured from the as-of date.", "تنطبق الشركة وتاريخ التقرير على كل رقم في هذه الصفحة؛ الأرقام النسبية للتاريخ (المتأخر والقريب من الانتهاء) تُقاس من تاريخ التقرير.")}</p>
        </div>
      </section>
    </div>
    {kpis.length > 0 && <section className="dp-cc-panel" data-dp-section-definitions>
      <header className="dp-cc-panel-h"><h3>{t("Figure definitions", "تعريفات الأرقام")}</h3><span className="dp-cc-note">{t("Each figure opens the native list with exactly this filter", "كل رقم يفتح القائمة الأصلية بهذا المرشح تمامًا")}</span></header>
      <div className="overflow-x-auto"><table className="dp-cc-table">
        <thead><tr><th>{t("Figure", "الرقم")}</th><th>{t("Source", "المصدر")}</th><th>{t("Filter", "المرشح")}</th><th>{t("Amount field", "حقل المبلغ")}</th></tr></thead>
        <tbody>{kpis.map((k) => <tr key={k.id}><td>{bi(ar, k.label)}</td><td><NavText label={k.doctype} /></td><td className="font-mono text-[11px]" data-no-i18n dir="ltr">{filterText(k.filters)}</td><td className="font-mono text-[11px]" data-no-i18n>{k.measure ?? "—"}</td></tr>)}</tbody>
      </table></div>
    </section>}
    <section className="dp-cc-panel" data-dp-section-ownership>
      <header className="dp-cc-panel-h"><h3>{t("Document ownership", "ملكية المستندات")}</h3></header>
      <ul className="dp-cc-panel-b grid gap-1.5 text-sm sm:grid-cols-2">{docs.map((x) => <li key={x.doctype} className="flex flex-wrap items-center gap-2"><NavText label={x.doctype} /><span className="text-muted-foreground">→</span><NavText label={deptById(x.owner)?.label ?? x.owner} /></li>)}</ul>
    </section>
    <section className="dp-cc-panel" data-dp-section-related>
      <header className="dp-cc-panel-h"><h3>{t("Related", "ذات صلة")}</h3></header>
      <div className="dp-cc-panel-b flex flex-wrap gap-2">
        <Link to={d.home.target.kind === "pro" ? (d.home.target.to as never) : ("/pro/dashboard" as never)} className="btn-ghost py-0.5 text-xs" onClick={() => enterContext(page.dept, d.home.target.kind === "pro" ? d.home.target.to : "/pro/dashboard")}><NavText label={d.home.label} /></Link>
        {siblings.map((s) => <Link key={s.id} to="/pro/$dept/$section" params={{ dept: s.dept, section: s.slug }} className="btn-ghost py-0.5 text-xs" data-dp-section-sibling={s.id} onClick={() => enterContext(s.dept, `/pro/${s.dept}/${s.slug}`, s.slug)}><NavText label={s.label} /></Link>)}
        <Link to="/pro/$dept" params={{ dept: page.dept }} className="btn-ghost py-0.5 text-xs" onClick={() => enterContext(page.dept, `/pro/${page.dept}`)}><NavText label={d.all.label} /></Link>
      </div>
    </section>
  </div>;
}

/** Queue measures that are quantities, not money (shown without currency). */
const QTY_FIELDS: ReadonlySet<string> = new Set(["projected_qty", "actual_qty"]);

/* ------------------------------------------------------------------ Three tabs (Run11.1 contract, all 20 workspaces) ------------------------------------------------------------------ */
// Dashboard · Documents & work · Full reports (run11.ts). Every panel of the five-tab page is kept and re-homed; nothing is
// hidden with CSS and no figure is computed twice. Placement ids (PLACEMENTS_448) ride on data-run11-placement.
type Run11Props = PaneProps & { docs: DocResult[] };
const idsWith = (ws: string, pred: (k: string) => boolean) => { const ids = placementsOf(ws).filter((x) => x.binds.some(pred)).map((x) => x.id); return ids.length ? ids.join(" ") : undefined; };
const toTab = (tab: Run11Tab) => ((prev: SectionSearch) => ({ ...prev, tab: tab === "overview" ? undefined : tab })) as never;

function Run11Overview(p: PaneProps) {
  return <InsightLines ws={p.page.id} ctx={p.ctx} user={p.user} ar={p.ar}>{(insights, lines) => { const board = boardOf(p);
    // Template T3: workspace KPIs and the accounting board's tiles form ONE indicator row; the insights are short sourced
    // sentences under it (design contract A.2) — a line that restates a KPI is left to that KPI's tile (one figure once)
    return <Page template="T3" id={`ws-${p.page.id}`}><div className="ek-stack">
      <DashboardDesigner def={overviewDashboard(p.page, p.spec, true, DASH_PARTS)} ctx={{ pane: p, golden: true }} bandEdit company={p.ctx.company}
        strip={{ after: [...extraLeadTiles(p), ...board.tiles], tagAttr: "data-run11-placement", note: <InsightNotes lines={lines} ar={p.ar} />, score: (id, o) => (id.startsWith("kpi:") ? kpiScore(p, id.slice(4), o) : undefined) }}
        // OWN-67: a workspace with a design-contract composition opens on the designer's contract default; the original
        // Overview stays the untouched fallback only where no contract exists
        fallback={WS_CONTRACT[p.page.id] ? undefined : <LegacyRun11Overview {...p} insights={insights} board={board} />} link={proLink(p.page)} />
      <KeyReports {...p} /></div></Page>; }}</InsightLines>;
}
/** The workspace's V9.2 board (accounting workspaces) and its tiles for the page's one indicator row. */
function boardOf(p: PaneProps): { key?: string; result?: BoardResult; tiles: StripItem[] } {
  const key = ACC_BOARD[p.page.id]; if (!key) return { tiles: [] };
  const result = evalBoard(key, boardCtx(p.ctx.company, undefined, undefined, "prior_period", p.user));
  return { key, result, tiles: result.blocks.flatMap((b) => tileItems(b, p.ar, result.currency)) };
}
const norm = (x: string) => x.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
/** OWN-07: buttons to the workspace's ten key reports (its placement reports first, then the section's own), each opened with the workspace company and dates. */
function KeyReports({ page, ctx, ar }: PaneProps) {
  const r = useNavResolver();
  const t = (en: string, arabic: string) => (ar ? arabic : en);
  const names = placementsOf(page.id, "REPORT").map((x) => x.binds[0]!.replace(/^report:/, ""));
  const tab = reportTabEntries(page, names);
  const seen = new Set<string>();
  const picks = [...tab.placements.map((x) => ({ key: x.key, name: x.name, clear: x.clear })),
    ...tab.native.filter((e) => e.item.target.kind === "report" && r.state(e.item) === "ok").map((e) => ({ key: e.key, name: (e.item.target as { report: string }).report, clear: e.clear }))]
    .filter((x) => (seen.has(x.key) ? false : (seen.add(x.key), true))).slice(0, 10);
  if (!picks.length) return null;
  return <div data-dp-key-reports={picks.length}><LinkGroup id={`ws-${page.id}-reports`} title={<>{t("Key reports", "أهم التقارير")} <Link to="/pro/$dept/$section" params={{ dept: page.dept, section: page.slug }} search={toTab("reports")} className="ek-card-link ms-2" data-dp-key-reports-all>{t("All reports", "كل التقارير")}</Link></>}>
    {picks.map((x) => <SecLink key={x.key} drill={{ kind: "report", name: x.name, filters: reportFilters(x.name, ctx) }} page={page} className={LINK_CHIP} data-dp-key-report={x.name}>
      {x.clear ? <span data-no-i18n>{bi(ar, x.clear)}</span> : <NavText label={x.name} />}</SecLink>)}</LinkGroup></div>;
}
function LegacyRun11Overview(p: PaneProps & { insights: StripItem[]; board: ReturnType<typeof boardOf> }) {
  const { page, spec, ctx, user, ar, insights, board } = p;
  const t = (en: string, arabic: string) => (ar ? arabic : en);
  const kpis = spec.kpis(ctx).map((k) => evalKpi(k, ctx, user));
  const charts = spec.charts(ctx).map((c) => evalChart(c, ctx, user));
  const queues = spec.queues(ctx).map((q) => evalQueue(q, ctx, user, 5));
  const queue = queues.find((q) => q.status === "ok" && q.count) ?? queues[0];
  // a board block with the same title as a workspace chart or the work queue shown below is that same chart / list: drawn once
  const drawn = new Set([...charts.map((c) => norm(c.label[0])), ...(queue ? [norm(queue.label[0])] : [])]);
  const skip = (b: BlockResult) => drawn.has(norm(b.title[0]));
  return <div className="ek-stack" data-run11-tab="overview">
    <Zone zone="kpis"><div data-dp-section-kpis><KpiStrip id={`ws-${page.id}`} ar={ar} tagAttr="data-run11-placement"
      items={[...insights, ...kpis.map((k) => kpiStripItem(k, page, ar, ctx.currency, placementIds(page.id, `kpi:${k.id}`), kpiCmp(k, p), ctx.asOf)), ...extraLeadTiles(p), ...board.tiles]} /></div></Zone>
    {hasOverviewExtra(spec, "lead") && <div data-run11-placement={idsWith(page.id, (k) => k.startsWith("dues:") || k.startsWith("ageing:"))}><ExtraOverview {...p} part="lead" folded /></div>}
    {charts.length > 0 && <Zone zone="charts"><ChartRow cols={charts.length > 1 ? 2 : 1}>{charts.map((c) => <ChartPanel key={c.id} c={c} page={page} ar={ar} currency={ctx.currency} placement={placementIds(page.id, `chart:${c.id}`)} />)}</ChartRow></Zone>}
    {hasOverviewExtra(spec, "rest") && <ExtraOverview {...p} part="rest" />}
    {board.key && <Dash92Board boardKey={board.key} result={board.result} tiles={false} skip={skip} bare company={ctx.company} user={user} ar={ar} />}
    <PendingFigures page={page} ctx={ctx} ar={ar} />
    {queue && <QueuePanel q={queue} page={page} ar={ar} compact placement={placementIds(page.id, `queue:${queue.id}`)} footer={<Link to="/pro/$dept/$section" params={{ dept: page.dept, section: page.slug }} search={toTab("documents")} className="text-xs text-primary hover:underline" data-dp-section-goto-work>{t("All work in Documents & work", "كل الأعمال في المستندات والعمليات")} {ar ? "←" : "→"}</Link>} />}
  </div>;
}

/** Target figures this page cannot show yet: proposed formulas, owner decisions, Pro-server-only values, partial coverage.
 *  States the reason and points at the existing candidate figure — never a number. */
const PENDING_PANEL = {
  figures: { types: ["KPI", "CHART"] as PlacementType[], title: ["Figures awaiting definition or connection", "أرقام بانتظار التعريف أو الربط"] as Bi, hint: ["No value is shown until the owner approves the formula or the DIGIT Pro server provides it.", "لا تُعرض قيمة حتى يعتمد المالك المعادلة أو يوفرها خادم ديجيت برو."] as Bi },
  queues: { types: ["QUEUE", "DOCUMENT"] as PlacementType[], title: ["Work lists and documents not fully covered here", "قوائم عمل ومستندات غير مغطاة بالكامل هنا"] as Bi, hint: ["Each row states the reason; no rows are listed until the owner approves the rule or the DIGIT Pro server provides them.", "كل سطر يذكر السبب؛ لا تُعرض صفوف حتى يعتمد المالك القاعدة أو يوفرها خادم ديجيت برو."] as Bi },
};
function PendingFigures({ page, ctx, ar, kind = "figures" }: { page: SectionPage; ctx: SectionCtx; ar: boolean; kind?: keyof typeof PENDING_PANEL }) {
  const t = (en: string, arabic: string) => (ar ? arabic : en);
  const dev = useDevMode();
  const note = (x: string) => (dev ? x : plainNote(x));
  const def = PENDING_PANEL[kind];
  const rows = placementsOf(page.id).filter((x) => def.types.includes(x.type) && (PENDING.has(x.impl) || x.impl === "PARTIAL"));
  if (!rows.length) return null;
  return <section className="dp-cc-panel" data-run11-pending={kind}>
    <header className="dp-cc-panel-h flex-wrap"><h3>{bi(ar, def.title)}</h3><span className="dp-cc-badge" data-no-i18n>{rows.length}</span>
      <span className="dp-cc-note">{bi(ar, def.hint)}</span></header>
    <ul className="divide-y divide-border">{rows.map((x) => <li key={x.id} className="flex flex-wrap items-start gap-x-3 gap-y-1 px-4 py-2.5" data-run11-placement={x.id} data-run11-impl={x.impl}>
      <span className="min-w-[12rem] flex-1 text-sm font-medium">{bi(ar, x.label)}{dev && <bdi className="ms-2 font-mono text-[10px] text-muted-foreground" data-no-i18n>{x.id}</bdi>}</span>
      <span className={`chip text-[11px] ${x.impl === "PARTIAL" ? "bg-muted" : "bg-warning/15"}`}>{bi(ar, IMPL_LABEL[x.impl])}</span>
      {x.note && <span className="basis-full text-xs text-muted-foreground">{note(bi(ar, x.note))}</span>}
      {x.binds.filter((b) => b.startsWith("pro:")).map((b) => <SecLink key={b} drill={{ kind: "pro", to: b.slice(4), search: { company: ctx.company } }} page={page} className="text-xs text-primary hover:underline" data-run11-candidate={b}>{t("Open the existing screen", "فتح الشاشة القائمة")} {ar ? "←" : "→"}</SecLink>)}
    </li>)}</ul>
  </section>;
}

function Run11Work(p: Run11Props) {
  const { page, spec, ctx, user, ar, docs } = p;
  const queues = spec.queues(ctx).map((q) => evalQueue(q, ctx, user, 25));
  const extra = (RUN11_QUEUES[page.id]?.(ctx) ?? []).map((q) => evalQueue(q, ctx, user, 25));
  return <div className="space-y-4" data-run11-tab="documents">
    <ActionsPanel page={page} ctx={ctx} user={user} ar={ar} />
    {hasWorkExtra(spec) && <div data-run11-placement={idsWith(page.id, (k) => k.startsWith("extra:"))}><ExtraWork {...p} /></div>}
    {queues.filter((q) => q.status !== "denied").map((q) => <QueuePanel key={q.id} q={q} page={page} ar={ar} placement={placementIds(page.id, `queue:${q.id}`)} />)}
    {extra.map((q) => <QueuePanel key={`r11-${q.id}`} q={q} page={page} ar={ar} placement={placementIds(page.id, `run11q:${q.id}`)} />)}
    <PendingFigures page={page} ctx={ctx} ar={ar} kind="queues" />
    <ProDocumentHub page={page} ctx={ctx} user={user} ar={ar} search={p.search} afterQuick={<Documents page={page} docs={docs} ar={ar} more={false} placementOf={(dt) => placementIds(page.id, `doc:${dt}`)} />} />
    <CapabilitiesPanel page={page} ar={ar} />
  </div>;
}

function ActionsPanel({ page, ctx, user, ar }: { page: SectionPage; ctx: SectionCtx; user: string; ar: boolean }) {
  const t = (en: string, arabic: string) => (ar ? arabic : en);
  const dev = useDevMode();
  const note = (x: string) => (dev ? x : plainNote(x));
  const r = useNavResolver();
  const acts = RUN11_ACTIONS[page.id] ?? [];
  if (!acts.length) return null;
  const arrow = ar ? "←" : "→";
  return <section className="dp-cc-panel" data-run11-actions>
    <header className="dp-cc-panel-h flex-wrap"><h3>{t("Actions in this workspace", "الإجراءات في هذه المساحة")}</h3>
      <span className="dp-cc-note">{t("Each action opens the native document, list or report; nothing is saved or posted from this page.", "كل إجراء يفتح المستند أو القائمة أو التقرير الأصلي؛ لا يُحفظ أو يُرحّل شيء من هذه الصفحة.")}</span></header>
    <ul className="grid gap-2 p-3 sm:grid-cols-2 xl:grid-cols-4">{acts.map((a) => {
      // one rule with the Pro menu (navAccess.actionState): a denied action is not rendered (owner decision 2026-11-11)
      const st = actionState(a, { user, roles: r.roles, index: r.index, reports: r.reports }, (dt, perm) => can(dt, perm, undefined, user));
      const allowed = st === "ok";
      const drill = a.kind === "native-new" ? { kind: "doc" as const, doctype: a.doctype!, name: "new" }
        : a.kind === "tool" ? { kind: "doc" as const, doctype: a.doctype!, name: a.doctype! }
        : a.kind === "list" ? listDrill(a.doctype!, a.filters?.(ctx) ?? [])
        : a.kind === "pro" ? { kind: "pro" as const, to: a.to!, search: { company: ctx.company } }
        : a.kind === "report" ? { kind: "report" as const, name: a.report!, filters: reportFilters(a.report!, ctx) } : undefined;
      const head = <><span className="text-sm font-medium">{bi(ar, a.label)}</span>{dev && <bdi className="ms-1 font-mono text-[10px] text-muted-foreground" data-no-i18n>{a.id}</bdi>}</>;
      const tabTo = a.kind === "tab" ? run11Tab(a.to) : undefined;
      const blocked = a.kind === "server" ? IMPL_LABEL.BACKEND_SOURCE_ONLY : a.kind === "policy" ? IMPL_LABEL.OWNER_POLICY_REQUIRED : a.kind === "missing" ? IMPL_LABEL.INTEGRATION_MISSING : undefined;
      const state = blocked ? a.kind : allowed ? "ok" : "denied";
      if (st === "denied") return null;
      return <li key={a.id} className="flex flex-col gap-1 rounded-md border border-border bg-card p-3" data-run11-placement={a.id} data-run11-action={a.kind} data-state={state}>
        {tabTo ? <Link to="/pro/$dept/$section" params={{ dept: page.dept, section: page.slug }} search={toTab(tabTo)} className="text-primary hover:underline" data-run11-action-link={a.id}>{head} <span aria-hidden>{arrow}</span></Link>
          : drill && allowed ? <SecLink drill={drill} page={page} className="text-primary hover:underline" data-run11-action-link={a.id}>{head} <span aria-hidden>{arrow}</span></SecLink> : <span className="text-muted-foreground">{head}</span>}
        <span className="text-xs text-muted-foreground">{note(bi(ar, a.how))}</span>
        {blocked && <span className={`chip w-fit text-[11px] ${a.kind === "policy" ? "bg-warning/15" : "bg-muted"}`}>{bi(ar, blocked)}</span>}
        {dev && a.server && <code className="text-[10px] text-muted-foreground" dir="ltr" data-no-i18n>{a.server}</code>}
      </li>;
    })}</ul>
  </section>;
}

function CapabilitiesPanel({ page, ar }: { page: SectionPage; ar: boolean }) {
  const t = (en: string, arabic: string) => (ar ? arabic : en);
  const dev = useDevMode();
  const note = (x: string) => (dev ? x : plainNote(x));
  const caps = RUN11_CAPS[page.id] ?? [];
  if (!caps.length) return null;
  return <section className="dp-cc-panel" data-run11-capabilities>
    <header className="dp-cc-panel-h flex-wrap"><h3>{t("Smart capabilities in this workspace", "القدرات الذكية في هذه المساحة")}</h3><span className="dp-cc-note">{t("Status as recorded in the DIGIT Pro product registry", "الحالة كما في سجل منتج ديجيت برو")}</span></header>
    <ul className="divide-y divide-border">{caps.map((c) => <li key={c.id} className="flex flex-wrap items-start gap-x-3 gap-y-1 px-4 py-2.5" data-run11-capability={c.id}>
      <span className="min-w-[12rem] flex-1 text-sm font-medium">{bi(ar, c.label)}{dev && <bdi className="ms-2 font-mono text-[10px] text-muted-foreground" data-no-i18n>{c.id}</bdi>}</span>
      <span className="chip bg-muted text-[11px]">{bi(ar, IMPL_LABEL[c.status])}</span>
      <span className="basis-full text-xs text-muted-foreground">{note(bi(ar, c.detail))}</span>
      {dev && c.server && <code className="text-[10px] text-muted-foreground" dir="ltr" data-no-i18n>{c.server}</code>}
    </li>)}</ul>
  </section>;
}

/** Company always travels with a report link; reports that take an as-of date get the workspace's date. The report page
 *  reads its options from one JSON `filters` search value (routes/report.$name.tsx routeOptions). */
function reportFilters(name: string, ctx: SectionCtx): Record<string, string> {
  const asOf = RUNNERS[name]?.filters?.some((f) => f.fieldname === "report_date");
  return { filters: JSON.stringify({ company: ctx.company, ...(asOf ? { report_date: ctx.asOf } : {}) }) };
}

function Run11Reports(p: Run11Props) {
  const { page, spec, ctx, ar, docs } = p;
  const t = (en: string, arabic: string) => (ar ? arabic : en);
  const dev = useDevMode();
  const rpl = placementsOf(page.id, "REPORT");
  const names = rpl.map((x) => x.binds[0]!.replace(/^report:/, ""));
  const tab = reportTabEntries(page, names);
  const clearOf = new Map(tab.placements.map((x) => [x.name, x.clear]));
  return <div className="space-y-4" data-run11-tab="reports">
    {rpl.length > 0 && <section className="dp-cc-panel" data-run11-reports>
      <header className="dp-cc-panel-h flex-wrap"><h3>{t("Reports for this workspace", "تقارير هذه المساحة")}</h3><span className="dp-cc-badge" data-no-i18n>{rpl.length}</span>
        <span className="dp-cc-note">{t("Open with this workspace's company and date", "تُفتح بشركة هذه المساحة وتاريخها")}</span></header>
      <ul className="grid gap-2 p-3 sm:grid-cols-2 xl:grid-cols-4">{rpl.map((x, i) => {
        const name = names[i]!; const runs = name in RUNNERS;
        return <li key={x.id} data-run11-placement={x.id} data-run11-canonical={canonicalPlacementId(x.id)}><SecLink drill={{ kind: "report", name, filters: reportFilters(name, ctx) }} page={page} className="dp-cc-chip w-full" data-run11-report={name} data-dp-kind="report">
          <span className="min-w-0">{clearOf.get(name) ? <span data-no-i18n data-dp-label-clarified>{bi(ar, clearOf.get(name)!)}</span> : <NavText label={name} />}{dev && <bdi className="ms-1 font-mono text-[10px] text-muted-foreground" data-no-i18n>{canonicalPlacementId(x.id)} · {x.id}</bdi>}
            {dev && <span className="block text-[11px] text-muted-foreground" data-dp-runner={runs ? "1" : "0"}>{runs ? "runner" : "no runner"}</span>}</span>
        </SecLink></li>;
      })}</ul>
    </section>}
    <Reports page={page} ar={ar} tab={tab} />
    <details className="dp-cc-panel" data-run11-definitions>
      <summary className="dp-cc-panel-h cursor-pointer list-none"><h3>{t("Definitions, rules and process", "التعريفات والقواعد ومسار العمل")}</h3><span className="dp-cc-note">{t("How every figure on this workspace is calculated and where it comes from", "كيف يُحسب كل رقم في هذه المساحة ومن أين يأتي")}</span></summary>
      <div className="space-y-4 p-3">
        <InsightDefinitions page={page} ar={ar} />
        <Details page={page} spec={spec} ctx={ctx} docs={docs} ar={ar} />
      </div>
    </details>
    {dev && <PlacementTrace page={page} ar={ar} />}
  </div>;
}

function InsightDefinitions({ page, ar }: { page: SectionPage; ar: boolean }) {
  const t = (en: string, arabic: string) => (ar ? arabic : en);
  const dev = useDevMode();
  const note = (x: string) => (dev ? x : plainNote(x));
  const rows = insightsOf(page.id);
  if (!rows.length) return null;
  const parity = (x: (typeof rows)[number]) => x.parity === "SAME_BASIS" ? t("Same basis as the figure on this workspace", "نفس أساس الرقم في هذه المساحة")
    : x.parity === "DIFFERENT_BASIS" ? t("Different basis from the figure on this workspace", "أساس مختلف عن الرقم في هذه المساحة") : bi(ar, IMPL_LABEL.BACKEND_SOURCE_ONLY);
  return <section className="dp-cc-panel" data-run11-insights>
    <header className="dp-cc-panel-h flex-wrap"><h3>{t("DIGIT Pro insight definitions", "تعريفات مؤشرات ديجيت برو")}</h3><span className="dp-cc-note">{t("Defined and computed by the DIGIT Pro server", "يعرّفها ويحسبها خادم ديجيت برو")}</span></header>
    <div className="overflow-x-auto"><table className="dp-cc-table">
      <thead><tr><th>{t("Insight", "المؤشر")}</th><th>{t("Definition", "التعريف")}</th><th>{t("Source", "المصدر")}</th><th>{t("In this preview", "في هذه المعاينة")}</th></tr></thead>
      <tbody>{rows.map((x) => <tr key={x.id} data-run11-insight={x.id} data-run11-parity={x.parity}>
        <td className="min-w-[10rem] font-medium">{bi(ar, x.title)}{dev && <bdi className="block font-mono text-[10px] text-muted-foreground" data-no-i18n>{x.id}</bdi>}</td>
        <td className="min-w-[16rem] text-xs">{bi(ar, x.formula)}</td>
        <td className="whitespace-nowrap text-xs"><NavText label={x.source} /></td>
        <td className="min-w-[12rem] text-xs">{parity(x)}{x.note && <span className="block text-muted-foreground">{note(bi(ar, x.note))}</span>}</td>
      </tr>)}</tbody>
    </table></div>
  </section>;
}

/** Developer mode only: every Run11.1 placement of this workspace, its implementation class and the element serving it. */
function PlacementTrace({ page, ar }: { page: SectionPage; ar: boolean }) {
  const rows: Placement[] = placementsOf(page.id);
  return <section className="dp-cc-panel" data-run11-trace>
    <header className="dp-cc-panel-h"><h3>Run11.1 placement trace</h3><span className="dp-cc-badge" data-no-i18n>{rows.length}</span><span className="dp-cc-note" data-no-i18n>{RUN11_VERSION}</span></header>
    <div className="overflow-x-auto"><table className="dp-cc-table" data-no-i18n dir="ltr">
      <thead><tr><th>ID</th><th>Type</th><th>Label</th><th>Implementation</th><th>Tab</th><th>Served by</th></tr></thead>
      <tbody>{rows.map((x) => <tr key={x.id}><td className="font-mono text-[11px]">{x.id}</td><td>{x.type}</td><td>{bi(ar, x.label)}</td><td className="font-mono text-[11px]">{x.impl}</td><td>{x.tab}</td><td className="font-mono text-[11px]">{x.binds.join(" · ") || "—"}{x.server ? ` · ${x.server}` : ""}</td></tr>)}</tbody>
    </table></div>
  </section>;
}

/** WAI-ARIA tabs keyboard model: one tab stop (the selected tab); ←/→ move focus (mirrored in RTL), Home/End jump; Enter opens. */
function onTabKey(e: KeyboardEvent<HTMLElement>) {
  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
  const tabs = [...e.currentTarget.querySelectorAll<HTMLElement>('[role="tab"]')];
  const i = tabs.indexOf(document.activeElement as HTMLElement); if (i < 0) return;
  const rtl = getComputedStyle(e.currentTarget).direction === "rtl";
  const step = e.key === "ArrowRight" ? (rtl ? -1 : 1) : e.key === "ArrowLeft" ? (rtl ? 1 : -1) : 0;
  const j = e.key === "Home" ? 0 : e.key === "End" ? tabs.length - 1 : (i + step + tabs.length) % tabs.length;
  e.preventDefault(); tabs[j]?.focus();
}
