import { useEffect, useState, type ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useRouterState } from '@tanstack/react-router';
import { ChevronDown, Menu, X } from 'lucide-react';
import { ABOUT_LINKS, contextForPath, INDUSTRIES, MORE_SYSTEMS, PACKAGES, RESOURCE_LINKS, SERVICE_LINKS, type MenuLink } from '@/content/catalog';
import { useLocale } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import { useCatalog } from '@/components/catalog/useCatalog';
import { useDemoRequest } from './MegaMenu';
import { NAV_COPY, NavLink } from './nav-links';

function Section({ id, title, eyebrow, open, onToggle, children }: { id: string; title: string; eyebrow?: string; open: boolean; onToggle: () => void; children: ReactNode }) {
  return (
    <section className="mnav-section" data-open={open ? '' : undefined}>
      <h2>
        <button type="button" className="mnav-toggle" aria-expanded={open} aria-controls={`mnav-${id}`} onClick={onToggle}>
          <span>
            {eyebrow && (
              <small dir="ltr" className="mnav-eyebrow">
                {eyebrow}
              </small>
            )}
            {title}
          </span>
          <ChevronDown aria-hidden="true" />
        </button>
      </h2>
      <div id={`mnav-${id}`} className="mnav-body" hidden={!open}>
        {children}
      </div>
    </section>
  );
}

function Links({ title, links, close }: { title?: string; links: MenuLink[]; close: () => void }) {
  const locale = useLocale();
  return (
    <>
      {title && <p className="mnav-label">{title}</p>}
      <ul role="list" className="mnav-links">
        {links.map(l => (
          <li key={l.path + (l.hash ?? '') + l.label.ar}>
            <NavLink path={l.path} hash={l.hash} onClick={close}>
              {l.label[locale]}
            </NavLink>
          </li>
        ))}
      </ul>
    </>
  );
}

/** Mobile and tablet navigation: a side sheet with one accordion per top-level group (Escape and the close button dismiss it). */
export function MobileNav({ extra, demoLabel }: { extra?: (close: () => void) => ReactNode; demoLabel: string }) {
  const locale = useLocale();
  const families = useCatalog();
  const pathname = useRouterState({ select: s => s.location.pathname });
  const active = contextForPath(pathname).product;
  const [open, setOpen] = useState(false);
  const [section, setSection] = useState<string | null>(active || null);
  const demo = useDemoRequest();
  useEffect(() => setOpen(false), [pathname]);
  const close = () => setOpen(false);
  const toggle = (id: string) => setSection(section === id ? null : id);

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <Button variant="ghost" size="icon" className="mnav-trigger" aria-label={NAV_COPY.menu[locale]}>
          <Menu aria-hidden="true" />
        </Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="mnav-overlay" />
        <Dialog.Content className="mnav" dir={locale === 'ar' ? 'rtl' : 'ltr'} lang={locale} aria-describedby={undefined}>
          <div className="mnav-head">
            <Dialog.Title className="mnav-title">
              <NavLink path="/" onClick={close}>
                DIGIT
              </NavLink>
            </Dialog.Title>
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon" aria-label={NAV_COPY.close[locale]}>
                <X aria-hidden="true" />
              </Button>
            </Dialog.Close>
          </div>
          <nav aria-label={NAV_COPY.mainNav[locale]} className="mnav-scroll">
            {extra?.(close)}
            {families.map(f => (
              <Section key={f.key} id={f.key} title={f.nav[locale]} eyebrow={f.name[locale]} open={section === f.key} onToggle={() => toggle(f.key)}>
                <NavLink path={f.overview} className="mnav-overview" onClick={close}>
                  {NAV_COPY.overview[locale]} {f.name[locale]}
                </NavLink>
                <p className="mnav-summary">{f.summary[locale]}</p>
                <p className="mnav-label">{f.groupLabel[locale]}</p>
                <ol role="list" className="mnav-links mnav-depts">
                  {(f.key === 'pos' ? f.solutions.map(s => ({ ...s, href: s.path, hash: undefined as string | undefined })) : f.departments).map(d => (
                    <li key={d.id}>
                      <NavLink path={d.href} hash={d.hash} onClick={close}>
                        {d.label[locale]}
                      </NavLink>
                    </li>
                  ))}
                </ol>
                {f.extras.length > 0 && <Links title={f.key === 'pro' ? NAV_COPY.crossDept[locale] : NAV_COPY.industries[locale]} links={f.extras} close={close} />}
              </Section>
            ))}
            <Section id="systems" title={NAV_COPY.systems[locale]} open={section === 'systems'} onToggle={() => toggle('systems')}>
              <Links title={NAV_COPY.moreSystems[locale]} links={MORE_SYSTEMS} close={close} />
              <Links title={NAV_COPY.packages[locale]} links={PACKAGES} close={close} />
              <Links title={NAV_COPY.industries[locale]} links={INDUSTRIES} close={close} />
              <Links title={NAV_COPY.services[locale]} links={SERVICE_LINKS} close={close} />
            </Section>
            <Section id="about" title={NAV_COPY.about[locale]} open={section === 'about'} onToggle={() => toggle('about')}>
              <Links links={ABOUT_LINKS} close={close} />
            </Section>
            <Section id="resources" title={NAV_COPY.resources[locale]} open={section === 'resources'} onToggle={() => toggle('resources')}>
              <Links links={RESOURCE_LINKS} close={close} />
            </Section>
          </nav>
          <div className="mnav-foot">
            <Button
              size="lg"
              className="w-full"
              onClick={() => {
                close();
                // Let the sheet release focus and scrolling before moving to the form.
                window.setTimeout(() => demo(), 60);
              }}
            >
              {demoLabel}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
