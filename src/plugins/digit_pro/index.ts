/**
 * digit_pro — DIGIT Pro foundation. Registration + navigation only: no own DocTypes, fields, stores or fixtures.
 * Every shortcut opens the native Core list/form (/app/erpnext/<slug>), so identity, data and behaviour stay canonical.
 */
import type { PluginManifest } from "../types";
import { NAV_AR } from "./nav";
import { OPS_AR } from "./opsAr";
import { POLICY_AR } from "./policyAr";
import "./commandSearch"; // M-05: registers the Pro awesomebar provider (active only inside DIGIT Pro)

const NAV: [string, string[]][] = [
  ["Accounting", ["Journal Entry", "Payment Entry", "Account"]], ["Selling", ["Customer", "Quotation", "Sales Order", "Sales Invoice"]],
  ["Purchasing", ["Supplier", "Purchase Order", "Purchase Invoice"]], ["Inventory", ["Item", "Warehouse", "Stock Entry"]],
  ["Assets", ["Asset", "Asset Category", "Asset Movement"]],
];
/** Journal Entry is the first premium (DIGIT Pro-enhanced) native screen. */
export const DIGIT_PRO_PREMIUM = ["Journal Entry", "Payment Entry"];
const sc = (link_to: string) => ({ label: link_to, type: "DocType" as const, link_to });

export const digitPro: PluginManifest = {
  name: "digit_pro", title: "DIGIT Pro", title_ar: "ديجيت برو", version: "0.2.0",
  publisher: "Digit", email: "dev@example.com", license: "MIT",
  description: "DIGIT Pro: enhanced experience on native Core screens.", description_ar: "ديجيت برو: تجربة محسّنة فوق شاشات النواة الأصلية.",
  host_app: "erpnext", module: "DIGIT Pro", required_apps: ["frappe", "erpnext"],
  workspaces: [{ name: "DIGIT Pro", label: "DIGIT Pro", module: "DIGIT Pro", number_cards: [], charts: [],
    shortcuts: [sc("Journal Entry"), sc("Customer"), sc("Sales Invoice"), sc("Purchase Invoice"), sc("Item"), sc("Asset")],
    // Same department IA as the Frappe export workspace: categories link only to existing native DocTypes.
    links: NAV.flatMap(([cat, items]) => [{ label: cat, type: "Card Break" as const }, ...items.map((d) => ({ label: d, type: "Link" as const, link_type: "DocType", link_to: d }))]) }],
  translations: { ...NAV_AR, ...OPS_AR, ...POLICY_AR, "DIGIT Pro": "ديجيت برو", "Standard Desk": "المكتب القياسي", "Premium enhancement": "تحسين متميز", "Native DIGIT screens": "شاشات DIGIT الأصلية",
    // SC-P-02..08 purchasing flow / SC-S-03 quotation guidance
    "No source Sales Order on this document.": "لا يوجد أمر بيع مصدر لهذا المستند.", "Delivered qty": "الكمية المسلّمة", "Pending delivery": "بانتظار التسليم", "Invoice status": "حالة الفاتورة", "Grand total": "الإجمالي الكلي", "Due date": "تاريخ الاستحقاق", "days overdue": "يوم تأخير", "Returns": "المرتجعات", "Open in Receivables": "فتح في الذمم المدينة", "Open in Payables": "فتح في الذمم الدائنة", "Overdue": "متأخر", "Unpaid": "غير مدفوع", "Order progress": "تقدم الطلب", "Receipt progress": "تقدم الاستلام", "Cancelled — kept for audit": "ملغى — محفوظ للتدقيق", "Return against": "مرتجع مقابل", "Quantity position": "موقف الكميات", "Read-only comparison of submitted documents — native validation decides what can be posted.": "مقارنة للعرض فقط من المستندات المرحّلة — التحقق الأصلي هو ما يحدد ما يمكن ترحيله.", "No source Purchase Order on this document.": "لا يوجد أمر شراء مصدر لهذا المستند.", "Unit differs from the order for:": "وحدة القياس تختلف عن الأمر في:", "Ordered": "المطلوب", "Received qty": "الكمية المستلمة", "Returned qty": "الكمية المرتجعة", "Billed qty": "الكمية المفوترة", "Pending receipt": "بانتظار الاستلام", "Pending billing": "بانتظار الفوترة", "UOM": "وحدة القياس", "Supplier 360": "ملف المورد الشامل", "Receipts to bill": "إيصالات بانتظار الفوترة", "Payments made": "المدفوعات المنفذة", "Payment entries": "سندات الدفع", "Debit notes": "الإشعارات المدينة", "Purchase Invoices": "فواتير المشتريات", "Completed": "مكتمل", "Supplier quotation comparison": "مقارنة عروض أسعار الموردين", "Values as quoted; choosing a supplier stays your decision.": "القيم كما وردت في العروض؛ اختيار المورد يبقى قرارك.", "No supplier quotations received yet.": "لم تصل عروض أسعار من الموردين بعد.", "Qty": "الكمية", "Rate": "السعر", "Expected Delivery Date": "تاريخ التسليم المتوقع", "Taxes and Charges": "الضرائب والرسوم", "Quotation guidance": "إرشادات عرض السعر", "Ready to submit": "جاهز للترحيل", "Needs attention": "يحتاج إلى مراجعة", "Customer selected": "تم اختيار العميل", "Every row has an item": "كل سطر يحتوي على صنف", "Quantities above zero": "الكميات أكبر من صفر", "Rates set": "الأسعار محددة", "Units of measure set": "وحدات القياس محددة", "Valid till is not past": "تاريخ الصلاحية لم ينتهِ", "Add items in the Items table below; price list rate, UOM conversion and taxes are applied by the native form. Convert with Create → Sales Order after submit.": "أضف الأصناف في جدول الأصناف أدناه؛ يطبّق النموذج الأصلي سعر قائمة الأسعار وتحويل الوحدات والضرائب. حوّله عبر إنشاء ← أمر بيع بعد الترحيل.", "Credit Limit": "حد الائتمان", "Return": "مرتجع", "Item": "الصنف",
    // SC-S-02 Customer 360 / SC-S-04 document flow
    "Document flow": "تسلسل المستندات", "Next step": "الخطوة التالية", "(Create menu)": "(قائمة إنشاء)", "Customer 360": "ملف العميل 360", "Open Customer 360": "فتح ملف العميل 360",
    "Unpaid invoices": "فواتير غير مدفوعة", "Open orders": "أوامر مفتوحة",
    // SC-A-01 Assets Overview
    "Asset register value, depreciation due and draft assets — from native Core asset records.": "قيمة سجل الأصول والإهلاك المستحق والأصول المسودة — من سجلات الأصول الأصلية في النواة.",
    "Assets workspace": "مساحة عمل الأصول", "Assets in register": "الأصول في السجل", "Purchase cost": "تكلفة الشراء", "Book value": "القيمة الدفترية",
    "Depreciation due in 30 days": "الإهلاك المستحق خلال 30 يوماً", "Book value by category": "القيمة الدفترية حسب الفئة", "Accumulated depreciation": "الإهلاك المتراكم",
    // SC-I-01 Inventory Overview
    "Stock value by warehouse and item, shortages, reorder levels and draft stock entries — from native Core stock records.": "قيمة المخزون حسب المستودع والصنف والنواقص ومستويات إعادة الطلب وقيود المخزون المسودة — من سجلات المخزون الأصلية في النواة.",
    "Inventory workspace": "مساحة عمل المخزون", "Warehouses with stock": "مستودعات بها مخزون", "Short items": "أصناف ناقصة", "Reserved above stock": "محجوز يتجاوز المخزون",
    "Stock value by warehouse": "قيمة المخزون حسب المستودع", "Recent stock movements": "حركات المخزون الأخيرة",
    "Items with stock": "أصناف بها مخزون", "Items below reorder level": "أصناف تحت مستوى إعادة الطلب",
    "Stock balance by item": "رصيد المخزون حسب الصنف",
    "Items ranked by stock value; totals per item across warehouses from Bin records.": "أصناف مرتبة حسب قيمة المخزون؛ الإجماليات لكل صنف عبر المستودعات من سجلات الأرصدة الأصلية.",
    "From native Item Reorder rows compared with Bin quantities. Raising the material request is done on the original Item.": "من صفوف إعادة الطلب الأصلية على الصنف مقارنةً بكميات الأرصدة. إنشاء طلب المواد يتم من الصنف الأصلي.",
    "Batches and serial numbers": "الدفعات والأرقام التسلسلية", "Batches": "الدفعات", "Expiring within 30 days": "تنتهي خلال 30 يوماً", "Next expiry": "أقرب تاريخ انتهاء",
    "Batches and Serial No records for items held in this company's warehouses.": "سجلات الدفعات والأرقام التسلسلية للأصناف المخزنة في مستودعات هذه الشركة.",
    // SC-P-01 Purchasing Overview
    "Purchasing Overview": "نظرة عامة على المشتريات", "Requests, orders to receive or bill and supplier payables — from native Core buying records.": "الطلبات والأوامر بانتظار الاستلام أو الفوترة ومستحقات الموردين — من سجلات المشتريات الأصلية في النواة.",
    "To Receive": "للاستلام", "Pending Requests": "طلبات معلقة", "Payable": "مستحق الدفع", "Purchase Orders by status": "أوامر الشراء حسب الحالة",
    "Top suppliers by payable": "أعلى الموردين استحقاقاً", "Pending material requests": "طلبات المواد المعلقة", "Purchasing workspace": "مساحة عمل المشتريات",
    // SC-S-01 Selling Overview
    "Pipeline, open quotations and collections — from native Core selling records.": "خط المبيعات وعروض الأسعار المفتوحة والتحصيلات — من سجلات المبيعات الأصلية في النواة.",
    "To Deliver": "للتسليم", "To Bill": "للفوترة", "Open Quotations": "عروض أسعار مفتوحة", "expiring in 7 days": "تنتهي خلال 7 أيام",
    "overdue ·": "متأخرة ·", "Sales Orders by status": "أوامر البيع حسب الحالة",
    "Top customers by outstanding": "أعلى العملاء استحقاقاً", "Quotations expiring soon": "عروض أسعار تنتهي قريباً",
    "Recent orders and invoices": "أحدث الأوامر والفواتير", "Order": "أمر", "Invoice": "فاتورة", "Selling workspace": "مساحة عمل المبيعات",
    "orders": "أوامر",
    // SC-F-04 Journal Entry panel
    "Journal Entry summary": "ملخص القيد اليومي", "Balanced": "متوازن", "Not balanced": "غير متوازن", "Rows": "الصفوف", "Difference": "الفرق",
    "Total Debit": "إجمالي المدين", "Total Credit": "إجمالي الدائن", "Entry Type": "نوع القيد", "Not Saved": "غير محفوظ", "Reference": "المرجع",
    "Account is required": "الحساب مطلوب", "You cannot credit and debit same account at the same time": "لا يمكن جعل الحساب مدينًا ودائنًا في نفس الوقت",
    "Both Debit and Credit values cannot be zero": "لا يمكن أن تكون قيمتا المدين والدائن صفرًا", "Negative values are not allowed": "القيم السالبة غير مسموح بها",
    // Finance Batch 01 (SC-F-01/02/03)
    // Finance Batch 02 (SC-F-05 receivables/payables aging)
    "Receivables & Payables": "الذمم المدينة والدائنة", "Receivables": "الذمم المدينة", "Payables": "الذمم الدائنة",
    "Outstanding invoices by party and age — from Core invoices.": "الفواتير المستحقة حسب الطرف والعمر — من فواتير النواة.",
    "Not due": "غير مستحقة", "0–30 days": "0–30 يومًا", "31–60 days": "31–60 يومًا", "61–90 days": "61–90 يومًا", "Over 90 days": "أكثر من 90 يومًا",
    "Total outstanding": "إجمالي المستحق", "Invoices": "الفواتير", "Due Date": "تاريخ الاستحقاق", "Days overdue": "أيام التأخير", "Customer": "العميل", "Supplier": "المورد",
    "Record payment": "تسجيل دفعة", "Standard Accounts Receivable": "تقرير الذمم المدينة القياسي", "Standard Accounts Payable": "تقرير الذمم الدائنة القياسي", "Select a party": "اختر طرفًا",
    // Finance Batch 02 (SC-F-05 Payment Entry panel, SC-F-06/07 receivables/payables)
    "Accounts Receivable": "الذمم المدينة", "Accounts Payable": "الذمم الدائنة", "Payment Entry summary": "ملخص سند الدفع",
    "Customer invoices to collect, by age and due date — from Core invoices.": "فواتير العملاء المطلوب تحصيلها حسب العمر وتاريخ الاستحقاق — من فواتير النواة.",
    "Supplier invoices to pay, by age and due date — from Core invoices.": "فواتير الموردين المطلوب سدادها حسب العمر وتاريخ الاستحقاق — من فواتير النواة.",
    "Customer invoices to collect, by age": "فواتير العملاء المطلوب تحصيلها حسب العمر", "Supplier invoices to pay, by age": "فواتير الموردين المطلوب سدادها حسب العمر",
    "Overdue only": "المتأخرة فقط", "Draft payment exists": "يوجد سند دفع مسودة", "Allocated": "المخصص", "Outstanding": "المستحق", "Grand Total": "الإجمالي الكلي",
    "Outstanding invoices": "الفواتير المستحقة", "Same party, company and currency · submitted only": "نفس الطرف والشركة والعملة · المرحّلة فقط",
    "Add selected": "إضافة المحدد", "Add all": "إضافة الكل", "Read Only": "للقراءة فقط", "Row": "الصف",
    "Reference is required": "المرجع مطلوب", "Duplicate reference": "مرجع مكرر", "Reference type does not match the party type": "نوع المرجع لا يطابق نوع الطرف",
    "Reference document not found": "المستند المرجعي غير موجود", "Reference document is cancelled": "المستند المرجعي ملغى", "Reference document is not submitted": "المستند المرجعي غير مُرحّل",
    "Reference does not belong to this party": "المرجع لا يخص هذا الطرف", "Reference belongs to another company": "المرجع يخص شركة أخرى",
    "Allocated Amount cannot be greater than outstanding amount": "لا يمكن أن يتجاوز المبلغ المخصص المبلغ المستحق",
    // Navigation context
    "Back to": "رجوع إلى", "Financial Controls": "الضوابط المالية", "Compliance": "الامتثال", "Audit Trail": "سجل التدقيق", "ZATCA E-Invoicing": "الفوترة الإلكترونية (هيئة الزكاة)", "Zakat": "الزكاة", "Setup": "الإعداد",
    // P1 editable dashboards
    "Customize": "تخصيص", "Customize dashboard": "تخصيص لوحة المعلومات", "Your layout": "تخطيطك", "Team default": "التخطيط الافتراضي للفريق", "Standard layout": "التخطيط القياسي", "Unsaved changes": "تغييرات غير محفوظة", "Move up": "نقل لأعلى", "Move down": "نقل لأسفل", "Save my layout": "حفظ تخطيطي", "Publish as team default": "نشر كتخطيط افتراضي للفريق", "Reset my layout": "إعادة تعيين تخطيطي", "Done": "تم",
    // SC-F-14 Audit
    "Audit & Exceptions": "التدقيق والاستثناءات", "Exceptions and change history": "الاستثناءات وسجل التغييرات", "Exceptions found in posted and draft accounting records. Nothing is changed automatically — open each record to resolve it.": "استثناءات موجودة في السجلات المحاسبية المرحّلة والمسودات. لا يتم تغيير أي شيء تلقائياً — افتح كل سجل لمعالجته.", "Unbalanced journal entries": "قيود يومية غير متوازنة", "Drafts older than 7 days": "مسودات أقدم من 7 أيام", "Overdue invoices": "فواتير متأخرة", "Unallocated payments": "مدفوعات غير مخصصة", "Unreconciled bank lines": "حركات بنكية غير مسوّاة", "Cancelled documents": "مستندات ملغاة", "Some sources are not permitted for this user and were not checked:": "بعض المصادر غير مسموح بها لهذا المستخدم ولم يتم فحصها:", "Exceptions": "الاستثناءات", "Show all": "عرض الكل", "No exceptions found.": "لا توجد استثناءات.", "Severity": "الأهمية", "Check": "الفحص", "Document Type": "نوع المستند", "Document": "المستند", "High": "عالية", "Medium": "متوسطة", "Low": "منخفضة", "days": "يوم", "Debit and credit differ": "المدين والدائن غير متساويين", "Recent Changes": "أحدث التغييرات", "No recorded changes on accounting documents yet.": "لا توجد تغييرات مسجلة على المستندات المحاسبية بعد.", "Changed By": "تم التغيير بواسطة",
    // SC-F-13 VAT
    "VAT Reports": "تقارير ضريبة القيمة المضافة", "Posted output and input tax traced to native invoices and tax rows. This is not a VAT return filing.": "ضريبة المخرجات والمدخلات المرحّلة متتبَّعة إلى الفواتير وصفوف الضريبة الأصلية. هذا ليس تقديماً لإقرار ضريبي.", "Output and input tax by document": "ضريبة المخرجات والمدخلات حسب المستند", "Output Tax": "ضريبة المخرجات", "Input Tax": "ضريبة المدخلات", "Net Tax (Output − Input)": "صافي الضريبة (المخرجات − المدخلات)", "Tax Accounts": "حسابات الضريبة", "No posted tax in this period.": "لا توجد ضريبة مرحّلة في هذه الفترة.", "Entries": "القيود", "Source VAT reports": "تقارير الضريبة المصدرية", "Runs on DIGIT server": "يعمل على خادم DIGIT", "KSA VAT return filing and ZATCA e-invoicing are not available in this preview.": "تقديم إقرار ضريبة القيمة المضافة السعودي والفوترة الإلكترونية لهيئة الزكاة غير متاحين في هذه المعاينة.", "Tax setup": "إعداد الضريبة", "Tax by Document": "الضريبة حسب المستند", "Tax Amount": "مبلغ الضريبة", "VAT Audit Report": "تقرير تدقيق ضريبة القيمة المضافة", "UAE VAT 201": "ضريبة القيمة المضافة الإمارات 201",
    // SC-F-12 Financial Statements
    "Financial Statements": "القوائم المالية", "Core Profit and Loss, Balance Sheet and Cash Flow reports — same source, filters and totals.": "تقارير الأرباح والخسائر والميزانية العمومية والتدفقات النقدية الأساسية — نفس المصدر والمرشحات والإجماليات.", "P&L, Balance Sheet and Cash Flow": "الأرباح والخسائر والميزانية والتدفقات النقدية", "Periodicity": "الدورية", "Monthly": "شهري", "Quarterly": "ربع سنوي", "Half-Yearly": "نصف سنوي", "Yearly": "سنوي", "Profit and Loss Statement": "قائمة الأرباح والخسائر", "Cash Flow": "التدفقات النقدية", "Profit for the year": "ربح السنة", "Total Income This Year": "إجمالي الإيرادات هذا العام", "Total Expense This Year": "إجمالي المصروفات هذا العام", "Net Profit": "صافي الربح", "Total Asset": "إجمالي الأصول", "Total Liability": "إجمالي الخصوم", "Total Equity": "إجمالي حقوق الملكية", "Provisional Profit / Loss (Credit)": "الربح / الخسارة المؤقتة (دائن)", "Total (Credit)": "الإجمالي (دائن)", "Balance Sheet balances (Asset = Liability + Equity + Provisional P/L)": "الميزانية متوازنة (الأصول = الخصوم + حقوق الملكية + الربح/الخسارة المؤقتة)", "Net change in cash = movement on Cash/Bank accounts": "صافي التغير في النقد = حركة حسابات النقد/البنك", "Section": "القسم", "Cash Flow from Operations": "التدفق النقدي من العمليات", "Cash Flow from Investing": "التدفق النقدي من الاستثمار", "Cash Flow from Financing": "التدفق النقدي من التمويل", "Net Profit/Loss": "صافي الربح/الخسارة", "Net Change in Accounts Receivable": "صافي التغير في الذمم المدينة", "Net Change in Accounts Payable": "صافي التغير في الذمم الدائنة", "Net Change in Inventory": "صافي التغير في المخزون", "Net Change in Tax and other liabilities": "صافي التغير في الضرائب والخصوم الأخرى", "Net Change in Fixed Asset": "صافي التغير في الأصول الثابتة", "Net Change in Equity": "صافي التغير في حقوق الملكية", "Net Cash from Operations": "صافي النقد من العمليات", "Net Cash from Investing": "صافي النقد من الاستثمار", "Net Cash from Financing": "صافي النقد من التمويل", "Net Change in Cash": "صافي التغير في النقد",
    // SC-F-11 Trial Balance
    "Hierarchy, balance checks and ledger drill-down": "التسلسل الهرمي وفحوص التوازن والتعمق في دفتر الأستاذ", "Core Trial Balance report — same source, filters and totals, with readable hierarchy.": "تقرير ميزان المراجعة الأساسي — نفس المصدر والمرشحات والإجماليات بتسلسل هرمي واضح.", "Opening (Dr)": "افتتاحي (مدين)", "Opening (Cr)": "افتتاحي (دائن)", "Closing (Dr)": "ختامي (مدين)", "Closing (Cr)": "ختامي (دائن)", "Show zero values": "إظهار القيم الصفرية", "Period debit equals credit": "مدين الفترة يساوي دائنها", "Period debit does not equal credit": "مدين الفترة لا يساوي دائنها", "Closing balances agree": "الأرصدة الختامية متوازنة", "Closing balances do not agree": "الأرصدة الختامية غير متوازنة", "Export CSV": "تصدير CSV", "Toggle": "تبديل",
    // SC-F-10 Period Control
    "Period Control": "التحكم في الفترات", "Closing vs locking": "الإقفال مقابل القفل", "Closing a period and locking it for posting are separate controls in DIGIT.": "إقفال الفترة وقفلها أمام الترحيل ضابطان منفصلان في DIGIT.",
    "Last closed": "آخر إقفال", "Accounts Frozen Till Date": "الحسابات مجمدة حتى تاريخ", "Closing": "الإقفال", "Locking": "القفل", "New Period Closing Voucher": "سند إقفال فترة جديد", "New Accounting Period": "فترة محاسبية جديدة",
    "Moves profit and loss to the closing account. It does not lock posting.": "ينقل الأرباح والخسائر إلى حساب الإقفال. ولا يقفل الترحيل.", "Blocks submit and cancel of the listed documents in the period.": "يمنع ترحيل وإلغاء المستندات المدرجة خلال الفترة.",
    "No period closing vouchers yet.": "لا توجد سندات إقفال فترات بعد.", "No accounting periods defined.": "لا توجد فترات محاسبية معرّفة.", "Current": "الحالية", "No closed documents": "لا توجد مستندات مقفلة",
    // SC-F-09 Cost Center & Dimensions
    "Cost Center & Dimensions": "مراكز التكلفة والأبعاد", "Cost Centers": "مراكز التكلفة", "Hierarchy, ledger activity and dimensions": "الهيكل وحركة الأستاذ والأبعاد",
    "Native cost center hierarchy with posted ledger activity, and configured accounting dimensions.": "هيكل مراكز التكلفة الأصلي مع حركة الأستاذ المرحّلة والأبعاد المحاسبية المهيأة.",
    "Net": "الصافي", "Group": "مجموعة", "Ledger": "حساب فرعي", "Accounting Dimensions": "الأبعاد المحاسبية", "Cost Center Allocation": "توزيع مراكز التكلفة",
    "Budget Variance Report": "تقرير انحراف الميزانية", "Profitability Analysis": "تحليل الربحية", "Trial Balance": "ميزان المراجعة", "Balance Sheet": "الميزانية العمومية", "Profit and Loss": "الأرباح والخسائر",
    "No accounting dimensions configured. Cost Center and Project are always available.": "لا توجد أبعاد محاسبية مهيأة. مركز التكلفة والمشروع متاحان دائمًا.",
    // SC-F-08 Bank Reconciliation
    "Bank Reconciliation": "التسوية البنكية", "Match bank statement lines to posted payments — you confirm every match.": "طابق سطور كشف الحساب البنكي مع المدفوعات المرحّلة — أنت تؤكد كل مطابقة.",
    "Unreconciled": "غير مسوّاة", "Reconciled": "مسوّاة", "Unallocated amount": "المبلغ غير المخصص", "Description": "الوصف", "Deposit": "إيداع", "Withdrawal": "سحب",
    "Bank Reconciliation Tool": "أداة التسوية البنكية", "Matched vouchers": "السندات المطابقة", "Unreconcile Transaction": "إلغاء تسوية المعاملة", "Unreconcile Transaction?": "إلغاء تسوية المعاملة؟",
    "Bank Transaction unreconciled": "تم إلغاء تسوية المعاملة البنكية", "Candidate payments": "مدفوعات مرشحة", "Match": "مطابقة",
    "Same company and direction, posted, not yet cleared. Hints only — nothing is matched automatically.": "نفس الشركة والاتجاه، مرحّلة ولم تُسوَّ بعد. مؤشرات فقط — لا تتم أي مطابقة تلقائيًا.",
    "Amount matches": "المبلغ مطابق", "Partial amount": "مبلغ جزئي", "Reference matches": "المرجع مطابق", "Within 7 days": "خلال 7 أيام", "Match statement lines to payments": "مطابقة سطور الكشف مع المدفوعات",
    // Finance Batch 03 (SC-F-06 payments)
    "Payments": "المدفوعات", "Received and paid amounts with invoice allocation — from Core payment entries.": "المبالغ المقبوضة والمدفوعة مع تخصيصها على الفواتير — من سندات الدفع في النواة.",
    "Received": "المقبوض", "Paid": "المدفوع", "Unallocated": "غير مخصص", "Standard list": "القائمة القياسية", "Payment Entry": "سند الدفع", "Payment Type": "نوع الدفع",
    "Mode of Payment": "طريقة الدفع", "Receive": "قبض", "Pay": "دفع", "Internal Transfer": "تحويل داخلي", "Draft": "مسودة", "Submitted": "مُرحّل", "Cancelled": "ملغى",
    "Account Paid From": "الحساب المدفوع منه", "Account Paid To": "الحساب المدفوع إليه", "Allocated to": "مخصص إلى",
    "Group by Voucher": "تجميع حسب السند", "Group by Voucher (Consolidated)": "تجميع حسب السند (موحّد)", "Group by Account": "تجميع حسب الحساب", "Group by Party": "تجميع حسب الطرف",
    "Arrow keys move and expand · Enter opens the account": "مفاتيح الأسهم للتنقل والتوسيع · زر الإدخال يفتح الحساب",
    "Finance": "المالية", "Finance Control Center": "مركز التحكم المالي", "Chart of Accounts": "دليل الحسابات", "General Ledger": "دفتر الأستاذ العام",
    "Exceptions first, then routine work — all from Core records.": "الاستثناءات أولًا ثم الأعمال الروتينية — كلها من سجلات النواة.",
    "Search, expand and inspect the native account tree.": "ابحث في شجرة الحسابات الأصلية ووسّعها واستعرضها.",
    "Core General Ledger report — same source, filters and totals.": "تقرير دفتر الأستاذ العام في النواة — نفس المصدر والفلاتر والإجماليات.",
    "Work queue": "قائمة العمل", "Unbalanced draft journal entries": "قيود يومية مسودة غير متوازنة", "Overdue sales invoices": "فواتير مبيعات متأخرة",
    "Overdue purchase invoices": "فواتير مشتريات متأخرة", "Draft journal entries": "قيود يومية مسودة", "Draft payment entries": "سندات دفع مسودة",
    "My open finance tasks": "مهامي المالية المفتوحة", "Cash and bank balance": "رصيد النقد والبنوك", "Receivables outstanding": "الذمم المدينة المستحقة",
    "Payables outstanding": "الذمم الدائنة المستحقة", "Source": "المصدر", "Source unavailable": "المصدر غير متاح", "Nothing to show": "لا شيء لعرضه",
    "Not Permitted": "غير مسموح", "Details": "التفاصيل", "Open and edit": "فتح وتعديل", "Open": "فتح", "Related documents": "المستندات المرتبطة",
    "GL entries": "قيود الأستاذ", "Reports": "التقارير", "Role": "الدور", "Fiscal Year": "السنة المالية", "Currency": "العملة", "Company": "الشركة",
    "Account name or number": "اسم الحساب أو رقمه", "Show disabled": "إظهار المعطّل", "Expand all": "توسيع الكل", "Collapse all": "طي الكل",
    "Standard tree": "الشجرة القياسية", "Standard report": "التقرير القياسي", "Export": "تصدير", "Enabled": "مفعّل", "Disabled": "معطّل",
    "← Chart of Accounts": "→ دليل الحسابات", "← Journal Entry": "→ القيد اليومي", "← Finance Control Center": "→ مركز التحكم المالي",
    "DIGIT Pro is not enabled": "ديجيت برو غير مفعّل", "Loading…": "جارٍ التحميل…", "Balance": "الرصيد", "Against Account": "مقابل حساب",
    "Search": "بحث", "Root Type": "النوع الجذري", "Account": "الحساب", "Account Type": "نوع الحساب", "Status": "الحالة", "All": "الكل",
    "Party": "الطرف", "Voucher No": "رقم السند", "Voucher Type": "نوع السند", "Posting Date": "تاريخ الترحيل", "Cost Center": "مركز التكلفة",
    "Project": "المشروع", "Debit": "مدين", "Credit": "دائن", "From Date": "من تاريخ", "To Date": "إلى تاريخ", "Group by": "تجميع حسب",
    "Amount": "المبلغ", "Date": "التاريخ", "Is Group": "مجموعة", "Yes": "نعم", "No": "لا", "Parent Account": "الحساب الرئيسي",
    "Account Number": "رقم الحساب", "Account Name": "اسم الحساب", "Account Currency": "عملة الحساب",
    "Arrow keys move between rows · Enter on the last row adds a row": "مفاتيح الأسهم للتنقل بين الصفوف · مفتاح الإدخال في الصف الأخير يضيف صفًا" },
  experience: { home: "/pro/home", aliases: { "/report": "/pro/reports" } },
  // enabled once on a clean browser so the DIGIT Pro dock entry is visible; Apps & Plugins keeps the later choice
  default_enabled: true,
  theme: { className: "theme-digit-pro", logo: "/icons/digit_pro/digit-logo-horizontal.svg", logo_dark: "/icons/digit_pro/digit-logo-horizontal-dark.svg" },
};
