/**
 * Section 01.4 — Employee master & 360 bridge: company-scoped profile completeness with the consequence of each gap,
 * field coverage, recently updated employees, and direct paths into the directory, Employee 360 and the native form.
 * Edits happen only in the native Employee form.
 */
import { Link } from "@tanstack/react-router";
import { useScopeMetas } from "@/plugins/digit_hr/compat/scope";
import { useStoreVersion } from "@/lib/adapter";
import { hasPerm, useSessionUser } from "@/plugins/digit_hr/compat/session";
import { cachedMeta } from "@/lib/catalog";
import { useTx } from "@/components/digithr/DigitHrLayout";
import { enterHrNative } from "@/components/digithr/HrNav";
import { MetricValue, ScopeBar, useModuleScope } from "@/components/digithr/ModuleScope";
import { WorkTable } from "@/components/digithr/EnterpriseRegister";
import { Native, Chip, StatRow, arLabel, useSources, SourceNotice, s } from "./shared";
import { PROFILE_FIELDS, fieldCoverage, profileGaps, recentlyUpdated, type ProfileGap } from "@/plugins/digit_hr/employeeFacts";
import { HR_DOC_SEARCH } from "@/plugins/digit_hr/product/urls";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type R = any;
const label = (f: string, tx: (a: string, b: string) => string) => { const p = PROFILE_FIELDS.find((x) => x.field === f); return p ? tx(p.ar, p.en) : f; };

export function EmployeeMasterWorkspace() {
  const { tx } = useTx();
  useStoreVersion(); useSessionUser();
  useScopeMetas(["Employee"]);
  const src = useSources(tx);
  const scope = useModuleScope(src);
  const ready = src.ready("Employee") && scope.companyKnown;
  const emps = scope.filter(src.rows("Employee"));
  const gaps = ready ? profileGaps(emps) : [];
  const cover = fieldCoverage(gaps);
  const recent = ready ? recentlyUpdated(emps) : [];
  const meta = cachedMeta("Employee");
  const canCreate = !!meta && hasPerm(meta, "create");
  const kpi = (l: string) => <MetricValue label={l} scope={scope} src={src} tx={tx} back="01.4" deps={["Employee"]} />;

  return (
    <div className="space-y-5" data-employee-master>
      <SourceNotice src={src} />
      <ScopeBar scope={scope} tx={tx}>
        <div className="flex flex-wrap gap-2">
          <Link to="/digit-hr/employees" search={scope.company ? { company: scope.company } : {}} className="dhr-btn inline-flex min-h-10 items-center" data-open-directory>{tx("فتح دليل الموظفين", "Open employee directory")}</Link>
          {canCreate && <Link to="/app/$app/$doctype/$name" search={HR_DOC_SEARCH as never} params={{ app: "erpnext", doctype: "employee", name: "new" }} onClick={() => enterHrNative("01.4")} className="dhr-btn dhr-btn-primary inline-flex min-h-10 items-center">{tx("+ موظف جديد", "+ New employee")}</Link>}
        </div>
      </ScopeBar>

      <StatRow items={[
        { label: tx("موظفون نشطون", "Active employees"), value: kpi("Active Headcount") },
        { label: tx("سجلات غير مكتملة (قسم/مسمى/التحاق)", "Incomplete (department/designation/joining)"), value: kpi("Incomplete records") },
        { label: tx("بلا قسم", "No department"), value: kpi("Unassigned Department") },
        { label: tx("بلا حساب مستخدم (لا خدمة ذاتية)", "No user account (no self-service)"), value: kpi("Employees Without User Link") },
        { label: tx("ملفات مكتملة 100%", "Profiles 100% complete"), value: src.v(<span data-complete-profiles>{gaps.filter((g) => g.score === 100).length}</span>, "Employee") },
      ]} />

      <section className="dhr-card rounded-[14px] p-4" data-field-coverage>
        <h2 className="font-semibold">{tx("تغطية حقول الملف", "Profile field coverage")}</h2>
        <p className="mb-3 text-xs text-[var(--dhr-muted)]">{tx("كم موظفًا نشطًا ينقصه كل حقل، ولماذا يهم. كل رقم يفتح السجلات الأصلية.", "How many active employees lack each field, and why it matters. Each number opens the native records.")}</p>
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {PROFILE_FIELDS.map((f) => { const miss = cover[f.field] ?? []; return (
            <li key={f.field} className="rounded-[10px] border border-[var(--dhr-border)] p-3" data-coverage={f.field} data-missing={ready ? miss.length : ""}>
              <div className="flex items-center justify-between gap-2"><span className="font-medium">{tx(f.ar, f.en)}</span>
                {!ready ? src.empty("Employee") : miss.length ? <Native dt="Employee" module="01" filters={[["name", "in", miss]]} className="hover:underline"><Chip tone="warn"><span data-no-i18n>{miss.length}</span> {tx("ناقص", "missing")}</Chip></Native> : <Chip>{tx("مكتمل", "Complete")}</Chip>}</div>
              <p className="mt-1 text-[11px] text-[var(--dhr-muted)]">{tx(f.whyAr, f.whyEn)}</p>
            </li>); })}
        </ul>
      </section>

      <section className="dhr-card rounded-[14px] p-4" data-profile-gaps={gaps.filter((g) => g.missing.length).length}>
        <h2 className="font-semibold">{tx("سجل اكتمال الملفات", "Profile completeness register")}</h2>
        <p className="mb-3 text-xs text-[var(--dhr-muted)]">{tx("الأقل اكتمالًا أولًا. افتح ملف 360 للسياق أو النموذج الأصلي للتعديل.", "Least complete first. Open the 360 for context or the native form to edit.")}</p>
        <WorkTable<ProfileGap> label="profile-gaps" tx={tx} rows={gaps} rowKey={(g) => g.employee} pageSize={10}
          emptyState={ready ? undefined : src.empty("Employee")}
          searchText={(g) => `${g.employeeName} ${g.employee} ${g.department}`}
          groups={[{ id: "identity", ar: "بلا حساب مستخدم", en: "No user account", tone: "warn" }, { id: "approvals", ar: "بلا مدير مباشر", en: "No manager", tone: "warn" }, { id: "other", ar: "نواقص أخرى", en: "Other gaps" }, { id: "complete", ar: "مكتمل", en: "Complete" }]}
          groupOf={(g) => (g.missing.includes("user_id") ? "identity" : g.missing.includes("reports_to") ? "approvals" : g.missing.length ? "other" : "complete")}
          cols={[
            { key: "e", ar: "الموظف", en: "Employee", sort: (g) => g.employeeName, render: (g) => <span data-no-i18n><Link to="/digit-hr/employees/$name" params={{ name: g.employee }} className="font-medium text-[var(--dhr-emerald)] hover:underline" data-open-360={g.employee}>{tx(arLabel(g.employeeName), g.employeeName)}</Link><span className="block text-[11px] text-[var(--dhr-muted)]">{g.employee}</span></span> },
            { key: "d", ar: "القسم", en: "Department", sort: (g) => g.department, render: (g) => <span data-no-i18n className="text-xs">{g.department ? tx(arLabel(g.department), g.department) : "—"}</span> },
            { key: "m", ar: "الحقول الناقصة", en: "Missing fields", render: (g) => g.missing.length ? <span className="flex flex-wrap gap-1">{g.missing.map((f) => <Chip key={f} tone="warn">{label(f, tx)}</Chip>)}</span> : <Chip>{tx("مكتمل", "Complete")}</Chip> },
            { key: "s", ar: "الاكتمال", en: "Completeness", sort: (g) => g.score, render: (g) => <span className="inline-flex items-center gap-2" data-no-i18n><span className="h-1.5 w-16 overflow-hidden rounded bg-[var(--dhr-sep)]"><span className="block h-full bg-[var(--dhr-emerald)]" style={{ width: `${g.score}%` }} /></span>{g.score}%</span> },
            { key: "x", ar: "الإجراء", en: "Action", render: (g) => <Native dt="Employee" name={g.employee} module="01" className="dhr-btn dhr-btn-sm">{g.missing.length ? tx("استكمال في النموذج", "Complete in form") : tx("فتح", "Open")}</Native> },
          ]} />
      </section>

      <section className="dhr-card rounded-[14px] p-4" data-recent-employees={recent.length}>
        <h2 className="font-semibold">{tx("آخر الملفات تحديثًا", "Recently updated profiles")}</h2>
        {recent.length ? <ul className="divide-y text-sm">{recent.map((e: R) => (
          <li key={s(e.name)} className="flex min-h-10 items-center justify-between gap-2 py-1.5">
            <Link to="/digit-hr/employees/$name" params={{ name: s(e.name) }} className="hover:underline" data-no-i18n>{tx(arLabel(s(e.employee_name) || s(e.name)), s(e.employee_name) || s(e.name))}</Link>
            <span className="text-xs text-[var(--dhr-muted)]" data-no-i18n>{s(e.modified || e.creation).slice(0, 16).replace("T", " ")}</span>
          </li>))}</ul> : src.empty("Employee")}
      </section>
    </div>
  );
}
