/**
 * Generic behavior engines driven by declarative data extracted from source
 * (scripts/extract-engines.py → public/catalog/{list_behaviors,form_actions,link_filters,tree_views,connections}.json).
 * Source JS is never executed: list indicators come from get_indicator return filters, form actions from
 * add_custom_button calls, link filters from set_query filter objects.
 */
import { DETAIL } from "./selling";
import { queryOptions } from "@tanstack/react-query";
import { adapter, type Doc } from "@/lib/adapter";
import { carryDims } from "@/lib/dimensions";
import { matchFilter, type Filter } from "@/lib/desk";
import { LAYOUT_TYPES, TABLE_TYPES, type DocTypeMeta } from "@/lib/catalog";

export interface IndicatorRule { label: string; color: string; filter: string }
export interface ListBehavior { source: string; indicators: IndicatorRule[]; add_fields: string[]; has_indicator_for_draft: boolean; button: string | null; onload_actions: string[]; hide_name_column: boolean }
export interface Cond { field: string; op: string; value?: string | string[] }
export interface FormAction { label: string; group: string | null; conditions: Cond[]; target: string | null; method: string | null; source: string; kind?: "create" | "route"; field_map?: Record<string, string>; route_filters?: Record<string, { field?: string; value?: string }> }
export interface LinkFilter { field: string; child_table: string | null; filters: Record<string, string | [string, string]>; server_query: string | null; source: string }
export interface TreeView { source: string | null; breadcrumb: string | null; root_label: string | null; get_tree_nodes?: string | null; server_dependent: boolean }

type Wrapped<T> = { doctypes: Record<string, T> };
const j = async <T,>(u: string) => ((await (await fetch(u)).json()) as Wrapped<T>).doctypes;
const o = { staleTime: Infinity, gcTime: Infinity } as const;
export const listBehaviorsQuery = queryOptions({ queryKey: ["eng-list"], queryFn: () => j<ListBehavior>("/catalog/list_behaviors.json"), ...o });
export const formActionsQuery = queryOptions({ queryKey: ["eng-actions"], queryFn: () => j<FormAction[]>("/catalog/form_actions.json"), ...o });
export const linkFiltersQuery = queryOptions({ queryKey: ["eng-links"], queryFn: () => j<LinkFilter[]>("/catalog/link_filters.json"), ...o });
export const treeViewsQuery = queryOptions({ queryKey: ["eng-trees"], queryFn: () => j<TreeView>("/catalog/tree_views.json"), ...o });

const today = () => new Date().toISOString().slice(0, 10);

/** Frappe filter string "a,=,b|c,<,Today" → Filter[] */
export function parseFilterString(s: string): Filter[] {
  return s.split("|").filter(Boolean).map((p) => {
    const [f = "", op = "=", ...rest] = p.split(",");
    let v: string = rest.join(",");
    if (v === "Today") v = today();
    return [f, op, v] as Filter;
  });
}

/** listview get_indicator equivalent: docstatus states first, then the first source rule whose filter matches. */
export function indicatorFor(meta: DocTypeMeta, lb: ListBehavior | undefined, d: Doc): { label: string; color: string; source: string } | null {
  const ds = d.docstatus ?? 0;
  if (meta.is_submittable && ds === 2) return { label: "Cancelled", color: "red", source: "frappe docstatus" };
  if (meta.is_submittable && ds === 0 && !lb?.has_indicator_for_draft) return { label: "Draft", color: "red", source: "frappe docstatus" };
  for (const r of lb?.indicators ?? []) {
    const fs = parseFilterString(r.filter);
    if (fs.length && fs.every((f) => matchFilter(d, f))) return { label: r.label, color: r.color, source: lb!.source };
  }
  if (meta.is_submittable && ds === 1) return { label: "Submitted", color: "blue", source: "frappe docstatus" };
  if (typeof d["status"] === "string" && d["status"]) return { label: String(d["status"]), color: "gray", source: "status field" };
  return null;
}

export const COLOR_CLASS: Record<string, string> = {
  red: "bg-destructive/15 text-destructive", green: "bg-success/20", orange: "bg-warning/25", yellow: "bg-warning/20",
  blue: "bg-primary/15 text-primary", gray: "bg-muted", grey: "bg-muted", darkgrey: "bg-muted", purple: "bg-accent", pink: "bg-accent", cyan: "bg-accent",
};

/** Only static docstatus/status conditions are evaluated (other source conditions need controller state). */
export function actionVisible(a: FormAction, d: Doc): boolean {
  return a.conditions.every((c) => {
    if (c.field !== "docstatus" && c.field !== "status") return true;
    const v = c.field === "docstatus" ? String(d.docstatus ?? 0) : String(d["status"] ?? "");
    if (c.op === "in") return Array.isArray(c.value) && c.value.includes(v);
    // source `![..].includes(doc.status)` (e.g. quotation.js: Create ▸ Sales Order unless Lost/Ordered)
    if (c.op === "not in") return Array.isArray(c.value) && !c.value.includes(v);
    if (c.op === "=") return v === String(c.value);
    if (c.op === "!=") return v !== String(c.value);
    if (["<", ">", "<=", ">="].includes(c.op)) return matchFilter(d, [c.field, c.op as Filter[1], String(c.value)]);
    return true;
  });
}

/** Dedupe by group+label, keep the first source occurrence. */
export function formActions(all: FormAction[] | undefined): FormAction[] {
  const seen = new Set<string>(); const out: FormAction[] = [];
  for (const a of all ?? []) { const k = `${a.group ?? ""}::${a.label}`; if (!seen.has(k)) { seen.add(k); out.push(a); } }
  return out;
}

const snake = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "_");
/** sales_order.py get_remaining_qty for Create ▸ Material Request: the row's qty minus what open (not cancelled)
 *  Material Requests already ask for, minus delivered quantity not covered by their receipts — so a second request
 *  never double-counts an order line. */
export function soRemainingToRequest(so: string, r: Doc | Record<string, unknown>): number {
  const req = adapter.list("Material Request").filter((m) => Number(m.docstatus ?? 0) !== 2).flatMap((m) => ((m["items"] as Doc[] | undefined) ?? []))
    .filter((x) => x["sales_order"] === so && (x["sales_order_item"] && r["name"] ? x["sales_order_item"] === r["name"] : x["item_code"] === r["item_code"]));
  const requested = req.reduce((t, x) => t + (Number(x["qty"]) || 0), 0), received = req.reduce((t, x) => t + (Number(x["received_qty"]) || 0), 0);
  const left = (Number(r["qty"]) || 0) - requested - Math.max((Number(r["delivered_qty"]) || 0) - received, 0);
  return Math.max(Math.round(left * 1000) / 1000, 0);
}
const NO_COPY = new Set(["name", "naming_series", "docstatus", "status", "amended_from", "creation", "modified", "owner", "idx", "doctype", "workflow_state", "per_billed", "per_delivered", "per_received", "outstanding_amount"]);

/**
 * Local "preview mapping" (get_mapped_doc convention): copies same-named parent fields, child rows of same-named
 * tables with REMAINING qty, and reference fields (e.g. sales_order / against_sales_order / prevdoc_docname).
 */
export function mapDoc(src: DocTypeMeta, d: Doc, target: DocTypeMeta, childMetas: Record<string, DocTypeMeta>, fieldMap?: Record<string, string>): Record<string, unknown> {
  const tf = new Map(target.fields.filter((f) => f.fieldname).map((f) => [f.fieldname!, f]));
  const out: Record<string, unknown> = { __mapped_from: `${src.name}:${d.name}` };
  for (const f of src.fields) {
    const k = f.fieldname; if (!k || NO_COPY.has(k) || LAYOUT_TYPES.has(f.fieldtype)) continue;
    const t = tf.get(k); if (!t || t['no_copy']) continue;
    if (TABLE_TYPES.has(f.fieldtype)) {
      const cm = childMetas[t.options ?? ""]; const rows = Array.isArray(d[k]) ? (d[k] as Doc[]) : [];
      if (!cm) continue;
      const cf = new Set(cm.fields.map((x) => x.fieldname));
      out[k] = rows.map((r, i) => {
        const row: Record<string, unknown> = {};
        for (const [rk, rv] of Object.entries(r)) if (cf.has(rk) && !NO_COPY.has(rk)) row[rk] = rv;
        // mapper convention (e.g. delivery_note.py make_sales_invoice: against_sales_order → sales_order)
        for (const [rk, rv] of Object.entries(r)) if (rk.startsWith("against_") && rv && cf.has(rk.slice(8)) && !row[rk.slice(8)]) row[rk.slice(8)] = rv;
        // remaining qty per target (sales_order.py make_sales_invoice uses unbilled amount; make_delivery_note uses undelivered qty)
        const inv = /Invoice$/.test(target.name), rate = Number(r["rate"]) || 0;
        const done = inv ? (r["billed_amt"] !== undefined && rate ? Number(r["billed_amt"]) / rate : Number(r["billed_qty"] ?? 0))
          : /^(Purchase Order|Sales Order|Supplier Quotation|Request for Quotation)$/.test(target.name) ? Number(r["ordered_qty"] ?? 0)
          : Number(r["delivered_qty"] ?? r["received_qty"] ?? 0);
        if (typeof r["qty"] === "number") row["qty"] = Math.max(0, (r["qty"] as number) - (isNaN(done) ? 0 : done));
        // sales_order.py make_material_request get_remaining_qty: qty − already requested − delivered beyond what the requests received
        if (src.name === "Sales Order" && target.name === "Material Request" && typeof r["qty"] === "number") row["qty"] = soRemainingToRequest(d.name, r);
        for (const ref of [snake(src.name), `against_${snake(src.name)}`, "prevdoc_docname"]) if (cf.has(ref)) row[ref] = d.name;
        if (cf.has(`${snake(src.name)}_item`) && r.name) row[`${snake(src.name)}_item`] = r.name;
        const det = DETAIL[`${src.name}>${target.name}`]; if (det && cf.has(det) && r.name) row[det] = r.name;
        if (cf.has("prevdoc_doctype")) row["prevdoc_doctype"] = src.name;
        // the source table_map field_map is extracted flat with the parent map (e.g. purchase_receipt.py make_purchase_invoice:
        // purchase_order_item → po_detail, name → pr_detail, parent → purchase_receipt), so a pair whose target is a field of
        // this child table applies to every row — the invoice keeps the order line it came from through the receipt
        for (const [a, b] of Object.entries(fieldMap ?? {})) {
          if (!cf.has(b) || (row[b] !== undefined && row[b] !== "")) continue;
          const v = a === "name" ? r.name : a === "parent" ? d.name : r[a]; if (v !== undefined && v !== "" && v !== null) row[b] = v;
        }
        carryDims(r, row); row["idx"] = i + 1; return row;
      }).filter((r) => r["qty"] === undefined || (r["qty"] as number) > 0);
      continue;
    }
    if (d[k] !== undefined && d[k] !== "") out[k] = d[k];
  }
  carryDims(d, out);
  for (const ref of [snake(src.name), `against_${snake(src.name)}`, "reference_name"]) if (tf.has(ref)) out[ref] = d.name;
  if (tf.has("reference_doctype")) out["reference_doctype"] = src.name;
  // source get_mapped_doc field_map / set_missing_values (target.x = source.y), from form_actions.json
  for (const [a, b] of Object.entries(fieldMap ?? {})) { const v = a === "name" ? d.name : d[a]; if (tf.has(b) && v !== undefined && v !== "") out[b] = v; }
  if (tf.has("party_type") && (d["customer"] || d["supplier"] || d["employee"])) {
    out["party_type"] = d["customer"] ? "Customer" : d["supplier"] ? "Supplier" : "Employee";
    out["party"] = d["customer"] ?? d["supplier"] ?? d["employee"];
  }
  return out;
}

/**
 * Local ports of the most common server-side set_query handlers (erpnext/controllers/queries.py etc.).
 * Keyed by the trailing method name of the dotted server path. Each returns the equivalent adapter filters;
 * an empty array means "no restriction" (the source query returns everything, e.g. company_query).
 */
export const LOCAL_SERVER_QUERIES: Record<string, (doc: Doc) => Filter[]> = {
  item_query: () => [["disabled", "=", "0"]],
  subcontracted_item_query: () => [["disabled", "=", "0"]],
  get_item_uom_query: (d) => (d["item_code"] ? [["parent", "=", String(d["item_code"])]] : []),
  employee_query: () => [["status", "=", "Active"]],
  get_approvers: () => [["status", "=", "Active"]],
  user_query: () => [["enabled", "=", "1"]],
  company_query: () => [],
  get_project_name: () => [],
  // erpnext.setup.doctype.party_type.party_type.get_party_type: a Receivable/Payable account narrows Party Type by its account_type
  get_party_type: (d) => { const t = d["account"] ? String(adapter.get("Account", String(d["account"]))?.["account_type"] ?? "") : ""; return t === "Receivable" || t === "Payable" ? [["account_type", "=", t]] : []; },
  get_salary_component: () => [],
  filter_dynamic_link_doctypes: () => [],
  get_batch_no: (d) => (d["item_code"] ? [["item", "=", String(d["item_code"])]] : []),
  get_expense_account: (d) => (d["company"] ? [["company", "=", String(d["company"])], ["is_group", "=", "0"]] : [["is_group", "=", "0"]]),
  get_income_account: (d) => (d["company"] ? [["company", "=", String(d["company"])], ["is_group", "=", "0"]] : [["is_group", "=", "0"]]),
  bom: (d) => (d["item_code"] ? [["item", "=", String(d["item_code"])], ["is_active", "=", "1"]] : [["is_active", "=", "1"]]),
  contact_query: (d) => partyLinkFilters(d),
  address_query: (d) => partyLinkFilters(d),
  get_customer_primary: (d) => partyLinkFilters(d),
  get_supplier_primary: (d) => partyLinkFilters(d),
  quality_inspection_query: (d) => (d["item_code"] ? [["item_code", "=", String(d["item_code"])]] : []),
  get_pending_work_orders: () => [["status", "!=", "Completed"]],
  finished_good_bom_query: (d) => (d["item_code"] ? [["item", "=", String(d["item_code"])], ["is_active", "=", "1"]] : [["is_active", "=", "1"]]),
  get_warehouse_address: () => [],
  get_operations: () => [],
  get_users_for_project: () => [["enabled", "=", "1"]],
  get_team_members: () => [["enabled", "=", "1"]],
  get_cashiers: () => [["enabled", "=", "1"]],
  get_purchase_receipts: (d) => [["docstatus", "=", "1"], ...(d["supplier"] ? [["supplier", "=", String(d["supplier"])]] as Filter[] : [])],
  get_purchase_invoices: (d) => [["docstatus", "=", "1"], ...(d["supplier"] ? [["supplier", "=", String(d["supplier"])]] as Filter[] : [])],
  get_purchase_invoice: (d) => [["docstatus", "=", "1"], ...(d["supplier"] ? [["supplier", "=", String(d["supplier"])]] as Filter[] : [])],
  get_expense_accounts: (d) => (d["company"] ? [["company", "=", String(d["company"])], ["is_group", "=", "0"]] : [["is_group", "=", "0"]]),
  get_maintenance_tasks: () => [],
  get_serial_no_query: (d) => (d["item_code"] ? [["item_code", "=", String(d["item_code"])]] : []),
  get_new_item_code: () => [],
  get_timesheet: (d) => (d["employee"] ? [["employee", "=", String(d["employee"])]] : []),
  pos_profile_query: (d) => (d["company"] ? [["company", "=", String(d["company"])]] : []),
  get_payment_terms_for_references: () => [],
  get_open_payment_requests_query: () => [["status", "!=", "Paid"]],
  get_doctypes_for_closing: () => [],
  item_details: () => [["disabled", "=", "0"]],
  get_inventory_documents: () => [],
};
/** Contacts/Addresses link to a party through their child `links` table; synthetic rows may not carry it, so restrict only when the party is known. */
function partyLinkFilters(d: Doc): Filter[] {
  const party = d["customer"] ?? d["supplier"] ?? d["party"];
  return party ? [["link_name", "=", String(party)]] : [];
}
/** Trailing method name of a dotted server query path, if a local port exists. */
export function localServerQuery(path: string | null | undefined): string | undefined {
  const tail = path?.split(".").pop() ?? "";
  return tail && tail in LOCAL_SERVER_QUERIES ? tail : undefined;
}

/**
 * Client-side set_query handlers the extractor cannot read as literal filters (they call a JS helper), ported by
 * "<DocType>|<child table field>|<field>". Journal Entry lines: erpnext.journal_entry.account_query (company, no
 * groups) and accounts/dimensions.js setup_dimension_filters for the cost center (company, no groups).
 */
const companyLeaf = (d: Doc): Filter[] => [...(d["company"] ? [["company", "=", String(d["company"])]] as Filter[] : []), ["is_group", "=", "0"]];
export const CLIENT_QUERY_PORTS: Record<string, (doc: Doc) => Filter[]> = {
  "Journal Entry|accounts|account": companyLeaf,
  "Journal Entry|accounts|cost_center": companyLeaf,
  "Journal Entry Template|accounts|account": companyLeaf,
};

/** set_query engine: resolves source filter values (frm.doc.x / doc.x / literals) against the current doc. */
export function linkFilterFor(all: LinkFilter[] | undefined, field: string, doc: Doc, childTable?: string, doctype?: string): { filters: Filter[]; rule?: LinkFilter; localPort?: string } {
  const client = doctype && childTable ? CLIENT_QUERY_PORTS[`${doctype}|${childTable}|${field}`] : undefined;
  if (client) return { filters: client(doc), localPort: "client" };
  const rule = (all ?? []).find((r) => r.field === field && (childTable ? r.child_table === childTable : !r.child_table)) ?? (all ?? []).find((r) => r.field === field);
  if (!rule) return { filters: [] };
  const port = localServerQuery(rule.server_query);
  if (port) return { filters: LOCAL_SERVER_QUERIES[port]!(doc), rule, localPort: port };
  const res = (v: string): string | undefined => {
    const m = /^(?:this\.)?(?:frm\.doc|doc|me\.frm\.doc)\.(\w+)$/.exec(v.trim());
    if (m) { const x = doc[m[1]!]; return x === undefined || x === null || x === "" ? undefined : String(x); }
    if (/^[\w .-]+$/.test(v) && !/[()]/.test(v)) return v === "true" ? "1" : v === "false" ? "0" : v;
    return undefined;
  };
  const out: Filter[] = [];
  for (const [k, v] of Object.entries(rule.filters)) {
    if (Array.isArray(v)) { const val = res(v[1]); if (val !== undefined) out.push([k, v[0] as Filter[1], val]); }
    else { const val = res(v); if (val !== undefined) out.push([k, "=", val]); }
  }
  return { filters: out, rule };
}

const QUERY_SOURCE: Record<string, string> = { get_party_type: "Party Type" };

/**
 * Options a child-table Link / Dynamic Link cell offers (grid.js link fields run the same set_query as the form):
 * the row merged over its parent (frm.doc.company + row.account), the parent's rules for this table, and for a
 * Dynamic Link the DocType named in the row (party_type → party).
 */
export function childLinkOptions(rules: LinkFilter[] | undefined, parentDt: string, tableField: string, field: { fieldname?: string | undefined; fieldtype: string; options?: string | undefined }, row: Record<string, unknown>, parent: Record<string, unknown>): { doctype: string; names: Doc[]; filters: Filter[] } {
  const target = field.fieldtype === "Dynamic Link" ? String(row[field.options ?? ""] ?? "") : String(field.options ?? "");
  if (!target || !field.fieldname) return { doctype: target, names: [], filters: [] };
  const { filters, localPort } = linkFilterFor(rules, field.fieldname, { ...parent, ...row } as Doc, tableField, parentDt);
  // a server query may read another table than the field's Link target (get_party_type: Link to DocType, rows from Party Type)
  const from = (localPort && QUERY_SOURCE[localPort]) || target;
  return { doctype: from, names: applyLinkFilters(from, filters).filter((d) => !Number(d["disabled"] ?? 0)), filters };
}

export function applyLinkFilters(doctype: string, filters: Filter[]): Doc[] {
  const rows = adapter.list(doctype);
  if (!filters.length) return rows;
  // Filters on fields the synthetic record lacks are ignored (field not populated in preview data).
  return rows.filter((r) => filters.every((f) => r[f[0]] === undefined || matchFilter(r, f)));
}

/** Tree parent field (nestedset convention: parent_<scrubbed doctype> or old_parent). */
export function treeParentField(meta: DocTypeMeta): string | undefined {
  const names = meta.fields.map((f) => f.fieldname);
  return names.find((n) => n === `parent_${snake(meta.name)}`) ?? meta.fields.find((f) => f.fieldtype === "Link" && f.options === meta.name && f.fieldname !== "old_parent")?.fieldname;
}
