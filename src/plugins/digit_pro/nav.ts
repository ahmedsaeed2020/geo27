/**
 * DIGIT Pro navigation manifest — the single authoritative, typed IA (RXP-NAV-CORRECTIVE-02 section workspaces).
 *
 * Contexts (primary rail): Executive, the five departments, and the shared services Reports Center, Compliance &
 * Controls, Settings & Configuration and Support & Help. A department's compact contextual sidebar shows ONLY its
 * Overview, its business SECTION WORKSPACE pages (/pro/$dept/$section, see SECTION_PAGES) and the pinned
 * "All [Department]" directory (/pro/$dept). Native documents and reports are never sidebar leaves: they live inside
 * the section workspace (Documents / Reports tabs, built from the same `sections` items + `more`) and the directory.
 *
 * Every destination is an existing Core resource (DIGIT Pro screen, native DocType list/filtered list/tree, Core
 * report, Core Data Import/Export, Desk page) or an explicit `missing` item that is never rendered as a link.
 * nav.test.ts checks every DocType/report against the frozen catalog. Active state is derived from the route by
 * resolveLocation() — never from a component-local "last clicked" value.
 */
import { EXEC_PAGES, type ExecPage } from "./execPages";
import { ACC_AREAS, accountingAreas } from "./accountingAreas";
/** Shared Core finance screens (src/components/enterprise/FinanceDesk.tsx), opened by every app. */
export type FinanceRoute = "/finance/cash-forecast" | "/finance/sustainability" | "/finance/bank-matching" | "/finance/asset-controls" | "/finance/risks" | "/finance/collections" | "/finance/payment-run" | "/finance/netting" | "/finance/ap-control" | "/finance/close" | "/finance/consolidation" | "/finance/statements" | "/finance/recurring";
const fin = (to: FinanceRoute, label: string): NavItem => ({ label, target: { kind: "core", to } });
/** Shared Core operations screens (src/components/enterprise/OpsDesk.tsx). */
export type OpsRoute = "/stock/scan" | "/stock/dock" | "/stock/receiving-controls" | "/buying/rfq-follow-up" | "/control/approvals" | "/control/procurement-policies" | "/control/background-jobs" | "/control/setup-guide" | "/support/desk" | "/support/chat" | "/selling/channels" | "/selling/inbox" | "/buying/invoice-capture" | "/stock/demand-forecast" | "/stock/wave-picking";
const ops = (to: OpsRoute, label: string): NavItem => ({ label, target: { kind: "core", to } });
export type ProRoute = "/pro/item-360" | "/pro/asset-360" | "/pro/stock-value-reconciliation" | "/pro/received-not-billed" | "/pro/delivered-not-billed" | "/pro/order-fulfilment" | "/pro/quotation-pipeline" | "/pro/sales-returns" | "/pro/customer-360" | "/pro/supplier-360" | "/pro/finance-intelligence" | "/pro/finance" | "/pro/accounts" | "/pro/general-ledger" | "/pro/receivables" | "/pro/payables" | "/pro/bank-reconciliation" | "/pro/cost-centers" | "/pro/period-control" | "/pro/trial-balance" | "/pro/statements" | "/pro/vat" | "/pro/audit" | "/pro/payments" | "/pro/dashboard" | "/pro/reports" | "/pro/settings" | "/pro/support" | "/pro/selling-overview" | "/pro/purchasing-overview" | "/pro/inventory-overview" | "/pro/assets-overview" | "/pro/collections" | "/pro/stock-ledger" | "/pro/stock-balance" | "/pro/warehouses" | "/pro/depreciation" | "/pro/open-purchase-orders" | "/pro/asset-register" | "/pro/sales-analytics" | "/pro/asset-disposal" | "/pro/admin" | ExecPage["to"];
export type DeptId = "accounting" | "selling" | "purchasing" | "inventory" | "assets";
export type CtxId = DeptId | "executive" | "reports" | "compliance" | "settings" | "support";
export type NavTarget =
  | { kind: "pro"; to: ProRoute; search?: Record<string, string> }
  | { kind: "dept"; dept: DeptId }
  /** Business section workspace page (/pro/$dept/$section) — a full content page, never an accordion of documents. */
  | { kind: "section"; dept: DeptId; section: string }
  | { kind: "doctype"; doctype: string; filters?: [string, string, string][] }
  | { kind: "tree"; doctype: string }
  | { kind: "report"; report: string }
  | { kind: "workspace"; sidebar: string }
  | { kind: "import" } | { kind: "export"; doctype?: string }
  /** Registered Desk Page (/page/$name, src/components/pages/registry.tsx). */
  | { kind: "page"; page: string }
  /** Existing Core shell route. */
  | { kind: "core"; to: "/settings" | "/report" | "/report/studio" | "/page" | "/plugins" | "/tax/vat-return" | "/tax/zakat" | "/tax/e-invoicing" | FinanceRoute | OpsRoute }
  /** Existing Core shell dialog (keyboard shortcuts, user settings). */
  | { kind: "dialog"; dialog: "shortcuts" | "settings" }
  /** Requested resource that does not exist in this Core; `reason` names the dependency. Never rendered as a working link. */
  | { kind: "missing"; reason: string };
/**
 * `roles`: only shown to users holding one of these roles (Administrator always) — for Core tools without DocType permissions.
 * `enter`: opening this item switches to another context (e.g. a department overview listed under Executive).
 */
export type NavItem = { label: string; target: NavTarget; hint?: string; roles?: string[]; enter?: CtxId };
export type Section = "workflow" | "reports" | "setup" | "data";
export type NavGroup = { id?: string; label: string; section: Section; items: NavItem[]; compliance?: boolean };
/** Contextual-sidebar business section: `items` are the sidebar leaves; `more` adds directory-only resources of the same work area. */
export type MenuSection = { id: string; label: string; items: NavItem[] };
export type DeptSection = MenuSection & { section: Section; more?: NavItem[]; compliance?: boolean };
/** Exception / work queue: rows of `doctype` matching `where` (Core fields only); `filters` opens the same set in the native list. */
export type QueueDef = { label: string; doctype: string; where: [string, string][]; overdue?: boolean; severity: "high" | "medium" | "low"; open?: NavTarget };
export type Department = {
  id: DeptId; label: string; icon: string;
  /** Pinned Overview (department command center) and pinned complete directory. */
  home: NavItem; all: NavItem;
  sections: DeptSection[];
  /** Directory-only groups (setup, data tools). */
  extra: NavGroup[];
  /** Native DocTypes this department canonically owns (cold deep links open here). */
  owns: string[];
  /** Quick actions: native DocTypes offered as "New" (shown only with create permission). */
  quick: string[];
  flow: { label: string; doctype: string }[]; queues: QueueDef[];
  /** Derived: complete directory groups = sections (items + more) + extra. */
  groups: NavGroup[];
  /** Derived (OWN-34): the directory grouped by the approved architecture areas, when the department has one. */
  areas?: NavGroup[];
  /** Derived (legacy consumers: dashboards, Frappe export shortcuts): home + quick DocTypes + all. */
  primary: NavItem[];
  doctypes: string[];
};

const dt = (doctype: string, label = doctype, hint?: string): NavItem => ({ label, target: { kind: "doctype", doctype }, ...(hint ? { hint } : {}) });
/** Native list opened with Core list filters (same URL `filters` param the list view writes). */
const dtf = (doctype: string, label: string, filters: [string, string, string][], hint?: string): NavItem => ({ label, target: { kind: "doctype", doctype, filters }, ...(hint ? { hint } : {}) });
const tree = (doctype: string, label = doctype): NavItem => ({ label, target: { kind: "tree", doctype } });
const rp = (report: string, label = report): NavItem => ({ label, target: { kind: "report", report } });
const pro = (to: ProRoute, label: string, hint?: string, search?: Record<string, string>): NavItem => ({ label, target: search ? { kind: "pro", to, search } : { kind: "pro", to }, ...(hint ? { hint } : {}) });
const data = (doctype: string): NavGroup => ({ id: "data", label: "Data Operations", section: "data", items: [{ label: "Data Import", target: { kind: "import" } }, { label: "Data Export", target: { kind: "export", doctype } }] });
const all = (dept: DeptId, label: string): NavItem => ({ label, target: { kind: "dept", dept } });
const draft = (doctype: string, label: string, severity: QueueDef["severity"] = "low"): QueueDef => ({ label, doctype, where: [["docstatus", "0"]], severity });
const status = (doctype: string, s: string, label: string, severity: QueueDef["severity"] = "medium"): QueueDef => ({ label, doctype, where: [["docstatus", "1"], ["status", s]], severity });
const DRAFT: [string, string, string][] = [["docstatus", "=", "0"]];
const sub = (s: string): [string, string, string][] => [["docstatus", "=", "1"], ["status", "=", s]];

const page = (p: string, label: string, roles?: string[]): NavItem => ({ label, target: { kind: "page", page: p }, ...(roles ? { roles } : {}) });
const missing = (label: string, reason: string): NavItem => ({ label, target: { kind: "missing", reason } });
const SYS = ["System Manager"];

type RawDept = Omit<Department, "groups" | "primary" | "doctypes">;
const RAW: RawDept[] = [
  { id: "accounting", label: "Accounting", icon: "accounts",
    home: pro("/pro/finance", "Accounting Overview", "Exceptions first, then routine work — all from Core records."),
    all: all("accounting", "All Accounting"),
    owns: ["Journal Entry", "Journal Entry Template", "Payment Entry", "Payment Request", "Payment Reconciliation", "Account", "Cost Center", "Accounting Dimension", "Fiscal Year", "Accounting Period", "Period Closing Voucher", "Finance Book", "Bank", "Bank Account", "Bank Transaction", "Bank Reconciliation Tool", "Mode of Payment", "Budget", "Dunning", "GL Entry", "Currency Exchange", "Exchange Rate Revaluation"],
    quick: ["Journal Entry", "Payment Entry"],
    flow: [],
    queues: [
      { label: "Overdue sales invoices", doctype: "Sales Invoice", where: [["docstatus", "1"]], overdue: true, severity: "high", open: { kind: "pro", to: "/pro/receivables" } },
      { label: "Overdue purchase invoices", doctype: "Purchase Invoice", where: [["docstatus", "1"]], overdue: true, severity: "high", open: { kind: "pro", to: "/pro/payables" } },
      draft("Journal Entry", "Draft journal entries", "medium"), draft("Payment Entry", "Draft payment entries", "medium"),
    ],
    sections: [
      { id: "acc-ops", label: "Transactions & Journals", section: "workflow",
        items: [dt("Journal Entry"), dtf("Journal Entry", "Draft Journal Entries", DRAFT), dt("Payment Entry"), pro("/pro/payments", "Payments & Allocation", "Received and paid, with allocation"), pro("/pro/accounts", "Chart of Accounts", "Search and inspect the account tree")],
        more: [tree("Account"), rp("Payment Ledger"), dt("Journal Entry Template"), dtf("Payment Entry", "Draft Payment Entries", DRAFT), dt("Payment Request"), dt("Payment Reconciliation"), dt("Unreconcile Payment"), dt("Exchange Rate Revaluation"), dt("Process Deferred Accounting"), dt("Opening Invoice Creation Tool"), pro("/pro/general-ledger", "General Ledger"), pro("/pro/trial-balance", "Trial Balance", "Hierarchy, balance checks and ledger drill-down"), rp("Account Balance"), rp("General and Payment Ledger Comparison")] },
      { id: "acc-dues", label: "Receivables & Payables", section: "workflow",
        items: [pro("/pro/receivables", "Receivables", "Customer invoices to collect, by age"), pro("/pro/payables", "Payables", "Supplier invoices to pay, by age"), fin("/finance/collections", "Collections"), fin("/finance/payment-run", "Supplier Payment Run"), dt("Sales Invoice", "Sales Invoices"), dt("Purchase Invoice", "Purchase Invoices"), fin("/finance/ap-control", "Supplier Invoice Processing")],
        more: [fin("/finance/netting", "Customer and Supplier Netting"), rp("Accounts Receivable"), rp("Accounts Payable"), dt("Payment Entry"), dtf("Payment Entry", "Draft Payment Entries", DRAFT), dt("Customer"), dt("Supplier"), dt("Dunning"), dt("Dunning Type"), rp("Payment Ledger"), rp("Accounts Receivable Summary"), rp("Accounts Payable Summary"), rp("Customer Ledger Summary"), rp("Supplier Ledger Summary"), rp("Payment Period Based On Invoice Date"), rp("Trial Balance for Party")] },
      { id: "acc-cash", label: "Cash & Banking", section: "workflow",
        items: [pro("/pro/bank-reconciliation", "Bank Reconciliation", "Match statement lines to payments"), fin("/finance/bank-matching", "Bank matching"), fin("/finance/cash-forecast", "Cash Forecast"), dt("Bank Account", "Bank Accounts"), dt("Bank Transaction", "Bank Transactions"), dtf("Bank Transaction", "Unreconciled Bank Transactions", sub("Unreconciled")), rp("Cash Flow")],
        more: [dt("Payment Entry"), dt("Bank"), dt("Bank Reconciliation Tool"), dt("Bank Statement Import"), dt("Bank Guarantee"), dt("Mode of Payment"), dt("Cheque Print Template"), rp("Bank Reconciliation Statement"), rp("Bank Clearance Summary"), rp("General Ledger")] },
      { id: "acc-reports", label: "Reports, Intelligence & Controls", section: "reports",
        items: [pro("/pro/finance-intelligence", "Finance Intelligence", "Period comparison, variance drivers and profitability"), fin("/finance/risks", "Exceptions and Risks"), fin("/finance/consolidation", "Group Consolidation"), pro("/pro/general-ledger", "General Ledger"), pro("/pro/trial-balance", "Trial Balance", "Hierarchy, balance checks and ledger drill-down"), pro("/pro/statements", "Financial Statements", "P&L, Balance Sheet and Cash Flow"), pro("/pro/cost-centers", "Cost Centers & Dimensions", "Hierarchy, ledger activity and dimensions")],
        more: [fin("/finance/sustainability", "Sustainability & emissions"), fin("/finance/statements", "Financial Statement Designer"), rp("General Ledger"), rp("Trial Balance"), rp("Profit and Loss Statement"), rp("Balance Sheet"), rp("Gross and Net Profit Report"), rp("Dimension-wise Accounts Balance Report"), rp("Profitability Analysis"), rp("Budget Variance Report"), rp("Deferred Revenue and Expense"), rp("Payment Ledger"), rp("Voucher-wise Balance"), tree("Cost Center"), dt("Accounting Dimension"), dt("Cost Center Allocation"), dt("Budget")] },
      { id: "acc-control", label: "Close, Tax & Audit", section: "reports", compliance: true,
        items: [pro("/pro/period-control", "Period Control", "Closing vs locking"), fin("/finance/close", "Period Close"), fin("/finance/recurring", "Recurring Documents"), pro("/pro/vat", "VAT Reports", "Output and input tax by document"), pro("/pro/audit", "Audit & Exceptions", "Exceptions and change history"), dt("Accounting Period"), dt("Period Closing Voucher")],
        more: [dt("Fiscal Year"), dt("Finance Book"), dt("Version", "Audit Trail"), { label: "KSA VAT Return", target: { kind: "core", to: "/tax/vat-return" } }, { label: "Zakat", target: { kind: "core", to: "/tax/zakat" } }, { label: "ZATCA e-invoicing", target: { kind: "core", to: "/tax/e-invoicing" } }, rp("Tax Withholding Details")] },
    ],
    extra: [
      { id: "acc-setup", label: "Accounting Setup", section: "setup", items: [dt("Company"), dt("Accounts Settings"), dt("Payment Terms Template"), dt("Payment Term"), dt("Currency Exchange"), dt("Currency Exchange Settings"), dt("Tax Rule"), dt("Tax Category"), dt("Item Tax Template"), dt("Tax Withholding Category"), dt("Sales Taxes and Charges Template"), dt("Purchase Taxes and Charges Template"), dt("Shareholder")] },
      data("Journal Entry"),
      // Finance impact links (V9.1 preservation PRR rows): reports another department owns that the finance team reads.
      // Directory-only, so opening one keeps its owning department in the rail.
      { id: "acc-impact", label: "Finance impact reports", section: "reports", items: [rp("Purchase Price Variance"), rp("Asset Rollforward"), rp("Sales Register"), rp("Item-wise Sales Register"), rp("Gross Profit"), rp("Customer Credit Balance"), rp("Sales Analytics"), rp("Purchase Register"), rp("Item-wise Purchase Register"), rp("Purchase Analytics"), rp("Stock Ledger"), rp("Stock Balance"), rp("Batch-Wise Balance History"), rp("Warehouse wise Item Balance Age and Value"), rp("Fixed Asset Register"), rp("Asset Depreciation Ledger"), rp("Asset Depreciations and Balances")] },
    ] },
  { id: "selling", label: "Selling", icon: "sales",
    home: pro("/pro/selling-overview", "Selling Overview"),
    all: all("selling", "All Selling"),
    owns: ["Customer", "Customer Group", "Territory", "Sales Person", "Sales Partner", "Quotation", "Sales Order", "Delivery Note", "Sales Invoice", "Price List", "Item Price", "Pricing Rule", "Blanket Order", "Terms and Conditions", "Installation Note", "Packing Slip", "Delivery Trip", "Promotional Scheme", "Coupon Code", "Loyalty Program", "Shipping Rule", "Selling Settings"],
    quick: ["Quotation", "Sales Order", "Sales Invoice", "Customer"],
    flow: [{ label: "Customer", doctype: "Customer" }, { label: "Quotation", doctype: "Quotation" }, { label: "Sales Order", doctype: "Sales Order" }, { label: "Delivery", doctype: "Delivery Note" }, { label: "Invoice", doctype: "Sales Invoice" }, { label: "Collections", doctype: "Payment Entry" }],
    queues: [draft("Quotation", "Draft quotations"), status("Sales Order", "To Deliver and Bill", "Sales orders to deliver and bill", "high"), status("Sales Order", "To Bill", "Sales orders to bill"), status("Delivery Note", "To Bill", "Delivery notes to bill"),
      { label: "Overdue sales invoices", doctype: "Sales Invoice", where: [["docstatus", "1"]], overdue: true, severity: "high", open: { kind: "pro", to: "/pro/receivables" } }],
    sections: [
      { id: "sel-orders", label: "Quotations & Orders", section: "workflow",
        items: [ops("/selling/inbox", "Sales inbox"), dt("Quotation", "Quotations"), pro("/pro/selling-overview", "Expiring Quotations", "Open quotations by validity date", { wl: "quotes" }), dt("Sales Order", "Sales Orders"), dtf("Sales Order", "Orders to Deliver and Bill", sub("To Deliver and Bill")), pro("/pro/selling-overview", "Late Sales Orders", "Orders past their delivery date", { wl: "late" }), pro("/pro/quotation-pipeline", "Quotation Pipeline", "Expiry, outcomes and lost reasons of quotations")],
        more: [dtf("Quotation", "Draft Quotations", DRAFT), ops("/selling/channels", "Marketplace Orders"), dt("Blanket Order"), dt("Terms and Conditions"), rp("Sales Order Analysis"), rp("Quotation Trends"), rp("Sales Order Trends")] },
      { id: "sel-customers", label: "Customers & Pricing", section: "workflow",
        items: [dt("Customer", "Customers"), pro("/pro/customer-360", "Customer 360", "One customer's documents, receivables and credit"), tree("Customer Group"), dt("Price List", "Price Lists"), dt("Item Price", "Item Prices"), dt("Pricing Rule", "Pricing Rules")],
        more: [tree("Territory"), tree("Sales Person"), dt("Sales Partner"), dt("Promotional Scheme"), dt("Coupon Code"), dt("Loyalty Program"), dt("Product Bundle"), dt("Shipping Rule"), dt("Sales Taxes and Charges Template"), rp("Customer Ledger Summary"), rp("Customer-wise Item Price"), rp("Item-wise Price List Rate"), rp("Inactive Customers"), rp("Customer Acquisition and Loyalty")] },
      { id: "sel-fulfil", label: "Delivery & Billing", section: "workflow",
        items: [dt("Delivery Note", "Delivery Notes"), dtf("Delivery Note", "Delivery Notes to Bill", sub("To Bill")), dt("Sales Invoice", "Sales Invoices"), pro("/pro/order-fulfilment", "Order Fulfilment", "Open order lines: promised, delivered and invoiced"), pro("/pro/delivered-not-billed", "Delivered Not Billed", "Delivered lines still to invoice"), dtf("Sales Invoice", "Sales Returns", [["is_return", "=", "1"]]), pro("/pro/sales-returns", "Returns & Credit Notes", "Credit notes and delivery returns with their originals")],
        more: [dt("Payment Request"), dt("Packing Slip"), dt("Installation Note"), dt("Delivery Trip"), rp("Delivered Items To Be Billed"), rp("Sales Register"), rp("Item-wise Sales Register")] },
      { id: "sel-intel", label: "Collections & Analytics", section: "reports",
        items: [pro("/pro/collections", "Collections", "Prioritised queue of invoices to collect"), dtf("Payment Entry", "Customer Receipts", [["payment_type", "=", "Receive"]]), pro("/pro/sales-analytics", "Sales Analytics", "Monthly drill-down to native documents"), rp("Gross Profit"), rp("Sales Register")],
        more: [rp("Sales Analytics", "Sales Analytics report"), pro("/pro/receivables", "Receivables", "Customer invoices to collect, by age"), rp("Accounts Receivable"), dt("Dunning"), dt("Payment Entry"), rp("Customer Ledger Summary"), rp("Sales Person-wise Transaction Summary"), rp("Territory-wise Sales"), rp("Item-wise Sales History"), rp("Inactive Customers"), rp("Customer Credit Balance")] },
    ],
    extra: [{ id: "sel-setup", label: "Selling Setup", section: "setup", items: [dt("Selling Settings")] }, data("Customer")] },
  { id: "purchasing", label: "Purchasing", icon: "purchases",
    home: pro("/pro/purchasing-overview", "Purchasing Overview"),
    all: all("purchasing", "All Purchasing"),
    owns: ["Supplier", "Supplier Group", "Supplier Scorecard", "Material Request", "Request for Quotation", "Supplier Quotation", "Purchase Order", "Purchase Receipt", "Purchase Invoice", "Landed Cost Voucher", "Buying Settings"],
    quick: ["Material Request", "Purchase Order", "Purchase Invoice", "Supplier"],
    flow: [{ label: "Material Request", doctype: "Material Request" }, { label: "RFQ", doctype: "Request for Quotation" }, { label: "Supplier Quotation", doctype: "Supplier Quotation" }, { label: "Purchase Order", doctype: "Purchase Order" }, { label: "Receipt", doctype: "Purchase Receipt" }, { label: "Invoice", doctype: "Purchase Invoice" }],
    queues: [draft("Material Request", "Draft material requests"), status("Material Request", "Pending", "Pending material requests", "high"), status("Purchase Order", "To Receive and Bill", "Purchase orders to receive and bill", "high"), status("Purchase Order", "To Receive", "Purchase orders to receive"), status("Purchase Order", "To Bill", "Purchase orders to bill"), status("Purchase Receipt", "To Bill", "Purchase receipts to bill"),
      draft("Purchase Order", "Draft purchase orders"), status("Supplier Quotation", "Submitted", "Supplier quotations to review", "low"),
      { label: "Overdue purchase invoices", doctype: "Purchase Invoice", where: [["docstatus", "1"]], overdue: true, severity: "high", open: { kind: "pro", to: "/pro/payables" } }],
    sections: [
      { id: "pur-source", label: "Requests & Sourcing", section: "workflow",
        items: [dt("Material Request", "Material Requests"), dtf("Material Request", "Pending Material Requests", sub("Pending")), dt("Request for Quotation", "Requests for Quotation"), ops("/buying/rfq-follow-up", "RFQ Follow-up"), dt("Supplier Quotation", "Supplier Quotations"), pro("/pro/purchasing-overview", "Supplier Quotes to Decide", "Unit- and currency-safe comparison", { wl: "quotes" })],
        more: [dtf("Material Request", "Draft Material Requests", DRAFT), rp("Supplier Quotation Comparison"), rp("Material Requests for which Supplier Quotations are not created"), rp("Procurement Tracker")] },
      { id: "pur-orders", label: "Orders & Commitments", section: "workflow",
        items: [dt("Purchase Order", "Purchase Orders"), ops("/control/procurement-policies", "Procurement Policies"), pro("/pro/open-purchase-orders", "Open Purchase Orders", "Order lines still to receive or bill"), pro("/pro/open-purchase-orders", "Late Deliveries", "Order lines past the expected date", { band: "overdue" }), dtf("Purchase Order", "Orders to Receive and Bill", sub("To Receive and Bill")), dtf("Purchase Order", "Draft Purchase Orders", DRAFT)],
        more: [rp("Purchase Order Analysis"), rp("Purchase Order Trends")] },
      { id: "pur-receive", label: "Receiving & Invoicing", section: "workflow",
        items: [dt("Purchase Receipt", "Purchase Receipts"), dt("Purchase Invoice", "Purchase Invoices"), ops("/buying/invoice-capture", "Invoice capture"), pro("/pro/received-not-billed", "Received Not Billed", "Received lines still to invoice"), dt("Landed Cost Voucher"), dtf("Purchase Invoice", "Purchase Returns", [["is_return", "=", "1"]])],
        more: [dt("Payment Entry"), dtf("Payment Entry", "Supplier Payments", [["payment_type", "=", "Pay"]]), rp("Received Items To Be Billed"), rp("Purchase Register"), rp("Item-wise Purchase Register")] },
      { id: "pur-supplier", label: "Suppliers & Intelligence", section: "reports",
        items: [dt("Supplier", "Suppliers"), pro("/pro/supplier-360", "Supplier 360", "One supplier's orders, receipts, invoices, payments and reliability"), tree("Supplier Group"), dt("Supplier Scorecard", "Supplier Scorecards"), rp("Purchase Analytics")],
        more: [pro("/pro/payables", "Payables", "Supplier invoices to pay, by age"), rp("Accounts Payable"), rp("Supplier Ledger Summary"), rp("Item-wise Purchase History")] },
    ],
    extra: [{ id: "pur-setup", label: "Purchasing Setup", section: "setup", items: [dt("Buying Settings"), dt("Purchase Taxes and Charges Template"), ops("/control/approvals", "Approval Paths")] }, data("Supplier")] },
  { id: "inventory", label: "Inventory", icon: "inventory",
    home: pro("/pro/inventory-overview", "Inventory Overview"),
    all: all("inventory", "All Inventory"),
    owns: ["Item", "Item Group", "Warehouse", "Stock Entry", "Stock Reconciliation", "Batch", "Serial No", "Bin", "Stock Ledger Entry", "UOM", "Pick List", "Quality Inspection", "Serial and Batch Bundle", "Stock Settings", "Stock Entry Type", "Stock Reservation Entry"],
    quick: ["Stock Entry", "Item", "Stock Reconciliation"],
    flow: [{ label: "Items", doctype: "Item" }, { label: "Warehouses", doctype: "Warehouse" }, { label: "Receipt / Issue / Transfer", doctype: "Stock Entry" }, { label: "Reconciliation", doctype: "Stock Reconciliation" }, { label: "Stock Ledger", doctype: "Stock Ledger Entry" }],
    queues: [draft("Stock Entry", "Draft stock entries", "medium"), draft("Stock Reconciliation", "Draft stock reconciliations", "medium"), status("Material Request", "Pending", "Pending material requests", "high")],
    sections: [
      { id: "inv-items", label: "Items & Warehouses", section: "workflow",
        items: [dt("Item", "Items"), pro("/pro/item-360", "Item 360", "One item's stock, documents and ledger trail"), tree("Item Group"), pro("/pro/warehouses", "Warehouses", "Hierarchy, stock held and movements"), pro("/pro/stock-balance", "Stock Balance", "Item and warehouse quantities"), rp("Stock Projected Qty")],
        more: [tree("Warehouse"), dt("UOM"), dt("UOM Conversion Factor"), dt("Brand"), dt("Item Attribute"), dt("Item Alternative"), dt("Item Manufacturer"), dt("Warehouse Type"), dt("Putaway Rule"), dt("Bin", "Bin (stock levels)")] },
      { id: "inv-move", label: "Stock Movements", section: "workflow",
        items: [dtf("Stock Entry", "Material Receipts", [["purpose", "=", "Material Receipt"]]), dtf("Stock Entry", "Material Issues", [["purpose", "=", "Material Issue"]]), dtf("Stock Entry", "Material Transfers", [["purpose", "=", "Material Transfer"]]), dt("Stock Entry", "All Stock Entries"), dt("Pick List"), ops("/stock/scan", "Scan Stock"), ops("/stock/dock", "Dock Appointments")],
        more: [ops("/stock/wave-picking", "Wave picking"), dtf("Stock Entry", "Draft Stock Entries", DRAFT), dt("Material Request"), dt("Delivery Note"), dt("Purchase Receipt"), dt("Stock Entry Type"), dt("Stock Reservation Entry"), rp("Stock Ledger"), rp("Stock Analytics")] },
      { id: "inv-count", label: "Counting & Traceability", section: "workflow",
        items: [dt("Stock Reconciliation", "Stock Reconciliations"), dt("Batch", "Batches"), dt("Serial No", "Serial Numbers"), dt("Quality Inspection", "Quality Inspections"), ops("/stock/receiving-controls", "Receiving Controls"), pro("/pro/inventory-overview", "Traceability Exceptions", "Batch and serial gaps on posted movements", { wl: "tracking" })],
        more: [dt("Serial and Batch Bundle"), dt("Quality Inspection Template"), rp("Batch-Wise Balance History"), rp("Batch Item Expiry Status"), rp("Serial No Ledger"), rp("Serial No and Batch Traceability")] },
      { id: "inv-control", label: "Control & Reports", section: "reports",
        items: [ops("/stock/demand-forecast", "Demand forecast"), pro("/pro/stock-ledger", "Stock Ledger", "Movements, balance and valuation"), pro("/pro/stock-value-reconciliation", "Stock Value Reconciliation", "Bin snapshot vs posted ledger and stock GL"), rp("Stock Balance", "Stock Valuation"), pro("/pro/inventory-overview", "Reorder & Low Stock", "Items below their reorder level", { wl: "reorder" }), rp("Stock Ageing"), rp("Item Shortage Report")],
        more: [rp("Stock Ledger"), rp("Total Stock Summary"), rp("Itemwise Recommended Reorder Level"), rp("Warehouse wise Item Balance Age and Value")] },
    ],
    extra: [{ id: "inv-setup", label: "Inventory Setup", section: "setup", items: [dt("Stock Settings")] }, data("Item")] },
  { id: "assets", label: "Fixed Assets", icon: "assets",
    home: pro("/pro/assets-overview", "Assets Overview"),
    all: all("assets", "All Fixed Assets"),
    owns: ["Asset", "Asset Category", "Asset Movement", "Asset Repair", "Asset Maintenance", "Asset Maintenance Log", "Asset Maintenance Team", "Asset Maintenance Task", "Asset Value Adjustment", "Asset Capitalization", "Asset Depreciation Schedule", "Asset Shift Allocation", "Asset Shift Factor", "Location"],
    quick: ["Asset", "Asset Movement", "Asset Repair"],
    flow: [{ label: "Acquisition", doctype: "Purchase Invoice" }, { label: "Register", doctype: "Asset" }, { label: "Depreciation Schedule", doctype: "Asset Depreciation Schedule" }],
    queues: [draft("Asset", "Draft assets", "medium"), draft("Asset Movement", "Draft asset movements"), draft("Asset Repair", "Draft asset repairs"), status("Asset", "In Maintenance", "Assets in maintenance")],
    sections: [
      { id: "ast-register", label: "Register & Acquisition", section: "workflow",
        items: [pro("/pro/asset-register", "Asset Register", "Every asset with book value and status"), pro("/pro/asset-360", "Asset 360", "One asset's value, depreciation, custody, maintenance and ledger"), dt("Asset", "Assets"), dt("Asset Capitalization"), dt("Asset Category", "Asset Categories"), dtf("Asset", "Draft Assets", DRAFT)],
        more: [dt("Purchase Receipt", "Asset acquisition"), dt("Purchase Invoice"), rp("Fixed Asset Register"), rp("Asset Depreciations and Balances")] },
      { id: "ast-custody", label: "Movement & Custody", section: "workflow",
        items: [dt("Asset Movement", "Asset Movements"), fin("/finance/asset-controls", "Asset controls"), dt("Location", "Locations"), rp("Asset Activity")],
        more: [dt("Asset Shift Allocation"), dt("Asset Shift Factor"), dt("Employee", "Custodians (Employees)"), pro("/pro/asset-register", "Asset Register", "Every asset with book value and status"), rp("Fixed Asset Register")] },
      { id: "ast-dep", label: "Depreciation & Value", section: "workflow",
        items: [pro("/pro/depreciation", "Depreciation Review", "Posted, journal-reference and due depreciation"), dt("Asset Depreciation Schedule", "Depreciation Schedules"), dt("Asset Value Adjustment", "Asset Value Adjustments"), rp("Asset Depreciation Ledger"), rp("Asset Depreciations and Balances")],
        more: [dt("Finance Book"), dt("Accounts Settings")] },
      { id: "ast-service", label: "Maintenance & Disposal", section: "reports",
        items: [dt("Asset Maintenance"), dt("Asset Maintenance Log"), dt("Asset Repair", "Asset Repairs"), pro("/pro/asset-disposal", "Sell or Scrap Asset"), rp("Fixed Asset Register")],
        more: [dt("Asset Maintenance Team"), dt("Asset Maintenance Task")] },
    ],
    extra: [data("Asset")] },
];

export const dtOf = (t: NavTarget) => (t.kind === "doctype" || t.kind === "tree" ? [t.doctype] : []);
export const DEPARTMENTS: Department[] = RAW.map((d) => {
  const groups: NavGroup[] = [...d.sections.map((s): NavGroup => ({ id: s.id, label: s.label, section: s.section, items: [...s.items, ...(s.more ?? [])], ...(s.compliance ? { compliance: true } : {}) })), ...d.extra];
  const primary: NavItem[] = [d.home, ...d.quick.map((q) => dt(q)), d.all];
  const doctypes = [...new Set([...primary, ...groups.flatMap((g) => g.items)].flatMap((i) => dtOf(i.target)).concat(d.flow.map((f) => f.doctype), d.queues.map((q) => q.doctype)))];
  return { ...d, groups, primary, doctypes, ...(d.id === "accounting" ? { areas: accountingAreas(d.home, groups) } : {}) };
});
export const deptById = (id: string) => DEPARTMENTS.find((d) => d.id === id);

/* ---------- Business section workspace pages (owner contract: 20 sections, 4 per department) ---------- */
/** `nav`: the department sections (sidebar-free item groups) whose documents/reports the workspace hosts. */
export type SectionPage = { id: string; dept: DeptId; slug: string; label: string; nav: string[]; link: NavItem };
const sp = (id: string, dept: DeptId, slug: string, nav: string[]): SectionPage => {
  const label = deptById(dept)!.sections.find((s) => s.id === nav[0])!.label;
  return { id, dept, slug, label, nav, link: { label, target: { kind: "section", dept, section: slug } } };
};
export const SECTION_PAGES: SectionPage[] = [
  sp("ACC-OPS", "accounting", "transactions-journals", ["acc-ops"]), sp("ACC-DUES", "accounting", "receivables-payables", ["acc-dues"]),
  sp("ACC-CASH", "accounting", "cash-banking", ["acc-cash"]), sp("ACC-REPORT", "accounting", "reports-controls", ["acc-reports", "acc-control"]),
  sp("SEL-SALES", "selling", "quotations-orders", ["sel-orders"]), sp("SEL-CUSTOMER", "selling", "customers-pricing", ["sel-customers"]),
  sp("SEL-FULFILL", "selling", "delivery-billing", ["sel-fulfil"]), sp("SEL-INTEL", "selling", "collections-analytics", ["sel-intel"]),
  sp("PUR-SOURCE", "purchasing", "requests-sourcing", ["pur-source"]), sp("PUR-ORDERS", "purchasing", "orders-commitments", ["pur-orders"]),
  sp("PUR-RECEIVE", "purchasing", "receiving-invoicing", ["pur-receive"]), sp("PUR-SUPPLIER", "purchasing", "suppliers-intelligence", ["pur-supplier"]),
  sp("INV-MASTER", "inventory", "items-warehouses", ["inv-items"]), sp("INV-MOVE", "inventory", "stock-movements", ["inv-move"]),
  sp("INV-CONTROL", "inventory", "counting-traceability", ["inv-count"]), sp("INV-REPORT", "inventory", "control-reports", ["inv-control"]),
  sp("AST-REGISTER", "assets", "register-acquisition", ["ast-register"]), sp("AST-CUSTODY", "assets", "movement-custody", ["ast-custody"]),
  sp("AST-DEP", "assets", "depreciation-value", ["ast-dep"]), sp("AST-SERVICE", "assets", "maintenance-disposal", ["ast-service"]),
];
export const pageOfNav = (navId: string | undefined) => (navId ? SECTION_PAGES.find((p) => p.nav.includes(navId)) : undefined);
export const pageBySlug = (dept: string, slugv: string) => SECTION_PAGES.find((p) => p.dept === dept && p.slug === slugv);
export const pageById = (id: string) => SECTION_PAGES.find((p) => p.id === id);
/** Shared Core pages (ServiceRoute screens) a section workspace lists among its own items: drawn as sub-links under the
 *  section in the department sidebar, so each opens in two clicks (rail → page; owner 2026-11-13). */
export function sectionCorePages(p: SectionPage): NavItem[] {
  const d = deptById(p.dept)!;
  return p.nav.flatMap((id) => { const s = d.sections.find((x) => x.id === id); return [...(s?.items ?? []), ...(s?.more ?? [])]; }).filter((i) => i.target.kind === "core");
}
/** Every item a section workspace hosts (sidebar-free): its department sections' items, then their directory-only `more`. */
export function pageItems(p: SectionPage): NavItem[] {
  const d = deptById(p.dept)!; const secs = p.nav.map((id) => d.sections.find((s) => s.id === id)!);
  return [...secs.flatMap((s) => s.items), ...secs.flatMap((s) => s.more ?? [])];
}

export const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "_");

/** Pathname (and optional search) a target opens; `app` comes from the catalog index. */
export function targetHref(t: NavTarget, appOf: (dt: string) => string | undefined): { to: string; params?: Record<string, string>; search?: Record<string, string> } | undefined {
  switch (t.kind) {
    case "pro": return t.search ? { to: t.to, search: t.search } : { to: t.to };
    case "dept": return { to: "/pro/$dept", params: { dept: t.dept } };
    case "section": return { to: "/pro/$dept/$section", params: { dept: t.dept, section: t.section } };
    case "doctype": { const app = appOf(t.doctype); if (!app) return undefined; return { to: "/app/$app/$doctype", params: { app, doctype: slug(t.doctype) }, ...(t.filters ? { search: { filters: JSON.stringify(t.filters) } } : {}) }; }
    case "tree": { const app = appOf(t.doctype); if (!app) return undefined; return { to: "/app/$app/$doctype/view/tree", params: { app, doctype: slug(t.doctype) } }; }
    case "report": return { to: "/report/$name", params: { name: t.report } };
    case "workspace": return { to: "/desk/$sidebar", params: { sidebar: t.sidebar } };
    case "import": return { to: "/app/data-import" };
    case "export": return { to: "/app/data-export", ...(t.doctype ? { search: { doctype: t.doctype } } : {}) };
    case "page": return { to: "/page/$name", params: { name: t.page } };
    case "core": return { to: t.to };
    case "dialog": case "missing": return undefined;
  }
}

const cleanPath = (path: string) => { let p = path; try { p = decodeURIComponent(path); } catch { /* keep raw */ } return p.replace(/(.)\/$/, "$1"); };
const normFilters = (f: unknown): string[] | undefined => {
  try { const a = typeof f === "string" ? JSON.parse(f) : f; if (!Array.isArray(a)) return undefined; return a.map((x) => (Array.isArray(x) ? x.slice(-3).map(String).join("|") : String(x))).sort(); } catch { return undefined; }
};

/**
 * How specifically a target matches a location (0 = no match). Exact filtered lists (3) beat an unfiltered list (2),
 * which beats a form / tree of the same DocType (1); a Pro screen with search keys matches only when every key matches.
 */
export function matchScore(t: NavTarget, path: string, search: Record<string, unknown> = {}): number {
  const p = cleanPath(path);
  switch (t.kind) {
    case "pro": {
      if (p !== t.to) return 0;
      if (!t.search) return 1;
      return Object.entries(t.search).every(([k, v]) => String(search[k] ?? "") === v) ? 1 + Object.keys(t.search).length : 0;
    }
    case "dept": return p === `/pro/${t.dept}` ? 1 : 0;
    case "section": return p === `/pro/${t.dept}/${t.section}` ? 4 : 0;
    case "doctype": {
      const m = new RegExp(`^/app/[^/]+/${slug(t.doctype)}(/.+)?$`).exec(p); if (!m) return 0;
      const isList = !m[1]; const cur = normFilters(search["filters"]);
      if (t.filters) { const want = normFilters(t.filters)!; return isList && !!cur && cur.length === want.length && cur.every((x, i) => x === want[i]) ? 3 : 0; }
      return isList && !cur?.length ? 2 : 1;
    }
    case "tree": { const m = new RegExp(`^/app/[^/]+/${slug(t.doctype)}(/.+)?$`).exec(p); if (!m) return 0; return m[1] === "/view/tree" ? 2 : 1; }
    case "report": return p === `/report/${t.report}` ? 1 : 0;
    case "workspace": return p === `/desk/${t.sidebar}` ? 1 : 0;
    case "import": return p.startsWith("/app/data-import") ? 1 : 0;
    case "export": return p === "/app/data-export" ? (t.doctype && String(search["doctype"] ?? "") === t.doctype ? 2 : 1) : 0;
    case "page": return p === `/page/${t.page}` ? 1 : 0;
    case "core": return p === t.to ? 1 : 0;
    case "dialog": case "missing": return 0;
  }
}
/** Does the current location belong to this target? Lists, forms and tree views of a DocType all count. */
export const matchesPath = (t: NavTarget, path: string, search: Record<string, unknown> = {}) => matchScore(t, path, search) > 0;

/* ---------- Shared services: one manifest per destination; every item is an existing Core resource or an explicit `missing`. ---------- */
export type ServiceId = "reports" | "settings" | "support";
export type Service = { id: ServiceId; to: ProRoute; label: string; subtitle: string; icon: string; groups: { label: string; hint?: string; items: NavItem[] }[] };
export const SERVICES: Service[] = [
  { id: "reports", to: "/pro/reports", label: "Reports & Compliance", subtitle: "Native Core reports, tax and audit resources — each opens the original report or list.", icon: "/icons/digit_pro/mod/digit-mod-reports-light.svg",
    groups: [
      { label: "Financial Reports", items: [rp("General Ledger"), rp("Trial Balance"), rp("Profit and Loss Statement"), rp("Balance Sheet"), rp("Cash Flow"), rp("Accounts Receivable"), rp("Accounts Payable"), pro("/pro/receivables", "Receivables"), pro("/pro/payables", "Payables")] },
      { label: "Sales and Purchasing Reports", items: [rp("Sales Analytics"), rp("Sales Register"), rp("Gross Profit"), rp("Customer Ledger Summary"), rp("Purchase Analytics"), rp("Purchase Register"), rp("Supplier Ledger Summary")] },
      { label: "Inventory and Asset Reports", items: [rp("Stock Balance"), rp("Stock Ledger"), rp("Stock Ageing"), rp("Stock Projected Qty"), rp("Fixed Asset Register"), rp("Asset Depreciation Ledger"), rp("Asset Depreciations and Balances")] },
      { label: "Taxes, Zakat and Compliance", items: [pro("/pro/vat", "VAT Reports"), { label: "KSA VAT Return", target: { kind: "core", to: "/tax/vat-return" } }, { label: "Zakat", target: { kind: "core", to: "/tax/zakat" } }, { label: "ZATCA e-invoicing", target: { kind: "core", to: "/tax/e-invoicing" } }, rp("Tax Withholding Details")] },
      { label: "Audit and Activity", items: [dt("Version", "Version (change history)"), dt("Activity Log"), dt("Access Log"), dt("Audit Trail"), rp("Permitted Documents For User"), dt("Error Log")] },
      { label: "Report Builder and Exports", items: [{ label: "All Core reports", target: { kind: "core", to: "/report" } }, dt("Report", "Saved reports"), dt("Prepared Report"), dt("Dashboard"), dt("Number Card"), dt("Dashboard Chart"), { label: "Data Export", target: { kind: "export" } }] },
    ] },
  { id: "settings", to: "/pro/settings", label: "Settings & Configuration", subtitle: "Company, users, accounting, workflows and approvals, tax and print setup in one place — each opens its own settings screen.", icon: "/icons/digit_pro/ui/digit-ui-settings-light.svg",
    groups: [
      // owner FINAL WORK LIST 2026-11-13 (P-29, OWN-45, ADM-04, T-21, P-31): Administration first, each control one click from the Settings menu
      { label: "Administration", items: [{ ...pro("/pro/admin", "Dashboard control — blocks per workspace, published to roles", undefined, { tab: "dashboards" }), roles: SYS },
        { ...pro("/pro/admin", "Feature control — screens, tabs and blocks inside documents per role and company", undefined, { tab: "features" }), roles: SYS },
        { ...pro("/pro/admin", "Print branding — logo, company details, footer", undefined, { tab: "branding" }), roles: SYS },
        { ...pro("/pro/admin", "Permissions matrix", undefined, { tab: "permissions" }), roles: SYS }] },
      { label: "Company & Organization", items: [ops("/control/setup-guide", "Setup guide and data completeness"), dt("Company"), dt("Global Defaults"), dt("Fiscal Year"), dt("Department"), dt("Branch")] },
      { label: "Users, Roles & Permissions", items: [dt("User"), dt("Role"), dt("Role Profile"), dt("User Permission"), page("permission-manager", "Role Permissions Manager", SYS), dt("Role Permission for Page and Report")] },
      { label: "Accounting & Finance", items: [dt("Accounts Settings"), dt("Accounting Period"), dt("Finance Book"), dt("Mode of Payment"), dt("Payment Terms Template"), dt("Currency Exchange")] },
      { label: "Workflows & Approvals", items: [dt("Workflow"), dt("Workflow State"), dt("Workflow Action Master"), dt("Authorization Rule"), { label: "Approval paths", target: { kind: "core", to: "/control/approvals" } },
        dt("Digit Approval Delegation", "Approval delegation"), dt("Digit Control Policy", "Control policies")] },
      { label: "Selling & Purchasing", items: [dt("Selling Settings"), dt("Buying Settings"), dt("Price List"), dt("Pricing Rule"), dt("Party Specific Item"), dt("Item Lead Time")] },
      { label: "Desk Layout & Onboarding", items: [dt("Workspace Sidebar"), dt("List View Settings"), dt("Module Onboarding"), dt("Onboarding Step")] },
      { label: "Inventory & Assets", items: [dt("Stock Settings"), dt("Warehouse"), dt("Digit Warehouse Capacity", "Warehouse capacity"), dt("UOM"), dt("Asset Category")] },
      { label: "Language, RTL and Print Formats", items: [dt("System Settings"), dt("Language"), dt("Translation"), dt("Print Settings"), dt("Print Format"), dt("Letter Head"), page("print-format-builder", "Print Format Builder", SYS)] },
      { label: "Notifications & Integrations", items: [dt("Notification"), dt("Notification Settings"), dt("Email Account"), dt("Webhook"), dt("Integration Request")] },
      { label: "Tax, VAT and Compliance Configuration", items: [dt("Sales Taxes and Charges Template"), dt("Purchase Taxes and Charges Template"), dt("Item Tax Template"), dt("Tax Category"), dt("Tax Rule"), dt("Tax Withholding Category"),
        { label: "ZATCA e-invoicing settings", target: { kind: "pro", to: "/pro/admin", search: { tab: "integrations" } }, roles: SYS }, { label: "ZATCA e-invoicing", target: { kind: "core", to: "/tax/e-invoicing" } }] },
      { label: "Data and Administration", items: [{ label: "Background jobs", target: { kind: "core", to: "/control/background-jobs" } }, { label: "Data Import", target: { kind: "import" } }, { label: "Data Export", target: { kind: "export" } }, { label: "All settings forms", target: { kind: "core", to: "/settings" }, roles: SYS }, { label: "Apps & Plugins", target: { kind: "core", to: "/plugins" }, roles: SYS }, page("backups", "Download Backups", SYS), { ...pro("/pro/admin", "Administration", "Feature control, dashboard publishing, permissions matrix, automation, jobs and upgrade impact"), roles: SYS }] },
    ] },
  { id: "support", to: "/pro/support", label: "Support & Help", subtitle: "Help articles, support issues and guidance that already exist in Core.", icon: "/icons/digit_pro/ui/digit-ui-info-light.svg",
    groups: [
      { label: "Help and Documentation", items: [dt("Help Article", "Help articles"), dt("Help Category", "Help categories"), { label: "Keyboard shortcuts", target: { kind: "dialog", dialog: "shortcuts" } }] },
      { label: "Support Issues", hint: "Issue is the native DIGIT support ticket; new issues use the standard form.", items: [dt("Issue", "Support issues"), dt("Issue Type"), dt("Issue Priority"), dt("Service Level Agreement"), dt("Support Settings")] },
      { label: "Your account and alerts", items: [{ label: "My settings", target: { kind: "dialog", dialog: "settings" } }, dt("Notification Log", "Notifications")] },
      { label: "DIGIT support", items: [ops("/support/desk", "DIGIT vendor support desk"), ops("/support/chat", "Live chat")] },
    ] },
];
export const serviceById = (id: string) => SERVICES.find((s) => s.id === id);
export const isServicePath = (p: string) => p === "/pro/dashboard" || SERVICES.some((s) => p.replace(/\/$/, "") === s.to);

/* ---------- Contexts: the primary rail. ---------- */
export type NavContextKind = "executive" | "department" | "service";
/**
 * `links`: the compact contextual sidebar between the pinned home and "All" — page destinations only (section
 * workspaces, decision tabs, analysis screens), never native document leaves. `sections` are not rendered in the
 * sidebar; they only tell the resolver which work area (and so which section page) a native document belongs to.
 */
/** Rail icon of a shared service in the shared DIGIT icon library (public/icons/digit). SERVICES keep the Frappe package's
 *  /icons/digit_pro paths because config/nav.json is exported from them; only the preview rail reads the library. */
const libIcon = (id: string, icon: string) => (id === "support" ? "/icons/digit/ui/digit-ui-support-dark.svg" : icon.replace("/icons/digit_pro/", "/icons/digit/").replace("-light.svg", "-dark.svg"));
export type NavContextDef = { id: CtxId; kind: NavContextKind; label: string; short: string; icon: string; home: NavItem; all?: NavItem; links: NavItem[]; sections: MenuSection[] };
const secId = (prefix: string, label: string) => `${prefix}-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}`;
const SHORT: Record<DeptId, string> = { accounting: "Accounting", selling: "Selling", purchasing: "Purchasing", inventory: "Inventory", assets: "Fixed Assets" };
const tab = (t: string, label: string): NavItem => ({ ...pro("/pro/reports", label, undefined, { tab: t }) });
const COMPLIANCE_HOME = pro("/pro/reports", "Tax and compliance reports", "Every tax, VAT and audit report in Core", { tab: "all", area: "compliance" });
/** Executive sidebar: the six executive pages under the pinned Overview (department overviews stay on the rail). */
const EXEC_LINKS: NavItem[] = EXEC_PAGES.map((p) => pro(p.to, p.label[0], p.question[0]));
const REP_DECISIONS: NavItem[] = [tab("cfo", "CFO decisions"), tab("sales", "Sales decisions"), tab("procurement", "Procurement decisions"), tab("inventory", "Inventory decisions"), tab("assets", "Asset decisions")];
const REP_MINE: NavItem[] = [tab("mine", "Favorites, recent and saved views"), tab("all", "All reports")];
/** Shared Core screens a service context lists directly in its sidebar (owner 2026-11-13: query studio → Reports, background jobs → Settings, vendor support desk → Help). */
export const QUERY_STUDIO: NavItem = { label: "Query studio", target: { kind: "core", to: "/report/studio" } };
const SERVICE_PAGES: Record<"settings" | "support", NavItem[]> = { settings: [ops("/control/setup-guide", "Setup guide and data completeness"), { label: "Background jobs", target: { kind: "core", to: "/control/background-jobs" } }], support: [ops("/support/desk", "DIGIT vendor support desk")] };
const CMP_LINKS: NavItem[] = [pro("/pro/vat", "VAT Reports", "Output and input tax by document"), pro("/pro/audit", "Audit & Exceptions", "Exceptions and change history"), pro("/pro/period-control", "Period Control", "Closing vs locking")];

export const CONTEXTS: NavContextDef[] = [
  { id: "executive", kind: "executive", label: "Executive Dashboard", short: "Executive", icon: "/icons/digit/ui/digit-ui-dashboard-dark.svg",
    home: pro("/pro/dashboard", "Executive overview"),
    links: EXEC_LINKS,
    sections: [
      { id: "exec-pages", label: "Executive pages", items: EXEC_LINKS },
      { id: "exec-decisions", label: "Decision reports", items: [tab("cfo", "CFO decisions"), tab("sales", "Sales decisions"), tab("procurement", "Procurement decisions"), tab("inventory", "Inventory decisions"), tab("assets", "Asset decisions")].map((i) => ({ ...i, enter: "reports" as const })) },
    ] },
  ...DEPARTMENTS.map((d): NavContextDef => ({ id: d.id, kind: "department", label: d.label, short: SHORT[d.id], icon: `/icons/digit/mod/digit-mod-${d.icon}-dark.svg`, home: d.home, all: d.all,
    links: SECTION_PAGES.filter((p) => p.dept === d.id).map((p) => p.link), sections: d.sections.map(({ id, label, items, more }) => ({ id, label, items: [...items, ...(more ?? [])] })) })),
  { id: "reports", kind: "service", label: "Reports Center", short: "Reports", icon: "/icons/digit/mod/digit-mod-reports-dark.svg",
    home: pro("/pro/reports", "Reports Center"),
    links: [QUERY_STUDIO, ...REP_DECISIONS, ...REP_MINE],
    sections: [
      { id: "rep-studio", label: "Query studio", items: [QUERY_STUDIO] },
      { id: "rep-decisions", label: "Decision reports", items: REP_DECISIONS },
      { id: "rep-mine", label: "My reports", items: REP_MINE },
      { id: "rep-dirs", label: "Report directories", items: [
        pro("/pro/reports", "Accounting reports", undefined, { tab: "all", area: "accounting" }), pro("/pro/reports", "Selling reports", undefined, { tab: "all", area: "selling" }),
        pro("/pro/reports", "Purchasing reports", undefined, { tab: "all", area: "purchasing" }), pro("/pro/reports", "Inventory reports", undefined, { tab: "all", area: "inventory" }),
        pro("/pro/reports", "Fixed asset reports", undefined, { tab: "all", area: "assets" }), { label: "All Core reports", target: { kind: "core", to: "/report" } }] },
    ] },
  { id: "compliance", kind: "service", label: "Compliance & Controls", short: "Compliance", icon: "/icons/digit/trust/digit-trust-zatca-dark.svg",
    home: COMPLIANCE_HOME,
    links: CMP_LINKS,
    sections: [
      { id: "cmp-tax", label: "Tax & VAT", items: [CMP_LINKS[0]!, { label: "KSA VAT Return", target: { kind: "core", to: "/tax/vat-return" } }, { label: "Zakat", target: { kind: "core", to: "/tax/zakat" } }, { label: "ZATCA e-invoicing", target: { kind: "core", to: "/tax/e-invoicing" } }, rp("Tax Withholding Details")] },
      { id: "cmp-audit", label: "Audit & Activity", items: [CMP_LINKS[1]!, dt("Version", "Version (change history)"), dt("Activity Log"), dt("Access Log"), dt("Audit Trail"), rp("Permitted Documents For User"), dt("Error Log")] },
      { id: "cmp-close", label: "Close & Controls", items: [CMP_LINKS[2]!, dt("Accounting Period"), dt("Period Closing Voucher"), dt("Fiscal Year")] },
      { id: "cmp-config", label: "Tax configuration", items: [dt("Sales Taxes and Charges Template"), dt("Purchase Taxes and Charges Template"), dt("Item Tax Template"), dt("Tax Category"), dt("Tax Rule"), dt("Tax Withholding Category")] },
    ] },
  ...(["settings", "support"] as const).map((id): NavContextDef => {
    const s = serviceById(id)!;
    return { id, kind: "service", label: s.label, short: id === "settings" ? "Settings" : "Help", icon: libIcon(id, s.icon), home: pro(s.to, s.label), links: SERVICE_PAGES[id], sections: s.groups.map((g) => ({ id: secId(id, g.label), label: g.label, items: g.items })) };
  }),
];
export const ctxById = (id: string | undefined) => CONTEXTS.find((c) => c.id === id);
export const isDept = (id: string | undefined): id is DeptId => !!id && DEPARTMENTS.some((d) => d.id === id);

/** Canonical department owning a native DocType (explicit `owns`, else first department whose directory lists it). */
export function ownerOfDoctype(doctype: string): DeptId | undefined {
  return (DEPARTMENTS.find((d) => d.owns.includes(doctype)) ?? DEPARTMENTS.find((d) => d.doctypes.includes(doctype)))?.id;
}
/** Native DocType of an /app/<app>/<slug>[/...] location, resolved through every manifest DocType. */
const ALL_DTS = (): string[] => [...new Set([...DEPARTMENTS.flatMap((d) => d.doctypes.concat(d.owns)), ...CONTEXTS.flatMap((c) => c.sections.flatMap((s) => s.items)).flatMap((i) => dtOf(i.target))])];
export function doctypeOfPath(path: string): { doctype?: string; slug: string; form: boolean } | undefined {
  const m = /^\/app\/([^/]+)\/([^/]+)(\/(.+))?$/.exec(cleanPath(path)); if (!m || m[1]!.startsWith("data-")) return undefined;
  const s = m[2]!; const rest = m[4]; const form = !!rest && rest !== "view/tree";
  const doctype = ALL_DTS().find((d) => slug(d) === s);
  return { ...(doctype ? { doctype } : {}), slug: s, form };
}

export type NavWhere = "home" | "all" | "page" | "section" | "directory";
export interface NavResolution {
  ctx: CtxId;
  /** Highlighted sidebar entry inside `ctx`: home, a section page link, a context link, or the pinned "All …". */
  item?: NavItem; where?: NavWhere; section?: string;
  /** Section workspace that owns the location (the page itself, or a native document/report hosted by it). */
  page?: SectionPage;
  /** The specific resource matched (e.g. the "Draft Journal Entries" filtered list) when `item` is its section page. */
  leaf?: NavItem;
  /** Canonical owner of the native DocType on screen, when it differs from `ctx` the breadcrumb says so. */
  owner?: DeptId;
  via: "forced" | "kept" | "owner" | "match" | "inherit" | "fallback";
}
type Hit = { ctx: CtxId; item: NavItem; score: number; where: NavWhere; section?: string; page?: SectionPage };

/**
 * Route-truth resolver shared by the rail, contextual sidebar and breadcrumbs.
 * - `forced`: context explicitly recorded for this history entry (menu click, refresh, Back/Forward).
 * - `last`: context of the previous location in this tab — kept when it also contains the destination (task
 *   context, e.g. Accounting → Receivables & Payables → Sales Invoice); a document form opened from a department stays there.
 * - otherwise the canonical owner (cold deep link: Sales Invoice → Selling, Journal Entry → Accounting).
 * - `page` / `lastPage`: section workspace slug recorded for / preceding this entry — a document hosted by several
 *   sections of the same department stays under the section it was opened from.
 */
export function resolveLocation(path: string, search: Record<string, unknown> = {}, opts: { forced?: CtxId | undefined; last?: CtxId | undefined; page?: string | undefined; lastPage?: string | undefined } = {}): NavResolution {
  const p = cleanPath(path);
  const hits: Hit[] = [];
  for (const c of CONTEXTS) {
    const add = (i: NavItem, where: NavWhere, section?: string, page?: SectionPage, penalty = 0) => {
      if (i.enter && i.enter !== c.id) return;
      const sc = matchScore(i.target, p, search); if (sc) hits.push({ ctx: c.id, item: i, score: sc - penalty, where, ...(section ? { section } : {}), ...(page ? { page } : {}) });
    };
    add(c.home, "home"); if (c.all) add(c.all, "all");
    const d = deptById(c.id);
    if (d) {
      for (const pg of SECTION_PAGES.filter((x) => x.dept === d.id)) add(pg.link, "page", pg.nav[0], pg);
      for (const s of d.sections) { const pg = pageOfNav(s.id); for (const i of s.items) add(i, "section", s.id, pg); for (const i of s.more ?? []) add(i, "section", s.id, pg, 0.5); }
      for (const g of d.extra) for (const i of g.items) add(i, "directory", undefined, undefined, 0.5);
    } else {
      for (const l of c.links) add(l, "section");
      for (const s of c.sections) for (const i of s.items) if (!c.links.includes(i)) add(i, "section", s.id);
    }
  }
  const dtp = doctypeOfPath(p);
  const owner = dtp?.doctype ? ownerOfDoctype(dtp.doctype) : undefined;
  const cands = [...new Set(hits.map((h) => h.ctx))];
  const pick = (hs: Hit[]) => [...hs].sort((a, b) => b.score - a.score || rank(a.where) - rank(b.where))[0];
  const top = (ctx: CtxId) => pick(hits.filter((h) => h.ctx === ctx));
  let ctx: CtxId | undefined; let via: NavResolution["via"] = "match";
  if (opts.forced && ctxById(opts.forced)) { ctx = opts.forced; via = "forced"; }
  else if (dtp?.form && isDept(opts.last)) { ctx = opts.last; via = "inherit"; }
  else if (opts.last && cands.includes(opts.last)) { ctx = opts.last; via = "kept"; }
  else if (owner && cands.includes(owner)) { ctx = owner; via = "owner"; }
  else if (cands.length) {
    // Pro screens / reports: the department whose sections list it first (departments before services), then best score.
    const sectionOwner = DEPARTMENTS.find((d) => hits.some((h) => h.ctx === d.id && h.where !== "directory"))?.id;
    ctx = sectionOwner ?? [...cands].sort((a, b) => top(b)!.score - top(a)!.score)[0]!;
  } else if (dtp) { ctx = isDept(opts.last) ? opts.last : owner ?? opts.last ?? "executive"; via = isDept(opts.last) ? "inherit" : owner ? "owner" : "fallback"; }
  else if (/^\/report\//.test(p)) { ctx = opts.last ?? "reports"; via = "fallback"; }
  else { ctx = opts.last ?? "executive"; via = "fallback"; }
  const inCtx = hits.filter((h) => h.ctx === ctx);
  const prefer = [opts.page, opts.lastPage].find((sl) => sl && inCtx.some((h) => h.page?.slug === sl));
  const best = prefer ? pick(inCtx.filter((h) => h.page?.slug === prefer)) : pick(inCtx);
  const c = ctxById(ctx)!;
  const res: NavResolution = { ctx, via };
  // A native document opened from a section workspace stays in that workspace even when another section of the same
  // department also hosts its DocType (e.g. a Sales Order opened from Delivery & Billing). Lists need the explicit
  // per-entry section (a section click), forms also inherit the preceding entry's section.
  const origin = dtp && (via === "forced" || via === "inherit" || via === "kept")
    ? [opts.page, dtp.form ? opts.lastPage : undefined].map((sl) => (sl ? pageBySlug(ctx, sl) : undefined)).find(Boolean) : undefined;
  if (origin && best?.where !== "page") {
    res.page = origin; res.item = origin.link; res.where = "section";
    if (best && best.page?.id === origin.id) { res.leaf = best.item; if (best.section) res.section = best.section; }
  } else if (best) {
    if (best.where === "directory") { if (c.all) { res.item = c.all; res.where = "directory"; } }
    else if (best.page) { res.page = best.page; res.item = best.page.link; res.where = best.where === "page" ? "page" : "section"; res.leaf = best.item; if (best.section) res.section = best.section; }
    else if (best.where === "section" && !c.links.includes(best.item)) { res.item = c.home; res.where = "section"; res.leaf = best.item; if (best.section) res.section = best.section; }
    else { res.item = best.item; res.where = best.where; if (best.section) res.section = best.section; }
  } else if (via === "inherit" || via === "forced") {
    // A linked document outside every section (e.g. a Delivery Note opened from Receivables) keeps its originating section.
    const pg = [opts.page, opts.lastPage].map((sl) => (sl ? pageBySlug(ctx, sl) : undefined)).find(Boolean);
    if (pg) { res.page = pg; res.item = pg.link; res.where = "section"; }
  }
  if (owner && owner !== ctx) res.owner = owner;
  return res;
}
const rank = (w: NavWhere) => ["page", "section", "home", "all", "directory"].indexOf(w);

/** Compatibility wrapper (department + highlighted item) used by older callers and tests. */
export function locate(path: string, prefer?: string): { dept: Department; item: NavItem } | undefined {
  const r = resolveLocation(path, {}, { last: isDept(prefer) ? prefer : undefined });
  const d = deptById(r.ctx); if (!d) return undefined;
  return { dept: d, item: r.item ?? d.home };
}

/** Every menu item of a context (home, sections, all). */
export const ctxItems = (c: NavContextDef): NavItem[] => [c.home, ...c.links, ...c.sections.flatMap((s) => s.items), ...(c.all ? [c.all] : [])];
export const SERVICE_DOCTYPES = [...new Set([...SERVICES.flatMap((s) => s.groups.flatMap((g) => g.items)), ...CONTEXTS.filter((c) => c.kind !== "department").flatMap(ctxItems)].flatMap((i) => dtOf(i.target)))];
export const SERVICE_REPORTS = [...new Set([...SERVICES.flatMap((s) => s.groups.flatMap((g) => g.items)), ...CONTEXTS.filter((c) => c.kind !== "department").flatMap(ctxItems)].flatMap((i) => (i.target.kind === "report" ? [i.target.report] : [])))];

const allItems = DEPARTMENTS.flatMap((d) => [...d.primary, ...d.groups.flatMap((g) => g.items)]);
export const NAV_DOCTYPES = [...new Set(DEPARTMENTS.flatMap((d) => d.doctypes))];
/**
 * Primary source records of each DIGIT Pro analytical screen. A screen link is shown only when the session user can read
 * all of them (session.ts rules), so menus never offer a screen that would open empty for that role. Overviews, the
 * dashboard and shared services are not listed: they always open and filter their own panels.
 */
export const PRO_SOURCE: Partial<Record<ProRoute, string[]>> = {
  "/pro/general-ledger": ["GL Entry"], "/pro/trial-balance": ["GL Entry"], "/pro/statements": ["GL Entry"], "/pro/finance-intelligence": ["GL Entry"],
  "/pro/cost-centers": ["GL Entry"], "/pro/vat": ["GL Entry"], "/pro/period-control": ["Period Closing Voucher"], "/pro/audit": ["Version"],
  "/pro/bank-reconciliation": ["Bank Transaction"], "/pro/payments": ["Payment Entry"], "/pro/accounts": ["Account"],
  "/pro/receivables": ["Sales Invoice"], "/pro/collections": ["Sales Invoice"], "/pro/sales-analytics": ["Sales Invoice"], "/pro/delivered-not-billed": ["Delivery Note"],
  "/pro/payables": ["Purchase Invoice"], "/pro/open-purchase-orders": ["Purchase Order"], "/pro/received-not-billed": ["Purchase Receipt"],
  "/pro/stock-ledger": ["Stock Ledger Entry"], "/pro/stock-balance": ["Stock Ledger Entry"], "/pro/stock-value-reconciliation": ["Bin", "Stock Ledger Entry"], "/pro/warehouses": ["Warehouse"],
  "/pro/asset-register": ["Asset"], "/pro/depreciation": ["Asset"], "/pro/asset-disposal": ["Asset"],
};
export const PRO_SOURCE_DOCTYPES = [...new Set(Object.values(PRO_SOURCE).flat())];

export const NAV_REPORTS = [...new Set(allItems.flatMap((i) => (i.target.kind === "report" ? [i.target.report] : [])))];

/** Short rail labels and generic words — kept out of the global plugin dictionary so Core strings are never overridden. */
export const RAIL_AR: Record<string, string> = {
  "Executive": "التنفيذية", "Accounting": "المحاسبة", "Selling": "المبيعات", "Purchasing": "المشتريات", "Inventory": "المخزون", "Fixed Assets": "الأصول الثابتة",
  "Reports": "التقارير", "Compliance": "الامتثال", "Settings": "الإعدادات", "Help": "المساعدة", "Search": "بحث",
};

export const NAV_AR: Record<string, string> = {
  "Item 360": "ملف الصنف 360", "One item's stock, documents and ledger trail": "مخزون الصنف ومستنداته وأثره في القيود", "Asset 360": "ملف الأصل 360",
  "One asset's value, depreciation, custody, maintenance and ledger": "قيمة الأصل وإهلاكه وعهدته وصيانته وقيوده", "Marketplace Orders": "طلبات المتاجر الإلكترونية",
  "Administration": "الإدارة", "Setup guide and data completeness": "دليل الإعداد واكتمال البيانات",
  "Dashboard control — blocks per workspace, published to roles": "التحكم باللوحات — الكتل لكل مساحة عمل ونشرها للأدوار",
  "Feature control — screens, tabs and blocks inside documents per role and company": "التحكم بالميزات — الشاشات والتبويبات والكتل داخل المستندات لكل دور وشركة",
  "Print branding — logo, company details, footer": "هوية الطباعة — الشعار وبيانات الشركة والتذييل",
  "Permissions matrix": "مصفوفة الصلاحيات", "Feature control, dashboard publishing, permissions matrix, automation, jobs and upgrade impact": "التحكم بالميزات ونشر لوحات المعلومات ومصفوفة الصلاحيات والأتمتة والمهام وأثر الترقية",
  "Finance Intelligence": "التحليل المالي للإدارة", "Custodians (Employees)": "أمناء العهد (الموظفون)",
  "Asset directory": "دليل الأصول", "Native asset list": "قائمة الأصول الأصلية", "Asset lifecycle": "دورة حياة الأصل", "Asset acquisition": "اقتناء الأصول", "Movement and custody": "حركة الأصول والعهدة", "Preventive maintenance": "الصيانة الدورية", "Repairs": "الإصلاحات", "Registers and reports": "السجلات والتقارير", "Asset movement history": "سجل حركات الأصول", "Asset settings": "إعدادات الأصول",
  "Fixed Assets": "الأصول الثابتة", "Main Dashboard": "لوحة التحكم", "Shared Services": "الخدمات المشتركة", "Reports & Compliance": "مركز التقارير والامتثال", "Settings & Configuration": "الإعدادات والتهيئة", "Support & Help": "الدعم الفني والمساعدة",
  "Workspace": "مساحة العمل", "Company": "الشركة", "User": "المستخدم", "Role": "الدور", "My Preferences": "تفضيلاتي", "Company Defaults": "الإعدادات الافتراضية للشركة", "Users & Permissions": "المستخدمون والصلاحيات",
  "Accounting": "المحاسبة", "Selling": "المبيعات", "Purchasing": "المشتريات", "Inventory": "المخزون", "Assets": "الأصول",
  "Accounting Overview": "نظرة عامة على المحاسبة", "Selling Overview": "نظرة عامة على المبيعات", "Purchasing Overview": "نظرة عامة على المشتريات", "Inventory Overview": "نظرة عامة على المخزون", "Assets Overview": "نظرة عامة على الأصول",
  "All Accounting": "كل المحاسبة", "All Selling": "كل المبيعات", "All Purchasing": "كل المشتريات", "All Inventory": "كل المخزون", "All Assets": "كل الأصول",
  "Customers": "العملاء", "Sales Orders": "أوامر البيع", "Sales Invoices": "فواتير المبيعات", "Suppliers": "الموردون", "Purchase Orders": "أوامر الشراء", "Purchase Receipts": "إيصالات الشراء", "Items": "الأصناف", "Asset Register": "سجل الأصول",
  "DIGIT Pro Home": "رئيسية ديجيت برو", "Reports Center": "مركز التقارير", "Departments": "الأقسام", "Home": "الرئيسية", "Search": "بحث", "More Apps": "تطبيقات أخرى", "Menu": "القائمة",
  "General Accounting": "المحاسبة العامة", "Banking": "البنوك", "Financial Reporting": "التقارير المالية", "Tax": "الضرائب", "Setup and Controls": "الإعداد والضوابط", "Data Operations": "عمليات البيانات", "Setup": "الإعداد",
  "Quotation to Order": "من عرض السعر إلى الأمر", "Fulfilment and Billing": "التسليم والفوترة", "Pricing": "التسعير", "Selling Reports": "تقارير المبيعات",
  "Sourcing": "التوريد", "Supplier Management": "إدارة الموردين", "Sourcing and Quotations": "التوريد وعروض الأسعار", "Receiving": "الاستلام", "Supplier Invoices and Payments": "فواتير الموردين والمدفوعات", "Open Orders and Reports": "الأوامر المفتوحة والتقارير", "Purchase orders to receive": "أوامر شراء بانتظار الاستلام", "Purchase orders to bill": "أوامر شراء بانتظار الفوترة", "Draft purchase orders": "أوامر شراء مسودة", "Supplier quotations to review": "عروض أسعار موردين للمراجعة", "Ordering and Receiving": "الطلب والاستلام", "Billing": "الفوترة", "Purchasing Reports": "تقارير المشتريات",
  "Items and Warehouses": "الأصناف والمستودعات", "Availability": "التوفر", "Movements": "الحركات", "Reconciliation and Ledger": "التسوية والدفتر", "Inventory Reports": "تقارير المخزون",
  "Register": "السجل", "Depreciation and Value": "الإهلاك والقيمة", "Movement and Maintenance": "الحركة والصيانة", "Asset Reports": "تقارير الأصول",
  "Delivery": "التسليم", "Invoice": "الفاتورة", "Collections": "التحصيل", "RFQ": "طلب عرض أسعار", "Receipt": "الاستلام", "Warehouses": "المستودعات", "Receipt / Issue / Transfer": "استلام / صرف / تحويل", "Reconciliation": "التسوية",
  "Acquisition": "الاقتناء", "Depreciation Schedule": "جدول الإهلاك", "Movement / Maintenance": "الحركة / الصيانة", "Disposal and Reports": "الاستبعاد والتقارير", "Bin (stock levels)": "الأرصدة (مستويات المخزون)",
  "Draft journal entries": "قيود يومية مسودة", "Draft payment entries": "سندات دفع مسودة", "Draft quotations": "عروض أسعار مسودة", "Draft material requests": "طلبات مواد مسودة",
  "Draft stock entries": "حركات مخزون مسودة", "Draft stock reconciliations": "تسويات مخزون مسودة", "Draft assets": "أصول مسودة", "Draft asset movements": "حركات أصول مسودة", "Draft asset repairs": "إصلاحات أصول مسودة",
  "Sales orders to deliver and bill": "أوامر بيع للتسليم والفوترة", "Sales orders to bill": "أوامر بيع للفوترة", "Delivery notes to bill": "إشعارات تسليم للفوترة",
  "Pending material requests": "طلبات مواد معلقة", "Purchase orders to receive and bill": "أوامر شراء للاستلام والفوترة", "Purchase receipts to bill": "إيصالات شراء للفوترة",
  "Assets in maintenance": "أصول قيد الصيانة", "Assets out of order": "أصول معطلة",
  "Search and inspect the account tree": "ابحث في شجرة الحسابات واستعرضها", "Outstanding by party and age": "المستحقات حسب الطرف والعمر", "Received and paid, with allocation": "المقبوض والمدفوع مع التخصيص",
  "Operational priorities": "الأولويات التشغيلية", "Operational priorities and workflow": "الأولويات التشغيلية وسير العمل", "Workflow": "سير العمل", "Document directory": "دليل المستندات", "Configuration and data tools": "الإعداد وأدوات البيانات",
  "Recent work": "الأعمال الأخيرة", "Quick create": "إنشاء سريع", "Find a document, report or setting": "ابحث عن مستند أو تقرير أو إعداد", "No matching resources": "لا توجد نتائج مطابقة",
  "Pro": "برو", "Unavailable": "غير متاح", "New": "جديد", "records": "سجلات", "Finance screens": "شاشات المالية", "No recent records": "لا توجد سجلات حديثة",
  "All permitted companies": "كل الشركات المسموح بها", "Open queue": "فتح القائمة", "Nothing pending": "لا يوجد شيء معلّق", "Overdue": "متأخر",
  "Every department report in one place — opens the native Core report.": "كل تقارير الأقسام في مكان واحد — تفتح تقرير النواة الأصلي.",
  "Native Core documents, reports and setup for this department.": "مستندات النواة وتقاريرها وإعداداتها الأصلية لهذا القسم.",
  "Native Core reports, tax and audit resources — each opens the original report or list.": "تقارير النواة الأصلية وموارد الضرائب والتدقيق — يفتح كل منها التقرير أو القائمة الأصلية.",
  "Company, users, accounting, workflows and approvals, tax and print setup in one place — each opens its own settings screen.": "الشركة والمستخدمون والمحاسبة وسير العمل والاعتمادات والضرائب والطباعة في مكان واحد — كل بند يفتح شاشة إعداداته.",
  "Help articles, support issues and guidance that already exist in Core.": "مقالات المساعدة وطلبات الدعم والإرشادات الموجودة في النواة.",
  "Pending work across all departments — every number opens the native records behind it.": "الأعمال المعلّقة في كل الأقسام — كل رقم يفتح السجلات الأصلية خلفه.",
  "Financial Reports": "التقارير المالية",
  "Sales and Purchasing Reports": "تقارير المبيعات والمشتريات",
  "Inventory and Asset Reports": "تقارير المخزون والأصول",
  "Taxes, Zakat and Compliance": "الضرائب والزكاة والامتثال",
  "Audit and Activity": "التدقيق والنشاط",
  "Report Builder and Exports": "منشئ التقارير والتصدير",
  "KSA VAT Return": "إقرار ضريبة القيمة المضافة السعودي",
  "Scan Stock": "مسح المخزون", "Dock Appointments": "مواعيد الرصيف", "Procurement Policies": "سياسات الشراء", "Approval Paths": "مسارات الاعتماد",
  "Supplier Payment Run": "دفعات سداد الموردين", "Customer and Supplier Netting": "مقاصة العميل والمورد", "Supplier Invoice Processing": "معالجة فواتير الموردين",
  "Cash Forecast": "توقع النقد", "Exceptions and Risks": "الاستثناءات والمخاطر", "Group Consolidation": "التوحيد المالي للمجموعة", "Financial Statement Designer": "مصمم القوائم المالية",
  "Period Close": "إقفال الفترة", "Recurring Documents": "المستندات المتكررة",
  "Zakat": "الزكاة", "VAT Reports": "تقارير ضريبة القيمة المضافة",
  "ZATCA e-invoicing": "الفوترة الإلكترونية (زاتكا)",
  "ZATCA e-invoicing settings": "إعدادات الفوترة الإلكترونية (زاتكا)",
  "No KSA VAT return report in Core; UAE VAT 201 is the only VAT return report installed.": "لا يوجد تقرير إقرار ضريبي سعودي في النواة؛ تقرير ضريبة الإمارات 201 هو تقرير الإقرار الوحيد المثبت.",
  "No zakat report, DocType or data exists in Core.": "لا يوجد تقرير أو نوع مستند أو بيانات للزكاة في النواة.",
  "No ZATCA integration app is installed in Core.": "لا يوجد تطبيق تكامل مع زاتكا مثبت في النواة.",
  "Version (change history)": "الإصدارات (سجل التغييرات)",
  "All Core reports": "كل تقارير النواة",
  "Saved reports": "التقارير المحفوظة",
  "Company & Organization": "الشركة والمنظمة",
  "Users, Roles & Permissions": "المستخدمون والأدوار والصلاحيات",
  "Accounting & Finance": "المحاسبة والمالية",
  "Workflows & Approvals": "سير العمل والاعتمادات", "Approval paths": "مسارات الاعتماد", "Approval delegation": "تفويض الاعتماد", "Control policies": "سياسات الرقابة",
  "Workflow State": "حالة سير العمل", "Workflow Action Master": "إجراءات سير العمل", "Authorization Rule": "قاعدة التفويض",
  "Selling & Purchasing": "المبيعات والمشتريات",
  "Inventory & Assets": "المخزون والأصول", "Desk Layout & Onboarding": "تخطيط المكتب والتهيئة", "Finance impact reports": "تقارير الأثر المالي", "Warehouse capacity": "سعة المستودعات",
  "Language, RTL and Print Formats": "اللغة والاتجاه وتنسيقات الطباعة",
  "Notifications & Integrations": "الإشعارات والتكاملات",
  "Tax, VAT and Compliance Configuration": "إعدادات الضرائب والقيمة المضافة والامتثال",
  "Data and Administration": "البيانات والإدارة",
  "All settings forms": "كل نماذج الإعدادات",
  "Apps & Plugins": "التطبيقات والإضافات",
  "Role Permissions Manager": "مدير صلاحيات الأدوار",
  "Print Format Builder": "منشئ تنسيق الطباعة",
  "Download Backups": "تنزيل النسخ الاحتياطية",
  "Help and Documentation": "المساعدة والتوثيق",
  "Help articles": "مقالات المساعدة",
  "Help categories": "فئات المساعدة",
  "Keyboard shortcuts": "اختصارات لوحة المفاتيح",
  "Support Issues": "طلبات الدعم",
  "Issue is the native DIGIT support ticket; new issues use the standard form.": "المشكلة هي تذكرة الدعم الأصلية في DIGIT؛ تُنشأ الطلبات الجديدة من النموذج القياسي.",
  "Support issues": "طلبات الدعم",
  "Your account and alerts": "حسابك وتنبيهاتك",
  "My settings": "إعداداتي",
  "Notifications": "الإشعارات",
  "Not yet connected": "غير متصل بعد", "DIGIT support": "دعم ديجيت",
  "DIGIT vendor support desk": "مكتب دعم ديجيت",
  "No external helpdesk or support e-mail integration is configured; issues stay inside this Core.": "لا يوجد تكامل مع مكتب دعم خارجي أو بريد دعم؛ تبقى الطلبات داخل هذه النواة.",
  "Live chat": "المحادثة المباشرة",
  "No chat or assistance integration exists in Core.": "لا يوجد تكامل للمحادثة أو المساعدة في النواة.",
  "Not available": "غير متوفر", "Webhook": "خطاف الويب",
  "items hidden by your permissions": "عناصر مخفية حسب صلاحياتك",
  "Report shortcuts": "اختصارات التقارير",
  "No notifications": "لا توجد إشعارات",
  "Pick a department to see its documents, reports and setup.": "اختر قسمًا لعرض مستنداته وتقاريره وإعداداته.",
  // NAV-RECOVERY-01 contexts, sections and leaves
  "Executive Dashboard": "لوحة التحكم التنفيذية", "Executive pages": "صفحات القيادة", "Executive overview": "النظرة العامة",
  ...Object.fromEntries(EXEC_PAGES.flatMap((p) => [[p.label[0], p.label[1]], [p.question[0], p.question[1]]])), "Compliance & Controls": "الامتثال والرقابة", "All Fixed Assets": "كل الأصول الثابتة",
  "Transactions & Journals": "العمليات والقيود", "Receivables & Payables": "الذمم والمدفوعات", "Cash & Banking": "النقد والبنوك", "Reports & Analysis": "التقارير والتحليل المالي", "Close, Tax & Audit": "الإقفال والضرائب والرقابة",
  "Quotations & Orders": "العروض والطلبات", "Customers & Pricing": "العملاء والتسعير", "Delivery & Billing": "التسليم والفوترة", "Collections & Analytics": "التحصيل والتحليلات",
  "Requests & Sourcing": "الطلبات وطرح العروض", "Orders & Commitments": "أوامر الشراء والمتابعة", "Receiving & Invoicing": "الاستلام والفواتير", "Suppliers & Analytics": "الموردون والتحليلات",
  "Items & Warehouses": "الأصناف والمستودعات", "Stock Movements": "حركة المواد", "Counting & Traceability": "الجرد والتتبع", "Control & Reports": "الرقابة والتقارير",
  "Register & Acquisition": "السجل والاقتناء", "Movement & Custody": "الحركة والعهد", "Depreciation & Value": "الإهلاك والقيمة", "Maintenance & Disposal": "الصيانة والاستبعاد",
  "Accounting Setup": "إعداد المحاسبة", "Selling Setup": "إعداد المبيعات", "Purchasing Setup": "إعداد المشتريات", "Inventory Setup": "إعداد المخزون",
  "Department overviews": "لوحات الأقسام", "Decision reports": "تقارير القرار", "My reports": "تقاريري", "Report directories": "أدلة التقارير",
  "Tax & VAT": "الضريبة والقيمة المضافة", "Audit & Activity": "التدقيق والنشاط", "Close & Controls": "الإقفال والضوابط", "Tax configuration": "إعدادات الضرائب",
  "Draft Journal Entries": "قيود يومية مسودة", "Draft Payment Entries": "سندات دفع مسودة", "Payments & Allocation": "سندات القبض والصرف والتخصيص", "Chart of Accounts": "دليل الحسابات",
  "Purchase Invoices": "فواتير المشتريات", "Bank Accounts": "الحسابات البنكية", "Bank Transactions": "الحركات البنكية", "Unreconciled Bank Transactions": "حركات بنكية غير مطابقة",
  "Cost Centers & Dimensions": "مراكز التكلفة والأبعاد", "Period comparison, variance drivers and profitability": "مقارنة الفترات ومحركات الانحراف والربحية",
  "Quotations": "عروض الأسعار", "Draft Quotations": "عروض أسعار مسودة", "Expiring Quotations": "العروض المنتهية أو القريبة من الانتهاء", "Open quotations by validity date": "العروض المفتوحة حسب تاريخ الصلاحية",
  "Late Sales Orders": "أوامر بيع متأخرة", "Orders past their delivery date": "أوامر تجاوزت تاريخ التسليم", "Orders to Deliver and Bill": "أوامر بانتظار التسليم والفوترة",
  "Price Lists": "قوائم الأسعار", "Item Prices": "أسعار الأصناف", "Pricing Rules": "قواعد التسعير",
  "Delivery Notes": "أذون التسليم", "Delivery Notes to Bill": "أذون تسليم بانتظار الفوترة", "Delivered Not Billed": "مُسلَّم غير مفوتر", "Delivered lines still to invoice": "بنود مسلّمة لم تُفوتر بعد", "Order Fulfilment": "تنفيذ أوامر البيع", "Open order lines: promised, delivered and invoiced": "بنود الأوامر المفتوحة: الموعود والمسلّم والمفوتر", "Returns & Credit Notes": "المرتجعات وإشعارات الدائن", "Credit notes and delivery returns with their originals": "إشعارات الدائن ومرتجعات التسليم مع مستنداتها الأصلية", "Quotation Pipeline": "مسار عروض الأسعار", "Expiry, outcomes and lost reasons of quotations": "صلاحية العروض ونتائجها وأسباب فقدها", "Customer 360": "ملف العميل 360", "Supplier 360": "ملف المورد 360", "One supplier's orders, receipts, invoices, payments and reliability": "أوامر المورد واستلاماته وفواتيره ومدفوعاته وموثوقيته", "One customer's documents, receivables and credit": "مستندات العميل وذممه وائتمانه في مكان واحد", "Sales Returns": "مردودات المبيعات",
  "Customer Receipts": "مقبوضات العملاء", "Prioritised queue of invoices to collect": "قائمة مرتبة بالفواتير المطلوب تحصيلها", "Monthly drill-down to native documents": "تحليل شهري حتى المستندات الأصلية",
  "Material Requests": "طلبات المواد", "Pending Material Requests": "طلبات مواد معلّقة", "Draft Material Requests": "طلبات مواد مسودة", "Requests for Quotation": "طلبات عروض الأسعار", "Supplier Quotations": "عروض أسعار الموردين",
  "Supplier Quotes to Decide": "عروض موردين بانتظار القرار", "Unit- and currency-safe comparison": "مقارنة آمنة للوحدات والعملات",
  "Open Purchase Orders": "أوامر الشراء المفتوحة", "Order lines still to receive or bill": "بنود أوامر لم تُستلم أو تُفوتر بعد", "Late Deliveries": "التوريدات المتأخرة", "Order lines past the expected date": "بنود تجاوزت موعد التوريد المتوقع",
  "Orders to Receive and Bill": "أوامر بانتظار الاستلام والفوترة", "Draft Purchase Orders": "أوامر شراء مسودة",
  "Received Not Billed": "مستلم غير مفوتر", "Received lines still to invoice": "بنود مستلمة لم تُفوتر بعد", "Purchase Returns": "مردودات المشتريات", "Supplier Payments": "مدفوعات الموردين", "Supplier Scorecards": "بطاقات تقييم الموردين",
  "Material Receipts": "استلام مواد", "Material Issues": "صرف مواد", "Material Transfers": "تحويلات مخزنية", "All Stock Entries": "كل حركات المخزون", "Draft Stock Entries": "حركات مخزون مسودة",
  "Stock Reconciliations": "الجرد والتسويات", "Batches": "الدفعات", "Serial Numbers": "الأرقام التسلسلية", "Quality Inspections": "فحوصات الجودة",
  "Traceability Exceptions": "استثناءات التتبع", "Batch and serial gaps on posted movements": "نواقص الدفعات والأرقام التسلسلية في الحركات المرحّلة",
  "Stock Valuation": "التقييم المخزني", "Stock Value Reconciliation": "مطابقة قيمة المخزون", "Bin snapshot vs posted ledger and stock GL": "لقطة الأرصدة مقابل الدفتر المرحّل وحسابات المخزون", "Reorder & Low Stock": "إعادة الطلب والنواقص", "Items below their reorder level": "أصناف دون حد إعادة الطلب",
  "Hierarchy, stock held and movements": "الشجرة والمخزون المحتفظ به والحركات", "Item and warehouse quantities": "كميات الأصناف والمستودعات", "Movements, balance and valuation": "الحركات والرصيد والتقييم",
  "Every asset with book value and status": "كل أصل مع قيمته الدفترية وحالته", "Asset Categories": "تصنيفات الأصول", "Draft Assets": "أصول مسودة",
  "Asset Movements": "حركات الأصول", "Locations": "المواقع", "Depreciation Schedules": "جداول الإهلاك", "Asset Value Adjustments": "تسويات قيمة الأصول", "Asset Repairs": "إصلاحات الأصول",
  "Posted, journal-reference and due depreciation": "الإهلاك المرحّل وذو المرجع والمستحق", "Sell or Scrap Asset": "بيع أو استبعاد أصل",
  "Tax and compliance reports": "تقارير الضرائب والامتثال", "Every tax, VAT and audit report in Core": "كل تقارير الضرائب والقيمة المضافة والتدقيق في النواة",
  "CFO decisions": "قرارات المدير المالي", "Sales decisions": "قرارات المبيعات", "Procurement decisions": "قرارات المشتريات", "Inventory decisions": "قرارات المخزون", "Asset decisions": "قرارات الأصول",
  "Favorites, recent and saved views": "المفضلة والأحدث والعروض المحفوظة", "All reports": "كل التقارير",
  "Accounting reports": "تقارير المحاسبة", "Selling reports": "تقارير المبيعات", "Purchasing reports": "تقارير المشتريات", "Inventory reports": "تقارير المخزون", "Fixed asset reports": "تقارير الأصول الثابتة",
  "Exceptions first, then routine work — all from Core records.": "الاستثناءات أولًا ثم الأعمال الروتينية — كلها من سجلات النواة.",
  // All-[Department] directory and account footer
  "Every native document, report and setting of this department, grouped by work area.": "كل المستندات والتقارير والإعدادات الأصلية لهذا القسم، مجمّعة حسب مجال العمل.",
  "Work areas": "مجالات العمل", "Setup and data": "الإعداد والبيانات", "Documents": "المستندات", "Pro screens": "شاشات برو", "Quick actions": "إجراءات سريعة",
  "Runs on DIGIT server": "يعمل على خادم DIGIT", "Runs in preview": "يعمل في المعاينة", "List": "قائمة", "Filtered list": "قائمة مفلترة", "Tree": "شجرة", "resources": "موارد",
  "Expand all": "توسيع الكل", "Collapse all": "طي الكل", "Find in this department": "ابحث في هذا القسم", "All types": "كل الأنواع", "Open the work area menu": "افتح قائمة مجال العمل",
  "Account & preferences": "الحساب والتفضيلات", "Display width": "عرض الصفحة", "Full width": "عرض كامل", "Standard width": "عرض قياسي", "Profile": "الملف الشخصي",
  "Owner": "القسم المالك", "Opened from": "فُتح من", "Department menu": "قائمة القسم", "Primary navigation": "التنقل الرئيسي", "Shared services": "الخدمات المشتركة",
  "Not in this Core (BUILD REQUIRED: ZATCA integration app)": "غير موجود في هذه النواة (يتطلب بناء: تطبيق تكامل زاتكا)", "Not in this Core (BUILD REQUIRED)": "غير موجود في هذه النواة (يتطلب بناء)",
  "Sales Analytics report": "تقرير تحليلات المبيعات",
  "Reports, Intelligence & Controls": "التقارير والتحليل والرقابة", "Suppliers & Intelligence": "الموردون والتحليلات",
  "Show menu": "إظهار القائمة", "Hide menu": "إخفاء القائمة", "Unavailable in this Core": "غير متاح في هذه النواة", "No permitted items": "لا توجد عناصر مسموح بها",
  ...Object.fromEntries(ACC_AREAS.map((x) => [x.label, x.ar])),
};
