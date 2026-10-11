import { useState, type ElementType } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronDown, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
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

function PreviewTabs({ node }: { node: PackageNode }) {
  const [active, setActive] = useState(0);
  const tabs = node.tabs ?? [];
  const selected = tabs[active];
  return <div className="package-preview">
    <div role="tablist" aria-label="معاينة النظام" className="package-tablist">
      {tabs.map((tab, index) => <Button key={tab.title} variant="outline" role="tab" id={`${node.id}-tab-${index}`} aria-controls={`${node.id}-panel`} aria-selected={active === index} onClick={() => setActive(index)} onKeyDown={(event) => {
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
          event.preventDefault();
          const next = (active + (event.key === "ArrowLeft" ? 1 : -1) + tabs.length) % tabs.length;
          setActive(next);
          document.getElementById(`${node.id}-tab-${next}`)?.focus();
        }
      }} className="package-tab">{tab.title}</Button>)}
    </div>
    {selected && <div role="tabpanel" id={`${node.id}-panel`} aria-labelledby={`${node.id}-tab-${active}`} className="package-preview-panel">
      {selected.image ? <img src={selected.image} alt={selected.title} loading="lazy" /> : <div dangerouslySetInnerHTML={{ __html: selected.html }} />}
    </div>}
  </div>;
}

function RenderNode({ node, slug }: { node: PackageNode; slug: "starter" | "pro" }) {
  const common = { className: node.className, id: node.anchor || undefined };
  if (node.type === "container") return <div {...common}>{node.children?.map(child => <RenderNode key={child.id} node={child} slug={slug} />)}</div>;
  if (node.type === "heading") {
    const Tag: ElementType = node.tag === "h1" ? "h1" : node.tag === "h3" ? "h3" : "h2";
    return <Tag {...common} dangerouslySetInnerHTML={{ __html: node.html ?? "" }} />;
  }
  if (node.type === "text-editor" || node.type === "html") return <div {...common} dangerouslySetInnerHTML={{ __html: node.html ?? "" }} />;
  if (node.type === "button") {
    const href = node.href === "#final" ? (slug === "starter" ? "#starter-form" : "#pro") : node.href;
    return <Button asChild size="lg" variant={node.text?.includes("واتساب") ? "outline" : "default"} className="package-action"><a href={href} target={node.external && !href?.startsWith("#") ? "_blank" : undefined} rel={node.external ? "noopener noreferrer" : undefined}>{node.text}</a></Button>;
  }
  if (node.type === "hosted-form") return <div {...common} className={`${node.className} package-hosted-form`}>
    <Button asChild size="lg"><a href={`https://digit-erp.com/${slug}/#${node.checkout ? (slug === "starter" ? "Checkout" : "pro") : "starter-form"}`} target="_blank" rel="noopener noreferrer">{node.checkout ? "متابعة الاشتراك على موقع Digit" : "فتح نموذج التجربة المجانية"}<ExternalLink /></a></Button>
  </div>;
  if (node.type === "bdt-interactive-tabs") return <PreviewTabs node={node} />;
  if (node.type === "accordion") return <div {...common} className={`${node.className} package-faq`}>
    {node.tabs?.map(tab => <details key={tab.title}><summary>{tab.title}<ChevronDown size={18} /></summary><div dangerouslySetInnerHTML={{ __html: tab.html }} /></details>)}
  </div>;
  return null;
}

export default function PackagePage({ nodes, slug }: { nodes: PackageNode[]; slug: "starter" | "pro" }) {
  return <div className="bg-paper font-plex"><Header /><main className={`package-page package-${slug}`}>
    {nodes.map(node => <RenderNode key={node.id} node={node} slug={slug} />)}
    <nav className="package-switch" aria-label="باقات Digit"><Link to="/starter" activeProps={{ className: "text-primary" }}>Starter</Link><span> / </span><Link to="/pro" activeProps={{ className: "text-primary" }}>Pro</Link></nav>
  </main><Footer /></div>;
}