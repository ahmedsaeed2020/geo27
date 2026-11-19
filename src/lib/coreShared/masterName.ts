/**
 * Names, not codes (owner notes A-07): the readable name of a master record — customer, supplier, item, contact, employee,
 * project — for display only. The stored link value (the record `name`) stays the key for links, filters, drills and saves;
 * screens show this name and keep the code in the tooltip (and in the document header only).
 */
import { adapter } from "@/lib/adapter";
import type { Doc } from "@/lib/adapter";

/** Name field per master DocType (the field ERPNext / HRMS / CRM forms use as the record's title). */
export const MASTER_NAME: Readonly<Record<string, string>> = {
  Customer: "customer_name", Supplier: "supplier_name", Item: "item_name", Employee: "employee_name", Project: "project_name",
  Contact: "full_name", Lead: "lead_name", "Sales Partner": "partner_name", "Job Applicant": "applicant_name", Asset: "asset_name",
  "CRM Lead": "lead_name", "CRM Organization": "organization_name", "Sales Person": "sales_person_name", Shareholder: "title", Address: "address_title",
};
/** The row field that already carries the name next to a link (child rows copy it on fetch, e.g. item_code → item_name). */
const ROW_NAME: Readonly<Record<string, string>> = { item_code: "item_name", customer: "customer_name", supplier: "supplier_name", employee: "employee_name", party: "party_name", contact_person: "contact_display" };

function contactName(d: Doc): string {
  const full = String(d["full_name"] ?? "").trim();
  if (full) return full;
  return [d["first_name"], d["middle_name"], d["last_name"]].filter((x) => typeof x === "string" && x.trim()).join(" ");
}

/** Readable name of `value` (a link to `doctype`), or the value itself when no name is recorded. */
export function masterName(doctype: string | undefined, value: unknown, row?: Doc, fieldname?: string): string {
  const v = String(value ?? "");
  if (!v || !doctype) return v;
  const rf = fieldname ? ROW_NAME[fieldname] : undefined;
  const fromRow = rf && row ? row[rf] : undefined;
  if (typeof fromRow === "string" && fromRow.trim() && fromRow !== v) return fromRow;
  const field = MASTER_NAME[doctype];
  if (!field) return v;
  const d = adapter.get(doctype, v);
  if (!d) return v;
  const t = doctype === "Contact" ? contactName(d) : String(d[field] ?? "").trim();
  return t || v;
}
/** True when the DocType has a readable name to show instead of its code. */
export const hasMasterName = (doctype: string | undefined): boolean => !!doctype && doctype in MASTER_NAME;
