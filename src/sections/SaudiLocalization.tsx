import { useEffect, useRef } from "react";

function EmeraldFlow() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const BG = "#08140F";
    const RGB = { deep: "6,78,59", em: "10,135,84", mint: "52,211,153" };
    let W = 0, H = 0, raf = 0;

    const blobs: { c: string; r: number; ox: number; oy: number; sp: number; al: number }[] = [];
    const cols = [RGB.em, RGB.deep, RGB.mint, RGB.em, RGB.deep];
    for (let i = 0; i < 6; i++) {
      blobs.push({
        c: cols[i % cols.length],
        r: 240 + Math.random() * 320,
        ox: Math.random() * 1000,
        oy: Math.random() * 1000,
        sp: 0.00012 + Math.random() * 0.00018,
        al: i < 2 ? 0.5 : 0.32,
      });
    }

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = canvas!.clientWidth;
      H = canvas!.clientHeight;
      canvas!.width = W * dpr;
      canvas!.height = H * dpr;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx!.fillStyle = BG;
      ctx!.fillRect(0, 0, W, H);
    }
    resize();
    window.addEventListener("resize", resize);

    function loop(ts: number) {
      const t = ts / 1000;
      ctx!.globalAlpha = 1;
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
      raf = requestAnimationFrame(loop);
    }
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden bg-dark" aria-hidden="true">
      <canvas ref={canvasRef} className="absolute inset-0 block h-full w-full" />
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 70% 58% at 58% 48%, rgba(8,20,15,.20) 0%, rgba(8,20,15,.16) 52%, rgba(8,20,15,.34) 100%), linear-gradient(90deg, rgba(8,20,15,.24) 0%, rgba(8,20,15,.62) 52%, rgba(8,20,15,.30) 100%)",
        }}
      />
    </div>
  );
}

const TILES: { title: string; desc: string; icon: string }[] = [
  { title: "الفوترة الإلكترونية — المرحلة الثانية", desc: "مصمّم لدعم متطلبات الفوترة الإلكترونية.", icon: "/icons/digit-mod-einvoice-dark-1.svg" },
  { title: "تقارير ضريبة القيمة المضافة", desc: "تقارير ضريبية جاهزة.", icon: "/icons/digit-mod-reports-dark-1.svg" },
  { title: "مدد ونظام حماية الأجور", desc: "رواتب متوافقة مع حماية الأجور.", icon: "/icons/digit-loc-mudad-dark-1.svg" },
  { title: "التأمينات الاجتماعية", desc: "رواتب مرتبطة بالتأمينات.", icon: "/icons/digit-loc-gosi-dark-1.svg" },
  { title: "الهجري والميلادي", desc: "التقويمان في كل الشاشات.", icon: "/icons/digit-ui-calendar-dark.svg" },
  { title: "واجهة عربية وإنجليزية", desc: "واجهة ثنائية اللغة بالكامل.", icon: "/icons/digit-loc-bilingual-dark-1.svg" },
  { title: "شجرة حسابات سعودية", desc: "شجرة حسابات معدّة للسوق.", icon: "/icons/digit-mod-accounts-dark-1.svg" },
  { title: "دعم محلي", desc: "دعم سعودي حقيقي.", icon: "/icons/digit-loc-support-dark-1.svg" },
  { title: "تعدد العملات", desc: "مناسب للخليج.", icon: "/icons/digit-loc-currency-dark-1.svg" },
];

const CHECKS = ["رمز QR يُولَّد تلقائياً", "احتساب وتقارير الضريبة", "تواريخ هجرية وميلادية"];

export default function SaudiLocalization() {
  return (
    <section id="saudi-localization" className="relative overflow-hidden bg-dark py-[100px] max-md:px-4 max-md:py-[54px]">
      <EmeraldFlow />
      <div className="relative z-[2] mx-auto max-w-[1240px] px-6">
        <div className="text-center">
          <div className="flex items-center justify-center gap-3 text-[16px] font-semibold tracking-[0.5px] text-mint uppercase">
            <span className="inline-block h-[2px] w-[50px] bg-mint" />
            التوطين السعودي
            <span className="inline-block h-[2px] w-[50px] bg-mint" />
          </div>
          <h2 className="mx-auto mt-4 max-w-[760px] text-[34px] leading-[1.25] font-bold text-white max-md:text-[26px]">
            جاهز لفاتورة هيئة الزكاة… من اليوم الأول
          </h2>
          <p className="mx-auto mt-4 max-w-[720px] text-[16px] leading-[1.8] text-[#9FB3AA]">
            توطين مُصان داخل المنتج بعقد تحديث دائم — لا عبر شريك خارجي. من الفوترة الإلكترونية إلى مدد والتأمينات والتقويم الهجري.
          </p>
        </div>

        <div className="mt-12 grid grid-cols-[62fr_38fr] items-start gap-8 max-lg:grid-cols-1">
          {/* tiles grid */}
          <div className="grid grid-cols-3 gap-4 max-md:grid-cols-1">
            {TILES.map((t) => (
              <div
                key={t.title}
                className="group rounded-[14px] border border-[#1E2D26] bg-deep p-[22px] text-start shadow-[0_0_50px_rgba(0,0,0,.06)] transition-all hover:bg-gradient-to-b hover:from-ink hover:to-deep"
              >
                <div className="mb-2.5 inline-flex rounded-full bg-[rgba(52,211,153,.12)] p-4">
                  <img src={t.icon} alt="" aria-hidden="true" className="h-[28px] w-[28px]" />
                </div>
                <h3 className="pt-3.5 text-[16px] font-medium text-white transition-colors group-hover:text-mint">
                  {t.title}
                </h3>
                <p className="mt-1.5 text-[14px] leading-[1.7] text-[#9FB3AA] max-lg:text-[13px]">
                  {t.desc}
                </p>
              </div>
            ))}
          </div>

          {/* compliance panel */}
          <div className="rounded-[18px] border border-[#1E2D26] bg-[rgba(11,31,23,.72)] p-6 backdrop-blur-sm">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-[17px] font-bold text-white">مركز التحكم بالامتثال</h3>
              <span className="inline-block rounded-[20px] bg-[rgba(52,211,153,.15)] px-2.5 py-[5px] text-[11px] font-semibold text-mint">
                جاهز للمرحلة الثانية
              </span>
            </div>

            {/* invoice card */}
            <div className="mt-4 rounded-[12px] bg-white p-4">
              <div className="flex items-start justify-between">
                <span>
                  <b className="block text-[15px] text-ink">فاتورة ضريبية</b>
                  <span className="text-[12px] text-body2" dir="ltr">INV-2026-04417 · 09/06/2026</span>
                </span>
                <span className="inline-block h-11 w-11 rounded-[6px] bg-ink" />
              </div>
              <div className="my-1.5 flex justify-between text-[13px] text-body2">
                الإجمالي قبل الضريبة<span className="text-ink" dir="ltr">10,000.00</span>
              </div>
              <div className="my-1.5 flex justify-between text-[13px] text-body2">
                ضريبة القيمة المضافة 15%<span className="text-ink" dir="ltr">1,500.00</span>
              </div>
              <div className="mt-2 flex justify-between border-t border-[#ECEFEC] pt-2 text-[15px]">
                <span className="font-bold text-ink">الإجمالي</span>
                <span className="font-bold text-primary" dir="ltr">11,500.00 SAR</span>
              </div>
            </div>

            {/* checks */}
            <div className="mt-4 space-y-2.5">
              {CHECKS.map((c) => (
                <div key={c} className="flex items-center gap-2 text-[13.5px] text-[rgba(244,243,238,.9)]">
                  <svg viewBox="0 0 24 24" fill="none" stroke="#34D399" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 flex-none">
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                  {c}
                </div>
              ))}
            </div>

            <div className="mt-5 flex justify-between border-t border-[rgba(244,243,238,.1)] pt-4 text-[13px] text-[#9FB3AA]">
              <span>حالة الربط عبر API</span>
              <span className="font-monospace text-mint">متصل ✓</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
