import { useCallback, useEffect, useRef, useState, type CSSProperties, type FocusEvent, type KeyboardEvent, type PointerEvent } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { ArrowLeft, ArrowRight, Check, ChevronLeft, ChevronRight, Maximize2, Pause, Play } from 'lucide-react';
import { useLocale, localeHref } from '@/lib/i18n';
import { SectionHeading } from '@/components/cms/SectionText';
import ShotLightbox from '@/components/product/ShotLightbox';
import { focusLeadForm } from '@/components/LeadCapturePanel';
import { Button } from '@/components/ui/button';
import { HOME_SLIDES, SLIDER_COPY, SLIDER_FACTS } from '@/content/home-slider';
import '@/home-slider.css';

/** Time each slide stays on screen while autoplay runs. */
export const SLIDE_MS = 8000;
const pad = (n: number) => String(n).padStart(2, '0');

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReduced(query.matches);
    sync();
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, []);
  return reduced;
}

/** Counts up once when the slider first comes into view; server and no-motion renders keep the final figure. */
function CountUp({ value, start, reduced }: { value: number; start: boolean; reduced: boolean }) {
  const [shown, setShown] = useState(value);
  const done = useRef(false);
  useEffect(() => {
    if (!start || reduced || done.current) return;
    done.current = true;
    let frame = 0;
    const began = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - began) / 1400);
      setShown(Math.round(value * (1 - Math.pow(1 - t, 3))));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [start, reduced, value]);
  return <>{shown}</>;
}

export default function ProductSlider() {
  const l = useLocale();
  const navigate = useNavigate();
  const reduced = useReducedMotion();
  const slides = HOME_SLIDES;
  const count = slides.length;
  const sectionRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const tabsRef = useRef<HTMLDivElement>(null);
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const [active, setActive] = useState(0);
  const [direction, setDirection] = useState<1 | -1>(1);
  const [cycle, setCycle] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [inView, setInView] = useState(false);
  const [seen, setSeen] = useState(false);
  const [pageVisible, setPageVisible] = useState(true);
  const [primed, setPrimed] = useState<ReadonlySet<number>>(() => new Set([0]));
  const [zoom, setZoom] = useState<{ slide: number; index: number } | null>(null);

  // Visitors who prefer less motion start paused; they can still press play.
  useEffect(() => { if (reduced) setPlaying(false); }, [reduced]);

  useEffect(() => {
    const node = sectionRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(([entry]) => {
      const visible = Boolean(entry?.isIntersecting);
      setInView(visible);
      if (visible) setSeen(true);
    }, { threshold: 0.35 });
    observer.observe(node);
    const onVisibility = () => setPageVisible(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', onVisibility);
    return () => { observer.disconnect(); document.removeEventListener('visibilitychange', onVisibility); };
  }, []);

  // Images load only for the shown slide and the next one, once the slider is close to the viewport.
  useEffect(() => {
    if (!seen) return;
    setPrimed(previous => {
      const next = new Set(previous);
      next.add(active);
      next.add((active + 1) % count);
      return next.size === previous.size ? previous : next;
    });
  }, [active, seen, count]);

  const go = useCallback((target: number, step?: 1 | -1) => {
    const next = (target + count) % count;
    setDirection(step ?? (next >= active ? 1 : -1));
    setActive(next);
    setCycle(c => c + 1);
  }, [active, count]);

  // Keep the active tab in view when the tab row scrolls (phones), without moving the page.
  useEffect(() => {
    const row = tabsRef.current;
    const tab = row?.querySelector<HTMLElement>(`[data-index="${active}"]`);
    if (!row || !tab || row.scrollWidth <= row.clientWidth + 1) return;
    const rowBox = row.getBoundingClientRect();
    const tabBox = tab.getBoundingClientRect();
    row.scrollBy({ left: tabBox.left + tabBox.width / 2 - (rowBox.left + rowBox.width / 2), behavior: reduced ? 'auto' : 'smooth' });
  }, [active, reduced]);

  const running = playing && !reduced && inView && !hovered && !focused && pageVisible && zoom === null;
  const slide = slides[active]!;
  const forwardKey = l === 'ar' ? 'ArrowLeft' : 'ArrowRight';
  const backKey = l === 'ar' ? 'ArrowRight' : 'ArrowLeft';
  const PrevIcon = l === 'ar' ? ChevronRight : ChevronLeft;
  const NextIcon = l === 'ar' ? ChevronLeft : ChevronRight;
  const LinkArrow = l === 'ar' ? ArrowLeft : ArrowRight;

  const onTabsKey = (event: KeyboardEvent<HTMLDivElement>) => {
    let target: number | null = null;
    if (event.key === forwardKey) target = active + 1;
    else if (event.key === backKey) target = active - 1;
    else if (event.key === 'Home') target = 0;
    else if (event.key === 'End') target = count - 1;
    if (target === null) return;
    event.preventDefault();
    const next = (target + count) % count;
    go(next, event.key === backKey || event.key === 'Home' ? -1 : 1);
    tabsRef.current?.querySelector<HTMLElement>(`[data-index="${next}"]`)?.focus();
  };

  // Pause for keyboard users only; a mouse click on a tab should not freeze autoplay.
  const onFocusIn = (event: FocusEvent<HTMLElement>) => {
    const target = event.target as HTMLElement;
    if (target.matches(':focus-visible')) setFocused(true);
  };
  const onFocusOut = (event: FocusEvent<HTMLElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false);
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse') return;
    swipe.current = { x: event.clientX, y: event.clientY };
  };
  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const from = swipe.current;
    swipe.current = null;
    if (!from) return;
    const dx = event.clientX - from.x;
    const dy = event.clientY - from.y;
    if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy) * 1.4) return;
    // Arabic reads right to left, so the next slide arrives with a rightward swipe.
    const forward = l === 'ar' ? dx > 0 : dx < 0;
    go(active + (forward ? 1 : -1), forward ? 1 : -1);
  };

  // Gentle device tilt that follows a fine pointer; written to CSS variables to avoid re-rendering.
  const frame = useRef(0);
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (reduced || event.pointerType !== 'mouse') return;
    const stage = stageRef.current;
    if (!stage) return;
    const { clientX, clientY } = event;
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      const box = stage.getBoundingClientRect();
      stage.style.setProperty('--ps-px', (((clientX - box.left) / box.width) - 0.5).toFixed(3));
      stage.style.setProperty('--ps-py', (((clientY - box.top) / box.height) - 0.5).toFixed(3));
    });
  };
  const resetTilt = () => {
    cancelAnimationFrame(frame.current);
    stageRef.current?.style.setProperty('--ps-px', '0');
    stageRef.current?.style.setProperty('--ps-py', '0');
  };
  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  const bookDemo = () => {
    const name = slide.product === 'hr' ? 'DIGIT HR' : 'DIGIT Pro';
    const sent = focusLeadForm({ product: slide.product, department: slide.department ?? '', interest: `${name} — ${slide.short[l]}` });
    if (!sent) void navigate({ to: localeHref('/demo', l) });
  };

  const zoomed = zoom ? slides[zoom.slide] : undefined;

  return (
    <section
      ref={sectionRef}
      id="product-band"
      className="ps"
      aria-roledescription={l === 'ar' ? 'عرض شرائح' : 'carousel'}
      aria-label={SLIDER_COPY.region[l]}
      data-running={running ? 'true' : 'false'}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); resetTilt(); }}
      onFocus={onFocusIn}
      onBlur={onFocusOut}
    >
      <div className="ps-scenes" aria-hidden="true">
        {slides.map((s, i) => (
          <div key={s.id} className="ps-scene" data-active={i === active ? 'true' : 'false'}>
            {primed.has(i) && (
              <img src={s.scene.large} srcSet={`${s.scene.small} 960w, ${s.scene.large} 1920w`} sizes="100vw" width={1920} height={1088} alt="" loading="lazy" decoding="async" />
            )}
          </div>
        ))}
        <div className="ps-veil" />
        <div className="ps-glow" />
        <div className="ps-grain" />
      </div>

      <div className="ps-inner">
        <header className="ps-head">
          <div className="ps-head-copy">
            <p className="ps-eyebrow"><span className="ps-mark" aria-hidden="true"><i /><i /><i /></span>{SLIDER_COPY.eyebrow}</p>
            <SectionHeading k="band" className="ps-h2">{SLIDER_COPY.heading[l]}</SectionHeading>
            <p className="ps-sub">{SLIDER_COPY.sub[l]}</p>
          </div>
          <dl className="ps-facts">
            {SLIDER_FACTS.map(fact => (
              <div key={fact.label.en} className="ps-fact">
                <dd><CountUp value={fact.value} start={seen} reduced={reduced} />{fact.suffix}</dd>
                <dt>{fact.label[l]}</dt>
              </div>
            ))}
          </dl>
        </header>

        <div
          ref={stageRef}
          className="ps-stage"
          data-direction={direction === 1 ? 'forward' : 'back'}
          aria-live={running ? 'off' : 'polite'}
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          onPointerCancel={() => { swipe.current = null; }}
          onPointerMove={onPointerMove}
          onPointerLeave={resetTilt}
        >
          {slides.map((s, i) => {
            const shown = i === active;
            const ready = primed.has(i);
            return (
              <article
                key={s.id}
                id={`ps-slide-${s.id}`}
                className="ps-slide"
                role="tabpanel"
                aria-roledescription={l === 'ar' ? 'شريحة' : 'slide'}
                aria-labelledby={`ps-tab-${s.id}`}
                data-active={shown ? 'true' : 'false'}
                aria-hidden={!shown}
                inert={!shown}
              >
                <div className="ps-copy">
                  <span className="ps-num" aria-hidden="true">{pad(i + 1)}</span>
                  <p className="ps-chip" style={{ '--i': 0 } as CSSProperties}>{s.chip[l]}</p>
                  <h3 className="ps-title" style={{ '--i': 1 } as CSSProperties}>{s.title[l]}</h3>
                  <p className="ps-lead" style={{ '--i': 2 } as CSSProperties}>{s.lead[l]}</p>
                  <ul className="ps-points">
                    {s.points.map((point, k) => (
                      <li key={point.en} style={{ '--i': 3 + k } as CSSProperties}><span className="ps-tick" aria-hidden="true"><Check size={14} strokeWidth={2.6} /></span>{point[l]}</li>
                    ))}
                  </ul>
                  {s.metric && (
                    <p className="ps-metric" style={{ '--i': 6 } as CSSProperties}><strong>{s.metric.value}</strong><span>{s.metric.label[l]}</span></p>
                  )}
                  <div className="ps-ctas" style={{ '--i': 7 } as CSSProperties}>
                    <Button size="lg" onClick={bookDemo}>{SLIDER_COPY.demo[l]}</Button>
                    <Link to={localeHref(s.link.path, l)} className="ps-link">{s.link.label[l]}<LinkArrow size={17} aria-hidden="true" /></Link>
                  </div>
                </div>

                <figure className="ps-visual" data-phone={s.phone ? 'true' : 'false'}>
                  <div className="ps-device">
                    <div className="ps-bezel">
                      <span className="ps-cam" aria-hidden="true" />
                      <div className="ps-screen">
                        {ready && <img src={s.screen.src} width={s.screen.width} height={s.screen.height} alt={s.screen.caption[l]} loading="lazy" decoding="async" className={s.scroll ? 'ps-scrolling' : undefined} />}
                        <button type="button" className="ps-zoom" onClick={() => setZoom({ slide: i, index: 0 })} aria-label={`${SLIDER_COPY.enlarge[l]}: ${s.screen.caption[l]}`}><Maximize2 size={16} /></button>
                      </div>
                    </div>
                    <div className="ps-base" aria-hidden="true"><span /></div>
                  </div>
                  {s.phone ? (
                    <button type="button" className="ps-phone" onClick={() => setZoom({ slide: i, index: 1 })} aria-label={`${SLIDER_COPY.enlarge[l]}: ${s.detail.caption[l]}`}>
                      <span className="ps-phone-notch" aria-hidden="true" />
                      {ready && <img src={s.detail.src} width={s.detail.width} height={s.detail.height} alt={s.detail.caption[l]} loading="lazy" decoding="async" />}
                    </button>
                  ) : (
                    <button type="button" className="ps-float" data-window={s.detail.height > s.detail.width * 0.4 ? 'true' : 'false'} onClick={() => setZoom({ slide: i, index: 1 })} aria-label={`${SLIDER_COPY.enlarge[l]}: ${s.detail.caption[l]}`}>
                      <span className="ps-float-cap"><span className="ps-dot" aria-hidden="true" />{s.detail.caption[l]}</span>
                      <span className="ps-float-img" style={{ aspectRatio: `${Math.round(s.detail.width / (s.detailZoom ?? 1))} / ${Math.min(s.detail.height, s.detail.width * 0.62)}` }}>
                        {ready && <img src={s.detail.src} width={s.detail.width} height={s.detail.height} alt={s.detail.caption[l]} loading="lazy" decoding="async" style={{ width: `${(s.detailZoom ?? 1) * 100}%` }} />}
                      </span>
                    </button>
                  )}
                  <figcaption className="ps-cap"><span className="ps-live" aria-hidden="true" />{SLIDER_COPY.real[l]} · {s.screen.caption[l]}</figcaption>
                </figure>
              </article>
            );
          })}
        </div>

        <div className="ps-nav">
          <div ref={tabsRef} className="ps-tabs" role="tablist" aria-label={SLIDER_COPY.slides[l]} onKeyDown={onTabsKey}>
            {slides.map((s, i) => {
              const selected = i === active;
              return (
                <button
                  key={s.id}
                  id={`ps-tab-${s.id}`}
                  type="button"
                  role="tab"
                  data-index={i}
                  aria-selected={selected}
                  aria-controls={`ps-slide-${s.id}`}
                  tabIndex={selected ? 0 : -1}
                  className="ps-tab"
                  onClick={() => go(i)}
                >
                  <span className="ps-tab-no">{pad(i + 1)}</span>
                  <span className="ps-tab-label">{s.short[l]}</span>
                  <span className="ps-track" aria-hidden="true">
                    {selected && (
                      <span
                        key={`${active}-${cycle}`}
                        className="ps-bar"
                        data-static={reduced ? 'true' : 'false'}
                        style={{ animationDuration: `${SLIDE_MS}ms`, animationPlayState: running ? 'running' : 'paused' }}
                        onAnimationEnd={event => { if (event.animationName === 'ps-progress') go(active + 1, 1); }}
                      />
                    )}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="ps-controls">
            <span className="ps-count"><strong>{pad(active + 1)}</strong> {SLIDER_COPY.of[l]} {pad(count)}</span>
            <button type="button" className="ps-ctl" onClick={() => go(active - 1, -1)} aria-label={SLIDER_COPY.prev[l]}><PrevIcon size={20} /></button>
            <button type="button" className="ps-ctl" onClick={() => setPlaying(p => !p)} aria-label={playing && !reduced ? SLIDER_COPY.pause[l] : SLIDER_COPY.play[l]} aria-pressed={!(playing && !reduced)}>
              {playing && !reduced ? <Pause size={18} /> : <Play size={18} />}
            </button>
            <button type="button" className="ps-ctl" onClick={() => go(active + 1, 1)} aria-label={SLIDER_COPY.next[l]}><NextIcon size={20} /></button>
          </div>
        </div>
      </div>

      {zoomed && zoom && (
        <ShotLightbox shots={[zoomed.screen, zoomed.detail]} index={zoom.index} onIndexChange={index => setZoom({ slide: zoom.slide, index })} onClose={() => setZoom(null)} />
      )}
    </section>
  );
}
