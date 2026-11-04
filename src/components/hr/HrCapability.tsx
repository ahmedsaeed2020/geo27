import { ChevronDown, CircleAlert, Users } from 'lucide-react';
import type { HrFeature, HrSection, L } from '@/content/hr/hr-modules';
import type { Locale } from '@/lib/i18n';
import HrScreens, { type ResolvedScreen } from './HrScreens';
import { HR_COPY as C } from './hr-copy';

export type CapVariant = 'split' | 'theater' | 'flow' | 'ledger' | 'roles';

/** Section layouts rotate so no two neighbours share a composition: screens decide split/theater, the rest rotate. */
export function capVariants(sections: { screens: number }[]): CapVariant[] {
  const quiet: CapVariant[] = ['flow', 'ledger', 'roles'];
  let q = 0;
  return sections.map(s => (s.screens > 1 ? 'theater' : s.screens === 1 ? 'split' : quiet[q++ % quiet.length]!));
}

const t = (x: L, l: Locale) => x[l];

function Cluster({ title, items, locale, kind }: { title: string; items: L[]; locale: Locale; kind: string }) {
  if (!items.length) return null;
  return (
    <div className="hr-cluster" data-kind={kind} data-motion-card>
      <h3>{title}</h3>
      <ul role="list">
        {items.map((x, i) => (
          <li key={i}>{t(x, locale)}</li>
        ))}
      </ul>
    </div>
  );
}

/** Semantic diagram built only from the section's own brief: inputs → action → outputs, with the review branch. */
function ProcessGraphic({ section, locale }: { section: HrSection; locale: Locale }) {
  const chips = (items: L[], max = 6) => (
    <ul role="list" className="hr-chips">
      {items.slice(0, max).map((x, i) => (
        <li key={i}>{t(x, locale)}</li>
      ))}
      {items.length > max && <li data-more="">+{items.length - max}</li>}
    </ul>
  );
  return (
    <figure className="hr-process">
      <ol role="list" className="hr-process-rail">
        <li className="hr-process-node" data-kind="in" data-motion-step>
          <span className="hr-process-label">{C.inputs[locale]}</span>
          {chips(section.inputs)}
        </li>
        <li className="hr-process-node" data-kind="act" data-motion-step>
          <span className="hr-process-label">{C.how[locale]}</span>
          <p>{t(section.how, locale)}</p>
        </li>
        <li className="hr-process-node" data-kind="out" data-motion-step>
          <span className="hr-process-label">{C.outputs[locale]}</span>
          {chips(section.outputs)}
        </li>
      </ol>
      {section.exceptions.length > 0 && (
        <div className="hr-process-branch" data-motion-step>
          <span className="hr-process-label">{C.exceptions[locale]}</span>
          {chips(section.exceptions)}
        </div>
      )}
      <figcaption>{C.diagram[locale]}</figcaption>
    </figure>
  );
}

function RolesBoard({ section, locale }: { section: HrSection; locale: Locale }) {
  return (
    <div className="hr-roles-board">
      <p className="hr-process-label">{C.sectionRoles[locale]}</p>
      <ul role="list">
        {section.roles.map((r, i) => (
          <li key={i} data-motion-card>
            <Users aria-hidden="true" />
            <span>{t(r, locale)}</span>
          </li>
        ))}
      </ul>
      <div className="hr-roles-how">
        <span className="hr-process-label">{C.how[locale]}</span>
        <p>{t(section.how, locale)}</p>
      </div>
    </div>
  );
}

function Ledger({ section, locale }: { section: HrSection; locale: Locale }) {
  const rows: [string, L[]][] = [
    [C.inputs[locale], section.inputs],
    [C.outputs[locale], section.outputs],
    [C.exceptions[locale], section.exceptions],
    [C.kpis[locale], section.kpis],
    [C.sectionRoles[locale], section.roles],
  ];
  return (
    <dl className="hr-ledger">
      {rows
        .filter(([, items]) => items.length)
        .map(([label, items]) => (
          <div key={label} data-motion-card>
            <dt>{label}</dt>
            <dd>{items.map(x => t(x, locale)).join(locale === 'ar' ? '، ' : ', ')}</dd>
          </div>
        ))}
    </dl>
  );
}

export type CapabilityProps = {
  section: HrSection;
  title: string;
  narrative: string;
  eyebrow: string;
  screens: ResolvedScreen[];
  variant: CapVariant;
  flip: boolean;
  index: number;
  total: number;
  features: Record<string, HrFeature>;
  screenTitles: Record<string, { title: L }>;
  locale: Locale;
};

/** One source section: problem, real screens or a semantic diagram, the process story, structured facts and the decision. */
export default function HrCapability({ section, title, narrative, eyebrow, screens, variant, flip, index, total, features, screenTitles, locale }: CapabilityProps) {
  const anchor = `cap-${section.id.replace('.', '-')}`;
  const visibleFeatures = section.features.filter(id => features[id] && !features[id].withheld);
  const visual =
    variant === 'split' || variant === 'theater' ? (
      <HrScreens screens={screens} locale={locale} id={anchor} />
    ) : variant === 'flow' ? (
      <ProcessGraphic section={section} locale={locale} />
    ) : variant === 'roles' ? (
      <RolesBoard section={section} locale={locale} />
    ) : null;
  const clusters =
    variant === 'ledger' ? null : variant === 'flow' ? (
      <div className="hr-clusters" data-count="2">
        <Cluster title={C.kpis[locale]} items={section.kpis} locale={locale} kind="kpis" />
        <Cluster title={C.sectionRoles[locale]} items={section.roles} locale={locale} kind="roles" />
      </div>
    ) : (
      <div className="hr-clusters" data-count="4">
        <Cluster title={C.inputs[locale]} items={section.inputs} locale={locale} kind="inputs" />
        <Cluster title={C.outputs[locale]} items={section.outputs} locale={locale} kind="outputs" />
        <Cluster title={C.exceptions[locale]} items={section.exceptions} locale={locale} kind="exceptions" />
        <Cluster title={C.kpis[locale]} items={section.kpis} locale={locale} kind="kpis" />
      </div>
    );
  return (
    <section
      id={anchor}
      className="hr-cap"
      data-variant={variant}
      data-flip={flip ? '' : undefined}
      data-section-id={section.id}
      data-feature-ids={section.features.join(' ')}
      data-screen-ids={section.screens.join(' ')}
      aria-labelledby={`${anchor}-title`}
    >
      <div className="dp-wrap">
        <header className="hr-cap-head">
          <p className="hr-cap-meta">
            <span className="hr-cap-no" dir="ltr">
              {String(index + 1).padStart(2, '0')} / {String(total).padStart(2, '0')}
            </span>
            <span>{eyebrow || (screens.length ? C.inProduct[locale] : C.processLogic[locale])}</span>
          </p>
          <h2 id={`${anchor}-title`}>{title}</h2>
          <p className="hr-cap-problem">{t(section.problem, locale)}</p>
        </header>
        <div className="hr-cap-body">
          {visual && <div className="hr-cap-visual">{visual}</div>}
          <div className="hr-cap-story">
            <p className="hr-cap-narrative">{narrative}</p>
            {variant !== 'flow' && variant !== 'roles' && (
              <div className="hr-cap-how">
                <h3>{C.how[locale]}</h3>
                <p>{t(section.how, locale)}</p>
              </div>
            )}
            <p className="hr-cap-outcome">
              <strong>{C.outcome[locale]}</strong>
              <span>{t(section.outcome, locale)}</span>
            </p>
            {variant === 'ledger' && <Ledger section={section} locale={locale} />}
          </div>
        </div>
        {clusters}
        <div className="hr-cap-decision" data-motion-card>
          <span>{C.decision[locale]}</span>
          <strong>{t(section.decision, locale)}</strong>
        </div>
        {section.regulated && (
          <p className="hr-cap-note" role="note">
            <CircleAlert aria-hidden="true" />
            {C.regulated[locale]}
          </p>
        )}
        <div className="hr-cap-details">
          {visibleFeatures.length > 0 && (
            <details>
              <summary>
                {C.features[locale]} <span className="hr-count">{visibleFeatures.length}</span>
                <ChevronDown aria-hidden="true" />
              </summary>
              <ul role="list">
                {visibleFeatures.map(id => (
                  <li key={id} data-feature-id={id}>
                    {t(features[id]!.text, locale)}
                  </li>
                ))}
              </ul>
            </details>
          )}
          {section.screens.length > 0 && (
            <details>
              <summary>
                {C.screens[locale]} <span className="hr-count">{section.screens.length}</span>
                <ChevronDown aria-hidden="true" />
              </summary>
              <ul role="list">
                {section.screens.map(id => (
                  <li key={id} data-screen-id={id}>
                    {screenTitles[id] ? t(screenTitles[id].title, locale) : id}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      </div>
    </section>
  );
}
