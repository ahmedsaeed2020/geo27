/**
 * DEC-015 (owner ruling 18/11/2026): site workers do not need a sign-in account. The Employee carries
 * «يحتاج حساب مستخدم» (Yes / No); left blank it follows the default rule — No for site workers, Yes for office
 * staff, approvers (anyone others report to) and employees who already sign in. Kept import-free so the manifest
 * can export the field and its Python twin without loading adapter code.
 */
import type { CustomField, ServerScript } from "@/plugins/types";

export const NEEDS_ACCOUNT_FIELD = "digit_needs_user_account";
/** Site crew trades (Construction crews and the HR site staff); matched on the stored English designation. */
export const SITE_TRADES = [
  "Foreman", "Tile Fixer", "Painter", "Plasterer", "Helper", "Equipment Operator", "Pipe Fitter", "Mason", "Driver", "Surveyor",
  "HVAC Technician", "Electrician", "Plumber", "Steel Fixer", "Carpenter", "Gypsum Installer", "Asphalt Operator", "Welder",
  "Scaffolder", "Labourer", "Laborer", "Site Worker", "Storekeeper",
] as const;

export const ACCOUNT_NEED_FIELDS: CustomField[] = [{
  dt: "Employee", fieldname: NEEDS_ACCOUNT_FIELD, label: "Needs User Account", fieldtype: "Select", options: "\nYes\nNo", insert_after: "user_id",
  description: "Blank follows the default: No for site workers, Yes for office staff, approvers and self-service users (DEC-015).",
}];

const TRADES_PY = `(${SITE_TRADES.map((t) => JSON.stringify(t)).join(", ")})`;
/** Python twin: a blank value takes the default on save, so the stored field drives the «بلا حساب مستخدم» card on the server too. */
export const ACCOUNT_NEED_SCRIPT: ServerScript = {
  name: "DIGIT Employee Needs User Account", script_type: "DocType Event", reference_doctype: "Employee", doctype_event: "Before Save",
  script: `if not doc.get("${NEEDS_ACCOUNT_FIELD}"):\n    approver = frappe.db.exists("Employee", {"reports_to": doc.name, "status": "Active"}) if not doc.is_new() else None\n    site = (doc.designation or "") in ${TRADES_PY}\n    doc.${NEEDS_ACCOUNT_FIELD} = "Yes" if (doc.user_id or approver or not site) else "No"\n`,
} as ServerScript;

export const ACCOUNT_NEED_AR: Record<string, string> = {
  "Needs User Account": "يحتاج حساب مستخدم",
  "Blank follows the default: No for site workers, Yes for office staff, approvers and self-service users (DEC-015).": "الفارغ يتبع القاعدة: لا لعمال المواقع، ونعم لموظفي المكاتب والمعتمدين ومستخدمي الخدمة الذاتية.",
};
