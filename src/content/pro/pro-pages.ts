// DIGIT Pro V4 page registry: routes, SEO pairs, hero screens and section list (ids + titles) for the ten Pro
// experiences. Full copy lives in ./pages/<key>.ts and is loaded per page; this file stays small because the
// CMS schema, admin editor and server validation read it.
import type { L, ProPageContent } from './types';

export type ProPageKey = 'accounting' | 'selling' | 'purchasing' | 'inventory' | 'fixed-assets' | 'reports' | 'dashboards' | 'governance' | 'capabilities' | 'cfo';

export type ProPageConfig = {
  key: ProPageKey;
  /**
   * `department`: one of the five operational departments, `module`: the report center; both enrich an existing
   * imported route (its hero, FAQ, closing CTA and SEO pair stay). `area`: a new cross-department page under /pro.
   */
  kind: 'department' | 'module' | 'area';
  path: string;
  label: L;
  /** Short menu summary. */
  summary: L;
  /** Area pages only: on-page H1 and SEO pair. Existing routes keep their imported hero and SEO. */
  headline: L;
  seoTitle: L;
  seoDescription: L;
  /** Real DIGIT Pro screen for the area hero and menus. */
  heroShots: string[];
  sections: { id: string; title: L }[];
  /** Imported source sections (by design class) the V4 chapters replace on existing routes. */
  replaces?: string[];
  /** Visual signature of the page. */
  signature: 'ledger' | 'journey' | 'match' | 'anatomy' | 'lifecycle' | 'catalog' | 'command' | 'control' | 'explorer' | 'executive';
};

const s = (id: string, ar: string, en: string) => ({ id, title: { ar, en } });
const IMPORTED_REPLACED = ['benefits', 'inside', 'sec', 'demo', 'related'];

export const PRO_PAGES: ProPageConfig[] = [
  {
    key: 'accounting',
    summary: { ar: 'القيود والذمم والنقد والتقارير، وكل رقم بمصدره', en: 'Journals, dues, cash and reports, every figure with its source' },
    kind: 'department',
    path: '/modules/accounting',
    signature: 'ledger',
    label: { ar: 'المحاسبة والمالية', en: 'Accounting & Finance' },
    headline: { ar: 'من القيد إلى نتيجة الإدارة: أثر كل رقم ومصدره', en: 'From journal entry to management result: every figure and its source' },
    seoTitle: { ar: 'المحاسبة والمالية | DIGIT Pro', en: 'Accounting & Finance | DIGIT Pro' },
    seoDescription: {
      ar: 'أربع مساحات عمل محاسبية في DIGIT Pro: القيود، والذمم والمدفوعات، والنقد والبنوك، والتقارير والرقابة، بشاشات حقيقية وتقارير أصلية.',
      en: 'Four accounting workspaces in DIGIT Pro: journals, receivables and payables, cash and banking, and reports and controls, shown with real screens and native reports.',
    },
    heroShots: ['01-cfo-01-e1'],
    replaces: IMPORTED_REPLACED,
    sections: [
      s('intro', 'المحاسبة في DIGIT Pro', 'Accounting in DIGIT Pro'),
      s('ACC-OPS', 'العمليات والقيود', 'Transactions & journals'),
      s('ACC-DUES', 'الذمم والمدفوعات', 'Receivables & payables'),
      s('ACC-CASH', 'النقد والبنوك', 'Cash & banking'),
      s('ACC-REPORT', 'التقارير والتحليل والرقابة', 'Reports, analysis & controls'),
      s('close', 'من فاتورة المورد إلى الإقفال', 'From supplier bill to period close'),
      s('decisions', 'أسئلة المالية التي تجيب عنها الشاشات', 'Finance questions the screens answer'),
      s('connections', 'كيف تتصل المالية ببقية الإدارات', 'How finance connects to the other departments'),
    ],
  },
  {
    key: 'selling',
    summary: { ar: 'من عرض السعر إلى التحصيل في رحلة واحدة', en: 'From quotation to collection in one journey' },
    kind: 'department',
    path: '/modules/sales',
    signature: 'journey',
    label: { ar: 'المبيعات', en: 'Selling' },
    headline: { ar: 'من عرض السعر إلى التحصيل في رحلة تجارية واحدة', en: 'From quotation to collection in one commercial journey' },
    seoTitle: { ar: 'المبيعات | DIGIT Pro', en: 'Selling | DIGIT Pro' },
    seoDescription: {
      ar: 'العروض والطلبات، والعملاء والتسعير، والتسليم والفوترة، والتحصيل والتحليلات في DIGIT Pro، مع ملف العميل 360 وتوفر المخزون على سطر البيع.',
      en: 'Quotations and orders, customers and pricing, delivery and billing, and collections and analytics in DIGIT Pro, with Customer 360 and stock availability on the sales line.',
    },
    heroShots: ['04-360-01-sl1'],
    replaces: IMPORTED_REPLACED,
    sections: [
      s('intro', 'الرحلة التجارية', 'The commercial journey'),
      s('SEL-SALES', 'العروض والطلبات', 'Quotations & orders'),
      s('SEL-CUSTOMER', 'العملاء والتسعير', 'Customers & pricing'),
      s('SEL-FULFILL', 'التسليم والفوترة', 'Delivery & billing'),
      s('SEL-INTEL', 'التحصيل والتحليلات', 'Collections & analytics'),
      s('customer360', 'العميل كحساب واحد', 'The customer as one account'),
      s('decisions', 'أسئلة إدارة المبيعات', 'Questions sales leaders ask'),
      s('connections', 'كيف تتصل المبيعات ببقية الإدارات', 'How selling connects to the other departments'),
    ],
  },
  {
    key: 'purchasing',
    summary: { ar: 'من الاحتياج إلى الاستلام والفاتورة، مع أداء المورد', en: 'From need to receipt and bill, with supplier performance' },
    kind: 'department',
    path: '/modules/purchasing',
    signature: 'match',
    label: { ar: 'المشتريات', en: 'Purchasing' },
    headline: { ar: 'شراء يمكن تتبعه من الاحتياج حتى الاستلام والفاتورة', en: 'Purchasing you can trace from need to receipt and bill' },
    seoTitle: { ar: 'المشتريات | DIGIT Pro', en: 'Purchasing | DIGIT Pro' },
    seoDescription: {
      ar: 'الطلبات وطرح العروض، وأوامر الشراء والالتزامات، والاستلام والفواتير، والموردون والتحليلات في DIGIT Pro، مع تقييم المورد وفروقات السعر والكمية.',
      en: 'Requests and sourcing, purchase orders and commitments, receiving and invoicing, and supplier analytics in DIGIT Pro, with supplier scorecards and price and quantity variances.',
    },
    heroShots: ['06-pur-03-pu12'],
    replaces: IMPORTED_REPLACED,
    sections: [
      s('intro', 'دورة الشراء', 'The purchasing cycle'),
      s('PUR-SOURCE', 'الطلبات وطرح العروض', 'Requests & sourcing'),
      s('PUR-ORDERS', 'أوامر الشراء والمتابعة', 'Orders & commitments'),
      s('PUR-RECEIVE', 'الاستلام والفواتير', 'Receiving & invoicing'),
      s('PUR-SUPPLIER', 'الموردون والتحليلات', 'Suppliers & intelligence'),
      s('match', 'أمر الشراء والاستلام والفاتورة', 'Order, receipt and bill'),
      s('decisions', 'أسئلة المشتريات قبل القرار', 'Purchasing questions before a decision'),
      s('connections', 'كيف تتصل المشتريات ببقية الإدارات', 'How purchasing connects to the other departments'),
    ],
  },
  {
    key: 'inventory',
    summary: { ar: 'الفعلي والمحجوز والمتوقع، ومطابقة القيمة مع الدفاتر', en: 'Actual, reserved and projected, with value reconciled to the books' },
    kind: 'department',
    path: '/modules/inventory',
    signature: 'anatomy',
    label: { ar: 'المخزون والمستودعات', en: 'Inventory & Warehouses' },
    headline: { ar: 'كمية المخزون ليست رقمًا واحدًا', en: 'Stock is never just one number' },
    seoTitle: { ar: 'المخزون والمستودعات | DIGIT Pro', en: 'Inventory & Warehouses | DIGIT Pro' },
    seoDescription: {
      ar: 'ملف الصنف 360، والفصل بين الفعلي والمحجوز والمطلوب والمتوقع، وحركات المستودع، ومطابقة قيمة المخزون مع الأستاذ العام في DIGIT Pro.',
      en: 'Item 360, actual, reserved, on-order and projected quantities kept apart, warehouse movements, and stock value reconciled to the general ledger in DIGIT Pro.',
    },
    heroShots: ['04-360-03-in2'],
    replaces: IMPORTED_REPLACED,
    sections: [
      s('intro', 'المخزون في DIGIT Pro', 'Inventory in DIGIT Pro'),
      s('quantities', 'ملف الصنف 360 وتعريف كل كمية', 'Item 360 and what each quantity means'),
      s('INV-MASTER', 'الأصناف والمستودعات', 'Items & warehouses'),
      s('INV-MOVE', 'حركة المواد', 'Stock movements'),
      s('INV-CONTROL', 'الجرد والتتبع', 'Counting & traceability'),
      s('INV-REPORT', 'الرقابة والتقارير', 'Control & reports'),
      s('decisions', 'أسئلة المخزون التي تُحسم بالأرقام', 'Stock questions settled with figures'),
      s('connections', 'كيف يتصل المخزون ببقية الإدارات', 'How inventory connects to the other departments'),
    ],
  },
  {
    key: 'fixed-assets',
    summary: { ar: 'دورة حياة الأصل والإهلاك المرحّل مقابل المستحق', en: 'The asset lifecycle and posted versus due depreciation' },
    kind: 'department',
    path: '/modules/fixed-assets',
    signature: 'lifecycle',
    label: { ar: 'الأصول الثابتة', en: 'Fixed Assets' },
    headline: { ar: 'الأصل دورة حياة كاملة، لا سجل شراء منفصل', en: 'An asset is a full lifecycle, not a separate purchase record' },
    seoTitle: { ar: 'الأصول الثابتة | DIGIT Pro', en: 'Fixed Assets | DIGIT Pro' },
    seoDescription: {
      ar: 'سجل الأصول وملف الأصل 360، والإهلاك المجدول مقابل المستحق والمرحّل لكل دفتر، وجسر حركة الأصول مع الأستاذ العام في DIGIT Pro.',
      en: 'The asset register and Asset 360, scheduled vs. due vs. posted depreciation per book, and the asset movement bridge to the general ledger in DIGIT Pro.',
    },
    heroShots: ['04-360-04-fa2'],
    replaces: IMPORTED_REPLACED,
    sections: [
      s('intro', 'الأصول الثابتة في DIGIT Pro', 'Fixed assets in DIGIT Pro'),
      s('lifecycle', 'دورة حياة الأصل', 'The asset lifecycle'),
      s('AST-REGISTER', 'السجل والاقتناء', 'Register & acquisition'),
      s('AST-CUSTODY', 'الحركة والعهد', 'Movement & custody'),
      s('AST-DEP', 'الإهلاك والقيمة', 'Depreciation & value'),
      s('AST-SERVICE', 'الصيانة والاستبعاد', 'Maintenance & disposal'),
      s('decisions', 'أسئلة المراقب المالي عن الأصول', "The controller's asset questions"),
      s('connections', 'كيف تتصل الأصول ببقية الإدارات', 'How fixed assets connect to the other departments'),
    ],
  },
  {
    key: 'reports',
    summary: { ar: 'فهرس التقارير حسب السؤال والإدارة', en: 'The report directory by question and department' },
    kind: 'module',
    path: '/modules/reports',
    signature: 'catalog',
    label: { ar: 'مركز التقارير', en: 'Report Center' },
    headline: { ar: 'فهرس تقارير واحد، مرتب حسب السؤال والإدارة', en: 'One report directory, organised by question and department' },
    seoTitle: { ar: 'مركز التقارير | DIGIT Pro', en: 'Report Center | DIGIT Pro' },
    seoDescription: {
      ar: 'فهرس تقارير DIGIT Pro حسب الإدارة: المحاسبة والمبيعات والمشتريات والمخزون والأصول والإدارة، مع أمثلة مفصلة وضوابط الصلاحية والتصدير.',
      en: 'The DIGIT Pro report directory by department: accounting, selling, purchasing, inventory, assets and management, with detailed examples and permission and export controls.',
    },
    heroShots: ['09-rep-03-r6'],
    replaces: IMPORTED_REPLACED,
    sections: [
      s('featured', 'تقارير مختارة: السؤال والدور والقرار', 'Featured reports: question, role and decision'),
      s('directory', 'فهرس التقارير', 'Report directory'),
      s('controls', 'ضوابط التقرير: الصلاحية والفترة والتصدير', 'Report controls: permission, period and export'),
      s('trace', 'من التقرير إلى المستند الأصلي', 'From report to source document'),
    ],
  },
  {
    key: 'dashboards',
    summary: { ar: 'مركز القيادة والاستثناءات ومؤشرات بتعريف ومصدر', en: 'Command center, exceptions and indicators with a source' },
    kind: 'area',
    path: '/pro/executive-dashboards',
    signature: 'command',
    label: { ar: 'لوحات الإدارة', en: 'Executive Dashboards' },
    headline: { ar: 'لوحات إدارة تبدأ بالسؤال وتنتهي بالمستند', en: 'Management dashboards that start with a question and end at the document' },
    seoTitle: { ar: 'لوحات الإدارة التنفيذية | DIGIT Pro', en: 'Executive Dashboards | DIGIT Pro' },
    seoDescription: {
      ar: 'مركز القيادة التنفيذي في DIGIT Pro: السيولة والاستثناءات والإقفال والاعتمادات، والفرق بين لوحة الإدارة ومساحة العمل والتقرير، بشاشات حقيقية.',
      en: 'The DIGIT Pro executive command center: liquidity, exceptions, close and approvals, and how a management board differs from a workspace and a report, shown with real screens.',
    },
    heroShots: ['10-ctl-04-s7'],
    sections: [
      s('layers', 'ثلاث طبقات: الإدارة، والتشغيل، والتقرير', 'Three layers: management, operations, reports'),
      s('board', 'مركز القيادة التنفيذي', 'The executive command center'),
      s('exceptions', 'ما يحتاج انتباهك الآن', 'What needs your attention now'),
      s('monitoring', 'المتابعة التجارية والتشغيلية', 'Commercial and operational monitoring'),
      s('insights', 'مؤشرات بتعريف ومصدر', 'Indicators with a definition and a source'),
      s('cta', 'اطلب جولة على لوحات الإدارة', 'Request a walkthrough of the dashboards'),
    ],
  },
  {
    key: 'governance',
    summary: { ar: 'الصلاحيات والاعتمادات وما يحدَّد أثناء التهيئة', en: 'Permissions, approvals and what is set at set-up' },
    kind: 'area',
    path: '/pro/settings-governance',
    signature: 'control',
    label: { ar: 'الإعدادات والحوكمة', en: 'Settings & Governance' },
    headline: { ar: 'من يرى الرقم، ومن يعتمد المستند، ولماذا', en: 'Who sees the figure, who approves the document, and why' },
    seoTitle: { ar: 'الإعدادات والحوكمة | DIGIT Pro', en: 'Settings & Governance | DIGIT Pro' },
    seoDescription: {
      ar: 'الصلاحيات ونطاق الوصول والاعتمادات وأسباب منع الترحيل وسياق الشركة والفترة في DIGIT Pro، مع توضيح ما يحدَّد أثناء التهيئة.',
      en: 'Permissions and access scope, approvals, posting blocks with reasons, and company and period context in DIGIT Pro, with what is defined during set-up made clear.',
    },
    heroShots: ['10-ctl-03-s4'],
    sections: [
      s('access', 'الصلاحية جزء من البيانات، لا زر مخفي', 'Permission is part of the data, not a hidden button'),
      s('approvals', 'الاعتمادات وأسباب المنع', 'Approvals and blocking reasons'),
      s('context', 'سياق الشركة والفترة واللغة', 'Company, period and language context'),
      s('scope', 'ما يشمله النظام وما يحدَّد أثناء التهيئة', 'What is included and what is defined at set-up'),
      s('cta', 'راجع الحوكمة مع فريقنا', 'Review governance with our team'),
    ],
  },
  {
    key: 'capabilities',
    summary: { ar: 'مستكشف القدرات حسب النتيجة وحالة كل قدرة', en: 'Capabilities by outcome, with the status of each' },
    kind: 'area',
    path: '/pro/capabilities',
    signature: 'explorer',
    label: { ar: 'القدرات المتقدمة', en: 'Advanced Capabilities' },
    headline: { ar: 'قدرات تختصر الطريق من المعلومة إلى الإجراء', en: 'Capabilities that shorten the path from information to action' },
    seoTitle: { ar: 'القدرات المتقدمة | DIGIT Pro', en: 'Advanced Capabilities | DIGIT Pro' },
    seoDescription: {
      ar: 'مستكشف قدرات DIGIT Pro حسب النتيجة: رؤية 360، والمستندات المترابطة، والاستثناءات والاعتمادات، وطوابير العمل، والتقارير، مع حالة إثبات كل قدرة.',
      en: 'The DIGIT Pro capability explorer by outcome: 360° views, connected documents, exceptions and approvals, work queues and reporting, with the evidence status of each capability.',
    },
    heroShots: ['03-doc-01-d1'],
    sections: [
      s('explorer', 'مستكشف القدرات', 'Capability explorer'),
      s('document', 'المستند ليس نموذج حقول فقط', 'A document is more than a form'),
      s('tiers', 'متاح الآن، وقيد التحقق، وحسب التهيئة', 'Available now, being verified, defined at set-up'),
      s('cta', 'اختر القدرة التي تريد رؤيتها', 'Pick the capability you want to see'),
    ],
  },
  {
    key: 'cfo',
    summary: { ar: 'اثنا عشر سؤالًا تنفيذيًا بشاشاتها وتقاريرها', en: 'Twelve executive questions with their screens and reports' },
    kind: 'area',
    path: '/pro/cfo-decisions',
    signature: 'executive',
    label: { ar: 'قرارات المدير المالي', en: 'CFO Decisions' },
    headline: { ar: 'ما يحتاج المدير المالي أن يعرفه، ويفحصه، ويقرره', en: 'What a CFO needs to know, investigate and decide' },
    seoTitle: { ar: 'أسئلة وقرارات المدير المالي | DIGIT Pro', en: 'CFO Questions & Decisions | DIGIT Pro' },
    seoDescription: {
      ar: 'اثنا عشر سؤالًا تنفيذيًا في DIGIT Pro: السيولة، والذمم، والالتزامات، والمخزون، والإهلاك، والإقفال، مع الشاشة والتقرير المصدر وحالة الإثبات لكل سؤال.',
      en: 'Twelve executive questions in DIGIT Pro: liquidity, receivables, commitments, inventory, depreciation and close, each with its screen, source report and evidence status.',
    },
    heroShots: ['01-cfo-01-e1'],
    sections: [
      s('questions', 'اثنا عشر سؤالًا تنفيذيًا', 'Twelve executive questions'),
      s('cash', 'النقد والسيولة', 'Cash & liquidity'),
      s('control', 'الرقابة المالية والإقفال', 'Financial control & close'),
      s('performance', 'الأداء والربحية', 'Performance & profitability'),
      s('working-capital', 'رأس المال العامل', 'Working capital'),
      s('assets', 'الأصول ورأس المال', 'Assets & capital'),
      s('drill', 'من السؤال إلى القيد', 'From question to voucher'),
      s('cta', 'جرّب الأسئلة على بياناتك', 'Try the questions on your data'),
    ],
  },
];

export const proPageByKey = (key: string): ProPageConfig | undefined => PRO_PAGES.find(p => p.key === key);
export const PRO_AREAS = PRO_PAGES.filter(p => p.kind === 'area');
/** Slug of an area page: /pro/<slug>. */
export const areaSlug = (p: ProPageConfig) => p.path.slice('/pro/'.length);
export const proAreaBySlug = (slug: string): ProPageConfig | undefined => PRO_AREAS.find(p => areaSlug(p) === slug);

/**
 * Lead topics a Pro page may attach to a demo request: workspace codes (ACC-OPS…), executive questions
 * (EXE-01…) and page keys. Anything else is stored empty.
 */
const WORKSPACE_ID = /^[A-Z]{3}-[A-Z]{3,10}$/;
export const PRO_LEAD_TOPICS: ReadonlySet<string> = new Set([
  ...PRO_PAGES.map(p => p.key),
  ...PRO_PAGES.flatMap(p => p.sections.map(s => s.id).filter(id => WORKSPACE_ID.test(id))),
  ...Array.from({ length: 12 }, (_, i) => `EXE-${String(i + 1).padStart(2, '0')}`),
]);
export const proLeadTopic = (topic: string): string => (PRO_LEAD_TOPICS.has(topic) ? topic : '');
const bare = (path: string) => (path.replace(/^\/en(?=\/|$)/, '') || '/').replace(/\/$/, '') || '/';
export const proPageByPath = (path: string): ProPageConfig | undefined => PRO_PAGES.find(p => p.path === bare(path));

const loaders = import.meta.glob<ProPageContent>('./pages/*.ts', { import: 'default' });
const cache = new Map<string, ProPageContent>();

export async function loadProPage(key: string): Promise<ProPageContent | undefined> {
  const hit = cache.get(key);
  if (hit) return hit;
  const load = loaders[`./pages/${key}.ts`];
  if (!load) return undefined;
  const content = await load();
  cache.set(key, content);
  return content;
}

/** Synchronous read once loadProPage has resolved. */
export const cachedProPage = (key: string) => cache.get(key);
