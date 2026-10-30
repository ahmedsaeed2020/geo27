import { queryOptions, type QueryClient } from '@tanstack/react-query';
import { getPreviewRecord, getPublishedSite, type PreviewResult, type PublishedSite } from './cms.functions';
import type { PublishedRecord } from './cms-schema';
import { DEFAULT_SITE_CONFIG } from './site-config-schema';

/** One cached published-content read shared by the root and page loaders (deduplicated in flight, fresh for a minute). */
export const publishedSiteQuery = queryOptions({
  queryKey: ['cms', 'published'] as const,
  queryFn: () => getPublishedSite(),
  staleTime: 60_000,
});

export const previewQuery = (token: string) =>
  queryOptions({
    queryKey: ['cms', 'preview', token] as const,
    queryFn: () => getPreviewRecord({ data: { token } }),
    staleTime: 15_000,
  });

export function previewTokenFrom(search: unknown): string | undefined {
  const value = (search as Record<string, unknown> | undefined)?.['preview'];
  return typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value) ? value : undefined;
}

export type LoadedSite = PublishedSite & { preview: PreviewResult | null };

/** Source content stays the fallback: a content-service outage renders the original pages instead of failing them. */
export async function loadSite(queryClient: QueryClient, search: unknown): Promise<LoadedSite> {
  const token = previewTokenFrom(search);
  let site: PublishedSite;
  try {
    site = await queryClient.fetchQuery(publishedSiteQuery);
  } catch {
    site = { records: [], config: DEFAULT_SITE_CONFIG };
  }
  if (!token) return { ...site, preview: null };
  let preview: PreviewResult;
  try {
    preview = await queryClient.fetchQuery(previewQuery(token));
  } catch {
    preview = { status: 'invalid' };
  }
  if (preview.status !== 'ok') return { ...site, preview };
  return { ...site, preview, records: [...site.records.filter(r => r.path !== preview.record.path), preview.record] };
}

export async function loadPublished(queryClient: QueryClient, location: { search: unknown }): Promise<PublishedRecord[]> {
  return (await loadSite(queryClient, location.search)).records;
}

export async function refreshPublishedSite(queryClient: QueryClient) {
  await queryClient.invalidateQueries({ queryKey: ['cms'] });
}
