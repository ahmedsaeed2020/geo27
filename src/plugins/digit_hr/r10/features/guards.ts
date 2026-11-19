/**
 * Round-2 guards for the reported HR defects (sheet 09 CQ rows) — each a controller rule with a Python twin in
 * ../hookScripts.ts, registered from ../hooks.ts:
 *  - CQ-HRMS-4852 attendance / check-ins before the joining date (or after relieving) are refused, so they never count
 *    as payment days
 *  - R09 payroll freeze: a new or corrected punch, attendance or attendance request inside a locked payroll period is
 *    refused with the next-period adjustment named, so a frozen payroll never moves
 *  - R09 HRIS-WFM sync: relieving an employee ends their shift assignments on the relieving date (later ones are
 *    deactivated) and a shift can never be assigned after the relieving date
 *  - CQ-HRMS-5137 an advance recovery (Additional Salary against an Employee Advance) can never exceed the advance's
 *    unrecovered balance, so the journal never posts more than was paid
 *  - CQ-HRMS-4841 earned-leave accrual by frequency (monthly … half-yearly, yearly) counted from the joining date or the
 *    leave period, prorated for a mid-period joiner (shown in the leave simulator; nothing is written)
 */
import { adapter, type Doc } from "@/lib/adapter";
import { lockOn } from "../../product/payroll";
import { s, n, d10, todayISO } from "../write";

const empOf = (doc: Doc) => adapter.get("Employee", s(doc["employee"]));
const DATE_FIELD: Record<string, string> = { Attendance: "attendance_date", "Employee Checkin": "time", "Attendance Request": "from_date" };
const changed = (doc: Doc, before: Doc | undefined, fields: string[]) => !before || fields.some((f) => s(doc[f]) !== s(before[f]));

/** CQ-HRMS-4852 + payroll freeze: errors for an Attendance / Employee Checkin / Attendance Request write. */
export function timeRecordErrors(dt: string, doc: Doc, before: Doc | undefined): string[] {
  const f = DATE_FIELD[dt]; if (!f || !s(doc["employee"])) return [];
  if (!changed(doc, before, [f, "to_date", "status", "log_type", "employee", "docstatus"].filter((x) => x in doc || (before && x in before)))) return [];
  if (Number(doc.docstatus) === 2) return [];
  const e = empOf(doc); const errors: string[] = []; const from = d10(doc[f]); const to = dt === "Attendance Request" ? d10(doc["to_date"]) || from : from;
  if (!from) return [];
  const join = d10(e?.["date_of_joining"]), rel = d10(e?.["relieving_date"]);
  if (join && from < join) errors.push(`${s(e?.["employee_name"]) || s(doc["employee"])} joins on ${join}; ${dt} on ${from} is before the joining date and cannot count as a working day`);
  if (rel && to > rel) errors.push(`${s(e?.["employee_name"]) || s(doc["employee"])} was relieved on ${rel}; ${dt} on ${to} is after the relieving date`);
  const co = s(doc["company"]) || s(e?.["company"]);
  for (const d of from === to ? [from] : [from, to]) { const lock = lockOn(co, d); if (lock) { errors.push(`The payroll period ${d10(lock["from_date"])} – ${d10(lock["to_date"])} is locked (${lock.name}); record the correction as an adjustment in the next open period`); break; } }
  return errors;
}

/** R09: a shift cannot start after the employee's relieving date. */
export function shiftAssignmentErrors(doc: Doc, before: Doc | undefined): string[] {
  if (!changed(doc, before, ["employee", "start_date", "end_date", "status"]) || s(doc["status"]) === "Inactive") return [];
  const rel = d10(empOf(doc)?.["relieving_date"]); if (!rel) return [];
  if (d10(doc["start_date"]) > rel) return [`The employee is relieved on ${rel}; a shift starting ${d10(doc["start_date"])} cannot be assigned`];
  if (d10(doc["end_date"]) && d10(doc["end_date"]) > rel) return [`The employee is relieved on ${rel}; the shift must end by that date`];
  return [];
}
/** Open shift assignments that run past the relieving date (the WFM sync gap). */
export function shiftsAfterExit(company?: string): Doc[] {
  const emps = new Map(adapter.list("Employee").filter((e) => d10(e["relieving_date"]) && (!company || e["company"] === company)).map((e) => [e.name, d10(e["relieving_date"])]));
  return adapter.list("Shift Assignment").filter((a) => { const rel = emps.get(s(a["employee"])); return !!rel && Number(a.docstatus) !== 2 && s(a["status"]) !== "Inactive" && (!d10(a["end_date"]) || d10(a["end_date"]) > rel); });
}
/** End (or deactivate) every open shift assignment of a relieved employee at the relieving date; returns the names changed. */
export function endShiftsOnExit(employee: string): string[] {
  const rel = d10(adapter.get("Employee", employee)?.["relieving_date"]); if (!rel) return [];
  const out: string[] = [];
  for (const a of shiftsAfterExit().filter((x) => x["employee"] === employee)) { adapter.update("Shift Assignment", a.name, d10(a["start_date"]) > rel ? { status: "Inactive" } : { end_date: rel }); out.push(a.name); }
  return out;
}

/** CQ-HRMS-5137: what is still recoverable on an advance = paid − claimed − returned − other open recoveries. */
export function advanceRecoverable(advance: string, exclude = ""): number {
  const a = adapter.get("Employee Advance", advance); if (!a || Number(a.docstatus) !== 1) return 0;
  const other = adapter.list("Additional Salary").filter((x) => x.name !== exclude && s(x["ref_doctype"]) === "Employee Advance" && s(x["ref_docname"]) === advance && Number(x.docstatus) !== 2).reduce((t, x) => t + n(x["amount"]), 0);
  return Math.max(0, Math.round((n(a["paid_amount"]) - n(a["claimed_amount"]) - n(a["return_amount"]) - other) * 100) / 100);
}
export function advanceRecoveryErrors(doc: Doc, before: Doc | undefined): string[] {
  if (s(doc["ref_doctype"]) !== "Employee Advance" || !s(doc["ref_docname"]) || !changed(doc, before, ["amount", "ref_docname", "docstatus"]) || Number(doc.docstatus) === 2) return [];
  const a = adapter.get("Employee Advance", s(doc["ref_docname"]));
  if (!a || Number(a.docstatus) !== 1 || n(a["paid_amount"]) <= 0) return [`Advance ${s(doc["ref_docname"])} is not paid; nothing can be recovered from salary`];
  if (s(a["employee"]) && s(doc["employee"]) && s(a["employee"]) !== s(doc["employee"])) return [`Advance ${a.name} belongs to another employee`];
  const left = advanceRecoverable(a.name, doc.name);
  return n(doc["amount"]) > left + 0.005 ? [`Only ${left} of advance ${a.name} is still unrecovered; the recovery of ${n(doc["amount"])} would post more than was paid`] : [];
}

/* ------------------------------------------------------------------ CQ-HRMS-4841 earned-leave accrual */
export type Frequency = "Monthly" | "Quarterly" | "Half-Yearly" | "Yearly";
const STEP: Record<Frequency, number> = { Monthly: 1, Quarterly: 3, "Half-Yearly": 6, Yearly: 12 };
const addMonths = (iso: string, k: number) => { const y = Number(iso.slice(0, 4)), m = Number(iso.slice(5, 7)) - 1 + k, d = Number(iso.slice(8, 10)); const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate(); return new Date(Date.UTC(y, m, Math.min(d, last))).toISOString().slice(0, 10); };
export interface AccrualStep { on: string; days: number; total: number }
/**
 * Earned leave of a policy assignment: one credit of annual × step/12 at the end of each completed step, counted from the
 * joining date ("Joining Date") or the leave period start ("Leave Period"); the total never exceeds the annual
 * entitlement prorated for the months the employee is in the period. Steps after `on` are not earned yet.
 */
export function leaveAccrual(i: { annual: number; frequency: Frequency; basedOn: "Joining Date" | "Leave Period"; joining: string; periodFrom: string; periodTo: string; on?: string }): { steps: AccrualStep[]; earned: number; cap: number; start: string } {
  const start = i.joining && i.joining > i.periodFrom ? i.joining : i.periodFrom; const anchor = i.basedOn === "Joining Date" ? start : i.periodFrom; const on = i.on ?? todayISO();
  const days = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000) + 1;
  const r2 = (x: number) => Math.round(x * 100) / 100;
  const cap = start > i.periodTo ? 0 : r2((i.annual * days(start, i.periodTo)) / days(i.periodFrom, i.periodTo));
  const per = r2((i.annual * STEP[i.frequency]) / 12); const end = addMonths(i.periodTo, 0) === i.periodTo ? new Date(Date.parse(`${i.periodTo}T00:00:00Z`) + 86400000).toISOString().slice(0, 10) : i.periodTo;
  const steps: AccrualStep[] = []; let total = 0;
  for (let k = 1; k <= 12; k++) {
    const at = addMonths(anchor, k * STEP[i.frequency]); if (at > end) break; if (at <= start) continue;
    const credit = r2(Math.min(per, cap - total)); if (credit <= 0) break; total = r2(total + credit); steps.push({ on: at > i.periodTo ? i.periodTo : at, days: credit, total });
  }
  return { steps, earned: steps.filter((x) => x.on <= on).reduce((t, x) => r2(t + x.days), 0), cap, start };
}
