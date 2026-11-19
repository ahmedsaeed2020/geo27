/**
 * RXP-NAV-CORRECTIVE-02 — business SECTION WORKSPACE engine (owner contracts 02_BLUEPRINT/01_SECTION_WORKSPACE_CONTRACTS.md).
 *
 * Every section page (/pro/$dept/$section) is described declaratively here: canonical documents, KPI predicates,
 * work queues and charts. Predicates are Frappe list filter tuples evaluated with the SAME matcher the native list
 * uses (src/lib/desk.ts matchFilter), so a figure always equals the rows its drill opens in the native register.
 * Reads go through permission-scoped sources only (scope.ts); a company headline over a partly readable source fails
 * closed ("denied") instead of showing a partial number. Nothing here writes records or ledgers.
 */
import { adapter, type Doc } from "@/lib/adapter";
import { cachedMeta } from "@/lib/catalog";
import { matchFilter, type Filter } from "@/lib/desk";
import { scopedList } from "@/lib/scope";
import { currentUser } from "@/lib/session";
import { sourceStatus, type SourceStatus } from "./finance";
import type { Bi, Drill, Severity } from "./command";
import { arRegister, type ArRegister, type ArRow, type Side } from "./aging";
import type { DeptId } from "./nav";

export type { Filter };
const n = (v: unknown) => (typeof v === "number" ? v : Number(v) || 0);
const r2 = (v: number) => Math.round(v * 100) / 100;
const DAY = 86_400_000;
export const addDaysIso = (d: string, k: number) => new Date(Date.parse(`${d}T00:00:00Z`) + k * DAY).toISOString().slice(0, 10);
const monthStart = (d: string) => `${d.slice(0, 7)}-01`;
const monthEndIso = (ym: string) => { const [y, m] = ym.split("-").map(Number) as [number, number]; return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); };
export function monthsBack(asOf: string, k = 6): string[] {
  const [y, m] = asOf.split("-").map(Number) as [number, number];
  return Array.from({ length: k }, (_, i) => { const d = new Date(Date.UTC(y, m - 1 - (k - 1 - i), 1)); return d.toISOString().slice(0, 7); });
}

/** Page scope shared by every section: company, as-of date and the derived windows used by date predicates.
 *  Specs may only use these fields (never compute dates inline), so the Frappe export can carry them as tokens
 *  (scripts/export_digit_pro_nav.ts → config/sections.json; digit_pro/section_logic.py derives the same windows). */
export interface SectionCtx { company: string; currency: string; asOf: string; d7: string; d30: string; from30: string; from90: string; from12: string; monthFrom: string }
export const CTX_WINDOWS = { d7: 7, d30: 30, from30: -30, from90: -90, from12: -365 } as const;
export function sectionCtx(company: string, currency: string, asOf: string): SectionCtx {
  const w = Object.fromEntries(Object.entries(CTX_WINDOWS).map(([k, days]) => [k, addDaysIso(asOf, days)])) as Record<keyof typeof CTX_WINDOWS, string>;
  return { company, currency, asOf, ...w, monthFrom: monthStart(asOf) };
}

/** tool: a Single DocType tool (e.g. Bank Reconciliation Tool) opened as its one form — no record counts.
 *  ledger: rows written only by native posting (GL Entry, Stock Ledger Entry) — read-only register, never created here. */
export interface DocDef { doctype: string; owner: DeptId; role: Bi; date?: string; company?: boolean; create?: boolean; tool?: boolean; ledger?: boolean }
/** Run11.1 defined formulas (run11Formulas.ts) may narrow rows by a predicate over native fields, compute a per-record value,
 *  express a rate against a base set or compute the figure directly; the drill then lists exactly the counted records. */
export type RowPick = (d: Doc, c: SectionCtx) => boolean;
export type FigureUnit = "qty" | "days" | "pct";
export interface KpiFnResult { count: number; totals?: { currency: string; amount: number }[]; figure?: { value: number; unit: FigureUnit }; names?: string[]; drill?: Drill }
export interface KpiDef { id: string; label: Bi; hint: Bi; doctype: string; filters: Filter[]; measure?: string; cur?: string; tone?: "risk" | "action" | "info";
  pick?: RowPick; value?: (d: Doc, c: SectionCtx) => number; unit?: FigureUnit; rate?: { filters: Filter[]; pick?: RowPick }; fn?: (c: SectionCtx, user: string) => KpiFnResult }
export interface QueueDef { id: string; label: Bi; doctype: string; filters: Filter[]; date: string; party?: string; amount?: string; cur?: string; order?: "asc" | "desc"; action: Bi; severity: Severity; overdueFrom?: string;
  pick?: RowPick; dateOf?: (d: Doc) => string; amountOf?: (d: Doc) => number | null; partyOf?: (d: Doc) => string }
export interface ChartDef { id: string; label: Bi; kind: "field" | "month"; doctype: string; filters: Filter[]; field: string; measure?: string; cur?: string;
  /** Drawing override (OWN-62): a monthly trend read as an area. */
  view?: "area";
  /** Field charts rank their parts by record count; `rank: "value"` ranks a valued chart by its amount instead. */
  rank?: "value";
  pick?: RowPick; value?: (d: Doc, c: SectionCtx) => number; bucket?: (d: Doc, c: SectionCtx) => string; order?: string[]; sortKeys?: boolean; labels?: Record<string, Bi>; unit?: "qty"; fn?: (c: SectionCtx, user: string) => (Omit<ChartBar, "label"> & { label?: string })[];
  /** fixed Enterprise status colour per bucket key (e.g. credit use: within limit green, 80–100% amber, over red) */
  tones?: Record<string, "ok" | "warn" | "bad" | "info"> }
/** Section-specific panels that reuse existing source-connected Pro logic (rendered by SectionWorkspace). */
export type ExtraId = "inv-heat" | "dues" | "cash" | "close" | "ops-review" | "sel-fulfil" | "sel-intel" | "customer-mix" | "pur-quotes" | "inv-expiry" | "asset-service" | "asset-books" | "pur-orders" | "pur-receive" | "supplier" | "stock-exposure" | "stock-sources" | "asset-life" | "asset-dep";
export interface SectionSpec {
  id: string; role: Bi; purpose: Bi; questions: Bi;
  docs: DocDef[];
  kpis: (c: SectionCtx) => KpiDef[];
  queues: (c: SectionCtx) => QueueDef[];
  charts: (c: SectionCtx) => ChartDef[];
  flow: Bi[]; guards: Bi[]; scope: Bi[];
  extra?: ExtraId[];
}

const co = (c: SectionCtx): Filter => ["company", "=", c.company];
const SUB: Filter = ["docstatus", "=", 1];
const DRAFT: Filter = ["docstatus", "=", 0];
const NOT_CANCELLED: Filter = ["docstatus", "!=", 2];
const between = (f: string, a: string, b: string): Filter => [f, "between", [a, b]];
/** The document date a block's own period filters on (posting / transaction date …), or undefined when the DocType has none. */
const DATE_FIELDS = ["posting_date", "transaction_date", "bill_date", "schedule_date", "purchase_date", "available_for_use_date", "date", "creation"];
export function docDateField(doctype: string): string | undefined { const m = cachedMeta(doctype); if (!m) return undefined; const names = new Set(m.fields.map((f) => f.fieldname)); return DATE_FIELDS.find((f) => names.has(f)) ?? (m.fields.length ? "creation" : undefined); }
/** A figure definition limited to documents dated inside a block's own period (block menu, owner 2026-11-13 §2.3). */
export function withinWindow<T extends { doctype: string; filters: Filter[] }>(def: T, from: string, to: string): T & { windowed?: string } {
  const f = docDateField(def.doctype); return f ? { ...def, filters: [...def.filters, between(f, from, `${to}${f === "creation" ? " 23:59:59" : ""}`)], windowed: f } : def;
}
const OPEN_QTN = ["Open", "Replied", "Partially Ordered"];
const SO_DELIVER = ["To Deliver and Bill", "To Deliver"];
const PO_RECEIVE = ["To Receive and Bill", "To Receive"];

/* ------------------------------------------------------------------ 20 section specs ------------------------------------------------------------------ */
export const SPECS: Record<string, SectionSpec> = {
  "ACC-OPS": {
    id: "ACC-OPS", role: ["Accountant · Financial Controller", "المحاسب · المراقب المالي"],
    purpose: ["Prepare, review and trace financial postings before they reach the ledger.", "إعداد القيود ومراجعتها وتتبعها قبل وصولها إلى دفتر الأستاذ."],
    questions: ["What is waiting for posting, validation or allocation — and where did each entry originate?", "ما الذي ينتظر الترحيل أو التحقق أو التخصيص، ومن أين نشأ كل قيد؟"],
    docs: [
      { doctype: "Journal Entry", owner: "accounting", role: ["Manual and system journal vouchers", "قيود اليومية اليدوية والآلية"], date: "posting_date", company: true, create: true },
      { doctype: "Payment Entry", owner: "accounting", role: ["Receipts, payments and internal transfers", "المقبوضات والمدفوعات والتحويلات الداخلية"], date: "posting_date", company: true, create: true },
      { doctype: "Bank Transaction", owner: "accounting", role: ["Bank lines behind receipts and payments", "الحركات البنكية خلف المقبوضات والمدفوعات"], date: "date", company: true, create: true },
      { doctype: "Account", owner: "accounting", role: ["Chart of accounts", "دليل الحسابات"], company: true },
      { doctype: "Cost Center", owner: "accounting", role: ["Analytical dimensions", "الأبعاد التحليلية"], company: true },
      { doctype: "Period Closing Voucher", owner: "accounting", role: ["Year-end closing", "إقفال نهاية السنة"], date: "transaction_date", company: true },
    ],
    kpis: (c) => [
      { id: "je-draft", label: ["Draft journal entries", "قيود يومية مسودة"], hint: ["Saved, not yet submitted", "حالة المستند = مسودة"], doctype: "Journal Entry", filters: [co(c), DRAFT], measure: "total_debit", tone: "action" },
      { id: "pe-draft", label: ["Draft payment entries", "سندات دفع مسودة"], hint: ["Not yet submitted", "لم تُعتمد بعد"], doctype: "Payment Entry", filters: [co(c), DRAFT], measure: "paid_amount", cur: "paid_from_account_currency", tone: "action" },
      { id: "je-month", label: ["Journal entries posted this month", "قيود مرحّلة هذا الشهر"], hint: ["Submitted, posting date in the as-of month", "معتمدة وتاريخ الترحيل ضمن شهر التقرير"], doctype: "Journal Entry", filters: [co(c), SUB, between("posting_date", c.monthFrom, c.asOf)], measure: "total_debit", tone: "info" },
      { id: "pe-unalloc", label: ["Payments with unallocated amount", "مدفوعات بمبالغ غير مخصصة"], hint: ["Submitted, unallocated amount above zero", "معتمدة والمبلغ غير المخصص أكبر من صفر"], doctype: "Payment Entry", filters: [co(c), SUB, ["unallocated_amount", ">", 0]], measure: "unallocated_amount", cur: "paid_from_account_currency", tone: "risk" },
    ],
    queues: (c) => [
      { id: "je-draft", label: ["Draft journal entries to review", "قيود يومية مسودة للمراجعة"], doctype: "Journal Entry", filters: [co(c), DRAFT], date: "posting_date", amount: "total_debit", order: "asc", action: ["Review and submit", "مراجعة واعتماد"], severity: "high" },
      { id: "pe-draft", label: ["Draft payment entries", "سندات دفع مسودة"], doctype: "Payment Entry", filters: [co(c), DRAFT], date: "posting_date", party: "party", amount: "paid_amount", cur: "paid_from_account_currency", order: "asc", action: ["Allocate and submit", "تخصيص واعتماد"], severity: "medium" },
    ],
    charts: (c) => [
      { id: "je-month", label: ["Posted journal entries by month", "القيود المرحّلة حسب الشهر"], kind: "month", doctype: "Journal Entry", filters: [co(c), SUB], field: "posting_date" },
      { id: "je-type", label: ["Journal entries by voucher type", "القيود حسب نوع السند"], kind: "field", doctype: "Journal Entry", filters: [co(c), SUB, between("posting_date", c.from12, c.asOf)], field: "voucher_type" },
    ],
    flow: [["Source voucher or manual entry", "مستند المصدر أو قيد يدوي"], ["Draft Journal / Payment Entry", "قيد أو سند دفع مسودة"], ["Submit — the posting engine writes GL rows", "الاعتماد — محرك الترحيل يكتب قيود الأستاذ"], ["General Ledger and Trial Balance", "دفتر الأستاذ وميزان المراجعة"]],
    guards: [["Ledger rows are written only by submitting the native document; this page never writes GL Entry.", "تُكتب قيود الأستاذ فقط عند اعتماد المستند الأصلي؛ هذه الصفحة لا تكتب قيود أستاذ."], ["A balanced draft is not proof of correct accounting — review the source voucher.", "توازن المسودة لا يثبت صحة المعالجة المحاسبية — راجع مستند المصدر."]],
    scope: [["Company", "الشركة"], ["Posting period", "فترة الترحيل"], ["Voucher type", "نوع السند"], ["Document status", "حالة المستند"]],
    extra: ["ops-review"],
  },
  "ACC-DUES": {
    id: "ACC-DUES", role: ["AR/AP accountant · Controller", "محاسب الذمم · المراقب المالي"],
    purpose: ["Manage outstanding receivables, payables and payment allocation from the authoritative open balances.", "إدارة الذمم المدينة والدائنة وتخصيص المدفوعات من الأرصدة المفتوحة المعتمدة."],
    questions: ["Who owes us, whom do we owe, what is overdue and which payments are unallocated?", "من المدين لنا، ولمن ندين، وما المتأخر، وما المدفوعات غير المخصصة؟"],
    docs: [
      { doctype: "Sales Invoice", owner: "selling", role: ["Customer invoices (Selling-owned)", "فواتير العملاء (ملك المبيعات)"], date: "posting_date", company: true, create: true },
      { doctype: "Purchase Invoice", owner: "purchasing", role: ["Supplier invoices (Purchasing-owned)", "فواتير الموردين (ملك المشتريات)"], date: "posting_date", company: true, create: true },
      { doctype: "Payment Entry", owner: "accounting", role: ["Receipts and payments (Accounting-owned)", "المقبوضات والمدفوعات (ملك المحاسبة)"], date: "posting_date", company: true, create: true },
      { doctype: "Customer", owner: "selling", role: ["Customer master", "بيانات العملاء"] },
      { doctype: "Supplier", owner: "purchasing", role: ["Supplier master", "بيانات الموردين"] },
      { doctype: "Dunning", owner: "accounting", role: ["Payment reminders", "خطابات المطالبة"], date: "posting_date", company: true },
      { doctype: "Payment Reconciliation", owner: "accounting", role: ["Native tool that allocates payments to open invoices", "الأداة الأصلية لتخصيص المدفوعات على الفواتير المفتوحة"], tool: true },
    ],
    kpis: (c) => [
      { id: "pe-unalloc", label: ["Payments with unallocated amount", "مدفوعات بمبالغ غير مخصصة"], hint: ["Submitted, unallocated amount above zero", "معتمدة والمبلغ غير المخصص أكبر من صفر"], doctype: "Payment Entry", filters: [co(c), SUB, ["unallocated_amount", ">", 0]], measure: "unallocated_amount", cur: "paid_from_account_currency", tone: "risk" },
      { id: "pe-draft", label: ["Draft payment entries", "سندات دفع مسودة"], hint: ["Not yet submitted", "لم تُعتمد بعد"], doctype: "Payment Entry", filters: [co(c), DRAFT], measure: "paid_amount", cur: "paid_from_account_currency", tone: "action" },
    ],
    queues: (c) => [
      { id: "pe-draft", label: ["Draft payment entries to allocate", "سندات دفع مسودة للتخصيص"], doctype: "Payment Entry", filters: [co(c), DRAFT], date: "posting_date", party: "party", amount: "paid_amount", cur: "paid_from_account_currency", order: "asc", action: ["Allocate and submit", "تخصيص واعتماد"], severity: "medium" },
    ],
    charts: () => [],
    flow: [["Sales / Purchase Invoice submitted", "اعتماد فاتورة مبيعات أو مشتريات"], ["Open balance (outstanding_amount)", "رصيد مفتوح (المبلغ القائم)"], ["Payment Entry allocated against the invoice", "سند دفع مخصص للفاتورة"], ["Balance reduced in the ledger; ageing updates", "ينخفض الرصيد في الأستاذ ويتحدث التقادم"]],
    guards: [["Outstanding comes from each invoice's outstanding_amount, adjusted by later ledger movements for past dates — never from gross invoice totals.", "الرصيد القائم من المبلغ القائم لكل فاتورة مع استبعاد حركات الأستاذ اللاحقة للتواريخ السابقة — وليس من إجمالي الفواتير."], ["Mixed currencies are shown separately and never summed.", "العملات المختلفة تُعرض منفصلة ولا تُجمع."], ["Invoices stay in their owning modules; this page links to the original documents.", "تبقى الفواتير في وحداتها الأصلية؛ هذه الصفحة تفتح المستندات الأصلية."]],
    scope: [["Company", "الشركة"], ["As-of date", "حتى تاريخ"], ["Customer / supplier", "العميل / المورد"], ["Ageing bucket", "فئة التقادم"], ["Currency", "العملة"]],
    extra: ["dues"],
  },
  "ACC-CASH": {
    id: "ACC-CASH", role: ["Treasury · Cash accountant", "الخزينة · محاسب النقدية"],
    purpose: ["Control bank and cash positions, statement matching and payments in flight.", "متابعة أرصدة البنوك والنقدية ومطابقة الكشوف والمدفوعات الجارية."],
    questions: ["What is our posted cash position, which bank lines are unmatched and which payments are pending?", "ما رصيدنا النقدي المرحّل، وما حركات البنك غير المطابقة، وما المدفوعات المعلقة؟"],
    docs: [
      { doctype: "Bank Account", owner: "accounting", role: ["Company bank accounts", "حسابات الشركة البنكية"], company: true },
      { doctype: "Bank Transaction", owner: "accounting", role: ["Imported statement lines", "حركات كشف الحساب المستوردة"], date: "date", company: true, create: true },
      { doctype: "Payment Entry", owner: "accounting", role: ["Receipts and payments", "المقبوضات والمدفوعات"], date: "posting_date", company: true, create: true },
      { doctype: "Journal Entry", owner: "accounting", role: ["Bank and cash entries", "قيود البنك والنقدية"], date: "posting_date", company: true },
      { doctype: "Bank Reconciliation Tool", owner: "accounting", role: ["Native tool that matches statement lines to payments and entries", "الأداة الأصلية لمطابقة حركات الكشف مع السندات والقيود"], tool: true },
      { doctype: "Bank", owner: "accounting", role: ["Banks the company works with", "البنوك التي تتعامل معها الشركة"] },
      { doctype: "Bank Statement Import", owner: "accounting", role: ["Statement files imported into bank lines", "ملفات كشوف الحساب المستوردة إلى حركات بنكية"], company: true, create: true },
    ],
    kpis: (c) => [
      { id: "bt-open", label: ["Unreconciled bank lines", "حركات بنكية غير مسوّاة"], hint: ["Submitted, status Unreconciled or Pending", "معتمدة وحالتها غير مسوّاة أو معلقة"], doctype: "Bank Transaction", filters: [co(c), SUB, ["status", "in", ["Unreconciled", "Pending"]]], tone: "risk" },
      { id: "bt-done", label: ["Reconciled bank lines", "حركات بنكية مسوّاة"], hint: ["Submitted, status Reconciled", "معتمدة وحالتها مسوّاة"], doctype: "Bank Transaction", filters: [co(c), SUB, ["status", "=", "Reconciled"]], tone: "info" },
      { id: "pe-in", label: ["Received — last 90 days", "المقبوض — آخر 90 يومًا"], hint: ["Payment Entry · Receive · submitted", "سند دفع · قبض · معتمد"], doctype: "Payment Entry", filters: [co(c), SUB, ["payment_type", "=", "Receive"], between("posting_date", c.from90, c.asOf)], measure: "received_amount", cur: "paid_to_account_currency", tone: "info" },
      { id: "pe-out", label: ["Paid — last 90 days", "المدفوع — آخر 90 يومًا"], hint: ["Payment Entry · Pay · submitted", "سند دفع · صرف · معتمد"], doctype: "Payment Entry", filters: [co(c), SUB, ["payment_type", "=", "Pay"], between("posting_date", c.from90, c.asOf)], measure: "paid_amount", cur: "paid_from_account_currency", tone: "info" },
    ],
    queues: (c) => [
      { id: "bt-open", label: ["Bank lines to reconcile", "حركات بنكية للتسوية"], doctype: "Bank Transaction", filters: [co(c), SUB, ["status", "in", ["Unreconciled", "Pending"]]], date: "date", party: "bank_account", amount: "deposit", order: "asc", action: ["Match in Bank Reconciliation", "المطابقة في التسوية البنكية"], severity: "high" },
      { id: "pe-draft", label: ["Draft payment entries", "سندات دفع مسودة"], doctype: "Payment Entry", filters: [co(c), DRAFT], date: "posting_date", party: "party", amount: "paid_amount", cur: "paid_from_account_currency", order: "asc", action: ["Submit or discard", "اعتماد أو إلغاء"], severity: "medium" },
    ],
    charts: (c) => [
      { id: "bt-status", label: ["Bank lines by matching status", "الحركات البنكية حسب حالة المطابقة"], kind: "field", doctype: "Bank Transaction", filters: [co(c), SUB], field: "status" },
      { id: "pe-month", label: ["Submitted payment entries by month", "سندات الدفع المعتمدة حسب الشهر"], kind: "month", doctype: "Payment Entry", filters: [co(c), SUB], field: "posting_date" },
    ],
    flow: [["Bank statement imported as Bank Transaction", "استيراد الكشف كحركات بنكية"], ["Matched to Payment / Journal Entry", "مطابقتها مع سند دفع أو قيد"], ["Status becomes Reconciled", "تصبح الحالة مسوّاة"], ["Cash position from posted GL on Bank/Cash accounts", "الرصيد النقدي من قيود الأستاذ لحسابات البنك والنقدية"]],
    guards: [["Cash position is the posted GL balance of Bank and Cash accounts as of the date — never statement totals.", "الرصيد النقدي هو رصيد الأستاذ المرحّل لحسابات البنك والنقدية حتى التاريخ — وليس مجاميع الكشف."], ["Matching is done in the native Bank Reconciliation tool.", "تتم المطابقة في أداة التسوية البنكية الأصلية."]],
    scope: [["Company", "الشركة"], ["Bank account", "الحساب البنكي"], ["Statement / posting date", "تاريخ الكشف / الترحيل"], ["Matching status", "حالة المطابقة"]],
    extra: ["cash"],
  },
  "ACC-REPORT": {
    id: "ACC-REPORT", role: ["CFO · Financial Controller", "المدير المالي · المراقب المالي"],
    purpose: ["Analyse results, control the period close and reach every financial report from one place.", "تحليل النتائج ومراقبة إقفال الفترة والوصول إلى كل التقارير المالية من مكان واحد."],
    questions: ["Are the books ready to close, what blocks the period and where are the variances?", "هل الدفاتر جاهزة للإقفال، وما الذي يعيق الفترة، وأين الانحرافات؟"],
    docs: [
      { doctype: "Account", owner: "accounting", role: ["Chart of accounts", "دليل الحسابات"], company: true },
      { doctype: "Cost Center", owner: "accounting", role: ["Cost centers / dimensions", "مراكز التكلفة / الأبعاد"], company: true },
      { doctype: "Journal Entry", owner: "accounting", role: ["Adjusting entries", "قيود التسوية"], date: "posting_date", company: true },
      { doctype: "Period Closing Voucher", owner: "accounting", role: ["Period closing", "إقفال الفترة"], date: "transaction_date", company: true },
      { doctype: "Accounting Period", owner: "accounting", role: ["Locked periods", "الفترات المقفلة"], company: true },
      { doctype: "Fiscal Year", owner: "accounting", role: ["Fiscal years", "السنوات المالية"] },
      { doctype: "Finance Book", owner: "accounting", role: ["Parallel books (e.g. tax and IFRS depreciation)", "الدفاتر الموازية (مثل الإهلاك الضريبي والمعياري)"] },
      { doctype: "Budget", owner: "accounting", role: ["Budgets by account and cost center", "الموازنات حسب الحساب ومركز التكلفة"], company: true, create: true },
      { doctype: "Sales Taxes and Charges Template", owner: "accounting", role: ["VAT settings used on sales documents", "إعدادات الضريبة المستخدمة في مستندات المبيعات"], company: true },
      { doctype: "GL Entry", owner: "accounting", role: ["Posted ledger rows behind every statement (read-only)", "قيود الأستاذ المرحّلة خلف كل قائمة (للقراءة فقط)"], date: "posting_date", company: true, ledger: true },
    ],
    kpis: (c) => [
      { id: "acc-ledger", label: ["Active ledger accounts", "حسابات أستاذ نشطة"], hint: ["Not a group, not disabled", "حسابات فرعية غير معطلة"], doctype: "Account", filters: [co(c), ["is_group", "=", 0], ["disabled", "=", 0]], tone: "info" },
      { id: "je-draft", label: ["Draft entries blocking close", "قيود مسودة تعيق الإقفال"], hint: ["Draft Journal Entries of the company", "قيود يومية مسودة للشركة"], doctype: "Journal Entry", filters: [co(c), DRAFT], measure: "total_debit", tone: "risk" },
      { id: "pcv", label: ["Period closing vouchers", "سندات إقفال الفترة"], hint: ["Submitted closing vouchers", "سندات إقفال معتمدة"], doctype: "Period Closing Voucher", filters: [co(c), SUB], tone: "info" },
      { id: "cc", label: ["Cost centers in use", "مراكز تكلفة مستخدمة"], hint: ["Non-group cost centers", "مراكز تكلفة فرعية"], doctype: "Cost Center", filters: [co(c), ["is_group", "=", 0]], tone: "info" },
    ],
    queues: (c) => [
      { id: "je-draft", label: ["Draft entries to resolve before close", "قيود مسودة يجب معالجتها قبل الإقفال"], doctype: "Journal Entry", filters: [co(c), DRAFT], date: "posting_date", amount: "total_debit", order: "asc", action: ["Submit or cancel", "اعتماد أو إلغاء"], severity: "high" },
    ],
    charts: (c) => [
      { id: "je-month", label: ["Posted journal entries by month", "القيود المرحّلة حسب الشهر"], kind: "month", doctype: "Journal Entry", filters: [co(c), SUB], field: "posting_date", measure: "total_debit" },
      { id: "acc-root", label: ["Ledger accounts by root type", "حسابات الأستاذ حسب النوع الرئيسي"], kind: "field", doctype: "Account", filters: [co(c), ["is_group", "=", 0]], field: "root_type" },
    ],
    flow: [["Transactions posted to GL", "ترحيل المعاملات إلى الأستاذ"], ["Trial balance and statements reviewed", "مراجعة ميزان المراجعة والقوائم"], ["Close blockers cleared", "معالجة معوقات الإقفال"], ["Period Closing Voucher / Accounting Period lock", "سند إقفال الفترة / قفل الفترة المحاسبية"]],
    guards: [["Statements and variances are read from posted GL rows only.", "القوائم والانحرافات تُقرأ من قيود الأستاذ المرحّلة فقط."], ["Budget comparisons appear only when approved budgets exist.", "مقارنات الموازنة تظهر فقط عند وجود موازنات معتمدة."]],
    scope: [["Company", "الشركة"], ["Fiscal year", "السنة المالية"], ["Comparison period", "فترة المقارنة"], ["Account / cost center", "الحساب / مركز التكلفة"]],
    extra: ["close"],
  },
  "SEL-SALES": {
    id: "SEL-SALES", role: ["Sales manager · Sales coordinator", "مدير المبيعات · منسق المبيعات"],
    purpose: ["Move quotations to confirmed orders and keep the order book current.", "تحويل العروض إلى طلبات مؤكدة وإبقاء دفتر الطلبات محدثًا."],
    questions: ["Which quotes are open or expiring, and which orders still need confirmation or delivery?", "ما العروض المفتوحة أو القريبة من الانتهاء، وما الطلبات التي تحتاج تأكيدًا أو تسليمًا؟"],
    docs: [
      { doctype: "Quotation", owner: "selling", role: ["Customer quotations", "عروض أسعار العملاء"], date: "transaction_date", company: true, create: true },
      { doctype: "Sales Order", owner: "selling", role: ["Confirmed customer orders", "طلبات العملاء المؤكدة"], date: "transaction_date", company: true, create: true },
      { doctype: "Customer", owner: "selling", role: ["Customers", "العملاء"] },
      { doctype: "Item", owner: "inventory", role: ["Items sold", "الأصناف المباعة"] },
    ],
    kpis: (c) => [
      { id: "q-open", label: ["Open quotations", "عروض أسعار مفتوحة"], hint: ["Submitted · Open, Replied or Partially Ordered", "معتمدة · مفتوحة أو تم الرد أو طُلبت جزئيًا"], doctype: "Quotation", filters: [co(c), SUB, ["status", "in", OPEN_QTN]], measure: "grand_total", tone: "info" },
      { id: "q-exp", label: ["Quotations expiring in 7 days", "عروض تنتهي خلال 7 أيام"], hint: ["Open, validity date within the next 7 days", "مفتوحة وتاريخ الصلاحية خلال 7 أيام"], doctype: "Quotation", filters: [co(c), SUB, ["status", "in", OPEN_QTN], between("valid_till", c.asOf, c.d7)], measure: "grand_total", tone: "action" },
      { id: "q-lapsed", label: ["Open quotations past validity", "عروض مفتوحة تجاوزت الصلاحية"], hint: ["Open, validity date before the as-of date", "مفتوحة وتاريخ الصلاحية قبل تاريخ التقرير"], doctype: "Quotation", filters: [co(c), SUB, ["status", "in", OPEN_QTN], ["valid_till", "<", c.asOf]], measure: "grand_total", tone: "risk" },
      { id: "so-deliver", label: ["Orders to deliver", "طلبات بانتظار التسليم"], hint: ["Submitted · To Deliver (and Bill)", "معتمدة · بانتظار التسليم"], doctype: "Sales Order", filters: [co(c), SUB, ["status", "in", SO_DELIVER]], measure: "grand_total", tone: "action" },
    ],
    queues: (c) => [
      { id: "q-follow", label: ["Open quotations by validity date", "العروض المفتوحة حسب تاريخ الصلاحية"], doctype: "Quotation", filters: [co(c), SUB, ["status", "in", OPEN_QTN]], date: "valid_till", party: "party_name", amount: "grand_total", order: "asc", action: ["Follow up or convert to order", "متابعة أو تحويل إلى طلب"], severity: "high", overdueFrom: c.asOf },
      { id: "so-draft", label: ["Draft sales orders to confirm", "طلبات بيع مسودة للتأكيد"], doctype: "Sales Order", filters: [co(c), DRAFT], date: "transaction_date", party: "customer", amount: "grand_total", order: "asc", action: ["Confirm and submit", "تأكيد واعتماد"], severity: "medium" },
    ],
    charts: (c) => [
      { id: "q-status", label: ["Quotations by status", "عروض الأسعار حسب الحالة"], kind: "field", doctype: "Quotation", filters: [co(c), NOT_CANCELLED], field: "status" },
      { id: "so-month", label: ["Sales orders by month (value)", "طلبات البيع حسب الشهر (القيمة)"], kind: "month", doctype: "Sales Order", filters: [co(c), SUB], field: "transaction_date", measure: "grand_total" },
    ],
    flow: [["Quotation", "عرض السعر"], ["Sales Order", "طلب البيع"], ["Delivery Note", "إذن التسليم"], ["Sales Invoice", "فاتورة المبيعات"]],
    guards: [["Conversion is shown from document status and links only — no estimated conversion rate.", "يظهر التحويل من حالة المستندات وروابطها فقط — بدون نسب تحويل تقديرية."]],
    scope: [["Company", "الشركة"], ["Customer", "العميل"], ["Date", "التاريخ"], ["Status", "الحالة"]],
  },
  "SEL-CUSTOMER": {
    id: "SEL-CUSTOMER", role: ["Sales manager · Pricing analyst", "مدير المبيعات · محلل التسعير"],
    purpose: ["Know which customers drive revenue and keep price lists and pricing rules in order.", "معرفة العملاء المحركين للإيرادات وضبط قوائم الأسعار وقواعد التسعير."],
    questions: ["Who are our largest customers, how concentrated is revenue and which prices need attention?", "من أكبر عملائنا، وما مدى تركز الإيرادات، وأي الأسعار تحتاج متابعة؟"],
    docs: [
      { doctype: "Customer", owner: "selling", role: ["Customer master", "بيانات العملاء"], create: true },
      { doctype: "Customer Group", owner: "selling", role: ["Customer groups", "مجموعات العملاء"] },
      { doctype: "Item Price", owner: "selling", role: ["Price list rates", "أسعار قوائم الأسعار"], create: true },
      { doctype: "Pricing Rule", owner: "selling", role: ["Discount and pricing rules", "قواعد الخصم والتسعير"], create: true },
      { doctype: "Price List", owner: "selling", role: ["Price lists", "قوائم الأسعار"] },
      { doctype: "Contact", owner: "selling", role: ["Customer contacts", "جهات اتصال العملاء"] },
      { doctype: "Sales Order", owner: "selling", role: ["Customer orders", "طلبات العملاء"], date: "transaction_date", company: true },
      { doctype: "Sales Invoice", owner: "selling", role: ["Customer invoices and balances", "فواتير العملاء وأرصدتهم"], date: "posting_date", company: true },
    ],
    kpis: (c) => [
      { id: "cust-active", label: ["Active customers", "عملاء نشطون"], hint: ["Customer · not disabled", "عميل غير معطل"], doctype: "Customer", filters: [["disabled", "=", 0]], tone: "info" },
      { id: "cust-off", label: ["Disabled customers", "عملاء معطلون"], hint: ["Customer · disabled", "عميل معطل"], doctype: "Customer", filters: [["disabled", "=", 1]], tone: "info" },
      { id: "ip-sell", label: ["Selling price entries", "أسعار بيع مسجلة"], hint: ["Item Price · selling", "سعر صنف · بيع"], doctype: "Item Price", filters: [["selling", "=", 1]], tone: "info" },
      { id: "ip-exp", label: ["Prices expiring in 30 days", "أسعار تنتهي خلال 30 يومًا"], hint: ["Item Price · valid-up-to date within 30 days", "سعر صنف · صالح حتى خلال 30 يومًا"], doctype: "Item Price", filters: [["selling", "=", 1], between("valid_upto", c.asOf, c.d30)], tone: "action" },
    ],
    queues: (c) => [
      { id: "ip-exp", label: ["Selling prices about to expire", "أسعار بيع على وشك الانتهاء"], doctype: "Item Price", filters: [["selling", "=", 1], between("valid_upto", c.asOf, c.d30)], date: "valid_upto", party: "item_code", amount: "price_list_rate", order: "asc", action: ["Renew or update the price", "تجديد أو تحديث السعر"], severity: "medium" },
    ],
    charts: () => [
      { id: "cust-group", label: ["Customers by group", "العملاء حسب المجموعة"], kind: "field", doctype: "Customer", filters: [["disabled", "=", 0]], field: "customer_group" },
    ],
    flow: [["Customer and price list", "العميل وقائمة الأسعار"], ["Pricing rules applied on quotations and orders", "تطبيق قواعد التسعير على العروض والطلبات"], ["Submitted Sales Invoices", "فواتير مبيعات معتمدة"], ["Customer contribution and concentration", "مساهمة العملاء وتركز الإيرادات"]],
    guards: [["Contribution uses submitted, non-return Sales Invoices of the period, per currency — no customer score is invented.", "المساهمة من فواتير المبيعات المعتمدة غير المرتجعة للفترة لكل عملة — بدون تقييم عملاء مخترع."]],
    scope: [["Company", "الشركة"], ["Customer group", "مجموعة العملاء"], ["Period", "الفترة"], ["Price list", "قائمة الأسعار"]],
    extra: ["customer-mix"],
  },
  "SEL-FULFILL": {
    id: "SEL-FULFILL", role: ["Fulfilment coordinator · Billing clerk", "منسق التسليم · موظف الفوترة"],
    purpose: ["Deliver confirmed orders on time and bill everything that was delivered.", "تسليم الطلبات المؤكدة في موعدها وفوترة كل ما تم تسليمه."],
    questions: ["What is due for delivery, what is late, and what was delivered but not yet invoiced?", "ما المستحق للتسليم، وما المتأخر، وما الذي سُلّم ولم يُفوتر بعد؟"],
    docs: [
      { doctype: "Sales Order", owner: "selling", role: ["Orders to fulfil", "طلبات للتنفيذ"], date: "delivery_date", company: true },
      { doctype: "Delivery Note", owner: "selling", role: ["Deliveries and returns", "التسليمات والمرتجعات"], date: "posting_date", company: true, create: true },
      { doctype: "Sales Invoice", owner: "selling", role: ["Customer invoices", "فواتير العملاء"], date: "posting_date", company: true, create: true },
      { doctype: "Pick List", owner: "inventory", role: ["Warehouse picking", "التجهيز في المستودع"], company: true },
    ],
    kpis: (c) => [
      { id: "so-deliver", label: ["Orders to deliver", "طلبات بانتظار التسليم"], hint: ["Submitted · To Deliver (and Bill)", "معتمدة · بانتظار التسليم"], doctype: "Sales Order", filters: [co(c), SUB, ["status", "in", SO_DELIVER]], measure: "grand_total", tone: "action" },
      { id: "so-late", label: ["Late deliveries", "تسليمات متأخرة"], hint: ["To deliver, delivery date before the as-of date", "بانتظار التسليم وتاريخ التسليم قبل تاريخ التقرير"], doctype: "Sales Order", filters: [co(c), SUB, ["status", "in", SO_DELIVER], ["delivery_date", "<", c.asOf]], measure: "grand_total", tone: "risk" },
      { id: "dn-bill", label: ["Delivered, not billed", "مُسلّم غير مفوتر"], hint: ["Delivery Note · To Bill or Partially Billed", "إذن تسليم · بانتظار الفوترة أو مفوتر جزئيًا"], doctype: "Delivery Note", filters: [co(c), SUB, ["status", "in", ["To Bill", "Partially Billed"]]], measure: "grand_total", tone: "action" },
      { id: "dn-ret", label: ["Sales returns", "مرتجعات المبيعات"], hint: ["Delivery Note · returns", "إذن تسليم مرتجع"], doctype: "Delivery Note", filters: [co(c), SUB, ["is_return", "=", 1]], measure: "grand_total", tone: "info" },
    ],
    queues: (c) => [
      { id: "so-late", label: ["Orders by delivery date", "الطلبات حسب تاريخ التسليم"], doctype: "Sales Order", filters: [co(c), SUB, ["status", "in", SO_DELIVER]], date: "delivery_date", party: "customer", amount: "grand_total", order: "asc", action: ["Create Delivery Note", "إنشاء إذن تسليم"], severity: "high", overdueFrom: c.asOf },
      { id: "dn-bill", label: ["Delivery notes to invoice", "أذون تسليم للفوترة"], doctype: "Delivery Note", filters: [co(c), SUB, ["status", "in", ["To Bill", "Partially Billed"]]], date: "posting_date", party: "customer", amount: "grand_total", order: "asc", action: ["Create Sales Invoice", "إنشاء فاتورة مبيعات"], severity: "medium" },
    ],
    charts: (c) => [
      { id: "so-status", label: ["Sales orders by status", "طلبات البيع حسب الحالة"], kind: "field", doctype: "Sales Order", filters: [co(c), SUB], field: "status" },
      { id: "dn-month", label: ["Deliveries by month", "التسليمات حسب الشهر"], kind: "month", doctype: "Delivery Note", filters: [co(c), SUB], field: "posting_date", measure: "grand_total" },
    ],
    flow: [["Sales Order", "طلب البيع"], ["Pick List / Delivery Note (stock out)", "قائمة التجهيز / إذن التسليم (صرف مخزون)"], ["Sales Invoice", "فاتورة المبيعات"], ["Payment Entry (receipt)", "سند القبض"]],
    guards: [["Delivered and billed progress comes from native per_delivered / per_billed and document status.", "تقدم التسليم والفوترة من نسب التسليم والفوترة الأصلية وحالة المستند."]],
    scope: [["Company", "الشركة"], ["Customer", "العميل"], ["Delivery date", "تاريخ التسليم"], ["Billing status", "حالة الفوترة"]],
    extra: ["sel-fulfil"],
  },
  "SEL-INTEL": {
    id: "SEL-INTEL", role: ["Sales director · Credit controller", "مدير المبيعات · مراقب الائتمان"],
    purpose: ["Track invoiced sales, collections and overdue balances by customer.", "متابعة المبيعات المفوترة والتحصيل والأرصدة المتأخرة حسب العميل."],
    questions: ["How are invoiced sales trending, how much is overdue and what was collected?", "كيف تتجه المبيعات المفوترة، وكم المتأخر، وكم تم تحصيله؟"],
    docs: [
      { doctype: "Sales Invoice", owner: "selling", role: ["Customer invoices", "فواتير العملاء"], date: "posting_date", company: true, create: true },
      { doctype: "Payment Entry", owner: "accounting", role: ["Customer receipts", "مقبوضات العملاء"], date: "posting_date", company: true },
      { doctype: "Customer", owner: "selling", role: ["Customers", "العملاء"] },
      { doctype: "Dunning", owner: "accounting", role: ["Payment reminders", "خطابات المطالبة"], date: "posting_date", company: true },
      { doctype: "Item", owner: "inventory", role: ["Items on the analysed sales lines", "الأصناف في بنود المبيعات المحللة"] },
    ],
    kpis: (c) => [
      { id: "si-90", label: ["Invoiced — last 90 days", "المفوتر — آخر 90 يومًا"], hint: ["Submitted, non-return Sales Invoices", "فواتير مبيعات معتمدة غير مرتجعة"], doctype: "Sales Invoice", filters: [co(c), SUB, ["is_return", "=", 0], between("posting_date", c.from90, c.asOf)], measure: "grand_total", tone: "info" },
      { id: "si-overdue", label: ["Overdue invoices", "فواتير متأخرة السداد"], hint: ["outstanding amount above zero and due date before the as-of date", "رصيد قائم وتاريخ الاستحقاق قبل تاريخ التقرير"], doctype: "Sales Invoice", filters: [co(c), SUB, ["outstanding_amount", ">", 0], ["due_date", "<", c.asOf]], measure: "outstanding_amount", tone: "risk" },
      { id: "pe-in", label: ["Collected — last 90 days", "المحصّل — آخر 90 يومًا"], hint: ["Payment Entry · Receive · Customer", "سند قبض من عميل"], doctype: "Payment Entry", filters: [co(c), SUB, ["payment_type", "=", "Receive"], ["party_type", "=", "Customer"], between("posting_date", c.from90, c.asOf)], measure: "received_amount", cur: "paid_to_account_currency", tone: "info" },
      { id: "si-draft", label: ["Draft invoices", "فواتير مسودة"], hint: ["Sales Invoice · Draft", "فاتورة مبيعات مسودة"], doctype: "Sales Invoice", filters: [co(c), DRAFT], measure: "grand_total", tone: "action" },
    ],
    queues: (c) => [
      { id: "si-overdue", label: ["Overdue invoices to collect", "فواتير متأخرة للتحصيل"], doctype: "Sales Invoice", filters: [co(c), SUB, ["outstanding_amount", ">", 0], ["due_date", "<", c.asOf]], date: "due_date", party: "customer", amount: "outstanding_amount", order: "asc", action: ["Follow up · record payment", "متابعة · تسجيل الدفعة"], severity: "high", overdueFrom: c.asOf },
    ],
    charts: (c) => [
      { id: "si-month", label: ["Invoiced sales by month", "المبيعات المفوترة حسب الشهر"], kind: "month", doctype: "Sales Invoice", filters: [co(c), SUB, ["is_return", "=", 0]], field: "posting_date", measure: "grand_total" },
      { id: "pe-month", label: ["Customer receipts by month", "مقبوضات العملاء حسب الشهر"], kind: "month", doctype: "Payment Entry", filters: [co(c), SUB, ["payment_type", "=", "Receive"]], field: "posting_date", measure: "received_amount", cur: "paid_to_account_currency" },
    ],
    flow: [["Sales Invoice submitted", "اعتماد فاتورة المبيعات"], ["Due date passes", "مرور تاريخ الاستحقاق"], ["Dunning / follow-up", "مطالبة / متابعة"], ["Payment Entry received and allocated", "استلام سند القبض وتخصيصه"]],
    guards: [["Invoiced sales and collected cash are separate series — collections are not revenue.", "المبيعات المفوترة والنقد المحصّل سلسلتان منفصلتان — التحصيل ليس إيرادًا."], ["Gross profit is shown only where historical costs are verified.", "مجمل الربح يظهر فقط عند التحقق من التكاليف التاريخية."]],
    scope: [["Company", "الشركة"], ["Period", "الفترة"], ["Customer", "العميل"], ["Outstanding state", "حالة الرصيد"]],
    extra: ["sel-intel"],
  },
  "PUR-SOURCE": {
    id: "PUR-SOURCE", role: ["Buyer · Procurement officer", "المشتري · مسؤول المشتريات"],
    purpose: ["Turn material requests into competitive supplier quotations.", "تحويل طلبات المواد إلى عروض موردين تنافسية."],
    questions: ["Which requests still need sourcing, which RFQs are out and which offers can be compared?", "ما الطلبات التي تحتاج توريدًا، وما طلبات العروض المرسلة، وأي العروض قابلة للمقارنة؟"],
    docs: [
      { doctype: "Material Request", owner: "purchasing", role: ["Internal purchase requests", "طلبات الشراء الداخلية"], date: "transaction_date", company: true, create: true },
      { doctype: "Request for Quotation", owner: "purchasing", role: ["Requests sent to suppliers", "طلبات العروض المرسلة للموردين"], date: "transaction_date", company: true, create: true },
      { doctype: "Supplier Quotation", owner: "purchasing", role: ["Supplier offers", "عروض الموردين"], date: "transaction_date", company: true, create: true },
      { doctype: "Supplier", owner: "purchasing", role: ["Suppliers", "الموردون"] },
      { doctype: "Purchase Order", owner: "purchasing", role: ["Orders created from awarded quotations", "أوامر الشراء الناتجة عن العروض المرساة"], date: "transaction_date", company: true },
    ],
    kpis: (c) => [
      { id: "mr-open", label: ["Requests awaiting sourcing", "طلبات بانتظار التوريد"], hint: ["Purchase type · Pending or Partially Ordered", "نوع شراء · معلقة أو طُلبت جزئيًا"], doctype: "Material Request", filters: [co(c), SUB, ["material_request_type", "=", "Purchase"], ["status", "in", ["Pending", "Partially Ordered"]]], tone: "action" },
      { id: "mr-late", label: ["Requests past required date", "طلبات تجاوزت تاريخ الحاجة"], hint: ["Awaiting sourcing, required-by date before the as-of date", "بانتظار التوريد وتاريخ الحاجة قبل تاريخ التقرير"], doctype: "Material Request", filters: [co(c), SUB, ["material_request_type", "=", "Purchase"], ["status", "in", ["Pending", "Partially Ordered"]], ["schedule_date", "<", c.asOf]], tone: "risk" },
      { id: "rfq", label: ["RFQs sent", "طلبات عروض مرسلة"], hint: ["Request for Quotation · submitted", "طلب عرض سعر معتمد"], doctype: "Request for Quotation", filters: [co(c), SUB], tone: "info" },
      { id: "sq", label: ["Supplier offers to compare", "عروض موردين للمقارنة"], hint: ["Supplier Quotation · Submitted", "عرض مورد · معتمد"], doctype: "Supplier Quotation", filters: [co(c), SUB, ["status", "=", "Submitted"]], measure: "grand_total", tone: "action" },
    ],
    queues: (c) => [
      { id: "mr-open", label: ["Requests by required date", "الطلبات حسب تاريخ الحاجة"], doctype: "Material Request", filters: [co(c), SUB, ["material_request_type", "=", "Purchase"], ["status", "in", ["Pending", "Partially Ordered"]]], date: "schedule_date", order: "asc", action: ["Create RFQ or Purchase Order", "إنشاء طلب عرض أو أمر شراء"], severity: "high", overdueFrom: c.asOf },
      { id: "mr-draft", label: ["Draft requests", "طلبات مسودة"], doctype: "Material Request", filters: [co(c), DRAFT], date: "transaction_date", order: "asc", action: ["Complete and submit", "إكمال واعتماد"], severity: "low" },
    ],
    charts: (c) => [
      { id: "mr-status", label: ["Material requests by status", "طلبات المواد حسب الحالة"], kind: "field", doctype: "Material Request", filters: [co(c), NOT_CANCELLED], field: "status" },
      { id: "sq-month", label: ["Supplier offers by month (value)", "عروض الموردين حسب الشهر (القيمة)"], kind: "month", doctype: "Supplier Quotation", filters: [co(c), SUB], field: "transaction_date", measure: "grand_total" },
    ],
    flow: [["Material Request", "طلب المواد"], ["Request for Quotation", "طلب عرض السعر"], ["Supplier Quotation", "عرض المورد"], ["Purchase Order", "أمر الشراء"]],
    guards: [["Offers are compared only when item, UOM and currency are comparable.", "تُقارن العروض فقط عند تطابق الصنف ووحدة القياس والعملة."]],
    scope: [["Company", "الشركة"], ["Required date", "تاريخ الحاجة"], ["Supplier", "المورد"], ["Status", "الحالة"]],
    extra: ["pur-quotes"],
  },
  "PUR-ORDERS": {
    id: "PUR-ORDERS", role: ["Buyer · Procurement manager", "المشتري · مدير المشتريات"],
    purpose: ["Follow open purchase commitments until goods arrive.", "متابعة التزامات الشراء المفتوحة حتى وصول البضاعة."],
    questions: ["What is still to be received, what is late and what arrives in the next 30 days?", "ما المتبقي للاستلام، وما المتأخر، وما الذي يصل خلال 30 يومًا؟"],
    docs: [
      { doctype: "Purchase Order", owner: "purchasing", role: ["Purchase orders", "أوامر الشراء"], date: "transaction_date", company: true, create: true },
      { doctype: "Purchase Receipt", owner: "purchasing", role: ["Goods received", "البضائع المستلمة"], date: "posting_date", company: true },
      { doctype: "Supplier", owner: "purchasing", role: ["Suppliers", "الموردون"] },
      { doctype: "Blanket Order", owner: "purchasing", role: ["Framework agreements", "الاتفاقيات الإطارية"], company: true },
    ],
    kpis: (c) => [
      { id: "po-open", label: ["Orders to receive", "أوامر بانتظار الاستلام"], hint: ["Submitted · To Receive (and Bill)", "معتمدة · بانتظار الاستلام"], doctype: "Purchase Order", filters: [co(c), SUB, ["status", "in", PO_RECEIVE]], measure: "grand_total", tone: "action" },
      { id: "po-late", label: ["Late orders", "أوامر متأخرة"], hint: ["To receive, required-by date before the as-of date", "بانتظار الاستلام وتاريخ الاستلام المطلوب قبل تاريخ التقرير"], doctype: "Purchase Order", filters: [co(c), SUB, ["status", "in", PO_RECEIVE], ["schedule_date", "<", c.asOf]], measure: "grand_total", tone: "risk" },
      { id: "po-30", label: ["Expected in 30 days", "متوقع خلال 30 يومًا"], hint: ["To receive, required-by date within 30 days", "بانتظار الاستلام خلال 30 يومًا"], doctype: "Purchase Order", filters: [co(c), SUB, ["status", "in", PO_RECEIVE], between("schedule_date", c.asOf, c.d30)], measure: "grand_total", tone: "info" },
      { id: "po-draft", label: ["Draft purchase orders", "أوامر شراء مسودة"], hint: ["Purchase Order · Draft", "أمر شراء مسودة"], doctype: "Purchase Order", filters: [co(c), DRAFT], measure: "grand_total", tone: "action" },
    ],
    queues: (c) => [
      { id: "po-open", label: ["Open orders by expected date", "الأوامر المفتوحة حسب تاريخ الاستلام"], doctype: "Purchase Order", filters: [co(c), SUB, ["status", "in", PO_RECEIVE]], date: "schedule_date", party: "supplier", amount: "grand_total", order: "asc", action: ["Expedite or create Purchase Receipt", "متابعة المورد أو إنشاء إيصال استلام"], severity: "high", overdueFrom: c.asOf },
      { id: "po-draft", label: ["Draft orders to approve", "أوامر مسودة للاعتماد"], doctype: "Purchase Order", filters: [co(c), DRAFT], date: "transaction_date", party: "supplier", amount: "grand_total", order: "asc", action: ["Approve and submit", "اعتماد وإرسال"], severity: "medium" },
    ],
    charts: (c) => [
      { id: "po-status", label: ["Purchase orders by status", "أوامر الشراء حسب الحالة"], kind: "field", doctype: "Purchase Order", filters: [co(c), NOT_CANCELLED], field: "status" },
      { id: "po-month", label: ["Purchase orders by month (value)", "أوامر الشراء حسب الشهر (القيمة)"], kind: "month", doctype: "Purchase Order", filters: [co(c), SUB], field: "transaction_date", measure: "grand_total" },
    ],
    flow: [["Purchase Order", "أمر الشراء"], ["Purchase Receipt", "إيصال الاستلام"], ["Purchase Invoice", "فاتورة المشتريات"], ["Payment Entry (payment)", "سند الصرف"]],
    guards: [["Open commitments are orders, not payables — they never join the AP balance.", "الالتزامات المفتوحة أوامر وليست ذممًا دائنة — لا تُضاف إلى رصيد الموردين."]],
    scope: [["Company", "الشركة"], ["Supplier", "المورد"], ["Expected date", "تاريخ الاستلام المتوقع"], ["Status", "الحالة"]],
    extra: ["pur-orders"],
  },
  "PUR-RECEIVE": {
    id: "PUR-RECEIVE", role: ["Receiving clerk · AP accountant", "موظف الاستلام · محاسب الموردين"],
    purpose: ["Match goods received with supplier invoices and prepare them for payment.", "مطابقة البضائع المستلمة مع فواتير الموردين وتجهيزها للسداد."],
    questions: ["What was received but not invoiced, which invoices are due and which are on hold?", "ما المستلم غير المفوتر، وما الفواتير المستحقة، وأيها موقوف؟"],
    docs: [
      { doctype: "Purchase Receipt", owner: "purchasing", role: ["Goods received", "البضائع المستلمة"], date: "posting_date", company: true, create: true },
      { doctype: "Purchase Invoice", owner: "purchasing", role: ["Supplier invoices", "فواتير الموردين"], date: "posting_date", company: true, create: true },
      { doctype: "Purchase Order", owner: "purchasing", role: ["Source orders", "أوامر المصدر"], date: "transaction_date", company: true },
      { doctype: "Payment Entry", owner: "accounting", role: ["Supplier payments", "مدفوعات الموردين"], date: "posting_date", company: true },
      { doctype: "Landed Cost Voucher", owner: "purchasing", role: ["Landed costs", "تكاليف الشحن والاستيراد"], company: true },
    ],
    kpis: (c) => [
      { id: "pr-bill", label: ["Received, not invoiced", "مستلم غير مفوتر"], hint: ["Purchase Receipt · To Bill or Partly Billed", "إيصال استلام · بانتظار الفوترة أو مفوتر جزئيًا"], doctype: "Purchase Receipt", filters: [co(c), SUB, ["status", "in", ["To Bill", "Partly Billed"]]], measure: "grand_total", tone: "action" },
      { id: "pi-due", label: ["Invoices to pay", "فواتير للسداد"], hint: ["outstanding amount above zero", "رصيد قائم أكبر من صفر"], doctype: "Purchase Invoice", filters: [co(c), SUB, ["outstanding_amount", ">", 0]], measure: "outstanding_amount", tone: "info" },
      { id: "pi-overdue", label: ["Overdue supplier invoices", "فواتير موردين متأخرة"], hint: ["Outstanding and due date before the as-of date", "رصيد قائم وتاريخ الاستحقاق قبل تاريخ التقرير"], doctype: "Purchase Invoice", filters: [co(c), SUB, ["outstanding_amount", ">", 0], ["due_date", "<", c.asOf]], measure: "outstanding_amount", tone: "risk" },
      { id: "pi-hold", label: ["Invoices on hold", "فواتير موقوفة"], hint: ["Purchase Invoice · on hold", "فاتورة مشتريات موقوفة"], doctype: "Purchase Invoice", filters: [co(c), SUB, ["on_hold", "=", 1]], measure: "outstanding_amount", tone: "action" },
    ],
    queues: (c) => [
      { id: "pr-bill", label: ["Receipts to invoice", "إيصالات للفوترة"], doctype: "Purchase Receipt", filters: [co(c), SUB, ["status", "in", ["To Bill", "Partly Billed"]]], date: "posting_date", party: "supplier", amount: "grand_total", order: "asc", action: ["Create Purchase Invoice", "إنشاء فاتورة مشتريات"], severity: "high" },
      { id: "pi-overdue", label: ["Overdue supplier invoices", "فواتير موردين متأخرة"], doctype: "Purchase Invoice", filters: [co(c), SUB, ["outstanding_amount", ">", 0], ["due_date", "<", c.asOf]], date: "due_date", party: "supplier", amount: "outstanding_amount", order: "asc", action: ["Schedule payment", "جدولة السداد"], severity: "medium", overdueFrom: c.asOf },
    ],
    charts: (c) => [
      { id: "pr-status", label: ["Purchase receipts by status", "إيصالات الاستلام حسب الحالة"], kind: "field", doctype: "Purchase Receipt", filters: [co(c), SUB], field: "status" },
      { id: "pi-status", label: ["Purchase invoices by status", "فواتير المشتريات حسب الحالة"], kind: "field", doctype: "Purchase Invoice", filters: [co(c), SUB], field: "status" },
    ],
    flow: [["Purchase Order", "أمر الشراء"], ["Purchase Receipt (stock in)", "إيصال الاستلام (إدخال مخزون)"], ["Purchase Invoice (liability)", "فاتورة المشتريات (التزام)"], ["Payment Entry (payment)", "سند الصرف"]],
    guards: [["Payment is not offered for invoices on hold — the native document refuses it.", "لا يُعرض السداد للفواتير الموقوفة — المستند الأصلي يرفضه."], ["Line-level receipt matching uses native item references only.", "مطابقة البنود تعتمد مراجع البنود الأصلية فقط."]],
    scope: [["Company", "الشركة"], ["Supplier", "المورد"], ["Posting / due date", "تاريخ الترحيل / الاستحقاق"], ["Billing status", "حالة الفوترة"]],
    extra: ["pur-receive"],
  },
  "PUR-SUPPLIER": {
    id: "PUR-SUPPLIER", role: ["Procurement manager · Category manager", "مدير المشتريات · مدير الفئة"],
    purpose: ["Evaluate suppliers on spend, delivery reliability and concentration.", "تقييم الموردين حسب الإنفاق والالتزام بالتسليم والتركز."],
    questions: ["Where do we spend, which suppliers deliver late and how dependent are we on a few?", "أين ننفق، وأي الموردين يتأخرون، وما مدى اعتمادنا على عدد قليل منهم؟"],
    docs: [
      { doctype: "Supplier", owner: "purchasing", role: ["Supplier master", "بيانات الموردين"], create: true },
      { doctype: "Supplier Group", owner: "purchasing", role: ["Supplier groups", "مجموعات الموردين"] },
      { doctype: "Supplier Scorecard", owner: "purchasing", role: ["Scorecards", "بطاقات التقييم"] },
      { doctype: "Purchase Order", owner: "purchasing", role: ["Orders", "الأوامر"], date: "transaction_date", company: true },
      { doctype: "Purchase Invoice", owner: "purchasing", role: ["Invoices", "الفواتير"], date: "posting_date", company: true },
      { doctype: "Purchase Receipt", owner: "inventory", role: ["Receipts behind delivery performance", "الاستلامات التي يُقاس بها أداء التوريد"], date: "posting_date", company: true },
    ],
    kpis: (c) => [
      { id: "sup-active", label: ["Active suppliers", "موردون نشطون"], hint: ["Supplier · not disabled", "مورد غير معطل"], doctype: "Supplier", filters: [["disabled", "=", 0]], tone: "info" },
      { id: "sup-hold", label: ["Suppliers on hold", "موردون موقوفون"], hint: ["Supplier · on hold", "مورد موقوف"], doctype: "Supplier", filters: [["on_hold", "=", 1]], tone: "risk" },
      { id: "pi-12", label: ["Invoiced spend — 12 months", "الإنفاق المفوتر — 12 شهرًا"], hint: ["Submitted, non-return Purchase Invoices", "فواتير مشتريات معتمدة غير مرتجعة"], doctype: "Purchase Invoice", filters: [co(c), SUB, ["is_return", "=", 0], between("posting_date", c.from12, c.asOf)], measure: "grand_total", tone: "info" },
    ],
    queues: (c) => [
      { id: "po-late", label: ["Late supplier deliveries", "تأخر تسليم الموردين"], doctype: "Purchase Order", filters: [co(c), SUB, ["status", "in", PO_RECEIVE], ["schedule_date", "<", c.asOf]], date: "schedule_date", party: "supplier", amount: "grand_total", order: "asc", action: ["Contact the supplier", "التواصل مع المورد"], severity: "high", overdueFrom: c.asOf },
    ],
    charts: () => [
      { id: "sup-group", label: ["Suppliers by group", "الموردون حسب المجموعة"], kind: "field", doctype: "Supplier", filters: [["disabled", "=", 0]], field: "supplier_group" },
    ],
    flow: [["Supplier onboarding", "تسجيل المورد"], ["Orders and receipts", "الأوامر والاستلامات"], ["Promised vs actual receipt date", "تاريخ الاستلام الموعود مقابل الفعلي"], ["Spend and reliability review", "مراجعة الإنفاق والالتزام"]],
    guards: [["Reliability counts only receipt lines linked to a PO with a promised date; unsupported lines are excluded and counted.", "الالتزام يحسب فقط بنود الاستلام المرتبطة بأمر شراء له تاريخ موعود؛ البنود غير المدعومة تُستبعد وتُعد."]],
    scope: [["Company", "الشركة"], ["Supplier / group", "المورد / المجموعة"], ["Period", "الفترة"]],
    extra: ["supplier"],
  },
  "INV-MASTER": {
    id: "INV-MASTER", role: ["Inventory controller · Warehouse manager", "مراقب المخزون · مدير المستودع"],
    purpose: ["Keep item and warehouse masters clean and see where stock is exposed.", "ضبط بيانات الأصناف والمستودعات ومعرفة مواضع تعرض المخزون."],
    questions: ["Which items are active, where is stock held and which items are short?", "ما الأصناف النشطة، وأين يُحتفظ بالمخزون، وما الأصناف الناقصة؟"],
    docs: [
      { doctype: "Item", owner: "inventory", role: ["Item master", "بيانات الأصناف"], create: true },
      { doctype: "Item Group", owner: "inventory", role: ["Item groups", "مجموعات الأصناف"] },
      { doctype: "Warehouse", owner: "inventory", role: ["Warehouses", "المستودعات"], company: true },
      { doctype: "Bin", owner: "inventory", role: ["Quantity per item and warehouse (read-only)", "الكمية لكل صنف ومستودع (للقراءة)"] },
      { doctype: "UOM", owner: "inventory", role: ["Units of measure", "وحدات القياس"] },
      { doctype: "Stock Ledger Entry", owner: "inventory", role: ["Posted stock movements behind every balance (read-only)", "حركات المخزون المرحّلة خلف كل رصيد (للقراءة فقط)"], date: "posting_date", company: true, ledger: true },
    ],
    kpis: (c) => [
      { id: "item-stock", label: ["Active stock items", "أصناف مخزنية نشطة"], hint: ["Stock items, not disabled", "صنف مخزني غير معطل"], doctype: "Item", filters: [["is_stock_item", "=", 1], ["disabled", "=", 0]], tone: "info" },
      { id: "item-off", label: ["Disabled items", "أصناف معطلة"], hint: ["Item · disabled", "صنف معطل"], doctype: "Item", filters: [["disabled", "=", 1]], tone: "info" },
      { id: "wh", label: ["Active warehouses", "مستودعات نشطة"], hint: ["Non-group, not disabled", "مستودع فرعي غير معطل"], doctype: "Warehouse", filters: [co(c), ["is_group", "=", 0], ["disabled", "=", 0]], tone: "info" },
      { id: "bin-neg", label: ["Negative projected quantity", "كمية متوقعة سالبة"], hint: ["Bin · projected quantity below zero", "سجل الكمية · الكمية المتوقعة أقل من صفر"], doctype: "Bin", filters: [["projected_qty", "<", 0]], tone: "risk" },
    ],
    queues: () => [
      { id: "bin-neg", label: ["Items short against demand", "أصناف ناقصة مقابل الطلب"], doctype: "Bin", filters: [["projected_qty", "<", 0]], date: "modified", party: "item_code", amount: "projected_qty", order: "asc", action: ["Raise Material Request", "إنشاء طلب مواد"], severity: "high" },
    ],
    charts: () => [
      { id: "item-group", label: ["Active items by group", "الأصناف النشطة حسب المجموعة"], kind: "field", doctype: "Item", filters: [["disabled", "=", 0]], field: "item_group" },
    ],
    flow: [["Item and warehouse setup", "إعداد الصنف والمستودع"], ["Stock transactions post Stock Ledger Entries", "حركات المخزون ترحّل قيود دفتر المخزون"], ["Bin quantities update", "تحديث الكميات"], ["Stock Balance / Projected Quantity reports", "تقارير رصيد المخزون والكمية المتوقعة"]],
    guards: [["Quantities come from native Bin and Stock Ledger rows — this page never edits stock.", "الكميات من سجلات الكمية ودفتر المخزون الأصلية — هذه الصفحة لا تعدّل المخزون."]],
    scope: [["Company", "الشركة"], ["Warehouse", "المستودع"], ["Item group", "مجموعة الأصناف"]],
    extra: ["inv-heat", "stock-exposure"],
  },
  "INV-MOVE": {
    id: "INV-MOVE", role: ["Storekeeper · Inventory controller", "أمين المستودع · مراقب المخزون"],
    purpose: ["Record and review receipts, issues and transfers between warehouses.", "تسجيل ومراجعة الإدخال والصرف والتحويل بين المستودعات."],
    questions: ["What moved recently, by purpose, and which movements are still drafts?", "ما الذي تحرك مؤخرًا وحسب الغرض، وما الحركات التي ما زالت مسودة؟"],
    docs: [
      { doctype: "Stock Entry", owner: "inventory", role: ["Receipts, issues, transfers", "الإدخال والصرف والتحويل"], date: "posting_date", company: true, create: true },
      { doctype: "Purchase Receipt", owner: "purchasing", role: ["Goods received from suppliers", "بضائع مستلمة من الموردين"], date: "posting_date", company: true },
      { doctype: "Delivery Note", owner: "selling", role: ["Goods delivered to customers", "بضائع مسلّمة للعملاء"], date: "posting_date", company: true },
      { doctype: "Pick List", owner: "inventory", role: ["Picking", "التجهيز"], company: true },
      { doctype: "Serial and Batch Bundle", owner: "inventory", role: ["Batch and serial numbers carried by a movement", "أرقام الدفعات والأرقام التسلسلية في الحركة"], date: "posting_datetime", company: true },
    ],
    kpis: (c) => [
      { id: "se-draft", label: ["Draft stock entries", "حركات مخزون مسودة"], hint: ["Stock Entry · Draft", "حركة مخزون مسودة"], doctype: "Stock Entry", filters: [co(c), DRAFT], tone: "action" },
      { id: "se-in", label: ["Material receipts — 90 days", "إدخال مواد — 90 يومًا"], hint: ["Submitted · purpose Material Receipt", "معتمدة · غرض إدخال مواد"], doctype: "Stock Entry", filters: [co(c), SUB, ["purpose", "=", "Material Receipt"], between("posting_date", c.from90, c.asOf)], measure: "total_incoming_value", tone: "info" },
      { id: "se-out", label: ["Material issues — 90 days", "صرف مواد — 90 يومًا"], hint: ["Submitted · purpose Material Issue", "معتمدة · غرض صرف مواد"], doctype: "Stock Entry", filters: [co(c), SUB, ["purpose", "=", "Material Issue"], between("posting_date", c.from90, c.asOf)], measure: "total_outgoing_value", tone: "info" },
      { id: "se-tr", label: ["Transfers — 90 days", "تحويلات — 90 يومًا"], hint: ["Submitted · purpose Material Transfer", "معتمدة · غرض تحويل مواد"], doctype: "Stock Entry", filters: [co(c), SUB, ["purpose", "=", "Material Transfer"], between("posting_date", c.from90, c.asOf)], measure: "total_outgoing_value", tone: "info" },
    ],
    queues: (c) => [
      { id: "se-draft", label: ["Draft movements to post", "حركات مسودة للترحيل"], doctype: "Stock Entry", filters: [co(c), DRAFT], date: "posting_date", party: "purpose", order: "asc", action: ["Check quantities and submit", "مراجعة الكميات واعتماد"], severity: "high" },
    ],
    charts: (c) => [
      { id: "se-purpose", label: ["Posted movements by purpose — 12 months", "الحركات المرحّلة حسب الغرض — 12 شهرًا"], kind: "field", doctype: "Stock Entry", filters: [co(c), SUB, between("posting_date", c.from12, c.asOf)], field: "purpose" },
      { id: "se-month", label: ["Posted stock entries by month", "حركات المخزون المرحّلة حسب الشهر"], kind: "month", doctype: "Stock Entry", filters: [co(c), SUB], field: "posting_date" },
    ],
    flow: [["Draft Stock Entry (purpose, warehouses)", "حركة مخزون مسودة (الغرض والمستودعات)"], ["Submit — posting engine writes Stock Ledger Entries", "الاعتماد — محرك الترحيل يكتب قيود المخزون"], ["Bin quantities and valuation update", "تحديث الكميات والتقييم"], ["Stock Ledger report", "تقرير دفتر المخزون"]],
    guards: [["Stock Ledger Entries are written only by submitting the native document.", "قيود دفتر المخزون تُكتب فقط عند اعتماد المستند الأصلي."]],
    scope: [["Company", "الشركة"], ["Purpose", "الغرض"], ["Posting date", "تاريخ الترحيل"], ["Warehouse", "المستودع"]],
  },
  "INV-CONTROL": {
    id: "INV-CONTROL", role: ["Inventory auditor · Quality controller", "مدقق المخزون · مراقب الجودة"],
    purpose: ["Count stock, reconcile differences and trace batches and serial numbers.", "جرد المخزون وتسوية الفروقات وتتبع الدفعات والأرقام التسلسلية."],
    questions: ["Which counts are pending, which batches are expiring and where is each serial number?", "ما الجرد المعلق، وأي الدفعات قاربت الانتهاء، وأين كل رقم تسلسلي؟"],
    docs: [
      { doctype: "Stock Reconciliation", owner: "inventory", role: ["Stock counts and adjustments", "الجرد وتسويات المخزون"], date: "posting_date", company: true, create: true },
      { doctype: "Batch", owner: "inventory", role: ["Batches and expiry", "الدفعات والصلاحية"], create: true },
      { doctype: "Serial No", owner: "inventory", role: ["Serial numbers", "الأرقام التسلسلية"], company: true },
      { doctype: "Quality Inspection", owner: "inventory", role: ["Quality inspections", "فحوصات الجودة"], date: "report_date", company: true },
      { doctype: "Stock Entry", owner: "inventory", role: ["Adjustments and transfers after a count", "التسويات والتحويلات بعد الجرد"], date: "posting_date", company: true },
      { doctype: "Item", owner: "inventory", role: ["Items counted and traced", "الأصناف المجرودة والمتتبعة"] },
    ],
    kpis: (c) => [
      { id: "sr-draft", label: ["Draft stock counts", "جرد مسودة"], hint: ["Stock Reconciliation · Draft", "تسوية مخزون مسودة"], doctype: "Stock Reconciliation", filters: [co(c), DRAFT], tone: "action" },
      { id: "batch-exp", label: ["Batches expiring in 30 days", "دفعات تنتهي خلال 30 يومًا"], hint: ["Batch · expiry date within 30 days", "دفعة · تاريخ الانتهاء خلال 30 يومًا"], doctype: "Batch", filters: [["disabled", "=", 0], between("expiry_date", c.asOf, c.d30)], tone: "risk" },
      { id: "batch-past", label: ["Expired batches", "دفعات منتهية"], hint: ["Batch · expiry date before the as-of date", "دفعة · تاريخ الانتهاء قبل تاريخ التقرير"], doctype: "Batch", filters: [["disabled", "=", 0], ["expiry_date", "is", "set"], ["expiry_date", "<", c.asOf]], tone: "risk" },
      { id: "sn-active", label: ["Active serial numbers", "أرقام تسلسلية نشطة"], hint: ["Serial No · Active", "رقم تسلسلي نشط"], doctype: "Serial No", filters: [co(c), ["status", "=", "Active"]], tone: "info" },
    ],
    queues: (c) => [
      { id: "sr-draft", label: ["Counts to complete", "جرد بانتظار الإكمال"], doctype: "Stock Reconciliation", filters: [co(c), DRAFT], date: "posting_date", party: "purpose", order: "asc", action: ["Enter counted quantities and submit", "إدخال الكميات المعدودة واعتماد"], severity: "high" },
      { id: "batch-exp", label: ["Batches by expiry date", "الدفعات حسب تاريخ الانتهاء"], doctype: "Batch", filters: [["disabled", "=", 0], ["expiry_date", "is", "set"], ["expiry_date", "<=", c.d30]], date: "expiry_date", party: "item", order: "asc", action: ["Issue first or quarantine", "صرفها أولًا أو عزلها"], severity: "medium", overdueFrom: c.asOf },
    ],
    charts: (c) => [
      { id: "sn-status", label: ["Serial numbers by status", "الأرقام التسلسلية حسب الحالة"], kind: "field", doctype: "Serial No", filters: [co(c)], field: "status" },
    ],
    flow: [["Count stock in the warehouse", "جرد المخزون في المستودع"], ["Stock Reconciliation (book vs counted)", "تسوية المخزون (الدفتري مقابل المعدود)"], ["Submit — differences post to the Stock Ledger", "الاعتماد — ترحيل الفروقات لدفتر المخزون"], ["Batch / serial traceability", "تتبع الدفعات والأرقام التسلسلية"]],
    guards: [["Variances are shown only from submitted reconciliations with counted quantities.", "الفروقات تُعرض فقط من تسويات معتمدة بكميات معدودة."]],
    scope: [["Company", "الشركة"], ["Warehouse", "المستودع"], ["Item", "الصنف"], ["Expiry date", "تاريخ الانتهاء"]],
    extra: ["inv-expiry"],
  },
  "INV-REPORT": {
    id: "INV-REPORT", role: ["Inventory controller · Finance", "مراقب المخزون · المالية"],
    purpose: ["Reconcile stock quantities and values with the posted stock ledger.", "مطابقة كميات المخزون وقيمه مع دفتر المخزون المرحّل."],
    questions: ["What is the posted stock value, where do sources disagree and which items need action?", "ما قيمة المخزون المرحّلة، وأين تختلف المصادر، وأي الأصناف تحتاج إجراء؟"],
    docs: [
      { doctype: "Stock Ledger Entry", owner: "inventory", role: ["Posted stock movements (read-only)", "حركات المخزون المرحّلة (للقراءة)"], date: "posting_date", company: true, ledger: true },
      { doctype: "Stock Entry", owner: "inventory", role: ["Stock movements", "حركات المخزون"], date: "posting_date", company: true },
      { doctype: "Stock Reconciliation", owner: "inventory", role: ["Stock adjustments", "تسويات المخزون"], date: "posting_date", company: true },
      { doctype: "Item", owner: "inventory", role: ["Items", "الأصناف"] },
    ],
    kpis: (c) => [
      { id: "sle-30", label: ["Posted stock movements — 30 days", "حركات مخزون مرحّلة — 30 يومًا"], hint: ["Stock Ledger Entry · not cancelled", "قيد مخزون غير ملغى"], doctype: "Stock Ledger Entry", filters: [co(c), ["is_cancelled", "=", 0], between("posting_date", c.from30, c.asOf)], tone: "info" },
      { id: "bin-neg", label: ["Negative projected quantity", "كمية متوقعة سالبة"], hint: ["Bin · projected quantity below zero", "سجل الكمية · الكمية المتوقعة أقل من صفر"], doctype: "Bin", filters: [["projected_qty", "<", 0]], tone: "risk" },
      { id: "se-draft", label: ["Draft stock documents", "مستندات مخزون مسودة"], hint: ["Stock Entry · Draft (not yet in the ledger)", "حركة مخزون مسودة (غير مرحّلة)"], doctype: "Stock Entry", filters: [co(c), DRAFT], tone: "action" },
    ],
    queues: () => [
      { id: "bin-neg", label: ["Items with negative projected quantity", "أصناف بكمية متوقعة سالبة"], doctype: "Bin", filters: [["projected_qty", "<", 0]], date: "modified", party: "item_code", amount: "projected_qty", order: "asc", action: ["Review demand and replenish", "مراجعة الطلب وإعادة التزويد"], severity: "high" },
    ],
    charts: (c) => [
      { id: "sle-month", label: ["Posted stock value change by month", "تغير قيمة المخزون المرحّلة حسب الشهر"], kind: "month", doctype: "Stock Ledger Entry", filters: [co(c), ["is_cancelled", "=", 0]], field: "posting_date", measure: "stock_value_difference" },
      { id: "sle-type", label: ["Posted movements by source document", "الحركات المرحّلة حسب مستند المصدر"], kind: "field", doctype: "Stock Ledger Entry", filters: [co(c), ["is_cancelled", "=", 0]], field: "voucher_type" },
    ],
    flow: [["Stock documents submitted", "اعتماد مستندات المخزون"], ["Stock Ledger Entries posted", "ترحيل قيود دفتر المخزون"], ["Stock Balance / Valuation reports", "تقارير رصيد وتقييم المخزون"], ["Discrepancies investigated at source", "التحقق من الفروقات من المصدر"]],
    guards: [["Posted ledger value and the Bin snapshot are shown as separate sources; a difference is disclosed, never hidden.", "قيمة الدفتر المرحّلة ولقطة الكميات مصدران منفصلان؛ أي فرق يُفصح عنه ولا يُخفى."]],
    scope: [["Company", "الشركة"], ["Warehouse", "المستودع"], ["Posting date", "تاريخ الترحيل"]],
    extra: ["stock-sources"],
  },
  "AST-REGISTER": {
    id: "AST-REGISTER", role: ["Asset accountant", "محاسب الأصول"],
    purpose: ["Register and capitalise fixed assets and keep their master data complete.", "تسجيل الأصول الثابتة ورسملتها واستكمال بياناتها."],
    questions: ["Which assets are new or incomplete, and what is the state of the register?", "ما الأصول الجديدة أو غير المكتملة، وما حالة السجل؟"],
    docs: [
      { doctype: "Asset", owner: "assets", role: ["Fixed asset register", "سجل الأصول الثابتة"], date: "purchase_date", company: true, create: true },
      { doctype: "Asset Category", owner: "assets", role: ["Asset categories", "فئات الأصول"] },
      { doctype: "Asset Capitalization", owner: "assets", role: ["Capitalisation", "الرسملة"], date: "posting_date", company: true },
      { doctype: "Purchase Invoice", owner: "purchasing", role: ["Acquisition invoices (Purchasing-owned)", "فواتير الاقتناء (ملك المشتريات)"], date: "posting_date", company: true },
    ],
    kpis: (c) => [
      { id: "ast-draft", label: ["New assets (draft)", "أصول جديدة (مسودة)"], hint: ["Asset · Draft", "أصل مسودة"], doctype: "Asset", filters: [co(c), DRAFT], tone: "action" },
      { id: "ast-use", label: ["Assets in use", "أصول قيد الاستخدام"], hint: ["Submitted · Submitted or Partially Depreciated", "معتمدة · معتمد أو مستهلك جزئيًا"], doctype: "Asset", filters: [co(c), SUB, ["status", "in", ["Submitted", "Partially Depreciated"]]], tone: "info" },
      { id: "ast-full", label: ["Fully depreciated assets", "أصول مهلكة بالكامل"], hint: ["Asset · Fully Depreciated", "أصل مهلك بالكامل"], doctype: "Asset", filters: [co(c), ["status", "=", "Fully Depreciated"]], tone: "info" },
      { id: "ast-nocat", label: ["Assets without category", "أصول بدون فئة"], hint: ["Asset category not set", "فئة الأصل غير محددة"], doctype: "Asset", filters: [co(c), NOT_CANCELLED, ["asset_category", "is", "not set"]], tone: "risk" },
    ],
    queues: (c) => [
      { id: "ast-draft", label: ["New assets to complete and submit", "أصول جديدة للإكمال والاعتماد"], doctype: "Asset", filters: [co(c), DRAFT], date: "purchase_date", party: "asset_category", order: "asc", action: ["Complete setup and submit", "إكمال الإعداد والاعتماد"], severity: "high" },
    ],
    charts: (c) => [
      { id: "ast-status", label: ["Assets by lifecycle status", "الأصول حسب حالة دورة الحياة"], kind: "field", doctype: "Asset", filters: [co(c), NOT_CANCELLED], field: "status" },
      { id: "ast-cat", label: ["Assets by category", "الأصول حسب الفئة"], kind: "field", doctype: "Asset", filters: [co(c), NOT_CANCELLED], field: "asset_category" },
    ],
    flow: [["Purchase Invoice / Receipt", "فاتورة أو إيصال الشراء"], ["Asset created (draft)", "إنشاء الأصل (مسودة)"], ["Submitted — depreciation schedule generated", "الاعتماد — إنشاء جدول الإهلاك"], ["In use", "قيد الاستخدام"]],
    guards: [["Cost and book value come from the native asset record; nothing is estimated.", "التكلفة والقيمة الدفترية من سجل الأصل الأصلي؛ لا شيء تقديري."]],
    scope: [["Company", "الشركة"], ["Category", "الفئة"], ["Status", "الحالة"], ["Purchase date", "تاريخ الشراء"]],
    extra: ["asset-life"],
  },
  "AST-CUSTODY": {
    id: "AST-CUSTODY", role: ["Asset custodian · Admin officer", "أمين العهد · المسؤول الإداري"],
    purpose: ["Know where every asset is and who holds it, and record transfers.", "معرفة موقع كل أصل ومن يحتفظ به وتسجيل التحويلات."],
    questions: ["Which assets have no location or custodian, and which movements are pending?", "ما الأصول بلا موقع أو أمين عهدة، وما الحركات المعلقة؟"],
    docs: [
      { doctype: "Asset", owner: "assets", role: ["Assets", "الأصول"], company: true },
      { doctype: "Asset Movement", owner: "assets", role: ["Transfers and custody changes", "التحويلات وتغيير العهدة"], date: "transaction_date", company: true, create: true },
      { doctype: "Location", owner: "assets", role: ["Locations", "المواقع"] },
      { doctype: "Employee", owner: "assets", role: ["Custodians", "أمناء العهد"], company: true },
    ],
    kpis: (c) => [
      { id: "ast-noloc", label: ["Assets without location", "أصول بدون موقع"], hint: ["Not cancelled, location not set", "غير ملغاة والموقع غير محدد"], doctype: "Asset", filters: [co(c), NOT_CANCELLED, ["location", "is", "not set"]], tone: "risk" },
      { id: "ast-nocust", label: ["Assets without custodian", "أصول بدون أمين عهدة"], hint: ["Submitted, custodian not set", "معتمدة وأمين العهدة غير محدد"], doctype: "Asset", filters: [co(c), SUB, ["custodian", "is", "not set"]], tone: "action" },
      { id: "mv-draft", label: ["Draft movements", "حركات مسودة"], hint: ["Asset Movement · Draft", "حركة أصل مسودة"], doctype: "Asset Movement", filters: [co(c), DRAFT], tone: "action" },
      { id: "mv-90", label: ["Movements — 90 days", "الحركات — 90 يومًا"], hint: ["Submitted Asset Movements", "حركات أصول معتمدة"], doctype: "Asset Movement", filters: [co(c), SUB, between("transaction_date", c.from90, c.asOf)], tone: "info" },
    ],
    queues: (c) => [
      { id: "ast-nocust", label: ["Assets to assign a custodian", "أصول لتعيين أمين عهدة"], doctype: "Asset", filters: [co(c), SUB, ["custodian", "is", "not set"]], date: "purchase_date", party: "location", order: "asc", action: ["Record an Asset Movement", "تسجيل حركة أصل"], severity: "medium" },
      { id: "mv-draft", label: ["Movements to submit", "حركات للاعتماد"], doctype: "Asset Movement", filters: [co(c), DRAFT], date: "transaction_date", party: "purpose", order: "asc", action: ["Confirm and submit", "تأكيد واعتماد"], severity: "high" },
    ],
    charts: (c) => [
      { id: "ast-loc", label: ["Assets by location", "الأصول حسب الموقع"], kind: "field", doctype: "Asset", filters: [co(c), NOT_CANCELLED], field: "location" },
    ],
    flow: [["Asset in use", "أصل قيد الاستخدام"], ["Asset Movement (issue, transfer, receipt)", "حركة أصل (تسليم، تحويل، استلام)"], ["Location / custodian updated on submit", "تحديث الموقع وأمين العهدة عند الاعتماد"], ["Custody register", "سجل العهد"]],
    guards: [["Custody is read from the asset's location and custodian fields and its submitted movements only.", "العهدة تُقرأ من حقلي الموقع وأمين العهدة في الأصل وحركاته المعتمدة فقط."]],
    scope: [["Company", "الشركة"], ["Location", "الموقع"], ["Custodian", "أمين العهدة"]],
  },
  "AST-DEP": {
    id: "AST-DEP", role: ["Asset accountant · Controller", "محاسب الأصول · المراقب المالي"],
    purpose: ["Book due depreciation and prove each booking against the ledger.", "قيد الإهلاك المستحق وإثبات كل قيد مقابل دفتر الأستاذ."],
    questions: ["What depreciation is due, what is booked and verified in the ledger, and what is reference-only?", "ما الإهلاك المستحق، وما المقيد والمتحقق في الأستاذ، وما المرجعي فقط؟"],
    docs: [
      { doctype: "Asset Depreciation Schedule", owner: "assets", role: ["Depreciation schedules", "جداول الإهلاك"], company: true },
      { doctype: "Asset", owner: "assets", role: ["Assets", "الأصول"], company: true },
      { doctype: "Journal Entry", owner: "accounting", role: ["Depreciation entries (Accounting-owned)", "قيود الإهلاك (ملك المحاسبة)"], date: "posting_date", company: true },
      { doctype: "Asset Value Adjustment", owner: "assets", role: ["Value adjustments", "تعديلات القيمة"], date: "date", company: true, create: true },
      { doctype: "GL Entry", owner: "accounting", role: ["Posted depreciation ledger rows (read-only)", "قيود الاستهلاك المرحّلة (للقراءة فقط)"], date: "posting_date", company: true, ledger: true },
    ],
    kpis: (c) => [
      { id: "ads-active", label: ["Active depreciation schedules", "جداول إهلاك نشطة"], hint: ["Asset Depreciation Schedule · submitted", "جدول إهلاك معتمد"], doctype: "Asset Depreciation Schedule", filters: [co(c), SUB], tone: "info" },
      { id: "ava", label: ["Value adjustments", "تعديلات القيمة"], hint: ["Asset Value Adjustment · submitted", "تعديل قيمة أصل معتمد"], doctype: "Asset Value Adjustment", filters: [co(c), SUB], tone: "info" },
      { id: "je-dep-month", label: ["Depreciation entries this month", "قيود إهلاك هذا الشهر"], hint: ["Journal Entry · Depreciation Entry · submitted this month", "قيد يومية من نوع قيد إهلاك معتمد هذا الشهر"], doctype: "Journal Entry", filters: [co(c), SUB, ["voucher_type", "=", "Depreciation Entry"], between("posting_date", c.monthFrom, c.asOf)], measure: "total_debit", tone: "info" },
      { id: "ast-fully", label: ["Fully depreciated assets", "أصول مهلكة بالكامل"], hint: ["Asset · status Fully Depreciated", "أصل حالته مهلك بالكامل"], doctype: "Asset", filters: [co(c), SUB, ["status", "=", "Fully Depreciated"]], tone: "info" },
      { id: "ads-draft", label: ["Draft depreciation schedules", "جداول إهلاك مسودة"], hint: ["Asset Depreciation Schedule · draft", "جدول إهلاك مسودة"], doctype: "Asset Depreciation Schedule", filters: [co(c), DRAFT], tone: "action" },
    ],
    queues: () => [], // due/overdue depreciation rows are listed by the Depreciation queue on the Work tab (assetLifecycle.ts)
    charts: (c) => [
      { id: "je-dep", label: ["Depreciation entries by month", "قيود الإهلاك حسب الشهر"], kind: "month", doctype: "Journal Entry", filters: [co(c), SUB, ["voucher_type", "=", "Depreciation Entry"]], field: "posting_date", measure: "total_debit" },
      { id: "ast-status", label: ["Assets by status", "الأصول حسب الحالة"], kind: "field", doctype: "Asset", filters: [co(c), SUB], field: "status" },
    ],
    flow: [["Asset submitted", "اعتماد الأصل"], ["Depreciation schedule rows", "بنود جدول الإهلاك"], ["Depreciation Journal Entry submitted", "اعتماد قيد الإهلاك"], ["GL rows verify the booking", "قيود الأستاذ تثبت القيد"]],
    guards: [["Only submitted Journal Entries with readable, non-cancelled GL rows count as posted.", "تُحتسب كمرحّلة فقط قيود اليومية المعتمدة ذات قيود أستاذ مقروءة وغير ملغاة."], ["A journal reference without ledger proof is shown as reference-only.", "مرجع القيد بدون إثبات في الأستاذ يُعرض كمرجع فقط."]],
    scope: [["Company", "الشركة"], ["As-of date", "حتى تاريخ"], ["Finance book", "دفتر التمويل"]],
    extra: ["asset-dep", "asset-books"],
  },
  "AST-SERVICE": {
    id: "AST-SERVICE", role: ["Maintenance planner · Asset accountant", "مخطط الصيانة · محاسب الأصول"],
    purpose: ["Plan maintenance, track repairs and control asset disposal.", "تخطيط الصيانة ومتابعة الإصلاحات وضبط استبعاد الأصول."],
    questions: ["Which maintenance is due or overdue, which repairs are open and which assets were disposed?", "ما الصيانة المستحقة أو المتأخرة، وما الإصلاحات المفتوحة، وما الأصول المستبعدة؟"],
    docs: [
      { doctype: "Asset Maintenance", owner: "assets", role: ["Maintenance plans", "خطط الصيانة"], company: true, create: true },
      { doctype: "Asset Maintenance Log", owner: "assets", role: ["Maintenance tasks", "مهام الصيانة"], date: "due_date" },
      { doctype: "Asset Repair", owner: "assets", role: ["Repairs", "الإصلاحات"], date: "failure_date", company: true, create: true },
      { doctype: "Asset", owner: "assets", role: ["Assets (sale / scrap)", "الأصول (بيع / تخريد)"], company: true },
      { doctype: "Journal Entry", owner: "accounting", role: ["Disposal and repair journals booked in DIGIT", "قيود الاستبعاد والإصلاح المسجلة في النظام"], date: "posting_date", company: true },
    ],
    kpis: (c) => [
      { id: "log-due", label: ["Maintenance due in 30 days", "صيانة مستحقة خلال 30 يومًا"], hint: ["Planned, due date within 30 days", "مخططة وتاريخ الاستحقاق خلال 30 يومًا"], doctype: "Asset Maintenance Log", filters: [["maintenance_status", "=", "Planned"], between("due_date", c.asOf, c.d30)], tone: "action" },
      { id: "log-late", label: ["Overdue maintenance", "صيانة متأخرة"], hint: ["Planned or Overdue, due date before the as-of date", "مخططة أو متأخرة وتاريخ الاستحقاق قبل تاريخ التقرير"], doctype: "Asset Maintenance Log", filters: [["maintenance_status", "in", ["Planned", "Overdue"]], ["due_date", "<", c.asOf]], tone: "risk" },
      { id: "rep-open", label: ["Open repairs", "إصلاحات مفتوحة"], hint: ["Asset Repair · Pending", "إصلاح أصل · معلق"], doctype: "Asset Repair", filters: [co(c), ["repair_status", "=", "Pending"], NOT_CANCELLED], measure: "repair_cost", tone: "action" },
      { id: "ast-disp", label: ["Disposed assets", "أصول مستبعدة"], hint: ["Asset · Sold or Scrapped", "أصل مباع أو مخرّد"], doctype: "Asset", filters: [co(c), ["status", "in", ["Sold", "Scrapped"]]], tone: "info" },
    ],
    queues: (c) => [
      { id: "log-late", label: ["Maintenance tasks by due date", "مهام الصيانة حسب تاريخ الاستحقاق"], doctype: "Asset Maintenance Log", filters: [["maintenance_status", "in", ["Planned", "Overdue"]], ["due_date", "<=", c.d30]], date: "due_date", party: "asset_name", order: "asc", action: ["Complete the task", "إنجاز المهمة"], severity: "high", overdueFrom: c.asOf },
      { id: "rep-open", label: ["Open repairs", "إصلاحات مفتوحة"], doctype: "Asset Repair", filters: [co(c), ["repair_status", "=", "Pending"], NOT_CANCELLED], date: "failure_date", party: "asset", amount: "repair_cost", order: "asc", action: ["Update and complete repair", "تحديث الإصلاح وإكماله"], severity: "medium" },
    ],
    charts: (c) => [
      { id: "ast-status", label: ["Assets by status", "الأصول حسب الحالة"], kind: "field", doctype: "Asset", filters: [co(c), NOT_CANCELLED], field: "status" },
      { id: "rep-status", label: ["Repairs by status", "الإصلاحات حسب الحالة"], kind: "field", doctype: "Asset Repair", filters: [co(c), NOT_CANCELLED], field: "repair_status" },
    ],
    flow: [["Maintenance plan and tasks", "خطة الصيانة ومهامها"], ["Repair on failure", "إصلاح عند العطل"], ["Sale or scrap from the asset form", "البيع أو التخريد من نموذج الأصل"], ["Disposal entry posted by the native document", "قيد الاستبعاد يرحّله المستند الأصلي"]],
    guards: [["Gain/loss on disposal is shown only from posted accounting entries.", "أرباح وخسائر الاستبعاد تُعرض فقط من القيود المحاسبية المرحّلة."]],
    scope: [["Company", "الشركة"], ["Due date", "تاريخ الاستحقاق"], ["Status", "الحالة"]],
    extra: ["asset-service"],
  },
};

/* ------------------------------------------------------------------ evaluation ------------------------------------------------------------------ */
export type KpiStatus = SourceStatus | "empty";
export interface KpiResult extends KpiDef { status: KpiStatus; count: number; totals: { currency: string; amount: number }[]; drill: Drill; figure?: { value: number; unit: FigureUnit }; base?: number }
export interface QueueRow { name: string; doctype: string; date: string; party: string; amount: number | null; currency: string; days: number | null }
export interface QueueResult extends QueueDef { status: SourceStatus; count: number; rows: QueueRow[]; drill: Drill }
export interface ChartBar { key: string; label: string; count: number; value: number | null; drill: Drill }
export interface ChartResult extends ChartDef { status: SourceStatus; bars: ChartBar[]; currencies: string[] }
export interface DocResult extends DocDef { status: SourceStatus; total: number; drafts: number | null; submitted: number | null; submittable: boolean; latest: string; drill: Drill; draftDrill: Drill }

/** Link-valued chart buckets are record names (customer groups, locations…) — rendered as data, never translated. */
export const isLinkField = (dt: string, f: string) => (cachedMeta(dt) as { fields?: { fieldname: string; fieldtype: string }[] } | undefined)?.fields?.find((x) => x.fieldname === f)?.fieldtype === "Link";
const hasField = (dt: string, f: string) => { const m = cachedMeta(dt) as { fields?: { fieldname: string }[] } | undefined; return !!m?.fields?.some((x) => x.fieldname === f); };
const isSubmittable = (dt: string) => !!(cachedMeta(dt) as { is_submittable?: number } | undefined)?.is_submittable;
const companyOf = (filters: Filter[]) => filters.find((f) => f[0] === "company" && f[1] === "=")?.[2] as string | undefined;

/** Source state of a predicate: permission first, then — for company headlines — fail closed if any company record is unreadable. */
export function scopeStatus(dt: string, filters: Filter[], user: string): SourceStatus {
  const st = sourceStatus(dt, user); if (st !== "ok") return st;
  const company = companyOf(filters);
  const readable = new Set(scopedList(dt, user).map((d) => d.name));
  const all = adapter.list(dt);
  const hidden = company ? all.some((d) => d["company"] === company && !readable.has(d.name)) : all.some((d) => !readable.has(d.name));
  return hidden ? "denied" : "ok";
}
export const rowsMatching = (dt: string, filters: Filter[], user: string): Doc[] => scopedList(dt, user).filter((d) => filters.every((f) => matchFilter(d, f)));
const curOf = (d: Doc, cur: string | undefined, fallback: string) => String((cur ? d[cur] : undefined) || d["party_account_currency"] || d["currency"] || fallback || "");
function sumByCurrency(rows: Doc[], measure: string, cur: string | undefined, fallback: string): { currency: string; amount: number }[] {
  const m = new Map<string, number>();
  for (const d of rows) { const c = curOf(d, cur, fallback); m.set(c, r2((m.get(c) ?? 0) + n(d[measure]))); }
  return [...m.entries()].map(([currency, amount]) => ({ currency, amount })).sort((a, b) => (a.currency === fallback ? -1 : b.currency === fallback ? 1 : a.currency.localeCompare(b.currency)));
}
export const listDrill = (doctype: string, filters: Filter[]): Drill => ({ kind: "list", doctype, filters: filters as [string, string, string | number | (string | number)[]][] });

/** Figure of a defined-formula KPI: a percentage, a number of days or a quantity (never a currency). */
export function figureText(f: { value: number; unit: "qty" | "days" | "pct" }, ar: boolean): string {
  const v = f.value.toLocaleString("en-US", { maximumFractionDigits: f.unit === "qty" ? 2 : 1 });
  return f.unit === "pct" ? `${v}%` : f.unit === "days" ? `${v} ${ar ? "يوم" : f.value === 1 ? "day" : "days"}` : v;
}
export function evalKpi(k: KpiDef, ctx: SectionCtx, user = currentUser()): KpiResult {
  const drill = listDrill(k.doctype, k.filters);
  const status = scopeStatus(k.doctype, k.filters, user);
  if (status !== "ok") return { ...k, status, count: 0, totals: [], drill };
  if (k.fn) {
    const r = k.fn(ctx, user);
    const d = r.drill ?? (r.names ? listDrill(k.doctype, [...k.filters, ["name", "in", r.names]]) : drill);
    return { ...k, status: r.count ? "ok" : "empty", count: r.count, totals: r.totals ?? [], drill: d, ...(r.figure ? { figure: r.figure } : {}) };
  }
  const all = rowsMatching(k.doctype, k.filters, user);
  const rows = k.pick ? all.filter((d) => k.pick!(d, ctx)) : all;
  const exact = k.pick ? listDrill(k.doctype, [...k.filters, ["name", "in", rows.map((d) => d.name)]]) : drill;
  if (k.rate) {
    const base = rowsMatching(k.doctype, k.rate.filters, user).filter((d) => !k.rate!.pick || k.rate!.pick(d, ctx));
    const pct = base.length ? Math.round((rows.length / base.length) * 1000) / 10 : 0;
    return { ...k, status: base.length ? "ok" : "empty", count: rows.length, totals: [], drill: exact, figure: { value: pct, unit: "pct" }, base: base.length };
  }
  if (k.unit && k.value) {
    const v = r2(rows.reduce((t, d) => t + k.value!(d, ctx), 0));
    return { ...k, status: rows.length ? "ok" : "empty", count: rows.length, totals: [], drill: exact, figure: { value: v, unit: k.unit } };
  }
  const totals = k.value ? sumValues(rows, (d) => k.value!(d, ctx), k.cur, ctx.currency) : k.measure ? sumByCurrency(rows, k.measure, k.cur, ctx.currency) : [];
  return { ...k, status: rows.length ? "ok" : "empty", count: rows.length, totals, drill: exact };
}
function sumValues(rows: Doc[], val: (d: Doc) => number, cur: string | undefined, fallback: string): { currency: string; amount: number }[] {
  const m = new Map<string, number>();
  for (const d of rows) { const c = curOf(d, cur, fallback); m.set(c, r2((m.get(c) ?? 0) + val(d))); }
  return [...m.entries()].map(([currency, amount]) => ({ currency, amount })).sort((a, b) => (a.currency === fallback ? -1 : b.currency === fallback ? 1 : a.currency.localeCompare(b.currency)));
}

/* ---------- S6-b compare control (same on all 20 workspaces) ---------- */
export type CompareMode = "month" | "year";
export const compareMode = (v: string | undefined): CompareMode | undefined => (v === "month" || v === "year" ? v : undefined);
/** The comparison as-of date: same day one month / one year earlier (month ends clamped, e.g. 31 Mar → 28/29 Feb). */
export function compareAsOf(asOf: string, mode: CompareMode): string {
  const [y, m, d] = asOf.split("-").map(Number) as [number, number, number];
  const ty = mode === "year" ? y - 1 : m === 1 ? y - 1 : y, tm = mode === "year" ? m : m === 1 ? 12 : m - 1;
  const last = new Date(Date.UTC(ty, tm, 0)).getUTCDate();
  return `${ty}-${String(tm).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
}
export interface KpiCompare { asOf: string; comparable: boolean; count: number; totals: { currency: string; amount: number }[] }
/**
 * The same KPI definition evaluated for the comparison date. A KPI whose filters do not depend on the date (a current
 * state such as "unpaid now") has no history in the source records, so it is marked not comparable instead of showing
 * an invented trend (ENT-UI-019).
 */
export function compareKpi(k: KpiDef, prevDef: KpiDef | undefined, prevCtx: SectionCtx, user = currentUser()): KpiCompare {
  if (!prevDef || JSON.stringify(prevDef.filters) === JSON.stringify(k.filters)) return { asOf: prevCtx.asOf, comparable: false, count: 0, totals: [] };
  const r = evalKpi(prevDef, prevCtx, user);
  return { asOf: prevCtx.asOf, comparable: r.status === "ok" || r.status === "empty", count: r.count, totals: r.totals };
}

export function evalQueue(q: QueueDef, ctx: SectionCtx, user = currentUser(), limit = 8): QueueResult {
  const drill = listDrill(q.doctype, q.filters);
  const status = sourceStatus(q.doctype, user);
  if (status !== "ok") return { ...q, status, count: 0, rows: [], drill };
  const all = rowsMatching(q.doctype, q.filters, user);
  const rows = q.pick ? all.filter((d) => q.pick!(d, ctx)) : all;
  const exact = q.pick ? listDrill(q.doctype, [...q.filters, ["name", "in", rows.map((d) => d.name)]]) : drill;
  const dateOf = (d: Doc) => (q.dateOf ? q.dateOf(d) : String(d[q.date] ?? ""));
  const dir = q.order === "desc" ? -1 : 1;
  rows.sort((a, b) => ((dateOf(a) || "9999").localeCompare(dateOf(b) || "9999")) * dir || a.name.localeCompare(b.name));
  const ref = q.overdueFrom;
  return { ...q, status, count: rows.length, drill: exact, rows: rows.slice(0, limit).map((d) => {
    const date = dateOf(d).slice(0, 10);
    const days = ref && date ? Math.round((Date.parse(ref) - Date.parse(date)) / DAY) : null;
    const amount = q.amountOf ? q.amountOf(d) : q.amount && d[q.amount] !== undefined && d[q.amount] !== null && d[q.amount] !== "" ? n(d[q.amount]) : null;
    const party = q.partyOf ? q.partyOf(d) : q.party ? String(d[`${q.party}_name`] || partyTitle(d, q.party) || "") : "";
    return { name: d.name, doctype: q.doctype, date, party, amount, currency: curOf(d, q.cur, ctx.currency), days };
  }) };
}

/** Display name of a queue row's party (A5: names, never codes, where a name exists); the stored value stays the key. */
const sv = (v: unknown) => (v === undefined || v === null ? "" : String(v));
const PARTY_DT: Record<string, (d: Doc) => string | undefined> = { party: (d) => sv(d["party_type"]) || undefined, party_name: (d) => sv(d["quotation_to"]) || "Customer", customer: () => "Customer", supplier: () => "Supplier", employee: () => "Employee" };
function partyTitle(d: Doc, field: string): string {
  const v = sv(d[field]); const dt = PARTY_DT[field]?.(d); if (!v || !dt) return v;
  const rec = adapter.get(dt, v); const t = rec?.[`${dt.toLowerCase().replace(/ /g, "_")}_name`] ?? rec?.["title"];
  return typeof t === "string" && t.trim() ? t : v;
}
/** `opts` are the owner-approved display choices of the shared Dashboard Designer (period length, categories shown); the defaults are the original 6 months / top 8. */
export function evalChart(ch: ChartDef, ctx: SectionCtx, user = currentUser(), opts: { months?: number; top?: number } = {}): ChartResult {
  // Same rule as the KPI cards (audit G05): a company chart fails closed when any of the company's records is unreadable.
  const status = scopeStatus(ch.doctype, ch.filters, user);
  if (status !== "ok") return { ...ch, status, bars: [], currencies: [] };
  if (ch.fn) {
    const bars = ch.fn(ctx, user).map((b) => ({ ...b, label: b.label ?? b.key }));
    return { ...ch, status, bars, currencies: [ctx.currency] };
  }
  const all = rowsMatching(ch.doctype, ch.filters, user);
  const rows = ch.pick ? all.filter((d) => ch.pick!(d, ctx)) : all;
  const valOf = (d: Doc) => (ch.value ? ch.value(d, ctx) : n(d[ch.measure!]));
  const currencies = ch.measure || ch.value ? [...new Set(rows.map((d) => curOf(d, ch.cur, ctx.currency)))] : [];
  // A value series is plotted only in one currency; mixed-currency sources fall back to document counts.
  const valued = (!!ch.measure || !!ch.value) && (ch.unit === "qty" || currencies.length <= 1);
  if (ch.bucket) {
    const m = new Map<string, Doc[]>();
    for (const d of rows) { const k = ch.bucket(d, ctx); if (k) m.set(k, [...(m.get(k) ?? []), d]); }
    const keys = ch.order ? ch.order.filter((k) => m.has(k)) : ch.sortKeys ? [...m.keys()].sort() : [...m.keys()].sort((a, b) => (valued ? Math.abs(m.get(b)!.reduce((t, d) => t + valOf(d), 0)) - Math.abs(m.get(a)!.reduce((t, d) => t + valOf(d), 0)) : m.get(b)!.length - m.get(a)!.length) || a.localeCompare(b));
    const bars = (ch.sortKeys ? keys.slice(-(opts.top ?? 14)) : keys.slice(0, ch.order ? keys.length : opts.top ?? 8)).map((k) => { const rs = m.get(k)!; return { key: k, label: k, count: rs.length, value: valued ? r2(rs.reduce((t, d) => t + valOf(d), 0)) : null, drill: listDrill(ch.doctype, [...ch.filters, ["name", "in", rs.map((d) => d.name)]]) }; });
    return { ...ch, status, bars, currencies };
  }
  if (ch.kind === "month") {
    const months = monthsBack(ctx.asOf, opts.months ?? 6);
    const bars = months.map((m) => {
      const from = `${m}-01`; const to = m === ctx.asOf.slice(0, 7) ? ctx.asOf : monthEndIso(m);
      const rs = rows.filter((d) => { const v = String(d[ch.field] ?? "").slice(0, 10); return v >= from && v <= to; });
      return { key: m, label: m, count: rs.length, value: valued ? r2(rs.reduce((t, d) => t + valOf(d), 0)) : null, drill: listDrill(ch.doctype, ch.pick ? [...ch.filters, ["name", "in", rs.map((d) => d.name)]] : [...ch.filters, between(ch.field, from, to)]) };
    });
    return { ...ch, status, bars, currencies };
  }
  const m = new Map<string, Doc[]>();
  for (const d of rows) { const k = String(d[ch.field] ?? ""); m.set(k, [...(m.get(k) ?? []), d]); }
  const amt = (rs: Doc[]) => Math.abs(rs.reduce((t, d) => t + valOf(d), 0));
  const bars = [...m.entries()].sort((a, b) => (ch.rank === "value" && valued ? amt(b[1]) - amt(a[1]) : 0) || b[1].length - a[1].length || a[0].localeCompare(b[0])).slice(0, opts.top ?? 8).map(([k, rs]) => ({
    key: k || "—", label: k, count: rs.length, value: valued ? r2(rs.reduce((t, d) => t + valOf(d), 0)) : null,
    drill: listDrill(ch.doctype, [...ch.filters, ...(ch.pick ? [["name", "in", rs.map((d) => d.name)] as Filter] : []), k ? [ch.field, "=", k] as Filter : [ch.field, "is", "not set"] as Filter]),
  }));
  return { ...ch, status, bars, currencies };
}

export function evalDoc(d: DocDef, ctx: SectionCtx, user = currentUser()): DocResult {
  if (d.tool) { // Single DocType: one form, nothing to count; readable only with the DocType's read permission.
    const one: Drill = { kind: "doc", doctype: d.doctype, name: d.doctype };
    return { ...d, create: false, status: sourceStatus(d.doctype, user), total: 0, drafts: null, submitted: null, submittable: false, latest: "", drill: one, draftDrill: one };
  }
  if (d.ledger) d = { ...d, create: false };
  const scoped = d.company && hasField(d.doctype, "company");
  const base: Filter[] = scoped ? [["company", "=", ctx.company]] : [];
  const sub = isSubmittable(d.doctype);
  const drill = listDrill(d.doctype, base); const draftDrill = listDrill(d.doctype, [...base, DRAFT]);
  const status = sourceStatus(d.doctype, user);
  if (status !== "ok") return { ...d, status, total: 0, drafts: null, submitted: null, submittable: sub, latest: "", drill, draftDrill };
  const rows = rowsMatching(d.doctype, base, user);
  const latest = rows.reduce((m, r) => { const v = String(r.modified ?? r["creation"] ?? ""); return v > m ? v : m; }, "");
  return { ...d, status, total: rows.length, drafts: sub ? rows.filter((r) => n(r.docstatus) === 0).length : null, submitted: sub ? rows.filter((r) => n(r.docstatus) === 1).length : null, submittable: sub, latest: latest.slice(0, 16).replace("T", " "), drill, draftDrill };
}

/** Customer / supplier contribution: submitted non-return invoices in the window, per currency, top parties with share. */
export interface PartyShare { party: string; name: string; amount: number; share: number; count: number; drill: Drill }
export interface PartyMix { currency: string; total: number; top: PartyShare[]; others: number; parties: number }
export function partyMix(doctype: "Sales Invoice" | "Purchase Invoice", company: string, from: string, to: string, user = currentUser(), limit = 5): { status: SourceStatus; mixes: PartyMix[] } {
  const pf = doctype === "Sales Invoice" ? "customer" : "supplier";
  const base: Filter[] = [["company", "=", company], SUB, ["is_return", "=", 0], between("posting_date", from, to)];
  const status = scopeStatus(doctype, base, user);
  if (status !== "ok") return { status, mixes: [] };
  const rows = rowsMatching(doctype, base, user);
  const byCur = new Map<string, Doc[]>();
  for (const d of rows) { const c = String(d["currency"] || ""); byCur.set(c, [...(byCur.get(c) ?? []), d]); }
  const mixes = [...byCur.entries()].map(([currency, rs]) => {
    const total = r2(rs.reduce((t, d) => t + n(d["grand_total"]), 0));
    const m = new Map<string, { name: string; amount: number; count: number }>();
    for (const d of rs) { const p = String(d[pf] ?? ""); const x = m.get(p) ?? { name: String(d[`${pf}_name`] || p), amount: 0, count: 0 }; x.amount = r2(x.amount + n(d["grand_total"])); x.count++; m.set(p, x); }
    const sorted = [...m.entries()].sort((a, b) => b[1].amount - a[1].amount || a[0].localeCompare(b[0]));
    const top = sorted.slice(0, limit).map(([party, x]) => ({ party, name: x.name, amount: x.amount, count: x.count, share: total ? x.amount / total : 0, drill: listDrill(doctype, [...base, ["currency", "=", currency], [pf, "=", party]]) }));
    return { currency, total, top, others: r2(total - top.reduce((t, x) => t + x.amount, 0)), parties: m.size };
  }).sort((a, b) => b.total - a.total);
  return { status, mixes };
}

/** Due-window predicates on the as-of register (same rows the table shows). */
export function dueFilter(rows: ArRow[], due: string | undefined, asOf: string): ArRow[] {
  if (due === "overdue") return rows.filter((r) => r.days > 0);
  if (due === "next7" || due === "next30") { const to = addDaysIso(asOf, due === "next7" ? 7 : 30); return rows.filter((r) => r.outstanding > 0 && r.days <= 0 && r.due >= asOf && r.due <= to); }
  return rows;
}

/** Company AR/AP headline register: the aging.ts as-of register, failing closed ("denied") when the user cannot read every
 *  invoice of the company (e.g. a Customer user permission), so a section never shows a partial company balance as the total. */
export function duesRegister(side: Side, ctx: SectionCtx, user: string): ArRegister {
  const reg = arRegister(side, ctx.company, ctx.asOf, user);
  if (reg.status !== "ok") return reg;
  const gate = scopeStatus(reg.doctype, [["company", "=", ctx.company]], user);
  return gate === "ok" ? reg : { ...reg, status: gate, rows: [] };
}
