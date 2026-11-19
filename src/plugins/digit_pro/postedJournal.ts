/** Shared posted-journal rule for depreciation (Fixed Assets lifecycle and Depreciation Review). Read-only. */
import { scopedList } from "@/lib/scope";
import { currentUser } from "@/lib/session";
import { sourceStatus } from "./finance";

const n = (v: unknown) => Number(v) || 0;
const s = (v: unknown) => (v == null ? "" : String(v));

/** Shared posted-journal rule: a depreciation journal reference counts as posted only when the Journal Entry is
 * submitted and has at least one readable, non-cancelled GL row. Unreadable JE/GL sources, draft journals, journals
 * without ledger rows and the Core "preview" marker all return false (reference only). */
export function postedJournalCheck(user = currentUser()): (je: string) => boolean {
  if (sourceStatus("Journal Entry", user) !== "ok" || sourceStatus("GL Entry", user) !== "ok") return () => false;
  const jes = new Map(scopedList("Journal Entry", user).map((d) => [d.name, d]));
  const posted = new Set(scopedList("GL Entry", user).filter((g) => !n(g["is_cancelled"]) && s(g["voucher_type"]) === "Journal Entry").map((g) => s(g["voucher_no"])));
  return (je) => !!je && je !== "preview" && n(jes.get(je)?.docstatus) === 1 && posted.has(je);
}
