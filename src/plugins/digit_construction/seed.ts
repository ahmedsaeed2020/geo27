import { isServerHosted } from "@/lib/serverHost";
/**
 * DIGIT Construction connected demo (virtual only, never exported as Frappe fixtures).
 * One clearly labelled fictional company (DCC) and three Saudi projects:
 *   A  DCC-PRJ-A  Al-Yasmin commercial tower, Riyadh — healthy execution, full tender→contract→claim→certificate→invoice→collection chain
 *   B  DCC-PRJ-B  Al-Waha residential compound, Jeddah — delayed, over budget, overdue RFQ/material, partially received PO
 *   C  DCC-PRJ-C  Al-Nukhba school, Dammam — technically complete; final account disputed, retention release and closeout pending
 * Insert-if-missing with explicit names (__demo + __plugin provenance); user edits are never overwritten. App documents
 * are computed through the same controller hooks as the UI (computeDoc); native vouchers are inserted submitted and
 * their GL/stock ledger rows come only from posting.postAll(), exactly like the Core seed.
 */
import { adapter, type Doc } from "@/lib/adapter";
import { postAll } from "@/lib/posting";
import { asSystem, rows } from "./domain/data";
import { computeDoc } from "./domain/hooks";
import { backfillCompany } from "./domain/companyScope";
import { lineAmount, num, r2 } from "./domain/calc";
import { r19Samples } from "./r19/samples";
import { CONSTRUCTION_WORKFLOWS } from "./workflows";
import { CONSTRUCTION_REPORTS } from "./reports";
type Row = Record<string, unknown>;

export const DEMO_COMPANY = "شركة ديجيت للمقاولات (تجريبية)";
const A = "DCC";
const C = DEMO_COMPANY;
export const DEMO_PROJECTS = { A: "DCC-PRJ-A", B: "DCC-PRJ-B", C: "DCC-PRJ-C" } as const;
type Rec = [string, string, Record<string, unknown>];
const acct = (n: string) => `${n} - ${A}`;
const WH = { A: `مستودع موقع الياسمين - ${A}`, B: `مستودع موقع الواحة - ${A}`, C: `مستودع موقع النخبة - ${A}`, M: `المستودع المركزي - ${A}` };
const iso = (d: string) => `${d} 09:00:00`;

// ---------------------------------------------------------------- masters
function masters(): Rec[] {
  const r: Rec[] = [];
  r.push(["Company", C, { company_name: C, abbr: A, default_currency: "SAR", country: "Saudi Arabia", tax_id: "310000000000003", chart_of_accounts: "Standard", enable_perpetual_inventory: 0, default_receivable_account: acct("Debtors"), default_payable_account: acct("Creditors"),
    default_income_account: acct("Contract Revenue"), default_expense_account: acct("Construction Materials"), cost_center: acct("Projects"), round_off_account: acct("Round Off"), round_off_cost_center: acct("Projects"), __note: "Fictional construction company — DIGIT Construction demo data" }]);
  const ac = (n: string, parent: string | null, root: string, type = "", group = 0) => r.push(["Account", acct(n), { account_name: n, parent_account: parent ? acct(parent) : "", root_type: root, account_type: type, is_group: group, company: C, account_currency: "SAR" }]);
  ac("Application of Funds (Assets)", null, "Asset", "", 1); ac("Current Assets", "Application of Funds (Assets)", "Asset", "", 1); ac("Cash", "Current Assets", "Asset", "Cash"); ac("Al-Rajhi Demo Bank", "Current Assets", "Asset", "Bank");
  ac("Debtors", "Current Assets", "Asset", "Receivable"); ac("Stock In Hand", "Current Assets", "Asset", "Stock"); ac("VAT 15% Input", "Current Assets", "Asset", "Tax"); ac("Advances to Subcontractors", "Current Assets", "Asset");
  ac("Source of Funds (Liabilities)", null, "Liability", "", 1); ac("Creditors", "Source of Funds (Liabilities)", "Liability", "Payable"); ac("VAT 15% Output", "Source of Funds (Liabilities)", "Liability", "Tax"); ac("Client Advances", "Source of Funds (Liabilities)", "Liability");
  ac("Equity", null, "Equity", "", 1); ac("Capital Stock", "Equity", "Equity"); ac("Opening Balance Equity", "Equity", "Equity");
  ac("Income", null, "Income", "", 1); ac("Contract Revenue", "Income", "Income", "Income Account");
  ac("Expenses", null, "Expense", "", 1); ac("Construction Materials", "Expenses", "Expense", "Expense Account"); ac("Subcontract Cost", "Expenses", "Expense", "Expense Account"); ac("Site Expenses", "Expenses", "Expense", "Expense Account");
  ac("Equipment Hire", "Expenses", "Expense", "Expense Account"); ac("Cost of Goods Sold", "Expenses", "Expense", "Cost of Goods Sold"); ac("Round Off", "Expenses", "Expense", "Round Off"); ac("Stock Adjustment", "Expenses", "Expense", "Stock Adjustment");
  r.push(["Cost Center", acct("Main"), { cost_center_name: "Main", company: C, is_group: 1, parent_cost_center: "" }]);
  r.push(["Cost Center", acct("Projects"), { cost_center_name: "Projects", company: C, is_group: 0, parent_cost_center: acct("Main") }]);
  for (const w of Object.values(WH)) r.push(["Warehouse", w, { warehouse_name: w.replace(` - ${A}`, ""), company: C, is_group: 0 }]);
  for (const u of ["m³", "m²", "Ton", "Bag", "m", "LS", "Hour", "Day"]) r.push(["UOM", u, { uom_name: u, must_be_whole_number: 0 }]);
  r.push(["Item Group", "Construction Materials", { item_group_name: "Construction Materials", is_group: 0, parent_item_group: "All Item Groups" }]);
  r.push(["Item Group", "Construction Services", { item_group_name: "Construction Services", is_group: 0, parent_item_group: "All Item Groups" }]);
  const tax = (type: "sales" | "purchase") => [{ idx: 1, charge_type: "On Net Total", account_head: acct(type === "sales" ? "VAT 15% Output" : "VAT 15% Input"), description: "VAT 15%", rate: 15, tax_amount: 0, total: 0, ...(type === "purchase" ? { category: "Total", add_deduct_tax: "Add" } : {}) }];
  r.push(["Sales Taxes and Charges Template", `KSA VAT 15% - ${A}`, { title: "KSA VAT 15%", company: C, is_default: 1, taxes: tax("sales") }]);
  r.push(["Purchase Taxes and Charges Template", `KSA VAT 15% Input - ${A}`, { title: "KSA VAT 15% Input", company: C, is_default: 1, taxes: tax("purchase") }]);
  for (const [code, name, uom, rate, stock] of ITEMS) r.push(["Item", code, { item_code: code, item_name: name, item_group: stock ? "Construction Materials" : "Construction Services", stock_uom: uom, is_stock_item: stock ? 1 : 0, standard_rate: rate, valuation_rate: rate, description: name, disabled: 0, uoms: [{ idx: 1, uom, conversion_factor: 1 }] }]);
  CUSTOMERS.forEach(([id, name, en, city]) => r.push(["Customer", id, { customer_name: name, digit_customer_name_en: en, customer_type: "Company", customer_group: "Commercial", territory: "Saudi Arabia", default_currency: "SAR", tax_id: "3100000000" + id.slice(-2) + "003", __city: city }]));
  SUPPLIERS.forEach(([id, name, group]) => r.push(["Supplier", id, { supplier_name: name, supplier_group: group, supplier_type: "Company", country: "Saudi Arabia", default_currency: "SAR" }]));
  EMPLOYEES.forEach(([id, first, last, desig, gender], i) => r.push(["Employee", id, { first_name: first, last_name: last, employee_name: `${first} ${last}`, company: C, status: "Active", gender, designation: desig, date_of_joining: `202${3 + (i % 3)}-0${1 + (i % 8)}-15`, date_of_birth: `19${80 + i}-0${1 + (i % 9)}-1${i % 9}` }]));
  for (const [user, full, roles] of USERS) {
    r.push(["User", user, { email: user, first_name: full, full_name: full, enabled: 1, user_type: "System User", roles: roles.map((role, i) => ({ idx: i + 1, role })), __note: "Demo construction user" }]);
    r.push(["User Permission", `UP-${user}-company`, { user, allow: "Company", for_value: C, apply_to_all_doctypes: 1, is_default: 1 }]);
  }
  return r;
}
const ITEMS: [string, string, string, number, number][] = [
  [`${A}-MAT-REBAR`, "حديد تسليح 16 مم", "Ton", 2750, 1], [`${A}-MAT-CEMENT`, "أسمنت بورتلاندي عادي", "Bag", 16, 1], [`${A}-MAT-RMC`, "خرسانة جاهزة C40", "m³", 265, 1],
  [`${A}-MAT-BLOCK`, "بلوك خرساني 20 سم", "Nos", 2.8, 1], [`${A}-MAT-TILE`, "بلاط بورسلان 60×60", "m²", 46, 1], [`${A}-MAT-CABLE`, "كابل نحاسي 4×16 مم²", "m", 38, 1],
  [`${A}-SVC-WORKS`, "أعمال مقاولات حسب الشهادة", "Nos", 0, 0], [`${A}-SVC-SUBCON`, "أعمال مقاولي الباطن حسب المستخلص", "Nos", 0, 0],
];
const CUSTOMERS: [string, string, string, string][] = [
  [`${A}-CUST-01`, "شركة الأفق للتطوير العقاري", "Al-Ufuq Real Estate Development", "الرياض"], [`${A}-CUST-02`, "مجموعة البحر الأحمر العقارية", "Red Sea Real Estate Group", "جدة"],
  [`${A}-CUST-03`, "شركة رواد التعليم الأهلية", "Ruwad Private Education Co.", "الدمام"], [`${A}-CUST-04`, "الشركة الوطنية للخدمات اللوجستية", "National Logistics Services Co.", "الخرج"],
];
const SUPPLIERS: [string, string, string][] = [
  [`${A}-SUP-STEEL`, "مصنع الصلب الوطني", "Raw Material"], [`${A}-SUP-RMC`, "شركة الخرسانة الحديثة", "Raw Material"], [`${A}-SUP-BUILD`, "مؤسسة مواد البناء المتحدة", "Raw Material"],
  [`${A}-SUB-BLOCK`, "مؤسسة البناء المتين للمقاولات", "Subcontractor"], [`${A}-SUB-MEP`, "شركة الطاقة المتكاملة للأعمال الكهروميكانيكية", "Subcontractor"], [`${A}-SUB-FIN`, "مؤسسة اللمسة الأخيرة للتشطيبات", "Subcontractor"],
  [`${A}-SUP-RENT`, "شركة المعدات الثقيلة للتأجير", "Services"],
];
const EMPLOYEES: [string, string, string, string, string][] = [
  [`${A}-EMP-001`, "خالد", "العتيبي", "Project Manager", "Male"], [`${A}-EMP-002`, "ريم", "الزهراني", "Quantity Surveyor", "Female"], [`${A}-EMP-003`, "فهد", "القحطاني", "Site Engineer", "Male"],
  [`${A}-EMP-004`, "سلطان", "الشمري", "Project Manager", "Male"], [`${A}-EMP-005`, "نورة", "السبيعي", "Accountant", "Female"], [`${A}-EMP-006`, "ماجد", "الحربي", "Site Engineer", "Male"],
  [`${A}-EMP-007`, "عبدالله", "الدوسري", "Foreman", "Male"], [`${A}-EMP-008`, "سعيد", "الغامدي", "Procurement Officer", "Male"], [`${A}-EMP-009`, "يوسف", "المالكي", "Estimator", "Male"],
  [`${A}-EMP-010`, "محمد", "إقبال", "Mason", "Male"], [`${A}-EMP-011`, "راجو", "كومار", "Steel Fixer", "Male"], [`${A}-EMP-012`, "أحمد", "حسن", "Carpenter", "Male"], [`${A}-EMP-013`, "علي", "رضا", "Equipment Operator", "Male"], [`${A}-EMP-014`, "جون", "ماثيو", "Electrician", "Male"],
];
export const DEMO_USERS: [string, string, string[]][] = [
  ["director@dcc.test", "مدير عام المقاولات", ["Digit Director", "Projects Manager", "Accounts Manager", "Purchase Manager"]],
  ["pm@dcc.test", "خالد العتيبي (مدير مشروع)", ["Digit Project Manager", "Projects Manager", "Projects User"]],
  ["qs@dcc.test", "ريم الزهراني (مهندسة كميات)", ["Digit QS", "Projects User"]],
  ["estimator@dcc.test", "يوسف المالكي (مقدر)", ["Digit Estimator", "Projects User"]],
  // "Desk User" = frappe's automatic system-user role (Project read); the Core session does not add it, so desk-only demo users carry it explicitly
  ["procurement@dcc.test", "سعيد الغامدي (مشتريات)", ["Digit Procurement Officer", "Purchase User", "Stock User", "Desk User"]],
  ["site@dcc.test", "فهد القحطاني (مهندس موقع)", ["Digit Site Engineer", "Projects User"]],
  ["finance@dcc.test", "نورة السبيعي (محاسبة)", ["Digit Accountant", "Accounts User", "Desk User"]],
];
/** Earlier installs seeded these users without "Desk User"; a user whose roles are still exactly that old set gets it added once (edited users are left alone). */
const ROLE_TOPUP: Record<string, string[]> = { "procurement@dcc.test": ["Digit Procurement Officer", "Purchase User", "Stock User"], "finance@dcc.test": ["Digit Accountant", "Accounts User"] };
function topUpDeskUser(): boolean {
  let changed = false;
  for (const [user, old] of Object.entries(ROLE_TOPUP)) {
    const u = adapter.get("User", user); if (!u) continue;
    const roles = ((u["roles"] as Row[] | undefined) ?? []).map((r) => String(r["role"]));
    if (JSON.stringify(roles) !== JSON.stringify(old)) continue;
    adapter.insertDocQuiet("User", { ...u, roles: [...old, "Desk User"].map((role, i) => ({ idx: i + 1, role })) }); changed = true;
  }
  return changed;
}
const USERS = DEMO_USERS;

/**
 * HR round H1 (owner, 2026-11-17): the demo staff carry a department, a line manager, an employment type and a nationality,
 * so Employee 360 shows a complete profile and the organisation chart a real reporting line. The five departments are
 * insert-if-missing; a demo employee gets a value only where the field is still empty, so an edited record is kept.
 */
const STAFF_DEPTS: [en: string, ar: string][] = [["Projects", "المشاريع"], ["Site Operations", "عمليات المواقع"], ["Commercial", "الشؤون التجارية"], ["Finance", "المالية"], ["Procurement", "المشتريات"]];
const deptOfDesig = (d: string) => (/Project Manager/.test(d) ? "Projects" : /Quantity|Estimator/.test(d) ? "Commercial" : /Accountant/.test(d) ? "Finance" : /Procurement/.test(d) ? "Procurement" : "Site Operations");
const STAFF_MANAGER: Record<string, string> = { "001": "004", "002": "001", "003": "001", "005": "004", "006": "004", "007": "003", "008": "004", "009": "001", "010": "007", "011": "007", "012": "007", "013": "007" };
const STAFF_NATIONALITY: Record<string, string> = { "010": "Pakistan", "011": "India", "012": "Egypt", "013": "Pakistan" };
export function staffProfile(id: string, desig: string): Record<string, unknown> {
  const k = id.slice(-3); const m = STAFF_MANAGER[k];
  return { department: `${deptOfDesig(desig)} - ${A}`, employment_type: "Full-time", nationality: STAFF_NATIONALITY[k] ?? "Saudi Arabia", cell_number: `05${String(55000000 + Number(k) * 7919).slice(0, 8)}`, ...(m ? { reports_to: `${A}-EMP-${m}` } : {}) };
}
function topUpStaffProfiles(): boolean {
  let changed = false;
  for (const [en, ar] of STAFF_DEPTS) if (!adapter.get("Department", `${en} - ${A}`)) { adapter.insertDocQuiet("Department", { name: `${en} - ${A}`, department_name: en, __name_ar: ar, company: C, is_group: 0, __demo: 1, __plugin: "digit_construction" }); changed = true; }
  for (const [id, , , desig] of EMPLOYEES) {
    const e = adapter.get("Employee", id); if (!e || !e["__demo"]) continue;
    const add = Object.fromEntries(Object.entries(staffProfile(id, desig)).filter(([f]) => e[f] === undefined || e[f] === null || e[f] === ""));
    if (Object.keys(add).length) { adapter.insertDocQuiet("Employee", { ...e, ...add }); changed = true; }
  }
  return changed;
}

// ---------------------------------------------------------------- policies P1–P9 (owner rulings W0-02, 29 Oct 2026)
/** Owner authority of the P1–P9 rulings (W0-02); the rulings are the owner's, the Finance values stay empty until Finance names them. */
export const POLICY_AUTHORITY = "Owner ruling W0-02 (29 Oct 2026)";
export const POLICY_RULINGS: Record<string, { title: string; decision: string; value?: string }> = {
  P1: { title: "Final account approver", decision: "Digit Director approves; the preparer never approves their own final account." },
  P2: { title: "Retention release approver and accounting treatment", decision: "Digit Director approves; the released amount is billed through a native Sales Invoice draft on the retention receivable account named by Finance (Decision Value). While Finance has not named the account the release stays a draft." },
  P3: { title: "Supplier payment accounts and methods", decision: "Construction prepares a Payment Entry draft with the bank account and mode of payment of each company; Accounts submits it. Purchases go through Purchase Receipt; a direct Purchase Invoice is for services only." },
  P4: { title: "Approver for closeout items marked Not Applicable", decision: "A Digit Director other than the user who marked the item Not Applicable approves it, with a recorded reason." },
  P5: { title: "Matching tolerance and default subcontract deductions", decision: "Per-line percent and absolute cap; the tolerance values come from Finance (Construction Settings: matching quantity / price tolerance). Empty tolerance = report only, no block. The Procurement manager accepts a variance with a reason." },
  P6: { title: "Expired-rate block or override", decision: "The Digit Director may approve an estimate that uses an expired rate with a recorded override reason." },
  P7: { title: "Cost Center / accounting-dimension mapping", decision: "An expense account per expense category per company (mapping in Construction settings, named by Finance); project and cost center are accounting dimensions." },
  P8: { title: "Subcontractor profile approval", decision: "The Digit Director approves against a checklist: commercial registration, VAT registration, insurance and safety record." },
  P9: { title: "VAT basis on certificates", decision: "VAT per contract from the company's sales tax template; the company's default (standard) template when the contract names none.", value: "per_contract_company_template" },
};
/** P10 revenue / WIP basis (owner, Construction × Enterprise run 2026-11-14): not ruled — WIP adjustments stay report-only drafts until Finance defines the basis, so it is seeded Undefined. */
export const POLICY_PENDING: Record<string, { title: string; missing_reason: string; affects: string }> = {
  P10: { title: "Revenue recognition / WIP basis", missing_reason: "Finance has not defined the revenue recognition basis; WIP adjustments stay report-only drafts.", affects: "Post Digit WIP Adjustment" },
};
/**
 * Owner UX depth round: demo records for the documents built in the 36×3 run that had none (drawings + transmittal,
 * work permits, commissioning tests, handover assets, a defect raised from its inspection), so their workspaces,
 * calendars and journeys show data. Fictional, explicit names, insert-if-missing; none feeds a cost, commercial or cash
 * read model, so existing figures do not change. Permit validity is relative to the install day (one live, one expired).
 */
function uxDepthDemo(): Rec[] {
  const P = PRJ.A.name; const C = String(adapter.get("Project", P)?.["company"] ?? ""); const PB = PRJ.B.name; const CB = String(adapter.get("Project", PB)?.["company"] ?? "");
  const d0 = new Date().toISOString().slice(0, 10); const back = (n: number) => new Date(Date.parse(`${d0}T00:00:00Z`) - n * 864e5).toISOString().slice(0, 10);
  const own = { owner: "site@dcc.test" };
  const pre = (xs: string[]) => xs.map((precaution, i) => ({ idx: i + 1, precaution, checked: 1 }));
  return [
    ["Digit Drawing", "DRW-2026-0001", { project: P, company: C, drawing_no: "A-101", title: "مسقط الطابق الأرضي", discipline: "Architecture", current_revision: "C", status: "Active", drawing_status: "For Construction", issue_set: "IFC-02", ...own,
      revisions: [{ idx: 1, revision_code: "B", issue_date: "2026-09-20", purpose: "IFR" }, { idx: 2, revision_code: "C", issue_date: "2026-10-12", purpose: "IFC", transmittal: "TRM-2026-0001" }] }],
    ["Digit Drawing", "DRW-2026-0002", { project: P, company: C, drawing_no: "S-201", title: "تفاصيل تسليح السقف — الطابق الأول", discipline: "Structure", current_revision: "B", status: "Active", drawing_status: "For Construction", issue_set: "IFC-02", ...own,
      revisions: [{ idx: 1, revision_code: "B", issue_date: "2026-10-12", purpose: "IFC", transmittal: "TRM-2026-0001" }] }],
    ["Digit Transmittal", "TRM-2026-0001", { project: P, company: C, to_party: "الاستشاري — مكتب الرواد الهندسي", from_party: "الموقع", purpose: "For Construction", workflow_state: "Acknowledged", sent_on: "2026-10-12", acknowledged_on: "2026-10-14", response_due: "2026-10-19", ...own,
      items: [{ idx: 1, ref_doctype: "Digit Drawing", ref_name: "DRW-2026-0001", transmitted_revision: "C" }, { idx: 2, ref_doctype: "Digit Drawing", ref_name: "DRW-2026-0002", transmitted_revision: "B" }] }],
    ["Digit Defect", "DEF-2026-0101", { project: P, company: C, origin_inspection: "INS-2026-0002", title: "غطاء خرساني أقل من المطلوب في سقف الطابق الأول", description: "غطاء خرساني أقل من المطلوب في سقف الطابق الأول", severity: "Major", category: "NCR", defect_type: "NCR", status: "Open", due_date: "2026-10-31", assigned_to: "site@dcc.test", responsible_party: "Own Forces", ...own }],
    ["Digit Work Permit", "WP-2026-0001", { project: P, company: C, permit_type: "Hot Work", location: "سطح المبنى — أعمال لحام", valid_from: `${d0} 07:00:00`, valid_to: `${d0} 17:00:00`, receiver: "مشرف اللحام", status: "Issued", precautions: pre(["طفاية حريق في الموقع", "إزالة المواد القابلة للاشتعال", "مراقب حريق"]), ...own }],
    ["Digit Work Permit", "WP-2026-0002", { project: P, company: C, permit_type: "Work at Height", location: "الواجهة الشمالية — سقالات", valid_from: `${back(9)} 07:00:00`, valid_to: `${back(9)} 16:00:00`, receiver: "مشرف الواجهات", status: "Issued", precautions: pre(["حزام أمان مزدوج", "فحص السقالة"]), ...own }],
    ["Digit Work Permit", "WP-2026-0003", { project: PB, company: CB, permit_type: "Excavation", location: "خزان المياه الأرضي", valid_from: `${d0} 08:00:00`, valid_to: `${d0} 15:00:00`, receiver: "مشرف الحفر", status: "Requested", precautions: pre(["كشف الخدمات المدفونة"]), ...own }],
    ["Digit Handover Asset", "HA-2026-0001", { project: P, company: C, asset_tag: "AHU-01", asset_type: "Equipment", system: "HVAC", location: "سطح المبنى", zone: "R", manufacturer: "Carrier", model: "39HQ", serial_no: "CR39-77120", warranty_until: "2028-06-30", status: "In Progress", ...own }],
    ["Digit Handover Asset", "HA-2026-0002", { project: P, company: C, asset_tag: "FACP-01", asset_type: "System", system: "Fire", location: "غرفة التحكم — الطابق الأرضي", zone: "G", manufacturer: "Notifier", model: "NFS2-3030", status: "Draft", ...own }],
    ["Digit Handover Asset", "HA-2026-0003", { project: PB, company: CB, asset_tag: "MDB-01", asset_type: "Equipment", system: "Electrical", location: "غرفة الكهرباء الرئيسية", zone: "B", manufacturer: "Schneider", model: "Prisma P", serial_no: "SE-PP-55031", warranty_until: "2027-12-31", status: "Draft", ...own }],
    ["Digit Commissioning Test", "CT-2026-0001", { project: P, company: C, asset: "HA-2026-0001", system: "HVAC", test_type: "Functional", planned_date: "2026-10-20", test_date: "2026-10-21", result: "Pass", critical: 1, witness_party: "Consultant", witness: "م. سامي الشهري", certificate: "/files/CT-2026-0001.pdf", passed_count: 12, test_count: 12, zone: "R", ...own }],
    ["Digit Commissioning Test", "CT-2026-0002", { project: P, company: C, asset: "HA-2026-0002", system: "Fire", test_type: "Pre-commissioning", planned_date: "2026-11-25", result: "Pending", critical: 1, witness_party: "Project Manager", zone: "G", ...own }],
    ["Digit Commissioning Test", "CT-2026-0003", { project: PB, company: CB, asset: "HA-2026-0003", system: "Electrical", test_type: "Functional", planned_date: "2026-11-05", test_date: "2026-11-06", result: "Fail", critical: 0, witness_party: "Project Manager", passed_count: 7, test_count: 9, result_note: "فشل اختبار عزل الكابلات لدائرتين", zone: "B", ...own }],
  ];
}
/** Owner UX depth round: the app's Script Reports as Report records (as bench install creates them), so a scheduled report e-mail can name them. */
function reportDocs(): Rec[] {
  return CONSTRUCTION_REPORTS.map((r): Rec => ["Report", r.name, { report_name: r.name, ref_doctype: r.ref_doctype, report_type: "Script Report", is_standard: "Yes", module: "Digit Construction", disabled: 0 }]);
}
/** Owner UX depth round: one saved Kanban board per Construction workflow, on its status field (list sidebar «Kanban boards»). */
function kanbanBoards(): Rec[] {
  return CONSTRUCTION_WORKFLOWS.map((w): Rec => [`Kanban Board`, `${w.document_type} Status`, { kanban_board_name: `${w.document_type} Status`, reference_doctype: w.document_type, field_name: w.workflow_state_field,
    columns: w.states.map((st, i) => ({ name: `${w.document_type} Status-${i + 1}`, idx: i + 1, column_name: st.state, status: "Active" })) }]);
}
function policies(): Rec[] {
  return [
    ...Object.entries(POLICY_RULINGS).map(([k, p]): Rec => ["Digit Policy Decision", k, { policy_key: k, title: p.title, status: "Defined", effective_date: "2026-10-29", authority: POLICY_AUTHORITY, decision: p.decision, value: p.value ?? "" }]),
    ...Object.entries(POLICY_PENDING).map(([k, p]): Rec => ["Digit Policy Decision", k, { policy_key: k, title: p.title, status: "Undefined", missing_reason: p.missing_reason, affects: p.affects, value: "" }]),
  ];
}
/** Earlier installs seeded P1–P8 as Undefined and P9 as an illustrative assumption; a record still exactly as seeded takes the owner ruling once (edited records are left alone). */
const OLD_UNDEFINED_REASONS = new Set([
  "The owner has not named who approves client final accounts.", "Approver and the retention receivable treatment are not decided.", "Bank accounts and payment methods for subcontractor payments are not approved.",
  "No approver has been designated for Not Applicable closeout items.", "Invoice-matching tolerance and default deductions are not approved.", "Whether expired rates block estimate approval is not decided.",
  "Expense posting accounts and dimensions for site expenses are not mapped.", "The prequalification approver and criteria are not decided.",
]);
function upgradePolicies(): boolean {
  let changed = false;
  for (const [k, p] of Object.entries(POLICY_RULINGS)) {
    const d = adapter.get("Digit Policy Decision", k); if (!d) continue;
    const asSeeded = (d["status"] === "Undefined" && OLD_UNDEFINED_REASONS.has(String(d["missing_reason"] ?? ""))) || (k === "P9" && String(d["authority"] ?? "").startsWith("ILLUSTRATIVE DEMO ASSUMPTION"));
    if (!asSeeded) continue;
    adapter.insertDocQuiet("Digit Policy Decision", { ...d, title: p.title, status: "Defined", effective_date: "2026-10-29", authority: POLICY_AUTHORITY, decision: p.decision, value: p.value ?? "", missing_reason: "" } as Doc);
    changed = true;
  }
  return changed;
}

// ---------------------------------------------------------------- estimating library and tenders
function estimating(): Rec[] {
  const r: Rec[] = [];
  const rate = (code: string, name: string, category: string, uom: string, rate: number, valid: string, supplier = "") => r.push(["Digit Construction Rate", code, { rate_code: code, rate_name: name, category, uom, current_rate: rate, currency: "SAR", effective_date: "2026-01-01", valid_until: valid, supplier, disabled: 0, owner: "estimator@dcc.test" }]);
  rate("MAT-REBAR", "حديد تسليح", "Material", "Ton", 2750, "2026-12-31", `${A}-SUP-STEEL`); rate("MAT-RMC40", "خرسانة جاهزة C40", "Material", "m³", 265, "2026-11-30", `${A}-SUP-RMC`);
  rate("MAT-BLOCK", "بلوك خرساني 20 سم", "Material", "Nos", 2.8, "2026-09-30", `${A}-SUP-BUILD`); rate("MAT-CEMENT", "أسمنت", "Material", "Bag", 16, "2026-10-25", `${A}-SUP-BUILD`);
  rate("LAB-MASON", "عامل بناء — ساعة", "Labour", "Hour", 22, "2026-12-31"); rate("LAB-STEEL", "حداد تسليح — ساعة", "Labour", "Hour", 24, "2026-12-31"); rate("LAB-CARP", "نجار قوالب — ساعة", "Labour", "Hour", 23, "2026-12-31");
  rate("EQP-PUMP", "مضخة خرسانة — ساعة", "Equipment", "Hour", 420, "2026-12-31", `${A}-SUP-RENT`); rate("EQP-EXC", "حفار — ساعة", "Equipment", "Hour", 280, "2026-08-31", `${A}-SUP-RENT`);
  rate("SUB-BLOCKWORK", "مصنعية بلوك — م²", "Subcontract", "m²", 52, "2026-12-31", `${A}-SUB-BLOCK`); rate("SUB-PLASTER", "لياسة ودهان — م²", "Subcontract", "m²", 34, "2026-12-31", `${A}-SUB-FIN`);
  const r0 = r.find((x) => x[1] === "MAT-BLOCK")!; r0[2]["rate_history"] = [{ idx: 1, rate: 2.55, effective_from: "2025-06-01", effective_to: "2025-12-31", supplier: `${A}-SUP-BUILD`, reason: "Annual price review" }];
  const asm = (code: string, title: string, uom: string, comps: [string, number][]) => r.push(["Digit Assembly", code, { assembly_code: code, title, uom, category: "Material", owner: "estimator@dcc.test",
    components: comps.map(([rt, coef], i) => { const x = r.find((y) => y[1] === rt)![2]; return { idx: i + 1, rate: rt, description: x["rate_name"], uom: x["uom"], coefficient: coef, unit_rate: x["current_rate"] }; }) }]);
  asm("ASM-RC-FRAME", "خرسانة مسلحة للهيكل — م³", "m³", [["MAT-RMC40", 1.02], ["MAT-REBAR", 0.12], ["LAB-STEEL", 2.5], ["LAB-CARP", 3], ["EQP-PUMP", 0.08]]);
  asm("ASM-BLOCK-WALL", "جدار بلوك 20 سم — م²", "m²", [["MAT-BLOCK", 12.5], ["MAT-CEMENT", 0.35], ["SUB-BLOCKWORK", 1]]);
  r.push(["Digit Estimate Template", "ETPL-0001", { title: "قالب مبنى خرساني متعدد الطوابق", scope: "Building", owner: "estimator@dcc.test", rows: [
    { idx: 1, group_code: "01", code: "01.01", description: "أعمال الحفر والردم", uom: "m³" }, { idx: 2, group_code: "02", code: "02.01", description: "خرسانة الأساسات", uom: "m³", assembly: "ASM-RC-FRAME" },
    { idx: 3, group_code: "02", code: "02.02", description: "خرسانة الأعمدة والأسقف", uom: "m³", assembly: "ASM-RC-FRAME" }, { idx: 4, group_code: "03", code: "03.01", description: "أعمال البلوك", uom: "m²", assembly: "ASM-BLOCK-WALL" }] }]);
  return r;
}
type L = [code: string, desc: string, uom: string, qty: number, cost: number, sell: number, cc: string];
const BOQ: Record<"A" | "B" | "C", L[]> = {
  A: [["01.01", "أعمال الحفر والردم", "m³", 4200, 28, 35, "CC-01.01"], ["02.01", "خرسانة مسلحة للأساسات", "m³", 1150, 820, 980, "CC-02.01"], ["02.02", "خرسانة مسلحة للأعمدة والأسقف", "m³", 2300, 900, 1080, "CC-02.02"],
    ["03.01", "جدران بلوك 20 سم", "m²", 6800, 62, 78, "CC-03.01"], ["04.01", "أعمال كهروميكانيكية — تمديدات أولى", "LS", 1, 1450000, 1720000, "CC-04.01"], ["05.01", "لياسة ودهان خارجي", "m²", 7500, 38, 48, "CC-05.01"]],
  B: [["01.01", "أعمال الحفر والردم", "m³", 3100, 30, 37, "CC-01.01"], ["02.01", "خرسانة مسلحة للأساسات", "m³", 820, 830, 990, "CC-02.01"], ["02.02", "خرسانة مسلحة للهيكل", "m³", 1500, 910, 1090, "CC-02.02"],
    ["03.01", "جدران بلوك", "m²", 9200, 60, 76, "CC-03.01"], ["06.01", "تشطيبات داخلية للفلل", "m²", 8400, 120, 150, "CC-06.01"]],
  C: [["01.01", "أعمال الموقع العام", "m³", 1800, 31, 39, "CC-01.01"], ["02.01", "الهيكل الخرساني", "m³", 1450, 880, 1050, "CC-02.01"], ["03.01", "جدران وقواطع", "m²", 5200, 64, 80, "CC-03.01"],
    ["06.01", "تشطيبات المدرسة", "m²", 6100, 115, 142, "CC-06.01"], ["07.01", "أعمال خارجية وتنسيق", "m²", 4300, 55, 70, "CC-07.01"]],
};
const PRJ: Record<"A" | "B" | "C", { name: string; title: string; en: string; city: string; cust: string; pm: string; start: string; end: string; tender: string; est: string; boq: string; cc: string; budget: string; wh: string }> = {
  A: { name: DEMO_PROJECTS.A, title: "برج الياسمين التجاري", en: "Al-Yasmin Commercial Tower", city: "الرياض", cust: `${A}-CUST-01`, pm: `${A}-EMP-001`, start: "2026-02-01", end: "2027-06-30", tender: "TND-2026-0001", est: "EST-2026-0002", boq: "BOQ-2026-0001", cc: "CC-2026-0001", budget: "BUD-2026-0001", wh: WH.A },
  B: { name: DEMO_PROJECTS.B, title: "مجمع الواحة السكني", en: "Al-Waha Residential Compound", city: "جدة", cust: `${A}-CUST-02`, pm: `${A}-EMP-004`, start: "2026-03-01", end: "2026-12-31", tender: "TND-2026-0002", est: "EST-2026-0003", boq: "BOQ-2026-0002", cc: "CC-2026-0002", budget: "BUD-2026-0002", wh: WH.B },
  C: { name: DEMO_PROJECTS.C, title: "مدرسة النخبة الأهلية", en: "Al-Nukhba Private School", city: "الدمام", cust: `${A}-CUST-03`, pm: `${A}-EMP-004`, start: "2025-06-01", end: "2026-08-31", tender: "TND-2026-0003", est: "EST-2026-0004", boq: "BOQ-2026-0003", cc: "CC-2026-0003", budget: "BUD-2026-0003", wh: WH.C },
};
const lineKey = (k: string, code: string) => `${k}-${code}`;

function tendersAndContracts(): Rec[] {
  const r: Rec[] = [];
  for (const k of ["A", "B", "C"] as const) {
    const p = PRJ[k]; const lines = BOQ[k];
    r.push(["Digit Tender", p.tender, { title: p.title, customer: p.cust, company: C, project: p.name, issuing_body: CUSTOMERS.find((c) => c[0] === p.cust)![1], tender_reference: `RFP-${k}-2025`, submission_deadline: k === "C" ? "2025-04-20" : "2025-12-15", status: "Won", currency: "SAR", margin_percent: 15,
      emd_amount: 50000, emd_valid_until: k === "C" ? "2025-07-20" : "2026-03-15", performance_guarantee_percent: 5, approved_estimate: p.est, boq: p.boq, owner: "estimator@dcc.test",
      items: lines.map(([code, desc, uom, qty], i) => ({ idx: i + 1, item_key: lineKey(k, code), code, description: desc, uom, qty })) }]);
    r.push(["Digit Estimate Version", p.est, { tender: p.tender, project: p.name, company: C, version: k === "A" ? 2 : 1, base_version: k === "A" ? "EST-2026-0001" : "", currency: "SAR", workflow_state: "Approved", docstatus: 1, approved_by: "director@dcc.test", approved_on: k === "C" ? "2025-04-15" : "2025-12-10", owner: "estimator@dcc.test",
      lines: lines.map(([code, desc, uom, qty, cost, sell], i) => ({ idx: i + 1, line_key: lineKey(k, code), tender_item: lineKey(k, code), code, description: desc, uom, qty, cost_rate: cost, selling_rate: sell })) }]);
    r.push(["Digit BOQ", p.boq, { title: `${p.title} — BOQ`, project: p.name, company: C, tender: p.tender, estimate_version: p.est, revision: 0, workflow_state: "Approved", docstatus: 1, currency: "SAR", approved_by: "pm@dcc.test", approved_on: k === "C" ? "2025-05-20" : "2026-01-15", owner: "qs@dcc.test",
      groups: [...new Set(lines.map((l) => l[0].split(".")[0]!))].map((g, i) => ({ idx: i + 1, group_code: g, description: `القسم ${g}` })),
      items: lines.map(([code, desc, uom, qty, , sell, cc], i) => ({ idx: i + 1, line_key: `B-${lineKey(k, code)}`, group_code: code.split(".")[0], code, description: desc, uom, qty, rate: sell, source_estimate_line: lineKey(k, code), cost_code: cc })) }]);
    const value = lines.reduce((s, l) => s + l[3] * l[5], 0);
    r.push(["Digit Client Contract", p.cc, { title: `عقد ${p.title}`, project: p.name, customer: p.cust, company: C, reference: `CTR-${k}-001`, boq: p.boq, currency: "SAR", start_date: p.start, end_date: p.end, payment_days: 30, taxes_and_charges: `KSA VAT 15% - ${A}`,
      advance_amount: Math.round(value * 0.1 / 1000) * 1000, advance_recovery_pct: 10, retention_pct: 10, retention_cap_pct: 5, workflow_state: "Active", ...(k === "C" ? { __demo_final_state: "Completed" } : {}), owner: "qs@dcc.test",
      sov_lines: lines.map(([code, desc, uom, qty, , sell], i) => ({ idx: i + 1, line_key: `B-${lineKey(k, code)}`, boq_item: `B-${lineKey(k, code)}`, description: desc, uom, qty, rate: sell, origin: "Contract" })) }]);
  }
  // project A: returned first estimate version (rejected/returned example)
  r.push(["Digit Estimate Version", "EST-2026-0001", { tender: PRJ.A.tender, project: PRJ.A.name, company: C, version: 1, currency: "SAR", workflow_state: "Returned", return_reason: "Frame concrete rate below the 2026 supplier quotations; reprice with the new ready-mix rate.", owner: "estimator@dcc.test",
    lines: BOQ.A.map(([code, desc, uom, qty, cost, sell], i) => ({ idx: i + 1, line_key: lineKey("A", code), tender_item: lineKey("A", code), code, description: desc, uom, qty, cost_rate: code === "02.02" ? 840 : cost, selling_rate: code === "02.02" ? 1000 : sell })) }]);
  // tender pipeline beyond the three projects
  const pipe = (name: string, title: string, cust: string, status: string, deadline: string, items: [string, string, string, number][], extra: Record<string, unknown> = {}) => r.push(["Digit Tender", name, { title, customer: cust, company: C, issuing_body: CUSTOMERS.find((c) => c[0] === cust)?.[1] ?? "", submission_deadline: deadline, status, currency: "SAR", margin_percent: 14, owner: "estimator@dcc.test", items: items.map(([code, d, u, q], i) => ({ idx: i + 1, item_key: `${name}-${code}`, code, description: d, uom: u, qty: q })), ...extra }]);
  pipe("TND-2026-0004", "مستودعات الخرج اللوجستية", `${A}-CUST-04`, "Pricing", "2026-11-05", [["01.01", "أعمال ترابية", "m³", 12000], ["02.01", "أرضيات خرسانية صناعية", "m²", 18000], ["08.01", "هيكل معدني للمستودعات", "Ton", 640]], { emd_amount: 120000, emd_valid_until: "2026-12-15" });
  pipe("TND-2026-0005", "مركز الرعاية الصحية — الأحساء", `${A}-CUST-03`, "Submitted", "2026-10-01", [["02.01", "الهيكل الخرساني", "m³", 900], ["06.01", "تشطيبات طبية", "m²", 3200]], { emd_amount: 40000, emd_valid_until: "2026-12-31", approved_estimate: "EST-2026-0006" });
  pipe("TND-2026-0006", "مبنى إداري — تبوك", `${A}-CUST-01`, "Lost", "2026-06-15", [["02.01", "الهيكل الخرساني", "m³", 1300]], { notes: "Lost on price: 6.4% above the winning bid." });
  r.push(["Digit Estimate Version", "EST-2026-0005", { tender: "TND-2026-0004", company: C, version: 1, currency: "SAR", workflow_state: "Draft", owner: "estimator@dcc.test", lines: [
    { idx: 1, line_key: "TND-2026-0004-01.01", tender_item: "TND-2026-0004-01.01", code: "01.01", description: "أعمال ترابية", uom: "m³", qty: 12000, cost_rate: 26, selling_rate: 31 },
    { idx: 2, line_key: "TND-2026-0004-02.01", tender_item: "TND-2026-0004-02.01", code: "02.01", description: "أرضيات خرسانية صناعية", uom: "m²", qty: 18000, cost_rate: 145, selling_rate: 0 },
    { idx: 3, line_key: "TND-2026-0004-08.01", tender_item: "TND-2026-0004-08.01", code: "08.01", description: "هيكل معدني للمستودعات", uom: "Ton", qty: 640, cost_rate: 6900, selling_rate: 0 }] }]);
  r.push(["Digit Estimate Version", "EST-2026-0006", { tender: "TND-2026-0005", company: C, version: 1, currency: "SAR", workflow_state: "Approved", docstatus: 1, approved_by: "director@dcc.test", approved_on: "2026-09-25", owner: "estimator@dcc.test", lines: [
    { idx: 1, line_key: "TND-2026-0005-02.01", tender_item: "TND-2026-0005-02.01", code: "02.01", description: "الهيكل الخرساني", uom: "m³", qty: 900, cost_rate: 905, selling_rate: 1060 },
    { idx: 2, line_key: "TND-2026-0005-06.01", tender_item: "TND-2026-0005-06.01", code: "06.01", description: "تشطيبات طبية", uom: "m²", qty: 3200, cost_rate: 310, selling_rate: 372 }] }]);
  return r;
}

// ---------------------------------------------------------------- projects, tasks, execution
function projectsAndExecution(): Rec[] {
  const r: Rec[] = [];
  // PRJ-TEAM-EXT demo: dated memberships with responsibility scope; C (closed) has ended assignments, A keeps one ended foreman row
  const team = (k: "A" | "B" | "C") => {
    const p = PRJ[k], end = k === "C" ? p.end : undefined;
    const m = (idx: number, employee: string, project_role: string, user: string | undefined, x: Record<string, unknown> = {}) => ({ idx, employee, project_role, ...(user ? { user } : {}), from_date: p.start, ...(end ? { to_date: end } : {}), responsibility: "Whole Project", is_primary: 1, ...x });
    return [m(1, p.pm, "Project Manager", "pm@dcc.test"), m(2, `${A}-EMP-002`, "QS", "qs@dcc.test"),
      m(3, k === "A" ? `${A}-EMP-003` : `${A}-EMP-006`, "Site Engineer", "site@dcc.test", { responsibility: "Work Package", work_package: `WP-${k}2` }), m(4, `${A}-EMP-005`, "Accountant", "finance@dcc.test"),
      m(5, `${A}-EMP-008`, "Procurement", "procurement@dcc.test"),
      ...(k === "A" ? [m(6, `${A}-EMP-007`, "Foreman", undefined, { responsibility: "Work Package", work_package: "WP-A1", to_date: "2026-05-15", is_primary: 0, notes: "سُلّمت الأعمال تحت الأرض" })] : [])];
  };
  const pct = { A: 46, B: 38, C: 100 };
  for (const k of ["A", "B", "C"] as const) {
    const p = PRJ[k];
    r.push(["Project", p.name, { naming_series: "PROJ-.####", project_name: `${p.title} — ${p.city}`, digit_name_en: p.en, digit_city: p.city, digit_contract_type: "Lump Sum", digit_project_manager: p.pm, status: k === "C" ? "Completed" : "Open", is_active: k === "C" ? "No" : "Yes", company: C, customer: p.cust,
      expected_start_date: p.start, expected_end_date: p.end, actual_start_date: p.start, percent_complete_method: "Manual", percent_complete: pct[k], priority: k === "B" ? "High" : "Medium", cost_center: acct("Projects"), estimated_costing: BOQ[k].reduce((s, l) => s + l[3] * l[4], 0), digit_team: team(k), creation: iso(p.start) }]);
  }
  // work packages + tasks (A healthy, B delayed, C complete)
  const wp = (k: "A" | "B" | "C", n: number, code: string, title: string, status: string, s: string, e: string) => r.push(["Digit Work Package", `WP-${k}${n}`, { project: PRJ[k].name, company: C, code, work_package_name: title, status, start_date: s, end_date: e, owner: "pm@dcc.test" }]);
  wp("A", 1, "WP-01", "الأعمال تحت الأرض", "Completed", "2026-02-01", "2026-05-15"); wp("A", 2, "WP-02", "الهيكل الإنشائي", "In Progress", "2026-04-15", "2026-12-31"); wp("A", 3, "WP-03", "الغلاف والتشطيبات", "In Progress", "2026-07-01", "2027-05-31"); wp("A", 4, "WP-04", "الأعمال الكهروميكانيكية", "In Progress", "2026-06-01", "2027-06-15");
  wp("B", 1, "WP-01", "البنية التحتية والأساسات", "Completed", "2026-03-01", "2026-05-31"); wp("B", 2, "WP-02", "هياكل الفلل", "In Progress", "2026-05-01", "2026-09-30"); wp("B", 3, "WP-03", "تشطيبات الفلل", "Not Started", "2026-09-01", "2026-12-31");
  wp("C", 1, "WP-01", "الهيكل والأعمال الإنشائية", "Completed", "2025-06-01", "2026-01-31"); wp("C", 2, "WP-02", "التشطيبات والأعمال الخارجية", "Completed", "2025-12-01", "2026-08-31");
  const task = (k: "A" | "B" | "C", n: number, subject: string, wpn: number, s: string, e: string, progress: number, status: string, wbs: string) =>
    r.push(["Task", `${A}-TASK-${k}${String(n).padStart(2, "0")}`, { subject, project: PRJ[k].name, company: C, status, priority: "Medium", exp_start_date: s, exp_end_date: e, progress, digit_work_package: `WP-${k}${wpn}`, digit_wbs_code: wbs, is_group: 0, ...(status === "Completed" ? { completed_on: e, act_end_date: e } : {}), creation: iso(s) }]);
  task("A", 1, "حفر وتسوية الموقع", 1, "2026-02-01", "2026-03-10", 100, "Completed", "1.1"); task("A", 2, "صب الأساسات", 1, "2026-03-05", "2026-05-15", 100, "Completed", "1.2"); task("A", 3, "هيكل الطوابق 1–5", 2, "2026-05-01", "2026-08-31", 100, "Completed", "2.1");
  task("A", 4, "هيكل الطوابق 6–10", 2, "2026-08-15", "2026-12-15", 55, "Working", "2.2"); task("A", 5, "بلوك الطوابق 1–5", 3, "2026-07-01", "2026-10-31", 70, "Working", "3.1"); task("A", 6, "التمديدات الكهروميكانيكية الأولى", 4, "2026-06-01", "2026-12-31", 35, "Working", "4.1");
  task("A", 7, "اللياسة والدهان الخارجي", 3, "2026-11-01", "2027-03-31", 0, "Open", "3.2"); task("A", 8, "التسليم المرحلي للطوابق التجارية", 3, "2027-04-01", "2027-06-30", 0, "Open", "3.3");
  task("B", 1, "أعمال الحفر والبنية التحتية", 1, "2026-03-01", "2026-04-15", 100, "Completed", "1.1"); task("B", 2, "أساسات الفلل", 1, "2026-04-01", "2026-05-31", 100, "Completed", "1.2"); task("B", 3, "هياكل الفلل — المرحلة 1", 2, "2026-05-01", "2026-08-15", 82, "Overdue", "2.1");
  task("B", 4, "هياكل الفلل — المرحلة 2", 2, "2026-07-01", "2026-09-30", 40, "Overdue", "2.2"); task("B", 5, "جدران البلوك", 2, "2026-08-01", "2026-10-10", 25, "Overdue", "2.3"); task("B", 6, "التشطيبات الداخلية", 3, "2026-09-15", "2026-12-15", 0, "Open", "3.1"); task("B", 7, "تسليم الفلل", 3, "2026-12-01", "2026-12-31", 0, "Open", "3.2");
  task("C", 1, "الهيكل الخرساني", 1, "2025-06-01", "2026-01-31", 100, "Completed", "1.1"); task("C", 2, "الجدران والقواطع", 1, "2025-10-01", "2026-03-31", 100, "Completed", "1.2"); task("C", 3, "التشطيبات الداخلية", 2, "2026-01-15", "2026-07-15", 100, "Completed", "2.1"); task("C", 4, "الأعمال الخارجية", 2, "2026-04-01", "2026-08-15", 100, "Completed", "2.2"); task("C", 5, "الاستلام الابتدائي", 2, "2026-08-16", "2026-08-31", 100, "Completed", "2.3");
  const dep = (n: string, k: "A" | "B" | "C", t: number, pr: number, type = "FS", lag = 0) => r.push(["Digit Task Dependency", n, { project: PRJ[k].name, task: `${A}-TASK-${k}${String(t).padStart(2, "0")}`, predecessor: `${A}-TASK-${k}${String(pr).padStart(2, "0")}`, dependency_type: type, lag_days: lag, owner: "pm@dcc.test" }]);
  dep("TDEP-00001", "A", 2, 1, "FS", -5); dep("TDEP-00002", "A", 3, 2); dep("TDEP-00003", "A", 4, 3, "SS", 60); dep("TDEP-00004", "A", 5, 3, "SS", 30); dep("TDEP-00005", "A", 7, 5, "FS", 0); dep("TDEP-00006", "A", 8, 7);
  dep("TDEP-00007", "B", 3, 2); dep("TDEP-00008", "B", 4, 3, "SS", 45); dep("TDEP-00009", "B", 5, 3, "SS", 60); dep("TDEP-00010", "B", 6, 5); dep("TDEP-00011", "B", 7, 6);
  r.push(["Digit Stage Planning", "STG-0001", { stage_name: "هيكل الطوابق 6–10", project: PRJ.A.name, work_package: "WP-A2", company: C, workflow_state: "Approved", docstatus: 1, planned_start: "2026-08-15", planned_end: "2026-12-15", owner: "site@dcc.test",
    stage_planning_tasks: [{ idx: 1, task: `${A}-TASK-A04`, planned_start: "2026-08-15", planned_end: "2026-12-15", planned_qty: 1100, qty_unit: "m³" }] }]);
  r.push(["Digit Stage Planning", "STG-0002", { stage_name: "هياكل الفلل — إعادة جدولة", project: PRJ.B.name, work_package: "WP-B2", company: C, workflow_state: "Submitted", planned_start: "2026-07-01", planned_end: "2026-11-15", owner: "site@dcc.test",
    stage_planning_tasks: [{ idx: 1, task: `${A}-TASK-B04`, planned_start: "2026-07-01", planned_end: "2026-11-15", planned_qty: 620, qty_unit: "m³" }, { idx: 2, task: `${A}-TASK-B05`, planned_start: "2026-08-15", planned_end: "2026-11-30", planned_qty: 9200, qty_unit: "m²" }],
    delay_reasons: [{ idx: 1, reason: "تأخر توريد حديد التسليح", responsible_party: "Supplier", days_delayed: 18, logged_on: "2026-09-02", note: "PO received only 40% by the promised date." }, { idx: 2, reason: "تعديل مخططات الفلل من العميل", responsible_party: "Client", days_delayed: 12, logged_on: "2026-08-20" }] }]);
  r.push(["Digit Stage Planning", "STG-0003", { stage_name: "تشطيبات الفلل المبكرة", project: PRJ.B.name, work_package: "WP-B3", company: C, workflow_state: "Rejected", reject_reason: "لا يمكن بدء التشطيبات قبل اكتمال الهيكل في المرحلة الثانية.", planned_start: "2026-09-01", planned_end: "2026-11-30", owner: "site@dcc.test", stage_planning_tasks: [{ idx: 1, task: `${A}-TASK-B06` }] }]);
  r.push(["Digit WBS Version", "WBS-0001", { project: PRJ.A.name, version: 1, workflow_state: "Approved", docstatus: 1, approved_by: "pm@dcc.test", approved_on: "2026-02-10", owner: "pm@dcc.test", nodes: [
    { idx: 1, node_code: "1", title: "الأعمال تحت الأرض", node_type: "Phase", work_package: "WP-A1" }, { idx: 2, node_code: "1.1", parent_code: "1", title: "الحفر", node_type: "Cost Code", task: `${A}-TASK-A01`, boq_item_ref: "B-A-01.01", budget_line_ref: "CC-01.01" },
    { idx: 3, node_code: "1.2", parent_code: "1", title: "الأساسات", node_type: "Cost Code", task: `${A}-TASK-A02`, boq_item_ref: "B-A-02.01", budget_line_ref: "CC-02.01" }, { idx: 4, node_code: "2", title: "الهيكل", node_type: "Phase", work_package: "WP-A2" },
    { idx: 5, node_code: "2.1", parent_code: "2", title: "هيكل الطوابق", node_type: "Cost Code", task: `${A}-TASK-A03`, boq_item_ref: "B-A-02.02", budget_line_ref: "CC-02.02" }, { idx: 6, node_code: "3", title: "الغلاف والتشطيبات", node_type: "Phase", work_package: "WP-A3" },
    { idx: 7, node_code: "3.1", parent_code: "3", title: "البلوك", node_type: "Cost Code", task: `${A}-TASK-A05`, boq_item_ref: "B-A-03.01", budget_line_ref: "CC-03.01" }, { idx: 8, node_code: "4", title: "الكهروميكانيك", node_type: "Phase", work_package: "WP-A4", budget_line_ref: "CC-04.01" }] }]);
  const pu = (n: string, k: "A" | "B", task: number, date: string, pct: number, state: string, extra: Record<string, unknown> = {}) => r.push(["Digit Progress Update", n, { project: PRJ[k].name, update_date: date, task: `${A}-TASK-${k}${String(task).padStart(2, "0")}`, progress_pct: pct, workflow_state: state, docstatus: state === "Reviewed" ? 1 : 0, reported_by: k === "A" ? `${A}-EMP-003` : `${A}-EMP-006`, owner: "site@dcc.test", ...extra }]);
  pu("PRG-2026-0001", "A", 3, "2026-08-31", 100, "Reviewed", { notes: "Slab of level 5 poured; frame of levels 1–5 complete." }); pu("PRG-2026-0002", "A", 4, "2026-10-12", 55, "Reviewed", { notes: "Levels 6–7 frame complete, level 8 columns in progress." });
  pu("PRG-2026-0003", "A", 5, "2026-10-15", 72, "Submitted", { notes: "Blockwork levels 1–4 complete." }); pu("PRG-2026-0004", "B", 3, "2026-10-05", 85, "Returned", { review_note: "Photos missing for villas 7–9; resubmit with evidence.", notes: "Phase 1 frames nearly complete." });
  pu("PRG-2026-0005", "B", 4, "2026-10-08", 40, "Reviewed", { notes: "Phase 2 frames held by rebar shortage." });
  const sar = (n: string, k: "A" | "B", date: string, weather: string, men: number, eq: number, incidents: number, issues: string, acts: [string, number, number, number, string][]) => r.push(["Digit Site Activity Report", n, { project: PRJ[k].name, report_date: date, weather, manpower_count: men, equipment_count: eq, safety_incidents: incidents, issues, prepared_by: k === "A" ? `${A}-EMP-003` : `${A}-EMP-006`, docstatus: 1, status: "Submitted", owner: "site@dcc.test",
    activities: acts.map(([activity, task, hours, qty, uom], i) => ({ idx: i + 1, activity, task: `${A}-TASK-${k}${String(task).padStart(2, "0")}`, hours, qty, uom, crew: k === "A" ? "CREW-0001" : "CREW-0002" })) }]);
  sar("SAR-2026-0001", "A", "2026-10-14", "Hot", 64, 7, 0, "", [["صب سقف الطابق 7", 4, 10, 185, "m³"], ["بلوك الطابق 4", 5, 9, 420, "m²"]]);
  sar("SAR-2026-0002", "A", "2026-10-15", "Dusty", 61, 6, 0, "عاصفة غبار أوقفت الرافعة ساعتين", [["تسليح أعمدة الطابق 8", 4, 9, 14, "Ton"]]);
  sar("SAR-2026-0003", "B", "2026-10-14", "Hot", 38, 4, 1, "نقص حديد التسليح لفلل المرحلة 2؛ إصابة طفيفة لعامل (إسعاف أولي)", [["صب أسقف فلل 10–11", 4, 8, 64, "m³"], ["بلوك فلل 1–3", 5, 8, 210, "m²"]]);
  return r;
}

// ---------------------------------------------------------------- client commercial chain
function commercial(): Rec[] {
  const r: Rec[] = [];
  const sk = (k: string, code: string) => `B-${k}-${code}`;
  // variations
  r.push(["Digit Client Variation", "VO-2026-0001", { title: "عزل مائي إضافي للقبو", contract: PRJ.A.cc, project: PRJ.A.name, customer: PRJ.A.cust, change_kind: "Client Variation", origin: "Client Instruction", workflow_state: "Approved", docstatus: 1, requested_on: "2026-04-10", approved_on: "2026-04-28", approved_by: "director@dcc.test", time_days: 0, owner: "qs@dcc.test",
    lines: [{ idx: 1, line_key: "VL-1", description: "عزل مائي إضافي للقبو", uom: "m²", qty: 1800, rate: 55 }] }]);
  r.push(["Digit Client Variation", "VO-2026-0002", { title: "ترقية تكسية الواجهة", contract: PRJ.A.cc, project: PRJ.A.name, customer: PRJ.A.cust, change_kind: "Client Variation", origin: "Design Change", workflow_state: "Submitted", requested_on: "2026-10-02", time_days: 21, owner: "qs@dcc.test",
    lines: [{ idx: 1, line_key: "VL-1", description: "تكسية واجهة ألمنيوم مركب", uom: "m²", qty: 2000, rate: 140 }], cost_effect_note: "Budget revision to follow approval (cladding subcontract)." }]);
  r.push(["Digit Client Variation", "VO-2026-0003", { title: "تغيير نوع البلاط", contract: PRJ.B.cc, project: PRJ.B.name, customer: PRJ.B.cust, change_kind: "Client Variation", origin: "Client Instruction", workflow_state: "Rejected", decision_note: "Client withdrew the request after cost review.", requested_on: "2026-07-01", owner: "qs@dcc.test",
    lines: [{ idx: 1, line_key: "VL-1", description: "بلاط رخامي بدل البورسلان", uom: "m²", qty: 2400, rate: 95 }] }]);
  r.push(["Digit Client Variation", "VO-2026-0004", { title: "إعادة تسلسل صب الفلل (داخلي)", contract: PRJ.B.cc, project: PRJ.B.name, customer: PRJ.B.cust, change_kind: "Internal Scope Change", origin: "Site Condition", workflow_state: "Draft", requested_on: "2026-10-10", owner: "pm@dcc.test", lines: [] }]);
  // claims + certificates + invoices + payments
  type Cl = { name: string; no: number; contract: string; k: "A" | "B" | "C"; end: string; cum: [string, number][]; state: string };
  const claims: Cl[] = [
    { name: "CLM-2026-0001", no: 1, contract: PRJ.A.cc, k: "A", end: "2026-05-31", cum: [["01.01", 4200], ["02.01", 600]], state: "Certified" },
    { name: "CLM-2026-0002", no: 2, contract: PRJ.A.cc, k: "A", end: "2026-07-31", cum: [["01.01", 4200], ["02.01", 1150], ["02.02", 900], ["03.01", 1500]], state: "Partly Certified" },
    { name: "CLM-2026-0003", no: 3, contract: PRJ.A.cc, k: "A", end: "2026-09-30", cum: [["01.01", 4200], ["02.01", 1150], ["02.02", 1700], ["03.01", 3600], ["04.01", 0.3], ["VAR", 900]], state: "Submitted" },
    { name: "CLM-2026-0004", no: 1, contract: PRJ.B.cc, k: "B", end: "2026-06-30", cum: [["01.01", 3100], ["02.01", 820], ["02.02", 300]], state: "Certified" },
    { name: "CLM-2026-0005", no: 2, contract: PRJ.B.cc, k: "B", end: "2026-09-30", cum: [["01.01", 3100], ["02.01", 820], ["02.02", 820], ["03.01", 1800]], state: "Submitted" },
    { name: "CLM-2026-0006", no: 1, contract: PRJ.C.cc, k: "C", end: "2025-12-31", cum: [["01.01", 1800], ["02.01", 1450], ["03.01", 2000]], state: "Certified" },
    { name: "CLM-2026-0007", no: 2, contract: PRJ.C.cc, k: "C", end: "2026-04-30", cum: [["01.01", 1800], ["02.01", 1450], ["03.01", 5200], ["06.01", 3500]], state: "Certified" },
    { name: "CLM-2026-0008", no: 3, contract: PRJ.C.cc, k: "C", end: "2026-08-31", cum: [["01.01", 1800], ["02.01", 1450], ["03.01", 5200], ["06.01", 6100], ["07.01", 4300]], state: "Certified" },
  ];
  for (const c of claims) r.push(["Digit Client Claim", c.name, { contract: c.contract, claim_no: c.no, period_end: c.end, claim_date: c.end, workflow_state: c.state, docstatus: 1, owner: "qs@dcc.test",
    lines: c.cum.map(([code, q], i) => ({ idx: i + 1, sov_line_key: code === "VAR" ? "VO-2026-0001-VL-1" : sk(c.k, code), cumulative_qty: q })) }]);
  r.push(["Digit Client Claim", "CLM-2026-0009", { contract: PRJ.A.cc, claim_no: 4, period_end: "2026-10-31", claim_date: "2026-10-16", workflow_state: "Draft", owner: "qs@dcc.test",
    lines: [["01.01", 4200], ["02.01", 1150], ["02.02", 2050], ["03.01", 4700], ["04.01", 0.35]].map(([code, q], i) => ({ idx: i + 1, sov_line_key: sk("A", String(code)), cumulative_qty: q })) }]);
  type Ce = { name: string; claim: string; date: string; state: string; rejects?: Record<string, [number, string]>; si?: [string, string, number] };
  const certs: Ce[] = [
    { name: "CERT-2026-0001", claim: "CLM-2026-0001", date: "2026-06-12", state: "Invoiced", si: ["DCC-SINV-0001", "2026-06-15", 1] },
    { name: "CERT-2026-0002", claim: "CLM-2026-0002", date: "2026-08-14", state: "Invoiced", rejects: { "03.01": [200, "Level 3 blockwork not yet inspected by the consultant"] }, si: ["DCC-SINV-0002", "2026-08-18", 0.5] },
    { name: "CERT-2026-0004", claim: "CLM-2026-0004", date: "2026-07-12", state: "Invoiced", si: ["DCC-SINV-0003", "2026-07-15", 0] },
    { name: "CERT-2026-0006", claim: "CLM-2026-0006", date: "2026-01-15", state: "Invoiced", si: ["DCC-SINV-0004", "2026-01-18", 1] },
    { name: "CERT-2026-0007", claim: "CLM-2026-0007", date: "2026-05-14", state: "Invoiced", si: ["DCC-SINV-0005", "2026-05-17", 1] },
    { name: "CERT-2026-0008", claim: "CLM-2026-0008", date: "2026-09-10", state: "Invoiced", si: ["DCC-SINV-0006", "2026-09-12", 0.6] },
    { name: "CERT-2026-0003", claim: "CLM-2026-0003", date: "2026-10-14", state: "Draft", rejects: { "02.02": [50, "Level 9 slab cubes pending 28-day results"] } },
  ];
  for (const c of certs) r.push(["Digit Client Certificate", c.name, { claim: c.claim, cert_date: c.date, workflow_state: c.state === "Draft" ? "Draft" : "Confirmed", __final_state: c.state, docstatus: 0, reviewer: "استشاري المشروع", owner: "qs@dcc.test", __rejects: c.rejects, __si: c.si }]);
  return r;
}

// ---------------------------------------------------------------- subcontracting
function subcontract(): Rec[] {
  const r: Rec[] = [];
  r.push(["Digit Subcontractor Profile", "SCP-0001", { supplier: `${A}-SUB-BLOCK`, trade: "Civil", classification_grade: "3rd", workflow_state: "Under Review", cr_number: "1010456789", cr_expiry: "2027-03-01", vat_number: "310456789000003", insurance_expiry: new Date(Date.now() + 29 * 864e5).toISOString().slice(0, 10) /* expiring within 30 days on every visit (was a fixed date that lapsed on 16/11/2026) */, score: 0.8, owner: "procurement@dcc.test" }]);
  r.push(["Digit Subcontractor Profile", "SCP-0002", { supplier: `${A}-SUB-MEP`, trade: "MEP", classification_grade: "2nd", workflow_state: "Under Review", cr_number: "2050112233", cr_expiry: "2026-10-30", vat_number: "300112233000003", insurance_expiry: "2027-01-31", score: 0.8, owner: "procurement@dcc.test" }]);
  r.push(["Digit Subcontractor Profile", "SCP-0003", { supplier: `${A}-SUB-FIN`, trade: "Finishing", classification_grade: "4th", workflow_state: "Draft", cr_number: "2051998877", owner: "procurement@dcc.test" }]);
  const wo = (n: string, sub: string, k: "A" | "B" | "C", date: string, state: string, ret: number, lines: [string, string, string, number, number, string][], extra: Record<string, unknown> = {}) =>
    r.push(["Digit Subcontract Work Order", n, { subcontractor: sub, project: PRJ[k].name, company: C, wo_date: date, workflow_state: state, docstatus: state === "Draft" ? 0 : 1, retention_percent: ret, advance_amount: 0, advance_recovery_pct: 0, owner: "procurement@dcc.test",
      lines: lines.map(([key, scope, uom, qty, rate, cc], i) => ({ idx: i + 1, line_key: key, scope, uom, qty, rate, cost_code: cc })), ...extra }]);
  wo("SWO-2026-0001", `${A}-SUB-BLOCK`, "A", "2026-06-20", "Active", 10, [["WOA1-1", "مصنعية بلوك 20 سم", "m²", 6800, 52, "CC-03.01"]]);
  wo("SWO-2026-0002", `${A}-SUB-MEP`, "A", "2026-05-25", "Active", 10, [["WOA2-1", "تمديدات كهربائية أولى", "LS", 1, 760000, "CC-04.01"], ["WOA2-2", "تمديدات ميكانيكية أولى", "LS", 1, 520000, "CC-04.01"]], { advance_amount: 128000, advance_recovery_pct: 10 });
  wo("SWO-2026-0003", `${A}-SUB-BLOCK`, "B", "2026-07-15", "Active", 10, [["WOB1-1", "مصنعية بلوك للفلل", "m²", 9200, 50, "CC-03.01"]]);
  wo("SWO-2026-0004", `${A}-SUB-FIN`, "C", "2026-01-05", "Active", 5, [["WOC1-1", "تشطيبات داخلية", "m²", 6100, 88, "CC-06.01"]], { __demo_final_state: "Completed" });
  wo("SWO-2026-0005", `${A}-SUB-FIN`, "A", "2026-10-15", "Draft", 10, [["WOA3-1", "لياسة ودهان خارجي", "m²", 7500, 34, "CC-05.01"]]);
  const mb = (n: string, w: string, date: string, state: string, entries: [string, number, number, number, number?, number?, string?][], extra: Record<string, unknown> = {}) =>
    r.push(["Digit Measurement Book", n, { work_order: w, mb_date: date, workflow_state: state, docstatus: 0, __final_doc: state === "Certified" ? 1 : 0, measured_by: `${A}-EMP-003`, owner: "site@dcc.test",
      entries: entries.map(([key, nos, len, ht, acc, rej, reason], i) => ({ idx: i + 1, wo_line_key: key, nos, length: len, breadth: 0, depth: ht, location: `منطقة ${i + 1}`, ...(acc !== undefined ? { accepted_qty: acc, rejected_qty: rej ?? 0, reject_reason: reason ?? "" } : {}) })), ...extra }]);
  mb("MB-2026-0001", "SWO-2026-0001", "2026-07-30", "Certified", [["WOA1-1", 1, 500, 3]]);
  mb("MB-2026-0002", "SWO-2026-0001", "2026-08-30", "Certified", [["WOA1-1", 1, 700, 3, 2000, 100, "Joints not raked on level 3 east wall"]]);
  mb("MB-2026-0003", "SWO-2026-0001", "2026-10-12", "Submitted", [["WOA1-1", 1, 400, 3]]);
  mb("MB-2026-0004", "SWO-2026-0003", "2026-09-25", "Returned", [["WOB1-1", 1, 600, 3]], { return_reason: "Measurement includes openings; deduct doors and windows and resubmit." });
  mb("MB-2026-0005", "SWO-2026-0003", "2026-08-28", "Certified", [["WOB1-1", 1, 400, 3]]);
  mb("MB-2026-0006", "SWO-2026-0004", "2026-04-30", "Certified", [["WOC1-1", 1, 3500, 1]]);
  mb("MB-2026-0007", "SWO-2026-0004", "2026-08-20", "Certified", [["WOC1-1", 1, 2600, 1]]);
  mb("MB-2026-0008", "SWO-2026-0002", "2026-09-28", "Certified", [["WOA2-1", 0, 0, 0], ["WOA2-2", 0, 0, 0]], { __qty: { "WOA2-1": 0.3, "WOA2-2": 0.25 } });
  const bill = (n: string, w: string, book: string, date: string, state: string, inv: string, lines: [string, number][], pi?: [string, string, number]) =>
    r.push(["Digit Subcontractor Bill", n, { work_order: w, measurement_book: book, bill_date: date, workflow_state: state === "Draft" ? "Draft" : "Approved", __final_state: state, docstatus: 0, supplier_invoice_no: inv, taxes_and_charges: `KSA VAT 15% Input - ${A}`, owner: "qs@dcc.test",
      lines: lines.map(([key, q], i) => ({ idx: i + 1, wo_line_key: key, this_period_qty: q })), __pi: pi }]);
  bill("SCB-2026-0001", "SWO-2026-0001", "MB-2026-0001", "2026-08-05", "Invoiced", "BM-INV-1041", [["WOA1-1", 1500]], ["DCC-PINV-0001", "2026-08-08", 1]);
  bill("SCB-2026-0002", "SWO-2026-0001", "MB-2026-0002", "2026-09-05", "Approved", "BM-INV-1077", [["WOA1-1", 2000]]);
  bill("SCB-2026-0003", "SWO-2026-0003", "MB-2026-0005", "2026-09-03", "Invoiced", "BM-INV-2102", [["WOB1-1", 1200]], ["DCC-PINV-0002", "2026-09-06", 0]);
  bill("SCB-2026-0004", "SWO-2026-0004", "MB-2026-0006", "2026-05-08", "Invoiced", "LF-0091", [["WOC1-1", 3500]], ["DCC-PINV-0003", "2026-05-10", 1]);
  bill("SCB-2026-0005", "SWO-2026-0004", "MB-2026-0007", "2026-08-28", "Invoiced", "LF-0133", [["WOC1-1", 2600]], ["DCC-PINV-0004", "2026-08-30", 1]);
  bill("SCB-2026-0006", "SWO-2026-0002", "MB-2026-0008", "2026-10-05", "Draft", "TQ-5520", [["WOA2-1", 0.3], ["WOA2-2", 0.25]]);
  return r;
}

// ---------------------------------------------------------------- procurement (native documents)
function procurement(): Rec[] {
  const r: Rec[] = [];
  type It = [item: string, qty: number, rate: number, cc: string];
  const it = (k: "A" | "B" | "C", items: It[], extra: (i: number) => Record<string, unknown> = () => ({})) => items.map(([code, qty, rate, cc], i) => {
    const m = ITEMS.find((x) => x[0] === code)!; return { idx: i + 1, name: `${code}-${k}-${i + 1}`, item_code: code, item_name: m[1], description: m[1], qty, uom: m[2], stock_uom: m[2], conversion_factor: 1, stock_qty: qty, rate, amount: lineAmount(qty, rate), net_rate: rate, net_amount: lineAmount(qty, rate), project: PRJ[k].name, digit_cost_code: cc, warehouse: PRJ[k].wh, ...extra(i) };
  });
  const tot = (items: { amount: number }[]) => { const net = r2(items.reduce((s, x) => s + x.amount, 0)); const tax = r2(net * 0.15); return { total: net, net_total: net, base_net_total: net, total_taxes_and_charges: tax, grand_total: r2(net + tax), base_grand_total: r2(net + tax), rounded_total: r2(net + tax), disable_rounded_total: 1, currency: "SAR", conversion_rate: 1 }; };
  const taxes = (net: number) => [{ idx: 1, charge_type: "On Net Total", account_head: acct("VAT 15% Input"), description: "VAT 15%", rate: 15, net_amount: r2(net), base_net_amount: r2(net), tax_amount: r2(net * 0.15), base_tax_amount: r2(net * 0.15), total: r2(net * 1.15), base_total: r2(net * 1.15), category: "Total", add_deduct_tax: "Add" }];
  const base = (sup: string) => ({ company: C, supplier: sup, supplier_name: SUPPLIERS.find((s) => s[0] === sup)![1], buying_price_list: "Standard Buying", taxes_and_charges: `KSA VAT 15% Input - ${A}` });
  // A: MR → RFQ → 2 SQ → PO (award) → PR (full) → PI (paid) → Stock issue
  const aItems: It[] = [[`${A}-MAT-REBAR`, 120, 2700, "CC-02.02"], [`${A}-MAT-CEMENT`, 3000, 15.5, "CC-02.02"]];
  const mrA = it("A", aItems, () => ({ schedule_date: "2026-06-15", ordered_qty: 0 }));
  r.push(["Material Request", "DCC-MR-0001", { naming_series: "MAT-MR-.YYYY.-", title: "مواد هيكل الطوابق 1–5", material_request_type: "Purchase", company: C, transaction_date: "2026-05-20", schedule_date: "2026-06-15", set_warehouse: WH.A, items: mrA.map((x): Row => ({ ...x, ordered_qty: x.qty })), status: "Ordered", per_ordered: 100, docstatus: 1, owner: "site@dcc.test", creation: iso("2026-05-20") }]);
  r.push(["Request for Quotation", "DCC-RFQ-0001", { naming_series: "PUR-RFQ-.YYYY.-", company: C, transaction_date: "2026-05-22", schedule_date: "2026-06-15", status: "Submitted", docstatus: 1, message_for_supplier: "يرجى تقديم أفضل سعر مع مدة التوريد.",
    suppliers: [{ idx: 1, supplier: `${A}-SUP-STEEL`, supplier_name: SUPPLIERS[0]![1] }, { idx: 2, supplier: `${A}-SUP-BUILD`, supplier_name: SUPPLIERS[2]![1] }], items: mrA.map((x): Row => ({ ...x, material_request: "DCC-MR-0001", material_request_item: x.name })), creation: iso("2026-05-22") }]);
  const sqA1 = it("A", aItems, (i) => ({ request_for_quotation: "DCC-RFQ-0001", material_request: "DCC-MR-0001", material_request_item: mrA[i]!.name, lead_time_days: i ? 5 : 10 }));
  const sqA2 = it("A", [[`${A}-MAT-REBAR`, 120, 2790, "CC-02.02"], [`${A}-MAT-CEMENT`, 3000, 15.2, "CC-02.02"]], (i) => ({ request_for_quotation: "DCC-RFQ-0001", material_request: "DCC-MR-0001", material_request_item: mrA[i]!.name, lead_time_days: 7 }));
  r.push(["Supplier Quotation", "DCC-SQ-0001", { naming_series: "PUR-SQTN-.YYYY.-", ...base(`${A}-SUP-STEEL`), transaction_date: "2026-05-25", valid_till: "2026-06-25", items: sqA1, ...tot(sqA1), taxes: taxes(tot(sqA1).net_total), status: "Submitted", docstatus: 1, creation: iso("2026-05-25") }]);
  r.push(["Supplier Quotation", "DCC-SQ-0002", { naming_series: "PUR-SQTN-.YYYY.-", ...base(`${A}-SUP-BUILD`), transaction_date: "2026-05-26", valid_till: "2026-06-20", items: sqA2, ...tot(sqA2), taxes: taxes(tot(sqA2).net_total), status: "Submitted", docstatus: 1, creation: iso("2026-05-26") }]);
  const poA = it("A", aItems, (i) => ({ schedule_date: "2026-06-12", supplier_quotation: "DCC-SQ-0001", supplier_quotation_item: sqA1[i]!.name, material_request: "DCC-MR-0001", material_request_item: mrA[i]!.name, received_qty: aItems[i]![1], billed_amt: lineAmount(aItems[i]![1], aItems[i]![2]) }));
  r.push(["Purchase Order", "DCC-PO-0001", { naming_series: "PUR-ORD-.YYYY.-", ...base(`${A}-SUP-STEEL`), transaction_date: "2026-05-28", schedule_date: "2026-06-12", set_warehouse: WH.A, items: poA, ...tot(poA), taxes: taxes(tot(poA).net_total), status: "Completed", per_received: 100, per_billed: 100, docstatus: 1, owner: "procurement@dcc.test", creation: iso("2026-05-28") }]);
  const prA = it("A", aItems, (i) => ({ purchase_order: "DCC-PO-0001", purchase_order_item: poA[i]!.name, received_qty: aItems[i]![1], valuation_rate: aItems[i]![2] }));
  r.push(["Purchase Receipt", "DCC-PR-0001", { naming_series: "MAT-PRE-.YYYY.-", ...base(`${A}-SUP-STEEL`), posting_date: "2026-06-10", set_warehouse: WH.A, items: prA, ...tot(prA), taxes: taxes(tot(prA).net_total), status: "Completed", per_billed: 100, docstatus: 1, creation: iso("2026-06-10") }]);
  const piA = it("A", aItems, (i) => ({ purchase_order: "DCC-PO-0001", po_detail: poA[i]!.name, purchase_receipt: "DCC-PR-0001", expense_account: acct("Construction Materials"), cost_center: acct("Projects") }));
  r.push(["Purchase Invoice", "DCC-PINV-0005", { naming_series: "ACC-PINV-.YYYY.-", ...base(`${A}-SUP-STEEL`), posting_date: "2026-06-14", bill_no: "NSF-26-4471", due_date: "2026-07-14", credit_to: acct("Creditors"), project: PRJ.A.name, items: piA, ...tot(piA), taxes: taxes(tot(piA).net_total), outstanding_amount: 0, status: "Paid", docstatus: 1, creation: iso("2026-06-14") }]);
  r.push(["Payment Entry", "DCC-PE-P-0005", { naming_series: "ACC-PAY-.YYYY.-", payment_type: "Pay", party_type: "Supplier", party: `${A}-SUP-STEEL`, party_name: SUPPLIERS[0]![1], company: C, posting_date: "2026-07-10", paid_from: acct("Al-Rajhi Demo Bank"), paid_to: acct("Creditors"), paid_amount: tot(piA).grand_total, received_amount: tot(piA).grand_total, mode_of_payment: "Bank Transfer", reference_no: "TRF-77120", reference_date: "2026-07-10", project: PRJ.A.name,
    references: [{ idx: 1, reference_doctype: "Purchase Invoice", reference_name: "DCC-PINV-0005", total_amount: tot(piA).grand_total, outstanding_amount: tot(piA).grand_total, allocated_amount: tot(piA).grand_total }], status: "Submitted", docstatus: 1, creation: iso("2026-07-10") }]);
  r.push(["Stock Entry", "DCC-STE-0001", { naming_series: "MAT-STE-.YYYY.-", stock_entry_type: "Material Issue", purpose: "Material Issue", company: C, posting_date: "2026-06-20", posting_time: "10:00:00", project: PRJ.A.name, from_warehouse: WH.A, remarks: "صرف حديد وأسمنت لهيكل الطوابق 1–3", docstatus: 1, creation: iso("2026-06-20"),
    items: [{ idx: 1, s_warehouse: WH.A, item_code: `${A}-MAT-REBAR`, item_name: ITEMS[0]![1], qty: 80, transfer_qty: 80, uom: "Ton", stock_uom: "Ton", conversion_factor: 1, basic_rate: 2700, valuation_rate: 2700, basic_amount: 216000, amount: 216000, project: PRJ.A.name, digit_cost_code: "CC-02.02", cost_center: acct("Projects") },
      { idx: 2, s_warehouse: WH.A, item_code: `${A}-MAT-CEMENT`, item_name: ITEMS[1]![1], qty: 2100, transfer_qty: 2100, uom: "Bag", stock_uom: "Bag", conversion_factor: 1, basic_rate: 15.5, valuation_rate: 15.5, basic_amount: 32550, amount: 32550, project: PRJ.A.name, digit_cost_code: "CC-02.02", cost_center: acct("Projects") }] }]);
  // A: ready-mix PO open (commitment, partially received)
  const poA2 = it("A", [[`${A}-MAT-RMC`, 1400, 262, "CC-02.02"]], () => ({ schedule_date: "2026-11-30", received_qty: 700, billed_amt: 0 }));
  r.push(["Purchase Order", "DCC-PO-0002", { naming_series: "PUR-ORD-.YYYY.-", ...base(`${A}-SUP-RMC`), transaction_date: "2026-08-10", schedule_date: "2026-11-30", set_warehouse: WH.A, items: poA2, ...tot(poA2), taxes: taxes(tot(poA2).net_total), status: "To Receive and Bill", per_received: 50, per_billed: 0, docstatus: 1, owner: "procurement@dcc.test", creation: iso("2026-08-10") }]);
  const prA2 = it("A", [[`${A}-MAT-RMC`, 700, 262, "CC-02.02"]], () => ({ purchase_order: "DCC-PO-0002", purchase_order_item: poA2[0]!.name, received_qty: 700 }));
  r.push(["Purchase Receipt", "DCC-PR-0002", { naming_series: "MAT-PRE-.YYYY.-", ...base(`${A}-SUP-RMC`), posting_date: "2026-09-20", set_warehouse: WH.A, items: prA2, ...tot(prA2), taxes: taxes(tot(prA2).net_total), status: "To Bill", docstatus: 1, creation: iso("2026-09-20") }]);
  // B: MR overdue partly ordered → RFQ overdue (no quotes) → PO partially received & late; tile MR pending
  const bItems: It[] = [[`${A}-MAT-REBAR`, 60, 2760, "CC-02.02"]];
  const mrB = it("B", bItems, () => ({ schedule_date: "2026-09-20", ordered_qty: 30 }));
  r.push(["Material Request", "DCC-MR-0002", { naming_series: "MAT-MR-.YYYY.-", title: "حديد فلل المرحلة 2", material_request_type: "Purchase", company: C, transaction_date: "2026-08-25", schedule_date: "2026-09-20", set_warehouse: WH.B, items: mrB, status: "Partially Ordered", per_ordered: 50, docstatus: 1, owner: "site@dcc.test", creation: iso("2026-08-25") }]);
  const mrB2 = it("B", [[`${A}-MAT-TILE`, 8400, 44, "CC-06.01"]], () => ({ schedule_date: "2026-10-05", ordered_qty: 0 }));
  r.push(["Material Request", "DCC-MR-0003", { naming_series: "MAT-MR-.YYYY.-", title: "بلاط التشطيبات الداخلية", material_request_type: "Purchase", company: C, transaction_date: "2026-09-10", schedule_date: "2026-10-05", set_warehouse: WH.B, items: mrB2, status: "Pending", per_ordered: 0, docstatus: 1, owner: "site@dcc.test", creation: iso("2026-09-10") }]);
  r.push(["Request for Quotation", "DCC-RFQ-0002", { naming_series: "PUR-RFQ-.YYYY.-", company: C, transaction_date: "2026-09-12", schedule_date: "2026-09-25", status: "Submitted", docstatus: 1, message_for_supplier: "مطلوب عرض سعر عاجل للبلاط.",
    suppliers: [{ idx: 1, supplier: `${A}-SUP-BUILD`, supplier_name: SUPPLIERS[2]![1] }], items: mrB2.map((x): Row => ({ ...x, material_request: "DCC-MR-0003", material_request_item: x.name })), creation: iso("2026-09-12") }]);
  const poB = it("B", [[`${A}-MAT-REBAR`, 30, 2760, "CC-02.02"]], () => ({ schedule_date: "2026-09-30", material_request: "DCC-MR-0002", material_request_item: mrB[0]!.name, received_qty: 12, billed_amt: 0 }));
  r.push(["Purchase Order", "DCC-PO-0003", { naming_series: "PUR-ORD-.YYYY.-", ...base(`${A}-SUP-STEEL`), transaction_date: "2026-09-01", schedule_date: "2026-09-30", set_warehouse: WH.B, items: poB, ...tot(poB), taxes: taxes(tot(poB).net_total), status: "To Receive and Bill", per_received: 40, per_billed: 0, docstatus: 1, owner: "procurement@dcc.test", creation: iso("2026-09-01") }]);
  const prB = it("B", [[`${A}-MAT-REBAR`, 12, 2760, "CC-02.02"]], () => ({ purchase_order: "DCC-PO-0003", purchase_order_item: poB[0]!.name, received_qty: 12 }));
  r.push(["Purchase Receipt", "DCC-PR-0003", { naming_series: "MAT-PRE-.YYYY.-", ...base(`${A}-SUP-STEEL`), posting_date: "2026-09-28", set_warehouse: WH.B, items: prB, ...tot(prB), taxes: taxes(tot(prB).net_total), status: "To Bill", docstatus: 1, creation: iso("2026-09-28") }]);
  // B: material actuals (concrete frames) — PI without receipt for already-consumed ready-mix → posted actual
  const piB = it("B", [[`${A}-MAT-RMC`, 1450, 268, "CC-02.02"], [`${A}-MAT-REBAR`, 150, 2790, "CC-02.02"]], () => ({ expense_account: acct("Construction Materials"), cost_center: acct("Projects") }));
  r.push(["Purchase Invoice", "DCC-PINV-0006", { naming_series: "ACC-PINV-.YYYY.-", ...base(`${A}-SUP-RMC`), posting_date: "2026-08-31", bill_no: "MC-26-0912", due_date: "2026-09-30", credit_to: acct("Creditors"), project: PRJ.B.name, items: piB, ...tot(piB), taxes: taxes(tot(piB).net_total), outstanding_amount: tot(piB).grand_total, status: "Overdue", docstatus: 1, creation: iso("2026-08-31") }]);
  // B: generator rental booked directly as a journal entry — journal lines carry no cost code, so it lands unallocated (Cost source verifier → allocate)
  r.push(["Journal Entry", "DCC-JV-0001", { naming_series: "ACC-JV-.YYYY.-", voucher_type: "Journal Entry", company: C, posting_date: "2026-09-15", user_remark: "تأجير مولد كهربائي مؤقت لموقع الواحة — سبتمبر 2026",
    accounts: [{ idx: 1, account: acct("Site Expenses"), debit_in_account_currency: 6500, debit: 6500, credit_in_account_currency: 0, credit: 0, project: PRJ.B.name, cost_center: acct("Projects") },
      { idx: 2, account: acct("Al-Rajhi Demo Bank"), debit_in_account_currency: 0, debit: 0, credit_in_account_currency: 6500, credit: 6500 }], total_debit: 6500, total_credit: 6500, docstatus: 1, creation: iso("2026-09-15") }]);
  // C: closed material invoice (paid)
  const piC = it("C", [[`${A}-MAT-RMC`, 1500, 255, "CC-02.01"], [`${A}-MAT-REBAR`, 170, 2650, "CC-02.01"]], () => ({ expense_account: acct("Construction Materials"), cost_center: acct("Projects") }));
  r.push(["Purchase Invoice", "DCC-PINV-0007", { naming_series: "ACC-PINV-.YYYY.-", ...base(`${A}-SUP-RMC`), posting_date: "2026-01-20", bill_no: "MC-26-0110", due_date: "2026-02-20", credit_to: acct("Creditors"), project: PRJ.C.name, items: piC, ...tot(piC), taxes: taxes(tot(piC).net_total), outstanding_amount: 0, status: "Paid", docstatus: 1, creation: iso("2026-01-20") }]);
  r.push(["Payment Entry", "DCC-PE-P-0007", { naming_series: "ACC-PAY-.YYYY.-", payment_type: "Pay", party_type: "Supplier", party: `${A}-SUP-RMC`, party_name: SUPPLIERS[1]![1], company: C, posting_date: "2026-02-18", paid_from: acct("Al-Rajhi Demo Bank"), paid_to: acct("Creditors"), paid_amount: tot(piC).grand_total, received_amount: tot(piC).grand_total, mode_of_payment: "Bank Transfer", reference_no: "TRF-40211", reference_date: "2026-02-18",
    references: [{ idx: 1, reference_doctype: "Purchase Invoice", reference_name: "DCC-PINV-0007", total_amount: tot(piC).grand_total, outstanding_amount: tot(piC).grand_total, allocated_amount: tot(piC).grand_total }], status: "Submitted", docstatus: 1, creation: iso("2026-02-18") }]);
  return r;
}

// ---------------------------------------------------------------- budgets, revisions, forecasts
function cost(): Rec[] {
  const r: Rec[] = [];
  const BUD: Record<"A" | "B" | "C", [string, string, string, number][]> = {
    A: [["CC-01.01", "الحفر والردم", "Subcontract", 120000], ["CC-02.01", "خرسانة الأساسات", "Material", 950000], ["CC-02.02", "خرسانة الهيكل", "Material", 2050000], ["CC-03.01", "البلوك", "Subcontract", 380000], ["CC-04.01", "الكهروميكانيك", "Subcontract", 1300000], ["CC-05.01", "اللياسة والدهان", "Subcontract", 270000], ["CC-90", "مصاريف الموقع العامة", "Overhead", 380000]],
    B: [["CC-01.01", "الحفر والبنية التحتية", "Subcontract", 92000], ["CC-02.01", "أساسات الفلل", "Material", 680000], ["CC-02.02", "هياكل الفلل", "Material", 1050000], ["CC-03.01", "البلوك", "Subcontract", 520000], ["CC-06.01", "التشطيبات الداخلية", "Subcontract", 990000], ["CC-90", "مصاريف الموقع العامة", "Overhead", 240000]],
    C: [["CC-01.01", "أعمال الموقع", "Subcontract", 56000], ["CC-02.01", "الهيكل الخرساني", "Material", 1280000], ["CC-03.01", "الجدران والقواطع", "Subcontract", 330000], ["CC-06.01", "التشطيبات", "Subcontract", 700000], ["CC-07.01", "الأعمال الخارجية", "Subcontract", 236000], ["CC-90", "مصاريف الموقع العامة", "Overhead", 210000]],
  };
  for (const k of ["A", "B", "C"] as const) r.push(["Digit Project Cost Budget", PRJ[k].budget, { project: PRJ[k].name, company: C, version: 1, source_boq: PRJ[k].boq, workflow_state: "Approved", docstatus: 0, __final_doc: 1, effective_date: PRJ[k].start, approved_by: "director@dcc.test", approved_on: PRJ[k].start, owner: "qs@dcc.test",
    lines: BUD[k].map(([cc, d, cat, amt], i) => ({ idx: i + 1, line_key: `${k}-${cc}`, cost_code: cc, description: d, category: cat, original_amount: amt })) }]);
  r.push(["Digit Budget Revision", "BREV-2026-0001", { budget: PRJ.A.budget, reason: "عزل مائي إضافي للقبو (VO-2026-0001)", linked_variation: "VO-2026-0001", workflow_state: "Approved", docstatus: 0, __final_doc: 1, approved_by: "director@dcc.test", approved_on: "2026-04-30", owner: "qs@dcc.test", deltas: [{ idx: 1, line_key: "A-CC-02.01", delta_amount: 80000, reason: "Waterproofing materials and labour" }] }]);
  r.push(["Digit Budget Revision", "BREV-2026-0002", { budget: PRJ.B.budget, reason: "زيادة أسعار حديد التسليح وتأخر التوريد", workflow_state: "Submitted", docstatus: 0, owner: "qs@dcc.test", deltas: [{ idx: 1, line_key: "B-CC-02.02", delta_amount: 210000, reason: "Rebar price escalation +9%" }] }]);
  r.push(["Digit Budget Transfer", "BTR-2026-0001", { budget: PRJ.A.budget, from_line: "A-CC-90", to_line: "A-CC-03.01", amount: 40000, reason: "Additional blockwork labour for level 3 rework", workflow_state: "Approved", docstatus: 0, __final_doc: 1, approved_by: "pm@dcc.test", owner: "qs@dcc.test" }]);
  r.push(["Digit Cost Forecast Snapshot", "FCS-2026-0001", { project: PRJ.A.name, period: "2026-09", cutoff_date: "2026-09-30", workflow_state: "Approved", docstatus: 0, __final_doc: 1, prepared_by: "qs@dcc.test", approved_by: "pm@dcc.test", owner: "qs@dcc.test" }]);
  r.push(["Digit Cost Forecast Snapshot", "FCS-2026-0002", { project: PRJ.B.name, period: "2026-09", cutoff_date: "2026-09-30", workflow_state: "Approved", docstatus: 0, __final_doc: 1, prepared_by: "qs@dcc.test", approved_by: "pm@dcc.test", owner: "qs@dcc.test",
    lines: [{ line_key: "B-CC-02.02", method: "Manual ETC", manual_etc: 590000, confidence: "Low", note: "Remaining frames for phase 2 at current rebar prices" }, { line_key: "B-CC-03.01", method: "Committed + Uncommitted", uncommitted_remaining: 60000, confidence: "Medium" }, { line_key: "B-CC-06.01", method: "Manual ETC", manual_etc: 1080000, confidence: "Low", note: "Finishing subcontract not yet tendered" }] }]);
  r.push(["Digit Cost Sheet Definition", "CSD-0001", { title: "ورقة التكلفة القياسية", row_basis: "Budget Line", is_default: 1, owner: "qs@dcc.test", columns: ["Original Budget", "Revised Budget", "Committed", "Actual", "ETC", "EAC", "Variance", "Percent Spent"].map((m, i) => ({ idx: i + 1, measure: m, show_total: m === "Percent Spent" ? 0 : 1 })) }]);
  return r;
}

// ---------------------------------------------------------------- resources & spend
function resources(): Rec[] {
  const r: Rec[] = [];
  const m = (code: string, name: string, type: string, own: string, rate: number, status: string, project = "", supplier = "") => r.push(["Digit Machinery", code, { machine_code: code, machine_name: name, machine_type: type, ownership: own, hourly_rate: rate, status, current_project: project, supplier, owner: "pm@dcc.test" }]);
  m("MCH-CRN-01", "رافعة برجية ليبهر 150", "Crane", "Owned", 310, "Deployed", PRJ.A.name); m("MCH-PMP-01", "مضخة خرسانة 42 م", "Concrete Pump", "Rented", 420, "Deployed", PRJ.A.name, `${A}-SUP-RENT`);
  m("MCH-EXC-01", "حفار كاتربيلر 320", "Excavator", "Rented", 280, "Available", "", `${A}-SUP-RENT`); m("MCH-LDR-01", "لودر كوماتسو", "Loader", "Owned", 190, "Deployed", PRJ.B.name); m("MCH-GEN-01", "مولد 250 ك.ف.أ", "Generator", "Owned", 85, "Under Maintenance");
  const usage = (n: string, mch: string, k: "A" | "B", date: string, h: number, rate: number, fuel: number, sub: boolean) => r.push(["Digit Machinery Usage", n, { machinery: mch, project: PRJ[k].name, usage_date: date, hours: h, rate, fuel_cost: fuel, operator: `${A}-EMP-013`, docstatus: sub ? 1 : 0, owner: "site@dcc.test" }]);
  usage("MU-2026-00001", "MCH-CRN-01", "A", "2026-10-13", 9, 310, 0, true); usage("MU-2026-00002", "MCH-PMP-01", "A", "2026-10-14", 6, 420, 380, true); usage("MU-2026-00003", "MCH-CRN-01", "A", "2026-10-15", 7, 310, 0, true);
  usage("MU-2026-00004", "MCH-LDR-01", "B", "2026-10-14", 8, 190, 260, true); usage("MU-2026-00005", "MCH-LDR-01", "B", "2026-10-16", 5, 190, 160, false);
  const crew = (n: string, name: string, k: "A" | "B", trade: string, foreman: string, members: [string, string, number][]) => r.push(["Digit Crew", n, { crew_name: name, project: PRJ[k].name, trade, foreman, status: "Active", owner: "site@dcc.test",
    members: members.map(([e, role, cost], i) => ({ idx: i + 1, employee: e, employee_name: EMPLOYEES.find((x) => x[0] === e)!.slice(1, 3).join(" "), crew_role: role, planned_daily_cost: cost })) }]);
  crew("CREW-0001", "طاقم الخرسانة — الياسمين", "A", "Structural", `${A}-EMP-007`, [[`${A}-EMP-007`, "Foreman", 420], [`${A}-EMP-011`, "Skilled", 260], [`${A}-EMP-012`, "Skilled", 250], [`${A}-EMP-013`, "Operator", 300]]);
  crew("CREW-0002", "طاقم البناء — الواحة", "B", "Civil", `${A}-EMP-007`, [[`${A}-EMP-010`, "Skilled", 240], [`${A}-EMP-014`, "Skilled", 270]]);
  const att = (n: string, k: "A" | "B", crewN: string, date: string, rows: [string, string, number, number][], sub: boolean) => r.push(["Digit Field Attendance", n, { project: PRJ[k].name, attendance_date: date, crew: crewN, docstatus: sub ? 1 : 0, owner: "site@dcc.test",
    employees: rows.map(([e, a, h, ot], i) => ({ idx: i + 1, employee: e, employee_name: EMPLOYEES.find((x) => x[0] === e)!.slice(1, 3).join(" "), attendance: a, hours: h, overtime_hours: ot, task: `${A}-TASK-${k}04` })) }]);
  att("FATT-2026-00001", "A", "CREW-0001", "2026-10-13", [[`${A}-EMP-007`, "Present", 9, 1], [`${A}-EMP-011`, "Present", 9, 2], [`${A}-EMP-012`, "Present", 9, 2], [`${A}-EMP-013`, "Present", 9, 0]], true);
  att("FATT-2026-00002", "A", "CREW-0001", "2026-10-14", [[`${A}-EMP-007`, "Present", 9, 2], [`${A}-EMP-011`, "Present", 9, 3], [`${A}-EMP-012`, "Half Day", 4, 0], [`${A}-EMP-013`, "Present", 9, 1]], true);
  att("FATT-2026-00003", "A", "CREW-0001", "2026-10-15", [[`${A}-EMP-007`, "Present", 8, 0], [`${A}-EMP-011`, "Absent", 0, 0], [`${A}-EMP-012`, "Present", 8, 1], [`${A}-EMP-013`, "Present", 8, 0]], true);
  att("FATT-2026-00004", "B", "CREW-0002", "2026-10-14", [[`${A}-EMP-010`, "Present", 9, 2], [`${A}-EMP-014`, "On Leave", 0, 0]], true);
  att("FATT-2026-00005", "B", "CREW-0002", "2026-10-16", [[`${A}-EMP-010`, "Present", 9, 0], [`${A}-EMP-014`, "Present", 9, 1]], false);
  r.push(["Digit Petty Cash Fund", "PCF-0001", { fund_name: "عهدة موقع الياسمين", project: PRJ.A.name, company: C, custodian: `${A}-EMP-003`, fund_limit: 20000, status: "Open", opened_on: "2026-09-01", owner: "finance@dcc.test" }]);
  r.push(["Digit Petty Cash Fund", "PCF-0002", { fund_name: "عهدة موقع الواحة", project: PRJ.B.name, company: C, custodian: `${A}-EMP-006`, fund_limit: 12000, status: "Open", opened_on: "2026-08-15", owner: "finance@dcc.test" }]);
  const exp = (n: string, k: "A" | "B", fund: string, date: string, cat: string, desc: string, amt: number, state: string, extra: Record<string, unknown> = {}) => r.push(["Digit Site Expense", n, { project: PRJ[k].name, fund, expense_date: date, category: cat, description: desc, amount: amt, vat_status: "Not Determined", workflow_state: state, docstatus: state === "Approved" ? 1 : 0, receipt_ref: `RC-${n.slice(-3)}`, receipts: `/files/RC-${n.slice(-3)}.pdf`, owner: "site@dcc.test", ...extra }]);
  exp("EXP-2026-00001", "A", "PCF-0001", "2026-09-05", "Fuel", "ديزل لمولد الموقع", 1850, "Approved"); exp("EXP-2026-00002", "A", "PCF-0001", "2026-09-18", "Consumables", "أقراص قص ولحام", 960, "Approved");
  exp("EXP-2026-00003", "A", "PCF-0001", "2026-10-02", "Permits", "تصريح إغلاق جزئي للطريق", 2400, "Approved"); exp("EXP-2026-00004", "A", "PCF-0001", "2026-10-15", "Site Services", "شفط مياه الحفريات", 1300, "Submitted");
  exp("EXP-2026-00005", "B", "PCF-0002", "2026-09-22", "Meals", "وجبات عمل إضافي", 2100, "Rejected", { reject_reason: "Overtime meals are covered by the labour contract." }); exp("EXP-2026-00006", "B", "PCF-0002", "2026-10-11", "Transport", "نقل حديد من المستودع المركزي", 1650, "Approved");
  exp("EXP-2026-00007", "B", "PCF-0002", "2026-10-16", "Consumables", "أدوات سلامة", 780, "Draft");
  return r;
}

// ---------------------------------------------------------------- finance & closeout
/** Ported from reference_prototype (Blueprint 07/08 P1): labour and equipment rates, equipment bookings, PO approval levels (owner
 *  decision Q-7 demo values) and a PO change under review (+800 m³ ready-mix on DCC-PO-0002). Fictional demo values, insert-if-missing. */
function prototypeP1(): Rec[] {
  const r: Rec[] = [];
  ([["Foreman", 45], ["Skilled", 30], ["Operator", 35], ["Helper", 20]] as const).forEach(([c, h]) => r.push(["Digit Labor Rate", c, { classification: c, hourly_rate: h, overtime_factor: 1.5 }]));
  r.push(["Digit Equipment Rate", "EQR-0001", { machine_type: "Crane", daily_rate: 2400, weekly_rate: 14000, monthly_rate: 52000, hourly_rate: 310 }]);
  r.push(["Digit Equipment Rate", "EQR-0002", { machinery: "MCH-PMP-01", daily_rate: 3200, weekly_rate: 19000 }]);
  r.push(["Digit Equipment Rate", "EQR-0003", { machine_type: "Loader", daily_rate: 1400, monthly_rate: 30000 }]);
  const bk = (n: string, m: string, k: "A" | "B", from: string, to: string, status: string) => r.push(["Digit Equipment Assignment", n, { machinery: m, project: PRJ[k].name, company: C, from_date: from, to_date: to, status, owner: "pm@dcc.test" }]);
  bk("EQA-2026-0001", "MCH-CRN-01", "A", "2026-08-01", "", "Active"); bk("EQA-2026-0002", "MCH-PMP-01", "A", "2026-10-15", "2026-10-31", "Active");
  bk("EQA-2026-0003", "MCH-LDR-01", "B", "2026-09-01", "2026-12-31", "Active"); bk("EQA-2026-0004", "MCH-EXC-01", "B", "2026-11-15", "2026-12-15", "Planned");
  // F07-13-1 / DEC-250: adjustment reasons (a write-off and a count adjustment need the project manager)
  ([["AR-2026-0001", "TRF", "Transfer between projects", "تحويل بين المشاريع", "Transfer", 0], ["AR-2026-0002", "DMG", "Damage / breakage on site", "تلف أو كسر في الموقع", "Write-off", 1], ["AR-2026-0003", "CNT", "Physical count difference", "فرق الجرد الفعلي", "Adjustment", 1]] as const)
    .forEach(([n, code, reason_en, reason_ar, usage, needs_approval]) => r.push(["Digit Adjustment Reason", n, { code, reason_en, reason_ar, usage, needs_approval }]));
  ([[1, "Digit Procurement Officer", 50000], [2, "Digit Project Manager", 500000], [3, "Digit Director", null]] as const).forEach(([level, role, max], i) => r.push(["Digit PO Approval Level", `POL-0${i + 1}`, { level, role, ...(max === null ? {} : { max_amount: max }) }]));
  const po = adapter.get("Purchase Order", "DCC-PO-0002"); const line = rows(po, "items")[0];
  if (line) r.push(["Digit PO Change", "POC-2026-0001", { purchase_order: "DCC-PO-0002", project: PRJ.A.name, company: C, reason: "Quantity Change", workflow_state: "Under Review", docstatus: 0, owner: "procurement@dcc.test",
    lines: [{ idx: 1, change_type: "Update", po_item: line["name"], item_code: line["item_code"], cost_code: line["digit_cost_code"] ?? "CC-02.02", new_qty: r2(num(line["qty"]) + 100), new_rate: num(line["rate"]) }] }]);
  return r;
}
function finance(): Rec[] {
  const r: Rec[] = [];
  r.push(["Digit Final Account", "FA-2026-0001", { contract: PRJ.C.cc, workflow_state: "Disputed", owner: "qs@dcc.test",
    adjustments: [{ idx: 1, description: "إعادة قياس الأعمال الخارجية", adjustment_type: "Remeasurement", amount: -18500, reference: "RM-07" }, { idx: 2, description: "أعمال إضافية لغرفة الحارس", adjustment_type: "Addition", amount: 42000, reference: "SI-114" }],
    disputes: [{ idx: 1, item: "تعويض تأخير تسليم الموقع", claimed_amount: 96000, offered_amount: 30000, status: "Open", note: "Client disputes 44 days of the 61-day extension of time." }, { idx: 2, item: "خصم المخلفات", claimed_amount: 0, offered_amount: -6000, status: "Resolved" }] }]);
  r.push(["Digit Retention Release Request", "RRR-2026-0001", { contract: PRJ.C.cc, release_type: "Partial", requested_amount: 60000, workflow_state: "Pending Approval", basis: "First half of retention due on practical completion (31-08-2026).", owner: "qs@dcc.test" }]);
  r.push(["Digit Closeout Assessment", "CLO-0001", { project: PRJ.C.name, assessment_date: "2026-10-10", owner: "pm@dcc.test", rows: [
    ["Technical", "Practical completion certificate received", "Done", "PCC-2026-08-31"], ["Technical", "Snag list closed", "Done", "SNAG-final"], ["Technical", "As-built drawings handed over", "Done", "AB-set-rev3"], ["Technical", "O&M manuals and warranties handed over", "Done", "OM-binder"],
    ["Commercial", "Client final account agreed", "Pending", ""], ["Commercial", "All variations settled", "Done", "VO register"], ["Commercial", "Subcontractor final accounts closed", "Pending", ""], ["Commercial", "Retention release plan agreed", "Pending", ""],
    ["Financial", "All certificates invoiced", "Done", "CERT-2026-0008"], ["Financial", "Client receivables collected", "Pending", ""], ["Financial", "Supplier and subcontractor payables settled", "Done", ""], ["Financial", "Project cost ledger reconciled", "Not Applicable", ""],
  ].map(([area, item, status, evidence], i) => ({ idx: i + 1, area, item, status, evidence })) }]);
  const cf = (n: string, k: "A" | "B" | "C", period: string, dir: string, cat: string, amt: number, status = "Planned") => r.push(["Digit Cashflow Forecast Item", n, { project: PRJ[k].name, period, direction: dir, category: cat, amount: amt, status, basis: dir === "Inflow" ? "Next certificate per programme" : "Committed work orders and POs", owner: "finance@dcc.test" }]);
  cf("CFI-00001", "A", "2026-11", "Inflow", "Client Collection", 1450000); cf("CFI-00002", "A", "2026-11", "Outflow", "Subcontractor Payment", 420000, "Committed"); cf("CFI-00003", "A", "2026-11", "Outflow", "Supplier Payment", 366000, "Committed");
  cf("CFI-00004", "A", "2026-12", "Inflow", "Client Collection", 1600000); cf("CFI-00005", "A", "2026-12", "Outflow", "Subcontractor Payment", 510000); cf("CFI-00006", "A", "2026-12", "Outflow", "Labour", 240000);
  cf("CFI-00007", "B", "2026-11", "Inflow", "Client Collection", 900000); cf("CFI-00008", "B", "2026-11", "Outflow", "Supplier Payment", 640000, "Committed"); cf("CFI-00009", "B", "2026-12", "Outflow", "Subcontractor Payment", 380000);
  cf("CFI-00010", "C", "2026-11", "Inflow", "Client Collection", 420000);
  return r;
}

// ---------------------------------------------------------------- installer
const NATIVE_SUBMITTED = new Set(["Material Request", "Request for Quotation", "Supplier Quotation", "Purchase Order", "Purchase Receipt", "Purchase Invoice", "Payment Entry", "Stock Entry", "Sales Invoice"]);
function put(dt: string, name: string, data: Record<string, unknown>): boolean {
  if (adapter.get(dt, name)) return false;
  adapter.insertDocQuiet(dt, { owner: "Administrator", ...data, name, __demo: 1, __plugin: "digit_construction", creation: data["creation"] ?? iso("2026-10-01") });
  return true;
}
/** Insert one app document after running its controller hook (computed totals/snapshots); `final` overrides applied after. */
function putComputed(dt: string, name: string, data: Record<string, unknown>, final: Record<string, unknown> = {}): boolean {
  if (adapter.get(dt, name)) return false;
  const { __final_doc, __final_state, __rejects, __si, __pi, __qty, ...clean } = data as Record<string, unknown>;
  void __rejects; void __si; void __pi; void __qty; void __final_state;
  const res = computeDoc(dt, { ...clean, name, doctype: dt, owner: String(clean["owner"] ?? "Administrator") } as Doc);
  if (res.errors?.length && import.meta.env?.DEV) console.warn(`[digit_construction demo] ${dt} ${name}:`, res.errors);
  const keep = ["approved_by", "approved_on", "reviewer"].reduce<Record<string, unknown>>((o, k) => (clean[k] !== undefined ? { ...o, [k]: clean[k] } : o), {});
  return put(dt, name, { ...res.doc, ...keep, ...(__final_doc ? { docstatus: __final_doc } : {}), ...final });
}

export function installConstructionDemo(): number {
  if (isServerHosted()) return 0 as never;
  return asSystem(() => {
    let n = 0;
    const plain = (recs: Rec[]) => { for (const [dt, name, data] of recs) if (put(dt, name, data)) n++; };
    plain(masters()); plain(policies()); plain(kanbanBoards()); plain(reportDocs());
    for (const [dt, name, data] of estimating()) if (dt === "Digit Assembly" ? putComputed(dt, name, data) : put(dt, name, data)) n++;
    for (const [dt, name, data] of tendersAndContracts()) if (putComputed(dt, name, data, dt === "Digit Tender" ? { est_cost: undefined } : {})) n++;
    for (const [dt, name, data] of projectsAndExecution()) if (dt.startsWith("Digit ") ? putComputed(dt, name, data) : put(dt, name, data)) n++;
    for (const t of ["TND-2026-0001", "TND-2026-0002", "TND-2026-0003", "TND-2026-0005"]) { const d = adapter.get("Digit Tender", t); const e = d && adapter.get("Digit Estimate Version", String(d["approved_estimate"])); if (d && e && d["est_cost"] == null) adapter.insertDocQuiet("Digit Tender", { ...d, est_cost: e["total_cost"], est_selling: e["total_selling"] }); }
    n += commercialChain();
    for (const [dt, name, data] of subcontract()) {
      if (dt === "Digit Measurement Book" && data["__qty"]) { const q = data["__qty"] as Record<string, number>; data["entries"] = (data["entries"] as Record<string, unknown>[]).map((e): Row => ({ ...e, nos: 0, length: 0, depth: 0, quantity: q[String(e["wo_line_key"])] })); }
      if (dt === "Digit Subcontractor Bill") { if (billChain(name, data)) n++; continue; }
      if (putComputed(dt, name, data)) n++;
    }
    plain(procurement());
    for (const [dt, name, data] of cost()) if (putComputed(dt, name, data)) n++;
    for (const [dt, name, data] of resources()) if (putComputed(dt, name, data)) n++;
    for (const f of list2("Digit Petty Cash Fund")) adapter.insertDocQuiet("Digit Petty Cash Fund", computeDoc("Digit Petty Cash Fund", f).doc);
    for (const [dt, name, data] of finance()) if (putComputed(dt, name, data)) n++;
    for (const [dt, name, data] of prototypeP1()) if (putComputed(dt, name, data)) n++;
    // R19 sample records for the DocTypes the R19 import added (source seeders, re-pointed at the DCC demo projects)
    for (const [dt, name, data] of r19Samples(C, PRJ)) if (putComputed(dt, name, data)) n++;
    for (const [dt, name, data] of uxDepthDemo()) if (dt === "Digit Handover Asset" ? putComputed(dt, name, data) : put(dt, name, data)) n++;
    plain(assignments());
    plain(decisionLog());
    for (const [dt, name, data] of eastCompany()) if (dt.startsWith("Digit ") ? putComputed(dt, name, data) : put(dt, name, data)) n++;
    // demo customer addresses are skipped: Customer city lives on the custom field only
    // historical records were active while their claims / measurements were recorded; close them now (flag removed, so idempotent)
    for (const dt of ["Digit Client Contract", "Digit Subcontract Work Order"]) for (const d of adapter.list(dt).filter((x) => x["__demo_final_state"])) {
      const { __demo_final_state: st, ...rest } = d; adapter.insertDocQuiet(dt, { ...rest, workflow_state: st } as Doc);
    }
    if (backfillCompany()) adapter.flush();
    if (n) { adapter.flush(); postAll(); adapter.flush(); }
    if (topUpTaxNet()) adapter.flush();
    if (topUpDeskUser()) adapter.flush();
    if (topUpStaffProfiles()) adapter.flush();
    if (upgradePolicies()) adapter.flush();
    return n;
  });
}
/** Demo ToDo assignments (native frappe ToDo, allocated_to) for the HOME-02 "My approvals & tasks" inbox; explicit names, insert-if-missing. */
function assignments(): Rec[] {
  const todo = (n: string, user: string, dt: string, name: string, date: string, priority: string, text: string, by = "pm@dcc.test"): Rec =>
    ["ToDo", n, { status: "Open", priority, date, allocated_to: user, description: text, reference_type: dt, reference_name: name, assigned_by: by, owner: by }];
  return [
    todo("DCC-TODO-0001", "site@dcc.test", "Task", "DCC-TASK-B05", "2026-10-10", "High", "حدّث نسبة إنجاز جدران البلوك وأرفق صور الموقع"),
    todo("DCC-TODO-0002", "site@dcc.test", "Digit Measurement Book", "MB-2026-0004", "2026-10-25", "Medium", "أعد قياس دفتر القياس بعد خصم الأبواب والنوافذ وأعد الإرسال"),
    todo("DCC-TODO-0003", "qs@dcc.test", "Digit Measurement Book", "MB-2026-0003", "2026-10-20", "High", "راجع دفتر القياس المقدم لأمر العمل SWO-2026-0001"),
    todo("DCC-TODO-0004", "pm@dcc.test", "Digit Stage Planning", "STG-0002", "2026-10-15", "High", "راجع إعادة جدولة هياكل الفلل قبل الاعتماد", "director@dcc.test"),
    todo("DCC-TODO-0005", "finance@dcc.test", "Digit Client Certificate", "CERT-2026-0004", "2026-10-28", "Medium", "تحقق من تحصيل فاتورة الشهادة وسجّل سند القبض", "qs@dcc.test"),
    todo("DCC-TODO-0006", "Administrator", "Project", "DCC-PRJ-B", "2026-10-22", "Medium", "راجع سجل التأخير لمشروع الواحة مع مدير المشروع", "director@dcc.test"),
  ];
}
/**
 * Run 6 RPT-MGT-04 demo decision log: native Workflow Comments (content = resulting state, as src/lib/workflow.ts writes
 * them) for demo documents already in a decided state, dated on their stored approval / decision dates, plus follow-up
 * ToDos explicitly linked to a decision through `digit_decision`. Only outcome states are logged, so no document that
 * is waiting for a decision changes its Approval Aging basis. Explicit names, insert-if-missing.
 */
function decisionLog(): Rec[] {
  const wf = (n: string, dt: string, name: string, state: string, by: string, at: string): Rec =>
    ["Comment", n, { comment_type: "Workflow", reference_doctype: dt, reference_name: name, content: state, comment_email: by, owner: by, creation: at, modified: at }];
  const fu = (n: string, decision: string, dt: string, name: string, user: string, by: string, date: string, status: "Open" | "Closed", text: string): Rec =>
    ["ToDo", n, { status, priority: "Medium", date, allocated_to: user, description: text, reference_type: dt, reference_name: name, assigned_by: by, owner: by, digit_decision: decision }];
  return [
    wf("DCC-WFC-0001", "Digit Estimate Version", "EST-2026-0001", "Submitted", "estimator@dcc.test", "2025-11-20T09:00:00.000Z"),
    wf("DCC-WFC-0002", "Digit Estimate Version", "EST-2026-0001", "Returned", "director@dcc.test", "2025-11-26T11:30:00.000Z"),
    wf("DCC-WFC-0003", "Digit Estimate Version", PRJ.A.est, "Submitted", "estimator@dcc.test", "2025-12-05T09:00:00.000Z"),
    wf("DCC-WFC-0004", "Digit Estimate Version", PRJ.A.est, "Approved", "director@dcc.test", "2025-12-10T10:00:00.000Z"),
    wf("DCC-WFC-0005", "Digit Client Variation", "VO-2026-0001", "Submitted", "qs@dcc.test", "2026-04-12T08:30:00.000Z"),
    wf("DCC-WFC-0006", "Digit Client Variation", "VO-2026-0001", "Approved", "director@dcc.test", "2026-04-28T13:00:00.000Z"),
    wf("DCC-WFC-0007", "Digit Budget Revision", "BREV-2026-0001", "Submitted", "qs@dcc.test", "2026-04-29T09:00:00.000Z"),
    wf("DCC-WFC-0008", "Digit Budget Revision", "BREV-2026-0001", "Approved", "director@dcc.test", "2026-04-30T15:00:00.000Z"),
    wf("DCC-WFC-0009", "Digit Client Variation", "VO-2026-0003", "Submitted", "qs@dcc.test", "2026-07-02T10:00:00.000Z"),
    wf("DCC-WFC-0010", "Digit Client Variation", "VO-2026-0003", "Rejected", "director@dcc.test", "2026-07-15T12:00:00.000Z"),
    wf("DCC-WFC-0011", "Digit Stage Planning", "STG-0003", "Submitted", "site@dcc.test", "2026-08-20T08:00:00.000Z"),
    wf("DCC-WFC-0012", "Digit Stage Planning", "STG-0003", "Rejected", "pm@dcc.test", "2026-08-25T14:00:00.000Z"),
    wf("DCC-WFC-0013", "Digit BOQ", "BOQ-DCE-0001", "Approved", "east.director@dcc.test", "2026-06-20T10:00:00.000Z"),
    fu("DCC-TODO-0007", "DCC-WFC-0006", "Digit Client Variation", "VO-2026-0001", "pm@dcc.test", "director@dcc.test", "2026-05-05", "Closed", "أصدر تعليمات أمر التغيير المعتمد للعزل المائي إلى مقاول الباطن"),
    fu("DCC-TODO-0008", "DCC-WFC-0012", "Digit Stage Planning", "STG-0003", "pm@dcc.test", "pm@dcc.test", "2026-09-15", "Open", "أعد تخطيط تشطيبات الفلل بعد اكتمال هيكل المرحلة الثانية مع مهندس الموقع"),
    fu("DCC-TODO-0009", "DCC-WFC-0002", "Digit Estimate Version", "EST-2026-0001", "estimator@dcc.test", "director@dcc.test", "2025-12-01", "Closed", "أعد تسعير الخرسانة الهيكلية بسعر الخرسانة الجاهزة الجديد"),
    fu("DCC-TODO-0010", "DCC-WFC-0013", "Digit BOQ", "BOQ-DCE-0001", "east.pm@dcc.test", "east.director@dcc.test", "2026-11-05", "Open", "سلّم جدول الكميات المعتمد لفريق موقع مستودعات الخبر"),
  ];
}
/**
 * R4-I second demo company (isolation): «شركة الشرق للإنشاءات (تجريبية)» with one project D, its team, tasks, work
 * packages, BOQ, budget, a submitted purchase order (commitment), a progress update and a crew, plus two users limited
 * to that company by User Permission. Company A users never see it and its users never see company A.
 */
export const EAST_COMPANY = "شركة الشرق للإنشاءات (تجريبية)";
export const EAST_PROJECT = "DCE-PRJ-D";
export const EAST_USERS: [string, string, string[]][] = [
  ["east.pm@dcc.test", "تركي المطيري (مدير مشروع — الشرق)", ["Digit Project Manager", "Projects Manager", "Projects User"]],
  ["east.director@dcc.test", "مدير عام الشرق للإنشاءات", ["Digit Director", "Projects Manager", "Accounts Manager", "Purchase Manager"]],
];
function eastCompany(): Rec[] {
  const E = EAST_COMPANY, X = "DCE", r: Rec[] = [], P = EAST_PROJECT, start = "2026-07-01", end = "2027-03-31", wh = `مستودع موقع الخبر - ${X}`;
  r.push(["Company", E, { company_name: E, abbr: X, default_currency: "SAR", country: "Saudi Arabia", tax_id: "310000000000013", chart_of_accounts: "Standard", enable_perpetual_inventory: 0, cost_center: `Projects - ${X}`, __note: "Second fictional construction company — isolation demo" }]);
  r.push(["Cost Center", `Main - ${X}`, { cost_center_name: "Main", company: E, is_group: 1, parent_cost_center: "" }]);
  r.push(["Cost Center", `Projects - ${X}`, { cost_center_name: "Projects", company: E, is_group: 0, parent_cost_center: `Main - ${X}` }]);
  r.push(["Warehouse", wh, { warehouse_name: "مستودع موقع الخبر", company: E, is_group: 0 }]);
  const emps: [string, string, string, string][] = [[`${X}-EMP-001`, "تركي", "المطيري", "Project Manager"], [`${X}-EMP-002`, "هند", "العنزي", "Quantity Surveyor"], [`${X}-EMP-003`, "بدر", "الشهري", "Site Engineer"]];
  emps.forEach(([id, first, last, desig], i) => r.push(["Employee", id, { first_name: first, last_name: last, employee_name: `${first} ${last}`, company: E, status: "Active", gender: i === 1 ? "Female" : "Male", designation: desig, date_of_joining: "2025-01-15", date_of_birth: `198${i + 2}-03-1${i}` }]));
  r.push(["Customer", `${X}-CUST-01`, { customer_name: "شركة الخليج للتطوير اللوجستي", digit_customer_name_en: "Gulf Logistics Development Co.", customer_type: "Company", customer_group: "Commercial", territory: "Saudi Arabia", default_currency: "SAR", tax_id: "310000000001003", __city: "الخبر" }]);
  for (const [user, full, roles] of EAST_USERS) {
    r.push(["User", user, { email: user, first_name: full, full_name: full, enabled: 1, user_type: "System User", roles: roles.map((role, i) => ({ idx: i + 1, role })), __note: "Demo construction user (second company)" }]);
    r.push(["User Permission", `UP-${user}-company`, { user, allow: "Company", for_value: E, apply_to_all_doctypes: 1, is_default: 1 }]);
  }
  const team = [[1, `${X}-EMP-001`, "Project Manager", "east.pm@dcc.test", {}], [2, `${X}-EMP-002`, "QS", "", {}], [3, `${X}-EMP-003`, "Site Engineer", "", { responsibility: "Work Package", work_package: "WP-D1" }]] as const;
  r.push(["Project", P, { naming_series: "PROJ-.####", project_name: "مستودعات الخبر اللوجستية — الخبر", digit_name_en: "Al-Khobar Logistics Warehouses", digit_city: "الخبر", digit_contract_type: "Lump Sum", digit_project_manager: `${X}-EMP-001`, status: "Open", is_active: "Yes", company: E, customer: `${X}-CUST-01`,
    expected_start_date: start, expected_end_date: end, actual_start_date: start, percent_complete_method: "Manual", percent_complete: 12, priority: "Medium", cost_center: `Projects - ${X}`, estimated_costing: 2880000, owner: "east.pm@dcc.test",
    digit_team: team.map(([idx, employee, project_role, user, x]) => ({ idx, employee, project_role, ...(user ? { user } : {}), from_date: start, responsibility: "Whole Project", is_primary: 1, ...x })) }]);
  r.push(["Digit Work Package", "WP-D1", { project: P, company: E, code: "WP-01", work_package_name: "الأساسات والهيكل المعدني", status: "In Progress", start_date: start, end_date: "2026-12-31", owner: "east.pm@dcc.test" }]);
  r.push(["Digit Work Package", "WP-D2", { project: P, company: E, code: "WP-02", work_package_name: "الأغلفة والأرضيات", status: "Not Started", start_date: "2026-12-01", end_date: end, owner: "east.pm@dcc.test" }]);
  const task = (n: number, subject: string, wp: string, s: string, e: string, status: string, progress: number) => r.push(["Task", `${X}-TASK-D0${n}`, { subject, project: P, company: E, status, priority: "Medium", exp_start_date: s, exp_end_date: e, progress, digit_work_package: wp, is_group: 0, owner: "east.pm@dcc.test" }]);
  task(1, "أعمال الحفر والقواعد", "WP-D1", start, "2026-09-15", "Completed", 100); task(2, "تركيب الهيكل المعدني", "WP-D1", "2026-09-01", "2026-12-31", "Working", 30); task(3, "الأغلفة والأرضيات الصناعية", "WP-D2", "2026-12-01", end, "Open", 0);
  const lines: [string, string, string, number, number, string][] = [["01.01", "أعمال الحفر والقواعد", "m³", 1800, 260, "CC-01.01"], ["02.01", "هيكل معدني", "Ton", 420, 5200, "CC-02.01"], ["03.01", "أغلفة وأرضيات", "m²", 9000, 46, "CC-03.01"]];
  r.push(["Digit BOQ", "BOQ-DCE-0001", { title: "مستودعات الخبر — جدول الكميات", project: P, company: E, revision: 0, workflow_state: "Approved", docstatus: 1, currency: "SAR", approved_by: "east.director@dcc.test", approved_on: "2026-06-20", owner: "east.pm@dcc.test",
    groups: [...new Set(lines.map((l) => l[0].split(".")[0]!))].map((g, i) => ({ idx: i + 1, group_code: g, description: `القسم ${g}` })),
    items: lines.map(([code, desc, uom, qty, rate, cc], i) => ({ idx: i + 1, line_key: `B-D-${code}`, group_code: code.split(".")[0], code, description: desc, uom, qty, rate, cost_code: cc })) }]);
  r.push(["Digit Project Cost Budget", "BUD-DCE-0001", { project: P, company: E, version: 1, source_boq: "BOQ-DCE-0001", workflow_state: "Approved", docstatus: 0, __final_doc: 1, effective_date: start, approved_by: "east.director@dcc.test", approved_on: start, owner: "east.pm@dcc.test",
    lines: [["CC-01.01", "أعمال الحفر والقواعد", "Subcontract", 420000], ["CC-02.01", "الهيكل المعدني", "Material", 1950000], ["CC-03.01", "الأغلفة والأرضيات", "Subcontract", 360000], ["CC-90", "مصاريف الموقع العامة", "Overhead", 150000]].map(([cc, d, cat, amt], i) => ({ idx: i + 1, line_key: `D-${String(cc)}`, cost_code: cc, description: d, category: cat, original_amount: amt })) }]);
  const poItems = [{ idx: 1, name: `${A}-MAT-REBAR-D-1`, item_code: `${A}-MAT-REBAR`, item_name: ITEMS[0]![1], description: ITEMS[0]![1], qty: 60, uom: "Ton", stock_uom: "Ton", conversion_factor: 1, stock_qty: 60, rate: 2720, amount: lineAmount(60, 2720), net_rate: 2720, net_amount: lineAmount(60, 2720), project: P, digit_cost_code: "CC-02.01", warehouse: wh, schedule_date: "2026-11-15" }];
  const net = poItems[0]!.amount;
  r.push(["Purchase Order", "DCE-PO-0001", { naming_series: "PUR-ORD-.YYYY.-", company: E, supplier: `${A}-SUP-STEEL`, supplier_name: SUPPLIERS[0]![1], buying_price_list: "Standard Buying", transaction_date: "2026-10-05", schedule_date: "2026-11-15", set_warehouse: wh, items: poItems,
    total: net, net_total: net, base_net_total: net, total_taxes_and_charges: 0, grand_total: net, base_grand_total: net, rounded_total: net, disable_rounded_total: 1, currency: "SAR", conversion_rate: 1, status: "To Receive and Bill", per_received: 0, per_billed: 0, docstatus: 1, owner: "east.director@dcc.test", creation: iso("2026-10-05") }]);
  r.push(["Digit Progress Update", "PU-DCE-0001", { project: P, update_date: "2026-10-10", task: `${X}-TASK-D02`, progress_pct: 30, workflow_state: "Submitted", docstatus: 0, reported_by: `${X}-EMP-003`, owner: "east.pm@dcc.test" }]);
  r.push(["Digit Crew", "CREW-DCE-01", { crew_name: "طاقم الهيكل المعدني — الخبر", project: P, trade: "Steel", foreman: `${X}-EMP-003`, status: "Active", owner: "east.pm@dcc.test", members: [{ idx: 1, employee: `${X}-EMP-003`, crew_role: "Foreman" }] }]);
  return r;
}
const list2 = (dt: string) => adapter.list(dt).filter((d) => d["__demo"]);
/** Older installs: demo "On Net Total" tax rows saved without net_amount print 0.00; fill only unset values from the parent net_total (never overwrites). */
const TAXED = ["Supplier Quotation", "Purchase Order", "Purchase Receipt", "Purchase Invoice", "Sales Invoice"];
export function topUpTaxNet(): number {
  let n = 0;
  for (const dt of TAXED) for (const d of adapter.list(dt).filter((x) => x["__plugin"] === "digit_construction" && Array.isArray(x["taxes"]))) {
    const rows = d["taxes"] as Row[]; const net = Number(d["net_total"]);
    if (!Number.isFinite(net) || !rows.some((t) => t["charge_type"] === "On Net Total" && t["net_amount"] === undefined)) continue;
    const taxes = rows.map((t) => t["charge_type"] === "On Net Total" && t["net_amount"] === undefined ? { ...t, net_amount: net, base_net_amount: t["base_net_amount"] ?? net } : t);
    adapter.insertDocQuiet(dt, { ...d, taxes }); n++;
  }
  return n;
}

/** Contract SOV gets the approved VO line; claims, certificates, invoices and collections are created in order so certificate money follows prior certificates. */
function commercialChain(): number {
  let n = 0;
  const recs = commercial();
  for (const [dt, name, data] of recs.filter((x) => x[0] === "Digit Client Variation")) if (putComputed(dt, name, data)) n++;
  const ca = adapter.get("Digit Client Contract", PRJ.A.cc);
  if (ca && !(ca["sov_lines"] as Record<string, unknown>[]).some((s) => s["variation"] === "VO-2026-0001")) {
    const sov = [...(ca["sov_lines"] as Record<string, unknown>[]), { idx: (ca["sov_lines"] as unknown[]).length + 1, line_key: "VO-2026-0001-VL-1", description: "عزل مائي إضافي للقبو", uom: "m²", qty: 1800, rate: 55, origin: "Variation", variation: "VO-2026-0001" }];
    const c2 = computeDoc("Digit Client Contract", { ...ca, sov_lines: sov, sov_version: 2 }).doc; adapter.insertDocQuiet("Digit Client Contract", c2);
  }
  const claims = recs.filter((x) => x[0] === "Digit Client Claim").sort((a, b) => a[1].localeCompare(b[1]));
  const certs = recs.filter((x) => x[0] === "Digit Client Certificate");
  // claims first (each claim's previous qty derives from earlier claims of the same contract), in claim order
  for (const [dt, name, data] of claims.sort((a, b) => String(a[2]["contract"]).localeCompare(String(b[2]["contract"])) || Number(a[2]["claim_no"]) - Number(b[2]["claim_no"]))) {
    const st = String(data["workflow_state"]); const pre = st === "Draft" ? data : { ...data, workflow_state: "Submitted", docstatus: 0 };
    if (putComputed(dt, name, pre, st === "Draft" ? {} : { workflow_state: st, docstatus: 1 })) n++;
  }
  for (const [dt, name, data] of certs.sort((a, b) => String(a[2]["cert_date"]).localeCompare(String(b[2]["cert_date"])))) {
    if (adapter.get(dt, name)) continue;
    const claim = adapter.get("Digit Client Claim", String(data["claim"])); if (!claim) continue;
    const rejects = (data["__rejects"] ?? {}) as Record<string, [number, string]>;
    const lines = (claim["lines"] as Record<string, unknown>[]).filter((l) => Number(l["this_period_qty"]) !== 0).map((l) => {
      const code = String(l["sov_line_key"]).split("-").pop()!; const rj = rejects[code]; const q = Number(l["this_period_qty"]);
      return { sov_line_key: l["sov_line_key"], accepted_qty: rj ? q - rj[0] : q, rejected_qty: rj ? rj[0] : 0, disputed_qty: 0, reason: rj?.[1] ?? "" };
    });
    // the claim must look Submitted while the certificate is computed (as when the QS created it)
    const cs = claim["workflow_state"]; adapter.insertDocQuiet("Digit Client Claim", { ...claim, workflow_state: "Submitted" });
    const fin = String(data["__final_state"]);
    const ok = putComputed(dt, name, { ...data, lines }, fin === "Draft" ? {} : { docstatus: 1, workflow_state: "Confirmed" });
    adapter.insertDocQuiet("Digit Client Claim", { ...adapter.get("Digit Client Claim", claim.name)!, workflow_state: cs });
    if (!ok) continue; n++;
    const si = data["__si"] as [string, string, number] | undefined; if (!si) continue;
    const cert = adapter.get(dt, name)!; const [siName, date, paidShare] = si;
    const net = Number(cert["net_certified"]); const tax = r2(net * 0.15); const grand = r2(net + tax); const rounded = Math.round(grand);
    const contract = adapter.get("Digit Client Contract", String(cert["contract"]))!;
    const due = new Date(Date.parse(date) + 30 * 86400000).toISOString().slice(0, 10);
    const paid = r2(rounded * paidShare);
    put("Sales Invoice", siName, { naming_series: "ACC-SINV-.YYYY.-", customer: cert["customer"], customer_name: CUSTOMERS.find((c) => c[0] === cert["customer"])?.[1], company: C, posting_date: date, due_date: due, project: cert["project"], currency: "SAR", conversion_rate: 1, selling_price_list: "Standard Selling", price_list_currency: "SAR", plc_conversion_rate: 1,
      debit_to: acct("Debtors"), taxes_and_charges: contract["taxes_and_charges"], digit_client_certificate: name, cost_center: acct("Projects"),
      items: [{ idx: 1, item_code: `${A}-SVC-WORKS`, item_name: ITEMS[6]![1], description: `Progress certificate ${name} — net of advance recovery and retention`, qty: 1, uom: "Nos", stock_uom: "Nos", conversion_factor: 1, rate: net, amount: net, net_rate: net, net_amount: net, income_account: acct("Contract Revenue"), cost_center: acct("Projects"), project: cert["project"] }],
      taxes: [{ idx: 1, charge_type: "On Net Total", account_head: acct("VAT 15% Output"), description: "VAT 15%", rate: 15, net_amount: net, base_net_amount: net, tax_amount: tax, base_tax_amount: tax, total: grand, base_total: grand }],
      total: net, net_total: net, base_net_total: net, total_taxes_and_charges: tax, grand_total: grand, base_grand_total: grand, rounded_total: rounded, base_rounded_total: rounded, rounding_adjustment: r2(rounded - grand), outstanding_amount: r2(rounded - paid), status: paid >= rounded ? "Paid" : paid > 0 ? "Partly Paid" : due < "2026-10-17" ? "Overdue" : "Unpaid", docstatus: 1, creation: iso(date) });
    adapter.insertDocQuiet(dt, { ...cert, sales_invoice: siName, workflow_state: "Invoiced" });
    if (paid > 0) put("Payment Entry", `${siName.replace("SINV", "PE-R")}`, { naming_series: "ACC-PAY-.YYYY.-", payment_type: "Receive", party_type: "Customer", party: cert["customer"], party_name: CUSTOMERS.find((c) => c[0] === cert["customer"])?.[1], company: C, posting_date: new Date(Date.parse(date) + 25 * 86400000).toISOString().slice(0, 10),
      paid_from: acct("Debtors"), paid_to: acct("Al-Rajhi Demo Bank"), paid_amount: paid, received_amount: paid, mode_of_payment: "Bank Transfer", reference_no: `RCV-${siName.slice(-4)}`, reference_date: date, project: cert["project"],
      references: [{ idx: 1, reference_doctype: "Sales Invoice", reference_name: siName, total_amount: rounded, outstanding_amount: rounded, allocated_amount: paid }], status: "Submitted", docstatus: 1, creation: iso(date) });
  }
  return n;
}
function billChain(name: string, data: Record<string, unknown>): boolean {
  const fin = String(data["__final_state"]);
  const ok = putComputed("Digit Subcontractor Bill", name, data, fin === "Draft" ? {} : { docstatus: 1, workflow_state: fin === "Invoiced" ? "Invoiced" : "Approved" });
  const pi = data["__pi"] as [string, string, number] | undefined; if (!ok || !pi) return ok;
  const b = adapter.get("Digit Subcontractor Bill", name)!; const [piName, date, paidShare] = pi;
  const wo = adapter.get("Digit Subcontract Work Order", String(b["work_order"]))!;
  const net = Number(b["net_amount"]); const tax = r2(net * 0.15); const grand = r2(net + tax); const rounded = Math.round(grand); const paid = r2(rounded * paidShare);
  const code = String((wo["lines"] as Record<string, unknown>[])[0]?.["cost_code"] ?? "");
  const sup = String(b["subcontractor"]);
  put("Purchase Invoice", piName, { naming_series: "ACC-PINV-.YYYY.-", supplier: sup, supplier_name: SUPPLIERS.find((s) => s[0] === sup)?.[1], company: C, posting_date: date, bill_no: b["supplier_invoice_no"], bill_date: b["bill_date"], due_date: new Date(Date.parse(date) + 30 * 86400000).toISOString().slice(0, 10), project: b["project"], currency: "SAR", conversion_rate: 1,
    buying_price_list: "Standard Buying", credit_to: acct("Creditors"), digit_subcontractor_bill: name, taxes_and_charges: `KSA VAT 15% Input - ${A}`,
    items: [{ idx: 1, item_code: `${A}-SVC-SUBCON`, item_name: ITEMS[7]![1], description: `Subcontract bill ${name} RA-${Number(b["ra_no"])}`, qty: 1, uom: "Nos", stock_uom: "Nos", conversion_factor: 1, rate: net, amount: net, net_rate: net, net_amount: net, expense_account: acct("Subcontract Cost"), cost_center: acct("Projects"), project: b["project"], digit_cost_code: code }],
    taxes: [{ idx: 1, charge_type: "On Net Total", account_head: acct("VAT 15% Input"), description: "VAT 15%", rate: 15, net_amount: net, base_net_amount: net, tax_amount: tax, base_tax_amount: tax, total: grand, base_total: grand, category: "Total", add_deduct_tax: "Add" }],
    total: net, net_total: net, base_net_total: net, total_taxes_and_charges: tax, grand_total: grand, base_grand_total: grand, rounded_total: rounded, base_rounded_total: rounded, rounding_adjustment: r2(rounded - grand), outstanding_amount: r2(rounded - paid), status: paid >= rounded ? "Paid" : paid > 0 ? "Partly Paid" : "Unpaid", docstatus: 1, creation: iso(date) });
  adapter.insertDocQuiet("Digit Subcontractor Bill", { ...b, purchase_invoice: piName });
  if (paid > 0) put("Payment Entry", piName.replace("PINV", "PE-P"), { naming_series: "ACC-PAY-.YYYY.-", payment_type: "Pay", party_type: "Supplier", party: sup, party_name: SUPPLIERS.find((s) => s[0] === sup)?.[1], company: C, posting_date: new Date(Date.parse(date) + 20 * 86400000).toISOString().slice(0, 10),
    paid_from: acct("Al-Rajhi Demo Bank"), paid_to: acct("Creditors"), paid_amount: paid, received_amount: paid, mode_of_payment: "Bank Transfer", reference_no: `PAY-${piName.slice(-4)}`, reference_date: date, project: b["project"],
    references: [{ idx: 1, reference_doctype: "Purchase Invoice", reference_name: piName, total_amount: rounded, outstanding_amount: rounded, allocated_amount: paid }], status: "Submitted", docstatus: 1, creation: iso(date) });
  return ok;
}
export const DEMO_NATIVE_DOCTYPES = [...NATIVE_SUBMITTED];
