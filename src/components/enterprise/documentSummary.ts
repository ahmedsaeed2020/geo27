/**
 * Document Summary registry (owner addendum C, 2026-10-19). One `summary` spec per DocType says which of the document's
 * OWN fields the shared DocumentSummaryHeader shows: key fields (identity zone), amounts (amount strip), "linked to"
 * chips and whether a submitted document offers General Ledger / Stock Ledger buttons. Values are read from the
 * document as stored (or as being edited in a draft) and are never recalculated — the only derived figures are a
 * difference of two stored header fields, named as such (`diff`). A field that does not exist on the DocType is
 * skipped, so a spec never invents a value. DocTypes without a spec get the generic card (identity, company, main date,
 * status, links). Pure module: no React, no router, so the registry is testable and app-agnostic.
 */
import type { DocField, DocTypeMeta } from "@/lib/catalog";
import type { Doc } from "@/lib/adapter";

export type KeyField = string | { field: string; to?: string; label?: string };
export interface SummaryAmount {
  field?: string; diff?: [string, string]; label?: string; kind?: "currency" | "percent" | "qty" | "number";
  /** Only when the stored header field is EMPTY (never set, e.g. an older synthetic record): the value the source
   *  controller would have stored, from the document's own stored rows (payment_entry.py set_total_allocated_amount /
   *  set_unallocated_amount). A stored value — including 0 — always wins. */
  whenEmpty?: (doc: Doc) => number;
}
export interface SummaryLink {
  /** child table holding the links (else the header) */
  table?: string;
  /** fixed target DocType, or the field naming it (Dynamic Link) */
  doctype?: string; doctypeField?: string;
  nameField: string;
  amountField?: string;
}
export interface SummarySpec {
  keyFields: KeyField[];
  amounts: SummaryAmount[];
  links: SummaryLink[];
  /** submitted documents post to the General Ledger (button shown only when GL rows exist for the voucher) */
  ledgerImpact?: boolean;
  /** submitted documents move stock (button shown only when Stock Ledger rows exist for the voucher) */
  stockImpact?: boolean;
}

const rowSum = (d: Doc, table: string, field: string) => Math.round((Array.isArray(d[table]) ? (d[table] as Record<string, unknown>[]) : []).reduce((s, r) => s + (Number(r[field]) || 0), 0) * 100) / 100;
const pePaid = (d: Doc) => Number(d["payment_type"] === "Receive" ? d["received_amount"] ?? d["paid_amount"] : d["paid_amount"]) || 0;
const peAllocated = (d: Doc) => rowSum(d, "references", "allocated_amount");

const SALES_LINKS: SummaryLink[] = [
  { table: "items", doctype: "Sales Order", nameField: "sales_order" },
  { table: "items", doctype: "Delivery Note", nameField: "delivery_note" },
  { table: "items", doctype: "Quotation", nameField: "prevdoc_docname" },
  { table: "items", doctype: "Sales Invoice", nameField: "against_sales_invoice" },
  { table: "items", doctype: "Sales Order", nameField: "against_sales_order" },
  { doctype: "Project", nameField: "project" },
];
const BUY_LINKS: SummaryLink[] = [
  { table: "items", doctype: "Purchase Order", nameField: "purchase_order" },
  { table: "items", doctype: "Purchase Receipt", nameField: "purchase_receipt" },
  { table: "items", doctype: "Material Request", nameField: "material_request" },
  { doctype: "Project", nameField: "project" },
];
const ORDER_AMOUNTS = (moved: "per_delivered" | "per_received"): SummaryAmount[] => [
  { field: "grand_total" }, { field: moved, kind: "percent" }, { field: "per_billed", kind: "percent" },
];

export const DOCUMENT_SUMMARY: Record<string, SummarySpec> = {
  "Payment Entry": {
    keyFields: ["payment_type", "party", "company", "posting_date", { field: "paid_from_account_currency", label: "Currency" }, "paid_from", "paid_to"],
    amounts: [{ field: "received_amount", label: "Received" }, { field: "total_allocated_amount", label: "Allocated", whenEmpty: peAllocated }, { field: "unallocated_amount", label: "Unallocated", whenEmpty: (d) => Math.max(0, pePaid(d) - peAllocated(d) - rowSum(d, "deductions", "amount")) }, { field: "difference_amount", label: "Difference" }],
    links: [{ table: "references", doctypeField: "reference_doctype", nameField: "reference_name", amountField: "allocated_amount" }],
    ledgerImpact: true,
  },
  "Sales Invoice": {
    keyFields: ["customer", "posting_date", "due_date", "company", "currency"],
    amounts: [{ field: "grand_total" }, { diff: ["grand_total", "outstanding_amount"], label: "Paid" }, { field: "outstanding_amount" }],
    links: SALES_LINKS, ledgerImpact: true, stockImpact: true,
  },
  "Purchase Invoice": {
    keyFields: ["supplier", "posting_date", "due_date", "company", "currency", "bill_no"],
    amounts: [{ field: "grand_total" }, { diff: ["grand_total", "outstanding_amount"], label: "Paid" }, { field: "outstanding_amount" }],
    links: BUY_LINKS, ledgerImpact: true, stockImpact: true,
  },
  "Sales Order": { keyFields: ["customer", "transaction_date", "delivery_date", "company", "currency"], amounts: ORDER_AMOUNTS("per_delivered"), links: [{ table: "items", doctype: "Quotation", nameField: "prevdoc_docname" }, { doctype: "Project", nameField: "project" }] },
  "Purchase Order": { keyFields: ["supplier", "transaction_date", "schedule_date", "company", "currency"], amounts: ORDER_AMOUNTS("per_received"), links: [{ table: "items", doctype: "Material Request", nameField: "material_request" }, { table: "items", doctype: "Supplier Quotation", nameField: "supplier_quotation" }, { doctype: "Project", nameField: "project" }] },
  "Quotation": { keyFields: ["party_name", "transaction_date", "valid_till", "company", "currency"], amounts: [{ field: "grand_total" }], links: [{ doctype: "Opportunity", nameField: "opportunity" }] },
  "Delivery Note": { keyFields: ["customer", "posting_date", "set_warehouse", "company"], amounts: [{ field: "total_qty", kind: "qty" }, { field: "grand_total" }], links: [{ table: "items", doctype: "Sales Order", nameField: "against_sales_order" }, { table: "items", doctype: "Sales Invoice", nameField: "against_sales_invoice" }, { doctype: "Project", nameField: "project" }], ledgerImpact: true, stockImpact: true },
  "Purchase Receipt": { keyFields: ["supplier", "posting_date", "set_warehouse", "company"], amounts: [{ field: "total_qty", kind: "qty" }, { field: "grand_total" }], links: BUY_LINKS, ledgerImpact: true, stockImpact: true },
  "Stock Entry": { keyFields: ["stock_entry_type", "purpose", "posting_date", "from_warehouse", "to_warehouse", "company"], amounts: [{ field: "total_outgoing_value" }, { field: "total_incoming_value" }, { field: "value_difference" }], links: [{ doctype: "Work Order", nameField: "work_order" }, { doctype: "Purchase Order", nameField: "purchase_order" }, { doctype: "Project", nameField: "project" }], ledgerImpact: true, stockImpact: true },
  "Journal Entry": {
    keyFields: ["voucher_type", "posting_date", "company", "cheque_no", "cheque_date"],
    amounts: [{ field: "total_debit" }, { field: "total_credit" }, { field: "difference" }],
    links: [{ table: "accounts", doctypeField: "reference_type", nameField: "reference_name", amountField: "debit_in_account_currency" }],
    ledgerImpact: true,
  },
  "Asset": {
    keyFields: ["item_code", "asset_category", "location", "available_for_use_date", "company"],
    amounts: [{ field: "gross_purchase_amount" }, { field: "net_purchase_amount" }, { diff: ["net_purchase_amount", "value_after_depreciation"], label: "Accumulated Depreciation" }, { field: "value_after_depreciation", label: "Net Book Value" }],
    links: [{ doctype: "Purchase Invoice", nameField: "purchase_invoice" }, { doctype: "Purchase Receipt", nameField: "purchase_receipt" }],
    ledgerImpact: true,
  },
  "Employee": { keyFields: ["department", "designation", "branch", "date_of_joining", "status", "company"], amounts: [], links: [{ doctype: "Employee", nameField: "reports_to" }] },
  "Leave Application": { keyFields: ["employee", "leave_type", { field: "from_date", to: "to_date", label: "Period" }, "leave_approver", "status"], amounts: [{ field: "total_leave_days", kind: "number" }, { field: "leave_balance", kind: "number" }], links: [] },
  "Expense Claim": { keyFields: ["employee", "posting_date", "expense_approver", "approval_status", "company"], amounts: [{ field: "total_claimed_amount" }, { field: "total_sanctioned_amount" }, { field: "total_advance_amount" }, { field: "grand_total" }], links: [{ doctype: "Project", nameField: "project" }], ledgerImpact: true },
  "CRM Lead": { keyFields: ["organization", "lead_owner", "source", "status", "territory"], amounts: [{ field: "annual_revenue" }], links: [] },
  "CRM Deal": { keyFields: ["organization", "deal_owner", "source", "status", "expected_closure_date"], amounts: [{ field: "deal_value" }, { field: "expected_deal_value" }, { field: "probability", kind: "percent" }], links: [{ doctype: "CRM Lead", nameField: "lead" }] },
  "Digit Client Contract": {
    keyFields: ["project", "customer", "reference", "boq", { field: "start_date", to: "end_date", label: "Contract Period" }, "taxes_and_charges"],
    amounts: [{ field: "revised_value" }, { field: "original_value" }, { field: "advance_amount" }, { field: "retention_pct", kind: "percent" }, { field: "retention_cap_pct", kind: "percent" }],
    links: [{ doctype: "Digit BOQ", nameField: "boq" }, { doctype: "Project", nameField: "project" }],
  },
  "Digit Client Certificate": {
    keyFields: ["contract", "project", "claim", "cert_date", "workflow_state"],
    amounts: [{ field: "gross_this" }, { field: "retention" }, { field: "advance_recovery" }, { field: "net_certified" }],
    links: [{ doctype: "Digit Client Claim", nameField: "claim" }, { doctype: "Digit Client Contract", nameField: "contract" }, { doctype: "Sales Invoice", nameField: "sales_invoice" }],
  },
  "Digit Client Claim": {
    keyFields: ["contract", "project", { field: "period_start", to: "period_end", label: "Period" }, "claim_date", "workflow_state"],
    amounts: [{ field: "this_claim" }, { field: "previous_claimed" }, { field: "gross_to_date" }],
    links: [{ doctype: "Digit Client Contract", nameField: "contract" }],
  },
  "Digit Client Variation": {
    keyFields: ["contract", "project", "change_kind", "origin", "requested_on", "approved_on"],
    amounts: [{ field: "amount" }, { field: "time_days", kind: "number" }],
    links: [{ doctype: "Digit Client Contract", nameField: "contract" }],
  },
};

/** Names of every DocType with a full spec (the rest use the generic card). */
export const FULL_SPEC_DOCTYPES = Object.keys(DOCUMENT_SUMMARY);

export type FactKind = "link" | "select" | "date" | "currency" | "percent" | "qty" | "number" | "text";
export interface Fact { field: string; label: string; value: unknown; to?: unknown; fieldtype: string; options?: string | undefined; kind: FactKind }
export interface Amount { key: string; label: string; value: number; fieldtype: string; options?: string | undefined; kind: "currency" | "percent" | "qty" | "number"; derived?: [string, string] }
export interface LinkChip { doctype: string; name: string; amount?: number | undefined }
export interface SummaryModel { full: boolean; facts: Fact[]; amounts: Amount[]; links: LinkChip[]; ledger: boolean; stock: boolean }

const NUMERIC = new Set(["Currency", "Float", "Int", "Percent"]);
const SKIP_LINK = new Set(["Company", "Currency", "User", "DocType", "Print Heading", "Letter Head", "Language", "Price List", "Address", "Contact", "UOM", "Naming Series", "Role", "Module Def", "Terms and Conditions", "Account", "Cost Center", "Mode of Payment", "Country", "Workflow State", "Fiscal Year", "Finance Book", "Branch", "Department", "Designation", "Territory", "Customer Group", "Supplier Group", "Item Group", "Warehouse", "Sales Taxes and Charges Template", "Purchase Taxes and Charges Template", "Tax Category", "Shipping Rule", "Incoterm", "Holiday List"]);
const MAIN_DATES = ["posting_date", "transaction_date", "date", "cert_date", "claim_date", "start_date", "from_date", "expected_closure_date", "creation"];
const empty = (v: unknown) => v === undefined || v === null || v === "";

function kindOf(f: DocField): FactKind {
  switch (f.fieldtype) {
    case "Link": case "Dynamic Link": return "link";
    case "Select": return "select";
    case "Date": case "Datetime": return "date";
    case "Currency": return "currency";
    case "Percent": return "percent";
    case "Float": case "Int": return "number";
    default: return "text";
  }
}

/** Status shown on the card: workflow state, else the document's own status, else the docstatus label of a submittable DocType. */
export function summaryStatus(meta: DocTypeMeta, doc: Doc, workflowState?: string): string | undefined {
  if (workflowState) return workflowState;
  const st = doc["status"];
  if (!empty(st) && meta.fields.some((f) => f.fieldname === "status")) return String(st);
  if (meta.is_submittable) return ["Draft", "Submitted", "Cancelled"][Number(doc.docstatus ?? 0)];
  return undefined;
}

function linksOf(spec: SummaryLink[], meta: DocTypeMeta, doc: Doc, exists: (dt: string, name: string) => boolean): LinkChip[] {
  const out: LinkChip[] = []; const seen = new Set<string>();
  const push = (dt: unknown, nm: unknown, amt?: unknown) => {
    const doctype = String(dt ?? ""), name = String(nm ?? "");
    if (!doctype || !name || name === doc.name && doctype === meta.name) return;
    const key = `${doctype}\u0000${name}`; if (seen.has(key)) { const c = out.find((x) => x.doctype === doctype && x.name === name); if (c && amt !== undefined && !empty(amt)) c.amount = (c.amount ?? 0) + (Number(amt) || 0); return; }
    if (!exists(doctype, name)) return;
    seen.add(key); out.push({ doctype, name, ...(amt !== undefined && !empty(amt) ? { amount: Number(amt) || 0 } : {}) });
  };
  for (const l of spec) {
    if (l.table) {
      const rows = Array.isArray(doc[l.table]) ? (doc[l.table] as Record<string, unknown>[]) : [];
      for (const r of rows) push(l.doctype ?? r[l.doctypeField ?? ""], r[l.nameField], l.amountField ? r[l.amountField] : undefined);
    } else if (meta.fields.some((f) => f.fieldname === l.nameField)) push(l.doctype ?? doc[l.doctypeField ?? ""], doc[l.nameField], l.amountField ? doc[l.amountField] : undefined);
  }
  return out.slice(0, 8);
}

/**
 * Resolves the card for one document. `exists` checks a linked record (chips only for records that exist);
 * `posted(kind)` tells whether ledger rows exist for this voucher (buttons only for submitted documents with impact).
 */
export function resolveSummary(meta: DocTypeMeta, doc: Doc, h: { exists: (dt: string, name: string) => boolean; posted: (kind: "gl" | "stock") => boolean; workflowState?: string | undefined }): SummaryModel {
  const spec = DOCUMENT_SUMMARY[meta.name];
  const byName = new Map(meta.fields.filter((f) => f.fieldname).map((f) => [f.fieldname!, f]));
  const fact = (k: KeyField): Fact | null => {
    const field = typeof k === "string" ? k : k.field; const f = byName.get(field); if (!f) return null;
    const to = typeof k === "string" ? undefined : k.to;
    const value = doc[field]; const toVal = to ? doc[to] : undefined;
    if (empty(value) && empty(toVal)) return null;
    return { field, label: (typeof k === "string" ? undefined : k.label) ?? f.label ?? field, value, ...(to ? { to: toVal } : {}), fieldtype: f.fieldtype, options: f.options, kind: kindOf(f) };
  };
  const submitted = Number(doc.docstatus ?? 0) === 1;
  if (spec) {
    const amounts: Amount[] = [];
    for (const a of spec.amounts) {
      if (a.diff) {
        const [x, y] = a.diff; const fx = byName.get(x), fy = byName.get(y);
        if (!fx || !fy || empty(doc[x]) || empty(doc[y])) continue;
        amounts.push({ key: `${x}-${y}`, label: a.label ?? `${fx.label} − ${fy.label}`, value: (Number(doc[x]) || 0) - (Number(doc[y]) || 0), fieldtype: fx.fieldtype, options: fx.options, kind: a.kind ?? (fx.fieldtype === "Currency" ? "currency" : "number"), derived: [x, y] });
        continue;
      }
      const f = a.field ? byName.get(a.field) : undefined;
      if (!f || !NUMERIC.has(f.fieldtype)) continue;
      // Payment Entry: the strip names the amount received or paid, by the stored payment type
      if (meta.name === "Payment Entry" && a.field === "received_amount" && doc["payment_type"] !== "Receive") {
        const pf = byName.get("paid_amount"); if (pf) amounts.push({ key: "paid_amount", label: "Paid", value: Number(doc["paid_amount"]) || 0, fieldtype: pf.fieldtype, options: pf.options, kind: "currency" });
        continue;
      }
      const stored = doc[a.field!]; const value = empty(stored) && a.whenEmpty ? a.whenEmpty(doc) : Number(stored) || 0;
      amounts.push({ key: a.field!, label: a.label ?? f.label ?? a.field!, value, fieldtype: f.fieldtype, options: f.options, kind: a.kind ?? (f.fieldtype === "Percent" ? "percent" : f.fieldtype === "Currency" ? "currency" : "number") });
    }
    return {
      full: true,
      facts: spec.keyFields.map(fact).filter((x): x is Fact => !!x).slice(0, 7),
      amounts: amounts.slice(0, 5),
      links: linksOf(spec.links, meta, doc, h.exists),
      ledger: submitted && !!spec.ledgerImpact && h.posted("gl"),
      stock: submitted && !!spec.stockImpact && h.posted("stock"),
    };
  }
  // generic card: company + main date + status, links from header Link fields to transaction records
  const facts: Fact[] = [];
  const company = fact("company"); if (company) facts.push(company);
  const dateField = MAIN_DATES.find((d) => byName.has(d) && !empty(doc[d])) ?? meta.fields.find((f) => f.fieldtype === "Date" && f.fieldname && !empty(doc[f.fieldname]))?.fieldname;
  if (dateField && dateField !== "creation") { const d = fact(dateField); if (d) facts.push(d); }
  const genericLinks: SummaryLink[] = meta.fields.filter((f) => f.fieldtype === "Link" && f.fieldname && f.options && !SKIP_LINK.has(f.options) && f.fieldname !== "amended_from" && !f.hidden).map((f) => ({ doctype: f.options!, nameField: f.fieldname! }));
  return { full: false, facts, amounts: [], links: linksOf(genericLinks, meta, doc, h.exists).slice(0, 6), ledger: false, stock: false };
}
