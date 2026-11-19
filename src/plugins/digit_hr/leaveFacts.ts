/**
 * Section 03.1 leave facts over PRE-SCOPED rows (presentation only; never writes, never approves).
 * Balance follows the Core submit validation (departments.ts leaveBalance ← HRMS get_leave_balance_on):
 * submitted allocations covering the date (new_leaves_allocated, else total_leaves_allocated) minus Approved, submitted
 * applications whose from_date falls inside a covering allocation period. Open requests are shown separately as
 * "pending", never deducted from the balance. A parity test keeps this mirror equal to the Core function.
 */
type Row = Record<string, unknown>;
const s = (v: unknown) => (v == null ? '' : String(v));
const n = (v: unknown) => Number(v) || 0;
const d10 = (v: unknown) => s(v).slice(0, 10);
const covers = (a: Row, on: string) => d10(a['from_date']) <= on && on <= (d10(a['to_date']) || '9999');

export const isApprovedLeave = (l: Row) => Number(l['docstatus'] ?? 0) === 1 && s(l['status']) === 'Approved';
export const isOpenLeave = (l: Row) => Number(l['docstatus'] ?? 0) === 0 && s(l['status'] || 'Open') === 'Open';

export type BalanceRow = {
  employee: string; employeeName: string; leaveType: string; allocated: number; taken: number; balance: number;
  pending: number; afterPending: number; allocations: string[]; applications: string[]; pendingApps: string[];
};

export function leaveBalances(allocs: Row[], apps: Row[], on: string): BalanceRow[] {
  const by = new Map<string, Row[]>();
  for (const a of allocs) {
    if (Number(a['docstatus'] ?? 0) !== 1 || !covers(a, on)) continue;
    const k = `${s(a['employee'])}\u0000${s(a['leave_type'])}`;
    by.set(k, [...(by.get(k) ?? []), a]);
  }
  const out: BalanceRow[] = [];
  for (const [k, list] of by) {
    const [employee = '', leaveType = ''] = k.split('\u0000');
    const inPeriod = (l: Row) => s(l['employee']) === employee && s(l['leave_type']) === leaveType && list.some((a) => d10(a['from_date']) <= d10(l['from_date']) && d10(l['from_date']) <= (d10(a['to_date']) || '9999'));
    const taken = apps.filter((l) => isApprovedLeave(l) && inPeriod(l));
    const pend = apps.filter((l) => isOpenLeave(l) && inPeriod(l));
    const allocated = list.reduce((t, a) => t + n(a['new_leaves_allocated'] ?? a['total_leaves_allocated']), 0);
    const takenDays = taken.reduce((t, l) => t + n(l['total_leave_days']), 0);
    const pendingDays = pend.reduce((t, l) => t + n(l['total_leave_days']), 0);
    const round = (x: number) => Math.round(x * 1000) / 1000;
    out.push({
      employee, employeeName: s(list[0]?.['employee_name']) || employee, leaveType,
      allocated: round(allocated), taken: round(takenDays), balance: round(allocated - takenDays), pending: round(pendingDays), afterPending: round(allocated - takenDays - pendingDays),
      allocations: list.map((a) => s(a['name'])), applications: taken.map((l) => s(l['name'])), pendingApps: pend.map((l) => s(l['name'])),
    });
  }
  return out.sort((a, b) => a.employeeName.localeCompare(b.employeeName) || a.leaveType.localeCompare(b.leaveType));
}

/** Balance of one employee/type on a date (same rule), or null when no submitted allocation covers the date. */
export function balanceOn(allocs: Row[], apps: Row[], employee: string, leaveType: string, on: string, exclude = ''): number | null {
  const row = leaveBalances(allocs.filter((a) => s(a['employee']) === employee && s(a['leave_type']) === leaveType), apps.filter((l) => s(l['name']) !== exclude), on)[0];
  return row ? row.balance : null;
}

export const addDays = (day: string, k: number) => new Date(Date.parse(`${day}T00:00:00Z`) + k * 864e5).toISOString().slice(0, 10);

export type AbsenceRow = { employee: string; employeeName: string; department: string; days: ('approved' | 'open' | '')[]; apps: string[] };
/** Approved (submitted) and open leave overlapping `days` calendar days from `from`; one row per employee. */
export function absenceWindow(apps: Row[], from: string, days: number, deptOf: (emp: string) => string = () => ''): AbsenceRow[] {
  const last = addDays(from, days - 1);
  const rel = apps.filter((l) => (isApprovedLeave(l) || isOpenLeave(l)) && d10(l['from_date']) <= last && (d10(l['to_date']) || d10(l['from_date'])) >= from);
  const by = new Map<string, AbsenceRow>();
  for (const l of rel) {
    const emp = s(l['employee']);
    const row = by.get(emp) ?? { employee: emp, employeeName: s(l['employee_name']) || emp, department: s(l['department']) || deptOf(emp), days: Array.from({ length: days }, () => '' as const), apps: [] };
    for (let i = 0; i < days; i++) {
      const day = addDays(from, i);
      if (d10(l['from_date']) <= day && day <= (d10(l['to_date']) || d10(l['from_date']))) row.days[i] = isApprovedLeave(l) ? 'approved' : row.days[i] === 'approved' ? 'approved' : 'open';
    }
    row.apps.push(s(l['name']));
    by.set(emp, row);
  }
  return [...by.values()].sort((a, b) => a.department.localeCompare(b.department) || a.employeeName.localeCompare(b.employeeName));
}

/** Same-department colleagues with open/approved leave overlapping a request (approval context). */
export function overlapping(app: Row, apps: Row[], deptOf: (emp: string) => string): string[] {
  const dept = s(app['department']) || deptOf(s(app['employee']));
  if (!dept) return [];
  const from = d10(app['from_date']), to = d10(app['to_date']) || from;
  return apps.filter((l) => s(l['name']) !== s(app['name']) && s(l['employee']) !== s(app['employee']) && (isApprovedLeave(l) || isOpenLeave(l))
    && (s(l['department']) || deptOf(s(l['employee']))) === dept && d10(l['from_date']) <= to && (d10(l['to_date']) || d10(l['from_date'])) >= from).map((l) => s(l['name']));
}

export type EntitlementRow = { leaveType: string; maxAllowed: number; carryForward: boolean; lwp: boolean; earned: boolean; allowNegative: boolean; compensatory: boolean; allocations: string[]; employees: number; policies: string[] };
/** Leave Type setup with current allocations (covering `on`) and the Leave Policies that grant it. */
export function entitlements(types: Row[], allocs: Row[], policies: Row[], on: string): EntitlementRow[] {
  return types.map((t) => {
    const lt = s(t['name']);
    const cur = allocs.filter((a) => Number(a['docstatus'] ?? 0) === 1 && s(a['leave_type']) === lt && covers(a, on));
    return {
      leaveType: lt, maxAllowed: n(t['max_leaves_allowed']), carryForward: !!n(t['is_carry_forward']), lwp: !!n(t['is_lwp']), earned: !!n(t['is_earned_leave']), allowNegative: !!n(t['allow_negative']), compensatory: !!n(t['is_compensatory']),
      allocations: cur.map((a) => s(a['name'])), employees: new Set(cur.map((a) => s(a['employee']))).size,
      policies: policies.filter((p) => Number(p['docstatus'] ?? 0) !== 2 && (Array.isArray(p['leave_policy_details']) ? (p['leave_policy_details'] as Row[]) : []).some((d) => s(d['leave_type']) === lt)).map((p) => s(p['name'])),
    };
  }).sort((a, b) => b.employees - a.employees || a.leaveType.localeCompare(b.leaveType));
}
