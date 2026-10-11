import { useLocale, localizeTree } from "@/lib/i18n";
import { useState } from "react";

const TILES: { title: string; sub: string; desc: string; img: string; href: string }[] = [
  { title: "المقاولات", sub: "تكلفة المشاريع · مقاولون من الباطن", desc: "تكلفة كل مشروع، إدارة المقاولين من الباطن، ومستخلصات تقدّم ومحتجزات — مرتبطة بمحاسبتك.", img: "/images/contracting.jpg", href: "/industries/contracting-industry" },
  { title: "التصنيع", sub: "قوائم مواد وأوامر تشغيل · تكلفة", desc: "قوائم مواد وأوامر تشغيل وتكلفة فعلية لكل أمر إنتاج — مرتبطة بالمخزون والمشتريات والمحاسبة.", img: "/images/man.jpg", href: "/industries/manufacturing-industry" },
  { title: "التجزئة", sub: "كاشير متصل · فروع وولاء", desc: "كاشير سريع متصل بالمخزون والحسابات، فروع وولاء، وفواتير مبسطة متوافقة — لكل متاجر التجزئة.", img: "/images/retail.jpg", href: "/industries/retail" },
  { title: "التجارة والتوزيع", sub: "متعدد المستودعات · تحصيل", desc: "مخزون متعدد المستودعات، مشتريات ومبيعات بأسعار متدرّجة، وتحصيل — كل شيء متصل بالمحاسبة.", img: "/images/dis.jpg", href: "/industries/distribution" },
  { title: "العقارات", sub: "عقود وإيجارات · تحصيل", desc: "إدارة العقود والإيجارات والتحصيل، تكاليف المشاريع العقارية، ومحاسبة وفوترة متوافقة على منصة واحدة.", img: "/images/rs.jpg", href: "/industries/real-estate" },
  { title: "القطاع الطبي", sub: "صيدليات · صلاحية ودفعات", desc: "نقاط بيع للصيدليات بتتبّع الدفعات والصلاحية، مخزون أدوية ومستلزمات، وحسابات وفوترة متوافقة.", img: "/images/med.jpg", href: "/industries/healthcare" },
  { title: "التعليمي", sub: "مراكز تدريب - مدارس - نظام تعليمي متكامل", desc: "نقاط بيع للصيدليات بتتبّع الدفعات والصلاحية، مخزون أدوية ومستلزمات، وحسابات وفوترة متوافقة.", img: "/images/edu.jpg", href: "https://digit-erp.com/industries/education/" },
  { title: "التشغيل والصيانة", sub: "الزيارات - الصيانات", desc: "نقاط بيع للصيدليات بتتبّع الدفعات والصلاحية، مخزون أدوية ومستلزمات، وحسابات وفوترة متوافقة.", img: "/images/om.jpg", href: "/industries/healthcare" },
];

export default function Industries() {
  const locale = useLocale();
  const [active, setActive] = useState(0);

  return localizeTree((
    <section id="industries" className="bg-paper">
      {/* head */}
      <div className="relative overflow-hidden py-[84px] max-md:px-4 max-md:py-[54px]">
        <span
          aria-hidden="true"
          className="pointer-events-none absolute top-[10px] left-1/2 -translate-x-1/2 font-archivo text-[90px] font-extrabold whitespace-nowrap text-ink opacity-[0.05] select-none max-md:text-[44px]"
          dir="ltr"
        >
          DIGIT INDUSTRIES
        </span>
        <div className="relative mx-auto flex max-w-[1600px] flex-col items-center px-6">
          <div className="flex items-center gap-3 text-[16px] font-semibold tracking-[0.5px] text-primary uppercase">
            <span className="inline-block h-[2px] w-[50px] bg-primary" />
            القطاعات
            <span className="inline-block h-[2px] w-[50px] bg-primary" />
          </div>
          <h2 className="pt-5 text-center text-[34px] font-bold text-ink max-md:text-[26px]">
            مصمَّم لقطاع عملك
          </h2>
          <p className="mt-3 max-w-[680px] text-center text-[16px] text-body2">
            قطاعات بنموذج عمل، لكل قطاع موديولاته المناسبة — من التجارة والمقاولات إلى التجزئة والخدمات.
          </p>
        </div>
      </div>

      {/* hover box */}
      <div
        className="relative min-h-[801px] bg-cover bg-center transition-[background-image] duration-300 max-lg:min-h-[700px] max-md:min-h-[550px]"
        style={{ backgroundImage: `url(${TILES[active]?.img})` }}
      >
        <div className="absolute inset-0 bg-dark/40" />
        <div className="relative mx-auto grid h-full min-h-[801px] max-w-[1240px] grid-cols-4 grid-rows-2 items-stretch gap-2 px-6 py-24 max-lg:min-h-[700px] max-md:min-h-[550px] max-md:grid-cols-2 max-md:grid-rows-4 max-md:px-4 max-md:py-10">
          {TILES.map((t, i) => {
            const isActive = i === active;
            return (
              <div
                key={t.title}
                onMouseEnter={() => setActive(i)}
                onClick={() => setActive(i)}
                className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-[5px] p-4 text-center transition-colors max-md:p-[10px_10px_16px] ${
                  isActive ? "bg-[#F4F3EEB8]" : "bg-[#064E3B52]"
                }`}
              >
                {isActive && (
                  <span className="text-[13px] font-semibold text-primary max-md:text-[11px]">{t.sub}</span>
                )}
                <h3
                  className={`text-[20px] font-bold max-md:text-[16px] ${
                    isActive ? "text-deep" : "text-light"
                  }`}
                >
                  {t.title}
                </h3>
                {isActive && (
                  <>
                    <p className="max-w-[260px] text-[13px] leading-[1.6] text-[rgba(11,31,23,0.7)] max-md:mt-1.5 max-md:text-[12px]">
                      {t.desc}
                    </p>
                    <a
                      href={t.href}
                      className="mt-2 rounded-[8px] bg-deep px-5 py-2 text-[13px] font-bold text-white transition-colors hover:bg-primary max-md:mt-[13px] max-md:px-2.5 max-md:py-1 max-md:text-[12px]"
                    >
                      اعرف أكثر
                    </a>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  ), locale);
}
