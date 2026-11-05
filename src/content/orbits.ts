// Orbit navigation: the modules that circle each "sun" and where they lead. The home first fold lists the site's
// main systems; every product overview gets its own sun with its departments (from the catalog, so a department
// that is not published yet still points to its card on the hub, never to an empty page).
import type { GlyphName } from '@/components/icons/digit-glyphs';
import { departmentGlyph, FAMILY_VISUAL } from '@/components/nav/nav-visuals';
import type { L, ProductKey, ResolvedFamily } from './catalog';

export type OrbitItem = { id: string; glyph: GlyphName; label: L; path: string; hash?: string };

/** Home first fold, by ring (inner → outer). Labels reuse the menu wording; every path is an existing page. */
export const HOME_ORBIT: OrbitItem[][] = [
  [
    { id: 'pro', glyph: 'financial', label: { ar: 'المالية · DIGIT Pro', en: 'Finance · DIGIT Pro' }, path: '/pro' },
    { id: 'sales', glyph: 'sales', label: { ar: 'المبيعات', en: 'Sales' }, path: '/modules/sales' },
    { id: 'inventory', glyph: 'inventory', label: { ar: 'المخزون والمستودعات', en: 'Inventory & warehouses' }, path: '/modules/inventory' },
  ],
  [
    { id: 'accounting', glyph: 'accounts', label: { ar: 'المحاسبة والمالية', en: 'Accounting & finance' }, path: '/modules/accounting' },
    { id: 'purchasing', glyph: 'purchases', label: { ar: 'المشتريات', en: 'Purchasing' }, path: '/modules/purchasing' },
    { id: 'hr', glyph: 'team', label: { ar: 'الموارد البشرية · DIGIT HR', en: 'HR · DIGIT HR' }, path: '/modules/hr-payroll' },
    { id: 'crm', glyph: 'customers', label: { ar: 'علاقات العملاء · DIGIT CRM', en: 'CRM · DIGIT CRM' }, path: '/modules/crm' },
    { id: 'pos', glyph: 'pos', label: { ar: 'نقاط البيع · DIGIT POS', en: 'Point of sale · DIGIT POS' }, path: '/modules/pos' },
  ],
  [
    { id: 'einvoicing', glyph: 'einvoicing', label: { ar: 'الفوترة الإلكترونية', en: 'E-invoicing' }, path: '/modules/e-invoicing-zatca' },
    { id: 'reports', glyph: 'reports', label: { ar: 'التقارير', en: 'Reports' }, path: '/modules/reports' },
    { id: 'dashboards', glyph: 'dashboard', label: { ar: 'لوحات الإدارة', en: 'Management dashboards' }, path: '/pro/executive-dashboards' },
    { id: 'signature', glyph: 'signature', label: { ar: 'التوقيع الإلكتروني والقدرات', en: 'E-signature & capabilities' }, path: '/features' },
    { id: 'settings', glyph: 'settings', label: { ar: 'الإعدادات والصلاحيات', en: 'Settings & permissions' }, path: '/pro/settings-governance' },
    { id: 'construction', glyph: 'hardHat', label: { ar: 'المقاولات · DIGIT Construction', en: 'Construction · DIGIT Construction' }, path: '/modules/contracting' },
    { id: 'fsm', glyph: 'wrench', label: { ar: 'الخدمة الميدانية · DIGIT FSM', en: 'Field service · DIGIT FSM' }, path: '/modules/fsm-itm' },
  ],
];

export type OrbitModel = {
  key: string;
  /** Glyph and name shown on the sun. */
  core: { glyph: GlyphName; name: L };
  eyebrow: L;
  title: L;
  summary: L;
  /** e.g. «7 مجالات». */
  countLabel: L;
  rings: OrbitItem[][];
};

const COUNT_NOUN: Record<ProductKey, L> = {
  pro: { ar: 'أقسام ومساحات', en: 'departments and workspaces' },
  hr: { ar: 'مجالات', en: 'areas' },
  construction: { ar: 'أقسام', en: 'departments' },
  crm: { ar: 'مجالات', en: 'areas' },
  fsm: { ar: 'مجالات', en: 'areas' },
  pos: { ar: 'حلول حسب النشاط', en: 'solutions by business' },
};

const EXTRA_GLYPH: Record<string, GlyphName> = {
  reports: 'reports',
  dashboards: 'dashboard',
  cfo: 'financial',
  governance: 'settings',
  capabilities: 'signature',
};

/** Splits a flat list into an inner and an outer ring (inner holds about two fifths). */
function twoRings(items: OrbitItem[]): OrbitItem[][] {
  if (items.length <= 5) return [items];
  const inner = Math.max(3, Math.round(items.length * 0.4));
  return [items.slice(0, inner), items.slice(inner)];
}

/** The orbit for one product overview, from the resolved catalog (published order and live destinations). */
export function productOrbit(family: ResolvedFamily): OrbitModel {
  const departments: OrbitItem[] = family.departments.map(d => ({
    id: d.id,
    glyph: departmentGlyph(family.key, d.id),
    label: d.label,
    path: d.href,
    ...(d.hash ? { hash: d.hash } : {}),
  }));
  const solutions: OrbitItem[] = family.solutions.map(s => ({ id: s.id, glyph: departmentGlyph(family.key, s.id), label: s.label, path: s.path }));
  // DIGIT Pro: the five departments on the inner ring, the cross-department workspaces on the outer one.
  const extras: OrbitItem[] = family.key === 'pro'
    ? family.extras.filter(e => !e.hash).map(e => ({ id: e.id, glyph: EXTRA_GLYPH[e.id] ?? 'dashboard', label: e.label, path: e.path }))
    : [];
  const rings = family.key === 'pro' ? [departments, extras].filter(r => r.length) : twoRings([...departments, ...solutions]);
  const count = rings.reduce((n, r) => n + r.length, 0);
  return {
    key: family.key,
    core: { glyph: FAMILY_VISUAL[family.key].glyph, name: family.name },
    eyebrow: { ar: `نظرة عامة · ${family.name.ar}`, en: `Overview · ${family.name.en}` },
    title: family.area,
    summary: family.summary,
    countLabel: { ar: `${count} ${COUNT_NOUN[family.key].ar}`, en: `${count} ${COUNT_NOUN[family.key].en}` },
    rings,
  };
}

/** The all-systems orbit (/modules): the six product families plus e-invoicing and the report center. */
export function systemsOrbit(families: ResolvedFamily[]): OrbitModel {
  const products: OrbitItem[] = families.map(f => ({ id: f.key, glyph: FAMILY_VISUAL[f.key].glyph, label: { ar: `${f.area.ar} · ${f.name.ar}`, en: `${f.area.en} · ${f.name.en}` }, path: f.overview }));
  const more: OrbitItem[] = [
    { id: 'einvoicing', glyph: 'einvoicing', label: { ar: 'الفوترة الإلكترونية', en: 'E-invoicing' }, path: '/modules/e-invoicing-zatca' },
    { id: 'reports', glyph: 'reports', label: { ar: 'مركز التقارير', en: 'Report center' }, path: '/modules/reports' },
    { id: 'blueprint', glyph: 'target', label: { ar: 'صمّم منظومتك', en: 'Design your system' }, path: '/blueprint' },
  ];
  return {
    key: 'systems',
    core: { glyph: 'digitMark', name: { ar: 'Digit', en: 'Digit' } },
    eyebrow: { ar: 'كل الأنظمة · Digit', en: 'All systems · Digit' },
    title: { ar: 'منظومة واحدة لكل إدارات منشأتك', en: 'One system for every department of your business' },
    summary: {
      ar: 'المالية والموارد البشرية والمقاولات وعلاقات العملاء والخدمة الميدانية ونقاط البيع على بيانات واحدة، مرتبطة بمحاسبتك.',
      en: 'Finance, HR, construction, CRM, field service and point of sale on one set of data, connected to your accounting.',
    },
    countLabel: { ar: `${products.length} أنظمة رئيسية`, en: `${products.length} core systems` },
    rings: [products.slice(0, 3), [...products.slice(3), ...more]],
  };
}

/** Product overview pages (by imported page key) that open with their product's orbit. */
export const ORBIT_PAGES: Record<string, ProductKey | 'systems'> = {
  'modules-hr-payroll': 'hr',
  'modules-contracting': 'construction',
  'modules-crm': 'crm',
  'modules-pos': 'pos',
  modules: 'systems',
};
