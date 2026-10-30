import { useLocale, localizeTree } from "@/lib/i18n";
import { SectionHeading } from '@/components/cms/SectionText';
export default function FinalCta() {
  const locale = useLocale();
  return localizeTree((
    <section
      id="final"
      className="px-7 py-[84px]"
      style={{ background: "linear-gradient(21deg, #0B1F17 42%, #0A8754 95%)" }}
    >
      <div className="mx-auto flex max-w-[1240px] flex-col items-center gap-3.5 text-center">
        <SectionHeading k="final" className="mb-2.5 text-[38px] leading-[1.2] font-bold tracking-[-1px] text-white max-md:text-[28px]">
          جاهز تشوف كيف يناسب النظام شركتك؟
        </SectionHeading>
        <p className="text-[17px] leading-[1.7] text-[rgba(244,243,238,.74)]">
          احجز عرضاً، أو اطلب تحليل جاهزية ERP، أو شاهد جولة داخل النظام — بلا التزام.
        </p>
        <div className="mt-4 flex flex-wrap items-stretch justify-center gap-3 max-md:w-full max-md:flex-col">
          <a
            href="/demo"
            className="rounded-[11px] bg-mint px-[26px] py-[13px] text-[15px] font-bold text-ink transition-colors hover:bg-[#54e0a8]"
          >
            احجز عرضاً تجريبياً
          </a>
          <a
            href="/demo"
            className="rounded-[11px] border-[1.5px] border-[rgba(244,243,238,.34)] bg-transparent px-[26px] py-[13px] text-[15px] font-bold text-white transition-colors hover:border-mint"
          >
            اطلب تحليل جاهزية ERP
          </a>
          <a
            href="/demo"
            className="rounded-[11px] border-[1.5px] border-[rgba(244,243,238,.34)] bg-transparent px-[26px] py-[13px] text-[15px] font-bold text-white transition-colors hover:border-mint"
          >
            شاهد جولة داخل النظام
          </a>
        </div>
      </div>
    </section>
  ), locale);
}
