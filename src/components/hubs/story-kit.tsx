import { useRef, useState, type KeyboardEvent } from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { NavLink } from '@/components/nav/nav-links';
import type { L } from '@/content/specialist/types';
import type { Locale } from '@/lib/i18n';

const OPEN_DEPT: L = { ar: 'افتح صفحة المجال', en: 'Open the area page' };

/** Arrow-key navigation for a row of tabs (RTL-aware); vertical lists use up/down. */
export function useTabs(count: number, locale: Locale, vertical = false, initial = 0) {
  const [active, setActive] = useState(initial);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    const keys = vertical ? ['ArrowUp', 'ArrowDown'] : ['ArrowLeft', 'ArrowRight'];
    if (!keys.includes(e.key) && e.key !== 'Home' && e.key !== 'End') return;
    e.preventDefault();
    let next = active;
    if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = count - 1;
    else {
      const forward = vertical ? e.key === 'ArrowDown' : e.key === (locale === 'ar' ? 'ArrowLeft' : 'ArrowRight');
      next = (active + (forward ? 1 : -1) + count) % count;
    }
    setActive(next);
    refs.current[next]?.focus();
  };
  const tabProps = (i: number, panelId: string, tabId: string) => ({
    ref: (el: HTMLButtonElement | null) => {
      refs.current[i] = el;
    },
    id: tabId,
    type: 'button' as const,
    role: 'tab' as const,
    'aria-selected': i === active,
    'aria-controls': panelId,
    tabIndex: i === active ? 0 : -1,
    onClick: () => setActive(i),
    onKeyDown,
  });
  return { active, setActive, tabProps };
}

export function Head({ kicker, title, lede, id }: { kicker: string; title: string; lede?: string; id: string }) {
  return (
    <header className="hs-head">
      <p className="sp-kicker">{kicker}</p>
      <h2 id={id}>{title}</h2>
      {lede && <p className="sp-lede">{lede}</p>}
    </header>
  );
}

export function DeptLink({ path, locale, label = OPEN_DEPT }: { path: string; locale: Locale; label?: L }) {
  const Arrow = locale === 'ar' ? ArrowLeft : ArrowRight;
  return (
    <NavLink path={path} className="hs-link">
      {label[locale]}
      <Arrow aria-hidden="true" />
    </NavLink>
  );
}

