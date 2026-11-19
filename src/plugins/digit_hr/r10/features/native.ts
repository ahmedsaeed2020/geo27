/**
 * Native-first HR behaviour from the Frappe HR 2026 product updates (sheet 06, treated as installed v16), built in the
 * virtual HRMS because its frozen controllers do not run here; the Python twins are in ../hookScripts.ts.
 *  - FR26-0137 / 0139  a saved (or imported) employee with an e-mail gets a linked sign-in account when the
 *                      "create_user_automatically" HR policy is on, or when the import row sets create_user = 1
 *  - FR26-0138         Create User for an existing employee (button / tool), linking an existing free account first
 *  - FR26-0348         an imported salary slip without a name is named like the controller: Sal Slip/<employee>/#####
 *  - FR26-0349         overlapping shifts block a new assignment only when active and submitted; cancelled /
 *                      inactive ones never do
 *  - FR26-0346 / 0390  the next move (IN / OUT) is known only once the day's moves are read, and HR can record a
 *                      quick check-in from the desk for an employee in scope (desk terminal, no geofence)
 */
import { adapter, synthName, type Doc } from "@/lib/adapter";
import { currentUser, userRoles } from "@/lib/session";
import { parseNamingSeries } from "@/lib/naming";
import { policyValue } from "../../product/settings";
import { scopedGet, scopedList } from "../../compat/scope";
import { s, d10, nowISO, todayISO, ok, fail, guarded, type ActionResult } from "../write";

/* ------------------------------------------------------------------ FR26-0137/0138/0139 user from employee */
export const employeeEmail = (e: Doc | undefined) => s(e?.["prefered_email"]) || s(e?.["company_email"]) || s(e?.["personal_email"]) || s(e?.["user_id"]);
const ACCOUNT_ROLES = ["System Manager", "HR Manager", "HR Operations", "CHRO"];
export function canCreateUser(user = currentUser()): boolean { return user === "Administrator" || userRoles(user).some((r) => ACCOUNT_ROLES.includes(r)); }
/** The account a new employee would get: e-mail, names and the Employee role (self-service), never a desk admin role. */
function linkOrCreate(e: Doc): { user: string; created: boolean } {
  const email = employeeEmail(e).toLowerCase(); const existing = adapter.get("User", email);
  const taken = existing && adapter.list("Employee").some((x) => x.name !== e.name && s(x["user_id"]).toLowerCase() === email);
  if (taken) throw new Error(`The account ${email} already belongs to another employee`);
  if (!existing) {
    const [first, ...rest] = s(e["employee_name"]).split(" ");
    adapter.insertDoc("User", { name: email, email, first_name: s(e["first_name"]) || first || email, last_name: s(e["last_name"]) || rest.join(" "), enabled: 1, user_type: "Website User",
      roles: [{ idx: 1, role: "Employee" }], digit_employee: e.name, send_welcome_email: 0 });
  }
  adapter.update("Employee", e.name, { user_id: email, create_user_permission: 1 });
  return { user: email, created: !existing };
}
/** `email` (Employee 360 «إنشاء حساب»): used only when the employee has no e-mail yet; it is stored as the company e-mail first. */
export function createEmployeeUser(employee: string, user = currentUser(), email = ""): ActionResult {
  return guarded(() => {
    if (!canCreateUser(user)) return fail("Only HR managers or the system manager can create sign-in accounts.", "إنشاء حسابات الدخول لمدير الموارد البشرية أو مدير النظام فقط.");
    let e = scopedGet("Employee", employee, user); if (!e) return fail("Employee not found or not permitted.", "الموظف غير موجود أو غير مسموح.");
    const typed = email.trim().toLowerCase();
    if (!employeeEmail(e) && typed && !s(e["user_id"])) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(typed)) return fail("Enter a valid e-mail address.", "أدخل بريدًا إلكترونيًا صحيحًا.");
      adapter.update("Employee", e.name, { company_email: typed }); e = { ...e, company_email: typed };
    }
    if (s(e["user_id"]) && adapter.get("User", s(e["user_id"]))) return fail(`The employee already signs in as ${s(e["user_id"])}.`, `للموظف حساب دخول بالفعل: ${s(e["user_id"])}.`);
    if (!employeeEmail(e)) return fail("Add the employee's company or personal e-mail first.", "أضف البريد الإلكتروني للموظف (العمل أو الشخصي) أولًا.");
    const r = linkOrCreate(e);
    return ok(r.created ? `Account ${r.user} created and linked.` : `Existing account ${r.user} linked.`, r.created ? `أُنشئ الحساب ${r.user} ورُبط بالموظف.` : `رُبط الحساب الموجود ${r.user} بالموظف.`, { created: [["User", r.user]] });
  });
}
/** Employee hook (after insert): the setting or an import row's create_user = 1 creates the account; never blocks the save. */
export function autoUserAfterInsert(d: Doc): void {
  const want = Number(d["create_user"] ?? 0) === 1 || (policyValue("create_user_automatically", todayISO(), s(d["company"])) ?? 0) > 0;
  if (!want || s(d["user_id"]) || !employeeEmail(d)) return;
  try { linkOrCreate(d); } catch { /* an account owned by another employee is left for HR to resolve; the employee still saves */ }
}

/* ------------------------------------------------------------------ FR26-0348 imported salary slip naming */
const SLIP_SYNTH = new RegExp(`^${synthName("Salary Slip", 1).replace(/0001$/, "").replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")}\\d{4,}$`);
/** The controller's name for a slip that arrived without one (Sal Slip/<employee>/#####); explicit names stay. */
export function salarySlipName(doc: Doc): string | undefined {
  if (!SLIP_SYNTH.test(doc.name) || !s(doc["employee"])) return undefined;
  return parseNamingSeries("Salary Slip", `Sal Slip/${s(doc["employee"])}/.#####`, doc);
}

/* ------------------------------------------------------------------ FR26-0349 shift overlap ignores cancelled shifts */
const overlap = (a1: string, a2: string, b1: string, b2: string) => !!a1 && !!b1 && a1 <= (b2 || "9999-12-31") && b1 <= (a2 || "9999-12-31");
export function shiftOverlapErrors(doc: Doc, before: Doc | undefined): string[] {
  if (Number(doc.docstatus) !== 1 || Number(before?.docstatus ?? 0) === 1 || s(doc["status"]) === "Inactive") return [];
  const clash = adapter.list("Shift Assignment").find((a) => a.name !== doc.name && a["employee"] === doc["employee"] && a["shift_type"] === doc["shift_type"]
    && Number(a.docstatus) === 1 && s(a["status"]) !== "Inactive" && overlap(d10(a["start_date"]), d10(a["end_date"]), d10(doc["start_date"]), d10(doc["end_date"])));
  return clash ? [`${s(doc["employee"])} already has shift ${s(doc["shift_type"])} from ${d10(clash["start_date"])} (${clash.name})`] : [];
}

/* ------------------------------------------------------------------ FR26-0346 / FR26-0390 next move and desk check-in */
export type NextMove = "IN" | "OUT";
/** The next move from the day's last check-in; `null` while the moves are not read yet, so no screen shows a guessed IN. */
export function nextMove(employee: string, ready: boolean, day = todayISO()): NextMove | null {
  if (!ready || !employee) return null;
  const last = adapter.list("Employee Checkin").filter((c) => c["employee"] === employee && s(c["time"]).slice(0, 10) === day).sort((a, b) => s(a["time"]).localeCompare(s(b["time"]))).pop();
  return last && last["log_type"] === "IN" ? "OUT" : "IN";
}
export function deskCheckin(employee: string, user = currentUser(), at = nowISO()): ActionResult & { log_type?: NextMove } {
  return guarded(() => {
    const e = scopedGet("Employee", employee, user); if (!e) return fail("Employee not found or not permitted.", "الموظف غير موجود أو غير مسموح.");
    if (s(e["status"]) !== "Active") return fail("Only active employees can check in.", "تسجيل الحضور للموظفين النشطين فقط.");
    const t = at.slice(0, 19).replace("T", " "); const log_type = nextMove(e.name, true, t.slice(0, 10))!;
    const d = adapter.insertDoc("Employee Checkin", { employee: e.name, employee_name: e["employee_name"], log_type, time: t, device_id: "Desk", skip_auto_attendance: 0, digit_recorded_by: user });
    return { ...ok(log_type === "IN" ? `${s(e["employee_name"])} checked in at ${t.slice(11, 16)}.` : `${s(e["employee_name"])} checked out at ${t.slice(11, 16)}.`, log_type === "IN" ? `سُجل حضور ${s(e["employee_name"])} الساعة ${t.slice(11, 16)}.` : `سُجل انصراف ${s(e["employee_name"])} الساعة ${t.slice(11, 16)}.`, { created: [["Employee Checkin", d.name]] }), log_type };
  });
}
/** Today's desk moves in the user's scope (the quick check-in list). */
export function todaysMoves(user = currentUser(), day = todayISO()): Doc[] {
  return scopedList("Employee Checkin", user).filter((c) => s(c["time"]).slice(0, 10) === day).sort((a, b) => s(b["time"]).localeCompare(s(a["time"])));
}
