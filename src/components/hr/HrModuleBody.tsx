import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { NavLink } from '@/components/nav/nav-links';
import { focusLeadForm } from '@/components/LeadCapturePanel';
import { Button } from '@/components/ui/button';
import { useCatalog } from '@/components/catalog/useCatalog';
import { cachedHrModule, loadHrModule, type HrModuleConfig, type HrModuleContent } from '@/content/hr/hr-modules';
import { productByKey } from '@/content/catalog';
import type { Shot } from '@/content/product-shots';
import { screenById } from '@/content/screens';
import { resolveSourceLocale, type CmsBlock, type CmsContent } from '@/lib/cms-schema';
import type { Locale } from '@/lib/i18n';
import HrCapability, { capVariants } from './HrCapability';
import HrHero from './HrHero';
import type { ResolvedScreen } from './HrScreens';
import { HR_COPY as C } from './hr-copy';
import '@/hr-modules.css';

/** Page copy for a module: loader data on routes (SSR-safe), loaded on demand in the admin preview. */
export function useHrSource(slug: string, initial: HrModuleContent | null): HrModuleContent | null {
  const [loaded, setLoaded] = useState<HrModuleContent | null>(() => (initial?.slug === slug ? initial : (cachedHrModule(slug) ?? null)));
  useEffect(() => {
    if (loaded?.slug === slug) return;
    let live = true;
    void loadHrModule(slug).then(c => {
      if (live && c) setLoaded(c);
    });
    return () => {
      live = false;
    };
  }, [slug, loaded?.slug]);
  if (initial?.slug === slug) return initial;
  return loaded?.slug === slug ? loaded : null;
}

const known = (ids: string[]) => ids.map(screenById).filter((s): s is Shot => !!s);

type Props = {
  content: CmsContent;
  locale: Locale;
  config: HrModuleConfig;
  source: HrModuleContent;
  renderBlock: (block: CmsBlock, index: number) => ReactNode;
};

/**
 * DIGIT HR module page: the shared department shell (breadcrumbs, siblings, lead context) around the module's
 * source sections. The CMS orders, hides and overrides sections; anything left empty shows the source copy.
 */
export default function HrModuleBody({ content, locale, config, source, renderBlock }: Props) {
  const families = useCatalog();
  const family = families.find(f => f.key === 'hr');
  const product = productByKey('hr');
  const local = resolveSourceLocale(content, locale, config);
  const blocks = local.blocks.filter(b => b.enabled);
  const sectionOf = (b: CmsBlock) => (b.type === 'source' ? source.sections.find(s => s.id === b.ref) : undefined);
  const placed = blocks.filter(b => sectionOf(b));
  const screensFor = (b: CmsBlock): ResolvedScreen[] => {
    if (b.shotId) return known([b.shotId]).map(shot => ({ shot }));
    return (config.sectionShots[b.ref] ?? []).flatMap(r => {
      const shot = screenById(r.id);
      return shot ? [{ shot, focus: r.focus }] : [];
    });
  };
  const variants = capVariants(placed.map(b => ({ screens: screensFor(b).length })));
  const heroIds = content.department?.heroShot ? [content.department.heroShot, ...config.heroShots.filter(id => id !== content.department?.heroShot)] : config.heroShots;
  const heroShots = config.illustrative && !content.department?.heroShot ? [] : known(heroIds);
  const crumb = local.navLabel || config.label[locale];
  const demo = () => focusLeadForm({ product: 'hr', department: config.slug });
  const Arrow = locale === 'ar' ? ArrowLeft : ArrowRight;
  const siblings = family?.departments.filter(d => d.id !== config.slug) ?? [];
  let splitCount = 0;

  return (
    <div className="hr-page" data-hr-module={config.module}>
      <HrHero
        variant={config.hero}
        source={source}
        headline={local.headline}
        lede={local.lede}
        crumb={crumb}
        shots={heroShots}
        overview={product?.overview ?? '/modules/hr-payroll'}
        productName={product?.name[locale] ?? 'DIGIT HR'}
        locale={locale}
        onDemo={demo}
      />

      {family && family.departments.length > 1 && (
        <nav className="dp-siblings" aria-label={C.areas[locale]}>
          <div className="dp-wrap">
            <span className="dp-siblings-label">{C.areas[locale]}</span>
            <ul role="list">
              {family.departments.map(d => (
                <li key={d.id}>
                  <NavLink path={d.href} hash={d.hash} aria-current={d.id === config.slug ? 'page' : undefined}>
                    {d.label[locale]}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        </nav>
      )}

      <section className="hr-intro" aria-labelledby="hr-intro-title">
        <div className="dp-wrap">
          <p className="hr-kicker">{C.problemEyebrow[locale]}</p>
          <div className="hr-intro-grid">
            <h2 id="hr-intro-title">{source.intro.title[locale]}</h2>
            <div>
              <p className="hr-intro-lead">{source.intro.body[locale]}</p>
              <p>{C.problemNote[locale]}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="hr-journey" id="journey" aria-labelledby="hr-journey-title">
        <div className="dp-wrap">
          <p className="hr-kicker">{C.journeyEyebrow[locale]}</p>
          <h2 id="hr-journey-title">{C.journeyTitle[locale]}</h2>
          <ol role="list" className="hr-journey-rail" style={{ '--hr-steps': String(source.journey.steps.length) } as CSSProperties}>
            {source.journey.steps.map((s, i) => (
              <li key={i} data-motion-step>
                <span className="hr-journey-no" aria-hidden="true">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span className="sr-only">
                  {C.stage[locale]} {i + 1}:
                </span>
                <strong>{s[locale]}</strong>
              </li>
            ))}
          </ol>
          {source.journey.roles.length > 0 && (
            <div className="hr-personas">
              <strong>{C.roles[locale]}</strong>
              <ul role="list">
                {source.journey.roles.map((r, i) => (
                  <li key={i}>{r[locale]}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </section>

      <section className="hr-capnav" id="capabilities" aria-labelledby="hr-capnav-title">
        <div className="dp-wrap">
          <p className="hr-kicker">{C.capEyebrow[locale]}</p>
          <h2 id="hr-capnav-title">{C.capTitle[locale]}</h2>
          <p className="hr-capnav-body">{C.capBody[locale]}</p>
          <ol role="list" className="hr-capnav-list">
            {placed.map((b, i) => (
              <li key={b.id}>
                <a href={`#cap-${b.ref.replace('.', '-')}`}>
                  <span className="hr-capnav-no" dir="ltr">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span>{b.title}</span>
                  <Arrow aria-hidden="true" />
                </a>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {blocks.map((b, i) => {
        const section = sectionOf(b);
        if (b.type === 'source') {
          if (!section) return null;
          const index = placed.indexOf(b);
          const variant = variants[index] ?? 'flow';
          const flip = variant === 'split' && splitCount++ % 2 === 1;
          return (
            <HrCapability
              key={b.id}
              section={section}
              title={b.title}
              narrative={b.body.trim() || section.narrative[locale]}
              eyebrow={b.eyebrow}
              screens={screensFor(b)}
              variant={variant}
              flip={flip}
              index={index}
              total={placed.length}
              features={source.features}
              screenTitles={source.screens}
              locale={locale}
            />
          );
        }
        return renderBlock(b, i);
      })}

      <section className="hr-outcomes" id="insights" aria-labelledby="hr-outcomes-title">
        <div className="dp-wrap">
          <p className="hr-kicker">{C.outcomesEyebrow[locale]}</p>
          <h2 id="hr-outcomes-title">{C.outcomesTitle[locale]}</h2>
          <p className="hr-outcomes-body">{C.outcomesBody[locale]}</p>
          <div className="hr-outcomes-grid">
            <div className="hr-outcomes-main" data-motion-card>
              <h3>{C.outputs[locale]}</h3>
              <ul role="list">
                {source.outcomes.outputs.map((x, i) => (
                  <li key={i}>{x[locale]}</li>
                ))}
              </ul>
            </div>
            <div data-motion-card>
              <h3>{C.kpis[locale]}</h3>
              <ul role="list">
                {source.outcomes.kpis.map((x, i) => (
                  <li key={i}>{x[locale]}</li>
                ))}
              </ul>
              <p className="hr-note">{C.outcomesKpiNote[locale]}</p>
            </div>
            <div data-motion-card>
              <h3>{C.outcomesExceptions[locale]}</h3>
              <ul role="list">
                {source.outcomes.exceptions.map((x, i) => (
                  <li key={i}>{x[locale]}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section className="hr-cta" aria-labelledby="hr-cta-title">
        <div className="dp-wrap">
          <div>
            <p className="hr-kicker">{C.ctaEyebrow[locale]}</p>
            <h2 id="hr-cta-title">{C.ctaTitle[locale]}</h2>
            <p>{C.ctaBody[locale]}</p>
          </div>
          <Button size="lg" variant="secondary" onClick={demo}>
            {C.demo[locale]}
          </Button>
        </div>
      </section>

      {siblings.length > 0 && (
        <section className="hr-related" aria-labelledby="hr-related-title">
          <div className="dp-wrap">
            <p className="hr-kicker">{C.relatedEyebrow[locale]}</p>
            <h2 id="hr-related-title">{C.relatedTitle[locale]}</h2>
            <ul role="list" className="hr-related-grid">
              {siblings.map(d => (
                <li key={d.id} data-motion-card>
                  <NavLink path={d.href} hash={d.hash}>
                    <strong>{d.label[locale]}</strong>
                    {d.summary && <span>{d.summary[locale]}</span>}
                    <Arrow aria-hidden="true" />
                  </NavLink>
                </li>
              ))}
              <li data-motion-card data-overview="">
                <NavLink path={product?.overview ?? '/modules/hr-payroll'}>
                  <strong>{C.overview[locale]}</strong>
                  <Arrow aria-hidden="true" />
                </NavLink>
              </li>
            </ul>
          </div>
        </section>
      )}
    </div>
  );
}
