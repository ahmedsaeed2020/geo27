import type { Doc } from "@/lib/adapter";
export const ANALYTICS_PARAMETERS = ["Branch", "Grade", "Department", "Designation", "Employment Type"] as const;
export const INFORMATION_COLUMNS = ["name", "employee_number", "date_of_joining", "branch", "department", "designation", "gender", "status", "company", "employment_type", "reports_to", "company_email"];
/** Source employee_analytics.py: active employees, company required, register excludes unset parameter.
 * Chart includes Not Set. Scope must be applied before aggregation (never leak other employees in totals). */
export function employeeAnalytics(employees: Doc[], company: string, parameter: string) {
  const field = parameter.toLowerCase().replaceAll(" ", "_");
  if (!company || !ANALYTICS_PARAMETERS.some(p => p === parameter)) return null;
  const population = employees.filter(e => e["company"] === company && e["status"] === "Active");
  const rows = population.filter(e => !!e[field]);
  const groups = new Map<string, number>();
  for (const e of population) { const key = String(e[field] || "Not Set"); groups.set(key, (groups.get(key) ?? 0) + 1); }
  return { field, rows, population, groups: [...groups].map(([label, count]) => ({ label, count })) };
}
/** Frozen Employee Information definition: bank_ac_no descending; no duplicate name column. */
export function employeeInformation(employees: Doc[], company: string, query: string) {
  return employees.filter(e => (!company || e["company"] === company) && `${e.name} ${e["employee_name"] ?? ""}`.toLowerCase().includes(query.toLowerCase()))
    .sort((a,b) => String(b["bank_ac_no"] ?? "").localeCompare(String(a["bank_ac_no"] ?? "")));
}