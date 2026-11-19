/**
 * Port of frappe.model.rename_doc.rename_doc (merge + link cascade) over the VirtualERPAdapter.
 * The rename log is persisted so seed (insert-if-missing) and hard-coded defaults resolve old names to new ones.
 */
import { adapter, type Doc } from "./adapter";

const KEY = "digit-virtual-core:renames-v1";
type Log = Record<string, Record<string, string>>;
let log: Log | null = null;
function load(): Log {
  if (log) return log;
  try { log = typeof localStorage !== "undefined" ? JSON.parse(localStorage.getItem(KEY) || "{}") : {}; } catch { log = {}; }
  return log!;
}
function persist() { try { localStorage.setItem(KEY, JSON.stringify(load())); } catch { /* ignore */ } }

/** Follow the rename chain (A→B→C). */
export function resolveName(dt: string, name: string): string {
  const m = load()[dt]; if (!m) return name;
  let cur = name; for (let i = 0; i < 10 && m[cur]; i++) cur = m[cur]!;
  return cur;
}
export function wasRenamed(dt: string, name: string) { return resolveName(dt, name) !== name; }
export function renameLog(): Log { return load(); }

/** Title fields Frappe updates together with the name (autoname: field:<x> / naming by title). */
const TITLE_FIELD: Record<string, string> = {
  Company: "company_name", Account: "account_name", "Price List": "price_list_name", Warehouse: "warehouse_name",
  "Cost Center": "cost_center_name", "Sales Taxes and Charges Template": "title", "Purchase Taxes and Charges Template": "title",
  "Item Group": "item_group_name", Territory: "territory_name", "Customer Group": "customer_group_name",
  "Asset Category": "asset_category_name", Location: "location_name", "Sales Person": "sales_person_name", "Supplier Group": "supplier_group_name",
};

function replaceDeep(v: unknown, from: string, to: string): [unknown, boolean] {
  if (v === from) return [to, true];
  if (Array.isArray(v)) { let ch = false; const out = v.map((x) => { const [y, c] = replaceDeep(x, from, to); ch ||= c; return y; }); return [out, ch]; }
  if (v && typeof v === "object") {
    let ch = false; const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) { if (k === "doctype" || k === "idx" || k === "__name_en") { out[k] = x; continue; } const [y, c] = replaceDeep(x, from, to); out[k] = y; ch ||= c; }
    return [out, ch];
  }
  return [v, false];
}

/** update_linked_doctypes: every Link / Dynamic Link / child-row value equal to the old name. Returns updated doc count. */
export function cascade(from: string, to: string): number {
  let n = 0;
  for (const dt of adapter.doctypes()) for (const d of adapter.list(dt)) {
    const { name, ...rest } = d;
    const [nx, ch] = replaceDeep(rest, from, to);
    if (ch) { adapter.insertDocQuiet(dt, { ...(nx as Record<string, unknown>), name }); n++; }
  }
  return n;
}

export type RenameResult = { ok: boolean; error?: string; links: number };
export function renameDoc(dt: string, oldName: string, newName: string, opts: { merge?: boolean; title?: string | undefined } = {}): RenameResult {
  newName = newName.trim();
  const d = adapter.get(dt, oldName);
  if (!d) return { ok: false, error: `${dt} ${oldName} does not exist`, links: 0 };
  if (!newName || newName === oldName) return { ok: false, error: "New name must be different", links: 0 };
  const target = adapter.get(dt, newName);
  if (target && !opts.merge) return { ok: false, error: `Another ${dt} with name ${newName} exists, select another name`, links: 0 };
  if (opts.merge && !target) return { ok: false, error: `${dt} ${newName} does not exist. Merge needs an existing record`, links: 0 };
  if (opts.merge && dt === "Account" && target) {
    for (const k of ["is_group", "root_type", "company"]) if (String(target[k] ?? "") !== String(d[k] ?? "")) return { ok: false, error: `Merging is only possible if ${k} is same in both records`, links: 0 };
  }
  adapter.remove(dt, oldName);
  if (!opts.merge) {
    const tf = TITLE_FIELD[dt];
    const patch: Record<string, unknown> = { ...d, name: newName };
    if (tf) patch[tf] = opts.title ?? (dt === "Company" ? newName : newName.replace(/ - [^-]+$/, ""));
    adapter.insertDocQuiet(dt, patch);
  }
  const links = cascade(oldName, newName);
  const m = load(); (m[dt] ??= {})[oldName] = newName; persist();
  adapter.insertDocQuiet("Comment", { name: `REN-${dt}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, comment_type: "Edit", reference_doctype: dt, reference_name: newName, content: `${opts.merge ? "merged" : "renamed"} from ${oldName} to ${newName}`, owner: "Administrator", creation: new Date().toISOString() });
  return { ok: true, links };
}

/** Owner-requested Arabic-first demo names (Step 1.2). Idempotent; re-applies to records added later by seed. */
export const DEMO_RENAMES: [string, string, string, string?][] = (() => {
  const A = "DDT";
  const r: [string, string, string, string?][] = [
    ["Company", "Digit Demo Trading Co.", "شركة ديجيت التجريبية للتجارة"],
    ["Price List", "Standard Selling", "البيع القياسي"],
    ["Price List", "Standard Buying", "الشراء القياسي"],
    ["Sales Taxes and Charges Template", `KSA VAT 15% - ${A}`, `ضريبة القيمة المضافة 15% - ${A}`, "ضريبة القيمة المضافة 15%"],
    ["Purchase Taxes and Charges Template", `KSA VAT 15% Input - ${A}`, `ضريبة القيمة المضافة 15% (مشتريات) - ${A}`, "ضريبة القيمة المضافة 15% (مشتريات)"],
  ];
  const wh: Record<string, string> = { "Riyadh Main": "مستودع الرياض الرئيسي", Jeddah: "مستودع جدة", Dammam: "مستودع الدمام", "Finished Goods": "مستودع البضاعة التامة" };
  for (const [e, a] of Object.entries(wh)) r.push(["Warehouse", `${e} - ${A}`, `${a} - ${A}`]);
  const cc: Record<string, string> = { Main: "الرئيسي", Riyadh: "الرياض", Jeddah: "جدة", Dammam: "الدمام" };
  for (const [e, a] of Object.entries(cc)) r.push(["Cost Center", `${e} - ${A}`, `${a} - ${A}`]);
  const ac: Record<string, string> = {
    "Application of Funds (Assets)": "الأصول", "Current Assets": "الأصول المتداولة", Cash: "النقدية", "Al-Demo Bank": "البنك التجريبي", Debtors: "المدينون",
    "Stock In Hand": "المخزون", "VAT 15% Input": "ضريبة القيمة المضافة 15% مدخلات", "Fixed Assets": "الأصول الثابتة",
    "Source of Funds (Liabilities)": "الخصوم", Creditors: "الدائنون", "VAT 15% Output": "ضريبة القيمة المضافة 15% مخرجات", "Salary Payable": "رواتب مستحقة",
    Equity: "حقوق الملكية", "Capital Stock": "رأس المال", "Opening Balance Equity": "حقوق ملكية الرصيد الافتتاحي", "Retained Earnings": "الأرباح المحتجزة",
    Income: "الإيرادات", Sales: "المبيعات", "Service Income": "إيرادات الخدمات",
    Expenses: "المصروفات", "Cost of Goods Sold": "تكلفة البضاعة المباعة", Salary: "الرواتب", "Rent Expense": "مصروف الإيجار",
    "Utilities Expense": "مصروف المرافق", Depreciation: "الإهلاك", "Round Off": "فروقات التقريب", "Accumulated Depreciation": "مجمع الإهلاك", "Gain/Loss on Asset Disposal": "أرباح وخسائر التخلص من الأصول", "Exchange Gain/Loss": "أرباح وخسائر فروق العملة", "USD Bank": "البنك بالدولار", "Temporary Opening": "الافتتاح المؤقت",
    "Stock Received But Not Billed": "بضاعة مستلمة غير مفوترة", "Stock Adjustment": "تسوية المخزون",
    "Debtors USD": "المدينون بالدولار",
  };
  for (const [e, a] of Object.entries(ac)) r.push(["Account", `${e} - ${A}`, `${a} - ${A}`]);
  // Asset Category is named by asset_category_name (autoname field:): a Saudi company names its categories in Arabic
  const cat: Record<string, string> = { Vehicles: "المركبات", "IT Equipment": "أجهزة تقنية المعلومات", Machinery: "الآلات والمعدات", Furniture: "الأثاث والمفروشات" };
  for (const [e, a] of Object.entries(cat)) r.push(["Asset Category", e, a, a]);
  // demo cities are both a Territory and an asset Location; the territory goes first (its value cascade also moves the
  // asset locations), then the Location record itself, merged into the Arabic one when that already exists
  const city: Record<string, string> = { Riyadh: "الرياض", Jeddah: "جدة", Dammam: "الدمام", Makkah: "مكة المكرمة", Madinah: "المدينة المنورة", Khobar: "الخبر" };
  for (const [e, a] of Object.entries(city)) r.push(["Territory", e, a, a], ["Location", e, a, a]);
  const people: Record<string, string> = { "Ahmed Al-Ghamdi": "أحمد الغامدي", "Reem Al-Harbi": "ريم الحربي", "Majed Al-Dosari": "ماجد الدوسري", "Lama Al-Shehri": "لمى الشهري", "Turki Al-Anazi": "تركي العنزي" };
  for (const [e, a] of Object.entries(people)) r.push(["Sales Person", e, a, a]);
  for (const [e, a] of Object.entries({ "Local Supplier": "مورد محلي", Importer: "مستورد" })) r.push(["Supplier Group", e, a, a]);
  return r;
})();

export function applyDemoRenames(): number {
  let n = 0;
  for (const [dt, from, to, title] of DEMO_RENAMES) {
    if (adapter.get(dt, from)) {
      const res = renameDoc(dt, from, to, { merge: !!adapter.get(dt, to), title });
      if (res.ok) n++;
    } else if (wasRenamed(dt, from) && hasRefs(from)) { cascade(from, to); n++; }
  }
  return n;
}
let refIndex: Set<string> | null = null;
function hasRefs(v: string) {
  if (!refIndex) { refIndex = new Set(); const walk = (x: unknown) => { if (typeof x === "string") refIndex!.add(x); else if (Array.isArray(x)) x.forEach(walk); else if (x && typeof x === "object") Object.values(x).forEach(walk); }; for (const dt of adapter.doctypes()) for (const d of adapter.list(dt)) walk(d as Doc); }
  return refIndex.has(v);
}
export function resetRefIndex() { refIndex = null; }
