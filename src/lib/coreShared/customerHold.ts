/**
 * Customer hold (ERPNext 2026 "Block Customer", owner gap list B09 / U26F-10). The native Customer fields `on_hold`
 * (Block Customer) and `release_date` decide the hold; the shared Core adds the readable reason (`digit_hold_reason`,
 * a Core custom field). While a customer is held — on hold and the release date not yet reached on the document's date —
 * its Sales Order, Delivery Note and Sales Invoice cannot be submitted; drafts and quotations stay possible. Enforced once
 * here as adapter doc hooks (registered from coreShared/operations.ts registerOperationHooks), so every screen, import
 * and test hits the same rule. Customer 360 and the party Quick View show the hold, its reason and its release date.
 */
import { adapter, registerDocHook, type Doc } from "@/lib/adapter";

type Bi = [string, string];
const s = (v: unknown) => String(v ?? "");
const n = (v: unknown) => Number(v) || 0;
const today = () => new Date().toISOString().slice(0, 10);

export const HOLD_REASON_FIELD = "digit_hold_reason";
export const HOLD_BLOCKED_DOCS = ["Sales Order", "Delivery Note", "Sales Invoice"] as const;

export interface CustomerHold { held: boolean; onHold: boolean; release: string; reason: string; message: Bi }

/** Hold state of a customer on a date (default today): held while on hold and the release date is empty or later. */
export function customerHold(customer: string, on = today()): CustomerHold {
  const c = adapter.get("Customer", customer);
  const onHold = !!c && n(c["on_hold"]) === 1; const release = s(c?.["release_date"]); const reason = s(c?.[HOLD_REASON_FIELD]).trim();
  const held = onHold && (!release || release > on);
  const until = release ? [` until ${release}`, ` حتى ${release}`] : ["", ""];
  const why = reason ? [`: ${reason}`, `: ${reason}`] : ["", ""];
  return { held, onHold, release, reason, message: held ? [`Customer ${customer} is on hold${until[0]}${why[0]}`, `العميل ${customer} موقوف${until[1]}${why[1]}`] : ["", ""] };
}

let hooked = false;
export function registerCustomerHoldHooks() {
  if (hooked) return; hooked = true;
  for (const dt of HOLD_BLOCKED_DOCS) registerDocHook(dt, (doc: Doc, before?: Doc) => {
    if (n(doc["docstatus"]) !== 1 || n(before?.["docstatus"]) === 1 || n(doc["is_return"])) return { doc };
    const h = customerHold(s(doc["customer"]), s(doc["posting_date"] || doc["transaction_date"]) || today());
    return h.held ? { doc, errors: [`${h.message[0]}. Release the hold on the customer before submitting this ${dt}.`] } : { doc };
  });
}
