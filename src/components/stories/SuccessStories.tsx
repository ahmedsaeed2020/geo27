import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Pause, Play } from 'lucide-react';
import { useLocale } from '@/lib/i18n';
import { SectionHeading } from '@/components/cms/SectionText';
import { CUSTOMER_COUNT, CUSTOMER_LOGOS, SUCCESS_STORIES_COPY as C, type CustomerLogo } from '@/content/success-stories';
import '@/success-stories.css';

/** Seconds each logo takes to travel one tile width: slow enough to read every mark as it passes. */
const SECONDS_PER_LOGO = 4;
const COUNT_MS = 1400;

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function Tile({ logo, alt, loaded }: { logo: CustomerLogo; alt: string; loaded: boolean }) {
  return (
    <li>
      <div className="ss-tile">
        {loaded ? (
          <img src={logo.src} alt={alt} width={logo.width} height={logo.height} loading="eager" decoding="async" draggable={false} />
        ) : (
          alt && <span className="sr-only">{alt}</span>
        )}
      </div>
    </li>
  );
}

/**
 * «قصص النجاح»: an endless, slow ticker of customer logos (right → left in Arabic, left → right in English) with a
 * counted customer figure. It shares the page background and sits directly above the demo form.
 */
export default function SuccessStories() {
  const locale = useLocale();
  const rootRef = useRef<HTMLElement>(null);
  const headRef = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  const [paused, setPaused] = useState(false);
  const [count, setCount] = useState(CUSTOMER_COUNT);

  // Load the logos only when the strip approaches, so pages that never reach it don't download them.
  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') { setNear(true); return; }
    const io = new IntersectionObserver(entries => {
      if (entries.some(e => e.isIntersecting)) { setNear(true); io.disconnect(); }
    }, { rootMargin: '900px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Count the customer figure up once it comes into view (the server renders the final number).
  useEffect(() => {
    const el = headRef.current;
    if (!el || reducedMotion() || typeof IntersectionObserver === 'undefined') return;
    if (el.getBoundingClientRect().top < window.innerHeight) return;
    setCount(0);
    let frame = 0;
    const io = new IntersectionObserver(entries => {
      if (!entries.some(e => e.isIntersecting)) return;
      io.disconnect();
      const start = performance.now();
      const tick = (now: number) => {
        const p = Math.min(1, (now - start) / COUNT_MS);
        setCount(Math.round(CUSTOMER_COUNT * (1 - Math.pow(1 - p, 3))));
        if (p < 1) frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    }, { threshold: 0.6 });
    io.observe(el);
    return () => { io.disconnect(); cancelAnimationFrame(frame); };
  }, []);

  // English reverses the set so logo 1, 2, 3… enter first from the left, exactly as Arabic enters from the right.
  const logos = locale === 'en' ? [...CUSTOMER_LOGOS].reverse() : CUSTOMER_LOGOS;
  const [before, after] = C.lead[locale];
  const style = { '--ss-duration': `${CUSTOMER_LOGOS.length * SECONDS_PER_LOGO}s` } as CSSProperties;

  return (
    <section
      ref={rootRef}
      className="ss-root"
      aria-labelledby="success-stories-title"
      data-success-stories=""
      {...(paused ? { 'data-paused': '' } : {})}
    >
      <div ref={headRef} className="mx-auto flex max-w-5xl flex-wrap items-end justify-between gap-4 px-4">
        <div className="max-w-3xl">
          <p className="text-sm font-semibold text-primary">DIGIT · {C.kicker[locale]}</p>
          <SectionHeading k="stories" id="success-stories-title" className="text-3xl font-bold text-foreground">
            {C.heading[locale]}
          </SectionHeading>
          <p className="mt-3 text-base leading-relaxed text-muted-foreground">
            <span aria-hidden="true">
              {before}<span className="ss-count">{count}</span>{after}
            </span>
            <span className="sr-only">{before}{CUSTOMER_COUNT}{after}</span>
          </p>
        </div>
        <button
          type="button"
          className="ss-toggle"
          aria-pressed={paused}
          aria-label={paused ? C.play[locale] : C.pause[locale]}
          title={paused ? C.play[locale] : C.pause[locale]}
          onClick={() => setPaused(p => !p)}
        >
          {paused ? <Play aria-hidden="true" /> : <Pause aria-hidden="true" />}
        </button>
      </div>

      <div className="ss-viewport">
        <div className="ss-track" data-flow={locale === 'en' ? 'ltr' : 'rtl'} style={style}>
          <ul role="list" className="ss-set" aria-label={C.listLabel[locale]}>
            {logos.map(logo => <Tile key={logo.file} logo={logo} alt={logo.name[locale]} loaded={near} />)}
          </ul>
          {/* The second copy closes the loop: after the last logo, logo 1 follows without a jump. */}
          <ul role="list" className="ss-set" aria-hidden="true">
            {logos.map(logo => <Tile key={logo.file} logo={logo} alt="" loaded={near} />)}
          </ul>
        </div>
      </div>
    </section>
  );
}
