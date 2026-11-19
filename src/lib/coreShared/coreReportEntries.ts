/**
 * Reports the shared Core adds where the Saudi deployment's regional app would provide them (owner decision: build in
 * the Core). Pure data: catalog.ts reportsQuery appends these entries after the frozen catalog reports, and
 * src/lib/reportRunnersCore.ts computes them, so /report/<name> opens them like any native report.
 */
import type { ReportEntry } from "@/lib/catalog";

export const CORE_REPORT_ENTRIES: ReportEntry[] = [
  { app: "erpnext", name: "Zatca Integration Summary", ref_doctype: "Sales Invoice", report_type: "Script Report", module: "Regional", source: "digit_core:reportRunnersCore.ts", status: "core",
    columns: [], has_query: false, has_py_execute: true, roles: ["Accounts User", "Accounts Manager", "System Manager"],
    filters: [{ fieldname: "company", label: "Company", fieldtype: "Link", options: "Company", reqd: true }, { fieldname: "from_date", label: "From Date", fieldtype: "Date", reqd: false },
      { fieldname: "to_date", label: "To Date", fieldtype: "Date", reqd: false }, { fieldname: "status", label: "ZATCA Status", fieldtype: "Select", reqd: false }] },
  { app: "erpnext", name: "Purchase Price Variance", ref_doctype: "Purchase Invoice", report_type: "Script Report", module: "Buying", source: "digit_core:reportRunnersCore.ts", status: "core",
    columns: [], has_query: false, has_py_execute: true, roles: ["Accounts User", "Accounts Manager", "Purchase Manager", "Purchase User", "System Manager"],
    filters: [{ fieldname: "company", label: "Company", fieldtype: "Link", options: "Company", reqd: true }, { fieldname: "from_date", label: "From Date", fieldtype: "Date", reqd: false },
      { fieldname: "to_date", label: "To Date", fieldtype: "Date", reqd: false }, { fieldname: "supplier", label: "Supplier", fieldtype: "Link", options: "Supplier", reqd: false }] },
  { app: "erpnext", name: "Asset Rollforward", ref_doctype: "Asset", report_type: "Script Report", module: "Assets", source: "digit_core:reportRunnersCore.ts", status: "core",
    columns: [], has_query: false, has_py_execute: true, roles: ["Accounts User", "Accounts Manager", "Quality Manager", "System Manager"],
    filters: [{ fieldname: "company", label: "Company", fieldtype: "Link", options: "Company", reqd: true }, { fieldname: "from_date", label: "From Date", fieldtype: "Date", reqd: false },
      { fieldname: "to_date", label: "To Date", fieldtype: "Date", reqd: false }, { fieldname: "finance_book", label: "Finance Book", fieldtype: "Link", options: "Finance Book", reqd: false }] },
];
