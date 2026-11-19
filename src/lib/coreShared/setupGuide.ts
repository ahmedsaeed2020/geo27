/**
 * Guided setup and data completeness (research topics Guided setup / onboarding / setup / central settings / completeness /
 * data completeness / validation — Acumatica and Business Central assisted setup checklists, Qoyod / Wafeq / Zoho Books
 * "complete your company profile", Odoo onboarding panels). One shared Enterprise engine every DIGIT app reads:
 *  - setupSteps(): the company's go-live steps, each DONE from the records that exist (never a stored tick), with the screen
 *    that completes it;
 *  - completenessChecks(): master data a Saudi tax invoice, payment or stock move needs (VAT numbers, IBANs, prices, units),
 *    counted over the records the user may read, each opening exactly the incomplete records.
 * Read-only: nothing is stored or changed here.
 */
import { adapter, type Doc } from "@/lib/adapter";
import { currentUser } from "@/lib/session";
import { canReadType, scopedList } from "@/lib/scope";
import { CORE_DT } from "./doctypes";
import { providerConnected, validSaudiIban as providerIban, validSaudiVat as providerVat } from "./providers";
import type { Bi, Flt, ListDrill } from "./finance";
import { isEnabled } from "@/plugins/runtime";

/**
 * App go-live steps and master-data checks on the same guide (Pro parity: every DIGIT app's masters in one checklist).
 * An app registers once; its rows appear only while the app is enabled and follow the same read rules as Core rows.
 */
export interface SetupProvider { app: string; steps?: (company: string, user: string) => SetupStep[]; checks?: (user: string) => CompletenessCheck[] }
const PROVIDERS: SetupProvider[] = [];
export function registerSetupProvider(p: SetupProvider) { const i = PROVIDERS.findIndex((x) => x.app === p.app); if (i >= 0) PROVIDERS[i] = p; else PROVIDERS.push(p); }
const appRows = <T,>(f: (p: SetupProvider) => T[] | undefined) => PROVIDERS.filter((p) => isEnabled(p.app)).flatMap((p) => { try { return f(p) ?? []; } catch { return []; } });
/** One completeness check over rows the user may read (apps use the same rule as Core checks). */
export function completenessCheck(id: string, label: Bi, why: Bi, doctype: string, rows: Doc[], bad: (d: Doc) => boolean, user = currentUser()): CompletenessCheck {
  const readable = canReadType(doctype, user); const miss = readable ? rows.filter(bad).map((d) => d.name) : [];
  return { id, label, why, doctype, total: readable ? rows.length : 0, missing: miss.length, drill: { doctype, filters: [["name", "in", miss.length ? miss : ["—"]]] }, readable };
}

const s = (v: unknown) => (v == null ? "" : String(v));
const today = () => new Date().toISOString().slice(0, 10);
/** The shared provider validators (Saudi VAT number 3…3, Saudi IBAN with its check digits). */
const validSaudiVat = (v: unknown) => providerVat(s(v)); const validSaudiIban = (v: unknown) => providerIban(s(v));

export type StepOpen = { kind: "list"; drill: ListDrill } | { kind: "new"; doctype: string } | { kind: "doc"; doctype: string; name: string } | { kind: "route"; to: string; search?: Record<string, string> };
export interface SetupStep { id: string; label: Bi; why: Bi; done: boolean; detail: Bi; open: StepOpen; readable: boolean }

/** The go-live steps of one company, in the order an implementer completes them. */
export function setupSteps(company: string, user = currentUser()): SetupStep[] {
  const co: Doc | undefined = company ? adapter.get("Company", company) : undefined;
  const R = (dt: string) => canReadType(dt, user); const L = (dt: string) => (R(dt) ? scopedList(dt, user) : []);
  const forCo = (rows: Doc[]) => rows.filter((r) => !r["company"] || s(r["company"]) === company);
  const steps: SetupStep[] = [];
  const add = (st: Omit<SetupStep, "readable"> & { readable?: boolean }) => steps.push({ readable: true, ...st });
  const vatOk = validSaudiVat(co?.["tax_id"]);
  add({ id: "company", label: ["Company profile", "ملف الشركة"], why: ["Name, currency SAR and the VAT number printed on every tax invoice.", "الاسم والعملة (ريال) والرقم الضريبي المطبوع على كل فاتورة ضريبية."],
    done: !!co && s(co["default_currency"]) === "SAR" && vatOk, detail: !co ? ["No company yet.", "لا توجد شركة بعد."] : vatOk ? ["Currency and VAT number set.", "العملة والرقم الضريبي محددان."] : ["The 15-digit VAT number (3…3) is missing or invalid.", "الرقم الضريبي (15 رقمًا يبدأ وينتهي بـ 3) مفقود أو غير صحيح."],
    open: co ? { kind: "doc", doctype: "Company", name: company } : { kind: "new", doctype: "Company" }, readable: R("Company") });
  const t = today(); const fy = L("Fiscal Year").find((f) => s(f["year_start_date"]) <= t && t <= s(f["year_end_date"]));
  add({ id: "fiscal_year", label: ["Fiscal year", "السنة المالية"], why: ["Every posting date must fall in an open fiscal year.", "يجب أن يقع كل تاريخ ترحيل في سنة مالية مفتوحة."],
    done: !!fy, detail: fy ? [`${fy.name} covers today.`, `${fy.name} تغطي تاريخ اليوم.`] : ["No fiscal year covers today.", "لا توجد سنة مالية تغطي تاريخ اليوم."],
    open: { kind: "list", drill: { doctype: "Fiscal Year", filters: [] } }, readable: R("Fiscal Year") });
  const accounts = forCo(L("Account")); const defaultsOk = !!co && !!s(co["default_receivable_account"]) && !!s(co["default_payable_account"]);
  add({ id: "accounts", label: ["Chart of accounts and default accounts", "دليل الحسابات والحسابات الافتراضية"], why: ["Invoices and payments post to the company's receivable, payable and income accounts.", "تُرحَّل الفواتير والمدفوعات إلى حسابات الذمم والإيرادات الافتراضية للشركة."],
    done: accounts.length > 0 && defaultsOk, detail: [`${accounts.length} accounts${defaultsOk ? "; default receivable and payable set" : "; default receivable / payable account missing"}.`, `${accounts.length} حسابًا${defaultsOk ? "؛ حسابا الذمم المدينة والدائنة الافتراضيان محددان" : "؛ حساب الذمم المدينة / الدائنة الافتراضي غير محدد"}.`],
    open: { kind: "route", to: "/app/erpnext/account/view/tree" }, readable: R("Account") });
  const salesTax = forCo(L("Sales Taxes and Charges Template")).length, buyTax = forCo(L("Purchase Taxes and Charges Template")).length;
  add({ id: "vat", label: ["VAT templates (15%)", "قوالب ضريبة القيمة المضافة (15%)"], why: ["Sales and purchase documents take their VAT from these templates.", "تأخذ مستندات البيع والشراء ضريبتها من هذه القوالب."],
    done: salesTax > 0 && buyTax > 0, detail: [`${salesTax} sales, ${buyTax} purchase templates.`, `${salesTax} قالب مبيعات، ${buyTax} قالب مشتريات.`],
    open: { kind: "list", drill: { doctype: "Sales Taxes and Charges Template", filters: [["company", "=", company]] } }, readable: R("Sales Taxes and Charges Template") });
  const banks = L("Bank Account").filter((b) => Number(b["is_company_account"]) === 1 && (!b["company"] || s(b["company"]) === company)); const ibanOk = banks.some((b) => validSaudiIban(b["iban"]));
  add({ id: "bank", label: ["Company bank account", "الحساب البنكي للشركة"], why: ["Payments, bank matching and the bank transfer file need the company's IBAN.", "تحتاج المدفوعات والمطابقة البنكية وملف التحويل إلى آيبان الشركة."],
    done: ibanOk, detail: banks.length ? (ibanOk ? [`${banks.length} company bank accounts with a valid IBAN.`, `${banks.length} حساب بنكي للشركة بآيبان صحيح.`] : ["No company bank account has a valid Saudi IBAN (SA + 22 digits).", "لا يوجد حساب بنكي للشركة بآيبان سعودي صحيح (SA + 22 رقمًا)."]) : ["No company bank account yet.", "لا يوجد حساب بنكي للشركة بعد."],
    open: { kind: "list", drill: { doctype: "Bank Account", filters: [["is_company_account", "=", 1]] } }, readable: R("Bank Account") });
  const wh = forCo(L("Warehouse")).filter((w) => !Number(w["is_group"]));
  add({ id: "warehouses", label: ["Warehouses", "المستودعات"], why: ["Stock is received, moved and delivered by warehouse.", "يُستلم المخزون ويُنقل ويُسلَّم حسب المستودع."],
    done: wh.length > 0, detail: [`${wh.length} warehouses.`, `${wh.length} مستودعًا.`], open: { kind: "list", drill: { doctype: "Warehouse", filters: [["company", "=", company]] } }, readable: R("Warehouse") });
  const items = L("Item").filter((i) => !Number(i["disabled"])), priced = new Set(L("Item Price").filter((p) => Number(p["selling"]) === 1).map((p) => s(p["item_code"])));
  add({ id: "items", label: ["Items and selling prices", "الأصناف وأسعار البيع"], why: ["Quotations and invoices take the item's selling price.", "تأخذ عروض الأسعار والفواتير سعر بيع الصنف."],
    done: items.length > 0 && items.some((i) => priced.has(i.name)), detail: [`${items.length} items, ${items.filter((i) => priced.has(i.name)).length} with a selling price.`, `${items.length} صنفًا، ${items.filter((i) => priced.has(i.name)).length} منها بسعر بيع.`],
    open: { kind: "list", drill: { doctype: "Item", filters: [["disabled", "=", 0]] } }, readable: R("Item") });
  const cust = L("Customer").length, sup = L("Supplier").length;
  add({ id: "parties", label: ["Customers and suppliers", "العملاء والموردون"], why: ["Every sale and purchase names its party.", "كل عملية بيع أو شراء تحدد طرفها."],
    done: cust > 0 && sup > 0, detail: [`${cust} customers, ${sup} suppliers.`, `${cust} عميلًا، ${sup} موردًا.`], open: { kind: "list", drill: { doctype: "Customer", filters: [] } }, readable: R("Customer") });
  const brand = company ? adapter.get(CORE_DT.printBranding, company) : undefined;
  add({ id: "branding", label: ["Print branding", "هوية الطباعة"], why: ["Logo, Arabic / English name, CR number and footer on every printed document.", "الشعار والاسم بالعربية والإنجليزية والسجل التجاري والتذييل على كل مستند مطبوع."],
    done: !!brand && (!!s(brand["logo"]) || !!s(brand["company_name_ar"])), detail: brand ? ["Branding saved for this company.", "الهوية محفوظة لهذه الشركة."] : ["Not set — documents print the company name only.", "غير محددة — تُطبع المستندات باسم الشركة فقط."],
    open: { kind: "route", to: "/pro/admin", search: { tab: "branding" } } });
  const users = L("User").filter((u) => u.name !== "Administrator" && u.name !== "Guest" && Number(u["enabled"] ?? 1) === 1 && ((u["roles"] as unknown[] | undefined)?.length ?? 0) > 0);
  add({ id: "users", label: ["Users and roles", "المستخدمون والأدوار"], why: ["Each person signs in with their own user and only the roles they need.", "يدخل كل شخص بمستخدمه الخاص وبالأدوار التي يحتاجها فقط."],
    done: users.length > 0, detail: [`${users.length} users with roles.`, `${users.length} مستخدمًا بأدوار.`], open: { kind: "list", drill: { doctype: "User", filters: [["enabled", "=", 1]] } }, readable: R("User") });
  const zatca = providerConnected("zatca"), mail = providerConnected("email");
  add({ id: "providers", label: ["E-invoicing and e-mail providers", "مزودا الفوترة الإلكترونية والبريد"], why: ["ZATCA submission and outgoing e-mail are sent through the providers set in Administration.", "يُرسل التقديم لهيئة الزكاة والبريد الصادر عبر المزودين المحددين في الإدارة."],
    done: zatca && mail, detail: [`ZATCA: ${zatca ? "connected" : "preview only"} · e-mail: ${mail ? "connected" : "preview only"}.`, `هيئة الزكاة: ${zatca ? "متصل" : "معاينة فقط"} · البريد: ${mail ? "متصل" : "معاينة فقط"}.`],
    open: { kind: "route", to: "/pro/admin", search: { tab: "integrations" } } });
  return [...steps, ...appRows((p) => p.steps?.(company, user))];
}

export interface CompletenessCheck { id: string; label: Bi; why: Bi; doctype: string; total: number; missing: number; drill: ListDrill; readable: boolean }
/** Master data a Saudi tax invoice, payment or stock move needs; each check opens exactly the incomplete records. */
export function completenessChecks(user = currentUser()): CompletenessCheck[] {
  const out: CompletenessCheck[] = [];
  const check = (id: string, label: Bi, why: Bi, doctype: string, rows: Doc[], bad: (d: Doc) => boolean) => {
    const readable = canReadType(doctype, user); const miss = readable ? rows.filter(bad).map((d) => d.name) : [];
    const filters: Flt[] = [["name", "in", miss.length ? miss : ["—"]]];
    out.push({ id, label, why, doctype, total: readable ? rows.length : 0, missing: miss.length, drill: { doctype, filters }, readable });
  };
  const L = (dt: string) => (canReadType(dt, user) ? scopedList(dt, user) : []);
  const customers = L("Customer").filter((c) => !Number(c["disabled"])), suppliers = L("Supplier").filter((c) => !Number(c["disabled"]));
  check("customer_vat", ["Business customers without a valid VAT number", "عملاء منشآت بلا رقم ضريبي صحيح"], ["A standard tax invoice to a VAT-registered buyer prints the buyer's VAT number.", "الفاتورة الضريبية القياسية لمشترٍ مسجل تطبع رقمه الضريبي."],
    "Customer", customers.filter((c) => s(c["customer_type"]) !== "Individual"), (c) => !validSaudiVat(c["tax_id"]));
  check("customer_address", ["Customers without a primary address", "عملاء بلا عنوان رئيسي"], ["The tax invoice prints the buyer's address.", "تطبع الفاتورة الضريبية عنوان المشتري."],
    "Customer", customers, (c) => !s(c["customer_primary_address"]));
  check("supplier_vat", ["Suppliers without a valid VAT number", "موردون بلا رقم ضريبي صحيح"], ["Input VAT is claimed only on invoices from a VAT-registered supplier.", "تُسترد ضريبة المدخلات فقط من فواتير مورد مسجل ضريبيًا."],
    "Supplier", suppliers, (c) => !validSaudiVat(c["tax_id"]));
  const ibans = new Set(L("Bank Account").filter((b) => s(b["party_type"]) === "Supplier" && validSaudiIban(b["iban"])).map((b) => s(b["party"])));
  check("supplier_iban", ["Suppliers without a bank IBAN", "موردون بلا آيبان بنكي"], ["The bank transfer file pays only beneficiaries with a valid Saudi IBAN.", "ملف التحويل البنكي يدفع فقط للمستفيدين بآيبان سعودي صحيح."],
    "Supplier", suppliers, (c) => !ibans.has(c.name));
  const items = L("Item").filter((i) => !Number(i["disabled"])); const priced = new Set(L("Item Price").filter((p) => Number(p["selling"]) === 1).map((p) => s(p["item_code"])));
  check("item_price", ["Sales items without a selling price", "أصناف بيع بلا سعر بيع"], ["Quotations and invoices start from the item's selling price.", "تبدأ العروض والفواتير من سعر بيع الصنف."],
    "Item", items.filter((i) => Number(i["is_sales_item"] ?? 1) === 1), (i) => !priced.has(i.name));
  check("item_group", ["Items without an item group or unit", "أصناف بلا مجموعة أو وحدة"], ["Reports, pricing rules and stock moves group and count by item group and unit.", "تجمع التقارير وقواعد التسعير وحركات المخزون حسب المجموعة والوحدة."],
    "Item", items, (i) => !s(i["item_group"]) || !s(i["stock_uom"]));
  return [...out, ...appRows((p) => p.checks?.(user))];
}
export const completenessPct = (c: CompletenessCheck) => (c.total ? Math.round(((c.total - c.missing) / c.total) * 100) : 100);
