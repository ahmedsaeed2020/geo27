/**
 * RXP-01 report-view contracts: stable ids, permitted URL filter keys, column keys (locked = source identity/action)
 * and sortable fields for every DIGIT Pro register that supports Saved Views. Pure data — shared by the screens,
 * the Reports Center (view counts) and tests, so column/filter keys never drift from translated labels.
 */
import { SEGMENTS, SEGMENTS_AR } from "./aging";
import { apExceptionLabel, dueBandLabel } from "./apCalendar";
import type { ViewSpec } from "./savedViews";
import type { Bi } from "./command";
import { BUCKET_LABEL, REVIEW_LABEL, STATE_LABEL } from "./orderFulfilment";
import { BIN_LABEL, OUTCOME_LABEL } from "./quotationPipeline";
import { FLAG_LABEL } from "./salesReturns";
import { CUST_TAB_LABEL } from "./customerProfile";
import { OPS_AR } from "./opsAr";
import { translateTo } from "@/i18n";

const yes = (v: string, ar: boolean) => (v === "1" ? (ar ? "نعم" : "Yes") : v);
const segment = (v: string, ar: boolean) => (ar ? SEGMENTS_AR : SEGMENTS)[Number(v)] ?? v;

function agingSpec(side: "receivable" | "payable"): ViewSpec {
  const ar = side === "receivable";
  return {
    id: ar ? "pro.receivables" : "pro.payables", label: ar ? "Accounts Receivable" : "Accounts Payable", ar: ar ? "الذمم المدينة" : "الذمم الدائنة", route: ar ? "/pro/receivables" : "/pro/payables",
    filters: [
      { key: "company", label: "Company", ar: "الشركة", company: true },
      { key: "as_of", label: "As of", ar: "بتاريخ" },
      { key: "bucket", label: "Age bucket", ar: "فئة العمر", display: segment },
      { key: "party", label: ar ? "Customer" : "Supplier", ar: ar ? "العميل" : "المورد" },
      { key: "q", label: "Search", ar: "بحث", op: "like" },
      { key: "overdue", label: "Overdue only", ar: "المتأخرة فقط", display: yes },
      // RXP-02 AP calendar window and review exceptions (payables only)
      ...(ar ? [] : [{ key: "due_band", label: "Due window", ar: "نافذة الاستحقاق", display: dueBandLabel }, { key: "ex", label: "Exception", ar: "الاستثناء", display: apExceptionLabel }]),
    ],
    columns: [
      { key: "party", label: ar ? "Customer" : "Supplier", ar: ar ? "العميل" : "المورد" },
      { key: "invoice", label: "Invoice", ar: "الفاتورة", locked: true },
      { key: "posting_date", label: "Invoice date", ar: "تاريخ الفاتورة" },
      { key: "due_date", label: "Due date", ar: "تاريخ الاستحقاق" },
      { key: "days", label: "Days overdue", ar: "أيام التأخير", align: "end" },
      { key: "outstanding", label: "Outstanding", ar: "المبلغ المستحق", align: "end" },
      { key: "currency", label: "Currency", ar: "العملة" },
      { key: "bucket", label: "Age bucket", ar: "فئة العمر" },
      { key: "status", label: "Payment status", ar: "حالة السداد" },
      ...(ar ? [] : [{ key: "source", label: "Source PO / receipt", ar: "أمر الشراء / الاستلام المصدر" }]),
      { key: "action", label: "Next action", ar: "الإجراء التالي", locked: true },
    ],
    sorts: ["days", "outstanding", "due_date", "posting_date", "party", "invoice"],
    defaultSort: { field: "days", dir: "desc" },
  };
}
export const AR_SPEC = agingSpec("receivable");
export const AP_SPEC = agingSpec("payable");

export const SALES_SPEC: ViewSpec = {
  id: "pro.sales-analytics", label: "Sales Analytics", ar: "تحليل المبيعات", route: "/pro/sales-analytics",
  filters: [
    { key: "company", label: "Company", ar: "الشركة", company: true },
    { key: "doc", label: "Based On", ar: "بناءً على" },
    { key: "tree", label: "Dimension", ar: "البعد" },
    { key: "measure", label: "Measure", ar: "المقياس" },
    { key: "from_date", label: "From Date", ar: "من تاريخ", op: ">=" },
    { key: "to_date", label: "To Date", ar: "إلى تاريخ", op: "<=" },
    { key: "sel_key", label: "Selected group", ar: "المجموعة المحددة" },
    { key: "sel_month", label: "Selected month", ar: "الشهر المحدد" },
    { key: "sel_prev", label: "Previous period", ar: "الفترة السابقة", display: yes },
  ],
  columns: [
    { key: "dimension", label: "Dimension", ar: "البعد", locked: true },
    { key: "months", label: "Monthly columns", ar: "الأعمدة الشهرية", align: "end" },
    { key: "current", label: "Current", ar: "الحالية", align: "end" },
    { key: "previous", label: "Previous", ar: "السابقة", align: "end" },
    { key: "variance", label: "Variance", ar: "الانحراف", align: "end" },
    { key: "pct", label: "Variance %", ar: "نسبة الانحراف", align: "end" },
  ],
  sorts: ["current", "previous", "variance", "dimension"],
  defaultSort: { field: "current", dir: "desc" },
};

export const OPEN_PO_SPEC: ViewSpec = {
  id: "pro.open-purchase-orders", label: "Open Purchase Orders", ar: "أوامر الشراء المفتوحة", route: "/pro/open-purchase-orders",
  filters: [
    { key: "company", label: "Company", ar: "الشركة", company: true },
    { key: "supplier", label: "Supplier", ar: "المورد" },
    { key: "status", label: "Status", ar: "الحالة" },
    { key: "due", label: "Overdue only", ar: "المتأخرة فقط", display: (v, ar) => (v === "overdue" ? (ar ? "نعم" : "Yes") : v) },
    { key: "band", label: "Expected delivery", ar: "موعد التسليم المتوقع", display: (v, ar) => bandLabel(v, ar) },
    { key: "sched_from", label: "Expected from", ar: "التسليم المتوقع من", op: ">=" },
    { key: "sched_to", label: "Expected to", ar: "التسليم المتوقع إلى", op: "<=" },
    { key: "q", label: "Search", ar: "بحث", op: "like" },
  ],
  columns: [
    { key: "po", label: "Purchase Order", ar: "أمر الشراء", locked: true },
    { key: "supplier", label: "Supplier", ar: "المورد" },
    { key: "item", label: "Item", ar: "الصنف" },
    { key: "due", label: "Required By", ar: "مطلوب بتاريخ" },
    { key: "status", label: "Status", ar: "الحالة" },
    { key: "uom", label: "UOM", ar: "وحدة القياس" },
    { key: "currency", label: "Currency", ar: "العملة" },
    { key: "qty", label: "Ordered", ar: "المطلوب", align: "end" },
    { key: "received", label: "Received", ar: "المستلم", align: "end" },
    { key: "returned", label: "Returned", ar: "المرتجع", align: "end" },
    { key: "toReceive", label: "To Receive", ar: "متبقٍ للاستلام", align: "end" },
    { key: "amount", label: "Amount", ar: "المبلغ", align: "end" },
    { key: "billed", label: "Billed", ar: "المفوتر", align: "end" },
    { key: "toBill", label: "To Bill", ar: "متبقٍ للفوترة", align: "end" },
    { key: "next", label: "Next document", ar: "المستند التالي" },
  ],
  sorts: ["due", "po", "supplier", "toReceive", "toBill"],
  defaultSort: { field: "due", dir: "asc" },
};

export const PO_BANDS = ["overdue", "week", "month", "later", "nodate", "billing"] as const;
export type PoBand = typeof PO_BANDS[number];
const BAND_EN: Record<PoBand, string> = { overdue: "Overdue", week: "Due in 7 days", month: "Due in 8–30 days", later: "Due after 30 days", nodate: "No expected date", billing: "Received — to bill" };
const BAND_AR: Record<PoBand, string> = { overdue: "متأخر", week: "خلال 7 أيام", month: "خلال 8–30 يومًا", later: "بعد 30 يومًا", nodate: "بدون تاريخ متوقع", billing: "مستلم — بانتظار الفوترة" };
export const bandLabel = (v: string, ar: boolean) => ((ar ? BAND_AR : BAND_EN) as Record<string, string>)[v] ?? v;

export const STOCK_SPEC: ViewSpec = {
  id: "pro.stock-balance", label: "Stock Balance", ar: "رصيد المخزون", route: "/pro/stock-balance",
  filters: [
    { key: "company", label: "Company", ar: "الشركة", company: true },
    { key: "warehouse", label: "Warehouse", ar: "المستودع" },
    { key: "item_group", label: "Item Group", ar: "مجموعة الأصناف" },
    { key: "q", label: "Search", ar: "بحث", op: "like" },
    { key: "short", label: "Projected below zero", ar: "المتوقع أقل من صفر", display: yes },
    { key: "group", label: "Group by", ar: "تجميع حسب" },
  ],
  columns: [
    { key: "item", label: "Item", ar: "الصنف", locked: true },
    { key: "warehouse", label: "Warehouse", ar: "المستودع" },
    { key: "uom", label: "UOM", ar: "وحدة القياس" },
    { key: "actual", label: "Actual Qty", ar: "الكمية الفعلية", align: "end" },
    { key: "reserved", label: "Reserved Qty", ar: "الكمية المحجوزة", align: "end" },
    { key: "ordered", label: "Ordered Qty", ar: "الكمية المطلوبة", align: "end" },
    { key: "projected", label: "Projected Qty", ar: "الكمية المتوقعة", align: "end" },
    { key: "value", label: "Stock Value", ar: "قيمة المخزون", align: "end" },
    { key: "ledger", label: "Stock Ledger", ar: "دفتر المخزون", locked: true },
  ],
  sorts: ["item", "warehouse", "actual", "projected", "value"],
  defaultSort: { field: "item", dir: "asc" },
};

const dims = (v: string) => { try { const x: unknown = JSON.parse(v); return x && typeof x === "object" && !Array.isArray(x) ? Object.entries(x).map(([k, val]) => `${k}=${String(val)}`).join(", ") : v; } catch { return v; } };

const onOff = (v: string, ar: boolean) => (v === "0" ? (ar ? "لا" : "No") : v === "1" ? (ar ? "نعم" : "Yes") : v);
const multi = (v: string) => { try { const x: unknown = JSON.parse(v); return Array.isArray(x) ? x.map(String).join(", ") : v; } catch { return v; } };

/** SC-F-03 General Ledger — every control of the pinned general_ledger.js (R2 P0-GL); native runner order carries the
 *  running balance, so rows are never re-sorted. Check filters store "1"/"0" only when they differ from the source default. */
export const GL_SPEC: ViewSpec = {
  id: "pro.general-ledger", label: "General Ledger", ar: "دفتر الأستاذ العام", route: "/pro/general-ledger",
  filters: [
    { key: "company", label: "Company", ar: "الشركة", company: true },
    { key: "from_date", label: "From Date", ar: "من تاريخ", op: ">=" },
    { key: "to_date", label: "To Date", ar: "إلى تاريخ", op: "<=" },
    { key: "account", label: "Account", ar: "الحساب", display: multi },
    { key: "party_type", label: "Party Type", ar: "نوع الطرف" },
    { key: "party", label: "Party", ar: "الطرف", display: multi },
    { key: "voucher_no", label: "Voucher No", ar: "رقم المستند" },
    { key: "against_voucher_no", label: "Against Voucher No", ar: "رقم المستند المقابل" },
    { key: "group_by", label: "Categorize by", ar: "التصنيف حسب" },
    { key: "finance_book", label: "Finance Book", ar: "الدفتر المالي" },
    { key: "presentation_currency", label: "Currency", ar: "عملة العرض" },
    { key: "cost_center", label: "Cost Center", ar: "مركز التكلفة", display: multi },
    { key: "project", label: "Project", ar: "المشروع", display: multi },
    { key: "dimensions", label: "Dimensions", ar: "الأبعاد", display: dims },
    { key: "include_dimensions", label: "Consider Accounting Dimensions", ar: "مراعاة الأبعاد المحاسبية", display: onOff },
    { key: "disable_opening_balance_calculation", label: "Disable Opening Balance Calculation", ar: "تعطيل احتساب الرصيد الافتتاحي", display: onOff },
    { key: "show_opening_entries", label: "Show Opening Entries", ar: "إظهار القيود الافتتاحية", display: onOff },
    { key: "include_default_book_entries", label: "Include Default FB Entries", ar: "تضمين قيود الدفتر المالي الافتراضي", display: onOff },
    { key: "show_cancelled_entries", label: "Show Cancelled Entries", ar: "إظهار القيود الملغاة", display: onOff },
    { key: "show_net_values_in_party_account", label: "Show Net Values in Party Account", ar: "إظهار صافي القيم في حساب الطرف", display: onOff },
    { key: "show_amount_in_company_currency", label: "Show Credit / Debit in Company Currency", ar: "إظهار المدين والدائن بعملة الشركة", display: onOff },
    { key: "add_values_in_transaction_currency", label: "Add Columns in Transaction Currency", ar: "إضافة أعمدة بعملة المعاملة", display: onOff },
    { key: "show_remarks", label: "Show Remarks", ar: "إظهار الملاحظات", display: onOff },
    { key: "ignore_err", label: "Ignore Exchange Rate Revaluation and Gain / Loss Journals", ar: "تجاهل قيود إعادة تقييم سعر الصرف وأرباح وخسائر الصرف", display: onOff },
    { key: "ignore_cr_dr_notes", label: "Ignore System Generated Credit / Debit Notes", ar: "تجاهل إشعارات الدائن والمدين المولدة آلياً", display: onOff },
  ],
  columns: [
    { key: "posting_date", label: "Posting Date", ar: "تاريخ الترحيل" },
    { key: "account", label: "Account", ar: "الحساب" },
    { key: "voucher_type", label: "Voucher Type", ar: "نوع المستند" },
    { key: "voucher_no", label: "Voucher No", ar: "رقم المستند", locked: true },
    { key: "party", label: "Party", ar: "الطرف" },
    { key: "debit", label: "Debit", ar: "مدين", align: "end" },
    { key: "credit", label: "Credit", ar: "دائن", align: "end" },
    { key: "balance", label: "Balance", ar: "الرصيد", align: "end" },
    { key: "debit_in_transaction_currency", label: "Debit (Transaction)", ar: "مدين (عملة المعاملة)", align: "end" },
    { key: "credit_in_transaction_currency", label: "Credit (Transaction)", ar: "دائن (عملة المعاملة)", align: "end" },
    { key: "transaction_currency", label: "Transaction Currency", ar: "عملة المعاملة" },
    { key: "against", label: "Against Account", ar: "الحساب المقابل" },
    { key: "cost_center", label: "Cost Center", ar: "مركز التكلفة" },
    { key: "project", label: "Project", ar: "المشروع" },
    { key: "against_voucher", label: "Against Voucher", ar: "المستند المقابل" },
    { key: "remarks", label: "Remarks", ar: "الملاحظات" },
    { key: "voucher_subtype", label: "Voucher Subtype", ar: "النوع الفرعي للمستند", defaultHidden: true },
    { key: "party_type", label: "Party Type", ar: "نوع الطرف", defaultHidden: true },
    { key: "party_name", label: "Party Name", ar: "اسم الطرف", defaultHidden: true },
    { key: "against_voucher_type", label: "Against Voucher Type", ar: "نوع المستند المقابل", defaultHidden: true },
    { key: "bill_no", label: "Supplier Invoice No", ar: "رقم فاتورة المورد", defaultHidden: true },
  ],
  sorts: [], defaultSort: null,
};

/** SC-I-08 Stock Ledger — posting order carries the balance quantity/value, so rows are never re-sorted. */
export const STOCK_LEDGER_SPEC: ViewSpec = {
  id: "pro.stock-ledger", label: "Stock Ledger", ar: "دفتر المخزون", route: "/pro/stock-ledger",
  filters: [
    { key: "company", label: "Company", ar: "الشركة", company: true },
    { key: "item", label: "Item", ar: "الصنف" },
    { key: "warehouse", label: "Warehouse", ar: "المستودع" },
    { key: "voucher", label: "Voucher Type", ar: "نوع المستند" },
    { key: "from", label: "From Date", ar: "من تاريخ", op: ">=" },
    { key: "to", label: "To Date", ar: "إلى تاريخ", op: "<=" },
  ],
  columns: [
    { key: "date", label: "Date", ar: "التاريخ" },
    { key: "item", label: "Item", ar: "الصنف", locked: true },
    { key: "warehouse", label: "Warehouse", ar: "المستودع" },
    { key: "voucher", label: "Voucher", ar: "المستند", locked: true },
    { key: "in", label: "In qty", ar: "الكمية الواردة", align: "end" },
    { key: "out", label: "Out qty", ar: "الكمية الصادرة", align: "end" },
    { key: "balance", label: "Balance qty", ar: "رصيد الكمية", align: "end" },
    { key: "rate", label: "Valuation Rate", ar: "معدل التقييم", align: "end" },
    { key: "stock_value", label: "Balance value", ar: "قيمة الرصيد", align: "end" },
    { key: "value_change", label: "Value change", ar: "تغير القيمة", align: "end" },
  ],
  sorts: [], defaultSort: null,
};

export const PAYMENTS_SPEC: ViewSpec = {
  id: "pro.payments", label: "Payments", ar: "المدفوعات", route: "/pro/payments",
  filters: [
    { key: "company", label: "Company", ar: "الشركة", company: true },
    { key: "type", label: "Payment Type", ar: "نوع الدفع" },
    { key: "state", label: "Status", ar: "الحالة" },
    { key: "q", label: "Search", ar: "بحث", op: "like" },
  ],
  columns: [
    { key: "name", label: "Payment Entry", ar: "قيد الدفع", locked: true },
    { key: "date", label: "Posting Date", ar: "تاريخ الترحيل" },
    { key: "type", label: "Payment Type", ar: "نوع الدفع" },
    { key: "party", label: "Party", ar: "الطرف" },
    { key: "mode", label: "Mode of Payment", ar: "طريقة الدفع" },
    { key: "status", label: "Status", ar: "الحالة" },
    { key: "amount", label: "Amount", ar: "المبلغ", align: "end" },
    { key: "unallocated", label: "Unallocated", ar: "غير مخصص", align: "end" },
  ],
  sorts: ["date", "amount", "unallocated", "party", "name"],
  defaultSort: { field: "date", dir: "desc" },
};

const COLL_BUCKET: Record<string, [string, string]> = { overdue: ["Overdue", "متأخرة"], today: ["Due today", "مستحقة اليوم"], week: ["Due in 7 days", "خلال 7 أيام"], later: ["Later", "لاحقًا"] };
export const COLLECTIONS_SPEC: ViewSpec = {
  id: "pro.collections", label: "Collections", ar: "التحصيل", route: "/pro/collections",
  filters: [
    { key: "company", label: "Company", ar: "الشركة", company: true },
    { key: "bucket", label: "Due", ar: "الاستحقاق", display: (v, ar) => COLL_BUCKET[v]?.[ar ? 1 : 0] ?? v },
    { key: "customer", label: "Customer", ar: "العميل" },
    { key: "owner", label: "Owner", ar: "المسؤول" },
    { key: "from", label: "Due from", ar: "الاستحقاق من", op: ">=" },
    { key: "to", label: "Due to", ar: "الاستحقاق إلى", op: "<=" },
    { key: "q", label: "Search", ar: "بحث", op: "like" },
  ],
  columns: [
    { key: "invoice", label: "Sales Invoice", ar: "فاتورة المبيعات", locked: true },
    { key: "customer", label: "Customer", ar: "العميل" },
    { key: "due", label: "Due date", ar: "تاريخ الاستحقاق" },
    { key: "days", label: "Days", ar: "الأيام", align: "end" },
    { key: "grand", label: "Grand total", ar: "الإجمالي", align: "end" },
    { key: "outstanding", label: "Outstanding", ar: "المبلغ المستحق", align: "end" },
    { key: "owner", label: "Owner", ar: "المسؤول" },
    { key: "next", label: "Next action", ar: "الإجراء التالي" },
    { key: "actions", label: "Actions", ar: "الإجراءات", locked: true },
  ],
  /** No default sort: the source order is the collection priority (overdue amount first). */
  sorts: ["days", "outstanding", "due", "customer"], defaultSort: null,
};

/** SC-F-11 Trial Balance — native runner columns and hierarchy are fixed; views keep filters only. */
export const TB_SPEC: ViewSpec = {
  id: "pro.trial-balance", label: "Trial Balance", ar: "ميزان المراجعة", route: "/pro/trial-balance",
  filters: [
    { key: "company", label: "Company", ar: "الشركة", company: true },
    { key: "from_date", label: "From Date", ar: "من تاريخ", op: ">=" },
    { key: "to_date", label: "To Date", ar: "إلى تاريخ", op: "<=" },
    { key: "zero", label: "Show zero values", ar: "إظهار القيم الصفرية", display: yes },
    { key: "q", label: "Search", ar: "بحث", op: "like" },
  ],
  columns: [], sorts: [], defaultSort: null,
};

const ST_REPORT: Record<string, [string, string]> = { "Profit and Loss Statement": ["Profit and Loss Statement", "قائمة الأرباح والخسائر"], "Balance Sheet": ["Balance Sheet", "الميزانية العمومية"], "Cash Flow": ["Cash Flow", "التدفقات النقدية"] };
/** SC-A-07 Financial Statements — native runner columns are fixed; views keep report, company, period and periodicity. */
export const STATEMENTS_SPEC: ViewSpec = {
  id: "pro.statements", label: "Financial Statements", ar: "القوائم المالية", route: "/pro/statements",
  filters: [
    { key: "report", label: "Statement", ar: "القائمة", display: (v, ar) => ST_REPORT[v]?.[ar ? 1 : 0] ?? v },
    { key: "company", label: "Company", ar: "الشركة", company: true },
    { key: "from_date", label: "From Date", ar: "من تاريخ", op: ">=" },
    { key: "to_date", label: "To Date", ar: "إلى تاريخ", op: "<=" },
    { key: "periodicity", label: "Periodicity", ar: "الدورية" },
    // RXP-02 dimension scope passed to the native statement runners (financial_statements.py dimension filters)
    { key: "finance_book", label: "Finance Book", ar: "الدفتر المالي" },
    { key: "cost_center", label: "Cost Center", ar: "مركز التكلفة" },
    { key: "project", label: "Project", ar: "المشروع" },
  ],
  columns: [], sorts: [], defaultSort: null,
};

/* EQ-01 P3 — RXP-03 quote-to-cash screens. Their cards, bars and tables are fixed by the source contract, so a view keeps
   the page's filter predicates only (columns: []); the company is re-validated against the user's companies on apply. */
const label = (m: Record<string, Bi>) => (v: string, ar: boolean) => m[v]?.[ar ? 1 : 0] ?? v;
const COMPANY = { key: "company", label: "Company", ar: "الشركة", company: true } as const;
export const FULFIL_SPEC: ViewSpec = {
  id: "pro.order-fulfilment", label: "Order Fulfilment", ar: "تنفيذ أوامر البيع", route: "/pro/order-fulfilment",
  filters: [COMPANY, { key: "as_of", label: "As of", ar: "حتى تاريخ" }, { key: "state", label: "Line state", ar: "حالة البند", display: label(STATE_LABEL) },
    { key: "bucket", label: "Promised date", ar: "تاريخ التسليم الموعود", display: label(BUCKET_LABEL) }, { key: "customer", label: "Customer", ar: "العميل" },
    { key: "order", label: "Sales Order", ar: "أمر البيع" }, { key: "q", label: "Search", ar: "بحث", op: "like" }, { key: "review", label: "Review", ar: "المراجعة", display: label(REVIEW_LABEL) }],
  columns: [], sorts: [], defaultSort: null,
};
export const PIPELINE_SPEC: ViewSpec = {
  id: "pro.quotation-pipeline", label: "Quotation Pipeline", ar: "مسار عروض الأسعار", route: "/pro/quotation-pipeline",
  filters: [COMPANY, { key: "as_of", label: "As of", ar: "حتى تاريخ" }, { key: "from", label: "From Date", ar: "من تاريخ", op: ">=" }, { key: "to", label: "To Date", ar: "إلى تاريخ", op: "<=" },
    { key: "outcome", label: "Outcome", ar: "النتيجة", display: label(OUTCOME_LABEL) }, { key: "bin", label: "Validity", ar: "الصلاحية", display: label(BIN_LABEL) },
    { key: "customer", label: "Customer", ar: "العميل" }, { key: "q", label: "Search", ar: "بحث", op: "like" }],
  columns: [], sorts: [], defaultSort: null,
};
const RET_TYPE: Record<string, Bi> = { credit: ["Credit notes", "إشعارات دائنة"], delivery: ["Return deliveries", "مرتجعات التسليم"] };
export const RETURNS_SPEC: ViewSpec = {
  id: "pro.sales-returns", label: "Sales Returns", ar: "مرتجعات المبيعات", route: "/pro/sales-returns",
  filters: [COMPANY, { key: "from", label: "From Date", ar: "من تاريخ", op: ">=" }, { key: "to", label: "To Date", ar: "إلى تاريخ", op: "<=" },
    { key: "type", label: "Return type", ar: "نوع المرتجع", display: label(RET_TYPE) }, { key: "flag", label: "Review flag", ar: "علامة المراجعة", display: label(FLAG_LABEL) },
    { key: "customer", label: "Customer", ar: "العميل" }, { key: "q", label: "Search", ar: "بحث", op: "like" }],
  columns: [], sorts: [], defaultSort: null,
};
export const C360_SPEC: ViewSpec = {
  id: "pro.customer-360", label: "Customer 360", ar: "ملف العميل 360", route: "/pro/customer-360",
  filters: [{ key: "customer", label: "Customer", ar: "العميل" }, COMPANY, { key: "as_of", label: "As of", ar: "حتى تاريخ" },
    { key: "tab", label: "Tab", ar: "التبويب", display: label(CUST_TAB_LABEL) }, { key: "q", label: "Search", ar: "بحث", op: "like" }, { key: "disabled", label: "Include disabled customers", ar: "تضمين العملاء المعطّلين", display: yes }],
  columns: [], sorts: [], defaultSort: null,
};
/** Record values (asset status, category, location…) shown in filter chips: Arabic display only, stored value unchanged. */
const shown = (v: string, ar: boolean) => (ar ? OPS_AR[v] ?? translateTo(v, "ar") : v);
export const ASSET_BUCKET_LABEL: Record<string, Bi> = { active: ["Active / in use", "نشط / قيد الاستخدام"], fully: ["Fully depreciated", "مستهلك بالكامل"], maintenance: ["In maintenance", "قيد الصيانة"], draft: ["Draft", "مسودة"] };
/** SC-A-07 Asset Register: native Asset fields + current carrying values (never historical ledger balances). */
export const ASSET_SPEC: ViewSpec = {
  id: "pro.asset-register", label: "All Assets", ar: "كل الأصول", route: "/pro/asset-register",
  filters: [COMPANY, { key: "q", label: "Search ID or name", ar: "ابحث برقم الأصل أو اسمه", op: "like" }, { key: "bucket", label: "Asset group", ar: "مجموعة الأصول", display: label(ASSET_BUCKET_LABEL) },
    { key: "category", label: "Category", ar: "الفئة", display: shown }, { key: "status", label: "Status", ar: "الحالة", display: shown }, { key: "location", label: "Location", ar: "الموقع", display: shown },
    { key: "custodian", label: "Custodian", ar: "صاحب العهدة" }, { key: "book", label: "Finance Book", ar: "الدفتر المالي" },
    { key: "from", label: "Acquired from", ar: "الاقتناء من", op: ">=" }, { key: "to", label: "Acquired to", ar: "الاقتناء إلى", op: "<=" }, { key: "asof", label: "As of", ar: "حتى تاريخ" }],
  columns: [
    { key: "name", label: "Asset ID", ar: "رقم الأصل", locked: true }, { key: "asset_name", label: "Asset name", ar: "اسم الأصل" }, { key: "asset_category", label: "Category", ar: "الفئة" },
    { key: "company", label: "Company", ar: "الشركة" }, { key: "status", label: "Status", ar: "الحالة" }, { key: "location", label: "Location", ar: "الموقع" }, { key: "custodian", label: "Custodian", ar: "صاحب العهدة" },
    { key: "purchase_date", label: "Acquisition date", ar: "تاريخ الاقتناء" }, { key: "cost", label: "Acquisition cost", ar: "تكلفة الاقتناء", align: "end" },
    { key: "accumulated", label: "Accumulated depreciation", ar: "الإهلاك المتراكم", align: "end" }, { key: "book", label: "Net book value", ar: "صافي القيمة الدفترية", align: "end" },
    { key: "next", label: "Next depreciation", ar: "الإهلاك التالي" },
  ],
  sorts: ["name", "asset_name", "asset_category", "status", "location", "custodian", "purchase_date", "cost", "accumulated", "book", "next"],
  defaultSort: { field: "name", dir: "asc" },
};

export const VIEW_SPECS: ViewSpec[] = [AR_SPEC, AP_SPEC, SALES_SPEC, OPEN_PO_SPEC, STOCK_SPEC, GL_SPEC, STOCK_LEDGER_SPEC, PAYMENTS_SPEC, COLLECTIONS_SPEC, TB_SPEC, STATEMENTS_SPEC, FULFIL_SPEC, PIPELINE_SPEC, RETURNS_SPEC, C360_SPEC, ASSET_SPEC];
export const specByRoute = (route: string) => VIEW_SPECS.find((s) => s.route === route);
export const specById = (id: string) => VIEW_SPECS.find((s) => s.id === id);

/** Stable sort of register rows by a spec sort; `null` keeps the source order (e.g. priority or running balance). */
export function sortRows<T>(rows: T[], sort: { field: string; dir: "asc" | "desc" } | null, get: (row: T, field: string) => string | number): T[] {
  if (!sort) return rows;
  const sign = sort.dir === "desc" ? -1 : 1;
  return rows.map((r, i) => ({ r, i })).sort((a, b) => {
    const x = get(a.r, sort.field), y = get(b.r, sort.field);
    const c = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y));
    return c * sign || a.i - b.i;
  }).map((z) => z.r);
}
