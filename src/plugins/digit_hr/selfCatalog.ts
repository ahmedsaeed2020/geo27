/**
 * Module 05 service catalog: which self-service requests the session user can start, and which team requests wait on them.
 * Availability reads only the employee link (employeeIdentity) and source DocPerms (session.hasPerm via the caller);
 * it never grants a role. Team approval routing follows the source approver fields.
 */
type Row = Record<string, unknown>;
const s = (v: unknown) => (v == null ? '' : String(v));

export const SELF_CATALOG: { dt: string; ar: string; en: string; group: 'time' | 'money' | 'service' }[] = [
  { dt: 'Leave Application', ar: 'طلب إجازة', en: 'Leave request', group: 'time' },
  { dt: 'Attendance Request', ar: 'طلب تصحيح حضور', en: 'Attendance correction', group: 'time' },
  { dt: 'Shift Request', ar: 'طلب وردية', en: 'Shift request', group: 'time' },
  { dt: 'Compensatory Leave Request', ar: 'طلب إجازة تعويضية', en: 'Compensatory leave', group: 'time' },
  { dt: 'Expense Claim', ar: 'مطالبة مصروفات', en: 'Expense claim', group: 'money' },
  { dt: 'Employee Advance', ar: 'سلفة موظف', en: 'Employee advance', group: 'money' },
  { dt: 'DIGIT HR Service Case', ar: 'طلب خدمة موارد بشرية', en: 'HR service case', group: 'service' },
];

export type CatalogState = 'available' | 'not-permitted' | 'unavailable' | 'unlinked';
/** unavailable = metadata not loaded/plugin DocType absent; unlinked = no active Employee mapped to the user; not-permitted = source DocPerm has no create. */
export function catalogState(opts: { metaLoaded: boolean; linked: boolean; canCreate: boolean }): CatalogState {
  if (!opts.metaLoaded) return 'unavailable';
  if (!opts.linked) return 'unlinked';
  return opts.canCreate ? 'available' : 'not-permitted';
}

/**
 * "Open" = still awaiting a decision, using the same status rules as the approval queues (teamQueues):
 * Leave status Open, Expense approval_status Draft, Shift Request status Draft, other drafts while unsubmitted;
 * service cases until Closed/Resolved. Submitted, cancelled and decided rows are not open.
 */
export function isOpenRequest(dt: string, r: Row): boolean {
  const ds = Number(r['docstatus'] ?? 0);
  if (dt === 'DIGIT HR Service Case') return ds !== 2 && !['Closed', 'Resolved'].includes(s(r['case_status']));
  if (ds !== 0) return false;
  if (dt === 'Leave Application') return s(r['status'] || 'Open') === 'Open';
  if (dt === 'Expense Claim') return s(r['approval_status'] || 'Draft') === 'Draft';
  if (dt === 'Shift Request') return s(r['status'] || 'Draft') === 'Draft';
  return true;
}
export function openOwn(dt: string, rows: Row[], employee: string): Row[] {
  if (!employee) return [];
  return rows.filter((r) => s(r['employee']) === employee && isOpenRequest(dt, r));
}

export type TeamQueue = { dt: string; ar: string; en: string; route: string; rows: Row[] };
/**
 * Requests waiting on the user. HR administrators see every open request in their scope; others only rows that name them
 * as approver (leave_approver / expense_approver / approver) or, for Attendance Request (no approver field), their team.
 */
export function teamQueues(read: (dt: string) => Row[], user: string, team: Set<string>, admin: boolean): TeamQueue[] {
  return [
    { dt: 'Leave Application', ar: 'إجازات', en: 'Leave', route: 'leave_approver', rows: read('Leave Application').filter((r) => isOpenRequest('Leave Application', r) && (admin || s(r['leave_approver']) === user)) },
    { dt: 'Expense Claim', ar: 'مطالبات مصروفات', en: 'Expense claims', route: 'expense_approver', rows: read('Expense Claim').filter((r) => isOpenRequest('Expense Claim', r) && (admin || s(r['expense_approver']) === user)) },
    { dt: 'Shift Request', ar: 'طلبات وردية', en: 'Shift requests', route: 'approver', rows: read('Shift Request').filter((r) => isOpenRequest('Shift Request', r) && (admin || s(r['approver']) === user)) },
    { dt: 'Attendance Request', ar: 'طلبات حضور', en: 'Attendance requests', route: 'team', rows: read('Attendance Request').filter((r) => isOpenRequest('Attendance Request', r) && (admin || team.has(s(r['employee'])))) },
  ];
}
