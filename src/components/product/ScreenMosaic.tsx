import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Expand, LayoutGrid, ScanSearch } from 'lucide-react';
import ShotLightbox from '@/components/product/ShotLightbox';
import type { Shot } from '@/content/product-shots';
import type { Locale } from '@/lib/i18n';
import '@/screen-mosaic.css';

/** One cell of the mosaic: a real screen (or a close-up crop of one), optionally a magnified region of it. */
export type MosaicTile = { shot: Shot; focus?: { x: number; y: number; zoom: number } | undefined; caption?: string | undefined };

const C = {
  real: { ar: 'شاشات فعلية من النظام', en: 'Real system screens' },
  detail: { ar: 'تفصيل مكبّر', en: 'Close-up' },
  enlarge: { ar: 'تكبير', en: 'Enlarge' },
  note: { ar: 'الأسماء والأرقام في الشاشات توضيحية. اضغط أي مقطع لتكبيره.', en: 'Names and figures in the screens are illustrative. Select any view to enlarge it.' },
};
const views = (n: number, l: Locale) => (l === 'ar' ? (n === 1 ? 'مقطع واحد' : n === 2 ? 'مقطعان' : `${n} ${n > 10 ? 'مقطعًا' : 'مقاطع'}`) : n === 1 ? '1 view' : `${n} views`);
const viewAll = (n: number, l: Locale) => (l === 'ar' ? `عرض كل المقاطع (${n})` : `View all ${n} views`);

/** Width/height of the cell: screens keep their own proportions, magnified regions are square. */
const ratio = (t: MosaicTile) => (t.focus ? 1 : t.shot.width / t.shot.height);
/** Tiles at least this wide lead across the whole frame; narrower than SIDE they stack in the side column. */
const LEAD = 2.2;
const SIDE = 2;
/** Tiles shown before the "view all" button on a phone-width frame. */
const COMPACT = 4;
/** Caption strip under each tile, and the gap between tiles, in CSS pixels (see screen-mosaic.css). */
const CAPTION = 58;
const GAP = 14;

/**
 * Masonry of several real screens in one frame: the widest leads across the top, wide cards stack in the main
 * column, tall menus, square charts and magnified details stack beside them. The side column's width is solved from
 * the tiles' proportions so both columns end level without cropping a single pixel of any screen. Every tile opens
 * the shared lightbox at full resolution.
 */
export default function ScreenMosaic({ tiles, locale, label, id, note = true }: { tiles: MosaicTile[]; locale: Locale; label: string; id: string; note?: boolean }) {
  const [index, setIndex] = useState<number | null>(null);
  const shots = useMemo(() => {
    const seen = new Map<string, Shot>();
    for (const t of tiles) if (!seen.has(t.shot.id)) seen.set(t.shot.id, t.shot);
    return [...seen.values()];
  }, [tiles]);
  const body = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(1120);
  useEffect(() => {
    const el = body.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([entry]) => {
      if (entry) setWidth(Math.round(entry.contentRect.width));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const layout = useMemo(() => {
    const [first, ...others] = tiles;
    const lead = first && ratio(first) >= LEAD ? first : undefined;
    const rest = lead ? others : tiles;
    let main = rest.filter(t => ratio(t) >= SIDE);
    let side = rest.filter(t => ratio(t) < SIDE);
    // One column is enough when everything has the same shape; it then splits in two.
    if (!main.length || !side.length) {
      const all = [...main, ...side];
      main = all.filter((_, i) => i % 2 === 0);
      side = all.filter((_, i) => i % 2 === 1);
    }
    const height = (list: MosaicTile[]) => list.reduce((sum, t) => sum + 1 / ratio(t), 0);
    const a = height(main);
    const b = height(side);
    // Level column ends: mainWidth·a + captions/gaps of the main column = sideWidth·b + those of the side column.
    const w = Math.max(320, width - GAP);
    const extra = (side.length - main.length) * (CAPTION + GAP);
    const mainWidth = a + b > 0 ? (extra + w * b) / (a + b) : w;
    const sideWidth = Math.min(w * 0.52, Math.max(w * 0.28, w - mainWidth));
    const sideFr = b > 0 ? sideWidth / (w - sideWidth) : 0;
    return { lead, main, side, sideFr: Number(sideFr.toFixed(3)) };
  }, [tiles, width]);

  if (!tiles.length) return null;
  let no = 0;
  const tile = (t: MosaicTile, key: string) => {
    const n = ++no;
    const caption = t.caption ?? t.shot.caption[locale];
    const open = () => setIndex(Math.max(0, shots.findIndex(s => s.id === t.shot.id)));
    const f = t.focus;
    return (
      <button key={key} type="button" className="mz-tile" data-kind={f ? 'detail' : 'screen'} data-extra={n > COMPACT ? '' : undefined} onClick={open} aria-label={`${C.enlarge[locale]}: ${caption}`} data-motion-card>
        <span className="mz-media" style={{ aspectRatio: f ? '1 / 1' : `${t.shot.width} / ${t.shot.height}` } as CSSProperties}>
          {f ? (
            <span className="mz-zoom" aria-hidden="true" style={{ backgroundImage: `url("${t.shot.src}")`, backgroundSize: `${f.zoom * 100}% auto`, backgroundPosition: `${f.x}% ${f.y}%` }} />
          ) : (
            <img src={t.shot.src} width={t.shot.width} height={t.shot.height} alt="" loading="lazy" decoding="async" />
          )}
          {f && (
            <span className="mz-badge" aria-hidden="true">
              <ScanSearch />
              {C.detail[locale]}
            </span>
          )}
          <span className="mz-expand" aria-hidden="true">
            <Expand />
          </span>
        </span>
        <span className="mz-cap">
          <span className="mz-no" dir="ltr" aria-hidden="true">
            {String(n).padStart(2, '0')}
          </span>
          <span className="mz-cap-text">{caption}</span>
        </span>
      </button>
    );
  };

  return (
    <figure className="mz" aria-labelledby={`${id}-mz`} data-count={tiles.length}>
      <figcaption className="mz-bar" id={`${id}-mz`}>
        <span className="mz-mark" aria-hidden="true">
          <LayoutGrid />
        </span>
        <bdi className="mz-label">{label}</bdi>
        <span className="mz-sub">{C.real[locale]}</span>
        <span className="mz-count">{views(tiles.length, locale)}</span>
      </figcaption>
      <div className="mz-body" ref={body}>
        {layout.lead && <div className="mz-lead">{tile(layout.lead, 'lead')}</div>}
        {(layout.main.length > 0 || layout.side.length > 0) && (
          <div className="mz-cols" style={layout.side.length ? ({ '--mz-side': `${layout.sideFr}fr` } as CSSProperties) : undefined} data-single={layout.side.length ? undefined : ''}>
            <div className="mz-col">{layout.main.map((t, i) => tile(t, `m${i}`))}</div>
            {layout.side.length > 0 && <div className="mz-col">{layout.side.map((t, i) => tile(t, `s${i}`))}</div>}
          </div>
        )}
      </div>
      {(note || tiles.length > COMPACT) && (
        <div className="mz-foot">
          {note && <p>{C.note[locale]}</p>}
          {tiles.length > COMPACT && (
            <button type="button" className="mz-all" onClick={() => setIndex(0)}>
              <LayoutGrid aria-hidden="true" />
              {viewAll(tiles.length, locale)}
            </button>
          )}
        </div>
      )}
      <ShotLightbox shots={shots} index={index} onIndexChange={setIndex} onClose={() => setIndex(null)} />
    </figure>
  );
}
