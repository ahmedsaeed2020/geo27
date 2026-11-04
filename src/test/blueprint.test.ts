import { describe, it, expect } from 'vitest';
import sitemap from '@/content/sitemap-baseline.xml?raw';
import {
  FLOWS,
  NEEDS,
  SECTORS,
  blueprintSearch,
  blueprintTopic,
  parseBlueprint,
  startPoint,
  type NeedId,
} from '@/content/blueprint';
import { BP } from '@/components/blueprint/copy';
import { screenById } from '@/content/screens';
import { leadSchema } from '@/lib/leads-schema';
import { RESOURCE_LINKS } from '@/content/catalog';
import { HOME_SECTIONS } from '@/content/section-registry';

const sitemapPaths = new Set([...sitemap.matchAll(/<loc>https:\/\/digit-erp\.com([^<]*)<\/loc>/g)].map(m => m[1] || '/'));
const copyText = JSON.stringify({ BP, NEEDS, SECTORS, FLOWS });

describe('Design-your-system blueprint', () => {
  it('is a page in both languages, listed in the sitemap, the Resources menu and the home sections', () => {
    expect(sitemapPaths.has('/blueprint')).toBe(true);
    expect(sitemapPaths.has('/en/blueprint')).toBe(true);
    expect(RESOURCE_LINKS.map(l => l.path)).toContain('/blueprint');
    expect(HOME_SECTIONS.map(s => s.id)).toContain('blueprint');
  });

  it('links every area and sector to a page that exists on the site', () => {
    for (const need of NEEDS) expect(sitemapPaths.has(need.path), need.path).toBe(true);
    for (const sector of SECTORS) expect(sitemapPaths.has(sector.page), sector.page).toBe(true);
  });

  it('only shows registered real product screens', () => {
    for (const need of NEEDS.filter(n => n.shot)) expect(screenById(need.shot!), need.shot).toBeDefined();
  });

  it('shows no price, currency or trial/temporary wording', () => {
    expect(copyText).not.toMatch(/SAR|ريال|﷼|\$\s?\d|تجريبي|مؤقت|placeholder|trial/i);
  });

  it('suggests Starter only for a small single-branch company with invoicing, accounting or sales needs', () => {
    expect(startPoint({ employees: '1-20', branches: '1', needs: ['einvoice', 'close'] }).id).toBe('starter');
    expect(startPoint({ employees: '21-100', branches: '1', needs: ['einvoice', 'close'] }).id).toBe('pro');
    expect(startPoint({ employees: '1-20', branches: '1', needs: ['einvoice', 'inventory'] }).id).toBe('pro');
  });

  it('adds specialist applications to Pro, and moves to an enterprise scope at 500+ employees, 6+ branches or 3+ specialist apps', () => {
    expect(startPoint({ needs: ['close', 'hr'] }).id).toBe('pro-apps');
    expect(startPoint({ employees: '500+', needs: ['close'] }).id).toBe('enterprise');
    expect(startPoint({ branches: '6+', needs: ['close'] }).id).toBe('enterprise');
    expect(startPoint({ needs: ['hr', 'crm', 'projects'] }).id).toBe('enterprise');
  });

  it('keeps shared links readable and drops unknown values', () => {
    const bp = parseBlueprint({ s: 'retail', e: '21-100', b: 'nope', n: 'pos,inventory,hack,pos' });
    expect(bp).toEqual({ sector: 'retail', employees: '21-100', needs: ['pos', 'inventory'] satisfies NeedId[] });
    expect(blueprintSearch(bp)).toEqual({ s: 'retail', e: '21-100', n: 'pos,inventory' });
  });

  it('tags the demo request with a topic the request form accepts', () => {
    const topic = blueprintTopic({ sector: 'field-service', employees: '500+', branches: '6+', needs: ['field'] });
    expect(topic).toBe('BP-field-service-500p-6p');
    const lead = { name: 'Ahmed', company: 'Test Co', email: 'a@example.com', phone: '', interest: 'DIGIT', requestType: 'demo', jobRole: '', message: '', locale: 'ar', pagePath: '/blueprint', consent: true, topic };
    expect(leadSchema.safeParse(lead).success).toBe(true);
  });
});
