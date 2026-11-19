/**
 * Department 08 resources reports (owner spec catalog RPT-N26 … RPT-N29 plus the FT-08 read models that had no report).
 * Each runs the read model the resources screens use (domain/resources.ts, domain/resourcing.ts), so a report row and a
 * screen figure count the same rows. Charge-out, labour cost and cost splits are indicators and are never posted
 * (DEC-267 / 285 / 288). Python scripts stay server stubs.
 */
import type { PluginReport } from "../types";
import { currentUser, userRoles } from "@/lib/session";
import { today } from "./domain/data";
import { equipmentAvailability, equipmentChargeOut, fieldProduction, laborCost } from "./domain/resources";
import { costSplit, dailyLoad, expenseAging, maintenanceDue } from "./domain/resourcing";

type F = Record<string, unknown>;
const C = (fieldname: string, label: string, fieldtype = "Currency", options?: string) => ({ fieldname, label, fieldtype, ...(options ? { options } : {}), width: 130 });
const S = (q: string) => `# FRAPPE_SERVER_REQUIRED: the Virtual Core computes this report in digit_construction/reportsRes.ts (${q}).\n# Port it to Python and test it on staging before enabling this report on the DIGIT server site.\nraise NotImplementedError("${q}")\n`;
const L = (fieldname: string, label: string, options: string) => ({ fieldname, label, fieldtype: "Link", options });
const D = (fieldname: string, label: string) => ({ fieldname, label, fieldtype: "Date" });
const PRJ = [L("project", "Project", "Project")];
const RANGE = [D("from_date", "From Date"), D("to_date", "To Date")];
const pj = (f: F) => (f["project"] as string) || undefined;
const fromOf = (f: F) => (f["from_date"] as string) || `${today().slice(0, 7)}-01`;
const toOf = (f: F) => (f["to_date"] as string) || today();
/** DEC-279: individual wage / rate figures only for the accountant, director and project manager (project scope applies). */
export const RATE_ROLES = ["Digit Accountant", "Digit Director", "Digit Project Manager", "System Manager"];
export const seesRates = () => { const u = currentUser(); return u === "Administrator" || userRoles(u).some((r) => RATE_ROLES.includes(r)); };
/** DEC-259: production figures for PM / SE / QS / EST / DIR (ACC limited); PROC / SK have no access. */
export const PRODUCTION_ROLES = ["Digit Project Manager", "Digit Site Engineer", "Digit QS", "Digit Estimator", "Digit Director", "Digit Accountant", "System Manager"];
/** DEC-280: resource cost for PM / DIR / ACC (detail) and SE (team totals; rates hidden); EST / PROC / SK have no access. */
export const RESOURCE_COST_ROLES = ["Digit Project Manager", "Digit Director", "Digit Accountant", "Digit Site Engineer", "System Manager"];
const gate = <X,>(roles: string[], fn: () => X[]): X[] => { const u = currentUser(); return u === "Administrator" || userRoles(u).some((r) => roles.includes(r)) ? fn() : []; };

export const RES_REPORTS: PluginReport[] = [
  { name: "Maintenance Due", ref_doctype: "Digit Machinery", report_type: "Script Report", script: S("Maintenance Due"), filters: [D("as_of", "As Of")],
    columns: [C("machinery", "Machinery", "Link", "Digit Machinery"), C("last_pm_meter", "Last PM Meter", "Float"), C("current_meter", "Current Meter", "Float"), C("interval_hours", "Interval (h)", "Float"), C("due_in_hours", "Due In (h)", "Float"),
      C("last_pm_date", "Last PM Date", "Date"), C("interval_days", "Interval (days)", "Int"), C("due_date", "Due Date", "Date"), C("due", "Due", "Check")],
    run: (f) => maintenanceDue((f["as_of"] as string) || undefined).map((r) => ({ ...r, due: r.due ? 1 : 0 })) },
  { name: "Field Production", ref_doctype: "Task", report_type: "Script Report", script: S("Field Production"), filters: PRJ,
    columns: [C("task", "Task", "Link", "Task"), C("uom", "UOM", "Data"), C("budget_qty", "Budget Qty", "Float"), C("actual_qty", "Actual Qty", "Float"), C("budget_hours", "Budget h", "Float"), C("actual_hours", "Actual h", "Float"),
      C("earned_hours", "Earned h", "Float"), C("remaining_hours", "Remaining h", "Float"), C("projected_hours", "Projected h", "Float"), C("performance", "Performance", "Float")],
    run: (f) => gate(PRODUCTION_ROLES, () => fieldProduction(pj(f))).map((r) => ({ project: r.project, task: r.task, uom: r.uom, budget_qty: r.budgetQty, actual_qty: r.actualQty, budget_hours: r.budgetHours, actual_hours: r.actualHours, earned_hours: r.earnedHours, remaining_hours: r.remainingHours, projected_hours: r.projectedHours, performance: r.performance })) },
  { name: "Equipment Charge-out", ref_doctype: "Digit Equipment Assignment", report_type: "Script Report", script: S("Equipment Charge-out"), filters: [...PRJ, ...RANGE],
    columns: [C("machinery", "Machinery", "Link", "Digit Machinery"), C("project", "Project", "Link", "Project"), C("basis", "Basis", "Data"), C("qty", "Days/Hours", "Float"), C("mix", "Mix", "Data"), C("amount", "Amount (estimate)")],
    run: (f) => gate(RESOURCE_COST_ROLES, () => equipmentChargeOut(pj(f), fromOf(f), toOf(f))).map((r) => ({ machinery: r.machinery, project: r.project, basis: r.basis, qty: r.qty, mix: r.detail, amount: r.amount, currency: "SAR" })) },
  { name: "Equipment Availability", ref_doctype: "Digit Machinery", report_type: "Script Report", script: S("Equipment Availability"), filters: [D("as_of", "As Of")],
    columns: [C("machinery", "Machinery", "Link", "Digit Machinery"), C("type", "Type", "Data"), C("status", "Status", "Data"), C("booked_on", "Booked Today On", "Link", "Project"), C("next_booking", "Next Booking", "Date"), C("next_project", "Next Project", "Link", "Project")],
    run: (f) => equipmentAvailability((f["as_of"] as string) || undefined).map((a) => ({ machinery: a.machinery, type: a.type, status: a.status, booked_on: a.booking?.["project"] ?? "", next_booking: a.next?.["from_date"] ?? "", next_project: a.next?.["project"] ?? "" })) },
  { name: "Manpower Histogram", ref_doctype: "Digit Field Attendance", report_type: "Script Report", script: S("Manpower Histogram"), filters: [...PRJ, ...RANGE],
    columns: [C("date", "Date", "Date"), C("planned", "Planned Man-days", "Float"), C("actual", "Actual Man-days", "Float"), C("tasks", "Active Tasks", "Int")],
    run: (f) => gate(PRODUCTION_ROLES, () => dailyLoad(pj(f), fromOf(f), toOf(f))).map((d) => ({ date: d.date, planned: d.planned, actual: d.actual, tasks: d.tasks.length })) },
  { name: "Equipment Cost Split", ref_doctype: "Digit Machinery Usage", report_type: "Script Report", script: S("Equipment Cost Split"), filters: [...PRJ, ...RANGE],
    columns: [C("machinery", "Machinery", "Link", "Digit Machinery"), C("task", "Task", "Link", "Task"), C("cost_code", "Cost Code", "Data"), C("hours", "Hours", "Float"), C("share", "Share", "Percent"), C("amount", "Amount (estimate)")],
    run: (f) => { if (!gate(RESOURCE_COST_ROLES, () => [1]).length) return []; const by = new Map<string, number>(); for (const c of equipmentChargeOut(pj(f), fromOf(f), toOf(f))) by.set(c.machinery, (by.get(c.machinery) ?? 0) + c.amount);
      return [...by.entries()].flatMap(([m, cost]) => costSplit(m, fromOf(f), toOf(f), cost, pj(f)).map((r) => ({ ...r, share: Math.round(r.share * 10000) / 100, currency: "SAR" }))); } },
  { name: "Labour Cost (estimate)", ref_doctype: "Digit Field Attendance", report_type: "Script Report", script: S("Labour Cost"), filters: PRJ,
    columns: [C("attendance", "Site Attendance", "Link", "Digit Field Attendance"), C("date", "Date", "Date"), C("employee", "Employee", "Link", "Employee"), C("classification", "Classification", "Link", "Digit Labor Rate"), C("cost_code", "Cost Code", "Data"),
      C("hours", "Hours", "Float"), C("overtime", "Overtime Hours", "Float"), C("rate", "Rate"), C("amount", "Amount (estimate)")],
    run: (f) => { const show = seesRates(); return gate(RESOURCE_COST_ROLES, () => laborCost(pj(f))).map((l) => ({ ...l, rate: show ? l.rate : null, amount: show ? l.amount : null, currency: "SAR" })); } },
  { name: "Site Expense Aging", ref_doctype: "Digit Site Expense", report_type: "Script Report", script: S("Site Expense Aging"), filters: PRJ,
    columns: [C("expense", "Site Expense", "Link", "Digit Site Expense"), C("project", "Project", "Link", "Project"), C("expense_date", "Expense Date", "Date"), C("category", "Category", "Data"), C("amount", "Amount"), C("age_days", "Age (days)", "Int")],
    run: (f) => expenseAging(pj(f)) },
];
