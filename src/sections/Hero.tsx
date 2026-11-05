import { useLocale, localizeTree, localeHref } from "@/lib/i18n";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Pause, Play } from "lucide-react";

import { Link } from "@tanstack/react-router";
import { DigitIcon } from "@/components/icons/DigitIcon";
import { startOrbit, chipSlots, restingAngle, type OrbitHandle, type OrbitRing } from "@/components/orbit/orbit-engine";
import { HOME_ORBIT } from "@/content/orbits";

const DIGIT_ICON =
  "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMDAgMTAwIiB3aWR0aD0iNTEyIiBoZWlnaHQ9IjUxMiIgcm9sZT0iaW1nIiBhcmlhLWxhYmVsPSJEaWdpdCI+CiAgPHJlY3QgeD0iMTgiIHk9IjIyLjUiIHdpZHRoPSI0MCIgaGVpZ2h0PSIxMyIgcng9IjYuNSIgZmlsbD0iI0ZGRkZGRiI+PC9yZWN0PgogIDxyZWN0IHg9IjYzIiB5PSIyMi41IiB3aWR0aD0iMTkiIGhlaWdodD0iMTMiIHJ4PSI1IiBmaWxsPSIjMzREMzk5Ij48L3JlY3Q+CiAgPHJlY3QgeD0iMTgiIHk9IjQzLjUiIHdpZHRoPSI2NCIgaGVpZ2h0PSIxMyIgcng9IjYuNSIgZmlsbD0iI0ZGRkZGRiI+PC9yZWN0PgogIDxyZWN0IHg9IjE4IiB5PSI2NC41IiB3aWR0aD0iNTAiIGhlaWdodD0iMTMiIHJ4PSI2LjUiIGZpbGw9IiNGRkZGRkYiPjwvcmVjdD4KPC9zdmc+";

// Ring sizes are fractions of min(width, height); the module list (labels and pages) lives in src/content/orbits.ts.
const RING_SHAPES = [
  { rx: 0.205, ry: 0.095, period: 74, offset: 0.0 },
  { rx: 0.315, ry: 0.14, period: 104, offset: 0.6 },
  { rx: 0.435, ry: 0.18, period: 150, offset: 1.2 },
];
const RINGS: OrbitRing[] = RING_SHAPES.map((shape, i) => ({ ...shape, count: HOME_ORBIT[i]?.length ?? 0 }));
const CHIPS = HOME_ORBIT.flat();
const SLOTS = chipSlots(RINGS);

const NAV_LABEL = { ar: "أنظمة Digit", en: "Digit systems" };

function OrbitBackground({ paused }: { paused: boolean }) {
  const locale = useLocale();
  const rootRef = useRef<HTMLDivElement>(null);
  const orbitRef = useRef<OrbitHandle | null>(null);
  useEffect(() => { orbitRef.current?.setPaused(paused); }, [paused]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const orbit = startOrbit(root, {
      rings: RINGS,
      geometry: (W, H) => { const R = Math.min(W, H); return { cx: W / 2, cy: H * (H < 720 ? 0.38 : 0.34), sx: R, sy: R }; },
      parallax: true,
      depthBlur: true,
      decorate: (el, { influence }) => {
        el.style.borderColor = `rgba(52,211,153,${(0.3 + influence * 0.55).toFixed(2)})`;
        el.style.boxShadow = `0 10px 30px rgba(0,0,0,.5),0 0 ${(22 + influence * 42).toFixed(0)}px rgba(52,211,153,${(0.14 + influence * 0.34).toFixed(2)}),inset 0 1px 0 rgba(255,255,255,.08)`;
      },
    });
    orbitRef.current = orbit;
    return () => { orbit.destroy(); orbitRef.current = null; };
  }, []);

  return (
    <div ref={rootRef} id="dgt-bg">
      <div className="dgt-bloom" aria-hidden="true" />
      <div className="dgt-corona" aria-hidden="true" />
      <div className="dgt-space" aria-hidden="true" />
      <svg className="dgt-lines" data-orbit-lines aria-hidden="true" />
      <div className="dgt-system">
        <div className="dgt-ring dgt-r1" data-orbit-ring aria-hidden="true" />
        <div className="dgt-ring dgt-r2" data-orbit-ring aria-hidden="true" />
        <div className="dgt-ring dgt-r3" data-orbit-ring aria-hidden="true" />
        <div className="dgt-core" data-orbit-core aria-hidden="true">
          <div className="dgt-halo" />
          <div className="dgt-disc">
            <img src={DIGIT_ICON} alt="" />
          </div>
        </div>
        {/* Every module is a link to its page: its name shows on hover or focus and the orbit stops while it does. */}
        <nav aria-label={NAV_LABEL[locale]} className="dgt-nav">
          {CHIPS.map((chip, i) => {
            const slot = SLOTS[i]!;
            const ring = RINGS[slot.ring]!;
            const a = restingAngle(ring, slot.j);
            return (
              <Link
                key={chip.id}
                to={localeHref(chip.path, locale)}
                className="dgt-chip"
                data-orbit-chip
                style={{ "--ox": (Math.cos(a) * ring.rx * 100).toFixed(2), "--oy": (Math.sin(a) * ring.ry * 100).toFixed(2) } as CSSProperties}
              >
                <DigitIcon name={chip.glyph} />
                <span className="dgt-tip">{chip.label[locale]}</span>
              </Link>
            );
          })}
        </nav>
      </div>
      <div className="dgt-vignette" aria-hidden="true" />
    </div>
  );
}

const PAUSE_COPY = {
  pause: { ar: "إيقاف الحركة", en: "Pause motion" },
  play: { ar: "تشغيل الحركة", en: "Play motion" },
};

export default function Hero() {
  const locale = useLocale();
  const [paused, setPaused] = useState(false);
  return localizeTree((
    <section id="digit-orbit" className="relative min-h-[60vh] overflow-hidden bg-dark" data-paused={paused ? "" : undefined}>
      <style>{`
#dgt-bg{position:absolute;inset:0;z-index:0;overflow:hidden;pointer-events:none;background:#08140F;font-family:'IBM Plex Sans Arabic',-apple-system,Segoe UI,Tahoma,sans-serif;}
#dgt-bg *{box-sizing:border-box;}
#dgt-bg .dgt-bloom{position:absolute;left:50%;top:34%;width:150vmax;height:150vmax;transform:translate(-50%,-50%);animation:dgtBloom 7s ease-in-out infinite;background:radial-gradient(circle at 50% 50%,rgba(52,211,153,.34) 0%,rgba(63,203,134,.20) 10%,rgba(10,135,84,.14) 22%,rgba(6,78,59,.07) 38%,rgba(8,20,15,0) 56%);}
@keyframes dgtBloom{0%,100%{opacity:.85;transform:translate(-50%,-50%) scale(1);}50%{opacity:1;transform:translate(-50%,-50%) scale(1.06);}}
#dgt-bg .dgt-corona{position:absolute;left:50%;top:34%;width:640px;height:640px;transform:translate(-50%,-50%);opacity:.55;mix-blend-mode:screen;animation:dgtSpin 48s linear infinite;background:conic-gradient(from 0deg,rgba(52,211,153,0) 0deg,rgba(52,211,153,.16) 12deg,rgba(52,211,153,0) 24deg,rgba(52,211,153,0) 40deg,rgba(63,203,134,.14) 52deg,rgba(52,211,153,0) 64deg,rgba(52,211,153,0) 96deg,rgba(52,211,153,.16) 108deg,rgba(52,211,153,0) 120deg,rgba(52,211,153,0) 160deg,rgba(63,203,134,.12) 172deg,rgba(52,211,153,0) 184deg,rgba(52,211,153,0) 220deg,rgba(52,211,153,.15) 232deg,rgba(52,211,153,0) 244deg,rgba(52,211,153,0) 290deg,rgba(63,203,134,.13) 302deg,rgba(52,211,153,0) 314deg,rgba(52,211,153,0) 360deg);-webkit-mask:radial-gradient(circle at 50% 50%,rgba(0,0,0,0) 84px,#000 130px,rgba(0,0,0,.35) 250px,transparent 330px);mask:radial-gradient(circle at 50% 50%,rgba(0,0,0,0) 84px,#000 130px,rgba(0,0,0,.35) 250px,transparent 330px);}
@keyframes dgtSpin{to{transform:translate(-50%,-50%) rotate(360deg);}}
#dgt-bg .dgt-space{position:absolute;inset:0;background:radial-gradient(circle at 50% 34%,rgba(52,211,153,.05) 0%,rgba(8,20,15,0) 60%),radial-gradient(1px 1px at 20% 30%,rgba(52,211,153,.5),transparent),radial-gradient(1px 1px at 80% 20%,rgba(52,211,153,.35),transparent),radial-gradient(1px 1px at 65% 75%,rgba(52,211,153,.4),transparent),radial-gradient(1px 1px at 30% 80%,rgba(52,211,153,.3),transparent),radial-gradient(1px 1px at 88% 62%,rgba(52,211,153,.3),transparent),radial-gradient(1px 1px at 12% 60%,rgba(52,211,153,.25),transparent);}
#dgt-bg .dgt-lines{position:absolute;inset:0;}
#dgt-bg .dgt-system{position:absolute;inset:0;}
#dgt-bg .dgt-ring{position:absolute;left:50%;top:34%;transform:translate(-50%,-50%);border:1px solid rgba(52,211,153,.10);border-radius:50%;}
#dgt-bg .dgt-r1{border-color:rgba(52,211,153,.12);}
#dgt-bg .dgt-r2{border-color:rgba(52,211,153,.09);}
#dgt-bg .dgt-r3{border-color:rgba(52,211,153,.07);}
#dgt-bg .dgt-core{position:absolute;left:50%;top:34%;z-index:90;transform:translate(-50%,-50%);display:grid;place-items:center;}
#dgt-bg .dgt-halo{position:absolute;width:260px;height:260px;border-radius:50%;animation:dgtBreathe 6s ease-in-out infinite;background:radial-gradient(circle at 50% 50%,rgba(63,203,134,.45) 0%,rgba(10,135,84,.20) 40%,rgba(8,20,15,0) 70%);}
#dgt-bg .dgt-disc{position:relative;width:122px;height:122px;border-radius:50%;display:grid;place-items:center;animation:dgtPulse 6s ease-in-out infinite;border:1px solid rgba(63,203,134,.55);background:radial-gradient(circle at 50% 32%,rgba(23,64,47,.96),rgba(7,22,16,.98)),radial-gradient(circle at 50% 20%,rgba(63,203,134,.5),rgba(8,20,15,0) 60%);box-shadow:0 0 0 6px rgba(52,211,153,.06),0 0 54px rgba(52,211,153,.5),0 0 120px rgba(52,211,153,.28),inset 0 2px 0 rgba(255,255,255,.14),inset 0 0 30px rgba(52,211,153,.22);}
#dgt-bg .dgt-disc img{width:62px;height:62px;display:block;filter:drop-shadow(0 0 12px rgba(52,211,153,.75));}
@keyframes dgtBreathe{0%,100%{opacity:.85;transform:scale(1);}50%{opacity:1;transform:scale(1.1);}}
@keyframes dgtPulse{0%,100%{box-shadow:0 0 0 6px rgba(52,211,153,.06),0 0 54px rgba(52,211,153,.46),0 0 120px rgba(52,211,153,.24),inset 0 2px 0 rgba(255,255,255,.14),inset 0 0 30px rgba(52,211,153,.2);}50%{box-shadow:0 0 0 9px rgba(52,211,153,.09),0 0 78px rgba(52,211,153,.64),0 0 150px rgba(52,211,153,.34),inset 0 2px 0 rgba(255,255,255,.18),inset 0 0 36px rgba(52,211,153,.28);}}
#dgt-bg .dgt-chip{position:absolute;left:0;top:0;width:78px;height:78px;border-radius:22px;display:grid;place-items:center;transform:translate(-50%,-50%);will-change:transform,opacity,filter,box-shadow;border-color:rgba(52,211,153,.30);transition:box-shadow .18s ease,border-color .18s ease,filter .18s ease;background:linear-gradient(160deg,rgba(20,50,37,.94),rgba(9,24,18,.94));border:1px solid rgba(52,211,153,.3);box-shadow:0 10px 30px rgba(0,0,0,.5),0 0 22px rgba(52,211,153,.14),inset 0 1px 0 rgba(255,255,255,.08);}
#dgt-bg .dgt-chip img{width:42px;height:42px;display:block;filter:drop-shadow(0 0 6px rgba(52,211,153,.45));}
#dgt-bg .dgt-vignette{position:absolute;inset:0;background:radial-gradient(ellipse 80% 80% at 50% 34%,rgba(8,20,15,0) 55%,rgba(8,20,15,.55) 100%);}
@media (max-height:720px){#dgt-bg .dgt-bloom,#dgt-bg .dgt-corona{top:38%;}#dgt-bg .dgt-ring,#dgt-bg .dgt-core{top:38%;}}
@media (prefers-reduced-motion:reduce){#dgt-bg .dgt-halo,#dgt-bg .dgt-disc,#dgt-bg .dgt-bloom,#dgt-bg .dgt-corona{animation:none;}}
      `}</style>
      <OrbitBackground paused={paused} />
      <button type="button" className="dm-orbit-pause" onClick={() => setPaused(p => !p)} aria-pressed={paused}>
        {paused ? <Play aria-hidden="true" /> : <Pause aria-hidden="true" />}
        <span>{paused ? PAUSE_COPY.play[locale] : PAUSE_COPY.pause[locale]}</span>
      </button>
      <div className="dm-orbit-copy relative z-[2] mx-auto max-w-[1600px] px-6 pt-[340px] pb-[40px] text-center lg:pt-[600px]">
        <p className="text-[28px] font-medium text-mint lg:text-[44px]">محاسبتك أوضح مع ديجيت</p>
        <h2 className="mx-auto mt-2 px-0 text-[34px] leading-[1.25] font-bold text-paper lg:px-[50px] lg:text-[56px]">
          منصة واحدة تدير ماليتك وعملياتك ونقاط بيعك.
        </h2>
        <p className="mx-auto mt-3 max-w-[900px] px-0 py-px text-[16px] text-[#C2CCC5] lg:px-[50px] lg:text-[22px]">
          Digit نظام ERP مالي وتشغيلي للسوق السعودي — محاسبة وفوترة إلكترونية ومبيعات ومشتريات ومخزون ونقاط بيع وتقارير، سحابياً أو داخل سيرفراتك.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
          <a
            href="/demo"
            className="rounded-[12px] bg-primary px-10 py-4 text-[17px] font-semibold text-white transition-colors hover:bg-deep"
          >
            اطلب عرض سعر
          </a>
          <a
            href="/demo"
            className="rounded-[12px] border border-mint bg-transparent px-10 py-4 text-[17px] font-semibold text-mint transition-colors hover:bg-mint/10"
          >
            احجز Demo
          </a>
        </div>
        <p className="pt-[29px] text-[15px] font-bold text-[#C3C3C3]">
          يدعم الفوترة الإلكترونية · يعتمد عليه أكثر من 200 منشأة سعودية
        </p>
      </div>
    </section>
  ), locale);
}
