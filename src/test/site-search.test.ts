import { describe, it, expect } from 'vitest';
import { resolveCatalog } from '@/content/catalog';
import { buildSearchIndex, normalize, searchEntries } from '@/lib/site-search';

const catalog = resolveCatalog(undefined, []);
const ar = buildSearchIndex(catalog, 'ar');
const en = buildSearchIndex(catalog, 'en');

describe('Site search', () => {
  it('treats Arabic spelling variants and diacritics as the same word', () => {
    expect(normalize('الفاتورة')).toBe(normalize('الفاتوره'));
    expect(normalize('إدارة')).toBe(normalize('ادارة'));
    expect(normalize('مُستَودَع')).toBe(normalize('مستودع'));
  });

  it('puts the product first when searching its name, in both languages', () => {
    expect(searchEntries(ar, 'DIGIT HR')[0]).toMatchObject({ group: 'products', path: '/modules/hr-payroll' });
    expect(searchEntries(en, 'construction')[0]).toMatchObject({ group: 'products' });
  });

  it('finds reports by Arabic or interface name and opens the directory on their department', () => {
    const arabic = searchEntries(ar, 'ميزان المراجعه');
    expect(arabic.some(e => e.group === 'reports' && e.path === '/modules/reports' && e.hash === 'reports-accounting')).toBe(true);
    expect(searchEntries(en, 'trial balance').some(e => e.group === 'reports')).toBe(true);
  });

  it('sends an unpublished department to its card on the product page, never to an empty page', () => {
    const payroll = ar.find(e => e.id === 'dept-hr-payroll-rewards')!;
    expect(payroll.path).toBe('/modules/hr-payroll');
    expect(payroll.hash).toBe('dept-payroll-rewards');
  });

  it('requires every word of the query and returns nothing for an empty query', () => {
    expect(searchEntries(en, '')).toEqual([]);
    expect(searchEntries(en, 'inventory zzzz')).toEqual([]);
  });
});
