import { z } from 'zod';
import { productByKey } from '@/content/catalog';
export const LEAD_RECIPIENT = 'a.saeed@trilogy.com.sa';
export const leadSchema = z.object({
  name: z.string().trim().min(2).max(100), company: z.string().trim().min(2).max(160),
  email: z.string().trim().email().max(255).or(z.literal('')),
  phone: z.string().trim().max(30).refine(v => !v || /^\+?[\d ()-]{8,30}$/.test(v)),
  interest: z.string().trim().max(180), requestType: z.enum(['demo','consultation','scope']),
  jobRole: z.string().trim().max(120), message: z.string().trim().max(2000),
  locale: z.enum(['ar','en']), pagePath: z.string().startsWith('/').max(300),
  industry: z.string().max(120).default(''), referrer: z.string().max(1000).default(''),
  utm: z.record(z.string().max(300)).default({}), consent: z.literal(true),
  website: z.string().max(200).default(''),
  /** Product family and department of the page the request came from (catalog ids). */
  product: z.string().max(20).default(''),
  department: z.string().max(60).default(''),
}).refine(v => !!v.email || !!v.phone, { message: 'A contact channel is required', path: ['email'] });
export type LeadInput = z.infer<typeof leadSchema>;

/** Keeps only a known product and a department that belongs to it; anything else is stored as empty. */
export function leadCatalogContext(product: string, department: string): { product: string; department: string } {
  const family = productByKey(product);
  if (!family) return { product: '', department: '' };
  return { product: family.key, department: family.departments.some(d => d.id === department) ? department : '' };
}
