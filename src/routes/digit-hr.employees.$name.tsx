import { Button } from "@/components/ui/button";
import { deskUrl, frappeHost } from "@/plugins/digit_hr/compat/host";
import { assertScoped } from "@/plugins/digit_hr/compat/scope";
import { t } from "@/i18n";
import { Search, FileText, Clock, Pencil, UserRound, History, MessagesSquare, PenLine } from "lucide-react";
import { arLabel } from "@/components/digithr/workspaces/shared";
import type { ReactNode } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { enterHrNative } from "@/components/digithr/HrNav";
import { DigitHrLayout, useTx } from "@/components/digithr/DigitHrLayout";
import { adapter, useStoreVersion } from "@/lib/adapter";
import { cachedMeta, metaQuery } from "@/lib/catalog";
import { canReadType, scopedGet, scopedList, useScopeMetas } from "@/plugins/digit_hr/compat/scope";
import { hasPerm, levelAccess, useSessionUser } from "@/plugins/digit_hr/compat/session";
import { PROFILE_FIELDS, profileGaps } from "@/plugins/digit_hr/employeeFacts";
import { leaveBalances } from "@/plugins/digit_hr/leaveFacts";
import { directReports, internalHistory, managerChain, validGroup } from "@/plugins/digit_hr/employee360Facts";
import { applicantForEmployee } from "@/plugins/digit_hr/applicantFacts";
import { placeDoc } from "@/plugins/digit_hr/v6/nav";
import { registry } from "@/plugins/digit_hr/service";
import {MovementDraft} from '@/components/digithr/MovementDraft';
import { CompensationStatement } from '@/components/digithr/R9Extras';
import {amendmentsForEmployee,contractAmendmentDraft} from '@/plugins/digit_hr/contracts';
import { groupTimeline, type TimelineEvent, type TimelineWeek } from '@/plugins/digit_hr/timelineGroups';
import { ActivityTimeline, CountRow, FactGrid, RelationRail, SensitiveFacts, SummaryCard, TabRow, usePageCompany, type Fact, type ProfileHue, type StatusTone, type TlCat, type TlRow } from '@/components/enterprise/RecordProfile';
import { EmployeeOrg } from '@/components/digithr/product/EmployeeOrg';
import { ChangeLog } from '@/components/enterprise/kit/QueueSplit';
import { changeLog } from '@/lib/changeLog';
import { fmtNumber, riyal } from '@/lib/format';
import { deptHue, sensitiveFacts, summaryOf } from '@/plugins/digit_hr/product/people';
import type { KpiIconKind } from '@/components/enterprise/kit/KpiCard';
import { conversationsOf } from '@/plugins/digit_hr/r10/features/closing';
import { insertHrDraft } from '@/plugins/digit_hr/compat/drafts';
import { HR_DOC_SEARCH, hrSearch } from "@/plugins/digit_hr/product/urls";
import { QuickLink } from "@/components/enterprise/QuickView";
import { ContextStrip } from "@/components/enterprise/kit/templates";
import { recordsOfEmployee } from "@/plugins/digit_hr/r10/features/links";
import { accountState, EmployeeAccountButton } from "@/components/digithr/EmployeeAccount";

export const Route = createFileRoute("/digit-hr/employees/$name")({
  validateSearch: (s: Record<string, unknown>): { tab?: string | undefined; q?: string | undefined; g?: string | undefined } => ({
    tab: typeof s["tab"] === "string" && TAB_KEYS.includes(s["tab"]) ? s["tab"] : undefined,
    q: typeof s["q"] === "string" && s["q"] ? s["q"].slice(0, 120) : undefined,
    g: validGroup(s["g"], GROUPS.map((x) => x.key)) || undefined,
  }),
  head: () => ({ meta: [
    { title: "Employee 360 — DIGIT HR" },
    { name: "description", content: "Employee 360: contracts, onboarding, moves, attendance, leave, performance, pay, claims, documents and separation for one canonical employee." },
    { property: "og:title", content: "Employee 360 — DIGIT HR" },
    { property: "og:description", content: "One canonical employee with every linked HR record." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: Employee360,
});

/** Every source is a DocType with a verified `employee` Link (catalog / v8 doctypes.ts). Records are matched on canonical Employee.name. */
type Src = { dt: string; cols: string[] };
type Group = { key: string; ar: string; en: string; module: string; srcs: Src[]; restricted?: boolean };
const GROUPS: Group[] = [
  { key: "contract", ar: "علاقة العمل والعقود", en: "Employment & contracts", module: "01", srcs: [
    { dt: "DIGIT Work Relationship", cols: ["relationship_type", "start_date", "end_date"] },
    { dt: "DIGIT Employment Contract", cols: ["contract_type", "start_date", "end_date", "contract_status"] }] },
  { key: "join", ar: "الالتحاق والتهيئة", en: "Joining & onboarding", module: "02", srcs: [
    { dt: "Employee Onboarding", cols: ["job_applicant", "boarding_status"] }] },
  { key: "moves", ar: "النقل والترقية والتكليف", en: "Transfers, promotions & assignments", module: "01", srcs: [
    { dt: "Employee Transfer", cols: ["transfer_date", "new_company"] },
    { dt: "Employee Promotion", cols: ["promotion_date"] },
    { dt: "DIGIT Assignment History", cols: ["position", "designation", "from_date", "to_date", "change_reason"] }] },
  { key: "time", ar: "الحضور والورديات والإجازات", en: "Attendance, shifts & leave", module: "03", srcs: [
    { dt: "Attendance", cols: ["attendance_date", "status", "shift"] },
    { dt: "Employee Checkin", cols: ["time", "log_type"] },
    { dt: "Shift Assignment", cols: ["shift_type", "start_date", "status"] },
    { dt: "Leave Application", cols: ["leave_type", "from_date", "to_date", "status"] },
    { dt: "Attendance Request", cols: ["from_date", "to_date", "reason"] },
    { dt: "Leave Allocation", cols: ["leave_type", "from_date", "to_date", "new_leaves_allocated"] }] },
  { key: "projects", ar: "تكليفات المشاريع والمشتريات", en: "Project assignments & purchases", module: "03", srcs: [
    { dt: "DIGIT Site Worker Assignment", cols: ["project", "branch", "from_date", "to_date", "role_on_site", "status"] },
    { dt: "Purchase Order", cols: ["transaction_date", "supplier", "grand_total", "status"] },
    { dt: "Material Request", cols: ["transaction_date", "material_request_type", "status"] }] },
  { key: "talent", ar: "الأداء والتدريب والمهارات", en: "Performance, training & skills", module: "02", srcs: [
    { dt: "Appraisal", cols: ["appraisal_cycle", "start_date", "final_score"] },
    { dt: "Employee Skill Map", cols: ["designation"] }] },
  { key: "pay", ar: "التعويضات والرواتب", en: "Compensation & payroll", module: "04", restricted: true, srcs: [
    { dt: "Salary Structure Assignment", cols: ["salary_structure", "from_date", "base"] },
    { dt: "Salary Slip", cols: ["start_date", "end_date", "net_pay", "status"] }] },
  { key: "money", ar: "السلف والمطالبات", en: "Advances & claims", module: "05", restricted: true, srcs: [
    { dt: "Employee Advance", cols: ["posting_date", "advance_amount", "status"] },
    { dt: "Expense Claim", cols: ["posting_date", "total_claimed_amount", "status"] }] },
  { key: "exit", ar: "إنهاء الخدمة والمخالصة", en: "Separation & settlement", module: "01", srcs: [
    { dt: "Employee Separation", cols: ["resignation_letter_date", "boarding_status"] },
    { dt: "Exit Interview", cols: ["date", "status"] },
    { dt: "Full and Final Statement", cols: ["transaction_date", "relieving_date", "status"] }] },
];
const ALL_DT = GROUPS.flatMap((g) => g.srcs.map((x) => x.dt));
/** Category colour and icon tile of each record group (Round 1 §E: attendance teal, payroll gold, contracts violet, projects coral). */
const CAT: Record<string, { hue: ProfileHue; icon: KpiIconKind }> = {
  time: { hue: "teal", icon: "time" }, pay: { hue: "gold", icon: "money" }, contract: { hue: "violet", icon: "doc" }, projects: { hue: "coral", icon: "stock" },
  join: { hue: "blue", icon: "people" }, moves: { hue: "emerald", icon: "chart" }, talent: { hue: "lime", icon: "percent" }, money: { hue: "amber", icon: "money" }, exit: { hue: "rose", icon: "alert" },
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type R = any;
/** INT-11: purchases name the employee they serve in digit_employee; every other source links through `employee` (r10/features/links.ts). */
const rowsFor = (dt: string, emp: string): R[] => (recordsOfEmployee(dt, emp) as R[] | null) ?? [];

/** Contextual create: same path as the list "+ Add" (adapter.insert) with the canonical employee pre-linked; hidden without create permission. */
/** A linked project shows its name, not its code; other values stay as stored. */
function cellName(c: string, v: unknown): string {
  const s = String(v ?? ""); if (!s) return s;
  if (c === "project") return String(adapter.get("Project", s)?.["project_name"] ?? s);
  return s;
}
function NewFor({ dt, emp, module }: { dt: string; emp: R; module: string }) {
  const { tx } = useTx(); useSessionUser();
  const p = placeDoc(dt, module);
  const { data: meta } = useQuery({ ...metaQuery(p?.app ?? "hrms", p?.slug ?? "x"), enabled: !!p });
  const nav = useNavigate();
  if (!p || !meta || meta.istable || meta.issingle || !hasPerm(meta, "create",{name:'',doctype:dt,employee:emp.name,company:emp.company})) return null;
  if(dt==='Employee Transfer' || dt==='Employee Promotion')return <MovementDraft employee={emp.name} doctype={dt} />;
  return <Button variant="outline" type="button" data-new-for={dt} className="dhr-chip min-h-9 text-xs" onClick={() => {
    // On a Frappe site the real Desk form creates the record, prefilled for this employee.
    if (frappeHost()) { enterHrNative(p.sub); window.location.assign(deskUrl(meta.name, "new", { employee: emp.name, company: emp.company })); return; }
    try {
      const data = { employee: emp.name, employee_name: emp.employee_name, company: emp.company };
      assertScoped(meta.name, "create", { name: "", doctype: meta.name, ...data });
      const doc = insertHrDraft(meta, data);
      enterHrNative(p.sub);
      void nav({ to: "/app/$app/$doctype/$name", params: { app: p.app, doctype: p.slug, name: doc.name }, search: HR_DOC_SEARCH as never });
    } catch (e) { toast.error(String((e as Error).message)); }
  }}>{tx("+ جديد", "+ New")}</Button>;
}

function SrcBlock({ src, emp, module }: { src: Src; emp: R; module: string }) {
  const { tx } = useTx();
  const p = placeDoc(src.dt, module);
  const rows = src.dt === 'DIGIT Contract Amendment' ? amendmentsForEmployee(emp.name) : rowsFor(src.dt, emp.name);
  const nav = useNavigate();
  useSessionUser();
  const amendmentMeta = useQuery({...metaQuery('hrms','digit_contract_amendment'),enabled:src.dt==='DIGIT Employment Contract'}).data;
  return (
    <div className="border-b p-3 last:border-0" data-src={src.dt}>
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{t(src.dt)} <span className="opacity-60" data-no-i18n>({rows.length})</span></h3>
        <span className="flex items-center gap-2">
          {p && <Link to="/app/$app/$doctype" params={{ app: p.app, doctype: p.slug }} search={hrSearch({ filters: JSON.stringify(src.dt==='DIGIT Contract Amendment' ? [["name", "in", rows.map(r=>r.name).join(',') || '__no_employee_amendments__']] : [["employee", "=", emp.name]]) }) as never} onClick={() => enterHrNative(p.sub)} className="text-xs underline">{tx("القائمة", "List")}</Link>}
          {src.dt!=='DIGIT Contract Amendment' && <NewFor dt={src.dt} emp={emp} module={module} />}
        </span>
      </div>
      {!p && rows.length > 0 ? <div className="overflow-x-auto"><table className="w-full text-sm"><tbody>{rows.slice(0, 20).map((r) => <tr key={r.name} className="h-11 border-t" data-quick-row={r.name}>
            <td className="px-2"><QuickLink doctype={src.dt} name={r.name} className="text-primary hover:underline" /></td>
            {src.cols.map((c) => <td key={c} className="px-2" data-no-i18n={!/status|type/.test(c)}>{/status|type/.test(c) ? t(String(r[c] ?? "")) : cellName(c, r[c])}</td>)}</tr>)}</tbody></table></div>
        : !p ? <p className="text-xs text-muted-foreground">{tx("لا توجد سجلات لهذا الموظف.", "No records for this employee.")}</p>
        : rows.length === 0 ? <p className="text-xs text-muted-foreground">{tx("لا توجد سجلات لهذا الموظف.", "No records for this employee.")}</p>
        : <div className="overflow-x-auto"><table className="w-full text-sm"><tbody>{rows.slice(0, 20).map((r) => <tr key={r.name} className="h-11 border-t">
            <td className="px-2"><Link onClick={() => enterHrNative(p.sub)} to="/app/$app/$doctype/$name" search={HR_DOC_SEARCH as never} params={{ app: p.app, doctype: p.slug, name: r.name }} className="text-primary hover:underline" data-no-i18n>{r.name}</Link></td>
            {src.dt==='DIGIT Employment Contract' && <td className="px-2"><Link to="/digit-hr/contracts/$name" params={{ name: r.name }} className="text-primary hover:underline" data-contract-360={r.name}>{tx('الملف 360','360 profile')}</Link></td>}
            {src.dt==='DIGIT HR Service Case' && <td className="px-2"><Link to="/digit-hr/cases/$name" params={{ name: r.name }} className="text-primary hover:underline" data-case-360={r.name}>{tx('الملف 360','360 profile')}</Link></td>}
            {src.cols.map((c) => <td key={c} className="px-2" data-no-i18n={!/status|type|log_type/.test(c)}>{/status|type|log_type/.test(c) ? t(String(r[c] ?? "")) : cellName(c, r[c])}</td>)}
            {src.dt==='DIGIT Employment Contract' && amendmentMeta && hasPerm(amendmentMeta,'create',{name:'',doctype:amendmentMeta.name,contract:r.name}) && Number(r.docstatus)!==2 && !['Expired','Terminated'].includes(String(r.contract_status)) && <td className="px-2"><Button variant="outline" data-amend-contract={r.name} onClick={()=>{try{const doc=contractAmendmentDraft(r.name);const destination=placeDoc('DIGIT Contract Amendment','01');if(!destination)return;enterHrNative(destination.sub);void nav({to:'/app/$app/$doctype/$name',params:{app:destination.app,doctype:destination.slug,name:doc.name}});}catch(error){toast.error((error as Error).message);}}}>{tx('تعديل العقد','Amend contract')}</Button></td>}</tr>)}</tbody></table></div>}
    </div>
  );
}

const TAB_KEYS = ["timeline", "talk", "profile", "history", "changes", "docs", ...GROUPS.map((g) => g.key)];

/** Employee table fields are shown only when the reader's permlevel access includes the field's level (Core levelAccess). */
function fieldReadable(field: string): boolean {
  const meta = cachedMeta("Employee"); if (!meta) return false;
  const f = meta.fields.find((x) => x.fieldname === field); if (!f) return false;
  return levelAccess(meta).read.has(Number(f["permlevel"] ?? 0));
}

function ProfilePanel({ emp }: { emp: R }) {
  const { tx } = useTx();
  const emps = scopedList("Employee") as R[];
  const gap = profileGaps([emp])[0];
  const chain = managerChain(emp.name, emps);
  const reports = directReports(emp.name, emps) as R[];
  const today = new Date().toISOString().slice(0, 10);
  const leaveOk = canReadType("Leave Allocation") && canReadType("Leave Application");
  const balances = leaveOk ? leaveBalances(rowsFor("Leave Allocation", emp.name), rowsFor("Leave Application", emp.name), today).filter((b) => b.employee === emp.name) : null;
  // Employee Onboarding.employee → job_applicant (source links); shown only when both are readable in scope.
  const hiredFrom = canReadType("Employee Onboarding") && canReadType("Job Applicant") ? applicantForEmployee(emp.name, scopedList("Employee Onboarding") as R[]) : "";
  const hiredVisible = hiredFrom && scopedGet("Job Applicant", hiredFrom) ? hiredFrom : "";
  const person = (id: string, label: string) => <Link to="/digit-hr/employees/$name" params={{ name: id }} search={{ tab: "profile" }} className="text-primary hover:underline" data-no-i18n>{tx(arLabel(label), label)}</Link>;
  return (
    <div className="grid gap-4 p-3 lg:grid-cols-2" data-profile-panel>
      <section className="min-w-0" data-profile-completeness={gap?.score ?? ""}>
        <h3 className="mb-2 text-sm font-semibold">{tx("اكتمال الملف", "Profile completeness")} <span className="text-muted-foreground" data-no-i18n>{gap ? `${gap.score}%` : "—"}</span></h3>
        {!gap ? <p className="text-sm text-muted-foreground">{tx("لا ينطبق على موظف غير نشط.", "Not applicable to an inactive employee.")}</p>
          : gap.missing.length ? <ul className="space-y-1 text-sm">{PROFILE_FIELDS.filter((f) => gap.missing.includes(f.field)).map((f) => <li key={f.field} data-profile-missing={f.field}><span className="font-medium">{tx(f.ar, f.en)}</span> <span className="text-xs text-muted-foreground">— {tx(f.whyAr, f.whyEn)}</span></li>)}</ul>
          : <p className="text-sm text-muted-foreground">{tx("كل الحقول الأساسية مكتملة.", "All core fields are complete.")}</p>}
      </section>
      <section className="min-w-0" data-reporting-line={chain.steps.length}>
        <h3 className="mb-2 text-sm font-semibold">{tx("خط الإبلاغ", "Reporting line")}</h3>
        {chain.steps.length === 0 ? <p className="text-sm text-muted-foreground">{tx("لا يوجد مدير مباشر مسجل.", "No manager recorded.")}</p>
          : <ol className="space-y-1 text-sm">{chain.steps.map((st, i) => <li key={st.id} className="flex flex-wrap items-center gap-2"><span className="text-xs text-muted-foreground" data-no-i18n>{i + 1}</span>{st.visible ? <>{person(st.id, st.name)}{st.designation && <span className="text-xs text-muted-foreground" data-no-i18n>{tx(arLabel(st.designation), st.designation)}</span>}</> : <span className="text-muted-foreground" data-manager-hidden>{tx("مدير خارج نطاق صلاحياتك", "Manager outside your permitted scope")}</span>}</li>)}</ol>}
        {chain.loop && <p role="alert" className="mt-1 text-xs text-[var(--dhr-danger,inherit)]">{tx("حلقة في خط الإبلاغ — صحّحها في سجل الموظف.", "Reporting loop — correct it on the employee record.")}</p>}
        <h3 className="mb-1 mt-3 text-sm font-semibold">{tx("المرؤوسون المباشرون", "Direct reports")} <span className="text-muted-foreground" data-no-i18n>({reports.length})</span></h3>
        {reports.length ? <ul className="flex flex-wrap gap-2 text-sm" data-direct-reports={reports.length}>{reports.map((r) => <li key={r.name}>{person(r.name, String(r.employee_name || r.name))}</li>)}</ul> : <p className="text-sm text-muted-foreground">{tx("لا يوجد مرؤوسون ضمن نطاقك.", "No direct reports within your scope.")}</p>}
      </section>
      <section className="min-w-0 lg:col-span-2" data-leave-snapshot={balances === null ? "denied" : balances.length}>
        <h3 className="mb-2 text-sm font-semibold">{tx("رصيد الإجازات اليوم", "Leave balance today")}</h3>
        {balances === null ? <p className="text-sm text-muted-foreground" data-source-state="DENIED">{tx("لا تملك صلاحية قراءة أرصدة الإجازات.", "You cannot read leave allocations or applications.")}</p>
          : balances.length ? <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{balances.map((b) => <li key={b.leaveType} className="rounded-md border p-2 text-sm"><div className="font-medium" data-no-i18n>{tx(arLabel(b.leaveType), b.leaveType)}</div><div className="tabular-nums" data-no-i18n data-balance={b.leaveType}>{b.balance} / {b.allocated}{b.pending ? <span className="ms-2 text-xs text-muted-foreground">({tx("معلق", "pending")} {b.pending})</span> : null}</div></li>)}</ul>
          : <p className="text-sm text-muted-foreground">{tx("لا يوجد تخصيص إجازة ساري اليوم.", "No leave allocation in effect today.")}</p>}
        <Link to="/digit-hr/s/$section" params={{ section: "03.1" }} className="mt-2 inline-block text-xs underline">{tx("فتح قسم الإجازات", "Open the leave section")}</Link>
      </section>
      <section className="min-w-0 lg:col-span-2" data-profile-org>
        <h3 className="mb-2 text-sm font-semibold">{tx("الهيكل التنظيمي حول الموظف", "Organisation chart around the employee")}</h3>
        <EmployeeOrg emp={emp} />
      </section>
      {hiredVisible && <section className="min-w-0 lg:col-span-2" data-hired-from={hiredVisible}>
        <h3 className="mb-1 text-sm font-semibold">{tx("سجل التوظيف", "Hiring record")}</h3>
        <p className="text-sm">{tx("عُيّن عبر طلب التقديم", "Hired through application")} <Link to="/digit-hr/applicants/$name" params={{ name: hiredVisible }} className="text-primary hover:underline" data-no-i18n>{hiredVisible}</Link></p>
      </section>}
    </div>
  );
}

function HistoryPanel({ emp }: { emp: R }) {
  const { tx } = useTx();
  const internal = fieldReadable("internal_work_history") ? internalHistory(emp) : null;
  const external = fieldReadable("external_work_history") ? (Array.isArray(emp.external_work_history) ? emp.external_work_history as R[] : []) : null;
  const education = fieldReadable("education") ? (Array.isArray(emp.education) ? emp.education as R[] : []) : null;
  const denied = <p className="text-sm text-muted-foreground" data-source-state="DENIED">{tx("لا تملك صلاحية قراءة هذا الجزء من السجل.", "You cannot read this part of the record.")}</p>;
  const none = <p className="text-sm text-muted-foreground">{tx("لا توجد صفوف مسجلة.", "No rows recorded.")}</p>;
  const table = (rows: R[], cols: [string, string, string][], key: string) => <div className="overflow-x-auto"><table className="w-full min-w-[30rem] text-sm" data-history-table={key}><thead><tr className="text-start text-xs text-muted-foreground">{cols.map(([c, ar, en]) => <th key={c} className="px-2 py-1 text-start">{tx(ar, en)}</th>)}</tr></thead><tbody>{rows.map((r, i) => <tr key={i} className="h-10 border-t">{cols.map(([c]) => <td key={c} className="px-2" data-no-i18n>{/department|designation|branch/.test(c) && r[c] ? tx(arLabel(String(r[c])), String(r[c])) : String(r[c] ?? "") || "—"}</td>)}</tr>)}</tbody></table></div>;
  return (
    <div className="space-y-4 p-3" data-history-panel>
      <section><h3 className="mb-1 text-sm font-semibold">{tx("السجل الوظيفي الداخلي", "Internal work history")}</h3>
        <p className="mb-2 text-xs text-muted-foreground">{tx("يُضاف صف تلقائيًا عند اعتماد نقل أو ترقية (نموذج المصدر).", "A row is added when a transfer or promotion is submitted (source behaviour).")}</p>
        {internal === null ? denied : internal.length ? table(internal, [["from_date", "من", "From"], ["to_date", "إلى", "To"], ["department", "القسم", "Department"], ["designation", "المسمى", "Designation"], ["branch", "الفرع", "Branch"]], "internal") : none}</section>
      <section><h3 className="mb-2 text-sm font-semibold">{tx("الخبرات السابقة", "Previous employment")}</h3>
        {external === null ? denied : external.length ? table(external, [["company_name", "الجهة", "Company"], ["designation", "المسمى", "Designation"], ["total_experience", "مدة الخبرة", "Experience"]], "external") : none}
        <p className="mt-1 text-[11px] text-muted-foreground">{tx("الراتب السابق لا يُعرض هنا؛ افتح السجل الأصلي.", "Previous salary is not shown here; open the native record.")}</p></section>
      <section><h3 className="mb-2 text-sm font-semibold">{tx("المؤهلات العلمية", "Education")}</h3>
        {education === null ? denied : education.length ? table(education, [["qualification", "المؤهل", "Qualification"], ["school_univ", "الجهة", "Institution"], ["level", "المستوى", "Level"], ["year_of_passing", "سنة التخرج", "Year"]], "education") : none}</section>
      <Link onClick={() => enterHrNative("01.4")} to="/app/$app/$doctype/$name" search={HR_DOC_SEARCH as never} params={{ app: "erpnext", doctype: "employee", name: emp.name }} className="text-xs underline">{tx("تعديل هذه الجداول في السجل الكامل", "Edit these tables in the full record")}</Link>
    </div>
  );
}

function Employee360() {
  const { name } = Route.useParams();
  useStoreVersion(); useSessionUser(); useScopeMetas(["Employee",'Training Event','DIGIT Contract Amendment','Job Applicant', ...ALL_DT]);
  const { tx } = useTx();
  const search = Route.useSearch(); const navigate = Route.useNavigate();
  const tab = search.tab ?? "timeline"; const query = search.q ?? ""; const group = search.g ?? "";
  const setSearch = (patch: { tab?: string; q?: string; g?: string }, replace = false) => void navigate({ to: ".", replace, search: (prev) => { const next = { ...prev, ...patch }; for (const k of ["tab", "q", "g"] as const) if (!next[k]) delete next[k]; return next; } });
  const setTab = (k: string) => setSearch({ tab: k === "timeline" ? "" : k, q: "", g: "" });
  const emp = scopedGet("Employee", name) as R;
  usePageCompany(emp?.company ? String(emp.company) : undefined);
  const dmyOf = (v: string) => (/^\d{4}-\d{2}-\d{2}/.test(v) ? `${v.slice(8, 10)}/${v.slice(5, 7)}/${v.slice(0, 4)}` : v);
  if (!emp) return <DigitHrLayout title={tx("ملف الموظف", "Employee 360")}><p className="panel p-6 text-muted-foreground">{tx("الموظف غير موجود أو لا تملك صلاحية عرضه.", "Employee not found or you do not have permission.")}</p></DigitHrLayout>;
  const docs = registry().filter((d) => d["employee"] === name);
  const training=scopedList('Training Event').filter(event=>Array.isArray(event['employees']) && (event['employees'] as Record<string,unknown>[]).some(row=>row['employee']===name));
  const cur = GROUPS.find((g) => g.key === tab);
  const count = (g: Group) => g.srcs.reduce((n, x) => n + (canReadType(x.dt) ? rowsFor(x.dt, name).length : 0), 0);
  const field = (l: string, v: unknown, translate = false) => <div><dt className="text-xs text-muted-foreground">{l}</dt><dd className="mt-1 font-medium break-words" data-no-i18n>{v ? (translate ? tx(arLabel(String(v)), String(v)) : String(v)) : "—"}</dd></div>;
  const readable = cur ? cur.srcs.filter((x) => canReadType(x.dt)) : [];
  const hiddenGroups = GROUPS.filter((g) => g.srcs.some((x) => !canReadType(x.dt)));
  const hiddenSources = GROUPS.flatMap((g) => g.srcs.filter((x) => !canReadType(x.dt)).map((x) => x.dt));
  // Manager shown only when readable in the session scope; an unreadable manager is disclosed as such, never by name.
  const manager = emp.reports_to ? scopedGet("Employee", String(emp.reports_to)) as R | undefined : undefined;
  // Lifecycle timeline: every readable linked record (permission-gated groups respect canReadType), newest first, dated by the source's first date column.
  const timeline = GROUPS.flatMap((g) => g.srcs.filter((x) => canReadType(x.dt)).flatMap((x) => {
    const dc = x.cols.find((c) => /date|time/.test(c));
    return rowsFor(x.dt, name).map((r: R) => ({ dt: x.dt, name: String(r.name), group: g.key, module: g.module, gar: g.ar, gen: g.en, date: String((dc && r[dc]) || r.creation || "").slice(0, 10), status: r.status || r.boarding_status || r.contract_status || "" }));
  })).sort((a, b) => b.date.localeCompare(a.date));
  const shown = timeline.filter((e) => (!group || e.group === group) && `${t(e.dt)} ${e.name} ${e.date} ${t(e.status)}`.toLowerCase().includes(query.toLowerCase()));
  // UX-16: daily attendance/check-ins fold into one row per week unless a search is active (search keeps showing matching days).
  const items = groupTimeline(shown as TimelineEvent[], { foldDaily: !query });
  const folded = items.some((i) => i.kind === "week");
  const presentGroups = GROUPS.filter((g) => timeline.some((e) => e.group === g.key));
  // UX-14: people's comments and e-mails on the employee and its records, kept apart from system changes
  const convo = conversationsOf([["Employee", name], ...timeline.map((e) => [e.dt, e.name] as [string, string])]);
  // visual round R3 §3.2: ONE green hero (avatar, name, job, status, ID); the facts sit in a white card that shows only the
  // filled pairs, and one amber chip «ناقص N بيانات — أكملها» opens the employee form for the missing ones
  const display = String(emp.employee_name || emp.name);
  const editTo = { to: "/app/$app/$doctype/$name" as const, search: HR_DOC_SEARCH as never, params: { app: "erpnext", doctype: "employee", name: emp.name } };
  const facts: { key: string; label: string; value: unknown; translate?: boolean; node?: ReactNode }[] = [
    { key: "company", label: tx("الشركة", "Company"), value: emp.company, translate: true },
    { key: "department", label: tx("القسم", "Department"), value: emp.department, translate: true },
    { key: "designation", label: tx("المسمى", "Designation"), value: emp.designation, translate: true },
    { key: "reports_to", label: tx("المدير المباشر", "Reports to"), value: emp.reports_to, node: manager ? <Link to="/digit-hr/employees/$name" params={{ name: manager.name }} search={{ tab: "profile" }} className="text-primary hover:underline" data-no-i18n>{tx(arLabel(String(manager.employee_name || manager.name)), String(manager.employee_name || manager.name))}</Link> : emp.reports_to ? <span className="text-sm font-normal text-muted-foreground">{tx("خارج نطاق صلاحياتك", "Outside your permitted scope")}</span> : undefined },
    { key: "branch", label: tx("الفرع", "Branch"), value: emp.branch },
    { key: "employment_type", label: tx("نوع التوظيف", "Employment type"), value: emp.employment_type, translate: true },
    { key: "date_of_joining", label: tx("تاريخ الالتحاق", "Date of joining"), value: emp.date_of_joining },
    { key: "relieving_date", label: tx("تاريخ المغادرة", "Relieving date"), value: emp.relieving_date },
  ];
  const filled = facts.filter((f) => f.value !== undefined && f.value !== null && f.value !== "");
  const service = (() => { const d = String(emp.date_of_joining || "").slice(0, 10); if (!d) return ""; const end = String(emp.relieving_date || new Date().toISOString()).slice(0, 10);
    const mo = (Number(end.slice(0, 4)) - Number(d.slice(0, 4))) * 12 + Number(end.slice(5, 7)) - Number(d.slice(5, 7)) - (end.slice(8, 10) < d.slice(8, 10) ? 1 : 0); if (mo < 0) return "";
    const y = Math.floor(mo / 12), m = mo % 12; return tx(`${y ? `${y} سنة` : ""}${y && m ? " و" : ""}${m || !y ? `${m} شهر` : ""}`, `${y ? `${y} yr` : ""}${y && m ? " " : ""}${m || !y ? `${m} mo` : ""}`); })();
  const fv = (k: string) => facts.find((f) => f.key === k);
  const factCell = (k: string): ReactNode => { const f = fv(k); if (!f) return null; if (f.node) return f.node; return <span data-no-i18n>{k === "date_of_joining" ? dmyOf(String(f.value)) : f.translate ? tx(arLabel(String(f.value)), String(f.value)) : String(f.value)}</span>; };
  const has = (k: string) => { const v = fv(k)?.value; return v !== undefined && v !== null && v !== ""; };
  const profileFacts: Fact[] = [
    { key: "company", label: tx("الشركة", "Company"), value: factCell("company"), missing: !has("company") },
    { key: "designation", label: tx("المسمى", "Designation"), value: factCell("designation"), missing: !has("designation") },
    { key: "date_of_joining", label: tx("تاريخ الالتحاق", "Date of joining"), value: factCell("date_of_joining"), missing: !has("date_of_joining") },
    { key: "service", label: tx("مدة الخدمة", "Length of service"), value: <span data-no-i18n>{service}</span>, missing: !service },
    { key: "department", label: tx("القسم", "Department"), value: factCell("department"), missing: !has("department") },
    { key: "reports_to", label: tx("المدير", "Manager"), value: <span data-overview-manager={manager ? manager.name : emp.reports_to ? "hidden" : ""}>{factCell("reports_to")}</span>, missing: !has("reports_to") },
    { key: "branch", label: tx("الفرع", "Branch"), value: factCell("branch"), missing: !has("branch") },
    { key: "employment_type", label: tx("نوع العقد", "Contract type"), value: factCell("employment_type"), missing: !has("employment_type") },
    // DEC-015: the account fact says whether one is needed; only a needed, missing account counts as a gap
    ...(() => { const acc = accountState(emp); return [{ key: "user_account", label: tx("حساب المستخدم", "User account"), missing: !acc.linked && acc.needs,
      fill: <span className="inline-flex flex-wrap items-center gap-2" data-account-need="yes"><span>{tx("لا يوجد — يحتاج حسابًا", "None — needs one")}</span><EmployeeAccountButton emp={emp} variant="inline" /></span>,
      value: acc.linked ? <bdi data-no-i18n data-account-linked>{acc.linked}</bdi>
        : <span className="inline-flex flex-wrap items-center gap-2" data-account-need={acc.needs ? "yes" : "no"}><span>{acc.needs ? tx("لا يوجد — يحتاج حسابًا", "None — needs one") : tx("لا يحتاج حسابًا", "Not needed")}</span>
          <span className="text-xs text-muted-foreground">{tx(acc.reason[1], acc.reason[0])}</span><EmployeeAccountButton emp={emp} variant="inline" /></span> }]; })(),
  ];
  // a relieving date is expected only after an exit, so it never counts as missing
  const missing = facts.filter((f) => f.key !== "relieving_date" && !filled.includes(f));
  const initials = display.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("");
  // Enterprise Visual Round 1 §E: three live hero chips, the counters row and the rail donut read the same linked records
  const attendance = canReadType("Attendance") ? rowsFor("Attendance", name) : [];
  const slips = canReadType("Salary Slip") ? rowsFor("Salary Slip", name).filter((r: R) => Number(r.docstatus) !== 2) : [];
  const lastSlip = slips.map((r: R) => String(r.posting_date || r.start_date || "").slice(0, 10)).filter(Boolean).sort().pop();
  const leaveLeft = canReadType("Leave Allocation") ? leaveBalances(rowsFor("Leave Allocation", name), canReadType("Leave Application") ? rowsFor("Leave Application", name) : [], new Date().toISOString().slice(0, 10)).reduce((x, b) => x + b.balance, 0) : null;
  const dmy = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
  const heroFacts: { key: string; node: ReactNode }[] = [
    ...(canReadType("Attendance") ? [{ key: "attendance", node: <><bdi data-no-i18n>{attendance.length}</bdi> {tx("سجل حضور", "attendance records")}</> }] : []),
    ...(lastSlip ? [{ key: "slip", node: <>{tx("آخر قسيمة", "Last slip")} <bdi data-no-i18n>{dmy(lastSlip)}</bdi></> }] : []),
    ...(leaveLeft !== null ? [{ key: "leave", node: <>{tx("رصيد الإجازات", "Leave balance")} <bdi data-no-i18n>{Math.round(leaveLeft * 10) / 10}</bdi> {tx("يوم", "days")}</> }] : []),
  ].slice(0, 3);
  // timeline rows for the Enterprise activity timeline: the attendance and check-in weeks of the same week merge into one row
  const tone = (st: unknown): StatusTone => { const v = String(st ?? ""); return /^(Present|Approved|Active|Completed|Submitted|Paid|IN)$/i.test(v) ? "ok" : /^(Absent|Rejected|Cancelled|Left)$/i.test(v) ? "bad" : /Half|Pending|Open|Draft|Late/i.test(v) ? "warn" : /Leave|Home|OUT/i.test(v) ? "info" : "off"; };
  // rows needing action are tinted (page rule 12): an absence, a half day, a draft or a request still waiting
  const attnOf = (sts: string[]): TlRow["attn"] => sts.some((x) => /^Absent$/i.test(x)) ? "absent" : sts.some((x) => /Half/i.test(x)) ? "half" : sts.some((x) => /^(Draft|Open)$/i.test(x)) ? "draft" : undefined;
  const catOf = (g: string): TlCat => ({ key: g, label: tx(GROUPS.find((x) => x.key === g)?.ar ?? g, GROUPS.find((x) => x.key === g)?.en ?? g), hue: CAT[g]?.hue ?? "emerald", icon: CAT[g]?.icon ?? "doc" });
  const docLink = (dt: string, module: string, nm: string) => { const p = placeDoc(dt, module); return p ? <Link onClick={() => enterHrNative(p.sub)} to="/app/$app/$doctype/$name" search={HR_DOC_SEARCH as never} params={{ app: p.app, doctype: p.slug, name: nm }} className="r1-mono-link" data-no-i18n>{nm}</Link> : <span className="r1-mono-link" data-no-i18n>{nm}</span>; };
  const weeks = new Map<string, TimelineWeek[]>();
  for (const it of items) if (it.kind === "week") { const k = it.weekStart; weeks.set(k, [...(weeks.get(k) ?? []), it]); }
  const seenWeek = new Set<string>();
  const tlRows: TlRow[] = items.flatMap((e): TlRow[] => {
    if (e.kind !== "week") return [{ key: e.dt + e.name, date: e.date, cat: catOf(e.group), title: t(e.dt), link: docLink(e.dt, e.module, e.name), attn: attnOf([String(e.status ?? "")]), status: e.status ? [{ label: tx(arLabel(String(e.status)), String(e.status)), tone: tone(e.status) }] : [] }];
    if (seenWeek.has(e.weekStart)) return [];
    seenWeek.add(e.weekStart);
    const ws = weeks.get(e.weekStart) ?? [e]; const all = ws.flatMap((w) => w.events);
    const att = ws.find((w) => w.dt === "Attendance");
    const dots: StatusTone[] = Array.from({ length: 5 }, (_, i) => { const d = new Date(Date.parse(`${e.weekStart}T00:00:00Z`) + i * 86400000).toISOString().slice(0, 10); const a = (att?.events ?? all).find((x) => x.date.slice(0, 10) === d); return a ? tone(a.status) : "off"; });
    const statuses: Record<string, number> = {}; for (const w of ws) for (const [st, n] of Object.entries(w.statuses)) statuses[st] = (statuses[st] ?? 0) + n;
    return [{ key: `w:${e.weekStart}`, date: e.date, cat: catOf(e.group), attn: attnOf(Object.keys(statuses).filter((st) => statuses[st]! > 0)), title: <>{ws.map((w) => t(w.dt)).join(" · ")} <span className="text-muted-foreground">{tx(`· ${all.length} ${all.length === 1 ? "سجل" : "سجلات"}`, `· ${all.length} ${all.length === 1 ? "record" : "records"}`)}</span></>,
      status: Object.entries(statuses).filter(([st]) => st && st !== "—").map(([st, n]) => ({ label: tx(arLabel(st), st), tone: tone(st), n })),
      attrs: { "data-timeline-week": e.weekStart, "data-week-dt": ws.map((w) => w.dt).join(","), "data-week-count": all.length },
      week: { start: e.weekStart, end: e.weekEnd, dots, count: all.length, detail: <div className="r1-tl-detail">{ws.map((w) => { const p = placeDoc(w.dt, w.module); const dateField = w.dt === "Employee Checkin" ? "time" : "attendance_date";
        const filters = JSON.stringify([["employee", "=", name], [dateField, ">=", w.weekStart], [dateField, "<=", w.dt === "Employee Checkin" ? `${w.weekEnd} 23:59:59` : w.weekEnd]]);
        return <div key={w.dt}><ul className="grid gap-1 sm:grid-cols-2">{w.events.map((d) => <li key={d.name} className="flex items-center gap-2 text-[12.5px]"><span className="tabular-nums text-muted-foreground" data-no-i18n>{dmyOf(d.date.slice(0, 10))}</span>{docLink(d.dt, d.module, d.name)}{d.status ? <span className="r1-chip" data-tone={tone(d.status)} data-no-i18n>{tx(arLabel(String(d.status)), String(d.status))}</span> : null}</li>)}</ul>
          {p && <Link onClick={() => enterHrNative(p.sub)} to="/app/$app/$doctype" params={{ app: p.app, doctype: p.slug }} search={hrSearch({ filters }) as never} className="mt-1 inline-block text-xs underline" data-week-register={w.weekStart}>{tx(`فتح ${t(w.dt)} لهذا الأسبوع في القائمة`, `Open this week's ${w.dt} in the register`)}</Link>}</div>; })}</div> } }];
  });
  // owner round H1: department colour (cover, pill, summary dot, org chart), sensitive facts (level-1 readers only), side summary and saved changes
  const hue = deptHue(String(emp.department ?? "")) as ProfileHue;
  const todayIso = new Date().toISOString().slice(0, 10);
  const sens = sensitiveFacts(emp, todayIso);
  const sum = summaryOf(emp, todayIso);
  const changes = changeLog("Employee", emp.name);
  const money = (v: number) => riyal(fmtNumber(v, 2));
  const hero = (
    <ContextStrip
      cover={hue}
      icon={emp.image ? <img src={String(emp.image)} alt="" className="r3-avatar r1-avatar64" /> : <span className="r3-avatar r1-avatar64" aria-hidden data-no-i18n style={{ background: `var(--${hue})` }}>{initials}</span>}
      eyebrow={<>{emp.designation ? <span className="r1-hero-job" data-no-i18n>{tx(arLabel(String(emp.designation)), String(emp.designation))}</span> : <span className="r1-hero-job">{tx("ملف الموظف", "Employee 360")}</span>}
        {emp.department ? <span className="r1-dept-pill" style={{ ["--hue" as string]: `var(--${hue})` }} data-hero-dept={hue} data-no-i18n>{tx(arLabel(String(emp.department)), String(emp.department))}</span> : null}</>}
      title={<span className="dhr-display" data-no-i18n>{tx(arLabel(display), display)}</span>}
      chips={<><span className="ek-hero-chip r1-id-chip" data-hero-id><span className="r3-code-on-deep" data-code data-no-i18n>{emp.name}</span></span>
        {heroFacts.map((h) => <span key={h.key} className="ek-hero-chip" data-hero-fact={h.key}>{h.node}</span>)}
        <span className="ek-hero-chip r1-status-solid" data-tone={emp.status === "Active" ? "ok" : emp.status === "Left" ? "bad" : "off"} data-hero-status={String(emp.status ?? "")}>{t(String(emp.status || "—"))}</span></>}
      actions={<><EmployeeAccountButton emp={emp} /><Link onClick={() => enterHrNative("01.4")} {...editTo} className="ek-context-btn inline-flex items-center gap-2" data-edit-native><Pencil size={16} />{tx("تعديل السجل الكامل", "Edit full employee record")}</Link></>} />
  );
  return (
    <DigitHrLayout record title={display} crumbs={[{ label: tx("دليل الموظفين", "Employee Directory") }, { label: emp.name }]} header={hero}>
      <div className="mb-4 r1-profile-top" data-employee-overview data-employee-missing={profileFacts.filter((f) => f.missing).length}>
        <div className="r1-profile-main">
          <FactGrid ar={tx("ar", "en") === "ar"} title={tx("البيانات الأساسية", "Key details")} facts={profileFacts}
            addLink={(node, key) => <Link key={key} onClick={() => enterHrNative("01.4")} {...editTo} className="r1-add-link" data-complete-profile={key}>{node}</Link>} />
          <SensitiveFacts ar={tx("ar", "en") === "ar"} allowed={sens.allowed} deniedNote={tx("الراتب والحساب البنكي والتأمينات والتأمين الطبي لا تظهر لدورك.", "Salary, bank account, GOSI and medical insurance are not shown for your role.")}
            facts={sens.facts.map((f) => ({ key: f.key, label: tx(f.label[1], f.label[0]), value: f.value === "" ? <span className="text-muted-foreground">{tx("غير مسجل", "Not recorded")}</span> : <bdi data-no-i18n>{f.unit === "SAR" && typeof f.value === "number" ? money(f.value) : String(f.value)}</bdi>, ...(f.sub ? { sub: <span data-no-i18n>{tx(f.sub[1], f.sub[0])}</span> } : {}) }))} />
        </div>
        <SummaryCard ar={tx("ar", "en") === "ar"} title={tx("ملخص الموظف", "Employee summary")} attrs={{ "data-employee-summary": emp.name }}
          status={{ label: t(String(emp.status || "—")), tone: emp.status === "Active" ? "ok" : emp.status === "Left" ? "bad" : "off" }}
          rows={[
            { key: "location", label: sum.locationKind === "site" ? tx("موقع العمل", "Work site") : tx("الموقع", "Location"), value: sum.location ? <span data-no-i18n>{tx(arLabel(sum.location), sum.location)}</span> : undefined, missing: !sum.location },
            { key: "department", label: tx("القسم", "Department"), hue: sum.department ? hue : undefined, value: sum.department ? <span data-no-i18n>{tx(arLabel(sum.department), sum.department)}</span> : undefined, missing: !sum.department },
            { key: "manager", label: tx("المدير", "Manager"), value: sum.manager ? (sum.manager.visible ? <Link to="/digit-hr/employees/$name" params={{ name: sum.manager.id }} search={{ tab: "profile" }} className="text-primary hover:underline" data-no-i18n>{tx(arLabel(sum.manager.name), sum.manager.name)}</Link> : <span className="text-muted-foreground">{tx("خارج نطاق صلاحياتك", "Outside your permitted scope")}</span>) : undefined, missing: !sum.manager },
            { key: "contract", label: tx("العقد", "Contract"), value: sum.contract ? <span>{sum.contract.type ? <span data-no-i18n>{t(sum.contract.type)}</span> : null}{sum.contract.end ? <span className="block text-xs font-normal text-muted-foreground">{tx("ينتهي", "Ends")} <bdi data-no-i18n>{dmyOf(sum.contract.end)}</bdi></span> : <span className="block text-xs font-normal text-muted-foreground">{tx("غير محدد المدة", "No end date")}</span>}</span> : sum.employmentType ? <span data-no-i18n>{t(sum.employmentType)}</span> : undefined, missing: !sum.contract && !sum.employmentType },
          ]}
          footer={changes[0] ? <button type="button" className="hover:underline" onClick={() => setTab("changes")} data-summary-last-change>{tx("آخر تعديل", "Last change")} <bdi data-no-i18n>{dmyOf(changes[0].at.slice(0, 10))}</bdi> · {(() => { const k = changes[0].changes.length; return tx(`عدّل ${k === 1 ? "حقلًا واحدًا" : k === 2 ? "حقلين" : k <= 10 ? `${k} حقول` : `${k} حقلًا`}`, `${k} field${k === 1 ? "" : "s"} changed`); })()}</button> : undefined} />
      </div>
      <CountRow ar={tx("ar", "en") === "ar"} items={[
        { key: "records", label: tx("السجلات", "Records"), value: timeline.length, icon: "chart", hue: "emerald", Root: (rp) => <button type="button" className={rp.className} onClick={() => setTab("timeline")}>{rp.children}</button> },
        { key: "attendance", label: tx("الحضور", "Attendance"), value: attendance.length, icon: "time", hue: CAT["time"]!.hue, Root: (rp) => <button type="button" className={rp.className} onClick={() => setTab("time")}>{rp.children}</button> },
        { key: "documents", label: tx("الوثائق", "Documents"), value: docs.length, icon: "doc", hue: "amber", Root: (rp) => <button type="button" className={rp.className} onClick={() => setTab("docs")}>{rp.children}</button> },
        { key: "slips", label: tx("القسائم", "Salary slips"), value: slips.length, icon: "money", hue: CAT["pay"]!.hue, Root: (rp) => <button type="button" className={rp.className} onClick={() => setTab("pay")}>{rp.children}</button> },
        { key: "contracts", label: tx("العقود", "Contracts"), value: canReadType("DIGIT Employment Contract") ? rowsFor("DIGIT Employment Contract", name).length : 0, icon: "doc", hue: CAT["contract"]!.hue, Root: (rp) => <button type="button" className={rp.className} onClick={() => setTab("contract")}>{rp.children}</button> },
        { key: "leaves", label: tx("الإجازات", "Leave applications"), value: canReadType("Leave Application") ? rowsFor("Leave Application", name).length : 0, icon: "people", hue: CAT["time"]!.hue, Root: (rp) => <button type="button" className={rp.className} onClick={() => setTab("time")}>{rp.children}</button> },
      ]} />
      <div className="mt-4 min-w-0" data-r1-tl-head>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-semibold"><UserRound size={18} />{tab === "timeline" ? tx("سجل دورة حياة الموظف", "Employee lifecycle history") : tab === "talk" ? tx("المحادثات والردود", "Conversations and replies") : tab === "profile" ? tx("الملف وخط الإبلاغ", "Profile & reporting line") : tab === "history" ? tx("السجل الوظيفي والمؤهلات", "Work history & education") : tab === "changes" ? tx("سجل التعديلات", "Change log") : cur ? tx(cur.ar,cur.en) : tx("وثائق الموظف", "Employee documents")}</h2>
        {tab === "timeline" && <label className="r1-search"><Search size={16} aria-hidden /><input className="dhr-input min-w-0" aria-label={tx("بحث في الأحداث", "Search events")} placeholder={tx("بحث في الأحداث", "Search events")} value={query} onChange={e=>setSearch({ q: e.target.value }, true)} data-timeline-search /></label>}
      </div>
      {tab === "timeline" && <TabRow label={tx("تصفية حسب النوع", "Filter by type")} active={group} onPick={(k) => setSearch({ g: k }, true)}
        tabs={[{ key: "", label: tx("الكل", "All"), count: timeline.length }, ...presentGroups.map((g) => ({ key: g.key, label: tx(g.ar, g.en), count: timeline.filter((e) => e.group === g.key).length, hue: CAT[g.key]?.hue }))]}
        />}
      </div>
      <div className="mb-4 mt-1 grid min-w-0 gap-4 lg:grid-cols-[15rem_minmax(0,1fr)]">
      <RelationRail ar={tx("ar", "en") === "ar"} label={tx("أقسام ملف الموظف", "Employee profile sections")}
        donut={presentGroups.map((g) => ({ key: g.key, label: tx(g.ar, g.en), value: timeline.filter((e) => e.group === g.key).length, color: `var(--${CAT[g.key]?.hue ?? "emerald"})` }))}
        items={[
          { key: "timeline", label: tx("الخط الزمني", "Timeline"), icon: <Clock size={16} />, count: timeline.length, hue: "emerald" as ProfileHue },
          { key: "talk", label: tx("المحادثات", "Conversations"), icon: <MessagesSquare size={16} />, count: convo.length, hue: "blue" as ProfileHue },
          { key: "profile", label: tx("الملف وخط الإبلاغ", "Profile & reporting line"), icon: <UserRound size={16} />, count: null, hue: "violet" as ProfileHue },
          { key: "history", label: tx("السجل الوظيفي والمؤهلات", "Work history & education"), icon: <History size={16} />, count: null, hue: "teal" as ProfileHue },
          { key: "changes", label: tx("سجل التعديلات", "Change log"), icon: <PenLine size={16} />, count: changes.length, hue: "gold" as ProfileHue },
          ...GROUPS.filter((g) => g.srcs.some((x) => canReadType(x.dt))).map((g) => ({ key: g.key, label: tx(g.ar, g.en), count: count(g), hue: CAT[g.key]?.hue ?? ("emerald" as ProfileHue) })),
          { key: "docs", label: tx("الوثائق", "Documents"), icon: <FileText size={16} />, count: docs.length, hue: "amber" as ProfileHue },
        ].map((it) => ({ ...it, active: tab === it.key, onPick: () => setTab(it.key) }))} />
      <div className="min-w-0">
      {tab === "timeline" && convo[0] && <button type="button" onClick={() => setTab("talk")} className="mb-2 flex w-full min-w-0 flex-wrap items-center gap-2 rounded-md border border-primary/30 bg-accent px-3 py-2 text-start text-sm" data-latest-reply>
        <MessagesSquare size={16} className="text-primary" /><b>{tx("آخر رد", "Latest reply")}</b><span className="text-muted-foreground" data-no-i18n>{convo[0].by} · {convo[0].at.slice(0, 16)}</span><span className="min-w-0 flex-1 truncate" data-no-i18n>{convo[0].text}</span></button>}
      <section className="min-w-0 border rounded-md">
        {tab === "talk" ? (convo.length === 0
          ? <p className="p-6 text-muted-foreground">{tx("لا توجد محادثات على هذا الموظف أو سجلاته.", "No conversations on this employee or their records.")}</p>
          : <ol className="divide-y" data-conversations={convo.length}>{convo.map((c, i) => <li key={i} className="px-3 py-2 text-sm">
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><span className="dhr-chip">{c.kind === "email" ? tx("بريد", "E-mail") : tx("تعليق", "Comment")}</span><span data-no-i18n>{c.by}</span><span data-no-i18n>{c.at.slice(0, 16)}</span><span className="ms-auto">{t(c.ref[0])} <span data-no-i18n>{c.ref[1]}</span></span></div>
              <p className="mt-1 break-words" data-no-i18n>{c.text}</p></li>)}</ol>)
        : tab === "timeline" ? (timeline.length === 0
          ? <p className="p-6 text-muted-foreground">{tx("لا توجد أحداث مسجلة لهذا الموظف.", "No recorded events for this employee.")}</p>
          : <ActivityTimeline ar={tx("ar", "en") === "ar"} rows={tlRows} empty={tx("لا توجد أحداث مطابقة.", "No matching events.")} attrs={{ "data-timeline": shown.length, "data-timeline-rows": tlRows.length }} />)
        : tab === "profile" ? <ProfilePanel emp={emp} />
        : tab === "history" ? <HistoryPanel emp={emp} />
        : tab === "changes" ? <div className="p-3" data-employee-changes={changes.length}><p className="mb-2 text-xs text-muted-foreground">{tx("كل حفظ لسجل الموظف: من عدّل ومتى، وكل حقل بقيمته القديمة ← الجديدة.", "Every save of the employee record: who changed it, when, and each field old → new.")}</p><ChangeLog doctype="Employee" name={emp.name} ar={tx("ar", "en") === "ar"} limit={30} label={(_f, fb) => tx(t(fb), fb)} value={(f, v) => f === "reports_to" ? (() => { const m = scopedGet("Employee", v) as R | undefined; return m ? tx(arLabel(String(m.employee_name || m.name)), String(m.employee_name || m.name)) : tx("موظف خارج نطاقك", "An employee outside your scope"); })() : /^(department|designation|branch|employee_name)$/.test(f) ? tx(arLabel(v), v) : /^(employment_type|nationality|gender|status)$/.test(f) ? tx(t(v), v) : undefined} /></div>
        : cur ? (readable.length === 0
          ? <p className="p-6 text-muted-foreground">{tx("لا تملك صلاحية عرض هذا القسم.", "You do not have permission to view this section.")}</p>
          : <>{cur.key === "pay" && <CompensationStatement employee={emp.name} />}
              {readable.map((x) => <SrcBlock key={x.dt} src={x} emp={emp} module={cur.module} />)}
              {cur.key==='contract' && canReadType('DIGIT Contract Amendment') && <><SrcBlock src={{dt:'DIGIT Contract Amendment',cols:['contract','effective_date','amendment_type','new_end_date']}} emp={emp} module="01" /><p className="p-3 text-xs text-muted-foreground">{tx('تعديلات العقد سجلات مراجعة؛ اعتمادها لا يغيّر العقد أو الرواتب تلقائياً.','Contract amendments are review records; submission does not automatically change the contract or payroll.')}</p></>}
              {cur.key==='talent' && <div className="p-3" data-training-events><h3 className="font-semibold">{tx('فعاليات التدريب المرتبطة','Linked training events')}</h3>{training.length ? training.map(event=><p key={event.name}><Link onClick={()=>enterHrNative('02.4')} to="/app/$app/$doctype/$name" search={HR_DOC_SEARCH as never} params={{app:'hrms',doctype:'training_event',name:event.name}} className="underline" data-no-i18n>{event['event_name'] as string || event.name}</Link> · {t(String(event['event_status'] || ''))}</p>) : <p className="text-sm text-muted-foreground">{tx('لا توجد فعاليات تدريب مرتبطة.','No linked training events.')}</p>}</div>}
              {cur.key === "exit" && <p className="p-3 text-xs text-muted-foreground">{tx("حساب مكافأة نهاية الخدمة والقيود المالية يتم على الخادم وفق قواعد معتمدة؛ هنا تُعرض السجلات فقط.", "End-of-service calculation and financial postings run on the server under approved rules; only records are shown here.")}</p>}</>)
        : <div className="overflow-x-auto">
          {docs.length ? <table className="w-full text-sm"><tbody>{docs.map((d) => <tr key={d.name} className="h-12 border-b last:border-0">
            <td className="px-3" data-no-i18n><Link to="/digit-hr/documents" search={{ employee: name }} className="text-primary hover:underline">{d.name}</Link></td><td className="px-3">{t(String(d["document_type"]))}</td><td className="px-3" data-no-i18n>{String(d["expiry_date"])}</td><td className="px-3">{t(String(d["status"]))}</td></tr>)}</tbody></table>
            : <p className="p-6 text-muted-foreground">{tx("لا توجد وثائق.", "No documents.")}</p>}
          <div className="border-t p-3"><Link to="/digit-hr/documents" search={{ employee: name }} className="inline-flex h-10 items-center rounded-md bg-primary px-3 text-sm text-primary-foreground">{tx("إضافة وثيقة", "Add document")}</Link></div>
        </div>}
      </section>
      {tab === "timeline" && folded && <p className="mt-2 text-xs text-muted-foreground" data-timeline-folded>{tx("الحضور اليومي مجمّع أسبوعياً لإبراز أحداث دورة الحياة؛ افتح الأسبوع أو ابحث لعرض الأيام منفردة.", "Daily attendance is grouped by week so lifecycle events stand out; open a week or search to see individual days.")}</p>}
      {tab === "timeline" && hiddenGroups.length > 0 && <p className="mt-2 text-xs text-muted-foreground" data-timeline-hidden={hiddenGroups.map((g) => g.key).join(",")} data-timeline-hidden-sources={hiddenSources.join(",")}>{tx("سجلات غير معروضة لعدم الصلاحية: ", "Records not shown (no permission): ")}{hiddenSources.map((dt) => t(dt)).join(tx("، ", ", "))}</p>}
      </div></div>
    </DigitHrLayout>
  );
}
