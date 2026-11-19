/**
 * Section 04.5 — Advances & expense claims: approver inbox, claim decision register with unallocated-advance warnings,
 * and the advance settlement register (HRMS unclaimed = paid − claimed − returned). Approval, payment, return and
 * salary recovery happen only in the native forms through the shared posting engine; this page never writes.
 */
import { useScopeMetas } from "@/plugins/digit_hr/compat/scope";
import { useStoreVersion } from "@/lib/adapter";
import { currentUser, useSessionUser } from "@/plugins/digit_hr/compat/session";
import { fmtCurrency } from "@/lib/format";
import { useTx } from "@/components/digithr/DigitHrLayout";
import { MetricValue, ScopeBar, useModuleScope } from "@/components/digithr/ModuleScope";
import { WorkTable } from "@/components/digithr/EnterpriseRegister";
import { Native, Chip, StatRow, arLabel, useSources, SourceNotice, s, n } from "./shared";
import { advancePending, ageDays, claimAmount, isApprovedUnpaid, isClaimAwaitingDecision, isOpenAdvance, unallocatedAdvanceClaims } from "@/plugins/digit_hr/claimsFacts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type R = any;
const DT = ["Employee", "Employee Advance", "Expense Claim"];

export function ExpensesWorkspace() {
  const { tx } = useTx();
  useStoreVersion(); useSessionUser();
  useScopeMetas(DT);
  const src = useSources(tx);
  const scope = useModuleScope(src);
  const me = currentUser();
  const today = new Date().toISOString().slice(0, 10);
  const claimsReady = src.ready("Expense Claim") && scope.companyKnown;
  const advReady = src.ready("Employee Advance") && scope.companyKnown;
  const claims = scope.filter(src.rows("Expense Claim"));
  const advances = scope.filter(src.rows("Employee Advance"));
  const deciding = claimsReady ? claims.filter(isClaimAwaitingDecision) : [];
  const flagged = claimsReady && advReady ? unallocatedAdvanceClaims(deciding, advances) : new Map<string, string[]>();
  const open = advReady ? advances.filter(isOpenAdvance).sort((a: R, b: R) => s(a.posting_date).localeCompare(s(b.posting_date))) : [];
  const unpaid = claimsReady ? claims.filter(isApprovedUnpaid) : [];
  const mine = deciding.filter((c: R) => s(c.expense_approver) === me);
  const name = (r: R) => <span data-no-i18n>{tx(arLabel(s(r.employee_name) || s(r.employee)), s(r.employee_name) || s(r.employee))}</span>;
  const money = (v: number, r: R) => <span data-no-i18n className="tabular-nums">{fmtCurrency(v, s(r.currency) || undefined)}</span>;
  const kpi = (l: string, deps: string[]) => <MetricValue label={l} scope={scope} src={src} tx={tx} back="04.5" deps={deps} />;

  return (
    <div className="space-y-5" data-expenses-workspace>
      <SourceNotice src={src} />
      <ScopeBar scope={scope} tx={tx} />
      <StatRow items={[
        { label: tx("مطالبات بانتظار الاعتماد", "Claims awaiting approval"), value: kpi("Claims Awaiting Approval", ["Expense Claim"]) },
        { label: tx("مسندة إليّ للاعتماد", "Assigned to me"), value: src.v(<span data-my-claims>{mine.length}</span>, "Expense Claim") },
        { label: tx("معتمدة غير مدفوعة", "Approved, not paid"), value: kpi("Approved Unpaid Claims", ["Expense Claim"]) },
        { label: tx("سلف لم تُسوَّ بالكامل", "Advances not fully settled"), value: kpi("Open Employee Advances", ["Employee Advance"]), tone: open.length ? "warn" : undefined },
      ]} />

      <section className="dhr-card rounded-[14px] p-4" data-claims-register={deciding.length}>
        <h2 className="font-semibold">{tx("مطالبات تحتاج قرارًا", "Claims needing a decision")}</h2>
        <p className="mb-3 text-xs text-[var(--dhr-muted)]">{tx("يُعتمد القرار في النموذج الأصلي (حالة الاعتماد ثم الاعتماد النهائي). التنبيه يعني أن للموظف سلفة مفتوحة لم تُخصَّص في المطالبة.", "Decide in the native form (approval status, then submit). A warning means the employee has an open advance the claim does not allocate.")}</p>
        <WorkTable<R> label="claims-decision" tx={tx} rows={deciding} rowKey={(r) => s(r.name)} pageSize={10}
          emptyState={claimsReady ? undefined : src.empty("Expense Claim")}
          searchText={(r) => `${s(r.name)} ${s(r.employee_name)} ${s(r.employee)}`}
          groups={[{ id: "mine", ar: "مسندة إليّ", en: "Assigned to me", tone: "warn" }, { id: "others", ar: "معتمدون آخرون", en: "Other approvers" }]}
          groupOf={(r) => (s(r.expense_approver) === me ? "mine" : "others")}
          cols={[
            { key: "e", ar: "الموظف", en: "Employee", sort: (r) => s(r.employee_name), render: (r) => <span>{name(r)}<span className="block text-[11px] text-[var(--dhr-muted)]" data-no-i18n>{s(r.name)}</span></span> },
            { key: "d", ar: "التاريخ", en: "Date", sort: (r) => s(r.posting_date), render: (r) => <span data-no-i18n className="whitespace-nowrap text-xs">{s(r.posting_date) || "—"}<span className="block text-[var(--dhr-muted)]">{ageDays(r.posting_date, today) ?? "—"} {tx("يوم", "d")}</span></span> },
            { key: "a", ar: "المبلغ المطالب", en: "Claimed", sort: (r) => claimAmount(r), render: (r) => money(claimAmount(r), r) },
            { key: "p", ar: "المعتمد", en: "Approver", render: (r) => <span data-no-i18n className="text-xs">{s(r.expense_approver) || "—"}</span> },
            { key: "f", ar: "السلف", en: "Advances", render: (r) => flagged.has(s(r.name)) ? <Chip tone="warn"><span data-flag-advance={s(r.name)}>{tx("سلفة مفتوحة غير مخصصة", "Open advance not allocated")}</span></Chip> : <span className="text-xs text-[var(--dhr-muted)]">—</span> },
            { key: "x", ar: "الإجراء", en: "Action", render: (r) => <Native dt="Expense Claim" name={s(r.name)} module="04" className="dhr-btn dhr-btn-sm">{tx("مراجعة", "Review")}</Native> },
          ]} />
      </section>

      <section className="dhr-card rounded-[14px] p-4" data-advances-register={open.length}>
        <h2 className="font-semibold">{tx("تسوية السلف", "Advance settlement")}</h2>
        <p className="mb-3 text-xs text-[var(--dhr-muted)]">{tx("المتبقي = المدفوع − المُطالَب به − المُعاد (كما في المصدر). التسوية بمطالبة أو إعادة أو خصم من الراتب تتم من النموذج الأصلي.", "Remaining = paid − claimed − returned (as in the source). Settle by claim, return or salary recovery from the native form.")}</p>
        <WorkTable<R> label="advances-open" tx={tx} rows={open} rowKey={(r) => s(r.name)} pageSize={10}
          emptyState={advReady ? undefined : src.empty("Employee Advance")}
          searchText={(r) => `${s(r.name)} ${s(r.employee_name)} ${s(r.purpose)}`}
          cols={[
            { key: "e", ar: "الموظف", en: "Employee", sort: (r) => s(r.employee_name), render: (r) => <span>{name(r)}<span className="block text-[11px] text-[var(--dhr-muted)]" data-no-i18n>{s(r.name)}</span></span> },
            { key: "g", ar: "العمر", en: "Age", sort: (r) => ageDays(r.posting_date, today) ?? 0, render: (r) => <span data-no-i18n className="whitespace-nowrap text-xs">{ageDays(r.posting_date, today) ?? "—"} {tx("يوم", "d")}</span> },
            { key: "pd", ar: "المدفوع", en: "Paid", render: (r) => money(n(r.paid_amount), r) },
            { key: "c", ar: "المُطالَب", en: "Claimed", render: (r) => money(n(r.claimed_amount), r) },
            { key: "rt", ar: "المُعاد", en: "Returned", render: (r) => money(n(r.return_amount), r) },
            { key: "rm", ar: "المتبقي", en: "Remaining", sort: (r) => advancePending(r), render: (r) => <strong data-advance-pending={s(r.name)}>{money(advancePending(r), r)}</strong> },
            { key: "x", ar: "الإجراء", en: "Action", render: (r) => <Native dt="Employee Advance" name={s(r.name)} module="04" className="dhr-btn dhr-btn-sm">{tx("فتح", "Open")}</Native> },
          ]} />
      </section>

      <section className="dhr-card rounded-[14px] p-4" data-unpaid-claims={unpaid.length}>
        <h2 className="font-semibold">{tx("مطالبات معتمدة بانتظار الصرف", "Approved claims awaiting payment")}</h2>
        {unpaid.length ? <ul className="divide-y text-sm">{unpaid.map((r: R) => (
          <li key={s(r.name)} className="flex min-h-10 flex-wrap items-center justify-between gap-2 py-1.5">
            <span>{name(r)} <span className="text-[11px] text-[var(--dhr-muted)]" data-no-i18n>{s(r.name)} · {s(r.posting_date)}</span></span>
            <span className="flex items-center gap-3">{money(claimAmount(r), r)}<Native dt="Expense Claim" name={s(r.name)} module="04" className="text-[var(--dhr-emerald)] hover:underline">{tx("فتح", "Open")}</Native></span>
          </li>))}</ul> : <div className="text-sm text-[var(--dhr-muted)]">{claimsReady ? tx("لا توجد مطالبات معتمدة غير مدفوعة.", "No approved unpaid claims.") : src.empty("Expense Claim")}</div>}
        <p className="mt-2 text-[11px] text-[var(--dhr-muted)]">{tx("الصرف عبر سند الدفع الأصلي؛ لا يتم الصرف من هذه الصفحة.", "Payment goes through the native Payment Entry; nothing is paid from this page.")}</p>
      </section>
    </div>
  );
}
