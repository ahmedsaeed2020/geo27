import { useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { ArrowLeft, ArrowRight, Search } from 'lucide-react';
import ShotFrame from '@/components/product/ShotFrame';
import ShotLightbox from '@/components/product/ShotLightbox';
import { Button } from '@/components/ui/button';
import type { Shot } from '@/content/product-shots';
import type { ShotFocus } from '@/content/hr/hr-modules';
import type { Locale } from '@/lib/i18n';
import { HR_COPY as C } from './hr-copy';

export type ResolvedScreen = { shot: Shot; focus?: ShotFocus };

export function useScreenLightbox(shots: Shot[]) {
  const [index, setIndex] = useState<number | null>(null);
  return { open: (i: number) => setIndex(i), node: <ShotLightbox shots={shots} index={index} onIndexChange={setIndex} onClose={() => setIndex(null)} /> };
}

/** Magnified region of the inline image, beside the frame; decorative (the full screen is one click away). */
function Lens({ screen, locale }: { screen: ResolvedScreen; locale: Locale }) {
  const f = screen.focus;
  if (!f) return null;
  return (
    <figure className="hr-lens">
      <span
        className="hr-lens-view"
        aria-hidden="true"
        style={{ backgroundImage: `url("${screen.shot.src}")`, backgroundSize: `${f.zoom * 100}% auto`, backgroundPosition: `${f.x}% ${f.y}%` } as CSSProperties}
      />
      <figcaption>
        <Search aria-hidden="true" />
        {C.magnified[locale]}
      </figcaption>
    </figure>
  );
}

/**
 * Real DIGIT HR screens for one section: a single frame (with an optional magnified detail) or, for several,
 * keyboard-navigable tabs. Every frame opens the full-resolution screen in the shared lightbox.
 */
export default function HrScreens({ screens, locale, id }: { screens: ResolvedScreen[]; locale: Locale; id: string }) {
  const shots = screens.map(s => s.shot);
  const box = useScreenLightbox(shots);
  const [active, setActive] = useState(0);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const current = screens[active] ?? screens[0];
  if (!current) return null;
  if (screens.length === 1) {
    return (
      <div className="hr-screens" data-lens={current.focus ? '' : undefined}>
        <ShotFrame shot={current.shot} size="lead" onOpen={() => box.open(0)} />
        <Lens screen={current} locale={locale} />
        {box.node}
      </div>
    );
  }
  const go = (i: number) => {
    const next = (i + screens.length) % screens.length;
    setActive(next);
    tabs.current[next]?.focus();
  };
  const onKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const forward = e.key === (locale === 'ar' ? 'ArrowLeft' : 'ArrowRight');
    go(active + (forward ? 1 : -1));
  };
  return (
    <div className="hr-screens" data-tabs="">
      <div role="tablist" aria-label={C.screenTabs[locale]} className="hr-tabs">
        {screens.map((s, i) => (
          <button
            key={s.shot.id}
            ref={el => {
              tabs.current[i] = el;
            }}
            type="button"
            role="tab"
            id={`${id}-tab-${i}`}
            aria-selected={i === active}
            aria-controls={`${id}-panel`}
            tabIndex={i === active ? 0 : -1}
            className="hr-tab"
            onClick={() => setActive(i)}
            onKeyDown={onKey}
          >
            <span className="hr-tab-no" aria-hidden="true">
              {String(i + 1).padStart(2, '0')}
            </span>
            {s.shot.caption[locale]}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-tab-${active}`} className="hr-tab-panel">
        <ShotFrame key={current.shot.id} shot={current.shot} size="lead" caption={false} onOpen={() => box.open(active)} />
        <div className="hr-tab-nav">
          <Button variant="outline" size="icon" aria-label={C.previous[locale]} onClick={() => go(active - 1)}>
            {locale === 'ar' ? <ArrowRight /> : <ArrowLeft />}
          </Button>
          <span dir="ltr">
            {active + 1} / {screens.length}
          </span>
          <Button variant="outline" size="icon" aria-label={C.next[locale]} onClick={() => go(active + 1)}>
            {locale === 'ar' ? <ArrowLeft /> : <ArrowRight />}
          </Button>
        </div>
      </div>
      {box.node}
    </div>
  );
}
