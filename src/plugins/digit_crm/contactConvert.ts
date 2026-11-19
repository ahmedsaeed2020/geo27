/**
 * Contact → CRM Lead (owner 2026-11-19): creates a New CRM Lead from a Contact's name, e-mail, mobile, company and role,
 * owned by the acting user, and links the Contact to it (Dynamic Link), so the person enters the lead pipeline once.
 * A contact already linked to an open (unconverted) lead returns that lead instead of a duplicate.
 */
import { adapter, type Doc } from "@/lib/adapter";

const s = (v: unknown) => String(v ?? "");

export function contactToLead(contactName: string, user: string): { ok: true; lead: string; existed: boolean } | { ok: false; error: string } {
  const c = adapter.get("Contact", contactName);
  if (!c) return { ok: false, error: "Contact not found" };
  const links = (Array.isArray(c["links"]) ? (c["links"] as Doc[]) : []);
  for (const l of links) if (l["link_doctype"] === "CRM Lead") { const ld = adapter.get("CRM Lead", s(l["link_name"])); if (ld && !Number(ld["converted"])) return { ok: true, lead: ld.name, existed: true }; }
  const first = s(c["first_name"]) || s(c["full_name"]) || c.name;
  const lead = adapter.insertDoc("CRM Lead", {
    first_name: first, last_name: s(c["last_name"]), lead_name: [first, s(c["last_name"])].filter(Boolean).join(" "),
    email: s(c["email_id"]), mobile_no: s(c["mobile_no"]), organization: s(c["company_name"]), job_title: s(c["designation"]),
    source: "Contact", status: "New", lead_owner: user, converted: 0,
  });
  adapter.update("Contact", c.name, { links: [...links, { link_doctype: "CRM Lead", link_name: lead.name }] });
  return { ok: true, lead: lead.name, existed: false };
}
