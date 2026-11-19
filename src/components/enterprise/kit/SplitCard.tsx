/**
 * Split card and hatched bars (Enterprise Visual Round 1 §8): a big value with a % chip and a change sentence «▲ 12% عن 2025»,
 * then two (or more) labelled bars where the solid part is posted / approved and the hatched part (diagonal stripes of the
 * same colour) is drafts / awaiting approval, with «N للمراجعة» opening those records. Apps pass the figures only.
 */
import type { ReactNode } from "react";
import type { Wrap } from "./charts";
import { signOf } from "./KpiCard";

export interface SplitBar { key: string; label: ReactNode; solid: number; pending?: number | undefined; display?: string | undefined; pendingDisplay?: string | undefined; tone?: "emerald" | "blue" | "teal" | "amber" | "coral" | "violet" | "gold" | "rose" | undefined; drill?: unknown; /** «N للمراجعة» for this bar's drafts (the count its drill opens) */ review?: { count: number; drill?: unknown } | undefined }
export interface SplitProps {
  value: ReactNode; pct?: { value: number; label: ReactNode } | undefined;
  delta?: { pct: number; vs: ReactNode; better?: "up" | "down" | undefined } | undefined;
  bars: SplitBar[]; review?: { count: number; drill: unknown } | undefined; ar: boolean; wrap?: Wrap | undefined;
}
export function SplitBars({ value, pct, delta, bars, review, ar, wrap }: SplitProps) {
  const max = Math.max(1, ...bars.map((b) => b.solid + (b.pending ?? 0)));
  const good = delta ? (delta.better === "down" ? delta.pct <= 0 : delta.pct >= 0) : true;
  const link = (drill: unknown, node: ReactNode, attrs?: Record<string, string>) => (drill !== undefined && wrap ? wrap(drill, node, attrs) : node);
  return <div className="r1-split" data-r1-split>
    <div className="r1-split-head">
      {(() => { const sg = typeof value === "string" ? signOf(value) : null; return <span className="r1-split-value" data-no-i18n {...(sg && sg.sign < 0 ? { "data-sign": "neg" } : {})}>{sg ? sg.node : value}</span>; })()}
      {pct && <span className="r1-split-pct" data-r1-split-pct={Math.round(pct.value * 10) / 10}><bdi data-no-i18n>{`${(Math.round(pct.value * 10) / 10).toLocaleString("en-US")}%`}</bdi> {pct.label}</span>}
    </div>
    {delta && <p className="r1-split-delta" data-good={good ? "yes" : "no"} data-r1-split-delta={delta.pct}><span aria-hidden>{delta.pct >= 0 ? "▲" : "▼"}</span> <bdi data-no-i18n>{`${Math.abs(Math.round(delta.pct * 10) / 10)}%`}</bdi> {ar ? "عن" : "vs"} {delta.vs}</p>}
    <ul className="r1-split-bars">
      {bars.map((b, i) => <li key={b.key} data-r1-split-bar={b.key} data-tone={b.tone ?? (i ? "blue" : "emerald")}>
        <div className="r1-split-l"><span>{b.label}</span><bdi data-no-i18n className="r1-split-n">{b.display ?? b.solid.toLocaleString("en-US")}</bdi></div>
        {link(b.drill, <span className="r1-split-track" role="img" aria-label={`${typeof b.label === "string" ? b.label : ""} ${b.display ?? b.solid}${b.pending ? ` + ${b.pendingDisplay ?? b.pending}` : ""}`}>
          <span className="r1-split-solid" style={{ width: `${(b.solid / max) * 100}%` }} />
          {!!b.pending && <span className="r1-split-hatch" style={{ width: `${(b.pending / max) * 100}%` }} data-r1-hatch={b.pending} title={`${ar ? "مسودات وبانتظار الاعتماد" : "Drafts and awaiting approval"}: ${b.pendingDisplay ?? b.pending}`} />}
        </span>, { className: "r1-split-hit" })}
        {!!b.pending && <p className="r1-split-sub"><span className="r1-split-key" aria-hidden />{ar ? "مسودات وبانتظار الاعتماد" : "Drafts and awaiting approval"} <bdi data-no-i18n>{b.pendingDisplay ?? b.pending.toLocaleString("en-US")}</bdi>{b.review && b.review.count > 0 && <> · {link(b.review.drill, <><bdi data-no-i18n>{b.review.count}</bdi> {ar ? "للمراجعة" : "to review"}</>, { className: "r1-split-review", "data-r1-bar-review": String(b.review.count) })}</>}</p>}
      </li>)}
    </ul>
    {review && review.count > 0 && <div className="r1-card-foot" data-r1-review-foot={review.count}>{link(review.drill, <>{ar ? <>افتح <bdi data-no-i18n>{review.count}</bdi> للمراجعة</> : <>Open <bdi data-no-i18n>{review.count}</bdi> to review</>} <span aria-hidden className="inline-block rtl:rotate-180">→</span></>, { className: "r1-card-action", "data-r1-review": String(review.count) })}</div>}
  </div>;
}
