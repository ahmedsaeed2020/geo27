/**
 * Central current-employee resolver for HR self-service (replaces the old
 * hardcoded SYN-EMP-001). Mirrors HRMS `get_current_employee_info`:
 * Employee.user_id == session user, status Active. No fallback to a demo or
 * first employee; Administrator gets no implicit employee.
 * Virtual-only: these checks do NOT establish real Frappe server security.
 */
import { adapter, type Doc } from "@/lib/adapter";
import { currentUser, userRoles } from "@/plugins/digit_hr/compat/session";
import { scopedGet, scopedList } from "@/plugins/digit_hr/compat/scope";

export type EmployeeResolution =
  | { state: "linked"; id: string; name: string; company: string; doc: Doc }
  | { state: "unlinked"; reason: "no-mapping" | "inactive" | "ambiguous"; user: string };

const s = (v: unknown) => String(v ?? "");

export function resolveEmployee(user = currentUser()): EmployeeResolution {
  const rows = adapter.list("Employee").filter((e) => s(e["user_id"]) === user && user !== "");
  const active = rows.filter((e) => s(e["status"] || "Active") === "Active");
  if (active.length === 1) {
    const d = active[0];
    if (!d) return { state: "unlinked", reason: "no-mapping", user };
    return { state: "linked", id: d.name, name: s(d["employee_name"]) || d.name, company: s(d["company"]), doc: d };
  }
  if (active.length > 1) return { state: "unlinked", reason: "ambiguous", user };
  return { state: "unlinked", reason: rows.length ? "inactive" : "no-mapping", user };
}

/** Resolved employee id or "" (callers must treat "" as unlinked — never substitute a default). */
export function currentEmployeeId(user = currentUser()): string {
  const r = resolveEmployee(user);
  return r.state === "linked" ? r.id : "";
}

export const HR_ADMIN_ROLES = ["HR Manager", "HR User", "System Manager"];
export function isHrAdmin(user = currentUser()): boolean {
  return user === "Administrator" || userRoles(user).some((r) => HR_ADMIN_ROLES.includes(r));
}

/** Direct + indirect reports (reports_to chain) of an employee. */
export function teamOf(empId: string): Set<string> {
  const out = new Set<string>();
  if (!empId) return out;
  const all = adapter.list("Employee");
  let frontier = [empId];
  while (frontier.length) {
    const next: string[] = [];
    for (const e of all) if (frontier.includes(s(e["reports_to"])) && !out.has(e.name) && e.name !== empId) { out.add(e.name); next.push(e.name); }
    frontier = next;
  }
  return out;
}

/** May `user` read records of employee `target`? self, manager-of, or HR role — always within Core permission/company scope. */
export function canAccessEmployee(target: string, user = currentUser()): boolean {
  if (!target || !adapter.get("Employee", target)) return false;
  // HR roles: Core role/company/User Permission scope decides. Self/team: HRMS self-service relationship.
  if (isHrAdmin(user)) return !!scopedGet("Employee", target, user);
  const me = currentEmployeeId(user);
  if (!me) return false;
  return (target === me || teamOf(me).has(target)) && !!scopedGet("Employee", target, user);
}

/** Employee-linked rows for the "My" tab (self only) or "Team" tab (reports only, or all in scope for HR roles). */
export function employeeRows(doctype: string, tab: "my" | "team", user = currentUser()): Doc[] {
  const me = currentEmployeeId(user);
  const rows = scopedList(doctype, user);
  if (tab === "my") return me ? rows.filter((d) => s(d["employee"]) === me) : [];
  if (isHrAdmin(user)) {
    const visible = new Set(scopedList("Employee", user).map((e) => e.name));
    return rows.filter((d) => visible.has(s(d["employee"])) && s(d["employee"]) !== me);
  }
  const team = teamOf(me);
  return rows.filter((d) => team.has(s(d["employee"])));
}

/** Throws when the session user writes for an employee they may not act for. */
export function assertEmployeeAccess(target: string, user = currentUser()): void {
  if (!canAccessEmployee(target, user)) throw new Error(`Not permitted to act for employee ${target}`);
}
