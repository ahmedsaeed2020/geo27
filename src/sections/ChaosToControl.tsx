import { useLocale, localeHref } from "@/lib/i18n";
import { SectionHeading } from '@/components/cms/SectionText';
import { CHAOS, CHAOS_PAINS, CHAOS_ROWS } from "@/content/home";
import { productByKey } from "@/content/catalog";

const XIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="h-[15px] w-[15px]" aria-hidden="true">
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);

const CheckIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="h-[15px] w-[15px]" aria-hidden="true">
    <path d="M5 13l4 4L19 7" />
  </svg>
);

/** What gets lost between departments, and the six DIGIT products that each own one part of the flow. */
export default function ChaosToControl() {
  const l = useLocale();
  return (
    <section id="chaos-to-control" className="bg-paper">
      <div className="relative z-10 mx-auto max-w-[1600px] px-8 py-20 max-md:px-4">
        <div className="mx-auto mb-12 max-w-[700px] text-center">
          <div className="font-monospace text-[12px] font-bold tracking-[0.14em] text-primary uppercase">{CHAOS.eyebrow[l]}</div>
          <SectionHeading k="chaos" className="font-archivo mx-0 my-2.5 text-[34px] leading-[1.16] font-extrabold tracking-[-0.025em] text-ink max-md:text-[27px]">
            {CHAOS.heading[l]}
          </SectionHeading>
          <p className="text-[16.5px] leading-[1.8] text-ink/62">{CHAOS.lede[l]}</p>
        </div>

        <div className="mx-auto grid max-w-[1120px] grid-cols-[1fr_auto_1.15fr] items-center gap-7 max-md:grid-cols-1 max-md:gap-[18px]">
          <ul className="flex list-none flex-col gap-[11px] p-0">
            {CHAOS_PAINS.map((p, i) => (
              <li
                key={p.en}
                data-motion-step
                className={`flex items-center gap-[11px] rounded-[12px] border border-deep/12 bg-card px-4 py-3.5 text-[13.5px] text-ink/78 shadow-[0_8px_22px_rgba(6,78,59,.05)] ${i % 2 === 0 ? "rotate-[-1.2deg]" : "rotate-[1.2deg]"}`}
              >
                <span className="flex h-[26px] w-[26px] flex-none items-center justify-center rounded-[7px] bg-destructive/10 text-destructive">{XIcon}</span>
                {p[l]}
              </li>
            ))}
          </ul>

          <div className="flex flex-col items-center gap-2 max-md:flex-row max-md:justify-center" aria-hidden="true">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-deep text-mint shadow-[0_14px_30px_rgba(6,78,59,.3)]">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" className="h-[30px] w-[30px] max-md:-rotate-90 ltr:rotate-180 max-md:ltr:-rotate-90">
                <path d="M19 12H5M12 5l-7 7 7 7" />
              </svg>
            </div>
            <div className="font-monospace text-[11px] font-bold text-primary">DIGIT</div>
          </div>

          <div className="relative overflow-hidden rounded-[18px] bg-deep p-6 text-paper shadow-[0_24px_56px_rgba(6,78,59,.28)] max-md:p-5">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0"
              style={{ backgroundImage: "linear-gradient(rgba(52,211,153,.06) 1px,transparent 1px),linear-gradient(90deg,rgba(52,211,153,.06) 1px,transparent 1px)", backgroundSize: "30px 30px" }}
            />
            <div className="relative mb-3 flex items-center gap-[9px]">
              <svg viewBox="0 0 100 100" width="22" height="22" aria-hidden="true">
                <rect x="18" y="27" width="40" height="13" rx="6.5" className="fill-paper" />
                <rect x="63" y="27" width="19" height="13" rx="5" className="fill-mint" />
                <rect x="18" y="49" width="64" height="13" rx="6.5" className="fill-paper" />
                <rect x="18" y="71" width="50" height="13" rx="6.5" className="fill-paper" />
              </svg>
              <b className="font-archivo text-[16px] font-extrabold">{CHAOS.card[l]}</b>
            </div>
            <ul className="relative list-none p-0">
              {CHAOS_ROWS.map((r, i) => {
                const family = productByKey(r.product)!;
                return (
                  <li key={r.product} data-motion-step className={i < CHAOS_ROWS.length - 1 ? "border-b border-paper/10" : ""}>
                    <a href={localeHref(family.overview, l)} className="group flex items-center justify-between gap-3 py-[11px] text-[13.5px] text-paper/90 focus-visible:outline-2 focus-visible:outline-mint">
                      <span className="min-w-0">
                        <b className="block font-semibold text-paper group-hover:text-mint">{family.name[l]}</b>
                        <span className="text-[12.5px] text-paper/65">{r.label[l]}</span>
                      </span>
                      <span className={`flex flex-none items-center gap-[7px] text-end text-mint ${l === "en" ? "font-monospace text-[11px]" : "text-[12.5px] font-medium"}`}>
                        {CheckIcon}
                        {r.status[l]}
                      </span>
                    </a>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
