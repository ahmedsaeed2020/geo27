// Corporate story and delivery copy adapted from the approved DIGIT Corporate Profile 2026 (pp. 1–5, 32–34, 36) for
// the About, Implementation and Home pages. Meaning is adapted for the web, not pasted page by page; nothing here is a
// price, a guarantee, a certification or a customer claim.
import type { L } from '@/content/specialist/types';
import type { ProductKey } from '@/content/catalog';

const t = (ar: string, en: string): L => ({ ar, en });

export const CORPORATE = {
  kicker: t('منصة أعمال · تطبيقات متخصصة · قدرة على التنفيذ', 'Business platform · Specialist applications · Delivery capability'),
  title: t('منصة أعمال. تطبيقات متخصصة. قدرة على التنفيذ.', 'A business platform. Specialist applications. The capability to deliver.'),
  philosophy: t('نحن لا نبدأ من البرنامج… نبدأ من طريقة عمل المؤسسة.', 'We don’t start from the software… we start from how the organization works.'),
  relation: t(
    'DIGIT هو مسار حلول الأعمال الذي تقدّمه Trilogy: المنصة والتطبيقات من جهة، والخدمات التقنية والتنفيذية من جهة أخرى، وتُحدَّد مسؤوليات كلٍّ منها في العقد.',
    'DIGIT is the business-solutions track offered by Trilogy: the platform and applications on one side, technical and delivery services on the other, with each one’s responsibilities set in the contract.',
  ),
  layersLabel: t('طبقات DIGIT الثلاث', 'The three DIGIT layers'),
  decision: t('العميل لا يشتري برنامجًا… هو يريد تشغيلًا أوضح وقرارًا يمكن إثباته.', 'A customer is not buying software… they want clearer operations and decisions they can prove.'),
  decisionNote: t('المنصة والتطبيقات والخدمات التقنية ليست رخصة واحدة.', 'The platform, the applications and the technical services are not one licence.'),
  includes: t('ما تشمله', 'What it covers'),
  owner: t('المسؤولية', 'Responsibility'),
  explore: t('استكشف', 'Explore'),
} satisfies Record<string, L>;

export type CorporateLayer = { id: 'platform' | 'apps' | 'delivery'; no: string; label: L; en: string; body: L; includes: L[]; owner: L; links: { path: string; label: L; product?: ProductKey }[]; note?: L };

export const CORPORATE_LAYERS: CorporateLayer[] = [
  {
    id: 'platform',
    no: '01',
    label: t('منصة الأعمال', 'Business platform'),
    en: 'Business Platform',
    body: t('سجلات مشتركة للشركة والعميل والمورد والصنف والحساب، ومستندات معاملات واضحة يمكن تتبّعها بين الإدارات.', 'Shared records for company, customer, supplier, item and account, with clear transaction documents you can trace across departments.'),
    includes: [
      t('المرجع المشترك: الشركات والعملاء والموردون والأصناف والحسابات والمستودعات', 'Shared reference: companies, customers, suppliers, items, accounts and warehouses'),
      t('مستندات الأعمال: كل معاملة مستند أصلي يمكن تتبّعه', 'Business documents: every transaction is a source document you can trace'),
      t('القرار والتحكم: أدوار وصلاحيات وموافقات وتقارير وتعمّق إلى المصدر، وفق الإصدار والنطاق', 'Decision and control: roles, permissions, approvals, reports and drill-down to the source, per edition and scope'),
    ],
    owner: t('تُقدَّم مع ترخيص DIGIT وفق الباقة المعتمدة.', 'Provided with the DIGIT licence under the approved package.'),
    links: [
      { path: '/pro', label: t('DIGIT Pro — المالية والتشغيل', 'DIGIT Pro — finance & operations'), product: 'pro' },
      { path: '/modules/reports', label: t('التقارير', 'Reports') },
    ],
  },
  {
    id: 'apps',
    no: '02',
    label: t('التطبيقات المتخصصة', 'Specialist applications'),
    en: 'Specialist Applications',
    body: t('تطبيقات المجال تُبنى فوق القاعدة المشتركة، ولكلٍّ منها مستنداته ومسؤولياته.', 'Domain applications built on the shared base, each with its own documents and responsibilities.'),
    includes: [
      t('المالية والتشغيل، الموارد البشرية، المشاريع والمقاولات', 'Finance & operations, human resources, projects & construction'),
      t('علاقات العملاء، نقاط البيع، الخدمة والفحص الميداني', 'Customer relationships, point of sale, field service & inspection'),
    ],
    owner: t('نطاق التطبيقات المتخصصة وتجهيزاتها التجارية منفصل عن ترخيص Pro القياسي.', 'Specialist application scope and commercial set-up are separate from the standard Pro licence.'),
    links: [
      { path: '/pro', label: t('DIGIT Pro', 'DIGIT Pro'), product: 'pro' },
      { path: '/modules/hr-payroll', label: t('DIGIT HR', 'DIGIT HR'), product: 'hr' },
      { path: '/modules/contracting', label: t('DIGIT Construction', 'DIGIT Construction'), product: 'construction' },
      { path: '/modules/crm', label: t('DIGIT CRM', 'DIGIT CRM'), product: 'crm' },
      { path: '/modules/pos', label: t('DIGIT POS', 'DIGIT POS'), product: 'pos' },
      { path: '/modules/fsm-itm', label: t('DIGIT FSM + ITM', 'DIGIT FSM + ITM'), product: 'fsm' },
    ],
  },
  {
    id: 'delivery',
    no: '03',
    label: t('التقنية والتنفيذ', 'Technology & delivery'),
    en: 'Technology & Delivery',
    body: t('تحليل المتطلبات وهندسة الحل والتكامل وترحيل البيانات، وخدمات البنية التحتية والأمن ضمن نطاق Trilogy.', 'Requirements analysis, solution design, integration and data migration, plus infrastructure and security services within Trilogy’s scope.'),
    includes: [
      t('اكتشاف ونطاق وبيانات وتهيئة وتدريب وإطلاق مع قبول', 'Discovery, scope, data, configuration, training and go-live with acceptance'),
      t('التكامل وترحيل البيانات والتخصيص بنطاق مستقل لكل منها', 'Integration, data migration and customization, each separately scoped'),
      t('البنية التحتية والسحابة والأمن والاستمرارية من خدمات Trilogy التقنية', 'Infrastructure, cloud, security and continuity from Trilogy technical services'),
    ],
    owner: t('تُحدَّد بنطاق تجاري مستقل؛ ليست جزءًا تلقائيًا من اشتراك DIGIT.', 'Set under a separate commercial scope; not automatically part of a DIGIT subscription.'),
    links: [
      { path: '/services-3/implementation', label: t('التنفيذ والتسليم', 'Implementation & delivery') },
      { path: '/services-3', label: t('كل الخدمات', 'All services') },
    ],
  },
];

/** Profile p. 3: where friction really sits, and the questions managers ask. */
export const FRICTION = {
  kicker: t('الاحتكاك الحقيقي في الأعمال', 'Where business friction really is'),
  title: t('المشكلة ليست عدد الأنظمة… بل ما يحدث بين الإدارات.', 'The problem isn’t the number of systems… it’s what happens between departments.'),
  where: t('أين يقع الاحتكاك؟', 'Where does it happen?'),
  points: [
    t('طلب عميل بلا حالة واضحة', 'A customer request with no clear status'),
    t('استلام غير مرتبط بالفاتورة', 'A goods receipt not linked to the invoice'),
    t('رصيد بلا مستند أصل', 'A balance with no source document'),
    t('موافقة خارج مسار العمل', 'An approval outside the workflow'),
  ],
  context: t('سياق القرار', 'The decision context'),
  questions: [
    { who: t('حين يسأل المدير المالي', 'When the CFO asks'), q: t('هل لهذا الرصيد حركة أصلية؟ وهل الاستلام والفاتورة والتحصيل مكتملة؟', 'Does this balance have a source transaction? Are receipt, invoice and collection complete?') },
    { who: t('حين يسأل مدير العمليات', 'When the operations manager asks'), q: t('ما المرحلة المتأخرة؟ ومن يملك الإجراء التالي؟ وهل هناك أثر على المشروع أو المخزون؟', 'Which stage is late? Who owns the next action? Is there an effect on the project or stock?') },
    { who: t('حين يسأل المدير التنفيذي', 'When the CEO asks'), q: t('ما الذي يحتاج تدخله الآن، وما مصدر المؤشر الذي أمامه؟', 'What needs my attention now, and where does this indicator come from?') },
  ],
  close: t('تحقّق من العلاقة بين المعلومة والمستند والمسؤول قبل اتخاذ القرار.', 'Check the link between the figure, the document and the owner before you decide.'),
} as const;

/** Profile p. 34: Trilogy's wider technical services, kept distinct from the DIGIT product brand. */
export const TRILOGY = {
  kicker: t('DIGIT و Trilogy', 'DIGIT and Trilogy'),
  title: t('مسار تطبيقات الأعمال… وخدمات تقنية أوسع بنطاق مستقل', 'A business-applications track… and wider technical services, scoped separately'),
  body: t(
    'Trilogy شركة حلول تقنية سعودية؛ DIGIT هو مسار تطبيقات الأعمال لديها، بينما تشمل الخدمات التقنية الأوسع البنية التحتية والشبكات والسحابة والأمن والتعافي.',
    'Trilogy is a Saudi technology solutions company; DIGIT is its business-applications track, while its wider technical services cover infrastructure, networks, cloud, security and recovery.',
  ),
  digit: t('DIGIT', 'DIGIT'),
  digitBody: t('المنصة والتطبيقات المتخصصة وتنفيذها: الاكتشاف والنطاق والبيانات والتهيئة والتدريب والقبول.', 'The platform, the specialist applications and their implementation: discovery, scope, data, configuration, training and acceptance.'),
  trilogy: t('خدمات Trilogy التقنية', 'Trilogy technical services'),
  groups: [
    { label: t('البنية التحتية', 'Infrastructure'), items: ['Data Center', 'Servers', 'Networking', 'Enterprise Cabling'] },
    { label: t('السحابة والأمن', 'Cloud & security'), items: ['Cloud Solutions', 'Cybersecurity', 'Firewall', 'Endpoint Protection'] },
    { label: t('الاستمرارية والحماية', 'Continuity & protection'), items: ['Business Continuity', 'Disaster Recovery', 'Fire Suppression', 'Surveillance'] },
  ],
  note: t('خدمات Trilogy التقنية لا تُعد جزءًا تلقائيًا من ترخيص DIGIT، وتُحدَّد بنطاق مستقل.', 'Trilogy technical services are not automatically part of a DIGIT licence; they are scoped separately.'),
  method: 'REQUIREMENT → ARCHITECTURE → IMPLEMENTATION → VERIFICATION → EVIDENCE → HANDOVER',
} as const;

/* ------------------------------ Delivery (profile pp. 32–33, 36) ------------------------------ */

export const DELIVERY = {
  kicker: t('التنفيذ والتسليم', 'Implementation & delivery'),
  title: t('التنفيذ ليس تثبيتًا… بل تشغيل مقبول.', 'Implementation isn’t an install… it’s accepted operation.'),
  lede: t('اكتشاف، ونطاق، وبيانات، وتهيئة، وتدريب، وإطلاق مع قبول — كل مرحلة لها مخرج واضح.', 'Discovery, scope, data, configuration, training and go-live with acceptance — each stage has a clear output.'),
  stagesLabel: t('مراحل التنفيذ', 'Implementation stages'),
  what: t('ما يحدث', 'What happens'),
  output: t('المخرج', 'Output'),
  who: t('من يشارك', 'Who takes part'),
  step: t('المرحلة', 'Stage'),
  of: t('من', 'of'),
  scopeKicker: t('الباقة ≠ النطاق ≠ خدمة التنفيذ', 'Package ≠ scope ≠ implementation service'),
  scopeTitle: t('الباقة تحدد الحقوق… والتطبيقات تحدد النطاق.', 'The package sets the entitlements… the applications set the scope.'),
  scopeClear: t('إذا لم يكن النطاق واضحًا، فالسعر ليس واضحًا.', 'If the scope isn’t clear, the price isn’t clear.'),
  scopeNote: t('تُعتمد الحقوق والأسعار في عرض السعر الساري.', 'Entitlements and prices are confirmed in the current quotation.'),
  nextKicker: t('الخطوة التالية', 'Next step'),
  nextTitle: t('ابدأ بالقرار الذي تريد تحسينه… ثم اختبر الحل.', 'Start with the decision you want to improve… then test the solution.'),
  nextLede: t('اختر التطبيق أو المسار الذي تحتاجه، وابدأ بجلسة اكتشاف قصيرة على سيناريو حقيقي من عملك.', 'Choose the application or track you need and start with a short discovery session on a real scenario from your business.'),
  book: t('احجز جلسة اكتشاف', 'Book a discovery session'),
  more: t('تفاصيل التنفيذ والتسليم', 'Implementation & delivery details'),
} satisfies Record<string, L>;

export type DeliveryStage = { id: string; label: L; en: string; what: L[]; output: L; who: L };

export const DELIVERY_STAGES: DeliveryStage[] = [
  {
    id: 'discovery',
    label: t('الاكتشاف', 'Discovery'),
    en: 'Discovery',
    what: [t('فهم القرار الذي تريد تحسينه والإدارة المعنية وطريقة العمل الحالية', 'Understand the decision to improve, the department involved and how work runs today'), t('جمع المتطلبات على سيناريوهات حقيقية من عملك', 'Gather requirements against real scenarios from your business')],
    output: t('ملخص متطلبات وتقييم ملاءمة', 'A requirements summary and fit assessment'),
    who: t('فريق العميل مع مستشار DIGIT', 'Your team with a DIGIT consultant'),
  },
  {
    id: 'scope',
    label: t('النطاق', 'Scope'),
    en: 'Scope',
    what: [t('تحديد التطبيقات والوحدات والفروع والكيانات والمستخدمين والأدوار والتقارير قبل التسعير', 'Define applications, modules, branches, entities, users, roles and reports before pricing'), t('تقييم التكاملات المطلوبة وفصل ما هو مشمول عمّا له نطاق مستقل', 'Assess the integrations needed and separate what is included from what is scoped separately')],
    output: t('نطاق معتمد وعرض سعر', 'An approved scope and quotation'),
    who: t('صاحب القرار لدى العميل وفريق DIGIT', 'The customer’s decision owner and the DIGIT team'),
  },
  {
    id: 'data',
    label: t('البيانات', 'Data'),
    en: 'Data',
    what: [t('جاهزية البيانات الأساسية والأرصدة الافتتاحية وخطة الترحيل', 'Master data readiness, opening balances and a migration plan'), t('نطاق مستقل لكل تكامل أو ترحيل بيانات، بمسؤوليات وتواريخ ومعايير قبول', 'A separate scope for each integration or data migration, with owners, dates and acceptance criteria')],
    output: t('خطة بيانات وتكامل متفق عليها', 'An agreed data and integration plan'),
    who: t('مالكو البيانات لدى العميل وفريق التنفيذ', 'The customer’s data owners and the delivery team'),
  },
  {
    id: 'configuration',
    label: t('التهيئة', 'Configuration'),
    en: 'Configuration',
    what: [t('إعداد الشركة والحسابات ومسارات العمل والصلاحيات والموافقات حسب النطاق', 'Set up company, accounts, workflows, permissions and approvals within scope'), t('تخصيص أو تكامل إضافي فقط عند وروده في النطاق المعتمد', 'Additional customization or integration only where the approved scope includes it')],
    output: t('بيئة مهيأة جاهزة للاختبار', 'A configured environment ready for testing'),
    who: t('فريق التنفيذ مع مراجعة العميل', 'The delivery team, reviewed by the customer'),
  },
  {
    id: 'training',
    label: t('التدريب', 'Training'),
    en: 'Training',
    what: [t('تدريب بحسب الدور لكل مستخدم على ما سيعمل عليه', 'Role-based training for each user on the work they will do'), t('اختبار وظيفي للسيناريوهات المتفق عليها', 'Functional testing of the agreed scenarios')],
    output: t('مستخدمون مدرّبون وسيناريوهات مُختبرة', 'Trained users and tested scenarios'),
    who: t('مستخدمو العميل حسب أدوارهم', 'The customer’s users by role'),
  },
  {
    id: 'golive',
    label: t('الإطلاق والقبول', 'Go-live & acceptance'),
    en: 'Go-live / Acceptance',
    what: [t('قبول وظيفي للسيناريوهات ثم الإطلاق', 'Functional acceptance of the scenarios, then go-live'), t('مستوى دعم واضح بعد الإطلاق وحدود الخدمة المتفق عليها', 'A clear support level after go-live and agreed service boundaries')],
    output: t('قبول موقّع وتسليم إلى الدعم', 'Signed acceptance and handover to support'),
    who: t('صاحب القرار لدى العميل وفريق DIGIT', 'The customer’s decision owner and the DIGIT team'),
  },
];

export const DELIVERY_SCOPE: { id: 'package' | 'scoped' | 'trilogy'; title: L; body: L; items: L[] }[] = [
  {
    id: 'package',
    title: t('حقوق الباقة', 'Package entitlements'),
    body: t('ما تذكره وثيقة العرض السارية لباقتك (Starter أو Pro أو نطاق مؤسسي).', 'What the current offer document states for your package (Starter, Pro or an enterprise scope).'),
    items: [t('التطبيقات والوحدات المشمولة', 'Included applications and modules'), t('أعداد المستخدمين والحقوق', 'User counts and entitlements'), t('التدريب والدعم كما في العرض', 'Training and support as stated in the offer')],
  },
  {
    id: 'scoped',
    title: t('خدمات بنطاق مستقل', 'Separately scoped services'),
    body: t('لا تُعد مشمولة تلقائيًا؛ لكل منها نطاق ومسؤوليات ومعايير قبول.', 'Not included automatically; each has its own scope, owners and acceptance criteria.'),
    items: [t('التخصيص', 'Customization'), t('التكامل', 'Integration'), t('ترحيل البيانات', 'Data migration'), t('الاستشارات', 'Consulting')],
  },
  {
    id: 'trilogy',
    title: t('خدمات Trilogy التقنية', 'Trilogy technical services'),
    body: t('ضمن نطاق Trilogy التقني، وليست جزءًا من اشتراك DIGIT.', 'Within Trilogy’s technical scope, not part of a DIGIT subscription.'),
    items: [t('البنية التحتية والشبكات', 'Infrastructure & networks'), t('السحابة والأمن', 'Cloud & security'), t('الاستمرارية والتعافي', 'Continuity & recovery')],
  },
];

export const NEXT_STEPS: { no: string; label: L; body: L }[] = [
  { no: '01', label: t('الاكتشاف', 'Discovery'), body: t('حدد القرار والإدارة والمستخدمين.', 'Define the decision, department and users.') },
  { no: '02', label: t('العرض', 'Demo'), body: t('اختبر سيناريوهات حقيقية.', 'Test real scenarios.') },
  { no: '03', label: t('النطاق', 'Scope'), body: t('التطبيقات والتكاملات والبيانات والتدريب.', 'Applications, integrations, data and training.') },
  { no: '04', label: t('المقترح', 'Proposal'), body: t('عرض سعر ونطاق معتمدان.', 'An approved quotation and scope.') },
];

/* ------------------------------ Home: specialist discovery (profile p. 5) ------------------------------ */

export const PORTFOLIO = {
  kicker: t('محفظة حلول DIGIT', 'The DIGIT solution portfolio'),
  title: t('محفظة حلول واحدة… لا باقة واحدة لكل شيء.', 'One solution portfolio… not one bundle for everything.'),
  lede: t('اختر المنتج حسب دورة العمل، وليس حسب عدد التطبيقات.', 'Choose the product by the work cycle, not by the number of applications.'),
  families: t('منتجات DIGIT', 'DIGIT products'),
  story: t('القصة المتصلة', 'The connected story'),
  areas: t('المجالات', 'Areas'),
  open: t('استكشف', 'Explore'),
  demo: t('احجز ديمو', 'Book a demo'),
  roles: t('ابدأ من دورك', 'Start from your role'),
  industries: t('12 نشاط تجزئة في مستكشف الأنشطة', '12 retail segments in the industry explorer'),
} satisfies Record<string, L>;

/** The connected story per specialist product; Pro and HR keep their existing catalog content unchanged. */
export const PRODUCT_STORIES: Partial<Record<ProductKey, { tagline: L; steps: L[]; photo: string; anchor?: string }>> = {
  construction: {
    tagline: t('من المقايسة إلى التحصيل', 'From BOQ to collection'),
    steps: [t('المقايسة', 'BOQ'), t('العقد', 'Contract'), t('التنفيذ', 'Execution'), t('المستخلص', 'Claim'), t('التحصيل', 'Collection')],
    photo: 'construction-levels',
  },
  crm: {
    tagline: t('من العميل المحتمل إلى الخطوة التالية', 'From lead to next action'),
    steps: [t('العميل المحتمل', 'Lead'), t('التأهيل', 'Qualification'), t('العميل والمنشأة', 'Account'), t('الفرصة', 'Opportunity'), t('المتابعة', 'Follow-up'), t('التسليم للمبيعات', 'Sales handoff')],
    photo: 'crm-sales-call',
  },
  fsm: {
    tagline: t('من العقد إلى الإغلاق المؤكد', 'From agreement to verified closure'),
    steps: [t('العقد', 'Agreement'), t('الموقع والجهاز', 'Site & device'), t('الزيارة', 'Visit'), t('الفحص', 'Inspection'), t('العيب', 'Deficiency'), t('إعادة الاختبار', 'Retest'), t('إغلاق مؤكد', 'Verified closure')],
    photo: 'fsm-rooftop-technician',
  },
  pos: {
    tagline: t('من الكاشير إلى عمليات الشركة', 'From the till to company operations'),
    steps: [t('تجربة البيع', 'Selling'), t('عمليات المتجر', 'Store operations'), t('العمليات المترابطة', 'Connected operations')],
    photo: 'pos-counter',
  },
};
