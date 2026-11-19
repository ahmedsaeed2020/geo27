/**
 * Which linked records the session user may see. A record the user may not read is never shown — not as a link, not
 * as its name or code; screens show a neutral "Restricted" marker instead.
 *
 *  1. DocType level: the user's role permissions (the loaded DocType metadata, src/lib/session.ts hasPerm).
 *  2. Record level, Frappe host only: the server sends exactly the records the user may read (frappe.get_list applies
 *     DocPerms, User Permissions, if_owner and permission queries). A link into a DocType the server delivered whose
 *     target record is not in the delivered set is therefore not readable (or does not exist) and is hidden too. A
 *     DocType whose delivery was cut by the boot limit is not judged at record level (absence proves nothing there).
 *  In the Virtual Core preview every record is local, so only rule 1 applies and the preview is unchanged.
 */
import { adapter } from "@/lib/adapter";
import { cachedMeta } from "@/lib/catalog";
import { hasPerm } from "@/lib/session";
import { isFrappeHost } from "./host";

let delivered: Set<string> = new Set();
let truncated: Set<string> = new Set();

/** Set by the Frappe bridge after boot: the DocTypes the server delivered permitted records for, and the cut ones. */
export function setDeliveredScope(doctypes: Iterable<string>, cut: Iterable<string> = []): void {
  delivered = new Set(doctypes);
  truncated = new Set(cut);
}

/** Role-level read permission from loaded metadata; metadata not loaded yet → true (the form still enforces it). */
export function canReadDoctype(doctype: string): boolean {
  const meta = cachedMeta(doctype);
  return !meta || hasPerm(meta, "read");
}

/** Whether a linked record may be shown (name, code or link). */
export function canSeeRecord(doctype: string, name: unknown): boolean {
  if (!canReadDoctype(doctype)) return false;
  if (!isFrappeHost() || name == null || name === "") return true;
  if (!delivered.has(doctype) || truncated.has(doctype)) return true;
  return !!adapter.get(doctype, String(name));
}

export const restrictedLabel = (en: boolean) => (en ? "Restricted" : "مقيّد");
