/**
 * Core demo data for the Run11.1 defined formulas (owner decision 2026-11-11: every placement shows a value on the demo
 * company): journal drafts to review / correct / locked, an on-account receipt, an invoice due this week, a tight
 * budget, an open quotation, customer credit limits, an unbilled delivery and its return, sales targets, competing
 * supplier quotations from one purchase request, a late partial receipt with rejected quantity, a draft supplier bill,
 * stock in transit, a pick list, a stock count, a reorder candidate, a projected shortage, a serial number out of
 * place, a draft asset and recurrent repairs.
 * Insert-if-missing with explicit names (Deleted Document tombstones honoured); master fields (credit limits, targets,
 * reorder levels) are only added to synthetic records that lack them; submitted vouchers are posted by posting.ts.
 */
import { demoCompany } from "./demoCompany";
import { adapter, type Doc } from "@/lib/adapter";
import { customerOutstanding } from "@/lib/selling";
import { refreshPrev } from "@/lib/posting";
import { CRM_USERS } from "@/lib/seedCrm";

type Rec = [string, string, Record<string, unknown>];
const isoDay = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (iso: string, k: number) => isoDay(new Date(Date.parse(`${iso}T00:00:00Z`) + k * 864e5));
const rows = (d: Doc | undefined, f = "items") => (Array.isArray(d?.[f]) ? (d![f] as Doc[]) : []);
const n = (v: unknown) => Number(v) || 0;
const first = (dt: string, C: string, pred: (d: Doc) => boolean = () => true) => adapter.list(dt).filter((d) => d["company"] === C && d["__synthetic"] && pred(d)).sort((a, b) => a.name.localeCompare(b.name))[0];

export function formulaRecords(today = isoDay(new Date())): { records: Rec[]; vouchers: [string, string][]; after: (() => Rec[])[] } {
  const co = demoCompany();
  if (!co) return { records: [], vouchers: [], after: [] };
  const C = co.name; const A = String(co["abbr"] ?? "") || "DDT"; const r: Rec[] = []; const v: [string, string][] = [];
  const acc = (pred: (a: Doc) => boolean) => adapter.list("Account").filter((a) => a["company"] === C && !n(a["is_group"]) && pred(a)).sort((a, b) => a.name.localeCompare(b.name))[0];
  const expense = acc((a) => a["root_type"] === "Expense" && !/cost of goods|depreciation/i.test(a.name));
  const bank = acc((a) => a["account_type"] === "Bank");
  const cash = acc((a) => a["account_type"] === "Cash") ?? bank;
  const recv = acc((a) => a["account_type"] === "Receivable");
  const cc = adapter.list("Cost Center").find((c) => c["company"] === C && !n(c["is_group"]));
  const fy = adapter.list("Fiscal Year").find((y) => String(y["year_start_date"]) <= today && String(y["year_end_date"]) >= today);
  const wh = adapter.list("Warehouse").filter((w) => w["company"] === C && !n(w["is_group"]) && w["warehouse_type"] !== "Transit").sort((a, b) => a.name.localeCompare(b.name))[0];
  const je = (name: string, date: string, lines: [string, number, number, Record<string, unknown>?][], remark: string, docstatus = 0) => {
    const dr = lines.reduce((t, l) => t + l[1], 0);
    r.push(["Journal Entry", name, { voucher_type: "Journal Entry", company: C, posting_date: date, docstatus, user_remark: remark, total_debit: dr, total_credit: lines.reduce((t, l) => t + l[2], 0),
      accounts: lines.map(([account, debit, credit, extra], i) => ({ idx: i + 1, account, debit, debit_in_account_currency: debit, credit, credit_in_account_currency: credit, cost_center: cc?.name ?? "", ...(extra ?? {}) })) }]);
    if (docstatus === 1) v.push(["Journal Entry", name]);
  };
  /* journal drafts: unbalanced, above the review amount, dated in a closed accounting period */
  if (expense && cash) {
    je(`${A}-JV-CORE-UNBAL`, addDays(today, -3), [[expense.name, 1200, 0], [cash.name, 0, 1000]], "Office supplies — credit line short by 200 (to correct)");
    je(`${A}-JV-CORE-REVIEW`, addDays(today, -2), [[expense.name, 75000, 0], [cash.name, 0, 75000]], "Annual software licences — above the journal review amount");
    const closed = adapter.list("Accounting Period").filter((p) => p["company"] === C && String(p["end_date"] ?? "") < today).sort((a, b) => String(a["end_date"]).localeCompare(String(b["end_date"]))).pop();
    if (closed) je(`${A}-JV-CORE-LOCKED`, addDays(String(closed["end_date"]), -4), [[expense.name, 3000, 0], [cash.name, 0, 3000]], "Late accrual dated inside a closed period");
  }
  /* an on-account customer receipt (unallocated) */
  const pe = first("Payment Entry", C, (p) => p["payment_type"] === "Receive" && n(p.docstatus) === 1);
  if (pe) {
    const amt = 5000;
    r.push(["Payment Entry", `${A}-PE-CORE-ONACC`, { ...pe, name: undefined, posting_date: addDays(today, -4), reference_no: `${A}-ONACC-1`, reference_date: addDays(today, -4), paid_amount: amt, received_amount: amt, base_paid_amount: amt, base_received_amount: amt, total_allocated_amount: 0, unallocated_amount: amt, difference_amount: 0, references: [], deductions: [], docstatus: 1, remarks: "Customer payment on account — to allocate" }]);
    v.push(["Payment Entry", `${A}-PE-CORE-ONACC`]);
  }
  /* a sales invoice due this week */
  const si = first("Sales Invoice", C, (d) => n(d.docstatus) === 1 && !n(d["is_return"]) && !rows(d).some((x) => x["delivery_note"]));
  if (si) {
    const date = addDays(today, -25);
    r.push(["Sales Invoice", `${A}-SINV-CORE-DUE7`, { ...si, name: undefined, posting_date: date, due_date: addDays(today, 5), creation: `${date}T09:00:00`, docstatus: 1, status: "Unpaid", outstanding_amount: si["grand_total"], payment_schedule: [], sales_team: si["sales_team"] ?? [], remarks: "Net 30 — due this week" }]);
    v.push(["Sales Invoice", `${A}-SINV-CORE-DUE7`]);
  }
  /* a tight budget (Warn) on the expense account that carries posted spend */
  if (fy) {
    const spent = new Map<string, number>();
    for (const g of adapter.list("GL Entry")) { if (g["company"] !== C || n(g["is_cancelled"]) || !g["cost_center"] || String(g["posting_date"]) < String(fy["year_start_date"]) || String(g["posting_date"]) > today) continue; const a = adapter.get("Account", String(g["account"])); if (a?.["root_type"] !== "Expense") continue; const k = `${g["account"]}|${g["cost_center"]}`; spent.set(k, (spent.get(k) ?? 0) + n(g["debit"]) - n(g["credit"])); }
    const top = [...spent].sort((a, b) => b[1] - a[1])[0];
    if (top && top[1] > 0) { const [account, center] = top[0].split("|") as [string, string]; r.push(["Budget", `${A}-BUDGET-CORE-TIGHT-${fy.name}`, { budget_against: "Cost Center", cost_center: center, company: C, fiscal_year: fy.name, docstatus: 1, applicable_on_booking_actual_expenses: 1, action_if_annual_budget_exceeded: "Warn", action_if_accumulated_monthly_budget_exceeded: "Ignore", accounts: [{ idx: 1, account, budget_amount: Math.max(100, Math.round(top[1] * 0.6 / 100) * 100) }] }]); }
  }
  /* a customer over its credit limit (own customer, so no other demo flow is held) */
  if (si) {
    const cust = `${A}-CUST-CORE-CREDIT`; const date = addDays(today, -40); const tot = 46000;
    r.push(["Customer", cust, { customer_name: "Najd Contracting Est.", customer_group: si["customer_group"] ?? adapter.get("Customer", String(si["customer"]))?.["customer_group"] ?? "Commercial", territory: si["territory"] ?? "Saudi Arabia", customer_type: "Company", disabled: 0, credit_limits: [{ idx: 1, company: C, credit_limit: 30000, bypass_credit_limit_check: 0 }] }]);
    r.push(["Sales Invoice", `${A}-SINV-CORE-CREDIT`, { ...si, name: undefined, customer: cust, customer_name: "Najd Contracting Est.", posting_date: date, due_date: addDays(date, 30), creation: `${date}T09:00:00`, docstatus: 1, status: "Overdue", payment_schedule: [], sales_team: [],
      items: rows(si).slice(0, 1).map((x) => ({ ...x, qty: 1, rate: 40000, amount: 40000, net_amount: 40000, base_net_amount: 40000, base_amount: 40000 })), total: 40000, net_total: 40000, base_net_total: 40000, total_taxes_and_charges: 6000, base_total_taxes_and_charges: 6000, grand_total: tot, base_grand_total: tot, rounded_total: tot, outstanding_amount: tot,
      taxes: rows(si, "taxes").slice(0, 1).map((t) => ({ ...t, tax_amount: 6000, base_tax_amount: 6000, total: tot })), remarks: "Site works — balance over the agreed credit limit" }]);
    v.push(["Sales Invoice", `${A}-SINV-CORE-CREDIT`]);
  }
  /* an open quotation still valid */
  const qt = first("Quotation", C, (d) => n(d.docstatus) === 1);
  if (qt) r.push(["Quotation", `${A}-QTN-CORE-OPEN`, { ...qt, name: undefined, transaction_date: addDays(today, -5), valid_till: addDays(today, 25), status: "Open", docstatus: 1, order_lost_reason: "", lost_reasons: [] }]);
  /* an unbilled delivery and a return against it */
  const dn = first("Delivery Note", C, (d) => n(d.docstatus) === 1 && !n(d["is_return"]));
  if (dn) {
    const row0 = rows(dn)[0] ?? ({} as Doc); const date = addDays(today, -6);
    const line = { ...row0, idx: 1, qty: 2, stock_qty: 2, amount: n(row0["rate"]) * 2, net_amount: n(row0["rate"]) * 2, base_net_amount: n(row0["rate"]) * 2, against_sales_order: "", so_detail: "", against_sales_invoice: "", si_detail: "" };
    const tot = n(row0["rate"]) * 2;
    r.push(["Delivery Note", `${A}-DN-CORE-UNBILLED`, { ...dn, name: undefined, posting_date: date, docstatus: 1, status: "To Bill", per_billed: 0, items: [line], total: tot, net_total: tot, base_net_total: tot, grand_total: tot, base_grand_total: tot, rounded_total: tot, taxes: [], total_taxes_and_charges: 0 }]);
    v.push(["Delivery Note", `${A}-DN-CORE-UNBILLED`]);
    r.push(["Delivery Note", `${A}-DN-CORE-RET`, { ...dn, name: undefined, posting_date: addDays(today, -1), docstatus: 1, is_return: 1, return_against: `${A}-DN-CORE-UNBILLED`, status: "Return Issued", per_billed: 0, items: [{ ...line, qty: -1, stock_qty: -1, amount: -n(row0["rate"]), net_amount: -n(row0["rate"]), base_net_amount: -n(row0["rate"]) }], total: -n(row0["rate"]), net_total: -n(row0["rate"]), base_net_total: -n(row0["rate"]), grand_total: -n(row0["rate"]), base_grand_total: -n(row0["rate"]), rounded_total: -n(row0["rate"]), taxes: [], total_taxes_and_charges: 0 }]);
    v.push(["Delivery Note", `${A}-DN-CORE-RET`]);
  }
  /* purchase request → two competing supplier quotations → order received late and partly, with rejected quantity */
  const po0 = first("Purchase Order", C, (d) => n(d.docstatus) === 1);
  const sq0 = first("Supplier Quotation", C, (d) => n(d.docstatus) !== 2) ?? undefined;
  const sups = adapter.list("Supplier").filter((s) => !n(s["disabled"])).sort((a, b) => a.name.localeCompare(b.name));
  if (po0 && sups.length >= 2) {
    const row0 = rows(po0)[0] ?? ({} as Doc); const item = String(row0["item_code"] ?? ""); const rate = n(row0["rate"]) || 100;
    const mr = `${A}-MR-CORE-PUR`; const po1 = `${A}-PO-CORE-0001`; const po2 = `${A}-PO-CORE-0002`; const pr1 = `${A}-PR-CORE-0001`;
    r.push(["Material Request", mr, { material_request_type: "Purchase", company: C, transaction_date: addDays(today, -30), schedule_date: addDays(today, 3), docstatus: 1, status: "Partially Ordered", per_ordered: 50,
      items: [{ idx: 1, name: `${mr}-1`, item_code: item, item_name: row0["item_name"] ?? item, qty: 20, stock_qty: 20, uom: row0["uom"] ?? "Nos", stock_uom: row0["stock_uom"] ?? "Nos", conversion_factor: 1, warehouse: row0["warehouse"] ?? wh?.name ?? "", schedule_date: addDays(today, 3), ordered_qty: 10 }] }]);
    if (sq0) [0, 1, 2].forEach((k) => {
      const nm = `${A}-SQ-CORE-${"ABC"[k]}`; const q = 20; const rt = rate * [1, 1.12, 1.05][k]!; const tot = +(q * rt).toFixed(2);
      r.push(["Supplier Quotation", nm, { ...sq0, name: undefined, supplier: sups[k % sups.length]!.name, supplier_name: sups[k % sups.length]!["supplier_name"] ?? sups[k % sups.length]!.name, transaction_date: addDays(today, -24 + k), valid_till: addDays(today, 20), docstatus: k === 2 ? 0 : 1, status: k === 2 ? "Draft" : "Submitted",
        items: [{ ...(rows(sq0)[0] ?? {}), idx: 1, name: `${nm}-1`, item_code: item, item_name: row0["item_name"] ?? item, qty: q, rate: rt, amount: tot, net_amount: tot, base_net_amount: tot, material_request: mr, material_request_item: `${mr}-1`, request_for_quotation: "" }], total: tot, net_total: tot, base_net_total: tot, grand_total: tot, base_grand_total: tot, rounded_total: tot, taxes: [], total_taxes_and_charges: 0 }]);
    });
    const poDoc = (nm: string, date: string, sched: string, qty: number, recv: number, sup: Doc) => {
      const tot = +(qty * rate).toFixed(2);
      return { ...po0, name: undefined, supplier: sup.name, supplier_name: sup["supplier_name"] ?? sup.name, transaction_date: date, schedule_date: sched, docstatus: 1, status: recv ? "To Receive and Bill" : "To Receive and Bill", per_received: recv ? Math.round((recv / qty) * 100) : 0, per_billed: 0,
        items: [{ ...row0, idx: 1, name: `${nm}-1`, item_code: item, qty, stock_qty: qty, received_qty: recv, billed_amt: 0, rate, amount: tot, net_amount: tot, base_net_amount: tot, schedule_date: sched, material_request: nm === po1 ? mr : "", material_request_item: nm === po1 ? `${mr}-1` : "" }],
        total: tot, net_total: tot, base_net_total: tot, grand_total: tot, base_grand_total: tot, rounded_total: tot, taxes: [], total_taxes_and_charges: 0, payment_schedule: [] };
    };
    r.push(["Purchase Order", po1, poDoc(po1, addDays(today, -20), addDays(today, -6), 10, 6, sups[0]!)]);
    r.push(["Purchase Order", po2, poDoc(po2, addDays(today, -5), addDays(today, 4), 8, 0, sups[1]!)]);
    const pr0 = first("Purchase Receipt", C, (d) => n(d.docstatus) === 1 && !n(d["is_return"]));
    if (pr0) {
      const tot = +(6 * rate).toFixed(2);
      r.push(["Purchase Receipt", pr1, { ...pr0, name: undefined, supplier: sups[0]!.name, supplier_name: sups[0]!["supplier_name"] ?? sups[0]!.name, posting_date: addDays(today, -2), docstatus: 1, status: "To Bill", per_billed: 0, is_return: 0,
        items: [{ ...(rows(pr0)[0] ?? {}), idx: 1, name: `${pr1}-1`, item_code: item, item_name: row0["item_name"] ?? item, qty: 6, stock_qty: 6, received_qty: 7, rejected_qty: 1, rate, amount: tot, net_amount: tot, base_net_amount: tot, warehouse: row0["warehouse"] ?? wh?.name ?? "", purchase_order: po1, purchase_order_item: `${po1}-1`, purchase_invoice: "", purchase_invoice_item: "" }],
        total: tot, net_total: tot, base_net_total: tot, grand_total: tot, base_grand_total: tot, rounded_total: tot, taxes: [], total_taxes_and_charges: 0 }]);
      v.push(["Purchase Receipt", pr1]);
    }
  }
  /* a draft supplier bill */
  const pi = first("Purchase Invoice", C, (d) => n(d.docstatus) === 1 && !n(d["is_return"]) && !n(d["update_stock"]));
  if (pi) r.push(["Purchase Invoice", `${A}-PINV-CORE-DRAFT`, { ...pi, name: undefined, posting_date: addDays(today, -1), bill_no: `${A}-BILL-DRAFT-1`, bill_date: addDays(today, -1), due_date: addDays(today, 29), docstatus: 0, status: "Draft", outstanding_amount: pi["grand_total"], payment_schedule: [] }]);
  /* stock in transit, a pick list, a stock count and a serial number out of place */
  if (wh) {
    const transit = `Goods In Transit - ${A}`;
    if (!adapter.get("Warehouse", transit)) r.push(["Warehouse", transit, { warehouse_name: "Goods In Transit", company: C, warehouse_type: "Transit", is_group: 0, parent_warehouse: wh["parent_warehouse"] ?? "" }]);
    r.push(["Stock Entry", `${A}-STE-CORE-TRANSIT`, { company: C, purpose: "Material Transfer", stock_entry_type: "Material Transfer", add_to_transit: 1, per_transferred: 0, posting_date: addDays(today, -9), posting_time: "10:00:00", docstatus: 1, from_warehouse: wh.name, to_warehouse: transit,
      items: [{ idx: 1, item_code: `${A}-CORE-BATCH`, qty: 2, transfer_qty: 2, conversion_factor: 1, uom: "Nos", stock_uom: "Nos", s_warehouse: wh.name, t_warehouse: transit, batch_no: `${A}-CB-001`, basic_rate: 40, valuation_rate: 40, amount: 80, basic_amount: 80 }], total_outgoing_value: 80, total_incoming_value: 80 }]);
    v.push(["Stock Entry", `${A}-STE-CORE-TRANSIT`]);
    r.push(["Item", `${A}-CORE-COUNT`, { item_code: `${A}-CORE-COUNT`, item_name: "Cable ties 300mm (counted)", barcodes: [{ idx: 1, barcode: "6281000100013", barcode_type: "EAN" }], item_group: String(adapter.list("Item").find((i) => i["item_group"])?.["item_group"] ?? "Products"), stock_uom: "Nos", is_stock_item: 1, valuation_rate: 50, disabled: 0 }]);
    r.push(["Stock Reconciliation", `${A}-SR-CORE-0001`, { company: C, purpose: "Stock Reconciliation", posting_date: addDays(today, -15), posting_time: "09:00:00", docstatus: 1, difference_amount: 500, expense_account: expense?.name ?? "",
      items: [{ idx: 1, item_code: `${A}-CORE-COUNT`, warehouse: wh.name, qty: 10, valuation_rate: 50, current_qty: 0, current_valuation_rate: 0, amount: 500, current_amount: 0, quantity_difference: 10, amount_difference: 500 }] }]);
    v.push(["Stock Reconciliation", `${A}-SR-CORE-0001`]);
    r.push(["Serial No", `${A}-CSN-004`, { serial_no: `${A}-CSN-004`, item_code: `${A}-CORE-SERIAL`, company: C, status: "Active", warehouse: "" }]);
  }
  const so = first("Sales Order", C, (d) => n(d.docstatus) === 1 && String(d["delivery_date"] ?? "") <= today && n(d["per_delivered"]) < 100) ?? first("Sales Order", C, (d) => n(d.docstatus) === 1);
  if (so) { const l = rows(so)[0] ?? ({} as Doc); r.push(["Pick List", `${A}-PICK-CORE-0001`, { company: C, purpose: "Delivery", customer: so["customer"], docstatus: 0, status: "Draft", locations: [{ idx: 1, item_code: l["item_code"], qty: n(l["qty"]) || 1, stock_qty: n(l["qty"]) || 1, warehouse: l["warehouse"] ?? wh?.name ?? "", sales_order: so.name, sales_order_item: l["name"] ?? "" }] }]); }
  /* two partly delivered sales orders (backorder decision: the first left for the user, the second decided in seedOps) */
  const so0 = first("Sales Order", C, (d) => n(d.docstatus) === 1 && d["status"] === "Completed");
  const dn0 = first("Delivery Note", C, (d) => n(d.docstatus) === 1 && !n(d["is_return"]));
  if (so0 && dn0) for (const [k, qty, del] of [[1, 10, 6], [2, 8, 6]] as const) {
    const l = rows(so0)[0] ?? ({} as Doc); const rate = n(l["rate"]) || 100; const nm = `${A}-SO-CORE-PART${k}`; const dnm = `${A}-DN-CORE-PART${k}`; const date = addDays(today, -12 - k);
    const tot = +(qty * rate).toFixed(2); const dtot = +(del * rate).toFixed(2);
    r.push(["Sales Order", nm, { ...so0, name: undefined, transaction_date: date, delivery_date: addDays(date, 7), docstatus: 1, status: "To Deliver and Bill", per_delivered: 0, per_billed: 0, billing_status: "Not Billed", delivery_status: "Partly Delivered",
      items: [{ ...l, idx: 1, name: `${nm}-1`, qty, stock_qty: qty, delivered_qty: 0, billed_amt: 0, rate, amount: tot, net_amount: tot, base_net_amount: tot, delivery_date: addDays(date, 7), prevdoc_docname: "", quotation_item: "" }],
      total: tot, net_total: tot, base_net_total: tot, grand_total: tot, base_grand_total: tot, rounded_total: tot, taxes: [], total_taxes_and_charges: 0, payment_schedule: [], sales_team: [] }]);
    v.push(["Sales Order", nm]);
    r.push(["Delivery Note", dnm, { ...dn0, name: undefined, customer: so0["customer"], customer_name: so0["customer_name"], posting_date: addDays(date, 5), docstatus: 1, status: "To Bill", per_billed: 0, is_return: 0, return_against: "",
      items: [{ ...(rows(dn0)[0] ?? {}), idx: 1, name: `${dnm}-1`, item_code: l["item_code"], item_name: l["item_name"], uom: l["uom"], stock_uom: l["stock_uom"], conversion_factor: 1, qty: del, stock_qty: del, rate, amount: dtot, net_amount: dtot, base_net_amount: dtot, warehouse: l["warehouse"] ?? wh?.name ?? "", against_sales_order: nm, so_detail: `${nm}-1`, against_sales_invoice: "", si_detail: "" }],
      total: dtot, net_total: dtot, base_net_total: dtot, grand_total: dtot, base_grand_total: dtot, rounded_total: dtot, taxes: [], total_taxes_and_charges: 0 }]);
    v.push(["Delivery Note", dnm]);
  }
  /* a draft asset and recurrent repairs */
  const asset = first("Asset", C, (a) => n(a.docstatus) === 1 && !!a["asset_category"]);
  if (asset) {
    r.push(["Asset", `${A}-AST-CORE-DRAFT`, { asset_name: "Warehouse racking (awaiting capitalisation)", item_code: asset["item_code"], asset_category: asset["asset_category"], company: C, location: asset["location"] ?? "", purchase_date: addDays(today, -3), available_for_use_date: addDays(today, 7), net_purchase_amount: 45000, purchase_amount: 45000, docstatus: 0, status: "Draft", calculate_depreciation: 0 }]);
    r.push(["Asset Repair", `${A}-AREP-CORE-0001`, { asset: asset.name, asset_name: asset["asset_name"], company: C, failure_date: `${addDays(today, -40)} 08:30:00`, completion_date: `${addDays(today, -36)} 16:00:00`, repair_status: "Completed", repair_cost: 3500, description: "Hydraulic pump replaced", docstatus: 1 }]);
    r.push(["Asset Repair", `${A}-AREP-CORE-0002`, { asset: asset.name, asset_name: asset["asset_name"], company: C, failure_date: `${addDays(today, -10)} 11:00:00`, repair_status: "Pending", repair_cost: 2800, description: "Same pump leaking again", docstatus: 0 }]);
  }
  /* after posting: balances (Bin) for the Core stock items rebuilt from their posted ledger rows */
  const after = [() => coreBins(C, A, wh?.name ?? ""), () => { for (const k of [1, 2]) if (adapter.get("Sales Order", `${A}-SO-CORE-PART${k}`)) refreshPrev("Sales Order", `${A}-SO-CORE-PART${k}`); return [] as Rec[]; }];
  return { records: r, vouchers: v, after };
}

/** Bin rows for the Core demo items = their posted stock ledger (actual qty, value); one shortage via reserved quantity. */
function coreBins(C: string, A: string, wh: string): Rec[] {
  const out: Rec[] = [];
  const sle = adapter.list("Stock Ledger Entry").filter((s) => s["company"] === C && !n(s["is_cancelled"]) && String(s["item_code"] ?? "").startsWith(`${A}-CORE-`));
  const m = new Map<string, { item: string; wh: string; qty: number; value: number }>();
  for (const s of sle) { const k = `${s["item_code"]}|${s["warehouse"]}`; const x = m.get(k) ?? { item: String(s["item_code"]), wh: String(s["warehouse"]), qty: 0, value: 0 }; x.qty += n(s["actual_qty"]); x.value += n(s["stock_value_difference"]); m.set(k, x); }
  for (const x of m.values()) {
    if (adapter.list("Bin").some((b) => b["item_code"] === x.item && b["warehouse"] === x.wh)) continue;
    const reserved = x.item === `${A}-CORE-BATCH` && x.wh === wh ? Math.max(0, x.qty) + 6 : 0;
    out.push(["Bin", `${A}-BIN-${x.item.slice(A.length + 1)}-${x.wh.replace(/[^A-Za-z0-9]+/g, "").slice(0, 16)}`, { item_code: x.item, warehouse: x.wh, actual_qty: +x.qty.toFixed(3), reserved_qty: reserved, ordered_qty: 0, projected_qty: +(x.qty - reserved).toFixed(3), stock_value: +x.value.toFixed(2), valuation_rate: x.qty ? +(x.value / x.qty).toFixed(2) : 0 }]);
  }
  return out;
}

/** Master fields the formulas read, added only to synthetic records that lack them: credit limits, sales targets, reorder levels. */
export function formulaMasters(today = isoDay(new Date())): void {
  const co = demoCompany(); if (!co) return;
  const C = co.name; const A = String(co["abbr"] ?? "") || "DDT";
  // healthy credit limits (above current exposure, so no demo order is held) on the two largest synthetic customers
  const custs = adapter.list("Customer").filter((c) => c["__synthetic"] && !String(c.name).includes("-CORE-") && !(rows(c, "credit_limits").length)).map((c) => ({ c, exp: customerOutstanding(c.name, C) })).sort((a, b) => b.exp - a.exp).slice(0, 2);
  custs.forEach(({ c, exp }, i) => { const limit = Math.max(50000, Math.round((exp * [1.15, 3][i]!) / 1000) * 1000); adapter.insertDocQuiet("Customer", { ...c, credit_limits: [{ idx: 1, company: C, credit_limit: limit, bypass_credit_limit_check: 0 }] }); });
  const fy = adapter.list("Fiscal Year").find((y) => String(y["year_start_date"]) <= today && String(y["year_end_date"]) >= today);
  // CRM C4 E-02 (owner 2026-11-17): yearly targets in scale with the sample sales (attainment 60–120 %), spread evenly
  // over the months through one Monthly Distribution; targets still on the first sample amounts move once (marker
  // __target_v2), a target the user set is never replaced. Pro target-vs-actual reads the same Sales Person rows.
  const TARGETS = [14000000, 9000000, 11000000, 10500000, 16000000], OLD = [400000, 300000, 250000], DIST = "DIGIT Equal Monthly";
  if (!adapter.get("Monthly Distribution", DIST)) adapter.insertDocQuiet("Monthly Distribution", { name: DIST, distribution_id: DIST, __synthetic: 1,
    percentages: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"].map((month, k) => ({ idx: k + 1, month, percentage_allocation: k === 11 ? 8.37 : 8.33 })) });
  if (fy) adapter.list("Sales Person").filter((p) => !n(p["is_group"])).sort((a, b) => a.name.localeCompare(b.name)).forEach((p, i) => {
    const ts = rows(p, "targets");
    if (!ts.length) adapter.insertDocQuiet("Sales Person", { ...p, targets: [{ idx: 1, fiscal_year: fy.name, target_amount: TARGETS[i % 5], distribution_id: DIST }], __target_v2: 1 });
    else if (ts.length === 1 && ts[0]!["fiscal_year"] === fy.name && n(ts[0]!["target_amount"]) === OLD[i % 3] && !ts[0]!["distribution_id"]) adapter.insertDocQuiet("Sales Person", { ...p, targets: [{ ...ts[0]!, target_amount: TARGETS[i % 5], distribution_id: DIST }], __target_v2: 1 });
  });
  linkCrmSalespeople();
  linkSeedEmployeeUsers();
  const serial = adapter.get("Item", `${A}-CORE-SERIAL`);
  const bin = adapter.list("Bin").find((b) => b["item_code"] === `${A}-CORE-SERIAL`);
  if (serial && bin && !(rows(serial, "reorder_levels").length)) adapter.insertDocQuiet("Item", { ...serial, reorder_levels: [{ idx: 1, warehouse: bin["warehouse"], warehouse_reorder_level: 10, warehouse_reorder_qty: 20, material_request_type: "Purchase" }] });
}

/** Owner 2026-11-17 (CRM C-03): the CRM demo users are the first salespeople — the native Sales Person.employee →
 *  Employee.user_id link every target, attainment and team card reads. Set once (marker); an employee that already has a
 *  login, or a user already linked elsewhere, is left alone. */
export function linkCrmSalespeople(): void {
  // by name, so the pairing never depends on save timestamps (same order as the target seeding above)
  adapter.list("Sales Person").filter((p) => !n(p["is_group"]) && p["employee"]).sort((a, b) => a.name.localeCompare(b.name)).slice(0, CRM_USERS.length).forEach((p, i) => {
    const u = CRM_USERS[i]![0]; const emp = adapter.get("Employee", String(p["employee"]));
    if (!emp || emp["user_id"] || emp["__crm_user_v1"] || adapter.list("Employee").some((e) => e["user_id"] === u)) return;
    adapter.insertDocQuiet("Employee", { ...emp, user_id: u, __crm_user_v1: 1 });
  });
}

/** Owner 2026-11-18 (HR-02 «user accounts linked for employees»): every active synthetic employee of the trading and
 *  service companies gets its self-service user (role Employee) through the native Employee.user_id link — set once
 *  (marker __seed_user_v1), never on an employee that already has a login or on a salesperson (linkCrmSalespeople owns
 *  those). Construction crews stay without an automatic Desk user (owner rule DEC-015). */
export function linkSeedEmployeeUsers(): void {
  const cos = new Set(adapter.list("Company").filter((c) => !/^(DCC|DCE)$/.test(String(c["abbr"] ?? ""))).map((c) => c.name));
  const sales = new Set(adapter.list("Sales Person").map((p) => String(p["employee"] ?? "")).filter(Boolean));
  const taken = new Set(adapter.list("Employee").map((e) => String(e["user_id"] ?? "")).filter(Boolean));
  for (const e of adapter.list("Employee")) {
    if (!e["__synthetic"] || e["__sample"] || e["user_id"] || e["__seed_user_v1"] || e["status"] !== "Active" || !cos.has(String(e["company"])) || sales.has(e.name)) continue;
    const mail = String(e["company_email"] || `${String(e["first_name"] ?? "user").toLowerCase().replace(/[^a-z]+/g, "")}.${e.name.toLowerCase()}@synthetic.example.test`);
    if (taken.has(mail)) continue; taken.add(mail);
    if (!adapter.get("User", mail)) adapter.insertDocQuiet("User", { name: mail, email: mail, first_name: e["first_name"], last_name: e["last_name"], full_name: e["employee_name"], enabled: 1, user_type: "System User", language: "ar", roles: [{ idx: 1, role: "Employee" }], __synthetic: 1 });
    adapter.insertDocQuiet("Employee", { ...e, user_id: mail, __seed_user_v1: 1 });
  }
}
