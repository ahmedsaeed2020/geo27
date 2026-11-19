/**
 * DIGIT Pro V4 department dashboard insights (owner master 2026-11-11: V4I-WA-001..069, V4I-WI-001..150). Ids, dashboards
 * and Arabic titles come only from v4Insights.generated.json (scripts/pro-v4-insights.py over the owner register); each id
 * is served by one named formula in v4Formulas.ts and shown as a visible insight line (title · value · drill) on its
 * department dashboard. A role that may not read the source gets no line (hidden), never a zero.
 */
import GEN from "./v4Insights.generated.json";
import * as F from "./v4Formulas";
import { Hidden, type Board, type V4C, type V4Out } from "./v4Kit";
import type { Bi } from "./command";
import type { SectionCtx } from "./sections";

export type { Board };
interface Gen { id: string; board: Board; title_ar: string; source_formula: string; source_drill: string }
/** Owner V4R formulas with no V4I id (V4R-T.TEMPLATE_USE, V4R-I.CAPACITY) are shown on their board under their own register id. */
const EXTRA: Gen[] = [
  { id: "V4R-T.TEMPLATE_USE", board: "vat", title_ar: "استخدام قوالب الضرائب", source_formula: "usage of Sales/Purchase Taxes and Charges Templates", source_drill: "template -> invoices" },
  { id: "V4R-I.CAPACITY", board: "inventory", title_ar: "استغلال سعة المستودعات", source_formula: "warehouse utilisation = stock on hand ÷ recorded capacity", source_drill: "warehouse -> stock balances" },
];
export const V4_SOURCE = [...(GEN as Gen[]), ...EXTRA];
type Fn = (c: V4C) => V4Out;
/** id → [English title, formula]. The Arabic title is the owner's own (generated file). */
const DEF: Record<string, [string, Fn]> = {
  "V4I-WA-001": ["Revenue this month", F.salesMonth], "V4I-WA-002": ["Net profit", F.netProfitYtd], "V4I-WA-003": ["Cash and banks", F.cashBank], "V4I-WA-004": ["Overdue invoices", F.arOverdue],
  "V4I-WA-005": ["Revenue by department", F.revenueByDept], "V4I-WA-006": ["Income vs expenses", F.incomeVsExpense], "V4I-WA-007": ["Top customers", F.topCustomers], "V4I-WA-008": ["Pending approvals", F.unpostedEntries],
  "V4I-WA-009": ["Stock shortages", F.stockShortage], "V4I-WA-010": ["Unposted entries", F.unpostedEntries],
  "V4I-WA-011": ["Cash and banks", F.cashBank], "V4I-WA-012": ["Receivables", F.arTotal], "V4I-WA-013": ["Payables", F.apTotal], "V4I-WA-014": ["VAT", F.vatPosition], "V4I-WA-015": ["Expense breakdown", F.expenseByAccount],
  "V4I-WA-016": ["Cash flow (in/out)", F.cashInOut], "V4I-WA-017": ["Monthly net profit", F.pnlTrend], "V4I-WA-018": ["Bank reconciliation pending", F.bankUnreconciled], "V4I-WA-019": ["Entries awaiting review", F.unpostedEntries], "V4I-WA-020": ["Close readiness", F.closeReadiness],
  "V4I-WA-021": ["Sales this month", F.salesMonth], "V4I-WA-022": ["Open quotations", F.openQuotes], "V4I-WA-023": ["Open orders", F.openOrders], "V4I-WA-024": ["Unpaid", F.arTotal], "V4I-WA-025": ["Sales by item group", F.salesByItemGroup],
  "V4I-WA-026": ["Sales trend", F.salesTrend], "V4I-WA-027": ["Sales by sales person", F.salesByPerson], "V4I-WA-028": ["Quotations to follow up", F.quoteExpiry], "V4I-WA-029": ["Orders not delivered", F.ordersByDelivery], "V4I-WA-030": ["Overdue customers", F.overdueCustomers],
  "V4I-WA-031": ["Purchase spend", F.spendMonth], "V4I-WA-032": ["Open orders", F.openPOs], "V4I-WA-033": ["Received, not billed", F.receivedNotBilled], "V4I-WA-034": ["Unpaid", F.apTotal], "V4I-WA-035": ["Spend by category", F.spendByCategory],
  "V4I-WA-036": ["Spend trend", F.spendTrend], "V4I-WA-037": ["Top suppliers", F.topSuppliers], "V4I-WA-038": ["Requests awaiting quotations", F.pendingRequests], "V4I-WA-039": ["Matching differences", F.matchDiffs], "V4I-WA-040": ["Items below the reorder level", F.belowReorder],
  "V4I-WA-041": ["Stock value", F.stockValue], "V4I-WA-042": ["Below the reorder level", F.belowReorder], "V4I-WA-043": ["Pending transfers", F.pendingTransfers], "V4I-WA-044": ["Stock turnover", F.turnover], "V4I-WA-045": ["Stock by warehouse", F.valueByWarehouse],
  "V4I-WA-046": ["Low-stock items", F.belowReorder], "V4I-WA-047": ["Stock movements", F.stockMoves], "V4I-WA-048": ["Batches near expiry", F.batchExpiry], "V4I-WA-049": ["Pending counts", F.pendingCounts], "V4I-WA-050": ["Transfers awaiting receipt", F.pendingTransfers],
  "V4I-WA-051": ["Total assets", F.assetCount], "V4I-WA-052": ["Asset value", F.assetNbv], "V4I-WA-053": ["New assets (this year)", F.assetAdditions], "V4I-WA-054": ["Depreciation due", F.depreciationDue], "V4I-WA-055": ["Asset value by category", F.byCategory],
  "V4I-WA-056": ["Asset value analysis", F.assetValueAnalysis], "V4I-WA-057": ["Assets by location", F.byLocation], "V4I-WA-058": ["Assets needing maintenance", F.maintenanceNeeded], "V4I-WA-059": ["Assets to scrap", F.disposalCandidates], "V4I-WA-060": ["Depreciation schedules to verify", F.scheduleCheck],
  "V4I-WA-061": ["E-invoicing connection", F.zatcaLink], "V4I-WA-062": ["Invoices issued", F.zatcaIssued], "V4I-WA-063": ["VAT for the period", F.vatPosition], "V4I-WA-064": ["Needs review", F.zatcaReview], "V4I-WA-065": ["Taxable vs exempt sales", F.taxableVsExempt],
  "V4I-WA-066": ["Missing tax data", F.missingTaxData], "V4I-WA-067": ["Output / input VAT", F.vatOutIn], "V4I-WA-068": ["E-invoicing readiness", F.zatcaReadiness], "V4I-WA-069": ["Confirmed status only", F.zatcaWording],
  "V4I-WI-001": ["Cash balance", F.cashBank], "V4I-WI-002": ["Receivables ageing", F.ageing("receivable")], "V4I-WI-003": ["Payables ageing", F.ageing("payable")], "V4I-WI-004": ["VAT position", F.vatPosition], "V4I-WI-005": ["Profit and loss trend", F.pnlTrend],
  "V4I-WI-006": ["Gross profit margin", F.grossMargin], "V4I-WI-007": ["Expenses by category", F.expenseByAccount], "V4I-WI-008": ["Cash flow trend", F.cashInOut], "V4I-WI-009": ["Bank reconciliation status", F.bankReconStatus], "V4I-WI-010": ["Unmatched transactions", F.bankUnreconciled],
  "V4I-WI-011": ["Unposted entries", F.unpostedEntries], "V4I-WI-012": ["Close readiness", F.closeReadiness], "V4I-WI-013": ["Accounts with unusual movement", F.unusualAccounts], "V4I-WI-014": ["Cost center profitability", F.ccProfit(false)], "V4I-WI-015": ["Branch profitability", F.ccProfit(true)],
  "V4I-WI-016": ["Customer profitability", F.customerProfit], "V4I-WI-017": ["Collection trend (DSO)", F.dso], "V4I-WI-018": ["Overdue receivables", F.arOverdue], "V4I-WI-019": ["Overdue payables", F.apOverdue], "V4I-WI-020": ["Open sales invoices", F.arTotal],
  "V4I-WI-021": ["Open purchase invoices", F.apTotal], "V4I-WI-022": ["Ledger movement by account", F.glByAccount], "V4I-WI-023": ["Top expense accounts", F.expenseByAccount], "V4I-WI-024": ["Tax exceptions", F.taxExceptions], "V4I-WI-025": ["Manual journal risk", F.manualJournalRisk],
  "V4I-WI-026": ["Accounting dimension gaps", F.dimensionGaps], "V4I-WI-027": ["Balance sheet movement", F.bsMovement], "V4I-WI-028": ["Supplier exposure", F.supplierExposure], "V4I-WI-029": ["Receipts trend", F.receiptsTrend], "V4I-WI-030": ["Finance exception queue", F.financeExceptions],
  "V4I-WI-031": ["Best sellers this month", F.bestSellerMonth], "V4I-WI-032": ["Best sellers by branch", F.salesByBranch], "V4I-WI-033": ["Best sellers by territory", F.salesByTerritory], "V4I-WI-034": ["Best sellers by sales person", F.salesByPerson], "V4I-WI-035": ["Highest-margin item", F.marginItem(false)],
  "V4I-WI-036": ["Lowest-margin item", F.marginItem(true)], "V4I-WI-037": ["Sales by customer segment", F.salesByCustomerGroup], "V4I-WI-038": ["Open orders by delivery date", F.ordersByDelivery], "V4I-WI-039": ["Quotation conversion rate", F.quoteConversion], "V4I-WI-040": ["Quotation expiry risk", F.quoteExpiry],
  "V4I-WI-041": ["Invoice collection risk", F.collectionRisk], "V4I-WI-042": ["Returns by item", F.returnsByItem], "V4I-WI-043": ["Credit notes by customer", F.creditNotesByCustomer], "V4I-WI-044": ["Sales person by item", F.personByItem], "V4I-WI-045": ["Branch by product", F.branchByProduct],
  "V4I-WI-046": ["Repeat purchase rate", F.repeatPurchase], "V4I-WI-047": ["New vs repeat customers", F.newVsRepeat], "V4I-WI-048": ["Discount leakage", F.discountLeakage], "V4I-WI-049": ["Price override risk", F.priceOverride], "V4I-WI-050": ["Orders not delivered", F.openOrders],
  "V4I-WI-051": ["Delivered, not billed", F.deliveredNotBilled], "V4I-WI-052": ["Billed, not paid", F.arTotal], "V4I-WI-053": ["Top unpaid customers", F.topUnpaidCustomers], "V4I-WI-054": ["Revenue trend", F.salesTrend], "V4I-WI-055": ["Margin trend", F.marginTrend],
  "V4I-WI-056": ["Item group trend", F.itemGroupTrend], "V4I-WI-057": ["Sales seasonality", F.seasonality], "V4I-WI-058": ["Sales by payment terms", F.salesByTerms], "V4I-WI-059": ["High-value deals", F.highValueDeals], "V4I-WI-060": ["Sales exception queue", F.salesExceptions],
  "V4I-WI-061": ["Spend by supplier", F.spendBySupplier], "V4I-WI-062": ["Spend by category", F.spendByCategory], "V4I-WI-063": ["Purchase price variance", F.purchasePriceVariance], "V4I-WI-064": ["Supplier late deliveries", F.lateBySupplier], "V4I-WI-065": ["Supplier reliability", F.supplierReliability],
  "V4I-WI-066": ["Late purchase orders", F.latePOs], "V4I-WI-067": ["Pending material requests", F.pendingRequests], "V4I-WI-068": ["Supplier quotation response rate", F.quoteResponse], "V4I-WI-069": ["Supplier quotation comparison", F.quoteComparison], "V4I-WI-070": ["Orders not received", F.openPOs],
  "V4I-WI-071": ["Received, not billed (GRNI)", F.receivedNotBilled], "V4I-WI-072": ["Billed, not paid", F.apTotal], "V4I-WI-073": ["Top suppliers", F.topSuppliers], "V4I-WI-074": ["New suppliers", F.newSuppliers], "V4I-WI-075": ["Spend trend", F.spendTrend],
  "V4I-WI-076": ["Branch spend", F.spendByBranch], "V4I-WI-077": ["Department spend", F.spendByDept], "V4I-WI-078": ["Urgent purchases", F.urgentPurchases], "V4I-WI-079": ["Approval bottlenecks", F.approvalBottlenecks], "V4I-WI-080": ["Purchase order cycle time", F.poCycle],
  "V4I-WI-081": ["Landed cost impact", F.landedCost], "V4I-WI-082": ["Item dependence on one supplier", F.singleSupplierItems], "V4I-WI-083": ["Single-source risk", F.singleSourceRisk], "V4I-WI-084": ["Supplier price increases", F.supplierPriceUp], "V4I-WI-085": ["Purchase VAT review", F.purchaseVat],
  "V4I-WI-086": ["Purchase returns", F.purchaseReturns], "V4I-WI-087": ["Blanket order usage", F.blanketUse], "V4I-WI-088": ["Budget vs actual", F.budgetVsActual], "V4I-WI-089": ["Price review across suppliers", F.priceAcrossSuppliers], "V4I-WI-090": ["Purchasing exception queue", F.purchasingExceptions],
  "V4I-WI-091": ["Stock value by warehouse", F.valueByWarehouse], "V4I-WI-092": ["Fast-moving items", F.fastMoving], "V4I-WI-093": ["Slow-moving items", F.slowMoving], "V4I-WI-094": ["Dead stock", F.deadStock], "V4I-WI-095": ["Low stock", F.belowReorder],
  "V4I-WI-096": ["Overstock", F.overstock], "V4I-WI-097": ["Stock-out risk", F.stockoutRisk], "V4I-WI-098": ["Negative stock risk", F.negativeRisk], "V4I-WI-099": ["Item movement by branch", F.moveByBranch], "V4I-WI-100": ["Warehouse utilisation", F.warehouseShare],
  "V4I-WI-101": ["Stock ageing", F.stockAgeing], "V4I-WI-102": ["Batch expiry risk", F.batchExpiry], "V4I-WI-103": ["Serial number exceptions", F.serialExceptions], "V4I-WI-104": ["Stock count differences", F.reconVariance], "V4I-WI-105": ["Stock adjustment value", F.adjustmentValue],
  "V4I-WI-106": ["Transfer delays", F.transferDelays], "V4I-WI-107": ["Reorder suggestions", F.reorderSuggest], "V4I-WI-108": ["Items without a reorder level", F.noReorderLevel], "V4I-WI-109": ["Receipt-to-stock delay", F.receiptToStock], "V4I-WI-110": ["Short delivery risk", F.shortDelivery],
  "V4I-WI-111": ["Highest-value items", F.topValueItems], "V4I-WI-112": ["Top turnover items", F.topTurnoverItems], "V4I-WI-113": ["Margin vs stock value", F.marginVsStock], "V4I-WI-114": ["Stock turnover ratio", F.turnover], "V4I-WI-115": ["Days of stock", F.daysOfStock],
  "V4I-WI-116": ["ABC classification", F.abc], "V4I-WI-117": ["Valuation change", F.valuationChange], "V4I-WI-118": ["Damaged / returned goods", F.damagedReturned], "V4I-WI-119": ["Receipts vs invoices", F.receivedNotBilled], "V4I-WI-120": ["Inventory exception queue", F.inventoryExceptions],
  "V4I-WI-121": ["Asset value by category", F.byCategory], "V4I-WI-122": ["Asset value by location", F.byLocation], "V4I-WI-123": ["Asset value by department", F.byCostCenter], "V4I-WI-124": ["Depreciation due", F.depreciationDue], "V4I-WI-125": ["Depreciation posted", F.depreciationPosted],
  "V4I-WI-126": ["Depreciation pending", F.depreciationDue], "V4I-WI-127": ["Maintenance due", F.maintenanceDue], "V4I-WI-128": ["Maintenance overdue", F.maintenanceOverdue], "V4I-WI-129": ["Assets without a custodian", F.noCustodian], "V4I-WI-130": ["Assets without a location", F.noLocation],
  "V4I-WI-131": ["Pending asset movements", F.pendingMoves], "V4I-WI-132": ["Open repairs", F.repairsOpen], "V4I-WI-133": ["Asset downtime", F.downtime], "V4I-WI-134": ["Disposal candidates", F.disposalCandidates], "V4I-WI-135": ["Fully depreciated assets", F.fullyDepreciated],
  "V4I-WI-136": ["Asset additions", F.assetAdditions], "V4I-WI-137": ["Asset disposals", F.disposals], "V4I-WI-138": ["Net book value", F.assetNbv], "V4I-WI-139": ["Insurance and warranty", F.insurance], "V4I-WI-140": ["Pending capitalization", F.pendingCapitalization],
  "V4I-WI-141": ["Capital work in progress", F.cwip], "V4I-WI-142": ["Asset sales", F.assetSales], "V4I-WI-143": ["Value adjustments and impairment", F.valueAdjust], "V4I-WI-144": ["Maintenance cost by asset", F.repairCostByAsset], "V4I-WI-145": ["Maintenance cost by category", F.repairCostByCategory],
  "V4R-T.TEMPLATE_USE": ["Tax template use", F.taxTemplateUse], "V4R-I.CAPACITY": ["Warehouse capacity use", F.warehouseCapacity],
  "V4I-WI-146": ["Asset age", F.assetAge], "V4I-WI-147": ["Assets by branch", F.byBranchAssets], "V4I-WI-148": ["Asset register completeness", F.registerCompleteness], "V4I-WI-149": ["Asset entry exceptions", F.assetEntryExceptions], "V4I-WI-150": ["Asset exception queue", F.assetExceptions],
};
export interface V4Line extends V4Out { id: string; title: Bi }
export const BOARD_LABEL: Record<Board, Bi> = {
  executive: ["Executive insights", "مؤشرات اللوحة التنفيذية"], finance: ["Finance insights", "مؤشرات لوحة المالية"], accounting: ["Accounting insights", "مؤشرات المحاسبة"], selling: ["Sales insights", "مؤشرات المبيعات"],
  purchasing: ["Purchasing insights", "مؤشرات المشتريات"], inventory: ["Inventory insights", "مؤشرات المخزون"], assets: ["Asset insights", "مؤشرات الأصول"], vat: ["VAT and e-invoicing insights", "مؤشرات الضريبة والفوترة الإلكترونية"],
};
export const v4Ids = (board: Board) => V4_SOURCE.filter((g) => g.board === board).map((g) => g.id);
export const v4Defined = (id: string) => !!DEF[id];
/** One insight evaluated for a user; null when a source is not readable (the line is hidden). */
export function v4Line(id: string, ctx: SectionCtx, user: string, ar: boolean, reads?: Set<string>): V4Line | null {
  const g = V4_SOURCE.find((x) => x.id === id); const d = DEF[id]; if (!g || !d) return null;
  try { const r = d[1]({ ctx, user, ar, ...(reads ? { reads } : {}) }); return { ...r, id, title: [d[0], g.title_ar] }; }
  catch (e) { if (e instanceof Hidden) return null; throw e; }
}
export const v4Lines = (board: Board, ctx: SectionCtx, user: string, ar: boolean) => v4Ids(board).map((id) => v4Line(id, ctx, user, ar)).filter((x): x is V4Line => !!x);
