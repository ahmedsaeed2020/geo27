// Registry of the DIGIT Construction, CRM and FSM + ITM department pages. The light index (index-data.ts) feeds
// menus, CMS validation, the admin editor and SEO; full page copy loads per product only on the page itself.
import type { L, Signature, SpecialistDepartment, SpecialistProduct, SpecialistSectionId } from './types';
import { SPECIALIST_INDEX } from './index-data';

export type SpecialistIndexEntry = {
  product: SpecialistProduct;
  slug: string;
  label: L;
  summary: L;
  headline: L;
  seoDescription: L;
  profilePages: number[];
  photo: string;
  heroShots: string[];
  illustrative: boolean;
  signature: Signature;
  sections: { id: SpecialistSectionId; title: L }[];
};

export const SPECIALIST_PRODUCTS: SpecialistProduct[] = ['construction', 'crm', 'fsm'];
export const isSpecialistProduct = (p: string): p is SpecialistProduct => (SPECIALIST_PRODUCTS as string[]).includes(p);

/** Product name used in SEO titles, and the base of its registered department routes. */
export const SPECIALIST_META: Record<SpecialistProduct, { name: string; base: string; hub: string }> = {
  construction: { name: 'DIGIT Construction', base: '/construction', hub: '/modules/contracting' },
  crm: { name: 'DIGIT CRM', base: '/crm', hub: '/modules/crm' },
  fsm: { name: 'DIGIT FSM + ITM', base: '/fsm', hub: '/modules/fsm-itm' },
};

export const specialistIndexOf = (product: SpecialistProduct): SpecialistIndexEntry[] => SPECIALIST_INDEX.filter(d => d.product === product);

export function specialistBySlug(product: string, slug: string): SpecialistIndexEntry | undefined {
  return isSpecialistProduct(product) ? SPECIALIST_INDEX.find(d => d.product === product && d.slug === slug) : undefined;
}

export const specialistPath = (d: { product: SpecialistProduct; slug: string }) => `${SPECIALIST_META[d.product].base}/${d.slug}`;

const loaders: Record<SpecialistProduct, () => Promise<SpecialistDepartment[]>> = {
  construction: () => import('./construction').then(m => m.CONSTRUCTION),
  crm: () => import('./crm').then(m => m.CRM),
  fsm: () => import('./fsm').then(m => m.FSM),
};
const cache = new Map<SpecialistProduct, SpecialistDepartment[]>();

/** Full copy of one department page (route loaders: SSR-safe; the admin preview loads it on demand). */
export async function loadSpecialist(product: SpecialistProduct, slug: string): Promise<SpecialistDepartment | undefined> {
  let list = cache.get(product);
  if (!list) {
    list = await loaders[product]();
    cache.set(product, list);
  }
  return list.find(d => d.slug === slug);
}

export const cachedSpecialist = (product: SpecialistProduct, slug: string) => cache.get(product)?.find(d => d.slug === slug);
