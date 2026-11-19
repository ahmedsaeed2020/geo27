import type { NavGroup, NavItem, NavTarget } from "./nav";

/**
 * OWN-34 — the approved accounting architecture. The All Accounting directory is grouped by these twelve areas (in this
 * order); the four Accounting workspaces stay as approved. Every entry of the department's own groups is placed in exactly
 * one area, so the directory loses nothing: an entry no rule names falls back to the area of the group it came from.
 */
export const ACC_AREAS = [
  { id: "acc-area-overview", label: "Financial overview", ar: "النظرة المالية العامة", section: "workflow" },
  { id: "acc-area-coa", label: "Chart of Accounts & Dimensions", ar: "دليل الحسابات والأبعاد", section: "workflow" },
  { id: "acc-area-gl", label: "General Ledger", ar: "الأستاذ العام", section: "workflow" },
  { id: "acc-area-journals", label: "Journals", ar: "القيود اليومية", section: "workflow" },
  { id: "acc-area-ar", label: "Accounts Receivable", ar: "الذمم المدينة", section: "workflow" },
  { id: "acc-area-ap", label: "Accounts Payable", ar: "الذمم الدائنة", section: "workflow" },
  { id: "acc-area-treasury", label: "Treasury & Banking", ar: "الخزينة والبنوك", section: "workflow" },
  { id: "acc-area-close", label: "Financial Close", ar: "الإقفال المالي", section: "reports" },
  { id: "acc-area-reporting", label: "Financial Reporting & Intelligence", ar: "التقارير والتحليلات المالية", section: "reports" },
  { id: "acc-area-budget", label: "Budgeting & Forecasting", ar: "الموازنات والتنبؤات", section: "reports" },
  { id: "acc-area-tax", label: "Tax & Audit", ar: "الضرائب والتدقيق", section: "reports" },
  { id: "acc-area-config", label: "Accounting Configuration", ar: "إعدادات المحاسبة", section: "setup" },
] as const;
type AreaId = (typeof ACC_AREAS)[number]["id"];

export const areaKey = (t: NavTarget): string => {
  const x = t as Record<string, unknown>;
  return `${t.kind}:${String(x["doctype"] ?? x["report"] ?? x["to"] ?? x["page"] ?? "")}`;
};

const A = (id: string) => `acc-area-${id}` as AreaId;
/** Entry → area, by target (filtered lists follow their DocType). */
const RULES: Record<string, AreaId> = {};
const put = (id: string, keys: string[]) => keys.forEach((k) => { RULES[k] = A(id); });
put("overview", ["pro:/pro/finance", "pro:/pro/finance-intelligence", "core:/finance/risks"]);
put("coa", ["pro:/pro/accounts", "tree:Account", "doctype:Account", "pro:/pro/cost-centers", "tree:Cost Center", "doctype:Cost Center", "doctype:Accounting Dimension", "doctype:Cost Center Allocation", "doctype:Finance Book"]);
put("gl", ["pro:/pro/general-ledger", "pro:/pro/trial-balance", "report:General Ledger", "report:Trial Balance", "report:Account Balance", "report:General and Payment Ledger Comparison", "report:Voucher-wise Balance", "report:Trial Balance for Party"]);
put("journals", ["doctype:Journal Entry", "doctype:Journal Entry Template", "core:/finance/recurring", "doctype:Exchange Rate Revaluation", "doctype:Process Deferred Accounting", "doctype:Opening Invoice Creation Tool"]);
put("ar", ["pro:/pro/receivables", "core:/finance/collections", "doctype:Sales Invoice", "doctype:Customer", "doctype:Dunning", "doctype:Dunning Type", "report:Accounts Receivable", "report:Accounts Receivable Summary", "report:Customer Ledger Summary", "report:Payment Period Based On Invoice Date", "core:/finance/netting", "report:Customer Credit Balance", "report:Sales Register", "report:Item-wise Sales Register", "report:Gross Profit", "report:Sales Analytics"]);
put("ap", ["pro:/pro/payables", "core:/finance/payment-run", "core:/finance/ap-control", "doctype:Purchase Invoice", "doctype:Supplier", "report:Accounts Payable", "report:Accounts Payable Summary", "report:Supplier Ledger Summary", "report:Purchase Register", "report:Item-wise Purchase Register", "report:Purchase Analytics", "report:Purchase Price Variance"]);
put("treasury", ["doctype:Payment Entry", "pro:/pro/payments", "doctype:Payment Request", "doctype:Payment Reconciliation", "doctype:Unreconcile Payment", "report:Payment Ledger", "pro:/pro/bank-reconciliation", "core:/finance/bank-matching", "doctype:Bank Account", "doctype:Bank Transaction", "doctype:Bank", "doctype:Bank Reconciliation Tool", "doctype:Bank Statement Import", "doctype:Bank Guarantee", "doctype:Mode of Payment", "doctype:Cheque Print Template", "report:Bank Reconciliation Statement", "report:Bank Clearance Summary"]);
put("close", ["pro:/pro/period-control", "core:/finance/close", "doctype:Accounting Period", "doctype:Period Closing Voucher", "doctype:Fiscal Year"]);
put("reporting", ["pro:/pro/statements", "core:/finance/consolidation", "core:/finance/statements", "report:Profit and Loss Statement", "report:Balance Sheet", "report:Cash Flow", "report:Gross and Net Profit Report", "report:Dimension-wise Accounts Balance Report", "report:Profitability Analysis", "report:Stock Ledger", "report:Stock Balance", "report:Batch-Wise Balance History", "report:Warehouse wise Item Balance Age and Value", "report:Fixed Asset Register", "report:Asset Depreciation Ledger", "report:Asset Depreciations and Balances", "report:Asset Rollforward"]);
put("budget", ["doctype:Budget", "report:Budget Variance Report", "core:/finance/cash-forecast", "report:Deferred Revenue and Expense"]);
put("tax", ["pro:/pro/vat", "core:/tax/vat-return", "core:/tax/zakat", "core:/tax/e-invoicing", "report:Tax Withholding Details", "pro:/pro/audit", "doctype:Version", "doctype:Tax Withholding Category"]);
/** Fallback: the area of the workspace group an unnamed entry came from. */
const BY_GROUP: Record<string, AreaId> = { "acc-ops": A("journals"), "acc-dues": A("ar"), "acc-cash": A("treasury"), "acc-reports": A("reporting"), "acc-control": A("close"), "acc-setup": A("config"), "acc-impact": A("reporting") };

export const areaOf = (i: NavItem, groupId: string | undefined): AreaId | undefined => RULES[areaKey(i.target)] ?? BY_GROUP[groupId ?? ""];

/** The twelve areas (non-empty, approved order) followed by the groups no area takes (data tools). */
export function accountingAreas(home: NavItem, groups: NavGroup[]): NavGroup[] {
  const into = new Map<AreaId, NavItem[]>(ACC_AREAS.map((a) => [a.id, []]));
  const seen = new Set<string>();
  const add = (a: AreaId, i: NavItem) => { const k = `${i.label}|${JSON.stringify(i.target)}`; if (seen.has(k)) return; seen.add(k); into.get(a)!.push(i); };
  add(A("overview"), home);
  const rest: NavGroup[] = [];
  for (const g of groups) {
    const left = g.items.filter((i) => { const a = areaOf(i, g.id); if (a) add(a, i); return !a; });
    if (left.length) rest.push({ ...g, items: left });
  }
  return [...ACC_AREAS.map((a): NavGroup => ({ id: a.id, label: a.label, section: a.section, items: into.get(a.id)! })).filter((g) => g.items.length), ...rest];
}
