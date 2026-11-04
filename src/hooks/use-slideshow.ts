import { useCallback, useEffect, useRef, useState, type FocusEvent, type KeyboardEvent, type PointerEvent } from 'react';

/** Follows the visitor's reduced-motion preference (false during server render). */
export function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReduced(query.matches);
    sync();
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, []);
  return reduced;
}

/**
 * Shared state for the home sliders: active slide and direction, autoplay that pauses on hover, keyboard focus,
 * hidden tab, off-screen or `paused` (e.g. an open lightbox), arrow-key tabs and touch swipes that follow the reading
 * direction. The progress bar's animation end advances the slide, so timing lives in CSS.
 */
export function useSlideshow({ count, locale, paused = false, threshold = 0.35 }: { count: number; locale: 'ar' | 'en'; paused?: boolean; threshold?: number }) {
  const reduced = useReducedMotion();
  const sectionRef = useRef<HTMLElement>(null);
  const tabsRef = useRef<HTMLDivElement>(null);
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const [active, setActive] = useState(0);
  const [direction, setDirection] = useState<1 | -1>(1);
  const [cycle, setCycle] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [inView, setInView] = useState(false);
  const [seen, setSeen] = useState(false);
  const [pageVisible, setPageVisible] = useState(true);

  // Visitors who prefer less motion start paused; they can still press play.
  useEffect(() => { if (reduced) setPlaying(false); }, [reduced]);

  useEffect(() => {
    const node = sectionRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(([entry]) => {
      const visible = Boolean(entry?.isIntersecting);
      setInView(visible);
      if (visible) setSeen(true);
    }, { threshold });
    observer.observe(node);
    const onVisibility = () => setPageVisible(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', onVisibility);
    return () => { observer.disconnect(); document.removeEventListener('visibilitychange', onVisibility); };
  }, [threshold]);

  const go = useCallback((target: number, step?: 1 | -1) => {
    setActive(current => {
      const next = (target + count) % count;
      setDirection(step ?? (next >= current ? 1 : -1));
      return next;
    });
    setCycle(c => c + 1);
  }, [count]);

  // Keep the active tab in view when the tab row scrolls (phones), without moving the page.
  useEffect(() => {
    const row = tabsRef.current;
    const tab = row?.querySelector<HTMLElement>(`[data-index="${active}"]`);
    if (!row || !tab || row.scrollWidth <= row.clientWidth + 1) return;
    const rowBox = row.getBoundingClientRect();
    const tabBox = tab.getBoundingClientRect();
    row.scrollBy({ left: tabBox.left + tabBox.width / 2 - (rowBox.left + rowBox.width / 2), behavior: reduced ? 'auto' : 'smooth' });
  }, [active, reduced]);

  const running = playing && !reduced && inView && !hovered && !focused && pageVisible && !paused;
  const forwardKey = locale === 'ar' ? 'ArrowLeft' : 'ArrowRight';
  const backKey = locale === 'ar' ? 'ArrowRight' : 'ArrowLeft';

  const onTabsKey = (event: KeyboardEvent<HTMLDivElement>) => {
    let target: number | null = null;
    if (event.key === forwardKey) target = active + 1;
    else if (event.key === backKey) target = active - 1;
    else if (event.key === 'Home') target = 0;
    else if (event.key === 'End') target = count - 1;
    if (target === null) return;
    event.preventDefault();
    const next = (target + count) % count;
    go(next, event.key === backKey || event.key === 'Home' ? -1 : 1);
    tabsRef.current?.querySelector<HTMLElement>(`[data-index="${next}"]`)?.focus();
  };

  // Pause for keyboard users only; a mouse click on a tab should not freeze autoplay.
  const sectionHandlers = {
    onMouseEnter: () => setHovered(true),
    onMouseLeave: () => setHovered(false),
    onFocus: (event: FocusEvent<HTMLElement>) => { if ((event.target as HTMLElement).matches(':focus-visible')) setFocused(true); },
    onBlur: (event: FocusEvent<HTMLElement>) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false); },
  };

  const swipeHandlers = {
    onPointerDown: (event: PointerEvent<HTMLElement>) => {
      if (event.pointerType === 'mouse') return;
      swipe.current = { x: event.clientX, y: event.clientY };
    },
    onPointerUp: (event: PointerEvent<HTMLElement>) => {
      const from = swipe.current;
      swipe.current = null;
      if (!from) return;
      const dx = event.clientX - from.x;
      const dy = event.clientY - from.y;
      if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy) * 1.4) return;
      // Arabic reads right to left, so the next slide arrives with a rightward swipe.
      const forward = locale === 'ar' ? dx > 0 : dx < 0;
      go(active + (forward ? 1 : -1), forward ? 1 : -1);
    },
    onPointerCancel: () => { swipe.current = null; },
  };

  return { sectionRef, tabsRef, active, direction, cycle, go, playing, setPlaying, reduced, seen, running, onTabsKey, sectionHandlers, swipeHandlers };
}
