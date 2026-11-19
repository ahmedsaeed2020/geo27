/** Sample app built ONLY through the Plugin SDK (Step 2.7). No core file references it except the registry list. */
import { adapter } from "@/lib/adapter";
import type { PluginManifest } from "../types";

const n = (v: unknown) => Number(v) || 0;
const submittedSI = () => adapter.list("Sales Invoice").filter((d) => n(d.docstatus) === 1 && !n(d["is_return"]));

export const digitSalesCockpit: PluginManifest = {
  name: "digit_sales_cockpit", title: "Digit Sales Cockpit", title_ar: "لوحة قيادة المبيعات",
  version: "1.0.0", publisher: "Digit", email: "apps@digit.example", license: "MIT",
  description: "Sales KPIs workspace, customer tier, invoice statement button, customer sales report and a branded print format.",
  description_ar: "مساحة عمل لمؤشرات المبيعات، ومستوى العميل، وزر كشف الحساب في الفاتورة، وتقرير مبيعات العملاء، وتنسيق طباعة.",
  host_app: "erpnext", module: "Digit Sales Cockpit", required_apps: ["frappe", "erpnext"],
  doctypes: [{
    name: "Cockpit Sales Target", module: "Digit Sales Cockpit", autoname: "format:CST-{customer}-{fiscal_year}", naming_rule: "Expression", title_field: "customer_name", track_changes: 1,
    fields: [
      { fieldname: "customer", fieldtype: "Link", label: "Customer", options: "Customer", reqd: 1, in_list_view: 1, in_standard_filter: 1 },
      { fieldname: "customer_name", fieldtype: "Data", label: "Customer Name", fetch_from: "customer.customer_name", read_only: 1, in_list_view: 1 },
      { fieldname: "column_break_1", fieldtype: "Column Break" },
      { fieldname: "fiscal_year", fieldtype: "Link", label: "Fiscal Year", options: "Fiscal Year", reqd: 1, in_list_view: 1 },
      { fieldname: "target_amount", fieldtype: "Currency", label: "Target Amount", reqd: 1, in_list_view: 1 },
      { fieldname: "notes", fieldtype: "Small Text", label: "Notes" },
    ],
    permissions: [
      { role: "Sales Manager", read: 1, write: 1, create: 1, delete: 1, report: 1, export: 1, print: 1, email: 1, share: 1 },
      { role: "Sales Cockpit User", read: 1, report: 1, print: 1 },
    ],
    controller: `import frappe\nfrom frappe import _\nfrom frappe.model.document import Document\n\n\nclass CockpitSalesTarget(Document):\n\tdef validate(self):\n\t\tif self.target_amount <= 0:\n\t\t\tfrappe.throw(_("Target Amount must be greater than zero"))\n`,
  }],
  custom_fields: [
    { dt: "Customer", fieldname: "custom_customer_tier", label: "Customer Tier", fieldtype: "Select", options: "\nGold\nSilver\nBronze", insert_after: "customer_group", in_standard_filter: 1, in_list_view: 1, description: "Set by the sales team; used by the Sales Cockpit." },
  ],
  property_setters: [
    { doc_type: "Customer", doctype_or_field: "DocField", field_name: "custom_customer_tier", property: "bold", value: "1", property_type: "Check" },
  ],
  client_scripts: [{
    name: "Sales Invoice - Cockpit Statement", dt: "Sales Invoice", view: "Form",
    buttons: [{ label: "Customer Sales Summary", group: "View", condition: "doc.docstatus == 1", action: { type: "route", to: "/plugins/digit_sales_cockpit/report/Customer Sales Summary?customer={customer}" } }],
    script: `frappe.ui.form.on("Sales Invoice", {
\trefresh(frm) {
\t\tif (frm.doc.docstatus === 1) {
\t\t\tfrm.add_custom_button(__("Customer Sales Summary"), () => {
\t\t\t\tfrappe.set_route("query-report", "Customer Sales Summary", { customer: frm.doc.customer });
\t\t\t}, __("View"));
\t\t}
\t},
});
`,
  }],
  server_scripts: [
    { name: "Customer Tier Required For Large Invoices", script_type: "DocType Event", reference_doctype: "Sales Invoice", doctype_event: "Before Submit",
      validate: [{ condition: "doc.grand_total > 1000000", message: "Invoices above 1,000,000 need sales manager review ({name})" }],
      script: `if doc.grand_total > 1000000:\n    frappe.throw(_("Invoices above 1,000,000 need sales manager review ({0})").format(doc.name))\n` },
    { name: "Cockpit Sales Target Validate", script_type: "DocType Event", reference_doctype: "Cockpit Sales Target", doctype_event: "Before Save",
      validate: [{ condition: "!(doc.target_amount > 0)", message: "Target Amount must be greater than zero" }],
      script: `if not doc.target_amount or doc.target_amount <= 0:\n    frappe.throw(_("Target Amount must be greater than zero"))\n` },
    { name: "Cockpit Top Customers", script_type: "API", api_method: "top_customers",
      handler: (args) => topCustomers(Number(args["limit"] ?? 5)),
      script: `limit = frappe.form_dict.get("limit") or 5\nfrappe.response["message"] = frappe.db.sql("""\n    select customer, customer_name, sum(base_grand_total) as total\n    from \`tabSales Invoice\` where docstatus = 1 and is_return = 0\n    group by customer order by total desc limit %s""", (int(limit),), as_dict=True)\n` },
  ],
  number_cards: [
    { name: "Cockpit Sales This Month", label: "Sales This Month", document_type: "Sales Invoice", function: "Sum", aggregate_function_based_on: "base_grand_total", filters: [["Sales Invoice", "docstatus", "=", 1], ["Sales Invoice", "posting_date", ">=", "This Month Start"]], color: "#2490EF" },
    { name: "Cockpit Outstanding AR", label: "Outstanding Receivables", document_type: "Sales Invoice", function: "Sum", aggregate_function_based_on: "outstanding_amount", filters: [["Sales Invoice", "docstatus", "=", 1]], color: "#ECAD4B" },
    { name: "Cockpit Overdue Invoices", label: "Overdue Invoices", document_type: "Sales Invoice", function: "Count", filters: [["Sales Invoice", "docstatus", "=", 1], ["Sales Invoice", "status", "=", "Overdue"]], color: "#E24C4C" },
  ],
  dashboard_charts: [
    { name: "Cockpit Top Customers", chart_name: "Top Customers", chart_type: "Group By", document_type: "Sales Invoice", group_by_based_on: "customer_name", value_based_on: "base_grand_total", type: "Bar", filters: [["Sales Invoice", "docstatus", "=", 1]], limit: 5 },
  ],
  workspaces: [{
    name: "Digit Sales Cockpit", label: "Digit Sales Cockpit", module: "Digit Sales Cockpit",
    number_cards: ["Cockpit Sales This Month", "Cockpit Outstanding AR", "Cockpit Overdue Invoices"], charts: ["Cockpit Top Customers"],
    shortcuts: [{ label: "Sales Invoice", type: "DocType", link_to: "Sales Invoice" }, { label: "Customer", type: "DocType", link_to: "Customer" }, { label: "Cockpit Sales Target", type: "DocType", link_to: "Cockpit Sales Target" }, { label: "Customer Sales Summary", type: "Report", link_to: "Customer Sales Summary" }],
  }],
  reports: [{
    name: "Customer Sales Summary", ref_doctype: "Sales Invoice", report_type: "Script Report",
    filters: [{ fieldname: "customer", label: "Customer", fieldtype: "Link", options: "Customer" }],
    columns: [
      { fieldname: "customer", label: "Customer", fieldtype: "Link", options: "Customer", width: 160 },
      { fieldname: "customer_name", label: "Customer Name", fieldtype: "Data", width: 200 },
      { fieldname: "invoices", label: "Invoices", fieldtype: "Int", width: 90 },
      { fieldname: "invoiced", label: "Invoiced Amount", fieldtype: "Currency", width: 140 },
      { fieldname: "outstanding", label: "Outstanding Amount", fieldtype: "Currency", width: 140 },
    ],
    run: (f) => {
      const by = new Map<string, Record<string, unknown>>();
      for (const d of submittedSI()) {
        if (f["customer"] && d["customer"] !== f["customer"]) continue;
        const k = String(d["customer"]); const r = by.get(k) ?? { customer: k, customer_name: d["customer_name"], invoices: 0, invoiced: 0, outstanding: 0 };
        r["invoices"] = n(r["invoices"]) + 1; r["invoiced"] = Math.round((n(r["invoiced"]) + n(d["base_grand_total"] ?? d["grand_total"])) * 100) / 100; r["outstanding"] = Math.round((n(r["outstanding"]) + n(d["outstanding_amount"])) * 100) / 100;
        by.set(k, r);
      }
      return [...by.values()].sort((a, b) => n(b["invoiced"]) - n(a["invoiced"]));
    },
    script: `def execute(filters=None):\n    filters = filters or {}\n    conditions = {"docstatus": 1, "is_return": 0}\n    if filters.get("customer"):\n        conditions["customer"] = filters["customer"]\n    rows = frappe.get_all("Sales Invoice", filters=conditions,\n        fields=["customer", "customer_name", "count(name) as invoices", "sum(base_grand_total) as invoiced", "sum(outstanding_amount) as outstanding"],\n        group_by="customer", order_by="invoiced desc")\n    columns = [\n        {"fieldname": "customer", "label": _("Customer"), "fieldtype": "Link", "options": "Customer", "width": 160},\n        {"fieldname": "customer_name", "label": _("Customer Name"), "fieldtype": "Data", "width": 200},\n        {"fieldname": "invoices", "label": _("Invoices"), "fieldtype": "Int", "width": 90},\n        {"fieldname": "invoiced", "label": _("Invoiced Amount"), "fieldtype": "Currency", "width": 140},\n        {"fieldname": "outstanding", "label": _("Outstanding Amount"), "fieldtype": "Currency", "width": 140},\n    ]\n    return columns, rows\n`,
  }],
  print_formats: [{
    name: "Digit Cockpit Invoice", doc_type: "Sales Invoice", print_format_type: "Jinja",
    html: `<div class="dsc-head"><h2>{{ doc.company }}</h2><h3>{{ _("Tax Invoice") }} {{ doc.name }}</h3></div>
<table class="dsc-meta"><tr><td>{{ _("Customer") }}</td><td>{{ doc.customer_name }}</td><td>{{ _("Date") }}</td><td>{{ doc.get_formatted("posting_date") }}</td></tr></table>
<table class="dsc-items"><thead><tr><th>#</th><th>{{ _("Item") }}</th><th>{{ _("Qty") }}</th><th>{{ _("Rate") }}</th><th>{{ _("Amount") }}</th></tr></thead>
<tbody>{% for row in doc.items %}<tr><td>{{ row.idx }}</td><td>{{ row.item_name }}</td><td>{{ row.qty }}</td><td>{{ row.get_formatted("rate") }}</td><td>{{ row.get_formatted("amount") }}</td></tr>{% endfor %}</tbody></table>
<p class="dsc-total">{{ _("Grand Total") }}: {{ doc.get_formatted("grand_total") }}</p>
<p>{{ doc.in_words }}</p>`,
    css: `.dsc-head{border-bottom:2px solid #2490EF;margin-bottom:12px}.dsc-items{width:100%;border-collapse:collapse}.dsc-items th,.dsc-items td{border:1px solid #ccc;padding:4px}.dsc-total{font-weight:bold;text-align:end}`,
  }],
  notifications: [{ name: "Cockpit Overdue Alert", document_type: "Sales Invoice", event: "Submit", subject: "Invoice {name} submitted for {customer_name}", subject_ar: "تم ترحيل الفاتورة {name} للعميل {customer_name}", message: "Grand total {grand_total}", recipients: [{ receiver_by_role: "Sales Manager" }], channel: "System Notification" }],
  roles: ["Sales Cockpit User"],
  translations: {
    "Digit Sales Cockpit": "لوحة قيادة المبيعات", "Customer Tier": "مستوى العميل", Gold: "ذهبي", Silver: "فضي", Bronze: "برونزي",
    "Customer Sales Summary": "ملخص مبيعات العملاء", "Sales This Month": "مبيعات هذا الشهر", "Outstanding Receivables": "الذمم المدينة المستحقة",
    "Overdue Invoices": "الفواتير المتأخرة", "Top Customers": "أفضل العملاء", "Invoiced Amount": "المبلغ المفوتر", Invoices: "الفواتير",
    "Digit Cockpit Invoice": "فاتورة لوحة القيادة", "Set by the sales team; used by the Sales Cockpit.": "يحدده فريق المبيعات؛ وتستخدمه لوحة قيادة المبيعات.",
    "Sales Cockpit User": "مستخدم لوحة قيادة المبيعات", "Cockpit Sales Target": "المستهدف البيعي", "Target Amount": "المبلغ المستهدف",
    "Target Amount must be greater than zero": "يجب أن يكون المبلغ المستهدف أكبر من صفر", "Tax Invoice": "فاتورة ضريبية",
  },
  fixtures: [
    { doctype: "Role", name: "Sales Cockpit User", data: { role_name: "Sales Cockpit User", desk_access: 1 } },
    { doctype: "Cockpit Sales Target", name: "CST-DDT-CUST-001-2026", data: { customer: "DDT-CUST-001", fiscal_year: "2026", target_amount: 250000, docstatus: 0 } },
  ],
};

export function topCustomers(limit = 5) {
  const by = new Map<string, { customer: string; customer_name: unknown; total: number }>();
  for (const d of submittedSI()) { const k = String(d["customer"]); const r = by.get(k) ?? { customer: k, customer_name: d["customer_name"], total: 0 }; r.total = Math.round((r.total + n(d["base_grand_total"] ?? d["grand_total"])) * 100) / 100; by.set(k, r); }
  return [...by.values()].sort((a, b) => b.total - a.total).slice(0, limit);
}
