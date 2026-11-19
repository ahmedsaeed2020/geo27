/**
 * SC-F-08 Bank Reconciliation selectors. Statement lines are native Bank Transactions; candidates are submitted
 * native Payment Entries (bank_reconciliation_tool.py get_linked_payments: same company, deposit↔Receive,
 * withdrawal↔Pay, not yet cleared / not linked to another Bank Transaction). Ranking is diagnostic only —
 * nothing is matched automatically; allocation writes payment_entries through the Core Bank Transaction hook.
 */
import type { Doc } from "@/lib/adapter";

const n = (v: unknown) => Number(v) || 0;
const r2 = (x: number) => Math.round(x * 100) / 100;
const linked = (bt: Doc) => (Array.isArray(bt["payment_entries"]) ? (bt["payment_entries"] as Record<string, unknown>[]) : []);

export interface BankLine { doc: Doc; name: string; date: string; amount: number; direction: "deposit" | "withdrawal"; status: string; allocated: number; unallocated: number; description: string; reference: string; account: string }
export function bankLines(txns: Doc[], company: string, status?: string): BankLine[] {
  return txns.filter((t) => n(t.docstatus) === 1 && (!company || !t["company"] || t["company"] === company))
    .map((t) => { const dep = n(t["deposit"]); const amount = r2(dep || n(t["withdrawal"])); const allocated = r2(linked(t).reduce((s, r) => s + n(r["allocated_amount"]), 0));
      return { doc: t, name: t.name, date: String(t["date"] ?? ""), amount, direction: dep ? "deposit" as const : "withdrawal" as const, status: String(t["status"] ?? (amount - allocated <= 0.005 ? "Reconciled" : "Unreconciled")),
        allocated, unallocated: r2(t["unallocated_amount"] != null ? n(t["unallocated_amount"]) : amount - allocated), description: String(t["description"] ?? ""), reference: String(t["reference_number"] ?? ""), account: String(t["bank_account"] ?? "") }; })
    .filter((l) => !status || l.status === status)
    .sort((a, b) => b.date.localeCompare(a.date) || a.name.localeCompare(b.name));
}

export interface Candidate { name: string; date: string; party: string; amount: number; reference: string; score: number; reasons: string[] }
export function bankCandidates(line: BankLine, pes: Doc[], allTxns: Doc[]): Candidate[] {
  const taken = new Set(allTxns.filter((t) => n(t.docstatus) === 1).flatMap((t) => linked(t).map((r) => String(r["payment_entry"]))));
  const want = line.direction === "deposit" ? "Receive" : "Pay";
  const co = line.doc["company"];
  return pes.filter((p) => n(p.docstatus) === 1 && p["payment_type"] === want && (!co || p["company"] === co) && !p["clearance_date"] && !taken.has(p.name))
    .map((p) => {
      const amount = r2(n(want === "Receive" ? p["received_amount"] ?? p["paid_amount"] : p["paid_amount"]));
      const reference = String(p["reference_no"] ?? ""); const reasons: string[] = []; let score = 0;
      if (Math.abs(amount - line.unallocated) < 0.005) { score += 3; reasons.push("Amount matches"); }
      else if (amount < line.unallocated) { score += 1; reasons.push("Partial amount"); }
      if (reference && (line.description.includes(reference) || line.reference === reference)) { score += 2; reasons.push("Reference matches"); }
      const days = Math.abs((Date.parse(String(p["posting_date"] ?? "")) - Date.parse(line.date)) / 86400000);
      if (days <= 7) { score += 1; reasons.push("Within 7 days"); }
      return { name: p.name, date: String(p["posting_date"] ?? ""), party: String(p["party"] ?? ""), amount, reference, score, reasons };
    })
    .sort((a, b) => b.score - a.score || a.date.localeCompare(b.date));
}

/** payment_entries patch appending one voucher (allocated = min(voucher, line unallocated)). */
export function allocatePatch(line: BankLine, c: Candidate): { payment_entries: Record<string, unknown>[] } {
  const cur = linked(line.doc);
  return { payment_entries: [...cur, { idx: cur.length + 1, payment_document: "Payment Entry", payment_entry: c.name, allocated_amount: r2(Math.min(c.amount, line.unallocated)) }] };
}

/* ---------- RXP-02 bank exceptions (SC-F-08) ----------
 * Classification of statement lines for review. Nothing here matches, allocates or posts: it explains why a line is
 * not cleanly reconciled, from the line's own native fields and the same candidate rule as above.
 *  inconsistent — status Reconciled but an unallocated amount remains (the native controller only sets Reconciled at 0)
 *  partial      — some vouchers allocated, amount still unallocated
 *  ambiguous    — two or more candidate payments with exactly the unallocated amount (a person must choose)
 *  single       — exactly one exact-amount candidate (still confirmed by a person)
 *  nomatch      — no exact-amount candidate among posted, uncleared payments
 *  stale        — any of the above, dated more than STALE_DAYS before today (flag, combinable) */
export const BANK_EXCEPTIONS = ["inconsistent", "partial", "ambiguous", "nomatch", "single", "stale"] as const;
export type BankException = (typeof BANK_EXCEPTIONS)[number];
export const STALE_DAYS = 30;
export interface Classified { line: BankLine; ex: Exclude<BankException, "stale"> | null; exact: number; stale: boolean; age: number }

export function classifyBankLine(line: BankLine, cands: Candidate[], today: string): Classified {
  const age = Math.max(0, Math.floor((Date.parse(today) - Date.parse(line.date)) / 86400000)) || 0;
  const exact = cands.filter((c) => Math.abs(c.amount - line.unallocated) < 0.005).length;
  let ex: Classified["ex"] = null;
  if (line.unallocated > 0.005) {
    if (line.status === "Reconciled") ex = "inconsistent";
    else if (line.allocated > 0.005) ex = "partial";
    else ex = exact >= 2 ? "ambiguous" : exact === 1 ? "single" : "nomatch";
  }
  return { line, ex, exact, stale: !!ex && age > STALE_DAYS, age };
}
/** Classify every line once; candidates only for lines that are not marked reconciled. */
export function classifyBankLines(lines: BankLine[], pes: Doc[], allTxns: Doc[], today: string, paymentsReadable = true): Classified[] {
  return lines.map((l) => classifyBankLine(l, paymentsReadable && l.unallocated > 0.005 && l.status !== "Reconciled" ? bankCandidates(l, pes, allTxns) : [], today));
}
export const matchesBankException = (c: Classified, ex: BankException) => (ex === "stale" ? c.stale : c.ex === ex);
export function bankExceptionCounts(rows: Classified[]): Record<BankException, number> {
  return Object.fromEntries(BANK_EXCEPTIONS.map((k) => [k, rows.filter((r) => matchesBankException(r, k)).length])) as Record<BankException, number>;
}
/** Field-by-field comparison of a statement line and one candidate payment (for the side-by-side review). */
export function compareLine(line: BankLine, c: Candidate): { field: "date" | "amount" | "reference"; line: string; payment: string; ok: boolean; note?: string }[] {
  const days = Math.round(Math.abs(Date.parse(c.date) - Date.parse(line.date)) / 86400000);
  const ref = !!c.reference && (line.reference === c.reference || line.description.includes(c.reference));
  return [
    { field: "date", line: line.date, payment: c.date, ok: days <= 7, note: String(days) },
    { field: "amount", line: line.unallocated.toFixed(2), payment: c.amount.toFixed(2), ok: Math.abs(c.amount - line.unallocated) < 0.005, note: (c.amount - line.unallocated).toFixed(2) },
    { field: "reference", line: line.reference || line.description, payment: c.reference, ok: ref },
  ];
}
