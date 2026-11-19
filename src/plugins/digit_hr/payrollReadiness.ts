/** Payroll readiness inferences over pre-scoped rows. Presentation only — never payroll calculation or posting. */
type Row = Record<string, unknown>;
const s = (v: unknown) => (v == null ? '' : String(v));
const live = (r: Row) => Number(r['docstatus'] ?? 0) !== 2;

/** Employee bank fields apply only when salary_mode == 'Bank' (source depends_on), so other or unset modes are not flagged. */
export function missingBankDetails<T extends Row>(employees: T[]): T[] {
  return employees.filter((e) => s(e['salary_mode']) === 'Bank' && !s(e['bank_ac_no']) && !s(e['iban']));
}

/** Employees without a submitted Salary Structure Assignment, or null when absence cannot be inferred because the reader's
 * assignment rows are narrower than their Employee rows (row-scoped non-HR readers). */
export function missingSalaryStructure<T extends Row>(employees: T[], assignments: Row[], inferable: boolean): T[] | null {
  if (!inferable) return null;
  const assigned = new Set(assignments.filter((a) => Number(a['docstatus']) === 1).map((a) => s(a['employee'])));
  return employees.filter((e) => !assigned.has(s(e['name'])));
}

const PE_FILTERS = ['branch', 'department', 'designation', 'grade'] as const;
/**
 * Effective cohort of a Payroll Entry over pre-scoped employees, using the SAME criteria as Core
 * departments.ts getPayrollEmployees (payroll_entry.py fill_employee_details): Active, same company, matching
 * branch/department/designation/grade filters, joined on/before end_date, not relieved before start_date.
 */
export function payrollCohort<T extends Row>(pe: Row, employees: T[]): T[] {
  return employees.filter((e) => (e['status'] ?? 'Active') === 'Active' && (!pe['company'] || e['company'] === pe['company']) && PE_FILTERS.every((k) => !pe[k] || e[k] === pe[k])
    && (!pe['end_date'] || !e['date_of_joining'] || s(e['date_of_joining']) <= s(pe['end_date'])) && (!e['relieving_date'] || !pe['start_date'] || s(e['relieving_date']) >= s(pe['start_date'])));
}

export type PreflightIssue = 'no-assignment' | 'structure-not-submitted' | 'bank' | 'no-slip' | 'slip-draft' | 'not-in-run' | 'run-not-eligible';
/** Wording of each preflight issue [ar, en, severity] — one source for the Payroll workspace and the Smart Guide. */
export const PREFLIGHT_ISSUE_TEXT: Record<PreflightIssue, [string, string, "blocking" | "review"]> = {
  "no-assignment": ["بلا إسناد راتب ساري في بداية الفترة", "No effective salary assignment at period start", "blocking"],
  "structure-not-submitted": ["هيكل الراتب المسند غير معتمد", "Assigned salary structure not submitted", "blocking"],
  bank: ["الدفع بتحويل بنكي دون بيانات بنكية", "Paid by bank transfer without bank details", "review"],
  "no-slip": ["لا قسيمة لهذه الدورة", "No slip for this cycle", "review"],
  "slip-draft": ["القسيمة مسودة", "Slip is a draft", "review"],
  "not-in-run": ["مؤهل لكنه غير مدرج في جدول المسير", "Eligible but not in the run's employee table", "review"],
  "run-not-eligible": ["مدرج في المسير لكنه لم يعد مؤهلًا", "In the run but no longer eligible", "blocking"],
};
export type PreflightRow = { employee: string; employeeName: string; assignment?: Row | undefined; slip?: Row | undefined; previous?: Row | undefined; netChange: number | null; inRun: boolean; issues: PreflightIssue[] };

/**
 * Read-only preflight for one Payroll Entry:
 * - assignment = latest submitted SSA with from_date ≤ start_date (Core activeAssignment, as used by createSalarySlips);
 * - structure must be submitted (createSalarySlips refuses otherwise);
 * - slip = live Salary Slip linked to the entry, else the employee's slip for the same start_date (createSalarySlips dedupe);
 * - bank details are required only when salary_mode is Bank (missingBankDetails);
 * - netChange = current slip net_pay minus the latest earlier SUBMITTED slip — a recorded difference, not an explained variance.
 * Rows in the entry's employees table that are no longer in the cohort are returned with 'run-not-eligible'.
 */
export function cohortPreflight(pe: Row, cohort: Row[], assignments: Row[], structures: Row[], slips: Row[]): PreflightRow[] {
  const start = s(pe['start_date']);
  const runEmps = new Set((Array.isArray(pe['employees']) ? (pe['employees'] as Row[]) : []).map((r) => s(r['employee'])));
  const structOk = (name: string) => structures.some((x) => s(x['name']) === name && Number(x['docstatus']) === 1);
  const inCohort = new Set(cohort.map((e) => s(e['name'])));
  const row = (e: Row | undefined, id: string, nm: string, eligible: boolean): PreflightRow => {
    const assignment = assignments.filter((a) => s(a['employee']) === id && Number(a['docstatus']) === 1 && s(a['from_date']) <= start).sort((a, b) => s(b['from_date']).localeCompare(s(a['from_date'])))[0];
    const slip = slips.find((x) => live(x) && s(x['employee']) === id && (s(x['payroll_entry']) === s(pe['name']) || s(x['start_date']) === start));
    const previous = slips.filter((x) => Number(x['docstatus']) === 1 && s(x['employee']) === id && s(x['start_date']) < start).sort((a, b) => s(b['start_date']).localeCompare(s(a['start_date'])))[0];
    const issues: PreflightIssue[] = [];
    if (!eligible) issues.push('run-not-eligible');
    else {
      if (!assignment) issues.push('no-assignment');
      else if (!structOk(s(assignment['salary_structure']))) issues.push('structure-not-submitted');
      if (!slip) issues.push('no-slip'); else if (Number(slip['docstatus']) === 0) issues.push('slip-draft');
      if (e && missingBankDetails([e]).length) issues.push('bank');
      if (!runEmps.has(id)) issues.push('not-in-run');
    }
    const netChange = slip && previous ? Math.round((Number(slip['net_pay'] || 0) - Number(previous['net_pay'] || 0)) * 100) / 100 : null;
    return { employee: id, employeeName: nm, assignment, slip, previous, netChange, inRun: runEmps.has(id), issues };
  };
  const out = cohort.map((e) => row(e, s(e['name']), s(e['employee_name']) || s(e['name']), true));
  for (const r of (Array.isArray(pe['employees']) ? (pe['employees'] as Row[]) : [])) if (s(r['employee']) && !inCohort.has(s(r['employee']))) out.push(row(undefined, s(r['employee']), s(r['employee_name']) || s(r['employee']), false));
  return out;
}
