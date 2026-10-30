import { createFileRoute } from '@tanstack/react-router';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import { cmsContentSchema, type PublishedRecord } from '@/lib/cms-schema';
import { baselinePaths, buildSitemap } from '@/lib/sitemap';
import baseline from '@/content/sitemap-baseline.xml?raw';

/** Published CMS pages through the public read-only function; an outage still returns the source page list. */
async function publishedRecords(): Promise<PublishedRecord[]> {
  const url = process.env['SUPABASE_URL'];
  const key = process.env['SUPABASE_PUBLISHABLE_KEY'];
  if (!url || !key) return [];
  const client = createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        if (key.startsWith('sb_') && h.get('Authorization') === `Bearer ${key}`) h.delete('Authorization');
        h.set('apikey', key);
        return fetch(input, { ...init, headers: h });
      },
    },
  });
  const { data, error } = await client.rpc('cms_published');
  if (error) return [];
  return (data ?? []).flatMap(row => {
    const parsed = cmsContentSchema.safeParse(row.published);
    return parsed.success ? [{ path: row.path, kind: row.kind, published: parsed.data, published_at: row.published_at }] : [];
  });
}

export const Route = createFileRoute('/sitemap.xml')({
  server: {
    handlers: {
      GET: async () => {
        const xml = buildSitemap([...baselinePaths(baseline), '/resources', '/en/resources'], await publishedRecords());
        return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=900' } });
      },
    },
  },
});
