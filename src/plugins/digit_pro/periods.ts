/**
 * SC-F-10 Period Control selectors — keeps the two native ERPNext concepts separate:
 * closing (submitted Period Closing Vouchers move P&L to equity, do not lock) vs locking
 * (Company.accounts_frozen_till_date and Accounting Period closed documents). Read-only; posting.ts enforces.
 */
import type { Doc } from "@/lib/adapter";

const n = (v: unknown) => Number(v) || 0;
export interface Closing { name: string; start: string; end: string; fiscalYear: string; account: string; status: "Draft" | "Submitted" | "Cancelled"; gle: string }
export interface Lock { name: string; label: string; start: string; end: string; disabled: boolean; exemptRole: string; closed: string[]; open: boolean }

export function closings(pcvs: Doc[], company: string): Closing[] {
  return pcvs.filter((p) => !company || p["company"] === company).map((p) => ({
    name: p.name, start: String(p["period_start_date"] ?? ""), end: String(p["period_end_date"] ?? ""), fiscalYear: String(p["fiscal_year"] ?? ""),
    account: String(p["closing_account_head"] ?? ""), status: (["Draft", "Submitted", "Cancelled"] as const)[n(p.docstatus)] ?? "Draft", gle: String(p["gle_processing_status"] ?? ""),
  })).sort((a, b) => b.end.localeCompare(a.end));
}

export function locks(aps: Doc[], company: string, today: string): Lock[] {
  return aps.filter((a) => !company || a["company"] === company).map((a) => {
    const rows = Array.isArray(a["closed_documents"]) ? (a["closed_documents"] as Record<string, unknown>[]) : [];
    const start = String(a["start_date"] ?? ""), end = String(a["end_date"] ?? "");
    return { name: a.name, label: String(a["period_name"] ?? a.name), start, end, disabled: n(a["disabled"]) === 1, exemptRole: String(a["exempted_role"] ?? ""),
      closed: rows.filter((r) => n(r["closed"])).map((r) => String(r["document_type"] ?? "")).filter(Boolean), open: !!start && today >= start && today <= end };
  }).sort((a, b) => b.start.localeCompare(a.start));
}

/** Latest submitted closing end date (what ERPNext uses to refuse later opening entries). */
export const lastClosed = (c: Closing[]) => c.filter((x) => x.status === "Submitted").map((x) => x.end).sort().pop() ?? "";

/** Review only: draft documents require a human decision, not an automatic close/post action. */
export function closingDrafts(docs: Doc[], company: string, from: string, to: string): Doc[] {
  return docs.filter(d => d["company"] === company && n(d.docstatus) === 0 && typeof d["posting_date"] === "string" && d["posting_date"] >= from && d["posting_date"] <= to)
    .sort((a,b) => String(a["posting_date"]).localeCompare(String(b["posting_date"])) || a.name.localeCompare(b.name));
}
