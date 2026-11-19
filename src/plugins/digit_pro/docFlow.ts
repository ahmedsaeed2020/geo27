/**
 * Shared related-document lineage for Selling and Purchasing (SC-S-04, SC-P-06..08). One spec-driven graph over the
 * native child-row links ERPNext's mappers write, plus `return_against` for returns, so both chains share one
 * implementation and support many-to-many links (partial receipts, several invoices/payments, missing stages).
 * Read-only; permission-aware via scope.ts; nothing is stored.
 */
import type { Doc } from "@/lib/adapter";
import { scopedList } from "@/lib/scope";
import { currentUser } from "@/lib/session";
import { sourceStatus, type SourceStatus } from "./finance";

const n = (v: unknown) => Number(v) || 0;
const r2 = (x: number) => Math.round(x * 100) / 100;
const rows = (d: Doc, f = "items") => ((d[f] as Doc[] | undefined) ?? []);

export interface FlowSpec { id: "selling" | "buying"; stages: string[]; links: [doctype: string, table: string, field: string, target: string][]; partyField: string }
export const SELLING: FlowSpec = { id: "selling", partyField: "customer", stages: ["Quotation", "Sales Order", "Delivery Note", "Sales Invoice", "Payment Entry"], links: [
  ["Sales Order", "items", "prevdoc_docname", "Quotation"],
  ["Delivery Note", "items", "against_sales_order", "Sales Order"],
  ["Sales Invoice", "items", "sales_order", "Sales Order"], ["Sales Invoice", "items", "delivery_note", "Delivery Note"],
] };
export const BUYING: FlowSpec = { id: "buying", partyField: "supplier", stages: ["Material Request", "Request for Quotation", "Supplier Quotation", "Purchase Order", "Purchase Receipt", "Purchase Invoice", "Payment Entry"], links: [
  ["Request for Quotation", "items", "material_request", "Material Request"],
  ["Supplier Quotation", "items", "request_for_quotation", "Request for Quotation"], ["Supplier Quotation", "items", "material_request", "Material Request"],
  ["Purchase Order", "items", "supplier_quotation", "Supplier Quotation"], ["Purchase Order", "items", "material_request", "Material Request"],
  ["Purchase Receipt", "items", "purchase_order", "Purchase Order"], ["Purchase Receipt", "items", "material_request", "Material Request"],
  ["Purchase Invoice", "items", "purchase_order", "Purchase Order"], ["Purchase Invoice", "items", "purchase_receipt", "Purchase Receipt"],
] };
export const specFor = (dt: string): FlowSpec | null => dt === "Payment Entry" ? null : BUYING.stages.includes(dt) ? BUYING : SELLING.stages.includes(dt) ? SELLING : null;

export interface FlowDoc { doctype: string; name: string; docstatus: number; status: string; date: string; total: number; isReturn: boolean; returnAgainst: string }
export interface FlowStage { doctype: string; status: SourceStatus; docs: FlowDoc[] }

const key = (dt: string, nm: string) => `${dt}|${nm}`;
const dateOf = (d: Doc) => String(d["posting_date"] ?? d["transaction_date"] ?? "");
const toFlowDoc = (dt: string, d: Doc): FlowDoc => ({ doctype: dt, name: d.name, docstatus: n(d.docstatus), status: String(d["status"] ?? ""), date: dateOf(d),
  total: n(dt === "Payment Entry" ? d["paid_amount"] : d["grand_total"]), isReturn: !!n(d["is_return"]), returnAgainst: String(d["return_against"] ?? "") });

/** All documents connected to (doctype, name) through the spec's native links, grouped by stage in flow order. */
export function lineage(spec: FlowSpec, doctype: string, name: string, user = currentUser()): FlowStage[] {
  const st = Object.fromEntries(spec.stages.map((dt) => [dt, sourceStatus(dt, user)])) as Record<string, SourceStatus>;
  const docs = new Map<string, { dt: string; d: Doc }>();
  const edges = new Map<string, Set<string>>();
  const link = (a: string, b: string) => { (edges.get(a) ?? edges.set(a, new Set()).get(a)!).add(b); (edges.get(b) ?? edges.set(b, new Set()).get(b)!).add(a); };
  const partyOk = (d: Doc) => spec.id === "buying" ? d["party_type"] === "Supplier" : d["party_type"] === "Customer";
  for (const dt of spec.stages) {
    if (st[dt] !== "ok") continue;
    for (const d of scopedList(dt, user)) {
      if (dt === "Payment Entry" && !partyOk(d)) continue;
      const me = key(dt, d.name); docs.set(me, { dt, d });
      for (const [ldt, table, field, target] of spec.links) if (ldt === dt) for (const r of rows(d, table)) if (r[field]) link(me, key(target, String(r[field])));
      if (d["return_against"]) link(me, key(dt, String(d["return_against"])));
      if (dt === "Payment Entry") for (const r of rows(d, "references")) {
        const t = String(r["reference_doctype"] ?? "");
        if (spec.stages.includes(t)) link(me, key(t, String(r["reference_name"])));
      }
    }
  }
  const seen = new Set<string>([key(doctype, name)]);
  const queue = [key(doctype, name)];
  while (queue.length) for (const nb of edges.get(queue.shift()!) ?? []) if (!seen.has(nb) && docs.has(nb)) { seen.add(nb); queue.push(nb); }
  return spec.stages.map((dt) => ({ doctype: dt, status: st[dt]!, docs: [...seen].map((k) => docs.get(k)).filter((x): x is { dt: string; d: Doc } => !!x && x.dt === dt)
    .map(({ d }) => toFlowDoc(dt, d)).sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name)) }));
}

/** Next native step for a document (labels match the source "Create" buttons); null when nothing remains. */
export function nextStep(doctype: string, d: Doc): string | null {
  if (n(d.docstatus) !== 1) return n(d.docstatus) === 0 ? "Submit" : null;
  if (n(d["is_return"])) return null;
  const st = String(d["status"]);
  if (["Closed", "On Hold", "Stopped"].includes(st)) return null;
  switch (doctype) {
    case "Quotation": return ["Ordered", "Lost", "Expired"].includes(st) ? null : "Sales Order";
    case "Sales Order": return n(d["per_delivered"]) < 100 ? "Delivery Note" : n(d["per_billed"]) < 100 ? "Sales Invoice" : null;
    case "Delivery Note": return n(d["per_billed"]) < 100 ? "Sales Invoice" : null;
    case "Sales Invoice": case "Purchase Invoice": return n(d["outstanding_amount"]) > 0 ? "Payment Entry" : null;
    case "Material Request": return n(d["per_ordered"]) < 100 ? "Purchase Order" : null;
    case "Request for Quotation": return "Supplier Quotation";
    case "Supplier Quotation": return st === "Ordered" ? null : "Purchase Order";
    case "Purchase Order": return n(d["per_received"]) < 100 ? "Purchase Receipt" : n(d["per_billed"]) < 100 ? "Purchase Invoice" : null;
    case "Purchase Receipt": return n(d["per_billed"]) < 100 ? "Purchase Invoice" : null;
  }
  return null;
}

// ---------- SC-P-06/07/08 read-only quantity position (ordered / received / billed per item) ----------
export interface QtyRow { item: string; uom: string; ordered: number; received: number; returned: number; billed: number }
/** Per-item position for a PO / PR / PI computed from submitted linked Core rows. Diagnostic only — no posting rule. */
export function purchasePosition(doctype: string, doc: Doc, user = currentUser()): { rows: QtyRow[]; orders: string[]; uomMismatch: string[] } {
  const subm = (dt: string) => sourceStatus(dt, user) === "ok" ? scopedList(dt, user).filter((d) => n(d.docstatus) === 1) : [];
  const orders = doctype === "Purchase Order" ? [doc.name] : [...new Set(rows(doc).map((r) => String(r["purchase_order"] ?? "")).filter(Boolean))];
  const po = subm("Purchase Order").filter((d) => orders.includes(d.name));
  const by = new Map<string, QtyRow>();
  const get = (r: Doc) => { const k = String(r["item_code"]); return by.get(k) ?? by.set(k, { item: k, uom: String(r["uom"] ?? r["stock_uom"] ?? ""), ordered: 0, received: 0, returned: 0, billed: 0 }).get(k)!; };
  const mismatch = new Set<string>();
  for (const d of po) for (const r of rows(d)) get(r).ordered += n(r["qty"]);
  for (const d of subm("Purchase Receipt")) for (const r of rows(d)) if (orders.includes(String(r["purchase_order"] ?? ""))) {
    const q = get(r); if (r["uom"] && q.uom && r["uom"] !== q.uom) mismatch.add(q.item);
    if (n(d["is_return"])) q.returned += Math.abs(n(r["qty"])); else q.received += n(r["qty"]);
  }
  for (const d of subm("Purchase Invoice")) for (const r of rows(d)) if (orders.includes(String(r["purchase_order"] ?? ""))) get(r).billed += n(d["is_return"]) ? -Math.abs(n(r["qty"])) : n(r["qty"]);
  if (!orders.length) for (const r of rows(doc)) get(r);
  return { rows: [...by.values()].map((q) => ({ ...q, ordered: r2(q.ordered), received: r2(q.received), returned: r2(q.returned), billed: r2(q.billed) })), orders, uomMismatch: [...mismatch] };
}

// ---------- SC-P-02 Supplier 360 ----------
export interface Supplier360 {
  supplier: string; status: SourceStatus;
  orders: { status: SourceStatus; open: number; toReceive: number; toBill: number; byStatus: { status: string; count: number }[] };
  receipts: { status: SourceStatus; toBill: number; completed: number; returns: number };
  invoices: { status: SourceStatus; unpaid: number; outstanding: number; overdue: number; debitNotes: number };
  payments: { status: SourceStatus; count: number; paid: number };
  recent: FlowDoc[];
}
export function supplier360(supplier: string, today: string, user = currentUser()): Supplier360 {
  const ok = (dt: string) => sourceStatus(dt, user);
  const list = (dt: string, f = "supplier") => ok(dt) === "ok" ? scopedList(dt, user).filter((d) => d[f] === supplier && n(d.docstatus) === 1) : [];
  const po = list("Purchase Order"), pr = list("Purchase Receipt"), pi = list("Purchase Invoice");
  const pe = list("Payment Entry", "party").filter((d) => d["party_type"] === "Supplier");
  const open = po.filter((d) => !["Closed", "Completed", "On Hold"].includes(String(d["status"])));
  const counts = new Map<string, number>(); for (const d of po) counts.set(String(d["status"]), (counts.get(String(d["status"])) ?? 0) + 1);
  const unpaid = pi.filter((d) => n(d["outstanding_amount"]) > 0 && !n(d["is_return"]));
  const recent = [...po.map((d) => toFlowDoc("Purchase Order", d)), ...pr.map((d) => toFlowDoc("Purchase Receipt", d)), ...pi.map((d) => toFlowDoc("Purchase Invoice", d)), ...pe.map((d) => toFlowDoc("Payment Entry", d))]
    .sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8);
  return {
    supplier, status: ok("Purchase Invoice"),
    orders: { status: ok("Purchase Order"), open: open.length, toReceive: open.filter((d) => n(d["per_received"]) < 100).length, toBill: open.filter((d) => n(d["per_billed"]) < 100).length,
      byStatus: [...counts].map(([status, count]) => ({ status, count })).sort((a, b) => b.count - a.count) },
    receipts: { status: ok("Purchase Receipt"), toBill: pr.filter((d) => !n(d["is_return"]) && n(d["per_billed"]) < 100 && String(d["status"]) !== "Completed").length, completed: pr.filter((d) => String(d["status"]) === "Completed").length, returns: pr.filter((d) => n(d["is_return"])).length },
    // Outstanding = sum of Core outstanding_amount on submitted invoices incl. debit notes (negative), as Accounts Payable does.
    invoices: { status: ok("Purchase Invoice"), unpaid: unpaid.length, outstanding: r2(pi.reduce((s, d) => s + n(d["outstanding_amount"]), 0)), overdue: unpaid.filter((d) => String(d["due_date"] ?? "") < today).length, debitNotes: pi.filter((d) => n(d["is_return"])).length },
    payments: { status: ok("Payment Entry"), count: pe.length, paid: r2(pe.reduce((s, d) => s + n(d["paid_amount"]), 0)) },
    recent,
  };
}

// ---------- SC-P-03..05 Supplier Quotation comparison (no scoring, no winner) ----------
export interface QuoteRow { quotation: string; supplier: string; docstatus: number; status: string; item: string; qty: number; uom: string; currency: string; rate: number; amount: number; delivery: string; taxes: string; validTill: string; leadDays?: number | null }
/** Supplier Quotation Item lead time: the row's lead_time_days, else the days from the quotation date to its expected_delivery_date;
 *  the delivery date is the row's expected_delivery_date, else quotation date + lead time — so quotes compare on when goods arrive. */
export function quoteLead(q: Doc, r: Doc): { leadDays: number | null; delivery: string } {
  const qd = String(q["transaction_date"] ?? ""), ed = String(r["expected_delivery_date"] ?? ""), ld = Number(r["lead_time_days"]);
  const days = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
  const plus = (a: string, k: number) => { const x = new Date(`${a}T00:00:00Z`); x.setUTCDate(x.getUTCDate() + k); return x.toISOString().slice(0, 10); };
  const leadDays = Number.isFinite(ld) && ld > 0 ? ld : (/^\d{4}-\d{2}-\d{2}$/.test(ed) && /^\d{4}-\d{2}-\d{2}$/.test(qd) ? Math.max(days(qd, ed), 0) : null);
  const delivery = /^\d{4}-\d{2}-\d{2}$/.test(ed) ? ed : leadDays !== null && /^\d{4}-\d{2}-\d{2}$/.test(qd) ? plus(qd, leadDays) : "";
  return { leadDays, delivery };
}
export function quotationComparison(doctype: "Material Request" | "Request for Quotation", name: string, user = currentUser()): { status: SourceStatus; rfqs: string[]; rows: QuoteRow[] } {
  const st = sourceStatus("Supplier Quotation", user); if (st !== "ok") return { status: st, rfqs: [], rows: [] };
  const rfqs = doctype === "Request for Quotation" ? [name] : sourceStatus("Request for Quotation", user) === "ok"
    ? scopedList("Request for Quotation", user).filter((d) => n(d.docstatus) !== 2 && rows(d).some((r) => r["material_request"] === name)).map((d) => d.name) : [];
  const out: QuoteRow[] = [];
  for (const q of scopedList("Supplier Quotation", user)) {
    if (n(q.docstatus) === 2) continue;
    for (const r of rows(q)) {
      if (!(rfqs.includes(String(r["request_for_quotation"] ?? "")) || (doctype === "Material Request" && r["material_request"] === name))) continue;
      out.push({ quotation: q.name, supplier: String(q["supplier_name"] ?? q["supplier"] ?? ""), docstatus: n(q.docstatus), status: String(q["status"] ?? ""), item: String(r["item_code"]),
        qty: n(r["qty"]), uom: String(r["uom"] ?? ""), currency: String(q["currency"] ?? ""), rate: n(r["rate"]), amount: n(r["amount"]),
        ...quoteLead(q, r), taxes: String(q["taxes_and_charges"] ?? ""), validTill: String(q["valid_till"] ?? "") });
    }
  }
  out.sort((a, b) => a.item.localeCompare(b.item) || a.rate - b.rate);
  return { status: "ok", rfqs, rows: out };
}

// ---------- SC-S-03 Quotation guidance (read-only checks; native validation still runs on save/submit) ----------
export interface Check { id: string; ok: boolean; label: string; detail?: string }
export function quotationChecks(doc: Doc, today: string): Check[] {
  const items = rows(doc);
  const party = String(doc["party_name"] ?? doc["customer"] ?? "");
  return [
    { id: "party", ok: !!party, label: "Customer selected" },
    { id: "items", ok: items.length > 0 && items.every((r) => r["item_code"]), label: "Every row has an item" },
    { id: "qty", ok: items.length > 0 && items.every((r) => n(r["qty"]) > 0), label: "Quantities above zero" },
    { id: "rate", ok: items.length > 0 && items.every((r) => n(r["rate"]) > 0), label: "Rates set" },
    { id: "uom", ok: items.every((r) => !!r["uom"]), label: "Units of measure set" },
    { id: "valid", ok: !doc["valid_till"] || String(doc["valid_till"]) >= today, label: "Valid till is not past", detail: String(doc["valid_till"] ?? "") },
  ];
}

// ---------- SC-S-05/06 Selling quantity position (ordered / delivered / returned / billed per item) ----------
/** Mirrors purchasePosition over Sales Order → Delivery Note (against_sales_order) → Sales Invoice (sales_order). */
export function salesPosition(doctype: string, doc: Doc, user = currentUser()): { rows: QtyRow[]; orders: string[]; uomMismatch: string[] } {
  const subm = (dt: string) => sourceStatus(dt, user) === "ok" ? scopedList(dt, user).filter((d) => n(d.docstatus) === 1) : [];
  const soOf = (r: Doc) => String(r["against_sales_order"] ?? r["sales_order"] ?? "");
  const orders = doctype === "Sales Order" ? [doc.name] : [...new Set(rows(doc).map(soOf).filter(Boolean))];
  const by = new Map<string, QtyRow>();
  const get = (r: Doc) => { const k = String(r["item_code"]); return by.get(k) ?? by.set(k, { item: k, uom: String(r["uom"] ?? r["stock_uom"] ?? ""), ordered: 0, received: 0, returned: 0, billed: 0 }).get(k)!; };
  const mismatch = new Set<string>();
  for (const d of subm("Sales Order").filter((d) => orders.includes(d.name))) for (const r of rows(d)) get(r).ordered += n(r["qty"]);
  for (const d of subm("Delivery Note")) for (const r of rows(d)) if (orders.includes(String(r["against_sales_order"] ?? ""))) {
    const q = get(r); if (r["uom"] && q.uom && r["uom"] !== q.uom) mismatch.add(q.item);
    if (n(d["is_return"])) q.returned += Math.abs(n(r["qty"])); else q.received += n(r["qty"]);
  }
  for (const d of subm("Sales Invoice")) for (const r of rows(d)) if (orders.includes(String(r["sales_order"] ?? ""))) get(r).billed += n(d["is_return"]) ? -Math.abs(n(r["qty"])) : n(r["qty"]);
  if (!orders.length) for (const r of rows(doc)) get(r);
  return { rows: [...by.values()].map((q) => ({ ...q, ordered: r2(q.ordered), received: r2(q.received), returned: r2(q.returned), billed: r2(q.billed) })), orders, uomMismatch: [...mismatch] };
}

/** SC-S-06 / SC-P invoice banner: native outstanding, due state, payments referencing it, returns against it. */
export interface InvoiceBanner { state: "draft" | "cancelled" | "paid" | "overdue" | "unpaid" | "return"; outstanding: number; grand: number; due: string; daysOverdue: number; payments: FlowDoc[]; returns: FlowDoc[] }
export function invoiceBanner(doctype: string, doc: Doc, today: string, user = currentUser()): InvoiceBanner {
  const pe = sourceStatus("Payment Entry", user) === "ok" ? scopedList("Payment Entry", user).filter((d) => n(d.docstatus) === 1 && rows(d, "references").some((r) => r["reference_name"] === doc.name)) : [];
  const ret = sourceStatus(doctype, user) === "ok" ? scopedList(doctype, user).filter((d) => n(d.docstatus) !== 2 && d["return_against"] === doc.name) : [];
  const out = r2(n(doc["outstanding_amount"])), due = String(doc["due_date"] ?? "");
  const days = due && due < today ? Math.round((Date.parse(today) - Date.parse(due)) / 86400000) : 0;
  const state: InvoiceBanner["state"] = n(doc.docstatus) === 0 ? "draft" : n(doc.docstatus) === 2 ? "cancelled" : n(doc["is_return"]) ? "return" : out <= 0 ? "paid" : days > 0 ? "overdue" : "unpaid";
  return { state, outstanding: out, grand: r2(n(doc["grand_total"])), due, daysOverdue: days, payments: pe.map((d) => toFlowDoc("Payment Entry", d)), returns: ret.map((d) => toFlowDoc(doctype, d)) };
}

// ---------- SL3 Quotation revisions (R1 / R2 version diff over the native amended_from chain) ----------
export interface RevisionField { field: string; before: string; after: string }
export interface RevisionLine { key: string; item: string; uom: string; change: "added" | "removed" | "changed" | "same"; before: { qty: number; rate: number; amount: number } | null; after: { qty: number; rate: number; amount: number } | null }
export interface RevisionDiff { status: SourceStatus | "empty" | "denied_previous"; chain: string[]; against: string; fields: RevisionField[]; lines: RevisionLine[] }
export const REVISION_FIELDS: [string, string, string][] = [
  ["party_name", "Customer", "العميل"], ["transaction_date", "Date", "التاريخ"], ["valid_till", "Valid till", "صالح حتى"], ["currency", "Currency", "العملة"],
  ["selling_price_list", "Price list", "قائمة الأسعار"], ["total_qty", "Total quantity", "إجمالي الكمية"], ["net_total", "Net total", "الصافي"],
  ["total_taxes_and_charges", "Taxes and charges", "الضرائب والرسوم"], ["discount_amount", "Discount", "الخصم"], ["grand_total", "Grand total", "الإجمالي الكلي"],
  ["payment_terms_template", "Payment terms", "شروط الدفع"], ["tc_name", "Terms", "الشروط والأحكام"],
];
/** Revision chain of an amended Quotation (newest first, the document itself included) and its diff against `against`
 *  (default: the revision it was amended from). Revisions are read through the user's scope only. */
/** PU5-b — Purchase Order revisions (cancel → amend chain) compared field by field and line by line. */
export const PO_REVISION_FIELDS: [string, string, string][] = [
  ["supplier", "Supplier", "المورد"], ["transaction_date", "Date", "التاريخ"], ["schedule_date", "Required by", "مطلوب بتاريخ"], ["currency", "Currency", "العملة"],
  ["buying_price_list", "Price list", "قائمة الأسعار"], ["total_qty", "Total quantity", "إجمالي الكمية"], ["net_total", "Net total", "الصافي"],
  ["total_taxes_and_charges", "Taxes and charges", "الضرائب والرسوم"], ["discount_amount", "Discount", "الخصم"], ["grand_total", "Grand total", "الإجمالي الكلي"],
  ["payment_terms_template", "Payment terms", "شروط الدفع"], ["tc_name", "Terms", "الشروط والأحكام"],
];
export const REVISION_SPECS: Record<string, [string, string, string][]> = { "Quotation": REVISION_FIELDS, "Purchase Order": PO_REVISION_FIELDS };
export function quotationRevisionDiff(doc: Doc, user = currentUser(), against?: string): RevisionDiff { return revisionDiff("Quotation", doc, user, against); }
/** Revision chain of an amended document (newest first, the document itself included) and its diff against `against`
 *  (default: the revision it was amended from). Revisions are read through the user's scope only. */
export function revisionDiff(dt: string, doc: Doc, user = currentUser(), against?: string): RevisionDiff {
  const st = sourceStatus(dt, user);
  if (st !== "ok") return { status: st, chain: [doc.name], against: "", fields: [], lines: [] };
  const readable = new Map(scopedList(dt, user).map((d) => [d.name, d]));
  const chain = [doc.name]; let cur: Doc | undefined = doc; let denied = false;
  while (cur && cur["amended_from"] && chain.length < 20) {
    const prev = String(cur["amended_from"]); const p = readable.get(prev);
    if (!p) { denied = true; break; }
    chain.push(prev); cur = p;
  }
  const target = against && chain.includes(against) && against !== doc.name ? against : chain[1];
  const old = target ? readable.get(target) : undefined;
  if (!old) return { status: denied ? "denied_previous" : "empty", chain, against: target ?? "", fields: [], lines: [] };
  const sv = (v: unknown) => (v === null || v === undefined ? "" : typeof v === "number" ? String(r2(v)) : String(v));
  const fields = (REVISION_SPECS[dt] ?? REVISION_FIELDS).map(([f]) => ({ field: f, before: sv(old[f]), after: sv(doc[f]) })).filter((x) => x.before !== x.after);
  const keyed = (d: Doc) => { const seen = new Map<string, number>(); return rows(d).map((r) => { const base = `${String(r["item_code"] ?? "")}|${String(r["uom"] ?? "")}`; const k = seen.get(base) ?? 0; seen.set(base, k + 1); return [`${base}|${k}`, r] as const; }); };
  const val = (r: Doc) => ({ qty: r2(n(r["qty"])), rate: r2(n(r["rate"])), amount: r2(n(r["amount"]) || n(r["qty"]) * n(r["rate"])) });
  const a = new Map(keyed(old)), b = new Map(keyed(doc));
  const lines: RevisionLine[] = [];
  for (const [k, r] of b) { const o = a.get(k); const nv = val(r); const ov = o ? val(o) : null;
    lines.push({ key: k, item: String(r["item_code"] ?? ""), uom: String(r["uom"] ?? ""), change: !ov ? "added" : ov.qty !== nv.qty || ov.rate !== nv.rate || ov.amount !== nv.amount ? "changed" : "same", before: ov, after: nv }); }
  for (const [k, o] of a) if (!b.has(k)) lines.push({ key: k, item: String(o["item_code"] ?? ""), uom: String(o["uom"] ?? ""), change: "removed", before: val(o), after: null });
  return { status: "ok", chain, against: target!, fields, lines };
}

/** D9 — the party of a customer / supplier transaction document (native party field per DocType; Payment Entry uses
 *  party_type / party). Quotation is absent on purpose: its guide panel already shows the same customer facts. */
const PARTY_FIELD: Record<string, (doc: Doc) => { side: "Customer" | "Supplier"; party: string } | null> = {
  "Sales Order": (d) => ({ side: "Customer", party: String(d["customer"] ?? "") }), "Delivery Note": (d) => ({ side: "Customer", party: String(d["customer"] ?? "") }),
  "Sales Invoice": (d) => ({ side: "Customer", party: String(d["customer"] ?? "") }),
  "Supplier Quotation": (d) => ({ side: "Supplier", party: String(d["supplier"] ?? "") }), "Purchase Order": (d) => ({ side: "Supplier", party: String(d["supplier"] ?? "") }),
  "Purchase Receipt": (d) => ({ side: "Supplier", party: String(d["supplier"] ?? "") }), "Purchase Invoice": (d) => ({ side: "Supplier", party: String(d["supplier"] ?? "") }),
  "Payment Entry": (d) => (d["party_type"] === "Customer" || d["party_type"] === "Supplier" ? { side: d["party_type"] as "Customer" | "Supplier", party: String(d["party"] ?? "") } : null),
};
export const PARTY_DOCS = PARTY_FIELD;
export function partyOf(doctype: string, doc: Doc): { side: "Customer" | "Supplier"; party: string } | null {
  const r = PARTY_FIELD[doctype]?.(doc); return r && r.party ? r : null;
}
