import { z } from 'zod';

const text = z.string().trim().max(200).default('');
export const integrationSettingsSchema = z.object({
  analytics: z.object({ measurementId: text.refine(v => !v || /^G-[A-Z0-9]+$/.test(v), 'Invalid measurement identifier'), propertyId: text.refine(v => !v || /^\d+$/.test(v), 'Invalid property identifier') }).default({}),
  searchConsole: z.object({ siteUrl: text.refine(v => !v || /^https:\/\/[^\s]+\/$/.test(v) || /^sc-domain:[a-z0-9.-]+$/i.test(v), 'Invalid site identifier') }).default({}),
  sheets: z.object({ spreadsheetUrl: text.refine(v => !v || /^https:\/\/docs\.google\.com\/spreadsheets\/d\/[a-zA-Z0-9_-]+/.test(v), 'Invalid spreadsheet address'), tabName: text }).default({}),
  n8n: z.object({ workflowName: text, webhookPath: text.refine(v => !v || /^\/webhook\/[a-zA-Z0-9/_-]+$/.test(v), 'Invalid webhook path') }).default({}),
});
export type IntegrationSettings = z.infer<typeof integrationSettingsSchema>;
export const DEFAULT_INTEGRATIONS = integrationSettingsSchema.parse({});
export const SOURCES = ['facebook', 'google', 'linkedin', 'x'] as const;
export const SOURCE_LABELS: Record<string, string> = { facebook: 'Facebook / Instagram', google: 'Google', linkedin: 'LinkedIn', x: 'X / Twitter', direct: 'مباشر / غير معروف' };
const ATTRIBUTION_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'utm_id', 'gclid', 'gbraid', 'wbraid', 'fbclid', 'li_fat_id', 'twclid'] as const;

export function attributionParams(search: string): Record<string, string> {
  const params = new URLSearchParams(search);
  return Object.fromEntries(ATTRIBUTION_KEYS.flatMap(key => {
    const value = params.get(key)?.trim().slice(0, 300);
    return value ? [[key, value]] : [];
  }));
}

export function leadAttribution(utm: unknown, referrer?: string | null) {
  const values = utm && typeof utm === 'object' ? utm as Record<string, unknown> : {};
  const str = (key: string) => typeof values[key] === 'string' ? String(values[key]) : '';
  const raw = str('utm_source').toLowerCase();
  let source = raw;
  if (/^(fb|facebook|ig|instagram|meta)$/.test(raw)) source = 'facebook';
  if (/^(twitter|x|t\.co)$/.test(raw)) source = 'x';
  if (!source) {
    if (str('gclid') || str('gbraid') || str('wbraid')) source = 'google';
    else if (str('fbclid')) source = 'facebook';
    else if (str('li_fat_id')) source = 'linkedin';
    else if (str('twclid')) source = 'x';
    else {
      try {
        const host = new URL(referrer || '').hostname.toLowerCase();
        source = /(^|\.)(facebook|instagram)\.com$/.test(host) ? 'facebook'
          : /(^|\.)linkedin\.com$/.test(host) ? 'linkedin'
          : /(^|\.)(twitter|x)\.com$/.test(host) || host === 't.co' ? 'x'
          : /(^|\.)google\.[a-z.]+$/.test(host) ? 'google' : host;
      } catch { source = ''; }
    }
  }
  return { source: source || 'direct', campaign: str('utm_campaign'), medium: str('utm_medium') };
}

export function campaignUrl(base: string, source: string, medium: string, campaign: string, content = '', term = '') {
  const url = new URL(base);
  if (!['https:', 'http:'].includes(url.protocol)) throw new Error('Invalid campaign address');
  for (const [key, value] of Object.entries({ utm_source: source, utm_medium: medium, utm_campaign: campaign, utm_content: content, utm_term: term })) {
    if (value.trim()) url.searchParams.set(key, value.trim());
    else url.searchParams.delete(key);
  }
  return url.href;
}