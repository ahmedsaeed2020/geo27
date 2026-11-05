import { describe, it, expect } from 'vitest';
import { CUSTOMER_COUNT, CUSTOMER_LOGOS } from '@/content/success-stories';
import { HOME_SECTIONS } from '@/content/section-registry';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../success-stories.css', import.meta.url), 'utf8');

describe('success stories logo ticker', () => {
  it('shows every supplied customer logo once per loop, each with a served asset', () => {
    expect(CUSTOMER_LOGOS).toHaveLength(35);
    expect(new Set(CUSTOMER_LOGOS.map(l => l.file)).size).toBe(35);
    for (const logo of CUSTOMER_LOGOS) expect(logo.src).toMatch(/^\/__l5e\/assets-v1\/.+\.webp$/);
  });

  it('uses the approved customer figure', () => {
    expect(CUSTOMER_COUNT).toBe(50);
  });

  it('sits on the home page directly before the demo form', () => {
    const ids = HOME_SECTIONS.map(s => s.id) as string[];
    expect(ids.indexOf('stories')).toBe(ids.indexOf('lead') - 1);
  });

  it('caps each logo at 200px with about eight across the screen, and loops by half the doubled track', () => {
    expect(css).toContain('calc((100vw - 64px) / 8 - var(--ss-gap)), 200px)');
    expect(css).toMatch(/to \{ transform: translate3d\(-50%, 0, 0\); \}/);
    expect(css).toMatch(/\.ss-track\[data-flow='ltr'\] \{ animation-direction: reverse; \}/);
  });
});
