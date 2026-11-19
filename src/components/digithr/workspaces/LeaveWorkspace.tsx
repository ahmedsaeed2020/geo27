/**
 * Section 03.1 — Leave operations: approval inbox with balance context, balances on a date, absence window and
 * entitlement setup. Reads pre-scoped sources only; approval, submission and allocation happen in the native forms
 * (workflow/posting), never here. Balances follow the Core submit validation (leaveFacts.ts).
 */
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useScopeMetas } from "@/plugins/digit_hr/compat/scope";
import { useStoreVersion } from "@/lib/adapter";
import { useSessionUser } from "@/plugins/digit_hr/compat/session";
import { isHrAdmin } from "@/plugins/digit_hr/compat/employeeIdentity";
import { t as tr } from "@/i18n";
import { useTx } from "@/components/digithr/DigitHrLayout";
import { MetricValue, ScopeBar, useModuleScope } from "@/components/digithr/ModuleScope";
import { WorkTable } from "@/components/digithr/EnterpriseRegister";
import { NotEvaluated, Native, Chip, StatRow, arLabel, useSources, SourceNotice, SourceMark, s, n, DateRange } from "./shared";
import { absenceWindow, addDays, balanceOn, entitlements, isOpenLeave, leaveBalances, overlapping, type AbsenceRow, type BalanceRow, type EntitlementRow } from "@/plugins/digit_hr/leaveFacts";
import { DateInput } from "@/components/form/DateInput";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type R = any;
const SOURCES = ["Employee", "Leave Application", "Leave Allocation", "Leave Type", "Leave Policy", "Leave Policy Assignment", "Leave Period"];
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const WINDOW = 14;

export function LeaveWorkspace() {
  const { tx } = useTx();
  useStoreVersion(); useSessionUser();
  useScopeMetas(SOURCES);
  const src = useSources(tx);
  const scope = useModuleScope(src);
  const admin = isHrAdmin();
  const navigate = useNavigate({ from: "/digit-hr/s/$section" });
  const search = useSearch({ from: "/digit-hr/s/$section" });
  const today = new Date().toISOString().slice(0, 10);
  // "Balances on" lives in the URL (?on=, validated by the section route) so reload, Back and shared links show the same date; default today.
  const on = search.on ?? today;
  const setOn = (v: string) => void navigate({ to: ".", search: (prev) => ({ ...prev, on: ISO.test(v) && v !== today ? v : undefined }) });

  const emps = scope.filter(src.rows("Employee"));
  const deptBy = new Map(src.rows("Employee").map((e: R) => [s(e.name), s(e.department)]));
  const deptOf = (emp: string) => deptBy.get(emp) ?? "";
  const apps = scope.filter(src.rows("Leave Application"));
  const allocs = scope.filter(src.rows("Leave Allocation"));
  const balReady = src.ready("Leave Allocation", "Leave Application") && scope.companyKnown;
  const inbox = apps.filter(isOpenLeave).sort((a: R, b: R) => s(a.from_date).localeCompare(s(b.from_date)));
  const balances = balReady ? leaveBalances(allocs, apps, on) : [];
  const window = src.ready("Leave Application") && scope.companyKnown ? absenceWindow(apps, on, WINDOW, deptOf) : [];
  const ent = src.ready("Leave Type") ? entitlements(src.rows("Leave Type"), src.ready("Leave Allocation") ? allocs : [], src.ready("Leave Policy") ? src.rows("Leave Policy") : [], on) : [];
  const kpi = (label: string, deps: string[]) => <MetricValue label={label} scope={scope} src={src} tx={tx} back="03.1" deps={deps} />;
  const HIDDEN: [string, string] = ["غير مُقيّم: يتطلب رؤية كل الموظفين والأرصدة (دور موارد بشرية).", "Not evaluated: needs every employee and allocation (HR role)."];
  const short = balances.filter((b) => b.afterPending < 0);

  return (
    <div className="space-y-5" data-leave-section>
      <SourceNotice src={src} />
      <ScopeBar scope={scope} tx={tx}>
        <label className="text-sm">{tx("الأرصدة في تاريخ", "Balances on")}
          <DateInput aria-label={tx("تاريخ الأرصدة", "Balance date")} className="field-input mt-1 block" value={on} onChange={(e) => setOn(e.target.value)} data-no-i18n data-balance-on={on} />
        </label>
      </ScopeBar>
      <p className="text-[11px] text-[var(--dhr-muted)]">{tx("الرصيد = تخصيصات معتمدة تغطي التاريخ − إجازات معتمدة ومرحّلة ضمن فترة التخصيص، وهي القاعدة نفسها التي تمنع الاعتماد عند نقص الرصيد. الطلبات المفتوحة تظهر «معلّقة» ولا تُخصم. الاعتماد يتم في النموذج الأصلي فقط.", "Balance = submitted allocations covering the date − approved, submitted leave inside the allocation period — the same rule that blocks approval on insufficient balance. Open requests show as \"pending\" and are not deducted. Approval happens only in the native form.")}</p>

      <StatRow items={[
        { label: tx("طلبات بانتظار القرار", "Requests awaiting decision"), value: kpi("Pending Leave", ["Leave Application"]), tone: inbox.length ? "warn" : undefined },
        { label: tx("في إجازة معتمدة اليوم", "On approved leave today"), value: kpi("On Leave Today", ["Leave Application"]) },
        { label: tx("إجازات معتمدة خلال 30 يومًا", "Approved leave in next 30 days"), value: kpi("Upcoming Approved Leave", ["Leave Application"]) },
        { label: tx("أرصدة تنتهي خلال 30 يومًا", "Allocations ending in 30 days"), value: kpi("Allocations Expiring", ["Leave Allocation"]) },
        { label: tx("موظفون بلا رصيد ساري اليوم", "Employees without a current allocation"), value: admin ? kpi("Employees Without Leave Allocation", ["Employee", "Leave Allocation"]) : <NotEvaluated tx={tx} why={HIDDEN} /> },
        { label: tx("أرصدة تصبح سالبة بعد المعلّق", "Balances negative after pending"), value: balReady ? <span data-short-balances>{short.length}</span> : <SourceMark read={src.worst("Leave Allocation", "Leave Application") ?? { state: "DENIED" }} tx={tx} />, tone: short.length ? "danger" : undefined },
      ]} />

      <section className="dhr-card rounded-[14px] p-4" data-leave-inbox={inbox.length}>
        <h2 className="font-semibold">{tx("صندوق قرارات الإجازة", "Leave decision inbox")}</h2>
        <p className="mb-3 text-xs text-[var(--dhr-muted)]">{tx("طلبات مفتوحة في نطاقك مع الرصيد في تاريخ بدايتها والزملاء الغائبين في القسم نفسه. افتح الطلب لاتخاذ القرار في النموذج الأصلي.", "Open requests in your scope with the balance on their start date and same-department colleagues away. Open the request to decide in the native form.")}</p>
        <WorkTable<R> label="leave-inbox" tx={tx} rows={inbox} rowKey={(r) => s(r.name)} pageSize={8}
          emptyState={src.ready("Leave Application") && scope.companyKnown ? undefined : src.empty("Leave Application")}
          searchText={(r) => `${s(r.employee_name)} ${s(r.employee)} ${s(r.leave_type)} ${s(r.name)}`}
          cols={[
            { key: "e", ar: "الموظف", en: "Employee", sort: (r) => s(r.employee_name), render: (r) => <span data-no-i18n><span className="font-medium">{tx(arLabel(s(r.employee_name) || s(r.employee)), s(r.employee_name) || s(r.employee))}</span><span className="block text-[11px] text-[var(--dhr-muted)]">{s(r.employee)}</span></span> },
            { key: "t", ar: "النوع", en: "Type", sort: (r) => s(r.leave_type), render: (r) => <Chip>{tr(s(r.leave_type))}</Chip> },
            { key: "d", ar: "الفترة", en: "Dates", sort: (r) => s(r.from_date), render: (r) => <span data-no-i18n className="text-xs"><DateRange from={r.from_date} to={r.to_date} /> · <b>{n(r.total_leave_days)}</b></span> },
            { key: "b", ar: "الرصيد قبل / بعد", en: "Balance before / after", render: (r) => {
              if (!balReady) return <SourceMark read={src.worst("Leave Allocation", "Leave Application") ?? { state: "DENIED" }} tx={tx} />;
              const b = balanceOn(allocs, apps, s(r.employee), s(r.leave_type), s(r.from_date), s(r.name));
              if (b === null) return <Chip tone="warn">{tx("لا تخصيص يغطي التاريخ", "No allocation covers the date")}</Chip>;
              const after = Math.round((b - n(r.total_leave_days)) * 1000) / 1000;
              return <span data-no-i18n data-balance-after={after}>{b} {tx("←", "→")} <b className={after < 0 ? "text-[var(--dhr-danger-text)]" : ""}>{after}</b></span>;
            } },
            { key: "o", ar: "غياب متداخل في القسم", en: "Overlapping in department", render: (r) => { const o = overlapping(r, apps, deptOf); return o.length ? <Native dt="Leave Application" module="03" filters={[["name", "in", o]]} className="hover:underline"><span data-no-i18n>{o.length}</span></Native> : <span data-no-i18n className="text-[var(--dhr-muted)]">0</span>; } },
            { key: "a", ar: "المعتمد", en: "Approver", render: (r) => <span data-no-i18n className="text-xs">{s(r.leave_approver) || "—"}</span> },
            { key: "x", ar: "الإجراء", en: "Action", render: (r) => <Native dt="Leave Application" name={s(r.name)} module="03" className="dhr-btn dhr-btn-sm dhr-btn-primary">{tx("مراجعة واتخاذ القرار", "Review & decide")}</Native> },
          ]} />
      </section>

      <section className="dhr-card rounded-[14px] p-4" data-leave-balances={balances.length}>
        <h2 className="font-semibold">{tx("الأرصدة", "Balances")} <span className="text-xs font-normal text-[var(--dhr-muted)]" data-no-i18n>{on}</span></h2>
        <p className="mb-3 text-xs text-[var(--dhr-muted)]">{tx("لكل موظف ونوع إجازة لديه تخصيص معتمد يغطي التاريخ. كل رقم يفتح سجلاته الأصلية.", "Per employee and leave type with a submitted allocation covering the date. Each number opens its native records.")}</p>
        <WorkTable<BalanceRow> label="leave-balances" tx={tx} rows={balances} rowKey={(b) => `${b.employee}|${b.leaveType}`} pageSize={10}
          emptyState={balReady ? undefined : src.empty("Leave Allocation", "Leave Application")}
          searchText={(b) => `${b.employeeName} ${b.employee} ${b.leaveType}`}
          groups={[{ id: "short", ar: "سالب بعد المعلّق", en: "Negative after pending", tone: "danger" }, { id: "pending", ar: "عليه طلبات معلّقة", en: "Has pending requests", tone: "warn" }, { id: "ok", ar: "بلا ملاحظات", en: "No issue" }]}
          groupOf={(b) => (b.afterPending < 0 ? "short" : b.pending ? "pending" : "ok")}
          cols={[
            { key: "e", ar: "الموظف", en: "Employee", sort: (b) => b.employeeName, render: (b) => <span data-no-i18n><span className="font-medium">{tx(arLabel(b.employeeName), b.employeeName)}</span><span className="block text-[11px] text-[var(--dhr-muted)]">{b.employee}</span></span> },
            { key: "t", ar: "النوع", en: "Type", sort: (b) => b.leaveType, render: (b) => <Chip>{tr(b.leaveType)}</Chip> },
            { key: "a", ar: "المخصص", en: "Allocated", sort: (b) => b.allocated, render: (b) => <Native dt="Leave Allocation" module="03" filters={[["name", "in", b.allocations]]} className="hover:underline"><span data-no-i18n>{b.allocated}</span></Native> },
            { key: "u", ar: "المأخوذ", en: "Taken", sort: (b) => b.taken, render: (b) => b.applications.length ? <Native dt="Leave Application" module="03" filters={[["name", "in", b.applications]]} className="hover:underline"><span data-no-i18n>{b.taken}</span></Native> : <span data-no-i18n>0</span> },
            { key: "b", ar: "الرصيد", en: "Balance", sort: (b) => b.balance, render: (b) => <b data-no-i18n>{b.balance}</b> },
            { key: "p", ar: "معلّق", en: "Pending", sort: (b) => b.pending, render: (b) => b.pendingApps.length ? <Native dt="Leave Application" module="03" filters={[["name", "in", b.pendingApps]]} className="hover:underline"><span data-no-i18n>{b.pending}</span></Native> : <span data-no-i18n className="text-[var(--dhr-muted)]">0</span> },
            { key: "r", ar: "بعد المعلّق", en: "After pending", sort: (b) => b.afterPending, render: (b) => <Chip tone={b.afterPending < 0 ? "danger" : undefined}><span data-no-i18n>{b.afterPending}</span></Chip> },
          ]} />
      </section>

      <AbsenceGrid rows={window} from={on} tx={tx} notReady={src.ready("Leave Application") && scope.companyKnown ? null : src.empty("Leave Application")} />

      <section className="dhr-card rounded-[14px] p-4" data-leave-entitlements={ent.length}>
        <h2 className="font-semibold">{tx("أنواع الإجازات والاستحقاقات", "Leave types & entitlements")}</h2>
        <p className="mb-3 text-xs text-[var(--dhr-muted)]">{tx("إعداد كل نوع من مصدره، مع التخصيصات السارية في التاريخ وسياسات الإجازة التي تمنحه. التعديل في النموذج الأصلي.", "Each type's source setup, with allocations current on the date and the leave policies that grant it. Edit in the native form.")}</p>
        <div className="mb-3 flex flex-wrap gap-2 text-sm">
          {(["Leave Policy", "Leave Policy Assignment", "Leave Period"] as const).map((dt) => <Native key={dt} dt={dt} module="03" className="dhr-btn dhr-btn-sm">{tr(dt)} <span data-no-i18n>{src.v(src.rows(dt).filter((r: R) => n(r.docstatus) !== 2).length, dt)}</span></Native>)}
        </div>
        <WorkTable<EntitlementRow> label="leave-entitlements" tx={tx} rows={ent} rowKey={(e) => e.leaveType} pageSize={10}
          emptyState={src.ready("Leave Type") ? undefined : src.empty("Leave Type")}
          searchText={(e) => e.leaveType}
          cols={[
            { key: "t", ar: "نوع الإجازة", en: "Leave type", sort: (e) => e.leaveType, render: (e) => <Native dt="Leave Type" name={e.leaveType} module="03" className="font-medium text-[var(--dhr-emerald)] hover:underline">{tr(e.leaveType)}</Native> },
            { key: "m", ar: "الحد الأقصى", en: "Max allowed", sort: (e) => e.maxAllowed, render: (e) => <span data-no-i18n>{e.maxAllowed || "—"}</span> },
            { key: "f", ar: "الخصائص", en: "Properties", render: (e) => <span className="flex flex-wrap gap-1">{e.carryForward && <Chip>{tx("ترحيل", "Carry forward")}</Chip>}{e.lwp && <Chip tone="warn">{tx("بدون راتب", "Without pay")}</Chip>}{e.earned && <Chip>{tx("مكتسبة", "Earned")}</Chip>}{e.allowNegative && <Chip tone="warn">{tx("تسمح بالسالب", "Allows negative")}</Chip>}{e.compensatory && <Chip>{tx("تعويضية", "Compensatory")}</Chip>}</span> },
            { key: "a", ar: "تخصيصات سارية", en: "Current allocations", sort: (e) => e.allocations.length, render: (e) => !src.ready("Leave Allocation") ? <SourceMark read={src.read("Leave Allocation")} tx={tx} /> : e.allocations.length ? <Native dt="Leave Allocation" module="03" filters={[["name", "in", e.allocations]]} className="hover:underline"><span data-no-i18n>{e.allocations.length}</span></Native> : <span data-no-i18n>0</span> },
            { key: "c", ar: "موظفون مشمولون", en: "Employees covered", sort: (e) => e.employees, render: (e) => !src.ready("Leave Allocation") ? "—" : <span data-no-i18n>{e.employees}</span> },
            { key: "p", ar: "سياسات تمنحه", en: "Granted by policies", render: (e) => !src.ready("Leave Policy") ? <SourceMark read={src.read("Leave Policy")} tx={tx} /> : e.policies.length ? <Native dt="Leave Policy" module="03" filters={[["name", "in", e.policies]]} className="hover:underline"><span data-no-i18n>{e.policies.length}</span></Native> : <span data-no-i18n className="text-[var(--dhr-muted)]">0</span> },
          ]} />
        {src.ready("Employee") && <p className="mt-2 text-[11px] text-[var(--dhr-muted)]">{tx("الموظفون النشطون في النطاق", "Active employees in scope")}: <span data-no-i18n>{emps.filter((e: R) => s(e.status || "Active") === "Active").length}</span></p>}
      </section>
    </div>
  );
}

/** Next 14 days from the balance date: approved (filled) and open (outlined) leave per employee, grouped by department. */
function AbsenceGrid({ rows, from, tx, notReady }: { rows: AbsenceRow[]; from: string; tx: (a: string, b: string) => string; notReady: React.ReactNode }) {
  const days = Array.from({ length: WINDOW }, (_, i) => addDays(from, i));
  return (
    <section className="dhr-card rounded-[14px] p-4" data-absence-window={rows.length}>
      <h2 className="font-semibold">{tx("من سيغيب؟ — 14 يومًا", "Who is away? — next 14 days")}</h2>
      <p className="mb-3 text-xs text-[var(--dhr-muted)]">{tx("مربع ممتلئ = إجازة معتمدة؛ مربع محدد = طلب مفتوح لم يُقرَّر.", "Filled = approved leave; outlined = open request not yet decided.")}</p>
      {notReady ?? (rows.length ? (
        <div className="max-w-full overflow-x-auto">
          <table className="w-full min-w-[640px] text-xs">
            <thead><tr><th className="sticky start-0 bg-[var(--dhr-surface,white)] px-2 py-1 text-start font-medium">{tx("الموظف", "Employee")}</th>{days.map((d) => <th key={d} className="px-0.5 py-1 text-center font-normal text-[var(--dhr-muted)]" data-no-i18n>{d.slice(8)}</th>)}</tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.employee} className="border-t border-[var(--dhr-sep)]" data-absence-row={r.employee}>
                <td className="sticky start-0 bg-[var(--dhr-surface,white)] px-2 py-1"><Native dt="Leave Application" module="03" filters={[["name", "in", r.apps]]} className="hover:underline"><span data-no-i18n>{tx(arLabel(r.employeeName), r.employeeName)}</span></Native><span className="block text-[10px] text-[var(--dhr-muted)]" data-no-i18n>{r.department ? tx(arLabel(r.department), r.department) : "—"}</span></td>
                {r.days.map((k, i) => <td key={i} className="px-0.5 py-1 text-center"><span aria-label={k ? tx(k === "approved" ? "معتمدة" : "مفتوحة", k === "approved" ? "Approved" : "Open") : undefined} className={`inline-block h-4 w-4 rounded-sm ${k === "approved" ? "bg-[var(--dhr-emerald)]" : k === "open" ? "border-2 border-[var(--dhr-warn-text)]" : "bg-[var(--dhr-sep)]/40"}`} /></td>)}
              </tr>))}</tbody>
          </table>
        </div>
      ) : <p className="py-2 text-sm text-[var(--dhr-muted)]">{tx("لا إجازات معتمدة أو طلبات مفتوحة في هذه الفترة.", "No approved leave or open requests in this window.")}</p>)}
    </section>
  );
}
