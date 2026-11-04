import type { ProPageContent } from '../types';

// Settings & Governance (V4 pages 32 and 39). A control composition: permission shown as part of the data,
// approvals with readable reasons, working context, and an explicit split between what is in the product today
// and what is defined during set-up (company policy, e-invoicing, integrations).
const page: ProPageContent = {
  key: 'governance',
  sections: [
    {
      id: 'access',
      kind: 'chapter',
      kicker: { ar: 'الصلاحيات', en: 'Permissions' },
      lede: {
        ar: 'حين لا يملك المستخدم صلاحية رؤية رقم، يقول النظام ذلك صراحة. في ملف العميل أدناه، يرى مستخدم المبيعات «غير مسموح» مكان الأرصدة، لا صفرًا قد يُفهم خطأً.',
        en: 'When a user may not see a figure, the system says so explicitly. In the customer view below, a sales user sees “not permitted” where the balances are, never a zero that could be misread.',
      },
      lead: { id: '04-360-01-sl1' },
      points: [
        { id: 'SL1', title: { ar: 'الرؤية حسب الدور', en: 'Visibility by role' }, body: { ar: 'نفس الصفحة تُظهر لكل دور ما يحق له فقط.', en: 'The same page shows each role only what it is entitled to.' } },
        { id: 'R2', title: { ar: 'تنبيه النطاق المقيد', en: 'Restricted-scope warning' }, body: { ar: 'التقرير يقول إن صلاحيتك تغطي جزءًا من البيانات.', en: 'The report says when your permission covers only part of the data.' } },
        { id: 'R3', title: { ar: 'فهرس التقارير يتبع الصلاحية', en: 'Report directory follows permission' }, body: { ar: 'لا يظهر تقرير لا تملك تشغيله.', en: 'No report appears that you cannot run.' } },
      ],
      reports: [],
      support: ['09-rep-02-r2'],
    },
    {
      id: 'approvals',
      kind: 'chapter',
      flip: true,
      kicker: { ar: 'الاعتمادات', en: 'Approvals' },
      lede: {
        ar: 'كل ما ينتظر اعتمادك في صندوق واحد، وكل مستند ممنوع من الترحيل يذكر سببه قبل أن تحاول.',
        en: 'Everything awaiting your approval in one inbox, and every document blocked from posting states its reason before you try.',
      },
      lead: { id: '10-ctl-03-s4' },
      points: [
        { id: 'S4', title: { ar: 'صندوق اعتمادات موحد', en: 'Unified approvals inbox' }, body: { ar: 'طلبات الإدارات المختلفة بحالتها وتاريخها في قائمة واحدة.', en: 'Requests from different departments with their status and date in one list.' } },
        { id: 'D5', title: { ar: '«لماذا لا يمكن ترحيله؟»', en: '“Why can’t this post?”' }, body: { ar: 'السبب مكتوب على المستند.', en: 'The reason is written on the document.' } },
        { id: 'S10', title: { ar: 'ما يلزم قبل الخطوة التالية', en: 'What is needed before the next step' }, body: { ar: 'التنبيهات والحالة داخل المهمة نفسها.', en: 'Warnings and status inside the task itself.' } },
        { id: 'S7', title: { ar: 'شارات الاستثناءات', en: 'Exception badges' }, body: { ar: 'ما يحتاج انتباهًا ظاهر على القائمة.', en: 'What needs attention is visible in the menu.' } },
      ],
      reports: [],
      support: ['03-doc-04-d5', '03-doc-06-s10'],
    },
    {
      id: 'context',
      kind: 'features',
      layout: 'rows',
      lede: {
        ar: 'المستخدم يعمل بلغته وتقويمه، ويجد المستند أو الشاشة بالبحث دون أن يفقد مكانه.',
        en: 'Users work in their own language and calendar, and find a document or screen by search without losing their place.',
      },
      items: [
        { id: 'S9', title: { ar: 'عربي وإنجليزي، هجري وميلادي', en: 'Arabic and English, Hijri and Gregorian' }, body: { ar: 'الواجهة من اليمين لليسار بالعربية ومن اليسار لليمين بالإنجليزية، والتاريخ بالتقويمين.', en: 'Right-to-left in Arabic, left-to-right in English, with dates in both calendars.' }, shot: '09-rep-07-s9' },
        { id: 'S1', title: { ar: 'البحث الشامل وأوامر Ctrl+K', en: 'Global search and Ctrl+K commands' }, body: { ar: 'الوصول إلى الشاشة أو المستند أو الأمر حسب صلاحياتك.', en: 'Reach a screen, document or command within your permissions.' }, shot: '10-ctl-01-s1' },
        { id: 'S2', title: { ar: 'الأحدث والمثبّت', en: 'Recent and pinned' }, body: { ar: 'المستندات التي عملت عليها مؤخرًا أو ثبّتها في متناولك.', en: 'Documents you worked on recently or pinned stay within reach.' } },
        { id: 'S3', title: { ar: 'عدّاد «شغلي»', en: '“My Work” counter' }, body: { ar: 'ما ينتظرك من مهام واعتمادات.', en: 'The tasks and approvals waiting for you.' }, shot: '10-ctl-02-s3' },
      ],
    },
    {
      id: 'scope',
      kind: 'scope',
      lede: {
        ar: 'الحوكمة نصفها في النظام ونصفها في سياسة منشأتك. هذا ما يعمل اليوم، وما يمر باختبار القبول، وما نحدده معك أثناء التهيئة.',
        en: 'Governance is half in the system and half in your company’s policy. Here is what works today, what is in acceptance testing, and what we define with you during set-up.',
      },
      items: [
        { title: { ar: 'الرؤية والتشغيل حسب الصلاحية', en: 'Visibility and running by permission' }, body: { ar: 'تنبيه النطاق المقيد، وفهرس تقارير يتبع الصلاحية، وصندوق اعتمادات موحد.', en: 'Restricted-scope warnings, a permission-aware report directory and a unified approvals inbox.' }, tier: 'available', ids: ['R2', 'R3', 'S4'], shot: '10-ctl-03-s4' },
        { title: { ar: 'معاينة صلاحيات الدور', en: 'Role permission preview' }, body: { ar: 'عرض للقراءة فقط لما يستطيع كل دور رؤيته وفعله.', en: 'A read-only view of what each role can see and do.' }, tier: 'verifying', ids: ['PL1'] },
        { title: { ar: 'مبدّل الشركة والفرع والفترة', en: 'Company, branch and period switcher' }, body: { ar: 'سياق موحد للشركة والفترة والمقارنة في كل الشاشات.', en: 'One company, period and comparison context across all screens.' }, tier: 'verifying', ids: ['S6'] },
        { title: { ar: 'سجل النشاط وتاريخ التغيير', en: 'Activity and change history' }, body: { ar: 'التعليقات والإسناد والمتابعة وسجل التغييرات على المستند.', en: 'Comments, assignment, following and the change log on the document.' }, tier: 'verifying', ids: ['D10'] },
        { title: { ar: 'معاينة الأثر قبل الترحيل', en: 'Impact preview before posting' }, body: { ar: 'أثر المستند على الحسابات والمخزون قبل ترحيله.', en: 'The document’s effect on accounts and stock before it posts.' }, tier: 'verifying', ids: ['D4'] },
        { title: { ar: 'مراقبة التكاملات والمهام الخلفية', en: 'Integration and job monitor' }, body: { ar: 'حالة المهام المجدولة والتكاملات في شاشة واحدة.', en: 'The state of scheduled jobs and integrations on one screen.' }, tier: 'verifying', ids: ['PL3', 'PL6'] },
        { title: { ar: 'مسارات الاعتماد وحدود الصلاحية', en: 'Approval paths and authority limits' }, body: { ar: 'حسب المبلغ والفرع والفئة؛ تُبنى على سياسة منشأتك أثناء التهيئة.', en: 'By amount, branch and category; built on your company’s policy during set-up.' }, tier: 'scoped', ids: ['PL7', 'S5'] },
        { title: { ar: 'إعداد الشركة واستيراد البيانات', en: 'Company set-up and data import' }, body: { ar: 'الشركة ودليل الحسابات والضريبة والمستودعات والمستخدمون والأرصدة الافتتاحية.', en: 'Company, chart of accounts, tax, warehouses, users and opening balances.' }, tier: 'scoped', ids: ['PL5', 'PL2'] },
        { title: { ar: 'الفوترة الإلكترونية', en: 'E-invoicing' }, body: { ar: 'يدعم الربط مع منظومة الفوترة الإلكترونية (فاتورة)، ويُفعّل حسب نطاق التهيئة المتفق عليه.', en: 'Supports integration with the e-invoicing system (Fatoora), activated within the agreed set-up scope.' }, tier: 'scoped', ids: ['F15', 'F16'] },
      ],
    },
    {
      id: 'cta',
      kind: 'cta',
      body: {
        ar: 'نراجع معك الأدوار والاعتمادات وحدود الصلاحية التي تحتاجها منشأتك، ونعرضها في عرض مباشر.',
        en: 'We review with you the roles, approvals and authority limits your company needs, and show them in a live walkthrough.',
      },
      interest: { ar: 'الإعدادات والحوكمة', en: 'Settings & governance' },
    },
  ],
};

export default page;
