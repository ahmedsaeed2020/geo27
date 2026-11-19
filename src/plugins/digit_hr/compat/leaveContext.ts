import { canReadType, scopedList } from "@/plugins/digit_hr/compat/scope";
import { cachedMeta } from "@/lib/catalog";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type R = any;
const s = (v: unknown) => (v == null ? "" : String(v));
const n = (v: unknown) => Number(v) || 0;
/** Rows only when the source is known and readable; null when unknown, denied or failing — never a silent empty list. */
const read = (dt: string): R[] | null => {
  if (!cachedMeta(dt) || !canReadType(dt)) return null;
  try { return scopedList(dt) as R[]; } catch { return null; }
};

export type LeaveContext = { available: boolean; allocated: number | null; balance: number | null; after: number | null; overlaps: number | null; short: boolean };

/** Approval context for one Leave Application: remaining balance of that leave type
 * (allocation minus other open/approved leave, excluding this one) and same-department
 * colleagues whose open/approved leave overlaps the dates. Local estimate; native
 * validation still decides on submit. When either source cannot be read the context is
 * unavailable (nulls), so a denied allocation never shows as a zero balance or "insufficient". */
export function leaveContext(app: R, deptOf: (emp: string) => string = () => ""): LeaveContext {
  const apps = read("Leave Application"), allocs = read("Leave Allocation");
  if (!apps || !allocs) return { available: false, allocated: null, balance: null, after: null, overlaps: null, short: false };
  const emp = s(app.employee), lt = s(app.leave_type), from = s(app.from_date), to = s(app.to_date || app.from_date);
  const leaves = apps.filter((d) => n(d.docstatus) !== 2 && ["Open", "Approved", ""].includes(s(d.status)));
  const allocated = allocs.filter((a) => s(a.employee) === emp && s(a.leave_type) === lt && n(a.docstatus) !== 2)
    .reduce((t, a) => t + n(a.total_leaves_allocated), 0);
  const used = leaves.filter((d) => s(d.employee) === emp && s(d.leave_type) === lt && s(d.name) !== s(app.name)).reduce((t, d) => t + n(d.total_leave_days), 0);
  const balance = allocated - used;
  const dept = s(app.department) || deptOf(emp);
  const overlaps = dept ? leaves.filter((d) => s(d.employee) !== emp && (s(d.department) || deptOf(s(d.employee))) === dept
    && s(d.from_date) <= to && s(d.to_date || d.from_date) >= from).length : 0;
  const days = n(app.total_leave_days);
  return { available: true, allocated, balance, after: balance - days, overlaps, short: balance - days < 0 };
}
