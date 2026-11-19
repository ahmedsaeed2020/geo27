/**
 * SC-F-14 Audit & Exceptions selectors — read-only checks over native Core records. Each rule names its source DocType
 * and field so every exception is traceable; nothing is corrected automatically.
 */
import type { Doc } from "@/lib/adapter";

const n = (v: unknown) => Number(v) || 0;
const r2 = (x: number) => Math.round(x * 100) / 100;
export type ExceptionRule = "unbalanced_je" | "stale_draft" | "overdue" | "unallocated_payment" | "unreconciled_bank" | "cancelled";
export interface AuditException { rule: ExceptionRule; severity: "high" | "medium" | "low"; doctype: string; name: string; date: string; amount: number; detail: string }
export const RULE_LABELS: Record<ExceptionRule, string> = {
  unbalanced_je: "Unbalanced journal entries", stale_draft: "Drafts older than 7 days", overdue: "Overdue invoices",
  unallocated_payment: "Unallocated payments", unreconciled_bank: "Unreconciled bank lines", cancelled: "Cancelled documents",
};
export const RULE_ORDER = Object.keys(RULE_LABELS) as ExceptionRule[];

const days = (a: string, b: string) => Math.floor((Date.parse(b) - Date.parse(a)) / 86400000);
const dateOf = (d: Doc) => String(d["posting_date"] ?? d["date"] ?? d["creation"] ?? "").slice(0, 10);

/** sources: DocType → readable, company-scoped records. today: ISO date. */
export function auditExceptions(sources: Record<string, Doc[]>, today: string): AuditException[] {
  const out: AuditException[] = [];
  const push = (e: AuditException) => out.push(e);
  for (const d of sources["Journal Entry"] ?? []) {
    const diff = r2(n(d["total_debit"]) - n(d["total_credit"]));
    if (n(d["docstatus"]) === 0 && diff !== 0) push({ rule: "unbalanced_je", severity: "high", doctype: "Journal Entry", name: d.name, date: dateOf(d), amount: Math.abs(diff), detail: "Debit and credit differ" });
  }
  for (const dt of ["Journal Entry", "Sales Invoice", "Purchase Invoice", "Payment Entry"]) for (const d of sources[dt] ?? []) {
    const ds = n(d["docstatus"]); const dd = dateOf(d);
    if (ds === 0 && dd && days(dd, today) > 7) push({ rule: "stale_draft", severity: "medium", doctype: dt, name: d.name, date: dd, amount: n(d["grand_total"] ?? d["paid_amount"] ?? d["total_debit"]), detail: `${days(dd, today)}` });
    if (ds === 2) push({ rule: "cancelled", severity: "low", doctype: dt, name: d.name, date: dd, amount: n(d["grand_total"] ?? d["paid_amount"] ?? d["total_debit"]), detail: "Cancelled" });
  }
  for (const dt of ["Sales Invoice", "Purchase Invoice"]) for (const d of sources[dt] ?? []) {
    const due = String(d["due_date"] ?? "");
    if (n(d["docstatus"]) === 1 && n(d["outstanding_amount"]) > 0 && due && due < today)
      push({ rule: "overdue", severity: days(due, today) > 60 ? "high" : "medium", doctype: dt, name: d.name, date: due, amount: n(d["outstanding_amount"]), detail: String(d["customer"] ?? d["supplier"] ?? "") });
  }
  for (const d of sources["Payment Entry"] ?? []) if (n(d["docstatus"]) === 1 && n(d["unallocated_amount"]) > 0)
    push({ rule: "unallocated_payment", severity: "medium", doctype: "Payment Entry", name: d.name, date: dateOf(d), amount: n(d["unallocated_amount"]), detail: String(d["party"] ?? "") });
  for (const d of sources["Bank Transaction"] ?? []) if (n(d["docstatus"]) === 1 && n(d["unallocated_amount"]) > 0)
    push({ rule: "unreconciled_bank", severity: "medium", doctype: "Bank Transaction", name: d.name, date: dateOf(d), amount: n(d["unallocated_amount"]), detail: String(d["description"] ?? "") });
  const sev = { high: 0, medium: 1, low: 2 };
  return out.sort((a, b) => sev[a.severity] - sev[b.severity] || b.date.localeCompare(a.date));
}
