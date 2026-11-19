/**
 * R18 Wave A read models (budget & forecast 06, procurement 07, resources 08) — unified onto existing DocTypes.
 * Each figure returns the rows it sums so a card and its drill always match. Nothing here posts or writes.
 *
 * - forecastDelta:        FT-06-10/11/12  line-level EAC delta between the Live snapshot and a candidate version
 * - budgetOverruns:       FT-06-04        budget lines whose committed + actual exceed revised budget
 * - budgetCheck:          FT-06-04        the same rule for a new commitment (used by the Purchase Order submit hook)
 * - longLeadItems:        FT-07-07        long-lead PO lines: late / at risk / on track
 * - equipmentUtilization: FT-08-07/08/09  operating / idle / downtime hours, utilization %, indicative charge (not posted)
 * - laborProductivity:    FT-08-04        output quantity per attended man-hour, by task and unit
 */
import { adapter, type Doc } from "@/lib/adapter";
import { num, r2, sumBy } from "./calc";
import { costPosition, isSubmitted, latestForecast, list, rows, today } from "./data";
import { constructionProjects, settings } from "./queues";

type Row = Record<string, unknown>;
const projectsIn = (project?: string) => (project ? [project] : constructionProjects().map((p) => p.name));

// ---------------------------------------------------------------- 06 forecast versions
export interface DeltaLine { line_key: string; cost_code: string; live_eac: number | null; candidate_eac: number | null; delta: number | null; live_method: string; candidate_method: string; changed: boolean }
/** Line-by-line comparison of a candidate forecast against the Live (approved) one; `changed` = method or ETC inputs differ. */
export function forecastDelta(candidate: Doc, live: Doc | undefined = latestForecast(String(candidate["project"]))): { live?: Doc | undefined; lines: DeltaLine[]; liveEac: number | null; candidateEac: number | null; delta: number | null } {
  const lv = new Map(rows(live, "lines").map((l) => [String(l["line_key"]), l]));
  const sig = (l: Row | undefined) => JSON.stringify([l?.["method"] ?? null, l?.["manual_etc"] ?? null, l?.["uncommitted_remaining"] ?? null]);
  const lines = rows(candidate, "lines").map((c): DeltaLine => {
    const k = String(c["line_key"]); const l = lv.get(k);
    const a = l?.["eac"] === null || l?.["eac"] === undefined ? null : num(l["eac"]); const b = c["eac"] === null || c["eac"] === undefined ? null : num(c["eac"]);
    return { line_key: k, cost_code: String(c["cost_code"] ?? ""), live_eac: a, candidate_eac: b, delta: a === null || b === null ? null : r2(b - a), live_method: String(l?.["method"] ?? ""), candidate_method: String(c["method"] ?? ""), changed: sig(l) !== sig(c) };
  });
  const liveEac = live?.["total_eac"] == null ? null : num(live["total_eac"]); const candidateEac = candidate["total_eac"] == null ? null : num(candidate["total_eac"]);
  return { live, lines, liveEac, candidateEac, delta: liveEac === null || candidateEac === null ? null : r2(candidateEac - liveEac) };
}
/** Working (unapproved) forecast versions the user may see: shared ones, plus private ones they authored. */
export function workingForecasts(project: string, user: string): Doc[] {
  return list("Digit Cost Forecast Snapshot", (f) => f["project"] === project && num(f.docstatus) === 0 && f["workflow_state"] === "Draft" && (f["visibility"] !== "Private" || f["owner"] === user));
}

// ---------------------------------------------------------------- 06 budget control
export interface Overrun { project: string; line_key: string; cost_code: string; description: string; revised: number; committed: number; actual: number; used: number; over: number; pct: number }
/** Budget lines where committed + actual > revised budget (approved budget only). `over` = used − revised. */
export function budgetOverruns(project?: string): Overrun[] {
  const out: Overrun[] = [];
  for (const p of projectsIn(project)) {
    const pos = costPosition(p);
    for (const l of pos.lines) {
      const used = r2(l.committed + l.actual);
      if (used > l.revised + 0.005) out.push({ project: p, line_key: l.line_key, cost_code: l.cost_code, description: l.description, revised: l.revised, committed: l.committed, actual: l.actual, used, over: r2(used - l.revised), pct: l.revised ? r2(((used - l.revised) / l.revised) * 100) : 100 });
    }
  }
  return out;
}
export interface BudgetCheckLine { cost_code: string; requested: number; revised: number | null; used: number; after: number; limit: number | null; status: "OK" | "Warn" | "Block" | "No Budget Line" }
/**
 * Budget check for new commitment amounts per cost code (FT-06-04). Owner ruling (replaces the earlier fixed
 * 3 months / 5 %): the block limit is Construction Settings `budget_block_pct` and the warning-only grace period is
 * `budget_grace_months` (months after the settings were set up); both are Finance values and stay empty until
 * Finance sets them. No limit set = warning only.
 */
/** The block tolerance in % (null = warn only): `budget_block_pct`, or null while it is empty or inside `budget_grace_months`. */
export function blockTolerance(st: Doc | undefined = settings(), on = today()): number | null {
  const raw = st?.["budget_block_pct"];
  if (raw === undefined || raw === null || raw === "") return null;
  const grace = num(st?.["budget_grace_months"]);
  if (grace > 0) {
    const from = String(st?.["creation"] ?? "").slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(from)) {
      const [y, m, d] = from.split("-").map(Number) as [number, number, number];
      if (on < new Date(Date.UTC(y, m - 1 + grace, d)).toISOString().slice(0, 10)) return null;
    }
  }
  return num(raw);
}
/** Budget key of a purchase row: its cost code, plus its category when the row names one (lines are cost code × category). */
export const budgetKey = (code: unknown, category: unknown) => (String(category ?? "") ? `${String(code ?? "")}|${String(category)}` : String(code ?? ""));
export function budgetCheck(project: string, amounts: Map<string, number>): BudgetCheckLine[] {
  const pos = costPosition(project);
  const tol = blockTolerance();
  return [...amounts.entries()].map(([code, requested]) => {
    const [cc, cat] = code.split("|") as [string, string | undefined];
    const ls = pos.lines.filter((l) => l.cost_code === cc && (!cat || l.category === cat)); const shown = cat ? `${cc} (${cat})` : cc;
    if (!ls.length) return { cost_code: shown, requested, revised: null, used: 0, after: requested, limit: null, status: "No Budget Line" as const };
    const revised = r2(sumBy(ls, (l) => l.revised)), used = r2(sumBy(ls, (l) => l.committed + l.actual)), after = r2(used + requested);
    const limit = tol === null ? null : r2(revised * (1 + tol / 100));
    const status = after <= revised + 0.005 ? "OK" : limit !== null && after > limit + 0.005 ? "Block" : "Warn";
    return { cost_code: shown, requested, revised, used, after, limit, status };
  });
}

// ---------------------------------------------------------------- 07 long-lead tracking
export interface LongLead { po: string; supplier: string; project: string; row: number; item_code: string; qty: number; received: number; schedule_date: string; required_on: string; status: "Late" | "At Risk" | "On Track"; days: number }
const days = (a: string, b: string) => Math.round((Date.parse(a) - Date.parse(b)) / 86400000);
/** Open long-lead PO lines: Late = promised date passed and not fully received; At Risk = promised after the site need date. */
export function longLeadItems(project?: string, on = today()): LongLead[] {
  const ps = new Set(projectsIn(project)); const out: LongLead[] = [];
  for (const po of list("Purchase Order", (d) => isSubmitted(d) && !["Closed", "Completed", "Cancelled"].includes(String(d["status"])))) {
    rows(po, "items").forEach((it, i) => {
      const p = String(it["project"] ?? po["project"] ?? ""); if (!(num(it["digit_long_lead"]) || num(po["digit_long_lead"])) || !ps.has(p)) return; // row flag or the PO header flag (R19 Purchase Order.digit_long_lead)
      const qty = num(it["qty"]), rec = num(it["received_qty"]); if (rec >= qty) return;
      const sd = String(it["schedule_date"] ?? po["schedule_date"] ?? ""), req = String(it["digit_required_on"] ?? "");
      const status = sd && sd < on ? "Late" : req && sd && sd > req ? "At Risk" : "On Track";
      out.push({ po: po.name, supplier: String(po["supplier"] ?? ""), project: p, row: num(it["idx"]) || i + 1, item_code: String(it["item_code"] ?? ""), qty, received: rec, schedule_date: sd, required_on: req, status, days: status === "Late" ? days(on, sd) : status === "At Risk" ? days(sd, req) : 0 });
    });
  }
  return out;
}

// ---------------------------------------------------------------- 08 equipment
export interface Utilization { machinery: string; name: string; project: string; records: Doc[]; operating: number; idle: number; downtime: number; utilization: number | null; fuel: number; charge: number }
/** Submitted usage only. Utilization = operating ÷ (operating + idle + downtime). Charge = Σ usage total (indicative estimate, never posted). */
export function equipmentUtilization(project?: string, from = "", to = "9999"): Utilization[] {
  const ps = new Set(projectsIn(project)); const by = new Map<string, Doc[]>();
  for (const u of list("Digit Machinery Usage", (x) => num(x.docstatus) === 1 && ps.has(String(x["project"])) && String(x["usage_date"]) >= from && String(x["usage_date"]) <= to)) {
    const k = `${String(u["machinery"])}|${String(u["project"])}`; by.set(k, [...(by.get(k) ?? []), u]);
  }
  return [...by.entries()].map(([k, recs]) => {
    const [m, p] = k.split("|") as [string, string];
    const op = r2(sumBy(recs, (u) => num(u["hours"]))), idle = r2(sumBy(recs, (u) => num(u["idle_hours"]))), down = r2(sumBy(recs, (u) => num(u["downtime_hours"])));
    const tot = op + idle + down;
    return { machinery: m, name: String(adapter.get("Digit Machinery", m)?.["machine_name"] ?? m), project: p, records: recs, operating: op, idle, downtime: down, utilization: tot ? r2((op / tot) * 100) : null, fuel: r2(sumBy(recs, (u) => num(u["fuel_litres"]))), charge: r2(sumBy(recs, (u) => num(u["total"]))) };
  }).sort((a, b) => a.name.localeCompare(b.name));
}

// ---------------------------------------------------------------- 08 labor productivity
export interface Productivity { project: string; task: string; uom: string; output: number; manHours: number; perHour: number | null; outputRows: Row[]; hourRows: Row[] }
/** Output = Σ qty of submitted site-activity lines (task + unit); man-hours = Σ hours of present/half-day employees on submitted attendance with the same task. */
export function laborProductivity(project?: string): Productivity[] {
  const ps = new Set(projectsIn(project)); const out = new Map<string, Productivity>();
  const key = (p: string, t: string, u: string) => `${p}|${t}|${u}`;
  for (const r of list("Digit Site Activity Report", (x) => num(x.docstatus) === 1 && ps.has(String(x["project"])))) for (const a of rows(r, "activities")) {
    if (!a["task"] || !(num(a["qty"]) > 0)) continue;
    const k = key(String(r["project"]), String(a["task"]), String(a["uom"] ?? ""));
    const e = out.get(k) ?? { project: String(r["project"]), task: String(a["task"]), uom: String(a["uom"] ?? ""), output: 0, manHours: 0, perHour: null, outputRows: [], hourRows: [] };
    e.output = r2(e.output + num(a["qty"])); e.outputRows.push({ report: r.name, ...a }); out.set(k, e);
  }
  for (const f of list("Digit Field Attendance", (x) => num(x.docstatus) === 1 && ps.has(String(x["project"])))) for (const em of rows(f, "employees")) {
    if (!em["task"] || !["Present", "Half Day"].includes(String(em["attendance"]))) continue;
    for (const e of out.values()) if (e.project === f["project"] && e.task === em["task"]) { e.manHours = r2(e.manHours + num(em["hours"])); e.hourRows.push({ attendance: f.name, ...em }); }
  }
  return [...out.values()].map((e) => ({ ...e, perHour: e.manHours ? r2(e.output / e.manHours) : null }));
}
