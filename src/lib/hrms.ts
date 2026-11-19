/**
 * HR PWA configuration extracted from hrms/hrms-develop/frontend/src —
 * view constants (TAB_BUTTONS, *_FIELDS, FILTER_CONFIG) live here so the
 * React reconstruction stays traceable to the Vue sources.
 * The current employee maps to the seeded session employee SYN-EMP-001.
 */
import { adapter, type Doc } from "./adapter";

export { SYN_COMPANY } from "./seed";

export const CURRENT_EMPLOYEE = "SYN-EMP-001";
export const CURRENT_EMPLOYEE_NAME = "Sara Synthetic";
export const HR_APP_SOURCE = "hrms/hrms-develop/frontend/src";
export const ROSTER_SOURCE = "hrms/hrms-develop/roster/src";

/** Synthetic upcoming holidays (source reads them from the assigned Holiday List on the server). */
export const HOLIDAYS = [
  { holiday_date: "2026-11-27", description: "Synthetic Foundation Day" },
  { holiday_date: "2026-12-20", description: "Synthetic Year End Holiday" },
];

export interface FilterField { fieldname: string; fieldtype: string; label: string; options?: string | string[] }
/** Route paths of the HR PWA section — kept as literal unions so <Link to> stays type-safe. */
export type HrPath =
  | "/hr/home" | "/hr/leave-applications" | "/hr/attendance-requests" | "/hr/shift-requests"
  | "/hr/shift-assignments" | "/hr/employee-checkins" | "/hr/expense-claims" | "/hr/employee-advances";
export type HrNewPath =
  | "/hr/leave-applications/new" | "/hr/attendance-requests/new" | "/hr/shift-requests/new"
  | "/hr/shift-assignments/new" | "/hr/expense-claims/new" | "/hr/employee-advances/new";
export type HrIdPath =
  | "/hr/leave-applications/$id" | "/hr/attendance-requests/$id" | "/hr/shift-requests/$id"
  | "/hr/shift-assignments/$id" | "/hr/expense-claims/$id" | "/hr/employee-advances/$id";
export interface ListConfig {
  doctype: string;
  title: string;
  listPath: HrPath;
  newPath?: HrNewPath; // "" = list-only screen (Employee Checkin)
  idPath?: HrIdPath;
  tabButtons?: string[];
  fields: string[];
  filterConfig: FilterField[];
  dateField?: string; // used by dashboards for "recent" sorting context
  source: string;
  /** Fields prefilled from the session employee on the /new form (source Form.vue employeeFields). */
  employeePrefill?: string[];
  /** Fields the source /new form excludes (noise reduction, e.g. sb_other_details). */
  excludeOnNew?: string[];
}

export const LIST_CONFIGS: Record<string, ListConfig> = {
  "leave-applications": {
    doctype: "Leave Application", title: "Leave History", listPath: "/hr/leave-applications", newPath: "/hr/leave-applications/new", idPath: "/hr/leave-applications/$id",
    tabButtons: ["My Leaves", "Team Leaves"],
    fields: ["name", "employee", "employee_name", "leave_type", "from_date", "to_date", "total_leave_days", "status"],
    filterConfig: [
      { fieldname: "status", fieldtype: "Select", label: "Status", options: ["Open", "Approved", "Rejected"] },
      { fieldname: "leave_type", fieldtype: "Link", label: "Leave Type", options: "Leave Type" },
      { fieldname: "employee", fieldtype: "Link", label: "Employee", options: "Employee" },
      { fieldname: "from_date", fieldtype: "Date", label: "From Date" },
      { fieldname: "to_date", fieldtype: "Date", label: "To Date" },
    ],
    source: "hrms/frontend/src/views/leave/List.vue",
    employeePrefill: ["employee", "employee_name", "company"],
    excludeOnNew: ["naming_series", "salary_slip", "letter_head", "status", "posting_date"],
  },
  "attendance-requests": {
    doctype: "Attendance Request", title: "Attendance Requests", listPath: "/hr/attendance-requests", newPath: "/hr/attendance-requests/new", idPath: "/hr/attendance-requests/$id",
    fields: ["name", "reason", "from_date", "to_date", "docstatus"],
    filterConfig: [
      { fieldname: "shift", fieldtype: "Link", label: "Shift", options: "Shift Type" },
      { fieldname: "from_date", fieldtype: "Date", label: "From Date" },
      { fieldname: "to_date", fieldtype: "Date", label: "To Date" },
    ],
    source: "hrms/frontend/src/views/attendance/AttendanceRequestList.vue",
    employeePrefill: ["employee", "employee_name", "company"],
    excludeOnNew: ["employee_name"],
  },
  "shift-requests": {
    doctype: "Shift Request", title: "Shift Requests", listPath: "/hr/shift-requests", newPath: "/hr/shift-requests/new", idPath: "/hr/shift-requests/$id",
    tabButtons: ["My Requests", "Team Requests"],
    fields: ["name", "employee", "employee_name", "shift_type", "from_date", "to_date", "status"],
    filterConfig: [
      { fieldname: "status", fieldtype: "Select", label: "Status", options: ["Draft", "Approved", "Rejected"] },
      { fieldname: "shift_type", fieldtype: "Link", label: "Shift Type", options: "Shift Type" },
      { fieldname: "employee", fieldtype: "Link", label: "Employee", options: "Employee" },
      { fieldname: "from_date", fieldtype: "Date", label: "From Date" },
      { fieldname: "to_date", fieldtype: "Date", label: "To Date" },
    ],
    source: "hrms/frontend/src/views/attendance/ShiftRequestList.vue",
    employeePrefill: ["employee", "employee_name", "company"],
    excludeOnNew: ["employee_name", "status"],
  },
  "shift-assignments": {
    doctype: "Shift Assignment", title: "Shift Assignments", listPath: "/hr/shift-assignments", newPath: "/hr/shift-assignments/new", idPath: "/hr/shift-assignments/$id",
    fields: ["name", "shift_type", "start_date", "end_date", "docstatus"],
    filterConfig: [
      { fieldname: "shift_type", fieldtype: "Link", label: "Shift Type", options: "Shift Type" },
      { fieldname: "start_date", fieldtype: "Date", label: "Start Date" },
      { fieldname: "end_date", fieldtype: "Date", label: "End Date" },
    ],
    source: "hrms/frontend/src/views/attendance/ShiftAssignmentList.vue",
    employeePrefill: ["employee", "employee_name", "company"],
    excludeOnNew: ["employee_name"],
  },
  "employee-checkins": {
    doctype: "Employee Checkin", title: "Check-in History", listPath: "/hr/employee-checkins",
    fields: ["name", "log_type", "time", "latitude", "longitude"],
    filterConfig: [
      { fieldname: "log_type", fieldtype: "Select", label: "Log Type", options: "IN\nOUT" },
      { fieldname: "shift", fieldtype: "Link", label: "Shift", options: "Shift Type" },
    ],
    source: "hrms/frontend/src/views/attendance/EmployeeCheckinList.vue",
  },
  "expense-claims": {
    doctype: "Expense Claim", title: "Expense Claims", listPath: "/hr/expense-claims", newPath: "/hr/expense-claims/new", idPath: "/hr/expense-claims/$id",
    tabButtons: ["My Claims", "Team Claims"],
    fields: ["name", "employee", "employee_name", "total_claimed_amount", "grand_total", "status", "approval_status", "posting_date"],
    filterConfig: [
      { fieldname: "approval_status", fieldtype: "Select", label: "Approval Status", options: ["Draft", "Approved", "Rejected"] },
      { fieldname: "status", fieldtype: "Select", label: "Status", options: ["Draft", "Paid", "Unpaid", "Rejected", "Submitted", "Cancelled"] },
      { fieldname: "employee", fieldtype: "Link", label: "Employee", options: "Employee" },
      { fieldname: "posting_date", fieldtype: "Date", label: "Posting Date" },
    ],
    source: "hrms/frontend/src/views/expense_claim/List.vue",
    employeePrefill: ["employee", "employee_name", "company", "currency"],
    excludeOnNew: ["status", "approval_status"],
  },
  "employee-advances": {
    doctype: "Employee Advance", title: "Employee Advances", listPath: "/hr/employee-advances", newPath: "/hr/employee-advances/new", idPath: "/hr/employee-advances/$id",
    tabButtons: ["My Advances", "Team Advances"],
    fields: ["name", "employee", "employee_name", "posting_date", "advance_amount", "paid_amount", "status"],
    filterConfig: [
      { fieldname: "status", fieldtype: "Select", label: "Status", options: ["Paid", "Unpaid", "Claimed", "Returned", "Partly Claimed and Returned"] },
      { fieldname: "employee", fieldtype: "Link", label: "Employee", options: "Employee" },
      { fieldname: "posting_date", fieldtype: "Date", label: "Posting Date" },
      { fieldname: "advance_amount", fieldtype: "Currency", label: "Advance Amount" },
      { fieldname: "paid_amount", fieldtype: "Currency", label: "Paid Amount" },
    ],
    source: "hrms/frontend/src/views/employee_advance/List.vue",
    employeePrefill: ["employee", "employee_name", "company", "currency"],
    excludeOnNew: ["status"],
  },
};

/** Rows visible under the "My …" tab vs "Team …" tab (source filters by session employee). */
export function rowsFor(cfg: ListConfig | undefined, tab: string): Doc[] {
  if (!cfg) return [];
  const all = adapter.list(cfg.doctype);
  const mine = (d: Doc) => String(d["employee"] ?? "") === CURRENT_EMPLOYEE;
  const scoped = tab.startsWith("My") ? all.filter(mine) : all;
  return scoped;
}

export function employeeDoc(): Doc | undefined {
  return adapter.get("Employee", CURRENT_EMPLOYEE);
}

/** Local simulation of get_leave_balance_on: allocation minus open/approved leave days in 2026. */
export function leaveBalances(): { leave_type: string; allocated: number; balance: number }[] {
  const allocs = adapter.list("Leave Allocation").filter((a) => String(a["employee"]) === CURRENT_EMPLOYEE);
  const apps = adapter.list("Leave Application").filter(
    (l) => String(l["employee"]) === CURRENT_EMPLOYEE && ["Open", "Approved"].includes(String(l["status"])),
  );
  return allocs.map((a) => {
    const lt = String(a["leave_type"]);
    const used = apps.filter((l) => String(l["leave_type"]) === lt)
      .reduce((s, l) => s + (Number(l["total_leave_days"]) || 0), 0);
    return { leave_type: lt, allocated: Number(a["total_leaves_allocated"]) || 0, balance: (Number(a["total_leaves_allocated"]) || 0) - used };
  });
}

export function upcomingShifts(): Doc[] {
  return adapter.list("Shift Assignment")
    .filter((s) => String(s["employee"]) === CURRENT_EMPLOYEE && String(s["end_date"] ?? "") >= "2026-10-10")
    .sort((a, b) => String(a["start_date"]).localeCompare(String(b["start_date"])));
}

/** Attendance colour map mirrors components/AttendanceCalendar.vue (rose/pink/purple palette in source). */
export const ATTENDANCE_COLORS: Record<string, string> = {
  Present: "oklch(0.72 0.17 15)",
  Absent: "oklch(0.75 0.15 340)",
  "Half Day": "oklch(0.62 0.18 300)",
  "Work From Home": "oklch(0.62 0.18 300)",
  "On Leave": "oklch(0.62 0.18 300)",
  Holiday: "oklch(0.7 0.1 250)",
};
