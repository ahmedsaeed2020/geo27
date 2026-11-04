import { notFound } from '@tanstack/react-router';
import type { QueryClient } from '@tanstack/react-query';
import { departmentById, type ProductKey } from '@/content/catalog';
import { loadPublished } from './cms-query';
import { withSeo } from './seo';
import type { PublishedRecord } from './cms-schema';

export type DepartmentLoaderData = { rows: PublishedRecord[]; path: string };

/**
 * Registered CMS department routes (/hr/<id>, /construction/<id>) exist only once their page is published, or for a
 * reviewer holding a preview link. Unknown ids and unpublished drafts are a plain 404 that is never indexed.
 */
export async function loadDepartment(queryClient: QueryClient, location: { search: unknown }, product: ProductKey, id: string): Promise<DepartmentLoaderData> {
  const department = departmentById(product, id);
  if (!department || department.source !== 'cms') throw notFound();
  const rows = await loadPublished(queryClient, location);
  const record = rows.find(r => r.path === department.path);
  if (!record?.published.department) throw notFound();
  return { rows, path: department.path };
}

const UNAVAILABLE = { ar: 'صفحة غير متاحة — Digit', en: 'Page unavailable — Digit' };

export function departmentHead(loaderData: DepartmentLoaderData | undefined, english: boolean) {
  if (loaderData) return withSeo(english ? `/en${loaderData.path}` : loaderData.path, {}, loaderData.rows);
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
