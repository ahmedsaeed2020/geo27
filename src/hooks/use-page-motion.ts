import { useEffect, type RefObject } from "react";
import { motionTier, registerScene } from "@/motion/scenes";
import "@/page-motion.css";

/** First folds animate through CSS on first paint (see src/motion.css); this hook never touches them. */
const HERO = ".hero, .pos-hero, .hr-hero, .sp-hero, .pv-hero, .hx, #digit-orbit, .band-crumb, .import-directory, .dp-siblings";
/** Page shells that wrap the hero and every section in one element: their children are the real sections. */
const WRAPPERS = ".hr-page, .sp-page, .pv-root, .pv-page, .hs";
/** Real step-by-step narratives: their items light up in order and their connectors draw between them. */
const SEQUENCES = ".sp-flow, .pv-flow, .cs-next-steps, .hr-journey-rail, .dp-flow, .hs-chain, .pv-life, .pv-chain, .cs-chain";
/** Authentic product screen frames: they enter with depth instead of the card rise. */
const SCREENS = ".pp-shot, figure.mz";

function sectionsOf(root: HTMLElement): HTMLElement[] {
  const out: HTMLElement[] = [];
  const walk = (el: Element, depth: number) => {
    for (const child of Array.from(el.children)) {
      if (!(child instanceof HTMLElement) || child.matches(HERO)) continue;
      if (depth < 2 && child.matches(WRAPPERS)) walk(child, depth + 1);
      else out.push(child);
    }
  };
  walk(root, 0);
  return out;
}

/**
 * One observer for every reveal on a page. Headings rise from a mask, cards rise in sibling stages, product screens
 * enter with depth, and step narratives play in order (the HR journey rail also follows the scroll position).
 * Heroes and photographic scenes are never targets; everything is restored on unmount or route change.
 */
export function usePageMotion(ref: RefObject<HTMLElement | null>, pageKey: string) {
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (preference.matches) return;
    const tier = motionTier();
    const targets = new Set<HTMLElement>();
    const sequences = new Set<HTMLElement>();
    const cleanups: Array<() => void> = [];
    const inHero = (el: Element) => Boolean(el.closest(`${HERO}, .page-scene`));

    for (const section of sectionsOf(root)) {
      section.querySelectorAll<HTMLElement>(SEQUENCES).forEach(list => { if (!inHero(list) && list.children.length > 1) sequences.add(list); });
      section.querySelectorAll<HTMLElement>("h2").forEach(heading => {
        if (!heading.closest("article, .import-feature-card, [data-motion-card]")) targets.add(heading);
      });
      section.querySelectorAll<HTMLElement>("[data-motion-card], [data-motion-step], .import-feature-card, .features > div:nth-child(2) > div, .steps > div:last-child > div, .fit > div:nth-child(2) > div").forEach(card => targets.add(card));
      // Extracted module/service templates keep their original anonymous inner containers.
      section.querySelectorAll<HTMLElement>(".benefits > div:last-child > div, .how > div:last-child > div, .deliver > div:last-child > div, .vals > div:last-child > div, .related > div:last-child > div, .sec > div > div:last-child > div").forEach(card => targets.add(card));
      section.querySelectorAll<HTMLElement>(SCREENS).forEach(screen => {
        if (!screen.closest("[data-motion-card], .import-feature-card, .mm-panel") && !screen.parentElement?.closest(SEQUENCES)) targets.add(screen);
      });
    }
    // Items of a step narrative play with their list, not as separate cards.
    for (const target of Array.from(targets)) if (target.parentElement?.matches(SEQUENCES) || target.closest(SEQUENCES)?.contains(target) && target.closest("li")) targets.delete(target);

    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add(entry.target.classList.contains("dm-seq") ? "dm-play" : "motion-visible");
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -24px 0px" });
    const seqObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("dm-play");
        seqObserver.unobserve(entry.target);
      });
    }, { threshold: 0.28 });

    const visible = (el: Element) => {
      const bounds = el.getBoundingClientRect();
      return bounds.top < window.innerHeight && bounds.bottom > 0;
    };

    targets.forEach(target => {
      if (inHero(target)) return;
      target.classList.add("motion-target");
      const variant = target.tagName === "H2" ? "line" : target.matches(SCREENS) ? "screen" : "rise";
      target.dataset['motion'] = variant;
      const siblings = target.parentElement ? Array.from(target.parentElement.children).filter(child => targets.has(child as HTMLElement)) : [];
      target.dataset['motionStage'] = String(Math.max(0, siblings.indexOf(target)) % 4);
      // Don't hide already-visible content during hydration.
      if (visible(target)) target.classList.add("motion-visible");
      else observer.observe(target);
    });

    sequences.forEach(list => {
      const items = Array.from(list.children) as HTMLElement[];
      list.classList.add("dm-seq");
      list.style.setProperty("--dm-n", String(items.length));
      items.forEach((item, index) => item.style.setProperty("--dm-i", String(index)));
      if (visible(list) && list.getBoundingClientRect().top < window.innerHeight * 0.72) list.classList.add("dm-play");
      else seqObserver.observe(list);
      // The HR journey rail is a progressive timeline: its fill and current step follow the scroll on desktop.
      if (tier === "full" && list.matches(".hr-journey-rail")) {
        list.classList.add("dm-progress");
        let current = -1;
        cleanups.push(registerScene(list, (_p, rect, viewport) => {
          const fill = Math.min(1, Math.max(0, (viewport * 0.86 - rect.top) / (viewport * 0.5)));
          list.style.setProperty("--dm-p", fill.toFixed(3));
          const next = fill <= 0 ? -1 : Math.min(items.length - 1, Math.floor(fill * items.length - 0.001));
          if (next === current) return;
          current = next;
          items.forEach((item, index) => { item.toggleAttribute("data-dm-current", index === next); item.toggleAttribute("data-dm-reached", index <= next); });
        }));
      }
    });

    // Depth: the hero photograph drifts slower than the page on desktop pointers.
    if (tier === "full") {
      root.querySelectorAll<HTMLElement>(".scene-hero > .page-scene-background").forEach(scene => {
        const img = scene.querySelector("img");
        if (!img) return;
        cleanups.push(registerScene(scene, (_p, rect) => {
          const offset = Math.min(rect.height, Math.max(0, -rect.top)) * 0.12;
          img.style.translate = `0 ${offset.toFixed(1)}px`;
        }));
        cleanups.push(() => { img.style.translate = ""; });
      });
    }

    const revealAll = () => {
      if (!preference.matches) return;
      observer.disconnect();
      seqObserver.disconnect();
      targets.forEach(target => target.classList.add("motion-visible"));
      sequences.forEach(list => list.classList.add("dm-play"));
    };
    preference.addEventListener("change", revealAll);
    return () => {
      observer.disconnect();
      seqObserver.disconnect();
      cleanups.forEach(fn => fn());
      preference.removeEventListener("change", revealAll);
      targets.forEach(target => {
        target.classList.remove("motion-target", "motion-visible");
        delete target.dataset['motionStage'];
        delete target.dataset['motion'];
      });
      sequences.forEach(list => {
        list.classList.remove("dm-seq", "dm-play", "dm-progress");
        list.style.removeProperty("--dm-n");
        list.style.removeProperty("--dm-p");
        Array.from(list.children).forEach(item => {
          (item as HTMLElement).style.removeProperty("--dm-i");
          item.removeAttribute("data-dm-current");
          item.removeAttribute("data-dm-reached");
        });
      });
    };
  }, [ref, pageKey]);
}
