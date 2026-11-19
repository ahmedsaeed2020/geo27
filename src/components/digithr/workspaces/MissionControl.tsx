/**
 * Screen 00 — HR Mission Control (Premium V2). Hero: cross-module priority workspace grouped by business priority,
 * each row = what happened · source record · why · owner · date · eligible next action, with an inspector.
 * Side: decision panel (indicators = metric drills, today/period, upcoming dated events, where the work is).
 * Lower: seven-module navigator and document/report access. Company + period scope stay in the URL (shared contract
 * with every metric drill and Back). Personal widget visibility/order persists per user (System → Personal override).
 */
import { decisionErrorText } from "@/plugins/digit_hr/product/approvals";
import { RoleHome } from "@/components/digithr/product/RoleHome";
import { useEffect, useState, type ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { ArrowDown, ArrowUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTx } from "@/components/digithr/DigitHrLayout";
import { useModuleScope, MetricValue } from "@/components/digithr/ModuleScope";
import { MetricLink, metricReturn, commandScope } from "@/components/digithr/MetricLink";
import { COMMAND_TILES } from "@/components/digithr/workspaces/CommandCenterWorkspace";
import { adapter, useStoreVersion } from "@/lib/adapter";
import { cachedMeta } from "@/lib/catalog";
import { leaveContext } from "@/plugins/digit_hr/compat/leaveContext";
import { useScopeMetas } from "@/plugins/digit_hr/compat/scope";
import { currentUser, userRoles, useSessionUser } from "@/plugins/digit_hr/compat/session";
import { isHrAdmin, resolveEmployee } from "@/plugins/digit_hr/compat/employeeIdentity";
import { decideLeave } from "@/plugins/digit_hr/operations";
import { hrMetric, HR_METRICS } from "@/plugins/digit_hr/hrMetrics";
import { METRIC_AR } from "@/plugins/digit_hr/metricLabels";
import { upcomingEvents, workByModule, type UpcomingKind } from "@/plugins/digit_hr/missionFacts";
import { statusFor } from "@/plugins/digit_hr/service";
import { MODULES } from "@/plugins/digit_hr/v5/data";
import { t as tr } from "@/i18n";
import { Native, arLabel, useSources, SourceNotice, SourceMark, DateRange, s, n } from "./shared";
import { ClearScope, CompanyScope, Facts, HrCommandHeader, HrContextInspector, HrContextToolbar, HrEmptyOrBlockedState, HrInsightPanel, HrPriorityQueue, HrSectionNavigator, HrWorkspaceGrid, Meter, PeriodScope, Pill, ScopeDenied, Seg, SourcesPill, relDay, useMinWidth, useSearchPatch, useToday, type QueueGroup, type Tone } from "../home/kit";

const WIDGETS = ["kpis", "queue", "intel", "docs", "reports"] as const;
type W = (typeof WIDGETS)[number];
type Prefs = { order: W[]; hidden: W[] };
const DEFAULT: Prefs = { order: [...WIDGETS], hidden: [] };
const prefKey = (u: string) => `digit-hr:c02:prefs:${u}`;
function usePrefs(user: string) {
  const [p, setP] = useState<Prefs>(DEFAULT);
  useEffect(() => { try { const v = JSON.parse(localStorage.getItem(prefKey(user)) || "null"); setP(v?.order ? { order: WIDGETS.filter((w) => v.order.includes(w)).length === WIDGETS.length ? v.order : [...WIDGETS], hidden: v.hidden ?? [] } : DEFAULT); } catch { setP(DEFAULT); } }, [user]);
  const save = (np: Prefs) => { setP(np); localStorage.setItem(prefKey(user), JSON.stringify(np)); };
  const reset = () => { setP(DEFAULT); localStorage.removeItem(prefKey(user)); };
  return { p, save, reset };
}

type Cat = "approval" | "lifecycle" | "attendance" | "onboarding" | "payroll" | "document";
type Item = { cat: Cat; dt: string; name: string; what: [string, string]; who: string; dept: string; status: string; why: [string, string]; date: string; dateKind: "since" | "due" | "effective"; owner: string; section: string; module: string; tone: Tone; leave?: boolean; to?: string };
const GROUPS: (QueueGroup & { id: Cat })[] = [
  { id: "approval", ar: "موافقات معلقة", en: "Pending approvals", tone: "warn" },
  { id: "lifecycle", ar: "تغييرات دورة حياة الموظف", en: "Employee lifecycle changes", tone: "info" },
  { id: "attendance", ar: "مسائل الحضور", en: "Attendance issues", tone: "warn" },
  { id: "onboarding", ar: "مهام التهيئة", en: "Onboarding tasks", tone: "info" },
  { id: "payroll", ar: "عوائق جاهزية الرواتب", en: "Payroll readiness blockers", tone: "danger" },
  { id: "document", ar: "العقود والوثائق", en: "Contracts & documents", tone: "warn" },
];
const UP_TEXT: Record<UpcomingKind, [string, string]> = { "document-expiry": ["انتهاء وثيقة", "Document expires"], "leave-start": ["بداية إجازة معتمدة", "Approved leave starts"], interview: ["مقابلة مجدولة", "Interview scheduled"], joining: ["التحاق موظف جديد", "New joiner starts"], "cycle-end": ["نهاية دورة تقييم", "Appraisal cycle ends"] };
const KPIS: { label: string; ar: string; en: string; tone?: Tone }[] = [
  { label: "Active Headcount", ar: "موظفون نشطون", en: "Active employees" },
  { label: "Pending Approvals", ar: "موافقات معلّقة", en: "Pending approvals", tone: "warn" },
  { label: "Pending Leave", ar: "طلبات إجازة مفتوحة", en: "Open leave requests", tone: "warn" },
  { label: "Expiring Documents", ar: "وثائق تنتهي/منتهية", en: "Documents expiring", tone: "danger" },
  { label: "Open onboarding", ar: "تهيئة غير مكتملة", en: "Open onboarding", tone: "warn" },
  { label: "Incomplete records", ar: "ملفات ناقصة", en: "Incomplete records", tone: "warn" },
];

export function MissionControl() {
  useStoreVersion(); const user = useSessionUser();
  useScopeMetas(["Employee", "Leave Application", "Leave Allocation", "Attendance Request", "Employee Onboarding", "Expense Claim", "Employee Transfer", "Employee Promotion", "DIGIT Document Renewal", "DIGIT Employment Contract", "DIGIT Payroll Preflight", "DIGIT Payroll Variance", "Interview", "Appraisal Cycle", ...Object.values(HR_METRICS).flatMap((f) => (f() ?? []).map((d) => d.doctype))]);
  const { tx } = useTx();
  const src = useSources(tx);
  const scope = useModuleScope(src);
  const search = useRouterState({ select: (st) => st.location.search }) as Record<string, unknown>;
  const patch = useSearchPatch();
  const today = useToday();
  const wide = useMinWidth(1280);
  const { p, save, reset } = usePrefs(user);
  const [customize, setCustomize] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirm, setConfirm] = useState<{ name: string; status: "Approved" | "Rejected" } | null>(null);
  const cat = (typeof search["cat"] === "string" ? search["cat"] : "all") as "all" | Cat;
  const focus = typeof search["focus"] === "string" ? (search["focus"] as string) : "";

  const rowsIn = (dt: string) => scope.filter(src.rows(dt));
  const allEmps = src.rows("Employee");
  const deptOf = (id: string) => s(allEmps.find((e) => e.name === id)?.department);
  const Q_SRC = ["Employee", "Leave Application", "Expense Claim", "Employee Transfer", "Employee Promotion", "Attendance Request", "Employee Onboarding", "DIGIT Document Renewal"];
  const qReady = src.ready(...Q_SRC) && scope.companyKnown;

  const items: Item[] = !qReady ? [] : [
    ...rowsIn("Leave Application").filter((d) => n(d.docstatus) === 0 && s(d.status || "Open") === "Open").map((d): Item => {
      const c = leaveContext(d, deptOf);
      return { cat: "approval", dt: "Leave Application", name: s(d.name), what: [`طلب ${arLabel(s(d.leave_type))} · ${n(d.total_leave_days)} يوم`, `${s(d.leave_type)} request · ${n(d.total_leave_days)} day(s)`], who: s(d.employee_name || d.employee), dept: s(d.department) || deptOf(s(d.employee)), status: s(d.status || "Open"),
        why: c.available ? [`الرصيد ${c.balance} ← ${c.after}${c.short ? " · رصيد غير كافٍ" : ""} · تداخل الفريق ${c.overlaps}`, `Balance ${c.balance} → ${c.after}${c.short ? " · insufficient" : ""} · team overlap ${c.overlaps}`] : ["الرصيد والتداخل غير متاحين لصلاحيتك", "Balance and overlap unavailable to you"],
        date: s(d.from_date), to: s(d.to_date), dateKind: "effective", owner: s(d.leave_approver), section: "03.1", module: "03", tone: c.short ? "danger" : "warn", leave: true };
    }),
    ...rowsIn("Expense Claim").filter((d) => n(d.docstatus) === 0 && s(d.approval_status || "Draft") === "Draft").map((d): Item => ({ cat: "approval", dt: "Expense Claim", name: s(d.name), what: ["مطالبة مصروفات", "Expense claim"], who: s(d.employee_name || d.employee), dept: s(d.department) || deptOf(s(d.employee)), status: s(d.approval_status || "Draft"), why: ["بانتظار قرار المعتمد", "Awaiting the approver's decision"], date: s(d.posting_date || d.creation), dateKind: "since", owner: s(d.expense_approver), section: "04.5", module: "04", tone: "warn" })),
    ...[...rowsIn("Employee Transfer").map((d) => ({ d, dt: "Employee Transfer" })), ...rowsIn("Employee Promotion").map((d) => ({ d, dt: "Employee Promotion" }))].filter(({ d }) => n(d.docstatus) === 0).map(({ d, dt }): Item => ({ cat: "lifecycle", dt, name: s(d.name), what: dt === "Employee Transfer" ? ["نقل وظيفي مسودة", "Draft transfer"] : ["ترقية مسودة", "Draft promotion"], who: s(d.employee_name || d.employee), dept: s(d.department) || deptOf(s(d.employee)), status: "Draft", why: ["لا تُطبَّق على سجل الموظف قبل الاعتماد", "Not applied to the employee record until submitted"], date: s(d.transfer_date || d.promotion_date), dateKind: "effective", owner: "", section: "01.5", module: "01", tone: "info" })),
    ...rowsIn("Attendance Request").filter((d) => n(d.docstatus) === 0).map((d): Item => ({ cat: "attendance", dt: "Attendance Request", name: s(d.name), what: [`طلب تصحيح حضور · ${arLabel(s(d.reason))}`, `Attendance correction · ${s(d.reason)}`], who: s(d.employee_name || d.employee), dept: s(d.department) || deptOf(s(d.employee)), status: "Draft", why: ["الحضور لا يُصحَّح قبل اعتماد الطلب", "Attendance is not corrected until the request is submitted"], date: s(d.from_date), dateKind: "effective", owner: "", section: "03.2", module: "03", tone: "warn" })),
    ...rowsIn("Employee Onboarding").filter((d) => n(d.docstatus) !== 2 && s(d.boarding_status) !== "Completed").map((d): Item => ({ cat: "onboarding", dt: "Employee Onboarding", name: s(d.name), what: ["تهيئة لم تكتمل", "Onboarding not completed"], who: s(d.employee_name || d.job_applicant), dept: s(d.department), status: s(d.boarding_status || "Pending"), why: ["مهام التهيئة المسؤولة داخل السجل لم تُغلق", "Responsible onboarding tasks inside the record are still open"], date: s(d.date_of_joining || d.boarding_begins_on), dateKind: "due", owner: "", section: "02.2", module: "02", tone: "info" })),
    ...rowsIn("DIGIT Payroll Preflight").filter((d) => n(d.docstatus) !== 2 && s(d.preflight_status) === "Blocked").map((d): Item => ({ cat: "payroll", dt: "DIGIT Payroll Preflight", name: s(d.name), what: ["فحص ما قبل المسير موقوف", "Payroll preflight blocked"], who: s(d.payroll_entry), dept: "", status: "Blocked", why: ["مسجّل كموقوف — يحتاج مراجعة قبل المعالجة على الخادم", "Recorded as blocked — needs review before server processing"], date: s(d.modified).slice(0, 10), dateKind: "since", owner: "", section: "04.1", module: "04", tone: "danger" })),
    ...rowsIn("DIGIT Payroll Variance").filter((d) => ["Open", "Escalated"].includes(s(d.variance_status))).map((d): Item => ({ cat: "payroll", dt: "DIGIT Payroll Variance", name: s(d.name), what: ["فرق رواتب يحتاج تفسيرًا", "Payroll variance needs explanation"], who: s(d.employee_name || d.employee), dept: "", status: s(d.variance_status), why: ["فرق مسجّل — لا يُحسب هنا", "Recorded difference — not computed here"], date: s(d.modified).slice(0, 10), dateKind: "since", owner: "", section: "04.1", module: "04", tone: s(d.variance_status) === "Escalated" ? "danger" : "warn" })),
    ...rowsIn("DIGIT Document Renewal").map((d) => ({ d, st: statusFor(s(d.expiry_date), d.status) })).filter(({ st }) => st === "Expiring" || st === "Expired").map(({ d, st }): Item => ({ cat: "document", dt: "DIGIT Document Renewal", name: s(d.name), what: [`${s(d.document_type)} · ${st === "Expired" ? "منتهية" : "تنتهي قريبًا"}`, `${s(d.document_type)} · ${st === "Expired" ? "expired" : "expiring"}`], who: s(d.employee_name || d.employee), dept: deptOf(s(d.employee)), status: st, why: st === "Expired" ? ["انتهت صلاحية الوثيقة", "The document has expired"] : ["تنتهي خلال 30 يومًا", "Expires within 30 days"], date: s(d.expiry_date), dateKind: "due", owner: "", section: "01.6", module: "01", tone: st === "Expired" ? "danger" : "warn" })),
    ...rowsIn("DIGIT Employment Contract").filter((d) => s(d.contract_status) === "Draft").map((d): Item => ({ cat: "document", dt: "DIGIT Employment Contract", name: s(d.name), what: ["عقد عمل مسودة", "Draft employment contract"], who: s(d.employee_name || d.employee), dept: deptOf(s(d.employee)), status: "Draft", why: ["العقد لم يُعتمد بعد", "The contract is not yet approved"], date: s(d.start_date || d.modified).slice(0, 10), dateKind: "effective", owner: "", section: "01.6", module: "01", tone: "info" })),
  ];
  const rank: Record<Tone, number> = { danger: 0, warn: 1, info: 2, success: 3, neutral: 4 };
  items.sort((a, b) => rank[a.tone] - rank[b.tone] || (a.date || "9999").localeCompare(b.date || "9999"));
  const shown = cat === "all" ? items : items.filter((i) => i.cat === cat);
  const keyOf = (i: Item) => `${i.dt}::${i.name}`;
  const sel = items.find((i) => keyOf(i) === focus);

  const decide = (name: string, status: "Approved" | "Rejected") => {
    setConfirm(null);
    try { decideLeave(name, status); setMsg({ ok: true, text: `${name}: ${status === "Approved" ? tx("تم الاعتماد والترحيل", "approved and read back") : tx("تم الرفض والترحيل", "rejected and read back")}` }); if (focus.endsWith(`::${name}`)) patch({ focus: "" }); }
    catch (e) { setMsg({ ok: false, text: `${name}: ${decisionErrorText((e as Error).message, tx("ar", "en") === "ar")}` }); }
  };
  // Consequential decisions ask for an inline confirmation; the decision itself still runs through native workflow/posting.
  const leaveActions = (name: string) => confirm?.name === name ? (
    <span className="flex items-center gap-1" role="group" aria-label={tx("تأكيد القرار", "Confirm decision")} data-confirm={confirm.status}>
      <span className="text-[11.5px] font-medium">{confirm.status === "Approved" ? tx("اعتماد الطلب؟", "Approve this request?") : tx("رفض الطلب؟", "Reject this request?")}</span>
      <button type="button" className={`dhr-act dhr-act-sm ${confirm.status === "Approved" ? "dhr-act-primary" : "dhr-act-danger"}`} onClick={() => decide(name, confirm.status)} data-confirm-yes>{tx("تأكيد", "Confirm")}</button>
      <button type="button" className="dhr-act dhr-act-sm dhr-act-ghost" onClick={() => setConfirm(null)}>{tx("إلغاء", "Cancel")}</button>
    </span>
  ) : <span className="flex gap-1" data-decide-for={name}><button type="button" className="dhr-act dhr-act-sm dhr-act-primary" onClick={() => setConfirm({ name, status: "Approved" })} data-decide="Approved">{tx("اعتماد", "Approve")}</button><button type="button" className="dhr-act dhr-act-sm" onClick={() => setConfirm({ name, status: "Rejected" })} data-decide="Rejected">{tx("رفض", "Reject")}</button></span>;
  const dateText = (i: Item) => !i.date ? "—" : i.dateKind === "since" ? relDay(today, i.date, tx) : `${i.dateKind === "due" ? tx("الموعد", "due") : tx("يسري", "effective")} ${relDay(today, i.date, tx)}`;
  const dateCell = (i: Item) => i.leave && i.date ? <span className="flex flex-col items-end leading-tight"><DateRange from={i.date.slice(0, 10)} to={(i.to || i.date).slice(0, 10)} className="text-[12px] text-[var(--dhr-text)]" /><span>{relDay(today, i.date, tx)}</span></span> : dateText(i);

  const metricCtx = scope.periodCtx;
  const kpiValue = (label: string) => (scope.companyKnown ? hrMetric(label, metricCtx).value ?? "—" : <SourceMark read={{ state: "DENIED" }} tx={tx} />);
  const upcoming = scope.companyKnown ? upcomingEvents({ renewals: rowsIn("DIGIT Document Renewal"), leaves: rowsIn("Leave Application"), interviews: src.rows("Interview"), onboarding: rowsIn("Employee Onboarding"), cycles: rowsIn("Appraisal Cycle") }, today) : [];
  const work = workByModule(items);
  const workMax = Math.max(1, ...work.map((w) => w.count));
  const roles = userRoles(user);
  const me = resolveEmployee(currentUser());
  const roleLabel = isHrAdmin(user) ? tx("صلاحية موارد بشرية", "HR administrator") : roles.includes("Leave Approver") || roles.includes("Expense Approver") ? tx("معتمد", "Approver") : tx("موظف", "Employee");
  const coFilter: unknown[][] = scope.company ? [["company", "=", scope.company]] : [];
  const visible = (w: W) => !p.hidden.includes(w);
  const ordered = (ws: W[]) => p.order.filter((w) => ws.includes(w) && visible(w));
  const names: Record<W, [string, string]> = { kpis: ["المؤشرات", "Indicators"], queue: ["مساحة الأولويات", "Priority workspace"], intel: ["اليوم والمواعيد", "Today & dates"], docs: ["الوحدات والمستندات", "Modules & documents"], reports: ["التقارير", "Reports"] };
  const move = (w: W, d: -1 | 1) => { const o = [...p.order]; const i = o.indexOf(w); const j = i + d; if (j < 0 || j >= o.length) return; const t = o[i]!; o[i] = o[j]!; o[j] = t; save({ ...p, order: o }); };

  const inspector = sel && (
    <HrContextInspector tx={tx} onClose={() => patch({ focus: "" })} title={<span data-no-i18n>{tx(...sel.what)}</span>} subtitle={<span data-no-i18n>{tr(sel.dt)} · <span className="dhr-code">{sel.name}</span></span>}
      actions={<>
        {sel.leave && leaveActions(sel.name)}
        <Native dt={sel.dt} name={sel.name} className="dhr-act dhr-act-primary">{tx("فتح السجل الأصلي", "Open source record")}</Native>
        <Link to="/digit-hr/s/$section" params={{ section: sel.section }} search={(scope.company ? { company: scope.company } : {}) as never} className="dhr-act" data-open-section={sel.section}>{tx("فتح القسم المسؤول", "Open responsible section")}</Link>
      </>}>
      <Facts items={[[tx("الموظف / المرجع", "Employee / reference"), sel.who ? tx(arLabel(sel.who), sel.who) : "—"], [tx("القسم", "Department"), sel.dept ? tx(arLabel(sel.dept), sel.dept) : "—"], [tx("الحالة", "Status"), tx(arLabel(sel.status), sel.status)], [tx("التاريخ", "Date"), sel.date ? `${sel.date} · ${dateText(sel)}` : "—"], [tx("المسؤول", "Owner"), sel.owner ? tx(arLabel(sel.owner), sel.owner) : tx("غير مسجّل في المصدر", "Not recorded on the source")], [tx("الوحدة", "Module"), tx(MODULES.find((m) => m.id === sel.module)?.ar ?? "", MODULES.find((m) => m.id === sel.module)?.en ?? "")]]} />
      <p className="rounded-md bg-[var(--dhr-canvas)] px-3 py-2 text-[12.5px]" data-no-i18n><span className="font-semibold">{tx("لماذا يحتاج إجراء:", "Why it needs action:")}</span> {tx(...sel.why)}</p>
    </HrContextInspector>
  );

  const queue = (
    <HrInsightPanel title={tx("مساحة الأولويات", "Priority workspace")} flush data-widget="queue" data-priority-items={items.length} toolbarWrap
      meta={qReady ? <><b className="dhr-tnum" data-no-i18n>{items.length}</b> {tx("عنصرًا تحتاج قرارًا · الأخطر أولًا", "items need a decision · most severe first")}</> : undefined}
      info={tx("عناصر من سجلات المصدر تحتاج قرارًا، مرتبة حسب الخطورة ثم التاريخ. الاعتماد يمر بصلاحيات الكتابة والترحيل ثم الترحيل الأصلي؛ الإشعارات تعمل على الخادم فقط.", "Source records that need a decision, ordered by severity then date. Approve checks write + submit permission, then uses native submit; notifications run on the server only.")}
      toolbar={<Seg label={tx("فئة الأولوية", "Priority category")} value={cat} onChange={(v) => patch({ cat: v === "all" ? "" : v, focus: "" })} options={[{ id: "all" as const, label: tx("الكل", "All"), count: qReady ? items.length : "—" }, ...GROUPS.map((g) => ({ id: g.id, label: tx(g.ar, g.en), count: qReady ? items.filter((i) => i.cat === g.id).length : "—", disabled: qReady && !items.some((i) => i.cat === g.id) }))]} />}>
      {msg && <div role="status" className="border-b border-[var(--dhr-sep)] px-4 py-2 text-sm" style={{ color: msg.ok ? "var(--dhr-success-text)" : "var(--dhr-danger)" }} data-no-i18n>{msg.text}</div>}
      {!qReady ? <div className="p-4"><HrEmptyOrBlockedState read={!scope.companyKnown ? { state: "DENIED" } : src.worst(...Q_SRC)} tx={tx} rows={6} /></div> : (
        <HrPriorityQueue<Item> label={tx("عناصر الأولوية", "Priority items")} tx={tx} items={shown} groups={GROUPS} groupOf={(i) => i.cat} keyOf={keyOf} toneOf={(i) => i.tone} selected={focus} onSelect={(k) => patch({ focus: focus === k ? "" : k })} maxHeight="600px"
          empty={<div className="p-4"><HrEmptyOrBlockedState tx={tx} title={tx("لا عناصر تحتاج قرارًا في هذا النطاق.", "Nothing needs a decision in this scope.")} body={tx("الموافقات والتغييرات والوثائق المعلقة ستظهر هنا فور تسجيلها.", "Pending approvals, changes and documents appear here as soon as they are recorded.")} /></div>}
          render={(i) => (
            <div className="grid gap-x-4 gap-y-1 md:grid-cols-[minmax(0,1fr)_auto]" data-queue-row={i.cat}>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5"><span className="text-[13.5px] font-semibold" data-no-i18n>{tx(...i.what)}</span><span className="text-[12.5px]" data-no-i18n>{i.who ? tx(arLabel(i.who), i.who) : ""}</span></div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11.5px] text-[var(--dhr-muted)]" data-no-i18n>
                  <Native dt={i.dt} name={i.name} className="dhr-link dhr-code !text-[11px]">{i.name}</Native><span>·</span><span>{tx(...i.why)}</span>{i.owner && <><span>·</span><span>{tx("المسؤول:", "Owner:")} {tx(arLabel(i.owner), i.owner)}</span></>}
                </div>
              </div>
              <div className="flex items-center gap-2 md:justify-end">
                <span className="whitespace-nowrap text-[11.5px] text-[var(--dhr-muted)]" data-no-i18n>{dateCell(i)}</span>
                {i.leave ? leaveActions(i.name) : <Native dt={i.dt} name={i.name} className="dhr-act dhr-act-sm">{tx("مراجعة", "Review")}</Native>}
              </div>
            </div>
          )} />
      )}
    </HrInsightPanel>
  );

  const side: Record<"kpis" | "intel", ReactNode> = {
    kpis: (
      <HrInsightPanel key="kpis" title={tx("المؤشرات الرئيسية", "Key indicators")} data-widget="kpis" meta={tx("كل رقم يفتح المجتمع نفسه", "Every number opens the same population")} info={tx("الشركة المختارة تُطبّق على كل المؤشرات؛ الفترة تُطبّق حسب حقل التاريخ لكل مصدر. المؤشرات الآنية (مثل الموظفين النشطين) لا تتأثر بالفترة.", "The selected company applies to every indicator; the period uses each source's date field. Point-in-time indicators (such as active employees) ignore the period.")}>
        <div className="grid grid-cols-2 gap-2">
          {KPIS.map((k) => (
            <MetricLink key={k.label} label={k.label} className="ek-kpi-tile">
              <div className="ek-tile-label">{tx(k.ar, k.en)}</div>
              <div className="ek-tile-value dhr-tnum" data-no-i18n data-kpi-value={k.label}>{kpiValue(k.label)}</div>
            </MetricLink>
          ))}
        </div>
      </HrInsightPanel>
    ),
    intel: (
      <div key="intel" className="flex flex-col gap-4" data-widget="intel">
        <HrInsightPanel title={tx("اليوم وهذه الفترة", "Today & this period")} flush>
          <dl className="divide-y divide-[var(--dhr-sep)] text-[13px]">
            {[["On Leave Today", false], ["Interviews Due", false], ["Upcoming Approved Leave", false], ["Allocations Expiring", false], ...(scope.from || scope.to ? [["Joiners", true], ["Exits", true]] as [string, boolean][] : [])].map(([l, per]) => (
              <div key={l as string} className="flex min-h-10 items-center justify-between gap-2 px-4 py-1.5"><dt>{tx(METRIC_AR[l as string] ?? (l as string), l as string)}</dt><dd className="dhr-tnum font-semibold"><MetricValue label={l as string} scope={scope} src={src} tx={tx} back="" period={per as boolean} /></dd></div>
            ))}
            {!scope.from && !scope.to && <div className="px-4 py-2 text-[11.5px] text-[var(--dhr-muted)]">{tx("حدّد فترة لعرض المنضمين والمغادرين، أو افتح", "Set a period to see joiners and exits, or open")} <Link to="/digit-hr/m/$module" params={{ module: "06" }} className="dhr-link">{tx("ذكاء الموارد البشرية", "People Intelligence")}</Link>.</div>}
          </dl>
        </HrInsightPanel>
        <HrInsightPanel title={tx("مواعيد قادمة — 30 يومًا", "Upcoming dates — 30 days")} flush data-upcoming={upcoming.length}>
          {!today || !src.ready("DIGIT Document Renewal", "Leave Application") ? <div className="p-4"><HrEmptyOrBlockedState read={src.worst("DIGIT Document Renewal", "Leave Application") ?? { state: "LOADING" }} tx={tx} rows={3} /></div> : upcoming.length ? (
            <ul className="divide-y divide-[var(--dhr-sep)]">{upcoming.slice(0, 7).map((u) => (
              <li key={u.doctype + u.name + u.kind} className="grid grid-cols-[3rem_minmax(0,1fr)] items-center gap-3 px-4 py-2">
                <span className="flex flex-col items-center rounded-md border border-[var(--dhr-sep)] py-1 leading-none" data-no-i18n><b className="dhr-tnum text-[15px]">{u.date.slice(8, 10)}</b><span className="mt-0.5 text-[10px] text-[var(--dhr-muted)]">{u.date.slice(0, 7)}</span></span>
                <span className="min-w-0"><Native dt={u.doctype} name={u.name} className="dhr-link block truncate text-[13px] font-medium"><span data-no-i18n>{tx(arLabel(u.who), u.who) || u.name}</span></Native><span className="block truncate text-[11.5px] text-[var(--dhr-muted)]">{tx(...UP_TEXT[u.kind])}{u.detail ? <span data-no-i18n> · {tx(arLabel(u.detail), u.detail)}</span> : null} · <span data-no-i18n>{relDay(today, u.date, tx)}</span></span></span>
              </li>))}</ul>
          ) : <div className="p-4"><HrEmptyOrBlockedState tx={tx} title={tx("لا مواعيد مسجلة خلال 30 يومًا.", "No recorded dates in the next 30 days.")} /></div>}
        </HrInsightPanel>
        <HrInsightPanel title={tx("أين يتركز العمل", "Where the work is")} meta={tx("عناصر الأولوية حسب الوحدة المسؤولة", "Priority items by owning module")} data-work-by-module={work.length}>
          {!qReady ? <HrEmptyOrBlockedState read={!scope.companyKnown ? { state: "DENIED" } : src.worst(...Q_SRC)} tx={tx} rows={3} /> : work.length ? (
            <ul className="space-y-1.5">{work.map((w) => { const m = MODULES.find((x) => x.id === w.module); return (
              <li key={w.module}><Link {...metricReturn(w.module)} search={commandScope(scope.company ? { company: scope.company } : {})} className="dhr-hbar !grid-cols-[minmax(0,1fr)_5rem_2rem]" data-work-module={w.module}>
                <span className="truncate">{m ? tx(m.ar, m.en) : w.module}</span><Meter value={w.count} max={workMax} tone="warn" /><b className="dhr-tnum text-end" data-no-i18n>{w.count}</b>
              </Link></li>); })}</ul>
          ) : <HrEmptyOrBlockedState tx={tx} title={tx("لا عمل منتظر.", "No waiting work.")} />}
        </HrInsightPanel>
      </div>
    ),
  };

  const lower: Record<"docs" | "reports", ReactNode> = {
    docs: (
      <HrInsightPanel key="docs" title={tx("الوحدات السبع", "The seven HR modules")} meta={tx("ملخص كل وحدة ومدخلها", "Each module's summary and entry")} info={tx("أرقام كل وحدة هي نفس مجتمعات صفحتها ومؤشراتها.", "Each module's figures are the same populations as its home and metric drills.")} data-widget="docs">
        <HrSectionNavigator label={tx("وحدات الموارد البشرية", "HR modules")} items={COMMAND_TILES.map((t) => { const m = MODULES.find((x) => x.id === t.module); return {
          id: t.module, title: m ? tx(m.ar, m.en) : t.module,
          to: <Link {...metricReturn(t.module)} search={commandScope(scope.company ? { company: scope.company } : {})} className="dhr-act dhr-act-ghost !px-2 !min-h-7" data-open-module={t.module} aria-label={tx(`فتح ${m?.ar ?? t.module}`, `Open ${m?.en ?? t.module}`)}>{tx("فتح", "Open")}</Link>,
          figures: t.metrics.slice(0, 3).map((x) => ({ label: tx(METRIC_AR[x.label] ?? x.label, x.label), value: <MetricValue label={x.label} scope={scope} src={src} tx={tx} back="" period={!!x.period} /> })),
        }; })} />
        <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4" aria-label={tx("المستندات والعمليات", "Documents & operations")}>
          {([["سجل الموظف", "Employee record", ["Employee", "Employee Transfer", "Employee Promotion", "DIGIT Document Renewal"]], ["الحضور والإجازات", "Attendance & leave", ["Attendance", "Attendance Request", "Leave Application", "Shift Assignment"]], ["التوظيف والتهيئة", "Hiring & onboarding", ["Job Opening", "Job Applicant", "Job Offer", "Employee Onboarding"]], ["المالية والخدمات", "Pay & services", ["Expense Claim", "Employee Advance", "Salary Slip", "DIGIT HR Service Case"]]] as [string, string, string[]][]).map(([ar, en, dts]) => (
            <div key={en} className="rounded-lg border border-[var(--dhr-sep)] p-2.5">
              <div className="mb-1 px-1 text-[11.5px] font-semibold text-[var(--dhr-muted)]">{tx(ar, en)}</div>
              <ul>{dts.map((dt) => { const co = scope.company && cachedMeta(dt)?.fields?.some((f) => f.fieldname === "company"); return <li key={dt}><Native dt={dt} {...(co ? { filters: coFilter } : {})} className="flex min-h-8 items-center justify-between rounded px-1 text-[12.5px] hover:bg-[var(--dhr-neutral)]"><span>{tr(dt)}</span><span className="dhr-tnum text-[11.5px] text-[var(--dhr-muted)]" data-no-i18n>{src.v(rowsIn(dt).length, dt)}</span></Native></li>; })}</ul>
            </div>
          ))}
        </div>
      </HrInsightPanel>
    ),
    reports: (
      <section key="reports" className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-[var(--dhr-border)] px-4 py-3 text-[13px]" aria-label={tx("التقارير والإعدادات", "Reports & settings")} data-widget="reports">
        <span className="me-1 text-[11.5px] font-semibold text-[var(--dhr-muted)]">{tx("التقارير", "Reports")}</span>
        {([["Employee Leave Balance", "رصيد إجازات الموظفين"], ["Monthly Attendance Sheet", "كشف الحضور الشهري"], ["Employee Information", "معلومات الموظفين"], ["Employee Exits", "حالات خروج الموظفين"]] as const).map(([r, ar]) => <Link key={r} to="/report/$name" params={{ name: r }} className="dhr-pill hover:underline">{tx(ar, r)}</Link>)}
        <Link to="/digit-hr/reports" className="dhr-link">{tx("مركز التقارير", "Report Center")}</Link>
        <span className="mx-1 h-4 w-px bg-[var(--dhr-sep)]" aria-hidden />
        <Native dt="HR Settings" className="dhr-link text-[12px]">{tx("إعدادات الموارد البشرية", "HR Settings")}</Native>
      </section>
    ),
  };

  return (
    <div className="space-y-4" data-mission-control>
      <HrCommandHeader id="00" code="HR" suite={tx("ديجيت للموارد البشرية", "DIGIT HR")} title={tx("مركز قيادة الموارد البشرية", "HR Mission Control")}
        purpose={tx("ما يحتاج قرارًا اليوم عبر الوحدات السبع — كل صف يفتح سجله الأصلي.", "What needs a decision today across the seven HR modules — every row opens its source record.")}
        actions={<>
          <Native dt="Leave Application" className="dhr-act dhr-act-primary">{tx("+ إجازة", "+ Leave")}</Native>
          <Link to="/digit-hr/employees" search={{}} className="dhr-act">{tx("الموظفون", "Employees")}</Link>
          <Button variant="ghost" type="button" aria-pressed={customize} onClick={() => setCustomize((c) => !c)} className="dhr-act">{tx("تخصيص", "Customize")}</Button>
        </>}>
        <HrContextToolbar tx={tx} active={[scope.company, scope.from, scope.to].filter(Boolean).length} scopeKey={[scope.company, scope.from, scope.to].join("|")}
          end={<><SourcesPill src={src} />{today && <Pill title={tx("تاريخ العمل", "Working date")}><span data-no-i18n>{today}</span></Pill>}</>}>
          <Pill tone="info" title={user}><span>{roleLabel}</span><span className="opacity-70" data-no-i18n>· {me.state === "linked" ? tx(arLabel(me.name), me.name) : tx(arLabel(user), user)}</span></Pill>
          <CompanyScope scope={scope} tx={tx} ariaLabel={["شركة المؤشرات", "KPI company"]} />
          <PeriodScope scope={scope} tx={tx} labels={{ from: ["بداية فترة المؤشرات", "KPI period start"], to: ["نهاية فترة المؤشرات", "KPI period end"] }} />
          <ClearScope scope={scope} tx={tx} period />
        </HrContextToolbar>
      </HrCommandHeader>
      <ScopeDenied scope={scope} tx={tx} />
      <SourceNotice src={src} quietLoading />
      <RoleHome ar={tx("ar", "en") === "ar"} company={scope.company || undefined} />
      {customize && (
        <div className="dhr-panel p-3 text-sm" data-customize>
          <div className="mb-2 flex items-center justify-between"><b>{tx("مساحتي الشخصية", "My workspace")}</b><button type="button" className="dhr-act" onClick={reset}>{tx("استعادة الافتراضي", "Reset to default")}</button></div>
          <ul className="flex flex-wrap gap-2">{p.order.map((w) => (
            <li key={w} className="flex items-center gap-1 rounded-md border border-[var(--dhr-sep)] px-2 py-1">
              <label className="flex items-center gap-1"><input type="checkbox" checked={!p.hidden.includes(w)} onChange={(e) => save({ ...p, hidden: e.target.checked ? p.hidden.filter((x) => x !== w) : [...p.hidden, w] })} />{tx(...names[w])}</label>
              <Button variant="ghost" size="icon" type="button" aria-label={tx(`تقديم ${names[w][0]}`, `Move ${names[w][1]} up`)} className="h-7 w-7" onClick={() => move(w, -1)}><ArrowUp className="h-3.5 w-3.5" /></Button>
              <Button variant="ghost" size="icon" type="button" aria-label={tx(`تأخير ${names[w][0]}`, `Move ${names[w][1]} down`)} className="h-7 w-7" onClick={() => move(w, 1)}><ArrowDown className="h-3.5 w-3.5" /></Button>
            </li>))}</ul>
          <p className="mt-2 text-[11px] text-[var(--dhr-muted)]">{tx("التخصيص لك وحدك ولا يغيّر الافتراضي العام للمؤسسة. الترتيب يُطبّق داخل كل منطقة.", "Personal only — the organization default is unchanged. Order applies within each region.")}</p>
        </div>
      )}
      <HrWorkspaceGrid
        main={<>{visible("queue") ? queue : <HrEmptyOrBlockedState tx={tx} title={tx("مساحة الأولويات مخفية في تخصيصك.", "The priority workspace is hidden in your customization.")} action={<button type="button" className="dhr-act" onClick={() => save({ ...p, hidden: p.hidden.filter((x) => x !== "queue") })}>{tx("إظهار", "Show")}</button>} />}{!wide && inspector}</>}
        side={<>{wide && inspector}{ordered(["kpis", "intel"]).map((w) => side[w as "kpis" | "intel"])}</>}
      />
      {ordered(["docs", "reports"]).map((w) => lower[w as "docs" | "reports"])}
    </div>
  );
}
