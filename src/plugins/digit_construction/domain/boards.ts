/**
 * Resource board read models (owner 2026-11-16 ideas 1–4) over the stored site records — nothing is stored or posted:
 *  - crewWeek: row per crew, column per day of the week (Sunday first; the Saudi work week is Sunday–Thursday), each
 *    cell the crew's attendance sheet of that day grouped by crew role, overtime per person, and the labour estimate
 *    (hours × the classification planning rate when the row has one — the laborCost basis — otherwise the member's
 *    planned daily cost ÷ the standard day; overtime × the rate's factor, 1.5 until set) against the crew's planned day.
 *  - machineWeek: row per machine, column per day: used hours of the available hours per machine-day (the Utilisation
 *    card basis: Construction Settings, 8 until set), the tasks the hours went to, idle / downtime and the booking.
 *  - dayHours: one project day per person — recorded hours and overtime against the scheduled standard day.
 */
import { adapter, type Doc } from "@/lib/adapter";
import { num, r2, sumBy } from "./calc";
import { list, rows, today } from "./data";
import { constructionProjects, settings } from "./queues";
import { WORKDAY_HOURS } from "./resources";

export interface BoardScope { company?: string | undefined; project?: string | undefined }
const day = (v: unknown) => String(v ?? "").slice(0, 10);
export const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const dow = (d: string) => new Date(`${d}T00:00:00Z`).getUTCDay();
/** The Sunday on or before `d`. */
export const weekStartOf = (d: string) => addDays(d, -dow(d));
export const weekDays = (start: string) => Array.from({ length: 7 }, (_, i) => addDays(start, i));
/** Sunday–Thursday (the Saudi work week). */
export const isWorkday = (d: string) => dow(d) <= 4;
const projSet = (s: BoardScope) => new Set(constructionProjects({ company: s.company, project: s.project }).map((p) => p.name));

// ------------------------------------------------------------------ crews
export type CrewRole = "Foreman" | "Skilled" | "Operator" | "Helper" | "Other";
export const CREW_ROLES: CrewRole[] = ["Foreman", "Skilled", "Operator", "Helper", "Other"];
export interface CrewPerson { employee: string; name: string; role: CrewRole; attendance: string; hours: number; overtime: number; cost: number | null; basis: "rate" | "plan" | null }
export interface CrewCell {
  sheet: string; state: string; draft: boolean; people: CrewPerson[];
  roles: { role: CrewRole; present: number; hours: number; overtime: number }[];
  present: number; absent: number; leave: number; hours: number; overtime: number; cost: number | null; unpriced: number; planned: number;
}
export interface CrewRow { crew: string; name: string; project: string; trade: string; members: number; plannedDay: number; cells: Record<string, CrewCell> }
export interface DayTotal { day: string; hours: number; overtime: number; cost: number; planned: number; pct: number | null; sheets: number; unpriced: number }
export interface CrewWeek { start: string; days: string[]; rows: CrewRow[]; totals: DayTotal[]; week: Omit<DayTotal, "day"> }

const NO_CREW = "";
function rateOf(row: Record<string, unknown>, member: Record<string, unknown> | undefined): { rate: number | null; factor: number; basis: "rate" | "plan" | null } {
  const cl = String(row["classification"] ?? member?.["classification"] ?? ""); const lr = cl ? adapter.get("Digit Labor Rate", cl) : undefined;
  const factor = lr && lr["overtime_factor"] !== undefined && lr["overtime_factor"] !== "" ? num(lr["overtime_factor"]) : 1.5;
  if (lr && num(lr["hourly_rate"]) > 0) return { rate: num(lr["hourly_rate"]), factor, basis: "rate" };
  const plan = num(member?.["planned_daily_cost"]);
  return plan > 0 ? { rate: plan / WORKDAY_HOURS, factor, basis: "plan" } : { rate: null, factor, basis: null };
}
const roleOf = (m: Record<string, unknown> | undefined): CrewRole => { const r = String(m?.["crew_role"] ?? ""); return (CREW_ROLES as string[]).includes(r) ? (r as CrewRole) : "Other"; };

/** The latest day on or before `on` with an attendance sheet in scope (the board opens on its week), or null. */
export function latestAttendanceDay(s: BoardScope, on = today()): string | null {
  const ps = projSet(s); let best: string | null = null;
  for (const a of list("Digit Field Attendance", (x) => num(x.docstatus) !== 2 && ps.has(String(x["project"])))) { const d = day(a["attendance_date"]); if (d <= on && (!best || d > best)) best = d; }
  return best;
}

export function crewWeek(s: BoardScope, start: string): CrewWeek {
  const ps = projSet(s); const days = weekDays(start); const end = days[6]!;
  const sheets = list("Digit Field Attendance", (a) => num(a.docstatus) !== 2 && ps.has(String(a["project"])) && day(a["attendance_date"]) >= start && day(a["attendance_date"]) <= end);
  const crews = new Map<string, Doc>();
  for (const c of list("Digit Crew", (c) => ps.has(String(c["project"])) && c["status"] !== "Inactive")) crews.set(c.name, c);
  for (const a of sheets) { const cn = String(a["crew"] ?? NO_CREW); if (cn && !crews.has(cn)) { const c = adapter.get("Digit Crew", cn); if (c) crews.set(cn, c); } }
  const out = new Map<string, CrewRow>();
  const rowFor = (cn: string, project: string): CrewRow => {
    const hit = out.get(cn); if (hit) return hit;
    const c = cn ? crews.get(cn) : undefined; const ms = rows(c, "members");
    const r: CrewRow = { crew: cn, name: String(c?.["crew_name"] ?? cn), project: String(c?.["project"] ?? project), trade: String(c?.["trade"] ?? ""), members: ms.length, plannedDay: r2(sumBy(ms, (m) => num(m["planned_daily_cost"]))), cells: {} };
    out.set(cn, r); return r;
  };
  for (const c of crews.values()) rowFor(c.name, String(c["project"] ?? ""));
  for (const a of sheets) {
    const cn = String(a["crew"] ?? NO_CREW); const row = rowFor(cn, String(a["project"] ?? "")); const d = day(a["attendance_date"]);
    const members = new Map(rows(crews.get(cn), "members").map((m) => [String(m["employee"]), m]));
    const people: CrewPerson[] = rows(a, "employees").map((e) => {
      const m = members.get(String(e["employee"])); const att = String(e["attendance"] ?? ""); const on = att === "Present" || att === "Half Day";
      const h = on ? num(e["hours"]) : 0, ot = on ? num(e["overtime_hours"]) : 0; const { rate, factor, basis } = rateOf(e, m);
      return { employee: String(e["employee"] ?? ""), name: String(e["employee_name"] || m?.["employee_name"] || e["employee"] || ""), role: roleOf(m), attendance: att, hours: h, overtime: ot,
        cost: on && rate !== null ? r2(h * rate + ot * rate * factor) : on ? null : 0, basis: on ? basis : null };
    });
    const roles = CREW_ROLES.map((role) => { const p = people.filter((x) => x.role === role && (x.attendance === "Present" || x.attendance === "Half Day")); return { role, present: p.length, hours: r2(sumBy(p, (x) => x.hours)), overtime: r2(sumBy(p, (x) => x.overtime)) }; }).filter((r) => r.present > 0);
    const priced = people.filter((p) => p.cost !== null);
    const prev = row.cells[d];
    const cell: CrewCell = { sheet: a.name, state: String(a["workflow_state"] || a["status"] || ""), draft: num(a.docstatus) === 0, people, roles,
      present: people.filter((p) => p.attendance === "Present" || p.attendance === "Half Day").length, absent: people.filter((p) => p.attendance === "Absent").length, leave: people.filter((p) => p.attendance === "On Leave").length,
      hours: r2(sumBy(people, (p) => p.hours)), overtime: r2(sumBy(people, (p) => p.overtime)), cost: priced.length ? r2(sumBy(priced, (p) => p.cost ?? 0)) : null,
      unpriced: r2(sumBy(people.filter((p) => p.cost === null), (p) => p.hours + p.overtime)), planned: row.plannedDay };
    // a second sheet of the same crew and day (another shift) is added to the same cell
    row.cells[d] = prev ? { ...cell, sheet: prev.sheet, people: [...prev.people, ...people], roles: [...prev.roles, ...roles], present: prev.present + cell.present, absent: prev.absent + cell.absent, leave: prev.leave + cell.leave,
      hours: r2(prev.hours + cell.hours), overtime: r2(prev.overtime + cell.overtime), cost: prev.cost === null && cell.cost === null ? null : r2((prev.cost ?? 0) + (cell.cost ?? 0)), unpriced: r2(prev.unpriced + cell.unpriced) } : cell;
  }
  const list_ = [...out.values()].sort((a, b) => a.project.localeCompare(b.project) || a.name.localeCompare(b.name));
  const totals = days.map((d): DayTotal => {
    const cs = list_.map((r) => r.cells[d]).filter((c): c is CrewCell => !!c);
    const cost = r2(sumBy(cs, (c) => c.cost ?? 0)), planned = r2(sumBy(cs, (c) => c.planned));
    return { day: d, hours: r2(sumBy(cs, (c) => c.hours)), overtime: r2(sumBy(cs, (c) => c.overtime)), cost, planned, pct: planned > 0 && cs.some((c) => c.cost !== null) ? r2((cost / planned) * 100) : null, sheets: cs.length, unpriced: r2(sumBy(cs, (c) => c.unpriced)) };
  });
  const wc = r2(sumBy(totals, (t) => t.cost)), wp = r2(sumBy(totals, (t) => t.planned));
  return { start, days, rows: list_, totals, week: { hours: r2(sumBy(totals, (t) => t.hours)), overtime: r2(sumBy(totals, (t) => t.overtime)), cost: wc, planned: wp, pct: wp > 0 && totals.some((t) => t.pct !== null) ? r2((wc / wp) * 100) : null, sheets: sumBy(totals, (t) => t.sheets), unpriced: r2(sumBy(totals, (t) => t.unpriced)) } };
}

// ------------------------------------------------------------------ machines
export interface MachineCell { used: number; idle: number; down: number; reason: string; usage: string[]; tasks: { task: string; subject: string; hours: number }[]; booked: string; cost: number }
export interface MachineRow { machinery: string; name: string; type: string; ownership: string; project: string; supplier: string; cells: Record<string, MachineCell> }
export interface MachineDay { day: string; used: number; machines: number; capacity: number; pct: number | null; over: number }
export interface MachineWeek { start: string; days: string[]; available: number; rows: MachineRow[]; totals: MachineDay[]; week: Omit<MachineDay, "day"> }
/** Available hours per machine-day: Construction Settings, 8 until set (the Utilisation card basis). */
export const machineAvailableHours = () => num(settings()?.["machine_available_hours"]) || 8;

export function latestUsageDay(s: BoardScope, on = today()): string | null {
  const ps = projSet(s); let best: string | null = null;
  for (const u of list("Digit Machinery Usage", (x) => num(x.docstatus) !== 2 && ps.has(String(x["project"])))) { const d = day(u["usage_date"]); if (d <= on && (!best || d > best)) best = d; }
  return best;
}

export function machineWeek(s: BoardScope, start: string, available = machineAvailableHours()): MachineWeek {
  const ps = projSet(s); const days = weekDays(start); const end = days[6]!;
  const usage = list("Digit Machinery Usage", (u) => num(u.docstatus) !== 2 && ps.has(String(u["project"])) && day(u["usage_date"]) >= start && day(u["usage_date"]) <= end);
  const ids = new Set<string>([...list("Digit Machinery", (m) => ps.has(String(m["current_project"])) && m["status"] !== "Retired").map((m) => m.name), ...usage.map((u) => String(u["machinery"]))]);
  const bookings = list("Digit Equipment Assignment", (b) => b["status"] !== "Released" && ids.has(String(b["machinery"])) && String(b["from_date"] ?? "") <= end && String(b["to_date"] || "9999-12-31") >= start);
  const out: MachineRow[] = [...ids].map((id) => { const m = adapter.get("Digit Machinery", id);
    return { machinery: id, name: String(m?.["machine_name"] ?? id), type: String(m?.["machine_type"] ?? ""), ownership: String(m?.["ownership"] ?? ""), project: String(m?.["current_project"] ?? ""), supplier: String(m?.["supplier"] ?? ""), cells: {} }; });
  const byId = new Map(out.map((r) => [r.machinery, r]));
  for (const u of usage) {
    const r = byId.get(String(u["machinery"])); if (!r) continue; const d = day(u["usage_date"]);
    const c = r.cells[d] ?? { used: 0, idle: 0, down: 0, reason: "", usage: [], tasks: [], booked: "", cost: 0 };
    c.used = r2(c.used + num(u["hours"])); c.idle = r2(c.idle + num(u["idle_hours"])); c.down = r2(c.down + num(u["downtime_hours"])); c.cost = r2(c.cost + num(u["total"]));
    if (num(u["downtime_hours"]) > 0 && u["downtime_reason"] && u["downtime_reason"] !== "Not Applicable") c.reason = String(u["downtime_reason"]);
    c.usage.push(u.name);
    const t = String(u["task"] ?? ""); const ex = c.tasks.find((x) => x.task === t);
    if (ex) ex.hours = r2(ex.hours + num(u["hours"])); else c.tasks.push({ task: t, subject: t ? String(adapter.get("Task", t)?.["subject"] ?? t) : "", hours: num(u["hours"]) });
    r.cells[d] = c;
  }
  for (const r of out) for (const d of days) {
    const b = bookings.find((x) => x["machinery"] === r.machinery && String(x["from_date"] ?? "") <= d && String(x["to_date"] || "9999-12-31") >= d);
    if (b) { const c = r.cells[d] ?? { used: 0, idle: 0, down: 0, reason: "", usage: [], tasks: [], booked: "", cost: 0 }; c.booked = String(b["project"] ?? ""); r.cells[d] = c; }
  }
  out.sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name));
  const totals = days.map((d): MachineDay => {
    const cs = out.map((r) => r.cells[d]).filter((c): c is MachineCell => !!c && c.usage.length > 0);
    const used = r2(sumBy(cs, (c) => c.used)), capacity = r2(cs.length * available);
    return { day: d, used, machines: cs.length, capacity, pct: capacity > 0 ? r2((used / capacity) * 100) : null, over: cs.filter((c) => c.used > available).length };
  });
  const wu = r2(sumBy(totals, (t) => t.used)), wcap = r2(sumBy(totals, (t) => t.capacity));
  return { start, days, available, rows: out, totals, week: { used: wu, machines: sumBy(totals, (t) => t.machines), capacity: wcap, pct: wcap > 0 ? r2((wu / wcap) * 100) : null, over: sumBy(totals, (t) => t.over) } };
}

// ------------------------------------------------------------------ one day, hour by hour
export interface DayPerson { key: string; employee: string; name: string; crew: string; role: CrewRole; attendance: string; scheduled: number; hours: number; overtime: number; sheet: string; task: string }
/** Every person on the project's attendance sheets of `date`: recorded hours and overtime against the scheduled standard day. */
export function dayHours(project: string, date: string, sheet?: string): DayPerson[] {
  const out: DayPerson[] = [];
  for (const a of list("Digit Field Attendance", (x) => num(x.docstatus) !== 2 && (sheet ? x.name === sheet : x["project"] === project && day(x["attendance_date"]) === date))) {
    const c = a["crew"] ? adapter.get("Digit Crew", String(a["crew"])) : undefined; const members = new Map(rows(c, "members").map((m) => [String(m["employee"]), m]));
    rows(a, "employees").forEach((e, i) => {
      const att = String(e["attendance"] ?? ""); const on = att === "Present" || att === "Half Day";
      out.push({ key: `${a.name}:${i}`, employee: String(e["employee"] ?? ""), name: String(e["employee_name"] || e["employee"] || ""), crew: String(c?.["crew_name"] ?? a["crew"] ?? ""), role: roleOf(members.get(String(e["employee"]))), attendance: att,
        scheduled: att === "On Leave" ? 0 : WORKDAY_HOURS, hours: on ? num(e["hours"]) : 0, overtime: on ? num(e["overtime_hours"]) : 0, sheet: a.name, task: String(e["task"] ?? "") });
    });
  }
  return out;
}

/** Projects in scope with an attendance sheet on `date` (sheet order). */
export function dayHoursProjects(s: BoardScope, date: string): string[] {
  const ps = projSet(s);
  return [...new Set(list("Digit Field Attendance", (x) => num(x.docstatus) !== 2 && ps.has(String(x["project"])) && day(x["attendance_date"]) === date).map((x) => String(x["project"])))].sort();
}
