/**
 * Enterprise cost kit (Construction phase 5, owner 2026-11-16): the budget sheet with a thin use line under every row and
 * a green «المتبقي» total bar, the remaining-to-spend ring, the EAC equation in large numbers and the 12-period forecast
 * strip. Display only: apps pass the figures, their formatted text, the use level each row reached against the app's
 * alert settings and the links; nothing is computed from records here, so every app shares one look and one behaviour.
 */
import { Fragment, type ReactNode } from "react";

/** How far a row has used its budget: within (green), past the alert setting (amber), past the limit (red), no budget. */
export type UseLevel = "ok" | "warn" | "over" | "none";
type Link = ((node: ReactNode) => ReactNode) | undefined;
const wrap = (link: Link, node: ReactNode) => (link ? link(node) : node);

/** Thin progress line: share of the budget used, coloured by level, with the alert setting drawn as a tick. */
export function UseLine({ pct, level, label, warnAt }: { pct: number | null; level: UseLevel; label: string; warnAt?: number | undefined }) {
  const w = pct === null ? (level === "over" ? 100 : 0) : Math.max(0, Math.min(100, pct));
  return (
    <span className="ek-cs-line" data-level={level} role="img" aria-label={label} title={label} data-cs-line={pct === null ? "" : String(Math.round(pct * 10) / 10)}>
      <span className="ek-cs-lineFill" style={{ width: `${w}%` }} />
      {warnAt !== undefined && warnAt > 0 && warnAt < 100 && <span className="ek-cs-lineTick" style={{ insetInlineStart: `${warnAt}%` }} aria-hidden />}
    </span>
  );
}

export interface RemainingPart { key: string; label: ReactNode; display: ReactNode; share: number; tone: "actual" | "committed" | "remaining" | "over" }
/** The green «المتبقي» total bar: what is left of the budget after actual and open commitments, large, with its parts. */
export function RemainingBar({ label, value, negative, budgetText, pctText, parts, level, link, note }: {
  label: ReactNode; value: ReactNode; negative?: boolean | undefined; budgetText: ReactNode; pctText: ReactNode; parts: RemainingPart[]; level: UseLevel; link?: Link; note?: ReactNode;
}) {
  return (
    <div className="ek-cs-rem" data-level={level} data-cs-remaining>
      <div className="ek-cs-remTop">
        <span className="ek-cs-remLabel">{label}</span>
        {wrap(link, <span className="ek-cs-remValue" data-no-i18n {...(negative ? { "data-sign": "neg" } : {})}>{value}</span>)}
        <span className="ek-cs-remPct" data-no-i18n>{pctText}</span>
        <span className="ek-cs-remOf">{budgetText}</span>
      </div>
      <div className="ek-cs-remTrack" role="img" aria-label={parts.map((p) => `${typeof p.label === "string" ? p.label : ""}`).join(" · ")}>
        {parts.filter((p) => p.share > 0).map((p) => <span key={p.key} className="ek-cs-remPart" data-tone={p.tone} style={{ width: `${Math.min(100, p.share * 100)}%` }} data-cs-part={p.key} />)}
      </div>
      <ul className="ek-cs-legend">{parts.map((p) => <li key={p.key} data-cs-legend={p.key}><span className="ek-cs-dot" data-tone={p.tone} aria-hidden />{p.label} <b data-no-i18n>{p.display}</b></li>)}</ul>
      {note && <p className="ek-cs-note">{note}</p>}
    </div>
  );
}

export interface SheetRow {
  key: string; label: ReactNode; sub?: ReactNode; budget: ReactNode; committed: ReactNode; actual: ReactNode; remaining: ReactNode; remainingNeg?: boolean | undefined;
  pct: number | null; level: UseLevel; lineLabel: string; links?: { committed?: Link; actual?: Link; budget?: Link } | undefined; attrs?: Record<string, string> | undefined;
}
/** Budget sheet: one row per cost code (budget · commitment · actual · remaining) with its use line underneath; total row last. */
export function BudgetSheet({ title, sub, heads, rows, total, top, action, empty, warnAt, attrs }: {
  title: ReactNode; sub?: ReactNode; heads: { label: ReactNode; budget: ReactNode; committed: ReactNode; actual: ReactNode; remaining: ReactNode };
  rows: SheetRow[]; total?: SheetRow | undefined; top?: ReactNode; action?: ReactNode; empty?: ReactNode; warnAt?: number | undefined; attrs?: Record<string, string> | undefined;
}) {
  const line = (r: SheetRow, foot = false) => (
    <tr className="ek-cs-lineRow" data-cs-line-row={r.key} {...(foot ? { "data-foot": "" } : {})}><td colSpan={5}><UseLine pct={r.pct} level={r.level} label={r.lineLabel} warnAt={warnAt} /></td></tr>
  );
  // phones: the header row is hidden and each figure carries its own caption (two figures per line)
  const cap = (h: ReactNode) => <span className="ek-cs-cap">{h}</span>;
  const cells = (r: SheetRow) => <>
    <td className="ek-cs-num">{cap(heads.budget)}<span data-no-i18n dir="ltr">{wrap(r.links?.budget, r.budget)}</span></td>
    <td className="ek-cs-num">{cap(heads.committed)}<span data-no-i18n dir="ltr">{wrap(r.links?.committed, r.committed)}</span></td>
    <td className="ek-cs-num">{cap(heads.actual)}<span data-no-i18n dir="ltr">{wrap(r.links?.actual, r.actual)}</span></td>
    <td className="ek-cs-num ek-cs-remCell" data-level={r.level} {...(r.remainingNeg ? { "data-sign": "neg" } : {})}>{cap(heads.remaining)}<span data-no-i18n dir="ltr">{r.remaining}</span></td>
  </>;
  return (
    <section className="ek-card ek-cs-sheet" data-cs-sheet {...attrs}>
      <header className="ek-card-head"><div className="min-w-0"><h3 className="ek-h3">{title}</h3>{sub && <p className="ek-card-sub">{sub}</p>}</div>{action && <div className="ek-card-action">{action}</div>}</header>
      {top && <div className="ek-cs-sheetTop">{top}</div>}
      {rows.length ? (
        <div className="ek-cs-scroll">
          <table className="ek-cs-table">
            <thead><tr><th scope="col" className="ek-cs-lab">{heads.label}</th><th scope="col">{heads.budget}</th><th scope="col">{heads.committed}</th><th scope="col">{heads.actual}</th><th scope="col">{heads.remaining}</th></tr></thead>
            <tbody>{rows.map((r) => <Fragment key={r.key}>
              <tr className="ek-cs-row" data-cs-row={r.key} data-level={r.level} {...r.attrs}><td className="ek-cs-lab"><span className="ek-cs-name">{r.label}</span>{r.sub && <span className="ek-cs-sub">{r.sub}</span>}</td>{cells(r)}</tr>
              {line(r)}
            </Fragment>)}</tbody>
            {total && <tfoot><tr className="ek-cs-row ek-cs-total" data-cs-total data-level={total.level}><td className="ek-cs-lab"><span className="ek-cs-name">{total.label}</span>{total.sub && <span className="ek-cs-sub">{total.sub}</span>}</td>{cells(total)}</tr>{line(total, true)}</tfoot>}
          </table>
        </div>
      ) : <div className="ek-card-pad text-sm text-muted-foreground">{empty}</div>}
    </section>
  );
}

export interface RingPart { key: string; label: ReactNode; value: number; display: ReactNode; tone: "actual" | "committed" | "remaining" | "over" | "billed" }
/** «المتبقي للصرف» ring: the parts of a budget or contract value around the remaining amount in the centre. */
export function RemainingRing({ title, sub, parts, center, centerLabel, negative, level, facts, link, size = 132, attrs }: {
  title: ReactNode; sub?: ReactNode; parts: RingPart[]; center: ReactNode; centerLabel: ReactNode; negative?: boolean | undefined; level: UseLevel;
  facts?: { key: string; label: ReactNode; display: ReactNode }[] | undefined; link?: Link; size?: number | undefined; attrs?: Record<string, string> | undefined;
}) {
  const r = 42, c = 2 * Math.PI * r;
  const tot = parts.reduce((a, p) => a + Math.max(0, p.value), 0);
  let at = 0;
  const arcs = parts.filter((p) => p.value > 0).map((p) => { const len = tot > 0 ? (p.value / tot) * c : 0; const o = at; at += len; return { p, len, o }; });
  return (
    <article className="ek-cs-ring" data-level={level} data-cs-ring {...attrs}>
      <header className="ek-cs-ringHead"><span className="ek-cs-ringTitle">{title}</span>{sub && <span className="ek-cs-sub">{sub}</span>}</header>
      <div className="ek-cs-ringBody">
        {wrap(link, (
          <span className="ek-cs-ringFig" style={{ width: size, height: size }}>
            <svg viewBox="0 0 100 100" width={size} height={size} role="img" aria-label={parts.map((p) => `${typeof p.label === "string" ? p.label : ""}`).join(" · ")}>
              <circle cx="50" cy="50" r={r} className="ek-cs-ringTrack" />
              {arcs.map(({ p, len, o }) => <circle key={p.key} cx="50" cy="50" r={r} className="ek-cs-ringArc" data-tone={p.tone} strokeDasharray={`${len} ${c - len}`} strokeDashoffset={-o} transform="rotate(-90 50 50)" data-cs-arc={p.key} />)}
            </svg>
            <span className="ek-cs-ringCenter"><b data-no-i18n {...(negative ? { "data-sign": "neg" } : {})}>{center}</b><span>{centerLabel}</span></span>
          </span>
        ))}
        <ul className="ek-cs-ringLegend">
          {parts.map((p) => <li key={p.key}><span className="ek-cs-dot" data-tone={p.tone} aria-hidden />{p.label} <b data-no-i18n>{p.display}</b></li>)}
          {facts?.map((f) => <li key={f.key} className="ek-cs-fact" data-cs-fact={f.key}>{f.label} <b data-no-i18n>{f.display}</b></li>)}
        </ul>
      </div>
    </article>
  );
}
/** Rings side by side (auto-fit; stacked on phones). */
export function RingGrid({ children, attrs }: { children: ReactNode; attrs?: Record<string, string> | undefined }) { return <div className="ek-cs-rings" {...attrs}>{children}</div>; }

/** `op`: the operator drawn before this term (default «+»; e.g. «−» for statement − cleared). `tone`: amber «warn» / green «ok» box. */
export interface EqTerm { key: string; label: ReactNode; display: ReactNode; sub?: ReactNode; link?: Link; op?: "+" | "−" | undefined; tone?: "warn" | "ok" | undefined }
/**
 * Equation in large numbers: term ± term = result, then the flag (red with a real minus sign when negative; amber when
 * `tone: "warn"`, e.g. a reconciliation difference that is not zero; green when `tone: "ok"`).
 */
export function EquationBand({ terms, result, flag, note, attrs }: {
  terms: EqTerm[]; result: EqTerm; flag?: { label: ReactNode; display: ReactNode; negative: boolean; sub?: ReactNode; link?: Link; tone?: "warn" | "ok" | undefined } | undefined; note?: ReactNode; attrs?: Record<string, string> | undefined;
}) {
  const box = (t: EqTerm, cls: string) => (
    <div className={`ek-cs-eqTerm ${cls}`} data-cs-term={t.key} {...(t.tone ? { "data-cs-tone": t.tone } : {})}>
      <span className="ek-cs-eqLabel">{t.label}</span>
      {wrap(t.link, <span className="ek-cs-eqValue" data-no-i18n>{t.display}</span>)}
      {t.sub && <span className="ek-cs-eqSub">{t.sub}</span>}
    </div>
  );
  return (
    <section className="ek-card ek-cs-eq" data-cs-equation {...attrs}>
      <div className="ek-cs-eqRow">
        {terms.map((t, i) => <Fragment key={t.key}>{i > 0 && <span className="ek-cs-eqOp" aria-hidden>{t.op ?? "+"}</span>}{box(t, "")}</Fragment>)}
        <span className="ek-cs-eqOp" aria-hidden>=</span>
        {box(result, "ek-cs-eqResult")}
        {flag && (
          <div className="ek-cs-eqFlag" data-cs-vac={flag.tone === "warn" ? "warn" : flag.negative ? "neg" : "pos"}>
            <span className="ek-cs-eqLabel">{flag.label}</span>
            {wrap(flag.link, <span className="ek-cs-eqValue" data-no-i18n {...(flag.negative ? { "data-sign": "neg" } : {})}>{flag.display}</span>)}
            {flag.sub && <span className="ek-cs-eqSub">{flag.sub}</span>}
          </div>
        )}
      </div>
      {note && <p className="ek-cs-note">{note}</p>}
    </section>
  );
}

export type PeriodState = "approved" | "draft" | "none";
export interface PeriodCell { key: string; state: PeriodState; title: string; link?: Link }
/** 12-period forecast strip: one cell per period (green approved, amber draft, grey not started); one row per project. */
export function PeriodStrips({ months, rows, legend, current, attrs }: {
  months: { key: string; label: string; full: string }[]; rows: { key: string; label: ReactNode; cells: PeriodCell[] }[];
  legend: Record<PeriodState, ReactNode>; current?: string | undefined; attrs?: Record<string, string> | undefined;
}) {
  const count = (s: PeriodState) => rows.reduce((a, r) => a + r.cells.filter((c) => c.state === s).length, 0);
  return (
    <div className="ek-cs-strips" data-cs-strips {...attrs}>
      <div className="ek-cs-stripGrid" style={{ ["--ek-cs-n" as string]: months.length }}>
        <span className="ek-cs-stripCorner" aria-hidden />
        {months.map((m) => <span key={m.key} className="ek-cs-stripMonth" title={m.full} {...(m.key === current ? { "data-current": "" } : {})} data-no-i18n>{m.label}</span>)}
        {rows.map((r) => <Fragment key={r.key}>
          <span className="ek-cs-stripLabel" data-cs-strip-row={r.key}>{r.label}</span>
          {r.cells.map((c) => <span key={c.key} className="ek-cs-stripCellWrap">{wrap(c.link, <span className="ek-cs-stripCell" data-state={c.state} title={c.title} aria-label={c.title} data-cs-period={c.key} {...(c.key === current ? { "data-current": "" } : {})} />)}</span>)}
        </Fragment>)}
      </div>
      <ul className="ek-cs-legend">{(["approved", "draft", "none"] as const).map((s) => <li key={s} data-cs-strip-legend={s}><span className="ek-cs-stripDot" data-state={s} aria-hidden />{legend[s]} <b data-no-i18n>{count(s)}</b></li>)}</ul>
    </div>
  );
}
