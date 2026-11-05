import { describe, expect, it } from 'vitest';
import { PRODUCTS } from '@/content/catalog';
import { GLYPHS } from '@/components/icons/digit-glyphs';
import { DEPARTMENT_GLYPH, FAMILY_VISUAL } from '@/components/nav/nav-visuals';

const entries = (key: (typeof PRODUCTS)[number]['key']) => {
  const p = PRODUCTS.find(f => f.key === key)!;
  return (p.key === 'pos' ? p.solutions : p.departments).map(d => d.id);
};

describe('Menu icons come from the DIGIT icon set', () => {
  it('gives every product family a DIGIT glyph', () => {
    for (const p of PRODUCTS) expect(GLYPHS[FAMILY_VISUAL[p.key].glyph], p.key).toBeDefined();
  });

  it('gives every department and POS activity its own DIGIT glyph (no fallback to the family glyph)', () => {
    for (const p of PRODUCTS) {
      for (const id of entries(p.key)) {
        const glyph = DEPARTMENT_GLYPH[`${p.key}:${id}`];
        expect(glyph, `${p.key}:${id}`).toBeDefined();
        expect(glyph && GLYPHS[glyph], `${p.key}:${id}`).toBeDefined();
      }
    }
  });

  it('never repeats a glyph inside one product menu, including the family glyph', () => {
    for (const p of PRODUCTS) {
      const glyphs = [FAMILY_VISUAL[p.key].glyph, ...entries(p.key).map(id => DEPARTMENT_GLYPH[`${p.key}:${id}`])];
      expect(new Set(glyphs).size, p.key).toBe(glyphs.length);
    }
  });

  it('gives the six products six different glyphs in the systems menu', () => {
    const glyphs = PRODUCTS.map(p => FAMILY_VISUAL[p.key].glyph);
    expect(new Set(glyphs).size).toBe(6);
  });

  it('uses the original digit-erp.com icons for the DIGIT Pro departments', () => {
    for (const id of entries('pro')) {
      const glyph = DEPARTMENT_GLYPH[`pro:${id}`];
      expect(glyph && GLYPHS[glyph].from, id).toBe('site');
    }
  });
});
