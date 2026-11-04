import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { useRouterState } from '@tanstack/react-router';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import ShotFrame from '@/components/product/ShotFrame';
import ShotLightbox from '@/components/product/ShotLightbox';
import { focusLeadForm } from '@/components/LeadCapturePanel';
import { NavLink } from '@/components/nav/nav-links';
import { departmentAnchor, type L, type ProductKey, type ResolvedDepartment, type ResolvedFamily } from '@/content/catalog';
import { SHOTS, type Shot } from '@/content/product-shots';
import { proWorkspacesOf } from '@/content/pro/pro-pages';
import { useLocale, type Locale } from '@/lib/i18n';
import { useCatalog } from './useCatalog';
import '@/product-proof.css';

/** The department card a menu link pointed at (client-side hash changes do not update :target). */
function useTargetId(): string {
  return useRouterState({ select: s => s.location.hash.replace(/^#/, '') });
}

const COPY = {
  proEyebrow: { ar: 'أقسام DIGIT Pro', en: 'DIGIT Pro departments' },
  proTitle: { ar: 'أقسام مترابطة… في دورة مالية وتشغيلية واحدة', en: 'Connected departments… one financial and operational cycle' },
  hrEyebrow: { ar: 'مجالات DIGIT HR', en: 'DIGIT HR areas' },
  hrTitle: { ar: 'مجالات مترابطة… في دورة الموظف والقوى العاملة', en: 'Connected areas… across the employee and workforce lifecycle' },
  conEyebrow: { ar: 'أقسام DIGIT Construction', en: 'DIGIT Construction departments' },
  conTitle: { ar: 'أقسام مترابطة… في رحلات المشروع والعقود والتكلفة', en: 'Connected departments… across project, contract and cost journeys' },
  explore: { ar: 'تفاصيل القسم', en: 'Explore the department' },
  exploreArea: { ar: 'تفاصيل المجال', en: 'Explore the area' },
  walkthrough: { ar: 'اطلب جولة على هذا القسم', en: 'Request a walkthrough of this department' },
  walkthroughArea: { ar: 'اطلب جولة على هذا المجال', en: 'Request a walkthrough of this area' },
  across: { ar: 'عبر الأقسام', en: 'Across departments' },
  foundation: { ar: 'الأساس المشترك', en: 'Shared foundation' },
  screens: { ar: 'اختر القسم', en: 'Choose a department' },
  workspaces: { ar: 'مساحات العمل في هذا القسم', en: 'Workspaces in this department' },
} satisfies Record<string, L>;

/** Construction journeys: commercial set-up, site execution and supply, then cost control and close. */
const CONSTRUCTION_LANES: { id: string; label: L; ids: string[] }[] = [
  { id: 'commercial', label: { ar: 'التخطيط والتعاقد', en: 'Plan and contract' }, ids: ['portfolio', 'estimating', 'contracts-claims'] },
  { id: 'execution', label: { ar: 'التنفيذ والتوريد', en: 'Execute and supply' }, ids: ['projects', 'subcontractors', 'procurement', 'resources'] },
  { id: 'control', label: { ar: 'التكلفة والإقفال', en: 'Control cost and close' }, ids: ['budget-cost', 'financial-closeout'] },
];

function DeptAction({ family, d, locale, area = false }: { family: ResolvedFamily; d: ResolvedDepartment; locale: Locale; area?: boolean }) {
  const Arrow = locale === 'ar' ? ArrowLeft : ArrowRight;
  if (d.live)
    return (
      <NavLink path={d.path} className="ph-link">
        {(area ? COPY.exploreArea : COPY.explore)[locale]}
        <Arrow aria-hidden="true" />
      </NavLink>
    );
  return (
    <button type="button" className="ph-link" onClick={() => focusLeadForm({ product: family.key, department: d.id })}>
      {(area ? COPY.walkthroughArea : COPY.walkthrough)[locale]}
    </button>
  );
}

/** Deep links to the department page's workspaces, so the hub maps all 5 × 4 Pro workspaces. */
function DeptWorkspaces({ path, locale }: { path: string; locale: Locale }) {
  const spaces = proWorkspacesOf(path);
  if (!spaces.length) return null;
  return (
    <nav className="ph-ws" aria-label={COPY.workspaces[locale]}>
      <p className="ph-label">{COPY.workspaces[locale]}</p>
      <ol role="list">
        {spaces.map((w, i) => (
          <li key={w.id}>
            <NavLink path={path} hash={`pv-${w.id}`} className="ph-ws-link">
              <span className="ph-no" dir="ltr">{String(i + 1).padStart(2, '0')}</span>
              <span>{w.title[locale]}</span>
            </NavLink>
          </li>
        ))}
      </ol>
    </nav>
  );
}

function ProCycle({ family, locale }: { family: ResolvedFamily; locale: Locale }) {
  const depts = family.departments;
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState<number | null>(null);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const current = depts[active];
  const shot: Shot | undefined = current?.shot ? SHOTS[current.shot] : undefined;
  const extras = useMemo(() => family.extras.map(x => ({ ...x, s: x.shot ? SHOTS[x.shot] : undefined })), [family.extras]);
  const target = useTargetId();
  useEffect(() => {
    const i = depts.findIndex(d => departmentAnchor(d.id) === target);
    if (i >= 0) setActive(i);
  }, [target, depts]);
  if (!current) return null;
  const onKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    const vertical = e.key === 'ArrowDown' || e.key === 'ArrowUp';
    const horizontal = e.key === 'ArrowLeft' || e.key === 'ArrowRight';
    if (!vertical && !horizontal) return;
    e.preventDefault();
    const forward = vertical ? e.key === 'ArrowDown' : e.key === (locale === 'ar' ? 'ArrowLeft' : 'ArrowRight');
    const next = (active + (forward ? 1 : -1) + depts.length) % depts.length;
    setActive(next);
    tabs.current[next]?.focus();
  };
  return (
    <>
      <div className="ph-pro">
        <div role="tablist" aria-label={COPY.screens[locale]} aria-orientation="vertical" className="ph-pro-tabs">
          {depts.map((d, i) => (
            <button
              key={d.id}
              ref={el => {
                tabs.current[i] = el;
              }}
              id={departmentAnchor(d.id)}
              type="button"
              role="tab"
              aria-selected={i === active}
              aria-controls="ph-pro-panel"
              tabIndex={i === active ? 0 : -1}
              className="ph-pro-tab"
              onClick={() => setActive(i)}
              onKeyDown={onKey}
            >
              <span className="ph-no">{String(i + 1).padStart(2, '0')}</span>
              <span>
                <strong>{d.label[locale]}</strong>
                {d.summary && <small>{d.summary[locale]}</small>}
              </span>
            </button>
          ))}
        </div>
        <div role="tabpanel" id="ph-pro-panel" aria-label={current.label[locale]} className="ph-pro-stage">
          {shot && <ShotFrame key={shot.id} shot={shot} size="lead" onOpen={() => setOpen(0)} />}
          <div className="ph-pro-foot">
            <p>{current.summary?.[locale]}</p>
            <DeptAction family={family} d={current} locale={locale} />
          </div>
          {current.live && <DeptWorkspaces path={current.path} locale={locale} />}
        </div>
      </div>
      {extras.length > 0 && (
        <div className="ph-across">
          <p className="ph-label">{COPY.across[locale]}</p>
          <ul role="list">
            {extras.map(x => (
              <li key={x.id} data-motion-card>
                <NavLink path={x.path} hash={x.hash} className="ph-across-card">
                  {x.s && (
                    <span className="ph-across-thumb" aria-hidden="true">
                      <img src={x.s.src} alt="" width={x.s.width} height={x.s.height} loading="lazy" decoding="async" />
                    </span>
                  )}
                  <span>
                    <strong>{x.label[locale]}</strong>
                    {x.summary && <small>{x.summary[locale]}</small>}
                  </span>
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      )}
      <ShotLightbox shots={shot ? [shot] : []} index={open} onIndexChange={setOpen} onClose={() => setOpen(null)} />
    </>
  );
}

function HrLifecycle({ family, locale }: { family: ResolvedFamily; locale: Locale }) {
  const target = useTargetId();
  const foundation = family.departments.filter(d => d.id === 'administration');
  const track = family.departments.filter(d => d.id !== 'administration');
  return (
    <div className="ph-hr">
      <ol role="list" className="ph-track" style={{ '--ph-steps': String(Math.max(track.length, 1)) } as CSSProperties}>
        {track.map((d, i) => (
          <li key={d.id} id={departmentAnchor(d.id)} className="ph-step" data-motion-step data-target={target === departmentAnchor(d.id) ? '' : undefined}>
            <span className="ph-step-dot" aria-hidden="true">
              {i + 1}
            </span>
            <strong>{d.label[locale]}</strong>
            <DeptAction family={family} d={d} locale={locale} area />
          </li>
        ))}
      </ol>
      {foundation.map(d => (
        <div key={d.id} id={departmentAnchor(d.id)} className="ph-foundation" data-target={target === departmentAnchor(d.id) ? '' : undefined}>
          <span className="ph-label">{COPY.foundation[locale]}</span>
          <strong>{d.label[locale]}</strong>
          <DeptAction family={family} d={d} locale={locale} area />
        </div>
      ))}
    </div>
  );
}

function ConstructionJourneys({ family, locale }: { family: ResolvedFamily; locale: Locale }) {
  const target = useTargetId();
  const placed = new Set(CONSTRUCTION_LANES.flatMap(l => l.ids));
  const lanes = CONSTRUCTION_LANES.map((lane, i) => ({
    ...lane,
    depts: [...family.departments.filter(d => lane.ids.includes(d.id)), ...(i === CONSTRUCTION_LANES.length - 1 ? family.departments.filter(d => !placed.has(d.id)) : [])],
  })).filter(l => l.depts.length);
  let n = 0;
  return (
    <div className="ph-con">
      {lanes.map((lane, li) => (
        <section key={lane.id} className="ph-lane" aria-labelledby={`ph-lane-${lane.id}`} data-motion-card>
          <h3 id={`ph-lane-${lane.id}`}>
            <span className="ph-no">{String(li + 1).padStart(2, '0')}</span>
            {lane.label[locale]}
          </h3>
          <ol role="list">
            {lane.depts.map(d => {
              n += 1;
              return (
                <li key={d.id} id={departmentAnchor(d.id)} className="ph-node" data-target={target === departmentAnchor(d.id) ? '' : undefined}>
                  <span className="ph-node-no" aria-hidden="true">
                    {n}
                  </span>
                  <span className="ph-node-copy">
                    <strong>{d.label[locale]}</strong>
                    <DeptAction family={family} d={d} locale={locale} />
                  </span>
                </li>
              );
            })}
          </ol>
        </section>
      ))}
    </div>
  );
}

/** Department selector for a product hub; each family has its own composition and every card is a hash target from the menu. */
export default function ProductDepartments({ product }: { product: ProductKey }) {
  const locale = useLocale();
  const family = useCatalog().find(f => f.key === product);
  if (!family || !family.departments.length) return null;
  const eyebrow = product === 'pro' ? COPY.proEyebrow : product === 'hr' ? COPY.hrEyebrow : COPY.conEyebrow;
  const title = product === 'pro' ? COPY.proTitle : product === 'hr' ? COPY.hrTitle : COPY.conTitle;
  return (
    <section className="ph" data-product={product} aria-labelledby={`ph-title-${product}`} lang={locale}>
      <div className="ph-wrap">
        <header className="ph-head">
          <p className="ph-eyebrow">
            {eyebrow[locale]} <span className="ph-count">{family.departments.length}</span>
          </p>
          <h2 id={`ph-title-${product}`} className="ph-title">
            {title[locale]}
          </h2>
          <p className="ph-summary">{family.summary[locale]}</p>
        </header>
        {product === 'pro' && <ProCycle family={family} locale={locale} />}
        {product === 'hr' && <HrLifecycle family={family} locale={locale} />}
        {product === 'construction' && <ConstructionJourneys family={family} locale={locale} />}
      </div>
    </section>
  );
}
