import { useLocale, localizeTree } from "@/lib/i18n";
export default function ProductBand() {
  const locale = useLocale();
  return localizeTree((
    <section
      id="product-band"
      className="bg-cover bg-center py-20"
      style={{
        backgroundImage:
          "linear-gradient(160deg, rgba(10,90,68,.35), rgba(8,20,15,.55)), url(/images/pro1.jpg)",
        backgroundColor: "#0a5a44",
      }}
    >
      <div className="mx-auto grid max-w-[1600px] grid-cols-2 max-md:grid-cols-1">
        {/* empty column revealing the product image */}
        <div className="p-[352px] max-lg:p-[120px] max-md:hidden" />
        <div className="px-6 pt-[267px] pb-[415px] text-center max-lg:py-[120px] max-md:py-20">
          <h4 className="font-monospace text-[20px] font-bold tracking-[2px] text-mint uppercase">
            DIGIT
          </h4>
          <h2 className="mt-3 text-[36px] leading-[1.2] font-extrabold text-white">
            محاسبتك أوضح
          </h2>
          <p className="mx-auto mt-4 max-w-[520px] text-[17px] leading-[1.7] text-[rgba(244,243,238,.74)]">
            ليست موديولات مستقلة — بل أساس أمني وتشغيلي يدعم كل عملية في Digit.
          </p>
        </div>
      </div>
    </section>
  ), locale);
}
