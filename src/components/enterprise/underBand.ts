/**
 * "Under the band" placement (owner notes round 2026-11-17, A-03 / A-04): the shared side panel, the drill lists and the
 * create panels open below the page's green band — never over it — and fill the height below it. The band is the page's
 * brand ContextStrip (every app), the HR command band or the document frame band; when it has scrolled away the panel
 * starts under the top bar. One CSS variable (--ub-top on <html>) carries the offset, so every surface reads one value.
 */
import { useEffect } from "react";

const BAND = '[data-shell-main] :is([data-ek-context][data-tone="brand"], .dhr-cmdband, .dx-frame-top)';

/** Pixel offset where a panel starts: the band's bottom edge (+8px), at least the top bar, at most 40% of the viewport. */
export function underBandTop(): number {
  if (typeof document === "undefined") return 0;
  const head = document.querySelector("[data-shell-header]")?.getBoundingClientRect().bottom ?? 0;
  const band = document.querySelector(BAND)?.getBoundingClientRect();
  const below = band && band.bottom > head ? band.bottom + 8 : head;
  return Math.round(Math.min(Math.max(head, below), window.innerHeight * 0.4));
}

let users = 0; let raf = 0;
function sync() {
  if (typeof window === "undefined") return;
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(() => {
    const st = document.documentElement.style; st.setProperty("--ub-top", `${underBandTop()}px`);
    // the work area's side edges, so a centred create panel stays over the page and never covers the navigation
    const m = document.querySelector("[data-shell-main]")?.getBoundingClientRect();
    if (m && window.innerWidth >= 768) { st.setProperty("--ub-left", `${Math.max(0, Math.round(m.left))}px`); st.setProperty("--ub-right", `${Math.max(0, Math.round(window.innerWidth - m.right))}px`); }
    else { st.removeProperty("--ub-left"); st.removeProperty("--ub-right"); }
  });
}
/** Keeps --ub-top current (scroll, resize) while `on`; the variable is removed when the last surface closes. */
export function useUnderBand(on: boolean) {
  useEffect(() => {
    if (!on) return;
    users++; sync();
    window.addEventListener("scroll", sync, { passive: true, capture: true });
    window.addEventListener("resize", sync);
    return () => {
      users--;
      window.removeEventListener("scroll", sync, true);
      window.removeEventListener("resize", sync);
      if (!users) for (const k of ["--ub-top", "--ub-left", "--ub-right"]) document.documentElement.style.removeProperty(k);
    };
  }, [on]);
}
