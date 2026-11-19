/**
 * Accounting Dimensions — port of erpnext/accounts/doctype/accounting_dimension/accounting_dimension.py
 * (validate, make_dimension_in_accounting_doctypes, get_accounting_dimensions, get_dimensions /
 * get_checks_for_pl_and_bs_accounts), accounting_dimension_filter.py (get_dimension_filter_map) and
 * general_ledger.py validate_dimensions_for_pl_and_bs / validate_allowed_dimensions.
 * Cost Center and Project are the built-in dimensions; configured ones add Custom Field records (live overlay),
 * so forms, child grids, GL Entry and report filters all read the same field.
 */
import { adapter, registerDocHook, type Doc } from "./adapter";
import { resolveName } from "./rename";

const n = (v: unknown) => Number(v) || 0;
const rows = (d: Doc, f: string) => ((d[f] as Record<string, unknown>[] | undefined) ?? []);
export const scrub = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
const sameCo = (a: unknown, b: unknown) => resolveName("Company", String(a ?? "")) === resolveName("Company", String(b ?? ""));

/** accounting_dimension.py get_doctypes_with_dimensions (parents and child rows carrying dimensions). */
export const DIMENSION_DOCTYPES = ["GL Entry", "Sales Invoice", "Sales Invoice Item", "Purchase Invoice", "Purchase Invoice Item", "Payment Entry", "Journal Entry", "Journal Entry Account",
  "Sales Order", "Sales Order Item", "Purchase Order", "Purchase Order Item", "Delivery Note", "Delivery Note Item", "Purchase Receipt", "Purchase Receipt Item", "Stock Entry", "Stock Entry Detail",
  "Material Request", "Material Request Item", "Asset", "Budget", "Payment Reconciliation", "Opening Invoice Creation Tool", "Opening Invoice Creation Tool Item"];
const BUILTIN = [{ fieldname: "cost_center", document_type: "Cost Center", label: "Cost Center" }, { fieldname: "project", document_type: "Project", label: "Project" }];
export interface Dim { fieldname: string; document_type: string; label: string; name?: string }

/** get_accounting_dimensions (enabled only) — configured dimensions. */
export const customDimensions = (): Dim[] => adapter.list("Accounting Dimension").filter((d) => !n(d["disabled"]) && d["document_type"])
  .map((d) => ({ name: d.name, fieldname: String(d["fieldname"] || scrub(String(d["document_type"]))), document_type: String(d["document_type"]), label: String(d["label"] || d["document_type"]) }));
/** Built-in (cost_center, project) + configured dimensions. */
export const allDimensions = (): Dim[] => [...BUILTIN, ...customDimensions()];

/** Dimension values a ledger line carries: row value, else the document header value (accounts_controller get_gl_dict). */
export function rowDims(x: Record<string, unknown> | undefined, d: Doc): Record<string, string> {
  const o: Record<string, string> = {};
  for (const { fieldname } of allDimensions()) { const v = x?.[fieldname] ?? d[fieldname]; if (v) o[fieldname] = String(v); }
  return o;
}

/** accounting_dimension.py validate + on_update (make_dimension_in_accounting_doctypes as Custom Field records). */
registerDocHook("Accounting Dimension", (doc, before) => {
  const errors: string[] = []; const dt = String(doc["document_type"] ?? "");
  if (["Cost Center", "Accounting Dimension", "Project"].includes(dt)) errors.push(`Not allowed to create accounting dimension for ${dt}`);
  const fieldname = String(doc["fieldname"] || scrub(dt));
  if (dt && adapter.list("Accounting Dimension").some((x) => x.name !== doc.name && x.name !== before?.name && x["document_type"] === dt)) errors.push(`Accounting Dimension ${dt} already exists`);
  for (const r of rows(doc, "dimension_defaults")) if (r["default_dimension"] && dt && !adapter.get(dt, resolveName(dt, String(r["default_dimension"])))) errors.push(`Default dimension ${r["default_dimension"]} is not a valid ${dt}`);
  return { doc: { ...doc, fieldname, label: doc["label"] || dt }, errors, after: (d) => {
    if (n(d["disabled"]) || !dt) return;
    for (const target of DIMENSION_DOCTYPES) {
      const name = `${target}-${fieldname}`; if (adapter.get("Custom Field", name)) continue;
      adapter.insertDocQuiet("Custom Field", { name, dt: target, fieldname, label: String(d["label"] || dt), fieldtype: "Link", options: dt, insert_after: target === "GL Entry" ? "project" : "cost_center", in_list_view: 0, reqd: 0, owner: "Administrator", is_system_generated: 1 });
    }
  } };
});

/** Company default dimension values (dimension_defaults.default_dimension) — set on new accounting documents. */
export function defaultDims(company: unknown): Record<string, string> {
  const o: Record<string, string> = {};
  for (const ad of adapter.list("Accounting Dimension")) { if (n(ad["disabled"])) continue; const r = rows(ad, "dimension_defaults").find((x) => sameCo(x["company"], company)); if (r?.["default_dimension"]) o[String(ad["fieldname"])] = String(r["default_dimension"]); }
  return o;
}

type GlLine = { account: string; cost_center?: string; project?: string; dims?: Record<string, string> };
/** Ledger-time checks: mandatory for BS/PL (company defaults), value exists / enabled / same company, Accounting Dimension Filter allow/restrict. */
export function dimensionErrors(d: Doc, lines: GlLine[]): string[] {
  const e = new Set<string>(); const company = d["company"]; if (d["doctype"] === "Period Closing Voucher") return [];
  const dims = allDimensions();
  const filters = adapter.list("Accounting Dimension Filter").filter((f) => !n(f["disabled"]) && (!f["company"] || sameCo(f["company"], company)));
  for (const l of lines) {
    const acc = adapter.get("Account", l.account); const rt = String(acc?.["root_type"] ?? ""); const pl = rt === "Income" || rt === "Expense";
    const val = (fn: string) => String(l.dims?.[fn] ?? (fn === "cost_center" ? l.cost_center : fn === "project" ? l.project : "") ?? "");
    for (const dm of dims) {
      const v = val(dm.fieldname);
      if (!v) {
        const ad = adapter.list("Accounting Dimension").find((x) => x.name === dm.name); const r = ad ? rows(ad, "dimension_defaults").find((x) => sameCo(x["company"], company)) : undefined;
        if (r && ((pl && n(r["mandatory_for_pl"])) || (!pl && n(r["mandatory_for_bs"])))) e.add(`Accounting Dimension ${dm.label} is required for '${pl ? "Profit and Loss" : "Balance Sheet"}' account ${l.account}.`);
        continue;
      }
      const rec = adapter.get(dm.document_type, resolveName(dm.document_type, v));
      if (!rec) { e.add(`${dm.label} ${v} does not exist`); continue; }
      if (n(rec["disabled"]) || (dm.document_type === "Project" && rec["status"] === "Cancelled")) e.add(`${dm.label} ${v} is disabled`);
      if (rec["company"] && company && !sameCo(rec["company"], company)) e.add(`${dm.label} ${v} does not belong to Company ${company}`);
      if (dm.fieldname === "cost_center" && n(rec["is_group"])) e.add(`Cost Center ${v} is a group cost center and group cost centers cannot be used in transactions`);
    }
    for (const f of filters) {
      const fn = String(f["fieldname"] || scrub(String(f["accounting_dimension"] ?? "")));
      const accRow = rows(f, "accounts").find((a) => resolveName("Account", String(a["applicable_on_account"])) === l.account); if (!accRow) continue;
      const v = val(fn); const label = String(f["accounting_dimension"] ?? fn);
      if (!v) { if (n(accRow["is_mandatory"])) e.add(`${label} is mandatory for account ${l.account}`); continue; }
      if (!n(f["apply_restriction_on_values"])) continue;
      const allowed = rows(f, "dimensions").map((x) => String(x["dimension_value"]));
      const inList = allowed.includes(v) || allowed.map((a) => resolveName(String(f["accounting_dimension"]), a)).includes(v);
      if ((f["allow_or_restrict"] ?? "Allow") === "Allow" ? !inList : inList) e.add(`Invalid value ${v} for ${label} against account ${l.account}`);
    }
  }
  return [...e];
}

/** Report filter: a dimension value plus its tree descendants (financial_statements.py get_dimension_with_children). */
export function withChildren(doctype: string, value: string): Set<string> {
  const parentField = `parent_${scrub(doctype)}`; const out = new Set([value, resolveName(doctype, value)]); let grew = true;
  while (grew) { grew = false; for (const r of adapter.list(doctype)) if (!out.has(r.name) && out.has(String(r[parentField] ?? ""))) { out.add(r.name); grew = true; } }
  return out;
}
/** GL Entry passes every dimension filter present in `f`. */
export function dimFilterOk(g: Doc, f: Record<string, string>): boolean {
  for (const dm of allDimensions()) { const v = f[dm.fieldname]; if (!v) continue; if (!withChildren(dm.document_type, v).has(String(g[dm.fieldname] ?? ""))) return false; }
  return true;
}
export const dimReportFilters = () => allDimensions().map((d) => ({ fieldname: d.fieldname, label: d.label, fieldtype: "Link", options: d.document_type }));

/** accounting_dimension.py: new eligible documents get the company default for unset dimensions; a company change
 *  clears dimension values belonging to another company. Submitted documents are never touched. */
const PARENTS = DIMENSION_DOCTYPES.filter((d) => !/ (Item|Detail|Account)$/.test(d) && d !== "GL Entry");
for (const dt of PARENTS) registerDocHook(dt, (doc, before) => {
  if (Number(doc["docstatus"] ?? 0) !== 0 || doc["__synthetic"]) return { doc };
  const out: Doc = { ...doc };
  const coChanged = !!before && !sameCo(before["company"], doc["company"]);
  if (coChanged) for (const dm of customDimensions()) {
    const v = out[dm.fieldname]; if (!v) continue;
    const rec = adapter.get(dm.document_type, resolveName(dm.document_type, String(v)));
    if (rec?.["company"] && !sameCo(rec["company"], doc["company"])) out[dm.fieldname] = "";
  }
  if (!before || coChanged) for (const [k, v] of Object.entries(defaultDims(doc["company"]))) if (!out[k]) out[k] = v;
  return { doc: out };
});

/** Copy dimension values by canonical fieldname (header and source-row identity), never overwriting a target value. */
export function carryDims(src: Record<string, unknown>, target: Record<string, unknown>) {
  for (const { fieldname } of allDimensions()) if (src[fieldname] && !target[fieldname]) target[fieldname] = src[fieldname];
}

/** general_ledger.py make_acc_dimensions_offsetting_entry: dimensions with automatically_post_balancing_accounting_entry
 *  whose values differ across the voucher get swapped legs (amount / (dims+1)) on the offsetting account. */
export function offsettingErrors(company: unknown): string[] {
  const e: string[] = [];
  for (const ad of adapter.list("Accounting Dimension")) for (const r of rows(ad, "dimension_defaults")) {
    if (!n(r["automatically_post_balancing_accounting_entry"]) || !sameCo(r["company"], company)) continue;
    const a = adapter.get("Account", resolveName("Account", String(r["offsetting_account"] ?? "")));
    if (!a) e.push(`Offsetting Account is mandatory for Accounting Dimension ${ad.name}`);
    else if (n(a["is_group"]) || !sameCo(a["company"], company)) e.push(`Offsetting Account ${a.name} for ${ad.name} must be a ledger account of Company ${company}`);
  }
  return e;
}
export function offsetLines<L extends { account: string; debit: number; credit: number; dims?: Record<string, string> }>(company: unknown, lines: L[]): L[] {
  const dims = adapter.list("Accounting Dimension").filter((ad) => !n(ad["disabled"])).flatMap((ad) => rows(ad, "dimension_defaults")
    .filter((r) => n(r["automatically_post_balancing_accounting_entry"]) && sameCo(r["company"], company) && r["offsetting_account"])
    .map((r) => ({ name: ad.name, fieldname: String(ad["fieldname"]), account: resolveName("Account", String(r["offsetting_account"])) })))
    .filter((dm) => new Set(lines.map((l) => l.dims?.[dm.fieldname] ?? "")).size > 1);
  if (!dims.length) return lines;
  const k = dims.length + 1; const r2 = (x: number) => Math.round(x * 100) / 100; const out: L[] = [...lines];
  for (const l of lines) for (const dm of dims) out.push({ ...l, account: dm.account, debit: l.credit ? r2(l.credit / k) : 0, credit: l.debit ? r2(l.debit / k) : 0, party_type: "", party: "", against: undefined, remarks: `Offsetting for Accounting Dimension - ${dm.name}` } as L);
  return out;
}
