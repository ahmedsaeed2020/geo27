/**
 * Core demo data the shared reports need beyond the trading demo (owner OWN-48 / OWN-58): a Saudi withholding-tax
 * category with one withheld payment, batch- and serial-tracked stock received and issued, and the sales team on
 * demo selling documents. Insert-if-missing with explicit names (Deleted Document tombstones honoured); newly
 * inserted submitted vouchers are posted by posting.ts, so ledgers come from the one posting engine.
 */
import { demoCompany } from "./demoCompany";
import { adapter, type Doc } from "@/lib/adapter";
import { deletedIndex, deletedKey } from "@/lib/deletedDocs";
import { post } from "@/lib/posting";
import { applySerialBatch } from "@/lib/serialBatch";
import { makeSchedules, postDepreciation } from "@/lib/assets";
import { formulaMasters, formulaRecords } from "./seedFormulas";
import { opsRecords } from "./seedOps";

type Rec = [string, string, Record<string, unknown>];
const isoDay = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (iso: string, k: number) => isoDay(new Date(Date.parse(`${iso}T00:00:00Z`) + k * 864e5));

export function reportRecords(today = isoDay(new Date())): { records: Rec[]; vouchers: [string, string][] } {
  const co = demoCompany();
  if (!co) return { records: [], vouchers: [] };
  const C = co.name; const A = String(co["abbr"] ?? "") || "DDT"; const r: Rec[] = []; const vouchers: [string, string][] = [];
  const fy = adapter.list("Fiscal Year").find((y) => String(y["year_start_date"]) <= today && String(y["year_end_date"]) >= today);
  const supp = adapter.list("Supplier").sort((a, b) => a.name.localeCompare(b.name))[0];
  const payable = adapter.list("Account").find((a) => a["company"] === C && a["account_type"] === "Payable" && !Number(a["is_group"] ?? 0));
  const expense = adapter.list("Account").find((a) => a["company"] === C && a["root_type"] === "Expense" && !Number(a["is_group"] ?? 0) && !/cost of goods|depreciation/i.test(a.name));
  const cc = adapter.list("Cost Center").find((c) => c["company"] === C && !Number(c["is_group"] ?? 0));
  const wh = adapter.list("Warehouse").filter((w) => w["company"] === C && !Number(w["is_group"] ?? 0)).sort((a, b) => a.name.localeCompare(b.name))[0];
  const group = String(adapter.list("Item").find((i) => i["item_group"])?.["item_group"] ?? "Products");

  // Saudi withholding tax on payments to non-residents (5% on services): category, payable account and one withheld payment
  const wht = `Withholding Tax Payable - ${A}`;
  r.push(["Account", wht, { account_name: "Withholding Tax Payable", parent_account: `Source of Funds (Liabilities) - ${A}`, root_type: "Liability", account_type: "Tax", is_group: 0, company: C, account_currency: "SAR" }]);
  r.push(["Tax Withholding Category", "WHT - Non-resident services 5%", { category_name: "WHT - Non-resident services 5%", rates: [{ idx: 1, from_date: fy?.["year_start_date"] ?? `${today.slice(0, 4)}-01-01`, to_date: fy?.["year_end_date"] ?? `${today.slice(0, 4)}-12-31`, tax_withholding_rate: 5, single_threshold: 0, cumulative_threshold: 0 }], accounts: [{ idx: 1, company: C, account: wht }] }]);
  if (supp && payable && expense) {
    const jv = `${A}-JV-WHT-0001`; const date = addDays(today, -20);
    r.push(["Journal Entry", jv, { voucher_type: "Journal Entry", company: C, posting_date: date, apply_tds: 1, tax_withholding_category: "WHT - Non-resident services 5%", user_remark: "Technical consulting by a non-resident provider — 5% withholding tax deducted", total_debit: 20000, total_credit: 20000, docstatus: 1, creation: `${date}T09:00:00`,
      accounts: [{ idx: 1, account: expense.name, debit_in_account_currency: 20000, debit: 20000, credit_in_account_currency: 0, credit: 0, cost_center: cc?.name ?? "" },
        { idx: 2, account: payable.name, party_type: "Supplier", party: supp.name, debit_in_account_currency: 0, debit: 0, credit_in_account_currency: 19000, credit: 19000 },
        { idx: 3, account: wht, debit_in_account_currency: 0, debit: 0, credit_in_account_currency: 1000, credit: 1000 }] }]);
    vouchers.push(["Journal Entry", jv]);
  }

  // batch- and serial-tracked stock (Batch Item Expiry Status, Batch-Wise Balance History, Serial No Ledger, traceability)
  if (wh) {
    const bi = `${A}-CORE-BATCH`, si = `${A}-CORE-SERIAL`;
    r.push(["Item", bi, { item_code: bi, item_name: "Food-grade lubricant (batches)", item_group: group, stock_uom: "Nos", is_stock_item: 1, has_batch_no: 1, has_expiry_date: 1, shelf_life_in_days: 365, valuation_rate: 25, standard_rate: 40, lead_time_days: 7, safety_stock: 10 }]);
    r.push(["Item", si, { item_code: si, item_name: "Handheld barcode scanner (serials)", item_group: group, stock_uom: "Nos", is_stock_item: 1, has_serial_no: 1, valuation_rate: 400, standard_rate: 650, lead_time_days: 14 }]);
    const b1 = `${A}-CB-001`, b2 = `${A}-CB-002`;
    r.push(["Batch", b1, { batch_id: b1, item: bi, item_name: "Food-grade lubricant (batches)", manufacturing_date: addDays(today, -320), expiry_date: addDays(today, 45), stock_uom: "Nos" }]);
    r.push(["Batch", b2, { batch_id: b2, item: bi, item_name: "Food-grade lubricant (batches)", manufacturing_date: addDays(today, -60), expiry_date: addDays(today, 300), stock_uom: "Nos" }]);
    const sns = [1, 2, 3].map((k) => `${A}-CSN-00${k}`);
    sns.forEach((sn) => r.push(["Serial No", sn, { serial_no: sn, item_code: si, item_name: "Handheld barcode scanner (serials)", company: C, status: "Inactive" }]));
    const rcv = `${A}-STE-CORE-RCV`, iss = `${A}-STE-CORE-ISS`; const d1 = addDays(today, -40), d2 = addDays(today, -12);
    const row = (idx: number, item: string, name: string, qty: number, rate: number, x: Record<string, unknown>) => ({ idx, item_code: item, item_name: name, qty, transfer_qty: qty, basic_rate: rate, valuation_rate: rate, amount: qty * rate, uom: "Nos", stock_uom: "Nos", conversion_factor: 1, ...x });
    r.push(["Stock Entry", rcv, { stock_entry_type: "Material Receipt", purpose: "Material Receipt", company: C, posting_date: d1, posting_time: "10:00:00", docstatus: 1, creation: `${d1}T10:00:00`, items: [
      row(1, bi, "Food-grade lubricant (batches)", 40, 25, { t_warehouse: wh.name, batch_no: b1 }), row(2, bi, "Food-grade lubricant (batches)", 30, 26, { t_warehouse: wh.name, batch_no: b2 }), row(3, si, "Handheld barcode scanner (serials)", 3, 400, { t_warehouse: wh.name, serial_no: sns.join("\n") })] }]);
    r.push(["Stock Entry", iss, { stock_entry_type: "Material Issue", purpose: "Material Issue", company: C, posting_date: d2, posting_time: "11:00:00", docstatus: 1, creation: `${d2}T11:00:00`, items: [
      row(1, bi, "Food-grade lubricant (batches)", 12, 25, { s_warehouse: wh.name, batch_no: b1 }), row(2, si, "Handheld barcode scanner (serials)", 1, 400, { s_warehouse: wh.name, serial_no: sns[0] })] }]);
    vouchers.push(["Stock Entry", rcv], ["Stock Entry", iss]);
  }
  // lost quotations with reasons and competitors (Lost Quotations), a product bundle (Available Stock for Packing Items)
  // and an open material-transfer request (Requested Items To Be Transferred)
  const custs = adapter.list("Customer").filter((c) => c["__synthetic"]).sort((a, b) => a.name.localeCompare(b.name));
  const stocked = [...new Set(adapter.list("Stock Ledger Entry").filter((e) => e["company"] === C && Number(e["actual_qty"]) > 0).map((e) => String(e["item_code"])))].sort().filter((code) => !code.includes("CORE"));
  const whs = adapter.list("Warehouse").filter((w) => w["company"] === C && !Number(w["is_group"] ?? 0)).sort((a, b) => a.name.localeCompare(b.name));
  for (const [reason, comp] of [["Price too high", "Gulf Trading Est."], ["Delivery time", "Najd Supplies Co."]] as const) { r.push(["Quotation Lost Reason", reason, { order_lost_reason: reason }]); r.push(["Competitor", comp, { competitor_name: comp, website: "" }]); }
  if (custs.length >= 2 && stocked.length >= 2) {
    [[0, "Price too high", "Gulf Trading Est.", 18400], [1, "Delivery time", "Najd Supplies Co.", 9650]].forEach(([i, reason, comp, net], k) => {
      const c = custs[i as number]!; const it = adapter.get("Item", stocked[k]!); const qn = `${A}-QTN-CORE-LOST-${k + 1}`; const d = addDays(today, -35 + k * 9); const amount = net as number;
      r.push(["Quotation", qn, { quotation_to: "Customer", party_name: c.name, customer_name: c["customer_name"] ?? c.name, transaction_date: d, valid_till: addDays(d, 15), company: C, currency: "SAR", conversion_rate: 1, order_type: "Sales", status: "Lost", docstatus: 1, creation: `${d}T09:30:00`,
        items: [{ idx: 1, item_code: it?.name ?? stocked[k], item_name: it?.["item_name"] ?? stocked[k], qty: 10, rate: amount / 10, amount, net_amount: amount, base_net_amount: amount, uom: "Nos" }], total: amount, net_total: amount, base_net_total: amount, total_taxes_and_charges: +(amount * 0.15).toFixed(2), grand_total: +(amount * 1.15).toFixed(2), base_grand_total: +(amount * 1.15).toFixed(2),
        order_lost_reason: reason, lost_reasons: [{ idx: 1, lost_reason: reason }], competitors: [{ idx: 1, competitor: comp }] }]);
    });
    const kit = `${A}-CORE-KIT`;
    r.push(["Item", kit, { item_code: kit, item_name: "Maintenance starter kit (bundle)", item_group: group, stock_uom: "Nos", is_stock_item: 0, standard_rate: 950 }]);
    r.push(["Product Bundle", kit, { new_item_code: kit, description: "Maintenance starter kit", items: [{ idx: 1, item_code: stocked[0], qty: 1, uom: "Nos" }, { idx: 2, item_code: stocked[1], qty: 2, uom: "Nos" }] }]);
    if (whs.length >= 2) { const d = addDays(today, -6);
      r.push(["Material Request", `${A}-MR-CORE-TRF`, { material_request_type: "Material Transfer", transaction_date: d, schedule_date: addDays(d, 7), company: C, status: "Pending", docstatus: 1, per_ordered: 0, creation: `${d}T08:00:00`,
        items: [{ idx: 1, item_code: stocked[0], item_name: adapter.get("Item", stocked[0]!)?.["item_name"] ?? stocked[0], qty: 6, stock_qty: 6, uom: "Nos", stock_uom: "Nos", conversion_factor: 1, warehouse: whs[1]!.name, from_warehouse: whs[0]!.name, schedule_date: addDays(d, 7) }] }]); }
  }
  // a cost-center budget (Budget Variance Report), a 12-month service contract billed in advance (Deferred Revenue and
  // Expense) and goods billed before receipt (Billed Items To Be Received)
  if (fy && cc && expense) r.push(["Budget", `${A}-BUDGET-CORE-${fy.name}`, { budget_against: "Cost Center", cost_center: cc.name, company: C, fiscal_year: fy.name, from_fiscal_year: fy.name, to_fiscal_year: fy.name, monthly_distribution: "", applicable_on_booking_actual_expenses: 1, action_if_annual_budget_exceeded: "Warn", action_if_accumulated_monthly_budget_exceeded: "Ignore", docstatus: 1, accounts: [{ idx: 1, account: expense.name, budget_amount: 250000 }] }]);
  const deferredAcc = `Deferred Revenue - ${A}`;
  r.push(["Account", deferredAcc, { account_name: "Deferred Revenue", parent_account: `Source of Funds (Liabilities) - ${A}`, root_type: "Liability", account_type: "", is_group: 0, company: C, account_currency: "SAR" }]);
  const si = adapter.list("Sales Invoice").filter((d) => d["company"] === C && d["__synthetic"] && Number(d.docstatus) === 1 && !Number(d["is_return"] ?? 0)).sort((a, b) => a.name.localeCompare(b.name))[0];
  if (si) {
    const name = `${A}-SINV-CORE-DEF`; const date = addDays(today, -70); const net = 24000; const vat = 3600; const row0: Doc = ((si["items"] as Doc[] | undefined) ?? [])[0] ?? ({} as Doc);
    r.push(["Sales Invoice", name, { ...si, name: undefined, posting_date: date, due_date: addDays(date, 30), creation: `${date}T10:00:00`, docstatus: 1, status: "Unpaid", is_return: 0, return_against: "", sales_team: [], payment_schedule: [], remarks: "Annual maintenance contract billed in advance — revenue recognized monthly",
      items: [{ ...row0, idx: 1, item_code: row0["item_code"], qty: 1, rate: net, amount: net, net_amount: net, base_net_amount: net, base_amount: net, delivery_note: "", dn_detail: "", sales_order: "", so_detail: "", enable_deferred_revenue: 1, deferred_revenue_account: deferredAcc, service_start_date: addDays(date, 1), service_end_date: addDays(date, 365), name: `${name}-1` }],
      total: net, net_total: net, base_net_total: net, total_taxes_and_charges: vat, base_total_taxes_and_charges: vat, grand_total: net + vat, base_grand_total: net + vat, rounded_total: net + vat, outstanding_amount: net + vat,
      taxes: ((si["taxes"] as Doc[] | undefined) ?? []).slice(0, 1).map((t) => ({ ...t, tax_amount: vat, base_tax_amount: vat, total: net + vat })) }]);
    vouchers.push(["Sales Invoice", name]);
  }
  const pi = adapter.list("Purchase Invoice").filter((d) => d["company"] === C && d["__synthetic"] && Number(d.docstatus) === 1 && !Number(d["is_return"] ?? 0) && !Number(d["update_stock"] ?? 0)).sort((a, b) => a.name.localeCompare(b.name))[0];
  if (pi && stocked.length) {
    const name = `${A}-PINV-CORE-ADV`; const date = addDays(today, -8); const it = adapter.get("Item", stocked[0]!); const rate = Number(it?.["valuation_rate"] ?? it?.["standard_rate"] ?? 100) || 100; const net = rate * 20; const vat = +(net * 0.15).toFixed(2); const row0: Doc = ((pi["items"] as Doc[] | undefined) ?? [])[0] ?? ({} as Doc);
    r.push(["Purchase Invoice", name, { ...pi, name: undefined, posting_date: date, bill_date: date, due_date: addDays(date, 30), creation: `${date}T12:00:00`, docstatus: 1, status: "Unpaid", update_stock: 0, remarks: "Advance billing — goods arrive next week",
      items: [{ ...row0, idx: 1, item_code: stocked[0], item_name: it?.["item_name"] ?? stocked[0], qty: 20, stock_qty: 20, received_qty: 0, rate, amount: net, net_amount: net, base_net_amount: net, base_amount: net, purchase_order: "", po_detail: "", purchase_receipt: "", pr_detail: "", name: `${name}-1` }],
      total: net, net_total: net, base_net_total: net, total_taxes_and_charges: vat, base_total_taxes_and_charges: vat, grand_total: net + vat, base_grand_total: net + vat, rounded_total: net + vat, outstanding_amount: net + vat,
      taxes: ((pi["taxes"] as Doc[] | undefined) ?? []).slice(0, 1).map((t) => ({ ...t, tax_amount: vat, base_tax_amount: vat, total: net + vat })) }]);
    vouchers.push(["Purchase Invoice", name]);
  }
  return { records: r, vouchers };
}

/** One asset depreciating on its own schedule with posted entries (Asset Depreciation Ledger), via assets.ts. */
function demoDepreciatingAsset(today: string) {
  const co = demoCompany(); if (!co) return;
  const A = String(co["abbr"] ?? "") || "DDT"; const name = `${A}-AST-CORE-0001`;
  if (adapter.get("Asset", name) || deletedIndex().has(deletedKey("Asset", name))) return;
  const peer = adapter.list("Asset").find((a) => a["company"] === co.name && a["__synthetic"] && a["asset_category"]); if (!peer) return;
  // depreciation starts after the latest closed accounting period, so the posted entries respect the period lock
  const closedTill = adapter.list("Accounting Period").filter((p) => p["company"] === co.name && String(p["end_date"] ?? "") < today).map((p) => String(p["end_date"])).sort().pop();
  const start = closedTill && addDays(closedTill, 1) > addDays(today, -200) ? addDays(closedTill, 1) : addDays(today, -200);
  adapter.insertDocQuiet("Asset", { name, asset_name: "Electric forklift 2.5t", item_code: peer["item_code"], asset_category: peer["asset_category"], company: co.name, location: peer["location"] ?? "", cost_center: peer["cost_center"] ?? "", purchase_date: start, available_for_use_date: start, gross_purchase_amount: 120000, net_purchase_amount: 120000, calculate_depreciation: 1, depreciation_method: "Straight Line", total_number_of_depreciations: 60, frequency_of_depreciation: 1, expected_value_after_useful_life: 0, value_after_depreciation: 120000, status: "Submitted", docstatus: 1, __synthetic: 1, creation: `${start}T08:00:00` });
  try { makeSchedules(name); postDepreciation(name, today); } catch (e) { console.warn("[core demo] depreciation sample skipped", e); }
}

/** Sales team on demo selling documents (selling_controller set_sales_team): only synthetic records without one. */
function demoSalesTeams() {
  const people = adapter.list("Sales Person").filter((p) => !Number(p["is_group"] ?? 0)).map((p) => p.name).sort();
  if (!people.length) return;
  for (const dt of ["Sales Order", "Delivery Note", "Sales Invoice"]) for (const d of adapter.list(dt)) {
    if (!d["__synthetic"] || (Array.isArray(d["sales_team"]) && (d["sales_team"] as unknown[]).length)) continue;
    const k = [...String(d["customer"] ?? d.name)].reduce((a, ch) => a + ch.charCodeAt(0), 0);
    const p1 = people[k % people.length]!; const p2 = people[(k + 1) % people.length]!;
    const net = Number(d["base_net_total"] ?? d["net_total"] ?? 0);
    const team = k % 3 === 0 && p1 !== p2 ? [{ idx: 1, sales_person: p1, allocated_percentage: 70, allocated_amount: +(net * 0.7).toFixed(2) }, { idx: 2, sales_person: p2, allocated_percentage: 30, allocated_amount: +(net * 0.3).toFixed(2) }] : [{ idx: 1, sales_person: p1, allocated_percentage: 100, allocated_amount: net }];
    adapter.insertDocQuiet(dt, { ...(d as Doc), sales_team: team });
  }
}

export function seedReportData(today?: string): number {
  const gone = deletedIndex(); let added = 0; const { records, vouchers } = reportRecords(today); const fresh = new Set<string>();
  for (const [dt, name, data] of records) {
    if (adapter.get(dt, name) || gone.has(deletedKey(dt, name))) continue;
    adapter.insertDocQuiet(dt, { ...data, name, __synthetic: 1 }); fresh.add(`${dt}|${name}`); added++;
  }
  for (const [dt, name] of vouchers) {
    if (!fresh.has(`${dt}|${name}`)) continue; const d = adapter.get(dt, name); if (!d || Number(d.docstatus) !== 1) continue;
    post(dt, d); if (dt === "Stock Entry") applySerialBatch(dt, d, 1);
  }
  demoDepreciatingAsset(today ?? isoDay(new Date()));
  demoSalesTeams();
  // Run11.1 defined-formula demo data (seedFormulas.ts): inserted, posted, then Bins rebuilt from the posted rows
  const fx = formulaRecords(today); const freshF = new Set<string>();
  for (const [dt, name, data] of fx.records) {
    if (adapter.get(dt, name) || gone.has(deletedKey(dt, name))) continue;
    adapter.insertDocQuiet(dt, { ...data, name, __synthetic: 1 }); freshF.add(`${dt}|${name}`); added++;
  }
  for (const [dt, name] of fx.vouchers) {
    if (!freshF.has(`${dt}|${name}`)) continue; const d = adapter.get(dt, name); if (!d || Number(d.docstatus) !== 1) continue;
    try { post(dt, d); if (dt === "Stock Entry") applySerialBatch(dt, d, 1); } catch (e) { console.warn("[core demo] formula voucher not posted", dt, name, e); }
  }
  for (const more of fx.after) for (const [dt, name, data] of more()) { if (adapter.get(dt, name) || gone.has(deletedKey(dt, name))) continue; adapter.insertDocQuiet(dt, { ...data, name, __synthetic: 1 }); added++; }
  formulaMasters(today ?? isoDay(new Date()));
  // shared finance / operations demo data (seedOps.ts) — reads the formula records above (orders, quotations, receipts)
  const co = demoCompany();
  if (co) for (const [dt, name, data] of opsRecords(co.name, String(co["abbr"] ?? "") || "DDT", today ?? isoDay(new Date()))) { if (adapter.get(dt, name) || gone.has(deletedKey(dt, name))) continue; adapter.insertDocQuiet(dt, { ...data, name, __synthetic: 1 }); added++; }
  return added;
}
