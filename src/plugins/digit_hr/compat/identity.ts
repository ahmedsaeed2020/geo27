/**
 * DIGIT HR identity layer over the Final Core permission helpers.
 *
 * The DIGIT HR snapshot's Core called identityScopeAllows (src/plugins/digit_hr/identityScope.ts) inside session.hasPerm
 * whenever DIGIT HR was enabled. The Final Core has no such hook and its engine files are protected, so DIGIT HR applies
 * the same rule at its own data boundary instead: compat/scope.ts and compat/session.ts re-export the Core helpers and
 * narrow every HR read/write check with this function. It only ever REMOVES access the Core already granted — never
 * grants anything — and is inactive while DIGIT HR is disabled.
 */
import type { Doc } from "@/lib/adapter";
import { userRoles } from "@/lib/session";
import { isEnabled } from "@/plugins/runtime";
import { identityScopeAllows } from "../identityScope";

export function hrIdentityAllows(doctype: string, doc: Doc, user: string, operation: string): boolean {
  return !isEnabled("digit_hr") || identityScopeAllows(doctype, doc, user, userRoles(user), operation);
}
