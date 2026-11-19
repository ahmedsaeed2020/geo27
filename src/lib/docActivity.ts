/**
 * D10-b — document activity actions for the simulated session user (form_sidebar.js follow/like, communication.js
 * "New Email"): every action writes adapter records the timeline and list sidebars read; no hard-coded user.
 */
import { adapter } from "./adapter";
import { currentUser } from "./session";

const arr = (v: unknown): string[] => { try { const a = typeof v === "string" ? JSON.parse(v) : v; return Array.isArray(a) ? a.map(String) : []; } catch { return []; } };
const toggle = (dt: string, name: string, field: "_followers" | "_liked_by", user: string): boolean => {
  const cur = arr(adapter.get(dt, name)?.[field]); const on = !cur.includes(user);
  adapter.update(dt, name, { [field]: JSON.stringify(on ? [...cur, user] : cur.filter((x) => x !== user)) });
  return on;
};
export const followers = (dt: string, name: string) => arr(adapter.get(dt, name)?.["_followers"]);
export const likedBy = (dt: string, name: string) => arr(adapter.get(dt, name)?.["_liked_by"]);
/** Follow / unfollow as the session user; returns true when now following. */
export const toggleFollow = (dt: string, name: string, user = currentUser()) => toggle(dt, name, "_followers", user);
export const toggleLike = (dt: string, name: string, user = currentUser()) => toggle(dt, name, "_liked_by", user);

export interface EmailInput { to: string; cc?: string | undefined; subject: string; content: string }
const EMAIL = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;
const split = (s: string | undefined) => (s ?? "").split(/[,;]/).map((x) => x.trim()).filter(Boolean);
export function emailErrors(e: EmailInput): string[] {
  const to = split(e.to), cc = split(e.cc);
  const errs: string[] = [];
  if (!to.length) errs.push("Add at least one recipient");
  for (const x of [...to, ...cc]) if (!EMAIL.test(x)) errs.push(`Invalid email address: ${x}`);
  if (!e.subject.trim()) errs.push("Subject is required");
  return errs;
}
/** Record a sent email on the document's timeline (Communication linked to the document). Delivery needs the mail server. */
export function sendDocEmail(dt: string, name: string, e: EmailInput, user = currentUser()): { name?: string; errors: string[] } {
  const errors = emailErrors(e); if (errors.length) return { errors };
  const c = adapter.insertDoc("Communication", {
    communication_type: "Communication", communication_medium: "Email", sent_or_received: "Sent", status: "Linked",
    subject: e.subject.trim(), content: e.content, recipients: split(e.to).join(", "), cc: split(e.cc).join(", "),
    reference_doctype: dt, reference_name: name, sender: user, owner: user, communication_date: new Date().toISOString(), creation: new Date().toISOString(),
  });
  return { name: c.name, errors: [] };
}
