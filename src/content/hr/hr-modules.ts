// DIGIT HR module pages: one registry for routes, hero compositions and which real screen proves which section.
// Copy lives in ./modules/<slug>.json (both languages, IDs preserved); this file only decides presentation.
import { HR_INDEX, type HrIndexEntry, type L } from './hr-index';

export type { L } from './hr-index';
export type HrHeroVariant = 'constellation' | 'journey' | 'schedule' | 'pipeline' | 'service' | 'drill' | 'blueprint';
export type ShotFocus = { x: number; y: number; zoom: number };
export type HrShotRef = { id: string; focus?: ShotFocus };

export type HrModuleConfig = HrIndexEntry & {
  path: string;
  hero: HrHeroVariant;
  /** Real screens in the hero, lead first. Empty only for an illustrative module. */
  heroShots: string[];
  /** Section id → the real screens that show it. Sections without one use a semantic process graphic. */
  sectionShots: Record<string, HrShotRef[]>;
  /** No real screen exists yet: the hero uses a clearly labelled illustrative graphic instead. */
  illustrative?: boolean;
};

const VISUALS: Record<string, Pick<HrModuleConfig, 'hero' | 'heroShots' | 'sectionShots' | 'illustrative'>> = {
  'core-hr': {
    hero: 'constellation',
    heroShots: ['hr-s16'],
    sectionShots: {
      '01.1': [{ id: 'hr-s10' }],
      '01.3': [{ id: 'hr-s27', focus: { x: 2, y: 42, zoom: 2.4 } }],
      '01.4': [{ id: 'hr-s16' }, { id: 'hr-s18' }],
      '01.5': [{ id: 'hr-s17' }],
      '01.6': [{ id: 'hr-s09' }],
    },
  },
  'talent-hcm': {
    hero: 'journey',
    heroShots: ['hr-s08', 'hr-s06'],
    sectionShots: {
      '02.1': [{ id: 'hr-s06' }, { id: 'hr-s08' }],
      '02.5': [{ id: 'hr-s27', focus: { x: 2, y: 86, zoom: 2.4 } }],
    },
  },
  'workforce-management': {
    hero: 'schedule',
    heroShots: ['hr-s20', 'hr-s19'],
    sectionShots: {
      '03.1': [{ id: 'hr-s19' }, { id: 'hr-s13' }],
      '03.2': [{ id: 'hr-s18' }],
      '03.3': [{ id: 'hr-s20' }],
    },
  },
  'payroll-rewards': {
    hero: 'pipeline',
    heroShots: ['hr-s21'],
    sectionShots: { '04.1': [{ id: 'hr-s21' }] },
  },
  'employee-experience': { hero: 'service', heroShots: [], sectionShots: {}, illustrative: true },
  'people-intelligence': {
    hero: 'drill',
    heroShots: ['hr-s01', 'hr-s28'],
    sectionShots: {
      '06.1': [{ id: 'hr-s01' }],
      '06.2': [{ id: 'hr-s27' }],
      '06.3': [{ id: 'hr-s26' }, { id: 'hr-s28' }],
    },
  },
  'administration-governance': {
    hero: 'blueprint',
    heroShots: ['hr-s29'],
    sectionShots: { '07.1': [{ id: 'hr-s29' }] },
  },
};

export const HR_MODULES: HrModuleConfig[] = HR_INDEX.map(entry => {
  const visuals = VISUALS[entry.slug];
  if (!visuals) throw new Error(`Missing HR module visuals: ${entry.slug}`);
  return { ...entry, path: `/hr/${entry.slug}`, ...visuals };
});

export const hrModuleBySlug = (slug: string) => HR_MODULES.find(m => m.slug === slug);

// ---- Full page copy (loaded per page) ----
export type HrSection = {
  id: string;
  title: L;
  problem: L;
  how: L;
  outcome: L;
  decision: L;
  narrative: L;
  inputs: L[];
  outputs: L[];
  exceptions: L[];
  kpis: L[];
  roles: L[];
  features: string[];
  screens: string[];
  /** Mentions government-platform topics (WPS, GOSI…); rendered with the no-integration-claim note. */
  regulated?: boolean;
};
export type HrFeature = { text: L; sections: string[]; withheld?: string };
export type HrModuleContent = {
  slug: string;
  module: string;
  name: L;
  hero: { title: L; subtitle: L; center: L | null; nodes: L[]; flow: L[] };
  intro: { title: L; body: L };
  journey: { steps: L[]; roles: L[] };
  outcomes: { outputs: L[]; kpis: L[]; exceptions: L[] };
  sections: HrSection[];
  features: Record<string, HrFeature>;
  screens: Record<string, { title: L; role: string }>;
};

const loaders = import.meta.glob<HrModuleContent>('./modules/*.json', { import: 'default' });
const cache = new Map<string, HrModuleContent>();

export async function loadHrModule(slug: string): Promise<HrModuleContent | undefined> {
  const hit = cache.get(slug);
  if (hit) return hit;
  const load = loaders[`./modules/${slug}.json`];
  if (!load) return undefined;
  const content = await load();
  cache.set(slug, content);
  return content;
}

/** Synchronous read once loadHrModule has resolved (admin preview re-renders after loading). */
export const cachedHrModule = (slug: string) => cache.get(slug);
