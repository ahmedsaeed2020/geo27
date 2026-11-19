/**
 * Report runner — local ports of source Script Report execute() functions over adapter records.
 * Each runner cites the source .py it ports; filters come from the source report .js (report_filters.json) and
 * the runner reads them by fieldname. Columns, grouping and total rows follow the source; data is synthetic.
 */
import { adapter, type Doc } from "./adapter";
import { customDimensions, dimFilterOk, dimReportFilters } from "./dimensions";
import { booked as defBooked, isDeferred } from "./deferred";
import { resolveName as RN } from "./rename";
import { defaultCompany } from "./sessionDefaults";
import { generalLedger, GL_CATEGORIES } from "./generalLedger";

/** `options` = target DocType for Link, the discriminator column for Dynamic Link (as in the source report columns). */
export interface RCol { fieldname: string; label: string; fieldtype: "Data" | "Link" | "Dynamic Link" | "Currency" | "Float" | "Int" | "Date" | "Percent"; options?: string; width?: number; hidden?: number; /** display only: values above this limit (from a setting) are coloured; nothing is coloured without a limit */ alertAbove?: number | undefined }
export type Row = Record<string, unknown> & { indent?: number; is_total?: boolean; bold?: boolean };
export interface RCheck { label: string; ok: boolean; detail: string }
/** `error` = the source execute() would frappe.throw this message (validate_filters …); the workbench shows it instead of rows. */
export interface RResult { columns: RCol[]; rows: Row[]; summary?: { label: string; value: number }[]; checks?: RCheck[]; error?: string }
export interface RFilter { fieldname: string; label: string; fieldtype: string; options?: string | string[]; default?: string }
export type F = Record<string, string>;
interface Runner { src: string; filters: RFilter[]; base?: RFilter[]; run: (f: F) => RResult }

const n = (v: unknown) => Number(v) || 0;
const r2 = (x: number) => Math.round(x * 100) / 100;
const today = () => new Date().toISOString().slice(0, 10);
const cur = (fieldname: string, label: string, width = 120): RCol => ({ fieldname, label, fieldtype: "Currency", options: "currency", width });
const col = (fieldname: string, label: string, fieldtype: RCol["fieldtype"] = "Data", options?: string, width = 140): RCol => (options ? { fieldname, label, fieldtype, options, width } : { fieldname, label, fieldtype, width });
const sub = (d: Doc) => d.docstatus === 1;
const inRange = (d: unknown, f: F) => (!f["from_date"] || String(d) >= f["from_date"]) && (!f["to_date"] || String(d) <= f["to_date"]);
/** frappe.defaults.get_user_default("Company") through the shared Session Defaults resolver (session → Global Defaults →
 *  User Permission default), else a permitted company for the preview (src/lib/sessionDefaults.ts resolveDefaultCompany). */
const COMPANY = () => defaultCompany();
/** erpnext.utils.get_fiscal_year(today) */
const fy = () => adapter.list("Fiscal Year").find((y) => String(y["year_start_date"]) <= today() && String(y["year_end_date"]) >= today());
/** frappe.datetime.add_months(frappe.datetime.get_today(), -1) */
const monthAgo = () => { const d = new Date(`${today()}T00:00:00Z`); const day = d.getUTCDate(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - 1); d.setUTCDate(Math.min(day, new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate())); return d.toISOString().slice(0, 10); };
const fyStart = () => String(fy()?.["year_start_date"] ?? `${today().slice(0, 4)}-01-01`);
const fyEnd = () => String(fy()?.["year_end_date"] ?? `${today().slice(0, 4)}-12-31`);
const COMMON: RFilter[] = [
  { fieldname: "company", label: "Company", fieldtype: "Link", options: "Company", default: "__company" },
  { fieldname: "from_date", label: "From Date", fieldtype: "Date", default: "__fy_start" },
  { fieldname: "to_date", label: "To Date", fieldtype: "Date", default: "__fy_end" },
];
export function defaults(fs: RFilter[]): F {
  const o: F = {};
  for (const f of fs) o[f.fieldname] = f.default === "__company" ? COMPANY() : f.default === "__fy_start" ? fyStart() : f.default === "__fy_end" ? fyEnd() : f.default === "__today" ? today() : f.default === "__month_ago" ? monthAgo() : f.default ?? "";
  return o;
}
/** general_ledger.py / financial_statements.py finance-book rule: entries without a book always count; a book's own
 *  entries count only when that book is filtered (or it is the company default book), so alternate books never double-count. */
const bookOk = (g: Doc, f: F) => { const b = String(g["finance_book"] ?? ""); if (!b) return true; const def = String(adapter.get("Company", String(g["company"] ?? ""))?.["default_finance_book"] ?? ""); return f["finance_book"] ? b === f["finance_book"] || (!!n(f["include_default_book_entries"]) && b === def) : b === def; };
const gle = (f: F) => adapter.list("GL Entry").filter((g) => !n(g["is_cancelled"]) && (!f["company"] || g["company"] === f["company"]) && bookOk(g, f) && dimFilterOk(g, f));

// ---------- account tree helpers (erpnext/accounts/report/financial_statements.py) ----------
interface Acc { name: string; parent: string; root_type: string; is_group: number; account_type: string; lft: number; children: Acc[]; indent: number }
function accountTree(company: string): Acc[] {
  const all = adapter.list("Account").filter((a) => !company || a["company"] === company);
  const by = new Map<string, Acc>(all.map((a) => [a.name, { name: a.name, parent: String(a["parent_account"] ?? ""), root_type: String(a["root_type"] ?? ""), is_group: n(a["is_group"]), account_type: String(a["account_type"] ?? ""), lft: 0, children: [], indent: 0 }]));
  const roots: Acc[] = [];
  for (const a of by.values()) { const p = by.get(a.parent); if (p) p.children.push(a); else roots.push(a); }
  const order: Acc[] = [];
  const walk = (a: Acc, ind: number) => { a.indent = ind; order.push(a); a.children.forEach((c) => walk(c, ind + 1)); };
  const ROOT_ORDER = ["Asset", "Liability", "Equity", "Income", "Expense"];
  roots.sort((a, b) => ROOT_ORDER.indexOf(a.root_type) - ROOT_ORDER.indexOf(b.root_type)).forEach((r) => walk(r, 0));
  return order;
}
/** Sum of a leaf-level map up the tree (group accounts accumulate their children, as accumulate_values_into_parents). */
function rollup(order: Acc[], leaf: Map<string, number>): Map<string, number> {
  const out = new Map<string, number>();
  const tot = (a: Acc): number => { const v = (leaf.get(a.name) ?? 0) + a.children.reduce((s, c) => s + tot(c), 0); out.set(a.name, v); return v; };
  order.filter((a) => a.indent === 0).forEach(tot);
  return out;
}
const ledgerAccounts = (order: Acc[]) => new Set(order.map((a) => a.name));

// ---------- periods (erpnext/accounts/report/financial_statements.py get_period_list) ----------
function periods(f: F): { key: string; label: string; from: string; to: string }[] {
  const per = f["periodicity"] || "Yearly"; const step = { Monthly: 1, Quarterly: 3, "Half-Yearly": 6, Yearly: 12 }[per] ?? 12;
  const s = new Date((f["from_date"] || fyStart()) + "T00:00:00Z"); const end = f["to_date"] || fyEnd();
  const out: { key: string; label: string; from: string; to: string }[] = [];
  const M = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  while (s.toISOString().slice(0, 10) <= end && out.length < 24) {
    const from = s.toISOString().slice(0, 10); const e = new Date(s); e.setUTCMonth(e.getUTCMonth() + step); e.setUTCDate(0);
    let to = e.toISOString().slice(0, 10); if (to > end) to = end;
    const label = step === 12 ? `${from.slice(0, 4)}` : `${M[s.getUTCMonth()]} ${from.slice(0, 4)}`;
    out.push({ key: `p_${from.replace(/-/g, "")}`, label, from, to }); s.setUTCMonth(s.getUTCMonth() + step);
  }
  return out;
}

function statement(f: F, roots: string[], cumulative: boolean): { rows: Row[]; cols: RCol[]; totals: Record<string, Record<string, number>> } {
  const order = accountTree(f["company"] ?? "").filter((a) => roots.includes(a.root_type));
  const ps = periods(f); const g = gle(f);
  const totals: Record<string, Record<string, number>> = {};
  const per = ps.map((p) => {
    const leaf = new Map<string, number>();
    for (const e of g) {
      const d = String(e["posting_date"]);
      if (cumulative ? d > p.to : d < p.from || d > p.to) continue;
      const a = order.find((x) => x.name === e["account"]); if (!a) continue;
      // balance must be shown with the natural sign: debit-normal for Asset/Expense, credit-normal otherwise
      const sign = a.root_type === "Asset" || a.root_type === "Expense" ? 1 : -1;
      leaf.set(a.name, (leaf.get(a.name) ?? 0) + sign * (n(e["debit"]) - n(e["credit"])));
    }
    return rollup(order, leaf);
  });
  const rows: Row[] = order.map((a) => {
    const row: Row = { account: a.name, account_name: a.name, indent: a.indent, is_group: a.is_group, root_type: a.root_type, bold: a.indent === 0 };
    let t = 0; ps.forEach((p, i) => { const v = r2(per[i]!.get(a.name) ?? 0); row[p.key] = v; t = cumulative ? v : t + v; });
    row["total"] = r2(t);
    if (a.indent === 0) totals[a.root_type] = Object.fromEntries([...ps.map((p) => [p.key, n(row[p.key])]), ["total", n(row["total"])]]);
    return row;
  });
  const cols: RCol[] = [col("account", "Account", "Link", "Account", 280), ...ps.map((p) => cur(p.key, p.label)), ...(cumulative ? [] : [cur("total", "Total")])];
  return { rows, cols, totals };
}

// ---------- Accounts Receivable / Payable (accounts_receivable.py: voucher-wise outstanding with ageing) ----------
function receivable(f: F, party: "Customer" | "Supplier", summary: boolean): RResult {
  const asOn = f["report_date"] || today(); const r = [30, 60, 90, 120];
  const inv = party === "Customer" ? "Sales Invoice" : "Purchase Invoice";
  const g = gle(f).filter((e) => e["party_type"] === party && String(e["posting_date"]) <= asOn && (!f["party"] || e["party"] === f["party"]));
  const by = new Map<string, Row>();
  for (const e of g) {
    const v = String(e["against_voucher"] || e["voucher_no"]); const vt = String(e["against_voucher_type"] || e["voucher_type"]);
    const amt = party === "Customer" ? n(e["debit"]) - n(e["credit"]) : n(e["credit"]) - n(e["debit"]);
    const row = by.get(v) ?? { party: e["party"], voucher_type: vt, voucher_no: v, invoiced: 0, paid: 0, credit_note: 0, outstanding: 0 };
    if (e["voucher_no"] === v && amt > 0) row["invoiced"] = n(row["invoiced"]) + amt;
    else if (e["voucher_type"] === inv && amt < 0) row["credit_note"] = n(row["credit_note"]) - amt;
    else row["paid"] = n(row["paid"]) - amt;
    row["outstanding"] = r2(n(row["invoiced"]) - n(row["paid"]) - n(row["credit_note"]));
    by.set(v, row);
  }
  const rows: Row[] = [];
  for (const row of by.values()) {
    if (Math.abs(n(row["outstanding"])) < 0.01) continue;
    const d = adapter.get(String(row["voucher_type"]), String(row["voucher_no"]));
    const pd = String(d?.["posting_date"] ?? ""), due = String(d?.["due_date"] || pd);
    const basis = f["ageing_based_on"] === "Posting Date" ? pd : due;
    const age = Math.max(0, Math.round((Date.parse(asOn) - Date.parse(basis)) / 864e5));
    const bucket = age <= r[0]! ? 1 : age <= r[1]! ? 2 : age <= r[2]! ? 3 : age <= r[3]! ? 4 : 5;
    rows.push({ posting_date: pd, ...row, due_date: due, age, ...Object.fromEntries([1, 2, 3, 4, 5].map((b) => [`range${b}`, b === bucket ? row["outstanding"] : 0])), currency: "SAR" });
  }
  rows.sort((a, b) => String(a["posting_date"]).localeCompare(String(b["posting_date"])));
  // check: report total = Σ outstanding_amount on the submitted invoices (accounts_controller keeps it in step with the ledger)
  const docs = adapter.list(inv).filter((d) => sub(d) && (!f["company"] || d["company"] === f["company"]) && String(d["posting_date"]) <= asOn && (!f["party"] || d[party === "Customer" ? "customer" : "supplier"] === f["party"]));
  // outstanding_amount is the current figure; ledger movements dated after the report date are taken back out (AR "as on" date)
  const ids = new Set(docs.map((d) => d.name));
  const sg = party === "Customer" ? 1 : -1;
  const later = gle(f).filter((e) => e["party_type"] === party && String(e["posting_date"]) > asOn && ids.has(String(e["against_voucher"]))).map((e) => sg * (n(e["debit"]) - n(e["credit"])));
  const docSum = r2(docs.reduce((s, d) => s + n(d["outstanding_amount"]), 0) - later.reduce((s, x) => s + x, 0));
  const repSum = r2(rows.reduce((s, x) => s + n(x["outstanding"]), 0));
  const checks: RCheck[] = [{ label: `${party === "Customer" ? "AR" : "AP"} total = Σ outstanding_amount of submitted ${inv}s (as on ${asOn})`, ok: Math.abs(docSum - repSum) < 0.05, detail: `${repSum} = ${docSum}` }];
  const ranges = [col("age", "Age (Days)", "Int", undefined, 80), cur("range1", `0-${r[0]}`), cur("range2", `${r[0]! + 1}-${r[1]}`), cur("range3", `${r[1]! + 1}-${r[2]}`), cur("range4", `${r[2]! + 1}-${r[3]}`), cur("range5", `${r[3]! + 1}-Above`)];
  const sumKeys = ["invoiced", "paid", "credit_note", "outstanding", "range1", "range2", "range3", "range4", "range5"];
  const total = (rs: Row[], label: Row): Row => ({ ...label, is_total: true, bold: true, ...Object.fromEntries(sumKeys.map((k) => [k, r2(rs.reduce((s, x) => s + n(x[k]), 0))])) });
  if (summary) {
    const bp = new Map<string, Row[]>(); rows.forEach((x) => bp.set(String(x["party"]), [...(bp.get(String(x["party"])) ?? []), x]));
    const srows = [...bp].map(([p, rs]) => total(rs, { party: p, party_name: adapter.get(party, p)?.[party === "Customer" ? "customer_name" : "supplier_name"] ?? p, is_total: false, bold: false })).map((x) => ({ ...x, is_total: false, bold: false }));
    return { columns: [col("party", party, "Link", party), col("party_name", `${party} Name`), cur("invoiced", "Invoiced Amount"), cur("paid", "Paid Amount"), cur("credit_note", party === "Customer" ? "Credit Note Amount" : "Debit Note Amount"), cur("outstanding", "Outstanding Amount"), ...ranges.slice(1)], rows: [...srows, total(srows, { party: "Total" })], checks };
  }
  return { columns: [col("posting_date", "Posting Date", "Date", undefined, 100), col("party", party, "Link", party), col("voucher_type", "Voucher Type"), col("voucher_no", "Voucher No", "Link"), col("due_date", "Due Date", "Date", undefined, 100), cur("invoiced", "Invoiced Amount"), cur("paid", "Paid Amount"), cur("credit_note", party === "Customer" ? "Credit Note" : "Debit Note"), cur("outstanding", "Outstanding Amount"), ...ranges], rows: [...rows, total(rows, { posting_date: "Total" })], checks };
}

// ---------- stock helpers (stock_balance.py / stock_ledger.py over Stock Ledger Entry) ----------
const sle = (f: F) => adapter.list("Stock Ledger Entry").filter((e) => !n(e["is_cancelled"]) && (!f["company"] || !e["company"] || e["company"] === f["company"]) && (!f["item_code"] || e["item_code"] === f["item_code"]) && (!f["warehouse"] || e["warehouse"] === f["warehouse"]))
  .sort((a, b) => String(a["posting_date"]).localeCompare(String(b["posting_date"])) || a.name.localeCompare(b.name));
const itemName = (c: unknown) => String(adapter.get("Item", String(c))?.["item_name"] ?? c);
const itemGroup = (c: unknown) => String(adapter.get("Item", String(c))?.["item_group"] ?? "");
const valRate = (code: unknown) => { const xs = adapter.list("Stock Ledger Entry").filter((e) => e["item_code"] === code && n(e["actual_qty"]) > 0); const q = xs.reduce((s, e) => s + n(e["actual_qty"]), 0); return q ? xs.reduce((s, e) => s + n(e["stock_value_difference"]), 0) / q : n(adapter.get("Item", String(code))?.["valuation_rate"]); };

// ---------- analytics (selling/report/sales_analytics.py) ----------
function analytics(f: F, kind: "sales" | "purchase"): RResult {
  const dt = f["doc_type"] || (kind === "sales" ? "Sales Order" : "Purchase Order");
  const tree = f["tree_type"] || (kind === "sales" ? "Customer" : "Supplier");
  const vq = f["value_quantity"] || "Value";
  const ps = periods({ ...f, periodicity: f["range"] || "Monthly" });
  const by = new Map<string, Row>();
  for (const d of adapter.list(dt).filter((x) => sub(x) && (!f["company"] || x["company"] === f["company"]) && inRange(x["transaction_date"] ?? x["posting_date"], f))) {
    const date = String(d["transaction_date"] ?? d["posting_date"]); const p = ps.find((x) => date >= x.from && date <= x.to); if (!p) continue;
    const add = (key: string, label: string, v: number) => { const row = by.get(key) ?? { entity: key, entity_name: label }; row[p.key] = r2(n(row[p.key]) + v); row["total"] = r2(n(row["total"]) + v); by.set(key, row); };
    if (tree === "Item" || tree === "Item Group") for (const it of (d["items"] as Doc[] | undefined) ?? []) { const k = tree === "Item" ? String(it["item_code"]) : itemGroup(it["item_code"]) || "All Item Groups"; add(k, tree === "Item" ? itemName(it["item_code"]) : k, vq === "Value" ? n(it["base_net_amount"] ?? it["amount"]) : n(it["qty"])); }
    else { const pf = tree === "Customer" ? "customer" : tree === "Supplier" ? "supplier" : tree === "Territory" ? "territory" : tree === "Customer Group" ? "customer_group" : "supplier_group"; const k = String(d[pf] ?? d["party_name"] ?? ""); add(k, String(d[pf + "_name"] ?? k), vq === "Value" ? n(d["base_net_total"] ?? d["net_total"]) : n(d["total_qty"])); }
  }
  const rows = [...by.values()].sort((a, b) => n(b["total"]) - n(a["total"]));
  const total: Row = { entity: "Total", is_total: true, bold: true, ...Object.fromEntries([...ps.map((p) => p.key), "total"].map((k) => [k, r2(rows.reduce((s, x) => s + n(x[k]), 0))])) };
  const vcol = (k: string, l: string): RCol => (vq === "Value" ? cur(k, l) : col(k, l, "Float", undefined, 100));
  return { columns: [col("entity", tree, "Link", tree), col("entity_name", `${tree} Name`), ...ps.map((p) => vcol(p.key, p.label)), vcol("total", "Total")], rows: [...rows, total] };
}

const sum = (rows: Row[], keys: string[], label: Row): Row => ({ ...label, is_total: true, bold: true, ...Object.fromEntries(keys.map((k) => [k, r2(rows.reduce((s, x) => s + n(x[k]), 0))])) });
const PER: RFilter = { fieldname: "periodicity", label: "Periodicity", fieldtype: "Select", options: ["Monthly", "Quarterly", "Half-Yearly", "Yearly"], default: "Yearly" };

export const RUNNERS: Record<string, Runner> = {
  "General Ledger": {
    src: "erpnext/accounts/report/general_ledger/general_ledger.py",
    // filters this port applies, by source fieldname/type (general_ledger.js); dimensions follow add_dimensions(…, 15)
    get filters(): RFilter[] { return [...(this.base ?? []), ...customDimensions().map((d) => ({ fieldname: d.fieldname, label: d.document_type, fieldtype: "MultiSelectList", options: d.document_type }))]; },
    base: [{ ...COMMON[0]! }, { fieldname: "finance_book", label: "Finance Book", fieldtype: "Link", options: "Finance Book" },
      { fieldname: "from_date", label: "From Date", fieldtype: "Date", default: "__month_ago" }, { fieldname: "to_date", label: "To Date", fieldtype: "Date", default: "__today" },
      { fieldname: "account", label: "Account", fieldtype: "MultiSelectList", options: "Account" }, { fieldname: "voucher_no", label: "Voucher No", fieldtype: "Data" },
      { fieldname: "against_voucher_no", label: "Against Voucher No", fieldtype: "Data" },
      { fieldname: "party_type", label: "Party Type", fieldtype: "Autocomplete", options: ["Customer", "Supplier", "Employee", "Shareholder"] }, { fieldname: "party", label: "Party", fieldtype: "MultiSelectList", options: "party_type" },
      { fieldname: "categorize_by", label: "Categorize by", fieldtype: "Select", options: ["", ...GL_CATEGORIES], default: "Categorize by Voucher (Consolidated)" },
      { fieldname: "presentation_currency", label: "Currency", fieldtype: "Select" },
      { fieldname: "cost_center", label: "Cost Center", fieldtype: "MultiSelectList", options: "Cost Center" }, { fieldname: "project", label: "Project", fieldtype: "MultiSelectList", options: "Project" },
      ...(["include_dimensions", "disable_opening_balance_calculation", "show_opening_entries", "include_default_book_entries", "show_cancelled_entries", "show_net_values_in_party_account", "show_amount_in_company_currency", "add_values_in_transaction_currency", "show_remarks", "ignore_err", "ignore_cr_dr_notes"].map((fieldname) => ({ fieldname, label: fieldname, fieldtype: "Check", ...(fieldname === "include_dimensions" || fieldname === "include_default_book_entries" ? { default: "1" } : {}) })))],
    run: (f) => generalLedger(f) as RResult,
  },
  "Trial Balance": {
    src: "erpnext/accounts/report/trial_balance/trial_balance.py",
    get filters(): RFilter[] { return [...(this.base ?? []), ...dimReportFilters()]; },
    base: [...COMMON, { fieldname: "show_zero_values", label: "Show zero values", fieldtype: "Check" }],
    run: (f) => {
      const order = accountTree(f["company"] ?? ""); const g = gle(f);
      const leaf = (pred: (e: Doc) => boolean, side: "debit" | "credit") => { const m = new Map<string, number>(); g.filter(pred).forEach((e) => m.set(String(e["account"]), (m.get(String(e["account"])) ?? 0) + n(e[side]))); return rollup(order, m); };
      const ob = (e: Doc) => !!f["from_date"] && String(e["posting_date"]) < f["from_date"]; const ip = (e: Doc) => inRange(e["posting_date"], f);
      const od = leaf(ob, "debit"), oc = leaf(ob, "credit"), pd = leaf(ip, "debit"), pc = leaf(ip, "credit");
      const rows: Row[] = [];
      for (const a of order) {
        // trial_balance.py prepare_opening_closing: opening and closing shown net on one side
        const o = (od.get(a.name) ?? 0) - (oc.get(a.name) ?? 0); const c = o + (pd.get(a.name) ?? 0) - (pc.get(a.name) ?? 0);
        const row: Row = { account: a.name, indent: a.indent, is_group: a.is_group, bold: a.is_group === 1, opening_debit: r2(Math.max(o, 0)), opening_credit: r2(Math.max(-o, 0)), debit: r2(pd.get(a.name) ?? 0), credit: r2(pc.get(a.name) ?? 0), closing_debit: r2(Math.max(c, 0)), closing_credit: r2(Math.max(-c, 0)) };
        if (f["show_zero_values"] !== "1" && !["opening_debit", "opening_credit", "debit", "credit", "closing_debit", "closing_credit"].some((k) => n(row[k]))) continue;
        rows.push(row);
      }
      const keys = ["opening_debit", "opening_credit", "debit", "credit", "closing_debit", "closing_credit"];
      const total = sum(rows.filter((x) => x.indent === 0), keys, { account: "Total" });
      return {
        columns: [col("account", "Account", "Link", "Account", 280), cur("opening_debit", "Opening (Dr)"), cur("opening_credit", "Opening (Cr)"), cur("debit", "Debit"), cur("credit", "Credit"), cur("closing_debit", "Closing (Dr)"), cur("closing_credit", "Closing (Cr)")],
        rows: [...rows, total],
        checks: [{ label: "Trial Balance totals balance (period Dr = Cr)", ok: Math.abs(n(total["debit"]) - n(total["credit"])) < 0.01, detail: `${total["debit"]} = ${total["credit"]}` },
          { label: "Closing Dr = Closing Cr", ok: Math.abs(n(total["closing_debit"]) - n(total["closing_credit"])) < 0.01, detail: `${total["closing_debit"]} = ${total["closing_credit"]}` }],
      };
    },
  },
  "Balance Sheet": {
    src: "erpnext/accounts/report/balance_sheet/balance_sheet.py",
    get filters(): RFilter[] { return [...(this.base ?? []), ...dimReportFilters()]; },
    base: [...COMMON, PER],
    run: (f) => {
      const st = statement(f, ["Asset", "Liability", "Equity"], true);
      const pl = statement(f, ["Income", "Expense"], true);
      const ps = periods(f);
      const prov: Row = { account: "Provisional Profit / Loss (Credit)", bold: true, is_total: true };
      const credit: Row = { account: "Total (Credit)", bold: true, is_total: true };
      ps.forEach((p) => {
        prov[p.key] = r2((pl.totals["Income"]?.[p.key] ?? 0) - (pl.totals["Expense"]?.[p.key] ?? 0));
        credit[p.key] = r2((st.totals["Liability"]?.[p.key] ?? 0) + (st.totals["Equity"]?.[p.key] ?? 0) + n(prov[p.key]));
      });
      const last = ps[ps.length - 1]?.key ?? "";
      const assets = st.totals["Asset"]?.[last] ?? 0;
      return { columns: st.cols, rows: [...st.rows, prov, credit], summary: [{ label: "Total Asset", value: r2(assets) }, { label: "Total Liability", value: r2(st.totals["Liability"]?.[last] ?? 0) }, { label: "Total Equity", value: r2(st.totals["Equity"]?.[last] ?? 0) }, { label: "Provisional Profit / Loss (Credit)", value: n(prov[last]) }],
        checks: [{ label: "Balance Sheet balances (Asset = Liability + Equity + Provisional P/L)", ok: Math.abs(assets - n(credit[last])) < 0.01, detail: `${r2(assets)} = ${credit[last]}` }] };
    },
  },
  "Profit and Loss Statement": {
    src: "erpnext/accounts/report/profit_and_loss_statement/profit_and_loss_statement.py",
    get filters(): RFilter[] { return [...(this.base ?? []), ...dimReportFilters()]; },
    base: [...COMMON, PER],
    run: (f) => {
      const st = statement(f, ["Income", "Expense"], false); const ps = periods(f);
      const np: Row = { account: "Profit for the year", bold: true, is_total: true };
      [...ps.map((p) => p.key), "total"].forEach((k) => (np[k] = r2((st.totals["Income"]?.[k] ?? 0) - (st.totals["Expense"]?.[k] ?? 0))));
      return { columns: st.cols, rows: [...st.rows, np], summary: [{ label: "Total Income This Year", value: st.totals["Income"]?.["total"] ?? 0 }, { label: "Total Expense This Year", value: st.totals["Expense"]?.["total"] ?? 0 }, { label: "Net Profit", value: n(np["total"]) }] };
    },
  },
  "Cash Flow": {
    src: "erpnext/accounts/report/cash_flow/cash_flow.py",
    get filters(): RFilter[] { return [...(this.base ?? []), ...dimReportFilters()]; },
    base: [...COMMON, PER],
    run: (f) => {
      // cash_flow.py get_cash_flow_accounts: Operating (net profit + receivable/payable/stock/tax changes), Investing (Fixed Asset), Financing (Equity)
      const order = accountTree(f["company"] ?? ""); const ps = periods(f); const g = gle(f);
      const at = (name: unknown) => order.find((a) => a.name === name);
      const sect = [
        { label: "Cash Flow from Operations", items: [["Net Profit/Loss", (a: Acc) => a.root_type === "Income" || a.root_type === "Expense"], ["Net Change in Accounts Receivable", (a: Acc) => a.account_type === "Receivable"], ["Net Change in Accounts Payable", (a: Acc) => a.account_type === "Payable"], ["Net Change in Inventory", (a: Acc) => a.account_type === "Stock"], ["Net Change in Tax and other liabilities", (a: Acc) => a.account_type === "Tax" || (a.root_type === "Liability" && (!a.account_type || a.account_type === "Stock Received But Not Billed"))]] as [string, (a: Acc) => boolean][] },
        { label: "Cash Flow from Investing", items: [["Net Change in Fixed Asset", (a: Acc) => a.account_type === "Fixed Asset"]] as [string, (a: Acc) => boolean][] },
        { label: "Cash Flow from Financing", items: [["Net Change in Equity", (a: Acc) => a.root_type === "Equity"]] as [string, (a: Acc) => boolean][] },
      ];
      const flow = (pred: (a: Acc) => boolean, p: { from: string; to: string }) => r2(g.filter((e) => { const a = at(e["account"]); return a && pred(a) && String(e["posting_date"]) >= p.from && String(e["posting_date"]) <= p.to; }).reduce((s, e) => s + n(e["credit"]) - n(e["debit"]), 0));
      const rows: Row[] = []; const net: Row = { section: "Net Change in Cash", bold: true, is_total: true };
      for (const s of sect) {
        rows.push({ section: s.label, bold: true, indent: 0 });
        const st: Row = { section: `Net Cash from ${s.label.replace("Cash Flow from ", "")}`, bold: true, indent: 0 };
        for (const [label, pred] of s.items) { const row: Row = { section: label, indent: 1 }; ps.forEach((p) => { row[p.key] = flow(pred, p); st[p.key] = r2(n(st[p.key]) + n(row[p.key])); }); row["total"] = r2(ps.reduce((x, p) => x + n(row[p.key]), 0)); rows.push(row); }
        st["total"] = r2(ps.reduce((x, p) => x + n(st[p.key]), 0)); rows.push(st);
        ps.forEach((p) => (net[p.key] = r2(n(net[p.key]) + n(st[p.key])))); net["total"] = r2(n(net["total"]) + n(st["total"]));
      }
      const cash = r2(g.filter((e) => { const a = at(e["account"]); return a && (a.account_type === "Cash" || a.account_type === "Bank") && inRange(e["posting_date"], f); }).reduce((s, e) => s + n(e["debit"]) - n(e["credit"]), 0));
      return { columns: [col("section", "Section", "Data", undefined, 300), ...ps.map((p) => cur(p.key, p.label)), cur("total", "Total")], rows: [...rows, net],
        checks: [{ label: "Net change in cash = movement on Cash/Bank accounts", ok: Math.abs(cash - n(net["total"])) < 0.01, detail: `${net["total"]} = ${cash}` }] };
    },
  },
  "Deferred Revenue and Expense": {
    src: "erpnext/accounts/report/deferred_revenue_and_expense/deferred_revenue_and_expense.py",
    filters: [...COMMON, { fieldname: "type", label: "Type", fieldtype: "Select", options: ["Revenue", "Expense"], default: "Revenue" }],
    run: (f) => {
      const dt = f["type"] === "Expense" ? "Purchase Invoice" : "Sales Invoice"; const out: Row[] = [];
      for (const d of adapter.list(dt)) {
        if (!sub(d) || (f["company"] && RN("Company", String(d["company"])) !== RN("Company", f["company"]))) continue;
        for (const x of ((d["items"] as Doc[] | undefined) ?? [])) {
          if (!isDeferred(dt, x)) continue; const s = String(x["service_start_date"] ?? ""), e = String(x["service_stop_date"] || x["service_end_date"] || "");
          if ((f["to_date"] && s > f["to_date"]) || (f["from_date"] && e < f["from_date"])) continue;
          const row = String(x["name"] ?? `${d.name}-${x["idx"] ?? 1}`); const total = r2(n(x["base_net_amount"] ?? x["net_amount"] ?? x["amount"]));
          // recognized up to to_date and within the period, from posted Process Deferred Accounting entries
          let upTo = 0, inP = 0;
          for (const p of adapter.list("Process Deferred Accounting")) if (n(p["docstatus"]) === 1) for (const r of ((p["entries"] as Doc[] | undefined) ?? [])) if (r["invoice"] === d.name && r["row"] === row) {
            const pd = String(r["posting_date"]); if (!f["to_date"] || pd <= f["to_date"]) { upTo += n(r["amount"]); if (inRange(pd, f)) inP += n(r["amount"]); }
          }
          void defBooked;
          out.push({ voucher_type: dt, voucher_no: d.name, item_code: x["item_code"], service_start_date: s, service_end_date: e, total: total, recognized_in_period: r2(inP), recognized_to_date: r2(upTo), remaining: r2(total - upTo), deferred_account: x[dt === "Sales Invoice" ? "deferred_revenue_account" : "deferred_expense_account"] });
        }
      }
      const tot = sum(out, ["total", "recognized_in_period", "recognized_to_date", "remaining"], { voucher_no: "Total" });
      return { columns: [col("voucher_type", "Voucher Type", "Data", undefined, 120), col("voucher_no", "Voucher", "Link", dt), col("item_code", "Item", "Link", "Item"), col("service_start_date", "Service Start Date", "Date", undefined, 110), col("service_end_date", "Service End Date", "Date", undefined, 110), col("deferred_account", "Deferred Account", "Link", "Account", 180), cur("total", "Total Amount"), cur("recognized_in_period", "Recognized in Period"), cur("recognized_to_date", "Recognized to Date"), cur("remaining", "Remaining Balance")], rows: out.length ? [...out, tot] : [],
        checks: [{ label: "Remaining = Total − Recognized", ok: out.every((r) => Math.abs(n(r["total"]) - n(r["recognized_to_date"]) - n(r["remaining"])) < 0.01), detail: `${out.length} rows` }] };
    },
  },
  "Asset Depreciation Ledger": {
    src: "erpnext/assets/report/asset_depreciation_ledger/asset_depreciation_ledger.py",
    filters: [...COMMON, { fieldname: "asset", label: "Asset", fieldtype: "Link", options: "Asset" }, { fieldname: "asset_category", label: "Asset Category", fieldtype: "Link", options: "Asset Category" }, { fieldname: "finance_book", label: "Finance Book", fieldtype: "Link", options: "Finance Book" }],
    run: (f) => {
      const out: Row[] = [];
      for (const s of adapter.list("Asset Depreciation Schedule")) {
        if (n(s["docstatus"]) === 2) continue; const a = adapter.get("Asset", String(s["asset"])); if (!a) continue;
        if (f["company"] && RN("Company", String(a["company"])) !== RN("Company", f["company"])) continue;
        if ((f["asset"] && a.name !== f["asset"]) || (f["asset_category"] && a["asset_category"] !== f["asset_category"])) continue;
        const fb = String(s["finance_book"] ?? ""); const def = String(a["default_finance_book"] ?? "");
        if (f["finance_book"] ? fb !== f["finance_book"] : fb && fb !== def) continue;
        const cost = n(s["net_purchase_amount"] ?? a["gross_purchase_amount"]);
        for (const r of ((s["depreciation_schedule"] as Doc[] | undefined) ?? [])) {
          const je = String(r["journal_entry"] ?? ""); if (!je || je === "preview" || !inRange(r["schedule_date"], f)) continue;
          const acc = n(r["accumulated_depreciation_amount"]) + n(s["opening_accumulated_depreciation"]);
          out.push({ asset: a.name, asset_name: a["asset_name"], finance_book: fb, posting_date: r["schedule_date"], depreciation_amount: r2(n(r["depreciation_amount"])), accumulated_depreciation_amount: r2(acc), amount_after_depreciation: r2(cost - acc), depreciation_entry: je, asset_category: a["asset_category"], gross_purchase_amount: r2(cost) });
        }
      }
      out.sort((x, y) => String(x["posting_date"]).localeCompare(String(y["posting_date"])) || String(x["asset"]).localeCompare(String(y["asset"])));
      return { columns: [col("asset", "Asset", "Link", "Asset", 120), col("asset_name", "Asset Name"), col("finance_book", "Finance Book", "Link", "Finance Book", 120), col("posting_date", "Depreciation Date", "Date", undefined, 120), cur("gross_purchase_amount", "Purchase Amount"), cur("depreciation_amount", "Depreciation Amount"), cur("accumulated_depreciation_amount", "Accumulated Depreciation Amount", 180), cur("amount_after_depreciation", "Amount After Depreciation", 160), col("depreciation_entry", "Depreciation Entry", "Link", "Journal Entry"), col("asset_category", "Asset Category", "Link", "Asset Category")],
        rows: out.length ? [...out, sum(out, ["depreciation_amount"], { asset: "Total" })] : out };
    },
  },
  "Asset Depreciations and Balances": {
    src: "erpnext/assets/report/asset_depreciations_and_balances/asset_depreciations_and_balances.py",
    filters: [...COMMON, { fieldname: "group_by", label: "Group By", fieldtype: "Select", options: ["Asset Category", "Asset"], default: "Asset Category" }, { fieldname: "finance_book", label: "Finance Book", fieldtype: "Link", options: "Finance Book" }],
    run: (f) => {
      const from = f["from_date"] ?? "", to = f["to_date"] ?? "9999"; const byAsset = (f["group_by"] || "Asset Category") === "Asset";
      const g = new Map<string, Row>(); const K = ["opening_cost", "cost_additions", "cost_disposals", "closing_cost", "opening_dep", "dep_in_period", "dep_eliminated", "closing_dep", "net_opening", "net_closing"];
      for (const a of adapter.list("Asset")) {
        if (n(a["docstatus"]) !== 1 || (f["company"] && RN("Company", String(a["company"])) !== RN("Company", f["company"]))) continue;
        const def = String(a["default_finance_book"] ?? ""); const want = f["finance_book"] || def;
        const ss = adapter.list("Asset Depreciation Schedule").filter((s) => s["asset"] === a.name && n(s["docstatus"]) !== 2);
        const s = ss.find((x) => String(x["finance_book"] ?? "") === want) ?? (f["finance_book"] ? undefined : ss[0]); if (f["finance_book"] && !s) continue;
        const cost = n(s?.["net_purchase_amount"] ?? a["gross_purchase_amount"]); const pd = String(a["purchase_date"] ?? a["available_for_use_date"] ?? "");
        const disp = String(a["disposal_date"] ?? ""); const disposed = ["Sold", "Scrapped"].includes(String(a["status"])) && disp;
        const rows = ((s?.["depreciation_schedule"] as Doc[] | undefined) ?? []).filter((r) => r["journal_entry"] && r["journal_entry"] !== "preview");
        const openAcc = n(s?.["opening_accumulated_depreciation"]);
        const depBefore = openAcc + rows.filter((r) => String(r["schedule_date"]) < from).reduce((t, r) => t + n(r["depreciation_amount"]), 0);
        const depIn = rows.filter((r) => String(r["schedule_date"]) >= from && String(r["schedule_date"]) <= to).reduce((t, r) => t + n(r["depreciation_amount"]), 0);
        const oc = pd < from && !(disposed && disp < from) ? cost : 0, add = pd >= from && pd <= to ? cost : 0, dis = disposed && disp >= from && disp <= to ? cost : 0;
        const od = oc ? depBefore : 0, elim = dis ? depBefore + depIn : 0;
        if (!oc && !add && !dis) continue;
        const key = byAsset ? a.name : String(a["asset_category"] ?? "");
        const row = g.get(key) ?? Object.fromEntries([[byAsset ? "asset" : "asset_category", key], ...K.map((k) => [k, 0])]); g.set(key, row);
        const v = { opening_cost: oc, cost_additions: add, cost_disposals: dis, closing_cost: oc + add - dis, opening_dep: od, dep_in_period: depIn, dep_eliminated: elim, closing_dep: od + depIn - elim };
        for (const [k, x] of Object.entries(v)) row[k] = r2(n(row[k]) + x);
        row["net_opening"] = r2(n(row["opening_cost"]) - n(row["opening_dep"])); row["net_closing"] = r2(n(row["closing_cost"]) - n(row["closing_dep"]));
      }
      const out = [...g.values()];
      return { columns: [byAsset ? col("asset", "Asset", "Link", "Asset", 140) : col("asset_category", "Asset Category", "Link", "Asset Category", 160), cur("opening_cost", "Cost as on From Date"), cur("cost_additions", "Cost of New Purchase"), cur("cost_disposals", "Cost of Sold Asset"), cur("closing_cost", "Cost as on To Date"), cur("opening_dep", "Accumulated Depreciation as on From Date", 200), cur("dep_in_period", "Depreciation Amount during the period", 200), cur("dep_eliminated", "Depreciation Eliminated due to disposal of assets", 220), cur("closing_dep", "Accumulated Depreciation as on To Date", 200), cur("net_opening", "Net Asset value as on From Date", 180), cur("net_closing", "Net Asset value as on To Date", 180)],
        rows: out.length ? [...out, sum(out, K, { [byAsset ? "asset" : "asset_category"]: "Total" })] : out,
        checks: [{ label: "Closing = Opening + Additions − Disposals", ok: out.every((r) => Math.abs(n(r["opening_cost"]) + n(r["cost_additions"]) - n(r["cost_disposals"]) - n(r["closing_cost"])) < 0.01), detail: `${out.length} rows` }] };
    },
  },
  "Budget Variance Report": {
    src: "erpnext/accounts/report/budget_variance_report/budget_variance_report.py",
    filters: [COMMON[0]!, { fieldname: "from_fiscal_year", label: "From Fiscal Year", fieldtype: "Link", options: "Fiscal Year", default: "" }, { fieldname: "budget_against", label: "Budget Against", fieldtype: "Select", options: ["Cost Center", "Project"], default: "Cost Center" }],
    run: (f) => {
      const out: Row[] = []; const against = f["budget_against"] || "Cost Center"; const fld = against === "Project" ? "project" : "cost_center";
      for (const b of adapter.list("Budget")) {
        if (n(b["docstatus"]) !== 1 || (b["budget_against"] ?? "Cost Center") !== against || (f["company"] && RN("Company", String(b["company"])) !== RN("Company", f["company"]))) continue;
        const fyName = String(b["from_fiscal_year"] ?? b["fiscal_year"] ?? ""); if (f["from_fiscal_year"] && fyName !== f["from_fiscal_year"]) continue;
        const fyr = adapter.get("Fiscal Year", fyName); const from = String(fyr?.["year_start_date"] ?? `${fyName}-01-01`), to = String(adapter.get("Fiscal Year", String(b["to_fiscal_year"] ?? fyName))?.["year_end_date"] ?? `${b["to_fiscal_year"] ?? fyName}-12-31`);
        const lines = ((b["accounts"] as Doc[] | undefined) ?? []).length ? (b["accounts"] as Doc[]).map((a) => ({ account: String(a["account"]), amount: n(a["budget_amount"]) })) : [{ account: String(b["account"] ?? ""), amount: n(b["budget_amount"]) }];
        for (const l of lines) {
          const acc = RN("Account", l.account); const val = String(b[fld] ?? "");
          const act = r2(adapter.list("GL Entry").filter((g) => !n(g["is_cancelled"]) && g["account"] === acc && String(g[fld] ?? "") === val && String(g["posting_date"]) >= from && String(g["posting_date"]) <= to).reduce((s2, g) => s2 + n(g["debit"]) - n(g["credit"]), 0));
          out.push({ budget_against: val, account: acc, budget: r2(l.amount), actual: act, variance: r2(l.amount - act), budget_name: b.name });
        }
      }
      return { columns: [col("budget_against", against, "Link", against, 180), col("account", "Account", "Link", "Account", 200), cur("budget", "Budget"), cur("actual", "Actual"), cur("variance", "Variance"), col("budget_name", "Budget", "Link", "Budget")], rows: out.length ? [...out, sum(out, ["budget", "actual", "variance"], { budget_against: "Total" })] : [] };
    },
  },
  "Accounts Receivable": { src: "erpnext/accounts/report/accounts_receivable/accounts_receivable.py", filters: [COMMON[0]!, { fieldname: "report_date", label: "Posting Date", fieldtype: "Date", default: "__today" }, { fieldname: "ageing_based_on", label: "Ageing Based On", fieldtype: "Select", options: ["Due Date", "Posting Date"], default: "Due Date" }, { fieldname: "party", label: "Customer", fieldtype: "Link", options: "Customer" }], run: (f) => receivable(f, "Customer", false) },
  "Accounts Payable": { src: "erpnext/accounts/report/accounts_payable/accounts_payable.py", filters: [COMMON[0]!, { fieldname: "report_date", label: "Posting Date", fieldtype: "Date", default: "__today" }, { fieldname: "ageing_based_on", label: "Ageing Based On", fieldtype: "Select", options: ["Due Date", "Posting Date"], default: "Due Date" }, { fieldname: "party", label: "Supplier", fieldtype: "Link", options: "Supplier" }], run: (f) => receivable(f, "Supplier", false) },
  "Accounts Receivable Summary": { src: "erpnext/accounts/report/accounts_receivable_summary/accounts_receivable_summary.py", filters: [COMMON[0]!, { fieldname: "report_date", label: "Posting Date", fieldtype: "Date", default: "__today" }, { fieldname: "ageing_based_on", label: "Ageing Based On", fieldtype: "Select", options: ["Due Date", "Posting Date"], default: "Due Date" }], run: (f) => receivable(f, "Customer", true) },
  "Accounts Payable Summary": { src: "erpnext/accounts/report/accounts_payable_summary/accounts_payable_summary.py", filters: [COMMON[0]!, { fieldname: "report_date", label: "Posting Date", fieldtype: "Date", default: "__today" }, { fieldname: "ageing_based_on", label: "Ageing Based On", fieldtype: "Select", options: ["Due Date", "Posting Date"], default: "Due Date" }], run: (f) => receivable(f, "Supplier", true) },
  "Stock Balance": {
    src: "erpnext/stock/report/stock_balance/stock_balance.py",
    filters: [...COMMON, { fieldname: "item_code", label: "Item", fieldtype: "Link", options: "Item" }, { fieldname: "warehouse", label: "Warehouse", fieldtype: "Link", options: "Warehouse" }],
    run: (f) => {
      const m = new Map<string, Row>();
      for (const e of sle(f)) {
        if (f["to_date"] && String(e["posting_date"]) > f["to_date"]) continue;
        const k = `${e["item_code"]}|${e["warehouse"]}`; const q = n(e["actual_qty"]), v = n(e["stock_value_difference"]);
        const row = m.get(k) ?? { item_code: e["item_code"], item_name: itemName(e["item_code"]), item_group: itemGroup(e["item_code"]), warehouse: e["warehouse"], opening_qty: 0, opening_val: 0, in_qty: 0, in_val: 0, out_qty: 0, out_val: 0 };
        if (f["from_date"] && String(e["posting_date"]) < f["from_date"]) { row["opening_qty"] = n(row["opening_qty"]) + q; row["opening_val"] = n(row["opening_val"]) + v; }
        else if (q >= 0) { row["in_qty"] = n(row["in_qty"]) + q; row["in_val"] = n(row["in_val"]) + v; } else { row["out_qty"] = n(row["out_qty"]) - q; row["out_val"] = n(row["out_val"]) - v; }
        m.set(k, row);
      }
      const rows = [...m.values()].map((x) => { const bq = n(x["opening_qty"]) + n(x["in_qty"]) - n(x["out_qty"]); const bv = r2(n(x["opening_val"]) + n(x["in_val"]) - n(x["out_val"])); return { ...x, bal_qty: bq, bal_val: bv, val_rate: bq ? r2(bv / bq) : 0 }; });
      const keys = ["opening_qty", "opening_val", "in_qty", "in_val", "out_qty", "out_val", "bal_qty", "bal_val"];
      // check: closing per item+warehouse = Stock Ledger closing (last entry's qty_after_transaction / stock_value written by the posting engine)
      const last = new Map<string, Doc>(); for (const e of sle(f)) if (!f["to_date"] || String(e["posting_date"]) <= f["to_date"]) last.set(`${e["item_code"]}|${e["warehouse"]}`, e);
      const bad = [...m.keys()].filter((k) => { const x = (rows as Row[]).find((r) => `${r["item_code"]}|${r["warehouse"]}` === k)!; const e = last.get(k); return !e || Math.abs(n(e["qty_after_transaction"]) - n(x["bal_qty"])) > 0.001 || Math.abs(n(e["stock_value"]) - n(x["bal_val"])) > 0.05; });
      const checks: RCheck[] = [{ label: "Stock Balance closing = Stock Ledger closing (per item and warehouse)", ok: !bad.length && m.size > 0, detail: `${m.size - bad.length}/${m.size} item-warehouse pairs match${bad.length ? `; mismatched ${bad.slice(0, 3).join(", ")}` : ""}` }];
      // Perpetual inventory (stock_and_account_value_comparison.py): stock-voucher GL on stock accounts = Σ stock_value_difference
      {
        const stockAccts = new Set(adapter.list("Account").filter((a) => a["account_type"] === "Stock").map((a) => a.name));
        const SV = new Set(["Stock Entry", "Purchase Receipt", "Delivery Note"]);
        const glv = adapter.list("GL Entry").filter((g) => !Number(g["is_cancelled"]) && SV.has(String(g["voucher_type"])) && stockAccts.has(String(g["account"]))).reduce((s, g) => s + (Number(g["debit"]) || 0) - (Number(g["credit"]) || 0), 0);
        const slv = adapter.list("Stock Ledger Entry").filter((e) => !Number(e["is_cancelled"])).reduce((s, e) => s + (Number(e["stock_value_difference"]) || 0), 0);
        if (adapter.list("Company").some((c) => Number(c["enable_perpetual_inventory"]) === 1)) checks.push({ label: "Perpetual inventory: stock account value (stock vouchers) = Stock Ledger value", ok: Math.abs(glv - slv) < 0.05, detail: `${Math.round(glv * 100) / 100} = ${Math.round(slv * 100) / 100}` });
      }
      return { checks, columns: [col("item_code", "Item", "Link", "Item"), col("item_name", "Item Name"), col("item_group", "Item Group", "Link", "Item Group"), col("warehouse", "Warehouse", "Link", "Warehouse"), col("opening_qty", "Opening Qty", "Float", undefined, 100), cur("opening_val", "Opening Value"), col("in_qty", "In Qty", "Float", undefined, 90), cur("in_val", "In Value"), col("out_qty", "Out Qty", "Float", undefined, 90), cur("out_val", "Out Value"), col("bal_qty", "Balance Qty", "Float", undefined, 100), cur("bal_val", "Balance Value"), cur("val_rate", "Valuation Rate")], rows: [...rows, sum(rows, keys, { item_code: "Total" })] };
    },
  },
  "Stock Ledger": {
    src: "erpnext/stock/report/stock_ledger/stock_ledger.py",
    filters: [...COMMON, { fieldname: "item_code", label: "Item", fieldtype: "Link", options: "Item" }, { fieldname: "warehouse", label: "Warehouse", fieldtype: "Link", options: "Warehouse" }, { fieldname: "voucher_no", label: "Voucher #", fieldtype: "Data" }],
    run: (f) => {
      const bal = new Map<string, { q: number; v: number }>(); const rows: Row[] = [];
      for (const e of sle(f)) {
        const k = `${e["item_code"]}|${e["warehouse"]}`; const b = bal.get(k) ?? { q: 0, v: 0 }; b.q += n(e["actual_qty"]); b.v += n(e["stock_value_difference"]); bal.set(k, b);
        if (!inRange(e["posting_date"], f) || (f["voucher_no"] && e["voucher_no"] !== f["voucher_no"])) continue;
        const q = n(e["actual_qty"]);
        rows.push({ date: e["posting_date"], item_code: e["item_code"], item_name: itemName(e["item_code"]), warehouse: e["warehouse"], in_qty: q > 0 ? q : 0, out_qty: q < 0 ? -q : 0, qty_after_transaction: b.q, incoming_rate: q > 0 ? n(e["valuation_rate"]) : 0, valuation_rate: b.q ? r2(b.v / b.q) : 0, stock_value: r2(b.v), stock_value_difference: r2(n(e["stock_value_difference"])), voucher_type: e["voucher_type"], voucher_no: e["voucher_no"] });
      }
      return { columns: [col("date", "Date", "Date", undefined, 100), col("item_code", "Item", "Link", "Item"), col("item_name", "Item Name"), col("warehouse", "Warehouse", "Link", "Warehouse"), col("in_qty", "In Qty", "Float", undefined, 80), col("out_qty", "Out Qty", "Float", undefined, 80), col("qty_after_transaction", "Balance Qty", "Float", undefined, 100), cur("incoming_rate", "Incoming Rate"), cur("valuation_rate", "Valuation Rate"), cur("stock_value", "Balance Value"), cur("stock_value_difference", "Value Change"), col("voucher_type", "Voucher Type"), col("voucher_no", "Voucher #", "Link")], rows };
    },
  },
  "Stock Projected Qty": {
    src: "erpnext/stock/report/stock_projected_qty/stock_projected_qty.py",
    filters: [COMMON[0]!, { fieldname: "warehouse", label: "Warehouse", fieldtype: "Link", options: "Warehouse" }, { fieldname: "item_code", label: "Item", fieldtype: "Link", options: "Item" }],
    run: (f) => {
      // Bin fields: actual_qty (SLE), ordered_qty (PO − received), reserved_qty (SO − delivered), indented_qty (Material Request − ordered)
      const m = new Map<string, Row>();
      const get = (item: unknown, wh: unknown) => { const k = `${item}|${wh}`; const r = m.get(k) ?? { item_code: item, item_name: itemName(item), warehouse: wh, actual_qty: 0, planned_qty: 0, indented_qty: 0, ordered_qty: 0, reserved_qty: 0, reserved_qty_for_production: 0 }; m.set(k, r); return r; };
      for (const e of sle({ ...f })) { const r = get(e["item_code"], e["warehouse"]); r["actual_qty"] = n(r["actual_qty"]) + n(e["actual_qty"]); }
      const open = (dt: string, field: string, done: string, whf: string) => { for (const d of adapter.list(dt).filter((x) => sub(x) && x["status"] !== "Closed" && x["status"] !== "Completed")) for (const it of (d["items"] as Doc[] | undefined) ?? []) { const left = n(it["stock_qty"] ?? it["qty"]) - n(it[done]); if (left <= 0) continue; const wh = it[whf] ?? d["set_warehouse"]; if (f["warehouse"] && wh !== f["warehouse"]) continue; if (f["item_code"] && it["item_code"] !== f["item_code"]) continue; const r = get(it["item_code"], wh); r[field] = n(r[field]) + left; } };
      open("Purchase Order", "ordered_qty", "received_qty", "warehouse"); open("Sales Order", "reserved_qty", "delivered_qty", "warehouse"); open("Material Request", "indented_qty", "ordered_qty", "warehouse");
      const rows = [...m.values()].map((r) => ({ ...r, projected_qty: n(r["actual_qty"]) + n(r["planned_qty"]) + n(r["indented_qty"]) + n(r["ordered_qty"]) - n(r["reserved_qty"]) - n(r["reserved_qty_for_production"]) }));
      const keys = ["actual_qty", "planned_qty", "indented_qty", "ordered_qty", "reserved_qty", "reserved_qty_for_production", "projected_qty"];
      const q = (k: string, l: string) => col(k, l, "Float", undefined, 100);
      return { columns: [col("item_code", "Item Code", "Link", "Item"), col("item_name", "Item Name"), col("warehouse", "Warehouse", "Link", "Warehouse"), q("actual_qty", "Actual Qty"), q("planned_qty", "Planned Qty"), q("indented_qty", "Requested Qty"), q("ordered_qty", "Ordered Qty"), q("reserved_qty", "Reserved Qty"), q("reserved_qty_for_production", "Reserved for Production"), q("projected_qty", "Projected Qty")], rows: [...rows, sum(rows, keys, { item_code: "Total" })] };
    },
  },
  "Gross Profit": {
    src: "erpnext/accounts/report/gross_profit/gross_profit.py",
    filters: [...COMMON, { fieldname: "group_by", label: "Group By", fieldtype: "Select", options: ["Invoice", "Item Code", "Item Group", "Customer"], default: "Invoice" }],
    run: (f) => {
      const lines: Row[] = [];
      for (const si of adapter.list("Sales Invoice").filter((d) => sub(d) && (!f["company"] || d["company"] === f["company"]) && inRange(d["posting_date"], f)))
        for (const it of (si["items"] as Doc[] | undefined) ?? []) {
          const qty = n(it["stock_qty"] ?? it["qty"]); const sell = n(it["base_net_amount"] ?? it["amount"]); const br = r2(valRate(it["item_code"])); const buy = r2(br * qty);
          lines.push({ parent: si.name, posting_date: si["posting_date"], customer: si["customer"], item_code: it["item_code"], item_name: itemName(it["item_code"]), item_group: itemGroup(it["item_code"]), qty, base_rate: qty ? r2(sell / qty) : 0, buying_rate: br, selling_amount: r2(sell), buying_amount: buy, gross_profit: r2(sell - buy) });
        }
      const g = f["group_by"] || "Invoice"; const key = g === "Invoice" ? "parent" : g === "Item Code" ? "item_code" : g === "Item Group" ? "item_group" : "customer";
      const by = new Map<string, Row>();
      for (const l of lines) { const k = String(l[key]); const r = by.get(k) ?? { ...l, qty: 0, selling_amount: 0, buying_amount: 0, gross_profit: 0 }; for (const x of ["qty", "selling_amount", "buying_amount", "gross_profit"]) r[x] = r2(n(r[x]) + n(l[x])); by.set(k, r); }
      const rows = [...by.values()].map((r) => ({ ...r, gross_profit_percent: n(r["selling_amount"]) ? r2((n(r["gross_profit"]) / n(r["selling_amount"])) * 100) : 0 }));
      const t = sum(rows, ["qty", "selling_amount", "buying_amount", "gross_profit"], { [key]: "Total" }); t["gross_profit_percent"] = n(t["selling_amount"]) ? r2((n(t["gross_profit"]) / n(t["selling_amount"])) * 100) : 0;
      const head = g === "Invoice" ? [col("parent", "Sales Invoice", "Link", "Sales Invoice"), col("posting_date", "Posting Date", "Date", undefined, 100), col("customer", "Customer", "Link", "Customer")] : [col(key, g, "Link")];
      return { columns: [...head, col("qty", "Qty", "Float", undefined, 80), cur("selling_amount", "Selling Amount"), cur("buying_amount", "Buying Amount"), cur("gross_profit", "Gross Profit"), col("gross_profit_percent", "Gross Profit %", "Percent", undefined, 100)], rows: [...rows, t] };
    },
  },
  "Sales Analytics": { src: "erpnext/selling/report/sales_analytics/sales_analytics.py", filters: [{ fieldname: "tree_type", label: "Tree Type", fieldtype: "Select", options: ["Customer", "Customer Group", "Territory", "Item", "Item Group"], default: "Customer" }, { fieldname: "doc_type", label: "Based On", fieldtype: "Select", options: ["Sales Order", "Delivery Note", "Sales Invoice"], default: "Sales Invoice" }, { fieldname: "value_quantity", label: "Value Or Qty", fieldtype: "Select", options: ["Value", "Quantity"], default: "Value" }, ...COMMON, { fieldname: "range", label: "Range", fieldtype: "Select", options: ["Weekly", "Monthly", "Quarterly", "Yearly"], default: "Monthly" }], run: (f) => analytics(f, "sales") },
  "Purchase Analytics": { src: "erpnext/buying/report/purchase_analytics/purchase_analytics.py", filters: [{ fieldname: "tree_type", label: "Tree Type", fieldtype: "Select", options: ["Supplier", "Supplier Group", "Item", "Item Group"], default: "Supplier" }, { fieldname: "doc_type", label: "Based On", fieldtype: "Select", options: ["Purchase Order", "Purchase Receipt", "Purchase Invoice"], default: "Purchase Invoice" }, { fieldname: "value_quantity", label: "Value Or Qty", fieldtype: "Select", options: ["Value", "Quantity"], default: "Value" }, ...COMMON, { fieldname: "range", label: "Range", fieldtype: "Select", options: ["Weekly", "Monthly", "Quarterly", "Yearly"], default: "Monthly" }], run: (f) => analytics(f, "purchase") },
  "Item-wise Sales Register": {
    src: "erpnext/accounts/report/item_wise_sales_register/item_wise_sales_register.py",
    filters: [...COMMON, { fieldname: "customer", label: "Customer", fieldtype: "Link", options: "Customer" }, { fieldname: "item_code", label: "Item", fieldtype: "Link", options: "Item" }],
    run: (f) => {
      const rows: Row[] = [];
      for (const si of adapter.list("Sales Invoice").filter((d) => sub(d) && (!f["company"] || d["company"] === f["company"]) && inRange(d["posting_date"], f) && (!f["customer"] || d["customer"] === f["customer"])))
        for (const it of (si["items"] as Doc[] | undefined) ?? []) {
          if (f["item_code"] && it["item_code"] !== f["item_code"]) continue;
          const amt = n(it["base_net_amount"] ?? it["amount"]); const share = n(si["net_total"]) ? amt / n(si["net_total"]) : 0; const tax = r2(n(si["total_taxes_and_charges"]) * share);
          rows.push({ item_code: it["item_code"], item_name: itemName(it["item_code"]), item_group: itemGroup(it["item_code"]), invoice: si.name, posting_date: si["posting_date"], customer: si["customer"], customer_name: si["customer_name"], qty: n(it["qty"]), rate: n(it["rate"]), amount: r2(amt), total_tax: tax, total: r2(amt + tax) });
        }
      return { columns: [col("item_code", "Item Code", "Link", "Item"), col("item_name", "Item Name"), col("item_group", "Item Group", "Link", "Item Group"), col("invoice", "Invoice", "Link", "Sales Invoice"), col("posting_date", "Posting Date", "Date", undefined, 100), col("customer", "Customer", "Link", "Customer"), col("qty", "Stock Qty", "Float", undefined, 80), cur("rate", "Rate"), cur("amount", "Amount"), cur("total_tax", "Total Tax"), cur("total", "Total")], rows: [...rows, sum(rows, ["qty", "amount", "total_tax", "total"], { item_code: "Total" })] };
    },
  },
  "Monthly Attendance Sheet": {
    src: "hrms/hr/report/monthly_attendance_sheet/monthly_attendance_sheet.py",
    filters: [{ fieldname: "month", label: "Month", fieldtype: "Select", options: ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"], default: "__month" }, { fieldname: "year", label: "Year", fieldtype: "Data", default: "__year" }, { fieldname: "employee", label: "Employee", fieldtype: "Link", options: "Employee" }, COMMON[0]!, { fieldname: "summarized_view", label: "Summarized View", fieldtype: "Check" }],
    run: (f) => {
      const ym = `${f["year"] || today().slice(0, 4)}-${(f["month"] || today().slice(5, 7)).padStart(2, "0")}`;
      const days = new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0).getDate();
      const ABBR: Record<string, string> = { Present: "P", Absent: "A", "Half Day": "HD", "Work From Home": "WFH", "On Leave": "L" };
      const by = new Map<string, Row>();
      for (const a of adapter.list("Attendance").filter((x) => x.docstatus !== 2 && String(x["attendance_date"]).startsWith(ym) && (!f["employee"] || x["employee"] === f["employee"]) && (!f["company"] || x["company"] === f["company"]))) {
        const r = by.get(String(a["employee"])) ?? { employee: a["employee"], employee_name: a["employee_name"], total_present: 0, total_absent: 0, total_leaves: 0, total_half_days: 0, total_wfh: 0 };
        const s = String(a["status"]); r[`d${Number(String(a["attendance_date"]).slice(8, 10))}`] = ABBR[s] ?? s;
        if (s === "Present") r["total_present"] = n(r["total_present"]) + 1; else if (s === "Absent") r["total_absent"] = n(r["total_absent"]) + 1; else if (s === "On Leave") r["total_leaves"] = n(r["total_leaves"]) + 1; else if (s === "Half Day") { r["total_half_days"] = n(r["total_half_days"]) + 1; r["total_present"] = n(r["total_present"]) + 0.5; } else if (s === "Work From Home") { r["total_wfh"] = n(r["total_wfh"]) + 1; r["total_present"] = n(r["total_present"]) + 1; }
        by.set(String(a["employee"]), r);
      }
      const rows = [...by.values()].sort((a, b) => String(a["employee"]).localeCompare(String(b["employee"])));
      const tot = [col("total_present", "Total Present", "Float", undefined, 90), col("total_absent", "Total Absent", "Float", undefined, 90), col("total_leaves", "Total Leaves", "Float", undefined, 90), col("total_half_days", "Total Half Days", "Float", undefined, 90)];
      const dayCols = f["summarized_view"] === "1" ? [] : Array.from({ length: days }, (_, i) => col(`d${i + 1}`, String(i + 1), "Data", undefined, 44));
      return { columns: [col("employee", "Employee", "Link", "Employee"), col("employee_name", "Employee Name"), ...dayCols, ...tot], rows };
    },
  },
  "Employee Leave Balance": {
    src: "hrms/hr/report/employee_leave_balance/employee_leave_balance.py",
    filters: [{ fieldname: "from_date", label: "From Date", fieldtype: "Date", default: "__fy_start" }, { fieldname: "to_date", label: "To Date", fieldtype: "Date", default: "__fy_end" }, COMMON[0]!, { fieldname: "employee", label: "Employee", fieldtype: "Link", options: "Employee" }],
    run: (f) => {
      const rows: Row[] = [];
      const alloc = adapter.list("Leave Allocation").filter((a) => a.docstatus === 1 && (!f["employee"] || a["employee"] === f["employee"]) && String(a["to_date"]) >= (f["from_date"] || "") && String(a["from_date"]) <= (f["to_date"] || "9999"));
      const keys = [...new Set(alloc.map((a) => `${a["leave_type"]}|${a["employee"]}`))].sort();
      for (const k of keys) {
        const [lt, emp] = k.split("|");
        const mine = alloc.filter((a) => a["leave_type"] === lt && a["employee"] === emp);
        const opening = mine.filter((a) => String(a["from_date"]) < (f["from_date"] || "")).reduce((s, a) => s + n(a["total_leaves_allocated"]), 0);
        const allocated = mine.filter((a) => String(a["from_date"]) >= (f["from_date"] || "")).reduce((s, a) => s + n(a["new_leaves_allocated"] ?? a["total_leaves_allocated"]), 0);
        const taken = adapter.list("Leave Application").filter((l) => l.docstatus === 1 && l["status"] === "Approved" && l["employee"] === emp && l["leave_type"] === lt && inRange(l["from_date"], f)).reduce((s, l) => s + n(l["total_leave_days"]), 0);
        rows.push({ leave_type: lt, employee: emp, employee_name: adapter.get("Employee", emp!)?.["employee_name"] ?? mine[0]?.["employee_name"], opening_balance: opening, leaves_allocated: allocated, leaves_expired: 0, leaves_taken: taken, closing_balance: r2(opening + allocated - taken) });
      }
      const q = (k: string, l: string) => col(k, l, "Float", undefined, 110);
      return { columns: [col("leave_type", "Leave Type", "Link", "Leave Type"), col("employee", "Employee", "Link", "Employee"), col("employee_name", "Employee Name"), q("opening_balance", "Opening Balance"), q("leaves_allocated", "New Leave(s) Allocated"), q("leaves_expired", "Leave(s) Expired"), q("leaves_taken", "Leave(s) Taken"), q("closing_balance", "Closing Balance")], rows };
    },
  },
  "Salary Register": {
    src: "hrms/payroll/report/salary_register/salary_register.py",
    filters: [...COMMON, { fieldname: "employee", label: "Employee", fieldtype: "Link", options: "Employee" }, { fieldname: "docstatus", label: "Document Status", fieldtype: "Select", options: ["Draft", "Submitted", "Cancelled"], default: "Submitted" }],
    run: (f) => {
      const ds = { Draft: 0, Submitted: 1, Cancelled: 2 }[f["docstatus"] || "Submitted"] ?? 1;
      const slips = adapter.list("Salary Slip").filter((s) => (s.docstatus ?? 0) === ds && (!f["company"] || s["company"] === f["company"]) && (!f["employee"] || s["employee"] === f["employee"]) && (!f["from_date"] || String(s["start_date"]) >= f["from_date"]) && (!f["to_date"] || String(s["end_date"]) <= f["to_date"]));
      const comp = (t: string) => [...new Set(slips.flatMap((s) => ((s[t] as Doc[] | undefined) ?? []).map((x) => String(x["salary_component"]))))];
      const earn = comp("earnings"), ded = comp("deductions"); const key = (c: string) => c.toLowerCase().replace(/[^a-z0-9]+/g, "_");
      const rows: Row[] = slips.map((s) => {
        const r: Row = { salary_slip_id: s.name, employee: s["employee"], employee_name: s["employee_name"], department: s["department"], start_date: s["start_date"], end_date: s["end_date"], payment_days: s["payment_days"], gross_pay: n(s["gross_pay"]), total_deduction: n(s["total_deduction"]), net_pay: n(s["net_pay"]) };
        for (const t of ["earnings", "deductions"]) for (const x of (s[t] as Doc[] | undefined) ?? []) r[key(String(x["salary_component"]))] = n(r[key(String(x["salary_component"]))]) + n(x["amount"]);
        return r;
      });
      const money = [...earn.map(key), "gross_pay", ...ded.map(key), "total_deduction", "net_pay"];
      return { columns: [col("salary_slip_id", "Salary Slip ID", "Link", "Salary Slip"), col("employee", "Employee", "Link", "Employee"), col("employee_name", "Employee Name"), col("department", "Department", "Link", "Department"), col("start_date", "Start Date", "Date", undefined, 100), col("end_date", "End Date", "Date", undefined, 100), ...earn.map((c) => cur(key(c), c)), cur("gross_pay", "Gross Pay"), ...ded.map((c) => cur(key(c), c)), cur("total_deduction", "Total Deduction"), cur("net_pay", "Net Pay")], rows: [...rows, sum(rows, money, { salary_slip_id: "Total" })],
        checks: [{ label: "Net Pay = Gross Pay − Total Deduction (every slip)", ok: rows.every((r) => Math.abs(n(r["gross_pay"]) - n(r["total_deduction"]) - n(r["net_pay"])) < 0.01), detail: `${rows.length} slips` }] };
    },
  },
};

export function runnerDefaults(name: string): F {
  const fs = RUNNERS[name]?.filters ?? [];
  const o = defaults(fs);
  for (const f of fs) { if (f.default === "__month") o[f.fieldname] = today().slice(5, 7); if (f.default === "__year") o[f.fieldname] = today().slice(0, 4); }
  return o;
}

// Ports of the remaining reports DIGIT links to (accounts / selling & buying / stock, assets & access), merged under
// the same registry so the report workbench, previews and exports run them exactly like the ports above.
import { ACCOUNTS_RUNNERS } from "./reportRunnersAccounts";
import { TRADE_RUNNERS } from "./reportRunnersTrade";
import { STOCK_RUNNERS } from "./reportRunnersStock";
import { MORE_RUNNERS } from "./reportRunnersMore";
import { CORE_RUNNERS } from "./reportRunnersCore";
for (const [k, v] of Object.entries({ ...ACCOUNTS_RUNNERS, ...TRADE_RUNNERS, ...STOCK_RUNNERS, ...MORE_RUNNERS, ...CORE_RUNNERS })) if (!RUNNERS[k]) RUNNERS[k] = v as Runner;
