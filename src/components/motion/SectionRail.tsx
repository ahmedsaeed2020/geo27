import { useEffect, useState, type CSSProperties, type RefObject } from 'react';
import { useLocale } from '@/lib/i18n';

type Item = { el: HTMLElement; heading: HTMLElement; label: string };

/** Wrappers around a hero and its sections, and first folds that never get a rail stop. */
const WRAPPERS = '.hr-page, .sp-page, .pv-root, .pv-page, .hs';
const SKIP = '.hero, .pos-hero, .hr-hero, .sp-hero, .pv-hero, .hx, #digit-orbit, .band-crumb, .dp-siblings, .ss-root';
const COPY = {
  nav: { ar: 'أقسام الصفحة', en: 'Page sections' },
  go: { ar: 'انتقل إلى', en: 'Go to' },
};

function collect(root: HTMLElement): Item[] {
  const out: Item[] = [];
  const walk = (el: Element, depth: number) => {
    for (const child of Array.from(el.children)) {
      if (!(child instanceof HTMLElement) || child.matches(SKIP)) continue;
      if (depth < 2 && child.matches(WRAPPERS)) { walk(child, depth + 1); continue; }
      const heading = child.querySelector<HTMLElement>('h2');
      const label = heading?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
      if (!heading || !label || child.offsetHeight < 240) continue;
      out.push({ el: child, heading, label: label.length > 46 ? `${label.slice(0, 44).trim()}…` : label });
    }
  };
  walk(root, 0);
  return out;
}

let probe: CanvasRenderingContext2D | null | undefined;

/** True when a section paints an opaque dark background (any CSS colour space, resolved through a 1px canvas). */
function isDark(el: HTMLElement): boolean {
  const bg = getComputedStyle(el).backgroundColor;
  if (!bg || bg === 'transparent' || bg === 'rgba(0, 0, 0, 0)') return false;
  if (probe === undefined) probe = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  if (!probe) return false;
  probe.clearRect(0, 0, 1, 1);
  probe.fillStyle = '#fff';
  probe.fillStyle = bg;
  probe.fillRect(0, 0, 1, 1);
  const [r = 255, g = 255, b = 255, a = 0] = probe.getImageData(0, 0, 1, 1).data;
  return a > 128 && r * 0.299 + g * 0.587 + b * 0.114 < 90;
}

/**
 * Animated section navigation for long pages: a fixed rail of section stops whose fill follows the reader. It only
 * appears on wide desktops (CSS), stays out of the first fold, lists the page's own section headings and scrolls to
 * them without changing the URL.
 */
export default function SectionRail({ rootRef, pageKey }: { rootRef: RefObject<HTMLElement | null>; pageKey: string }) {
  const locale = useLocale();
  const [items, setItems] = useState<Item[]>([]);
  const [active, setActive] = useState(-1);
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || !window.matchMedia('(min-width: 1400px)').matches) return;
    setActive(-1);
    // Sections settle after hydration (CMS order, lazy blocks), so the stops are re-collected whenever the page's
    // height changes and kept when the same headings come back.
    let timer = 0;
    let current: Item[] = [];
    const refresh = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        const next = collect(root);
        const same = next.length === current.length && next.every((item, i) => item.el === current[i]!.el && item.label === current[i]!.label);
        if (same) return;
        current = next;
        setItems(next);
      }, 250);
    };
    const resize = new ResizeObserver(refresh);
    resize.observe(root);
    refresh();
    return () => { window.clearTimeout(timer); resize.disconnect(); };
  }, [rootRef, pageKey]);

  useEffect(() => {
    if (items.length < 4) return;
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        const index = items.findIndex(item => item.el === entry.target);
        if (index < 0) continue;
        // Back above the first section (the first fold): the rail steps aside again.
        if (!entry.isIntersecting) {
          if (index === 0 && entry.boundingClientRect.top > 0) setActive(-1);
          continue;
        }
        setActive(index);
        // Dark bands get a dark dot fill so the rail stays legible on them.
        setDark(isDark(items[index]!.el));
      }
    }, { rootMargin: '-45% 0px -50% 0px' });
    items.forEach(item => observer.observe(item.el));
    return () => observer.disconnect();
  }, [items]);

  if (items.length < 4) return null;
  const go = (item: Item) => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    item.el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    // Move keyboard focus to the section heading without leaving a permanent tab stop on it.
    const { heading } = item;
    if (!heading.hasAttribute('tabindex')) {
      heading.setAttribute('tabindex', '-1');
      heading.addEventListener('blur', () => heading.removeAttribute('tabindex'), { once: true });
    }
    heading.focus({ preventScroll: true });
  };
  const progress = items.length > 1 ? Math.max(0, active) / (items.length - 1) : 0;
  return (
    <nav className="dm-rail" aria-label={COPY.nav[locale]} data-on={active >= 0 ? '' : undefined} data-dark={dark ? '' : undefined} style={{ '--dm-rail': progress.toFixed(3) } as CSSProperties}>
      <span className="dm-rail-track" aria-hidden="true" />
      <span className="dm-rail-fill" aria-hidden="true" />
      <ol>
        {items.map((item, index) => (
          <li key={`${index}-${item.label}`}>
            <button type="button" onClick={() => go(item)} aria-current={index === active ? 'location' : undefined} data-seen={index <= active ? '' : undefined} aria-label={`${COPY.go[locale]}: ${item.label}`}>
              <span className="dm-rail-dot" aria-hidden="true" />
              <span className="dm-rail-label" aria-hidden="true">{item.label}</span>
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );
}
