// Home page copy for the blocks refreshed with the 2026-11 product content (six product families, DIGIT Pro V4
// workspaces and pages, HR and Construction section pages, delivery stages, demo vs quote). Every statement reuses
// wording already approved elsewhere on the site (catalog, Pro V4 pages, HR handoff, corporate profile); nothing here
// is a price, a certification, a guarantee or a new product claim. Workspace questions are kept in sync with the
// Pro pages by a test (src/test/home-content.test.ts).
import type { L } from '@/content/catalog';
import type { ProductKey } from '@/content/catalog';
import { REPORTS } from '@/content/pro/reports';

const t = (ar: string, en: string): L => ({ ar, en });

/* ----------------------------------------- Trust strip ----------------------------------------- */

export type TrustIcon = 'customers' | 'products' | 'reports' | 'einvoice' | 'bilingual' | 'delivery';
export const TRUST_ITEMS: { icon: TrustIcon; label: L }[] = [
  { icon: 'customers', label: t('أكثر من 50 منشأة سعودية', 'More than 50 Saudi businesses') },
  { icon: 'products', label: t('6 منتجات على منصة واحدة', '6 products on one platform') },
  { icon: 'reports', label: t(`${REPORTS.length} تقريرًا جاهزًا للتشغيل`, `${REPORTS.length} reports ready to run`) },
  { icon: 'einvoice', label: t('يدعم الربط مع منظومة فاتورة', 'Supports linking with Fatoora') },
  { icon: 'bilingual', label: t('عربي وإنجليزي، هجري وميلادي', 'Arabic & English, Hijri & Gregorian') },
  { icon: 'delivery', label: t('تنفيذ بست مراحل وقبول موقّع', 'Six-stage delivery, signed acceptance') },
];

/* ---------------------------- Journey: one operation, four angles ---------------------------- */

export type JourneyStep = {
  /** DIGIT Pro V4 workspace or section id; the question below is the one on that page. */
  ws: string;
  page: string;
  label: L;
  question: L;
  lede: L;
  roles: L[];
  shot: string;
  open: L;
};

export const JOURNEY = {
  eyebrow: t('رحلة المستند والقرار', 'Document to decision'),
  heading: t('نفس العمل. أربع زوايا أوضح.', 'One operation. Four clearer perspectives.'),
  lede: t(
    'طلب عميل واحد يمر على المبيعات والمخزون والمالية والإدارة. كل إدارة تراه من مساحة عملها في DIGIT Pro، وكل رقم يرجع إلى مستنده.',
    'One customer order passes through sales, stock, finance and management. Each department sees it from its own DIGIT Pro workspace, and every number goes back to its document.',
  ),
  step: t('الزاوية', 'Angle'),
  of: t('من', 'of'),
  question: t('سؤال المساحة', 'The workspace question'),
  roles: t('لمن', 'For'),
  next: t('الزاوية التالية', 'Next angle'),
  prev: t('الزاوية السابقة', 'Previous angle'),
  all: t('كل مساحات العمل العشرين', 'All twenty workspaces'),
};

export const JOURNEY_STEPS: JourneyStep[] = [
  {
    ws: 'SEL-CUSTOMER',
    page: '/modules/sales',
    label: t('المبيعات', 'Sales'),
    question: t('من هو العميل وراء هذه المعاملة؟', 'Who is the customer behind this transaction?'),
    lede: t('العميل حساب واحد يجمع التجارة والائتمان والتحصيل والتسعير، يظهر لكل دور بحسب صلاحيته.', 'The customer as one account that brings trade, credit, collection and pricing together, shown to each role according to its permissions.'),
    roles: [t('مدير الحساب', 'Account manager'), t('مراقب الائتمان', 'Credit controller')],
    shot: '04-360-01-sl1',
    open: t('افتح مساحة ملف العميل', 'Open the customer workspace'),
  },
  {
    ws: 'INV-MASTER',
    page: '/modules/inventory',
    label: t('المخزون', 'Stock'),
    question: t('كم المتاح فعليًا لهذا الطلب؟', 'How much is really available for this order?'),
    lede: t('تجميع بيانات الصنف والمستودع والحجز والتوفر والطلب في مكان واحد، لكل مستودع على حدة.', 'Bring item, warehouse, reservation, availability and demand together in one place, warehouse by warehouse.'),
    roles: [t('مراقب المخزون', 'Inventory controller'), t('المبيعات', 'Sales')],
    shot: '04-360-03-in2',
    open: t('افتح مساحة الصنف والتوفر', 'Open the item & availability workspace'),
  },
  {
    ws: 'ACC-DUES',
    page: '/modules/accounting',
    label: t('المالية', 'Finance'),
    question: t('أي الديون متأخر، وما الذي يمكن تحصيله فعلًا؟', 'Which debts are overdue, and what can actually be collected?'),
    lede: t('متابعة الذمم المدينة والدائنة والتحصيل والمدفوعات وحالات التخصيص، مع الفصل بين المتأخر الإجمالي وصافي القابل للتحصيل.', 'Follow receivables, payables, collections, payments and allocation, keeping gross overdue apart from what is net collectible.'),
    roles: [t('محاسب الذمم', 'AR/AP accountant'), t('مسؤول التحصيل', 'Collections officer'), t('المراقب المالي', 'Financial controller')],
    shot: '02-cash-01-f9',
    open: t('افتح مساحة الذمم والتحصيل', 'Open the receivables workspace'),
  },
  {
    ws: 'q-EXE-01',
    page: '/pro/cfo-decisions',
    label: t('الإدارة', 'Management'),
    question: t('كيف يتحرك الإيراد ومجمل الربح؟', 'How are revenue and gross margin moving?'),
    lede: t('من فواتير المبيعات المرحّلة وتكلفة البضاعة المباعة إلى لوحات المدير المالي، والقرار: أين نركز البيع، وأين نراجع التسعير.', 'From posted sales invoices and cost of goods sold to the CFO boards, and the decision: where to focus selling, and where to revisit pricing.'),
    roles: [t('المدير العام', 'General manager'), t('المدير المالي', 'CFO')],
    shot: '01-cfo-01-e1',
    open: t('افتح أسئلة المدير المالي', 'Open the CFO questions'),
  },
];

/** Workspace or question anchor on the page that owns the step. */
export const journeyHref = (s: JourneyStep) => `${s.page}#pv-${s.ws}`;

/* ---------------------------------- Chaos to control ---------------------------------- */

export const CHAOS = {
  eyebrow: t('التحدّي', 'The challenge'),
  heading: t('من الفوضى… إلى التحكّم', 'From chaos… to control'),
  lede: t(
    'المشكلة ليست عدد الأنظمة… بل ما يحدث بين الإدارات. DIGIT يربطها على قاعدة واحدة، ولكل منتج مستنداته ومسؤولياته.',
    'The problem isn’t the number of systems… it’s what happens between departments. DIGIT connects them on one base, with each product owning its documents and responsibilities.',
  ),
  card: t('منصة واحدة · ستة منتجات', 'One platform · six products'),
  via: t('عبر', 'via'),
};

export const CHAOS_PAINS: L[] = [
  t('طلب عميل بلا حالة واضحة', 'A customer request with no clear status'),
  t('استلام غير مرتبط بالفاتورة', 'A goods receipt not linked to the invoice'),
  t('رصيد بلا مستند أصل', 'A balance with no source document'),
  t('موافقة خارج مسار العمل', 'An approval outside the workflow'),
  t('مستخلص مشروع في ملف منفصل عن المحاسبة', 'A project claim in a file apart from accounting'),
  t('زيارة صيانة بلا سجل ولا إغلاق مؤكد', 'A service visit with no record and no verified closure'),
];

export const CHAOS_ROWS: { product: ProductKey; label: L; status: L }[] = [
  { product: 'pro', label: t('المالية والتشغيل', 'Finance & operations'), status: t('كل رقم بمستنده', 'Every number has its document') },
  { product: 'hr', label: t('الموارد البشرية', 'Human resources'), status: t('من الهيكل حتى الحوكمة', 'From structure to governance') },
  { product: 'construction', label: t('المقاولات', 'Construction'), status: t('من المقايسة إلى التحصيل', 'From BOQ to collection') },
  { product: 'crm', label: t('علاقات العملاء', 'Customer relationships'), status: t('من العميل المحتمل إلى الصفقة', 'From lead to deal') },
  { product: 'fsm', label: t('الخدمة والفحص الميداني', 'Field service & inspection'), status: t('من العقد إلى الإغلاق المؤكد', 'From agreement to verified closure') },
  { product: 'pos', label: t('نقاط البيع', 'Point of sale'), status: t('من الكاشير إلى عمليات الشركة', 'From the till to company operations') },
];

/* ------------------------------------- Modules ------------------------------------- */

export const MODULES = {
  eyebrow: t('المنتجات والأقسام', 'Products & departments'),
  heading: t('منصة واحدة… لكل إدارات شركتك', 'One platform… for every department'),
  lede: t(
    'ستة منتجات على قاعدة بيانات مشتركة. افتح أي قسم لترى مساحات عمله وشاشاته، أو ابدأ من صفحة المنتج.',
    'Six products on one shared database. Open any department to see its workspaces and screens, or start from the product page.',
  ),
  more: t('عرض المزيد', 'Learn more'),
  departments: t('أقسام', 'departments'),
  areas: t('مجالات', 'areas'),
  activities: t('أنشطة', 'activities'),
  also: t('وكمان في DIGIT Pro', 'Also in DIGIT Pro'),
  extra: t('أنظمة إضافية', 'More systems'),
};

/* ----------------------------------- Capabilities ----------------------------------- */

export type CapabilityIcon = '360' | 'documents' | 'approvals' | 'permissions' | 'dashboards' | 'reports';
export const CAPABILITIES = {
  eyebrow: t('القدرات', 'Capabilities'),
  heading: t('قدرات تمتد عبر النظام كله.', 'Capabilities that run across the whole system.'),
  lede: t('ليست موديولات مستقلة — بل أساس مشترك يختصر الطريق من المعلومة إلى الإجراء.', 'Not separate modules — a shared foundation that shortens the path from information to action.'),
  open: t('اعرف أكثر', 'Learn more'),
};
export const CAPABILITY_CARDS: { icon: CapabilityIcon; title: L; body: L; href: string }[] = [
  { icon: '360', title: t('رؤية 360', '360° views'), body: t('العميل والمورد والصنف والأصل في صفحة واحدة، حسب صلاحية من يفتحها.', 'Customer, supplier, item and asset on one page, per the viewer’s permissions.'), href: '/pro/capabilities' },
  { icon: 'documents', title: t('مستندات مترابطة', 'Connected documents'), body: t('شريط مراحل يوضّح أين يقف المستند الآن، والمستندات المرتبطة به بعدّاد.', 'A stage strip shows where the document stands now, with its related documents and their counts.'), href: '/pro/capabilities' },
  { icon: 'approvals', title: t('الاستثناءات والاعتمادات', 'Exceptions & approvals'), body: t('صندوق اعتمادات موحد، وشارات تُظهر ما يحتاج انتباهًا على القائمة.', 'A unified approvals inbox, and badges that show what needs attention in the menu.'), href: '/pro/settings-governance' },
  { icon: 'permissions', title: t('الصلاحيات والحوكمة', 'Permissions & governance'), body: t('نفس الصفحة تُظهر لكل دور ما يحق له فقط، وفهرس التقارير يتبع الصلاحية.', 'The same page shows each role only what it is entitled to, and the report directory follows permission.'), href: '/pro/settings-governance' },
  { icon: 'dashboards', title: t('لوحات الإدارة', 'Management dashboards'), body: t('مؤشرات وتنبيهات لحظية مبنية على بيانات نظامك، ولكل بطاقة تعريف ومصدر.', 'Real-time indicators and alerts built on your system’s data, with a definition and source on every card.'), href: '/pro/executive-dashboards' },
  { icon: 'reports', title: t('مركز التقارير', 'Report center'), body: t(`${REPORTS.length} تقريرًا جاهزًا للتشغيل، مرتبة حسب السؤال والإدارة.`, `${REPORTS.length} reports ready to run, arranged by question and department.`), href: '/modules/reports' },
];

/* ------------------------------------ Challenges ------------------------------------ */

export const PROBLEMS = {
  eyebrow: t('التحدّي', 'The challenge'),
  heading: t('وداعاً لمشاكل الأنظمة التقليدية', 'Goodbye to the problems of traditional systems'),
  lede: t('لكل ألمٍ تعرفه في أنظمة ERP… إجابة واضحة داخل DIGIT، وصفحة تشرحها بالتفصيل.', 'For every pain you know from ERP systems… a clear answer inside DIGIT, and a page that explains it in detail.'),
  today: t('ما تعانيه اليوم', 'What you face today'),
  with: t('مع DIGIT', 'With DIGIT'),
  prev: t('السابق', 'Previous'),
  next: t('التالي', 'Next'),
  slide: t('الشريحة', 'Slide'),
};

/** `key` is stable for screenshots (PROBLEM_SHOTS) and tests; copy can change without touching the mapping. */
export const PROBLEM_SLIDES: { key: string; tag: L; pain: L; sol: L; href: string; link: L }[] = [
  { key: 'pricing', tag: t('التسعير', 'Pricing'), pain: t('سعر غير واضح قبل معرفة النطاق', 'A price that isn’t clear before the scope is'), sol: t('نطاق معتمد أولًا، ثم عرض سعر يوضّح البنود', 'An approved scope first, then a quotation that itemizes it'), href: '/quote', link: t('اطلب عرض سعر', 'Request a quote') },
  { key: 'implementation', tag: t('التطبيق', 'Implementation'), pain: t('تطبيق طويل بلا مخرجات واضحة', 'A long implementation with no clear outputs'), sol: t('ست مراحل، لكل مرحلة مخرج، وتنتهي بقبول موقّع', 'Six stages, each with an output, ending in signed acceptance'), href: '/services-3/implementation', link: t('مراحل التنفيذ', 'Delivery stages') },
  { key: 'interface', tag: t('الواجهة', 'Interface'), pain: t('واجهات معقّدة لا تبدأ من عملك', 'Complex screens that don’t start from your work'), sol: t('مساحات عمل تبدأ بسؤال دورك', 'Workspaces that start from your role’s question'), href: '/pro', link: t('مساحات DIGIT Pro', 'DIGIT Pro workspaces') },
  { key: 'reports', tag: t('التقارير', 'Reports'), pain: t('تقارير متأخّرة للإدارة', 'Late reports for management'), sol: t(`${REPORTS.length} تقريرًا جاهزًا حسب السؤال والإدارة`, `${REPORTS.length} ready reports by question and department`), href: '/modules/reports', link: t('مركز التقارير', 'Report center') },
  { key: 'approvals', tag: t('الاعتمادات', 'Approvals'), pain: t('موافقات بطيئة خارج النظام', 'Slow approvals outside the system'), sol: t('صندوق اعتمادات موحد داخل مسار العمل', 'A unified approvals inbox inside the workflow'), href: '/pro/settings-governance', link: t('الإعدادات والحوكمة', 'Settings & governance') },
  { key: 'einvoicing', tag: t('الفوترة', 'E-invoicing'), pain: t('الفوترة الإلكترونية عبء منفصل', 'E-invoicing as a separate burden'), sol: t('يدعم الربط مع منظومة الفوترة الإلكترونية (فاتورة)', 'Supports linking with the e-invoicing system (Fatoora)'), href: '/modules/e-invoicing-zatca', link: t('الفوترة الإلكترونية', 'E-invoicing') },
  { key: 'projects', tag: t('المشاريع', 'Projects'), pain: t('مستخلصات المشاريع بعيدة عن المحاسبة', 'Project claims kept away from accounting'), sol: t('من المقايسة إلى التحصيل في سياق مشروع واحد', 'From BOQ to collection in one project context'), href: '/modules/contracting', link: t('DIGIT Construction', 'DIGIT Construction') },
  { key: 'spreadsheets', tag: t('التكامل', 'Integration'), pain: t('اعتماد زائد على الإكسل', 'Too much reliance on spreadsheets'), sol: t('بياناتك في نظام واحد مترابط', 'Your data in one connected system'), href: '/blueprint', link: t('صمّم منظومتك', 'Design your system') },
];

/* ------------------------------------ Industries ------------------------------------ */

export const INDUSTRIES_COPY = {
  eyebrow: t('القطاعات', 'Industries'),
  heading: t('مصمَّم لقطاع عملك', 'Designed for your industry'),
  lede: t('لكل قطاع منتجاته المناسبة — من المقاولات والتوزيع إلى التجزئة والخدمة الميدانية.', 'Each industry gets the products that fit it — from construction and distribution to retail and field service.'),
  products: t('المنتجات', 'Products'),
  more: t('اعرف أكثر', 'Learn more'),
};

export const INDUSTRY_TILES: { title: L; sub: L; desc: L; products: ProductKey[]; img: string; href: string }[] = [
  { title: t('المقاولات', 'Construction'), sub: t('المقايسة · العقد · المستخلص', 'BOQ · Contract · Claim'), desc: t('من المقايسة إلى التحصيل في سياق مشروع واحد: العقد والتنفيذ والتكلفة والمستخلصات، مرتبطة بمحاسبتك.', 'From BOQ to collection in one project context: contract, execution, cost and claims, connected to your accounting.'), products: ['construction', 'pro'], img: '/images/contracting.jpg', href: '/industries/contracting-industry' },
  { title: t('التصنيع', 'Manufacturing'), sub: t('مواد · مخزون · تكلفة', 'Materials · Stock · Cost'), desc: t('مشتريات ومخزون ومبيعات مرتبطة بالمحاسبة، ونحدّد معك نطاق التصنيع المناسب في العرض التوضيحي.', 'Purchasing, stock and sales connected to accounting, and we define the right manufacturing scope with you in the demo.'), products: ['pro'], img: '/images/man.jpg', href: '/industries/manufacturing-industry' },
  { title: t('التجزئة', 'Retail'), sub: t('كاشير متصل · فروع', 'Connected till · Branches'), desc: t('نقاط بيع تربط المبيعات بالمخزون والمحاسبة لحظيًا عبر فروعك، و12 نشاط تجزئة في مستكشف الأنشطة.', 'Point of sale linking sales to stock and accounting in real time across branches, with 12 retail segments in the explorer.'), products: ['pos', 'pro'], img: '/images/retail.jpg', href: '/industries/retail' },
  { title: t('التجارة والتوزيع', 'Trade & distribution'), sub: t('مستودعات · عملاء · تحصيل', 'Warehouses · Customers · Collection'), desc: t('مخزون متعدد المستودعات، ومسار من العميل المحتمل إلى الصفقة، وتحصيل يُقرأ من الذمم مباشرة.', 'Multi-warehouse stock, a path from lead to deal, and collections read straight from receivables.'), products: ['pro', 'crm'], img: '/images/dis.jpg', href: '/industries/distribution' },
  { title: t('العقارات', 'Real estate'), sub: t('عقود · تحصيل · تكاليف', 'Contracts · Collection · Costs'), desc: t('العقود والتحصيل وتكاليف المشاريع العقارية، ومحاسبة وفوترة على منصة واحدة.', 'Contracts, collection and property project costs, with accounting and invoicing on one platform.'), products: ['pro', 'construction'], img: '/images/rs.jpg', href: '/industries/real-estate-2' },
  { title: t('القطاع الطبي', 'Healthcare'), sub: t('صيدليات · دفعات وصلاحية', 'Pharmacies · Batches & expiry'), desc: t('نقاط بيع للصيدليات بتتبّع الدفعات والصلاحية، ومخزون أدوية ومستلزمات مرتبط بالحسابات.', 'Pharmacy point of sale with batch and expiry tracking, and medicine and supplies stock linked to the accounts.'), products: ['pos', 'pro'], img: '/images/med.jpg', href: '/industries/healthcare' },
  { title: t('التعليمي', 'Education'), sub: t('مدارس ومراكز تدريب', 'Schools & training centres'), desc: t('الإيرادات والمصروفات والتقارير، وملفات الموظفين والرواتب، بنطاق نحدّده مع مؤسستك.', 'Revenue, expenses and reports, plus staff files and payroll, in a scope we define with your institution.'), products: ['pro', 'hr'], img: '/images/edu.jpg', href: '/industries/education' },
  { title: t('الخدمة والصيانة', 'Service & maintenance'), sub: t('زيارات · فحص · إغلاق مؤكد', 'Visits · Inspection · Verified closure'), desc: t('من العقد إلى الزيارة والفحص والعيب وإعادة الاختبار، حتى إغلاق مؤكد له تاريخ ومسؤول ومستند.', 'From agreement to visit, inspection, deficiency and retest, through to a verified closure with a date, an owner and a document.'), products: ['fsm'], img: '/images/om.jpg', href: '/modules/fsm-itm' },
];

/* -------------------------------- Saudi localization -------------------------------- */

export const SAUDI = {
  eyebrow: t('التوطين السعودي', 'Saudi localization'),
  heading: t('مصمَّم للسوق السعودي… من الفاتورة إلى الرواتب', 'Built for the Saudi market… from invoice to payroll'),
  lede: t(
    'الفوترة الإلكترونية وضريبة القيمة المضافة والتقويم الهجري والواجهة العربية داخل المنتج، ونوضّح لكل منشأة ما هو جاهز وما يحتاج إعدادًا.',
    'E-invoicing, VAT, the Hijri calendar and an Arabic interface inside the product, and we show each business what is ready and what needs set-up.',
  ),
  panel: t('فاتورة ضريبية', 'Tax invoice'),
  example: t('مثال توضيحي', 'Illustrative example'),
  badge: t('يدعم الربط مع فاتورة', 'Supports Fatoora linking'),
  net: t('الإجمالي قبل الضريبة', 'Total before VAT'),
  vat: t('ضريبة القيمة المضافة 15%', 'VAT 15%'),
  total: t('الإجمالي', 'Total'),
  checks: [t('رمز QR على الفاتورة', 'QR code on the invoice'), t('احتساب وتقارير الضريبة', 'Tax calculation and reports'), t('تواريخ هجرية وميلادية', 'Hijri and Gregorian dates')],
  onboarding: t('تجهيز الربط مع منظومة فاتورة', 'Getting set up with Fatoora'),
  onboardingHref: '/services-3/zatca-onboarding',
};

export const SAUDI_TILES: { title: L; desc: L; icon: string; href?: string }[] = [
  { title: t('الفوترة الإلكترونية (فاتورة)', 'E-invoicing (Fatoora)'), desc: t('يدعم الربط مع منظومة الفوترة الإلكترونية.', 'Supports linking with the e-invoicing system.'), icon: '/icons/digit-mod-einvoice-dark-1.svg', href: '/modules/e-invoicing-zatca' },
  { title: t('تقارير ضريبة القيمة المضافة', 'VAT reports'), desc: t('تقارير ضريبية جاهزة ضمن مركز التقارير.', 'Ready tax reports in the report center.'), icon: '/icons/digit-mod-reports-dark-1.svg', href: '/modules/reports' },
  { title: t('الرواتب والجهات الرسمية', 'Payroll & official bodies'), desc: t('بيانات وسياسات الرواتب السعودية ضمن الإعداد، وتُؤكَّد القواعد والتكامل لكل منشأة.', 'Saudi payroll data and policies are part of set-up; rules and integration are confirmed for each business.'), icon: '/icons/digit-loc-gosi-dark-1.svg', href: '/hr/payroll-rewards' },
  { title: t('الهجري والميلادي', 'Hijri & Gregorian'), desc: t('التاريخ بالتقويمين في الشاشات.', 'Dates in both calendars on screen.'), icon: '/icons/digit-ui-calendar-dark.svg' },
  { title: t('واجهة عربية وإنجليزية', 'Arabic & English interface'), desc: t('من اليمين لليسار بالعربية، ومن اليسار لليمين بالإنجليزية.', 'Right-to-left in Arabic, left-to-right in English.'), icon: '/icons/digit-loc-bilingual-dark-1.svg' },
  { title: t('شجرة حسابات سعودية', 'Saudi chart of accounts'), desc: t('شجرة حسابات معدّة للسوق.', 'A chart of accounts prepared for the market.'), icon: '/icons/digit-mod-accounts-dark-1.svg' },
  { title: t('الموارد البشرية بالعربي', 'HR in Arabic'), desc: t('سبعة مجالات من الهيكل التنظيمي حتى الحوكمة.', 'Seven areas, from organization structure to governance.'), icon: '/icons/digit-loc-mudad-dark-1.svg', href: '/modules/hr-payroll' },
  { title: t('دعم محلي', 'Local support'), desc: t('دعم بالعربي، بمستوى خدمة واضح بعد الإطلاق.', 'Support in Arabic, with a clear service level after go-live.'), icon: '/icons/digit-loc-support-dark-1.svg', href: '/support' },
  { title: t('تعدد العملات', 'Multi-currency'), desc: t('مناسب للتعامل مع دول الخليج.', 'Suited to trading across the Gulf.'), icon: '/icons/digit-loc-currency-dark-1.svg' },
];

/* ---------------------------------------- FAQ ---------------------------------------- */

export const FAQ_COPY = {
  eyebrow: t('الأسئلة الشائعة', 'FAQ'),
  heading: t('أسئلة قبل أن تقرّر — إجابات مباشرة', 'Questions before you decide — straight answers'),
  lede: t('أكثر ما يسأل عنه مديرو الشركات قبل اختيار نظام ERP.', 'What business leaders ask most before choosing an ERP.'),
  side: t('لم تجد إجابتك؟', 'Didn’t find your answer?'),
  sideBody: t('تحدّث مع فريقنا: عرض توضيحي على سيناريو من عملك، أو عرض سعر لنطاقك.', 'Talk to our team: a demo on a scenario from your business, or a quotation for your scope.'),
  demo: t('احجز عرضًا توضيحيًا', 'Book a demo'),
  quote: t('اطلب عرض سعر', 'Request a quote'),
  whatsapp: t('تواصل عبر واتساب', 'Chat on WhatsApp'),
  all: t('كل الأسئلة الشائعة', 'All FAQs'),
};

/** Shown on the home page and published as its FAQPage structured data, so the two never diverge. */
export const HOME_FAQ: { q: L; a: L }[] = [
  { q: t('ماذا يقدّم DIGIT؟', 'What does DIGIT offer?'), a: t('منصة أعمال سعودية بستة منتجات على قاعدة بيانات مشتركة: DIGIT Pro للمالية والتشغيل، وDIGIT HR للموارد البشرية، وDIGIT Construction للمقاولات، وDIGIT CRM لعلاقات العملاء، وDIGIT FSM + ITM للخدمة والفحص الميداني، وDIGIT POS لنقاط البيع.', 'A Saudi business platform with six products on one shared database: DIGIT Pro for finance and operations, DIGIT HR for human resources, DIGIT Construction, DIGIT CRM for customer relationships, DIGIT FSM + ITM for field service and inspection, and DIGIT POS for point of sale.') },
  { q: t('هل أحتاج كل المنتجات؟', 'Do I need every product?'), a: t('لا. اختر المنتج حسب دورة العمل، وليس حسب عدد التطبيقات. ابدأ بما تحتاجه الآن، وأضف غيره لاحقًا بنطاق جديد.', 'No. Choose the product by the work cycle, not by the number of applications. Start with what you need now and add others later with a new scope.') },
  { q: t('هل يدعم الفوترة الإلكترونية؟', 'Does it support e-invoicing?'), a: t('نعم، يدعم DIGIT الربط مع منظومة الفوترة الإلكترونية (فاتورة)، ونجهّز الربط حسب احتياج منشأتك.', 'Yes. DIGIT supports linking with the e-invoicing system (Fatoora), and we set up the link to suit your business.') },
  { q: t('ماذا عن الرواتب والتأمينات وحماية الأجور؟', 'What about payroll, GOSI and wage protection?'), a: t('يغطي DIGIT HR دورة الرواتب والمكافآت، وتُضبط البيانات والسياسات السعودية ضمن الإعداد. لا نعلن مطابقة رسمية لأي قاعدة قبل حزمة قواعد وتكامل مثبت، ونؤكد النطاق الفعلي لمنشأتك في جلسة الاكتشاف.', 'DIGIT HR covers the payroll and rewards cycle, and Saudi data and policies are configured during set-up. We don’t claim official compliance for any rule before a rule package and a proven integration exist, and we confirm the actual scope for your business in the discovery session.') },
  { q: t('هل يناسب شركات المقاولات؟', 'Does it suit construction companies?'), a: t('نعم. DIGIT Construction يربط المقايسة والعقد والتنفيذ والمستخلصات والتحصيل في سياق مشروع واحد، مرتبط بمحاسبتك.', 'Yes. DIGIT Construction links the BOQ, contract, execution, claims and collection in one project context, connected to your accounting.') },
  { q: t('كيف يُسعَّر النظام؟', 'How is it priced?'), a: t('بعرض سعر مخصص بعد تحديد النطاق: التطبيقات والوحدات والفروع والمستخدمين والتقارير. إذا لم يكن النطاق واضحًا، فالسعر ليس واضحًا.', 'With a custom quotation once the scope is set: applications, modules, branches, users and reports. If the scope isn’t clear, the price isn’t clear.') },
  { q: t('كم يستغرق التطبيق؟', 'How long does implementation take?'), a: t('يمر التنفيذ بست مراحل: الاكتشاف، والنطاق، والبيانات، والتهيئة، والتدريب، والإطلاق مع القبول. وتُحدَّد المدة في النطاق حسب حجم بياناتك والتطبيقات المختارة.', 'Delivery runs through six stages: discovery, scope, data, configuration, training, and go-live with acceptance. The duration is set in the scope, based on your data and the applications chosen.') },
  { q: t('هل يشمل الاشتراك التدريب والدعم؟', 'Does the subscription include training and support?'), a: t('التدريب والدعم كما تذكره وثيقة العرض السارية لباقتك. أما التخصيص والتكامل وترحيل البيانات فخدمات لكلٍّ منها نطاق مستقل.', 'Training and support are as stated in the current offer for your package. Customization, integration and data migration are services, each with its own scope.') },
  { q: t('هل يمكن نقل البيانات من Excel أو نظام سابق؟', 'Can we move data from Excel or a previous system?'), a: t('نعم. ترحيل البيانات مرحلة لها خطة ومسؤوليات ومعايير قبول، من الإكسل أو نظامك السابق.', 'Yes. Data migration is a stage with its own plan, owners and acceptance criteria, from Excel or your previous system.') },
  { q: t('ما الفرق بين العرض التوضيحي وعرض السعر؟', 'What is the difference between a demo and a quote?'), a: t('العرض التوضيحي جلسة تشاهد فيها DIGIT على سيناريو من عملك. أما عرض السعر فيبدأ بتحديد النطاق ثم مقترح معتمد. ولكلٍّ منهما نموذجه في الموقع.', 'A demo is a session where you see DIGIT on a scenario from your business. A quote starts by defining the scope, then an approved proposal. Each has its own form on the site.') },
];

/* ------------------------------------- Final CTA ------------------------------------- */

export const FINAL = {
  heading: t('جاهز تشوف كيف يناسب النظام شركتك؟', 'Ready to see how DIGIT fits your company?'),
  lede: t('احجز عرضًا توضيحيًا على سيناريو من عملك، أو اطلب عرض سعر لنطاقك، أو ارسم منظومتك أولًا — بلا التزام.', 'Book a demo on a scenario from your business, request a quote for your scope, or sketch your system first — no commitment.'),
  demo: t('احجز عرضًا توضيحيًا', 'Book a demo'),
  quote: t('اطلب عرض سعر', 'Request a quote'),
  blueprint: t('صمّم منظومتك', 'Design your system'),
};

/* -------------------------------------- Lead form -------------------------------------- */

export const HOME_LEAD = t('كل منتجات DIGIT', 'All DIGIT products');

/* ------------------------------ Explorer: start from your role ------------------------------ */

/**
 * A link in the role finder: a DIGIT Pro workspace or CFO question (`page` + `ws`, label = that page's question),
 * a catalog department or POS activity (`dept`, resolved through the catalog so an unpublished page opens its hub
 * card), or a plain page (`href`).
 */
export type ExplorerLink =
  | { kind: 'question'; page: string; ws: string; label: L }
  | { kind: 'dept'; product: ProductKey; id: string }
  | { kind: 'page'; href: string; label: L };

export type ExplorerRole = { id: string; product: ProductKey | 'all'; label: L; start: L; links: ExplorerLink[] };

const q = (page: string, ws: string, ar: string, en: string): ExplorerLink => ({ kind: 'question', page, ws, label: t(ar, en) });
const d = (product: ProductKey, id: string): ExplorerLink => ({ kind: 'dept', product, id });
const pg = (href: string, ar: string, en: string): ExplorerLink => ({ kind: 'page', href, label: t(ar, en) });
const CFO = '/pro/cfo-decisions';

export const EXPLORER = {
  eyebrow: t('ابدأ من دورك', 'Start from your role'),
  heading: t('ابدأ من شغلك، مش من اسم البرنامج', 'Start with your work, not a software name'),
  lede: t('اختر دورك لترى الأسئلة التي يجيب عنها DIGIT والصفحات التي تبدأ منها.', 'Choose your role to see the questions DIGIT answers and the pages to start from.'),
  roles: t('الأدوار', 'Roles'),
  question: t('سؤال', 'Question'),
  page: t('صفحة', 'Page'),
  product: t('المنتج', 'Product'),
  demo: t('احجز عرضًا توضيحيًا لهذا الدور', 'Book a demo for this role'),
  search: t('ابحث عن قسم أو سؤال', 'Find a department or question'),
  placeholder: t('محاسبة، رواتب، مستخلصات، مخزون…', 'Accounting, payroll, claims, stock…'),
  results: t('نتيجة', 'results'),
  none: t('لا توجد نتيجة. جرّب كلمة أخرى، أو اختر دورك.', 'No results. Try another word, or choose your role.'),
  clear: t('مسح البحث', 'Clear search'),
};

export const EXPLORER_ROLES: ExplorerRole[] = [
  { id: 'cfo', product: 'pro', label: t('المدير المالي', 'CFO'), start: t('اثنا عشر سؤالًا تنفيذيًا، لكل سؤال مصدره والقرار الذي يدعمه.', 'Twelve executive questions, each with its source and the decision it supports.'), links: [
    q(CFO, 'q-EXE-02', 'ما وضع السيولة والاستحقاقات القادمة؟', 'What is our liquidity and upcoming due-date exposure?'),
    q(CFO, 'q-EXE-12', 'هل نحن جاهزون لإقفال الفترة؟', 'Are we ready to close the period?'),
    pg('/pro/executive-dashboards', 'لوحات الإدارة', 'Management dashboards'),
    pg('/modules/reports', 'مركز التقارير', 'Report center'),
  ] },
  { id: 'controller', product: 'pro', label: t('المراقب المالي', 'Financial controller'), start: t('الذمم وقيمة المخزون والأصول، قبل الإقفال.', 'Receivables, stock value and assets, before close.'), links: [
    q('/modules/accounting', 'ACC-DUES', 'أي الديون متأخر، وما الذي يمكن تحصيله فعلًا؟', 'Which debts are overdue, and what can actually be collected?'),
    q(CFO, 'q-EXE-09', 'هل قيمة المخزون مطابقة للأستاذ العام؟', 'Does stock value agree with the general ledger?'),
    q(CFO, 'q-EXE-10', 'ما صافي القيمة الدفترية للأصول، وهل الإهلاك مرحّل؟', 'What is the assets’ net book value, and is depreciation posted?'),
    d('pro', 'fixed-assets'),
  ] },
  { id: 'sales', product: 'pro', label: t('مدير المبيعات', 'Sales manager'), start: t('من ملف العميل إلى التسليم والفوترة.', 'From the customer file to delivery and invoicing.'), links: [
    q('/modules/sales', 'SEL-CUSTOMER', 'من هو العميل وراء هذه المعاملة؟', 'Who is the customer behind this transaction?'),
    q(CFO, 'q-EXE-03', 'ما الذي بعناه ولم نسلّمه بعد؟', 'What have we sold but not yet delivered?'),
    q(CFO, 'q-EXE-04', 'ما الذي سلّمناه ولم نفوتره؟', 'What have we delivered but not invoiced?'),
    d('pro', 'selling'),
  ] },
  { id: 'buyer', product: 'pro', label: t('مسؤول المشتريات', 'Buyer'), start: t('الالتزامات المفتوحة وما استُلم ولم يُفوتر.', 'Open commitments and what was received but not billed.'), links: [
    q(CFO, 'q-EXE-05', 'ما التزامات الشراء المفتوحة؟', 'What purchase commitments are open?'),
    q(CFO, 'q-EXE-06', 'ما الذي استلمناه ولم يُفوتر لنا؟', 'What have we received but not been billed for?'),
    d('pro', 'purchasing'),
  ] },
  { id: 'warehouse', product: 'pro', label: t('مسؤول المستودع', 'Warehouse lead'), start: t('المتاح والمحجوز والمتوقع، لكل مستودع على حدة.', 'Available, reserved and projected, warehouse by warehouse.'), links: [
    q('/modules/inventory', 'INV-MASTER', 'كم المتاح فعليًا لهذا الطلب؟', 'How much is really available for this order?'),
    q(CFO, 'q-EXE-07', 'كم المتاح والمحجوز والمتوقع من المخزون؟', 'How much stock is available, reserved and projected?'),
    q(CFO, 'q-EXE-08', 'ما المخزون الراكد وما المعرض لانتهاء الصلاحية؟', 'Which stock is ageing or at risk of expiry?'),
    d('pro', 'inventory'),
  ] },
  { id: 'hr', product: 'hr', label: t('مدير الموارد البشرية', 'HR manager'), start: t('دورة الموظف والقوى العاملة في نظام واحد، من الهيكل التنظيمي حتى الحوكمة.', 'The employee and workforce lifecycle in one system, from organization structure to governance.'), links: [
    d('hr', 'core-hr'), d('hr', 'workforce-management'), d('hr', 'payroll-rewards'), d('hr', 'people-intelligence'),
  ] },
  { id: 'projects', product: 'construction', label: t('مدير المشاريع', 'Project director'), start: t('من المقايسة إلى التحصيل في سياق مشروع واحد.', 'From BOQ to collection in one project context.'), links: [
    d('construction', 'projects'), d('construction', 'contracts'), d('construction', 'claims'), d('construction', 'budget-cost'),
  ] },
  { id: 'crm', product: 'crm', label: t('مدير فريق المبيعات', 'Sales team manager'), start: t('من العميل المحتمل إلى الخطوة التالية.', 'From lead to next action.'), links: [
    d('crm', 'leads'), d('crm', 'opportunities'), d('crm', 'accounts'), d('crm', 'sales-management'),
  ] },
  { id: 'retail', product: 'pos', label: t('مدير عمليات التجزئة', 'Retail operations manager'), start: t('من الكاشير إلى عمليات الشركة.', 'From the till to company operations.'), links: [
    pg('/modules/pos', 'DIGIT POS', 'DIGIT POS'), pg('/industries/retail', 'قطاع التجزئة', 'Retail sector'), d('pos', 'pharmacies'), d('pos', 'restaurants-cafes'),
  ] },
  { id: 'service', product: 'fsm', label: t('مدير عمليات الخدمة', 'Service operations manager'), start: t('من العقد إلى الإغلاق المؤكد.', 'From agreement to verified closure.'), links: [
    d('fsm', 'agreements'), d('fsm', 'work-orders'), d('fsm', 'inspection'), d('fsm', 'deficiencies'),
  ] },
  { id: 'owner', product: 'all', label: t('صاحب المنشأة', 'Business owner'), start: t('ابدأ بما تحتاجه الآن، وأضف غيره لاحقًا.', 'Start with what you need now, and add more later.'), links: [
    pg('/blueprint', 'صمّم منظومتك', 'Design your system'), pg('/starter', 'DIGIT Starter', 'DIGIT Starter'), pg('/pro', 'DIGIT Pro', 'DIGIT Pro'), pg('/services-3/implementation', 'مراحل التنفيذ', 'Delivery stages'),
  ] },
];
