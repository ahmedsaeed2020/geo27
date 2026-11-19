/**
 * Section 02.5 talent review over PRE-SCOPED rows. Uses only submitted Appraisal.final_score (HRMS 0–5 scale) and the
 * Employee designation field. No readiness labels, nine-box thresholds or successor nominations are inferred — those need
 * an approved succession source (planned).
 */
type Row = Record<string, unknown>;
const s = (v: unknown) => (v == null ? '' : String(v));
const n = (v: unknown) => Number(v || 0);

export type ReviewRow = { employee: string; employeeName: string; designation: string; department: string; appraisal: string; cycle: string; score: number };

/** Latest submitted appraisal per employee (by end_date, then modified). */
export function latestScores(appraisals: Row[], emps: Row[]): ReviewRow[] {
  const empBy = new Map(emps.map((e) => [s(e['name']), e]));
  const best = new Map<string, Row>();
  const key = (a: Row) => `${s(a['end_date'])}|${s(a['modified'])}`;
  for (const a of appraisals) {
    if (n(a['docstatus']) !== 1 || !empBy.has(s(a['employee']))) continue;
    const cur = best.get(s(a['employee']));
    if (!cur || key(a) > key(cur)) best.set(s(a['employee']), a);
  }
  return [...best.values()].map((a) => { const e = empBy.get(s(a['employee'])) ?? {}; return {
    employee: s(a['employee']), employeeName: s(e['employee_name']) || s(a['employee_name']) || s(a['employee']),
    designation: s(e['designation']) || s(a['designation']), department: s(e['department']) || s(a['department']),
    appraisal: s(a['name']), cycle: s(a['appraisal_cycle']), score: n(a['final_score']) }; })
    .sort((a, b) => b.score - a.score || a.employeeName.localeCompare(b.employeeName));
}

/** Count per whole-point band of the source 0–5 scale ([0,1), [1,2) … [4,5]). Neutral binning, not a rating policy. */
export function scoreBands(rows: ReviewRow[]): { band: string; employees: string[] }[] {
  return [0, 1, 2, 3, 4].map((lo) => ({ band: `${lo}–${lo + 1}`, employees: rows.filter((r) => (lo === 4 ? r.score >= 4 : r.score >= lo && r.score < lo + 1)).map((r) => r.employee) }));
}

/** Designations held by exactly one active employee in the readable population (single-incumbent roles). */
export function singleIncumbent(emps: Row[]): { designation: string; employee: string; employeeName: string }[] {
  const by = new Map<string, Row[]>();
  for (const e of emps) if (s(e['status'] || 'Active') === 'Active' && s(e['designation'])) by.set(s(e['designation']), [...(by.get(s(e['designation'])) ?? []), e]);
  return [...by].filter(([, list]) => list.length === 1).map(([designation, [e]]) => ({ designation, employee: s(e?.['name']), employeeName: s(e?.['employee_name']) || s(e?.['name']) })).sort((a, b) => a.designation.localeCompare(b.designation));
}
