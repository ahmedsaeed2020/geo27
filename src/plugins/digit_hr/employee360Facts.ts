/**
 * Employee 360 relationship facts over PRE-SCOPED Employee rows (presentation only). The reporting line is read from
 * Employee.reports_to; a manager the reader cannot see ends the chain as "not visible" instead of guessing.
 */
type Row = Record<string, unknown>;
const s = (v: unknown) => (v == null ? '' : String(v));

export type ChainStep = { id: string; name: string; designation: string; visible: boolean };

/** Upward reporting line, nearest manager first. Stops at a loop, a hidden manager (visible=false) or `max` steps. */
export function managerChain(empId: string, emps: Row[], max = 10): { steps: ChainStep[]; loop: boolean } {
  const by = new Map(emps.map((e) => [s(e['name']), e]));
  const steps: ChainStep[] = []; const seen = new Set([empId]);
  let cur = s(by.get(empId)?.['reports_to']);
  while (cur && steps.length < max) {
    if (seen.has(cur)) return { steps, loop: true };
    seen.add(cur);
    const m = by.get(cur);
    if (!m) { steps.push({ id: cur, name: '', designation: '', visible: false }); break; }
    steps.push({ id: cur, name: s(m['employee_name']) || cur, designation: s(m['designation']), visible: true });
    cur = s(m['reports_to']);
  }
  return { steps, loop: false };
}

/** Active direct reports (reports_to == empId) within the readable population, by name. */
export const directReports = (empId: string, emps: Row[]) =>
  emps.filter((e) => s(e['reports_to']) === empId && s(e['status'] || 'Active') === 'Active').sort((a, b) => s(a['employee_name']).localeCompare(s(b['employee_name'])));

/** Internal work history rows (Employee Internal Work History), newest first; open-ended rows (no to_date) lead. */
export function internalHistory(emp: Row): Row[] {
  const rows = Array.isArray(emp['internal_work_history']) ? (emp['internal_work_history'] as Row[]) : [];
  return [...rows].sort((a, b) => (s(b['to_date']) ? 0 : 1) - (s(a['to_date']) ? 0 : 1) || s(b['from_date']).localeCompare(s(a['from_date'])));
}

/** Timeline group filter: only known group keys are accepted (URL input), else all groups. */
export const validGroup = (g: unknown, keys: string[]) => (typeof g === 'string' && keys.includes(g) ? g : '');
