import { useEffect, useRef } from 'react';

/**
 * Marks a horizontal scroller with `data-more-start` / `data-more-end` while content is hidden on that side
 * (direction-aware), and centres the `[aria-current="page"]` item once on mount so the active entry is visible.
 */
export function useScrollEdges<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rtl = getComputedStyle(el).direction === 'rtl';
    const update = () => {
      const max = el.scrollWidth - el.clientWidth;
      const pos = Math.abs(el.scrollLeft);
      const atStart = pos <= 2;
      const atEnd = pos >= max - 2;
      el.toggleAttribute('data-more-start', max > 2 && !atStart);
      el.toggleAttribute('data-more-end', max > 2 && !atEnd);
    };
    const active = el.querySelector<HTMLElement>('[aria-current="page"]');
    if (active && el.scrollWidth > el.clientWidth) {
      const a = active.getBoundingClientRect();
      const box = el.getBoundingClientRect();
      el.scrollLeft += a.left + a.width / 2 - (box.left + box.width / 2);
    }
    update();
    el.addEventListener('scroll', update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    void rtl;
    return () => {
      el.removeEventListener('scroll', update);
      ro.disconnect();
    };
  }, []);
  return ref;
}
