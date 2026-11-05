import { useEffect, useRef } from "react";
import { QrCode } from "lucide-react";
import { useLocale, localeHref } from "@/lib/i18n";
import { SectionHeading } from '@/components/cms/SectionText';
import { SAUDI, SAUDI_TILES } from "@/content/home";

/** Slow emerald light field behind the section; one still frame for reduced motion, paused while off-screen. */
function EmeraldFlow() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const BG = "#08140F";
    const RGB = { deep: "6,78,59", em: "10,135,84", mint: "52,211,153" };
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let W = 0, H = 0, raf = 0, visible = false;

    const cols = [RGB.em, RGB.deep, RGB.mint, RGB.em, RGB.deep];
    const blobs = Array.from({ length: 6 }, (_, i) => ({
      c: cols[i % cols.length]!,
      r: 240 + Math.random() * 320,
      ox: Math.random() * 1000,
      oy: Math.random() * 1000,
      sp: 0.00012 + Math.random() * 0.00018,
      al: i < 2 ? 0.5 : 0.32,
    }));

    function draw(ts: number) {
      const t = ts / 1000;
      ctx!.globalCompositeOperation = "source-over";
      ctx!.fillStyle = BG;
      ctx!.fillRect(0, 0, W, H);
      ctx!.globalCompositeOperation = "lighter";
      for (const b of blobs) {
        const x = W * (0.5 + 0.42 * Math.sin(t * b.sp * 1000 + b.ox));
        const y = H * (0.5 + 0.4 * Math.cos(t * b.sp * 820 + b.oy));
        const g = ctx!.createRadialGradient(x, y, 0, x, y, b.r);
        g.addColorStop(0, `rgba(${b.c},${b.al})`);
        g.addColorStop(1, `rgba(${b.c},0)`);
        ctx!.fillStyle = g;
        ctx!.beginPath();
        ctx!.arc(x, y, b.r, 0, 6.283);
        ctx!.fill();
      }
      ctx!.globalCompositeOperation = "source-over";
      const g2 = ctx!.createLinearGradient(0, 0, 0, H);
      g2.addColorStop(0, "rgba(8,20,15,.5)");
      g2.addColorStop(0.4, "rgba(8,20,15,0)");
      g2.addColorStop(1, "rgba(8,20,15,.6)");
      ctx!.fillStyle = g2;
      ctx!.fillRect(0, 0, W, H);
    }
    function loop(ts: number) {
      draw(ts);
      raf = visible ? requestAnimationFrame(loop) : 0;
    }
    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = canvas!.clientWidth;
      H = canvas!.clientHeight;
      canvas!.width = W * dpr;
      canvas!.height = H * dpr;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      draw(performance.now());
    }
    resize();
    window.addEventListener("resize", resize);

    const io = new IntersectionObserver(([entry]) => {
      visible = !!entry?.isIntersecting && !reduce;
      if (visible && !raf) raf = requestAnimationFrame(loop);
    });
    io.observe(canvas);

    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden bg-dark" aria-hidden="true">
      <canvas ref={canvasRef} className="absolute inset-0 block h-full w-full" />
      <div
        className="absolute inset-0"
        style={{ background: "radial-gradient(ellipse 70% 58% at 58% 48%, rgba(8,20,15,.20) 0%, rgba(8,20,15,.16) 52%, rgba(8,20,15,.34) 100%), linear-gradient(90deg, rgba(8,20,15,.24) 0%, rgba(8,20,15,.62) 52%, rgba(8,20,15,.30) 100%)" }}
      />
    </div>
  );
}

/**
 * Saudi localization in approved wording only: e-invoicing "supports linking with Fatoora", payroll rules and
 * official integrations are confirmed per business, and the invoice is labelled as an illustrative example.
 */
export default function SaudiLocalization() {
  const l = useLocale();
  return (
    <section id="saudi-localization" className="relative overflow-hidden bg-dark py-[100px] max-md:px-4 max-md:py-[54px]" aria-labelledby="saudi-title">
      <EmeraldFlow />
      <div className="relative z-[2] mx-auto max-w-[1240px] px-6 max-md:px-0">
        <div className="text-center">
          <div className="flex items-center justify-center gap-3 text-[16px] font-semibold tracking-[0.5px] text-mint uppercase">
            <span className="inline-block h-[2px] w-[50px] bg-mint" aria-hidden="true" />
            {SAUDI.eyebrow[l]}
            <span className="inline-block h-[2px] w-[50px] bg-mint" aria-hidden="true" />
          </div>
          <SectionHeading k="saudi" id="saudi-title" className="mx-auto mt-4 max-w-[780px] text-[34px] leading-[1.25] font-bold text-paper max-md:text-[26px]">
            {SAUDI.heading[l]}
          </SectionHeading>
          <p className="mx-auto mt-4 max-w-[720px] text-[16px] leading-[1.8] text-paper/66">{SAUDI.lede[l]}</p>
        </div>

        <div className="mt-12 grid grid-cols-[62fr_38fr] items-start gap-8 max-lg:grid-cols-1">
          <ul className="grid list-none grid-cols-3 gap-4 p-0 max-md:grid-cols-1">
            {SAUDI_TILES.map(t => {
              const body = (
                <>
                  <span className="mb-2.5 inline-flex rounded-full bg-mint/12 p-4">
                    <img src={t.icon} alt="" aria-hidden="true" className="h-[28px] w-[28px]" />
                  </span>
                  <h3 className="pt-3.5 text-[16px] font-medium text-paper transition-colors group-hover:text-mint">{t.title[l]}</h3>
                  <p className="mt-1.5 text-[14px] leading-[1.7] text-paper/66 max-lg:text-[13px]">{t.desc[l]}</p>
                </>
              );
              const cls = "group block h-full rounded-[14px] border border-paper/10 bg-deep p-[22px] text-start transition-all hover:bg-gradient-to-b hover:from-ink hover:to-deep";
              return (
                <li key={t.title.en} data-motion-card>
                  {t.href ? <a href={localeHref(t.href, l)} className={`${cls} focus-visible:outline-2 focus-visible:outline-mint`}>{body}</a> : <div className={cls}>{body}</div>}
                </li>
              );
            })}
          </ul>

          <div className="rounded-[18px] border border-paper/10 bg-ink/72 p-6 backdrop-blur-sm">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-[17px] font-bold text-paper">{SAUDI.panel[l]}</h3>
              <span className="inline-block rounded-[20px] bg-mint/15 px-2.5 py-[5px] text-[11px] font-semibold text-mint">{SAUDI.badge[l]}</span>
            </div>

            <figure className="mt-4 rounded-[12px] bg-card p-4">
              <figcaption className="mb-2 inline-block rounded-full bg-light px-2 py-0.5 text-[11px] font-semibold text-deep">{SAUDI.example[l]}</figcaption>
              <div className="flex items-start justify-between">
                <span>
                  <b className="block text-[15px] text-ink">{SAUDI.panel[l]}</b>
                  <span className="text-[12px] text-body2" dir="ltr">INV-0001 · 09/06/2026</span>
                </span>
                <QrCode className="h-11 w-11 text-ink" strokeWidth={1.4} aria-hidden="true" />
              </div>
              <div className="my-1.5 flex justify-between text-[13px] text-body2">
                {SAUDI.net[l]}<span className="text-ink" dir="ltr">10,000.00</span>
              </div>
              <div className="my-1.5 flex justify-between text-[13px] text-body2">
                {SAUDI.vat[l]}<span className="text-ink" dir="ltr">1,500.00</span>
              </div>
              <div className="mt-2 flex justify-between border-t border-dline pt-2 text-[15px]">
                <span className="font-bold text-ink">{SAUDI.total[l]}</span>
                <span className="font-bold text-primary" dir="ltr">11,500.00 SAR</span>
              </div>
            </figure>

            <ul className="mt-4 list-none space-y-2.5 p-0">
              {SAUDI.checks.map(c => (
                <li key={c.en} className="flex items-center gap-2 text-[13.5px] text-paper/90">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 flex-none text-mint" aria-hidden="true">
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                  {c[l]}
                </li>
              ))}
            </ul>

            <a href={localeHref(SAUDI.onboardingHref, l)} className="mt-5 flex items-center justify-between gap-3 border-t border-paper/10 pt-4 text-[13.5px] font-semibold text-mint hover:underline">
              {SAUDI.onboarding[l]}
              <span aria-hidden="true" className="ltr:rotate-180">←</span>
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
