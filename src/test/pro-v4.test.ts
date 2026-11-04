import { describe, expect, it } from 'vitest';
import { PRO_PAGES, proLeadTopic, proPageByPath, proWorkspacesOf, PRO_AREAS, areaSlug } from '@/content/pro/pro-pages';
import { EVIDENCE, shotEvidenceId, tierOf, tierOfId, type EvidenceTier } from '@/content/pro/evidence';
import { REPORTS, REPORTS_WITHHELD, reportByKey } from '@/content/pro/reports';
import type { Feature, ProPageContent, ProSection, ShotRef } from '@/content/pro/types';
import { SHOTS } from '@/content/product-shots';
import { ALL_DEPARTMENTS, productByKey } from '@/content/catalog';
import { leadSchema } from '@/lib/leads-schema';

const modules = import.meta.glob<ProPageContent>('../content/pro/pages/*.ts', { eager: true, import: 'default' });
const pages = Object.values(modules);
const pageOf = (key: string) => pages.find(p => p.key === key)!;

/** Every place a Pro page names a capability as available, a screen, or a report. */
function collect(sections: ProSection[]) {
  const features: Feature[] = [];
  const shots: { id: string; claims?: string }[] = [];
  const refs: ShotRef[] = [];
  const reports: string[] = [];
  const scoped: { tier: EvidenceTier; ids: string[]; shot?: string }[] = [];
  const push = (f: Feature) => {
    features.push(f);
    if (f.shot) shots.push({ id: f.shot, claims: f.id });
  };
  for (const s of sections) {
    switch (s.kind) {
      case 'workspace':
        s.ws.overview.features.forEach(push);
        if (s.ws.overview.lead) refs.push(s.ws.overview.lead);
        refs.push(...(s.ws.overview.extra ?? []));
        reports.push(...s.ws.reports.keys);
        break;
      case 'features':
        s.items.forEach(push);
        break;
      case 'explorer':
        s.items.forEach(push);
        break;
      case 'match':
        s.checks.forEach(push);
        break;
      case 'chapter':
        refs.push(s.lead);
        s.points.forEach(p => p.id && features.push({ id: p.id, title: p.title, body: p.body }));
        reports.push(...s.reports);
        (s.support ?? []).forEach(id => shots.push({ id }));
        break;
      case 'anatomy':
        refs.push(s.lead, ...(s.support ?? []));
        break;
      case 'flow':
        s.steps.forEach(st => st.shot && shots.push({ id: st.shot }));
        break;
      case 'lifecycle':
        s.stages.forEach(st => st.shot && shots.push({ id: st.shot }));
        break;
      case 'mosaic':
        s.items.forEach(i => shots.push({ id: i.shot }));
        break;
      case 'decisions':
        s.items.forEach(i => {
          if (i.shot) shots.push({ id: i.shot });
          if (i.report) reports.push(i.report);
        });
        break;
      case 'report-feature':
        s.items.forEach(i => {
          shots.push({ id: i.shot });
          reports.push(i.key);
        });
        break;
      case 'layers':
        s.layers.forEach(l => shots.push({ id: l.shot }));
        break;
      case 'questions':
        s.items.forEach(q => {
          if (q.shot) shots.push({ id: q.shot });
          reports.push(...q.reports);
        });
        break;
      case 'scope':
        s.items.forEach(i => scoped.push({ tier: i.tier, ids: i.ids, ...(i.shot ? { shot: i.shot } : {}) }));
        break;
      default:
        break;
    }
  }
  refs.forEach(r => shots.push({ id: r.id }));
  return { features, shots, refs, reports, scoped };
}

describe('DIGIT Pro V4 page registry', () => {
  it('has content for all ten pages, with the same sections in the same order as the registry', () => {
    expect(PRO_PAGES).toHaveLength(10);
    for (const config of PRO_PAGES) {
      const content = pageOf(config.key);
      expect(content, config.key).toBeDefined();
      expect(content.sections.map(s => s.id)).toEqual(config.sections.map(s => s.id));
    }
  });

  it('keeps the five operational departments on their existing routes and adds four areas under /pro', () => {
    const departments = PRO_PAGES.filter(p => p.kind === 'department');
    const pro = productByKey('pro')!;
    expect(departments.map(d => d.path)).toEqual(pro.departments.map(d => d.path));
    expect(departments.map(d => d.key)).toEqual(pro.departments.map(d => d.id));
    expect(PRO_AREAS.map(a => a.path)).toEqual(['/pro/executive-dashboards', '/pro/settings-governance', '/pro/capabilities', '/pro/cfo-decisions']);
    expect(PRO_AREAS.every(a => /^[a-z-]+$/.test(areaSlug(a)))).toBe(true);
    // Cross-department areas never count as departments.
    expect(ALL_DEPARTMENTS.filter(d => d.product === 'pro')).toHaveLength(5);
    expect(proPageByPath('/en/modules/sales')?.key).toBe('selling');
    expect(proPageByPath('/pro/capabilities/')?.key).toBe('capabilities');
  });

  it('maps four workspaces for each of the five departments on the /pro hub (20 in all)', () => {
    const pro = productByKey('pro')!;
    const spaces = pro.departments.map(d => proWorkspacesOf(d.path));
    expect(spaces.map(s => s.length)).toEqual([4, 4, 4, 4, 4]);
    expect(new Set(spaces.flat().map(s => s.id)).size).toBe(20);
    expect(proWorkspacesOf('/en/modules/accounting').map(s => s.id)).toEqual(['ACC-OPS', 'ACC-DUES', 'ACC-CASH', 'ACC-REPORT']);
    // Every workspace is also a valid lead topic, so a hub or page CTA can name it.
    expect(spaces.flat().every(s => proLeadTopic(s.id) === s.id)).toBe(true);
  });
});

describe('DIGIT Pro V4 evidence rules', () => {
  it('maps every one of the 321 Run11.1 requirement IDs to an evidence class', () => {
    const parts = Object.values(EVIDENCE).reduce<Record<string, number>>((a, e) => ({ ...a, [e.part]: (a[e.part] ?? 0) + 1 }), {});
    expect(parts).toEqual({ B: 121, F: 68, I: 120, X: 12 });
  });

  it('presents a capability as available only when its ID is complete and verified', () => {
    for (const page of pages) {
      for (const f of collect(page.sections).features) expect(tierOfId(f.id), `${page.key}: ${f.id}`).toBe('available');
    }
  });

  it('uses a real screen only as proof of the ID it was captured for, and only real screens', () => {
    for (const page of pages) {
      for (const shot of collect(page.sections).shots) {
        expect(SHOTS[shot.id], `${page.key}: ${shot.id}`).toBeDefined();
        expect(tierOfId(shotEvidenceId(shot.id)), shot.id).toBe('available');
        if (shot.claims) expect(shotEvidenceId(shot.id), `${page.key}: ${shot.claims}`).toBe(shot.claims);
      }
    }
  });

  it('labels scope items no higher than their evidence', () => {
    const rank: Record<EvidenceTier, number> = { available: 0, verifying: 1, scoped: 2 };
    for (const page of pages) {
      for (const item of collect(page.sections).scoped) {
        expect(item.ids.length, page.key).toBeGreaterThan(0);
        const worst = Math.max(...item.ids.map(id => rank[tierOf(EVIDENCE[id]!.cls)]));
        expect(rank[item.tier], `${page.key}: ${item.ids.join(',')}`).toBe(worst);
        if (item.shot) expect(item.ids).toContain(shotEvidenceId(item.shot));
      }
    }
  });

  it('shows lifecycle stages as on a real screen only when that screen is verified', () => {
    const assets = pageOf('fixed-assets').sections.find(s => s.kind === 'lifecycle');
    if (assets?.kind !== 'lifecycle') throw new Error('missing lifecycle');
    for (const st of assets.stages) {
      if (st.shown) expect(tierOfId(shotEvidenceId(st.shot!))).toBe('available');
      else expect(st.shot).toBeUndefined();
    }
  });

  it('answers each executive question with a verified screen of its own evidence, or names it as report-only', () => {
    const q = pageOf('cfo').sections.find(s => s.kind === 'questions');
    if (q?.kind !== 'questions') throw new Error('missing questions');
    expect(q.items.map(i => i.id)).toEqual(Array.from({ length: 12 }, (_, i) => `EXE-${String(i + 1).padStart(2, '0')}`));
    for (const item of q.items) {
      if (item.status === 'screen') {
        expect(item.shot, item.id).toBeDefined();
        expect(item.evidence).toEqual([shotEvidenceId(item.shot!)]);
        expect(tierOfId(item.evidence[0]!)).toBe('available');
      } else {
        expect(item.shot).toBeUndefined();
        expect(item.reports.length).toBeGreaterThan(0);
      }
    }
  });
});

describe('DIGIT Pro V4 reports', () => {
  it('lists only runnable reports and references only listed ones', () => {
    expect(REPORTS).toHaveLength(117);
    expect(new Set(REPORTS.map(r => r.key)).size).toBe(REPORTS.length);
    for (const w of REPORTS_WITHHELD) expect(reportByKey(w.key)).toBeUndefined();
    for (const page of pages) for (const key of collect(page.sections).reports) expect(reportByKey(key), `${page.key}: ${key}`).toBeDefined();
  });
});

describe('DIGIT Pro V4 copy', () => {
  const copy = JSON.stringify(pages);
  it('names no other vendor and makes no banned claim', () => {
    expect(copy).not.toMatch(/odoo|\bsap\b|netsuite|acumatica|dynamics|d365|business central|\bsage\b|erpnext|frappe|oracle|zoho/i);
    expect(copy).not.toMatch(/certified|معتمد من|مضمون|الأفضل|100%|guarantee/i);
  });
  it('keeps internal evidence codes and prices out of visitor copy', () => {
    expect(copy).not.toMatch(/COMPLETE_VERIFIED|STAGING|UAT|Run11|OWNER_POLICY|ر\.س|SAR \d/);
  });
});

describe('DIGIT Pro V4 lead topics', () => {
  it('keeps known workspace and question topics and drops anything else', () => {
    expect(proLeadTopic('ACC-OPS')).toBe('ACC-OPS');
    expect(proLeadTopic('EXE-12')).toBe('EXE-12');
    expect(proLeadTopic('cfo')).toBe('cfo');
    expect(proLeadTopic('<script>')).toBe('');
    const base = { name: 'Test', company: 'Co', email: 'a@b.co', phone: '', interest: '', requestType: 'demo', jobRole: '', message: '', locale: 'ar', pagePath: '/modules/accounting', consent: true } as const;
    expect(leadSchema.parse({ ...base, topic: 'ACC-OPS' }).topic).toBe('ACC-OPS');
    expect(leadSchema.parse(base).topic).toBe('');
  });
});
