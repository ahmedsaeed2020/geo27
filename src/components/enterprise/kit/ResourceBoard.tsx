/**
 * Enterprise resource boards (Round 2 ideas 1–4): a week board (row per resource, column per day, footer rows of day
 * totals), coloured cards inside a cell, a load meter (booked / used of available, green within, red over) and hour bars
 * (recorded against scheduled, overtime in red). Display only — apps pass rows, days, cells and figures.
 */
import type { ReactNode } from "react";

export type BoardHue = "blue" | "violet" | "amber" | "teal" | "emerald" | "coral" | "rose" | "gold" | "grey";
export interface BoardDay { key: string; label: ReactNode; sub?: ReactNode; today?: boolean; off?: boolean }
export interface BoardRow { key: string; head: ReactNode; sub?: ReactNode; tag?: ReactNode }
export interface BoardFoot { key: string; label: ReactNode; cell: (day: string) => ReactNode; total?: ReactNode; tone?: "plain" | "strong" }

export function WeekBoard({ rows, days, cell, foot = [], title, nav, legend, rowHead, totalHead, empty, attrs }: {
  rows: BoardRow[]; days: BoardDay[]; cell: (row: string, day: string) => ReactNode; foot?: BoardFoot[];
  title?: ReactNode; nav?: ReactNode; legend?: ReactNode; rowHead: ReactNode; totalHead?: ReactNode; empty?: ReactNode; attrs?: Record<string, string>;
}) {
  const hasTotal = foot.some((f) => f.total !== undefined);
  return (
    <section className="ek-wb" data-week-board {...attrs}>
      {(title || nav) && <header className="ek-wb-top">{title && <h3 className="ek-wb-title">{title}</h3>}{nav && <div className="ek-wb-nav">{nav}</div>}</header>}
      {!rows.length ? <p className="ek-wb-empty">{empty}</p> : (
        <div className="ek-wb-scroll">
          <table className="ek-wb-table">
            <thead><tr>
              <th className="ek-wb-stick" scope="col">{rowHead}</th>
              {days.map((d) => <th key={d.key} scope="col" className="ek-wb-day" data-today={d.today || undefined} data-off={d.off || undefined}><span className="ek-wb-dl">{d.label}</span>{d.sub && <span className="ek-wb-ds" data-no-i18n>{d.sub}</span>}</th>)}
              {hasTotal && <th scope="col" className="ek-wb-day ek-wb-tot">{totalHead}</th>}
            </tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} data-wb-row={r.key}>
                  <th scope="row" className="ek-wb-stick ek-wb-rh"><div className="ek-wb-rn">{r.head}</div>{r.sub && <div className="ek-wb-rs">{r.sub}</div>}{r.tag && <div className="ek-wb-rt">{r.tag}</div>}</th>
                  {days.map((d) => <td key={d.key} className="ek-wb-cell" data-off={d.off || undefined} data-today={d.today || undefined} data-wb-cell={`${r.key}|${d.key}`}>{cell(r.key, d.key)}</td>)}
                  {hasTotal && <td className="ek-wb-cell ek-wb-tot" />}
                </tr>
              ))}
            </tbody>
            {foot.length > 0 && <tfoot>
              {foot.map((f) => (
                <tr key={f.key} data-wb-foot={f.key} data-tone={f.tone}>
                  <th scope="row" className="ek-wb-stick ek-wb-fh">{f.label}</th>
                  {days.map((d) => <td key={d.key} className="ek-wb-fc" data-off={d.off || undefined}>{f.cell(d.key)}</td>)}
                  {hasTotal && <td className="ek-wb-fc ek-wb-tot">{f.total}</td>}
                </tr>
              ))}
            </tfoot>}
          </table>
        </div>
      )}
      {legend && <footer className="ek-wb-legend">{legend}</footer>}
    </section>
  );
}

/** A coloured card inside a board cell (e.g. a crew role: «فني ×6 · 48 س»), with an optional alert line in red. */
export function BoardCard({ hue, title, value, alert, href, attrs }: { hue: BoardHue; title: ReactNode; value?: ReactNode; alert?: ReactNode; href?: ReactNode; attrs?: Record<string, string> }) {
  return (
    <div className="ek-bc" style={{ ["--bc" as string]: `var(--${hue})` }} {...attrs}>
      <div className="ek-bc-top"><span className="ek-bc-t">{title}</span>{value !== undefined && <span className="ek-bc-v">{value}</span>}</div>
      {alert && <div className="ek-bc-alert" data-bc-alert>{alert}</div>}
      {href}
    </div>
  );
}

/** Booked / used of available: a bar filled green within the available, red past it; «غير متاحة» when available is unknown. */
export function LoadMeter({ used, available, label, na, warnAt = 1 }: { used: number; available: number | null; label: ReactNode; na?: ReactNode; warnAt?: number }) {
  if (available === null || !(available > 0)) return <div className="ek-lm" data-load="na"><span className="ek-lm-na">{na}</span></div>;
  const r = used / available; const state = r > warnAt ? "over" : r >= 0.75 ? "ok" : "low";
  return (
    <div className="ek-lm" data-load={state} title={typeof label === "string" ? label : undefined}>
      <div className="ek-lm-bar" aria-hidden><span style={{ inlineSize: `${Math.min(100, r * 100)}%` }} />{r > 1 && <i style={{ inlineSize: `${Math.min(100, (r - 1) * 100)}%` }} />}</div>
      <div className="ek-lm-l">{label}</div>
    </div>
  );
}

/** Percentage strip for a budget line (≤100% green, ≤110% amber, over red). */
export function PctMeter({ pct, label }: { pct: number | null; label: ReactNode }) {
  if (pct === null) return <span className="ek-lm-na">{label}</span>;
  const state = pct > 110 ? "over" : pct > 100 ? "warn" : "ok";
  return <div className="ek-pm" data-pct={state}><div className="ek-lm-bar" aria-hidden><span style={{ inlineSize: `${Math.min(100, pct)}%` }} /></div><div className="ek-lm-l">{label}</div></div>;
}

export interface HourRow { key: string; who: ReactNode; sub?: ReactNode; scheduled: number; normal: number; overtime: number; note?: ReactNode;
  /** clock positions on an axis that starts at `from` (owner round H2-05): the shift window, the first IN – last OUT and
   *  late / early marks; rows without `at` keep the duration bars */
  at?: { sched?: [number, number] | null | undefined; rec?: [number, number | null] | undefined; marks?: { kind: "late" | "early"; at: number; label?: string | undefined }[] | undefined } | undefined }
/** Recorded hours against the scheduled day per person: outline = scheduled, filled = recorded, red = overtime. With `from`
 *  the axis is a clock (hour `from` to `from + axis`) and rows placed by `at` show when, not only how long. */
export function HourBars({ rows, axis = 12, hourLabel, ar, legend, empty, from }: { rows: HourRow[]; axis?: number; hourLabel: (h: number) => string; ar: boolean; legend?: ReactNode; empty?: ReactNode; from?: number | undefined }) {
  const pc = (h: number) => `${(Math.min(axis, Math.max(0, h)) / axis) * 100}%`;
  const ticks = Array.from({ length: Math.floor(axis / 2) + 1 }, (_, i) => i * 2);
  const o = from ?? 0; const clock = (h: number) => h - o;
  return (
    <section className="ek-hb" data-hour-bars={rows.length} dir={ar ? "rtl" : "ltr"}>
      {!rows.length ? <p className="ek-wb-empty">{empty}</p> : <>
        <div className="ek-hb-axis" aria-hidden><span />{<div className="ek-hb-ticks">{ticks.map((t, i) => <span key={t} style={{ insetInlineStart: pc(t) }} data-odd={i % 2 === 1 || undefined} data-no-i18n>{hourLabel(t + o)}</span>)}</div>}</div>
        {rows.map((r) => (
          <div key={r.key} className="ek-hb-row" data-hb-row={r.key} data-ot={r.overtime > 0 || undefined}>
            <div className="ek-hb-who"><span className="ek-hb-n">{r.who}</span>{r.sub && <span className="ek-hb-s">{r.sub}</span>}</div>
            <div className="ek-hb-track">
              {ticks.map((t) => <i key={t} className="ek-hb-grid" style={{ insetInlineStart: pc(t) }} />)}
              {r.at ? <>
                {r.at.sched && <span className="ek-hb-sched" data-at style={{ insetInlineStart: pc(clock(r.at.sched[0])), inlineSize: pc(r.at.sched[1] - r.at.sched[0]) }} data-hb-sched={r.scheduled} />}
                {r.at.rec && <span className="ek-hb-rec" data-at style={{ insetInlineStart: pc(clock(r.at.rec[0])), inlineSize: r.at.rec[1] !== null ? pc(r.at.rec[1] - r.at.rec[0]) : "6px" }} data-hb-rec={r.normal} data-open-end={r.at.rec[1] === null || undefined} />}
                {r.overtime > 0 && r.at.sched && <span className="ek-hb-ot" style={{ insetInlineStart: pc(clock(r.at.sched[1])), inlineSize: pc(r.overtime) }} data-hb-ot={r.overtime} />}
                {(r.at.marks ?? []).map((m, i) => <i key={i} className="ek-hb-mark" data-kind={m.kind} style={{ insetInlineStart: pc(clock(m.at)) }} title={m.label} data-hb-mark={m.kind} />)}
              </> : <>
              {r.scheduled > 0 && <span className="ek-hb-sched" style={{ inlineSize: pc(r.scheduled) }} data-hb-sched={r.scheduled} />}
              {r.normal > 0 && <span className="ek-hb-rec" style={{ inlineSize: pc(r.normal) }} data-hb-rec={r.normal} />}
              {r.overtime > 0 && <span className="ek-hb-ot" style={{ insetInlineStart: pc(r.normal), inlineSize: pc(r.overtime) }} data-hb-ot={r.overtime} />}
              </>}
            </div>
            <div className="ek-hb-note">{r.note}</div>
          </div>
        ))}
      </>}
      {legend && <footer className="ek-wb-legend">{legend}</footer>}
    </section>
  );
}
