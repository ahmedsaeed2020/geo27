/**
 * Saudi scope (owner decision 3 / OWN-53): DIGIT ships for Saudi Arabia only, so the regional screens of other countries
 * (UAE VAT, South Africa VAT, Italy e-invoicing, India TDS certificates, US 1099) are not offered anywhere — the catalog
 * index and report list drop them once, so menus, search, workspaces and links never show them. Source files stay frozen.
 */
export const NON_SAUDI_DOCTYPES = new Set(["UAE VAT Account", "UAE VAT Settings", "South Africa VAT Settings", "Import Supplier Invoice", "Lower Deduction Certificate"]);
export const NON_SAUDI_REPORTS = new Set(["UAE VAT 201", "VAT Audit Report", "Electronic Invoice Register", "IRS 1099"]);
export const inSaudiScope = (kind: "doctype" | "report", name: string) => !(kind === "doctype" ? NON_SAUDI_DOCTYPES : NON_SAUDI_REPORTS).has(name);

/** Product names shown to users: platform names never appear in DIGIT (display only; stored values unchanged). */
const BRAND_RE = /\b(ERPNext|Frappe(?:\s+(?:HR|HRMS|CRM|Framework|Desk|Cloud|Helpdesk))?|HRMS)\b/g;
export const brandSafe = (s: string) => (s.includes("ERPNext") || s.includes("Frappe") || s.includes("HRMS") ? s.replace(BRAND_RE, (m) => (/HR/.test(m) ? "DIGIT HR" : /CRM/.test(m) ? "DIGIT CRM" : "DIGIT")).replace(/DIGIT DIGIT/g, "DIGIT") : s);
/** Documentation / vendor links that would leave DIGIT. */
export const isVendorDocLink = (href: string) => /^(https?:)?\/\/([a-z0-9-]+\.)*(erpnext\.com|frappe\.io|frappeframework\.com|frappehr\.com|frappe\.cloud|github\.com\/frappe)/i.test(href);
