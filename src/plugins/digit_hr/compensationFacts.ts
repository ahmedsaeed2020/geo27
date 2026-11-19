/**
 * Section 04.4 compensation & benefits facts over PRE-SCOPED rows. Counts and dates only — salary amounts are never
 * aggregated or displayed here; they stay in the permission-checked native records.
 */
type Row = Record<string, unknown>;
const s = (v: unknown) => (v == null ? '' : String(v));
const n = (v: unknown) => Number(v || 0);

/** Effective (latest from_date ≤ today) submitted assignment per employee — mirrors HRMS get_assigned_salary_structure. */
export function effectiveAssignments(assignments: Row[], today: string): Map<string, Row> {
  const out = new Map<string, Row>();
  for (const a of assignments) {
    if (n(a['docstatus']) !== 1 || !s(a['from_date']) || s(a['from_date']) > today) continue;
    const emp = s(a['employee']); const cur = out.get(emp);
    if (!cur || s(a['from_date']) > s(cur['from_date'])) out.set(emp, a);
  }
  return out;
}

/** Employees per salary structure, from effective assignments. */
export function structureUsage(effective: Map<string, Row>): { structure: string; employees: string[] }[] {
  const by = new Map<string, string[]>();
  for (const [emp, a] of effective) by.set(s(a['salary_structure']) || '—', [...(by.get(s(a['salary_structure']) || '—') ?? []), emp]);
  return [...by].map(([structure, employees]) => ({ structure, employees })).sort((a, b) => b.employees.length - a.employees.length);
}

/** Submitted assignments that take effect after today (scheduled changes). */
export const futureAssignments = (assignments: Row[], today: string) => assignments.filter((a) => n(a['docstatus']) === 1 && s(a['from_date']) > today).sort((a, b) => s(a['from_date']).localeCompare(s(b['from_date'])));

/** Additional Salary that will still affect a payroll on/after today: submitted, not disabled, payroll_date ≥ today or recurring to_date ≥ today. */
export function upcomingAdditional(rows: Row[], today: string): Row[] {
  return rows.filter((r) => n(r['docstatus']) === 1 && !n(r['disabled']) && (n(r['is_recurring']) ? s(r['to_date']) >= today : s(r['payroll_date']) >= today))
    .sort((a, b) => s(a['payroll_date'] || a['from_date']).localeCompare(s(b['payroll_date'] || b['from_date'])));
}

export const componentsByType = (components: Row[]) => ({
  earning: components.filter((c) => s(c['type']) === 'Earning' && !n(c['disabled'])),
  deduction: components.filter((c) => s(c['type']) === 'Deduction' && !n(c['disabled'])),
});
