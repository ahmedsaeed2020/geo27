import type { ProPageContent } from '../types';

// Inventory & Warehouses (V4 pages 20–24: INV-MASTER, INV-MOVE, INV-CONTROL, INV-REPORT). Product-information
// composition around Item 360: each quantity is defined from what the real screen shows; no live balances invented.
const page: ProPageContent = {
  key: 'inventory',
  sections: [
    {
      id: 'intro',
      kind: 'intro',
      thesis: {
        ar: 'كمية المخزون ليست رقمًا واحدًا: هي موقع، وحجز، وتوفر، وحركة، وقيمة يمكن مطابقتها مع الدفاتر.',
        en: 'Stock is never one number: it is a location, a reservation, availability, movement and a value that can be reconciled to the books.',
      },
      question: { ar: 'من الصنف إلى الحركة والجرد والأثر المالي: كم المتاح فعلًا؟', en: 'From item to movement, count and financial effect: how much is really available?' },
      sequence: [
        { ar: 'الصنف والمستودع', en: 'Item & warehouse' },
        { ar: 'التجهيز وحركة المخزون', en: 'Pick list & stock entry' },
        { ar: 'تسوية المخزون', en: 'Stock reconciliation' },
        { ar: 'دفتر المخزون والأستاذ العام', en: 'Stock ledger & GL' },
      ],
      roles: [
        { ar: 'مراقب المخزون', en: 'Inventory controller' },
        { ar: 'قائد المستودع', en: 'Warehouse lead' },
        { ar: 'المجهّز', en: 'Picker' },
        { ar: 'مدقق المستودع', en: 'Warehouse auditor' },
        { ar: 'المدير المالي', en: 'CFO' },
      ],
    },
    {
      id: 'quantities',
      kind: 'anatomy',
      lede: {
        ar: 'ملف الصنف 360 يعرض كل كمية في خانتها، ثم يوزعها على المستودعات، ثم يسرد آخر الحركات وأثرها في القيمة. هذا تعريف كل خانة كما تظهر في الشاشة الحقيقية.',
        en: 'Item 360 shows each quantity in its own box, splits it by warehouse, then lists the latest movements and their value effect. Here is what each box means, as it appears on the real screen.',
      },
      lead: { id: '07-inv-02-in3' },
      terms: [
        { term: { ar: 'الفعلي', en: 'Actual' }, def: { ar: 'الكمية الموجودة في المستودع الآن حسب دفتر المخزون.', en: 'The quantity physically in the warehouse now, per the stock ledger.' } },
        { term: { ar: 'المحجوز', en: 'Reserved' }, def: { ar: 'الكمية المخصصة لأوامر بيع مؤكدة ولم تُسلّم بعد.', en: 'The quantity set aside for confirmed sales orders not yet delivered.' } },
        { term: { ar: 'المطلوب شراؤه', en: 'On order' }, def: { ar: 'الكمية في أوامر شراء مفتوحة لم تُستلم.', en: 'The quantity on open purchase orders not yet received.' } },
        { term: { ar: 'المتوقع', en: 'Projected' }, def: { ar: 'الفعلي مضافًا إليه المطلوب شراؤه ومطروحًا منه المحجوز. في الشاشة: 26 + 23 − 0 = 49.', en: 'Actual plus on order minus reserved. On the screen: 26 + 23 − 0 = 49.' } },
        { term: { ar: 'قيمة المخزون', en: 'Stock value' }, def: { ar: 'قيمة الرصيد الفعلي حسب طريقة التقييم المعتمدة للصنف.', en: 'The value of the actual balance under the item’s valuation method.' } },
      ],
      support: [{ id: '04-360-03-in2', focus: { x: 50, y: 30, zoom: 1.9 } }],
      note: {
        ar: 'الأرقام في الشاشة بيانات شركة تجريبية. المستخدم غير المخوّل يرى رسالة رفض صريحة، لا صفرًا وهميًا.',
        en: 'The figures on screen are from a demo company. A user without permission sees an explicit denial, never a fake zero.',
      },
    },
    {
      id: 'INV-MASTER',
      kind: 'workspace',
      ws: {
        code: 'INV-MASTER',
        question: { ar: 'كم المتاح فعليًا لهذا الطلب؟', en: 'How much is really available for this order?' },
        lede: {
          ar: 'تجميع بيانات الصنف والمستودع والحجز والتوفر والطلب في مكان واحد، لكل مستودع على حدة.',
          en: 'Bring item, warehouse, reservation, availability and demand together in one place, warehouse by warehouse.',
        },
        roles: [{ ar: 'مراقب المخزون', en: 'Inventory controller' }, { ar: 'المبيعات', en: 'Sales' }],
        overview: {
          body: {
            ar: 'لوحة عمليات المستودعات تعرض لكل مستودع: الجاهز للشحن، والمنتظر للمخزون، والمتأخر، والحركات المسودة، وما ينتظر الاستلام. ونفس المؤشرات متاحة على الجوال لقائد المستودع.',
            en: 'The warehouse operations board shows, for each warehouse: ready to ship, waiting for stock, late, draft movements and what is waiting to be received. The same indicators are available on mobile for the warehouse lead.',
          },
          features: [
            { id: 'IN1', title: { ar: 'لوحة عمليات لكل مستودع', en: 'Operations board per warehouse' }, body: { ar: 'جاهز للشحن، بانتظار المخزون، متأخر، حركات مسودة، للاستلام.', en: 'Ready to ship, waiting for stock, late, draft movements, to receive.' }, shot: '07-inv-01-in1' },
            { id: 'IN2', title: { ar: 'ملف الصنف 360 بسلسلة كاملة', en: 'Item 360 with the full chain' }, body: { ar: 'من أمر الشراء حتى القيد: المستودعات والحركات وأثر القيمة.', en: 'From purchase order to journal entry: warehouses, movements and value effect.' }, shot: '04-360-03-in2' },
            { id: 'IN3', title: { ar: 'الفعلي والمتاح والمحجوز والمتوقع منفصلة', en: 'Actual, available, reserved and projected kept apart' }, body: { ar: 'كل كمية في خانتها بتعريفها.', en: 'Each quantity in its own box, with its definition.' }, shot: '07-inv-02-in3' },
            { id: 'INV-001', title: { ar: 'بيانات الصنف ووحداته ومتغيراته', en: 'Item master, units and variants' }, body: { ar: 'الصنف بمجموعته ووحدة قياسه ومتغيراته.', en: 'The item with its group, unit and variants.' } },
            { id: 'INV-017', title: { ar: 'مؤشرات المستودع على الجوال', en: 'Warehouse indicators on mobile' }, body: { ar: 'لوحة المستودع نفسها بمقاس الهاتف.', en: 'The same warehouse board on a phone.' }, shot: '07-inv-06-inv-017' },
          ],
          lead: { id: '07-inv-01-in1' },
          extra: [{ id: '07-inv-06-inv-017' }],
        },
        work: {
          docs: [
            { sys: 'Item', name: { ar: 'الصنف', en: 'Item' }, role: { ar: 'التعريف والوحدة وطريقة التقييم.', en: 'Definition, unit and valuation method.' } },
            { sys: 'Warehouse', name: { ar: 'المستودع', en: 'Warehouse' }, role: { ar: 'مكان الرصيد وشجرة المستودعات.', en: 'Where the balance sits, in the warehouse tree.' } },
            { sys: 'Bin', name: { ar: 'رصيد الصنف في المستودع', en: 'Bin (item balance per warehouse)' }, role: { ar: 'الفعلي والمحجوز والمطلوب والمتوقع لكل صنف ومستودع.', en: 'Actual, reserved, ordered and projected per item and warehouse.' } },
            { sys: 'Stock Ledger Entry', name: { ar: 'قيد دفتر المخزون', en: 'Stock ledger entry' }, role: { ar: 'كل حركة كمية وقيمتها.', en: 'Every quantity movement and its value.' } },
            { sys: 'Item Reorder', name: { ar: 'حد إعادة الطلب', en: 'Item reorder level' }, role: { ar: 'متى يُقترح طلب جديد.', en: 'When a new request is suggested.' } },
          ],
          steps: [
            { ar: 'الصنف', en: 'Item' },
            { ar: 'المستودع ورصيده', en: 'Warehouse and bin' },
            { ar: 'الفعلي والمحجوز', en: 'Actual and reserved' },
            { ar: 'المتاح والمتوقع', en: 'Available and projected' },
          ],
          control: {
            ar: 'كل كمية لها تعريف ثابت؛ لا تُعرض كمية «متاحة» واحدة تخلط المحجوز بالمطلوب شراؤه.',
            en: 'Every quantity has a fixed definition; there is never a single “available” figure that mixes reserved with on-order stock.',
          },
        },
        reports: {
          keys: ['Stock Balance', 'Stock Projected Qty', 'Items To Be Requested', 'Warehouse Wise Stock Balance'],
          decision: { ar: 'هل نؤكد الطلب من هذا المستودع، أم نحوّل أو نطلب شراءً؟', en: 'Do we confirm the order from this warehouse, transfer, or request a purchase?' },
        },
      },
    },
    {
      id: 'INV-MOVE',
      kind: 'workspace',
      ws: {
        code: 'INV-MOVE',
        question: { ar: 'كيف ينتقل الطلب إلى تجهيز وتسليم يمكن تتبعه؟', en: 'How does an order become traceable picking and delivery?' },
        lede: {
          ar: 'تتبع الوارد والصادر والتحويلات بين المستودعات، وتأكيد خطوات المستودع حتى تخرج البضاعة.',
          en: 'Track receipts, issues and transfers between warehouses, and confirm warehouse steps until the goods leave.',
        },
        roles: [{ ar: 'قائد المستودع', en: 'Warehouse lead' }, { ar: 'المجهّز', en: 'Picker' }],
        overview: {
          body: {
            ar: 'آخر حركات الصنف تظهر في ملفه 360 بتاريخها ومستندها ومستودعها وكميتها وأثرها في القيمة: إشعارات تسليم، وإيصالات استلام، وحركات مخزون. والتحويل بين المستودعات يتم على مرحلتين مع متابعة البضاعة في الطريق وعمرها.',
            en: 'The item’s latest movements appear in its 360 view with date, document, warehouse, quantity and value effect: delivery notes, purchase receipts and stock entries. Transfers between warehouses run in two steps, with goods in transit and their age tracked.',
          },
          features: [
            { id: 'INV-008', title: { ar: 'الاستلام والصرف والتحويل', en: 'Receipts, issues and transfers' }, body: { ar: 'كل حركة كمية بمستندها الأصلي وأثرها في القيمة.', en: 'Every quantity movement with its original document and value effect.' }, shot: '04-360-03-in2' },
            { id: 'IN13', title: { ar: 'تحويل على مرحلتين وبضاعة في الطريق', en: 'Two-step transfer with goods in transit' }, body: { ar: 'مستودع البضاعة في الطريق يوضح ما خرج ولم يصل.', en: 'The goods-in-transit warehouse shows what has left and not yet arrived.' }, shot: '07-inv-05-in13' },
          ],
          lead: { id: '04-360-03-in2', focus: { x: 50, y: 80, zoom: 1.9 } },
          extra: [{ id: '07-inv-05-in13' }],
        },
        work: {
          docs: [
            { sys: 'Stock Entry', name: { ar: 'حركة المخزون', en: 'Stock entry' }, role: { ar: 'الصرف والاستلام والتحويل بين المستودعات.', en: 'Issues, receipts and transfers between warehouses.' } },
            { sys: 'Pick List', name: { ar: 'قائمة التجهيز', en: 'Pick list' }, role: { ar: 'ما يُجهّز ومن أي موقع.', en: 'What to pick and from where.' } },
            { sys: 'Delivery Note', name: { ar: 'إشعار التسليم', en: 'Delivery note' }, role: { ar: 'خروج البضاعة للعميل.', en: 'Goods leaving for the customer.' } },
            { sys: 'Purchase Receipt', name: { ar: 'إيصال الاستلام', en: 'Purchase receipt' }, role: { ar: 'دخول البضاعة من المورد.', en: 'Goods arriving from the supplier.' } },
          ],
          steps: [
            { ar: 'قائمة التجهيز', en: 'Pick list' },
            { ar: 'الحجز', en: 'Reservation' },
            { ar: 'التجهيز أو التحويل', en: 'Pick or transfer' },
            { ar: 'حركة مخزون أو إشعار تسليم', en: 'Stock entry or delivery note' },
          ],
          control: {
            ar: 'التجميع الموجّه وطرق التجهيز المتقدمة تُحدد حسب تشغيل المستودع أثناء التهيئة ولا نعرضها كقدرات مكتملة.',
            en: 'Directed and advanced picking methods are defined for each warehouse during set-up and are not presented as finished capabilities.',
          },
        },
        reports: {
          keys: ['Stock Ledger', 'Stock Analytics', 'Requested Items To Be Transferred', 'Delivery Note Trends'],
          decision: { ar: 'ما الذي عالق بين مستودعين، وأي حركة تحتاج تأكيدًا اليوم؟', en: 'What is stuck between two warehouses, and which movement needs confirming today?' },
        },
      },
    },
    {
      id: 'INV-CONTROL',
      kind: 'workspace',
      ws: {
        code: 'INV-CONTROL',
        question: { ar: 'ما أصل فرق الجرد، ومن اعتمده؟', en: 'Where did the count difference come from, and who approved it?' },
        lede: {
          ar: 'إتمام الجرد والتسوية، وتتبع الدفعات والأرقام التسلسلية وتواريخ الصلاحية من التقارير الأصلية.',
          en: 'Complete counts and reconciliations, and trace batches, serial numbers and expiry dates through the native reports.',
        },
        roles: [{ ar: 'مدقق المستودع', en: 'Warehouse auditor' }, { ar: 'المراقب المالي', en: 'Financial controller' }],
        overview: {
          body: {
            ar: 'الجرد يُسجل كتسوية مخزون أصلية تحفظ الكمية قبل الجرد وبعده، والدفعات والأرقام التسلسلية لها دفاترها وتقاريرها: الدفعات المتاحة، وتاريخ رصيد الدفعة، وحالة الصلاحية، والدفعات بالسالب.',
            en: 'A count is recorded as an original stock reconciliation that keeps the quantity before and after, and batches and serial numbers have their own ledgers and reports: available batches, batch balance history, expiry status and negative batches.',
          },
          features: [],
        },
        work: {
          docs: [
            { sys: 'Stock Reconciliation', name: { ar: 'تسوية المخزون', en: 'Stock reconciliation' }, role: { ar: 'نتيجة الجرد والفرق المعتمد.', en: 'The count result and the approved difference.' } },
            { sys: 'Serial No', name: { ar: 'الرقم التسلسلي', en: 'Serial number' }, role: { ar: 'هوية القطعة الواحدة وتاريخها.', en: 'The identity and history of a single unit.' } },
            { sys: 'Batch', name: { ar: 'الدفعة', en: 'Batch' }, role: { ar: 'الكمية المشتركة في الإنتاج والصلاحية.', en: 'Quantity sharing one production lot and expiry.' } },
            { sys: 'Stock Ledger Entry', name: { ar: 'قيد دفتر المخزون', en: 'Stock ledger entry' }, role: { ar: 'السجل الذي تُراجع منه أي تسوية.', en: 'The record any reconciliation is reviewed from.' } },
          ],
          steps: [
            { ar: 'الجرد', en: 'Count' },
            { ar: 'الفرق', en: 'Variance' },
            { ar: 'الاعتماد', en: 'Approval' },
            { ar: 'تسوية المخزون', en: 'Stock reconciliation' },
            { ar: 'تاريخ المصدر', en: 'Source history' },
          ],
          control: {
            ar: 'أثر الجرد في الحسابات يتم عبر إجراء تسوية المخزون الأصلي وبصلاحيته، لا من واجهة عرض.',
            en: 'A count affects the accounts through the original stock reconciliation action and its permission, never from a display screen.',
          },
        },
        reports: {
          keys: ['Serial No Ledger', 'Batch-Wise Balance History', 'Batch Item Expiry Status', 'Negative Batch Report', 'Serial and Batch Summary'],
          decision: { ar: 'أي فرق نعتمده، وأي دفعة نصرفها قبل انتهاء صلاحيتها؟', en: 'Which variance do we approve, and which batch do we move before it expires?' },
        },
      },
    },
    {
      id: 'INV-REPORT',
      kind: 'workspace',
      ws: {
        code: 'INV-REPORT',
        question: { ar: 'هل قيمة المخزون في التقارير قابلة للمطابقة؟', en: 'Can the stock value in the reports be reconciled?' },
        lede: {
          ar: 'قياس الراكد والدوران والأعمار، ومطابقة قيمة المخزون مع الأستاذ العام لنفس الشركة والتاريخ.',
          en: 'Measure slow movers, turnover and ageing, and reconcile stock value to the general ledger for the same company and date.',
        },
        roles: [{ ar: 'مراقب المخزون', en: 'Stock controller' }, { ar: 'المدير المالي', en: 'CFO' }],
        overview: {
          body: {
            ar: 'تحليل ABC يقسم الأصناف إلى فئات بعدد الأصناف وقيمة الاستهلاك، ويعرض لكل صنف قيمة الاستهلاك وقيمة المخزون ومعدل الدوران. وعارض تقرير مقارنة قيمة المخزون بالحساب يحفظ معاييرك ويصدّر Excel وPDF.',
            en: 'ABC analysis splits items into classes by count and consumption value, and shows each item’s consumption value, stock value and turnover. The stock-versus-account comparison viewer saves your criteria and exports Excel and PDF.',
          },
          features: [
            { id: 'IN11', title: { ar: 'تحليل ABC والدوران والأعمار', en: 'ABC analysis, turnover and ageing' }, body: { ar: 'الفئات A وB وC بقيمها، والدوران لكل صنف.', en: 'Classes A, B and C with their values, and turnover per item.' }, shot: '07-inv-04-in11' },
            { id: 'INV-014', title: { ar: 'مطابقة قيمة المخزون مع الأستاذ العام', en: 'Stock value reconciled to the general ledger' }, body: { ar: 'قيمة دفتر المخزون مقابل رصيد الحساب، بمعايير محفوظة.', en: 'Stock ledger value against the account balance, with saved criteria.' }, shot: '07-inv-03-inv-014' },
            { id: 'IN10', title: { ar: 'شارة تطابق المخزون', en: 'Stock parity badge' }, body: { ar: 'إشارة واضحة لتطابق المخزون مع الحساب أو اختلافه.', en: 'A clear sign of whether stock agrees with the account.' } },
            { id: 'INV-016', title: { ar: 'الدوران والأداء', en: 'Turnover and performance' }, body: { ar: 'مؤشرات أداء المخزون من نفس الحركات.', en: 'Stock performance indicators from the same movements.' } },
          ],
          lead: { id: '07-inv-04-in11' },
          extra: [{ id: '07-inv-03-inv-014' }],
        },
        work: {
          docs: [
            { sys: 'Stock Ledger Entry', name: { ar: 'قيد دفتر المخزون', en: 'Stock ledger entry' }, role: { ar: 'القيمة الكمية لكل حركة.', en: 'The quantity value of every movement.' } },
            { sys: 'GL Entry', name: { ar: 'قيد دفتر الأستاذ', en: 'GL entry' }, role: { ar: 'الأثر المحاسبي في حساب المخزون.', en: 'The accounting effect on the stock account.' } },
            { sys: 'Item', name: { ar: 'الصنف', en: 'Item' }, role: { ar: 'طريقة التقييم والمجموعة.', en: 'Valuation method and group.' } },
            { sys: 'Warehouse', name: { ar: 'المستودع', en: 'Warehouse' }, role: { ar: 'الحساب المرتبط بكل مستودع.', en: 'The account linked to each warehouse.' } },
          ],
          steps: [
            { ar: 'أرصدة المخزون', en: 'Stock balance' },
            { ar: 'دفتر المخزون', en: 'Stock ledger' },
            { ar: 'التقييم', en: 'Valuation' },
            { ar: 'المقارنة مع الأستاذ', en: 'Comparison with the GL' },
          ],
          control: {
            ar: 'المقارنة تتم لنفس الشركة والتاريخ وطريقة التقييم؛ دون ذلك لا يُعتبر الفرق دليلًا على خطأ.',
            en: 'The comparison is made for the same company, date and valuation method; otherwise a difference is not evidence of an error.',
          },
        },
        reports: {
          keys: ['Stock Ageing', 'Stock and Account Value Comparison', 'Stock Valuation Comparison', 'Warehouse wise Item Balance Age and Value', 'COGS By Item Group'],
          decision: { ar: 'ما الذي نخفّض شراءه، وهل قيمة المخزون جاهزة للإقفال؟', en: 'What do we buy less of, and is the stock value ready for close?' },
        },
      },
    },
    {
      id: 'decisions',
      kind: 'decisions',
      lede: { ar: 'أسئلة المخزون التي يجب أن تُحسم بالأرقام لا بالتقدير.', en: 'Stock questions that should be settled with figures, not estimates.' },
      items: [
        { question: { ar: 'كم المتاح لهذا العميل الآن؟', en: 'How much is available for this customer right now?' }, answer: { ar: 'خانات الفعلي والمحجوز والمتوقع في ملف الصنف وعلى سطر البيع.', en: 'The actual, reserved and projected boxes in Item 360 and on the sales line.' }, report: 'Stock Projected Qty', shot: '07-inv-02-in3' },
        { question: { ar: 'أي مستودع متأخر في الشحن؟', en: 'Which warehouse is behind on shipping?' }, answer: { ar: 'لوحة عمليات المستودعات: المتأخر والمنتظر لكل مستودع.', en: 'The warehouse operations board: late and waiting per warehouse.' }, report: 'Warehouse Wise Stock Balance', shot: '07-inv-01-in1' },
        { question: { ar: 'هل قيمة المخزون مطابقة للحساب؟', en: 'Does stock value agree with the account?' }, answer: { ar: 'تقرير مقارنة قيمة المخزون بقيمة الحساب لنفس التاريخ.', en: 'The stock-versus-account value comparison for the same date.' }, report: 'Stock and Account Value Comparison', shot: '07-inv-03-inv-014' },
        { question: { ar: 'ما الأصناف الراكدة؟', en: 'Which items are slow-moving?' }, answer: { ar: 'تحليل ABC والدوران، وتقرير أعمار المخزون.', en: 'ABC and turnover analysis, and the stock ageing report.' }, report: 'Stock Ageing', shot: '07-inv-04-in11' },
      ],
    },
    {
      id: 'connections',
      kind: 'connections',
      lede: { ar: 'المخزون نقطة التقاء البيع والشراء والمالية.', en: 'Inventory is where selling, purchasing and finance meet.' },
      items: [
        { to: 'selling', title: { ar: 'مع المبيعات', en: 'With selling' }, body: { ar: 'أوامر البيع تحجز الكمية، وإشعار التسليم يصرفها.', en: 'Sales orders reserve quantity, and the delivery note issues it.' } },
        { to: 'purchasing', title: { ar: 'مع المشتريات', en: 'With purchasing' }, body: { ar: 'أوامر الشراء ترفع المطلوب شراؤه، والاستلام يرفع الفعلي.', en: 'Purchase orders raise the on-order quantity, and receipts raise the actual.' } },
        { to: 'accounting', title: { ar: 'مع المالية', en: 'With finance' }, body: { ar: 'كل حركة لها أثر في حساب المخزون، وتُطابق القيمة مع الأستاذ.', en: 'Every movement affects the stock account, and the value is reconciled to the ledger.' } },
      ],
    },
  ],
};

export default page;
