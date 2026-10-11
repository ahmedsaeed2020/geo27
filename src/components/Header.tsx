import { useState } from "react";

type MenuItem = { label: string; href: string; children?: MenuItem[] };

const MENU: MenuItem[] = [
  {
    label: "من نحن",
    href: "/about-4/",
    children: [
      { label: "القدرات", href: "/features/" },
      { label: "تواصل معنا", href: "/contact-4/" },
    ],
  },
  {
    label: "الموديولات",
    href: "/modules/",
    children: [
      { label: "المحاسبة", href: "/modules/accounting/" },
      { label: "المبيعات", href: "/modules/sales/" },
      { label: "المشتريات", href: "/modules/purchasing/" },
      { label: "المخزون", href: "/modules/inventory/" },
      { label: "الأصول الثابتة", href: "/modules/fixed-assets/" },
      { label: "التقارير", href: "/modules/reports/" },
      { label: "الفوترة الإلكترونية (ZATCA)", href: "/modules/e-invoicing-zatca/" },
      { label: "إدارة العملاء CRM", href: "/modules/crm/" },
      { label: "الموارد البشرية والرواتب", href: "/modules/hr-payroll/" },
      { label: "المشاريع", href: "/modules/projects/" },
      { label: "التصنيع", href: "/modules/manufacturing/" },
      { label: "المقاولات", href: "/modules/contracting/" },
    ],
  },
  {
    label: "الخدمات",
    href: "/services-3/",
    children: [
      { label: "جلسة تحليل وتهيئة", href: "/services-3/discovery-workshop/" },
      { label: "تنفيذ وترقية ERPNext", href: "/services-3/erpnext-service/" },
      { label: "تطبيق النظام", href: "/services-3/implementation/" },
      { label: "التخصيص", href: "/services-3/customization/" },
      { label: "التدريب", href: "/services-3/training/" },
      { label: "ترحيل البيانات", href: "/services-3/data-migration/" },
      { label: "الاستضافة والتشغيل", href: "/services-3/hosting/" },
      { label: "الدعم", href: "/services-3/support/" },
      { label: "تجهيز الفوترة الإلكترونية", href: "/services-3/zatca-onboarding/" },
      { label: "الصيانة والخدمة المُدارة", href: "/services-3/maintenance/" },
      { label: "التوطين السعودي", href: "/saudi-localization/" },
      { label: "الثقة والأمان", href: "/trust-security/" },
    ],
  },
  {
    label: "نقاط البيع",
    href: "/modules/pos/",
    children: [
      { label: "محلات الجوال", href: "/pos-solutions/mobile-shops/" },
      { label: "الزهور", href: "/pos-solutions/florist/" },
      { label: "الصالونات", href: "/pos-solutions/salons/" },
      { label: "الأجهزة الكهربائية", href: "/pos-solutions/electrical-appliances/" },
      { label: "الأثاث والمفروشات", href: "/pos-solutions/furniture/" },
      { label: "النظارات", href: "/pos-solutions/optical/" },
      { label: "المطاعم والكافيهات", href: "/pos-solutions/restaurants-cafes/" },
      { label: "الحلويات", href: "/pos-solutions/sweets/" },
      { label: "الصيدليات", href: "/pos-solutions/pharmacies/" },
    ],
  },
  {
    label: "القطاعات",
    href: "/industries/",
    children: [
      { label: "التعليم", href: "/industries/education/" },
      { label: "الطبي والرعاية الصحية", href: "/industries/healthcare/" },
      { label: "المقاولات", href: "/modules/contracting/" },
      { label: "العقارات", href: "/industries/real-estate-2/" },
      { label: "التصنيع", href: "/industries/manufacturing-industry/" },
      { label: "التجزئة", href: "/industries/retail/" },
      { label: "التوزيع والجملة", href: "/industries/distribution/" },
      { label: "الخدمات المهنية", href: "/industries/professional-services/" },
      { label: "المقاولات", href: "/industries/contracting-industry/" },
    ],
  },
  {
    label: "الأسعار",
    href: "/pricing/",
    children: [
      { label: "Starter", href: "/starter/" },
      { label: "Pro", href: "/pro/" },
    ],
  },
];

export function DigitMark({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} role="img" aria-label="Digit">
      <rect x="18" y="22.5" width="40" height="13" rx="6.5" fill="#0B1F17" />
      <rect x="63" y="22.5" width="19" height="13" rx="5" fill="#0A8754" />
      <rect x="18" y="43.5" width="64" height="13" rx="6.5" fill="#0B1F17" />
      <rect x="18" y="64.5" width="50" height="13" rx="6.5" fill="#0B1F17" />
    </svg>
  );
}

export function DigitMarkLight({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} role="img" aria-label="Digit">
      <rect x="18" y="22.5" width="40" height="13" rx="6.5" fill="#F4F3EE" />
      <rect x="63" y="22.5" width="19" height="13" rx="5" fill="#34D399" />
      <rect x="18" y="43.5" width="64" height="13" rx="6.5" fill="#F4F3EE" />
      <rect x="18" y="64.5" width="50" height="13" rx="6.5" fill="#F4F3EE" />
    </svg>
  );
}

export default function Header() {
  const [open, setOpen] = useState(false);
  const [openIdx, setOpenIdx] = useState<number | null>(null);

  return (
    <header className="sticky top-0 z-50 bg-light shadow-[0_6px_24px_rgba(6,78,59,.08)]">
      <div className="mx-auto flex h-[96px] max-w-[1600px] items-center gap-8 px-6 max-lg:h-[64px] max-lg:px-4">
        {/* Logo — start side (right in RTL) */}
        <a href="/" className="flex items-center gap-2.5" dir="ltr">
          <DigitMark className="h-9 w-9" />
          <span className="font-archivo text-[24px] font-extrabold tracking-[-0.03em] text-ink max-lg:hidden">
            DIGIT
          </span>
        </a>

        {/* Desktop menu */}
        <nav className="flex items-center gap-7 max-lg:hidden">
          {MENU.map((item) => (
            <div key={item.label + item.href} className="group relative">
              <a
                href={item.href}
                className="flex items-center gap-1 py-2 text-[15px] font-bold text-ink transition-colors hover:text-primary"
              >
                {item.label}
                {item.children && (
                  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.4">
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                )}
              </a>
              {item.children && (
                <div className="invisible absolute top-full right-0 z-50 min-w-[220px] translate-y-2 rounded-[12px] bg-white p-2 opacity-0 shadow-[0_18px_44px_rgba(6,78,59,.14)] transition-all duration-150 group-hover:visible group-hover:translate-y-0 group-hover:opacity-100">
                  {item.children.map((c, i) => (
                    <a
                      key={c.label + i}
                      href={c.href}
                      className="block rounded-[8px] px-4 py-2.5 text-[14px] font-semibold text-ink transition-colors hover:bg-tabactive hover:text-primary"
                    >
                      {c.label}
                    </a>
                  ))}
                </div>
              )}
            </div>
          ))}
        </nav>

        {/* CTA — end side (left in RTL) */}
        <div className="ms-auto flex items-center gap-3">
          <a
            href="/demo"
            className="rounded-[12px] bg-primary px-6 py-3 text-[15px] font-bold text-white transition-colors hover:bg-deep max-lg:px-4 max-lg:py-2 max-lg:text-[13px]"
          >
            جرب مجانا
          </a>
          <button
            className="hidden h-10 w-10 items-center justify-center rounded-[10px] text-ink max-lg:flex"
            aria-label="القائمة"
            onClick={() => setOpen(true)}
          >
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <path d="M4 7h16M4 12h16M4 17h16" />
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile slide-in panel */}
      {open && (
        <div className="fixed inset-0 z-[60] lg:hidden">
          <div className="absolute inset-0 bg-ink/40" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 right-0 flex w-[320px] max-w-[85vw] flex-col overflow-y-auto bg-light p-5 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <DigitMark className="h-8 w-8" />
              <button aria-label="إغلاق" onClick={() => setOpen(false)} className="text-ink">
                <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>
            {MENU.map((item, i) => (
              <div key={item.label + i} className="border-b border-dline">
                <button
                  className="flex w-full items-center justify-between py-3.5 text-[15px] font-bold text-ink"
                  onClick={() => setOpenIdx(openIdx === i ? null : i)}
                >
                  {item.label}
                  {item.children && (
                    <svg
                      viewBox="0 0 24 24"
                      className={`h-4 w-4 transition-transform ${openIdx === i ? "rotate-180" : ""}`}
                      fill="none" stroke="currentColor" strokeWidth="2.4"
                    >
                      <path d="M6 9l6 6 6-6" />
                    </svg>
                  )}
                </button>
                {item.children && openIdx === i && (
                  <div className="pb-3">
                    <a href={item.href} className="block py-1.5 ps-3 text-[13.5px] font-semibold text-primary">
                      {item.label} — الكل
                    </a>
                    {item.children.map((c, j) => (
                      <a key={c.label + j} href={c.href} className="block py-1.5 ps-3 text-[13.5px] text-body2">
                        {c.label}
                      </a>
                    ))}
                  </div>
                )}
              </div>
            ))}
            <a
              href="/demo"
              className="mt-5 rounded-[12px] bg-primary px-6 py-3 text-center text-[15px] font-bold text-white"
            >
              جرب مجانا
            </a>
          </div>
        </div>
      )}
    </header>
  );
}
