import { z } from 'zod';

/** Site-wide editable settings. Each key has its own draft/published snapshot in cms_site_config. */
export const SITE_CONFIG_KEYS = ['branding', 'forms', 'home', 'pro', 'security', 'catalog'] as const;
export type SiteConfigKey = (typeof SITE_CONFIG_KEYS)[number];
export const PUBLIC_CONFIG_KEYS = ['branding', 'forms', 'home', 'pro', 'catalog'] as const;

export const CMS_MEDIA_PREFIX = '/api/public/cms-media/';
const mediaRef = z
  .string()
  .max(300)
  .refine(v => v === '' || /^\/api\/public\/cms-media\/[a-f0-9-]+\.(png|jpg|webp)$/.test(v), 'Use an approved library image');
const hex = z.string().regex(/^#[0-9a-f]{6}$/i, 'Use a 6-digit colour such as #1f8a5b');

/** WCAG relative-luminance contrast ratio between two #rrggbb colours. */
export function contrastRatio(a: string, b: string): number {
  const lum = (h: string) => {
    const n = h.replace('#', '');
    const ch = [0, 2, 4].map(i => parseInt(n.slice(i, i + 2), 16) / 255).map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * (ch[0] ?? 0) + 0.7152 * (ch[1] ?? 0) + 0.0722 * (ch[2] ?? 0);
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}
/** Buttons use white text on the primary colour, so the accent must keep AA contrast for normal text. */
export const MIN_ACCENT_CONTRAST = 4.5;

export const brandingSchema = z
  .object({
    logoUrl: mediaRef.default(''),
    logoOnDarkUrl: mediaRef.default(''),
    logoAltAr: z.string().trim().max(120).default('Digit'),
    logoAltEn: z.string().trim().max(120).default('Digit'),
    faviconUrl: mediaRef.default(''),
    primary: z.union([hex, z.literal('')]).default(''),
  })
  .refine(v => !v.primary || contrastRatio(v.primary, '#ffffff') >= MIN_ACCENT_CONTRAST, {
    message: 'The accent colour must keep 4.5:1 contrast with white button text',
    path: ['primary'],
  });
export type BrandingConfig = z.infer<typeof brandingSchema>;

const text = (max: number) => z.object({ ar: z.string().trim().max(max).default(''), en: z.string().trim().max(max).default('') });
export const formsSchema = z.object({
  showInterest: z.boolean().default(true),
  showRequestType: z.boolean().default(true),
  showJobRole: z.boolean().default(true),
  showMessage: z.boolean().default(true),
  requireJobRole: z.boolean().default(false),
  requireMessage: z.boolean().default(false),
  heading: text(160).default({ ar: '', en: '' }),
  submit: text(60).default({ ar: '', en: '' }),
  success: text(300).default({ ar: '', en: '' }),
  interestOptions: z
    .array(z.object({ ar: z.string().trim().min(1).max(120), en: z.string().trim().min(1).max(120) }))
    .max(30)
    .default([]),
});
export type FormsConfig = z.infer<typeof formsSchema>;

export const sectionLayoutSchema = z.object({
  sections: z.array(z.object({ id: z.string().max(60), enabled: z.boolean() })).max(40).default([]),
  texts: z.record(z.string().max(80), text(1200)).default({}),
});
export type SectionLayoutConfig = z.infer<typeof sectionLayoutSchema>;

export const securitySchema = z.object({ requireMfaForPublish: z.boolean().default(false) });
export type SecurityConfig = z.infer<typeof securitySchema>;

/**
 * Menu order and visibility of departments (and POS solutions) per product family. A registered CMS department
 * still needs a published page before it can appear, whatever this list says.
 */
const orderList = z.array(z.object({ id: z.string().max(60), enabled: z.boolean() })).max(40).default([]);
export const catalogSchema = z.object({
  products: z.object({ pro: orderList, hr: orderList, construction: orderList, crm: orderList, fsm: orderList, pos: orderList }).partial().default({}),
});
export type CatalogConfig = z.infer<typeof catalogSchema>;

export const CONFIG_SCHEMAS = {
  branding: brandingSchema,
  forms: formsSchema,
  home: sectionLayoutSchema,
  pro: sectionLayoutSchema,
  security: securitySchema,
  catalog: catalogSchema,
} as const;

export type SiteConfig = {
  branding: BrandingConfig;
  forms: FormsConfig;
  home: SectionLayoutConfig;
  pro: SectionLayoutConfig;
  catalog: CatalogConfig;
};

export function parseConfig<K extends SiteConfigKey>(key: K, value: unknown): z.infer<(typeof CONFIG_SCHEMAS)[K]> {
  const schema = CONFIG_SCHEMAS[key] as z.ZodTypeAny;
  const parsed = schema.safeParse(value ?? {});
  return (parsed.success ? parsed.data : schema.parse({})) as z.infer<(typeof CONFIG_SCHEMAS)[K]>;
}

export const DEFAULT_SITE_CONFIG: SiteConfig = {
  branding: parseConfig('branding', {}),
  forms: parseConfig('forms', {}),
  home: parseConfig('home', {}),
  pro: parseConfig('pro', {}),
  catalog: parseConfig('catalog', {}),
};

/** Applies a stored order/visibility list onto the source section list; unknown ids are dropped and new source sections are placed after the section that precedes them in the source order. */
export function orderSections<T extends string>(source: readonly T[], layout: SectionLayoutConfig): { id: T; enabled: boolean }[] {
  const known = new Set<string>(source);
  const seen = new Set<string>();
  const out: { id: T; enabled: boolean }[] = [];
  for (const s of layout.sections) {
    if (!known.has(s.id) || seen.has(s.id)) continue;
    seen.add(s.id);
    out.push({ id: s.id as T, enabled: s.enabled });
  }
  // A source section the stored layout doesn't know yet goes right after the nearest section that precedes it in the
  // source order, so a newly added section appears where it was designed instead of after the closing call to action.
  source.forEach((id, i) => {
    if (seen.has(id)) return;
    let at = 0;
    for (let j = i - 1; j >= 0; j--) {
      const k = out.findIndex(o => o.id === source[j]);
      if (k >= 0) {
        at = k + 1;
        break;
      }
    }
    out.splice(at, 0, { id, enabled: true });
    seen.add(id);
  });
  return out;
}
