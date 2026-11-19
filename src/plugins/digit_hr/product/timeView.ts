/**
 * Sections 03.2 / 03.3 time views (owner round H2, 2026-11-17): the day by the hour per employee (scheduled shift
 * against the recorded first IN / last OUT, late and early marks past the grace), and the weekly shift roster (row per
 * employee, column per day, hours and cost per day, overtime from the approved Overtime Slips of the week). Read models
 * over permission-scoped rows; cost appears only for a reader of salary data (permission level 1).
 */
import type { Doc } from "@/lib/adapter";
import { canReadType, scopedList } from "../compat/scope";
import { policyValue } from "./settings";
import { assignmentOf } from "./payroll";
import { sensitiveAccess } from "./people";

const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));
const n = (v: unknown) => Number(v) || 0;
const d10 = (v: unknown) => s(v).slice(0, 10);
const r2 = (x: number) => Math.round(x * 100) / 100;
const rowsOf = (dt: string) => { try { return canReadType(dt) ? scopedList(dt) : null; } catch { return null; } };
export const addDays = (iso: string, k: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + k * 864e5).toISOString().slice(0, 10);
/** "09:30:00" → 9.5 */
export const hoursOf = (v: unknown): number | null => { const m = /(\d{1,2}):(\d{2})/.exec(s(v)); return m ? Number(m[1]) + Number(m[2]) / 60 : null; };
const shiftTimes = (shift: Doc | undefined) => { const a = hoursOf(shift?.["start_time"]), b = hoursOf(shift?.["end_time"]); if (a === null || b === null) return null; return { start: a, end: b < a ? b + 24 : b }; };

/* ------------------------------------------------------------------ day by the hour (H2-05) ------------------------------------------------------------------ */
export interface DayRow { employee: string; name: string; dept: string; shift: string; sched: [number, number] | null; rec: [number, number | null]; late: number; early: number; worked: number; ins: string[] }
/** Each employee with a check-in on the day: shift window, first IN – last OUT, minutes late / early beyond the grace. */
export function dayTimeline(date: string, opts: { company?: string | undefined; deptOf: (e: Doc) => string }): { rows: DayRow[]; from: number; to: number } | null {
  const logs = rowsOf("Employee Checkin"); if (!logs) return null;
  const emps = new Map((rowsOf("Employee") ?? []).map((e) => [e.name, e]));
  const types = new Map((rowsOf("Shift Type") ?? []).map((t) => [t.name, t]));
  const next = addDays(date, 1);
  const day = logs.filter((l) => d10(l["time"]) === date || d10(l["time"]) === next);
  const by = new Map<string, Doc[]>(); for (const l of day) by.set(s(l["employee"]), [...(by.get(s(l["employee"])) ?? []), l]);
  const rows: DayRow[] = [];
  for (const [id, ls] of by) {
    const e = emps.get(id); if (!e || (opts.company && e["company"] !== opts.company)) continue;
    const todayIns = ls.filter((l) => s(l["log_type"]) === "IN" && d10(l["time"]) === date).map((l) => s(l["time"])).sort();
    const first = hoursOf(todayIns[0]?.slice(11)); if (first === null) continue;
    const shiftName = s(ls.find((l) => d10(l["time"]) === date)?.["shift"]) || s(e["default_shift"]); const st = types.get(shiftName); const t = shiftTimes(st);
    const overnight = !!t && t.end > 24;
    const outs = ls.filter((l) => s(l["log_type"]) === "OUT" && (d10(l["time"]) === date || (overnight && d10(l["time"]) === next))).map((l) => s(l["time"])).sort();
    const lastOut = outs[outs.length - 1]; const lastClock = lastOut ? hoursOf(lastOut.slice(11)) : null;
    const last = lastClock === null ? null : lastOut && d10(lastOut) === next ? lastClock + 24 : lastClock;
    const grace = (k: "late_entry_grace_period" | "early_exit_grace_period") => (n(st?.[k]) || policyValue("late_grace_minutes", date, s(e["company"])) || 15) / 60;
    const late = t && first > t.start + grace("late_entry_grace_period") ? Math.round((first - t.start) * 60) : 0;
    const early = t && last !== null && last < t.end - grace("early_exit_grace_period") ? Math.round((t.end - last) * 60) : 0;
    rows.push({ employee: id, name: s(e["employee_name"]) || id, dept: opts.deptOf(e), shift: shiftName, sched: t ? [t.start, t.end] : null, rec: [first, last], late, early, worked: last !== null ? r2(last - first) : 0, ins: ls.map((l) => l.name) });
  }
  rows.sort((a, b) => (b.late + b.early > 0 ? 1 : 0) - (a.late + a.early > 0 ? 1 : 0) || a.dept.localeCompare(b.dept) || a.name.localeCompare(b.name));
  const lo = Math.min(...rows.map((r) => Math.min(r.sched?.[0] ?? 24, r.rec[0])), 24), hi = Math.max(...rows.map((r) => Math.max(r.sched?.[1] ?? 0, r.rec[1] ?? r.rec[0])), 0);
  return { rows, from: rows.length ? Math.max(0, Math.floor(lo) - 1) : 6, to: rows.length ? Math.min(30, Math.ceil(hi) + 1) : 20 };
}
/** The latest day on or before `on` that has check-ins in scope (today's punches may not have arrived yet). */
export function lastPunchDay(on: string, company?: string): string | undefined {
  const logs = rowsOf("Employee Checkin"); if (!logs) return undefined;
  const emps = company ? new Map((rowsOf("Employee") ?? []).map((e) => [e.name, e])) : undefined;
  return logs.filter((l) => s(l["log_type"]) === "IN" && (!emps || emps.get(s(l["employee"]))?.["company"] === company)).map((l) => d10(l["time"])).filter((d) => d && d <= on).sort().pop();
}

/* ------------------------------------------------------------------ weekly roster (H2-07) ------------------------------------------------------------------ */
export interface RosterCell { kind: "shift" | "leave" | "off"; shift?: string | undefined; hours: number; ot: number; from?: number | undefined; to?: number | undefined; ref?: string | undefined }
export interface RosterRow { employee: string; name: string; dept: string; title: string; cells: Record<string, RosterCell>; hours: number; ot: number; daily: number | null; overLimit: boolean }
/** The Saudi week (Sunday first) that contains the date. */
export const weekStart = (iso: string) => { const d = new Date(`${iso}T00:00:00Z`); return addDays(iso, -d.getUTCDay()); };
function offDays(company: string, from: string, to: string): Set<string> {
  const co = (rowsOf("Company") ?? []).find((c) => c.name === company); const hl = s(co?.["default_holiday_list"]);
  const h = hl ? (rowsOf("Holiday List") ?? []).find((x) => x.name === hl) : undefined;
  const set = new Set(((h?.["holidays"] as Doc[] | undefined) ?? []).map((x) => d10(x["holiday_date"])).filter((d) => d >= from && d <= to));
  if (!h) for (let i = 0; i < 7; i++) { const d = addDays(from, i); const w = new Date(`${d}T00:00:00Z`).getUTCDay(); if (w === 5 || w === 6) set.add(d); }
  return set;
}
/** Row per employee with a shift assignment in the week: the shift on each working day (leave and rest days marked),
 *  scheduled hours, overtime of the approved Overtime Slips spread over their days, and the daily cost (base ÷ 30, overtime at the policy rate). */
export function roster(from: string, opts: { company?: string | undefined; dept?: string | undefined; deptOf: (e: Doc) => string }): { days: string[]; rows: RosterRow[]; off: Record<string, Set<string>>; costVisible: boolean; depts: { key: string; people: number }[] } | null {
  const sas = rowsOf("Shift Assignment"); if (!sas) return null;
  const days = Array.from({ length: 7 }, (_, i) => addDays(from, i)); const to = days[6]!;
  const emps = new Map((rowsOf("Employee") ?? []).map((e) => [e.name, e]));
  const types = new Map((rowsOf("Shift Type") ?? []).map((t) => [t.name, t]));
  const leave = (rowsOf("Leave Application") ?? []).filter((l) => Number(l.docstatus) === 1 && s(l["status"]) === "Approved" && d10(l["from_date"]) <= to && d10(l["to_date"]) >= from);
  const ots = (rowsOf("Overtime Slip") ?? []).filter((o) => Number(o.docstatus) === 1 && d10(o["from_date"]) <= to && d10(o["to_date"]) >= from);
  const costVisible = sensitiveAccess() && canReadType("Salary Structure Assignment");
  const offBy: Record<string, Set<string>> = {};
  const live = sas.filter((a) => Number(a.docstatus) === 1 && s(a["status"] || "Active") === "Active" && d10(a["start_date"]) <= to && (!d10(a["end_date"]) || d10(a["end_date"]) >= from));
  const by = new Map<string, Doc[]>(); for (const a of live) by.set(s(a["employee"]), [...(by.get(s(a["employee"])) ?? []), a]);
  const all: RosterRow[] = [];
  const weekLimit = policyValue("work_hours_week", from) ?? 48;
  for (const [id, list] of by) {
    const e = emps.get(id); if (!e || s(e["status"]) !== "Active" || (opts.company && e["company"] !== opts.company)) continue;
    const co = s(e["company"]); const off = offBy[co] ?? (offBy[co] = offDays(co, from, to));
    const dept = opts.deptOf(e);
    const base = costVisible ? n(assignmentOf(id, to)?.["base"]) : 0;
    const cells: Record<string, RosterCell> = {}; let hours = 0, ot = 0;
    const work = days.filter((d) => !off.has(d));
    // overtime of a slip spread evenly over its working days, the share falling inside this week
    const otPerDay = new Map<string, number>();
    for (const o of ots.filter((x) => x["employee"] === id)) { const f = d10(o["from_date"]), t2 = d10(o["to_date"]); let k = 0; for (let d = f; d <= t2; d = addDays(d, 1)) { const w = new Date(`${d}T00:00:00Z`).getUTCDay(); if (w !== 5 && w !== 6) k++; } const per = k ? n(o["total_overtime_duration"]) / 3600 / k : 0; for (const d of work) if (d >= f && d <= t2) otPerDay.set(d, (otPerDay.get(d) ?? 0) + per); }
    for (const d of days) {
      if (off.has(d)) { cells[d] = { kind: "off", hours: 0, ot: 0 }; continue; }
      const lv = leave.find((l) => l["employee"] === id && d10(l["from_date"]) <= d && d10(l["to_date"]) >= d);
      if (lv) { cells[d] = { kind: "leave", hours: 0, ot: 0, ref: lv.name }; continue; }
      const a = list.find((x) => d10(x["start_date"]) <= d && (!d10(x["end_date"]) || d10(x["end_date"]) >= d)); if (!a) continue;
      const tt = shiftTimes(types.get(s(a["shift_type"]))); const h = tt ? r2(tt.end - tt.start) : 0; const o = r2(otPerDay.get(d) ?? 0);
      cells[d] = { kind: "shift", shift: s(a["shift_type"]), hours: h, ot: o, ...(tt ? { from: tt.start, to: tt.end } : {}), ref: a.name };
      hours += h; ot += o;
    }
    if (!Object.values(cells).some((c) => c.kind !== "off")) continue;
    all.push({ employee: id, name: s(e["employee_name"]) || id, dept, title: s(e["designation"]), cells, hours: r2(hours), ot: r2(ot), daily: costVisible && base ? r2(base / 30) : costVisible ? 0 : null, overLimit: ot > 0 || hours > weekLimit });
  }
  const deptCount = new Map<string, number>(); for (const r of all) deptCount.set(r.dept, (deptCount.get(r.dept) ?? 0) + 1);
  const depts = [...deptCount].map(([key, people]) => ({ key, people })).sort((a, b) => b.people - a.people || a.key.localeCompare(b.key));
  const rows = (opts.dept ? all.filter((r) => r.dept === opts.dept) : all).sort((a, b) => Number(b.overLimit) - Number(a.overLimit) || a.dept.localeCompare(b.dept) || a.name.localeCompare(b.name));
  return { days, rows, off: offBy, costVisible, depts };
}
/** Cost of one roster day: each rostered person's daily rate (base ÷ 30) plus that day's overtime at the policy rate. */
export function rosterDayCost(rows: RosterRow[], day: string, on: string): number | null {
  if (rows.some((r) => r.daily === null)) return null;
  let t = 0;
  for (const r of rows) { const c = r.cells[day]; if (!c || c.kind !== "shift") continue; const daily = r.daily ?? 0; const hourly = daily / (policyValue("work_hours_day", on) ?? 8); t += daily + c.ot * hourly * ((policyValue("overtime_rate_pct", on) ?? 150) / 100); }
  return r2(t);
}
