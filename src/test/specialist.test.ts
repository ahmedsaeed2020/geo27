import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { CONSTRUCTION } from '@/content/specialist/construction';
import { CRM } from '@/content/specialist/crm';
import { FSM } from '@/content/specialist/fsm';
import { SPECIALIST_INDEX } from '@/content/specialist/index-data';
import { CONSTRUCTION_MONEY_CHAIN, CONSTRUCTION_COST_MEASURES, CRM_JOURNEY, CRM_WORKBENCH, FSM_LOOP, POS_INDUSTRIES } from '@/content/specialist/stories';
import { ALL_SHOTS, screenById } from '@/content/screens';
import { productByKey, departmentById } from '@/content/catalog';
import { cmsContentSchema, departmentPublishIssues, sourceBlock } from '@/lib/cms-schema';
import { SOURCE_AREA_LINKS } from '@/content/source-area-links';
import crmModulePage from '@/content/site/modules-crm.json';

type SrcNode = { id: string; children?: SrcNode[] };
const nodeIds = (nodes: SrcNode[]): string[] => nodes.flatMap(n => [n.id, ...nodeIds(n.children ?? [])]);

const ALL = [...CONSTRUCTION, ...CRM, ...FSM];

describe('Construction, CRM and FSM + ITM pages', () => {
  it('uses the nine Construction groups from the corporate profile', () => {
    expect(CONSTRUCTION.map(d => d.slug)).toEqual(['portfolio', 'estimating', 'projects', 'contracts', 'subcontractors', 'claims', 'procurement', 'budget-cost', 'financial-closeout']);
  });

  it('uses the seven CRM groups and the nine FSM + ITM groups', () => {
    expect(CRM.map(d => d.slug)).toEqual(['management', 'leads', 'opportunities', 'activities', 'accounts', 'sales-management', 'administration']);
    expect(FSM.map(d => d.slug)).toEqual(['operations', 'sites', 'agreements', 'work-orders', 'inspection', 'deficiencies', 'billing', 'quality', 'administration']);
  });

  it('keeps the light index in step with the page content', () => {
    expect(SPECIALIST_INDEX.map(d => `${d.product}/${d.slug}:${d.sections.map(s => s.id).join(',')}:${d.heroShots.join(',')}`)).toEqual(
      ALL.map(d => `${d.product}/${d.slug}:${d.sections.map(s => s.id).join(',')}:${d.heroShots.join(',')}`),
    );
  });

  it('marks a capability "shown in a real screen" only on a page that shows a real screen', () => {
    for (const d of ALL) {
      const shown = d.sections.some(s => 'items' in s && (s.items as { status?: string }[]).some(i => i.status === 'demonstrated'));
      if (shown) expect(d.heroShots.length, `${d.product}/${d.slug}`).toBeGreaterThan(0);
      if (!d.heroShots.length) expect(d.illustrative, `${d.product}/${d.slug}`).toBe(true);
      for (const id of d.heroShots) expect(screenById(id), id).toBeDefined();
    }
  });

  it('never shows the withdrawn CRM demo screens with the old module logos', () => {
    expect(Object.keys(ALL_SHOTS).filter(id => id.startsWith('crm-'))).toEqual([]);
    expect(existsSync('src/assets/crm')).toBe(false);
    // CRM pages may only use the current DIGIT CRM captures (owner upload 2026-11-05).
    for (const d of CRM) for (const id of d.heroShots) expect(id.startsWith('crm2-'), `${d.slug}: ${id}`).toBe(true);
    expect([...CRM_JOURNEY, ...CRM_WORKBENCH].some(s => 'shot' in s && s.shot)).toBe(false);
    expect(productByKey('crm')!.shot).toBeUndefined();
  });

  it('shows real Construction and CRM screens on every area that has a matching capture', () => {
    const withScreens = (list: typeof ALL) => list.filter(d => d.heroShots.length > 0).map(d => d.slug);
    expect(withScreens(CONSTRUCTION)).toEqual(['portfolio', 'estimating', 'projects', 'contracts', 'subcontractors', 'claims', 'procurement', 'budget-cost', 'financial-closeout']);
    expect(withScreens(CRM)).toEqual(['management', 'leads', 'opportunities', 'activities', 'accounts', 'sales-management']);
    expect(CRM.find(d => d.slug === 'administration')!.illustrative).toBe(true);
    for (const d of CONSTRUCTION) for (const id of d.heroShots) expect(id.startsWith('con-'), `${d.slug}: ${id}`).toBe(true);
  });

  it('lets all seven CRM area pages pass the admin publish check from their source sections', () => {
    for (const d of CRM) {
      const side = { title: '', description: '', headline: '', lede: '', blocks: d.sections.map(s => sourceBlock(s.id)) };
      const doc = cmsContentSchema.parse({ ar: side, en: side, evidence: 'approved', department: { product: 'crm', id: d.slug } });
      expect(departmentPublishIssues(doc), d.slug).toEqual([]);
    }
  });

  it('links the CRM module page cards to existing CRM area pages, covering every area except administration', () => {
    const links = SOURCE_AREA_LINKS['modules-crm']!;
    const ids = new Set(nodeIds(crmModulePage.nodes as SrcNode[]));
    for (const [nodeId, target] of Object.entries(links)) {
      expect(ids.has(nodeId), nodeId).toBe(true);
      expect(target.product).toBe('crm');
      expect(departmentById('crm', target.id), target.id).toBeDefined();
    }
    expect([...new Set(Object.values(links).map(l => l.id))].sort()).toEqual(['accounts', 'activities', 'leads', 'management', 'opportunities', 'sales-management']);
  });

  it('keeps the five money stages and the four cost measures separate', () => {
    expect(CONSTRUCTION_MONEY_CHAIN.map(m => m.id)).toEqual(['measured', 'claimed', 'certified', 'invoiced', 'collected']);
    expect(CONSTRUCTION_COST_MEASURES.map(m => m.id)).toEqual(['budget', 'actual', 'commitments', 'forecast']);
  });

  it('closes a deficiency only after a retest in the six-stage inspection loop', () => {
    expect(FSM_LOOP.map(s => s.id)).toEqual(['inspection', 'deficiency', 'quote', 'repair', 'retest', 'closure']);
    const deficiencies = FSM.find(d => d.slug === 'deficiencies')!;
    const flow = deficiencies.sections.find(s => s.kind === 'flow');
    expect(flow && flow.kind === 'flow' && flow.note?.en).toMatch(/retest fails, the deficiency returns to open/);
  });

  it('lists the twelve POS retail segments from the profile', () => {
    expect(POS_INDUSTRIES.map(i => i.id)).toEqual(['chocolate', 'clothing', 'pharmacy', 'flowers', 'electrical', 'cafe', 'toys', 'optics', 'restaurant', 'mobiles', 'perfumes', 'furniture']);
  });

  it('never promises prescriptions, IMEI or kitchen displays as included', () => {
    const byId = (id: string) => POS_INDUSTRIES.find(i => i.id === id)!;
    for (const id of ['pharmacy', 'mobiles', 'restaurant']) {
      expect(byId(id).considerations.some(c => /not included automatically/.test(c.en)), id).toBe(true);
      expect(byId(id).capabilities.some(c => /prescription|IMEI|kitchen/i.test(c.en)), id).toBe(false);
    }
  });
});
