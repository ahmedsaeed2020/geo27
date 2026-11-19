/**
 * Destination workspaces — level 3 of the FSM navigation (screens.ts FSM_DESTINATIONS). Every section workspace shows exactly
 * three tabs, like Construction (owner FSM round F1-02): Overview | Documents & work | Full reports, kept in the URL (?tab=), so
 * Back returns to the exact tab and filters; the earlier ?tab=work / ?tab=details addresses open Documents & work. Documents &
 * work holds the section's work queues, then one Enterprise card per source list (permitted count, open list, + New only when
 * the session may create); Full reports lists the reports and the metrics that drill into them. The backing-record map
 * (link / table fields) is a preview diagnostic and shows only in Developer mode. Overview and Work are given by
 * dedicated pages (Operations Center, Visits, Site Explorer, Technicians) or built here from the destination's own
 * documents and queues. Nothing is cached or copied; every number is a permitted-record count with its drill link.
 */
import type { ReactNode } from "react";
import type { PluginPageProps } from "@/plugins/pages";
import { assertScoped } from "@/lib/scope";
import { useEffect } from "react";
import { DirectoryGroups, TabBar, type DirItem } from "@/components/digit/Experience";
import { DevOnly } from "@/components/DevOnly";
import { canRead, list, titleOf } from "../domain/data";
import { OPEN_DEFICIENCY, s } from "../domain/rules";
import { FSM_DOCTYPES } from "../schema";
import { FSM_MODULES, destinationByKey, screenById, type FsmDestination, type FsmScreen } from "../screens";
import { FSM_REPORTS } from "../domain/reports";
import { FSM_KPIS } from "../analytics/kpis";
import { QUEUES } from "./queues";
import { WorklistTabs } from "./home";
import { Donut, Ranked, type ChartItem } from "./charts";
import { AppLink, BAND, DxState, Kpi, ListRef, NewDoc, PageHeader, Panel, SignalGrid, dtLabel, numTxt, opt, useFx, useUrlState } from "./kit";
import { Bars, Insight, InsightGrid, OverviewFrame, ScopeBar, pts, rp, scopeOf } from "./insights";
import { OVERVIEWS } from "./ov";
import type { OvFn } from "./ov/ctx";

type Fx = ReturnType<typeof useFx>;
export const TABS = ["overview", "documents", "reports"] as const;
export type TabKey = (typeof TABS)[number];
const TAB_LABEL: Record<TabKey, [string, string]> = { overview: ["Overview", "نظرة عامة"], documents: ["Documents & work", "المستندات والعمل"], reports: ["Full reports", "التقارير الكاملة"] };
/** Addresses of the earlier five-tab workspace keep working: they open the tab that now holds their content. */
export const LEGACY_TAB: Record<string, TabKey> = { work: "documents", details: "documents" };
const FSM_DT = new Map(FSM_DOCTYPES.map((d) => [d.name, d]));
export const canCreate = (dt: string) => { try { assertScoped(dt, "create"); return true; } catch { return false; } };
const docScreens = (d: FsmDestination) => d.docs.map((id) => screenById(id)).filter((x): x is FsmScreen => !!x);
const doctypeOf = (sc: FsmScreen) => (sc.to.startsWith("doctype:") ? sc.to.slice(8) : "");

/** URL-kept tab bar + tab body. `overview` / `work` come from the page; Documents & work and Full reports are generated from the destination. */
export function DestinationTabs({ dest, overview, work, hide = [] }: { dest: FsmDestination; overview: ReactNode; work?: ReactNode; hide?: TabKey[] }) {
  const fx = useFx(); const { t } = fx; const [f, set] = useUrlState();
  const hasDocs = !!(work || dest.queues.length || dest.docs.length);
  const tabs = TABS.filter((k) => !hide.includes(k) && (k !== "documents" || hasDocs) && (k !== "reports" || dest.reports.length));
  const raw = f["tab"] ?? ""; const legacy = LEGACY_TAB[raw];
  useEffect(() => { if (legacy) set({ tab: legacy }); }, [legacy]); // eslint-disable-line react-hooks/exhaustive-deps
  const want = legacy ?? raw;
  const tab = (tabs as readonly string[]).includes(want) ? (want as TabKey) : "overview";
  return (
    <div data-destination={dest.key} data-tab-active={tab} data-fsm-tabs={tabs.join(",")}>
      <TabBar ariaLabel={t("Workspace sections", "أقسام مساحة العمل")} value={tab} onChange={(k) => set({ tab: k === "overview" ? undefined : k })}
        tabs={tabs.map((k) => ({ key: k, label: t(...TAB_LABEL[k]), count: k === "documents" ? dest.docs.length || undefined : k === "reports" ? dest.reports.length : undefined }))} />
      {tab === "overview" && overview}
      {tab === "documents" && <>
        {(work || dest.queues.length > 0) && <section className="mb-4" data-fsm-work>{work ?? <WorkTab dest={dest} fx={fx} />}</section>}
        {dest.docs.length > 0 && <DocumentsTab dest={dest} />}
        <DevOnly><DetailsTab dest={dest} /></DevOnly>
      </>}
      {tab === "reports" && <ReportsTab dest={dest} />}
    </div>
  );
}

function WorkTab({ dest, fx }: { dest: FsmDestination; fx: Fx }) {
  const qs = dest.queues.map((k) => QUEUES.find((q) => q.key === k)).filter((q): q is NonNullable<typeof q> => !!q);
  if (!qs.length) return <DxState kind="empty" title={fx.t("No work queue belongs to this workspace.", "لا يوجد طابور عمل لهذه المساحة.")} />;
  return <div data-work-queues><WorklistTabs defs={qs} fx={fx} limit={8} /></div>;
}

/** Documents: one Enterprise card per source list — its name, the records you may read, open list and + New (only when the session may create). */
export function DocumentsTab({ dest }: { dest: FsmDestination }) {
  const { t, ar } = useFx();
  const scs = docScreens(dest);
  const docs = scs.filter((x) => doctypeOf(x)); const pages = scs.filter((x) => !doctypeOf(x));
  return (
    <>
      {docs.length > 0 && <SignalGrid lead={false} cols={docs.length >= 4 ? 4 : docs.length === 3 ? 3 : "auto"}>{docs.map((sc) => {
        const dt = doctypeOf(sc); const single = FSM_DT.get(dt)?.issingle; const readable = canRead(dt);
        return <div key={sc.id} className="min-w-0" data-doc-row={dt}>
          <Kpi label={ar ? sc.label_ar : sc.label} value={readable ? (single ? t("Settings", "إعدادات") : numTxt(list(dt).length)) : "—"} icon="doc" tone="neutral"
            basis={readable ? (single ? t("One settings record", "سجل إعدادات واحد") : t("Records you may read", "السجلات المسموح لك بقراءتها")) : t("Restricted for your role", "مقيّد لدورك")} />
          <div className="mt-1.5 flex flex-wrap gap-1.5" data-doc-actions>
            {readable && <ListRef doctype={dt} className="btn-ghost min-h-8 px-2.5 text-xs">{single ? t("Open settings", "فتح الإعدادات") : t("Open list", "فتح القائمة")}</ListRef>}
            {!single && readable && canCreate(dt) && <NewDoc doctype={dt} label={t("New", "جديد")} />}
          </div>
        </div>;
      })}</SignalGrid>}
      {pages.length > 0 && <DirectoryGroups groups={[{ key: "pages", title: t("Related screens", "شاشات ذات صلة"), items: pages.map((sc): DirItem => ({ key: sc.id, label: ar ? sc.label_ar : sc.label, node: (cls, inner) => <AppLink to={sc.to} className={cls}>{inner}</AppLink> })) }]} />}
    </>
  );
}

/** Category column a report chart groups by (first match in column order); reports without one show their row count. */
const CAT_COL = /^(status|state|outcome|severity|bucket|dataset|technical_result|decision|priority|event|last_outcome|coverage|job_type|delivery|lifecycle|retest_status|repair_state)$/;
/** Scoped dashboard of the destination's RP reports: one chart per report, grouped by its category column, each bar opening the report filtered to that value. */
function ReportCharts({ reps }: { reps: (typeof FSM_REPORTS)[number][] }) {
  const { t, ar } = useFx(); const [f] = useUrlState(); const F = scopeOf(f);
  return (
    <div data-report-charts>
      <ScopeBar />
      <InsightGrid>{reps.map((r) => {
        const rows = r.run(F); const col = r.columns.find((c) => CAT_COL.test(c.fieldname));
        return (
          <Insight key={r.id} id={`rp-${r.id}`} title={[`${r.id} · ${r.title}`, `${r.id} · ${r.title_ar}`]} q={[r.question, r.question_ar]}
            meta={{ src: [r.ref_doctype, ...((r as { needs?: string[] }).needs ?? [])], grain: [r.grain, r.grain_ar], formula: col ? [`Rows of ${r.id} for the scope, counted by ${col.label}`, `صفوف ${r.id} ضمن النطاق معدودة حسب ${col.label_ar}`] : [`Rows of ${r.id} for the scope`, `صفوف ${r.id} ضمن النطاق`], drill: [`${r.id} filtered to the value, then the record`, `${r.id} مفلتراً بالقيمة، ثم السجل`], ...(r.status !== "VIRTUAL" ? { missing: ["Columns marked server-required stay empty in the preview and are never estimated", "الأعمدة التي تتطلب الخادم تبقى فارغة في المعاينة ولا تُقدّر"] as [string, string] } : {}) }}>
            {col ? <Bars items={pts(countBy(rows, col.fieldname), { label: (k) => opt(k, ar), limit: 8, drill: (k) => ({ to: rp(r.id, F, { [col.fieldname]: k }) }) })} empty={r.status === "SERVER_REQUIRED" ? t("Needs the DIGIT server — no rows in the preview.", "يتطلب خادم فرابي — لا صفوف في المعاينة.") : t("No rows for this scope.", "لا صفوف لهذا النطاق.")} />
              : <p className="text-sm text-muted-foreground">{t("Rows", "الصفوف")}: <span className="font-semibold tabular-nums text-foreground" data-no-i18n>{numTxt(rows.length)}</span></p>}
            <AppLink to={rp(r.id, F)} className="mt-3 inline-flex text-[13px] text-primary hover:underline">{t("Open report", "فتح التقرير")} <span className="ms-1" data-no-i18n>{r.id} · {numTxt(rows.length)}</span></AppLink>
          </Insight>
        );
      })}</InsightGrid>
    </div>
  );
}

export function ReportsTab({ dest }: { dest: FsmDestination }) {
  const { t, ar } = useFx();
  const reps = dest.reports.map((id) => FSM_REPORTS.find((r) => r.id === id)).filter((r): r is NonNullable<typeof r> => !!r);
  const kpis = FSM_KPIS.filter((k) => dest.reports.includes(k.report));
  return <>
    {reps.length > 0 && <ReportCharts reps={reps} />}
    <DirectoryGroups groups={[
      { key: "rp", title: t("Reports", "التقارير"), items: reps.map((r): DirItem => ({ key: r.id, label: ar ? r.title_ar : r.title, meta: <span className="text-muted-foreground">{ar ? r.question_ar : r.question}</span>, node: (cls, inner) => <AppLink to={`reports/${r.id}`} className={cls}>{inner}</AppLink> })) },
      ...(kpis.length ? [{ key: "k", title: t("Metrics that open these reports", "مؤشرات تفتح هذه التقارير"), items: kpis.map((k): DirItem => { const rr = FSM_REPORTS.find((x) => x.id === k.report); return { key: k.id, label: ar ? k.label_ar : k.label, meta: <span className="text-muted-foreground">{t("Opens", "يفتح")} {rr ? (ar ? rr.title_ar : rr.title) : k.report}</span>, node: (cls, inner) => <AppLink to={`reports/${k.report}?kpi=${k.id}`} className={cls}>{inner}</AppLink> }; }) }] : []),
    ]} />
  </>;
}

/** Details: backing DocTypes with their Link / Table fields (the relations the workspace follows). */
export function DetailsTab({ dest }: { dest: FsmDestination }) {
  const { t, ar } = useFx();
  const dts = [...new Set(docScreens(dest).map(doctypeOf).filter(Boolean))];
  const group = FSM_MODULES.find((m) => m.key === dest.group);
  return (
    <Panel title={t("Backing records and links", "السجلات والروابط الداعمة")} subtitle={<span data-no-i18n>{group ? (ar ? group.label_ar : group.label) : dest.group} › {ar ? dest.label_ar : dest.label} · /plugins/digit_fsm/{dest.to}</span>}>
      {!dts.length ? <DxState kind="empty" title={t("This workspace reads reports only.", "هذه المساحة تقرأ التقارير فقط.")} /> : (
        <div className="overflow-x-auto rounded-md border border-border" data-details>
          <table className="w-full min-w-max text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground"><tr>{[t("DocType", "نوع المستند"), t("Source", "المصدر"), t("Links (field → target)", "الروابط (الحقل ← الهدف)"), t("Child tables", "الجداول الفرعية")].map((h) => <th key={h} className="px-3 py-2 text-start font-medium">{h}</th>)}</tr></thead>
            <tbody>{dts.map((dt) => {
              const m = FSM_DT.get(dt); const fields = (m?.fields ?? []) as { fieldname: string; fieldtype: string; options?: string }[];
              return <tr key={dt} className="border-t border-border/70 align-top">
                <td className="px-3 py-2" data-no-i18n>{dt}<div className="text-xs text-muted-foreground">{dtLabel(dt, true)}</div></td>
                <td className="px-3 py-2" data-no-i18n>{m ? "FSM_EXISTING" : "NATIVE_REUSED"}</td>
                <td className="px-3 py-2 text-xs" data-no-i18n>{m ? fields.filter((x) => x.fieldtype === "Link").map((x) => `${x.fieldname} → ${x.options}`).join(" · ") || "—" : t("native fields (catalog); FSM adds only the custom fields listed in the as-built handoff", "حقول أصلية (الكتالوج)؛ تضيف الخدمة الحقول المخصصة المذكورة في وثيقة التسليم فقط")}</td>
                <td className="px-3 py-2 text-xs" data-no-i18n>{m ? fields.filter((x) => x.fieldtype === "Table").map((x) => `${x.fieldname} → ${x.options}`).join(" · ") || "—" : "—"}</td>
              </tr>;
            })}</tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

// ---------------------------------------------------------------- generic overviews
const countBy = (rows: Record<string, unknown>[], f: string) => { const m = new Map<string, number>(); for (const r of rows) { const k = s(r[f]) || "—"; m.set(k, (m.get(k) ?? 0) + 1); } return m; };
function GenericOverview({ dest, fx }: { dest: FsmDestination; fx: Fx }) {
  const { t, ar } = fx;
  const docs = docScreens(dest).filter((x) => doctypeOf(x) && !FSM_DT.get(doctypeOf(x))?.issingle);
  const lists = dest.queues.slice(0, 2).map((k) => QUEUES.find((q) => q.key === k)).filter((q): q is NonNullable<typeof q> => !!q);
  return (
    <>
      {dest.overview && <SpecialOverview kind={dest.overview} fx={fx} />}
      {docs.length > 0 && <SignalGrid>{docs.map((sc) => { const dt = doctypeOf(sc); const ok = canRead(dt); return (
        <ListRef key={sc.id} doctype={dt} className="block min-w-0"><Kpi label={ar ? sc.label_ar : sc.label} value={ok ? numTxt(list(dt).length) : "—"} icon="doc" tone="neutral" basis={ok ? t("Records you may read · open list", "السجلات المسموح بقراءتها · فتح القائمة") : t("Restricted for your role", "مقيّد لدورك")} /></ListRef>
      ); })}</SignalGrid>}
      {lists.length > 0 && <WorklistTabs defs={lists} fx={fx} />}
      {!docs.length && !lists.length && !dest.overview && <ReportsTab dest={dest} />}
    </>
  );
}

function SpecialOverview({ kind, fx }: { kind: NonNullable<FsmDestination["overview"]>; fx: Fx }) {
  const { t, ar } = fx;
  if (kind === "unavailable-finance") return (
    <div className="mb-4 rounded-md border border-dx-warn/40 bg-dx-warn-soft px-4 py-3 text-sm text-dx-warn" role="note" data-unavailable-source>
      {t("Unavailable source: job and agreement profitability needs posted native costs (stock valuation, payroll / timesheet costing, purchase invoices) and submitted Sales Invoices allocated to the job. This preview shows quoted and charged values only — no margin is computed or invented.", "مصدر غير متاح: ربحية أوامر العمل والاتفاقيات تتطلب تكاليف أصلية مرحّلة (تقييم المخزون، تكلفة الرواتب/الساعات، فواتير الشراء) وفواتير مبيعات معتمدة مخصصة لأمر العمل. هذه المعاينة تعرض القيم المسعّرة والمحصّلة فقط — لا يُحسب هامش ولا يُختلق.")}
      {" "}<AppLink to="reports/RP14">RP14</AppLink> · <AppLink to="reports/RP15">RP15</AppLink>
    </div>
  );
  if (kind === "itm") {
    const runs = list("FSM Inspection Run");
    const byState = countBy(runs, "workflow_state"); const done = runs.filter((r) => ["Reviewed", "Published"].includes(s(r["workflow_state"]))); const byRes = countBy(done, "technical_result");
    const seg = (m: Map<string, number>, field: string): ChartItem[] => [...m].map(([k, v]) => ({ key: k, label: opt(k, ar), value: v, wrap: (n: ReactNode) => <ListRef doctype="FSM Inspection Run" filters={[["FSM Inspection Run", field, k]]} className="block">{n}</ListRef> }));
    return <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-2">
      <Panel title={t("Runs by status", "الجولات حسب الحالة")} subtitle={t("FSM Inspection Run.workflow_state — each row opens the filtered register", "حالة تشغيل الفحص — كل صف يفتح السجل المفلتر")}><Donut items={seg(byState, "workflow_state")} total={t("runs", "جولة")} empty={t("No inspection runs.", "لا جولات فحص.")} /></Panel>
      <Panel title={t("Technical result of reviewed runs", "النتيجة الفنية للجولات المراجَعة")} subtitle={t("Reviewed or published runs only; Pending / Incomplete are not passes", "الجولات المراجَعة أو المنشورة فقط؛ المعلق/غير المكتمل ليس نجاحاً")}><Donut items={seg(byRes, "technical_result")} total={t("reviewed", "مراجَعة")} empty={t("No reviewed runs yet.", "لا جولات مراجَعة بعد.")} /></Panel>
    </div>;
  }
  const open = list("FSM Deficiency").filter((d) => OPEN_DEFICIENCY.has(s(d["workflow_state"])));
  if (kind === "risk") {
    const sev = countBy(open, "severity"); const st = countBy(open, "workflow_state");
    return <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-2">
      <Panel title={t("Open findings by severity", "الملاحظات المفتوحة حسب الخطورة")} subtitle={t("Each row opens RP05 Deficiency aging with the same severity", "كل صف يفتح RP05 أعمار الملاحظات بنفس الخطورة")}>
        <Donut items={[...sev].map(([k, v]) => ({ key: k, label: opt(k, ar), value: v, tone: k === "Critical" ? "bad" : undefined, wrap: (n: ReactNode) => <AppLink to={`reports/RP05?severity=${encodeURIComponent(k)}`} className="block">{n}</AppLink> }))} total={t("open", "مفتوحة")} empty={t("No open findings.", "لا ملاحظات مفتوحة.")} />
      </Panel>
      <Panel title={t("Open findings by stage", "الملاحظات المفتوحة حسب المرحلة")} subtitle={t("FSM Deficiency.workflow_state — opens the filtered register", "حالة الملاحظة — يفتح السجل المفلتر")}>
        <Ranked items={[...st].map(([k, v]) => ({ key: k, label: opt(k, ar), value: v, wrap: (n: ReactNode) => <ListRef doctype="FSM Deficiency" filters={[["FSM Deficiency", "workflow_state", k]]} className="block">{n}</ListRef> }))} empty={t("No open findings.", "لا ملاحظات مفتوحة.")} />
      </Panel>
    </div>;
  }
  const bySite = countBy(open, "site");
  return <Panel title={t("Open findings by site", "الملاحظات المفتوحة حسب الموقع")} subtitle={t("Each row opens RP05 filtered to the site, then the finding", "كل صف يفتح RP05 مفلتراً بالموقع، ثم الملاحظة")}>
    <Ranked limit={12} items={[...bySite].map(([k, v]) => ({ key: k, label: <span data-no-i18n>{titleOf("FSM Service Site", k)}</span>, value: v, wrap: (n: ReactNode) => <AppLink to={`reports/RP05?site=${encodeURIComponent(k)}`} className="block">{n}</AppLink> }))} empty={t("No open findings.", "لا ملاحظات مفتوحة.")} />
  </Panel>;
}

/** Shell of a destination page: group header + band + tabs. Dedicated pages pass their own overview / work content. */
export function DestinationShell({ dest, overview, work, band, hide }: { dest: FsmDestination; overview: ReactNode; work?: ReactNode; band?: { meta?: { label: ReactNode; value: ReactNode }[]; controls?: ReactNode; actions?: ReactNode; basis?: ReactNode }; hide?: TabKey[] }) {
  const { ar } = useFx();
  return (
    <div className="w-full min-w-0" data-page={`fsm-dest-${dest.key}`}>
      <PageHeader title={ar ? dest.label_ar : dest.label} band={{ question: ar ? dest.question_ar : dest.question, ...band }} />
      <DestinationTabs dest={dest} overview={overview} {...(work ? { work } : {})} {...(hide ? { hide } : {})} />
    </div>
  );
}

/** Source-backed overview of a destination (ui/ov spec): URL scope → permitted records / RP rows → charts, KPIs, frame. */
function SpecOverview({ dest, fn }: { dest: FsmDestination; fn: OvFn }) {
  const fx = useFx(); const [f] = useUrlState();
  const F = scopeOf(f);
  return <OverviewFrame dest={dest} spec={fn({ fx, t: fx.t, ar: fx.ar, F })} />;
}

/** Generic destination workspace (ws/<key>). */
export function DestinationPage({ params }: PluginPageProps) {
  const fx = useFx(); const { t } = fx;
  const key = String(params["key"] ?? "");
  const dest = destinationByKey(key);
  if (!dest) return <DxState kind="empty" title={t("Unknown workspace", "مساحة عمل غير معروفة")} detail={<span data-no-i18n>{key}</span>} action={<AppLink to="">{t("Back to My work", "العودة إلى عملي")}</AppLink>} />;
  const firstReport = dest.reports[0]; const ov = OVERVIEWS[dest.key];
  return <DestinationShell dest={dest} overview={ov ? <SpecOverview dest={dest} fn={ov} /> : <GenericOverview dest={dest} fx={fx} />}
    band={{ basis: t("Counts are records you may read; every card, chart row and list opens its source records.", "الأعداد هي السجلات المسموح لك بقراءتها؛ كل بطاقة وصف ورسم وقائمة تفتح سجلاتها المصدر."), ...(firstReport ? { actions: <AppLink to={`reports/${firstReport}`} className={BAND.secondary}>{t("Open report", "فتح التقرير")} <span data-no-i18n>{firstReport}</span></AppLink> } : {}) }} />;
}
