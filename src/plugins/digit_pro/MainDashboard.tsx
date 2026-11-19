// @ts-nocheck -- DIGIT Pro/HR apps are switched off in the merged site build; their original /pro/* and /hr/* app routes are not in this route tree (re-enabling the app needs those routes, then remove this line)
import { openCreate } from "@/components/enterprise/CreatePanel";
import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ChartCard, ChartRow, Columns, ContextStrip, CustomizeScope, KpiRow, LINK_CHIP, LinkGroup, money, moneyShort, Page, WorkPanel, Zone, type Datum, type Tone } from "@/components/enterprise/kit";
import { translateTo, useLang } from "@/i18n";
import { adapter } from "@/lib/adapter";
import { notificationSubject } from "@/lib/activityFeed";
import { cachedMeta } from "@/lib/catalog";
import { fmtCurrency } from "@/lib/format";
import { relTime } from "@/lib/relTime";
import { canReadType, scopedList, useScopeMetas } from "@/lib/scope";
import { hasPerm } from "@/lib/session";
import { TrendChart } from "./DashKpis";
import { useV4Lines } from "./V4InsightBoard";
import { ApprovalInbox } from "./PolicyPanels";
import { deptDash } from "./dashMetrics";
import { move, toggle, type DashLayout } from "./dashLayout";
import { PageBlocks, pageDashboard, type PageBlockDef, type PageNodes } from "@/components/dashboards/PageBlocks";
import { blockWindow } from "@/lib/dashboards/registry";
import { ProFrame } from "./ProFrame";
import { gapOf, StockValueNotice, withStockGap } from "./StockValueRecon";
import { financeContext, todayIso } from "./finance";
import { compareAsOf } from "./sections";
import { useNavResolver } from "./ProSidebar";
import { queueRows } from "./DeptWorkspace";
import { DEPARTMENTS, NAV_AR, SERVICES, slug, targetHref, type NavItem } from "./nav";
import { COMMAND_DOCTYPES, execExceptions, execSignals, execWorklist, freshness, liquidityTiming, roleLabel, type Exception, type Timing, type WorkTab } from "./command";
import { bi, DrillLink, sevLabel, SevDot, Totals } from "./CommandUi";
import { kpiFromSignal, kpiFromV4, proWrap } from "./ProKit";
import type { BoardSearch } from "./Dash92Board";
import { FINANCE_BLOCKS, financeNodes, SHORTCUTS_BLOCK } from "./FinanceCards";

/** Report shortcuts on the dashboard — native Core reports, filtered by report roles. */
const REPORTS: NavItem[] = ["General Ledger", "Trial Balance", "Profit and Loss Statement", "Accounts Receivable", "Accounts Payable", "Sales Analytics", "Stock Balance", "Fixed Asset Register"].map((report) => ({ label: report, target: { kind: "report" as const, report } }));
const QUICK = ["Journal Entry", "Payment Entry", "Sales Invoice", "Sales Order", "Purchase Order", "Stock Entry"];
export interface DashSearch extends BoardSearch { company?: string | undefined; wl?: string | undefined }

/**
 * DIGIT Pro Executive Command Center (/pro/dashboard, EC-R1 Phase 2). Every figure is a sum or count of native Core
 * records through the permission-scoped adapter (command.ts); each signal, exception, bar and worklist row opens the
 * filtered register or native document that produced it. Invoiced sales are labelled as invoiced, not revenue;
 * purchase commitments are never added to payables; AR and AP timing keep their own bases.
 */
const DASH_DTS = [...new Set([...QUICK, ...COMMAND_DOCTYPES, "Sales Order", "Delivery Note", "Quotation", "Material Request", ...DEPARTMENTS.flatMap((d) => d.flow.map((f) => f.doctype).concat(d.queues.map((q) => q.doctype), d.primary.flatMap((i) => (i.target.kind === "doctype" ? [i.target.doctype] : []))))])];

export function MainDashboard({ search = {} }: { search?: DashSearch }) {
  const r = useNavResolver();
  const nav = useNavigate();
  const lang = useLang(); const ar = lang === "ar"; const t = (en: string, arabic: string) => (ar ? arabic : en);
  const [activity, setActivity] = useState("recent");
  const set = (p: Partial<DashSearch>) => void nav({ to: "/pro/dashboard", search: (prev: DashSearch) => ({ ...prev, ...p }) as never, replace: true });
  return (
    <ProFrame bare band={false} title={t("Executive Command Center", "مركز القيادة التنفيذي")} tabs={false} doctypes={DASH_DTS}>
      {({ user }) => {
        const ctx = financeContext(search.company, user);
        const quick = QUICK.filter((x) => { const m = cachedMeta(x); return m && r.appOf(x) && hasPerm(m, "create"); });
        const create = (dt: string) => { const m = cachedMeta(dt); const app = r.appOf(dt); if (!m || !app) return; openCreate(dt, { app }); };
        const allDts = [...new Set(DEPARTMENTS.flatMap((d) => d.flow.map((f) => f.doctype).concat(d.queues.map((q) => q.doctype), d.primary.flatMap((i) => (i.target.kind === "doctype" ? [i.target.doctype] : [])))))];
        const recent = allDts.filter((x) => { const m = cachedMeta(x); return m && !m.issingle && !m.istable && canReadType(x); })
          .flatMap((x) => scopedList(x).map((doc) => ({ dt: x, doc }))).sort((a, b) => String(b.doc["modified"] ?? "").localeCompare(String(a.doc["modified"] ?? ""))).slice(0, 12);
        const notes = adapter.list("Notification Log").filter((n) => n["for_user"] === user).sort((a, b) => String(b["creation"] ?? "").localeCompare(String(a["creation"] ?? ""))).slice(0, 12);
        const reports = REPORTS.filter((i) => r.state(i) === "ok");
        const show = (_id: string) => true;
        const today = todayIso();
        // Executive blocks run on the shared Dashboard Designer (block menu on every block, Customise in the band, saved per
        // user, published per role / company). Block ids keep the earlier section ids so the page reads the same zones.
        const def = pageDashboard("digit_pro", "exec:main", ["Executive Command Center", "مركز القيادة التنفيذي"], EXEC_BLOCKS, ["Accounts Manager", "Sales Manager", "Purchase Manager", "Stock Manager"]);
        const actTabs = [
          ...(show("recent") ? [{ id: "recent", label: t("Recent work", "العمل الأخير"), count: recent.length, attrs: { "data-dp-dash-recent": "" }, content: recent.length === 0 ? <p className="p-4 text-sm text-muted-foreground">{t("No recent records", "لا توجد سجلات حديثة")}</p>
            : <ul className="ek-rowlist">{recent.map(({ dt, doc }) => { const app = r.appOf(dt); const body = <><span className="ek-dot" data-tone="secondary" aria-hidden /><span className="ek-row-main"><span className="ek-row-title" data-no-i18n>{doc.name}</span><span className="ek-row-meta">{translateTo(dt, ar ? "ar" : "en")}</span></span><span className="ek-row-meta" data-no-i18n>{relTime(String(doc["modified"] ?? ""), lang)}</span></>;
              return <li key={dt + doc.name}>{app ? <Link to="/app/$app/$doctype/$name" params={{ app, doctype: slug(dt), name: doc.name }} className="ek-row">{body}</Link> : <div className="ek-row">{body}</div>}</li>; })}</ul> }] : []),
          ...(show("alerts") ? [{ id: "alerts", label: t("Notifications", "الإشعارات"), count: notes.filter((n) => !n["read"]).length, tone: "attention" as const, attrs: { "data-dp-dash-alerts": "" }, content: notes.length === 0 ? <p className="p-4 text-sm text-muted-foreground">{t("No notifications", "لا توجد إشعارات")}</p>
            : <ul className="ek-rowlist">{notes.map((n) => { const dt = String(n["document_type"] ?? ""); const app = dt ? r.appOf(dt) : undefined; const dn = String(n["document_name"] ?? "");
              const body = <><span className="ek-dot" data-tone={n["read"] ? "neutral" : "attention"} aria-hidden /><span className="ek-row-main"><span className="ek-row-title" data-no-i18n>{notificationSubject(n, lang)}</span>{dt && <span className="ek-row-meta">{translateTo(dt, ar ? "ar" : "en")}</span>}</span><span className="ek-row-meta" data-no-i18n>{relTime(String(n["creation"] ?? ""), lang)}</span></>;
              return <li key={n.name}>{app && dn ? <Link to="/app/$app/$doctype/$name" params={{ app, doctype: slug(dt), name: dn }} className="ek-row">{body}</Link> : <div className="ek-row">{body}</div>}</li>; })}</ul> }] : []),
        ];
        const nodes: PageNodes = {
            // PRO P1 finance home: shortcut chips, P&L split, cash flow, bank accounts, expenses (+ catalog-only receivables by age)
            ...financeNodes({ company: ctx.company, currency: ctx.currency, user, ar }),
            kpis: <Zone zone="kpis"><ExecKpis company={ctx.company} currency={ctx.currency} user={user} ar={ar} /></Zone>,
            trend: (o: Record<string, string | undefined>) => <Zone zone="charts"><Cockpit company={ctx.company} currency={ctx.currency} user={user} ar={ar} period={monthsOf(o, today)} /></Zone>,
            attention: <Zone zone="panels"><Worklist company={ctx.company} currency={ctx.currency} user={user} ar={ar} tab={search.wl === "soon" ? "soon" : search.wl === "approvals" ? "approvals" : "decide"} onTab={(wl) => set({ wl: wl === "decide" ? undefined : wl })} /></Zone>,
            departments: <Zone zone="panels"><section className="ek-card ek-dept-strip-card" data-dp-exec-depts>
              <header className="ek-card-head"><div className="min-w-0"><h3 className="ek-h3">{t("Departments", "الأقسام")}</h3><p className="ek-card-sub">{t("Open queues per department, counted from native records.", "قوائم العمل المفتوحة لكل قسم، محسوبة من السجلات الأصلية.")}</p></div></header>
              <div className="ek-dept-strip">{DEPARTMENTS.map((d) => {
                const qs = d.queues.map((qd) => ({ qd, rows: queueRows(qd, ctx.company) }));
                const permitted = qs.filter((x) => x.rows !== "denied");
                const open = permitted.filter((x) => (x.rows as unknown[]).length > 0);
                const total = open.reduce((a, x) => a + (x.rows as unknown[]).length, 0);
                return <div key={d.id} className="ek-dept" data-dp-dash-dept={d.id}>
                  <Link to="/pro/$dept" params={{ dept: d.id }} className="ek-dept-h"><img src={`/icons/digit/mod/digit-mod-${d.icon}-light.svg`} alt="" className="h-6 w-6" /><span className="min-w-0 flex-1 truncate">{NAV_AR[d.label] && ar ? NAV_AR[d.label] : d.label}</span><b className="ek-dept-n" data-no-i18n>{permitted.length ? total : "—"}</b></Link>
                  {permitted.length === 0 ? <p className="ek-row-meta px-1">{t("Not permitted", "غير مسموح")}</p>
                    : open.length === 0 ? <p className="ek-row-meta px-1">{t("Nothing pending", "لا شيء معلّق")}</p>
                    : <ul className="ek-dept-q">{open.map(({ qd, rows }) => <li key={qd.label} data-severity={qd.severity} data-dp-dash-queue={qd.label}>
                        <span className="ek-dot" data-tone={qd.severity === "high" ? "risk" : qd.severity === "medium" ? "attention" : "neutral"} aria-hidden /><span className="min-w-0 flex-1 truncate">{qd.label}</span>
                        <Link to="/pro/$dept" params={{ dept: d.id }} className="ek-dept-c" data-no-i18n>{(rows as unknown[]).length}</Link></li>)}</ul>}
                </div>; })}</div>
            </section></Zone>,
            activity: actTabs.length ? <Zone zone="panels"><WorkPanel id="exec-activity" title={t("Activity", "النشاط")} tabs={actTabs} active={actTabs.some((x) => x.id === activity) ? activity : actTabs[0]!.id} onTab={setActivity} height={300} /></Zone> : null,
            reports: <Zone zone="links"><LinkGroup id="exec-reports" title={t("Management reports", "تقارير الإدارة")}>{reports.length === 0 ? <span className="ek-row-meta">{t("Not permitted", "غير مسموح")}</span> : reports.map((i) => { const h = targetHref(i.target, r.appOf)!; return <Link key={i.label} to={h.to as never} params={h.params as never} className={LINK_CHIP} data-dp-resource={i.label}>{i.label}</Link>; })}</LinkGroup></Zone>,
            services: <Zone zone="links"><LinkGroup id="exec-services" title={t("Shared services", "الخدمات المشتركة")}>{SERVICES.map((s) => <Link key={s.id} to={s.to} className={LINK_CHIP} data-dp-entry={s.to} title={s.subtitle}>{s.label}</Link>)}</LinkGroup></Zone>,
        };
        return (
          <Page template="T5" id="exec-overview"><div className="dp-cc ek-stack" data-dp-dashboard data-dp-screen="EXEC">
            <CustomizeScope><Zone zone="context"><div data-dp-exec-context><ContextStrip icon={<img src="/icons/digit/ui/digit-ui-dashboard-light.svg" alt="" className="h-7 w-7" />}
              eyebrow={t("DIGIT Pro · Executive", "ديجيت برو · القيادة التنفيذية")} title={t("Executive Command Center", "مركز القيادة التنفيذي")}
              sub={t("Today's position — posted and submitted records only; drafts, forecasts and budgets are not included.", "موقف اليوم — السجلات المرحّلة والمعتمدة فقط؛ المسودات والتوقعات والموازنات غير مشمولة.")}
              facts={[
                { label: t("Company", "الشركة"), value: <bdi data-no-i18n>{ctx.company || "—"}</bdi> },
                ...(ctx.fiscalYear ? [{ label: t("Fiscal year", "السنة المالية"), value: <bdi data-no-i18n>{ctx.fiscalYear.name}</bdi> }] : []),
                { label: t("As of", "حتى تاريخ"), value: <bdi data-no-i18n data-dp-exec-asof>{today}</bdi> },
                { label: t("Data updated", "آخر تحديث"), value: <bdi data-no-i18n>{freshness(["Sales Invoice", "Purchase Invoice", "GL Entry", "Payment Entry", "Stock Ledger Entry"], user) || "—"}</bdi> },
                { label: t("Role", "الدور"), value: <bdi data-no-i18n>{roleLabel(user)}</bdi> },
                { label: t("Compare", "المقارنة"), value: <span data-dp-band-compare>{t("Previous period", "الفترة السابقة")}</span> },
                { label: t("Currency", "العملة"), value: <bdi data-no-i18n data-dp-band-currency>{ctx.currency || "—"}</bdi> },
              ]}
              aside={ctx.companies.length > 1 ? <label className="ek-context-select"><span>{t("Company", "الشركة")}</span>
                <select value={ctx.company} onChange={(e) => set({ company: e.target.value })} data-dp-exec-company data-no-i18n>{ctx.companies.map((c) => <option key={c}>{c}</option>)}</select></label> : undefined}
              actions={<>
                <Link to="/pro/finance" search={{ company: ctx.company } as never} className="ek-context-btn" data-dp-exec-go="finance">{t("Finance operations", "العمليات المالية")}</Link>
                <Link to="/pro/finance-intelligence" search={{ company: ctx.company } as never} className="ek-context-btn" data-dp-exec-go="intelligence">{t("Finance intelligence", "التحليل المالي")}</Link>
                <Link to="/pro/reports" className="ek-context-btn">{t("Reports center", "مركز التقارير")}</Link>
                {quick.length > 0 && <DropdownMenu>
                  <DropdownMenuTrigger asChild><button type="button" className="ek-context-btn" data-dp-quick-create>+ {t("Create", "إنشاء")}</button></DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="min-w-48" data-dp-quick-create-menu>{quick.map((x) => <DropdownMenuItem key={x} onSelect={() => create(x)} data-dp-create={x}>{translateTo(x, ar ? "ar" : "en")}</DropdownMenuItem>)}</DropdownMenuContent>
                </DropdownMenu>}
              </>} /></div></Zone></CustomizeScope>
            <PageBlocks def={def} nodes={nodes} company={ctx.company} addSlot />
          </div></Page>
        );
      }}
    </ProFrame>
  );
}

/** E2 — the executive indicator row: five source signals (equal-basis comparisons) and the executive insight lines, one figure once; the rest under "All indicators". */
function ExecKpis({ company, currency, user, ar }: { company: string; currency: string; user: string; ar: boolean }) {
  useScopeMetas(COMMAND_DOCTYPES);
  const signals = withStockGap(execSignals(company, currency, user), gapOf(company, user), currency);
  const prevSignals = execSignals(company, currency, user, compareAsOf(todayIso(), "month"));
  const lines = useV4Lines(["executive"], company, currency, user, ar);
  // the scorecard's previous period: the same lines on the same day last month
  const prevLines = useV4Lines(["executive"], company, currency, user, ar, compareAsOf(todayIso(), "month"));
  return <section aria-label={ar ? "المؤشرات التنفيذية" : "Executive signals"} data-dp-main-kpis data-dp-signals={signals.filter((s) => s.status === "ok").length}>
    <KpiRow id="exec-kpis" ar={ar} items={[...signals.map((s) => kpiFromSignal(s, ar, prevSignals.find((x) => x.id === s.id))), ...lines.map((l) => kpiFromV4(l, ar, prevLines.find((x) => x.id === l.id)))]} />
    <StockValueNotice company={company} currency={currency} className="mt-3" />
  </section>;
}

/** E3 — invoiced-sales trend (existing month drill to exact invoices) beside ranked management exceptions. */
function Cockpit({ company, currency, user, ar, period }: { company: string; currency: string; user: string; ar: boolean; period: number }) {
  const t = (en: string, arabic: string) => (ar ? arabic : en);
  const sales = deptDash("selling", company, undefined, undefined, period).trend;
  const ex = execExceptions(company, currency, user);
  const open = ex.filter((e) => e.status === "ok" && e.count > 0);
  const [all, setAll] = useState(false);
  const shown = all ? ex : open;
  return <ChartRow cols={2}>
    <ChartCard id="exec-sales" size="lg" title={t("Sales performance", "أداء المبيعات")} sub={t("Submitted sales invoices and returns by month — invoiced, not recognised revenue.", "فواتير المبيعات والمرتجعات المعتمدة شهريًا — مفوتر وليس إيرادًا معترفًا به.")} attrs={{ "data-dp-main-trend": "" }}>
      <TrendChart t={sales} currency={currency} />
    </ChartCard>
    <ChartCard id="exec-exceptions" size="lg" title={<>{t("Management exceptions", "استثناءات الإدارة")} <span className="ek-tab-n" data-tone={open.some((e) => e.severity === "high") ? "risk" : undefined} data-no-i18n>{open.length}</span></>}
      sub={t("Ranked by severity, then amount. Each opens its exact filtered records.", "مرتبة حسب الأهمية ثم المبلغ. كل بند يفتح سجلاته المصفّاة بدقة.")}
      action={ex.length > open.length ? <button type="button" className="ek-more-btn" aria-expanded={all} onClick={() => setAll((v) => !v)} data-dp-attention-more>{all ? t("Open only", "المفتوحة فقط") : `${t("All checks", "كل الفحوص")} (${ex.length})`}</button> : undefined}
      attrs={{ "data-dp-attention": open.length, "data-dp-exec-exceptions": "" }}>
      {shown.length === 0 ? <p className="text-sm text-muted-foreground">{t("No open exceptions in this company.", "لا توجد استثناءات مفتوحة في هذه الشركة.")}</p> : <ul className="ek-exc-list">{shown.map((e) => <li key={e.id}><ExceptionRow e={e} ar={ar} /></li>)}</ul>}
    </ChartCard>
  </ChartRow>;
}

function ExceptionRow({ e, ar }: { e: Exception; ar: boolean }) {
  const t = (en: string, arabic: string) => (ar ? arabic : en);
  const restricted = e.status !== "ok";
  const body = <>
    <SevDot sev={restricted || !e.count ? "low" : e.severity} />
    <span className="min-w-0 flex-1">
      <span className="flex flex-wrap items-baseline gap-x-2"><b className="font-medium">{bi(ar, e.label)}</b><span className="dp-cc-meta">{bi(ar, e.domain)}</span></span>
      <span className="block dp-cc-meta">{restricted ? (e.status === "denied" ? t("Not permitted for your role", "غير مسموح لدورك") : t("Source unavailable", "المصدر غير متاح")) : e.count ? bi(ar, e.detail) : t("Clear", "سليم")}{!restricted && e.count > 0 && <> · {t("opens", "يفتح")} {bi(ar, e.dest)}</>}</span>
    </span>
    {!restricted && <span className="shrink-0 text-end"><b className="block tabular-nums" data-no-i18n data-dp-exc-count={e.count}>{e.count}</b>{e.totals.length > 0 && e.count > 0 && <span className="block text-[11px] text-muted-foreground"><Totals totals={e.totals.slice(0, 2)} /></span>}</span>}
  </>;
  if (restricted || !e.count) return <div className="dp-cc-exc" data-clear="" data-severity="low" data-dp-attention-item={e.id} data-status={e.status}>{body}</div>;
  return <DrillLink drill={e.drill} className="dp-cc-exc" data-severity={e.severity} data-dp-attention-item={e.id} data-dp-attention-open={e.id} title={e.commitment ? t("Commitment — not a posted payable", "التزام — ليس ذمة دائنة مرحّلة") : undefined}>{body}</DrillLink>;
}

/** E4/E5 — executive worklist: document-level rows needing a decision, items falling due and approvals waiting for the user, in one tabbed panel. */
function Worklist({ company, currency, user, ar, tab, onTab }: { company: string; currency: string; user: string; ar: boolean; tab: WorkTab | "approvals"; onTab: (t: WorkTab | "approvals") => void }) {
  const t = (en: string, arabic: string) => (ar ? arabic : en);
  const wl = execWorklist(company, currency, user);
  const rowsOf = (id: WorkTab) => wl.items.filter((i) => i.tab === id);
  const table = (id: WorkTab) => { const rows = rowsOf(id);
    if (!rows.length) return <p className="p-4 text-sm text-muted-foreground">{id === "decide" ? t("Nothing needs a decision right now.", "لا شيء يحتاج قرارًا الآن.") : t("Nothing falls due in the next 7 days.", "لا شيء يستحق خلال 7 أيام.")}</p>;
    return <>
      <ul className="ek-rowlist ek-only-sm" data-dp-attention-cards>{rows.map((i) => <li key={i.key}><DrillLink drill={i.drill} className="ek-row" data-severity={i.severity} data-dp-wl-row={i.key}>
        <SevDot sev={i.severity} /><span className="ek-row-main"><span className="ek-row-title" data-no-i18n>{i.name}</span><span className="ek-row-meta">{bi(ar, i.domain)} · {bi(ar, i.issue)}</span>{i.party && <span className="ek-row-meta" data-no-i18n>{i.party}</span>}</span>
        {i.amount !== null ? <b className="ek-row-amt" data-no-i18n>{fmtCurrency(i.amount, i.currency)}</b> : <span />}</DrillLink></li>)}</ul>
      <table className="ek-table ek-only-md" data-dp-attention-table>
        <thead><tr><th scope="col">{t("Severity", "الأهمية")}</th><th scope="col">{t("Area", "المجال")}</th><th scope="col">{t("Issue", "البند")}</th><th scope="col">{t("Source document", "المستند المصدر")}</th><th scope="col">{t("Party / reference", "الطرف / المرجع")}</th><th scope="col">{t("Date", "التاريخ")}</th><th scope="col" className="text-end">{t("Amount", "المبلغ")}</th></tr></thead>
        <tbody>{rows.map((i) => <tr key={i.key} data-dp-wl-row={i.key} data-severity={i.severity}>
          <td className="whitespace-nowrap"><span className="inline-flex items-center gap-1.5"><SevDot sev={i.severity} /><span className="text-xs">{sevLabel(i.severity, ar)}</span></span></td>
          <td className="whitespace-nowrap">{bi(ar, i.domain)}</td>
          <td>{bi(ar, i.issue)}</td>
          <td className="whitespace-nowrap"><DrillLink drill={i.drill} className="font-medium text-primary hover:underline" data-dp-wl-open={i.name}><span className="text-[11px] text-muted-foreground">{translateTo(i.doctype, ar ? "ar" : "en")} · </span><span data-no-i18n>{i.name}</span></DrillLink></td>
          <td className="max-w-56 truncate" data-no-i18n title={i.party}>{i.party || "—"}</td>
          <td className="whitespace-nowrap tabular-nums" data-no-i18n>{i.date || "—"}</td>
          <td className="whitespace-nowrap text-end tabular-nums" data-no-i18n>{i.amount === null ? "—" : fmtCurrency(i.amount, i.currency)}</td>
        </tr>)}</tbody></table>
    </>; };
  const tabs = [
    { id: "decide", label: t("Needs decision", "تحتاج قرارًا"), count: rowsOf("decide").length, tone: "risk" as const, attrs: { "data-dp-wl-tab": "decide" }, content: table("decide") },
    { id: "soon", label: t("Due soon", "تستحق قريبًا"), count: rowsOf("soon").length, tone: "attention" as const, attrs: { "data-dp-wl-tab": "soon" }, content: table("soon") },
    { id: "approvals", label: t("Approvals for you", "اعتمادات بانتظارك"), attrs: { "data-dp-wl-tab": "approvals" }, content: <ApprovalInbox company={company} /> },
  ];
  return <div data-dp-exec-worklist={tab}><WorkPanel id="exec-worklist" title={t("Executive worklist", "قائمة العمل التنفيذية")}
    sub={wl.restricted.length > 0 ? <>{t("Not permitted for your role:", "غير مسموح لدورك:")} <bdi data-no-i18n>{wl.restricted.join(" · ")}</bdi></> : t("Each row opens its native document.", "كل صف يفتح مستنده الأصلي.")}
    tabs={tabs} active={tab} onTab={(x) => onTab(x as WorkTab | "approvals")} height={380} /></div>;
}

/** Liquidity timing — overdue receivables by age vs supplier invoices by due week. Separate bases; never netted into a forecast. */
export function Liquidity({ company, currency, user, ar }: { company: string; currency: string; user: string; ar: boolean }) {
  const t = (en: string, arabic: string) => (ar ? arabic : en);
  const { collect, pay } = liquidityTiming(company, currency, user);
  const card = (title: string, sub: string, tm: Timing, tone: (k: string) => Tone, id: string) => <ChartCard id={`exec-timing-${id}`} size="md" title={title} sub={sub}
    action={<b className="tabular-nums" data-no-i18n data-dp-timing-total={tm.total}>{tm.status === "ok" ? fmtCurrency(tm.total, currency) : "—"}</b>}
    footer={tm.other > 0 ? <><bdi data-no-i18n>{tm.other}</bdi> {t("invoices in other currencies are not included.", "فواتير بعملات أخرى غير مشمولة.")}</> : undefined} attrs={{ "data-dp-exec-timing": id }}>
    {tm.status !== "ok" ? <p className="text-sm text-muted-foreground">{tm.status === "denied" ? t("Not permitted for your role", "غير مسموح لدورك") : t("Source unavailable", "المصدر غير متاح")}</p>
      : <Columns ar={ar} wrap={proWrap} fmt={money(currency)} axisFmt={moneyShort(currency)} height={190}
        data={tm.bars.map((b): Datum => ({ key: b.key, label: bi(ar, b.label), value: b.amount, count: b.count, tone: tone(b.key), ...(b.count ? { drill: b.drill } : {}), attrs: { "data-dp-timing-bar": b.key, "data-amount": String(b.amount), "data-count": String(b.count) } }))} />}
  </ChartCard>;
  return <div data-dp-exec-liquidity>
    <ChartRow cols={2}>
      {card(t("To collect — overdue receivables by age", "للتحصيل — الذمم المدينة المتأخرة حسب العمر"), t("Open sales invoice balances past due, as of today.", "أرصدة فواتير المبيعات المفتوحة المتأخرة حتى اليوم."), collect, (k) => (k === "ar:4" ? "risk" : k === "ar:3" ? "attention" : "good"), "collect")}
      {card(t("To pay — supplier invoices by due week", "للسداد — فواتير الموردين حسب أسبوع الاستحقاق"), t("Open purchase invoice balances by due date. Purchase orders are commitments and are not included.", "أرصدة فواتير المشتريات المفتوحة حسب تاريخ الاستحقاق. أوامر الشراء التزامات وغير مشمولة."), pay, (k) => (k === "ap:overdue" ? "risk" : k === "ap:w1" ? "attention" : "secondary"), "pay")}
    </ChartRow>
    <p className="ek-note">{t("Invoice due dates are obligations, not certain bank movements. This is not a cash forecast.", "تواريخ استحقاق الفواتير التزامات وليست حركات بنكية مؤكدة. هذا ليس توقعًا نقديًا.")}</p>
  </div>;
}

/** Section ids are kept from the earlier dashboard so saved personal/team layouts stay valid (kpis = signals, trend = cockpit, attention = worklist).
 *  Liquidity timing ("aging") moved to Executive › Cash & liquidity and the executive questions to Executive › Financial position & leadership (owner 2026-11-12). */
/** Executive blocks: the kpi row, sales performance with exceptions, the worklist beside activity, the department queues and the report / service links (one figure once). */
const EXEC_BLOCKS: PageBlockDef[] = [
  SHORTCUTS_BLOCK,
  { id: "kpis", title: ["Executive signals", "المؤشرات التنفيذية"], w: 12, required: true },
  ...FINANCE_BLOCKS,
  { id: "trend", title: ["Sales performance & exceptions", "أداء المبيعات والاستثناءات"], w: 12, period: true },
  { id: "attention", title: ["Executive worklist", "قائمة العمل التنفيذية"], w: 8 },
  { id: "activity", title: ["Activity", "النشاط"], w: 4 },
  { id: "departments", title: ["Departments", "الأقسام"], w: 12 },
  { id: "reports", title: ["Management reports", "تقارير الإدارة"], w: 6 },
  { id: "services", title: ["Shared services", "الخدمات المشتركة"], w: 6 },
];
/** Months of the sales trend: the block's own period (block menu), else six months. */
const monthsOf = (o: Record<string, string | undefined>, today: string) => { const w = blockWindow(o, today); return w ? Math.max(1, Math.min(12, Math.round(w.days / 30.4))) : 6; };
const SECTION_LABELS: Record<string, string> = { questions: "Executive questions", kpis: "Executive signals", attention: "Executive worklist", aging: "Liquidity timing", trend: "Sales performance & exceptions", departments: "Departments", recent: "Recent work", alerts: "Notifications", reports: "Management reports", services: "Shared Services" };
const SOURCE_LABELS: Record<string, string> = { personal: "Your layout", team: "Team default", default: "Standard layout", draft: "Unsaved changes" };

/** Customize bar: reorder/hide sections, then save as personal layout or (System Manager) publish as team default. */
export function EditBar({ layout, source, canTeam, onChange, onSave, onReset, onCancel, labels = SECTION_LABELS }: { layout: DashLayout; source: string; canTeam: boolean; onChange: (l: DashLayout) => void; onSave: (scope: "Personal" | "Team") => void; onReset: () => void; onCancel: () => void; labels?: Record<string, string> }) {
  return <section className="dp-card" data-dp-dash-editor>
    <div className="flex flex-wrap items-center gap-2"><h2 className="dp-ws-h">Customize dashboard</h2><span className="chip bg-accent text-[11px]" data-dp-dash-source={source}>{SOURCE_LABELS[source]}</span></div>
    <ul className="mt-2 grid gap-1 text-sm">{layout.order.map((id, i) => { const hidden = layout.hidden.includes(id); return <li key={id} className="flex items-center gap-2" data-dp-dash-row={id}>
      <label className="flex flex-1 items-center gap-2"><input type="checkbox" checked={!hidden} onChange={() => onChange(toggle(layout, id))} aria-label={labels[id]} /><span className={hidden ? "text-muted-foreground line-through" : ""}>{labels[id]}</span></label>
      <button type="button" className="btn-ghost px-2" disabled={i === 0} onClick={() => onChange(move(layout, id, -1))} aria-label="Move up" data-dp-dash-up={id}>↑</button>
      <button type="button" className="btn-ghost px-2" disabled={i === layout.order.length - 1} onClick={() => onChange(move(layout, id, 1))} aria-label="Move down" data-dp-dash-down={id}>↓</button>
    </li>; })}</ul>
    <label className="mt-2 flex items-center gap-2 text-sm"><span>Chart period</span>
      <select className="field-input w-auto" value={layout.period ?? 6} onChange={(e) => onChange({ ...layout, period: Number(e.target.value) === 12 ? 12 : 6 })} data-dp-dash-period>
        <option value={6}>Last 6 months</option><option value={12}>Last 12 months</option></select></label>
    <div className="mt-3 flex flex-wrap gap-2">
      <button type="button" className="btn-primary" onClick={() => onSave("Personal")} data-dp-dash-save>Save my layout</button>
      {canTeam && <button type="button" className="btn-ghost" onClick={() => onSave("Team")} data-dp-dash-team>Publish as team default</button>}
      <button type="button" className="btn-ghost" onClick={onReset} data-dp-dash-reset>Reset my layout</button>
      <button type="button" className="btn-ghost ms-auto" onClick={onCancel}>Done</button>
    </div>
  </section>;
}
