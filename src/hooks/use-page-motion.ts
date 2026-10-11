import { useEffect, type RefObject } from "react";
import "@/page-motion.css";

/** Enhance existing content only: heroes and photographic scenes are never targets. */
export function usePageMotion(ref: RefObject<HTMLElement | null>, pageKey: string) {
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (preference.matches) return;
    const targets = new Set<HTMLElement>();
    const sections = Array.from(root.children).filter((section, index) => index > 0 && !section.matches(".hero, .pos-hero, .band-crumb, .import-directory"));
    for (const section of sections) {
      section.querySelectorAll<HTMLElement>("h2").forEach(heading => {
        if (!heading.closest("article, .import-feature-card, [data-motion-card]")) targets.add(heading);
      });
      section.querySelectorAll<HTMLElement>("[data-motion-card], [data-motion-step], .import-feature-card, .features > div:nth-child(2) > div, .steps > div:last-child > div, .fit > div:nth-child(2) > div").forEach(card => targets.add(card));
    }
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("motion-visible");
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -24px 0px" });
    targets.forEach(target => {
      if (target.closest(".hero, .pos-hero, .import-directory, .page-scene")) return;
      // Don't hide already-visible content during hydration.
      const bounds = target.getBoundingClientRect();
      target.classList.add("motion-target");
      const siblings = target.parentElement ? Array.from(target.parentElement.children).filter(child => targets.has(child as HTMLElement)) : [];
      target.dataset.motionStage = String(Math.max(0, siblings.indexOf(target)) % 4);
      if (bounds.top < window.innerHeight && bounds.bottom > 0) target.classList.add("motion-visible");
      else observer.observe(target);
    });
    const revealAll = () => {
      if (!preference.matches) return;
      observer.disconnect();
      targets.forEach(target => target.classList.add("motion-visible"));
    };
    preference.addEventListener("change", revealAll);
    return () => {
      observer.disconnect();
      preference.removeEventListener("change", revealAll);
      targets.forEach(target => {
        target.classList.remove("motion-target", "motion-visible");
        delete target.dataset.motionStage;
      });
    };
  }, [ref, pageKey]);
}