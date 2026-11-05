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

/**
 * Animated section navigation for long pages: a fixed rail of section stops whose fill follows the reader. It only
 * appears on wide desktops (CSS), lists the page's own section headings and scrolls to them without changing the URL.
 */
export default function SectionRail({ rootRef, pageKey }: { rootRef: RefObject<HTMLElement | null>; pageKey: string }) {
  const locale = useLocale();
  const [items, setItems] = useState<Item[]>([]);
  const [active, setActive] = useState(-1);
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || !window.matchMedia('(min-width: 1400px)').matches) return;
    // Sections settle after hydration (CMS order, lazy blocks), so collect once the page has painted.
    const id = window.setTimeout(() => setItems(collect(root)), 400);
    return () => window.clearTimeout(id);
  }, [rootRef, pageKey]);

  useEffect(() => {
    if (items.length < 4) return;
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const index = items.findIndex(item => item.el === entry.target);
        if (index < 0) continue;
        setActive(index);
        const bg = getComputedStyle(items[index]!.el).backgroundColor;
        const rgb = bg.match(/\d+(\.\d+)?/g)?.map(Number) ?? [];
        // Dark bands get a dark dot fill so the rail stays legible on them.
        setDark(rgb.length >= 3 && (rgb[3] ?? 1) > 0.5 && (rgb[0]! * 0.299 + rgb[1]! * 0.587 + rgb[2]! * 0.114) < 90);
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
            <button type="button" onClick={() => go(item)} aria-current={index === active ? 'true' : undefined} data-seen={index <= active ? '' : undefined} aria-label={`${COPY.go[locale]}: ${item.label}`}>
              <span className="dm-rail-dot" aria-hidden="true" />
              <span className="dm-rail-label" aria-hidden="true">{item.label}</span>
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );
}
