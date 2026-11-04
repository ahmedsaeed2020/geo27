import { ArrowLeft, ArrowRight, Lock } from 'lucide-react';
import { NavLink } from '@/components/nav/nav-links';
import ShotFrame from '@/components/product/ShotFrame';
import { Button } from '@/components/ui/button';
import type { Shot } from '@/content/product-shots';
import type { HrHeroVariant, HrModuleContent, L } from '@/content/hr/hr-modules';
import type { Locale } from '@/lib/i18n';
import { useScreenLightbox } from './HrScreens';
import { HR_COPY as C } from './hr-copy';

type ArtProps = { nodes: L[]; center: L | null; shots: Shot[]; locale: Locale; open: (i: number) => void };
const t = (x: L, l: Locale) => x[l];

/** Core HR: the employee record at the centre, its four relationships orbiting the real Employee 360 screen. */
function Constellation({ nodes, center, shots, locale, open }: ArtProps) {
  return (
    <div className="hr-art" data-art="constellation">
      <span className="hr-orbit-ring" aria-hidden="true" />
      {shots[0] && (
        <div className="hr-art-lead">
          <ShotFrame shot={shots[0]} size="lead" onOpen={() => open(0)} />
        </div>
      )}
      <ul role="list" className="hr-orbit-nodes">
        {nodes.map((n, i) => (
          <li key={i} data-pos={i}>
            {t(n, locale)}
          </li>
        ))}
      </ul>
      {center && <span className="hr-orbit-center">{t(center, locale)}</span>}
    </div>
  );
}

/** Talent: a numbered path from requisition to succession above the candidate screens. */
function Journey({ nodes, shots, locale, open }: ArtProps) {
  return (
    <div className="hr-art" data-art="journey">
      <ol role="list" className="hr-path">
        {nodes.map((n, i) => (
          <li key={i}>
            <span className="hr-path-no" dir="ltr">
              {String(i + 1).padStart(2, '0')}
            </span>
            <span>{t(n, locale)}</span>
          </li>
        ))}
      </ol>
      <div className="hr-stack">
        {shots.map((s, i) => (
          <div key={s.id} className="hr-stack-item" data-layer={i}>
            <ShotFrame shot={s} size={i === 0 ? 'lead' : 'card'} caption={i === 0} onOpen={() => open(i)} />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Workforce: a day ruler of the operating steps beside the real shift schedule. */
function Schedule({ nodes, shots, locale, open }: ArtProps) {
  return (
    <div className="hr-art" data-art="schedule">
      <ol role="list" className="hr-ruler">
        {nodes.map((n, i) => (
          <li key={i}>
            <span className="hr-ruler-tick" aria-hidden="true" />
            <span>{t(n, locale)}</span>
          </li>
        ))}
      </ol>
      <div className="hr-art-lead">
        {shots[0] && <ShotFrame shot={shots[0]} size="lead" onOpen={() => open(0)} />}
        {shots[1] && (
          <div className="hr-inset">
            <ShotFrame shot={shots[1]} size="card" caption={false} onOpen={() => open(1)} />
          </div>
        )}
      </div>
    </div>
  );
}

/** Payroll: review gates the run must pass before payment, above the real readiness screen. */
function Pipeline({ nodes, shots, locale, open }: ArtProps) {
  return (
    <div className="hr-art" data-art="pipeline">
      <ol role="list" className="hr-gates">
        {nodes.map((n, i) => (
          <li key={i}>
            <span className="hr-gate-no" dir="ltr">
              {String(i + 1).padStart(2, '0')}
            </span>
            <span>{t(n, locale)}</span>
            {i < nodes.length - 1 && <Lock aria-hidden="true" />}
          </li>
        ))}
      </ol>
      {shots[0] && (
        <div className="hr-art-lead">
          <ShotFrame shot={shots[0]} size="lead" onOpen={() => open(0)} />
        </div>
      )}
    </div>
  );
}

/** Employee & Manager Experience: an illustrative service loop (no product screen exists yet), labelled as such. */
function Service({ nodes, center, locale }: ArtProps) {
  return (
    <figure className="hr-art" data-art="service">
      <div className="hr-loop">
        <span className="hr-loop-ring" aria-hidden="true" />
        <ol role="list">
          {nodes.map((n, i) => (
            <li key={i} data-pos={i}>
              <small>{i === 0 || i === 3 ? C.employeeLane[locale] : C.managerLane[locale]}</small>
              <strong>{t(n, locale)}</strong>
            </li>
          ))}
        </ol>
        <span className="hr-loop-hub">{center ? t(center, locale) : C.hub[locale]}</span>
      </div>
      <figcaption>{C.illustrative[locale]}</figcaption>
    </figure>
  );
}

/** People Intelligence: a command center layered over the report it drills into, with the drill path beside. */
function Drill({ nodes, shots, locale, open }: ArtProps) {
  return (
    <div className="hr-art" data-art="drill">
      <ol role="list" className="hr-drill">
        {nodes.map((n, i) => (
          <li key={i}>
            <span>{t(n, locale)}</span>
          </li>
        ))}
      </ol>
      <div className="hr-layers">
        {shots.map((s, i) => (
          <div key={s.id} className="hr-layer" data-layer={i}>
            <ShotFrame shot={s} size={i === 0 ? 'lead' : 'card'} caption={i === 0} onOpen={() => open(i)} />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Governance: the four access questions framed around the real setup-readiness board on a blueprint grid. */
function Blueprint({ nodes, shots, locale, open }: ArtProps) {
  return (
    <div className="hr-art" data-art="blueprint">
      <ul role="list" className="hr-questions">
        {nodes.map((n, i) => (
          <li key={i} data-pos={i}>
            <span className="hr-q-no" dir="ltr">
              Q{i + 1}
            </span>
            {t(n, locale)}
          </li>
        ))}
      </ul>
      {shots[0] && (
        <div className="hr-art-lead">
          <ShotFrame shot={shots[0]} size="lead" onOpen={() => open(0)} />
        </div>
      )}
    </div>
  );
}

const ART: Record<HrHeroVariant, (p: ArtProps) => React.ReactNode> = { constellation: Constellation, journey: Journey, schedule: Schedule, pipeline: Pipeline, service: Service, drill: Drill, blueprint: Blueprint };

type Props = {
  variant: HrHeroVariant;
  source: HrModuleContent;
  headline: string;
  lede: string;
  crumb: string;
  shots: Shot[];
  overview: string;
  productName: string;
  locale: Locale;
  onDemo: () => void;
};

export default function HrHero({ variant, source, headline, lede, crumb, shots, overview, productName, locale, onDemo }: Props) {
  const box = useScreenLightbox(shots);
  const Art = ART[variant];
  const Arrow = locale === 'ar' ? ArrowLeft : ArrowRight;
  return (
    <section className="hr-hero" data-variant={variant}>
      <div className="dp-wrap">
        <nav aria-label={C.crumbs[locale]} className="dp-crumbs">
          <ol role="list">
            <li>
              <NavLink path="/">{C.home[locale]}</NavLink>
            </li>
            <li>
              <NavLink path={overview}>{productName}</NavLink>
            </li>
            <li aria-current="page">{crumb}</li>
          </ol>
        </nav>
        <div className="hr-hero-grid">
          <div className="hr-hero-copy">
            <p className="hr-eyebrow">
              <bdi>DIGIT HR</bdi> · <bdi>{source.name[locale]}</bdi>
            </p>
            <h1 className="hr-h1">{headline}</h1>
            {lede && <p className="hr-lede">{lede}</p>}
            <div className="hr-hero-actions">
              <Button size="lg" onClick={onDemo}>
                {C.demo[locale]}
              </Button>
              <Button asChild size="lg" variant="outline">
                <a href="#capabilities">
                  {C.explore[locale]}
                  <Arrow aria-hidden="true" />
                </a>
              </Button>
            </div>
          </div>
          <Art nodes={source.hero.nodes} center={source.hero.center} shots={shots} locale={locale} open={box.open} />
        </div>
        {source.hero.flow.length > 1 && (
          <ol role="list" className="hr-flow" aria-label={C.flow[locale]}>
            {source.hero.flow.map((x, i) => (
              <li key={i}>{t(x, locale)}</li>
            ))}
          </ol>
        )}
      </div>
      {box.node}
    </section>
  );
}
