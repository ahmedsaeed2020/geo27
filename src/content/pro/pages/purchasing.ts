import type { ProPageContent } from '../types';

// Purchasing (V4 pages 15–19: PUR-SOURCE, PUR-ORDERS, PUR-RECEIVE, PUR-SUPPLIER). Document-led: the order, the
// receipt and the bill are the visual spine; supplier decisions are shown from real scorecards.
const page: ProPageContent = {
  key: 'purchasing',
  sections: [
    {
      id: 'intro',
      kind: 'intro',
      thesis: {
        ar: 'الشراء الجيد يمكن تتبعه: من الاحتياج إلى المنافسة بين العروض، ثم الالتزام، ثم الاستلام والفاتورة والمستحق للمورد.',
        en: 'Good purchasing is traceable: from the need to competing quotes, then the commitment, then receipt, the bill and what is owed to the supplier.',
      },
      question: { ar: 'من الاحتياج إلى الالتزام والسداد: ما الذي التزمنا به ولم يصل بعد؟', en: 'From need to commitment and payment: what have we committed to that has not arrived yet?' },
      sequence: [
        { ar: 'طلب مواد', en: 'Material Request' },
        { ar: 'طلب عرض سعر', en: 'Request for Quotation' },
        { ar: 'عرض سعر مورد', en: 'Supplier Quotation' },
        { ar: 'أمر شراء', en: 'Purchase Order' },
        { ar: 'إيصال استلام', en: 'Purchase Receipt' },
        { ar: 'فاتورة مشتريات', en: 'Purchase Invoice' },
      ],
      roles: [
        { ar: 'مقدم الطلب', en: 'Requester' },
        { ar: 'المشتري', en: 'Buyer' },
        { ar: 'المعتمد', en: 'Approver' },
        { ar: 'الاستلام', en: 'Receiving' },
        { ar: 'محاسب الذمم الدائنة', en: 'AP accountant' },
      ],
    },
    {
      id: 'PUR-SOURCE',
      kind: 'workspace',
      ws: {
        code: 'PUR-SOURCE',
        question: { ar: 'هل يمكن تبرير اختيار المورد؟', en: 'Can the supplier choice be justified?' },
        lede: {
          ar: 'إدارة طلبات المواد والمنافسة بين عروض الموردين، والمقارنة على مستوى السطر: السعر والشروط والتوفر.',
          en: 'Manage material requests and competition between supplier quotes, compared line by line: price, terms and availability.',
        },
        roles: [{ ar: 'مقدم الطلب', en: 'Requester' }, { ar: 'المشتري', en: 'Buyer' }, { ar: 'المعتمد', en: 'Approver' }],
        overview: {
          body: {
            ar: 'يبدأ المسار بطلب مواد، ثم طلب عرض سعر يُرسل إلى عدة موردين، ثم عروضهم كمستندات أصلية تُقارن في تقرير مقارنة عروض الموردين. الطلبات التي لم يُطلب لها عرض بعد تظهر في تقرير خاص حتى لا يضيع الاحتياج.',
            en: 'The path starts with a material request, then a request for quotation sent to several suppliers, then their quotes as original documents compared in the supplier quotation comparison report. Requests with no quote yet appear in a dedicated report so no need gets lost.',
          },
          features: [],
        },
        work: {
          docs: [
            { sys: 'Material Request', name: { ar: 'طلب المواد', en: 'Material request' }, role: { ar: 'الاحتياج: ماذا ومتى ولأي مستودع.', en: 'The need: what, when and for which warehouse.' } },
            { sys: 'Request for Quotation', name: { ar: 'طلب عرض السعر', en: 'Request for quotation' }, role: { ar: 'الطلب نفسه موجّهًا لعدة موردين.', en: 'The same request addressed to several suppliers.' } },
            { sys: 'Supplier Quotation', name: { ar: 'عرض سعر المورد', en: 'Supplier quotation' }, role: { ar: 'رد كل مورد بسعره وشروطه ومدته.', en: 'Each supplier’s reply with its price, terms and lead time.' } },
            { sys: 'Supplier', name: { ar: 'المورد', en: 'Supplier' }, role: { ar: 'الطرف وتاريخه وأداؤه.', en: 'The party, its history and performance.' } },
            { sys: 'Item', name: { ar: 'الصنف', en: 'Item' }, role: { ar: 'ما يُشترى ووحدة قياسه.', en: 'What is bought and its unit.' } },
          ],
          steps: [
            { ar: 'طلب المواد', en: 'Material request' },
            { ar: 'طلب عرض السعر', en: 'Request for quotation' },
            { ar: 'عروض الموردين', en: 'Supplier quotations' },
            { ar: 'المقارنة والاختيار', en: 'Compare and choose' },
          ],
          control: {
            ar: 'المقارنة تعرض المعايير ولا تختار موردًا «أفضل» دون معيار؛ الاعتماد يتبع سياسة المنشأة التي تُحدد أثناء التهيئة.',
            en: 'The comparison shows the criteria and never picks a “best” supplier without one; approval follows the company policy defined at set-up.',
          },
        },
        reports: {
          keys: ['Supplier Quotation Comparison', 'Material Requests for which Supplier Quotations are not created', 'Requested Items to Order and Receive'],
          decision: { ar: 'أي احتياج ما زال بلا عرض، وأي عرض نعتمد على أساس واضح؟', en: 'Which need still has no quote, and which quote do we approve on a clear basis?' },
        },
      },
    },
    {
      id: 'PUR-ORDERS',
      kind: 'workspace',
      ws: {
        code: 'PUR-ORDERS',
        question: { ar: 'ما الالتزام المفتوح، وما خطر تأخر التوريد؟', en: 'What is the open commitment, and what is the risk of late supply?' },
        lede: {
          ar: 'تتبع الالتزامات المفتوحة ومواعيد التوريد، مع استبعاد ما استُلم وما أُلغي من الالتزام.',
          en: 'Track open commitments and supply dates, excluding what has been received or cancelled.',
        },
        roles: [{ ar: 'المشتري', en: 'Buyer' }, { ar: 'قائد المشتريات', en: 'Procurement lead' }],
        overview: {
          body: {
            ar: 'بطاقة الالتزامات المفتوحة تعرض عدد أوامر الشراء المفتوحة وبنودها، وقيمة ما لم يُستلم وما لم يُفوتر، وتوضح أنها تستثني الأوامر المغلقة والمكتملة والملغاة. ومن ملف المورد 360 تُفتح أوامره المفتوحة والاستلامات المنتظرة للفوترة.',
            en: 'The open commitments card shows how many purchase orders and lines are open, and the value not yet received and not yet billed, stating that closed, completed and cancelled orders are excluded. From Supplier 360 you open its open orders and receipts waiting to be billed.',
          },
          features: [
            { id: 'PU6', title: { ar: 'الالتزامات المفتوحة والأوامر المتأخرة', en: 'Open commitments and late orders' }, body: { ar: 'غير المستلم وغير المفوتر، مع «كيف يُحسب؟» واستبعاد المغلق والملغى.', en: 'Not received and not billed, with “how is this calculated?” and closed or cancelled orders excluded.' }, shot: '06-pur-01-pu6' },
            { id: 'PUR-006', title: { ar: 'أعمار أوامر الشراء والالتزامات', en: 'Purchase order ageing and commitments' }, body: { ar: 'متابعة ما طال انتظاره من أوامر الشراء.', en: 'Follow purchase orders that have been waiting too long.' } },
            { id: 'PUR-007', title: { ar: 'ملف المورد 360', en: 'Supplier 360' }, body: { ar: 'دورة الشراء مع المورد: أوامر مفتوحة، واستلامات للفوترة، وفواتير غير مدفوعة.', en: 'The purchasing cycle with the supplier: open orders, receipts to bill and unpaid bills.' }, shot: '04-360-02-pur-007' },
          ],
          lead: { id: '06-pur-01-pu6' },
          extra: [{ id: '04-360-02-pur-007' }],
        },
        work: {
          docs: [
            { sys: 'Purchase Order', name: { ar: 'أمر الشراء', en: 'Purchase order' }, role: { ar: 'الالتزام تجاه المورد بالكمية والسعر والموعد.', en: 'The commitment to the supplier on quantity, price and date.' } },
            { sys: 'Purchase Order Item', name: { ar: 'بند أمر الشراء', en: 'Purchase order item' }, role: { ar: 'ما استُلم وما بقي لكل سطر.', en: 'What has been received and what remains on each line.' } },
            { sys: 'Purchase Receipt', name: { ar: 'إيصال الاستلام', en: 'Purchase receipt' }, role: { ar: 'ما وصل فعلًا.', en: 'What actually arrived.' } },
            { sys: 'Purchase Invoice', name: { ar: 'فاتورة المشتريات', en: 'Purchase invoice' }, role: { ar: 'ما فوتره المورد.', en: 'What the supplier billed.' } },
          ],
          steps: [
            { ar: 'أمر الشراء', en: 'Purchase order' },
            { ar: 'التعديل والاعتماد', en: 'Amendment and approval' },
            { ar: 'الالتزامات المفتوحة', en: 'Open commitments' },
            { ar: 'مواعيد الاستلام', en: 'Receipt dates' },
          ],
          control: {
            ar: 'الالتزام المفتوح يستثني المستلم والملغى، حتى لا يبدو الشراء أكبر مما هو عليه.',
            en: 'The open commitment excludes what was received or cancelled, so purchasing never looks larger than it is.',
          },
        },
        reports: {
          keys: ['Purchase Order Analysis', 'Purchase Order Trends', 'Procurement Tracker', 'Requested Items to Order and Receive'],
          decision: { ar: 'أي مورد نتابع اليوم، وأي التزام يؤثر على السيولة القادمة؟', en: 'Which supplier do we chase today, and which commitment affects upcoming cash?' },
        },
      },
    },
    {
      id: 'PUR-RECEIVE',
      kind: 'workspace',
      ws: {
        code: 'PUR-RECEIVE',
        question: { ar: 'لماذا لا تتطابق الفاتورة مع الاستلام؟', en: 'Why doesn’t the bill match the receipt?' },
        lede: {
          ar: 'مراجعة الاستلام والفواتير وحل فروقات الكمية والسعر والعملة قبل جدولة الدفع.',
          en: 'Review receipts and bills and resolve quantity, price and currency differences before payment is scheduled.',
        },
        roles: [{ ar: 'الاستلام', en: 'Receiving' }, { ar: 'محاسب الذمم الدائنة', en: 'AP accountant' }, { ar: 'المراقب المالي', en: 'Financial controller' }],
        overview: {
          body: {
            ar: 'تقرير فروقات أسعار وكميات الشراء يذكر إجمالي فرق السعر وعدد بنود الفواتير المفحوصة في الفترة. وبطاقات استثناءات الذمم الدائنة تعرض فروقات المطابقة، والفواتير الموقوفة، ونسبة الفواتير المعالجة دون تدخل، ومتوسط أيام المعالجة.',
            en: 'The purchase price and quantity variance report states the total price variance and how many invoice lines were checked in the period. The payables exception cards show matching variances, invoices on hold, the share of invoices processed without intervention, and average processing days.',
          },
          features: [
            { id: 'PU9', title: { ar: 'فروقات السعر والكمية والعملة', en: 'Price, quantity and currency variances' }, body: { ar: 'إجمالي الفرق وعدد البنود المفحوصة في الفترة، مع «كيف يُحسب؟».', en: 'Total variance and lines checked in the period, with “how is this calculated?”.' }, shot: '06-pur-02-pu9' },
            { id: 'PUR-014', title: { ar: 'انحراف سعر الشراء', en: 'Purchase price variance' }, body: { ar: 'الفرق بين سعر الأمر وسعر الفاتورة لكل بند.', en: 'The difference between order price and bill price on each line.' } },
            { id: 'PU13', title: { ar: 'فواتير بلا تدخل وأيام المعالجة', en: 'Touchless invoices and processing days' }, body: { ar: 'فروقات المطابقة والمسودات غير المرسلة والموقوفة ونسبة المعالجة دون تدخل.', en: 'Matching variances, unsubmitted and held drafts, and the share processed without intervention.' }, shot: '02-cash-05-pu13' },
          ],
          lead: { id: '06-pur-02-pu9' },
          extra: [{ id: '02-cash-05-pu13' }],
        },
        work: {
          docs: [
            { sys: 'Purchase Order', name: { ar: 'أمر الشراء', en: 'Purchase order' }, role: { ar: 'السعر والكمية المتفق عليهما.', en: 'The agreed price and quantity.' } },
            { sys: 'Purchase Receipt', name: { ar: 'إيصال الاستلام', en: 'Purchase receipt' }, role: { ar: 'الكمية المقبولة والمرفوضة.', en: 'Accepted and rejected quantity.' } },
            { sys: 'Purchase Invoice', name: { ar: 'فاتورة المشتريات', en: 'Purchase invoice' }, role: { ar: 'ما يطالب به المورد.', en: 'What the supplier claims.' } },
            { sys: 'Quality Inspection', name: { ar: 'فحص الجودة', en: 'Quality inspection' }, role: { ar: 'نتيجة الفحص قبل القبول.', en: 'The inspection result before acceptance.' } },
            { sys: 'Landed Cost Voucher', name: { ar: 'سند التكاليف الإضافية', en: 'Landed cost voucher' }, role: { ar: 'الشحن والجمارك الموزعة على البنود.', en: 'Freight and duties allocated to the lines.' } },
          ],
          steps: [
            { ar: 'أمر الشراء', en: 'Purchase order' },
            { ar: 'إيصال الاستلام', en: 'Purchase receipt' },
            { ar: 'فاتورة المورد', en: 'Supplier bill' },
            { ar: 'استثناء كمية أو سعر أو عملة', en: 'Quantity, price or currency exception' },
          ],
          control: {
            ar: 'المطابقة الثلاثية تعتمد على سياسة وتحملات تُتفق عليها مع المنشأة؛ النظام يكشف الفرق ويبلّغ عنه، وقرار الدفع يبقى للمسؤول.',
            en: 'Three-way matching depends on a policy and tolerances agreed with the business; the system surfaces and reports the difference, and the payment decision stays with the responsible person.',
          },
        },
        reports: {
          keys: ['Received Items To Be Billed', 'Billed Items To Be Received', 'Purchase Register', 'Purchase Receipt Trends', 'Landed Cost Report'],
          decision: { ar: 'هل ندفع هذه الفاتورة الآن، أم نحل الفرق أولًا؟', en: 'Do we pay this bill now, or resolve the difference first?' },
        },
      },
    },
    {
      id: 'PUR-SUPPLIER',
      kind: 'workspace',
      ws: {
        code: 'PUR-SUPPLIER',
        question: { ar: 'هل يعتمد قرار الشراء على الأداء أم على السعر فقط؟', en: 'Is the buying decision based on performance, or price alone?' },
        lede: {
          ar: 'قياس موثوقية المورد من الاستلامات الفعلية، وربط الأداء بالإنفاق والتركّز والمستحقات.',
          en: 'Measure supplier reliability from actual receipts, and connect performance to spend, concentration and amounts due.',
        },
        roles: [{ ar: 'مدير الموردين', en: 'Supplier manager' }, { ar: 'المدير المالي', en: 'CFO' }],
        overview: {
          body: {
            ar: 'بطاقة أداء الموردين تعرض لكل مورد عدد بنود الاستلام، ونسبة التسليم في الموعد، ونسبة القبول، ومتوسط المهلة، والإنفاق وحصته من الإجمالي، للفترة المختارة. الأرقام محسوبة من الاستلامات الفعلية لا من تقييم يدوي.',
            en: 'The supplier scorecard shows, for each supplier, receipt lines, on-time rate, acceptance rate, average lead time, spend and its share of the total for the chosen period. The figures come from actual receipts, not a manual rating.',
          },
          features: [
            { id: 'PU12', title: { ar: 'بطاقة أداء المورد', en: 'Supplier scorecard' }, body: { ar: 'في الموعد، والقبول، ومتوسط المهلة، والإنفاق، والحصة.', en: 'On time, acceptance, average lead time, spend and share.' }, shot: '06-pur-03-pu12' },
            { id: 'PUR-015', title: { ar: 'تحليل الإنفاق وتركّز الموردين', en: 'Spend analysis and supplier concentration' }, body: { ar: 'حصة كل مورد من الإنفاق تكشف الاعتماد على مورد واحد.', en: 'Each supplier’s share of spend reveals dependence on a single supplier.' }, shot: '06-pur-04-pur-015' },
            { id: 'PUR-016', title: { ar: 'موثوقية التوريد', en: 'Supply reliability' }, body: { ar: 'الالتزام بالمواعيد ونسبة القبول عبر الفترة.', en: 'On-time delivery and acceptance across the period.' }, shot: '06-pur-05-pur-016' },
          ],
          lead: { id: '06-pur-03-pu12' },
          extra: [{ id: '06-pur-04-pur-015' }],
        },
        work: {
          docs: [
            { sys: 'Supplier', name: { ar: 'المورد', en: 'Supplier' }, role: { ar: 'السجل الأصلي الذي يُبنى عليه الملف 360.', en: 'The original record the 360 view is built on.' } },
            { sys: 'Purchase Order', name: { ar: 'أمر الشراء', en: 'Purchase order' }, role: { ar: 'الموعد المتفق عليه.', en: 'The agreed date.' } },
            { sys: 'Purchase Receipt', name: { ar: 'إيصال الاستلام', en: 'Purchase receipt' }, role: { ar: 'تاريخ الوصول الفعلي والكمية المقبولة.', en: 'Actual arrival date and accepted quantity.' } },
            { sys: 'Purchase Invoice', name: { ar: 'فاتورة المشتريات', en: 'Purchase invoice' }, role: { ar: 'الإنفاق المفوتر.', en: 'Billed spend.' } },
            { sys: 'Payment Entry', name: { ar: 'سند الصرف', en: 'Payment entry' }, role: { ar: 'ما دُفع للمورد.', en: 'What was paid to the supplier.' } },
          ],
          steps: [
            { ar: 'ملف المورد 360', en: 'Supplier 360' },
            { ar: 'الالتزام بالمواعيد', en: 'On-time delivery' },
            { ar: 'التركّز والإنفاق', en: 'Concentration and spend' },
            { ar: 'المستحقات', en: 'Amounts due' },
          ],
          control: {
            ar: 'لا درجات أداء مخترعة: كل نسبة مشتقة من مستندات الاستلام والفواتير للفترة المختارة.',
            en: 'No invented scores: every rate is derived from the receipts and bills for the chosen period.',
          },
        },
        reports: {
          keys: ['Purchase Analytics', 'Supplier Ledger Summary', 'Accounts Payable', 'Item-wise Purchase History'],
          decision: { ar: 'مع من نجدد، ومن نحتاج بديلًا له قبل أن يصبح خطرًا؟', en: 'Whom do we renew with, and who needs an alternative before becoming a risk?' },
        },
      },
    },
    {
      id: 'match',
      kind: 'match',
      lede: {
        ar: 'ثلاثة مستندات تقول ثلاث حقائق مختلفة عن نفس الشراء. DIGIT Pro يضعها جنبًا إلى جنب ويكشف أين يختلف أحدها عن الآخر.',
        en: 'Three documents state three different facts about the same purchase. DIGIT Pro puts them side by side and shows where one differs from another.',
      },
      columns: [
        { doc: { ar: 'أمر الشراء', en: 'Purchase order' }, sys: 'Purchase Order', holds: { ar: 'ما طلبناه: الكمية والسعر والعملة والموعد.', en: 'What we ordered: quantity, price, currency and date.' } },
        { doc: { ar: 'إيصال الاستلام', en: 'Purchase receipt' }, sys: 'Purchase Receipt', holds: { ar: 'ما وصل: الكمية المقبولة والمرفوضة وتاريخ الوصول.', en: 'What arrived: accepted and rejected quantity and the arrival date.' } },
        { doc: { ar: 'فاتورة المورد', en: 'Supplier bill' }, sys: 'Purchase Invoice', holds: { ar: 'ما يطالب به المورد: السعر المفوتر والكمية والضريبة.', en: 'What the supplier claims: billed price, quantity and tax.' } },
      ],
      checks: [
        { id: 'PU9', title: { ar: 'فروقات السعر والكمية والعملة', en: 'Price, quantity and currency variances' }, body: { ar: 'تقرير بفروقات الفترة وعدد البنود المفحوصة.', en: 'A report of the period’s variances and lines checked.' }, shot: '06-pur-02-pu9' },
        { id: 'F8', title: { ar: 'استثناءات الذمم الدائنة', en: 'Payables exceptions' }, body: { ar: 'فروقات المطابقة والفواتير الموقوفة قبل الدفع.', en: 'Matching variances and held bills before payment.' }, shot: '02-cash-04-f8' },
        { id: 'F19', title: { ar: 'فواتير مكررة محتملة', en: 'Possible duplicate bills' }, body: { ar: 'نفس المورد ورقم الفاتورة، أو نفس الإجمالي خلال 7 أيام.', en: 'Same supplier and invoice number, or same total within 7 days.' }, shot: '02-cash-03-f19' },
      ],
      note: {
        ar: 'حدود التحمل وقواعد «لا تدفع» تُتفق عليها أثناء التهيئة؛ لا ندّعي منعًا آليًا عامًا للدفع.',
        en: 'Tolerances and “do not pay” rules are agreed during set-up; we do not claim a general automatic payment block.',
      },
    },
    {
      id: 'decisions',
      kind: 'decisions',
      lede: { ar: 'أسئلة يطرحها قائد المشتريات والمدير المالي قبل كل قرار شراء.', en: 'Questions the procurement lead and CFO ask before every purchasing decision.' },
      items: [
        { question: { ar: 'كم التزمنا به ولم يصل؟', en: 'How much have we committed that has not arrived?' }, answer: { ar: 'بطاقة الالتزامات المفتوحة: غير المستلم وغير المفوتر، مع استبعاد المغلق والملغى.', en: 'The open commitments card: not received and not billed, excluding closed and cancelled orders.' }, report: 'Purchase Order Analysis', shot: '06-pur-01-pu6' },
        { question: { ar: 'هل دفعنا أكثر من السعر المتفق عليه؟', en: 'Did we pay more than the agreed price?' }, answer: { ar: 'تقرير فروقات السعر والكمية والعملة للفترة.', en: 'The price, quantity and currency variance report for the period.' }, report: 'Purchase Register', shot: '06-pur-02-pu9' },
        { question: { ar: 'أي مورد يلتزم بالموعد؟', en: 'Which supplier delivers on time?' }, answer: { ar: 'بطاقة أداء المورد بنسب الموعد والقبول والمهلة.', en: 'The supplier scorecard with on-time, acceptance and lead-time rates.' }, report: 'Purchase Analytics', shot: '06-pur-03-pu12' },
        { question: { ar: 'هل نعتمد على مورد واحد أكثر من اللازم؟', en: 'Are we too dependent on one supplier?' }, answer: { ar: 'حصة كل مورد من الإنفاق في تحليل التركّز.', en: 'Each supplier’s share of spend in the concentration analysis.' }, report: 'Supplier Ledger Summary', shot: '06-pur-04-pur-015' },
      ],
    },
    {
      id: 'connections',
      kind: 'connections',
      lede: { ar: 'كل شراء يلمس المخزون والمالية.', en: 'Every purchase touches inventory and finance.' },
      items: [
        { to: 'inventory', title: { ar: 'مع المخزون', en: 'With inventory' }, body: { ar: 'الكمية المطلوبة شراؤها تدخل في الكمية المتوقعة للصنف، والاستلام يرفع الرصيد الفعلي.', en: 'Quantity on order feeds the item’s projected quantity, and the receipt raises the actual balance.' } },
        { to: 'accounting', title: { ar: 'مع المالية', en: 'With finance' }, body: { ar: 'فاتورة المورد تنشئ الذمة الدائنة، والفروقات تظهر في استثناءات الذمم قبل الدفع.', en: 'The supplier bill creates the payable, and variances appear in payables exceptions before payment.' } },
        { to: 'selling', title: { ar: 'مع المبيعات', en: 'With selling' }, body: { ar: 'بنود أوامر البيع غير المتوفرة تتحول إلى احتياج شراء يمكن تتبعه.', en: 'Sales order lines without stock become a purchasing need you can track.' } },
        { to: 'fixed-assets', title: { ar: 'مع الأصول', en: 'With fixed assets' }, body: { ar: 'فاتورة شراء الأصل تظهر في بداية الخط الزمني لملف الأصل 360.', en: 'The asset’s purchase invoice appears at the start of the Asset 360 timeline.' } },
      ],
    },
  ],
};

export default page;
