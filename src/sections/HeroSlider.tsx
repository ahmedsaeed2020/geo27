import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { ArrowLeft, ArrowRight, Check, ChevronLeft, ChevronRight, Maximize2, Pause, Play } from 'lucide-react';
import { useLocale, localeHref } from '@/lib/i18n';
import ShotLightbox from '@/components/product/ShotLightbox';
import { focusLeadForm } from '@/components/LeadCapturePanel';
import { Button } from '@/components/ui/button';
import { HERO_COPY, HERO_SLIDES } from '@/content/hero-slides';
import { useSlideshow } from '@/hooks/use-slideshow';
import '@/hero-slider.css';

/** Time each product stays in the first fold while autoplay runs. */
export const HERO_MS = 7000;
const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Home first fold: one slide per product family. Copy, photograph and proof change together; the photograph is
 * revealed from the side the next slide comes from, the proof card floats in after it, and the product rail below
 * shows autoplay progress. Real screens open in the lightbox; journey cards only list stages the hubs publish.
 */
export default function HeroSlider() {
  const l = useLocale();
  const navigate = useNavigate();
  const slides = HERO_SLIDES;
  const count = slides.length;
  const [zoom, setZoom] = useState<number | null>(null);
  const show = useSlideshow({ count, locale: l, paused: zoom !== null, threshold: 0.2 });
  const { active, direction, cycle, go, playing, setPlaying, reduced, running } = show;
  const visualRef = useRef<HTMLDivElement>(null);
  const frame = useRef(0);
  // Every photograph after the first loads once the page has settled, so changing slides never shows an empty frame.
  const [primed, setPrimed] = useState(false);
  useEffect(() => {
    const id = window.setTimeout(() => setPrimed(true), 900);
    return () => window.clearTimeout(id);
  }, []);
  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  const slide = slides[active]!;
  const PrevIcon = l === 'ar' ? ChevronRight : ChevronLeft;
  const NextIcon = l === 'ar' ? ChevronLeft : ChevronRight;
  const LinkArrow = l === 'ar' ? ArrowLeft : ArrowRight;
  // The next slide enters from the reading end (left in Arabic, right in English); going back reverses it.
  const fromEnd = direction === 1;
  const wipe = (l === 'ar') === fromEnd ? 'left' : 'right';

  const bookDemo = () => {
    if (!focusLeadForm({ product: slide.product, department: '', interest: slide.name })) void navigate({ to: localeHref('/demo', l) });
  };

  // A gentle parallax on fine pointers, written to CSS variables so React does not re-render.
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (reduced || event.pointerType !== 'mouse') return;
    const node = visualRef.current;
    if (!node) return;
    const { clientX, clientY } = event;
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      const box = node.getBoundingClientRect();
      node.style.setProperty('--hs-px', ((clientX - box.left) / box.width - 0.5).toFixed(3));
      node.style.setProperty('--hs-py', ((clientY - box.top) / box.height - 0.5).toFixed(3));
    });
  };
  const resetParallax = () => {
    cancelAnimationFrame(frame.current);
    visualRef.current?.style.setProperty('--hs-px', '0');
    visualRef.current?.style.setProperty('--hs-py', '0');
  };

  const zoomed = zoom !== null ? slides[zoom] : undefined;
  const zoomShot = zoomed?.proof.kind === 'screen' ? zoomed.proof.screen : undefined;

  return (
    <section
      ref={show.sectionRef}
      className="hx"
      aria-roledescription={l === 'ar' ? 'عرض شرائح' : 'carousel'}
      aria-label={HERO_COPY.region[l]}
      data-running={running ? 'true' : 'false'}
      data-slide={slide.id}
      {...show.sectionHandlers}
      onMouseLeave={() => { show.sectionHandlers.onMouseLeave(); resetParallax(); }}
    >
      <div className="hx-backdrop" aria-hidden="true"><span className="hx-orb" /><span className="hx-orb hx-orb-2" /><span className="hx-lines" /></div>

      <div className="hx-inner">
        <div className="hx-copy">
          <div className="hx-top">
            <h1 className="hx-brand"><span className="hx-mark" aria-hidden="true"><i /><i /><i /></span>{HERO_COPY.brand[l]}</h1>
            <p className="hx-trust"><span className="hx-trust-dot" aria-hidden="true" />{HERO_COPY.trust[l]}</p>
          </div>

          <div className="hx-panels" {...show.swipeHandlers}>
            {slides.map((s, i) => {
              const shown = i === active;
              return (
                <div
                  key={s.id}
                  id={`hx-slide-${s.id}`}
                  className="hx-panel"
                  role="tabpanel"
                  aria-roledescription={l === 'ar' ? 'شريحة' : 'slide'}
                  aria-labelledby={`hx-tab-${s.id}`}
                  data-active={shown ? 'true' : 'false'}
                  aria-hidden={!shown}
                  inert={!shown}
                >
                  <p className="hx-chip hx-in" style={{ '--i': 0 } as CSSProperties}><span className="hx-chip-name">{s.name}</span><span className="hx-chip-tag">{s.tag[l]}</span></p>
                  <h2 className="hx-title hx-in" style={{ '--i': 1 } as CSSProperties}>{s.title[l]}</h2>
                  <p className="hx-lead hx-in" style={{ '--i': 2 } as CSSProperties}>{s.lead[l]}</p>
                  <ul className="hx-points">
                    {s.points.map((point, k) => (
                      <li key={point.en} className="hx-in" style={{ '--i': 3 + k } as CSSProperties}><span className="hx-tick" aria-hidden="true"><Check size={13} strokeWidth={2.8} /></span>{point[l]}</li>
                    ))}
                  </ul>
                  <div className="hx-ctas hx-in" style={{ '--i': 6 } as CSSProperties}>
                    <Button size="lg" className="hx-demo" onClick={bookDemo}>{HERO_COPY.demo[l]}</Button>
                    <Link to={localeHref(s.link.path, l)} className="hx-link">{s.link.label[l]}<LinkArrow size={17} aria-hidden="true" /></Link>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div ref={visualRef} className="hx-visual" data-wipe={wipe} onPointerMove={onPointerMove} onPointerLeave={resetParallax} {...show.swipeHandlers}>
          <span className="hx-frame" aria-hidden="true" />
          <span className="hx-ring" aria-hidden="true" />
          <div className="hx-photos">
            {slides.map((s, i) => (
              <div key={s.id} className="hx-photo" data-active={i === active ? 'true' : 'false'} aria-hidden={i !== active}>
                {(i === 0 || primed || i === active) && (
                  <img
                    src={s.photo.large}
                    srcSet={`${s.photo.small} 640w, ${s.photo.large} 960w`}
                    sizes="(max-width: 900px) 92vw, 44vw"
                    width={960}
                    height={1200}
                    alt={s.photo.alt[l]}
                    loading={i === 0 ? 'eager' : 'lazy'}
                    fetchPriority={i === 0 ? 'high' : 'auto'}
                    decoding="async"
                  />
                )}
              </div>
            ))}
            <span className="hx-photo-shade" aria-hidden="true" />
          </div>

          {slides.map((s, i) => {
            const shown = i === active;
            return (
              <div key={s.id} className="hx-overlays" data-active={shown ? 'true' : 'false'} aria-hidden={!shown} inert={!shown}>
                <p className="hx-stat"><strong>{s.stat.value}</strong><span>{s.stat.label[l]}</span></p>
                {s.proof.kind === 'screen' ? (
                  <figure className="hx-screen">
                    <div className="hx-screen-bar"><span className="hx-dots" aria-hidden="true"><i /><i /><i /></span><span className="hx-screen-cap">{s.proof.screen.caption[l]}</span></div>
                    <button type="button" className="hx-screen-btn" onClick={() => setZoom(i)} aria-label={`${HERO_COPY.enlarge[l]}: ${s.proof.screen.caption[l]}`}>
                      {(i === 0 || primed || shown) && <img src={s.proof.screen.src} width={s.proof.screen.width} height={s.proof.screen.height} alt={s.proof.screen.caption[l]} loading={i === 0 ? 'eager' : 'lazy'} decoding="async" />}
                      <span className="hx-zoom" aria-hidden="true"><Maximize2 size={15} /></span>
                    </button>
                    <figcaption className="hx-real"><span className="hx-live" aria-hidden="true" />{HERO_COPY.real[l]}</figcaption>
                  </figure>
                ) : (
                  <div className="hx-flow">
                    <p className="hx-flow-label">{s.proof.label[l]}</p>
                    <ol className="hx-steps">
                      {s.proof.steps.map((step, k) => (
                        <li key={step.en} className="hx-step" style={{ '--i': k } as CSSProperties}><span className="hx-step-no">{pad(k + 1)}</span><span className="hx-step-label">{step[l]}</span></li>
                      ))}
                    </ol>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="hx-rail">
        <div ref={show.tabsRef} className="hx-tabs" role="tablist" aria-label={HERO_COPY.slides[l]} onKeyDown={show.onTabsKey}>
          {slides.map((s, i) => {
            const selected = i === active;
            return (
              <button
                key={s.id}
                id={`hx-tab-${s.id}`}
                type="button"
                role="tab"
                data-index={i}
                aria-selected={selected}
                aria-controls={`hx-slide-${s.id}`}
                tabIndex={selected ? 0 : -1}
                className="hx-tab"
                onClick={() => go(i)}
              >
                <span className="hx-tab-no">{pad(i + 1)}</span>
                <span className="hx-tab-text"><span className="hx-tab-name">{s.name}</span><span className="hx-tab-tag">{s.tag[l]}</span></span>
                <span className="hx-track" aria-hidden="true">
                  {selected && (
                    <span
                      key={`${active}-${cycle}`}
                      className="hx-bar"
                      data-static={reduced ? 'true' : 'false'}
                      style={{ animationDuration: `${HERO_MS}ms`, animationPlayState: running ? 'running' : 'paused' }}
                      onAnimationEnd={event => { if (event.animationName === 'hx-progress') go(active + 1, 1); }}
                    />
                  )}
                </span>
              </button>
            );
          })}
        </div>
        <div className="hx-controls">
          <span className="hx-count"><strong>{pad(active + 1)}</strong> {HERO_COPY.of[l]} {pad(count)}</span>
          <button type="button" className="hx-ctl" onClick={() => go(active - 1, -1)} aria-label={HERO_COPY.prev[l]}><PrevIcon size={19} /></button>
          <button type="button" className="hx-ctl" onClick={() => setPlaying(p => !p)} aria-label={playing && !reduced ? HERO_COPY.pause[l] : HERO_COPY.play[l]} aria-pressed={!(playing && !reduced)}>
            {playing && !reduced ? <Pause size={17} /> : <Play size={17} />}
          </button>
          <button type="button" className="hx-ctl" onClick={() => go(active + 1, 1)} aria-label={HERO_COPY.next[l]}><NextIcon size={19} /></button>
        </div>
      </div>

      {zoomShot && zoom !== null && <ShotLightbox shots={[zoomShot]} index={0} onIndexChange={() => {}} onClose={() => setZoom(null)} />}
    </section>
  );
}
