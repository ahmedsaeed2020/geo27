import { useMemo, useState, type KeyboardEvent } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import ShotFrame from "@/components/product/ShotFrame";
import ShotLightbox from "@/components/product/ShotLightbox";
import { shot } from "@/content/product-shots";
import { DEMO_HREF, HOME_SHOWCASE, PROOF_COPY } from "@/content/product-proof";
import { localeHref, useLocale } from "@/lib/i18n";
import "@/product-proof.css";
import { SectionHeading } from '@/components/cms/SectionText';

/** Home "شوف النظام من جوّه": one large and two small real screens per tab. */
export default function ProductShowcase() {
  const locale = useLocale();
  const tabs = HOME_SHOWCASE.tabs;
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState<number | null>(null);
  const tab = tabs[active] ?? tabs[0]!;
  const shots = useMemo(() => [tab.lead, ...tab.smalls].map(shot), [tab]);
  const [lead, ...smalls] = shots;
  const LinkArrow = locale === "ar" ? ArrowLeft : ArrowRight;
  const select = (next: number) => { setActive(next); setOpen(null); };
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight" && event.key !== "Home" && event.key !== "End") return;
    event.preventDefault();
    const forward = event.key === (locale === "ar" ? "ArrowLeft" : "ArrowRight");
    const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (active + (forward ? 1 : -1) + tabs.length) % tabs.length;
    select(next);
    document.getElementById(`pp-home-tab-${tabs[next]?.key}`)?.focus();
  };
  return (
    <section id="product-screens" className="pp pp-home" aria-labelledby="pp-home-title" lang={locale}>
      <div className="pp-wrap">
        <div className="pp-intro">
          <span className="pp-eyebrow">{HOME_SHOWCASE.eyebrow[locale]}</span>
          <SectionHeading k="showcase" className="pp-title" id="pp-home-title">{HOME_SHOWCASE.title[locale]}</SectionHeading>
          <p className="pp-sub">{HOME_SHOWCASE.sub[locale]}</p>
        </div>
        <div className="pp-tabs" role="tablist" aria-label={HOME_SHOWCASE.eyebrow[locale]}>
          {tabs.map((item, index) => (
            <button
              key={item.key}
              type="button"
              role="tab"
              id={`pp-home-tab-${item.key}`}
              aria-controls="pp-home-panel"
              aria-selected={index === active}
              tabIndex={index === active ? 0 : -1}
              className="pp-tab"
              onClick={() => select(index)}
              onKeyDown={onKeyDown}
            >{item.label[locale]}</button>
          ))}
        </div>
        <div className="pp-panel" role="tabpanel" id="pp-home-panel" aria-labelledby={`pp-home-tab-${tab.key}`} key={tab.key}>
          <div className="pp-panel-head">
            <p className="pp-panel-hook">{tab.hook[locale]}</p>
            <Link className="pp-panel-link" to={localeHref(tab.href, locale)}>{tab.linkLabel[locale]}<LinkArrow aria-hidden="true" /></Link>
          </div>
          <div className="pp-panel-grid">
            {lead && <ShotFrame shot={lead} size="lead" onOpen={() => setOpen(0)} />}
            <div className="pp-panel-side">
              {smalls.map((item, index) => <ShotFrame key={item.id} shot={item} onOpen={() => setOpen(index + 1)} />)}
            </div>
          </div>
        </div>
        <div className="pp-home-foot">
          <p className="pp-footnote">{PROOF_COPY.footnote[locale]}</p>
          <Button asChild size="lg" className="pp-cta"><Link to={localeHref(DEMO_HREF, locale)}>{PROOF_COPY.cta[locale]}</Link></Button>
        </div>
      </div>
      <ShotLightbox shots={shots} index={open} onIndexChange={setOpen} onClose={() => setOpen(null)} />
    </section>
  );
}
