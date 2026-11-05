import { useLocale, localizeTree } from "@/lib/i18n";
import { DigitMarkLight } from "./Header";
import LanguageSwitch from "@/components/LanguageSwitch";
import {Button} from './ui/button';
import {focusLeadForm} from './LeadCapturePanel';
import {usePublishedRecords} from './cms/CmsNavigation';
import { useSiteConfig } from './cms/CmsContext';

const COLS: { title: string; links: { label: string; href: string }[] }[] = [
  {
    title: "الموديولات",
    links: [
      { label: "المحاسبة", href: "/modules/accounting" },
      { label: "المبيعات", href: "/modules/sales" },
      { label: "المشتريات", href: "/modules/purchasing" },
      { label: "المخزون", href: "/modules/inventory" },
      { label: "الأصول الثابتة", href: "/modules/fixed-assets" },
    ],
  },
  {
    title: "الموديولات المتقدمة",
    links: [
      { label: "إدارة العملاء CRM", href: "/modules/crm" },
      { label: "الموارد البشرية والرواتب", href: "/modules/hr-payroll" },
      { label: "التصنيع", href: "/modules/manufacturing" },
      { label: "المشاريع", href: "/modules/projects" },
      { label: "المقاولات", href: "/modules/contracting" },
    ],
  },
  {
    title: "الخدمات",
    links: [
      { label: "تطبيق النظام", href: "/services-3/implementation" },
      { label: "الدعم", href: "/services-3/support" },
      { label: "ترحيل البيانات", href: "/services-3/data-migration" },
      { label: "التدريب", href: "/services-3/training" },
      { label: "التخصيص", href: "/services-3/customization" },
      { label: "الاستضافة", href: "/services-3/hosting" },
    ],
  },
  {
    title: "القطاعات",
    links: [
      { label: "التجزئة", href: "/industries/retail" },
      { label: "المطاعم والكافيهات", href: "/pos-solutions/restaurants-cafes" },
      { label: "الصيدليات", href: "/pos-solutions/pharmacies" },
      { label: "المقاولات", href: "/industries/contracting-industry" },
      { label: "التعليم", href: "/industries/education" },
      { label: "كل القطاعات", href: "/industries" },
    ],
  },
  {
    title: "روابط مهمة",
    links: [
      { label: "الدخول للنظام", href: "https://pro.digit-erp.com/login" },
      { label: "الدعم الفني", href: "/services-3/support" },
      { label: "الوظائف", href: "/careers" },
      { label: "الأسئلة الشائعة", href: "/faq" },
      { label: "الشروط", href: "/terms" },
      { label: "تواصل معنا", href: "/contact-4/" },
      { label: "احجز عرضًا توضيحيًا", href: "/demo-3/" },
      { label: "الشراكة", href: "/partnership/" },
    ],
  },
];

export default function Footer() {
  const locale = useLocale();
  const nav = usePublishedRecords().find(r=>r.kind==='navigation')?.published;
  const branding = useSiteConfig().branding;
  return localizeTree((
    <footer className="bg-gradient-to-b from-dark to-deep text-[rgba(244,243,238,.66)]">
      <div className="mx-auto max-w-[1240px] px-6 pt-16 pb-8">
        {/* Top CTA bar */}
        <div className="flex flex-wrap items-center justify-between gap-6 rounded-[16px] bg-gradient-to-l from-primary to-[#0b6a44] p-8 max-md:p-6">
          <div>
            <h3 className="text-[24px] font-extrabold text-white">جاهز تشوف شركتك في نظام واحد؟</h3>
            <p className="mt-2 text-[14px] text-[rgba(244,243,238,.85)]">
              ناقش نطاق العمل المناسب لمنشأتك مع فريق Digit.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button size="lg" onClick={() => focusLeadForm()}>{locale==='ar'?'احجز ديمو Digit':'Book Digit demo'}</Button>
            <a
              href="https://wa.me/966595051150"
              className="rounded-[11px] border-[1.5px] border-[rgba(244,243,238,.34)] px-6 py-3 text-[15px] font-bold text-white transition-colors hover:border-mint"
            >
              واتساب المبيعات
            </a>
          </div>
        </div>

        {/* Columns */}
        <div className="grid grid-cols-6 gap-8 border-b border-[rgba(244,243,238,.1)] py-12 max-lg:grid-cols-3 max-md:grid-cols-2">
          <div className="max-lg:col-span-3 max-md:col-span-2">
            <a href="/" className="flex items-center gap-2.5" dir="ltr">
              {branding.logoOnDarkUrl ? (
                <img src={branding.logoOnDarkUrl} alt={(locale === 'ar' ? branding.logoAltAr : branding.logoAltEn) || 'Digit'} className="h-9 w-auto max-w-[200px] object-contain" />
              ) : (
                <>
                  <DigitMarkLight className="h-9 w-9" />
                  <span className="font-archivo text-[24px] font-extrabold tracking-[-0.03em] text-white">
                    DIGIT
                  </span>
                </>
              )}
            </a>
            <p className="mt-4 max-w-[280px] text-[13.5px] leading-[1.8]">
              منصة ERP مبنية للسعودية — محاسبة ومبيعات ومشتريات ومخزون وتقارير وفوترة إلكترونية بالعربية، بدعم وتنفيذ محلي.
            </p>
            <div className="mt-5 flex gap-3">
              {/* social icons */}
              <a href="https://x.com/digitsaudi" target="_blank" rel="noopener noreferrer" aria-label="X" className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-[rgba(52,211,153,.12)] text-mint transition-colors hover:bg-mint hover:text-ink">
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor"><path d="M18.9 2H22l-6.8 7.8L23.2 22h-6.3l-4.9-6.4L6.4 22H3.3l7.3-8.3L1.6 2H8l4.4 5.9L18.9 2zm-1.1 18h1.7L7.1 3.8H5.3L17.8 20z"/></svg>
              </a>
              <a href="https://www.facebook.com/digitksa" target="_blank" rel="noopener noreferrer" aria-label="Facebook" className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-[rgba(52,211,153,.12)] text-mint transition-colors hover:bg-mint hover:text-ink"><svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor"><path d="M13.5 22v-8h2.7l.4-3.2h-3.1V8.8c0-.9.3-1.5 1.6-1.5h1.7V4.4c-.3 0-1.3-.1-2.5-.1-2.5 0-4.1 1.5-4.1 4.2v2.3H7.4V14h2.8v8h3.3z"/></svg></a>
              <a href="https://www.instagram.com/digitksa/" target="_blank" rel="noopener noreferrer" aria-label="Instagram" className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-[rgba(52,211,153,.12)] text-mint transition-colors hover:bg-mint hover:text-ink"><svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor"/></svg></a>
              <a href="https://www.youtube.com/@Digitksa" target="_blank" rel="noopener noreferrer" aria-label="YouTube" className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-[rgba(52,211,153,.12)] text-mint transition-colors hover:bg-mint hover:text-ink">
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor"><path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.4.6A3 3 0 0 0 .5 6.2 31.3 31.3 0 0 0 0 12a31.3 31.3 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.6 9.4.6 9.4.6s7.5 0 9.4-.6a3 3 0 0 0 2.1-2.1A31.3 31.3 0 0 0 24 12a31.3 31.3 0 0 0-.5-5.8zM9.6 15.6V8.4L15.8 12l-6.2 3.6z"/></svg>
              </a>
            </div>
          </div>
          {COLS.map((col) => (
            <div key={col.title}>
              <h5 className="mb-4 text-[15px] font-bold text-white">{col.title}</h5>
              {col.links.map((l, i) => (
                <a
                  key={l.label + i}
                  href={l.href}
                  className="block py-1.5 text-[13.5px] transition-colors hover:text-mint"
                >
                  {l.label}
                </a>
              ))}
            </div>
          ))}
          {nav&&<div><h5 className="mb-4 font-bold text-light">{locale==='ar'?'الموارد':'Resources'}</h5>{nav[locale].blocks.filter(b=>b.enabled&&b.href).map(b=><a key={b.id} href={locale==='en'?`/en${b.href}`:b.href} className="block py-2 text-sm">{b.title}</a>)}</div>}
        </div>

        {/* Contact row */}
        <div className="flex flex-wrap items-center gap-x-10 gap-y-4 border-b border-[rgba(244,243,238,.1)] py-7 text-[13.5px]">
          <div>
            <span className="font-bold text-white">واتساب/هاتف: </span>
            <a href="https://wa.me/966595051150" dir="ltr" className="hover:text-mint">+966 59 505 1150</a>
          </div>
          <div>
            <span className="font-bold text-white">البريد: </span>
            <a href="mailto:a.saeed@digit-erp.com" className="hover:text-mint">a.saeed@digit-erp.com</a>
          </div>
          <div>
            <span className="font-bold text-white">العنوان: </span>
            طريق صلاح الدين الأيوبي، تقاطع، شارع جرير، الرياض 12836
          </div>
          <span className="rounded-full border border-[rgba(52,211,153,.35)] bg-[rgba(52,211,153,.1)] px-4 py-1.5 text-[12px] text-mint">
            ● يدعم الربط مع منظومة الفوترة الإلكترونية (فاتورة)
          </span>
        </div>

        {/* Bottom row */}
        <div className="flex flex-wrap items-center justify-between gap-4 pt-6 text-[12.5px]">
          <span>© 2026 Digit · جميع الحقوق محفوظة · صُنع في السعودية</span>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-3 text-[13px]">
            <a href="/terms#c-7" className="hover:text-mint">سياسة الخصوصية</a>
            <span className="opacity-40" aria-hidden="true">·</span>
            <a href="/terms" className="hover:text-mint">الشروط والأحكام</a>
            <LanguageSwitch tone="dark" />
          </div>
        </div>
      </div>
    </footer>
  ), locale);
}
