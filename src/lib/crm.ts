import { isServerHosted } from "@/lib/serverHost";
import { relTimeAr } from "@/i18n";
/**
 * Native Frappe CRM reconstruction helpers.
 * Sources: crm/frontend/src/router.js, pages/Lead.vue, pages/Deal.vue,
 * crm/install.py (default statuses + field layouts), crm_lead.py
 * (default_list_data, convert_to_deal, create_deal), crm_deal.py.
 */
import { queryOptions } from "@tanstack/react-query";
import { adapter, makeDoc, type Doc } from "./adapter";
import type { DocTypeMeta } from "./catalog";

export type CrmKind = "lead" | "deal";
export const CRM = {
  lead: { doctype: "CRM Lead", slug: "crm_lead", title: "lead_name", statusDt: "CRM Lead Status", owner: "lead_owner", label: "Leads", single: "Lead" },
  deal: { doctype: "CRM Deal", slug: "crm_deal", title: "organization", statusDt: "CRM Deal Status", owner: "deal_owner", label: "Deals", single: "Deal" },
} as const;

/** Columns from CRMLead.default_list_data / CRMDeal.default_list_data. */
export const LIST_COLUMNS: Record<CrmKind, { label: string; key: string }[]> = {
  lead: [
    { label: "Full Name", key: "lead_name" }, { label: "Organization", key: "organization" }, { label: "Status", key: "status" },
    { label: "Email", key: "email" }, { label: "Mobile No.", key: "mobile_no" }, { label: "Assigned To", key: "_assign" }, { label: "Last Modified", key: "modified" },
  ],
  deal: [
    { label: "Organization", key: "organization" }, { label: "Annual Revenue", key: "annual_revenue" }, { label: "Status", key: "status" },
    { label: "Email", key: "email" }, { label: "Mobile No.", key: "mobile_no" }, { label: "Assigned To", key: "_assign" }, { label: "Last Modified", key: "modified" },
  ],
};

/** Tabs from pages/Lead.vue and pages/Deal.vue. status: native = implemented locally, server = needs backend/integration. */
export const RECORD_TABS = [
  { name: "Activity", status: "native" }, { name: "Emails", status: "native" }, { name: "Comments", status: "native" },
  { name: "Data", status: "native" }, { name: "Calls", status: "native" }, { name: "Tasks", status: "native" },
  { name: "Notes", status: "native" }, { name: "Attachments", status: "native" }, { name: "WhatsApp", status: "server" },
] as const;

export interface LayoutSection { label?: string; name: string; hidden?: boolean; opened?: boolean; columns: { name: string; fields: string[] }[] }
export interface CrmDefaults {
  lead_statuses: Record<string, { color: string; type: string; position: number }>;
  deal_statuses: Record<string, { color: string; type: string; position: number; probability: number }>;
}
const isBrowser = typeof window !== "undefined";
export const crmLayoutsQuery = queryOptions({ queryKey: ["crm-layouts"], queryFn: () => fetch("/catalog/crm_layouts.json").then((r) => r.json() as Promise<Record<string, { doctype: string; type: string; layout: LayoutSection[] }>>), staleTime: Infinity, enabled: isBrowser });
export const crmDefaultsQuery = queryOptions({ queryKey: ["crm-defaults"], queryFn: () => fetch("/catalog/crm_defaults.json").then((r) => r.json() as Promise<CrmDefaults>), staleTime: Infinity, enabled: isBrowser });

const ORGS = ["Atlas Logistics", "Noor Health", "Cedar Build Co", "Falcon Retail", "Harbor Foods"];
const PEOPLE = [["Sara", "Haddad"], ["Omar", "Nasser"], ["Lina", "Khoury"], ["Yousef", "Aziz"], ["Maya", "Saleh"]];

/** Seeds CRM status masters with source names, and gives seeded leads/deals real status/org values. Idempotent. */
export function seedCrm(defaults: CrmDefaults, leadMeta: DocTypeMeta, dealMeta: DocTypeMeta) {
  if (isServerHosted()) return undefined as never;
  const leadStatuses = Object.keys(defaults.lead_statuses);
  const dealStatuses = Object.keys(defaults.deal_statuses);
  if (!adapter.list("CRM Lead Status").some((d) => d.name === "New")) {
    Object.entries(defaults.lead_statuses).forEach(([n, v]) => adapter.insertDoc("CRM Lead Status", { name: n, lead_status: n, ...v }));
    Object.entries(defaults.deal_statuses).forEach(([n, v]) => adapter.insertDoc("CRM Deal Status", { name: n, deal_status: n, ...v }));
  }
  if (!adapter.list("CRM Organization").some((d) => ORGS.includes(d.name))) {
    ORGS.forEach((o, i) => adapter.insertDoc("CRM Organization", { name: o, organization_name: o, no_of_employees: "11-50", annual_revenue: 250000 * (i + 1), website: `https://${o.split(" ")[0]!.toLowerCase()}.example.test`, territory: "", industry: "" }));
  }
  for (const [kind, meta] of [["lead", leadMeta], ["deal", dealMeta]] as const) {
    const dt = CRM[kind].doctype;
    if (adapter.list(dt).length === 0) for (let i = 1; i <= 5; i++) { const d = makeDoc(meta, i); adapter.insertDoc(dt, { ...d, name: d.name }); }
    adapter.list(dt).forEach((d, i) => {
      const st = kind === "lead" ? leadStatuses : dealStatuses;
      if (st.includes(String(d["status"]))) return; // already a source-defined status: user or seeded record, keep it
      const [f, l] = PEOPLE[i % 5]!;
      adapter.update(dt, d.name, {
        status: kind === "deal" ? st[i % st.length] : st[i % (st.length - 2)], organization: ORGS[i % 5], first_name: f, last_name: l, lead_name: `${f} ${l}`,
        email: `${f!.toLowerCase()}@${ORGS[i % 5]!.split(" ")[0]!.toLowerCase()}.example.test`, [CRM[kind].owner]: "Administrator",
        ...(kind === "lead" ? { converted: 0 } : { probability: Object.values(defaults.deal_statuses)[i % 5]!.probability }),
      });
    });
  }
}

/**
 * Preview simulation of crm_lead.convert_to_deal(): create_contact → create_organization →
 * create_deal (field copy minus restricted fields, lead_owner→deal_owner) → mark_converted.
 * Server parts NOT simulated: permission check, row lock, assignment copy, realtime event, custom-field matching.
 */
const RESTRICTED_TYPES = new Set(["Tab Break", "Section Break", "Column Break", "HTML", "Button", "Attach"]);
const RESTRICTED_FIELDS = new Set(["name", "naming_series", "creation", "owner", "modified", "modified_by", "idx", "docstatus", "status", "email", "mobile_no", "phone", "sla", "sla_status", "response_by", "first_response_time", "first_responded_on", "communication_status", "sla_creation", "status_change_log"]);
export function convertLeadToDeal(lead: Doc, leadMeta: DocTypeMeta, dealMeta: DocTypeMeta, defaults: CrmDefaults): { deal: Doc; error?: never } | { error: string; deal?: never } {
  const existing = adapter.related("CRM Deal", "lead", lead.name)[0];
  if (existing) return { deal: existing };
  if (defaults.lead_statuses[String(lead["status"])]?.type === "Lost") return { error: `Cannot convert a lead with status ${lead["status"]}` };
  const contact = adapter.insertDoc("Contact", {
    first_name: lead["first_name"], last_name: lead["last_name"], email_id: lead["email"], mobile_no: lead["mobile_no"], company_name: lead["organization"],
    links: [{ link_doctype: "CRM Lead", link_name: lead.name }],
  });
  let org = String(lead["organization"] || "");
  if (org && !adapter.get("CRM Organization", org)) adapter.insertDoc("CRM Organization", { name: org, organization_name: org, website: lead["website"], territory: lead["territory"], industry: lead["industry"], annual_revenue: lead["annual_revenue"], no_of_employees: lead["no_of_employees"] });
  const dealFields = new Set(dealMeta.fields.map((f) => f.fieldname));
  const data: Record<string, unknown> = {};
  for (const f of leadMeta.fields) {
    if (!f.fieldname || RESTRICTED_TYPES.has(f.fieldtype) || RESTRICTED_FIELDS.has(f.fieldname)) continue;
    const target = f.fieldname === "lead_owner" ? "deal_owner" : f.fieldname;
    if (!dealFields.has(target)) continue;
    data[target] = target === "organization" ? org : lead[f.fieldname];
  }
  const firstDealStatus = Object.entries(defaults.deal_statuses).sort((a, b) => a[1].position - b[1].position)[0];
  if (!firstDealStatus) return { error: "No deal status configured" };
  const deal = adapter.insertDoc("CRM Deal", { ...data, status: firstDealStatus[0], probability: firstDealStatus[1].probability, lead: lead.name, contacts: [{ contact: contact.name, is_primary: 1 }], contact: contact.name });
  adapter.update("CRM Lead", lead.name, { status: defaults.lead_statuses["Qualified"] ? "Qualified" : lead["status"], converted: 1 });
  return { deal };
}

/** Directory doctypes from router.js: /contacts, /organizations, /call-logs. */
export type CrmDirKind = "contact" | "organization" | "calllog" | "note" | "task";
export const CRM_DIR = {
  contact: { doctype: "Contact", label: "Contacts", single: "Contact", title: "full_name", layout: "Contact-Quick Entry", detail: true },
  organization: { doctype: "CRM Organization", label: "Organizations", single: "Organization", title: "organization_name", layout: "CRM Organization-Quick Entry", detail: true },
  calllog: { doctype: "CRM Call Log", label: "Call Logs", single: "Call Log", title: "name", layout: "CRM Call Log-Quick Entry", detail: false },
  note: { doctype: "FCRM Note", label: "Notes", single: "Note", title: "title", layout: "FCRM Note-Quick Entry", detail: false },
  task: { doctype: "CRM Task", label: "Tasks", single: "Task", title: "title", layout: "CRM Task-Quick Entry", detail: false },
} as const;
/** Kanban column field per kind (pages/*.vue kanban default: status-like Select field). */
export const DIR_KANBAN: Partial<Record<CrmDirKind, string>> = { task: "status", calllog: "status", organization: "industry", contact: "company_name", note: "reference_doctype" };

/** Columns from overrides/contact.py, crm_organization.py and crm_call_log.py default_list_data(). */
export const DIR_COLUMNS: Record<CrmDirKind, { label: string; key: string }[]> = {
  contact: [
    { label: "Name", key: "full_name" }, { label: "Email", key: "email_id" }, { label: "Phone", key: "mobile_no" },
    { label: "Organization", key: "company_name" }, { label: "Last Modified", key: "modified" },
  ],
  organization: [
    { label: "Organization", key: "organization_name" }, { label: "Website", key: "website" }, { label: "Industry", key: "industry" },
    { label: "Annual Revenue", key: "annual_revenue" }, { label: "Last Modified", key: "modified" },
  ],
  calllog: [
    { label: "Caller", key: "caller" }, { label: "Receiver", key: "receiver" }, { label: "Type", key: "type" },
    { label: "Status", key: "status" }, { label: "Duration", key: "duration" }, { label: "From (number)", key: "from" },
    { label: "To (number)", key: "to" }, { label: "Created On", key: "creation" },
  ],
  // fcrm_note.py / crm_task.py default_list_data()
  note: [
    { label: "Title", key: "title" }, { label: "Content", key: "content" }, { label: "Reference", key: "reference_docname" },
    { label: "Created By", key: "owner" }, { label: "Last Modified", key: "modified" },
  ],
  task: [
    { label: "Title", key: "title" }, { label: "Status", key: "status" }, { label: "Priority", key: "priority" }, { label: "Due Date", key: "due_date" },
    { label: "Assigned To", key: "assigned_to" }, { label: "Reference", key: "reference_docname" }, { label: "Last Modified", key: "modified" },
  ],
};

/** Seeds Contacts and CRM Call Logs referenced by the directory pages. Insert-if-missing only. */
export function seedCrmDirectory() {
  if (isServerHosted() || true) return undefined as never; // owner decision: no sample contacts / call logs
  if (!adapter.list("Contact").some((d) => d.name === "Sara Haddad")) {
    PEOPLE.forEach(([f, l], i) => adapter.insertDoc("Contact", {
      name: `${f} ${l}`, first_name: f, last_name: l, full_name: `${f} ${l}`,
      email_id: `${f!.toLowerCase()}@${ORGS[i]!.split(" ")[0]!.toLowerCase()}.example.test`,
      mobile_no: `+966 5${i} 000 10${i}`, company_name: ORGS[i], designation: ["CEO", "Procurement Lead", "CTO", "Operations Manager", "Founder"][i],
    }));
  }
  if (adapter.list("CRM Call Log").length === 0) {
    const types = ["Incoming", "Outgoing"], statuses = ["Completed", "Completed", "Missed", "Completed", "Busy"];
    for (let i = 0; i < 5; i++) {
      adapter.insertDoc("CRM Call Log", {
        caller: "Administrator", receiver: `${PEOPLE[i]![0]} ${PEOPLE[i]![1]}`,
        type: types[i % 2], status: statuses[i], duration: 60 * (i + 3),
        from: i % 2 ? "+966 11 000 0000" : `+966 5${i} 000 10${i}`,
        to: i % 2 ? `+966 5${i} 000 10${i}` : "+966 11 000 0000",
      });
    }
  }
}

export const timeAgo = (iso?: unknown) => {
  if (!iso) return "";
  if (typeof localStorage !== "undefined" && localStorage.getItem("digit-virtual-core:lang") !== "en") {
    const m = Math.max(0, Math.round((Date.now() - new Date(String(iso)).getTime()) / 60000));
    const [n, u] = m < 60 ? [m, "minute"] : m < 1440 ? [Math.round(m / 60), "hour"] : m < 43200 ? [Math.round(m / 1440), "day"] : [Math.round(m / 43200), "month"];
    return n === 0 ? "الآن" : relTimeAr(n as number, u as string) ?? String(n);
  }
  const s = (Date.now() - new Date(String(iso)).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} hr ago`;
  return `${Math.floor(s / 86400)} d ago`;
};
