/**
 * General Ledger — port of erpnext/accounts/report/general_ledger/general_ledger.py (develop: execute, validate_filters,
 * validate_party, set_account_currency, get_gl_entries, get_conditions, get_data_with_opening_closing,
 * get_accountwise_gle, get_result_as_list, get_columns) over the virtual GL Entry rows written by posting.ts.
 *
 * Virtual GL Entry rows do not store `against`, `is_opening`, `voucher_subtype`, `account_currency` or transaction
 * currency amounts, so they are read from the same records ERPNext copies them from at posting time:
 *   against          → the voucher's opposite-side parties/accounts (journal_entry.py set_against_account rule)
 *   is_opening       → the voucher's is_opening field
 *   voucher_subtype  → base_gl_composer.get_voucher_subtype(voucher)
 *   account_currency → Account.account_currency (else the company currency)
 *   *_in_transaction_currency → base_gl_composer.get_value_in_transaction_currency(voucher)
 * User-permission match conditions are applied by the report workbench (session.ts filterReportRows).
 */
import { adapter, type Doc } from "./adapter";
import { customDimensions as dimensionList, withChildren as dimChildren } from "./dimensions";
import { resolveName as RN } from "./rename";

export type F = Record<string, string>;
export interface GlColumn { fieldname: string; label: string; fieldtype: "Data" | "Link" | "Dynamic Link" | "Currency" | "Float" | "Int" | "Date" | "Percent"; options?: string; width?: number; hidden?: number }
export type GlRow = Record<string, unknown>;
export interface GlResult { columns: GlColumn[]; rows: GlRow[]; error?: string }

/** erpnext.utils.get_party_name (erpnext/public/js/utils.js): the party DocType's display-name field. */
const PARTY_NAME_FIELD: Readonly<Record<string, string>> = { Customer: "customer_name", Supplier: "supplier_name", Employee: "employee_name", Member: "member_name" };
/**
 * general_ledger.js party.on_change: with exactly one party the hidden party_name / tax_id filters take that party's
 * name field and (Customer / Supplier only) tax_id; otherwise both are cleared. They feed only the print header.
 */
export function glPartyFilters(partyType: string | undefined, party: string | undefined): { party_name: string; tax_id: string } {
  const parties = list(party);
  if (!partyType || parties.length !== 1) return { party_name: "", tax_id: "" };
  const d = adapter.get(partyType, parties[0]!);
  const field = PARTY_NAME_FIELD[partyType] ?? "name";
  return {
    party_name: String((field === "name" ? parties[0] : d?.[field]) ?? ""),
    tax_id: partyType === "Customer" || partyType === "Supplier" ? String(d?.["tax_id"] ?? "") : "",
  };
}
const n = (v: unknown) => Number(v) || 0;
const r2 = (x: number) => Math.round(x * 1e6) / 1e6;
/** MultiSelectList filter value (JSON array) or a plain value. */
export function list(v: string | undefined): string[] {
  if (!v) return [];
  if (v.startsWith("[")) { try { const a = JSON.parse(v) as unknown; return Array.isArray(a) ? a.map(String).filter(Boolean) : []; } catch { return []; } }
  return v.split(",").map((x) => x.trim()).filter(Boolean);
}
const CATEGORIES = ["Categorize by Voucher", "Categorize by Voucher (Consolidated)", "Categorize by Account", "Categorize by Party"] as const;

/** Tree descendants including self (get_accounts_with_children / get_cost_centers_with_children via lft/rgt). */
function withChildren(doctype: string, parentField: string, names: string[]): Set<string> {
  const all = adapter.list(doctype);
  const kids = new Map<string, string[]>();
  for (const d of all) { const p = String(d[parentField] ?? ""); if (p) kids.set(p, [...(kids.get(p) ?? []), d.name]); }
  const out = new Set<string>();
  const walk = (x: string) => { if (out.has(x)) return; out.add(x); (kids.get(x) ?? []).forEach(walk); };
  names.map((x) => RN(doctype, x)).forEach(walk);
  return out;
}

/** validate_filters + validate_party + the presentation-currency check in get_columns. Returns the first error. */
export function glValidate(f: F): string | undefined {
  if (!f["company"]) return "Company is mandatory";
  if (!f["from_date"] && !f["to_date"]) return "From Date and To Date are mandatory";
  const accounts = list(f["account"]);
  for (const a of accounts) if (!adapter.get("Account", RN("Account", a))) return `Account ${a} does not exists`;
  const cat = f["categorize_by"] || (f["group_by"] ? f["group_by"].replace("Group by", "Categorize by") : "");
  if (accounts.length && cat === "Categorize by Account") for (const a of accounts) if (!n(adapter.get("Account", RN("Account", a))?.["is_group"])) return "Can not filter based on Child Account, if grouped by Account";
  if (f["voucher_no"] && cat === "Categorize by Voucher") return "Can not filter based on Voucher No, if grouped by Voucher";
  if (f["from_date"] && f["to_date"] && f["from_date"] > f["to_date"]) return "From Date must be before To Date";
  const pt = f["party_type"];
  if (pt) for (const p of list(f["party"])) if (!adapter.get(pt, p)) return `Invalid ${pt}: ${p}`;
  const companyCurrency = String(adapter.get("Company", f["company"])?.["default_currency"] ?? "");
  if (n(f["show_amount_in_company_currency"]) && f["presentation_currency"] && f["presentation_currency"] !== companyCurrency) return `Presentation Currency cannot be ${f["presentation_currency"]}, when Show Credit / Debit in Company Currency is enabled.`;
  if (f["finance_book"] && n(f["include_default_book_entries"])) {
    const fb = String(adapter.get("Company", f["company"])?.["default_finance_book"] ?? "");
    if (fb && f["finance_book"] !== fb) return "To use a different finance book, please uncheck 'Include Default FB Entries'";
  }
  return undefined;
}

const voucherCache = new Map<string, Doc | undefined>();
const voucher = (vt: unknown, vn: unknown) => { const k = `${vt}\u0000${vn}`; if (!voucherCache.has(k)) voucherCache.set(k, adapter.get(String(vt ?? ""), String(vn ?? ""))); return voucherCache.get(k); };
/** base_gl_composer.get_voucher_subtype */
export function voucherSubtype(vt: string, d: Doc | undefined): string {
  if (!d) return "";
  const field = ({ "Journal Entry": "voucher_type", "Payment Entry": "payment_type", "Stock Entry": "stock_entry_type", "Asset Capitalization": "entry_type" } as Record<string, string>)[vt];
  if (field) return String(d[field] ?? "");
  if (vt === "Purchase Receipt" && n(d["is_return"])) return "Purchase Return";
  if (vt === "Delivery Note" && n(d["is_return"])) return "Sales Return";
  if (vt === "Sales Invoice" && n(d["is_return"])) return "Credit Note";
  if (vt === "Sales Invoice" && n(d["is_debit_note"])) return "Debit Note";
  if (vt === "Purchase Invoice" && n(d["is_return"])) return "Debit Note";
  return "";
}

interface Gle extends Record<string, unknown> { gl_entry: string; posting_date: string; account: string; debit: number; credit: number; debit_in_account_currency: number; credit_in_account_currency: number; is_opening: string; creation: string }

/** get_gl_entries + get_conditions over the virtual ledger. */
export function glEntries(f: F): Gle[] {
  voucherCache.clear();
  const company = f["company"] ?? "";
  const accounts = list(f["account"]); const accSet = accounts.length ? withChildren("Account", "parent_account", accounts) : null;
  const ccs = list(f["cost_center"]); const ccSet = ccs.length ? withChildren("Cost Center", "parent_cost_center", ccs) : null;
  const projects = new Set(list(f["project"]));
  const parties = new Set(list(f["party"]));
  const cat = f["categorize_by"] ?? "";
  const ignoreIsOpening = n(adapter.get("Accounts Settings", "Accounts Settings")?.["ignore_is_opening_check_for_reporting"]);
  const companyFb = String(adapter.get("Company", company)?.["default_finance_book"] ?? "");
  const all = adapter.list("GL Entry").filter((g) => g["company"] === company);
  // ignore_err / ignore_cr_dr_notes: Journal Entries excluded by voucher_type (and is_system_generated for notes)
  const excluded = new Set<string>();
  if (n(f["ignore_err"]) || n(f["ignore_cr_dr_notes"])) for (const je of adapter.list("Journal Entry")) {
    if (je.docstatus !== 1 || je["company"] !== company) continue;
    const vt = String(je["voucher_type"] ?? "");
    if (n(f["ignore_err"]) && (vt === "Exchange Rate Revaluation" || vt === "Exchange Gain Or Loss")) excluded.add(je.name);
    if (n(f["ignore_cr_dr_notes"]) && (vt === "Credit Note" || vt === "Debit Note") && n(je["is_system_generated"])) excluded.add(je.name);
  }
  // accounting dimension filters (MultiSelectList, tree dimensions include their children)
  const dims: [string, Set<string>][] = dimensionList().flatMap((dm) => { const vs = list(f[dm.fieldname]); if (!vs.length) return []; const ok = new Set<string>(); vs.forEach((v) => dimChildren(dm.document_type, v).forEach((x) => ok.add(x))); return [[dm.fieldname, ok] as [string, Set<string>]]; });
  const openingBalanceByAccountOrParty = !!(accounts.length || parties.size || cat === "Categorize by Account" || cat === "Categorize by Party");
  const out: Gle[] = [];
  for (const g of all) {
    if (!n(f["show_cancelled_entries"]) && n(g["is_cancelled"])) continue;
    if (accSet && !accSet.has(String(g["account"]))) continue;
    if (ccSet && !ccSet.has(String(g["cost_center"] ?? ""))) continue;
    if (f["voucher_no"] && g["voucher_no"] !== f["voucher_no"]) continue;
    if (f["against_voucher_no"] && g["against_voucher"] !== f["against_voucher_no"]) continue;
    if (excluded.has(String(g["voucher_no"]))) continue;
    if (cat === "Categorize by Party" && !f["party_type"] && !["Customer", "Supplier"].includes(String(g["party_type"] ?? ""))) continue;
    if (f["party_type"] && g["party_type"] !== f["party_type"]) continue;
    if (parties.size && !parties.has(String(g["party"] ?? ""))) continue;
    const v = voucher(g["voucher_type"], g["voucher_no"]);
    const isOpening = String(g["is_opening"] ?? v?.["is_opening"] ?? "No") === "Yes" ? "Yes" : "No";
    const d = String(g["posting_date"] ?? "");
    const from = f["from_date"] ?? "", to = f["to_date"] ?? "";
    const openOk = !ignoreIsOpening && isOpening === "Yes";
    if (n(f["disable_opening_balance_calculation"]) || !openingBalanceByAccountOrParty) { if (from && d < from && !openOk) continue; }
    if (to && d > to && !openOk) continue;
    if (projects.size && !projects.has(String(g["project"] ?? ""))) continue;
    const fb = String(g["finance_book"] ?? "");
    if (n(f["include_default_book_entries"])) { if (fb && fb !== (f["finance_book"] || companyFb)) continue; }
    else if (fb && fb !== (f["finance_book"] ?? "")) continue;
    if (!dims.every(([field, ok]) => ok.has(String(g[field] ?? "")))) continue;
    out.push({ ...g, gl_entry: g.name, posting_date: d, account: String(g["account"]), debit: n(g["debit"]), credit: n(g["credit"]),
      debit_in_account_currency: n(g["debit_in_account_currency"] ?? g["debit"]), credit_in_account_currency: n(g["credit_in_account_currency"] ?? g["credit"]),
      is_opening: isOpening, creation: String(g["creation"] ?? ""), voucher_subtype: String(g["voucher_subtype"] ?? voucherSubtype(String(g["voucher_type"]), v)),
      account_currency: String(g["account_currency"] ?? adapter.get("Account", String(g["account"]))?.["account_currency"] ?? adapter.get("Company", company)?.["default_currency"] ?? ""),
      remarks: String(g["remarks"] ?? v?.["remarks"] ?? v?.["user_remark"] ?? "") });
  }
  // order_by_statement
  const key = (g: Gle): (string)[] => cat === "Categorize by Voucher" ? [g.posting_date, String(g["voucher_type"]), String(g["voucher_no"])]
    : cat === "Categorize by Account" ? [g.account, g.posting_date, g.creation, g.gl_entry]
    : n(f["include_dimensions"]) ? [g.posting_date, g.creation, g.gl_entry] : [g.posting_date, g.account, g.creation, g.gl_entry];
  out.sort((a, b) => { const ka = key(a), kb = key(b); for (let i = 0; i < ka.length; i++) { const c = (ka[i] ?? "").localeCompare(kb[i] ?? ""); if (c) return c; } return 0; });
  // against (opposite side of the same voucher), party_name, bill_no
  const byVoucher = new Map<string, Doc[]>();
  for (const g of adapter.list("GL Entry")) { if (n(g["is_cancelled"]) && !n(f["show_cancelled_entries"])) continue; const k = `${g["voucher_type"]}\u0000${g["voucher_no"]}`; byVoucher.set(k, [...(byVoucher.get(k) ?? []), g]); }
  const partyName = (pt: string, p: string) => { const d = adapter.get(pt, p); return String(d?.[pt === "Customer" ? "customer_name" : pt === "Supplier" ? "supplier_name" : pt === "Employee" ? "employee_name" : "name"] ?? p); };
  for (const g of out) {
    if (g["against"] === undefined || g["against"] === "") {
      const same = byVoucher.get(`${g["voucher_type"]}\u0000${g["voucher_no"]}`) ?? [];
      const opp = same.filter((o) => (g.debit > 0 ? n(o["credit"]) > 0 : n(o["debit"]) > 0));
      g["against"] = [...new Set(opp.map((o) => String(o["party"] || o["account"])))].join(", ");
    }
    if (g["party_type"] && g["party"]) g["party_name"] = partyName(String(g["party_type"]), String(g["party"]));
    const inv = g["against_voucher"] ? adapter.get("Purchase Invoice", String(g["against_voucher"])) : undefined;
    g["bill_no"] = inv && inv.docstatus === 1 ? String(inv["bill_no"] ?? "") : "";
    if (n(f["add_values_in_transaction_currency"])) {
      const v = voucher(g["voucher_type"], g["voucher_no"]);
      const cur = String(v?.["currency"] ?? g["account_currency"] ?? "");
      const rate = n(v?.["conversion_rate"]) || 1;
      g["transaction_currency"] = cur;
      g["debit_in_transaction_currency"] = g["account_currency"] === cur ? g.debit_in_account_currency : r2(g.debit / rate);
      g["credit_in_transaction_currency"] = g["account_currency"] === cur ? g.credit_in_account_currency : r2(g.credit / rate);
    }
  }
  return out;
}

/** Currency Exchange rate on/before date (erpnext.setup.utils.get_exchange_rate over Currency Exchange records). */
function exchangeRate(from: string, to: string, date: string): number | undefined {
  if (from === to) return 1;
  const xs = adapter.list("Currency Exchange").filter((x) => String(x["date"] ?? "") <= date);
  const direct = xs.filter((x) => x["from_currency"] === from && x["to_currency"] === to).sort((a, b) => String(b["date"]).localeCompare(String(a["date"])))[0];
  if (direct) return n(direct["exchange_rate"]) || undefined;
  const inv = xs.filter((x) => x["from_currency"] === to && x["to_currency"] === from).sort((a, b) => String(b["date"]).localeCompare(String(a["date"])))[0];
  return inv && n(inv["exchange_rate"]) ? 1 / n(inv["exchange_rate"]) : undefined;
}

type Tot = { debit: number; credit: number; debit_in_account_currency: number; credit_in_account_currency: number; debit_in_transaction_currency: number | null; credit_in_transaction_currency: number | null; account?: string; against_voucher?: string };
const emptyTot = (): Tot => ({ debit: 0, credit: 0, debit_in_account_currency: 0, credit_in_account_currency: 0, debit_in_transaction_currency: null, credit_in_transaction_currency: null });
const totals = () => ({ opening: emptyTot(), total: emptyTot(), closing: emptyTot() });

/** execute(): columns + rows (opening, entries, totals and closing exactly as get_data_with_opening_closing orders them). */
export function generalLedger(f0: F): GlResult {
  const f: F = { ...f0 };
  if (!f["categorize_by"] && f["group_by"]) f["categorize_by"] = f["group_by"].replace("Group by", "Categorize by");
  const columns = glColumns(f);
  const err = glValidate(f);
  if (err) return { columns, rows: [], error: err };
  let entries = glEntries(f);
  const companyCurrency = String(adapter.get("Company", f["company"] ?? "")?.["default_currency"] ?? "");
  const pres = f["presentation_currency"] || companyCurrency;
  if (f["presentation_currency"]) {
    // convert_to_presentation_currency
    const accCurrencies = new Set(entries.map((e) => String(e["account_currency"])));
    const date = f["to_date"] || new Date().toISOString().slice(0, 10);
    const single = accCurrencies.size === 1 && [...accCurrencies][0] === pres && !n(f["show_amount_in_company_currency"]);
    if (!single && pres !== companyCurrency) {
      const rate = exchangeRate(companyCurrency, pres, date);
      if (!rate) return { columns, rows: [], error: `Unable to find exchange rate for ${companyCurrency} to ${pres} on ${date}` };
      entries = entries.map((e) => ({ ...e, debit: e.debit ? r2(e.debit * rate) : 0, credit: e.credit ? r2(e.credit * rate) : 0 }));
    } else if (single) entries = entries.map((e) => ({ ...e, debit: e.debit_in_account_currency, credit: e.credit_in_account_currency }));
  }
  const cat = f["categorize_by"] ?? "";
  const consolidated = cat === "Categorize by Voucher (Consolidated)";
  const groupFields = cat === "Categorize by Party" ? ["party_type", "party"] : consolidated || cat === "Categorize by Account" ? ["account"] : ["voucher_type", "voucher_no"];
  const gv = (g: Gle) => groupFields.map((x) => String(g[x] ?? "")).join("\u0000");
  const map = new Map<string, { totals: ReturnType<typeof totals>; entries: Gle[] }>();
  for (const g of entries) if (!map.has(gv(g))) map.set(gv(g), { totals: totals(), entries: [] });
  const accountType = n(f["show_net_values_in_party_account"]) ? new Map(adapter.list("Account").filter((a) => a["company"] === f["company"]).map((a) => [a.name, String(a["account_type"] ?? "")])) : null;
  const addTx = !!n(f["add_values_in_transaction_currency"]);
  const update = (data: Tot, key: "opening" | "total" | "closing" | null, g: Gle, showNet = false) => {
    data.debit += g.debit; data.credit += g.credit;
    data.debit_in_account_currency += g.debit_in_account_currency; data.credit_in_account_currency += g.credit_in_account_currency;
    if (addTx && key === null) { data.debit_in_transaction_currency = n(data.debit_in_transaction_currency) + n(g["debit_in_transaction_currency"]); data.credit_in_transaction_currency = n(data.credit_in_transaction_currency) + n(g["credit_in_transaction_currency"]); }
    const at = accountType?.get(String(data.account ?? ""));
    if ((accountType && (at === "Receivable" || at === "Payable")) || showNet) {
      const net = data.debit - data.credit, netAc = data.debit_in_account_currency - data.credit_in_account_currency;
      const [side, rev] = net < 0 ? (["credit", "debit"] as const) : (["debit", "credit"] as const);
      data[side] = Math.abs(net); data[`${side}_in_account_currency`] = Math.abs(netAc); data[rev] = 0; data[`${rev}_in_account_currency`] = 0;
    }
    if (data.against_voucher && g["against_voucher"]) data.against_voucher += `, ${g["against_voucher"]}`;
  };
  const from = f["from_date"] ?? "", to = f["to_date"] ?? "";
  const showOpening = !!n(f["show_opening_entries"]); const disableOpening = !!n(f["disable_opening_balance_calculation"]);
  const T = totals(); const consolidatedMap = new Map<string, Gle>();
  const dims = n(f["include_dimensions"]) ? dimensionList().map((d) => d.fieldname) : [];
  const immutable = !!n(adapter.get("Accounts Settings", "Accounts Settings")?.["enable_immutable_ledger"]);
  for (const g of entries) {
    const grp = map.get(gv(g))!;
    if (g.posting_date < from || (g.is_opening === "Yes" && !showOpening && !disableOpening)) {
      if (!consolidated) { update(grp.totals.opening, "opening", g, true); update(grp.totals.closing, "closing", g, true); }
      update(T.opening, "opening", g, true); update(T.closing, "closing", g, true);
    } else if (g.posting_date <= to || (g.is_opening === "Yes" && showOpening)) {
      if (!consolidated) {
        update(grp.totals.total, "total", g); update(grp.totals.closing, "closing", g);
        update(T.total, "total", g); update(T.closing, "closing", g);
        grp.entries.push(g);
      } else {
        const k = [g.posting_date, g["voucher_type"], g["voucher_no"], g.account, g["party_type"], g["party"], ...(immutable ? [g.creation] : []), ...(dims.length ? [...dims.map((d) => g[d]), g["cost_center"], g["project"]] : [])].map((x) => String(x ?? "")).join("\u0000");
        const prev = consolidatedMap.get(k);
        if (!prev) consolidatedMap.set(k, { ...g });
        else update(prev as unknown as Tot, null, g);
      }
    }
  }
  const consolidatedEntries: Gle[] = [];
  for (const v of consolidatedMap.values()) { update(T.total, "total", v); update(T.closing, "closing", v); consolidatedEntries.push(v); }
  const LABEL = { opening: "'Opening'", total: "'Total'", closing: "'Closing (Opening + Total)'" } as const;
  const data: GlRow[] = [];
  const addTotal = (t: ReturnType<typeof totals>, key: keyof typeof LABEL) => data.push({ ...t[key], account: LABEL[key], is_total: true, bold: true, total_kind: key });
  addTotal(T, "opening");
  if (!cat) { for (const g of map.values()) data.push(...g.entries); }
  else if (!consolidated) {
    const setOC = cat !== "Categorize by Voucher"; const setTotal = true;
    for (const g of map.values()) {
      if (!g.entries.length) continue;
      data.push({ debit_in_transaction_currency: null, credit_in_transaction_currency: null, is_blank: true });
      if (setOC) addTotal(g.totals, "opening");
      data.push(...g.entries);
      if (setTotal) addTotal(g.totals, "total");
      if (setOC) addTotal(g.totals, "closing");
    }
    data.push({ debit_in_transaction_currency: null, credit_in_transaction_currency: null, is_blank: true });
  } else data.push(...consolidatedEntries);
  addTotal(T, "total"); addTotal(T, "closing");
  // get_result_as_list: running balance, reset by every row without a posting date
  let bal = 0;
  for (const d of data) {
    if (!d["posting_date"]) bal = 0;
    bal += n(d["debit"]) - n(d["credit"]);
    d["balance"] = Math.round(bal * 100) / 100;
    d["debit"] = Math.round(n(d["debit"]) * 100) / 100; d["credit"] = Math.round(n(d["credit"]) * 100) / 100;
    d["presentation_currency"] = pres;
  }
  return { columns, rows: data };
}

/** get_columns(filters) */
export function glColumns(f: F): GlColumn[] {
  const company = f["company"] ?? "";
  const currency = f["presentation_currency"] || String(adapter.get("Company", company)?.["default_currency"] ?? "");
  const c = (fieldname: string, label: string, fieldtype: GlColumn["fieldtype"] = "Data", options?: string, width = 100, hidden?: number): GlColumn => ({ fieldname, label, fieldtype, width, ...(options ? { options } : {}), ...(hidden ? { hidden } : {}) });
  const cols: GlColumn[] = [
    c("gl_entry", "GL Entry", "Link", "GL Entry", 100, 1),
    c("posting_date", "Posting Date", "Date", undefined, 120),
    c("account", "Account", "Link", "Account", 180),
    c("debit", `Debit (${currency})`, "Currency", "presentation_currency", 130),
    c("credit", `Credit (${currency})`, "Currency", "presentation_currency", 130),
    c("balance", `Balance (${currency})`, "Currency", "presentation_currency", 130),
  ];
  if (n(f["add_values_in_transaction_currency"])) cols.push(c("debit_in_transaction_currency", "Debit (Transaction)", "Currency", "transaction_currency", 130), c("credit_in_transaction_currency", "Credit (Transaction)", "Currency", "transaction_currency", 130), c("transaction_currency", "Transaction Currency", "Link", "Currency", 70));
  cols.push(c("voucher_type", "Voucher Type", "Link", "DocType", 120), c("voucher_subtype", "Voucher Subtype", "Data", undefined, 180), c("voucher_no", "Voucher No", "Dynamic Link", "voucher_type", 180), c("against", "Against Account", "Data", undefined, 120), c("party_type", "Party Type", "Data", undefined, 100), c("party", "Party", "Data", undefined, 100));
  const supp = String(adapter.get("Buying Settings", "Buying Settings")?.["supp_master_name"] ?? "Supplier Name");
  const cust = String(adapter.get("Selling Settings", "Selling Settings")?.["cust_master_name"] ?? "Customer Name");
  if (supp !== "Supplier Name" || cust !== "Customer Name") cols.push(c("party_name", "Party Name", "Data", undefined, 150));
  if (n(f["include_dimensions"])) {
    cols.push(c("project", "Project", "Link", "Project"));
    for (const d of dimensionList()) cols.push(c(d.fieldname, d.label, "Link", d.document_type));
    cols.push(c("cost_center", "Cost Center", "Link", "Cost Center"));
  }
  cols.push(c("against_voucher_type", "Against Voucher Type", "Link", "DocType"), c("against_voucher", "Against Voucher", "Dynamic Link", "against_voucher_type"), c("bill_no", "Supplier Invoice No"));
  if (n(f["show_remarks"])) cols.push(c("remarks", "Remarks", "Data", undefined, 400));
  return cols;
}

/** Filters this port applies (source fieldnames); every other source filter is shown as server-only by the workbench. */
export const GL_APPLIED = ["company", "finance_book", "from_date", "to_date", "account", "voucher_no", "against_voucher_no", "party_type", "party", "categorize_by", "presentation_currency", "cost_center", "project", "include_dimensions", "disable_opening_balance_calculation", "show_opening_entries", "include_default_book_entries", "show_cancelled_entries", "show_net_values_in_party_account", "show_amount_in_company_currency", "add_values_in_transaction_currency", "show_remarks", "ignore_err", "ignore_cr_dr_notes"];
export { CATEGORIES as GL_CATEGORIES };
