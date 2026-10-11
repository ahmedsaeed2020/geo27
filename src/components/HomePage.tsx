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

export default function HomePage() {
  return (
    <div className="min-h-screen bg-paper font-plex">
      <Header />
      <main>
        <Hero />
        <TrustStrip />
        <ChaosToControl />
        <ProductBand />
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
