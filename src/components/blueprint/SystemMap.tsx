import { useId } from "react";
import { CORE, flowsFor, orderedNeeds, type Flow, type NeedId } from "@/content/blueprint";
import type { ProductKey } from "@/content/catalog";
import type { Locale } from "@/lib/i18n";

type Point = { x: number; y: number };
type Placed = { id: NeedId; product: ProductKey; label: string; at: Point; width: number };
type Geometry = { w: number; h: number; core: Point; coreR: number; font: number; nodes: Placed[]; rings: { rx: number; ry: number }[] };

/** Approximate pill width for a label (Arabic and Latin glyphs are close enough at these sizes). */
const pillWidth = (label: string, font: number, max = Infinity) => Math.min(max, Math.max(84, Math.round(label.length * font * 0.6 + 44)));

/**
 * Wide screens: chosen areas sit on an ellipse around the core (above eight, alternate areas use an inner ring).
 * Phones: the core sits on top and the areas stack in two columns below it, so labels stay readable.
 */
export function geometry(ids: NeedId[], locale: Locale, compact: boolean): Geometry {
  const needs = orderedNeeds(ids);
  const n = needs.length;
  if (compact) {
    const w = 360;
    const rows = Math.ceil(n / 2);
    const h = Math.max(260, 150 + rows * 62);
    const core = { x: w / 2, y: 62 };
    const font = 12.5;
    const nodes = needs.map((need, i) => {
      const label = need.short[locale];
      const first = i % 2 === 0;
      const left = locale === "ar" ? !first : first;
      return { id: need.id, product: need.product, label, at: { x: left ? 92 : w - 92, y: 150 + Math.floor(i / 2) * 62 }, width: pillWidth(label, font, 168) };
    });
    return { w, h, core, coreR: 40, font, nodes, rings: [] };
  }
  const w = 640;
  const h = 480;
  const core = { x: w / 2, y: h / 2 };
  const font = 13;
  const twoRings = n > 8;
  const nodes = needs.map((need, i) => {
    const angle = -Math.PI / 2 + (i / Math.max(n, 1)) * Math.PI * 2 * (locale === "ar" ? -1 : 1);
    const inner = twoRings && i % 2 === 1;
    const rx = inner ? 168 : 236;
    const ry = inner ? 126 : 184;
    const label = need.short[locale];
    return { id: need.id, product: need.product, label, at: { x: core.x + Math.cos(angle) * rx, y: core.y + Math.sin(angle) * ry }, width: pillWidth(label, font) };
  });
  return { w, h, core, coreR: 56, font, nodes, rings: [{ rx: 236, ry: 184 }, { rx: 168, ry: 126 }, { rx: 92, ry: 70 }] };
}

const curve = (a: Point, b: Point, toward: Point, pull: number) => {
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const cx = mx * (1 - pull) + toward.x * pull;
  const cy = my * (1 - pull) + toward.y * pull;
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
  compact?: boolean;
};

/**
 * The live system map: the shared business platform, every chosen area as a node, spokes for the shared records and
 * curved lines for the direct connections between two chosen areas.
 */
export default function SystemMap({ needs, locale, label, emptyHint, focus = null, onFocus, mini = false, compact = false }: Props) {
  const uid = useId().replace(/:/g, "");
  const g = geometry(needs, locale, compact);
  const byId = new Map(g.nodes.map(p => [p.id, p]));
  const flows = flowsFor(needs);
  const rtl = locale === "ar";
  const nodeActive = (id: NeedId) => !focus || focus === id || flows.some(f => flowKey(f) === focus && (f.from === id || f.to === id));
  // Flows bow toward the core on the ring; in columns they bow toward the middle line between the two columns.
  const toward = (a: Point, b: Point): [Point, number] => (compact ? [{ x: g.w / 2, y: (a.y + b.y) / 2 }, a.x === b.x ? 0.75 : 0.2] : [g.core, 0.42]);
  const markScale = (g.coreR / 56) * 0.3;
  return (
    <svg className="bp-map" data-mini={mini ? "" : undefined} data-compact={compact ? "" : undefined} viewBox={`0 0 ${g.w} ${g.h}`} role="img" aria-label={label} direction={rtl ? "rtl" : "ltr"}>
      <defs>
        <radialGradient id={`${uid}-core`} cx="50%" cy="45%" r="60%">
          <stop offset="0%" stopColor="var(--bp-core-hi)" />
          <stop offset="100%" stopColor="var(--bp-core)" />
        </radialGradient>
        <marker id={`${uid}-arrow`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0 1 L9 5 L0 9 z" fill="var(--bp-flow)" />
        </marker>
      </defs>
      {g.rings.length > 0 && (
        <g className="bp-rings" aria-hidden="true">
          {g.rings.map((r, i) => <ellipse key={i} cx={g.core.x} cy={g.core.y} rx={r.rx} ry={r.ry} />)}
        </g>
      )}
      <g className="bp-spokes" aria-hidden="true">
        {g.nodes.map(p => (
          <line key={p.id} x1={g.core.x} y1={g.core.y} x2={p.at.x} y2={p.at.y} data-dim={nodeActive(p.id) ? undefined : ""} />
        ))}
      </g>
      <g className="bp-flows" aria-hidden="true">
        {flows.map(f => {
          const a = byId.get(f.from);
          const b = byId.get(f.to);
          if (!a || !b) return null;
          const key = flowKey(f);
          const on = !focus || focus === key || focus === f.from || focus === f.to;
          const [point, pull] = toward(a.at, b.at);
          return (
            <path
              key={key}
              d={curve(a.at, b.at, point, pull)}
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
        <circle className="bp-core-halo" cx={g.core.x} cy={g.core.y} r={g.coreR + 14} />
        <circle cx={g.core.x} cy={g.core.y} r={g.coreR} fill={`url(#${uid}-core)`} />
        <g transform={`translate(${g.core.x - 50 * markScale} ${g.core.y - g.coreR * 0.62}) scale(${markScale})`}>
          <rect x="18" y="22.5" width="40" height="13" rx="6.5" fill="var(--paper2)" />
          <rect x="63" y="22.5" width="19" height="13" rx="5" fill="var(--mint)" />
          <rect x="18" y="43.5" width="64" height="13" rx="6.5" fill="var(--paper2)" />
          <rect x="18" y="64.5" width="50" height="13" rx="6.5" fill="var(--paper2)" />
        </g>
        <text x={g.core.x} y={g.core.y + g.coreR * 0.22} textAnchor="middle" className="bp-core-label" style={{ fontSize: compact ? 11.5 : 13 }}>{CORE.label[locale]}</text>
        <text x={g.core.x} y={g.core.y + g.coreR * 0.54} textAnchor="middle" className="bp-core-sub" style={{ fontSize: compact ? 9.5 : 10.5 }}>{CORE.sub[locale]}</text>
      </g>
      <g className="bp-nodes">
        {g.nodes.map(p => (
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
              <rect x={-p.width / 2} y={-19} width={p.width} height={38} rx={19} />
              <circle cx={rtl ? p.width / 2 - 17 : -p.width / 2 + 17} cy={0} r={4.5} className="bp-node-dot" />
              <text x={rtl ? -7 : 7} y={g.font * 0.38} textAnchor="middle" style={{ fontSize: g.font }}>{p.label}</text>
            </g>
          </g>
        ))}
      </g>
      {!g.nodes.length && emptyHint && (
        <text x={g.core.x} y={compact ? g.core.y + 110 : g.core.y + 112} textAnchor="middle" className="bp-empty">{emptyHint}</text>
      )}
    </svg>
  );
}
