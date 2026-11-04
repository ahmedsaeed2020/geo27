// Site search: one in-memory index built from the content registries that already drive the menus and pages
// (catalog, Pro pages and workspaces, report directory, menu link groups). Nothing is fetched or invented here.
import {
  ABOUT_LINKS,
  EXPLORE_BY_PROBLEM,
  EXPLORE_BY_ROLE,
  EXPLORE_BY_ROLE_SPECIALIST,
  INDUSTRIES,
  MORE_SYSTEMS,
  PACKAGES,
  RESOURCE_LINKS,
  SERVICE_LINKS,
  type L,
  type MenuLink,
  type ResolvedFamily,
} from '@/content/catalog';
import { PRO_PAGES } from '@/content/pro/pro-pages';
import { REPORTS, REPORT_CATEGORIES } from '@/content/pro/reports';
import type { Locale } from '@/lib/i18n';

export type SearchGroup = 'products' | 'departments' | 'workspaces' | 'reports' | 'pages';

export type SearchEntry = {
  id: string;
  group: SearchGroup;
  title: string;
  /** Short context line: product name, department or menu summary. */
  hint?: string;
  path: string;
  hash?: string;
  /** Extra words that should find the entry but aren't shown. */
  keywords?: string;
};

export const SEARCH_GROUPS: { id: SearchGroup; label: L }[] = [
  { id: 'products', label: { ar: 'المنتجات', en: 'Products' } },
  { id: 'departments', label: { ar: 'الأقسام والحلول', en: 'Departments & solutions' } },
  { id: 'workspaces', label: { ar: 'مساحات عمل DIGIT Pro', en: 'DIGIT Pro workspaces' } },
  { id: 'reports', label: { ar: 'التقارير', en: 'Reports' } },
  { id: 'pages', label: { ar: 'صفحات الموقع', en: 'Site pages' } },
];

/**
 * Folds Arabic spelling variants (hamza forms, alef maqsura, taa marbuta, diacritics, tatweel) and Latin case so
 * "الفاتوره" finds "الفاتورة" and "Pos" finds "POS".
 */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

const linkEntries = (links: MenuLink[], locale: Locale, prefix: string, hint?: string): SearchEntry[] =>
  links.map((l, i) => {
    const entry: SearchEntry = { id: `${prefix}-${i}-${l.path}${l.hash ?? ''}`, group: 'pages', title: l.label[locale], path: l.path };
    const h = l.summary?.[locale] ?? hint;
    if (h) entry.hint = h;
    if (l.hash) entry.hash = l.hash;
    return entry;
  });

/** Builds the index for one language from the resolved catalog (unpublished departments point to their hub card). */
export function buildSearchIndex(catalog: ResolvedFamily[], locale: Locale): SearchEntry[] {
  const out: SearchEntry[] = [];
  for (const family of catalog) {
    out.push({ id: `product-${family.key}`, group: 'products', title: family.name[locale], hint: family.summary[locale], path: family.overview, keywords: family.area[locale] });
    for (const d of family.departments) {
      const entry: SearchEntry = { id: `dept-${family.key}-${d.id}`, group: 'departments', title: d.label[locale], hint: family.name[locale], path: d.href };
      if (d.hash) entry.hash = d.hash;
      if (d.summary) entry.keywords = d.summary[locale];
      out.push(entry);
    }
    for (const s of [...family.extras, ...family.solutions]) {
      const entry: SearchEntry = { id: `link-${family.key}-${s.id}`, group: 'departments', title: s.label[locale], hint: family.name[locale], path: s.path };
      if (s.hash) entry.hash = s.hash;
      if (s.summary) entry.keywords = s.summary[locale];
      out.push(entry);
    }
  }
  for (const page of PRO_PAGES) {
    if (page.kind === 'area') out.push({ id: `pro-${page.key}`, group: 'departments', title: page.label[locale], hint: 'DIGIT Pro', path: page.path, keywords: page.summary[locale] });
    for (const section of page.sections) {
      if (!/^[A-Z]{3}-[A-Z]{3,10}$/.test(section.id)) continue;
      out.push({ id: `ws-${section.id}`, group: 'workspaces', title: section.title[locale], hint: page.label[locale], path: page.path, hash: `pv-${section.id}`, keywords: section.id });
    }
  }
  for (const r of REPORTS) {
    const category = REPORT_CATEGORIES.find(c => c.id === r.category);
    out.push({
      id: `report-${r.key}`,
      group: 'reports',
      title: locale === 'ar' ? r.ar : r.key,
      hint: category?.label[locale] ?? '',
      path: '/modules/reports',
      hash: `reports-${r.category}`,
      keywords: locale === 'ar' ? r.key : r.ar,
    });
  }
  out.push(
    ...linkEntries(PACKAGES, locale, 'pkg'),
    ...linkEntries(INDUSTRIES, locale, 'ind', locale === 'ar' ? 'القطاعات' : 'Industries'),
    ...linkEntries(EXPLORE_BY_ROLE, locale, 'role', locale === 'ar' ? 'حسب الدور' : 'By role'),
    ...linkEntries(EXPLORE_BY_ROLE_SPECIALIST, locale, 'role2', locale === 'ar' ? 'حسب الدور' : 'By role'),
    ...linkEntries(EXPLORE_BY_PROBLEM, locale, 'problem', locale === 'ar' ? 'حسب المشكلة' : 'By problem'),
    ...linkEntries(SERVICE_LINKS, locale, 'svc', locale === 'ar' ? 'الخدمات' : 'Services'),
    ...linkEntries(RESOURCE_LINKS, locale, 'res', locale === 'ar' ? 'الموارد' : 'Resources'),
    ...linkEntries(ABOUT_LINKS, locale, 'about', locale === 'ar' ? 'عن Digit' : 'About Digit'),
    ...linkEntries(MORE_SYSTEMS, locale, 'more', locale === 'ar' ? 'الأنظمة' : 'Systems'),
  );
  // One entry per destination: menus repeat some links (e.g. a package in two groups).
  const seen = new Set<string>();
  return out.filter(e => {
    const key = `${e.group}|${e.path}#${e.hash ?? ''}|${e.title}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Ranks entries whose title, hint or keywords contain every query word; title matches rank first. */
export function searchEntries(entries: SearchEntry[], query: string, limit = 40): SearchEntry[] {
  const words = normalize(query).split(' ').filter(Boolean);
  if (!words.length) return [];
  const scored: { entry: SearchEntry; score: number }[] = [];
  for (const entry of entries) {
    const title = normalize(entry.title);
    const rest = normalize(`${entry.hint ?? ''} ${entry.keywords ?? ''}`);
    let score = 0;
    let all = true;
    for (const word of words) {
      if (title.startsWith(word)) score += 6;
      else if (title.split(' ').some(t => t.startsWith(word))) score += 4;
      else if (title.includes(word)) score += 3;
      else if (rest.includes(word)) score += 1;
      else { all = false; break; }
    }
    if (!all) continue;
    if (title === words.join(' ')) score += 10;
    if (entry.group === 'products') score += 2;
    if (entry.group === 'reports') score -= 1;
    scored.push({ entry, score });
  }
  return scored.sort((a, b) => b.score - a.score || a.entry.title.length - b.entry.title.length).slice(0, limit).map(s => s.entry);
}
