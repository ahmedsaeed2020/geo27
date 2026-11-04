// Canonical product-and-department registry. Header, Mega Menu, Product Hubs, department pages, breadcrumbs,
// lead context and the admin catalog all read from here, so a department exists in exactly one place.
// Labels come from the owner's product brief (2026-11-04); summaries reuse copy already approved on the site.
export type L = { ar: string; en: string };
export type ProductKey = 'pro' | 'hr' | 'construction' | 'pos';

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
  /** Business area shown in the header, e.g. المالية. */
  area: L;
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
    { id: 'dashboards', path: '/modules/accounting', hash: 'proof-cfo', shot: '01-cfo-01-e1', label: { ar: 'لوحات الإدارة', en: 'Management dashboards' }, summary: { ar: 'مركز قيادة المدير المالي', en: 'CFO command center' } },
    { id: 'reports', path: '/modules/reports', shot: '09-rep-03-r6', label: { ar: 'التقارير', en: 'Reports' }, summary: { ar: 'تقارير موحدة بالعربي', en: 'Unified Arabic reports' } },
    { id: 'tour', path: '/pro', hash: 'pro-inside', shot: '10-ctl-01-s1', label: { ar: 'جولة في المنتج', en: 'Product tour' }, summary: { ar: 'عشر مساحات عمل من النظام الحقيقي', en: 'Ten workspaces from the live product' } },
  ],
  solutions: [],
};

const hrDept = (id: string, ar: string, en: string): Department => ({ id, product: 'hr', path: `/hr/${id}`, source: 'cms', label: { ar, en } });
const hr: ProductFamily = {
  key: 'hr',
  base: '/hr',
  name: { ar: 'DIGIT HR', en: 'DIGIT HR' },
  area: { ar: 'الموارد البشرية', en: 'Human Resources' },
  overview: '/modules/hr-payroll',
  summary: { ar: 'دورة الموظف والقوى العاملة في نظام واحد، من الهيكل التنظيمي حتى الحوكمة.', en: 'The employee and workforce lifecycle in one system, from organization structure to governance.' },
  groupLabel: { ar: 'مجالات DIGIT HR', en: 'DIGIT HR areas' },
  departments: [
    hrDept('core-hr', 'الموارد البشرية الأساسية والهيكل التنظيمي', 'Core HR & Organization'),
    hrDept('talent', 'المواهب والتوظيف والتطوير', 'Human Capital & Talent'),
    hrDept('workforce', 'الحضور والإجازات والورديات', 'Workforce Management'),
    // The brief's Arabic label adds «المعتمدة»; it is held back pending owner confirmation (approval wording rule).
    hrDept('payroll', 'الرواتب والتعويضات والعمليات السعودية', 'Payroll, Rewards & Saudi Operations'),
    hrDept('self-service', 'الخدمة الذاتية وتجربة الموظف والمدير', 'Employee & Manager Experience'),
    hrDept('people-analytics', 'التحليلات وتخطيط القوى العاملة', 'People Intelligence & Planning'),
    hrDept('administration', 'الإعدادات والحوكمة', 'Administration & Governance'),
  ],
  extras: [],
  solutions: [],
};

const conDept = (id: string, ar: string, en: string): Department => ({ id, product: 'construction', path: `/construction/${id}`, source: 'cms', label: { ar, en } });
const construction: ProductFamily = {
  key: 'construction',
  base: '/construction',
  name: { ar: 'DIGIT Construction', en: 'DIGIT Construction' },
  area: { ar: 'المقاولات', en: 'Construction' },
  overview: '/modules/contracting',
  summary: { ar: 'رحلات المشروع والعقود والتكلفة لشركات المقاولات، مرتبطة بمحاسبتك.', en: 'Project, contract and cost journeys for contractors, connected to your accounting.' },
  groupLabel: { ar: 'أقسام DIGIT Construction', en: 'DIGIT Construction departments' },
  departments: [
    conDept('portfolio', 'الإدارة والمحفظة', 'Management & Portfolio'),
    conDept('projects', 'المشاريع والتنفيذ', 'Projects & Execution'),
    conDept('estimating', 'المناقصات والتقدير وجداول الكميات', 'Estimating, Tendering & BOQ'),
    conDept('contracts-claims', 'عقود العملاء والمستخلصات', 'Client Contracts & Claims'),
    conDept('subcontractors', 'المقاولون الباطن والقياسات', 'Subcontractors & Measurement'),
    conDept('budget-cost', 'الموازنات والتكاليف والتوقعات', 'Budget, Cost & Forecast'),
    conDept('procurement', 'المشتريات والمواد', 'Procurement & Materials'),
    conDept('resources', 'الموارد والمصروفات', 'Resources & Spend'),
    conDept('financial-closeout', 'الموقف المالي والإقفال والتقارير', 'Financial Position, Closeout & Reports'),
  ],
  extras: [{ id: 'sector', path: '/industries/contracting-industry', label: { ar: 'قطاع المقاولات', en: 'Contracting sector' } }],
  solutions: [],
};

const posSolution = (id: string, ar: string, en: string): CatalogLink => ({ id, path: `/pos-solutions/${id}`, label: { ar, en } });
const pos: ProductFamily = {
  key: 'pos',
  name: { ar: 'DIGIT POS', en: 'DIGIT POS' },
  area: { ar: 'نقاط البيع', en: 'Point of Sale' },
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

export const PRODUCTS: ProductFamily[] = [pro, hr, construction, pos];
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

/** Systems outside the four product families, kept at their existing module routes. */
export const MORE_SYSTEMS: MenuLink[] = [
  { path: '/modules/e-invoicing-zatca', label: { ar: 'الفوترة الإلكترونية', en: 'E-invoicing' } },
  { path: '/modules/crm', label: { ar: 'إدارة العملاء CRM', en: 'CRM' } },
  { path: '/modules/projects', label: { ar: 'المشاريع', en: 'Projects' } },
  { path: '/modules/manufacturing', label: { ar: 'التصنيع', en: 'Manufacturing' } },
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
  { path: '/modules/accounting', label: { ar: 'المدير المالي', en: 'CFO' }, summary: { ar: 'المحاسبة والمالية', en: 'Accounting & finance' } },
  { path: '/modules/fixed-assets', label: { ar: 'المراقب المالي', en: 'Financial controller' }, summary: { ar: 'دورة حياة الأصول', en: 'Asset lifecycle' } },
  { path: '/modules/sales', label: { ar: 'مدير المبيعات', en: 'Sales manager' }, summary: { ar: 'المبيعات وملف العميل', en: 'Sales & customer profile' } },
  { path: '/modules/purchasing', label: { ar: 'مسؤول المشتريات', en: 'Buyer' }, summary: { ar: 'المشتريات والموردون', en: 'Purchasing & suppliers' } },
  { path: '/modules/inventory', label: { ar: 'مسؤول المستودع', en: 'Warehouse lead' }, summary: { ar: 'المخزون والمستودعات', en: 'Inventory & warehouses' } },
  { path: '/starter', label: { ar: 'صاحب المنشأة', en: 'Business owner' }, summary: { ar: 'DIGIT Starter', en: 'DIGIT Starter' } },
];

export const EXPLORE_BY_PROBLEM: MenuLink[] = [
  { path: '/modules/accounting', label: { ar: 'الإقفال الشهري', en: 'Month-end close' } },
  { path: '/modules/reports', label: { ar: 'وضوح الأعمال', en: 'Business visibility' } },
  { path: '/modules/sales', label: { ar: 'التحصيل', en: 'Collections' } },
  { path: '/modules/inventory', label: { ar: 'توافر المخزون', en: 'Stock availability' } },
];

export const RESOURCE_LINKS: MenuLink[] = [
  { path: '/resources', label: { ar: 'مركز الموارد', en: 'Resource hub' } },
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
export type CatalogOrder = { products?: Partial<Record<ProductKey, OrderEntry[]>> };

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
  for (const group of [ABOUT_LINKS, MORE_SYSTEMS, PACKAGES, INDUSTRIES, EXPLORE_BY_ROLE, EXPLORE_BY_PROBLEM, RESOURCE_LINKS, SERVICE_LINKS]) group.forEach(l => out.add(l.path));
  return [...out];
}
