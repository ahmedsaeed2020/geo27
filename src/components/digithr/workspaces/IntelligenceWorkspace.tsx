/**
 * Module 06 — Intelligence Studio (Premium V2). Pinned analytic context (dimension · population · period · freshness)
 * over a large selectable segment chart (URL `dim`, `seg`). Side (4/12): selected segment breakdown with definitions
 * and drills, period movement (metric engine, same drill contract), findings with evidence. Lower: plans vs actual,
 * budgets/cost (cost for authorized roles only) and a reports explorer by topic. No fabricated trends or forecasts.
 */
import { useEffect } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { useScopeMetas } from "@/plugins/digit_hr/compat/scope";
import { fmtCurrency } from "@/lib/format";
import { useTx } from "@/components/digithr/DigitHrLayout";
import { ReportModeBadge } from "@/components/digithr/ReportModeBadge";
import { MetricValue, useModuleScope } from "@/components/digithr/ModuleScope";
import { useStoreVersion } from "@/lib/adapter";
import { useSessionUser } from "@/plugins/digit_hr/compat/session";
import { isHrAdmin } from "@/plugins/digit_hr/compat/employeeIdentity";
import { t as tr } from "@/i18n";
import { recordState } from "@/plugins/digit_hr/review";
import { hrMetric } from "@/plugins/digit_hr/hrMetrics";
import { planFacts, yearPeriod, type PlanFact } from "@/plugins/digit_hr/planFacts";
import { REPORTS } from "@/plugins/digit_hr/v5/data";
import { Native, Chip, WorkTable, arLabel, useSources, SourceNotice, SourceMark, s, live, type R, DateRange } from "./shared";
import { ClearScope, CompanyScope, CtxField, Facts, HrCommandHeader, HrContextToolbar, HrEmptyOrBlockedState, HrInsightPanel, HrWorkspaceGrid, ModuleLinks, PeriodScope, Pill, ScopeDenied, Seg, SourcesPill, useSearchPatch, useToday } from "../home/kit";

type Tx = (ar: string, en: string) => string;
/** Source reports that answer the same questions; they read filters from their own form (no URL filter contract in Core). */
const RELATED = ["Employee Analytics", "Employee Exits", "Recruitment Analytics", "Monthly Attendance Sheet", "Employee Information"];
const REPORT_AR: Record<string, string> = { "Employee Analytics": "تحليلات الموظفين", "Employee Exits": "حالات خروج الموظفين", "Recruitment Analytics": "تحليلات التوظيف", "Monthly Attendance Sheet": "كشف الحضور الشهري", "Employee Information": "معلومات الموظفين", "Appraisal Overview": "نظرة عامة على التقييمات", "Employee Advance Summary": "ملخص سلف الموظفين", "Employee Birthday": "أعياد ميلاد الموظفين", "Employee Hours Utilization Based On Timesheet": "استغلال ساعات الموظفين", "Employee Leave Balance": "رصيد إجازات الموظفين", "Employee Leave Balance Summary": "ملخص أرصدة الإجازات", "Employees working on a holiday": "موظفون يعملون في عطلة", "Leave Ledger": "دفتر الإجازات", "Project Profitability": "ربحية المشاريع", "Shift Attendance": "حضور الورديات", "Unpaid Expense Claim": "مطالبات غير مدفوعة", "Vehicle Expenses": "مصروفات المركبات", "Accrued Earnings Report": "تقرير الاستحقاقات المتراكمة", "Bank Remittance": "التحويلات البنكية", "Employee CTC Break-up": "تفصيل التكلفة الإجمالية", "Income Tax Computation": "احتساب ضريبة الدخل", "Income Tax Deductions": "استقطاعات ضريبة الدخل", "Salary Payments Based On Payment Mode": "مدفوعات الرواتب حسب طريقة الدفع", "Salary Payments via ECS": "مدفوعات الرواتب عبر ECS", "Salary Register": "سجل الرواتب" };
const TOPICS: { id: string; ar: string; en: string }[] = [
  { id: "06", ar: "القوى العاملة والتحليلات", en: "Workforce & analytics" }, { id: "01", ar: "الموظفون والخروج", en: "Employees & exits" },
  { id: "02", ar: "التوظيف والأداء", en: "Recruitment & performance" }, { id: "03", ar: "الوقت والإجازات", en: "Time & leave" },
  { id: "05", ar: "الخدمة الذاتية", en: "Self-service" }, { id: "04", ar: "الرواتب", en: "Payroll" },
];
const DIMS = [
  { id: "department", ar: "القسم", en: "Department" }, { id: "employment_type", ar: "نوع التوظيف", en: "Employment type" },
  { id: "designation", ar: "المسمى", en: "Designation" }, { id: "branch", ar: "الفرع", en: "Branch" },
  { id: "gender", ar: "الجنس", en: "Gender" }, { id: "company", ar: "الشركة", en: "Company" },
] as const;
type Dim = (typeof DIMS)[number]["id"];
const NOT_SET = "__not_set__";
/** Composition palette from the HR tokens (first six segments; the rest share the neutral tone). */
const COMP = ["var(--dhr-deep)", "var(--dhr-emerald)", "var(--dhr-mint)", "var(--dhr-info)", "var(--dhr-warn)", "color-mix(in oklab, var(--dhr-deep) 45%, var(--dhr-surface))"];
const inPeriod = (d: string, from: string, to: string) => !!d && (!from || d >= from) && (!to || d <= to);

export function IntelligenceWorkspace({ home = false }: { home?: boolean }) {
  const { tx } = useTx();
  useStoreVersion(); useSessionUser();
  useScopeMetas(["Employee", "Job Opening", "Job Applicant", "Job Offer", "Employee Separation", "Employee Transfer", "DIGIT Workforce Plan", "DIGIT Position Budget", "DIGIT Succession Plan", "Staffing Plan", "Salary Slip"]);
  const admin = isHrAdmin();
  const src = useSources(tx);
  const scope = useModuleScope(src);
  const patch = useSearchPatch();
  const today = useToday();
  const search = useRouterState({ select: (st) => st.location.search }) as Record<string, unknown>;
  // The period is always explicit in the URL so every fact, its metric drill and Back read the same dates.
  useEffect(() => { if (!scope.from && !scope.to) scope.set(yearPeriod(new Date().getFullYear()), { replace: true }); });
  const from = scope.from, to = scope.to;
  const dim: Dim = DIMS.some((d) => d.id === search["dim"]) ? (search["dim"] as Dim) : "department";
  const seg = typeof search["seg"] === "string" ? (search["seg"] as string) : "";

  const allEmps = scope.filter(src.rows("Employee")).filter(live);
  const emps = allEmps.filter((e) => s(e.status || "Active") === "Active");
  const empReady = src.ready("Employee") && scope.companyKnown;
  const keyOf = (e: R) => s(e[dim]) || NOT_SET;
  const groups = [...emps.reduce((m, e) => m.set(keyOf(e), [...(m.get(keyOf(e)) ?? []), e]), new Map<string, R[]>())].map(([k, rows]) => ({ k, rows })).sort((a, b) => b.rows.length - a.rows.length || a.k.localeCompare(b.k));
  const max = Math.max(1, ...groups.map((g) => g.rows.length));
  const total = emps.length;
  const segLabel = (k: string) => k === NOT_SET ? tx("غير محدد", "Not set") : dim === "gender" || dim === "employment_type" ? tr(k) : tx(arLabel(k), k);
  const sel = groups.find((g) => g.k === seg);
  const segAll = allEmps.filter((e) => !sel || keyOf(e) === seg);
  const segActive = sel ? sel.rows : emps;
  const joined = segAll.filter((e) => inPeriod(s(e.date_of_joining).slice(0, 10), from, to));
  const left = segAll.filter((e) => inPeriod(s(e.relieving_date).slice(0, 10), from, to));
  const second: Dim = dim === "department" ? "employment_type" : "department";
  const breakdown = [...segActive.reduce((m: Map<string, number>, e: R) => m.set(s(e[second]) || NOT_SET, (m.get(s(e[second]) || NOT_SET) ?? 0) + 1), new Map<string, number>())].sort((a, b) => b[1] - a[1]).slice(0, 6);
  const coFilter: unknown[][] = scope.company ? [["company", "=", scope.company]] : [];

  const plans: PlanFact[] = scope.companyKnown ? planFacts(src.rows("DIGIT Workforce Plan"), src.rows("Staffing Plan"), src.rows("Employee"), { company: scope.company, from, to }) : [];
  const budgets = scope.filter(src.rows("DIGIT Position Budget")).filter(live);
  const succession = src.rows("DIGIT Succession Plan").filter(live);
  const slips = scope.filter(src.rows("Salary Slip")).filter((x) => Number(x.docstatus ?? 0) === 1 && (!from || s(x.start_date) >= from) && (!to || s(x.start_date) <= to));
  const years = Array.from(new Set([String(new Date().getFullYear()), ...allEmps.flatMap((e) => [s(e.date_of_joining).slice(0, 4), s(e.relieving_date).slice(0, 4)]).filter((y) => /^\d{4}$/.test(y))])).sort().reverse().slice(0, 6);
  const yearSel = years.find((y) => from === `${y}-01-01` && to === `${y}-12-31`) ?? "";
  const mv = (label: string, deps: string[], period = true) => <MetricValue label={label} scope={scope} src={src} tx={tx} back="06" period={period} deps={deps} />;
  const val = (label: string) => (scope.companyKnown ? hrMetric(label, scope.periodCtx).value : null);
  const joins = val("Joiners"), exits = val("Exits");
  const gaps = plans.filter((p) => p.actual.length - p.planned < 0);
  const notSet = groups.find((g) => g.k === NOT_SET)?.rows.length ?? 0;
  const singles = dim === "department" ? groups.filter((g) => g.k !== NOT_SET && g.rows.length === 1).length : 0;

  return (
    <div className="space-y-4" data-module-home="06">
      <HrCommandHeader embedded={!home} id="06" code="06" suite={tx("ذكاء الموارد البشرية والتخطيط", "People Intelligence & Planning")} title={tx("استوديو الذكاء", "Intelligence Studio")}
        purpose={tx("استكشف القوى العاملة حسب البُعد؛ كل رقم يفتح الفئة التي خلفه. لا اتجاهات أو تنبؤات مُختلقة.", "Explore the workforce by dimension; every figure opens the population behind it. No fabricated trends or forecasts.")}
        actions={<Native dt="Employee" module="06" className="dhr-act">{tx("سجل الموظفين", "Employee register")}</Native>}>
        <HrContextToolbar tx={tx} active={(scope.company ? 1 : 0) + (from || to ? 1 : 0)} scopeKey={[scope.company, from, to].join("|")} end={<><SourcesPill src={src} /><ClearScope scope={scope} tx={tx} period /></>}>
          <CompanyScope scope={scope} tx={tx} />
          <CtxField label={tx("السنة", "Year")}>
            <select aria-label={tx("سنة سريعة", "Quick year")} value={yearSel} onChange={(e) => e.target.value && scope.set(yearPeriod(Number(e.target.value)))} data-no-i18n>
              {!yearSel && <option value="">{tx("مخصصة", "Custom")}</option>}
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </CtxField>
          <PeriodScope scope={scope} tx={tx} />
        </HrContextToolbar>
      </HrCommandHeader>
      <ScopeDenied scope={scope} tx={tx} />
      <SourceNotice src={src} quietLoading />

      <HrWorkspaceGrid split="8/4"
        main={<>
          <HrInsightPanel title={tx("أين تتركز القوى العاملة؟", "Where is the workforce concentrated?")} data-segment-chart={dim}
            meta={<span className="flex flex-wrap gap-x-3 gap-y-0.5 max-sm:flex-col"><span>{tx("الفئة: موظفون نشطون الآن", "Population: active employees now")}</span><span className="max-sm:hidden" aria-hidden>·</span><span data-no-i18n>{tx("الحركة:", "Movement:")} <span dir="ltr" className="inline-block">{from || "…"} → {to || "…"}</span></span><span className="max-sm:hidden" aria-hidden>·</span><span>{empReady ? <>{tx("حداثة البيانات: قُرئت الآن من", "Freshness: read now from")} <b className="dhr-tnum" data-no-i18n>{allEmps.length}</b> {tx("سجل موظف", "employee records")}</> : tx("جارٍ القراءة", "Reading")}</span></span>}
            info={tx("الحصة = عدد الشريحة ÷ كل الموظفين النشطين في النطاق. الشريط العلوي يوزّع 100% على الشرائح؛ الأشرطة الأفقية تُقاس نسبةً إلى أكبر شريحة لتسهيل المقارنة. القيمة الحالية للبُعد تُستخدم للماضي أيضًا؛ لا اتجاهات دون سجل تاريخي.", "Share = segment count ÷ all active employees in scope. The top strip divides 100% across segments; the horizontal bars are scaled to the largest segment for comparison. The current dimension value is used for past records too; no trends without recorded history.")}
            toolbar={<Seg<Dim> label={tx("البُعد", "Dimension")} value={dim} onChange={(v) => patch({ dim: v, seg: "" }, true)} options={DIMS.filter((d) => d.id !== "company" || !scope.company).map((d) => ({ id: d.id, label: tx(d.ar, d.en) }))} />}>
            {!empReady ? <HrEmptyOrBlockedState read={scope.companyKnown ? src.read("Employee") : { state: "DENIED" }} tx={tx} rows={6} />
              : !groups.length ? <HrEmptyOrBlockedState tx={tx} title={tx("لا موظفين نشطين في هذا النطاق.", "No active employees in this scope.")} />
              : <div className="grid gap-0.5" role="group" aria-label={tx("الشرائح", "Segments")}>
                  {/* headline: the selected population and its share of the whole, then a true 100 % composition strip */}
                  <div className="mb-3 flex flex-wrap items-end gap-x-6 gap-y-2 px-2" data-intel-headline>
                    <div><div className="text-[11.5px] text-[var(--dhr-muted)]">{sel ? <span data-no-i18n>{segLabel(sel.k)}</span> : tx("كل النشطين في النطاق", "All active in scope")}</div><div className="dhr-tnum text-[30px] font-semibold leading-none text-[var(--dhr-deep)]" data-no-i18n>{segActive.length}</div></div>
                    <div><div className="text-[11.5px] text-[var(--dhr-muted)]">{tx("الحصة", "Share")}</div><div className="dhr-tnum text-[18px] font-semibold" data-no-i18n>{Math.round((segActive.length / Math.max(1, total)) * 100)}%</div></div>
                    <div><div className="text-[11.5px] text-[var(--dhr-muted)]">{tx("التحقوا / غادروا في الفترة", "Joined / left in period")}</div><div className="dhr-tnum text-[18px] font-semibold" data-no-i18n>{joined.length} / {left.length}</div></div>
                    <div><div className="text-[11.5px] text-[var(--dhr-muted)]">{tx("عدد الشرائح", "Segments")}</div><div className="dhr-tnum text-[18px] font-semibold" data-no-i18n>{groups.length}</div></div>
                  </div>
                  <div className="mb-3 flex h-7 overflow-hidden rounded-md border border-[var(--dhr-sep)]" role="group" aria-label={tx("التركيب: حصة كل شريحة من 100%", "Composition: each segment's share of 100%")} data-composition-strip>
                    {groups.slice(0, 6).map((g, i) => (
                      <button key={g.k} type="button" className="relative h-full min-w-[3px] border-e border-[var(--dhr-surface)] text-[10.5px] font-semibold text-[var(--dhr-surface)] transition-opacity last:border-e-0" style={{ width: `${(g.rows.length / Math.max(1, total)) * 100}%`, background: COMP[i % COMP.length], opacity: seg && seg !== g.k ? 0.35 : 1 }} aria-pressed={seg === g.k} onClick={() => patch({ seg: seg === g.k ? "" : g.k }, true)} aria-label={`${segLabel(g.k)}: ${g.rows.length} (${Math.round((g.rows.length / Math.max(1, total)) * 100)}%)`} title={`${segLabel(g.k)}: ${g.rows.length}`}>
                        <span className="truncate px-1" data-no-i18n aria-hidden>{(g.rows.length / Math.max(1, total)) >= 0.08 ? `${Math.round((g.rows.length / Math.max(1, total)) * 100)}%` : ""}</span>
                      </button>
                    ))}
                    {groups.length > 6 && <span className="h-full bg-[var(--dhr-border)]" style={{ width: `${(groups.slice(6).reduce((a, g) => a + g.rows.length, 0) / Math.max(1, total)) * 100}%` }} title={tx("شرائح أخرى", "Other segments")} />}
                  </div>
                  <div className="dhr-hbar-head" aria-hidden><span>{tx(DIMS.find((d) => d.id === dim)!.ar, DIMS.find((d) => d.id === dim)!.en)}</span><span>{tx("نسبةً إلى أكبر شريحة", "Relative to the largest segment")}</span><span className="text-end">{tx("العدد / %", "Count / %")}</span></div>
                  {groups.slice(0, 16).map((g) => (
                    <button key={g.k} type="button" className="dhr-hbar" aria-pressed={seg === g.k} onClick={() => patch({ seg: seg === g.k ? "" : g.k }, true)} data-segment={g.k}>
                      <span className="flex min-w-0 items-center gap-2"><i className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: groups.indexOf(g) < 6 ? COMP[groups.indexOf(g) % COMP.length] : "var(--dhr-border)" }} aria-hidden /><span className="truncate" data-no-i18n>{segLabel(g.k)}</span></span>
                      <span className="bar"><i style={{ width: `${(g.rows.length / max) * 100}%` }} /></span>
                      <span className="dhr-tnum text-end" data-no-i18n><b>{g.rows.length}</b> <span className="text-[11px] text-[var(--dhr-muted)]">{Math.round((g.rows.length / Math.max(1, total)) * 100)}%</span></span>
                    </button>
                  ))}
                  {groups.length > 16 && <p className="px-2 pt-1 text-[11.5px] text-[var(--dhr-muted)]">{tx(`+${groups.length - 16} شرائح أصغر — افتح السجل للكل.`, `+${groups.length - 16} smaller segments — open the register for all.`)}</p>}
                </div>}
          </HrInsightPanel>
          <HrInsightPanel title={tx("حركة الفترة", "Period movement")} flush meta={<span data-no-i18n><DateRange from={from} to={to} /></span>} info={tx("من محرك المؤشرات — كل رقم يفتح القائمة بنفس الشركة والفترة. التنقلات الداخلية لا تُحسب توظيفًا جديدًا. المؤشرات الآنية (القوى العاملة الآن، الشواغر) لا تتأثر بالفترة.", "From the metric engine — each figure opens the list with the same company and period. Internal transfers are not counted as new hires. Point-in-time figures (workforce now, open vacancies) ignore the period.")} data-period-movement>
            <dl className="grid grid-cols-2 gap-px bg-[var(--dhr-sep)] sm:grid-cols-4">
              {([
                [tx("القوى العاملة الآن", "Workforce now"), mv("Active Headcount", ["Employee"], false)],
                [tx("انضموا في الفترة", "Joined in period"), mv("Joiners", ["Employee"])],
                [tx("غادروا في الفترة", "Left in period"), mv("Exits", ["Employee"])],
                [tx("صافي الحركة", "Net movement"), src.v(joins === null || exits === null ? <SourceMark read={{ state: "DENIED" }} tx={tx} /> : <span data-net-movement>{joins - exits > 0 ? "+" : ""}{joins - exits}</span>, "Employee")],
                [tx("تنقلات داخلية معتمدة", "Submitted internal transfers"), mv("Internal Transfers", ["Employee Transfer"])],
                [tx("عروض مقبولة", "Offers accepted"), mv("Accepted Offers", ["Job Offer"])],
                [tx("حالات إنهاء بدأت", "Separations started"), mv("Separations Started", ["Employee Separation"])],
                [tx("وظائف شاغرة الآن", "Open vacancies now"), mv("Open Vacancies", ["Job Opening"], false)],
              ] as [string, React.ReactNode][]).map(([k, v]) => <div key={k} className="min-w-0 bg-[var(--dhr-surface)] px-4 py-2.5"><dt className="truncate text-[11.5px] text-[var(--dhr-muted)]">{k}</dt><dd className="dhr-tnum text-[18px] font-semibold" data-no-i18n>{v}</dd></div>)}
            </dl>
          </HrInsightPanel>
        </>}
        side={<>
          <HrInsightPanel title={sel ? <span data-no-i18n>{segLabel(sel.k)}</span> : tx("كل الموظفين النشطين", "All active employees")} data-segment-detail={seg || "all"}
            meta={sel ? tx(`شريحة ${tx(DIMS.find((d) => d.id === dim)!.ar, DIMS.find((d) => d.id === dim)!.en)}`, `${DIMS.find((d) => d.id === dim)!.en} segment`) : tx("اختر شريحة من الرسم لتفصيلها", "Pick a segment in the chart to break it down")}
            info={tx("التعريف: «التحقوا» بتاريخ الالتحاق و«غادروا» بتاريخ المغادرة داخل الفترة، ضمن الشريحة والشركة. القيمة الحالية للبُعد تُستخدم للماضي أيضًا.", "Definition: \"joined\" by joining date and \"left\" by relieving date inside the period, within the segment and company. The current dimension value is used for past records too.")}
            actions={sel ? <button type="button" className="dhr-act dhr-act-ghost" onClick={() => patch({ seg: "" }, true)}>{tx("مسح", "Clear")}</button> : undefined}>
            {!empReady ? <HrEmptyOrBlockedState read={scope.companyKnown ? src.read("Employee") : { state: "DENIED" }} tx={tx} rows={3} /> : <>
              <Facts items={[
                [tx("نشطون الآن", "Active now"), <Native key="a" dt="Employee" module="06" filters={sel ? [["name", "in", sel.rows.map((e: R) => s(e.name))]] : [["status", "=", "Active"], ...coFilter]} className="dhr-link font-semibold">{segActive.length}</Native>],
                [tx("الحصة", "Share"), `${Math.round((segActive.length / Math.max(1, total)) * 100)}%`],
                [tx("التحقوا في الفترة", "Joined in period"), joined.length ? <Native key="j" dt="Employee" module="06" filters={[["name", "in", joined.map((e) => s(e.name))]]} className="dhr-link font-semibold">{joined.length}</Native> : "0"],
                [tx("غادروا في الفترة", "Left in period"), left.length ? <Native key="l" dt="Employee" module="06" filters={[["name", "in", left.map((e) => s(e.name))]]} className="dhr-link font-semibold">{left.length}</Native> : "0"],
              ]} />
              <div className="mt-3 border-t border-[var(--dhr-sep)] pt-3">
                <h3 className="mb-1.5 text-[12px] font-semibold text-[var(--dhr-muted)]">{tx("التفصيل حسب", "Breakdown by")} {tx(DIMS.find((d) => d.id === second)!.ar, DIMS.find((d) => d.id === second)!.en)}</h3>
                <ul className="grid gap-1">{breakdown.map(([k, c]) => (
                  <li key={k} className="grid grid-cols-[minmax(0,1fr)_5rem_2rem] items-center gap-2 text-[12.5px]"><span className="truncate" data-no-i18n>{k === NOT_SET ? tx("غير محدد", "Not set") : second === "employment_type" ? tr(k) : tx(arLabel(k), k)}</span><span className="dhr-meter"><i style={{ width: `${(c / Math.max(1, segActive.length)) * 100}%` }} /></span><b className="dhr-tnum text-end" data-no-i18n>{c}</b></li>))}</ul>
              </div>
            </>}
          </HrInsightPanel>
          <HrInsightPanel title={tx("ملاحظات", "Findings")} flush data-findings>
            {!empReady ? <div className="p-4"><HrEmptyOrBlockedState read={scope.companyKnown ? src.read("Employee") : { state: "DENIED" }} tx={tx} rows={2} /></div>
              : (gaps.length || notSet || singles) ? <ul className="divide-y divide-[var(--dhr-sep)] text-[13px]">
                  {gaps.length > 0 && <li className="px-4 py-2.5"><b className="dhr-tnum" data-no-i18n>{gaps.length}</b> {tx("خطة الفعلي فيها أقل من المخطط", "plan(s) with actual below planned")} <span className="block text-[11.5px] text-[var(--dhr-muted)]">{tx("الدليل: جدول الخطط مقابل الفعلي أدناه.", "Evidence: plans vs actual table below.")}</span></li>}
                  {notSet > 0 && <li className="px-4 py-2.5"><button type="button" className="dhr-link text-start" onClick={() => patch({ seg: NOT_SET }, true)}><b className="dhr-tnum" data-no-i18n>{notSet}</b> {tx("موظف نشط بلا قيمة لهذا البُعد", "active employee(s) with no value for this dimension")}</button></li>}
                  {singles > 0 && <li className="px-4 py-2.5"><b className="dhr-tnum" data-no-i18n>{singles}</b> {tx("قسم يضم موظفًا نشطًا واحدًا", "department(s) with a single active employee")}</li>}
                </ul>
              : <p className="px-4 py-3 text-[13px] text-[var(--dhr-muted)]">{tx("لا ملاحظات لهذا النطاق.", "No findings for this scope.")}</p>}
          </HrInsightPanel>
        </>}
      />

      <div className="grid gap-4 xl:grid-cols-12">
        <HrInsightPanel className="xl:col-span-8" title={<>{tx("الخطط مقابل القوى العاملة الحالية", "Plans vs current workforce")} <span className="inline-block text-xs font-normal text-[var(--dhr-muted)]" dir="ltr" data-no-i18n>{from || "…"} → {to || "…"}</span></>} data-plan-facts={plans.length}
          meta={tx("خطط تتقاطع مع الفترة", "Plans overlapping the period")} info={tx("خطط القوى العاملة والتوظيف المتقاطعة مع الفترة. «الفعلي الآن» = الموظفون النشطون اليوم في الشركة والقسم نفسيهما — حقيقة مسجلة وليست توقعًا.", "Workforce and staffing plans overlapping the period. \"Actual now\" = employees active today in the same company and department — a recorded fact, not a forecast.")}>
          <WorkTable<PlanFact> label="plan-facts" tx={tx} rows={plans} rowKey={(p) => `${p.doctype}:${p.name}`} pageSize={8} minWidth={640}
            emptyState={src.ready("Employee") && (src.ready("DIGIT Workforce Plan") || src.ready("Staffing Plan")) && scope.companyKnown ? undefined : <HrEmptyOrBlockedState read={src.worst("DIGIT Workforce Plan", "Staffing Plan") ?? (scope.companyKnown ? undefined : { state: "DENIED" })} tx={tx} rows={3} />}
            searchText={(p) => `${p.title} ${p.department} ${p.company}`}
            cols={[
              { key: "t", ar: "الخطة", en: "Plan", sort: (p) => p.title, render: (p) => <span data-no-i18n><Native dt={p.doctype} name={p.name} module="06" className="dhr-link font-medium">{p.title}</Native><span className="block text-[11px] text-[var(--dhr-muted)]">{tx(p.doctype === "Staffing Plan" ? "خطة توظيف" : "خطة قوى عاملة", p.doctype)} · <span dir="ltr" className="inline-block">{p.from} → {p.to}</span></span></span> },
              { key: "d", ar: "القسم", en: "Department", sort: (p) => p.department, render: (p) => <span data-no-i18n>{p.department ? tx(arLabel(p.department), p.department) : tx("كل الأقسام", "All departments")}</span> },
              { key: "p", ar: "المخطط", en: "Planned", sort: (p) => p.planned, render: (p) => <span data-no-i18n className="dhr-tnum">{p.planned}</span> },
              { key: "r", ar: "المسجل في الخطة", en: "Recorded in plan", render: (p) => <span data-no-i18n className="dhr-tnum">{p.recorded ?? "—"}</span> },
              { key: "a", ar: "الفعلي الآن", en: "Actual now", sort: (p) => p.actual.length, render: (p) => p.actual.length ? <Native dt="Employee" module="06" filters={[["name", "in", p.actual]]} className="dhr-link"><span data-no-i18n className="dhr-tnum">{p.actual.length}</span></Native> : <span data-no-i18n>0</span> },
              { key: "g", ar: "الفرق", en: "Gap", sort: (p) => p.actual.length - p.planned, render: (p) => { const g = p.actual.length - p.planned; return <Chip tone={g < 0 ? "warn" : undefined}><span data-no-i18n>{g > 0 ? "+" : ""}{g}</span></Chip>; } },
              { key: "s", ar: "الحالة", en: "State", render: (p) => <Chip>{tr(p.status)}</Chip> },
            ]} />
        </HrInsightPanel>
        <div className="flex flex-col gap-4 xl:col-span-4">
          <HrInsightPanel title={tx("تحليل التكلفة", "Cost analysis")} meta={admin ? tx("صافي القسائم المعتمدة التي تبدأ داخل الفترة — للمخوّلين فقط.", "Net pay of submitted slips starting inside the period — authorized roles only.") : tx("غير متاح لدورك — يتطلب صلاحية رواتب.", "Unavailable for your role — requires payroll permission.")}>
            {!admin ? <p className="text-[13px] text-[var(--dhr-warn-text)]" data-source-state="DENIED">{tx("غير متاح — المصدر مقيّد بالصلاحية", "Unavailable — source is permission-restricted")}</p>
              : !src.ready("Salary Slip") ? <HrEmptyOrBlockedState read={src.read("Salary Slip")} tx={tx} rows={1} />
              : slips.length ? <div><div className="dhr-tnum text-[24px] font-semibold" data-no-i18n data-period-net-pay>{fmtCurrency(slips.reduce((a, x) => a + Number(x.net_pay || 0), 0))}</div><p className="mt-1 text-[12px] text-[var(--dhr-muted)]">{tx("ر.س · صافي القسائم المعتمدة", "SAR · net pay of submitted slips")} · <Native dt="Salary Slip" module="06" filters={[["name", "in", slips.map((x) => s(x.name))]]} className="dhr-link">{tx("المصدر", "Source")} (<span data-no-i18n>{slips.length}</span>)</Native></p></div>
              : <HrEmptyOrBlockedState tx={tx} title={tx("لا قسائم معتمدة في الفترة.", "No submitted slips in the period.")} />}
          </HrInsightPanel>
          <HrInsightPanel title={tx("ميزانيات المناصب والتعاقب", "Position budgets & succession")} flush>
            {budgets.length ? <ul className="divide-y divide-[var(--dhr-sep)]">{budgets.slice(0, 5).map((d) => <li key={s(d.name)} className="flex min-h-10 items-center justify-between gap-2 px-4 py-1.5"><Native dt="DIGIT Position Budget" name={s(d.name)} module="06" className="dhr-link min-w-0 truncate text-[13px]"><span data-no-i18n>{tx(arLabel(s(d.department) || s(d.name)), s(d.department) || s(d.name))}</span></Native><Chip>{s(d.budget_status) ? tr(s(d.budget_status)) : tr(recordState(d.docstatus))}</Chip></li>)}</ul>
              : <div className="px-4 pt-3"><HrEmptyOrBlockedState read={src.read("DIGIT Position Budget")} tx={tx} title={tx("لا ميزانيات مناصب.", "No position budgets.")} /></div>}
            <div className="border-t border-[var(--dhr-sep)] px-4 py-2 text-[12px] font-semibold text-[var(--dhr-muted)]">{tx("جاهزية التعاقب", "Succession readiness")}</div>
            {succession.length ? <ul className="divide-y divide-[var(--dhr-sep)]">{succession.slice(0, 5).map((d) => <li key={s(d.name)} className="flex min-h-10 items-center justify-between gap-2 px-4 py-1.5"><Native dt="DIGIT Succession Plan" name={s(d.name)} module="06" className="dhr-link min-w-0 truncate text-[13px]"><span data-no-i18n>{s(d.position) || s(d.name)}</span></Native><Chip>{tr(s(d.readiness))}</Chip></li>)}</ul>
              : <div className="px-4 pb-3"><HrEmptyOrBlockedState read={src.read("DIGIT Succession Plan")} tx={tx} title={tx("لا خطط تعاقب مسجلة.", "No succession plans recorded.")} /></div>}
          </HrInsightPanel>
        </div>
      </div>

      <HrInsightPanel title={tx("مستكشف التقارير", "Reports explorer")} meta={tx("حسب الموضوع · الشارة توضح ما يحدث عند الفتح لدورك", "By topic · the badge shows what opening does for your role")} info={tx("تقارير المصدر تقرأ مرشحاتها من نموذجها؛ عيّن الشركة والتواريخ نفسها داخل التقرير.", "Source reports read filters from their own form; set the same company and dates inside the report.")} data-related-reports>
        <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2 xl:grid-cols-3">
          {TOPICS.map((tp) => { const list = tp.id === "06" ? REPORTS.filter((r) => RELATED.includes(r.report) || r.modules[0] === "06") : REPORTS.filter((r) => r.modules[0] === tp.id && !RELATED.includes(r.report)); if (!list.length) return null; return (
            <section key={tp.id} data-report-topic={tp.id}>
              <h3 className="mb-1 border-b border-[var(--dhr-sep)] pb-1 text-[12px] font-semibold text-[var(--dhr-muted)]">{tx(tp.ar, tp.en)}</h3>
              <ul>{list.map((r) => (
                <li key={r.report} className="flex min-h-9 items-center justify-between gap-2 py-1"><Link to="/report/$name" params={{ name: r.report }} className="dhr-link min-w-0 truncate text-[13px]" data-related-report={RELATED.includes(r.report) ? r.report : undefined}>{tx(REPORT_AR[r.report] ?? r.report, r.report)}</Link><ReportModeBadge report={r.report} refDoctype={r.ref} /></li>))}</ul>
            </section>); })}
        </div>
      </HrInsightPanel>
    </div>
  );
}
