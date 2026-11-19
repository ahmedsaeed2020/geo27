/**
 * Employee 360 timeline grouping (NB UX-16). Daily operational records (Attendance, Employee Checkin) would otherwise
 * bury lifecycle events, so they fold into one row per ISO week (Monday start). Lifecycle events stay individual.
 * Pure display grouping: no record is hidden from the count, dropped, or changed; an active search shows the matching
 * days individually so search behaviour is unchanged.
 */
export type TimelineEvent = { dt: string; name: string; group: string; module: string; gar: string; gen: string; date: string; status: unknown };
export type TimelineWeek = { kind: "week"; key: string; dt: string; weekStart: string; weekEnd: string; date: string; events: TimelineEvent[]; statuses: Record<string, number>; group: string; module: string; gar: string; gen: string };
export type TimelineItem = ({ kind: "event" } & TimelineEvent) | TimelineWeek;

export const DAILY_DOCTYPES = new Set(["Attendance", "Employee Checkin"]);

const DAY = 86400000;
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);

/** Monday of the ISO week containing `date` (YYYY-MM-DD); null for undated/invalid values. */
export function weekStart(date: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}/.test(date)) return null;
  const t = Date.parse(`${date.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(t)) return null;
  const dow = (new Date(t).getUTCDay() + 6) % 7; // Monday = 0
  return iso(t - dow * DAY);
}

/**
 * Fold daily records into weekly rows. Events must already be sorted newest first; the output keeps that order, with
 * each week placed at its newest day. Undated daily records stay individual (never guessed into a week).
 */
export function groupTimeline(events: TimelineEvent[], opts: { foldDaily: boolean }): TimelineItem[] {
  if (!opts.foldDaily) return events.map((e) => ({ kind: "event" as const, ...e }));
  const out: TimelineItem[] = []; const weeks = new Map<string, TimelineWeek>();
  for (const e of events) {
    const ws = DAILY_DOCTYPES.has(e.dt) ? weekStart(e.date) : null;
    if (!ws) { out.push({ kind: "event", ...e }); continue; }
    const key = `${e.dt}|${ws}`;
    let w = weeks.get(key);
    if (!w) {
      w = { kind: "week", key, dt: e.dt, weekStart: ws, weekEnd: iso(Date.parse(`${ws}T00:00:00Z`) + 6 * DAY), date: e.date, events: [], statuses: {}, group: e.group, module: e.module, gar: e.gar, gen: e.gen };
      weeks.set(key, w); out.push(w);
    }
    w.events.push(e);
    const s = String(e.status || "—"); w.statuses[s] = (w.statuses[s] ?? 0) + 1;
  }
  return out;
}

/** Number of underlying records represented by the grouped list (always equals the input length). */
export const representedCount = (items: TimelineItem[]) => items.reduce((n, i) => n + (i.kind === "week" ? i.events.length : 1), 0);
