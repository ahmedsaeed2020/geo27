/**
 * Document life line for the drawer (Enterprise Visual Round 1 §7): created → submitted → approved → paid / posted, each
 * with who and when, read from the document, its Version history, the payments that settle it and its ledger rows.
 */
import { adapter, type Doc } from "./adapter";

export type LifeKey = "created" | "submitted" | "approved" | "rejected" | "paid" | "posted" | "cancelled";
export interface LifeEvent { key: LifeKey; who?: string | undefined; at: string; ref?: string | undefined; amount?: number | undefined }
const s = (v: unknown) => String(v ?? "");

export function docTimeline(doctype: string, d: Doc): LifeEvent[] {
  const out: LifeEvent[] = [{ key: "created", who: s(d["owner"]), at: s(d["creation"]) }];
  const versions = adapter.list("Version").filter((v) => v["ref_doctype"] === doctype && v["docname"] === d.name);
  for (const v of versions) {
    let data: { changed?: unknown[] } = {}; try { data = JSON.parse(s(v["data"])) as { changed?: unknown[] }; } catch { continue; }
    for (const c of Array.isArray(data.changed) ? data.changed : []) {
      if (!Array.isArray(c)) continue;
      const [f, , to] = [s(c[0]), s(c[1]), s(c[2])];
      if (f === "docstatus" && to === "1") out.push({ key: "submitted", who: s(v["owner"]), at: s(v["creation"]) });
      else if (f === "docstatus" && to === "2") out.push({ key: "cancelled", who: s(v["owner"]), at: s(v["creation"]) });
      else if (/(workflow_state|approval_status|status|_state)$/.test(f) && /approv/i.test(to)) out.push({ key: "approved", who: s(v["owner"]), at: s(v["creation"]) });
      else if (/(workflow_state|approval_status|status|_state)$/.test(f) && /reject/i.test(to)) out.push({ key: "rejected", who: s(v["owner"]), at: s(v["creation"]) });
    }
  }
  const ds = Number(d.docstatus ?? 0);
  if (ds >= 1 && !out.some((e) => e.key === "submitted")) out.push({ key: "submitted", who: s(d["modified_by"] || d["owner"]), at: s(d["posting_date"] || d["transaction_date"] || d["modified"]) });
  if (ds === 2 && !out.some((e) => e.key === "cancelled")) out.push({ key: "cancelled", who: s(d["modified_by"]), at: s(d["modified"]) });
  if (/approv/i.test(s(d["status"] || d["approval_status"] || d["workflow_state"])) && !out.some((e) => e.key === "approved")) out.push({ key: "approved", who: s(d["modified_by"]), at: s(d["modified"]) });
  // posted to the ledgers
  if (ds === 1) {
    const gl = adapter.list("GL Entry").find((g) => g["voucher_type"] === doctype && g["voucher_no"] === d.name && !Number(g["is_cancelled"] ?? 0));
    if (gl) out.push({ key: "posted", who: s(gl["owner"] || d["modified_by"]), at: s(gl["posting_date"] || gl["creation"]) });
  }
  // payments that settle an invoice
  if (doctype === "Sales Invoice" || doctype === "Purchase Invoice") {
    for (const pe of adapter.list("Payment Entry")) {
      if (Number(pe.docstatus ?? 0) !== 1) continue;
      const ref = (Array.isArray(pe["references"]) ? (pe["references"] as Doc[]) : []).find((r) => r["reference_doctype"] === doctype && r["reference_name"] === d.name);
      if (ref) out.push({ key: "paid", who: s(pe["owner"]), at: s(pe["posting_date"] || pe["creation"]), ref: pe.name, amount: Number(ref["allocated_amount"] ?? 0) });
    }
  }
  return out.filter((e) => e.at).sort((a, b) => a.at.slice(0, 19).localeCompare(b.at.slice(0, 19)));
}
