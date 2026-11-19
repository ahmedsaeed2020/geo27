/**
 * Round-2 integrations on existing screens: INT-10 project assignments (DIGIT Site Worker Assignment) on Employee 360
 * and on the Project form, INT-11 purchases (Purchase Order / Material Request digit_employee) on Employee 360, and the
 * project's labour cost against its labour budget from the same runner as the report (INT-15). Reads are scoped.
 */
import type { Doc } from "@/lib/adapter";
import { currentUser } from "@/lib/session";
import { scopedList } from "../../compat/scope";
import { HR_REPORTS_R2 } from "../../product/reports2";

/** The field that names the employee on each Employee 360 source (default `employee`). */
export const EMP_LINK: Record<string, string> = { "Purchase Order": "digit_employee", "Material Request": "digit_employee" };
export const empLinkOf = (dt: string) => EMP_LINK[dt] ?? "employee";
const list = (dt: string, user: string): Doc[] | null => { try { return scopedList(dt, user); } catch { return null; } };

/** Records of one employee in a source DocType, through the scoped read (null = no read permission). */
export function recordsOfEmployee(dt: string, employee: string, user = currentUser()): Doc[] | null {
  const r = list(dt, user); return r ? r.filter((d) => d[empLinkOf(dt)] === employee) : null;
}

export interface ProjectWorkforce { assignments: Doc[]; active: number; budget: number | null; actual: number | null; remaining: number | null }
/** INT-10 + INT-15: who works on the project and its labour cost vs budget, year to date (`on` = as-of date). */
export function projectWorkforce(project: string, company: string, on: string, user = currentUser()): ProjectWorkforce | null {
  const a = list("DIGIT Site Worker Assignment", user); if (!a) return null;
  const assignments = a.filter((x) => x["project"] === project);
  const res = HR_REPORTS_R2.find((r) => r.name === "HR Labour Cost vs Budget by Project")!.run({ company, from_date: `${on.slice(0, 4)}-01-01`, to_date: on });
  const row = res.rows.find((r) => r["project"] === project && !r["is_total"]);
  const num = (k: string) => (row ? Number(row[k]) || 0 : null);
  return { assignments, active: assignments.filter((x) => x["status"] === "Active").length, budget: num("budget"), actual: num("actual"), remaining: num("variance") };
}
