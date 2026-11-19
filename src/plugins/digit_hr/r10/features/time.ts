/**
 * Round-2 time and leave: ATT-01 phone check-in with geofence (direction decided on the server from the last move of
 * the day, repeats inside the window refused, outside the branch radius refused, offline replays idempotent by client
 * key), TIM-01 timecard approval in batches, SCH-01 roster grid saved in one batch with leave-conflict warnings,
 * SCH-04 availability vs preferences, SCH-05 coverage vs rule and roster cost, LEV-07 approved leave → On Leave
 * attendance, LEV-08 leave policy simulator (reads the rules, writes nothing). Saudi weekend Fri/Sat unless the
 * employee's holiday list says otherwise.
 */
import { adapter, type Doc } from "@/lib/adapter";
import { currentUser } from "@/lib/session";
import { submit } from "@/lib/posting";
import { scopedList, scopedGet } from "../../compat/scope";
import { policyValue } from "../../product/settings";
import { lockOn } from "../../product/payroll";
import { createDoc, guarded, ok, fail, s, n, d10, todayISO, nowISO, addDays, daysBetween, type ActionResult } from "../write";

const list = (dt: string, user = currentUser()): Doc[] => { try { return scopedList(dt, user); } catch { return []; } };
const r2 = (x: number) => Math.round(x * 100) / 100;
export function datesBetween(from: string, to: string): string[] { const out: string[] = []; for (let d = from; d <= to && out.length < 400; d = addDays(d, 1)) out.push(d); return out; }
const weekday = (iso: string) => new Date(`${iso}T00:00:00Z`).getUTCDay(); // 0 Sun … 5 Fri 6 Sat
const WD = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export function isWorkingDay(emp: Doc | undefined, iso: string): boolean {
  const hl = s(emp?.["holiday_list"]) && adapter.get("Holiday List", s(emp?.["holiday_list"]));
  if (hl) return !((hl["holidays"] as Doc[] | undefined) ?? []).some((h) => d10(h["holiday_date"]) === iso);
  return weekday(iso) !== 5 && weekday(iso) !== 6;
}

/* ------------------------------------------------------------------ ATT-01 geofenced check-in */
export function distanceM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000, rad = (x: number) => x * Math.PI / 180;
  const dLat = rad(lat2 - lat1), dLon = rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(a)));
}
export interface CheckinInput { employee: string; latitude: number; longitude: number; time?: string; clientKey?: string; offline?: boolean }
export function checkin(inp: CheckinInput, user = currentUser()): ActionResult & { log_type?: "IN" | "OUT"; duplicate?: boolean } {
  return guarded(() => {
    const e = scopedGet("Employee", inp.employee, user); if (!e) return fail("Employee not found or not permitted.", "الموظف غير موجود أو غير مسموح.");
    const t = (inp.time ?? nowISO()).slice(0, 19).replace("T", " "); const day = t.slice(0, 10);
    if (inp.clientKey) { const prev = adapter.list("Employee Checkin").find((c) => c["digit_client_key"] === inp.clientKey); if (prev) return { ...ok("Already recorded (same device event).", "سُجلت مسبقًا (نفس حدث الجهاز)."), log_type: prev["log_type"] as "IN" | "OUT", duplicate: true }; }
    const br = adapter.get("Branch", s(e["branch"]));
    const radius = n(br?.["radius_m"]) || (policyValue("geofence_radius_m", day, s(e["company"])) ?? 200);
    let dist = -1;
    if (br && br["latitude"] !== undefined && br["latitude"] !== "" && br["longitude"] !== undefined && br["longitude"] !== "") {
      dist = distanceM(inp.latitude, inp.longitude, n(br["latitude"]), n(br["longitude"]));
      if (dist > radius) {
        adapter.insertDoc("DIGIT Geo Sync Exception", { employee: e.name, employee_name: e["employee_name"], company: e["company"], event_time: t, reason: `Outside the ${s(e["branch"])} area: ${dist} m (limit ${radius} m)`, status: "Open" });
        return fail(`You are ${dist} m from ${s(e["branch"])}; check-in is allowed within ${radius} m.`, `أنت على بعد ${dist} م من ${s(e["branch"])}؛ التسجيل مسموح ضمن ${radius} م.`);
      }
    }
    const today = adapter.list("Employee Checkin").filter((c) => c["employee"] === e.name && s(c["time"]).slice(0, 10) === day).sort((a, b) => s(a["time"]).localeCompare(s(b["time"])));
    const last = today[today.length - 1];
    const repeat = policyValue("checkin_repeat_seconds", day) ?? 60;
    if (last && Math.abs(Date.parse(t.replace(" ", "T") + "Z") - Date.parse(s(last["time"]).replace(" ", "T") + "Z")) < repeat * 1000) return { ...ok("Already recorded a moment ago.", "سُجلت قبل لحظات."), log_type: last["log_type"] as "IN" | "OUT", duplicate: true };
    const log_type: "IN" | "OUT" = last && last["log_type"] === "IN" ? "OUT" : "IN";
    const d = adapter.insertDoc("Employee Checkin", { employee: e.name, employee_name: e["employee_name"], log_type, time: t, latitude: inp.latitude, longitude: inp.longitude, geolocation: JSON.stringify({ type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [inp.longitude, inp.latitude] } }] }), device_id: "DIGIT mobile", digit_distance_m: dist < 0 ? "" : dist, digit_geofence: s(e["branch"]), digit_client_key: inp.clientKey ?? "" });
    adapter.insertDoc("DIGIT Geo Event Receipt", { employee: e.name, employee_name: e["employee_name"], company: e["company"], event_time: t, log_type, latitude: inp.latitude, longitude: inp.longitude, client_key: inp.clientKey ?? "", received_on: nowISO(), checkin: d.name, offline: inp.offline ? 1 : 0 });
    return { ...ok(log_type === "IN" ? "Checked in." : "Checked out.", log_type === "IN" ? "سُجل الحضور." : "سُجل الانصراف.", { created: [["Employee Checkin", d.name]] }), log_type };
  });
}

/* ------------------------------------------------------------------ TIM-01 timecard approval */
export interface TimecardRow { employee: string; employee_name: string; days_present: number; hours: number; overtime_hours: number; drafts: string[] }
export function timecards(company: string, from: string, to: string, user = currentUser()): TimecardRow[] {
  const std = policyValue("work_hours_day", from, company) ?? 8;
  const g = new Map<string, TimecardRow>();
  for (const a of list("Attendance", user).filter((x) => x["company"] === company && Number(x.docstatus) !== 2 && d10(x["attendance_date"]) >= from && d10(x["attendance_date"]) <= to)) {
    const k = s(a["employee"]); const r = g.get(k) ?? { employee: k, employee_name: s(a["employee_name"]), days_present: 0, hours: 0, overtime_hours: 0, drafts: [] };
    if (["Present", "Work From Home", "Half Day"].includes(s(a["status"]))) { r.days_present += s(a["status"]) === "Half Day" ? 0.5 : 1; const h = n(a["working_hours"]) || (s(a["status"]) === "Half Day" ? std / 2 : std); r.hours = r2(r.hours + h); r.overtime_hours = r2(r.overtime_hours + Math.max(0, h - std)); }
    if (Number(a.docstatus) === 0) r.drafts.push(a.name);
    g.set(k, r);
  }
  return [...g.values()].sort((a, b) => a.employee_name.localeCompare(b.employee_name));
}
/** Approve (submit the draft attendance) or reject a batch of timecards; one DIGIT Time Approval Batch records each decision. */
export function decideTimecards(company: string, from: string, to: string, employees: string[], decision: "Approved" | "Rejected", user = currentUser()): ActionResult {
  return guarded(() => {
    const limit = policyValue("bulk_atomic_limit", todayISO()) ?? 50;
    if (employees.length > limit) return fail(`At most ${limit} timecards per batch.`, `حد أقصى ${limit} بطاقة في الدفعة.`);
    const rows = timecards(company, from, to, user).filter((r) => employees.includes(r.employee));
    if (!rows.length) return fail("No timecards in this period for the chosen employees.", "لا بطاقات وقت في هذه الفترة للموظفين المختارين.");
    const errors: string[] = []; let submitted = 0;
    if (decision === "Approved") for (const r of rows) for (const nm of r.drafts) { const e = submit("Attendance", nm); if (e.length) errors.push(`${nm}: ${e[0]}`); else submitted++; }
    const b = createDoc("DIGIT Time Approval Batch", { company, from_date: from, to_date: to, status: decision, approved_by: user, items: rows.map((r, i) => ({ idx: i + 1, employee: r.employee, employee_name: r.employee_name, days_present: r.days_present, hours: r.hours, overtime_hours: r.overtime_hours, decision })) }, user);
    return ok(`${rows.length} timecard(s) ${decision.toLowerCase()}; ${submitted} attendance day(s) submitted.`, `${rows.length} بطاقة ${decision === "Approved" ? "اعتُمدت" : "رُفضت"}؛ اعتُمد ${submitted} يوم حضور.`, { created: [["DIGIT Time Approval Batch", b.name]], errors });
  });
}

/* ------------------------------------------------------------------ SCH-01 roster */
export interface RosterCell { date: string; shift?: string; leave?: string; holiday?: boolean; conflict?: string }
export function rosterGrid(company: string, from: string, to: string, employees?: string[], user = currentUser()): { days: string[]; rows: { employee: string; employee_name: string; cells: RosterCell[] }[] } {
  const days = datesBetween(from, to);
  const emps = list("Employee", user).filter((e) => e["company"] === company && s(e["status"]) === "Active" && (!employees || employees.includes(e.name))).slice(0, 200);
  const sa = list("Shift Assignment", user).filter((x) => Number(x.docstatus) !== 2 && s(x["status"]) !== "Inactive");
  const lv = list("Leave Application", user).filter((x) => Number(x.docstatus) !== 2 && ["Approved", "Open"].includes(s(x["status"])));
  return { days, rows: emps.map((e) => ({ employee: e.name, employee_name: s(e["employee_name"]), cells: days.map((d) => {
    const a = sa.find((x) => x["employee"] === e.name && d10(x["start_date"]) <= d && (!d10(x["end_date"]) || d10(x["end_date"]) >= d));
    const l = lv.find((x) => x["employee"] === e.name && d10(x["from_date"]) <= d && d10(x["to_date"]) >= d);
    return { date: d, ...(a ? { shift: s(a["shift_type"]) } : {}), ...(l ? { leave: s(l["leave_type"]) } : {}), ...(!isWorkingDay(e, d) ? { holiday: true } : {}), ...(a && l ? { conflict: "Shift on a leave day" } : {}) };
  }) })) };
}
/** Plan shifts for many employees and days in one save: consecutive days become one Shift Assignment (start → end). */
export function saveRoster(company: string, plan: { employee: string; shift_type: string; dates: string[] }[], user = currentUser()): ActionResult & { warnings?: string[] } {
  return guarded(() => {
    const warnings: string[] = []; const created: [string, string][] = [];
    const lv = adapter.list("Leave Application").filter((x) => Number(x.docstatus) !== 2 && ["Approved", "Open"].includes(s(x["status"])));
    const existing = adapter.list("Shift Assignment").filter((x) => Number(x.docstatus) !== 2 && s(x["status"]) !== "Inactive");
    const ops: { employee: string; shift_type: string; start: string; end: string }[] = [];
    for (const p of plan) {
      const e = scopedGet("Employee", p.employee, user); if (!e || e["company"] !== company) { warnings.push(`${p.employee}: not in your scope or another company`); continue; }
      if (!adapter.get("Shift Type", p.shift_type)) { warnings.push(`${p.shift_type}: shift type not found`); continue; }
      const dates = [...new Set(p.dates)].sort().filter((d) => {
        if (existing.some((x) => x["employee"] === p.employee && d10(x["start_date"]) <= d && (!d10(x["end_date"]) || d10(x["end_date"]) >= d))) { warnings.push(`${s(e["employee_name"])} ${d}: already has a shift`); return false; }
        const l = lv.find((x) => x["employee"] === p.employee && d10(x["from_date"]) <= d && d10(x["to_date"]) >= d);
        if (l) warnings.push(`${s(e["employee_name"])} ${d}: on ${s(l["leave_type"])} (${l.name})`);
        return true;
      });
      let start = "", prev = "";
      for (const d of dates) { if (start && addDays(prev, 1) === d) { prev = d; continue; } if (start) ops.push({ employee: p.employee, shift_type: p.shift_type, start, end: prev }); start = d; prev = d; }
      if (start) ops.push({ employee: p.employee, shift_type: p.shift_type, start, end: prev });
    }
    adapter.batch(() => { for (const o of ops) { const e = adapter.get("Employee", o.employee)!; const d = adapter.insertDoc("Shift Assignment", { employee: o.employee, employee_name: e["employee_name"], company, department: e["department"], shift_type: o.shift_type, start_date: o.start, end_date: o.end, status: "Active", docstatus: 0 }); created.push(["Shift Assignment", d.name]); } });
    return { ...ok(`${created.length} shift assignment(s) saved for ${new Set(ops.map((o) => o.employee)).size} employee(s).`, `حُفظت ${created.length} مناوبة لـ ${new Set(ops.map((o) => o.employee)).size} موظف.`, { created }), warnings };
  });
}

/* ------------------------------------------------------------------ SCH-04 availability vs preferences */
export function availabilityIssues(company: string, from: string, to: string, user = currentUser()): { employee: string; employee_name: string; date: string; issue: string }[] {
  const grid = rosterGrid(company, from, to, undefined, user); const av = list("DIGIT Work Availability", user);
  const out: { employee: string; employee_name: string; date: string; issue: string }[] = [];
  for (const r of grid.rows) {
    const mine = av.filter((a) => a["employee"] === r.employee);
    let weekHours = 0; let week = "";
    for (const c of r.cells) {
      if (!c.shift) continue;
      const wd = WD[weekday(c.date)]!; const a = mine.find((x) => x["weekday"] === wd);
      if (a && Number(a["available"] ?? 1) === 0) out.push({ employee: r.employee, employee_name: r.employee_name, date: c.date, issue: `Not available on ${wd}` });
      else if (a && s(a["preferred_shift"]) && s(a["preferred_shift"]) !== c.shift) out.push({ employee: r.employee, employee_name: r.employee_name, date: c.date, issue: `Prefers ${s(a["preferred_shift"])}, planned ${c.shift}` });
      const wk = addDays(c.date, -weekday(c.date)); if (wk !== week) { week = wk; weekHours = 0; }
      const st = adapter.get("Shift Type", c.shift); weekHours += shiftHours(st);
      const max = n(mine.find((x) => n(x["max_hours"]) > 0)?.["max_hours"]);
      if (max && weekHours > max) out.push({ employee: r.employee, employee_name: r.employee_name, date: c.date, issue: `Above ${max} weekly hours (${r2(weekHours)})` });
    }
  }
  return out;
}
export function shiftHours(st: Doc | undefined): number {
  if (!st) return policyValue("work_hours_day", todayISO()) ?? 8;
  const t = (v: unknown) => { const [h, m] = s(v).split(":").map(Number); return (h ?? 0) + (m ?? 0) / 60; };
  const a = t(st["start_time"]), b = t(st["end_time"]); return r2(b > a ? b - a : b + 24 - a) || 8;
}

/* ------------------------------------------------------------------ SCH-05 coverage + cost */
export function coverage(company: string, from: string, to: string, branch?: string, user = currentUser()): { rows: { date: string; shift_type: string; required: number; planned: number; gap: number; hours: number; cost: number }[]; totals: { required: number; planned: number; gap: number; cost: number } } {
  const rules = list("DIGIT Coverage Rule", user).filter((r) => r["company"] === company && (!branch || !s(r["branch"]) || r["branch"] === branch));
  const sa = list("Shift Assignment", user).filter((x) => x["company"] === company && Number(x.docstatus) !== 2 && s(x["status"]) !== "Inactive");
  const emps = new Map(list("Employee", user).map((e) => [e.name, e]));
  const ssa = adapter.list("Salary Structure Assignment").filter((x) => Number(x.docstatus) !== 2);
  const hourly = (emp: string, d: string) => { const a = ssa.filter((x) => x["employee"] === emp && d10(x["from_date"]) <= d).sort((x, y) => d10(y["from_date"]).localeCompare(d10(x["from_date"])))[0]; return a ? n(a["base"]) / 30 / (policyValue("work_hours_day", d, company) ?? 8) : 0; };
  const rows: { date: string; shift_type: string; required: number; planned: number; gap: number; hours: number; cost: number }[] = [];
  for (const d of datesBetween(from, to)) {
    const wd = WD[weekday(d)]!;
    const types = new Set([...rules.filter((r) => !s(r["weekday"]) || r["weekday"] === wd).map((r) => s(r["shift_type"])), ...sa.filter((x) => d10(x["start_date"]) <= d && (!d10(x["end_date"]) || d10(x["end_date"]) >= d)).map((x) => s(x["shift_type"]))]);
    for (const t of types) {
      const rule = rules.find((r) => r["shift_type"] === t && (!s(r["weekday"]) || r["weekday"] === wd));
      const on = sa.filter((x) => x["shift_type"] === t && d10(x["start_date"]) <= d && (!d10(x["end_date"]) || d10(x["end_date"]) >= d) && (!branch || s(emps.get(s(x["employee"]))?.["branch"]) === branch));
      const h = shiftHours(adapter.get("Shift Type", t));
      const cost = r2(on.reduce((a, x) => a + (n(rule?.["hourly_cost"]) || hourly(s(x["employee"]), d)) * h, 0));
      const req = n(rule?.["required_headcount"]);
      rows.push({ date: d, shift_type: t, required: req, planned: on.length, gap: on.length - req, hours: r2(on.length * h), cost });
    }
  }
  return { rows, totals: { required: rows.reduce((a, r) => a + r.required, 0), planned: rows.reduce((a, r) => a + r.planned, 0), gap: rows.reduce((a, r) => a + Math.min(0, r.gap), 0), cost: r2(rows.reduce((a, r) => a + r.cost, 0)) } };
}

/* ------------------------------------------------------------------ LEV-07 leave feeds the timecard */
/** Approved, submitted leave → one On Leave Attendance per working day (existing days are never overwritten). */
export function leaveToAttendance(leave: Doc): string[] {
  if (Number(leave.docstatus) !== 1 || s(leave["status"]) !== "Approved") return [];
  const emp = adapter.get("Employee", s(leave["employee"])); const made: string[] = [];
  const have = new Set(adapter.list("Attendance").filter((a) => a["employee"] === leave["employee"] && Number(a.docstatus) !== 2).map((a) => d10(a["attendance_date"])));
  for (const d of datesBetween(d10(leave["from_date"]), d10(leave["to_date"]))) {
    if (have.has(d) || !isWorkingDay(emp, d) || lockOn(s(leave["company"] ?? emp?.["company"]), d)) continue; // a locked payroll period is never rewritten
    const a = adapter.insertDoc("Attendance", { employee: leave["employee"], employee_name: leave["employee_name"], company: leave["company"], department: leave["department"] ?? emp?.["department"], attendance_date: d, status: "On Leave", leave_type: leave["leave_type"], leave_application: leave.name, docstatus: 1 });
    made.push(a.name);
  }
  return made;
}

/* ------------------------------------------------------------------ LEV-08 leave policy simulator */
export interface LeaveSim { leave_type: string; entitled: number; taken: number; balance: number; basis: string }
const SAUDI: Record<string, (yrs: number, co: string, on: string) => [number, string]> = {
  "Annual Leave": (y, co, on) => { const base = y >= 5 ? (policyValue("annual_leave_days_after_5y", on, co) ?? 30) : (policyValue("annual_leave_days", on, co) ?? 21); return [base, `${base} days a year (${y >= 5 ? "5+ years of service" : "under 5 years"}, Labour Law art. 109)`]; },
  "Sick Leave": (_y, co, on) => { const a = policyValue("sick_full_days", on, co) ?? 30, b = policyValue("sick_75_days", on, co) ?? 60, c = policyValue("sick_unpaid_days", on, co) ?? 30; return [a + b + c, `${a} full pay + ${b} at 75% + ${c} unpaid a year (art. 117)`]; },
  "Hajj Leave": (y, co, on) => { const d = policyValue("hajj_days", on, co) ?? 10; return y >= 2 ? [d, `${d} days once, after 2 years of service (art. 114)`] : [0, "Eligible after 2 years of service (art. 114)"]; },
  "Marriage Leave": (_y, co, on) => { const d = policyValue("marriage_days", on, co) ?? 5; return [d, `${d} days (art. 113)`]; },
  "Bereavement Leave": (_y, co, on) => { const d = policyValue("bereavement_days", on, co) ?? 5; return [d, `${d} days (art. 113)`]; },
  "Paternity Leave": (_y, co, on) => { const d = policyValue("paternity_days", on, co) ?? 3; return [d, `${d} days (art. 113)`]; },
  "Maternity Leave": (_y, co, on) => { const w = policyValue("maternity_weeks", on, co) ?? 12; return [w * 7, `${w} weeks (art. 151)`]; },
};
export const SIM_TYPES = Object.keys(SAUDI);
/** What-if: years of service (actual or the given one) and leave type → entitlement, taken this year, balance. No write. */
export function simulateLeave(employee: string, asOf: string, leaveType?: string, yearsOverride?: number, user = currentUser()): LeaveSim[] {
  const e = scopedGet("Employee", employee, user); if (!e) return [];
  const yrs = yearsOverride ?? Math.floor(Math.max(0, daysBetween(d10(e["date_of_joining"]) || asOf, asOf)) / 365.25);
  const y0 = `${asOf.slice(0, 4)}-01-01`;
  return (leaveType ? [leaveType] : SIM_TYPES).filter((t) => SAUDI[t]).map((t) => {
    const [ent, basis] = SAUDI[t]!(yrs, s(e["company"]), asOf);
    const prorate = t === "Annual Leave" && d10(e["date_of_joining"]) > y0 ? Math.round(ent * (daysBetween(d10(e["date_of_joining"]), `${asOf.slice(0, 4)}-12-31`) + 1) / 365 * 2) / 2 : ent;
    const taken = adapter.list("Leave Application").filter((l) => l["employee"] === employee && l["leave_type"] === t && Number(l.docstatus) === 1 && s(l["status"]) === "Approved" && d10(l["from_date"]) >= y0 && d10(l["from_date"]) <= asOf).reduce((a, l) => a + n(l["total_leave_days"]), 0);
    return { leave_type: t, entitled: prorate, taken, balance: r2(prorate - taken), basis: prorate !== ent ? `${basis}; prorated from the joining date` : basis };
  });
}
