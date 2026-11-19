/** Enterprise distribution bar (Round 2 idea 9): one bar split into coloured segments above a list; each segment can link/filter. Display only. */
import type { ReactNode } from "react";
import { sarText } from "@/lib/format";

export interface DistSegment { key: string; label: string; value: number; display?: string; hue?: "emerald" | "blue" | "teal" | "amber" | "coral" | "violet" | "rose" | "gold" | "lime"; to?: string; onClick?: () => void; active?: boolean }

export const segmentShares = (segs: { value: number }[]) => {
  const tot = segs.reduce((s, x) => s + Math.max(0, x.value), 0);
  return segs.map((x) => (tot > 0 ? Math.max(0, x.value) / tot : 0));
};

export function DistributionBar({ segments, title, footer }: { segments: DistSegment[]; title?: ReactNode; footer?: ReactNode }) {
  const shares = segmentShares(segments);
  const Wrap = ({ s, children, cls }: { s: DistSegment; children: ReactNode; cls: string }) =>
    s.to ? <a href={s.to} className={cls} data-active={s.active || undefined}>{children}</a>
      : s.onClick ? <button type="button" onClick={s.onClick} className={cls} data-active={s.active || undefined}>{children}</button>
      : <span className={cls}>{children}</span>;
  return (
    <section className="ek-card ek-dist mb-3 rounded-xl border bg-card p-3" data-dist-bar>
      {title && <div className="mb-2 text-sm font-semibold">{title}</div>}
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted" role="img" aria-label={segments.map((s) => `${s.label} ${(s.display ? sarText(s.display) : s.value)}`).join(" · ")}>
        {segments.map((s, i) => (shares[i] ?? 0) > 0 && <span key={s.key} data-dist-seg={s.key} style={{ width: `${(shares[i] ?? 0) * 100}%`, background: `var(--${s.hue ?? "emerald"})` }} />)}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        {segments.map((s, i) => (
          <Wrap key={s.key} s={s} cls="inline-flex items-center gap-1.5 rounded-md px-1 text-xs hover:bg-muted data-[active]:font-semibold data-[active]:underline">
            <span className="inline-block size-2.5 rounded-full" style={{ background: `var(--${s.hue ?? "emerald"})` }} />
            <span>{s.label}</span>
            <span className="font-semibold tabular-nums" data-no-i18n>{(s.display ? sarText(s.display) : s.value)}</span>
            <span className="text-muted-foreground tabular-nums" data-no-i18n>{Math.round((shares[i] ?? 0) * 100)}%</span>
          </Wrap>
        ))}
      </div>
      {footer && <div className="mt-1 text-[11px] text-muted-foreground">{footer}</div>}
    </section>
  );
}
