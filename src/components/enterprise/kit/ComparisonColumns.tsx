/**
 * Enterprise comparison columns (Round 2 idea 5): the lines are rows and every offer is a column card. The cheapest
 * qualified column carries a ribbon, a non-comparable column (draft, expired, excluded, not qualified, no offer) is greyed
 * with its reason, a line priced only by a plug is hatched, and each column carries its own action underneath («رسّي»).
 * Cells can be picked one per line for a split award. Display only — apps pass rows, columns, cells and actions.
 */
import type { ReactNode } from "react";

export type CmpHue = "emerald" | "amber" | "rose" | "blue" | "quiet";
export interface CmpBadge { label: string; hue: CmpHue }
export interface CmpRow { key: string; label: ReactNode; sub?: ReactNode | undefined; qty?: ReactNode | undefined; awarded?: boolean | undefined }
export interface CmpColumn {
  key: string; title: ReactNode; sub?: ReactNode | undefined; total: ReactNode; totalNote?: ReactNode | undefined;
  rank?: number | null | undefined; best?: boolean | undefined;
  /** reason the column is not comparable (greyed); absent = comparable */
  muted?: string | undefined;
  badges?: CmpBadge[] | undefined; footer?: ReactNode | undefined;
}
export interface CmpCell {
  display: ReactNode; best?: boolean | undefined; plugged?: boolean | undefined; missing?: boolean | undefined;
  /** the line is already awarded on this offer (shown with the reference) */
  awarded?: ReactNode | undefined;
  picked?: boolean | undefined; onPick?: (() => void) | undefined; pickLabel?: string | undefined;
}

/** Index of the cheapest comparable column (lowest numeric total among columns that are not muted), or -1. */
export function cheapestIndex(cols: { total: number | null; muted?: string | undefined }[]): number {
  let at = -1;
  cols.forEach((c, i) => { if (c.muted || c.total === null || !Number.isFinite(c.total)) return; if (at < 0 || c.total < (cols[at]!.total as number)) at = i; });
  return at;
}

export function ComparisonColumns({ rows, columns, cell, ar, rowHead, qtyHead, totalLabel, actionLabel, bestLabel, legend, title, attrs }: {
  rows: CmpRow[]; columns: CmpColumn[]; cell: (row: string, col: string) => CmpCell; ar: boolean;
  rowHead: ReactNode; qtyHead?: ReactNode | undefined; totalLabel: ReactNode; actionLabel?: ReactNode | undefined; bestLabel?: string | undefined;
  legend?: ReactNode | undefined; title?: ReactNode | undefined; attrs?: Record<string, string | number> | undefined;
}) {
  const best = bestLabel ?? (ar ? "الأرخص المؤهل" : "Cheapest qualified");
  const hasFoot = columns.some((c) => c.footer);
  return (
    <section className="ek-cmp" data-cmp-cols data-cmp-n={columns.length} {...attrs}>
      {title && <header className="ek-cmp-title">{title}</header>}
      <div className="ek-cmp-scroll">
        <table className="ek-cmp-table">
          <thead>
            <tr>
              <th scope="col" className="ek-cmp-stick ek-cmp-rowhead">{rowHead}</th>
              {qtyHead && <th scope="col" className="ek-cmp-qty">{qtyHead}</th>}
              {columns.map((c) => (
                <th key={c.key} scope="col" className="ek-cmp-head" data-cmp-col={c.key} data-best={c.best || undefined} data-muted={c.muted ? "yes" : undefined}>
                  <div className="ek-cmp-card">
                    {c.best && <span className="ek-cmp-ribbon" data-cmp-best><span aria-hidden>★</span> {best}</span>}
                    <div className="ek-cmp-name">{c.title}</div>
                    {c.sub && <div className="ek-cmp-sub">{c.sub}</div>}
                    <div className="ek-cmp-badges">
                      {c.rank ? <span className="ek-cmp-badge" data-hue={c.best ? "emerald" : "blue"} data-no-i18n>#{c.rank}</span> : null}
                      {c.muted && <span className="ek-cmp-badge" data-hue="quiet" data-cmp-why>{c.muted}</span>}
                      {(c.badges ?? []).map((b, i) => <span key={i} className="ek-cmp-badge" data-hue={b.hue}>{b.label}</span>)}
                    </div>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} data-cmp-row={r.key} data-awarded={r.awarded || undefined}>
                <th scope="row" className="ek-cmp-stick ek-cmp-line">
                  <div>{r.label}</div>
                  {r.sub && <div className="ek-cmp-sub">{r.sub}</div>}
                  {qtyHead && r.qty !== undefined && <div className="ek-cmp-qty-inline">{qtyHead}: <bdi data-no-i18n>{r.qty}</bdi></div>}
                </th>
                {qtyHead && <td className="ek-cmp-qty" data-no-i18n>{r.qty}</td>}
                {columns.map((c) => {
                  const x = cell(r.key, c.key);
                  const body = <>
                    <span className="ek-cmp-v">{x.display}</span>
                    {x.plugged && <span className="ek-cmp-plug">{ar ? "تعويض" : "plug"}</span>}
                    {x.awarded && <span className="ek-cmp-won">{x.awarded}</span>}
                  </>;
                  return (
                    <td key={c.key} className="ek-cmp-td" data-cmp-cell={`${r.key}|${c.key}`} data-best={x.best || undefined} data-plugged={x.plugged || undefined}
                      data-missing={x.missing || undefined} data-picked={x.picked || undefined} data-col-best={c.best || undefined} data-col-muted={c.muted ? "yes" : undefined}>
                      {x.onPick
                        ? <button type="button" className="ek-cmp-pick" aria-pressed={!!x.picked} onClick={x.onPick} title={x.pickLabel}><span className="ek-cmp-radio" aria-hidden />{body}</button>
                        : body}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="ek-cmp-total">
              <th scope="row" className="ek-cmp-stick">{totalLabel}</th>
              {qtyHead && <td className="ek-cmp-qty" />}
              {columns.map((c) => <td key={c.key} className="ek-cmp-td" data-cmp-total={c.key} data-col-best={c.best || undefined} data-col-muted={c.muted ? "yes" : undefined}>
                <span className="ek-cmp-v">{c.total}</span>{c.totalNote && <div className="ek-cmp-note">{c.totalNote}</div>}</td>)}
            </tr>
            {hasFoot && <tr className="ek-cmp-foot">
              <th scope="row" className="ek-cmp-stick">{actionLabel ?? ""}</th>
              {qtyHead && <td className="ek-cmp-qty" />}
              {columns.map((c) => <td key={c.key} className="ek-cmp-act" data-cmp-action={c.key} data-col-best={c.best || undefined} data-col-muted={c.muted ? "yes" : undefined}>{c.footer}</td>)}
            </tr>}
          </tfoot>
        </table>
      </div>
      {legend && <div className="ek-cmp-legend">{legend}</div>}
    </section>
  );
}
