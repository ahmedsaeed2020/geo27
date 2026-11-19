import { adapter, type Doc } from "./adapter";

export type EmailDraft = { to: string; cc: string; bcc: string; subject: string; body: string; replyTo?: string | undefined };
const addresses = (value: unknown) => String(value ?? "").split(/[,;]/).map(s => s.trim()).filter(Boolean);
export function replyDraft(mail: Doc, mode: "Reply" | "Reply all" | "Forward", sender: string): EmailDraft {
  const forward = mode === "Forward";
  const recipients = forward ? [] : mail["sent_or_received"] === "Sent" ? addresses(mail["recipients"]) : addresses(mail["sender"]);
  const cc = mode === "Reply all" ? [...addresses(mail["recipients"]), ...addresses(mail["cc"])] : [];
  const excluded = new Set([sender.toLowerCase(), ...recipients.map(s => s.toLowerCase())]);
  return { to: recipients.filter(s => s.toLowerCase() !== sender.toLowerCase()).join(", "), cc: [...new Set(cc.filter(s => !excluded.has(s.toLowerCase())))].join(", "), bcc: "", subject: `${forward ? "Fwd" : "Re"}: ${String(mail["subject"] ?? "").replace(/^(Re|Fwd):\s*/i, "")}`, body: `\n\n${String(mail["content"] ?? "").replace(/<[^>]*>/g, " ").trim()}`, replyTo: forward ? undefined : mail.name };
}
export function queueCrmEmail(doc: Doc, draft: EmailDraft, sender: string) {
  const escaped = draft.body.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>");
  const communication = adapter.insertDoc("Communication", { communication_type: "Communication", communication_medium: "Email", sent_or_received: "Sent", subject: draft.subject, content: `<p>${escaped}</p>`, sender, recipients: draft.to, cc: draft.cc, bcc: draft.bcc, in_reply_to: draft.replyTo, reference_doctype: doc.doctype, reference_name: doc.name, status: "Linked", email_status: "Open", delivery_status: "Queued", communication_date: new Date().toISOString() });
  adapter.insertDoc("Email Queue", { communication: communication.name, sender, recipients: addresses(draft.to).map(recipient => ({ recipient, status: "Not Sent" })), status: "Not Sent", reference_doctype: doc.doctype, reference_name: doc.name });
  if (draft.replyTo && adapter.get(doc.doctype, doc.name)) adapter.update(doc.doctype, doc.name, { communication_status: "Replied" });
  return communication;
}