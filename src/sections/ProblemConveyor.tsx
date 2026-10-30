import { useLocale, localizeTree } from "@/lib/i18n";
import { useRef, useState } from "react";
import ShotFrame from "@/components/product/ShotFrame";
import ShotLightbox from "@/components/product/ShotLightbox";
import { shot } from "@/content/product-shots";
import { PROBLEM_SHOTS, PROOF_COPY } from "@/content/product-proof";
import "@/product-proof.css";
import { SectionHeading } from '@/components/cms/SectionText';

const SLIDES: { pain: string; mod: string; sol: string }[] = [
  { pain: "أسعار مخفية ورسوم لكل مستخدم", mod: "التسعير", sol: "تسعير واضح بلا مفاجآت" },
  { pain: "تطبيق طويل ومكلف", mod: "التطبيق", sol: "منهجية تطبيق محدّدة المدة" },
  { pain: "واجهات معقّدة", mod: "الواجهة", sol: "واجهات عربية مبسّطة" },
  { pain: "تقارير متأخّرة", mod: "التقارير", sol: "رؤية لحظية في لوحة واحدة" },
  { pain: "موافقات بطيئة", mod: "الموافقات", sol: "سير موافقات رقمي سريع" },
  { pain: "ضعف الفوترة ومدد", mod: "الامتثال", sol: "توطين مدمج وجاهز" },
  { pain: "دعم غير محلي", mod: "الدعم", sol: "دعم سعودي حقيقي" },
  { pain: "اعتماد زائد على الإكسل", mod: "التكامل", sol: "بياناتك في نظام واحد مترابط" },
];

const PainMark = (
  <svg viewBox="0 0 24 24" className="h-6 w-6">
    <rect x="10.5" y="5" width="3" height="9" rx="1.5" fill="#5B6B63" />
    <rect x="10.5" y="16.5" width="3" height="3" rx="1.5" fill="#5B6B63" />
  </svg>
);

const SolMark = (
  <svg viewBox="0 0 24 24" fill="none" stroke="#0A8754" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6">
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

const ArrowIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="#0A8754" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="h-[26px] w-[26px]">
    <path d="M18 12H7" />
    <path d="M11 7 6 12 11 17" />
  </svg>
);

function NavButton({ dir, onClick, label }: { dir: "prev" | "next"; onClick: () => void; label: string }) {
  const locale = useLocale();
  return localizeTree((
    <button
      aria-label={label}
      onClick={onClick}
      className="flex h-[46px] w-[46px] items-center justify-center rounded-[13px] border border-[rgba(6,78,59,.12)] bg-white text-body2 transition-all hover:border-deep hover:bg-deep hover:text-white"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="h-[21px] w-[21px]">
        {dir === "prev" ? <path d="M9 6l6 6-6 6" /> : <path d="M15 6l-6 6 6 6" />}
      </svg>
    </button>
  ), locale);
}

export default function ProblemConveyor() {
  const locale = useLocale();
  const [idx, setIdx] = useState(0);
  const touchX = useRef<number | null>(null);
  const n = SLIDES.length;
  const go = (i: number) => setIdx(((i % n) + n) % n);
  // Real screenshots back three of the challenges; the lightbox steps through those three.
  const proofShots = SLIDES.flatMap(slide => PROBLEM_SHOTS[slide.pain] ? [shot(PROBLEM_SHOTS[slide.pain]!)] : []);
  const [openShot, setOpenShot] = useState<number | null>(null);
  const currentShot = PROBLEM_SHOTS[SLIDES[idx]?.pain ?? ""];

  return localizeTree((
    <section id="problem" className="bg-paper2 py-[88px] max-lg:py-[72px] max-md:py-14">
      <div className="mx-auto max-w-[1240px] px-6">
        <div className="mx-auto mb-11 max-w-[680px] text-center">
          <div className="font-monospace text-[12px] font-bold tracking-[0.16em] text-primary uppercase">
            التحدّي
          </div>
          <SectionHeading k="problems" className="mt-3.5 text-[clamp(28px,3.4vw,42px)] leading-[1.18] font-bold tracking-[-0.02em] text-ink">
            وداعاً لمشاكل الأنظمة التقليدية
          </SectionHeading>
          <p className="mx-auto mt-4 text-[17px] leading-[1.75] text-[rgba(11,31,23,.62)]">
            لكل ألمٍ تعرفه في أنظمة ERP… حلٌّ جاهز داخل المنصة. من أدوات متفرّقة إلى نظام واحد مترابط.
          </p>
        </div>

        <div className="relative mx-auto max-w-[1040px] px-12 max-md:px-2">
          {/* bullets */}
          <div className="mb-[34px] flex items-center justify-center gap-2">
            {SLIDES.map((_, i) => (
              <button
                key={i}
                aria-label={`الشريحة ${i + 1}`}
                onClick={() => go(i)}
                className={`h-2 rounded-full transition-all ${
                  i === idx ? "w-[22px] bg-primary" : "w-2 bg-[rgba(91,107,99,.30)]"
                }`}
              />
            ))}
          </div>

          {/* stage */}
          <div
            className="relative"
            onTouchStart={(e) => { touchX.current = e.touches[0]?.clientX ?? null; }}
            onTouchEnd={(e) => {
              if (touchX.current === null) return;
              const dx = (e.changedTouches[0]?.clientX ?? touchX.current) - touchX.current;
              if (Math.abs(dx) > 40) go(dx < 0 ? idx + 1 : idx - 1);
              touchX.current = null;
            }}
          >
            {SLIDES.map((s, i) => (
              <div key={i} className={i === idx ? "block" : "hidden"}>
                <div
                  className="mx-auto flex max-w-[940px] items-stretch justify-center gap-5 max-md:flex-col max-md:gap-0"
                  style={i === idx ? { animation: "dcvfade .42s cubic-bezier(.2,.7,.2,1)" } : undefined}
                >
                  {/* pain card */}
                  <div className="flex min-h-[188px] flex-1 flex-col justify-center gap-[18px] rounded-[18px] border border-[rgba(91,107,99,.16)] bg-paper p-[30px] max-lg:min-h-[170px] max-lg:p-6">
                    <div className="font-monospace text-[11px] font-bold tracking-[0.10em] text-body2">
                      ما تعانيه اليوم
                    </div>
                    <div className="flex items-center gap-[15px]">
                      <span className="flex h-[46px] w-[46px] flex-none items-center justify-center rounded-[13px] bg-[rgba(91,107,99,.10)]">
                        {PainMark}
                      </span>
                      <span className="text-[clamp(18px,1.7vw,22px)] leading-[1.4] font-semibold text-[rgba(11,31,23,.70)]">
                        {s.pain}
                      </span>
                    </div>
                  </div>

                  {/* arrow */}
                  <div className="flex w-[54px] flex-none flex-col items-center justify-center gap-2.5 max-md:w-full max-md:py-3.5">
                    <span className="flex h-[54px] w-[54px] items-center justify-center rounded-full bg-[rgba(52,211,153,.16)] max-md:-rotate-90">
                      {ArrowIcon}
                    </span>
                    <span className="font-monospace text-[9.5px] font-bold text-primary max-md:hidden">
                      {s.mod}
                    </span>
                  </div>

                  {/* solution card */}
                  <div className="relative flex min-h-[188px] flex-1 flex-col justify-center gap-[18px] rounded-[18px] border border-[rgba(10,135,84,.18)] bg-white p-[30px] shadow-[0_14px_36px_rgba(6,78,59,.10)] max-lg:min-h-[170px] max-lg:p-6">
                    <span className="absolute inset-y-4 start-0 w-1 rounded-full bg-mint" />
                    <div className="font-monospace text-[11px] font-bold tracking-[0.10em] text-primary">
                      مع Digit
                    </div>
                    <div className="flex items-center gap-[15px] max-md:flex-wrap">
                      <span className="flex h-[46px] w-[46px] flex-none items-center justify-center rounded-[13px] bg-[rgba(10,135,84,.12)]">
                        {SolMark}
                      </span>
                      <span className="min-w-0 flex-1 text-[clamp(18px,1.7vw,22px)] leading-[1.4] font-bold text-deep">
                        {s.sol}
                      </span>
                      {PROBLEM_SHOTS[s.pain] && (
                        <div className="pp-thumb-slot">
                          <ShotFrame
                            shot={shot(PROBLEM_SHOTS[s.pain]!)}
                            size="thumb"
                            mode="screen"
                            onOpen={() => setOpenShot(proofShots.findIndex(item => item.id === PROBLEM_SHOTS[s.pain]))}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}

            {/* gutter nav */}
            <div className="absolute end-0 top-1/2 -translate-y-1/2 max-md:hidden">
              <NavButton dir="prev" label="السابق" onClick={() => go(idx - 1)} />
            </div>
            <div className="absolute start-0 top-1/2 -translate-y-1/2 max-md:hidden">
              <NavButton dir="next" label="التالي" onClick={() => go(idx + 1)} />
            </div>
          </div>

          <p className="pp-footnote pp-thumb-note" style={{ visibility: currentShot ? "visible" : "hidden" }} aria-hidden={currentShot ? undefined : true}>
            {PROOF_COPY.footnote[locale]}
          </p>

          {/* foot */}
          <div className="mx-auto mt-[30px] flex max-w-[940px] items-center justify-between max-md:justify-center">
            <div className="font-monospace text-[13px] text-body2 max-md:hidden">
              <b className="text-[16px] text-primary">{("0" + (idx + 1)).slice(-2)}</b> / 08
            </div>
            <div className="flex gap-2.5">
              <NavButton dir="prev" label="السابق" onClick={() => go(idx - 1)} />
              <NavButton dir="next" label="التالي" onClick={() => go(idx + 1)} />
            </div>
          </div>
        </div>
      </div>
      <ShotLightbox shots={proofShots} index={openShot} onIndexChange={setOpenShot} onClose={() => setOpenShot(null)} />
      <style>{`@keyframes dcvfade{from{opacity:0;transform:translateX(18px);}to{opacity:1;transform:none;}}`}</style>
    </section>
  ), locale);
}
