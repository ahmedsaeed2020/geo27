import { useLocale, localizeTree } from "@/lib/i18n";
import { SectionHeading } from '@/components/cms/SectionText';
const PAINS = [
  "فواتير في إكسل وواتساب",
  "كاشير غير مربوط بالحسابات",
  "مخزون غير محدّث",
  "تقارير متأخّرة للإدارة",
  "صلاحيات غير واضحة بين الفروع",
];

const ROWS: { label: string; status: string }[] = [
  { label: "المالية والمحاسبة", status: "مترابطة" },
  { label: "المبيعات والمخزون", status: "لحظية" },
  { label: "نقاط البيع", status: "متصلة" },
  { label: "التقارير والصلاحيات", status: "موحّدة" },
  { label: "الفوترة الإلكترونية", status: "متوافقة" },
];

const XIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="#C0492B" strokeWidth="2.2" className="h-[15px] w-[15px]">
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);

const CheckIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="#34D399" strokeWidth="2.5" className="h-[15px] w-[15px]">
    <path d="M5 13l4 4L19 7" />
  </svg>
);

export default function ChaosToControl() {
  const locale = useLocale();
  return localizeTree((
    <section id="chaos-to-control" className="bg-paper">
      <div className="relative z-10 mx-auto max-w-[1600px] px-8 py-20 max-md:px-4">
        <div className="mx-auto mb-12 max-w-[680px] text-center">
          <div className="font-monospace text-[12px] font-bold tracking-[0.14em] text-primary uppercase">
            التحدّي
          </div>
          <SectionHeading k="chaos" className="font-archivo mx-0 my-2.5 text-[34px] leading-[1.16] font-extrabold tracking-[-0.025em] text-ink max-md:text-[27px]">
            من الفوضى… إلى التحكّم
          </SectionHeading>
          <p className="text-[16.5px] leading-[1.8] text-[rgba(11,31,23,.62)]">
            تدير شركتك بأدوات لا تتكلّم مع بعضها — فتضيع الأرقام ويتأخّر القرار. Digit يجمعها في نظام واحد.
          </p>
        </div>

        <div className="mx-auto grid max-w-[1080px] grid-cols-[1fr_auto_1fr] items-center gap-7 max-md:grid-cols-1 max-md:gap-[18px]">
          {/* chaos side */}
          <div className="flex flex-col gap-[11px]">
            {PAINS.map((p, i) => (
              <div
                key={p}
                data-motion-step
                className={`flex items-center gap-[11px] rounded-[12px] border border-[rgba(6,78,59,.12)] bg-white px-4 py-3.5 text-[13.5px] text-[rgba(11,31,23,.78)] shadow-[0_8px_22px_rgba(6,78,59,.05)] ${
                  i % 2 === 0 ? "rotate-[-1.4deg]" : "rotate-[1.4deg]"
                }`}
              >
                <span className="flex h-[26px] w-[26px] flex-none items-center justify-center rounded-[7px] bg-[rgba(192,73,43,.1)]">
                  {XIcon}
                </span>
                {p}
              </div>
            ))}
          </div>

          {/* arrow */}
          <div className="flex flex-col items-center gap-2 max-md:flex-row">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-deep shadow-[0_14px_30px_rgba(6,78,59,.3)]">
              <svg viewBox="0 0 24 24" fill="none" stroke="#34D399" strokeWidth="2.4" className="h-[30px] w-[30px] max-md:-rotate-90">
                <path d="M19 12H5M12 5l-7 7 7 7" />
              </svg>
            </div>
            <div className="font-monospace text-[11px] font-bold text-primary">Digit</div>
          </div>

          {/* unified side */}
          <div className="relative overflow-hidden rounded-[18px] bg-deep p-6 text-white shadow-[0_24px_56px_rgba(6,78,59,.28)]">
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                backgroundImage:
                  "linear-gradient(rgba(52,211,153,.06) 1px,transparent 1px),linear-gradient(90deg,rgba(52,211,153,.06) 1px,transparent 1px)",
                backgroundSize: "30px 30px",
              }}
            />
            <div className="relative mb-4 flex items-center gap-[9px]">
              <svg viewBox="0 0 100 100" width="22" height="22">
                <rect x="18" y="27" width="40" height="13" rx="6.5" fill="#F4F3EE" />
                <rect x="63" y="27" width="19" height="13" rx="5" fill="#34D399" />
                <rect x="18" y="49" width="64" height="13" rx="6.5" fill="#F4F3EE" />
                <rect x="18" y="71" width="50" height="13" rx="6.5" fill="#F4F3EE" />
              </svg>
              <b className="font-archivo text-[16px] font-extrabold">نظام واحد · صورة واحدة</b>
              <span className="ms-auto rounded-full bg-[rgba(52,211,153,.14)] px-[9px] py-1 font-monospace text-[9px] text-mint">
                Digit
              </span>
            </div>
            {ROWS.map((r, i) => (
              <div
                key={r.label}
                data-motion-step
                className={`relative flex items-center justify-between py-[11px] text-[13.5px] text-[rgba(244,243,238,.9)] ${
                  i < ROWS.length - 1 ? "border-b border-[rgba(244,243,238,.1)]" : ""
                }`}
              >
                <span>{r.label}</span>
                <span className="flex items-center gap-[7px] font-monospace text-[11px] text-mint">
                  {CheckIcon}
                  {r.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  ), locale);
}
