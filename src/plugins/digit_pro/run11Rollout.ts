/**
 * DIGIT Pro Run11.1 — placement rollout to the other 18 section workspaces (owner closeout brief 2026-11-10 §B1).
 *
 * Every row of PLACEMENTS_448_RUN11_1.csv outside RUN11_SLICE is crosswalked here to the ACTIVE three-tab renderer
 * (SectionWorkspace.tsx), never to a new component:
 *  - KPI / CHART / QUEUE: the existing sections.ts element with the same basis (PRESERVE_EXISTING), a native-field queue the
 *    contract defines precisely (FRONTEND_PRESENT, ROLLOUT_QUEUES), or the typed reason it cannot be shown — the contract's
 *    definition is graded PROPOSED (FORMULA_PENDING_REVIEW), needs an owner rule (OWNER_POLICY_REQUIRED), is computed only by
 *    the Pro server (BACKEND_SOURCE_ONLY) or has no source at all (INTEGRATION_MISSING). Pending rows may name candidate
 *    existing elements; they never show a value.
 *  - DOCUMENT: derived from the sheet — the workspace register card (doc:) when sections.ts lists the DocType, otherwise its
 *    Document Hub entry (hub:, incl. hubs.ts RELATED_PLACEMENTS); child tables point at their parent document.
 *  - REPORT: derived from the sheet; the Full reports tab lists it with the workspace company and date.
 *  - ACTION: opens a native form / filtered native list / existing Pro screen / report, or states why it cannot.
 * scripts/pro-run11-crosswalk.ts writes this mapping to docs/run11_1/RUN11_CROSSWALK.json for the catalog and the ledger.
 */
import ROWS from "./run11Placements.generated.json";
import type { Bi } from "./command";
import type { Impl, Placement, PlacementType, Run11Action, Run11Tab } from "./run11";
import { SPECS, type Filter, type QueueDef, type SectionCtx } from "./sections";

type Row = [id: string, type: PlacementType, ws: string, label: string, target: string];
const ALL = ROWS as unknown as Row[];
/** Workspaces whose placements are defined one by one in run11.ts (first slice). */
export const SLICE_WS: ReadonlySet<string> = new Set(["ACC-DUES", "SEL-SALES"]);

const co = (c: SectionCtx): Filter => ["company", "=", c.company];
const SUB: Filter = ["docstatus", "=", 1];
const DRAFT: Filter = ["docstatus", "=", 0];
const NOT_CANCELLED: Filter = ["docstatus", "!=", 2];

const PROPOSED: Bi = ["The Run11.1 placement carries a proposed definition only; the owner has not approved a formula.", "يحمل الموضع تعريفًا مقترحًا فقط؛ لم يعتمد المالك معادلة بعد."];
const CHART_PROPOSED: Bi = ["The Run11.1 chart contract proposes this view without approved axes or measure; it needs an owner-approved metric definition.", "يقترح عقد الرسم في Run11.1 هذا العرض دون محاور أو مقياس معتمد؛ يحتاج إلى تعريف مقياس يعتمده المالك."];
const QUEUE_RULE: Bi = ["The Run11.1 queue names this work list but defines no selection rule; the owner must approve which native records belong in it.", "يسمّي عقد Run11.1 قائمة العمل هذه دون قاعدة اختيار؛ يجب أن يعتمد المالك السجلات الأصلية التي تنتمي إليها."];
const TOLERANCE: Bi = ["Needs the price and quantity matching tolerance (CR-05), which the owner has not approved.", "يتطلب حد التسامح في مطابقة السعر والكمية (CR-05) ولم يعتمده المالك بعد."];
const NO_WORKFLOW = (dt: string, ar: string): Bi => [`Draft ${dt} records; with no active ${dt} workflow, approval is the native Submit, which only roles allowed to submit can use.`, `سجلات ${ar} مسودة؛ دون مسار اعتماد مفعّل يكون الاعتماد هو الإرسال الأصلي، المتاح فقط للأدوار المسموح لها.`];

/** KPI / CHART / QUEUE crosswalk: [arabic label, impl, binds, note?, server?]. English label is the source sheet's. */
type Ent = [ar: string, impl: Impl, binds?: string[], note?: Bi, server?: string];
const FP = (ar: string, binds: string[] = []): Ent => [ar, "FORMULA_PENDING_REVIEW", binds, PROPOSED];
const CP = (ar: string, binds: string[] = []): Ent => [ar, "FORMULA_PENDING_REVIEW", binds, CHART_PROPOSED];
const POL = (ar: string, note: Bi = QUEUE_RULE, binds: string[] = []): Ent => [ar, "OWNER_POLICY_REQUIRED", binds, note];
const KEEP = (ar: string, bind: string, note?: Bi): Ent => (note ? [ar, "PRESERVE_EXISTING", [bind], note] : [ar, "PRESERVE_EXISTING", [bind]]);
const PART = (ar: string, binds: string[], note: Bi): Ent => [ar, "PARTIAL", binds, note];
const NEWQ = (ar: string, id: string, note: Bi): Ent => [ar, "FRONTEND_PRESENT", [`run11q:${id}`], note];
const MISSING = (ar: string, note: Bi): Ent => [ar, "INTEGRATION_MISSING", [], note];
const CREDIT_HOLD = "digit_pro.ops_models.get_credit_hold_queue";

export const ENTRIES: Record<string, Ent> = {
  /* ACC-OPS · Accounting operations */
  "KPI-ACC-OPS-01": KEEP("قيود يومية مسودة", "kpi:je-draft"), "KPI-ACC-OPS-02": FP("مسودات غير متوازنة"), "KPI-ACC-OPS-03": FP("قيود بانتظار الاعتماد"),
  "KPI-ACC-OPS-04": FP("حجم الترحيل", ["kpi:je-month"]), "KPI-ACC-OPS-05": FP("استثناءات إقفال الفترة"),
  "CH-ACC-OPS-01": PART("الترحيل حسب الفترة", ["chart:je-month"], ["Shown: submitted journal entries by posting month; the contract's General Ledger basis (every posted voucher type) is wider.", "المعروض: القيود اليومية المعتمدة حسب شهر الترحيل؛ أساس العقد (كل أنواع المستندات المرحّلة في الأستاذ العام) أوسع."]),
  "CH-ACC-OPS-02": PART("مزيج مصادر القيود", ["chart:je-type"], ["Shown: journal entries by voucher type; ledger rows posted by invoices and payments are not in this chart.", "المعروض: القيود اليومية حسب نوع القيد؛ قيود الأستاذ الناتجة عن الفواتير والمدفوعات ليست في هذا الرسم."]),
  "Q-ACC-OPS-01": POL("مسودات بها أخطاء"), "Q-ACC-OPS-02": POL("قيود بانتظار الاعتماد", ["No Journal Entry workflow is active and the approval template (PL7) is not approved; drafts to review are the nearest existing list.", "لا يوجد مسار اعتماد مفعّل للقيود ولم يُعتمد قالب الاعتماد (PL7)؛ أقرب قائمة قائمة هي المسودات للمراجعة."]),
  "Q-ACC-OPS-03": POL("مهام تصحيح متأخرة", ["No correction-task record exists in the source.", "لا يوجد سجل لمهام التصحيح في المصدر."]),
  /* ACC-CASH · Cash & banking */
  "KPI-ACC-CASH-01": FP("الرصيد البنكي المؤكد"), "KPI-ACC-CASH-02": KEEP("حركات غير مطابقة", "kpi:bt-open", ["Same basis: submitted bank transactions with status Unreconciled or Pending.", "نفس الأساس: حركات بنكية معتمدة حالتها غير مسوّاة أو معلقة."]),
  "KPI-ACC-CASH-03": FP("التحصيلات المتوقعة"), "KPI-ACC-CASH-04": FP("المدفوعات القادمة"), "KPI-ACC-CASH-05": FP("استثناءات البنك"),
  "CH-ACC-CASH-01": PART("حركة النقد الفعلية", ["chart:pe-month"], ["Shown: submitted payment entries by month; bank-statement lines are reconciled in Bank Reconciliation.", "المعروض: سندات الدفع المعتمدة حسب الشهر؛ أسطر كشف البنك تُسوّى في التسوية البنكية."]),
  "CH-ACC-CASH-02": CP("تعرض توقيت النقد"),
  "Q-ACC-CASH-01": KEEP("حركات بنكية غير مطابقة", "queue:bt-open"),
  "Q-ACC-CASH-02": NEWQ("أخطاء استيراد الكشوف", "bsi-error", ["Bank Statement Import records with native status Error or Partial Success.", "سجلات استيراد كشف البنك بحالتها الأصلية خطأ أو نجاح جزئي."]),
  "Q-ACC-CASH-03": NEWQ("مقبوضات بنكية غير مخصصة", "pe-recv-unalloc", ["Submitted receipts (Payment Entry, Receive) with unallocated amount above zero.", "مقبوضات معتمدة (سند دفع، قبض) بمبلغ غير مخصص أكبر من صفر."]),
  /* ACC-REPORT · Reporting & close */
  "KPI-ACC-REPORT-01": FP("استثناءات ميزان المراجعة"), "KPI-ACC-REPORT-02": FP("مهام إقفال معلقة"), "KPI-ACC-REPORT-03": FP("فروقات التسوية"),
  "KPI-ACC-REPORT-04": FP("حداثة التقارير"), "KPI-ACC-REPORT-05": FP("انحراف الموازنة"),
  "CH-ACC-REPORT-01": CP("اتجاه الأرباح والخسائر", ["pro:/pro/finance-intelligence"]), "CH-ACC-REPORT-02": CP("جاهزية الإقفال حسب المهمة", ["pro:/pro/period-control"]),
  "Q-ACC-REPORT-01": POL("مهام إقفال مفتوحة", ["No close-task record exists (the F11 close checklist is not built); Period Control lists what blocks closing.", "لا يوجد سجل لمهام الإقفال (قائمة الإقفال F11 غير مبنية)؛ شاشة التحكم بالفترات تعرض ما يمنع الإقفال."], ["pro:/pro/period-control"]),
  "Q-ACC-REPORT-02": POL("مراجعة عدم التوازن"),
  "Q-ACC-REPORT-03": POL("تقارير مالية مقيدة", ["The restricted-scope rule (R2) is not defined; reports already mark the rows you cannot see.", "قاعدة النطاق المقيد (R2) غير معرّفة؛ التقارير تشير أصلًا إلى الصفوف التي لا يمكنك رؤيتها."]),
  /* SEL-CUSTOMER · Customers */
  "KPI-SEL-CUSTOMER-01": FP("العملاء النشطون", ["kpi:cust-active"]), "KPI-SEL-CUSTOMER-02": FP("تعرض ذمم العملاء"), "KPI-SEL-CUSTOMER-03": FP("تجاوزات الحد الائتماني"),
  "KPI-SEL-CUSTOMER-04": FP("الطلبات المتكررة"), "KPI-SEL-CUSTOMER-05": FP("هامش الربح حسب العميل"),
  "CH-SEL-CUSTOMER-01": CP("مجموعات مبيعات العملاء"),
  "CH-SEL-CUSTOMER-02": ["تعرض العملاء مقابل الحد الائتماني", "BACKEND_SOURCE_ONLY", [], ["Credit exposure against the limit is computed by the DIGIT Pro server (customers over limit); not connected in this preview.", "يحسب خادم ديجيت برو التعرض مقابل الحد الائتماني (العملاء المتجاوزون)؛ غير متصل في هذه المعاينة."], CREDIT_HOLD],
  "Q-SEL-CUSTOMER-01": ["استثناءات الحد الائتماني", "BACKEND_SOURCE_ONLY", [], ["Customers over their credit limit are listed by the DIGIT Pro server; not connected in this preview.", "يعرض خادم ديجيت برو العملاء المتجاوزين للحد الائتماني؛ غير متصل في هذه المعاينة."], CREDIT_HOLD],
  "Q-SEL-CUSTOMER-02": POL("عملاء رئيسيون خاملون"), "Q-SEL-CUSTOMER-03": POL("استثناءات التسعير الخاص بالعملاء"),
  /* SEL-FULFILL · Fulfilment */
  "KPI-SEL-FULFILL-01": PART("طلبات بانتظار التسليم", ["kpi:so-deliver"], ["Shown: submitted orders with native status To Deliver or To Deliver and Bill; the contract counts every order with undelivered quantity, including orders on hold.", "المعروض: الطلبات المعتمدة بحالتها الأصلية بانتظار التسليم أو التسليم والفوترة؛ يعدّ العقد كل طلب بكمية غير مسلّمة بما فيها الموقوفة."]),
  "KPI-SEL-FULFILL-02": PART("مُسلّم غير مفوتر", ["kpi:dn-bill", "pro:/pro/delivered-not-billed"], ["This workspace counts delivery notes To Bill or Partially Billed (document value); unbilled quantity and value per line is on Delivered Not Billed.", "تعدّ هذه المساحة أذون التسليم بانتظار الفوترة أو المفوترة جزئيًا (قيمة المستند)؛ الكمية والقيمة غير المفوترة لكل بند في شاشة «مُسلّم غير مفوتر»."]),
  "KPI-SEL-FULFILL-03": FP("نسبة تأخر التسليم", ["kpi:so-late"]), "KPI-SEL-FULFILL-04": FP("المرتجعات المفتوحة", ["kpi:dn-ret"]), "KPI-SEL-FULFILL-05": FP("الكمية المؤجلة"),
  "CH-SEL-FULFILL-01": CP("اتجاه الالتزام بالتسليم"), "CH-SEL-FULFILL-02": CP("مسار التسليم إلى الفوترة"),
  "Q-SEL-FULFILL-01": POL("تأخر التجهيز والتغليف", ["Pick List has no due date in the source; lateness needs an owner rule.", "لا يحمل التجهيز تاريخ استحقاق في المصدر؛ يحتاج التأخر إلى قاعدة من المالك."]),
  "Q-SEL-FULFILL-02": KEEP("مُسلّم غير مفوتر", "queue:dn-bill"), "Q-SEL-FULFILL-03": POL("إشعارات دائنة معلقة للمرتجعات"),
  /* SEL-INTEL · Sales intelligence */
  "KPI-SEL-INTEL-01": PART("المبيعات المرحّلة", ["kpi:si-90"], ["Shown: submitted sales invoices of the last 90 days without returns (invoice totals); the contract nets linked returns and uses net amounts.", "المعروض: فواتير المبيعات المعتمدة لآخر 90 يومًا دون المرتجعات (إجمالي الفاتورة)؛ يخصم العقد المرتجعات المرتبطة ويستخدم الصافي."]),
  "KPI-SEL-INTEL-02": PART("النقد المحصل", ["kpi:pe-in"], ["Shown: customer receipts of the last 90 days, allocated or not; the contract counts only amounts allocated to sales invoices.", "المعروض: مقبوضات العملاء لآخر 90 يومًا مخصصة أو لا؛ يعدّ العقد المبالغ المخصصة لفواتير المبيعات فقط."]),
  "KPI-SEL-INTEL-03": PART("إجمالي الربح", ["pro:/pro/sales-analytics"], ["Gross profit is calculated by the native Gross Profit report (Full reports); this workspace does not repeat the figure.", "يحسب تقرير إجمالي الربح الأصلي الربح (التقارير الكاملة)؛ لا تكرر هذه المساحة الرقم."]),
  "KPI-SEL-INTEL-04": FP("التحصيلات المتأخرة", ["kpi:si-overdue"]), "KPI-SEL-INTEL-05": FP("تحقيق المستهدف"),
  "CH-SEL-INTEL-01": CP("المبيعات حسب المنطقة"), "CH-SEL-INTEL-02": CP("الهامش حسب مجموعة الأصناف"),
  "Q-SEL-INTEL-01": POL("حسابات عالية التعرض"), "Q-SEL-INTEL-02": POL("قطاعات بهامش متراجع"),
  "Q-SEL-INTEL-03": POL("فواتير كبيرة غير محصلة", ["No amount threshold for a large invoice is approved; overdue invoices are on Collections.", "لم يُعتمد حد مبلغ للفاتورة الكبيرة؛ الفواتير المتأخرة في شاشة التحصيل."], ["pro:/pro/collections"]),
  /* PUR-SOURCE · Sourcing */
  "KPI-PUR-SOURCE-01": FP("طلبات مواد مفتوحة", ["kpi:mr-open"]), "KPI-PUR-SOURCE-02": FP("طلبات عروض بانتظار الردود", ["kpi:rfq"]), "KPI-PUR-SOURCE-03": FP("تفاوت العروض"),
  "KPI-PUR-SOURCE-04": FP("دورة التوريد حتى الترسية"), "KPI-PUR-SOURCE-05": FP("طلبات عاجلة", ["kpi:mr-late"]),
  "CH-PUR-SOURCE-01": CP("مقارنة عروض الموردين"), "CH-PUR-SOURCE-02": CP("الطلبات حسب العمر"),
  "Q-PUR-SOURCE-01": ["طلبات بلا عروض", "BACKEND_SOURCE_ONLY", [], ["Requests without a supplier quotation are the native report “Material Requests for which Supplier Quotations are not created”, which runs on the DIGIT server (Full reports).", "الطلبات دون عرض مورد هي التقرير الأصلي «طلبات المواد التي لم تُنشأ لها عروض موردين»، ويعمل على الخادم الأصلي (التقارير الكاملة)."]],
  "Q-PUR-SOURCE-02": PART("طلبات عروض بلا رد", ["kpi:rfq"], ["Shown: RFQs sent; whether each supplier answered is on its supplier row (quote status) inside the RFQ.", "المعروض: طلبات العروض المرسلة؛ رد كل مورد يظهر في سطره (حالة العرض) داخل الطلب."]),
  "Q-PUR-SOURCE-03": POL("اختيارات توريد غير معتمدة", ["No sourcing approval template is approved (PL7); the award stays a native Purchase Order decision.", "لم يُعتمد قالب اعتماد التوريد (PL7)؛ تبقى الترسية قرار أمر شراء أصلي."]),
  /* PUR-ORDERS · Purchase orders */
  "KPI-PUR-ORDERS-01": PART("قيمة أوامر الشراء المفتوحة", ["kpi:po-open", "pro:/pro/open-purchase-orders"], ["This workspace sums the document total of orders to receive; the open value per line (ordered less received) is on Open Purchase Orders.", "تجمع هذه المساحة إجمالي مستند الأوامر بانتظار الاستلام؛ القيمة المفتوحة لكل بند (المطلوب ناقص المستلم) في شاشة أوامر الشراء المفتوحة."]),
  "KPI-PUR-ORDERS-02": FP("أوامر شراء متأخرة", ["kpi:po-late"]), "KPI-PUR-ORDERS-03": FP("المستلم مقابل المطلوب"), "KPI-PUR-ORDERS-04": FP("إيصالات غير مفوترة"), "KPI-PUR-ORDERS-05": FP("مخاطر مواعيد الموردين"),
  "CH-PUR-ORDERS-01": CP("تقادم أوامر الشراء حسب المورد"), "CH-PUR-ORDERS-02": CP("الالتزامات المفتوحة عبر الزمن"),
  "Q-PUR-ORDERS-01": POL("تأخر تأكيدات الموردين", ["Purchase Order has no supplier-confirmation state in the source.", "لا يحمل أمر الشراء حالة تأكيد من المورد في المصدر."]),
  "Q-PUR-ORDERS-02": POL("انحرافات أسعار أوامر الشراء", TOLERANCE),
  "Q-PUR-ORDERS-03": KEEP("أوامر بانتظار الاعتماد المسموح", "queue:po-draft", NO_WORKFLOW("Purchase Order", "أوامر الشراء")),
  /* PUR-RECEIVE · Receiving & matching */
  "KPI-PUR-RECEIVE-01": PART("مستلم غير مفوتر", ["kpi:pr-bill", "pro:/pro/received-not-billed"], ["This workspace counts receipts To Bill or Partly Billed (document value); unbilled quantity and value per line is on Received Not Billed.", "تعدّ هذه المساحة الإيصالات بانتظار الفوترة أو المفوترة جزئيًا (قيمة المستند)؛ الكمية والقيمة غير المفوترة لكل بند في شاشة «مستلم غير مفوتر»."]),
  "KPI-PUR-RECEIVE-02": POL("استثناءات مطابقة الفواتير", TOLERANCE), "KPI-PUR-RECEIVE-03": FP("الكمية المرفوضة"), "KPI-PUR-RECEIVE-04": FP("تأخر إيصالات الاستلام"), "KPI-PUR-RECEIVE-05": FP("فواتير موردين مسودة"),
  "CH-PUR-RECEIVE-01": POL("أنواع فروق المطابقة الثلاثية", TOLERANCE), "CH-PUR-RECEIVE-02": CP("دورة الاستلام حتى الفوترة"),
  "Q-PUR-RECEIVE-01": POL("بنود فواتير غير مطابقة", TOLERANCE),
  "Q-PUR-RECEIVE-02": NEWQ("فحوصات جودة مرفوضة", "qi-rejected", ["Submitted Quality Inspections with native status Rejected.", "فحوصات جودة معتمدة بحالتها الأصلية مرفوضة."]),
  "Q-PUR-RECEIVE-03": KEEP("مستلم غير مفوتر", "queue:pr-bill"),
  /* PUR-SUPPLIER · Suppliers */
  "KPI-PUR-SUPPLIER-01": FP("إنفاق الموردين", ["kpi:pi-12"]),
  "KPI-PUR-SUPPLIER-02": POL("نسبة الاستلام في الموعد", ["The contract requires an explicit inclusion rule for promised dates, which is not approved.", "يتطلب العقد قاعدة صريحة لإدراج التواريخ الموعودة، ولم تُعتمد."]),
  "KPI-PUR-SUPPLIER-03": FP("نسبة الرفض"), "KPI-PUR-SUPPLIER-04": FP("ذمم الموردين"),
  "KPI-PUR-SUPPLIER-05": POL("تركز الموردين", ["The number of top suppliers (N) is not fixed by the contract; it needs an owner decision.", "لا يحدد العقد عدد كبار الموردين (N)؛ يحتاج إلى قرار المالك."]),
  "CH-PUR-SUPPLIER-01": CP("توزيع تقييم الموردين"), "CH-PUR-SUPPLIER-02": CP("الإنفاق حسب المورد"),
  "Q-PUR-SUPPLIER-01": KEEP("موردون متأخرون", "queue:po-late", ["Rows are late orders; each row shows its supplier.", "الصفوف أوامر متأخرة؛ كل صف يعرض مورده."]),
  "Q-PUR-SUPPLIER-02": POL("إيصالات مرفوضة متكررة"), "Q-PUR-SUPPLIER-03": POL("تعرض تركز مرتفع"),
  /* INV-MASTER · Items & stock position */
  "KPI-INV-MASTER-01": FP("الأصناف النشطة", ["kpi:item-stock"]),
  "KPI-INV-MASTER-02": PART("تقييم المخزون", ["pro:/pro/stock-balance"], ["Stock value as of a date is on Stock Balance (posted stock ledger); this workspace shows counts.", "قيمة المخزون حتى تاريخ في شاشة رصيد المخزون (دفتر المخزون المرحّل)؛ تعرض هذه المساحة الأعداد."]),
  "KPI-INV-MASTER-03": PART("الكمية المتاحة", ["pro:/pro/stock-balance"], ["Actual, reserved and projected quantities per warehouse are on Item 360 and Stock Balance; one available figure needs an approved availability rule.", "الكميات الفعلية والمحجوزة والمتوقعة لكل مستودع في ملف الصنف ورصيد المخزون؛ رقم متاح واحد يحتاج إلى قاعدة إتاحة معتمدة."]),
  "KPI-INV-MASTER-04": FP("النقص المتوقع", ["kpi:bin-neg"]), "KPI-INV-MASTER-05": FP("مرشحات إعادة الطلب", ["pro:/pro/inventory-overview"]),
  "CH-INV-MASTER-01": CP("المخزون حسب المستودع"), "CH-INV-MASTER-02": CP("تعرض مجموعات الأصناف"),
  "Q-INV-MASTER-01": POL("إعداد أصناف ناقص"),
  "Q-INV-MASTER-02": PART("أصناف دون الحد", ["pro:/pro/inventory-overview"], ["Items below their native reorder level are listed on Inventory Overview, which prepares a Material Request draft; this workspace's queue lists negative projected quantity.", "الأصناف دون مستوى إعادة الطلب الأصلي في شاشة نظرة المخزون مع تجهيز مسودة طلب مواد؛ قائمة هذه المساحة تعرض الكمية المتوقعة السالبة."]),
  "Q-INV-MASTER-03": POL("عدم توازن المستودعات"),
  /* INV-MOVE · Stock movements */
  "KPI-INV-MOVE-01": FP("الاستلامات في الفترة", ["kpi:se-in"]), "KPI-INV-MOVE-02": FP("الصرف في الفترة", ["kpi:se-out"]), "KPI-INV-MOVE-03": FP("تحويلات قيد النقل"),
  "KPI-INV-MOVE-04": FP("مهام التجهيز المفتوحة"), "KPI-INV-MOVE-05": FP("استثناءات الحركة"),
  "CH-INV-MOVE-01": CP("الحركة حسب اليوم"), "CH-INV-MOVE-02": CP("تدفق التحويل بين المستودعات"),
  "Q-INV-MOVE-01": POL("تحويلات مستودعات معلقة", ["“Pending” can mean a draft transfer or stock in transit; the owner must choose.", "قد تعني «معلقة» تحويلًا مسودة أو مخزونًا قيد النقل؛ يجب أن يختار المالك."]),
  "Q-INV-MOVE-02": POL("تحويلات غير مسوّاة"),
  "Q-INV-MOVE-03": NEWQ("مهام تجهيز مفتوحة", "pick-open", ["Pick Lists with native status Open.", "قوائم تجهيز بحالتها الأصلية مفتوحة."]),
  /* INV-CONTROL · Counts, batches & serials */
  "KPI-INV-CONTROL-01": POL("قيمة فروقات الجرد", ["The contract values differences by an approved valuation policy that is not defined yet.", "يقيّم العقد الفروقات بسياسة تقييم معتمدة غير معرّفة بعد."]),
  "KPI-INV-CONTROL-02": FP("تسويات غير معتمدة", ["kpi:sr-draft"]), "KPI-INV-CONTROL-03": FP("دفعات قرب الانتهاء", ["kpi:batch-exp"]),
  "KPI-INV-CONTROL-04": FP("استثناءات تتبع الأرقام التسلسلية"), "KPI-INV-CONTROL-05": FP("تنبيهات المخزون السالب"),
  "CH-INV-CONTROL-01": CP("فروقات الجرد حسب المستودع"), "CH-INV-CONTROL-02": CP("أفق انتهاء الدفعات"),
  "Q-INV-CONTROL-01": POL("فروقات الجرد", ["Differences are shown per row inside each stock count (variance panel); a rule across counts is not defined.", "تظهر الفروقات لكل سطر داخل كل جرد (لوحة الفروقات)؛ لا توجد قاعدة عبر الجرود."]),
  "Q-INV-CONTROL-02": KEEP("دفعات قرب الانتهاء", "queue:batch-exp"), "Q-INV-CONTROL-03": POL("تتبع تسلسلي مفقود"),
  /* INV-REPORT · Stock reporting */
  "KPI-INV-REPORT-01": FP("قيمة المخزون"), "KPI-INV-REPORT-02": FP("قيمة المخزون بطيء الحركة"), "KPI-INV-REPORT-03": FP("النقص المتوقع", ["kpi:bin-neg"]),
  "KPI-INV-REPORT-04": PART("فرق دفتر المخزون عن الأستاذ العام", ["pro:/pro/stock-value-reconciliation"], ["Stock Value Reconciliation compares the stock ledger with the general ledger for the same company and date; this workspace does not repeat the figure.", "تقارن شاشة مطابقة قيمة المخزون دفتر المخزون بالأستاذ العام لنفس الشركة والتاريخ؛ لا تكرر هذه المساحة الرقم."]),
  "KPI-INV-REPORT-05": FP("تعرض التقادم"),
  "CH-INV-REPORT-01": CP("تقادم المخزون"), "CH-INV-REPORT-02": CP("تقييم المخزون حسب الفئة"),
  "Q-INV-REPORT-01": NEWQ("مخزون سالب", "bin-neg-actual", ["Bins with actual quantity below zero (projected shortages are a separate list).", "سجلات كمية بكمية فعلية أقل من صفر (النقص المتوقع قائمة منفصلة)."]),
  "Q-INV-REPORT-02": PART("عدم تطابق التقييم", ["pro:/pro/stock-value-reconciliation"], ["Stock Value Reconciliation lists the differences between the stock ledger and the general ledger.", "تعرض شاشة مطابقة قيمة المخزون الفروقات بين دفتر المخزون والأستاذ العام."]),
  "Q-INV-REPORT-03": KEEP("تنبيهات النقص المتوقع", "queue:bin-neg"),
  /* AST-REGISTER · Asset register */
  "KPI-AST-REGISTER-01": FP("الأصول النشطة", ["kpi:ast-use"]), "KPI-AST-REGISTER-02": FP("تكلفة الاقتناء"),
  "KPI-AST-REGISTER-03": PART("صافي القيمة الدفترية", ["pro:/pro/asset-register"], ["Book value per asset is on the Asset Register; a total needs the finance-book choice.", "القيمة الدفترية لكل أصل في سجل الأصول؛ الإجمالي يحتاج إلى اختيار الدفتر المالي."]),
  "KPI-AST-REGISTER-04": FP("اقتناءات غير مرسملة"), "KPI-AST-REGISTER-05": FP("إضافات الأصول"),
  "CH-AST-REGISTER-01": CP("الاقتناء حسب الشهر"), "CH-AST-REGISTER-02": KEEP("الأصول حسب الفئة", "chart:ast-cat"),
  "Q-AST-REGISTER-01": NEWQ("رسملة أصول معلقة", "acap-draft", ["Draft Asset Capitalization documents.", "مستندات رسملة أصول مسودة."]),
  "Q-AST-REGISTER-02": [`فئة أو دفتر مفقود`, "PARTIAL", ["run11q:ast-nocat"], ["Shown: assets without a category; finance-book rows are a child table checked inside each asset.", "المعروض: أصول بدون فئة؛ صفوف الدفاتر المالية جدول فرعي يُراجع داخل كل أصل."]],
  "Q-AST-REGISTER-03": POL("أصول بلا مصدر"),
  /* AST-CUSTODY · Custody & location */
  "KPI-AST-CUSTODY-01": FP("أصول بدون عهدة", ["kpi:ast-nocust"]), "KPI-AST-CUSTODY-02": FP("تسليمات معلقة", ["kpi:mv-draft"]), "KPI-AST-CUSTODY-03": FP("تحويلات المواقع", ["kpi:mv-90"]),
  "KPI-AST-CUSTODY-04": FP("أصول غير مؤكدة الاستلام"), "KPI-AST-CUSTODY-05": FP("عمر آخر حركة"),
  "CH-AST-CUSTODY-01": PART("توزيع العهد", ["chart:ast-loc"], ["Shown by location; a distribution by custodian needs the custodian axis.", "معروض حسب الموقع؛ التوزيع حسب صاحب العهدة يحتاج إلى محور صاحب العهدة."]),
  "CH-AST-CUSTODY-02": CP("التحويلات حسب الفترة"),
  "Q-AST-CUSTODY-01": POL("تسليمات غير مؤكدة", ["No acknowledgement step is approved for custody (FA6); receipt is recorded only by the submitted movement.", "لم تُعتمد خطوة تأكيد استلام للعهدة (FA6)؛ يُسجل الاستلام بالحركة المعتمدة فقط."]),
  "Q-AST-CUSTODY-02": NEWQ("أصول بموقع غير معروف", "ast-noloc", ["Same rule as the “Assets without location” figure: not cancelled, location not set.", "نفس قاعدة رقم «أصول بدون موقع»: غير ملغاة والموقع غير محدد."]),
  "Q-AST-CUSTODY-03": KEEP("اعتمادات النقل", "queue:mv-draft", NO_WORKFLOW("Asset Movement", "حركات الأصول")),
  /* AST-DEP · Depreciation */
  "KPI-AST-DEP-01": FP("الإهلاك المستحق", ["pro:/pro/depreciation"]), "KPI-AST-DEP-02": FP("الإهلاك المرحّل", ["kpi:je-dep-month"]), "KPI-AST-DEP-03": FP("جداول متأخرة"), "KPI-AST-DEP-04": FP("القيمة الدفترية"),
  "KPI-AST-DEP-05": MISSING("فروقات الأستاذ عن سجل الأصول", ["Needs a verified asset roll-forward (FA5), which the source does not contain.", "يتطلب كشف حركة أصول موثقًا (FA5)، وهو غير موجود في المصدر."]),
  "CH-AST-DEP-01": KEEP("الإهلاك حسب الشهر", "chart:je-dep"),
  "CH-AST-DEP-02": MISSING("جسر حركة الأصول", ["Needs a verified asset roll-forward (FA5), which the source does not contain.", "يتطلب كشف حركة أصول موثقًا (FA5)، وهو غير موجود في المصدر."]),
  "Q-AST-DEP-01": PART("جداول مستحقة غير مرحّلة", ["pro:/pro/depreciation"], ["Due, not yet posted schedule rows are on Depreciation Review.", "صفوف الجداول المستحقة غير المرحّلة في شاشة مراجعة الإهلاك."]),
  "Q-AST-DEP-02": MISSING("فروقات تسوية الدفاتر", ["Needs a verified asset roll-forward (FA5), which the source does not contain.", "يتطلب كشف حركة أصول موثقًا (FA5)، وهو غير موجود في المصدر."]),
  "Q-AST-DEP-03": POL("دفتر مالي مفقود"),
  /* AST-SERVICE · Maintenance & disposal */
  "KPI-AST-SERVICE-01": FP("صيانة مستحقة", ["kpi:log-due"]), "KPI-AST-SERVICE-02": FP("أصول قيد الإصلاح", ["kpi:rep-open"]), "KPI-AST-SERVICE-03": FP("تكلفة الإصلاح"),
  "KPI-AST-SERVICE-04": FP("أصول خاملة"), "KPI-AST-SERVICE-05": FP("الاستبعادات في الفترة", ["kpi:ast-disp"]),
  "CH-AST-SERVICE-01": CP("تكلفة الإصلاح مقابل الاستبدال"), "CH-AST-SERVICE-02": CP("اتجاه نتائج الاستبعاد"),
  "Q-AST-SERVICE-01": NEWQ("صيانة مفتوحة", "log-open", ["Maintenance log tasks with native status Planned or Overdue, any due date.", "مهام سجل الصيانة بحالتها الأصلية مخططة أو متأخرة، بأي تاريخ استحقاق."]),
  "Q-AST-SERVICE-02": POL("إصلاحات متكررة عالية التكلفة"), "Q-AST-SERVICE-03": POL("استبعاد بانتظار السياسة"),
};

/** Native-field queues the contract defines precisely (bound as run11q:<id>). Same evaluator, permission scope and drill as
 *  every section queue; the exported section contract (config/sections.json) is unchanged. */
export const ROLLOUT_QUEUES: Record<string, (c: SectionCtx) => QueueDef[]> = {
  "ACC-CASH": (c) => [
    { id: "bsi-error", label: ["Bank statement imports with errors", "استيراد كشوف بنكية بأخطاء"], doctype: "Bank Statement Import", filters: [co(c), ["status", "in", ["Error", "Partial Success"]]], date: "modified", party: "bank_account", order: "desc", action: ["Correct the file and import again", "صحّح الملف وأعد الاستيراد"], severity: "high" },
    { id: "pe-recv-unalloc", label: ["Unallocated bank receipts", "مقبوضات بنكية غير مخصصة"], doctype: "Payment Entry", filters: [co(c), SUB, ["payment_type", "=", "Receive"], ["unallocated_amount", ">", 0]], date: "posting_date", party: "party", amount: "unallocated_amount", cur: "paid_to_account_currency", order: "asc", action: ["Allocate against open invoices", "خصصها مقابل الفواتير المفتوحة"], severity: "medium" },
  ],
  "PUR-RECEIVE": (c) => [
    { id: "qi-rejected", label: ["Rejected quality inspections", "فحوصات جودة مرفوضة"], doctype: "Quality Inspection", filters: [co(c), SUB, ["status", "=", "Rejected"]], date: "report_date", party: "item_code", order: "desc", action: ["Return or quarantine the rejected quantity", "أرجع الكمية المرفوضة أو اعزلها"], severity: "high" },
  ],
  "INV-MOVE": (c) => [
    { id: "pick-open", label: ["Open pick lists", "قوائم تجهيز مفتوحة"], doctype: "Pick List", filters: [co(c), SUB, ["status", "=", "Open"]], date: "modified", party: "purpose", order: "asc", action: ["Pick and complete in the native Pick List", "جهّز وأكمل في قائمة التجهيز الأصلية"], severity: "medium" },
  ],
  "INV-REPORT": () => [
    { id: "bin-neg-actual", label: ["Negative actual stock", "مخزون فعلي سالب"], doctype: "Bin", filters: [["actual_qty", "<", 0]], date: "modified", party: "item_code", amount: "actual_qty", order: "asc", action: ["Correct the postings that drove stock negative", "صحّح الترحيلات التي جعلت المخزون سالبًا"], severity: "high" },
  ],
  "AST-REGISTER": (c) => [
    { id: "acap-draft", label: ["Draft asset capitalizations", "رسملة أصول مسودة"], doctype: "Asset Capitalization", filters: [co(c), DRAFT], date: "posting_date", party: "target_asset_name", order: "asc", action: ["Complete and submit the capitalization", "أكمل الرسملة واعتمدها"], severity: "medium" },
    { id: "ast-nocat", label: ["Assets without category", "أصول بدون فئة"], doctype: "Asset", filters: [co(c), NOT_CANCELLED, ["asset_category", "is", "not set"]], date: "purchase_date", party: "asset_name", order: "asc", action: ["Set the asset category", "حدد فئة الأصل"], severity: "high" },
  ],
  "AST-CUSTODY": (c) => [
    { id: "ast-noloc", label: ["Assets at unknown location", "أصول بموقع غير معروف"], doctype: "Asset", filters: [co(c), NOT_CANCELLED, ["location", "is", "not set"]], date: "purchase_date", party: "asset_name", order: "asc", action: ["Record the location with an Asset Movement", "سجّل الموقع بحركة أصل"], severity: "high" },
  ],
  "AST-SERVICE": (c) => [
    { id: "log-open", label: ["Open maintenance tasks", "مهام صيانة مفتوحة"], doctype: "Asset Maintenance Log", filters: [["maintenance_status", "in", ["Planned", "Overdue"]]], date: "due_date", party: "asset_name", order: "asc", action: ["Complete the task", "إنجاز المهمة"], severity: "medium", overdueFrom: c.asOf },
  ],
};

/* ------------------------------------------------------------------ actions (ACT-*) ------------------------------------------------------------------ */
type A = Run11Action;
const act = (id: string, label: Bi, how: Bi, rest: Omit<A, "id" | "label" | "how">): A => ({ id, label, how, ...rest });
const POLICY_HOW = (en: string, ar: string): Bi => [en, ar];
export const ROLLOUT_ACTIONS: Record<string, A[]> = {
  "ACC-OPS": [
    act("ACT-ACC-OPS-01", ["New journal entry", "قيد يومية جديد"], ["Opens the native Journal Entry form when your role may create it.", "يفتح نموذج القيد اليومي الأصلي عندما يسمح دورك بالإنشاء."], { kind: "native-new", doctype: "Journal Entry" }),
    act("ACT-ACC-OPS-02", ["Open original", "فتح الأصل"], ["Every entry number opens its native form; the source voucher is linked inside the entry.", "كل رقم قيد يفتح نموذجه الأصلي؛ المستند المصدر مرتبط داخل القيد."], { kind: "list", doctype: "Journal Entry", filters: (c) => [co(c), SUB] }),
    act("ACT-ACC-OPS-03", ["Compare voucher", "مقارنة المستند"], POLICY_HOW("The contract does not define what a voucher is compared with; the owner must approve the comparison basis.", "لا يحدد العقد ما يُقارن به المستند؛ يجب أن يعتمد المالك أساس المقارنة."), { kind: "policy" }),
    act("ACT-ACC-OPS-04", ["Submit by native workflow", "الإرسال عبر المسار الأصلي"], ["Open a draft entry and submit it in the native form; an active workflow decides who may submit.", "افتح قيدًا مسودة وأرسله من النموذج الأصلي؛ مسار الاعتماد المفعّل يحدد من يمكنه الإرسال."], { kind: "list", doctype: "Journal Entry", filters: (c) => [co(c), DRAFT] }),
  ],
  "ACC-CASH": [
    act("ACT-ACC-CASH-01", ["Review match candidates", "مراجعة مرشحات المطابقة"], ["Bank Reconciliation lists each unmatched statement line with its candidate payments.", "تعرض التسوية البنكية كل سطر غير مطابق مع الدفعات المرشحة له."], { kind: "pro", to: "/pro/bank-reconciliation" }),
    act("ACT-ACC-CASH-02", ["Open bank transaction", "فتح الحركة البنكية"], ["Submitted bank transactions still to reconcile; each opens its native form.", "الحركات البنكية المعتمدة غير المسوّاة؛ كل حركة تفتح نموذجها الأصلي."], { kind: "list", doctype: "Bank Transaction", filters: (c) => [co(c), SUB, ["status", "in", ["Unreconciled", "Pending"]]] }),
    act("ACT-ACC-CASH-03", ["Reconcile in the native tool", "التسوية في الأداة الأصلية"], ["The native Bank Reconciliation Tool matches lines; it changes records only when you confirm.", "تطابق أداة التسوية البنكية الأصلية الأسطر؛ لا تغيّر السجلات إلا عند تأكيدك."], { kind: "tool", doctype: "Bank Reconciliation Tool" }),
    act("ACT-ACC-CASH-04", ["View cash source", "عرض مصدر النقد"], ["Received and paid entries with their allocation; each opens its native document.", "المقبوضات والمدفوعات مع تخصيصها؛ كل سطر يفتح مستنده الأصلي."], { kind: "pro", to: "/pro/payments" }),
  ],
  "ACC-REPORT": [
    act("ACT-ACC-REPORT-01", ["Run source report", "تشغيل التقرير المصدر"], ["Full reports lists every report of this workspace with the same company and date.", "تعرض التقارير الكاملة كل تقارير هذه المساحة بنفس الشركة والتاريخ."], { kind: "tab", to: "reports" }),
    act("ACT-ACC-REPORT-02", ["Investigate variance", "تحليل الانحراف"], ["Finance Intelligence compares periods and shows the drivers of each variance.", "تقارن شاشة الذكاء المالي الفترات وتعرض أسباب كل انحراف."], { kind: "pro", to: "/pro/finance-intelligence" }),
    act("ACT-ACC-REPORT-03", ["Review close tasks", "مراجعة مهام الإقفال"], ["Period Control lists what blocks closing and the lock state of each period.", "تعرض شاشة التحكم بالفترات ما يمنع الإقفال وحالة قفل كل فترة."], { kind: "pro", to: "/pro/period-control" }),
    act("ACT-ACC-REPORT-04", ["Export where allowed", "التصدير حيث يُسمح"], ["Open the report and use its menu to print, save as PDF or export.", "افتح التقرير واستخدم قائمته للطباعة أو الحفظ PDF أو التصدير."], { kind: "report", report: "General Ledger" }),
  ],
  "SEL-CUSTOMER": [
    act("ACT-SEL-CUSTOMER-01", ["Open Customer 360", "فتح ملف العميل الشامل"], ["Profile, dues, orders and invoices of one customer.", "ملف العميل وذممه وطلباته وفواتيره."], { kind: "pro", to: "/pro/customer-360" }),
    act("ACT-SEL-CUSTOMER-02", ["Inspect ageing", "فحص التقادم"], ["Accounts Receivable report with the same company and as-of date.", "تقرير الذمم المدينة بنفس الشركة والتاريخ."], { kind: "report", report: "Accounts Receivable" }),
    act("ACT-SEL-CUSTOMER-03", ["Review price lists", "مراجعة قوائم الأسعار"], ["Selling price lists; each opens its native form and item prices.", "قوائم أسعار البيع؛ كل قائمة تفتح نموذجها الأصلي وأسعار أصنافها."], { kind: "list", doctype: "Price List", filters: () => [["selling", "=", 1]] }),
    act("ACT-SEL-CUSTOMER-04", ["Open linked invoices", "فتح الفواتير المرتبطة"], ["Submitted customer invoices of this company; filter by customer in the native list.", "فواتير العملاء المعتمدة لهذه الشركة؛ صفِّ حسب العميل في القائمة الأصلية."], { kind: "list", doctype: "Sales Invoice", filters: (c) => [co(c), SUB] }),
  ],
  "SEL-FULFILL": [
    act("ACT-SEL-FULFILL-01", ["Open fulfilment board", "فتح لوحة التنفيذ"], ["Line-level delivery, return and billing progress of every open order.", "تقدم التسليم والمرتجع والفوترة لكل بند في الطلبات المفتوحة."], { kind: "pro", to: "/pro/order-fulfilment" }),
    act("ACT-SEL-FULFILL-02", ["Create delivery from the order", "إنشاء تسليم من الطلب"], ["Open an order to deliver and use Create → Delivery Note; the delivery keeps the order link.", "افتح طلبًا للتسليم واستخدم إنشاء ← إذن تسليم؛ يحتفظ الإذن بربط الطلب."], { kind: "list", doctype: "Sales Order", filters: (c) => [co(c), SUB, ["status", "in", ["To Deliver and Bill", "To Deliver"]]] }),
    act("ACT-SEL-FULFILL-03", ["Review partial deliveries", "مراجعة التسليمات الجزئية"], ["Orders delivered in part and still open for delivery.", "طلبات سُلّمت جزئيًا ولا تزال مفتوحة للتسليم."], { kind: "list", doctype: "Sales Order", filters: (c) => [co(c), SUB, ["status", "in", ["To Deliver and Bill", "To Deliver"]], ["per_delivered", ">", 0]] }),
    act("ACT-SEL-FULFILL-04", ["Open invoice origin", "فتح أصل الفاتورة"], ["Each invoice opens its native form; Connections shows the order and delivery it came from.", "كل فاتورة تفتح نموذجها الأصلي؛ تعرض الروابط الطلب والتسليم الذي جاءت منه."], { kind: "list", doctype: "Sales Invoice", filters: (c) => [co(c), SUB] }),
  ],
  "SEL-INTEL": [
    act("ACT-SEL-INTEL-01", ["Open source report", "فتح التقرير المصدر"], ["Sales Analytics breaks sales down by customer, item and territory with drill-down to invoices.", "تحلل شاشة تحليلات المبيعات المبيعات حسب العميل والصنف والمنطقة مع التنقل إلى الفواتير."], { kind: "pro", to: "/pro/sales-analytics" }),
    act("ACT-SEL-INTEL-02", ["Drill to invoice", "الانتقال إلى الفاتورة"], ["Submitted sales invoices without returns; each opens its native form.", "فواتير المبيعات المعتمدة دون المرتجعات؛ كل فاتورة تفتح نموذجها الأصلي."], { kind: "list", doctype: "Sales Invoice", filters: (c) => [co(c), SUB, ["is_return", "=", 0]] }),
    act("ACT-SEL-INTEL-03", ["Start a collections task", "بدء مهمة تحصيل"], ["Collections ranks invoices to chase; assign the follow-up from the invoice sidebar (Assign to).", "ترتب شاشة التحصيل الفواتير للمتابعة؛ عيّن المتابعة من الشريط الجانبي للفاتورة (إسناد إلى)."], { kind: "pro", to: "/pro/collections" }),
    act("ACT-SEL-INTEL-04", ["Review margin exception", "مراجعة استثناء الهامش"], POLICY_HOW("No margin threshold is approved (SEL-008), so margin exceptions cannot be listed yet.", "لم يُعتمد حد للهامش (SEL-008)، لذا لا يمكن عرض استثناءات الهامش بعد."), { kind: "policy" }),
  ],
  "PUR-SOURCE": [
    act("ACT-PUR-SOURCE-01", ["New RFQ from a request", "طلب عروض جديد من طلب مواد"], ["Open a pending material request and use Create → Request for Quotation.", "افتح طلب مواد معلقًا واستخدم إنشاء ← طلب عروض أسعار."], { kind: "list", doctype: "Material Request", filters: (c) => [co(c), SUB, ["material_request_type", "=", "Purchase"], ["status", "in", ["Pending", "Partially Ordered"]]] }),
    act("ACT-PUR-SOURCE-02", ["Compare quotes", "مقارنة العروض"], ["Supplier Quotation Comparison lists the quoted rates side by side.", "يعرض تقرير مقارنة عروض الموردين الأسعار جنبًا إلى جنب."], { kind: "report", report: "Supplier Quotation Comparison" }),
    act("ACT-PUR-SOURCE-03", ["Approve selection by policy", "اعتماد الاختيار حسب السياسة"], POLICY_HOW("No sourcing approval template is approved (PL7); the award stays a native Purchase Order decision.", "لم يُعتمد قالب اعتماد التوريد (PL7)؛ تبقى الترسية قرار أمر شراء أصلي."), { kind: "policy" }),
    act("ACT-PUR-SOURCE-04", ["Create PO from the chosen quotation", "إنشاء أمر شراء من العرض المختار"], ["Open the chosen supplier quotation and use Create → Purchase Order.", "افتح عرض المورد المختار واستخدم إنشاء ← أمر شراء."], { kind: "list", doctype: "Supplier Quotation", filters: (c) => [co(c), SUB] }),
  ],
  "PUR-ORDERS": [
    act("ACT-PUR-ORDERS-01", ["Open purchase order", "فتح أمر الشراء"], ["Submitted purchase orders; each opens its native form.", "أوامر الشراء المعتمدة؛ كل أمر يفتح نموذجه الأصلي."], { kind: "list", doctype: "Purchase Order", filters: (c) => [co(c), SUB] }),
    act("ACT-PUR-ORDERS-02", ["View receipt progress", "عرض تقدم الاستلام"], ["Open Purchase Orders shows ordered, received and billed quantity per line.", "تعرض شاشة أوامر الشراء المفتوحة الكمية المطلوبة والمستلمة والمفوترة لكل بند."], { kind: "pro", to: "/pro/open-purchase-orders" }),
    act("ACT-PUR-ORDERS-03", ["Inspect ETA risk", "فحص مخاطر الموعد"], ["Orders still to receive whose required-by date has passed.", "أوامر بانتظار الاستلام تجاوزت تاريخ الاستلام المطلوب."], { kind: "list", doctype: "Purchase Order", filters: (c) => [co(c), SUB, ["status", "in", ["To Receive and Bill", "To Receive"]], ["schedule_date", "<", c.asOf]] }),
    act("ACT-PUR-ORDERS-04", ["Approve via native workflow", "الاعتماد عبر المسار الأصلي"], ["Open a draft order and submit it in the native form; an active workflow decides who may approve.", "افتح أمرًا مسودة وأرسله من النموذج الأصلي؛ مسار الاعتماد المفعّل يحدد من يمكنه الاعتماد."], { kind: "list", doctype: "Purchase Order", filters: (c) => [co(c), DRAFT] }),
  ],
  "PUR-RECEIVE": [
    act("ACT-PUR-RECEIVE-01", ["Inspect PO / receipt / invoice", "فحص الأمر والإيصال والفاتورة"], ["Received lines still to invoice, each with its order and receipt.", "بنود مستلمة بانتظار الفوترة، كل بند مع أمره وإيصاله."], { kind: "pro", to: "/pro/received-not-billed" }),
    act("ACT-PUR-RECEIVE-02", ["Resolve variance", "معالجة الفرق"], POLICY_HOW("Price and quantity tolerance (CR-05) is not approved, so variances cannot be judged yet.", "لم يُعتمد حد التسامح في السعر والكمية (CR-05)، لذا لا يمكن الحكم على الفروق بعد."), { kind: "policy" }),
    act("ACT-PUR-RECEIVE-03", ["Open original invoice", "فتح الفاتورة الأصلية"], ["Submitted supplier invoices; each opens its native form.", "فواتير الموردين المعتمدة؛ كل فاتورة تفتح نموذجها الأصلي."], { kind: "list", doctype: "Purchase Invoice", filters: (c) => [co(c), SUB] }),
    act("ACT-PUR-RECEIVE-04", ["Submit after checks", "الإرسال بعد الفحص"], ["Open a draft supplier invoice; the native form validates it on Submit.", "افتح فاتورة مورد مسودة؛ يتحقق النموذج الأصلي منها عند الإرسال."], { kind: "list", doctype: "Purchase Invoice", filters: (c) => [co(c), DRAFT] }),
  ],
  "PUR-SUPPLIER": [
    act("ACT-PUR-SUPPLIER-01", ["Open Supplier 360", "فتح ملف المورد الشامل"], ["Open a supplier: its Supplier 360 panel shows orders, receipts, invoices and dues.", "افتح موردًا: تعرض لوحة ملفه الشامل الأوامر والإيصالات والفواتير والذمم."], { kind: "list", doctype: "Supplier", filters: () => [["disabled", "=", 0]] }),
    act("ACT-PUR-SUPPLIER-02", ["Inspect late deliveries", "فحص التسليمات المتأخرة"], ["Orders still to receive whose required-by date has passed, with their supplier.", "أوامر بانتظار الاستلام تجاوزت تاريخ الاستلام المطلوب مع موردها."], { kind: "list", doctype: "Purchase Order", filters: (c) => [co(c), SUB, ["status", "in", ["To Receive and Bill", "To Receive"]], ["schedule_date", "<", c.asOf]] }),
    act("ACT-PUR-SUPPLIER-03", ["Compare spend", "مقارنة الإنفاق"], ["Purchase Analytics compares spend by supplier and period.", "يقارن تقرير تحليلات المشتريات الإنفاق حسب المورد والفترة."], { kind: "report", report: "Purchase Analytics" }),
    act("ACT-PUR-SUPPLIER-04", ["Open payables", "فتح الذمم الدائنة"], ["Supplier dues by age with the invoices behind them.", "ذمم الموردين حسب العمر مع الفواتير المكونة لها."], { kind: "pro", to: "/pro/payables" }),
  ],
  "INV-MASTER": [
    act("ACT-INV-MASTER-01", ["Open Item 360", "فتح ملف الصنف الشامل"], ["Open an item: its Item 360 panel shows stock by warehouse and related documents.", "افتح صنفًا: تعرض لوحة ملفه الشامل المخزون حسب المستودع والمستندات المرتبطة."], { kind: "list", doctype: "Item", filters: () => [["disabled", "=", 0]] }),
    act("ACT-INV-MASTER-02", ["Preview replenishment", "معاينة إعادة التزويد"], ["Inventory Overview lists items below reorder level and prepares a Material Request draft.", "تعرض شاشة نظرة المخزون الأصناف دون مستوى إعادة الطلب وتجهز مسودة طلب مواد."], { kind: "pro", to: "/pro/inventory-overview" }),
    act("ACT-INV-MASTER-03", ["Inspect warehouse balance", "فحص رصيد المستودع"], ["Stock Balance per warehouse and item from the posted stock ledger.", "رصيد المخزون لكل مستودع وصنف من دفتر المخزون المرحّل."], { kind: "pro", to: "/pro/stock-balance" }),
    act("ACT-INV-MASTER-04", ["Open stock ledger", "فتح دفتر المخزون"], ["Every posted stock movement with its voucher.", "كل حركة مخزون مرحّلة مع مستندها."], { kind: "pro", to: "/pro/stock-ledger" }),
  ],
  "INV-MOVE": [
    act("ACT-INV-MOVE-01", ["Open stock movement", "فتح حركة المخزون"], ["Submitted stock entries; each opens its native form.", "قيود المخزون المعتمدة؛ كل قيد يفتح نموذجه الأصلي."], { kind: "list", doctype: "Stock Entry", filters: (c) => [co(c), SUB] }),
    act("ACT-INV-MOVE-02", ["Create a transfer", "إنشاء تحويل"], ["Opens a new native Stock Entry; choose the purpose Material Transfer. Rows are validated on Save.", "يفتح قيد مخزون أصليًا جديدًا؛ اختر الغرض تحويل مواد. تُتحقق الأسطر عند الحفظ."], { kind: "native-new", doctype: "Stock Entry" }),
    act("ACT-INV-MOVE-03", ["Inspect related delivery", "فحص التسليم المرتبط"], ["Submitted delivery notes; each opens its native form with its stock rows.", "أذون التسليم المعتمدة؛ كل إذن يفتح نموذجه الأصلي مع أسطر المخزون."], { kind: "list", doctype: "Delivery Note", filters: (c) => [co(c), SUB] }),
    act("ACT-INV-MOVE-04", ["Scan with mobile", "المسح بالجوال"], ["No mobile scanning screen exists in the source (IN5).", "لا توجد شاشة مسح بالجوال في المصدر (IN5)."], { kind: "missing" }),
  ],
  "INV-CONTROL": [
    act("ACT-INV-CONTROL-01", ["Open count session", "فتح جلسة جرد"], ["Draft stock counts; open one to continue counting.", "جرود مخزون مسودة؛ افتح واحدًا لمتابعة العد."], { kind: "list", doctype: "Stock Reconciliation", filters: (c) => [co(c), DRAFT] }),
    act("ACT-INV-CONTROL-02", ["Review difference", "مراجعة الفرق"], ["Open a stock count: its variance panel shows quantity and value differences per row.", "افتح جردًا: تعرض لوحة الفروقات فروق الكمية والقيمة لكل سطر."], { kind: "list", doctype: "Stock Reconciliation", filters: (c) => [co(c), NOT_CANCELLED] }),
    act("ACT-INV-CONTROL-03", ["Trace serial / batch", "تتبع الرقم التسلسلي أو الدفعة"], ["Open a batch: its history panel shows every movement of it.", "افتح دفعة: تعرض لوحة سجلها كل حركاتها."], { kind: "list", doctype: "Batch", filters: () => [["disabled", "=", 0]] }),
    act("ACT-INV-CONTROL-04", ["Submit via native document", "الإرسال عبر المستند الأصلي"], ["Submit the count in its native form; posting writes the stock ledger.", "أرسل الجرد من نموذجه الأصلي؛ الترحيل يكتب دفتر المخزون."], { kind: "list", doctype: "Stock Reconciliation", filters: (c) => [co(c), DRAFT] }),
  ],
  "INV-REPORT": [
    act("ACT-INV-REPORT-01", ["Open stock valuation report", "فتح تقرير تقييم المخزون"], ["Stock Balance report with quantity and value per item and warehouse.", "تقرير رصيد المخزون بالكمية والقيمة لكل صنف ومستودع."], { kind: "report", report: "Stock Balance" }),
    act("ACT-INV-REPORT-02", ["Reconcile with GL", "المطابقة مع الأستاذ العام"], ["Stock Value Reconciliation compares the stock ledger with the general ledger.", "تقارن شاشة مطابقة قيمة المخزون دفتر المخزون بالأستاذ العام."], { kind: "pro", to: "/pro/stock-value-reconciliation" }),
    act("ACT-INV-REPORT-03", ["Investigate ageing", "تحليل التقادم"], ["Stock Ageing report by item and warehouse.", "تقرير تقادم المخزون حسب الصنف والمستودع."], { kind: "report", report: "Stock Ageing" }),
    act("ACT-INV-REPORT-04", ["Export source report", "تصدير التقرير المصدر"], ["Open the report and use its menu to export.", "افتح التقرير واستخدم قائمته للتصدير."], { kind: "report", report: "Stock Ledger" }),
  ],
  "AST-REGISTER": [
    act("ACT-AST-REGISTER-01", ["Open Asset 360", "فتح ملف الأصل الشامل"], ["Open an asset: its Asset 360 panel shows lifecycle, depreciation and custody.", "افتح أصلًا: تعرض لوحة ملفه الشامل دورة حياته وإهلاكه وعهدته."], { kind: "list", doctype: "Asset", filters: (c) => [co(c), NOT_CANCELLED] }),
    act("ACT-AST-REGISTER-02", ["Review capitalization source", "مراجعة مصدر الرسملة"], ["Asset capitalizations with the stock, asset and service rows they consume.", "مستندات رسملة الأصول مع أسطر المخزون والأصول والخدمات المستهلكة."], { kind: "list", doctype: "Asset Capitalization", filters: (c) => [co(c), NOT_CANCELLED] }),
    act("ACT-AST-REGISTER-03", ["Open original invoice", "فتح الفاتورة الأصلية"], ["Submitted supplier invoices; an asset's purchase invoice is linked on the asset.", "فواتير الموردين المعتمدة؛ فاتورة شراء الأصل مرتبطة في الأصل."], { kind: "list", doctype: "Purchase Invoice", filters: (c) => [co(c), SUB] }),
    act("ACT-AST-REGISTER-04", ["Inspect depreciation", "فحص الإهلاك"], ["Depreciation Review lists schedule rows due, posted and pending.", "تعرض مراجعة الإهلاك صفوف الجداول المستحقة والمرحّلة والمعلقة."], { kind: "pro", to: "/pro/depreciation" }),
  ],
  "AST-CUSTODY": [
    act("ACT-AST-CUSTODY-01", ["Request a handover", "طلب تسليم"], ["Opens a new native Asset Movement (purpose Transfer or Issue).", "يفتح حركة أصل أصلية جديدة (الغرض نقل أو صرف)."], { kind: "native-new", doctype: "Asset Movement" }),
    act("ACT-AST-CUSTODY-02", ["Accept receipt", "تأكيد الاستلام"], POLICY_HOW("No acknowledgement step is approved for custody (FA6); receipt is recorded only by the submitted movement.", "لم تُعتمد خطوة تأكيد استلام للعهدة (FA6)؛ يُسجل الاستلام بالحركة المعتمدة فقط."), { kind: "policy" }),
    act("ACT-AST-CUSTODY-03", ["Review transfer", "مراجعة النقل"], ["Draft asset movements to check and submit.", "حركات أصول مسودة للمراجعة والاعتماد."], { kind: "list", doctype: "Asset Movement", filters: (c) => [co(c), DRAFT] }),
    act("ACT-AST-CUSTODY-04", ["Open original movement", "فتح الحركة الأصلية"], ["Submitted asset movements; each opens its native form.", "حركات الأصول المعتمدة؛ كل حركة تفتح نموذجها الأصلي."], { kind: "list", doctype: "Asset Movement", filters: (c) => [co(c), SUB] }),
  ],
  "AST-DEP": [
    act("ACT-AST-DEP-01", ["Preview due depreciation", "معاينة الإهلاك المستحق"], ["Depreciation Review lists due schedule rows before anything is booked.", "تعرض مراجعة الإهلاك صفوف الجداول المستحقة قبل أي ترحيل."], { kind: "pro", to: "/pro/depreciation" }),
    act("ACT-AST-DEP-02", ["Open native posting", "فتح الترحيل الأصلي"], ["Submitted depreciation journal entries; each opens its native form.", "قيود الإهلاك المعتمدة؛ كل قيد يفتح نموذجه الأصلي."], { kind: "list", doctype: "Journal Entry", filters: (c) => [co(c), SUB, ["voucher_type", "=", "Depreciation Entry"]] }),
    act("ACT-AST-DEP-03", ["Investigate GL bridge", "تحليل جسر الأستاذ العام"], ["No asset-to-general-ledger roll-forward exists in the source (FA5).", "لا يوجد كشف حركة يربط الأصول بالأستاذ العام في المصدر (FA5)."], { kind: "missing" }),
    act("ACT-AST-DEP-04", ["Export roll-forward", "تصدير كشف الحركة"], ["No asset roll-forward exists in the source (FA5).", "لا يوجد كشف حركة أصول في المصدر (FA5)."], { kind: "missing" }),
  ],
  "AST-SERVICE": [
    act("ACT-AST-SERVICE-01", ["Open maintenance", "فتح الصيانة"], ["Planned or overdue maintenance log tasks; each opens its native form.", "مهام سجل الصيانة المخططة أو المتأخرة؛ كل مهمة تفتح نموذجها الأصلي."], { kind: "list", doctype: "Asset Maintenance Log", filters: () => [["maintenance_status", "in", ["Planned", "Overdue"]]] }),
    act("ACT-AST-SERVICE-02", ["Compare repair decision", "مقارنة قرار الإصلاح"], POLICY_HOW("No repair-or-replace rule is approved (FA7, FA10).", "لم تُعتمد قاعدة الإصلاح أو الاستبدال (FA7، FA10)."), { kind: "policy" }),
    act("ACT-AST-SERVICE-03", ["Prepare disposal review", "تجهيز مراجعة الاستبعاد"], POLICY_HOW("No disposal review policy is approved.", "لم تُعتمد سياسة مراجعة الاستبعاد."), { kind: "policy" }),
    act("ACT-AST-SERVICE-04", ["Open native disposal", "فتح الاستبعاد الأصلي"], ["Sell or Scrap Asset reviews the native disposal of one asset before anything is posted.", "تراجع شاشة بيع أو تخريد أصل الاستبعاد الأصلي لأصل واحد قبل أي ترحيل."], { kind: "pro", to: "/pro/asset-disposal" }),
  ],
};
const ACTION_IMPL: Record<Run11Action["kind"], Impl> = { "native-new": "NATIVE_AVAILABLE", list: "NATIVE_AVAILABLE", tool: "NATIVE_AVAILABLE", pro: "PRESERVE_EXISTING", report: "NATIVE_AVAILABLE", tab: "PRESERVE_EXISTING", server: "BACKEND_SOURCE_ONLY", policy: "OWNER_POLICY_REQUIRED", missing: "INTEGRATION_MISSING" };

/* ------------------------------------------------------------------ documents (derived from the sheet) ------------------------------------------------------------------ */
/** Child tables named by the sheet live inside their parent document (rows of its native form and Document 360). */
export const CHILD_PARENT: Record<string, string> = { "Sales Invoice Item": "Sales Invoice", "Purchase Order Item": "Purchase Order", "Stock Entry Detail": "Stock Entry", "Item Reorder": "Item" };
/** Sheet objects that are not a DocType of this source, with the screen that serves the process instead. */
export const NOT_A_DOCTYPE: Record<string, { to: string; note: Bi }> = {
  "Asset Disposal": { to: "/pro/asset-disposal", note: ["DIGIT has no Asset Disposal DocType; disposal is the Sell or Scrap action on the asset, reviewed on Sell or Scrap Asset.", "لا يوجد نوع مستند «استبعاد أصل» في النظام؛ الاستبعاد هو إجراء البيع أو التخريد على الأصل، ويُراجع في شاشة بيع أو تخريد أصل."] },
};
function docPlacement(id: string, ws: string, target: string): Pick<Placement, "impl" | "binds" | "note"> {
  const own = new Set(SPECS[ws]?.docs.map((d) => d.doctype) ?? []);
  const where = (dt: string) => (own.has(dt) ? `doc:${dt}` : `hub:${dt}`);
  const nd = NOT_A_DOCTYPE[target];
  if (nd) return { impl: "PARTIAL", binds: [`pro:${nd.to}`], note: nd.note };
  const parent = CHILD_PARENT[target];
  if (parent) return { impl: "NATIVE_AVAILABLE", binds: [where(parent)], note: [`Rows of the ${parent} document (child table); they open inside each ${parent}.`, `صفوف داخل مستند ${parent} (جدول فرعي)؛ تُفتح داخل كل مستند.`] };
  return own.has(target) ? { impl: "PRESERVE_EXISTING", binds: [where(target)] } : { impl: "NATIVE_AVAILABLE", binds: [where(target)] };
}

/* ------------------------------------------------------------------ assembled placements ------------------------------------------------------------------ */
const TAB: Record<PlacementType, Run11Tab> = { KPI: "overview", CHART: "overview", QUEUE: "documents", DOCUMENT: "documents", ACTION: "documents", REPORT: "reports" };
const actionOf = new Map(Object.values(ROLLOUT_ACTIONS).flat().map((a) => [a.id, a]));

export const ROLLOUT_PLACEMENTS: Placement[] = ALL.filter((r) => !SLICE_WS.has(r[2])).map(([id, type, ws, label, target]): Placement => {
  const base = { id, type, ws, tab: TAB[type] };
  if (type === "DOCUMENT") return { ...base, label: [target || label, target || label], ...docPlacement(id, ws, target) };
  if (type === "REPORT") return { ...base, label: [target, target], impl: "NATIVE_AVAILABLE", binds: [`report:${target}`] };
  if (type === "ACTION") {
    const a = actionOf.get(id);
    if (!a) throw new Error(`run11Rollout: no action mapped for ${id}`);
    return { ...base, label: a.label, impl: ACTION_IMPL[a.kind], binds: [`action:${id}`], ...(a.kind === "policy" || a.kind === "missing" ? { note: a.how } : {}), ...(a.server ? { server: a.server } : {}) };
  }
  const e = ENTRIES[id];
  if (!e) throw new Error(`run11Rollout: no crosswalk entry for ${id}`);
  const [ar, impl, binds = [], note, server] = e;
  return { ...base, label: [label, ar], impl, binds, ...(note ? { note } : {}), ...(server ? { server } : {}) };
});
