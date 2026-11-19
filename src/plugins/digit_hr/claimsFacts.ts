/**
 * Section 04.5 advances & expense claims over PRE-SCOPED rows. Presentation only — settlement, payment and GL stay in the
 * native forms and the shared posting engine; nothing here writes.
 */
type Row = Record<string, unknown>;
const s = (v: unknown) => (v == null ? '' : String(v));
const n = (v: unknown) => Number(v || 0);

/** HRMS expense_claim.get_advances: unclaimed = paid_amount − claimed_amount − return_amount. */
export const advancePending = (a: Row) => Math.max(0, n(a['paid_amount']) - n(a['claimed_amount']) - n(a['return_amount']));
/** Submitted advance with money still unclaimed/unreturned. */
export const isOpenAdvance = (a: Row) => n(a['docstatus']) === 1 && advancePending(a) > 0;
/** Draft claim still waiting for the approver's decision (approval_status Draft, not submitted). */
export const isClaimAwaitingDecision = (c: Row) => n(c['docstatus']) === 0 && s(c['approval_status'] || 'Draft') === 'Draft';
/** Submitted, approved claim not yet reimbursed. */
export const isApprovedUnpaid = (c: Row) => n(c['docstatus']) === 1 && s(c['approval_status']) === 'Approved' && s(c['status']) === 'Unpaid';

export const claimAmount = (c: Row) => n(c['total_sanctioned_amount']) || n(c['total_claimed_amount']) || n(c['grand_total']);

/** Claims awaiting decision whose employee has an open advance that the claim does not allocate (Expense Claim Advance rows). */
export function unallocatedAdvanceClaims(claims: Row[], advances: Row[]): Map<string, string[]> {
  const openBy = new Map<string, string[]>();
  for (const a of advances.filter(isOpenAdvance)) openBy.set(s(a['employee']), [...(openBy.get(s(a['employee'])) ?? []), s(a['name'])]);
  const out = new Map<string, string[]>();
  for (const c of claims.filter(isClaimAwaitingDecision)) {
    const open = openBy.get(s(c['employee'])) ?? [];
    const allocated = new Set((Array.isArray(c['advances']) ? (c['advances'] as Row[]) : []).filter((r) => n(r['allocated_amount']) > 0).map((r) => s(r['employee_advance'])));
    const missing = open.filter((a) => !allocated.has(a));
    if (missing.length) out.set(s(c['name']), missing);
  }
  return out;
}

/** Whole days between an ISO date and `today` (≥ 0), or null when the date is missing. */
export function ageDays(date: unknown, today: string): number | null {
  const d = Date.parse(s(date).slice(0, 10)); const t = Date.parse(today);
  return Number.isFinite(d) && Number.isFinite(t) ? Math.max(0, Math.round((t - d) / 86400000)) : null;
}
