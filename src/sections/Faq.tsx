import { useId, useState } from "react";
import { useLocale, localeHref } from "@/lib/i18n";
import { SectionHeading } from '@/components/cms/SectionText';
import { FAQ_COPY, HOME_FAQ } from "@/content/home";

/** Home FAQ. The same entries are published as the page's FAQPage structured data (src/lib/seo.ts). */
export default function Faq() {
  const l = useLocale();
  const uid = useId();
  const [open, setOpen] = useState(0);

  return (
    <section id="faq" className="bg-paper px-7 py-[84px] max-md:px-4 max-md:py-14" aria-labelledby="faq-title">
      <div className="mx-auto max-w-[1240px]">
        <div className="mb-[30px] flex flex-col items-center gap-1.5 text-center">
          <div className="mb-2 font-monospace text-[12px] font-bold tracking-[2px] text-primary uppercase">{FAQ_COPY.eyebrow[l]}</div>
          <SectionHeading k="faq" id="faq-title" className="mb-2.5 text-[38px] leading-[1.14] font-bold tracking-[-1px] text-deep max-md:text-[28px]">
            {FAQ_COPY.heading[l]}
          </SectionHeading>
          <p className="mb-1.5 text-[18px] leading-[1.8] text-body2 max-md:text-[16px]">{FAQ_COPY.lede[l]}</p>
        </div>

        <div className="flex flex-wrap items-start gap-[26px]">
          <div className="w-[62%] max-lg:w-full">
            <div className="overflow-hidden rounded-[12px] border border-dline bg-card">
              {HOME_FAQ.map((item, i) => {
                const isOpen = open === i;
                return (
                  <div key={item.q.en} className={i > 0 ? "border-t border-dline" : ""}>
                    <h3>
                      <button
                        type="button"
                        id={`${uid}-q-${i}`}
                        className="flex w-full items-center gap-3 px-[18px] py-4 text-start text-[15px] font-bold text-deep focus-visible:bg-light focus-visible:outline-none"
                        onClick={() => setOpen(isOpen ? -1 : i)}
                        aria-expanded={isOpen}
                        aria-controls={`${uid}-a-${i}`}
                      >
                        <span className="w-4 flex-none text-[20px] font-extrabold text-primary" aria-hidden="true">{isOpen ? "−" : "+"}</span>
                        {item.q[l]}
                      </button>
                    </h3>
                    <div id={`${uid}-a-${i}`} role="region" aria-labelledby={`${uid}-q-${i}`} hidden={!isOpen} className="px-[18px] pb-4 ps-[46px] text-[14px] leading-[1.75] text-body2">
                      {item.a[l]}
                    </div>
                  </div>
                );
              })}
            </div>
            <a href={localeHref("/faq", l)} className="mt-4 inline-block text-[14.5px] font-semibold text-primary hover:underline">{FAQ_COPY.all[l]}</a>
          </div>

          <aside className="flex w-[30%] flex-col items-start gap-2.5 rounded-[18px] bg-deep p-7 max-lg:w-full" aria-labelledby={`${uid}-side`}>
            <h3 id={`${uid}-side`} className="mb-2.5 text-[18px] leading-[1.2] font-bold text-paper">{FAQ_COPY.side[l]}</h3>
            <p className="text-[13.5px] leading-[1.6] text-paper/78">{FAQ_COPY.sideBody[l]}</p>
            <a href={localeHref("/demo", l)} className="mt-2 self-stretch rounded-[11px] bg-mint px-[26px] py-[13px] text-center text-[15px] font-bold text-ink transition-colors hover:bg-mint/85">
              {FAQ_COPY.demo[l]}
            </a>
            <a href={localeHref("/quote", l)} className="self-stretch rounded-[11px] border-[1.5px] border-paper/34 bg-transparent px-[26px] py-[13px] text-center text-[15px] font-bold text-paper transition-colors hover:border-mint">
              {FAQ_COPY.quote[l]}
            </a>
            <a href="https://wa.me/966595051150" target="_blank" rel="noopener noreferrer" className="self-stretch px-2 py-2 text-center text-[14px] font-semibold text-mint hover:underline">
              {FAQ_COPY.whatsapp[l]}
            </a>
          </aside>
        </div>
      </div>
    </section>
  );
}
