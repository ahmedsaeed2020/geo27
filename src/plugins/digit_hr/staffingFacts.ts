/**
 * Section 06.2 Staffing Plan vs live workforce, per Staffing Plan Detail row. Mirrors HRMS staffing_plan.py:
 * number_of_positions = vacancies + current_count at plan time; current headcount = Active employees with the designation
 * in the plan company; open Job Openings with the designation in that company. Facts only — no forecast or cost model.
 */
type Row = Record<string, unknown>;
const s = (v: unknown) => (v == null ? '' : String(v));
const n = (v: unknown) => Number(v || 0);

export type StaffingFact = {
  plan: string; company: string; department: string; from: string; to: string; designation: string;
  planned: number; recordedCurrent: number; actual: string[]; openings: string[]; remaining: number; state: 'over' | 'gap' | 'met';
};

export function staffingFacts(plans: Row[], emps: Row[], openings: Row[]): StaffingFact[] {
  const out: StaffingFact[] = [];
  for (const p of plans.filter((x) => n(x['docstatus']) !== 2)) {
    const company = s(p['company']);
    for (const d of Array.isArray(p['staffing_details']) ? (p['staffing_details'] as Row[]) : []) {
      const designation = s(d['designation']); if (!designation) continue;
      const planned = n(d['number_of_positions']) || n(d['vacancies']) + n(d['current_count']);
      const actual = emps.filter((e) => s(e['status'] || 'Active') === 'Active' && s(e['designation']) === designation && s(e['company']) === company).map((e) => s(e['name']));
      const open = openings.filter((o) => s(o['status']) === 'Open' && s(o['designation']) === designation && s(o['company']) === company).map((o) => s(o['name']));
      const remaining = planned - actual.length - open.length;
      out.push({ plan: s(p['name']), company, department: s(p['department']), from: s(p['from_date']), to: s(p['to_date']), designation, planned, recordedCurrent: n(d['current_count']), actual, openings: open, remaining, state: actual.length > planned ? 'over' : remaining > 0 ? 'gap' : 'met' });
    }
  }
  return out;
}

/** Plans whose period covers `on`. */
export const plansOn = (plans: Row[], on: string) => plans.filter((p) => (!s(p['from_date']) || s(p['from_date']) <= on) && (!s(p['to_date']) || s(p['to_date']) >= on));
