/**
 * Enterprise key facts — the read-only label / value grid of a record's identity (site address, agreement period, device
 * location …). App-agnostic: the host passes labelled values; values keep the host's own links and markers.
 */
import type { ReactNode } from "react";

export function KeyFacts({ items, attrs }: { items: [label: string, value: ReactNode][]; attrs?: Record<string, string | undefined> }) {
  return <dl className="ek-kf" data-key-facts={items.length} {...attrs}>
    {items.map(([k, v]) => <div key={k} className="ek-kf-i"><dt>{k}</dt><dd>{v}</dd></div>)}
  </dl>;
}
