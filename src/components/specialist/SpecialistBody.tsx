import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight, CircleCheck, FileText, Settings2, RotateCcw } from 'lucide-react';
import { NavLink } from '@/components/nav/nav-links';
import { focusLeadForm } from '@/components/LeadCapturePanel';
import ShotFrame from '@/components/product/ShotFrame';
import ShotLightbox from '@/components/product/ShotLightbox';
import { Button } from '@/components/ui/button';
import { useCatalog } from '@/components/catalog/useCatalog';
import { useScrollEdges } from '@/hooks/use-scroll-edges';
import { productByKey } from '@/content/catalog';
import type { Shot } from '@/content/product-shots';
import { screenById } from '@/content/screens';
import { photo as photoOf } from '@/content/specialist/photos';
import { cachedSpecialist, loadSpecialist, SPECIALIST_META, type SpecialistIndexEntry } from '@/content/specialist/registry';
import type { EvidenceStatus, FlowStep, L, SpecialistDepartment, SpecialistProduct, SpecialistSection } from '@/content/specialist/types';
import { resolveSourceLocale, type CmsBlock, type CmsContent } from '@/lib/cms-schema';
import type { Locale } from '@/lib/i18n';
import '@/specialist.css';

const C = {
  home: { ar: 'الرئيسية', en: 'Home' },
  crumbs: { ar: 'مسار التنقل', en: 'Breadcrumb' },
  demo: { ar: 'احجز ديمو Digit', en: 'Book Digit demo' },
  overview: { ar: 'نظرة عامة على', en: 'Overview of' },
  areas: { ar: 'المجالات', en: 'Areas' },
  legend: { ar: 'كيف نصف كل قدرة', en: 'How each capability is labelled' },
  diagram: { ar: 'رسم توضيحي للمسار — ليس شاشة من النظام', en: 'Process diagram — not a system screen' },
  noScreen: { ar: 'لا توجد لقطة شاشة فعلية لهذا المجال بعد؛ الرسوم في الصفحة توضح المسار فقط، وتُعرض الشاشات في جلسة الديمو حسب الإصدار والنطاق.', en: 'There is no real screenshot of this area yet; the diagrams on this page explain the process only, and the screens are shown in a demo session per edition and scope.' },
  demoData: { ar: 'شاشات فعلية من بيئة تجريبية؛ الأسماء والأرقام بيانات تجريبية.', en: 'Real screens from a demo environment; names and figures are demo data.' },
  step: { ar: 'الخطوة', en: 'Step' },
  record: { ar: 'السجل', en: 'Record' },
  owner: { ar: 'المسؤول', en: 'Owner' },
  state: { ar: 'الحالة', en: 'State' },
  output: { ar: 'الناتج', en: 'Output' },
  means: { ar: 'يعني', en: 'Means' },
  notThis: { ar: 'ولا يعني', en: 'Does not mean' },
  does: { ar: 'ما يفعله', en: 'Does' },
  sees: { ar: 'ما يراه', en: 'Sees' },
  answer: { ar: 'من أين الجواب', en: 'Where the answer comes from' },
  source: { ar: 'المصدر', en: 'Source' },
  decides: { ar: 'صاحب القرار', en: 'Decided by' },
  profile: { ar: 'مقتبس من الملف التعريفي لـ DIGIT 2026، صفحة', en: 'Adapted from the DIGIT Corporate Profile 2026, page' },
  ctaEyebrow: { ar: 'الخطوة التالية', en: 'Next step' },
  ctaTitle: { ar: 'شاهد هذا المسار على سيناريو قريب من عملك', en: 'See this process on a scenario close to your work' },
  ctaBody: { ar: 'جلسة اكتشاف قصيرة نحدد فيها ما يلزم منشأتك، ثم نعرض الشاشات المتاحة في إصدارك ونوضح ما يحتاج إعدادًا.', en: 'A short discovery session to define what your company needs, then we show the screens available in your edition and explain what needs set-up.' },
  relatedEyebrow: { ar: 'تابع الرحلة', en: 'Continue the journey' },
  relatedTitle: { ar: 'بقية المجالات', en: 'Other areas' },
  overviewCard: { ar: 'نظرة عامة على المنتج', en: 'Product overview' },
} satisfies Record<string, L>;

export const STATUS: Record<EvidenceStatus, { label: L; hint: L }> = {
  demonstrated: { label: { ar: 'ظاهر في شاشة فعلية', en: 'Shown in a real screen' }, hint: { ar: 'تراه في لقطة الشاشة على هذه الصفحة.', en: 'Visible in the screenshot on this page.' } },
  documented: { label: { ar: 'يُعرض في الديمو', en: 'Shown in a demo' }, hint: { ar: 'موثّق في ملف الشركة، ويُعرض في جلسة الديمو حسب الإصدار.', en: 'Described in the company profile, shown in a demo session per edition.' } },
  scoped: { label: { ar: 'حسب النطاق', en: 'Depends on scope' }, hint: { ar: 'يعتمد على الإعداد أو تكامل أو خدمة تُحدد في النطاق.', en: 'Depends on set-up, an integration or a service defined in scope.' } },
};
const STATUS_ICON: Record<EvidenceStatus, typeof CircleCheck> = { demonstrated: CircleCheck, documented: FileText, scoped: Settings2 };

export function StatusChip({ status, locale }: { status: EvidenceStatus; locale: Locale }) {
  const Icon = STATUS_ICON[status];
  return (
    <span className="sp-status" data-status={status}>
      <Icon aria-hidden="true" />
      {STATUS[status].label[locale]}
    </span>
  );
}

/** Page copy for a department: loader data on routes (SSR-safe), loaded on demand in the admin preview. */
export function useSpecialistSource(product: SpecialistProduct, slug: string, initial: SpecialistDepartment | null): SpecialistDepartment | null {
  const matches = (d: SpecialistDepartment | null | undefined) => !!d && d.product === product && d.slug === slug;
  const [loaded, setLoaded] = useState<SpecialistDepartment | null>(() => (matches(initial) ? initial : (cachedSpecialist(product, slug) ?? null)));
  useEffect(() => {
    if (matches(loaded) || matches(initial)) return;
    let live = true;
    void loadSpecialist(product, slug).then(d => {
      if (live && d) setLoaded(d);
    });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product, slug, loaded, initial]);
  if (matches(initial)) return initial;
  return matches(loaded) ? loaded : null;
}

const shotsOf = (ids: string[]) => ids.map(screenById).filter((s): s is Shot => !!s);

function useLightbox(shots: Shot[]) {
  const [index, setIndex] = useState<number | null>(null);
  const node = <ShotLightbox shots={shots} index={index} onIndexChange={setIndex} onClose={() => setIndex(null)} />;
  return { open: (i: number) => setIndex(i), node };
}

function SectionHead({ eyebrow, title, lede, id }: { eyebrow?: string; title: string; lede?: string; id: string }) {
  return (
    <header className="sp-head">
      {eyebrow && <p className="sp-kicker">{eyebrow}</p>}
      <h2 id={id}>{title}</h2>
      {lede && <p className="sp-lede">{lede}</p>}
    </header>
  );
}

/* ---------- Hero diagrams: one per signature, drawn from the page's own copy ---------- */
function flowOf(dept: SpecialistDepartment): FlowStep[] {
  const f = dept.sections.find(s => s.kind === 'flow');
  return f && f.kind === 'flow' ? f.steps : [];
}

function HeroDiagram({ dept, locale }: { dept: SpecialistDepartment; locale: Locale }) {
  const steps = flowOf(dept);
  const intro = dept.sections.find(s => s.kind === 'intro');
  const points = intro && intro.kind === 'intro' ? intro.points : [];
  const records = dept.sections.find(s => s.kind === 'records');
  const recs = records && records.kind === 'records' ? records.items : [];
  const usesSteps = dept.signature === 'ledger' || dept.signature === 'lanes' || dept.signature === 'loop' || dept.signature === 'timeline';
  const sig = usesSteps && steps.length ? dept.signature : dept.signature === 'stack' && recs.length >= 3 ? 'stack' : 'matrix';
  let body: ReactNode;
  if (sig === 'matrix') {
    body = (
      <div className="sp-dg-matrix">
        <span className="sp-dg-core">{SPECIALIST_META[dept.product].name}</span>
        <ul role="list">
          {points.slice(0, 3).map((p, i) => (
            <li key={i} style={{ '--i': i } as CSSProperties}>
              <strong>{p.title[locale]}</strong>
            </li>
          ))}
        </ul>
      </div>
    );
  } else if (sig === 'stack') {
    body = (
      <ul role="list" className="sp-dg-stack">
        {recs.slice(0, 3).map((r, i) => (
          <li key={i} style={{ '--i': i } as CSSProperties}>
            {r.code && <code dir="ltr">{r.code}</code>}
            <strong>{r.name[locale]}</strong>
          </li>
        ))}
      </ul>
    );
  } else if (sig === 'ledger') {
    body = (
      <ol role="list" className="sp-dg-ledger">
        {steps.slice(0, 5).map((s, i) => (
          <li key={s.id}>
            <span className="sp-dg-no" dir="ltr">{String(i + 1).padStart(2, '0')}</span>
            <strong>{s.label[locale]}</strong>
            <span className="sp-dg-state">{s.state[locale]}</span>
          </li>
        ))}
      </ol>
    );
  } else if (sig === 'lanes') {
    const owners = Array.from(new Set(steps.map(s => s.owner[locale]))).slice(0, 4);
    body = (
      <div className="sp-dg-lanes">
        {owners.map(o => (
          <div key={o} className="sp-dg-lane">
            <span>{o}</span>
            <ul role="list">
              {steps.filter(s => s.owner[locale] === o).map(s => (
                <li key={s.id}>{s.label[locale]}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    );
  } else if (sig === 'loop') {
    body = (
      <div className="sp-dg-loop">
        <ol role="list">
          {steps.slice(0, 6).map((s, i) => (
            <li key={s.id} style={{ '--i': i } as CSSProperties}>
              <span dir="ltr">{i + 1}</span>
              {s.label[locale]}
            </li>
          ))}
        </ol>
        <RotateCcw aria-hidden="true" className="sp-dg-return" />
      </div>
    );
  } else {
    body = (
      <ol role="list" className="sp-dg-timeline" style={{ '--n': Math.min(steps.length, 5) } as CSSProperties}>
        {steps.slice(0, 5).map(s => (
          <li key={s.id}>
            <span className="sp-dg-dot" aria-hidden="true" />
            <strong>{s.label[locale]}</strong>
            <span>{s.output[locale]}</span>
          </li>
        ))}
      </ol>
    );
  }
  return (
    <figure className="sp-diagram" data-sig={sig}>
      {body}
      <figcaption>{C.diagram[locale]}</figcaption>
    </figure>
  );
}

function Hero({ dept, entry, locale, headline, lede, crumb, heroShotId }: { dept: SpecialistDepartment; entry: SpecialistIndexEntry; locale: Locale; headline: string; lede: string; crumb: string; heroShotId: string }) {
  const product = productByKey(dept.product);
  const pic = photoOf(dept.photo);
  const shots = useMemo(() => shotsOf(heroShotId ? [heroShotId, ...dept.heroShots.filter(id => id !== heroShotId)] : dept.heroShots), [heroShotId, dept.heroShots]);
  const lead = shots[0];
  const box = useLightbox(shots);
  const demo = () => focusLeadForm({ product: dept.product, department: dept.slug });
  return (
    <section className="sp-hero" data-signature={dept.signature} data-product={dept.product}>
      <div className="dp-wrap">
        <nav aria-label={C.crumbs[locale]} className="dp-crumbs">
          <ol role="list">
            <li>
              <NavLink path="/">{C.home[locale]}</NavLink>
            </li>
            {product && (
              <li>
                <NavLink path={product.overview}>{product.name[locale]}</NavLink>
              </li>
            )}
            <li aria-current="page">{crumb}</li>
          </ol>
        </nav>
        <div className="sp-hero-grid">
          <div className="sp-hero-copy">
            {product && (
              <p className="sp-eyebrow">
                <bdi>{product.name[locale]}</bdi> · {product.area[locale]}
              </p>
            )}
            <h1 className="sp-h1">{headline}</h1>
            <p className="sp-hero-lede">{lede}</p>
            <div className="sp-hero-actions">
              <Button size="lg" onClick={demo}>
                {C.demo[locale]}
              </Button>
              {product && (
                <Button asChild size="lg" variant="outline">
                  <NavLink path={product.overview}>
                    {C.overview[locale]} {product.name[locale]}
                  </NavLink>
                </Button>
              )}
            </div>
            <p className="sp-evidence-note" data-kind={lead ? 'screens' : 'illustrative'}>
              {lead ? C.demoData[locale] : C.noScreen[locale]}
            </p>
          </div>
          <div className="sp-hero-art" data-has-shot={lead ? '' : undefined}>
            {pic && <img className="sp-hero-photo" src={pic.src} width={pic.width} height={pic.height} alt={pic.alt[locale]} fetchPriority="high" decoding="async" />}
            {lead ? (
              <div className="sp-hero-shot">
                <ShotFrame shot={lead} size="lead" caption onOpen={() => box.open(0)} />
              </div>
            ) : (
              <HeroDiagram dept={dept} locale={locale} />
            )}
            {box.node}
          </div>
        </div>
        <dl className="sp-legend" aria-label={C.legend[locale]}>
          {(Object.keys(STATUS) as EvidenceStatus[]).map(s => (
            <div key={s}>
              <dt>
                <StatusChip status={s} locale={locale} />
              </dt>
              <dd>{STATUS[s].hint[locale]}</dd>
            </div>
          ))}
        </dl>
      </div>
      <p className="sr-only">
        {C.profile[locale]} {entry.profilePages.join(locale === 'ar' ? '، ' : ', ')}
      </p>
    </section>
  );
}

/* ---------- Section renderers ---------- */
function SectionView({ section, title, body, eyebrow, locale, index }: { section: SpecialistSection; title: string; body: string; eyebrow: string; locale: Locale; index: number }) {
  const hid = `sp-${section.id}-title`;
  const lede = body || section.lede[locale];
  const head = <SectionHead id={hid} title={title} lede={lede} eyebrow={eyebrow || undefined} />;
  let inner: ReactNode;
  switch (section.kind) {
    case 'intro':
      inner = (
        <div className="sp-intro">
          {head}
          <ol role="list" className="sp-points">
            {section.points.map((p, i) => (
              <li key={i} data-motion-card>
                <span className="sp-no" dir="ltr">{String(i + 1).padStart(2, '0')}</span>
                <h3>{p.title[locale]}</h3>
                <p>{p.body[locale]}</p>
              </li>
            ))}
          </ol>
        </div>
      );
      break;
    case 'flow':
      inner = (
        <>
          {head}
          <ol role="list" className="sp-flow" style={{ '--n': section.steps.length } as CSSProperties}>
            {section.steps.map((s, i) => (
              <li key={s.id} data-motion-step>
                <span className="sp-flow-no" dir="ltr" aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>
                <span className="sr-only">
                  {C.step[locale]} {i + 1}:
                </span>
                <h3>{s.label[locale]}</h3>
                <dl>
                  <div>
                    <dt>{C.record[locale]}</dt>
                    <dd>{typeof s.record === 'string' ? <code dir="ltr">{s.record}</code> : <bdi>{s.record[locale]}</bdi>}</dd>
                  </div>
                  <div>
                    <dt>{C.owner[locale]}</dt>
                    <dd>{s.owner[locale]}</dd>
                  </div>
                  <div>
                    <dt>{C.state[locale]}</dt>
                    <dd><span className="sp-state">{s.state[locale]}</span></dd>
                  </div>
                  <div>
                    <dt>{C.output[locale]}</dt>
                    <dd>{s.output[locale]}</dd>
                  </div>
                </dl>
              </li>
            ))}
          </ol>
          {section.note && (
            <p className="sp-callout">
              <RotateCcw aria-hidden="true" />
              {section.note[locale]}
            </p>
          )}
        </>
      );
      break;
    case 'records':
      inner = (
        <>
          {head}
          <ul role="list" className="sp-records">
            {section.items.map((r, i) => (
              <li key={i} data-motion-card>
                <div className="sp-records-name">
                  <h3>{r.name[locale]}</h3>
                  {r.code && <code dir="ltr">{r.code}</code>}
                </div>
                <p>{r.body[locale]}</p>
                <StatusChip status={r.status} locale={locale} />
              </li>
            ))}
          </ul>
        </>
      );
      break;
    case 'distinct':
      inner = (
        <>
          {head}
          <ul role="list" className="sp-distinct">
            {section.items.map((d, i) => (
              <li key={i} data-motion-card>
                <h3>{d.term[locale]}</h3>
                <p>
                  <span>{C.means[locale]}</span> {d.means[locale]}
                </p>
                <p className="sp-not">
                  <span>{C.notThis[locale]}</span> {d.notThis[locale]}
                </p>
              </li>
            ))}
          </ul>
        </>
      );
      break;
    case 'roles':
      inner = (
        <>
          {head}
          <ul role="list" className="sp-roles" data-count={section.items.length}>
            {section.items.map((r, i) => (
              <li key={i} data-motion-card>
                <h3>{r.role[locale]}</h3>
                <dl>
                  <div>
                    <dt>{C.does[locale]}</dt>
                    <dd>{r.does[locale]}</dd>
                  </div>
                  <div>
                    <dt>{C.sees[locale]}</dt>
                    <dd>{r.sees[locale]}</dd>
                  </div>
                </dl>
              </li>
            ))}
          </ul>
        </>
      );
      break;
    case 'decisions':
      inner = (
        <div className="sp-decisions-grid">
          {head}
          <ol role="list" className="sp-decisions">
            {section.items.map((d, i) => (
              <li key={i} data-motion-card>
                <h3>{d.question[locale]}</h3>
                <p>{d.answer[locale]}</p>
                <dl>
                  <div>
                    <dt>{C.source[locale]}</dt>
                    <dd>{d.source[locale]}</dd>
                  </div>
                  <div>
                    <dt>{C.decides[locale]}</dt>
                    <dd>{d.owner[locale]}</dd>
                  </div>
                </dl>
              </li>
            ))}
          </ol>
        </div>
      );
      break;
    case 'reports':
      inner = (
        <>
          {head}
          <ul role="list" className="sp-reports">
            {section.items.map((r, i) => (
              <li key={i} data-motion-card>
                <h3>{r.name[locale]}</h3>
                <p>{r.purpose[locale]}</p>
                <StatusChip status={r.status} locale={locale} />
              </li>
            ))}
          </ul>
        </>
      );
      break;
    case 'screens':
      inner = <ScreensSection head={head} ids={section.shots} />;
      break;
    case 'scope':
      inner = (
        <div className="sp-scope-grid">
          {head}
          <ul role="list" className="sp-scope">
            {section.items.map((s, i) => (
              <li key={i} data-motion-card>
                <div>
                  <h3>{s.title[locale]}</h3>
                  <StatusChip status={s.status} locale={locale} />
                </div>
                <p>{s.body[locale]}</p>
              </li>
            ))}
          </ul>
        </div>
      );
      break;
    case 'connections':
      inner = <Connections head={head} links={section.links} locale={locale} />;
      break;
  }
  return (
    <section className="sp-section" data-kind={section.kind} data-alt={index % 2 === 1 ? '' : undefined} id={`sp-${section.id}`} aria-labelledby={hid}>
      <div className="dp-wrap">{inner}</div>
    </section>
  );
}

function ScreensSection({ head, ids }: { head: ReactNode; ids: string[] }) {
  const shots = useMemo(() => shotsOf(ids), [ids]);
  const box = useLightbox(shots);
  if (!shots.length) return <>{head}</>;
  return (
    <>
      {head}
      <div className="sp-screens" data-count={shots.length}>
        {shots.map((s, i) => (
          <ShotFrame key={s.id} shot={s} size="lead" caption onOpen={() => box.open(i)} />
        ))}
      </div>
      {box.node}
    </>
  );
}

function Connections({ head, links, locale }: { head: ReactNode; links: { path: string; label: L; why: L }[]; locale: Locale }) {
  const Arrow = locale === 'ar' ? ArrowLeft : ArrowRight;
  return (
    <>
      {head}
      <ul role="list" className="sp-links">
        {links.map(l => (
          <li key={l.path} data-motion-card>
            <NavLink path={l.path}>
              <strong>{l.label[locale]}</strong>
              <span>{l.why[locale]}</span>
              <Arrow aria-hidden="true" />
            </NavLink>
          </li>
        ))}
      </ul>
    </>
  );
}

type Props = {
  content: CmsContent;
  locale: Locale;
  entry: SpecialistIndexEntry;
  source: SpecialistDepartment;
  renderBlock: (block: CmsBlock, index: number) => ReactNode;
};

/**
 * Construction, CRM and FSM + ITM department page: hero (real screen or labelled process diagram over approved
 * photography), the product's area switcher, then the department's source sections in CMS order. The CMS orders,
 * hides and retitles sections; empty fields show the source copy.
 */
export default function SpecialistBody({ content, locale, entry, source, renderBlock }: Props) {
  const families = useCatalog();
  const family = families.find(f => f.key === source.product);
  const product = productByKey(source.product);
  const local = resolveSourceLocale(content, locale, entry, SPECIALIST_META[source.product].name);
  const blocks = local.blocks.filter(b => b.enabled);
  const siblingsRef = useScrollEdges<HTMLDivElement>();
  const siblings = family?.departments.filter(d => d.id !== source.slug) ?? [];
  const Arrow = locale === 'ar' ? ArrowLeft : ArrowRight;
  const pic = photoOf(source.photo);
  const demo = () => focusLeadForm({ product: source.product, department: source.slug });
  let sectionIndex = 0;

  return (
    <div className="sp-page" data-product={source.product}>
      <Hero
        dept={source}
        entry={entry}
        locale={locale}
        headline={local.headline}
        lede={content[locale].lede.trim() || source.summary[locale]}
        crumb={local.navLabel || source.label[locale]}
        heroShotId={content.department?.heroShot ?? ''}
      />

      {family && family.departments.length > 1 && (
        <nav className="dp-siblings" aria-label={family.groupLabel[locale]}>
          <div className="dp-wrap" ref={siblingsRef}>
            <span className="dp-siblings-label">{C.areas[locale]}</span>
            <ul role="list">
              {family.departments.map(d => (
                <li key={d.id}>
                  <NavLink path={d.href} hash={d.hash} aria-current={d.id === source.slug ? 'page' : undefined}>
                    {d.label[locale]}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        </nav>
      )}

      {blocks.map((b, i) => {
        if (b.type !== 'source') return renderBlock(b, i);
        const section = source.sections.find(s => s.id === b.ref);
        if (!section) return null;
        return <SectionView key={b.id} section={section} title={b.title.trim() || section.title[locale]} body={b.body.trim()} eyebrow={b.eyebrow.trim()} locale={locale} index={sectionIndex++} />;
      })}

      <section className="sp-cta" aria-labelledby="sp-cta-title">
        {pic && <img className="sp-cta-photo" src={pic.src} width={pic.width} height={pic.height} alt="" loading="lazy" decoding="async" />}
        <div className="dp-wrap">
          <div>
            <p className="sp-kicker">{C.ctaEyebrow[locale]}</p>
            <h2 id="sp-cta-title">{C.ctaTitle[locale]}</h2>
            <p>{C.ctaBody[locale]}</p>
          </div>
          <Button size="lg" variant="secondary" onClick={demo}>
            {C.demo[locale]}
          </Button>
        </div>
      </section>

      {siblings.length > 0 && (
        <section className="sp-related" aria-labelledby="sp-related-title">
          <div className="dp-wrap">
            <p className="sp-kicker">{C.relatedEyebrow[locale]}</p>
            <h2 id="sp-related-title">{C.relatedTitle[locale]}</h2>
            <ul role="list" className="sp-related-grid">
              {siblings.map(d => (
                <li key={d.id} data-motion-card>
                  <NavLink path={d.href} hash={d.hash}>
                    <strong>{d.label[locale]}</strong>
                    {d.summary && <span>{d.summary[locale]}</span>}
                    <Arrow aria-hidden="true" />
                  </NavLink>
                </li>
              ))}
              {product && (
                <li data-motion-card data-overview="">
                  <NavLink path={product.overview}>
                    <strong>{C.overviewCard[locale]}</strong>
                    <span>{product.name[locale]}</span>
                    <Arrow aria-hidden="true" />
                  </NavLink>
                </li>
              )}
            </ul>
          </div>
        </section>
      )}
    </div>
  );
}
