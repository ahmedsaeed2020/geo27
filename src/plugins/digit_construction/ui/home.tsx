/** Management screens: home (MGT-01), portfolio (MGT-02), management hub / approvals (MGT-03) and the projects register (PRJ-01). */
import { useState } from "react";
import { Open360 } from "@/components/enterprise/Open360";
import { adapter } from "@/lib/adapter";
import { isFrappeHost } from "../domain/host";
import { num, r2, sumBy } from "../domain/calc";
import { costPosition, customerName, list, overdueTasks, projectCommercial, projectTitle, resourcesOf, scheduleSlipDays, tasksOf, today } from "../domain/data";
import { constructionProjects, DEPTS, queues, settings, type Queue } from "../domain/queues";
import { AppLink, BAND, Bars, compact, DataTable, dateTxt, DocRef, Empty, Field, Filters, inputCls, Kpi, KpiGrid, ListRef, Measures, money, NewDoc, PageHeader, PolicyGate, Progress, ProjectRef, Section, StateBadge, useCx, type Col, BTN } from "./kit";
import { InsightsChartPanel, insightsSeries, useWorkspaceChartIds } from "./analytics";
import { BandField, bandInput, DxPanel, DxSplit, DxState, ExceptionList, TabBar, type ExceptionItem } from "@/components/digit/Experience";
import { NavIcon } from "@/components/plugins/navIcons";

interface PRow { [k: string]: unknown; name: string; title: string; status: unknown; customer: unknown; city: unknown; start: unknown; end: unknown; progress: number; revised: number; certified: number; invoiced: number; collected: number; outstanding: number;
  budget: number | null; committed: number; actual: number; eac: number | null; margin: number | null | undefined; slip: number | null; overdue: number }
function projectRows(company?: string, ar = false): PRow[] {
  return constructionProjects({ company }).map((p) => {
    const com = projectCommercial(p.name), cost = costPosition(p.name);
    const ts = tasksOf(p.name);
    const progress = ts.length ? r2(sumBy(ts, (t) => num(t["progress"])) / ts.length) : num(p["percent_complete"]);
    return { name: p.name, title: projectTitle(p, !ar), status: p["status"], customer: p["customer"], city: p["digit_city"], start: p["expected_start_date"], end: p["expected_end_date"], progress,
      revised: com.revised, certified: com.certifiedGross, invoiced: com.invoicedNet, collected: com.collected, outstanding: com.outstanding, budget: cost.budget ? cost.revised : null, committed: cost.committed, actual: cost.actual, eac: cost.eac, margin: cost.marginPct,
      slip: scheduleSlipDays(p.name), overdue: overdueTasks(p.name).length };
  });
}
function useCompany() {
  const [company, setCompany] = useState<string>("");
  const companies = [...new Set(constructionProjects().map((p) => String(p["company"] ?? "")))].filter(Boolean);
  return { company, setCompany, companies };
}
function CompanyFilter({ company, setCompany, companies }: ReturnType<typeof useCompany>) {
  const { t } = useCx();
  if (companies.length < 2) return null;
  return <Field label={t("Company", "الشركة")}><select className={inputCls} value={company} onChange={(e) => setCompany(e.target.value)}><option value="">{t("All companies", "كل الشركات")}</option>{companies.map((c) => <option key={c} value={c} data-no-i18n>{c}</option>)}</select></Field>;
}

export function QueueList({ items, empty }: { items: Queue[]; empty: string }) {
  const { t, ar } = useCx();
  const open = items.filter((q) => q.docs.length);
  if (!open.length) return <Empty>{empty}</Empty>;
  return (
    <ul className="divide-y divide-border" role="list">
      {open.map((q) => (
        <li key={q.key} className="flex items-center gap-3 py-2 text-sm" data-queue={q.key}>
          <span className={`inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-xs font-semibold ${q.severity === "blocked" ? "bg-destructive/10 text-destructive" : q.severity === "risk" ? "bg-warning/15 text-warning" : "bg-primary/10 text-primary"}`} data-no-i18n>{q.docs.length}</span>
          <div className="min-w-0 flex-1">
            <div className="truncate font-medium">{ar ? q.ar : q.en}</div>
            <div className="truncate text-xs text-muted-foreground"><span data-no-i18n>{q.docs.slice(0, 3).map((d) => d.name).join(" · ")}</span>{q.docs.length > 3 ? ` +${q.docs.length - 3}` : ""}{q.severity === "blocked" ? ` — ${t("blocked by a policy decision", "موقوف بانتظار قرار سياسة")}` : ""}</div>
          </div>
          {q.page !== undefined ? <AppLink to={q.page} className="shrink-0 text-xs text-primary hover:underline">{t("Open", "فتح")}</AppLink>
            : <ListRef doctype={q.doctype} filters={q.filters} className="shrink-0 text-xs text-primary hover:underline">{t("Open list", "فتح القائمة")}</ListRef>}
        </li>
      ))}
    </ul>
  );
}

/** Company scope inside the command band (shown only when the user can see more than one construction company). */
function BandCompany({ company, setCompany, companies }: ReturnType<typeof useCompany>) {
  const { t } = useCx();
  if (companies.length < 2) return null;
  return <BandField label={t("Company", "الشركة")}><select className={bandInput} value={company} data-scope="company" onChange={(e) => setCompany(e.target.value)}><option value="">{t("All companies", "كل الشركات")}</option>{companies.map((c) => <option key={c} value={c} data-no-i18n>{c}</option>)}</select></BandField>;
}
const SEV: Record<Queue["severity"], ExceptionItem["severity"]> = { blocked: "bad", risk: "warn", action: "info" };
/** Queues as ranked exceptions: each row names its source documents and opens the same list or page its count comes from. */
export function queueExceptions(items: Queue[], ar: boolean, t: (e: string, a: string) => string): ExceptionItem[] {
  return items.map((q) => ({ key: q.key, severity: SEV[q.severity], count: q.docs.length, title: ar ? q.ar : q.en, attrs: { "data-queue": q.key },
    detail: <><span data-no-i18n>{q.docs.slice(0, 3).map((d) => d.name).join(" · ")}</span>{q.docs.length > 3 ? ` +${q.docs.length - 3}` : ""}{q.severity === "blocked" ? ` — ${t("blocked by a policy decision", "موقوف بانتظار قرار سياسة")}` : ""}</>,
    action: q.page !== undefined ? <AppLink to={q.page} className="font-medium text-primary hover:underline">{t("Open", "فتح")}</AppLink> : <ListRef doctype={q.doctype} filters={q.filters} className="font-medium text-primary hover:underline">{t("Open list", "فتح القائمة")}</ListRef> }));
}
export const severityText = (t: (e: string, a: string) => string) => (s: ExceptionItem["severity"]) => (s === "bad" ? t("Blocked", "موقوف") : s === "warn" ? t("Risk", "خطر") : t("Action", "إجراء"));

export function HomePage() {
  const { t, ar } = useCx();
  const cf = useCompany();
  const [wl, setWl] = useState("health");
  const rows = projectRows(cf.company || undefined, ar);
  const qs = queues({ company: cf.company || undefined });
  const charts = useWorkspaceChartIds({ dashKey: "executive", scope: { company: cf.company || undefined } });
  const active = rows.filter((r) => r.status === "Open");
  const sum = (k: string) => sumBy(rows, (r) => num(r[k]));
  const eacKnown = rows.filter((r) => r.eac !== null && r.revised);
  const portfolioMargin = eacKnown.length ? r2(((sumBy(eacKnown, (r) => num(r.revised)) - sumBy(eacKnown, (r) => num(r.eac))) / sumBy(eacKnown, (r) => num(r.revised))) * 100) : null;
  const of = (sev: Queue["severity"]) => qs.filter((q) => q.severity === sev);
  const count = (xs: Queue[]) => xs.reduce((s, q) => s + q.docs.length, 0);
  const actionCount = count(of("action")), riskCount = count(of("risk")), blockedCount = count(of("blocked"));
  const collectedTrend = insightsSeries("DCON-C-FIN-CASH", "Collected (actual)", { company: cf.company || undefined });
  if (!rows.length) return (
    <div className="w-full min-w-0" data-page="construction-home">
      <PageHeader title={t("Management home", "الصفحة الرئيسية للإدارة")} />
      <DxState kind="empty" title={t("No construction projects yet", "لا توجد مشاريع مقاولات بعد")} detail={isFrappeHost() ? t("Create a Project and a Tender in the Desk; they appear here after saving.", "أنشئ مشروعاً ومنافسة من المكتب؛ ستظهر هنا بعد الحفظ.") : t("Create a Project and a Tender, or reinstall the demo from Apps & Plugins (insert-if-missing).", "أنشئ مشروعاً ومنافسة، أو أعد تثبيت البيانات التجريبية من صفحة التطبيقات (إدراج عند الغياب فقط).")} action={<ListRef doctype="Project">{t("Open Projects", "فتح المشاريع")}</ListRef>} />
    </div>
  );
  return (
    <div className="w-full min-w-0" data-page="construction-home">
      <PageHeader title={t("Management home", "الصفحة الرئيسية للإدارة")} subtitle={t("Portfolio position computed from contracts, certificates, invoices, payments, budgets and commitments — nothing is stored separately.", "الموقف محسوب من العقود والشهادات والفواتير والمدفوعات والموازنات والالتزامات — لا يُخزَّن أي رقم بشكل منفصل.")}
        band={{ question: t("Which projects need management attention today?", "ما المشاريع التي تحتاج انتباه الإدارة اليوم؟"),
          basis: t("Approved values only: confirmed certificates, submitted invoices and payments. Pending claims and variations stay in the queues below.", "القيم المعتمدة فقط: الشهادات المؤكدة والفواتير والمدفوعات المرحّلة. المطالبات والتغييرات المعلقة تبقى في القوائم أدناه."),
          controls: <BandCompany {...cf} />,
          meta: [
            { label: t("Scope", "النطاق"), value: cf.company ? <span data-no-i18n>{cf.company}</span> : t("All construction companies", "كل شركات المقاولات") },
            { label: t("Projects", "المشاريع"), value: <span data-no-i18n>{rows.length}</span> },
            { label: t("Currency", "العملة"), value: t("SAR", "ر.س") },
            { label: t("Waiting for action", "بانتظار إجراء"), value: <span data-no-i18n>{actionCount}</span> },
            { label: t("Computed", "محسوب"), value: <>{t("live from records", "مباشرة من السجلات")} · <span data-no-i18n>{dateTxt(today())}</span></> },
          ],
          actions: <><AppLink to="inbox" className={BAND.primary}>{t("My approvals & tasks", "اعتماداتي ومهامي")}</AppLink><AppLink to="reports" className={BAND.secondary}>{t("Report centre", "مركز التقارير")}</AppLink><AppLink to={charts.to} className={BAND.secondary}>{t("Insights dashboard", "لوحة التحليلات")}</AppLink></> }} />
      <KpiGrid cols={6}>
        <Kpi label={t("Active projects", "المشاريع النشطة")} value={active.length} hint={t(`of ${rows.length} construction projects`, `من ${rows.length} مشاريع مقاولات`)} to="portfolio" />
        <Kpi label={t("Revised contract value", "قيمة العقود المعدلة")} value={compact(sum("revised"), ar)} hint={money(sum("revised"))} to="reports/Client%20Contract%20Position" />
        <Kpi label={t("Certified gross", "إجمالي المعتمد")} value={compact(sum("certified"), ar)} hint={t("confirmed certificates", "شهادات مؤكدة")} to="reports/Claims%20and%20Certificates%20Register" />
        <Kpi label={t("Collected", "المحصّل")} value={compact(sum("collected"), ar)} hint={t("payment entries against invoices", "سندات قبض مقابل الفواتير")} to="finance" tone="good"
          spark={collectedTrend.length > 1 ? { values: collectedTrend, label: t("Collected by month (Insights cash chart)", "المحصل شهرياً (مخطط النقد في التحليلات)") } : undefined} />
        <Kpi label={t("Receivable outstanding", "مستحقات العملاء")} value={compact(sum("outstanding"), ar)} hint={money(sum("outstanding"))} to="reports/Construction%20Receivables%20Aging" tone={sum("outstanding") > 0 ? "warn" : "default"} />
        <Kpi label={t("Forecast margin", "الهامش المتوقع")} value={portfolioMargin === null ? "—" : `${portfolioMargin}%`} hint={t("(revised − EAC) ÷ revised", "(المعدل − التكلفة المتوقعة) ÷ المعدل")} to="reports/Construction%20Portfolio%20Status" tone={portfolioMargin !== null && portfolioMargin < 5 ? "bad" : "default"} />
      </KpiGrid>
      <PolicyGate keys={["P1", "P2", "P3", "P4", "P5", "P6", "P7", "P8", "P9"]} />
      <DxSplit>
        {charts.ids[0] ? <InsightsChartPanel id={charts.ids[0]} scope={{ company: cf.company || undefined }} /> : <div />}
        <DxPanel title={<span>{t("Ranked exceptions", "الاستثناءات مرتبة")} <span className="text-xs font-normal text-muted-foreground" data-no-i18n>({riskCount + blockedCount})</span></span>} subtitle={t("Blocked first, then risks, by number of documents", "الموقوف أولاً ثم المخاطر، حسب عدد المستندات")} actions={<AppLink to="hub" className="font-medium">{t("Management hub", "مركز الإدارة")}</AppLink>} className="h-[calc(100%-1rem)]" attrs={{ "data-home-exceptions": "" }}>
          <ExceptionList items={queueExceptions(qs.filter((q) => q.severity !== "action"), ar, t)} empty={t("No open risks or policy blocks", "لا مخاطر أو قيود سياسات مفتوحة")} severityLabel={severityText(t)} />
        </DxPanel>
      </DxSplit>
      <DxSplit ratio="8:4">
        <DxPanel title={t("Decision worklist", "قائمة القرارات")} flush attrs={{ "data-home-worklist": wl }}
          actions={<AppLink to="projects" className="font-medium">{t("All projects", "كل المشاريع")}</AppLink>}>
          <div className="px-2 pt-1"><TabBar size="sm" ariaLabel={t("Worklist", "قائمة العمل")} value={wl} onChange={setWl} tabs={[
            { key: "health", label: t("Project health", "صحة المشاريع"), count: rows.length },
            { key: "action", label: t("Waiting for action", "بانتظار إجراء"), count: actionCount },
            { key: "blocked", label: t("Blocked by policy", "موقوف بسبب سياسة"), count: blockedCount },
          ]} /></div>
          <div className="p-3">
            {wl === "health" && <DataTable rows={rows} empty={t("No projects", "لا مشاريع")} caption={t("Project health", "صحة المشاريع")} cols={[
              { key: "title", label: t("Project", "المشروع"), render: (r) => <ProjectRef project={r.name} title={String(r.title)} /> },
              { key: "status", label: t("Status", "الحالة"), kind: "state" },
              { key: "progress", label: t("Progress", "الإنجاز"), render: (r) => <Progress value={num(r.progress)} tone={num(r.slip) > 14 ? "bad" : num(r.slip) > 0 ? "warn" : undefined} /> },
              { key: "revised", label: t("Revised contract", "العقد المعدل"), kind: "money" },
              { key: "certified", label: t("Certified", "المعتمد"), kind: "money" },
              { key: "eac", label: t("EAC", "التكلفة المتوقعة"), kind: "money" },
              { key: "margin", label: t("Margin", "الهامش"), kind: "pct" },
              { key: "slip", label: t("Slip (days)", "التأخير (يوم)"), kind: "num" },
            ] as Col<PRow>[]} />}
            {wl === "action" && <QueueList items={of("action")} empty={t("Nothing waiting for action", "لا شيء بانتظار إجراء")} />}
            {wl === "blocked" && <QueueList items={of("blocked")} empty={t("Nothing blocked by a policy decision", "لا شيء موقوف بقرار سياسة")} />}
          </div>
        </DxPanel>
        <div className="min-w-0">
          {charts.ids[1] && <InsightsChartPanel id={charts.ids[1]} scope={{ company: cf.company || undefined }} />}
          <DxPanel title={t("Modules", "الوحدات")} subtitle={t("Open items per department", "العناصر المفتوحة لكل قسم")} flush>
            <ul className="p-1.5" role="list">
              {DEPTS.filter((d) => d.key !== "MGT").map((d) => { const n = qs.filter((q) => q.dept === d.key).reduce((s, q) => s + q.docs.length, 0); return (
                <li key={d.key}><AppLink to={d.path} className="flex items-center justify-between gap-2 rounded-md px-2.5 py-2 text-[13px] hover:bg-muted"><span className="flex min-w-0 items-center gap-2"><NavIcon name={DEPT_ICON[d.key]} className="h-4 w-4 shrink-0 text-muted-foreground" /><span className="truncate">{ar ? d.ar : d.en}</span></span>{n > 0 && <span className="rounded-full bg-muted px-1.5 text-xs tabular-nums" data-no-i18n>{n}</span>}</AppLink></li>
              ); })}
            </ul>
          </DxPanel>
        </div>
      </DxSplit>
      <DxSplit ratio="1:1">
        <DxPanel title={t("Certified gross by project", "إجمالي المعتمد لكل مشروع")} subtitle={t("Confirmed client certificates", "شهادات العملاء المؤكدة")}>
          <Bars data={rows.map((r) => ({ label: String(r.title), value: num(r.certified), to: `project/${encodeURIComponent(r.name)}?tab=commercial` }))} empty={t("No certificates yet", "لا شهادات بعد")} format={(n) => compact(n, ar)} />
        </DxPanel>
        <DxPanel title={t("Receivable outstanding by project", "المستحق على العملاء لكل مشروع")} subtitle={t("Submitted client invoices not yet collected", "فواتير العملاء المرحّلة غير المحصلة")}>
          <Bars data={rows.map((r) => ({ label: String(r.title), value: num(r.outstanding), tone: "warn" as const, to: `project/${encodeURIComponent(r.name)}?tab=finance` }))} empty={t("Nothing outstanding", "لا مستحقات")} format={(n) => compact(n, ar)} />
        </DxPanel>
      </DxSplit>
    </div>
  );
}
/** Rail icon key of each department (same keys as the manifest navigation groups). */
export const DEPT_ICON: Record<string, string> = { MGT: "home", PRJ: "projects", ET: "estimating", CON: "contracts", SUB: "subcontracts", CST: "cost", PROC: "procurement", RSP: "resources", FIN: "finance" };

export function PortfolioPage() {
  const { t, ar } = useCx();
  const cf = useCompany();
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const rows = projectRows(cf.company || undefined, ar).filter((r) => (!status || r.status === status) && (!q || `${r.title} ${r.name} ${r.customer} ${r.city}`.toLowerCase().includes(q.toLowerCase())));
  return (
    <div className="w-full min-w-0" data-page="construction-portfolio">
      <PageHeader title={t("Project portfolio", "محفظة المشاريع")} subtitle={t("Each card reads the project's own contract, cost and schedule records.", "كل بطاقة تقرأ سجلات العقد والتكلفة والجدول الخاصة بالمشروع.")}
        band={{ compact: true, question: t("How is each project tracking on contract, cost and schedule?", "كيف يسير كل مشروع في العقد والتكلفة والجدول؟"),
          controls: <>
            <BandCompany {...cf} />
            <BandField label={t("Status", "الحالة")}><select className={bandInput} value={status} onChange={(e) => setStatus(e.target.value)}><option value="">{t("All", "الكل")}</option>{["Open", "Completed", "Cancelled"].map((s) => <option key={s} value={s}>{s}</option>)}</select></BandField>
            <BandField label={t("Search", "بحث")}><input className={bandInput} value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Project, customer, city", "المشروع، العميل، المدينة")} /></BandField>
          </>,
          meta: [{ label: t("Projects shown", "المشاريع المعروضة"), value: <span data-no-i18n>{rows.length}</span> }] }} />
      {!rows.length ? <Empty>{t("No projects match the filters", "لا مشاريع مطابقة للمرشحات")}</Empty> : (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,19rem),1fr))] gap-4">
          {rows.map((r) => {
            const res = resourcesOf(r.name);
            return (
              <article key={r.name} className="panel p-4" data-project-card={r.name}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0"><h2 className="truncate font-semibold"><ProjectRef project={r.name} title={String(r.title)} /></h2><div className="truncate text-xs text-muted-foreground" data-no-i18n>{r.name} · {String(r.city ?? "")} · {customerName(r.customer, !ar)}</div></div>
                  <StateBadge state={r.status} />
                </div>
                <div className="my-3"><Progress value={num(r.progress)} tone={num(r.slip) > 14 ? "bad" : num(r.slip) > 0 ? "warn" : undefined} /> <span className="ms-2 text-xs text-muted-foreground">{r.slip === null ? t("no schedule", "لا جدول") : num(r.slip) > 0 ? t(`${r.slip} days behind`, `متأخر ${r.slip} يوماً`) : t("on schedule", "حسب الجدول")}</span></div>
                <Measures items={[
                  { label: t("Revised contract", "العقد المعدل"), value: num(r.revised) },
                  { label: t("Certified gross", "المعتمد"), value: num(r.certified) },
                  { label: t("Invoiced (net)", "المفوتر (صافي)"), value: num(r.invoiced) },
                  { label: t("Collected", "المحصّل"), value: num(r.collected), tone: "good" },
                  { label: t("EAC", "التكلفة المتوقعة"), value: r.eac === null ? null : num(r.eac), tone: r.margin !== null && num(r.margin) < 5 ? "bad" : undefined },
                ]} />
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span>{t("Margin", "الهامش")}: <b className="text-foreground" data-no-i18n>{r.margin === null ? "—" : `${r.margin}%`}</b></span>
                  <span>{t("Overdue tasks", "مهام متأخرة")}: <b className="text-foreground" data-no-i18n>{String(r.overdue)}</b></span>
                  <span>{t("Man-days", "أيام العمل")}: <b className="text-foreground" data-no-i18n>{res.manDays}</b></span>
                </div>
                <div className="mt-3 flex gap-3 text-sm"><AppLink to={`project/${encodeURIComponent(r.name)}`}>{t("Project 360", "المشروع 360")}</AppLink><DocRef doctype="Project" name={r.name}>{t("Project form", "نموذج المشروع")}</DocRef></div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function HubPage() {
  const { t, ar } = useCx();
  const [dept, setDept] = useState<string>("");
  const qs = queues().filter((q) => !dept || q.dept === dept);
  const open = qs.filter((q) => q.docs.length);
  return (
    <div className="w-full min-w-0" data-page="construction-hub">
      <PageHeader title={t("Management hub", "مركز الإدارة")} subtitle={t("Approvals, risks and policy blocks across all departments. Counts equal the list each queue opens.", "الاعتمادات والمخاطر وقيود السياسات عبر كل الأقسام. كل عدد يساوي القائمة التي يفتحها.")}
        band={{ compact: true, question: t("What is waiting for a decision, by department?", "ما الذي ينتظر قراراً، حسب القسم؟"),
          controls: <BandField label={t("Department", "القسم")}><select className={bandInput} value={dept} onChange={(e) => setDept(e.target.value)}><option value="">{t("All departments", "كل الأقسام")}</option>{DEPTS.map((d) => <option key={d.key} value={d.key}>{ar ? d.ar : d.en}</option>)}</select></BandField>,
          meta: [{ label: t("Open queues", "القوائم المفتوحة"), value: <span data-no-i18n>{open.length}</span> }] }} />
      <KpiGrid cols={3}>
        <Kpi label={t("Waiting for action", "بانتظار إجراء")} value={open.filter((q) => q.severity === "action").reduce((s, q) => s + q.docs.length, 0)} />
        <Kpi label={t("Open risks", "مخاطر مفتوحة")} value={open.filter((q) => q.severity === "risk").reduce((s, q) => s + q.docs.length, 0)} tone="warn" />
        <Kpi label={t("Blocked by policy", "موقوف بسبب سياسة")} value={open.filter((q) => q.severity === "blocked").reduce((s, q) => s + q.docs.length, 0)} tone="bad" to="settings/policies" />
      </KpiGrid>
      {DEPTS.filter((d) => !dept || d.key === dept).map((d) => {
        const items = qs.filter((q) => q.dept === d.key);
        if (!items.length) return null;
        return (
          <Section key={d.key} title={ar ? d.ar : d.en} actions={d.path ? <AppLink to={d.path}>{t("Department workspace", "مساحة القسم")}</AppLink> : undefined}>
            <DataTable rows={items.map((q) => ({ ...q, name: q.key, count: q.docs.length }) as unknown as Record<string, unknown>)} empty={t("No queues", "لا قوائم")} cols={[
              { key: "label", label: t("Queue", "القائمة"), render: (r) => <span>{ar ? String(r["ar"]) : String(r["en"])}</span> },
              { key: "count", label: t("Open", "مفتوح"), kind: "num" },
              { key: "severity", label: t("Type", "النوع"), render: (r) => <span className={r["severity"] === "blocked" ? "text-destructive" : r["severity"] === "risk" ? "text-warning" : ""}>{r["severity"] === "blocked" ? t("Blocked", "موقوف") : r["severity"] === "risk" ? t("Risk", "خطر") : t("Action", "إجراء")}</span> },
              { key: "role", label: t("Acting role", "الدور المسؤول"), render: (r) => <span data-no-i18n>{String(r["role"])}</span> },
              { key: "open", label: "", render: (r) => { const q = r as unknown as Queue; return q.page !== undefined ? <AppLink to={q.page}>{t("Open", "فتح")}</AppLink> : <ListRef doctype={q.doctype} filters={q.filters}>{t("Open list", "فتح القائمة")}</ListRef>; } },
            ]} />
          </Section>
        );
      })}
    </div>
  );
}

export function ProjectsPage() {
  const { t, ar } = useCx();
  const cf = useCompany();
  const [q, setQ] = useState("");
  const rows = projectRows(cf.company || undefined, ar).filter((r) => !q || `${r.title} ${r.name} ${r.customer}`.toLowerCase().includes(q.toLowerCase()));
  const inReg = new Set(constructionProjects().map((p) => p.name));
  const cos = new Set(cf.company ? [cf.company] : [...cf.companies, String(settings()?.["default_company"] ?? "")].filter(Boolean));
  const others = list("Project", (p) => !inReg.has(p.name) && cos.has(String(p["company"] ?? "")) && p["status"] === "Open" && (!q || `${String(p["project_name"])} ${p.name}`.toLowerCase().includes(q.toLowerCase()))) as Record<string, unknown>[];
  return (
    <div className="w-full min-w-0" data-page="construction-projects">
      <PageHeader title={t("Projects register", "سجل المشاريع")} crumbs={[{ label: t("Projects & execution", "المشاريع والتنفيذ"), to: "dept/prj" }]}
        subtitle={t("Native DIGIT Projects with their construction position. New projects open on the full native Project form; set Construction Contract Type to include a project here.", "مشاريع DIGIT الأصلية مع موقفها الإنشائي. يُفتح المشروع الجديد على نموذج المشروع الأصلي الكامل؛ حدّد نوع عقد المقاولات ليظهر المشروع هنا.")}
        band={{ compact: true, question: t("Which construction projects are registered, and where does each stand?", "ما مشاريع المقاولات المسجلة، وأين يقف كل منها؟"),
          controls: <><BandCompany {...cf} /><BandField label={t("Search", "بحث")}><input className={bandInput} value={q} onChange={(e) => setQ(e.target.value)} /></BandField></>,
          meta: [{ label: t("Projects", "المشاريع"), value: <span data-no-i18n>{rows.length}</span> }, { label: t("Not yet set up", "غير مهيأة بعد"), value: <span data-no-i18n>{others.length}</span> }],
          actions: <><NewDoc doctype="Project" band defaults={{ company: cf.company || settings()?.["default_company"] || cf.companies[0] || "" }} label={t("New project", "مشروع جديد")} /><ListRef doctype="Project" className={BAND.secondary}>{t("Open Project list", "فتح قائمة المشاريع")}</ListRef></> }} />
      <Section title={t("Projects", "المشاريع")}>
        <DataTable rows={rows} empty={t("No construction projects", "لا مشاريع مقاولات")} cols={[
          { key: "name", label: t("Project", "المشروع"), render: (r) => <span className="inline-flex items-center gap-1.5"><ProjectRef project={r.name} title={String(r.title)} /><Open360 doctype="Project" name={r.name} compact /></span> },
          { key: "code", label: t("ID", "الرمز"), render: (r) => <DocRef doctype="Project" name={r.name} /> },
          { key: "customer", label: t("Customer", "العميل"), kind: "doc", doctype: "Customer" },
          { key: "status", label: t("Status", "الحالة"), kind: "state" },
          { key: "start", label: t("Start", "البداية"), kind: "date" },
          { key: "end", label: t("End", "النهاية"), kind: "date" },
          { key: "progress", label: t("Progress", "الإنجاز"), render: (r) => <Progress value={num(r.progress)} /> },
          { key: "revised", label: t("Revised contract", "العقد المعدل"), kind: "money", total: true },
          { key: "budget", label: t("Revised budget", "الموازنة المعدلة"), kind: "money", total: true },
          { key: "actual", label: t("Actual cost", "التكلفة الفعلية"), kind: "money", total: true },
          { key: "overdue", label: t("Overdue tasks", "مهام متأخرة"), kind: "num" },
        ] as Col<PRow>[]} />
      </Section>
      {others.length > 0 && (
        <Section title={<span>{t("Company projects not yet set up for construction", "مشاريع الشركة غير المهيأة للمقاولات")} <span className="text-xs font-normal text-muted-foreground" data-no-i18n>({others.length})</span></span>}>
          <p className="mb-2 text-xs text-muted-foreground">{t("Open projects of the construction companies without a Construction Contract Type or construction records. Set the contract type on the project to add it to the register.", "مشاريع مفتوحة لشركات المقاولات بلا نوع عقد مقاولات أو سجلات إنشائية. حدّد نوع العقد على المشروع لإضافته إلى السجل.")}</p>
          <DataTable rows={others} pageSize={10} empty="" cols={[
            { key: "name", label: t("ID", "الرمز"), kind: "doc", doctype: "Project" },
            { key: "project_name", label: t("Project", "المشروع"), render: (r) => <span data-no-i18n>{String(r["project_name"] ?? "")}</span> },
            { key: "company", label: t("Company", "الشركة"), render: (r) => <span data-no-i18n>{String(r["company"] ?? "")}</span> },
            { key: "status", label: t("Status", "الحالة"), kind: "state" },
          ] as Col<Record<string, unknown>>[]} />
        </Section>
      )}
    </div>
  );
}
