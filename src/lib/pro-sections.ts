// How a DIGIT Pro V4 page renders its source sections under CMS control. The CMS `source` blocks of the page's
// document (ref = section id) order, hide and override the section heading, lede and eyebrow; sections the document
// does not place keep their source order at the end, so nothing silently disappears.
import type { ProPageConfig } from '@/content/pro/pro-pages';
import type { ProPageContent, ProSection } from '@/content/pro/types';
import type { CmsBlock, CmsContent } from './cms-schema';
import type { Locale } from './i18n';

export type ResolvedProSection = {
  section: ProSection;
  title: string;
  /** CMS override of the section's lede; empty keeps the source copy. */
  lede: string;
  eyebrow: string;
  /** CMS replacement for the section's lead screen (a real screen id), when set. */
  shotId: string;
};

export function resolveProSections(config: ProPageConfig, content: ProPageContent, cms: CmsContent | null | undefined, locale: Locale): ResolvedProSection[] {
  const byId = new Map(content.sections.map(s => [s.id, s]));
  const titleOf = (id: string) => config.sections.find(s => s.id === id)?.title[locale] ?? '';
  const blocks = (cms?.[locale].blocks ?? []).filter((b): b is CmsBlock => b.type === 'source' && byId.has(b.ref));
  const placed = new Set<string>();
  const out: ResolvedProSection[] = [];
  for (const b of blocks) {
    if (placed.has(b.ref)) continue;
    placed.add(b.ref);
    if (!b.enabled) continue;
    out.push({ section: byId.get(b.ref)!, title: b.title.trim() || titleOf(b.ref), lede: b.body.trim(), eyebrow: b.eyebrow.trim(), shotId: b.shotId });
  }
  for (const s of content.sections) if (!placed.has(s.id)) out.push({ section: s, title: titleOf(s.id), lede: '', eyebrow: '', shotId: '' });
  return out;
}

/** Source sections of a page as CMS blocks, in their current placement (used by the admin editor). */
export function withProSourceBlocks(blocks: CmsBlock[], config: ProPageConfig): CmsBlock[] {
  const known = new Set(config.sections.map(s => s.id));
  const placed = new Set(blocks.filter(b => b.type === 'source' && known.has(b.ref)).map(b => b.ref));
  const missing = config.sections.filter(s => !placed.has(s.id)).map(s => proSourceBlock(s.id));
  return [...blocks, ...missing];
}

export const proSourceBlock = (ref: string): CmsBlock => ({
  id: `src-${ref.toLowerCase()}`,
  type: 'source',
  ref,
  title: '',
  body: '',
  shotId: '',
  mediaUrl: '',
  mediaAlt: '',
  href: '',
  enabled: true,
  eyebrow: '',
  items: [],
  shots: [],
  focus: null,
});
