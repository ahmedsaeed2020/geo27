import { seedCore } from "@/lib/coreShared/seed";
import { isCrmDoctype, resetCrmOnce } from "@/lib/crmReset";
import { isServerHosted } from "@/lib/serverHost";
import { applyDemoRenames, resetRefIndex, resolveName, wasRenamed } from "./rename";
import { arabizeSeed } from "@/lib/seedNamesAr";
import "./naming"; // registers make_autoname on the adapter (new records follow DocType / manifest autoname)
import "./assets"; // registers asset controller hooks (Asset Value Adjustment on_submit/on_cancel)
import "./assetDocs";
import "./stockEntryRows"; // Stock Entry row validate (validate_item / validate_qty_is_not_zero + check_mandatory for Item Code)
import "./dimensions"; // Accounting Dimension hooks
import "./deferred"; // Process Deferred Accounting controller
import "./reconciliation"; // Bank Transaction controller hook
/**
 * Coherent synthetic ERPNext masters and transactions. All values are clearly
 * synthetic. Inserts only records that are missing — never overwrites or resets.
 * References use explicit document names (e.g. customer: "SYN-CUST-001").
 */
import { seedExchangeDemo } from "./coreShared/exchangeDiff";
import { postAll } from "./posting";
import { adapter } from "./adapter";
import { deletedIndex, deletedKey } from "./deletedDocs";
import { resolveDefaultCompany } from "./sessionDefaults";

const COMPANY = "Digit Synthetic Co";
const ABBR = "DSC";
const WH = `Stores - ${ABBR}`;
const FG = `Finished Goods - ${ABBR}`;

type Rec = [doctype: string, name: string, data: Record<string, unknown>];
const items = [
  ["SYN-ITEM-001", "Steel Bracket", 45],
  ["SYN-ITEM-002", "Copper Cable 10m", 120],
  ["SYN-ITEM-003", "Control Panel", 980],
  ["SYN-ITEM-004", "Installation Service", 300],
] as const;
const rows = (pairs: [number, number][], extra: (i: number) => Record<string, unknown>) =>
  pairs.map(([it, qty], i) => {
    const [code, name, rate] = items[it]!;
    return { idx: i + 1, item_code: code, item_name: name, qty, rate, amount: qty * rate, uom: "Nos", stock_uom: "Nos", conversion_factor: 1, ...extra(i) };
  });
const total = (r: { amount: number }[]) => r.reduce((s, x) => s + x.amount, 0);
/** Date k days from today, for seeded records whose state depends on today (pending requests). */
const relDay = (k: number) => new Date(Date.now() + k * 864e5).toISOString().slice(0, 10);

function records(): Rec[] {
  const so1 = rows([[0, 10], [2, 2]], () => ({ warehouse: WH, delivery_date: "2026-11-15" }));
  const so2 = rows([[1, 5], [3, 1]], () => ({ warehouse: WH, delivery_date: "2026-11-30" }));
  const po1 = rows([[0, 100], [1, 20]], () => ({ warehouse: WH, schedule_date: "2026-11-05" }));
  const si1 = rows([[0, 10]], () => ({ warehouse: WH }));
  return [
    ["Currency", "SAR", { currency_name: "SAR", enabled: 1, symbol: "SAR" }],
    ["UOM", "Nos", { uom_name: "Nos" }],
    // erpnext/setup/setup_wizard/operations/install_fixtures.py party types, so Journal Entry lines can pick a party type
    ["Party Type", "Customer", { party_type: "Customer", account_type: "Receivable" }],
    ["Party Type", "Supplier", { party_type: "Supplier", account_type: "Payable" }],
    ["Party Type", "Employee", { party_type: "Employee", account_type: "Payable" }],
    ["Party Type", "Shareholder", { party_type: "Shareholder", account_type: "Payable" }],
    ["Company", COMPANY, { company_name: COMPANY, abbr: ABBR, default_currency: "SAR", country: "Saudi Arabia" }],
    ["Warehouse", WH, { warehouse_name: "Stores", company: COMPANY, is_group: 0 }],
    ["Warehouse", FG, { warehouse_name: "Finished Goods", company: COMPANY, is_group: 0 }],
    ["Customer Group", "Commercial", { customer_group_name: "Commercial", is_group: 0 }],
    ["Supplier Group", "Raw Material", { supplier_group_name: "Raw Material", is_group: 0 }],
    ["Territory", "Saudi Arabia", { territory_name: "Saudi Arabia", is_group: 0 }],
    ["Item Group", "Products", { item_group_name: "Products", is_group: 0 }],
    ["Customer", "SYN-CUST-001", { customer_name: "Synthetic Atlas Trading", customer_type: "Company", customer_group: "Commercial", territory: "Saudi Arabia", default_currency: "SAR" }],
    ["Customer", "SYN-CUST-002", { customer_name: "Synthetic Noor Clinics", customer_type: "Company", customer_group: "Commercial", territory: "Saudi Arabia", default_currency: "SAR" }],
    ["Customer", "SYN-CUST-003", { customer_name: "Synthetic Cedar Homes", customer_type: "Individual", customer_group: "Commercial", territory: "Saudi Arabia", default_currency: "SAR" }],
    ["Supplier", "SYN-SUPP-001", { supplier_name: "Synthetic Falcon Metals", supplier_group: "Raw Material", supplier_type: "Company", country: "Saudi Arabia" }],
    ["Supplier", "SYN-SUPP-002", { supplier_name: "Synthetic Harbor Cables", supplier_group: "Raw Material", supplier_type: "Company", country: "Saudi Arabia" }],
    ...items.map(([code, name, rate]): Rec => ["Item", code, { item_code: code, item_name: name, item_group: "Products", stock_uom: "Nos", is_stock_item: code === "SYN-ITEM-004" ? 0 : 1, standard_rate: rate, valuation_rate: rate * 0.7, description: name }]),
    ["Sales Order", "SYN-SO-0001", { customer: "SYN-CUST-001", customer_name: "Synthetic Atlas Trading", company: COMPANY, order_type: "Sales", transaction_date: "2026-10-01", delivery_date: "2026-11-15", currency: "SAR", set_warehouse: WH, items: so1, total_qty: 12, total: total(so1), net_total: total(so1), grand_total: total(so1), status: "Draft" }],
    ["Sales Order", "SYN-SO-0002", { customer: "SYN-CUST-002", customer_name: "Synthetic Noor Clinics", company: COMPANY, order_type: "Sales", transaction_date: "2026-10-04", delivery_date: "2026-11-30", currency: "SAR", set_warehouse: WH, items: so2, total_qty: 6, total: total(so2), net_total: total(so2), grand_total: total(so2), status: "Draft" }],
    ["Sales Invoice", "SYN-SINV-0001", { customer: "SYN-CUST-001", customer_name: "Synthetic Atlas Trading", company: COMPANY, posting_date: "2026-10-06", due_date: "2026-11-06", currency: "SAR", items: si1, total: total(si1), net_total: total(si1), grand_total: total(si1), outstanding_amount: total(si1), status: "Draft" }],
    ["Purchase Order", "SYN-PO-0001", { supplier: "SYN-SUPP-001", supplier_name: "Synthetic Falcon Metals", company: COMPANY, transaction_date: "2026-10-02", schedule_date: "2026-11-05", currency: "SAR", set_warehouse: WH, items: po1, total_qty: 120, total: total(po1), net_total: total(po1), grand_total: total(po1), status: "Draft" }],
    ["Project", "SYN-PROJ-001", { project_name: "Synthetic Warehouse Fit-out", status: "Open", company: COMPANY, customer: "SYN-CUST-001", expected_start_date: "2026-10-01", expected_end_date: "2026-12-31", percent_complete: 0 }],
    ["Task", "SYN-TASK-001", { subject: "Site survey", project: "SYN-PROJ-001", status: "Completed", priority: "Medium", exp_start_date: "2026-10-01", company: COMPANY }],
    ["Task", "SYN-TASK-002", { subject: "Install control panels", project: "SYN-PROJ-001", status: "Open", priority: "High", exp_start_date: "2026-10-20", company: COMPANY }],
    ["Task", "SYN-TASK-003", { subject: "Handover documentation", project: "SYN-PROJ-001", status: "Open", priority: "Low", exp_start_date: "2026-12-15", company: COMPANY }],
    ["Asset Category", "Machinery", { asset_category_name: "Machinery" }],
    ["Asset", "SYN-ASSET-001", { asset_name: "Synthetic Forklift", item_code: "SYN-ITEM-003", asset_category: "Machinery", company: COMPANY, location: "", purchase_date: "2026-09-01", gross_purchase_amount: 85000, status: "Draft" }],
    ["BOM", "SYN-BOM-001", { item: "SYN-ITEM-003", company: COMPANY, quantity: 1, is_active: 1, is_default: 1, items: rows([[0, 4], [1, 2]], () => ({ source_warehouse: WH })), currency: "SAR" }],
    ["Employee", "SYN-EMP-001", { first_name: "Sara", last_name: "Synthetic", employee_name: "Sara Synthetic", company: COMPANY, status: "Active", gender: "Female", date_of_birth: "1990-04-02", date_of_joining: "2024-01-15", department: "" }],
    ["Employee", "SYN-EMP-002", { first_name: "Omar", last_name: "Synthetic", employee_name: "Omar Synthetic", company: COMPANY, status: "Active", gender: "Male", date_of_birth: "1988-08-19", date_of_joining: "2023-06-01", department: "" }],
    ["Leave Type", "Casual Leave", { leave_type_name: "Casual Leave", max_leaves_allowed: 12 }],
    ["Leave Type", "Annual Leave", { leave_type_name: "Annual Leave", max_leaves_allowed: 30, is_carry_forward: 1 }],
    // pending request sent three days ago for leave next week (dated relative to today: a pending request never waits for months)
    ["Leave Application", "SYN-LAP-001", { employee: "SYN-EMP-001", employee_name: "Sara Synthetic", leave_type: "Casual Leave", from_date: relDay(5), to_date: relDay(6), total_leave_days: 2, status: "Open", company: COMPANY, posting_date: relDay(-3), creation: `${relDay(-3)}T09:00:00.000Z` }],
    ["Leave Application", "SYN-LAP-0002", { employee: "SYN-EMP-002", employee_name: "Omar Synthetic", leave_type: "Casual Leave", from_date: "2026-10-12", to_date: "2026-10-14", total_leave_days: 3, status: "Approved", company: COMPANY }],
    ["Leave Application", "SYN-LAP-0003", { employee: "SYN-EMP-002", employee_name: "Omar Synthetic", leave_type: "Annual Leave", from_date: "2026-09-01", to_date: "2026-09-05", total_leave_days: 5, status: "Rejected", company: COMPANY }],
    ["Leave Allocation", "SYN-LAL-0001", { employee: "SYN-EMP-001", employee_name: "Sara Synthetic", leave_type: "Casual Leave", from_date: "2026-01-01", to_date: "2026-12-31", new_leaves_allocated: 12, total_leaves_allocated: 12, company: COMPANY }],
    ["Leave Allocation", "SYN-LAL-0002", { employee: "SYN-EMP-001", employee_name: "Sara Synthetic", leave_type: "Annual Leave", from_date: "2026-01-01", to_date: "2026-12-31", new_leaves_allocated: 20, total_leaves_allocated: 20, company: COMPANY }],
    ["Leave Allocation", "SYN-LAL-0003", { employee: "SYN-EMP-002", employee_name: "Omar Synthetic", leave_type: "Casual Leave", from_date: "2026-01-01", to_date: "2026-12-31", new_leaves_allocated: 12, total_leaves_allocated: 12, company: COMPANY }],
    ["Attendance", "SYN-ATT-001", { employee: "SYN-EMP-002", employee_name: "Omar Synthetic", attendance_date: "2026-10-08", status: "Present", company: COMPANY }],
    ["Attendance", "SYN-ATT-0002", { employee: "SYN-EMP-001", employee_name: "Sara Synthetic", attendance_date: "2026-10-09", status: "Present", company: COMPANY }],
    ["Attendance", "SYN-ATT-0003", { employee: "SYN-EMP-002", employee_name: "Omar Synthetic", attendance_date: "2026-10-07", status: "Absent", company: COMPANY }],
    ["Attendance", "SYN-ATT-0004", { employee: "SYN-EMP-002", employee_name: "Omar Synthetic", attendance_date: "2026-10-06", status: "Half Day", company: COMPANY }],
    ["Employee Checkin", "SYN-ECIN-0001", { employee: "SYN-EMP-001", employee_name: "Sara Synthetic", log_type: "IN", time: "2026-10-09 08:57:00", device_id: "PWA-SIM", shift: "Day Shift", company: COMPANY }],
    ["Employee Checkin", "SYN-ECIN-0002", { employee: "SYN-EMP-001", employee_name: "Sara Synthetic", log_type: "OUT", time: "2026-10-09 17:32:00", device_id: "PWA-SIM", shift: "Day Shift", company: COMPANY }],
    ["Employee Checkin", "SYN-ECIN-0003", { employee: "SYN-EMP-002", employee_name: "Omar Synthetic", log_type: "IN", time: "2026-10-10 09:05:00", device_id: "PWA-SIM", shift: "Day Shift", company: COMPANY }],
    ["Shift Type", "Day Shift", { start_time: "09:00:00", end_time: "18:00:00" }],
    ["Shift Type", "Night Shift", { start_time: "21:00:00", end_time: "06:00:00" }],
    ["Shift Assignment", "SYN-SAS-0001", { employee: "SYN-EMP-001", employee_name: "Sara Synthetic", shift_type: "Day Shift", start_date: "2026-10-01", end_date: "2026-10-31", status: "Active", company: COMPANY }],
    ["Shift Assignment", "SYN-SAS-0002", { employee: "SYN-EMP-002", employee_name: "Omar Synthetic", shift_type: "Night Shift", start_date: "2026-10-05", end_date: "2026-10-20", status: "Active", company: COMPANY }],
    ["Shift Request", "SYN-SHR-0001", { employee: "SYN-EMP-001", employee_name: "Sara Synthetic", shift_type: "Night Shift", from_date: "2026-11-01", to_date: "2026-11-10", status: "Approved", company: COMPANY }],
    ["Attendance Request", "SYN-AR-0001", { employee: "SYN-EMP-001", employee_name: "Sara Synthetic", from_date: "2026-10-12", to_date: "2026-10-13", reason: "Work From Home", company: COMPANY }],
    ["Expense Claim Type", "Travel", { expense_type: "Travel", description: "Travel expenses" }],
    ["Expense Claim", "SYN-EXC-0001", { employee: "SYN-EMP-001", employee_name: "Sara Synthetic", posting_date: "2026-10-05", approval_status: "Approved", status: "Unpaid", currency: "SAR", expenses: [{ idx: 1, expense_type: "Travel", description: "Airport taxi", amount: 85, sanction_amount: 85 }], total_claimed_amount: 85, grand_total: 85, company: COMPANY }],
    ["Employee Advance", "SYN-EAD-0001", { employee: "SYN-EMP-001", employee_name: "Sara Synthetic", posting_date: "2026-09-20", currency: "SAR", purpose: "Relocation support", advance_amount: 2000, paid_amount: 2000, pending_amount: 0, status: "Paid", company: COMPANY }],
    ["Salary Slip", "SYN-SAL-0001", { employee: "SYN-EMP-001", employee_name: "Sara Synthetic", posting_date: "2026-09-30", start_date: "2026-09-01", end_date: "2026-09-30", currency: "SAR", payroll_frequency: "Monthly", status: "Submitted", docstatus: 1, salary_structure: "Synthetic Monthly Structure", earnings: [{ idx: 1, salary_component: "Basic", amount: 9000 }, { idx: 2, salary_component: "House Allowance", amount: 3000 }], deductions: [{ idx: 1, salary_component: "Income Tax", amount: 800 }], gross_pay: 12000, total_deduction: 800, net_pay: 11200, year_to_date: 33600, company: COMPANY }],
    ["PWA Notification", "SYN-PWN-0001", { to_user: "sara.synthetic@example.test", message: "Leave application SYN-LAP-001 submitted for approval", read: 0, type: "Alert", reference_document_type: "Leave Application", reference_document_name: "SYN-LAP-001" }],
    ["PWA Notification", "SYN-PWN-0002", { to_user: "sara.synthetic@example.test", message: "Attendance request SYN-AR-0001 approved", read: 1, type: "Info", reference_document_type: "Attendance Request", reference_document_name: "SYN-AR-0001" }],
    // Desk page support records (org chart, stock summary, BOM comparison, shop floor, sales funnel)
    ["Employee", "SYN-EMP-003", { first_name: "Huda", last_name: "Synthetic", employee_name: "Huda Synthetic", company: COMPANY, status: "Active", gender: "Female", date_of_joining: "2025-02-01", designation: "Accountant", reports_to: "SYN-EMP-001" }],
    ["Employee", "SYN-EMP-004", { first_name: "Faisal", last_name: "Synthetic", employee_name: "Faisal Synthetic", company: COMPANY, status: "Active", gender: "Male", date_of_joining: "2025-05-10", designation: "Technician", reports_to: "SYN-EMP-002" }],
    ...items.filter(([c]) => c !== "SYN-ITEM-004").flatMap(([code], i): Rec[] => [
      ["Bin", `SYN-BIN-${i + 1}A`, { item_code: code, warehouse: WH, actual_qty: [120, 40, 6][i], reserved_qty: [10, 5, 2][i], ordered_qty: [100, 20, 0][i], projected_qty: [210, 55, 4][i], stock_uom: "Nos" }],
      ["Bin", `SYN-BIN-${i + 1}B`, { item_code: code, warehouse: FG, actual_qty: [0, 10, 3][i], reserved_qty: 0, ordered_qty: 0, projected_qty: [0, 10, 3][i], stock_uom: "Nos" }],
    ]),
    ["Putaway Rule", "SYN-PUT-0001", { item_code: "SYN-ITEM-001", warehouse: WH, capacity: 200, stock_uom: "Nos", company: COMPANY, priority: 1 }],
    ["Putaway Rule", "SYN-PUT-0002", { item_code: "SYN-ITEM-002", warehouse: WH, capacity: 50, stock_uom: "Nos", company: COMPANY, priority: 1 }],
    ["BOM", "SYN-BOM-002", { item: "SYN-ITEM-003", company: COMPANY, quantity: 1, is_active: 1, is_default: 0, items: rows([[0, 6], [1, 1]], () => ({ source_warehouse: WH })), currency: "SAR" }],
    ["Workstation", "Assembly Bench", { workstation_name: "Assembly Bench", status: "Production", plant_floor: "Main Floor", hour_rate: 60 }],
    ["Workstation", "Testing Rig", { workstation_name: "Testing Rig", status: "Idle", plant_floor: "Main Floor", hour_rate: 45 }],
    ["Plant Floor", "Main Floor", { floor_name: "Main Floor", company: COMPANY }],
    ["Job Card", "SYN-JC-0001", { work_order: "SYN-WO-0001", operation: "Assembly", workstation: "Assembly Bench", production_item: "SYN-ITEM-003", for_quantity: 2, total_completed_qty: 1, status: "Work In Progress", company: COMPANY }],
    ["Job Card", "SYN-JC-0002", { work_order: "SYN-WO-0001", operation: "Testing", workstation: "Testing Rig", production_item: "SYN-ITEM-003", for_quantity: 2, total_completed_qty: 0, status: "Open", company: COMPANY }],
    ["Opportunity", "SYN-OPP-0001", { opportunity_from: "Customer", party_name: "SYN-CUST-001", status: "Open", opportunity_amount: 25000, sales_stage: "Prospecting", company: COMPANY }],
    ["Opportunity", "SYN-OPP-0002", { opportunity_from: "Customer", party_name: "SYN-CUST-002", status: "Quotation", opportunity_amount: 12000, sales_stage: "Proposal/Price Quote", company: COMPANY }],
    ["Lead", "SYN-LEAD-0001", { lead_name: "Synthetic Prospect One", status: "Lead", company_name: "Prospect One Co" }],
    ["Lead", "SYN-LEAD-0002", { lead_name: "Synthetic Prospect Two", status: "Open", company_name: "Prospect Two Co" }],
    ["Lead", "SYN-LEAD-0003", { lead_name: "Synthetic Prospect Three", status: "Replied", company_name: "Prospect Three Co" }],
  ];
}

/** Idempotent: adds each record only if a record with that name does not exist. */
/** Notification Log + Event (frappe desk notifications panel) and GL Entry rows derived from submitted vouchers. */
function shellRecords(): Rec[] {
  const today = new Date().toISOString().slice(0, 10);
  const n = (i: number, subject: string, subject_ar: string, type: string, dt: string, dn: string, read = 0): Rec =>
    ["Notification Log", `SYN-NL-${String(i).padStart(4, "0")}`, { subject, subject_ar, type, document_type: dt, document_name: dn, for_user: "Administrator", from_user: "Administrator", read, creation: `${today}T0${i}:15:00.000Z` }];
  const out: Rec[] = [
    // records in the states the source buttons require (leave_encashment.js "Create ▸ Payment"; payment_request.js "Create Payment Entry")
    ["Leave Encashment", "SYN-LE-0001", { employee: "DDT-EMP-002", employee_name: "Demo Employee", company: "Digit Demo Trading Co.", leave_type: "Annual Leave", encashment_date: today, encashment_days: 5, encashment_amount: 2500, pay_via_payment_entry: 1, status: "Unpaid", docstatus: 1 }],
    ["Payment Request", "SYN-PR-0001", { payment_request_type: "Outward", party_type: "Supplier", party: "SYN-SUP-001", reference_doctype: "Purchase Invoice", reference_name: "SYN-PINV-0001", company: "Digit Demo Trading Co.", grand_total: 11500, currency: "SAR", transaction_date: today, status: "Initiated", docstatus: 1 }],
    n(1, "Sales Invoice SYN-SINV-0001 was assigned to you", "تم إسناد فاتورة مبيعات SYN-SINV-0001 إليك", "Assignment", "Sales Invoice", "SYN-SINV-0001"),
    n(2, "Administrator mentioned you in a comment on Customer SYN-CUST-001", "ذكرك المسؤول في تعليق على العميل SYN-CUST-001", "Mention", "Customer", "SYN-CUST-001"),
    n(3, "Sales Order SYN-SO-0001 is due for delivery", "أمر بيع SYN-SO-0001 حان موعد تسليمه", "Alert", "Sales Order", "SYN-SO-0001"),
    n(4, "Purchase Order SYN-PO-0001 was shared with you", "تمت مشاركة أمر شراء SYN-PO-0001 معك", "Share", "Purchase Order", "SYN-PO-0001", 1),
    n(5, "Payment received against Sales Invoice SYN-SINV-0001", "تم استلام دفعة مقابل فاتورة مبيعات SYN-SINV-0001", "Alert", "Sales Invoice", "SYN-SINV-0001", 1),
    ["Event", "SYN-EV-0001", { subject: "Quarterly sales review", subject_ar: "مراجعة المبيعات الربعية", starts_on: `${today} 10:00:00`, ends_on: `${today} 11:00:00`, event_type: "Public", status: "Open" }],
    ["Event", "SYN-EV-0002", { subject: "Supplier call — Falcon Metals", subject_ar: "مكالمة مع المورد — الصقر للمعادن", starts_on: `${today} 14:30:00`, event_type: "Private", status: "Open" }],
    ["Event", "SYN-EV-0003", { subject: "Month-end closing", subject_ar: "إقفال نهاية الشهر", starts_on: "2026-10-31 09:00:00", event_type: "Public", status: "Open" }],
    ["Letter Head", "ترويسة ديجيت", { letter_head_name: "ترويسة ديجيت", source: "HTML", is_default: 1, disabled: 0,
      content: `<div style="display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #0f766e;padding-bottom:8px"><div><div style="font-size:20px;font-weight:700">شركة ديجيت التجريبية للتجارة</div><div style="color:#555">الرياض، المملكة العربية السعودية · الرقم الضريبي 300000000000003</div></div><div style="direction:ltr;text-align:right;color:#555">Digit Demo Trading Co.<br/>Riyadh, Saudi Arabia</div></div>` }],
    // records for source print formats that need one (Dunning Letter, Pick List, Job Offer, Standard Appointment Letter)
    ["Dunning", "SYN-DUN-0001", { customer: "DDT-CUST-001", customer_name: "مؤسسة الأفق التجارية", company: "Digit Demo Trading Co.", posting_date: today, currency: "SAR", dunning_type: "First Notice", dunning_fee: 50, dunning_amount: 50, total_outstanding: 2300, grand_total: 2350, body_text: "<p>نذكّركم بوجود مبالغ مستحقة غير مسددة.</p>", closing_text: "<p>مع التحية</p>", status: "Unresolved", docstatus: 0,
      overdue_payments: [{ idx: 1, sales_invoice: "DDT-SINV-001", due_date: today, outstanding: 2300, overdue_days: 12, interest: 0 }] }],
    ["Pick List", "SYN-PICK-0001", { company: "Digit Demo Trading Co.", purpose: "Delivery", customer: "DDT-CUST-001", docstatus: 0, locations: [{ idx: 1, item_code: "DDT-ITEM-001", item_name: "Steel Bolt M12 (box)", warehouse: "Stores - DDT", qty: 5, stock_qty: 5, uom: "Nos" }] }],
    ["Job Offer", "SYN-JO-0001", { job_applicant: "SYN-JA-0001", applicant_name: "سارة العتيبي", designation: "Accountant", company: "Digit Demo Trading Co.", offer_date: today, status: "Awaiting Response", docstatus: 0, offer_terms: [{ idx: 1, offer_term: "Probation", value: "3 months" }] }],
    ["Appointment Letter", "SYN-AL-0001", { job_applicant: "SYN-JA-0001", applicant_name: "سارة العتيبي", company: "Digit Demo Trading Co.", appointment_date: today, introduction: "يسعدنا تعيينكم في الشركة.", closing_notes: "مع أطيب التمنيات", terms: [{ idx: 1, title: "Working hours", description: "8 hours" }] }],
    ["Kanban Board", "Sales Invoice Status", { kanban_board_name: "Sales Invoice Status", reference_doctype: "Sales Invoice", field_name: "status" }],
    // erpnext/setup/install.py add_company_to_session_defaults: Company is the installed session default (Settings › Session Defaults)
    ["Session Default Settings", "Session Default Settings", { session_defaults: [{ idx: 1, doctype: "Session Default", name: "session-default-company", ref_doctype: "Company", parent: "Session Default Settings", parentfield: "session_defaults", parenttype: "Session Default Settings" }] }],
  ];
  // Opening capital as a real Journal Entry; its GL rows (and every other voucher's) are written by the posting engine (src/lib/posting.ts).
  for (const co of adapter.list("Company")) {
    const ab0 = String(co["abbr"] ?? "");
    const bk = resolveName("Account", `Al-Demo Bank - ${ab0}`), cs = resolveName("Account", `Capital Stock - ${ab0}`);
    if (!adapter.get("Account", cs) || !adapter.get("Account", bk)) continue;
    out.push(["Journal Entry", `SYN-JV-OPENING-${ab0}`, { voucher_type: "Opening Entry", is_opening: "Yes", company: co.name, posting_date: "2026-01-01", total_debit: 500000, total_credit: 500000, docstatus: 1, accounts: [
      { idx: 1, account: bk, debit_in_account_currency: 500000, credit_in_account_currency: 0, debit: 500000, credit: 0 },
      { idx: 2, account: cs, debit_in_account_currency: 0, credit_in_account_currency: 500000, debit: 0, credit: 500000 }] }]);
  }
  return out;
}

export function seedErp() {
  if (isServerHosted()) return;
  let added = 0;
  // insert-if-missing never re-creates a record the user deleted (Deleted Document tombstones, delete_doc.py)
  const gone = deletedIndex();
  // ledger rows from earlier seed versions were raw inserts; drop them so the posting engine is the only writer
  for (const g of adapter.list("GL Entry")) if (/^SYN-GL(E|2)?-/.test(g.name)) adapter.remove("GL Entry", g.name);
  for (const g of adapter.list("Stock Ledger Entry")) if (/^[A-Z]+-SLE-\d+-(IN|OUT)$/.test(g.name)) adapter.remove("Stock Ledger Entry", g.name);
  resetCrmOnce();
  const recs = records().filter(([dt]) => !isCrmDoctype(dt));
  for (const [dt, name, data] of recs) {
    if (adapter.get(dt, name) || wasRenamed(dt, name) || gone.has(deletedKey(dt, name))) continue;
    adapter.insertDoc(dt, { ...data, name, __synthetic: 1 });
    added++;
  }
  // backfill synthetic CRM deals created before deals carried revenue/email/mobile (insert-if-missing kept them empty)
  const dealSeed = new Map(recs.filter(([dt]) => dt === "CRM Deal").map(([, n, d]) => [n, d]));
  for (const d of adapter.list("CRM Deal")) if (d["__synthetic"] && !d["email"] && dealSeed.has(d.name)) {
    const s = dealSeed.get(d.name)!;
    adapter.insertDocQuiet("CRM Deal", { ...d, annual_revenue: s["annual_revenue"], email: s["email"], mobile_no: s["mobile_no"], website: s["website"], no_of_employees: s["no_of_employees"] });
  }
  // owner rule (no fixed calendar dates): open synthetic deals / follow-ups still on their first fixed 2026 date move to the
  // date the seed now gives relative to today; a date the user changed (≠ the first seed value) is never touched
  for (const d of adapter.list("CRM Deal")) { const sd = dealSeed.get(d.name); if (d["__synthetic"] && sd && sd["__close_v1"] && d["expected_closure_date"] === sd["__close_v1"] && sd["expected_closure_date"] !== sd["__close_v1"]) adapter.insertDocQuiet("CRM Deal", { ...d, expected_closure_date: sd["expected_closure_date"], __close_v1: sd["__close_v1"] }); }
  const taskSeed = new Map(recs.filter(([dt]) => dt === "CRM Task").map(([, n, d]) => [n, d]));
  for (const t of adapter.list("CRM Task")) { const st = taskSeed.get(t.name); if (t["__synthetic"] && st && st["__due_v1"] && t["due_date"] === st["__due_v1"] && st["due_date"] !== st["__due_v1"] && ["Backlog", "Todo", "In Progress"].includes(String(t["status"]))) adapter.insertDocQuiet("CRM Task", { ...t, due_date: st["due_date"], __due_v1: st["__due_v1"] }); }
  // backfill the canonical Customer link of the synthetic CRM companies created before they carried it (CRM C3: one canonical
  // Customer behind Customer 360); seed-owned rows only, a value the user set is never replaced
  const orgSeed = new Map(recs.filter(([dt]) => dt === "CRM Organization").map(([, n, d]) => [n, d]));
  for (const o of adapter.list("CRM Organization")) { const c = orgSeed.get(o.name)?.["customer"]; if (o["__synthetic"] && !o["customer"] && c && adapter.get("Customer", String(c))) adapter.insertDocQuiet("CRM Organization", { ...o, customer: c }); }
  // CRM C4 E-01: the first 15 synthetic leads are the converted ones (each with its deal); seed-owned, not-yet-converted rows
  // only, and the five later deals that pointed at unconverted leads drop that link once (marker __lead_c4)
  const leadSeed = new Map(recs.filter(([dt]) => dt === "CRM Lead").map(([, n, d]) => [n, d]));
  for (const l of adapter.list("CRM Lead")) {
    const sl = leadSeed.get(l.name); if (!l["__synthetic"] || !sl || l["__lead_c4"]) continue;
    const conv = sl["converted"] === 1 && !Number(l["converted"]);
    adapter.insertDocQuiet("CRM Lead", { ...l, ...(conv ? { status: sl["status"], converted: 1, custom_converted_deal: sl["custom_converted_deal"], custom_converted_org: sl["custom_converted_org"] } : {}), ...(l["custom_estimated_value"] == null ? { custom_estimated_value: sl["custom_estimated_value"] } : {}), __lead_c4: 1 });
  }
  for (const d of adapter.list("CRM Deal")) { const sd = dealSeed.get(d.name); if (d["__synthetic"] && sd && d["lead"] && !sd["lead"] && !d["__lead_c4"]) adapter.insertDocQuiet("CRM Deal", { ...d, lead: "", __lead_c4: 1 }); }
  // tags / assignments on a few invoices so the list sidebar groups have real counts
  for (const [i, si] of adapter.list("Sales Invoice").slice(0, 6).entries()) {
    if (si["_user_tags"] === undefined) adapter.insertDocQuiet("Sales Invoice", { ...si, _assign: JSON.stringify(i % 2 ? ["Administrator"] : ["sales@example.test"]), _user_tags: i % 3 ? "Priority" : "Export,Priority", owner: si["owner"] ?? "Administrator" });
  }
  for (const [dt, name, data] of shellRecords().filter(([dt]) => !isCrmDoctype(dt))) {
    const cur = adapter.get(dt, name);
    // sample notifications/events saved before they carried an Arabic subject get it (seed-owned rows only, no Version)
    if (cur && cur["__synthetic"] && data["subject_ar"] && !cur["subject_ar"]) adapter.insertDocQuiet(dt, { ...cur, subject_ar: data["subject_ar"] });
    if (cur || wasRenamed(dt, name) || gone.has(deletedKey(dt, name))) continue;
    adapter.insertDocQuiet(dt, { ...data, name, __synthetic: 1 });
    added++;
  }
  // one-time switch of the demo company to perpetual inventory (ERPNext default): flags + re-post synthetic purchase invoices
  if (typeof localStorage !== "undefined" && !localStorage.getItem("digit-virtual-core:perpetual-v2")) {
    for (const co of adapter.list("Company")) if (co["__synthetic"] && co["enable_perpetual_inventory"] === undefined) {
      const ab = String(co["abbr"] ?? "");
      adapter.insertDocQuiet("Company", { ...co, enable_perpetual_inventory: 1, stock_received_but_not_billed: `Stock Received But Not Billed - ${ab}`, stock_adjustment_account: `Stock Adjustment - ${ab}`, default_inventory_account: `Stock In Hand - ${ab}`, default_expense_account: `Cost of Goods Sold - ${ab}` });
      const pis = new Set(adapter.list("Purchase Invoice").filter((d) => d["__synthetic"] && d["company"] === co.name && Number(d.docstatus) === 1).map((d) => d.name));
      for (const g of adapter.list("GL Entry")) if (g["voucher_type"] === "Purchase Invoice" && pis.has(String(g["voucher_no"]))) adapter.remove("GL Entry", g.name);
      // opening stock moves from the opening Journal Entry to the opening Material Receipt (seedDemo); re-post that JE
      const jv = adapter.get("Journal Entry", `${ab}-JV-0001`), stockAcc = resolveName("Account", `Stock In Hand - ${ab}`), obe = resolveName("Account", `Opening Balance Equity - ${ab}`);
      if (jv && jv["__synthetic"] && ((jv["accounts"] as Record<string, unknown>[]) ?? []).some((a) => a["account"] === stockAcc)) {
        const accts = ((jv["accounts"] as Record<string, unknown>[]) ?? []).filter((a) => a["account"] !== stockAcc).map((a) => (a["account"] === obe ? { ...a, credit: 850000, credit_in_account_currency: 850000 } : a));
        adapter.insertDocQuiet("Journal Entry", { ...jv, accounts: accts, total_debit: 850000, total_credit: 850000 });
        for (const g of adapter.list("GL Entry")) if (g["voucher_type"] === "Journal Entry" && g["voucher_no"] === jv.name) adapter.remove("GL Entry", g.name);
      }
    }
    for (const e of adapter.list("Stock Ledger Entry")) { const it = adapter.get("Item", String(e["item_code"])); if (it && Number(it["is_stock_item"] ?? 1) === 0) adapter.remove("Stock Ledger Entry", e.name); }
    localStorage.setItem("digit-virtual-core:perpetual-v2", "1");
  }
  // synthetic draft invoices carry the mandatory price list / receivable fields (sales_invoice.json reqd)
  for (const d of adapter.list("Sales Invoice")) if (d["__synthetic"] && Number(d.docstatus ?? 0) === 0 && !d["selling_price_list"]) {
    const ab = String(adapter.get("Company", String(d["company"]))?.["abbr"] ?? "DDT");
    adapter.insertDocQuiet("Sales Invoice", { ...d, selling_price_list: resolveName("Price List", "Standard Selling"), price_list_currency: "SAR", plc_conversion_rate: 1, currency: d["currency"] ?? "SAR", conversion_rate: d["conversion_rate"] ?? 1, debit_to: d["debit_to"] ?? resolveName("Account", `Debtors - ${ab}`) });
  }
  // demo VAT number on companies that have none (tax invoice print); synthetic records only
  for (const co of adapter.list("Company")) if (co["__synthetic"] && !co["tax_id"]) adapter.insertDocQuiet("Company", { ...co, tax_id: "300000000000003" });
  seedPermissionDemo();
  postAll();
  // DIGIT Core control records (approval limits, tolerances, close tasks, disputes, IBANs, guide…) need the posted vouchers
  added += seedCore();
  // foreign-currency demo (USD invoice part-paid at another rate) for the exchange gain/loss booking; posts its own vouchers
  added += seedExchangeDemo();
  // demo-only Accounting Dimension "Branch" (insert-if-missing; not mandatory, no balancing) — default on new documents.
  // It is setup data (__synthetic), so its creation is never listed as a user change on the Enterprise Home.
  if (!adapter.get("Accounting Dimension", "Branch") && !localStorage.getItem("digit-virtual-core:dim-demo-v1")) {
    const co = String(adapter.list("Account").find((a) => a["account_type"] === "Bank")?.["company"] ?? "");
    for (const b of ["المقر الرئيسي", "الفرع أ"]) if (!adapter.get("Branch", b)) adapter.insertDocQuiet("Branch", { name: b, branch: b, __synthetic: 1 });
    if (co) adapter.insertDoc("Accounting Dimension", { name: "Branch", document_type: "Branch", label: "Branch", fieldname: "branch", disabled: 0, __synthetic: 1, dimension_defaults: [{ idx: 1, company: co, default_dimension: "المقر الرئيسي", mandatory_for_pl: 0, mandatory_for_bs: 0 }] });
    localStorage.setItem("digit-virtual-core:dim-demo-v1", "1");
  }
  markSetupDimension();
  arabizeSeed();
  resetRefIndex(); applyDemoRenames();
  seedGlobalDefaults();
  adapter.flush();
  return added;
}
export const SYN_COMPANY = COMPANY;
// arabic seed names: see seedNamesAr.ts

/**
 * The demo "Branch" Accounting Dimension saved before it carried the setup flag becomes setup data again — only while it
 * is unchanged since setup (no user-tracked "changed" Version), so a dimension the user edited stays the user's record.
 * The record itself is kept.
 */
export function markSetupDimension() {
  const d = adapter.get("Accounting Dimension", "Branch");
  if (!d || d["__synthetic"] || typeof localStorage === "undefined" || !localStorage.getItem("digit-virtual-core:dim-demo-v1")) return;
  const edited = adapter.list("Version").some((v) => v["ref_doctype"] === "Accounting Dimension" && v["docname"] === "Branch" && String(v["data"] ?? "").includes('"changed"'));
  if (!edited) adapter.insertDocQuiet("Accounting Dimension", { ...d, __synthetic: 1 });
}

function n1(v: unknown) { return Number(v) || 0; }

/** Two demo users for Switch User permission checks (insert-if-missing): a Sales User restricted to one Customer, and an Accounts User. */
function seedPermissionDemo() {
  const cust = adapter.list("Customer").map((c) => c.name).sort()[0];
  const users: [string, string, string, string[]][] = [
    ["sales.user@digit.test", "Salem", "Sales", ["Sales User"]],
    ["accounts.user@digit.test", "Amal", "Accounts", ["Accounts User"]],
  ];
  const goneUsers = deletedIndex();
  for (const [email, first, last, roles] of users) if (!adapter.get("User", email) && !goneUsers.has(deletedKey("User", email)))
    adapter.insertDocQuiet("User", { name: email, email, first_name: first, last_name: last, full_name: `${first} ${last}`, enabled: 1, user_type: "System User", roles: roles.map((r, i) => ({ doctype: "Has Role", name: `${email}-role-${i}`, role: r, parenttype: "User", parentfield: "roles", parent: email })), __synthetic: 1 });
  if (cust && !adapter.get("User Permission", "UP-sales-user-customer"))
    adapter.insertDocQuiet("User Permission", { name: "UP-sales-user-customer", user: "sales.user@digit.test", allow: "Customer", for_value: cust, apply_to_all_doctypes: 1, is_default: 0, __synthetic: 1 });
}

/**
 * ERPNext setup wizard (setup_wizard/operations/defaults_setup.py set_default_settings) leaves Global Defaults with the
 * first company, its currency, country and fiscal year, so frappe.defaults.get_user_default("Company") resolves on a
 * set-up site. Insert-if-missing once: a user who later clears or edits Global Defaults is never overwritten.
 */
function seedGlobalDefaults() {
  const FLAG = "digit-virtual-core:global-defaults-v1";
  if (adapter.get("Global Defaults", "Global Defaults") || localStorage.getItem(FLAG)) return;
  // the set-up company is the one the demo vouchers post to (same pick as the session-default fallback)
  const coName = resolveDefaultCompany("Administrator").value; const co = coName ? adapter.get("Company", coName) : undefined;
  if (!co) return;
  const today = new Date().toISOString().slice(0, 10);
  const fy = adapter.list("Fiscal Year").find((f) => String(f["year_start_date"] ?? "") <= today && today <= String(f["year_end_date"] ?? ""));
  adapter.insertDocQuiet("Global Defaults", { name: "Global Defaults", default_company: co.name, default_currency: co["default_currency"] ?? "SAR", country: co["country"] ?? "", current_fiscal_year: fy?.name ?? "", __synthetic: 1 });
  localStorage.setItem(FLAG, "1");
}
