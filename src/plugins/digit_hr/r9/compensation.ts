/**
 * CMP-04 compensation statement — port of digit_hr.api.compensation.statement over the shared records: current submitted
 * Salary Structure Assignment, the year's submitted Salary Slips with their Salary Detail rows, and submitted Additional
 * Salary. Own record or an HR role only (pay visibility for line managers is an owner policy, not granted here). Each
 * section is "denied" when the user may not read its DocType. CMP-07 employer contributions need HRMS's
 * SalaryStructureAssignment.get_evaluated_components (structure formulas), which never run here, so that section is
 * reported as server-required instead of guessed.
 */
import { adapter, type Doc } from "@/lib/adapter";
import { currentUser } from "@/lib/session";
import { _, can, isHr, ownEmployees, PermissionError, requireApp, s, today } from "./core";

const n = (v: unknown) => Number(v) || 0;
const r2 = (x: number) => Math.round(x * 100) / 100;
type Section<T> = ({ state: "denied" }) | T;
function section<T>(dt: string, user: string, fn: () => T): Section<T> { return can(dt, "read", undefined, user) ? fn() : { state: "denied" }; }
const readable = (dt: string, user: string, pred: (d: Doc) => boolean) => adapter.list(dt).filter((d) => pred(d) && can(dt, "read", d, user));

export function statement(employee?: string, year?: number, user = currentUser()) {
  requireApp(user);
  const own = ownEmployees(user);
  const emp = employee || own[0] || "";
  const e = emp ? adapter.get("Employee", emp) : undefined;
  if (!e || !can("Employee", "read", e, user) || (!own.includes(emp) && !isHr(user))) throw new PermissionError(_("You do not have permission to view this employee's compensation"));
  const y = Number(year) || Number(today().slice(0, 4));
  const start = `${y}-01-01`, end = `${y}-12-31`, upTo = [end, today()].sort()[0]!;

  const assignment = () => {
    const rows = readable("Salary Structure Assignment", user, (d) => s(d["employee"]) === emp && n(d.docstatus) === 1 && s(d["from_date"]).slice(0, 10) <= upTo)
      .sort((a, b) => s(b["from_date"]).localeCompare(s(a["from_date"])));
    const r = rows[0];
    return r ? { state: "ok" as const, name: r.name, salary_structure: s(r["salary_structure"]), from_date: s(r["from_date"]).slice(0, 10), base: n(r["base"]), variable: n(r["variable"]), currency: s(r["currency"]) } : { state: "no_data" as const };
  };
  const slips = () => {
    const rows = readable("Salary Slip", user, (d) => s(d["employee"]) === emp && n(d.docstatus) === 1 && s(d["start_date"]).slice(0, 10) >= start && s(d["start_date"]).slice(0, 10) <= end)
      .sort((a, b) => s(a["start_date"]).localeCompare(s(b["start_date"])));
    if (!rows.length) return { state: "no_data" as const, count: 0 };
    const comps = new Map<string, number>();
    for (const r of rows) for (const pf of ["earnings", "deductions"] as const)
      for (const d of (r[pf] as Doc[] | undefined) ?? []) { const k = `${pf}\u0000${s(d["salary_component"])}`; comps.set(k, (comps.get(k) ?? 0) + n(d["amount"])); }
    return { state: "ok" as const, count: rows.length, currency: s(rows[0]!["currency"]),
      gross: r2(rows.reduce((t, r) => t + n(r["gross_pay"]), 0)), deductions: r2(rows.reduce((t, r) => t + n(r["total_deduction"]), 0)), net: r2(rows.reduce((t, r) => t + n(r["net_pay"]), 0)),
      components: [...comps].sort(([a], [b]) => a.localeCompare(b)).map(([k, a]) => { const [type = "", component = ""] = k.split("\u0000"); return { type, component, amount: r2(a) }; }),
      months: rows.map((r) => ({ slip: r.name, start_date: s(r["start_date"]).slice(0, 10), gross: n(r["gross_pay"]), net: n(r["net_pay"]) })) };
  };
  const additional = () => {
    const rows = readable("Additional Salary", user, (d) => s(d["employee"]) === emp && n(d.docstatus) === 1 && s(d["payroll_date"]).slice(0, 10) >= start && s(d["payroll_date"]).slice(0, 10) <= end);
    const agg = new Map<string, number>();
    for (const r of rows) { const k = `${s(r["type"])}\u0000${s(r["salary_component"])}`; agg.set(k, (agg.get(k) ?? 0) + n(r["amount"])); }
    return { state: (rows.length ? "ok" : "no_data") as "ok" | "no_data", items: [...agg].sort(([a], [b]) => a.localeCompare(b)).map(([k, a]) => { const [type = "", component = ""] = k.split("\u0000"); return { type, component, amount: r2(a) }; }) };
  };
  const employer = () => {
    const a = assignment();
    return a.state === "ok" ? { state: "server_required" as const, assignment: a.name, reason: "DIGIT HR SalaryStructureAssignment.get_evaluated_components (structure formulas) runs on the DIGIT server" } : { state: "no_data" as const };
  };
  return { contract: "digit-hr-compensation-statement", version: 1, employee: emp, employee_name: s(e["employee_name"]), company: s(e["company"]), year: y, self: own.includes(emp),
    current_assignment: section("Salary Structure Assignment", user, assignment), salary_slips: section("Salary Slip", user, slips),
    additional_salary: section("Additional Salary", user, additional), employer_contributions: section("Salary Structure Assignment", user, employer) };
}
export type CompensationStatement = ReturnType<typeof statement>;
