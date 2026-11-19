/**
 * Enterprise people pieces (owner round H2/H3, 2026-11-17): a balance card (coloured edge, one large «15 يوم متاح»
 * figure, the lines that make it), a year bar calendar (row per person, a bar per absence across twelve months, the
 * overlap strip on top), a notice card (a risk with its list and one action) and an edited value (the new amount above
 * the struck-through original). Display only — apps pass figures, colours, labels and links.
 */
import type { ReactNode } from "react";

export interface BalanceLine { key: string; label: ReactNode; value: ReactNode; tone?: "ok" | "warn" | "bad" | "info" | undefined }
/** One leave type: edge in its colour, the big available figure, then approved / pending / remaining and an optional action. */
export function BalanceCard({ hue, title, big, unit, lines, foot, attrs }: { hue: string; title: ReactNode; big: ReactNode; unit: ReactNode; lines: BalanceLine[]; foot?: ReactNode; attrs?: Record<string, string | number> }) {
  return <article className="ek-bal" style={{ ["--bal" as string]: `var(--${hue})` }} {...attrs}>
    <header className="ek-bal-t">{title}</header>
    <p className="ek-bal-big"><bdi data-no-i18n>{big}</bdi> <span className="ek-bal-u">{unit}</span></p>
    <dl className="ek-bal-lines">{lines.map((l) => <div key={l.key} data-bal-line={l.key} data-tone={l.tone}><dt>{l.label}</dt><dd><bdi data-no-i18n>{l.value}</bdi></dd></div>)}</dl>
    {foot && <footer className="ek-bal-foot">{foot}</footer>}
  </article>;
}

export interface YearSpanView { key: string; from: number; to: number; hue: string; open?: boolean | undefined; title: string; link?: ((node: ReactNode) => ReactNode) | undefined }
export interface YearRowView { key: string; head: ReactNode; sub?: ReactNode; spans: YearSpanView[]; total?: ReactNode }
/** Twelve month columns; each row a person with a bar per absence (striped while requested); the strip on top colours the
 *  days on which two or more people of one team are away. `days` = days in the year, `today` = index of today (or −1). */
export function YearBars({ months, rows, overlap, days, today, labels, legend, empty, attrs }: {
  months: string[]; rows: YearRowView[]; overlap: number[]; days: number; today: number;
  labels: { people: ReactNode; overlap: ReactNode; total: ReactNode }; legend?: ReactNode; empty?: ReactNode; attrs?: Record<string, string | number>;
}) {
  const pc = (i: number) => `${(Math.max(0, Math.min(days, i)) / days) * 100}%`;
  // the overlap strip: consecutive days with the same level form one segment
  const segs: { a: number; b: number; v: number }[] = [];
  overlap.forEach((v, i) => { const lv = v >= 3 ? 3 : v >= 2 ? 2 : 0; const last = segs[segs.length - 1]; if (lv && last && last.v === lv && last.b === i - 1) last.b = i; else if (lv) segs.push({ a: i, b: i, v: lv }); });
  return <section className="ek-yb" data-year-bars={rows.length} {...attrs}>
    {!rows.length ? <p className="ek-wb-empty">{empty}</p> : <div className="ek-yb-scroll"><div className="ek-yb-grid">
      <div className="ek-yb-head"><span className="ek-yb-who">{labels.people}</span><div className="ek-yb-months">{months.map((m, i) => <span key={i} data-no-i18n>{m}</span>)}</div><span className="ek-yb-tot">{labels.total}</span></div>
      <div className="ek-yb-row ek-yb-ov" data-yb-overlap={segs.length}><span className="ek-yb-who">{labels.overlap}</span><div className="ek-yb-track">{segs.map((g) => <i key={g.a} className="ek-yb-ovs" data-level={g.v} style={{ insetInlineStart: pc(g.a), inlineSize: pc(g.b - g.a + 1) }} />)}{today >= 0 && <b className="ek-yb-today" style={{ insetInlineStart: pc(today) }} />}</div><span className="ek-yb-tot" /></div>
      {rows.map((r) => <div key={r.key} className="ek-yb-row" data-yb-row={r.key}>
        <span className="ek-yb-who"><span className="ek-yb-n">{r.head}</span>{r.sub && <span className="ek-yb-s">{r.sub}</span>}</span>
        <div className="ek-yb-track">{months.map((_, i) => <i key={i} className="ek-yb-grid-l" style={{ insetInlineStart: `${(i / 12) * 100}%` }} />)}
          {r.spans.map((sp) => { const bar = <span className="ek-yb-bar" data-open={sp.open || undefined} title={sp.title} aria-label={sp.title} style={{ ["--yb" as string]: `var(--${sp.hue})`, insetInlineStart: pc(sp.from), inlineSize: `max(4px, ${pc(sp.to - sp.from + 1)})` }} data-yb-span={sp.key} />; return sp.link ? <span key={sp.key} className="contents">{sp.link(bar)}</span> : <span key={sp.key} className="contents">{bar}</span>; })}
          {today >= 0 && <b className="ek-yb-today" style={{ insetInlineStart: pc(today) }} />}</div>
        <span className="ek-yb-tot">{r.total}</span>
      </div>)}
    </div></div>}
    {legend && <footer className="ek-wb-legend">{legend}</footer>}
  </section>;
}

/** A risk card: tone edge, a headline figure, the people / items behind it and one action. */
export function NoticeCard({ tone = "warn", title, big, sub, items, action, attrs }: { tone?: "warn" | "bad" | "info" | undefined; title: ReactNode; big: ReactNode; sub?: ReactNode; items: { key: string; label: ReactNode; value: ReactNode; link?: ((n: ReactNode) => ReactNode) | undefined }[]; action?: ReactNode; attrs?: Record<string, string | number> }) {
  return <article className="ek-note" data-tone={tone} {...attrs}>
    <header className="ek-note-h"><span className="ek-note-t">{title}</span></header>
    <p className="ek-note-big">{big}</p>{sub && <p className="ek-note-sub">{sub}</p>}
    {items.length > 0 && <ul className="ek-note-list">{items.map((it) => <li key={it.key} data-note-item={it.key}>{it.link ? it.link(<span className="ek-note-l">{it.label}</span>) : <span className="ek-note-l">{it.label}</span>}<bdi className="ek-note-v" data-no-i18n>{it.value}</bdi></li>)}</ul>}
    {action && <footer className="ek-note-a">{action}</footer>}
  </article>;
}

/** An edited figure: the value now above the original, struck through (e.g. a prorated salary component). */
export function EditedValue({ now, was, why }: { now: ReactNode; was?: ReactNode; why?: string | undefined }) {
  if (was === undefined || was === null || was === "") return <bdi data-no-i18n>{now}</bdi>;
  return <span className="ek-ev" title={why} data-edited><bdi className="ek-ev-now" data-no-i18n>{now}</bdi><s className="ek-ev-was" data-no-i18n>{was}</s></span>;
}

/** A small round avatar with initials in a colour (table rows, lists). */
export function Avatar({ name, hue, size = 28 }: { name: string; hue: string; size?: number }) {
  const ini = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("");
  return <span className="ek-av" aria-hidden style={{ ["--av" as string]: `var(--${hue})`, inlineSize: size, blockSize: size, fontSize: Math.round(size * 0.4) }} data-no-i18n>{ini}</span>;
}
