/**
 * Core demo data for the shared finance and operations screens (owner decision 2026-11-11: realistic demo data in this
 * version): a customer↔supplier party link for netting, promises to pay (one open, one broken), a draft supplier payment
 * run, two statement layouts, recurring schedules (one due), a scheduled customer statement, branches, approval
 * templates, procurement policies with their restricted item groups and catalog prices, scan sessions, dock
 * appointments and a signed customer quotation. Insert-if-missing with explicit names (called from seed.ts coreRecords).
 */
import { adapter, type Doc } from "@/lib/adapter";
import { CORE_DT } from "./doctypes";

type Rec = [string, string, Record<string, unknown>];
const s = (v: unknown) => String(v ?? "");
const n = (v: unknown) => Number(v) || 0;
const isoDay = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (iso: string, k: number) => isoDay(new Date(Date.parse(`${iso}T00:00:00Z`) + k * 864e5));
const rows = (d: Doc | undefined, f = "items") => (Array.isArray(d?.[f]) ? (d![f] as Doc[]) : []);

export function opsRecords(C: string, A: string, today: string): Rec[] {
  const r: Rec[] = [];
  const sub = (dt: string) => adapter.list(dt).filter((d) => d["company"] === C && n(d.docstatus) === 1 && !n(d["is_return"])).sort((a, b) => a.name.localeCompare(b.name));
  const disputed = new Set(adapter.list(CORE_DT.dispute).filter((d) => d["status"] === "Open" || d["status"] === "Under Review").map((d) => s(d["invoice"])));
  const openSi = sub("Sales Invoice").filter((d) => n(d["outstanding_amount"]) > 0 && !disputed.has(d.name) && !s(d.name).includes("-CORE-"));
  const overdueSi = openSi.filter((d) => (s(d["due_date"]) || s(d["posting_date"])) < today);
  const openPi = sub("Purchase Invoice").filter((d) => n(d["outstanding_amount"]) > 0 && !disputed.has(d.name));
  const wh = adapter.list("Warehouse").filter((w) => w["company"] === C && !n(w["is_group"]) && w["warehouse_type"] !== "Transit").sort((a, b) => a.name.localeCompare(b.name));
  const main = wh.find((w) => /riyadh/i.test(w.name)) ?? wh[0];
  /* warehouse capacity (units) for the utilisation figure; native Warehouse carries none */
  wh.slice(0, 6).forEach((w, i) => r.push([CORE_DT.warehouseCapacity, `${A}-WCAP-${String(i + 1).padStart(2, "0")}`, { company: C, warehouse: w.name, capacity_qty: [1200, 800, 600, 500, 400, 300][i], alert_pct: 85, note: "Racking capacity from the site survey" }]));
  /* e-mail templates for the shared composer (global; the same explicit names for every company, so inserted once) */
  r.push(["Email Template", "تذكير سداد فاتورة مبيعات", { reference_doctype: "Sales Invoice", use_html: 0, subject: "تذكير بسداد الفاتورة {{ doc.name }}",
    response: "السادة {{ doc.customer_name }}،\n\nنود تذكيركم بأن الفاتورة {{ doc.name }} بمبلغ {{ doc.grand_total }} {{ doc.currency }} مستحقة السداد بتاريخ {{ doc.due_date }}، والرصيد المتبقي {{ doc.outstanding_amount }}.\n\nمع خالص الشكر،\n{{ doc.company }}" }]);
  r.push(["Email Template", "Sales Invoice Payment Reminder (EN)", { reference_doctype: "Sales Invoice", use_html: 0, subject: "Payment reminder: invoice {{ doc.name }}",
    response: "Dear {{ doc.customer_name }},\n\nThis is a reminder that invoice {{ doc.name }} for {{ doc.grand_total }} {{ doc.currency }} is due on {{ doc.due_date }}. The outstanding balance is {{ doc.outstanding_amount }}.\n\nKind regards,\n{{ doc.company }}" }]);
  r.push(["Email Template", "إرسال عرض سعر للعميل", { reference_doctype: "Quotation", use_html: 0, subject: "عرض السعر {{ doc.name }} من {{ doc.company }}",
    response: "السادة {{ doc.customer_name }}،\n\nيسعدنا أن نرفق لكم عرض السعر {{ doc.name }} بإجمالي {{ doc.grand_total }} {{ doc.currency }}، وهو صالح حتى {{ doc.valid_till }}.\n\nنتطلع لخدمتكم،\n{{ doc.company }}" }]);
  r.push(["Email Template", "إرسال أمر شراء للمورد", { reference_doctype: "Purchase Order", use_html: 0, subject: "أمر الشراء {{ doc.name }}",
    response: "السادة {{ doc.supplier_name }}،\n\nنرفق لكم أمر الشراء {{ doc.name }} بإجمالي {{ doc.grand_total }} {{ doc.currency }}، والمطلوب توريده بتاريخ {{ doc.schedule_date }}.\n\nمع التحية،\n{{ doc.company }}" }]);
  const sups = adapter.list("Supplier").filter((x) => !n(x["disabled"])).sort((a, b) => a.name.localeCompare(b.name));

  /* netting: the customer and supplier are the same trading partner (native Party Link) */
  const cu = openSi.find((d) => !overdueSi.slice(0, 3).includes(d)) ?? openSi[0]; const sp = openPi.find((d) => !/CORE/.test(d.name)) ?? openPi[0];
  if (cu && sp) r.push(["Party Link", `${A}-PLINK-0001`, { primary_role: "Customer", primary_party: s(cu["customer"]), secondary_role: "Supplier", secondary_party: s(sp["supplier"]) }]);
  /* promises to pay: one open (future date), one broken (date passed, nothing paid) */
  const [p1, p2] = overdueSi.filter((d) => d !== cu);
  if (p1) r.push([CORE_DT.paymentPromise, `${A}-PTP-0001`, { company: C, customer: s(p1["customer"]), invoice: p1.name, promised_date: addDays(today, 6), amount: Math.round(n(p1["outstanding_amount"]) * 50) / 100, outstanding_at_promise: n(p1["outstanding_amount"]), status: "Open", recorded_by: "Administrator", note: "Customer's finance confirmed half by transfer next week" }]);
  if (p2) r.push([CORE_DT.paymentPromise, `${A}-PTP-0002`, { company: C, customer: s(p2["customer"]), invoice: p2.name, promised_date: addDays(today, -9), amount: n(p2["outstanding_amount"]), outstanding_at_promise: n(p2["outstanding_amount"]), status: "Broken", recorded_by: "Administrator", note: "Promised full payment at month end" }]);
  /* a draft payment run prepared by the accounts user (awaits a manager's approval) */
  const runPis = openPi.filter((d) => (s(d["due_date"]) || s(d["posting_date"])) <= addDays(today, 30)).slice(0, 3);
  if (runPis.length) r.push([CORE_DT.paymentRun, `${A}-PRUN-0001`, { company: C, run_date: today, pay_until: addDays(today, 30), status: "Draft", prepared_by: "accounts.user@digit.test",
    total: Math.round(runPis.reduce((t, d) => t + n(d["outstanding_amount"]), 0) * 100) / 100,
    lines: runPis.map((d, i) => ({ idx: i + 1, purchase_invoice: d.name, supplier: s(d["supplier"]), due_date: s(d["due_date"]) || s(d["posting_date"]), amount: n(d["outstanding_amount"]), hold_reason: "" })) }]);
  /* statement layouts */
  r.push([CORE_DT.statementLayout, "Management P&L", { layout_name: "Management P&L", layout_name_ar: "قائمة الدخل الإدارية", basis: "Period movement", columns: "Current | Prior period | Change", rows: [
    { idx: 1, label: "Revenue", label_ar: "الإيرادات", row_type: "Accounts", root_type: "Income", sign: "Natural", bold: 0 },
    { idx: 2, label: "Cost of sales", label_ar: "تكلفة المبيعات", row_type: "Accounts", root_type: "Expense", account_prefix: "Cost of Goods", sign: "Natural", bold: 0 },
    { idx: 3, label: "Gross profit", label_ar: "مجمل الربح", row_type: "Total", sum_rows: "Revenue,-Cost of sales", bold: 1 },
    { idx: 4, label: "Operating expenses", label_ar: "المصروفات التشغيلية", row_type: "Accounts", root_type: "Expense", sign: "Natural", bold: 0 },
    { idx: 5, label: "Net profit", label_ar: "صافي الربح", row_type: "Total", sum_rows: "Revenue,-Operating expenses", bold: 1 } ] }]);
  r.push([CORE_DT.statementLayout, "Balance sheet summary", { layout_name: "Balance sheet summary", layout_name_ar: "ملخص المركز المالي", basis: "Balance as of date", columns: "Current | Prior year | Change", rows: [
    { idx: 1, label: "Assets", label_ar: "الأصول", row_type: "Accounts", root_type: "Asset", sign: "Natural", bold: 1 },
    { idx: 2, label: "Liabilities", label_ar: "الالتزامات", row_type: "Accounts", root_type: "Liability", sign: "Natural", bold: 0 },
    { idx: 3, label: "Equity", label_ar: "حقوق الملكية", row_type: "Accounts", root_type: "Equity", sign: "Natural", bold: 0 },
    { idx: 4, label: "Liabilities and equity", label_ar: "الالتزامات وحقوق الملكية", row_type: "Total", sum_rows: "Liabilities,Equity", bold: 1 } ] }]);
  /* recurring: a monthly rent journal (due), a monthly order for a contract customer (next month) */
  const je = adapter.list("Journal Entry").filter((j) => j["company"] === C && n(j.docstatus) === 1 && j["__synthetic"] && rows(j, "accounts").length >= 2 && !rows(j, "accounts").some((a) => s(a["reference_type"]))).sort((a, b) => a.name.localeCompare(b.name))[0];
  if (je) r.push(["Auto Repeat", `${A}-AREP-JV-RENT`, { reference_doctype: "Journal Entry", reference_document: je.name, frequency: "Monthly", start_date: addDays(today, -32), next_schedule_date: addDays(today, -2), end_date: addDays(today, 330), submit_on_creation: 0, status: "Active", disabled: 0, notify_by_email: 0 }]);
  const so = adapter.list("Sales Order").filter((d) => d["company"] === C && n(d.docstatus) === 1 && d["status"] === "Completed").sort((a, b) => a.name.localeCompare(b.name))[0];
  if (so) r.push(["Auto Repeat", `${A}-AREP-SO-CONTRACT`, { reference_doctype: "Sales Order", reference_document: so.name, frequency: "Monthly", start_date: addDays(today, -12), next_schedule_date: addDays(today, 18), end_date: addDays(today, 350), submit_on_creation: 0, status: "Active", disabled: 0, notify_by_email: 0 }]);
  /* scheduled customer statements (native Process Statement Of Accounts with auto e-mail) */
  const custs = [...new Set(overdueSi.map((d) => s(d["customer"])))].slice(0, 2);
  if (custs.length) r.push(["Process Statement Of Accounts", `${A}-PSOA-MONTHLY`, { report: "General Ledger", company: C, from_date: addDays(today, -30), to_date: today, posting_date: today, enable_auto_email: 1, frequency: "Monthly", start_date: addDays(today, -1), filter_duration: 1, pdf_name: "Statement of account",
    customers: custs.map((c, i) => ({ idx: i + 1, customer: c, customer_name: s(adapter.get("Customer", c)?.["customer_name"]), billing_email: `accounts+${c.toLowerCase()}@customer.example` })) }]);

  /* branches + approval templates (amount / branch / category) */
  for (const [b, ar] of [["Riyadh HQ", "المركز الرئيسي - الرياض"], ["Jeddah Branch", "فرع جدة"]] as const) r.push(["Branch", b, { branch: b, digit_branch_ar: ar }]);
  // Arabic-first sample names (seedNamesAr rule); the English name stays as the alternate __name_en
  const tpl = (id: string, name: string, nameEn: string, dt: string, min: number, max: number, steps: string[], extra: Record<string, unknown> = {}) => r.push([CORE_DT.approvalTemplate, `${A}-APT-${id}`, { template_name: name, __name_en: nameEn, document_type: dt, company: C, min_amount: min, max_amount: max, step_1_role: steps[0] ?? "", step_2_role: steps[1] ?? "", step_3_role: steps[2] ?? "", enabled: 1, priority: 10, ...extra }]);
  tpl("PO-SMALL", "أوامر الشراء حتى 50,000", "Purchase orders up to 50,000", "Purchase Order", 0, 50000, ["Purchase Manager"]);
  tpl("PO-LARGE", "أوامر الشراء فوق 50,000", "Purchase orders above 50,000", "Purchase Order", 50000.01, 0, ["Purchase Manager", "Accounts Manager", "System Manager"]);
  tpl("PO-JED", "مشتريات فرع جدة", "Jeddah branch purchases", "Purchase Order", 0, 0, ["Purchase Manager", "Accounts Manager"], { branch: "Jeddah Branch", priority: 5 });
  tpl("PO-EQUIP", "مشتريات المعدات", "Equipment purchases", "Purchase Order", 0, 0, ["Purchase Manager", "Accounts Manager"], { category: "Equipment", priority: 6 });
  tpl("JV-REVIEW", "القيود فوق 50,000", "Journals above 50,000", "Journal Entry", 50000, 0, ["Accounts Manager"]);
  tpl("SO-LARGE", "أوامر البيع فوق 250,000", "Sales orders above 250,000", "Sales Order", 250000, 0, ["Sales Manager", "Accounts Manager"]);
  /* procurement policies: restricted chemicals blocked, office furniture from the framework supplier at catalog prices */
  r.push(["Item Group", "Restricted Chemicals", { item_group_name: "Restricted Chemicals", parent_item_group: "All Item Groups", is_group: 0 }]);
  r.push(["Item Group", "Office Furniture", { item_group_name: "Office Furniture", parent_item_group: "All Item Groups", is_group: 0 }]);
  r.push(["Item", `${A}-CORE-CHEM`, { item_code: `${A}-CORE-CHEM`, item_name: "مذيب صناعي 20 لتر (مقيّد)", item_group: "Restricted Chemicals", stock_uom: "Nos", is_stock_item: 1, valuation_rate: 210, standard_rate: 210, disabled: 0, barcodes: [{ idx: 1, barcode: "6281000100020", barcode_type: "EAN" }] }]);
  r.push(["Item", `${A}-CORE-DESK`, { item_code: `${A}-CORE-DESK`, item_name: "مكتب إداري 160 سم (كتالوج الاتفاقية)", item_group: "Office Furniture", stock_uom: "Nos", is_stock_item: 1, valuation_rate: 950, standard_rate: 950, disabled: 0, barcodes: [{ idx: 1, barcode: "6281000100037", barcode_type: "EAN" }] }]);
  r.push(["Item Price", `${A}-IP-CORE-DESK-BUY`, { item_code: `${A}-CORE-DESK`, item_name: "مكتب إداري 160 سم (كتالوج الاتفاقية)", price_list: "Standard Buying", price_list_rate: 950, currency: "SAR", buying: 1, selling: 0, uom: "Nos" }]);
  r.push([CORE_DT.procurementPolicy, `${A}-PPOL-CHEM`, { policy_name: "المواد الكيميائية المقيّدة", company: C, item_group: "Restricted Chemicals", rule: "Blocked", enabled: 1, reason: "تتطلب تصريح السلامة — يُطلب عبر مسؤول السلامة" }]);
  if (sups[0]) r.push([CORE_DT.procurementPolicy, `${A}-PPOL-FURN`, { policy_name: "اتفاقية الأثاث المكتبي", company: C, item_group: "Office Furniture", rule: "Preferred supplier only", supplier: sups[0].name, price_list: "Standard Buying", max_amount: 20000, enabled: 1, reason: "اتفاقية إطارية 2026" }]);
  r.push([CORE_DT.procurementPolicy, `${A}-PPOL-EQUIP`, { policy_name: "المعدات فوق 100,000 للسطر", company: C, item_group: "Equipment", rule: "Allowed", max_amount: 100000, enabled: 1, reason: "المعدات الأكبر تمر عبر طلب رأسمالي" }]);
  /* backorder: one decision already taken on the second partial order (the first is left for the user) */
  r.push([CORE_DT.backorderDecision, `${A}-BOD-0001`, { company: C, sales_order: `${A}-SO-CORE-PART2`, delivery_note: `${A}-DN-CORE-PART2`, decision: "Close the remainder", remaining_qty: 2, decided_by: "Administrator", decided_on: addDays(today, -1), reason: "ألغى العميل الكمية المتبقية — توقف الصنف" }]);
  /* scan sessions: a completed receipt against the late order, an open cycle count */
  if (main) {
    const po = adapter.get("Purchase Order", `${A}-PO-CORE-0001`); const pl = rows(po)[0];
    if (po && pl) r.push([CORE_DT.scanSession, `${A}-SCAN-0001`, { mode: "Receive", company: C, warehouse: s(pl["warehouse"]) || main.name, reference_doctype: "Purchase Order", reference_name: po.name, status: "Completed", result_doctype: "Purchase Receipt", result_name: `${A}-PR-CORE-0001`, scanned_by: "Administrator",
      lines: [{ idx: 1, barcode: s(pl["item_code"]), item_code: s(pl["item_code"]), qty: 6, warehouse: s(pl["warehouse"]) || main.name, lpn: "LPN-000184" }] }]);
    r.push([CORE_DT.scanSession, `${A}-SCAN-0002`, { mode: "Count", company: C, warehouse: main.name, status: "Open", scanned_by: "Administrator",
      lines: [{ idx: 1, barcode: "6281000100013", item_code: `${A}-CORE-COUNT`, qty: 9, warehouse: main.name }] }]);
    /* dock appointments for today and tomorrow */
    const dn = adapter.list("Delivery Note").filter((d) => d["company"] === C && n(d.docstatus) === 1).sort((a, b) => a.name.localeCompare(b.name))[0];
    const appt = (k: number, dock: string, dir: "Inbound" | "Outbound", day: number, from: string, to: string, carrier: string, status: string, ref?: [string, string], cross = 0) => r.push([CORE_DT.dockAppointment, `${A}-DOCK-${String(k).padStart(3, "0")}`, { company: C, warehouse: main.name, dock, direction: dir, slot_start: `${addDays(today, day)} ${from}:00`, slot_end: `${addDays(today, day)} ${to}:00`, carrier, reference_doctype: ref?.[0] ?? "", reference_name: ref?.[1] ?? "", status, cross_dock: cross }]);
    appt(1, "Door 1", "Inbound", 0, "08:00", "09:00", "Al-Rajhi Transport", "Arrived", ["Purchase Order", `${A}-PO-CORE-0002`]);
    appt(2, "Door 1", "Inbound", 0, "10:30", "11:30", "SMSA Freight", "Booked", ["Purchase Order", `${A}-PO-CORE-0001`], 1);
    if (dn) appt(3, "Door 2", "Outbound", 0, "13:00", "14:00", "Aramex", "Booked", ["Delivery Note", dn.name]);
    appt(4, "Door 3", "Inbound", -1, "15:00", "16:00", "Naqel Express", "Missed");
    appt(5, "Door 2", "Inbound", 1, "09:00", "10:00", "Zajil", "Booked");
  }
  /* customer acceptance: a second open quotation signed online with a 20% prepayment, not yet converted */
  const qt = adapter.get("Quotation", `${A}-QTN-CORE-OPEN`);
  if (qt) {
    r.push(["Quotation", `${A}-QTN-CORE-SIGNED`, { ...qt, name: undefined, transaction_date: addDays(today, -3), valid_till: addDays(today, 27), status: "Open", docstatus: 1 }]);
    r.push([CORE_DT.quoteAcceptance, `${A}-QACC-0001`, { quotation: `${A}-QTN-CORE-SIGNED`, company: C, signer_name: "Eng. Khalid Al-Otaibi", signed_on: `${addDays(today, -1)} 16:42:10`, signature: "typed:Khalid Al-Otaibi", prepay_pct: 20, status: "Signed" }]);
  }
  /* Part B receiving controls: putaway rules (main store first, then an overflow store) and one receipt waiting for its landed costs */
  const overflow = wh.find((w) => w.name !== main?.name);
  const mainSle = main ? adapter.list("Stock Ledger Entry").filter((x) => !n(x["is_cancelled"]) && x["warehouse"] === main.name) : [];
  const stocked = [...new Set(mainSle.map((x) => s(x["item_code"])))].filter((i) => !n(adapter.get("Item", i)?.["has_serial_no"]) && !n(adapter.get("Item", i)?.["has_batch_no"])).sort().slice(0, 2);
  if (main && overflow) stocked.forEach((item, i) => {
    const it = adapter.get("Item", item); const uom = s(it?.["stock_uom"]) || "Nos"; const bal = Math.max(0, Math.round(mainSle.filter((x) => x["item_code"] === item).reduce((t, x) => t + n(x["actual_qty"]), 0)));
    const base = { item_code: item, item_name: s(it?.["item_name"]), company: C, uom, stock_uom: uom, conversion_factor: 1, disable: 0 };
    r.push(["Putaway Rule", `${A}-PUT-${String(i * 2 + 1).padStart(2, "0")}`, { ...base, warehouse: main.name, priority: 1, capacity: bal + 40, stock_capacity: bal + 40 }]);
    r.push(["Putaway Rule", `${A}-PUT-${String(i * 2 + 2).padStart(2, "0")}`, { ...base, warehouse: overflow.name, priority: 2, capacity: 500, stock_capacity: 500 }]);
  });
  const lastPr = sub("Purchase Receipt").slice(-1)[0];
  if (lastPr) r.push([CORE_DT.landedCostExpect, `${A}-LCX-0001`, { receipt_type: "Purchase Receipt", receipt: lastPr.name, company: C, supplier: lastPr["supplier"], expected_amount: 1850, status: "Expected", recorded_by: "Administrator", note: "شحن وتخليص جمركي متوقع من وكيل الشحن" }]);
  return r;
}
