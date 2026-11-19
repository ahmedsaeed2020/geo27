/**
 * NB-2 appraisal cycle completion (02.3): appraisees (Appraisal Cycle.appraisees) → their Appraisal → submission,
 * feedback and goals. Pure; reads already-scoped rows. Scores are shown as recorded (final_score, 0–5 in HRMS); no
 * rating bands, calibration or pay outcome is derived.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- adapter rows are untyped JSON documents
type Row = any;
const s = (v: unknown) => (v == null ? "" : String(v));
const live = (r: Row) => Number(r?.docstatus ?? 0) !== 2;

export type AppraiseeStage = "not-started" | "draft" | "submitted";
export type AppraiseeRow = { employee: string; name: string; department: string; appraisal: string; stage: AppraiseeStage; score: number | null; feedback: number; goals: number; goalProgress: number | null };
export type CycleCompletion = { rows: AppraiseeRow[]; outside: { employee: string; appraisal: string }[]; started: number; submitted: number; pct: number; histogram: number[]; scored: number };

export function cycleCompletion(cycle: Row, appraisals: Row[], feedback: Row[], goals: Row[]): CycleCompletion {
  const name = s(cycle?.name);
  const mine = appraisals.filter((a) => live(a) && s(a.appraisal_cycle) === name);
  const appraisees = (Array.isArray(cycle?.appraisees) ? cycle.appraisees : []) as Row[];
  const listed = new Set(appraisees.map((r) => s(r.employee)));
  const rows: AppraiseeRow[] = appraisees.filter((r) => s(r.employee)).map((r) => {
    const emp = s(r.employee);
    const a = mine.find((x) => s(x.employee) === emp);
    const g = goals.filter((x) => s(x.appraisal_cycle) === name && s(x.employee) === emp && !Number(x.is_group || 0));
    const prog = g.map((x) => Number(x.progress)).filter((v) => Number.isFinite(v));
    const scoreRaw = a && Number(a.docstatus) === 1 && a.final_score !== undefined && a.final_score !== null && a.final_score !== "" ? Number(a.final_score) : null;
    return {
      employee: emp, name: s(r.employee_name) || emp, department: s(r.department),
      appraisal: a ? s(a.name) : "", stage: !a ? "not-started" : Number(a.docstatus) === 1 ? "submitted" : "draft",
      score: scoreRaw !== null && Number.isFinite(scoreRaw) ? scoreRaw : null,
      feedback: feedback.filter((f) => live(f) && s(f.appraisal_cycle) === name && s(f.employee) === emp).length,
      goals: g.length, goalProgress: prog.length ? Math.round(prog.reduce((x, y) => x + y, 0) / prog.length) : null,
    };
  });
  const outside = mine.filter((a) => !listed.has(s(a.employee))).map((a) => ({ employee: s(a.employee), appraisal: s(a.name) }));
  const submitted = rows.filter((r) => r.stage === "submitted").length;
  const histogram = [0, 0, 0, 0, 0];
  for (const r of rows) if (r.score !== null) histogram[Math.min(4, Math.max(0, Math.floor(r.score === 5 ? 4 : r.score)))]! += 1;
  return { rows, outside, started: rows.filter((r) => r.stage !== "not-started").length, submitted, pct: rows.length ? Math.round((submitted / rows.length) * 100) : 0, histogram, scored: rows.filter((r) => r.score !== null).length };
}
