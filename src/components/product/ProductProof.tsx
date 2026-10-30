import { useMemo, useState, type CSSProperties } from "react";
import { Link } from "@tanstack/react-router";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import ShotFrame from "@/components/product/ShotFrame";
import ShotLightbox from "@/components/product/ShotLightbox";
import { shot, type L } from "@/content/product-shots";
import { DEMO_HREF, PROOF_COPY, type ProofBlock } from "@/content/product-proof";
import { localeHref, useLocale } from "@/lib/i18n";
import "@/product-proof.css";

export type ProductProofProps = {
  eyebrow: L;
  title: L;
  hook: L;
  pain?: L;
  /** Screenshot ids: the lead is shown large, the rest follow in order. */
  lead: string;
  shots: string[];
  bullets?: L[];
  cta?: { label: L; href: string };
  id?: string;
  tone?: "plain" | "raised";
};

export function quote(text: string, locale: "ar" | "en") {
  return locale === "ar" ? `«${text}»` : `“${text}”`;
}

export default function ProductProof({ eyebrow, title, hook, pain, lead, shots, bullets, cta = { label: PROOF_COPY.cta, href: DEMO_HREF }, id, tone = "plain" }: ProductProofProps) {
  const locale = useLocale();
  const [open, setOpen] = useState<number | null>(null);
  const ordered = useMemo(() => [lead, ...shots.filter(item => item !== lead)].map(shot), [lead, shots]);
  const [leadShot, ...rest] = ordered;
  const headingId = `proof-${id ?? lead}-title`;
  if (!leadShot) return null;
  return (
    <section className="pp pp-block" data-tone={tone} id={id ? `proof-${id}` : undefined} aria-labelledby={headingId} lang={locale}>
      <div className="pp-wrap">
        <div className="pp-head">
          <div className="pp-copy">
            <span className="pp-eyebrow">{eyebrow[locale]}</span>
            <h2 className="pp-title" id={headingId}>{title[locale]}</h2>
            <p className="pp-hook">{quote(hook[locale], locale)}</p>
            {pain && <p className="pp-pain">{pain[locale]}</p>}
            <Button asChild size="lg" className="pp-cta"><Link to={localeHref(cta.href, locale)}>{cta.label[locale]}</Link></Button>
          </div>
          <ShotFrame shot={leadShot} size="lead" onOpen={() => setOpen(0)} />
        </div>
        {rest.length > 0 && <ul className="pp-grid" role="list" style={{ "--pp-cols": String(rest.length === 6 ? 3 : Math.min(rest.length, 5)) } as CSSProperties}>
          {rest.map((item, index) => <li key={item.id}><ShotFrame shot={item} motion onOpen={() => setOpen(index + 1)} /></li>)}
        </ul>}
        {bullets && bullets.length > 0 && <ul className="pp-bullets" role="list">
          {bullets.map(bullet => <li key={bullet.ar}><Check aria-hidden="true" /><span>{bullet[locale]}</span></li>)}
        </ul>}
        <p className="pp-footnote">{PROOF_COPY.footnote[locale]}</p>
      </div>
      <ShotLightbox shots={ordered} index={open} onIndexChange={setOpen} onClose={() => setOpen(null)} />
    </section>
  );
}

/** Every ProductProof block configured for an imported page, rendered in order. */
export function PageProofs({ blocks }: { blocks: ProofBlock[] }) {
  return <>{blocks.map((block, index) => <ProductProof key={block.id} {...block} tone={index % 2 === 0 ? "raised" : "plain"} />)}</>;
}
