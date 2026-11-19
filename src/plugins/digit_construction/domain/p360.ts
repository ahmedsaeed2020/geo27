/**
 * Project 360 groups and document drills (F02-01-2): the eight source groups (historical src/entities/project360.tsx
 * tabGroups) and the filters behind the figures, so each card opens exactly the records the read model sums (domain/data.ts).
 */
import { certificatesOf, today, type projectCommercial } from "./data";

type F = [string, string, unknown];
export const P360_TABS = [
  ["overview", "Overview", "نظرة عامة"], ["contracts", "Contracts & changes", "العقود والتغييرات"], ["cost", "Budget & cost", "الموازنة والتكلفة"], ["execution", "Execution", "التنفيذ"],
  ["procurement", "Procurement & materials", "المشتريات والمواد"], ["resources", "Resources", "الموارد"], ["finance", "Financial position & closeout", "الموقف المالي والإغلاق"], ["reports", "Reports & activity", "التقارير والنشاط"],
] as const;
export function p360Filters(project: string, com: ReturnType<typeof projectCommercial>) {
  const contracts = com.contracts.map((c) => c.name);
  const certs = com.contracts.flatMap((c) => certificatesOf(c.name)).map((c) => c.name);
  return {
    tasks: { doctype: "Task", filters: [["project", "=", project]] as F[] },
    // scheduleSlipDays / overdueTasks: tasks of the project past their planned end, below 100 % and not completed or cancelled
    lateTasks: { doctype: "Task", filters: [["project", "=", project], ["exp_end_date", "<", today()], ["progress", "<", 100], ["status", "not in", ["Completed", "Cancelled"]]] as F[] },
    // contractPosition: submitted certificates of the project's non-draft contracts; invoiced/collected: submitted Sales Invoices made from those certificates
    certificates: { doctype: "Digit Client Certificate", filters: [["contract", "in", contracts], ["docstatus", "=", 1]] as F[] },
    invoices: { doctype: "Sales Invoice", filters: [["digit_client_certificate", "in", certs], ["docstatus", "=", 1]] as F[] },
  };
}
