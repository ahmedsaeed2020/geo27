import type { ProPageContent } from '../types';

// Selling (V4 pages 10–14: SEL-SALES, SEL-CUSTOMER, SEL-FULFILL, SEL-INTEL). The visual device is the commercial
// journey rail; each workspace highlights the stages it covers.
const page: ProPageContent = {
  key: 'selling',
  sections: [
    {
      id: 'intro',
      kind: 'intro',
      thesis: {
        ar: 'العرض لا ينتهي عند قبول السعر؛ هو بداية سلسلة تمر بالطلب والتسليم والفوترة وتنتهي بالتحصيل، وكل حلقة فيها مستند يمكن فتحه.',
        en: 'A quotation does not end when the price is accepted; it starts a chain through order, delivery and billing that ends in collection, and every link is a document you can open.',
      },
      question: { ar: 'من عرض السعر إلى النقد: أين يقف طلب العميل الآن؟', en: 'From quotation to cash: where does the customer’s order stand right now?' },
      sequence: [
        { ar: 'عرض سعر', en: 'Quotation' },
        { ar: 'أمر بيع', en: 'Sales Order' },
        { ar: 'إشعار تسليم', en: 'Delivery Note' },
        { ar: 'فاتورة مبيعات', en: 'Sales Invoice' },
        { ar: 'سند قبض', en: 'Payment Entry' },
      ],
      rail: [
        { ar: 'العرض', en: 'Quote' },
        { ar: 'الطلب', en: 'Order' },
        { ar: 'التسليم', en: 'Deliver' },
        { ar: 'الفوترة', en: 'Bill' },
        { ar: 'التحصيل', en: 'Collect' },
      ],
      roles: [
        { ar: 'مندوب المبيعات', en: 'Sales rep' },
        { ar: 'مدير المبيعات', en: 'Sales manager' },
        { ar: 'مدير الحساب', en: 'Account manager' },
        { ar: 'عمليات المبيعات', en: 'Sales operations' },
        { ar: 'مراقب الائتمان', en: 'Credit controller' },
      ],
    },
    {
      id: 'SEL-SALES',
      kind: 'workspace',
      ws: {
        code: 'SEL-SALES',
        stages: [0, 1],
        question: { ar: 'هل نَعِد العميل بالسعر والموعد المناسبين؟', en: 'Are we promising the customer the right price and date?' },
        lede: {
          ar: 'تحويل عرض السعر إلى أمر بيع مع رؤية التوفر والموعد قبل الالتزام، ومتابعة ما يتحول من العروض فعلًا.',
          en: 'Turn a quotation into a sales order with availability and dates in view before committing, and follow which quotations actually convert.',
        },
        roles: [{ ar: 'مندوب المبيعات', en: 'Sales rep' }, { ar: 'مدير المبيعات', en: 'Sales manager' }],
        overview: {
          body: {
            ar: 'مسار عروض الأسعار يعرض العروض حسب مرحلتها مع عددها وقيمتها: مسودة، ومرسلة، ومتحولة إلى أمر، وخاسرة. وحالة أمر البيع تظهر في شريط واحد يفصل الطلب عن الحجز والتسليم والفوترة والائتمان.',
            en: 'The quotation pipeline shows quotes by stage with their count and value: draft, sent, converted to order and lost. The sales order status sits in one strip that separates order, reservation, delivery, billing and credit.',
          },
          features: [
            { id: 'SL2', title: { ar: 'مسار عروض الأسعار ونسبة التحويل', en: 'Quotation pipeline and conversion' }, body: { ar: 'العروض بمراحلها وقيمها، مع «كيف يُحسب؟» تحت الرسم.', en: 'Quotes by stage and value, with “how is this calculated?” under the chart.' }, shot: '05-sales-01-sl2' },
            { id: 'SEL-004', title: { ar: 'حالة أمر البيع ومراحله', en: 'Sales order status and stages' }, body: { ar: 'الأمر والحجز والتسليم والفوترة والائتمان، كل منها بحالته ونسبته.', en: 'Order, reservation, delivery, billing and credit, each with its own state and percentage.' }, shot: '05-sales-04-sel-004' },
            { id: 'L4', title: { ar: 'تصدير نظيف من القائمة', en: 'Clean export from the list' }, body: { ar: 'تصدير أوامر البيع بفلاتر الشركة والحالة والتاريخ إلى Excel.', en: 'Export sales orders filtered by company, status and date to Excel.' }, shot: '09-rep-05-l4' },
          ],
          lead: { id: '05-sales-01-sl2' },
          extra: [{ id: '05-sales-04-sel-004' }, { id: '09-rep-05-l4' }],
        },
        work: {
          docs: [
            { sys: 'Quotation', name: { ar: 'عرض السعر', en: 'Quotation' }, role: { ar: 'السعر والكمية وصلاحية العرض.', en: 'Price, quantity and validity of the offer.' } },
            { sys: 'Sales Order', name: { ar: 'أمر البيع', en: 'Sales order' }, role: { ar: 'التزام البيع الذي يحجز ويسلّم ويُفوتر.', en: 'The sales commitment that reserves, delivers and bills.' } },
            { sys: 'Customer', name: { ar: 'العميل', en: 'Customer' }, role: { ar: 'الطرف وقائمة أسعاره وحده الائتماني.', en: 'The party, its price list and credit limit.' } },
            { sys: 'Item', name: { ar: 'الصنف', en: 'Item' }, role: { ar: 'ما يُباع ووحداته وتوفره.', en: 'What is sold, its units and availability.' } },
            { sys: 'Price List', name: { ar: 'قائمة الأسعار', en: 'Price list' }, role: { ar: 'مصدر السعر الذي يُشرح على السطر.', en: 'The price source explained on the line.' } },
          ],
          steps: [
            { ar: 'عرض سعر', en: 'Quotation' },
            { ar: 'تفسير السعر', en: 'Price explained' },
            { ar: 'مراجعة التوفر والحد', en: 'Availability and limit check' },
            { ar: 'أمر بيع', en: 'Sales order' },
          ],
          control: {
            ar: 'التوفر يُقرأ من أرصدة المستودع الأصلية قبل التأكيد، والأمر لا يُعرض «مكتملًا» وهو مسلّم جزئيًا.',
            en: 'Availability is read from the original warehouse balances before confirming, and an order is never shown as complete while it is partly delivered.',
          },
        },
        reports: {
          keys: ['Quotation Trends', 'Lost Quotations', 'Sales Order Analysis', 'Sales Order Trends'],
          decision: { ar: 'أين نخسر العروض، وأي الأوامر مهددة بالتأخير؟', en: 'Where are we losing quotes, and which orders are at risk of delay?' },
        },
      },
    },
    {
      id: 'SEL-CUSTOMER',
      kind: 'workspace',
      ws: {
        code: 'SEL-CUSTOMER',
        stages: [0, 1, 2, 3, 4],
        question: { ar: 'من هو العميل وراء هذه المعاملة؟', en: 'Who is the customer behind this transaction?' },
        lede: {
          ar: 'العميل حساب واحد يجمع التجارة والائتمان والتحصيل والتسعير، يظهر لكل دور بحسب صلاحيته.',
          en: 'The customer as one account that brings trade, credit, collection and pricing together, shown to each role according to its permissions.',
        },
        roles: [{ ar: 'مدير الحساب', en: 'Account manager' }, { ar: 'مراقب الائتمان', en: 'Credit controller' }],
        overview: {
          body: {
            ar: 'ملف العميل 360 يعرض الائتمان والتعرض، ودورة البيع (عروض وأوامر وتسليمات وفواتير)، وأعمار الذمم، والتسعير الخاص، والتقارير الأصلية. في الشاشة أدناه، الأرقام المالية مقفلة بعبارة «غير مسموح» لأن المستخدم من فريق المبيعات؛ الدور المالي يرى القيم نفسها مفتوحة.',
            en: 'Customer 360 shows credit and exposure, the sales cycle (quotes, orders, deliveries and invoices), receivable ageing, special pricing and the native reports. In the screen below, the financial figures are locked as “not permitted” because the user is in sales; a finance role sees the same values open.',
          },
          features: [
            { id: 'SL1', title: { ar: 'ملف العميل 360', en: 'Customer 360' }, body: { ar: 'كل ما يخص العميل في صفحة، مقيد بصلاحية من يفتحها.', en: 'Everything about the customer on one page, limited by the viewer’s permissions.' }, shot: '04-360-01-sl1' },
            { id: 'SL7', title: { ar: '«لماذا هذا السعر؟»', en: '“Why this price?”' }, body: { ar: 'سبب السعر أو الخصم يُشرح للبائع على السطر نفسه.', en: 'The reason for a price or discount is explained to the seller on the line itself.' }, shot: '05-sales-03-sl7' },
            { id: 'SL6', title: { ar: 'حظر ائتمان بسبب مقروء', en: 'Credit hold with a readable reason' }, body: { ar: 'الطلبات الموقوفة والعملاء فوق الحد، مع سبب الإيقاف والإجراء المسموح.', en: 'Held orders and customers over limit, with the reason and the permitted action.' }, shot: '02-cash-02-sl6' },
            { id: 'SEL-007', title: { ar: 'قوائم الأسعار والخصومات', en: 'Price lists and discounting' }, body: { ar: 'قائمة السعر المعتمدة لكل عميل تظهر على مستنداته.', en: 'Each customer’s assigned price list shows on its documents.' } },
          ],
          lead: { id: '04-360-01-sl1' },
          extra: [{ id: '05-sales-03-sl7' }, { id: '02-cash-02-sl6' }],
        },
        work: {
          docs: [
            { sys: 'Customer', name: { ar: 'العميل', en: 'Customer' }, role: { ar: 'السجل الأصلي الوحيد للعميل؛ ملف 360 يربط به ولا ينسخه.', en: 'The single original customer record; the 360 view links to it and never copies it.' } },
            { sys: 'Contact', name: { ar: 'جهة الاتصال', en: 'Contact' }, role: { ar: 'الأشخاص وقنوات التواصل.', en: 'People and contact channels.' } },
            { sys: 'Address', name: { ar: 'العنوان', en: 'Address' }, role: { ar: 'عناوين الفوترة والتسليم.', en: 'Billing and delivery addresses.' } },
            { sys: 'Price List', name: { ar: 'قائمة الأسعار', en: 'Price list' }, role: { ar: 'التسعير الخاص بالعميل.', en: 'The customer’s pricing.' } },
            { sys: 'Sales Invoice', name: { ar: 'فاتورة مبيعات', en: 'Sales invoice' }, role: { ar: 'ما فُوتر وما بقي مفتوحًا.', en: 'What has been billed and what remains open.' } },
          ],
          steps: [
            { ar: 'العميل', en: 'Customer' },
            { ar: 'العروض والطلبات', en: 'Quotes and orders' },
            { ar: 'الفواتير والمبالغ المفتوحة', en: 'Invoices and open amounts' },
            { ar: 'التواصل والمطالبة', en: 'Contact and follow-up' },
          ],
          control: {
            ar: 'الحقل الممنوع يظهر «غير مسموح» بدل صفر، حتى لا يُقرأ غياب الصلاحية على أنه غياب الدين.',
            en: 'A restricted field shows “not permitted” instead of zero, so missing access is never read as missing debt.',
          },
        },
        reports: {
          keys: ['Customer Ledger Summary', 'Customers Without Any Sales Transactions', 'Customer Acquisition and Loyalty', 'Inactive Customers'],
          decision: { ar: 'أي العملاء نوسع معهم الائتمان، وأيهم يحتاج متابعة قبل البيع التالي؟', en: 'Which customers do we extend credit to, and which need follow-up before the next sale?' },
        },
      },
    },
    {
      id: 'SEL-FULFILL',
      kind: 'workspace',
      ws: {
        code: 'SEL-FULFILL',
        stages: [1, 2, 3],
        question: { ar: 'ما الذي طُلب وسُلّم وفُوتر بالفعل؟', en: 'What has actually been ordered, delivered and billed?' },
        lede: {
          ar: 'إتمام التسليم والفوترة والمرتجع دون تضليل في الكمية المستحقة: الطلب والحجز والتسليم والفوترة محاور منفصلة.',
          en: 'Complete delivery, billing and returns without misleading quantities: order, reservation, delivery and billing are separate axes.',
        },
        roles: [{ ar: 'عمليات المبيعات', en: 'Sales operations' }, { ar: 'المستودع', en: 'Warehouse' }, { ar: 'محاسب الذمم', en: 'AR accountant' }],
        overview: {
          body: {
            ar: 'أمر البيع يعرض شريط مراحله، ونسبتي التسليم والفوترة، وتوفر كل بند في المستودعات مع التاريخ الموعود. وما سُلّم ولم يُفوتر يظهر بأعماره (0–30، 31–60، 61–90، فوق 90 يومًا) مع أرقام إشعارات التسليم المعنية.',
            en: 'The sales order shows its stage strip, delivery and billing percentages, and each line’s availability by warehouse with the promised date. What was delivered but not billed appears by age (0–30, 31–60, 61–90, over 90 days) with the delivery note numbers involved.',
          },
          features: [
            { id: 'D1', title: { ar: 'شريط مراحل المستند', en: 'Document stage strip' }, body: { ar: 'عميل، عرض سعر، أمر بيع، إشعار تسليم، فاتورة: أين يقف المستند الآن.', en: 'Customer, quotation, order, delivery note, invoice: where the document stands now.' }, shot: '03-doc-01-d1' },
            { id: 'D2', title: { ar: 'حالة الطلب على خمسة محاور', en: 'Order status on five axes' }, body: { ar: 'الطلب مفتوح، والتسليم جزئي 71%، والفوترة جزئية 71%، والائتمان حسب الصلاحية.', en: 'Order open, delivery partial at 71%, billing partial at 71%, credit by permission.' }, shot: '03-doc-02-d2' },
            { id: 'SL5', title: { ar: 'المتاح والموعد الموعود', en: 'Available stock and promised date' }, body: { ar: 'الفعلي والمحجوز والمتوقع والمتاح لكل بند مع تاريخ التوريد الموعود.', en: 'Actual, reserved, projected and available for each line, with the promised delivery date.' }, shot: '05-sales-02-sl5' },
            { id: 'SL11', title: { ar: 'مُسلّم ولم يُفوتر، بأعماره', en: 'Delivered but not billed, by age' }, body: { ar: 'إجمالي غير المفوتر وتوزيعه على فئات العمر، مع أرقام التسليمات.', en: 'Total unbilled and its spread across age buckets, with the delivery numbers.' }, shot: '02-cash-06-sl11' },
          ],
          lead: { id: '03-doc-01-d1', focus: { x: 52, y: 22, zoom: 2.4 } },
          extra: [{ id: '03-doc-02-d2' }, { id: '02-cash-06-sl11' }],
        },
        work: {
          docs: [
            { sys: 'Sales Order', name: { ar: 'أمر البيع', en: 'Sales order' }, role: { ar: 'ما وُعد به العميل.', en: 'What the customer was promised.' } },
            { sys: 'Delivery Note', name: { ar: 'إشعار التسليم', en: 'Delivery note' }, role: { ar: 'ما خرج فعلًا من المستودع.', en: 'What actually left the warehouse.' } },
            { sys: 'Sales Invoice', name: { ar: 'فاتورة المبيعات', en: 'Sales invoice' }, role: { ar: 'ما فُوتر من المسلّم.', en: 'What has been billed of what was delivered.' } },
            { sys: 'Stock Entry', name: { ar: 'حركة المخزون', en: 'Stock entry' }, role: { ar: 'التحويلات والتجهيز قبل التسليم.', en: 'Transfers and preparation before delivery.' } },
          ],
          steps: [
            { ar: 'الأمر', en: 'Order' },
            { ar: 'التجهيز', en: 'Pick and pack' },
            { ar: 'إشعار التسليم', en: 'Delivery note' },
            { ar: 'الفاتورة', en: 'Invoice' },
            { ar: 'المرتجع', en: 'Return' },
          ],
          control: {
            ar: 'الكمية المطلوبة والمحجوزة والمسلّمة والمفوترة تُعرض كأعمدة مستقلة، لا كحالة واحدة تخفي الفرق.',
            en: 'Ordered, reserved, delivered and billed quantities are separate columns, never one status that hides the difference.',
          },
        },
        reports: {
          keys: ['Delivered Items To Be Billed', 'Delivery Note Trends', 'Delayed Order Report', 'Pending SO Items For Purchase Request'],
          decision: { ar: 'ما الذي نفوتره اليوم، وأي تسليم متأخر يحتاج قرارًا؟', en: 'What do we bill today, and which late delivery needs a decision?' },
        },
      },
    },
    {
      id: 'SEL-INTEL',
      kind: 'workspace',
      ws: {
        code: 'SEL-INTEL',
        stages: [3, 4],
        question: { ar: 'ما الذي غيّر الإيراد والهامش والتحصيل؟', en: 'What changed revenue, margin and collection?' },
        lede: {
          ar: 'قراءة المبيعات والربح والتحصيل من نفس الفواتير، مع تعريف أساس الإيراد وعدم خلطه بالاعتراف المحاسبي.',
          en: 'Read sales, profit and collection from the same invoices, with the revenue basis defined and never confused with accounting recognition.',
        },
        roles: [{ ar: 'مدير المبيعات', en: 'Sales director' }, { ar: 'المدير المالي', en: 'CFO' }],
        overview: {
          body: {
            ar: 'قوائم الفواتير تتحول إلى عرض Pivot يجمّع حسب العميل أو الصنف أو المندوب، مع تقويم وتصدير. والتحصيل المتأخر يُتابع في مساحة التحصيل نفسها التي يعمل عليها فريق المالية، فلا تختلف الأرقام بين الفريقين.',
            en: 'Invoice lists switch to a pivot view grouped by customer, item or salesperson, with calendar and export. Late collections are followed in the same collections workspace finance works in, so the two teams never see different figures.',
          },
          features: [
            { id: 'L1', title: { ar: 'عرض Pivot وتقويم', en: 'Pivot and calendar views' }, body: { ar: 'نفس القائمة كجدول محوري أو تقويم دون تقرير منفصل.', en: 'The same list as a pivot table or a calendar, without a separate report.' }, shot: '09-rep-04-l1' },
            { id: 'L2', title: { ar: 'الفلاتر المحفوظة والتجميع', en: 'Saved filters and grouping' }, body: { ar: 'فلاتر وأعمدة وتجميع تعود إليها كل مرة.', en: 'Filters, columns and grouping you come back to every time.' } },
            { id: 'F9', title: { ar: 'مساحة التحصيل', en: 'Collections workspace' }, body: { ar: 'المتأخر لكل عميل مع أيام التأخير وآخر دفعة.', en: 'Overdue per customer with days late and the last payment.' }, shot: '02-cash-01-f9' },
          ],
          lead: { id: '09-rep-04-l1' },
          extra: [{ id: '02-cash-01-f9' }],
        },
        work: {
          docs: [
            { sys: 'Sales Invoice', name: { ar: 'فاتورة المبيعات', en: 'Sales invoice' }, role: { ar: 'أساس الإيراد في التحليل.', en: 'The revenue basis of the analysis.' } },
            { sys: 'Sales Order', name: { ar: 'أمر البيع', en: 'Sales order' }, role: { ar: 'المبيعات الملتزم بها ولم تُفوتر بعد.', en: 'Committed sales not yet billed.' } },
            { sys: 'Payment Entry', name: { ar: 'سند القبض', en: 'Payment entry' }, role: { ar: 'ما حُصّل فعلًا.', en: 'What was actually collected.' } },
            { sys: 'Sales Person', name: { ar: 'مندوب المبيعات', en: 'Sales person' }, role: { ar: 'نسبة المبيعات والعمولة والمستهدف.', en: 'Sales attribution, commission and target.' } },
          ],
          steps: [
            { ar: 'تحليلات المبيعات', en: 'Sales analytics' },
            { ar: 'العميل والصنف', en: 'Customer and item' },
            { ar: 'مجمل الربح', en: 'Gross profit' },
            { ar: 'التحصيل', en: 'Collection' },
          ],
          control: {
            ar: 'تحليل المبيعات يعتمد على الفواتير المرحّلة؛ الأوامر المفتوحة تظهر كالتزام منفصل لا كإيراد.',
            en: 'Sales analysis is based on posted invoices; open orders appear as a separate commitment, never as revenue.',
          },
        },
        reports: {
          keys: ['Sales Analytics', 'Sales Register', 'Gross Profit', 'Territory-wise Sales', 'Sales Person-wise Transaction Summary'],
          decision: { ar: 'أي عميل أو صنف أو منطقة يدفع النمو، وأين يتآكل الهامش؟', en: 'Which customer, item or territory drives growth, and where is margin eroding?' },
        },
      },
    },
    {
      id: 'customer360',
      kind: 'anatomy',
      lede: {
        ar: 'أثناء فتح الفاتورة نفسها، تظهر لوحة العميل بجانبها: الرصيد والتعرض ودورة البيع والأعمار والتسعير، دون مغادرة المستند.',
        en: 'While the invoice itself is open, the customer panel sits beside it: balance, exposure, sales cycle, ageing and pricing, without leaving the document.',
      },
      lead: { id: '04-360-05-d9', focus: { x: 18, y: 32, zoom: 2.2 } },
      terms: [
        { term: { ar: 'الائتمان والتعرض', en: 'Credit and exposure' }, def: { ar: 'رصيد دفتر الأستاذ للعميل وإجمالي تعرضه، بالحد الائتماني.', en: 'The customer’s ledger balance and total exposure, against its credit limit.' } },
        { term: { ar: 'دورة البيع', en: 'Sales cycle' }, def: { ar: 'العروض والأوامر المفتوحة، والأوامر المتأخرة، والتسليمات المنتظرة للفوترة.', en: 'Open quotes and orders, late orders, and deliveries waiting to be billed.' } },
        { term: { ar: 'الفواتير والمدفوعات', en: 'Invoices and payments' }, def: { ar: 'الفواتير غير المدفوعة ومتأخر السداد والدفعات غير المخصصة والإشعارات الدائنة.', en: 'Unpaid invoices, overdue amounts, unallocated payments and credit notes.' } },
        { term: { ar: 'أعمار الذمم', en: 'Receivable ageing' }, def: { ar: 'غير مستحق، ثم 0–30 و31–60 و61–90 وأكثر من 90 يومًا.', en: 'Not due, then 0–30, 31–60, 61–90 and over 90 days.' } },
        { term: { ar: 'التسعير الخاص', en: 'Special pricing' }, def: { ar: 'أسعار الأصناف للعميل وقواعد التسعير المطبقة عليه.', en: 'Item prices for the customer and the pricing rules applied to it.' } },
      ],
      support: [{ id: '04-360-01-sl1' }],
      note: { ar: 'اللوحة تربط بسجل العميل الأصلي وتلتزم بصلاحية المستخدم؛ ما لا يُسمح به يظهر مقفلًا.', en: 'The panel links to the original customer record and follows the user’s permissions; anything not permitted is shown locked.' },
    },
    {
      id: 'decisions',
      kind: 'decisions',
      lede: { ar: 'أسئلة يومية لإدارة المبيعات، والشاشة التي تحسمها.', en: 'Everyday questions for sales leaders, and the screen that settles them.' },
      items: [
        { question: { ar: 'هل نستطيع الوعد بهذا الموعد؟', en: 'Can we promise this date?' }, answer: { ar: 'جدول توفر البنود على أمر البيع: الفعلي والمحجوز والمتوقع والمتاح والتاريخ الموعود.', en: 'The line availability table on the sales order: actual, reserved, projected, available and the promised date.' }, report: 'Stock Projected Qty', shot: '05-sales-02-sl5' },
        { question: { ar: 'ما الذي سُلّم ولم يُفوتر بعد؟', en: 'What has been delivered but not yet billed?' }, answer: { ar: 'بطاقة التسليمات غير المفوترة بأعمارها، مع أرقام إشعارات التسليم.', en: 'The delivered-not-billed card by age, with the delivery note numbers.' }, report: 'Delivered Items To Be Billed', shot: '02-cash-06-sl11' },
        { question: { ar: 'لماذا توقف أمر هذا العميل؟', en: 'Why is this customer’s order on hold?' }, answer: { ar: 'سطر حظر الائتمان يذكر السبب والإجراء المسموح، كأن لا توجد حدود ائتمان في هذه الشركة.', en: 'The credit hold line states the reason and the permitted action, for example that no credit limits exist in this company.' }, report: 'Customer Credit Balance', shot: '02-cash-02-sl6' },
        { question: { ar: 'أي العروض تتحول فعلًا إلى أوامر؟', en: 'Which quotes actually become orders?' }, answer: { ar: 'مسار العروض بعددها وقيمتها في كل مرحلة.', en: 'The quote pipeline with count and value at each stage.' }, report: 'Quotation Trends', shot: '05-sales-01-sl2' },
      ],
    },
    {
      id: 'connections',
      kind: 'connections',
      lede: { ar: 'كل مستند بيع يحرك إدارة أخرى.', en: 'Every sales document moves another department.' },
      items: [
        { to: 'inventory', title: { ar: 'مع المخزون', en: 'With inventory' }, body: { ar: 'سطر البيع يقرأ الفعلي والمحجوز والمتوقع من المستودع، والتسليم يخرج البضاعة فعليًا.', en: 'The sales line reads actual, reserved and projected stock from the warehouse, and delivery physically issues the goods.' } },
        { to: 'accounting', title: { ar: 'مع المالية', en: 'With finance' }, body: { ar: 'الفاتورة تنشئ الذمة المدينة، والتحصيل يتابع في مساحة واحدة مع المالية.', en: 'The invoice creates the receivable, and collections are followed in one workspace shared with finance.' } },
        { to: 'purchasing', title: { ar: 'مع المشتريات', en: 'With purchasing' }, body: { ar: 'بنود أوامر البيع غير المتوفرة تظهر في تقرير خاص لطلب الشراء.', en: 'Sales order lines without stock appear in a dedicated report for purchase requests.' } },
      ],
    },
  ],
};

export default page;
