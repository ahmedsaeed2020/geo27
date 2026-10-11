import { useLocale, localizeTree } from "@/lib/i18n";
const MODULES: { title: string; icon: string; bullets: string[]; href: string }[] = [
  { title: "المحاسبة", icon: "/icons/digit-mod-accounts-light-17.svg", bullets: ["قيد يومي", "سند صرف", "تسوية بنكية"], href: "/modules/accounting" },
  { title: "الفوترة الإلكترونية", icon: "/icons/digit-mod-einvoicing-light-5.svg", bullets: ["فاتورة متوافقة", "رمز QR", "ربط فاتورة"], href: "/modules/e-invoicing-zatca" },
  { title: "المبيعات", icon: "/icons/digit-mod-sales-light-22.svg", bullets: ["عرض سعر", "أمر بيع", "فاتورة وتحصيل"], href: "/modules/sales" },
  { title: "المشتريات", icon: "/icons/digit-mod-purchases-light-23.svg", bullets: ["طلب شراء", "موافقة", "مطابقة ثلاثية"], href: "/modules/purchasing" },
  { title: "المخزون", icon: "/icons/digit-mod-inventory-light-25.svg", bullets: ["أرصدة المخزون", "حركة الأصناف", "تنبيه النقص"], href: "/modules/inventory" },
  { title: "الأصول الثابتة", icon: "/icons/digit-mod-assets-light-3.svg", bullets: ["سجل أصول", "إهلاك تلقائي", "بيع واستبعاد"], href: "/modules/fixed-assets" },
  { title: "نقاط البيع", icon: "/icons/digit-mod-pos-light-6.svg", bullets: ["كاشير سريع", "خصم مخزون فوري", "فاتورة + QR"], href: "/modules/pos" },
  { title: "إدارة العملاء", icon: "/icons/digit-ui-user-light-14.svg", bullets: ["مراحل بيع", "سجل تواصل", "متابعات"], href: "/modules/crm" },
  { title: "الموارد البشرية", icon: "/icons/digit-feat-permissions-light-8.svg", bullets: ["ملفات الموظفين", "مسير الرواتب", "ملف حماية الأجور"], href: "/modules/hr-payroll" },
  { title: "التصنيع", icon: "/icons/digit-ind-manufacturing-1.svg", bullets: ["قائمة مواد (BOM)", "أمر تشغيل", "تكلفة الأمر"], href: "/modules/manufacturing" },
  { title: "المشاريع", icon: "/icons/digit-mod-projects-light-10.svg", bullets: ["موازنة المشروع", "مراكز التكلفة", "مستخلصات"], href: "/modules/projects" },
  { title: "التقارير", icon: "/icons/digit-mod-reports-light-24.svg", bullets: ["قائمة الدخل", "أعمار الذمم", "تقارير مجدولة"], href: "/modules/reports" },
];

export default function Modules() {
  const locale = useLocale();
  return localizeTree((
    <section id="modules" className="bg-paper py-[84px] max-md:px-4 max-md:py-[54px]">
      <div className="mx-auto w-[88%] max-w-[1600px]">
        <div className="flex flex-col items-center">
          <div className="flex items-center gap-3 text-[16px] font-semibold tracking-[0.5px] text-primary uppercase">
            <span className="inline-block h-[2px] w-[50px] bg-primary" />
            الموديولات
            <span className="inline-block h-[2px] w-[50px] bg-primary" />
          </div>
          <h2 className="pt-5 text-center text-[34px] font-bold text-ink max-md:text-[26px]">
            منصة واحدة… لكل إدارات شركتك
          </h2>
          <p className="mt-3 max-w-[640px] text-center text-[16px] text-body2">
            كل ما تحتاجه إداراتك في منصة واحدة متصلة — من نفس قاعدة البيانات.
          </p>
        </div>

        <div className="mt-12 grid grid-cols-4 items-stretch gap-5 max-lg:grid-cols-2 max-md:grid-cols-1">
          {MODULES.map((m) => (
            <div
              key={m.title}
              className="group relative flex h-full flex-col overflow-hidden rounded-[14px] border border-dline bg-white p-[26px_24px] text-start shadow-[0_10px_30px_rgba(6,78,59,.07)] transition-colors hover:border-primary"
            >
              <div className="mb-2.5 inline-flex self-start rounded-[13px] border border-iconborder p-[15px] shadow-[0_8px_22px_rgba(10,135,84,.12)] transition-colors group-hover:bg-white">
                <img src={m.icon} alt="" aria-hidden="true" className="h-8 w-8" />
              </div>
              <h3 className="pt-4 text-[22px] font-bold text-deep">{m.title}</h3>
              <ul className="mt-3 mb-[15px] list-none p-0 text-start">
                {m.bullets.map((b) => (
                  <li key={b} className="relative mb-2 ps-[22px] text-[13.5px] text-body2">
                    <span className="absolute start-0 font-bold text-primary">↗</span>
                    {b}
                  </li>
                ))}
              </ul>
              <a
                href={m.href}
                className="mt-auto self-start rounded-[8px] bg-light px-[15px] py-[9px] text-[17px] font-medium text-deep transition-colors hover:text-primary"
              >
                عرض المزيد
              </a>
            </div>
          ))}
        </div>
      </div>
    </section>
  ), locale);
}
