/**
 * Test helper: the policy records as installed before the owner rulings W0-02 (P1–P8 Undefined, P9 an illustrative
 * assumption). Tests of the undefined-policy gate itself (a site can still set a policy back to Undefined) call this
 * after installing the demo; the rulings are tested in testlist/policies.test.ts. The texts differ from the earlier seed on
 * purpose, so the installer's one-time upgrade (seed.ts upgradePolicies) leaves this test state alone.
 */
import { adapter, type Doc } from "@/lib/adapter";
const UNDEF: [string, string][] = [
  ["P1", "The owner has not named who approves client final accounts."], ["P2", "Approver and the retention receivable treatment are not decided."],
  ["P3", "Bank accounts and payment methods for subcontractor payments are not approved."], ["P4", "No approver has been designated for Not Applicable closeout items."],
  ["P5", "Invoice-matching tolerance and default deductions are not approved."], ["P6", "Whether expired rates block estimate approval is not decided."],
  ["P7", "Expense posting accounts and dimensions for site expenses are not mapped."], ["P8", "The prequalification approver and criteria are not decided."],
];
export function prePolicyState(): void {
  for (const [k, why] of UNDEF) { const d = adapter.get("Digit Policy Decision", k); if (d) adapter.insertDocQuiet("Digit Policy Decision", { ...d, status: "Undefined", missing_reason: `${why} (test: pre-ruling state)`, effective_date: "", authority: "", decision: "", value: "" } as Doc); }
  const p9 = adapter.get("Digit Policy Decision", "P9");
  if (p9) adapter.insertDocQuiet("Digit Policy Decision", { ...p9, status: "Defined", effective_date: "2026-01-01", authority: "Test pre-ruling state — ILLUSTRATIVE assumption, not an owner decision", value: "net_after_deductions",
    decision: "Demo scenario only: invoices are raised for the net certified amount (after advance recovery and retention) and VAT 15% is applied by the company's KSA VAT template. Replace with the owner's decision before real use." } as Doc);
}
let applied = false;
/** prePolicyState once per test file, as soon as the demo policy records exist (later per-test changes are kept). */
export function prePolicyOnce(): void { if (!applied && adapter.get("Digit Policy Decision", "P1")) { prePolicyState(); applied = true; } }
