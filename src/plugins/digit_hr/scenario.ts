/**
 * NB-2/NB-3 headcount scenario (06.2). A what-if over live headcount per designation (hires/exits typed by the planner)
 * that can be saved only as a native Staffing Plan draft — vacancies = planned hires, current_count/current_openings from
 * live records, number_of_positions = vacancies + current_count (HRMS staffing_plan.py). Exits are never saved (a
 * Staffing Plan has no exit line) and no cost or budget is computed or written.
 */
import { adapter, type Doc } from "@/lib/adapter";
import { cachedMeta } from "@/lib/catalog";
import { assertScoped } from "@/plugins/digit_hr/compat/scope";
import "@/lib/naming"; // registers frappe autoname rules (prompt → __newname) on the adapter
import { insertHrDraft } from "@/plugins/digit_hr/compat/drafts";
import { saveDocument } from "@/lib/documentApi";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- adapter rows are untyped JSON documents
type Row = any;
const s = (v: unknown) => (v == null ? "" : String(v));
const n = (v: unknown) => Number(v || 0);
const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);

export type ScenarioBase = { designation: string; actual: number; openings: number; planned: number | null };
export type Delta = { hires: number; exits: number };

/** Live baseline for one company: active headcount and open Job Openings per designation, plus the plan in effect. */
export function scenarioBase(company: string, employees: Row[], openings: Row[], plansInEffect: Row[]): ScenarioBase[] {
  const desigs = new Set<string>();
  const actual = new Map<string, number>(); const open = new Map<string, number>(); const planned = new Map<string, number>();
  for (const e of employees) if (s(e.status || "Active") === "Active" && s(e.company) === company && s(e.designation)) { desigs.add(s(e.designation)); actual.set(s(e.designation), (actual.get(s(e.designation)) ?? 0) + 1); }
  for (const o of openings) if (s(o.status) === "Open" && s(o.company) === company && s(o.designation)) { desigs.add(s(o.designation)); open.set(s(o.designation), (open.get(s(o.designation)) ?? 0) + 1); }
  for (const p of plansInEffect) if (n(p.docstatus) !== 2 && s(p.company) === company) for (const d of (Array.isArray(p.staffing_details) ? p.staffing_details : []) as Row[]) {
    const k = s(d.designation); if (!k) continue; desigs.add(k);
    planned.set(k, (planned.get(k) ?? 0) + (n(d.number_of_positions) || n(d.vacancies) + n(d.current_count)));
  }
  return [...desigs].sort().map((designation) => ({ designation, actual: actual.get(designation) ?? 0, openings: open.get(designation) ?? 0, planned: planned.has(designation) ? planned.get(designation)! : null }));
}

export const clampDelta = (v: unknown) => { const x = Math.trunc(Number(v)); return Number.isFinite(x) && x > 0 ? Math.min(x, 9999) : 0; };
/** Projected headcount = actual + hires − exits (never below zero). */
export const projected = (b: ScenarioBase, d: Delta | undefined) => Math.max(0, b.actual + (d?.hires ?? 0) - Math.min(d?.exits ?? 0, b.actual));

export function scenarioTotals(base: ScenarioBase[], deltas: Record<string, Delta>) {
  return base.reduce((a, b) => { const d = deltas[b.designation]; return { actual: a.actual + b.actual, hires: a.hires + (d?.hires ?? 0), exits: a.exits + Math.min(d?.exits ?? 0, b.actual), projected: a.projected + projected(b, d) }; }, { actual: 0, hires: 0, exits: 0, projected: 0 });
}

export type SaveInput = { name: string; company: string; department?: string | undefined; from: string; to: string; base: ScenarioBase[]; deltas: Record<string, Delta> };

/** Validation messages (empty = valid). Overlap mirrors HRMS validate_overlap: same company + designation, overlapping dates. */
export function scenarioErrors(inp: SaveInput, existingPlans: Row[]): string[] {
  const errs: string[] = [];
  if (!inp.name.trim()) errs.push("Plan name is required");
  else if (adapter.get("Staffing Plan", inp.name.trim())) errs.push(`Staffing Plan ${inp.name.trim()} already exists`);
  if (!inp.company) errs.push("Choose one company");
  if (!isDate(inp.from) || !isDate(inp.to)) errs.push("From and to dates are required");
  else if (inp.from > inp.to) errs.push("From date must be before to date");
  const lines = inp.base.filter((b) => (inp.deltas[b.designation]?.hires ?? 0) > 0);
  if (!lines.length) errs.push("Add at least one planned hire");
  if (errs.length) return errs;
  for (const p of existingPlans) {
    if (n(p.docstatus) === 2 || s(p.company) !== inp.company) continue;
    if (!(s(p.from_date) <= inp.to && s(p.to_date) >= inp.from)) continue;
    for (const d of (Array.isArray(p.staffing_details) ? p.staffing_details : []) as Row[]) {
      if (lines.some((l) => l.designation === s(d.designation))) errs.push(`Staffing Plan ${s(p.name)} already exists for designation ${s(d.designation)} in this period`);
    }
  }
  return errs;
}

/** Save the scenario's hires as a native Staffing Plan draft (no cost, no budget). Throws with joined messages if invalid. */
export function saveScenarioAsPlan(inp: SaveInput, existingPlans: Row[]): Doc {
  const errs = scenarioErrors(inp, existingPlans);
  if (errs.length) throw new Error(errs.join(" · "));
  const meta = cachedMeta("Staffing Plan"); if (!meta) throw new Error("Staffing Plan metadata unavailable");
  const staffing_details = inp.base.filter((b) => (inp.deltas[b.designation]?.hires ?? 0) > 0).map((b) => {
    const vacancies = inp.deltas[b.designation]!.hires;
    return { designation: b.designation, vacancies, current_count: b.actual, current_openings: b.openings, number_of_positions: vacancies + b.actual };
  });
  // Staffing Plan autoname is "prompt": the user-given name travels as __newname (frappe set_new_name).
  const fields = { __newname: inp.name.trim(), company: inp.company, ...(inp.department ? { department: inp.department } : {}), from_date: inp.from, to_date: inp.to, staffing_details };
  assertScoped("Staffing Plan", "create", { name: "", doctype: "Staffing Plan", ...fields });
  // Final Core: a prompt-named draft gets its name on first save (documentApi.saveDocument → resolveFirstSaveName), so the
  // draft is created and then saved with the user-given name as the prompt answer — the same path as the native form.
  const { __newname, ...values } = fields;
  const draft = insertHrDraft(meta, values);
  const saved = saveDocument(meta, draft.name, values, { prompt: () => __newname });
  const doc = saved.errors.length || saved.cancelled ? undefined : adapter.get("Staffing Plan", saved.name);
  if (!doc || doc.name !== inp.name.trim()) { adapter.remove("Staffing Plan", draft.name); throw new Error(saved.errors.join(" · ") || `Staffing Plan ${inp.name.trim()} could not be named`); }
  return doc;
}
