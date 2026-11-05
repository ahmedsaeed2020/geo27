import { useEffect, useId, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Link } from '@tanstack/react-router';
import { DigitIcon } from '@/components/icons/DigitIcon';
import { NavLink } from '@/components/nav/nav-links';
import { useCatalog } from '@/components/catalog/useCatalog';
import { localeHref, useLocale } from '@/lib/i18n';
import { productOrbit, systemsOrbit, type OrbitModel } from '@/content/orbits';
import type { ProductKey } from '@/content/catalog';
import { chipSlots, restingAngle, startOrbit, type OrbitHandle, type OrbitRing } from './orbit-engine';
import '@/orbit.css';

const COPY = {
  hint: {
    ar: 'مرّر على أي أيقونة في المدار لترى اسمها، واضغط لتدخل صفحتها.',
    en: 'Hover any icon in the orbit to see its name, and click to open its page.',
  },
  nav: { ar: 'صفحات', en: 'Pages of' },
};

/** Ring shapes as fractions of the stage width (rx) and height (ry); one ring for short lists. */
const SHAPES: Record<number, Omit<OrbitRing, 'count'>[]> = {
  1: [{ rx: 0.36, ry: 0.36, period: 96, offset: -Math.PI / 2 }],
  2: [
    { rx: 0.235, ry: 0.235, period: 82, offset: -Math.PI / 2 },
    { rx: 0.43, ry: 0.42, period: 128, offset: -Math.PI / 2 + 0.35 },
  ],
};

/**
 * Product orbit navigation: the product is the sun, its departments circle it. Hovering a module (or its name in
 * the list beside the orbit) stops the rotation and shows its name; clicking opens its page. The named list is the
 * accessible navigation; the orbit icons duplicate it for the pointer only.
 */
export default function ProductOrbit({ product }: { product: ProductKey | 'systems' }) {
  const locale = useLocale();
  const catalog = useCatalog();
  const model: OrbitModel | undefined = useMemo(() => {
    if (product === 'systems') return systemsOrbit(catalog);
    const family = catalog.find(f => f.key === product);
    return family ? productOrbit(family) : undefined;
  }, [catalog, product]);
  const stageRef = useRef<HTMLDivElement>(null);
  const orbitRef = useRef<OrbitHandle | null>(null);
  const [active, setActive] = useState(-1);
  const headingId = useId();

  const rings: OrbitRing[] = useMemo(() => {
    const groups = model?.rings ?? [];
    const shapes = SHAPES[groups.length] ?? SHAPES[2]!;
    return groups.map((g, i) => ({ ...shapes[i]!, count: g.length }));
  }, [model]);
  const items = useMemo(() => (model?.rings ?? []).flat(), [model]);
  const signature = items.map(i => `${i.id}:${i.path}`).join('|');

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || !rings.length) return;
    const orbit = startOrbit(stage, {
      rings,
      geometry: (W, H) => ({ cx: W / 2, cy: H / 2, sx: W, sy: H }),
      minOpacity: 0.78,
      minScale: 0.82,
      scaleRange: 0.24,
      introMs: 1400,
      onActive: setActive,
    });
    orbitRef.current = orbit;
    return () => { orbit.destroy(); orbitRef.current = null; };
    // Restart only when the module list itself changes (published order or destinations).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, rings]);

  if (!model || !items.length) return null;
  const slots = chipSlots(rings);
  const highlight = (index: number) => orbitRef.current?.setActive(index);

  return (
    <section className="porb" data-orbit={model.key} aria-labelledby={headingId}>
      <div className="porb-sky" aria-hidden="true" />
      <div className="porb-wrap">
        <div className="porb-head">
          <p className="porb-eyebrow">
            <span className="porb-eyebrow-mark"><DigitIcon name={model.core.glyph} /></span>
            {model.eyebrow[locale]}
          </p>
          <h2 id={headingId} className="porb-title">{model.title[locale]}</h2>
          <p className="porb-lede">{model.summary[locale]}</p>
          <p className="porb-hint"><strong>{model.countLabel[locale]}</strong> · {COPY.hint[locale]}</p>
        </div>

        <div className="porb-stage" ref={stageRef}>
          <svg className="porb-lines" data-orbit-lines aria-hidden="true" />
          {rings.map((_, i) => <div key={i} className="porb-ring" data-orbit-ring aria-hidden="true" />)}
          <div className="porb-core" data-orbit-core aria-hidden="true">
            <span className="porb-halo" />
            <span className="porb-disc"><DigitIcon name={model.core.glyph} /></span>
            <span className="porb-core-name">{model.core.name[locale]}</span>
          </div>
          {items.map((item, i) => {
            const slot = slots[i]!;
            const ring = rings[slot.ring]!;
            const a = restingAngle(ring, slot.j);
            return (
              <Link
                key={item.id}
                to={localeHref(item.path, locale)}
                {...(item.hash ? { hash: item.hash } : {})}
                className="porb-chip"
                data-orbit-chip
                tabIndex={-1}
                aria-hidden="true"
                style={{ '--ox': (Math.cos(a) * ring.rx * 100).toFixed(2), '--oy': (Math.sin(a) * ring.ry * 100).toFixed(2) } as CSSProperties}
              >
                <DigitIcon name={item.glyph} />
                <span className="porb-tip">{item.label[locale]}</span>
              </Link>
            );
          })}
        </div>

        <nav
          className="porb-legend"
          aria-label={`${COPY.nav[locale]} ${model.core.name[locale]}`}
          onMouseLeave={() => highlight(-1)}
          onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) highlight(-1); }}
        >
          <ul role="list">
            {items.map((item, i) => (
              <li key={item.id}>
                <NavLink
                  path={item.path}
                  hash={item.hash}
                  className={`porb-pill${active === i ? ' is-active' : ''}`}
                  onMouseEnter={() => highlight(i)}
                  onFocus={() => highlight(i)}
                >
                  <DigitIcon name={item.glyph} />
                  <span>{item.label[locale]}</span>
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </section>
  );
}
