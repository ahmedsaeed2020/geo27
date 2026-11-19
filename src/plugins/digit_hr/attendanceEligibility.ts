/** Verified assignment evidence only; a missing record never proves absence by itself. */
type RecordLike = Record<string, unknown>;
const s = (v: unknown) => (v == null ? '' : String(v));
const d10 = (v: unknown) => s(v).slice(0, 10);

export function coversAttendanceDay(assignment: RecordLike, employee: string, day: string): boolean {
  return !!day && assignment['employee'] === employee && Number(assignment['docstatus'] ?? 0) === 1
    && assignment['status'] === "Active" && !!assignment['shift_type'] && !!assignment['start_date']
    && String(assignment['start_date']).slice(0, 10) <= day
    && (!assignment['end_date'] || String(assignment['end_date']).slice(0, 10) >= day);
}
export function attendanceEligibility(employee: string, day: string, assignments: RecordLike[], leaves: RecordLike[]) {
  const assigned = assignments.some(a => coversAttendanceDay(a, employee, day));
  const onLeave = leaves.some(l => l['employee'] === employee && Number(l['docstatus'] ?? 0) === 1 && l['status'] === "Approved"
    && !!l['from_date'] && !!l['to_date'] && String(l['from_date']).slice(0, 10) <= day && String(l['to_date']).slice(0, 10) >= day);
  return { assigned, onLeave, canDraftAbsence: assigned && !onLeave, kind: onLeave ? (assigned ? "leave" : "none") : assigned ? "missing" : "unclassified" };
}

/**
 * Employment on `day` from the Employee record: joined on/before the day and not relieved before it.
 * Active employees qualify; "Left" qualifies only up to a recorded relieving_date; Inactive/Suspended carry no expected attendance.
 */
export function employedOn(emp: RecordLike, day: string): boolean {
  const joined = d10(emp['date_of_joining']), relieved = d10(emp['relieving_date']);
  if (!day || (joined && joined > day) || (relieved && relieved < day)) return false;
  const st = s(emp['status'] || 'Active');
  if (st === 'Active') return true;
  return st === 'Left' && !!relieved && relieved >= day;
}

/**
 * HRMS v16 resolve_holiday_list_assignment (hrms/utils/holiday_list.py): among submitted Holiday List Assignment rows,
 * the employee's own first, then the company's — the latest starting on or before `asOn`, else the earliest one.
 * Returns null when no assignment row exists for either, so callers can apply the pre-v16 fallback.
 */
export function assignedHolidayList(emp: RecordLike, assignments: RecordLike[] | null | undefined, asOn: string): string | null {
  if (!assignments?.length) return null;
  const rows = (who: string) => assignments.filter((a) => Number(a['docstatus'] ?? 0) === 1 && who && s(a['assigned_to']) === who)
    .sort((a, b) => d10(a['from_date']).localeCompare(d10(b['from_date'])));
  const groups = [rows(s(emp['name'])), rows(s(emp['company']))];
  for (const g of groups) { const active = g.filter((a) => d10(a['from_date']) <= asOn); if (active.length) return s(active[active.length - 1]!['holiday_list']); }
  for (const g of groups) if (g.length) return s(g[0]!['holiday_list']);
  return null;
}

/**
 * HRMS get_holiday_list_for_employee. v16 resolves through Holiday List Assignment (above). Without any assignment row the
 * pre-v16 fields are used — Employee.holiday_list, else Company.default_holiday_list — which are exactly what the v16 patch
 * create_holiday_list_assignments converts into assignments. '' when nothing resolves.
 */
export function holidayListFor(emp: RecordLike, companies: RecordLike[], assignments?: RecordLike[] | null, asOn = new Date().toISOString().slice(0, 10)): string {
  const assigned = assignedHolidayList(emp, assignments, asOn);
  if (assigned !== null) return assigned;
  return s(emp['holiday_list']) || s(companies.find((c) => s(c['name']) === s(emp['company']))?.['default_holiday_list']);
}

/** Holiday status of `day` in a holiday list. `known` is false when no list resolves, the list is unreadable, or it does not cover the day. */
export function holidayOn(listName: string, lists: RecordLike[], day: string): { known: boolean; holiday: boolean; description: string } {
  if (!listName) return { known: false, holiday: false, description: '' };
  const list = lists.find((l) => s(l['name']) === listName);
  if (!list || (d10(list['from_date']) && d10(list['from_date']) > day) || (d10(list['to_date']) && d10(list['to_date']) < day)) return { known: false, holiday: false, description: '' };
  const hit = (Array.isArray(list['holidays']) ? (list['holidays'] as RecordLike[]) : []).find((h) => d10(h['holiday_date']) === day);
  return { known: true, holiday: !!hit, description: s(hit?.['description']) };
}

export type DayType = { kind: 'holiday' | 'working' | 'unknown'; list: string; description: string };
/**
 * Whether `day` is a holiday for an employee, following HRMS is_holiday: resolve the list (Holiday List Assignment as on
 * `day`, else the pre-v16 Employee.holiday_list / company default), then look for a stored Holiday row on that date. No resolvable list means "not a holiday" (as in HRMS);
 * `unknown` only when the list or company default cannot be read, so a hidden calendar never becomes an expected absence.
 * Pass `null` for a source the reader cannot read.
 */
export function dayType(emp: RecordLike, day: string, ctx: { companies: RecordLike[] | null; lists: RecordLike[] | null; listExists?: (name: string) => boolean; assignments?: RecordLike[] | null }): DayType {
  const assigned = assignedHolidayList(emp, ctx.assignments, day);
  let list = assigned ?? s(emp['holiday_list']);
  if (!list && assigned === null) {
    if (ctx.companies === null) return { kind: 'unknown', list: '', description: '' };
    list = s(ctx.companies.find((c) => s(c['name']) === s(emp['company']))?.['default_holiday_list']);
  }
  if (!list) return { kind: 'working', list: '', description: '' };
  if (ctx.lists === null) return { kind: 'unknown', list, description: '' };
  const l = ctx.lists.find((x) => s(x['name']) === list);
  if (!l) return { kind: ctx.listExists?.(list) ? 'unknown' : 'working', list, description: '' };
  const hit = (Array.isArray(l['holidays']) ? (l['holidays'] as RecordLike[]) : []).find((h) => d10(h['holiday_date']) === day);
  return hit ? { kind: 'holiday', list, description: s(hit['description']) } : { kind: 'working', list, description: '' };
}

export type ShiftCover = { shift: string; assigned: string[]; holiday: string[]; onLeave: string[]; recorded: string[]; present: string[]; absent: string[]; notRecorded: string[] };
const PRESENT = ['Present', 'Work From Home', 'Half Day'];
/** Per-shift coverage for one day over pre-scoped rows. `eligible` = employees employed on the day. Recorded = live Attendance rows. */
export function shiftCoverage(types: RecordLike[], assignments: RecordLike[], attendance: RecordLike[], eligible: Set<string>, onLeave: Set<string>, isHoliday: (emp: string) => boolean, day: string): ShiftCover[] {
  return types.map((t) => {
    const shift = s(t['name']);
    const assigned = [...new Set(assignments.filter((a) => s(a['shift_type']) === shift && coversAttendanceDay(a, s(a['employee']), day) && eligible.has(s(a['employee']))).map((a) => s(a['employee'])))];
    const att = attendance.filter((a) => Number(a['docstatus'] ?? 0) !== 2 && d10(a['attendance_date']) === day && assigned.includes(s(a['employee'])));
    const marked = new Set(att.map((a) => s(a['employee'])));
    const holiday = assigned.filter((e) => !marked.has(e) && isHoliday(e));
    const leave = assigned.filter((e) => !marked.has(e) && !holiday.includes(e) && onLeave.has(e));
    return {
      shift, assigned, holiday, onLeave: leave,
      recorded: att.map((a) => s(a['name'])),
      present: att.filter((a) => PRESENT.includes(s(a['status']))).map((a) => s(a['name'])),
      absent: att.filter((a) => s(a['status']) === 'Absent').map((a) => s(a['name'])),
      notRecorded: assigned.filter((e) => !marked.has(e) && !holiday.includes(e) && !leave.includes(e)),
    };
  });
}

/**
 * Day-navigator facts for the Workforce board: people employed on `day` who hold a submitted, active Shift Assignment covering it,
 * and how many of them have a saved (not cancelled) Attendance record for that day. Pre-scoped rows; display only.
 */
export function dayCoverageCounts(people: RecordLike[], assignments: RecordLike[], attendance: RecordLike[], day: string): { assigned: number; recorded: number } {
  const employed = new Set(people.filter((e) => employedOn(e, day)).map((e) => s(e['name'])));
  const onShift = new Set(assignments.filter((a) => employed.has(s(a['employee'])) && coversAttendanceDay(a, s(a['employee']), day)).map((a) => s(a['employee'])));
  const recorded = new Set(attendance.filter((a) => Number(a['docstatus'] ?? 0) !== 2 && d10(a['attendance_date']) === day && onShift.has(s(a['employee']))).map((a) => s(a['employee'])));
  return { assigned: onShift.size, recorded: recorded.size };
}
