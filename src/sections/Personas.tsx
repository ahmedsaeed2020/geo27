import { Link } from "@tanstack/react-router";
import { PERSONAS } from "@/content/personas";

const TEAM: { name: string; role: string; img: string; href: string }[] = [
  { name: "مالك الشركة", role: "لوحة تحكم وتقارير لحظية", img: PERSONAS.owner, href: "/modules/reports" },
  { name: "المدير المالي", role: "مراكز تكلفة وتدفق نقدي", img: PERSONAS.cfo, href: "/modules/accounting" },
  { name: "المحاسب", role: "قيود وفوترة إلكترونية متوافقة", img: PERSONAS.accSa, href: "/modules/accounting" },
  { name: "محاسبة الفروع", role: "فواتير مبسطة وسداد متعدد", img: PERSONAS.accSaF, href: "/modules/e-invoicing-zatca" },
  { name: "مسؤول المبيعات", role: "عروض أسعار وعمولات", img: PERSONAS.sales, href: "/modules/sales" },
  { name: "مسؤول المشتريات", role: "طلبات شراء وتقييم موردين", img: PERSONAS.proc, href: "/modules/purchasing" },
  { name: "أمين المستودع", role: "جرد وباركود وتتبع دفعات", img: PERSONAS.wh, href: "/modules/inventory" },
  { name: "مدير المشاريع", role: "تكلفة مشاريع ومستخلصات", img: PERSONAS.pm, href: "/modules/projects" },
  { name: "الموارد البشرية", role: "رواتب وحضور متوافق مع حماية الأجور", img: PERSONAS.hr, href: "/modules/hr-payroll" },
  { name: "مشرف الكاشير", role: "نقاط بيع سريعة متصلة بالمخزون", img: PERSONAS.retail, href: "/modules/pos" },
  { name: "مستشار التحول الرقمي", role: "تهيئة وتدريب ونقل بيانات", img: PERSONAS.advisor, href: "/services-3" },
  { name: "محاسب التشغيل", role: "مطابقات وتقارير دورية", img: PERSONAS.accEg, href: "/modules/reports" },
];

export default function Personas() {
  return (
    <section id="personas" className="bg-light py-[84px] max-md:py-[54px]">
      <div className="mx-auto max-w-[1600px] px-6 max-md:px-4">
        <div className="flex flex-col items-center">
          <div className="flex items-center gap-3 text-[16px] font-semibold tracking-[0.5px] text-primary uppercase">
            <span className="inline-block h-[2px] w-[50px] bg-primary" />
            فريقك
            <span className="inline-block h-[2px] w-[50px] bg-primary" />
          </div>
          <h2 className="pt-5 text-center text-[34px] font-bold text-ink max-md:text-[26px]">
            كل فرد في فريقك… له مكانه في النظام
          </h2>
          <p className="mt-3 max-w-[680px] text-center text-[16px] text-body2">
            من المالك إلى أمين المستودع — صلاحيات وشاشات مصممة لدور كل شخص، بلا تعقيد.
          </p>
        </div>
        <div className="mt-12 grid grid-cols-6 gap-5 max-lg:grid-cols-4 max-md:grid-cols-2 max-md:gap-3">
          {TEAM.map((p, i) => (
            <Link
              key={p.name}
              to={p.href}
              className="persona-card group flex flex-col items-center rounded-[12px] border border-dline bg-paper p-4 text-center transition-all duration-300 hover:-translate-y-1.5 hover:border-primary hover:shadow-[0_16px_40px_rgba(6,78,59,0.14)]"
              style={{ transitionDelay: `${(i % 6) * 40}ms` }}
            >
              <div className="flex h-[150px] w-full items-end justify-center overflow-hidden rounded-[8px] bg-[linear-gradient(180deg,var(--tabactive),transparent)] max-md:h-[120px]">
                <img
                  src={p.img}
                  alt={p.name}
                  loading="lazy"
                  className="h-full object-contain object-bottom transition-transform duration-500 group-hover:scale-[1.06]"
                />
              </div>
              <h3 className="mt-3 text-[15px] font-bold text-ink max-md:text-[14px]">{p.name}</h3>
              <p className="mt-1 text-[12px] leading-[1.6] text-body2">{p.role}</p>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
