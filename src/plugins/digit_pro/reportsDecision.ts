/**
 * EC-R1 Phase 8 — Reports Center decision zone (blueprint 04_REPORTS_AND_DESIGN_SYSTEM §Reports Center).
 * A curated, role-grouped selection of reports that answer recurring decisions. Every entry points at an existing
 * DIGIT Pro screen or a catalog ERPNext report (no new report engine); purpose/basis text explains what the report
 * measures, and "latest record" shows how fresh the permitted source is (never a value, never a claim of real-time).
 * The full directory (every department report and catalog report) stays available under "All reports".
 */
import type { ReportEntry } from "@/lib/catalog";
import { scopedList } from "@/lib/scope";
import { userRoles } from "@/lib/session";
import { sourceStatus, todayIso, type SourceStatus } from "./finance";
import { postedStockSources } from "./stockSources";
import type { NavTarget, ProRoute } from "./nav";
import type { CenterEntry, ReportKind } from "./reportsCenter";

export type DecisionTab = "cfo" | "sales" | "procurement" | "inventory" | "assets";
export type CenterTab = DecisionTab | "mine" | "all";
export const CENTER_TABS: CenterTab[] = ["cfo", "sales", "procurement", "inventory", "assets", "mine", "all"];
type Bi = [string, string];
/** Source used for the "latest record" freshness line. `ledger` = non-cancelled ledger rows; `posted` = docstatus 1. */
export interface Freshness { doctype: string; field: string; mode: "ledger" | "posted" | "stock" }
export interface DecisionItem { id: string; label: string; target: Extract<NavTarget, { kind: "pro" } | { kind: "report" }>; purpose: Bi; basis: Bi; fresh?: Freshness }
export interface DecisionGroup { id: DecisionTab; label: Bi; intro: Bi; items: DecisionItem[] }

const pro = (to: ProRoute) => ({ kind: "pro" as const, to });
const rep = (report: string) => ({ kind: "report" as const, report });
const GL: Freshness = { doctype: "GL Entry", field: "posting_date", mode: "ledger" };
const SI: Freshness = { doctype: "Sales Invoice", field: "posting_date", mode: "posted" };
const PI: Freshness = { doctype: "Purchase Invoice", field: "posting_date", mode: "posted" };
const PO: Freshness = { doctype: "Purchase Order", field: "transaction_date", mode: "posted" };
const SLE: Freshness = { doctype: "Stock Ledger Entry", field: "posting_date", mode: "stock" };
const AST: Freshness = { doctype: "Asset", field: "purchase_date", mode: "posted" };

export const DECISION_GROUPS: DecisionGroup[] = [
  { id: "cfo", label: ["CFO", "المدير المالي"], intro: ["Booked results, balances and close readiness from posted ledger entries.", "النتائج والأرصدة وجاهزية الإقفال من قيود الأستاذ المرحّلة."], items: [
    { id: "fi", label: "Finance Intelligence", target: pro("/pro/finance-intelligence"), purpose: ["How did income, expense and net move against the previous period?", "كيف تحرّكت الإيرادات والمصروفات والصافي مقارنة بالفترة السابقة؟"], basis: ["Native Profit and Loss on posted ledger entries; same-length previous period", "قائمة الأرباح والخسائر الأصلية على القيود المرحّلة؛ فترة سابقة بالطول نفسه"], fresh: GL },
    { id: "statements", label: "Financial Statements", target: pro("/pro/statements"), purpose: ["What are profit, financial position and cash flow for the period?", "ما الربح والمركز المالي والتدفق النقدي للفترة؟"], basis: ["Native P&L, Balance Sheet and Cash Flow runners", "تقارير الأرباح والخسائر والميزانية والتدفق النقدي الأصلية"], fresh: GL },
    { id: "tb", label: "Trial Balance", target: pro("/pro/trial-balance"), purpose: ["Do debits equal credits, and which accounts carry the balance?", "هل يتساوى المدين والدائن، وما الحسابات التي تحمل الرصيد؟"], basis: ["Native Trial Balance with hierarchy and balance checks", "ميزان المراجعة الأصلي مع الشجرة وفحوص التوازن"], fresh: GL },
    { id: "gl", label: "General Ledger", target: pro("/pro/general-ledger"), purpose: ["Which vouchers make up an account or party balance?", "ما القيود التي تكوّن رصيد حساب أو طرف؟"], basis: ["Posted, non-cancelled ledger entries with running balance", "قيود الأستاذ المرحّلة غير الملغاة مع الرصيد الجاري"], fresh: GL },
    { id: "ar", label: "Receivables", target: pro("/pro/receivables"), purpose: ["Who owes us, and how overdue is it?", "من يدين لنا، وما مدى التأخر؟"], basis: ["Outstanding on submitted sales invoices as of a date, by due date", "المبالغ القائمة على فواتير المبيعات المعتمدة في تاريخ محدد، حسب الاستحقاق"], fresh: SI },
    { id: "ap", label: "Payables", target: pro("/pro/payables"), purpose: ["What do we owe, and when does it fall due?", "ما المستحق علينا، ومتى يحين موعده؟"], basis: ["Outstanding on submitted purchase invoices as of a date, by due date", "المبالغ القائمة على فواتير المشتريات المعتمدة في تاريخ محدد، حسب الاستحقاق"], fresh: PI },
    { id: "bank", label: "Bank Reconciliation", target: pro("/pro/bank-reconciliation"), purpose: ["Which bank lines are not yet matched to vouchers?", "ما سطور البنك غير المطابقة مع القيود بعد؟"], basis: ["Submitted bank transactions and their allocations", "حركات البنك المعتمدة وتخصيصاتها"], fresh: { doctype: "Bank Transaction", field: "date", mode: "posted" } },
    { id: "close", label: "Period Control", target: pro("/pro/period-control"), purpose: ["What still blocks closing this period?", "ما الذي يعيق إقفال هذه الفترة؟"], basis: ["Drafts, unreconciled lines, open credits and ledger checks for the period", "المسودات والسطور غير المطابقة والأرصدة المفتوحة وفحوص الأستاذ للفترة"], fresh: GL },
  ] },
  { id: "sales", label: ["Sales", "المبيعات"], intro: ["Invoiced sales, margins, billing gaps and collections.", "المبيعات المفوترة والهوامش وفجوات الفوترة والتحصيل."], items: [
    { id: "sa", label: "Sales Analytics", target: pro("/pro/sales-analytics"), purpose: ["Which customers, items or territories drive sales each month?", "ما العملاء أو الأصناف أو المناطق التي تقود المبيعات كل شهر؟"], basis: ["Submitted sales documents by posting month, with document drill-down", "مستندات المبيعات المعتمدة حسب شهر الترحيل مع الوصول للمستند"], fresh: SI },
    { id: "coll", label: "Collections", target: pro("/pro/collections"), purpose: ["Which overdue customers should we contact first?", "أي العملاء المتأخرين نتواصل معهم أولًا؟"], basis: ["Overdue outstanding on submitted sales invoices", "المبالغ المتأخرة القائمة على فواتير المبيعات المعتمدة"], fresh: SI },
    { id: "gp", label: "Gross Profit", target: rep("Gross Profit"), purpose: ["Which invoices and items earn the margin?", "ما الفواتير والأصناف التي تحقق الهامش؟"], basis: ["Native Gross Profit report on submitted sales invoices", "تقرير مجمل الربح الأصلي على فواتير المبيعات المعتمدة"], fresh: SI },
    { id: "dtb", label: "Delivered Items To Be Billed", target: rep("Delivered Items To Be Billed"), purpose: ["What has been delivered but not invoiced?", "ما الذي سُلِّم ولم يُفوتر بعد؟"], basis: ["Native report on submitted delivery notes", "تقرير أصلي على إشعارات التسليم المعتمدة"], fresh: { doctype: "Delivery Note", field: "posting_date", mode: "posted" } },
  ] },
  { id: "procurement", label: ["Procurement", "المشتريات"], intro: ["Open commitments, receipts waiting for invoices and supplier balances.", "الالتزامات المفتوحة والاستلامات بانتظار الفواتير وأرصدة الموردين."], items: [
    { id: "opo", label: "Open Purchase Orders", target: pro("/pro/open-purchase-orders"), purpose: ["Which order lines are still to receive or bill, and which are late?", "ما سطور الأوامر التي لم تُستلم أو تُفوتر بعد، وما المتأخر منها؟"], basis: ["Submitted purchase orders, per line, in the order currency", "أوامر الشراء المعتمدة لكل سطر بعملة الأمر"], fresh: PO },
    { id: "poa", label: "Purchase Order Analysis", target: rep("Purchase Order Analysis"), purpose: ["How far has each order progressed through receipt and billing?", "إلى أي مدى تقدّم كل أمر في الاستلام والفوترة؟"], basis: ["Native report on submitted purchase orders", "تقرير أصلي على أوامر الشراء المعتمدة"], fresh: PO },
    { id: "rtb", label: "Received Items To Be Billed", target: rep("Received Items To Be Billed"), purpose: ["What has been received but not invoiced by the supplier?", "ما الذي استُلم ولم يُفوتره المورد بعد؟"], basis: ["Native report on submitted purchase receipts", "تقرير أصلي على إيصالات الشراء المعتمدة"], fresh: { doctype: "Purchase Receipt", field: "posting_date", mode: "posted" } },
    { id: "sls", label: "Supplier Ledger Summary", target: rep("Supplier Ledger Summary"), purpose: ["How did each supplier balance move in the period?", "كيف تحرّك رصيد كل مورد خلال الفترة؟"], basis: ["Native report on posted ledger entries", "تقرير أصلي على قيود الأستاذ المرحّلة"], fresh: GL },
  ] },
  { id: "inventory", label: ["Inventory", "المخزون"], intro: ["Quantities and values by warehouse, movements and ageing.", "الكميات والقيم حسب المستودع والحركات والتقادم."], items: [
    { id: "sb", label: "Stock Balance", target: pro("/pro/stock-balance"), purpose: ["How much stock is on hand, and where is it short?", "كم المخزون المتاح، وأين النقص؟"], basis: ["Current Bin quantities and values per warehouse", "الكميات والقيم الحالية لكل مستودع"], fresh: SLE },
    { id: "sl", label: "Stock Ledger", target: pro("/pro/stock-ledger"), purpose: ["Which documents moved this item, and by how much value?", "ما المستندات التي حرّكت هذا الصنف، وبأي قيمة؟"], basis: ["Posted, non-cancelled stock ledger entries", "قيود دفتر المخزون المرحّلة غير الملغاة"], fresh: SLE },
    { id: "age", label: "Stock Ageing", target: rep("Stock Ageing"), purpose: ["How long has stock been sitting in each warehouse?", "منذ متى والمخزون راكد في كل مستودع؟"], basis: ["Native report on posted stock ledger entries", "تقرير أصلي على قيود دفتر المخزون المرحّلة"], fresh: SLE },
    { id: "short", label: "Item Shortage Report", target: rep("Item Shortage Report"), purpose: ["Which items are projected below zero?", "ما الأصناف المتوقع أن تنخفض دون الصفر؟"], basis: ["Native report on warehouse projected quantities", "تقرير أصلي على الكميات المتوقعة في المستودعات"], fresh: SLE },
  ] },
  { id: "assets", label: ["Assets", "الأصول"], intro: ["Asset register, depreciation and book values.", "سجل الأصول والإهلاك والقيم الدفترية."], items: [
    { id: "reg", label: "All Assets", target: pro("/pro/asset-register"), purpose: ["Which assets do we hold, where, and at what book value?", "ما الأصول التي نملكها، وأين، وبأي قيمة دفترية؟"], basis: ["Native asset records within company, as-of date and finance book", "سجلات الأصول الأصلية ضمن الشركة والتاريخ والدفتر المالي"], fresh: AST },
    { id: "dep", label: "Depreciation Review", target: pro("/pro/depreciation"), purpose: ["Which depreciation rows are due, linked or upcoming?", "ما صفوف الإهلاك المستحقة أو المرتبطة أو القادمة؟"], basis: ["Submitted depreciation schedules; booking runs on the DIGIT server", "جداول الإهلاك المعتمدة؛ القيد يتم على خادم DIGIT"] },
    { id: "far", label: "Fixed Asset Register", target: rep("Fixed Asset Register"), purpose: ["What is the cost, depreciation and value of every asset?", "ما تكلفة كل أصل وإهلاكه وقيمته؟"], basis: ["Native Fixed Asset Register report", "تقرير سجل الأصول الثابتة الأصلي"], fresh: AST },
    { id: "adl", label: "Asset Depreciation Ledger", target: rep("Asset Depreciation Ledger"), purpose: ["Which depreciation entries were booked, and when?", "ما قيود الإهلاك التي سُجّلت ومتى؟"], basis: ["Native report on depreciation journal entries", "تقرير أصلي على قيود الإهلاك"] },
  ] },
];

/** Default tab by the session's roles (accounting first; a pure sales, purchase or stock user starts on their area). */
export function defaultTab(roles: string[]): DecisionTab {
  const has = (r: RegExp) => roles.some((x) => r.test(x));
  if (roles.includes("Administrator") || roles.includes("System Manager") || has(/^Accounts /)) return "cfo";
  if (has(/^Sales /)) return "sales";
  if (has(/^Purchase /)) return "procurement";
  if (has(/^Stock /)) return "inventory";
  if (has(/^Asset|Quality Manager/)) return "assets";
  return "cfo";
}
export const defaultTabFor = (user: string) => defaultTab(userRoles(user));
export const asTab = (v: string | undefined): CenterTab | undefined => (CENTER_TABS as string[]).includes(v ?? "") ? (v as CenterTab) : undefined;

export interface ResolvedDecision extends DecisionItem { kind: ReportKind; centerKey: string | undefined; companyFilter: boolean; available: boolean }
/** Attach the directory's kind/favorite key and whether the destination accepts a company filter. A report missing
 * from the catalog stays listed as unavailable (never silently dropped). */
export function resolveDecisions(group: DecisionGroup, reports: ReportEntry[], center: CenterEntry[], runnable: (n: string) => boolean): ResolvedDecision[] {
  const byName = new Map(reports.map((r) => [r.name, r]));
  return group.items.map((it) => {
    const t = it.target;
    const match = center.find((e) => e.item.target.kind === t.kind && (t.kind === "pro" ? (e.item.target as { to: string }).to === t.to : (e.item.target as { report: string }).report === t.report));
    if (t.kind === "pro") return { ...it, kind: "pro" as const, centerKey: match?.key, companyFilter: true, available: true };
    const r = byName.get(t.report);
    return { ...it, kind: !r ? "missing" as const : runnable(t.report) || r.status === "preview-computable" ? "preview" as const : "server" as const, centerKey: match?.key, companyFilter: !!r?.filters?.some((f) => f.fieldname === "company"), available: !!r };
  });
}
/** Search for the destination link: the selected company only where the destination has a company filter. */
export const decisionSearch = (d: Pick<ResolvedDecision, "companyFilter">, company: string): Record<string, string> => (d.companyFilter && company ? { company } : {});

export interface FreshState { status: SourceStatus; latest: string | undefined; future: number; count: number }
/** Latest permitted source date on or before `today` for the company — posted/non-cancelled only; stock rows by
 * warehouse owner. Rows dated after today are counted separately, never shown as the latest record. */
export function freshness(f: Freshness, company: string, user: string, today = todayIso()): FreshState {
  if (f.mode === "stock") {
    const s = postedStockSources(company || undefined, user);
    if (s.status !== "ok") return { status: s.status, latest: undefined, future: 0, count: 0 };
    return summarize(s.rows.map((d) => String(d[f.field] ?? "")), today);
  }
  const st = sourceStatus(f.doctype, user);
  if (st !== "ok") return { status: st, latest: undefined, future: 0, count: 0 };
  const rows = scopedList(f.doctype, user).filter((d) => (!company || d["company"] === company)
    && (f.mode === "ledger" ? !Number(d["is_cancelled"]) && Number(d.docstatus ?? 1) !== 2 : Number(d.docstatus) === 1));
  return summarize(rows.map((d) => String(d[f.field] ?? "")), today);
}
function summarize(dates: string[], today: string): FreshState {
  const ok = dates.filter((x) => /^\d{4}-\d{2}-\d{2}/.test(x)).map((x) => x.slice(0, 10)).sort();
  const past = ok.filter((x) => x <= today);
  return { status: "ok", latest: past.at(-1), future: ok.length - past.length, count: dates.length };
}
