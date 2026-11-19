/**
 * Role home (owner brief 2026-11-15 §1, skill: top-10 role tasks within three clicks).
 * Mission Control shows the signed-in role's ten most frequent tasks as one-click links and the
 * shared approval inbox (every HR document waiting on this user or on someone who delegated to them),
 * where Approve / Reject run the document's own step through approvals.decide.
 */
import { useMemo } from "react";
import { toast } from "sonner";
import { CheckCircle2, ChevronLeft, ChevronRight } from "lucide-react";
import { adapter, useStoreVersion } from "@/lib/adapter";
import { useSessionUser, userRoles } from "@/lib/session";
import { DxPanel } from "@/components/digit/Experience";
import { approvalInbox, decide, decisionErrorText, mayDecide, type ApprovalItem } from "@/plugins/digit_hr/product/approvals";
import { currentEmployeeId, isHrAdmin, teamOf } from "@/plugins/digit_hr/compat/employeeIdentity";
import type { Bi, Drill } from "@/plugins/digit_hr/product/overview/kit";
import { useHrDrill } from "./OverviewFrame";

export type HrRole = "hr" | "officer" | "manager" | "employee";
type Task = { id: string; label: Bi; drill: Drill };

const sec = (id: string, tab?: "documents" | "reports"): Drill => ({ kind: "page", to: `/digit-hr/s/${id}`, ...(tab ? { search: { tab } } : {}) });
const doc = (doctype: string): Drill => ({ kind: "doc", doctype, name: "new" });
const rep = (report: string): Drill => ({ kind: "report", report });
const page = (to: string): Drill => ({ kind: "page", to });

/** The ten tasks each HR role opens most, in order; each is one click from Mission Control. */
export const ROLE_TASKS: Record<HrRole, Task[]> = {
  hr: [
    { id: "decisions", label: ["Decisions waiting", "القرارات المنتظرة"], drill: sec("05.2") },
    { id: "add-employee", label: ["Add an employee", "إضافة موظف"], drill: doc("Employee") },
    { id: "expiring", label: ["Contracts and documents expiring", "العقود والوثائق المنتهية قريبًا"], drill: sec("01.6") },
    { id: "hiring", label: ["Hiring pipeline", "مسار التوظيف"], drill: sec("02.1") },
    { id: "payroll", label: ["Run the monthly payroll", "تشغيل مسير الشهر"], drill: sec("04.1", "documents") },
    { id: "saudization", label: ["Saudization and GOSI", "التوطين والتأمينات"], drill: sec("04.3") },
    { id: "cases", label: ["Service cases and SLA", "طلبات الخدمة ومستوى الخدمة"], drill: sec("05.3") },
    { id: "headcount", label: ["Headcount as of a date", "عدد الموظفين في تاريخ"], drill: rep("HR Headcount as of Date") },
    { id: "policies", label: ["HR policy settings", "إعدادات سياسات الموارد البشرية"], drill: sec("07.1", "documents") },
    { id: "setup", label: ["Setup and data checks", "فحوص الإعداد والبيانات"], drill: sec("07.1") },
  ],
  officer: [
    { id: "payroll", label: ["Run the monthly payroll", "تشغيل مسير الشهر"], drill: sec("04.1", "documents") },
    { id: "preflight", label: ["Payroll preflight blockers", "موانع ما قبل المسير"], drill: rep("HR Payroll Preflight Blockers") },
    { id: "variances", label: ["Payroll variances", "فروقات الرواتب"], drill: rep("HR Payroll Variances") },
    { id: "wps", label: ["Salary disbursement and WPS", "صرف الرواتب وحماية الأجور"], drill: sec("04.2") },
    { id: "gosi", label: ["GOSI and Saudization", "التأمينات والتوطين"], drill: sec("04.3") },
    { id: "bank", label: ["Bank change requests", "طلبات تغيير البنك"], drill: { kind: "list", doctype: "DIGIT Bank Change Request" } },
    { id: "claims", label: ["Advances, claims and loans", "السلف والمطالبات والقروض"], drill: sec("04.5") },
    { id: "attendance", label: ["Attendance exceptions", "استثناءات الحضور"], drill: sec("03.2") },
    { id: "overtime", label: ["Overtime to approve", "العمل الإضافي للاعتماد"], drill: { kind: "list", doctype: "Overtime Slip", filters: [["docstatus", "=", "0"]] } },
    { id: "register", label: ["Payroll register", "سجل الرواتب"], drill: rep("HR Payroll Register") },
  ],
  manager: [
    { id: "approvals", label: ["Team approvals", "اعتمادات الفريق"], drill: sec("05.2") },
    { id: "attendance", label: ["Team attendance today", "حضور الفريق اليوم"], drill: sec("03.2") },
    { id: "leave", label: ["Team leave and overlaps", "إجازات الفريق والتداخل"], drill: sec("03.1") },
    { id: "overtime", label: ["Overtime to approve", "العمل الإضافي للاعتماد"], drill: { kind: "list", doctype: "Overtime Slip", filters: [["docstatus", "=", "0"]] } },
    { id: "appraisals", label: ["Appraisals to complete", "التقييمات المطلوبة"], drill: sec("02.3") },
    { id: "delegate", label: ["Delegate my approvals", "تفويض اعتماداتي"], drill: doc("DIGIT Approval Delegation") },
    { id: "my-leave", label: ["Apply for leave", "طلب إجازة"], drill: page("/hr/leave-applications/new") },
    { id: "payslips", label: ["My payslips", "قسائم راتبي"], drill: page("/hr/dashboard/salary-slips") },
    { id: "case", label: ["Raise an HR request", "رفع طلب للموارد البشرية"], drill: doc("DIGIT HR Service Case") },
    { id: "team-cases", label: ["Team service cases", "طلبات خدمة الفريق"], drill: sec("05.3") },
  ],
  employee: [
    { id: "leave", label: ["Apply for leave", "طلب إجازة"], drill: page("/hr/leave-applications/new") },
    { id: "checkin", label: ["Check in or out", "تسجيل الدخول أو الخروج"], drill: page("/hr/employee-checkins") },
    { id: "payslips", label: ["My payslips", "قسائم راتبي"], drill: page("/hr/dashboard/salary-slips") },
    { id: "letter", label: ["Request a letter", "طلب خطاب"], drill: doc("DIGIT HR Service Case") },
    { id: "expense", label: ["Claim an expense", "مطالبة بمصروف"], drill: page("/hr/expense-claims/new") },
    { id: "advance", label: ["Request an advance", "طلب سلفة"], drill: page("/hr/employee-advances/new") },
    { id: "correction", label: ["Correct my attendance", "تصحيح حضوري"], drill: page("/hr/attendance-requests/new") },
    { id: "bank", label: ["Change my bank account", "تغيير حسابي البنكي"], drill: doc("DIGIT Bank Change Request") },
    { id: "requests", label: ["My requests", "طلباتي"], drill: sec("05.1") },
    { id: "profile", label: ["My profile", "ملفي"], drill: page("/hr/profile") },
  ],
};

export function hrRoleOf(user: string): HrRole {
  const roles = userRoles(user);
  if (user === "Administrator" || roles.includes("HR Manager") || roles.includes("System Manager")) return "hr";
  if (roles.includes("HR User") || isHrAdmin(user)) return "officer";
  if (roles.includes("Leave Approver") || roles.includes("Expense Approver") || (() => { const me = currentEmployeeId(user); return !!me && teamOf(me).size > 0; })()) return "manager";
  return "employee";
}

const ROLE_LABEL: Record<HrRole, Bi> = { hr: ["HR manager", "مدير الموارد البشرية"], officer: ["HR and payroll officer", "أخصائي الموارد البشرية والرواتب"], manager: ["Line manager", "المدير المباشر"], employee: ["Employee", "الموظف"] };
const pick = (ar: boolean, b: Bi) => (ar ? b[1] : b[0]);

export function RoleHome({ ar, company }: { ar: boolean; company?: string | undefined }) {
  const user = useSessionUser(); const ver = useStoreVersion(); const link = useHrDrill();
  const role = hrRoleOf(user);
  const on = new Date().toISOString().slice(0, 10);
  const inbox = useMemo<ApprovalItem[]>(() => { try { return approvalInbox({ company, user, on }); } catch { return []; } }, [company, user, on, ver]); // eslint-disable-line react-hooks/exhaustive-deps
  const shown = inbox.slice(0, 8); const late = inbox.filter((i) => i.late).length;
  const Arrow = ar ? ChevronLeft : ChevronRight;
  const act = (i: ApprovalItem, verdict: "approve" | "reject") => {
    let note = ""; if (verdict === "reject") { const r = window.prompt(pick(ar, ["Reason for rejecting", "سبب الرفض"])); if (r === null) return; note = r; }
    const errs = decide(i.doctype, i.name, verdict, note, user);
    if (errs.length) toast.error(errs.map((e) => decisionErrorText(e, ar)).join("\n")); else toast.success(pick(ar, verdict === "approve" ? ["Approved", "تم الاعتماد"] : ["Rejected", "تم الرفض"]));
  };
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]" data-hr-role-home={role}>
      <DxPanel title={pick(ar, ["My tasks", "مهامي"])} subtitle={pick(ar, [`${ROLE_LABEL[role][0]} — the ten most used tasks, one click each`, `${ROLE_LABEL[role][1]} — أكثر عشر مهام استخدامًا، بنقرة واحدة`])} flush attrs={{ "data-hr-role-tasks": role }}>
        <ol className="grid divide-y divide-border text-sm sm:grid-cols-2 sm:divide-y-0">
          {ROLE_TASKS[role].map((t, i) => (
            <li key={t.id} className="sm:border-b sm:border-border">{link(t.drill, <span className="flex min-h-11 items-center gap-2.5 px-3 py-2"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-accent text-[11px] font-semibold text-accent-foreground" data-no-i18n>{i + 1}</span><span className="min-w-0 flex-1 font-medium">{pick(ar, t.label)}</span><Arrow className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden /></span>, { className: "block hover:bg-muted/60", "data-role-task": t.id })}</li>
          ))}
        </ol>
      </DxPanel>
      <DxPanel title={<span>{pick(ar, ["Approval inbox", "صندوق الاعتمادات"])} <span className="text-xs font-normal text-muted-foreground" data-no-i18n>({inbox.length}{late ? ` · ${late} ${pick(ar, ["late", "متأخرة"])}` : ""})</span></span>}
        subtitle={pick(ar, ["Every HR document waiting on you or on someone who delegated to you; each button runs the document's own step", "كل مستند موارد بشرية ينتظرك أو ينتظر من فوّضك؛ كل زر ينفذ خطوة المستند نفسه"])} flush attrs={{ "data-hr-inbox": String(inbox.length) }}>
        {shown.length ? <ul className="max-h-[440px] divide-y divide-border overflow-y-auto text-sm">{shown.map((i) => { const d = adapter.get(i.doctype, i.name); const can = d ? mayDecide(i.doctype, d, user) : { ok: false };
          return (
            <li key={i.doctype + i.name} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2" data-inbox-item={i.name}>
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{link({ kind: "doc", doctype: i.doctype, name: i.name }, <span data-no-i18n>{i.title}</span>, { className: "text-primary hover:underline" })}</span>
                <span className="block text-xs text-muted-foreground"><span>{i.doctype}</span> · <span data-no-i18n>{pick(ar, [`${i.age} days`, `${i.age} يومًا`])}</span>{i.late ? <span className="ms-1 font-semibold text-destructive">· {pick(ar, ["past SLA", "تجاوز مستوى الخدمة"])}</span> : null}{i.via ? <span data-no-i18n> · {pick(ar, [`for ${i.via}`, `نيابة عن ${i.via}`])}</span> : null}</span>
              </span>
              {can.ok ? <span className="flex gap-1.5">
                <button type="button" className="btn-primary h-8 px-3 text-xs" onClick={() => act(i, "approve")} data-decide="approve">{pick(ar, ["Approve", "اعتماد"])}</button>
                <button type="button" className="btn-secondary h-8 px-3 text-xs" onClick={() => act(i, "reject")} data-decide="reject">{pick(ar, ["Reject", "رفض"])}</button>
              </span> : <span className="chip bg-muted text-muted-foreground">{pick(ar, ["View", "عرض"])}</span>}
            </li>); })}</ul>
          : <p className="flex items-center gap-2 px-3 py-4 text-sm text-muted-foreground"><CheckCircle2 className="h-4 w-4 text-primary" aria-hidden />{pick(ar, ["Nothing is waiting for your decision.", "لا شيء ينتظر قرارك."])}</p>}
        {inbox.length > shown.length && <div className="border-t border-border px-3 py-2 text-sm">{link(sec("05.2"), pick(ar, [`Open all ${inbox.length} in Manager Self Service`, `فتح الكل (${inbox.length}) في خدمة المدير الذاتية`]), { className: "text-primary hover:underline" })}</div>}
      </DxPanel>
    </div>
  );
}
