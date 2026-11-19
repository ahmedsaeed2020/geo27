/**
 * Owner notes C-04 contacts read model (/digit-crm/contacts): one row per readable native Contact with its full name,
 * company (CRM Organization when it exists), role, relationship (open deal / customer / lead / none) through the
 * Contact's Dynamic Links, deal `contacts` rows and converted leads, the owner of that relationship, last activity and
 * next step on the linked records, and channel consent from the linked lead. Read-only; every screen of the contact
 * list (table, strip, KPIs, kanban) reads these rows.
 */
import { adapter, type Doc } from "@/lib/adapter";
import { scopedList } from "@/lib/scope";
import { lastCrmActivity } from "@/lib/crmActivity";
import { dealStatusType, dealValue, isOpenDeal, scopedAllTasks, scopedDeals } from "./wf02";
import { scopedLeads } from "./wf01";

const s = (v: unknown) => String(v ?? "");
export type ContactRel = "open_deal" | "customer" | "lead" | "none";
export const CONTACT_REL_ORDER: ContactRel[] = ["open_deal", "customer", "lead", "none"];
export const CONTACT_REL_LABEL: Record<ContactRel, [string, string]> = { open_deal: ["Open deal", "صفقة مفتوحة"], customer: ["Customer (won)", "عميل (صفقة رابحة)"], lead: ["Lead only", "عميل محتمل فقط"], none: ["Not linked", "بلا ارتباط"] };
export const CONTACT_REL_TONE: Record<ContactRel, "info" | "ok" | "warn" | "neutral"> = { open_deal: "info", customer: "ok", lead: "warn", none: "neutral" };
export const CONTACT_REL_HUE: Record<ContactRel, "blue" | "emerald" | "amber" | "grey"> = { open_deal: "blue", customer: "emerald", lead: "amber", none: "grey" };
export type Consent = boolean | null;
export interface ContactRow {
  c: Doc; name: string; title: string; email: string; phone: string; company: string; org: string; role: string;
  deals: Doc[]; openDeals: Doc[]; lead: Doc | undefined; rel: ContactRel; owner: string; openValue: number;
  lastAt: string; next: Doc | undefined; nextDue: string; consent: { email: Consent; whatsapp: Consent; sms: Consent }; created: string;
}
/** Display name: the native full name, else first + last name, else the e-mail, else the record name. */
export const contactName = (c: Doc) => s(c["full_name"]).trim() || [s(c["first_name"]).trim(), s(c["last_name"]).trim()].filter(Boolean).join(" ") || s(c["email_id"]) || c.name;

export function contactRows(user: string): ContactRow[] {
  const deals = scopedDeals(user), byDeal = new Map(deals.map((d) => [d.name, d]));
  const leads = scopedLeads(user), byLead = new Map(leads.map((l) => [l.name, l]));
  const leadOfContact = new Map<string, Doc>(); for (const l of leads) if (s(l["custom_converted_contact"])) leadOfContact.set(s(l["custom_converted_contact"]), l);
  const dealsOfContact = new Map<string, Set<string>>();
  for (const d of deals) for (const r of (Array.isArray(d["contacts"]) ? d["contacts"] as Doc[] : [])) if (s(r["contact"])) dealsOfContact.set(s(r["contact"]), (dealsOfContact.get(s(r["contact"])) ?? new Set()).add(d.name));
  const open = scopedAllTasks(user).filter((t) => !["Done", "Canceled"].includes(s(t["status"])));
  const nextOf = new Map<string, Doc>();
  for (const t of open) { const k = `${s(t["reference_doctype"])}|${s(t["reference_docname"])}`; const cur = nextOf.get(k); if (!cur || (s(t["due_date"]) || "9") < (s(cur["due_date"]) || "9")) nextOf.set(k, t); }
  return scopedList("Contact", user).map((c) => {
    const links = (Array.isArray(c["links"]) ? c["links"] as Doc[] : []).map((l) => [s(l["link_doctype"]), s(l["link_name"])] as const);
    const dn = new Set([...links.filter(([dt]) => dt === "CRM Deal").map(([, n]) => n), ...(dealsOfContact.get(c.name) ?? [])]);
    const ds = [...dn].map((n) => byDeal.get(n)).filter((d): d is Doc => !!d);
    const lead = links.filter(([dt]) => dt === "CRM Lead").map(([, n]) => byLead.get(n)).find(Boolean) ?? leadOfContact.get(c.name) ?? ds.map((d) => byLead.get(s(d["lead"]))).find(Boolean);
    const od = ds.filter(isOpenDeal), won = ds.filter((d) => dealStatusType(d["status"]) === "Won");
    const rel: ContactRel = od.length ? "open_deal" : won.length ? "customer" : lead ? "lead" : "none";
    const refs: [string, string][] = [["Contact", c.name], ...ds.map((d) => ["CRM Deal", d.name] as [string, string]), ...(lead ? [["CRM Lead", lead.name] as [string, string]] : [])];
    const lastAt = refs.map(([dt, n]) => lastCrmActivity(dt, n)).filter(Boolean).sort().pop() ?? "";
    const next = refs.map(([dt, n]) => nextOf.get(`${dt}|${n}`)).filter((t): t is Doc => !!t).sort((a, b) => (s(a["due_date"]) || "9").localeCompare(s(b["due_date"]) || "9"))[0];
    const company = s(c["company_name"]) || s(od[0]?.["organization"] ?? ds[0]?.["organization"] ?? lead?.["organization"]);
    const flag = (k: string): Consent => (!lead ? null : Number(lead[k]) ? true : lead["custom_consent_date"] ? false : null);
    return {
      c, name: c.name, title: contactName(c), email: s(c["email_id"]), phone: s(c["mobile_no"] || c["phone"]), company, org: company && adapter.get("CRM Organization", company) ? company : "",
      role: s(c["designation"]), deals: ds, openDeals: od, lead, rel, owner: s(od[0]?.["deal_owner"] ?? ds[0]?.["deal_owner"] ?? lead?.["lead_owner"] ?? ""),
      openValue: od.reduce((a, d) => a + (dealValue(d) || 0), 0), lastAt, next, nextDue: s(next?.["due_date"]),
      consent: { email: flag("custom_consent_email"), whatsapp: flag("custom_consent_whatsapp"), sms: flag("custom_consent_sms") },
      // a contact added with its deal or lead (demo rows carry no own creation date) dates from the earliest of them
      created: [s(c["creation"]), ...ds.map((d) => s(d["creation"])), s(lead?.["creation"])].filter((x) => Number.isFinite(Date.parse(x))).sort()[0] ?? "",
    };
  });
}
/** Status strip: relationship tabs whose counts and open values add up to the rows. */
export function contactStrip(rows: ContactRow[]) {
  return CONTACT_REL_ORDER.map((k) => { const xs = rows.filter((r) => r.rel === k); return { key: k, label: CONTACT_REL_LABEL[k], tone: CONTACT_REL_TONE[k], count: xs.length, amount: xs.reduce((a, r) => a + r.openValue, 0), currency: "SAR" }; });
}
/** Days since the last activity on the contact or its linked records (null when none). */
export const idleDays = (r: ContactRow, now = Date.now()) => (r.lastAt ? Math.floor((now - Date.parse(r.lastAt)) / 864e5) : null);
