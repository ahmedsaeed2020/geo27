import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import { useLocale } from '@/lib/i18n';
import { useSectionOverride } from '@/components/cms/SectionText';
import { CUSTOMER_COUNT, CUSTOMER_LOGOS, SUCCESS_STORIES_COPY as C, type CustomerLogo } from '@/content/success-stories';
import '@/success-stories.css';

/** Seconds each logo takes to travel one tile width: slow enough to read every mark as it passes. */
const SECONDS_PER_LOGO = 3.5;
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
 * counted customer figure, placed above every request form. `section` is the full block above the demo panel (boxed to
 * the form's width); `inline` is the compact version that sits on top of a form inside its own column.
 */
export default function SuccessStories({ variant = 'section' }: { variant?: 'section' | 'inline' }) {
  const locale = useLocale();
  const titleId = useId();
  const rootRef = useRef<HTMLElement>(null);
  const headRef = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  const [count, setCount] = useState(CUSTOMER_COUNT);
  const heading = useSectionOverride('stories.heading') ?? C.heading[locale];

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
  const Title = variant === 'section' ? 'h2' : 'h3';

  const body = (
    <>
      <div ref={headRef}>
        <p className="ss-kicker">DIGIT · {C.kicker[locale]}</p>
        <Title id={titleId} className="ss-title">{heading}</Title>
        <p className="ss-lead">
          <span aria-hidden="true">
            {before}<span className="ss-count">{count}</span>{after}
          </span>
          <span className="sr-only">{before}{CUSTOMER_COUNT}{after}</span>
        </p>
      </div>

      {/* Focusable so keyboard users can hold the strip still, as the pointer does on hover. */}
      <div className="ss-viewport" tabIndex={0} role="region" aria-label={C.listLabel[locale]} title={C.hoverHint[locale]}>
        <div className="ss-track" data-flow={locale === 'en' ? 'ltr' : 'rtl'} style={style}>
          <ul role="list" className="ss-set">
            {logos.map(logo => <Tile key={logo.file} logo={logo} alt={logo.name[locale]} loaded={near} />)}
          </ul>
          {/* The second copy closes the loop: after the last logo, logo 1 follows without a jump. */}
          <ul role="list" className="ss-set" aria-hidden="true">
            {logos.map(logo => <Tile key={logo.file} logo={logo} alt="" loaded={near} />)}
          </ul>
        </div>
      </div>
    </>
  );

  if (variant === 'inline') {
    return (
      <div ref={rootRef as React.RefObject<HTMLDivElement>} className="ss-root" data-variant="inline" data-success-stories="" role="group" aria-labelledby={titleId}>
        {body}
      </div>
    );
  }
  return (
    <section ref={rootRef} className="ss-root" data-variant="section" data-success-stories="" aria-labelledby={titleId}>
      <div className="mx-auto max-w-5xl px-4">{body}</div>
    </section>
  );
}
