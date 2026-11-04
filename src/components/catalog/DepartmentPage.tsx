import { useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight, ChevronDown, Search } from 'lucide-react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import LeadCapturePanel, { focusLeadForm } from '@/components/LeadCapturePanel';
import ShotFrame from '@/components/product/ShotFrame';
import ShotLightbox from '@/components/product/ShotLightbox';
import CmsImage from '@/components/cms/CmsImage';
import { Button } from '@/components/ui/button';
import { NavLink } from '@/components/nav/nav-links';
import { useCatalog } from './useCatalog';
import { departmentByPath, departmentById, productByKey, type L } from '@/content/catalog';
import { SHOTS, type Shot } from '@/content/product-shots';
import type { CmsBlock, CmsContent } from '@/lib/cms-schema';
import { useLocale, type Locale } from '@/lib/i18n';
import { usePageMotion } from '@/hooks/use-page-motion';
import '@/product-proof.css';

const COPY = {
  home: { ar: 'الرئيسية', en: 'Home' },
  crumbs: { ar: 'مسار التنقل', en: 'Breadcrumb' },
  overview: { ar: 'نظرة عامة على', en: 'Overview of' },
  demo: { ar: 'احجز ديمو Digit', en: 'Book Digit demo' },
  details: { ar: 'تابع التفاصيل', en: 'Explore details' },
  related: { ar: 'أقسام مرتبطة', en: 'Related departments' },
  magnified: { ar: 'تفصيل مكبّر من الشاشة', en: 'Magnified detail from the screen' },
  scenario: { ar: 'سيناريو', en: 'Scenario' },
  stage: { ar: 'المرحلة', en: 'Stage' },
  previous: { ar: 'الشاشة السابقة', en: 'Previous screen' },
  next: { ar: 'الشاشة التالية', en: 'Next screen' },
  screens: { ar: 'شاشات القسم', en: 'Department screens' },
} satisfies Record<string, L>;

const known = (id: string): Shot | undefined => (id ? SHOTS[id] : undefined);

function useLightbox(shots: Shot[]) {
  const [index, setIndex] = useState<number | null>(null);
  const node = <ShotLightbox shots={shots} index={index} onIndexChange={setIndex} onClose={() => setIndex(null)} />;
  return { open: (i: number) => setIndex(i), node };
}

function BlockHead({ block, center = false }: { block: CmsBlock; center?: boolean }) {
  return (
    <header className="dp-head" data-center={center ? '' : undefined}>
      {block.eyebrow && <p className="dp-eyebrow">{block.eyebrow}</p>}
      {block.title && <h2 className="dp-title">{block.title}</h2>}
      {block.body && <p className="dp-body">{block.body}</p>}
    </header>
  );
}

function ItemLink({ href, locale }: { href: string; locale: Locale }) {
  if (!href) return null;
  return (
    <NavLink path={href} className="dp-more">
      {COPY.details[locale]}
      {locale === 'ar' ? <ArrowLeft aria-hidden="true" /> : <ArrowRight aria-hidden="true" />}
    </NavLink>
  );
}

/** One large screen with an optional magnified region (percent coordinates) shown as a lens beside it. */
function FocusShot({ shot, focus, locale, onOpen }: { shot: Shot; focus: CmsBlock['focus']; locale: Locale; onOpen: () => void }) {
  return (
    <div className="dp-focus" data-has-lens={focus ? '' : undefined}>
      <div className="dp-focus-main">
        <ShotFrame shot={shot} size="lead" onOpen={onOpen} />
        {focus && <span className="dp-focus-ring" aria-hidden="true" style={{ insetInlineStart: undefined, left: `${focus.x}%`, top: `calc(34px + (100% - 34px - 3.2em) * ${focus.y / 100})` } as CSSProperties} />}
      </div>
      {focus && (
        <figure className="dp-lens">
          <span className="dp-lens-view" aria-hidden="true">
            <img src={shot.src} alt="" width={shot.width} height={shot.height} loading="lazy" style={{ transform: `scale(${focus.zoom})`, transformOrigin: `${focus.x}% ${focus.y}%` }} />
          </span>
          <figcaption>
            <Search aria-hidden="true" />
            {COPY.magnified[locale]}
          </figcaption>
        </figure>
      )}
    </div>
  );
}

function StoryBlock({ block, locale, flip }: { block: CmsBlock; locale: Locale; flip: boolean }) {
  const shot = known(block.shotId);
  const box = useLightbox(shot ? [shot] : []);
  return (
    <div className="dp-story" data-flip={flip ? '' : undefined}>
      <div className="dp-story-copy">
        <BlockHead block={block} />
        <ItemLink href={block.href} locale={locale} />
      </div>
      {shot && <FocusShot shot={shot} focus={block.focus} locale={locale} onOpen={() => box.open(0)} />}
      {!shot && block.mediaUrl && <CmsImage url={block.mediaUrl} alt={block.mediaAlt} className="dp-media" />}
      {box.node}
    </div>
  );
}

function TheaterBlock({ block, locale }: { block: CmsBlock; locale: Locale }) {
  const shots = useMemo(() => [block.shotId, ...block.shots].filter((id, i, all) => id && all.indexOf(id) === i).map(known).filter((s): s is Shot => !!s), [block.shotId, block.shots]);
  const [active, setActive] = useState(0);
  const box = useLightbox(shots);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const current = shots[active];
  if (!current) return <BlockHead block={block} />;
  const go = (i: number) => {
    const next = (i + shots.length) % shots.length;
    setActive(next);
    tabs.current[next]?.focus();
  };
  const onKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const forward = e.key === (locale === 'ar' ? 'ArrowLeft' : 'ArrowRight');
    go(active + (forward ? 1 : -1));
  };
  const id = `dp-theater-${block.id}`;
  return (
    <div className="dp-theater">
      <BlockHead block={block} center />
      {shots.length > 1 && (
        <div role="tablist" aria-label={COPY.screens[locale]} className="dp-tabs">
          {shots.map((s, i) => (
            <button
              key={s.id}
              ref={el => {
                tabs.current[i] = el;
              }}
              type="button"
              role="tab"
              id={`${id}-tab-${i}`}
              aria-selected={i === active}
              aria-controls={`${id}-panel`}
              tabIndex={i === active ? 0 : -1}
              className="dp-tab"
              onClick={() => setActive(i)}
              onKeyDown={onKey}
            >
              <span className="dp-tab-no">{String(i + 1).padStart(2, '0')}</span>
              {s.caption[locale]}
            </button>
          ))}
        </div>
      )}
      <div role={shots.length > 1 ? 'tabpanel' : undefined} id={`${id}-panel`} aria-labelledby={shots.length > 1 ? `${id}-tab-${active}` : undefined} className="dp-theater-stage">
        <ShotFrame key={current.id} shot={current} size="lead" onOpen={() => box.open(active)} />
        {shots.length > 1 && (
          <div className="dp-theater-nav">
            <Button variant="outline" size="icon" aria-label={COPY.previous[locale]} onClick={() => go(active - 1)}>
              {locale === 'ar' ? <ArrowRight /> : <ArrowLeft />}
            </Button>
            <span dir="ltr">
              {active + 1} / {shots.length}
            </span>
            <Button variant="outline" size="icon" aria-label={COPY.next[locale]} onClick={() => go(active + 1)}>
              {locale === 'ar' ? <ArrowLeft /> : <ArrowRight />}
            </Button>
          </div>
        )}
      </div>
      {box.node}
    </div>
  );
}

function ItemsWithShots({ block, locale, variant }: { block: CmsBlock; locale: Locale; variant: 'capability' | 'roles' | 'usecase' | 'resource' | 'related' }) {
  const shots = block.items.map(i => known(i.shotId)).filter((s): s is Shot => !!s);
  const box = useLightbox(shots);
  return (
    <>
      <BlockHead block={block} />
      <ul role="list" className={`dp-cards dp-cards-${variant}`} data-count={Math.min(block.items.length, 4)}>
        {block.items.map((item, i) => {
          const s = known(item.shotId);
          return (
            <li key={i} className="dp-card" data-motion-card>
              {variant === 'usecase' && (
                <span className="dp-card-tag">
                  {COPY.scenario[locale]} {i + 1}
                </span>
              )}
              {variant === 'capability' && <span className="dp-card-no">{String(i + 1).padStart(2, '0')}</span>}
              {s && (
                <button type="button" className="dp-thumb" onClick={() => box.open(shots.indexOf(s))} aria-label={s.caption[locale]} aria-haspopup="dialog">
                  <img src={s.src} alt="" width={s.width} height={s.height} loading="lazy" decoding="async" />
                </button>
              )}
              {item.title && <h3>{item.title}</h3>}
              {item.body && <p>{item.body}</p>}
              <ItemLink href={item.href} locale={locale} />
            </li>
          );
        })}
      </ul>
      {box.node}
    </>
  );
}

function WorkflowBlock({ block, locale }: { block: CmsBlock; locale: Locale }) {
  return (
    <>
      <BlockHead block={block} center />
      <ol role="list" className="dp-flow" style={{ '--dp-steps': String(Math.max(block.items.length, 1)) } as CSSProperties}>
        {block.items.map((item, i) => (
          <li key={i} className="dp-flow-step" data-motion-step>
            <span className="dp-flow-dot" aria-hidden="true">
              {i + 1}
            </span>
            <span className="sr-only">
              {COPY.stage[locale]} {i + 1}:
            </span>
            <strong>{item.title}</strong>
            {item.body && <p>{item.body}</p>}
          </li>
        ))}
      </ol>
    </>
  );
}

function DocumentBlock({ block, locale }: { block: CmsBlock; locale: Locale }) {
  const links = block.items.filter(i => !i.shotId);
  const shown = block.items.filter(i => known(i.shotId));
  const shots = shown.map(i => known(i.shotId)!);
  const box = useLightbox(shots);
  return (
    <div className="dp-docs">
      <BlockHead block={block} />
      <ul role="list" className="dp-chain">
        {links.map((item, i) => {
          const [from, to] = item.title.split(/\s*[←→]\s*/);
          return (
            <li key={i} className="dp-chain-item" data-motion-card>
              {to ? (
                <span className="dp-chain-pair">
                  <span>{from}</span>
                  {locale === 'ar' ? <ArrowLeft aria-hidden="true" /> : <ArrowRight aria-hidden="true" />}
                  <span>{to}</span>
                </span>
              ) : (
                <strong>{item.title}</strong>
              )}
              {item.body && <small>{item.body}</small>}
            </li>
          );
        })}
      </ul>
      {shown.map((item, i) => (
        <figure key={i} className="dp-docs-shot">
          <figcaption>{item.title}</figcaption>
          <ShotFrame shot={shots[i]!} size="lead" caption={false} onOpen={() => box.open(i)} />
        </figure>
      ))}
      {box.node}
    </div>
  );
}

function ReportBlock({ block, locale }: { block: CmsBlock; locale: Locale }) {
  const shots = [block.shotId, ...block.shots].filter((id, i, all) => id && all.indexOf(id) === i).map(known).filter((s): s is Shot => !!s);
  const box = useLightbox(shots);
  return (
    <div className="dp-report" data-pair={shots.length > 1 ? '' : undefined}>
      <div className="dp-report-copy">
        <BlockHead block={block} />
        {block.items.length > 0 && (
          <dl className="dp-kpis">
            {block.items.map((item, i) => (
              <div key={i} data-motion-card>
                <dt>{item.title}</dt>
                {item.body && <dd>{item.body}</dd>}
              </div>
            ))}
          </dl>
        )}
        <ItemLink href={block.href} locale={locale} />
      </div>
      <div className="dp-report-shots">
        {shots.map((s, i) => (
          <ShotFrame key={s.id} shot={s} size={i === 0 ? 'lead' : 'card'} onOpen={() => box.open(i)} />
        ))}
      </div>
      {box.node}
    </div>
  );
}

function ProfileBlock({ block, locale }: { block: CmsBlock; locale: Locale }) {
  const shot = known(block.shotId);
  const box = useLightbox(shot ? [shot] : []);
  return (
    <div className="dp-profile">
      <BlockHead block={block} />
      <div className="dp-profile-grid">
        {shot && <ShotFrame shot={shot} size="lead" onOpen={() => box.open(0)} />}
        <ul role="list" className="dp-profile-links">
          {block.items.map((item, i) => (
            <li key={i} data-motion-card>
              <strong>{item.title}</strong>
              {item.body && <p>{item.body}</p>}
              <ItemLink href={item.href} locale={locale} />
            </li>
          ))}
        </ul>
      </div>
      {box.node}
    </div>
  );
}

function FaqBlock({ block }: { block: CmsBlock }) {
  return (
    <div className="dp-faq">
      <BlockHead block={block} />
      <div className="dp-faq-list">
        {block.items.map((item, i) => (
          <details key={i}>
            <summary>
              {item.title}
              <ChevronDown aria-hidden="true" />
            </summary>
            <p>{item.body}</p>
          </details>
        ))}
      </div>
    </div>
  );
}

function CtaBlock({ block, locale, product, department }: { block: CmsBlock; locale: Locale; product: string; department: string }) {
  return (
    <div className="dp-cta">
      <div>
        {block.title && <h2 className="dp-title">{block.title}</h2>}
        {block.body && <p className="dp-body">{block.body}</p>}
      </div>
      <Button size="lg" onClick={() => focusLeadForm({ product, department })}>
        {COPY.demo[locale]}
      </Button>
    </div>
  );
}

function Block({ block, locale, index, product, department }: { block: CmsBlock; locale: Locale; index: number; product: string; department: string }) {
  let body: ReactNode;
  switch (block.type) {
    case 'story':
      body = <StoryBlock block={block} locale={locale} flip={index % 2 === 1} />;
      break;
    case 'theater':
      body = <TheaterBlock block={block} locale={locale} />;
      break;
    case 'workflow':
      body = <WorkflowBlock block={block} locale={locale} />;
      break;
    case 'document':
      body = <DocumentBlock block={block} locale={locale} />;
      break;
    case 'report':
      body = <ReportBlock block={block} locale={locale} />;
      break;
    case 'profile':
      body = <ProfileBlock block={block} locale={locale} />;
      break;
    case 'faq':
      body = <FaqBlock block={block} />;
      break;
    case 'cta':
      body = <CtaBlock block={block} locale={locale} product={product} department={department} />;
      break;
    case 'roles':
    case 'capability':
    case 'usecase':
    case 'resource':
    case 'related':
      body = <ItemsWithShots block={block} locale={locale} variant={block.type} />;
      break;
  }
  return (
    <section className="dp-block" data-type={block.type} id={block.id}>
      <div className="dp-wrap">{body}</div>
    </section>
  );
}

/** Shared Department Detail template: breadcrumbs, hero with a real screen, department switcher and CMS-ordered content regions. */
export function DepartmentBody({ content, path, locale }: { content: CmsContent; path: string; locale: Locale }) {
  const meta = content.department;
  const local = content[locale];
  const families = useCatalog();
  const registered = departmentByPath(path) ?? (meta ? departmentById(meta.product, meta.id) : undefined);
  const productKey = registered?.product ?? meta?.product ?? 'pro';
  const product = productByKey(productKey);
  const family = families.find(f => f.key === productKey);
  const deptId = registered?.id ?? meta?.id ?? '';
  const heroShot = known(meta?.heroShot ?? '');
  const heroBox = useLightbox(heroShot ? [heroShot] : []);
  const blocks = local.blocks.filter(b => b.enabled);
  const relatedFromMeta = (meta?.related ?? []).map(id => family?.departments.find(d => d.id === id)).filter((d): d is NonNullable<typeof d> => !!d && d.id !== deptId);
  const headline = local.headline || registered?.label[locale] || local.title;
  return (
    <>
      <section className="dp-hero">
        <div className="dp-wrap">
          <nav aria-label={COPY.crumbs[locale]} className="dp-crumbs">
            <ol role="list">
              <li>
                <NavLink path="/">{COPY.home[locale]}</NavLink>
              </li>
              {product && (
                <li>
                  <NavLink path={product.overview}>{product.name[locale]}</NavLink>
                </li>
              )}
              <li aria-current="page">{local.navLabel || registered?.label[locale] || headline}</li>
            </ol>
          </nav>
          <div className="dp-hero-copy">
            <div>
              {product && (
                <p className="dp-eyebrow">
                  <bdi>{product.name[locale]}</bdi> · {product.area[locale]}
                </p>
              )}
              <h1 className="dp-h1">{headline}</h1>
              {local.lede && <p className="dp-lede">{local.lede}</p>}
            </div>
            <div className="dp-hero-actions">
              <Button size="lg" onClick={() => focusLeadForm({ product: productKey, department: deptId })}>
                {COPY.demo[locale]}
              </Button>
              {product && (
                <Button asChild size="lg" variant="outline">
                  <NavLink path={product.overview}>
                    {COPY.overview[locale]} {product.name[locale]}
                  </NavLink>
                </Button>
              )}
            </div>
          </div>
          {heroShot ? (
            <div className="dp-hero-shot">
              <ShotFrame shot={heroShot} size="lead" caption onOpen={() => heroBox.open(0)} />
            </div>
          ) : (
            meta?.heroMedia && (
              <div className="dp-hero-shot">
                <CmsImage url={meta.heroMedia} alt={meta.heroAlt[locale]} className="dp-media" fit="contain" />
              </div>
            )
          )}
          {heroBox.node}
        </div>
      </section>

      {family && family.departments.length > 1 && (
        <nav className="dp-siblings" aria-label={family.groupLabel[locale]}>
          <div className="dp-wrap">
            <span className="dp-siblings-label">{family.groupLabel[locale]}</span>
            <ul role="list">
              {family.departments.map(d => (
                <li key={d.id}>
                  <NavLink path={d.href} hash={d.hash} aria-current={d.id === deptId ? 'page' : undefined}>
                    {d.label[locale]}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        </nav>
      )}

      {blocks.map((b, i) => (
        <Block key={b.id} block={b} locale={locale} index={blocks.slice(0, i).filter(x => x.type === 'story').length} product={productKey} department={deptId} />
      ))}

      {relatedFromMeta.length > 0 && !blocks.some(b => b.type === 'related') && (
        <section className="dp-block" data-type="related">
          <div className="dp-wrap">
            <header className="dp-head">
              <h2 className="dp-title">{COPY.related[locale]}</h2>
            </header>
            <ul role="list" className="dp-cards dp-cards-related" data-count={Math.min(relatedFromMeta.length, 4)}>
              {relatedFromMeta.map(d => (
                <li key={d.id} className="dp-card" data-motion-card>
                  <h3>{d.label[locale]}</h3>
                  {d.summary && <p>{d.summary[locale]}</p>}
                  <ItemLink href={d.href} locale={locale} />
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}
    </>
  );
}

export default function DepartmentPage({ content, path }: { content: CmsContent; path: string }) {
  const locale = useLocale();
  const mainRef = useRef<HTMLElement>(null);
  usePageMotion(mainRef, `dept-${path}-${locale}`);
  const meta = content.department;
  const registered = departmentByPath(path);
  const product = registered?.product ?? meta?.product ?? '';
  const department = registered?.id ?? meta?.id ?? '';
  const title = content[locale].headline || registered?.label[locale] || content[locale].title;
  return (
    <div className="bg-paper font-plex">
      <Header />
      <main ref={mainRef} className="dept-page" aria-label={title}>
        <DepartmentBody content={content} path={path} locale={locale} />
        {content.formEnabled && <LeadCapturePanel interest={title} product={product} department={department} />}
      </main>
      <Footer />
    </div>
  );
}
