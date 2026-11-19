/**
 * DIGIT Pro native document hub contracts — one per section workspace (DIGIT-CORE-PRO-UX-006 §6–7, 20 workspaces).
 *
 * Pro decides WHICH native documents, reports and settings belong to each workspace; the Core hub (src/lib/hub.ts)
 * classifies them from source metadata and renders them. Entries come from three traceable sources only:
 *  1. the workspace's own navigation items (nav.ts sections: items + more) — the documents Pro already routes here;
 *  2. cards of the native ERPNext Workspace JSON (public/catalog/workspaces.json) named below — a card titled "Setup"
 *     lands in Settings & configuration, report cards in Operational reports;
 *  3. the department's declared setup DocTypes (nav.ts `extra`), limited to those listed in `setup`.
 * Quick-access counters are KPI-style predicates evaluated by the same scoped engine as the section KPIs (evalKpi), so
 * every number equals the rows its link opens in the native list. Nothing here writes records.
 */
import type { Workspace } from "@/lib/catalog";
import type { HubEntry } from "@/lib/hub";
import { deptById, pageItems, type NavItem, type SectionPage } from "./nav";
import type { Filter, KpiDef, SectionCtx } from "./sections";
import type { Bi } from "./command";

export interface ProHub {
  /** Native registers offered in the operational workbench (first = default tab). */
  registers: string[];
  /** Quick-access counters (open native lists with the same predicate). */
  quick: (c: SectionCtx) => KpiDef[];
  /** Native ERPNext Workspace cards included in this hub: [workspace, card label]. */
  native: [string, string][];
  /** Department setup DocTypes (nav.ts extra) that belong to this workspace. */
  setup: string[];
}

const co = (c: SectionCtx): Filter => ["company", "=", c.company];
const DRAFT: Filter = ["docstatus", "=", 0];
const SUB: Filter = ["docstatus", "=", 1];
const q = (id: string, doctype: string, label: Bi, hint: Bi, filters: Filter[], tone: KpiDef["tone"] = "action"): KpiDef => ({ id, doctype, label, hint, filters, tone });
const drafts = (c: SectionCtx, doctype: string, label: Bi, company = true): KpiDef => q(`draft-${doctype}`, doctype, label, ["Saved, not yet submitted", "محفوظة ولم تُعتمد بعد"], company ? [co(c), DRAFT] : [DRAFT]);

export const HUBS: Record<string, ProHub> = {
  /* ---------------- Accounting ---------------- */
  "ACC-OPS": {
    registers: ["Journal Entry", "Payment Entry", "Period Closing Voucher"],
    quick: (c) => [drafts(c, "Journal Entry", ["Draft journal entries", "قيود يومية مسودة"]), drafts(c, "Payment Entry", ["Draft payment entries", "سندات دفع مسودة"]),
      q("je-sub", "Journal Entry", ["Posted journal entries", "قيود يومية مرحّلة"], ["Submitted", "معتمدة"], [co(c), SUB], "info"),
      q("pe-unalloc", "Payment Entry", ["Unallocated payments", "مدفوعات غير مخصصة"], ["Submitted with unallocated amount", "معتمدة وبها مبلغ غير مخصص"], [co(c), SUB, ["unallocated_amount", ">", 0]], "risk")],
    native: [["Accounting", "Opening & Closing"], ["Accounting", "Ledger Tools"], ["Accounting", "Financial Statements"]],
    setup: ["Accounts Settings", "Company", "Payment Terms Template", "Currency Exchange"],
  },
  "ACC-DUES": {
    registers: ["Sales Invoice", "Purchase Invoice", "Payment Entry", "Dunning"],
    quick: (c) => [
      q("si-unpaid", "Sales Invoice", ["Unpaid sales invoices", "فواتير مبيعات غير مسددة"], ["Submitted, outstanding > 0", "معتمدة والرصيد المستحق أكبر من صفر"], [co(c), SUB, ["outstanding_amount", ">", 0]], "risk"),
      q("pi-unpaid", "Purchase Invoice", ["Unpaid purchase invoices", "فواتير مشتريات غير مسددة"], ["Submitted, outstanding > 0", "معتمدة والرصيد المستحق أكبر من صفر"], [co(c), SUB, ["outstanding_amount", ">", 0]], "risk"),
      drafts(c, "Payment Entry", ["Draft payment entries", "سندات دفع مسودة"]), drafts(c, "Dunning", ["Draft dunning letters", "خطابات مطالبة مسودة"])],
    native: [["Accounting", "Receivables & Payables"], ["Accounting", "Invoicing & Payments"], ["Accounting", "Reconciliation"]],
    setup: ["Payment Terms Template", "Payment Term", "Accounts Settings"],
  },
  "ACC-CASH": {
    registers: ["Bank Transaction", "Payment Entry", "Bank Account"],
    quick: (c) => [
      q("bt-unrec", "Bank Transaction", ["Unreconciled bank transactions", "حركات بنكية غير مسواة"], ["Submitted, status Unreconciled", "معتمدة وبحالة غير مسواة"], [co(c), SUB, ["status", "=", "Unreconciled"]], "risk"),
      q("pe-recv", "Payment Entry", ["Receipts", "المقبوضات"], ["Submitted, payment type Receive", "معتمدة ونوع الدفع استلام"], [co(c), SUB, ["payment_type", "=", "Receive"]], "info"),
      q("pe-pay", "Payment Entry", ["Payments made", "المدفوعات"], ["Submitted, payment type Pay", "معتمدة ونوع الدفع دفع"], [co(c), SUB, ["payment_type", "=", "Pay"]], "info"),
      drafts(c, "Payment Entry", ["Draft payment entries", "سندات دفع مسودة"])],
    native: [["Accounting", "Banking"]],
    setup: ["Mode of Payment", "Bank"],
  },
  "ACC-REPORT": {
    registers: ["Period Closing Voucher", "Accounting Period", "Budget"],
    quick: (c) => [drafts(c, "Period Closing Voucher", ["Draft period closing", "إقفال فترة مسودة"]),
      q("ap-closed", "Accounting Period", ["Accounting periods", "الفترات المحاسبية"], ["Defined for this company", "معرّفة لهذه الشركة"], [co(c)], "info"),
      q("budget", "Budget", ["Budgets", "الموازنات"], ["Submitted budgets", "موازنات معتمدة"], [co(c), SUB], "info"),
      drafts(c, "Journal Entry", ["Draft journal entries", "قيود يومية مسودة"])],
    native: [["Accounting", "Financial Statements"], ["Accounting", "Registers & Profitability"], ["Accounting", "Tax & Compliance"]],
    setup: ["Fiscal Year", "Finance Book", "Tax Rule", "Tax Category", "Item Tax Template", "Tax Withholding Category"],
  },
  /* ---------------- Selling ---------------- */
  "SEL-SALES": {
    registers: ["Quotation", "Sales Order", "Blanket Order"],
    quick: (c) => [drafts(c, "Quotation", ["Draft quotations", "عروض أسعار مسودة"]),
      q("qtn-open", "Quotation", ["Open quotations", "عروض أسعار مفتوحة"], ["Submitted, status Open", "معتمدة وبحالة مفتوح"], [co(c), SUB, ["status", "=", "Open"]], "info"),
      q("so-deliver", "Sales Order", ["Orders to deliver", "أوامر للتسليم"], ["Submitted, To Deliver and Bill", "معتمدة وبانتظار التسليم والفوترة"], [co(c), SUB, ["status", "=", "To Deliver and Bill"]]),
      drafts(c, "Sales Order", ["Draft sales orders", "أوامر بيع مسودة"])],
    native: [["Selling", "Sales Reports"]],
    setup: ["Terms and Conditions", "Selling Settings"],
  },
  "SEL-CUSTOMER": {
    registers: ["Customer", "Item Price", "Pricing Rule", "Price List"],
    quick: (c) => [
      q("cust-active", "Customer", ["Active customers", "العملاء النشطون"], ["Not disabled", "غير معطّلين"], [["disabled", "=", 0]], "info"),
      q("cust-disabled", "Customer", ["Disabled customers", "العملاء المعطّلون"], ["Disabled", "معطّلون"], [["disabled", "=", 1]], "risk"),
      q("ip-selling", "Item Price", ["Selling price entries", "أسعار البيع"], ["Item Price with selling = 1", "أسعار أصناف للبيع"], [["selling", "=", 1]], "info"),
      q("pr-active", "Pricing Rule", ["Active pricing rules", "قواعد التسعير النشطة"], ["Not disabled", "غير معطّلة"], [["disable", "=", 0]], "info")],
    native: [["Selling", "Customer Reports"], ["Selling", "Pricing"], ["Selling", "Sales Team Reports"]],
    setup: ["Selling Settings", "Sales Taxes and Charges Template"],
  },
  "SEL-FULFILL": {
    registers: ["Delivery Note", "Sales Invoice", "Packing Slip", "Delivery Trip"],
    quick: (c) => [
      q("dn-bill", "Delivery Note", ["Delivery notes to bill", "إشعارات تسليم للفوترة"], ["Submitted, status To Bill", "معتمدة وبحالة للفوترة"], [co(c), SUB, ["status", "=", "To Bill"]]),
      drafts(c, "Delivery Note", ["Draft delivery notes", "إشعارات تسليم مسودة"]), drafts(c, "Sales Invoice", ["Draft sales invoices", "فواتير مبيعات مسودة"]),
      q("si-return", "Sales Invoice", ["Credit notes", "إشعارات دائنة"], ["Submitted returns", "مرتجعات معتمدة"], [co(c), SUB, ["is_return", "=", 1]], "info")],
    native: [["Selling", "Point of Sale"], ["Stock", "Movement Reports"]],
    setup: ["Shipping Rule", "Selling Settings"],
  },
  "SEL-INTEL": {
    registers: ["Sales Invoice", "Payment Entry", "Customer"],
    quick: (c) => [
      q("si-overdue", "Sales Invoice", ["Overdue sales invoices", "فواتير مبيعات متأخرة"], ["Submitted, status Overdue", "معتمدة وبحالة متأخرة"], [co(c), SUB, ["status", "=", "Overdue"]], "risk"),
      q("si-unpaid", "Sales Invoice", ["Unpaid sales invoices", "فواتير مبيعات غير مسددة"], ["Submitted, outstanding > 0", "معتمدة والرصيد المستحق أكبر من صفر"], [co(c), SUB, ["outstanding_amount", ">", 0]], "risk"),
      q("pe-recv", "Payment Entry", ["Customer receipts", "مقبوضات العملاء"], ["Submitted, payment type Receive", "معتمدة ونوع الدفع استلام"], [co(c), SUB, ["payment_type", "=", "Receive"]], "info"),
      drafts(c, "Dunning", ["Draft dunning letters", "خطابات مطالبة مسودة"])],
    native: [["Selling", "Sales Reports"], ["Selling", "Customer Reports"]],
    setup: [],
  },
  /* ---------------- Purchasing ---------------- */
  "PUR-SOURCE": {
    registers: ["Material Request", "Request for Quotation", "Supplier Quotation"],
    quick: (c) => [drafts(c, "Material Request", ["Draft material requests", "طلبات مواد مسودة"]),
      q("mr-pending", "Material Request", ["Requests to order", "طلبات بانتظار الطلب"], ["Submitted, status Pending", "معتمدة وبحالة معلّقة"], [co(c), SUB, ["status", "=", "Pending"]]),
      drafts(c, "Request for Quotation", ["Draft RFQs", "طلبات عروض مسودة"]),
      q("sq-sub", "Supplier Quotation", ["Supplier quotations received", "عروض موردين مستلمة"], ["Submitted", "معتمدة"], [co(c), SUB], "info")],
    native: [["Buying", "Order Status Reports"]],
    setup: ["Buying Settings", "Terms and Conditions"],
  },
  "PUR-ORDERS": {
    registers: ["Purchase Order", "Blanket Order"],
    quick: (c) => [drafts(c, "Purchase Order", ["Draft purchase orders", "أوامر شراء مسودة"]),
      q("po-receive", "Purchase Order", ["Orders to receive", "أوامر للاستلام"], ["Submitted, To Receive and Bill", "معتمدة وبانتظار الاستلام والفوترة"], [co(c), SUB, ["status", "=", "To Receive and Bill"]]),
      q("po-bill", "Purchase Order", ["Orders to bill", "أوامر للفوترة"], ["Submitted, To Bill", "معتمدة وبانتظار الفوترة"], [co(c), SUB, ["status", "=", "To Bill"]]),
      q("po-hold", "Purchase Order", ["Orders on hold", "أوامر معلّقة"], ["Submitted, On Hold", "معتمدة ومعلّقة"], [co(c), SUB, ["status", "=", "On Hold"]], "risk")],
    native: [["Buying", "Purchase Reports"]],
    setup: ["Purchase Taxes and Charges Template", "Buying Settings"],
  },
  "PUR-RECEIVE": {
    registers: ["Purchase Receipt", "Purchase Invoice", "Landed Cost Voucher"],
    quick: (c) => [
      q("pr-bill", "Purchase Receipt", ["Receipts to bill", "إيصالات استلام للفوترة"], ["Submitted, status To Bill", "معتمدة وبحالة للفوترة"], [co(c), SUB, ["status", "=", "To Bill"]]),
      drafts(c, "Purchase Receipt", ["Draft purchase receipts", "إيصالات استلام مسودة"]), drafts(c, "Purchase Invoice", ["Draft purchase invoices", "فواتير مشتريات مسودة"]),
      q("pi-return", "Purchase Invoice", ["Debit notes", "إشعارات مدينة"], ["Submitted returns", "مرتجعات معتمدة"], [co(c), SUB, ["is_return", "=", 1]], "info")],
    native: [["Buying", "Order Status Reports"]],
    setup: ["Buying Settings"],
  },
  "PUR-SUPPLIER": {
    registers: ["Supplier", "Supplier Scorecard", "Purchase Invoice"],
    quick: (c) => [
      q("sup-active", "Supplier", ["Active suppliers", "الموردون النشطون"], ["Not disabled", "غير معطّلين"], [["disabled", "=", 0]], "info"),
      q("sup-hold", "Supplier", ["Suppliers on hold", "موردون موقوفون"], ["On hold", "موقوفون"], [["on_hold", "=", 1]], "risk"),
      q("pi-unpaid", "Purchase Invoice", ["Unpaid purchase invoices", "فواتير مشتريات غير مسددة"], ["Submitted, outstanding > 0", "معتمدة والرصيد المستحق أكبر من صفر"], [co(c), SUB, ["outstanding_amount", ">", 0]], "risk"),
      q("sc", "Supplier Scorecard", ["Supplier scorecards", "بطاقات تقييم الموردين"], ["Defined scorecards", "بطاقات معرّفة"], [], "info")],
    native: [["Buying", "Supplier Reports"], ["Buying", "Setup"]],
    setup: [],
  },
  /* ---------------- Inventory ---------------- */
  "INV-MASTER": {
    registers: ["Item", "Warehouse", "Item Price"],
    quick: () => [
      q("item-stock", "Item", ["Stock items", "أصناف مخزنية"], ["Maintain stock = 1, enabled", "أصناف مخزنية مفعّلة"], [["is_stock_item", "=", 1], ["disabled", "=", 0]], "info"),
      q("item-disabled", "Item", ["Disabled items", "أصناف معطّلة"], ["Disabled", "معطّلة"], [["disabled", "=", 1]], "risk"),
      q("wh", "Warehouse", ["Warehouses", "المستودعات"], ["Not group warehouses", "مستودعات غير تجميعية"], [["is_group", "=", 0]], "info"),
      q("ip", "Item Price", ["Price entries", "سجلات الأسعار"], ["All item prices", "كل أسعار الأصناف"], [], "info")],
    native: [["Stock", "Item Reports"], ["Stock", "Setup"]],
    setup: ["Stock Settings"],
  },
  "INV-MOVE": {
    registers: ["Stock Entry", "Material Request", "Delivery Note", "Purchase Receipt"],
    quick: (c) => [drafts(c, "Stock Entry", ["Draft stock entries", "قيود مخزون مسودة"]),
      q("se-transfer", "Stock Entry", ["Material transfers", "تحويلات المواد"], ["Submitted, Material Transfer", "معتمدة وتحويل مواد"], [co(c), SUB, ["stock_entry_type", "=", "Material Transfer"]], "info"),
      q("mr-transfer", "Material Request", ["Transfer requests", "طلبات تحويل"], ["Submitted Material Transfer requests", "طلبات تحويل معتمدة"], [co(c), SUB, ["material_request_type", "=", "Material Transfer"]]),
      drafts(c, "Material Request", ["Draft material requests", "طلبات مواد مسودة"])],
    native: [["Stock", "Movement Reports"], ["Stock", "Tools"]],
    setup: ["Stock Settings"],
  },
  "INV-CONTROL": {
    registers: ["Stock Reconciliation", "Serial No", "Batch", "Quality Inspection"],
    quick: (c) => [drafts(c, "Stock Reconciliation", ["Draft stock counts", "جرد مخزون مسودة"]),
      q("sr-sub", "Stock Reconciliation", ["Submitted stock counts", "جرد مخزون معتمد"], ["Submitted", "معتمدة"], [co(c), SUB], "info"),
      q("serial-active", "Serial No", ["Active serial numbers", "أرقام تسلسلية نشطة"], ["Status Active", "بحالة نشط"], [["status", "=", "Active"]], "info"),
      q("batch", "Batch", ["Batches", "الدفعات"], ["Not disabled", "غير معطّلة"], [["disabled", "=", 0]], "info")],
    native: [["Stock", "Serial & Batch Reports"]],
    setup: ["Stock Settings"],
  },
  "INV-REPORT": {
    registers: ["Stock Ledger Entry", "Stock Entry", "Stock Reconciliation"],
    quick: (c) => [drafts(c, "Stock Entry", ["Draft stock entries", "قيود مخزون مسودة"]), drafts(c, "Stock Reconciliation", ["Draft stock counts", "جرد مخزون مسودة"]),
      q("sle", "Stock Ledger Entry", ["Stock ledger rows", "قيود دفتر المخزون"], ["Posted, not cancelled", "مرحّلة وغير ملغاة"], [co(c), ["is_cancelled", "=", 0]], "info"),
      q("se-month", "Stock Entry", ["Stock entries this month", "قيود مخزون هذا الشهر"], ["Submitted in the as-of month", "معتمدة خلال شهر التقرير"], [co(c), SUB, ["posting_date", "between", [c.monthFrom, c.asOf]]], "info")],
    native: [["Stock", "Stock Reports"], ["Stock", "Audit Reports"]],
    setup: [],
  },
  /* ---------------- Fixed assets ---------------- */
  "AST-REGISTER": {
    registers: ["Asset", "Asset Capitalization", "Asset Category"],
    quick: (c) => [drafts(c, "Asset", ["Draft assets", "أصول مسودة"]),
      q("ast-sub", "Asset", ["Submitted assets", "أصول معتمدة"], ["Submitted", "معتمدة"], [co(c), SUB], "info"),
      drafts(c, "Asset Capitalization", ["Draft capitalizations", "رسملة مسودة"]),
      q("ast-cat", "Asset Category", ["Asset categories", "فئات الأصول"], ["Defined categories", "فئات معرّفة"], [], "info")],
    native: [["Assets", "Asset Reports"], ["Assets", "Setup"]],
    setup: [],
  },
  "AST-CUSTODY": {
    registers: ["Asset Movement", "Asset", "Location"],
    quick: (c) => [drafts(c, "Asset Movement", ["Draft asset movements", "حركات أصول مسودة"]),
      q("am-sub", "Asset Movement", ["Submitted movements", "حركات معتمدة"], ["Submitted", "معتمدة"], [co(c), SUB], "info"),
      q("ast-noloc", "Asset", ["Assets without location", "أصول بلا موقع"], ["Submitted, location not set", "معتمدة ولم يُحدد موقعها"], [co(c), SUB, ["location", "is", "not set"]], "risk"),
      q("loc", "Location", ["Locations", "المواقع"], ["Defined locations", "مواقع معرّفة"], [], "info")],
    native: [["Assets", "Asset Reports"]],
    setup: [],
  },
  "AST-DEP": {
    registers: ["Asset Depreciation Schedule", "Asset Value Adjustment", "Journal Entry"],
    quick: (c) => [
      q("ads-active", "Asset Depreciation Schedule", ["Active depreciation schedules", "جداول إهلاك نشطة"], ["Submitted, status Active", "معتمدة وبحالة نشط"], [co(c), SUB, ["status", "=", "Active"]], "info"),
      drafts(c, "Asset Value Adjustment", ["Draft value adjustments", "تعديلات قيمة مسودة"]),
      q("je-dep", "Journal Entry", ["Depreciation entries", "قيود الإهلاك"], ["Submitted, voucher type Depreciation Entry", "معتمدة ونوعها قيد إهلاك"], [co(c), SUB, ["voucher_type", "=", "Depreciation Entry"]], "info"),
      drafts(c, "Asset Depreciation Schedule", ["Draft depreciation schedules", "جداول إهلاك مسودة"])],
    native: [["Assets", "Asset Reports"]],
    setup: ["Finance Book"],
  },
  "AST-SERVICE": {
    registers: ["Asset Maintenance", "Asset Repair", "Asset Maintenance Log"],
    quick: (c) => [
      q("rep-pending", "Asset Repair", ["Repairs pending", "إصلاحات قيد الانتظار"], ["Repair status Pending", "حالة الإصلاح قيد الانتظار"], [co(c), ["repair_status", "=", "Pending"]], "risk"),
      drafts(c, "Asset Repair", ["Draft repairs", "إصلاحات مسودة"]),
      q("aml-planned", "Asset Maintenance Log", ["Planned maintenance", "صيانة مخططة"], ["Maintenance status Planned", "حالة الصيانة مخططة"], [["maintenance_status", "=", "Planned"]]),
      q("aml-overdue", "Asset Maintenance Log", ["Overdue maintenance", "صيانة متأخرة"], ["Maintenance status Overdue", "حالة الصيانة متأخرة"], [["maintenance_status", "=", "Overdue"]], "risk")],
    native: [["Assets", "Asset Reports"]],
    setup: ["Asset Maintenance Team"],
  },
};

/** Native Workspace card entries (source: workspaces.json Card Break groups). A "Setup" card lands in Settings & configuration. */
export function nativeCardEntries(workspaces: Workspace[], cards: [string, string][]): HubEntry[] {
  const out: HubEntry[] = [];
  for (const [ws, card] of cards) {
    const w = workspaces.find((x) => x.name === ws); if (!w) continue;
    let cur: string | null = null;
    for (const l of w.links) {
      if (l.type === "Card Break") { cur = l.label; continue; }
      if (cur !== card || !l.link_to) continue;
      const source = `native:${ws}/${card}`;
      const group = card === "Setup" ? "settings" as const : undefined;
      if (l.link_type === "DocType") out.push({ label: l.label || l.link_to, target: { kind: "doctype", doctype: l.link_to }, source, ...(group ? { group } : {}) });
      else if (l.link_type === "Report") out.push({ label: l.label || l.link_to, target: { kind: "report", report: l.link_to }, source });
      else if (l.link_type === "Page") out.push({ label: l.label || l.link_to, target: { kind: "page", page: l.link_to }, source });
    }
  }
  return out;
}

const navEntry = (i: NavItem, source: string): HubEntry | null => {
  const t = i.target; const hint = i.hint;
  const base = { label: i.label, source, ...(hint ? { hint } : {}) };
  if (t.kind === "doctype") return { ...base, target: { kind: "doctype", doctype: t.doctype, ...(t.filters ? { filters: t.filters } : {}) } };
  if (t.kind === "tree") return { ...base, target: { kind: "tree", doctype: t.doctype } };
  if (t.kind === "report") return { ...base, target: { kind: "report", report: t.report } };
  if (t.kind === "page") return { ...base, target: { kind: "page", page: t.page } };
  if (t.kind === "pro") return { ...base, target: { kind: "app", key: JSON.stringify({ to: t.to, search: t.search ?? {} }) } };
  return null; // department / section / data tools / missing resources are not hub destinations
};

/**
 * DOCUMENT placements of the approved Run11.1 contract (PLACEMENTS_448_RUN11_1.csv, [placement id, DocType]) whose native
 * DocType is not already an entry of the workspace hub. They are exposed as list/form destinations in "Related documents
 * & ledgers" only — no new DocType, record or calculation. Child tables (Sales Invoice Item, Purchase Order Item, Stock
 * Entry Detail, Item Reorder) appear as rows inside Document 360; "Asset Disposal" is not a DocType in this source.
 */
export const RELATED_PLACEMENTS: Record<string, [string, string][]> = {
  "ACC-OPS": [["DOC-ACC-OPS-03", "GL Entry"]],
  "ACC-REPORT": [["DOC-ACC-REPORT-01", "Account"], ["DOC-ACC-REPORT-02", "Journal Entry"], ["DOC-ACC-REPORT-03", "GL Entry"]],
  "SEL-SALES": [["DOC-SEL-SALES-03", "Customer"], ["DOC-SEL-SALES-04", "Item"], ["DOC-SEL-SALES-05", "Price List"]],
  "SEL-CUSTOMER": [["DOC-SEL-CUSTOMER-02", "Contact"], ["DOC-SEL-CUSTOMER-03", "Address"], ["DOC-SEL-CUSTOMER-05", "Sales Invoice"], ["DOC-SEL-CUSTOMER-06", "Payment Entry"]],
  "SEL-FULFILL": [["DOC-SEL-FULFILL-01", "Sales Order"], ["DOC-SEL-FULFILL-05", "Stock Entry"]],
  "SEL-INTEL": [["DOC-SEL-INTEL-02", "Sales Order"], ["DOC-SEL-INTEL-05", "Sales Person"]],
  "PUR-SOURCE": [["DOC-PUR-SOURCE-04", "Supplier"], ["DOC-PUR-SOURCE-05", "Item"]],
  "PUR-ORDERS": [["DOC-PUR-ORDERS-03", "Purchase Receipt"], ["DOC-PUR-ORDERS-04", "Purchase Invoice"]],
  "PUR-RECEIVE": [["DOC-PUR-RECEIVE-03", "Purchase Order"], ["DOC-PUR-RECEIVE-04", "Quality Inspection"]],
  "PUR-SUPPLIER": [["DOC-PUR-SUPPLIER-02", "Purchase Order"], ["DOC-PUR-SUPPLIER-03", "Purchase Receipt"], ["DOC-PUR-SUPPLIER-05", "Payment Entry"]],
  "INV-MASTER": [["DOC-INV-MASTER-04", "Stock Ledger Entry"]],
  "INV-MOVE": [["DOC-INV-MOVE-05", "Warehouse"]],
  "INV-CONTROL": [["DOC-INV-CONTROL-05", "Stock Ledger Entry"]],
  "INV-REPORT": [["DOC-INV-REPORT-02", "GL Entry"], ["DOC-INV-REPORT-03", "Item"], ["DOC-INV-REPORT-04", "Warehouse"], ["DOC-INV-REPORT-05", "Stock Closing Entry"]],
  "AST-REGISTER": [["DOC-AST-REGISTER-04", "Asset Movement"], ["DOC-AST-REGISTER-05", "Asset Depreciation Schedule"]],
  "AST-DEP": [["DOC-AST-DEP-01", "Asset"], ["DOC-AST-DEP-04", "GL Entry"]],
  "AST-SERVICE": [["DOC-AST-SERVICE-01", "Asset"], ["DOC-AST-SERVICE-04", "Asset Movement"]],
};

/** Every hub entry of a workspace, in source order: workspace navigation → native cards → department setup. */
export function hubEntries(page: SectionPage, hub: ProHub, workspaces: Workspace[]): HubEntry[] {
  const dept = deptById(page.dept);
  const own = pageItems(page).map((i) => navEntry(i, `pro-nav:${page.nav.join("+")}`)).filter((e): e is HubEntry => !!e);
  const setupItems = (dept?.extra ?? []).filter((g) => g.section === "setup").flatMap((g) => g.items).filter((i) => (i.target.kind === "doctype" || i.target.kind === "tree") && hub.setup.includes(i.target.doctype));
  const setupListed = new Set(setupItems.map((i) => (i.target as { doctype: string }).doctype));
  const extraSetup = hub.setup.filter((d) => !setupListed.has(d)).map((d): HubEntry => ({ label: d, target: { kind: "doctype", doctype: d }, group: "settings", source: "pro-hub:setup" }));
  const base = [
    ...own,
    ...nativeCardEntries(workspaces, hub.native),
    ...setupItems.map((i) => ({ ...navEntry(i, `pro-nav:${page.dept}-setup`)!, group: "settings" as const })),
    ...extraSetup,
  ];
  const have = new Set(base.flatMap((e) => (e.target.kind === "tree" || (e.target.kind === "doctype" && !e.target.filters) ? [e.target.doctype] : [])));
  const related = (RELATED_PLACEMENTS[page.id] ?? []).filter(([, dt]) => !have.has(dt) && !hub.registers.includes(dt))
    .map(([id, dt]): HubEntry => ({ label: dt, target: { kind: "doctype", doctype: dt }, group: "related", source: `placement:${id}` }));
  return [...base, ...related];
}
