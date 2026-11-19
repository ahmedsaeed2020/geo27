/**
 * 360 access (owner notes A-06): one registry of the 360 profiles each app owns — Pro (Customer, Supplier, Item, Asset),
 * Construction (Project), HR (Employee, Applicant, Position, Contract), CRM (Customer) and FSM (Site, Device, Agreement, Technician) — so the shared header entry
 * «ملفات 360», the «360» button on list rows and document headers, and the «360» search results all open the same page.
 * Addresses are the apps' own visible addresses; the registry stores nothing and invents no page.
 */
import { adapter } from "@/lib/adapter";
import type { Doc } from "@/lib/adapter";

export type Bi = readonly [string, string];
export interface Profile360 { app: string; doctype: string; label: Bi; href: (name: string) => string }
const q = encodeURIComponent;
export const PROFILES_360: readonly Profile360[] = [
  { app: "digit_pro", doctype: "Customer", label: ["Customer 360", "ملف العميل 360"], href: (n) => `/pro/customer-360?customer=${q(n)}` },
  { app: "digit_pro", doctype: "Supplier", label: ["Supplier 360", "ملف المورد 360"], href: (n) => `/pro/supplier-360?supplier=${q(n)}` },
  { app: "digit_pro", doctype: "Item", label: ["Item 360", "ملف الصنف 360"], href: (n) => `/pro/item-360?item=${q(n)}` },
  { app: "digit_pro", doctype: "Asset", label: ["Asset 360", "ملف الأصل 360"], href: (n) => `/pro/asset-360?asset=${q(n)}` },
  { app: "digit_construction", doctype: "Project", label: ["Project 360", "مساحة المشروع 360"], href: (n) => `/construction/project/${q(n)}` },
  { app: "digit_hr", doctype: "Employee", label: ["Employee 360", "ملف الموظف 360"], href: (n) => `/digit-hr/employees/${q(n)}` },
  { app: "digit_hr", doctype: "Job Applicant", label: ["Applicant 360", "ملف المتقدم 360"], href: (n) => `/digit-hr/applicants/${q(n)}` },
  { app: "digit_hr", doctype: "DIGIT Position", label: ["Position 360", "ملف الوظيفة 360"], href: (n) => `/digit-hr/positions/${q(n)}` },
  { app: "digit_hr", doctype: "DIGIT Employment Contract", label: ["Contract 360", "ملف العقد 360"], href: (n) => `/digit-hr/contracts/${q(n)}` },
  { app: "digit_crm", doctype: "CRM Organization", label: ["Customer 360", "ملف العميل 360"], href: (n) => `/digit-crm/customers/${q(n)}` },
  { app: "digit_fsm", doctype: "FSM Service Site", label: ["Site 360", "ملف الموقع 360"], href: (n) => `/plugins/digit_fsm/site/${q(n)}` },
  { app: "digit_fsm", doctype: "FSM Device", label: ["Device 360", "ملف الجهاز 360"], href: (n) => `/plugins/digit_fsm/device/${q(n)}` },
  { app: "digit_fsm", doctype: "FSM Service Agreement", label: ["Agreement 360", "ملف الاتفاقية 360"], href: (n) => `/plugins/digit_fsm/agreement/${q(n)}` },
  { app: "digit_fsm", doctype: "FSM Technician", label: ["Technician 360", "ملف الفني 360"], href: (n) => `/plugins/digit_fsm/technician/${q(n)}` },
];

/** The CRM Organization that is the same company as an ERP Customer (same name), for the CRM Customer 360. */
function crmOrgOf(customer: string): string | undefined {
  const c = adapter.get("Customer", customer);
  const nm = String(c?.["customer_name"] ?? customer);
  return adapter.list("CRM Organization").find((o) => o.name === nm || o["organization_name"] === nm)?.name;
}

/**
 * The 360 profile of a record: the active app's own profile first (CRM shows its Customer 360 for a Customer that is a CRM
 * company), otherwise the app that owns that kind. `enabled` lists the installed apps, so a disabled app never gets a link.
 */
export function profileOf(doctype: string, name: string, activeApp: string | undefined, enabled: ReadonlySet<string>): { href: string; label: Bi; app: string } | null {
  if (!name) return null;
  if (activeApp === "digit_crm" && doctype === "Customer" && enabled.has("digit_crm")) {
    const org = crmOrgOf(name); const p = PROFILES_360.find((x) => x.doctype === "CRM Organization")!;
    if (org) return { href: p.href(org), label: p.label, app: p.app };
  }
  const own = PROFILES_360.filter((p) => p.doctype === doctype && enabled.has(p.app));
  const p = own.find((x) => x.app === activeApp) ?? own[0];
  return p ? { href: p.href(name), label: p.label, app: p.app } : null;
}

/** The kinds offered by the «ملفات 360» entry inside an app (the app's own kinds; outside an app, every enabled kind). */
export function profileKinds(activeApp: string | undefined, enabled: ReadonlySet<string>): Profile360[] {
  const own = PROFILES_360.filter((p) => p.app === activeApp && enabled.has(p.app));
  return own.length ? own : PROFILES_360.filter((p) => enabled.has(p.app) && p.doctype !== "CRM Organization");
}

/** The party a document points at (customer, supplier, employee, project …), for the «360» button in its header. */
export function partyOf(doctype: string, d: Doc): { doctype: string; name: string } | null {
  if (PROFILES_360.some((p) => p.doctype === doctype)) return { doctype, name: d.name };
  const pt = String(d["party_type"] ?? ""); const party = String(d["party"] ?? "");
  if (pt && party) return { doctype: pt, name: party };
  for (const [f, dt] of [["customer", "Customer"], ["supplier", "Supplier"], ["employee", "Employee"], ["job_applicant", "Job Applicant"], ["project", "Project"], ["asset", "Asset"], ["item_code", "Item"]] as const) {
    const v = d[f]; if (typeof v === "string" && v) return { doctype: dt, name: v };
  }
  return null;
}
