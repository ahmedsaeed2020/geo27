/** Department workspaces (PRJ/ET/CON/SUB/CST/PROC/RSP/FIN-00): KPIs, queues, documents, primary report and next pages — one generic shell, department data from domain read models. */
import type { ReactNode } from "react";
import { openMaterialRequestKpi } from "./procurementKpi";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import type { PluginPageProps } from "@/plugins/pages";
import { num, pct, r2, sumBy, validityState } from "../domain/calc";
import { APP, contractPosition, contractsOf, costPosition, financialPosition, isSubmitted, list, overdueTasks, policyDefined, procurementOf, projectTitle, resourcesOf, tasksOf, today } from "../domain/data";
import { constructionProjects, DEPTS, queues, type Dept } from "../domain/queues";
import { CONSTRUCTION_REPORTS } from "../reports";
import { DOCTYPE_AR } from "../schema";
import { queueExceptions, severityText } from "./home";
import { InsightsChartPanel, useWorkspaceChartIds } from "./analytics";
import { ModuleDirectory } from "./directory";
import { AppLink, BAND, compact, Empty, Kpi, KpiGrid, ListRef, OWN, PageHeader, PolicyGate, Section, useCx } from "./kit";
import { BandField, bandInput, DxPanel, DxSplit, ExceptionList, TabBar, Chev } from "@/components/digit/Experience";
import { projectRequired, reportLink, reportTitle, ReportTable } from "./reports";
import { WS_INDEX, wsRoute } from "../r19/wsIndex";
import { k06Cards, type KpiDef } from "../r19/metrics";
import { useLevel, usedPct } from "../domain/costScreens";
import { CostProgressPanel, CostRankPanel, ForecastStripPanel } from "./costScreens";

/** R19 contract department of each module (the module's four workspaces are listed above its tabs). */
const R19_DEPT: Record<Exclude<Dept, "MGT">, string> = { PRJ: "02", ET: "03", CON: "04", SUB: "05", CST: "06", PROC: "07", RSP: "08", FIN: "09" };

interface DeptDef { docs: string[]; report: string; reports: string[]; pages: [string, string, string][]; policies: string[]; kpis: (ar: boolean, t: (e: string, a: string) => string) => ReactNode; /** overview blocks shown under the KPI row (phase 5: cost progress) */ overview?: () => ReactNode }
/** Progress line of a cost card: share of the revised budget, level from the Construction budget settings. */
const meterOf = (used: number, budget: number, words: string) => { const p = usedPct(used, budget); if (p === null) return undefined; const l = useLevel(used, budget); return { pct: p, level: l === "none" ? undefined : l, label: `${p}% ${words}` }; };
/** A workspace / catalog figure (r19/metrics KpiDef) as a department tile with its progress line and drill. */
function FigTile({ k, ar }: { k: KpiDef; ar: boolean }) {
  let f; try { f = k.fig({ on: today(), ar }); } catch { f = undefined; }
  const title = ar ? k.title[1] : k.title[0];
  const shown = !f || f.value === null || (f.status && f.status !== "ok") ? "—" : f.unit === "money" ? compact(f.value, ar) : String(f.value);
  const meter = f?.meter ? { pct: f.meter.pct, level: f.meter.level, label: ar ? f.meter.label[1] : f.meter.label[0] } : undefined;
  const hint = f?.sub ? (ar ? f.sub[1] : f.sub[0]) : undefined;
  const tone = f?.meter?.level === "over" ? "bad" : f?.meter?.level === "warn" ? "warn" : "default";
  const d = f?.drill;
  if (d?.kind === "list") return <Kpi label={title} value={shown} hint={hint} meter={meter} tone={tone} list={{ doctype: d.doctype, ...(d.filters ? { filters: d.filters } : {}) }} />;
  if (d?.kind === "report") return <Kpi label={title} value={shown} hint={hint} meter={meter} tone={tone} to={reportLink(d.report, d.filters ?? {})} />;
  if (d?.kind === "page") return <Kpi label={title} value={shown} hint={hint} meter={meter} tone={tone} to={d.to} />;
  return <Kpi label={title} value={shown} hint={hint} meter={meter} tone={tone} />;
}
const DEFS: Record<Exclude<Dept, "MGT">, DeptDef> = {
  PRJ: { docs: ["Project", "Task", "Digit Work Package", "Digit Stage Planning", "Digit WBS Version", "Digit Task Dependency", "Digit Progress Update", "Digit Site Activity Report", "Timesheet"], report: "Construction Portfolio Status", reports: ["Construction Portfolio Status", "Resource Utilization"], pages: [["projects", "Projects register", "سجل المشاريع"], ["portfolio", "Project portfolio", "محفظة المشاريع"]], policies: [],
    kpis: (ar, t) => { const ps = constructionProjects(); const ts = ps.flatMap((p) => tasksOf(p.name)); const od = ps.flatMap((p) => overdueTasks(p.name));
      return <><Kpi label={t("Active projects", "المشاريع النشطة")} value={ps.filter((p) => p["status"] === "Open").length} to="projects" /><Kpi label={t("Tasks", "المهام")} value={ts.length} list={{ doctype: "Task" }} /><Kpi label={t("Overdue tasks", "مهام متأخرة")} value={od.length} tone={od.length ? "bad" : "good"} list={{ doctype: "Task", filters: [["exp_end_date", "<", today()], ["status", "not in", ["Completed", "Cancelled"]]] }} />
        <Kpi label={t("Average task progress", "متوسط إنجاز المهام")} value={`${ts.length ? r2(sumBy(ts, (x) => num(x["progress"])) / ts.length) : 0}%`} /><Kpi label={t("Site reports (30 days)", "تقارير الموقع (30 يوماً)")} value={list("Digit Site Activity Report", (s) => String(s["report_date"] ?? "") >= new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10)).length} list={{ doctype: "Digit Site Activity Report" }} /></>; } },
  ET: { docs: ["Digit Tender", "Digit Estimate Version", "Digit BOQ", "Digit Construction Rate", "Digit Assembly", "Digit Estimate Template", "Customer"], report: "Tender Pipeline", reports: ["Tender Pipeline"], pages: [["estimating/boq-compare", "BOQ revision comparison", "مقارنة مراجعات جدول الكميات"]], policies: ["P6"],
    kpis: (ar, t) => { const ts = list("Digit Tender"); const open = ts.filter((x) => !["Won", "Lost", "Cancelled"].includes(String(x["status"]))); const won = ts.filter((x) => x["status"] === "Won").length, lost = ts.filter((x) => x["status"] === "Lost").length;
      const rates = list("Digit Construction Rate"); const expiring = rates.filter((r) => ["expiring", "expired"].includes(validityState(r["valid_until"], today())));
      return <><Kpi label={t("Open tenders", "عطاءات مفتوحة")} value={open.length} list={{ doctype: "Digit Tender", filters: [["status", "not in", ["Won", "Lost", "Cancelled"]]] }} /><Kpi label={t("Open pipeline (bid value)", "قيمة العطاءات المفتوحة")} value={compact(sumBy(open, (x) => num(x["est_selling"])), ar)} to="reports/Tender%20Pipeline" />
        <Kpi label={t("Win rate", "نسبة الفوز")} value={won + lost ? `${pct(won, won + lost)}%` : "—"} hint={t(`${won} won · ${lost} lost`, `${won} فوز · ${lost} خسارة`)} /><Kpi label={t("Estimates awaiting approval", "تقديرات بانتظار الاعتماد")} value={list("Digit Estimate Version", (e) => e["workflow_state"] === "Submitted").length} list={{ doctype: "Digit Estimate Version", filters: [["workflow_state", "=", "Submitted"]] }} />
        <Kpi label={t("Rates expiring or expired", "أسعار تنتهي أو منتهية")} value={expiring.length} tone={expiring.length ? "warn" : "good"} list={{ doctype: "Digit Construction Rate" }} /></>; } },
  CON: { docs: ["Digit Client Contract", "Digit Client Variation", "Digit Client Claim", "Digit Client Certificate", "Sales Invoice", "Customer"], report: "Client Contract Position", reports: ["Client Contract Position", "Claims and Certificates Register", "Retention and Advances"], pages: [], policies: ["P9"],
    kpis: (ar, t) => { const cs = contractsOf().filter((c) => c["workflow_state"] === "Active"); const pos = cs.map(contractPosition);
      return <><Kpi label={t("Active contracts", "عقود نشطة")} value={cs.length} list={{ doctype: "Digit Client Contract", filters: [["workflow_state", "=", "Active"]] }} /><Kpi label={t("Revised contract value", "قيمة العقود المعدلة")} value={compact(sumBy(pos, (p) => p.revised), ar)} to="reports/Client%20Contract%20Position" />
        <Kpi label={t("Certified gross", "الإجمالي المعتمد")} value={compact(sumBy(pos, (p) => p.certifiedGross), ar)} /><Kpi label={t("Claims pending certificate", "مطالبات بانتظار الشهادة")} value={compact(sumBy(pos, (p) => p.claimedPending), ar)} list={{ doctype: "Digit Client Claim", filters: [["workflow_state", "=", "Submitted"]] }} />
        <Kpi label={t("Certified not invoiced", "معتمد غير مفوتر")} value={compact(sumBy(pos, (p) => p.certifiedNotInvoiced), ar)} tone="warn" /><Kpi label={t("Variations pending", "تغييرات معلقة")} value={compact(sumBy(list("Digit Client Variation", (v) => v["workflow_state"] === "Submitted"), (v) => num(v["amount"])), ar)} list={{ doctype: "Digit Client Variation", filters: [["workflow_state", "=", "Submitted"]] }} /></>; } },
  SUB: { docs: ["Supplier", "Digit Subcontractor Profile", "Digit Subcontract Work Order", "Digit Measurement Book", "Digit Subcontractor Bill", "Purchase Invoice"], report: "Subcontract Position", reports: ["Subcontract Position"], pages: [["sub/review", "QS review & certification", "مراجعة الكميات والاعتماد"]], policies: ["P3", "P5", "P8"],
    kpis: (ar, t) => { const wos = list("Digit Subcontract Work Order", (w) => w["workflow_state"] === "Active"); const bills = list("Digit Subcontractor Bill", isSubmitted);
      return <><Kpi label={t("Active work orders", "أوامر عمل نشطة")} value={wos.length} list={{ doctype: "Digit Subcontract Work Order", filters: [["workflow_state", "=", "Active"]] }} /><Kpi label={t("Work order value", "قيمة أوامر العمل")} value={compact(sumBy(wos, (w) => num(w["total_value"])), ar)} />
        <Kpi label={t("Books awaiting QS", "دفاتر بانتظار المراجعة")} value={list("Digit Measurement Book", (b) => b["workflow_state"] === "Submitted").length} to="sub/review" /><Kpi label={t("Billed gross", "إجمالي المستخلصات")} value={compact(sumBy(bills, (b) => num(b["gross_amount"])), ar)} />
        <Kpi label={t("Retention withheld", "المحتجزات المستقطعة")} value={compact(sumBy(bills, (b) => num(b["retention_amount"])), ar)} /><Kpi label={t("Profiles under review", "ملفات قيد المراجعة")} value={list("Digit Subcontractor Profile", (p) => p["workflow_state"] === "Under Review").length} list={{ doctype: "Digit Subcontractor Profile", filters: [["workflow_state", "=", "Under Review"]] }} /></>; } },
  CST: { docs: ["Digit Project Cost Budget", "Digit Budget Revision", "Digit Budget Transfer", "Digit Cost Forecast Snapshot", "Digit Cost Sheet Definition", "Cost Center"], report: "Project Cost Report", reports: ["Project Cost Report", "Construction Portfolio Status"], pages: [["cost/sheet", "Cost sheet", "ورقة التكلفة"]], policies: ["P7"],
    // phase 5 C5-07: every cost card carries its progress against the budget, and the K06 catalog cards follow (no number-only cards)
    kpis: (ar, t) => { const cps = constructionProjects().map((p) => costPosition(p.name)); const over = cps.filter((c) => c.variance !== null && c.variance < 0).length;
      const rev = sumBy(cps, (c) => c.revised), com = sumBy(cps, (c) => c.committed), act = sumBy(cps, (c) => c.actual), eacT = sumBy(cps, (c) => num(c.eac)), un = sumBy(cps, (c) => sumBy(c.unallocated, (u) => u.actual + u.committed));
      return <><Kpi label={t("Revised budget", "الموازنة المعدلة")} value={compact(rev, ar)} to="cost/sheet" meter={meterOf(com + act, rev, t("used (committed + actual)", "مستخدم (ملتزم + فعلي)"))} /><Kpi label={t("Open commitments", "الالتزامات المفتوحة")} value={compact(com, ar)} to="cost/sheet" meter={meterOf(com, rev, t("of the revised budget", "من الموازنة المعدلة"))} /><Kpi label={t("Actual cost", "التكلفة الفعلية")} value={compact(act, ar)} to="cost/sheet" meter={meterOf(act, rev, t("of the revised budget", "من الموازنة المعدلة"))} />
        <Kpi label={t("EAC", "التكلفة المتوقعة")} value={compact(eacT, ar)} to="cost/sheet" tone={eacT > rev ? "bad" : "default"} meter={meterOf(eacT, rev, t("of the revised budget", "من الموازنة المعدلة"))} /><Kpi label={t("Projects forecast over budget", "مشاريع متوقع تجاوزها")} value={over} tone={over ? "bad" : "good"} meter={cps.length ? { pct: Math.round((over / cps.length) * 1000) / 10, level: over ? "over" : "ok", label: t(`${over} of ${cps.length} projects`, `${over} من ${cps.length} مشروعًا`) } : undefined} /><Kpi label={t("Unallocated spend", "إنفاق غير موزع")} value={compact(un, ar)} tone="warn" meter={meterOf(un, com + act, t("of committed + actual", "من الملتزم + الفعلي"))} />
        {k06Cards().map((k) => <FigTile key={k.id} k={k} ar={ar} />)}</>; },
    overview: () => { const ps = constructionProjects().map((p) => p.name); return <>
      <Section title={<CostTitle en="Progress against budget" ar="التقدم مقابل الموازنة" />}><CostProgressPanel projects={ps} /></Section>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]"><CostRankPanel projects={ps} /><Section title={<CostTitle en="Forecasts — last 12 periods" ar="التوقعات — آخر 12 فترة" />}><ForecastStripPanel projects={ps} /></Section></div>
    </>; } },
  PROC: { docs: ["Material Request", "Request for Quotation", "Supplier Quotation", "Purchase Order", "Purchase Receipt", "Stock Entry", "Purchase Invoice", "Supplier", "Item"], report: "Material Request Status", reports: ["Material Request Status", "Project Material Balance", "Project Material Movements"], pages: [["proc/comparison", "Quotation comparison", "مقارنة العروض"], ["proc/matching", "Invoice matching", "مطابقة الفواتير"]], policies: ["P5"],
    kpis: (ar, t) => { const xs = constructionProjects().map((p) => procurementOf(p.name));
      return <><Kpi label={t("Open material requests", "طلبات مواد مفتوحة")} {...openMaterialRequestKpi(xs)} /><Kpi label={t("Overdue requests", "طلبات متأخرة")} value={sumBy(xs, (x) => x.overdueMr.length)} tone="warn" /><Kpi label={t("Open purchase orders", "أوامر شراء مفتوحة")} value={sumBy(xs, (x) => x.openPo.length)} list={{ doctype: "Purchase Order", filters: [["docstatus", "=", 1]] }} />
        <Kpi label={t("Late deliveries", "توريدات متأخرة")} value={sumBy(xs, (x) => x.latePo.length)} tone="warn" /><Kpi label={t("RFQs awaiting quotes", "طلبات بانتظار العروض")} value={sumBy(xs, (x) => x.openRfq.length)} to="proc/comparison" /><Kpi label={t("Uninvoiced PO value", "أوامر غير مفوترة")} value={compact(sumBy(xs, (x) => x.committedPo), ar)} to="proc/matching" /></>; } },
  RSP: { docs: ["Digit Crew", "Digit Field Attendance", "Digit Machinery", "Digit Machinery Usage", "Digit Petty Cash Fund", "Digit Site Expense", "Employee"], report: "Resource Utilization", reports: ["Resource Utilization"], pages: [], policies: ["P7"],
    kpis: (ar, t) => { const rs = constructionProjects().map((p) => resourcesOf(p.name));
      return <><Kpi label={t("Active crews", "طواقم نشطة")} value={sumBy(rs, (r) => r.crews.filter((c) => c["status"] === "Active").length)} list={{ doctype: "Digit Crew" }} /><Kpi label={t("Man-days", "أيام العمل")} value={sumBy(rs, (r) => r.manDays)} /><Kpi label={t("Overtime hours", "ساعات إضافية")} value={sumBy(rs, (r) => r.overtime)} />
        <Kpi label={t("Machine hours", "ساعات المعدات")} value={sumBy(rs, (r) => r.machineHours)} list={{ doctype: "Digit Machinery Usage" }} /><Kpi label={t("Approved site spend", "مصروفات معتمدة")} value={compact(sumBy(rs, (r) => r.approvedSpend), ar)} /><Kpi label={t("Pending site spend", "مصروفات معلقة")} value={compact(sumBy(rs, (r) => r.pendingSpend), ar)} tone="warn" list={{ doctype: "Digit Site Expense", filters: [["workflow_state", "=", "Submitted"]] }} /></>; } },
  FIN: { docs: ["Sales Invoice", "Purchase Invoice", "Payment Entry", "Journal Entry", "Digit Retention Release Request", "Digit Final Account", "Digit Closeout Assessment", "Digit Cashflow Forecast Item", "Digit Opening Balance"], report: "Retention and Advances", reports: ["Construction Receivables Aging", "Construction Cashflow", "Retention and Advances", "Closeout Readiness"], pages: [["finance", "Financial position", "الموقف المالي"]], policies: ["P1", "P2", "P3", "P4"],
    kpis: (ar, t) => { const fs = constructionProjects().map((p) => financialPosition(p.name));
      return <><Kpi label={t("Receivable outstanding", "ذمم العملاء")} value={compact(sumBy(fs, (f) => f.outstanding), ar)} to="reports/Construction%20Receivables%20Aging" tone="warn" /><Kpi label={t("Payable outstanding", "ذمم الموردين")} value={compact(sumBy(fs, (f) => f.payables.outstanding), ar)} /><Kpi label={t("Retention held", "المحتجزات")} value={compact(sumBy(fs, (f) => f.retentionHeld), ar)} to="reports/Retention%20and%20Advances" />
        <Kpi label={t("Advance outstanding", "رصيد الدفعات المقدمة")} value={compact(sumBy(fs, (f) => f.advanceOutstanding), ar)} /><Kpi label={t("Net cash", "صافي النقد")} value={compact(sumBy(fs, (f) => f.cashNet), ar)} to="reports/Construction%20Cashflow" /><Kpi label={t("Certified not invoiced", "معتمد غير مفوتر")} value={compact(sumBy(fs, (f) => f.certifiedNotInvoiced), ar)} /></>; } },
};

function CostTitle({ en, ar }: { en: string; ar: string }) { const { t } = useCx(); return <>{t(en, ar)}</>; }
export function DeptPage({ params }: PluginPageProps) {
  const { t, ar } = useCx();
  const key = String(params["key"] ?? "").toUpperCase() as Exclude<Dept, "MGT">;
  const d = DEFS[key]; const meta = DEPTS.find((x) => x.key === key);
  if (!d || !meta) return <div className="p-6"><PageHeader title={t("Department not found", "القسم غير موجود")} /><Empty><span data-no-i18n>{params["key"]}</span></Empty></div>;
  const report = CONSTRUCTION_REPORTS.find((r) => r.name === d.report)!;
  const qs = queues().filter((q) => q.dept === key);
  return <DeptBody k={key} d={d} meta={meta} report={report} qs={qs} />;
}

const QUESTION: Record<Exclude<Dept, "MGT">, [string, string]> = {
  PRJ: ["Which projects and tasks are slipping, and what needs review?", "ما المشاريع والمهام المتأخرة، وما الذي يحتاج مراجعة؟"],
  ET: ["Which tenders and estimates need a decision, and which rates are expiring?", "ما العطاءات والتقديرات التي تحتاج قراراً، وما الأسعار التي تنتهي صلاحيتها؟"],
  CON: ["What is certified, invoiced and still pending with each client?", "ما المعتمد والمفوتر والمعلق مع كل عميل؟"],
  SUB: ["Which measurements and subcontract bills wait for QS review or approval?", "ما القياسات ومستخلصات الباطن التي تنتظر مراجعة الكميات أو الاعتماد؟"],
  CST: ["Which projects are forecast over budget, and where is spend unallocated?", "ما المشاريع المتوقع تجاوزها للموازنة، وأين الإنفاق غير الموزع؟"],
  PROC: ["Which requests, orders and deliveries are late or waiting?", "ما الطلبات والأوامر والتوريدات المتأخرة أو المعلقة؟"],
  RSP: ["Where are crews, equipment and site spend going?", "أين تذهب الطواقم والمعدات ومصروفات الموقع؟"],
  FIN: ["What is owed, held and forecast in cash across projects?", "ما المستحق والمحتجز والمتوقع نقداً عبر المشاريع؟"],
};
type Tab = "overview" | "work" | "documents" | "reports";
const TABS: Tab[] = ["overview", "work", "documents", "reports"];

function DeptBody({ k: key, d, meta, report, qs }: { k: Exclude<Dept, "MGT">; d: DeptDef; meta: (typeof DEPTS)[number]; report: (typeof CONSTRUCTION_REPORTS)[number]; qs: ReturnType<typeof queues> }) {
  const { t, ar } = useCx();
  const search = useRouterState({ select: (s) => s.location.search as Record<string, unknown> });
  const nav = useNavigate();
  // a project-required primary report (Budget & Cost) runs for the project chosen here, kept in ?project= so Back / reload / Open report keep it
  const needsProject = projectRequired(report);
  const projs = needsProject ? constructionProjects() : [];
  const asked = typeof search["project"] === "string" ? String(search["project"]) : "";
  const project = projs.some((p) => p.name === asked) ? asked : projs[0]?.name ?? "";
  const tab: Tab = TABS.includes(search["tab"] as Tab) ? (search["tab"] as Tab) : "overview";
  const go = (patch: Record<string, string | undefined>) => void nav({ to: "/plugins/$name/$", params: { name: APP, _splat: `dept/${key.toLowerCase()}` }, search: Object.fromEntries(Object.entries({ ...search, ...patch }).filter(([, v]) => v !== undefined && v !== "")) as never, replace: true });
  const pick = (v: string) => go({ project: v || undefined });
  const charts = useWorkspaceChartIds({ dept: key });
  const openItems = qs.reduce((s, q) => s + q.docs.length, 0);
  const openPolicies = d.policies.filter((p) => !policyDefined(p));
  const name = ar ? meta.ar : meta.en;
  const reportPanel = (
    <Section title={reportTitle(report.name, ar)} actions={<AppLink to={reportLink(report.name, needsProject ? { project } : {})} className="font-medium">{t("Open report", "فتح التقرير")}</AppLink>}>
      {needsProject && !project ? <Empty>{t("No construction project is available to you.", "لا يوجد مشروع مقاولات متاح لك.")}</Empty> : <ReportTable report={report} filters={needsProject ? { project } : {}} pageSize={15} />}
    </Section>
  );
  const exceptions = (
    <DxPanel title={<span>{t("Work queues", "قوائم العمل")} <span className="text-xs font-normal text-muted-foreground" data-no-i18n>({openItems})</span></span>} subtitle={t("Ranked: blocked, risks, then actions", "مرتبة: الموقوف ثم المخاطر ثم الإجراءات")} className="h-[calc(100%-1rem)]" attrs={{ "data-dept-queues": key }}>
      <ExceptionList items={queueExceptions(qs, ar, t)} empty={t("Nothing waiting in this department", "لا شيء بانتظار هذا القسم")} severityLabel={severityText(t)} />
    </DxPanel>
  );
  return (
    <div className="w-full min-w-0" data-page="construction-dept" data-dept={key} data-dept-tab={tab}>
      <PageHeader title={name} subtitle={t("Department workspace — every count opens the documents it counts.", "مساحة القسم — كل عدد يفتح المستندات التي يعدّها.")}
        band={{ question: ar ? QUESTION[key][1] : QUESTION[key][0],
          basis: t("Counts read this department's documents when the page opens; every card, bar and queue opens the records behind it.", "تقرأ الأعداد مستندات هذا القسم عند فتح الصفحة؛ كل بطاقة وشريط وقائمة تفتح السجلات التي تقوم عليها."),
          controls: needsProject ? <BandField label={t("Project", "المشروع")}><select className={bandInput} value={project} data-dept-project onChange={(e) => pick(e.target.value)}>{projs.map((p) => <option key={p.name} value={p.name} data-no-i18n>{projectTitle(p, !ar)}</option>)}</select></BandField> : undefined,
          meta: [
            { label: t("Construction projects", "مشاريع المقاولات"), value: <span data-no-i18n>{constructionProjects().length}</span> },
            { label: t("Open queue items", "عناصر مفتوحة في القوائم"), value: <span data-no-i18n>{openItems}</span> },
            ...(openPolicies.length ? [{ label: t("Policy decisions pending", "قرارات سياسات معلقة"), value: <span data-no-i18n>{openPolicies.join(" · ")}</span> }] : []),
            { label: t("Primary report", "التقرير الرئيسي"), value: reportTitle(report.name, ar) },
          ],
          actions: <>{d.pages.map(([to, en, a], i) => <AppLink key={to} to={to} className={i === 0 ? BAND.primary : BAND.secondary}>{ar ? a : en}</AppLink>)}<AppLink to={charts.to} className={BAND.secondary}>{t("Insights dashboard", "لوحة التحليلات")}</AppLink></> }} />
      <TabBar ariaLabel={t(`${name} sections`, `أقسام ${name}`)} value={tab} onChange={(k) => go({ tab: k === "overview" ? undefined : k })} tabs={[
        { key: "overview", label: t("Overview", "نظرة عامة") },
        { key: "work", label: t("Work & queues", "العمل والقوائم"), count: openItems },
        { key: "documents", label: t("Documents", "المستندات"), count: d.docs.length },
        { key: "reports", label: t("Reports", "التقارير"), count: d.reports.length },
      ]} />
      <nav className="mb-3 flex flex-wrap items-center gap-2 text-sm" aria-label={t("Workspaces of this department", "مساحات عمل هذا القسم")} data-dept-r19={key}>
        <span className="text-xs text-muted-foreground">{t("Workspaces", "مساحات العمل")}</span>
        {WS_INDEX.filter(([id]) => id.startsWith(`${R19_DEPT[key]}-`)).map(([id, en, a]) => <AppLink key={id} to={wsRoute(id)} className="rounded-full border border-border bg-card px-3 py-1 font-medium text-primary hover:bg-muted max-md:min-h-11 max-md:inline-flex max-md:items-center">{ar ? a : en}</AppLink>)}
      </nav>
      {tab === "overview" && <>
        <KpiGrid cols={3}>{d.kpis(ar, t)}</KpiGrid>
        <PolicyGate keys={d.policies} />
        {d.overview?.()}
        <DxSplit>
          {charts.ids[0] ? <InsightsChartPanel id={charts.ids[0]} scope={{}} /> : <div />}
          {exceptions}
        </DxSplit>
        <DxSplit ratio="8:4">
          <div className="min-w-0">{reportPanel}</div>
          <div className="min-w-0">{charts.ids[1] ? <InsightsChartPanel id={charts.ids[1]} scope={{}} /> : null}</div>
        </DxSplit>
      </>}
      {tab === "work" && <>
        <PolicyGate keys={d.policies} />
        <DxSplit ratio="8:4">
          <div className="min-w-0">{reportPanel}</div>
          <div className="min-w-0">
            {exceptions}
            {d.pages.length > 0 && <DxPanel title={t("Department tools", "أدوات القسم")} flush>
              <ul className="p-1.5" role="list">{d.pages.map(([to, en, a]) => <li key={to}><AppLink to={to} className="flex items-center justify-between rounded-md px-2.5 py-2 text-[13px] hover:bg-muted"><span>{ar ? a : en}</span><span aria-hidden className="text-muted-foreground">{ar ? "‹" : "›"}</span></AppLink></li>)}</ul>
            </DxPanel>}
          </div>
        </DxSplit>
      </>}
      {tab === "documents" && <>
        <DxPanel title={t("Department documents", "مستندات القسم")} subtitle={t("Live record counts; each opens its native list", "أعداد السجلات الحالية؛ كل عنصر يفتح قائمته الأصلية")} flush attrs={{ "data-dept-documents": key }}>
          <ul className="grid grid-cols-1 gap-0.5 p-1.5 sm:grid-cols-2 xl:grid-cols-3" role="list">
            {d.docs.map((dt) => <li key={dt}><ListRef doctype={dt} className="flex items-center justify-between gap-2 rounded-md px-2.5 py-2 text-[13px] hover:bg-muted"><span className="truncate">{OWN.has(dt) ? (ar ? DOCTYPE_AR[dt] ?? dt : dt.replace(/^Digit /, "")) : dt}</span><span className="rounded-full bg-muted px-1.5 text-xs tabular-nums" data-no-i18n>{list(dt).length}</span></ListRef></li>)}
          </ul>
        </DxPanel>
        <h2 className="mb-2 mt-1 text-sm font-semibold text-foreground">{t(`Everything in ${name.toLowerCase()}`, `كل ما في ${name}`)}</h2>
        <ModuleDirectory moduleKey={key} />
      </>}
      {tab === "reports" && (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,18rem),1fr))] gap-3" data-dept-reports={key}>
          {d.reports.map((r) => { const rep = CONSTRUCTION_REPORTS.find((x) => x.name === r); return (
            <AppLink key={r} to={`reports/${encodeURIComponent(r)}`} className="flex flex-col rounded-lg border border-border bg-card p-4 shadow-sm transition-shadow hover:border-primary/45 hover:shadow-md">
              <span className="font-semibold text-foreground">{reportTitle(r, ar)}</span>
              <span className="mt-1 text-xs text-muted-foreground"><span data-no-i18n>{rep?.columns.length ?? 0}</span> {t("columns", "عموداً")}{rep && projectRequired(rep) ? ` · ${t("runs per project", "يعمل لكل مشروع")}` : ""}</span>
              <span className="mt-3 text-xs font-medium text-primary">{t("Open report", "فتح التقرير")} <Chev /></span>
            </AppLink>
          ); })}
          <AppLink to="reports" className="flex flex-col justify-center rounded-lg border border-dashed border-border p-4 text-sm font-medium text-primary hover:bg-muted">{t("All reports in the report centre", "كل التقارير في مركز التقارير")} <Chev /></AppLink>
        </div>
      )}
    </div>
  );
}
