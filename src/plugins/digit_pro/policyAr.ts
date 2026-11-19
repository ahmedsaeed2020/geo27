/** Messages + Arabic of the DIGIT Pro policy defaults (policyDefaults.ts); dependency-free so the manifest translations import no engine. */
export const MSG = {
  discount: "Discount approval required: discounted lines can be submitted only by a Sales Manager.",
  held: "Payment blocked: a referenced purchase invoice is on hold until its release date.",
  match: "Payment blocked: a referenced purchase invoice does not match its order and receipt. Only an Accounts Manager can pay it.",
  purchase: "Purchase approval required: no category policy is set for this request, so only a Purchase Manager can submit it.",
} as const;

export const POLICY_AR: Record<string, string> = {
  // PU3-b award per line (QuoteCompare)
  "Award": "الترسية", "Create purchase orders for the awarded lines": "إنشاء أوامر شراء للبنود المرساة", "lines": "بنود", "line": "بند",
  "One draft purchase order per winning supplier; approve and submit it as usual.": "أمر شراء مسودة لكل مورد فائز؛ اعتمده كالمعتاد.",
  "Purchase orders created as drafts": "أُنشئت أوامر الشراء كمسودات", "Supplier Quotation / Purchase Order definitions are not loaded": "تعريفات عرض سعر المورد / أمر الشراء غير محمّلة",
  // SL9-b pick → pack → ship strip (FlowQueues labels)
  "No submitted orders waiting for delivery yet": "لا توجد أوامر بيع معتمدة بانتظار التسليم بعد", "No pick lists yet": "لا توجد قوائم تجهيز بعد",
  "No draft delivery notes to pack yet": "لا توجد أذون تسليم مسودة للتغليف بعد", "No packing slips yet": "لا توجد قسائم تغليف بعد", "No delivery trips on the road": "لا توجد رحلات توصيل في الطريق",
  "Nothing at this step right now": "لا شيء في هذه الخطوة الآن", "Create Sales Order": "إنشاء أمر بيع", "Create Delivery Trip": "إنشاء رحلة توصيل",
  "Pick → pack → ship": "التجهيز ← التغليف ← الشحن", "Orders to pick": "طلبات للتجهيز", "Create Pick List": "إنشاء قائمة تجهيز",
  "Pick lists to deliver": "قوائم تجهيز للتسليم", "Draft deliveries to pack": "أذون تسليم مسودة للتغليف", "Create Packing Slip": "إنشاء قسيمة تغليف",
  "Packing slips": "قسائم التغليف", "Submit the Delivery Note": "اعتماد إذن التسليم", "Delivery trips on the road": "رحلات توصيل في الطريق", "Complete the trip": "إكمال الرحلة",
  [MSG.discount]: "يتطلب الخصم موافقة: لا يعتمد البنود المخصومة إلا مدير المبيعات.",
  [MSG.held]: "الدفع موقوف: إحدى فواتير الشراء المرجعية معلّقة حتى تاريخ الإفراج.",
  [MSG.match]: "الدفع موقوف: فاتورة شراء مرجعية لا تطابق أمر الشراء والاستلام. يدفعها مدير الحسابات فقط.",
  [MSG.purchase]: "يتطلب الشراء موافقة: لا توجد سياسة فئات لهذا الطلب، لذا لا يعتمده إلا مدير المشتريات.",
  "Invoice put on hold": "عُلّقت الفاتورة", "Invoice released": "أُفرج عن الفاتورة", "Release date updated": "حُدّث تاريخ الإفراج",
  "Reason For Putting On Hold": "سبب التعليق", "Release Date (YYYY-MM-DD, leave empty to hold until released)": "تاريخ الإفراج (YYYY-MM-DD، اتركه فارغًا للتعليق حتى الإفراج)",
  "Release Date (YYYY-MM-DD)": "تاريخ الإفراج (YYYY-MM-DD)", "Release date must be in the future": "يجب أن يكون تاريخ الإفراج في المستقبل",
  "Reason For Putting On Hold is mandatory": "سبب التعليق إلزامي", "Purchase Invoice is already on hold": "فاتورة الشراء معلّقة بالفعل",
  "Purchase Invoice is not on hold": "فاتورة الشراء غير معلّقة", "Purchase Invoice must be submitted": "يجب اعتماد فاتورة الشراء أولًا",
  "Purchase Invoice has no outstanding amount": "لا يوجد مبلغ مستحق على فاتورة الشراء", "Release Date must be a date (YYYY-MM-DD)": "يجب أن يكون تاريخ الإفراج تاريخًا (YYYY-MM-DD)",
  "Journal Entry must be submitted": "يجب اعتماد قيد اليومية أولًا", "This Journal Entry is already a reversal": "قيد اليومية هذا قيد عكسي بالفعل",
  "Reverse Journal Entry": "عكس قيد اليومية", "Block Invoice": "تعليق الفاتورة", "Unblock Invoice": "الإفراج عن الفاتورة", "Change Release Date": "تغيير تاريخ الإفراج", "Hold Invoice": "تعليق الفاتورة",
};
