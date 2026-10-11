import { createFileRoute } from "@tanstack/react-router";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import Hero from "@/sections/Hero";
import TrustStrip from "@/sections/TrustStrip";
import ChaosToControl from "@/sections/ChaosToControl";
import ProductBand from "@/sections/ProductBand";
import Modules from "@/sections/Modules";
import Capabilities from "@/sections/Capabilities";
import ProblemConveyor from "@/sections/ProblemConveyor";
import Industries from "@/sections/Industries";
import SaudiLocalization from "@/sections/SaudiLocalization";
import Faq from "@/sections/Faq";
import FinalCta from "@/sections/FinalCta";
import PageScene from "@/components/PageScene";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Digit — منصة ERP سعودية | محاسبة، فوترة إلكترونية، نقاط بيع" },
      {
        name: "description",
        content:
          "Digit نظام ERP مالي وتشغيلي للسوق السعودي — محاسبة وفوترة إلكترونية ومبيعات ومشتريات ومخزون ونقاط بيع وتقارير، سحابياً أو داخل سيرفراتك.",
      },
      { property: "og:title", content: "Digit — منصة ERP سعودية" },
      {
        property: "og:description",
        content:
          "منصة واحدة تدير ماليتك وعملياتك ونقاط بيعك — محاسبة وفوترة إلكترونية ومخزون وتقارير، سحابياً أو داخل سيرفراتك.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <div className="min-h-screen bg-paper font-plex">
      <Header />
      <main>
        <Hero />
        <TrustStrip />
        <ChaosToControl />
        <div className="scene-backed scene-content-section scene-content-dark"><PageScene pageKey="home" kind="body" backdrop /><ProductBand /></div>
        <Modules />
        <Capabilities />
        <ProblemConveyor />
        <Industries />
        <SaudiLocalization />
        <Faq />
        <FinalCta />
      </main>
      <Footer />
    </div>
  );
}
