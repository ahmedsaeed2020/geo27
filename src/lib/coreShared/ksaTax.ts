/**
 * Saudi tax in the shared Core (owner DEC-01 / OWN-16): the ZATCA VAT return boxes and a Zakat base estimate, computed
 * from submitted invoices and posted GL Entries only. Every box keeps the documents behind it so screens drill to them.
 * Filing itself happens on the ZATCA portal — the return is prepared here and handed over through the provider setting.
 */
import { adapter, type Doc } from "@/lib/adapter";
import { scopedList } from "@/lib/scope";
import { currentUser } from "@/lib/session";

const n = (v: unknown) => Number(v ?? 0) || 0;
const r2 = (x: number) => Math.round(x * 100) / 100;
const s = (v: unknown) => String(v ?? "");
export type Bi = [string, string];
export interface VatBox { box: number; key: string; label: Bi; amount: number; adjustment: number; vat: number; doctype: string; names: string[] }
export interface VatReturn { company: string; from: string; to: string; sales: VatBox[]; purchases: VatBox[]; outputVat: number; inputVat: number; netDue: number; corrections: number }

const SA = (country: string) => !country || /saudi/i.test(country);
const vatOf = (d: Doc) => n(d["base_total_taxes_and_charges"] ?? d["total_taxes_and_charges"]);
const netOf = (d: Doc) => n(d["base_net_total"] ?? d["net_total"]);
const exempt = (d: Doc) => /exempt|معفا/i.test(s(d["taxes_and_charges"])) || ((d["items"] as Doc[] | undefined) ?? []).every((i) => /exempt/i.test(s(i["item_tax_template"]))) && ((d["items"] as Doc[] | undefined) ?? []).length > 0;

function box(box: number, key: string, label: Bi, doctype: string, docs: Doc[]): VatBox {
  const plus = docs.filter((d) => !n(d["is_return"])), minus = docs.filter((d) => n(d["is_return"]));
  return { box, key, label, doctype, amount: r2(plus.reduce((t, d) => t + netOf(d), 0)), adjustment: r2(minus.reduce((t, d) => t + netOf(d), 0)), vat: r2(docs.reduce((t, d) => t + vatOf(d), 0)), names: docs.map((d) => d.name).sort() };
}
/** ZATCA VAT return: sales boxes 1–6, purchase boxes 7–12, net VAT due (box 13–15). Returns are the adjustment column. */
export function ksaVatReturn(company: string, from: string, to: string, user = currentUser()): VatReturn {
  const inRange = (d: Doc) => n(d.docstatus) === 1 && d["company"] === company && s(d["posting_date"]) >= from && s(d["posting_date"]) <= to;
  const si = scopedList("Sales Invoice", user).filter(inRange);
  const pi = scopedList("Purchase Invoice", user).filter(inRange);
  // an export: the customer's country / territory is outside the Kingdom (Customer has no country field; territory or an explicit country decide)
  const custForeign = (d: Doc) => { const c = adapter.get("Customer", s(d["customer"])); const terr = s(d["territory"] || c?.["territory"]); return /international|rest of the world|export|خارج/i.test(terr) || (!!s(c?.["country"]) && !SA(s(c?.["country"]))); };
  const supForeign = (d: Doc) => !SA(s(adapter.get("Supplier", s(d["supplier"]))?.["country"])) || /import/i.test(s(adapter.get("Supplier", s(d["supplier"]))?.["supplier_group"]));
  const sStd = si.filter((d) => vatOf(d) !== 0), sZero = si.filter((d) => vatOf(d) === 0 && !custForeign(d) && !exempt(d)), sExp = si.filter((d) => vatOf(d) === 0 && custForeign(d)), sEx = si.filter((d) => vatOf(d) === 0 && !custForeign(d) && exempt(d));
  const pStd = pi.filter((d) => vatOf(d) !== 0 && !supForeign(d)), pImp = pi.filter((d) => vatOf(d) !== 0 && supForeign(d)), pRc = pi.filter((d) => vatOf(d) === 0 && supForeign(d)), pZero = pi.filter((d) => vatOf(d) === 0 && !supForeign(d) && !exempt(d)), pEx = pi.filter((d) => vatOf(d) === 0 && !supForeign(d) && exempt(d));
  const sales = [
    box(1, "std_sales", ["Standard rated sales (15%)", "المبيعات الخاضعة للنسبة الأساسية (15%)"], "Sales Invoice", sStd),
    box(2, "citizen_sales", ["Sales to citizens (private healthcare / private education / first house)", "المبيعات للمواطنين (الخدمات الصحية والتعليمية الخاصة والمسكن الأول)"], "Sales Invoice", []),
    box(3, "zero_sales", ["Zero-rated domestic sales", "المبيعات المحلية الخاضعة للنسبة الصفرية"], "Sales Invoice", sZero),
    box(4, "exports", ["Exports", "الصادرات"], "Sales Invoice", sExp),
    box(5, "exempt_sales", ["Exempt sales", "المبيعات المعفاة"], "Sales Invoice", sEx),
  ];
  const purchases = [
    box(7, "std_purchases", ["Standard rated domestic purchases (15%)", "المشتريات المحلية الخاضعة للنسبة الأساسية (15%)"], "Purchase Invoice", pStd),
    box(8, "imports_customs", ["Imports subject to VAT paid at customs", "الاستيرادات الخاضعة للضريبة المدفوعة في الجمارك"], "Purchase Invoice", pImp),
    box(9, "imports_rc", ["Imports subject to VAT under reverse charge", "الاستيرادات الخاضعة للضريبة بآلية الاحتساب العكسي"], "Purchase Invoice", pRc),
    box(10, "zero_purchases", ["Zero-rated purchases", "المشتريات الخاضعة للنسبة الصفرية"], "Purchase Invoice", pZero),
    box(11, "exempt_purchases", ["Exempt purchases", "المشتريات المعفاة"], "Purchase Invoice", pEx),
  ];
  const total = (xs: VatBox[], k: number, key: string, label: Bi, dt: string): VatBox => ({ box: k, key, label, doctype: dt, amount: r2(xs.reduce((t, b) => t + b.amount, 0)), adjustment: r2(xs.reduce((t, b) => t + b.adjustment, 0)), vat: r2(xs.reduce((t, b) => t + b.vat, 0)), names: xs.flatMap((b) => b.names).sort() });
  sales.push(total(sales, 6, "total_sales", ["Total sales", "إجمالي المبيعات"], "Sales Invoice"));
  purchases.push(total(purchases, 12, "total_purchases", ["Total purchases", "إجمالي المشتريات"], "Purchase Invoice"));
  const outputVat = sales[sales.length - 1]!.vat, inputVat = purchases[purchases.length - 1]!.vat;
  return { company, from, to, sales, purchases, outputVat, inputVat, netDue: r2(outputVat - inputVat), corrections: 0 };
}

export interface ZakatLine { key: string; label: Bi; amount: number; accounts: string[] }
export interface ZakatEstimate { company: string; asOf: string; sources: ZakatLine[]; deductions: ZakatLine[]; base: number; rate: number; zakat: number; rateGregorian: number; zakatGregorian: number }
/**
 * Zakat base estimate (ZATCA rules, simplified): sources = equity + current-year profit + provisions and long-term
 * liabilities; deductions = net fixed assets + capital work in progress + long-term investments. Zakat = 2.5% of a
 * positive base for a Hijri year (2.5776% for a Gregorian year).
 */
export function zakatEstimate(company: string, asOf: string, user = currentUser()): ZakatEstimate {
  const acc = new Map(scopedList("Account", user).filter((a) => a["company"] === company).map((a) => [a.name, a]));
  const bal = new Map<string, number>();
  for (const g of scopedList("GL Entry", user)) {
    if (g["company"] !== company || n(g["is_cancelled"]) || s(g["posting_date"]) > asOf) continue;
    bal.set(s(g["account"]), (bal.get(s(g["account"])) ?? 0) + n(g["debit"]) - n(g["credit"]));
  }
  const pick = (f: (a: Doc) => boolean, sign: 1 | -1) => { const names = [...bal.keys()].filter((k) => { const a = acc.get(k); return !!a && f(a); }).sort(); return { amount: r2(names.reduce((t, k) => t + sign * (bal.get(k) ?? 0), 0)), accounts: names }; };
  const root = (a: Doc) => s(a["root_type"]); const type = (a: Doc) => s(a["account_type"]); const nm = (a: Doc) => `${s(a["account_name"])} ${a.name} ${s(a["parent_account"])}`;
  const longTerm = (a: Doc) => root(a) === "Liability" && /provision|long[- ]term|non[- ]current|loan|مخصص|طويل/i.test(nm(a));
  const sources: ZakatLine[] = [
    { key: "equity", label: ["Equity (capital, reserves, retained earnings)", "حقوق الملكية (رأس المال والاحتياطيات والأرباح المبقاة)"], ...pick((a) => root(a) === "Equity", -1) },
    { key: "profit", label: ["Profit to date (income − expense)", "الربح حتى التاريخ (الإيرادات − المصروفات)"], ...pick((a) => root(a) === "Income" || root(a) === "Expense", -1) },
    { key: "provisions", label: ["Provisions and long-term liabilities", "المخصصات والالتزامات طويلة الأجل"], ...pick(longTerm, -1) },
  ];
  const deductions: ZakatLine[] = [
    { key: "fixed_assets", label: ["Net fixed assets", "صافي الأصول الثابتة"], ...pick((a) => ["Fixed Asset", "Accumulated Depreciation"].includes(type(a)), 1) },
    { key: "cwip", label: ["Capital work in progress", "أعمال رأسمالية تحت التنفيذ"], ...pick((a) => type(a) === "Capital Work in Progress", 1) },
    { key: "investments", label: ["Long-term investments", "الاستثمارات طويلة الأجل"], ...pick((a) => root(a) === "Asset" && /investment|استثمار/i.test(nm(a)) && !["Fixed Asset", "Accumulated Depreciation"].includes(type(a)), 1) },
  ];
  const base = r2(Math.max(0, sources.reduce((t, l) => t + l.amount, 0) - deductions.reduce((t, l) => t + l.amount, 0)));
  return { company, asOf, sources, deductions, base, rate: 0.025, zakat: r2(base * 0.025), rateGregorian: 0.025776, zakatGregorian: r2(base * 0.025776) };
}
