import type { PublishedRecord } from './cms-schema';

export const SITE_ORIGIN = 'https://digit-erp.com';
/** CMS kinds that become public pages; feature stories stay out until their evidence is approved and routed. */
const SITEMAP_KINDS = ['page', 'product', 'module', 'industry', 'resource', 'department'];

const escapeXml = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c] ?? c);
const bare = (p: string) => p.replace(/^\/en(?=\/|$)/, '') || '/';
const english = (p: string) => (p === '/' ? '/en' : `/en${p}`);

export function baselinePaths(xml: string): string[] {
  return [...xml.matchAll(/<loc>https:\/\/digit-erp\.com([^<]*)<\/loc>/g)].map(m => m[1] || '/');
}

/**
 * Source pages plus indexable CMS pages (both languages). A published "do not index" choice removes the page in both
 * languages, and pages that are not live (unpublished or scheduled) never appear.
 */
export function buildSitemap(sourcePaths: string[], records: PublishedRecord[]): string {
  const byPath = new Map(records.map(r => [r.path, r]));
  const paths = new Set(sourcePaths);
  for (const r of records) {
    if (!r.published.indexable || !SITEMAP_KINDS.includes(r.kind) || r.path.startsWith('/cms-')) continue;
    paths.add(r.path);
    if (r.published.en.title.trim()) paths.add(english(r.path));
  }
  const urls = [...paths]
    .filter(p => byPath.get(bare(p))?.published.indexable !== false)
    .sort((a, b) => (a === '/' ? -1 : b === '/' ? 1 : a.localeCompare(b)))
    .map(p => {
      const r = byPath.get(bare(p));
      // Only a page's own publish date is a real last-change signal; source pages without one omit <lastmod>.
      const lastmod = r?.published_at ? `<lastmod>${r.published_at.slice(0, 10)}</lastmod>` : '';
      return `  <url><loc>${SITE_ORIGIN}${escapeXml(p)}</loc>${lastmod}</url>`;
    });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
}
