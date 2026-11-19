/**
 * Deferred Revenue / Expense — port of erpnext/accounts/deferred_revenue.py (book_deferred_income_or_expense,
 * calculate_monthly_amount, calculate_amount, get_booking_dates, get_already_booked_amount) and
 * process_deferred_accounting.py (on_submit / on_cancel). Invoice rows with enable_deferred_* post to the deferred
 * account (posting.ts glLines); recognitions are stored on the submitted Process Deferred Accounting document and
 * posted through posting.ts — directly as its GL lines, or as Journal Entries when Accounts Settings
 * book_deferred_entries_via_journal_entry is on. Scheduler (automatically_process_deferred_accounting_entry) is a
 * Frappe server job: here it runs only through processDue() when called.
 */
import { adapter, registerDocHook, type Doc } from "./adapter";
import { resolveName } from "./rename";
import { rowDims } from "./dimensions";
import * as P from "./posting";

const n = (v: unknown) => Number(v) || 0;
const r2 = (x: number) => Math.round((x + Number.EPSILON) * 100) / 100;
const rows = (d: Doc, f: string) => ((d[f] as Record<string, unknown>[] | undefined) ?? []);
const D = (s: string) => new Date(`${s}T00:00:00Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (s: string, k: number) => { const d = D(s); d.setUTCDate(d.getUTCDate() + k); return iso(d); };
/** frappe.utils.date_diff (b - a in days, end exclusive). */
export const dateDiff = (b: string, a: string) => Math.round((D(b).getTime() - D(a).getTime()) / 86400000);
export const firstDay = (s: string) => `${s.slice(0, 7)}-01`;
export const lastDay = (s: string) => { const d = D(firstDay(s)); d.setUTCMonth(d.getUTCMonth() + 1); d.setUTCDate(0); return iso(d); };
const rounded1 = (x: number) => Math.round(x * 10) / 10;

export interface Recognition { invoice_type: string; invoice: string; row: string; item_code: string; from: string; to: string; posting_date: string; amount: number; debit_account: string; credit_account: string; dims: Record<string, string> }
export const settings = () => adapter.get("Accounts Settings", "Accounts Settings") ?? {} as Doc;
const basedOn = () => String(settings()["book_deferred_entries_based_on"] || "Days");

export const isDeferred = (dt: string, x: Record<string, unknown>) => dt === "Sales Invoice" ? !!n(x["enable_deferred_revenue"]) : dt === "Purchase Invoice" ? !!n(x["enable_deferred_expense"]) : false;
export const deferredAccount = (dt: string, x: Record<string, unknown>) => String(x[dt === "Sales Invoice" ? "deferred_revenue_account" : "deferred_expense_account"] ?? "");
const finalAccount = (dt: string, x: Record<string, unknown>) => String(x[dt === "Sales Invoice" ? "income_account" : "expense_account"] ?? "");
const svcEnd = (x: Record<string, unknown>) => String(x["service_stop_date"] || x["service_end_date"] || "");
/** Row amount in company currency (base_net_amount, else net_amount/amount). Returns are negative. */
const rowAmount = (d: Doc, x: Record<string, unknown>) => r2(n(x["base_net_amount"] ?? x["net_amount"] ?? x["amount"]) * (n(d["is_return"]) && n(x["amount"]) > 0 ? -1 : 1));

/** Validation on invoice submit (deferred_revenue.py validate_service_stop_date + accounts_controller validate_deferred_*). */
export function deferredErrors(dt: string, d: Doc): string[] {
  if (dt !== "Sales Invoice" && dt !== "Purchase Invoice") return [];
  const e: string[] = [];
  for (const x of rows(d, "items")) {
    if (!isDeferred(dt, x)) continue; const i = x["idx"] ?? 1; const s = String(x["service_start_date"] ?? ""), en = String(x["service_end_date"] ?? "");
    if (!s || !en) e.push(`Row #${i}: Service Start and End Date is required for deferred accounting`);
    else if (s > en) e.push(`Row #${i}: Service Start Date cannot be greater than Service End Date`);
    const stop = String(x["service_stop_date"] ?? "");
    if (stop && (stop < s || stop > en)) e.push(`Row #${i}: Service Stop Date must be between Service Start Date and Service End Date`);
    const acc = adapter.get("Account", resolveName("Account", deferredAccount(dt, x)));
    if (!acc) e.push(`Row #${i}: ${dt === "Sales Invoice" ? "Deferred Revenue" : "Deferred Expense"} Account is mandatory`);
    else if (n(acc["is_group"]) || (acc["company"] && resolveName("Company", String(acc["company"])) !== resolveName("Company", String(d["company"])))) e.push(`Row #${i}: Account ${acc.name} must be a ledger account of Company ${d["company"]}`);
    const it = adapter.get("Item", String(x["item_code"] ?? "")); if (dt === "Purchase Invoice" && it && n(it["is_stock_item"])) e.push(`Row #${i}: Deferred Expense cannot be booked for stock item ${x["item_code"]}`);
  }
  return e;
}

/** Already recognized per invoice row from submitted Process Deferred Accounting documents (get_already_booked_amount). */
export function booked(invoice: string, row: string): { amount: number; last: string } {
  let amount = 0, last = "";
  for (const p of adapter.list("Process Deferred Accounting")) if (n(p["docstatus"]) === 1) for (const r of rows(p, "entries")) if (r["invoice"] === invoice && r["row"] === row) { amount = r2(amount + n(r["amount"])); if (String(r["to"]) > last) last = String(r["to"]); }
  return { amount, last };
}

/** One booking period's amount (calculate_monthly_amount / calculate_amount). Final period takes the remainder. */
function periodAmount(total: number, x: Record<string, unknown>, from: string, to: string, already: number): number {
  const s = String(x["service_start_date"]), e = String(x["service_end_date"]), end = svcEnd(x);
  if (to >= end) return r2(total - already);
  let a: number;
  if (basedOn() === "Months") {
    const months = (D(e).getUTCFullYear() - D(s).getUTCFullYear()) * 12 + (D(e).getUTCMonth() - D(s).getUTCMonth()) + 1;
    const prorate = dateDiff(e, s) / dateDiff(lastDay(e), firstDay(s));
    const actual = rounded1(months * prorate) || 1;
    a = r2(total / actual);
    if (!(firstDay(from) === from && lastDay(to) === to)) a = r2(rounded1(dateDiff(to, from) / dateDiff(lastDay(to), firstDay(from))) * a);
  } else {
    const totalDays = dateDiff(e, s) + 1; a = r2(total * (dateDiff(to, from) + 1) / totalDays);
  }
  // never exceed the remaining amount (sign-aware for returns)
  const rem = r2(total - already); if (Math.abs(a) > Math.abs(rem)) a = rem;
  return a;
}

/** Recognitions due up to `till` for eligible submitted invoice rows (book_deferred_income_or_expense). */
export function dueRecognitions(type: "Income" | "Expense", company: string, till: string, account?: string, start?: string): Recognition[] {
  const dt = type === "Income" ? "Sales Invoice" : "Purchase Invoice"; const out: Recognition[] = [];
  for (const d of adapter.list(dt)) {
    if (n(d["docstatus"]) !== 1 || resolveName("Company", String(d["company"])) !== resolveName("Company", company)) continue;
    for (const x of rows(d, "items")) {
      if (!isDeferred(dt, x) || !x["service_start_date"] || !x["service_end_date"]) continue;
      const def = resolveName("Account", deferredAccount(dt, x)); if (account && def !== resolveName("Account", account)) continue;
      const fin = resolveName("Account", finalAccount(dt, x)); const total = rowAmount(d, x); const end = svcEnd(x);
      const rowName = String(x["name"] ?? `${d.name}-${x["idx"] ?? 1}`);
      let { amount: already, last } = booked(d.name, rowName);
      let from = last ? addDays(last, 1) : String(x["service_start_date"]);
      if (start && from < start && !last) from = String(x["service_start_date"]);
      while (from <= end && Math.abs(r2(total - already)) >= 0.005) {
        const to = [lastDay(from), end].sort()[0]!;
        if (to > till) break; // only completed periods up to the processing end date
        const amt = periodAmount(total, x, from, to, already); if (!amt) break;
        out.push({ invoice_type: dt, invoice: d.name, row: rowName, item_code: String(x["item_code"] ?? ""), from, to, posting_date: to, amount: amt,
          debit_account: type === "Income" ? def : fin, credit_account: type === "Income" ? fin : def, dims: rowDims(x, d) });
        already = r2(already + amt); from = addDays(to, 1);
      }
    }
  }
  return out;
}

/** Remaining deferred balance per invoice row (Deferred Revenue and Expense report). */
export function schedule(dt: string, invoice: string) {
  const d = adapter.get(dt, invoice); if (!d) return [];
  return rows(d, "items").filter((x) => isDeferred(dt, x)).map((x) => { const row = String(x["name"] ?? `${d.name}-${x["idx"] ?? 1}`); const total = rowAmount(d, x); const b = booked(d.name, row); return { row, item_code: x["item_code"], total, recognized: b.amount, remaining: r2(total - b.amount), last: b.last }; });
}

// ---- Process Deferred Accounting controller ----
registerDocHook("Process Deferred Accounting", (doc, before) => {
  const errors: string[] = [];
  const from = n(before?.["docstatus"]), to = n(doc["docstatus"]);
  if (to === 0 || to === 1) {
    if (!doc["type"]) errors.push("Type is mandatory");
    if (doc["start_date"] && doc["end_date"] && String(doc["start_date"]) > String(doc["end_date"])) errors.push("Start Date cannot be after End Date");
  }
  if (from === 0 && to === 1 && !errors.length) {
    const till = String(doc["end_date"] || doc["posting_date"] || new Date().toISOString().slice(0, 10));
    const entries = dueRecognitions(doc["type"] === "Expense" ? "Expense" : "Income", String(doc["company"] ?? ""), till, doc["account"] ? String(doc["account"]) : undefined, doc["start_date"] ? String(doc["start_date"]) : undefined);
    const viaJe = !!n(settings()["book_deferred_entries_via_journal_entry"]);
    return { doc: { ...doc, entries: entries.map((e, i) => ({ idx: i + 1, ...e })), via_journal_entry: viaJe ? 1 : 0 }, errors, after: (d) => { if (viaJe) makeJournals(d); } };
  }
  if (from === 1 && to === 2) return { doc, errors, after: (d) => { cancelJournals(d); } };
  return { doc, errors };
});

function makeJournals(p: Doc) {
  const submitJe = !!n(settings()["submit_journal_entries"]);
  rows(p, "entries").forEach((e, i) => {
    const name = `${p.name}-JV-${i + 1}`; if (adapter.get("Journal Entry", name)) return;
    const dims = (e["dims"] ?? {}) as Record<string, string>; const amt = Math.abs(n(e["amount"])); const neg = n(e["amount"]) < 0;
    const dr = String(neg ? e["credit_account"] : e["debit_account"]), cr = String(neg ? e["debit_account"] : e["credit_account"]);
    adapter.insertDoc("Journal Entry", { name, voucher_type: p["type"] === "Expense" ? "Deferred Expense" : "Deferred Revenue", company: p["company"], posting_date: e["posting_date"], process_deferred_accounting: p.name,
      user_remark: `Deferred accounting for ${e["invoice"]} row ${e["row"]}`, docstatus: 0,
      accounts: [{ idx: 1, account: dr, ...dims, debit: amt, debit_in_account_currency: amt, reference_type: e["invoice_type"], reference_name: e["invoice"], reference_detail_no: e["row"] },
        { idx: 2, account: cr, ...dims, credit: amt, credit_in_account_currency: amt, reference_type: e["invoice_type"], reference_name: e["invoice"], reference_detail_no: e["row"] }] });
    if (submitJe) P.submit("Journal Entry", name);
  });
}
function cancelJournals(p: Doc) {
  for (const j of adapter.list("Journal Entry")) if (j["process_deferred_accounting"] === p.name) { if (n(j["docstatus"]) === 1) P.cancel("Journal Entry", j.name); else if (n(j["docstatus"]) === 0) adapter.remove("Journal Entry", j.name); }
}

/** Scheduler equivalent (process_deferred_accounting.py build_conditions / scheduler job): one PDA per type up to `till`. */
export function processDue(company: string, till: string): string[] {
  const made: string[] = [];
  for (const type of ["Income", "Expense"] as const) {
    if (!dueRecognitions(type, company, till).length) continue;
    const name = `PDA-${type}-${till}-${adapter.list("Process Deferred Accounting").length + 1}`;
    adapter.insertDoc("Process Deferred Accounting", { name, company, type, posting_date: till, start_date: firstDay(till), end_date: till, docstatus: 0 });
    if (!P.submit("Process Deferred Accounting", name).length) made.push(name);
  }
  return made;
}
