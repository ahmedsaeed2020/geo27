import Header from "@/components/Header";
import Footer from "@/components/Footer";
import ProductHeroV3 from '@/sections/ProductHeroV3';
import AppExplorer from '@/sections/AppExplorer';
import WorkflowJourney from '@/sections/WorkflowJourney';
import LeadCapturePanel from '@/components/LeadCapturePanel';
import CmsBlocks from '@/components/cms/CmsBlocks';
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
import { Fragment, useRef, type ReactNode } from "react";
import { usePageMotion } from "@/hooks/use-page-motion";
import { useLocale } from "@/lib/i18n";
import { useSiteConfig } from '@/components/cms/CmsContext';
import { EditableSections } from '@/components/cms/SectionText';
import { arrangeSections, HOME_SECTIONS, type HomeSectionId } from '@/content/section-registry';

const RENDER: Record<HomeSectionId, () => ReactNode> = {
  hero: () => <ProductHeroV3 />,
  trust: () => <TrustStrip />,
  explorer: () => <AppExplorer />,
  journey: () => <WorkflowJourney />,
  chaos: () => <ChaosToControl />,
  band: () => <ProductBand />,
  modules: () => <Modules />,
  showcase: () => <ProductShowcase />,
  capabilities: () => <Capabilities />,
  problems: () => <ProblemConveyor />,
  industries: () => <Industries />,
  saudi: () => <SaudiLocalization />,
  faq: () => <Faq />,
  cms: () => <CmsBlocks />,
  lead: () => <LeadCapturePanel interest="DIGIT Pro" />,
  final: () => <FinalCta />,
};

export default function HomePage() {
  const mainRef = useRef<HTMLElement>(null);
  const locale = useLocale();
  const { home } = useSiteConfig();
  const sections = arrangeSections(HOME_SECTIONS, home).filter(s => s.enabled);
  // Re-run reveal staging when the published layout changes so moved sections are observed.
  usePageMotion(mainRef, `home-${locale}-${sections.map(s => s.id).join('.')}`);
  return (
    <div className="min-h-screen bg-paper font-plex">
      <Header />
      <main ref={mainRef}>
        <EditableSections page="home">
          {sections.map(s => <Fragment key={s.id}>{RENDER[s.id]()}</Fragment>)}
        </EditableSections>
      </main>
      <Footer />
    </div>
  );
}
