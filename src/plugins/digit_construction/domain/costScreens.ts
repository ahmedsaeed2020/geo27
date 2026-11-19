/**
 * Phase 5 cost screens (department 06, Project 360 cost tab, subcontracts) — read model only. Every figure is taken from
 * costPosition (domain/data.ts) or the Subcontract Position measures, so the budget sheet, rings, EAC equation, ranked
 * list and KPI lines show the same numbers as the cost sheet and its reports. Measures stay apart: budget ≠ commitment ≠
 * actual (purchase basis) and, for subcontracts, value ≠ certified ≠ billed ≠ paid. EAC = actual + ETC, and ETC already
 * contains the open commitment (calc.ts lineEtc), so remaining budget, commitment and EAC are never added together.
 * Use levels follow Digit Construction Settings budget_warn_pct / budget_over_pct (blank or 0 = 80 / 100).
 */
import type { Doc } from "@/lib/adapter";
import { num, r2, sumBy } from "./calc";
import { approvedBudget, budgetMovements, costPosition, isSubmitted, list, rows, today } from "./data";
import { settings } from "./queues";
import { payables } from "./subcontract";

export interface Thresholds { warn: number; over: number }
/** The alert share (amber) and the limit (red) of budget use, from settings; blank / 0 = 80 % and 100 %. */
export function budgetThresholds(st: Doc | undefined = settings()): Thresholds {
  const w = num(st?.["budget_warn_pct"]), o = num(st?.["budget_over_pct"]);
  const warn = w > 0 ? w : 80; const over = o > 0 ? o : 100;
  return { warn, over: Math.max(over, warn) };
}
export type Level = "ok" | "warn" | "over" | "none";
export const usedPct = (used: number, budget: number): number | null => (budget > 0 ? r2((used / budget) * 100) : null);
/** Green below the alert share, amber from it, red past the limit; a row with spend but no budget is red, an empty row has no level. */
export function useLevel(used: number, budget: number, th: Thresholds = budgetThresholds()): Level {
  if (!(budget > 0)) return used > 0.005 ? "over" : "none";
  const p = (used / budget) * 100;
  return p > th.over + 1e-9 ? "over" : p >= th.warn ? "warn" : "ok";
}

export interface SheetLine { key: string; cost_code: string; description: string; category: string; budget: number; committed: number; actual: number; used: number; remaining: number; pct: number | null; level: Level; unallocated: boolean; projects: string[] }
export interface Sheet { lines: SheetLine[]; total: SheetLine; thresholds: Thresholds; projects: string[]; hasBudget: boolean }
const mk = (key: string, cost_code: string, description: string, category: string, budget: number, committed: number, actual: number, unallocated: boolean, projects: string[], th: Thresholds): SheetLine => {
  const used = r2(committed + actual);
  return { key, cost_code, description, category, budget: r2(budget), committed: r2(committed), actual: r2(actual), used, remaining: r2(budget - used), pct: usedPct(used, budget), level: useLevel(used, budget, th), unallocated, projects };
};
/**
 * Budget sheet: per budget line of one project (cost code × category), or per cost code across several projects;
 * cost not on an approved line stays as its own unallocated row. The total equals costPosition revised / committed / actual.
 */
export function budgetSheet(project: string | string[], asOf?: string): Sheet {
  const th = budgetThresholds();
  const ps = Array.isArray(project) ? project : [project];
  const pos = ps.map((p) => ({ p, c: costPosition(p, asOf) }));
  const lines: SheetLine[] = [];
  if (ps.length === 1) {
    const { p, c } = pos[0]!;
    for (const l of c.lines) lines.push(mk(l.line_key, l.cost_code, l.description, l.category, l.revised, l.committed, l.actual, false, [p], th));
    for (const u of c.unallocated) lines.push(mk(`U-${u.code}`, u.code, "", "", 0, u.committed, u.actual, true, [p], th));
  } else {
    const by = new Map<string, { code: string; desc: string; cats: Set<string>; b: number; c: number; a: number; un: boolean; ps: Set<string> }>();
    const add = (k: string, code: string, desc: string, cat: string, b: number, c: number, a: number, un: boolean, p: string) => {
      const x = by.get(k) ?? { code, desc, cats: new Set<string>(), b: 0, c: 0, a: 0, un, ps: new Set<string>() };
      if (!x.desc && desc) x.desc = desc; if (cat) x.cats.add(cat); x.b += b; x.c += c; x.a += a; x.ps.add(p); by.set(k, x);
    };
    for (const { p, c } of pos) {
      for (const l of c.lines) add(l.cost_code, l.cost_code, l.description, l.category, l.revised, l.committed, l.actual, false, p);
      for (const u of c.unallocated) add(`U-${u.code}`, u.code, "", "", 0, u.committed, u.actual, true, p);
    }
    for (const [k, x] of by) lines.push(mk(k, x.code, x.desc, [...x.cats].join(" · "), x.b, x.c, x.a, x.un, [...x.ps], th));
    lines.sort((a, b) => Number(a.unallocated) - Number(b.unallocated) || a.cost_code.localeCompare(b.cost_code));
  }
  const total = mk("total", "", "", "", sumBy(pos, (x) => x.c.revised), sumBy(pos, (x) => x.c.committed), sumBy(pos, (x) => x.c.actual), false, ps, th);
  return { lines, total, thresholds: th, projects: ps, hasBudget: pos.some((x) => !!x.c.budget) };
}
/** Cost codes ranked by committed + actual (largest first), each against its own budget. */
export function costCodeRank(project: string | string[], asOf?: string): SheetLine[] {
  return [...budgetSheet(project, asOf).lines].filter((l) => l.used > 0.005 || l.budget > 0).sort((a, b) => b.used - a.used || b.budget - a.budget || a.cost_code.localeCompare(b.cost_code));
}

/** Parts of the remaining ring / bar of a sheet total: actual, open commitment, what is left, and any overrun (never summed with EAC). */
export function remainingParts(t: SheetLine) {
  const over = r2(Math.max(0, t.used - t.budget)), left = r2(Math.max(0, t.remaining));
  return { actual: t.actual, committed: t.committed, left, over };
}

/** EAC equation of one project or several: actual + ETC (open commitment included) = EAC; VAC = revised budget − EAC. */
export interface Equation { actual: number; etc: number | null; eac: number | null; committed: number; uncommitted: number | null; revised: number; vac: number | null; hasBudget: boolean; forecasts: string[] }
export function eacEquation(project: string | string[], asOf?: string): Equation {
  const ps = Array.isArray(project) ? project : [project];
  const cs = ps.map((p) => costPosition(p, asOf));
  const known = cs.every((c) => c.etc !== null);
  const etc = known ? r2(sumBy(cs, (c) => num(c.etc))) : null;
  const actual = r2(sumBy(cs, (c) => c.actual)), committed = r2(sumBy(cs, (c) => c.committed)), revised = r2(sumBy(cs, (c) => c.revised));
  const eac = etc === null ? null : r2(actual + etc);
  const hasBudget = cs.some((c) => !!c.budget);
  return { actual, etc, eac, committed, uncommitted: etc === null ? null : r2(etc - committed), revised, vac: eac === null || !hasBudget ? null : r2(revised - eac), hasBudget, forecasts: cs.map((c) => c.forecast?.name).filter(Boolean) as string[] };
}

/* ------------------------------------------------------------------ 12-period forecast strip ------------------------------------------------------------------ */
export type PeriodState = "approved" | "draft" | "none";
/** The `n` monthly periods (YYYY-MM) ending with the month of `on`, oldest first. */
export function periodsEnding(on: string = today(), n = 12): string[] {
  const y = Number(on.slice(0, 4)), m = Number(on.slice(5, 7));
  return Array.from({ length: n }, (_, i) => { const k = y * 12 + (m - 1) - (n - 1 - i); return `${Math.floor(k / 12)}-${String((k % 12) + 1).padStart(2, "0")}`; });
}
const APPROVED = new Set(["Approved", "Superseded"]);
/** Period of a forecast snapshot: its period field, else its cut-off month. */
export const forecastPeriod = (f: Doc) => String(f["period"] || String(f["cutoff_date"] ?? "").slice(0, 7));
/**
 * One cell per period: green when a forecast of that period was approved (Approved, or Superseded by a later approval),
 * amber when one is still a draft, grey when none was started. Cancelled snapshots are ignored.
 */
export function forecastStrip(project: string, on: string = today(), n = 12): { period: string; state: PeriodState; docs: string[] }[] {
  const fs = list("Digit Cost Forecast Snapshot", (f) => f["project"] === project && num(f.docstatus) !== 2 && f["workflow_state"] !== "Cancelled");
  return periodsEnding(on, n).map((period) => {
    const mine = fs.filter((f) => forecastPeriod(f) === period);
    const ok = mine.filter((f) => isSubmitted(f) && APPROVED.has(String(f["workflow_state"])));
    const state: PeriodState = ok.length ? "approved" : mine.length ? "draft" : "none";
    return { period, state, docs: (ok.length ? ok : mine).map((f) => f.name) };
  });
}

/* ------------------------------------------------------------------ subcontract remaining ------------------------------------------------------------------ */
export interface SubPosition { work_order: string; subcontractor: string; project: string; state: string; value: number; certified: number; billed: number; retention: number; paid: number; remaining: number; pct: number | null; level: Level }
/**
 * Per submitted work order (not cancelled): value, certified measurement, billed gross, retention and paid — the same
 * measures as the Subcontract Position report — with remaining to spend = value − billed gross.
 */
export function subcontractPositions(projects: string[]): SubPosition[] {
  const th = budgetThresholds(); const ps = new Set(projects);
  return list("Digit Subcontract Work Order", (w) => ps.has(String(w["project"])) && isSubmitted(w) && w["workflow_state"] !== "Cancelled").map((w) => {
    const books = list("Digit Measurement Book", (b) => b["work_order"] === w.name); const bills = list("Digit Subcontractor Bill", (b) => b["work_order"] === w.name && isSubmitted(b));
    const pis = bills.map((b) => list("Purchase Invoice", (p) => p.name === b["purchase_invoice"] && isSubmitted(p))[0]).filter(Boolean) as Doc[];
    const value = r2(num(w["total_value"])), billed = r2(sumBy(bills, (b) => num(b["gross_amount"])));
    return { work_order: w.name, subcontractor: String(w["subcontractor"] ?? ""), project: String(w["project"] ?? ""), state: String(w["workflow_state"] ?? ""), value,
      certified: r2(sumBy(books.filter((b) => b["workflow_state"] === "Certified"), (b) => num(b["accepted_value"]))), billed, retention: r2(sumBy(bills, (b) => num(b["retention_amount"]))),
      paid: payables(pis).paid, remaining: r2(value - billed), pct: usedPct(billed, value), level: useLevel(billed, value, th) };
  }).sort((a, b) => b.value - a.value || a.work_order.localeCompare(b.work_order));
}

/* ------------------------------------------------------------------ K06 cost cards (07_reports_and_kpis K06-01 … K06-04) ------------------------------------------------------------------ */
/**
 * Budget revisions of the projects: net approved deltas (K06-01: the submitted revisions of each approved budget — the
 * same set costPosition adds into the revised budget) and deltas still in Draft / Submitted (K06-02).
 */
export function revisionDeltas(projects: string[]) {
  const ps = new Set(projects);
  const delta = (r: Doc) => sumBy(rows(r, "deltas"), (d) => num(d["delta_amount"]));
  const approved = projects.flatMap((p) => { const b = approvedBudget(p); return b ? budgetMovements(b).revs : []; });
  const pending = list("Digit Budget Revision", (r) => ps.has(String(r["project"])) && num(r.docstatus) === 0 && ["Draft", "Submitted", ""].includes(String(r["workflow_state"] ?? "")));
  const original = r2(sumBy(projects, (p) => costPosition(p).original)), revised = r2(sumBy(projects, (p) => costPosition(p).revised));
  return { approved: r2(sumBy(approved, delta)), approvedDocs: approved.map((r) => r.name), pending: r2(sumBy(pending, delta)), pendingDocs: pending.map((r) => r.name), original, revised };
}
/** Budget lines whose committed + actual exceed the revised line budget (K06-03) and the amount over (K06-04). */
export function overrunLines(projects: string[], asOf?: string) {
  const ls = projects.flatMap((p) => costPosition(p, asOf).lines.map((l) => ({ ...l, project: p })));
  const over = ls.filter((l) => l.committed + l.actual > l.revised + 0.005);
  return { lines: ls.length, over: over.length, amount: r2(sumBy(over, (l) => l.committed + l.actual - l.revised)), overBudget: r2(sumBy(over, (l) => l.revised)), rows: over };
}
