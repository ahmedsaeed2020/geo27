import { useSiteConfig } from '@/components/cms/CmsContext';
import { useCallback, useRef, useState, type CSSProperties, type MouseEvent } from 'react';
import { Link } from '@tanstack/react-router';
import { ArrowDown, ArrowLeft, ArrowRight, Globe2, Menu, MessageCircle, X } from 'lucide-react';
import { useLocale } from '@/lib/i18n';
import { usePageMotion } from '@/hooks/use-page-motion';
import { useSlideshow } from '@/hooks/use-slideshow';
import { GEO_COPY, GEO_PHONE_DISPLAY, GEO_SITE, type GeoChallenge, type GeoGroup, type GeoScenario } from '@/content/geointime';
import { geoWhatsAppUrl } from '@/lib/geointime-lead';
import { HERO_CIRCLES, MEDIA } from './geo-media';
import GeoScenarios from './GeoScenarios';
import GeoRequest from './GeoRequest';
import GeoExperience from './GeoExperience';
import '@/geointime.css';

const GROUP_CHALLENGE: Record<GeoGroup, GeoChallenge> = { operations: 'sites', hr: 'presence', tasks: 'tasks' };

/**
 * GeoInTime landing on / and /en: the owner's landing design (circle hero, rounded situation band, dark request orbit,
 * laptop of real screens, working-day rail, closing circle) carrying the owner's V5 content. Lead handling reuses the
 * shared server-side lead boundary; DIGIT pages and admin stay behind it, unlinked.
 */
export default function GeoLanding() {
  const locale = useLocale();
  const base = GEO_COPY[locale];
  const o = useSiteConfig().landing?.[locale] ?? {};
  const pick = (k: keyof typeof o) => (o[k] ? o[k] : undefined);
  const t = { ...base, headerCta: pick('headerCta') ?? base.headerCta, hero: { ...base.hero, overline: pick('overline') ?? base.hero.overline, title: pick('title') ?? base.hero.title, titleB: pick('titleB') ?? base.hero.titleB, titleEm: pick('titleEm') ?? base.hero.titleEm, titleC: pick('titleC') ?? base.hero.titleC, lead: pick('lead') ?? base.hero.lead, description: pick('description') ?? base.hero.description, primary: pick('primary') ?? base.hero.primary, secondary: pick('secondary') ?? base.hero.secondary } };
  const main = useRef<HTMLElement>(null);
  const [menu, setMenu] = useState(false);
  const [challenge, setChallenge] = useState<GeoChallenge | ''>('');
  const [proof, setProof] = useState<{ group: GeoGroup; view: string }>({ group: 'operations', view: 'main' });
  const show = useSlideshow({ count: t.scenarios.items.length, locale, threshold: 0.3 });
  const Arrow = locale === 'ar' ? ArrowLeft : ArrowRight;
  usePageMotion(main, `geo-${locale}`);

  const jump = useCallback((id: string, focusForm = false) => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    document.getElementById(id)?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
    if (focusForm) window.setTimeout(() => document.querySelector<HTMLInputElement>('#geo-form input[name="name"]')?.focus({ preventScroll: true }), reduced ? 0 : 650);
  }, []);
  const onAnchor = (id: string) => (event: MouseEvent<HTMLAnchorElement>) => { event.preventDefault(); setMenu(false); jump(id, id === 'request'); };
  const requestFor = (value: GeoChallenge) => { setChallenge(value); jump('request', true); };
  const showScreen = (scenario: GeoScenario) => { setProof({ group: scenario.proof[0], view: scenario.proof[1] }); jump('experience'); };
  const pickNode = (value: GeoChallenge) => { setChallenge(value); window.setTimeout(() => document.querySelector<HTMLInputElement>('#geo-form input[name="name"]')?.focus({ preventScroll: false }), 0); };

  return (
    <div className="geo-page" dir={locale === 'ar' ? 'rtl' : 'ltr'} data-form-cta-ignore>
      <a className="geo-skip" href="#geo-main" onClick={onAnchor('geo-main')}>{t.skip}</a>
      <header className="geo-header">
        <div className="geo-wrap geo-header-inner">
          <Link to={locale === 'ar' ? '/' : '/en'} className="geo-logo" aria-label={t.home}><img src={MEDIA.logo.src} width={MEDIA.logo.width} height={MEDIA.logo.height} alt="GeoInTime" /></Link>
          <nav id="geo-nav" className="geo-nav" data-open={menu} aria-label={t.navLabel}>
            {t.nav.map(([id, label]) => <a key={id} href={`#${id}`} onClick={onAnchor(id)}>{label}</a>)}
            <Link to={locale === 'ar' ? '/en' : '/'} className="geo-lang geo-lang-menu"><Globe2 aria-hidden="true" />{t.language}</Link>
          </nav>
          <div className="geo-header-actions">
            <Link to={locale === 'ar' ? '/en' : '/'} className="geo-lang"><Globe2 aria-hidden="true" />{t.language}</Link>
            <a className="geo-btn geo-btn-primary geo-btn-sm" href="#request" onClick={onAnchor('request')}>{t.headerCta}<Arrow aria-hidden="true" /></a>
            <button type="button" className="geo-menu-toggle" aria-controls="geo-nav" aria-expanded={menu} aria-label={menu ? t.menuClose : t.menuOpen} onClick={() => setMenu(m => !m)}>{menu ? <X /> : <Menu />}</button>
          </div>
        </div>
      </header>

      <main id="geo-main" ref={main} tabIndex={-1}>
        <section className="geo-hero hero" aria-labelledby="geo-hero-title">
          <div className="geo-wrap">
            <div className="geo-hero-copy">
              <p className="geo-overline"><span className="geo-dot" />{t.hero.overline}</p>
              <h1 id="geo-hero-title"><span className="geo-hero-a">{t.hero.title}</span> <span className="geo-hero-b">{t.hero.titleB}<em>{t.hero.titleEm}</em>{t.hero.titleC}</span></h1>
              <p className="geo-hero-lead">{t.hero.lead}</p>
              <p className="geo-hero-text">{t.hero.description}</p>
              <div className="geo-hero-actions">
                <a className="geo-btn geo-btn-primary" href="#experience" onClick={onAnchor('experience')}>{t.hero.primary}<Arrow aria-hidden="true" /></a>
                <a className="geo-btn geo-btn-link" href="#request" onClick={onAnchor('request')}>{t.hero.secondary}<Arrow aria-hidden="true" /></a>
              </div>
            </div>
            <div className="geo-circles">
              {HERO_CIRCLES.map((photo, i) => {
                const circle = t.hero.circles[i]!;
                return (
                  <button key={circle.label} type="button" className="geo-circle" style={{ '--i': i } as CSSProperties} onClick={() => { show.go(i); jump('scenarios'); }} aria-label={`${circle.label} — ${t.hero.circleAction}`}>
                    <span className="geo-circle-frame">
                      <img src={photo.src} width={photo.width} height={photo.height} alt={circle.alt} fetchPriority={i === 0 ? 'high' : undefined} decoding="async" />
                      <svg className="geo-circle-ring" viewBox="0 0 100 100" aria-hidden="true"><circle className="geo-ring-track" cx="50" cy="50" r="48" /><circle className="geo-ring-arc" cx="50" cy="50" r="48" /></svg>
                      <span className="geo-circle-pin" aria-hidden="true" />
                    </span>
                    <span className="geo-circle-label">«{circle.label}»</span>
                  </button>
                );
              })}
            </div>
            <ol className="geo-hero-path" aria-label={t.hero.pathLabel}>
              {t.hero.path.map((step, i) => <li key={step} style={{ '--i': i } as CSSProperties}>{i === t.hero.path.length - 1 ? <strong>{step}</strong> : step}</li>)}
            </ol>
            <a className="geo-scroll" href="#scenarios" onClick={onAnchor('scenarios')}>{t.hero.scroll}<ArrowDown aria-hidden="true" /></a>
          </div>
        </section>

        <GeoScenarios locale={locale} show={show} onScreen={showScreen} onRequest={s => requestFor(s.challenge)} />
        <GeoRequest locale={locale} challenge={challenge} onChallenge={setChallenge} onPick={pickNode} />
        <GeoExperience locale={locale} group={proof.group} view={proof.view} onSelect={(group, view = 'main') => setProof({ group, view })} onRequest={group => requestFor(GROUP_CHALLENGE[group])} />

        <section id="journey" className="geo-journey" aria-labelledby="geo-journey-title">
          <div className="geo-wrap geo-journey-grid">
            <div className="geo-journey-copy">
              <p className="geo-overline"><span className="geo-dot" />{t.journey.overline}</p>
              <h2 id="geo-journey-title">{t.journey.title}<span>{t.journey.titleAccent}</span></h2>
              <p>{t.journey.intro}</p>
              <a className="geo-btn geo-btn-link" href="#request" onClick={onAnchor('request')}>{t.journey.link}<Arrow aria-hidden="true" /></a>
            </div>
            <ol className="geo-journey-track">
              {t.journey.steps.map(([title, text], i) => <li key={title} data-motion-card><span className="geo-journey-n">0{i + 1}</span><div><h3>{title}</h3><p>{text}</p></div></li>)}
            </ol>
          </div>
        </section>

        <section className="geo-closing" aria-labelledby="geo-closing-title">
          <div className="geo-wrap geo-closing-grid">
            <div className="geo-closing-copy">
              <p className="geo-kicker">{t.closing.kicker}</p>
              <h2 id="geo-closing-title">{t.closing.title}<em>{t.closing.titleEm}</em></h2>
              <p>{t.closing.text}</p>
              <a className="geo-btn geo-btn-primary" href="#request" onClick={onAnchor('request')}>{t.closing.cta}<Arrow aria-hidden="true" /></a>
            </div>
            <figure className="geo-closing-photo">
              <img src={MEDIA.decision.src} width={MEDIA.decision.width} height={MEDIA.decision.height} alt={t.closing.photoAlt} loading="lazy" decoding="async" />
              <svg viewBox="0 0 100 100" aria-hidden="true"><circle className="geo-ring-arc" cx="50" cy="50" r="48" /></svg>
            </figure>
          </div>
          <footer className="geo-footer">
            <div className="geo-wrap geo-footer-inner">
              <a href="#geo-main" className="geo-footer-logo" onClick={onAnchor('geo-main')} aria-label={t.home}><img src={MEDIA.logoOnDark.src} width={MEDIA.logoOnDark.width} height={MEDIA.logoOnDark.height} alt="GeoInTime" loading="lazy" /></a>
              <nav className="geo-footer-links" aria-label={t.footer.linksLabel}>
                <a href={GEO_SITE} target="_blank" rel="noopener noreferrer">{t.footer.site}</a>
                <a href={geoWhatsAppUrl()} target="_blank" rel="noopener noreferrer"><MessageCircle aria-hidden="true" />{t.footer.whatsapp} <span dir="ltr">{GEO_PHONE_DISPLAY}</span></a>
                <a href="#experience" onClick={onAnchor('experience')}>{t.footer.platform}</a>
                <Link to={locale === 'ar' ? '/en' : '/'}><Globe2 aria-hidden="true" />{t.language}</Link>
              </nav>
              <p className="geo-rights">{t.footer.rights}</p>
            </div>
          </footer>
        </section>
      </main>
    </div>
  );
}
