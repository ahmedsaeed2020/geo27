/** Round data + print (owner 2026-11-14): which Construction documents print, and the setup / system records that do not (with the reason). */
export const NOT_PRINTED: Record<string, string> = {
  "Digit Opening Balance": "migration entry loaded once at go-live", "Digit Mandatory Project Role": "setting (required project roles)", "Digit Expense Account": "Finance mapping (P7) — never seeded",
  "Digit Saved View": "personal list view", "Digit Dashboard Layout": "personal dashboard layout", "Digit Print Artifact": "the controlled print copy itself", "Digit Checklist Template": "template master",
  "Digit Revenue Earning Rule": "Finance setting (P10 revenue basis)", "Digit Review Workflow": "workflow setup", "Digit Job Snapshot": "system snapshot written by the period job", "Digit Override Log": "system audit log",
};
/** Native documents Construction uses and prints through the same frame. */
export const NATIVE_PRINTED = ["Sales Invoice", "Purchase Order", "Purchase Invoice", "Payment Entry", "Stock Entry", "Material Request"];
