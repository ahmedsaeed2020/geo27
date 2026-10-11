import { useState } from "react";

const QA: { q: string; a: string }[] = [
  { q: "هل هذا نظام ERP عادي؟", a: "لا. Digit منصة عربية بواجهات أوضح وتقارير أقوى وتوطين سعودي أعمق، مصمّمة تحديداً للسوق المحلي." },
  { q: "هل النظام مناسب للشركات السعودية؟", a: "نعم، مصمّم لمتطلبات السوق السعودي من شجرة الحسابات إلى التقويم الهجري والواجهة العربية." },
  { q: "هل يدعم الفوترة الإلكترونية؟", a: "مصمّم لدعم متطلبات الفوترة الإلكترونية (المرحلة الثانية) برمز QR وتقارير ضريبية." },
  { q: "هل يدعم مدد والتأمينات؟", a: "نعم، الرواتب مبنية لتتوافق مع حماية الأجور (مدد) والتأمينات. نؤكّد نطاق الدعم الفعلي في تحليل الجاهزية." },
  { q: "هل يمكن تخصيص النظام؟", a: "نعم، الشاشات والتقارير والصلاحيات قابلة للتخصيص، وتخصيص أعمق عبر باقة Enterprise." },
  { q: "هل هناك رسوم على كل مستخدم؟", a: "الباقة المالية اشتراك سنوي واضح ($3,000/سنة). نقاط البيع تُسعّر لكل نقطة بالريال. بلا مفاجآت لكل مستخدم." },
  { q: "كم يستغرق التطبيق؟", a: "عادةً خلال أسابيع، وفق منهجية محددة من ثماني مراحل — تُضبط حسب حجم بياناتك وموديولاتك." },
  { q: "هل توفّرون تدريباً ودعماً؟", a: "نعم، الاشتراك السنوي يشمل التنفيذ وتدريب المستخدمين ودعماً محلياً مستمراً." },
  { q: "هل يمكن نقل البيانات من Excel أو نظام سابق؟", a: "نعم، نقل البيانات مرحلة مستقلة في منهجيتنا، من الإكسل أو نظامك السابق." },
  { q: "هل يمكن تجربة النظام قبل الشراء؟", a: "نعم، احجز عرضاً تجريبياً مخصّصاً أو بيئة تجربة لترى Digit على حالتك." },
];

export default function Faq() {
  const [open, setOpen] = useState(0);

  return (
    <section id="faq" className="bg-paper px-7 py-[84px]">
      <div className="mx-auto max-w-[1240px]">
        <div className="mb-[30px] flex flex-col items-center gap-1.5 text-center">
          <div className="mb-2 font-monospace text-[12px] font-bold tracking-[2px] text-primary uppercase">
            الأسئلة الشائعة
          </div>
          <h2 className="mb-2.5 text-[38px] leading-[1.14] font-bold tracking-[-1px] text-deep max-md:text-[28px]">
            أسئلة قبل أن تقرّر — إجابات مباشرة
          </h2>
          <p className="mb-1.5 text-[18px] leading-[1.8] text-body2">
            أكثر ما يسأل عنه مديرو الشركات قبل اختيار نظام ERP.
          </p>
        </div>

        <div className="flex flex-wrap items-start gap-[26px]">
          {/* accordion */}
          <div className="w-[62%] max-lg:w-full">
            <div className="overflow-hidden rounded-[12px] border border-dline bg-white">
              {QA.map((item, i) => (
                <div key={i} className={i > 0 ? "border-t border-dline" : ""}>
                  <button
                    className="flex w-full items-center gap-3 px-[18px] py-4 text-start text-[14.5px] font-bold text-deep"
                    onClick={() => setOpen(open === i ? -1 : i)}
                    aria-expanded={open === i}
                  >
                    <span className="text-[20px] font-extrabold text-primary">
                      {open === i ? "−" : "+"}
                    </span>
                    {item.q}
                  </button>
                  {open === i && (
                    <div className="px-[18px] pb-4 ps-[46px] text-[13.5px] leading-[1.7] text-body2">
                      {item.a}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* CTA card */}
          <div className="flex w-[30%] flex-col items-start gap-2.5 rounded-[18px] bg-deep p-7 max-lg:w-full">
            <h3 className="mb-2.5 text-[18px] leading-[1.2] font-bold text-white">لم تجد إجابتك؟</h3>
            <p className="text-[13px] leading-[1.6] text-[rgba(244,243,238,.78)]">
              تحدّث مع فريقنا واحصل على إجابة مخصّصة لشركتك — وتحليل جاهزية.
            </p>
            <a
              href="/demo"
              className="mt-2 self-stretch rounded-[11px] bg-mint px-[26px] py-[13px] text-center text-[15px] font-bold text-ink transition-colors hover:bg-[#54e0a8]"
            >
              احجز عرضاً تجريبياً
            </a>
            <a
              href="https://wa.me/966591909277"
              className="self-stretch rounded-[11px] border-[1.5px] border-[rgba(244,243,238,.34)] bg-transparent px-[26px] py-[13px] text-center text-[15px] font-bold text-white transition-colors hover:border-mint"
            >
              تواصل معنا
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
