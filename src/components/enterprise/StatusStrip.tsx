/**
 * The Enterprise status strip (Visual Round 1 §6) above every document list: tabs = states with counts, money documents show
 * the amount under the count, a semantic dot per state, the active tab underlined 3px in the module colour; a click filters
 * the list (the caller keeps the pick in the URL). Apps pass rows and the picked tab only.
 */
import { fmtCurrency } from "@/lib/format";
import type { StripTab } from "@/lib/statusStrip";

export function StatusStrip({ tabs, active, onPick, ar, label }: { tabs: StripTab[]; active: string | undefined; onPick: (key: string | undefined) => void; ar: boolean; label?: string }) {
  if (tabs.length < 2 && !(tabs[0]?.count)) return null;
  const cur = active && tabs.some((t) => t.key === active) ? active : "all";
  return <div className="r1-strip" role="tablist" aria-label={label ?? (ar ? "حالات المستندات" : "Document states")} data-r1-strip>
    {tabs.map((t) => <button key={t.key} type="button" role="tab" aria-selected={t.key === cur} className="r1-strip-tab" data-tone={t.tone} data-r1-strip-tab={t.key} data-count={t.count}
      onClick={() => onPick(t.key === "all" ? undefined : t.key)}>
      <span className="r1-strip-l">{t.key !== "all" && <span className="r1-strip-dot" aria-hidden />}<span>{ar ? t.label[1] : t.label[0]}</span><bdi className="r1-strip-n" data-no-i18n>{t.count.toLocaleString("en-US")}</bdi></span>
      {t.amount !== undefined && <bdi className="r1-strip-amt" data-no-i18n data-r1-strip-amount={Math.round(t.amount * 100) / 100}>{fmtCurrency(t.amount, t.currency || "SAR")}</bdi>}
    </button>)}
  </div>;
}

/** «متأخر 149 يوم» beside a due date (negative colour). */
export function OverdueTag({ days, ar }: { days: number; ar: boolean }) {
  if (days <= 0) return null;
  return <span className="r1-overdue" data-r1-overdue={days}>{ar ? <>متأخر <bdi data-no-i18n>{days}</bdi> يوم</> : <>Overdue <bdi data-no-i18n>{days}</bdi> days</>}</span>;
}
