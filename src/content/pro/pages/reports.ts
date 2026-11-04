import type { ProPageContent } from '../types';

// Report Center (V4 pages 37–38). A directory organised by question and department, never an album of report
// screenshots: featured entries explain question → role → records → filters → decision; the full list comes
// from reports.ts (only reports the registry records as running).
const page: ProPageContent = {
  key: 'reports',
  sections: [
    {
      id: 'featured',
      kind: 'report-feature',
      lede: {
        ar: 'التقرير المفيد يجيب عن سؤال محدد لدور محدد، من سجلات معروفة وبفلاتر واضحة. هذه ستة تقارير كما تُقرأ في DIGIT Pro.',
        en: 'A useful report answers a specific question for a specific role, from known records and with clear filters. Here are six reports as they read in DIGIT Pro.',
      },
      items: [
        {
          key: 'Accounts Receivable',
          question: { ar: 'من تأخر في السداد، ومنذ متى؟', en: 'Who is late paying, and for how long?' },
          role: { ar: 'محاسب الذمم ومراقب الائتمان', en: 'AR accountant and credit controller' },
          records: { ar: 'فواتير المبيعات وسندات القبض والإشعارات الدائنة', en: 'Sales invoices, payment entries and credit notes' },
          filters: { ar: 'الشركة، تاريخ التقرير، العميل، فئات العمر', en: 'Company, report date, customer, age buckets' },
          decision: { ar: 'من نطالب أولًا، ومن نوقف البيع له بالأجل.', en: 'Whom to chase first, and whom to stop selling to on credit.' },
          shot: '02-cash-01-f9',
          shotNote: { ar: 'مساحة التحصيل تقرأ نفس الذمم وتعرض الصافي القابل للتحصيل لكل عميل.', en: 'The collections workspace reads the same receivables and shows the net collectible per customer.' },
        },
        {
          key: 'Profit and Loss Statement',
          question: { ar: 'هل القوائم مبنية على تصنيف حسابات واضح؟', en: 'Are the statements built on a clear account classification?' },
          role: { ar: 'المدير المالي والمراقب المالي', en: 'CFO and financial controller' },
          records: { ar: 'قيود دفتر الأستاذ العام المرحّلة', en: 'Posted general ledger entries' },
          filters: { ar: 'الشركة، الفترة، الدفتر المالي، مركز التكلفة', en: 'Company, period, finance book, cost centre' },
          decision: { ar: 'إقفال الفترة وعرض النتيجة على الإدارة.', en: 'Close the period and present the result to management.' },
          shot: '09-rep-03-r6',
          shotNote: { ar: 'مصمم القوائم المالية: الأرباح والخسائر والمركز المالي والتدفق النقدي بنفس الفلاتر.', en: 'The financial statement designer: profit and loss, financial position and cash flow with the same filters.' },
        },
        {
          key: 'Delivered Items To Be Billed',
          question: { ar: 'ما الذي سلّمناه ولم نفوتره؟', en: 'What have we delivered but not billed?' },
          role: { ar: 'عمليات المبيعات ومحاسب الذمم', en: 'Sales operations and AR accountant' },
          records: { ar: 'إشعارات التسليم وفواتير المبيعات', en: 'Delivery notes and sales invoices' },
          filters: { ar: 'الشركة، العميل، تاريخ التسليم', en: 'Company, customer, delivery date' },
          decision: { ar: 'ما نفوتره اليوم حتى لا يتأخر التحصيل.', en: 'What to bill today so collection is not delayed.' },
          shot: '02-cash-06-sl11',
          shotNote: { ar: 'نفس الأرقام كبطاقة بأعمارها وأرقام إشعارات التسليم.', en: 'The same figures as a card by age, with the delivery note numbers.' },
        },
        {
          key: 'Purchase Order Analysis',
          question: { ar: 'ما الذي التزمنا به للموردين ولم يصل؟', en: 'What have we committed to suppliers that has not arrived?' },
          role: { ar: 'المشتري وقائد المشتريات', en: 'Buyer and procurement lead' },
          records: { ar: 'أوامر الشراء وبنودها وإيصالات الاستلام', en: 'Purchase orders, their lines and purchase receipts' },
          filters: { ar: 'الشركة، المورد، الحالة، تاريخ الأمر', en: 'Company, supplier, status, order date' },
          decision: { ar: 'أي مورد نتابع، وأي التزام يؤثر على السيولة القادمة.', en: 'Which supplier to chase, and which commitment affects upcoming cash.' },
          shot: '06-pur-01-pu6',
          shotNote: { ar: 'بطاقة الالتزامات المفتوحة تستثني المغلق والمكتمل والملغى.', en: 'The open commitments card excludes closed, completed and cancelled orders.' },
        },
        {
          key: 'Stock and Account Value Comparison',
          question: { ar: 'هل قيمة المخزون مطابقة لحسابها؟', en: 'Does stock value agree with its account?' },
          role: { ar: 'مراقب المخزون والمراقب المالي', en: 'Stock controller and financial controller' },
          records: { ar: 'قيود دفتر المخزون وقيود الأستاذ العام', en: 'Stock ledger entries and general ledger entries' },
          filters: { ar: 'الشركة، تاريخ التقييم، المستودع، الحساب', en: 'Company, valuation date, warehouse, account' },
          decision: { ar: 'هل قيمة المخزون جاهزة للإقفال.', en: 'Whether stock value is ready for close.' },
          shot: '07-inv-03-inv-014',
          shotNote: { ar: 'عارض التقرير بمعايير محفوظة وتصدير Excel وPDF.', en: 'The report viewer with saved criteria and Excel and PDF export.' },
        },
        {
          key: 'Asset Depreciations and Balances',
          question: { ar: 'كيف تحرّكت أرصدة الأصول في الفترة؟', en: 'How did asset balances move in the period?' },
          role: { ar: 'محاسب الأصول والمدير المالي', en: 'Asset accountant and CFO' },
          records: { ar: 'الأصول وجداول الإهلاك وقيوده', en: 'Assets, depreciation schedules and entries' },
          filters: { ar: 'الشركة، الفترة، فئة الأصل، الدفتر المالي', en: 'Company, period, asset category, finance book' },
          decision: { ar: 'هل الأرصدة مطابقة للأستاذ قبل الإقفال.', en: 'Whether balances agree with the ledger before close.' },
          shot: '08-ast-02-fa5',
          shotNote: { ar: 'جسر حركة الأصول من الرصيد الافتتاحي إلى الختامي.', en: 'The asset movement bridge from opening to closing balance.' },
        },
      ],
    },
    {
      id: 'directory',
      kind: 'report-directory',
      lede: {
        ar: 'الفهرس يضم التقارير التي ثبت تشغيلها في آخر تحقق من النظام، بأسمائها العربية وأسمائها كما تظهر في الواجهة الإنجليزية. تقارير أخرى تُضاف حين تكتمل فلاترها وصلاحياتها.',
        en: 'The directory lists the reports confirmed running in the latest system check, with their names as they appear in the interface. More are added once their filters and permissions are complete.',
      },
    },
    {
      id: 'controls',
      kind: 'features',
      layout: 'grid',
      lede: {
        ar: 'كل تقرير يعمل بصلاحية من يشغّله وبنطاق شركته وفترته؛ لا رقم ناقص بصمت ولا تصدير لما لا يُسمح برؤيته.',
        en: 'Every report runs under the permissions of whoever runs it, within their company and period; no silently incomplete figure and no export of what you may not see.',
      },
      items: [
        { id: 'R2', title: { ar: 'تنبيه النطاق المقيد', en: 'Restricted-scope warning' }, body: { ar: 'إن كانت صلاحيتك تغطي جزءًا من البيانات، يقول التقرير ذلك صراحة.', en: 'If your permission covers only part of the data, the report says so explicitly.' }, shot: '09-rep-02-r2' },
        { id: 'R3', title: { ar: 'الفهرس يتبع صلاحية التشغيل', en: 'The directory follows run permission' }, body: { ar: 'يظهر لك من الفهرس ما تملك صلاحية تشغيله فقط.', en: 'You see only the reports you are permitted to run.' } },
        { id: 'L4', title: { ar: 'تصدير نظيف', en: 'Clean export' }, body: { ar: 'تصدير Excel بنفس الفلاتر والأعمدة الظاهرة.', en: 'Excel export with the same filters and visible columns.' }, shot: '09-rep-05-l4' },
        { id: 'R7', title: { ar: 'تعريف ومصدر لكل بطاقة', en: 'Definition and source on every card' }, body: { ar: 'المؤشر يذكر عدد سجلاته وفترته ويفتح تعريفه.', en: 'An indicator states its records and period and opens its definition.' }, shot: '01-cfo-05-r7' },
        { id: 'L1', title: { ar: 'Pivot وتقويم من القائمة', en: 'Pivot and calendar from the list' }, body: { ar: 'تحليل سريع دون انتظار تقرير جديد.', en: 'Quick analysis without waiting for a new report.' }, shot: '09-rep-04-l1' },
        { id: 'S9', title: { ar: 'عربي، هجري وميلادي', en: 'Arabic, Hijri and Gregorian' }, body: { ar: 'واجهة من اليمين لليسار، والتاريخ بالتقويمين.', en: 'A right-to-left interface, with dates in both calendars.' }, shot: '09-rep-07-s9' },
      ],
    },
    {
      id: 'trace',
      kind: 'flow',
      lede: {
        ar: 'الرقم في التقرير ليس نهاية الطريق: من المؤشر إلى التقرير بنفس الفلاتر، ثم إلى المستند الأصلي، ثم الرجوع إلى نفس السياق.',
        en: 'A figure in a report is not the end of the road: from indicator to report with the same filters, then to the original document, then back to the same context.',
      },
      steps: [
        { title: { ar: 'المؤشر', en: 'Indicator' }, body: { ar: 'بطاقة بتعريفها وعدد سجلاتها وفترتها.', en: 'A card with its definition, record count and period.' }, shot: '01-cfo-05-r7' },
        { title: { ar: 'الفلتر والنطاق', en: 'Filter and scope' }, body: { ar: 'نفس الشركة والفترة وتاريخ التقييم والدفتر المالي، مع تنبيه إن كان النطاق مقيدًا.', en: 'The same company, period, valuation date and finance book, with a warning if the scope is restricted.' }, shot: '09-rep-02-r2' },
        { title: { ar: 'التقرير', en: 'Report' }, body: { ar: 'التقرير الأصلي بمعاييره المحفوظة، للعرض أو التصدير حسب الصلاحية.', en: 'The native report with its saved criteria, to view or export as permitted.' }, shot: '09-rep-05-l4' },
        { title: { ar: 'المستند الأصلي', en: 'Original document' }, body: { ar: 'الفاتورة أو القيد أو أمر البيع كما هو، بمراحله ومستنداته المرتبطة.', en: 'The invoice, entry or sales order as it is, with its stages and related documents.' }, doc: 'Sales Order', shot: '03-doc-01-d1' },
      ],
    },
  ],
};

export default page;
