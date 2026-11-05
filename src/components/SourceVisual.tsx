import { useState, type CSSProperties } from "react";
import { Braces, CreditCard, RefreshCw, Store } from "lucide-react";
import ShotFrame from "@/components/product/ShotFrame";
import ShotLightbox from "@/components/product/ShotLightbox";
import { getPageScene } from "@/components/PageScene";
import { screenById } from "@/content/screens";
import type { Shot } from "@/content/product-shots";
import type { FrameFill } from "@/content/page-frames";
import type { FeatureVisual } from "@/content/feature-visuals";
import { useLocale } from "@/lib/i18n";
import "@/product-proof.css";
import "@/source-visuals.css";

/** A registered real screen inside the source frame's box, opening the shared lightbox. */
function ScreenFill({ shot, className }: { shot: Shot; className: string }) {
  const [open, setOpen] = useState<number | null>(null);
  return <div className={`${className} sv-frame sv-frame-screen`} data-import-container>
    <ShotFrame shot={shot} size="lead" onOpen={() => setOpen(0)} />
    <ShotLightbox shots={[shot]} index={open} onIndexChange={setOpen} onClose={() => setOpen(null)} />
  </div>;
}

function withCaption(shot: Shot, caption?: { ar: string; en: string }): Shot {
  return caption ? { ...shot, caption } : shot;
}

/** Replaces an imported "digit-erp.com / app / …" frame with a real screen or the page's own clear photo. */
export function SourceFrame({ className, pageKey, fill }: { className: string; pageKey: string; fill: FrameFill }) {
  const locale = useLocale();
  if (fill.kind === "screen") {
    const shot = screenById(fill.id);
    if (!shot) return null;
    return <ScreenFill shot={withCaption(shot, fill.caption)} className={className} />;
  }
  const scene = getPageScene(pageKey);
  if (!scene) return null;
  const width = scene.bodyWidth ?? 1398;
  const height = scene.bodyHeight ?? 864;
  return <figure className={`${className} sv-frame sv-frame-photo`} data-import-container>
    <span className="sv-photo" style={{ "--sv-ratio": `${width} / ${height}` } as CSSProperties}>
      <img src={scene.body} alt={fill.caption[locale]} width={width} height={height} loading="lazy" decoding="async" />
    </span>
    <figcaption>{fill.caption[locale]}</figcaption>
  </figure>;
}

const ICONS = { api: Braces, store: Store, payment: CreditCard, sync: RefreshCw } as const;

/** Visual column of a /features capability row: a clear photo, a real screen or a designed connection map. */
export function FeatureVisualView({ className, visual }: { className: string; visual: FeatureVisual }) {
  const locale = useLocale();
  if (visual.kind === "screen") {
    const shot = screenById(visual.id);
    return shot ? <ScreenFill shot={withCaption(shot, visual.caption)} className={`${className} sv-feature`} /> : null;
  }
  if (visual.kind === "photo") return <figure className={`${className} sv-frame sv-frame-photo sv-feature`} data-import-container>
    <span className="sv-photo" style={{ "--sv-ratio": `${visual.width} / ${visual.height}` } as CSSProperties}>
      <img src={visual.src} alt={visual.alt[locale]} width={visual.width} height={visual.height} loading="lazy" decoding="async" />
    </span>
    <figcaption>{visual.caption[locale]}</figcaption>
  </figure>;
  return <figure className={`${className} sv-frame sv-feature sv-map-frame`} data-import-container>
    <div className="sv-map" role="img" aria-label={`${visual.items.map(item => item.label[locale]).join("، ")}`}>
      <svg className="sv-map-lines" viewBox="0 0 400 260" aria-hidden="true" preserveAspectRatio="none">
        <path d="M200 130 L70 58" /><path d="M200 130 L330 58" /><path d="M200 130 L70 202" /><path d="M200 130 L330 202" />
      </svg>
      <span className="sv-map-core" aria-hidden="true"><b>DIGIT</b></span>
      {visual.items.map((item, index) => {
        const Icon = ICONS[item.icon];
        return <span key={item.icon} className="sv-map-node" data-slot={index} aria-hidden="true"><span className="sv-map-icon"><Icon /></span><span>{item.label[locale]}</span></span>;
      })}
    </div>
    <figcaption>{visual.caption[locale]}</figcaption>
  </figure>;
}
