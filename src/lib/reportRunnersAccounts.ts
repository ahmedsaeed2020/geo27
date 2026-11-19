/**
 * Local ports of the accounts Script Reports DIGIT links to that had no runner (erpnext/accounts/report/<name>/<name>.py).
 * Same fieldnames as the source .js filters; columns follow the source get_columns(); data = adapter records.
 */
import { adapter, type Doc } from "./adapter";
import { C0, FROM, TO, S, account, between, col, companyCurrency, cur, daysBetween, eqOpt, fiscalYear, fl, flt, glOf, inMs, ms, n, partyAccounts, partyName, paymentLedger, periods, r2, rows, sub, submitted, today, totalRow, withGroupTotals, type F, type RResult, type Row, type Runner } from "./reportKit";

const co = (f: F) => f["company"] || "";
const range = (f: F, a = "from_date", b = "to_date") => { const y = fiscalYear(f["fiscal_year"]); return { from: f[a] || y.start, to: f[b] || y.end }; };
const isGroup = (acc: string) => n(account(acc)?.["is_group"]) === 1;

/** account_balance.py: balance on report_date per account, filtered by root/account type. */
const accountBalance: Runner = {
  src: "erpnext/accounts/report/account_balance/account_balance.py",
  filters: [C0, fl("report_date", "Date", "Date", undefined, "__today"), fl("root_type", "Root Type", "Select", ["", "Asset", "Liability", "Income", "Expense", "Equity"]), fl("account_type", "Account Type", "Select")],
  run: (f) => {
    const date = f["report_date"] || today(); const g = glOf(co(f)).filter((x) => S(x["posting_date"]) <= date);
    const bal = new Map<string, number>(); for (const x of g) bal.set(S(x["account"]), (bal.get(S(x["account"])) ?? 0) + n(x["debit"]) - n(x["credit"]));
    const list = adapter.list("Account").filter((a) => (!co(f) || a["company"] === co(f)) && !n(a["is_group"]) && eqOpt(a["root_type"], f["root_type"]) && eqOpt(a["account_type"], f["account_type"]))
      .map((a) => ({ account: a.name, currency: S(a["account_currency"]) || companyCurrency(S(a["company"])), balance: r2(bal.get(a.name) ?? 0) })).filter((r) => r.balance !== 0 || f["account_type"]);
    return { columns: [col("account", "Account", "Link", "Account", 200), col("currency", "Currency", "Link", "Currency", 70), cur("balance", "Balance")], rows: list };
  },
};

/** bank_clearance_summary.py: payments and journals posted against a bank account with their clearance date. */
const bankClearanceSummary: Runner = {
  src: "erpnext/accounts/report/bank_clearance_summary/bank_clearance_summary.py",
  filters: [FROM, TO, fl("account", "Bank Account", "Link", "Account")],
  run: (f) => {
    if (!f["account"]) return { columns: [], rows: [], error: "Please select Bank Account" };
    const { from, to } = range(f); const out: Row[] = [];
    for (const d of adapter.list("Payment Entry")) if (sub(d) && between(d["posting_date"], from, to) && (d["paid_from"] === f["account"] || d["paid_to"] === f["account"]))
      out.push({ payment_document_type: "Payment Entry", payment_entry: d.name, posting_date: d["posting_date"], cheque_no: d["reference_no"] ?? "", amount: n(d["paid_from"] === f["account"] ? d["paid_amount"] : d["received_amount"] ?? d["paid_amount"]), against: d["party"] ?? "", clearance_date: d["clearance_date"] ?? "" });
    for (const d of adapter.list("Journal Entry")) if (sub(d) && between(d["posting_date"], from, to)) for (const a of rows(d, "accounts")) if (a["account"] === f["account"])
      out.push({ payment_document_type: "Journal Entry", payment_entry: d.name, posting_date: d["posting_date"], cheque_no: d["cheque_no"] ?? "", amount: r2(n(a["debit_in_account_currency"] ?? a["debit"]) - n(a["credit_in_account_currency"] ?? a["credit"])), against: a["against_account"] ?? "", clearance_date: d["clearance_date"] ?? "" });
    out.sort((a, b) => S(a["posting_date"]).localeCompare(S(b["posting_date"])));
    return { columns: [col("payment_document_type", "Payment Document Type", "Link", "DocType", 130), col("payment_entry", "Payment Document", "Dynamic Link", "payment_document_type", 150), col("posting_date", "Posting Date", "Date", undefined, 100), col("cheque_no", "Cheque/Reference No", "Data", undefined, 120), cur("amount", "Amount"), col("against", "Against Account", "Data", undefined, 170), col("clearance_date", "Clearance Date", "Date", undefined, 110)], rows: out };
  },
};

/** bank_reconciliation_statement.py: balance per books, uncleared entries and the calculated bank statement balance. */
const bankReconciliationStatement: Runner = {
  src: "erpnext/accounts/report/bank_reconciliation_statement/bank_reconciliation_statement.py",
  filters: [C0, fl("account", "Bank Account", "Link", "Account"), fl("report_date", "Date", "Date", undefined, "__today"), fl("include_pos_transactions", "Include POS Transactions", "Check")],
  run: (f) => {
    if (!f["account"]) return { columns: [], rows: [], error: "Please select Bank Account" };
    const date = f["report_date"] || today();
    const books = r2(glOf(co(f)).filter((g) => g["account"] === f["account"] && S(g["posting_date"]) <= date).reduce((a, g) => a + n(g["debit"]) - n(g["credit"]), 0));
    const uncleared: Row[] = [];
    for (const d of adapter.list("Payment Entry")) if (sub(d) && (!co(f) || d["company"] === co(f)) && S(d["posting_date"]) <= date && (!d["clearance_date"] || S(d["clearance_date"]) > date) && (d["paid_from"] === f["account"] || d["paid_to"] === f["account"])) {
      const dr = d["paid_to"] === f["account"] ? n(d["received_amount"] ?? d["paid_amount"]) : 0; const cr = d["paid_from"] === f["account"] ? n(d["paid_amount"]) : 0;
      uncleared.push({ posting_date: d["posting_date"], payment_document: "Payment Entry", payment_entry: d.name, debit: dr, credit: cr, against_account: d["party"] ?? "", reference_no: d["reference_no"] ?? "", ref_date: d["reference_date"] ?? "", clearance_date: d["clearance_date"] ?? "", account_currency: companyCurrency(S(d["company"])) });
    }
    for (const d of adapter.list("Journal Entry")) if (sub(d) && (!co(f) || d["company"] === co(f)) && S(d["posting_date"]) <= date && (!d["clearance_date"] || S(d["clearance_date"]) > date)) for (const a of rows(d, "accounts")) if (a["account"] === f["account"])
      uncleared.push({ posting_date: d["posting_date"], payment_document: "Journal Entry", payment_entry: d.name, debit: n(a["debit_in_account_currency"] ?? a["debit"]), credit: n(a["credit_in_account_currency"] ?? a["credit"]), against_account: a["against_account"] ?? "", reference_no: d["cheque_no"] ?? "", ref_date: d["cheque_date"] ?? "", clearance_date: d["clearance_date"] ?? "", account_currency: companyCurrency(S(d["company"])) });
    uncleared.sort((a, b) => S(a["posting_date"]).localeCompare(S(b["posting_date"])));
    const dr = r2(uncleared.reduce((a, r) => a + n(r["debit"]), 0)); const cr = r2(uncleared.reduce((a, r) => a + n(r["credit"]), 0));
    const calc = r2(books - dr + cr);
    const head = (label: string, v: number): Row => ({ payment_entry: label, debit: v > 0 ? v : 0, credit: v < 0 ? -v : 0, bold: true, is_total: true });
    return {
      columns: [col("posting_date", "Posting Date", "Date", undefined, 100), col("payment_document", "Payment Document Type", "Data", undefined, 130), col("payment_entry", "Payment Document", "Dynamic Link", "payment_document", 220), cur("debit", "Debit"), cur("credit", "Credit"), col("against_account", "Against Account", "Data", undefined, 160), col("reference_no", "Reference", "Data", undefined, 100), col("ref_date", "Ref Date", "Date", undefined, 100), col("clearance_date", "Clearance Date", "Date", undefined, 110), col("account_currency", "Currency", "Link", "Currency", 70)],
      rows: [head("Bank Statement balance as per General Ledger", books), ...uncleared, head("Outstanding Cheques and Deposits to clear", dr - cr), head("Calculated Bank Statement balance", calc)],
      summary: [{ label: "Balance as per books", value: books }, { label: "Uncleared", value: r2(dr - cr) }, { label: "Calculated bank statement balance", value: calc }],
    };
  },
};

/** customer_credit_balance.py: credit limit, outstanding and the remaining credit per customer. */
const customerCreditBalance: Runner = {
  src: "erpnext/selling/report/customer_credit_balance/customer_credit_balance.py",
  filters: [C0, fl("customer", "Customer", "Link", "Customer")],
  run: (f) => {
    const out: Row[] = [];
    for (const c of adapter.list("Customer")) {
      if (f["customer"] && c.name !== f["customer"]) continue;
      const lim = rows(c, "credit_limits").find((x) => !co(f) || x["company"] === co(f)); const limit = n(lim?.["credit_limit"] ?? c["credit_limit"]);
      const outstanding = r2(glOf(co(f)).filter((g) => g["party_type"] === "Customer" && g["party"] === c.name).reduce((a, g) => a + n(g["debit"]) - n(g["credit"]), 0));
      if (!limit && !outstanding) continue;
      out.push({ customer: c.name, customer_name: c["customer_name"] ?? c.name, credit_limit: limit, outstanding_amt: outstanding, credit_balance: r2(limit - outstanding), bypass_credit_limit_check: n(lim?.["bypass_credit_limit_check"]) ? "Yes" : "No", is_frozen: n(c["is_frozen"]) ? "Yes" : "No", disabled: n(c["disabled"]) ? "Yes" : "No" });
    }
    return { columns: [col("customer", "Customer", "Link", "Customer", 150), col("customer_name", "Customer Name", "Data", undefined, 180), cur("credit_limit", "Credit Limit"), cur("outstanding_amt", "Outstanding Amt"), cur("credit_balance", "Credit Balance"), col("bypass_credit_limit_check", "Bypass credit check at Sales Order", "Data", undefined, 100), col("is_frozen", "Is Frozen", "Data", undefined, 70), col("disabled", "Disabled", "Data", undefined, 70)], rows: out };
  },
};

/** customer_ledger_summary.py / supplier_ledger_summary.py (PartyLedgerSummaryReport): opening, invoiced, paid, returns, closing. */
function partyLedgerSummary(partyType: "Customer" | "Supplier"): Runner {
  const sign = partyType === "Customer" ? 1 : -1; const inv = partyType === "Customer" ? "Sales Invoice" : "Purchase Invoice";
  const grp = partyType === "Customer" ? "customer_group" : "supplier_group";
  return {
    src: `erpnext/accounts/report/${partyType.toLowerCase()}_ledger_summary/${partyType.toLowerCase()}_ledger_summary.py`,
    filters: [C0, FROM, TO, fl("finance_book", "Finance Book", "Link", "Finance Book"), fl("party", partyType, "Link", partyType), fl(grp, `${partyType} Group`, "Link", `${partyType} Group`), fl("tax_id", "Tax Id", "Data"), ...(partyType === "Customer" ? [fl("territory", "Territory", "Link", "Territory")] : []), fl("cost_center", "Cost Center", "MultiSelectList", "Cost Center"), fl("project", "Project", "MultiSelectList", "Project")],
    run: (f) => {
      const { from, to } = range(f); const by = new Map<string, Row>();
      for (const g of glOf(co(f))) {
        if (g["party_type"] !== partyType || !g["party"] || S(g["posting_date"]) > to) continue;
        if (f["party"] && g["party"] !== f["party"]) continue;
        if (!inMs(g["cost_center"], f["cost_center"] ?? "") || !inMs(g["project"], f["project"] ?? "")) continue;
        const p = adapter.get(partyType, S(g["party"]));
        if (f[grp] && p?.[grp] !== f[grp]) continue; if (f["tax_id"] && !S(p?.["tax_id"]).includes(f["tax_id"])) continue; if (f["territory"] && p?.["territory"] !== f["territory"]) continue;
        const r = by.get(S(g["party"])) ?? { party: g["party"], party_name: partyName(partyType, S(g["party"])), opening_balance: 0, invoiced_amount: 0, paid_amount: 0, return_amount: 0, closing_balance: 0, currency: companyCurrency(S(g["company"])) };
        const amt = sign * (n(g["debit"]) - n(g["credit"]));
        if (S(g["posting_date"]) < from) r["opening_balance"] = n(r["opening_balance"]) + amt;
        else if (g["voucher_type"] === inv && !n(adapter.get(inv, S(g["voucher_no"]))?.["is_return"])) r["invoiced_amount"] = n(r["invoiced_amount"]) + amt;
        else if (g["voucher_type"] === inv) r["return_amount"] = n(r["return_amount"]) - amt;
        else r["paid_amount"] = n(r["paid_amount"]) - amt;
        by.set(S(g["party"]), r);
      }
      const list: Row[] = [...by.values()].map((r): Row => ({ ...r, opening_balance: r2(n(r["opening_balance"])), invoiced_amount: r2(n(r["invoiced_amount"])), paid_amount: r2(n(r["paid_amount"])), return_amount: r2(n(r["return_amount"])), closing_balance: r2(n(r["opening_balance"]) + n(r["invoiced_amount"]) - n(r["paid_amount"]) - n(r["return_amount"])) }))
        .filter((r) => n(r["opening_balance"]) || n(r["invoiced_amount"]) || n(r["paid_amount"]) || n(r["return_amount"])).sort((a, b) => S(a["party"]).localeCompare(S(b["party"])));
      const keys = ["opening_balance", "invoiced_amount", "paid_amount", "return_amount", "closing_balance"];
      return { columns: [col("party", partyType, "Link", partyType, 150), col("party_name", `${partyType} Name`, "Data", undefined, 180), cur("opening_balance", "Opening Balance"), cur("invoiced_amount", partyType === "Customer" ? "Invoiced Amount" : "Invoiced Amount"), cur("paid_amount", "Paid Amount"), cur("return_amount", partyType === "Customer" ? "Credit Note" : "Debit Note"), cur("closing_balance", "Closing Balance"), col("currency", "Currency", "Link", "Currency", 70)],
        rows: list.length ? [...list, totalRow(list, "party", keys)] : [] };
    },
  };
}

/** dimension_wise_accounts_balance_report.py: account balances split by the values of one accounting dimension. */
const dimensionWise: Runner = {
  src: "erpnext/accounts/report/dimension_wise_accounts_balance_report/dimension_wise_accounts_balance_report.py",
  filters: [C0, fl("fiscal_year", "Fiscal Year", "Link", "Fiscal Year"), FROM, TO, fl("finance_book", "Finance Book", "Link", "Finance Book"), fl("dimension", "Select Dimension", "Select", ["Cost Center", "Project"], "Cost Center")],
  run: (f) => {
    const { from, to } = range(f); const dim = f["dimension"] || "Cost Center"; const key = dim === "Project" ? "project" : dim === "Cost Center" ? "cost_center" : dim.toLowerCase().replace(/\s+/g, "_");
    const values = adapter.list(dim).filter((x) => (!co(f) || !x["company"] || x["company"] === co(f)) && !n(x["is_group"])).map((x) => x.name);
    const g = glOf(co(f)).filter((x) => between(x["posting_date"], from, to));
    const by = new Map<string, Record<string, number>>();
    for (const x of g) { const a = S(x["account"]); const v = S(x[key]); if (!v) continue; const m = by.get(a) ?? {}; m[v] = (m[v] ?? 0) + n(x["debit"]) - n(x["credit"]); by.set(a, m); }
    const used = values.filter((v) => [...by.values()].some((m) => m[v]));
    const fk = (v: string) => `d_${v.replace(/[^a-zA-Z0-9]+/g, "_").toLowerCase()}`;
    const list: Row[] = [...by.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([a, m]) => ({ account: a, ...Object.fromEntries(used.map((v) => [fk(v), r2(m[v] ?? 0)])), total: r2(used.reduce((s, v) => s + (m[v] ?? 0), 0)) }));
    const keys = [...used.map(fk), "total"];
    return { columns: [col("account", "Account", "Link", "Account", 220), ...used.map((v) => cur(fk(v), v)), cur("total", "Total")], rows: list.length ? [...list, totalRow(list, "account", keys)] : [] };
  },
};

/** general_and_payment_ledger_comparison.py: vouchers whose receivable/payable GL balance differs from the Payment Ledger. */
const glPlComparison: Runner = {
  src: "erpnext/accounts/report/general_and_payment_ledger_comparison/general_and_payment_ledger_comparison.py",
  filters: [C0, fl("period_start_date", "Start Date", "Date", undefined, "__fy_start"), fl("period_end_date", "End Date", "Date", undefined, "__fy_end"), fl("account", "Account", "MultiSelectList", "Account"), fl("party_type", "Party Type", "Link", "Party Type"), fl("party", "Party", "Dynamic Link", "party_type"), fl("voucher_no", "Voucher No", "Data")],
  run: (f) => {
    const { from, to } = range(f, "period_start_date", "period_end_date"); const acc = partyAccounts(co(f));
    const key = (a: string, vt: string, vn: string, pt: string, p: string) => [a, vt, vn, pt, p].join("\u0000");
    const gl = new Map<string, number>(); const pl = new Map<string, number>();
    for (const g of glOf(co(f))) if (acc.has(S(g["account"])) && between(g["posting_date"], from, to)) { const k = key(S(g["account"]), S(g["voucher_type"]), S(g["voucher_no"]), S(g["party_type"]), S(g["party"])); gl.set(k, (gl.get(k) ?? 0) + n(g["debit"]) - n(g["credit"])); }
    for (const p of paymentLedger(co(f))) if (between(p.posting_date, from, to)) { const k = key(p.account, p.voucher_type, p.voucher_no, p.party_type, p.party); pl.set(k, (pl.get(k) ?? 0) + p.amount); }
    const out: Row[] = [];
    for (const k of new Set([...gl.keys(), ...pl.keys()])) {
      const [a, vt, vn, pt, p] = k.split("\u0000") as [string, string, string, string, string];
      if (!inMs(a, f["account"] ?? "") || (f["party_type"] && pt !== f["party_type"]) || (f["party"] && p !== f["party"]) || (f["voucher_no"] && vn !== f["voucher_no"])) continue;
      const gb = r2(gl.get(k) ?? 0), pb = r2(pl.get(k) ?? 0); if (Math.abs(gb - pb) < 0.005) continue;
      out.push({ company: co(f), account: a, voucher_type: vt, voucher_no: vn, party_type: pt, party: p, gl_balance: gb, pl_balance: pb });
    }
    const checked = gl.size;
    return { columns: [col("company", "Company", "Link", "Company", 120), col("account", "Account", "Link", "Account", 180), col("voucher_type", "Voucher Type", "Data", undefined, 120), col("voucher_no", "Voucher No", "Dynamic Link", "voucher_type", 160), col("party_type", "Party Type", "Data", undefined, 90), col("party", "Party", "Dynamic Link", "party_type", 150), cur("gl_balance", "GL Balance"), cur("pl_balance", "Payment Ledger Balance")],
      rows: out, checks: [{ label: "Receivable/payable vouchers compared", ok: out.length === 0, detail: `${checked} voucher/party lines compared; ${out.length} differ` }] };
  },
};

/** gross_and_net_profit_report.py: income, gross profit (income − cost of goods sold) and net profit per period. */
const grossNetProfit: Runner = {
  src: "erpnext/accounts/report/gross_and_net_profit_report/gross_and_net_profit_report.py",
  filters: [C0, fl("finance_book", "Finance Book", "Link", "Finance Book"), fl("filter_based_on", "Filter Based On", "Select", ["Fiscal Year", "Date Range"], "Fiscal Year"), fl("period_start_date", "Start Date", "Date", undefined, "__fy_start"), fl("period_end_date", "End Date", "Date", undefined, "__fy_end"), fl("from_fiscal_year", "Start Year", "Link", "Fiscal Year"), fl("to_fiscal_year", "End Year", "Link", "Fiscal Year"), fl("periodicity", "Periodicity", "Select", ["Monthly", "Quarterly", "Half-Yearly", "Yearly"], "Yearly"), fl("cost_center", "Cost Center", "MultiSelectList", "Cost Center"), fl("project", "Project", "MultiSelectList", "Project"), fl("accumulated_values", "Accumulated Values", "Check")],
  run: (f) => {
    const { from, to } = f["filter_based_on"] === "Date Range" ? range(f, "period_start_date", "period_end_date") : { from: fiscalYear(f["from_fiscal_year"]).start, to: fiscalYear(f["to_fiscal_year"] || f["from_fiscal_year"]).end };
    const ps = periods(from, to, f["periodicity"] || "Yearly"); const acc = f["accumulated_values"] === "1";
    const g = glOf(co(f)).filter((x) => between(x["posting_date"], from, to) && inMs(x["cost_center"], f["cost_center"] ?? "") && inMs(x["project"], f["project"] ?? ""));
    const val = (pred: (a: Doc) => boolean, sign: number) => Object.fromEntries(ps.map((p, i) => [p.key, r2(g.filter((x) => { const a = account(S(x["account"])); return a && pred(a) && between(x["posting_date"], acc ? ps[0]!.from : p.from, p.to) && i >= 0; }).reduce((s, x) => s + sign * (n(x["credit"]) - n(x["debit"])), 0))]));
    const income = val((a) => a["root_type"] === "Income", 1);
    const cogs = val((a) => a["root_type"] === "Expense" && (a["account_type"] === "Cost of Goods Sold" || /cost of goods|تكلفة البضاعة/i.test(S(a["account_name"] ?? a.name))), -1);
    const expense = val((a) => a["root_type"] === "Expense", -1);
    const gross = Object.fromEntries(ps.map((p) => [p.key, r2(n(income[p.key]) - n(cogs[p.key]))]));
    const net = Object.fromEntries(ps.map((p) => [p.key, r2(n(income[p.key]) - n(expense[p.key]))]));
    const tot = (m: Record<string, number>) => (acc ? n(m[ps[ps.length - 1]?.key ?? ""]) : r2(ps.reduce((s, p) => s + n(m[p.key]), 0)));
    const line = (label: string, m: Record<string, number>, bold = false): Row => ({ account: label, ...m, total: tot(m), ...(bold ? { bold: true } : {}) });
    return { columns: [col("account", "Account", "Data", undefined, 240), ...ps.map((p) => cur(p.key, p.label)), cur("total", "Total")],
      rows: [line("Income", income), line("Cost of Goods Sold", cogs), line("Gross Profit", gross, true), line("Total Expense", expense), line("Net Profit", net, true)] };
  },
};

/** payment_ledger.py: Payment Ledger Entries (receivable/payable lines) with optional per-party grouping. */
const paymentLedgerReport: Runner = {
  src: "erpnext/accounts/report/payment_ledger/payment_ledger.py",
  filters: [C0, fl("period_start_date", "Start Date", "Date", undefined, "__fy_start"), fl("period_end_date", "End Date", "Date", undefined, "__fy_end"), fl("account", "Account", "MultiSelectList", "Account"), fl("party_type", "Party Type", "Link", "Party Type"), fl("party", "Party", "MultiSelectList", "party_type"), fl("voucher_no", "Voucher No", "Data"), fl("against_voucher_no", "Against Voucher No", "Data"), fl("include_account_currency", "Include Account Currency", "Check"), fl("group_party", "Group by Party", "Check")],
  run: (f) => {
    const { from, to } = range(f, "period_start_date", "period_end_date");
    const list: Row[] = paymentLedger(co(f)).filter((p) => between(p.posting_date, from, to) && inMs(p.account, f["account"] ?? "") && (!f["party_type"] || p.party_type === f["party_type"]) && inMs(p.party, f["party"] ?? "") && (!f["voucher_no"] || p.voucher_no === f["voucher_no"]) && (!f["against_voucher_no"] || p.against_voucher_no === f["against_voucher_no"]))
      .sort((a, b) => (f["group_party"] === "1" ? a.party.localeCompare(b.party) : 0) || a.posting_date.localeCompare(b.posting_date)).map((p) => ({ ...p }));
    const keys = ["amount", ...(f["include_account_currency"] === "1" ? ["amount_in_account_currency"] : [])];
    const body = f["group_party"] === "1" ? withGroupTotals(list, "party", keys) : list;
    return { columns: [col("posting_date", "Posting Date", "Date", undefined, 100), col("account", "Account", "Link", "Account", 170), col("party_type", "Party Type", "Link", "DocType", 90), col("party", "Party", "Dynamic Link", "party_type", 150), col("voucher_type", "Voucher Type", "Link", "DocType", 120), col("voucher_no", "Voucher No", "Dynamic Link", "voucher_type", 160), col("against_voucher_type", "Against Voucher Type", "Link", "DocType", 120), col("against_voucher_no", "Against Voucher No", "Dynamic Link", "against_voucher_type", 160), cur("amount", "Amount"), ...(f["include_account_currency"] === "1" ? [cur("amount_in_account_currency", "Amount in Account Currency")] : []), col("account_currency", "Currency", "Link", "Currency", 70)],
      rows: list.length ? [...body, totalRow(list, "posting_date", keys)] : [] };
  },
};

/** payment_period_based_on_invoice_date.py: each payment allocation aged by the invoice date. */
const paymentPeriod: Runner = {
  src: "erpnext/accounts/report/payment_period_based_on_invoice_date/payment_period_based_on_invoice_date.py",
  filters: [C0, FROM, TO, fl("payment_type", "Payment Type", "Select", ["Incoming", "Outgoing"], "Incoming"), fl("party_type", "Party Type", "Link", "Party Type"), fl("party", "Party", "Dynamic Link", "party_type")],
  run: (f) => {
    const { from, to } = range(f); const incoming = (f["payment_type"] || "Incoming") === "Incoming"; const out: Row[] = [];
    for (const d of adapter.list("Payment Entry")) {
      if (!sub(d) || (co(f) && d["company"] !== co(f)) || !between(d["posting_date"], from, to)) continue;
      if ((d["payment_type"] === "Receive") !== incoming) continue;
      if (f["party_type"] && d["party_type"] !== f["party_type"]) continue; if (f["party"] && d["party"] !== f["party"]) continue;
      for (const r of rows(d, "references")) {
        const inv = adapter.get(S(r["reference_doctype"]), S(r["reference_name"])); const invDate = S(inv?.["posting_date"] ?? inv?.["transaction_date"] ?? "");
        const amt = n(r["allocated_amount"]); const age = invDate ? daysBetween(invDate, S(d["posting_date"])) : 0;
        out.push({ payment_document: "Payment Entry", payment_entry: d.name, party_type: d["party_type"], party: d["party"], posting_date: d["posting_date"], invoice: r["reference_name"], invoice_posting_date: invDate, due_date: inv?.["due_date"] ?? invDate,
          debit: incoming ? 0 : amt, credit: incoming ? amt : 0, remarks: d["remarks"] ?? "", age, range1: age <= 30 ? amt : 0, range2: age > 30 && age <= 60 ? amt : 0, range3: age > 60 && age <= 90 ? amt : 0, range4: age > 90 && age <= 120 ? amt : 0, range5: age > 120 ? amt : 0 });
      }
    }
    const keys = ["debit", "credit", "range1", "range2", "range3", "range4", "range5"];
    return { columns: [col("payment_document", "Payment Document Type", "Data", undefined, 120), col("payment_entry", "Payment Document", "Dynamic Link", "payment_document", 160), col("party_type", "Party Type", "Data", undefined, 90), col("party", "Party", "Dynamic Link", "party_type", 150), col("posting_date", "Posting Date", "Date", undefined, 100), col("invoice", "Invoice", "Data", undefined, 160), col("invoice_posting_date", "Invoice Posting Date", "Date", undefined, 110), col("due_date", "Payment Due Date", "Date", undefined, 110), cur("debit", "Debit"), cur("credit", "Credit"), col("remarks", "Remarks", "Data", undefined, 150), col("age", "Age", "Int", undefined, 60), cur("range1", "0-30"), cur("range2", "30-60"), cur("range3", "60-90"), cur("range4", "90-120"), cur("range5", "Above 120")],
      rows: out.length ? [...out, totalRow(out, "payment_document", keys)] : [] };
  },
};

/** profitability_analysis.py: income, expense and profit per cost center / project. */
const profitability: Runner = {
  src: "erpnext/accounts/report/profitability_analysis/profitability_analysis.py",
  filters: [C0, fl("based_on", "Based On", "Select", ["Cost Center", "Project", "Accounting Dimension"], "Cost Center"), fl("accounting_dimension", "Accounting Dimension", "Link", "Accounting Dimension"), fl("fiscal_year", "Fiscal Year", "Link", "Fiscal Year"), FROM, TO, fl("show_zero_values", "Show zero values", "Check")],
  run: (f) => {
    const { from, to } = range(f); const based = f["based_on"] || "Cost Center";
    const dimDt = based === "Accounting Dimension" ? S(adapter.get("Accounting Dimension", f["accounting_dimension"] ?? "")?.["document_type"]) || "Cost Center" : based;
    const key = dimDt === "Cost Center" ? "cost_center" : dimDt === "Project" ? "project" : dimDt.toLowerCase().replace(/\s+/g, "_");
    const by = new Map<string, { income: number; expense: number }>();
    for (const g of glOf(co(f))) {
      if (!between(g["posting_date"], from, to)) continue; const a = account(S(g["account"])); const rt = S(a?.["root_type"]); if (rt !== "Income" && rt !== "Expense") continue;
      const v = S(g[key]) || "Not Set"; const m = by.get(v) ?? { income: 0, expense: 0 };
      if (rt === "Income") m.income += n(g["credit"]) - n(g["debit"]); else m.expense += n(g["debit"]) - n(g["credit"]);
      by.set(v, m);
    }
    const names = new Set<string>([...adapter.list(dimDt).filter((x) => !co(f) || !x["company"] || x["company"] === co(f)).map((x) => x.name), ...by.keys()]);
    const list: Row[] = [...names].sort().map((v) => { const m = by.get(v) ?? { income: 0, expense: 0 }; return { account: v, income: r2(m.income), expense: r2(m.expense), gross_profit_loss: r2(m.income - m.expense), indent: 0 }; })
      .filter((r) => f["show_zero_values"] === "1" || r.income || r.expense);
    const keys = ["income", "expense", "gross_profit_loss"];
    return { columns: [col("account", based, "Link", dimDt, 220), cur("income", "Income"), cur("expense", "Expense"), cur("gross_profit_loss", "Gross Profit / Loss")], rows: list.length ? [...list, totalRow(list, "account", keys)] : [] };
  },
};

/** tax_withholding_details.py: withheld tax per supplier invoice / payment by withholding category. */
const taxWithholding: Runner = {
  src: "erpnext/accounts/report/tax_withholding_details/tax_withholding_details.py",
  filters: [C0, fl("party_type", "Party Type", "Select", ["Supplier", "Customer"], "Supplier"), fl("party", "Party", "Dynamic Link", "party_type"), FROM, TO],
  run: (f) => {
    const { from, to } = range(f); const pt = f["party_type"] || "Supplier";
    const cats = adapter.list("Tax Withholding Category"); const accToCat = new Map<string, Doc>();
    for (const c of cats) for (const a of rows(c, "accounts")) if (!co(f) || a["company"] === co(f)) accToCat.set(S(a["account"]), c);
    const out: Row[] = [];
    for (const dt of pt === "Supplier" ? ["Purchase Invoice", "Payment Entry", "Journal Entry"] : ["Sales Invoice", "Payment Entry", "Journal Entry"]) for (const d of adapter.list(dt)) {
      if (!sub(d) || (co(f) && d["company"] !== co(f)) || !between(d["posting_date"], from, to)) continue;
      const party = S(d[pt === "Supplier" ? "supplier" : "customer"] ?? d["party"]) || S(rows(d, "accounts").find((a) => a["party_type"] === pt)?.["party"]);
      if (!party || (f["party"] && party !== f["party"])) continue;
      const lines = [...rows(d, "taxes"), ...rows(d, "deductions"), ...rows(d, "accounts")].filter((t) => accToCat.has(S(t["account_head"] ?? t["account"])));
      if (!lines.length && !d["tax_withholding_category"]) continue;
      const cat = accToCat.get(S(lines[0]?.["account_head"] ?? lines[0]?.["account"])) ?? cats.find((c) => c.name === d["tax_withholding_category"]);
      const tax = r2(lines.reduce((s, t) => s + Math.abs(n(t["tax_amount"] ?? t["amount"] ?? n(t["credit"] ?? t["credit_in_account_currency"]) - n(t["debit"] ?? t["debit_in_account_currency"]))), 0));
      if (!tax) continue;
      const total = n(d["net_total"] ?? d["paid_amount"] ?? d["total_debit"]); const rate = n(rows(cat ?? {} as Doc, "rates").slice(-1)[0]?.["tax_withholding_rate"]) || (total ? r2((tax / total) * 100) : 0);
      out.push({ section_code: cat?.name ?? d["tax_withholding_category"] ?? "", entity_type: S(adapter.get(pt, party)?.[pt === "Supplier" ? "supplier_type" : "customer_type"]) || "Company", party, party_name: partyName(pt, party), tax_id: adapter.get(pt, party)?.["tax_id"] ?? "", rate, total_amount: r2(total), tax_amount: tax, grand_total: n(d["grand_total"] ?? total), transaction_type: dt, ref_no: d.name, transaction_date: d["posting_date"] });
    }
    const keys = ["total_amount", "tax_amount", "grand_total"];
    return { columns: [col("section_code", "Section Code", "Link", "Tax Withholding Category", 180), col("entity_type", "Entity Type", "Data", undefined, 90), col("party", pt, "Link", pt, 150), col("party_name", `${pt} Name`, "Data", undefined, 170), col("tax_id", "Tax Id", "Data", undefined, 130), { fieldname: "rate", label: "Rate %", fieldtype: "Percent", width: 70 }, cur("total_amount", "Total Amount"), cur("tax_amount", "Tax Amount"), cur("grand_total", "Grand Total"), col("transaction_type", "Transaction Type", "Data", undefined, 120), col("ref_no", "Reference No.", "Dynamic Link", "transaction_type", 160), col("transaction_date", "Date of Transaction", "Date", undefined, 100)],
      rows: out.length ? [...out, totalRow(out, "section_code", keys)] : [] };
  },
};

/** trial_balance_for_party.py: opening, period and closing debit/credit per party. */
const trialBalanceParty: Runner = {
  src: "erpnext/accounts/report/trial_balance_for_party/trial_balance_for_party.py",
  filters: [C0, fl("fiscal_year", "Fiscal Year", "Link", "Fiscal Year"), FROM, TO, fl("party_type", "Party Type", "Link", "Party Type", "Customer"), fl("party", "Party", "Dynamic Link", "party_type"), fl("account", "Account", "MultiSelectList", "Account"), fl("show_zero_values", "Show zero values", "Check"), fl("exclude_zero_balance_parties", "Exclude Zero Balance Parties", "Check")],
  run: (f) => {
    const { from, to } = range(f); const pt = f["party_type"] || "Customer"; const by = new Map<string, { od: number; oc: number; d: number; c: number }>();
    for (const g of glOf(co(f))) {
      if (g["party_type"] !== pt || !g["party"] || S(g["posting_date"]) > to || !inMs(g["account"], f["account"] ?? "")) continue;
      if (f["party"] && g["party"] !== f["party"]) continue;
      const m = by.get(S(g["party"])) ?? { od: 0, oc: 0, d: 0, c: 0 };
      if (S(g["posting_date"]) < from) { m.od += n(g["debit"]); m.oc += n(g["credit"]); } else { m.d += n(g["debit"]); m.c += n(g["credit"]); }
      by.set(S(g["party"]), m);
    }
    const parties = f["show_zero_values"] === "1" ? adapter.list(pt).map((p) => p.name) : [...by.keys()];
    const list: Row[] = parties.sort().map((p) => { const m = by.get(p) ?? { od: 0, oc: 0, d: 0, c: 0 }; const ob = m.od - m.oc; const cb = ob + m.d - m.c;
      return { party: p, party_name: partyName(pt, p), opening_debit: r2(Math.max(ob, 0)), opening_credit: r2(Math.max(-ob, 0)), debit: r2(m.d), credit: r2(m.c), closing_debit: r2(Math.max(cb, 0)), closing_credit: r2(Math.max(-cb, 0)), currency: companyCurrency(co(f)) }; })
      .filter((r) => f["exclude_zero_balance_parties"] !== "1" || r.closing_debit || r.closing_credit);
    const keys = ["opening_debit", "opening_credit", "debit", "credit", "closing_debit", "closing_credit"];
    return { columns: [col("party", "Party", "Dynamic Link", "party_type", 150), col("party_name", "Party Name", "Data", undefined, 180), cur("opening_debit", "Opening (Dr)"), cur("opening_credit", "Opening (Cr)"), cur("debit", "Debit"), cur("credit", "Credit"), cur("closing_debit", "Closing (Dr)"), cur("closing_credit", "Closing (Cr)"), col("currency", "Currency", "Link", "Currency", 70)],
      rows: list.length ? [...list, totalRow(list, "party", keys)] : [] };
  },
};

/** voucher_wise_balance.py: vouchers whose total debit and credit differ in the period. */
const voucherWiseBalance: Runner = {
  src: "erpnext/accounts/report/voucher_wise_balance/voucher_wise_balance.py",
  filters: [C0, FROM, TO],
  run: (f) => {
    const { from, to } = range(f); const by = new Map<string, { vt: string; vn: string; d: number; c: number }>();
    for (const g of glOf(co(f))) if (between(g["posting_date"], from, to)) { const k = `${g["voucher_type"]}\u0000${g["voucher_no"]}`; const m = by.get(k) ?? { vt: S(g["voucher_type"]), vn: S(g["voucher_no"]), d: 0, c: 0 }; m.d += n(g["debit"]); m.c += n(g["credit"]); by.set(k, m); }
    const out: Row[] = [...by.values()].filter((m) => Math.abs(m.d - m.c) >= 0.005).map((m) => ({ voucher_type: m.vt, voucher_no: m.vn, debit: r2(m.d), credit: r2(m.c), debit_credit_diff: r2(m.d - m.c) }));
    return { columns: [col("voucher_type", "Voucher Type", "Data", undefined, 140), col("voucher_no", "Voucher No", "Dynamic Link", "voucher_type", 180), cur("debit", "Debit"), cur("credit", "Credit"), cur("debit_credit_diff", "Difference")], rows: out,
      checks: [{ label: "Every voucher balances", ok: out.length === 0, detail: `${by.size} vouchers checked; ${out.length} unbalanced` }] };
  },
};

export const ACCOUNTS_RUNNERS: Record<string, Runner> = {
  "Account Balance": accountBalance,
  "Bank Clearance Summary": bankClearanceSummary,
  "Bank Reconciliation Statement": bankReconciliationStatement,
  "Customer Credit Balance": customerCreditBalance,
  "Customer Ledger Summary": partyLedgerSummary("Customer"),
  "Supplier Ledger Summary": partyLedgerSummary("Supplier"),
  "Dimension-wise Accounts Balance Report": dimensionWise,
  "General and Payment Ledger Comparison": glPlComparison,
  "Gross and Net Profit Report": grossNetProfit,
  "Payment Ledger": paymentLedgerReport,
  "Payment Period Based On Invoice Date": paymentPeriod,
  "Profitability Analysis": profitability,
  "Tax Withholding Details": taxWithholding,
  "Trial Balance for Party": trialBalanceParty,
  "Voucher-wise Balance": voucherWiseBalance,
};
export type { RResult };
void ms; void flt; void submitted;
