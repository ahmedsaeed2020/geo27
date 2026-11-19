/**
 * Native module integration readiness (P3). Each domain lists the canonical native DocTypes a future DIGIT app reuses
 * (names verified against the frozen catalog by masterFoundation.test.ts) plus the existing virtual services that own
 * their effects. Resolution reads only the capability registry + runtime contract: child tables, in-domain links,
 * source-mapped conversions (get_mapped_doc buttons), lifecycle class and server-only actions. No app is built here.
 */
import type { CapabilityRegistry } from "./sourceTypes";
import { capabilityOf, childTablesOf, relationsOf } from "./capabilities";
import { classifyDocument, type RuntimeContract } from "./runtimeContract";
import { LOCAL_ACTIONS } from "./localActions";

export interface DomainDef { id: string; label: { en: string; ar: string }; department?: string; doctypes: string[]; services: string[]; notes: string[] }
export const DOMAINS: DomainDef[] = [
  { id: "finance", label: { en: "Accounts / Finance", ar: "الحسابات والمالية" }, department: "finance",
    doctypes: ["Company", "Account", "Cost Center", "Accounting Dimension", "Fiscal Year", "Journal Entry", "Payment Entry", "Sales Invoice", "Purchase Invoice", "GL Entry", "Payment Ledger Entry", "Budget", "Asset", "Asset Category", "Asset Movement", "Asset Depreciation Schedule"],
    services: ["src/lib/posting.ts (GL/outstanding, only writer of GL Entry)", "src/lib/budget.ts", "src/lib/dimensions.ts", "src/lib/assets.ts", "src/lib/assetDocs.ts", "src/lib/deferred.ts", "src/lib/reconciliation.ts"],
    notes: ["Plugins never write GL Entry; ledger effects come only from posting.ts submit/cancel.", "Asset submit (schedules/movement) is server-only; depreciation/sale/scrap run as local ports."] },
  { id: "selling_buying", label: { en: "Selling and Buying", ar: "المبيعات والمشتريات" },
    doctypes: ["Lead", "Opportunity", "Quotation", "Customer", "Sales Order", "Delivery Note", "Sales Invoice", "Material Request", "Request for Quotation", "Supplier Quotation", "Purchase Order", "Purchase Receipt", "Purchase Invoice", "Supplier", "Payment Entry"],
    services: ["src/lib/selling.ts (allowances, credit limit, back links)", "src/lib/posting.ts refreshPrev (per_billed/per_delivered)", "src/lib/crmHandoff.ts", "engines.ts mapDoc (get_mapped_doc preview)"], notes: [] },
  { id: "stock_manufacturing", label: { en: "Stock and Manufacturing", ar: "المخزون والتصنيع" },
    doctypes: ["Item", "Item Group", "UOM", "Warehouse", "Stock Entry", "Stock Entry Detail", "Stock Ledger Entry", "Stock Reconciliation", "BOM", "BOM Item", "BOM Operation", "Work Order", "Work Order Item", "Job Card", "Operation", "Workstation", "Production Plan", "Material Request", "Purchase Order", "Quality Inspection", "Batch", "Serial No", "Serial and Batch Bundle"],
    services: ["src/lib/stock.ts", "src/lib/serialBatch.ts", "src/lib/posting.ts (only writer of Stock Ledger Entry, repost/valuation)", "src/lib/departments.ts (Work Order / Quality Inspection lifecycle)"],
    notes: ["Job Card time logs, operation costing, Production Plan and subcontracting are FRAPPE_SERVER_REQUIRED (departments.ts SERVER_DEPENDENT).", "Do not rewrite Stock Ledger or valuation engines in an app."] },
  { id: "projects", label: { en: "Projects (Construction foundation)", ar: "المشاريع (أساس المقاولات)" }, department: "projects",
    doctypes: ["Project", "Project Type", "Task", "Task Depends On", "Timesheet", "Timesheet Detail", "Activity Type", "Customer", "Employee", "Expense Claim", "Purchase Order", "Purchase Invoice", "Sales Order", "Sales Invoice", "Cost Center", "Accounting Dimension"],
    services: ["src/lib/departments.ts (task/timesheet/project percent)", "src/lib/posting.ts (project/cost_center on GL lines)", "src/lib/dimensions.ts"],
    notes: ["Project is the canonical identity: BOQ / progress claims / retention extend it via app DocTypes linking project; never a second project master.", "A custom claim does not create GL Entry; invoicing goes through Sales Invoice + posting.ts."] },
  { id: "hrms", label: { en: "HRMS", ar: "الموارد البشرية" }, department: "hr",
    doctypes: ["Employee", "Department", "Designation", "Shift Type", "Shift Assignment", "Employee Checkin", "Attendance", "Leave Type", "Leave Allocation", "Leave Application", "Salary Structure", "Salary Structure Assignment", "Payroll Entry", "Salary Slip", "Expense Claim", "Employee Advance"],
    services: ["src/lib/departments.ts (leave ledger, shifts, payroll accrual JE)", "src/lib/hrms.ts", "/hr PWA routes"], notes: ["Python salary formulas beyond base/variable stay FRAPPE_SERVER_REQUIRED.", "HR Roster is a frontend screen over Shift Assignment, not a DocType."] },
  { id: "crm", label: { en: "CRM (DIGIT and DIGIT CRM)", ar: "إدارة علاقات العملاء" }, department: "crm",
    doctypes: ["Lead", "Opportunity", "Quotation", "Customer", "Contact", "Address", "CRM Lead", "CRM Deal", "CRM Organization"],
    services: ["src/lib/crmHandoff.ts (DIGIT Lead/Opportunity status)", "src/lib/crmLogic.ts (DIGIT CRM controllers)", "/crm SPA"],
    notes: ["DIGIT Opportunity (erpnext) and DIGIT CRM Deal (crm) are different DocTypes with different owners; never merged.", "WhatsApp is an optional missing dependency (OPTIONAL_DEPENDENCY_REQUIRED)."] },
  { id: "quality_support", label: { en: "Quality and Support", ar: "الجودة والدعم" },
    doctypes: ["Quality Inspection", "Quality Goal", "Quality Procedure", "Quality Review", "Quality Action", "Non Conformance", "Quality Feedback", "Quality Meeting", "Issue", "Issue Type", "Service Level Agreement", "Warranty Claim"],
    services: ["src/lib/departments.ts (inspection status, issue timestamps)"], notes: ["SLA timers and email-to-issue are FRAPPE_SERVER_REQUIRED."] },
];

export interface DomainRow {
  doctype: string; present: boolean; owner?: string; module?: string; istable?: boolean; child_tables: { fieldname: string; doctype: string }[];
  links_in_domain: { field: string; to: string }[]; mapped_to: { label: string; target: string; local: boolean }[]; server_actions: string[];
  document_class?: string; submit?: string; controller_hooks: string[];
}
export function resolveDomain(registry: CapabilityRegistry, contract: RuntimeContract | null | undefined, id: string): { domain: DomainDef; rows: DomainRow[]; missing: string[] } {
  const domain = DOMAINS.find((d) => d.id === id)!;
  const set = new Set(domain.doctypes);
  const rows = domain.doctypes.map((dt): DomainRow => {
    const c = capabilityOf(registry, dt);
    if (!c) return { doctype: dt, present: false, child_tables: [], links_in_domain: [], mapped_to: [], server_actions: [], controller_hooks: [] };
    const cls = classifyDocument(c.schema, contract?.lifecycle[dt]);
    return { doctype: dt, present: true, owner: c.owner, module: c.module, istable: !!c.schema.istable,
      child_tables: childTablesOf(registry, dt).map(({ fieldname, doctype }) => ({ fieldname, doctype })),
      links_in_domain: relationsOf(registry, dt).filter((r) => r.kind === "LINK" && r.to && set.has(r.to) && r.to !== dt).map((r) => ({ field: r.field, to: r.to! })),
      mapped_to: c.actions.filter((a) => a.target).map((a) => ({ label: a.label, target: a.target!, local: !!LOCAL_ACTIONS[`${dt}::${a.label}`] })),
      server_actions: c.actions.filter((a) => !a.target && a.method && !LOCAL_ACTIONS[`${dt}::${a.label}`]).map((a) => `${a.label} (${a.method})`),
      document_class: cls.class, submit: cls.submit, controller_hooks: c.controller.hooks ?? [] };
  });
  return { domain, rows, missing: rows.filter((r) => !r.present).map((r) => r.doctype) };
}
