/**
 * Memory-only ERPNext sample volume for the trading demo company (DDT): parties, a full year of selling and buying
 * chains, stock movements, manufacturing, quality, journals, bank lines, assets, projects and support. Purchases are
 * planned from the month's deliveries, so stock never goes negative; every submitted voucher is posted afterwards by
 * posting.ts (src/lib/volume/index.ts), so ledgers, outstanding and reports follow the shared engines.
 */
import { adapter } from "@/lib/adapter";
import { addDays, CUTOFF, daysBetween, demoItems, exists, fyOf, inMonth, iso, isWorkday, LAST, MONTHS, monthEnd, pad, R, r2, rng, workdays, ymd, type Item, type Rec, type Rng } from "./kit";
import { CITIES, fullAr, fullEn, orgName, person, supplierName } from "./names";

const A = "DDT";
const V = `${A}-V`;
const co = () => R("Company", "Digit Demo Trading Co.");
const acc = (n: string) => R("Account", `${n} - ${A}`);
const cc = (n: string) => R("Cost Center", `${n} - ${A}`);
const pl = (n: string) => R("Price List", n);
const SALES_TAX = () => R("Sales Taxes and Charges Template", `KSA VAT 15% - ${A}`);
const BUY_TAX = () => R("Purchase Taxes and Charges Template", `KSA VAT 15% Input - ${A}`);
export const VOL_WH = { K: `مستودع الخبر - ${A}`, M: `مستودع مكة - ${A}` } as const;
const BRANCH_CC = ["Riyadh", "Jeddah", "Dammam"] as const;
const tag = { __synthetic: 1, __sample: "volume" } as const;
const NEW_ACCOUNTS: [string, string][] = [["Office Supplies Expense", "مصروف أدوات مكتبية"], ["Transport Expense", "مصروف النقل"], ["Marketing Expense", "مصروف التسويق"], ["Maintenance Expense", "مصروف الصيانة"], ["Bank Charges", "رسوم بنكية"]];
const newAcc = (en: string) => `${NEW_ACCOUNTS.find((x) => x[0] === en)![1]} - ${A}`;

interface Party { id: string; name: string; en: string; territory: string }
type Row = Record<string, unknown>;

/** Sales quantity scale of the sample year, sized so the demo company trades at a realistic profit after payroll and overheads. */
const SALES_SCALE = 1.7;
/** Quantity tiers: bulk consumables, mid-range parts, capital equipment. */
function qtyFor(r: Rng, it: Item, scale = 1) {
  const q = it.rate < 50 ? r.int(80, 420) : it.rate < 500 ? r.int(15, 110) : it.rate < 5000 ? r.int(3, 22) : r.int(1, 3);
  return Math.max(1, Math.round(q * scale));
}
function itemRow(idx: number, it: Item, qty: number, rate: number, disc = 0, extra: Row = {}): Row {
  const net = r2(rate * (1 - disc / 100));
  return { idx, item_code: it.code, item_name: it.name, description: it.name, qty, stock_qty: qty, price_list_rate: rate, discount_percentage: disc, rate: net, amount: r2(qty * net), net_rate: net, net_amount: r2(qty * net), uom: "Nos", stock_uom: "Nos", conversion_factor: 1, item_group: it.group, ...extra };
}
function totals(rows: Row[], sign = 1) {
  const net = r2(rows.reduce((s, x) => s + Number(x["amount"]), 0)); const tax = r2(net * 0.15); const grand = r2(net + tax);
  return { total: net, net_total: net, base_net_total: net, total_qty: rows.reduce((s, x) => s + Number(x["qty"]), 0) * sign, total_taxes_and_charges: tax, base_total_taxes_and_charges: tax, grand_total: grand, base_grand_total: grand, rounded_total: grand, base_rounded_total: grand, disable_rounded_total: 1, currency: "SAR", conversion_rate: 1 };
}
const taxRows = (sales: boolean, net: number) => [{ idx: 1, charge_type: "On Net Total", account_head: acc(sales ? "VAT 15% Output" : "VAT 15% Input"), description: "VAT 15%", rate: 15, net_amount: net, tax_amount: r2(net * 0.15), base_tax_amount: r2(net * 0.15), total: r2(net * 1.15), ...(sales ? {} : { category: "Total", add_deduct_tax: "Add" }) }];

// ---------------------------------------------------------------- masters
function masters(out: Rec[], custs: Party[], supps: Party[]) {
  const C = co();
  // fiscal years of the sample window (calendar years; insert-if-missing keeps the seeded 2026 year as it is)
  for (const y of [...new Set([ymd(1, 1).slice(0, 4), fyOf(CUTOFF)])]) out.push(["Fiscal Year", y, { year: y, year_start_date: `${y}-01-01`, year_end_date: `${y}-12-31`, companies: [{ idx: 1, company: C }], ...tag }]);
  out.push(["Warehouse", VOL_WH.K, { warehouse_name: "مستودع الخبر", company: C, is_group: 0, city: "الخبر", ...tag }]);
  out.push(["Warehouse", VOL_WH.M, { warehouse_name: "مستودع مكة", company: C, is_group: 0, city: "مكة المكرمة", ...tag }]);
  for (const [en, ar] of NEW_ACCOUNTS) out.push(["Account", `${ar} - ${A}`, { account_name: ar, parent_account: acc("Expenses"), root_type: "Expense", account_type: "Expense Account", is_group: 0, company: C, account_currency: "SAR", __name_en: { account_name: en }, ...tag }]);
  for (const p of custs) {
    const i = Number(p.id.slice(-3));
    out.push(["Customer", p.id, { customer_name: p.name, customer_type: "Company", customer_group: ["Corporate", "Government", "Retail"][i % 3], territory: p.territory, default_currency: "SAR", default_price_list: pl(i % 6 === 0 ? "Wholesale" : "Standard Selling"), tax_id: `3${pad(200000000 + i * 104729, 13)}3`.slice(0, 15), payment_terms: i % 4 === 0 ? "" : "Net 30", __name_en: { customer_name: p.en }, creation: iso(ymd(1, 1 + (i % 25))), ...tag }]);
    const ps = person(200 + i);
    out.push(["Contact", `${p.id}-Contact`, { first_name: ps.first[1], last_name: ps.last[1], email_id: `buyer${i}@${p.en.toLowerCase().replace(/[^a-z]+/g, "")}.example.test`, mobile_no: `+96650${pad(3100000 + i * 7919, 7)}`, company_name: p.name, links: [{ link_doctype: "Customer", link_name: p.id }], __name_en: { first_name: ps.first[0], last_name: ps.last[0] }, ...tag }]);
  }
  for (const p of supps) {
    const i = Number(p.id.slice(-3));
    out.push(["Supplier", p.id, { supplier_name: p.name, supplier_group: i % 5 === 0 ? "Importer" : "Local Supplier", supplier_type: "Company", country: "Saudi Arabia", default_currency: "SAR", payment_terms: "Net 45", __name_en: { supplier_name: p.en }, creation: iso(ymd(1, 1 + (i % 20))), ...tag }]);
  }
}

// ---------------------------------------------------------------- selling
interface SaleLine { it: Item; qty: number; rate: number; disc: number }
interface Chain { k: number; m: number; d0: string; cust: Party; lines: SaleLine[]; service: boolean; wh: string; cc: string; stage: 1 | 2 | 3 | 4; pay: number; lost: boolean; draft: boolean }

function planSales(r: Rng, items: Item[], custs: Party[]): Chain[] {
  const stock = items.filter((i) => i.stock), svc = items.filter((i) => !i.stock);
  const chains: Chain[] = []; let k = 0;
  for (const m of MONTHS) {
    // PRO P1-09: the current month starts on its first day (never empty in its first week); earlier months keep day 6
    const days = m === LAST ? (() => { const d = workdays(ymd(m, 1), CUTOFF); return d.length ? d : [CUTOFF]; })() : workdays(ymd(m, 6), monthEnd(m)); if (!days.length) continue;
    // the current month holds the share of a full month that has passed by the cut-off
    const full = 52 + (m % 3) * 4; const n = m === LAST ? Math.max(4, Math.round(full * Math.min(1, Number(CUTOFF.slice(8, 10)) / 30))) : full;
    for (let j = 0; j < n; j++) {
      k++;
      const service = r.chance(0.22);
      const pool = service ? svc : stock;
      const lines: SaleLine[] = []; const used = new Set<string>();
      for (let x = 0, nl = r.int(2, service ? 3 : 5); x < nl; x++) {
        const it = r.pick(pool); if (used.has(it.code)) continue; used.add(it.code);
        lines.push({ it, qty: service ? Math.max(1, Math.round(r.int(1, it.rate > 3000 ? 4 : 60) * SALES_SCALE)) : qtyFor(r, it, SALES_SCALE), rate: it.rate, disc: r.chance(0.3) ? r.pick([2, 5, 7.5, 10]) : 0 });
      }
      const d0 = days[Math.floor((j / n) * days.length)] ?? days[days.length - 1]!;
      const age = daysBetween(d0, CUTOFF);
      // older chains are complete; the last weeks hold open quotations, undelivered orders and unpaid invoices
      const lost = r.chance(0.12);
      const stage: Chain["stage"] = lost ? 1 : age < 6 ? (r.chance(0.5) ? 1 : 2) : age < 14 ? (r.chance(0.4) ? 2 : service ? 4 : 3) : age < 22 ? (r.chance(0.25) ? 3 : 4) : 4;
      const pay = stage < 4 ? 0 : age > 75 ? (r.chance(0.91) ? 1 : 0.5) : age > 40 ? (r.chance(0.8) ? 1 : r.chance(0.5) ? 0.5 : 0) : age > 20 ? (r.chance(0.35) ? 1 : r.chance(0.3) ? 0.4 : 0) : 0;
      const cust = r.chance(0.22) ? custs[custs.length - 1 - (k % 25)]! : custs[k % (custs.length - 25)]!;
      chains.push({ k, m, d0, cust, lines, service, wh: r.chance(0.68) ? VOL_WH.K : VOL_WH.M, cc: cc(BRANCH_CC[k % 3]!), stage, pay, lost, draft: !lost && stage === 1 && r.chance(0.15) });
    }
  }
  return chains;
}

function selling(out: Rec[], chains: Chain[], vouchers: Set<string>) {
  const C = co();
  const LOST = ["السعر أعلى من المنافس", "تأجيل المشروع", "اختيار مورد آخر", "مدة التوريد طويلة"];
  for (const ch of chains) {
    const id = pad(ch.k); const base = { company: C, customer: ch.cust.id, customer_name: ch.cust.name, territory: ch.cust.territory, selling_price_list: pl("Standard Selling"), price_list_currency: "SAR", plc_conversion_rate: 1, taxes_and_charges: SALES_TAX(), cost_center: ch.cc, __name_en: { customer_name: ch.cust.en }, ...tag };
    const rows = (extra: (i: number) => Row = () => ({})) => ch.lines.map((l, i) => itemRow(i + 1, l.it, l.qty, l.rate, l.disc, extra(i)));
    const qRows = rows(); const t = totals(qRows); const taxes = taxRows(true, t.net_total);
    const qtn = `${V}-QTN-${id}`, so = `${V}-SO-${id}`, dn = `${V}-DN-${id}`, si = `${V}-SINV-${id}`, opp = `${V}-OPP-${id}`;
    const validTill = addDays(ch.d0, 30);
    if (ch.k % 3 === 0) out.push(["Opportunity", opp, { opportunity_from: "Customer", party_name: ch.cust.id, customer_name: ch.cust.name, status: ch.lost ? "Lost" : ch.stage >= 2 ? "Converted" : "Quotation", opportunity_amount: t.grand_total, sales_stage: ch.stage >= 2 ? "Negotiation/Review" : "Proposal/Price Quote", probability: ch.stage >= 2 ? 90 : 50, transaction_date: addDays(ch.d0, -4), company: C, currency: "SAR", territory: ch.cust.territory, source: ["Existing Customer", "Reference", "Campaign", "Website"][ch.k % 4], creation: iso(addDays(ch.d0, -4)), ...tag, __name_en: { customer_name: ch.cust.en } }]);
    const qStatus = ch.draft ? "Draft" : ch.lost ? "Lost" : ch.stage >= 2 ? "Ordered" : validTill < CUTOFF ? "Expired" : "Open";
    out.push(["Quotation", qtn, { ...base, quotation_to: "Customer", party_name: ch.cust.id, transaction_date: ch.d0, valid_till: validTill, order_type: "Sales", items: qRows, ...t, taxes, status: qStatus, docstatus: ch.draft ? 0 : 1, ...(ch.k % 3 === 0 ? { opportunity: opp } : {}), ...(ch.lost ? { order_lost_reason: LOST[ch.k % 4] } : {}), creation: iso(ch.d0) }]);
    if (ch.stage < 2) continue;
    const soDate = addDays(ch.d0, 2); const delivDate = addDays(soDate, 10);
    const delivered = ch.stage >= 3 || (ch.service && ch.stage >= 4); const billed = ch.stage >= 4;
    const soStatus = ch.service ? (billed ? "Completed" : "To Bill") : billed ? "Completed" : delivered ? "To Bill" : delivDate < CUTOFF ? "To Deliver and Bill" : "To Deliver and Bill";
    out.push(["Sales Order", so, { ...base, transaction_date: soDate, delivery_date: delivDate, set_warehouse: ch.service ? "" : ch.wh, items: rows((i) => ({ warehouse: ch.service ? "" : ch.wh, delivery_date: delivDate, prevdoc_docname: qtn, delivered_qty: delivered && !ch.service ? ch.lines[i]!.qty : 0, billed_amt: billed ? Number(qRows[i]!["amount"]) : 0 })), ...t, taxes, status: soStatus, per_delivered: delivered && !ch.service ? 100 : 0, per_billed: billed ? 100 : 0, docstatus: 1, creation: iso(soDate) }]);
    let dnDate = "";
    if (!ch.service && ch.stage >= 3) {
      dnDate = addDays(soDate, 4 + (ch.k % 5)); if (dnDate > CUTOFF) dnDate = CUTOFF;
      out.push(["Delivery Note", dn, { ...base, posting_date: dnDate, posting_time: `${pad(9 + (ch.k % 7), 2)}:15:00`, set_warehouse: ch.wh, items: rows((i) => ({ warehouse: ch.wh, against_sales_order: so, expense_account: acc("Cost of Goods Sold"), cost_center: ch.cc, billed_amt: billed ? Number(qRows[i]!["amount"]) : 0 })), ...t, taxes, status: billed ? "Completed" : "To Bill", per_billed: billed ? 100 : 0, docstatus: 1, creation: iso(dnDate) }]);
      vouchers.add(`Delivery Note|${dn}`);
    }
    if (!billed) continue;
    let siDate = addDays(dnDate || addDays(soDate, 6), 1 + (ch.k % 3)); if (siDate > CUTOFF) siDate = CUTOFF;
    const due = addDays(siDate, 30);
    out.push(["Sales Invoice", si, { ...base, posting_date: siDate, due_date: due, debit_to: acc("Debtors"), items: rows((i) => ({ sales_order: so, ...(dnDate ? { delivery_note: dn } : {}), income_account: acc(ch.service ? "Service Income" : "Sales"), cost_center: ch.cc, warehouse: ch.service ? "" : ch.wh })), ...t, taxes, outstanding_amount: t.grand_total, status: "Unpaid", docstatus: 1, creation: iso(siDate) }]);
    vouchers.add(`Sales Invoice|${si}`);
    if (ch.pay > 0) {
      const amt = r2(t.grand_total * ch.pay); let pDate = addDays(siDate, 8 + (ch.k % 30)); if (pDate > CUTOFF) pDate = CUTOFF;
      const pe = `${V}-PE-R-${id}`; const cash = ch.k % 11 === 0;
      out.push(["Payment Entry", pe, { payment_type: "Receive", party_type: "Customer", party: ch.cust.id, party_name: ch.cust.name, company: C, posting_date: pDate, paid_from: acc("Debtors"), paid_to: acc(cash ? "Cash" : "Al-Demo Bank"), paid_from_account_currency: "SAR", paid_to_account_currency: "SAR", paid_amount: amt, received_amount: amt, base_paid_amount: amt, mode_of_payment: cash ? "Cash" : "Bank Transfer", reference_no: `RCV-${id}`, reference_date: pDate, references: [{ idx: 1, reference_doctype: "Sales Invoice", reference_name: si, total_amount: t.grand_total, outstanding_amount: t.grand_total, allocated_amount: amt }], status: "Submitted", docstatus: 1, creation: iso(pDate, 11), __name_en: { party_name: ch.cust.en }, ...tag }]);
      vouchers.add(`Payment Entry|${pe}`);
    }
  }
  // credit notes against eight paid / part-paid invoices (first line, part quantity)
  const sis = chains.filter((c) => c.stage === 4 && !c.service).filter((_, i) => i % 23 === 5).slice(0, 8);
  sis.forEach((ch, j) => {
    const l = ch.lines[0]!; const q = Math.max(1, Math.floor(l.qty / 5)); const row = itemRow(1, l.it, -q, l.rate, l.disc, { income_account: acc("Sales"), cost_center: ch.cc });
    const t = totals([row]); let d = addDays(ch.d0, 25); if (d > CUTOFF) d = CUTOFF;
    const name = `${V}-SINV-RET-${pad(j + 1, 3)}`;
    out.push(["Sales Invoice", name, { company: C, customer: ch.cust.id, customer_name: ch.cust.name, posting_date: d, due_date: d, is_return: 1, return_against: `${V}-SINV-${pad(ch.k)}`, debit_to: acc("Debtors"), selling_price_list: pl("Standard Selling"), taxes_and_charges: SALES_TAX(), cost_center: ch.cc, items: [row], ...t, taxes: taxRows(true, t.net_total), outstanding_amount: 0, status: "Return", docstatus: 1, creation: iso(d, 13), __name_en: { customer_name: ch.cust.en }, ...tag }]);
    vouchers.add(`Sales Invoice|${name}`);
  });
}

/** Retail counter sales on the existing POS profile (POS Invoices are consolidated by ERPNext, not posted per sale). */
function pos(out: Rec[], r: Rng, items: Item[]) {
  const C = co(); const profile = R("POS Profile", `Riyadh Showroom - ${A}`); if (!exists("POS Profile", profile)) return;
  const walkIn = adapter.get("POS Profile", profile)?.["customer"] as string | undefined; if (!walkIn) return;
  const cheap = items.filter((i) => i.stock && i.rate < 800);
  const days = workdays(ymd(1, 4), CUTOFF); let k = 0;
  for (let i = 0; i < days.length; i += 1) {
    if (i % 2) continue;
    for (let j = 0, n = r.int(1, 3); j < n; j++) {
      k++; const rows: Row[] = []; const used = new Set<string>();
      for (let x = 0, nl = r.int(1, 3); x < nl; x++) { const it = r.pick(cheap); if (used.has(it.code)) continue; used.add(it.code); rows.push(itemRow(rows.length + 1, it, r.int(1, it.rate < 60 ? 12 : 3), it.rate)); }
      const t = totals(rows); const d = days[i]!;
      out.push(["POS Invoice", `${V}-POS-${pad(k)}`, { company: C, pos_profile: profile, customer: walkIn, posting_date: d, posting_time: `${pad(10 + (k % 10), 2)}:${pad((k * 7) % 60, 2)}:00`, items: rows, ...t, taxes: taxRows(true, t.net_total), paid_amount: t.grand_total, outstanding_amount: 0, payments: [{ idx: 1, mode_of_payment: k % 3 ? "Mada Card" : "Cash", amount: t.grand_total }], status: "Paid", docstatus: 1, creation: iso(d, 12), ...tag }]);
    }
  }
}

// ---------------------------------------------------------------- buying (planned from deliveries)
interface Demand { m: number; wh: string; it: Item; qty: number }
function buying(out: Rec[], r: Rng, demand: Demand[], supps: Party[], vouchers: Set<string>, items: Item[]) {
  const C = co(); let k = 0;
  // supplier per item group (stable), so a PO groups items one supplier sells
  const groups = [...new Set(demand.map((d) => d.it.group))].sort();
  const supOf = (g: string, alt: number) => supps[(groups.indexOf(g) * 3 + alt) % supps.length]!;
  for (const m of MONTHS) {
    const md = demand.filter((d) => d.m === m); if (!md.length) continue;
    const byKey = new Map<string, Demand[]>();
    for (const d of md) { const key = `${d.it.group}|${d.wh}|${(d.it.code.charCodeAt(d.it.code.length - 1) + m) % 2}`; (byKey.get(key) ?? byKey.set(key, []).get(key)!).push(d); }
    let j = 0;
    for (const [key, ds] of [...byKey].sort(([a], [b]) => a.localeCompare(b))) {
      k++; j++; const [g, wh] = key.split("|") as [string, string]; const sup = supOf(g, j % 3);
      const id = pad(k); const mrDate = ymd(m, 1 + (j % 2)); const poDate = ymd(m, 2 + (j % 2)); const prDate = ymd(m, 4 + (j % 2));
      const rows = (extra: (i: number) => Row = () => ({})) => ds.map((d, i) => itemRow(i + 1, d.it, Math.ceil(d.qty * 1.06), d.it.buy, 0, { warehouse: wh, schedule_date: prDate, ...extra(i) }));
      const base = { company: C, supplier: sup.id, supplier_name: sup.name, buying_price_list: pl("Standard Buying"), price_list_currency: "SAR", plc_conversion_rate: 1, taxes_and_charges: BUY_TAX(), __name_en: { supplier_name: sup.en }, ...tag };
      const mr = `${V}-MR-${id}`, rfq = `${V}-RFQ-${id}`, sq = `${V}-SQ-${id}`, po = `${V}-PO-${id}`, pr = `${V}-PR-${id}`, pi = `${V}-PINV-${id}`;
      const pRows = rows(); const t = totals(pRows); const taxes = taxRows(false, t.net_total);
      out.push(["Material Request", mr, { material_request_type: "Purchase", transaction_date: mrDate, schedule_date: prDate, company: C, set_warehouse: wh, items: rows((i) => ({ ordered_qty: Number(pRows[i]!["qty"]) })), status: "Ordered", per_ordered: 100, docstatus: 1, title: `توريد ${g}`, creation: iso(mrDate), ...tag }]);
      const withRfq = k % 3 === 0;
      if (withRfq) {
        const alt = supOf(g, (j + 1) % 3);
        out.push(["Request for Quotation", rfq, { transaction_date: mrDate, schedule_date: prDate, company: C, suppliers: [{ idx: 1, supplier: sup.id, supplier_name: sup.name, quote_status: "Received" }, { idx: 2, supplier: alt.id, supplier_name: alt.name, quote_status: "Received" }], items: rows(() => ({ material_request: mr })), status: "Submitted", docstatus: 1, message_for_supplier: "يرجى تقديم أفضل سعر ومدة توريد.", creation: iso(mrDate), ...tag }]);
        out.push(["Supplier Quotation", sq, { ...base, transaction_date: mrDate, valid_till: addDays(mrDate, 20), items: rows(() => ({ request_for_quotation: rfq, material_request: mr })), ...t, taxes, status: "Submitted", docstatus: 1, creation: iso(mrDate, 14) }]);
        const altRows = ds.map((d, i) => itemRow(i + 1, d.it, Math.ceil(d.qty * 1.06), r2(d.it.buy * 1.04), 0, { request_for_quotation: rfq, material_request: mr }));
        out.push(["Supplier Quotation", `${sq}-B`, { ...base, supplier: alt.id, supplier_name: alt.name, __name_en: { supplier_name: alt.en }, transaction_date: mrDate, valid_till: addDays(mrDate, 20), items: altRows, ...totals(altRows), taxes: taxRows(false, totals(altRows).net_total), status: "Submitted", docstatus: 1, creation: iso(mrDate, 15) }]);
      }
      const received = prDate <= CUTOFF; const billable = received && addDays(prDate, 3) <= CUTOFF;
      out.push(["Purchase Order", po, { ...base, transaction_date: poDate, schedule_date: prDate, set_warehouse: wh, items: rows((i) => ({ material_request: mr, ...(withRfq ? { supplier_quotation: sq } : {}), received_qty: received ? Number(pRows[i]!["qty"]) : 0, billed_amt: billable ? Number(pRows[i]!["amount"]) : 0 })), ...t, taxes, status: billable ? "Completed" : received ? "To Bill" : "To Receive and Bill", per_received: received ? 100 : 0, per_billed: billable ? 100 : 0, docstatus: 1, creation: iso(poDate) }]);
      if (!received) continue;
      out.push(["Purchase Receipt", pr, { ...base, posting_date: prDate, posting_time: "08:30:00", set_warehouse: wh, items: rows(() => ({ purchase_order: po })), ...t, taxes, status: billable ? "Completed" : "To Bill", per_billed: billable ? 100 : 0, docstatus: 1, creation: iso(prDate, 8) }]);
      vouchers.add(`Purchase Receipt|${pr}`);
      if (k % 6 === 0) { const d0 = ds[0]!; out.push(["Quality Inspection", `${V}-QI-IN-${id}`, { naming_series: "MAT-QA-.YYYY.-", company: C, report_date: prDate, inspection_type: "Incoming", reference_type: "Purchase Receipt", reference_name: pr, item_code: d0.it.code, item_name: d0.it.name, sample_size: 5, inspected_by: "Administrator", status: k % 30 === 0 ? "Rejected" : "Accepted", remarks: k % 30 === 0 ? "عيوب في التغليف لعينة الفحص" : "العينة مطابقة لأمر الشراء", docstatus: 1, creation: iso(prDate, 9), ...tag }]); }
      if (!billable) continue;
      const piDate = addDays(prDate, 3); const due = addDays(piDate, 45);
      out.push(["Purchase Invoice", pi, { ...base, posting_date: piDate, bill_no: `${sup.en.split(" ")[0]!.replace(/[^A-Za-z]/g, "").toUpperCase().slice(0, 4)}-${pad(1000 + k)}`, bill_date: piDate, due_date: due, credit_to: acc("Creditors"), items: rows(() => ({ purchase_order: po, purchase_receipt: pr, expense_account: acc("Stock In Hand"), cost_center: cc("Main") })), ...t, taxes, outstanding_amount: t.grand_total, status: "Unpaid", docstatus: 1, creation: iso(piDate) }]);
      vouchers.add(`Purchase Invoice|${pi}`);
      const age = daysBetween(piDate, CUTOFF);
      const share = age > 50 ? 1 : age > 30 ? (k % 3 ? 1 : 0.5) : age > 14 ? (k % 4 === 0 ? 0.5 : 0) : 0;
      if (share > 0) {
        const amt = r2(t.grand_total * share); let pd = addDays(piDate, 25 + (k % 20)); if (pd > CUTOFF) pd = CUTOFF;
        const pe = `${V}-PE-P-${id}`;
        out.push(["Payment Entry", pe, { payment_type: "Pay", party_type: "Supplier", party: sup.id, party_name: sup.name, company: C, posting_date: pd, paid_from: acc("Al-Demo Bank"), paid_to: acc("Creditors"), paid_from_account_currency: "SAR", paid_to_account_currency: "SAR", paid_amount: amt, received_amount: amt, base_paid_amount: amt, mode_of_payment: "Bank Transfer", reference_no: `OUT-${id}`, reference_date: pd, references: [{ idx: 1, reference_doctype: "Purchase Invoice", reference_name: pi, total_amount: t.grand_total, outstanding_amount: t.grand_total, allocated_amount: amt }], status: "Submitted", docstatus: 1, creation: iso(pd, 10), __name_en: { party_name: sup.en }, ...tag }]);
        vouchers.add(`Payment Entry|${pe}`);
      }
    }
  }
  // open requests of the last fortnight (pending / partly ordered) and two draft orders
  const open = items.filter((i) => i.stock).slice(0, 6);
  open.forEach((it, i) => {
    const d = addDays(CUTOFF, -12 + i * 2); const q = qtyFor(r, it, 0.6);
    out.push(["Material Request", `${V}-MR-OPEN-${pad(i + 1, 2)}`, { material_request_type: i % 3 === 2 ? "Material Transfer" : "Purchase", transaction_date: d, schedule_date: addDays(d, 14), company: C, set_warehouse: VOL_WH.K, items: [itemRow(1, it, q, it.buy, 0, { warehouse: VOL_WH.K, schedule_date: addDays(d, 14), ordered_qty: i % 2 ? Math.floor(q / 2) : 0 })], status: i % 2 ? "Partially Ordered" : "Pending", per_ordered: i % 2 ? 50 : 0, docstatus: 1, title: `طلب ${it.name}`, creation: iso(d), ...tag }]);
  });
  [0, 1].forEach((i) => {
    const sup = supps[i * 7]!; const it = items.filter((x) => x.stock)[10 + i]!; const row = itemRow(1, it, qtyFor(r, it), it.buy, 0, { warehouse: VOL_WH.M, schedule_date: addDays(CUTOFF, 10) }); const t = totals([row]);
    out.push(["Purchase Order", `${V}-PO-DRAFT-${i + 1}`, { company: C, supplier: sup.id, supplier_name: sup.name, transaction_date: addDays(CUTOFF, -1), schedule_date: addDays(CUTOFF, 10), set_warehouse: VOL_WH.M, buying_price_list: pl("Standard Buying"), taxes_and_charges: BUY_TAX(), items: [row], ...t, taxes: taxRows(false, t.net_total), status: "Draft", docstatus: 0, __name_en: { supplier_name: sup.en }, ...tag }]);
  });
}

// ---------------------------------------------------------------- stock, manufacturing, quality
function stockAndMfg(out: Rec[], r: Rng, items: Item[], vouchers: Set<string>, demand: Demand[]) {
  const C = co(); const stock = items.filter((i) => i.stock);
  // opening stock (2 Jan) covering the first days of January in both sample warehouses
  const open = [VOL_WH.K, VOL_WH.M].flatMap((w, wi) => stock.map((it, i) => { const q = Math.ceil(qtyFor(rng(9000 + i + wi * 100), it, wi ? 0.5 : 1)); return itemRow(i + 1 + wi * stock.length, it, q, it.buy, 0, { t_warehouse: w, basic_rate: it.buy, valuation_rate: it.buy, expense_account: acc("Opening Balance Equity") }); }));
  out.push(["Stock Entry", `${V}-STE-OPENING`, { stock_entry_type: "Material Receipt", purpose: "Material Receipt", is_opening: "Yes", company: C, posting_date: ymd(1, 2), posting_time: "07:00:00", items: open, total_incoming_value: r2(open.reduce((s, x) => s + Number(x["amount"]), 0)), remarks: "رصيد افتتاحي لمستودعي الخبر ومكة", docstatus: 1, creation: iso(ymd(1, 2), 7), ...tag }]);
  vouchers.add(`Stock Entry|${V}-STE-OPENING`);
  // manufacturing: assemble distribution boards / lighting kits from parts; raw material is planned like sales demand
  const byName = (s: string) => stock.find((i) => i.name.includes(s));
  const recipes: [Item | undefined, [Item | undefined, number][]][] = [
    [byName("Distribution Board"), [[byName("Circuit Breaker"), 12], [byName("Cable Tray"), 2], [byName("Insulation Tape"), 4]]],
    [byName("Floodlight"), [[byName("LED Panel"), 2], [byName("Cable Ties"), 3], [byName("Steel Bracket"), 2]]],
    [byName("Server Rack"), [[byName("Steel Bracket"), 8], [byName("Extension Socket"), 4], [byName("Steel Bolt"), 2]]],
  ];
  let bomN = 0, wo = 0, ste = 0, qi = 0, jc = 0;
  for (const [fg, parts] of recipes) {
    const comps = parts.filter((p): p is [Item, number] => !!p[0]); if (!fg || comps.length < 2) continue;
    bomN++; const bom = `${V}-BOM-${pad(bomN, 3)}`; const cost = r2(comps.reduce((s, [it, q]) => s + it.buy * q, 0));
    out.push(["BOM", bom, { item: fg.code, item_name: fg.name, company: C, quantity: 1, is_active: 1, is_default: 0, currency: "SAR", rm_cost_as_per: "Valuation Rate", items: comps.map(([it, q], i) => ({ idx: i + 1, item_code: it.code, item_name: it.name, qty: q, stock_qty: q, uom: "Nos", stock_uom: "Nos", rate: it.buy, amount: r2(it.buy * q), source_warehouse: VOL_WH.K })), raw_material_cost: cost, total_cost: r2(cost * 1.08), operating_cost: r2(cost * 0.08), with_operations: 1, operations: [{ idx: 1, operation: "Assembly", workstation: "Assembly Bench", time_in_mins: 45 }, { idx: 2, operation: "Testing", workstation: "Testing Rig", time_in_mins: 15 }], docstatus: 1, creation: iso(ymd(1, 5)), ...tag }]);
    for (const m of MONTHS) {
      for (let x = 0; x < (m === LAST ? 2 : 3); x++) {
        wo++; const qty = r.int(4, 18); const start = inMonth(m, 8 + x * 6); const age = daysBetween(start, CUTOFF);
        const st = age > 10 ? "Completed" : age > 4 ? "In Process" : r.chance(0.5) ? "Not Started" : "Draft";
        const produced = st === "Completed" ? qty : st === "In Process" ? Math.floor(qty / 2) : 0;
        const name = `${V}-WO-${pad(wo)}`;
        out.push(["Work Order", name, { naming_series: "MFG-WO-.YYYY.-", company: C, production_item: fg.code, item_name: fg.name, bom_no: bom, qty, produced_qty: produced, material_transferred_for_manufacturing: produced, planned_start_date: `${start} 08:00:00`, planned_end_date: `${addDays(start, 3)} 17:00:00`, expected_delivery_date: addDays(start, 5), ...(produced ? { actual_start_date: `${start} 08:30:00` } : {}), ...(st === "Completed" ? { actual_end_date: `${addDays(start, 2)} 16:00:00` } : {}), wip_warehouse: VOL_WH.K, fg_warehouse: VOL_WH.K, source_warehouse: VOL_WH.K, stock_uom: "Nos", status: st, docstatus: st === "Draft" ? 0 : 1, required_items: comps.map(([it, q], i) => ({ idx: i + 1, item_code: it.code, item_name: it.name, required_qty: q * qty, transferred_qty: q * produced, consumed_qty: q * produced, source_warehouse: VOL_WH.K })), operations: [{ idx: 1, operation: "Assembly", workstation: "Assembly Bench", time_in_mins: 45 * qty, status: produced ? "Completed" : "Pending", completed_qty: produced }, { idx: 2, operation: "Testing", workstation: "Testing Rig", time_in_mins: 15 * qty, status: st === "Completed" ? "Completed" : "Pending", completed_qty: st === "Completed" ? qty : 0 }], creation: iso(start), ...tag }]);
        if (st !== "Draft" && st !== "Not Started") { for (const [opn, ws] of [["Assembly", "Assembly Bench"], ["Testing", "Testing Rig"]] as const) { jc++; out.push(["Job Card", `${V}-JC-${pad(jc)}`, { work_order: name, operation: opn, workstation: ws, production_item: fg.code, for_quantity: qty, total_completed_qty: opn === "Assembly" ? produced : st === "Completed" ? qty : 0, status: st === "Completed" ? "Completed" : opn === "Assembly" ? "Work In Progress" : "Open", company: C, posting_date: start, docstatus: st === "Completed" ? 1 : 0, time_logs: produced ? [{ idx: 1, from_time: `${start} 08:30:00`, to_time: `${start} ${opn === "Assembly" ? "14:30" : "16:00"}:00`, time_in_mins: opn === "Assembly" ? 360 : 90, completed_qty: produced }] : [], creation: iso(start), ...tag }]); } }
        if (produced > 0) {
          ste++; const d = addDays(start, st === "Completed" ? 2 : 1); const se = `${V}-STE-MFG-${pad(ste)}`;
          for (const [it, q] of comps) demand.push({ m, wh: VOL_WH.K, it, qty: q * produced });
          const rows = [...comps.map(([it, q], i) => itemRow(i + 1, it, q * produced, it.buy, 0, { s_warehouse: VOL_WH.K, basic_rate: it.buy })), itemRow(comps.length + 1, fg, produced, r2(cost * 1.08), 0, { t_warehouse: VOL_WH.K, is_finished_item: 1, basic_rate: r2(cost * 1.08) })];
          out.push(["Stock Entry", se, { stock_entry_type: "Manufacture", purpose: "Manufacture", company: C, posting_date: d, posting_time: "15:00:00", work_order: name, bom_no: bom, fg_completed_qty: produced, from_bom: 1, items: rows, total_outgoing_value: r2(cost * produced), total_incoming_value: r2(cost * 1.08 * produced), docstatus: 1, creation: iso(d, 15), ...tag }]);
          vouchers.add(`Stock Entry|${se}`);
          qi++; out.push(["Quality Inspection", `${V}-QI-${pad(qi)}`, { naming_series: "MAT-QA-.YYYY.-", company: C, report_date: d, inspection_type: "In Process", reference_type: "Job Card", reference_name: `${V}-JC-${pad(jc)}`, item_code: fg.code, item_name: fg.name, sample_size: Math.min(3, produced), inspected_by: "Administrator", status: qi % 9 === 0 ? "Rejected" : "Accepted", remarks: qi % 9 === 0 ? "اختبار العزل لم يجتز الحد الأدنى" : "مطابق للمواصفات", docstatus: 1, creation: iso(d, 16), ...tag }]);
        }
      }
    }
  }
  // monthly internal consumption (material issue to the maintenance cost centre) and Khobar → Makkah transfers
  for (const m of MONTHS) {
    const d = inMonth(m, 20); const issueIt = stock.filter((i) => i.rate < 120); const it = issueIt[m % issueIt.length]!; const q = r.int(10, 40);
    ste++; const se = `${V}-STE-ISS-${pad(m, 2)}`; demand.push({ m, wh: VOL_WH.K, it, qty: q });
    out.push(["Stock Entry", se, { stock_entry_type: "Material Issue", purpose: "Material Issue", company: C, posting_date: d, posting_time: "12:00:00", from_warehouse: VOL_WH.K, items: [itemRow(1, it, q, it.buy, 0, { s_warehouse: VOL_WH.K, basic_rate: it.buy, expense_account: acc("Stock Adjustment"), cost_center: cc("Main") })], remarks: "صرف مواد للاستخدام الداخلي والصيانة", docstatus: 1, creation: iso(d, 12), ...tag }]);
    vouchers.add(`Stock Entry|${se}`);
    const tIt = stock[(m * 5) % stock.length]!; const tq = Math.max(1, Math.floor(qtyFor(r, tIt, 0.25))); const td = inMonth(m, 6);
    demand.push({ m, wh: VOL_WH.K, it: tIt, qty: tq });
    const te = `${V}-STE-TRF-${pad(m, 2)}`;
    out.push(["Stock Entry", te, { stock_entry_type: "Material Transfer", purpose: "Material Transfer", company: C, posting_date: td, posting_time: "11:00:00", from_warehouse: VOL_WH.K, to_warehouse: VOL_WH.M, items: [itemRow(1, tIt, tq, tIt.buy, 0, { s_warehouse: VOL_WH.K, t_warehouse: VOL_WH.M, basic_rate: tIt.buy })], remarks: "تحويل مخزون من الخبر إلى مكة", docstatus: 1, creation: iso(td, 11), ...tag }]);
    vouchers.add(`Stock Entry|${te}`);
  }
}

// ---------------------------------------------------------------- accounts: journals, bank lines, budgets
function accounts(out: Rec[], vouchers: Set<string>, payroll: Map<number, number>) {
  const C = co(); let k = 0;
  const je = (date: string, title: string, voucher_type: string, lines: [string, number, number, string?][], remark = "") => {
    k++; const name = `${V}-JV-${pad(k)}`;
    const accounts = lines.map(([a, dr, cr, c], i) => ({ idx: i + 1, account: a, debit_in_account_currency: dr, credit_in_account_currency: cr, debit: dr, credit: cr, cost_center: c ?? cc("Main") }));
    out.push(["Journal Entry", name, { title, voucher_type, company: C, posting_date: date, accounts, total_debit: r2(lines.reduce((s, x) => s + x[1], 0)), total_credit: r2(lines.reduce((s, x) => s + x[2], 0)), user_remark: remark, docstatus: 1, creation: iso(date, 10), ...tag }]);
    vouchers.add(`Journal Entry|${name}`);
  };
  const bank = acc("Al-Demo Bank");
  je(ymd(1, 4), "زيادة رأس المال لتمويل التوسع في الفروع", "Bank Entry", [[bank, 2500000, 0], [acc("Capital Stock"), 0, 2500000]], "قرار الشركاء بزيادة رأس المال — بيانات تجريبية");
  for (const m of MONTHS) {
    const closed = monthEnd(m) <= CUTOFF;
    BRANCH_CC.forEach((b, i) => { const rent = [38000, 26000, 21000][i]!; je(inMonth(m, 3 + i), `إيجار فرع ${["الرياض", "جدة", "الدمام"][i]} — ${ymd(m, 1).slice(0, 7)}`, "Bank Entry", [[acc("Rent Expense"), rent, 0, cc(b)], [bank, 0, rent]]); });
    const util = 6800 + (m >= 5 && m <= 9 ? 4200 : 0) + m * 90; je(inMonth(m, 12), `فواتير الكهرباء والمياه — ${ymd(m, 1).slice(0, 7)}`, "Bank Entry", [[acc("Utilities Expense"), util, 0], [bank, 0, util]]);
    const mkt = 9000 + (m % 4) * 3500; je(inMonth(m, 14), `حملة تسويقية — ${ymd(m, 1).slice(0, 7)}`, "Bank Entry", [[newAcc("Marketing Expense"), mkt, 0, cc(BRANCH_CC[m % 3]!)], [bank, 0, mkt]]);
    const tr = 7400 + (m % 3) * 1800; je(inMonth(m, 16), `مصاريف نقل وتوصيل — ${ymd(m, 1).slice(0, 7)}`, "Journal Entry", [[newAcc("Transport Expense"), tr, 0], [acc("Cash"), 0, tr]]);
    const mt = 3200 + (m % 5) * 900; je(inMonth(m, 18), `صيانة المكاتب والمعدات — ${ymd(m, 1).slice(0, 7)}`, "Journal Entry", [[newAcc("Maintenance Expense"), mt, 0], [bank, 0, mt]]);
    const os = 1800 + (m % 4) * 450; je(inMonth(m, 9), `أدوات مكتبية — ${ymd(m, 1).slice(0, 7)}`, "Journal Entry", [[newAcc("Office Supplies Expense"), os, 0], [acc("Cash"), 0, os]]);
    const bc = 450 + m * 35; if (closed) je(monthEnd(m), `رسوم بنكية — ${ymd(m, 1).slice(0, 7)}`, "Bank Entry", [[newAcc("Bank Charges"), bc, 0], [bank, 0, bc]]);
    const dep = 14500; if (closed) je(monthEnd(m), `إهلاك شهري — ${ymd(m, 1).slice(0, 7)}`, "Depreciation Entry", [[acc("Depreciation"), dep, 0], [acc("Accumulated Depreciation"), 0, dep]]);
    const gross = payroll.get(m);
    if (gross && closed) {
      je(monthEnd(m), `استحقاق رواتب الفروع — ${ymd(m, 1).slice(0, 7)}`, "Journal Entry", [[acc("Salary"), gross, 0], [acc("Salary Payable"), 0, gross]], "رواتب موظفي الفروع (مسير رواتب الفروع)");
      const payDay = addDays(monthEnd(m), 5); if (payDay <= CUTOFF) je(payDay, `صرف رواتب الفروع — ${ymd(m, 1).slice(0, 7)}`, "Bank Entry", [[acc("Salary Payable"), gross, 0], [bank, 0, gross]], "تحويل الرواتب عبر نظام حماية الأجور");
    }
    // cash deposited to the bank twice a month
    for (const d of [15, 28]) { const dd = inMonth(m, d); if (dd <= CUTOFF) { const amt = 6000 + ((m * d) % 7) * 1000; je(dd, `إيداع نقدية الفروع في البنك`, "Contra Entry", [[bank, amt, 0], [acc("Cash"), 0, amt]]); } }
  }
  // three cost-centre budgets (warn only, so a user submit is never blocked by sample budgets)
  const fy = R("Fiscal Year", fyOf(CUTOFF));
  BRANCH_CC.forEach((b, i) => out.push(["Budget", `${V}-BUDGET-${pad(i + 1, 3)}`, { naming_series: "BUDGET-.########", budget_against: "Cost Center", company: C, cost_center: cc(b), account: newAcc("Marketing Expense"), from_fiscal_year: fy, to_fiscal_year: fy, budget_start_date: `${fyOf(CUTOFF)}-01-01`, budget_end_date: `${fyOf(CUTOFF)}-12-31`, distribution_frequency: "Monthly", budget_amount: [180000, 120000, 90000][i], applicable_on_booking_actual_expenses: 1, action_if_annual_budget_exceeded: "Warn", action_if_accumulated_monthly_budget_exceeded: "Warn", docstatus: 1, creation: iso("2026-01-03"), ...tag }]));
}

/** One bank statement line per bank-side payment; lines older than six weeks are reconciled to their payment. */
function bankLines(out: Rec[]) {
  const C = co(); const ba = R("Bank Account", "Operating - Al-Demo Bank"); if (!exists("Bank Account", ba)) return;
  const bank = acc("Al-Demo Bank"); let k = 0;
  // bank-side journal entries older than six weeks were cleared through Bank Clearance (clearance_date on the voucher)
  for (const [dt, , d] of out) if (dt === "Journal Entry" && daysBetween(String(d["posting_date"]), CUTOFF) > 42 && (d["accounts"] as { account?: string }[] | undefined)?.some((a) => a.account === bank)) d["clearance_date"] = d["posting_date"];
  const pes = out.filter(([dt, , d]) => dt === "Payment Entry" && (d["paid_to"] === bank || d["paid_from"] === bank)).sort((a, b) => String(a[2]["posting_date"]).localeCompare(String(b[2]["posting_date"])));
  for (const [, name, d] of pes) {
    k++; const date = addDays(String(d["posting_date"]), k % 3 === 0 ? 1 : 0); if (date > CUTOFF) continue;
    const dep = d["payment_type"] === "Receive"; const amt = Number(d["paid_amount"]); const rec = daysBetween(date, CUTOFF) > 42;
    // PRO P1-03: a reconciled statement line clears its payment (bank_transaction.py sets clearance_date), so the native
    // Bank Reconciliation Statement shows only the recent, still-open movements as uncleared
    if (rec) d["clearance_date"] = date;
    out.push(["Bank Transaction", `${V}-BT-${pad(k)}`, { date, bank_account: ba, company: C, deposit: dep ? amt : 0, withdrawal: dep ? 0 : amt, currency: "SAR", description: `${dep ? "حوالة واردة" : "حوالة صادرة"} ${d["reference_no"]} — ${d["party_name"]}`, reference_number: d["reference_no"], party_type: d["party_type"], party: d["party"], status: rec ? "Reconciled" : "Unreconciled", allocated_amount: rec ? amt : 0, unallocated_amount: rec ? 0 : amt, ...(rec ? { payment_entries: [{ idx: 1, payment_document: "Payment Entry", payment_entry: name, allocated_amount: amt }] } : {}), docstatus: 1, creation: iso(date, 18), ...tag }]);
  }
}

// ---------------------------------------------------------------- assets, projects, support
function assetsProjectsSupport(out: Rec[], r: Rng, custs: Party[], items: Item[]) {
  const C = co(); const equip = items.filter((i) => i.rate >= 2000);
  const cats = ["Vehicles", "IT Equipment", "Machinery", "Furniture"].map((c) => R("Asset Category", c));
  const ASSETS: [string, number, number, number][] = [["شاحنة توزيع إيسوزو", 0, 168000, 60], ["سيارة مبيعات تويوتا", 0, 92000, 60], ["رافعة شوكية كهربائية", 2, 115000, 96], ["أجهزة حاسب للفرع (8)", 1, 46000, 36], ["طابعات وماسحات", 1, 18500, 36], ["رفوف مستودع الخبر", 3, 64000, 120], ["أثاث فرع جدة", 3, 39000, 60], ["مولد احتياطي 60 ك.ف.أ", 2, 72000, 96], ["كاميرات مراقبة المستودعات", 1, 27500, 48], ["مكيفات فرع الدمام", 3, 33000, 60], ["نظام نقاط البيع", 1, 21000, 36], ["ضاغط هواء صناعي", 2, 26000, 84]];
  ASSETS.forEach(([n, ci, cost, months], i) => {
    const id = `${V}-AST-${pad(i + 1, 3)}`; const start = ymd(1 + (i % 8), 3); const per = r2(cost / months); const elapsed = Math.max(0, LAST - (1 + (i % 8)));
    out.push(["Asset", id, { asset_name: n, item_code: equip[i % equip.length]?.code ?? "", asset_category: cats[ci], company: C, location: ["الرياض", "جدة", "الدمام", "الخبر"][i % 4], purchase_date: start, available_for_use_date: start, gross_purchase_amount: cost, purchase_amount: cost, calculate_depreciation: 1, value_after_depreciation: r2(cost - per * elapsed), status: i === 11 ? "Submitted" : "Partially Depreciated", docstatus: 1, cost_center: cc(BRANCH_CC[i % 3]!), creation: iso(start), ...tag }]);
    out.push(["Asset Depreciation Schedule", `${id}-DS`, { asset: id, asset_name: n, company: C, depreciation_method: "Straight Line", total_number_of_depreciations: months, frequency_of_depreciation: 1, depreciation_schedule: Array.from({ length: Math.min(12, months) }, (_, j) => ({ idx: j + 1, schedule_date: monthEnd(Math.min(12, 1 + (i % 8) + j)), depreciation_amount: per, accumulated_depreciation_amount: r2(per * (j + 1)), journal_entry: j < elapsed ? "preview" : "" })), docstatus: 1, ...tag }]);
  });
  // projects with tasks and timesheets
  const PROJ: [string, number, number][] = [["توريد وتركيب إنارة مستشفى الصفا", 4, 640000], ["تجهيز مستودعات اليسر اللوجستية", 2, 380000], ["عقد صيانة مجمع النخيل التجاري", 0, 210000], ["تمديدات مدرسة الرواد الأهلية", 3, 295000], ["لوحات توزيع مصنع المجد", 5, 450000], ["تحديث شبكة فندق المروة", 6, 175000], ["إنارة واجهات أبراج الأفق", 7, 520000], ["مركز بيانات الهلال", 8, 860000], ["صيانة سنوية لمستشفيات الجود", 1, 240000], ["تجهيز معارض الزهراء", 9, 160000]];
  const TASKS = ["المسح والتصميم", "اعتماد المواد", "التوريد", "التركيب", "الاختبار والتشغيل", "التسليم"];
  PROJ.forEach(([title, startM, est], i) => {
    const id = `${V}-PROJ-${pad(i + 1, 3)}`; const start = ymd(startM + 1, 4); const end = addDays(start, 120 + i * 15); const done = end < CUTOFF;
    const pct = done ? 100 : Math.max(5, Math.min(95, Math.round((daysBetween(start, CUTOFF) / daysBetween(start, end)) * 100)));
    out.push(["Project", id, { project_name: title, status: done ? "Completed" : "Open", is_active: done ? "No" : "Yes", company: C, customer: custs[i * 4]!.id, expected_start_date: start, expected_end_date: end, actual_start_date: start, percent_complete_method: "Manual", percent_complete: pct, estimated_costing: est, total_costing_amount: r2(est * pct / 100 * 0.82), priority: ["Medium", "High", "Low"][i % 3], cost_center: cc(BRANCH_CC[i % 3]!), creation: iso(start), ...tag }]);
    TASKS.forEach((t, j) => {
      const s = addDays(start, j * 20); const e = addDays(s, 24); const st = e < CUTOFF ? "Completed" : s < CUTOFF ? (e < addDays(CUTOFF, 3) ? "Overdue" : "Working") : "Open";
      out.push(["Task", `${id}-T${j + 1}`, { subject: `${t} — ${title}`, project: id, status: st, priority: ["Medium", "High", "Medium", "Urgent", "Low", "Medium"][j], exp_start_date: s, exp_end_date: e, progress: st === "Completed" ? 100 : st === "Open" ? 0 : 50, company: C, ...(st === "Completed" ? { completed_on: e, act_end_date: e } : {}), creation: iso(s), ...tag }]);
    });
    for (let j = 0; j < 8; j++) {
      const d = addDays(start, 6 + j * 12); if (d > CUTOFF) break; const emp = `${A}-EMP-${pad(20 + ((i + j) % 10), 3)}`; if (!exists("Employee", emp)) continue;
      const hrs = r.int(5, 9); const emp0 = adapter.get("Employee", emp)!;
      out.push(["Timesheet", `${id}-TS${j + 1}`, { employee: emp, employee_name: emp0["employee_name"], company: C, parent_project: id, start_date: d, end_date: d, time_logs: [{ idx: 1, activity_type: "Execution", hours: hrs, project: id, task: `${id}-T${Math.min(6, 1 + Math.floor(j / 2))}`, from_time: `${d} 08:00:00`, to_time: `${d} ${pad(8 + hrs, 2)}:00:00`, billing_hours: hrs, billing_rate: 180, billable: 1, costing_rate: 95 }], total_hours: hrs, total_billable_hours: hrs, total_billable_amount: hrs * 180, total_costing_amount: hrs * 95, status: j < 6 ? "Submitted" : "Draft", docstatus: j < 6 ? 1 : 0, creation: iso(d, 17), ...tag }]);
    }
  });
  // support desk: issues, warranty claims, maintenance visits
  const SUBJ = ["تعطل قاطع كهربائي بعد التركيب", "طلب نسخة فاتورة ضريبية", "تأخر توصيل الطلب", "صوت مرتفع في لوحة التوزيع", "مطالبة ضمان لمولد", "استلام صنف غير مطابق", "طلب صيانة دورية", "استفسار عن عرض سعر", "إنارة لا تعمل في الممر", "طلب تدريب على التشغيل", "تلف أثناء الشحن", "تعديل موعد التركيب"];
  const ST = ["Open", "Replied", "On Hold", "Resolved", "Closed", "Closed"];
  for (let k = 1; k <= 110; k++) {
    const d = addDays(ymd(1, 5), Math.floor((k / 110) * daysBetween(ymd(1, 5), CUTOFF))); const cu = custs[(k * 7) % custs.length]!; const age = daysBetween(d, CUTOFF);
    const st = age < 7 ? ST[k % 3]! : age < 20 ? ST[2 + (k % 3)]! : ST[3 + (k % 3)]!;
    out.push(["Issue", `${V}-ISS-${pad(k)}`, { subject: SUBJ[k % SUBJ.length], customer: cu.id, status: st, priority: ["Low", "Medium", "High", "Medium"][k % 4], issue_type: ["Bug", "Request", "Complaint", "Question"][k % 4], opening_date: d, opening_time: `${pad(8 + (k % 9), 2)}:20:00`, raised_by: `buyer${Number(cu.id.slice(-3))}@customer.example.test`, company: C, ...(st === "Resolved" || st === "Closed" ? { resolution_date: `${addDays(d, 1 + (k % 6))} 15:00:00`, resolution_details: "تمت المعالجة وإغلاق الطلب بعد تأكيد العميل." } : {}), first_responded_on: `${d} ${pad(9 + (k % 8), 2)}:45:00`, creation: iso(d, 8 + (k % 9)), ...tag }]);
  }
  const wItems = items.filter((i) => i.rate >= 400);
  for (let k = 1; k <= 30; k++) {
    const d = addDays(ymd(1, 20), k * 9); if (d > CUTOFF) break; const cu = custs[(k * 5) % custs.length]!; const it = wItems[k % wItems.length]!; const st = daysBetween(d, CUTOFF) > 20 ? "Closed" : k % 2 ? "Work In Progress" : "Open";
    out.push(["Warranty Claim", `${V}-WRN-${pad(k, 3)}`, { naming_series: "SER-WRN-.YYYY.-", status: st, complaint_date: d, customer: cu.id, customer_name: cu.name, item_code: it.code, item_name: it.name, complaint: `<p>عطل في ${it.name} خلال فترة الضمان.</p>`, warranty_amc_status: k % 4 ? "Under Warranty" : "Out of Warranty", warranty_expiry_date: addDays(d, 200), company: C, ...(st === "Closed" ? { resolution_date: `${addDays(d, 6)} 12:00:00`, resolution_details: "تم استبدال القطعة المعيبة." } : {}), creation: iso(d), __name_en: { customer_name: cu.en }, ...tag }]);
    if (k % 2 === 0) out.push(["Maintenance Visit", `${V}-MV-${pad(k, 3)}`, { naming_series: "MAT-MVS-.YYYY.-", customer: cu.id, customer_name: cu.name, mntc_date: addDays(d, 3) > CUTOFF ? CUTOFF : addDays(d, 3), mntc_time: "10:00:00", completion_status: st === "Closed" ? "Fully Completed" : "Partially Completed", maintenance_type: k % 3 ? "Breakdown" : "Scheduled", purposes: [{ idx: 1, item_code: it.code, item_name: it.name, description: `فحص وإصلاح ${it.name}`, work_done: st === "Closed" ? "تم الإصلاح" : "بانتظار قطعة غيار", prevdoc_doctype: "Warranty Claim", prevdoc_docname: `${V}-WRN-${pad(k, 3)}` }], customer_feedback: st === "Closed" ? "خدمة ممتازة" : "", status: "Submitted", company: C, docstatus: 1, creation: iso(addDays(d, 3)), __name_en: { customer_name: cu.en }, ...tag }]);
  }
}

/** ERPNext leads and opportunities from campaigns that never reached a quotation. */
function leads(out: Rec[]) {
  const C = co(); const SRC = ["Website", "Cold Calling", "Exhibition", "Reference", "Advertisement", "Campaign"];
  for (let k = 1; k <= 90; k++) {
    const p = person(400 + k); const org = orgName(60 + k); const d = addDays(ymd(1, 6), Math.floor((k / 90) * daysBetween(ymd(1, 6), CUTOFF))); const age = daysBetween(d, CUTOFF);
    const st = age < 10 ? "Open" : age < 30 ? ["Replied", "Interested", "Open"][k % 3]! : ["Opportunity", "Do Not Contact", "Lost Quotation", "Converted", "Interested"][k % 5]!;
    out.push(["Lead", `${V}-LEAD-${pad(k)}`, { lead_name: fullAr(p), first_name: p.first[1], last_name: p.last[1], company_name: org[1], email_id: `${p.first[0].toLowerCase()}.${k}@prospect.example.test`, mobile_no: `+96654${pad(2200000 + k * 3307, 7)}`, status: st, source: SRC[k % 6], territory: CITIES[k % 6]![0], company: C, qualification_status: ["Unqualified", "In Process", "Qualified"][k % 3], creation: iso(d, 10), __name_en: { lead_name: fullEn(p), first_name: p.first[0], last_name: p.last[0], company_name: org[0] }, ...tag }]);
    if (st === "Opportunity" || st === "Interested") out.push(["Opportunity", `${V}-OPP-L${pad(k)}`, { opportunity_from: "Lead", party_name: `${V}-LEAD-${pad(k)}`, customer_name: org[1], status: age < 30 ? "Open" : ["Replied", "Lost", "Open"][k % 3], opportunity_amount: 25000 + k * 2900, probability: [20, 40, 60][k % 3], sales_stage: ["Prospecting", "Qualification", "Needs Analysis"][k % 3], transaction_date: addDays(d, 3) > CUTOFF ? CUTOFF : addDays(d, 3), company: C, currency: "SAR", territory: CITIES[k % 6]![0], source: SRC[k % 6], creation: iso(addDays(d, 3) > CUTOFF ? CUTOFF : addDays(d, 3)), __name_en: { customer_name: org[0] }, ...tag }]);
  }
}

/** Customers / suppliers of the sample layer (60 + 25 new; the last 25 customers are the existing demo customers). */
function parties(): { custs: Party[]; supps: Party[] } {
  const custs: Party[] = Array.from({ length: 60 }, (_, i) => { const [en, ar] = orgName(i); return { id: `${V}-CUST-${pad(i + 1, 3)}`, name: ar, en, territory: CITIES[i % 6]![0] }; });
  for (let i = 1; i <= 25; i++) { const id = `${A}-CUST-${pad(i, 3)}`; const d = adapter.get("Customer", id); if (d) custs.push({ id, name: String(d["customer_name"] ?? id), en: String((d["__name_en"] as Record<string, string> | undefined)?.["customer_name"] ?? d["customer_name"] ?? id), territory: String(d["territory"] ?? "Riyadh") }); }
  const supps: Party[] = Array.from({ length: 25 }, (_, i) => { const [en, ar] = supplierName(i); return { id: `${V}-SUPP-${pad(i + 1, 3)}`, name: ar, en, territory: "" }; });
  return { custs, supps };
}

export interface ErpVolume { records: Rec[]; vouchers: Set<string>; payroll: Map<number, number> }
/** All ERPNext sample records for the trading company; `payroll` = monthly branch payroll gross from the HR layer. */
export function erpVolume(payroll: Map<number, number>): ErpVolume {
  const out: Rec[] = []; const vouchers = new Set<string>();
  if (!exists("Company", co())) return { records: out, vouchers, payroll };
  const items = demoItems(`${A}-ITM-`); if (items.filter((i) => i.stock).length < 8) return { records: out, vouchers, payroll };
  const r = rng(20261019);
  const { custs, supps } = parties();
  masters(out, custs.slice(0, 60), supps);
  const chains = planSales(r, items, custs);
  selling(out, chains, vouchers);
  // stock demand of the month = delivered quantities per warehouse (manufacturing, issues and transfers add theirs)
  const demand: Demand[] = chains.filter((c) => !c.service && c.stage >= 3).flatMap((c) => c.lines.map((l) => ({ m: c.m, wh: c.wh, it: l.it, qty: l.qty })));
  stockAndMfg(out, r, items, vouchers, demand);
  const agg = new Map<string, Demand>();
  for (const d of demand) { const k = `${d.m}|${d.wh}|${d.it.code}`; const cur = agg.get(k); if (cur) cur.qty += d.qty; else agg.set(k, { ...d }); }
  buying(out, r, [...agg.values()], supps, vouchers, items);
  pos(out, r, items);
  accounts(out, vouchers, payroll);
  bankLines(out);
  assetsProjectsSupport(out, r, custs, items);
  leads(out);
  return { records: out, vouchers, payroll };
}
