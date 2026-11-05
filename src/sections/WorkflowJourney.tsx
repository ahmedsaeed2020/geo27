import { useId, useRef, useState, type KeyboardEvent } from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { shot as productShot } from '@/content/product-shots';
import { JOURNEY, JOURNEY_STEPS, journeyHref } from '@/content/home';
import { useLocale, localeHref } from '@/lib/i18n';
import ShotFrame from '@/components/product/ShotFrame';
import ShotLightbox from '@/components/product/ShotLightbox';
import { SectionHeading } from '@/components/cms/SectionText';

/**
 * One customer order seen from four DIGIT Pro angles. Each angle is a real V4 workspace (or CFO question): its
 * question, roles and real screen, with a link that opens that workspace on its department page.
 */
export default function WorkflowJourney() {
  const l = useLocale();
  const uid = useId();
  const [active, setActive] = useState(0);
  const [zoom, setZoom] = useState(false);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const step = JOURNEY_STEPS[active]!;
  const screen = productShot(step.shot);
  const Arrow = l === 'ar' ? ArrowLeft : ArrowRight;

  const select = (i: number, focus = false) => {
    const next = (i + JOURNEY_STEPS.length) % JOURNEY_STEPS.length;
    setActive(next);
    if (focus) tabs.current[next]?.focus();
  };
  const onKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    const forward = e.key === 'ArrowDown' || (l === 'ar' ? e.key === 'ArrowLeft' : e.key === 'ArrowRight');
    const back = e.key === 'ArrowUp' || (l === 'ar' ? e.key === 'ArrowRight' : e.key === 'ArrowLeft');
    if (forward) select(active + 1, true);
    else if (back) select(active - 1, true);
    else if (e.key === 'Home') select(0, true);
    else if (e.key === 'End') select(JOURNEY_STEPS.length - 1, true);
    else return;
    e.preventDefault();
  };

  return (
    <section id="workflow-journey" className="bg-paper2 px-4 py-20 max-md:py-14">
      <div className="mx-auto max-w-6xl">
        <div className="mb-10 max-w-[720px]">
          <p className={`text-[13px] font-bold text-primary ${l === 'en' ? 'font-monospace tracking-[0.14em] uppercase' : ''}`}>{JOURNEY.eyebrow[l]}</p>
          <SectionHeading k="journey" className="mt-2 text-4xl font-bold text-foreground max-md:text-[28px]">{JOURNEY.heading[l]}</SectionHeading>
          <p className="mt-3 text-[16.5px] leading-[1.8] text-body2">{JOURNEY.lede[l]}</p>
        </div>

        <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <div role="tablist" aria-orientation="vertical" aria-label={JOURNEY.heading[l]} className="relative flex flex-col gap-2.5">
            <span aria-hidden="true" className="absolute top-6 bottom-6 start-[23px] w-px bg-primary/20" />
            {JOURNEY_STEPS.map((s, i) => {
              const on = i === active;
              return (
                <button
                  key={s.ws}
                  ref={el => { tabs.current[i] = el; }}
                  type="button"
                  role="tab"
                  id={`${uid}-tab-${i}`}
                  aria-selected={on}
                  aria-controls={`${uid}-panel`}
                  tabIndex={on ? 0 : -1}
                  onClick={() => select(i)}
                  onKeyDown={onKey}
                  data-motion-step
                  className={`relative flex items-start gap-4 rounded-[14px] border p-3.5 text-start transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${on ? 'border-primary bg-card shadow-[0_14px_34px_rgba(6,78,59,.10)]' : 'border-transparent hover:border-dline hover:bg-card/70'}`}
                >
                  <span className={`relative z-[1] flex h-[34px] w-[34px] flex-none items-center justify-center rounded-full font-monospace text-[13px] font-bold ${on ? 'bg-primary text-primary-foreground' : 'border border-primary/30 bg-paper2 text-primary'}`}>
                    {i + 1}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[17px] font-bold text-deep">{s.label[l]}</span>
                    <span className={`mt-0.5 block text-[14px] leading-[1.6] ${on ? 'text-foreground' : 'text-body2'}`}>{s.question[l]}</span>
                  </span>
                </button>
              );
            })}
            <a href={localeHref('/pro', l)} className="mt-2 inline-flex items-center gap-2 self-start ps-[58px] text-[14.5px] font-semibold text-primary hover:underline">
              {JOURNEY.all[l]} <Arrow className="h-4 w-4" aria-hidden="true" />
            </a>
          </div>

          <div role="tabpanel" id={`${uid}-panel`} aria-labelledby={`${uid}-tab-${active}`} className="min-w-0">
            <ShotFrame shot={screen} size="lead" onOpen={() => setZoom(true)} />
            <div className="mt-5 rounded-[14px] border border-dline bg-card p-5">
              <p className={`text-[12px] font-bold text-primary ${l === 'en' ? 'font-monospace tracking-[0.12em] uppercase' : ''}`}>
                {JOURNEY.step[l]} {active + 1} {JOURNEY.of[l]} {JOURNEY_STEPS.length} · {step.label[l]}
              </p>
              <p className="mt-2 text-[16px] leading-[1.75] text-foreground">{step.lede[l]}</p>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <span className="text-[13px] font-semibold text-body2">{JOURNEY.roles[l]}:</span>
                {step.roles.map(r => (
                  <span key={r.en} className="rounded-full bg-light px-3 py-1 text-[12.5px] font-medium text-deep">{r[l]}</span>
                ))}
              </div>
              <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                <a href={localeHref(journeyHref(step), l)} className="inline-flex items-center gap-2 rounded-[10px] bg-deep px-4 py-2.5 text-[14.5px] font-semibold text-paper transition-colors hover:bg-primary">
                  {step.open[l]} <Arrow className="h-4 w-4" aria-hidden="true" />
                </a>
                <button type="button" onClick={() => select(active + 1)} className="text-[14px] font-semibold text-primary hover:underline">
                  {JOURNEY.next[l]}: {JOURNEY_STEPS[(active + 1) % JOURNEY_STEPS.length]!.label[l]}
                </button>
              </div>
            </div>
          </div>
        </div>
        {zoom && <ShotLightbox shots={[screen]} index={0} onIndexChange={() => {}} onClose={() => setZoom(false)} />}
      </div>
    </section>
  );
}
