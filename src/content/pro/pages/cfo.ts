import type { ProPageContent } from '../types';

// CFO Intelligence (V4 page 35 and the 12 executive questions EXE-01..12). Each question names the view, the
// source records and native reports, the decision, and which real screen answers it today. The executive cards
// themselves are in acceptance testing, so their status is shown rather than implied.
const page: ProPageContent = {
  key: 'cfo',
  sections: [
    {
      id: 'questions',
      kind: 'questions',
      lede: {
        ar: 'اثنا عشر سؤالًا يطرحها المدير المالي كل أسبوع. لكل سؤال: أين تُقرأ الإجابة، ومن أي سجلات، وبأي تقرير أصلي تُثبت، وما القرار الذي تخدمه.',
        en: 'Twelve questions a CFO asks every week. For each: where the answer is read, from which records, which native report proves it, and which decision it serves.',
      },
      items: [
        { id: 'EXE-01', question: { ar: 'كيف يتحرك الإيراد ومجمل الربح؟', en: 'How are revenue and gross margin moving?' }, view: { ar: 'لوحات المدير المالي', en: 'The CFO boards' }, sources: { ar: 'فواتير المبيعات المرحّلة وتكلفة البضاعة المباعة', en: 'Posted sales invoices and cost of goods sold' }, reports: ['Gross Profit', 'Profit and Loss Statement', 'Sales Analytics'], decision: { ar: 'أين نركز البيع، وأين نراجع التسعير.', en: 'Where to focus selling, and where to revisit pricing.' }, shot: '01-cfo-01-e1', status: 'screen', evidence: ['E1'] },
        { id: 'EXE-02', question: { ar: 'ما وضع السيولة والاستحقاقات القادمة؟', en: 'What is our liquidity and upcoming due-date exposure?' }, view: { ar: 'توقع النقد 7/30/90 يومًا', en: 'The 7/30/90-day cash forecast' }, sources: { ar: 'أرصدة النقد والبنوك والفواتير المفتوحة والأوامر', en: 'Cash and bank balances, open invoices and orders' }, reports: ['Cash Flow', 'Accounts Receivable', 'Accounts Payable'], decision: { ar: 'ما ندفعه هذا الأسبوع، وما نطالب به.', en: 'What we pay this week, and what we chase.' }, shot: '01-cfo-02-e2', status: 'screen', evidence: ['E2'] },
        { id: 'EXE-03', question: { ar: 'ما الذي بعناه ولم نسلّمه بعد؟', en: 'What have we sold but not yet delivered?' }, view: { ar: 'حالة أمر البيع على خمسة محاور', en: 'Sales order status on five axes' }, sources: { ar: 'أوامر البيع وإشعارات التسليم', en: 'Sales orders and delivery notes' }, reports: ['Sales Order Analysis', 'Delayed Order Report'], decision: { ar: 'أي التزام للعملاء معرض للتأخير.', en: 'Which customer commitment is at risk of delay.' }, shot: '03-doc-02-d2', status: 'screen', evidence: ['D2'] },
        { id: 'EXE-04', question: { ar: 'ما الذي سلّمناه ولم نفوتره؟', en: 'What have we delivered but not invoiced?' }, view: { ar: 'بطاقة المسلّم غير المفوتر بأعماره', en: 'The delivered-not-billed card by age' }, sources: { ar: 'إشعارات التسليم وفواتير المبيعات', en: 'Delivery notes and sales invoices' }, reports: ['Delivered Items To Be Billed'], decision: { ar: 'ما نفوتره اليوم حتى لا يتأخر النقد.', en: 'What to bill today so cash is not delayed.' }, shot: '02-cash-06-sl11', status: 'screen', evidence: ['SL11'] },
        { id: 'EXE-05', question: { ar: 'ما التزامات الشراء المفتوحة؟', en: 'What purchase commitments are open?' }, view: { ar: 'بطاقة الالتزامات المفتوحة', en: 'The open commitments card' }, sources: { ar: 'أوامر الشراء وإيصالات الاستلام', en: 'Purchase orders and purchase receipts' }, reports: ['Purchase Order Analysis', 'Procurement Tracker'], decision: { ar: 'أي مورد نتابع، وأي التزام يضغط السيولة.', en: 'Which supplier to chase, and which commitment pressures cash.' }, shot: '06-pur-01-pu6', status: 'screen', evidence: ['PU6'] },
        { id: 'EXE-06', question: { ar: 'ما الذي استلمناه ولم يُفوتر لنا؟', en: 'What have we received but not been billed for?' }, view: { ar: 'تقرير المستلم غير المفوتر', en: 'The received-not-billed report' }, sources: { ar: 'إيصالات الاستلام وفواتير المشتريات', en: 'Purchase receipts and purchase invoices' }, reports: ['Received Items To Be Billed'], decision: { ar: 'ما نستحقه قبل الإقفال حتى لا تنقص المصروفات.', en: 'What to accrue before close so expenses are not understated.' }, status: 'report', evidence: [] },
        { id: 'EXE-07', question: { ar: 'كم المتاح والمحجوز والمتوقع من المخزون؟', en: 'How much stock is available, reserved and projected?' }, view: { ar: 'ملف الصنف 360', en: 'Item 360' }, sources: { ar: 'أرصدة المستودعات وأوامر البيع والشراء', en: 'Warehouse balances, sales and purchase orders' }, reports: ['Stock Projected Qty', 'Stock Balance'], decision: { ar: 'هل نستطيع الوعد، أم نطلب شراءً.', en: 'Whether we can promise, or need to buy.' }, shot: '07-inv-02-in3', status: 'screen', evidence: ['IN3'] },
        { id: 'EXE-08', question: { ar: 'ما المخزون الراكد وما المعرض لانتهاء الصلاحية؟', en: 'Which stock is ageing or at risk of expiry?' }, view: { ar: 'تحليل ABC والدوران', en: 'ABC and turnover analysis' }, sources: { ar: 'قيود دفتر المخزون والدفعات', en: 'Stock ledger entries and batches' }, reports: ['Stock Ageing', 'Batch Item Expiry Status'], decision: { ar: 'ما نخفض شراءه وما نصرفه أولًا.', en: 'What to buy less of, and what to move first.' }, shot: '07-inv-04-in11', status: 'screen', evidence: ['IN11'] },
        { id: 'EXE-09', question: { ar: 'هل قيمة المخزون مطابقة للأستاذ العام؟', en: 'Does stock value agree with the general ledger?' }, view: { ar: 'مقارنة قيمة المخزون بالحساب', en: 'The stock-versus-account comparison' }, sources: { ar: 'دفتر المخزون وقيود الأستاذ', en: 'The stock ledger and GL entries' }, reports: ['Stock and Account Value Comparison'], decision: { ar: 'هل قيمة المخزون جاهزة للإقفال.', en: 'Whether stock value is ready for close.' }, shot: '07-inv-03-inv-014', status: 'screen', evidence: ['INV-014'] },
        { id: 'EXE-10', question: { ar: 'ما صافي القيمة الدفترية للأصول، وهل الإهلاك مرحّل؟', en: 'What is the assets’ net book value, and is depreciation posted?' }, view: { ar: 'حالة الإهلاك حسب الدفتر', en: 'Depreciation status by book' }, sources: { ar: 'الأصول وجداول الإهلاك وقيوده', en: 'Assets, depreciation schedules and entries' }, reports: ['Asset Depreciations and Balances', 'Asset Depreciation Ledger'], decision: { ar: 'ترحيل المستحق قبل الإقفال.', en: 'Post what is due before close.' }, shot: '08-ast-01-fa4', status: 'screen', evidence: ['FA4'] },
        { id: 'EXE-11', question: { ar: 'ما الاعتمادات المتراكمة عبر الإدارات؟', en: 'What approvals are piling up across departments?' }, view: { ar: 'صندوق الاعتمادات الموحد', en: 'The unified approvals inbox' }, sources: { ar: 'طلبات الاعتماد المفتوحة', en: 'Open approval requests' }, reports: [], decision: { ar: 'أي اعتماد يعطل التشغيل.', en: 'Which approval is holding up operations.' }, shot: '10-ctl-03-s4', status: 'screen', evidence: ['S4'] },
        { id: 'EXE-12', question: { ar: 'هل نحن جاهزون لإقفال الفترة؟', en: 'Are we ready to close the period?' }, view: { ar: 'قائمة الإقفال ومراجعة الفروقات', en: 'The close checklist and variance review' }, sources: { ar: 'التسويات البنكية والدفاتر الفرعية والقيود', en: 'Bank reconciliations, sub-ledgers and entries' }, reports: ['Trial Balance', 'General Ledger'], decision: { ar: 'نقفل الآن، أم نعالج المفتوح أولًا.', en: 'Close now, or resolve what is open first.' }, shot: '01-cfo-04-f11', status: 'screen', evidence: ['F11'] },
      ],
    },
    {
      id: 'cash',
      kind: 'chapter',
      kicker: { ar: 'النقد والسيولة', en: 'Cash & liquidity' },
      lede: {
        ar: 'الرصيد الفعلي، والمجدول من الفواتير المفتوحة، والسيناريو من الأوامر المفتوحة، في أعمدة منفصلة لسبعة أيام وثلاثين وتسعين.',
        en: 'Actual balance, scheduled from open invoices and scenario from open orders, in separate columns for seven, thirty and ninety days.',
      },
      lead: { id: '01-cfo-02-e2' },
      points: [
        { id: 'E2', title: { ar: 'الفعلي منفصل عن المتوقع', en: 'Actuals apart from projections' }, body: { ar: 'لا يُخلط رصيد البنك بتوقع التحصيل.', en: 'The bank balance is never mixed with expected collections.' } },
        { id: 'F9', title: { ar: 'التحصيل من نفس الأرقام', en: 'Collections from the same figures' }, body: { ar: 'المتأخر والصافي القابل للتحصيل لكل عميل.', en: 'Overdue and net collectible per customer.' } },
      ],
      reports: ['Cash Flow', 'Accounts Receivable Summary', 'Accounts Payable Summary', 'Bank Reconciliation Statement'],
      support: ['02-cash-01-f9'],
    },
    {
      id: 'control',
      kind: 'chapter',
      flip: true,
      kicker: { ar: 'الرقابة والإقفال', en: 'Control & close' },
      lede: {
        ar: 'الإقفال قائمة خطوات بحالتها، والقوائم المالية تُقرأ بنفس الفلاتر من نفس الأستاذ.',
        en: 'Close is a list of steps with their state, and the statements read with the same filters from the same ledger.',
      },
      lead: { id: '01-cfo-04-f11' },
      points: [
        { id: 'F11', title: { ar: 'قائمة الإقفال', en: 'Close checklist' }, body: { ar: 'مكتمل، أو غير مُعد، أو مفتوح، أو لا ينطبق.', en: 'Complete, not set up, open or not applicable.' } },
        { id: 'R6', title: { ar: 'مصمم القوائم المالية', en: 'Financial statement designer' }, body: { ar: 'الأرباح والخسائر والمركز المالي والتدفق النقدي.', en: 'Profit and loss, financial position and cash flow.' } },
        { id: 'F19', title: { ar: 'كشف الفواتير المكررة', en: 'Duplicate bill detection' }, body: { ar: 'قبل أن تصل إلى الدفع.', en: 'Before they reach payment.' } },
        { id: 'D5', title: { ar: 'سبب منع الترحيل', en: 'Why posting is blocked' }, body: { ar: 'مكتوب على المستند.', en: 'Written on the document.' } },
      ],
      reports: ['Trial Balance', 'General Ledger', 'Balance Sheet'],
      support: ['09-rep-03-r6'],
    },
    {
      id: 'performance',
      kind: 'chapter',
      kicker: { ar: 'الأداء والربحية', en: 'Performance & profitability' },
      lede: {
        ar: 'الإيراد ومجمل الربح من الفواتير المرحّلة، وكل بطاقة تذكر عدد سجلاتها وفترتها.',
        en: 'Revenue and gross profit from posted invoices, and every card states its records and period.',
      },
      lead: { id: '01-cfo-05-r7' },
      points: [
        { id: 'R7', title: { ar: 'تعريف ومصدر', en: 'Definition and source' }, body: { ar: 'تفتح البطاقة تعريفها قبل أن تثق برقمها.', en: 'A card opens its definition before you trust its number.' } },
        { id: 'L1', title: { ar: 'تحليل بالعميل والصنف', en: 'Analysis by customer and item' }, body: { ar: 'نفس قائمة الفواتير كجدول محوري.', en: 'The same invoice list as a pivot table.' } },
      ],
      reports: ['Gross Profit', 'Profit and Loss Statement', 'Sales Analytics', 'Territory-wise Sales'],
      support: ['09-rep-04-l1'],
    },
    {
      id: 'working-capital',
      kind: 'chapter',
      flip: true,
      kicker: { ar: 'رأس المال العامل', en: 'Working capital' },
      lede: {
        ar: 'ما في المستودع، وما سُلّم ولم يُفوتر، وما التزمنا به للموردين: ثلاثة مصادر لنقد محبوس، كل منها بأرقامه.',
        en: 'What is in the warehouse, what was delivered but not billed, and what we committed to suppliers: three sources of trapped cash, each with its figures.',
      },
      lead: { id: '07-inv-04-in11' },
      points: [
        { id: 'IN11', title: { ar: 'المخزون والدوران', en: 'Stock and turnover' }, body: { ar: 'الفئات A وB وC بقيمها.', en: 'Classes A, B and C with their values.' } },
        { id: 'SL11', title: { ar: 'مسلّم غير مفوتر', en: 'Delivered, not billed' }, body: { ar: 'بأعماره وأرقام التسليمات.', en: 'By age, with delivery numbers.' } },
        { id: 'PU6', title: { ar: 'التزامات الشراء', en: 'Purchase commitments' }, body: { ar: 'غير المستلم وغير المفوتر.', en: 'Not received and not billed.' } },
      ],
      reports: ['Stock Ageing', 'Delivered Items To Be Billed', 'Purchase Order Analysis'],
      support: ['02-cash-06-sl11', '06-pur-01-pu6'],
    },
    {
      id: 'assets',
      kind: 'chapter',
      kicker: { ar: 'الأصول ورأس المال', en: 'Assets & capital' },
      lede: {
        ar: 'جسر حركة الأصول من الرصيد الافتتاحي إلى الختامي، والإهلاك المرحّل مقابل المستحق لكل دفتر.',
        en: 'The asset movement bridge from opening to closing balance, and posted versus due depreciation per book.',
      },
      lead: { id: '08-ast-02-fa5' },
      points: [
        { id: 'FA5', title: { ar: 'الجسر مع الأستاذ', en: 'Bridge to the ledger' }, body: { ar: 'الإضافات والاستبعادات والإهلاك حتى الختامي.', en: 'Additions, disposals and depreciation through to closing.' } },
        { id: 'FA4', title: { ar: 'المستحق مقابل المرحّل', en: 'Due versus posted' }, body: { ar: 'لكل دفتر مالي حتى تاريخ محدد.', en: 'For each finance book as of a date.' } },
      ],
      reports: ['Asset Depreciations and Balances', 'Asset Depreciation Ledger', 'Fixed Asset Register'],
      support: ['08-ast-01-fa4'],
    },
    {
      id: 'drill',
      kind: 'flow',
      lede: {
        ar: 'من السؤال إلى القيد: كل رقم على لوحة المدير المالي يمكن تتبعه إلى المستند الذي صنعه.',
        en: 'From question to voucher: every figure on the CFO board can be traced to the document that produced it.',
      },
      steps: [
        { title: { ar: 'السؤال', en: 'Question' }, body: { ar: 'بطاقة على لوحة المدير المالي.', en: 'A card on the CFO board.' }, shot: '01-cfo-01-e1' },
        { title: { ar: 'التعريف', en: 'Definition' }, body: { ar: 'عدد السجلات والفترة والمصدر.', en: 'Record count, period and source.' }, shot: '01-cfo-05-r7' },
        { title: { ar: 'التقرير الأصلي', en: 'Native report' }, body: { ar: 'نفس الفلاتر، وتنبيه إن كان النطاق مقيدًا.', en: 'The same filters, with a warning if the scope is restricted.' }, shot: '09-rep-02-r2' },
        { title: { ar: 'المستند', en: 'Document' }, body: { ar: 'الفاتورة أو الأمر كما هو، بمراحله ومستنداته المرتبطة.', en: 'The invoice or order as it is, with its stages and related documents.' }, doc: 'Sales Invoice', shot: '03-doc-03-d3' },
      ],
    },
    {
      id: 'cta',
      kind: 'cta',
      body: {
        ar: 'اختر ثلاثة أسئلة من الاثني عشر، ونعرض لك إجاباتها على شركة تجريبية ثم نناقش بياناتك.',
        en: 'Pick three of the twelve questions, and we will show you their answers on a demo company, then discuss your data.',
      },
      interest: { ar: 'ذكاء المدير المالي', en: 'CFO intelligence' },
    },
  ],
};

export default page;
