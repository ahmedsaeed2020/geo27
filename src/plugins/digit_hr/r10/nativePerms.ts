/**
 * The role matrix (./roles.ts) applied to the native DocTypes of each HR section (nativeMap MAP), as app DocPerm rows the
 * plugin runtime appends to the frozen definitions (never written into them). An existing role row on a DocType is kept,
 * so a native grant is never narrowed or duplicated here; the record scope narrowing is ./scope.ts.
 */
import MAP from "../nativeMap";
import { HR_ROLES, LEVEL1_ROLES, permRow } from "./roles";
import { R10_NAMES } from "./doctypes";
import type { PluginDocPerm } from "@/plugins/types";

/** Native DocTypes that carry an employee link (self/team roles may write only these). */
const EMPLOYEE_DOCS = new Set(["Leave Application", "Attendance", "Attendance Request", "Employee Checkin", "Shift Request", "Expense Claim", "Employee Advance", "Travel Request", "Compensatory Leave Request", "Employee Grievance", "Appraisal", "Goal", "Employee Performance Feedback", "Training Feedback", "Employee Skill Map", "Employee Referral", "Employee Separation", "Exit Interview", "Employee Benefit Application", "Employee Benefit Claim", "Employee Tax Exemption Declaration", "Employee Tax Exemption Proof Submission", "Salary Slip", "Timesheet", "Interview Feedback", "Leave Encashment", "Employee Onboarding", "Employee Promotion", "Employee Transfer", "Shift Assignment", "Employee Incentive", "Retention Bonus", "Additional Salary", "Salary Structure Assignment", "Employee", "Full and Final Statement", "Gratuity", "Daily Work Summary", "Vehicle Log", "Employee Health Insurance"]);
/** Pay and separation documents a line manager never reads through the matrix (identityScope keeps them HR-only too). */
const PAY_DOCS = new Set(["Salary Slip", "Additional Salary", "Salary Structure Assignment", "Retention Bonus", "Employee Incentive", "Full and Final Statement", "Gratuity", "Leave Encashment", "Employee Advance", "Employee Tax Exemption Declaration", "Employee Tax Exemption Proof Submission", "Employee Promotion", "Employee Transfer", "Employee Separation", "Employee"]);
/** Setup DocTypes no specialist role creates through a section letter (only HR Manager / CHRO / HR Admin change them). */
const SETUP = new Set(["Company", "Department", "Designation", "Branch", "Employee Grade", "Employment Type", "Holiday List", "Leave Type", "Leave Policy", "Salary Component", "Salary Structure", "HR Settings", "Payroll Settings", "Shift Type", "Role", "User", "Role Profile", "Module Profile", "Workflow", "Customize Form", "Custom Field", "Property Setter", "Print Format", "Notification", "Web Form", "Scheduled Job Type", "Error Log", "Webhook", "Auto Email Report", "Report"]);
/** Ledgers: written only by posting (never by a role), so the matrix gives them read access only. */
const LEDGERS = new Set(["GL Entry", "Stock Ledger Entry", "Payment Ledger Entry"]);
/** GAP-15: accounting documents the payroll roles read for payroll posting and cost analytics. */
export const PAYROLL_ACCOUNTING = ["Journal Entry", "GL Entry", "Payment Entry", "Cost Center", "Account"] as const;
const SETUP_ROLES = new Set(["HR Manager", "CHRO", "HR Admin"]);

function build(): PluginDocPerm[] {
  const out: PluginDocPerm[] = []; const seen = new Set<string>();
  for (const [section, targets] of Object.entries(MAP)) {
    for (const t of targets) {
      if (R10_NAMES.has(t.doctype) || t.doctype.startsWith("DIGIT ")) continue; // app DocTypes carry the matrix in their own definition (withMatrixPerms)
      for (const r of HR_ROLES) {
        const l = r.letters[section]; if (!l) continue;
        // the source DocPerm rows of HR Manager / HR User / Employee stay exactly as shipped (an employee's own-record
        // access is the native Employee role); a Line Manager reaches only non-payroll employee documents of the team
        if (r.role === "HR Manager" || r.role === "HR User" || r.role === "Employee") continue;
        if (r.role === "Line Manager" && (!EMPLOYEE_DOCS.has(t.doctype) || PAY_DOCS.has(t.doctype))) continue;
        const key = `${t.doctype}|${r.role}`; if (seen.has(key)) continue; seen.add(key);
        // ledgers are written only by posting, so a matrix letter on a ledger DocType is read-only for every role
        const letter = LEDGERS.has(t.doctype) || (SETUP.has(t.doctype) && !SETUP_ROLES.has(r.role)) ? "R" : l;
        const p = permRow(r.role, letter, { hasEmployee: EMPLOYEE_DOCS.has(t.doctype), submittable: true });
        if (p) out.push({ ...(p as unknown as PluginDocPerm), parent: t.doctype });
      }
    }
  }
  // permission level 1 (salary, IBAN, GOSI wage) on Employee for the payroll roles and CHRO
  for (const role of LEVEL1_ROLES) if (role !== "HR Manager") out.push({ parent: "Employee", role, permlevel: 1, read: 1, write: 1 });
  // GAP-15: the payroll roles read (never write) the accounting documents payroll posts and costs by; the User
  // Permission on Company keeps them to their own companies, as for every other row
  for (const role of ["Payroll Officer", "Payroll Manager"]) for (const dt of PAYROLL_ACCOUNTING) {
    const key = `${dt}|${role}`; if (seen.has(key)) continue; seen.add(key);
    out.push({ parent: dt, role, permlevel: 0, read: 1, report: 1, print: 1, export: 1 });
  }
  return out;
}
export const R10_NATIVE_DOCPERMS: PluginDocPerm[] = build();

/** Earlier DIGIT DocTypes (rounds 1 and R9) get the role-matrix rows of their section in their own definition (plugin
 *  DocTypes are not overlaid by docperms); existing rows are kept, HR Manager / HR User / Employee rows stay as shipped. */
export function withMatrixPerms<T extends { name: string; permissions?: unknown[] }>(list: T[]): T[] {
  const sectionOf = new Map<string, string>();
  for (const [section, targets] of Object.entries(MAP)) for (const t of targets) if (t.doctype.startsWith("DIGIT ") && !R10_NAMES.has(t.doctype) && !sectionOf.has(t.doctype)) sectionOf.set(t.doctype, section);
  return list.map((d) => {
    const sec = sectionOf.get(d.name); if (!sec) return d;
    const have = new Set(((d.permissions ?? []) as { role?: string; permlevel?: number }[]).filter((p) => !p.permlevel).map((p) => p.role));
    const add = HR_ROLES.filter((r) => r.letters[sec] && !have.has(r.role) && !["HR Manager", "HR User", "Employee"].includes(r.role)).map((r) => permRow(r.role, r.letters[sec]!, { submittable: true })).filter(Boolean);
    return add.length ? { ...d, permissions: [...(d.permissions ?? []), ...add] } : d;
  });
}
