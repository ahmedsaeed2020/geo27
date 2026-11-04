import { useRef } from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import LeadCapturePanel from '@/components/LeadCapturePanel';
import CmsBlocks from '@/components/cms/CmsBlocks';
import { useCmsPage } from '@/components/cms/CmsContext';
import { Button } from '@/components/ui/button';
import { NavLink } from '@/components/nav/nav-links';
import type { ProPageConfig } from '@/content/pro/pro-pages';
import type { ProPageContent } from '@/content/pro/types';
import { usePageMotion } from '@/hooks/use-page-motion';
import { useLocale } from '@/lib/i18n';
import { PRO_COPY as C } from './pro-copy';
import ProPageBody from './ProPageBody';
import { ProScreen, useSectionLightbox } from './ProScreens';
import { useAskDemo } from './use-ask-demo';

/** Hero of a cross-department DIGIT Pro page: trail, H1, lede, demo action and the page's real screen. */
function AreaHero({ config }: { config: ProPageConfig }) {
  const locale = useLocale();
  const cms = useCmsPage();
  const ask = useAskDemo();
  const box = useSectionLightbox(config.heroShots);
  const Arrow = locale === 'ar' ? ArrowLeft : ArrowRight;
  const headline = cms?.[locale].headline.trim() || config.headline[locale];
  const lede = cms?.[locale].lede.trim() || config.seoDescription[locale];
  const label = cms?.[locale].navLabel.trim() || config.label[locale];
  return (
    <section className="pv-hero" data-signature={config.signature} aria-labelledby="pv-hero-title">
      <div className="dp-wrap">
        <nav aria-label={locale === 'ar' ? 'مسار الصفحة' : 'Breadcrumb'} className="pv-crumbs">
          <ol>
            <li>
              <NavLink path="/">{C.home[locale]}</NavLink>
            </li>
            <li>
              <NavLink path="/pro">DIGIT Pro</NavLink>
            </li>
            <li aria-current="page">{label}</li>
          </ol>
        </nav>
        <div className="pv-hero-grid">
          <div className="pv-hero-copy">
            <p className="pv-eyebrow">DIGIT Pro · {C.crossDept[locale]}</p>
            <h1 id="pv-hero-title">{headline}</h1>
            <p className="pv-hero-lede">{lede}</p>
            <div className="pv-hero-actions">
              <Button size="lg" onClick={() => ask({ department: '', topic: config.key, interest: label })}>
                {C.bookDemo[locale]}
              </Button>
              <Button asChild size="lg" variant="outline">
                <NavLink path="/pro">
                  DIGIT Pro
                  <Arrow aria-hidden="true" />
                </NavLink>
              </Button>
            </div>
            <ol className="pv-hero-toc" aria-label={C.onThisPage[locale]}>
              {config.sections.map((s, i) => (
                <li key={s.id}>
                  <a href={`#pv-${s.id}`}>
                    <span dir="ltr">{String(i + 1).padStart(2, '0')}</span>
                    {s.title[locale]}
                  </a>
                </li>
              ))}
            </ol>
          </div>
          <div className="pv-hero-screen">
            <ProScreen refId={config.heroShots[0]} open={box.open} caption={false} />
            <p className="pv-note">{C.heroNote[locale]}</p>
          </div>
        </div>
      </div>
      {box.node}
    </section>
  );
}

/** A new cross-department DIGIT Pro page (/pro/<area>): hero, Pro pages switcher, source sections, CMS blocks, form. */
export default function ProAreaPage({ config, content }: { config: ProPageConfig; content: ProPageContent }) {
  const locale = useLocale();
  const cms = useCmsPage();
  const main = useRef<HTMLElement>(null);
  usePageMotion(main, `pro-${config.key}-${locale}`);
  return (
    <div className="bg-paper font-plex">
      <Header />
      <main ref={main} className="pv-area pv-root" aria-labelledby="pv-hero-title">
        <AreaHero config={config} />
        <ProPageBody config={config} content={content} />
        <CmsBlocks />
        {cms?.formEnabled !== false && <LeadCapturePanel interest={cms?.[locale].navLabel.trim() || config.label[locale]} product="pro" />}
      </main>
      <Footer />
    </div>
  );
}
