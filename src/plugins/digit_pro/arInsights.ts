/**
 * PRO P3 — receivables and payables read model (owner 2026-11-17). Rule: invoiced ≠ collected; ordered ≠ received ≠ billed ≠ paid.
 *  - P3-01 / P3-07 invoice status strip: the shared Enterprise strip over the company's sales / purchase invoices (posted on
 *    or before the as-of date, cancelled excluded) with the five lifecycle states always shown; each tab's amount is the
 *    invoice total (grand_total), the same field the native invoice list strip sums, so the tabs add up to the list total.
 *  - P3-03 payment score: the party's last invoices; settled on the latest submitted payment (Payment Entry reference or
 *    Journal Entry account row) that references the invoice; on time when settled on or before the due date.
 *  - P3-04 ranked parties by open balance and P3-05 open invoices due in the next 14 days, both from the same as-of
 *    register rows (aging.ts arRegister) the page lists.
 *  - P3-06 approval and payment states as two separate states of one invoice.
 * Read only.
 */
import { adapter } from "@/lib/adapter";
import { type ArRow, type Side } from "./aging";
export {
  AR_STRIP_KEYS, invoiceApproval, invoiceDocs, invoicePayment, invoiceStrip, openPart, partyField, partyScore, settleDates, settledPart,
  type InvState, type PartyScore, type ScoreItem, type TickState,
} from "@/lib/coreShared/receivables";

const s = (v: unknown) => String(v ?? "");
const r2 = (v: number) => Math.round(v * 100) / 100;
const days = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
const todayIso = () => new Date().toISOString().slice(0, 10);

/* ------------------------------------------------------------------ P3-04 / P3-05 from the as-of register ------------------------------------------------------------------ */
export interface RankedParty { party: string; name: string; outstanding: number; invoices: number; overdue: number }
export function rankParties(rows: ArRow[]): RankedParty[] {
  const by = new Map<string, RankedParty>();
  for (const r of rows) { if (r.outstanding <= 0.005) continue; const p = by.get(r.party) ?? { party: r.party, name: r.partyName || r.party, outstanding: 0, invoices: 0, overdue: 0 };
    p.outstanding = r2(p.outstanding + r.outstanding); p.invoices++; if (r.days > 0) p.overdue = r2(p.overdue + r.outstanding); by.set(r.party, p); }
  return [...by.values()].sort((a, b) => b.outstanding - a.outstanding || a.name.localeCompare(b.name));
}
export interface UpcomingDue { row: ArRow; inDays: number }
/** Open invoices due today through today + window days (on hold excluded), earliest first. */
export function upcomingDue(rows: ArRow[], today = todayIso(), window = 14): UpcomingDue[] {
  return rows.filter((r) => r.outstanding > 0.005 && !r.onHold && r.due && r.due >= today && days(today, r.due) <= window)
    .map((row) => ({ row, inDays: days(today, row.due) })).sort((a, b) => a.inDays - b.inDays || b.row.outstanding - a.row.outstanding);
}
export const lookupParty = (side: Side, party: string) => s(adapter.get(side === "receivable" ? "Customer" : "Supplier", party)?.[side === "receivable" ? "customer_name" : "supplier_name"]) || party;
