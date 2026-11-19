/**
 * NB1-01 attendance freshness (display rule, no data changes). A day with no saved attendance and no check-in in the
 * reader's scope is "not recorded" — never shown as an actual zero or as absence — and the board offers the latest
 * day that does have saved attendance, without moving the selected date by itself.
 */
type Rec = Record<string, unknown>;
const d10 = (v: unknown) => String(v ?? "").slice(0, 10);
const live = (r: Rec) => Number(r["docstatus"] ?? 0) !== 2;

export type DayFreshness = {
  /** saved (non-cancelled) Attendance rows on the day for the given people */
  attendance: number;
  /** Employee Checkin rows on the day for the given people */
  checkins: number;
  /** true when neither exists: the day has no source records at all */
  noRecords: boolean;
  /** latest day ≤ today with saved attendance for these people ("" when none) */
  lastRecorded: string;
  /** set of days with saved attendance (for per-day "no records" markers) */
  recordedDays: Set<string>;
};

export function attendanceFreshness(people: Set<string>, attendance: Rec[], checkins: Rec[], day: string, today: string): DayFreshness {
  const att = attendance.filter((a) => live(a) && people.has(String(a["employee"] ?? "")));
  const recordedDays = new Set(att.map((a) => d10(a["attendance_date"])).filter(Boolean));
  const ci = checkins.filter((c) => people.has(String(c["employee"] ?? "")) && d10(c["time"]) === day).length;
  const onDay = att.filter((a) => d10(a["attendance_date"]) === day).length;
  const cap = today || day;
  const lastRecorded = [...recordedDays].filter((d) => !cap || d <= cap).sort().at(-1) ?? "";
  return { attendance: onDay, checkins: ci, noRecords: !!day && onDay === 0 && ci === 0, lastRecorded, recordedDays };
}
