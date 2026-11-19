/**
 * Department 01 (management) read models and save rules, built for the owner test list run (spec catalog FT-01-01,
 * FT-01-04, FT-01-05, FT-01-07; decisions DEC-003 weighted revenue, DEC-004 90-day receivables, DEC-005 1–5 scale,
 * DEC-006 SOV-value weight). Figures are computed from records at read time and never stored, except the scenario and
 * risk totals the save rules derive on the document itself (same formulas in the server twin rules/construction.py
 * portfolio_scenario / risk). Every total carries the rows it sums, so a card equals its drill.
 */
import type { Doc } from "@/lib/adapter";
import { num, r2, sumBy } from "./calc";
import { contractsOf, costPosition, isSubmitted, latestForecast, list, projectCommercial, rows, today, type Ctx } from "./data";
import { exposureRows, type ExposureRow } from "./changes";
import { constructionProjects } from "./queues";

type Row = Record<string, unknown>;
const s = (v: unknown) => String(v ?? "");
const days = (a: string, b: string) => Math.round((Date.parse(a) - Date.parse(b)) / 86400000);
const strip = (v: unknown) => s(v).replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim();

// ---------------------------------------------------------------- FT-01-01 portfolio scenario
export const SCENARIO_MSG = {
  frozen: "A shared scenario is read-only; create a new revision based on it",
  probability: "Row #{0}: win probability must be between 0 and 100",
  dates: "Row #{0}: end date is before the start date",
  noProjects: "No active projects to load into the scenario",
} as const;
export const fill = (t: string, ...a: unknown[]) => t.replace(/\{(\d)\}/g, (_, i: string) => s(a[Number(i)]));
/** Scenario totals (F01-01-2, DEC-003 weighted): weighted revenue = value × probability; weighted cost = cost × probability. */
export function scenarioTotals(doc: Doc, basedOn?: Doc) {
  const lines: Row[] = rows(doc, "project_lines").map((l, i) => ({ ...l, idx: i + 1, weighted_revenue: r2((num(l["contract_value"]) * num(l["probability_pct"])) / 100) }));
  const inc = lines.filter((l) => num(l["include"]) === 1);
  const revenue = r2(sumBy(inc, (l) => num(l["weighted_revenue"])));
  const cost = r2(sumBy(inc, (l) => (num(l["budget_cost"]) * num(l["probability_pct"])) / 100));
  let run = 0;
  const months: Row[] = [...rows(doc, "cash_months")].sort((a, b) => s(a["period"]).localeCompare(s(b["period"]))).map((m, i) => { run = r2(run + num(m["inflow"]) - num(m["outflow"])); return { ...m, idx: i + 1, cumulative: run }; });
  const problems: string[] = [];
  lines.forEach((l, i) => {
    const p = num(l["probability_pct"]);
    if (p < 0 || p > 100) problems.push(fill(SCENARIO_MSG.probability, i + 1));
    if (l["start_date"] && l["end_date"] && s(l["end_date"]) < s(l["start_date"])) problems.push(fill(SCENARIO_MSG.dates, i + 1));
  });
  return {
    project_lines: lines, cash_months: months, total_revenue: revenue, total_cost: cost,
    total_margin_pct: revenue ? r2(((revenue - cost) / revenue) * 100) : 0,
    peak_negative_cash: months.length ? Math.min(...months.map((m) => num(m["cumulative"]))) : 0,
    total_proposed: r2(sumBy(inc.filter((l) => !l["project"]), (l) => num(l["weighted_revenue"]))),
    net_delta: basedOn ? r2(revenue - num(basedOn["total_revenue"])) : 0,
    problems,
  };
}
/** Lines and months loaded from the live portfolio (F01-01-1): revised contract value, EAC of the latest approved forecast (else revised budget), Cashflow Forecast Items by month. */
export function scenarioSource(ctx: Ctx = {}) {
  const ps = constructionProjects(ctx).filter((p) => s(p["status"] || "Open") === "Open");
  const lines: Row[] = ps.map((p) => {
    const c = costPosition(p.name); const fc = latestForecast(p.name);
    const eacOf = fc ? (fc["total_eac"] !== undefined && fc["total_eac"] !== null && fc["total_eac"] !== "" ? num(fc["total_eac"]) : c.eac) : null;
    return { project: p.name, include: 1, start_date: p["expected_start_date"] ?? "", end_date: p["expected_end_date"] ?? "", contract_value: projectCommercial(p.name).revised,
      budget_cost: eacOf ?? (c.budget ? c.revised : 0), probability_pct: 100 };
  });
  const names = new Set(ps.map((p) => p.name));
  const items = list("Digit Cashflow Forecast Item", (d) => names.has(s(d["project"])));
  const by = new Map<string, { inflow: number; outflow: number }>();
  for (const it of items) { const k = s(it["period"]); const m = by.get(k) ?? { inflow: 0, outflow: 0 }; if (it["direction"] === "Inflow") m.inflow += num(it["amount"]); else m.outflow += num(it["amount"]); by.set(k, m); }
  const months: Row[] = [...by.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([period, m]) => ({ period, inflow: r2(m.inflow), outflow: r2(m.outflow) }));
  return { projects: ps, lines, months, items };
}
/** RPT-N01 Portfolio Scenario Comparison: one row per scenario with its stored totals (the save rule's figures). */
export function scenarioComparison(f: Row = {}) {
  return list("Digit Portfolio Scenario", (d) => num(d.docstatus) !== 2 && (!f["company"] || d["company"] === f["company"]) && (!f["plan_year"] || num(d["plan_year"]) === num(f["plan_year"])))
    .sort((a, b) => num(a["plan_year"]) - num(b["plan_year"]) || a.name.localeCompare(b.name))
    .map((d) => ({ scenario: d.name, title: d["title"], plan_year: d["plan_year"], company: d["company"], status: d["workflow_state"], weighted_revenue: num(d["total_revenue"]), cost: num(d["total_cost"]),
      margin_pct: num(d["total_margin_pct"]), peak_negative_cash: num(d["peak_negative_cash"]), projects: rows(d, "project_lines").filter((l) => num(l["include"]) === 1).length, based_on: d["based_on"] ?? "" }));
}

// ---------------------------------------------------------------- FT-01-05 risk register
export const RISK_MSG = {
  probability: "Probability must be between 0 and 100",
  mitigation: "A mitigation plan is required to activate the risk",
  owner: "Select the risk owner before activating the risk",
  due: "Set the review date before activating the risk",
} as const;
export const RISK_OPEN = ["Open", "Active"] as const;
export const HIGH_RISK_SCORE = 15;
/** F01-05-1: score = impact × probability (1–5 scale, DEC-005); exposure = potential cost × probability %. */
export function riskFigures(doc: Doc) {
  return { risk_score: num(doc["impact_score"]) * num(doc["probability_score"]), cost_exposure: r2((num(doc["potential_cost"]) * num(doc["probability_pct"])) / 100) };
}
/** F01-05-2: what is missing before a risk may become Active. */
export function activationMissing(doc: Doc): string[] {
  const out: string[] = [];
  if (!strip(doc["mitigation"])) out.push(RISK_MSG.mitigation);
  if (!doc["owner_user"]) out.push(RISK_MSG.owner);
  if (!doc["due_date"]) out.push(RISK_MSG.due);
  return out;
}
/** RPT-N03 Risk Register rows. */
export function riskRegister(f: Row = {}) {
  const ps = new Set(constructionProjects({ company: (f["company"] as string) || undefined, project: (f["project"] as string) || undefined }).map((p) => p.name));
  return list("Digit Risk", (d) => ps.has(s(d["project"])) && (!f["status"] || d["workflow_state"] === f["status"]) && (!f["category"] || d["category"] === f["category"]))
    .sort((a, b) => num(b["risk_score"]) - num(a["risk_score"]) || a.name.localeCompare(b.name))
    .map((d) => ({ risk: d.name, title: d["title"], project: d["project"], company: d["company"], category: d["category"] ?? "", owner: d["owner_user"] ?? "", status: d["workflow_state"], score: num(d["risk_score"]),
      probability_pct: num(d["probability_pct"]), potential_cost: num(d["potential_cost"]), cost_exposure: num(d["cost_exposure"]), review_date: d["due_date"] ?? "", change_event: d["change_event"] ?? "" }));
}
/** K01-07 / K01-08 / F01-05-4: Risk Balance = remaining contingency (Contingency budget lines: revised − committed − actual) − Σ exposure of Open/Active risks. */
export function riskBalance(project: string) {
  const c = costPosition(project);
  const contingency = c.lines.filter((l) => l.category === "Contingency");
  const remaining = r2(sumBy(contingency, (l) => l.revised - l.committed - l.actual));
  const risks = list("Digit Risk", (d) => d["project"] === project && (RISK_OPEN as readonly string[]).includes(s(d["workflow_state"])));
  const exposure = r2(sumBy(risks, (r) => num(r["cost_exposure"])));
  return { project, contingencyLines: contingency, contingency: remaining, risks, exposure, balance: r2(remaining - exposure), high: risks.filter((r) => num(r["risk_score"]) >= HIGH_RISK_SCORE) };
}

// ---------------------------------------------------------------- FT-01-04 portfolio exposure
export const RECEIVABLE_AGE_DAYS = 90; // DEC-004
export interface DisputeGap { final_account: string; row: number; item: string; claimed: number; offered: number; gap: number }
export interface ProjectExposure {
  project: string; company: string; change_exposure: number; disputes_gap: number; forecast_overrun: number; receivables_90: number; total_exposure: number; contract: number; pct: number | null;
  changes: ExposureRow[]; disputes: DisputeGap[]; invoices: { invoice: string; due_date: string; age: number; outstanding: number }[]; eac: number | null; budget: number | null;
}
/** F01-04-1: four components and their sum. */
export function exposureTotal(x: { change: number; disputes: { claimed: number; offered: number }[]; eac: number | null; budget: number | null; receivables: number }) {
  const disputes = r2(sumBy(x.disputes, (d) => d.claimed - d.offered));
  const overrun = x.eac !== null && x.budget !== null ? r2(Math.max(0, x.eac - x.budget)) : 0;
  return { change: r2(x.change), disputes, overrun, receivables: r2(x.receivables), total: r2(x.change + disputes + overrun + x.receivables) };
}
export function projectExposure(project: string, on = today()): ProjectExposure {
  const p = list("Project", (d) => d.name === project)[0];
  const changes = exposureRows({ project }).filter((r) => r.scope === "In Scope");
  const fas = list("Digit Final Account", (d) => num(d.docstatus) !== 2 && (d["project"] === project || contractsOf(project).some((c) => c.name === d["contract"])));
  const disputes: DisputeGap[] = fas.flatMap((fa) => rows(fa, "disputes").map((r, i) => ({ fa, r, i }))).filter((x) => s(x.r["status"] || "Open") === "Open")
    .map(({ fa, r, i }) => ({ final_account: fa.name, row: num(r["idx"]) || i + 1, item: s(r["item"]), claimed: num(r["claimed_amount"]), offered: num(r["offered_amount"]), gap: r2(num(r["claimed_amount"]) - num(r["offered_amount"])) }));
  const invoices = list("Sales Invoice", (d) => isSubmitted(d) && d["project"] === project && num(d["outstanding_amount"]) > 0.005)
    .map((d) => { const due = s(d["due_date"] || d["posting_date"]); return { invoice: d.name, due_date: due, age: due ? days(on, due) : 0, outstanding: num(d["outstanding_amount"]) }; })
    .filter((x) => x.age > RECEIVABLE_AGE_DAYS);
  const c = costPosition(project);
  const budget = c.budget ? c.revised : null;
  const t = exposureTotal({ change: sumBy(changes, (r) => r.cost), disputes, eac: c.eac, budget, receivables: sumBy(invoices, (x) => x.outstanding) });
  const contract = projectCommercial(project).revised;
  return { project, company: s(p?.["company"]), change_exposure: t.change, disputes_gap: t.disputes, forecast_overrun: t.overrun, receivables_90: t.receivables, total_exposure: t.total, contract,
    pct: contract ? r2((t.total / contract) * 100) : null, changes, disputes, invoices, eac: c.eac, budget };
}
/** RPT-N02 Portfolio Exposure (K01-06 = Σ total_exposure of these rows). */
export function portfolioExposure(f: Row = {}) {
  const on = (f["as_of"] as string) || today();
  return constructionProjects({ company: (f["company"] as string) || undefined, project: (f["project"] as string) || undefined }).map((p) => projectExposure(p.name, on));
}

// ---------------------------------------------------------------- FT-01-07 milestones and weighted progress
export interface MilestoneRow { project: string; task: string; milestone: string; contract_milestone: number; locked_deadline: string; expected_finish: string; actual_finish: string; variance_days: number | null; status: string }
/** F01-07-1: Deadline Variance (days) = exp_end_date − digit_locked_deadline (positive = late). */
export function deadlineVariance(t: Row): number | null {
  const locked = s(t["digit_locked_deadline"]), exp = s(t["exp_end_date"]);
  return locked && exp ? days(exp, locked) : null;
}
export function milestoneRows(f: Row = {}): MilestoneRow[] {
  const ps = new Set(constructionProjects({ company: (f["company"] as string) || undefined, project: (f["project"] as string) || undefined }).map((p) => p.name));
  const only = num(f["only_contract"]) === 1;
  return list("Task", (t) => ps.has(s(t["project"])) && (num(t["is_milestone"]) === 1 || num(t["digit_contract_milestone"]) === 1) && (!only || num(t["digit_contract_milestone"]) === 1))
    .sort((a, b) => s(a["project"]).localeCompare(s(b["project"])) || s(a["exp_end_date"]).localeCompare(s(b["exp_end_date"])))
    .map((t) => {
      const v = deadlineVariance(t);
      const done = s(t["status"]) === "Completed";
      return { project: s(t["project"]), task: t.name, milestone: s(t["subject"]), contract_milestone: num(t["digit_contract_milestone"]), locked_deadline: s(t["digit_locked_deadline"]), expected_finish: s(t["exp_end_date"]),
        actual_finish: s(t["act_end_date"] || t["completed_on"]), variance_days: v, status: done ? "Completed" : v === null ? "No Locked Deadline" : v > 0 ? "Late" : "On Track" };
    });
}
/** SOV line value a task is linked to (Task.digit_sov_line → the contract's SOV line name or line key). */
export function sovValue(project: string, link: unknown): number | null {
  if (!link) return null;
  for (const c of contractsOf(project)) for (const l of rows(c, "sov_lines")) if (l["name"] === link || l["line_key"] === link) return r2(num(l["amount"]) || num(l["qty"]) * num(l["rate"]));
  return null;
}
/** F01-07-2 weighted progress (DEC-006: weight = linked SOV line value). Tasks without an SOV line are listed, not weighted; null when nothing is weighted. */
export function weightedProgress(project: string) {
  const ts = list("Task", (t) => t["project"] === project && num(t["is_group"]) !== 1);
  const rowsOut = ts.map((t) => ({ task: t.name, subject: s(t["subject"]), progress: num(t["progress"]), weight: sovValue(project, t["digit_sov_line"]) }));
  const w = rowsOut.filter((r) => r.weight !== null && r.weight > 0);
  const tw = sumBy(w, (r) => r.weight!);
  return { project, rows: rowsOut, weighted: w, unweighted: rowsOut.filter((r) => !(r.weight !== null && r.weight > 0)), pct: tw ? r2(sumBy(w, (r) => r.progress * r.weight!) / tw) : null };
}

// ---------------------------------------------------------------- FT-01-03 status cards (K01-03 … K01-05)
/** Contract Billed % = billed to date ÷ revised contract; Remaining Budget % = (revised budget − actual) ÷ revised budget; Forecast Margin % = (revised contract − EAC) ÷ revised contract. */
export function statusRatios(x: { revised: number; billed: number; budget: number | null; actual: number; eac: number | null }) {
  return {
    billedPct: x.revised ? r2((x.billed / x.revised) * 100) : null,
    remainingBudgetPct: x.budget ? r2(((x.budget - x.actual) / x.budget) * 100) : null,
    marginPct: x.revised && x.eac !== null ? r2(((x.revised - x.eac) / x.revised) * 100) : null,
  };
}
export function projectStatusCards(project: string) {
  const com = projectCommercial(project), c = costPosition(project);
  return { project, revised: com.revised, billed: com.invoicedNet, budget: c.budget ? c.revised : null, actual: c.actual, eac: c.eac, ...statusRatios({ revised: com.revised, billed: com.invoicedNet, budget: c.budget ? c.revised : null, actual: c.actual, eac: c.eac }) };
}
