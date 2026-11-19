/**
 * Enterprise reconciliation & receivables kit (PRO P2/P3, owner 2026-11-17) — display only; apps pass rows, figures, links
 * and actions, so every app shares one look:
 *  - SelectionBar: the floating bulk action bar that appears once rows are selected (count, total, actions, clear).
 *  - PaymentScore: payment-score card — one tick per recent invoice (on time ✓ green, late ! amber, overdue ✕ red, open ○ grey).
 *  - UpcomingList: upcoming payments / collections with a coloured due tag (اليوم · خلال 3 أيام · هذا الأسبوع · خلال 14 يومًا).
 */
import type { MouseEvent, ReactNode } from "react";

export interface SelAction { key: string; label: ReactNode; onClick: () => void; disabled?: boolean | undefined; primary?: boolean | undefined; hint?: string | undefined }
export function SelectionBar({ count, total, actions, onClear, onAll, allLabel, ar, attrs }: {
  count: number; total?: ReactNode; actions: SelAction[]; onClear: () => void; onAll?: (() => void) | undefined; allLabel?: ReactNode; ar: boolean; attrs?: Record<string, string> | undefined;
}) {
  if (!count) return null;
  return (
    <div className="ek-selbar" role="region" aria-label={ar ? "إجراءات البنود المحددة" : "Actions for the selected rows"} data-ek-selbar={count} {...attrs}>
      <span className="ek-selbar-n"><b data-no-i18n>{count.toLocaleString("en-US")}</b> {ar ? "محدد" : "selected"}</span>
      {total && <span className="ek-selbar-t">{total}</span>}
      {onAll && <button type="button" className="ek-selbar-link" onClick={onAll} data-ek-selbar-all>{allLabel ?? (ar ? "تحديد الكل" : "Select all")}</button>}
      <span className="ek-selbar-actions">{actions.map((a) => (
        <button key={a.key} type="button" className={a.primary ? "ek-selbar-btn ek-selbar-primary" : "ek-selbar-btn"} disabled={a.disabled} title={a.hint} onClick={a.onClick} data-ek-selbar-action={a.key}>{a.label}</button>
      ))}</span>
      <button type="button" className="ek-selbar-x" onClick={onClear} data-ek-selbar-clear>{ar ? "إلغاء التحديد" : "Clear selection"}</button>
    </div>
  );
}

export type ScoreMark = "ontime" | "late" | "overdue" | "open";
export interface ScoreTick { key: string; state: ScoreMark; title: string; onOpen?: ((e: MouseEvent<HTMLButtonElement>) => void) | undefined }
const GLYPH: Record<ScoreMark, string> = { ontime: "✓", late: "!", overdue: "✕", open: "○" };
export function PaymentScore({ title, sub, ticks, score, summary, legend, empty, ar, attrs }: {
  title: ReactNode; sub?: ReactNode; ticks: ScoreTick[]; score: number | null; summary?: ReactNode; legend: Record<ScoreMark, ReactNode>; empty?: ReactNode; ar: boolean; attrs?: Record<string, string> | undefined;
}) {
  const level = score === null ? "none" : score >= 80 ? "ok" : score >= 50 ? "warn" : "over";
  const count = (m: ScoreMark) => ticks.filter((t) => t.state === m).length;
  return (
    <section className="ek-card ek-score" data-ek-score={score === null ? "" : String(score)} {...attrs}>
      <header className="ek-card-head"><div className="min-w-0"><h3 className="ek-h3">{title}</h3>{sub && <p className="ek-card-sub">{sub}</p>}</div>
        <span className="ek-score-pct" data-level={level} data-no-i18n>{score === null ? "—" : `${score}%`}</span></header>
      <div className="ek-card-pad">
        {!ticks.length ? <p className="text-sm text-muted-foreground">{empty ?? (ar ? "لا توجد فواتير بعد." : "No invoices yet.")}</p> : <>
          <ol className="ek-score-ticks" aria-label={typeof title === "string" ? title : undefined}>{ticks.map((t) => (
            <li key={t.key}>{t.onOpen
              ? <button type="button" className="ek-score-tick" data-state={t.state} title={t.title} aria-label={t.title} onClick={t.onOpen} data-ek-tick={t.key}>{GLYPH[t.state]}</button>
              : <span className="ek-score-tick" data-state={t.state} title={t.title} aria-label={t.title} data-ek-tick={t.key}>{GLYPH[t.state]}</span>}</li>
          ))}</ol>
          {summary && <p className="ek-score-sum">{summary}</p>}
          <ul className="ek-score-legend">{(["ontime", "late", "overdue", "open"] as const).filter((m) => count(m)).map((m) => (
            <li key={m} data-ek-score-legend={m}><span className="ek-score-tick ek-score-mini" data-state={m} aria-hidden>{GLYPH[m]}</span>{legend[m]} <b data-no-i18n>{count(m)}</b></li>
          ))}</ul>
        </>}
      </div>
    </section>
  );
}

export type DueHue = "rose" | "amber" | "blue" | "emerald";
export interface UpcomingRow { key: string; date: ReactNode; label: ReactNode; sub?: ReactNode; amount: ReactNode; tag: { label: ReactNode; hue: DueHue }; attrs?: Record<string, string> | undefined }
export function UpcomingList({ title, sub, rows, total, empty, action, ar, attrs }: {
  title: ReactNode; sub?: ReactNode; rows: UpcomingRow[]; total?: ReactNode; empty?: ReactNode; action?: ReactNode; ar: boolean; attrs?: Record<string, string> | undefined;
}) {
  return (
    <section className="ek-card ek-upc" data-ek-upcoming={rows.length} {...attrs}>
      <header className="ek-card-head"><div className="min-w-0"><h3 className="ek-h3">{title}</h3>{sub && <p className="ek-card-sub">{sub}</p>}</div>{action && <div className="ek-card-action">{action}</div>}</header>
      {!rows.length ? <div className="ek-card-pad text-sm text-muted-foreground">{empty ?? (ar ? "لا شيء مستحق في هذه الفترة." : "Nothing due in this window.")}</div> :
        <ol className="ek-upc-rows">{rows.map((r) => (
          <li key={r.key} {...r.attrs}>
            <span className="ek-upc-date" data-no-i18n>{r.date}</span>
            <span className="ek-upc-main"><span className="ek-upc-label">{r.label}</span>{r.sub && <span className="ek-upc-sub">{r.sub}</span>}</span>
            <span className="ek-upc-tag" style={{ color: `var(--${r.tag.hue})`, background: `color-mix(in oklab, var(--${r.tag.hue}) 12%, var(--card))` }} data-hue={r.tag.hue}>{r.tag.label}</span>
            <span className="ek-upc-amt" data-no-i18n>{r.amount}</span>
          </li>
        ))}</ol>}
      {total && rows.length > 0 && <footer className="ek-rank-foot"><span>{total}</span></footer>}
    </section>
  );
}
/** The due tag of a date `days` from today: today rose, within 3 days amber, within 7 days blue, within 14 days emerald. */
export function dueTag(days: number, ar: boolean): { label: string; hue: DueHue } {
  if (days <= 0) return { label: ar ? "اليوم" : "Today", hue: "rose" };
  if (days <= 3) return { label: ar ? "خلال 3 أيام" : "Within 3 days", hue: "amber" };
  if (days <= 7) return { label: ar ? "هذا الأسبوع" : "This week", hue: "blue" };
  return { label: ar ? "خلال 14 يومًا" : "Within 14 days", hue: "emerald" };
}
