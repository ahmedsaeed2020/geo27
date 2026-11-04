import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { CONSTRUCTION } from '@/content/specialist/construction';
import { CRM } from '@/content/specialist/crm';
import { FSM } from '@/content/specialist/fsm';
import { SPECIALIST_INDEX } from '@/content/specialist/index-data';
import { CONSTRUCTION_MONEY_CHAIN, CONSTRUCTION_COST_MEASURES, CRM_JOURNEY, CRM_WORKBENCH, FSM_LOOP, POS_INDUSTRIES } from '@/content/specialist/stories';
import { ALL_SHOTS, screenById } from '@/content/screens';
import { productByKey } from '@/content/catalog';

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
    expect(CRM.every(d => d.heroShots.length === 0 && d.illustrative)).toBe(true);
    expect([...CRM_JOURNEY, ...CRM_WORKBENCH].some(s => 'shot' in s && s.shot)).toBe(false);
    expect(productByKey('crm')!.shot).toBeUndefined();
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
