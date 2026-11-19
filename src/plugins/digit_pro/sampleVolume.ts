/**
 * DIGIT Pro review samples (owner 2026-11-09 "fix every Pro problem": audit G04 / G09 / G12). Memory-only records of the
 * shared sample layer (src/lib/volume, registerVolumeProvider): insert-if-missing under explicit names, never saved to
 * browser storage, never overwriting a user / renamed / deleted record; submitted vouchers are posted afterwards by
 * posting.ts with every other sample voucher. Dates follow the visit date, so the date-relative Pro figures (posted this
 * month, due within 30 days, expiring, overdue) always have something to show on the trading demo company:
 *  - G04: two fixed assets bought on submitted Purchase Invoices (is_fixed_asset lines → Asset.purchase_invoice); one is
 *    later scrapped by a Journal Entry with the same lines assets.ts disposeAsset writes (Cr fixed asset, Dr loss).
 *  - G12: drafts and open items for ACC-OPS / ACC-DUES (draft and month-posted journals, draft and unallocated payments),
 *    INV-CONTROL (draft stock count, batches expiring / expired, active serial numbers received on a Stock Entry with
 *    matching warehouse balances) and AST-SERVICE (maintenance due / overdue, a pending repair, a disposed asset).
 */
import { adapter } from "@/lib/adapter";
import { addDays, pad, R } from "@/lib/volume/kit";
import type { VolumeContext } from "@/lib/volume";

const A = "DDT";
const P = `${A}-V-PRO`;
const today = () => new Date().toISOString().slice(0, 10);
const acc = (n: string) => R("Account", `${n} - ${A}`);

export function proSampleVolume(ctx: VolumeContext) {
  const C = R("Company", "Digit Demo Trading Co.");
  if (!adapter.get("Company", C)) return;
  const T = today(); const monthStart = `${T.slice(0, 7)}-01`;
  const own = (prefix: string) => adapter.list(prefix === "Customer" ? "Customer" : "Supplier").filter((d) => d.name.startsWith(`${A}-${prefix === "Customer" ? "CUST" : "SUPP"}-`));
  const cust = own("Customer")[3] ?? own("Customer")[0]; const supp = own("Supplier")[2] ?? own("Supplier")[0];
  const wh = adapter.list("Warehouse").filter((w) => w["company"] === C && !Number(w["is_group"] ?? 0)).sort((a, b) => a.name.localeCompare(b.name))[0];
  const group = String(adapter.list("Item").find((i) => i.name.startsWith(`${A}-`))?.["item_group"] ?? "");
  const cc = String(adapter.list("Cost Center").find((c) => c["company"] === C && !Number(c["is_group"] ?? 0))?.name ?? "");
  const bank = acc("Al-Demo Bank"); const debtors = acc("Debtors"); const creditors = acc("Creditors");
  const put = (dt: string, name: string, data: Record<string, unknown>, voucher = false) => { const ok = ctx.put(dt, name, data); if (voucher && Number(data["docstatus"]) === 1) ctx.voucher(dt, name); return ok; };
  const jeRows = (lines: [string, number, number, Record<string, unknown>?][]) => lines.map(([account, debit, credit, extra], i) => ({ idx: i + 1, account, debit_in_account_currency: debit, credit_in_account_currency: credit, debit, credit, cost_center: cc, ...(extra ?? {}) }));

  /* ---------------- ACC-OPS / ACC-DUES ---------------- */
  put("Journal Entry", `${P}-JV-DRAFT-01`, { title: "استحقاق إيجار المستودع — مسودة", voucher_type: "Journal Entry", company: C, posting_date: T, accounts: jeRows([[acc("Rent Expense"), 12000, 0], [bank, 0, 12000]]), total_debit: 12000, total_credit: 12000, user_remark: "Sample draft for review (DIGIT Pro).", docstatus: 0 });
  put("Journal Entry", `${P}-JV-MONTH-01`, { title: "مصروف مرافق الشهر الحالي", voucher_type: "Bank Entry", company: C, posting_date: monthStart, accounts: jeRows([[acc("Utilities Expense"), 6400, 0], [bank, 0, 6400]]), total_debit: 6400, total_credit: 6400, docstatus: 1 }, true);
  if (cust) {
    const party = { party_type: "Customer", party: cust.name, party_name: String(cust["customer_name"] ?? cust.name) };
    put("Payment Entry", `${P}-PE-DRAFT-01`, { payment_type: "Receive", ...party, company: C, posting_date: T, paid_from: debtors, paid_to: bank, paid_from_account_currency: "SAR", paid_to_account_currency: "SAR", paid_amount: 8000, received_amount: 8000, unallocated_amount: 8000, mode_of_payment: "Bank Transfer", reference_no: `TRF-PRO-${pad(1, 3)}`, reference_date: T, references: [], status: "Draft", docstatus: 0 });
    put("Payment Entry", `${P}-PE-ADV-01`, { payment_type: "Receive", ...party, company: C, posting_date: addDays(T, -5), paid_from: debtors, paid_to: bank, paid_from_account_currency: "SAR", paid_to_account_currency: "SAR", paid_amount: 15000, received_amount: 15000, unallocated_amount: 15000, total_allocated_amount: 0, mode_of_payment: "Bank Transfer", reference_no: `TRF-PRO-${pad(2, 3)}`, reference_date: addDays(T, -5), references: [], remarks: "Customer advance, not yet allocated to an invoice.", status: "Submitted", docstatus: 1 }, true);
  }

  /* ---------------- SEL-FULFIL (owner notes B-06): two open orders already partly billed, nothing delivered yet ---------------- */
  const sellItems = adapter.list("Item").filter((i) => i.name.startsWith(`${A}-`) && !i.name.startsWith(P) && !Number(i["disabled"] ?? 0) && !Number(i["is_fixed_asset"] ?? 0) && Number(i["standard_rate"] ?? 0) > 0).sort((a, b) => a.name.localeCompare(b.name));
  const buyers = own("Customer");
  if (sellItems.length >= 3 && buyers.length >= 6 && wh) {
    const r2 = (v: number) => Math.round(v * 100) / 100;
    ([[1, 0.4], [2, 0.7]] as const).forEach(([k, share]) => {
      const c = buyers[4 + k]!; const so = `${P}-SO-PB-${pad(k, 2)}`, si = `${P}-SINV-PB-${pad(k, 2)}`;
      const lines = [[sellItems[k - 1]!, 10], [sellItems[k + 1]!, 5]] as const;
      const row = (i: number, it: (typeof lines)[number][0], qty: number, extra: Record<string, unknown>) => { const rate = Number(it["standard_rate"]); return { idx: i + 1, item_code: it.name, item_name: String(it["item_name"] ?? it.name), description: String(it["item_name"] ?? it.name), qty, stock_qty: qty, rate, amount: r2(qty * rate), net_rate: rate, net_amount: r2(qty * rate), base_net_amount: r2(qty * rate), price_list_rate: rate, uom: String(it["stock_uom"] ?? "Nos"), stock_uom: String(it["stock_uom"] ?? "Nos"), conversion_factor: 1, warehouse: wh.name, cost_center: cc, ...extra }; };
      const tot = (rows: { amount: number }[]) => { const net = r2(rows.reduce((t, x) => t + x.amount, 0)); const vat = r2(net * 0.15); return { total: net, net_total: net, base_net_total: net, total_taxes_and_charges: vat, base_total_taxes_and_charges: vat, grand_total: r2(net + vat), base_grand_total: r2(net + vat), rounded_total: r2(net + vat), base_rounded_total: r2(net + vat), taxes: [{ idx: 1, charge_type: "On Net Total", account_head: acc("VAT 15% Output"), description: "VAT 15%", rate: 15, tax_amount: vat, base_tax_amount: vat, tax_amount_after_discount_amount: vat, total: r2(net + vat) }] }; };
      const billQty = Math.round(lines[0][1] * share);
      const siRows = [row(0, lines[0][0], billQty, { sales_order: so, so_detail: `${so}-1`, income_account: acc("Sales") })];
      const soRows = lines.map(([it, q], i) => row(i, it, q, { name: `${so}-${i + 1}`, delivery_date: addDays(T, 4 + k), delivered_qty: 0, billed_amt: i === 0 ? siRows[0]!.amount : 0 }));
      const soT = tot(soRows); const siT = tot(siRows);
      const party = { customer: c.name, customer_name: String(c["customer_name"] ?? c.name), company: C, currency: "SAR", conversion_rate: 1, selling_price_list: "Standard Selling", price_list_currency: "SAR", plc_conversion_rate: 1, cost_center: cc };
      put("Sales Order", so, { ...party, order_type: "Sales", transaction_date: addDays(T, -10 - k), delivery_date: addDays(T, 4 + k), set_warehouse: wh.name, items: soRows, ...soT, per_delivered: 0, per_billed: r2((siRows[0]!.amount / soT.net_total) * 100), billing_status: "Partly Billed", delivery_status: "Not Delivered", status: "To Deliver and Bill", docstatus: 1 });
      put("Sales Invoice", si, { ...party, posting_date: addDays(T, -4 - k), due_date: addDays(T, 26 - k), debit_to: debtors, items: siRows, ...siT, outstanding_amount: siT.grand_total, remarks: "Advance billing of part of the order before delivery.", status: "Unpaid", docstatus: 1 }, true);
    });
  }

  /* ---------------- INV-CONTROL ---------------- */
  if (wh) {
    const whs = new Set(adapter.list("Warehouse").filter((w) => w["company"] === C).map((w) => w.name));
    const stockItem = adapter.list("Bin").find((b) => whs.has(String(b["warehouse"])) && Number(b["actual_qty"]) > 0 && String(b["item_code"]).startsWith(`${A}-`));
    if (stockItem) put("Stock Reconciliation", `${P}-SR-DRAFT-01`, { company: C, purpose: "Stock Reconciliation", posting_date: T, posting_time: "10:00:00", set_warehouse: stockItem["warehouse"], items: [{ idx: 1, item_code: stockItem["item_code"], warehouse: stockItem["warehouse"], qty: Math.max(0, Number(stockItem["actual_qty"]) - 1), valuation_rate: Number(stockItem["valuation_rate"]) || 0, current_qty: Number(stockItem["actual_qty"]) }], docstatus: 0 });
    const bItem = `${P}-ITEM-BATCH`, sItem = `${P}-ITEM-SERIAL`;
    put("Item", bItem, { item_code: bItem, item_name: "محلول تنظيف صناعي (دفعات)", item_group: group, stock_uom: "Nos", is_stock_item: 1, has_batch_no: 1, has_expiry_date: 1, shelf_life_in_days: 365, valuation_rate: 25, standard_rate: 40, disabled: 0 });
    put("Item", sItem, { item_code: sItem, item_name: "جهاز قراءة باركود (أرقام تسلسلية)", item_group: group, stock_uom: "Nos", is_stock_item: 1, has_serial_no: 1, valuation_rate: 1800, standard_rate: 2400, disabled: 0 });
    const exp30 = `${P}-BATCH-EXP30`, past = `${P}-BATCH-EXPIRED`, sns = [`${P}-SN-0001`, `${P}-SN-0002`];
    const recDate = addDays(T, -30);
    put("Batch", exp30, { batch_id: exp30, item: bItem, item_name: "محلول تنظيف صناعي (دفعات)", manufacturing_date: addDays(T, -340), expiry_date: addDays(T, 20), batch_qty: 40, stock_uom: "Nos", disabled: 0, reference_doctype: "Stock Entry", reference_name: `${P}-STE-RCPT-01` });
    put("Batch", past, { batch_id: past, item: bItem, item_name: "محلول تنظيف صناعي (دفعات)", manufacturing_date: addDays(T, -380), expiry_date: addDays(T, -10), batch_qty: 15, stock_uom: "Nos", disabled: 0, reference_doctype: "Stock Entry", reference_name: `${P}-STE-RCPT-01` });
    sns.forEach((sn) => put("Serial No", sn, { serial_no: sn, item_code: sItem, item_name: "جهاز قراءة باركود (أرقام تسلسلية)", company: C, warehouse: wh.name, status: "Active", purchase_document_type: "Stock Entry", purchase_document_no: `${P}-STE-RCPT-01`, purchase_date: recDate }));
    const rows = [
      { item_code: bItem, item_name: "محلول تنظيف صناعي (دفعات)", qty: 40, basic_rate: 25, batch_no: exp30 },
      { item_code: bItem, item_name: "محلول تنظيف صناعي (دفعات)", qty: 15, basic_rate: 25, batch_no: past },
      { item_code: sItem, item_name: "جهاز قراءة باركود (أرقام تسلسلية)", qty: 2, basic_rate: 1800, serial_no: sns.join("\n") },
    ].map((x, i) => ({ idx: i + 1, ...x, valuation_rate: x.basic_rate, amount: x.qty * x.basic_rate, basic_amount: x.qty * x.basic_rate, t_warehouse: wh.name, uom: "Nos", stock_uom: "Nos", conversion_factor: 1, transfer_qty: x.qty }));
    const total = rows.reduce((t, x) => t + x.amount, 0);
    if (put("Stock Entry", `${P}-STE-RCPT-01`, { stock_entry_type: "Material Receipt", purpose: "Material Receipt", company: C, posting_date: recDate, posting_time: "09:00:00", to_warehouse: wh.name, items: rows, total_incoming_value: total, value_difference: total, docstatus: 1 }, true)) {
      // warehouse balances of the new items carry the same quantities and values as the receipt
      put("Bin", `${P}-BIN-BATCH`, { item_code: bItem, warehouse: wh.name, actual_qty: 55, reserved_qty: 0, ordered_qty: 0, projected_qty: 55, valuation_rate: 25, stock_value: 1375, stock_uom: "Nos" });
      put("Bin", `${P}-BIN-SERIAL`, { item_code: sItem, warehouse: wh.name, actual_qty: 2, reserved_qty: 0, ordered_qty: 0, projected_qty: 2, valuation_rate: 1800, stock_value: 3600, stock_uom: "Nos" });
    }
  }

  /* ---------------- AST-REGISTER (G04) and AST-SERVICE ---------------- */
  const cat = R("Asset Category", "Furniture");
  if (supp && adapter.get("Asset Category", cat)) {
    const sname = String(supp["supplier_name"] ?? supp.name);
    const buy = (k: number, item: string, itemName: string, cost: number, date: string) => {
      const pi = `${P}-PINV-FA-${pad(k, 2)}`; const vat = Math.round(cost * 0.15 * 100) / 100;
      put("Item", item, { item_code: item, item_name: itemName, item_group: group, stock_uom: "Nos", is_stock_item: 0, is_fixed_asset: 1, asset_category: cat, standard_rate: cost, disabled: 0 });
      put("Purchase Invoice", pi, { supplier: supp.name, supplier_name: sname, company: C, posting_date: date, bill_no: `SUP-FA-${pad(k, 3)}`, bill_date: date, due_date: addDays(date, 30), credit_to: creditors, currency: "SAR", conversion_rate: 1,
        items: [{ idx: 1, item_code: item, item_name: itemName, qty: 1, rate: cost, amount: cost, net_rate: cost, net_amount: cost, base_net_amount: cost, uom: "Nos", conversion_factor: 1, is_fixed_asset: 1, asset_category: cat, asset_location: "الرياض", expense_account: acc("Fixed Assets"), cost_center: cc }],
        taxes: [{ idx: 1, charge_type: "On Net Total", account_head: acc("VAT 15% Input"), description: "VAT 15%", rate: 15, tax_amount: vat, tax_amount_after_discount_amount: vat, base_tax_amount: vat, total: cost + vat, category: "Total", add_deduct_tax: "Add" }],
        total: cost, net_total: cost, base_net_total: cost, total_taxes_and_charges: vat, grand_total: cost + vat, base_grand_total: cost + vat, rounded_total: cost + vat, outstanding_amount: cost + vat, status: "Unpaid", docstatus: 1 }, true);
      return pi;
    };
    const ac = `${P}-AST-001`, acItem = `${P}-FA-AC`, acDate = addDays(T, -45);
    const pi1 = buy(1, acItem, "مكيف سبليت لمكتب المبيعات", 32000, acDate);
    put("Asset", ac, { asset_name: "مكيف سبليت لمكتب المبيعات", item_code: acItem, asset_category: cat, company: C, location: "الرياض", purchase_invoice: pi1, purchase_date: acDate, available_for_use_date: acDate, gross_purchase_amount: 32000, purchase_amount: 32000, net_purchase_amount: 32000, value_after_depreciation: 32000, calculate_depreciation: 0, maintenance_required: 1, cost_center: cc, status: "Submitted", docstatus: 1 });
    // maintenance plan of that asset: one visit due within 30 days, one overdue
    put("Asset Maintenance", ac, { asset_name: ac, item_code: acItem, item_name: "مكيف سبليت لمكتب المبيعات", asset_category: cat, company: C, asset_maintenance_tasks: [{ idx: 1, maintenance_task: "تنظيف الفلاتر وفحص الغاز", maintenance_type: "Preventive Maintenance", maintenance_status: "Planned", periodicity: "Monthly", start_date: acDate, next_due_date: addDays(T, 12) }] });
    put("Asset Maintenance Log", `${P}-AML-001`, { asset_maintenance: ac, asset_name: "مكيف سبليت لمكتب المبيعات", item_code: acItem, task: "تنظيف الفلاتر وفحص الغاز", task_name: "تنظيف الفلاتر وفحص الغاز", maintenance_type: "Preventive Maintenance", periodicity: "Monthly", maintenance_status: "Planned", due_date: addDays(T, 12), docstatus: 0 });
    put("Asset Maintenance Log", `${P}-AML-002`, { asset_maintenance: ac, asset_name: "مكيف سبليت لمكتب المبيعات", item_code: acItem, task: "فحص التوصيلات الكهربائية", task_name: "فحص التوصيلات الكهربائية", maintenance_type: "Preventive Maintenance", periodicity: "Monthly", maintenance_status: "Overdue", due_date: addDays(T, -6), docstatus: 0 });
    // a pending repair on an existing sample vehicle (no cost posted until the repair is completed and submitted)
    const van = adapter.list("Asset").find((a) => a["company"] === C && a.name.startsWith(`${A}-V-AST-`) && Number(a["docstatus"]) === 1);
    if (van) put("Asset Repair", `${P}-REP-001`, { asset: van.name, asset_name: van["asset_name"], company: C, failure_date: addDays(T, -3), repair_status: "Pending", repair_cost: 4200, description: "تسريب في نظام التبريد — بانتظار قطعة الغيار.", cost_center: cc, docstatus: 0 });
    // a disposed asset: bought, then written off at its full book value (no depreciation booked)
    const old = `${P}-AST-002`, oldItem = `${P}-FA-PRINTER`, oldDate = addDays(T, -300), scrapDate = addDays(T, -20), cost = 7500;
    const pi2 = buy(2, oldItem, "طابعة ليزر قديمة", cost, oldDate);
    const je = `${P}-JV-SCRAP-01`;
    put("Journal Entry", je, { title: `Scrap of ${old}`, voucher_type: "Journal Entry", company: C, posting_date: scrapDate, accounts: jeRows([[acc("Fixed Assets"), 0, cost, { reference_type: "Asset", reference_name: old }], [acc("Gain/Loss on Asset Disposal"), cost, 0]]), total_debit: cost, total_credit: cost, docstatus: 1 }, true);
    put("Asset", old, { asset_name: "طابعة ليزر قديمة", item_code: oldItem, asset_category: cat, company: C, location: "الرياض", purchase_invoice: pi2, purchase_date: oldDate, available_for_use_date: oldDate, gross_purchase_amount: cost, purchase_amount: cost, net_purchase_amount: cost, value_after_depreciation: 0, calculate_depreciation: 0, disposal_date: scrapDate, journal_entry_for_scrap: je, cost_center: cc, status: "Scrapped", docstatus: 1 });
  }
}
