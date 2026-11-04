// Canonical product-and-department registry. Header, Mega Menu, Product Hubs, department pages, breadcrumbs,
// lead context and the admin catalog all read from here, so a department exists in exactly one place.
// Labels come from the owner's product brief (2026-11-04); summaries reuse copy already approved on the site.
import { HR_INDEX } from './hr/hr-index';
import { specialistIndexOf, specialistPath } from './specialist/registry';
import type { SpecialistProduct } from './specialist/types';
export type L = { ar: string; en: string };
export type ProductKey = 'pro' | 'hr' | 'construction' | 'crm' | 'fsm' | 'pos';

/**
 * `page`: an existing file-based route with imported, already-published content.
 * `cms`: a registered department route rendered from its CMS document; it is public only once that document is published.
 */
export type DepartmentSource = 'page' | 'cms';

export type Department = {
  id: string;
  product: ProductKey;
  path: string;
  label: L;
  summary?: L;
  source: DepartmentSource;
  /** Real DIGIT screenshot for the Mega Menu feature area; omitted when no approved screen exists. */
  shot?: string;
};

export type CatalogLink = { id: string; path: string; hash?: string; label: L; summary?: L; shot?: string };

export type ProductFamily = {
  key: ProductKey;
  /** Product name, e.g. DIGIT Pro. */
  name: L;
  /** Business area, e.g. المالية. */
  area: L;
  /** Short top-level header label. */
  nav: L;
  overview: string;
  summary: L;
  /** What the department list is called in menus and hubs. */
  groupLabel: L;
  departments: Department[];
  /** Cross-departmental links (dashboards, reports, tour); never presented as operational departments. */
  extras: CatalogLink[];
  /** Existing solution pages (POS activities); kept as-is, not departments. */
  solutions: CatalogLink[];
  shot?: string;
  /** Base for registered CMS department routes, e.g. /hr. */
  base?: string;
};

const pro: ProductFamily = {
  key: 'pro',
  name: { ar: 'DIGIT Pro', en: 'DIGIT Pro' },
  area: { ar: 'المالية', en: 'Finance' },
  nav: { ar: 'المالية', en: 'Finance' },
  overview: '/pro',
  summary: {
    ar: 'المحاسبة والمبيعات والمشتريات والمخزون والأصول والتقارير في نظام مالي وتشغيلي واحد.',
    en: 'Accounting, sales, purchasing, inventory, assets and reports in one financial and operational system.',
  },
  groupLabel: { ar: 'أقسام DIGIT Pro', en: 'DIGIT Pro departments' },
  shot: '01-cfo-01-e1',
  departments: [
    { id: 'accounting', product: 'pro', path: '/modules/accounting', source: 'page', shot: '01-cfo-01-e1', label: { ar: 'المحاسبة والمالية', en: 'Accounting & Finance' }, summary: { ar: 'موقفك المالي كله في شاشة واحدة، وكل رقم بمصدره', en: 'Your whole financial position on one screen, every number traced to its source' } },
    { id: 'selling', product: 'pro', path: '/modules/sales', source: 'page', shot: '04-360-01-sl1', label: { ar: 'المبيعات', en: 'Selling' }, summary: { ar: 'وعد العميل على حاجة متوفرة فعلًا، وبسعر مفهوم', en: "Promise only what you actually have, at a price you can explain" } },
    { id: 'purchasing', product: 'pro', path: '/modules/purchasing', source: 'page', shot: '06-pur-03-pu12', label: { ar: 'المشتريات', en: 'Purchasing' }, summary: { ar: 'اعرف التزاماتك، وانحرافات الأسعار، وأحسن موردينك', en: 'See commitments, price variances and your best suppliers' } },
    { id: 'inventory', product: 'pro', path: '/modules/inventory', source: 'page', shot: '07-inv-04-in11', label: { ar: 'المخزون والمستودعات', en: 'Inventory & Warehouses' }, summary: { ar: 'رصيد المخزن هو نفسه اللي في الدفاتر', en: 'Warehouse stock that matches the books' } },
    { id: 'fixed-assets', product: 'pro', path: '/modules/fixed-assets', source: 'page', shot: '04-360-04-fa2', label: { ar: 'الأصول الثابتة', en: 'Fixed Assets' }, summary: { ar: 'راجع الإهلاك المجدول والمستحق والمرحّل ومطابقته مع الأستاذ العام', en: 'Review scheduled, due and posted depreciation against the GL' } },
  ],
  extras: [
    { id: 'reports', path: '/modules/reports', shot: '09-rep-03-r6', label: { ar: 'مركز التقارير', en: 'Report center' }, summary: { ar: 'فهرس التقارير حسب السؤال والإدارة', en: 'Reports by question and department' } },
    { id: 'dashboards', path: '/pro/executive-dashboards', shot: '01-cfo-01-e1', label: { ar: 'لوحات الإدارة', en: 'Management dashboards' }, summary: { ar: 'مركز القيادة والاستثناءات', en: 'Command center and exceptions' } },
    { id: 'cfo', path: '/pro/cfo-decisions', shot: '01-cfo-02-e2', label: { ar: 'قرارات المدير المالي', en: 'CFO decisions' }, summary: { ar: 'اثنا عشر سؤالًا تنفيذيًا', en: 'Twelve executive questions' } },
    { id: 'governance', path: '/pro/settings-governance', shot: '10-ctl-03-s4', label: { ar: 'الإعدادات والحوكمة', en: 'Settings & governance' }, summary: { ar: 'الصلاحيات والاعتمادات', en: 'Permissions and approvals' } },
    { id: 'capabilities', path: '/pro/capabilities', shot: '03-doc-01-d1', label: { ar: 'القدرات المتقدمة', en: 'Advanced capabilities' }, summary: { ar: 'القدرات حسب النتيجة', en: 'Capabilities by outcome' } },
    { id: 'tour', path: '/pro', hash: 'pro-inside', shot: '10-ctl-01-s1', label: { ar: 'جولة في المنتج', en: 'Product tour' }, summary: { ar: 'عشر مساحات عمل من النظام الحقيقي', en: 'Ten workspaces from the live product' } },
  ],
  solutions: [],
};

// The seven DIGIT HR modules come from the owner's HR handoff (route slugs, names and summaries); see src/content/hr.
const hrDepartments = (): Department[] => HR_INDEX.map(m => ({ id: m.slug, product: 'hr', path: `/hr/${m.slug}`, source: 'cms', label: m.label, summary: m.summary }));
const hr: ProductFamily = {
  key: 'hr',
  base: '/hr',
  name: { ar: 'DIGIT HR', en: 'DIGIT HR' },
  area: { ar: 'الموارد البشرية', en: 'Human Resources' },
  nav: { ar: 'الموارد البشرية', en: 'HR' },
  overview: '/modules/hr-payroll',
  summary: { ar: 'دورة الموظف والقوى العاملة في نظام واحد، من الهيكل التنظيمي حتى الحوكمة.', en: 'The employee and workforce lifecycle in one system, from organization structure to governance.' },
  groupLabel: { ar: 'مجالات DIGIT HR', en: 'DIGIT HR areas' },
  departments: hrDepartments(),
  extras: [],
  solutions: [],
};

// Construction, CRM and FSM + ITM departments come from the specialist page registry (V4 brief 2026-11-04,
// corporate profile taxonomy); each is a CMS-gated route that is public only once its page is published.
const specialistDepartments = (product: SpecialistProduct): Department[] =>
  specialistIndexOf(product).map(d => ({ id: d.slug, product, path: specialistPath(d), source: 'cms', label: d.label, summary: d.summary, ...(d.heroShots[0] ? { shot: d.heroShots[0] } : {}) }));

const construction: ProductFamily = {
  key: 'construction',
  base: '/construction',
  name: { ar: 'DIGIT Construction', en: 'DIGIT Construction' },
  area: { ar: 'المقاولات', en: 'Construction' },
  nav: { ar: 'المقاولات', en: 'Construction' },
  overview: '/modules/contracting',
  summary: { ar: 'من المقايسة إلى التحصيل في سياق مشروع واحد: العقد والتنفيذ والتكلفة والمستخلصات، مرتبطة بمحاسبتك.', en: 'From BOQ to collection in one project context: contract, execution, cost and claims, connected to your accounting.' },
  groupLabel: { ar: 'أقسام DIGIT Construction', en: 'DIGIT Construction departments' },
  departments: specialistDepartments('construction'),
  extras: [{ id: 'sector', path: '/industries/contracting-industry', label: { ar: 'قطاع المقاولات', en: 'Contracting sector' } }],
  solutions: [],
};

const crm: ProductFamily = {
  key: 'crm',
  base: '/crm',
  name: { ar: 'DIGIT CRM', en: 'DIGIT CRM' },
  area: { ar: 'علاقات العملاء', en: 'Customer relationships' },
  nav: { ar: 'علاقات العملاء', en: 'CRM' },
  overview: '/modules/crm',
  summary: { ar: 'من العميل المحتمل إلى الصفقة: مسؤول وخطوة تالية لكل عميل، واستثناءات يتصرف فيها المدير.', en: 'From lead to deal: an owner and a next step for every customer, and exceptions the manager can act on.' },
  groupLabel: { ar: 'مجالات DIGIT CRM', en: 'DIGIT CRM areas' },
  departments: specialistDepartments('crm'),
  extras: [],
  solutions: [],
};

const fsm: ProductFamily = {
  key: 'fsm',
  base: '/fsm',
  name: { ar: 'DIGIT FSM + ITM', en: 'DIGIT FSM + ITM' },
  area: { ar: 'الخدمة والفحص الميداني', en: 'Field service & inspection' },
  nav: { ar: 'الخدمة الميدانية', en: 'Field service' },
  overview: '/modules/fsm-itm',
  summary: { ar: 'من العقد إلى الزيارة: تشغيل ميداني له تاريخ ومسؤول ومستند، من الفحص حتى الإغلاق المؤكد.', en: 'From agreement to visit: field operations with a history, an owner and a document, from inspection to verified closure.' },
  groupLabel: { ar: 'مجالات DIGIT FSM + ITM', en: 'DIGIT FSM + ITM areas' },
  departments: specialistDepartments('fsm'),
  extras: [],
  solutions: [],
};

const posSolution = (id: string, ar: string, en: string): CatalogLink => ({ id, path: `/pos-solutions/${id}`, label: { ar, en } });
const pos: ProductFamily = {
  key: 'pos',
  name: { ar: 'DIGIT POS', en: 'DIGIT POS' },
  area: { ar: 'نقاط البيع', en: 'Point of Sale' },
  nav: { ar: 'نقاط البيع', en: 'POS' },
  overview: '/modules/pos',
  summary: { ar: 'نقاط بيع تربط المبيعات بالمخزون والمحاسبة لحظيًا وتدعم فروعك المتعددة.', en: 'Point of sale that links sales to inventory and accounting in real time across your branches.' },
  groupLabel: { ar: 'حلول حسب النشاط', en: 'Solutions by business' },
  departments: [],
  extras: [],
  solutions: [
    posSolution('mobile-shops', 'محلات الجوال', 'Mobile shops'),
    posSolution('florist', 'الزهور', 'Florists'),
    posSolution('salons', 'الصالونات', 'Salons'),
    posSolution('electrical-appliances', 'الأجهزة الكهربائية', 'Electrical appliances'),
    posSolution('furniture', 'الأثاث والمفروشات', 'Furniture & furnishings'),
    posSolution('optical', 'النظارات', 'Optical stores'),
    posSolution('restaurants-cafes', 'المطاعم والكافيهات', 'Restaurants & cafés'),
    posSolution('sweets', 'الحلويات', 'Sweets'),
    posSolution('pharmacies', 'الصيدليات', 'Pharmacies'),
  ],
};

export const PRODUCTS: ProductFamily[] = [pro, hr, construction, crm, fsm, pos];
export const PRODUCT_KEYS = PRODUCTS.map(p => p.key);
export const productByKey = (key: string): ProductFamily | undefined => PRODUCTS.find(p => p.key === key);
export const ALL_DEPARTMENTS: Department[] = PRODUCTS.flatMap(p => p.departments);

const bare = (path: string) => (path.replace(/^\/en(?=\/|$)/, '') || '/').replace(/\/$/, '') || '/';

export function departmentByPath(path: string): Department | undefined {
  const p = bare(path);
  return ALL_DEPARTMENTS.find(d => d.path === p);
}

export function departmentById(product: ProductKey, id: string): Department | undefined {
  return productByKey(product)?.departments.find(d => d.id === id);
}

/** Product and department a page belongs to, used to tag demo requests and breadcrumbs. */
export function contextForPath(path: string): { product: ProductKey | ''; department: string } {
  const p = bare(path);
  const dept = departmentByPath(p);
  if (dept) return { product: dept.product, department: dept.id };
  for (const family of PRODUCTS) {
    if (family.overview === p || family.solutions.some(s => s.path === p) || family.extras.some(e => e.path === p && !e.hash)) return { product: family.key, department: '' };
    if (family.base && p.startsWith(family.base + '/')) return { product: family.key, department: '' };
  }
  return { product: '', department: '' };
}

/* --------------------------------- Other menu groups --------------------------------- */

export type MenuLink = { path: string; hash?: string; label: L; summary?: L };

export const ABOUT_LINKS: MenuLink[] = [
  { path: '/about-4', label: { ar: 'عن Digit', en: 'About Digit' } },
  { path: '/features', label: { ar: 'القدرات', en: 'Capabilities' } },
  { path: '/saudi-localization', label: { ar: 'التوطين السعودي', en: 'Saudi localization' } },
  { path: '/trust-security', label: { ar: 'الثقة والأمان', en: 'Trust & security' } },
  { path: '/partnership', label: { ar: 'الشراكة', en: 'Partnership' } },
  { path: '/careers', label: { ar: 'الوظائف', en: 'Careers' } },
  { path: '/contact-4', label: { ar: 'تواصل معنا', en: 'Contact us' } },
];

/**
 * Systems outside the six product families, kept at their existing module routes. CRM is now a product family;
 * Projects and Manufacturing are development directions (corporate profile p. 31) and stay out of product menus.
 */
export const MORE_SYSTEMS: MenuLink[] = [
  { path: '/modules/e-invoicing-zatca', label: { ar: 'الفوترة الإلكترونية', en: 'E-invoicing' } },
  { path: '/modules', label: { ar: 'كل الموديولات', en: 'All modules' } },
];

export const PACKAGES: MenuLink[] = [
  { path: '/starter', label: { ar: 'DIGIT Starter', en: 'DIGIT Starter' } },
  { path: '/pro', label: { ar: 'DIGIT Pro', en: 'DIGIT Pro' } },
  { path: '/pricing', label: { ar: 'مقارنة الباقات', en: 'Compare packages' } },
];

export const INDUSTRIES: MenuLink[] = [
  { path: '/industries/retail', label: { ar: 'التجزئة', en: 'Retail' } },
  { path: '/industries/distribution', label: { ar: 'التوزيع والجملة', en: 'Distribution & wholesale' } },
  { path: '/industries/contracting-industry', label: { ar: 'المقاولات', en: 'Contracting' } },
  { path: '/industries/manufacturing-industry', label: { ar: 'التصنيع', en: 'Manufacturing' } },
  { path: '/industries/real-estate-2', label: { ar: 'العقارات', en: 'Real estate' } },
  { path: '/industries/healthcare', label: { ar: 'الطبي والرعاية الصحية', en: 'Healthcare' } },
  { path: '/industries/education', label: { ar: 'التعليم', en: 'Education' } },
  { path: '/industries/professional-services', label: { ar: 'الخدمات المهنية', en: 'Professional services' } },
  { path: '/industries', label: { ar: 'كل القطاعات', en: 'All industries' } },
];

/** Explore by role or business problem: existing pages only, grouped the same way as the home App Explorer. */
export const EXPLORE_BY_ROLE: MenuLink[] = [
  { path: '/pro/cfo-decisions', label: { ar: 'المدير المالي', en: 'CFO' }, summary: { ar: 'أسئلة وقرارات المدير المالي', en: 'CFO questions & decisions' } },
  { path: '/modules/fixed-assets', label: { ar: 'المراقب المالي', en: 'Financial controller' }, summary: { ar: 'دورة حياة الأصول', en: 'Asset lifecycle' } },
  { path: '/modules/sales', label: { ar: 'مدير المبيعات', en: 'Sales manager' }, summary: { ar: 'المبيعات وملف العميل', en: 'Sales & customer profile' } },
  { path: '/modules/purchasing', label: { ar: 'مسؤول المشتريات', en: 'Buyer' }, summary: { ar: 'المشتريات والموردون', en: 'Purchasing & suppliers' } },
  { path: '/modules/inventory', label: { ar: 'مسؤول المستودع', en: 'Warehouse lead' }, summary: { ar: 'المخزون والمستودعات', en: 'Inventory & warehouses' } },
  { path: '/starter', label: { ar: 'صاحب المنشأة', en: 'Business owner' }, summary: { ar: 'DIGIT Starter', en: 'DIGIT Starter' } },
];

/** Roles for the remaining specialist products (V4 brief); kept apart so the DIGIT Pro role list stays unchanged. */
export const EXPLORE_BY_ROLE_SPECIALIST: MenuLink[] = [
  { path: '/modules/contracting', label: { ar: 'مدير المشاريع', en: 'Project director' }, summary: { ar: 'من المقايسة إلى التحصيل', en: 'From BOQ to collection' } },
  { path: '/modules/crm', label: { ar: 'مدير فريق المبيعات', en: 'Sales team manager' }, summary: { ar: 'من العميل المحتمل إلى الخطوة التالية', en: 'From lead to next action' } },
  { path: '/modules/pos', label: { ar: 'مدير عمليات التجزئة', en: 'Retail operations manager' }, summary: { ar: 'من الكاشير إلى عمليات الشركة', en: 'From the till to company operations' } },
  { path: '/modules/fsm-itm', label: { ar: 'مدير عمليات الخدمة', en: 'Service operations manager' }, summary: { ar: 'من العقد إلى الإغلاق المؤكد', en: 'From agreement to verified closure' } },
];

export const EXPLORE_BY_PROBLEM: MenuLink[] = [
  { path: '/modules/accounting', label: { ar: 'الإقفال الشهري', en: 'Month-end close' } },
  { path: '/modules/reports', label: { ar: 'وضوح الأعمال', en: 'Business visibility' } },
  { path: '/modules/sales', label: { ar: 'التحصيل', en: 'Collections' } },
  { path: '/modules/inventory', label: { ar: 'توافر المخزون', en: 'Stock availability' } },
];

export const RESOURCE_LINKS: MenuLink[] = [
  { path: '/resources', label: { ar: 'مركز الموارد', en: 'Resource hub' } },
  { path: '/blueprint', label: { ar: 'صمّم منظومتك', en: 'Design your system' } },
  { path: '/faq', label: { ar: 'الأسئلة الشائعة', en: 'FAQ' } },
  { path: '/support', label: { ar: 'الدعم', en: 'Support' } },
  { path: '/demo', label: { ar: 'احجز عرضًا توضيحيًا', en: 'Book a demo' } },
];

export const SERVICE_LINKS: MenuLink[] = [
  { path: '/services-3', label: { ar: 'كل الخدمات', en: 'All services' } },
  { path: '/services-3/discovery-workshop', label: { ar: 'جلسة تحليل وتهيئة', en: 'Discovery workshop' } },
  { path: '/services-3/implementation', label: { ar: 'تطبيق النظام', en: 'Implementation' } },
  { path: '/services-3/data-migration', label: { ar: 'ترحيل البيانات', en: 'Data migration' } },
  { path: '/services-3/customization', label: { ar: 'التخصيص', en: 'Customization' } },
  { path: '/services-3/training', label: { ar: 'التدريب', en: 'Training' } },
  { path: '/services-3/zatca-onboarding', label: { ar: 'تجهيز الفوترة الإلكترونية', en: 'E-invoicing onboarding' } },
  { path: '/services-3/hosting', label: { ar: 'الاستضافة والتشغيل', en: 'Hosting & operations' } },
  { path: '/services-3/support', label: { ar: 'الدعم', en: 'Support' } },
  { path: '/services-3/maintenance', label: { ar: 'الصيانة والخدمة المُدارة', en: 'Maintenance & managed service' } },
  // Owner decision pending on the ERPNext service headline; the menu keeps the neutral label used before.
  { path: '/services-3/erpnext-service', label: { ar: 'تنفيذ وترقية النظام', en: 'System implementation & upgrade' } },
];

/* ------------------------------ Resolved catalog view ------------------------------ */

type OrderEntry = { id: string; enabled: boolean };
/** Stored menu order/visibility per product family (the `catalog` site setting). */
export type CatalogOrder = { products?: { [K in ProductKey]?: OrderEntry[] | undefined } };

/**
 * A department as menus and hubs show it. A CMS department becomes `live` only once its page is published; until
 * then it points to its card on the product hub, so no menu item opens an empty or unpublished page.
 */
export type ResolvedDepartment = Department & { live: boolean; href: string; hash?: string };
export type ResolvedFamily = Omit<ProductFamily, 'departments'> & { departments: ResolvedDepartment[]; liveCount: number };

export const departmentAnchor = (id: string) => `dept-${id}`;

/** Applies a stored order; hidden entries drop out, unknown ids are ignored and new items keep their place at the end. */
export function orderById<T extends { id: string }>(items: T[], order?: OrderEntry[]): T[] {
  if (!order?.length) return items;
  const byId = new Map(items.map(item => [item.id, item]));
  const seen = new Set<string>();
  const out: T[] = [];
  for (const entry of order) {
    const item = byId.get(entry.id);
    if (!item || seen.has(entry.id)) continue;
    seen.add(entry.id);
    if (entry.enabled) out.push(item);
  }
  for (const item of items) if (!seen.has(item.id)) out.push(item);
  return out;
}

export function resolveCatalog(order: CatalogOrder | undefined, publishedPaths: Iterable<string>): ResolvedFamily[] {
  const published = new Set(publishedPaths);
  return PRODUCTS.map(family => {
    const stored = order?.products?.[family.key];
    const departments = orderById(family.departments, stored).map((d): ResolvedDepartment => {
      const live = d.source === 'page' || published.has(d.path);
      return live ? { ...d, live, href: d.path } : { ...d, live, href: family.overview, hash: departmentAnchor(d.id) };
    });
    const solutions = family.key === 'pos' ? orderById(family.solutions, stored) : family.solutions;
    return { ...family, departments, solutions, liveCount: departments.filter(d => d.live).length };
  });
}

/** Home › product › department trail for a department page. */
export function departmentTrail(path: string): { product: ProductFamily; department: Department } | undefined {
  const department = departmentByPath(path);
  const product = department && productByKey(department.product);
  return department && product ? { product, department } : undefined;
}

/** Every internal path the menus can link to, for route checks. */
export function allMenuPaths(): string[] {
  const out = new Set<string>();
  for (const p of PRODUCTS) {
    out.add(p.overview);
    p.departments.forEach(d => out.add(d.path));
    p.extras.forEach(e => out.add(e.path));
    p.solutions.forEach(s => out.add(s.path));
  }
  for (const group of [ABOUT_LINKS, MORE_SYSTEMS, PACKAGES, INDUSTRIES, EXPLORE_BY_ROLE, EXPLORE_BY_ROLE_SPECIALIST, EXPLORE_BY_PROBLEM, RESOURCE_LINKS, SERVICE_LINKS]) group.forEach(l => out.add(l.path));
  return [...out];
}
