import { useLocale, localizeTree } from "@/lib/i18n";
import { useEffect, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";

import navigation from "@/content/site/navigation.json";
import { Button } from "@/components/ui/button";
import LanguageSwitch from "@/components/LanguageSwitch";
import { focusLeadForm } from './LeadCapturePanel';
import AppExplorer from '@/sections/AppExplorer';
import {usePublishedRecords} from './cms/CmsNavigation';
import { useSiteConfig } from './cms/CmsContext';
const MENU = navigation;

export function DigitMark({ className = "h-8 w-8" }: { className?: string }) {
  const locale = useLocale();
  return localizeTree((
    <svg viewBox="0 0 100 100" className={className} role="img" aria-label="Digit">
      <rect x="18" y="22.5" width="40" height="13" rx="6.5" fill="var(--ink)" />
      <rect x="63" y="22.5" width="19" height="13" rx="5" fill="var(--primary)" />
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
  const nav = published.find(r=>r.kind==='navigation')?.published;
  const brand = published.find(r=>r.kind==='branding')?.published;
  const branding = useSiteConfig().branding;
  const logoAlt = locale === 'ar' ? branding.logoAltAr : branding.logoAltEn;
  const extraLinks = nav?.[locale].blocks.filter(b=>b.enabled&&b.href)??[];
  const [open, setOpen] = useState(false);
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const pathname = useRouterState({ select: s => s.location.pathname.replace(/^\/en(?=\/|$)/, "") || "/" });
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return localizeTree(<header className={`sticky top-0 z-50 transition-all duration-300 ${scrolled ? "bg-light/85 shadow-[0_8px_30px_rgba(11,31,23,0.10)] backdrop-blur-xl" : "bg-light shadow-sm"}`}>
    <div className={`mx-auto flex max-w-[1600px] items-center gap-8 px-6 max-sm:gap-2 transition-all duration-300 max-lg:px-4 ${scrolled ? "h-16 max-lg:h-14" : "h-24 max-lg:h-16"}`}>
      <Link to="/" className="flex items-center gap-2.5" dir="ltr">{branding.logoUrl ? <img src={branding.logoUrl} alt={logoAlt || 'Digit'} className={`w-auto max-w-[200px] object-contain transition-all duration-300 ${scrolled ? "h-7" : "h-9"}`} /> : <><DigitMark className={`transition-all duration-300 ${scrolled ? "h-7 w-7" : "h-9 w-9"}`} /><span className="font-archivo text-2xl font-extrabold text-ink max-lg:hidden">DIGIT</span></>}</Link>
      <nav aria-label="القائمة الرئيسية" className="flex items-center gap-7 max-lg:hidden">
        {extraLinks.map(b=><Link key={b.id} to={locale==='en'?`/en${b.href}`:b.href} className="font-semibold text-ink">{b.title}</Link>)}
        {MENU.map(item => <div key={item.href} className="group relative">
          <Link to={item.href} className={`relative flex items-center gap-1 py-2 text-[15px] font-bold transition-colors hover:text-primary ${pathname === item.href || pathname.startsWith(item.href + "/") ? "text-primary" : "text-ink"}`}>{item.label}<svg viewBox="0 0 24 24" className="h-3.5 w-3.5 transition-transform duration-300 group-hover:rotate-180" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M6 9l6 6 6-6" /></svg></Link>
          <div className="invisible absolute top-full start-0 z-50 max-h-[75vh] min-w-[240px] translate-y-2 overflow-y-auto rounded-lg bg-card p-2 opacity-0 shadow-lg transition-all duration-200 group-hover:visible group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:visible group-focus-within:translate-y-0 group-focus-within:opacity-100">
            {item.href==='/modules'?<div className="w-[600px]"><AppExplorer compact/></div>:item.children.filter((child,i,all)=>all.findIndex(c=>c.href===child.href)===i).map((child,i) => <Link key={child.href+i} to={child.href} className="block rounded-md px-4 py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-tabactive hover:text-primary">{child.label.replace('ERPNext','النظام')}</Link>)}
          </div>
        </div>)}
      </nav>
      <div className="ms-auto flex items-center gap-3 max-sm:gap-1"><LanguageSwitch /><Button size="lg" onClick={focusLeadForm}>{brand?.[locale].title || (locale==='ar'?'احجز ديمو Digit':'Book Digit demo')}</Button><Button variant="ghost" size="icon" className="lg:hidden" aria-label="القائمة" onClick={() => setOpen(true)}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M4 7h16M4 12h16M4 17h16" /></svg></Button></div>
    </div>
    {open && <div className="fixed inset-0 z-[60] lg:hidden"><div className="absolute inset-0 bg-ink/40" onClick={() => setOpen(false)} /><div className="absolute inset-y-0 start-0 flex w-80 max-w-[85vw] flex-col overflow-y-auto bg-light p-5 shadow-xl">
      <div className="mb-4 flex items-center justify-between">{branding.logoUrl ? <img src={branding.logoUrl} alt={logoAlt || 'Digit'} className="h-8 w-auto max-w-[160px] object-contain" /> : <DigitMark />}<Button variant="ghost" size="icon" aria-label="إغلاق" onClick={() => setOpen(false)}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M6 6l12 12M18 6L6 18" /></svg></Button></div>
      {extraLinks.map(b=><Link key={b.id} to={locale==='en'?`/en${b.href}`:b.href} onClick={()=>setOpen(false)} className="py-3 font-semibold">{b.title}</Link>)}
      {MENU.map((item,i) => <div key={item.href} className="border-b border-dline"><Button variant="ghost" className="h-auto w-full justify-between py-3.5 text-[15px] font-bold text-ink" aria-expanded={openIdx===i} onClick={() => setOpenIdx(openIdx===i?null:i)}>{item.label}<svg viewBox="0 0 24 24" className={openIdx===i?"rotate-180":""} fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M6 9l6 6 6-6" /></svg></Button>{openIdx===i && <div className="pb-3"><Link to={item.href} onClick={() => setOpen(false)} className="block py-1.5 ps-3 text-sm font-semibold text-primary">{item.label} — الكل</Link>{item.children.map((c,j) => <Link key={c.href+j} to={c.href} onClick={() => setOpen(false)} className="block py-1.5 ps-3 text-sm text-body2">{c.label}</Link>)}</div>}</div>)}
      <Button size="lg" className="mt-5" onClick={()=>{setOpen(false);focusLeadForm()}}>{locale==='ar'?'احجز ديمو Digit':'Book Digit demo'}</Button>
    </div></div>}
  </header>, locale);
}
