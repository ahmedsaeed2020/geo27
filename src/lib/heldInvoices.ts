/**
 * Purchase Invoice hold / release — port of erpnext/accounts/doctype/purchase_invoice:
 *  - purchase_invoice.js: "Block Invoice" (Create; submitted, outstanding, not a return, not on hold) opens a dialog with
 *    Release Date + Reason For Putting On Hold (required); "Unblock Invoice" and "Change Release Date" while on hold.
 *  - purchase_invoice.py block_invoice / unblock_invoice / change_release_date (db_set on the submitted invoice) and
 *    validate_release_date ("Release date must be in the future").
 *  - accounts/utils.py get_held_invoices: a held invoice is left out of payment allocation until its release date.
 * Hold fields are not ledger fields, so no GL or outstanding changes here (posting.ts stays the only ledger writer).
 */
import { adapter, type Doc } from "./adapter";

const today = () => new Date().toISOString().slice(0, 10);
const iso = (v: unknown) => { const s = String(v ?? "").trim(); return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : ""; };

/** True while the invoice is on hold on `on`: held with no release date, or a release date still ahead. */
export function isHeld(pi: Doc | undefined, on = today()): boolean {
  if (!pi || !Number(pi["on_hold"] ?? 0)) return false;
  const r = iso(pi["release_date"]); return !r || r > on;
}

function eligible(name: string): Doc {
  const pi = adapter.get("Purchase Invoice", name);
  if (!pi || Number(pi.docstatus ?? 0) !== 1) throw new Error("Purchase Invoice must be submitted");
  return pi;
}
function checkRelease(releaseDate: string | undefined, on: string): string {
  const raw = String(releaseDate ?? "").trim(); if (!raw) return "";
  const r = iso(raw); if (!r) throw new Error("Release Date must be a date (YYYY-MM-DD)");
  if (r <= on) throw new Error("Release date must be in the future");
  return r;
}

export function blockInvoice(name: string, holdComment: string, releaseDate?: string, on = today()): void {
  const pi = eligible(name);
  if (Number(pi["on_hold"] ?? 0)) throw new Error("Purchase Invoice is already on hold");
  if (!Number(pi["outstanding_amount"] ?? 0)) throw new Error("Purchase Invoice has no outstanding amount");
  const comment = String(holdComment ?? "").trim(); if (!comment) throw new Error("Reason For Putting On Hold is mandatory");
  adapter.update("Purchase Invoice", name, { on_hold: 1, hold_comment: comment, release_date: checkRelease(releaseDate, on) || null });
}
export function unblockInvoice(name: string): void {
  eligible(name);
  adapter.update("Purchase Invoice", name, { on_hold: 0, release_date: null });
}
export function changeReleaseDate(name: string, releaseDate: string, on = today()): void {
  const pi = eligible(name);
  if (!Number(pi["on_hold"] ?? 0)) throw new Error("Purchase Invoice is not on hold");
  adapter.update("Purchase Invoice", name, { release_date: checkRelease(releaseDate, on) || null });
}
