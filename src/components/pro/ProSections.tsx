import type { ReactNode } from 'react';
import { ArrowLeft, ArrowRight, Check, CircleDashed, FileText, Hourglass, Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { NavLink } from '@/components/nav/nav-links';
import { proPageByKey, proPageByPath } from '@/content/pro/pro-pages';
import type { L, ProSection } from '@/content/pro/types';
import type { EvidenceTier } from '@/content/pro/evidence';
import { useLocale } from '@/lib/i18n';
import { PRO_COPY as C, TIER_LABEL } from './pro-copy';
import { ProScreen, useSectionLightbox } from './ProScreens';
import { JourneyRail, ReportName } from './ProWorkspace';
import { useAskDemo } from './use-ask-demo';

type Of<K extends ProSection['kind']> = Extract<ProSection, { kind: K }>;
export type SectionProps<K extends ProSection['kind']> = { s: Of<K>; title: string; lede: string; eyebrow: string; shotId: string; department: string; pageKey: string };

const n2 = (n: number) => String(n).padStart(2, '0');

export function SectionShell({ id, kind, title, eyebrow, lede, children, tone }: { id: string; kind: string; title: string; eyebrow?: string; lede?: string; children: ReactNode; tone?: 'deep' | 'soft' }) {
  return (
    <section className="pv-sec" data-kind={kind} data-tone={tone} id={`pv-${id}`} aria-labelledby={`pv-${id}-title`}>
      <div className="dp-wrap">
        <header className="pv-head">
          {eyebrow && <p className="pv-eyebrow">{eyebrow}</p>}
          <h2 id={`pv-${id}-title`}>{title}</h2>
          {lede && <p className="pv-lede">{lede}</p>}
        </header>
        {children}
      </div>
    </section>
  );
}

function useArrow() {
  return useLocale() === 'ar' ? ArrowLeft : ArrowRight;
}

/* ------------------------------------------------------------------ intro */

export function IntroSection({ s, title, lede, eyebrow }: SectionProps<'intro'>) {
  const locale = useLocale();
  return (
    <section className="pv-sec pv-intro" id={`pv-${s.id}`} aria-labelledby={`pv-${s.id}-title`}>
      <div className="dp-wrap">
        <div className="pv-intro-grid">
          <div>
            <p className="pv-eyebrow">{eyebrow || C.inside[locale]}</p>
            <h2 id={`pv-${s.id}-title`}>{title}</h2>
            <p className="pv-thesis">{lede || s.thesis[locale]}</p>
            <p className="pv-question">{s.question[locale]}</p>
          </div>
          <div className="pv-intro-side">
            <p className="pv-label">{C.sequence[locale]}</p>
            <ol className="pv-chain">
              {s.sequence.map((d, i) => (
                <li key={i} data-motion-step="">
                  <span dir="ltr">{n2(i + 1)}</span>
                  {d[locale]}
                </li>
              ))}
            </ol>
            <p className="pv-label">{C.roles[locale]}</p>
            <ul className="pv-ladder" role="list">
              {s.roles.map((r, i) => (
                <li key={i}>{r[locale]}</li>
              ))}
            </ul>
          </div>
        </div>
        {s.rail && <JourneyRail rail={s.rail} label={C.sequence[locale]} />}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------- flow */

/** Even rows: 6 steps sit 3 + 3, 8 steps 4 + 4, never 5 + 1. */
function flowColumns(n: number) {
  if (n <= 4) return n;
  if (n % 4 === 0) return 4;
  if (n % 3 === 0) return 3;
  return n === 5 ? 5 : 4;
}

export function FlowSection({ s, title, lede, eyebrow }: SectionProps<'flow'>) {
  const locale = useLocale();
  const box = useSectionLightbox(s.steps.map(st => st.shot));
  return (
    <SectionShell id={s.id} kind="flow" title={title} eyebrow={eyebrow} lede={lede || s.lede[locale]} tone="soft">
      <ol className="pv-flow" style={{ '--pv-cols': flowColumns(s.steps.length) } as CSSProperties}>
        {s.steps.map((st, i) => (
          <li key={i} data-motion-card="">
            <span className="pv-flow-no" dir="ltr">{n2(i + 1)}</span>
            <h3>{st.title[locale]}</h3>
            <p>{st.body[locale]}</p>
            {st.doc && locale === 'en' && <span className="pv-sys" dir="ltr">{st.doc}</span>}
            {st.shot && <ProScreen refId={st.shot} size="thumb" caption={false} open={box.open} />}
          </li>
        ))}
      </ol>
      {box.node}
    </SectionShell>
  );
}

/* ---------------------------------------------------------------- anatomy */

export function AnatomySection({ s, title, lede, eyebrow, shotId }: SectionProps<'anatomy'>) {
  const locale = useLocale();
  const lead = shotId ? { id: shotId } : s.lead;
  const box = useSectionLightbox([lead.id, ...(s.support ?? []).map(x => x.id)]);
  return (
    <SectionShell id={s.id} kind="anatomy" title={title} eyebrow={eyebrow} lede={lede || s.lede[locale]}>
      <div className="pv-anatomy">
        <ProScreen refId={lead} open={box.open} />
        <div>
          <ol className="pv-terms">
            {s.terms.map((t, i) => (
              <li key={i} data-motion-step="">
                <span className="pv-term-no" dir="ltr">{n2(i + 1)}</span>
                <div>
                  <strong>{t.term[locale]}</strong>
                  <span>{t.def[locale]}</span>
                </div>
              </li>
            ))}
          </ol>
          {s.support?.map(x => <ProScreen key={x.id} refId={x} size="card" open={box.open} />)}
          {s.note && <p className="pv-note">{s.note[locale]}</p>}
        </div>
      </div>
      {box.node}
    </SectionShell>
  );
}

/* ------------------------------------------------------------------ match */

export function MatchSection({ s, title, lede, eyebrow }: SectionProps<'match'>) {
  const locale = useLocale();
  const box = useSectionLightbox(s.checks.map(c => c.shot));
  return (
    <SectionShell id={s.id} kind="match" title={title} eyebrow={eyebrow} lede={lede || s.lede[locale]} tone="soft">
      <ol className="pv-match">
        {s.columns.map((c, i) => (
          <li key={c.sys} data-motion-card="">
            <span className="pv-match-no" dir="ltr">{n2(i + 1)}</span>
            <FileText aria-hidden="true" />
            <h3>{c.doc[locale]}</h3>
            {locale === 'ar' && <span className="pv-sys" dir="ltr">{c.sys}</span>}
            <p>{c.holds[locale]}</p>
          </li>
        ))}
      </ol>
      <ul className="pv-checks" role="list">
        {s.checks.map(c => (
          <li key={c.id}>
            {c.shot && <ProScreen refId={c.shot} size="card" caption={false} open={box.open} />}
            <div>
              <strong>{c.title[locale]}</strong>
              <span>{c.body[locale]}</span>
            </div>
          </li>
        ))}
      </ul>
      <p className="pv-note">{s.note[locale]}</p>
      {box.node}
    </SectionShell>
  );
}

/* -------------------------------------------------------------- lifecycle */

export function LifecycleSection({ s, title, lede, eyebrow }: SectionProps<'lifecycle'>) {
  const locale = useLocale();
  const box = useSectionLightbox(s.stages.map(st => st.shot));
  return (
    <SectionShell id={s.id} kind="lifecycle" title={title} eyebrow={eyebrow} lede={lede || s.lede[locale]}>
      <ol className="pv-life">
        {s.stages.map((st, i) => (
          <li key={i} data-shown={st.shown ? '' : undefined} data-motion-card="">
            <span className="pv-life-no" dir="ltr">{n2(i + 1)}</span>
            <h3>{st.title[locale]}</h3>
            <p>{st.body[locale]}</p>
            <span className="pv-badge" data-tier={st.shown ? 'available' : 'scoped'}>
              {st.shown ? <Check aria-hidden="true" /> : <Settings2 aria-hidden="true" />}
              {st.shown ? C.shownOnScreen[locale] : C.setAtSetup[locale]}
            </span>
            {st.shot && <ProScreen refId={st.shot} size="thumb" caption={false} open={box.open} />}
          </li>
        ))}
      </ol>
      <p className="pv-note">{s.note[locale]}</p>
      {box.node}
    </SectionShell>
  );
}

/* ----------------------------------------------------------------- mosaic */

export function MosaicSection({ s, title, lede, eyebrow }: SectionProps<'mosaic'>) {
  const locale = useLocale();
  const Arrow = useArrow();
  const box = useSectionLightbox(s.items.map(i => i.shot));
  return (
    <SectionShell id={s.id} kind="mosaic" title={title} eyebrow={eyebrow} lede={lede || s.lede[locale]} tone="soft">
      <ul className="pv-mosaic" role="list">
        {s.items.map(item => (
          <li key={item.shot} data-motion-card="">
            <ProScreen refId={item.shot} size="card" caption={false} open={box.open} />
            <p>{item.note[locale]}</p>
            {item.href && (
              <NavLink path={item.href} className="pv-link">
                {proPageByPath(item.href)?.label[locale] ?? C.departmentPage[locale]}
                <Arrow aria-hidden="true" />
              </NavLink>
            )}
          </li>
        ))}
      </ul>
      {box.node}
    </SectionShell>
  );
}

/* -------------------------------------------------------------- decisions */

export function DecisionsSection({ s, title, lede, eyebrow }: SectionProps<'decisions'>) {
  const locale = useLocale();
  const box = useSectionLightbox(s.items.map(i => i.shot));
  return (
    <SectionShell id={s.id} kind="decisions" title={title} eyebrow={eyebrow} lede={lede || s.lede[locale]}>
      <ol className="pv-decisions">
        {s.items.map((item, i) => (
          <li key={i} data-motion-card="">
            <span className="pv-q-no" dir="ltr">{n2(i + 1)}</span>
            <div className="pv-decision-copy">
              <h3>{item.question[locale]}</h3>
              <p>{item.answer[locale]}</p>
              {item.report && <ReportName k={item.report} />}
            </div>
            {item.shot && <ProScreen refId={item.shot} size="card" caption={false} open={box.open} />}
          </li>
        ))}
      </ol>
      {box.node}
    </SectionShell>
  );
}

/* ------------------------------------------------------------ connections */

export function ConnectionsSection({ s, title, lede, eyebrow }: SectionProps<'connections'>) {
  const locale = useLocale();
  const Arrow = useArrow();
  return (
    <SectionShell id={s.id} kind="connections" title={title} eyebrow={eyebrow} lede={lede || s.lede[locale]} tone="deep">
      <ul className="pv-connections" role="list">
        {s.items.map(item => {
          const target = proPageByKey(item.to);
          if (!target) return null;
          return (
            <li key={item.to} data-motion-card="">
              <NavLink path={target.path}>
                <span className="pv-conn-to">{target.label[locale]}</span>
                <strong>{item.title[locale]}</strong>
                <span>{item.body[locale]}</span>
                <Arrow aria-hidden="true" className="pv-conn-arrow" />
              </NavLink>
            </li>
          );
        })}
      </ul>
    </SectionShell>
  );
}

/* --------------------------------------------------------------- features */

export function FeaturesSection({ s, title, lede, eyebrow }: SectionProps<'features'>) {
  const locale = useLocale();
  const box = useSectionLightbox(s.items.map(i => i.shot));
  return (
    <SectionShell id={s.id} kind="features" title={title} eyebrow={eyebrow} lede={lede || s.lede[locale]} tone="soft">
      <ul className="pv-features" data-layout={s.layout ?? 'grid'} role="list">
        {s.items.map(f => (
          <li key={f.id} data-motion-card="">
            {f.shot && <ProScreen refId={f.shot} size="card" caption={false} open={box.open} />}
            <div>
              <strong>{f.title[locale]}</strong>
              <span>{f.body[locale]}</span>
            </div>
          </li>
        ))}
      </ul>
      {box.node}
    </SectionShell>
  );
}

/* ----------------------------------------------------------------- layers */

export function LayersSection({ s, title, lede, eyebrow }: SectionProps<'layers'>) {
  const locale = useLocale();
  const Arrow = useArrow();
  const box = useSectionLightbox(s.layers.map(l => l.shot));
  return (
    <SectionShell id={s.id} kind="layers" title={title} eyebrow={eyebrow} lede={lede || s.lede[locale]}>
      <ol className="pv-layers">
        {s.layers.map((layer, i) => (
          <li key={i} data-motion-card="">
            <span className="pv-layer-no" dir="ltr">{n2(i + 1)}</span>
            <h3>{layer.name[locale]}</h3>
            <dl>
              <div>
                <dt>{C.role[locale]}</dt>
                <dd>{layer.who[locale]}</dd>
              </div>
              <div>
                <dt>{C.decision[locale]}</dt>
                <dd>{layer.purpose[locale]}</dd>
              </div>
            </dl>
            <ProScreen refId={layer.shot} size="card" caption={false} open={box.open} />
            <p>{layer.example[locale]}</p>
            <NavLink path={layer.href} className="pv-link">
              {proPageByPath(layer.href)?.label[locale] ?? C.open[locale]}
              <Arrow aria-hidden="true" />
            </NavLink>
          </li>
        ))}
      </ol>
      {box.node}
    </SectionShell>
  );
}

/* ---------------------------------------------------------------- chapter */

export function ChapterSection({ s, title, lede, eyebrow, shotId }: SectionProps<'chapter'>) {
  const locale = useLocale();
  const lead = shotId ? { id: shotId } : s.lead;
  const box = useSectionLightbox([lead.id, ...(s.support ?? [])]);
  return (
    <section className="pv-sec pv-chapter" id={`pv-${s.id}`} aria-labelledby={`pv-${s.id}-title`} data-flip={s.flip ? '' : undefined}>
      <div className="dp-wrap">
        <div className="pv-chapter-grid">
          <div className="pv-chapter-copy">
            <p className="pv-eyebrow">{eyebrow || s.kicker[locale]}</p>
            <h2 id={`pv-${s.id}-title`}>{title}</h2>
            <p className="pv-lede">{lede || s.lede[locale]}</p>
            <ol className="pv-points">
              {s.points.map((p, i) => (
                <li key={i} data-motion-step="">
                  <span dir="ltr">{n2(i + 1)}</span>
                  <div>
                    <strong>{p.title[locale]}</strong>
                    <span>{p.body[locale]}</span>
                  </div>
                </li>
              ))}
            </ol>
            {s.reports.length > 0 && (
              <>
                <p className="pv-label">{C.reports[locale]}</p>
                <ul className="pv-report-list" role="list">
                  {s.reports.map(k => (
                    <li key={k}>
                      <ReportName k={k} />
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
          <div className="pv-chapter-screens">
            <ProScreen refId={lead} open={box.open} />
            {(s.support ?? []).length > 0 && (
              <div className="pv-thumbs">
                {s.support!.map(id => (
                  <ProScreen key={id} refId={id} size="thumb" open={box.open} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
      {box.node}
    </section>
  );
}

/* ------------------------------------------------------------------ scope */

const TIER_ICON: Record<EvidenceTier, typeof Check> = { available: Check, verifying: Hourglass, scoped: CircleDashed };
const TIER_NOTE: Record<EvidenceTier, L> = { available: C.tierAvailableNote, verifying: C.tierVerifyingNote, scoped: C.tierScopedNote };

export function ScopeSection({ s, title, lede, eyebrow }: SectionProps<'scope'>) {
  const locale = useLocale();
  const box = useSectionLightbox(s.items.map(i => i.shot));
  const tiers: EvidenceTier[] = ['available', 'verifying', 'scoped'];
  return (
    <SectionShell id={s.id} kind="scope" title={title} eyebrow={eyebrow} lede={lede || s.lede[locale]} tone="soft">
      <div className="pv-scope">
        {tiers.map(tier => {
          const items = s.items.filter(i => i.tier === tier);
          if (!items.length) return null;
          const Icon = TIER_ICON[tier];
          return (
            <div key={tier} className="pv-scope-col" data-tier={tier}>
              <h3>
                <Icon aria-hidden="true" />
                {TIER_LABEL[tier][locale]}
              </h3>
              <p className="pv-scope-note">{TIER_NOTE[tier][locale]}</p>
              <ul role="list">
                {items.map((item, i) => (
                  <li key={i} data-motion-card="">
                    <strong>{item.title[locale]}</strong>
                    <span>{item.body[locale]}</span>
                    {item.shot && <ProScreen refId={item.shot} size="thumb" caption={false} open={box.open} />}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
      {box.node}
    </SectionShell>
  );
}

/* -------------------------------------------------------------------- cta */

export function CtaSection({ s, title, lede, department, pageKey }: SectionProps<'cta'>) {
  const locale = useLocale();
  const ask = useAskDemo();
  return (
    <section className="pv-sec pv-cta" id={`pv-${s.id}`} aria-labelledby={`pv-${s.id}-title`}>
      <div className="dp-wrap">
        <div>
          <p className="pv-eyebrow">{C.ctaTitle[locale]}</p>
          <h2 id={`pv-${s.id}-title`}>{title}</h2>
          <p>{lede || s.body[locale]}</p>
        </div>
        <Button size="lg" onClick={() => ask({ department, topic: pageKey, interest: s.interest[locale] })}>
          {C.bookDemo[locale]}
        </Button>
      </div>
    </section>
  );
}

