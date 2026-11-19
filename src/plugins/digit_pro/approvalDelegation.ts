/**
 * S4 unified approval inbox: delegation and threshold bulk approval on top of policyDefaults.approvalInbox.
 * A delegation record lets the delegate act on the delegator's waiting approvals between two dates; the action runs
 * with the delegator's rights (the same submit/workflow checks) and leaves a timeline comment naming both users.
 * On a Frappe site this is the digit_pro approval-delegation method (adapter target below); the preview runs it locally.
 */
import { adapter, type Doc } from "@/lib/adapter";
import { CORE_DT } from "@/lib/coreShared/doctypes";
import { cachedMeta } from "@/lib/catalog";
import { submitDocument } from "@/lib/documentApi";
import { applyWorkflow } from "@/lib/workflow";
import { hasPerm } from "@/lib/session";
import { approvalInbox, type InboxItem } from "./policyDefaults";

/** Core DocType (moved to the shared Core, owner DEC-02; name kept so stored delegations stay valid). */
export const DELEGATION_DT = CORE_DT.delegation;
export const DELEGATION_SERVER_METHOD = "digit_pro.api.approvals.act_on_behalf";
export interface Delegation { name: string; delegator: string; delegate: string; from_date: string; to_date: string; enabled: boolean }
export type DelegatedItem = InboxItem & { onBehalfOf?: string };
const s = (v: unknown) => String(v ?? "");
const todayIso = () => new Date().toISOString().slice(0, 10);

export function delegations(): Delegation[] {
  return adapter.list(DELEGATION_DT).map((d) => ({ name: d.name, delegator: s(d["delegator"]), delegate: s(d["delegate"]), from_date: s(d["from_date"]), to_date: s(d["to_date"]), enabled: !!Number(d["enabled"] ?? 1) }));
}
export function activeDelegationsTo(user: string, on = todayIso()): Delegation[] {
  return delegations().filter((d) => d.enabled && d.delegate === user && d.from_date <= on && (!d.to_date || d.to_date >= on));
}
/** Creates (or replaces) the delegator's delegation. Returns errors; nothing is written when there are any. */
export function setDelegation(delegator: string, delegate: string, from_date: string, to_date: string): string[] {
  const errs: string[] = [];
  if (!delegate || delegate === delegator) errs.push("Choose another user to delegate to");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from_date)) errs.push("From date is required");
  if (to_date && to_date < from_date) errs.push("To date is before the from date");
  if (delegate && activeDelegationsTo(delegator, from_date).some((d) => d.delegator === delegate)) errs.push("That user already delegates to you for this period");
  if (errs.length) return errs;
  const name = `DLG-${delegator}`;
  const row = { delegator, delegate, from_date, to_date, enabled: 1 };
  if (adapter.get(DELEGATION_DT, name)) adapter.update(DELEGATION_DT, name, row); else adapter.insertDoc(DELEGATION_DT, { name, ...row });
  return [];
}
export function endDelegation(delegator: string): void { if (adapter.get(DELEGATION_DT, `DLG-${delegator}`)) adapter.update(DELEGATION_DT, `DLG-${delegator}`, { enabled: 0 }); }

const allowedFor = (u: string) => (dt: string, p: "read" | "submit", d: Doc) => { const m = cachedMeta(dt); return !!m && hasPerm(m, p, d, u); };
/** The user's own inbox plus every active delegator's inbox (deduplicated; own rows win). */
export function unifiedInbox(user: string, company: string, allowed = allowedFor(user), on = todayIso()): DelegatedItem[] {
  const own: DelegatedItem[] = approvalInbox(user, company, allowed);
  const seen = new Set(own.map((i) => `${i.doctype}:${i.name}`));
  for (const d of activeDelegationsTo(user, on)) {
    for (const i of approvalInbox(d.delegator, company, allowedFor(d.delegator))) {
      const k = `${i.doctype}:${i.name}`; if (seen.has(k)) continue; seen.add(k);
      own.push({ ...i, onBehalfOf: d.delegator });
    }
  }
  return own;
}

/** Runs one inbox action as the approver (the delegator when on behalf). */
export function actOn(i: DelegatedItem, action: string, user: string): string[] {
  const m = cachedMeta(i.doctype); if (!m) return [`${i.doctype} is not loaded`];
  const as = i.onBehalfOf ?? user;
  const errs = i.kind === "workflow" ? applyWorkflow(i.doctype, i.name, action, as) : submitDocument(m, i.name, as);
  if (!errs.length && i.onBehalfOf) adapter.insertDoc("Comment", { comment_type: "Info", reference_doctype: i.doctype, reference_name: i.name, comment_email: user, owner: user,
    content: `${action} by ${user} on behalf of ${i.onBehalfOf} (approval delegation)` });
  return errs;
}

/** The single action an item can be bulk-approved with: "Approve & submit", or a workflow action named Approve. */
export function bulkAction(i: DelegatedItem): string | undefined {
  if (i.kind === "policy") return "Approve & submit";
  return i.actions.find((a) => /^approve$/i.test(a));
}
/** Items eligible for threshold bulk approval: a single approve action and an amount at or below the threshold. */
export function underThreshold(items: DelegatedItem[], max: number): DelegatedItem[] {
  return items.filter((i) => !!bulkAction(i) && Number.isFinite(max) && max >= 0 && i.amount <= max);
}
export function bulkApprove(items: DelegatedItem[], user: string): { done: string[]; failed: { key: string; errors: string[] }[] } {
  const done: string[] = []; const failed: { key: string; errors: string[] }[] = [];
  for (const i of items) {
    const a = bulkAction(i); const key = `${i.doctype}:${i.name}`;
    if (!a) { failed.push({ key, errors: ["No single approve action"] }); continue; }
    const e = actOn(i, a, user); if (e.length) failed.push({ key, errors: e }); else done.push(key);
  }
  return { done, failed };
}
