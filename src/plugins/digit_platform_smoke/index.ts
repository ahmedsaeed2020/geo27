/**
 * digit_platform_smoke — isolated, reversible development plugin proving the App Builder platform:
 * own DocType + child table, Custom Field on native Customer, Links to canonical Company/Customer,
 * role + company (User Permission) denial at the data boundary, AR/EN labels, enable/disable.
 * Disabled by default; enable from /plugins to test, disable to remove every overlay.
 */
import type { PluginManifest } from "../types";

export const digitPlatformSmoke: PluginManifest = {
  name: "digit_platform_smoke", title: "Digit Platform Smoke", title_ar: "اختبار منصة ديجيت", version: "0.1.0",
  publisher: "Digit", email: "dev@example.com", license: "MIT",
  description: "Development smoke-test app for the Virtual Core plugin platform.", description_ar: "تطبيق اختبار لمنصة الإضافات.",
  host_app: "erpnext", module: "Digit Platform Smoke", required_apps: ["frappe", "erpnext"],
  roles: ["Smoke User"],
  doctypes: [
    { name: "Smoke Test Item", istable: 1, module: "Digit Platform Smoke", permissions: [],
      fields: [
        { fieldname: "item_label", label: "Item Label", fieldtype: "Data", reqd: 1, in_list_view: 1 },
        { fieldname: "qty", label: "Qty", fieldtype: "Float", in_list_view: 1 },
      ] },
    { name: "Smoke Test Record", module: "Digit Platform Smoke", autoname: "SMOKE-.#####", title_field: "title", track_changes: 1,
      permissions: [
        { role: "System Manager", read: 1, write: 1, create: 1, delete: 1 },
        { role: "Smoke User", read: 1, write: 1, create: 1 },
      ],
      fields: [
        { fieldname: "title", label: "Title", fieldtype: "Data", reqd: 1, in_list_view: 1 },
        { fieldname: "company", label: "Company", fieldtype: "Link", options: "Company", reqd: 1, in_list_view: 1, in_standard_filter: 1 },
        { fieldname: "customer", label: "Customer", fieldtype: "Link", options: "Customer", in_list_view: 1 },
        { fieldname: "items", label: "Items", fieldtype: "Table", options: "Smoke Test Item" },
      ] },
  ],
  custom_fields: [
    { dt: "Customer", fieldname: "smoke_tag", label: "Smoke Tag", fieldtype: "Data", insert_after: "customer_name", description: "Added by digit_platform_smoke" },
  ],
  server_scripts: [
    { name: "Smoke Test Record Validate", script_type: "DocType Event", reference_doctype: "Smoke Test Record", doctype_event: "Before Save",
      validate: [{ condition: "!doc.title", message: "Title is required" }],
      script: `if not doc.title:\n    frappe.throw(_("Title is required"))\n` },
  ],
  workspaces: [{ name: "Digit Platform Smoke", label: "Digit Platform Smoke", module: "Digit Platform Smoke", number_cards: [], charts: [],
    shortcuts: [{ label: "Smoke Test Record", type: "DocType", link_to: "Smoke Test Record" }, { label: "Customer", type: "DocType", link_to: "Customer" }] }],
  translations: {
    "Digit Platform Smoke": "اختبار منصة ديجيت", "Smoke Test Record": "سجل اختبار", "Smoke Test Item": "بند اختبار",
    "Item Label": "اسم البند", "Smoke Tag": "وسم الاختبار", "Title": "العنوان", "Title is required": "العنوان مطلوب",
  },
};
