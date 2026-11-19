/**
 * Enterprise record profile blocks (Visual Round 1 §E — first used by Employee 360): the facts card (4-column grid, missing
 * facts as dashed amber «أضف» cells, «ناقص N بيانات» chip in the card head), the counters row (equal KPI cards with icon
 * tiles), the activity timeline (month headers with event counts, one coloured category tile per row, tinted status chips,
 * mono record links, a five-dot mini-bar per folded week), the relations rail (module-colour count pills, greyed zeros, mini
 * donut of the records by category) and the tab row (fills the row, count pills, 3px underline, search at the row end).
 * Owner page rules 10–17 (Employee 360 review): counters carry their category colour (first one Featured), month headers sit
 * on paper with the month total, action rows are tinted, rails and the facts card use the 40% emerald tint, one colour per
 * category across donut, rail, tabs and row tiles, and the row tile replaces the repeated category text.
 * Apps pass labels, values, links and categories only; colour and layout live here and in round1.css.
 */
import { cloneElement, isValidElement, useEffect, useState, useSyncExternalStore, type ReactElement, type ReactNode } from "react";
import { KpiCard, KpiIcon, KpiSlots, type KpiIconKind } from "./kit/KpiCard";
import { Donut, type Datum, type Wrap } from "./kit/charts";

export type ProfileHue = "emerald" | "teal" | "blue" | "violet" | "amber" | "coral" | "gold" | "rose" | "lime";

/* ---------- facts card ---------- */
export interface Fact { key: string; label: ReactNode; value?: ReactNode; missing?: boolean; /** what a missing cell offers instead of the generic «أضف +» link (e.g. an action button) */ fill?: ReactNode }
export function FactGrid({ title, facts, ar, addLink }: { title: ReactNode; facts: Fact[]; ar: boolean; /** wraps an «أضف» cell (opens the record form) */ addLink?: (node: ReactNode, key: string) => ReactNode }) {
  const miss = facts.filter((f) => f.missing).length;
  return <section className="ek-card r1-facts" data-r1-facts data-missing={miss}>
    <header className="r1-facts-head"><h3 className="ek-h3">{title}</h3>
      {miss > 0 && <span className="r1-miss-chip" data-r1-miss={miss}>{ar ? <>ناقص <bdi data-no-i18n>{miss}</bdi> بيانات</> : <><bdi data-no-i18n>{miss}</bdi> details missing</>}</span>}</header>
    <dl className="r1-facts-grid">
      {facts.map((f) => <div key={f.key} className="r1-fact" data-fact={f.key} data-missing={f.missing ? "yes" : undefined}>
        <dt>{f.label}</dt>
        <dd>{f.missing && f.fill ? f.fill : f.missing ? (addLink ? addLink(<span className="r1-add">{ar ? "أضف" : "Add"} +</span>, f.key) : <span className="r1-add">{ar ? "أضف" : "Add"} +</span>) : f.value}</dd>
      </div>)}
    </dl>
  </section>;
}

/* ---------- counters ---------- */
/** A page's own counter root (a button that opens a tab) receives only className/children; the card's variant, hue and
 *  counter attributes are put back on the element it returns, so the shared colour rules always reach the card. */
const withAttrs = (Root: NonNullable<Counter["Root"]>) => (rp: { className: string; children: ReactNode } & Record<string, unknown>) => {
  const { className, children, ...rest } = rp; const el = Root({ className, children });
  return isValidElement(el) ? cloneElement(el as ReactElement<Record<string, unknown>>, rest) : el;
};
export interface Counter { key: string; label: ReactNode; value: number; icon: KpiIconKind; meta?: ReactNode; /** category colour: icon tile, value and 3px top border (page rule 11) */ hue?: ProfileHue | undefined; Root?: ((p: { children: ReactNode; className?: string }) => ReactNode) | undefined }
export function CountRow({ items, ar }: { items: Counter[]; ar: boolean }) {
  return <div className="ek-kpi-grid r1-counters" data-r1-counters={items.length}><KpiSlots lead={false}>
    {items.map((c, i) => <KpiCard key={c.key} ar={ar} label={c.label} value={c.value.toLocaleString("en-US")} icon={c.icon} variant={i === 0 ? "featured" : "standard"} meta={c.meta} Root={c.Root ? withAttrs(c.Root) : undefined} attrs={{ "data-r1-counter": c.key, "data-value": c.value, ...(c.hue ? { "data-hue": c.hue } : {}) }} />)}
  </KpiSlots></div>;
}

/* ---------- timeline ---------- */
export type StatusTone = "ok" | "bad" | "warn" | "info" | "off";
export interface TlCat { key: string; label: ReactNode; hue: ProfileHue; icon: KpiIconKind }
export interface TlStatus { label: ReactNode; tone: StatusTone; n?: number | undefined }
export interface TlRow {
  key: string; date: string; cat: TlCat; title: ReactNode; link?: ReactNode; status?: TlStatus[]; attrs?: Record<string, string | number | undefined>;
  /** a row needing action gets a tinted background (page rule 12): an absence rose, a half day amber, a draft blue */
  attn?: "absent" | "half" | "draft" | undefined;
  /** a folded week: its start/end, the tone of each of its first five days and the records inside */
  week?: { start: string; end: string; dots: StatusTone[]; count: number; detail?: ReactNode } | undefined;
}
const MONTHS_AR = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
const MONTHS_EN = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export const monthTitle = (ym: string, ar: boolean) => { const m = Number(ym.slice(5, 7)) - 1; return `${(ar ? MONTHS_AR : MONTHS_EN)[m] ?? ym} ${ym.slice(0, 4)}`; };
const dm = (iso: string) => (iso.length >= 10 ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : iso || "—");
/** Rows grouped by month (newest first, as given), each month headed by «نوفمبر 2026 · 12 حدث». */
export function monthGroups(rows: TlRow[]): [string, TlRow[], number][] {
  const out: [string, TlRow[], number][] = [];
  for (const r of rows) { const ym = r.date.slice(0, 7) || "—"; let g = out.find((x) => x[0] === ym); if (!g) { g = [ym, [], 0]; out.push(g); } g[1].push(r); g[2] += r.week ? r.week.count : 1; }
  return out;
}
export function ActivityTimeline({ rows, ar, empty, attrs }: { rows: TlRow[]; ar: boolean; empty: ReactNode; attrs?: Record<string, string | number> }) {
  if (!rows.length) return <p className="p-6 text-muted-foreground">{empty}</p>;
  return <div className="r1-tl" {...attrs}>
    {monthGroups(rows).map(([ym, list, n]) => <section key={ym} className="r1-tl-month" data-r1-tl-month={ym} data-count={n}>
      <h4 className="r1-tl-mh"><span>{ym === "—" ? (ar ? "بدون تاريخ" : "Undated") : monthTitle(ym, ar)}</span> <span className="r1-tl-mh-n" data-r1-month-total={n}><bdi data-no-i18n>{n}</bdi> {ar ? "حدث" : n === 1 ? "event" : "events"}</span></h4>
      <ol className="r1-tl-list">{list.map((r) => <li key={r.key} className="r1-tl-row" data-hue={r.cat.hue} data-r1-tl-cat={r.cat.key} {...(r.attn ? { "data-attn": r.attn } : {})} {...r.attrs}>
        {r.week ? <details className="r1-tl-week">
          <summary className="r1-tl-line"><RowHead r={r} ar={ar} /></summary>
          {r.week.detail}
        </details> : <div className="r1-tl-line"><RowHead r={r} ar={ar} /></div>}
      </li>)}</ol>
    </section>)}
  </div>;
}
function RowHead({ r, ar }: { r: TlRow; ar: boolean }) {
  return <>
    <span className="r1-tl-tile" aria-hidden title={typeof r.cat.label === "string" ? r.cat.label : undefined}><KpiIcon kind={r.cat.icon} /></span>
    <span className="r1-tl-date" data-no-i18n>{r.week ? <bdi dir="ltr">{`${r.week.start.slice(8, 10)}/${r.week.start.slice(5, 7)} → ${dm(r.week.end)}`}</bdi> : dm(r.date)}</span>
    <span className="r1-tl-cat sr-only">{r.cat.label}</span>
    <span className="r1-tl-title">{r.title}</span>
    {r.link && <span className="r1-tl-link">{r.link}</span>}
    {r.week && <span className="r1-tl-dots" role="img" aria-label={ar ? "أيام الأسبوع" : "Days of the week"} data-r1-dots={r.week.dots.join(",")}>{r.week.dots.map((t, i) => <i key={i} data-tone={t} />)}</span>}
    {!!r.status?.length && <span className="r1-tl-status">{r.status.map((s, i) => <span key={i} className="r1-chip" data-tone={s.tone}>{s.label}{s.n !== undefined && <> <bdi data-no-i18n>{s.n}</bdi></>}</span>)}</span>}
  </>;
}

/* ---------- relations rail ---------- */
export interface RailItem { key: string; label: ReactNode; count: number | null; hue: ProfileHue; active: boolean; onPick: () => void; icon?: ReactNode; attrs?: Record<string, string> }
export function RelationRail({ items, donut, ar, label, wrap }: { items: RailItem[]; donut?: Datum[] | undefined; ar: boolean; label: string; wrap?: Wrap }) {
  return <nav aria-label={label} className="r1-rail" data-emp-rail>
    {donut && donut.some((d) => d.value > 0) && <div className="r1-rail-donut" data-r1-rail-donut={donut.reduce((s, d) => s + d.value, 0)}><Donut data={donut} ar={ar} max={6} {...(wrap ? { wrap } : {})} centerLabel={ar ? "سجل" : "records"} /></div>}
    <div role="tablist" aria-orientation="vertical" className="r1-rail-list">
      {items.map((it) => <button key={it.key} type="button" role="tab" aria-selected={it.active} onClick={it.onPick} data-tab={it.key} className="r1-rail-item" data-hue={it.hue} {...it.attrs}>
        <span className="r1-rail-l">{it.icon}{it.label}</span>
        {it.count !== null && <bdi className="r1-rail-n" data-zero={it.count === 0 ? "yes" : undefined} data-no-i18n>{it.count.toLocaleString("en-US")}</bdi>}
      </button>)}
    </div>
  </nav>;
}

/* ---------- tab row ---------- */
export interface RowTab { key: string; label: ReactNode; count: number; hue?: ProfileHue | undefined }
export function TabRow({ tabs, active, onPick, end, label }: { tabs: RowTab[]; active: string; onPick: (k: string) => void; end?: ReactNode; label: string }) {
  return <div className="r1-tabrow" data-r1-tabrow>
    <div role="tablist" aria-label={label} className="r1-tabrow-tabs">
      {tabs.map((t) => <button key={t.key} type="button" role="tab" aria-selected={t.key === active} aria-pressed={t.key === active} onClick={() => onPick(t.key)} className="r1-tabrow-tab" data-hue={t.hue} data-timeline-group={t.key || undefined}>
        <span>{t.label}</span><bdi className="r1-tabrow-n" data-no-i18n>{t.count.toLocaleString("en-US")}</bdi></button>)}
    </div>
    {end && <div className="r1-tabrow-end">{end}</div>}
  </div>;
}

/* ---------- page company: the record on screen names the company the top bar shows ---------- */
let pageCompany = ""; const subs = new Set<() => void>();
const setPageCompany = (c: string) => { if (c === pageCompany) return; pageCompany = c; subs.forEach((f) => f()); };
/** A record page names its company so the shared top bar shows the same one (cleared when the page leaves). */
export function usePageCompany(company: string | undefined) {
  useEffect(() => { setPageCompany(company ?? ""); return () => setPageCompany(""); }, [company]);
}
export const usePageCompanyValue = () => useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, () => pageCompany, () => "");

/* ---------- side summary card (owner round H1-03): the record's state at a glance, fixed beside the facts ---------- */
export interface SummaryRow { key: string; label: ReactNode; value?: ReactNode; hue?: ProfileHue | undefined; missing?: boolean }
/** A compact card that stays in view while the page scrolls (sticky from tablet width up): a status pill, then label / value
 *  rows; a row may carry a colour dot (e.g. the department colour) and an empty value reads «—». */
export function SummaryCard({ title, status, rows, footer, ar, attrs }: { title: ReactNode; status?: { label: ReactNode; tone: StatusTone } | undefined; rows: SummaryRow[]; footer?: ReactNode; ar: boolean; attrs?: Record<string, string | number> }) {
  return <aside className="ek-card r1-summary" data-r1-summary {...attrs}>
    <header className="r1-summary-head"><h3 className="ek-h3">{title}</h3>{status && <span className="r1-chip r1-summary-status" data-tone={status.tone} data-r1-summary-status>{status.label}</span>}</header>
    <dl className="r1-summary-rows">{rows.map((r) => <div key={r.key} className="r1-summary-row" data-summary={r.key} data-missing={r.missing ? "yes" : undefined} {...(r.hue ? { "data-hue": r.hue } : {})}>
      <dt>{r.hue && <i className="r1-summary-dot" aria-hidden />}{r.label}</dt><dd>{r.missing || r.value === undefined || r.value === null || r.value === "" ? <span className="text-muted-foreground">{ar ? "غير مسجل" : "Not recorded"}</span> : r.value}</dd>
    </div>)}</dl>
    {footer && <footer className="r1-summary-foot">{footer}</footer>}
  </aside>;
}

/* ---------- sensitive facts (owner round H1-02): masked until the reader switches them on; never rendered without access ---------- */
export interface SensitiveFact { key: string; label: ReactNode; value: ReactNode; sub?: ReactNode }
/** «إظهار البيانات الحساسة»: salary / bank / insurance / medical facts in the same 4-column grid, masked by default. A reader
 *  without access sees one line saying so and no switch — the values are never passed in for them. */
export function SensitiveFacts({ ar, allowed, facts, deniedNote, attrs }: { ar: boolean; allowed: boolean; facts: SensitiveFact[]; deniedNote: ReactNode; attrs?: Record<string, string | number> }) {
  const [show, setShow] = useState(false);
  if (!allowed) return <section className="ek-card r1-facts r1-sensitive" data-r1-sensitive="denied" {...attrs}><p className="r1-sensitive-denied">{deniedNote}</p></section>;
  return <section className="ek-card r1-facts r1-sensitive" data-r1-sensitive={show ? "shown" : "masked"} {...attrs}>
    <header className="r1-facts-head"><h3 className="ek-h3">{ar ? "البيانات الحساسة" : "Sensitive details"}</h3>
      <label className="r1-switch"><span>{ar ? "إظهار البيانات الحساسة" : "Show sensitive details"}</span>
        <button type="button" role="switch" aria-checked={show} className="r1-switch-btn" onClick={() => setShow((v) => !v)} data-r1-sensitive-toggle><i aria-hidden /></button></label></header>
    <dl className="r1-facts-grid">{facts.map((f) => <div key={f.key} className="r1-fact" data-fact={f.key} data-sensitive={f.key}>
      <dt>{f.label}</dt><dd>{show ? <>{f.value}{f.sub && <span className="r1-fact-sub">{f.sub}</span>}</> : <span className="r1-mask" aria-label={ar ? "مخفي" : "Hidden"} data-no-i18n>••••••</span>}</dd>
    </div>)}</dl>
  </section>;
}
