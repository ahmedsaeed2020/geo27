import { useState } from "react";
import { useLocale, localeHref } from "@/lib/i18n";
import { SectionHeading } from '@/components/cms/SectionText';
import { INDUSTRIES_COPY, INDUSTRY_TILES } from "@/content/home";
import { productByKey } from "@/content/catalog";

/** Eight industries over their own scenes; the active tile names the DIGIT products that serve it. */
export default function Industries() {
  const l = useLocale();
  const [active, setActive] = useState(0);

  return (
    <section id="industries" className="bg-paper" aria-labelledby="industries-title">
      <div className="relative overflow-hidden py-[84px] max-md:px-4 max-md:py-[54px]">
        <span aria-hidden="true" className="pointer-events-none absolute top-[10px] left-1/2 -translate-x-1/2 font-archivo text-[90px] font-extrabold whitespace-nowrap text-ink opacity-[0.05] select-none max-md:text-[44px]" dir="ltr">
          DIGIT INDUSTRIES
        </span>
        <div className="relative mx-auto flex max-w-[1600px] flex-col items-center px-6">
          <div className="flex items-center gap-3 text-[16px] font-semibold tracking-[0.5px] text-primary uppercase">
            <span className="inline-block h-[2px] w-[50px] bg-primary" aria-hidden="true" />
            {INDUSTRIES_COPY.eyebrow[l]}
            <span className="inline-block h-[2px] w-[50px] bg-primary" aria-hidden="true" />
          </div>
          <SectionHeading k="industries" id="industries-title" className="pt-5 text-center text-[34px] font-bold text-ink max-md:text-[26px]">
            {INDUSTRIES_COPY.heading[l]}
          </SectionHeading>
          <p className="mt-3 max-w-[680px] text-center text-[16px] leading-[1.75] text-body2">{INDUSTRIES_COPY.lede[l]}</p>
        </div>
      </div>

      <div className="relative min-h-[801px] overflow-hidden max-lg:min-h-[700px] max-md:min-h-[620px]">
        {INDUSTRY_TILES.map((tile, index) => <img key={tile.img} src={tile.img} alt="" aria-hidden="true" loading="lazy" className="industry-scene" data-active={index === active} />)}
        <div className="absolute inset-0 bg-dark/40" aria-hidden="true" />
        <div className="relative mx-auto grid h-full min-h-[801px] max-w-[1240px] grid-cols-4 grid-rows-2 items-stretch gap-2 px-6 py-24 max-lg:min-h-[700px] max-md:min-h-[620px] max-md:grid-cols-2 max-md:grid-rows-4 max-md:px-4 max-md:py-10">
          {INDUSTRY_TILES.map((t, i) => {
            const isActive = i === active;
            return (
              <div
                key={t.href}
                data-sector-active={isActive}
                onMouseEnter={() => setActive(i)}
                onFocus={() => setActive(i)}
                className={`flex flex-col items-center justify-center gap-2 rounded-[5px] p-4 text-center transition-colors max-md:p-[10px_10px_16px] ${isActive ? "bg-paper/72" : "cursor-pointer bg-deep/32"}`}
                onClick={() => setActive(i)}
              >
                {isActive ? (
                  <>
                    <span className="text-[13px] font-semibold text-primary max-md:text-[11px]">{t.sub[l]}</span>
                    <h3 className="text-[20px] font-bold text-deep max-md:text-[16px]">{t.title[l]}</h3>
                    <p className="max-w-[260px] text-[13px] leading-[1.6] text-ink/70 max-md:mt-1 max-md:text-[12px]">{t.desc[l]}</p>
                    <div className="mt-1 flex flex-wrap justify-center gap-1.5" aria-label={INDUSTRIES_COPY.products[l]}>
                      {t.products.map(key => {
                        const family = productByKey(key)!;
                        return (
                          <a key={key} href={localeHref(family.overview, l)} className="rounded-full border border-deep/20 bg-card/70 px-2.5 py-0.5 text-[11.5px] font-semibold text-deep hover:border-primary hover:text-primary">
                            {family.name[l]}
                          </a>
                        );
                      })}
                    </div>
                    <a href={localeHref(t.href, l)} className="mt-2 rounded-[8px] bg-deep px-5 py-2 text-[13px] font-bold text-paper transition-colors hover:bg-primary max-md:mt-2 max-md:px-2.5 max-md:py-1 max-md:text-[12px]">
                      {INDUSTRIES_COPY.more[l]}
                      <span className="sr-only"> — {t.title[l]}</span>
                    </a>
                  </>
                ) : (
                  <h3 className="text-[20px] font-bold text-light max-md:text-[16px]">
                    <button type="button" onClick={() => setActive(i)} className="rounded-sm focus-visible:outline-2 focus-visible:outline-mint">{t.title[l]}</button>
                  </h3>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
