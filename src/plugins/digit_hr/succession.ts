/**
 * 02.5 succession register over the app-owned DIGIT Succession Plan (V8 proposed extension: position → successor with
 * recorded readiness and risk of loss). Readiness and risk are shown exactly as recorded — never inferred from scores.
 * Pure helpers take PRE-SCOPED rows; the write path re-checks scope and validation.
 */
import { adapter, type Doc } from "@/lib/adapter";
import { cachedMeta } from "@/lib/catalog";
import { assertScoped, scopedGet } from "@/plugins/digit_hr/compat/scope";
import "@/lib/naming"; // registers the format: autoname used by DIGIT DocTypes
import { saveHrRecord } from "@/plugins/digit_hr/compat/drafts";

type Row = Record<string, unknown>;
const s = (v: unknown) => (v == null ? "" : String(v));

export const READINESS = ["Ready Now", "1-2 Years", "3+ Years"] as const;
export const RISK = ["Low", "Medium", "High"] as const;

export type SuccessionRow = {
  plan: string; position: string; positionTitle: string; designation: string; company: string;
  incumbent: string; incumbentName: string; successor: string; successorName: string;
  readiness: string; risk: string; score: number | null; notes: string;
};

/** One row per succession plan, joined to its position and the successor's latest submitted appraisal score (if any). */
export function successionRegister(plans: Row[], positions: Row[], emps: Row[], scores: Map<string, number>): SuccessionRow[] {
  const pos = new Map(positions.map((p) => [s(p["name"]), p]));
  const emp = new Map(emps.map((e) => [s(e["name"]), e]));
  const nm = (id: string) => s(emp.get(id)?.["employee_name"]) || id;
  return plans.filter((p) => Number(p["docstatus"] ?? 0) !== 2).map((p) => {
    const ps = pos.get(s(p["position"])); const incumbent = s(ps?.["incumbent"]); const successor = s(p["successor"]);
    return {
      plan: s(p["name"]), position: s(p["position"]), positionTitle: s(ps?.["position_title"]) || s(p["position"]),
      designation: s(ps?.["designation"]), company: s(ps?.["company"]),
      incumbent, incumbentName: incumbent ? nm(incumbent) : "",
      successor, successorName: s(p["successor_name"]) || nm(successor),
      readiness: s(p["readiness"]), risk: s(p["risk_of_loss"]),
      score: scores.has(successor) ? scores.get(successor)! : null, notes: s(p["development_notes"]),
    };
  }).sort((a, b) => a.positionTitle.localeCompare(b.positionTitle) || READINESS.indexOf(a.readiness as never) - READINESS.indexOf(b.readiness as never));
}

export type Coverage = { filled: number; covered: number; readyNow: number; uncovered: { position: string; title: string; incumbent: string }[]; byReadiness: Record<string, number> };

/** Filled positions (status Filled with an incumbent) that have at least one successor, and those without any. Facts only. */
export function successionCoverage(positions: Row[], plans: Row[]): Coverage {
  const live = plans.filter((p) => Number(p["docstatus"] ?? 0) !== 2);
  const filled = positions.filter((p) => s(p["position_status"]) === "Filled" && s(p["incumbent"]));
  const withPlan = new Set(live.map((p) => s(p["position"])));
  const readyPos = new Set(live.filter((p) => s(p["readiness"]) === "Ready Now").map((p) => s(p["position"])));
  const byReadiness: Record<string, number> = Object.fromEntries(READINESS.map((r) => [r, 0]));
  for (const p of live) if (s(p["readiness"]) in byReadiness) byReadiness[s(p["readiness"])]! += 1;
  return {
    filled: filled.length,
    covered: filled.filter((p) => withPlan.has(s(p["name"]))).length,
    readyNow: filled.filter((p) => readyPos.has(s(p["name"]))).length,
    uncovered: filled.filter((p) => !withPlan.has(s(p["name"]))).map((p) => ({ position: s(p["name"]), title: s(p["position_title"]) || s(p["name"]), incumbent: s(p["incumbent"]) })),
    byReadiness,
  };
}

export type SuccessorInput = { position: string; successor: string; readiness: string; risk: string; notes?: string };

/** Validation for a new succession entry (pre-scoped plans/positions). */
export function successorErrors(inp: SuccessorInput, plans: Row[], positions: Row[]): string[] {
  const errs: string[] = [];
  const pos = positions.find((p) => s(p["name"]) === inp.position);
  if (!inp.position) errs.push("Position is required");
  else if (!pos) errs.push(`Position ${inp.position} is not available`);
  else if (["Closed", "Frozen"].includes(s(pos["position_status"]))) errs.push(`Position ${inp.position} is ${s(pos["position_status"])}`);
  if (!inp.successor) errs.push("Successor is required");
  else if (pos && s(pos["incumbent"]) === inp.successor) errs.push("The incumbent cannot be their own successor");
  if (inp.readiness && !READINESS.includes(inp.readiness as never)) errs.push("Readiness must be Ready Now, 1-2 Years or 3+ Years");
  if (inp.risk && !RISK.includes(inp.risk as never)) errs.push("Risk of loss must be Low, Medium or High");
  if (inp.position && inp.successor && plans.some((p) => Number(p["docstatus"] ?? 0) !== 2 && s(p["position"]) === inp.position && s(p["successor"]) === inp.successor))
    errs.push(`${inp.successor} is already a successor for ${inp.position}`);
  return errs;
}

/** Create one DIGIT Succession Plan through the canonical adapter after scoped create checks. */
export function addSuccessor(inp: SuccessorInput, plans: Row[], positions: Row[]): Doc {
  const errs = successorErrors(inp, plans, positions);
  if (errs.length) throw new Error(errs.join("; "));
  const meta = cachedMeta("DIGIT Succession Plan"); if (!meta) throw new Error("DIGIT Succession Plan metadata unavailable");
  if (!scopedGet("DIGIT Position", inp.position)) throw new Error("Position unavailable or not permitted");
  const emp = scopedGet("Employee", inp.successor); if (!emp) throw new Error("Employee unavailable or not permitted");
  const fields = { position: inp.position, successor: inp.successor, successor_name: s(emp["employee_name"]), readiness: inp.readiness || READINESS[0], risk_of_loss: inp.risk || RISK[0], ...(inp.notes?.trim() ? { development_notes: inp.notes.trim() } : {}) };
  assertScoped(meta.name, "create", { name: "", doctype: meta.name, ...fields });
  return saveHrRecord(meta, fields);
}
