import type { ProPageContent } from '../types';

// Fixed Assets (V4 pages 25–29: AST-REGISTER, AST-CUSTODY, AST-DEP, AST-SERVICE). Lifecycle composition; stages
// without verified evidence are labelled as defined at set-up, and depreciation is never mixed with cash.
const page: ProPageContent = {
  key: 'fixed-assets',
  sections: [
    {
      id: 'intro',
      kind: 'intro',
      thesis: {
        ar: 'الأصل ليس سجل شراء منفصلًا؛ هو تكلفة، وعهدة، وقيمة، وإهلاك، وصيانة، وتصرف نهائي، وكل مرحلة لها مستندها.',
        en: 'An asset is not a separate purchase record; it is cost, custody, value, depreciation, maintenance and final disposal, and every stage has its document.',
      },
      question: { ar: 'من الاقتناء إلى القوائم المالية: ما القيمة الدفترية الآن ولماذا؟', en: 'From acquisition to the financial statements: what is the book value now, and why?' },
      sequence: [
        { ar: 'فاتورة مشتريات', en: 'Purchase Invoice' },
        { ar: 'الأصل وحركته', en: 'Asset & movement' },
        { ar: 'جدول الإهلاك', en: 'Depreciation schedule' },
        { ar: 'الصيانة أو الاستبعاد', en: 'Maintenance or disposal' },
      ],
      roles: [
        { ar: 'محاسب الأصول', en: 'Asset accountant' },
        { ar: 'أمين العهدة', en: 'Custodian' },
        { ar: 'مدير الأصول', en: 'Asset manager' },
        { ar: 'قائد الصيانة', en: 'Maintenance lead' },
        { ar: 'المدير المالي', en: 'CFO' },
      ],
    },
    {
      id: 'lifecycle',
      kind: 'lifecycle',
      lede: {
        ar: 'ست مراحل في حياة الأصل. المراحل المعلَّمة «بشاشة حقيقية» تظهر في لقطات النظام الحالية؛ والبقية تُضبط إجراءاتها المحاسبية مع منشأتك أثناء التهيئة.',
        en: 'Six stages in an asset’s life. Stages marked “real screen” appear in current system captures; the accounting procedures of the rest are set with your business during set-up.',
      },
      stages: [
        { title: { ar: 'الاقتناء', en: 'Acquisition' }, body: { ar: 'فاتورة الشراء أول حدث في الخط الزمني للأصل، برقمها وتاريخها وتكلفتها.', en: 'The purchase invoice is the first event on the asset’s timeline, with its number, date and cost.' }, ws: 'AST-REGISTER', shown: true, shot: '04-360-04-fa2' },
        { title: { ar: 'سجل الأصل', en: 'Asset register' }, body: { ar: 'ملف الأصل 360: التكلفة والإهلاك الافتتاحي والقيمة الدفترية والعهدة.', en: 'Asset 360: cost, opening depreciation, book value and custodian.' }, ws: 'AST-REGISTER', shown: true, shot: '08-ast-03-fix-003' },
        { title: { ar: 'العهدة والحركة', en: 'Custody and movement' }, body: { ar: 'العهدة الحالية تظهر على الأصل؛ إجراءات النقل والتوقيع تُضبط حسب سياسة المنشأة.', en: 'The current custodian shows on the asset; transfer and sign-off procedures follow company policy.' }, ws: 'AST-CUSTODY', shown: false },
        { title: { ar: 'الإهلاك', en: 'Depreciation' }, body: { ar: 'المرحّل مقابل المستحق غير المرحّل لكل دفتر، من جدول الإهلاك الأصلي للأصل.', en: 'Posted versus due-not-posted per book, from the asset’s native depreciation schedule.' }, ws: 'AST-DEP', shown: true, shot: '08-ast-01-fa4' },
        { title: { ar: 'الصيانة والاستبعاد', en: 'Maintenance and disposal' }, body: { ar: 'معالجة الإصلاح والرسملة والبيع والشطب تُعتمد مع فريقك المالي قبل التشغيل.', en: 'How repairs, capitalisation, sale and scrapping are treated is agreed with your finance team before go-live.' }, ws: 'AST-SERVICE', shown: false },
        { title: { ar: 'التقارير المالية', en: 'Financial reports' }, body: { ar: 'جسر حركة الأصول من الرصيد الافتتاحي إلى الختامي، ومطابقته مع الأستاذ العام.', en: 'The asset movement bridge from opening to closing balance, reconciled to the general ledger.' }, ws: 'AST-DEP', shown: true, shot: '08-ast-02-fa5' },
      ],
      note: {
        ar: 'جدول الإهلاك أثر محاسبي غير نقدي؛ لا يُعرض كحركة نقدية ولا يُدمج في توقعات السيولة.',
        en: 'A depreciation schedule is a non-cash accounting effect; it is never shown as a cash movement or merged into liquidity forecasts.',
      },
    },
    {
      id: 'AST-REGISTER',
      kind: 'workspace',
      ws: {
        code: 'AST-REGISTER',
        question: { ar: 'من أين جاءت تكلفة الأصل، وما مصدر اقتنائه؟', en: 'Where did the asset’s cost come from, and what is its acquisition source?' },
        lede: {
          ar: 'ربط الأصل بفاتورة شرائه وتكلفته، وعرض سجله الكامل من صفحة واحدة.',
          en: 'Link the asset to its purchase invoice and cost, and show its full record from one page.',
        },
        roles: [{ ar: 'محاسب الأصول', en: 'Asset accountant' }],
        overview: {
          body: {
            ar: 'ملف الأصل 360 يعرض التكلفة والإهلاك الافتتاحي والقيمة الدفترية والعهدة، ثم الإهلاك حسب الدفتر، ثم خطًا زمنيًا: الشراء برقم فاتورته، ثم الجاهزية للاستخدام، ثم كل قيد إهلاك مرحّل برقمه وقيمته.',
            en: 'Asset 360 shows cost, opening depreciation, book value and custodian, then depreciation by book, then a timeline: the purchase with its invoice number, readiness for use, and every posted depreciation entry with its number and amount.',
          },
          features: [
            { id: 'FA2', title: { ar: 'ملف الأصل 360 وخطه الزمني', en: 'Asset 360 and its timeline' }, body: { ar: 'من فاتورة الشراء إلى كل قيد إهلاك مرحّل.', en: 'From the purchase invoice to every posted depreciation entry.' }, shot: '04-360-04-fa2' },
            { id: 'FIX-003', title: { ar: 'بيانات الأصل وتاريخه', en: 'Asset master and history' }, body: { ar: 'الفئة والموقع والحالة والقيمة في بطاقة واحدة.', en: 'Category, location, status and value on one card.' }, shot: '08-ast-03-fix-003' },
          ],
          lead: { id: '04-360-04-fa2' },
          extra: [{ id: '08-ast-03-fix-003' }],
        },
        work: {
          docs: [
            { sys: 'Asset', name: { ar: 'الأصل', en: 'Asset' }, role: { ar: 'السجل الأصلي بالتكلفة والفئة والحالة.', en: 'The original record with cost, category and status.' } },
            { sys: 'Asset Category', name: { ar: 'فئة الأصل', en: 'Asset category' }, role: { ar: 'الحسابات وطريقة الإهلاك الافتراضية.', en: 'Accounts and default depreciation method.' } },
            { sys: 'Purchase Invoice', name: { ar: 'فاتورة المشتريات', en: 'Purchase invoice' }, role: { ar: 'مصدر التكلفة.', en: 'The source of the cost.' } },
            { sys: 'Asset Depreciation Schedule', name: { ar: 'جدول الإهلاك', en: 'Depreciation schedule' }, role: { ar: 'الأقساط المخططة لكل دفتر.', en: 'The planned instalments per book.' } },
          ],
          steps: [
            { ar: 'فاتورة الشراء', en: 'Purchase invoice' },
            { ar: 'الرسملة', en: 'Capitalisation' },
            { ar: 'ملف الأصل 360', en: 'Asset 360' },
            { ar: 'السجل', en: 'Register' },
          ],
          control: {
            ar: 'السجل يعرض الروابط الأصلية للأصل كما هي؛ إنشاء الأصل من بند الفاتورة يُعتمد أثناء التهيئة.',
            en: 'The register shows the asset’s original links as they are; creating an asset from an invoice line is agreed during set-up.',
          },
        },
        reports: {
          keys: ['Fixed Asset Register', 'Asset Depreciations and Balances', 'Asset Depreciation Ledger'],
          decision: { ar: 'هل كل أصل في السجل مرتبط بتكلفته الصحيحة؟', en: 'Is every asset in the register linked to its correct cost?' },
        },
      },
    },
    {
      id: 'AST-CUSTODY',
      kind: 'workspace',
      ws: {
        code: 'AST-CUSTODY',
        question: { ar: 'من المسؤول عن الأصل الآن؟', en: 'Who is responsible for the asset right now?' },
        lede: {
          ar: 'تتبع العهد والمواقع وحركات تسليم الأصل بين الموظفين والمواقع.',
          en: 'Track custody, locations and hand-overs of the asset between employees and sites.',
        },
        roles: [{ ar: 'أمين العهدة', en: 'Custodian' }, { ar: 'مدير الأصول', en: 'Asset manager' }],
        overview: {
          body: {
            ar: 'خانة العهدة جزء من ملف الأصل 360 وتظهر قيمتها كما هي، وفي الشاشة الحقيقية تظهر «غير محدد» لأن الأصل لم يُسلَّم لموظف بعد. حركات الأصل بين المواقع والموظفين تُسجل كمستند حركة أصلي، وخطوات الاعتماد والتوقيع تُضبط حسب سياسة منشأتك.',
            en: 'The custodian box is part of Asset 360 and shows its value as it is; on the real screen it reads “not set” because the asset has not been handed to an employee yet. Moves between sites and employees are recorded as an original asset movement document, and approval and sign-off steps follow your company policy.',
          },
          features: [
            { id: 'FIX-003', title: { ar: 'العهدة في ملف الأصل', en: 'Custodian on the asset record' }, body: { ar: 'العهدة والموقع جزء من بطاقة الأصل نفسها.', en: 'Custodian and location are part of the asset card itself.' }, shot: '08-ast-03-fix-003' },
          ],
          lead: { id: '08-ast-03-fix-003', focus: { x: 50, y: 38, zoom: 2 } },
        },
        work: {
          docs: [
            { sys: 'Asset', name: { ar: 'الأصل', en: 'Asset' }, role: { ar: 'الموقع والعهدة الحاليان.', en: 'Current location and custodian.' } },
            { sys: 'Asset Movement', name: { ar: 'حركة الأصل', en: 'Asset movement' }, role: { ar: 'النقل بين المواقع أو الموظفين.', en: 'Transfer between sites or employees.' } },
            { sys: 'Employee', name: { ar: 'الموظف', en: 'Employee' }, role: { ar: 'صاحب العهدة.', en: 'The custodian.' } },
            { sys: 'Location', name: { ar: 'الموقع', en: 'Location' }, role: { ar: 'مكان الأصل.', en: 'Where the asset is.' } },
          ],
          steps: [
            { ar: 'الأصل', en: 'Asset' },
            { ar: 'صاحب العهدة والموقع', en: 'Holder and location' },
            { ar: 'الحركة', en: 'Movement' },
            { ar: 'التحقق', en: 'Verification' },
          ],
          control: {
            ar: 'نقل العهدة وتوقيع الاستلام إجراء مستقل له سجله، لا مجرد تغيير حالة على الشاشة.',
            en: 'A custody transfer and its sign-off is a separate procedure with its own record, not just a status change on screen.',
          },
        },
        reports: {
          keys: ['Fixed Asset Register'],
          decision: { ar: 'هل كل أصل له مسؤول معروف وموقع صحيح؟', en: 'Does every asset have a known owner and a correct location?' },
        },
      },
    },
    {
      id: 'AST-DEP',
      kind: 'workspace',
      ws: {
        code: 'AST-DEP',
        question: { ar: 'كم الإهلاك المستحق مقابل المرحّل؟', en: 'How much depreciation is due versus posted?' },
        lede: {
          ar: 'فحص الإهلاك المخطط والمرحّل لكل دفتر، وربطه بالقوائم من خلال جسر حركة الأصول.',
          en: 'Check planned and posted depreciation per book, and connect it to the statements through the asset movement bridge.',
        },
        roles: [{ ar: 'محاسب الأصول', en: 'Asset accountant' }, { ar: 'المدير المالي', en: 'CFO' }],
        overview: {
          body: {
            ar: 'حالة الإهلاك حسب الدفتر تعرض عدد الأصول والمرحّل والمستحق غير المرحّل حتى تاريخ معين، وتوضح أن الإهلاك يُرحّل من جدول الأصل الأصلي. وجسر حركة الأصول يبدأ بالرصيد الافتتاحي ثم الإضافات والاستبعادات وإهلاك الفترة حتى الرصيد الختامي، مطابقًا لدفتر الأستاذ.',
            en: 'Depreciation status by book shows the number of assets, the posted amount and what is due but not posted as of a date, and states that depreciation posts from the asset’s native schedule. The asset movement bridge runs from opening balance through additions, disposals and the period’s depreciation to the closing balance, reconciled to the ledger.',
          },
          features: [
            { id: 'FA4', title: { ar: 'المجدول مقابل المستحق مقابل المرحّل', en: 'Scheduled vs. due vs. posted' }, body: { ar: 'لكل دفتر مالي، حتى تاريخ محدد.', en: 'For each finance book, as of a given date.' }, shot: '08-ast-01-fa4' },
            { id: 'FA5', title: { ar: 'جسر حركة الأصول', en: 'Asset movement bridge' }, body: { ar: 'من الافتتاحي إلى الختامي، مع المطابقة مع الأستاذ.', en: 'From opening to closing, reconciled to the ledger.' }, shot: '08-ast-02-fa5' },
            { id: 'FIX-015', title: { ar: 'مطابقة الأصول مع الأستاذ العام', en: 'Asset-to-GL reconciliation' }, body: { ar: 'أرصدة التكلفة والإهلاك المتراكم مقابل حساباتها.', en: 'Cost and accumulated depreciation balances against their accounts.' } },
          ],
          lead: { id: '08-ast-02-fa5' },
          extra: [{ id: '08-ast-01-fa4' }],
        },
        work: {
          docs: [
            { sys: 'Asset', name: { ar: 'الأصل', en: 'Asset' }, role: { ar: 'التكلفة والقيمة الدفترية.', en: 'Cost and book value.' } },
            { sys: 'Asset Depreciation Schedule', name: { ar: 'جدول الإهلاك', en: 'Depreciation schedule' }, role: { ar: 'الأقساط وتواريخها.', en: 'Instalments and their dates.' } },
            { sys: 'Journal Entry', name: { ar: 'قيد الإهلاك', en: 'Depreciation entry' }, role: { ar: 'القسط المرحّل فعلًا.', en: 'The instalment actually posted.' } },
            { sys: 'Finance Book', name: { ar: 'الدفتر المالي', en: 'Finance book' }, role: { ar: 'دفتر مستقل لكل أساس إهلاك عند الحاجة.', en: 'A separate book for each depreciation basis where needed.' } },
          ],
          steps: [
            { ar: 'الأصل', en: 'Asset' },
            { ar: 'الدفتر المالي', en: 'Finance book' },
            { ar: 'الجدول', en: 'Schedule' },
            { ar: 'المستحق والمرحّل', en: 'Due and posted' },
            { ar: 'جسر الأستاذ', en: 'GL bridge' },
          ],
          control: {
            ar: 'الفرق بين الجدول والمرحّل يُقرأ من مصدره؛ تشغيل الإهلاك نفسه يتم بإجراء النظام وصلاحيته.',
            en: 'Any gap between schedule and posting is read from its source; running depreciation itself uses the system’s action and permission.',
          },
        },
        reports: {
          keys: ['Asset Depreciation Ledger', 'Asset Depreciations and Balances', 'Fixed Asset Register'],
          decision: { ar: 'هل الإهلاك المستحق مرحّل قبل الإقفال؟', en: 'Is due depreciation posted before close?' },
        },
      },
    },
    {
      id: 'AST-SERVICE',
      kind: 'workspace',
      ws: {
        code: 'AST-SERVICE',
        question: { ar: 'هل الإصلاح يرفع قيمة الأصل أم يُسجل مصروفًا؟', en: 'Does a repair add to the asset’s value or count as an expense?' },
        lede: {
          ar: 'الصيانة والإصلاح والتصرف النهائي في الأصل، مع وضوح الأثر المحاسبي لكل منها.',
          en: 'Maintenance, repair and final disposal of the asset, with the accounting effect of each made clear.',
        },
        roles: [{ ar: 'قائد الصيانة', en: 'Maintenance lead' }, { ar: 'المالية', en: 'Finance' }],
        overview: {
          body: {
            ar: 'الصيانة والإصلاح مستندات أصلية مرتبطة بالأصل، أما معالجتها المحاسبية (مصروف أم إضافة لقيمة الأصل) ومعالجة البيع والشطب وأثرها في الربح والخسارة فتُتفق مع فريقك المالي قبل التشغيل، لأنها سياسات محاسبية لا إعدادًا تقنيًا.',
            en: 'Maintenance and repairs are original documents linked to the asset, while their accounting treatment (expense or addition to the asset’s value) and the treatment of sale and scrapping and their effect on profit and loss are agreed with your finance team before go-live, because they are accounting policies rather than technical settings.',
          },
          features: [],
        },
        work: {
          docs: [
            { sys: 'Asset Maintenance', name: { ar: 'صيانة الأصل', en: 'Asset maintenance' }, role: { ar: 'مهام الصيانة الدورية.', en: 'Periodic maintenance tasks.' } },
            { sys: 'Asset Repair', name: { ar: 'إصلاح الأصل', en: 'Asset repair' }, role: { ar: 'تكلفة الإصلاح ومعالجتها.', en: 'Repair cost and its treatment.' } },
            { sys: 'Asset Movement', name: { ar: 'حركة الأصل', en: 'Asset movement' }, role: { ar: 'خروج الأصل للصيانة وعودته.', en: 'The asset leaving for service and returning.' } },
            { sys: 'Asset', name: { ar: 'الأصل', en: 'Asset' }, role: { ar: 'الحالة بعد الاستبعاد أو البيع.', en: 'Its status after disposal or sale.' } },
          ],
          steps: [
            { ar: 'الإصلاح أو الصيانة', en: 'Repair or service' },
            { ar: 'المعالجة المحاسبية', en: 'Cost treatment' },
            { ar: 'التقييم', en: 'Valuation' },
            { ar: 'الاستبعاد', en: 'Disposal' },
          ],
          control: {
            ar: 'لا نصف إصلاحًا برسملة ولا استبعادًا بربح أو خسارة إلا عبر إجراء محاسبي معتمد.',
            en: 'A repair is never shown as capitalised, nor a disposal as a gain or loss, except through an approved accounting procedure.',
          },
        },
        reports: {
          keys: ['Fixed Asset Register', 'Asset Depreciations and Balances'],
          decision: { ar: 'هل نصلح الأصل أم نستبدله؟', en: 'Do we repair the asset or replace it?' },
        },
      },
    },
    {
      id: 'decisions',
      kind: 'decisions',
      lede: { ar: 'أسئلة المراقب المالي عن الأصول قبل الإقفال وأثناء المراجعة.', en: 'The controller’s asset questions before close and during audit.' },
      items: [
        { question: { ar: 'هل الإهلاك المستحق كله مرحّل؟', en: 'Is all due depreciation posted?' }, answer: { ar: 'حالة الإهلاك حسب الدفتر: المرحّل مقابل المستحق غير المرحّل.', en: 'Depreciation status by book: posted versus due but not posted.' }, report: 'Asset Depreciation Ledger', shot: '08-ast-01-fa4' },
        { question: { ar: 'هل أرصدة الأصول مطابقة للأستاذ؟', en: 'Do asset balances agree with the ledger?' }, answer: { ar: 'جسر حركة الأصول من الافتتاحي إلى الختامي.', en: 'The asset movement bridge from opening to closing.' }, report: 'Asset Depreciations and Balances', shot: '08-ast-02-fa5' },
        { question: { ar: 'ما القيمة الدفترية لهذا الأصل، ومن أين جاءت؟', en: 'What is this asset’s book value, and where did it come from?' }, answer: { ar: 'ملف الأصل 360: التكلفة، والإهلاك، والخط الزمني من فاتورة الشراء.', en: 'Asset 360: cost, depreciation and the timeline from the purchase invoice.' }, report: 'Fixed Asset Register', shot: '04-360-04-fa2' },
      ],
    },
    {
      id: 'connections',
      kind: 'connections',
      lede: { ar: 'الأصل يبدأ في المشتريات وينتهي في القوائم المالية.', en: 'An asset starts in purchasing and ends in the financial statements.' },
      items: [
        { to: 'purchasing', title: { ar: 'مع المشتريات', en: 'With purchasing' }, body: { ar: 'فاتورة الشراء هي أول حدث في الخط الزمني للأصل.', en: 'The purchase invoice is the first event on the asset’s timeline.' } },
        { to: 'accounting', title: { ar: 'مع المالية', en: 'With finance' }, body: { ar: 'قيود الإهلاك مرحّلة في الأستاذ، والجسر يطابق الأرصدة قبل الإقفال.', en: 'Depreciation entries are posted to the ledger, and the bridge reconciles balances before close.' } },
      ],
    },
  ],
};

export default page;
