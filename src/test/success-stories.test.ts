import { describe, it, expect } from 'vitest';
import { CUSTOMER_COUNT, CUSTOMER_LOGOS } from '@/content/success-stories';
import { HOME_SECTIONS } from '@/content/section-registry';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const css = readFileSync(path.resolve(process.cwd(), 'src/success-stories.css'), 'utf8');

describe('success stories logo ticker', () => {
  it('shows every supplied customer logo once per loop, each with a served asset', () => {
    expect(CUSTOMER_LOGOS).toHaveLength(35);
    expect(new Set(CUSTOMER_LOGOS.map(l => l.file)).size).toBe(35);
    for (const logo of CUSTOMER_LOGOS) expect(logo.src).toMatch(/^\/__l5e\/assets-v1\/.+\.webp$/);
  });

  it('uses the approved customer figure', () => {
    expect(CUSTOMER_COUNT).toBe(200); // owner 2026-11-05: «أكثر من 200 منشأة سعودية»
  });

  it('sits on the home page directly before the demo form', () => {
    const ids = HOME_SECTIONS.map(s => s.id) as string[];
    expect(ids.indexOf('stories')).toBe(ids.indexOf('lead') - 1);
  });

  it('fits about eight logos across the boxed strip (not the screen) and loops by half the doubled track', () => {
    expect(css).toContain('calc(100cqw / 8 - var(--ss-gap))');
    expect(css).toContain('container-type: inline-size');
    expect(css).not.toContain('100vw');
    expect(css).toMatch(/to \{ transform: translate3d\(-50%, 0, 0\); \}/);
  });

  it('moves right to left in Arabic and left to right in English', () => {
    expect(css).toMatch(/\.ss-track\[data-flow='ltr'\] \{ animation-direction: reverse; \}/);
    expect(css).not.toMatch(/\.ss-track\[data-flow='rtl'\][^}]*reverse/);
  });

  it('pauses only while the pointer rests on it (or keyboard focus)', () => {
    expect(css).toMatch(/\.ss-viewport:hover \.ss-track,\s*\.ss-root \.ss-viewport:focus-visible \.ss-track \{ animation-play-state: paused; \}/);
    expect(css).not.toContain('data-paused');
  });
});
