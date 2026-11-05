import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Expand, Pause, Play, ScanSearch, LayoutGrid } from 'lucide-react';
import ShotLightbox from '@/components/product/ShotLightbox';
import { nativeWidth, type Shot } from '@/content/product-shots';
import { useSlideshow } from '@/hooks/use-slideshow';
import type { Locale } from '@/lib/i18n';
import '@/screen-mosaic.css';

/** One view of the showcase: a real screen (or a close-up crop of one), optionally a magnified region of it. */
export type MosaicTile = { shot: Shot; focus?: { x: number; y: number; zoom: number } | undefined; caption?: string | undefined };

const C = {
  inside: { ar: 'من داخل النظام', en: 'Inside the system' },
  detail: { ar: 'تفصيل مكبّر', en: 'Close-up' },
  open: { ar: 'عرض بالحجم الكامل', en: 'View full size' },
  enlarge: { ar: 'تكبير الشاشة', en: 'Enlarge screen' },
  note: { ar: 'الأسماء والأرقام في الشاشات توضيحية.', en: 'Names and figures in the screens are illustrative.' },
  views: { ar: 'شاشات', en: 'screens' },
  play: { ar: 'تشغيل العرض', en: 'Play' },
  pause: { ar: 'إيقاف العرض مؤقتًا', en: 'Pause' },
  of: { ar: 'من', en: 'of' },
};

/** Time each view stays on stage before the next one; the progress bar's animation drives it. */
const SLIDE_MS = 7000;
/** Views narrower than this (width ÷ height) sit beside their text instead of under it on wide frames. */
const SIDE_RATIO = 1.35;
/** Frames at least this wide (CSS px) use the side-by-side composition and the roomy spacing. */
const WIDE = 760;

const pad = (n: number) => String(n).padStart(2, '0');

/** "Headline: detail" captions become a headline and a supporting line; short ones stay a single headline. */
export function splitCaption(text: string, locale: Locale): { title: string; detail?: string } {
  const clean = text.trim();
  const colon = clean.search(/[:：]\s/);
  let title = clean;
  let detail: string | undefined;
  if (colon > 0 && colon <= 72) {
    title = clean.slice(0, colon).trim();
    detail = clean.slice(colon + 1).trim();
  } else {
    const comma = clean.search(/[،,]\s/);
    if (comma >= 14 && clean.length - comma > 18) {
      title = clean.slice(0, comma).trim();
      detail = clean.slice(comma + 1).trim();
    }
  }
  if (detail && locale === 'en') detail = detail.charAt(0).toUpperCase() + detail.slice(1);
  return detail ? { title, detail } : { title };
}

/** Proportions and the widest on-screen size of a view; magnified regions are shown as a 16:10 window. */
const shapeOf = (t: MosaicTile) => (t.focus ? { ratio: 1.6, max: 720 } : { ratio: t.shot.width / t.shot.height, max: nativeWidth(t.shot) });

/**
 * Product showcase of several real screens in one frame: a stage presents one view at a time — its idea as a headline
 * and supporting line, the screen itself at no more than its original on-screen size — and a rail of thumbnails shows
 * every view of the set. It advances on its own (pausing on hover, keyboard focus, an open lightbox or reduced-motion
 * preferences), follows the reading direction for arrows and swipes, and opens any screen at full resolution.
 */
export default function ScreenMosaic({ tiles, locale, label, id, note = true }: { tiles: MosaicTile[]; locale: Locale; label: string; id: string; note?: boolean }) {
  const [zoom, setZoom] = useState<number | null>(null);
  const shots = useMemo(() => {
    const seen = new Map<string, Shot>();
    for (const t of tiles) if (!seen.has(t.shot.id)) seen.set(t.shot.id, t.shot);
    return [...seen.values()];
  }, [tiles]);
  const count = Math.max(1, tiles.length);
  const show = useSlideshow({ count, locale, paused: zoom !== null, threshold: 0.3 });
  const { active, direction, cycle, go, playing, setPlaying, reduced, running } = show;

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

  const views = useMemo(() => {
    const parts = tiles.map(t => {
      const caption = t.caption ?? t.shot.caption[locale];
      return { caption, ...splitCaption(caption, locale) };
    });
    // Two different screens must never share a headline: those keep their whole caption as the headline.
    const counts = new Map<string, number>();
    for (const p of parts) counts.set(p.title, (counts.get(p.title) ?? 0) + 1);
    return tiles.map((t, i) => {
      const p = parts[i]!;
      const twin = (counts.get(p.title) ?? 0) > 1 && tiles.findIndex(o => o.shot.id === t.shot.id) === i && !t.focus;
      return { ...t, caption: p.caption, title: twin ? p.caption : p.title, detail: twin ? undefined : p.detail, shape: shapeOf(t) };
    });
  }, [tiles, locale]);

  // One stage height for the whole set (the tallest composition, within bounds), so nothing below moves as it plays.
  const geometry = useMemo(() => {
    const wide = width >= WIDE;
    const inset = wide ? 28 : 16;
    const inner = Math.max(240, width - inset * 2);
    const gap = wide ? 20 : 14;
    const copy = wide ? 92 : 112;
    const heights = views.map(v => {
      if (wide && v.shape.ratio < SIDE_RATIO) return Math.max(250, Math.min(v.shape.max, (inner - gap) * 0.6) / v.shape.ratio);
      return copy + gap + Math.min(v.shape.max, inner) / v.shape.ratio;
    });
    // Sized for most of the set rather than its tallest outlier: an unusually tall screen scales down to fit.
    const sorted = [...heights].sort((a, b) => a - b);
    const typical = sorted[Math.floor(0.7 * (sorted.length - 1))] ?? 0;
    const floor = wide ? 330 : 240;
    const cap = wide ? Math.min(540, width * 0.48) : Math.min(460, width * 1.1);
    const stage = Math.round(Math.min(cap, Math.max(floor, typical)) + inset * 2);
    // Compositions much shorter than the stage gather in its middle with a larger headline instead of leaving a gap.
    const roomy = heights.map(h => h + inset * 2 < stage * 0.78);
    return { wide, stage, roomy };
  }, [views, width]);

  if (!tiles.length) return null;
  const multiple = views.length > 1;
  const open = (t: MosaicTile) => setZoom(Math.max(0, shots.findIndex(s => s.id === t.shot.id)));
  const dir = direction * (locale === 'ar' ? -1 : 1);

  return (
    <figure
      ref={show.sectionRef}
      className="mz"
      aria-labelledby={`${id}-mz`}
      aria-roledescription={multiple ? (locale === 'ar' ? 'عرض شاشات' : 'screen showcase') : undefined}
      data-count={views.length}
      data-running={running ? 'true' : 'false'}
      {...show.sectionHandlers}
    >
      <figcaption className="mz-bar" id={`${id}-mz`}>
        <span className="mz-mark" aria-hidden="true">
          <LayoutGrid />
        </span>
        <bdi className="mz-label">{label}</bdi>
        <span className="mz-sub">{C.inside[locale]}</span>
        <span className="mz-sr">
          {' '}
          · {views.length} {C.views[locale]}
        </span>
        {multiple && (
          <span className="mz-ctl">
            <span className="mz-count" dir="ltr" aria-hidden="true">
              <strong>{pad(active + 1)}</strong> / {pad(views.length)}
            </span>
            {!reduced && (
              <button type="button" className="mz-play" onClick={() => setPlaying(!playing)} aria-label={playing ? C.pause[locale] : C.play[locale]} aria-pressed={!playing}>
                {playing ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
              </button>
            )}
          </span>
        )}
      </figcaption>

      <div className="mz-body" ref={body}>
        <div className="sv-stage" style={{ height: geometry.stage, '--sv-dir': dir } as CSSProperties} data-wide={geometry.wide ? '' : undefined} {...(multiple ? show.swipeHandlers : {})}>
          <span className="sv-glow" aria-hidden="true" />
          {views.map((v, i) => {
            const on = i === active;
            const side = geometry.wide && v.shape.ratio < SIDE_RATIO;
            return (
              <div
                key={`${v.shot.id}-${i}`}
                className="sv-slide"
                id={`${id}-sv-${i}`}
                role={multiple ? 'tabpanel' : undefined}
                aria-labelledby={multiple ? `${id}-svt-${i}` : undefined}
                data-active={on ? 'true' : 'false'}
                data-layout={side ? 'side' : 'stack'}
                data-room={!side && geometry.roomy[i] ? '' : undefined}
                inert={!on}
              >
                <div className="sv-copy">
                  <span className="sv-no" dir="ltr" aria-hidden="true">
                    {pad(i + 1)}
                  </span>
                  <p className="sv-title">
                    {v.focus && (
                      <span className="sv-badge">
                        <ScanSearch aria-hidden="true" />
                        {C.detail[locale]}
                      </span>
                    )}
                    {v.title}
                  </p>
                  {v.detail && <p className="sv-detail">{v.detail}</p>}
                  <button type="button" className="sv-open" onClick={() => open(v)} aria-label={`${C.enlarge[locale]}: ${v.caption}`}>
                    <Expand aria-hidden="true" />
                    <span>{C.open[locale]}</span>
                  </button>
                </div>
                <button type="button" className="sv-screen" onClick={() => open(v)} tabIndex={-1} aria-hidden="true">
                  {v.focus ? (
                    <span className="sv-zoom" style={{ backgroundImage: `url("${v.shot.src}")`, backgroundSize: `${v.focus.zoom * 100}% auto`, backgroundPosition: `${v.focus.x}% ${v.focus.y}%` }} />
                  ) : (
                    <img src={v.shot.src} width={v.shot.width} height={v.shot.height} alt="" loading="lazy" decoding="async" style={{ maxWidth: `min(100%, ${v.shape.max}px)` }} />
                  )}
                </button>
              </div>
            );
          })}
        </div>

        {multiple && (
          <div className="sv-tabs" role="tablist" aria-label={`${label} · ${C.inside[locale]}`} ref={show.tabsRef} onKeyDown={show.onTabsKey}>
            {views.map((v, i) => {
              const selected = i === active;
              return (
                <button
                  key={`${v.shot.id}-t${i}`}
                  type="button"
                  role="tab"
                  id={`${id}-svt-${i}`}
                  className="sv-tab"
                  aria-selected={selected}
                  aria-controls={`${id}-sv-${i}`}
                  tabIndex={selected ? 0 : -1}
                  data-index={i}
                  onClick={() => go(i)}
                >
                  <span className="sv-thumb" aria-hidden="true">
                    {v.focus ? (
                      <span className="sv-zoom" style={{ backgroundImage: `url("${v.shot.src}")`, backgroundSize: `${v.focus.zoom * 100}% auto`, backgroundPosition: `${v.focus.x}% ${v.focus.y}%` }} />
                    ) : (
                      <img src={v.shot.src} width={v.shot.width} height={v.shot.height} alt="" loading="lazy" decoding="async" />
                    )}
                  </span>
                  <span className="sv-tab-text">
                    <span className="sv-tab-no" dir="ltr">
                      {pad(i + 1)}
                    </span>
                    <span className="sv-tab-title">
                      {v.focus && <ScanSearch className="sv-tab-icon" aria-hidden="true" />}
                      {v.title}
                    </span>
                  </span>
                  <span className="sv-track" aria-hidden="true">
                    {selected && (
                      <span
                        key={`${active}-${cycle}`}
                        className="sv-bar"
                        data-static={reduced ? 'true' : 'false'}
                        style={{ animationDuration: `${SLIDE_MS}ms`, animationPlayState: running ? 'running' : 'paused' }}
                        onAnimationEnd={event => {
                          if (event.animationName === 'sv-progress') go(active + 1, 1);
                        }}
                      />
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {note && (
        <div className="mz-foot">
          <p>{C.note[locale]}</p>
        </div>
      )}
      <ShotLightbox shots={shots} index={zoom} onIndexChange={setZoom} onClose={() => setZoom(null)} />
    </figure>
  );
}
