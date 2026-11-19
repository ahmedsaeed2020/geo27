/**
 * List Calendar and Gantt views (frappe views/calendar + views/gantt) over the permission-filtered list rows; the field
 * mapping comes from the source <doctype>_calendar.js (lib/calendarViews.ts). Opening an event uses the shared Quick View,
 * so the user stays on the list.
 */
import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import type { Doc } from "@/lib/adapter";
import type { DocTypeMeta } from "@/lib/catalog";
import { addDays, addMonths, eventsOn, ganttBar, ganttColumns, initialMonth, monthGrid, type CalEvent, type GanttScale } from "@/lib/calendarViews";
import { openQuickView } from "@/components/enterprise/QuickView";
import { COLOR_CLASS } from "@/lib/engines";
import { useLang } from "@/i18n";

const todayIso = () => new Date().toISOString().slice(0, 10);
const loc = (ar: boolean) => (ar ? "ar-SA-u-ca-gregory-nu-latn" : "en-GB");
const monthName = (m: string, ar: boolean) => new Intl.DateTimeFormat(loc(ar), { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${m}-01T00:00:00Z`));
const dayName = (d: string, ar: boolean, style: "short" | "narrow" = "short") => new Intl.DateTimeFormat(loc(ar), { weekday: style, timeZone: "UTC" }).format(new Date(`${d}T00:00:00Z`));
const shortDate = (d: string, ar: boolean) => new Intl.DateTimeFormat(loc(ar), { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${d}T00:00:00Z`));

interface Props { meta: DocTypeMeta; events: CalEvent[]; tone: (d: Doc) => string | undefined; app: string; doctype: string; weekStart?: number }
const chip = (tone: string | undefined) => COLOR_CLASS[tone ?? ""] ?? "bg-primary/15 text-primary";

export function CalendarView({ meta, events, tone, weekStart = 0 }: Props) {
  const ar = useLang() === "ar";
  const today = todayIso();
  const [month, setMonth] = useState(() => initialMonth(events, today));
  const [open, setOpen] = useState<string | null>(null);
  const weeks = useMemo(() => monthGrid(month, weekStart), [month, weekStart]);
  const inMonth = events.filter((e) => e.start.slice(0, 7) <= month && month <= e.end.slice(0, 7)).length;
  return <section className="panel p-3" data-calendar-view={meta.name} data-cal-month={month} aria-label={ar ? "عرض التقويم" : "Calendar view"}>
    <header className="mb-3 flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1">
        <button type="button" className="btn-ghost" onClick={() => setMonth(addMonths(month, -1))} aria-label={ar ? "الشهر السابق" : "Previous month"} data-cal-prev>‹</button>
        <button type="button" className="btn-ghost" onClick={() => setMonth(today.slice(0, 7))} data-cal-today>{ar ? "اليوم" : "Today"}</button>
        <button type="button" className="btn-ghost" onClick={() => setMonth(addMonths(month, 1))} aria-label={ar ? "الشهر التالي" : "Next month"} data-cal-next>›</button>
      </div>
      <h2 className="text-base font-semibold" data-no-i18n>{monthName(month, ar)}</h2>
      <span className="ms-auto text-xs text-muted-foreground"><bdi data-no-i18n>{inMonth}</bdi> {ar ? "حدث في هذا الشهر" : inMonth === 1 ? "event this month" : "events this month"}</span>
    </header>
    <div className="grid grid-cols-7 border-b border-border pb-1 text-center text-xs font-medium text-muted-foreground" aria-hidden>
      {weeks[0]!.map((d) => <div key={d} data-no-i18n><span className="max-sm:hidden">{dayName(d, ar)}</span><span className="sm:hidden">{dayName(d, ar, "narrow")}</span></div>)}
    </div>
    <div className="grid grid-cols-7" role="grid">
      {weeks.flat().map((d) => {
        const es = eventsOn(events, d); const out = d.slice(0, 7) !== month; const isOpen = open === d;
        const shown = isOpen ? es : es.slice(0, 3);
        return <div key={d} role="gridcell" data-cal-day={d} data-cal-count={es.length}
          className={`min-h-24 border-b border-e border-border p-1 max-sm:min-h-16 ${out ? "bg-muted/40 text-muted-foreground" : ""} ${d === today ? "ring-1 ring-inset ring-primary" : ""}`}>
          <div className="mb-0.5 text-end text-xs tabular-nums" data-no-i18n>{Number(d.slice(8))}</div>
          {shown.map((e) => <button key={e.id} type="button" data-cal-event={e.doc} title={e.title}
            className={`mb-0.5 block w-full truncate rounded px-1 py-0.5 text-start text-[11px] leading-tight ${chip(tone(e.source))}`}
            onClick={(ev) => openQuickView({ kind: "doc", doctype: meta.name, name: e.doc }, ev.currentTarget)}><bdi data-no-i18n>{e.title}</bdi></button>)}
          {es.length > 3 && <button type="button" className="text-[11px] text-primary hover:underline" data-cal-more={d} onClick={() => setOpen(isOpen ? null : d)}>
            {isOpen ? (ar ? "أقل" : "Less") : <><bdi data-no-i18n>+{es.length - 3}</bdi> {ar ? "أخرى" : "more"}</>}</button>}
        </div>;
      })}
    </div>
    {!inMonth && <p className="mt-3 text-sm text-muted-foreground" data-cal-empty>{ar ? "لا توجد أحداث في هذا الشهر." : "No events in this month."}</p>}
  </section>;
}

const PAGE = 50;
export function GanttView({ meta, events, tone, app, doctype }: Props) {
  const ar = useLang() === "ar";
  const today = todayIso();
  const [scale, setScale] = useState<GanttScale>("Week");
  const [anchor, setAnchor] = useState(() => { const m = initialMonth(events, today); return m === today.slice(0, 7) ? today : `${m}-15`; });
  const [limit, setLimit] = useState(PAGE);
  const cols = useMemo(() => ganttColumns(anchor, scale), [anchor, scale]);
  const rows = events.map((e) => ({ e, bar: ganttBar(e, cols) })).filter((r) => r.bar);
  const step = scale === "Day" ? 7 : scale === "Week" ? 28 : 90;
  const todayBar = ganttBar({ start: today, end: today }, cols);
  const SCALES: [GanttScale, string][] = [["Day", "يوم"], ["Week", "أسبوع"], ["Month", "شهر"]];
  const colLabel = (c: { key: string; from: string }) => scale === "Month" ? new Intl.DateTimeFormat(loc(ar), { month: "short", timeZone: "UTC" }).format(new Date(`${c.from}T00:00:00Z`)) : scale === "Week" ? shortDate(c.from, ar) : String(Number(c.from.slice(8)));
  return <section className="panel p-3" data-gantt-view={meta.name} data-gantt-scale={scale} aria-label={ar ? "مخطط جانت" : "Gantt view"}>
    <header className="mb-3 flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1">
        <button type="button" className="btn-ghost" onClick={() => setAnchor(addDays(anchor, -step))} aria-label={ar ? "السابق" : "Previous"} data-gantt-prev>‹</button>
        <button type="button" className="btn-ghost" onClick={() => setAnchor(today)} data-gantt-today>{ar ? "اليوم" : "Today"}</button>
        <button type="button" className="btn-ghost" onClick={() => setAnchor(addDays(anchor, step))} aria-label={ar ? "التالي" : "Next"} data-gantt-next>›</button>
      </div>
      <div className="flex rounded-md border border-border p-0.5" role="group" aria-label={ar ? "مقياس العرض" : "View mode"}>
        {SCALES.map(([s, a]) => <button key={s} type="button" aria-pressed={scale === s} data-gantt-mode={s} onClick={() => setScale(s)}
          className={`rounded px-2 py-0.5 text-xs ${scale === s ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}>{ar ? a : s}</button>)}
      </div>
      <span className="ms-auto text-xs text-muted-foreground" data-no-i18n>{shortDate(cols[0]!.from, ar)} – {shortDate(cols[cols.length - 1]!.to, ar)}</span>
    </header>
    <div className="overflow-x-auto">
      <div className="min-w-[44rem]">
        <div className="grid grid-cols-[12rem_1fr] border-b border-border text-[11px] text-muted-foreground max-sm:grid-cols-[8rem_1fr]">
          <div className="px-2 py-1 font-medium">{ar ? "المستند" : "Document"}</div>
          <div className="grid" style={{ gridTemplateColumns: `repeat(${cols.length}, minmax(0, 1fr))` }} data-no-i18n>
            {cols.map((c) => <div key={c.key} className="border-s border-border px-0.5 py-1 text-center tabular-nums">{colLabel(c)}</div>)}
          </div>
        </div>
        {rows.slice(0, limit).map(({ e, bar }) => <div key={e.id} className="grid grid-cols-[12rem_1fr] border-b border-border/60 max-sm:grid-cols-[8rem_1fr]" data-gantt-row={e.doc}>
          <Link to="/app/$app/$doctype/$name" params={{ app, doctype, name: e.doc }} className="truncate px-2 py-1.5 text-xs hover:underline" title={e.title}
            onClick={(ev) => { if (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.button !== 0) return; ev.preventDefault(); openQuickView({ kind: "doc", doctype: meta.name, name: e.doc }, ev.currentTarget); }}><bdi data-no-i18n>{e.title}</bdi></Link>
          <div className="relative h-8">
            {todayBar && <span aria-hidden className="absolute inset-y-0 w-px bg-primary/60" style={{ insetInlineStart: `${todayBar.left + todayBar.width / 2}%` }} />}
            <button type="button" data-gantt-bar={e.doc} title={`${e.title} · ${e.start} → ${e.end}`}
              className={`absolute top-1.5 h-5 overflow-hidden rounded text-start text-[10px] leading-5 shadow-sm ${chip(tone(e.source))} ${bar!.clipStart ? "rounded-s-none" : ""} ${bar!.clipEnd ? "rounded-e-none" : ""}`}
              style={{ insetInlineStart: `${bar!.left}%`, width: `max(${bar!.width}%, 0.5rem)` }}
              onClick={(ev) => openQuickView({ kind: "doc", doctype: meta.name, name: e.doc }, ev.currentTarget)}>
              {e.progress !== undefined && <span aria-hidden className="absolute inset-y-0 start-0 bg-foreground/10" style={{ width: `${e.progress}%` }} />}
              <span className="relative px-1" data-no-i18n>{e.progress !== undefined ? `${Math.round(e.progress)}%` : ""}</span>
            </button>
          </div>
        </div>)}
      </div>
    </div>
    {!rows.length && <p className="mt-3 text-sm text-muted-foreground" data-gantt-empty>{ar ? "لا توجد مستندات في هذه الفترة." : "No documents in this period."}</p>}
    {rows.length > limit && <button type="button" className="btn-ghost mt-2" data-gantt-more onClick={() => setLimit(limit + PAGE)}>{ar ? "عرض المزيد" : "Show more"} (<bdi data-no-i18n>{rows.length - limit}</bdi>)</button>}
  </section>;
}
