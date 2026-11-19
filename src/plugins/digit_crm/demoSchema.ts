import type { PluginDocType, PluginManifest } from "../types";
import type { DocField } from "@/lib/catalog";
const f = (fieldname: string, label: string, fieldtype = "Data", options?: string): DocField => ({ fieldname, label, fieldtype, ...(options ? { options } : {}), in_list_view: 1 });
const shared = [f("company", "Company", "Link", "Company"), f("period", "Month"), f("salesperson", "Salesperson", "Link", "User")];
const dt = (name: string, fields: DocField[]): PluginDocType => ({ name, module: "DIGIT CRM Demo", autoname: "hash", fields: [...shared, ...fields], controller: `# Schema scaffold only; demo calculations and isolation are not ported.\nfrom frappe.model.document import Document\n\nclass ${name.replace(/ /g, "").replace(/-/g, "")}(Document):\n    pass\n`, permissions: [{ role: "Sales User", read: 1, report: 1, export: 1 }, { role: "Sales Manager", read: 1, write: 1, report: 1, export: 1 }, { role: "System Manager", read: 1, write: 1, create: 1, delete: 1, report: 1, export: 1 }] });
export const DEMO_TYPES = { target: "DIGIT CRM Demo Target", forecast: "DIGIT CRM Forecast", spend: "DIGIT CRM Campaign Spend", commission: "DIGIT CRM Commission" } as const;
export const digitCrmDemo: PluginManifest = {
  name: "digit_crm_demo", title: "DIGIT CRM Demo", title_ar: "بيئة CRM التجريبية", version: "1.0.0", publisher: "Digit", email: "demo@example.test", license: "MIT", description: "Explicit synthetic demo contracts. Not production policy or financial posting.", host_app: "crm", module: "DIGIT CRM Demo", required_apps: ["frappe", "crm", "erpnext"],
  doctypes: [
    dt(DEMO_TYPES.target, [f("target_amount", "Target Amount", "Currency"), f("sales_person", "Sales Person", "Link", "Sales Person")]),

  ],
  custom_fields: [
    ...["CRM Lead", "CRM Deal", "CRM Organization", "Contact", "CRM Task", "CRM Call Log", "FCRM Note", "Communication", "Sales Person", "Campaign", "Branch", "CRM Territory", "Territory"].map(dt => ({ dt, fieldname: "custom_demo_company", label: "Company", fieldtype: "Link", options: "Company", insert_after: "", in_standard_filter: 1 })),
    ...["CRM Lead", "CRM Deal"].map(dt => ({ dt, fieldname: "custom_demo_campaign", label: "Campaigns", fieldtype: "Link", options: "Campaign", insert_after: "source", in_standard_filter: 1 })),
    ...["CRM Lead", "CRM Deal", "CRM Task", "Communication"].map(dt => ({ dt, fieldname: "custom_demo_team", label: "Sales Teams", fieldtype: "Link", options: "Sales Person", insert_after: "", in_standard_filter: 1 })),
    { dt: "Communication", fieldname: "custom_demo_channel", label: "Type", fieldtype: "Select", options: "\nWhatsApp\nEmail", insert_after: "communication_medium" },
    { dt: "Communication", fieldname: "custom_demo_thread", label: "Related", fieldtype: "Data", insert_after: "custom_demo_channel" },
    { dt: "Communication", fieldname: "custom_demo_assigned_to", label: "Assigned To", fieldtype: "Link", options: "User", insert_after: "custom_demo_thread" },
    { dt: "CRM Task", fieldname: "custom_demo_callback", label: "My Promised Callbacks", fieldtype: "Check", insert_after: "title" },
    ...["Customer", "Quotation"].map(dt => ({ dt, fieldname: "crm_deal", label: "Opportunity", fieldtype: "Link", options: "CRM Deal", insert_after: "", read_only: 1 })),
  ],
  translations: { "DIGIT CRM Demo Target": "مستهدف تجريبي", "DIGIT CRM Demo Forecast": "توقع تاريخي تجريبي", "DIGIT CRM Demo Campaign Spend": "إنفاق حملة تجريبي", "DIGIT CRM Demo Commission": "عمولة تجريبية", "Pending": "قيد الانتظار", "Approved": "معتمدة", "Held": "معلقة", "Rejected": "مرفوضة", "Reversed": "معكوسة", "My Promised Callbacks": "اتصالاتي الموعودة" },
};

export const crmAnalyticsTypes: PluginDocType[] = [
    dt(DEMO_TYPES.forecast, [f("snapshot_date", "Date", "Date"), f("system_forecast", "Weighted forecast", "Currency"), f("adjustment", "Manager Adjustments", "Currency"), f("reason", "Reason", "Small Text"), f("contributions", "Contributing opportunities", "Code"), f("approved_by", "Owner", "Link", "User")]),
    dt(DEMO_TYPES.spend, [f("campaign", "Campaigns", "Link", "Campaign"), f("spend_date", "Date", "Date"), f("amount", "Amount", "Currency"), f("channel", "Type"), f("reference", "Source")]),
    dt(DEMO_TYPES.commission, [f("deal", "Opportunity", "Link", "CRM Deal"), f("invoice", "Sales Invoice", "Link", "Sales Invoice"), f("payment", "Payment Entry", "Link", "Payment Entry"), f("basis", "Amount", "Currency"), f("rate", "Commission Rate", "Percent"), f("amount", "Commissions", "Currency"), f("state", "Status", "Select", "Pending\nApproved\nHeld\nRejected\nReversed"), f("reason", "Reason", "Small Text"), f("policy_version", "Source")]),
].map(d => ({ ...d, module: "DIGIT CRM" }));
