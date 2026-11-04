import { describe, expect, it } from 'vitest';
import { HR_MODULES, type HrModuleContent } from '@/content/hr/hr-modules';
import { HR_SHOTS } from '@/content/hr/hr-shots';
import provenance from '@/content/hr/hr-shots-provenance.json';
import { productByKey } from '@/content/catalog';
import { cmsContentSchema, departmentPublishIssues, sourceBlock } from '@/lib/cms-schema';

const files = import.meta.glob<HrModuleContent>('/src/content/hr/modules/*.json', { eager: true, import: 'default' });
const content = (slug: string) => files[`/src/content/hr/modules/${slug}.json`]!;
const all = HR_MODULES.map(m => content(m.slug));
const ARABIC = /[\u0600-\u06FF]/;

const seeded = (slug: string, mutate?: (blocks: ReturnType<typeof sourceBlock>[]) => ReturnType<typeof sourceBlock>[]) => {
  const refs = content(slug).sections.map(s => sourceBlock(s.id));
  const blocks = mutate ? mutate(refs) : refs;
  const side = { title: '', description: '', headline: '', lede: '', blocks };
  return cmsContentSchema.parse({ ar: side, en: side, department: { product: 'hr', id: slug } });
};

describe('DIGIT HR module coverage (owner handoff)', () => {
  it('keeps all 7 pages, 30 sections, 147 features and 98 screen contracts', () => {
    expect(all).toHaveLength(7);
    expect(all.flatMap(m => m.sections)).toHaveLength(30);
    expect(new Set(all.flatMap(m => Object.keys(m.features))).size).toBe(147);
    expect(new Set(all.flatMap(m => Object.keys(m.screens))).size).toBe(98);
  });

  it('gives each page an intro heading that differs from its hero headline in both languages', () => {
    for (const m of all)
      for (const l of ['ar', 'en'] as const) expect(m.intro.title[l].trim(), `${m.slug} ${l}`).not.toBe(m.hero.title[l].trim());
  });

  it('gives every section feature and screen id a definition in its own page', () => {
    for (const m of all)
      for (const s of m.sections) {
        for (const f of s.features) expect(m.features[f], `${s.id}/${f}`).toBeDefined();
        for (const x of s.screens) expect(m.screens[x], `${s.id}/${x}`).toBeDefined();
      }
  });

  it('matches the HR menu: one source page per registered HR department', () => {
    expect(productByKey('hr')!.departments.map(d => d.id)).toEqual(HR_MODULES.map(m => m.slug));
    for (const m of HR_MODULES) expect(content(m.slug).sections.map(s => s.id)).toEqual(m.sections.map(s => s.id));
  });

  it('has English for every string and no Arabic inside English copy', () => {
    const walk = (v: unknown, path: string): void => {
      if (v && typeof v === 'object' && 'ar' in v && 'en' in v) {
        const l = v as { ar: string; en: string };
        expect(l.ar.trim(), path).not.toBe('');
        expect(l.en.trim(), path).not.toBe('');
        expect(ARABIC.test(l.en), `${path}: ${l.en}`).toBe(false);
        return;
      }
      if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, `${path}.${k}`);
    };
    for (const m of all) walk(m, m.slug);
  });
});

describe('DIGIT HR claims', () => {
  it('shows every owner-approved handoff feature, withholding none (owner approval 2026-11-04)', () => {
    const withheld = all.flatMap(m => Object.entries(m.features).filter(([, f]) => f.withheld).map(([id]) => id));
    expect(withheld).toEqual([]);
  });

  it('limits AI wording to the two owner-approved AI features (REC-09, ANL-09)', () => {
    const ai = /الذكاء الاصطناعي|\bAI\b/;
    const withAi = all.flatMap(m => Object.entries(m.features).filter(([, f]) => ai.test(f.text.ar) || ai.test(f.text.en)).map(([id]) => id));
    expect(new Set(withAi)).toEqual(new Set(['REC-09', 'ANL-09']));
    for (const m of all) {
      const rest = { ...m, features: Object.fromEntries(Object.entries(m.features).filter(([id]) => !withAi.includes(id))) };
      expect(JSON.stringify(rest), m.slug).not.toMatch(ai);
    }
  });

  it('never names the underlying platform in visible copy', () => {
    for (const m of all) expect(JSON.stringify(m), m.slug).not.toMatch(/Frappe|ERPNext|HRMS|NOT_CONFIGURED/);
  });

  it('flags the wage-protection and Saudization sections for the no-integration note', () => {
    const regulated = all.flatMap(m => m.sections.filter(s => s.regulated).map(s => s.id));
    expect(regulated).toEqual(['04.2', '04.3']);
  });
});

describe('DIGIT HR screens', () => {
  it('registers the 16 handoff screenshots with verified SHA-256 provenance', () => {
    expect(Object.keys(HR_SHOTS)).toHaveLength(16);
    const rows = Object.entries(provenance);
    expect(rows).toHaveLength(16);
    for (const [id, p] of rows) {
      expect(HR_SHOTS[id], id).toBeDefined();
      expect(p.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(p.handoffShaMatches, id).toBe(true);
      expect(p.privacyReview, `${id}: owner confirmed the employee names are demo data`).toBe('owner-confirmed-demo-data-2026-11-04');
      const [x0, y0, x1, y1] = p.cropPx as [number, number, number, number];
      const [w, h] = p.originalPx as [number, number];
      expect(x0 === 0 && x1 === w && y1 === h && y0 >= 0 && y0 < h * 0.07, `${id} only drops the top bar`).toBe(true);
    }
  });

  it('uses every HR screenshot on at least one page and only known ones', () => {
    const used = new Set(HR_MODULES.flatMap(m => [...m.heroShots, ...Object.values(m.sectionShots).flat().map(r => r.id)]));
    for (const id of used) expect(HR_SHOTS[id], id).toBeDefined();
    expect(used).toEqual(new Set(Object.keys(HR_SHOTS)));
    for (const m of HR_MODULES) for (const ref of Object.keys(m.sectionShots)) expect(m.sections.some(s => s.id === ref), `${m.slug}/${ref}`).toBe(true);
  });

  it('shows a real screen in every hero except Employee Experience, which is illustrative', () => {
    for (const m of HR_MODULES) {
      if (m.slug === 'employee-experience') {
        expect(m.illustrative).toBe(true);
        expect(m.heroShots).toEqual([]);
      } else expect(m.heroShots.length, m.slug).toBeGreaterThan(0);
    }
  });

  it('gives each HR page its own hero composition', () => {
    expect(new Set(HR_MODULES.map(m => m.hero)).size).toBe(7);
  });
});

describe('DIGIT HR publish gate', () => {
  it('accepts a seeded HR draft whose empty fields fall back to the source copy', () => {
    for (const m of HR_MODULES) expect(departmentPublishIssues(seeded(m.slug)), m.slug).toEqual([]);
  });

  it('blocks an HR page whose visible sections drop below three', () => {
    const issues = departmentPublishIssues(seeded('employee-experience', blocks => blocks.map((b, i) => ({ ...b, enabled: i === 0 }))));
    expect(issues.some(x => x.includes('3 أقسام'))).toBe(true);
  });

  it('flags a source block pointing at a section the page does not have', () => {
    const issues = departmentPublishIssues(seeded('core-hr', blocks => [...blocks, sourceBlock('09.9')]));
    expect(issues.some(x => x.includes('قسم مصدر غير معروف'))).toBe(true);
  });
});
