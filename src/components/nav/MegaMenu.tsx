import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import { useNavigate, useRouterState } from '@tanstack/react-router';
import { ArrowLeft, ArrowRight, ChevronDown } from 'lucide-react';
import {
  ABOUT_LINKS,
  contextForPath,
  EXPLORE_BY_PROBLEM,
  EXPLORE_BY_ROLE,
  EXPLORE_BY_ROLE_SPECIALIST,
  INDUSTRIES,
  MORE_SYSTEMS,
  PACKAGES,
  RESOURCE_LINKS,
  SERVICE_LINKS,
  type MenuLink,
  type ProductKey,
  type ResolvedDepartment,
  type ResolvedFamily,
} from '@/content/catalog';
import { screenById } from '@/content/screens';
import { localeHref, useLocale, type Locale } from '@/lib/i18n';
import { focusLeadForm } from '@/components/LeadCapturePanel';
import { Button } from '@/components/ui/button';
import { useCatalog } from '@/components/catalog/useCatalog';
import { NAV_COPY, NavLink } from './nav-links';
import { departmentIcon, FAMILY_VISUAL } from './nav-visuals';

type TopKey = 'about' | ProductKey | 'systems' | 'resources';

/** Specialist applications share one explore-by-role row (the DIGIT Pro row stays as it was). */
const SPECIALIST = new Set<ProductKey>(['construction', 'crm', 'fsm', 'pos']);

/** Opens the page's demo form with the product context, or the demo page when this page has none. */
export function useDemoRequest() {
  const navigate = useNavigate();
  const locale = useLocale();
  return (product?: string, department?: string) => {
    // Without an explicit product the form keeps the page's own product/department context.
    const context = product === undefined ? undefined : { product, department: department ?? '' };
    if (!focusLeadForm(context)) void navigate({ to: localeHref('/demo', locale) });
  };
}

function countLabel(family: ResolvedFamily, locale: Locale): string {
  if (family.key === 'pos') return `${family.solutions.length} ${NAV_COPY.solutions[locale]}`;
  const n = family.departments.length;
  return `${n} ${(family.key === 'hr' ? NAV_COPY.areas : NAV_COPY.departments)[locale]}`;
}

const Arrow = ({ locale }: { locale: Locale }) => (locale === 'ar' ? <ArrowLeft aria-hidden="true" /> : <ArrowRight aria-hidden="true" />);

function LinkList({ title, links, close }: { title?: string; links: MenuLink[]; close: () => void }) {
  const locale = useLocale();
  return (
    <div className="mm-col">
      {title && <p className="mm-label">{title}</p>}
      <ul role="list" className="mm-links">
        {links.map(l => (
          <li key={l.path + (l.hash ?? '') + l.label.ar}>
            <NavLink path={l.path} hash={l.hash} onClick={close}>
              <span>{l.label[locale]}</span>
              {l.summary && <small>{l.summary[locale]}</small>}
            </NavLink>
          </li>
        ))}
      </ul>
    </div>
  );
}

function DepartmentLink({ d, onPreview, close, current }: { d: ResolvedDepartment; onPreview: () => void; close: () => void; current: boolean }) {
  const locale = useLocale();
  const Icon = departmentIcon(d.product, d.id);
  return (
    <li>
      <NavLink path={d.href} hash={d.hash} className="mm-dept" onClick={close} onFocus={onPreview} onMouseEnter={onPreview} aria-current={current ? 'page' : undefined} data-live={d.live ? '' : undefined}>
        <span className="mm-dept-icon" aria-hidden="true"><Icon /></span>
        <span className="mm-dept-copy">
          <span className="mm-dept-name">{d.label[locale]}</span>
          {d.summary && <span className="mm-dept-sum">{d.summary[locale]}</span>}
        </span>
      </NavLink>
    </li>
  );
}

function ProductPanel({ family, close }: { family: ResolvedFamily; close: () => void }) {
  const locale = useLocale();
  const pathname = useRouterState({ select: s => s.location.pathname.replace(/^\/en(?=\/|$)/, '') || '/' });
  const demo = useDemoRequest();
  const [shotId, setPreviewId] = useState(family.shot ?? '');
  // The previous real screen stays underneath while the next one crossfades in.
  const [prevId, setPrevId] = useState<string | null>(null);
  const setShotId = (id: string) => {
    if (id === shotId) return;
    setPrevId(shotId || null);
    setPreviewId(id);
  };
  const shot = screenById(shotId);
  const prevShot = prevId ? screenById(prevId) : undefined;
  const list = family.key === 'pos' ? [] : family.departments;
  const visual = FAMILY_VISUAL[family.key];
  const FamilyIcon = visual.icon;
  return (
    <div className="mm-grid" data-product={family.key}>
      <div className="mm-intro">
        <span className="mm-intro-icon" aria-hidden="true"><FamilyIcon /></span>
        <p className="mm-eyebrow">{family.area[locale]}</p>
        <p className="mm-product">{family.name[locale]}</p>
        <p className="mm-summary">{family.summary[locale]}</p>
        <NavLink path={family.overview} className="mm-overview" onClick={close}>
          {NAV_COPY.overview[locale]} {family.name[locale]}
          <Arrow locale={locale} />
        </NavLink>
        {family.extras.length > 0 && (
          <div className="mm-extras">
            <p className="mm-label">{family.key === 'pro' ? NAV_COPY.crossDept[locale] : NAV_COPY.industries[locale]}</p>
            <ul role="list">
              {family.extras.map(x => (
                <li key={x.id}>
                  <NavLink path={x.path} hash={x.hash} onClick={close} onFocus={() => x.shot && setShotId(x.shot)} onMouseEnter={() => x.shot && setShotId(x.shot)}>
                    {x.label[locale]}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="mm-main">
        <p className="mm-label">
          {family.groupLabel[locale]} <span className="mm-count">{countLabel(family, locale)}</span>
        </p>
        {list.length > 0 ? (
          <ol role="list" className="mm-depts" data-dense={list.length > 6 ? '' : undefined}>
            {list.map(d => (
              <DepartmentLink key={d.id} d={d} current={pathname === d.path} close={close} onPreview={() => setShotId(d.shot ?? family.shot ?? '')} />
            ))}
          </ol>
        ) : (
          <ul role="list" className="mm-solutions">
            {family.solutions.map(s => {
              const Icon = departmentIcon(family.key, s.id);
              return (
                <li key={s.id}>
                  <NavLink path={s.path} onClick={close} aria-current={pathname === s.path ? 'page' : undefined}>
                    <span className="mm-dept-icon" aria-hidden="true"><Icon /></span>
                    {s.label[locale]}
                  </NavLink>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <aside className="mm-feature" aria-label={family.name[locale]}>
        {shot ? (
          <figure className="mm-shot">
            <span className="mm-shot-bar" aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
            <span className="mm-shot-body" data-fit={shot.width < 900 || shot.width / shot.height > 1.8 ? 'contain' : 'cover'}>
              {prevShot && prevShot.id !== shot.id && (
                <img key={`prev-${prevShot.id}`} className="mm-shot-prev" src={prevShot.src} width={prevShot.width} height={prevShot.height} alt="" aria-hidden="true" decoding="async" onAnimationEnd={() => setPrevId(null)} />
              )}
              <img key={shot.id} className="mm-shot-next" src={shot.src} width={shot.width} height={shot.height} alt={shot.caption[locale]} loading="lazy" decoding="async" />
            </span>
            <figcaption>
              <small>{NAV_COPY.realScreen[locale]}</small>
              <span key={shot.id} className="mm-cap">{shot.caption[locale]}</span>
            </figcaption>
          </figure>
        ) : (
          <div className="mm-brand" data-product={family.key}>
            {visual.photo.src && <img className="mm-brand-photo" src={visual.photo.src} alt="" loading="lazy" decoding="async" />}
            <span className="mm-brand-icon" aria-hidden="true"><FamilyIcon /></span>
            <p className="mm-brand-title">
              {NAV_COPY.walkthrough[locale]} <bdi>{family.name[locale]}</bdi>
            </p>
            <p className="mm-brand-body">{NAV_COPY.walkthroughBody[locale]}</p>
            <Button
              onClick={() => {
                close();
                demo(family.key);
              }}
            >
              {NAV_COPY.demo[locale]}
            </Button>
          </div>
        )}
      </aside>

      {family.key === 'pro' && (
        <div className="mm-foot">
          <ExploreRow title={NAV_COPY.byRole[locale]} links={EXPLORE_BY_ROLE} close={close} />
          <ExploreRow title={NAV_COPY.byProblem[locale]} links={EXPLORE_BY_PROBLEM} close={close} />
        </div>
      )}
      {SPECIALIST.has(family.key) && (
        <div className="mm-foot">
          <ExploreRow title={NAV_COPY.byRole[locale]} links={EXPLORE_BY_ROLE_SPECIALIST} close={close} />
        </div>
      )}
    </div>
  );
}

function ExploreRow({ title, links, close }: { title: string; links: MenuLink[]; close: () => void }) {
  const locale = useLocale();
  return (
    <div className="mm-explore">
      <span className="mm-label">{title}</span>
      <ul role="list">
        {links.map(l => (
          <li key={l.path + l.label.ar}>
            <NavLink path={l.path} onClick={close}>
              {l.label[locale]}
            </NavLink>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SystemsPanel({ families, close }: { families: ResolvedFamily[]; close: () => void }) {
  const locale = useLocale();
  return (
    <div className="mm-systems">
      <ul role="list" className="mm-families">
        {families.map(f => {
          const Icon = FAMILY_VISUAL[f.key].icon;
          return (
          <li key={f.key}>
            <NavLink path={f.overview} className="mm-family" onClick={close}>
              <span className="mm-family-icon" aria-hidden="true"><Icon /></span>
              <span className="mm-eyebrow">{f.area[locale]}</span>
              <span className="mm-product">{f.name[locale]}</span>
              <span className="mm-summary">{f.summary[locale]}</span>
              <span className="mm-count">{countLabel(f, locale)}</span>
            </NavLink>
          </li>
          );
        })}
      </ul>
      <div className="mm-columns">
        <LinkList title={NAV_COPY.moreSystems[locale]} links={MORE_SYSTEMS} close={close} />
        <LinkList title={NAV_COPY.packages[locale]} links={PACKAGES} close={close} />
        <LinkList title={NAV_COPY.industries[locale]} links={INDUSTRIES} close={close} />
        <LinkList title={NAV_COPY.services[locale]} links={SERVICE_LINKS} close={close} />
      </div>
    </div>
  );
}

function TopItem({
  id,
  label,
  eyebrow,
  path,
  open,
  active,
  compact,
  onOpen,
  onToggle,
  register,
  children,
}: {
  id: TopKey;
  label: string;
  eyebrow?: string;
  path: string;
  open: boolean;
  active: boolean;
  compact?: boolean;
  onOpen: () => void;
  onToggle: () => void;
  register: (el: HTMLButtonElement | null) => void;
  children: ReactNode;
}) {
  const locale = useLocale();
  const panelId = `mm-panel-${id}-${useId().replace(/:/g, '')}`;
  const panelRef = useRef<HTMLDivElement>(null);
  const onKeyDown = (e: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (e.key !== 'ArrowDown') return;
    e.preventDefault();
    onOpen();
    requestAnimationFrame(() => panelRef.current?.querySelector<HTMLElement>('a,button')?.focus());
  };
  return (
    <div className="mm-item" data-compact={compact ? '' : undefined} data-open={open ? '' : undefined} data-active={active ? '' : undefined} onMouseEnter={onOpen}>
      <NavLink path={path} className="mm-top">
        {eyebrow && <span className="mm-top-eyebrow">{eyebrow}</span>}
        <span className="mm-top-label">{label}</span>
      </NavLink>
      <button
        ref={register}
        type="button"
        className="mm-trigger"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={`${NAV_COPY.openMenu[locale]} ${label}`}
        onClick={onToggle}
        onKeyDown={onKeyDown}
        onFocus={e => {
          if (e.currentTarget.matches(':focus-visible')) onOpen();
        }}
      >
        <ChevronDown aria-hidden="true" />
      </button>
      <div ref={panelRef} id={panelId} className="mm-panel" hidden={!open}>
        <div className="mm-panel-inner">{children}</div>
      </div>
    </div>
  );
}

/** Desktop header navigation: product-led Mega Menu with hover, click and keyboard (Escape, ArrowDown) support. */
export function DesktopNav({ extra }: { extra?: ReactNode }) {
  const locale = useLocale();
  const families = useCatalog();
  const pathname = useRouterState({ select: s => s.location.pathname });
  const bare = pathname.replace(/^\/en(?=\/|$)/, '') || '/';
  const activeProduct = contextForPath(bare).product;
  const [open, setOpen] = useState<TopKey | null>(null);
  const navRef = useRef<HTMLElement>(null);
  const triggers = useRef<Partial<Record<TopKey, HTMLButtonElement | null>>>({});
  const timer = useRef<number | undefined>(undefined);
  const previous = useRef<TopKey | null>(null);
  const order: TopKey[] = ['about', ...families.map(f => f.key), 'systems', 'resources'];

  useEffect(() => setOpen(null), [pathname]);

  // Switching from one open panel to another slides the new family in from the side it sits on (set before paint).
  useLayoutEffect(() => {
    const nav = navRef.current;
    const from = previous.current;
    previous.current = open;
    if (!nav) return;
    if (open && from && from !== open) {
      nav.setAttribute('data-switch', '');
      nav.style.setProperty('--mm-dir', String(order.indexOf(open) > order.indexOf(from) ? 1 : -1));
    } else nav.removeAttribute('data-switch');
  });

  // The active indicator glides to the item under the pointer or focus, and rests on the open or current product.
  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const rest = () => (open && nav.querySelector<HTMLElement>(`.mm-item[data-open]`)) || nav.querySelector<HTMLElement>('.mm-item[data-active]:not([data-compact])');
    const move = (item: HTMLElement | null) => {
      const label = item?.querySelector<HTMLElement>('.mm-top-label');
      if (!label) { nav.removeAttribute('data-indicator'); return; }
      const box = nav.getBoundingClientRect();
      const r = label.getBoundingClientRect();
      nav.style.setProperty('--mm-ix', `${(r.left - box.left).toFixed(1)}px`);
      nav.style.setProperty('--mm-iy', `${(r.bottom - box.top + 5).toFixed(1)}px`);
      nav.style.setProperty('--mm-iw', `${r.width.toFixed(1)}px`);
      nav.setAttribute('data-indicator', '');
    };
    const onOver = (e: Event) => move((e.target as HTMLElement).closest<HTMLElement>('.mm-item') ?? rest());
    const onLeave = () => move(rest());
    move(rest());
    nav.addEventListener('mouseover', onOver);
    nav.addEventListener('focusin', onOver);
    nav.addEventListener('mouseleave', onLeave);
    window.addEventListener('resize', onLeave);
    return () => {
      nav.removeEventListener('mouseover', onOver);
      nav.removeEventListener('focusin', onOver);
      nav.removeEventListener('mouseleave', onLeave);
      window.removeEventListener('resize', onLeave);
    };
  }, [open, activeProduct, locale, families.length]);
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!navRef.current?.contains(e.target as Node)) setOpen(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const key = open;
      setOpen(null);
      triggers.current[key]?.focus();
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const hoverOpen = (key: TopKey) => {
    window.clearTimeout(timer.current);
    if (open) setOpen(key);
    else timer.current = window.setTimeout(() => setOpen(key), 90);
  };
  const hoverLeave = () => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setOpen(null), 200);
  };
  const close = () => setOpen(null);
  const item = (key: TopKey) => ({
    id: key,
    open: open === key,
    onOpen: () => hoverOpen(key),
    onToggle: () => setOpen(open === key ? null : key),
    register: (el: HTMLButtonElement | null) => {
      triggers.current[key] = el;
    },
  });

  return (
    <nav
      ref={navRef}
      aria-label={NAV_COPY.mainNav[locale]}
      className="mm-nav"
      onMouseLeave={hoverLeave}
      onMouseEnter={() => window.clearTimeout(timer.current)}
      onBlur={e => {
        if (!navRef.current?.contains(e.relatedTarget as Node | null)) setOpen(null);
      }}
    >
      <span className="mm-indicator" aria-hidden="true" />
      {extra}
      <TopItem {...item('about')} label={NAV_COPY.about[locale]} path="/about-4" active={bare === '/about-4'} compact>
        <LinkList links={ABOUT_LINKS} close={close} />
      </TopItem>
      {families.map(f => (
        <TopItem key={f.key} {...item(f.key)} label={f.nav[locale]} eyebrow={f.name[locale]} path={f.overview} active={activeProduct === f.key}>
          <ProductPanel family={f} close={close} />
        </TopItem>
      ))}
      <TopItem {...item('systems')} label={NAV_COPY.systems[locale]} path="/modules" active={!activeProduct && /^\/(modules|industries|services-3|starter|pricing)(\/|$)/.test(bare)}>
        <SystemsPanel families={families} close={close} />
      </TopItem>
      <TopItem {...item('resources')} label={NAV_COPY.resources[locale]} path="/resources" active={/^\/(resources|faq|support)(\/|$)/.test(bare)} compact>
        <LinkList links={RESOURCE_LINKS} close={close} />
      </TopItem>
    </nav>
  );
}
