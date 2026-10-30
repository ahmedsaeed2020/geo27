import { useLocale, localizeTree } from "@/lib/i18n";
import { ShieldCheck, UserLock, FileSignature, FolderOpen, Bot, Waypoints } from "lucide-react";

const CARDS: { title: string; desc: string; icon: React.ReactNode | null }[] = [
  { title: "الأمان · MFA", desc: "مصادقة متعددة العوامل وحماية الوصول لكل حساب.", icon: null },
  { title: "الصلاحيات والمستخدمون", desc: "أدوار دقيقة لكل فرع ومستخدم، وسجل عمليات كامل.", icon: <UserLock size={25} /> },
  { title: "التوقيع الرقمي", desc: "اعتماد رقمي للمستندات داخل دورة العمل.", icon: <FileSignature size={25} /> },
  { title: "إدارة المستندات", desc: "أرشفة مرتبطة مباشرة بالعمليات والمعاملات.", icon: <FolderOpen size={25} /> },
  { title: "الذكاء الاصطناعي", desc: "مؤشرات وتنبيهات لحظية مبنية على بيانات نظامك.", icon: <Gauge size={25} /> },
  { title: "التكاملات", desc: "WooCommerce و API وربط منصاتك الخارجية.", icon: null },
];

void ShieldCheck;
void Waypoints;

export default function Capabilities() {
  const locale = useLocale();
  return localizeTree((
    <section
      id="capabilities"
      className="py-20"
      style={{ background: "linear-gradient(160deg, #0a5a44, #08140F)" }}
    >
      <div className="mx-auto max-w-[1240px] px-6">
        <div className="text-center">
          <h4 className="font-monospace text-[20px] font-bold tracking-[2px] text-mint uppercase">
            القدرات
          </h4>
          <h2 className="mt-3 text-[36px] leading-[1.2] font-extrabold text-white">
            قدرات تمتد عبر النظام كله.
          </h2>
          <p className="mx-auto mt-4 max-w-[620px] text-[17px] leading-[1.7] text-[rgba(244,243,238,.74)]">
            ليست موديولات مستقلة — بل أساس أمني وتشغيلي يدعم كل عملية في Digit.
          </p>
        </div>

        <div className="mt-12 grid grid-cols-3 gap-8 max-lg:gap-5 max-md:grid-cols-1">
          {CARDS.map((c) => (
            <div
              key={c.title}
              data-motion-card
              className="rounded-[16px] border border-[rgba(244,243,238,.14)] bg-[rgba(244,243,238,.06)] p-[22px] text-start"
            >
              {c.icon && <div className="mb-3 text-mint">{c.icon}</div>}
              <h3 className="text-[16px] font-extrabold text-white">{c.title}</h3>
              <p className="mt-1.5 text-[13px] leading-[1.7] text-[rgba(244,243,238,.66)]">{c.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  ), locale);
}
