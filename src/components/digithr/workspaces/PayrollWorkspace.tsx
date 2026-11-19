/**
 * Module 04 — Payroll Control Room (Premium V2). Control strip: selected cycle (URL `cycle`), company, period, Payroll
 * Entry and its real document state. Hero (7/12): five-stage readiness process computed from records. Side (5/12):
 * blocker & decision panel (source, reason, scope, evidence, eligible review action, status). Lower: cohort preflight,
 * cycle history, slip register, recorded variances, structures and payroll reports.
 * Strict boundary: no statutory calculation, posting, bank transfer, GOSI or WPS submission; payment is never implied.
 */
import { Link, useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useTx } from "@/components/digithr/DigitHrLayout";
import { ReportModeBadge } from "@/components/digithr/ReportModeBadge";
import { useScopeMetas } from "@/plugins/digit_hr/compat/scope";
import { useStoreVersion } from "@/lib/adapter";
import { useSessionUser } from "@/plugins/digit_hr/compat/session";
import { isHrAdmin } from "@/plugins/digit_hr/compat/employeeIdentity";
import { cohortPreflight, missingBankDetails, missingSalaryStructure, payrollCohort, PREFLIGHT_ISSUE_TEXT as ISSUE_TEXT, type PreflightIssue, type PreflightRow } from "@/plugins/digit_hr/payrollReadiness";
import { REPORTS } from "@/plugins/digit_hr/v5/data";
import { fmtCurrency } from "@/lib/format";
import { t as tr } from "@/i18n";
import { Native, Chip, WorkTable, arLabel, useSources, SourceNotice, NotEvaluated, s, n, live, DateRange, type R } from "./shared";
import { CtxField, HrCommandHeader, HrContextToolbar, HrEmptyOrBlockedState, HrInsightPanel, HrPriorityQueue, HrWorkspaceGrid, ModuleLinks, Pill, SourcesPill, useSearchPatch, type QueueGroup, type Tone } from "../home/kit";

const ISSUE_GROUPS = [
  { id: "structure", ar: "بلا هيكل راتب", en: "No salary structure", tone: "danger" as const },
  { id: "bank", ar: "بلا بيانات بنكية", en: "No bank details", tone: "warn" as const },
  { id: "slip", ar: "قسيمة مسودة", en: "Draft slip", tone: "warn" as const },
  { id: "preflight", ar: "فحص موقوف", en: "Blocked preflight", tone: "danger" as const },
  { id: "variance", ar: "فرق مفتوح", en: "Open variance", tone: "warn" as const },
];
const NOT_INFERABLE: [string, string] = ["غير مُقيّم: تقتصر رؤيتك لإسنادات الرواتب على سجلاتك، فلا يُستنتج غيابها لغيرك.", "Not evaluated: you can only see your own salary assignments, so their absence for others is not inferred."];
const REPORT_AR: Record<string, string> = { "Salary Register": "سجل الرواتب", "Bank Remittance": "التحويلات البنكية", "Employee CTC Break-up": "تفصيل التكلفة الإجمالية", "Income Tax Computation": "احتساب ضريبة الدخل", "Income Tax Deductions": "استقطاعات ضريبة الدخل", "Salary Payments Based On Payment Mode": "مدفوعات الرواتب حسب طريقة الدفع", "Salary Payments via ECS": "مدفوعات الرواتب عبر ECS", "Accrued Earnings Report": "تقرير الاستحقاقات المتراكمة", "Employee Advance Summary": "ملخص سلف الموظفين" };

type StepState = "ready" | "attention" | "blocked" | "not-evaluated" | "server";
type Blocker = { key: string; sev: "blocking" | "review"; who: string; reason: [string, string]; scope: [string, string]; dt: string; name: string; action: ReactNode; status: [string, string]; tone: Tone };

export function PayrollWorkspace({ home = false }: { home?: boolean }) {
  const { tx } = useTx();
  useStoreVersion(); useSessionUser();
  useScopeMetas(["Employee", "Payroll Entry", "Salary Slip", "Salary Structure", "Salary Structure Assignment", "DIGIT Payroll Variance", "DIGIT Payroll Preflight"]);
  const admin = isHrAdmin();
  const src = useSources(tx);
  const patch = useSearchPatch();
  const search = useRouterState({ select: (st) => st.location.search }) as Record<string, unknown>;

  const entries = src.rows("Payroll Entry").filter(live);
  const slips = src.rows("Salary Slip").filter(live);
  const structures = src.rows("Salary Structure").filter((x) => n(x.docstatus) === 1);
  const assignments = src.rows("Salary Structure Assignment").filter((x) => n(x.docstatus) === 1);
  const emps = src.rows("Employee").filter((e) => s(e.status || "Active") === "Active");
  const variances = src.rows("DIGIT Payroll Variance").filter((d) => ["Open", "Escalated"].includes(s(d.variance_status)));
  const preflights = src.rows("DIGIT Payroll Preflight").filter(live);
  const blocked = preflights.filter((d) => s(d.preflight_status) === "Blocked");

  /* Absence among readable rows proves absence only when the reader sees every assignment for the employees in view. */
  const structInferable = admin;
  const structReady = structInferable && src.ready("Employee", "Salary Structure Assignment");
  const missingStructure = structReady ? missingSalaryStructure(emps, assignments, true) ?? [] : [];
  const draftSlips = slips.filter((x) => n(x.docstatus) === 0);
  const noBank = missingBankDetails(emps);

  // The reviewed cycle lives in the URL (?cycle=), so deep links, reload and Back return to the same cycle.
  const cycle = typeof search["cycle"] === "string" ? (search["cycle"] as string) : "";
  const selCycle = entries.find((e) => s(e.name) === cycle);
  const cycleUnknown = !!cycle && src.ready("Payroll Entry") && !selCycle;
  const inCycle = (r: { payroll_entry?: unknown }) => !cycle || s(r.payroll_entry) === cycle;
  const COHORT_SRC = ["Employee", "Salary Structure Assignment", "Salary Structure", "Salary Slip"];
  const cohortReady = !!selCycle && structInferable && src.ready(...COHORT_SRC);
  const cohort = cohortReady ? payrollCohort(selCycle, src.rows("Employee").filter(live)) : [];
  const pf = cohortReady ? cohortPreflight(selCycle, cohort, src.rows("Salary Structure Assignment"), src.rows("Salary Structure"), src.rows("Salary Slip")) : [];
  const has = (k: PreflightIssue) => pf.filter((r) => r.issues.includes(k));
  const cycleBlocked = blocked.filter(inCycle), cycleVar = variances.filter(inCycle);
  const cycleSlips = selCycle ? slips.filter((x) => s(x.payroll_entry) === cycle) : [];

  type Issue = { key: string; who: string; cat: string; dt: string; src: string; next: ReactNode };
  const ISSUE_SRC = ["Employee", "Salary Structure Assignment", "Salary Slip", "DIGIT Payroll Preflight", "DIGIT Payroll Variance"];
  const issueRows: Issue[] = [
    ...missingStructure.map((e) => ({ key: "s" + s(e.name), who: s(e.employee_name) || s(e.name), cat: "structure", dt: "Employee", src: s(e.name), next: <Native dt="Salary Structure Assignment" module="04" className="dhr-act">{tx("إسناد هيكل", "Assign structure")}</Native> })),
    ...noBank.map((e) => ({ key: "b" + s(e.name), who: s(e.employee_name) || s(e.name), cat: "bank", dt: "Employee", src: s(e.name), next: <Native dt="Employee" name={s(e.name)} module="04" className="dhr-act">{tx("استكمال البنك", "Add bank details")}</Native> })),
    ...draftSlips.filter(inCycle).map((x) => ({ key: "d" + s(x.name), who: s(x.employee_name) || s(x.employee), cat: "slip", dt: "Salary Slip", src: s(x.name), next: <Native dt="Salary Slip" name={s(x.name)} module="04" className="dhr-act">{tx("مراجعة القسيمة", "Review slip")}</Native> })),
    ...cycleBlocked.map((x) => ({ key: "p" + s(x.name), who: s(x.payroll_entry) || s(x.name), cat: "preflight", dt: "DIGIT Payroll Preflight", src: s(x.name), next: <Native dt="DIGIT Payroll Preflight" name={s(x.name)} module="04" className="dhr-act">{tx("مراجعة الفحص", "Review preflight")}</Native> })),
    ...cycleVar.map((x) => ({ key: "v" + s(x.name), who: s(x.employee_name) || s(x.employee) || s(x.name), cat: "variance", dt: "DIGIT Payroll Variance", src: s(x.name), next: <Native dt="DIGIT Payroll Variance" name={s(x.name)} module="04" className="dhr-act">{tx("تفسير الفرق", "Explain variance")}</Native> })),
  ];

  // Blocker & decision panel: cohort-level evidence when a cycle is selected, organization-level otherwise.
  const empAct = (id: string, issue: PreflightIssue, slip?: R) => issue === "no-assignment" || issue === "structure-not-submitted" ? <Native dt="Salary Structure Assignment" module="04" className="dhr-act">{tx("إسناد هيكل", "Assign structure")}</Native> : issue === "bank" ? <Native dt="Employee" name={id} module="04" className="dhr-act">{tx("استكمال البنك", "Add bank details")}</Native> : slip ? <Native dt="Salary Slip" name={s(slip["name"])} module="04" className="dhr-act">{tx("فتح القسيمة", "Open slip")}</Native> : <Native dt="Payroll Entry" name={cycle} module="04" className="dhr-act">{tx("فتح المسير", "Open run")}</Native>;
  const blockers: Blocker[] = selCycle ? [
    ...pf.flatMap((r: PreflightRow) => r.issues.map((i): Blocker => ({ key: r.employee + i, sev: ISSUE_TEXT[i][2], who: r.employeeName, reason: [ISSUE_TEXT[i][0], ISSUE_TEXT[i][1]], scope: ["موظف في الفئة", "Cohort employee"], dt: "Employee", name: r.employee, action: empAct(r.employee, i, r.slip), status: i === "slip-draft" ? ["مسودة", "Draft"] : ["مفتوح", "Open"], tone: ISSUE_TEXT[i][2] === "blocking" ? "danger" : "warn" }))),
    ...cycleBlocked.map((x): Blocker => ({ key: "p" + s(x.name), sev: "blocking", who: s(x.name), reason: ["فحص ما قبل المسير مسجّل كموقوف", "Preflight recorded as blocked"], scope: ["الدورة", "Cycle"], dt: "DIGIT Payroll Preflight", name: s(x.name), action: <Native dt="DIGIT Payroll Preflight" name={s(x.name)} module="04" className="dhr-act">{tx("مراجعة", "Review")}</Native>, status: ["موقوف", "Blocked"], tone: "danger" })),
    ...cycleVar.map((x): Blocker => ({ key: "v" + s(x.name), sev: "review", who: s(x.employee_name) || s(x.employee) || s(x.name), reason: ["فرق مسجّل يحتاج تفسيرًا", "Recorded variance needs explanation"], scope: ["موظف", "Employee"], dt: "DIGIT Payroll Variance", name: s(x.name), action: <Native dt="DIGIT Payroll Variance" name={s(x.name)} module="04" className="dhr-act">{tx("تفسير", "Explain")}</Native>, status: [s(x.variance_status) === "Escalated" ? "مصعّد" : "مفتوح", s(x.variance_status)], tone: s(x.variance_status) === "Escalated" ? "danger" : "warn" })),
  ] : issueRows.map((r): Blocker => { const g = ISSUE_GROUPS.find((x) => x.id === r.cat)!; return { key: r.key, sev: g.tone === "danger" ? "blocking" : "review", who: r.who, reason: [g.ar, g.en], scope: r.dt === "Employee" ? ["كل الدورات", "Every cycle"] : ["سجل", "Record"], dt: r.dt, name: r.src, action: r.next, status: r.cat === "slip" ? ["مسودة", "Draft"] : ["مفتوح", "Open"], tone: g.tone }; });
  const SEV: (QueueGroup & { id: Blocker["sev"] })[] = [{ id: "blocking", ar: "يمنع المعالجة", en: "Blocking", tone: "danger" }, { id: "review", ar: "يحتاج مراجعة", en: "Needs review", tone: "warn" }];
  const blockersReady = selCycle ? cohortReady && src.ready("DIGIT Payroll Preflight", "DIGIT Payroll Variance") : structInferable && src.ready(...ISSUE_SRC);

  const drill = (dt: string, names: string[]) => names.length ? <Native dt={dt} module="04" filters={[["name", "in", names]]} className="dhr-link">{names.length}</Native> : <span>0</span>;
  const ne = <NotEvaluated tx={tx} why={NOT_INFERABLE} />;
  const steps: { id: string; title: [string, string]; state: StepState; note: [string, string]; facts: [string, ReactNode][]; link?: ReactNode }[] = [
    { id: "source", title: ["جاهزية بيانات المصدر", "Source readiness"], state: !src.ready("Employee") ? "not-evaluated" : (selCycle ? has("bank").length : noBank.length) ? "attention" : "ready",
      note: ["موظفون نشطون وبيانات الدفع البنكي لمن يُدفع لهم بتحويل.", "Active employees and bank details for staff paid by bank transfer."],
      facts: [[selCycle ? tx("حجم الفئة", "Cohort size") : tx("موظفون نشطون", "Active employees"), selCycle ? (cohortReady ? drill("Employee", cohort.map((e) => s(e.name))) : ne) : src.v(emps.length, "Employee")], [tx("بلا بيانات بنكية", "No bank details"), selCycle ? (cohortReady ? drill("Employee", has("bank").map((r) => r.employee)) : ne) : src.v(drill("Employee", noBank.map((e) => s(e.name))), "Employee")]] },
    { id: "assignment", title: ["جاهزية إسناد الرواتب", "Salary assignment readiness"], state: !structInferable ? "not-evaluated" : selCycle ? (!cohortReady ? "not-evaluated" : (has("no-assignment").length || has("structure-not-submitted").length) ? "blocked" : "ready") : !structReady ? "not-evaluated" : missingStructure.length ? "blocked" : "ready",
      note: ["الإسناد الساري = آخر إسناد معتمد بتاريخ لا يتجاوز بداية الفترة.", "Effective assignment = latest submitted assignment dated on/before the period start."],
      facts: [[tx("بلا إسناد ساري", "No effective assignment"), !structInferable ? ne : selCycle ? (cohortReady ? drill("Employee", has("no-assignment").map((r) => r.employee)) : ne) : src.v(drill("Employee", missingStructure.map((e) => s(e.name))), "Employee", "Salary Structure Assignment")], ...(selCycle ? [[tx("هيكل غير معتمد", "Structure not submitted"), cohortReady ? drill("Employee", has("structure-not-submitted").map((r) => r.employee)) : ne] as [string, ReactNode]] : [])] },
    { id: "slips", title: ["مراجعة القسائم", "Draft slip review"], state: !selCycle ? "not-evaluated" : !cohortReady ? "not-evaluated" : (has("no-slip").length || has("slip-draft").length) ? "attention" : "ready",
      note: selCycle ? ["قسائم هذه الدورة؛ إنشاء القسائم واعتمادها يتمان على الخادم.", "This cycle's slips; creating and submitting slips runs on the server."] : ["اختر دورة لمراجعة قسائمها.", "Select a cycle to review its slips."],
      facts: selCycle ? [[tx("قسائم الدورة", "Cycle slips"), drill("Salary Slip", cycleSlips.map((x) => s(x.name)))], [tx("مسودة", "Draft"), drill("Salary Slip", cycleSlips.filter((x) => n(x.docstatus) === 0).map((x) => s(x.name)))], [tx("بلا قسيمة", "No slip"), cohortReady ? drill("Employee", has("no-slip").map((r) => r.employee)) : ne]] : [[tx("قسائم مسودة (كل الدورات)", "Draft slips (all cycles)"), src.v(drill("Salary Slip", draftSlips.map((x) => s(x.name))), "Salary Slip")]] },
    { id: "exceptions", title: ["الاستثناءات", "Exceptions"], state: !src.ready("DIGIT Payroll Preflight", "DIGIT Payroll Variance") ? "not-evaluated" : (cycleBlocked.length || (selCycle && has("run-not-eligible").length)) ? "blocked" : (cycleVar.length || (selCycle && has("not-in-run").length)) ? "attention" : "ready",
      note: ["فحوص موقوفة وفروقات مسجلة وانحراف فئة المسير — أدلة لا تُحسب هنا.", "Blocked preflights, recorded variances and run cohort drift — evidence, not computed here."],
      facts: [[tx("فحوص موقوفة", "Blocked preflights"), src.v(drill("DIGIT Payroll Preflight", cycleBlocked.map((x) => s(x.name))), "DIGIT Payroll Preflight")], [tx("فروقات مفتوحة", "Open variances"), src.v(drill("DIGIT Payroll Variance", cycleVar.map((x) => s(x.name))), "DIGIT Payroll Variance")], ...(selCycle && cohortReady ? [[tx("مدرج وغير مؤهل", "In run, not eligible"), drill("Employee", has("run-not-eligible").map((r) => r.employee))], [tx("غير مدرج في المسير", "Not in run table"), drill("Employee", has("not-in-run").map((r) => r.employee))]] as [string, ReactNode][] : [])] },
    { id: "processing", title: ["حالة المعالجة المخوّلة", "Authorized processing status"], state: "server",
      note: selCycle ? (n(selCycle.docstatus) === 1 ? ["المسير معتمد. القيود المحاسبية والدفع تتم على الخادم — لا يُعرض الدفع كمكتمل.", "Run submitted. Accounting entries and payment run on the server — payment is not shown as completed."] : ["المسير مسودة. إنشاء القسائم واعتمادها والقيود والدفع تتم على الخادم.", "Run is a draft. Slip creation, submission, accounting and payment run on the server."]) : ["اختر دورة لعرض حالتها الفعلية.", "Select a cycle to see its actual state."],
      facts: selCycle ? [[tx("حالة المستند", "Document state"), n(selCycle.docstatus) === 1 ? tx("معتمد", "Submitted") : n(selCycle.docstatus) === 2 ? tx("ملغى", "Cancelled") : tx("مسودة", "Draft")], [tx("الدفع", "Payment"), tx("لا يُعرض — خادم", "Not shown — server")]] : [] , link: selCycle ? <Native dt="Payroll Entry" name={s(selCycle.name)} module="04" className="dhr-act">{tx("فتح المسير", "Open run")}</Native> : undefined },
  ];
  const STATE_TEXT: Record<StepState, [string, string, Tone]> = { ready: ["جاهز", "Ready", "success"], attention: ["يحتاج مراجعة", "Needs review", "warn"], blocked: ["موقوف", "Blocked", "danger"], "not-evaluated": ["لم يُقيَّم", "Not evaluated", "neutral"], server: ["على الخادم", "Server", "info"] };
  const payrollReports = REPORTS.filter((r) => r.modules.includes("04"));
  const issueCount = blockers.length;

  return (
    <div className="space-y-4" data-module-home="04">
      <HrCommandHeader embedded={!home} id="04" code="04" suite={tx("الرواتب والمزايا والتشريعات", "Payroll, Rewards & Saudi")} title={tx("غرفة التحكم بالرواتب", "Payroll Control Room")}
        purpose={tx("جاهزية الدورة وعوائقها من سجلات الرواتب — لا حساب ولا ترحيل ولا دفع ولا إرسال إلى GOSI/WPS.", "Cycle readiness and blockers from payroll records — nothing here calculates, posts, pays or submits to GOSI/WPS.")}
        actions={<><Native dt="Payroll Entry" module="04" className="dhr-act dhr-act-primary">{tx("المسيرات", "Payroll entries")}</Native><Native dt="Salary Slip" module="04" className="dhr-act">{tx("القسائم", "Salary slips")}</Native></>}>
        <HrContextToolbar scopeKey={cycle} end={<><SourcesPill src={src} /><Pill tone="warn" title={tx("لا حسابات نظامية ولا تحويلات بنكية ولا تكاملات GOSI/WPS ولا قيود ترحيل في هذه المعاينة.", "No statutory calculations, bank transfers, GOSI/WPS integrations or ledger postings in this preview.")}>{tx("بلا ترحيل أو دفع", "No posting or payment")}</Pill></>}>
          <CtxField label={tx("الدورة", "Cycle")}>
            <select aria-label={tx("دورة الرواتب", "Payroll cycle")} value={cycle} onChange={(e) => patch({ cycle: e.target.value })} className="max-w-[20rem]" data-no-i18n>
              <option value="">{tx("كل الدورات", "All cycles")}</option>
              {entries.map((e) => <option key={s(e.name)} value={s(e.name)}>{s(e.name)} · {"\u2066"}{s(e.start_date)} → {s(e.end_date)}{"\u2069"}</option>)}
            </select>
          </CtxField>
          {selCycle && <>
            <Pill><span data-no-i18n>{tx(arLabel(s(selCycle.company)), s(selCycle.company)) || "—"}</span></Pill>
            <Pill><span data-no-i18n><DateRange from={selCycle.start_date} to={selCycle.end_date} /></span></Pill>
            <Native dt="Payroll Entry" name={s(selCycle.name)} module="04" className="dhr-link dhr-code">{s(selCycle.name)}</Native>
            <Pill tone={n(selCycle.docstatus) === 1 ? "info" : "warn"}>{n(selCycle.docstatus) === 1 ? tx("معتمد", "Submitted") : tx("مسودة", "Draft")}</Pill>
          </>}
        </HrContextToolbar>
      </HrCommandHeader>
      {cycleUnknown && <p role="alert" className="dhr-alert text-sm" data-cycle-denied>{tx("الدورة المطلوبة غير متاحة ضمن صلاحياتك؛ لا تُعرض دورة أخرى بدلًا منها.", "The requested cycle is not available in your scope; no other cycle is shown instead.")}</p>}
      <SourceNotice src={src} quietLoading />

      {entries.length > 0 && (
        <nav className="dhr-cycle-rail" aria-label={tx("دورات الرواتب", "Payroll cycles")} data-cycle-rail>
          <button type="button" className="dhr-cycle" aria-pressed={!cycle} onClick={() => patch({ cycle: "" })}>
            <span className="text-[12.5px] font-semibold">{tx("مستوى المؤسسة", "Organization level")}</span>
            <span className="text-[11.5px] text-[var(--dhr-muted)]">{tx("كل الدورات · مشكلات الموظفين", "All cycles · employee issues")}</span>
          </button>
          {entries.slice(0, 6).map((e) => { const ps = slips.filter((x) => s(x.payroll_entry) === s(e.name)); const bl = blocked.filter((b) => s(b.payroll_entry) === s(e.name)).length; const on = cycle === s(e.name); return (
            <button key={s(e.name)} type="button" className="dhr-cycle" aria-pressed={on} onClick={() => patch({ cycle: on ? "" : s(e.name) })} data-pick-cycle={s(e.name)}>
              <span className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1"><span className="dhr-code whitespace-nowrap text-[12px] font-semibold" data-no-i18n>{s(e.name)}</span><Chip tone={n(e.docstatus) === 1 ? "neutral" : "warn"}>{n(e.docstatus) === 1 ? tx("معتمد", "Submitted") : tx("مسودة", "Draft")}</Chip></span>
              <DateRange from={s(e.start_date)} to={s(e.end_date)} className="text-[11.5px] text-[var(--dhr-muted)]" />
              <span className="flex flex-wrap gap-x-3 text-[11.5px]"><span>{tx("قسائم", "Slips")} <b className="dhr-tnum" data-no-i18n>{ps.length}</b></span>{bl > 0 && <span className="text-[var(--dhr-danger)]">{tx("موقوف", "Blocked")} <b className="dhr-tnum" data-no-i18n>{bl}</b></span>}</span>
            </button>); })}
        </nav>
      )}

      <HrWorkspaceGrid split="7/5" mobileSideFirst
        main={
          <HrInsightPanel title={selCycle ? <>{tx("مسار جاهزية الدورة", "Cycle readiness process")} <span className="dhr-code text-[var(--dhr-muted)]" data-no-i18n>{s(selCycle.name)}</span></> : tx("مسار جاهزية الرواتب", "Payroll readiness process")} data-payroll-control
            meta={selCycle ? tx("من سجلات هذه الدورة وفئتها المؤهلة", "From this cycle's records and eligible cohort") : tx("مستوى المؤسسة · اختر دورة لتقييم القسائم والمعالجة", "Organization level · pick a cycle to evaluate slips and processing")}
            info={tx("كل مرحلة محسوبة من السجلات المسجلة فقط. «المعالجة» تبقى على الخادم؛ الجاهزية لا تعني أن المسير مُعالج أو مدفوع. لا حسابات نظامية ولا تحويلات بنكية ولا GOSI/WPS ولا قيود ترحيل هنا.", "Each stage is computed from recorded data only. \"Processing\" stays on the server; readiness does not mean the run is processed or paid. No statutory calculations, bank transfers, GOSI/WPS or ledger postings here.")}>
            <ol>
              {steps.map((st, i) => { const [ar, en, tone] = STATE_TEXT[st.state]; return (
                <li key={st.id} className="dhr-step" data-state={st.state} data-step={st.id}>
                  <span className="dhr-step-n" aria-hidden data-no-i18n>{i + 1}</span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-[13.5px] font-semibold">{tx(...st.title)}</h3><span className="flex items-center gap-2"><Pill tone={tone}>{tx(ar, en)}</Pill>{st.link}</span></div>
                    <p className="mt-0.5 text-[12px] text-[var(--dhr-muted)]">{tx(...st.note)}</p>
                    {st.facts.length > 0 && <dl className="mt-2 flex flex-wrap gap-x-6 gap-y-1.5">{st.facts.map(([k, v]) => <div key={k} className="min-w-0"><dt className="text-[11px] text-[var(--dhr-muted)]">{k}</dt><dd className="dhr-tnum text-[16px] font-semibold" data-no-i18n>{v}</dd></div>)}</dl>}
                  </div>
                </li>); })}
            </ol>
          </HrInsightPanel>
        }
        side={
          <HrInsightPanel title={tx("العوائق والقرارات", "Blockers & decisions")} flush data-payroll-blockers={blockersReady ? issueCount : ""}
            meta={blockersReady ? <><b className="dhr-tnum" data-no-i18n>{issueCount}</b> {selCycle ? tx("ملاحظة في هذه الدورة", "findings in this cycle") : tx("ملاحظة على مستوى المؤسسة", "organization-level findings")}</> : tx("المصدر · السبب · النطاق · الدليل · الإجراء", "Source · reason · scope · evidence · action")}>
            {!structInferable ? <div className="p-4"><p className="text-sm text-[var(--dhr-muted)]" data-inference="NOT_EVALUATED">{tx(...NOT_INFERABLE)}</p></div>
              : !blockersReady ? <div className="p-4"><HrEmptyOrBlockedState read={src.worst(...ISSUE_SRC, "Salary Structure") ?? { state: "LOADING" }} tx={tx} rows={5} /></div>
              : <HrPriorityQueue<Blocker> label={tx("عوائق الرواتب", "Payroll blockers")} tx={tx} items={blockers} groups={SEV} groupOf={(b) => b.sev} keyOf={(b) => b.key} toneOf={(b) => b.tone} maxHeight="560px"
                  empty={<div className="p-4"><HrEmptyOrBlockedState tx={tx} title={tx("لا عوائق مسجلة.", "No recorded blockers.")} body={tx("عدم وجود عوائق لا يعني أن المسير مُعالج أو مدفوع.", "No blockers does not mean the run is processed or paid.")} /></div>}
                  render={(b) => (
                    <div className="grid gap-1">
                      <div className="flex items-start justify-between gap-2">
                        <span className="min-w-0"><span className="block truncate text-[13px] font-semibold" data-no-i18n>{tx(arLabel(b.who), b.who)}</span><span className="block text-[12px]">{tx(...b.reason)}</span></span>
                        <Chip tone={b.tone === "danger" ? "danger" : "warn"}>{tx(...b.status)}</Chip>
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-2 text-[11.5px] text-[var(--dhr-muted)]">
                        <span data-no-i18n>{tx(...b.scope)} · <Native dt={b.dt} name={b.name} module="04" className="dhr-link dhr-code !text-[11px]">{b.name}</Native></span>
                        {b.action}
                      </div>
                    </div>
                  )} />}
          </HrInsightPanel>
        }
      />

      {selCycle && <CohortPreflight pe={selCycle} rows={pf} size={cohort.length} inferable={structInferable} ready={cohortReady} notReady={<HrEmptyOrBlockedState read={src.worst(...COHORT_SRC) ?? { state: "LOADING" }} tx={tx} rows={3} />} tx={tx} />}

      <div className="grid gap-4 xl:grid-cols-12">
        <HrInsightPanel className="xl:col-span-7" title={tx("سجل الدورات", "Cycle history")} meta={tx("كل مسير مع قسائمه وفحوصه الموقوفة. اضغط لاختيار الدورة.", "Each run with its slips and blocked preflights. Select to review the cycle.")} flush data-cycle-history={entries.length}>
          {entries.length ? (
            <ul className="divide-y divide-[var(--dhr-sep)]">{entries.slice(0, 12).map((e) => { const ps = slips.filter((x) => s(x.payroll_entry) === s(e.name)); const dr = ps.filter((x) => n(x.docstatus) === 0).length; const bl = blocked.filter((b) => s(b.payroll_entry) === s(e.name)).length; return (
              <li key={s(e.name)} className={`flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 ${cycle === s(e.name) ? "bg-[color-mix(in_oklab,var(--dhr-mint)_12%,transparent)]" : ""}`}>
                <span className="min-w-0"><button type="button" onClick={() => patch({ cycle: cycle === s(e.name) ? "" : s(e.name) })} aria-pressed={cycle === s(e.name)} className="dhr-link dhr-code text-[12.5px] font-semibold">{s(e.name)}</button><span className="ms-2 inline-block text-[12px] text-[var(--dhr-muted)]" dir="ltr" data-no-i18n>{s(e.start_date)} → {s(e.end_date)}</span></span>
                <span className="flex flex-wrap items-center gap-1.5 text-xs">
                  <Chip tone={n(e.docstatus) === 1 ? "neutral" : "warn"}>{n(e.docstatus) === 1 ? tx("معتمد", "Submitted") : tx("مسودة", "Draft")}</Chip>
                  <Chip>{tx("قسائم", "slips")} <b data-no-i18n>{ps.length}</b></Chip>
                  {dr > 0 && <Chip tone="warn">{tx("مسودة", "draft")} <b data-no-i18n>{dr}</b></Chip>}
                  {bl > 0 && <Chip tone="danger">{tx("موقوف", "blocked")} <b data-no-i18n>{bl}</b></Chip>}
                  <Native dt="Payroll Entry" name={s(e.name)} module="04" className="dhr-act">{tx("فتح", "Open")}</Native>
                </span>
              </li>); })}</ul>
          ) : <div className="p-4"><HrEmptyOrBlockedState read={src.read("Payroll Entry")} tx={tx} title={tx("لا توجد مسيرات رواتب.", "No payroll entries.")} action={<Native dt="Payroll Entry" module="04" className="dhr-act">{tx("المسيرات", "Payroll entries")}</Native>} /></div>}
        </HrInsightPanel>
        <div className="flex flex-col gap-4 xl:col-span-5">
          <HrInsightPanel title={tx("فروقات مسجلة", "Recorded variances")} meta={tx("أدلة فروقات تحتاج تفسيرًا — لا تُحسب هنا.", "Variance evidence needing explanation — not computed here.")} flush>
            {variances.length ? <ul className="divide-y divide-[var(--dhr-sep)]">{variances.slice(0, 8).map((v) => (
              <li key={s(v.name)} className="flex min-h-11 items-center justify-between gap-2 px-4 py-2"><Native dt="DIGIT Payroll Variance" name={s(v.name)} module="04" className="dhr-link min-w-0 truncate text-[13px]"><span data-no-i18n>{tx(arLabel(s(v.employee_name) || s(v.employee) || s(v.name)), s(v.employee_name) || s(v.employee) || s(v.name))}</span></Native><span className="flex items-center gap-2">{admin && <span data-no-i18n className="dhr-tnum text-xs">{s(v.variance_amount)}</span>}<Chip tone={s(v.variance_status) === "Escalated" ? "danger" : "warn"}>{tr(s(v.variance_status))}</Chip></span></li>))}</ul>
              : <div className="p-4"><HrEmptyOrBlockedState read={src.read("DIGIT Payroll Variance")} tx={tx} title={tx("لا فروقات مفتوحة مسجلة.", "No open variances recorded.")} /></div>}
          </HrInsightPanel>
          <HrInsightPanel title={tx("الهياكل المعتمدة", "Approved structures")} flush>
            {structures.length ? <ul className="divide-y divide-[var(--dhr-sep)]">{structures.slice(0, 6).map((x) => <li key={s(x.name)} className="flex min-h-10 items-center justify-between gap-2 px-4 py-1.5"><Native dt="Salary Structure" name={s(x.name)} module="04" className="dhr-link min-w-0 truncate text-[13px]"><span data-no-i18n>{tx(arLabel(s(x.name)), s(x.name))}</span></Native><Chip><span data-no-i18n>{tx(arLabel(s(x.company)), s(x.company))}</span></Chip></li>)}</ul> : <div className="p-4"><HrEmptyOrBlockedState read={src.read("Salary Structure")} tx={tx} title={tx("لا هياكل معتمدة.", "No submitted structures.")} /></div>}
          </HrInsightPanel>
        </div>
      </div>

      <HrInsightPanel title={tx("سجل مشكلات الرواتب", "Payroll issue register")} meta={selCycle ? <span className="dhr-code" data-no-i18n>{s(selCycle.name)}</span> : tx("كل الدورات", "All cycles")} info={tx("مشكلات الموظفين (هيكل، بنك) تخص كل الدورات؛ القسائم والفحوص والفروقات تتبع الدورة المحددة.", "Employee issues (structure, bank) apply to every cycle; slips, preflights and variances follow the selected cycle.")} data-payroll-issues>
        <WorkTable<Issue> label="payroll-issues" tx={tx} rows={structInferable ? issueRows : issueRows.filter((r) => r.cat !== "structure")} emptyState={src.ready(...ISSUE_SRC) ? undefined : <HrEmptyOrBlockedState read={src.worst(...ISSUE_SRC)} tx={tx} rows={3} />} rowKey={(r) => r.key} groups={ISSUE_GROUPS} groupOf={(r) => r.cat} searchText={(r) => `${r.who} ${r.src}`}
          cols={[
            { key: "w", ar: "الموظف / المستند", en: "Employee / document", sort: (r) => r.who, render: (r) => <span data-no-i18n className="font-medium">{tx(arLabel(r.who), r.who)}</span> },
            { key: "c", ar: "الفئة", en: "Issue", sort: (r) => r.cat, render: (r) => { const g = ISSUE_GROUPS.find((x) => x.id === r.cat); return g ? <Chip tone={g.tone}>{tx(g.ar, g.en)}</Chip> : null; } },
            { key: "s", ar: "السجل المصدر", en: "Source record", render: (r) => <span data-no-i18n className="text-xs"><Native dt={r.dt} name={r.src} module="04" className="dhr-link">{r.src}</Native></span> },
            { key: "a", ar: "الخطوة التالية", en: "Next step", render: (r) => r.next },
          ]} />
      </HrInsightPanel>

      <div className="grid gap-4 xl:grid-cols-12">
        <HrInsightPanel className="xl:col-span-7" title={tx("سجل القسائم", "Salary slip register")} meta={admin ? tx("القسائم المتاحة لك؛ المبالغ تبقى في القسيمة الأصلية.", "Slips visible to you; amounts stay in the native slip.") : tx("قسائمك المتاحة فقط.", "Only the slips you may see.")}>
          <WorkTable<R> label="salary-slips" tx={tx} rows={selCycle ? cycleSlips : slips} rowKey={(x) => s(x.name)} pageSize={8} minWidth={560} emptyState={src.ready("Salary Slip") ? undefined : <HrEmptyOrBlockedState read={src.read("Salary Slip")} tx={tx} rows={3} />} searchText={(x) => `${s(x.employee_name)} ${s(x.employee)} ${s(x.name)}`}
            cols={[
              { key: "e", ar: "الموظف", en: "Employee", sort: (x) => s(x.employee_name), render: (x) => <span data-no-i18n><Native dt="Salary Slip" name={s(x.name)} module="04" className="dhr-link font-medium">{tx(arLabel(s(x.employee_name) || s(x.employee)), s(x.employee_name) || s(x.employee))}</Native><span className="block text-[11px] text-[var(--dhr-muted)]">{s(x.name)}</span></span> },
              { key: "p", ar: "الفترة", en: "Period", sort: (x) => s(x.start_date), render: (x) => <span data-no-i18n className="text-xs"><DateRange from={x.start_date} to={x.end_date} /></span> },
              { key: "r", ar: "المسير", en: "Run", render: (x) => <span data-no-i18n className="dhr-code text-xs">{s(x.payroll_entry) || "—"}</span> },
              { key: "d", ar: "الحالة", en: "State", sort: (x) => n(x.docstatus), render: (x) => n(x.docstatus) === 1 ? <Chip>{tx("معتمدة", "Submitted")}</Chip> : <Chip tone="warn">{tx("مسودة", "Draft")}</Chip> },
            ]} />
        </HrInsightPanel>
        <HrInsightPanel className="xl:col-span-5" title={tx("تقارير الرواتب", "Payroll reports")} meta={tx("الحالة الفعلية لفتح كل تقرير لدورك.", "What opening each report does for your role.")} flush data-payroll-reports>
          <ul className="divide-y divide-[var(--dhr-sep)]">{payrollReports.map((r) => (
            <li key={r.report} className="flex min-h-11 items-center justify-between gap-2 px-4 py-2"><Link to="/report/$name" params={{ name: r.report }} className="dhr-link min-w-0 truncate text-[13px]">{tx(REPORT_AR[r.report] ?? r.report, r.report)}</Link><ReportModeBadge report={r.report} refDoctype={r.ref} /></li>))}</ul>
        </HrInsightPanel>
      </div>
    </div>
  );
}

const PF_GROUPS = [
  { id: "blocked", ar: "موقوف", en: "Blocked", tone: "danger" as const },
  { id: "attention", ar: "يحتاج مراجعة", en: "Needs review", tone: "warn" as const },
  { id: "ready", ar: "جاهز", en: "Ready" },
  { id: "drift", ar: "خارج الفئة المؤهلة", en: "No longer eligible", tone: "danger" as const },
];
const PF_TEXT: Record<PreflightIssue, [string, string, "danger" | "warn"]> = {
  "no-assignment": ["بلا إسناد راتب ساري", "No effective salary assignment", "danger"],
  "structure-not-submitted": ["الهيكل غير معتمد", "Structure not submitted", "danger"],
  bank: ["بلا بيانات بنكية", "No bank details", "warn"],
  "no-slip": ["بلا قسيمة", "No slip", "warn"],
  "slip-draft": ["قسيمة مسودة", "Draft slip", "warn"],
  "not-in-run": ["غير مدرج في جدول المسير", "Not in the run's employee table", "warn"],
  "run-not-eligible": ["مدرج لكنه لم يعد مؤهلًا", "In the run but no longer eligible", "danger"],
};
const groupOfPf = (r: PreflightRow) => r.issues.includes("run-not-eligible") ? "drift" : r.issues.some((i) => i === "no-assignment" || i === "structure-not-submitted") ? "blocked" : r.issues.length ? "attention" : "ready";

/** Effective cohort of the selected Payroll Entry (Core fill_employee_details criteria) with read-only preflight evidence. */
function CohortPreflight({ pe, rows, size, inferable, ready, notReady, tx }: { pe: R; rows: PreflightRow[]; size: number; inferable: boolean; ready: boolean; notReady: ReactNode; tx: (a: string, b: string) => string }) {
  const head = <h2 className="dhr-panel-t">{tx("الفئة المؤهلة للدورة وفحص ما قبل المسير", "Cycle cohort & preflight")} <span className="text-xs font-normal text-[var(--dhr-muted)]" data-no-i18n>{s(pe.name)} · <DateRange from={pe.start_date} to={pe.end_date} /></span></h2>;
  if (!inferable) return <section className="dhr-panel p-4" data-payroll-cohort="not-evaluated">{head}<p className="py-2 text-sm text-[var(--dhr-muted)]" data-inference="NOT_EVALUATED">{tx(...NOT_INFERABLE)}</p></section>;
  if (!ready) return <section className="dhr-panel p-4" data-payroll-cohort="not-ready">{head}{notReady}</section>;
  const ready_ = rows.filter((r) => groupOfPf(r) === "ready").length;
  return (
    <section className="dhr-panel" data-payroll-cohort={s(pe.name)} data-cohort-size={size} data-cohort-ready={ready_}>
      <div className="dhr-panel-h"><div className="min-w-0">{head}<div className="dhr-panel-m">{tx("الفئة = موظفون نشطون في شركة المسير يطابقون مرشحاته، التحقوا قبل نهاية الفترة ولم تنتهِ خدمتهم قبل بدايتها. «فرق صافي الراتب» فرق مسجل عن القسيمة المعتمدة السابقة وليس تفسيرًا.", "Cohort = active employees of the run's company matching its filters, joined before the period end and not relieved before its start. \"Net change\" is a recorded difference from the previous submitted slip, not an explanation.")}</div></div></div>
      <div className="dhr-panel-b">
        <WorkTable<PreflightRow> label="payroll-cohort" tx={tx} rows={rows} rowKey={(r) => r.employee} groups={PF_GROUPS} groupOf={groupOfPf} pageSize={12} minWidth={880} searchText={(r) => `${r.employeeName} ${r.employee}`}
          cols={[
            { key: "e", ar: "الموظف", en: "Employee", sort: (r) => r.employeeName, render: (r) => <span data-no-i18n><Native dt="Employee" name={r.employee} module="04" className="dhr-link font-medium">{tx(arLabel(r.employeeName), r.employeeName)}</Native><span className="block text-[11px] text-[var(--dhr-muted)]">{r.employee}</span></span> },
            { key: "a", ar: "الإسناد الساري", en: "Effective assignment", render: (r) => r.assignment ? <span data-no-i18n className="text-xs"><Native dt="Salary Structure Assignment" name={s(r.assignment["name"])} module="04" className="dhr-link">{s(r.assignment["name"])}</Native> · {s(r.assignment["from_date"])}</span> : <span className="text-xs text-[var(--dhr-muted)]">—</span> },
            { key: "s", ar: "القسيمة", en: "Slip", render: (r) => r.slip ? <span data-no-i18n className="text-xs"><Native dt="Salary Slip" name={s(r.slip["name"])} module="04" className="dhr-link">{s(r.slip["name"])}</Native> · {n(r.slip["docstatus"]) === 1 ? tx("معتمدة", "Submitted") : tx("مسودة", "Draft")}</span> : <span className="text-xs text-[var(--dhr-muted)]">—</span> },
            { key: "c", ar: "فرق صافي الراتب", en: "Net change", sort: (r) => r.netChange ?? 0, render: (r) => r.netChange === null ? <span className="text-xs text-[var(--dhr-muted)]">—</span> : <span data-no-i18n className="text-xs" data-net-change={r.netChange}>{r.netChange > 0 ? "+" : ""}{fmtCurrency(r.netChange)}{r.previous ? <span className="ms-1 text-[var(--dhr-muted)]">({tx("مقابل", "vs")} {s(r.previous["start_date"]).slice(0, 7)})</span> : null}</span> },
            { key: "i", ar: "الملاحظات", en: "Findings", render: (r) => r.issues.length ? <span className="flex flex-wrap gap-1">{r.issues.map((i) => <Chip key={i} tone={PF_TEXT[i][2]}>{tx(PF_TEXT[i][0], PF_TEXT[i][1])}</Chip>)}</span> : <Chip>{tx("جاهز", "Ready")}</Chip> },
          ]} />
      </div>
    </section>
  );
}

