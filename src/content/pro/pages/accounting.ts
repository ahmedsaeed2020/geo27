import type { ProPageContent } from '../types';

// Accounting & Finance (V4 pages 05–09: ACC-OPS, ACC-DUES, ACC-CASH, ACC-REPORT). Features listed as available are
// Run11.1 complete & verified; every screen is one of the 49 real DIGIT Pro captures.
const page: ProPageContent = {
  key: 'accounting',
  sections: [
    {
      id: 'intro',
      kind: 'intro',
      thesis: {
        ar: 'الهدف ليس ترحيل القيد فقط، بل قراءة أثره وإثبات مصدره ومتابعة أي انحراف قبل أن يصل إلى القوائم المالية.',
        en: 'The goal is not just to post the entry, but to read its effect, prove its source and follow any variance before it reaches the financial statements.',
      },
      question: { ar: 'من القيد والتحصيل إلى السيولة والإقفال: أين يقف كل رقم؟', en: 'From entry and collection to liquidity and close: where does each figure stand?' },
      sequence: [
        { ar: 'قيد يومية', en: 'Journal Entry' },
        { ar: 'سند دفع أو قبض', en: 'Payment Entry' },
        { ar: 'حركة بنكية', en: 'Bank Transaction' },
        { ar: 'دفتر الأستاذ وميزان المراجعة', en: 'General ledger & trial balance' },
      ],
      roles: [
        { ar: 'المحاسب', en: 'Accountant' },
        { ar: 'محاسب الذمم', en: 'AR/AP accountant' },
        { ar: 'أمين الخزينة', en: 'Treasurer' },
        { ar: 'المراقب المالي', en: 'Financial controller' },
        { ar: 'المدير المالي', en: 'CFO' },
      ],
    },
    {
      id: 'ACC-OPS',
      kind: 'workspace',
      ws: {
        code: 'ACC-OPS',
        question: { ar: 'هل القيد جاهز للمراجعة والترحيل؟', en: 'Is this entry ready for review and posting?' },
        lede: {
          ar: 'ترحيل قيود اليومية وتدقيقها ومعرفة سبب منع أي قيد من الترحيل، مع بقاء المستند الأصلي وأثره في دفتر الأستاذ العام كما هو.',
          en: 'Post and review journal entries and see why any entry is blocked from posting, while the original document and its general-ledger effect stay intact.',
        },
        roles: [{ ar: 'المحاسب', en: 'Accountant' }, { ar: 'المراقب المالي', en: 'Financial controller' }],
        overview: {
          body: {
            ar: 'دليل المستند يجمع حالة القيد وتنبيهاته وما تبقى قبل الخطوة التالية في مكان واحد. إن لم يكن الترحيل ممكنًا يظهر السبب مكتوبًا على المستند، لا رسالة خطأ عامة بعد الضغط.',
            en: 'The document guide brings the entry’s status, warnings and what remains before the next step into one place. When posting is not possible, the reason is written on the document itself rather than a generic error after you click.',
          },
          features: [
            { id: 'F1', title: { ar: 'بطاقات اليوميات في نظرة المحاسبة العامة', en: 'Journal cards on the accounting overview' }, body: { ar: 'اليوميات والقيود المسودة تظهر كبطاقات تفتح السجلات التي كوّنتها.', en: 'Journals and draft entries appear as cards that open the records behind them.' } },
            { id: 'D5', title: { ar: '«لماذا لا يمكن ترحيله؟»', en: '“Why can’t this post?”' }, body: { ar: 'سبب منع الترحيل مكتوب على المستند قبل أن تحاول.', en: 'The reason posting is blocked is written on the document before you try.' }, shot: '03-doc-04-d5' },
            { id: 'D13', title: { ar: 'الحقول المهمة أولًا', en: 'Key fields first' }, body: { ar: 'الطرف وقائمة الأسعار والحساب المدين وتاريخ الاستحقاق في أعلى المستند.', en: 'Party, price list, debit account and due date sit at the top of the document.' }, shot: '03-doc-05-d13' },
            { id: 'S10', title: { ar: 'مساعدة داخل المهمة', en: 'Help inside the task' }, body: { ar: 'تنبيهات المستند وحالته وما يلزم قبل الاعتماد داخل الشاشة نفسها.', en: 'The document’s warnings, status and what is needed before approval, inside the same screen.' }, shot: '03-doc-06-s10' },
          ],
          lead: { id: '03-doc-06-s10' },
          extra: [{ id: '03-doc-04-d5' }, { id: '03-doc-05-d13' }],
        },
        work: {
          docs: [
            { sys: 'Journal Entry', name: { ar: 'قيد يومية', en: 'Journal entry' }, role: { ar: 'المستند الذي يحمل الأثر المحاسبي ويمر بالمسودة والاعتماد والترحيل.', en: 'The document that carries the accounting effect through draft, approval and posting.' } },
            { sys: 'Account', name: { ar: 'الحساب', en: 'Account' }, role: { ar: 'موقع القيد في شجرة الحسابات ونوعه وعملته.', en: 'Where the entry sits in the chart of accounts, with its type and currency.' } },
            { sys: 'GL Entry', name: { ar: 'قيد دفتر الأستاذ', en: 'GL entry' }, role: { ar: 'السطر المرحّل الذي تُبنى عليه الموازين والقوائم.', en: 'The posted line every balance and statement is built from.' } },
          ],
          steps: [
            { ar: 'قيد مسودة', en: 'Draft entry' },
            { ar: 'مراجعة التوازن والحقول', en: 'Balance and field review' },
            { ar: 'صلاحية الترحيل', en: 'Posting permission' },
            { ar: 'دفتر الأستاذ', en: 'General ledger' },
          ],
          control: {
            ar: 'الترحيل يتم عبر إجراء النظام الأصلي وبصلاحية المستخدم؛ الواجهة تشرح الشروط وأسباب المنع ولا تتجاوزها.',
            en: 'Posting happens through the system’s own action and the user’s permission; the interface explains the conditions and blocking reasons and never bypasses them.',
          },
        },
        reports: {
          keys: ['General Ledger', 'Account Balance', 'Voucher-wise Balance', 'Trial Balance'],
          decision: { ar: 'هل القيود المرحّلة في الفترة متوازنة ومكتملة قبل المراجعة؟', en: 'Are the entries posted in the period balanced and complete before review?' },
        },
      },
    },
    {
      id: 'ACC-DUES',
      kind: 'workspace',
      ws: {
        code: 'ACC-DUES',
        question: { ar: 'أي الديون متأخر، وما الذي يمكن تحصيله فعلًا؟', en: 'Which debts are overdue, and what can actually be collected?' },
        lede: {
          ar: 'متابعة الذمم المدينة والدائنة والتحصيل والمدفوعات وحالات التخصيص، مع الفصل بين المتأخر الإجمالي وصافي القابل للتحصيل.',
          en: 'Follow receivables, payables, collections, payments and allocation, keeping gross overdue apart from what is net collectible.',
        },
        roles: [{ ar: 'محاسب الذمم', en: 'AR/AP accountant' }, { ar: 'مسؤول التحصيل', en: 'Collections officer' }, { ar: 'المراقب المالي', en: 'Financial controller' }],
        overview: {
          body: {
            ar: 'المساحة تبدأ بسؤالها: من المدين لنا، ولمن ندين، وما المتأخر، وما المدفوعات غير المخصصة؟ ثم تعرض الذمم القائمة والمتأخرة والمستحقة خلال 7 أيام، وتقادم الذمم المدينة والدائنة بفئات العمر، والسندات التي لم تُخصص بعد. كل بطاقة تفتح الفواتير التي تتكون منها.',
            en: 'The workspace opens with its question: who owes us, whom do we owe, what is overdue and which payments are unallocated? It then shows open, overdue and due-in-7-days balances, receivable and payable ageing by bucket, and payment entries not yet allocated. Every card opens the invoices behind it.',
          },
          features: [
            { id: 'F9', title: { ar: 'مساحة التحصيل', en: 'Collections workspace' }, body: { ar: 'العملاء المتأخرون مع أقدم استحقاق وعدد الأيام وآخر دفعة وصافي المطلوب تحصيله.', en: 'Overdue customers with oldest due date, days late, last payment and the net amount to collect.' }, shot: '02-cash-01-f9' },
            { id: 'F8', title: { ar: 'استثناءات الذمم الدائنة', en: 'Payables exceptions' }, body: { ar: 'فروقات المطابقة والمسودات غير المرسلة والفواتير الموقوفة في مكان واحد.', en: 'Matching variances, unsubmitted drafts and invoices on hold in one place.' }, shot: '02-cash-04-f8' },
            { id: 'F19', title: { ar: 'كشف فواتير الموردين المكررة', en: 'Duplicate supplier bill detection' }, body: { ar: 'قاعدة واضحة: نفس المورد ورقم الفاتورة، أو نفس المورد والإجمالي خلال 7 أيام.', en: 'A clear rule: same supplier and invoice number, or same supplier and total within 7 days.' }, shot: '02-cash-03-f19' },
            { id: 'S7', title: { ar: 'شارات الاستثناءات على القائمة الجانبية', en: 'Exception badges in the sidebar' }, body: { ar: 'عدد ما يحتاج انتباهًا يظهر بجانب كل مساحة عمل قبل فتحها.', en: 'The count of items needing attention shows next to each workspace before you open it.' }, shot: '10-ctl-04-s7' },
          ],
          lead: { id: '10-ctl-04-s7', focus: { x: 50, y: 58, zoom: 2.2 } },
          extra: [{ id: '02-cash-01-f9' }, { id: '02-cash-04-f8' }],
        },
        work: {
          docs: [
            { sys: 'Sales Invoice', name: { ar: 'فاتورة مبيعات', en: 'Sales invoice' }, role: { ar: 'أصل الذمة المدينة وتاريخ استحقاقها.', en: 'The origin of a receivable and its due date.' } },
            { sys: 'Purchase Invoice', name: { ar: 'فاتورة مشتريات', en: 'Purchase invoice' }, role: { ar: 'أصل الذمة الدائنة للمورد.', en: 'The origin of a supplier payable.' } },
            { sys: 'Payment Entry', name: { ar: 'سند قبض أو صرف', en: 'Payment entry' }, role: { ar: 'الدفعة وتخصيصها على الفواتير، أو بقاؤها غير مخصصة.', en: 'The payment and its allocation to invoices, or its unallocated balance.' } },
            { sys: 'Customer', name: { ar: 'العميل', en: 'Customer' }, role: { ar: 'الطرف وحد الائتمان وكشف الحساب.', en: 'The party, its credit limit and statement.' } },
            { sys: 'Supplier', name: { ar: 'المورد', en: 'Supplier' }, role: { ar: 'الطرف وشروط الدفع والمستحقات.', en: 'The party, payment terms and amounts due.' } },
          ],
          steps: [
            { ar: 'كشف أعمار الديون', en: 'Ageing view' },
            { ar: 'مستند العميل أو المورد', en: 'Customer or supplier document' },
            { ar: 'دفعة غير مخصصة', en: 'Unallocated payment' },
            { ar: 'صافي المركز', en: 'Net position' },
          ],
          control: {
            ar: 'الأرصدة الدائنة غير المخصصة تُعرض منفصلة ولا تُخلط بالعملات، حتى لا يُحسب تعرض العميل مرتين.',
            en: 'Unallocated credit balances are shown separately and never mixed across currencies, so a customer’s exposure is not counted twice.',
          },
        },
        reports: {
          keys: ['Accounts Receivable', 'Accounts Receivable Summary', 'Accounts Payable', 'Accounts Payable Summary', 'Customer Credit Balance'],
          decision: { ar: 'من نتابع اليوم، وأي مورد ندفع له، وأي دفعة نخصصها أولًا؟', en: 'Whom do we chase today, which supplier do we pay, and which payment do we allocate first?' },
        },
      },
    },
    {
      id: 'ACC-CASH',
      kind: 'workspace',
      ws: {
        code: 'ACC-CASH',
        question: { ar: 'ما النقد الفعلي، وما الالتزامات القادمة؟', en: 'What is the actual cash, and what is coming due?' },
        lede: {
          ar: 'مطابقة حركات البنك وإدارة الانكشاف النقدي، مع التمييز الدائم بين الرصيد الفعلي والمتوقع.',
          en: 'Reconcile bank movements and manage cash exposure, always distinguishing the actual balance from what is expected.',
        },
        roles: [{ ar: 'أمين الخزينة', en: 'Treasurer' }, { ar: 'المدير المالي', en: 'CFO' }],
        overview: {
          body: {
            ar: 'توقع النقد يبدأ من الرصيد الفعلي في دفتر الأستاذ، ثم يضيف التحصيل والسداد المجدولين على آفاق 7 و30 و90 يومًا، ويعرض أوامر البيع والشراء المفتوحة كسيناريو منفصل لا يدخل في الرصيد.',
            en: 'The cash forecast starts from the actual ledger balance, then adds scheduled collections and payments over 7, 30 and 90 days, and shows open sales and purchase orders as a separate scenario that never enters the balance.',
          },
          features: [
            { id: 'E2', title: { ar: 'توقع النقد 7/30/90 يومًا', en: '7/30/90-day cash forecast' }, body: { ar: 'الفعلي من الأستاذ، والمجدول من الفواتير المفتوحة، والسيناريو من الأوامر المفتوحة؛ كل منها في عمود.', en: 'Actual from the ledger, scheduled from open invoices, scenario from open orders; each in its own column.' }, shot: '01-cfo-02-e2' },
            { id: 'F7', title: { ar: 'دفعة موردين مجمّعة وملف تحويل بنكي', en: 'Supplier payment run with a bank transfer file' }, body: { ar: 'تجهيز مدفوعات عدة موردين في دفعة واحدة وإخراج ملف التحويل للبنك.', en: 'Prepare payments to several suppliers in one run and produce the bank transfer file.' } },
          ],
          lead: { id: '01-cfo-02-e2' },
        },
        work: {
          docs: [
            { sys: 'Bank Account', name: { ar: 'الحساب البنكي', en: 'Bank account' }, role: { ar: 'الحساب المرتبط بدفتر الأستاذ لكل بنك أو صندوق.', en: 'The ledger-linked account for each bank or cash box.' } },
            { sys: 'Bank Transaction', name: { ar: 'الحركة البنكية', en: 'Bank transaction' }, role: { ar: 'سطر كشف البنك قبل مطابقته وبعدها.', en: 'A bank statement line before and after matching.' } },
            { sys: 'Payment Entry', name: { ar: 'سند قبض أو صرف', en: 'Payment entry' }, role: { ar: 'الطرف المحاسبي الذي تُطابق معه الحركة.', en: 'The accounting side the movement is matched against.' } },
            { sys: 'Bank Reconciliation Tool', name: { ar: 'أداة التسوية البنكية', en: 'Bank reconciliation tool' }, role: { ar: 'المكان الذي تتم فيه المطابقة بإجراء النظام.', en: 'Where matching is done through the system’s own action.' } },
          ],
          steps: [
            { ar: 'حسابات البنك والصندوق', en: 'Bank and cash accounts' },
            { ar: 'حركات غير مسواة', en: 'Unreconciled movements' },
            { ar: 'استحقاقات الذمم', en: 'Receivable and payable dues' },
            { ar: 'سيناريو السيولة', en: 'Liquidity scenario' },
          ],
          control: {
            ar: 'التوقع لا يُعرض كموقف بنكي فعلي، وأوامر الشراء المفتوحة لا تُحسب خروجًا نقديًا محققًا.',
            en: 'A forecast is never shown as an actual bank position, and open purchase orders are never counted as cash already paid.',
          },
        },
        reports: {
          keys: ['Bank Reconciliation Statement', 'Bank Clearance Summary', 'Payment Ledger', 'Cash Flow'],
          decision: { ar: 'هل يكفي النقد للالتزامات القادمة، وما الذي يحتاج مطابقة قبل الاعتماد على الرصيد؟', en: 'Does cash cover what is coming due, and what needs reconciling before we rely on the balance?' },
        },
      },
    },
    {
      id: 'ACC-REPORT',
      kind: 'workspace',
      ws: {
        code: 'ACC-REPORT',
        question: { ar: 'كيف نثبت صحة الرقم قبل الإقفال؟', en: 'How do we prove the figure is right before closing?' },
        lede: {
          ar: 'تقارير مالية بفلاتر الشركة والفترة والصلاحية، وقائمة إقفال تكشف الفروقات قبل إغلاق الفترة.',
          en: 'Financial reports filtered by company, period and permission, and a close checklist that surfaces variances before the period is closed.',
        },
        roles: [{ ar: 'المراقب المالي', en: 'Financial controller' }, { ar: 'المدير المالي', en: 'CFO' }, { ar: 'المراجع', en: 'Auditor' }],
        overview: {
          body: {
            ar: 'مصمم القوائم المالية يعرض الأرباح والخسائر والمركز المالي والتدفق النقدي بنفس المصدر والفلاتر، ويحفظ العرض باسمك ويصدّر CSV أو يطبع. قائمة الإقفال تعرض حالة كل خطوة: قفل المشتريات والمبيعات، ترحيل الإهلاك، إعادة تقييم العملات، التسوية البنكية، ومراجعة فروقات الدفاتر الفرعية مع الأستاذ.',
            en: 'The financial statement designer shows profit and loss, financial position and cash flow from the same source and filters, saves views under your name, and exports CSV or prints. The close checklist shows the state of each step: purchasing and sales lock, depreciation posting, currency revaluation, bank reconciliation, and the review of sub-ledger differences against the ledger.',
          },
          features: [
            { id: 'R6', title: { ar: 'مصمم القوائم المالية', en: 'Financial statement designer' }, body: { ar: 'الأرباح والخسائر والمركز المالي والتدفق النقدي بنفس الفلاتر، مع عروض محفوظة.', en: 'Profit and loss, financial position and cash flow with the same filters, plus saved views.' }, shot: '09-rep-03-r6' },
            { id: 'F11', title: { ar: 'قائمة الإقفال ومراجعة الفروقات', en: 'Close checklist with variance review' }, body: { ar: 'كل خطوة إقفال بحالتها: مكتمل، أو غير مُعد، أو مفتوح، أو لا ينطبق.', en: 'Each close step with its state: complete, not set up, open or not applicable.' }, shot: '01-cfo-04-f11' },
            { id: 'R7', title: { ar: 'كل بطاقة معها تعريفها ومصدرها', en: 'Every card carries its definition and source' }, body: { ar: 'المؤشر يذكر عدد السجلات والفترة ويفتح «التعريف والمصدر».', en: 'Each indicator states its record count and period and opens “definition and source”.' }, shot: '01-cfo-05-r7' },
            { id: 'R2', title: { ar: 'تنبيه عند تقييد نطاق الصلاحية', en: 'Warning when your access scope is restricted' }, body: { ar: 'تنبيه صريح بدل أرقام ناقصة بصمت.', en: 'An explicit warning instead of silently incomplete figures.' }, shot: '09-rep-02-r2' },
          ],
          lead: { id: '09-rep-03-r6', focus: { x: 38, y: 40, zoom: 2 } },
          extra: [{ id: '01-cfo-04-f11' }],
        },
        work: {
          docs: [
            { sys: 'Account', name: { ar: 'الحساب', en: 'Account' }, role: { ar: 'هيكل الشجرة الذي تُجمّع عليه القوائم.', en: 'The chart structure statements are grouped on.' } },
            { sys: 'Journal Entry', name: { ar: 'قيد يومية', en: 'Journal entry' }, role: { ar: 'التسويات وقيود الإقفال.', en: 'Adjustments and closing entries.' } },
            { sys: 'GL Entry', name: { ar: 'قيد دفتر الأستاذ', en: 'GL entry' }, role: { ar: 'مصدر كل رصيد في القوائم.', en: 'The source of every balance in the statements.' } },
            { sys: 'Fiscal Year', name: { ar: 'السنة المالية', en: 'Fiscal year' }, role: { ar: 'حدود الفترات والمقارنة.', en: 'Period boundaries and comparisons.' } },
            { sys: 'Accounting Dimension', name: { ar: 'البُعد المحاسبي', en: 'Accounting dimension' }, role: { ar: 'مركز التكلفة أو الفرع الذي تُفلتر به التقارير.', en: 'The cost centre or branch reports are filtered by.' } },
          ],
          steps: [
            { ar: 'الشجرة والأستاذ', en: 'Chart and ledger' },
            { ar: 'موازين المراجعة', en: 'Trial balances' },
            { ar: 'مطابقة المخزون والذمم', en: 'Stock and receivable reconciliation' },
            { ar: 'الاستثناءات والإقفال', en: 'Exceptions and close' },
          ],
          control: {
            ar: 'اكتمال قائمة الإقفال يعني جاهزية الخطوات، لا إقفال السنة المالية؛ الإقفال نفسه إجراء محاسبي مستقل بصلاحيته.',
            en: 'A complete checklist means the steps are ready, not that the fiscal year is closed; closing is a separate accounting action with its own permission.',
          },
        },
        reports: {
          keys: ['Trial Balance', 'Balance Sheet', 'Profit and Loss Statement', 'Cash Flow', 'Financial Ratios'],
          decision: { ar: 'هل الفترة جاهزة للإقفال، وهل القوائم قابلة للعرض على الإدارة؟', en: 'Is the period ready to close, and are the statements ready for management?' },
        },
      },
    },
    {
      id: 'close',
      kind: 'flow',
      lede: {
        ar: 'رحلة واحدة من الواقع: فاتورة مورد تصل، ثم تُراجع، ثم تُدفع وتُطابق مع البنك، ثم تدخل الفترة في الإقفال. كل خطوة لها مستندها وشاشتها.',
        en: 'One real journey: a supplier bill arrives, is reviewed, paid and matched to the bank, and the period then moves into close. Every step has its document and its screen.',
      },
      steps: [
        { title: { ar: 'فاتورة المورد', en: 'Supplier bill' }, body: { ar: 'قبل الحفظ، يُفحص التكرار: نفس المورد ورقم الفاتورة، أو نفس الإجمالي خلال 7 أيام.', en: 'Before saving, duplicates are checked: same supplier and invoice number, or same total within 7 days.' }, doc: 'Purchase Invoice', shot: '02-cash-03-f19' },
        { title: { ar: 'استثناءات الذمم الدائنة', en: 'Payables exceptions' }, body: { ar: 'فروقات المطابقة والفواتير الموقوفة تظهر قبل أن تُجدول للدفع.', en: 'Matching variances and held invoices appear before anything is scheduled for payment.' }, doc: 'Purchase Invoice', shot: '02-cash-04-f8' },
        { title: { ar: 'السداد', en: 'Payment' }, body: { ar: 'سند صرف يُخصص على الفاتورة، أو دفعة مجمّعة لعدة موردين مع ملف التحويل البنكي.', en: 'A payment entry allocated to the bill, or a payment run for several suppliers with its bank transfer file.' }, doc: 'Payment Entry' },
        { title: { ar: 'المطابقة البنكية', en: 'Bank matching' }, body: { ar: 'حركة الكشف تُطابق مع السند في أداة التسوية البنكية، والحركات غير المطابقة تبقى ظاهرة.', en: 'The statement line is matched to the payment in the reconciliation tool, and unmatched movements stay visible.' }, doc: 'Bank Transaction' },
        { title: { ar: 'قائمة الإقفال', en: 'Close checklist' }, body: { ar: 'التسوية البنكية وفروقات الدفاتر الفرعية خطوات بحالة واضحة قبل إقفال الفترة.', en: 'Bank reconciliation and sub-ledger differences are steps with a clear state before the period closes.' }, shot: '01-cfo-04-f11' },
        { title: { ar: 'القوائم المالية', en: 'Financial statements' }, body: { ar: 'الأرباح والخسائر والمركز المالي من نفس الأستاذ، بفلاتر الفترة والشركة.', en: 'Profit and loss and financial position from the same ledger, filtered by period and company.' }, doc: 'GL Entry', shot: '09-rep-03-r6' },
      ],
    },
    {
      id: 'decisions',
      kind: 'decisions',
      lede: {
        ar: 'أسئلة يطرحها المدير المالي والمراقب كل أسبوع، والمكان الذي يجيب عنها في DIGIT Pro.',
        en: 'Questions the CFO and controller ask every week, and where DIGIT Pro answers them.',
      },
      items: [
        { question: { ar: 'كم رصيدنا النقدي الفعلي اليوم؟', en: 'What is our actual cash balance today?' }, answer: { ar: 'بطاقة رصيد النقد والبنوك في مركز القيادة، من كل الترحيلات حتى اليوم، وتفتح «التعريف والمصدر».', en: 'The cash and bank balance card in the command center, from all postings to date, opening its “definition and source”.' }, report: 'General Ledger', shot: '01-cfo-01-e1' },
        { question: { ar: 'ما المتأخر، وما الصافي القابل للتحصيل؟', en: 'What is overdue, and what is net collectible?' }, answer: { ar: 'مساحة التحصيل تفصل المتأخر عن الدفعات غير المخصصة وتعطي الصافي لكل عميل.', en: 'The collections workspace separates overdue from unallocated payments and gives the net per customer.' }, report: 'Accounts Receivable', shot: '02-cash-01-f9' },
        { question: { ar: 'هل نحن جاهزون لإقفال الشهر؟', en: 'Are we ready to close the month?' }, answer: { ar: 'قائمة الإقفال تعرض الخطوات المفتوحة وغير المعدّة قبل الإقفال.', en: 'The close checklist shows open and not-set-up steps before closing.' }, report: 'Trial Balance', shot: '01-cfo-04-f11' },
        { question: { ar: 'ما الالتزامات المستحقة للموردين خلال 14 يومًا؟', en: 'What do we owe suppliers in the next 14 days?' }, answer: { ar: 'بطاقة مستحقات الموردين في مركز القيادة وتقادم الذمم الدائنة في مساحة الذمم.', en: 'The supplier dues card in the command center and payables ageing in the receivables workspace.' }, report: 'Accounts Payable', href: '/pro/cfo-intelligence' },
      ],
    },
    {
      id: 'connections',
      kind: 'connections',
      lede: { ar: 'المالية لا تعمل وحدها: كل إدارة ترسل إليها مستندات، والمالية تعيد إليها الأرقام.', en: 'Finance never works alone: every department sends it documents, and finance returns the figures.' },
      items: [
        { to: 'selling', title: { ar: 'من المبيعات', en: 'From selling' }, body: { ar: 'فاتورة المبيعات تنشئ الذمة المدينة، وحظر الائتمان يظهر على أمر البيع بسبب مقروء.', en: 'The sales invoice creates the receivable, and a credit hold shows on the sales order with a readable reason.' } },
        { to: 'purchasing', title: { ar: 'من المشتريات', en: 'From purchasing' }, body: { ar: 'فاتورة المورد تنشئ الذمة الدائنة، وفروقات السعر والكمية والعملة تُرحّل ويُبلَّغ عنها.', en: 'The supplier bill creates the payable, and price, quantity and currency variances are posted and reported.' } },
        { to: 'inventory', title: { ar: 'مع المخزون', en: 'With inventory' }, body: { ar: 'قيمة المخزون تُطابق مع الأستاذ العام في تقرير واحد.', en: 'Stock value is reconciled to the general ledger in one report.' } },
        { to: 'fixed-assets', title: { ar: 'مع الأصول', en: 'With fixed assets' }, body: { ar: 'الإهلاك المرحّل وجسر حركة الأصول يُطابقان مع أرصدة الأستاذ.', en: 'Posted depreciation and the asset movement bridge are reconciled to ledger balances.' } },
      ],
    },
  ],
};

export default page;
