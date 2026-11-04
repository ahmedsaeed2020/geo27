import type { ProPageContent } from '../types';
import { EVIDENCE } from '../evidence';

// Executive Dashboards (V4 pages 35–36). A command-center composition: what a management board is (versus a
// workspace and a report), the real CFO boards, exceptions, cross-department monitoring, and an honest status of
// the indicator contracts.
const insightsBuilt = Object.entries(EVIDENCE)
  .filter(([id, e]) => e.part === 'I' && e.cls === 'IU' && /-BI-\d+$/.test(id))
  .map(([id]) => id);

const page: ProPageContent = {
  key: 'dashboards',
  sections: [
    {
      id: 'layers',
      kind: 'layers',
      lede: {
        ar: 'لوحة الإدارة ليست تقريرًا ولا مساحة عمل. كل طبقة لها جمهور ووظيفة، والانتقال بينها لا يفقد الشركة ولا الفترة.',
        en: 'A management board is neither a report nor a workspace. Each layer has its audience and job, and moving between them keeps the company and period.',
      },
      layers: [
        {
          name: { ar: 'لوحة الإدارة', en: 'Management board' },
          who: { ar: 'المدير العام والمدير المالي', en: 'General manager and CFO' },
          purpose: { ar: 'قراءة الوضع واتخاذ القرار.', en: 'Read the position and decide.' },
          example: { ar: 'توقع النقد 7/30/90 يومًا، والفعلي منفصل عن المتوقع.', en: 'The 7/30/90-day cash forecast, with actuals apart from projections.' },
          shot: '01-cfo-02-e2',
          href: '/pro/cfo-intelligence',
        },
        {
          name: { ar: 'مساحة العمل', en: 'Workspace' },
          who: { ar: 'المحاسب والمشتري وأمين المستودع', en: 'Accountant, buyer and warehouse lead' },
          purpose: { ar: 'إنجاز العمل اليومي ومعالجة الاستثناءات.', en: 'Do the daily work and clear exceptions.' },
          example: { ar: 'مساحة التحصيل: المتأخر والصافي القابل للتحصيل لكل عميل.', en: 'The collections workspace: overdue and net collectible per customer.' },
          shot: '02-cash-01-f9',
          href: '/modules/accounting',
        },
        {
          name: { ar: 'التقرير', en: 'Report' },
          who: { ar: 'المراقب المالي والمراجع', en: 'Controller and auditor' },
          purpose: { ar: 'الإثبات والتفصيل والتصدير.', en: 'Prove, detail and export.' },
          example: { ar: 'القوائم المالية بنفس الفلاتر من مصمم القوائم.', en: 'The financial statements with the same filters, from the statement designer.' },
          shot: '09-rep-03-r6',
          href: '/modules/reports',
        },
      ],
    },
    {
      id: 'board',
      kind: 'chapter',
      kicker: { ar: 'مركز القيادة', en: 'Command center' },
      lede: {
        ar: 'لوحات المدير المالي تبدأ بالنقد والبنوك والذمم والإقفال، وكل بطاقة فيها تذكر من أين جاء رقمها.',
        en: 'The CFO boards start with cash and banks, receivables and close, and every card states where its figure comes from.',
      },
      lead: { id: '01-cfo-01-e1' },
      points: [
        { id: 'E1', title: { ar: 'لوحات المدير المالي', en: 'CFO boards' }, body: { ar: 'النقد والذمم والإقفال والأداء في لوحات متتالية.', en: 'Cash, receivables, close and performance in successive boards.' } },
        { id: 'E2', title: { ar: 'توقع النقد 7/30/90 يومًا', en: '7/30/90-day cash forecast' }, body: { ar: 'الفعلي من الأستاذ منفصل عن المجدول والسيناريو.', en: 'Actuals from the ledger kept apart from scheduled and scenario.' } },
        { id: 'R7', title: { ar: 'تعريف ومصدر لكل بطاقة', en: 'Definition and source on every card' }, body: { ar: 'عدد السجلات والفترة ورابط «التعريف والمصدر».', en: 'Record count, period and a “definition and source” link.' } },
        { id: 'F11', title: { ar: 'جاهزية الإقفال', en: 'Close readiness' }, body: { ar: 'خطوات الإقفال بحالتها قبل نهاية الفترة.', en: 'Close steps with their state before period end.' } },
      ],
      reports: ['Cash Flow', 'Accounts Receivable Summary', 'Profit and Loss Statement'],
      support: ['01-cfo-02-e2', '01-cfo-05-r7'],
    },
    {
      id: 'exceptions',
      kind: 'chapter',
      flip: true,
      kicker: { ar: 'الاستثناءات', en: 'Exceptions' },
      lede: {
        ar: 'ما يحتاج انتباهًا لا ينتظر فتح تقرير: الشارات على القائمة، وعدّاد «شغلي»، وصندوق الاعتمادات، كلها تقود إلى المستند نفسه.',
        en: 'What needs attention does not wait for a report: sidebar badges, the “My Work” counter and the approvals inbox all lead to the document itself.',
      },
      lead: { id: '10-ctl-04-s7', focus: { x: 86, y: 40, zoom: 2.4 } },
      points: [
        { id: 'S7', title: { ar: 'شارات على القائمة الجانبية', en: 'Sidebar badges' }, body: { ar: 'عدد الاستثناءات بجانب كل مساحة عمل.', en: 'The exception count next to each workspace.' } },
        { id: 'E3', title: { ar: 'لوحة الاستثناءات والمخاطر', en: 'Exceptions and risk board' }, body: { ar: 'الإشارات مجمعة للإدارة مع مصدرها.', en: 'Signals gathered for management, with their source.' } },
        { id: 'S3', title: { ar: 'عدّاد «شغلي»', en: '“My Work” counter' }, body: { ar: 'ما ينتظرك أنت تحديدًا.', en: 'What is waiting for you specifically.' } },
        { id: 'S4', title: { ar: 'صندوق اعتمادات موحد', en: 'Unified approvals inbox' }, body: { ar: 'كل ما ينتظر اعتمادك من الإدارات في قائمة واحدة.', en: 'Everything awaiting your approval across departments in one list.' } },
      ],
      reports: [],
      support: ['01-cfo-03-e3', '10-ctl-02-s3'],
    },
    {
      id: 'monitoring',
      kind: 'mosaic',
      lede: {
        ar: 'من مركز القيادة إلى كل إدارة: المؤشر نفسه يظهر في مساحة العمل التي تعالجه.',
        en: 'From the command center to each department: the same indicator appears in the workspace that handles it.',
      },
      items: [
        { shot: '05-sales-01-sl2', note: { ar: 'المبيعات: العروض بمراحلها ونسبة التحويل.', en: 'Selling: quotes by stage and conversion.' }, href: '/modules/sales' },
        { shot: '06-pur-01-pu6', note: { ar: 'المشتريات: الالتزامات المفتوحة والأوامر المتأخرة.', en: 'Purchasing: open commitments and late orders.' }, href: '/modules/purchasing' },
        { shot: '07-inv-01-in1', note: { ar: 'المخزون: لوحة عمليات كل مستودع.', en: 'Inventory: the operations board for each warehouse.' }, href: '/modules/inventory' },
        { shot: '08-ast-01-fa4', note: { ar: 'الأصول: المرحّل مقابل المستحق لكل دفتر.', en: 'Fixed assets: posted versus due for each book.' }, href: '/modules/fixed-assets' },
        { shot: '02-cash-06-sl11', note: { ar: 'الفوترة: المسلّم غير المفوتر بأعماره.', en: 'Billing: delivered but not billed, by age.' }, href: '/modules/sales' },
        { shot: '07-inv-06-inv-017', note: { ar: 'على الجوال: مؤشرات المستودع لقائده.', en: 'On mobile: warehouse indicators for its lead.' }, href: '/modules/inventory' },
      ],
    },
    {
      id: 'insights',
      kind: 'scope',
      lede: {
        ar: 'المؤشر بلا تعريف رقمٌ للنقاش لا للقرار. هذه حالة كل مجموعة مؤشرات كما سُجلت في آخر تحقق من النظام.',
        en: 'An indicator without a definition is a number to argue about, not to decide on. Here is the status of each group of indicators as recorded in the latest system check.',
      },
      items: [
        { title: { ar: 'كل بطاقة بتعريفها ومصدرها', en: 'Every card with its definition and source' }, body: { ar: 'متاح الآن على لوحات الإدارة.', en: 'Available now on the management boards.' }, tier: 'available', ids: ['R7'], shot: '01-cfo-05-r7' },
        { title: { ar: 'تنبيه النطاق المقيد', en: 'Restricted-scope warning' }, body: { ar: 'يظهر حين لا تغطي صلاحيتك كل البيانات.', en: 'Shown when your permission does not cover all the data.' }, tier: 'available', ids: ['R2'], shot: '09-rep-02-r2' },
        { title: { ar: 'ستة مؤشرات لكل مساحة عمل', en: 'Six indicators for each workspace' }, body: { ar: 'مؤشرات مبنية لمساحات العمل العشرين، وتمر الآن باختبار القبول لكل دور قبل إتاحتها.', en: 'Indicators built for the twenty workspaces, now going through acceptance testing for each role before release.' }, tier: 'verifying', ids: insightsBuilt },
        { title: { ar: 'لوحات شخصية محفوظة', en: 'Personal saved dashboards' }, body: { ar: 'مبنية، وبانتظار اختبار الحفظ قبل إتاحتها.', en: 'Built, awaiting save testing before release.' }, tier: 'verifying', ids: ['E5'] },
        { title: { ar: 'الاعتمادات و«شغلي» على الصفحة التنفيذية', en: 'Approvals and “My Work” on the executive home' }, body: { ar: 'متاحان في القائمة الآن، ودمجهما في الصفحة التنفيذية قيد الإكمال.', en: 'Both are available in the menu today; bringing them onto the executive home is being completed.' }, tier: 'verifying', ids: ['E4'] },
        { title: { ar: 'توحيد مجموعة الشركات', en: 'Group consolidation' }, body: { ar: 'يُحدَّد مع سياسة المجموعة المحاسبية أثناء التهيئة.', en: 'Defined with the group’s accounting policy during set-up.' }, tier: 'scoped', ids: ['E6'] },
      ],
    },
    {
      id: 'cta',
      kind: 'cta',
      body: {
        ar: 'نعرض لك لوحات الإدارة على بيانات شركة تجريبية، ثم نحدد المؤشرات التي تحتاجها إدارتك أولًا.',
        en: 'We show you the management boards on a demo company, then agree which indicators your management needs first.',
      },
      interest: { ar: 'لوحات الإدارة التنفيذية', en: 'Executive dashboards' },
    },
  ],
};

export default page;
