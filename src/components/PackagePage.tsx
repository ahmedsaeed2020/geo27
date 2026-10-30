import { useLocale, localizeTree } from "@/lib/i18n";
import { Fragment, useRef, useState, type ElementType } from "react";
import { usePageMotion } from "@/hooks/use-page-motion";
import { ArrowLeft, ArrowRight, ChevronDown, ExternalLink } from "lucide-react";
import previewMeta from "@/content/package-preview-meta.json";
import { Button } from "@/components/ui/button";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import PageScene from "@/components/PageScene";
import ProShowcase from "@/components/product/ProShowcase";
import LeadCapturePanel from './LeadCapturePanel';
import CmsBlocks from './cms/CmsBlocks';
import "@/package-pages.css";

type PackageNode = {
  id: string;
  type: string;
  className: string;
  anchor?: string;
  children?: PackageNode[];
  html?: string;
  tag?: string;
  text?: string;
  href?: string;
  external?: boolean;
  checkout?: boolean;
  tabs?: { title: string; html: string; image?: string | null }[];
};

function PreviewTabs({ node, slug }: { node: PackageNode; slug: "starter" | "pro" }) {
  const locale = useLocale();
  const [active, setActive] = useState(0);
  const tabs = node.tabs ?? [];
  const selected = tabs[active];
  const changeTab = (next: number) => setActive((next + tabs.length) % tabs.length);
  return localizeTree(<div className="package-preview">
    <div role="tablist" aria-label="معاينة النظام" className="package-tablist">
      {tabs.map((tab, index) => <Button key={tab.title} variant="outline" role="tab" id={`${node.id}-tab-${index}`} aria-controls={`${node.id}-panel`} aria-selected={active === index} onClick={() => setActive(index)} onKeyDown={(event) => {
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
          event.preventDefault();
          const forward = event.key === (locale === "ar" ? "ArrowLeft" : "ArrowRight");
          const next = (active + (forward ? 1 : -1) + tabs.length) % tabs.length;
          setActive(next);
          document.getElementById(`${node.id}-tab-${next}`)?.focus();
        }
      }} tabIndex={active === index ? 0 : -1} className="package-tab">
        <span className="package-tab-icon" dangerouslySetInnerHTML={{ __html: previewMeta[slug][index]?.icon ?? "" }} />
        <span className="package-tab-copy"><span className="package-tab-subtitle">{previewMeta[slug][index]?.subtitle}</span><span>{tab.title}</span></span>
      </Button>)}
    </div>
    {selected && <div role="tabpanel" id={`${node.id}-panel`} aria-labelledby={`${node.id}-tab-${active}`} className="package-preview-panel">
      <div className="package-preview-image" key={active}>{selected.image ? <img src={selected.image} alt={selected.title} loading="lazy" /> : <div dangerouslySetInnerHTML={{ __html: selected.html }} />}</div>
      <div className="package-preview-arrows">
        <Button variant="outline" size="icon" aria-label="المعاينة السابقة" title="المعاينة السابقة" onClick={() => changeTab(active - 1)}><ArrowRight /></Button>
        <Button variant="outline" size="icon" aria-label="المعاينة التالية" title="المعاينة التالية" onClick={() => changeTab(active + 1)}><ArrowLeft /></Button>
      </div>
    </div>}
  </div>, locale);
}

function RenderNode({ node, slug, bodyBackdrop = false }: { node: PackageNode; slug: "starter" | "pro"; bodyBackdrop?: boolean }) {
  const locale = useLocale();
  const common = { className: node.className, id: node.anchor || undefined };
  if (node.type === "container") {
    const hero = node.className.split(" ").includes("hero");
    return localizeTree(<div {...common} className={`${node.className}${hero || bodyBackdrop ? " scene-backed" : ""}${bodyBackdrop ? " scene-content-section" : ""}`} data-package-container>{bodyBackdrop ? <PageScene pageKey={slug} kind="body" backdrop /> : hero && <PageScene pageKey={slug} kind="background" />}{node.children?.map(child => <RenderNode key={child.id} node={child} slug={slug} />)}</div>, locale);
  }
  if (node.type === "heading") {
    const Tag: ElementType = node.tag === "h1" ? "h1" : node.tag === "h3" ? "h3" : "h2";
    return localizeTree(<Tag {...common} dangerouslySetInnerHTML={{ __html: node.html ?? "" }} />, locale);
  }
  if (node.type === "text-editor" || node.type === "html") return localizeTree(<div {...common} dangerouslySetInnerHTML={{ __html: node.html ?? "" }} />, locale);
  if (node.type === "button") {
    const href = node.href === "#final" ? (slug === "starter" ? "#starter-form" : "#pro") : node.href;
    return localizeTree(<Button asChild size="lg" variant={node.text?.includes("واتساب") ? "outline" : "default"} className={`${node.className} package-action`}><a href={href} target={node.external && !href?.startsWith("#") ? "_blank" : undefined} rel={node.external ? "noopener noreferrer" : undefined}>{node.text}</a></Button>, locale);
  }
  if (node.type === "hosted-form") return localizeTree(<div {...common} className={`${node.className} package-hosted-form`}>
    <Button asChild size="lg"><a href={`https://digit-erp.com/${slug}/#${node.checkout ? (slug === "starter" ? "Checkout" : "pro") : "starter-form"}`} target="_blank" rel="noopener noreferrer">{node.checkout ? "متابعة الاشتراك على موقع Digit" : "فتح نموذج التجربة المجانية"}<ExternalLink /></a></Button>
  </div>, locale);
  if (node.type === "bdt-interactive-tabs") return localizeTree(<PreviewTabs node={node} slug={slug} />, locale);
  if (node.type === "accordion") return localizeTree(<div {...common} className={`${node.className} package-faq`}>
    {node.tabs?.map(tab => <details key={tab.title}><summary>{tab.title}<ChevronDown size={18} /></summary><div dangerouslySetInnerHTML={{ __html: tab.html }} /></details>)}
  </div>, locale);
  return null;
}

export default function PackagePage({ nodes, slug }: { nodes: PackageNode[]; slug: "starter" | "pro" }) {
  const locale = useLocale();
  const mainRef = useRef<HTMLElement>(null);
  usePageMotion(mainRef, `${slug}-${locale}`);
  // Pro shows its real screenshots right after the "what's included" features section.
  const showcaseAfter = slug === "pro" ? nodes.findIndex(node => node.className.split(" ").includes("features")) : -1;
  return localizeTree(<div className="bg-paper font-plex"><Header /><main ref={mainRef} className={`package-page package-${slug}`}>
    {nodes.map((node, index) => <Fragment key={node.id}><RenderNode node={node} slug={slug} bodyBackdrop={index === 3} />{index === showcaseAfter && <ProShowcase />}</Fragment>)}
    <CmsBlocks /><LeadCapturePanel interest={`DIGIT ${slug==='pro'?'Pro':'Starter'}`}/>
  </main><Footer /></div>, locale);
}