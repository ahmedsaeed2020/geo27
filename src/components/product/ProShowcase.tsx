import { useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import ShotFrame from "@/components/product/ShotFrame";
import ShotLightbox from "@/components/product/ShotLightbox";
import { THEMES, shot, type Theme } from "@/content/product-shots";
import { DEMO_HREF, PRO_SHOWCASE, PROOF_COPY } from "@/content/product-proof";
import { localeHref, useLocale } from "@/lib/i18n";
import "@/product-proof.css";

const themeId = (theme: Theme) => `pro-theme-${theme.key}`;

function ThemeBlock({ theme }: { theme: Theme }) {
  const locale = useLocale();
  const [open, setOpen] = useState<number | null>(null);
  const [expanded, setExpanded] = useState(false);
  const shots = useMemo(() => theme.shots.map(shot), [theme]);
  const visible = expanded ? shots : shots.slice(0, PRO_SHOWCASE.compactCount);
  const hidden = shots.length - PRO_SHOWCASE.compactCount;
  const listId = `${themeId(theme)}-shots`;
  return (
    <article className="pp-theme" id={themeId(theme)} aria-labelledby={`${themeId(theme)}-title`}>
      <header className="pp-theme-head">
        <span className="pp-theme-no" aria-hidden="true">{String(theme.no).padStart(2, "0")}</span>
        <div>
          <h3 className="pp-theme-title" id={`${themeId(theme)}-title`}>{theme.title[locale]}</h3>
          <p className="pp-theme-hook">{theme.hook[locale]}</p>
        </div>
      </header>
      <ul className="pp-grid" id={listId} role="list">
        {visible.map((item, index) => <li key={item.id}><ShotFrame shot={item} motion={index < PRO_SHOWCASE.compactCount} onOpen={() => setOpen(index)} /></li>)}
      </ul>
      <div className="pp-theme-foot">
        <p className="pp-footnote">{PROOF_COPY.footnote[locale]}</p>
        {hidden > 0 && <Button type="button" variant="outline" className="pp-toggle" aria-expanded={expanded} aria-controls={listId} onClick={() => setExpanded(value => !value)}>
          {expanded ? PROOF_COPY.showLess[locale] : `${PROOF_COPY.showAll[locale]} (${shots.length})`}
          <ChevronDown aria-hidden="true" data-open={expanded} />
        </Button>}
      </div>
      <ShotLightbox shots={shots} index={open} onIndexChange={setOpen} onClose={() => setOpen(null)} />
    </article>
  );
}

/** /pro "ماذا تحصل في DIGIT Pro": all ten themes with sticky chips and the Pro price line. */
export default function ProShowcase() {
  const locale = useLocale();
  const chipsRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(THEMES[0]!.key);
  const [stickyTop, setStickyTop] = useState(72);
  const stickyTopRef = useRef(72);
  const lockUntil = useRef(0);
  stickyTopRef.current = stickyTop;

  useEffect(() => {
    const header = document.querySelector<HTMLElement>("body header");
    if (!header) return;
    const measure = () => setStickyTop(Math.round(header.getBoundingClientRect().height));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(header);
    return () => observer.disconnect();
  }, []);

  // Scroll spy: the active theme is the last one whose top has passed the sticky chips.
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      if (Date.now() < lockUntil.current) return;
      const line = stickyTopRef.current + 140;
      let current = THEMES[0]!.key;
      for (const theme of THEMES) {
        const block = document.getElementById(themeId(theme));
        if (block && block.getBoundingClientRect().top <= line) current = theme.key;
      }
      setActive(current);
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(update); };
    const release = () => { lockUntil.current = 0; onScroll(); };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("scrollend", release);
    update();
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("scrollend", release);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  useEffect(() => {
    const bar = chipsRef.current;
    const chip = bar?.querySelector<HTMLElement>(`[data-theme="${active}"]`);
    if (!bar || !chip) return;
    const barBox = bar.getBoundingClientRect();
    const chipBox = chip.getBoundingClientRect();
    if (chipBox.left < barBox.left || chipBox.right > barBox.right) bar.scrollBy({ left: chipBox.left + chipBox.width / 2 - (barBox.left + barBox.width / 2), behavior: "smooth" });
  }, [active]);

  const jump = (event: MouseEvent<HTMLAnchorElement>, theme: Theme) => {
    const target = document.getElementById(themeId(theme));
    if (!target) return;
    event.preventDefault();
    setActive(theme.key);
    // Keep the clicked chip active while the page glides past the themes in between.
    lockUntil.current = Date.now() + 1200;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    target.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  };

  return (
    <section id="pro-inside" className="pp pp-pro" aria-labelledby="pp-pro-title" lang={locale} style={{ "--pp-sticky-top": `${stickyTop}px` } as CSSProperties}>
      <div className="pp-wrap pp-intro">
        <span className="pp-eyebrow">{PRO_SHOWCASE.eyebrow[locale]}</span>
        <h2 className="pp-title" id="pp-pro-title">{PRO_SHOWCASE.title[locale]}</h2>
        <p className="pp-sub">{PRO_SHOWCASE.sub[locale]}</p>
      </div>
      <nav className="pp-chips-bar" aria-label={PRO_SHOWCASE.navLabel[locale]}>
        <div className="pp-chips" ref={chipsRef}>
          {THEMES.map(theme => (
            <a key={theme.key} href={`#${themeId(theme)}`} data-theme={theme.key} className="pp-chip" aria-current={active === theme.key ? "true" : undefined} onClick={event => jump(event, theme)}>
              <b>{String(theme.no).padStart(2, "0")}</b>{theme.chip[locale]}
            </a>
          ))}
        </div>
      </nav>
      <div className="pp-wrap">
        {THEMES.map(theme => <ThemeBlock key={theme.key} theme={theme} />)}
        <div className="pp-pro-cta">
          <div>
            <h3 className="pp-pro-cta-title">{PRO_SHOWCASE.ctaTitle[locale]}</h3>
            <p className="pp-pro-price">{PRO_SHOWCASE.price[locale]}</p>
          </div>
          <Button asChild size="lg" className="pp-cta"><Link to={localeHref(DEMO_HREF, locale)}>{PROOF_COPY.cta[locale]}</Link></Button>
        </div>
      </div>
    </section>
  );
}
