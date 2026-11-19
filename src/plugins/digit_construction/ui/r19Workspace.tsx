/**
 * R19 workspace screen (/plugins/digit_construction/ws/<id>) — one renderer for all 36 contract workspaces, with
 * EXACTLY three in-content tabs:
 *   Dashboard          → the Core Dashboard Designer (src/components/dashboards) with the workspace's 4 figures
 *                        (r19/metrics.ts), its primary + secondary visual (r19/visuals.ts) and its work queues;
 *   Documents & work   → the Core Document Hub (src/components/hub/DocumentHub.tsx) over the contract documents,
 *                        department queues, workspace reports and the app screens that serve the workspace;
 *   Full reports       → the contract reports (present ones open the report page; missing ones are listed as gaps),
 *                        the primary report inline, report designs and the contract trace (features, screens).
 * State (tab, dashboard filters, hub register/search/status/open document, report project) lives in the URL, so Back
 * and reload restore it. Values come from the same permission-scoped read models as every other Construction screen.
 */
import { useMemo, type ReactNode, useState } from "react";
import { DateInput } from "@/components/form/DateInput";
import { Link, Navigate, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import type { PluginPageProps } from "@/plugins/pages";
import { adapter, useStoreVersion, type Doc } from "@/lib/adapter";
import { cachedMeta, indexQuery, loadMeta, reportsQuery } from "@/lib/catalog";
import { createDraft } from "@/lib/documentApi";
import { fmtNumber, riyal } from "@/lib/format";
import { currentUser, hasPerm } from "@/lib/session";
import { buildHub, makeHubIndex, treeViewsQuery, type HubEntry } from "@/lib/hub";
import { BLOCK_OPTIONS_FULL, blockCompareDate, blockWindow, registerDashboard, type DashboardDef, type WidgetData, type WidgetDef, type Width } from "@/lib/dashboards/registry";
import type { Bi } from "@/lib/dashboards/views";
import { DashboardDesigner } from "@/components/dashboards/DashboardDesigner";
import { ExperienceBlocks } from "@/components/experience/ExperienceBlocks";
import { payApprovals } from "./payColumns";
import { DocumentHub, type HubLink, type HubState, type QuickTile, type RegisterViewsSpec } from "@/components/hub/DocumentHub";
import { DxPanel, ExceptionList, TabBar, BandField, bandInput, Chev } from "@/components/digit/Experience";
import { APP, asOfRecords, policyDefined, projectTitle, today } from "../domain/data";
import { constructionProjects, queues, type Queue } from "../domain/queues";
import { canReadDoctype, canSeeRecord } from "../domain/access";
import { CONSTRUCTION_REPORTS } from "../reports";
import { DOCTYPE_AR } from "../schema";
import { KPIS, kpisOf, projectsOf, type CDrill, type Fig, type KpiDef, type Scope } from "../r19/metrics";
import { BudgetSheetPanel, CostRankPanel, EacEquationPanel, ForecastStripPanel, RemainingRings, SubcontractRings } from "./costScreens";
import { trendOf, UNIT_WORDS } from "../r19/trend";
import { groupRows } from "../r19/reportGroups";
import { deptVisual, visualsOf, SPLIT_VISUALS, VISUALS, type VisualDef } from "../r19/visuals";
import { DEPT_COMPOSITION } from "../r19/deptDashboards";
import { featuresOf, r19Workspace, reportContractsOf, screensOf, workspacesOfDept, R19_DEPTS, DEPT_TITLE, wsPath, type DeptNo, type R19Workspace } from "../r19/workspaces";
import { DEPT_SLUGS, deptBySlug, wsBySlug, wsRoute, WS_TABS, type WsTab } from "../r19/wsIndex";
import { AppLink, BAND, compact, Empty, Field, inputCls, OWN, PageHeader, PolicyGate, Section, STATE_AR, useCx, useDocRoute } from "./kit";
import { queueExceptions, severityText } from "./home";
import { CrewBoard, MachineBoard, SiteDayBoard } from "./boards";
import { ClaimsStagePanel } from "./claimsBoard";
import { ChangeStageBoard, TenderStageBoard } from "./stageBoards";
import { EtcPanel } from "./etcPanel";
import { colLabel, MOVE_AR, projectRequired, reportLink, reportResult, reportTitle, ReportTable, toCsv } from "./reports";
import { RankedBars } from "@/components/enterprise/kit";
import type { PluginReport } from "../../types";
import { UI_AR } from "../i18n";
import { VIS_AR } from "../r19/visualsAr";
import { REPORT_DESIGN_COVER } from "../r19/reportCrosswalk";
import { notifyError } from "./notify";
import { WorkflowActions } from "./workflowActions";
import { approvalsFor } from "../domain/inbox";
import { deptInsights, workspaceInsights } from "../r19/insights";
import { useDevMode } from "@/lib/mode";

type Tab = "dashboard" | "work" | "reports";
const TABS: Tab[] = ["dashboard", "work", "reports"];
const LEDGERS = new Set(["GL Entry", "Stock Ledger Entry", "Payment Ledger Entry"]);
const pick = (ar: boolean, b: Bi) => (ar ? b[1] : b[0]);
const str = (v: unknown) => (typeof v === "string" && v ? v : undefined);
export interface WsCtx { on: string; ar: boolean }

/* ------------------------------------------------------------------ dashboard contract ------------------------------------------------------------------ */
const scopeOf = (c: WsCtx, o: Record<string, string>): Scope => ({ on: c.on, ar: c.ar, company: o["company"] || undefined, project: o["project"] || undefined });
/** Arabic for fixed chart words (stage names, matrix columns, lanes, non-data cells); data labels (names, codes) stay as stored. */
const trWord = (s: string) => VIS_AR[s] ?? STATE_AR[s] ?? MOVE_AR[s] ?? UI_AR[s] ?? s;
/** English → Arabic titles of the construction projects (record content shown in Arabic on Arabic screens, display-only). */
function projectTitlesAr(): Map<string, string> { const m = new Map<string, string>(); for (const p of constructionProjects()) { const en = projectTitle(p, true), arT = projectTitle(p); if (en && arT && en !== arT) m.set(en, arT); } return m; }
function localize(d: WidgetData, ar: boolean): WidgetData {
  if (!ar) return d;
  const pt = projectTitlesAr(); const pa = (v: string) => { const x = pt.get(v); if (x) return x; let o = v; for (const [en, arT] of pt) if (o.includes(en)) o = o.split(en).join(arT); return o; };
  if (d.kind === "xy") return { ...d, points: d.points.map((p) => ({ ...p, label: pa(p.label) })) };
  if (d.kind === "series") return { ...d, points: d.points.map((p) => (p.data ? { ...p, label: pa(p.label) } : { ...p, label: trWord(p.label) })) };
  if (d.kind === "matrix") return { ...d, rowKeys: d.rowKeys.map((k) => trWord(pa(k))), colKeys: d.colKeys.map((k) => trWord(pa(k))) };
  if (d.kind === "rows") {
    const plain = new Set(d.columns.filter((c) => !c.data && !c.numeric).map((c) => c.key));
    return { ...d, ...(d.lanes ? { lanes: d.lanes.map(trWord) } : {}), rows: d.rows.map((r) => ({ ...r, ...(r.lane ? { lane: trWord(r.lane) } : {}), cells: Object.fromEntries(Object.entries(r.cells).map(([k, v0]) => { const v = typeof v0 === "string" ? pa(v0) : v0; return [k, typeof v === "string" && plain.has(k) ? trWord(v) : v]; })) })) };
  }
  return d;
}
function figText(f: Fig, ar: boolean) {
  const v = f.value ?? 0;
  if (f.unit === "money") return compact(v, ar);
  if (f.unit === "pct") return `${fmtNumber(v, 1)}%`;
  if (f.unit === "days") return `${fmtNumber(v, 0)} ${ar ? "يوم" : "d"}`;
  if (f.unit === "hours") return `${fmtNumber(v, 1)} ${ar ? "ساعة" : "h"}`;
  return fmtNumber(v, Number.isInteger(v) ? 0 : 2);
}
/** Scope words printed under a figure: the selected project, else the company, else every construction project in reach. */
function scopeWords(s: Scope): Bi {
  if (s.project) { const p = constructionProjects().find((x) => x.name === s.project); return [projectTitle(p, true) || s.project, projectTitle(p) || s.project]; }
  if (s.company) return [s.company, s.company];
  return ["All construction projects", "كل مشاريع المقاولات"];
}
function figData(f: Fig, ar: boolean, k?: KpiDef, s?: Scope, win?: { from?: string | undefined; cmp?: { date: string; label: string } | null | undefined }): WidgetData {
  const meta = s ? { asOf: s.on, scopeLabel: scopeWords(s), unitLabel: UNIT_WORDS[f.unit] } : {};
  if (f.status === "unavailable" || f.status === "pending" || f.status === "unconfigured") return { kind: "number", status: f.status, value: 0, ...(f.reason ? { reason: f.reason } : {}) };
  if (f.value === null) return { kind: "number", status: "unavailable", value: 0, reason: f.reason ?? ["No value for this scope.", "لا توجد قيمة لهذا النطاق."] };
  const tr = k && s ? trendOf(k, s, f.value, ar, win) : {};
  return { kind: "number", status: "ok", value: f.value, display: figText(f, ar), ...(f.sub ? { sub: [pick(ar, f.sub)] } : {}), ...(f.drill ? { drill: f.drill } : {}), ...meta, ...tr,
    ...(f.meter ? { meter: { pct: f.meter.pct, ...(f.meter.level ? { level: f.meter.level } : {}), label: pick(ar, f.meter.label) } } : {}),
    ...(f.quality ? { quality: f.quality, ...(f.qualityNote ? { qualityNote: f.qualityNote } : {}) } : {}) };
}
const wsQueues = (w: R19Workspace, s: { company?: string | undefined; project?: string | undefined }) => {
  const docs = new Set(w.docs.map((d) => d.doctype));
  return queues({ company: s.company, project: s.project }).filter((q) => docs.has(q.doctype) || (q.dept === w.nav && w.docs.length === 0));
};

// values are already permission-scoped (session-filtered lists); a widget is hidden only when none of its sources is readable
const readableAny = (dts: string[]) => () => dts.some((d) => canReadDoctype(d));
/** One workspace figure as a dashboard KPI block (vision layer: value, change against the comparison point, sparkline). */
function kpiWidget(k: KpiDef): WidgetDef<WsCtx> {
  return { id: k.id, version: 1, title: k.title, meaning: k.formula, sources: k.sources, shape: "number", defaultView: "kpi", size: { w: 3 }, group: ["Key figures", "المؤشرات الرئيسية"], readable: readableAny(k.sources),
    options: BLOCK_OPTIONS_FULL,
    // the block period reads the figure as of the window end (never after today); the comparison reads it at the compare date
    data: (c, o) => { try {
      const win = blockWindow(o, c.on); const on = win ? (win.to > c.on ? c.on : win.to) : c.on;
      const sc = { ...scopeOf(c, o), on };
      const cd = o["pcmp"] || win ? blockCompareDate(o, c.on) : undefined;
      const cmp = o["pcmp"] === "none" ? null : cd ? { date: cd, label: `${c.ar ? "عن" : "vs"} ${cd}` } : undefined;
      const f = on === c.on ? k.fig(sc) : asOfRecords(on, () => k.fig(sc));
      return figData(f, c.ar, k, sc, { from: win && win.from < on ? win.from : undefined, cmp }); } catch { return { kind: "number", status: "unavailable", value: 0, reason: ["This figure could not be computed from the records in scope.", "تعذر حساب هذا الرقم من السجلات ضمن النطاق."] }; } } };
}
/** One chart (workspace or department visual) as a dashboard block. */
function visWidget(v: VisualDef, id: string, w?: Width): WidgetDef<WsCtx> {
  return { id, version: 1, title: v.title, meaning: v.meaning, sources: v.sources, shape: v.shape, defaultView: v.view, size: { w: w ?? v.w, h: v.h }, group: ["Charts", "الرسوم البيانية"], readable: readableAny(v.sources), ...(v.options ? { options: v.options } : {}),
    data: (c, o) => localize(v.data(scopeOf(c, o), o), c.ar) };
}
/** Owner 2026-11-16 resource boards: weekly crews + labour budget line (08-01), equipment load (08-02), the site day by hour (site diary). */
const boardWidget = (id: string, title: Bi, meaning: Bi, sources: string[], render: (s: Scope) => ReactNode): WidgetDef<WsCtx> =>
  ({ id, version: 1, title, meaning, sources, shape: "panel", defaultView: "panel", size: { w: 12 }, group: ["Work", "العمل"], readable: readableAny(sources), render: (c, o) => render(scopeOf(c, o)) });
function boardsOf(w: R19Workspace): WidgetDef<WsCtx>[] {
  const out: WidgetDef<WsCtx>[] = [];
  if (w.id === "08-01") out.push(boardWidget("board:crews", ["Crews this week", "توزيع الطواقم بالأسبوع"], ["Row per crew, column per day: the attendance sheet by crew role, overtime per person in red, and under each day the hours, the labour estimate and its share of the crews' planned day.", "صف لكل طاقم وعمود لكل يوم: كشف الحضور حسب دور الطاقم، والإضافي لكل شخص بالأحمر، وتحت كل يوم الساعات وتقدير تكلفة العمالة ونسبتها من اليوم المخطط للطواقم."],
    ["Digit Crew", "Digit Field Attendance", "Digit Labor Rate"], (s) => <CrewBoard scope={s} on={s.on} />));
  if (w.id === "08-02") out.push(boardWidget("board:machines", ["Equipment load by day", "حِمل المعدات باليوم"], ["Row per machine, column per day: used hours of the available hours (green within, red over), the tasks the hours went to, idle and downtime, owned or rented.", "صف لكل معدة وعمود لكل يوم: الساعات المستخدمة من المتاحة (أخضر ضمنها، أحمر فوقها)، والمهام التي ذهبت إليها الساعات، والخمول والتعطل، مملوكة أو مستأجرة."],
    ["Digit Machinery", "Digit Machinery Usage", "Digit Equipment Assignment", "Digit Construction Settings"], (s) => <MachineBoard scope={s} on={s.on} />));
  if (w.docs.some((d) => d.doctype === "Digit Site Activity Report")) out.push(boardWidget("board:day", ["The site day hour by hour", "يوم العمل بالساعة"], ["Per person on the latest recorded site day: recorded hours against the scheduled standard day, overtime in red.", "لكل شخص في آخر يوم موقع مسجّل: الساعات المسجّلة مقابل اليوم القياسي المجدول، والإضافي بالأحمر."],
    ["Digit Field Attendance", "Digit Site Activity Report"], (s) => <SiteDayBoard scope={s} on={s.on} />));
  if (w.docs.some((d) => d.doctype === "Digit Client Certificate")) out.push(boardWidget("board:claims", ["Claim position", "موقف المستخلص"], ["Claimed awaiting a certificate, certified not invoiced, invoiced not collected and collected — for all client contracts in scope and per contract (the Project 360 bar).", "المطالَب بانتظار شهادة، والمعتمد غير المفوتر، والمفوتر غير المحصّل، والمحصّل — لكل عقود العملاء ضمن النطاق ولكل عقد (شريط ملف المشروع)."],
    ["Digit Client Contract", "Digit Client Claim", "Digit Client Certificate", "Sales Invoice"], (s) => <ClaimsStagePanel scope={s} />));
  // phase 4 C4-06: stage columns on the tenders and change events workspaces
  if (w.docs.some((d) => d.doctype === "Digit Tender")) out.push(boardWidget("board:tender-stages", ["Tenders by stage", "المناقصات حسب المرحلة"], ["One column per tender stage with count and estimated selling total; each card shows its age and time in the stage; ⚡ stages are set by the award decision.", "عمود لكل مرحلة مناقصة مع العدد وإجمالي سعر البيع التقديري؛ كل بطاقة تبين عمرها ومدة بقائها في المرحلة؛ مراحل ⚡ تُضبط من قرار الترسية."],
    ["Digit Tender", "Digit Tender Award Decision"], (s) => <TenderStageBoard scope={s} on={s.on} />));
  if (w.id === "06-03") out.push(boardWidget("board:etc", ["Edit the forecast (ETC)", "تعديل التوقع (المتبقي)"], ["Edit each line's ETC method, planned finish and note in a side panel while the budget bar (80 % / 100 % alerts) and the EAC by line follow the edit; saving recomputes the draft forecast.", "عدّل طريقة تقدير المتبقي وتاريخ الانتهاء المخطط والملاحظة لكل بند في لوحة جانبية بينما يتبع شريط الموازنة (تنبيه 80% و100%) والتكلفة المتوقعة لكل بند التعديل؛ الحفظ يعيد حساب مسودة التوقع."],
    ["Digit Cost Forecast Snapshot", "Digit Project Cost Budget"], (s) => <EtcPanel scope={s} on={s.on} />));
  // phase 5 cost screens: budget sheet + remaining rings (06-01), ranked cost codes (06-02), EAC equation + forecast strip (06-03), subcontract rings (05-02)
  const ps = (sc: Scope) => projectsOf(sc).map((p) => p.name);
  const COST = ["Digit Project Cost Budget", "Purchase Order", "Purchase Invoice", "Digit Subcontract Work Order", "Journal Entry"];
  if (w.id === "06-01") {
    out.push(boardWidget("board:budget-sheet", ["Budget sheet", "ورقة الموازنة"], ["Per cost code: budget, open commitment, actual and remaining, a use line under each row (amber at the alert setting, red past the limit) and the green remaining bar on top.", "لكل رمز تكلفة: الموازنة والالتزام المفتوح والفعلي والمتبقي، وخط استهلاك تحت كل صف (كهرماني عند التنبيه وأحمر بعد الحد) وشريط المتبقي الأخضر في الأعلى."], COST, (sc) => <BudgetSheetPanel projects={ps(sc)} asOf={sc.on} />));
    out.push(boardWidget("board:remaining", ["Remaining to spend by project", "المتبقي للصرف لكل مشروع"], ["One ring per project: actual, open commitment and what is left of the revised budget (most used first).", "حلقة لكل مشروع: الفعلي والالتزام المفتوح والمتبقي من الموازنة المعدلة (الأكثر استهلاكًا أولًا)."], COST, (sc) => <RemainingRings projects={ps(sc)} asOf={sc.on} />));
  }
  if (w.id === "06-02") out.push({ ...boardWidget("board:cost-rank", ["Cost codes by spend against budget", "رموز التكلفة حسب الإنفاق مقابل الموازنة"], ["Top 10 cost codes by committed + actual, each bar against its own budget; «Show all» opens the full list in the side panel.", "أعلى 10 رموز تكلفة بالملتزم + الفعلي، كل شريط مقابل موازنته؛ «عرض الكل» يفتح القائمة كاملة في اللوحة الجانبية."], COST, (sc) => <CostRankPanel projects={ps(sc)} asOf={sc.on} />), size: { w: 6 } });
  if (w.id === "06-03") {
    out.push(boardWidget("board:eac", ["Cost at completion", "التكلفة عند الإنجاز"], ["Actual + estimate to complete (open commitment included) = cost at completion; the variance against the revised budget is red with a minus sign when negative.", "الفعلي + المتبقي المتوقع (شاملًا الالتزام المفتوح) = التكلفة عند الإنجاز؛ والفرق عن الموازنة المعدلة أحمر بإشارة سالب عند السلب."], ["Digit Cost Forecast Snapshot", ...COST], (sc) => <EacEquationPanel projects={ps(sc)} asOf={sc.on} />));
    out.push(boardWidget("board:strip", ["Forecast — last 12 periods", "التوقع — آخر 12 فترة"], ["One cell per month and project: green when the forecast was approved, amber while a draft, grey when not started; a cell opens its forecast.", "خلية لكل شهر ومشروع: أخضر عند اعتماد التوقع، كهرماني وهو مسودة، رمادي إذا لم يبدأ؛ الخلية تفتح توقعها."], ["Digit Cost Forecast Snapshot"], (sc) => <ForecastStripPanel projects={ps(sc)} on={sc.on} />));
  }
  if (w.id === "05-02") out.push(boardWidget("board:sub-rings", ["Remaining to spend per subcontract", "المتبقي للصرف لكل مقاول باطن"], ["One ring per submitted work order: billed (gross) and what is left of its value, with certified, paid and retention listed apart.", "حلقة لكل أمر عمل معتمد: المستخلص (إجمالي) والمتبقي من قيمته، مع المعتمد والمدفوع والمحتجز كلٌّ على حدة."], ["Digit Subcontract Work Order", "Digit Subcontractor Bill", "Digit Measurement Book", "Payment Entry"], (sc) => <SubcontractRings projects={ps(sc)} />));
  if (w.docs.some((d) => d.doctype === "Digit Change Event")) out.push(boardWidget("board:change-stages", ["Change events by stage", "أحداث التغيير حسب المرحلة"], ["One column per workflow state with count and cost impact; each card shows its age and time in the stage; moves run the workflow action of your role.", "عمود لكل حالة في سير العمل مع العدد والأثر على التكلفة؛ كل بطاقة تبين عمرها ومدة بقائها في المرحلة؛ النقل يمر بإجراء سير العمل لدورك."],
    ["Digit Change Event"], (s) => <ChangeStageBoard scope={s} on={s.on} />));
  return out;
}
const CACHE = new Map<string, DashboardDef<WsCtx>>();
export function workspaceDashboard(w: R19Workspace): DashboardDef<WsCtx> {
  const hit = CACHE.get(w.id); if (hit) return hit;
  const widgets: WidgetDef<WsCtx>[] = [
    ...kpisOf(w.id).map(kpiWidget),
    ...visualsOf(w.id).map((v) => visWidget(v, `vis:${v.slot}`)),
    // Enterprise Visual Round 1 §8: the split card (solid posted · hatched pending) where the workspace has one
    ...(SPLIT_VISUALS[w.id] ? [visWidget(SPLIT_VISUALS[w.id]!, "vis:split")] : []),
    ...boardsOf(w),
    { id: "insights", version: 1, title: ["What changed and why", "ما الذي تغير ولماذا"], meaning: ["Computed sentences: figures that moved by 5% or more in 30 days with the project that moved most, the oldest waiting item, and figures that cannot be shown with the reason.", "جمل محسوبة: الأرقام التي تغيرت 5% أو أكثر خلال 30 يومًا مع المشروع الأكثر تغيرًا، وأقدم بند منتظر، والأرقام التي لا يمكن عرضها مع السبب."],
      sources: [...new Set(kpisOf(w.id).flatMap((k) => k.sources))], shape: "panel", defaultView: "panel", size: { w: 12 }, group: ["Insight", "التحليل"], render: (c, o) => <InsightPanel w={w} ar={c.ar} scope={scopeOf(c, o)} /> },
    { id: "decisions", version: 1, title: ["Decisions waiting for you", "قرارات بانتظارك"], meaning: ["Documents of this workspace waiting for a decision you may take now, oldest first, with the decision buttons of their workflow.", "مستندات مساحة العمل التي تنتظر قرارًا يمكنك اتخاذه الآن، الأقدم أولًا، مع أزرار القرار من سير العمل."],
      sources: w.docs.map((d) => d.doctype), shape: "panel", defaultView: "panel", size: { w: 12 }, group: ["Work", "العمل"], render: (c, o) => <DecisionPanel w={w} ar={c.ar} scope={scopeOf(c, o)} /> },
    { id: "queues", version: 1, title: ["Work queues", "قوائم العمل"], meaning: ["Department work queues for this workspace's documents (blocked, risks, then actions); each opens the documents it counts.", "قوائم عمل القسم لمستندات مساحة العمل (الموقوف ثم المخاطر ثم الإجراءات)؛ كل قائمة تفتح المستندات التي تعدّها."],
      sources: w.docs.map((d) => d.doctype), shape: "panel", defaultView: "panel", size: { w: 12 }, group: ["Work", "العمل"], render: (c, o) => <QueuePanel w={w} ar={c.ar} scope={scopeOf(c, o)} /> },
  ];
  const def = registerDashboard<WsCtx>({
    app: APP, id: `r19:${w.id}`, title: w.title, widgets, managerRoles: ["Digit Director", "Digit Project Manager"], companyRoles: ["Digit Director"], globalRoles: ["Digit Director"],
    filters: [
      { key: "company", label: ["Company", "الشركة"], choices: () => [...new Set(constructionProjects().map((p) => String(p["company"] ?? "")).filter(Boolean))].sort().map((c) => ({ value: c, label: c, data: true })) },
      { key: "project", label: ["Project", "المشروع"], choices: (c) => constructionProjects().map((p) => ({ value: p.name, label: projectTitle(p, !c.ar), data: true })) },
    ],
  });
  CACHE.set(w.id, def);
  return def;
}

function QueuePanel({ w, ar, scope }: { w: R19Workspace; ar: boolean; scope: Scope }) {
  const { t } = useCx();
  const qs = wsQueues(w, scope);
  return (
    <DxPanel title={<span>{t("Work queues", "قوائم العمل")} <span className="text-xs font-normal text-muted-foreground" data-no-i18n>({qs.reduce((s, q) => s + q.docs.length, 0)})</span></span>} subtitle={t("Ranked: blocked, risks, then actions", "مرتبة: الموقوف ثم المخاطر ثم الإجراءات")} attrs={{ "data-r19-queues": w.id }}>
      <ExceptionList items={queueExceptions(qs, ar, t)} empty={t("Nothing waiting in this workspace", "لا شيء بانتظار مساحة العمل هذه")} severityLabel={severityText(t)} />
    </DxPanel>
  );
}

const DUE_FIELDS = ["due_date", "response_due", "required_by", "reply_by", "target_date", "schedule_date", "expected_end_date", "valid_till", "valid_upto", "expiry_date", "end_date"];
const CLOSED = new Set(["Closed", "Completed", "Paid", "Cancelled", "Accepted", "Rejected", "Resolved", "Answered", "Approved", "Certified", "Settled", "Released", "Received", "Billed", "Done", "Superseded", "Void"]);
/** An open document whose first due date has passed (closed / cancelled documents never count). */
export function isOverdue(d: Record<string, unknown>, on = today()): boolean {
  if (Number(d["docstatus"]) === 2) return false;
  const st = String(d["workflow_state"] ?? d["status"] ?? "");
  if (CLOSED.has(st)) return false;
  const f = DUE_FIELDS.find((k) => typeof d[k] === "string" && d[k]);
  return !!f && String(d[f]).slice(0, 10) < on;
}
/** Approvals of this workspace's documents the session user may decide now, in the dashboard scope (oldest first). */
function wsDecisions(w: R19Workspace, scope: Scope) {
  const docs = new Set(w.docs.map((d) => d.doctype));
  return approvalsFor().filter((a) => docs.has(a.doctype) && (!scope.project || a.project === scope.project) && (!scope.company || a.company === scope.company));
}
function InsightPanel({ w, ar, scope }: { w: R19Workspace; ar: boolean; scope: Scope }) {
  const { t } = useCx();
  const link = useDrillLink();
  const waiting = wsDecisions(w, scope).map((a) => ({ name: a.name, title: [a.doctype, DOCTYPE_AR[a.doctype] ?? a.doctype] as Bi, days: a.age_days, drill: { kind: "doc", doctype: a.doctype, name: a.name } }));
  const items = workspaceInsights(w.id, scope, waiting);
  return (
    <DxPanel title={t("What changed and why", "ما الذي تغير ولماذا")} subtitle={t("Computed from the figures and queues above · 30 days", "محسوبة من الأرقام والقوائم أعلاه · 30 يومًا")} attrs={{ "data-r19-insights": w.id }}>
      <ul className="ek-insights space-y-1.5 text-sm">{items.map((i) => (
        <li key={i.key} className="flex items-start gap-2" data-insight={i.key} data-tone={i.tone}>
          <span aria-hidden className={`mt-1.5 inline-block size-2 shrink-0 rounded-full ${i.tone === "good" ? "bg-success" : i.tone === "risk" ? "bg-destructive" : "bg-info"}`} />
          <span>{i.drill ? link(i.drill, pick(ar, i.text), { className: "hover:underline" }) : pick(ar, i.text)}</span>
        </li>))}</ul>
    </DxPanel>
  );
}
function DecisionPanel({ w, ar, scope }: { w: R19Workspace; ar: boolean; scope: Scope }) {
  return <DecisionList attr={w.id} doctypes={new Set(w.docs.map((d) => d.doctype))} ar={ar} scope={scope} />;
}
function DecisionList({ attr, doctypes, ar, scope, max = 8 }: { attr: string; doctypes: Set<string>; ar: boolean; scope: Scope; max?: number }) {
  const { t } = useCx();
  const ver = useStoreVersion();
  const key = [...doctypes].join("|");
  const items = useMemo(() => approvalsFor().filter((a) => doctypes.has(a.doctype) && (!scope.project || a.project === scope.project) && (!scope.company || a.company === scope.company)), [key, scope.company, scope.project, ver]); // eslint-disable-line react-hooks/exhaustive-deps
  const link = useDrillLink();
  const shown = items.slice(0, max);
  return (
    <DxPanel title={<span>{t("Decisions waiting for you", "قرارات بانتظارك")} <span className="text-xs font-normal text-muted-foreground" data-no-i18n>({items.length})</span></span>} subtitle={t("Oldest first; each button runs the document's own workflow step", "الأقدم أولًا؛ كل زر ينفذ خطوة سير العمل الخاصة بالمستند")} flush attrs={{ "data-r19-decisions": attr }}>
      {shown.length ? <ul className="divide-y divide-border text-sm">{shown.map((a) => (
        <li key={`${a.doctype}:${a.name}`} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2" data-decision={a.name}>
          <span className="min-w-0 flex-1">
            <span className="block font-medium">{link({ kind: "doc", doctype: a.doctype, name: a.name }, <span data-no-i18n>{a.title || a.name}</span>, { className: "text-primary hover:underline" })}</span>
            <span className="block text-xs text-muted-foreground">{ar ? DOCTYPE_AR[a.doctype] ?? a.doctype : a.doctype} · {STATE_AR[a.state] && ar ? STATE_AR[a.state] : a.state} · {t(`${a.age_days} days`, `${a.age_days} يومًا`)}</span>
          </span>
          <WorkflowActions doctype={a.doctype} name={a.name} />
        </li>))}</ul> : <p className="px-3 py-4 text-sm text-muted-foreground">{t("No decision is waiting for you in this workspace.", "لا يوجد قرار بانتظارك في مساحة العمل هذه.")}</p>}
      {items.length > shown.length && <p className="border-t border-border px-3 py-2 text-xs"><AppLink to="inbox" className="font-medium text-primary hover:underline">{t(`All ${items.length} in the inbox`, `كل الـ ${items.length} في صندوق الوارد`)}</AppLink></p>}
    </DxPanel>
  );
}

/** Drill → link: native list / form (permission-checked, app context kept), report page with filters, or app page. */
function useDrillLink() {
  const route = useDocRoute();
  return (drill: unknown, children: ReactNode, attrs: Record<string, string> = {}): ReactNode => {
    const d = drill as CDrill | undefined;
    const cls = attrs["className"] ?? "hover:underline";
    const { className: _c, ...rest } = attrs;
    if (!d || typeof d !== "object") return children;
    if (d.kind === "list" || d.kind === "doc") {
      const r = route(d.doctype); if (!r) return children;
      if (d.kind === "doc") {
        if (!canSeeRecord(d.doctype, d.name)) return children;
        return <Link to="/app/$app/$doctype/$name" params={{ app: r.app, doctype: r.slug, name: d.name }} search={{ app: APP } as never} className={cls} {...rest} data-r19-drill="doc">{children}</Link>;
      }
      const search = { app: APP, ...(d.filters?.length ? { filters: JSON.stringify(d.filters) } : {}) };
      return <Link to="/app/$app/$doctype" params={{ app: r.app, doctype: r.slug }} search={search as never} className={cls} {...rest} data-r19-drill="list">{children}</Link>;
    }
    const to = d.kind === "report" ? reportLink(d.report, d.filters ?? {}) : d.to;
    const [path = "", qs] = to.split("?");
    return <Link to="/plugins/$name/$" params={{ name: APP, _splat: decodeURIComponent(path) }} search={(qs ? Object.fromEntries(new URLSearchParams(qs)) : {}) as never} className={cls} {...rest} data-r19-drill={d.kind}>{children}</Link>;
  };
}

/* ------------------------------------------------------------------ page ------------------------------------------------------------------ */
const TAB_OF: Record<WsTab, Tab> = { overview: "dashboard", documents: "work", reports: "reports" };
const SLUG_OF: Record<Tab, WsTab> = { dashboard: "overview", work: "documents", reports: "reports" };
/**
 * /construction/<department>/<workspace>/<tab> (owner ruling 2026-11-14). An older ws/<id>?tab=… address and a workspace
 * address without a tab open the same workspace at its canonical address (replace, so Back never returns to the old one).
 */
export function R19WorkspacePage({ params, path }: PluginPageProps) {
  const { t, ar } = useCx();
  const search = useRouterState({ select: (s) => s.location.search as Record<string, unknown> });
  const legacy = params["id"] ? r19Workspace(String(params["id"])) : undefined;
  const id = legacy?.id ?? wsBySlug(String(path ?? "").split("/")[0] ?? "", String(params["ws"] ?? ""));
  const w = id ? r19Workspace(id) : undefined;
  if (!w) return <div className="p-6"><PageHeader title={t("Workspace not found", "مساحة العمل غير موجودة")} /><Empty><AppLink to="ws">{t("All workspaces", "كل مساحات العمل")}</AppLink></Empty></div>;
  const tabSlug = params["tab"] as WsTab | undefined;
  if (legacy || !tabSlug || !WS_TABS.includes(tabSlug)) {
    const lt = legacy ? (search["tab"] === "work" ? "documents" : search["tab"] === "reports" ? "reports" : "overview") : "overview";
    const { tab: _t, ...rest } = search;
    return <Navigate to="/plugins/$name/$" params={{ name: APP, _splat: wsRoute(w.id, lt) }} search={rest as never} replace />;
  }
  return <WorkspaceBody key={w.id} w={w} ar={ar} tab={TAB_OF[tabSlug]} />;
}

function WorkspaceBody({ w, ar, tab }: { w: R19Workspace; ar: boolean; tab: Tab }) {
  const { t } = useCx();
  const dev = useDevMode();
  const search = useRouterState({ select: (s) => s.location.search as Record<string, unknown> });
  const nav = useNavigate();
  // a tab change is its own history entry (Back returns to the previous tab with its filters); filter changes replace
  const go = (patch: Record<string, string | undefined>) => {
    const { tab: nextTab, ...rest } = patch;
    const to = nextTab !== undefined ? SLUG_OF[(TABS.includes(nextTab as Tab) ? nextTab : "dashboard") as Tab] : SLUG_OF[tab];
    void nav({ to: "/plugins/$name/$", params: { name: APP, _splat: wsRoute(w.id, to) }, replace: nextTab === undefined, resetScroll: nextTab !== undefined,
      search: Object.fromEntries(Object.entries({ ...search, ...rest }).filter(([k, v]) => k !== "tab" && v !== undefined && v !== "")) as never });
  };
  const filters = { ...(str(search["f_company"]) ? { company: str(search["f_company"])! } : {}), ...(str(search["f_project"]) ? { project: str(search["f_project"])! } : {}) };
  const def = useMemo(() => workspaceDashboard(w), [w]);
  const link = useDrillLink();
  const openPolicies = w.policies.filter((p) => !policyDefined(p));
  const crumbTo = w.nav === "MGT" ? "" : `dept/${w.nav.toLowerCase()}`;
  const presentReports = w.reports.filter((r) => CONSTRUCTION_REPORTS.some((x) => x.name === r.name));
  return (
    <div className="w-full min-w-0" data-page="construction-r19-ws" data-r19-ws={w.id} data-r19-tab={tab}>
      <PageHeader title={pick(ar, w.title)} crumbs={[{ label: t("Workspaces", "مساحات العمل"), to: "ws" }, { label: pick(ar, w.deptTitle), to: crumbTo }]}
        band={{ question: pick(ar, w.question),
          basis: t("Figures and charts read this workspace's documents when the page opens; every figure, bar and queue opens the records behind it.", "تقرأ الأرقام والرسوم مستندات مساحة العمل عند فتح الصفحة؛ كل رقم وشريط وقائمة يفتح السجلات التي يقوم عليها."),
          meta: [
            { label: t("Department", "القسم"), value: pick(ar, w.deptTitle) },
            { label: t("Who uses it", "المستخدمون"), value: <span data-no-i18n>{pick(ar, w.rolesBi)}</span> },
            // contract ids (screen / feature counts) are preview diagnostics: Developer mode only
            ...(dev ? [{ label: t("Contract", "العقد"), value: <span data-no-i18n>{w.id} · {w.screens.length} SCR · {w.features.length} FT</span> }] : []),
            ...(openPolicies.length ? [{ label: t("Policy decisions pending", "قرارات سياسات معلقة"), value: <span data-no-i18n>{openPolicies.join(" · ")}</span> }] : []),
          ],
          actions: <>{w.tools.map(([to, en, a], i) => <AppLink key={to} to={to} className={i === 0 ? BAND.primary : BAND.secondary}>{ar ? a : en}</AppLink>)}</> }} />
      <TabBar ariaLabel={t(`${pick(ar, w.title)} sections`, `أقسام ${pick(ar, w.title)}`)} value={tab} onChange={(k) => go({ tab: k })} tabs={[
        { key: "dashboard", label: t("Overview", "نظرة عامة") },
        { key: "work", label: t("Documents & work", "المستندات والعمل"), count: w.docs.length },
        { key: "reports", label: t("Full reports", "التقارير الكاملة"), count: presentReports.length },
      ]} />
      {tab === "dashboard" && <>
        <PolicyGate keys={w.policies} />
        <DashboardDesigner def={def} ctx={{ on: today(), ar }} link={link} company={filters.company}
          filterValues={filters} onFilters={(n) => go({ f_company: n["company"], f_project: n["project"] })} />
        <ExperienceBlocks app={APP} screen={`${APP}.ws.${w.id}`} company={filters.company} />
      </>}
      {tab === "work" && <WorkTab w={w} ar={ar} search={search} go={go} company={filters.company} project={filters.project} />}
      {tab === "reports" && <ReportsTab w={w} ar={ar} search={search} go={go} />}
    </div>
  );
}

/* ------------------------------------------------------------------ Documents & work ------------------------------------------------------------------ */
function WorkTab({ w, ar, search, go, company, project }: { w: R19Workspace; ar: boolean; search: Record<string, unknown>; go: (p: Record<string, string | undefined>) => void; company?: string | undefined; project?: string | undefined }) {
  const { t, user } = useCx();
  const idx = useQuery(indexQuery); const reps = useQuery(reportsQuery); const trees = useQuery(treeViewsQuery);
  const nav = useNavigate(); const route = useDocRoute();
  if (!idx.data || !reps.data || !trees.data) return <p className="text-sm text-muted-foreground" role="status" data-hub-loading>{t("Loading workspace documents…", "جارٍ تحميل مستندات مساحة العمل…")}</p>;
  const installed = (dt: string) => !!idx.data!.find((e) => e.name === dt);
  const qs = wsQueues(w, { company, project });
  const entries: HubEntry[] = [
    ...w.docs.map((d) => ({ label: d.doctype, target: { kind: "doctype" as const, doctype: d.doctype }, source: `R19 ${w.id}` })),
    ...qs.map((q) => ({ label: ar ? q.ar : q.en, target: { kind: "doctype" as const, doctype: q.doctype, filters: q.filters as [string, string, string][] }, group: (q.severity === "action" ? "daily" : "approvals") as HubEntry["group"], source: `queue:${q.key}` })),
    ...w.reports.filter((r) => CONSTRUCTION_REPORTS.some((x) => x.name === r.name)).map((r) => ({ label: r.name, target: { kind: "app" as const, key: JSON.stringify({ to: reportLink(r.name) }) }, group: "reports" as const, source: `R19 ${w.id}` })),
    ...w.tools.map(([to, en, a]) => ({ label: ar ? a : en, target: { kind: "app" as const, key: JSON.stringify({ to }) }, group: "app-screens" as const, source: "app screen" })),
  ];
  const ix = makeHubIndex(idx.data, reps.data, trees.data, { app: () => true });
  const model = buildHub(entries, ix);
  const missing = model.dropped.filter((d) => d.entry.target.kind === "doctype" && !installed((d.entry.target as { doctype: string }).doctype));
  const quick: QuickTile[] = qs.slice(0, 4).map((q: Queue) => ({ id: q.key, label: [q.en, q.ar], hint: q.severity === "blocked" ? ["Blocked by an owner policy decision", "موقوف بانتظار قرار سياسة"] : q.severity === "risk" ? ["Risk — review first", "خطر — راجعه أولًا"] : ["Waiting for the next step", "بانتظار الخطوة التالية"],
    doctype: q.doctype, status: !canReadDoctype(q.doctype) ? "denied" : q.docs.length ? "ok" : "empty", count: q.docs.length, filters: q.filters as never, tone: q.severity === "action" ? "action" : "risk", canCreate: false }));
  const state: HubState = { dt: str(search["hub_dt"]), q: str(search["hub_q"]), st: str(search["hub_st"]), doc: str(search["hub_doc"]), v: str(search["hub_v"]), g: str(search["hub_g"]) };
  const onState = (p: Partial<HubState>) => go({ ...("dt" in p ? { hub_dt: p.dt } : {}), ...("q" in p ? { hub_q: p.q } : {}), ...("st" in p ? { hub_st: p.st } : {}), ...("doc" in p ? { hub_doc: p.doc } : {}), ...("v" in p ? { hub_v: p.v } : {}), ...("g" in p ? { hub_g: p.g } : {}) });
  // register views: «Waiting on me» = a workflow decision the user may take now (the inbox rule); «Overdue» = a due date passed on an open document, or listed by an overdue queue
  const waiting = new Set(approvalsFor(user).map((a) => `${a.doctype}|${a.name}`));
  const overdueQ = new Set(qs.filter((q) => /overdue|late|expired|aging/i.test(q.key)).flatMap((q) => q.docs.map((d) => `${q.doctype}|${d.name}`)));
  const views: RegisterViewsSpec = {
    waitingOnMe: (dt, d) => waiting.has(`${dt}|${d.name}`),
    overdue: (dt, d) => overdueQ.has(`${dt}|${d.name}`) || isOverdue(d),
    groupLabel: (f, v) => (f === "project" ? <bdi data-no-i18n>{projectTitle(constructionProjects().find((p) => p.name === v), !ar) || v}</bdi> : <span>{ar ? STATE_AR[v] ?? v : v}</span>),
  };
  // C4-02 / C4-04: claim bar + approval · payment · payout columns, decisions and the «تحتاج مراجعة» view on claims, certificates, subcontractor bills and change orders
  // names, not codes (R5): a row without its own title shows its customer / supplier name
  const rowTitle = (_dt: string, d: Doc): string | undefined => { if (d["title"]) return undefined; const c = d["customer"] ? String(adapter.get("Customer", String(d["customer"]))?.["customer_name"] ?? "") : ""; if (c) return c; const sp = d["subcontractor"] ?? d["supplier"]; return sp ? String(adapter.get("Supplier", String(sp))?.["supplier_name"] ?? "") || undefined : undefined; };
  const approvals = payApprovals(ar, user, (d) => <span data-no-i18n>{d.name}{d["project"] ? ` · ${projectTitle(constructionProjects().find((p) => p.name === d["project"]), !ar) || String(d["project"])}` : ""}</span>);
  const newDoc = async (doctype: string) => {
    const meta = await loadMeta(idx.data!, doctype);
    if (!meta) { notifyError(`${doctype}: metadata unavailable`); return; }
    const r = createDraft(meta); if (!r.doc) { notifyError(r.errors.join("\n")); return; }
    const defaults: Record<string, unknown> = {};
    if (project && meta.fields.some((f) => f.fieldname === "project")) defaults["project"] = project;
    if (company && meta.fields.some((f) => f.fieldname === "company") && !r.doc["company"]) defaults["company"] = company;
    adapter.insertDocQuiet(doctype, { ...r.doc, ...defaults }); adapter.flush();
    const where = route(doctype); if (where) void nav({ to: "/app/$app/$doctype/$name", params: { app: where.app, doctype: where.slug, name: r.doc.name }, search: { app: APP } as never });
  };
  const link = (to: HubLink, children: ReactNode, attrs: Record<string, string> = {}): ReactNode => {
    if (to.kind === "new") return <button type="button" onClick={() => void newDoc(to.doctype)} {...attrs} data-new-doc={to.doctype}>{children}</button>;
    if (to.kind === "list" || to.kind === "doc" || to.kind === "print") {
      const r = route(to.doctype); if (!r) return <span {...attrs}>{children}</span>;
      if (to.kind === "print") return <Link to="/printview" search={{ doctype: to.doctype, name: to.name } as never} {...attrs}>{children}</Link>;
      if (to.kind === "doc") return canSeeRecord(to.doctype, to.name) ? <Link to="/app/$app/$doctype/$name" params={{ app: r.app, doctype: r.slug, name: to.name }} search={{ app: APP } as never} {...attrs}>{children}</Link> : <span {...attrs}>{children}</span>;
      const sp: Record<string, string> = { app: APP }; if (to.filters?.length) sp["filters"] = JSON.stringify(to.filters); if (to.view) sp["view"] = to.view;
      return <Link to="/app/$app/$doctype" params={{ app: r.app, doctype: r.slug }} search={sp as never} {...attrs}>{children}</Link>;
    }
    if (to.kind === "report") return <Link to="/report/$name" params={{ name: to.report }} {...attrs}>{children}</Link>;
    if (to.kind === "page") return <Link to="/page/$name" params={{ name: to.page }} {...attrs}>{children}</Link>;
    try { const a = JSON.parse(to.key) as { to: string }; return <AppLink to={a.to} className={attrs["className"]}>{children}</AppLink>; } catch { return <span {...attrs}>{children}</span>; }
  };
  const access = (e: HubEntry) => (e.target.kind === "doctype" || e.target.kind === "tree" ? (canReadDoctype(e.target.doctype) ? "ok" as const : "denied" as const) : "ok" as const);
  const canCreate = (dt: string) => { if (LEDGERS.has(dt) || !installed(dt)) return false; const m = cachedMeta(dt); return !!m && !m.istable && !m.issingle && hasPerm(m, "create", undefined, user); };
  const labelOf = (text: string) => {
    if (OWN.has(text)) return <span>{ar ? DOCTYPE_AR[text] ?? text.replace(/^Digit /, "") : text.replace(/^Digit /, "")}</span>;
    if (CONSTRUCTION_REPORTS.some((r) => r.name === text)) return <span>{reportTitle(text, ar)}</span>;
    return <span>{text}</span>;
  };
  return (
    <div data-r19-work={w.id}>
      <DocumentHub ar={ar} model={model} quick={quick} registers={w.docs.map((d) => d.doctype).filter((d) => installed(d) && !idx.data!.find((e) => e.name === d)?.istable)} company={company} user={user}
        state={state} onState={onState} link={link} access={access} canCreate={canCreate} label={labelOf} views={views} approvals={approvals} rowTitle={rowTitle}
        reportsLink={<AppLink to={wsPath(w.id, "reports")} className="text-primary hover:underline">{t("All reports of this workspace", "كل تقارير مساحة العمل")} <Chev /></AppLink>}
        afterQuick={missing.length ? (
          <section className="panel p-3 text-sm" data-r19-missing-docs>
            <h3 className="mb-1 font-semibold">{t("Documents in the design not in the supplied source", "مستندات في التصميم غير موجودة في المصدر المورد")}</h3>
            <p className="mb-2 text-xs text-muted-foreground">{t("The workspace contract names these documents, but neither this app nor the supplied DIGIT source defines them; they appear once the owner adds them to the source.", "يذكر عقد مساحة العمل هذه المستندات، لكن لا يعرّفها هذا التطبيق ولا مصدر DIGIT المورد؛ تظهر عندما يضيفها المالك إلى المصدر.")}</p>
            <ul className="flex flex-wrap gap-2">{missing.map((m) => { const dt = (m.entry.target as { doctype: string }).doctype; return <li key={dt} className="chip bg-muted" data-r19-missing-doc={dt}>{ar ? w.docs.find((d) => d.doctype === dt)?.ar ?? dt : dt}</li>; })}</ul>
          </section>
        ) : undefined} />
    </div>
  );
}

/* ------------------------------------------------------------------ Full reports ------------------------------------------------------------------ */
function ReportsTab({ w, ar, search, go }: { w: R19Workspace; ar: boolean; search: Record<string, unknown>; go: (p: Record<string, string | undefined>) => void }) {
  const { t } = useCx();
  const present = w.reports.map((r) => ({ ...r, rep: CONSTRUCTION_REPORTS.find((x) => x.name === r.name) }));
  const primary = present.find((r) => r.rep)?.rep;
  const designs = reportContractsOf(w);
  const feats = featuresOf(w); const scr = screensOf(w);
  return (
    <div className="space-y-4" data-r19-reports={w.id}>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,18rem),1fr))] gap-3">
        {present.map((r) => r.rep ? (
          <AppLink key={r.name} to={reportLink(r.name)} className="flex flex-col rounded-lg border border-border bg-card p-4 shadow-sm transition-shadow hover:border-primary/45 hover:shadow-md">
            <span className="font-semibold text-foreground" data-r19-report={r.name}>{reportTitle(r.name, ar)}</span>
            <span className="mt-1 text-xs text-muted-foreground">{ar ? r.meaning : <span data-no-i18n>{r.rep.columns.length}</span>}{ar ? "" : ` columns${projectRequired(r.rep) ? " · runs per project" : ""}`}</span>
            <span className="mt-3 text-xs font-medium text-primary">{t("Open report", "فتح التقرير")} <Chev /></span>
          </AppLink>
        ) : (
          <div key={r.name} className="flex flex-col rounded-lg border border-dashed border-border bg-card p-4" data-r19-report-gap={r.name}>
            <span className="font-semibold text-foreground">{ar ? r.ar : r.name}</span>
            <span className="mt-1 text-xs text-muted-foreground">{t("Not available: the supplied source has no data for this report (listed as a gap).", "غير متاح: لا يحتوي المصدر المورد على بيانات لهذا التقرير (مُدرج كفجوة).")}</span>
          </div>
        ))}
        <AppLink to="reports" className="flex flex-col justify-center rounded-lg border border-dashed border-border p-4 text-sm font-medium text-primary hover:bg-muted">{t("All reports in the report centre", "كل التقارير في مركز التقارير")} <Chev /></AppLink>
      </div>
      {primary && <ReportWorkbench w={w} ar={ar} search={search} go={go} reports={present.flatMap((r) => (r.rep ? [r.rep] : []))} />}
      {designs.length > 0 && (
        <DxPanel title={t("Report designs for this workspace's features", "تصاميم التقارير لميزات مساحة العمل")} subtitle={t("From the design contract; only a design with a matching built report opens one.", "من عقد التصميم؛ يفتح التصميم تقريرًا فقط إذا وُجد تقرير مبني مطابق.")} flush attrs={{ "data-r19-report-designs": w.id }}>
          <ul className="divide-y divide-border text-sm">{designs.map((d) => { const built = CONSTRUCTION_REPORTS.find((r) => r.name === d.en); const cov = built ? undefined : REPORT_DESIGN_COVER[d.en];
            const partial = cov?.cover === "PARTIAL" && CONSTRUCTION_REPORTS.some((r) => r.name === cov.report) ? cov : undefined; return (
            <li key={`${d.ft}:${d.en}`} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-3 py-2" data-r19-design={built ? "built" : partial ? "partial" : "gap"}>
              <span className="font-medium">{built ? <AppLink to={reportLink(d.en)}>{ar ? d.ar : d.en}</AppLink> : ar ? d.ar : d.en}</span>
              <span className="text-xs text-muted-foreground" data-no-i18n>{d.ft}</span>
              {ar && d.grain && <span className="text-xs text-muted-foreground">المستوى: {d.grain}</span>}
              <span className={`chip ms-auto ${built ? "bg-success/15 text-success-text" : partial ? "bg-warning/15 text-warning-text" : "bg-muted text-muted-foreground"}`}>{built ? t("Built", "مبني") : partial ? t("Partly covered", "مغطى جزئيًا") : t("Design only", "تصميم فقط")}</span>
              {cov && <span className="basis-full text-xs text-muted-foreground">{partial ? <>{t("Closest built report:", "أقرب تقرير مبني:")} <AppLink to={reportLink(partial.report)} className="font-medium">{reportTitle(partial.report, ar)}</AppLink> — </> : null}{pick(ar, cov.note)}</span>}
            </li>); })}</ul>
        </DxPanel>
      )}
      <details className="panel p-3 text-sm" data-r19-trace={w.id}>
        <summary className="cursor-pointer font-semibold">{t("Contract trace: features and screens", "تتبع العقد: الميزات والشاشات")} <span className="text-xs font-normal text-muted-foreground" data-no-i18n>({feats.length} FT · {scr.length} SCR)</span></summary>
        <div className="mt-2 grid gap-4 lg:grid-cols-2">
          <ul className="space-y-1">{feats.map((f) => <li key={f.id} className="flex flex-wrap gap-x-2"><span className="tabular-nums text-muted-foreground" data-no-i18n>{f.id}</span><span>{ar ? f.ar : f.en}</span><span className="text-xs text-muted-foreground" data-no-i18n>{f.status} · {f.wave}</span></li>)}</ul>
          <ul className="space-y-1">{scr.map((s) => <li key={s.id} className="flex flex-wrap gap-x-2"><span className="tabular-nums text-muted-foreground" data-no-i18n>{s.id}</span><span>{s.ar}</span><span className="text-xs text-muted-foreground" data-no-i18n>{s.layout}</span></li>)}</ul>
        </div>
      </details>
    </div>
  );
}

/* ------------------------------------------------------------------ Full reports: in-tab report workbench ------------------------------------------------------------------ */
const NUMERIC = new Set(["Currency", "Float", "Int", "Percent"]);
/**
 * One report of the workspace at a time (rpt in the URL): company / project / as-of / grouping filters, a chart of the
 * grouped totals, the table with column totals, export within the user's export right, and the full report page with the
 * same filters. Every value is the report's own rows (reportResult), read as of the chosen date (asOfRecords); drilling a
 * cell opens the document and Back returns to this tab with the same filters, because all of it lives in the URL.
 */
function ReportWorkbench({ w, ar, search, go, reports }: { w: R19Workspace; ar: boolean; search: Record<string, unknown>; go: (p: Record<string, string | undefined>) => void; reports: PluginReport[] }) {
  const { t } = useCx();
  const report = reports.find((r) => r.name === str(search["rpt"])) ?? reports[0]!;
  const needsProject = projectRequired(report);
  const all = constructionProjects();
  const companies = [...new Set(all.map((p) => String(p["company"] ?? "")).filter(Boolean))].sort();
  const company = companies.includes(str(search["rcompany"]) ?? "") ? str(search["rcompany"])! : "";
  const scoped = all.filter((p) => !company || p["company"] === company);
  const asked = str(search["project"]) ?? "";
  const project = scoped.some((p) => p.name === asked) ? asked : needsProject ? scoped[0]?.name ?? "" : "";
  const on = /^\d{4}-\d{2}-\d{2}$/.test(str(search["asof"]) ?? "") ? str(search["asof"])! : "";
  const groupCols = report.columns.filter((c) => !NUMERIC.has(c.fieldtype ?? "") && c.fieldtype !== "Date");
  const group = groupCols.some((c) => c.fieldname === str(search["rgroup"])) ? str(search["rgroup"])! : "";
  const measure = report.columns.find((c) => c.fieldtype === "Currency") ?? report.columns.find((c) => NUMERIC.has(c.fieldtype ?? "") && c.fieldtype !== "Percent");
  const filters: Record<string, unknown> = { company: company || undefined, project: project || undefined };
  let rows: Record<string, unknown>[] = []; let error = "";
  if (!needsProject || project) { try { rows = (on ? asOfRecords(on, () => reportResult(report, filters)) : reportResult(report, filters)).rows; } catch (e) { error = (e as Error).message; } }
  const meta = cachedMeta(report.ref_doctype);
  const canExport = !!meta && hasPerm(meta, "export");
  const groupLabel = (v: string) => { const c = groupCols.find((x) => x.fieldname === group); if (c?.options === "Project") return projectTitle(all.find((p) => p.name === v), !ar) || v; return v ? (ar ? STATE_AR[v] ?? DOCTYPE_AR[v] ?? v : v) : t("(none)", "(بدون)"); };
  const grouped = group ? groupRows(rows, group, measure?.fieldname) : [];
  const download = () => {
    const blob = new Blob(["\ufeff" + toCsv(report, rows)], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `${report.name}${project ? ` - ${project}` : ""}${on ? ` - ${on}` : ""}.csv`; a.click(); URL.revokeObjectURL(a.href);
  };
  const sel = inputCls;
  return (
    <Section title={reportTitle(report.name, ar)} actions={<span className="flex flex-wrap items-center gap-2">
      {canExport && <button type="button" className="btn-ghost min-h-11 text-xs" onClick={download} data-r19-report-export>{t("Export CSV", "تصدير CSV")}</button>}
      <ScheduleEmail report={report.name} filters={{ ...(company ? { company } : {}), ...(project ? { project } : {}) }} />
      <AppLink to={reportLink(report.name, { ...(company ? { company } : {}), ...(project ? { project } : {}) })} className="font-medium">{t("Open full report", "فتح التقرير كاملًا")}</AppLink></span>}>
      <div className="mb-3 flex flex-wrap items-end gap-2" role="group" aria-label={t("Report filters", "مرشحات التقرير")} data-r19-report-filters={w.id}>
        {reports.length > 1 && <Field label={t("Report", "التقرير")}><select className={sel} value={report.name} onChange={(e) => go({ rpt: e.target.value, rgroup: undefined })} data-r19-report-pick>{reports.map((r) => <option key={r.name} value={r.name}>{reportTitle(r.name, ar)}</option>)}</select></Field>}
        {companies.length > 0 && <Field label={t("Company", "الشركة")}><select className={sel} value={company} onChange={(e) => go({ rcompany: e.target.value || undefined })} data-r19-report-company><option value="">{t("All", "الكل")}</option>{companies.map((c) => <option key={c} value={c} data-no-i18n>{c}</option>)}</select></Field>}
        <Field label={t("Project", "المشروع")}><select className={sel} value={project} onChange={(e) => go({ project: e.target.value || undefined })} data-r19-report-project>{!needsProject && <option value="">{t("All", "الكل")}</option>}{scoped.map((p) => <option key={p.name} value={p.name} data-no-i18n>{projectTitle(p, !ar)}</option>)}</select></Field>
        <Field label={t("As of", "حتى تاريخ")}><DateInput className={sel} value={on} max={today()} onChange={(e) => go({ asof: e.target.value || undefined })} data-r19-report-asof /></Field>
        {groupCols.length > 0 && <Field label={t("Group by", "التجميع حسب")}><select className={sel} value={group} onChange={(e) => go({ rgroup: e.target.value || undefined })} data-r19-report-group><option value="">{t("No grouping", "بدون تجميع")}</option>{groupCols.map((c) => <option key={c.fieldname} value={c.fieldname}>{colLabel(c.label, ar)}</option>)}</select></Field>}
        <span className="ms-auto text-xs text-muted-foreground" data-r19-report-scope>{on ? t(`As of ${on}`, `حتى ${on}`) : t("As of today", "حتى اليوم")} · <bdi data-no-i18n>{rows.length}</bdi> {t("rows", "صفًا")}</span>
      </div>
      {error ? <Empty>{t("The report could not run: ", "تعذر تشغيل التقرير: ")}<span data-no-i18n>{error}</span></Empty>
        : needsProject && !project ? <Empty>{t("No construction project is available to you.", "لا يوجد مشروع مقاولات متاح لك.")}</Empty> : <>
        {group && grouped.length > 0 && (
          <div className="mb-3 grid gap-3 lg:grid-cols-2" data-r19-report-groups={group}>
            <div className="rounded-lg border border-border p-3" data-r19-report-chart>
              <p className="mb-2 text-xs text-muted-foreground">{measure ? `${colLabel(measure.label, ar)} — ${t("by", "حسب")} ${colLabel(groupCols.find((c) => c.fieldname === group)!.label, ar)}` : t("Rows by group", "الصفوف حسب المجموعة")}</p>
              <RankedBars ar={ar} max={10} data={grouped.map(([k, g]) => ({ key: k || "_", label: groupLabel(k), value: measure ? g.v : g.n, data: true, cross: undefined }))} fmt={(v) => (measure?.fieldtype === "Currency" ? compact(v, ar) : fmtNumber(v, 0))} />
            </div>
            <table className="w-full self-start text-sm" data-r19-report-group-table>
              <thead><tr className="text-xs text-muted-foreground"><th className="py-1 text-start font-medium">{colLabel(groupCols.find((c) => c.fieldname === group)!.label, ar)}</th><th className="py-1 text-end font-medium">{t("Rows", "الصفوف")}</th>{measure && <th className="py-1 text-end font-medium">{colLabel(measure.label, ar)}</th>}</tr></thead>
              <tbody>{grouped.map(([k, g]) => <tr key={k} className="border-t border-border"><td className="py-1"><bdi data-no-i18n>{groupLabel(k)}</bdi></td><td className="py-1 text-end tabular-nums" data-no-i18n>{g.n}</td>{measure && <td className="py-1 text-end tabular-nums" data-no-i18n>{fmtNumber(g.v, 2)}</td>}</tr>)}</tbody>
              <tfoot><tr className="border-t-2 border-border font-semibold" data-r19-report-group-total><td className="py-1">{t("Total", "الإجمالي")}</td><td className="py-1 text-end tabular-nums" data-no-i18n>{rows.length}</td>{measure && <td className="py-1 text-end tabular-nums" data-no-i18n>{fmtNumber(grouped.reduce((s, [, g]) => s + g.v, 0), 2)}</td>}</tr></tfoot>
            </table>
          </div>
        )}
        <ReportTable report={report} filters={filters} rows={rows} pageSize={15} />
      </>}
    </Section>
  );
}

/* ------------------------------------------------------------------ index of the 36 workspaces ------------------------------------------------------------------ */
/**
 * Pro parity (scheduled report e-mail): opens a new Auto Email Report for this report and its current filters, owned by the
 * session user, weekly HTML by default; the shared Auto Email Report form (Download / Send Now, provider in Administration)
 * takes it from there. Shown only with create permission on Auto Email Report.
 */
function ScheduleEmail({ report, filters }: { report: string; filters: Record<string, string> }) {
  const { t } = useCx(); const docRoute = useDocRoute(); const nav = useNavigate();
  const [err, setErr] = useState("");
  const meta = cachedMeta("Auto Email Report");
  if (!meta || !hasPerm(meta, "create")) return null;
  const go = () => {
    const r = createDraft(meta, { mapped: { report, user: currentUser(), filters: JSON.stringify(filters), format: "HTML", frequency: "Weekly", enabled: 1, no_of_rows: 100 } });
    if (!r.doc) { setErr(r.errors[0] ?? ""); return; }
    const to = docRoute("Auto Email Report"); if (to) void nav({ to: "/app/$app/$doctype/$name", params: { app: to.app, doctype: to.slug, name: r.doc.name } });
  };
  return <><button type="button" className="btn-ghost min-h-11 text-xs" onClick={go} data-r19-report-schedule>{t("Schedule e-mail", "جدولة إرسال بالبريد")}</button>{err && <span role="alert" className="text-xs text-destructive">{err}</span>}</>;
}

export function R19IndexPage() {
  const { t, ar } = useCx();
  return (
    <div className="w-full min-w-0" data-page="construction-r19-index">
      <PageHeader title={t("Workspaces", "مساحات العمل")} subtitle={t("Nine departments, four workspaces each; every workspace has a dashboard, its documents and work, and its full reports.", "تسعة أقسام بأربع مساحات عمل لكل منها؛ لكل مساحة لوحة مؤشرات ومستنداتها وأعمالها وتقاريرها الكاملة.")} />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-2 xl:grid-cols-3">
        {R19_DEPTS.map((d) => (
          <Section key={d} title={pick(ar, DEPT_TITLE[d])}>
            <ul className="space-y-1.5" role="list">{workspacesOfDept(d).map((w) => (
              <li key={w.id}><AppLink to={wsPath(w.id)} className="flex items-baseline gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted"><span className="tabular-nums text-xs text-muted-foreground" data-no-i18n>{w.id}</span><span className="font-medium text-primary">{pick(ar, w.title)}</span><span className="ms-auto"><Chev /></span></AppLink></li>
            ))}</ul>
          </Section>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ department page (/construction/<department>) ------------------------------------------------------------------ */
/** The department's four workspaces with their question, their first key figures and the three tabs; figures are the workspace KPI slots themselves. */
/* ------------------------------------------------------------------ department dashboards ------------------------------------------------------------------ */
const DCACHE = new Map<string, DashboardDef<WsCtx>>();
const deptDocs = (d: DeptNo) => new Set(workspacesOfDept(d).flatMap((w) => w.docs.map((x) => x.doctype)));
/**
 * The department dashboard (owner UX depth round 2026-11-14): the approved prototype composition (r19/deptDashboards.ts)
 * on the shared Dashboard Designer — headline figures with change, the department's chosen charts, insight sentences
 * with their cause, the decisions waiting with their workflow buttons, then the four workspaces. Customisable like
 * every Designer dashboard (add / hide / move / resize, per user / role / company), never changing a figure.
 */
export function deptDashboard(d: DeptNo): DashboardDef<WsCtx> {
  const hit = DCACHE.get(d); if (hit) return hit;
  const comp = DEPT_COMPOSITION[d];
  const ks = comp.kpis.map((id) => KPIS.find((k) => k.id === id)).filter((k): k is KpiDef => !!k);
  const docsOf = [...deptDocs(d)];
  const blocks = comp.blocks.flatMap(([id, wd]): WidgetDef<WsCtx>[] => {
    if (id === "insights") return [{ id: "insights", version: 1, title: ["What you should know today", "ما يجب أن تعرفه اليوم"], meaning: ["Computed sentences from the department's headline figures: a figure that moved by 5% or more in 30 days with the project that moved most, the oldest decision waiting, and figures that cannot be shown with the reason.", "جمل محسوبة من أرقام القسم الرئيسية: رقم تغير 5% أو أكثر خلال 30 يومًا مع المشروع الأكثر تغيرًا، وأقدم قرار منتظر، والأرقام التي لا يمكن عرضها مع السبب."],
      sources: [...new Set(ks.flatMap((k) => k.sources))], shape: "panel", defaultView: "panel", size: { w: wd }, group: ["Insight", "التحليل"], render: (c, o) => <DeptInsightPanel d={d} ks={ks} ar={c.ar} scope={scopeOf(c, o)} /> }];
    if (id === "decisions") return [{ id: "decisions", version: 1, title: ["Decisions required from you", "القرارات المطلوبة منك"], meaning: ["Documents of this department waiting for a decision you may take now, oldest first, with the decision buttons of their workflow.", "مستندات القسم التي تنتظر قرارًا يمكنك اتخاذه الآن، الأقدم أولًا، مع أزرار القرار من سير العمل."],
      sources: docsOf, shape: "panel", defaultView: "panel", size: { w: wd }, group: ["Work", "العمل"], render: (c, o) => <DecisionList attr={`dept-${d}`} doctypes={deptDocs(d)} ar={c.ar} scope={scopeOf(c, o)} max={5} /> }];
    if (id === "scorecard") return [{ id: "scorecard", version: 1, title: ["Executive scorecard", "بطاقة الأداء التنفيذية"], meaning: ["The headline figure of every department now and as the records stood 30 days ago (same formula over the records dated up to then), with the change; each row opens its department.", "المؤشر الرئيسي لكل قسم الآن وكما كانت السجلات قبل 30 يومًا (المعادلة نفسها على السجلات المؤرخة حتى ذلك اليوم) مع التغير؛ كل صف يفتح قسمه."],
      sources: [...new Set(SCORE_KPIS().flatMap((k) => k.sources))], shape: "panel", defaultView: "panel", size: { w: wd }, group: ["Key figures", "المؤشرات الرئيسية"], render: (c, o) => <ExecScorecard ar={c.ar} scope={scopeOf(c, o)} /> }];
    if (id === "workspaces") return [{ id: "workspaces", version: 1, title: ["Workspaces of this department", "مساحات عمل القسم"], meaning: ["The department's four workspaces with their question and first figures; each opens its overview, documents & work or full reports.", "مساحات عمل القسم الأربع مع سؤالها وأول أرقامها؛ كل منها يفتح نظرتها العامة أو مستنداتها وأعمالها أو تقاريرها الكاملة."],
      sources: docsOf, shape: "panel", defaultView: "panel", size: { w: wd }, group: ["Work", "العمل"], render: (c) => <DeptWorkspaces d={d} ar={c.ar} /> }];
    const v = VISUALS.find((x) => x.id === id) ?? deptVisual(id);
    return v ? [visWidget(v, `vis:${v.id}`, wd)] : [];
  });
  const def = registerDashboard<WsCtx>({
    app: APP, id: `r19dept:${d}`, title: DEPT_TITLE[d], widgets: [...ks.map(kpiWidget), ...blocks], managerRoles: ["Digit Director", "Digit Project Manager"], companyRoles: ["Digit Director"], globalRoles: ["Digit Director"],
    filters: [
      { key: "company", label: ["Company", "الشركة"], choices: () => [...new Set(constructionProjects().map((p) => String(p["company"] ?? "")).filter(Boolean))].sort().map((c) => ({ value: c, label: c, data: true })) },
      { key: "project", label: ["Project", "المشروع"], choices: (c) => constructionProjects().map((p) => ({ value: p.name, label: projectTitle(p, !c.ar), data: true })) },
    ],
  });
  DCACHE.set(d, def);
  return def;
}
/** The first headline figure of each of the nine departments (deptDashboards.ts order). */
const SCORE_KPIS = () => (Object.keys(DEPT_COMPOSITION) as DeptNo[]).map((d) => KPIS.find((k) => k.id === DEPT_COMPOSITION[d].kpis[0])).filter((k): k is KpiDef => !!k);
const minusDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) - n * 864e5).toISOString().slice(0, 10);
/** Pro parity (executive scorecard): now vs 30 days ago per department, change in the figure's own unit; money carries the Riyal sign. */
function ExecScorecard({ ar, scope }: { ar: boolean; scope: Scope }) {
  const { t } = useCx();
  const on = scope.on ?? today(); const before = minusDays(on, 30);
  const val = (f: Fig) => (f.status && f.status !== "ok") || f.value === null ? null : f.value;
  const show = (f: Fig, v: number | null) => (v === null ? "—" : f.unit === "money" ? riyal(figText({ ...f, value: v }, ar)) : figText({ ...f, value: v }, ar));
  const rows = (Object.keys(DEPT_COMPOSITION) as DeptNo[]).flatMap((d) => {
    const k = KPIS.find((x) => x.id === DEPT_COMPOSITION[d].kpis[0]); if (!k) return [];
    let now: Fig, then: Fig;
    try { now = k.fig(scope); then = asOfRecords(before, () => k.fig({ ...scope, on: before })); } catch { return []; }
    const a = val(now), b = val(then); const diff = a !== null && b !== null ? a - b : null;
    return [{ d, k, now, a, b, diff }];
  });
  return (
    <div className="overflow-x-auto" data-r19-scorecard>
      <table className="w-full text-sm">
        <thead><tr className="text-xs text-muted-foreground"><th className="py-1 text-start font-medium">{t("Department", "القسم")}</th><th className="py-1 text-start font-medium">{t("Figure", "المؤشر")}</th><th className="py-1 text-end font-medium">{t("Now", "الآن")}</th><th className="py-1 text-end font-medium">{t(`30 days ago (${before})`, `قبل 30 يومًا (${before})`)}</th><th className="py-1 text-end font-medium">{t("Change", "التغير")}</th></tr></thead>
        <tbody>{rows.map((r) => <tr key={r.d} className="border-t border-border" data-r19-score-row={r.d}>
          <td className="py-1.5"><AppLink to={DEPT_SLUGS[r.d]!} className="font-medium text-primary hover:underline">{pick(ar, DEPT_TITLE[r.d])}</AppLink></td>
          <td className="py-1.5 text-muted-foreground">{pick(ar, r.k.title)}</td>
          <td className="py-1.5 text-end tabular-nums font-semibold" data-no-i18n>{show(r.now, r.a)}</td>
          <td className="py-1.5 text-end tabular-nums" data-no-i18n>{show(r.now, r.b)}</td>
          <td className={`py-1.5 text-end tabular-nums ${r.diff === null || r.diff === 0 ? "text-muted-foreground" : ""}`} data-no-i18n>{r.diff === null ? "—" : r.diff === 0 ? t("no change", "بلا تغير") : `${r.diff > 0 ? "▲" : "▼"} ${show(r.now, Math.abs(r.diff))}`}</td>
        </tr>)}</tbody>
      </table>
    </div>
  );
}
function DeptInsightPanel({ d, ks, ar, scope }: { d: DeptNo; ks: KpiDef[]; ar: boolean; scope: Scope }) {
  const { t } = useCx();
  const link = useDrillLink();
  const docsSet = deptDocs(d);
  const waiting = approvalsFor().filter((a) => docsSet.has(a.doctype) && (!scope.project || a.project === scope.project) && (!scope.company || a.company === scope.company))
    .map((a) => ({ name: a.name, title: [a.doctype, DOCTYPE_AR[a.doctype] ?? a.doctype] as Bi, days: a.age_days, drill: { kind: "doc", doctype: a.doctype, name: a.name } }));
  const items = deptInsights(ks, scope, waiting);
  return (
    <DxPanel title={t("What you should know today", "ما يجب أن تعرفه اليوم")} subtitle={t("Computed from the figures above · 30 days", "محسوبة من الأرقام أعلاه · 30 يومًا")} attrs={{ "data-r19-insights": `dept-${d}` }}>
      <ul className="ek-insights space-y-2 text-sm">{items.map((i) => (
        <li key={i.key} className="flex items-start gap-2 rounded-md bg-muted/50 px-2.5 py-2" data-insight={i.key} data-tone={i.tone}>
          <span aria-hidden className={`mt-0.5 shrink-0 font-bold ${i.tone === "good" ? "text-success" : i.tone === "risk" ? "text-destructive" : "text-info"}`}>{i.tone === "good" ? "✓" : i.tone === "risk" ? "!" : "↗"}</span>
          <span>{i.drill ? link(i.drill, pick(ar, i.text), { className: "hover:underline" }) : pick(ar, i.text)}</span>
        </li>))}</ul>
    </DxPanel>
  );
}
function DeptWorkspaces({ d, ar }: { d: DeptNo; ar: boolean }) {
  const { t } = useCx();
  const on = today();
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-3 md:grid-cols-2 xl:grid-cols-4" data-r19-dept-workspaces={d}>
      {workspacesOfDept(d).map((w) => {
        const figs = kpisOf(w.id).slice(0, 2).map((k) => { let f: Fig | undefined; try { f = k.fig({ on, ar }); } catch { f = undefined; } return { k, f }; });
        return (
          <section key={w.id} className="flex flex-col rounded-lg border border-border bg-card p-3 shadow-sm" data-r19-dept-ws={w.id}>
            <AppLink to={wsRoute(w.id)} className="font-semibold text-primary hover:underline">{pick(ar, w.title)}</AppLink>
            <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{pick(ar, w.question)}</p>
            <dl className="mt-2 grid grid-cols-2 gap-2" data-r19-dept-kpis={w.id}>{figs.map(({ k, f }) => (
              <div key={k.id} className="min-w-0"><dt className="truncate text-[11px] text-muted-foreground">{pick(ar, k.title)}</dt>
                <dd className="text-sm font-semibold tabular-nums" data-no-i18n>{f && f.value !== null && f.status !== "unavailable" && f.status !== "pending" ? figText(f, ar) : "—"}</dd></div>))}</dl>
            <nav className="mt-auto flex flex-wrap gap-1.5 pt-2 text-xs" aria-label={pick(ar, w.title)}>
              {WS_TABS.map((tb) => <AppLink key={tb} to={wsRoute(w.id, tb)} className="rounded-full border border-border px-2.5 py-1 font-medium text-primary hover:bg-muted max-md:min-h-11 max-md:inline-flex max-md:items-center">{tb === "overview" ? t("Overview", "نظرة عامة") : tb === "documents" ? t("Documents & work", "المستندات والعمل") : t("Full reports", "التقارير الكاملة")}</AppLink>)}
            </nav>
          </section>
        );
      })}
    </div>
  );
}

export function R19DeptPage({ path }: PluginPageProps) {
  const { t, ar } = useCx();
  const search = useRouterState({ select: (s) => s.location.search as Record<string, unknown> });
  const nav = useNavigate();
  const d = deptBySlug(String(path ?? "").split("/")[0] ?? "") as DeptNo | undefined;
  const def = useMemo(() => (d ? deptDashboard(d) : undefined), [d]);
  const link = useDrillLink();
  if (!d || !def) return <div className="p-6"><PageHeader title={t("Department not found", "القسم غير موجود")} /><Empty><AppLink to="ws">{t("All workspaces", "كل مساحات العمل")}</AppLink></Empty></div>;
  const comp = DEPT_COMPOSITION[d];
  const filters = { ...(str(search["f_company"]) ? { company: str(search["f_company"])! } : {}), ...(str(search["f_project"]) ? { project: str(search["f_project"])! } : {}) };
  const go = (n: Record<string, string>) => void nav({ to: ".", replace: true, search: Object.fromEntries(Object.entries({ ...search, f_company: n["company"], f_project: n["project"] }).filter(([, v]) => v !== undefined && v !== "")) as never });
  const wss = workspacesOfDept(d);
  return (
    <div className="w-full min-w-0" data-page="construction-r19-dept" data-r19-dept={d}>
      <PageHeader title={pick(ar, DEPT_TITLE[d])} crumbs={[{ label: t("Workspaces", "مساحات العمل"), to: "ws" }]}
        band={{ question: pick(ar, comp.question),
          basis: t("Figures and charts read the department's documents when the page opens; every figure, bar and decision opens the records behind it.", "تقرأ الأرقام والرسوم مستندات القسم عند فتح الصفحة؛ كل رقم وشريط وقرار يفتح السجلات التي يقوم عليها."),
          meta: [{ label: t("Dashboard", "اللوحة"), value: pick(ar, comp.approved) }, { label: t("Workspaces", "مساحات العمل"), value: <span data-no-i18n>{wss.length}</span> }],
          actions: <>{wss.map((w, i) => <AppLink key={w.id} to={wsRoute(w.id)} className={i === 0 ? BAND.primary : BAND.secondary}>{pick(ar, w.title)}</AppLink>)}</> }} />
      <DashboardDesigner def={def} ctx={{ on: today(), ar }} link={link} company={filters.company} filterValues={filters} onFilters={go} />
      <ExperienceBlocks app={APP} screen={`${APP}.dept.${d}`} company={filters.company} />
    </div>
  );
}
