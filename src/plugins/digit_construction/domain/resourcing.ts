/**
 * Department 08 resources (owner test list, FT-08-01 … FT-08-14): the save rules the resource hooks apply and the read
 * models behind the resources reports. Server twin: rules/resourcing.py (same messages). Nothing here posts: hours,
 * charge-out and cost splits are indicators (DEC-267 / 285 / 288); only native documents post (site expense journal, P7).
 *
 * - usageRule:        DEC-266 / 268 one usage record per machine, project and day; F08-08-2 fuel cost = litres × machine
 *                     fuel rate, litres per operating hour, anomaly above 1.5 × the machine's own average
 * - attendanceRule:   F08-13-1 not-inducted warning (non-blocking note), DEC-252 only active employees are approved,
 *                     DEC-254 one employee is never on two approved sheets of different projects on the same day and shift
 * - assignmentRule:   DEC-262 / 269 a booking is activated by a project manager or director other than its author
 * - permitRule:       F08-13-2 all precautions checked, valid at most 12 hours, issued by the project's safety team member
 * - expenseRule:      DEC-274 a receipt is attached before the expense is submitted
 * - machineryRule:    DEC-261 an owned machine carries its serial number
 * - read models:      dailyLoad (F08-02), maintenanceDue (F08-08-1), costSplit (F08-12-1, DEC-277 remainder to the last
 *                     line), expenseAging (DEC-274, 7 days), attendanceHours (F08-14-1 card rows)
 */
import { adapter, type Doc } from "@/lib/adapter";
import { currentUser, userRoles } from "@/lib/session";
import { daysBetween, num, r2, sumBy } from "./calc";
import { list, rows, today } from "./data";
import { constructionProjects } from "./queues";
import { WORKDAY_HOURS } from "./resources";

type Row = Record<string, unknown>;
const s = (v: unknown) => (v === undefined || v === null ? "" : String(v));
export const fill = (t: string, ...a: unknown[]) => a.reduce<string>((o, v, i) => o.split(`{${i}}`).join(String(v)), t);
const became = (doc: Row, before: Row | undefined, f: string, v: string) => s(doc[f]) === v && s(before?.[f]) !== v;
const r4 = (n: number) => Math.round((n + Number.EPSILON) * 10000) / 10000;
const PRESENT = ["Present", "Half Day"];
export const APPROVER_ROLES = ["Digit Project Manager", "Digit Director", "System Manager"];
const privileged = (user: string, roles: string[]) => user === "Administrator" || roles.some((r) => APPROVER_ROLES.includes(r));

export const RES_MSG = {
  usageDup: "A usage record already exists for {0} on project {1} on {2} ({3})",
  inactive: "Row {0}: {1} is not an active employee; only active employees can be approved",
  overlap: "{0} is already on approved attendance {1} of project {2} on {3} ({4} shift)",
  notInducted: "Not inducted on this site: {0}",
  assignRole: "Only a project manager or director activates an equipment booking, not {0}",
  assignSelf: "The equipment booking must be activated by someone other than its author ({0})",
  permitNone: "Add the permit precautions before issuing it",
  permitCheck: "Precaution {0} is not checked; every precaution is verified before the permit is issued",
  permitPeriod: "Set Valid From and a later Valid To before issuing the permit",
  permitHours: "A work permit cannot be valid for more than 12 hours ({0} hours requested)",
  permitNoIssuer: "Select the issuer: the project's safety (HSE) team member",
  permitIssuer: "The permit is issued by the project's safety (HSE) team member; {0} is not one",
  receipt: "Attach the receipt before submitting the expense",
  serial: "Enter the serial number of an owned machine",
  fillState: "Fill from crew works on a draft attendance sheet only",
  fillCrew: "Select the crew first",
  fillRole: "Only the site engineer or project manager fills attendance, not {0}",
  fillNothing: "Every crew member is already on the sheet",
  vatTemplate: "No purchase tax template is set for company {0} (policy P9); the VAT-inclusive expense journal is not created",
  sheetMissing: "Attendance sheet not found",
  maintDone: "Enter the work date before closing the maintenance order",
  maintMeter: "Enter the meter reading of a preventive maintenance order before closing it",
  maintNegative: "Downtime hours and cost cannot be negative",
  maintNextDue: "The next due date must be after the work date",
  maintApprover: "Only a project manager or director approves a maintenance order, not {0}",
  inductionDates: "Valid Until must be on or after the induction date",
  inductionApprover: "Only a project manager or director approves a site induction, not {0}",
} as const;
export const PERMIT_MAX_HOURS = 12;
export const WORKDAY = WORKDAY_HOURS;
export const FUEL_ANOMALY_FACTOR = 1.5;
export const EXPENSE_AGING_DAYS = 7;

// ---------------------------------------------------------------- FT-08-07 / 08-08 machinery usage
/** Litres per operating hour of the machine's other submitted usage records (null when none). */
export function fuelAverage(machinery: string, except = ""): number | null {
  const xs = list("Digit Machinery Usage", (u) => u.name !== except && u["machinery"] === machinery && num(u.docstatus) === 1 && num(u["fuel_litres"]) > 0 && num(u["hours"]) > 0);
  return xs.length ? sumBy(xs, (u) => num(u["fuel_litres"]) / num(u["hours"])) / xs.length : null;
}
export function usageRule(doc: Row): { patch: Row; errors: string[] } {
  const e: string[] = []; const patch: Row = {};
  const m = s(doc["machinery"]), p = s(doc["project"]), d = s(doc["usage_date"]);
  if (m && p && d) {
    const dup = list("Digit Machinery Usage", (u) => u.name !== doc["name"] && u["machinery"] === m && u["project"] === p && s(u["usage_date"]) === d && num(u.docstatus) !== 2)[0];
    if (dup) e.push(fill(RES_MSG.usageDup, m, p, d, dup.name));
  }
  const litres = num(doc["fuel_litres"]), hours = num(doc["hours"]);
  const rate = num(adapter.get("Digit Machinery", m)?.["fuel_rate"]);
  if (litres > 0 && rate > 0) patch["fuel_cost"] = r2(litres * rate);
  const per = litres > 0 && hours > 0 ? r2(litres / hours) : 0;
  const avg = per ? fuelAverage(m, s(doc["name"])) : null;
  patch["fuel_per_hour"] = per;
  patch["fuel_anomaly"] = avg !== null && avg > 0 && per > FUEL_ANOMALY_FACTOR * avg + 1e-9 ? 1 : 0;
  return { patch, errors: e };
}

// ---------------------------------------------------------------- FT-08-03 / 08-13 attendance
export function inducted(project: string, employee: string, on: string): boolean {
  return list("Digit Site Induction", (x) => x["project"] === project && x["employee"] === employee && !["Pending", "Rejected"].includes(s(x["approval_status"]))
    && (!s(x["inducted_on"]) || s(x["inducted_on"]).slice(0, 10) <= on) && (!s(x["valid_until"]) || s(x["valid_until"]).slice(0, 10) >= on)).length > 0;
}
const shiftOf = (d: Row) => s(d["shift"]) || "Day";
export function attendanceRule(doc: Row, before: Row | undefined): { patch: Row; errors: string[] } {
  const e: string[] = []; const p = s(doc["project"]), on = s(doc["attendance_date"]).slice(0, 10);
  const present = rows(doc as Doc, "employees").map((r, i) => ({ r, i: num(r["idx"]) || i + 1 })).filter((x) => PRESENT.includes(s(x.r["attendance"])) && s(x.r["employee"]));
  const missing = p && on ? present.map((x) => s(x.r["employee"])).filter((emp) => !inducted(p, emp, on)) : [];
  const patch: Row = { induction_note: missing.length ? fill(RES_MSG.notInducted, missing.join(", ")) : "" };
  if (became(doc, before, "workflow_state", "Approved")) {
    for (const x of present) {
      const emp = adapter.get("Employee", s(x.r["employee"]));
      if (!emp || (s(emp["status"]) && s(emp["status"]) !== "Active")) e.push(fill(RES_MSG.inactive, x.i, s(x.r["employee"])));
    }
    const others = list("Digit Field Attendance", (a) => a.name !== doc["name"] && s(a["attendance_date"]).slice(0, 10) === on && a["project"] !== p && s(a["workflow_state"]) === "Approved" && num(a.docstatus) !== 2 && shiftOf(a) === shiftOf(doc));
    for (const x of present) {
      const o = others.find((a) => rows(a, "employees").some((r) => r["employee"] === x.r["employee"] && PRESENT.includes(s(r["attendance"]))));
      if (o) e.push(fill(RES_MSG.overlap, s(x.r["employee"]), o.name, s(o["project"]), on, shiftOf(doc)));
    }
  }
  return { patch, errors: e };
}

// ---------------------------------------------------------------- FT-08-06 equipment booking approval
export function assignmentRule(doc: Row, before: Row | undefined): string[] {
  if (!before || s(before["status"]) === "Active" || s(doc["status"]) !== "Active") return [];
  const user = currentUser(); if (user === "Administrator") return [];
  const e: string[] = [];
  if (!privileged(user, userRoles(user))) e.push(fill(RES_MSG.assignRole, user));
  if (s(doc["owner"]) && s(doc["owner"]) === user) e.push(fill(RES_MSG.assignSelf, user));
  return e;
}

// ---------------------------------------------------------------- FT-08-13 work permit
const tsOf = (v: unknown) => { const t = s(v).trim().replace("T", " ").slice(0, 19); return t ? Date.parse(t.replace(" ", "T")) : NaN; };
export function safetyMember(project: string, user: string, on: string): boolean {
  const pr = adapter.get("Project", project);
  return rows(pr, "digit_team").some((r) => s(r["project_role"]) === "Safety" && s(r["user"]) === user && (!s(r["from_date"]) || s(r["from_date"]) <= on) && (!s(r["to_date"]) || s(r["to_date"]) >= on));
}
export function permitRule(doc: Row, before: Row | undefined): string[] {
  if (!became(doc, before, "status", "Issued")) return [];
  const e: string[] = []; const ps = rows(doc as Doc, "precautions");
  if (!ps.length) e.push(RES_MSG.permitNone);
  ps.forEach((r, i) => { if (!num(r["checked"])) e.push(fill(RES_MSG.permitCheck, s(r["precaution"]) || num(r["idx"]) || i + 1)); });
  const a = tsOf(doc["valid_from"]), b = tsOf(doc["valid_to"]);
  if (Number.isNaN(a) || Number.isNaN(b) || b <= a) e.push(RES_MSG.permitPeriod);
  else { const h = r2((b - a) / 3600000); if (h > PERMIT_MAX_HOURS + 1e-9) e.push(fill(RES_MSG.permitHours, h)); }
  const issuer = s(doc["issuer"]); const on = s(doc["valid_from"]).slice(0, 10) || today();
  if (!issuer) e.push(RES_MSG.permitNoIssuer);
  else if (!safetyMember(s(doc["project"]), issuer, on)) e.push(fill(RES_MSG.permitIssuer, issuer));
  return e;
}

// ---------------------------------------------------------------- FT-08-10 site expense / machinery register
/** DEC-274: the receipt is the Attach field or a file attached to the expense from the form sidebar. */
export const hasReceipt = (doc: Row) => !!s(doc["receipts"]).trim() || list("File", (f) => f["attached_to_doctype"] === "Digit Site Expense" && f["attached_to_name"] === doc["name"] && !!s(doc["name"])).length > 0;
export function expenseRule(doc: Row, before: Row | undefined): string[] {
  return became(doc, before, "workflow_state", "Submitted") && !hasReceipt(doc) ? [RES_MSG.receipt] : [];
}
/** Sheet 16 MISS-MaintenanceOrder: a closed order carries its work date (and meter for preventive work), amounts are
 * never negative, the next due date follows the work date, and only a project manager / director decides approval. */
export function maintenanceRule(doc: Row, before: Row | undefined, user = currentUser()): string[] {
  const e: string[] = [];
  if (became(doc, before, "status", "Done")) {
    if (!s(doc["work_date"])) e.push(RES_MSG.maintDone);
    if (s(doc["order_type"]) === "Preventive" && !(num(doc["meter_at"]) > 0)) e.push(RES_MSG.maintMeter);
  }
  if (num(doc["downtime_hours"]) < 0 || num(doc["cost"]) < 0) e.push(RES_MSG.maintNegative);
  if (s(doc["next_due_date"]) && s(doc["work_date"]) && s(doc["next_due_date"]) <= s(doc["work_date"])) e.push(RES_MSG.maintNextDue);
  if ((became(doc, before, "approval_status", "Approved") || became(doc, before, "approval_status", "Rejected")) && !privileged(user, userRoles(user))) e.push(fill(RES_MSG.maintApprover, user));
  return e;
}
/** Sheet 16 MISS-SiteInduction: validity never ends before the induction, and only a project manager / director decides approval. */
export function inductionRule(doc: Row, before: Row | undefined, user = currentUser()): string[] {
  const e: string[] = [];
  if (s(doc["valid_until"]) && s(doc["inducted_on"]) && s(doc["valid_until"]) < s(doc["inducted_on"])) e.push(RES_MSG.inductionDates);
  if ((became(doc, before, "approval_status", "Approved") || became(doc, before, "approval_status", "Rejected")) && !privileged(user, userRoles(user))) e.push(fill(RES_MSG.inductionApprover, user));
  return e;
}

export function machineryRule(doc: Row, before: Row | undefined): string[] {
  return !before && s(doc["ownership"]) === "Owned" && !s(doc["serial_no"]).trim() ? [RES_MSG.serial] : [];
}

// ---------------------------------------------------------------- read models
const projectsIn = (project?: string) => new Set(project ? [project] : constructionProjects().map((p) => p.name));
const addDays = (d: string, n: number) => new Date(Date.parse(d) + n * 86400000).toISOString().slice(0, 10);
const dayList = (from: string, to: string) => { const out: string[] = []; for (let d = from; d <= to && out.length < 1000; d = addDays(d, 1)) out.push(d); return out; };

export interface LoadDay { date: string; planned: number; actual: number; tasks: Row[]; sheets: Row[] }
/** F08-02-1/2: planned man-days per day = Σ active tasks (planned man-hours ÷ 8) ÷ task days; actual = Σ approved attendance hours ÷ 8. */
export function dailyLoad(project: string | undefined, from: string, to: string): LoadDay[] {
  const ps = projectsIn(project);
  const tasks = list("Task", (t) => ps.has(s(t["project"])) && num(t["digit_planned_manhours"]) > 0 && !!s(t["exp_start_date"]) && !!s(t["exp_end_date"]))
    .map((t) => { const a = s(t["exp_start_date"]).slice(0, 10), b = s(t["exp_end_date"]).slice(0, 10); const days = Math.max(1, daysBetween(a, b) + 1);
      return { task: t.name, project: s(t["project"]), from: a, to: b, days, hours: num(t["digit_planned_manhours"]), load: (num(t["digit_planned_manhours"]) / WORKDAY_HOURS) / days }; });
  const sheets = list("Digit Field Attendance", (a) => num(a.docstatus) === 1 && ps.has(s(a["project"])));
  return dayList(from, to).map((date) => {
    const ts = tasks.filter((t) => t.from <= date && t.to >= date);
    const ss = sheets.filter((a) => s(a["attendance_date"]).slice(0, 10) === date).map((a) => ({ attendance: a.name, project: a["project"], hours: r2(sumBy(rows(a, "employees").filter((r) => PRESENT.includes(s(r["attendance"]))), (r) => num(r["hours"]))) }));
    return { date, planned: r4(ts.reduce((n, t) => n + t.load, 0)), actual: r4(ss.reduce((n, x) => n + num(x["hours"]), 0) / WORKDAY_HOURS), tasks: ts.map((t) => ({ ...t, load: r4(t.load) })), sheets: ss };
  });
}

export interface DueRow { machinery: string; name: string; interval_hours: number | null; interval_days: number | null; last_pm_meter: number; current_meter: number; due_in_hours: number | null; last_pm_date: string; due_date: string; due: boolean; order: string }
/** F08-08-1: due when meter − meter at the last preventive maintenance ≥ interval hours, or days since it ≥ interval days. */
export function maintenanceDue(on = today()): DueRow[] {
  return list("Digit Machinery", (m) => s(m["status"]) !== "Retired" && (num(m["pm_interval_hours"]) > 0 || num(m["pm_interval_days"]) > 0)).map((m) => {
    const pm = list("Digit Maintenance Order", (o) => o["machinery"] === m.name && s(o["order_type"]) === "Preventive" && s(o["status"]) === "Done")
      .sort((a, b) => s(b["work_date"]).localeCompare(s(a["work_date"])) || num(b["meter_at"]) - num(a["meter_at"]))[0];
    const meters = list("Digit Machinery Usage", (u) => u["machinery"] === m.name && num(u.docstatus) === 1).map((u) => num(u["meter_end"]));
    const current = Math.max(num(m["last_meter"]), ...meters, 0);
    const ih = num(m["pm_interval_hours"]) || null, id = num(m["pm_interval_days"]) || null;
    const lastMeter = num(pm?.["meter_at"]), lastDate = s(pm?.["work_date"]).slice(0, 10);
    const dueDate = id && lastDate ? addDays(lastDate, id) : "";
    const due = (!!ih && current - lastMeter >= ih) || (!!id && !!lastDate && daysBetween(lastDate, on) >= id);
    return { machinery: m.name, name: s(m["machine_name"]) || m.name, interval_hours: ih, interval_days: id, last_pm_meter: lastMeter, current_meter: current, due_in_hours: ih ? r2(lastMeter + ih - current) : null, last_pm_date: lastDate, due_date: dueDate, due, order: s(pm?.name) };
  }).sort((a, b) => Number(b.due) - Number(a.due) || a.name.localeCompare(b.name));
}

export interface SplitRow { machinery: string; task: string; cost_code: string; hours: number; share: number; amount: number }
/** F08-12-1 / DEC-275 / 277: a resource's period cost split by its submitted usage hours per task (analytical; the last line takes the rounding remainder). */
export function costSplit(machinery: string, from: string, to: string, cost: number, project?: string): SplitRow[] {
  const ps = projectsIn(project);
  const us = list("Digit Machinery Usage", (u) => u["machinery"] === machinery && num(u.docstatus) === 1 && ps.has(s(u["project"])) && s(u["usage_date"]) >= from && s(u["usage_date"]) <= to && num(u["hours"]) > 0);
  const by = new Map<string, number>(); for (const u of us) { const k = s(u["task"]); by.set(k, r2((by.get(k) ?? 0) + num(u["hours"]))); }
  const total = sumBy([...by.values()], (h) => h); if (!total) return [];
  const out = [...by.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([task, hours]) => ({ machinery, task, cost_code: s(adapter.get("Task", task)?.["digit_cost_code"]), hours, share: r4(hours / total), amount: r2((cost * hours) / total) }));
  const rest = r2(cost - sumBy(out.slice(0, -1), (x) => x.amount)); out[out.length - 1]!.amount = rest;
  return out;
}

/** DEC-274: submitted site expenses waiting longer than 7 days for approval. */
export function expenseAging(project?: string, on = today()): Row[] {
  const ps = projectsIn(project);
  return list("Digit Site Expense", (x) => ps.has(s(x["project"])) && s(x["workflow_state"]) === "Submitted" && num(x.docstatus) !== 2)
    .map((x) => ({ expense: x.name, project: x["project"], expense_date: s(x["expense_date"]).slice(0, 10), category: x["category"], amount: num(x["amount"]), age_days: daysBetween(s(x["expense_date"]).slice(0, 10), on), currency: x["currency"] || "SAR" }))
    .filter((x) => x.age_days > EXPENSE_AGING_DAYS).sort((a, b) => b.age_days - a.age_days);
}
