/**
 * Calculation profiles — client-side controller code ported from source (cited per profile in form_rules.json).
 * Pure functions over a document: (doc, rule) => patched doc. No server call; values that the source fetches
 * from the server (exchange rates, holiday lists, tax templates) are taken from the record / adapter as stored.
 */
import { adapter, type Doc } from "./adapter";
import { arabicMoneyInWords } from "./arabicWords";

export interface CalcRule { kind: "calc"; profile: string; items?: string; child?: string; has_rounding?: number; has_in_words?: number; src: string }

const n = (v: unknown) => (typeof v === "number" ? v : Number(v) || 0);
/** frappe flt(value, precision) — round half away from zero (frappe/public/js/frappe/utils/number_format.js). */
export const flt = (v: unknown, p = 2) => {
  // System Settings rounding_method default "Banker's Rounding": exact halves round to the even neighbour.
  const x = n(v); const m = 10 ** p; const y = x * m; const f = Math.floor(y); const d = y - f;
  const r = Math.abs(d - 0.5) < 1e-8 ? (f % 2 === 0 ? f : f + 1) : Math.round(y);
  return r / m;
};
/** Rate an Item Tax Template sets for one tax account on a row (item_tax_rate JSON), or null when it sets none. */
function taxRateOf(row: Doc, account: string): number | null {
  const raw = row["item_tax_rate"]; if (!raw || !account) return null;
  try { const m = (typeof raw === "string" ? JSON.parse(raw) : raw) as Record<string, unknown>; return account in m ? Number(m[account]) || 0 : null; } catch { return null; }
}
const rows = (d: Doc, f?: string) => (f && Array.isArray(d[f]) ? (d[f] as Doc[]) : []);

// ---- frappe/utils/data.py money_in_words + in_words (num2words "en", .title()) ----
const ONES = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
function below1000(x: number): string {
  const h = Math.floor(x / 100), r = x % 100;
  const t = r < 20 ? ONES[r]! : TENS[Math.floor(r / 10)]! + (r % 10 ? "-" + ONES[r % 10] : "");
  return h ? ONES[h] + " hundred" + (r ? " and " + t : "") : t;
}
export function inWords(x: number): string {
  x = Math.floor(Math.abs(x));
  if (x === 0) return "zero";
  const parts: string[] = [];
  for (const [v, w] of [[1e12, "trillion"], [1e9, "billion"], [1e6, "million"], [1e3, "thousand"]] as const) {
    if (x >= v) { parts.push(below1000(Math.floor(x / v)) + " " + w); x %= v; }
  }
  if (x) parts.push((parts.length && x < 100 ? "and " : "") + below1000(x));
  // num2words "en": groups separated by ", " ("one thousand, two hundred and five"); frappe in_words replaces "-" with " "
  return parts.map((x, i) => (i === 0 ? x : x.startsWith("and ") ? " " + x : ", " + x)).join("").replace(/-/g, " ");
}
const title = (s: string) => s.replace(/\b[a-z]/g, (c) => c.toUpperCase());
export function moneyInWords(amount: number, currency = "SAR"): string {
  // Frappe money_in_words follows the user's language; AR uses ريال / هللة grammar (src/lib/arabicWords.ts).
  if (currency === "SAR" && typeof window !== "undefined" && localStorage.getItem("digit-virtual-core:lang") !== "en") return arabicMoneyInWords(amount);
  const cur = adapter.get("Currency", currency);
  const fraction = String(cur?.["fraction"] || (currency === "SAR" ? "Halala" : "Cent"));
  const units = n(cur?.["fraction_units"]) || 100;
  const main = Math.floor(Math.abs(amount)); const frac = Math.round((Math.abs(amount) - main) * units);
  if (!main && !frac) return currency + " Zero only.";
  let out = main ? currency + " " + title(inWords(main)) : "";
  if (frac) out += (out ? " and " : "") + title(inWords(frac)) + " " + fraction;
  return out + " only.";
}

// ---- erpnext/public/js/controllers/taxes_and_totals.js (calculate_taxes_and_totals) ----
function transactionTotals(d: Doc, r: CalcRule): Doc {
  const conv = n(d["conversion_rate"]) || 1;
  const items = rows(d, r.items).map((it) => {
    const x = { ...it };
    if (n(x["price_list_rate"]) && x["margin_type"] !== "Amount") {
      // apply_pricing_rule_on_item: rate = price_list_rate * (1 - discount_percentage/100)
      if (n(x["discount_percentage"])) x["rate"] = flt(n(x["price_list_rate"]) * (1 - n(x["discount_percentage"]) / 100), 2);
      x["discount_amount"] = flt(n(x["price_list_rate"]) - n(x["rate"]), 2);
    }
    x["amount"] = flt(n(x["qty"]) * n(x["rate"]), 2);
    x["net_rate"] = n(x["rate"]); x["net_amount"] = x["amount"];
    x["base_rate"] = flt(n(x["rate"]) * conv); x["base_amount"] = flt(n(x["amount"]) * conv);
    x["base_net_rate"] = x["base_rate"]; x["base_net_amount"] = x["base_amount"];
    if ("stock_qty" in x || "conversion_factor" in x) x["stock_qty"] = flt(n(x["qty"]) * (n(x["conversion_factor"]) || 1), 3);
    return x;
  });
  const out: Doc = { ...d, [r.items!]: items };
  out["total_qty"] = items.reduce((s, x) => s + n(x["qty"]), 0);
  out["total"] = flt(items.reduce((s, x) => s + n(x["amount"]), 0)); out["base_total"] = flt(n(out["total"]) * conv);
  out["net_total"] = out["total"]; out["base_net_total"] = out["base_total"];
  // apply_discount_amount: additional_discount_percentage on Grand Total (default) or Net Total
  const on = String(d["apply_discount_on"] || "Grand Total");
  const pct = n(d["additional_discount_percentage"]);
  // calculate_taxes: charge_type On Net Total / Actual / On Previous Row Amount / On Previous Row Total
  const taxBase = (net: number) => {
    let cum = net; const taxes: Doc[] = [];
    for (const t of rows(d, "taxes")) {
      const x = { ...t }; const ct = String(x["charge_type"] || "");
      let amt = n(x["tax_amount"]);
      if (ct === "On Net Total") {
        // item_tax_rate (Item Tax Template on the row): that item's own rate for this tax account, as calculate_taxes does
        const own = items.some((it) => taxRateOf(it, String(x["account_head"] ?? "")) !== null);
        if (!own) amt = flt((n(x["rate"]) * net) / 100);
        else { const tot = n(out["total"]) || 1; amt = flt((items.reduce((sum, it) => sum + n(it["net_amount"]) * (taxRateOf(it, String(x["account_head"] ?? "")) ?? n(x["rate"])), 0) / 100) * (net / tot)); }
      }
      else if (ct === "On Previous Row Amount") { const p = taxes[n(x["row_id"]) - 1]; amt = flt((n(x["rate"]) * n(p?.["tax_amount"])) / 100); }
      else if (ct === "On Previous Row Total") { const p = taxes[n(x["row_id"]) - 1]; amt = flt((n(x["rate"]) * n(p?.["total"])) / 100); }
      if (x["add_deduct_tax"] === "Deduct") amt = -amt;
      x["tax_amount"] = Math.abs(amt); x["tax_amount_after_discount_amount"] = Math.abs(amt); x["base_tax_amount"] = flt(Math.abs(amt) * conv);
      cum = flt(cum + amt); x["total"] = cum; x["base_total"] = flt(cum * conv);
      taxes.push(x);
    }
    return { taxes, cum };
  };
  let net = n(out["net_total"]);
  if (pct && on === "Net Total") { out["discount_amount"] = flt((net * pct) / 100); net = flt(net - n(out["discount_amount"])); out["net_total"] = net; out["base_net_total"] = flt(net * conv); }
  let { taxes, cum } = taxBase(net);
  if (rows(d, "taxes").length || "taxes" in d) out["taxes"] = taxes;
  out["total_taxes_and_charges"] = flt(cum - net); out["base_total_taxes_and_charges"] = flt(n(out["total_taxes_and_charges"]) * conv);
  let grand = cum;
  if (on === "Grand Total") {
    const disc = pct ? flt((grand * pct) / 100) : n(d["discount_amount"]);
    if (pct) out["discount_amount"] = disc;
    grand = flt(grand - disc);
  } else if (!pct && n(d["discount_amount"])) { grand = flt(grand - n(d["discount_amount"])); }
  out["grand_total"] = grand; out["base_grand_total"] = flt(grand * conv);
  // set_rounded_total (round_based_on_smallest_currency_fraction with whole-unit rounding)
  if (r.has_rounding) {
    if (n(d["disable_rounded_total"])) { out["rounded_total"] = 0; out["rounding_adjustment"] = 0; }
    else { out["rounded_total"] = flt(grand, 0); out["rounding_adjustment"] = flt(n(out["rounded_total"]) - grand); }
    out["base_rounded_total"] = flt(n(out["rounded_total"]) * conv); out["base_rounding_adjustment"] = flt(n(out["rounding_adjustment"]) * conv);
  }
  const payable = r.has_rounding && n(out["rounded_total"]) ? n(out["rounded_total"]) : grand;
  if (r.has_in_words) { out["in_words"] = moneyInWords(payable, String(d["currency"] || "SAR")); out["base_in_words"] = moneyInWords(flt(payable * conv), String(d["company_currency"] || d["currency"] || "SAR")); }
  // calculate_outstanding_amount (invoices, draft only)
  if ("outstanding_amount" in d && (d["docstatus"] ?? 0) === 0 && /Invoice$/.test(String(d["doctype"]))) {
    out["outstanding_amount"] = flt(payable - n(d["total_advance"]) - n(d["write_off_amount"]) - (n(d["is_pos"]) || n(d["is_paid"]) ? n(d["paid_amount"]) : 0));
  }
  return out;
}

// ---- payment_entry.js allocate_party_amount_against_ref_docs + set_unallocated_amount + set_difference_amount ----
function paymentAllocation(d: Doc): Doc {
  const paid = n(d["paid_amount"]);
  let left = paid;
  const refs = rows(d, "references").map((x) => {
    const y = { ...x };
    if (d["__allocate"] !== 0) { const a = Math.min(n(y["outstanding_amount"]), Math.max(left, 0)); y["allocated_amount"] = flt(a); left = flt(left - a); }
    return y;
  });
  const out: Doc = { ...d, references: refs };
  out["total_allocated_amount"] = flt(refs.reduce((s, x) => s + n(x["allocated_amount"]), 0));
  out["base_total_allocated_amount"] = flt(n(out["total_allocated_amount"]) * (n(d["source_exchange_rate"]) || 1));
  const ded = rows(d, "deductions").reduce((s, x) => s + n(x["amount"]), 0);
  out["unallocated_amount"] = flt(paid - n(out["total_allocated_amount"]) - ded > 0 ? paid - n(out["total_allocated_amount"]) - ded : 0);
  if (!d["paid_to_account_currency"] || d["paid_to_account_currency"] === d["paid_from_account_currency"]) out["received_amount"] = paid;
  out["base_paid_amount"] = flt(paid * (n(d["source_exchange_rate"]) || 1));
  out["difference_amount"] = flt(n(out["base_paid_amount"]) - n(out["base_total_allocated_amount"]) - n(out["unallocated_amount"]) - ded);
  out["in_words"] = moneyInWords(paid, String(d["paid_from_account_currency"] || "SAR"));
  return out;
}

// ---- journal_entry.js update_totals ----
function journalBalance(d: Doc): Doc {
  const acc = rows(d, "accounts").map((x) => ({ ...x, debit: flt(n(x["debit_in_account_currency"]) * (n(x["exchange_rate"]) || 1)), credit: flt(n(x["credit_in_account_currency"]) * (n(x["exchange_rate"]) || 1)) }));
  const td = flt(acc.reduce((s, x) => s + n(x["debit"]), 0)), tc = flt(acc.reduce((s, x) => s + n(x["credit"]), 0));
  return { ...d, accounts: acc, total_debit: td, total_credit: tc, difference: flt(td - tc), total_amount: Math.max(td, tc), total_amount_in_words: moneyInWords(Math.max(td, tc)) };
}

// ---- stock_entry.js calculate_basic_amount / calculate_amount / set_total_amount ----
function stockEntryTotals(d: Doc, r: CalcRule): Doc {
  const items = rows(d, r.items).map((x) => {
    const y = { ...x };
    y["transfer_qty"] = flt(n(y["qty"]) * (n(y["conversion_factor"]) || 1), 3);
    y["basic_amount"] = flt(n(y["transfer_qty"]) * n(y["basic_rate"]));
    y["amount"] = flt(n(y["basic_amount"]) + n(y["additional_cost"]));
    y["valuation_rate"] = n(y["transfer_qty"]) ? flt(n(y["amount"]) / n(y["transfer_qty"])) : 0;
    return y;
  });
  const out = { ...d, [r.items!]: items } as Doc;
  out["total_outgoing_value"] = flt(items.filter((x) => x["s_warehouse"]).reduce((s, x) => s + n(x["amount"]), 0));
  out["total_incoming_value"] = flt(items.filter((x) => x["t_warehouse"]).reduce((s, x) => s + n(x["amount"]), 0));
  out["value_difference"] = flt(n(out["total_incoming_value"]) - n(out["total_outgoing_value"]));
  out["total_additional_costs"] = flt(rows(d, "additional_costs").reduce((s, x) => s + n(x["amount"]), 0));
  out["total_amount"] = flt(items.reduce((s, x) => s + n(x["amount"]), 0));
  return out;
}

// ---- leave_application.js calculate_total_days / get_leave_balance (server get_number_of_leave_days ported over adapter) ----
const day = (s: unknown) => (s ? new Date(String(s) + "T00:00:00Z").getTime() : NaN);
export function leaveDays(d: Doc): number {
  const a = day(d["from_date"]), b = day(d["to_date"]);
  if (isNaN(a) || isNaN(b) || b < a) return 0;
  let days = Math.round((b - a) / 864e5) + 1;
  const hl = d["employee"] ? String(adapter.get("Employee", String(d["employee"]))?.["holiday_list"] || "") : "";
  const lt = d["leave_type"] ? adapter.get("Leave Type", String(d["leave_type"])) : undefined;
  if (hl && !n(lt?.["include_holiday"])) {
    const hols = (adapter.get("Holiday List", hl)?.["holidays"] as Doc[] | undefined) ?? [];
    days -= hols.filter((h) => { const t = day(h["holiday_date"]); return t >= a && t <= b; }).length;
  }
  if (n(d["half_day"])) days -= 0.5;
  return Math.max(days, 0);
}
export function leaveBalance(d: Doc): number {
  if (!d["employee"] || !d["leave_type"]) return 0;
  const on = String(d["from_date"] || new Date().toISOString().slice(0, 10));
  const alloc = adapter.list("Leave Allocation").filter((x) => x["employee"] === d["employee"] && x["leave_type"] === d["leave_type"] && x.docstatus === 1 && String(x["from_date"]) <= on && String(x["to_date"]) >= on);
  const total = alloc.reduce((s, x) => s + n(x["total_leaves_allocated"] ?? x["new_leaves_allocated"]), 0);
  const taken = adapter.list("Leave Application").filter((x) => x.name !== d.name && x["employee"] === d["employee"] && x["leave_type"] === d["leave_type"] && x.docstatus === 1 && x["status"] === "Approved" && alloc.some((al) => String(x["from_date"]) >= String(al["from_date"]) && String(x["to_date"]) <= String(al["to_date"])))
    .reduce((s, x) => s + n(x["total_leave_days"]), 0);
  return flt(total - taken, 3);
}
function leave(d: Doc): Doc { return { ...d, total_leave_days: leaveDays(d), leave_balance: leaveBalance(d) }; }

// ---- salary_slip.js set_totals / calculate_net_pay ----
function salary(d: Doc): Doc {
  const ex = n(d["exchange_rate"]) || 1;
  const sum = (f: string) => flt(rows(d, f).filter((x) => !n(x["statistical_component"]) && !n(x["do_not_include_in_total"])).reduce((s, x) => s + n(x["amount"]), 0));
  const gross = sum("earnings"), ded = sum("deductions"), net = flt(gross - ded);
  const rt = flt(net, 0);
  return { ...d, gross_pay: gross, base_gross_pay: flt(gross * ex), total_deduction: ded, base_total_deduction: flt(ded * ex), net_pay: net, base_net_pay: flt(net * ex), rounded_total: rt, base_rounded_total: flt(rt * ex), total_in_words: moneyInWords(rt, String(d["currency"] || "SAR")), base_total_in_words: moneyInWords(flt(rt * ex)) };
}

// ---- hrms employee.js date_of_birth → date_of_retirement (HR Settings retirement_age, default 60) ----
function retirement(d: Doc): Doc {
  if (!d["date_of_birth"]) return d;
  const age = n(adapter.get("HR Settings", "HR Settings")?.["retirement_age"]) || 60;
  const dob = new Date(String(d["date_of_birth"]) + "T00:00:00Z"); dob.setUTCFullYear(dob.getUTCFullYear() + age);
  return { ...d, date_of_retirement: dob.toISOString().slice(0, 10) };
}

export function runCalc(d: Doc, r: CalcRule): Doc {
  switch (r.profile) {
    case "transaction_totals": return transactionTotals(d, r);
    case "payment_allocation": return paymentAllocation(d);
    case "journal_balance": return journalBalance(d);
    case "stock_entry_totals": return stockEntryTotals(d, r);
    case "leave_days": return leave(d);
    case "salary_totals": return salary(d);
    case "employee_retirement": return retirement(d);
  }
  return d;
}

/** Validations ported from controller validate() (local port; labelled as such in the UI). */
export function calcValidate(d: Doc, r: CalcRule): string[] {
  const e: string[] = [];
  if (r.profile === "journal_balance" && rows(d, "accounts").length && Math.abs(n(d["difference"])) > 0.005)
    e.push(`Total Debit must be equal to Total Credit. The difference is ${flt(n(d["difference"]))}`);
  if (r.profile === "leave_days" && d["employee"] && d["leave_type"] && d["status"] !== "Rejected") {
    const lt = adapter.get("Leave Type", String(d["leave_type"]));
    if (!n(lt?.["is_lwp"]) && !n(lt?.["allow_negative"]) && n(d["total_leave_days"]) > n(d["leave_balance"]))
      e.push(`Insufficient leave balance for Leave Type ${d["leave_type"]}`);
    if (day(d["to_date"]) < day(d["from_date"])) e.push("To date cannot be before from date");
  }
  if (r.profile === "payment_allocation" && n(d["total_allocated_amount"]) > n(d["paid_amount"]) + 0.005) e.push("Total Allocated Amount cannot be greater than Paid Amount");
  return e;
}
