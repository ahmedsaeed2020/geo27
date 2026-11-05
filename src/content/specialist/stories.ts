// Interactive stories on the Construction, CRM, POS and FSM + ITM product hubs (owner brief 2026-11-04, Corporate
// Profile 2026 pp. 21–30). Every stage links to the department page that owns it; `shot` ids are genuine screens.
import type { EvidenceStatus, L } from './types';

const t = (ar: string, en: string): L => ({ ar, en });

/* ---------- Construction: Project 360 journey (p. 21) ---------- */
export type JourneyStage = { id: string; label: L; purpose: L; documents: string[]; owner: L; status: L; implication: L; dept: string };

export const CONSTRUCTION_JOURNEY: JourneyStage[] = [
  {
    id: 'boq',
    label: t('المقايسة', 'BOQ'),
    purpose: t('تسعير نطاق المشروع بندًا بندًا قبل الالتزام بأي عقد.', 'Price the project scope item by item before committing to any contract.'),
    documents: ['BOQ', 'Estimate Version', 'Tender'],
    owner: t('مهندس التسعير', 'Estimating engineer'),
    status: t('نسخة تقدير معتمدة', 'Approved estimate version'),
    implication: t('النسخة المعتمدة تصبح أساس قيمة العقد والموازنة؛ أي تعديل لاحق يُقارن بها.', 'The approved version becomes the basis of contract value and budget; any later change is compared with it.'),
    dept: '/construction/estimating',
  },
  {
    id: 'contract',
    label: t('العقد', 'Contract'),
    purpose: t('تحويل المقايسة المعتمدة إلى عقد عميل وجدول قيم وشروط دفع.', 'Turn the approved BOQ into a client contract, a schedule of values and payment terms.'),
    documents: ['Client Contract', 'Schedule of Values', 'Variation Order'],
    owner: t('مدير العقود', 'Contracts manager'),
    status: t('عقد ساري', 'Active contract'),
    implication: t('قيمة العقد تتغير فقط بأمر تغيير معتمد، فيبقى الأصل والتعديل مرئيين.', 'Contract value changes only through an approved variation, so the original and the change stay visible.'),
    dept: '/construction/contracts',
  },
  {
    id: 'execution',
    label: t('التنفيذ', 'Execution'),
    purpose: t('تخطيط الأعمال وتنفيذها وتوريد المواد ومتابعة المقاولين الباطن في الموقع.', 'Plan and execute the work, supply materials and follow subcontractors on site.'),
    documents: ['Baseline', 'Work Package', 'Material Request', 'Subcontract'],
    owner: t('مدير المشروع', 'Project manager'),
    status: t('قيد التنفيذ', 'In progress'),
    implication: t('كل التزام شراء أو مقاولة باطن يدخل الالتزامات قبل أن يصبح تكلفة فعلية.', 'Every purchase or subcontract commitment enters commitments before it becomes an actual cost.'),
    dept: '/construction/projects',
  },
  {
    id: 'claim',
    label: t('المستخلص', 'Claim'),
    purpose: t('قياس الأعمال المنفذة ثم المطالبة بها واعتمادها من الاستشاري أو المالك.', 'Measure completed work, then claim it and have it certified by the consultant or owner.'),
    documents: ['Measurement', 'Progress Claim', 'Certificate'],
    owner: t('مهندس الكميات', 'Quantity surveyor'),
    status: t('مُطالب به ← معتمد', 'Claimed → certified'),
    implication: t('المعتمد قد يختلف عن المُطالب به؛ الفاتورة تتبع المعتمد لا المطالبة.', 'Certified can differ from claimed; the invoice follows the certified amount, not the claim.'),
    dept: '/construction/claims',
  },
  {
    id: 'collection',
    label: t('التحصيل', 'Collection'),
    purpose: t('فوترة المعتمد ومتابعة التحصيل والمحتجزات حتى الإقفال المالي للمشروع.', 'Invoice what is certified and follow collection and retention until the project’s financial close.'),
    documents: ['Sales Invoice', 'Payment Entry', 'Retention'],
    owner: t('المدير المالي للمشروع', 'Project finance manager'),
    status: t('مفوتر ← محصّل', 'Invoiced → collected'),
    implication: t('الموقف النقدي للمشروع يُقرأ من المحصّل فعلًا، لا من قيمة العقد أو المستخلص.', 'The project’s cash position is read from what is actually collected, not from contract or claim value.'),
    dept: '/construction/financial-closeout',
  },
];

/** The money chain that must never be collapsed into one number (p. 24). */
export const CONSTRUCTION_MONEY_CHAIN: { id: string; label: L; means: L }[] = [
  { id: 'measured', label: t('مُقاس', 'Measured'), means: t('كمية منفذة ثبتت بالقياس في الموقع.', 'Quantity done, proven by site measurement.') },
  { id: 'claimed', label: t('مُطالب به', 'Claimed'), means: t('ما طالبنا به العميل في المستخلص.', 'What we asked the client for in the claim.') },
  { id: 'certified', label: t('معتمد', 'Certified'), means: t('ما اعتمده الاستشاري أو المالك.', 'What the consultant or owner certified.') },
  { id: 'invoiced', label: t('مفوتر', 'Invoiced'), means: t('ما صدرت به فاتورة.', 'What has been invoiced.') },
  { id: 'collected', label: t('محصّل', 'Collected'), means: t('ما دخل الحساب فعلًا.', 'What actually reached the bank.') },
];

/** Cost measures shown side by side, never as interchangeable figures (p. 24). */
export const CONSTRUCTION_COST_MEASURES: { id: string; label: L; means: L; notThis: L }[] = [
  { id: 'budget', label: t('الموازنة', 'Budget'), means: t('ما خُطط لصرفه على كل بند.', 'What was planned to be spent on each item.'), notThis: t('ليست ما صُرف', 'Not what was spent') },
  { id: 'actual', label: t('التكلفة الفعلية', 'Actual cost'), means: t('ما سُجل فعلًا من تكاليف.', 'Costs actually recorded.'), notThis: t('ليست ما التزمنا به', 'Not what we committed') },
  { id: 'commitments', label: t('الالتزامات', 'Commitments'), means: t('أوامر شراء وعقود باطن لم تتحول إلى تكلفة بعد.', 'Purchase orders and subcontracts not yet turned into cost.'), notThis: t('ليست تكلفة فعلية', 'Not actual cost') },
  { id: 'forecast', label: t('المتبقي والمتوقع عند الإنجاز', 'ETC / EAC'), means: t('تقدير ما بقي، والتكلفة المتوقعة عند اكتمال المشروع.', 'Estimate to complete, and the expected cost at completion.'), notThis: t('ليس رقمًا محاسبيًا مسجلًا', 'Not a recorded accounting figure') },
];

/** Change impact chain (p. 23), each link only where the set-up supports it. */
export const CONSTRUCTION_CHANGE: { id: string; label: L; body: L }[] = [
  { id: 'estimate', label: t('نسخة التقدير', 'Estimate version'), body: t('ما سُعّر أصلًا.', 'What was originally priced.') },
  { id: 'sov', label: t('العقد وجدول القيم', 'Contract / SOV'), body: t('ما اتُفق عليه.', 'What was agreed.') },
  { id: 'baseline', label: t('خط الأساس', 'Baseline'), body: t('ما خُطط تنفيذه.', 'What was planned.') },
  { id: 'evidence', label: t('دليل الموقع', 'Field evidence'), body: t('ما حدث فعلًا في الموقع.', 'What actually happened on site.') },
  { id: 'variation', label: t('اعتماد التغيير', 'Variation approval'), body: t('أمر تغيير معتمد يعدّل القيمة والجدول.', 'An approved variation that adjusts value and schedule.') },
];

/* ---------- CRM: Lead-to-Deal explorer and manager workbench (pp. 25–26) ---------- */
export type Focus = { x: number; y: number; zoom: number };
/** `shots`: real DIGIT CRM screens and close-ups (ids in src/content/screens.ts) shown beside the stage. */
export type CrmStage = { id: string; label: L; objects: string[]; actions: L[]; outcome: L; dept: string; shot?: { id: string; focus: Focus }; shots?: string[]; status: EvidenceStatus };

export const CRM_JOURNEY: CrmStage[] = [
  {
    id: 'lead',
    label: t('العميل المحتمل', 'Lead'),
    objects: ['Lead', 'Lead Source'],
    actions: [t('تسجيل المصدر', 'Record the source'), t('الإسناد لبائع', 'Assign to a rep')],
    outcome: t('عميل محتمل له مصدر ومالك.', 'A lead with a source and an owner.'),
    dept: '/crm/leads',
    shots: ['crm2-leads-sources', 'crm2-nav-leads'],
    status: 'demonstrated',
  },
  {
    id: 'qualification',
    label: t('التأهيل', 'Qualification'),
    objects: ['Qualification', 'Activity'],
    actions: [t('أول تواصل', 'First contact'), t('قرار مؤهل أو غير مؤهل بسبب', 'Qualified or not, with a reason')],
    outcome: t('قرار تأهيل موثّق وزمن استجابة معروف.', 'A recorded qualification decision and a known response time.'),
    dept: '/crm/leads',
    shots: ['crm2-leads-funnel', 'crm2-leads-first-contact'],
    status: 'demonstrated',
  },
  {
    id: 'account',
    label: t('العميل والمنشأة', 'Account'),
    objects: ['Organization', 'Contact'],
    actions: [t('إنشاء المنشأة وجهات الاتصال', 'Create the organization and contacts'), t('تحديد صاحب القرار', 'Identify the decision maker')],
    outcome: t('سجل عميل واحد يعرفه الجميع.', 'One customer record everyone knows.'),
    dept: '/crm/accounts',
    shots: ['crm2-acc-health', 'crm2-acc-open-opps'],
    status: 'demonstrated',
  },
  {
    id: 'opportunity',
    label: t('الفرصة', 'Opportunity'),
    objects: ['Deal', 'Deal Stage'],
    actions: [t('تحديد القيمة والاحتمال', 'Set value and probability'), t('تحديد تاريخ الإغلاق المتوقع', 'Set the expected close date')],
    outcome: t('صفقة في مرحلة واضحة بقيمة مرجحة.', 'A deal in a clear stage with a weighted value.'),
    dept: '/crm/opportunities',
    shots: ['crm2-opp-conversion', 'crm2-opp-ageing'],
    status: 'demonstrated',
  },
  {
    id: 'follow-up',
    label: t('المتابعة', 'Follow-up'),
    objects: ['Task', 'Call', 'Meeting'],
    actions: [t('جدولة الإجراء التالي', 'Schedule the next action'), t('تسجيل النتيجة', 'Record the outcome')],
    outcome: t('لا صفقة بلا خطوة تالية؛ الراكد يظهر كتنبيه.', 'No deal without a next step; stalled deals show as alerts.'),
    dept: '/crm/activities',
    shots: ['crm2-act-mix', 'crm2-act-daily'],
    status: 'demonstrated',
  },
  {
    id: 'handoff',
    label: t('التسليم للمبيعات', 'Sales handoff'),
    objects: ['Quotation', 'Sales Order'],
    actions: [t('الفوز بالصفقة', 'Win the deal'), t('الانتقال إلى عرض السعر في DIGIT Pro', 'Move to the quotation in DIGIT Pro')],
    outcome: t('تبدأ دورة البيع في DIGIT Pro: عرض سعر وأمر بيع وفاتورة وتحصيل.', 'The DIGIT Pro selling cycle starts: quotation, sales order, invoice and collection.'),
    dept: '/modules/sales',
    shots: ['crm2-opp-weighted', 'crm2-nav-opp'],
    status: 'scoped',
  },
];

export type WorkbenchItem = { id: string; label: L; decision: L; owner: L; source: L; status: EvidenceStatus; shot?: { id: string; focus: Focus }; shots?: string[] };

export const CRM_WORKBENCH: WorkbenchItem[] = [
  { id: 'unassigned', label: t('عملاء محتملون غير مسندين', 'Unassigned leads'), decision: t('لمن يُسند كل عميل قبل أن يبرد؟', 'Who takes each lead before it goes cold?'), owner: t('مدير المبيعات', 'Sales manager'), source: t('سجل العميل المحتمل ومالكه', 'Lead record and owner'), status: 'demonstrated', shots: ['crm2-leads'] },
  { id: 'overdue', label: t('متابعات متأخرة', 'Overdue follow-ups'), decision: t('من يحتاج تدخلًا اليوم؟', 'Who needs help today?'), owner: t('مدير المبيعات مع البائع', 'Sales manager with the rep'), source: t('المهام والأنشطة المستحقة', 'Due tasks and activities'), status: 'demonstrated', shots: ['crm2-home'] },
  { id: 'ageing', label: t('عمر المرحلة', 'Stage ageing'), decision: t('أي الصفقات بقيت طويلًا في مرحلتها؟', 'Which deals have sat too long in their stage?'), owner: t('مدير المبيعات', 'Sales manager'), source: t('تاريخ دخول الصفقة للمرحلة', 'Date the deal entered its stage'), status: 'demonstrated', shots: ['crm2-opp-ageing'] },
  { id: 'activity', label: t('نشاط البيع', 'Sales activity'), decision: t('هل يكفي نشاط الفريق لتحقيق الهدف؟', 'Is team activity enough to hit the target?'), owner: t('مدير المبيعات', 'Sales manager'), source: t('المكالمات والاجتماعات والمهام', 'Calls, meetings and tasks'), status: 'demonstrated', shots: ['crm2-act-daily', 'crm2-act-calls'] },
  { id: 'stalled', label: t('صفقات راكدة', 'Stalled opportunities'), decision: t('نعيد تنشيطها أم نغلقها كخسارة؟', 'Revive them or close them as lost?'), owner: t('البائع ثم المدير', 'The rep, then the manager'), source: t('تنبيه «راكدة» على الصفقة', 'The “stalled” alert on the deal'), status: 'documented' },
  { id: 'next', label: t('الإجراءات التالية', 'Next actions'), decision: t('ما الصفقات التي لا خطوة تالية لها؟', 'Which deals have no next step?'), owner: t('البائع', 'Sales rep'), source: t('تنبيه «بلا إجراء تالٍ» على الصفقة', 'The “no next step” alert on the deal'), status: 'demonstrated', shots: ['crm2-opportunities'] },
];

/* ---------- POS: chapters and the twelve-sector explorer (pp. 27–28) ---------- */
export const POS_CHAPTERS: { id: string; title: L; lede: L; items: { label: L; status: EvidenceStatus }[] }[] = [
  {
    id: 'selling',
    title: t('تجربة البيع', 'The selling experience'),
    lede: t('من اختيار الصنف إلى الإيصال، في شاشة كاشير واحدة.', 'From choosing the item to the receipt, on one cashier screen.'),
    items: [
      { label: t('الفئات والبحث عن الصنف', 'Categories and item search'), status: 'documented' },
      { label: t('قراءة الباركود', 'Barcode scanning'), status: 'documented' },
      { label: t('السلة والكميات', 'Basket and quantities'), status: 'documented' },
      { label: t('العميل على الفاتورة', 'Customer on the sale'), status: 'documented' },
      { label: t('الدفع والإيصال', 'Payment and receipt'), status: 'documented' },
    ],
  },
  {
    id: 'store',
    title: t('عمليات المتجر', 'Store operations'),
    lede: t('من يبيع، في أي فرع، بأي صلاحية، وكيف تُدار المرتجعات.', 'Who sells, in which branch, with what permission, and how returns are handled.'),
    items: [
      { label: t('الكاشير والجلسة', 'Cashier and session'), status: 'documented' },
      { label: t('الفروع', 'Branches'), status: 'documented' },
      { label: t('الصلاحيات', 'Permissions'), status: 'documented' },
      { label: t('المرتجعات', 'Returns'), status: 'documented' },
    ],
  },
  {
    id: 'connected',
    title: t('العمليات المترابطة', 'Connected operations'),
    lede: t('البيعة تكتمل في عمليات الشركة عندما يكون الربط مُعدًّا ومتحققًا منه.', 'The sale completes in company operations once the link is set up and verified.'),
    items: [
      { label: t('حركة المخزون', 'Stock movement'), status: 'scoped' },
      { label: t('سجلات الدفع', 'Payment records'), status: 'scoped' },
      { label: t('السياق المالي في المحاسبة', 'Financial context in accounting'), status: 'scoped' },
    ],
  },
];

export type PosIndustry = { id: string; label: L; scenario: L; capabilities: L[]; considerations: L[]; route: string };

const GENERAL_CAPS = [t('البحث والباركود والسلة', 'Search, barcode and basket'), t('جلسة الكاشير والفرع', 'Cashier session and branch')];

export const POS_INDUSTRIES: PosIndustry[] = [
  { id: 'chocolate', label: t('الشوكولاتة والحلويات', 'Chocolate & sweets'), scenario: t('بيع بالقطعة والعلبة، مع مواسم هدايا وطلبات مسبقة.', 'Selling by piece and by box, with gifting seasons and pre-orders.'), capabilities: [...GENERAL_CAPS, t('الأصناف حسب الفئة والوزن', 'Items by category and weight')], considerations: [t('الصلاحية والدفعات حسب نطاق المخزون', 'Expiry and batches depend on inventory scope')], route: '/pos-solutions/sweets' },
  { id: 'clothing', label: t('الملابس', 'Clothing'), scenario: t('مقاسات وألوان لكل صنف، ومرتجعات واستبدال متكرر.', 'Sizes and colours per item, and frequent returns and exchanges.'), capabilities: [...GENERAL_CAPS, t('المرتجعات والاستبدال', 'Returns and exchanges')], considerations: [t('متغيرات المقاس واللون تُهيأ في بيانات الأصناف', 'Size and colour variants are configured in item data')], route: '/industries/retail' },
  { id: 'pharmacy', label: t('الصيدليات', 'Pharmacy'), scenario: t('صرف سريع لأصناف كثيرة مع متطلبات تنظيمية خاصة.', 'Fast dispensing of many items with special regulatory needs.'), capabilities: [...GENERAL_CAPS], considerations: [t('الوصفات والدفعات وتواريخ الصلاحية غير مشمولة تلقائيًا؛ تُحدد حسب الإصدار والتكامل', 'Prescriptions, batches and expiry are not included automatically; they depend on edition and integration')], route: '/pos-solutions/pharmacies' },
  { id: 'flowers', label: t('الزهور', 'Flowers'), scenario: t('تنسيقات حسب الطلب، وتوصيل في مواعيد محددة.', 'Made-to-order arrangements and timed deliveries.'), capabilities: [...GENERAL_CAPS, t('العميل على الفاتورة', 'Customer on the sale')], considerations: [t('إدارة التوصيل تُقيّم في النطاق', 'Delivery management is assessed in scope')], route: '/pos-solutions/florist' },
  { id: 'electrical', label: t('الأجهزة الكهربائية', 'Electrical appliances'), scenario: t('أصناف عالية القيمة، وضمان وخدمة ما بعد البيع.', 'High-value items, warranty and after-sales service.'), capabilities: [...GENERAL_CAPS, t('الصلاحيات على الخصومات', 'Permissions on discounts')], considerations: [t('الأرقام التسلسلية والضمان حسب نطاق المخزون والخدمة', 'Serial numbers and warranty depend on inventory and service scope')], route: '/pos-solutions/electrical-appliances' },
  { id: 'cafe', label: t('الكافيهات', 'Cafe'), scenario: t('طلبات سريعة في أوقات الذروة، وإضافات على كل مشروب.', 'Fast orders at peak times, with add-ons on every drink.'), capabilities: [...GENERAL_CAPS, t('الدفع والإيصال', 'Payment and receipt')], considerations: [t('شاشات المطبخ أو التحضير غير مشمولة تلقائيًا', 'Kitchen or preparation displays are not included automatically')], route: '/pos-solutions/restaurants-cafes' },
  { id: 'toys', label: t('الألعاب', 'Toys & games'), scenario: t('مواسم وعروض، وأصناف كثيرة بالباركود.', 'Seasons and promotions, and many barcoded items.'), capabilities: [...GENERAL_CAPS, t('المرتجعات', 'Returns')], considerations: [t('العروض والتسعير الموسمي حسب الإعداد', 'Promotions and seasonal pricing depend on set-up')], route: '/industries/retail' },
  { id: 'optics', label: t('النظارات', 'Optics'), scenario: t('بيع إطارات وعدسات مع طلبات تجهيز وتسليم لاحق.', 'Selling frames and lenses with fitting orders and later pickup.'), capabilities: [...GENERAL_CAPS, t('العميل على الفاتورة', 'Customer on the sale')], considerations: [t('قياسات النظر وأوامر المعمل غير مشمولة تلقائيًا', 'Eye measurements and lab orders are not included automatically')], route: '/pos-solutions/optical' },
  { id: 'restaurant', label: t('المطاعم', 'Restaurant'), scenario: t('طاولات وطلبات سفري وتوصيل في وقت واحد.', 'Tables, takeaway and delivery at the same time.'), capabilities: [...GENERAL_CAPS, t('جلسات الكاشير حسب الوردية', 'Cashier sessions per shift')], considerations: [t('شاشات المطبخ وإدارة الطاولات غير مشمولة تلقائيًا', 'Kitchen displays and table management are not included automatically')], route: '/pos-solutions/restaurants-cafes' },
  { id: 'mobiles', label: t('الجوالات', 'Mobile phones'), scenario: t('أجهزة عالية القيمة وإكسسوارات وصيانة.', 'High-value devices, accessories and repairs.'), capabilities: [...GENERAL_CAPS, t('الصلاحيات والمرتجعات', 'Permissions and returns')], considerations: [t('تتبع IMEI غير مشمول تلقائيًا؛ يُحدد حسب الإصدار والنطاق', 'IMEI tracking is not included automatically; it depends on edition and scope')], route: '/pos-solutions/mobile-shops' },
  { id: 'perfumes', label: t('العطور', 'Perfumes'), scenario: t('بيع بالعبوة والتولة، وهدايا ومناسبات.', 'Selling by bottle and by tola, with gifts and occasions.'), capabilities: [...GENERAL_CAPS, t('العميل على الفاتورة', 'Customer on the sale')], considerations: [t('وحدات البيع المتعددة تُهيأ في بيانات الأصناف', 'Multiple selling units are configured in item data')], route: '/industries/retail' },
  { id: 'furniture', label: t('الأثاث', 'Furniture'), scenario: t('دفعات مقدمة، وتسليم وتركيب لاحق.', 'Deposits, with later delivery and installation.'), capabilities: [...GENERAL_CAPS, t('العميل على الفاتورة', 'Customer on the sale')], considerations: [t('الدفعات المقدمة والتسليم حسب نطاق المبيعات', 'Deposits and delivery depend on selling scope')], route: '/pos-solutions/furniture' },
];

/* ---------- FSM + ITM: service journey and inspection loop (pp. 29–30) ---------- */
export const FSM_JOURNEY: { id: string; label: L; record: string; owner: L; state: L; output: L; dept: string }[] = [
  { id: 'customer', label: t('العميل', 'Customer'), record: 'Customer', owner: t('مدير الحساب', 'Account manager'), state: t('نشط', 'Active'), output: t('طرف التعاقد', 'Contracting party'), dept: '/fsm/sites' },
  { id: 'site', label: t('الموقع', 'Site'), record: 'Service Site', owner: t('مدير الخدمة', 'Service manager'), state: t('مسجل', 'Registered'), output: t('عنوان ووصول', 'Address and access'), dept: '/fsm/sites' },
  { id: 'device', label: t('الجهاز المركب', 'Installed device'), record: 'Installed Device', owner: t('المهندس المسؤول', 'Responsible engineer'), state: t('في الخدمة', 'In service'), output: t('تاريخ خدمة الجهاز', 'Device service history'), dept: '/fsm/sites' },
  { id: 'obligation', label: t('التزام العقد', 'Contract obligation'), record: 'Contract Obligation', owner: t('مدير الحساب', 'Account manager'), state: t('مُعرَّف', 'Defined'), output: t('زيارات وفحوص مستحقة', 'Visits and inspections due'), dept: '/fsm/agreements' },
  { id: 'job', label: t('أمر العمل', 'Job'), record: 'Work Order', owner: t('منسق الإرسال', 'Dispatcher'), state: t('مجدول', 'Scheduled'), output: t('فني وموعد', 'Technician and date'), dept: '/fsm/work-orders' },
  { id: 'visit', label: t('زيارة الفني', 'Technician visit'), record: 'Service Visit', owner: t('الفني', 'Technician'), state: t('منفذ', 'Completed'), output: t('عمل منفذ ونتيجة', 'Work done and outcome'), dept: '/fsm/work-orders' },
  { id: 'inspection', label: t('الفحص', 'Inspection'), record: 'Device Test', owner: t('الفني', 'Technician'), state: t('ناجح أو فيه عيب', 'Pass or deficiency'), output: t('نتيجة موثقة بالأدلة', 'Evidence-backed result'), dept: '/fsm/inspection' },
  { id: 'deficiency', label: t('العيب', 'Deficiency'), record: 'Deficiency', owner: t('مدير الخدمة', 'Service manager'), state: t('مفتوح', 'Open'), output: t('قرار إصلاح', 'Repair decision'), dept: '/fsm/deficiencies' },
  { id: 'corrective', label: t('العمل التصحيحي', 'Corrective work'), record: 'Corrective Job', owner: t('الفني', 'Technician'), state: t('منفذ', 'Done'), output: t('جهاز أُصلح', 'Device repaired'), dept: '/fsm/deficiencies' },
  { id: 'retest', label: t('إعادة الاختبار', 'Retest'), record: 'Retest', owner: t('الفني', 'Technician'), state: t('ناجح أو فاشل', 'Pass or fail'), output: t('قرار الإغلاق', 'Closure decision'), dept: '/fsm/deficiencies' },
  { id: 'closure', label: t('إغلاق مؤكد', 'Verified closure'), record: 'Deficiency Closure', owner: t('مدير الجودة', 'Quality manager'), state: t('مغلق مؤكد', 'Verified closed'), output: t('سجل موثّق للعميل', 'A documented record for the customer'), dept: '/fsm/quality' },
];

export const FSM_LOOP: { id: string; label: L; body: L }[] = [
  { id: 'inspection', label: t('الفحص', 'Inspection'), body: t('قالب معتمد ونتيجة لكل جهاز مع قياسات وصور.', 'An approved template and a result per device, with readings and photos.') },
  { id: 'deficiency', label: t('العيب', 'Deficiency'), body: t('ما فشل يُسجل عيبًا مفتوحًا بخطورته.', 'What failed is recorded as an open deficiency with its severity.') },
  { id: 'quote', label: t('عرض سعر / عمل تصحيحي', 'Quotation / corrective job'), body: t('عرض سعر عند الحاجة ثم أمر عمل للإصلاح.', 'A quotation when needed, then a repair work order.') },
  { id: 'repair', label: t('الإصلاح', 'Repair'), body: t('الفني ينفذ الإصلاح ويسجله.', 'The technician performs and records the repair.') },
  { id: 'retest', label: t('إعادة الاختبار', 'Retest'), body: t('اختبار جديد بنفس القالب.', 'A new test on the same template.') },
  { id: 'closure', label: t('إغلاق مؤكد', 'Verified closure'), body: t('يُغلق العيب فقط بعد نجاح إعادة الاختبار.', 'The deficiency closes only after a passed retest.') },
];
