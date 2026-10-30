import Header from "@/components/Header";
import Footer from "@/components/Footer";
import Hero from "@/sections/Hero";
import TrustStrip from "@/sections/TrustStrip";
import ChaosToControl from "@/sections/ChaosToControl";
import ProductBand from "@/sections/ProductBand";
import Modules from "@/sections/Modules";
import ProductShowcase from "@/sections/ProductShowcase";
import Capabilities from "@/sections/Capabilities";
import ProblemConveyor from "@/sections/ProblemConveyor";
import Industries from "@/sections/Industries";
import SaudiLocalization from "@/sections/SaudiLocalization";
import Faq from "@/sections/Faq";
import FinalCta from "@/sections/FinalCta";
import { useRef } from "react";
import { usePageMotion } from "@/hooks/use-page-motion";
import { useLocale } from "@/lib/i18n";

export default function HomePage() {
  const mainRef = useRef<HTMLElement>(null);
  const locale = useLocale();
  usePageMotion(mainRef, `home-${locale}`);
  return (
    <div className="min-h-screen bg-paper font-plex">
      <Header />
      <main ref={mainRef}>
        <Hero />
        <TrustStrip />
        <ChaosToControl />
        <ProductBand />
        <Modules />
        <ProductShowcase />
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
