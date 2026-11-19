/**
 * DIGIT shared Core fix hints (Part B: D6-b). Validation messages come from the ported controllers (posting.ts, selling.ts,
 * stock.ts, budget.ts, serialBatch.ts …) and the Core controls in English, word for word like the source. This module only
 * adds a bilingual "how to fix" line next to a known message — it never changes, hides or replaces the message itself, so the
 * rule that refused the action stays visible. Unknown messages get no hint.
 */
export type Bi = [string, string];
type Rule = [RegExp, (m: RegExpMatchArray) => Bi];

const RULES: Rule[] = [
  [/Value missing for: (.+)/, (m) => [`Fill in "${m[1]}" and save again.`, `املأ الحقل «${m[1]}» ثم احفظ مجددًا.`]],
  [/No permission to (\w+) (.+)/, (m) => [`Your role may not ${m[1]} ${m[2]}. Ask an administrator for the role, or ask a colleague who has it.`, `دورك لا يسمح بهذا الإجراء على ${m[2]}. اطلب الدور من مدير النظام أو اطلب من زميل يملكه.`]],
  [/Quantity for Item (.+) cannot be zero/, (m) => [`Enter a quantity for ${m[1]} or remove the row.`, `أدخل كمية للصنف ${m[1]} أو احذف السطر.`]],
  [/Total Debit must be equal to Total Credit\. The difference is (.+)/, (m) => [`Add or correct a line so debit and credit balance (difference ${m[1]}).`, `أضف سطرًا أو صحّح المبالغ حتى يتساوى المدين والدائن (الفرق ${m[1]}).`]],
  [/closed Accounting Period (.+)/, (m) => [`Change the posting date to an open period, or ask an accounts manager to reopen ${m[1]}.`, `غيّر تاريخ الترحيل إلى فترة مفتوحة أو اطلب من مدير الحسابات إعادة فتح ${m[1]}.`]],
  [/not authorized to add or update entries before (.+)/, (m) => [`Accounts are frozen until ${m[1]}: use a later posting date or ask an accounts manager.`, `الحسابات مجمّدة حتى ${m[1]}: استخدم تاريخ ترحيل لاحقًا أو راجع مدير الحسابات.`]],
  [/Validity period of this quotation (.+) has ended/, (m) => [`Extend "Valid Till" on ${m[1]} or make a new quotation.`, `مدّد تاريخ «صالح حتى» في ${m[1]} أو أنشئ عرض سعر جديدًا.`]],
  [/Credit limit has been crossed for customer (.+?) \(/, (m) => [`Collect payment from ${m[1]}, raise the credit limit on the customer, or ask a credit controller to approve.`, `حصّل دفعة من ${m[1]} أو ارفع حد الائتمان في بطاقة العميل أو اطلب اعتماد مسؤول الائتمان.`]],
  [/over limit by (.+) for item (.+?)\./, (m) => [`Reduce the quantity or amount of ${m[2]}, or raise the over-billing / over-delivery allowance in settings.`, `خفّض كمية أو مبلغ ${m[2]} أو ارفع نسبة التجاوز المسموح بها في الإعدادات.`]],
  [/Budget for Account (.+?) against .+ will exceed by (.+)/, (m) => [`Reduce the amount on ${m[1]}, move it to another cost centre, or ask for a budget revision (over by ${m[2]}).`, `خفّض المبلغ على ${m[1]} أو انقله لمركز تكلفة آخر أو اطلب تعديل الموازنة (التجاوز ${m[2]}).`]],
  [/units of Item (.+?) needed in Warehouse (.+?) on (.+?) to complete/, (m) => [`Receive or transfer ${m[1]} into ${m[2]} before ${m[3]}, change the warehouse, or reduce the quantity.`, `استلم أو حوّل ${m[1]} إلى ${m[2]} قبل ${m[3]} أو غيّر المستودع أو خفّض الكمية.`]],
  [/The batch (.+?) has only (.+?) qty in warehouse (.+?)\./, (m) => [`Pick another batch or split the row: ${m[1]} has ${m[2]} in ${m[3]}.`, `اختر دفعة أخرى أو قسّم السطر: الدفعة ${m[1]} فيها ${m[2]} في ${m[3]}.`]],
  [/Batch No is mandatory for Item (.+)/, (m) => [`Choose the batch of ${m[1]} on the row.`, `اختر رقم الدفعة للصنف ${m[1]} في السطر.`]],
  [/Serial No is mandatory for Item (.+)|Serial Numbers required for Item (.+?)\./, (m) => [`Enter the serial numbers of ${m[1] ?? m[2]}, one per unit.`, `أدخل الأرقام التسلسلية للصنف ${m[1] ?? m[2]} رقمًا لكل وحدة.`]],
  [/Batch (.+?) of Item .+ has expired/, (m) => [`Batch ${m[1]} has expired: choose a valid batch.`, `انتهت صلاحية الدفعة ${m[1]}: اختر دفعة صالحة.`]],
  [/Source warehouse is mandatory for item (.+)/, (m) => [`Set the source warehouse on the row of ${m[1]}.`, `حدد مستودع المصدر في سطر ${m[1]}.`]],
  [/Target warehouse is mandatory for item (.+)/, (m) => [`Set the target warehouse on the row of ${m[1]}.`, `حدد المستودع المستهدف في سطر ${m[1]}.`]],
  [/Source and target warehouse cannot be same/, () => ["Choose a different target warehouse.", "اختر مستودعًا مستهدفًا مختلفًا."]],
  [/Rejected Warehouse is mandatory for the rejected Item (.+)/, (m) => [`Set a rejected (quarantine) warehouse on the row of ${m[1]}.`, `حدد مستودع المرفوضات (الحجر) في سطر ${m[1]}.`]],
  [/Cannot return more than (.+?) for Item (.+)/, (m) => [`Lower the returned quantity of ${m[2]} to at most ${m[1]}.`, `خفّض الكمية المرتجعة من ${m[2]} إلى ${m[1]} كحد أقصى.`]],
  [/Allocated Amount cannot be greater than outstanding amount/, () => ["Lower the allocated amount to the invoice's outstanding amount.", "خفّض المبلغ المخصص إلى المبلغ المستحق في الفاتورة."]],
  [/Supplier Invoice No exists in Purchase Invoice (.+)/, (m) => [`This supplier invoice is already recorded in ${m[1]}: open it instead of entering it again.`, `فاتورة المورد مسجلة بالفعل في ${m[1]}: افتحها بدل إدخالها مرة أخرى.`]],
  [/Supplier (.+?) is blocked/, (m) => [`Release the hold on ${m[1]} in the supplier record, or use another supplier.`, `ارفع الإيقاف عن ${m[1]} في بطاقة المورد أو استخدم موردًا آخر.`]],
  [/(Purchase Order|Purchase Receipt) Required for item (.+)/, (m) => [`Create this from the ${m[1]} of ${m[2]} (Get Items From), or change the buying settings.`, `أنشئ المستند من ${m[1] === "Purchase Order" ? "أمر الشراء" : "إيصال الاستلام"} للصنف ${m[2]} (جلب الأصناف من) أو غيّر إعدادات الشراء.`]],
  [/Cannot delete or cancel because (.+?) is linked with (.+)/, (m) => [`Cancel ${m[2]} first, then cancel ${m[1]}.`, `ألغِ ${m[2]} أولًا ثم ألغِ ${m[1]}.`]],
  [/a later Period Closing Voucher (.+) exists/, (m) => [`Cancel the later closing voucher ${m[1]} first.`, `ألغِ قيد الإقفال اللاحق ${m[1]} أولًا.`]],
  [/Closing Account (.+) must be of type Liability \/ Equity/, () => ["Choose a retained-earnings (equity) or liability account as the closing account.", "اختر حساب أرباح مبقاة (حقوق ملكية) أو حساب التزام كحساب إقفال."]],
  [/Offsetting Account is mandatory for Accounting Dimension (.+)/, (m) => [`Set the offsetting account for dimension ${m[1]} in Accounting Dimension.`, `حدد الحساب المقابل للبعد ${m[1]} في إعداد الأبعاد المحاسبية.`]],
  [/must approve it before it is submitted/, () => ["Save the draft and ask the reviewer named in the company control policy to approve it (Review before posting).", "احفظ المسودة واطلب من المراجع المحدد في سياسة الرقابة اعتمادها (المراجعة قبل الترحيل)."]],
  [/approved custody request is required/, () => ["Request custody for the employee on Asset controls → Custody; it moves once someone other than you approves it.", "اطلب العهدة للموظف من ضوابط الأصول ← العهدة؛ وينتقل الأصل بعد اعتماد شخص غيرك."]],
  [/above the contract price (.+?) of Blanket Order (.+)/, (m) => [`Use the contract rate ${m[1]} from ${m[2]}, or ask purchasing to revise the contract.`, `استخدم سعر العقد ${m[1]} من ${m[2]} أو اطلب من المشتريات تعديل العقد.`]],
  [/above the contract price (.+)/, (m) => [`Use the contract rate ${m[1]}, or ask purchasing to revise the contract.`, `استخدم سعر العقد ${m[1]} أو اطلب من المشتريات تعديل العقد.`]],
  [/Purchase Orders are not allowed for (.+?) due to a scorecard standing/, (m) => [`${m[1]} is blocked by its supplier scorecard: choose another supplier or ask purchasing to review the scorecard.`, `${m[1]} موقوف بسبب تقييم المورد: اختر موردًا آخر أو اطلب مراجعة التقييم.`]],
  [/is on hold|held by the three-way match|open dispute/, () => ["Resolve the hold first: release the customer/supplier hold or settle the invoice dispute / match difference.", "عالج الإيقاف أولًا: ارفع إيقاف العميل/المورد أو سوِّ نزاع الفاتورة أو فرق المطابقة."]],
  [/recoverable amount .+ is not below the book value/, () => ["No impairment is needed: the asset is worth at least its book value.", "لا حاجة لانخفاض القيمة: قيمة الأصل لا تقل عن قيمته الدفترية."]],
  [/already been booked/, () => ["Only open rows can change shift; leave the booked rows as they are.", "تتغير وردية الصفوف المفتوحة فقط؛ اترك الصفوف المرحّلة كما هي."]],
  [/Shift with shift factor (.+) needed/, (m) => [`Add an Asset Shift Factor of ${m[1]}, or choose shifts that keep the asset's life.`, `أضف معامل وردية ${m[1]} أو اختر ورديات تحافظ على عمر الأصل.`]],
  [/Please set the Capital Work in Progress account/, () => ["Set the work-in-progress account on the asset category (Accounts table) or on the company.", "حدد حساب الأعمال تحت التنفيذ في جدول حسابات فئة الأصل أو في الشركة."]],
  [/already exists|Duplicate name/, () => ["Use another name or open the existing record.", "استخدم اسمًا آخر أو افتح السجل الموجود."]],
  [/requires the DIGIT server/, () => ["This step runs on the DIGIT server; the preview shows the document and its effect but cannot complete this step.", "هذه الخطوة تعمل على خادم ديجيت؛ تعرض المعاينة المستند وأثره لكنها لا تكمل هذه الخطوة."]],
];

/** Bilingual "how to fix" line for a validation message, or null when the message is not a known one. */
export function fixHint(message: string): Bi | null {
  for (const [re, f] of RULES) { const m = message.match(re); if (m) return f(m); }
  return null;
}
/** Number of known message families (for coverage reporting). */
export const FIX_HINT_RULES = RULES.length;
