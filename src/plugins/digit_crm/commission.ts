import { adapter, registerDocHook, type Doc } from "@/lib/adapter";
import { submit } from "@/lib/posting";
import { isServerHosted } from "@/lib/serverHost";
import { assertPerm, currentUser } from "@/lib/session";
import { cachedMeta } from "@/lib/catalog";
import { STATEMENT, SETTINGS } from "./commissionSchema";
const rows = (v: unknown) => Array.isArray(v) ? v as Record<string, unknown>[] : [];
const money = (n: number) => Math.round(n * 100) / 100;
export function commissionLines(d: Doc) {
  const rate = Number(adapter.get("Sales Person", String(d['salesperson']))?.['commission_rate'] ?? 0);
  return adapter.list("Sales Invoice").filter(i => Number(i.docstatus) === 1 && i['company'] === d['company'] && String(i['posting_date']).slice(0, 7) === d['period'] && rows(i['sales_team']).some(t => t['sales_person'] === d['salesperson'])).map(i => ({ sales_invoice: i.name, basis: Number(i['base_net_total'] ?? i['net_total'] ?? 0), rate, amount: money(Number(i['base_net_total'] ?? i['net_total'] ?? 0) * rate / 100) }));
}
registerDocHook(STATEMENT, (doc, before) => {
  if (before?.['journal_entry']) return { doc, errors: ["Posted statement is read-only / كشف مرحّل للقراءة فقط"] };
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(doc["period"]))) return { doc, errors: ["Period must be YYYY-MM / الفترة سنة-شهر"] };
  const lines = commissionLines(doc);
  return { doc: { ...doc, lines, total: money(lines.reduce((s, l) => s + l.amount, 0)) } };
});
export function postCommission(name: string, user = currentUser()) {
  if (isServerHosted()) throw new Error("Use digit_crm.commission.post_commission on the server / استخدم واجهة الترحيل على الخادم");
  const d = adapter.get(STATEMENT, name);
  if (!d) throw new Error("Statement not found / الكشف غير موجود");
  const meta = cachedMeta(STATEMENT); if (!meta) throw new Error("Missing statement metadata");
  assertPerm(meta, "write", d, user);
  if (d['journal_entry']) return { journal_entry: String(d['journal_entry']), message: "موجود مسبقاً" };
  const settings = adapter.get(SETTINGS, SETTINGS);
  const expense = String(settings?.['commission_expense'] ?? ""), payable = String(settings?.['commission_payable'] ?? "");
  if (!expense || !payable) throw new Error("Set commission expense and payable accounts in DIGIT CRM Settings / حدد حساب مصروف العمولات وحساب العمولات المستحقة في إعدادات ديجيت CRM");
  for (const account of [expense, payable]) {
    const a = adapter.get("Account", account);
    if (!a || a["company"] !== d["company"] || Number(a["is_group"]) || a["account_type"] === "Payable" || a["account_type"] === "Receivable") throw new Error("Select non-party ledger accounts of the statement company / اختر حسابات أستاذ غير مرتبطة بطرف لشركة الكشف");
  }
  if (expense === payable) throw new Error("Commission accounts must differ / يجب اختلاف حسابي العمولة");
  const lines = commissionLines(d), total = money(lines.reduce((s, l) => s + l.amount, 0));
  if (!(total > 0)) throw new Error("No positive commission / لا توجد عمولة موجبة");
  const jeMeta = cachedMeta("Journal Entry"); if (!jeMeta) throw new Error("Missing Journal Entry metadata");
  assertPerm(jeMeta, "create", undefined, user); assertPerm(jeMeta, "submit", undefined, user);
  return adapter.batch(() => {
    const jeName = `CRM-COMMISSION-${name}`;
    const je = adapter.get("Journal Entry", jeName) ?? adapter.insertDoc("Journal Entry", { name: jeName, company: d['company'], posting_date: `${d['period']}-01`, voucher_type: "Journal Entry", accounts: [{ account: expense, debit: total, debit_in_account_currency: total, credit: 0, credit_in_account_currency: 0 }, { account: payable, credit: total, credit_in_account_currency: total, debit: 0, debit_in_account_currency: 0 }], total_debit: total, total_credit: total, docstatus: 0 });
    if (Number(je.docstatus) !== 1) { const errors = submit("Journal Entry", je.name); if (errors.length) throw new Error(errors.join("\n")); }
    adapter.update(STATEMENT, name, { lines, total, journal_entry: je.name });
    return { journal_entry: je.name, message: "Posted / تم الترحيل" };
  });
}
