import { useLocale, localizeTree } from "@/lib/i18n";
import { createContext, Fragment, useContext, useEffect, useMemo, useRef, type CSSProperties, type ElementType, type ReactNode } from "react";
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
import { SourceFrame, FeatureVisualView } from "@/components/SourceVisual";
import { bodyPhotoInFrame, frameFill, isSourceFrame } from "@/content/page-frames";
import { FEATURE_VISUALS } from "@/content/feature-visuals";

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
  return (node.html ?? "").includes(`id="${id}"`) || (node.children ?? []).some(child => declaresId(child, id));
}

type RenderProps = { node: Node; pageKey: string };

/**
 * Page-photo layout (owner 2026-11-05): the hero photo sits clear on the inline-end half with the copy on the
 * start half, the hero's own frame/visual column is dropped (the photo replaces it), and one section heading per
 * page sits beside the page's second photo. No faded full-width washes.
 */
type HeroRole = "copy" | "centered" | "visual";
type SplitPhoto = { id: string; mode: "first-child" | "run"; src: string; width: number; height: number };
type SceneLayout = { heroId: string | undefined; roles: Map<string, HeroRole>; split: SplitPhoto | undefined };
const SceneLayoutContext = createContext<SceneLayout>({ heroId: undefined, roles: new Map(), split: undefined });

const HERO_CLASS = /(?:^|\s)(?:hero|pos-hero|import-directory)(?:\s|$)/;
const DIRECTORY_CLASS = /(?:^|\s)import-directory(?:\s|$)/;
// Sections whose first child is not a section heading (lists, price cards, FAQs, closing CTAs, demo forms).
const NO_SPLIT_CLASS = /(?:^|\s)(?:band-crumb|proof|nav|hero|pos-hero|import-directory|faq|faqs|pos-faq|cards|toc|statswrap|cta|pos-cta|demo|kit|related|pos-related|note)(?:\s|$)/;
const holdsHeading = (node: Node): boolean => node.type === "heading" || (node.children ?? []).some(holdsHeading);
const holdsFrame = (node: Node): boolean => isSourceFrame(node) || (node.children ?? []).some(holdsFrame);

/** The node's single container child when it only wraps one, otherwise the node itself. */
const innerOf = (node: Node): Node => {
  const kids = node.children ?? [];
  const only = kids.length === 1 ? kids[0] : undefined;
  return only && only.type === "container" ? only : node;
};

function heroRoles(hero: Node): Map<string, HeroRole> {
  const roles = new Map<string, HeroRole>();
  const inner = innerOf(hero);
  const items = inner.children ?? [];
  if (items.some(item => item.type === "heading")) roles.set(inner.id, "centered");
  else for (const item of items) if (item.type === "container") roles.set(item.id, holdsHeading(item) ? "copy" : "visual");
  return roles;
}

function sceneLayout(nodes: Node[], heroIndex: number, pageKey: string): SceneLayout {
  const scene = getPageScene(pageKey);
  if (!scene) return { heroId: undefined, roles: new Map(), split: undefined };
  const hero = heroIndex >= 0 ? nodes[heroIndex] : undefined;
  const roles = hero && !DIRECTORY_CLASS.test(hero.className) ? heroRoles(hero) : new Map<string, HeroRole>();
  // Directory pages without a hero: the photo sits beside their title instead of behind the whole list.
  const first = nodes[0];
  if (!hero && first) return { heroId: undefined, roles, split: { id: innerOf(first).id, mode: "run", src: scene.background, width: 1398, height: 864 } };
  if (bodyPhotoInFrame(pageKey)) return { heroId: hero?.id, roles, split: undefined };
  const section = nodes.find((node, index) => {
    const head = node.children?.[0];
    return index > heroIndex && node.type === "container" && !NO_SPLIT_CLASS.test(node.className) && (node.children?.length ?? 0) >= 2
      && head?.type === "container" && (head.children ?? []).some(child => child.type === "heading") && !holdsFrame(node);
  });
  return { heroId: hero?.id, roles, split: section ? { id: section.id, mode: "first-child", src: scene.body, width: scene.bodyWidth ?? 1398, height: scene.bodyHeight ?? 864 } : undefined };
}

function SplitPhotoFigure({ photo }: { photo: SplitPhoto }) {
  return <figure className="scene-split-photo" aria-hidden="true" style={{ "--split-ratio": `${photo.width} / ${photo.height}` } as CSSProperties}>
    <img src={photo.src} alt="" width={photo.width} height={photo.height} loading="lazy" decoding="async" />
  </figure>;
}

function RenderNode(props: RenderProps) {
  return withAccessibleHtml(RenderSourceNode(props));
}

function RenderSourceNode({ node, pageKey }: RenderProps) {
  const locale = useLocale();
  const cms = useCmsPage();
  const layout = useContext(SceneLayoutContext);
  const override = cms?.[locale].sourceEdits[node.id];
  if (override !== undefined) node = { ...node, html:override, text:override };
  const props = { className: node.className, id: node.anchor && !declaresId(node, node.anchor) ? node.anchor : undefined };
  if (node.type === "container") {
    const role = layout.roles.get(node.id);
    // The hero photo replaces the hero's own frame/visual column.
    if (role === "visual") return null;
    if (isSourceFrame(node)) {
      const fill = frameFill(pageKey, node.id);
      if (fill) return <SourceFrame className={node.className} pageKey={pageKey} fill={fill} />;
    }
    const feature = pageKey === "features" ? FEATURE_VISUALS[node.id] : undefined;
    if (feature) return localizeTree(<FeatureVisualView className={node.className} visual={feature} />, locale);
    const hero = node.id === layout.heroId && HERO_CLASS.test(node.className) && getPageScene(pageKey);
    const directory = hero && DIRECTORY_CLASS.test(node.className);
    const classes = [node.className, hero && "scene-backed", hero && (directory ? "scene-directory" : "scene-hero"), role && "scene-hero-copy", role === "centered" && "scene-hero-centered"].filter(Boolean).join(" ");
    const children = node.children ?? [];
    const split = layout.split?.id === node.id ? layout.split : undefined;
    let body: ReactNode;
    const firstChild = children[0];
    if (split?.mode === "first-child" && firstChild) {
      body = <>
        <div className="scene-split-head"><RenderNode node={firstChild} pageKey={pageKey} /><SplitPhotoFigure photo={split} /></div>
        {children.slice(1).map(child => <RenderNode node={child} pageKey={pageKey} key={child.id} />)}
      </>;
    } else if (split?.mode === "run") {
      const run = children.findIndex(child => child.type !== "heading" && child.type !== "text-editor");
      const lead = run < 0 ? children : children.slice(0, run);
      body = <>
        <div className="scene-split-head scene-split-run"><div className="scene-split-copy">{lead.map(child => <RenderNode node={child} pageKey={pageKey} key={child.id} />)}</div><SplitPhotoFigure photo={split} /></div>
        {(run < 0 ? [] : children.slice(run)).map(child => <RenderNode node={child} pageKey={pageKey} key={child.id} />)}
      </>;
    } else body = children.map(child => <RenderNode node={child} pageKey={pageKey} key={child.id} />);
    return localizeTree(<div {...props} className={classes} data-import-container>{hero && <PageScene pageKey={pageKey} kind="background" />}{body}</div>, locale);
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
  const heroIndex = page.nodes.findIndex(node => HERO_CLASS.test(node.className));
  const layout = useMemo(() => sceneLayout(page.nodes, heroIndex, pageKey), [page.nodes, heroIndex, pageKey]);
  const cms = useCmsPage();
  // Real product screenshots sit right after the hero (and its stats band), before the source content.
  const proofs = proConfig ? undefined : PAGE_PROOFS[pageKey];
  const proofIndex = heroIndex >= 0 && /(?:^|\s)proof(?:\s|$)/.test(page.nodes[heroIndex + 1]?.className ?? "") ? heroIndex + 1 : heroIndex;
  return localizeTree(<div className="bg-paper font-plex"><Header /><SceneLayoutContext.Provider value={layout}><main ref={mainRef} className={`imported-page import-${pageKey}`} aria-label={page.title}>{page.nodes.map((node, index) => <Fragment key={node.id}><RenderNode node={node} pageKey={pageKey} />{proofs && index === proofIndex && <PageProofs blocks={proofs} />}{proConfig && pro && index === proofIndex && <ProPageBody config={proConfig} content={pro} />}{story && index === proofIndex && story()}{hub && index === proofIndex && <ProductDepartments product={hub} />}</Fragment>)}<CmsBlocks />{cms?.formEnabled!==false && !holdsHostedForm(page.nodes) && <LeadCapturePanel interest={page.title}/>}</main></SceneLayoutContext.Provider><Footer /></div>, locale);
}