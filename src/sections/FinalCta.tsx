import { useLocale, localeHref } from "@/lib/i18n";
import { SectionHeading } from '@/components/cms/SectionText';
import { FINAL } from "@/content/home";

const ghost = "rounded-[11px] border-[1.5px] border-paper/34 bg-transparent px-[26px] py-[13px] text-[15px] font-bold text-paper transition-colors hover:border-mint focus-visible:outline-2 focus-visible:outline-mint";

/** Closing call to action: the demo form, the quotation form, or the blueprint builder — three different pages. */
export default function FinalCta() {
  const l = useLocale();
  return (
    <section id="final" className="px-7 py-[84px] max-md:px-4 max-md:py-16" style={{ background: "linear-gradient(21deg, var(--ink) 42%, var(--primary) 95%)" }}>
      <div className="mx-auto flex max-w-[1240px] flex-col items-center gap-3.5 text-center">
        <SectionHeading k="final" className="mb-2.5 text-[38px] leading-[1.2] font-bold tracking-[-1px] text-paper max-md:text-[28px]">
          {FINAL.heading[l]}
        </SectionHeading>
        <p className="max-w-[720px] text-[17px] leading-[1.7] text-paper/74">{FINAL.lede[l]}</p>
        <div className="mt-4 flex flex-wrap items-stretch justify-center gap-3 max-md:w-full max-md:flex-col">
          <a href={localeHref("/demo", l)} className="rounded-[11px] bg-mint px-[26px] py-[13px] text-[15px] font-bold text-ink transition-colors hover:bg-mint/85 focus-visible:outline-2 focus-visible:outline-paper">
            {FINAL.demo[l]}
          </a>
          <a href={localeHref("/quote", l)} className={ghost}>{FINAL.quote[l]}</a>
          <a href={localeHref("/blueprint", l)} className={ghost}>{FINAL.blueprint[l]}</a>
        </div>
      </div>
    </section>
  );
}
