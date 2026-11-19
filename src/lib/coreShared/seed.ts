/**
 * DIGIT Core demo data (owner OWN-60 / OWN-48): approval limits, matching tolerances, discount rules, period closing,
 * asset permissions, blanket orders, supplier IBANs for bank files, disputes, close tasks, bank rules, allocation rule,
 * correction tasks, asset verification / custody / category templates and the in-app guide articles.
 * Insert-if-missing with explicit names (never overwrites a user record; honours Deleted Document tombstones);
 * runs from seed.ts seedErp() after the demo vouchers are posted, inside the same batch.
 */
import { demoCompany, hasLegacyTwin } from "./demoCompany";
import { adapter } from "@/lib/adapter";
import { deletedIndex, deletedKey } from "@/lib/deletedDocs";
import { CORE_DT } from "./doctypes";
import { KNOWLEDGE } from "./knowledge";
import { seedReportData } from "./seedReports";
import { registerOperationHooks } from "./operations";

registerOperationHooks();

type Rec = [string, string, Record<string, unknown>];
const str = (v: unknown) => String(v ?? "");
const isoDay = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (iso: string, k: number) => isoDay(new Date(Date.parse(`${iso}T00:00:00Z`) + k * 864e5));
const monthEnd = (iso: string, back = 1) => { const d = new Date(`${iso.slice(0, 7)}-01T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() - back + 1); d.setUTCDate(0); return isoDay(d); };

/** A valid Saudi IBAN for a 20-character BBAN (mod-97 check digits). */
export function saudiIban(bban: string): string {
  const b = bban.padStart(20, "0").slice(-20); const re = `${b}SA00`; let r = 0;
  for (const ch of re) { const n = /\d/.test(ch) ? ch : String(ch.charCodeAt(0) - 55); for (const d of n) r = (r * 10 + Number(d)) % 97; }
  return `SA${String(98 - r).padStart(2, "0")}${b}`;
}

export function coreRecords(today = isoDay(new Date())): Rec[] {
  const co = demoCompany();
  if (!co) return [];
  const C = co.name; const A = str(co["abbr"]) || "DDT";
  const r: Rec[] = [];
  const sis = adapter.list("Sales Invoice").filter((d) => d["company"] === C && Number(d.docstatus) === 1 && !Number(d["is_return"] ?? 0) && Number(d["outstanding_amount"] ?? 0) > 0).sort((a, b) => a.name.localeCompare(b.name));
  const pis = adapter.list("Purchase Invoice").filter((d) => d["company"] === C && Number(d.docstatus) === 1 && !Number(d["is_return"] ?? 0)).sort((a, b) => a.name.localeCompare(b.name));
  const items = adapter.list("Item").filter((i) => !Number(i["disabled"] ?? 0) && !Number(i["has_variants"] ?? 0)).sort((a, b) => a.name.localeCompare(b.name));
  const custs = adapter.list("Customer").sort((a, b) => a.name.localeCompare(b.name));
  const supps = adapter.list("Supplier").sort((a, b) => a.name.localeCompare(b.name));
  const assets = adapter.list("Asset").filter((a) => a["company"] === C && Number(a.docstatus) !== 2).sort((a, b) => a.name.localeCompare(b.name));
  const bankAcc = adapter.list("Account").find((a) => a["company"] === C && a["account_type"] === "Bank" && !Number(a["is_group"] ?? 0));
  const expense = adapter.list("Account").find((a) => a["company"] === C && a["root_type"] === "Expense" && !Number(a["is_group"] ?? 0));
  const ccs = adapter.list("Cost Center").filter((c) => c["company"] === C && !Number(c["is_group"] ?? 0)).sort((a, b) => a.name.localeCompare(b.name));
  const pe = adapter.list("Bank").sort((a, b) => a.name.localeCompare(b.name))[0];
  const lastEnd = monthEnd(today);

  /* control policy (tolerances, review thresholds, discount and margin limits) */
  r.push([CORE_DT.controlPolicy, C, { company: C, custody_approval_required: 1, asset_verification_days: 365, price_tolerance_pct: 2, qty_tolerance_pct: 5, amount_tolerance: 50, journal_review_amount: 50000, journal_reviewer_role: "Accounts Manager", stock_variance_approval_amount: 5000, stock_variance_role: "Stock Manager", max_discount_pct: 10, min_margin_pct: 15, bank_match_days: 5 }]);
  /* print branding read by the Enterprise print frame, one per company (synthetic demo identity: CR, phone, e-mail, bank and IBAN are placeholders) */
  const BRAND_EN: Record<string, string> = { "شركة ديجيت التجريبية للتجارة": "Digit Demo Trading Company", "شركة ديجيت للمقاولات (تجريبية)": "Digit Contracting Co. (Demo)", "شركة الشرق للإنشاءات (تجريبية)": "Al Sharq Construction Co. (Demo)", "Digit Synthetic Co": "Digit Synthetic Co" };
  adapter.list("Company").sort((a, b) => a.name.localeCompare(b.name)).forEach((c, i) => {
    const ar = str(c["company_name"]) || c.name; const trading = c.name === "شركة ديجيت التجريبية للتجارة";
    r.push([CORE_DT.printBranding, c.name, { company: c.name, company_name_ar: ar === "Digit Synthetic Co" ? "شركة ديجيت الاصطناعية" : ar, company_name_en: BRAND_EN[c.name] ?? "", logo: trading ? "/icons/digit_pro/digit-logo-horizontal.svg" : "",
      vat_number: "", cr_number: `101000000${i}`, address_ar: "طريق الملك فهد، حي العليا، الرياض 12214، المملكة العربية السعودية", address_en: "King Fahd Road, Al Olaya, Riyadh 12214, Saudi Arabia",
      phone: "+966 11 000 0000", email: "billing@digit-demo.sa", website: "digit-demo.sa", bank_name: "البنك التجريبي", account_name: ar, iban: `SA00 0000 0000 0000 0000 000${i}`,
      terms_ar: "تُسدَّد الفاتورة خلال المدة المتفق عليها. الأسعار بالريال السعودي وتشمل ضريبة القيمة المضافة حيث تنطبق.", terms_en: "Payment is due within the agreed terms. Prices are in Saudi Riyal and include VAT where applicable.",
      footer_note_ar: "شكرًا لتعاملكم معنا", footer_note_en: "Thank you for your business" }]);
  });
  /* approval limits (native Authorization Rule) */
  r.push(["Authorization Rule", `${A}-AUTH-SO-250K`, { transaction: "Sales Order", based_on: "Grand Total", value: 250000, approving_role: "Sales Manager", company: C }]);
  r.push(["Authorization Rule", `${A}-AUTH-PO-100K`, { transaction: "Purchase Order", based_on: "Grand Total", value: 100000, approving_role: "Purchase Manager", company: C }]);
  r.push(["Authorization Rule", `${A}-AUTH-SI-DISC`, { transaction: "Sales Invoice", based_on: "Average Discount", value: 10, approving_role: "Sales Manager", company: C }]);
  /* discount rules (native Pricing Rule) */
  if (items[0]) r.push(["Pricing Rule", `${A}-PR-VOLUME-5`, { title: "Volume discount 5% from 50 units", apply_on: "Item Code", items: [{ item_code: items[0].name, uom: str(items[0]["stock_uom"]) }], price_or_product_discount: "Price", rate_or_discount: "Discount Percentage", discount_percentage: 5, min_qty: 50, selling: 1, company: C, currency: "SAR", valid_from: addDays(today, -60), priority: "1" }]);
  r.push(["Pricing Rule", `${A}-PR-CORP-3`, { title: "Corporate customers 3%", apply_on: "Transaction", applicable_for: "Customer Group", customer_group: "Corporate", price_or_product_discount: "Price", rate_or_discount: "Discount Percentage", discount_percentage: 3, selling: 1, company: C, currency: "SAR", valid_from: addDays(today, -90) }]);
  /* trading demo (blanket orders, customer hold, marketplace orders, drop-ship) belongs to the trading demo company,
     the one holding the demo sales and purchasing vouchers, so its screens show these next to the vouchers */
  const trade = adapter.list("Company").find((c) => c["__synthetic"] && str(c["abbr"]) === "DDT") ?? co;
  const T = trade.name; const TA = str(trade["abbr"]) || A;
  /* blanket orders */
  const [i0, i1, i2] = items;
  if (i0 && i1 && custs[0]) r.push(["Blanket Order", `${TA}-BO-SELL-0001`, { blanket_order_type: "Selling", customer: custs[0].name, customer_name: str(custs[0]["customer_name"]), from_date: addDays(today, -30), to_date: addDays(today, 335), company: T, currency: "SAR", conversion_rate: 1, docstatus: 1,
    items: [{ idx: 1, item_code: i0.name, item_name: str(i0["item_name"]), qty: 1200, rate: 45, base_rate: 45, ordered_qty: 180 }, { idx: 2, item_code: i1.name, item_name: str(i1["item_name"]), qty: 600, rate: 120, base_rate: 120, ordered_qty: 75 }] }]);
  if (i2 && supps[0]) r.push(["Blanket Order", `${TA}-BO-PUR-0001`, { blanket_order_type: "Purchasing", supplier: supps[0].name, supplier_name: str(supps[0]["supplier_name"]), from_date: addDays(today, -45), to_date: addDays(today, 320), company: T, currency: "SAR", conversion_rate: 1, docstatus: 1,
    items: [{ idx: 1, item_code: i2.name, item_name: str(i2["item_name"]), qty: 2400, rate: 18, base_rate: 18, ordered_qty: 400 }] }]);
  /* screen problem reports (header "Report a problem", providers.ts raiseScreenDefect shape): one per owning team */
  ([["01", "digit_pro", "DIGIT Pro", "/pro/receivables", "screen", "رصيد العميل في البطاقة لا يطابق كشف الحساب بعد السداد الجزئي", -3],
    ["02", "digit_enterprise", "DIGIT Pro", "/pro/dashboard", "shell", "قائمة المستندات الأخيرة في الرأس لا تُغلق عند الضغط خارجها", -2],
    ["03", "digit_hr", "DIGIT HR", "/hr/leave", "screen", "زر اعتماد الإجازة لا يظهر لمدير القسم البديل", -1]] as const).forEach(([n, owner, label, route, area, summary, ago]) => {
    r.push(["Issue", `${A}-ISS-SCR-${n}`, { subject: `[${label}] ${summary}`, raised_by: "Administrator", status: "Open", priority: "Medium", company: C, opening_date: addDays(today, ago),
      description: [`DIGIT screen report`, `App: ${label} (${owner === "digit_enterprise" ? "digit_pro" : owner})`, `Screen: not registered`, `Route: ${route}`, `Area: ${area}`, `Owner team: ${owner}`, `Renderer: shared shell`, `Language: ar`, `Screen size: 1440×900`, `Reported by: Administrator`].join("\n") }]);
  });
  /* period closing: an accounting period two months back closed for vouchers; close tasks for the last month end */
  const p2 = monthEnd(today, 2); const p2s = `${p2.slice(0, 7)}-01`;
  r.push(["Accounting Period", `${A}-AP-${p2.slice(0, 7)}`, { period_name: `${A}-AP-${p2.slice(0, 7)}`, start_date: p2s, end_date: p2, company: C,
    closed_documents: ["Journal Entry", "Sales Invoice", "Purchase Invoice", "Payment Entry"].map((document_type, i) => ({ idx: i + 1, document_type, closed: 1 })) }]);
  const tasks: [string, string, string, number, string][] = [
    ["مطابقة جميع الحسابات البنكية مع الكشف", "Banking", "accounts.user@digit.test", 2, "Done"], ["مراجعة المقبوضات والمدفوعات غير المخصصة", "Receivables", "accounts.user@digit.test", 2, "In Progress"],
    ["تأكيد المستلم غير المفوتر من الموردين", "Payables", "accounts.user@digit.test", 3, "Open"], ["مطابقة قيمة المخزون مع الدفتر", "Inventory", "Administrator", 3, "Open"],
    ["ترحيل الإهلاك الشهري", "Fixed Assets", "Administrator", 1, "Done"], ["إعداد إقرار ضريبة القيمة المضافة ومراجعته", "Tax", "Administrator", 5, "Blocked"],
    ["قيود المستحقات والمدفوعات المقدمة", "Journals", "accounts.user@digit.test", 2, "Open"], ["حزمة الإدارة: الأرباح والخسائر والميزانية والتدفق النقدي", "Reporting", "Administrator", 6, "Open"],
  ];
  tasks.forEach(([task, area, owner, d, status], i) => r.push([CORE_DT.closeTask, `${A}-CLOSE-${lastEnd.slice(0, 7)}-${String(i + 1).padStart(2, "0")}`, { company: C, period_end: lastEnd, task, area, owner_user: owner, due_date: addDays(lastEnd, d), status, evidence: status === "Done" ? "رُوجعت واعتُمدت (تجريبي)" : "" }]));
  /* close history (PRO P2-02): the same checklist completed for the ten month ends before, so the 12-month close strip shows the routine;
     each history task is dated when it was done, so the period being closed now stays the most recent checklist */
  for (let back = 2; back <= 11; back++) {
    const pe = monthEnd(today, back);
    tasks.forEach(([task, area, owner, d], i) => r.push([CORE_DT.closeTask, `${A}-CLOSE-${pe.slice(0, 7)}-${String(i + 1).padStart(2, "0")}`, { company: C, period_end: pe, task, area, owner_user: owner, due_date: addDays(pe, d), status: "Done", evidence: "رُوجعت واعتُمدت (تجريبي)", creation: `${addDays(pe, d)} 16:00:00.000000` }]));
  }
  /* invoice disputes */
  sis.slice(0, 2).forEach((si, i) => r.push([CORE_DT.dispute, `${A}-DSP-S-${String(i + 1).padStart(3, "0")}`, { company: C, invoice_type: "Sales Invoice", invoice: si.name, party_type: "Customer", party: str(si["customer"]), disputed_amount: Math.round(Number(si["outstanding_amount"]) * (i ? 0.25 : 1) * 100) / 100, opened_on: addDays(today, -6 - i * 4), status: i ? "Under Review" : "Open", reason: i ? "نقص في الكمية المسلّمة" : "السعر يختلف عن عرض السعر المتفق عليه" }]));
  if (pis[0]) r.push([CORE_DT.dispute, `${A}-DSP-P-001`, { company: C, invoice_type: "Purchase Invoice", invoice: pis[0].name, party_type: "Supplier", party: str(pis[0]["supplier"]), disputed_amount: Math.round(Number(pis[0]["grand_total"] ?? 0) * 0.1 * 100) / 100, opened_on: addDays(today, -9), status: "Open", reason: "بضاعة تالفة عند الاستلام" }]);
  /* supplier bank accounts with valid Saudi IBANs (bank transfer files) */
  if (pe) supps.slice(0, 4).forEach((s, i) => r.push(["Bank Account", `${A}-BA-${s.name}`, { account_name: `${str(s["supplier_name"]) || s.name} — ${pe.name}`, bank: pe.name, party_type: "Supplier", party: s.name, iban: saudiIban(`80000000${String(608010167519 + i * 7311).padStart(12, "0")}`), is_company_account: 0 }]));
  /* bank rules */
  if (bankAcc) {
    r.push([CORE_DT.bankRule, `${A}-BRULE-01`, { rule_name: "إيداعات تسوية مدى", description_contains: "MADA SETTLEMENT", direction: "Deposit", account: bankAcc.name, priority: 1, enabled: 1 }]);
    if (expense) r.push([CORE_DT.bankRule, `${A}-BRULE-02`, { rule_name: "الرسوم البنكية", description_contains: "BANK CHARGE", direction: "Withdrawal", account: expense.name, priority: 2, enabled: 1 }]);
    if (supps[0]) r.push([CORE_DT.bankRule, `${A}-BRULE-03`, { rule_name: `تحويلات إلى ${str(supps[0]["supplier_name"]) || supps[0].name}`, description_contains: (str(supps[0]["supplier_name"]) || supps[0].name).slice(0, 12).toUpperCase(), direction: "Withdrawal", party_type: "Supplier", party: supps[0].name, priority: 5, enabled: 1 }]);
  }
  /* allocation rule (overhead split by cost center) */
  if (expense && ccs.length >= 2) r.push([CORE_DT.allocationRule, `${A}-ALLOC-01`, { rule_name: "توزيع إيجار المقر الرئيسي", company: C, source_account: expense.name, source_cost_center: ccs[0]!.name, enabled: 1,
    lines: ccs.slice(1, Math.min(4, ccs.length)).map((c, i, all) => ({ idx: i + 1, cost_center: c.name, percentage: i === all.length - 1 ? 100 - Math.round(100 / all.length) * (all.length - 1) : Math.round(100 / all.length) })) }]);
  /* correction tasks */
  const draftJe = adapter.list("Journal Entry").filter((j) => j["company"] === C && Number(j.docstatus) === 0).sort((a, b) => a.name.localeCompare(b.name))[0];
  if (draftJe) r.push([CORE_DT.correctionTask, `${A}-CORR-001`, { company: C, reference_doctype: "Journal Entry", reference_name: draftJe.name, issue: "مركز التكلفة ناقص في سطر المصروف", assigned_to: "accounts.user@digit.test", due_date: addDays(today, -2), status: "Open" }]);
  if (sis[2]) r.push([CORE_DT.correctionTask, `${A}-CORR-002`, { company: C, reference_doctype: "Sales Invoice", reference_name: sis[2].name, issue: "تأكيد الرقم الضريبي للعميل قبل الإرسال إلى زاتكا", assigned_to: "Administrator", due_date: addDays(today, 3), status: "Open" }]);
  /* assets: physical verification, custody, category templates, asset read permission for the accounts user */
  assets.slice(0, 4).forEach((a, i) => r.push([CORE_DT.assetVerification, `${A}-AVER-${String(i + 1).padStart(3, "0")}`, { asset: a.name, company: C, location: str(a["location"]), verified_on: addDays(today, -20 + i), verified_by: "Administrator", result: ["Found", "Found", "Found - Damaged", "Location differs"][i], notes: i === 3 ? "شوهد في مكتب المستودع" : "" }]));
  const emp = adapter.list("Employee").sort((a, b) => a.name.localeCompare(b.name));
  assets.slice(0, 2).forEach((a, i) => { if (emp[i]) r.push([CORE_DT.assetCustody, `${A}-ACUS-${String(i + 1).padStart(3, "0")}`, { asset: a.name, company: C, custodian: emp[i]!.name, from_date: addDays(today, -40), status: i ? "Requested" : "Approved", approver: i ? "" : "Administrator" }]); });
  /* asset maintenance plan + logs (one due soon, one overdue, one done), a pending asset move and a draft landed cost voucher */
  const amAsset = assets.find((a) => Number(a.docstatus) === 1);
  if (amAsset) {
    r.push(["Asset Maintenance", `${A}-AMNT-001`, { asset_name: amAsset.name, item_code: str(amAsset["item_code"]), company: C, maintenance_team: "", asset_maintenance_tasks: [{ idx: 1, maintenance_task: "Quarterly service", maintenance_type: "Preventive Maintenance", periodicity: "Quarterly", maintenance_status: "Planned", start_date: addDays(today, -80), next_due_date: addDays(today, 10) }] }]);
    ([["Quarterly service", "Planned", 10, ""], ["Brake inspection", "Overdue", -6, ""], ["Oil change", "Completed", -30, addDays(today, -29)]] as const).forEach(([task, st, due, done], i) =>
      r.push(["Asset Maintenance Log", `${A}-AML-${String(i + 1).padStart(3, "0")}`, { asset_maintenance: `${A}-AMNT-001`, asset_name: amAsset.name, item_code: str(amAsset["item_code"]), task_name: task, maintenance_type: "Preventive Maintenance", periodicity: "Quarterly", maintenance_status: st, due_date: addDays(today, due), ...(done ? { completion_date: done } : {}), docstatus: st === "Completed" ? 1 : 0 }]));
    const loc0 = str(amAsset["location"]);
    if (emp[2]) r.push(["Asset Movement", `${A}-AMOV-001`, { company: C, purpose: "Issue", transaction_date: addDays(today, -2), assets: [{ idx: 1, asset: amAsset.name, asset_name: str(amAsset["asset_name"]), source_location: loc0, to_employee: emp[2].name }], docstatus: 0 }]);
  }
  const pr0 = adapter.list("Purchase Receipt").filter((p) => p["company"] === C && Number(p.docstatus) === 1 && !Number(p["is_return"])).sort((a, b) => a.name.localeCompare(b.name))[0];
  if (pr0) r.push(["Landed Cost Voucher", `${A}-LCV-001`, { company: C, posting_date: addDays(today, -5), distribute_charges_based_on: "Amount",
    purchase_receipts: [{ idx: 1, receipt_document_type: "Purchase Receipt", receipt_document: pr0.name, supplier: str(pr0["supplier"]), posting_date: str(pr0["posting_date"]), grand_total: Number(pr0["grand_total"] ?? 0) }],
    taxes: [{ idx: 1, description: "Customs clearance and freight", amount: 850, expense_account: "" }], total_taxes_and_charges: 850, docstatus: 0 }]);
  /* sales inbox: customer requests that arrived by e-mail (CF-02) for the trading demo company (the default company, which holds the selling demo);
     item alternatives (CF-04); sample emission factors (CF-06) */
  const stockItems = items.filter((i) => Number(i["is_stock_item"] ?? 0) && Number(i["is_sales_item"] ?? 1));
  const req = [[0, 0, 1, 12, 5], [1, 1, 2, 4, 20], [2, 2, 0, 30, 0]] as const;
  req.forEach(([ci, ia, ib, qa, qb], i) => { const c = custs[ci]; const a = stockItems[ia]; const b = stockItems[ib]; if (!c || !a) return;
    const mail = str(c["email_id"]) || `purchasing@${c.name.toLowerCase().replace(/[^a-z0-9]+/g, "") || "customer"}.example.sa`;
    r.push([CORE_DT.inboundMessage, `${TA}-INMSG-${String(i + 1).padStart(3, "0")}`, { subject: ["Request for quotation", "طلب عرض سعر", "Urgent order — please quote"][i], from_email: mail, from_name: str(c["customer_name"]) || c.name, company: T, customer: c.name,
      received_on: `${addDays(today, -i)} 0${8 + i}:15:00`, status: "New",
      body: `${["Dear team,", "السلام عليكم،", "Hello,"][i]}\n${qa} x ${str(a["item_name"]) || a.name}${b && qb ? `\n${qb} x ${str(b["item_name"]) || b.name}` : ""}\n${["Please send your best price and delivery date.", "نرجو تزويدنا بأفضل سعر وموعد التسليم.", "We need delivery this week."][i]}` }]); });
  if (stockItems.length >= 4) { r.push(["Item Alternative", `${A}-IALT-001`, { item_code: stockItems[0]!.name, alternative_item_code: stockItems[3]!.name, item_name: stockItems[0]!["item_name"], alternative_item_name: stockItems[3]!["item_name"], two_way: 1 }]);
    if (stockItems[4]) r.push(["Item Alternative", `${A}-IALT-002`, { item_code: stockItems[1]!.name, alternative_item_code: stockItems[4]!.name, item_name: stockItems[1]!["item_name"], alternative_item_name: stockItems[4]!["item_name"], two_way: 0 }]); }
  const groups = [...new Set(items.map((i) => str(i["item_group"])).filter(Boolean))].sort().slice(0, 3);
  const SAMPLE = "Sample factor for the preview — replace with the factor from your approved methodology (e.g. supplier data, national grid factor).";
  groups.forEach((g, i) => r.push([CORE_DT.emissionFactor, `${A}-EMF-${String(i + 1).padStart(3, "0")}`, { label: `Purchased goods — ${g}`, basis: "Item Group", reference: g, scope: "Scope 3", factor: [0.42, 0.35, 0.28][i], unit: "SAR spent", source_note: SAMPLE, is_sample: 1 }]));
  const expAcc = (re: RegExp) => adapter.list("Account").find((a) => a["company"] === C && a["root_type"] === "Expense" && !Number(a["is_group"] ?? 0) && re.test(`${str(a["account_name"])} ${a.name}`));
  const util = expAcc(/utilit|electric|كهرباء|مرافق/i); const fuel = expAcc(/fuel|travel|vehicle|وقود|سفر|سيارات/i);
  if (util) r.push([CORE_DT.emissionFactor, `${A}-EMF-010`, { label: "Electricity", basis: "Expense Account", reference: util.name, scope: "Scope 2", factor: 1.9, unit: "SAR spent", source_note: SAMPLE, is_sample: 1 }]);
  if (fuel && fuel.name !== util?.name) r.push([CORE_DT.emissionFactor, `${A}-EMF-011`, { label: "Fuel and travel", basis: "Expense Account", reference: fuel.name, scope: "Scope 1", factor: 1.1, unit: "SAR spent", source_note: SAMPLE, is_sample: 1 }]);
  /* shift based depreciation: the shifts an asset can run (one default) */
  const shiftDefault = adapter.list("Asset Shift Factor").some((x) => Number(x["default"] ?? 0));
  ([["Single Shift", 1, 1], ["Double Shift", 1.5, 0], ["Triple Shift", 2, 0]] as const).forEach(([nm, factor, def]) => r.push(["Asset Shift Factor", nm, { shift_name: nm, shift_factor: factor, default: shiftDefault ? 0 : def }]));
  for (const cat of adapter.list("Asset Category").slice(0, 2)) r.push([CORE_DT.assetCategoryTemplate, `${cat.name} — standard`, { template_name: `${cat.name} — standard`, asset_category: cat.name, depreciation_method: "Straight Line", total_number_of_depreciations: 60, frequency_of_depreciation: 1 }]);
  // every location an asset points to exists as a Location record (asset links resolve; asset permissions can use it)
  const locs = [...new Set(assets.map((a) => str(a["location"])).filter(Boolean))].sort();
  for (const l of locs) r.push(["Location", l, { location_name: l, is_group: 0 }]);
  const loc = locs[0] ?? adapter.list("Location").sort((a, b) => a.name.localeCompare(b.name))[0]?.name;
  if (loc) r.push(["User Permission", "UP-accounts-user-location", { user: "accounts.user@digit.test", allow: "Location", for_value: loc, apply_to_all_doctypes: 0, applicable_for: "Asset", is_default: 0 }]);
  /* approval delegation sample */
  r.push([CORE_DT.delegation, "DLG-demo-accounts", { delegator: "Administrator", delegate: "accounts.user@digit.test", company: C, from_date: addDays(today, 20), to_date: addDays(today, 34), max_amount: 50000, enabled: 1, reason: "إجازة سنوية (تجريبي)" }]);
  /* integration log sample: one invoice prepared for ZATCA, awaiting the provider */
  if (sis[0]) r.push([CORE_DT.integrationLog, `${A}-INTLOG-0001`, { engine: "zatca", company: C, reference_doctype: "Sales Invoice", reference_name: sis[0].name, status: "Awaiting Provider", provider: "ZATCA Fatoora portal (not connected)", attempts: 1, last_attempt: `${addDays(today, -1)} 10:15:00`, summary: `Reporting · ${sis[0].name}`, payload: "{}" }]);
  /* finished background jobs (owner 2026-11-13: the Background jobs page shows sample jobs; never left "Queued"): a bulk
     submit, a data import with two failed rows and a bulk receipt submit, each with its per-row log on real records */
  const stamp = (k: number, hm: string) => `${addDays(today, -k)} ${hm}:00`;
  const jobSis = adapter.list("Sales Invoice").filter((d) => d["company"] === C && Number(d.docstatus) === 1 && !Number(d["is_return"] ?? 0)).sort((a, b) => a.name.localeCompare(b.name)).slice(0, 24);
  if (jobSis.length >= 5) r.push([CORE_DT.job, `${A}-JOB-0001`, { title: `اعتماد ${jobSis.length} فاتورة مبيعات`, kind: "Bulk action", reference_doctype: "Sales Invoice", status: "Completed", started_by: "Administrator", started_on: stamp(3, "09:12"), finished_on: stamp(3, "09:13"), owner: "Administrator",
    total: jobSis.length, done: jobSis.length, failed: 0, __action: "submit", rows: jobSis.map((d, i) => ({ idx: i + 1, row_ref: d.name, status: "Done", message: "اعتُمد ورُحّل" })) }]);
  const jobItems = items.slice(0, 28);
  if (jobItems.length >= 5) r.push([CORE_DT.job, `${A}-JOB-0002`, { title: `استيراد ${jobItems.length + 2} صنفًا من ملف الموردين`, kind: "Data import", reference_doctype: "Item", status: "Completed with errors", started_by: "Administrator", started_on: stamp(2, "14:40"), finished_on: stamp(2, "14:41"), owner: "Administrator",
    total: jobItems.length + 2, done: jobItems.length, failed: 2, rows: [...jobItems.map((it, i) => ({ idx: i + 1, row_ref: `Row ${i + 2}`, status: "Done", message: `أُنشئ الصنف ${str(it["item_name"]) || it.name}` })),
      { idx: jobItems.length + 1, row_ref: `Row ${jobItems.length + 2}`, status: "Failed", message: "مجموعة الأصناف «قطع غيار المولدات» غير موجودة — أنشئها أو صحّح العمود ثم أعد الاستيراد" },
      { idx: jobItems.length + 2, row_ref: `Row ${jobItems.length + 3}`, status: "Failed", message: "وحدة القياس «كرتونة 24» غير معرّفة في وحدات القياس" }] }]);
  const jobPrs = adapter.list("Purchase Receipt").filter((d) => d["company"] === C && Number(d.docstatus) === 1).sort((a, b) => a.name.localeCompare(b.name)).slice(0, 20);
  if (jobPrs.length >= 3) r.push([CORE_DT.job, `${A}-JOB-0003`, { title: `اعتماد ${jobPrs.length} إيصال استلام`, kind: "Bulk action", reference_doctype: "Purchase Receipt", status: "Completed", started_by: "Administrator", started_on: stamp(1, "11:05"), finished_on: stamp(1, "11:06"), owner: "Administrator",
    total: jobPrs.length, done: jobPrs.length, failed: 0, __action: "submit", rows: jobPrs.map((d, i) => ({ idx: i + 1, row_ref: d.name, status: "Done", message: "اعتُمد وحُدّث المخزون" })) }]);
  /* recently captured supplier invoices (owner 2026-11-13: invoice capture shows recent captures and their match status): the
     latest purchase invoices raised against orders, logged as read from the supplier's e-invoice / scanned copy */
  const captured = pis.filter((d) => ((d["items"] as Record<string, unknown>[] | undefined) ?? []).some((l) => l["purchase_order"])).sort((a, b) => str(b["posting_date"]).localeCompare(str(a["posting_date"])) || b.name.localeCompare(a.name)).slice(0, 6);
  captured.forEach((pi, i) => {
    const po = str(((pi["items"] as Record<string, unknown>[]) ?? []).find((l) => l["purchase_order"])?.["purchase_order"]);
    const sup = adapter.get("Supplier", str(pi["supplier"])); const no = str(pi["bill_no"]) || `INV-${today.slice(0, 4)}-${String(1200 + i * 17)}`;
    const engine = i % 3 === 2 ? "ocr" : "einvoice_inbound";
    r.push([CORE_DT.integrationLog, `${A}-CAPLOG-${String(i + 1).padStart(4, "0")}`, { engine, company: C, reference_doctype: "Purchase Invoice", reference_name: pi.name, status: "Awaiting Provider",
      provider: engine === "ocr" ? "OCR service (not connected)" : "Supplier e-invoice mailbox (not connected)", attempts: 1, last_attempt: stamp(i, `${String(9 + i).padStart(2, "0")}:2${i}`),
      summary: `${str(sup?.["supplier_name"]) || str(pi["supplier"])} · ${no} → ${po}`, payload: JSON.stringify({ source: engine === "ocr" ? "text" : "ubl", invoiceNo: no, supplier: str(pi["supplier"]), supplierName: str(sup?.["supplier_name"]), date: str(pi["posting_date"]), total: Number(pi["grand_total"] ?? 0), orderRef: po }) }]);
  });
  /* customer on hold (Block Customer + release date + Core reason): its orders, deliveries and invoices cannot be submitted */
  const c0 = custs.find((c) => !/HOLD|CH-/.test(c.name));
  r.push(["Customer", `${TA}-CUST-HOLD-01`, { customer_name: "مؤسسة الأفق للتجارة", customer_type: "Company", customer_group: str(c0?.["customer_group"]) || "Commercial", territory: str(c0?.["territory"]) || "Saudi Arabia",
    default_currency: "SAR", on_hold: 1, release_date: addDays(today, 21), digit_hold_reason: "رصيد متأخر لأكثر من 90 يومًا قيد المراجعة مع الإدارة المالية" }]);
  /* marketplace channel orders (Salla, Zid, Amazon.sa, Noon) waiting to become sales orders */
  const chCust: Record<string, [string, string]> = { Salla: ["SALLA", "عملاء متجر سلة"], Zid: ["ZID", "عملاء متجر زد"], "Amazon.sa": ["AMAZON", "عملاء أمازون السعودية"], Noon: ["NOON", "عملاء نون"] };
  for (const [ch, [code, nm]] of Object.entries(chCust)) r.push(["Customer", `${TA}-CUST-CH-${code}`, { customer_name: nm, customer_type: "Individual", customer_group: str(c0?.["customer_group"]) || "Commercial", territory: str(c0?.["territory"]) || "Saudi Arabia", default_currency: "SAR" }]);
  const sell = items.filter((i) => Number(i["is_sales_item"] ?? 1) !== 0).slice(0, 4);
  const chOrders: [string, string, number, [number, number][], string, string?][] = [
    ["Salla", "SL-100482", 0, [[0, 2], [1, 1]], "New"], ["Salla", "SL-100497", 0, [[2, 5]], "New"], ["Zid", "ZD-55210", 1, [[1, 3]], "New"],
    ["Amazon.sa", "402-7781120-5521", 1, [[0, 1], [3, 2]], "New"], ["Noon", "N-SA-883104", 2, [[2, 4]], "New"], ["Noon", "N-SA-882950", 3, [[3, 1]], "Rejected", "عنوان الشحن خارج نطاق التوصيل"],
  ];
  if (sell.length >= 4) chOrders.forEach(([ch, ext, ago, ls, st, why], i) => {
    const lines = ls.map(([k, q], j) => { const it = sell[k]!; const rate = Math.max(Number(it["standard_rate"] ?? 0) || Number(it["valuation_rate"] ?? 0) * 1.4 || 100, 1); return { idx: j + 1, channel_sku: it.name, item_code: it.name, qty: q, rate: Math.round(rate * 100) / 100 }; });
    r.push([CORE_DT.channelOrder, `${TA}-CHN-${String(i + 1).padStart(4, "0")}`, { channel: ch, external_id: ext, company: T, ordered_on: `${addDays(today, -ago)} ${String(9 + i).padStart(2, "0")}:2${i}:00`, customer: `${TA}-CUST-CH-${chCust[ch]![0]}`,
      buyer_name: ["نورة القحطاني", "فهد العتيبي", "سارة الزهراني", "خالد الشمري", "ريم الدوسري", "عبدالله الغامدي"][i], buyer_phone: `+96650${String(1234567 + i * 1111).slice(0, 7)}`, ship_to: ["الرياض، حي الملقا", "جدة، حي الروضة", "الدمام، حي الشاطئ", "الرياض، حي النرجس", "مكة، حي العزيزية", "تبوك، حي المروج"][i],
      status: st, ...(why ? { reject_reason: why } : {}), items: lines, total: Math.round(lines.reduce((t, l) => t + l.qty * l.rate, 0) * 100) / 100 }]);
  });
  /* drop-ship: a draft sales order whose second line the supplier delivers straight to the customer */
  const coWh = new Set(adapter.list("Warehouse").filter((w) => w["company"] === T && !Number(w["is_group"] ?? 0)).map((w) => w.name));
  const stockBin = adapter.list("Bin").filter((b) => coWh.has(str(b["warehouse"])) && Number(b["actual_qty"] ?? 0) >= 8 && sell.some((i) => i.name === b["item_code"]) && !Number(adapter.get("Item", str(b["item_code"]))?.["has_serial_no"] ?? 0) && !Number(adapter.get("Item", str(b["item_code"]))?.["has_batch_no"] ?? 0)).sort((a, b) => a.name.localeCompare(b.name))[0];
  const d0 = stockBin ? sell.find((i) => i.name === stockBin["item_code"]) : undefined; const d1 = sell.find((i) => i.name !== d0?.name); const dWh = str(stockBin?.["warehouse"]);
  if (d0 && d1 && dWh && custs[1] && supps[0]) {
    const ln = [{ it: d0, q: 4, drop: 0 }, { it: d1, q: 10, drop: 1 }].map(({ it, q, drop }, j) => { const rate = Math.max(Number(it["standard_rate"] ?? 0) || 120, 1); return { idx: j + 1, item_code: it.name, item_name: str(it["item_name"]), qty: q, stock_qty: q, rate, base_rate: rate, amount: rate * q, base_amount: rate * q, net_rate: rate, net_amount: rate * q, uom: it["stock_uom"], stock_uom: it["stock_uom"], conversion_factor: 1, delivery_date: addDays(today, 7), warehouse: dWh, ...(drop ? { delivered_by_supplier: 1, supplier: supps[0]!.name } : {}) }; });
    const tot = ln.reduce((t, l) => t + l.amount, 0);
    r.push(["Sales Order", `${TA}-SO-DROP-0001`, { customer: custs[1].name, customer_name: str(custs[1]["customer_name"]), company: T, transaction_date: today, delivery_date: addDays(today, 7), order_type: "Sales", currency: "SAR", conversion_rate: 1, digit_channel: "Direct", set_warehouse: dWh,
      items: ln, total: tot, net_total: tot, base_total: tot, base_net_total: tot, grand_total: tot, base_grand_total: tot, rounded_total: tot, base_rounded_total: tot, total_qty: 14, docstatus: 0, status: "Draft" }]);
  }
  /* in-app guide */
  for (const k of KNOWLEDGE) r.push([CORE_DT.knowledge, k.id, { article_id: k.id, title_en: k.title[0], title_ar: k.title[1], area: k.area, route: k.route, what_en: k.what[0], what_ar: k.what[1], why_en: k.why[0], why_ar: k.why[1], how_en: k.how[0], how_ar: k.how[1] }]);
  return r;
}

/** Insert-if-missing; returns the number of inserted records. */
export function seedCore(today?: string): number {
  if (typeof window === "undefined" && typeof localStorage === "undefined") return 0;
  const gone = deletedIndex(); let added = 0; const abbr = String(demoCompany()?.["abbr"] ?? "");
  for (const [dt, name, data] of coreRecords(today)) {
    if (adapter.get(dt, name) || gone.has(deletedKey(dt, name)) || hasLegacyTwin(dt, name, data, abbr)) continue;
    adapter.insertDocQuiet(dt, { ...data, name, __synthetic: 1 });
    added++;
  }
  return added + seedReportData(today);
}
