/**
 * Mission Control facts (pure). Upcoming dated events come only from date fields recorded on source rows;
 * nothing is projected or estimated. Callers pass rows already read through the permission/company scope.
 */
type Row = Record<string, unknown>;
const s = (v: unknown) => (v == null ? "" : String(v));
const live = (r: Row) => Number(r["docstatus"] ?? 0) !== 2;

export type UpcomingKind = "document-expiry" | "leave-start" | "interview" | "joining" | "cycle-end";
export type Upcoming = { kind: UpcomingKind; date: string; doctype: string; name: string; who: string; detail: string };

export function addDays(iso: string, n: number): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10);
}

/** Events dated from `today` (inclusive) to `today + horizon` days, earliest first. */
export function upcomingEvents(src: { renewals: Row[]; leaves: Row[]; interviews: Row[]; onboarding: Row[]; cycles: Row[] }, today: string, horizon = 30): Upcoming[] {
  if (!today) return [];
  const end = addDays(today, horizon);
  const within = (d: string) => !!d && d >= today && d <= end;
  const out: Upcoming[] = [];
  for (const r of src.renewals) { const d = s(r["expiry_date"]).slice(0, 10); if (live(r) && within(d)) out.push({ kind: "document-expiry", date: d, doctype: "DIGIT Document Renewal", name: s(r["name"]), who: s(r["employee_name"] || r["employee"]), detail: s(r["document_type"]) }); }
  for (const r of src.leaves) { const d = s(r["from_date"]).slice(0, 10); if (Number(r["docstatus"]) === 1 && s(r["status"]) === "Approved" && within(d)) out.push({ kind: "leave-start", date: d, doctype: "Leave Application", name: s(r["name"]), who: s(r["employee_name"] || r["employee"]), detail: s(r["leave_type"]) }); }
  for (const r of src.interviews) { const d = s(r["scheduled_on"]).slice(0, 10); if (live(r) && ["Pending", "Under Review", "Scheduled"].includes(s(r["status"])) && within(d)) out.push({ kind: "interview", date: d, doctype: "Interview", name: s(r["name"]), who: s(r["job_applicant"]), detail: s(r["interview_round"]) }); }
  for (const r of src.onboarding) { const d = s(r["date_of_joining"]).slice(0, 10); if (live(r) && s(r["boarding_status"]) !== "Completed" && within(d)) out.push({ kind: "joining", date: d, doctype: "Employee Onboarding", name: s(r["name"]), who: s(r["employee_name"] || r["job_applicant"]), detail: s(r["designation"]) }); }
  for (const r of src.cycles) { const d = s(r["end_date"]).slice(0, 10); if (live(r) && s(r["status"]) !== "Completed" && within(d)) out.push({ kind: "cycle-end", date: d, doctype: "Appraisal Cycle", name: s(r["name"]), who: s(r["cycle_name"] || r["name"]), detail: s(r["status"]) }); }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.kind.localeCompare(b.kind));
}

/** Count of priority items per owning module, largest first; modules without items are omitted. */
export function workByModule<T extends { module: string }>(items: T[]): { module: string; count: number }[] {
  const m = new Map<string, number>();
  for (const i of items) m.set(i.module, (m.get(i.module) ?? 0) + 1);
  return [...m.entries()].map(([module, count]) => ({ module, count })).sort((a, b) => b.count - a.count || a.module.localeCompare(b.module));
}
