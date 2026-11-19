/**
 * Shared e-mail composer logic (frappe/public/js/frappe/views/communication.js CommunicationComposer + v16 "Undo Send"):
 * Email Template subject/response rendered against the document with a controlled {{ field }} substitution (never a
 * template engine or eval), a short undo window before the e-mail is committed, and the commit records the
 * Communication on the timeline (docActivity.sendDocEmail) and dispatches it to the e-mail provider set in
 * Administration (coreShared/providers.ts), so delivery follows the one provider setting.
 */
import { adapter, type Doc } from "./adapter";
import { emailErrors, sendDocEmail, type EmailInput } from "./docActivity";
import { dispatch, providerFor } from "./coreShared/providers";
import { currentUser } from "./session";

export const UNDO_SECONDS = 8;
export interface Draft extends EmailInput { bcc?: string; template?: string; sendMeCopy?: boolean; attachPrint?: boolean }

const TAG = /\{\{\s*(?:doc\.)?([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g;
const fmt = (v: unknown) => (v === null || v === undefined ? "" : typeof v === "number" ? (Number.isInteger(v) ? String(v) : v.toFixed(2)) : String(v));
/** Replace {{ field }} / {{ doc.field }} with the document's values; other Jinja blocks are left out and listed. */
export function renderTemplate(text: string, doc: Record<string, unknown>): { text: string; unsupported: string[] } {
  const unsupported: string[] = [];
  const out = String(text ?? "")
    .replace(/\{%[\s\S]*?%\}/g, (m) => { unsupported.push(m.trim()); return ""; })
    .replace(TAG, (_, f: string) => fmt(doc[f]))
    .replace(/\{\{[\s\S]*?\}\}/g, (m) => { unsupported.push(m.trim()); return ""; });
  return { text: out, unsupported };
}
const strip = (html: string) => html.replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>/gi, "\n").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/\n{3,}/g, "\n\n").trim();
/** Templates offered for a document: those for its DocType plus the general ones (no reference DocType). */
export function templatesFor(doctype: string): Doc[] {
  return adapter.list("Email Template").filter((t) => !t["reference_doctype"] || t["reference_doctype"] === doctype).sort((a, b) => a.name.localeCompare(b.name));
}
export function applyTemplate(name: string, doc: Record<string, unknown>): { subject: string; content: string; unsupported: string[] } | null {
  const t = adapter.get("Email Template", name); if (!t) return null;
  const body = Number(t["use_html"] ?? 0) ? strip(String(t["response_html"] ?? "")) : strip(String(t["response"] ?? ""));
  const s = renderTemplate(String(t["subject"] ?? ""), doc), b = renderTemplate(body, doc);
  return { subject: s.text.trim(), content: b.text, unsupported: [...s.unsupported, ...b.unsupported] };
}
export function draftErrors(d: Draft): string[] { return emailErrors({ to: d.to, cc: [d.cc, d.bcc].filter(Boolean).join(", "), subject: d.subject, content: d.content }); }

/** Commit: Communication on the timeline + provider dispatch (Integration Log row with the provider's status). */
export function commitEmail(dt: string, name: string, d: Draft, user = currentUser()): { name?: string; errors: string[]; provider: string; status?: string } {
  const user_cc = d.sendMeCopy && /@/.test(user) ? user : "";
  const r = sendDocEmail(dt, name, { to: d.to, cc: [d.cc, user_cc].filter(Boolean).join(", "), subject: d.subject, content: d.content }, user);
  if (r.errors.length || !r.name) return { errors: r.errors, provider: providerFor("email").provider };
  if (d.bcc || d.attachPrint) adapter.update("Communication", r.name, { bcc: d.bcc ?? "", ...(d.attachPrint ? { has_attachment: 1 } : {}) });
  const doc = adapter.get(dt, name);
  const log = dispatch("email", { doctype: dt, name, ...(doc?.["company"] ? { company: String(doc["company"]) } : {}) }, { to: d.to, cc: d.cc, bcc: d.bcc, subject: d.subject, communication: r.name }, `${d.subject} → ${d.to}`);
  return { name: r.name, errors: [], provider: log.provider, status: log.status };
}

/** Undo window: the e-mail is committed after `seconds` unless cancelled first (v16 Undo Send). */
export function scheduleSend(commit: () => void, seconds = UNDO_SECONDS): { cancel: () => boolean } {
  let done = false;
  const t = setTimeout(() => { done = true; commit(); }, seconds * 1000);
  return { cancel: () => { if (done) return false; clearTimeout(t); done = true; return true; } };
}
