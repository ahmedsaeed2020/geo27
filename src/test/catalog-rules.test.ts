import { describe, it, expect } from 'vitest';
import { PRODUCTS, productByKey, resolveCatalog, contextForPath, departmentAnchor } from '@/content/catalog';
import { leadCatalogContext } from '@/lib/leads-schema';
import { cmsContentSchema, departmentPublishIssues } from '@/lib/cms-schema';

const family = (key: string) => resolveCatalog(undefined, []).find(f => f.key === key)!;

const block = (title: string, type = 'capability') => ({ id: title, type, title, body: 'Body' });
const side = (blocks: ReturnType<typeof block>[]) => ({ title: 'SEO title', description: 'SEO description', headline: 'Headline', lede: 'Lede', blocks });
const departmentDraft = (blocks: ReturnType<typeof block>[], heroShot = '07-inv-01-in1') =>
  cmsContentSchema.parse({ ar: side(blocks), en: side(blocks), department: { product: 'construction', id: 'projects', heroShot } });

describe('Product menu and department rules', () => {
  it('lists the six products in menu order: Pro, HR, Construction, CRM, FSM + ITM, POS', () => {
    expect(PRODUCTS.map(p => p.key)).toEqual(['pro', 'hr', 'construction', 'crm', 'fsm', 'pos']);
  });

  it('gives Pro 5 departments, HR 7, Construction 9, CRM 7 and FSM + ITM 9', () => {
    expect(productByKey('pro')!.departments).toHaveLength(5);
    expect(productByKey('hr')!.departments).toHaveLength(7);
    expect(productByKey('construction')!.departments).toHaveLength(9);
    expect(productByKey('crm')!.departments).toHaveLength(7);
    expect(productByKey('fsm')!.departments).toHaveLength(9);
  });

  it('uses the seven HR module routes from the owner handoff', () => {
    expect(productByKey('hr')!.departments.map(d => d.path)).toEqual([
      '/hr/core-hr',
      '/hr/talent-hcm',
      '/hr/workforce-management',
      '/hr/payroll-rewards',
      '/hr/employee-experience',
      '/hr/people-intelligence',
      '/hr/administration-governance',
    ]);
  });

  it('points an unpublished HR department to its card on the HR overview', () => {
    const payroll = family('hr').departments.find(d => d.id === 'payroll-rewards')!;
    expect(payroll.live).toBe(false);
    expect(payroll.href).toBe('/modules/hr-payroll');
    expect(payroll.hash).toBe(departmentAnchor('payroll-rewards'));
  });

  it('links a department to its own page once that page is published', () => {
    const payroll = resolveCatalog(undefined, ['/hr/payroll-rewards']).find(f => f.key === 'hr')!.departments.find(d => d.id === 'payroll-rewards')!;
    expect(payroll.live).toBe(true);
    expect(payroll.href).toBe('/hr/payroll-rewards');
  });

  it('keeps existing Pro department pages live', () => {
    expect(family('pro').departments.map(d => d.href)).toEqual([
      '/modules/accounting',
      '/modules/sales',
      '/modules/purchasing',
      '/modules/inventory',
      '/modules/fixed-assets',
    ]);
  });

  it('drops a hidden department and applies the saved order', () => {
    const hr = resolveCatalog({ products: { hr: [{ id: 'payroll-rewards', enabled: true }, { id: 'core-hr', enabled: false }] } }, []).find(f => f.key === 'hr')!;
    expect(hr.departments[0]!.id).toBe('payroll-rewards');
    expect(hr.departments.some(d => d.id === 'core-hr')).toBe(false);
    expect(hr.departments).toHaveLength(6);
  });

  it('tags English and Arabic inventory pages with Pro / inventory', () => {
    expect(contextForPath('/en/modules/inventory')).toEqual({ product: 'pro', department: 'inventory' });
    expect(contextForPath('/modules/inventory')).toEqual({ product: 'pro', department: 'inventory' });
  });

  it('stores only a known product and one of its own departments on a lead', () => {
    expect(leadCatalogContext('hr', 'payroll-rewards')).toEqual({ product: 'hr', department: 'payroll-rewards' });
    expect(leadCatalogContext('hr', 'inventory')).toEqual({ product: 'hr', department: '' });
    expect(leadCatalogContext('erp', 'payroll')).toEqual({ product: '', department: '' });
  });

  it('blocks publishing an empty department page', () => {
    expect(departmentPublishIssues(departmentDraft([])).length).toBeGreaterThan(0);
  });

  it('blocks publishing a department page without a real screen', () => {
    const issues = departmentPublishIssues(departmentDraft([block('A'), block('B'), block('C')], ''));
    expect(issues).toContain('شاشة أو صورة حقيقية للواجهة');
  });

  it('does not count demo CTA sections toward the three content sections', () => {
    expect(departmentPublishIssues(departmentDraft([block('A'), block('B'), block('C', 'cta')])).length).toBeGreaterThan(0);
  });

  it('allows a complete department page with three sections and a real screen', () => {
    expect(departmentPublishIssues(departmentDraft([block('A'), block('B'), block('C')]))).toEqual([]);
  });
});
