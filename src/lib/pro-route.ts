import { notFound } from '@tanstack/react-router';
import type { QueryClient } from '@tanstack/react-query';
import { areaSlug, proAreaBySlug, type ProPageConfig } from '@/content/pro/pro-pages';
import { loadPublished } from './cms-query';
import { withSeo } from './seo';
import type { PublishedRecord } from './cms-schema';

export type ProAreaLoaderData = { rows: PublishedRecord[]; key: ProPageConfig['key'] };

/** The four cross-department DIGIT Pro pages; any other /pro/<slug> is a plain, unindexed 404. */
export async function loadProArea(queryClient: QueryClient, location: { search: unknown }, slug: string): Promise<ProAreaLoaderData> {
  const config = proAreaBySlug(slug);
  if (!config) throw notFound();
  return { rows: await loadPublished(queryClient, location), key: config.key };
}

const UNAVAILABLE = { ar: 'صفحة غير متاحة — Digit', en: 'Page unavailable — Digit' };

export function proAreaHead(loaderData: ProAreaLoaderData | undefined, slug: string, english: boolean) {
  const config = loaderData ? proAreaBySlug(slug) : undefined;
  if (!loaderData || !config) {
    const title = english ? UNAVAILABLE.en : UNAVAILABLE.ar;
    return {
      meta: [
        { title },
        { name: 'description', content: title },
        { property: 'og:title', content: title },
        { property: 'og:description', content: title },
        { property: 'og:type', content: 'website' },
        { name: 'twitter:card', content: 'summary' },
        { name: 'robots', content: 'noindex' },
      ],
    };
  }
  const l = english ? 'en' : 'ar';
  const path = `${english ? '/en' : ''}/pro/${areaSlug(config)}`;
  return withSeo(path, { meta: [{ title: config.seoTitle[l] }, { name: 'description', content: config.seoDescription[l] }] }, loaderData.rows);
}
