/**
 * Module 06 plan facts over PRE-SCOPED rows. Plans are compared with TODAY's active headcount of the same company/department,
 * which is a recorded fact — not a forecast and not the headcount at plan end. No trend or projection is derived.
 */
type Row = Record<string, unknown>;
const s = (v: unknown) => (v == null ? '' : String(v));
const live = (r: Row) => Number(r['docstatus'] ?? 0) !== 2;
const overlaps = (r: Row, from: string, to: string) => (!to || !s(r['from_date']) || s(r['from_date']) <= to) && (!from || !s(r['to_date']) || s(r['to_date']) >= from);

export type PlanFact = { doctype: string; name: string; title: string; company: string; department: string; from: string; to: string; planned: number; recorded: number | null; actual: string[]; status: string };

/** DIGIT Workforce Plan (planned_headcount, current_headcount as recorded) and canonical Staffing Plan (sum of number_of_positions). */
export function planFacts(plans: Row[], staffing: Row[], emps: Row[], scope: { company?: string; from?: string; to?: string }): PlanFact[] {
  const active = emps.filter((e) => s(e['status'] || 'Active') === 'Active');
  const actual = (company: string, department: string) => active.filter((e) => (!company || s(e['company']) === company) && (!department || s(e['department']) === department)).map((e) => s(e['name']));
  const inScope = (r: Row) => live(r) && (!scope.company || s(r['company']) === scope.company) && overlaps(r, scope.from ?? '', scope.to ?? '');
  const status = (r: Row) => (Number(r['docstatus'] ?? 0) === 1 ? 'Submitted' : 'Draft');
  return [
    ...plans.filter(inScope).map((p) => ({ doctype: 'DIGIT Workforce Plan', name: s(p['name']), title: s(p['plan_title']) || s(p['name']), company: s(p['company']), department: s(p['department']), from: s(p['from_date']), to: s(p['to_date']), planned: Number(p['planned_headcount'] || 0), recorded: p['current_headcount'] == null || p['current_headcount'] === '' ? null : Number(p['current_headcount']), actual: actual(s(p['company']), s(p['department'])), status: status(p) })),
    ...staffing.filter(inScope).map((p) => ({ doctype: 'Staffing Plan', name: s(p['name']), title: s(p['name']), company: s(p['company']), department: s(p['department']), from: s(p['from_date']), to: s(p['to_date']), planned: (Array.isArray(p['staffing_details']) ? (p['staffing_details'] as Row[]) : []).reduce((t, d) => t + Number(d['number_of_positions'] || 0), 0), recorded: (Array.isArray(p['staffing_details']) ? (p['staffing_details'] as Row[]) : []).reduce((t, d) => t + Number(d['current_count'] || 0), 0), actual: actual(s(p['company']), s(p['department'])), status: status(p) })),
  ];
}

/** Default explicit period when none is in the URL: the current calendar year (shown and written to the URL, never implied). */
export function yearPeriod(year: number): { from: string; to: string } { return { from: `${year}-01-01`, to: `${year}-12-31` }; }
