import { useEffect, useRef, type ElementType } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronDown, ExternalLink } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import "@/imported-pages.css";

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
  tabs?: { title: string; html: string }[];
};
type Page = { title: string; sourceUrl: string; nodes: Node[] };

function RenderNode({ node }: { node: Node }) {
  const props = { className: node.className, id: node.anchor || undefined };
  if (node.type === "container") return <div {...props} data-import-container>{node.children?.map(child => <RenderNode node={child} key={child.id} />)}</div>;
  if (node.type === "heading") {
    const tags: Record<string, ElementType> = { h1: "h1", h2: "h2", h3: "h3", h4: "h4", h5: "h5", h6: "h6" };
    const Tag = tags[node.tag ?? "h2"] ?? "h2";
    return <Tag {...props} dangerouslySetInnerHTML={{ __html: node.html ?? "" }} />;
  }
  if (node.type === "html" || node.type === "text-editor") return <div {...props} dangerouslySetInnerHTML={{ __html: node.html ?? "" }} />;
  if (node.type === "image-slot") return <div {...props} className={`${node.className} import-image-slot`} aria-hidden="true" />;
  if (node.type === "feature-card") return <article {...props} className={`${node.className} import-feature-card`}><h2>{node.text}</h2><div dangerouslySetInnerHTML={{ __html: node.html ?? "" }} /><Button asChild variant="link"><Link to={node.href ?? "/modules"}>عرض التفاصيل ←</Link></Button></article>;
  if (node.type === "button") {
    const href = node.href || "#";
    return <Button asChild size="lg" className={`${node.className} import-action`} variant={node.text?.includes("واتساب") ? "outline" : "default"}>
      {href.startsWith("/") && !href.includes("#") ? <Link to={href}>{node.text}</Link> : <a href={href} target={node.external ? "_blank" : undefined} rel={node.external ? "noopener noreferrer" : undefined}>{node.text}</a>}
    </Button>;
  }
  if (node.type === "hosted-form") return <div {...props} className={`${node.className} import-hosted`}><Button asChild size="lg"><a href={node.href} target="_blank" rel="noopener noreferrer">فتح النموذج على موقع Digit<ExternalLink /></a></Button></div>;
  if (node.type === "accordion") return <div {...props} className={`${node.className} import-faq`}>{node.tabs?.map((tab, i) => <details key={i}><summary>{tab.title}<ChevronDown size={18} /></summary><div dangerouslySetInnerHTML={{ __html: tab.html }} /></details>)}</div>;
  return null;
}

export default function ImportedPage({ page, pageKey }: { page: Page; pageKey: string }) {
  const mainRef = useRef<HTMLElement>(null);
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
    const observer = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? null : new IntersectionObserver(entries => entries.forEach(entry => {
      if (entry.isIntersecting) { entry.target.classList.add("import-visible"); observer?.unobserve(entry.target); }
    }), { threshold: 0.06 });
    main.querySelectorAll(".digit:not(.hero):not(.pos-hero):not(.band-crumb) > [data-import-container]").forEach(element => { element.classList.add("import-reveal"); observer?.observe(element); });
    return () => { observer?.disconnect(); pricing?.removeEventListener("change", updatePricing); };
  }, [pageKey]);
  return <div className="bg-paper font-plex"><Header /><main ref={mainRef} className={`imported-page import-${pageKey}`} aria-label={page.title}>{page.nodes.map(node => <RenderNode key={node.id} node={node} />)}</main><Footer /></div>;
}