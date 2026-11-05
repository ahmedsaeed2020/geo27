import { useRef } from 'react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import LeadCapturePanel, { focusLeadForm } from '@/components/LeadCapturePanel';
import ProductDepartments from '@/components/catalog/ProductHub';
import { NavLink } from '@/components/nav/nav-links';
import { useCmsPage } from '@/components/cms/CmsContext';
import { Button } from '@/components/ui/button';
import { photo as photoOf } from '@/content/specialist/photos';
import type { L } from '@/content/specialist/types';
import { usePageMotion } from '@/hooks/use-page-motion';
import { useLocale } from '@/lib/i18n';
import { FsmStory } from './HubStories';
import '@/specialist.css';
import '@/hubs.css';

export const FSM_HUB_COPY = {
  title: { ar: 'DIGIT FSM + ITM — الخدمة الميدانية والفحص والصيانة', en: 'DIGIT FSM + ITM — Field Service, Inspection & Maintenance' },
  description: {
    ar: 'تطبيق متخصص واحد للخدمة الميدانية والفحص والاختبار والصيانة: من العقد والموقع والجهاز إلى الزيارة والعيب وإعادة الاختبار والإغلاق المؤكد.',
    en: 'One specialist application for field service, inspection, testing and maintenance: from agreement, site and device to visit, deficiency, retest and verified closure.',
  },
} satisfies Record<string, L>;

const C = {
  home: { ar: 'الرئيسية', en: 'Home' },
  crumbs: { ar: 'مسار التنقل', en: 'Breadcrumb' },
  eyebrow: { ar: 'DIGIT FSM + ITM · تطبيق متخصص واحد', en: 'DIGIT FSM + ITM · one integrated specialist application' },
  h1: { ar: 'من العقد إلى الزيارة… تشغيل ميداني له تاريخ ومسؤول ومستند', en: 'From agreement to visit… field operations with a history, an owner and a document' },
  lede: {
    ar: 'الخدمة الميدانية وإدارة الفحص والاختبار والصيانة في تطبيق واحد: يعرف الفني ماذا سيجد، ويعرف مدير الخدمة ما تأخر، ولا يُغلق عيب قبل أن تنجح إعادة اختباره.',
    en: 'Field service and inspection, testing and maintenance in one application: the technician knows what they will find, the service manager knows what is late, and no deficiency closes before its retest passes.',
  },
  demo: { ar: 'احجز ديمو Digit', en: 'Book Digit demo' },
  areas: { ar: 'استكشف المجالات التسعة', en: 'Explore the nine areas' },
  note: { ar: 'لا توجد لقطات شاشة فعلية لهذا التطبيق على الموقع بعد؛ تُعرض الشاشات في جلسة الديمو حسب الإصدار والنطاق.', en: 'There are no real screenshots of this application on the site yet; screens are shown in a demo session per edition and scope.' },
} satisfies Record<string, L>;

/** Product hub for DIGIT FSM + ITM (/modules/fsm-itm): hero, service journey and inspection story, the nine areas, demo form. */
export default function FsmHubPage() {
  const locale = useLocale();
  const cms = useCmsPage();
  const mainRef = useRef<HTMLElement>(null);
  usePageMotion(mainRef, `fsm-hub-${locale}`);
  const pic = photoOf('fsm-rooftop-technician');
  return (
    <div className="bg-paper font-plex">
      <Header />
      <main ref={mainRef} className="dept-page" aria-label={C.h1[locale]}>
        <div className="sp-page" data-product="fsm">
          <section className="sp-hero" data-signature="timeline" data-product="fsm">
            <div className="dp-wrap">
              <nav aria-label={C.crumbs[locale]} className="dp-crumbs">
                <ol role="list">
                  <li>
                    <NavLink path="/">{C.home[locale]}</NavLink>
                  </li>
                  <li aria-current="page">DIGIT FSM + ITM</li>
                </ol>
              </nav>
              <div className="sp-hero-grid">
                <div className="sp-hero-copy">
                  <p className="sp-eyebrow">{C.eyebrow[locale]}</p>
                  <h1 className="sp-h1">{C.h1[locale]}</h1>
                  <p className="sp-hero-lede">{C.lede[locale]}</p>
                  <div className="sp-hero-actions">
                    <Button size="lg" onClick={() => focusLeadForm({ product: 'fsm' })}>
                      {C.demo[locale]}
                    </Button>
                    <Button asChild size="lg" variant="outline">
                      <a href="#ph-title-fsm">{C.areas[locale]}</a>
                    </Button>
                  </div>
                  <p className="sp-evidence-note">{C.note[locale]}</p>
                </div>
                <div className="sp-hero-art">
                  {pic && <img className="sp-hero-photo" src={pic.src} width={pic.width} height={pic.height} alt={pic.alt[locale]} fetchPriority="high" decoding="async" />}
                </div>
              </div>
            </div>
          </section>
        </div>
        <FsmStory />
        <ProductDepartments product="fsm" />
        {cms?.formEnabled !== false && <LeadCapturePanel interest="DIGIT FSM + ITM" product="fsm" />}
      </main>
      <SectionRail rootRef={mainRef} pageKey={`fsm-hub-${locale}`} />
      <Footer />
    </div>
  );
}
