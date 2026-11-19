/**
 * Pure part of the DIGIT Construction schedule engine (no write path, no documentApi import), so reports and the
 * manifest import graph can use the same read model as the Gantt. schedule.ts re-exports it and adds the reschedule write.
 *
 * DIGIT Construction schedule engine (PRJ-03 Project 360 → Execution, PRJ-04): Gantt read model, dependency
 * conflicts, approved-baseline slippage and the downstream reschedule dry-run.
 *
 * Ported from the source app's src/domain/schedule.ts (shiftDownstream / fsViolation / weightedProgress /
 * plannedPercentAt): CALENDAR days, start and end inclusive; successors move LATER only (never pulled earlier),
 * durations are kept and the root task is excluded from the move list. SF is evaluated as "successor finish ≥
 * predecessor start + lag" because this plugin's schema offers it. No critical-path marking (no such source method).
 *
 * Reads native Task (exp_start_date/exp_end_date/progress/status/is_milestone, depends_on rows as FS+0),
 * Digit Task Dependency and approved Digit Stage Planning rows (the baseline). The only write is applyReschedule:
 * native Task dates through documentApi.updateDocument (session permissions + adapter hooks), all-or-nothing.
 * Progress is physical/operational only — nothing here measures, certifies or invoices.
 */
import { num, r2 } from "./calc";
import { get, list, rows, today } from "./data";

export type DepType = "FS" | "SS" | "FF" | "SF";
export const DEP_TYPES: DepType[] = ["FS", "SS", "FF", "SF"];
export interface SchedTask { name: string; subject: string; start: string; end: string; progress: number; status: string; milestone: boolean; done: boolean; group: string; groupLabel: string }
export interface SchedEdge { predecessor: string; successor: string; type: DepType; lag: number; source: string }
export interface BaselineRow { task: string; start: string; end: string; plan: string }
export interface Move { task: string; old_start: string; old_end: string; new_start: string; new_end: string; shift: number; reason: string }
export interface Conflict { edge: SchedEdge; days: number; historical: boolean }

// ---------------------------------------------------------------- calendar (calendar days, inclusive)
const DAY = 86400000;
const ms = (s: string) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
export const isDate = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s.slice(0, 10)) && !Number.isNaN(ms(s));
export const addDays = (s: string, n: number) => new Date(ms(s) + n * DAY).toISOString().slice(0, 10);
export const daysBetween = (a: string, b: string) => Math.round((ms(b) - ms(a)) / DAY);
export const durationDays = (start: string, end: string) => daysBetween(start, end) + 1;
export const isOverdue = (t: Pick<SchedTask, "end" | "progress" | "done">, asOf: string) => !t.done && t.end < asOf && t.progress < 100;
export const isLateStart = (t: Pick<SchedTask, "start" | "progress" | "done">, asOf: string) => !t.done && t.start < asOf && t.progress === 0;

/** Linear planned % at a date (0 before start, 100 from the end date). */
export function plannedPercentAt(t: { start: string; end: string }, asOf: string) {
  if (asOf < t.start) return 0;
  if (asOf >= t.end) return 100;
  return Math.round(((daysBetween(t.start, asOf) + 1) / durationDays(t.start, t.end)) * 1000) / 10;
}
/** Duration-weighted physical progress (weight = planned calendar duration; never a cost/value weighting). */
export function weightedProgress(tasks: { start: string; end: string; progress: number }[], pick: (t: { start: string; end: string; progress: number }) => number = (t) => t.progress) {
  let w = 0, s = 0;
  for (const t of tasks) { const d = Math.max(1, durationDays(t.start, t.end)); w += d; s += d * pick(t); }
  return w ? Math.round((s / w) * 10) / 10 : 0;
}

/** Days the successor must move LATER to satisfy the edge (≤ 0 = satisfied). FS: start > pred end + lag. */
export function requiredShift(type: DepType, lag: number, pred: { start: string; end: string }, succ: { start: string; end: string }) {
  switch (type) {
    case "SS": return daysBetween(succ.start, addDays(pred.start, lag));
    case "FF": return daysBetween(succ.end, addDays(pred.end, lag));
    case "SF": return daysBetween(succ.end, addDays(pred.start, lag));
    default: return daysBetween(succ.start, addDays(pred.end, lag + 1));
  }
}

/** Current dependency violations; `historical` when both ends are already complete (shown, never actionable). */
export function dependencyConflicts(tasks: SchedTask[], edges: SchedEdge[]): Conflict[] {
  const by = new Map(tasks.map((t) => [t.name, t]));
  const out: Conflict[] = [];
  for (const e of edges) {
    const p = by.get(e.predecessor), s = by.get(e.successor); if (!p || !s) continue;
    const days = requiredShift(e.type, e.lag, p, s);
    if (days > 0) out.push({ edge: e, days, historical: p.done && s.done });
  }
  return out.sort((a, b) => Number(a.historical) - Number(b.historical) || b.days - a.days);
}

export function validateDates(start: string, end: string): string | null {
  if (!isDate(start) || !isDate(end)) return "Enter valid start and end dates (YYYY-MM-DD)";
  if (end < start) return "End date cannot be before start date";
  return null;
}

/** schedule_engine.reschedule_downstream dry run (source port): pushes successors later only, keeps durations, root excluded. */
export function shiftDownstream(tasks: SchedTask[], edges: SchedEdge[], task: string, newStart: string, newEnd: string): Move[] {
  const cur = new Map(tasks.map((t) => [t.name, { start: t.start, end: t.end }]));
  if (!cur.has(task)) return [];
  cur.set(task, { start: newStart, end: newEnd });
  const why = new Map<string, string>(); const changed = new Set<string>(); const queue = [task];
  let guard = 0;
  while (queue.length && guard++ < 10000) {
    const p = queue.shift()!; const pe = cur.get(p)!;
    for (const e of edges.filter((x) => x.predecessor === p)) {
      const s = cur.get(e.successor); if (!s) continue;
      const need = requiredShift(e.type, e.lag, pe, s);
      if (need > 0) {
        cur.set(e.successor, { start: addDays(s.start, need), end: addDays(s.end, need) });
        why.set(e.successor, `${e.type} ${p}${e.lag ? ` ${e.lag > 0 ? "+" : ""}${e.lag}d` : ""}`);
        changed.add(e.successor); queue.push(e.successor);
      }
    }
  }
  changed.delete(task);
  return tasks.filter((t) => changed.has(t.name)).map((t) => {
    const n = cur.get(t.name)!;
    return { task: t.name, old_start: t.start, old_end: t.end, new_start: n.start, new_end: n.end, shift: daysBetween(t.start, n.start), reason: why.get(t.name) ?? "" };
  });
}

// ---------------------------------------------------------------- read model over canonical records
const DONE = new Set(["Completed", "Closed"]);
export function scheduleOf(project: string) {
  const all = list("Task", (t) => t["project"] === project && t["status"] !== "Cancelled" && !num(t["is_group"]));
  const dated = all.filter((t) => isDate(t["exp_start_date"]) && isDate(t["exp_end_date"]));
  const wpLabel = new Map<string, string>();
  const tasks: SchedTask[] = dated.map((t) => {
    const wp = String(t["digit_work_package"] ?? "");
    if (wp && !wpLabel.has(wp)) wpLabel.set(wp, String(get("Digit Work Package", wp)?.["work_package_name"] ?? wp));
    const progress = Math.max(0, Math.min(100, num(t["progress"])));
    return { name: t.name, subject: String(t["subject"] ?? t.name), start: String(t["exp_start_date"]).slice(0, 10), end: String(t["exp_end_date"]).slice(0, 10), progress,
      status: String(t["status"] ?? ""), milestone: !!num(t["is_milestone"]), done: DONE.has(String(t["status"])) || progress >= 100, group: wp, groupLabel: wp ? wpLabel.get(wp)! : "" };
  }).sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end) || a.name.localeCompare(b.name));
  const names = new Set(tasks.map((t) => t.name));
  const edges: SchedEdge[] = list("Digit Task Dependency", (d) => d["project"] === project)
    .filter((d) => names.has(String(d["task"])) && names.has(String(d["predecessor"])) && d["task"] !== d["predecessor"])
    .map((d) => ({ predecessor: String(d["predecessor"]), successor: String(d["task"]), type: (DEP_TYPES.includes(d["dependency_type"] as DepType) ? d["dependency_type"] : "FS") as DepType, lag: Math.trunc(num(d["lag_days"])), source: d.name }));
  const seen = new Set(edges.map((e) => `${e.predecessor}>${e.successor}`));
  for (const t of dated) for (const r of rows(t, "depends_on")) {
    const p = String(r["task"] ?? ""); const k = `${p}>${t.name}`;
    if (p && p !== t.name && names.has(p) && !seen.has(k)) { seen.add(k); edges.push({ predecessor: p, successor: t.name, type: "FS", lag: 0, source: "Task.depends_on" }); }
  }
  // baseline = rows of APPROVED, submitted stage plans; the most recently modified plan wins per task
  const plans = list("Digit Stage Planning", (s) => s["project"] === project && num(s.docstatus) === 1 && s["workflow_state"] === "Approved")
    .sort((a, b) => String(a["modified"] ?? a["creation"] ?? "").localeCompare(String(b["modified"] ?? b["creation"] ?? "")) || a.name.localeCompare(b.name));
  const baseline = new Map<string, BaselineRow>();
  for (const s of plans) for (const r of rows(s, "stage_planning_tasks")) {
    const ps = r["planned_start"], pe = r["planned_end"];
    if (r["task"] && isDate(ps) && isDate(pe)) baseline.set(String(r["task"]), { task: String(r["task"]), start: String(ps).slice(0, 10), end: String(pe).slice(0, 10), plan: s.name });
  }
  const delays = list("Digit Stage Planning", (s) => s["project"] === project && num(s.docstatus) !== 2 && s["workflow_state"] !== "Rejected")
    .flatMap((s) => rows(s, "delay_reasons").map((r) => ({ plan: s.name, stage: String(s["stage_name"] ?? s.name), reason: String(r["reason"] ?? ""), party: String(r["responsible_party"] ?? ""), days: num(r["days_delayed"]), logged_on: String(r["logged_on"] ?? "") })));
  return { project, tasks, edges, baseline, delays, undated: all.length - dated.length, projectEnd: isDate(get("Project", project)?.["expected_end_date"]) ? String(get("Project", project)!["expected_end_date"]).slice(0, 10) : "" };
}
export type ProjectSchedule = ReturnType<typeof scheduleOf>;

export function scheduleKpis(s: ProjectSchedule, asOf = today()) {
  const ts = s.tasks;
  const slips = ts.flatMap((t) => { const b = s.baseline.get(t.name); return b ? [daysBetween(b.end, t.end)] : []; });
  const finish = ts.reduce((m, t) => (t.end > m ? t.end : m), "");
  const conflicts = dependencyConflicts(ts, s.edges);
  const byParty = new Map<string, number>();
  for (const d of s.delays) byParty.set(d.party || "—", (byParty.get(d.party || "—") ?? 0) + d.days);
  return {
    tasks: ts.length, undated: s.undated,
    planned: weightedProgress(ts, (t) => plannedPercentAt(t as { start: string; end: string }, asOf)),
    actual: weightedProgress(ts),
    overdue: ts.filter((t) => isOverdue(t, asOf)).length,
    lateStart: ts.filter((t) => isLateStart(t, asOf)).length,
    openConflicts: conflicts.filter((c) => !c.historical).length, conflicts,
    baselined: slips.length, maxSlip: slips.length ? Math.max(...slips) : null,
    finish, projectEnd: s.projectEnd, finishVariance: finish && s.projectEnd ? daysBetween(s.projectEnd, finish) : null,
    delayDays: r2(s.delays.reduce((a, d) => a + d.days, 0)), delayByParty: [...byParty.entries()].sort((a, b) => b[1] - a[1]),
  };
}

