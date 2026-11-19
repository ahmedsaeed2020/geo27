import { VISIT_DT } from "@/plugins/digit_fsm/schema";
/**
 * Visit facts for the Operations Center, Visits Portfolio, Visit 360 and technician performance — derived at read time
 * from canonical records only (no cache, no stored copy):
 *   lead technician  = Reserved FSM Booking with booking_role "Lead" for the visit → FSM Technician → native Employee;
 *                      falls back to Maintenance Visit.technician ("Lead Technician" Link); otherwise NOT assigned (never invented).
 *   team             = every Reserved booking of the visit (distinct technicians).
 *   arrival          = Maintenance Visit.arrived_on vs Maintenance Visit.scheduled_start; a missing timestamp is "unrecorded", never late.
 *   late (overdue)   = visit still Planned / Dispatched / On Site after its scheduled_end (or start when no end).
 *   runs / findings  = FSM Inspection Run.visit = visit; FSM Deficiency.source_run in those runs (one finding counted once).
 * Visit counts are per visit: team members, results and findings are attached, never joined, so nothing multiplies.
 */
import type { Doc } from "@/lib/adapter";
import { list, raw } from "./data";
import { nowIso, OPEN_DEFICIENCY, s } from "./rules";

export const OPEN_VISIT_STATES = ["Planned", "Dispatched", "On Site"] as const;
export const VISIT_STATES = ["Unscheduled", "Planned", "Dispatched", "On Site", "Completed", "Cancelled"] as const;
export type Arrival = "on_time" | "late" | "not_arrived" | "unrecorded" | "unscheduled" | "cancelled";

const norm = (v: unknown) => s(v).replace("T", " ").slice(0, 16);
const ms = (v: unknown) => { const n = norm(v); return n ? Date.parse(n.replace(" ", "T")) : NaN; };

export interface Person { technician: string; name: string; employee: string; employee_name: string; via: "booking" | "visit_field" }
export interface VisitFacts {
  visit: Doc; lead?: Person | undefined; team: Person[]; arrival: Arrival; late_min?: number | undefined; overdue: boolean;
  runs: Doc[]; findings: Doc[]; open_findings: number; results: { pass: number; fail: number; other: number };
}

export function person(technician: unknown, via: Person["via"]): Person | undefined {
  const t = raw("FSM Technician", technician); if (!t) return undefined;
  const e = raw("Employee", t["employee"]);
  return { technician: t.name, name: s(t["technician_name"]), employee: s(t["employee"]), employee_name: s(e?.["employee_name"]), via };
}

/** Index once per render: bookings by visit, runs by visit, findings by run. */
export function visitIndex() {
  const bookings = new Map<string, Doc[]>(); for (const b of list("FSM Booking")) { if (s(b["status"]) === "Cancelled") continue; const k = s(b["visit"]); if (!k) continue; (bookings.get(k) ?? bookings.set(k, []).get(k)!).push(b); }
  const runs = new Map<string, Doc[]>(); for (const r of list("FSM Inspection Run")) { const k = s(r["visit"]); if (!k) continue; (runs.get(k) ?? runs.set(k, []).get(k)!).push(r); }
  const finds = new Map<string, Doc[]>(); for (const d of list("FSM Deficiency")) { const k = s(d["source_run"]); if (!k) continue; (finds.get(k) ?? finds.set(k, []).get(k)!).push(d); }
  return { bookings, runs, finds };
}
export type VisitIndex = ReturnType<typeof visitIndex>;

export function arrivalOf(v: Doc, now = nowIso()): { arrival: Arrival; late_min?: number | undefined; overdue: boolean } {
  const st = s(v["workflow_state"]);
  const start = ms(v["scheduled_start"]), end = ms(v["scheduled_end"]), arr = ms(v["arrived_on"]), t = ms(now);
  const overdue = (OPEN_VISIT_STATES as readonly string[]).includes(st) && Number.isFinite(end || start) && (Number.isFinite(end) ? end : start) < t;
  if (st === "Cancelled") return { arrival: "cancelled", overdue: false };
  if (!Number.isFinite(start)) return { arrival: "unscheduled", overdue };
  if (Number.isFinite(arr)) { const d = Math.round((arr - start) / 60000); return d > 0 ? { arrival: "late", late_min: d, overdue } : { arrival: "on_time", overdue }; }
  if (st === "Completed" || st === "On Site") return { arrival: "unrecorded", overdue };
  return { arrival: start < t ? "not_arrived" : "unrecorded", overdue };
}

export function visitFacts(v: Doc, ix: VisitIndex, now = nowIso()): VisitFacts {
  const bk = ix.bookings.get(v.name) ?? [];
  const leadB = bk.find((b) => s(b["booking_role"]) === "Lead");
  const lead = (leadB && person(leadB["technician"], "booking")) ?? person(v["technician"], "visit_field");
  const seen = new Set<string>(); const team: Person[] = [];
  for (const b of bk) { const p = person(b["technician"], "booking"); if (p && !seen.has(p.technician)) { seen.add(p.technician); team.push(p); } }
  if (lead && !seen.has(lead.technician)) team.unshift(lead);
  const runs = ix.runs.get(v.name) ?? [];
  const fset = new Map<string, Doc>(); for (const r of runs) for (const d of ix.finds.get(r.name) ?? []) fset.set(d.name, d);
  const findings = [...fset.values()];
  const results = { pass: 0, fail: 0, other: 0 };
  for (const r of runs) { const x = s(r["technical_result"]); if (x === "Pass") results.pass++; else if (x === "Fail") results.fail++; else results.other++; }
  return { visit: v, lead, team, ...arrivalOf(v, now), runs, findings, open_findings: findings.filter((d) => OPEN_DEFICIENCY.has(s(d["workflow_state"]))).length, results };
}

/**
 * Deadline class of a visit that still has to happen (Unscheduled / Planned / Dispatched / On Site); other states → undefined.
 * deadline = scheduled_end, else scheduled_start (the same rule as `overdue`): overdue = deadline passed; today = later
 * today; week = within the next 7 days; later = after that; none = no scheduled time yet. Nothing is estimated.
 */
export type DueBucket = "overdue" | "today" | "week" | "later" | "none";
export const DUE_BUCKETS: DueBucket[] = ["overdue", "today", "week", "later", "none"];
export function dueBucket(v: Doc, now = nowIso()): DueBucket | undefined {
  const st = s(v["workflow_state"]);
  if (st !== "Unscheduled" && !(OPEN_VISIT_STATES as readonly string[]).includes(st)) return undefined;
  const at = norm(v["scheduled_end"]) || norm(v["scheduled_start"]);
  const d = at ? Date.parse(at.replace(" ", "T")) : NaN;
  if (!Number.isFinite(d)) return "none";
  if (d < ms(now)) return "overdue";
  const day = at.slice(0, 10), nowDay = norm(now).slice(0, 10);
  if (day === nowDay) return "today";
  const wk = new Date(`${nowDay}T00:00:00Z`); wk.setUTCDate(wk.getUTCDate() + 7);
  return day <= wk.toISOString().slice(0, 10) ? "week" : "later";
}
/** Deadline timestamp used for ordering "next deadlines" (scheduled_end, else scheduled_start). */
export const deadlineOf = (v: Doc) => norm(v["scheduled_end"]) || norm(v["scheduled_start"]);

/** URL filters of the Visits Portfolio (the same predicate serves Operations Center cards, charts and the portfolio). */
export interface VisitFilter { state?: string; tech?: string; site?: string; job?: string; assigned?: string; arrival?: string; late?: string; due?: string; q?: string; from?: string; to?: string }
export function matchVisit(f: VisitFacts, q: VisitFilter): boolean {
  const v = f.visit;
  if (q.state && s(v["workflow_state"]) !== q.state) return false;
  if (q.site && s(v["site"]) !== q.site) return false;
  if (q.job && s(v["job"]) !== q.job) return false;
  if (q.tech && !f.team.some((p) => p.technician === q.tech) && f.lead?.technician !== q.tech) return false;
  if (q.assigned === "1" && !f.lead) return false;
  if (q.assigned === "0" && (f.lead || s(v["workflow_state"]) === "Cancelled" || s(v["workflow_state"]) === "Completed")) return false;
  if (q.arrival && f.arrival !== q.arrival) return false;
  if (q.late === "1" && !f.overdue) return false;
  if (q.due && dueBucket(v) !== q.due) return false;
  const day = s(v["scheduled_start"]).slice(0, 10);
  if (q.from && (!day || day < q.from)) return false;
  if (q.to && (!day || day > q.to)) return false;
  if (q.q) { const n = q.q.toLowerCase(); const hay = [v.name, v["job"], v["site"], f.lead?.name, f.lead?.employee].map((x) => s(x).toLowerCase()).join(" "); if (!hay.includes(n)) return false; }
  return true;
}

/** Per-technician performance from real visits: led visits, completed, on-time vs late arrivals (unrecorded excluded). */
export function technicianStats(facts: VisitFacts[]) {
  const m = new Map<string, { p: Person; led: number; open: number; completed: number; on_time: number; late: number; unrecorded: number }>();
  for (const f of facts) {
    if (!f.lead || s(f.visit["workflow_state"]) === "Cancelled") continue;
    const k = f.lead.technician; const r = m.get(k) ?? { p: f.lead, led: 0, open: 0, completed: 0, on_time: 0, late: 0, unrecorded: 0 }; m.set(k, r);
    r.led++; const st = s(f.visit["workflow_state"]);
    if (st === "Completed") r.completed++; else if ((OPEN_VISIT_STATES as readonly string[]).includes(st)) r.open++;
    if (f.arrival === "on_time") r.on_time++; else if (f.arrival === "late") r.late++; else if (f.arrival === "unrecorded" && (st === "Completed" || st === "On Site")) r.unrecorded++;
  }
  return [...m.values()].map((r) => ({ ...r, on_time_rate: r.on_time + r.late ? r.on_time / (r.on_time + r.late) : null }));
}
