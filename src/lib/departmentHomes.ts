/** Department home definitions (Finance, HR, Projects, CRM, Insights). Pure navigation + indicator config over
 * existing native DocTypes, reports and routes; values are computed at render time from scoped adapter records
 * (src/lib/scope.ts), never stored. No new data model. */
import type { Doc } from "@/lib/adapter";

export type L = { en: string; ar: string };
export type Ind = { label: L; doctype: string; filter?: (d: Doc) => boolean; sum?: string; list?: [string, string, unknown][] };
export type Group = { label: L; doctypes: string[] };
export type Ext = { label: L; to: string; params?: Record<string, string>; search?: Record<string, string> };
export type Dept = { id: string; title: L; desc: L; sidebar?: string; indicators: Ind[]; pending: Ind[]; groups: Group[]; reports: string[]; links: Ext[] };

const sub = (d: Doc) => d.docstatus === 1;
const draft = (d: Doc) => !d.docstatus;
const DRAFT: [string, string, unknown][] = [["docstatus", "=", 0]];
const OUT: [string, string, unknown][] = [["docstatus", "=", 1], ["outstanding_amount", ">", 0]];
const owes = (d: Doc) => sub(d) && Number(d["outstanding_amount"] ?? 0) > 0;
const st = (v: string) => (d: Doc) => d["status"] === v;
const stF = (v: string): [string, string, unknown][] => [["status", "=", v]];

export const DEPARTMENTS: Dept[] = [
  { id: "finance", title: { en: "Finance", ar: "المالية" }, desc: { en: "Accounting, receivables, payables, bank and financial reports.", ar: "المحاسبة والذمم المدينة والدائنة والبنوك والتقارير المالية." }, sidebar: "Accounts",
    indicators: [
      { label: { en: "Receivable outstanding", ar: "المستحق من العملاء" }, doctype: "Sales Invoice", filter: owes, sum: "outstanding_amount", list: OUT },
      { label: { en: "Payable outstanding", ar: "المستحق للموردين" }, doctype: "Purchase Invoice", filter: owes, sum: "outstanding_amount", list: OUT },
      { label: { en: "Posted journal entries", ar: "القيود المرحّلة" }, doctype: "Journal Entry", filter: sub, list: [["docstatus", "=", 1]] },
      { label: { en: "Posted payments", ar: "المدفوعات المرحّلة" }, doctype: "Payment Entry", filter: sub, list: [["docstatus", "=", 1]] },
    ],
    pending: [
      { label: { en: "Draft sales invoices", ar: "فواتير مبيعات مسودة" }, doctype: "Sales Invoice", filter: draft, list: DRAFT },
      { label: { en: "Draft purchase invoices", ar: "فواتير مشتريات مسودة" }, doctype: "Purchase Invoice", filter: draft, list: DRAFT },
      { label: { en: "Draft journal entries", ar: "قيود مسودة" }, doctype: "Journal Entry", filter: draft, list: DRAFT },
      { label: { en: "Unreconciled bank transactions", ar: "حركات بنكية غير مسوّاة" }, doctype: "Bank Transaction", filter: (d) => d["status"] !== "Reconciled" && sub(d), list: [["docstatus", "=", 1], ["status", "!=", "Reconciled"]] },
    ],
    groups: [
      { label: { en: "Accounting", ar: "المحاسبة" }, doctypes: ["Account", "Journal Entry", "Payment Entry", "Cost Center", "Fiscal Year", "Period Closing Voucher"] },
      { label: { en: "Receivables", ar: "الذمم المدينة" }, doctypes: ["Sales Invoice", "Customer", "Dunning"] },
      { label: { en: "Payables", ar: "الذمم الدائنة" }, doctypes: ["Purchase Invoice", "Supplier"] },
      { label: { en: "Bank and cash", ar: "البنوك والنقد" }, doctypes: ["Bank Account", "Bank Transaction", "Bank Clearance", "Payment Reconciliation", "Mode of Payment"] },
      { label: { en: "Assets and budget", ar: "الأصول والميزانية" }, doctypes: ["Asset", "Budget", "Finance Book"] },
    ],
    reports: ["General Ledger", "Trial Balance", "Balance Sheet", "Profit and Loss Statement", "Cash Flow", "Accounts Receivable", "Accounts Receivable Summary", "Accounts Payable", "Bank Clearance Summary", "Gross Profit", "Budget Variance Report"],
    links: [{ label: { en: "Chart of Accounts", ar: "دليل الحسابات" }, to: "/app/$app/$doctype/view/tree", params: { app: "erpnext", doctype: "account" } }],
  },
  { id: "hr", title: { en: "Human Resources", ar: "الموارد البشرية" }, desc: { en: "People, attendance and shifts, leave, payroll and expenses.", ar: "الموظفون والحضور والورديات والإجازات والرواتب والمصروفات." }, sidebar: "HR",
    indicators: [
      { label: { en: "Active employees", ar: "الموظفون النشطون" }, doctype: "Employee", filter: st("Active"), list: stF("Active") },
      { label: { en: "Approved leave", ar: "إجازات معتمدة" }, doctype: "Leave Application", filter: (d) => sub(d) && d["status"] === "Approved", list: [["docstatus", "=", 1], ["status", "=", "Approved"]] },
      { label: { en: "Attendance records", ar: "سجلات الحضور" }, doctype: "Attendance", filter: sub, list: [["docstatus", "=", 1]] },
      { label: { en: "Posted salary slips", ar: "قسائم رواتب مرحّلة" }, doctype: "Salary Slip", filter: sub, list: [["docstatus", "=", 1]] },
    ],
    pending: [
      { label: { en: "Leave awaiting approval", ar: "إجازات بانتظار الاعتماد" }, doctype: "Leave Application", filter: (d) => draft(d) && d["status"] === "Open", list: [["docstatus", "=", 0], ["status", "=", "Open"]] },
      { label: { en: "Expense claims awaiting approval", ar: "مطالبات مصروفات بانتظار الاعتماد" }, doctype: "Expense Claim", filter: draft, list: DRAFT },
      { label: { en: "Draft payroll entries", ar: "مسيرات رواتب مسودة" }, doctype: "Payroll Entry", filter: draft, list: DRAFT },
      { label: { en: "Draft salary slips", ar: "قسائم رواتب مسودة" }, doctype: "Salary Slip", filter: draft, list: DRAFT },
    ],
    groups: [
      { label: { en: "People", ar: "الموظفون" }, doctypes: ["Employee", "Department", "Designation", "Branch"] },
      { label: { en: "Attendance and shifts", ar: "الحضور والورديات" }, doctypes: ["Attendance", "Employee Checkin", "Shift Type", "Shift Assignment", "Shift Request", "Attendance Request"] },
      { label: { en: "Leave", ar: "الإجازات" }, doctypes: ["Leave Application", "Leave Allocation", "Leave Type", "Holiday List"] },
      { label: { en: "Payroll", ar: "الرواتب" }, doctypes: ["Payroll Entry", "Salary Structure", "Salary Structure Assignment", "Salary Slip", "Salary Component"] },
      { label: { en: "Expenses", ar: "المصروفات" }, doctypes: ["Expense Claim", "Employee Advance"] },
    ],
    reports: ["Monthly Attendance Sheet", "Employee Leave Balance", "Salary Register", "Employee Analytics"],
    links: [
      { label: { en: "Shift roster", ar: "جدول الورديات" }, to: "/hr/roster" },
      { label: { en: "HR self-service app", ar: "تطبيق الخدمة الذاتية" }, to: "/hr/home" },
    ],
  },
  { id: "projects", title: { en: "Projects", ar: "المشاريع" }, desc: { en: "Projects, tasks, timesheets and linked purchasing.", ar: "المشاريع والمهام وسجلات الوقت والمشتريات المرتبطة." }, sidebar: "Projects",
    indicators: [
      { label: { en: "Open projects", ar: "مشاريع مفتوحة" }, doctype: "Project", filter: st("Open"), list: stF("Open") },
      { label: { en: "Completed projects", ar: "مشاريع مكتملة" }, doctype: "Project", filter: st("Completed"), list: stF("Completed") },
      { label: { en: "Open tasks", ar: "مهام مفتوحة" }, doctype: "Task", filter: (d) => d["status"] !== "Completed" && d["status"] !== "Cancelled", list: [["status", "not in", ["Completed", "Cancelled"]]] },
      { label: { en: "Tracked hours (posted)", ar: "الساعات المسجلة (مرحّلة)" }, doctype: "Timesheet", filter: sub, sum: "total_hours", list: [["docstatus", "=", 1]] },
    ],
    pending: [
      { label: { en: "Overdue tasks", ar: "مهام متأخرة" }, doctype: "Task", filter: st("Overdue"), list: stF("Overdue") },
      { label: { en: "Draft timesheets", ar: "سجلات وقت مسودة" }, doctype: "Timesheet", filter: draft, list: DRAFT },
      { label: { en: "Draft purchase orders", ar: "أوامر شراء مسودة" }, doctype: "Purchase Order", filter: (d) => draft(d) && !!d["project"], list: [...DRAFT, ["project", "is", "set"]] },
    ],
    groups: [
      { label: { en: "Projects and tasks", ar: "المشاريع والمهام" }, doctypes: ["Project", "Task", "Project Template", "Project Type"] },
      { label: { en: "Time tracking", ar: "تتبع الوقت" }, doctypes: ["Timesheet", "Activity Type", "Activity Cost"] },
      { label: { en: "Linked purchasing", ar: "المشتريات المرتبطة" }, doctypes: ["Material Request", "Purchase Order", "Purchase Invoice"] },
    ],
    reports: ["Project Summary", "Daily Timesheet Summary", "Project wise Stock Tracking"],
    links: [{ label: { en: "Task tree", ar: "شجرة المهام" }, to: "/app/$app/$doctype/view/tree", params: { app: "erpnext", doctype: "task" } }],
  },
  { id: "crm", title: { en: "Sales CRM", ar: "إدارة علاقات العملاء" }, desc: { en: "DIGIT leads, opportunities, quotations and conversion to customers and orders.", ar: "العملاء المحتملون والفرص وعروض الأسعار والتحويل إلى عملاء وأوامر بيع." }, sidebar: "CRM",
    indicators: [
      { label: { en: "Open leads", ar: "عملاء محتملون مفتوحون" }, doctype: "Lead", filter: (d) => !["Converted", "Do Not Contact"].includes(String(d["status"])), list: [["status", "not in", ["Converted", "Do Not Contact"]]] },
      { label: { en: "Open opportunities", ar: "فرص مفتوحة" }, doctype: "Opportunity", filter: st("Open"), list: stF("Open") },
      { label: { en: "Opportunities with quotation", ar: "فرص لها عرض سعر" }, doctype: "Opportunity", filter: st("Quotation"), list: stF("Quotation") },
      { label: { en: "Converted opportunities", ar: "فرص محوّلة" }, doctype: "Opportunity", filter: st("Converted"), list: stF("Converted") },
    ],
    pending: [
      { label: { en: "Draft quotations", ar: "عروض أسعار مسودة" }, doctype: "Quotation", filter: draft, list: DRAFT },
      { label: { en: "Draft sales orders", ar: "أوامر بيع مسودة" }, doctype: "Sales Order", filter: draft, list: DRAFT },
      { label: { en: "Leads to reply", ar: "عملاء محتملون بانتظار الرد" }, doctype: "Lead", filter: st("Open"), list: stF("Open") },
    ],
    groups: [
      { label: { en: "Pipeline", ar: "مسار المبيعات" }, doctypes: ["Lead", "Opportunity", "Prospect", "Campaign"] },
      { label: { en: "Customers and contacts", ar: "العملاء وجهات الاتصال" }, doctypes: ["Customer", "Contact", "Address"] },
      { label: { en: "Sales documents", ar: "مستندات المبيعات" }, doctypes: ["Quotation", "Sales Order", "Sales Invoice"] },
      { label: { en: "Activities", ar: "الأنشطة" }, doctypes: ["ToDo", "Event", "Communication"] },
    ],
    reports: ["Lead Details", "Sales Pipeline Analytics", "Opportunity Summary by Sales Stage", "Lead Conversion Time", "Lost Opportunity"],
    links: [{ label: { en: "DIGIT CRM app (separate)", ar: "تطبيق DIGIT CRM (مستقل)" }, to: "/crm/leads" }],
  },
  { id: "insights", title: { en: "Insights", ar: "التحليلات" }, desc: { en: "Local virtual analytics engine over the shared records; no DIGIT Insights server.", ar: "محرك تحليلات افتراضي محلي على السجلات المشتركة، بدون خادم DIGIT Insights." },
    indicators: [], pending: [], groups: [],
    reports: ["General Ledger", "Salary Register", "Project Summary", "Sales Pipeline Analytics"],
    links: [
      { label: { en: "Dashboards", ar: "لوحات المعلومات" }, to: "/insights/dashboards" },
      { label: { en: "Workbooks", ar: "دفاتر العمل" }, to: "/insights/workbook" },
      { label: { en: "Data sources", ar: "مصادر البيانات" }, to: "/insights/data-source" },
      { label: { en: "All reports", ar: "كل التقارير" }, to: "/report" },
    ],
  },
];

/** Cross-department analytics shortcuts shown on each department home. */
export const DEPT_ANALYTICS: Ext[] = [{ label: { en: "Insights dashboards", ar: "لوحات التحليلات" }, to: "/insights/dashboards" }];
