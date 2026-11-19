/**
 * SC-F-05 Payment Entry enhancement — pure selectors over the SAME Core Payment Entry doc.
 * Candidate references are submitted native invoices of the same party, company and currency with
 * outstanding_amount > 0 (payment_entry.py get_outstanding_reference_documents). Adding rows only builds a
 * `references` patch handed to the native form's change(); Core formCalc allocates and posting.ts validates.
 */
import type { Doc } from "@/lib/adapter";
import { scopedList } from "@/lib/scope";
import { currentUser } from "@/lib/session";

type Row = Record<string, unknown>;
const n = (v: unknown) => Number(v) || 0;
const r2 = (x: number) => Math.round(x * 100) / 100;
export const refDoctype = (d: Doc) => (d["party_type"] === "Customer" ? "Sales Invoice" : d["party_type"] === "Supplier" ? "Purchase Invoice" : "");
const partyField = (dt: string) => (dt === "Sales Invoice" ? "customer" : "supplier");
const refsOf = (d: Doc): Row[] => (Array.isArray(d["references"]) ? (d["references"] as Row[]) : []);

export interface Candidate { name: string; doctype: string; due: string; total: number; outstanding: number; currency: string }

/** Eligible outstanding invoices for this payment not already referenced. */
export function candidates(d: Doc, invoices: Doc[]): Candidate[] {
  const dt = refDoctype(d); if (!dt || !d["party"]) return [];
  const have = new Set(refsOf(d).map((r) => `${String(r["reference_doctype"])}|${String(r["reference_name"])}`));
  const cur = String(d["paid_from_account_currency"] || d["paid_to_account_currency"] || "");
  return invoices.filter((i) => n(i.docstatus) === 1 && n(i["outstanding_amount"]) > 0 && i[partyField(dt)] === d["party"]
      && (!d["company"] || i["company"] === d["company"]) && (!cur || !i["currency"] || i["currency"] === cur) && !have.has(`${dt}|${i.name}`))
    .map((i) => ({ name: i.name, doctype: dt, due: String(i["due_date"] ?? i["posting_date"] ?? ""), total: r2(n(i["rounded_total"] || i["grand_total"])), outstanding: r2(n(i["outstanding_amount"])), currency: String(i["currency"] ?? "") }))
    .sort((a, b) => a.due.localeCompare(b.due) || a.name.localeCompare(b.name));
}
export function candidatesFor(d: Doc, user = currentUser()): Candidate[] { const dt = refDoctype(d); return dt ? candidates(d, scopedList(dt, user)) : []; }

/** `references` patch appending the chosen invoices (allocation left to Core payment_entry.js port). */
export function addRefs(d: Doc, picks: Candidate[]): { references: Row[] } {
  const cur = refsOf(d);
  return { references: [...cur, ...picks.map((c, i) => ({ idx: cur.length + i + 1, reference_doctype: c.doctype, reference_name: c.name, due_date: c.due, total_amount: c.total, outstanding_amount: c.outstanding, allocated_amount: 0 }))] };
}

/**
 * Reference issues mirroring payment_entry.py validate_reference_documents / validate_allocated_amount.
 * `get` reads the referenced native document. The same checks block submit in posting.ts submitErrors.
 */
export function referenceIssues(d: Doc, get: (dt: string, name: string) => Doc | undefined): { row: number; msg: string }[] {
  const out: { row: number; msg: string }[] = [];
  const want = refDoctype(d); const seen = new Set<string>();
  refsOf(d).forEach((r, i) => {
    const row = n(r["idx"]) || i + 1; const dt = String(r["reference_doctype"] ?? ""), nm = String(r["reference_name"] ?? "");
    if (!dt || !nm) { out.push({ row, msg: "Reference is required" }); return; }
    const key = `${dt}|${nm}`; if (seen.has(key)) out.push({ row, msg: "Duplicate reference" }); seen.add(key);
    if (/Invoice$/.test(dt) && want && dt !== want) { out.push({ row, msg: "Reference type does not match the party type" }); return; }
    const inv = get(dt, nm); if (!inv) { out.push({ row, msg: "Reference document not found" }); return; }
    if (n(inv.docstatus) !== 1) out.push({ row, msg: n(inv.docstatus) === 2 ? "Reference document is cancelled" : "Reference document is not submitted" });
    if (/Invoice$/.test(dt) && inv[partyField(dt)] !== d["party"]) out.push({ row, msg: "Reference does not belong to this party" });
    if (d["company"] && inv["company"] && inv["company"] !== d["company"]) out.push({ row, msg: "Reference belongs to another company" });
    if (n(r["allocated_amount"]) < 0) out.push({ row, msg: "Negative values are not allowed" });
    if (n(d.docstatus) === 0 && n(r["allocated_amount"]) > n(inv["outstanding_amount"]) + 0.005) out.push({ row, msg: "Allocated Amount cannot be greater than outstanding amount" });
  });
  return out;
}

export interface PeTotals { paid: number; allocated: number; unallocated: number; deductions: number; difference: number }
/** Read-only totals exactly as Core stored/computed them on the doc. */
export function peTotals(d: Doc): PeTotals {
  const paid = n(d["payment_type"] === "Receive" ? d["received_amount"] ?? d["paid_amount"] : d["paid_amount"]);
  const allocated = d["total_allocated_amount"] != null ? n(d["total_allocated_amount"]) : r2(refsOf(d).reduce((s, r) => s + n(r["allocated_amount"]), 0));
  const deductions = r2((Array.isArray(d["deductions"]) ? (d["deductions"] as Row[]) : []).reduce((s, r) => s + n(r["amount"]), 0));
  return { paid: r2(paid), allocated: r2(allocated), unallocated: r2(d["unallocated_amount"] != null ? n(d["unallocated_amount"]) : Math.max(0, paid - allocated - deductions)), deductions, difference: r2(n(d["difference_amount"])) };
}

/** Drafts already referencing an invoice — used to avoid creating a duplicate payment action. */
export function draftPaymentsFor(dt: string, name: string, pes: Doc[]): string[] {
  return pes.filter((p) => n(p.docstatus) === 0 && refsOf(p).some((r) => r["reference_doctype"] === dt && r["reference_name"] === name)).map((p) => p.name);
}
