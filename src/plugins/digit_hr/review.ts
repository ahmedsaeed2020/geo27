import { coversAttendanceDay } from './attendanceEligibility';
type R = Record<string, unknown>;
export function recordState(docstatus: unknown): 'Draft' | 'Submitted' | 'Cancelled' {
  return Number(docstatus ?? 0) === 2 ? 'Cancelled' : Number(docstatus ?? 0) === 1 ? 'Submitted' : 'Draft';
}
export function interviewsOn(rows: R[], day: string): R[] {
  return rows.filter(r => Number(r['docstatus'] ?? 0) !== 2 && String(r['scheduled_on'] ?? '').slice(0, 10) === day)
    .sort((a, b) => String(a['from_time'] ?? '').localeCompare(String(b['from_time'] ?? '')));
}
export function shiftWeek(rows: R[], start: string): { day: string; assignments: R[] }[] {
  const time = Date.parse(start + 'T00:00:00Z');
  if (!Number.isFinite(time)) return [];
  return Array.from({ length: 7 }, (_, i) => {
    const day = new Date(time + i * 86400000).toISOString().slice(0, 10);
    return { day, assignments: rows.filter(r => coversAttendanceDay(r, String(r['employee'] ?? ''), day)) };
  });
}