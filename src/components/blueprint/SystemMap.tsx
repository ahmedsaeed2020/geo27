import { useId } from "react";
import { CORE, flowsFor, orderedNeeds, type Flow, type NeedId } from "@/content/blueprint";
import type { ProductKey } from "@/content/catalog";
import type { Locale } from "@/lib/i18n";

const W = 640;
const H = 480;
const CX = W / 2;
const CY = H / 2;

type Point = { x: number; y: number };
type Placed = { id: NeedId; product: ProductKey; label: string; at: Point; width: number };

/** Approximate pill width for a label at 13px (Arabic and Latin glyphs are close enough at this size). */
const pillWidth = (label: string) => Math.max(92, Math.round(label.length * 7.6 + 40));

/** Places chosen needs on an ellipse around the core; above eight, alternate nodes sit on an inner ring. */
export function layout(ids: NeedId[], locale: Locale): Placed[] {
  const needs = orderedNeeds(ids);
  const n = needs.length;
  const twoRings = n > 8;
  return needs.map((need, i) => {
    const angle = -Math.PI / 2 + (i / Math.max(n, 1)) * Math.PI * 2 * (locale === "ar" ? -1 : 1);
    const inner = twoRings && i % 2 === 1;
    const rx = inner ? 168 : 236;
    const ry = inner ? 126 : 184;
    const label = need.short[locale];
    return { id: need.id, product: need.product, label, at: { x: CX + Math.cos(angle) * rx, y: CY + Math.sin(angle) * ry }, width: pillWidth(label) };
  });
}

const curve = (a: Point, b: Point) => {
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const cx = mx * 0.58 + CX * 0.42;
  const cy = my * 0.58 + CY * 0.42;
  return `M ${a.x.toFixed(1)} ${a.y.toFixed(1)} Q ${cx.toFixed(1)} ${cy.toFixed(1)} ${b.x.toFixed(1)} ${b.y.toFixed(1)}`;
};

export const flowKey = (f: Flow) => `${f.from}>${f.to}`;

type Props = {
  needs: NeedId[];
  locale: Locale;
  label: string;
  emptyHint?: string;
  /** Highlighted flow key or need id; everything else is dimmed. */
  focus?: string | null;
  onFocus?: (key: string | null) => void;
  mini?: boolean;
};

/**
 * The live system map: the shared business platform in the middle, every chosen area as a node on its ring, spokes
 * for the shared records and curved lines for the direct connections between two chosen areas.
 */
export default function SystemMap({ needs, locale, label, emptyHint, focus = null, onFocus, mini = false }: Props) {
  const uid = useId().replace(/:/g, "");
  const placed = layout(needs, locale);
  const byId = new Map(placed.map(p => [p.id, p]));
  const flows = flowsFor(needs);
  const nodeActive = (id: NeedId) => !focus || focus === id || flows.some(f => flowKey(f) === focus && (f.from === id || f.to === id));
  return (
    <svg className="bp-map" data-mini={mini ? "" : undefined} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} direction={locale === "ar" ? "rtl" : "ltr"}>
      <defs>
        <radialGradient id={`${uid}-core`} cx="50%" cy="45%" r="60%">
          <stop offset="0%" stopColor="var(--bp-core-hi)" />
          <stop offset="100%" stopColor="var(--bp-core)" />
        </radialGradient>
        <marker id={`${uid}-arrow`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0 1 L9 5 L0 9 z" fill="var(--bp-flow)" />
        </marker>
      </defs>
      <g className="bp-rings" aria-hidden="true">
        <ellipse cx={CX} cy={CY} rx={236} ry={184} />
        <ellipse cx={CX} cy={CY} rx={168} ry={126} />
        <ellipse cx={CX} cy={CY} rx={92} ry={70} />
      </g>
      <g className="bp-spokes" aria-hidden="true">
        {placed.map(p => (
          <line key={p.id} x1={CX} y1={CY} x2={p.at.x} y2={p.at.y} data-dim={nodeActive(p.id) ? undefined : ""} />
        ))}
      </g>
      <g className="bp-flows" aria-hidden="true">
        {flows.map(f => {
          const a = byId.get(f.from);
          const b = byId.get(f.to);
          if (!a || !b) return null;
          const key = flowKey(f);
          const on = !focus || focus === key || focus === f.from || focus === f.to;
          return (
            <path
              key={key}
              d={curve(a.at, b.at)}
              markerEnd={`url(#${uid}-arrow)`}
              data-dim={on ? undefined : ""}
              data-hot={focus && on ? "" : undefined}
              onMouseEnter={onFocus ? () => onFocus(key) : undefined}
              onMouseLeave={onFocus ? () => onFocus(null) : undefined}
            />
          );
        })}
      </g>
      <g className="bp-core" aria-hidden="true">
        <circle className="bp-core-halo" cx={CX} cy={CY} r={70} />
        <circle cx={CX} cy={CY} r={56} fill={`url(#${uid}-core)`} />
        <g transform={`translate(${CX - 15} ${CY - 34}) scale(.3)`}>
          <rect x="18" y="22.5" width="40" height="13" rx="6.5" fill="var(--paper2)" />
          <rect x="63" y="22.5" width="19" height="13" rx="5" fill="var(--mint)" />
          <rect x="18" y="43.5" width="64" height="13" rx="6.5" fill="var(--paper2)" />
          <rect x="18" y="64.5" width="50" height="13" rx="6.5" fill="var(--paper2)" />
        </g>
        <text x={CX} y={CY + 12} textAnchor="middle" className="bp-core-label">{CORE.label[locale]}</text>
        <text x={CX} y={CY + 30} textAnchor="middle" className="bp-core-sub">{CORE.sub[locale]}</text>
      </g>
      <g className="bp-nodes">
        {placed.map(p => (
          <g
            key={p.id}
            className="bp-node"
            data-product={p.product}
            data-dim={nodeActive(p.id) ? undefined : ""}
            transform={`translate(${p.at.x.toFixed(1)} ${p.at.y.toFixed(1)})`}
            onMouseEnter={onFocus ? () => onFocus(p.id) : undefined}
            onMouseLeave={onFocus ? () => onFocus(null) : undefined}
            aria-hidden="true"
          >
            <g className="bp-node-body">
              <rect x={-p.width / 2} y={-20} width={p.width} height={40} rx={20} />
              <circle cx={locale === "ar" ? p.width / 2 - 18 : -p.width / 2 + 18} cy={0} r={5} className="bp-node-dot" />
              <text x={locale === "ar" ? 6 : -6} y={5} textAnchor="middle">{p.label}</text>
            </g>
          </g>
        ))}
      </g>
      {!placed.length && emptyHint && (
        <text x={CX} y={CY + 112} textAnchor="middle" className="bp-empty">{emptyHint}</text>
      )}
    </svg>
  );
}
