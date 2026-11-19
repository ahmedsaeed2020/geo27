/**
 * Section 04.4 — Compensation & benefits: salary-structure coverage, structures in use, scheduled assignment changes,
 * upcoming additional salary and benefit applications. Counts and dates only: salary amounts are never shown or summed
 * here; they stay in the permission-checked native records.
 */
import { useScopeMetas } from "@/plugins/digit_hr/compat/scope";
import { useStoreVersion } from "@/lib/adapter";
import { useSessionUser } from "@/plugins/digit_hr/compat/session";
import { isHrAdmin } from "@/plugins/digit_hr/compat/employeeIdentity";
import { useTx } from "@/components/digithr/DigitHrLayout";
import { ScopeBar, useModuleScope } from "@/components/digithr/ModuleScope";
import { WorkTable } from "@/components/digithr/EnterpriseRegister";
import { Native, Chip, StatRow, NotEvaluated, arLabel, useSources, SourceNotice, s, n, live, DateRange } from "./shared";
import { missingSalaryStructure } from "@/plugins/digit_hr/payrollReadiness";
import { componentsByType, effectiveAssignments, futureAssignments, structureUsage, upcomingAdditional } from "@/plugins/digit_hr/compensationFacts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type R = any;
const DT = ["Employee", "Salary Structure Assignment", "Salary Structure", "Salary Component", "Additional Salary", "Employee Benefit Application"];

export function CompensationWorkspace() {
  const { tx } = useTx();
  useStoreVersion(); useSessionUser();
  useScopeMetas(DT);
  const src = useSources(tx);
  const scope = useModuleScope(src);
  const today = new Date().toISOString().slice(0, 10);
  const ok = (...d: string[]) => src.ready(...d) && scope.companyKnown;
  const emps = scope.filter(src.rows("Employee")).filter((e: R) => s(e.status || "Active") === "Active");
  const ssa = scope.filter(src.rows("Salary Structure Assignment"));
  const inferable = isHrAdmin() && ok("Employee", "Salary Structure Assignment");
  const missing = ok("Employee", "Salary Structure Assignment") ? missingSalaryStructure(emps, ssa.filter((a: R) => s(a.from_date) <= today), inferable) : null;
  const effective = ok("Salary Structure Assignment") ? effectiveAssignments(ssa, today) : new Map<string, R>();
  const usage = structureUsage(effective);
  const future = ok("Salary Structure Assignment") ? futureAssignments(ssa, today) : [];
  const additional = scope.filter(src.rows("Additional Salary"));
  const upcoming = ok("Additional Salary") ? upcomingAdditional(additional, today) : [];
  const addDrafts = ok("Additional Salary") ? additional.filter((r: R) => n(r.docstatus) === 0) : [];
  const benefits = scope.filter(src.rows("Employee Benefit Application")).filter(live);
  const comps = componentsByType(src.rows("Salary Component"));
  const name = (r: R) => <span data-no-i18n>{tx(arLabel(s(r.employee_name) || s(r.employee)), s(r.employee_name) || s(r.employee))}</span>;

  return (
    <div className="space-y-5" data-compensation-workspace>
      <SourceNotice src={src} />
      <ScopeBar scope={scope} tx={tx} />
      <p className="dhr-card rounded-[10px] p-3 text-xs text-[var(--dhr-muted)]" data-salary-privacy>{tx("خصوصية الرواتب: لا تُعرض المبالغ أو مجاميعها هنا. افتح السجل الأصلي — يخضع لصلاحياتك — لرؤية المبلغ.", "Salary privacy: amounts and totals are not shown here. Open the native record — permission-checked — to see an amount.")}</p>
      <StatRow items={[
        { label: tx("موظفون نشطون بلا هيكل راتب ساري", "Active employees without an effective structure"), value: missing === null ? (ok("Employee", "Salary Structure Assignment") ? <NotEvaluated tx={tx} why={["غير مُقيّم: يتطلب الاطلاع على كل إسنادات الرواتب.", "Not evaluated: needs every salary assignment."]} /> : src.v(null, "Employee", "Salary Structure Assignment")) : <span data-missing-structure={missing.length}>{missing.length}</span>, tone: missing?.length ? "warn" : undefined },
        { label: tx("هياكل رواتب مستخدمة", "Structures in use"), value: src.v(<span data-structures-used>{usage.length}</span>, "Salary Structure Assignment") },
        { label: tx("تغييرات مجدولة بتاريخ لاحق", "Scheduled future changes"), value: src.v(<span data-future-assignments>{future.length}</span>, "Salary Structure Assignment") },
        { label: tx("رواتب إضافية قادمة", "Upcoming additional salary"), value: src.v(<span data-upcoming-additional>{upcoming.length}</span>, "Additional Salary") },
        { label: tx("مكونات الراتب (استحقاق / استقطاع)", "Salary components (earning / deduction)"), value: src.v(<span data-no-i18n>{comps.earning.length} / {comps.deduction.length}</span>, "Salary Component") },
      ]} />

      {missing && missing.length > 0 && (
        <section className="dhr-card rounded-[14px] p-4" data-missing-structure-list>
          <h2 className="font-semibold">{tx("بلا هيكل راتب ساري", "No effective salary structure")}</h2>
          <p className="mb-2 text-xs text-[var(--dhr-muted)]">{tx("لن تُنشأ لهم قسائم في دورة الرواتب حتى يُعتمد إسناد بتاريخ سارٍ.", "Payroll will not create slips for them until an assignment effective today is submitted.")}</p>
          <ul className="flex flex-wrap gap-2">{missing.map((e: R) => <li key={s(e.name)} data-no-i18n><Native dt="Employee" name={s(e.name)} module="04" className="dhr-btn dhr-btn-sm">{tx(arLabel(s(e.employee_name) || s(e.name)), s(e.employee_name) || s(e.name))}</Native></li>)}</ul>
          <Native dt="Salary Structure Assignment" name="new" module="04" className="mt-3 inline-flex text-sm text-[var(--dhr-emerald)] hover:underline">{tx("+ إسناد هيكل راتب", "+ Assign salary structure")}</Native>
        </section>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="dhr-card min-w-0 rounded-[14px] p-4" data-structure-usage>
          <h2 className="mb-2 font-semibold">{tx("الهياكل المستخدمة حاليًا", "Structures currently in use")}</h2>
          {usage.length ? <ul className="divide-y text-sm">{usage.map((u) => (
            <li key={u.structure} className="flex min-h-10 items-center justify-between gap-2 py-1.5">
              <Native dt="Salary Structure" name={u.structure === "—" ? undefined : u.structure} module="04" className="hover:underline"><span data-no-i18n>{u.structure}</span></Native>
              <Native dt="Salary Structure Assignment" module="04" filters={[["salary_structure", "=", u.structure], ["employee", "in", u.employees], ["docstatus", "=", 1]]} className="hover:underline"><Chip><span data-no-i18n>{u.employees.length}</span> {tx("موظف", "employees")}</Chip></Native>
            </li>))}</ul> : <div className="text-sm text-[var(--dhr-muted)]">{ok("Salary Structure Assignment") ? tx("لا توجد إسنادات سارية.", "No effective assignments.") : src.empty("Salary Structure Assignment")}</div>}
        </section>
        <section className="dhr-card min-w-0 rounded-[14px] p-4" data-future-list>
          <h2 className="mb-2 font-semibold">{tx("تغييرات هيكل الراتب المجدولة", "Scheduled structure changes")}</h2>
          {future.length ? <ul className="divide-y text-sm">{future.map((a: R) => (
            <li key={s(a.name)} className="flex min-h-10 items-center justify-between gap-2 py-1.5"><span>{name(a)} <span className="text-[11px] text-[var(--dhr-muted)]" data-no-i18n>{s(a.salary_structure)}</span></span><span className="flex items-center gap-2 text-xs" data-no-i18n>{s(a.from_date)}<Native dt="Salary Structure Assignment" name={s(a.name)} module="04" className="text-[var(--dhr-emerald)] hover:underline">{tx("فتح", "Open")}</Native></span></li>))}</ul>
            : <div className="text-sm text-[var(--dhr-muted)]">{ok("Salary Structure Assignment") ? tx("لا توجد تغييرات مجدولة.", "No scheduled changes.") : src.empty("Salary Structure Assignment")}</div>}
        </section>
      </div>

      <section className="dhr-card rounded-[14px] p-4" data-additional-register={upcoming.length + addDrafts.length}>
        <h2 className="font-semibold">{tx("الرواتب الإضافية", "Additional salary")}</h2>
        <p className="mb-3 text-xs text-[var(--dhr-muted)]">{tx("المعتمدة التي ستدخل دورة رواتب قادمة، والمسودات التي لم تُعتمد بعد. المبالغ في السجل الأصلي فقط.", "Submitted entries that will enter an upcoming payroll, and drafts not yet submitted. Amounts are in the native record only.")}</p>
        <WorkTable<R> label="additional-salary" tx={tx} rows={[...addDrafts, ...upcoming]} rowKey={(r) => s(r.name)} pageSize={10}
          emptyState={ok("Additional Salary") ? undefined : src.empty("Additional Salary")}
          searchText={(r) => `${s(r.name)} ${s(r.employee_name)} ${s(r.salary_component)}`}
          groups={[{ id: "draft", ar: "مسودة", en: "Draft", tone: "warn" }, { id: "upcoming", ar: "قادمة", en: "Upcoming" }]}
          groupOf={(r) => (n(r.docstatus) === 0 ? "draft" : "upcoming")}
          cols={[
            { key: "e", ar: "الموظف", en: "Employee", sort: (r) => s(r.employee_name), render: (r) => name(r) },
            { key: "c", ar: "المكون", en: "Component", render: (r) => <span data-no-i18n className="text-xs">{s(r.salary_component)} {s(r.type) && <span className="text-[var(--dhr-muted)]">· {tx(arLabel(s(r.type)), s(r.type))}</span>}</span> },
            { key: "d", ar: "تاريخ الرواتب", en: "Payroll date", sort: (r) => s(r.payroll_date || r.from_date), render: (r) => <span data-no-i18n className="text-xs">{n(r.is_recurring) ? <DateRange from={r.from_date} to={r.to_date} /> : s(r.payroll_date) || "—"}</span> },
            { key: "x", ar: "الإجراء", en: "Action", render: (r) => <Native dt="Additional Salary" name={s(r.name)} module="04" className="dhr-btn dhr-btn-sm">{tx("فتح", "Open")}</Native> },
          ]} />
      </section>

      <section className="dhr-card rounded-[14px] p-4" data-benefits={benefits.length}>
        <h2 className="mb-2 font-semibold">{tx("طلبات المزايا", "Benefit applications")}</h2>
        {benefits.length ? <ul className="divide-y text-sm">{benefits.map((b: R) => (
          <li key={s(b.name)} className="flex min-h-10 items-center justify-between gap-2 py-1.5"><span>{name(b)} <span className="text-[11px] text-[var(--dhr-muted)]" data-no-i18n>{s(b.payroll_period)}</span></span><span className="flex items-center gap-2">{n(b.docstatus) === 0 ? <Chip tone="warn">{tx("مسودة", "Draft")}</Chip> : <Chip>{tx("معتمد", "Submitted")}</Chip>}<Native dt="Employee Benefit Application" name={s(b.name)} module="04" className="text-[var(--dhr-emerald)] hover:underline">{tx("فتح", "Open")}</Native></span></li>))}</ul>
          : <div className="text-sm text-[var(--dhr-muted)]">{ok("Employee Benefit Application") ? tx("لا توجد طلبات مزايا.", "No benefit applications.") : src.empty("Employee Benefit Application")}</div>}
      </section>
    </div>
  );
}
