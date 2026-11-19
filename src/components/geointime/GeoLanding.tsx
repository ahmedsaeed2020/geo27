import { useRef, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { ArrowDown, ArrowLeft, ArrowRight, CalendarDays, ClipboardCheck, Clock3, Download, FileCheck2, Globe2, MapPin, Maximize2, Monitor, ShieldCheck, Users, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import ContactForm from '@/components/ContactForm';
import { useLocale } from '@/lib/i18n';
import { usePageMotion } from '@/hooks/use-page-motion';
import { GEO_COPY } from '@/content/geointime';
import arrival from '@/assets/geointime/arrival.webp.asset.json';
import manager from '@/assets/geointime/hr-manager.webp.asset.json';
import field from '@/assets/geointime/field-team.webp.asset.json';
import logo from '@/assets/geointime/logo.png.asset.json';
import screen from '@/assets/geointime/operations.png.asset.json';
import profile from '@/assets/geointime/profile.pdf.asset.json';
import '@/geointime.css';

const ESSENTIAL_ICONS = [Users, Clock3, FileCheck2, Wallet];
const OPERATIONS_ICONS = [MapPin, ClipboardCheck, ShieldCheck, Monitor];

export default function GeoLanding() {
  const locale = useLocale();
  const t = GEO_COPY[locale];
  const main = useRef<HTMLElement>(null);
  const [open, setOpen] = useState(false);
  const Arrow = locale === 'ar' ? ArrowLeft : ArrowRight;
  usePageMotion(main, `geo-${locale}`);
  const goToForm = () => {
    document.getElementById('geo-request')?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' });
    document.querySelector<HTMLInputElement>('#geo-request input[name="name"]')?.focus({ preventScroll: true });
  };
  const Request = ({ className = 'geo-cta' }: { className?: string }) => <Button className={className} onClick={goToForm}>{t.demo}<Arrow aria-hidden="true" /></Button>;
  return (
    <div className="geo-page" dir={locale === 'ar' ? 'rtl' : 'ltr'} data-form-cta-ignore>
      <main ref={main}>
        <section className="geo-hero hero" aria-labelledby="geo-title">
          <img className="geo-hero-image" src={arrival.url} width={1920} height={1088} alt={locale === 'ar' ? 'موظف ومشرف موقع في بداية يوم العمل' : 'An employee and site supervisor at the start of the working day'} fetchPriority="high" />
          <header className="geo-header geo-wrap">
            <Link to={locale === 'ar' ? '/' : '/en'} className="geo-logo" aria-label="GeoInTime"><img src={logo.url} width={2048} height={615} alt="GeoInTime" /></Link>
            <div className="geo-header-actions">
              <Button asChild variant="ghost" className="geo-language"><Link to={locale === 'ar' ? '/en' : '/'}><Globe2 aria-hidden="true" />{t.language}</Link></Button>
              <Request />
            </div>
          </header>
          <div className="geo-hero-content geo-wrap">
            <div className="geo-hero-copy">
              <div className="geo-eyebrow">{t.eyebrow}</div>
              <h1 id="geo-title">GeoInTime</h1>
              <p className="geo-hero-title">{t.hero}<span>{t.heroAccent}</span></p>
              <p className="geo-intro">{t.intro}</p>
              <div className="geo-actions"><Request /><Button asChild variant="outline" className="geo-outline"><a href={profile.url} target="_blank" rel="noreferrer"><Download aria-hidden="true" />{t.profile}</a></Button></div>
              <p className="geo-hero-note">{t.heroNote}</p>
            </div>
          </div>
          <div className="geo-journey" aria-hidden="true"><svg viewBox="0 0 500 130"><path className="geo-route" d="M5 10 C100 10 110 115 265 110 S420 30 490 30" /><circle className="geo-route-node" cx="265" cy="110" r="5" /><circle className="geo-route-ring" cx="265" cy="110" r="13" /><circle className="geo-route-node" cx="490" cy="30" r="4" /></svg></div>
          <a className="geo-scroll" href="#geo-essentials">{t.scroll}<ArrowDown size={16} aria-hidden="true" /></a>
        </section>

        <section id="geo-essentials" className="geo-block" aria-labelledby="geo-essentials-title">
          <div className="geo-wrap">
            <div className="geo-section-head"><div><div className="geo-eyebrow">01 / {t.essentialsTag}</div><h2 id="geo-essentials-title">{t.essentialsTitle}<span>{t.essentialsAccent}</span></h2></div><p>{t.essentialsIntro}</p></div>
            <div className="geo-essentials-layout">
              <div><div className="geo-feature-grid">{t.essentialsItems.map(([title, description], i) => { const Icon = ESSENTIAL_ICONS[i] ?? Users; return <article className="geo-feature" data-motion-card key={title}><div className="geo-feature-icon"><Icon aria-hidden="true" /></div><div><span className="geo-number">0{i + 1}</span><h3>{title}</h3><p>{description}</p></div></article>; })}</div><Button variant="link" className="geo-text-link" onClick={goToForm}>{t.demo}<Arrow aria-hidden="true" /></Button></div>
              <figure className="geo-people"><img src={manager.url} width={1088} height={1920} loading="lazy" alt={locale === 'ar' ? 'مسؤولة الموارد البشرية تراجع جداول العمل' : 'An HR manager reviewing workforce schedules'} /><figcaption><CalendarDays size={15} aria-hidden="true" />{t.essentials}</figcaption></figure>
            </div>
          </div>
        </section>

        <section className="geo-block geo-operations" aria-labelledby="geo-operations-title">
          <div className="geo-wrap">
            <div className="geo-operations-layout">
              <div className="geo-section-copy"><div className="geo-eyebrow">02 / {t.operationsTag}</div><h2 id="geo-operations-title">{t.operationsTitle}<span>{t.operationsAccent}</span></h2><p>{t.operationsIntro}</p><div className="geo-feature-grid">{t.operationsItems.map(([title, description], i) => { const Icon = OPERATIONS_ICONS[i] ?? Monitor; return <article className="geo-feature" data-motion-card key={title}><div className="geo-feature-icon"><Icon aria-hidden="true" /></div><div><span className="geo-number">0{i + 1}</span><h3>{title}</h3><p>{description}</p></div></article>; })}</div></div>
              <figure className="geo-people"><img src={field.url} width={1088} height={1920} loading="lazy" alt={locale === 'ar' ? 'موظف ومشرف سعودي يتابعان العمل في الموقع' : 'An employee and Saudi supervisor coordinating on site'} /></figure>
            </div>
            <ol className="geo-workflow hr-journey-rail">{t.steps.map((step, i) => <li key={step}><span>0{i + 1}</span>{step}</li>)}</ol>
            <figure className="geo-screen"><figcaption className="geo-screen-bar"><span><Monitor aria-hidden="true" />{t.screen}</span><Button variant="ghost" className="geo-enlarge" onClick={() => setOpen(true)}><Maximize2 aria-hidden="true" />{t.enlarge}</Button></figcaption><img src={screen.url} width={2180} height={1360} loading="lazy" alt={t.screen} /></figure>
            <div className="geo-sectors">{t.sectors.map(sector => <span key={sector}>{sector}</span>)}</div>
          </div>
        </section>

        <section id="geo-request" className="geo-block geo-final" aria-labelledby="geo-final-title">
          <div className="geo-wrap">
            <div className="geo-final-layout">
              <div className="geo-final-copy"><div className="geo-eyebrow">03 / {t.finalTag}</div><h2 id="geo-final-title">{t.finalTitle}<span>{t.finalAccent}</span></h2><p>{t.finalIntro}</p><div className="geo-final-orbit" aria-hidden="true"><span className="geo-orbit-core">GeoInTime</span><span className="geo-orbit-label">Workforce</span><span className="geo-orbit-label">Operations</span><span className="geo-orbit-label">Evidence</span></div><p className="geo-final-note">{t.finalNote}</p></div>
              <div className="geo-form-shell"><h3>{t.demo}</h3><ContactForm kind="demo" interest="GeoInTime" interestChoices={['GeoInTime', 'Workforce Essentials', 'Workforce Operations']} product="" department="" brand="GeoInTime" stories={false} bare /></div>
            </div>
            <footer className="geo-footer"><img src={logo.url} width={2048} height={615} alt="GeoInTime" /><p>{t.footer}</p><Link to={locale === 'ar' ? '/en' : '/'}><Globe2 size={15} aria-hidden="true" />{t.language}</Link></footer>
          </div>
        </section>
      </main>
      <Dialog open={open} onOpenChange={setOpen}><DialogContent className="geo-dialog"><DialogTitle>{t.screen}</DialogTitle><DialogDescription className="sr-only">{t.enlarge}</DialogDescription><img src={screen.url} width={2180} height={1360} alt={t.screen} /></DialogContent></Dialog>
    </div>
  );
}