/** SC-F-06 Payments selector: read-only view of Core Payment Entry records (no posting, no writes). */
import type { Doc } from "@/lib/adapter";
import { scopedList } from "@/lib/scope";
import { currentUser } from "@/lib/session";
import { sourceStatus, type SourceStatus } from "./finance";

export const PAYMENT_TYPES = ["Receive", "Pay", "Internal Transfer"] as const;
export const PAYMENT_STATES = ["Draft", "Submitted", "Cancelled"] as const;
const n = (v: unknown) => Number(v) || 0;
const r2 = (x: number) => Math.round(x * 100) / 100;
export const stateOf = (d: Doc) => (n(d.docstatus) === 1 ? "Submitted" : n(d.docstatus) === 2 ? "Cancelled" : "Draft");

export interface PaymentRow { doc: Doc; name: string; type: string; state: string; date: string; party: string; partyType: string; mode: string; amount: number; from: string; to: string; reference: string; allocated: number; unallocated: number; refs: { doctype: string; name: string; allocated: number }[] }
export interface Payments { status: SourceStatus; rows: PaymentRow[]; received: number; paid: number; drafts: number; unallocated: number }
export interface PaymentFilter { type?: string | undefined; state?: string | undefined; q?: string | undefined }

export function paymentsFrom(docs: Doc[], company: string, f: PaymentFilter = {}): Omit<Payments, "status"> {
  const q = (f.q ?? "").toLowerCase();
  const rows: PaymentRow[] = docs.filter((d) => !company || !d["company"] || d["company"] === company).map((d) => {
    const refs = (Array.isArray(d["references"]) ? (d["references"] as Doc[]) : []).map((r) => ({ doctype: String(r["reference_doctype"] ?? ""), name: String(r["reference_name"] ?? ""), allocated: n(r["allocated_amount"]) }));
    const amount = n(d["payment_type"] === "Receive" ? d["received_amount"] ?? d["paid_amount"] : d["paid_amount"]);
    const allocated = r2(refs.reduce((s, r) => s + r.allocated, 0));
    return { doc: d, name: d.name, type: String(d["payment_type"] ?? ""), state: stateOf(d), date: String(d["posting_date"] ?? ""), party: String(d["party"] ?? ""), partyType: String(d["party_type"] ?? ""),
      mode: String(d["mode_of_payment"] ?? ""), amount, from: String(d["paid_from"] ?? ""), to: String(d["paid_to"] ?? ""), reference: String(d["reference_no"] ?? ""),
      allocated, unallocated: d["unallocated_amount"] != null ? n(d["unallocated_amount"]) : r2(Math.max(0, amount - allocated)), refs };
  });
  const sub = rows.filter((r) => r.state === "Submitted");
  const summary = { received: r2(sub.filter((r) => r.type === "Receive").reduce((s, r) => s + r.amount, 0)), paid: r2(sub.filter((r) => r.type === "Pay").reduce((s, r) => s + r.amount, 0)),
    drafts: rows.filter((r) => r.state === "Draft").length, unallocated: r2(sub.reduce((s, r) => s + r.unallocated, 0)) };
  const shown = rows.filter((r) => (!f.type || r.type === f.type) && (!f.state || r.state === f.state) && (!q || [r.name, r.party, r.reference, r.mode].some((x) => x.toLowerCase().includes(q))))
    .sort((a, b) => b.date.localeCompare(a.date) || b.name.localeCompare(a.name));
  return { rows: shown, ...summary };
}

export function payments(company: string, f: PaymentFilter = {}, user = currentUser()): Payments {
  const status = sourceStatus("Payment Entry", user);
  if (status !== "ok") return { status, rows: [], received: 0, paid: 0, drafts: 0, unallocated: 0 };
  return { status, ...paymentsFrom(scopedList("Payment Entry", user), company, f) };
}
