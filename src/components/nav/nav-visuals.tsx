// Menu imagery: every product family has its own DIGIT glyph and its own context photo (shown under the brand's green
// overlay when no real screen is being previewed), and every department or POS activity has a distinct DIGIT glyph, so
// no two entries in one menu share a symbol. Glyphs come from the DIGIT icon set (src/components/icons); photos are
// reused approved imagery; no product UI is drawn here.
import type { L, ProductKey } from '@/content/catalog';
import type { GlyphName } from '@/components/icons/digit-glyphs';
import { PHOTOS } from '@/content/specialist/photos';
import retailCheckout from '@/assets/frames/pos-retail-checkout.webp.asset.json';

export type FamilyVisual = { glyph: GlyphName; photo: { src: string; alt: L } };

const profile = (key: string) => ({ src: PHOTOS[key]?.src ?? '', alt: PHOTOS[key]?.alt ?? { ar: '', en: '' } });

export const FAMILY_VISUAL: Record<ProductKey, FamilyVisual> = {
  pro: { glyph: 'digitMark', photo: profile('corporate-model-table') },
  hr: { glyph: 'team', photo: profile('role-training') },
  construction: { glyph: 'hardHat', photo: profile('construction-aerial') },
  crm: { glyph: 'customers', photo: profile('crm-sales-call') },
  fsm: { glyph: 'wrench', photo: profile('fsm-rooftop-technician') },
  pos: { glyph: 'pos', photo: { src: retailCheckout.url, alt: { ar: 'كاشير يمسح منتجًا عند نقطة البيع في متجر سعودي', en: 'A cashier scanning a product at the till in a Saudi store' } } },
};

/** Keyed `${product}:${department or solution id}`. */
export const DEPARTMENT_GLYPH: Record<string, GlyphName> = {
  'pro:accounting': 'accounts',
  'pro:selling': 'sales',
  'pro:purchasing': 'purchases',
  'pro:inventory': 'inventory',
  'pro:fixed-assets': 'assets',
  'hr:core-hr': 'orgChart',
  'hr:talent-hcm': 'userPlus',
  'hr:workforce-management': 'calendar',
  'hr:payroll-rewards': 'payroll',
  'hr:employee-experience': 'user',
  'hr:people-intelligence': 'reports',
  'hr:administration-governance': 'shield',
  'construction:portfolio': 'dashboard',
  'construction:estimating': 'ruler',
  'construction:projects': 'projects',
  'construction:contracts': 'signature',
  'construction:subcontractors': 'team',
  'construction:claims': 'einvoicing',
  'construction:procurement': 'purchases',
  'construction:budget-cost': 'costCenters',
  'construction:financial-closeout': 'financial',
  'crm:management': 'dashboard',
  'crm:leads': 'filter',
  'crm:opportunities': 'target',
  'crm:activities': 'calendar',
  'crm:accounts': 'building',
  'crm:sales-management': 'sales',
  'crm:administration': 'settings',
  'fsm:operations': 'dashboard',
  'fsm:sites': 'pin',
  'fsm:agreements': 'signature',
  'fsm:work-orders': 'clipboard',
  'fsm:inspection': 'search',
  'fsm:deficiencies': 'warning',
  'fsm:billing': 'einvoicing',
  'fsm:quality': 'shield',
  'fsm:administration': 'settings',
  'pos:mobile-shops': 'smartphone',
  'pos:florist': 'flower',
  'pos:salons': 'scissors',
  'pos:electrical-appliances': 'appliance',
  'pos:furniture': 'sofa',
  'pos:optical': 'glasses',
  'pos:restaurants-cafes': 'coffee',
  'pos:sweets': 'cake',
  'pos:pharmacies': 'pharmacy',
};

export const departmentGlyph = (product: ProductKey, id: string): GlyphName => DEPARTMENT_GLYPH[`${product}:${id}`] ?? FAMILY_VISUAL[product].glyph;
