/**
 * NB-2 skills matrix (02.4) from native Employee Skill Map rows (employee_skills: skill, proficiency, evaluation_date;
 * trainings: training, training_date). Pure and display-only. Required skills per designation are NOT in the frozen
 * catalog (HRMS installs Designation.skills as a custom field), so the matrix shows held skills only and never a gap
 * against an assumed requirement.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- adapter rows are untyped JSON documents
type Row = any;
const s = (v: unknown) => (v == null ? "" : String(v));

/** Frappe Rating fields store 0–1 fractions (v14+); legacy rows may hold 0–5. Returns 0–5 stars, null when unrated. */
export function stars(proficiency: unknown): number | null {
  if (proficiency === null || proficiency === undefined || proficiency === "") return null;
  const v = Number(proficiency); if (!Number.isFinite(v) || v < 0) return null;
  return Math.round((v <= 1 ? v * 5 : Math.min(v, 5)) * 10) / 10;
}

export type SkillCell = { stars: number | null; date: string };
export type SkillPerson = { employee: string; name: string; designation: string; map: string; cells: Record<string, SkillCell>; lastEval: string; trainings: number };
export type SkillColumn = { skill: string; holders: number; avg: number | null };
export type SkillsMatrix = { people: SkillPerson[]; skills: SkillColumn[]; withoutMap: { employee: string; name: string }[]; population: number };

/** Active employees (optionally of one designation) × skills recorded in their Employee Skill Map. */
export function skillsMatrix(maps: Row[], employees: Row[], designation = ""): SkillsMatrix {
  const pop = employees.filter((e) => s(e.status || "Active") === "Active" && (!designation || s(e.designation) === designation));
  const byEmp = new Map(maps.map((m) => [s(m.employee), m]));
  const people: SkillPerson[] = []; const withoutMap: { employee: string; name: string }[] = [];
  for (const e of pop) {
    const m = byEmp.get(s(e.name)); const name = s(e.employee_name) || s(e.name);
    if (!m) { withoutMap.push({ employee: s(e.name), name }); continue; }
    const cells: Record<string, SkillCell> = {};
    for (const r of (Array.isArray(m.employee_skills) ? m.employee_skills : []) as Row[]) {
      const k = s(r.skill); if (!k) continue;
      const prev = cells[k];
      if (!prev || s(r.evaluation_date) > prev.date) cells[k] = { stars: stars(r.proficiency), date: s(r.evaluation_date) };
    }
    const lastEval = Object.values(cells).reduce((a, c) => (c.date > a ? c.date : a), "");
    people.push({ employee: s(e.name), name, designation: s(e.designation), map: s(m.name), cells, lastEval, trainings: (Array.isArray(m.trainings) ? m.trainings : []).length });
  }
  const all = [...new Set(people.flatMap((p) => Object.keys(p.cells)))];
  const skills = all.map((skill) => {
    const rated = people.map((p) => p.cells[skill]?.stars).filter((v): v is number => typeof v === "number");
    return { skill, holders: people.filter((p) => p.cells[skill]).length, avg: rated.length ? Math.round((rated.reduce((a, b) => a + b, 0) / rated.length) * 10) / 10 : null };
  }).sort((a, b) => b.holders - a.holders || a.skill.localeCompare(b.skill));
  people.sort((a, b) => a.name.localeCompare(b.name));
  return { people, skills, withoutMap, population: pop.length };
}
