import type { ProPageContent } from '../types';

// Advanced Capabilities (V4 pages 30–31, 33). An explorer by outcome: every item is complete & verified and
// shown on its own real screen; the tiers section states plainly what is still being verified or set up.
const page: ProPageContent = {
  key: 'capabilities',
  sections: [
    {
      id: 'explorer',
      kind: 'explorer',
      lede: {
        ar: 'اختر النتيجة التي تهمك، وشاهد القدرة على شاشتها الحقيقية في DIGIT Pro.',
        en: 'Pick the outcome you care about, and see the capability on its real DIGIT Pro screen.',
      },
      themes: [
        { id: '360', label: { ar: 'رؤية 360', en: '360° views' } },
        { id: 'documents', label: { ar: 'مستندات مترابطة', en: 'Connected documents' } },
        { id: 'exceptions', label: { ar: 'الاستثناءات والاعتمادات', en: 'Exceptions & approvals' } },
        { id: 'work', label: { ar: 'البحث والعمل اليومي', en: 'Search & daily work' } },
        { id: 'insight', label: { ar: 'المؤشرات والتقارير', en: 'Indicators & reports' } },
      ],
      items: [
        { theme: '360', id: 'SL1', title: { ar: 'ملف العميل 360', en: 'Customer 360' }, body: { ar: 'الائتمان والتعرض ودورة البيع والأعمار والتسعير في صفحة، حسب صلاحية من يفتحها.', en: 'Credit, exposure, sales cycle, ageing and pricing on one page, per the viewer’s permissions.' }, shot: '04-360-01-sl1' },
        { theme: '360', id: 'PUR-007', title: { ar: 'ملف المورد 360', en: 'Supplier 360' }, body: { ar: 'الأوامر المفتوحة والاستلامات للفوترة والفواتير غير المدفوعة.', en: 'Open orders, receipts to bill and unpaid bills.' }, shot: '04-360-02-pur-007' },
        { theme: '360', id: 'IN2', title: { ar: 'ملف الصنف 360', en: 'Item 360' }, body: { ar: 'الكميات لكل مستودع وآخر الحركات وأثرها في القيمة.', en: 'Quantities per warehouse and the latest movements with their value effect.' }, shot: '04-360-03-in2' },
        { theme: '360', id: 'FA2', title: { ar: 'ملف الأصل 360', en: 'Asset 360' }, body: { ar: 'التكلفة والقيمة الدفترية وخط زمني من فاتورة الشراء إلى قيود الإهلاك.', en: 'Cost, book value and a timeline from purchase invoice to depreciation entries.' }, shot: '04-360-04-fa2' },
        { theme: '360', id: 'D9', title: { ar: 'لوحة الطرف داخل المستند', en: 'Party panel inside the document' }, body: { ar: 'سياق العميل أو المورد بجانب الفاتورة دون مغادرتها.', en: 'The customer or supplier context next to the invoice without leaving it.' }, shot: '04-360-05-d9' },
        { theme: 'documents', id: 'D1', title: { ar: 'شريط مراحل المستند', en: 'Document stage strip' }, body: { ar: 'أين يقف المستند في رحلته الآن.', en: 'Where the document stands in its journey now.' }, shot: '03-doc-01-d1' },
        { theme: 'documents', id: 'D2', title: { ar: 'الحالة على خمسة محاور', en: 'Status on five axes' }, body: { ar: 'الطلب والحجز والتسليم والفوترة والائتمان، كل منها منفصل.', en: 'Order, reservation, delivery, billing and credit, each separate.' }, shot: '03-doc-02-d2' },
        { theme: 'documents', id: 'D3', title: { ar: 'المستندات المرتبطة بعدّاد', en: 'Related documents with counts' }, body: { ar: 'أزرار تفتح العروض والأوامر والتسليمات والفواتير المرتبطة.', en: 'Buttons that open the linked quotes, orders, deliveries and invoices.' }, shot: '03-doc-03-d3' },
        { theme: 'documents', id: 'D13', title: { ar: 'الحقول المهمة أولًا', en: 'Key fields first' }, body: { ar: 'الطرف والحساب وتاريخ الاستحقاق في أعلى المستند.', en: 'Party, account and due date at the top of the document.' }, shot: '03-doc-05-d13' },
        { theme: 'documents', id: 'SL5', title: { ar: 'المتاح على سطر البيع', en: 'Availability on the sales line' }, body: { ar: 'الفعلي والمحجوز والمتوقع والموعد الموعود لكل بند.', en: 'Actual, reserved, projected and the promised date for each line.' }, shot: '05-sales-02-sl5' },
        { theme: 'documents', id: 'SL7', title: { ar: '«لماذا هذا السعر؟»', en: '“Why this price?”' }, body: { ar: 'مصدر السعر أو الخصم مشروح على السطر.', en: 'The source of the price or discount explained on the line.' }, shot: '05-sales-03-sl7' },
        { theme: 'exceptions', id: 'D5', title: { ar: '«لماذا لا يمكن ترحيله؟»', en: '“Why can’t this post?”' }, body: { ar: 'سبب المنع مكتوب على المستند.', en: 'The blocking reason written on the document.' }, shot: '03-doc-04-d5' },
        { theme: 'exceptions', id: 'SL6', title: { ar: 'حظر ائتمان بسبب مقروء', en: 'Credit hold with a readable reason' }, body: { ar: 'سبب الإيقاف والإجراء المسموح.', en: 'The reason for the hold and the permitted action.' }, shot: '02-cash-02-sl6' },
        { theme: 'exceptions', id: 'F19', title: { ar: 'فواتير موردين مكررة', en: 'Duplicate supplier bills' }, body: { ar: 'نفس المورد والرقم، أو نفس الإجمالي خلال 7 أيام.', en: 'Same supplier and number, or same total within 7 days.' }, shot: '02-cash-03-f19' },
        { theme: 'exceptions', id: 'F8', title: { ar: 'استثناءات الذمم الدائنة', en: 'Payables exceptions' }, body: { ar: 'فروقات المطابقة والفواتير الموقوفة.', en: 'Matching variances and held bills.' }, shot: '02-cash-04-f8' },
        { theme: 'exceptions', id: 'S4', title: { ar: 'صندوق اعتمادات موحد', en: 'Unified approvals inbox' }, body: { ar: 'كل ما ينتظر اعتمادك في قائمة.', en: 'Everything awaiting your approval in one list.' }, shot: '10-ctl-03-s4' },
        { theme: 'exceptions', id: 'S7', title: { ar: 'شارات الاستثناءات', en: 'Exception badges' }, body: { ar: 'عدد ما يحتاج انتباهًا بجانب كل مساحة عمل.', en: 'The count needing attention next to each workspace.' }, shot: '10-ctl-04-s7' },
        { theme: 'work', id: 'S1', title: { ar: 'البحث وأوامر Ctrl+K', en: 'Search and Ctrl+K commands' }, body: { ar: 'الشاشة أو المستند أو الأمر في خطوة.', en: 'A screen, document or command in one step.' }, shot: '10-ctl-01-s1' },
        { theme: 'work', id: 'S3', title: { ar: 'عدّاد «شغلي»', en: '“My Work” counter' }, body: { ar: 'ما ينتظرك أنت.', en: 'What is waiting for you.' }, shot: '10-ctl-02-s3' },
        { theme: 'work', id: 'S10', title: { ar: 'مساعدة داخل المهمة', en: 'Help inside the task' }, body: { ar: 'ما يلزم قبل الخطوة التالية داخل الشاشة.', en: 'What is needed before the next step, inside the screen.' }, shot: '03-doc-06-s10' },
        { theme: 'work', id: 'S9', title: { ar: 'عربي، هجري وميلادي', en: 'Arabic, Hijri and Gregorian' }, body: { ar: 'من اليمين لليسار وبالتقويمين.', en: 'Right-to-left and in both calendars.' }, shot: '09-rep-07-s9' },
        { theme: 'work', id: 'INV-017', title: { ar: 'المستودع على الجوال', en: 'Warehouse on mobile' }, body: { ar: 'مؤشرات المستودع بمقاس الهاتف.', en: 'Warehouse indicators sized for a phone.' }, shot: '07-inv-06-inv-017' },
        { theme: 'insight', id: 'R7', title: { ar: 'تعريف ومصدر لكل بطاقة', en: 'Definition and source on every card' }, body: { ar: 'عدد السجلات والفترة ورابط التعريف.', en: 'Record count, period and a definition link.' }, shot: '01-cfo-05-r7' },
        { theme: 'insight', id: 'E2', title: { ar: 'توقع النقد 7/30/90 يومًا', en: '7/30/90-day cash forecast' }, body: { ar: 'الفعلي منفصل عن المجدول والسيناريو.', en: 'Actuals kept apart from scheduled and scenario.' }, shot: '01-cfo-02-e2' },
        { theme: 'insight', id: 'R6', title: { ar: 'مصمم القوائم المالية', en: 'Financial statement designer' }, body: { ar: 'القوائم بنفس الفلاتر وعروض محفوظة.', en: 'Statements with the same filters and saved views.' }, shot: '09-rep-03-r6' },
        { theme: 'insight', id: 'L1', title: { ar: 'Pivot وتقويم', en: 'Pivot and calendar' }, body: { ar: 'نفس القائمة كجدول محوري أو تقويم.', en: 'The same list as a pivot table or calendar.' }, shot: '09-rep-04-l1' },
        { theme: 'insight', id: 'L4', title: { ar: 'تصدير نظيف', en: 'Clean export' }, body: { ar: 'Excel بنفس الفلاتر والأعمدة.', en: 'Excel with the same filters and columns.' }, shot: '09-rep-05-l4' },
        { theme: 'insight', id: 'IN11', title: { ar: 'تحليل ABC والدوران', en: 'ABC and turnover analysis' }, body: { ar: 'فئات الأصناف بقيم الاستهلاك والمخزون.', en: 'Item classes by consumption and stock value.' }, shot: '07-inv-04-in11' },
        { theme: 'insight', id: 'PU12', title: { ar: 'بطاقة أداء المورد', en: 'Supplier scorecard' }, body: { ar: 'الموعد والقبول والمهلة والإنفاق.', en: 'On time, acceptance, lead time and spend.' }, shot: '06-pur-03-pu12' },
      ],
    },
    {
      id: 'document',
      kind: 'anatomy',
      lede: {
        ar: 'المستند في DIGIT Pro يقول أين يقف، ومع من يرتبط، وما الذي يمنعه، قبل أن تقرأ حقلًا واحدًا.',
        en: 'In DIGIT Pro a document tells you where it stands, what it is linked to and what blocks it, before you read a single field.',
      },
      lead: { id: '03-doc-01-d1' },
      terms: [
        { term: { ar: 'شريط المراحل', en: 'Stage strip' }, def: { ar: 'العميل ثم العرض ثم الأمر ثم التسليم ثم الفاتورة، والمرحلة الحالية مميزة.', en: 'Customer, quote, order, delivery, invoice, with the current stage highlighted.' } },
        { term: { ar: 'نسب التسليم والفوترة', en: 'Delivery and billing progress' }, def: { ar: 'كم سُلّم وكم فُوتر من الأمر، بنسبة واضحة.', en: 'How much of the order has been delivered and billed, as a clear percentage.' } },
        { term: { ar: 'دليل المستند', en: 'Document guide' }, def: { ar: 'الحالة والتنبيهات وما تبقى قبل الخطوة التالية.', en: 'Status, warnings and what remains before the next step.' } },
        { term: { ar: 'توفر البنود', en: 'Line availability' }, def: { ar: 'الفعلي والمحجوز والمتوقع لكل بند في كل مستودع، مع الموعد الموعود.', en: 'Actual, reserved and projected for each line in each warehouse, with the promised date.' } },
        { term: { ar: 'المستندات المرتبطة', en: 'Related documents' }, def: { ar: 'أزرار بعدّاد تفتح ما قبل المستند وما بعده.', en: 'Buttons with counts that open what came before and after the document.' } },
      ],
      support: [{ id: '03-doc-03-d3' }, { id: '03-doc-02-d2' }],
      note: { ar: 'الحفظ والاعتماد والترحيل تبقى إجراءات النظام الأصلية بصلاحياتها؛ الواجهة تشرحها ولا تتجاوزها.', en: 'Saving, approval and posting remain the system’s own actions with their permissions; the interface explains them and never bypasses them.' },
    },
    {
      id: 'tiers',
      kind: 'scope',
      lede: {
        ar: 'نصف كل قدرة بحالتها الحقيقية: متاحة الآن، أو مبنية ونؤكدها لك في العرض التوضيحي، أو تُحدَّد أثناء التهيئة مع منشأتك.',
        en: 'We describe every capability by its real status: available now, built and confirmed for you in your demo, or defined with your company during set-up.',
      },
      items: [
        { title: { ar: 'المستند والرؤية 360', en: 'Documents and 360° views' }, body: { ar: 'المراحل والمحاور الخمسة والمستندات المرتبطة ولوحة الطرف وملفات 360.', en: 'Stages, the five axes, related documents, the party panel and the 360° views.' }, tier: 'available', ids: ['D1', 'D2', 'D3', 'D9', 'SL1', 'IN2', 'FA2'], shot: '03-doc-03-d3' },
        { title: { ar: 'البحث والعمل اليومي', en: 'Search and daily work' }, body: { ar: 'البحث وأوامر Ctrl+K والأحدث والمثبّت وعدّاد «شغلي».', en: 'Search, Ctrl+K commands, recent and pinned, and the “My Work” counter.' }, tier: 'available', ids: ['S1', 'S2', 'S3'] },
        { title: { ar: 'الحفظ وإنشاء المستند التالي', en: 'Save and create the next document' }, body: { ar: 'إنشاء الفاتورة من الأمر مع اختيار البنود.', en: 'Create the invoice from the order, picking lines.' }, tier: 'verifying', ids: ['D7', 'D8'] },
        { title: { ar: 'إيقاف المستند وعكسه بدل حذفه', en: 'Hold, release and reverse instead of delete' }, body: { ar: 'إجراءات تحفظ أثر المستند الأصلي.', en: 'Actions that preserve the original document’s trail.' }, tier: 'verifying', ids: ['D11'] },
        { title: { ar: 'المعالجة الجماعية بنتيجة لكل سطر', en: 'Bulk processing with a result per row' }, body: { ar: 'تنفيذ إجراء على عدة مستندات مع نتيجة كل واحد.', en: 'Run an action on several documents with each one’s result.' }, tier: 'verifying', ids: ['L3'] },
        { title: { ar: 'المستندات المتكررة', en: 'Recurring documents' }, body: { ar: 'فواتير وقيود دورية بجدول.', en: 'Periodic invoices and entries on a schedule.' }, tier: 'verifying', ids: ['D12'] },
        { title: { ar: 'هامش البيع واعتماد الخصم', en: 'Sales margin guard and discount approval' }, body: { ar: 'حدود الخصم ومن يعتمدها حسب سياسة منشأتك.', en: 'Discount limits and who approves them, per your company policy.' }, tier: 'scoped', ids: ['SL8'] },
        { title: { ar: 'بوابة العميل والتوقيع الإلكتروني', en: 'Customer portal and e-signature' }, body: { ar: 'تعتمد على خدمة خارجية تُحدد في نطاق المشروع.', en: 'Depends on an external service defined in the project scope.' }, tier: 'scoped', ids: ['SL4', 'SEL-017'] },
      ],
    },
    {
      id: 'cta',
      kind: 'cta',
      body: {
        ar: 'اختر القدرة التي تريد رؤيتها، ونعرضها في عرض توضيحي مباشر.',
        en: 'Pick the capability you want to see, and we will show it in a live walkthrough.',
      },
      interest: { ar: 'القدرات المتقدمة', en: 'Advanced capabilities' },
    },
  ],
};

export default page;
