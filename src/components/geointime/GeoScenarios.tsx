import type { CSSProperties } from 'react';
import { ArrowLeft, ArrowRight, ChevronLeft, ChevronRight, Monitor, Pause, Play } from 'lucide-react';
import type { useSlideshow } from '@/hooks/use-slideshow';
import { GEO_COPY, type GeoLocale, type GeoScenario } from '@/content/geointime';
import { BAND_PHOTOS } from './geo-media';

const SLIDE_MS = 7500;
const pad = (n: number) => String(n).padStart(2, '0');

/**
 * The design's rounded photo band carrying the V5 «situations». Autoplay, pauses, keys and swipes come from the shared
 * slideshow hook; tabs below double as the scenario picker. Each slide links to its real screen and to the request form.
 */
export default function GeoScenarios({ locale, show, onScreen, onRequest }: {
  locale: GeoLocale;
  show: ReturnType<typeof useSlideshow>;
  onScreen: (scenario: GeoScenario) => void;
  onRequest: (scenario: GeoScenario) => void;
}) {
  const t = GEO_COPY[locale].scenarios;
  const items = t.items;
  const { active, cycle, go, playing, setPlaying, reduced, running } = show;
  const Arrow = locale === 'ar' ? ArrowLeft : ArrowRight;
  const FlowArrow = locale === 'ar' ? ArrowLeft : ArrowRight;
  const Prev = locale === 'ar' ? ChevronRight : ChevronLeft;
  const Next = locale === 'ar' ? ChevronLeft : ChevronRight;
  return (
    <section id="scenarios" ref={show.sectionRef} className="geo-scenarios" aria-labelledby="geo-scenes-title" {...show.sectionHandlers}>
      <div className="geo-wrap">
        <div className="geo-head geo-head-split">
          <div><p className="geo-overline"><span className="geo-dot" />{t.overline}</p><h2 id="geo-scenes-title">{t.title}<span>{t.titleAccent}</span></h2></div>
          <p>{t.intro}</p>
        </div>
        <div className="geo-band-shell">
          <div className="geo-band" {...show.swipeHandlers}>
            {items.map((s, i) => {
              const photo = BAND_PHOTOS[s.photo];
              const shown = i === active;
              return (
                <div key={s.caption} id={`geo-scene-${i}`} role="tabpanel" aria-labelledby={`geo-scene-tab-${i}`} className="geo-slide" data-active={shown} aria-hidden={!shown} inert={!shown}>
                  <img className="geo-slide-img" data-mirror={s.mirror ? 'true' : undefined} src={photo.src} width={photo.width} height={photo.height} alt={s.alt} loading="lazy" decoding="async" />
                  <div className="geo-slide-copy">
                    <p className="geo-slide-caption"><span className="geo-live" />{s.caption}</p>
                    <h3 className="geo-slide-quote">{s.quote[0]}<span>{s.quote[1]}</span></h3>
                    <p className="geo-slide-summary">{s.summary}</p>
                    <ol className="geo-flow" aria-label={s.feature}>
                      {s.flow.map((step, k) => <li key={step} style={{ '--k': k } as CSSProperties}>{k > 0 && <FlowArrow aria-hidden="true" />}<span>{step}</span></li>)}
                    </ol>
                    <p className="geo-slide-feature"><span>{t.relevance}</span><strong>{s.feature}</strong></p>
                    <div className="geo-slide-actions">
                      <button type="button" className="geo-btn geo-btn-primary" onClick={() => onRequest(s)}>{t.request}<Arrow aria-hidden="true" /></button>
                      <button type="button" className="geo-btn geo-btn-link" onClick={() => onScreen(s)}><Monitor aria-hidden="true" />{t.toScreen}</button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <svg className="geo-band-arc" viewBox="0 0 200 200" aria-hidden="true"><circle cx="100" cy="100" r="96" /></svg>
        </div>
        <div className="geo-picker-row">
          <div ref={show.tabsRef} className="geo-picker" role="tablist" aria-label={t.pickerLabel} onKeyDown={show.onTabsKey}>
            {items.map((s, i) => {
              const selected = i === active;
              return (
                <button key={s.caption} id={`geo-scene-tab-${i}`} type="button" role="tab" data-index={i} aria-selected={selected} aria-controls={`geo-scene-${i}`} tabIndex={selected ? 0 : -1} className="geo-pick" onClick={() => go(i)}>
                  <span className="geo-pick-no">{pad(i + 1)}</span>
                  <span className="geo-pick-text">{s.tab[0]}<span>{s.tab[1]}</span></span>
                  <span className="geo-pick-track" aria-hidden="true">
                    {selected && <span key={`${active}-${cycle}`} className="geo-pick-bar" data-static={reduced ? 'true' : 'false'} style={{ animationDuration: `${SLIDE_MS}ms`, animationPlayState: running ? 'running' : 'paused' }} onAnimationEnd={e => { if (e.animationName === 'geo-progress') go(active + 1, 1); }} />}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="geo-picker-controls">
            <span className="geo-count"><strong>{pad(active + 1)}</strong> {t.of} {pad(items.length)}</span>
            <button type="button" className="geo-ctl" onClick={() => go(active - 1, -1)} aria-label={t.prev}><Prev /></button>
            <button type="button" className="geo-ctl" onClick={() => setPlaying(p => !p)} aria-label={playing && !reduced ? t.pause : t.play} aria-pressed={!(playing && !reduced)}>{playing && !reduced ? <Pause /> : <Play />}</button>
            <button type="button" className="geo-ctl" onClick={() => go(active + 1, 1)} aria-label={t.next}><Next /></button>
          </div>
        </div>
      </div>
    </section>
  );
}
