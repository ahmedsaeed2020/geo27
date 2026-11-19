/**
 * Finance home pieces (Pro P1, shared by every app): a signed amount, a two-way view switch, the bank-vs-books account
 * rows and the shortcut chips row. Display only — apps pass figures, formatted text, drills and permission states in;
 * nothing here computes a figure. Colours come only from the shared tokens (one colour per category, «−» in red).
 */
import type { ReactNode } from "react";
import { KpiIcon, signOf, type KpiIconKind } from "./KpiCard";
import type { Wrap } from "./charts";

/** A signed amount: a real minus (U+2212) in the negative colour, exactly as the Enterprise KPI card shows it. */
export function Signed({ text, className, attrs }: { text: string; className?: string | undefined; attrs?: Record<string, string> | undefined }) {
  const sg = signOf(text);
  return <bdi data-no-i18n className={className} {...(sg.sign < 0 ? { "data-sign": "neg" } : {})} {...attrs}>{sg.node}</bdi>;
}

/** Segmented switch between two or three views of one card (e.g. «الرصيد | الداخل والخارج»). */
export function ViewToggle<T extends string>({ options, value, onChange, label, id }: { options: { id: T; label: ReactNode }[]; value: T; onChange: (v: T) => void; label: string; id?: string | undefined }) {
  return <div className="ek-seg" role="group" aria-label={label} data-ek-toggle={id}>
    {options.map((o) => <button key={o.id} type="button" className="ek-seg-b" aria-pressed={o.id === value} onClick={() => onChange(o.id)} data-ek-toggle-opt={o.id}>{o.label}</button>)}
  </div>;
}

export interface AccountCompareRow {
  key: string; label: ReactNode; kind?: ReactNode;
  /** formatted balances; `bank` null = no bank statement for this account (e.g. cash) */
  books: string; bank: string | null; diff: string | null;
  /** raw values only size the twin bars */
  booksValue: number; bankValue: number | null;
  booksDrill?: unknown; bankDrill?: unknown;
  review?: { count: number; drill?: unknown } | undefined; noBank?: ReactNode; attrs?: Record<string, string> | undefined;
}
/** Bank balance vs books balance per account: twin bars, the signed difference and «N للمطابقة» opening the open bank lines. */
export function AccountCompare({ rows, ar, wrap, empty }: { rows: AccountCompareRow[]; ar: boolean; wrap?: Wrap | undefined; empty?: ReactNode }) {
  if (!rows.length) return <p className="ek-muted text-sm">{empty ?? (ar ? "لا توجد حسابات بنكية أو نقدية." : "No bank or cash accounts.")}</p>;
  const max = Math.max(1, ...rows.flatMap((r) => [Math.abs(r.booksValue), Math.abs(r.bankValue ?? 0)]));
  const link = (drill: unknown, node: ReactNode, attrs?: Record<string, string>) => (drill !== undefined && drill !== null && wrap ? wrap(drill, node, attrs) : node);
  const w = (v: number) => `${Math.max(2, (Math.abs(v) / max) * 100)}%`;
  return <ul className="ek-acmp" data-ek-acmp={rows.length}>
    <li className="ek-acmp-h" aria-hidden><span>{ar ? "الحساب" : "Account"}</span><span>{ar ? "رصيد الدفاتر" : "Books"}</span><span>{ar ? "رصيد البنك" : "Bank"}</span><span>{ar ? "الفرق" : "Difference"}</span></li>
    {rows.map((r) => <li key={r.key} className="ek-acmp-r" {...r.attrs}>
      <div className="ek-acmp-name"><span className="ek-acmp-l">{r.label}</span>{r.kind && <span className="ek-acmp-kind">{r.kind}</span>}
        {r.review && r.review.count > 0 && link(r.review.drill, <span className="ek-acmp-review" data-ek-acmp-review={r.review.count}><bdi data-no-i18n>{r.review.count}</bdi> {ar ? "للمطابقة" : "to reconcile"}</span>)}</div>
      <div className="ek-acmp-v" data-col="books"><span className="ek-acmp-cap">{ar ? "الدفاتر" : "Books"}</span>{link(r.booksDrill, <Signed text={r.books} />)}</div>
      <div className="ek-acmp-v" data-col="bank"><span className="ek-acmp-cap">{ar ? "البنك" : "Bank"}</span>{r.bank === null ? <span className="ek-muted">{r.noBank ?? "—"}</span> : link(r.bankDrill, <Signed text={r.bank} />)}</div>
      <div className="ek-acmp-v" data-col="diff"><span className="ek-acmp-cap">{ar ? "الفرق" : "Difference"}</span>{r.diff === null ? <span className="ek-muted">—</span> : <Signed text={r.diff} className="ek-acmp-diff" />}</div>
      <div className="ek-acmp-bars" aria-hidden><span data-k="books" style={{ width: w(r.booksValue) }} />{r.bankValue !== null && <span data-k="bank" style={{ width: w(r.bankValue) }} />}</div>
    </li>)}
    <li className="ek-acmp-legend" aria-hidden><i data-k="books" />{ar ? "رصيد الدفاتر" : "Books balance"}<i data-k="bank" />{ar ? "رصيد كشف البنك المحتسب" : "Calculated bank statement balance"}</li>
  </ul>;
}

export interface Shortcut { key: string; label: ReactNode; icon: KpiIconKind; /** category colour 1–6 (shared series tokens) */ tone?: 1 | 2 | 3 | 4 | 5 | 6 | undefined; drill: unknown; title?: string | undefined; attrs?: Record<string, string> | undefined }
/** One row of shortcut chips, each with a coloured round icon; apps pass only the shortcuts the user may open. */
export function ShortcutChips({ items, label, wrap }: { items: Shortcut[]; label: string; wrap: Wrap }) {
  if (!items.length) return null;
  return <nav className="ek-shortcuts" aria-label={label} data-ek-shortcuts={items.length}><ul>
    {items.map((it, i) => <li key={it.key}>{wrap(it.drill, <span className="ek-shortcut" data-tone={it.tone ?? ((i % 6) + 1)} title={it.title}><span className="ek-shortcut-i" aria-hidden><KpiIcon kind={it.icon} /></span><span className="ek-shortcut-l">{it.label}</span></span>, { "data-ek-shortcut": it.key, ...it.attrs })}</li>)}
  </ul></nav>;
}
