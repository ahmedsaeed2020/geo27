/**
 * Display title of a Link value — presentation only. The stored value (the record `name`) stays the key for links,
 * filters, drills, save and routing; only the label shown to people changes.
 *
 * Source evidence (frozen catalog, checked by linkTitle.test.ts):
 *  - CRM Organization  autoname "field:organization_name"  → organization_name
 *  - CRM Territory     autoname "field:territory_name"     → territory_name
 *  - Territory         autoname "field:territory_name"     → territory_name
 *  - Campaign          autoname "naming_series:" with Selling Settings campaign_naming_by = "Campaign Name" | "Naming Series";
 *                      the readable value is always campaign_name.
 *  - User              named by email, title_field "full_name"; Frappe CRM list views show assigned users and owners by
 *                      their full name, never the email key.
 *  - Customer / Supplier / Employee  naming_series codes with title_field customer_name / supplier_name / employee_name;
 *                      owner rule (SH-06, GL-09): parties are shown by name everywhere, the code only in the tooltip.
 * In Frappe a record named by its title field already shows that title; records created with code names (for example the
 * isolated demo) show the title field here instead of the code.
 */
import { adapter } from "./adapter";

export const TITLE_FIELDS: Readonly<Record<string, string>> = {
  "CRM Organization": "organization_name",
  "CRM Territory": "territory_name",
  "Territory": "territory_name",
  "Campaign": "campaign_name",
  "User": "full_name",
  "Customer": "customer_name",
  "Supplier": "supplier_name",
  "Employee": "employee_name",
};

/** Readable title for `value` of a Link to `doctype`; the value itself when no title is recorded. */
export function linkTitle(doctype: string | undefined, value: unknown): string {
  const v = String(value ?? "");
  const field = doctype ? TITLE_FIELDS[doctype] : undefined;
  if (!v || !field) return v;
  const t = adapter.get(doctype!, v)?.[field];
  return typeof t === "string" && t.trim() ? t : v;
}

/** Link target of a field in DocType meta (only Link fields map to a title). */
export function linkTargetOf(fields: { fieldname?: string; fieldtype?: string; options?: string }[] | undefined, fieldname: string): string | undefined {
  const f = fields?.find((x) => x.fieldname === fieldname);
  return f?.fieldtype === "Link" ? f.options : undefined;
}

/** Contact.company_name holds the CRM Organization name in Frappe CRM (organization pages list contacts by it). */
export const DISPLAY_LINKS: Readonly<Record<string, string>> = { "Contact.company_name": "CRM Organization" };

/** Title for a value of `doctype.fieldname`: Link fields by meta, plus the source-documented display links above. */
export function fieldTitle(doctype: string, fields: { fieldname?: string; fieldtype?: string; options?: string }[] | undefined, fieldname: string, value: unknown): string {
  return linkTitle(linkTargetOf(fields, fieldname) ?? DISPLAY_LINKS[`${doctype}.${fieldname}`], value);
}
