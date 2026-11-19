/** Enterprise requirement cards (Round 2 idea 8): one card per requirement with «سليم» / «ناقص N» / warning badge and its own action. Display only — apps pass the items. */
import type { ReactNode } from "react";

export type RequirementState = "ok" | "missing" | "warn" | "idle";
export interface RequirementItem { key: string; label: string; state: RequirementState; missing?: number | undefined; badge?: string | undefined; detail?: ReactNode | undefined; action?: ReactNode | undefined }

const HUE: Record<RequirementState, string> = { ok: "emerald", missing: "rose", warn: "amber", idle: "blue" };
export function requirementBadge(it: { state: RequirementState; missing?: number | undefined; badge?: string | undefined }, ar: boolean): string {
  if (it.badge) return it.badge;
  if (it.state === "ok") return ar ? "سليم" : "Complete";
  if (it.state === "idle") return ar ? "لم يبدأ" : "Not started";
  if (it.state === "missing") return it.missing && it.missing > 1 ? (ar ? `ناقص ${it.missing}` : `${it.missing} missing`) : (ar ? "ناقص" : "Missing");
  return ar ? "تنبيه" : "Attention";
}
/** A warning (e.g. a document expiring soon) still satisfies its requirement; only missing / not started do not. */
export const requirementsDone = (items: Pick<RequirementItem, "state">[]) => items.filter((i) => i.state === "ok" || i.state === "warn").length;

export function RequirementCards({ items, ar, title, note }: { items: RequirementItem[]; ar: boolean; title?: ReactNode; note?: ReactNode }) {
  const done = requirementsDone(items);
  const head = done < items.length ? "rose" : items.some((i) => i.state === "warn") ? "amber" : "emerald";
  return (
    <section className="ek-req mb-3" data-req-cards data-req-done={done} data-req-total={items.length}>
      {(title || items.length > 0) && (
        <header className="mb-2 flex flex-wrap items-center justify-between gap-2">
          {title && <h3 className="text-sm font-semibold">{title}</h3>}
          <span className="rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums" style={{ color: `var(--${head})`, background: `color-mix(in oklab, var(--${head}) 12%, var(--card))` }} data-no-i18n>
            {ar ? `${done} من ${items.length} سليمة` : `${done} of ${items.length} complete`}
          </span>
        </header>
      )}
      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 220px), 1fr))" }}>
        {items.map((it) => {
          const hue = HUE[it.state];
          return (
            <article key={it.key} className="flex min-h-[88px] flex-col rounded-xl border bg-card p-3" style={{ borderTop: `3px solid var(--${hue})` }} data-req={it.key} data-req-state={it.state}>
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-semibold leading-5">{it.label}</p>
                <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ color: `var(--${hue})`, background: `color-mix(in oklab, var(--${hue}) 12%, var(--card))` }} data-req-badge data-no-i18n>
                  <span aria-hidden>{it.state === "ok" ? "✓" : it.state === "missing" ? "!" : "•"}</span>{requirementBadge(it, ar)}
                </span>
              </div>
              {it.detail && <div className="mt-1 text-xs text-muted-foreground">{it.detail}</div>}
              {it.action && <div className="mt-auto pt-2 text-xs">{it.action}</div>}
            </article>
          );
        })}
      </div>
      {note && <p className="mt-1 text-[11px] text-muted-foreground">{note}</p>}
    </section>
  );
}
