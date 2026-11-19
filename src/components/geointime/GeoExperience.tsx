import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { ArrowLeft, ArrowRight, Check, Info, Maximize2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { GEO_COPY, type GeoGroup, type GeoLocale } from '@/content/geointime';
import { GROUP_PHOTOS, SCREENS } from './geo-media';

const GROUPS: GeoGroup[] = ['operations', 'hr', 'tasks'];

/**
 * «شاهد الشغل من داخل النظام»: the design's laptop flanked by copy and circular area tabs, showing only authentic
 * GeoInTime captures. A lens magnifies the same pixels, the screen opens full size, and the working-day rail closes it.
 */
export default function GeoExperience({ locale, group, view, onSelect, onRequest }: {
  locale: GeoLocale; group: GeoGroup; view: string;
  onSelect: (group: GeoGroup, view?: string) => void;
  onRequest: (group: GeoGroup) => void;
}) {
  const t = GEO_COPY[locale].experience;
  const g = t.groups[group];
  const current = g.views.find(v => v.key === view) ?? g.views[0]!;
  const src = SCREENS[current.screen];
  const [open, setOpen] = useState(false);
  const Arrow = locale === 'ar' ? ArrowLeft : ArrowRight;
  const rail = useRef<HTMLOListElement>(null);

  useEffect(() => {
    const node = rail.current;
    if (!node) return;
    const observer = new IntersectionObserver(([entry]) => { if (entry?.isIntersecting) { node.dataset['play'] = 'true'; observer.disconnect(); } }, { threshold: 0.4 });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const onTabsKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = GROUPS.indexOf(group);
    const forward = locale === 'ar' ? 'ArrowLeft' : 'ArrowRight';
    const back = locale === 'ar' ? 'ArrowRight' : 'ArrowLeft';
    let next: number | null = null;
    if (event.key === forward || event.key === 'ArrowDown') next = (index + 1) % GROUPS.length;
    else if (event.key === back || event.key === 'ArrowUp') next = (index + GROUPS.length - 1) % GROUPS.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = GROUPS.length - 1;
    if (next === null) return;
    event.preventDefault();
    onSelect(GROUPS[next]!);
    event.currentTarget.querySelector<HTMLElement>(`[data-group="${GROUPS[next]}"]`)?.focus();
  };

  return (
    <section id="experience" className="geo-experience" aria-labelledby="geo-exp-title">
      <div className="geo-wrap">
        <div className="geo-head geo-head-center">
          <p className="geo-overline"><span className="geo-dot" />{t.overline}</p>
          <h2 id="geo-exp-title">{t.title}<em>{t.titleAccent}</em><span>{t.titleB}</span></h2>
          <p>{t.intro}</p>
        </div>

        <div className="geo-studio">
          <div className="geo-studio-copy" aria-live="polite">
            <p className="geo-counter">{g.counter}</p>
            <h3>{g.title}</h3>
            <p>{g.text}</p>
            <ul className="geo-bullets">{g.bullets.map(b => <li key={b}><Check aria-hidden="true" />{b}</li>)}</ul>
            <button type="button" className="geo-btn geo-btn-link geo-inline" onClick={() => onRequest(group)}>{t.request}<Arrow aria-hidden="true" /></button>
          </div>

          <div className="geo-device">
            <div className="geo-laptop">
              <div className="geo-laptop-screen">
                <div className="geo-screen-bar"><span className="geo-dots" aria-hidden="true"><i /><i /><i /></span><span className="geo-en">{t.screenBar}</span><span className="geo-real"><span className="geo-live" />{t.real}</span></div>
                <button type="button" className="geo-screen-btn" onClick={() => setOpen(true)} aria-label={`${t.zoom}: ${current.label}`}>
                  <img key={current.screen} src={src} width={current.width} height={current.height} alt={`${t.screenAlt}${current.label}`} loading="lazy" decoding="async" />
                </button>
              </div>
              <div className="geo-laptop-base" aria-hidden="true" />
            </div>
            <span className="geo-lens" aria-hidden="true" style={{ backgroundImage: `url(${src})` } as CSSProperties} />
            <div className="geo-device-foot">
              <div className="geo-subtabs" role="group" aria-label={t.subtabsLabel}>
                {g.views.map(v => <button key={v.key} type="button" className="geo-subtab" aria-pressed={v.key === current.key} onClick={() => onSelect(group, v.key)}>{v.label}</button>)}
              </div>
              <button type="button" className="geo-btn geo-btn-quiet geo-zoom" onClick={() => setOpen(true)}><Maximize2 aria-hidden="true" />{t.zoom}</button>
            </div>
          </div>

          <div className="geo-area-tabs" role="tablist" aria-label={t.tabsLabel} onKeyDown={onTabsKey}>
            {GROUPS.map((key, i) => {
              const photo = GROUP_PHOTOS[key];
              const selected = key === group;
              return (
                <button key={key} type="button" role="tab" data-group={key} aria-selected={selected} tabIndex={selected ? 0 : -1} className="geo-area-tab" onClick={() => onSelect(key)}>
                  <span className="geo-area-photo"><img src={photo.src} width={photo.width} height={photo.height} alt="" loading="lazy" decoding="async" style={{ objectPosition: photo.position }} /><svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="47" /></svg></span>
                  <span className="geo-area-label"><span className="geo-en">0{i + 1}</span>{t.groups[key].tab}</span>
                </button>
              );
            })}
          </div>
        </div>

        <p className="geo-source"><Info aria-hidden="true" />{t.source}</p>

        <ol ref={rail} className="geo-rail" aria-label={t.railLabel}>
          {t.rail.map((step, i) => <li key={step} style={{ '--i': i } as CSSProperties}><span className="geo-rail-node" aria-hidden="true" /><span>{step}</span></li>)}
        </ol>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="geo-dialog">
          <DialogTitle>{current.label}</DialogTitle>
          <DialogDescription>{t.dialogNote}</DialogDescription>
          <img src={src} width={current.width} height={current.height} alt={`${t.screenAlt}${current.label}`} />
        </DialogContent>
      </Dialog>
    </section>
  );
}
