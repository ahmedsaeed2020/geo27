import { useLocale, localizeTree } from "@/lib/i18n";
import { Fragment, useEffect, useRef, type ElementType } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { ChevronDown } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import PageScene, { getPageScene } from "@/components/PageScene";
import ContactForm from "@/components/ContactForm";
import LeadCapturePanel from './LeadCapturePanel';
import CmsBlocks from './cms/CmsBlocks';
import { useCmsPage } from './cms/CmsContext';
import { PageProofs } from "@/components/product/ProductProof";
import { PAGE_PROOFS } from "@/content/product-proof";
import ProductDepartments from "@/components/catalog/ProductHub";
import { HUB_STORIES } from "@/components/hubs/HubStories";
import DepartmentPage from "@/components/catalog/DepartmentPage";
import type { ProductKey } from "@/content/catalog";
import ProPageBody from "@/components/pro/ProPageBody";
import { proPageByKey } from "@/content/pro/pro-pages";
import type { ProPageContent } from "@/content/pro/types";
import { withAccessibleHtml } from "@/lib/accessible-html";
import { isRequestWording } from "@/lib/form-cta";
import "@/imported-pages.css";
import { usePageMotion } from "@/hooks/use-page-motion";

type Node = {
  id: string;
  type: string;
  className: string;
  anchor?: string;
  children?: Node[];
  html?: string;
  tag?: string;
  text?: string;
  href?: string;
  external?: boolean;
  src?: string;
  alt?: string;
  tabs?: { title: string; html: string }[];
};
type Page = { title: string; sourceUrl: string; nodes: Node[] };

/** True when an HTML widget inside `node` already declares `id` itself, so the wrapper must not repeat it. */
function declaresId(node: Node, id: string): boolean {
  return (node.children ?? []).some(child => (child.html ?? "").includes(`id="${id}"`) || declaresId(child, id));
}

type RenderProps = { node: Node; pageKey: string; backdrop?: boolean; bodyBackdrop?: boolean };

function RenderNode(props: RenderProps) {
  return withAccessibleHtml(RenderSourceNode(props));
}

function RenderSourceNode({ node, pageKey, backdrop = false, bodyBackdrop = false }: RenderProps) {
  const locale = useLocale();
  const cms = useCmsPage();
  const override = cms?.[locale].sourceEdits[node.id];
  if (override !== undefined) node = { ...node, html:override, text:override };
  const props = { className: node.className, id: node.anchor && !declaresId(node, node.anchor) ? node.anchor : undefined };
  if (node.type === "container") {
    const hero = (backdrop || /(?:^|\s)(?:hero|pos-hero|import-directory)(?:\s|$)/.test(node.className)) && getPageScene(pageKey);
    return localizeTree(<div {...props} className={`${node.className}${hero || bodyBackdrop ? " scene-backed" : ""}${bodyBackdrop ? " scene-content-section" : ""}`} data-import-container>{bodyBackdrop ? <PageScene pageKey={pageKey} kind="body" backdrop /> : hero && <PageScene pageKey={pageKey} kind="background" />}{node.children?.map(child => <RenderNode node={child} pageKey={pageKey} key={child.id} />)}</div>, locale);
  }
  if (node.type === "heading") {
    const tags: Record<string, ElementType> = { h1: "h1", h2: "h2", h3: "h3", h4: "h4", h5: "h5", h6: "h6" };
    const Tag = tags[node.tag ?? "h2"] ?? "h2";
    return localizeTree(<Tag {...props} dangerouslySetInnerHTML={{ __html: node.html ?? "" }} />, locale);
  }
  if (node.type === "html" || node.type === "text-editor") return localizeTree(<div {...props} dangerouslySetInnerHTML={{ __html: node.html ?? "" }} />, locale);
  if (node.type === "image-slot") return node.src
    ? <div {...props} className={`${node.className} import-image-slot import-image-filled`}><img className="import-scene-img" src={node.src} alt={node.alt ?? ""} loading="lazy" width={1536} height={864} /></div>
    : <div {...props} className={`${node.className} import-image-slot`} aria-hidden="true" />;
  if (node.type === "feature-card") return localizeTree(<article {...props} className={`${node.className} import-feature-card`}><h2>{node.text}</h2><div dangerouslySetInnerHTML={{ __html: node.html ?? "" }} /><Button asChild variant="link"><Link to={node.href ?? "/modules"}>عرض التفاصيل ←</Link></Button></article>, locale);
  if (node.type === "button") {
    // A source request button without a destination opens the request form (via /demo) instead of a dead "#".
    const href = node.href && node.href !== "#" ? node.href : isRequestWording(node.text ?? "") ? "/demo" : "#";
    return localizeTree(<Button asChild size="lg" className={`${node.className} import-action`} variant={node.text?.includes("واتساب") ? "outline" : "default"}>
      {href.startsWith("/") && !href.includes("#") ? <Link to={href}>{node.text}</Link> : <a href={href} target={node.external ? "_blank" : undefined} rel={node.external ? "noopener noreferrer" : undefined}>{node.text}</a>}
    </Button>, locale);
  }
  // The old hosted WordPress form is replaced in place by the site's own request form.
  if (node.type === "hosted-form") return <div {...props} className={`${node.className} import-hosted`}><ContactForm kind={pageKey === "partnership" ? "contact" : "demo"} interest={pageKey === "partnership" ? (locale === "ar" ? "برنامج الشركاء" : "Partner programme") : ""} /></div>;
  if (node.type === "accordion") return localizeTree(<div {...props} className={`${node.className} import-faq`}>{node.tabs?.map((tab, i) => <details key={i}><summary>{tab.title}<ChevronDown size={18} /></summary><div dangerouslySetInnerHTML={{ __html: tab.html }} /></details>)}</div>, locale);
  return null;
}

/** Imported overview pages that double as product hubs get the department selector after their hero and proof band. */
const HUBS: Record<string, ProductKey> = { "modules-hr-payroll": "hr", "modules-contracting": "construction", "modules-crm": "crm" };

/**
 * A published (or previewed) department draft on an existing page route switches it to the shared Department
 * template; otherwise the imported source page renders with its published overrides.
 */
export default function ImportedPage({ page, pageKey, pro }: { page: Page; pageKey: string; pro?: ProPageContent }) {
  const locale = useLocale();
  const cms = useCmsPage();
  const path = useRouterState({ select: s => s.location.pathname.replace(/^\/en(?=\/|$)/, "") || "/" });
  // DIGIT Pro V4 pages are themselves the department template: their CMS document orders the V4 sections instead.
  if (!pro && cms?.department && cms[locale].blocks.some(b => b.enabled)) return <DepartmentPage content={cms} path={path} />;
  return <SourceImportedPage page={page} pageKey={pageKey} {...(pro ? { pro } : {})} />;
}

const holdsHostedForm = (nodes: Node[] | undefined): boolean => (nodes ?? []).some(n => n.type === "hosted-form" || holdsHostedForm(n.children));

const hasClass = (className: string, names: string[]) => names.some(n => new RegExp(`(?:^|\\s)${n}(?:\\s|$)`).test(className));

function SourceImportedPage({ page: source, pageKey, pro }: { page: Page; pageKey: string; pro?: ProPageContent }) {
  const proConfig = pro ? proPageByKey(pro.key) : undefined;
  // V4 chapters replace the imported benefit/inside/demo/related sections; hero, stats, FAQ and closing CTA stay.
  const page = proConfig?.replaces ? { ...source, nodes: source.nodes.filter(node => !hasClass(node.className, proConfig.replaces!)) } : source;
  const locale = useLocale();
  const hub = HUBS[pageKey];
  const story = HUB_STORIES[pageKey];
  const mainRef = useRef<HTMLElement>(null);
  usePageMotion(mainRef, `${pageKey}-${locale}`);
  useEffect(() => {
    const main = mainRef.current;
    if (!main) return;
    // Restore the source pricing switch without evaluating exported WordPress scripts.
    const pricing = main.querySelector("#prc");
    const updatePricing = () => pricing?.querySelectorAll<HTMLElement>("[data-card]").forEach(card => {
      const toggle = card.querySelector("[data-ztoggle]");
      const checked = toggle?.querySelector<HTMLInputElement>("input")?.checked ?? false;
      toggle?.classList.toggle("on", checked);
      const was = card.querySelector("[data-was]");
      const now = card.querySelector("[data-now]");
      if (was) was.textContent = card.getAttribute(checked ? "data-z-orig" : "data-base-orig");
      if (now) now.textContent = card.getAttribute(checked ? "data-z-cur" : "data-base-cur");
    });
    pricing?.addEventListener("change", updatePricing);
    updatePricing();
    return () => { pricing?.removeEventListener("change", updatePricing); };
  }, [pageKey]);
  const heroIndex = page.nodes.findIndex(node => /(?:^|\s)(?:hero|pos-hero|import-directory)(?:\s|$)/.test(node.className));
  const contentIndex = page.nodes.findIndex((node, index) => index > Math.max(heroIndex, 0) && node.type === "container" && !/(?:^|\s)(?:band-crumb|proof|nav)(?:\s|$)/.test(node.className));
   const bodyIndex = contentIndex;
  const cms = useCmsPage();
  // Real product screenshots sit right after the hero (and its stats band), before the source content.
  const proofs = proConfig ? undefined : PAGE_PROOFS[pageKey];
  const proofIndex = heroIndex >= 0 && /(?:^|\s)proof(?:\s|$)/.test(page.nodes[heroIndex + 1]?.className ?? "") ? heroIndex + 1 : heroIndex;
  return localizeTree(<div className="bg-paper font-plex"><Header /><main ref={mainRef} className={`imported-page import-${pageKey}`} aria-label={page.title}>{page.nodes.map((node, index) => <Fragment key={node.id}><RenderNode node={node} pageKey={pageKey} backdrop={heroIndex < 0 && index === 0} bodyBackdrop={index === bodyIndex} />{proofs && index === proofIndex && <PageProofs blocks={proofs} />}{proConfig && pro && index === proofIndex && <ProPageBody config={proConfig} content={pro} />}{story && index === proofIndex && story()}{hub && index === proofIndex && <ProductDepartments product={hub} />}</Fragment>)}<CmsBlocks />{cms?.formEnabled!==false && !holdsHostedForm(page.nodes) && <LeadCapturePanel interest={page.title}/>}</main><Footer /></div>, locale);
}