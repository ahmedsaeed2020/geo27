import { notFound } from '@tanstack/react-router';
import type { QueryClient } from '@tanstack/react-query';
import { departmentById, type ProductKey } from '@/content/catalog';
import { hrModuleBySlug, loadHrModule, type HrModuleContent } from '@/content/hr/hr-modules';
import { loadPublished } from './cms-query';
import { withSeo } from './seo';
import type { PublishedRecord } from './cms-schema';

export type DepartmentLoaderData = { rows: PublishedRecord[]; path: string; hr: HrModuleContent | null };

/**
 * Registered CMS department routes (/hr/<id>, /construction/<id>) exist only once their page is published, or for a
 * reviewer holding a preview link. Unknown ids and unpublished drafts are a plain 404 that is never indexed.
 * Source-backed HR modules also return their page copy, so SSR and hydration render the same content.
 */
export async function loadDepartment(queryClient: QueryClient, location: { search: unknown }, product: ProductKey, id: string): Promise<DepartmentLoaderData> {
  const department = departmentById(product, id);
  if (!department || department.source !== 'cms') throw notFound();
  const rows = await loadPublished(queryClient, location);
  const record = rows.find(r => r.path === department.path);
  if (!record?.published.department) throw notFound();
  const hr = product === 'hr' && hrModuleBySlug(id) ? ((await loadHrModule(id)) ?? null) : null;
  return { rows, path: department.path, hr };
}

const UNAVAILABLE = { ar: 'صفحة غير متاحة — Digit', en: 'Page unavailable — Digit' };

export function departmentHead(loaderData: DepartmentLoaderData | undefined, english: boolean) {
  if (loaderData) {
    // Source-backed pages fall back to their source title/description when the CMS fields are empty.
    const source = loaderData.path.startsWith('/hr/') ? hrModuleBySlug(loaderData.path.slice(4)) : undefined;
    const l = english ? 'en' : 'ar';
    const fallback = source ? { meta: [{ title: `${source.label[l]} | DIGIT HR` }, { name: 'description', content: source.seoDescription[l] }] } : {};
    return withSeo(english ? `/en${loaderData.path}` : loaderData.path, fallback, loaderData.rows);
  }
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
