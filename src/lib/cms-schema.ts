import { z } from 'zod';
export const safePath = z.string().regex(/^\/(?:[a-z0-9][a-z0-9/-]*)?$/).max(240).refine(v => !/^\/(admin|auth|api|lovable|_)/.test(v));

/** Generic blocks plus the department content regions (roles, capabilities, product theater, documents, 360 profiles, reports, use cases, cross-department links). */
export const BLOCK_TYPES = ['story', 'workflow', 'faq', 'resource', 'cta', 'roles', 'capability', 'theater', 'document', 'profile', 'report', 'usecase', 'related'] as const;
export type BlockType = (typeof BLOCK_TYPES)[number];

export const blockItemSchema = z.object({
  title: z.string().max(200).default(''),
  body: z.string().max(2000).default(''),
  shotId: z.string().max(100).default(''),
  href: z.string().max(240).default(''),
});
/** Magnified region of a screenshot, in percent of its width/height. */
export const focusSchema = z.object({ x: z.number().min(0).max(100), y: z.number().min(0).max(100), zoom: z.number().min(1.5).max(4) });

export const blockSchema = z.object({
  id: z.string().max(80),
  type: z.enum(BLOCK_TYPES),
  title: z.string().max(200),
  body: z.string().max(6000),
  shotId: z.string().max(100).default(''),
  mediaUrl: z.string().max(1000).default(''),
  mediaAlt: z.string().max(300).default(''),
  href: z.string().max(240).default(''),
  enabled: z.boolean().default(true),
  eyebrow: z.string().max(120).default(''),
  items: z.array(blockItemSchema).max(24).default([]),
  shots: z.array(z.string().max(100)).max(12).default([]),
  focus: focusSchema.nullable().default(null),
});
export const localeSchema = z.object({
  title: z.string().max(200),
  description: z.string().max(500),
  blocks: z.array(blockSchema).max(60),
  sourceEdits: z.record(z.string().max(10000)).default({}),
  /** Department pages: on-page H1 and lede (the title/description above stay the SEO pair). */
  headline: z.string().max(200).default(''),
  lede: z.string().max(1000).default(''),
  /** Optional menu label override; the catalog label is used when empty. */
  navLabel: z.string().max(80).default(''),
});

export const DEPARTMENT_PRODUCTS = ['pro', 'hr', 'construction', 'pos'] as const;
export const departmentSchema = z.object({
  product: z.enum(DEPARTMENT_PRODUCTS),
  id: z.string().regex(/^[a-z0-9-]{2,60}$/),
  heroShot: z.string().max(100).default(''),
  heroMedia: z.string().max(1000).default(''),
  heroAlt: z.object({ ar: z.string().max(300).default(''), en: z.string().max(300).default('') }).default({ ar: '', en: '' }),
  related: z.array(z.string().max(60)).max(8).default([]),
});
export type DepartmentMeta = z.infer<typeof departmentSchema>;

export const cmsContentSchema = z.object({
  ar: localeSchema,
  en: localeSchema,
  indexable: z.boolean().default(true),
  evidence: z.enum(['approved', 'pending']).default('pending'),
  formEnabled: z.boolean().default(true),
  ogImage: z.string().max(1000).default(''),
  canonical: z.union([safePath, z.literal('')]).default(''),
  /** Present on department pages; selects the shared Department Detail template. */
  department: departmentSchema.nullable().default(null),
});
export type CmsContent = z.infer<typeof cmsContentSchema>;
export type CmsBlock = z.infer<typeof blockSchema>;
export type CmsBlockItem = z.infer<typeof blockItemSchema>;
export type PublishedRecord = { path: string; kind: string; published: CmsContent; published_at: string | null };
export const canPerform = (role: string, scope: string) => role === 'owner' || (role === 'editor' && scope === 'content') || (role === 'sales' && scope === 'leads');

/** Minimum content blocks (besides demo CTAs) a department page needs in each language before it may go live. */
export const DEPARTMENT_MIN_BLOCKS = 3;

/**
 * Reasons a department page is not ready to publish. Thin or empty department pages never go live just to
 * populate navigation: each language needs its own headline, lede, SEO pair and real content, plus a real screen.
 */
export function departmentPublishIssues(c: CmsContent): string[] {
  if (!c.department) return [];
  const issues: string[] = [];
  const names = { ar: 'العربية', en: 'English' } as const;
  for (const l of ['ar', 'en'] as const) {
    const x = c[l];
    if (!x.title.trim()) issues.push(`${names[l]}: عنوان SEO`);
    if (!x.description.trim()) issues.push(`${names[l]}: وصف SEO`);
    if (!x.headline.trim()) issues.push(`${names[l]}: عنوان الصفحة الرئيسي`);
    if (!x.lede.trim()) issues.push(`${names[l]}: الوصف التمهيدي`);
    const content = x.blocks.filter(b => b.enabled && b.type !== 'cta');
    if (content.length < DEPARTMENT_MIN_BLOCKS) issues.push(`${names[l]}: ${DEPARTMENT_MIN_BLOCKS} أقسام محتوى على الأقل (الموجود ${content.length})`);
    if (content.some(b => !b.title.trim())) issues.push(`${names[l]}: كل قسم ظاهر يحتاج عنوانًا`);
  }
  if (!c.department.heroShot && !c.department.heroMedia) issues.push('شاشة أو صورة حقيقية للواجهة');
  return issues;
}
