import { isServerHosted } from "@/lib/serverHost";
import { wasRenamed } from "./rename";
/**
 * P12 — full synthetic demo dataset for one fictional Saudi company ("Digit Demo Trading Co.", DDT).
 * Deterministic names (DDT-*), insert-if-missing only, never overwrites user records.
 * All amounts SAR. Ledger effects are preview-only (no GL/stock posting runs).
 */
import { adapter } from "./adapter";
import { deletedIndex, deletedKey } from "./deletedDocs";
import { crmSetup, crmExtra, statusHistory, EXTRA_ORGS, LOST_REASONS } from "./seedCrm";
import { runCrmEngines } from "./crmLogic";

export const DEMO_COMPANY = "Digit Demo Trading Co.";
const A = "DDT";
const C = DEMO_COMPANY;
type Rec = [string, string, Record<string, unknown>];
const pad = (n: number, w = 3) => String(n).padStart(w, "0");
// deterministic PRNG
let seed = 20260101;
const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
const pick = <T,>(a: readonly T[]) => a[Math.floor(rnd() * a.length)]!;
const day = (m: number, d: number) => `2026-${pad(m, 2)}-${pad(Math.min(d, 28), 2)}`;
const iso = (date: string) => `${date}T09:00:00.000Z`;
/** Date k days from today (owner rule: records whose state depends on today — pending requests, current-month sales — are dated relative to it). */
const rel = (k: number) => new Date(Date.now() + k * 864e5).toISOString().slice(0, 10);
/** PRO P1-09: a recent date never falls into the previous month, so the current month always holds sales (even on its first days). */
const inThisMonth = (d: string) => { const start = `${rel(0).slice(0, 7)}-01`; return d < start ? start : d; };

const CITIES = ["Riyadh", "Jeddah", "Dammam", "Makkah", "Madinah", "Khobar"] as const;
const WHS = ["Riyadh Main", "Jeddah", "Dammam", "Finished Goods"].map((w) => `${w} - ${A}`);
const CCS = ["Main", "Riyadh", "Jeddah", "Dammam"].map((c) => `${c} - ${A}`);
const GROUPS = ["Electrical", "Hardware", "Services", "Consumables", "Equipment"] as const;
const ITEM_NAMES: [string, number, number][] = [
  // [name, group index, rate]
  ["LED Panel 60x60", 0, 145], ["Circuit Breaker 32A", 0, 85], ["Copper Cable 4mm (100m)", 0, 620], ["Distribution Board 12-way", 0, 940], ["Smart Switch", 0, 120], ["Floodlight 200W", 0, 410], ["Extension Socket", 0, 45], ["Cable Tray 3m", 0, 160],
  ["Steel Bolt M12 (box)", 1, 75], ["Hinge Heavy Duty", 1, 32], ["Door Lock Set", 1, 260], ["Anchor Bolt Kit", 1, 58], ["Steel Bracket", 1, 45], ["Pipe Clamp 2in", 1, 12], ["Hand Drill", 1, 350], ["Tool Box", 1, 190],
  ["Installation Service (hour)", 2, 180], ["Maintenance Contract (month)", 2, 1500], ["Site Survey", 2, 900], ["Electrical Inspection", 2, 1200], ["Training Session", 2, 2500], ["Emergency Call-out", 2, 650], ["Consulting (day)", 2, 3200], ["Annual Support Plan", 2, 9500],
  ["Insulation Tape", 3, 6], ["Cable Ties (pack)", 3, 14], ["Safety Gloves", 3, 22], ["Cleaning Solvent 5L", 3, 68], ["Printer Paper A4 (box)", 3, 95], ["Marker Set", 3, 18], ["Lubricant Spray", 3, 27], ["Face Masks (box)", 3, 35],
  ["Generator 20kVA", 4, 38000], ["Air Compressor", 4, 6200], ["Welding Machine", 4, 4800], ["Scissor Lift", 4, 52000], ["Pallet Jack", 4, 2400], ["Power Analyzer", 4, 7600], ["Ladder 6m", 4, 780], ["Server Rack 42U", 4, 5400],
];
const ITEMS = ITEM_NAMES.map(([n, g, r], i) => ({ code: `${A}-ITM-${pad(i + 1)}`, name: n, group: GROUPS[g]!, rate: r, stock: g !== 2 }));
const CUST_NAMES = ["Al-Rawabi Trading", "Najd Contracting", "Al-Waha Hospitals", "Red Sea Logistics", "Al-Safwa Schools", "Gulf Coast Hotels", "Al-Noor Pharmacies", "Tihama Builders", "Al-Fajr Electronics", "Qassim Farms", "Al-Bayan Real Estate", "Makkah Hospitality", "Al-Madinah Clinics", "Eastern Steel Works", "Al-Khobar Marine", "Al-Yamamah Offices", "Desert Rose Retail", "Al-Hijaz Transport", "Jazan Agro", "Al-Ula Tourism", "Riyadh Data Center", "Al-Masar Engineering", "Tabuk Cement", "Al-Diyar Facilities", "Asir Water Co."];
const SUPP_NAMES = ["Al-Mutlaq Electrical Supply", "Saudi Cables Trading", "Al-Jazeera Hardware", "Eastern Tools Est.", "Al-Rajhi Industrial (Demo)", "Jeddah Equipment House", "Al-Fahad Consumables", "Nawras Import", "Al-Hamra Steel", "Unified Office Supplies", "Al-Shams Lighting", "Dammam Generators", "Al-Qimma Safety", "Peninsula Logistics", "Al-Sahel Packaging"];
const FIRST = ["Abdullah", "Mohammed", "Fahad", "Khalid", "Saad", "Faisal", "Turki", "Nasser", "Omar", "Yousef", "Ali", "Hamad", "Majed", "Sultan", "Bandar", "Noura", "Sara", "Reem", "Lama", "Hessa", "Maha", "Abeer", "Dana", "Hind", "Joud", "Rawan", "Shahad", "Asma", "Latifa", "Mona"];
const LAST = ["Al-Otaibi", "Al-Qahtani", "Al-Ghamdi", "Al-Harbi", "Al-Zahrani", "Al-Shehri", "Al-Dosari", "Al-Mutairi", "Al-Anazi", "Al-Shammari"];
const DEPTS = ["Sales", "Finance", "Warehouse", "HR", "IT", "Operations"];
const DESIG: Record<string, string[]> = { Sales: ["Sales Manager", "Sales Executive"], Finance: ["Finance Manager", "Accountant"], Warehouse: ["Warehouse Supervisor", "Storekeeper"], HR: ["HR Manager", "HR Officer"], IT: ["IT Manager", "Systems Engineer"], Operations: ["Operations Manager", "Technician"] };

function lines(n: number, svc = false) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const it = svc ? pick(ITEMS) : pick(ITEMS.filter((x) => x.stock));
    const qty = 1 + Math.floor(rnd() * (it.rate > 5000 ? 2 : 20));
    const disc = rnd() < 0.3 ? 5 : 0;
    const rate = +(it.rate * (1 - disc / 100)).toFixed(2);
    out.push({ idx: i + 1, item_code: it.code, item_name: it.name, qty, price_list_rate: it.rate, discount_percentage: disc, rate, amount: +(qty * rate).toFixed(2), uom: "Nos", stock_uom: "Nos", conversion_factor: 1, item_group: it.group });
  }
  return out;
}
/** Preview totals with item discount, document discount and VAT 15% (not the ERPNext controller). */
function totals(items: { amount: number; qty: number }[], docDiscPct = 0) {
  const total = +items.reduce((s, x) => s + x.amount, 0).toFixed(2);
  const discount_amount = +(total * docDiscPct / 100).toFixed(2);
  const net = +(total - discount_amount).toFixed(2);
  const tax = +(net * 0.15).toFixed(2);
  return { total, total_qty: items.reduce((s, x) => s + x.qty, 0), additional_discount_percentage: docDiscPct, discount_amount, net_total: net, base_net_total: net, total_taxes_and_charges: tax, grand_total: +(net + tax).toFixed(2), base_grand_total: +(net + tax).toFixed(2), rounded_total: Math.round(net + tax), currency: "SAR", conversion_rate: 1 };
}
const vat = (type: "sales" | "purchase", net: number) => [{ idx: 1, charge_type: "On Net Total", account_head: type === "sales" ? `VAT 15% Output - ${A}` : `VAT 15% Input - ${A}`, description: "VAT 15%", rate: 15, tax_amount: +(net * 0.15).toFixed(2), total: +(net * 1.15).toFixed(2) }];

function masters(): Rec[] {
  const r: Rec[] = [];
  r.push(["Company", C, { company_name: C, abbr: A, default_currency: "SAR", country: "Saudi Arabia", tax_id: "300000000000003", chart_of_accounts: "Standard", enable_perpetual_inventory: 1, stock_received_but_not_billed: `Stock Received But Not Billed - ${A}`, stock_adjustment_account: `Stock Adjustment - ${A}`, default_inventory_account: `Stock In Hand - ${A}`, default_expense_account: `Cost of Goods Sold - ${A}`, exchange_gain_loss_account: `Exchange Gain/Loss - ${A}`, __note: "Fictional company — synthetic data" }]);
  r.push(["Fiscal Year", "2026", { year: "2026", year_start_date: "2026-01-01", year_end_date: "2026-12-31", companies: [{ idx: 1, company: C }] }]);
  const acc = (n: string, parent: string | null, root: string, type = "", group = 0) => r.push(["Account", `${n} - ${A}`, { account_name: n, parent_account: parent ? `${parent} - ${A}` : "", root_type: root, account_type: type, is_group: group, company: C, account_currency: "SAR" }]);
  acc("Application of Funds (Assets)", null, "Asset", "", 1); acc("Current Assets", "Application of Funds (Assets)", "Asset", "", 1); acc("Cash", "Current Assets", "Asset", "Cash"); acc("Al-Demo Bank", "Current Assets", "Asset", "Bank"); acc("Debtors", "Current Assets", "Asset", "Receivable"); acc("Stock In Hand", "Current Assets", "Asset", "Stock"); acc("VAT 15% Input", "Current Assets", "Asset", "Tax"); acc("Fixed Assets", "Application of Funds (Assets)", "Asset", "Fixed Asset"); acc("Accumulated Depreciation", "Application of Funds (Assets)", "Asset", "Accumulated Depreciation");
  acc("Source of Funds (Liabilities)", null, "Liability", "", 1); acc("Creditors", "Source of Funds (Liabilities)", "Liability", "Payable"); acc("VAT 15% Output", "Source of Funds (Liabilities)", "Liability", "Tax"); acc("Salary Payable", "Source of Funds (Liabilities)", "Liability"); acc("Temporary Opening", "Source of Funds (Liabilities)", "Liability", "Temporary"); acc("Stock Received But Not Billed", "Source of Funds (Liabilities)", "Liability", "Stock Received But Not Billed");
  acc("Equity", null, "Equity", "", 1); acc("Capital Stock", "Equity", "Equity"); acc("Opening Balance Equity", "Equity", "Equity"); acc("Retained Earnings", "Equity", "Equity"); r.push(["Account", `USD Bank - ${A}`, { account_name: "USD Bank", parent_account: `Current Assets - ${A}`, root_type: "Asset", account_type: "Bank", is_group: 0, company: C, account_currency: "USD" }]);
  r.push(["Currency Exchange", "2026-01-01-USD-SAR", { date: "2026-01-01", from_currency: "USD", to_currency: "SAR", exchange_rate: 3.75, for_buying: 1, for_selling: 1 }]);
  r.push(["Currency Exchange", "2026-09-30-USD-SAR", { date: "2026-09-30", from_currency: "USD", to_currency: "SAR", exchange_rate: 3.76, for_buying: 1, for_selling: 1 }]);
  r.push(["Journal Entry", `${A}-JV-USD-01`, { title: "USD deposit", voucher_type: "Journal Entry", company: C, posting_date: "2026-01-10", multi_currency: 1, docstatus: 1, creation: "2026-01-10 09:00:00", accounts: [
    { idx: 1, account: `USD Bank - ${A}`, account_currency: "USD", exchange_rate: 3.75, debit_in_account_currency: 10000, credit_in_account_currency: 0, debit: 37500, credit: 0 },
    { idx: 2, account: `Capital Stock - ${A}`, account_currency: "SAR", exchange_rate: 1, debit_in_account_currency: 0, credit_in_account_currency: 37500, debit: 0, credit: 37500 }], total_debit: 37500, total_credit: 37500 }]);
  acc("Income", null, "Income", "", 1); acc("Sales", "Income", "Income", "Income Account"); acc("Service Income", "Income", "Income", "Income Account");
  acc("Expenses", null, "Expense", "", 1); acc("Cost of Goods Sold", "Expenses", "Expense", "Cost of Goods Sold"); acc("Salary", "Expenses", "Expense"); acc("Rent Expense", "Expenses", "Expense"); acc("Utilities Expense", "Expenses", "Expense"); acc("Depreciation", "Expenses", "Expense", "Depreciation"); acc("Round Off", "Expenses", "Expense", "Round Off"); acc("Gain/Loss on Asset Disposal", "Expenses", "Expense"); acc("Exchange Gain/Loss", "Expenses", "Expense"); acc("Stock Adjustment", "Expenses", "Expense", "Stock Adjustment");
  CCS.forEach((c, i) => r.push(["Cost Center", c, { cost_center_name: c.split(" - ")[0], company: C, is_group: i === 0 ? 1 : 0, parent_cost_center: i === 0 ? "" : CCS[0] }]));
  WHS.forEach((w) => r.push(["Warehouse", w, { warehouse_name: w.split(" - ")[0], company: C, is_group: 0 }]));
  GROUPS.forEach((g) => r.push(["Item Group", g, { item_group_name: g, is_group: 0, parent_item_group: "All Item Groups" }]));
  CITIES.forEach((t) => r.push(["Territory", t, { territory_name: t, is_group: 0, parent_territory: "Saudi Arabia" }]));
  ["Corporate", "Government", "Retail"].forEach((g) => r.push(["Customer Group", g, { customer_group_name: g, is_group: 0 }]));
  ["Local Supplier", "Importer"].forEach((g) => r.push(["Supplier Group", g, { supplier_group_name: g, is_group: 0 }]));
  ["Standard Selling", "Standard Buying", "Wholesale"].forEach((p) => r.push(["Price List", p, { price_list_name: p, currency: "SAR", selling: p !== "Standard Buying" ? 1 : 0, buying: p === "Standard Buying" ? 1 : 0, enabled: 1 }]));
  r.push(["Sales Taxes and Charges Template", `KSA VAT 15% - ${A}`, { title: "KSA VAT 15%", company: C, is_default: 1, taxes: vat("sales", 100).map((t) => ({ ...t, tax_amount: 0, total: 0 })) }]);
  r.push(["Purchase Taxes and Charges Template", `KSA VAT 15% Input - ${A}`, { title: "KSA VAT 15% Input", company: C, is_default: 1, taxes: vat("purchase", 100).map((t) => ({ ...t, tax_amount: 0, total: 0 })) }]);
  ITEMS.forEach((it) => {
    r.push(["Item", it.code, { item_code: it.code, item_name: it.name, item_group: it.group, stock_uom: "Nos", is_stock_item: it.stock ? 1 : 0, standard_rate: it.rate, valuation_rate: +(it.rate * 0.7).toFixed(2), description: it.name, disabled: 0 }]);
    r.push(["Item Price", `${it.code}-SELL`, { item_code: it.code, item_name: it.name, price_list: "Standard Selling", price_list_rate: it.rate, currency: "SAR", selling: 1 }]);
    r.push(["Item Price", `${it.code}-BUY`, { item_code: it.code, item_name: it.name, price_list: "Standard Buying", price_list_rate: +(it.rate * 0.7).toFixed(2), currency: "SAR", buying: 1 }]);
    r.push(["Item Price", `${it.code}-WHL`, { item_code: it.code, item_name: it.name, price_list: "Wholesale", price_list_rate: +(it.rate * 0.9).toFixed(2), currency: "SAR", selling: 1 }]);
  });
  ["Ahmed Al-Ghamdi", "Reem Al-Harbi", "Majed Al-Dosari", "Lama Al-Shehri", "Turki Al-Anazi"].forEach((n, i) => r.push(["Sales Person", n, { sales_person_name: n, enabled: 1, is_group: 0, parent_sales_person: "Sales Team", employee: `${A}-EMP-${pad(i + 2)}` }]));
  CUST_NAMES.forEach((n, i) => {
    const city = CITIES[i % CITIES.length]!; const id = `${A}-CUST-${pad(i + 1)}`;
    r.push(["Customer", id, { customer_name: n, customer_type: "Company", customer_group: ["Corporate", "Government", "Retail"][i % 3], territory: city, default_currency: "SAR", default_price_list: i % 5 === 0 ? "Wholesale" : "Standard Selling", tax_id: `3${pad(100000000 + i * 7919, 13)}3`.slice(0, 15) }]);
    r.push(["Address", `${id}-Billing`, { address_title: n, address_type: "Billing", address_line1: `${100 + i} King Fahd Road`, city, country: "Saudi Arabia", pincode: `1${pad(i * 37 % 9999, 4)}`, links: [{ link_doctype: "Customer", link_name: id }] }]);
    r.push(["Contact", `${id}-Contact`, { first_name: FIRST[i % 30], last_name: LAST[i % 10], email_id: `contact${i + 1}@customer${i + 1}.example.test`, mobile_no: `+96650${pad(1000000 + i * 4111, 7)}`, links: [{ link_doctype: "Customer", link_name: id }] }]);
  });
  SUPP_NAMES.forEach((n, i) => r.push(["Supplier", `${A}-SUPP-${pad(i + 1)}`, { supplier_name: n, supplier_group: i % 4 === 0 ? "Importer" : "Local Supplier", supplier_type: "Company", country: "Saudi Arabia", default_currency: "SAR" }]));
  return r;
}

function selling(): Rec[] {
  const r: Rec[] = [];
  for (let k = 1; k <= 20; k++) {
    const m = 1 + ((k - 1) % 10); const ci = (k * 7) % 25; const cust = `${A}-CUST-${pad(ci + 1)}`; const cname = CUST_NAMES[ci]!;
    const d0 = day(m, 2 + k % 20); const base = { company: C, customer: cust, customer_name: cname, territory: CITIES[ci % 6], selling_price_list: "Standard Selling", taxes_and_charges: `KSA VAT 15% - ${A}`, cost_center: CCS[1 + (k % 3)] };
    const items = lines(1 + (k % 4), true); const disc = k % 4 === 0 ? 5 : 0; const t = totals(items, disc); const taxes = vat("sales", t.net_total);
    const lead = `${A}-LEAD-${pad(k)}`, opp = `${A}-OPP-${pad(k)}`, qtn = `${A}-QTN-${pad(k)}`, so = `${A}-SO-${pad(k)}`, dn = `${A}-DN-${pad(k)}`, si = `${A}-SINV-${pad(k)}`, pe = `${A}-PE-R-${pad(k)}`;
    const stage = k <= 14 ? 6 : k <= 16 ? 4 : k <= 18 ? 3 : 2; // how far the chain goes
    r.push(["Lead", lead, { lead_name: `${FIRST[k % 30]} ${LAST[k % 10]}`, company_name: cname, status: stage >= 2 ? "Opportunity" : "Open", source: pick(["Website", "Cold Calling", "Exhibition", "Reference"]), territory: CITIES[ci % 6], company: C, creation: iso(day(m, 1)) }]);
    r.push(["Opportunity", opp, { opportunity_from: "Customer", party_name: cust, customer_name: cname, status: stage >= 3 ? "Converted" : "Open", opportunity_amount: t.grand_total, sales_stage: stage >= 3 ? "Proposal/Price Quote" : "Prospecting", transaction_date: d0, company: C, currency: "SAR", creation: iso(d0) }]);
    if (stage >= 3) r.push(["Quotation", qtn, { ...base, quotation_to: "Customer", party_name: cust, transaction_date: d0, valid_till: day(m + 1 > 12 ? 12 : m + 1, 1), items, ...t, taxes, status: stage >= 4 ? "Ordered" : "Open", docstatus: 1, opportunity: opp, creation: iso(d0) }]);
    if (k === 19) r.push(["Quotation", `${A}-QTN-D01`, { ...base, quotation_to: "Customer", party_name: cust, transaction_date: d0, items, ...t, taxes, status: "Draft", docstatus: 0 }]);
    if (stage >= 4) {
      const cancelled = k === 15;
      r.push(["Sales Order", so, { ...base, transaction_date: d0, delivery_date: day(m, 25), set_warehouse: WHS[0], items: items.map((x) => ({ ...x, warehouse: WHS[0], delivery_date: day(m, 25), prevdoc_docname: qtn })), ...t, taxes, status: cancelled ? "Cancelled" : stage >= 6 ? "Completed" : "To Deliver and Bill", docstatus: cancelled ? 2 : 1, per_delivered: stage >= 5 ? 100 : 0, per_billed: stage >= 6 ? 100 : 0, creation: iso(d0) }]);
    }
    if (stage >= 6) {
      const dDate = day(m, 12 + k % 10); const sDate = day(m, 14 + k % 10);
      r.push(["Delivery Note", dn, { ...base, posting_date: dDate, set_warehouse: WHS[0], items: items.map((x) => ({ ...x, warehouse: WHS[0], against_sales_order: so })), ...t, taxes, status: "Completed", docstatus: 1, per_billed: 100, creation: iso(dDate) }]);
      const kind = k % 5; // 0 paid,1 partly,2 unpaid,3 overdue,4 paid
      const paid = kind === 0 || kind === 4 ? t.grand_total : kind === 1 ? +(t.grand_total / 2).toFixed(2) : 0;
      const due = kind === 3 ? day(Math.max(1, m), 28) : day(Math.min(12, m + 1), 28);
      const status = paid >= t.grand_total ? "Paid" : kind === 3 || (due < "2026-10-10" && paid < t.grand_total) ? "Overdue" : paid > 0 ? "Partly Paid" : "Unpaid";
      r.push(["Sales Invoice", si, { ...base, posting_date: sDate, due_date: due, debit_to: `Debtors - ${A}`, items: items.map((x) => ({ ...x, sales_order: so, delivery_note: dn, income_account: `Sales - ${A}`, cost_center: base.cost_center })), ...t, taxes, outstanding_amount: +(t.grand_total - paid).toFixed(2), status, docstatus: 1, creation: iso(sDate) }]);
      if (paid > 0) r.push(["Payment Entry", pe, { payment_type: "Receive", party_type: "Customer", party: cust, party_name: cname, company: C, posting_date: day(m, 27), paid_from: `Debtors - ${A}`, paid_to: `Al-Demo Bank - ${A}`, paid_amount: paid, received_amount: paid, paid_from_account_currency: "SAR", paid_to_account_currency: "SAR", mode_of_payment: "Bank Transfer", reference_no: `TRF-${pad(k, 5)}`, reference_date: day(m, 27), references: [{ idx: 1, reference_doctype: "Sales Invoice", reference_name: si, total_amount: t.grand_total, outstanding_amount: t.grand_total, allocated_amount: paid }], status: "Submitted", docstatus: 1, creation: iso(day(m, 27)) }]);
    }
  }
  // credit note (return) against SINV-001 and two drafts
  r.push(returnOf(r, "Sales Invoice", `${A}-SINV-001`, `${A}-SINV-RET-001`, day(6, 20), "sales", "Return"));
  for (let j = 1; j <= 2; j++) { const it = lines(2, true); const t = totals(it); r.push(["Sales Invoice", `${A}-SINV-D0${j}`, { company: C, customer: `${A}-CUST-${pad(j + 10)}`, customer_name: CUST_NAMES[j + 9], posting_date: day(10, 5 + j), due_date: day(11, 5), selling_price_list: "Standard Selling", price_list_currency: "SAR", plc_conversion_rate: 1, debit_to: `Debtors - ${A}`, items: it, ...t, taxes: vat("sales", t.net_total), outstanding_amount: t.grand_total, status: "Draft", docstatus: 0 }]); }
  return r;
}

/** Enterprise Visual Round 1 X05: sales of the last days (submitted, unpaid, due in a month), dated relative to today so
 *  the current month is never empty. Generated after every other record, so the shared random sequence is unchanged. */
function recentSales(): Rec[] {
  const r: Rec[] = [];
  for (let j = 1; j <= 4; j++) {
    const ci = (j * 5 + 3) % 25; const cust = `${A}-CUST-${pad(ci + 1)}`; const items = lines(1 + (j % 3), true); const t = totals(items); const taxes = vat("sales", t.net_total); const sDate = inThisMonth(rel(-(1 + j * 2)));
    r.push(["Sales Invoice", `${A}-SINV-N0${j}`, { company: C, customer: cust, customer_name: CUST_NAMES[ci], territory: CITIES[ci % 6], selling_price_list: "Standard Selling", taxes_and_charges: `KSA VAT 15% - ${A}`, cost_center: CCS[1 + (j % 3)],
      posting_date: sDate, due_date: rel(30 - j * 2), debit_to: `Debtors - ${A}`, items: items.map((x) => ({ ...x, income_account: `Sales - ${A}`, cost_center: CCS[1 + (j % 3)] })), ...t, taxes, outstanding_amount: t.grand_total, status: "Unpaid", docstatus: 1, creation: iso(sDate) }]);
  }
  return r;
}

function buying(): Rec[] {
  const r: Rec[] = [];
  for (let k = 1; k <= 10; k++) {
    const m = k; const si = (k * 3) % 15; const sup = `${A}-SUPP-${pad(si + 1)}`; const sname = SUPP_NAMES[si]!;
    const d0 = day(m, 3); const items = lines(1 + (k % 3)).map((x) => ({ ...x, rate: +(x.rate * 0.7).toFixed(2), price_list_rate: +(x.price_list_rate * 0.7).toFixed(2), amount: +(x.qty * x.rate * 0.7).toFixed(2) }));
    const t = totals(items); const taxes = vat("purchase", t.net_total);
    const mr = `${A}-MR-${pad(k)}`, rfq = `${A}-RFQ-${pad(k)}`, sq = `${A}-SQ-${pad(k)}`, po = `${A}-PO-${pad(k)}`, pr = `${A}-PR-${pad(k)}`, pi = `${A}-PINV-${pad(k)}`, pe = `${A}-PE-P-${pad(k)}`;
    const base = { company: C, supplier: sup, supplier_name: sname, buying_price_list: "Standard Buying", taxes_and_charges: `KSA VAT 15% Input - ${A}` };
    r.push(["Material Request", mr, { material_request_type: "Purchase", transaction_date: d0, schedule_date: day(m, 15), company: C, items: items.map((x) => ({ ...x, warehouse: WHS[0], schedule_date: day(m, 15) })), status: k <= 8 ? "Ordered" : "Pending", docstatus: 1, per_ordered: k <= 8 ? 100 : 0, creation: iso(d0) }]);
    if (k <= 8) {
      r.push(["Request for Quotation", rfq, { transaction_date: day(m, 4), company: C, suppliers: [{ idx: 1, supplier: sup, supplier_name: sname }], items: items.map((x) => ({ ...x, warehouse: WHS[0], material_request: mr })), status: "Submitted", docstatus: 1, message_for_supplier: "Please quote your best price.", creation: iso(day(m, 4)) }]);
      r.push(["Supplier Quotation", sq, { ...base, transaction_date: day(m, 6), items: items.map((x, i) => ({ ...x, request_for_quotation: rfq, lead_time_days: 5 + ((k * 3 + i) % 9), expected_delivery_date: day(m, 6 + 5 + ((k * 3 + i) % 9)) })), ...t, taxes, status: "Submitted", docstatus: 1, creation: iso(day(m, 6)) }]);
      r.push(["Purchase Order", po, { ...base, transaction_date: day(m, 8), schedule_date: day(m, 18), set_warehouse: WHS[0], items: items.map((x) => ({ ...x, warehouse: WHS[0], schedule_date: day(m, 18), material_request: mr, supplier_quotation: sq })), ...t, taxes, status: k <= 6 ? "Completed" : "To Receive and Bill", docstatus: 1, per_received: k <= 6 ? 100 : k === 7 ? 50 : 0, per_billed: k <= 6 ? 100 : 0, creation: iso(day(m, 8)) }]);
    }
    if (k <= 7) {
      const partial = k === 7; const recv = partial ? items.map((x) => ({ ...x, qty: Math.max(1, Math.floor(x.qty / 2)), amount: +(Math.max(1, Math.floor(x.qty / 2)) * x.rate).toFixed(2) })) : items; const rt = totals(recv);
      r.push(["Purchase Receipt", pr, { ...base, posting_date: day(m, 16), set_warehouse: WHS[0], items: recv.map((x) => ({ ...x, warehouse: WHS[0], purchase_order: po })), ...rt, taxes: vat("purchase", rt.net_total), status: partial ? "To Bill" : "Completed", docstatus: 1, creation: iso(day(m, 16)) }]);
    }
    if (k <= 6) {
      const kind = k % 3; const paid = kind === 0 ? t.grand_total : 0; const due = kind === 2 ? day(m, 28) : day(Math.min(12, m + 2), 10);
      r.push(["Purchase Invoice", pi, { ...base, posting_date: day(m, 18), bill_no: `SUP-INV-${pad(k * 13, 5)}`, due_date: due, credit_to: `Creditors - ${A}`, items: items.map((x) => ({ ...x, purchase_order: po, purchase_receipt: pr, expense_account: `Stock In Hand - ${A}` })), ...t, taxes, outstanding_amount: t.grand_total - paid, status: paid ? "Paid" : due < "2026-10-10" ? "Overdue" : "Unpaid", docstatus: 1, creation: iso(day(m, 18)) }]);
      if (paid) r.push(["Payment Entry", pe, { payment_type: "Pay", party_type: "Supplier", party: sup, party_name: sname, company: C, posting_date: day(m, 26), paid_from: `Al-Demo Bank - ${A}`, paid_to: `Creditors - ${A}`, paid_amount: paid, received_amount: paid, mode_of_payment: "Bank Transfer", reference_no: `OUT-${pad(k, 5)}`, reference_date: day(m, 26), references: [{ idx: 1, reference_doctype: "Purchase Invoice", reference_name: pi, total_amount: t.grand_total, outstanding_amount: t.grand_total, allocated_amount: paid }], status: "Submitted", docstatus: 1, creation: iso(day(m, 26)) }]);
    }
  }
  r.push(returnOf(r, "Purchase Invoice", `${A}-PINV-001`, `${A}-PINV-RET-001`, day(5, 22), "purchase", "Debit Note Issued"));
  const dr = lines(2); const drt = totals(dr);
  r.push(["Purchase Order", `${A}-PO-D01`, { company: C, supplier: `${A}-SUPP-010`, supplier_name: SUPP_NAMES[9], transaction_date: day(10, 8), schedule_date: day(10, 25), items: dr, ...drt, taxes: vat("purchase", drt.net_total), status: "Draft", docstatus: 0 }]);
  return r;
}

function stockAccountsEtc(): Rec[] {
  const r: Rec[] = [];
  // Bins: stock on hand per item & warehouse (consistent with receipts minus deliveries, preview-level)
  ITEMS.filter((i) => i.stock).forEach((it, i) => WHS.slice(0, 3).forEach((w, j) => {
    const qty = 5 + ((i * 7 + j * 11) % 60); const val = +(it.rate * 0.7).toFixed(2);
    r.push(["Bin", `${it.code}-${j}`, { item_code: it.code, warehouse: w, actual_qty: qty, reserved_qty: j === 0 ? 2 : 0, ordered_qty: 0, projected_qty: qty, valuation_rate: val, stock_value: +(qty * val).toFixed(2), stock_uom: "Nos" }]);
  }));
  const types = ["Material Receipt", "Material Issue", "Material Transfer"] as const;
  for (let k = 1; k <= 9; k++) {
    const it = ITEMS.filter((i) => i.stock)[k * 3]!; const typ = types[(k - 1) % 3]!; const qty = 5 + k; const rate = +(it.rate * 0.7).toFixed(2);
    const sw = typ === "Material Receipt" ? "" : WHS[0]; const tw = typ === "Material Issue" ? "" : typ === "Material Transfer" ? WHS[1 + (k % 2)] : WHS[0];
    r.push(["Stock Entry", `${A}-STE-${pad(k)}`, { stock_entry_type: typ, purpose: typ, company: C, posting_date: day(k, 10), items: [{ idx: 1, item_code: it.code, item_name: it.name, qty, basic_rate: rate, amount: qty * rate, s_warehouse: sw, t_warehouse: tw, uom: "Nos", conversion_factor: 1 }], total_outgoing_value: sw ? qty * rate : 0, total_incoming_value: tw ? qty * rate : 0, docstatus: 1, creation: iso(day(k, 10)) }]);
    // Stock Ledger Entries for this voucher are written by the posting engine (src/lib/posting.ts postAll)
  }
  // DIGIT Pro review fixtures (imported with the app, insert-if-missing like every demo record): two draft transfers
  // (docstatus 0, never posted) — one within stock, one short — plus a draft receipt (target only) and a draft issue
  // (source only), so each Stock Entry purpose and the draft-only stock readiness checks are reviewable.
  { const st = ITEMS.filter((i) => i.stock); [[st[1]!, 3], [st[2]!, 9999]].forEach(([it0, qty0], n) => { const it = it0 as typeof st[number]; const qty = qty0 as number; const rate = +(it.rate * 0.7).toFixed(2);
    r.push(["Stock Entry", `${A}-STE-DRAFT-${n + 1}`, { stock_entry_type: "Material Transfer", purpose: "Material Transfer", company: C, posting_date: day(9, 20), items: [{ idx: 1, item_code: it.code, item_name: it.name, qty, basic_rate: rate, amount: +(qty * rate).toFixed(2), s_warehouse: WHS[0], t_warehouse: WHS[1], uom: "Nos", conversion_factor: 1 }], docstatus: 0, creation: iso(day(9, 20)) }]); });
    const rc = st[3]!, is = st[1]!;
    r.push(["Stock Entry", `${A}-STE-DRAFT-RCPT`, { stock_entry_type: "Material Receipt", purpose: "Material Receipt", company: C, posting_date: day(9, 21), to_warehouse: WHS[1], items: [{ idx: 1, item_code: rc.code, item_name: rc.name, qty: 12, basic_rate: rc.rate, amount: +(12 * rc.rate).toFixed(2), t_warehouse: WHS[1], uom: "Nos", conversion_factor: 1 }], docstatus: 0, creation: iso(day(9, 21)) }]);
    r.push(["Stock Entry", `${A}-STE-DRAFT-ISSUE`, { stock_entry_type: "Material Issue", purpose: "Material Issue", company: C, posting_date: day(9, 21), from_warehouse: WHS[0], items: [{ idx: 1, item_code: is.code, item_name: is.name, qty: 2, basic_rate: is.rate, amount: +(2 * is.rate).toFixed(2), s_warehouse: WHS[0], uom: "Nos", conversion_factor: 1 }], docstatus: 0, creation: iso(day(9, 21)) }]); }
  const je = (n: number, date: string, title: string, accts: [string, number, number][], type = "Journal Entry") => r.push(["Journal Entry", `${A}-JV-${pad(n)}`, { title, voucher_type: type, company: C, posting_date: date, accounts: accts.map(([a, d, c], i) => ({ idx: i + 1, account: `${a} - ${A}`, debit_in_account_currency: d, credit_in_account_currency: c, debit: d, credit: c, cost_center: CCS[0] })), total_debit: accts.reduce((s, x) => s + x[1], 0), total_credit: accts.reduce((s, x) => s + x[2], 0), docstatus: 1, creation: iso(date) }]);
  // Opening stock as a Material Receipt (is_opening) against Opening Balance Equity, so perpetual inventory starts from real stock
  const open = ITEMS.filter((i) => i.stock).flatMap((it, i) => WHS.slice(0, 3).map((w, j) => { const qty = 5 + ((i * 7 + j * 11) % 60) + (j === 0 ? 80 : 0); const rate = +(it.rate * 0.7).toFixed(2); return { item_code: it.code, item_name: it.name, qty, basic_rate: rate, valuation_rate: rate, amount: +(qty * rate).toFixed(2), t_warehouse: w, uom: "Nos", conversion_factor: 1, expense_account: `Opening Balance Equity - ${A}` }; }));
  r.push(["Stock Entry", `${A}-STE-OPENING`, { stock_entry_type: "Material Receipt", purpose: "Material Receipt", is_opening: "Yes", company: C, posting_date: "2026-01-01", posting_time: "00:00:00", items: open.map((x, i) => ({ idx: i + 1, ...x })), total_incoming_value: +open.reduce((t, x) => t + x.amount, 0).toFixed(2), docstatus: 1, creation: iso("2026-01-01") }]);
  je(1, "2026-01-01", "Opening balances", [["Al-Demo Bank", 850000, 0], ["Opening Balance Equity", 0, 850000]], "Opening Entry");
  for (let m = 1; m <= 9; m++) je(1 + m, day(m, 28), `Salary accrual ${day(m, 1).slice(0, 7)}`, [["Salary", 312000, 0], ["Salary Payable", 0, 312000]]);
  [["Rent Expense", 45000], ["Utilities Expense", 8200], ["Rent Expense", 45000], ["Utilities Expense", 7900]].forEach(([a, v], i) => je(11 + i, day(3 * i + 1, 5), `${a} payment`, [[a as string, v as number, 0], ["Al-Demo Bank", 0, v as number]], "Bank Entry"));
  r.push(["Bank", "Al-Demo Bank", { bank_name: "Al-Demo Bank" }]);
  r.push(["Bank Account", `Operating - Al-Demo Bank`, { account_name: "Operating", bank: "Al-Demo Bank", account: `Al-Demo Bank - ${A}`, company: C, iban: "SA0380000000608010167519", is_company_account: 1, is_default: 1 }]);
  r.push(["Bank Account", `Payroll - Al-Demo Bank`, { account_name: "Payroll", bank: "Al-Demo Bank", account: `Al-Demo Bank - ${A}`, company: C, iban: "SA4420000001234567891234", is_company_account: 1 }]);
  for (let k = 1; k <= 8; k++) r.push(["Bank Transaction", `${A}-BT-${pad(k)}`, { date: day(k, 27), bank_account: "Operating - Al-Demo Bank", company: C, deposit: k % 2 ? 15000 + k * 1000 : 0, withdrawal: k % 2 ? 0 : 9000 + k * 500, currency: "SAR", description: k % 2 ? `Customer transfer TRF-${pad(k, 5)}` : `Supplier payment OUT-${pad(k, 5)}`, status: k <= 5 ? "Reconciled" : "Unreconciled", docstatus: 1 }]);
  // Assets
  ["Vehicles", "IT Equipment", "Machinery", "Furniture"].forEach((c) => r.push(["Asset Category", c, { asset_category_name: c }]));
  const assets: [string, string, number, number][] = [["Delivery Van", "Vehicles", 145000, 60], ["Forklift", "Machinery", 98000, 96], ["Server Rack", "IT Equipment", 42000, 36], ["Office Furniture Set", "Furniture", 28000, 60], ["Generator 20kVA", "Machinery", 38000, 84], ["Laptops (10)", "IT Equipment", 55000, 36]];
  assets.forEach(([n, cat, cost, months], i) => {
    const id = `${A}-AST-${pad(i + 1)}`; const per = +(cost / months).toFixed(2); const start = day(1 + i, 1);
    r.push(["Asset", id, { asset_name: n, item_code: ITEMS[32 + (i % 8)]!.code, asset_category: cat, company: C, location: "Riyadh", purchase_date: start, available_for_use_date: start, gross_purchase_amount: cost, calculate_depreciation: 1, value_after_depreciation: +(cost - per * (10 - i)).toFixed(2), status: "Partially Depreciated", docstatus: 1, cost_center: CCS[1] }]);
    r.push(["Asset Depreciation Schedule", `${id}-DS`, { asset: id, asset_name: n, company: C, depreciation_method: "Straight Line", total_number_of_depreciations: months, frequency_of_depreciation: 1, depreciation_schedule: Array.from({ length: Math.min(12, months) }, (_, j) => ({ idx: j + 1, schedule_date: day(Math.min(12, 1 + i + j), 28), depreciation_amount: per, accumulated_depreciation_amount: +(per * (j + 1)).toFixed(2), journal_entry: 1 + i + j <= 10 ? `preview` : "" })), docstatus: 1 }]);
  });
  {
    // DIGIT Pro review fixture: a separate asset whose depreciation for two past months is due and not yet booked
    // (Pro Depreciation Review "due" rows). Insert-if-missing; no ledger rows are written for it.
    const id = `${A}-AST-007`, cost = 24000, per = 1000, start = day(6, 1);
    r.push(["Asset", id, { asset_name: "Printing Machine", item_code: ITEMS[32]!.code, asset_category: "Machinery", company: C, location: "Riyadh", purchase_date: start, available_for_use_date: start, gross_purchase_amount: cost, calculate_depreciation: 1, value_after_depreciation: cost - per * 2, status: "Partially Depreciated", docstatus: 1, cost_center: CCS[1] }]);
    r.push(["Asset Depreciation Schedule", `${id}-DS`, { asset: id, asset_name: "Printing Machine", company: C, depreciation_method: "Straight Line", total_number_of_depreciations: 24, frequency_of_depreciation: 1, depreciation_schedule: Array.from({ length: 6 }, (_, j) => ({ idx: j + 1, schedule_date: day(6 + j, 28), depreciation_amount: per, accumulated_depreciation_amount: per * (j + 1), journal_entry: j < 2 ? "preview" : "" })), docstatus: 1 }]);
  }
  // Projects, tasks, timesheets, issues
  ["Riyadh Data Center Fit-out", "Jeddah Hotel Lighting Upgrade", "Dammam Warehouse Electrical", "Annual Maintenance — Najd Contracting"].forEach((p, i) => {
    const id = `${A}-PROJ-${pad(i + 1)}`;
    r.push(["Project", id, { project_name: p, status: i === 3 ? "Completed" : "Open", company: C, customer: `${A}-CUST-${pad(i * 5 + 1)}`, expected_start_date: day(2 + i * 2, 1), expected_end_date: day(Math.min(12, 6 + i * 2), 28), percent_complete: [65, 40, 15, 100][i], estimated_costing: [450000, 180000, 260000, 60000][i], cost_center: CCS[1 + (i % 3)] }]);
    ["Survey & design", "Procurement", "Installation", "Testing & handover"].forEach((t, j) => r.push(["Task", `${id}-T${j + 1}`, { subject: `${t} — ${p}`, project: id, status: i === 3 || j < [3, 2, 1, 4][i]! ? "Completed" : j === [3, 2, 1, 4][i] ? "Working" : "Open", priority: ["Medium", "High", "Medium", "Low"][j], exp_start_date: day(2 + i * 2 + j > 12 ? 12 : 2 + i * 2 + j, 1), company: C }]));
    for (let j = 1; j <= 2; j++) r.push(["Timesheet", `${id}-TS${j}`, { employee: `${A}-EMP-${pad(20 + i)}`, employee_name: `${FIRST[19 + i]} ${LAST[(19 + i) % 10]}`, company: C, parent_project: id, time_logs: [{ idx: 1, activity_type: "Execution", hours: 6 + j, project: id, task: `${id}-T${j + 1}`, from_time: `${day(3 + i * 2, j * 5)} 08:00:00`, billing_hours: 6 + j, billing_rate: 180 }], total_hours: 6 + j, total_billable_amount: (6 + j) * 180, status: "Submitted", docstatus: 1, start_date: day(3 + i * 2, j * 5) }]);
  });
  const ist = ["Open", "Replied", "On Hold", "Resolved", "Closed"];
  for (let k = 1; k <= 10; k++) r.push(["Issue", `${A}-ISS-${pad(k)}`, { subject: ["Breaker tripping", "Invoice copy request", "Late delivery", "Panel noise", "Warranty claim", "Wrong item delivered", "Generator service", "Access card issue", "Quotation revision", "Installation follow-up"][k - 1], customer: `${A}-CUST-${pad(k * 2)}`, status: ist[k % 5], priority: ["Low", "Medium", "High"][k % 3], opening_date: day(k, 8), raised_by: `contact${k * 2}@customer${k * 2}.example.test`, company: C, creation: iso(day(k, 8)) }]);
  // POS
  r.push(["POS Profile", `Riyadh Showroom - ${A}`, { company: C, warehouse: WHS[0], selling_price_list: "Standard Selling", currency: "SAR", customer: `${A}-CUST-017`, taxes_and_charges: `KSA VAT 15% - ${A}`, payments: [{ idx: 1, mode_of_payment: "Cash", default: 1 }, { idx: 2, mode_of_payment: "Mada Card" }], write_off_account: `Sales - ${A}`, write_off_cost_center: CCS[1] }]);
  for (let k = 1; k <= 15; k++) { const it = lines(1 + (k % 3)); const t = totals(it); r.push(["POS Invoice", `${A}-POS-${pad(k)}`, { company: C, pos_profile: `Riyadh Showroom - ${A}`, customer: `${A}-CUST-017`, customer_name: CUST_NAMES[16], posting_date: day(1 + (k % 10), 3 + k), items: it, ...t, taxes: vat("sales", t.net_total), paid_amount: t.grand_total, outstanding_amount: 0, payments: [{ idx: 1, mode_of_payment: k % 2 ? "Cash" : "Mada Card", amount: t.grand_total }], status: "Paid", docstatus: 1, creation: iso(day(1 + (k % 10), 3 + k)) }]); }
  return r;
}

function hr(): Rec[] {
  const r: Rec[] = [];
  DEPTS.forEach((d) => r.push(["Department", `${d} - ${A}`, { department_name: d, company: C, is_group: 0 }]));
  Object.values(DESIG).flat().forEach((d) => r.push(["Designation", d, { designation_name: d }]));
  const holidays = [["2026-02-22", "Founding Day (synthetic sample date)"], ["2026-03-20", "Eid al-Fitr (synthetic sample date)"], ["2026-03-21", "Eid al-Fitr (synthetic sample date)"], ["2026-03-22", "Eid al-Fitr (synthetic sample date)"], ["2026-05-26", "Arafat Day (synthetic sample date)"], ["2026-05-27", "Eid al-Adha (synthetic sample date)"], ["2026-05-28", "Eid al-Adha (synthetic sample date)"], ["2026-09-23", "Saudi National Day (synthetic sample date)"]];
  r.push(["Holiday List", `KSA 2026 - ${A}`, { holiday_list_name: `KSA 2026 - ${A}`, from_date: "2026-01-01", to_date: "2026-12-31", weekly_off: "Friday", holidays: holidays.map(([d, n], i) => ({ idx: i + 1, holiday_date: d, description: n })), total_holidays: holidays.length }]);
  const emps: { id: string; name: string; dept: string }[] = [];
  for (let i = 1; i <= 30; i++) {
    const dept = DEPTS[(i - 1) % 6]!; const mgr = i <= 6; const id = `${A}-EMP-${pad(i)}`; const fn = FIRST[i - 1]!; const ln = LAST[(i * 3) % 10]!;
    const name = `${fn} ${ln}`; emps.push({ id, name, dept });
    r.push(["Employee", id, { first_name: fn, last_name: ln, employee_name: name, company: C, status: "Active", gender: i > 15 ? "Female" : "Male", date_of_birth: `19${80 + (i % 18)}-0${1 + (i % 9)}-1${i % 9}`, date_of_joining: `20${18 + (i % 8)}-0${1 + (i % 9)}-01`, department: `${dept} - ${A}`, designation: DESIG[dept]![mgr ? 0 : 1], reports_to: mgr ? (i === 1 ? "" : `${A}-EMP-001`) : `${A}-EMP-${pad(((i - 1) % 6) + 1)}`, holiday_list: `KSA 2026 - ${A}`, default_shift: i % 5 === 0 ? "Night Shift" : "Day Shift", company_email: `${fn.toLowerCase()}.${i}@ddt.example.test`, cell_number: `+96655${pad(2000000 + i * 3331, 7)}`, iban: `SA${pad(10 + i, 2)}8000000060801016${pad(i, 4)}`, ctc: 8000 + i * 650 }]);
  }
  // shifts for roster month (October 2026)
  emps.forEach((e, i) => r.push(["Shift Assignment", `${A}-SAS-${pad(i + 1)}`, { employee: e.id, employee_name: e.name, shift_type: (i + 1) % 5 === 0 ? "Night Shift" : "Day Shift", start_date: "2026-10-01", end_date: "2026-10-31", status: "Active", docstatus: 1, company: C, department: `${e.dept} - ${A}` }]));
  // attendance + checkins Aug–Sep 2026 (working days Sun–Thu)
  let n = 0;
  for (const m of [8, 9]) for (let d = 1; d <= 30; d++) {
    const date = new Date(Date.UTC(2026, m - 1, d)); if (date.getUTCMonth() !== m - 1) continue; const wd = date.getUTCDay(); if (wd === 5 || wd === 6) continue;
    const ds = date.toISOString().slice(0, 10);
    emps.forEach((e, i) => {
      const x = (i * 31 + d * 7 + m) % 40; const status = x === 0 ? "Absent" : x === 1 ? "On Leave" : x === 2 ? "Half Day" : x === 3 ? "Work From Home" : "Present";
      n++; r.push(["Attendance", `${A}-ATT-${pad(n, 5)}`, { employee: e.id, employee_name: e.name, attendance_date: ds, status, company: C, department: `${e.dept} - ${A}`, shift: (i + 1) % 5 === 0 ? "Night Shift" : "Day Shift", late_entry: x === 4 ? 1 : 0, docstatus: 1 }]);
      if (i < 6 && status === "Present") {
        r.push(["Employee Checkin", `${A}-CHK-${pad(n, 5)}-I`, { employee: e.id, employee_name: e.name, log_type: "IN", time: `${ds} 08:${pad(40 + (x % 20), 2)}:00`, device_id: "PWA-SIM", shift: "Day Shift" }]);
        r.push(["Employee Checkin", `${A}-CHK-${pad(n, 5)}-O`, { employee: e.id, employee_name: e.name, log_type: "OUT", time: `${ds} 17:${pad(5 + (x % 50), 2)}:00`, device_id: "PWA-SIM", shift: "Day Shift" }]);
      }
    });
  }
  ["Annual Leave", "Sick Leave", "Casual Leave", "Hajj Leave", "Leave Without Pay"].forEach((t, i) => r.push(["Leave Type", t, { leave_type_name: t, max_leaves_allowed: [30, 30, 5, 10, 0][i], is_carry_forward: i === 0 ? 1 : 0, is_lwp: i === 4 ? 1 : 0 }]));
  emps.forEach((e, i) => ["Annual Leave", "Sick Leave"].forEach((t, j) => r.push(["Leave Allocation", `${A}-LAL-${pad(i + 1)}-${j}`, { employee: e.id, employee_name: e.name, leave_type: t, from_date: "2026-01-01", to_date: "2026-12-31", new_leaves_allocated: j ? 30 : 21 + (i % 10), total_leaves_allocated: j ? 30 : 21 + (i % 10), company: C, docstatus: 1 }])));
  const lst = ["Open", "Approved", "Rejected", "Cancelled", "Approved", "Open"];
  for (let k = 1; k <= 18; k++) { const e = emps[(k * 7) % 30]!; const m = 1 + (k % 10); const len = 1 + (k % 5); const st = lst[k % 6]!;
    // a pending request is recent (sent 2–5 days ago, leave within two weeks); decided requests keep their sample month
    const open = st === "Open"; const from = open ? rel(4 + (k % 9)) : day(m, 5 + k % 10); const to = open ? rel(4 + (k % 9) + len - 1) : day(m, 5 + (k % 10) + len - 1); const asked = open ? rel(-(2 + (k % 4))) : day(m, 1);
    r.push(["Leave Application", `${A}-LAP-${pad(k)}`, { employee: e.id, employee_name: e.name, leave_type: ["Annual Leave", "Sick Leave", "Casual Leave"][k % 3], from_date: from, to_date: to, total_leave_days: len, status: st, docstatus: st === "Open" ? 0 : st === "Cancelled" ? 2 : 1, leave_approver: "hr.manager@ddt.example.test", description: "Synthetic leave request", company: C, posting_date: asked, creation: iso(asked) }]); }
  ["Travel", "Accommodation", "Meals", "Fuel", "Telecom"].forEach((t) => r.push(["Expense Claim Type", t, { expense_type: t }]));
  for (let k = 1; k <= 12; k++) { const e = emps[(k * 5) % 30]!; const amt = 150 + k * 95; const ap = ["Draft", "Approved", "Rejected", "Approved"][k % 4]!; r.push(["Expense Claim", `${A}-EXC-${pad(k)}`, { employee: e.id, employee_name: e.name, posting_date: day(1 + (k % 10), 12), approval_status: ap, status: ap === "Rejected" ? "Rejected" : ap === "Approved" ? (k % 3 ? "Paid" : "Unpaid") : "Draft", docstatus: ap === "Draft" ? 0 : 1, currency: "SAR", expenses: [{ idx: 1, expense_type: ["Travel", "Accommodation", "Meals", "Fuel", "Telecom"][k % 5], description: "Synthetic expense", amount: amt, sanctioned_amount: ap === "Approved" ? amt : 0, expense_date: day(1 + (k % 10), 10) }], total_claimed_amount: amt, total_sanctioned_amount: ap === "Approved" ? amt : 0, grand_total: ap === "Approved" ? amt : 0, company: C, expense_approver: "finance.manager@ddt.example.test" }]); }
  for (let k = 1; k <= 6; k++) { const e = emps[k * 4]!; const amt = 1000 * k; r.push(["Employee Advance", `${A}-EAD-${pad(k)}`, { employee: e.id, employee_name: e.name, posting_date: day(k + 2, 4), currency: "SAR", purpose: ["Travel advance", "Relocation", "Training fees", "Medical", "Housing deposit", "Equipment"][k - 1], advance_amount: amt, paid_amount: k % 3 ? amt : 0, claimed_amount: k === 1 ? amt : 0, pending_amount: k % 3 ? 0 : amt, status: k === 1 ? "Claimed" : k % 3 ? "Paid" : "Unpaid", docstatus: 1, company: C }]); }
  for (let k = 1; k <= 5; k++) { const e = emps[k * 5 - 1]!; r.push(["Attendance Request", `${A}-ATR-${pad(k)}`, { employee: e.id, employee_name: e.name, from_date: day(9, k * 3), to_date: day(9, k * 3 + 1), reason: ["Work From Home", "On Duty"][k % 2], explanation: "Synthetic request", docstatus: k % 2, company: C }]); }
  for (let k = 1; k <= 5; k++) { const e = emps[k * 6 - 2]!; r.push(["Shift Request", `${A}-SHR-${pad(k)}`, { employee: e.id, employee_name: e.name, shift_type: k % 2 ? "Night Shift" : "Day Shift", from_date: day(10, 10 + k), to_date: day(10, 14 + k), status: ["Draft", "Approved", "Rejected"][k % 3], docstatus: k % 3 === 0 ? 0 : 1, company: C, approver: "hr.manager@ddt.example.test" }]); }
  // payroll
  const comps: [string, string, string][] = [["Basic Salary", "Earning", "BS"], ["Housing Allowance", "Earning", "HA"], ["Transport Allowance", "Earning", "TA"], ["GOSI Employee Share", "Deduction", "GOSI"], ["Advance Recovery", "Deduction", "ADV"]];
  comps.forEach(([n, t, ab]) => r.push(["Salary Component", n, { salary_component: n, salary_component_abbr: ab, type: t, depends_on_payment_days: 1 }]));
  r.push(["Salary Structure", `DDT Monthly 2026`, { name: "DDT Monthly 2026", company: C, payroll_frequency: "Monthly", currency: "SAR", is_active: "Yes", docstatus: 1, earnings: [{ idx: 1, salary_component: "Basic Salary", abbr: "BS", formula: "base * 0.6", amount_based_on_formula: 1 }, { idx: 2, salary_component: "Housing Allowance", abbr: "HA", formula: "base * 0.25", amount_based_on_formula: 1 }, { idx: 3, salary_component: "Transport Allowance", abbr: "TA", formula: "base * 0.15", amount_based_on_formula: 1 }], deductions: [{ idx: 1, salary_component: "GOSI Employee Share", abbr: "GOSI", formula: "(BS + HA) * 0.0975", amount_based_on_formula: 1 }] }]);
  emps.forEach((e, i) => r.push(["Salary Structure Assignment", `${A}-SSA-${pad(i + 1)}`, { employee: e.id, employee_name: e.name, salary_structure: "DDT Monthly 2026", from_date: "2026-01-01", base: 8000 + (i + 1) * 650, currency: "SAR", company: C, docstatus: 1 }]));
  for (const m of [8, 9]) {
    const pe = `${A}-PAY-2026-${pad(m, 2)}`; const end = m === 8 ? "2026-08-31" : "2026-09-30"; let gross = 0, net = 0;
    emps.forEach((e, i) => {
      const base = 8000 + (i + 1) * 650; const bs = base * 0.6, ha = base * 0.25, ta = base * 0.15; const gosi = +((bs + ha) * 0.0975).toFixed(2); const g = bs + ha + ta; const nt = +(g - gosi).toFixed(2); gross += g; net += nt;
      r.push(["Salary Slip", `${A}-SAL-2026-${pad(m, 2)}-${pad(i + 1)}`, { employee: e.id, employee_name: e.name, department: `${e.dept} - ${A}`, posting_date: end, start_date: `2026-${pad(m, 2)}-01`, end_date: end, currency: "SAR", payroll_frequency: "Monthly", salary_structure: "DDT Monthly 2026", payroll_entry: pe, status: "Submitted", docstatus: 1, earnings: [{ idx: 1, salary_component: "Basic Salary", abbr: "BS", amount: bs }, { idx: 2, salary_component: "Housing Allowance", abbr: "HA", amount: ha }, { idx: 3, salary_component: "Transport Allowance", abbr: "TA", amount: ta }], deductions: [{ idx: 1, salary_component: "GOSI Employee Share", abbr: "GOSI", amount: gosi }], gross_pay: g, base_gross_pay: g, total_deduction: gosi, net_pay: nt, base_net_pay: nt, rounded_total: Math.round(nt), payment_days: 22, total_working_days: 22, company: C, creation: iso(end) }]);
    });
    r.push(["Payroll Entry", pe, { company: C, posting_date: end, payroll_frequency: "Monthly", start_date: `2026-${pad(m, 2)}-01`, end_date: end, currency: "SAR", payroll_payable_account: `Salary Payable - ${A}`, cost_center: CCS[0], number_of_employees: emps.length, employees: emps.map((e, i) => ({ idx: i + 1, employee: e.id, employee_name: e.name, department: `${e.dept} - ${A}` })), status: "Submitted", docstatus: 1, salary_slips_created: 1, salary_slips_submitted: 1, __preview_gross: gross, __preview_net: net }]);
  }
  return r;
}

function crm(): Rec[] {
  const r: Rec[] = [];
  const LS = ["New", "Contacted", "Nurture", "Qualified", "Unqualified", "Junk"]; const DS = ["Qualification", "Demo/Making", "Proposal/Quotation", "Negotiation", "Ready to Close", "Won", "Lost"];
  const SRC = ["Website", "Cold Calling", "Exhibition", "Reference", "Advertisement", "Campaign"];
  [...CUST_NAMES.slice(0, 15), ...EXTRA_ORGS].forEach((o, i) => r.push(["CRM Organization", `${o.replace(" (Synthetic)", "")} — CRM`, { ...(i < 15 ? { customer: `${A}-CUST-${pad(i + 1)}` } : {}), organization_name: `${o.replace(" (Synthetic)", "")} — CRM`, no_of_employees: ["11-50", "51-200", "201-500", "501-1000"][i % 4], annual_revenue: 4500000 + i * 1375000, territory: CITIES[i % 6], industry: ["Construction", "Healthcare", "Hospitality", "Logistics", "Education", "Retail"][i % 6], website: `https://org${i + 1}.example.test` }]));
  const ORGS = [...CUST_NAMES.slice(0, 15), ...EXTRA_ORGS];
  const org = (i: number) => `${ORGS[i % 25]!.replace(" (Synthetic)", "")} — CRM`;
  for (let k = 1; k <= 40; k++) {
    const fn = FIRST[k % 30]!, ln = LAST[(k * 7) % 10]!; const m = 1 + (k % 10);
    r.push(["CRM Lead", `${A}-CRM-LEAD-${pad(k)}`, { first_name: fn, last_name: ln, lead_name: `${fn} ${ln}`, email: `${fn.toLowerCase()}.${k}@lead.example.test`, mobile_no: `+96656${pad(3000000 + k * 2777, 7)}`, organization: org(k), status: k <= 15 ? "Converted" : LS[k % 6], converted: k <= 15 ? 1 : 0, ...(k <= 15 ? { custom_converted_deal: `${A}-CRM-DEAL-${pad(k)}`, custom_converted_org: org(k) } : {}), custom_estimated_value: [90000, 180000, 45000, 320000, 600000, 120000, 75000][k % 7], source: SRC[k % 6], territory: CITIES[k % 6], industry: ["Construction", "Healthcare", "Hospitality"][k % 3], lead_owner: "Administrator", annual_revenue: 200000 * (1 + (k % 8)), creation: iso(day(m, 1 + (k % 27))) }]);
  }
  for (let k = 1; k <= 30; k++) {
    const st = DS[k % 7]!; const m = 1 + (k % 10); const val = 25000 + k * 7500;
    const contact = `${A}-CRM-CON-${pad(k)}`;
    r.push(["Contact", contact, { first_name: FIRST[(k + 10) % 30], last_name: LAST[k % 10], email_id: `buyer${k}@deal.example.test`, mobile_no: `+96653${pad(4000000 + k * 1999, 7)}`, company_name: org(k), links: [{ link_doctype: "CRM Deal", link_name: `${A}-CRM-DEAL-${pad(k)}` }] }]);
    r.push(["CRM Deal", `${A}-CRM-DEAL-${pad(k)}`, { organization: org(k), status: st, deal_value: val, annual_revenue: 1500000 + k * 875000, email: `buyer${k}@deal.example.test`, mobile_no: `+96653${pad(4000000 + k * 1999, 7)}`, website: `https://www.${org(k).split(" ")[0]!.toLowerCase()}.example.sa`, no_of_employees: ["11-50", "51-200", "201-500", "501-1000"][k % 4], currency: "SAR", probability: { Qualification: 10, "Demo/Making": 25, "Proposal/Quotation": 50, Negotiation: 70, "Ready to Close": 90, Won: 100, Lost: 0 }[st], expected_closure_date: k % 7 < 5 ? (k % 9 === 0 ? rel(-4) : rel(6 + ((k * 11) % 80))) : day(Math.min(12, m + 1), 15), __close_v1: day(Math.min(12, m + 1), 15), deal_owner: "Administrator", source: SRC[k % 6], territory: CITIES[k % 6], contacts: [{ contact, is_primary: 1 }], contact, lead: k <= 15 ? `${A}-CRM-LEAD-${pad(k)}` : "", lost_reason: st === "Lost" ? LOST_REASONS[k % 8]![0] : "", status_change_log: statusHistory(st, iso(day(Math.max(1, m - 4), 3))), creation: iso(day(Math.max(1, m - 4), 3)), communication_status: k % 4 ? "Replied" : "Open" }]);
    r.push(["FCRM Note", `${A}-NOTE-${pad(k)}`, { title: `Meeting notes ${k}`, content: `<p>Discussed requirements and budget (${val} SAR). Synthetic note.</p>`, reference_doctype: "CRM Deal", reference_docname: `${A}-CRM-DEAL-${pad(k)}`, creation: iso(day(m, 5)) }]);
    r.push(["CRM Task", `${A}-TASK-${pad(k)}`, { title: ["Send proposal", "Schedule demo", "Follow up call", "Prepare contract", "Site visit"][k % 5], status: ["Backlog", "Todo", "In Progress", "Done", "Canceled"][k % 5], priority: ["Low", "Medium", "High"][k % 3], due_date: k % 5 < 3 ? `${rel((k % 12) - 2)} 10:00:00` : `${day(Math.min(12, m + 1), 10)} 10:00:00`, __due_v1: `${day(Math.min(12, m + 1), 10)} 10:00:00`, assigned_to: "Administrator", reference_doctype: "CRM Deal", reference_docname: `${A}-CRM-DEAL-${pad(k)}` }]);
    r.push(["CRM Call Log", `${A}-CALL-${pad(k)}`, { id: `${A}-CALL-${pad(k)}`, type: k % 2 ? "Incoming" : "Outgoing", status: ["Completed", "No Answer", "Busy", "Completed"][k % 4], duration: k % 4 === 1 || k % 4 === 2 ? 0 : 60 + k * 23, from: `+96653${pad(4000000 + k * 1999, 7)}`, to: "+966112345678", start_time: `${day(m, 6)} 11:${pad(k % 60, 2)}:00`, reference_doctype: "CRM Deal", reference_docname: `${A}-CRM-DEAL-${pad(k)}`, receiver: "Administrator" }]);
  }
  r.push(...crmExtra(FIRST, LAST, org));
  return r;
}

export function demoRecords(): Rec[] { seed = 20260101; return clearedBankVouchers([...masters(), ...selling(), ...buying(), ...stockAccountsEtc(), ...hr(), ...crmSetup(), ...crm(), ...recentSales()]); }
/** PRO P1-03: bank vouchers older than six weeks were cleared through Bank Clearance (clearance_date = posting date), as on
 *  a reconciled live site, so the native Bank Reconciliation Statement shows only the recent movements as uncleared.
 *  Generated before insert (insert-if-missing), so no stored record is rewritten. */
function clearedBankVouchers(rs: Rec[]): Rec[] {
  const banks = new Set(rs.filter(([dt, , d]) => dt === "Account" && d["account_type"] === "Bank").map(([, name]) => name));
  const old = rel(-42);
  for (const [dt, , d] of rs) {
    if (Number(d["docstatus"]) !== 1 || d["clearance_date"] || String(d["posting_date"] ?? "") > old) continue;
    const hit = dt === "Payment Entry" ? banks.has(String(d["paid_to"])) || banks.has(String(d["paid_from"]))
      : dt === "Journal Entry" ? ((d["accounts"] as { account?: string }[] | undefined) ?? []).some((a) => banks.has(String(a.account))) : false;
    if (hit) d["clearance_date"] = d["posting_date"];
  }
  return rs;
}

/** Insert-if-missing. Returns number of inserted records. */
export function seedDemo() {
  if (isServerHosted()) return;
  if (typeof window === "undefined") return 0;
  let added = 0;
  // seed-returns-v2: earlier synthetic returns used items/amounts not on the original; replace once (GL reposted by postAll)
  for (const dt of ["Sales Invoice", "Purchase Invoice"]) for (const x of adapter.list(dt)) if (x["__synthetic"] && Number(x["is_return"]) && !x["__ret_v2"]) {
    for (const g of adapter.list("GL Entry")) if (g["voucher_no"] === x.name) adapter.remove("GL Entry", g.name);
    adapter.remove(dt, x.name);
  }
  const gone = deletedIndex();
  for (const [dt, name, data] of demoRecords()) {
    if (adapter.get(dt, name) || wasRenamed(dt, name) || gone.has(deletedKey(dt, name))) continue;
    adapter.insertDocQuiet(dt, { ...data, name, __synthetic: 1, ...(data["is_return"] ? { __ret_v2: 1 } : {}) });
    added++;
  }
  // CRM records go through the ported controllers once (status log, SLA, primary contact, assignment)
  if (runCrmEngines()) added++;
  if (added) adapter.flush();
  return added;
}

/** Return built from the original's first item (qty -1), so it passes returnErrors (validate_returned_items). */
function returnOf(r: [string, string, Record<string, unknown>][], dt: string, against: string, name: string, date: string, kind: "sales" | "purchase", status: string): [string, string, Record<string, unknown>] {
  const o = r.find((x) => x[0] === dt && x[1] === against)![2];
  const first = (o["items"] as Record<string, unknown>[])[0]!;
  const items = [{ ...first, idx: 1, qty: -1, amount: -Number(first["rate"]) }]; const t = totals(items as { amount: number; qty: number }[]);
  const party = kind === "sales" ? { customer: o["customer"], customer_name: o["customer_name"] } : { supplier: o["supplier"], supplier_name: o["supplier_name"] };
  return [dt, name, { company: o["company"], ...party, posting_date: date, is_return: 1, return_against: against, items, ...t, taxes: vat(kind, t.net_total), outstanding_amount: t.grand_total, status, docstatus: 1, creation: `${date}T10:00:00` }];
}
