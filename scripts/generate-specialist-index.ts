// Regenerates src/content/specialist/index-data.ts from the department content files.
// Run: bun scripts/generate-specialist-index.ts
import { writeFileSync } from 'node:fs';
import { CONSTRUCTION } from '../src/content/specialist/construction';
import { CRM } from '../src/content/specialist/crm';
import { FSM } from '../src/content/specialist/fsm';

const entries = [...CONSTRUCTION, ...CRM, ...FSM].map(d => ({
  product: d.product,
  slug: d.slug,
  label: d.label,
  summary: d.summary,
  headline: d.headline,
  seoDescription: d.seoDescription,
  profilePages: d.profilePages,
  photo: d.photo,
  heroShots: d.heroShots,
  illustrative: d.illustrative,
  signature: d.signature,
  sections: d.sections.map(s => ({ id: s.id, title: s.title })),
}));

const header = `// GENERATED from the department content files (construction.ts, crm.ts, fsm.ts) — light index for menus, CMS
// validation, the admin editor and SEO. Full copy loads per product on the page. specialist.test.ts fails if this
// index and the content files drift apart; regenerate with: bun scripts/generate-specialist-index.ts
import type { SpecialistIndexEntry } from './registry';

export const SPECIALIST_INDEX: SpecialistIndexEntry[] = `;

writeFileSync('src/content/specialist/index-data.ts', `${header}${JSON.stringify(entries, null, 1)};\n`);
console.log(`wrote ${entries.length} entries`);
