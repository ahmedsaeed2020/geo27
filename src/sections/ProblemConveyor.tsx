import { useRef, useState } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { useLocale, localeHref } from "@/lib/i18n";
import ShotFrame from "@/components/product/ShotFrame";
import ShotLightbox from "@/components/product/ShotLightbox";
import { shot } from "@/content/product-shots";
import { PROBLEM_SHOTS, PROOF_COPY } from "@/content/product-proof";
import { PROBLEMS, PROBLEM_SLIDES } from "@/content/home";
import "@/product-proof.css";
import { SectionHeading } from '@/components/cms/SectionText';

const PainMark = (
  <svg viewBox="0 0 24 24" className="h-6 w-6 fill-body2" aria-hidden="true">
    <rect x="10.5" y="5" width="3" height="9" rx="1.5" />
    <rect x="10.5" y="16.5" width="3" height="3" rx="1.5" />
  </svg>
);

const SolMark = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6 text-primary" aria-hidden="true">
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

/** Icons are drawn for right-to-left reading and mirrored in English. */
function NavButton({ dir, onClick, label }: { dir: "prev" | "next"; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="flex h-[46px] w-[46px] items-center justify-center rounded-[13px] border border-deep/12 bg-card text-body2 transition-all hover:border-deep hover:bg-deep hover:text-paper focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="h-[21px] w-[21px] ltr:rotate-180" aria-hidden="true">
        {dir === "prev" ? <path d="M9 6l6 6-6 6" /> : <path d="M15 6l-6 6 6 6" />}
      </svg>
    </button>
  );
}

/** Eight familiar ERP pains, each answered with what DIGIT does and the page that shows it. */
export default function ProblemConveyor() {
  const l = useLocale();
  const [idx, setIdx] = useState(0);
  const touchX = useRef<number | null>(null);
  const n = PROBLEM_SLIDES.length;
  const go = (i: number) => setIdx(((i % n) + n) % n);
  // Real screenshots back some of the challenges; the lightbox steps through those.
  const proofShots = PROBLEM_SLIDES.flatMap(slide => PROBLEM_SHOTS[slide.key] ? [shot(PROBLEM_SHOTS[slide.key]!)] : []);
  const [openShot, setOpenShot] = useState<number | null>(null);
  const currentShot = PROBLEM_SHOTS[PROBLEM_SLIDES[idx]?.key ?? ""];
  const Arrow = l === "ar" ? ArrowLeft : ArrowRight;
  const pad = (v: number) => String(v).padStart(2, "0");

  return (
    <section id="problem" className="bg-paper2 py-[88px] max-lg:py-[72px] max-md:py-14" aria-roledescription={l === "ar" ? "عرض شرائح" : "carousel"} aria-labelledby="problem-title">
      <div className="mx-auto max-w-[1240px] px-6 max-md:px-4">
        <div className="mx-auto mb-11 max-w-[680px] text-center">
          <div className="font-monospace text-[12px] font-bold tracking-[0.16em] text-primary uppercase">{PROBLEMS.eyebrow[l]}</div>
          <SectionHeading k="problems" id="problem-title" className="mt-3.5 text-[clamp(28px,3.4vw,42px)] leading-[1.18] font-bold tracking-[-0.02em] text-ink">
            {PROBLEMS.heading[l]}
          </SectionHeading>
          <p className="mx-auto mt-4 text-[17px] leading-[1.75] text-ink/62">{PROBLEMS.lede[l]}</p>
        </div>

        <div className="relative mx-auto max-w-[1040px] px-12 max-md:px-0">
          <div className="mb-[34px] flex items-center justify-center gap-2">
            {PROBLEM_SLIDES.map((s, i) => (
              <button
                key={s.key}
                type="button"
                aria-label={`${PROBLEMS.slide[l]} ${i + 1}: ${s.tag[l]}`}
                aria-current={i === idx ? "true" : undefined}
                onClick={() => go(i)}
                className={`h-2 rounded-full transition-all ${i === idx ? "w-[22px] bg-primary" : "w-2 bg-body2/30 hover:bg-body2/50"}`}
              />
            ))}
          </div>

          <div
            className="relative"
            aria-live="polite"
            onTouchStart={e => { touchX.current = e.touches[0]?.clientX ?? null; }}
            onTouchEnd={e => {
              if (touchX.current === null) return;
              const dx = (e.changedTouches[0]?.clientX ?? touchX.current) - touchX.current;
              const forward = l === "ar" ? dx > 0 : dx < 0;
              if (Math.abs(dx) > 40) go(forward ? idx + 1 : idx - 1);
              touchX.current = null;
            }}
          >
            {PROBLEM_SLIDES.map((s, i) => {
              const proof = PROBLEM_SHOTS[s.key];
              return (
                <div key={s.key} className={i === idx ? "block" : "hidden"} role="group" aria-roledescription={l === "ar" ? "شريحة" : "slide"} aria-label={`${i + 1} / ${n}`}>
                  <div className="mx-auto flex max-w-[940px] items-stretch justify-center gap-5 max-md:flex-col max-md:gap-0" style={i === idx ? { animation: "dcvfade .42s cubic-bezier(.2,.7,.2,1)" } : undefined}>
                    <div className="flex min-h-[188px] flex-1 flex-col justify-center gap-[18px] rounded-[18px] border border-body2/16 bg-paper p-[30px] max-lg:min-h-[170px] max-lg:p-6">
                      <div className={`text-[12px] font-bold text-body2 ${l === "en" ? "font-monospace tracking-[0.10em]" : ""}`}>{PROBLEMS.today[l]}</div>
                      <div className="flex items-center gap-[15px]">
                        <span className="flex h-[46px] w-[46px] flex-none items-center justify-center rounded-[13px] bg-body2/10">{PainMark}</span>
                        <span className="text-[clamp(18px,1.7vw,22px)] leading-[1.4] font-semibold text-ink/70">{s.pain[l]}</span>
                      </div>
                    </div>

                    <div className="flex w-[54px] flex-none flex-col items-center justify-center gap-2.5 max-md:w-full max-md:py-3.5" aria-hidden="true">
                      <span className="flex h-[54px] w-[54px] items-center justify-center rounded-full bg-mint/16 text-primary max-md:-rotate-90 ltr:rotate-180 max-md:ltr:-rotate-90">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="h-[26px] w-[26px]"><path d="M18 12H7" /><path d="M11 7 6 12 11 17" /></svg>
                      </span>
                      <span className={`text-[11px] font-bold text-primary max-md:hidden ${l === "en" ? "font-monospace text-[9.5px]" : ""}`}>{s.tag[l]}</span>
                    </div>

                    <div className="relative flex min-h-[188px] flex-1 flex-col justify-center gap-[14px] rounded-[18px] border border-primary/18 bg-card p-[30px] shadow-[0_14px_36px_rgba(6,78,59,.10)] max-lg:min-h-[170px] max-lg:p-6">
                      <span className="absolute inset-y-4 start-0 w-1 rounded-full bg-mint" aria-hidden="true" />
                      <div className={`text-[12px] font-bold text-primary ${l === "en" ? "font-monospace tracking-[0.10em]" : ""}`}>{PROBLEMS.with[l]}</div>
                      <div className="flex items-center gap-[15px] max-md:flex-wrap">
                        <span className="flex h-[46px] w-[46px] flex-none items-center justify-center rounded-[13px] bg-primary/12">{SolMark}</span>
                        <span className="min-w-0 flex-1 text-[clamp(18px,1.7vw,22px)] leading-[1.4] font-bold text-deep">{s.sol[l]}</span>
                        {proof && (
                          <div className="pp-thumb-slot">
                            <ShotFrame shot={shot(proof)} size="thumb" mode="screen" onOpen={() => setOpenShot(proofShots.findIndex(item => item.id === proof))} />
                          </div>
                        )}
                      </div>
                      <a href={localeHref(s.href, l)} className="inline-flex items-center gap-1.5 self-start text-[14px] font-semibold text-primary hover:underline">
                        {s.link[l]} <Arrow className="h-4 w-4" aria-hidden="true" />
                      </a>
                    </div>
                  </div>
                </div>
              );
            })}

            <div className="absolute start-0 top-1/2 -translate-x-[calc(100%+6px)] -translate-y-1/2 max-md:hidden rtl:translate-x-[calc(100%+6px)]">
              <NavButton dir="prev" label={PROBLEMS.prev[l]} onClick={() => go(idx - 1)} />
            </div>
            <div className="absolute end-0 top-1/2 translate-x-[calc(100%+6px)] -translate-y-1/2 max-md:hidden rtl:-translate-x-[calc(100%+6px)]">
              <NavButton dir="next" label={PROBLEMS.next[l]} onClick={() => go(idx + 1)} />
            </div>
          </div>

          <p className="pp-footnote pp-thumb-note" style={{ visibility: currentShot ? "visible" : "hidden" }} aria-hidden={currentShot ? undefined : true}>
            {PROOF_COPY.footnote[l]}
          </p>

          <div className="mx-auto mt-[30px] flex max-w-[940px] items-center justify-between max-md:justify-center">
            <div className="font-monospace text-[13px] text-body2 max-md:hidden">
              <b className="text-[16px] text-primary">{pad(idx + 1)}</b> / {pad(n)}
            </div>
            <div className="flex gap-2.5">
              <NavButton dir="prev" label={PROBLEMS.prev[l]} onClick={() => go(idx - 1)} />
              <NavButton dir="next" label={PROBLEMS.next[l]} onClick={() => go(idx + 1)} />
            </div>
          </div>
        </div>
      </div>
      <ShotLightbox shots={proofShots} index={openShot} onIndexChange={setOpenShot} onClose={() => setOpenShot(null)} />
      <style>{`@keyframes dcvfade{from{opacity:0;transform:translateX(18px);}to{opacity:1;transform:none;}}@media (prefers-reduced-motion: reduce){#problem [style*=dcvfade]{animation:none!important}}`}</style>
    </section>
  );
}
