// "Design your system" blueprint builder. Every need points to an existing page from the catalog, every screen is a
// registered real screen (or none), and every connection line reuses wording already approved on the site
// (catalog summaries, corporate profile friction points). Nothing here is a price, a promise or a certification.
import type { L, ProductKey } from '@/content/catalog';

const t = (ar: string, en: string): L => ({ ar, en });

export type SectorId = 'retail' | 'distribution' | 'contracting' | 'manufacturing' | 'real-estate' | 'healthcare' | 'education' | 'professional' | 'field-service' | 'restaurants';
export type EmployeesId = '1-20' | '21-100' | '101-500' | '500+';
export type BranchesId = '1' | '2-5' | '6+';
export type CurrentId = 'sheets' | 'accounting' | 'erp' | 'new';
export type NeedId = 'close' | 'cash' | 'reports' | 'einvoice' | 'approvals' | 'sales' | 'purchasing' | 'inventory' | 'assets' | 'pos' | 'hr' | 'projects' | 'crm' | 'field';
export type NeedGroup = 'finance' | 'operations' | 'people' | 'specialist';

export type Sector = { id: SectorId; label: L; page: string; suggests: NeedId[] };
export type Need = {
  id: NeedId;
  group: NeedGroup;
  product: ProductKey;
  /** Catalog department id for lead tagging, when the need is one department. */
  department?: string;
  label: L;
  /** Short label used on the system map. */
  short: L;
  summary: L;
  path: string;
  hash?: string;
  /** A registered real screen id; needs without one are shown in a demo session instead. */
  shot?: string;
};
export type Flow = { from: NeedId; to: NeedId; label: L };

export const SECTORS: Sector[] = [
  { id: 'retail', label: t('التجزئة والمتاجر', 'Retail & stores'), page: '/industries/retail', suggests: ['pos', 'inventory', 'sales', 'purchasing', 'close'] },
  { id: 'distribution', label: t('التوزيع والجملة', 'Distribution & wholesale'), page: '/industries/distribution', suggests: ['sales', 'inventory', 'purchasing', 'cash', 'close', 'crm'] },
  { id: 'contracting', label: t('المقاولات والمشاريع', 'Contracting & projects'), page: '/industries/contracting-industry', suggests: ['projects', 'purchasing', 'close', 'assets', 'hr'] },
  { id: 'manufacturing', label: t('التصنيع', 'Manufacturing'), page: '/industries/manufacturing-industry', suggests: ['inventory', 'purchasing', 'sales', 'close', 'assets'] },
  { id: 'real-estate', label: t('العقارات', 'Real estate'), page: '/industries/real-estate-2', suggests: ['close', 'cash', 'crm', 'assets'] },
  { id: 'healthcare', label: t('الطبي والرعاية الصحية', 'Healthcare'), page: '/industries/healthcare', suggests: ['close', 'inventory', 'purchasing', 'hr'] },
  { id: 'education', label: t('التعليم', 'Education'), page: '/industries/education', suggests: ['close', 'cash', 'hr', 'reports'] },
  { id: 'professional', label: t('الخدمات المهنية', 'Professional services'), page: '/industries/professional-services', suggests: ['crm', 'sales', 'cash', 'hr', 'close'] },
  { id: 'field-service', label: t('الصيانة والخدمة الميدانية', 'Maintenance & field service'), page: '/modules/fsm-itm', suggests: ['field', 'crm', 'sales', 'inventory', 'close'] },
  { id: 'restaurants', label: t('المطاعم والكافيهات', 'Restaurants & cafés'), page: '/pos-solutions/restaurants-cafes', suggests: ['pos', 'inventory', 'purchasing', 'close'] },
];

export const EMPLOYEES: { id: EmployeesId; label: L }[] = [
  { id: '1-20', label: t('حتى 20 موظفًا', 'Up to 20 employees') },
  { id: '21-100', label: t('21 – 100', '21 – 100') },
  { id: '101-500', label: t('101 – 500', '101 – 500') },
  { id: '500+', label: t('أكثر من 500', 'More than 500') },
];

export const BRANCHES: { id: BranchesId; label: L }[] = [
  { id: '1', label: t('فرع واحد', 'One branch') },
  { id: '2-5', label: t('2 – 5 فروع', '2 – 5 branches') },
  { id: '6+', label: t('6 فروع أو أكثر', '6 branches or more') },
];

export const CURRENT: { id: CurrentId; label: L }[] = [
  { id: 'sheets', label: t('جداول وبرامج متفرقة', 'Spreadsheets & separate tools') },
  { id: 'accounting', label: t('برنامج محاسبة فقط', 'An accounting program only') },
  { id: 'erp', label: t('نظام ERP قائم', 'An existing ERP') },
  { id: 'new', label: t('منشأة جديدة', 'A new company') },
];

export const GROUPS: { id: NeedGroup; label: L }[] = [
  { id: 'finance', label: t('المالية والرقابة', 'Finance & control') },
  { id: 'operations', label: t('العمليات والمخزون والبيع', 'Operations, stock & selling') },
  { id: 'people', label: t('الموارد البشرية', 'People') },
  { id: 'specialist', label: t('تطبيقات متخصصة', 'Specialist applications') },
];

export const NEEDS: Need[] = [
  { id: 'close', group: 'finance', product: 'pro', department: 'accounting', label: t('الإقفال الشهري والقوائم المالية', 'Month-end close & financial statements'), short: t('المحاسبة', 'Accounting'), summary: t('موقفك المالي كله في شاشة واحدة، وكل رقم بمصدره', 'Your whole financial position on one screen, every number traced to its source'), path: '/modules/accounting', shot: '09-rep-03-r6' },
  { id: 'cash', group: 'finance', product: 'pro', department: 'accounting', label: t('التحصيل والسيولة', 'Collections & cash'), short: t('النقد والتحصيل', 'Cash & collections'), summary: t('المتأخر مقابل الصافي القابل للتحصيل، وتوقع النقد', 'Overdue against net collectible, and the cash forecast'), path: '/modules/accounting', hash: 'pv-ACC-CASH', shot: '02-cash-01-f9' },
  { id: 'reports', group: 'finance', product: 'pro', label: t('التقارير ولوحات الإدارة', 'Reports & management dashboards'), short: t('لوحات الإدارة', 'Dashboards'), summary: t('مركز القيادة والاستثناءات', 'Command center and exceptions'), path: '/pro/executive-dashboards', shot: '01-cfo-01-e1' },
  { id: 'einvoice', group: 'finance', product: 'pro', label: t('الفوترة الإلكترونية', 'E-invoicing'), short: t('الفوترة الإلكترونية', 'E-invoicing'), summary: t('يدعم الربط مع منظومة الفوترة الإلكترونية (فاتورة)', 'Supports integration with the e-invoicing system (Fatoora)'), path: '/modules/e-invoicing-zatca' },
  { id: 'approvals', group: 'finance', product: 'pro', label: t('الصلاحيات والاعتمادات', 'Permissions & approvals'), short: t('الحوكمة', 'Governance'), summary: t('الصلاحيات والاعتمادات داخل مسار العمل', 'Permissions and approvals inside the workflow'), path: '/pro/settings-governance', shot: '10-ctl-03-s4' },
  { id: 'sales', group: 'operations', product: 'pro', department: 'selling', label: t('المبيعات وعروض الأسعار', 'Sales & quotations'), short: t('المبيعات', 'Sales'), summary: t('وعد العميل على حاجة متوفرة فعلًا، وبسعر مفهوم', 'Promise only what you actually have, at a price you can explain'), path: '/modules/sales', shot: '04-360-01-sl1' },
  { id: 'purchasing', group: 'operations', product: 'pro', department: 'purchasing', label: t('المشتريات والموردون', 'Purchasing & suppliers'), short: t('المشتريات', 'Purchasing'), summary: t('اعرف التزاماتك، وانحرافات الأسعار، وأحسن موردينك', 'See commitments, price variances and your best suppliers'), path: '/modules/purchasing', shot: '06-pur-03-pu12' },
  { id: 'inventory', group: 'operations', product: 'pro', department: 'inventory', label: t('المخزون والمستودعات', 'Inventory & warehouses'), short: t('المخزون', 'Inventory'), summary: t('رصيد المخزن هو نفسه اللي في الدفاتر', 'Warehouse stock that matches the books'), path: '/modules/inventory', shot: '07-inv-04-in11' },
  { id: 'assets', group: 'operations', product: 'pro', department: 'fixed-assets', label: t('الأصول الثابتة', 'Fixed assets'), short: t('الأصول', 'Assets'), summary: t('راجع الإهلاك المجدول والمستحق والمرحّل ومطابقته مع الأستاذ العام', 'Review scheduled, due and posted depreciation against the GL'), path: '/modules/fixed-assets', shot: '04-360-04-fa2' },
  { id: 'pos', group: 'operations', product: 'pos', label: t('نقاط البيع والفروع', 'Point of sale & branches'), short: t('نقاط البيع', 'POS'), summary: t('نقاط بيع تربط المبيعات بالمخزون والمحاسبة لحظيًا وتدعم فروعك المتعددة', 'Point of sale that links sales to inventory and accounting in real time across your branches'), path: '/modules/pos' },
  { id: 'hr', group: 'people', product: 'hr', label: t('الموظفون والرواتب والحضور', 'Employees, payroll & attendance'), short: t('الموارد البشرية', 'HR'), summary: t('دورة الموظف والقوى العاملة في نظام واحد، من الهيكل التنظيمي حتى الحوكمة', 'The employee and workforce lifecycle in one system, from organization structure to governance'), path: '/modules/hr-payroll', shot: 'hr-s01' },
  { id: 'projects', group: 'specialist', product: 'construction', label: t('المشاريع والمقاولات والمستخلصات', 'Projects, contracting & claims'), short: t('المقاولات', 'Construction'), summary: t('من المقايسة إلى التحصيل في سياق مشروع واحد، مرتبطة بمحاسبتك', 'From BOQ to collection in one project context, connected to your accounting'), path: '/modules/contracting' },
  { id: 'crm', group: 'specialist', product: 'crm', label: t('العملاء المحتملون والصفقات', 'Leads & deals'), short: t('علاقات العملاء', 'CRM'), summary: t('من العميل المحتمل إلى الصفقة: مسؤول وخطوة تالية لكل عميل', 'From lead to deal: an owner and a next step for every customer'), path: '/modules/crm' },
  { id: 'field', group: 'specialist', product: 'fsm', label: t('الخدمة والفحص الميداني', 'Field service & inspection'), short: t('الخدمة الميدانية', 'Field service'), summary: t('من العقد إلى الزيارة، من الفحص حتى الإغلاق المؤكد', 'From agreement to visit, from inspection to verified closure'), path: '/modules/fsm-itm' },
];

/** Direct connections between two chosen needs; wording comes from the catalog and corporate profile copy. */
export const FLOWS: Flow[] = [
  { from: 'pos', to: 'inventory', label: t('كل بيع يربط المخزون لحظيًا', 'Every sale updates stock in real time') },
  { from: 'pos', to: 'close', label: t('المبيعات تصل للمحاسبة لحظيًا', 'Sales reach accounting in real time') },
  { from: 'sales', to: 'inventory', label: t('الوعد على كمية متوفرة فعلًا', 'Promise only stock you actually have') },
  { from: 'sales', to: 'cash', label: t('من الفاتورة إلى التحصيل', 'From invoice to collection') },
  { from: 'purchasing', to: 'inventory', label: t('الاستلام مرتبط بالفاتورة', 'The goods receipt is linked to the invoice') },
  { from: 'purchasing', to: 'close', label: t('الالتزامات وفواتير الموردين في الدفاتر', 'Commitments and supplier bills in the books') },
  { from: 'inventory', to: 'close', label: t('رصيد المخزن هو نفسه اللي في الدفاتر', 'Warehouse stock matches the books') },
  { from: 'assets', to: 'close', label: t('الإهلاك مطابق مع الأستاذ العام', 'Depreciation reconciled with the GL') },
  { from: 'projects', to: 'close', label: t('المشروع من المقايسة إلى التحصيل مرتبط بمحاسبتك', 'Project from BOQ to collection, tied to your accounting') },
  { from: 'projects', to: 'purchasing', label: t('مشتريات المشروع بسياقه', 'Project purchasing in its own context') },
  { from: 'crm', to: 'sales', label: t('التسليم للمبيعات بخطوة تالية واضحة', 'Handoff to sales with a clear next step') },
  { from: 'einvoice', to: 'sales', label: t('يدعم ربط الفاتورة بمنظومة فاتورة', 'Supports linking invoices to Fatoora') },
  { from: 'close', to: 'reports', label: t('كل مؤشر يتعمّق إلى مستنده', 'Every indicator drills down to its document') },
  { from: 'approvals', to: 'purchasing', label: t('الموافقة داخل مسار العمل', 'Approvals inside the workflow') },
];

/** Every chosen application sits on the shared business platform. */
export const CORE = {
  label: t('منصة الأعمال', 'Business platform'),
  sub: t('سجلات مشتركة', 'Shared records'),
  spoke: t('سجلات مشتركة: العميل والمورد والصنف والحساب', 'Shared records: customer, supplier, item and account'),
};

/** Corporate-profile friction points the chosen needs address. */
export const FRICTIONS: { needs: NeedId[]; label: L; role: L }[] = [
  { needs: ['crm', 'sales', 'field'], label: t('طلب عميل بلا حالة واضحة', 'A customer request with no clear status'), role: t('مدير العمليات: ما المرحلة المتأخرة؟ ومن يملك الإجراء التالي؟', 'Operations manager: which stage is late, and who owns the next action?') },
  { needs: ['purchasing', 'inventory', 'pos'], label: t('استلام غير مرتبط بالفاتورة', 'A goods receipt not linked to the invoice'), role: t('المدير المالي: هل الاستلام والفاتورة والتحصيل مكتملة؟', 'CFO: are receipt, invoice and collection complete?') },
  { needs: ['close', 'cash', 'assets', 'projects', 'einvoice'], label: t('رصيد بلا مستند أصل', 'A balance with no source document'), role: t('المدير المالي: هل لهذا الرصيد حركة أصلية؟', 'CFO: does this balance have a source transaction?') },
  { needs: ['approvals', 'hr', 'reports'], label: t('موافقة خارج مسار العمل', 'An approval outside the workflow'), role: t('المدير التنفيذي: ما الذي يحتاج تدخله الآن، وما مصدر المؤشر؟', 'CEO: what needs my attention now, and where does this indicator come from?') },
];

export type Blueprint = { sector?: SectorId; employees?: EmployeesId; branches?: BranchesId; current?: CurrentId; needs: NeedId[] };

const SECTOR_IDS = new Set(SECTORS.map(s => s.id));
const NEED_IDS = new Set(NEEDS.map(n => n.id));

/** Reads a blueprint from URL search values; unknown values are dropped. */
export function parseBlueprint(search: Record<string, unknown>): Blueprint {
  const pick = <T extends string>(value: unknown, allowed: readonly T[]): T | undefined =>
    typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : undefined;
  const raw = typeof search['n'] === 'string' ? search['n'] : '';
  const needs = [...new Set(raw.split(',').map(s => s.trim()).filter((s): s is NeedId => NEED_IDS.has(s as NeedId)))];
  const sector = typeof search['s'] === 'string' && SECTOR_IDS.has(search['s'] as SectorId) ? (search['s'] as SectorId) : undefined;
  const out: Blueprint = { needs };
  if (sector) out.sector = sector;
  const employees = pick(search['e'], EMPLOYEES.map(e => e.id));
  if (employees) out.employees = employees;
  const branches = pick(search['b'], BRANCHES.map(b => b.id));
  if (branches) out.branches = branches;
  const current = pick(search['c'], CURRENT.map(c => c.id));
  if (current) out.current = current;
  return out;
}

export type BlueprintSearch = { s?: string; e?: string; b?: string; c?: string; n?: string };

/** URL search values for a blueprint (empty values are omitted so the link stays short). */
export function blueprintSearch(bp: Blueprint): BlueprintSearch {
  const out: BlueprintSearch = {};
  if (bp.sector) out.s = bp.sector;
  if (bp.employees) out.e = bp.employees;
  if (bp.branches) out.b = bp.branches;
  if (bp.current) out.c = bp.current;
  if (bp.needs.length) out.n = bp.needs.join(',');
  return out;
}

/** Route search validator shared by the Arabic and English routes. */
export function validateBlueprintSearch(search: Record<string, unknown>): BlueprintSearch {
  return blueprintSearch(parseBlueprint(search));
}

export const needById = (id: NeedId): Need => NEEDS.find(n => n.id === id)!;

/** Chosen needs in catalog order (finance first), so the map and reading path are stable. */
export const orderedNeeds = (ids: NeedId[]): Need[] => NEEDS.filter(n => ids.includes(n.id));

export const flowsFor = (ids: NeedId[]): Flow[] => FLOWS.filter(f => ids.includes(f.from) && ids.includes(f.to));

export const productsFor = (ids: NeedId[]): ProductKey[] => [...new Set(orderedNeeds(ids).map(n => n.product))];

export type StartPoint = { id: 'starter' | 'pro' | 'pro-apps' | 'enterprise'; reasons: L[] };

const STARTER_NEEDS: NeedId[] = ['einvoice', 'close', 'sales'];

/**
 * A suggested starting edition, never a quote. Starter suits a small single-branch company whose needs stay within
 * e-invoicing, accounting and sales; specialist applications or a large footprint point to Pro with applications or
 * an enterprise scope. The scope and price are always confirmed in discovery and the current quotation.
 */
export function startPoint(bp: Blueprint): StartPoint {
  const products = productsFor(bp.needs);
  const specialist = products.filter(p => p !== 'pro');
  const reasons: L[] = [];
  const large = bp.employees === '500+' || bp.branches === '6+';
  if (large || specialist.length >= 3) {
    if (bp.employees === '500+') reasons.push(t('أكثر من 500 موظف', 'More than 500 employees'));
    if (bp.branches === '6+') reasons.push(t('6 فروع أو أكثر', '6 branches or more'));
    if (specialist.length >= 3) reasons.push(t('ثلاثة تطبيقات متخصصة أو أكثر', 'Three or more specialist applications'));
    return { id: 'enterprise', reasons };
  }
  if (specialist.length) {
    reasons.push(t('تطبيقات متخصصة فوق القاعدة المالية', 'Specialist applications on the finance base'));
    return { id: 'pro-apps', reasons };
  }
  const small = (bp.employees ?? '1-20') === '1-20' && (bp.branches ?? '1') === '1';
  if (small && bp.needs.length > 0 && bp.needs.every(n => STARTER_NEEDS.includes(n))) {
    reasons.push(t('منشأة صغيرة بفرع واحد', 'A small single-branch company'), t('احتياج يبدأ بالفوترة والمحاسبة والمبيعات', 'Needs that start with invoicing, accounting and sales'));
    return { id: 'starter', reasons };
  }
  reasons.push(t('دورة مالية وتشغيلية كاملة', 'A full financial and operational cycle'));
  return { id: 'pro', reasons };
}

/**
 * Compact, form-safe topic code (letters, digits and dashes, at most 40 characters), e.g. BP-retail-E1-B2: the sector
 * id, then the employee and branch bands by position. Admins read it back with {@link blueprintTopicLabel}.
 */
export function blueprintTopic(bp: Blueprint): string {
  const e = bp.employees ? EMPLOYEES.findIndex(x => x.id === bp.employees) + 1 : 0;
  const b = bp.branches ? BRANCHES.findIndex(x => x.id === bp.branches) + 1 : 0;
  return ['BP', bp.sector ?? 'any', e ? `E${e}` : '', b ? `B${b}` : ''].filter(Boolean).join('-').slice(0, 40);
}

const TOPIC = /^BP-([a-z-]+?)(?:-E([1-4]))?(?:-B([1-3]))?$/;

/** The blueprint a stored topic code describes, or undefined for anything that isn't a valid blueprint code. */
export function parseBlueprintTopic(topic: string | null | undefined): Pick<Blueprint, 'sector' | 'employees' | 'branches'> | undefined {
  const m = TOPIC.exec(topic ?? '');
  if (!m) return undefined;
  const sector = m[1] === 'any' ? undefined : SECTORS.find(s => s.id === m[1])?.id;
  if (m[1] !== 'any' && !sector) return undefined;
  const out: Pick<Blueprint, 'sector' | 'employees' | 'branches'> = {};
  if (sector) out.sector = sector;
  const employees = m[2] ? EMPLOYEES[Number(m[2]) - 1]?.id : undefined;
  if (employees) out.employees = employees;
  const branches = m[3] ? BRANCHES[Number(m[3]) - 1]?.id : undefined;
  if (branches) out.branches = branches;
  return out;
}

/** Arabic admin label of a stored blueprint topic: «مخطط: القطاع · الموظفون · الفروع». */
export function blueprintTopicLabel(topic: string | null | undefined): string {
  const bp = parseBlueprintTopic(topic);
  if (!bp) return '';
  const parts = [
    SECTORS.find(s => s.id === bp.sector)?.label.ar ?? 'بدون قطاع',
    EMPLOYEES.find(e => e.id === bp.employees)?.label.ar,
    BRANCHES.find(b => b.id === bp.branches)?.label.ar,
  ].filter(Boolean);
  return `مخطط: ${parts.join(' · ')}`;
}
