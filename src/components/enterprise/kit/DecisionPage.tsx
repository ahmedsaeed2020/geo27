/**
 * Enterprise decision page (Round 2 idea 6 «صفحة طلب الاعتماد»): a timeline of who opened, priced, commented, moved and
 * approved the request — ending with the step still waiting — and, beside it, impact cards (e.g. revenue / cost / duration)
 * where a value still awaiting approval is hatched as pending exposure. Display only: apps pass the events and the cards.
 */
import type { ReactNode } from "react";

export type DecisionKind = "open" | "comment" | "move" | "approve" | "reject" | "price" | "link" | "pending";
export interface DecisionEvent { key: string; at: string; who: ReactNode; initials: string; kind: DecisionKind; verb: ReactNode; detail?: ReactNode | undefined; extra?: ReactNode | undefined }
export type ImpactHue = "emerald" | "coral" | "blue" | "amber" | "rose" | "teal" | "violet";
export interface ImpactItem { key: string; label: ReactNode; value: ReactNode; sub?: ReactNode | undefined; hue: ImpactHue; pending?: boolean | undefined; empty?: boolean | undefined }

const HUE: Record<DecisionKind, string> = { open: "blue", comment: "violet", move: "teal", approve: "emerald", reject: "rose", price: "amber", link: "gold", pending: "amber" };
/** Two-letter initials of a display name (Arabic or Latin), for the timeline avatar. */
export function initialsOf(name: string): string {
  const parts = name.replace(/\(.*?\)/g, " ").replace(/[^\p{L}\p{N}\s]/gu, " ").trim().split(/\s+/).filter((p) => !/^(ال|al|bin|بن|abu|أبو)$/i.test(p));
  // Arabic family names drop the article: «الزهراني» → «ز»
  const lead = (w: string | undefined) => (w ? (/^ال.{2,}/.test(w) ? w[2]! : w[0]!) : "");
  const a = lead(parts[0]) || "?", b = parts.length > 1 ? lead(parts[parts.length - 1]) : "";
  return (a + b).toUpperCase();
}
const dm = (iso: string) => (iso.length >= 10 ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : iso);
const hm = (iso: string) => (/\d{2}:\d{2}/.test(iso.slice(11, 16)) && iso.slice(11, 16) !== "00:00" ? iso.slice(11, 16) : "");

export function DecisionTimeline({ events, ar, empty, footer }: { events: DecisionEvent[]; ar: boolean; empty?: ReactNode; footer?: ReactNode }) {
  return (
    <section className="ek-dtl" data-decision-timeline data-count={events.length}>
      {!events.length ? <p className="ek-dtl-empty">{empty ?? (ar ? "لا أحداث بعد" : "No events yet")}</p> : (
        <ol className="ek-dtl-list">
          {events.map((e) => (
            <li key={e.key} className="ek-dtl-row" data-kind={e.kind} style={{ ["--dtl" as string]: `var(--${HUE[e.kind]})` }} data-dtl={e.kind}>
              <span className="ek-dtl-av" aria-hidden data-no-i18n>{e.kind === "pending" ? "…" : e.initials}</span>
              <div className="ek-dtl-body">
                <p className="ek-dtl-head"><span className="ek-dtl-who">{e.who}</span> <span className="ek-dtl-verb">{e.verb}</span></p>
                {e.at && <p className="ek-dtl-at" data-no-i18n><bdi>{dm(e.at)}</bdi>{hm(e.at) && <> · <bdi>{hm(e.at)}</bdi></>}</p>}
                {e.detail && <div className="ek-dtl-detail">{e.detail}</div>}
                {e.extra}
              </div>
            </li>
          ))}
        </ol>
      )}
      {footer && <div className="ek-dtl-foot">{footer}</div>}
    </section>
  );
}

export function ImpactCards({ items, ar, title, pendingLabel }: { items: ImpactItem[]; ar: boolean; title?: ReactNode; pendingLabel?: string }) {
  const pend = pendingLabel ?? (ar ? "بانتظار الاعتماد" : "Awaiting approval");
  return (
    <section className="ek-impact" data-impact-cards={items.length}>
      {title && <h3 className="ek-impact-title">{title}</h3>}
      <div className="ek-impact-grid">
        {items.map((it) => (
          <article key={it.key} className="ek-impact-card" data-impact={it.key} data-pending={it.pending || undefined} data-empty={it.empty || undefined} style={{ ["--imp" as string]: `var(--${it.hue})` }}>
            <div className="ek-impact-top"><span className="ek-impact-label">{it.label}</span>{it.pending && <span className="ek-impact-chip" data-impact-pending>{pend}</span>}</div>
            <div className="ek-impact-value" data-no-i18n>{it.value}</div>
            {it.sub && <div className="ek-impact-sub">{it.sub}</div>}
          </article>
        ))}
      </div>
    </section>
  );
}

/** Timeline as the main column, the impact cards beside it (above it on phones). */
export function DecisionLayout({ main, side, title, attrs }: { main: ReactNode; side: ReactNode; title?: ReactNode; attrs?: Record<string, string> }) {
  return (
    <section className="ek-decision" data-decision-page {...attrs}>
      {title && <header className="ek-decision-title">{title}</header>}
      <div className="ek-decision-grid"><div className="ek-decision-side">{side}</div><div className="ek-decision-main">{main}</div></div>
    </section>
  );
}
