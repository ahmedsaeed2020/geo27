/** Project 360 (PRJ-03): the eight source groups (historical src/entities/project360.tsx tabGroups) over the native Project and every linked construction / native record. */
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { adapter, type Doc } from "@/lib/adapter";
import { uomLabel } from "../i18n";
import { fmtNumber } from "@/lib/format";
import type { PluginPageProps } from "@/plugins/pages";
import { num, r2, sumBy, pct } from "../domain/calc";
import { byProject, certificatesOf, claimStages, closeoutOf, customerName, contractPosition, contractsOf, costPosition, financialPosition, isSubmitted, list, materialBalance, overdueTasks, procurementOf, projectCommercial, projectTitle, resourcesOf, rows, scheduleSlipDays, tasksOf, today as todayIso } from "../domain/data";
import { queues } from "../domain/queues";
import * as S from "../domain/services";
import { teamOf } from "../domain/team";
import { ActionButton, AppLink, BAND, STATE_AR, compact, DataTable, dateTxt, DocRef, Empty, hasRole, Kpi, KpiGrid, ListRef, Measures, money, Note, PageHeader, NewDoc, PolicyGate, Progress, Section, StateBadge, useCx, type Col, BTN } from "./kit";
import { TabBar } from "@/components/digit/Experience";
import { OPTION_AR } from "../schema";
import { ReportsActivity } from "./projectActivity";
import { ProjectSchedule } from "./schedule";
import { QueueList } from "./home";
import { reportLink } from "./reports";
import { WorkspaceAnalytics } from "./analytics";
import { P360_TABS, p360Filters } from "../domain/p360";
import { closeoutRequirements } from "../domain/finance";
import { DistributionBar } from "@/components/enterprise/kit/DistributionBar";
import { RequirementCards } from "@/components/enterprise/kit/RequirementCards";
import { ProjectCostOverview } from "./costScreens";

type R = Record<string, unknown>;
type F = [string, string, unknown];
/** Drill targets behind the Project 360 figures — each opens the same records the read model sums (domain/data.ts). */
function drills(p: Doc, com: ReturnType<typeof projectCommercial>) {
  const rep = (name: string, extra: Record<string, string> = {}) => reportLink(name, { project: p.name, ...extra });
  return {
    ...p360Filters(p.name, com),
    contracts: rep("Client Contract Position"),
    cost: rep("Project Cost Report"),
    commitments: rep("Project Cost Sources", { measure: "Commitment" }),
    actuals: rep("Project Cost Sources", { measure: "Actual" }),
  };
}
const TABS = P360_TABS;
type Tab = (typeof TABS)[number][0];

export function Project360Page({ params }: PluginPageProps) {
  const { t, ar } = useCx();
  const id = params["id"] ?? "";
  const search = useRouterState({ select: (s) => s.location.search as Record<string, unknown> });
  const nav = useNavigate();
  // legacy deep links (?tab=commercial / ?tab=subcontracts) open the Contracts & changes group on the matching child tab
  const raw = String(search["tab"] ?? "");
  const legacy: Record<string, [Tab, string]> = { commercial: ["contracts", "client"], subcontracts: ["contracts", "sub"] };
  const tab = (legacy[raw]?.[0] ?? (TABS.some((x) => x[0] === raw) ? raw : "overview")) as Tab;
  const sub = legacy[raw]?.[1] ?? (search["sub"] === "sub" ? "sub" : "client");
  const p = adapter.get("Project", id);
  const readable = list("Project", (x) => x.name === id)[0];
  if (!p) return <div className="p-6"><PageHeader title={t("Project not found", "المشروع غير موجود")} crumbs={[{ label: t("Projects register", "سجل المشاريع"), to: "projects" }]} /><Empty>{t(`No project named ${id}.`, `لا يوجد مشروع باسم ${id}.`)}</Empty></div>;
  if (!readable) return <div className="p-6"><PageHeader title={t("Not permitted", "غير مسموح")} /><Note tone="bad">{t("Your role cannot read this project. Switch to a user with project access.", "دورك لا يسمح بقراءة هذا المشروع. بدّل إلى مستخدم لديه صلاحية.")}</Note></div>;
  const setTab = (x: Tab, sb?: string) => void nav({ to: "/plugins/$name/$", params: { name: "digit_construction", _splat: `project/${id}` }, search: (sb ? { tab: x, sub: sb } : { tab: x }) as never, replace: true });
  return (
    <div className="w-full min-w-0" data-page="construction-project360" data-project={id}>
      <PageHeader title={projectTitle(p, !ar)} crumbs={[{ label: t("Projects register", "سجل المشاريع"), to: "projects" }]}
        subtitle={<span data-no-i18n>{p.name} · {customerName(p["customer"], !ar)} · {String(p["digit_city"] ?? "")}</span>}
        band={{ question: t("Is this project on time, on budget and being paid for?", "هل يسير هذا المشروع وفق الجدول والموازنة ويُحصَّل مقابله؟"),
          basis: t("One project across its eight source groups: contract, cost, execution, procurement, resources, finance and activity — each figure opens its records.", "مشروع واحد عبر مجموعاته الثماني: العقد والتكلفة والتنفيذ والمشتريات والموارد والمالية والنشاط — كل رقم يفتح سجلاته."),
          meta: [
            { label: t("Status", "الحالة"), value: <span data-no-i18n data-state={String(p["status"] ?? "")}>{ar ? OPTION_AR[String(p["status"])] ?? STATE_AR[String(p["status"])] ?? String(p["status"] ?? "") : String(p["status"] ?? "")}</span> },
            { label: t("Customer", "العميل"), value: <span data-no-i18n>{customerName(p["customer"], !ar)}</span> },
            { label: t("Contract type", "نوع العقد"), value: p["digit_contract_type"] ? <span data-no-i18n>{ar ? OPTION_AR[String(p["digit_contract_type"])] ?? String(p["digit_contract_type"]) : String(p["digit_contract_type"])}</span> : "—" },
            { label: t("Planned finish", "الإنهاء المخطط"), value: <span data-no-i18n>{dateTxt(p["expected_end_date"])}</span> },
            { label: t("Company", "الشركة"), value: <span data-no-i18n>{String(p["company"] ?? "")}</span> },
          ],
          actions: <><AppLink to={`cost/sheet?project=${encodeURIComponent(p.name)}`} className={BAND.primary}>{t("Cost sheet", "ورقة التكلفة")}</AppLink><DocRef doctype="Project" name={p.name} className={BAND.secondary}>{t("Open native Project", "فتح المشروع الأصلي")}</DocRef></> }} />
      <TabBar wrap ariaLabel={t("Project 360 groups", "مجموعات المشروع 360")} value={tab} onChange={(k) => setTab(k as Tab)} tabs={TABS.map(([k, en, a]) => ({ key: k, label: ar ? a : en }))} />
      <div role="tabpanel">
        {tab === "overview" && <Overview p={p} />}
        {tab === "execution" && <Execution p={p} />}
        {tab === "contracts" && (
          <>
            <div role="tablist" aria-label={t("Contracts & changes", "العقود والتغييرات")} className="mb-3 flex gap-1">
              {([["client", t("Client contract, variations & claims", "عقد العميل والتغييرات والمطالبات")], ["sub", t("Subcontracts", "مقاولو الباطن")]] as const).map(([k, l]) => (
                <button key={k} role="tab" type="button" aria-selected={sub === k} data-subtab={k} onClick={() => setTab("contracts", k)} className={`min-h-8 rounded-full border px-3 py-1 text-xs font-medium transition-colors max-md:min-h-11 ${sub === k ? "border-primary bg-accent text-accent-foreground" : "border-border bg-card text-muted-foreground hover:text-foreground"} focus-visible:outline-2 focus-visible:outline-ring`}>{l}</button>
              ))}
            </div>
            {sub === "client" ? <Commercial p={p} /> : <Subcontracts p={p} />}
          </>
        )}
        {tab === "cost" && <Cost p={p} />}
        {tab === "procurement" && <Procurement p={p} />}
        {tab === "resources" && <Resources p={p} />}
        {tab === "finance" && <Finance p={p} />}
        {tab === "reports" && <ReportsActivity p={p} />}
      </div>
    </div>
  );
}

function Overview({ p }: { p: Doc }) {
  const { t, ar } = useCx();
  const com = projectCommercial(p.name), cost = costPosition(p.name);
  const ts = tasksOf(p.name); const progress = ts.length ? r2(sumBy(ts, (x) => num(x["progress"])) / ts.length) : num(p["percent_complete"]);
  const slip = scheduleSlipDays(p.name);
  const qs = queues({ project: p.name });
  const team = teamOf(p).filter((m) => m.status === "Active");
  const d = drills(p, com);
  return (
    <>
      <KpiGrid cols={6}>
        <Kpi label={t("Progress (task average)", "الإنجاز (متوسط المهام)")} value={`${progress}%`} hint={t(`${ts.length} tasks`, `${ts.length} مهمة`)} list={d.tasks} />
        <Kpi label={t("Schedule slip", "تأخير الجدول")} value={slip === null ? "—" : t(`${slip} days`, `${slip} يوم`)} tone={slip && slip > 14 ? "bad" : slip ? "warn" : "good"} hint={t(`${overdueTasks(p.name).length} overdue tasks`, `${overdueTasks(p.name).length} مهام متأخرة`)} list={d.lateTasks} />
        <Kpi label={t("Revised contract", "العقد المعدل")} value={compact(com.revised, ar)} hint={money(com.revised)} to={d.contracts} />
        <Kpi label={t("Certified gross", "المعتمد")} value={compact(com.certifiedGross, ar)} hint={t(`${pct(com.certifiedGross, com.revised) ?? 0}% of contract`, `${pct(com.certifiedGross, com.revised) ?? 0}% من العقد`)} list={d.certificates} />
        <Kpi label={t("EAC", "التكلفة المتوقعة عند الإنجاز")} value={cost.eac === null ? "—" : compact(cost.eac, ar)} hint={cost.budget ? t(`budget ${compact(cost.revised, ar)}`, `الموازنة ${compact(cost.revised, ar)}`) : t("no approved budget", "لا موازنة معتمدة")} tone={cost.variance !== null && cost.variance < 0 ? "bad" : "default"} to={d.cost} />
        <Kpi label={t("Forecast margin", "الهامش المتوقع")} value={cost.marginPct === null || cost.marginPct === undefined ? "—" : `${cost.marginPct}%`} tone={cost.marginPct !== null && cost.marginPct !== undefined && cost.marginPct < 5 ? "bad" : "default"} to={d.cost} />
      </KpiGrid>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-3">
        <div className="min-w-0 lg:col-span-2">
          <Section title={t("Contract → cash", "من العقد إلى النقد")}>
            <Measures items={[
              { label: t("Revised contract", "العقد المعدل"), value: com.revised, to: d.contracts },
              { label: t("Certified gross", "المعتمد"), value: com.certifiedGross, list: d.certificates },
              { label: t("Net certified", "صافي المعتمد"), value: com.netCertified, list: d.certificates },
              { label: t("Invoiced (net)", "المفوتر (صافي)"), value: com.invoicedNet, list: d.invoices },
              { label: t("Collected", "المحصّل"), value: com.collected, tone: "good", list: d.invoices },
              { label: t("Retention held", "المحتجزات"), value: com.retentionHeld, tone: "warn", list: d.certificates },
            ]} />
            <p className="mt-2 text-xs text-muted-foreground">{t("Measures are separate: contract ≠ certified ≠ invoiced ≠ collected.", "المقاييس منفصلة: العقد ≠ المعتمد ≠ المفوتر ≠ المحصّل.")}</p>
          </Section>
          <Section title={t("Budget → cost", "من الموازنة إلى التكلفة")}>
            <Measures items={[
              { label: t("Revised budget", "الموازنة المعدلة"), value: cost.budget ? cost.revised : null, to: d.cost },
              { label: t("Open commitments", "الالتزامات المفتوحة"), value: cost.committed, to: d.commitments },
              { label: t("Actual cost", "التكلفة الفعلية"), value: cost.actual, to: d.actuals },
              { label: t("EAC", "التكلفة المتوقعة"), value: cost.eac, tone: cost.variance !== null && cost.variance < 0 ? "bad" : undefined, to: d.cost },
            ]} />
          </Section>
        </div>
        <div>
          <Section title={t("Project facts", "بيانات المشروع")}>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm">
              <dt className="text-muted-foreground">{t("Customer", "العميل")}</dt><dd><DocRef doctype="Customer" name={p["customer"]} /></dd>
              <dt className="text-muted-foreground">{t("Company", "الشركة")}</dt><dd data-no-i18n>{String(p["company"] ?? "")}</dd>
              <dt className="text-muted-foreground">{t("Contract type", "نوع العقد")}</dt><dd>{String(p["digit_contract_type"] || "—")}</dd>
              <dt className="text-muted-foreground">{t("Project manager", "مدير المشروع")}</dt><dd><DocRef doctype="Employee" name={p["digit_project_manager"]}>{String(adapter.get("Employee", String(p["digit_project_manager"] ?? ""))?.["employee_name"] ?? p["digit_project_manager"] ?? "")}</DocRef></dd>
              <dt className="text-muted-foreground">{t("Start", "البداية")}</dt><dd data-no-i18n>{String(p["expected_start_date"] ?? "—")}</dd>
              <dt className="text-muted-foreground">{t("End", "النهاية")}</dt><dd data-no-i18n>{String(p["expected_end_date"] ?? "—")}</dd>
            </dl>
          </Section>
          <Section title={t("Project team", "فريق المشروع")} actions={<AppLink to={`team?project=${encodeURIComponent(p.name)}`} className={BTN.compact}>{t("Team & responsibilities", "الفريق والمسؤوليات")}</AppLink>}>
            {team.length ? <ul className="space-y-1 text-sm" data-p360-team>{team.map((m) => <li key={m.idx} className="flex justify-between gap-2"><DocRef doctype="Employee" name={m.employee}><span data-no-i18n>{m.employee_name}</span></DocRef><span className="text-xs text-muted-foreground">{m.role}</span></li>)}</ul> : <Empty>{t("No team recorded on the project", "لا فريق مسجل على المشروع")}</Empty>}
          </Section>
          <Section title={t("Open items", "بنود مفتوحة")}><QueueList items={qs} empty={t("Nothing open for this project", "لا بنود مفتوحة لهذا المشروع")} /></Section>
        </div>
      </div>
      <WorkspaceAnalytics dashKey="project-360" scope={{ project: p.name }} max={4} />
    </>
  );
}

function Execution({ p }: { p: Doc }) {
  const { t } = useCx();
  const ts = tasksOf(p.name);
  const today = new Date().toISOString().slice(0, 10);
  return (
    <>
      <ProjectSchedule p={p} />
      <Section title={t("Tasks", "المهام")} actions={<><NewDoc doctype="Task" defaults={{ project: p.name, company: p["company"] }} label={t("Task", "مهمة")} /><ListRef doctype="Task" filters={[["project", "=", p.name]]}>{t("All tasks", "كل المهام")}</ListRef><AppLink to={`wbs?project=${encodeURIComponent(p.name)}`}>{t("WBS explorer", "مستكشف هيكل العمل")}</AppLink></>}>
        <DataTable rows={ts as R[]} empty={t("No tasks", "لا مهام")} cols={[
          { key: "name", label: t("Task", "المهمة"), kind: "doc", doctype: "Task" },
          { key: "subject", label: t("Subject", "الموضوع") },
          { key: "digit_work_package", label: t("Work package", "حزمة العمل"), kind: "doc", doctype: "Digit Work Package" },
          { key: "status", label: t("Status", "الحالة"), kind: "state" },
          { key: "exp_start_date", label: t("Planned start", "البداية المخططة"), kind: "date" },
          { key: "exp_end_date", label: t("Planned end", "النهاية المخططة"), kind: "date", render: (r) => <span className={String(r["exp_end_date"] ?? "") < today && num(r["progress"]) < 100 ? "font-medium text-destructive" : ""} data-no-i18n>{String(r["exp_end_date"] ?? "—")}</span> },
          { key: "progress", label: t("Progress", "الإنجاز"), render: (r) => <Progress value={num(r["progress"])} /> },
        ] as Col<R>[]} />
      </Section>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-2">
        <Linked title={t("Work packages", "حزم العمل")} doctype="Digit Work Package" project={p} cols={[["work_package_name", t("Name", "الاسم")], ["status", t("Status", "الحالة"), "state"], ["progress", t("Progress %", "الإنجاز %"), "pct"], ["end_date", t("End", "النهاية"), "date"]]} />
        <Linked title={t("Stage plans", "خطط المراحل")} doctype="Digit Stage Planning" project={p} cols={[["stage_name", t("Stage", "المرحلة")], ["workflow_state", t("Status", "الحالة"), "state"], ["planned_end", t("Planned end", "النهاية المخططة"), "date"]]} />
        <Linked title={t("Progress updates", "تحديثات الإنجاز")} doctype="Digit Progress Update" project={p} cols={[["update_date", t("Date", "التاريخ"), "date"], ["task", t("Task", "المهمة")], ["workflow_state", t("Status", "الحالة"), "state"], ["progress_pct", t("Progress %", "الإنجاز %"), "pct"]]} />
        <Linked title={t("Daily site activity", "النشاط اليومي للموقع")} doctype="Digit Site Activity Report" project={p} cols={[["report_date", t("Date", "التاريخ"), "date"], ["weather", t("Weather", "الطقس")], ["manpower_count", t("Manpower", "العمالة"), "num"], ["safety_incidents", t("Safety incidents", "حوادث السلامة"), "num"]]} />
        <Linked title={t("WBS versions", "إصدارات WBS")} doctype="Digit WBS Version" project={p} cols={[["version", t("Version", "الإصدار"), "num"], ["workflow_state", t("Status", "الحالة"), "state"]]} />
        <Linked title={t("Task dependencies", "اعتماديات المهام")} doctype="Digit Task Dependency" project={p} cols={[["task", t("Task", "المهمة")], ["predecessor", t("Predecessor", "المهمة السابقة")], ["dependency_type", t("Type", "النوع")], ["lag_days", t("Lag (days)", "الفاصل (أيام)"), "num"]]} />
      </div>
    </>
  );
}

/** Generic related-record panel for app DocTypes linked by `project`. */
function Linked({ title, doctype, project, cols, field = "project", noNew }: { title: string; doctype: string; project: Doc; cols: [string, string, Col<R>["kind"]?][]; field?: string; noNew?: boolean }) {
  const { t } = useCx();
  const docs = byProject(doctype, project.name, field) as R[];
  return (
    <Section title={<span>{title} <span className="text-xs font-normal text-muted-foreground" data-no-i18n>({docs.length})</span></span>}
      actions={<>{!noNew && <NewDoc doctype={doctype} defaults={{ [field]: project.name, company: project["company"] }} label={t("New", "جديد")} />}<ListRef doctype={doctype} filters={[[field, "=", project.name]]}>{t("List", "القائمة")}</ListRef></>}>
      <DataTable rows={docs} pageSize={8} empty={t("No records yet", "لا سجلات بعد")} cols={[{ key: "name", label: t("ID", "الرقم"), kind: "doc", doctype }, ...cols.map(([key, label, kind]) => ({ key, label, kind }))] as Col<R>[]} />
    </Section>
  );
}

function Commercial({ p }: { p: Doc }) {
  const { t } = useCx();
  const tenders = byProject("Digit Tender", p.name);
  const contracts = contractsOf(p.name);
  const claims = byProject("Digit Client Claim", p.name).sort((a, b) => String(a["contract"]).localeCompare(String(b["contract"])) || num(a["claim_no"]) - num(b["claim_no"]));
  const certs = byProject("Digit Client Certificate", p.name);
  const canQS = hasRole("Digit QS", "Digit Director"), canAcc = hasRole("Digit Accountant", "Digit Director");
  return (
    <>
      <PolicyGate keys={["P9"]} />
      <ClaimStageBar project={p.name} />
      {tenders.length > 0 && (
        <Section title={t("Tender, estimate and BOQ", "المنافسة والتقدير وجدول الكميات")} actions={<AppLink to={`estimating/boq-compare?project=${encodeURIComponent(p.name)}`}>{t("Compare BOQ revisions", "مقارنة مراجعات جدول الكميات")}</AppLink>}>
          <DataTable rows={tenders.map((x) => ({ ...x, boqs: list("Digit BOQ", (b) => b["tender"] === x.name).map((b) => b.name).join(", ") })) as R[]} empty="" cols={[
            { key: "name", label: t("Tender", "المنافسة"), kind: "doc", doctype: "Digit Tender" }, { key: "status", label: t("Status", "الحالة"), kind: "state" },
            { key: "approved_estimate", label: t("Approved estimate", "التقدير المعتمد"), render: (r) => r["approved_estimate"] ? <AppLink to={`estimating/version/${encodeURIComponent(String(r["approved_estimate"]))}`}><span data-no-i18n>{String(r["approved_estimate"])}</span></AppLink> : "—" },
            { key: "est_selling", label: t("Bid value", "قيمة العطاء"), kind: "money" }, { key: "boqs", label: t("BOQ", "جدول الكميات"), render: (r) => r["boqs"] ? <DocRef doctype="Digit BOQ" name={String(r["boqs"]).split(", ")[0]} /> : <AppLink to={`estimating/tender/${encodeURIComponent(String(r["name"]))}/boq`}>{t("Create BOQ", "إنشاء جدول الكميات")}</AppLink> },
          ] as Col<R>[]} />
        </Section>
      )}
      <Section title={t("Client contracts", "عقود العملاء")} actions={<NewDoc doctype="Digit Client Contract" defaults={{ project: p.name, customer: p["customer"], company: p["company"], workflow_state: "Draft" }} label={t("Contract", "عقد")} />}>
        <DataTable rows={contracts.map((c) => ({ ...c, ...contractPosition(c) })) as R[]} empty={t("No client contract", "لا يوجد عقد عميل")} cols={[
          { key: "name", label: t("Contract", "العقد"), kind: "doc", doctype: "Digit Client Contract" }, { key: "workflow_state", label: t("Status", "الحالة"), kind: "state" },
          { key: "original", label: t("Original", "الأصلي"), kind: "money" }, { key: "variations", label: t("Variations", "التغييرات"), kind: "money" }, { key: "revised", label: t("Revised", "المعدل"), kind: "money" },
          { key: "certifiedGross", label: t("Certified", "المعتمد"), kind: "money" }, { key: "retentionHeld", label: t("Retention", "المحتجزات"), kind: "money" }, { key: "advanceOutstanding", label: t("Advance outstanding", "رصيد الدفعة المقدمة"), kind: "money" },
          { key: "act", label: "", render: (r) => r["workflow_state"] === "Active" && canQS ? <ActionButton label={t("New claim", "مطالبة جديدة")} run={() => S.createClaim(String(r["name"]))} /> : null },
        ] as Col<R>[]} />
      </Section>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 xl:grid-cols-2">
        <Linked title={t("Variations", "الأوامر التغييرية")} doctype="Digit Client Variation" project={p} cols={[["title", t("Title", "العنوان")], ["workflow_state", t("Status", "الحالة"), "state"], ["amount", t("Amount", "المبلغ"), "money"]]} />
        <Section title={t("Claims", "المطالبات")}>
          <DataTable rows={claims as R[]} pageSize={8} empty={t("No claims", "لا مطالبات")} cols={[
            { key: "name", label: t("Claim", "المطالبة"), kind: "doc", doctype: "Digit Client Claim" }, { key: "claim_no", label: t("No.", "رقم"), kind: "num" }, { key: "workflow_state", label: t("Status", "الحالة"), kind: "state" },
            { key: "this_claim", label: t("This claim", "هذه المطالبة"), kind: "money" },
            { key: "act", label: "", render: (r) => r["workflow_state"] === "Submitted" && canQS ? <ActionButton label={t("Certify", "إعداد الشهادة")} run={() => S.createCertificate(String(r["name"]))} /> : null },
          ] as Col<R>[]} />
        </Section>
      </div>
      <Section title={t("Payment certificates → invoices", "شهادات الدفع ← الفواتير")}>
        <DataTable rows={certs as R[]} empty={t("No certificates", "لا شهادات")} cols={[
          { key: "name", label: t("Certificate", "الشهادة"), kind: "doc", doctype: "Digit Client Certificate" }, { key: "claim", label: t("Claim", "المطالبة"), kind: "doc", doctype: "Digit Client Claim" }, { key: "cert_date", label: t("Date", "التاريخ"), kind: "date" },
          { key: "workflow_state", label: t("Status", "الحالة"), kind: "state" }, { key: "gross_this", label: t("Gross", "الإجمالي"), kind: "money", total: true }, { key: "advance_recovery", label: t("Advance recovery", "استرداد المقدم"), kind: "money", total: true },
          { key: "retention", label: t("Retention", "المحتجزات"), kind: "money", total: true }, { key: "net_certified", label: t("Net", "الصافي"), kind: "money", total: true },
          { key: "sales_invoice", label: t("Sales invoice", "فاتورة المبيعات"), render: (r) => r["sales_invoice"] ? <DocRef doctype="Sales Invoice" name={r["sales_invoice"]} /> : r["workflow_state"] === "Confirmed" && canAcc ? <ActionButton label={t("Create invoice", "إنشاء فاتورة")} run={() => S.createSalesInvoice(String(r["name"]))} /> : "—" },
        ] as Col<R>[]} />
      </Section>
    </>
  );
}

function Subcontracts({ p }: { p: Doc }) {
  const { t } = useCx();
  const wos = byProject("Digit Subcontract Work Order", p.name);
  const books = byProject("Digit Measurement Book", p.name);
  const bills = byProject("Digit Subcontractor Bill", p.name);
  const canSE = hasRole("Digit Site Engineer", "Digit QS"), canQS = hasRole("Digit QS", "Digit Project Manager"), canAcc = hasRole("Digit Accountant");
  return (
    <>
      <PolicyGate keys={["P3", "P5", "P8"]} />
      <Section title={t("Subcontract work orders", "أوامر عمل مقاولي الباطن")} actions={<NewDoc doctype="Digit Subcontract Work Order" defaults={{ project: p.name, company: p["company"], workflow_state: "Draft" }} label={t("Work order", "أمر عمل")} />}>
        <DataTable rows={wos as R[]} empty={t("No work orders", "لا أوامر عمل")} cols={[
          { key: "name", label: t("Work order", "أمر العمل"), kind: "doc", doctype: "Digit Subcontract Work Order" }, { key: "subcontractor", label: t("Subcontractor", "المقاول"), kind: "doc", doctype: "Supplier" },
          { key: "workflow_state", label: t("Status", "الحالة"), kind: "state" }, { key: "total_value", label: t("Value", "القيمة"), kind: "money", total: true }, { key: "retention_percent", label: t("Retention %", "المحتجزات %"), kind: "pct" },
          { key: "act", label: "", render: (r) => r["workflow_state"] === "Active" ? <span className="flex gap-1">{canSE && <ActionButton label={t("Measure", "قياس")} run={() => S.createMeasurementBook(String(r["name"]))} />}{canQS && <ActionButton label={t("Bill", "مستخلص")} run={() => S.createBill(String(r["name"]))} />}</span> : null },
        ] as Col<R>[]} />
      </Section>
      <Section title={t("Measurement books", "دفاتر القياس")} actions={<AppLink to="sub/review">{t("QS review", "مراجعة الكميات")}</AppLink>}>
        <DataTable rows={books as R[]} pageSize={10} empty={t("No measurement books", "لا دفاتر قياس")} cols={[
          { key: "name", label: t("Book", "الدفتر"), kind: "doc", doctype: "Digit Measurement Book" }, { key: "work_order", label: t("Work order", "أمر العمل"), kind: "doc", doctype: "Digit Subcontract Work Order" },
          { key: "mb_date", label: t("Date", "التاريخ"), kind: "date" }, { key: "workflow_state", label: t("Status", "الحالة"), kind: "state" }, { key: "measured_total", label: t("Measured", "المقاس"), kind: "num" }, { key: "accepted_value", label: t("Accepted value", "القيمة المقبولة"), kind: "money", total: true },
        ] as Col<R>[]} />
      </Section>
      <Section title={t("Subcontractor bills → purchase invoices", "مستخلصات المقاولين ← فواتير الشراء")}>
        <DataTable rows={bills as R[]} empty={t("No bills", "لا مستخلصات")} cols={[
          { key: "name", label: t("Bill", "المستخلص"), kind: "doc", doctype: "Digit Subcontractor Bill" }, { key: "ra_no", label: t("RA No.", "رقم الجاري"), kind: "num" }, { key: "workflow_state", label: t("Status", "الحالة"), kind: "state" },
          { key: "gross_amount", label: t("Gross", "الإجمالي"), kind: "money", total: true }, { key: "retention_amount", label: t("Retention", "المحتجزات"), kind: "money", total: true }, { key: "net_amount", label: t("Net", "الصافي"), kind: "money", total: true },
          { key: "purchase_invoice", label: t("Purchase invoice", "فاتورة الشراء"), render: (r) => r["purchase_invoice"] ? <DocRef doctype="Purchase Invoice" name={r["purchase_invoice"]} /> : r["workflow_state"] === "Approved" && canAcc ? <ActionButton label={t("Create invoice", "إنشاء فاتورة")} run={() => S.createPurchaseInvoice(String(r["name"]))} /> : "—" },
        ] as Col<R>[]} />
      </Section>
    </>
  );
}

const fmt2 = (x: number) => x.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
function Cost({ p }: { p: Doc }) {
  const { t, ar } = useCx();
  const c = costPosition(p.name);
  const revs = byProject("Digit Budget Revision", p.name), trs = list("Digit Budget Transfer", (x) => list("Digit Project Cost Budget", (b) => b["project"] === p.name).some((b) => b.name === x["budget"]));
  const canQS = hasRole("Digit QS");
  const rep = (name: string, extra: Record<string, string> = {}) => reportLink(name, { project: p.name, ...extra });
  const src = (measure: "Commitment" | "Actual", key: "committed" | "actual") => (r: R) => num(r[key])
    ? <AppLink to={rep("Project Cost Sources", { measure, cost_code: String(r["cost_code"] ?? "") })} className="text-primary tabular-nums underline-offset-2 hover:underline"><span data-no-i18n data-drill={key}>{fmt2(num(r[key]))}</span></AppLink>
    : <span className="tabular-nums" data-no-i18n>{fmt2(0)}</span>;
  return (
    <>
      <KpiGrid>
        <Kpi label={t("Original budget", "الموازنة الأصلية")} value={compact(c.original, ar)} to={rep("Project Cost Report")} />
        <Kpi label={t("Revised budget", "الموازنة المعدلة")} value={compact(c.revised, ar)} to={rep("Project Cost Report")} />
        <Kpi label={t("Open commitments", "الالتزامات المفتوحة")} value={compact(c.committed, ar)} to={rep("Project Cost Sources", { measure: "Commitment" })} />
        <Kpi label={t("Actual cost", "التكلفة الفعلية")} value={compact(c.actual, ar)} to={rep("Project Cost Sources", { measure: "Actual" })} />
        <Kpi label={t("EAC", "التكلفة المتوقعة")} value={c.eac === null ? "—" : compact(c.eac, ar)} to={rep("Project Cost Report")} />
        <Kpi label={t("Variance at completion", "الفرق عند الإنجاز")} value={c.variance === null ? "—" : compact(c.variance, ar)} tone={c.variance !== null && c.variance < 0 ? "bad" : "good"} to={rep("Project Cost Report")} />
      </KpiGrid>
      {!c.budget && <Note tone="warn">{t("No approved budget — commitments and actuals are shown as unallocated until a budget is approved.", "لا توجد موازنة معتمدة — تظهر الالتزامات والتكاليف كغير موزعة حتى اعتماد موازنة.")} {canQS && <ActionButton label={t("Create budget from BOQ", "إنشاء موازنة من جدول الكميات")} run={() => S.createBudget(p.name)} />}</Note>}
      <ProjectCostOverview project={p.name} />
      <Section title={t("Cost position by cost code", "موقف التكلفة حسب رمز التكلفة")} actions={<><AppLink to={`cost/sheet?project=${encodeURIComponent(p.name)}`}>{t("Cost sheet", "ورقة التكلفة")}</AppLink>{canQS && <ActionButton label={t("New forecast", "توقع جديد")} run={() => S.createForecast(p.name)} />}</>}>
        <DataTable rows={[...c.lines.map((l) => ({ ...l, name: l.line_key })), ...c.unallocated.map((u) => ({ name: `U-${u.code}`, cost_code: u.code, description: t("Not mapped to an approved budget line", "غير مرتبط ببند موازنة معتمد"), revised: 0, committed: u.committed, actual: u.actual, etc: u.committed, eac: r2(u.actual + u.committed), variance: r2(-(u.actual + u.committed)) }))] as R[]}
          empty={t("No cost lines", "لا بنود تكلفة")} cols={[
            { key: "cost_code", label: t("Cost code", "رمز التكلفة") }, { key: "description", label: t("Description", "الوصف") }, { key: "revised", label: t("Revised budget", "الموازنة المعدلة"), kind: "money", total: true },
            { key: "committed", label: t("Committed", "ملتزم"), kind: "money", total: true, render: src("Commitment", "committed") }, { key: "actual", label: t("Actual", "فعلي"), kind: "money", total: true, render: src("Actual", "actual") }, { key: "etc", label: t("ETC", "المتبقي المتوقع"), kind: "money", total: true },
            { key: "eac", label: t("EAC", "المتوقع عند الإنجاز"), kind: "money", total: true }, { key: "variance", label: t("Variance", "الفرق"), kind: "money", total: true, render: (r) => <span className={num(r["variance"]) < 0 ? "text-destructive" : ""} data-no-i18n>{r["variance"] === null ? "—" : fmt2(num(r["variance"]))}</span> },
          ] as Col<R>[]} />
      </Section>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-2">
        <Linked title={t("Budgets", "الموازنات")} doctype="Digit Project Cost Budget" project={p} noNew cols={[["version", t("Version", "الإصدار"), "num"], ["workflow_state", t("Status", "الحالة"), "state"], ["total_original", t("Total", "الإجمالي"), "money"]]} />
        <Section title={t("Revisions and transfers", "التعديلات والمناقلات")}>
          <DataTable rows={[...revs.map((r) => ({ ...r, kind: t("Revision", "تعديل"), amount: r["net_change"] })), ...trs.map((x) => ({ ...x, kind: t("Transfer", "مناقلة") }))] as R[]} pageSize={8} empty={t("No revisions or transfers", "لا تعديلات أو مناقلات")} cols={[
            { key: "name", label: t("Document", "المستند"), render: (r) => <DocRef doctype={String(r["doctype"])} name={r["name"]} /> }, { key: "kind", label: t("Type", "النوع") }, { key: "workflow_state", label: t("Status", "الحالة"), kind: "state" }, { key: "amount", label: t("Amount", "المبلغ"), kind: "money" },
          ] as Col<R>[]} />
        </Section>
        <Linked title={t("Forecast snapshots", "لقطات التوقع")} doctype="Digit Cost Forecast Snapshot" project={p} noNew cols={[["cutoff_date", t("Cut-off", "تاريخ القطع"), "date"], ["workflow_state", t("Status", "الحالة"), "state"], ["total_eac", t("EAC", "التكلفة المتوقعة"), "money"], ["forecast_margin", t("Margin", "الهامش"), "pct"]]} />
      </div>
    </>
  );
}

function Procurement({ p }: { p: Doc }) {
  const { t } = useCx();
  const x = procurementOf(p.name);
  const tbl = (title: string, doctype: string, docs: Doc[], cols: [string, string, Col<R>["kind"]?][], filters: [string, string, unknown][]) => (
    <Section title={<span>{title} <span className="text-xs font-normal text-muted-foreground" data-no-i18n>({docs.length})</span></span>} actions={<ListRef doctype={doctype} filters={filters}>{t("List", "القائمة")}</ListRef>}>
      <DataTable rows={docs as R[]} pageSize={8} empty={t("None", "لا يوجد")} cols={[{ key: "name", label: t("ID", "الرقم"), kind: "doc", doctype }, ...cols.map(([key, label, kind]) => ({ key, label, kind }))] as Col<R>[]} />
    </Section>
  );
  return (
    <>
      <KpiGrid>
        <Kpi label={t("Open material requests", "طلبات مواد مفتوحة")} value={x.openMr.length} tone={x.overdueMr.length ? "warn" : "default"} hint={t(`${x.overdueMr.length} overdue`, `${x.overdueMr.length} متأخرة`)} />
        <Kpi label={t("Open purchase orders", "أوامر شراء مفتوحة")} value={x.openPo.length} tone={x.latePo.length ? "warn" : "default"} hint={t(`${x.latePo.length} late`, `${x.latePo.length} متأخرة`)} />
        <Kpi label={t("RFQs without quotes", "طلبات عروض بلا عروض")} value={x.openRfq.length} to="proc/comparison" />
        <Kpi label={t("Uninvoiced PO value", "قيمة أوامر غير مفوترة")} value={money(x.committedPo)} />
      </KpiGrid>
      <div className="mb-4 flex flex-wrap gap-2"><NewDoc doctype="Material Request" defaults={{ company: p["company"], material_request_type: "Purchase" }} label={t("Material request", "طلب مواد")} /><AppLink to="proc/comparison">{t("Quotation comparison", "مقارنة العروض")}</AppLink><AppLink to="proc/matching">{t("Invoice matching", "مطابقة الفواتير")}</AppLink></div>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-2">
        {tbl(t("Material requests", "طلبات المواد"), "Material Request", x.mrs, [["schedule_date", t("Required by", "مطلوب بتاريخ"), "date"], ["status", t("Status", "الحالة"), "state"], ["per_ordered", t("Ordered %", "نسبة الطلب"), "pct"]], [])}
        {tbl(t("Requests for quotation", "طلبات عروض الأسعار"), "Request for Quotation", x.rfqs, [["transaction_date", t("Date", "التاريخ"), "date"], ["status", t("Status", "الحالة"), "state"]], [])}
        {tbl(t("Supplier quotations", "عروض الموردين"), "Supplier Quotation", x.sqs, [["supplier", t("Supplier", "المورّد")], ["grand_total", t("Total", "الإجمالي"), "money"], ["status", t("Status", "الحالة"), "state"]], [])}
        {tbl(t("Purchase orders", "أوامر الشراء"), "Purchase Order", x.pos, [["supplier", t("Supplier", "المورّد")], ["grand_total", t("Total", "الإجمالي"), "money"], ["per_received", t("Received %", "نسبة الاستلام"), "pct"], ["status", t("Status", "الحالة"), "state"]], [])}
        {tbl(t("Purchase receipts", "إيصالات الاستلام"), "Purchase Receipt", x.prs, [["posting_date", t("Date", "التاريخ"), "date"], ["supplier", t("Supplier", "المورّد")], ["status", t("Status", "الحالة"), "state"]], [])}
        {tbl(t("Material issues to site", "صرف المواد للموقع"), "Stock Entry", x.ses, [["posting_date", t("Date", "التاريخ"), "date"], ["stock_entry_type", t("Type", "النوع")], ["docstatus", t("Submitted", "مرسل"), "check"]], [["project", "=", p.name]])}
        <div className="lg:col-span-2"><MaterialsPanel p={p} /></div>
        {tbl(t("Purchase invoices", "فواتير الشراء"), "Purchase Invoice", x.pis, [["supplier", t("Supplier", "المورّد")], ["grand_total", t("Total", "الإجمالي"), "money"], ["outstanding_amount", t("Outstanding", "المتبقي"), "money"], ["status", t("Status", "الحالة"), "state"]], [["project", "=", p.name]])}
      </div>
    </>
  );
}

/** Project materials from the stock ledger (domain/data.ts materialBalance): delivered, returned, issued to work and still at site, per item — each figure opens the movements report for that item. */
function MaterialsPanel({ p }: { p: Doc }) {
  const { t, ar } = useCx();
  const bal = materialBalance(p.name);
  const mv = (item?: string, move?: string) => reportLink("Project Material Movements", { project: p.name, item_code: item, move });
  const q = (v: number, item: string, move?: string) => <AppLink to={mv(item, move)} className="tabular-nums"><span data-no-i18n>{fmtQty(v)}</span></AppLink>;
  return (
    <Section title={t("Project materials", "مواد المشروع")} actions={<><AppLink to={`proc/plan?project=${encodeURIComponent(p.name)}`}>{t("Procurement plan", "خطة المشتريات")}</AppLink> <AppLink to={`proc/materials?project=${encodeURIComponent(p.name)}`}>{t("Material position", "موقف المواد")}</AppLink> <AppLink to={reportLink("Project Material Balance", { project: p.name })}>{t("Balance report", "تقرير الرصيد")}</AppLink> <AppLink to={mv()}>{t("Movements", "الحركات")}</AppLink></>}>
      <p className="mb-2 text-xs text-muted-foreground">{t("From the stock ledger of this project's receipts, returns and material issues. A receipt is delivery to site, not consumption; only material issued to work is consumed.", "من دفتر المخزون لاستلامات المشروع ومرتجعاته وصرف المواد. الاستلام توريد للموقع وليس استهلاكاً؛ المصروف للأعمال فقط هو المستهلك.")}</p>
      {bal.length ? <div className="overflow-x-auto"><table className="w-full min-w-[40rem] text-xs" data-materials-panel>
        <thead><tr className="border-b border-border text-muted-foreground">{[t("Item", "الصنف"), t("Ordered", "بأوامر شراء"), t("Pending receipt", "بانتظار الاستلام"), t("Received", "المستلم"), t("Returned", "المرتجع"), t("Issued to work", "المصروف للأعمال"), t("At site", "رصيد الموقع")].map((h, i) => <th key={h} scope="col" className={`px-1.5 py-1.5 font-medium ${i ? "text-end" : "text-start"}`}>{h}</th>)}</tr></thead>
        <tbody>{bal.map((b) => <tr key={b.item_code} className="border-b border-border/60">
          <td className="px-1.5 py-1.5"><DocRef doctype="Item" name={b.item_code}><span data-no-i18n>{b.item_name}</span></DocRef> <span className="text-muted-foreground" data-no-i18n>{uomLabel(b.uom, ar)}</span></td>
          <td className="px-1.5 py-1.5 text-end" data-no-i18n>{fmtQty(b.ordered)}</td><td className="px-1.5 py-1.5 text-end" data-no-i18n>{fmtQty(b.pending_receipt)}</td>
          <td className="px-1.5 py-1.5 text-end">{q(b.received, b.item_code, "Receipt")}</td><td className="px-1.5 py-1.5 text-end">{q(b.returned, b.item_code, "Return to Supplier")}</td>
          <td className="px-1.5 py-1.5 text-end">{q(b.issued, b.item_code, "Issue to Work")}</td><td className="px-1.5 py-1.5 text-end font-semibold">{q(b.balance, b.item_code)}</td>
        </tr>)}</tbody></table></div> : <Empty>{t("No material movements for this project yet", "لا توجد حركات مواد لهذا المشروع بعد")}</Empty>}
    </Section>
  );
}
const fmtQty = (v: number) => fmtNumber(v, Number.isInteger(v) ? 0 : 2);

function Resources({ p }: { p: Doc }) {
  const { t } = useCx();
  const r = resourcesOf(p.name);
  return (
    <>
      <KpiGrid>
        <Kpi label={t("Active crews", "الطواقم النشطة")} value={r.crews.filter((c) => c["status"] === "Active").length} />
        <Kpi label={t("Man-days (submitted)", "أيام العمل (المرسلة)")} value={r.manDays} />
        <Kpi label={t("Overtime hours", "ساعات العمل الإضافي")} value={r.overtime} />
        <Kpi label={t("Machine hours", "ساعات المعدات")} value={r.machineHours} hint={t(`operational estimate ${money(r.machineEstimate)}`, `تقدير تشغيلي ${money(r.machineEstimate)}`)} />
        <Kpi label={t("Approved site spend", "مصروفات موقع معتمدة")} value={money(r.approvedSpend)} hint={t("not posted until a Journal Entry is submitted", "لا تُرحّل حتى اعتماد قيد يومية")} />
        <Kpi label={t("Pending site spend", "مصروفات بانتظار الاعتماد")} value={money(r.pendingSpend)} tone={r.pendingSpend ? "warn" : "default"} />
      </KpiGrid>
      <PolicyGate keys={["P7"]} />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-2">
        <Linked title={t("Crews", "الطواقم")} doctype="Digit Crew" project={p} cols={[["crew_name", t("Crew", "الطاقم")], ["trade", t("Trade", "الحرفة")], ["status", t("Status", "الحالة"), "state"]]} />
        <Linked title={t("Site attendance", "الحضور الميداني")} doctype="Digit Field Attendance" project={p} cols={[["attendance_date", t("Date", "التاريخ"), "date"], ["crew", t("Crew", "الطاقم")], ["present_count", t("Present", "الحاضرون"), "num"], ["docstatus", t("Submitted", "مرسل"), "check"]]} />
        <Linked title={t("Machinery usage", "استخدام المعدات")} doctype="Digit Machinery Usage" project={p} cols={[["machinery", t("Machine", "المعدة")], ["usage_date", t("Date", "التاريخ"), "date"], ["hours", t("Hours", "الساعات"), "num"], ["total", t("Cost estimate", "تقدير التكلفة"), "money"]]} />
        <Linked title={t("Petty cash funds", "العهد النقدية")} doctype="Digit Petty Cash Fund" project={p} cols={[["fund_name", t("Fund", "العهدة")], ["fund_limit", t("Limit", "الحد"), "money"], ["balance", t("Balance", "الرصيد"), "money"], ["status", t("Status", "الحالة"), "state"]]} />
        <Section title={t("Site expenses", "مصروفات الموقع")} actions={<NewDoc doctype="Digit Site Expense" defaults={{ project: p.name, company: p["company"], workflow_state: "Draft" }} label={t("Expense", "مصروف")} />}>
          <DataTable rows={r.exps as R[]} pageSize={8} empty={t("No site expenses", "لا مصروفات موقع")} cols={[
            { key: "name", label: t("Expense", "المصروف"), kind: "doc", doctype: "Digit Site Expense" }, { key: "expense_date", label: t("Date", "التاريخ"), kind: "date" }, { key: "amount", label: t("Amount", "المبلغ"), kind: "money", total: true },
            { key: "workflow_state", label: t("Status", "الحالة"), kind: "state" },
            { key: "journal_entry", label: t("Journal entry", "قيد اليومية"), render: (x) => x["journal_entry"] ? <DocRef doctype="Journal Entry" name={x["journal_entry"]} /> : x["workflow_state"] === "Approved" && hasRole("Digit Accountant") ? <ActionButton label={t("Post via journal", "ترحيل بقيد")} run={() => S.createExpenseJournal(String(x["name"]))} /> : "—" },
          ] as Col<R>[]} />
        </Section>
      </div>
    </>
  );
}

function Finance({ p }: { p: Doc }) {
  const { t, ar } = useCx();
  const f = financialPosition(p.name);
  const co = closeoutOf(p.name);
  const canQS = hasRole("Digit QS"), canPM = hasRole("Digit Project Manager");
  const contract = contractsOf(p.name)[0];
  const sis = list("Sales Invoice", (s) => s["project"] === p.name && isSubmitted(s));
  return (
    <>
      <KpiGrid>
        <Kpi label={t("Invoiced to client", "المفوتر للعميل")} value={compact(f.invoicedGross, ar)} />
        <Kpi label={t("Collected", "المحصّل")} value={compact(f.collected, ar)} tone="good" />
        <Kpi label={t("Receivable outstanding", "المستحق على العميل")} value={compact(f.outstanding, ar)} tone={f.outstanding ? "warn" : "default"} />
        <Kpi label={t("Supplier invoices", "فواتير الموردين")} value={compact(f.payables.invoiced, ar)} />
        <Kpi label={t("Payable outstanding", "المستحق للموردين")} value={compact(f.payables.outstanding, ar)} />
        <Kpi label={t("Net cash (collected − paid)", "صافي النقد (المحصّل − المدفوع)")} value={compact(f.cashNet, ar)} tone={f.cashNet < 0 ? "bad" : "good"} />
      </KpiGrid>
      <PolicyGate keys={["P1", "P2", "P4"]} />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-2">
        <Section title={t("Retention and advance", "المحتجزات والدفعة المقدمة")}>
          <Measures items={[{ label: t("Retention held", "المحتجزات"), value: f.retentionHeld, tone: "warn" }, { label: t("Retention released", "المفرج عنه"), value: f.retentionReleased, tone: "good" }, { label: t("Advance outstanding", "رصيد المقدم"), value: f.advanceOutstanding }]} />
          {contract && canQS && <div className="mt-3 flex flex-wrap gap-2"><ActionButton label={t("Request partial retention release", "طلب إفراج جزئي")} run={() => S.createRetentionRelease(contract.name, "Partial", r2(f.retentionHeld / 2))} /><ActionButton label={t("Start final account", "بدء الحساب الختامي")} run={() => S.createFinalAccount(contract.name)} /></div>}
        </Section>
        <Section title={t("Closeout", "الإغلاق")} actions={!co.assessment && canPM ? <ActionButton label={t("Start closeout assessment", "بدء تقييم الإغلاق")} run={() => S.createCloseout(p.name)} /> : <ListRef doctype="Digit Closeout Assessment" filters={[["project", "=", p.name]]}>{t("List", "القائمة")}</ListRef>}>
          <CloseoutCards project={p.name} />
          {co.assessment ? (
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm">
              <dt className="text-muted-foreground">{t("Assessment", "التقييم")}</dt><dd><DocRef doctype="Digit Closeout Assessment" name={co.assessment.name} /></dd>
              <dt className="text-muted-foreground">{t("Technical", "الفني")}</dt><dd><StateBadge state={co.assessment["technical_status"]} /></dd>
              <dt className="text-muted-foreground">{t("Commercial", "التجاري")}</dt><dd><StateBadge state={co.assessment["commercial_status"]} /></dd>
              <dt className="text-muted-foreground">{t("Financial", "المالي")}</dt><dd><StateBadge state={co.assessment["financial_status"]} /></dd>
            </dl>
          ) : <Empty>{t("No closeout assessment yet", "لا يوجد تقييم إغلاق بعد")}</Empty>}
          {co.finalAccounts.map((fa) => <div key={fa.name} className="mt-2 flex items-center justify-between text-sm"><DocRef doctype="Digit Final Account" name={fa.name} /><StateBadge state={fa["workflow_state"]} /><span data-no-i18n>{money(fa["final_value"])}</span></div>)}
          {co.releases.map((r) => <div key={r.name} className="mt-1 flex items-center justify-between text-sm"><DocRef doctype="Digit Retention Release Request" name={r.name} /><StateBadge state={r["workflow_state"]} /><span data-no-i18n>{money(r["requested_amount"])}</span></div>)}
        </Section>
      </div>
      <Section title={t("Client invoices", "فواتير العميل")} actions={<AppLink to="finance">{t("Financial position", "الموقف المالي")}</AppLink>}>
        <DataTable rows={sis as R[]} empty={t("No submitted client invoices", "لا فواتير عملاء معتمدة")} cols={[
          { key: "name", label: t("Invoice", "الفاتورة"), kind: "doc", doctype: "Sales Invoice" }, { key: "posting_date", label: t("Date", "التاريخ"), kind: "date" }, { key: "due_date", label: t("Due", "الاستحقاق"), kind: "date" },
          { key: "digit_client_certificate", label: t("Certificate", "الشهادة"), kind: "doc", doctype: "Digit Client Certificate" }, { key: "grand_total", label: t("Total", "الإجمالي"), kind: "money", total: true }, { key: "outstanding_amount", label: t("Outstanding", "المتبقي"), kind: "money", total: true }, { key: "status", label: t("Status", "الحالة"), kind: "state" },
        ] as Col<R>[]} />
      </Section>
    </>
  );
}

/** Idea 9: claim stages as one 4-colour bar (مطالَب → معتمد → مفوتر → محصّل), each part a partition of projectCommercial. */
export function ClaimStageBar({ project }: { project: string }) {
  const { t, ar } = useCx();
  const st = claimStages(project);
  if (!st.claimed && !st.certified && !st.invoiced && !st.collected) return null;
  return <DistributionBar title={t("Claim position", "موقف المستخلص")} footer={t("Claimed = submitted claims awaiting a certificate · Certified = not yet invoiced · Invoiced = not yet collected.", "مطالَب = مطالبات مقدّمة بانتظار شهادة · معتمد = لم يُفوتر بعد · مفوتر = لم يُحصّل بعد.")} segments={[
    { key: "claimed", label: t("Claimed", "مطالَب"), value: st.claimed, display: compact(st.claimed, ar), hue: "blue" },
    { key: "certified", label: t("Certified", "معتمد"), value: st.certified, display: compact(st.certified, ar), hue: "amber" },
    { key: "invoiced", label: t("Invoiced", "مفوتر"), value: st.invoiced, display: compact(st.invoiced, ar), hue: "teal" },
    { key: "collected", label: t("Collected", "محصّل"), value: st.collected, display: compact(st.collected, ar), hue: "emerald" },
  ]} />;
}

/** Idea 8: the project close gates (closeGateErrors) as requirement cards, each with the document to open. */
export function CloseoutCards({ project }: { project: string }) {
  const { t, ar } = useCx();
  const items = closeoutRequirements(project);
  return <RequirementCards ar={ar} title={t("Close gates", "بوابات الإقفال")} items={items.map((r) => ({
    key: r.key, label: t(r.en, r.ar), state: r.state, missing: r.missing,
    detail: r.key === "critical" && r.names?.length ? <span data-no-i18n>{r.names.slice(0, 3).join("، ")}{r.names.length > 3 ? " …" : ""}</span> : undefined,
    action: r.name ? <DocRef doctype={r.doctype} name={r.name} /> : <ListRef doctype={r.doctype} filters={[["project", "=", project]]}>{t("Open list", "افتح القائمة")}</ListRef>,
  }))} />;
}
