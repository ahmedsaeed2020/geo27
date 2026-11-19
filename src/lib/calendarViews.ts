/**
 * List Calendar and Gantt views (frappe/public/js/frappe/views/calendar/calendar.js, views/gantt/gantt_view.js), driven by
 * the source field_map of each <doctype>_calendar.js (public/catalog/calendar_views.json ← scripts/extract-calendars.py).
 * Events are built from the list rows the caller already permission-filtered; a field_map whose start field lives on a
 * child table (Holiday List holidays, Timesheet time_logs) reads that table's rows, as the source get_events methods do.
 */
import { queryOptions } from "@tanstack/react-query";
import type { Doc } from "./adapter";
import type { DocTypeMeta } from "./catalog";

export interface CalendarCfg { field_map: { start: string; end: string; title?: string; color?: string; status?: string; progress?: string }; source: string }
export const calendarViewsQuery = queryOptions({
  queryKey: ["eng-calendars"], staleTime: Infinity, gcTime: Infinity,
  queryFn: async () => (await (await fetch("/catalog/calendar_views.json")).json()) as Record<string, CalendarCfg>,
});

export interface CalEvent { id: string; doc: string; title: string; start: string; end: string; progress?: number; source: Doc }
export interface CalFields { table?: string; start: string; end: string; title?: string; progress?: string }

const day = (v: unknown) => { const s = String(v ?? "").trim(); return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : ""; };
const has = (m: DocTypeMeta | undefined, f: string | undefined) => !!f && !!m?.fields.some((x) => x.fieldname === f);

/** Where the field_map's start/end live: on the DocType itself, or on one of its child tables. Null when neither has them. */
export function calendarFields(meta: DocTypeMeta, cfg: CalendarCfg | undefined, childMeta: (dt: string) => DocTypeMeta | undefined): CalFields | null {
  if (!cfg) return null;
  const fm = cfg.field_map;
  const pick = (m: DocTypeMeta, table?: string): CalFields => ({
    ...(table ? { table } : {}), start: fm.start, end: has(m, fm.end) ? fm.end : fm.start,
    ...(fm.title && (has(m, fm.title) || has(meta, fm.title)) ? { title: fm.title } : {}), ...(fm.progress && has(m, fm.progress) ? { progress: fm.progress } : {}),
  });
  if (has(meta, fm.start)) return pick(meta);
  for (const f of meta.fields) {
    if (f.fieldtype !== "Table" || !f.options || !f.fieldname) continue;
    const cm = childMeta(f.options);
    if (has(cm, fm.start)) return pick(cm!, f.fieldname);
  }
  return null;
}

/** One event per document (or per child row); undated rows are skipped, an end before the start collapses to the start day. */
export function calendarEvents(docs: Doc[], f: CalFields, titleOf: (d: Doc) => string): CalEvent[] {
  const out: CalEvent[] = [];
  const add = (d: Doc, row: Record<string, unknown>, id: string) => {
    const start = day(row[f.start]); if (!start) return;
    const e = day(row[f.end]); const end = e && e >= start ? e : start;
    const t = f.title ? String(row[f.title] ?? d[f.title] ?? "").trim() : "";
    const p = f.progress ? Number(row[f.progress]) : NaN;
    out.push({ id, doc: d.name, title: t || titleOf(d), start, end, ...(Number.isFinite(p) ? { progress: Math.max(0, Math.min(100, p)) } : {}), source: d });
  };
  for (const d of docs) {
    if (!f.table) { add(d, d, d.name); continue; }
    const rows = Array.isArray(d[f.table]) ? (d[f.table] as Record<string, unknown>[]) : [];
    rows.forEach((r, i) => add(d, r, `${d.name}:${String(r["name"] ?? i)}`));
  }
  return out.sort((a, b) => a.start.localeCompare(b.start) || a.title.localeCompare(b.title));
}

/* ---------- date arithmetic on ISO days (UTC, so no timezone shifts) ---------- */
const toUtc = (iso: string) => { const [y, m, d] = iso.split("-").map(Number); return Date.UTC(y!, m! - 1, d!); };
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
export const addDays = (d: string, n: number) => iso(toUtc(d) + n * 864e5);
export const daysBetween = (a: string, b: string) => Math.round((toUtc(b) - toUtc(a)) / 864e5);
export const weekday = (d: string) => new Date(toUtc(d)).getUTCDay();
export function addMonths(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number); const t = new Date(Date.UTC(y!, m! - 1 + n, 1)); return t.toISOString().slice(0, 7);
}

/** Six full weeks covering the month (frappe calendar month view), starting on the configured first weekday (0 = Sunday). */
export function monthGrid(month: string, weekStart = 0): string[][] {
  const first = `${month}-01`;
  const start = addDays(first, -((weekday(first) - weekStart + 7) % 7));
  return Array.from({ length: 6 }, (_, w) => Array.from({ length: 7 }, (_, i) => addDays(start, w * 7 + i)));
}
export const eventsOn = (events: CalEvent[], d: string) => events.filter((e) => e.start <= d && d <= e.end);

/** The month to open first: the current one when it has events, otherwise the month of the nearest event (so a board never opens empty by accident). */
export function initialMonth(events: CalEvent[], today: string): string {
  const cur = today.slice(0, 7);
  if (!events.length || events.some((e) => e.start.slice(0, 7) <= cur && cur <= e.end.slice(0, 7))) return cur;
  const near = [...events].sort((a, b) => Math.abs(daysBetween(today, a.start)) - Math.abs(daysBetween(today, b.start)))[0]!;
  return near.start.slice(0, 7);
}

/* ---------- Gantt (frappe-gantt view modes Day / Week / Month) ---------- */
export type GanttScale = "Day" | "Week" | "Month";
export interface GanttColumn { key: string; from: string; to: string }
export function ganttColumns(anchor: string, scale: GanttScale): GanttColumn[] {
  if (scale === "Day") { const s = addDays(anchor, -3); return Array.from({ length: 21 }, (_, i) => { const d = addDays(s, i); return { key: d, from: d, to: d }; }); }
  if (scale === "Week") {
    const s = addDays(anchor, -weekday(anchor) - 14);
    return Array.from({ length: 12 }, (_, i) => { const f = addDays(s, i * 7); return { key: f, from: f, to: addDays(f, 6) }; });
  }
  const m0 = addMonths(anchor.slice(0, 7), -2);
  return Array.from({ length: 12 }, (_, i) => { const m = addMonths(m0, i); return { key: m, from: `${m}-01`, to: addDays(`${addMonths(m, 1)}-01`, -1) }; });
}
/** Bar position as percentages of the visible window, clipped at both edges; null when the event is outside the window. */
export function ganttBar(e: Pick<CalEvent, "start" | "end">, cols: GanttColumn[]): { left: number; width: number; clipStart: boolean; clipEnd: boolean } | null {
  if (!cols.length) return null;
  const from = cols[0]!.from, to = cols[cols.length - 1]!.to;
  if (e.end < from || e.start > to) return null;
  const span = daysBetween(from, to) + 1;
  const s = e.start < from ? from : e.start, en = e.end > to ? to : e.end;
  return { left: (daysBetween(from, s) / span) * 100, width: ((daysBetween(s, en) + 1) / span) * 100, clipStart: e.start < from, clipEnd: e.end > to };
}
