/**
 * One HR approval inbox (owner brief 2026-11-15 §4 "shared approvals"): every HR document waiting for a decision the
 * session user may take, oldest first, with SLA age. A decision runs the document's own path — its active workflow
 * transition when one exists, else the native status + submit the hrms controller expects (Leave Application and
 * Shift Request through operations.ts) — after the scoped write/submit check. Nobody decides their own request
 * (no self-approval), and an approver delegated through DIGIT HR Approval Delegation acts for the delegator.
 */
import { adapter, type Doc } from "@/lib/adapter";
import { activeWorkflow, transitionsFor } from "@/lib/workflow";
import { submit, submitErrors } from "@/lib/posting";
import { assertScoped, scopedGet, scopedList } from "../compat/scope";
import { hrApplyWorkflow } from "../compat/workflow";
import { currentUser } from "../compat/session";
import { isHrAdmin, currentEmployeeId } from "../compat/employeeIdentity";
import { decideLeave, decideShiftRequest } from "../operations";
import { daysBetween, d10, s, type Bi } from "./overview/kit";

export type Verdict = "approve" | "reject";
interface Rule {
  /** waiting for a decision */
  pending: (d: Doc) => boolean;
  /** the named approver field (user) — when set only that user (or a delegate / HR admin) decides */
  approverField?: string;
  /** status field + values written before submit (approve, reject); undefined = submit only on approve */
  status?: [field: string, approve: string, reject: string];
  /** reject is not a native outcome: the draft is kept and a comment records the refusal */
  rejectKeeps?: boolean;
  title: (d: Doc) => string;
  date: (d: Doc) => string;
  /** SLA in days before the item counts as late */
  sla: number;
  section: string;
}
const who = (d: Doc) => s(d["employee_name"]) || s(d["applicant_name"]) || s(d["employee"]);
const RULES: Record<string, Rule> = {
  "Leave Application": { pending: (d) => Number(d.docstatus ?? 0) === 0 && s(d["status"]) === "Open", approverField: "leave_approver", title: (d) => `${who(d)} · ${s(d["leave_type"])} ${d10(d["from_date"])}→${d10(d["to_date"])}`, date: (d) => d10(d["posting_date"]) || d10(d["creation"]) || d10(d["from_date"]), sla: 2, section: "03.1" },
  "Shift Request": { pending: (d) => Number(d.docstatus ?? 0) === 0 && (s(d["status"]) || "Draft") === "Draft", approverField: "approver", title: (d) => `${who(d)} · ${s(d["shift_type"])} ${d10(d["from_date"])}`, date: (d) => d10(d["creation"]) || d10(d["from_date"]), sla: 2, section: "03.3" },
  "Attendance Request": { pending: (d) => Number(d.docstatus ?? 0) === 0, rejectKeeps: true, title: (d) => `${who(d)} · ${s(d["reason"])} ${d10(d["from_date"])}`, date: (d) => d10(d["creation"]) || d10(d["from_date"]), sla: 2, section: "03.2" },
  "Expense Claim": { pending: (d) => Number(d.docstatus ?? 0) === 0 && (s(d["approval_status"]) || "Draft") === "Draft", approverField: "expense_approver", status: ["approval_status", "Approved", "Rejected"], title: (d) => `${who(d)} · ${s(d["total_claimed_amount"])}`, date: (d) => d10(d["posting_date"]) || d10(d["creation"]), sla: 3, section: "04.5" },
  "Employee Advance": { pending: (d) => Number(d.docstatus ?? 0) === 0, rejectKeeps: true, title: (d) => `${who(d)} · ${s(d["advance_amount"])}`, date: (d) => d10(d["posting_date"]) || d10(d["creation"]), sla: 3, section: "04.5" },
  "Overtime Slip": { pending: (d) => Number(d.docstatus ?? 0) === 0, rejectKeeps: true, title: (d) => `${who(d)} · ${s(d["total_overtime_duration"])} h`, date: (d) => d10(d["posting_date"]) || d10(d["creation"]), sla: 3, section: "03.3" },
  "Job Requisition": { pending: (d) => s(d["status"]) === "Pending", status: ["status", "Open & Approved", "Rejected"], title: (d) => `${s(d["designation"])} × ${s(d["no_of_positions"]) || "1"}`, date: (d) => d10(d["posting_date"]) || d10(d["creation"]), sla: 5, section: "02.1" },
  "DIGIT Compensation Review": { pending: (d) => Number(d.docstatus ?? 0) === 0, rejectKeeps: true, title: (d) => `${who(d)} · ${s(d["review_reason"])}`, date: (d) => d10(d["review_date"]) || d10(d["creation"]), sla: 5, section: "04.4" },
  "DIGIT Contract Amendment": { pending: (d) => Number(d.docstatus ?? 0) === 0, rejectKeeps: true, title: (d) => `${who(d)} · ${s(d["amendment_type"])}`, date: (d) => d10(d["effective_date"]) || d10(d["creation"]), sla: 5, section: "01.6" },
  "DIGIT Position Budget": { pending: (d) => Number(d.docstatus ?? 0) === 0 && (s(d["budget_status"]) || "Draft") === "Draft", status: ["budget_status", "Approved", "Draft"], rejectKeeps: true, title: (d) => s(d["budget_title"]) || d.name, date: (d) => d10(d["from_date"]) || d10(d["creation"]), sla: 7, section: "01.3" },
  "DIGIT Workforce Plan": { pending: (d) => Number(d.docstatus ?? 0) === 0, rejectKeeps: true, title: (d) => s(d["plan_title"]) || d.name, date: (d) => d10(d["from_date"]) || d10(d["creation"]), sla: 7, section: "06.2" },
  "Leave Encashment": { pending: (d) => Number(d.docstatus ?? 0) === 0, rejectKeeps: true, title: (d) => `${who(d)} · ${s(d["leave_type"])}`, date: (d) => d10(d["encashment_date"]) || d10(d["creation"]), sla: 3, section: "03.1" },
  "Additional Salary": { pending: (d) => Number(d.docstatus ?? 0) === 0, rejectKeeps: true, title: (d) => `${who(d)} · ${s(d["salary_component"])} ${s(d["amount"])}`, date: (d) => d10(d["payroll_date"]) || d10(d["creation"]), sla: 3, section: "04.1" },
  "Travel Request": { pending: (d) => Number(d.docstatus ?? 0) === 0, rejectKeeps: true, title: (d) => `${who(d)} · ${s(d["purpose_of_travel"])}`, date: (d) => d10(d["creation"]), sla: 3, section: "04.5" },
  "DIGIT Employee Loan": { pending: (d) => Number(d.docstatus ?? 0) === 0 && (s(d["loan_status"]) || "Requested") === "Requested", status: ["loan_status", "Approved", "Rejected"], title: (d) => `${who(d)} · ${s(d["loan_amount"])}`, date: (d) => d10(d["application_date"]) || d10(d["creation"]), sla: 5, section: "04.5" },
};
export const APPROVAL_DOCTYPES = Object.keys(RULES);
export const approvalRule = (dt: string) => RULES[dt];

/** Users the session user currently acts for through an active approval delegation (own user first). */
export function actingFor(user = currentUser(), on = new Date().toISOString().slice(0, 10)): Set<string> {
  const out = new Set([user]);
  for (const d of adapter.list("DIGIT HR Approval Delegation")) if (d["delegate"] === user && d["delegation_status"] === "Active" && (!d10(d["from_date"]) || d10(d["from_date"]) <= on) && (!d10(d["to_date"]) || d10(d["to_date"]) >= on)) out.add(s(d["delegator"]));
  return out;
}
export interface ApprovalItem { doctype: string; name: string; title: string; company: string; employee: string; section: string; since: string; age: number; late: boolean; via?: string | undefined }
/** Whether `user` raised the request (self-approval is never allowed). */
export function isOwnRequest(d: Doc, user = currentUser()): boolean {
  const me = currentEmployeeId(user);
  return (!!me && s(d["employee"]) === me) || (s(d["owner"]) === user && !!s(d["employee"]) && s(d["employee"]) === me);
}
/** Whether `user` may decide this pending document now (scope + named approver / delegation + no self-approval). */
export function mayDecide(dt: string, d: Doc, user = currentUser(), on?: string): { ok: boolean; via?: string | undefined; reason?: Bi | undefined } {
  const r = RULES[dt]; if (!r || !r.pending(d) || Number(d["digit_rejected"] ?? 0)) return { ok: false, reason: ["Not waiting for a decision.", "لا ينتظر قرارًا."] };
  try { assertScoped(dt, "write", d); } catch { return { ok: false, reason: ["You may not change this document.", "لا يحق لك تعديل هذا المستند."] }; }
  if (isOwnRequest(d, user)) return { ok: false, reason: ["You cannot decide your own request.", "لا يمكنك البت في طلبك أنت."] };
  if (r.approverField && s(d[r.approverField])) {
    const named = s(d[r.approverField]);
    if (named === user) return { ok: true };
    if (actingFor(user, on).has(named)) return { ok: true, via: named };
    if (isHrAdmin(user)) return { ok: true };
    return { ok: false, reason: [`Waiting for ${named}.`, `بانتظار ${named}.`] };
  }
  return { ok: true };
}
/** The inbox: pending HR documents the user may decide, oldest first. */
export function approvalInbox(opts: { company?: string | undefined; sections?: string[] | undefined; doctypes?: string[] | undefined; user?: string; on?: string } = {}): ApprovalItem[] {
  const user = opts.user ?? currentUser(); const on = opts.on ?? new Date().toISOString().slice(0, 10);
  const out: ApprovalItem[] = [];
  for (const [dt, r] of Object.entries(RULES)) {
    if (opts.doctypes && !opts.doctypes.includes(dt)) continue;
    if (opts.sections && !opts.sections.includes(r.section)) continue;
    let list: Doc[]; try { list = scopedList(dt); } catch { continue; }
    for (const d of list) {
      if (!r.pending(d) || Number(d["digit_rejected"] ?? 0)) continue;
      if (opts.company && s(d["company"]) && s(d["company"]) !== opts.company) continue;
      const m = mayDecide(dt, d, user, on); if (!m.ok) continue;
      const since = r.date(d) || on; const age = Math.max(0, daysBetween(since, on));
      out.push({ doctype: dt, name: d.name, title: r.title(d), company: s(d["company"]), employee: s(d["employee"]), section: r.section, since, age, late: age > r.sla, via: m.via });
    }
  }
  return out.sort((a, b) => b.age - a.age || a.name.localeCompare(b.name));
}
/** SLA of a document type in days (late after). */
export const slaDays = (dt: string) => RULES[dt]?.sla ?? 3;

/** Run a decision through the document's own path; returns errors (empty = done). */
export function decide(dt: string, name: string, verdict: Verdict, note = "", user = currentUser()): string[] {
  const d = scopedGet(dt, name); if (!d) return ["Record not found or not permitted"];
  const m = mayDecide(dt, d, user); if (!m.ok) return [m.reason?.[0] ?? "Not permitted"];
  try {
    if (dt === "Leave Application") { decideLeave(name, verdict === "approve" ? "Approved" : "Rejected"); return comment(dt, name, verdict, note, user, m.via); }
    if (dt === "Shift Request") { decideShiftRequest(name, verdict === "approve" ? "Approved" : "Rejected"); return comment(dt, name, verdict, note, user, m.via); }
  } catch (e) { return [e instanceof Error ? e.message : String(e)]; }
  const r = RULES[dt]!;
  const w = activeWorkflow(dt);
  if (w) {
    const want = verdict === "approve" ? /approv/i : /reject/i;
    const t = transitionsFor(w, d, user).find((x) => want.test(x.next_state) || want.test(x.action));
    if (!t) return ["No eligible workflow step for this decision"];
    const errs = hrApplyWorkflow(dt, name, t.action, user); if (errs.length) return errs;
    return comment(dt, name, verdict, note, user, m.via);
  }
  if (verdict === "reject" && (r.rejectKeeps || !r.status)) return comment(dt, name, verdict, note, user, m.via, true);
  const patch = r.status ? { [r.status[0]]: verdict === "approve" ? r.status[1] : r.status[2] } : {};
  const meta = adapter.get(dt, name);
  const before = meta ? { ...meta } : undefined;
  if (Object.keys(patch).length) adapter.update(dt, name, patch);
  const submittable = verdict === "approve" && !(dt === "Job Requisition");
  if (submittable) {
    try { assertScoped(dt, "submit", { ...d, ...patch }); } catch { if (before && r.status) adapter.update(dt, name, { [r.status[0]]: before[r.status[0]] }); return ["Not permitted to submit"]; }
    const errs = submitErrors(dt, { ...d, ...patch });
    if (errs.length) { if (before && r.status) adapter.update(dt, name, { [r.status[0]]: before[r.status[0]] }); return errs; }
    try { const e2 = submit(dt, name); if (e2.length) { if (before && r.status) adapter.update(dt, name, { [r.status[0]]: before[r.status[0]] }); return e2; } }
    catch (e) { if (before && r.status) adapter.update(dt, name, { [r.status[0]]: before[r.status[0]] }); return [e instanceof Error ? e.message : String(e)]; }
  }
  return comment(dt, name, verdict, note, user, m.via);
}
/** The decider's language at decision time (the comment is written as the user reads it, as frappe writes `_()` text). */
const decisionLang = (): "ar" | "en" => { try { return typeof localStorage !== "undefined" && localStorage.getItem("digit-virtual-core:lang") === "en" ? "en" : "ar"; } catch { return "ar"; } };
/** Arabic wording of the decision errors (owner H1-08: a rejected leave never answers in English on an Arabic screen). */
const ERR_AR: [RegExp, string | ((m: RegExpExecArray) => string)][] = [
  [/^Record not found or not permitted$/, "السجل غير موجود أو لا تملك صلاحية عليه."],
  [/^Not permitted$/, "لا تملك صلاحية هذا القرار."],
  [/^Not permitted to submit$/, "لا تملك صلاحية اعتماد هذا المستند."],
  [/^Not waiting for a decision\.?$/, "لا ينتظر قرارًا."],
  [/^Leave request is no longer open$/, "طلب الإجازة لم يعد مفتوحًا — حُسم من قبل."],
  [/^Not permitted to approve this leave request$/, "لست معتمد هذا الطلب؛ يقرره معتمد الإجازة المسجل للموظف."],
  [/^No eligible approval workflow transition$|^No eligible workflow step for this decision$/, "لا توجد خطوة اعتماد متاحة لك على هذا المستند."],
  [/^Mandatory fields? (?:required|missing)[^:]*: (.+)$/i, (m) => `حقول إلزامية ناقصة: ${m[1]}`],
  [/^Value missing for: (.+)$/i, (m) => `قيمة ناقصة: ${m[1]}`],
  [/insufficient leave balance|leave balance/i, "رصيد الإجازة غير كافٍ لهذا الطلب."],
];
/** A decision error in the reader's language (unknown messages stay as written). */
export function decisionErrorText(msg: string, ar: boolean): string {
  if (!ar) return msg;
  for (const [re, to] of ERR_AR) { const m = re.exec(msg); if (m) return typeof to === "string" ? to : to(m); }
  return msg;
}
function comment(dt: string, name: string, verdict: Verdict, note: string, user: string, via?: string, refused = false): string[] {
  const ar = decisionLang() === "ar";
  const text = ar
    ? `${verdict === "approve" ? "تم الاعتماد" : "تم الرفض"}${via ? ` نيابة عن ${via}` : ""}${note ? ` — ${note}` : ""}${refused ? " (أُبقي مسودة للتصحيح)" : ""}`
    : `${verdict === "approve" ? "Approved" : "Rejected"}${via ? ` on behalf of ${via}` : ""}${note ? ` — ${note}` : ""}${refused ? " (kept as draft for correction)" : ""}`;
  adapter.insertDoc("Comment", { comment_type: "Comment", reference_doctype: dt, reference_name: name, content: text, owner: user, comment_email: user });
  if (refused) adapter.update(dt, name, { digit_rejected: 1 });
  return [];
}
