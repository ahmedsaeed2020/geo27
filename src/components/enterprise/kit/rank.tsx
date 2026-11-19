/**
 * Ranked list card (owner 2026-11-12 evening §8): a ranked list never runs down the page. It is a half-width shared card
 * with the top rows (default 8) by NAME, bars scaled to the largest row, and "Show all" opens the full list in the shared
 * side panel. Pair two of them side by side with RankPair. Apps pass rows only (label = display name, never a code).
 */
import type { ReactNode } from "react";
import { openQuickView } from "../QuickView";

/** `of` (optional): the row's own budget / target — the bar then shows the share of it used, coloured by `level` (cost kit). */
export interface RankRow { key: string; label: ReactNode; value: number; shown: ReactNode; share?: number | undefined; onOpen?: (() => void) | undefined; title?: string | undefined; attrs?: Record<string, string>; of?: number | undefined; level?: "ok" | "warn" | "over" | "none" | undefined }
const barWidth = (r: RankRow, max: number) => r.of !== undefined ? (r.of > 0 ? Math.max(2, Math.min(100, Math.round((Math.abs(r.value) / r.of) * 100))) : r.value ? 100 : 0) : max > 0 ? Math.max(2, Math.round((Math.abs(r.value) / max) * 100)) : 0;
function Rows({ rows, max }: { rows: RankRow[]; max: number }) {
  return <ol className="ek-rank" data-ek-rank-rows={rows.length}>{rows.map((r) => <li key={r.key} {...r.attrs}>
    <span className="ek-rank-l" title={r.title}>{r.onOpen ? <button type="button" onClick={r.onOpen}>{r.label}</button> : r.label}</span>
    <span className="ek-rank-bar" aria-hidden {...(r.of !== undefined ? { "data-of": "" } : {})}><span style={{ width: `${barWidth(r, max)}%` }} {...(r.level ? { "data-level": r.level } : {})} /></span>
    <span className="ek-rank-v" data-no-i18n>{r.shown}</span>
    <span className="ek-rank-p" data-no-i18n>{r.share !== undefined ? `${r.share.toFixed(1)}%` : ""}</span>
  </li>)}</ol>;
}
export function RankCard({ title, sub, rows, top = 8, ar, id, empty, total, action }: { title: string; sub?: ReactNode; rows: RankRow[]; top?: number; ar: boolean; id?: string; empty?: ReactNode; total?: ReactNode; action?: ReactNode }) {
  const sorted = [...rows].sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
  const max = Math.max(0, ...sorted.map((r) => Math.abs(r.value)));
  const more = sorted.length > top;
  return <section className="ek-card ek-rank-card" data-ek-rank={id ?? ""} data-ek-rank-total={sorted.length}>
    <header className="ek-card-head"><div className="min-w-0"><h3 className="ek-h3">{title}</h3>{sub && <p className="ek-card-sub">{sub}</p>}</div>{action && <div className="ek-card-action">{action}</div>}</header>
    {sorted.length ? <Rows rows={sorted.slice(0, top)} max={max} /> : <div className="ek-card-pad text-sm text-muted-foreground">{empty ?? (ar ? "لا توجد بيانات." : "No data.")}</div>}
    {(more || total) && <footer className="ek-rank-foot"><span>{total}</span>
      {more && <button type="button" className="ek-card-link font-semibold" data-ek-rank-all onClick={(e) => openQuickView({ kind: "content", title, sub: ar ? `${sorted.length} صفًا` : `${sorted.length} rows`, node: <Rows rows={sorted} max={max} /> }, e.currentTarget)}>
        {ar ? `عرض الكل (${sorted.length})` : `Show all (${sorted.length})`}</button>}</footer>}
  </section>;
}
/** Two half-width cards side by side (stacked on narrow screens). */
export function RankPair({ children }: { children: ReactNode }) { return <div className="ek-pair" data-ek-pair>{children}</div>; }
/** A block that used to sit straight on the page, now inside the shared card (title + framed body). */
export function BlockCard({ title, sub, action, children, id, attrs }: { title: ReactNode; sub?: ReactNode; action?: ReactNode; children: ReactNode; id?: string; attrs?: Record<string, string | undefined> }) {
  return <section className="ek-card" data-ek-block={id ?? ""} {...attrs}>
    <header className="ek-card-head"><div className="min-w-0"><h3 className="ek-h3">{title}</h3>{sub && <p className="ek-card-sub">{sub}</p>}</div>{action && <div className="ek-card-action">{action}</div>}</header>
    <div className="ek-card-pad">{children}</div>
  </section>;
}
