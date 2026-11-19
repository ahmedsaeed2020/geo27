/**
 * Enterprise budget bar (Construction phase 4 C4-07): spent, committed and forecast-remaining parts against a budget,
 * with alert thresholds (default 80 % and 100 %) drawn as markers; the bar turns attention at the first threshold and
 * risk past the last. Apps pass the figures and formatted labels; nothing is computed from records here.
 */
import type { ReactNode } from "react";

export interface BudgetPart { key: string; label: string; value: number; display: string; tone: "actual" | "committed" | "forecast" }
export function BudgetBar({ budget, budgetText, parts, thresholds = [80, 100], ar, title, note, attrs }: {
  budget: number; budgetText: string; parts: BudgetPart[]; thresholds?: number[]; ar: boolean; title?: ReactNode; note?: ReactNode; attrs?: Record<string, string> | undefined;
}) {
  const total = parts.reduce((a, p) => a + Math.max(0, p.value), 0);
  const pct = budget > 0 ? Math.round((total / budget) * 1000) / 10 : null;
  const sorted = [...thresholds].sort((a, b) => a - b);
  const level = pct === null ? "none" : pct > sorted[sorted.length - 1]! ? "over" : pct >= sorted[0]! ? "warn" : "ok";
  const scale = Math.max(budget, total) * (pct !== null && pct > 100 ? 1 : 1.05) || 1;
  const w = (v: number) => `${(Math.max(0, v) / scale) * 100}%`;
  const msg = level === "over" ? (ar ? `تجاوز ${sorted[sorted.length - 1]}% من الموازنة` : `Over ${sorted[sorted.length - 1]}% of budget`)
    : level === "warn" ? (ar ? `بلغ تنبيه ${sorted[0]}%` : `Reached the ${sorted[0]}% alert`) : level === "ok" ? (ar ? "ضمن الموازنة" : "Within budget") : (ar ? "لا موازنة" : "No budget");
  return (
    <div className="ek-bb" data-budget-bar={level} data-budget-pct={pct ?? ""} {...attrs}>
      <div className="ek-bb-top">
        {title && <span className="ek-bb-title">{title}</span>}
        <span className="ek-bb-state" data-level={level}>{msg}</span>
        <span className="ms-auto tabular-nums text-xs" data-no-i18n>{pct === null ? "—" : `${pct}%`} · {budgetText}</span>
      </div>
      <div className="ek-bb-track" role="img" aria-label={`${msg}${pct === null ? "" : ` · ${pct}%`}`}>
        {parts.map((p) => <span key={p.key} className="ek-bb-part" data-tone={p.tone} style={{ width: w(p.value) }} title={`${p.label}: ${p.display}`} data-budget-part={p.key} />)}
        {budget > 0 && sorted.map((t) => <span key={t} className="ek-bb-mark" style={{ insetInlineStart: w((budget * t) / 100) }} data-budget-mark={t}><span className="ek-bb-markLabel" data-no-i18n>{t}%</span></span>)}
      </div>
      <ul className="ek-bb-legend">{parts.map((p) => <li key={p.key}><span className="ek-bb-dot" data-tone={p.tone} aria-hidden />{p.label} <b className="tabular-nums" data-no-i18n>{p.display}</b></li>)}</ul>
      {note && <p className="ek-note">{note}</p>}
    </div>
  );
}
