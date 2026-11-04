import { useLocale, localizeTree, localeHref } from "@/lib/i18n";
import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";
import LanguageSwitch from "@/components/LanguageSwitch";
import { usePublishedRecords } from './cms/CmsNavigation';
import { useSiteConfig } from './cms/CmsContext';
import { DesktopNav, useDemoRequest } from './nav/MegaMenu';
import { MobileNav } from './nav/MobileNav';
import { NAV_COPY } from './nav/nav-links';

export function DigitMark({ className = "h-8 w-8" }: { className?: string }) {
  const locale = useLocale();
  return localizeTree((
    <svg viewBox="0 0 100 100" className={className} role="img" aria-label="Digit">
      <rect x="18" y="22.5" width="40" height="13" rx="6.5" fill="var(--ink)" />
      <rect x="63" y="22.5" width="19" height="13" rx="5" fill="var(--brand-emerald)" />
      <rect x="18" y="43.5" width="64" height="13" rx="6.5" fill="var(--ink)" />
      <rect x="18" y="64.5" width="50" height="13" rx="6.5" fill="var(--ink)" />
    </svg>
  ), locale);
}

export function DigitMarkLight({ className = "h-8 w-8" }: { className?: string }) {
  const locale = useLocale();
  return localizeTree((
    <svg viewBox="0 0 100 100" className={className} role="img" aria-label="Digit">
      <rect x="18" y="22.5" width="40" height="13" rx="6.5" fill="var(--paper)" />
      <rect x="63" y="22.5" width="19" height="13" rx="5" fill="var(--mint)" />
      <rect x="18" y="43.5" width="64" height="13" rx="6.5" fill="var(--paper)" />
      <rect x="18" y="64.5" width="50" height="13" rx="6.5" fill="var(--paper)" />
    </svg>
  ), locale);
}

export default function Header() {
  const locale = useLocale();
  const published = usePublishedRecords();
  const nav = published.find(r => r.kind === 'navigation')?.published;
  const brand = published.find(r => r.kind === 'branding')?.published;
  const branding = useSiteConfig().branding;
  const logoAlt = locale === 'ar' ? branding.logoAltAr : branding.logoAltEn;
  const extraLinks = nav?.[locale].blocks.filter(b => b.enabled && b.href) ?? [];
  const demoLabel = brand?.[locale].title || NAV_COPY.demo[locale];
  const demo = useDemoRequest();
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return (
    <header className="site-header" data-scrolled={scrolled ? "" : undefined}>
      <div className="site-header-bar">
        <Link to={localeHref("/", locale)} className="site-logo" dir="ltr" aria-label={`DIGIT — ${NAV_COPY.home[locale]}`}>
          {branding.logoUrl
            ? <img src={branding.logoUrl} alt={logoAlt || 'Digit'} className="site-logo-img" />
            : <><DigitMark className="site-logo-mark" /><span className="site-logo-word">DIGIT</span></>}
        </Link>
        <DesktopNav extra={extraLinks.map(b => <Link key={b.id} to={localeHref(b.href, locale)} className="mm-extra">{b.title}</Link>)} />
        <div className="site-header-actions">
          <LanguageSwitch />
          <Button size="lg" className="site-header-cta" onClick={() => demo()}>{demoLabel}</Button>
          <MobileNav
            demoLabel={demoLabel}
            extra={close => extraLinks.map(b => <Link key={b.id} to={localeHref(b.href, locale)} onClick={close} className="mnav-extra">{b.title}</Link>)}
          />
        </div>
      </div>
    </header>
  );
}
