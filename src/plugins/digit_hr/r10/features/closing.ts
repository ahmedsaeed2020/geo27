/**
 * Round-2 closing items:
 * - HR-B3 / GAP-08: an employee edits their own service case while it is Open and unassigned (setting
 *   ess_edit_open_case, default on). HR transitions stay with HR; the Core workflow engine is not changed.
 * - GAP-10: Employee Advance pay-out. As the native "Make > Payment" does, a Bank Entry Journal Entry is posted
 *   against the advance account and the employee, and the advance's paid amount and status follow it.
 * - GAP-20: the HR scheduler jobs run on demand: earned leave, auto attendance from check-ins, and document expiry with
 *   reminders. Each run is idempotent, so running it twice changes nothing.
 * - UX-11: save conflict, when the stored record changed after the form opened.
 * - UX-14: human conversation (comments and e-mails) kept apart from system changes.
 * - UX-18: "What's new". Each round-2 tool is shown once per user until it is opened.
 * - DASH-07: unmapped routes, meaning app documents and tools with no reachable HR destination.
 */
import { adapter, type Doc } from "@/lib/adapter";
import { currentUser, userRoles } from "@/lib/session";
import { submit as postSubmit } from "@/lib/posting";
import { scopedGet, scopedList } from "../../compat/scope";
import { policyValue } from "../../product/settings";
import { HR_SECTION_SLUGS } from "../../product/structure";
import { placeDoc } from "../../v6/nav";
import { R10_BUILT } from "../doctypes";
import { createDoc, updateDoc, guarded, ok, fail, s, n, d10, todayISO, nowISO, addDays, daysBetween, type ActionResult } from "../write";
import { leaveAccrual, type Frequency } from "./guards";
import { DSC } from "./service";
import { shiftHours } from "./time";
import { assignmentOf } from "../../product/payroll";

const list = (dt: string, user = currentUser()): Doc[] => { try { return scopedList(dt, user); } catch { return []; } };
const employeeOfUser = (user: string): Doc | undefined => adapter.list("Employee").find((e) => s(e["user_id"]) === user);
const isHrAdmin = (user: string) => user === "Administrator" || userRoles(user).some((r) => r === "HR Manager" || r === "System Manager" || r === "CHRO" || r === "HR Admin");

/* ------------------------------------------------------------------ HR-B3 / GAP-08 own open case */
export const OWN_CASE_FIELDS = ["subject", "description", "category", "severity"] as const;
/** The employee who raised the case (owner or the linked employee) may edit it while it is Open and nobody is assigned. */
export function ownCaseEditable(c: Doc | undefined, user = currentUser(), on = todayISO()): boolean {
  if (!c || Number(c["docstatus"] ?? 0) !== 0) return false;
  if ((policyValue("ess_edit_open_case", on, s(c["company"]) || undefined) ?? 1) !== 1) return false;
  if (s(c["case_status"]) !== "Open" || s(c["assigned_to"])) return false;
  const emp = employeeOfUser(user);
  return s(c["owner"]) === user || (!!emp && s(c["employee"]) === emp.name);
}
export function editOwnOpenCase(name: string, patch: Partial<Record<(typeof OWN_CASE_FIELDS)[number], string>>, user = currentUser()): ActionResult {
  return guarded(() => {
    const c = adapter.get(DSC, name);
    if (!ownCaseEditable(c, user)) return fail("Only the employee who raised the case can change it, and only while it is open and unassigned.", "لا يعدّل الحالة إلا الموظف الذي رفعها، وما دامت مفتوحة وغير مسندة.");
    const clean = Object.fromEntries(Object.entries(patch).filter(([k, v]) => (OWN_CASE_FIELDS as readonly string[]).includes(k) && v !== undefined));
    if (!Object.keys(clean).length) return fail("Nothing to change.", "لا يوجد ما يُعدَّل.");
    // the state check above is the permission; the native role row stays read-only for the employee
    updateDoc(DSC, name, clean, user, { skipPerm: true });
    return ok(`Case ${name} updated.`, `حُدّثت الحالة ${name}.`);
  });
}

/* ------------------------------------------------------------------ GAP-10 Employee Advance pay-out */
const abbr = (company: string) => s(adapter.get("Company", company)?.["abbr"]);
export function advanceAccounts(adv: Doc): { advance: string; bank: string } {
  const co = adapter.get("Company", s(adv["company"])); const a = abbr(s(adv["company"]));
  return { advance: s(adv["advance_account"]) || s(co?.["default_employee_advance_account"]) || `Employee Advances - ${a}`, bank: s(co?.["default_bank_account"]) || s(co?.["default_cash_account"]) || `Cash - ${a}` };
}
/** Status as the native controller sets it from the paid, claimed and returned amounts. */
export function advanceStatus(adv: Doc): string {
  const amt = n(adv["advance_amount"]), paid = n(adv["paid_amount"]), claimed = n(adv["claimed_amount"]), ret = n(adv["return_amount"]);
  if (Number(adv["docstatus"]) !== 1) return Number(adv["docstatus"]) === 2 ? "Cancelled" : "Draft";
  if (paid <= 0) return "Unpaid";
  if (ret > 0 && ret + claimed >= paid) return "Returned";
  if (claimed > 0 && claimed >= paid) return "Claimed";
  if (claimed > 0) return "Partly Claimed and Returned";
  return paid >= amt ? "Paid" : "Partially Paid";
}
export function payAdvance(name: string, user = currentUser(), on = todayISO()): ActionResult & { journal?: string } {
  return guarded(() => {
    const adv = scopedGet("Employee Advance", name, user); if (!adv) return fail("Advance not found or not in your scope.", "السلفة غير موجودة أو خارج صلاحيتك.");
    if (Number(adv["docstatus"]) !== 1) return fail("Approve (submit) the advance before paying it.", "اعتمد السلفة قبل صرفها.");
    const due = Math.round((n(adv["advance_amount"]) - n(adv["paid_amount"])) * 100) / 100;
    if (due <= 0) return fail("The advance is already paid in full.", "السلفة مصروفة بالكامل.");
    const acc = advanceAccounts(adv);
    const je = createDoc("Journal Entry", { voucher_type: "Bank Entry", company: adv["company"], posting_date: on, title: `Advance ${name}`, user_remark: `Payment of employee advance ${name}`,
      accounts: [{ account: acc.advance, party_type: "Employee", party: adv["employee"], debit_in_account_currency: due, debit: due, credit: 0, credit_in_account_currency: 0, reference_type: "Employee Advance", reference_name: name },
        { account: acc.bank, debit: 0, debit_in_account_currency: 0, credit: due, credit_in_account_currency: due }], total_debit: due, total_credit: due }, user);
    const errors = postSubmit("Journal Entry", je.name);
    if (errors.length) { adapter.remove("Journal Entry", je.name); return fail("The payment could not be posted.", "تعذر ترحيل الصرف.", errors); }
    const paid = Math.round((n(adv["paid_amount"]) + due) * 100) / 100;
    adapter.update("Employee Advance", name, { paid_amount: paid, base_paid_amount: paid, pending_amount: Math.max(0, paid - n(adv["claimed_amount"]) - n(adv["return_amount"])) });
    adapter.update("Employee Advance", name, { status: advanceStatus(adapter.get("Employee Advance", name)!) });
    return { ...ok(`Advance ${name} paid (${due}). Journal ${je.name}.`, `صُرفت السلفة ${name} (${due}). القيد ${je.name}.`), journal: je.name };
  });
}

/* ------------------------------------------------------------------ GAP-18 employee loans (no Frappe Lending) */
export const LOAN = "DIGIT Employee Loan";
const r2 = (x: number) => Math.round(x * 100) / 100;
const addMonthsISO = (iso: string, k: number) => { const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`); const day = d.getUTCDate(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + k); const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate(); d.setUTCDate(Math.min(day, last)); return d.toISOString().slice(0, 10); };
/** Equal monthly installments from the start date; the last one takes the rounding difference. */
export function loanSchedule(amount: number, installments: number, start: string): { due_date: string; amount: number; repayment_status: "Scheduled" }[] {
  const k = Math.max(1, Math.floor(installments)); const each = r2(amount / k);
  return Array.from({ length: k }, (_, i) => ({ due_date: addMonthsISO(start, i), amount: i === k - 1 ? r2(amount - each * (k - 1)) : each, repayment_status: "Scheduled" as const }));
}
/** The installment against the cap (loan_max_deduction_pct of the monthly base, Labour Law art. 92). */
export function loanCapCheck(loan: Doc, on = todayISO()): { installment: number; base: number; cap_pct: number; ok: boolean } {
  const installment = n(loan["monthly_installment"]) || r2(n(loan["loan_amount"]) / Math.max(1, n(loan["installments"])));
  const base = n(assignmentOf(s(loan["employee"]), on)?.["base"]); const cap_pct = policyValue("loan_max_deduction_pct", on, s(loan["company"]) || undefined) ?? 10;
  return { installment, base, cap_pct, ok: !base || installment <= r2((base * cap_pct) / 100) };
}
export function disburseLoan(name: string, user = currentUser(), on = todayISO()): ActionResult & { journal?: string } {
  return guarded(() => {
    const ln = scopedGet(LOAN, name, user); if (!ln) return fail("Loan not found or not in your scope.", "القرض غير موجود أو خارج صلاحيتك.");
    if (s(ln["approval_status"]) !== "Approved") return fail("Approve the loan before paying it out.", "اعتمد القرض قبل صرفه.");
    if (s(ln["disbursement_journal"])) return fail("The loan is already paid out.", "القرض مصروف من قبل.");
    const cap = loanCapCheck(ln, on);
    if (!cap.ok) return fail(`The installment ${cap.installment} is above ${cap.cap_pct}% of the monthly wage (${cap.base}).`, `القسط ${cap.installment} أعلى من ${cap.cap_pct}% من الأجر الشهري (${cap.base}).`);
    const a = abbr(s(ln["company"])); const co = adapter.get("Company", s(ln["company"]));
    const loanAcc = `Employee Loans - ${a}`, bank = s(co?.["default_bank_account"]) || s(co?.["default_cash_account"]) || `Cash - ${a}`; const amt = n(ln["loan_amount"]);
    const je = createDoc("Journal Entry", { voucher_type: "Bank Entry", company: ln["company"], posting_date: on, title: `Loan ${name}`, user_remark: `Payment of employee loan ${name}`,
      accounts: [{ account: loanAcc, party_type: "Employee", party: ln["employee"], debit: amt, debit_in_account_currency: amt, credit: 0, credit_in_account_currency: 0 }, { account: bank, debit: 0, debit_in_account_currency: 0, credit: amt, credit_in_account_currency: amt }], total_debit: amt, total_credit: amt }, user);
    const errors = postSubmit("Journal Entry", je.name); if (errors.length) { adapter.remove("Journal Entry", je.name); return fail("The payment could not be posted.", "تعذر ترحيل الصرف.", errors); }
    const rows = (ln["repayments"] as Doc[] | undefined)?.length ? ln["repayments"] as Doc[] : loanSchedule(amt, n(ln["installments"]), d10(ln["repayment_start"]) || on);
    adapter.update(LOAN, name, { disbursement_journal: je.name, loan_status: "Disbursed", repayments: rows, monthly_installment: cap.installment, repaid_amount: 0, outstanding_amount: amt });
    return { ...ok(`Loan ${name} paid out; ${rows.length} installments scheduled.`, `صُرف القرض ${name}؛ جُدول ${rows.length} قسطًا.`), journal: je.name };
  });
}
/** Due installments up to the month end become draft Additional Salary deductions (component Loan Repayment), once each. */
export function loanDeductions(company: string, ym: string, user = currentUser()): ActionResult {
  return guarded(() => {
    const end = new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0)).toISOString().slice(0, 10); const created: [string, string][] = [];
    adapter.batch(() => { for (const ln of list(LOAN, user).filter((x) => s(x["company"]) === company && ["Disbursed", "Repaying"].includes(s(x["loan_status"])))) {
      const rows = ((ln["repayments"] as Doc[] | undefined) ?? []).map((r) => ({ ...r }));
      for (const r of rows) if (s(r["repayment_status"]) !== "Deducted" && d10(r["due_date"]) <= end) {
        const as = createDoc("Additional Salary", { employee: ln["employee"], employee_name: ln["employee_name"], company, salary_component: "Loan Repayment", type: "Deduction", amount: n(r["amount"]), payroll_date: d10(r["due_date"]), overwrite_salary_structure_amount: 0, ref_doctype: LOAN, ref_docname: ln.name }, user);
        r["repayment_status"] = "Deducted"; r["additional_salary"] = as.name; created.push(["Additional Salary", as.name]);
      }
      const repaid = r2(rows.filter((r) => s(r["repayment_status"]) === "Deducted").reduce((x, r) => x + n(r["amount"]), 0));
      adapter.update(LOAN, ln.name, { repayments: rows, repaid_amount: repaid, outstanding_amount: r2(n(ln["loan_amount"]) - repaid), loan_status: repaid >= n(ln["loan_amount"]) ? "Closed" : repaid > 0 ? "Repaying" : s(ln["loan_status"]) });
    } });
    return ok(`${created.length} loan installment(s) added to payroll for ${ym}.`, `أُضيف ${created.length} قسط قرض إلى رواتب ${ym}.`, { created });
  });
}

/* ------------------------------------------------------------------ GAP-20 scheduler jobs on demand */
export type JobId = "earned_leave" | "auto_attendance" | "document_expiry";
export const JOBS: { id: JobId; en: string; ar: string; source: string }[] = [
  { id: "earned_leave", en: "Earned leave allocation", ar: "استحقاق الإجازات المكتسبة", source: "hrms.hr.utils.allocate_earned_leaves (daily)" },
  { id: "auto_attendance", en: "Attendance from check-ins", ar: "الحضور من تسجيلات الدخول", source: "hrms.hr.doctype.shift_type.process_auto_attendance_for_all_shifts (hourly)" },
  { id: "document_expiry", en: "Document expiry and reminders", ar: "انتهاء الوثائق والتذكير", source: "DIGIT HR daily expiry job" },
];
export interface JobRun { job: JobId; changed: number; rows: { ref: string; what: string }[] }

export function runEarnedLeave(company: string, on: string, user = currentUser()): JobRun {
  const rows: JobRun["rows"] = [];
  for (const al of list("Leave Allocation", user).filter((a) => Number(a["docstatus"]) === 1 && (!company || s(a["company"]) === company))) {
    const lt = adapter.get("Leave Type", s(al["leave_type"])); if (!lt || !Number(lt["is_earned_leave"])) continue;
    const emp = adapter.get("Employee", s(al["employee"]));
    const annual = n(lt["max_leaves_allowed"]) || policyValue("annual_leave_days", on, s(al["company"]) || undefined) || 21;
    const acc = leaveAccrual({ annual, frequency: (s(lt["earned_leave_frequency"]) || "Monthly") as Frequency, basedOn: s(lt["allocate_on_day"]) === "Date of Joining" ? "Joining Date" : "Leave Period",
      joining: d10(emp?.["date_of_joining"]), periodFrom: d10(al["from_date"]), periodTo: d10(al["to_date"]), on });
    const delta = Math.round((acc.earned - n(al["new_leaves_allocated"])) * 100) / 100; if (delta <= 0) continue;
    adapter.update("Leave Allocation", al.name, { new_leaves_allocated: acc.earned, total_leaves_allocated: Math.round((n(al["total_leaves_allocated"]) + delta) * 100) / 100 });
    adapter.insertDoc("Leave Ledger Entry", { employee: al["employee"], employee_name: al["employee_name"], company: al["company"], leave_type: al["leave_type"], transaction_type: "Leave Allocation", transaction_name: al.name, leaves: delta, from_date: on, to_date: al["to_date"], docstatus: 1, is_carry_forward: 0, is_expired: 0 });
    rows.push({ ref: al.name, what: `+${delta}` });
  }
  return { job: "earned_leave", changed: rows.length, rows };
}

export function runAutoAttendance(company: string, day: string, user = currentUser()): JobRun {
  const rows: JobRun["rows"] = [];
  const byEmp = new Map<string, Doc[]>();
  for (const c of list("Employee Checkin", user)) if (d10(c["time"]) === day) { const k = s(c["employee"]); byEmp.set(k, [...(byEmp.get(k) ?? []), c]); }
  const marked = new Set(list("Attendance", user).filter((a) => d10(a["attendance_date"]) === day && Number(a["docstatus"]) !== 2).map((a) => s(a["employee"])));
  for (const [emp, logs] of byEmp) {
    const e = adapter.get("Employee", emp); if (!e || (company && s(e["company"]) !== company) || marked.has(emp)) continue;
    const times = logs.map((l) => s(l["time"]).replace(" ", "T")).sort(); const ins = logs.filter((l) => s(l["log_type"]) !== "OUT");
    const hours = times.length > 1 ? Math.round(((Date.parse(times[times.length - 1] + "Z") - Date.parse(times[0] + "Z")) / 3600000) * 100) / 100 : 0;
    const st = adapter.get("Shift Type", s(logs[0]?.["shift"]) || s(e["default_shift"])); const full = shiftHours(st) || 8;
    const status = !ins.length ? "Absent" : hours >= full / 2 ? "Present" : "Half Day";
    const a = createDoc("Attendance", { employee: emp, employee_name: e["employee_name"], company: e["company"], attendance_date: day, status, working_hours: hours, shift: st?.name ?? "", department: e["department"] ?? "" }, user, { skipPerm: true });
    const errs = postSubmit("Attendance", a.name); if (errs.length) { adapter.remove("Attendance", a.name); continue; }
    adapter.update("Attendance", a.name, { status });
    for (const l of logs) adapter.update("Employee Checkin", l.name, { attendance: a.name });
    rows.push({ ref: a.name, what: `${emp} ${status} ${hours}h` });
  }
  return { job: "auto_attendance", changed: rows.length, rows };
}

export function runDocumentExpiry(company: string, on: string, user = currentUser()): JobRun {
  const rows: JobRun["rows"] = []; const days = policyValue("expiry_reminder_days", on, company || undefined) ?? 30;
  const hr = adapter.list("User").filter((u) => ((u["roles"] as Doc[] | undefined) ?? []).some((r) => s(r["role"]) === "HR Manager") && Number(u["enabled"] ?? 1)).map((u) => u.name);
  const todo = new Set(adapter.list("ToDo").map((t) => `${s(t["reference_type"])}|${s(t["reference_name"])}|${s(t["allocated_to"])}`));
  for (const d of list("DIGIT Document Renewal", user).filter((x) => (!company || s(x["company"]) === company) && s(x["status"]) !== "Renewed" && d10(x["expiry_date"]))) {
    const left = daysBetween(on, d10(d["expiry_date"]));
    if (left < 0 && s(d["status"]) !== "Expired") { adapter.update("DIGIT Document Renewal", d.name, { status: "Expired" }); rows.push({ ref: d.name, what: "Expired" }); }
    if (left > days) continue;
    for (const u of hr.length ? hr : [user]) {
      const key = `DIGIT Document Renewal|${d.name}|${u}`; if (todo.has(key)) continue; todo.add(key);
      adapter.insertDoc("ToDo", { status: "Open", priority: left < 0 ? "High" : "Medium", allocated_to: u, reference_type: "DIGIT Document Renewal", reference_name: d.name, date: d10(d["expiry_date"]), assigned_by: user,
        description: `${s(d["document_type"]) || "Document"} of ${s(d["employee_name"]) || s(d["employee"])} ${left < 0 ? "expired on" : "expires on"} ${d10(d["expiry_date"])}` });
      rows.push({ ref: d.name, what: `reminder ${u}` });
    }
  }
  return { job: "document_expiry", changed: rows.length, rows };
}

export function runJob(job: JobId, company: string, on = todayISO(), user = currentUser()): ActionResult & { run?: JobRun } {
  return guarded(() => {
    if (!isHrAdmin(user)) return fail("Only an HR manager runs the scheduled jobs.", "لا يشغّل المهام المجدولة إلا مدير الموارد البشرية.");
    let run!: JobRun; adapter.batch(() => { run = job === "earned_leave" ? runEarnedLeave(company, on, user) : job === "auto_attendance" ? runAutoAttendance(company, on, user) : runDocumentExpiry(company, on, user); });
    const j = JOBS.find((x) => x.id === job)!;
    return { ...ok(`${j.en}: ${run.changed} change(s).`, `${j.ar}: ${run.changed} تغيير.`, { rows: run.rows }), run };
  });
}

/* ------------------------------------------------------------------ UX-11 save conflict */
/** The record changed in storage after the form opened (another user or tab saved it): the fields both sides touched. */
export function saveConflict(openedModified: string, stored: Doc | undefined, draft: Record<string, unknown>, opened: Record<string, unknown>): { by: string; at: string; fields: string[] } | null {
  if (!stored || !openedModified || s(stored["modified"]) === openedModified) return null;
  const eq = (a: unknown, b: unknown) => JSON.stringify(a ?? "") === JSON.stringify(b ?? "");
  const fields = Object.keys(draft).filter((k) => !k.startsWith("__") && !["modified", "modified_by", "creation"].includes(k) && !eq(stored[k], opened[k]));
  return { by: s(stored["modified_by"]), at: s(stored["modified"]).slice(0, 16).replace("T", " "), fields };
}

/* ------------------------------------------------------------------ UX-14 conversations apart from system changes */
export interface Conversation { kind: "comment" | "email"; ref: [string, string]; by: string; at: string; text: string }
const HUMAN = new Set(["Comment", "Info", ""]);
export function conversationsOf(refs: [string, string][]): Conversation[] {
  const want = new Set(refs.map(([dt, nm]) => `${dt}|${nm}`)); const out: Conversation[] = [];
  for (const c of adapter.list("Comment")) if (want.has(`${s(c["reference_doctype"])}|${s(c["reference_name"])}`) && HUMAN.has(s(c["comment_type"])) && s(c["content"]))
    out.push({ kind: "comment", ref: [s(c["reference_doctype"]), s(c["reference_name"])], by: s(c["comment_email"]) || s(c["owner"]), at: s(c["creation"]), text: s(c["content"]).replace(/<[^>]+>/g, "") });
  for (const c of adapter.list("Communication")) if (want.has(`${s(c["reference_doctype"])}|${s(c["reference_name"])}`))
    out.push({ kind: "email", ref: [s(c["reference_doctype"]), s(c["reference_name"])], by: s(c["sender"]) || s(c["owner"]), at: s(c["communication_date"]) || s(c["creation"]), text: s(c["subject"]) || s(c["content"]).replace(/<[^>]+>/g, "").slice(0, 160) });
  return out.sort((a, b) => b.at.localeCompare(a.at));
}

/* ------------------------------------------------------------------ UX-18 what's new, once per user */
const SEEN = (user: string) => `digit-hr:seen-new:${user}`;
export function seenNew(user = currentUser()): Set<string> { try { return new Set(JSON.parse(localStorage.getItem(SEEN(user)) ?? "[]") as string[]); } catch { return new Set(); } }
export function markNewSeen(ids: string[], user = currentUser()): void { try { const all = seenNew(user); for (const i of ids) all.add(i); localStorage.setItem(SEEN(user), JSON.stringify([...all])); } catch { /* storage unavailable: shown again next time */ } }
export function isNew(id: string, user = currentUser()): boolean { return !seenNew(user).has(id); }

/* ------------------------------------------------------------------ DASH-07 unmapped routes */
let toolSections: () => string[][] = () => [];
/** tools.ts registers its sections here, so the overview counts tools without importing the tool registry. */
export function registerToolSections(f: () => string[][]): void { toolSections = f; }
export function unmappedRoutes(sections: string[][] = toolSections()): { kind: "doctype" | "tool"; id: string }[] {
  const out: { kind: "doctype" | "tool"; id: string }[] = [];
  for (const b of R10_BUILT) if (!b.meta.istable && !placeDoc(b.meta.name)) out.push({ kind: "doctype", id: b.meta.name });
  sections.forEach((secs, i) => { if (!secs.length || secs.some((x) => !(x in HR_SECTION_SLUGS))) out.push({ kind: "tool", id: String(i) }); });
  return out;
}
export { addDays, nowISO };
