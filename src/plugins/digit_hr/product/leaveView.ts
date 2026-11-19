/**
 * Section 03.1 leave views (owner round H2, 2026-11-17): a balance card per leave type of one employee (allocated,
 * approved, pending, remaining, available), the calculation behind the annual balance read from the native Leave Ledger
 * Entry rows (allocation +, approved leave −), the year calendar (one bar per leave, team overlap per department) and
 * the «balance to be lost» list (remaining days above the carry-forward cap at the end of the allocation period).
 * Read models over permission-scoped rows only; the balance rule is the Core one (leaveFacts mirrors departments.ts).
 */
import type { Doc } from "@/lib/adapter";
import { canReadType, scopedList } from "../compat/scope";
import { isApprovedLeave, isOpenLeave, leaveBalances, type BalanceRow } from "../leaveFacts";
import { policyValue } from "./settings";

const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));
const n = (v: unknown) => Number(v) || 0;
const d10 = (v: unknown) => s(v).slice(0, 10);
const r3 = (x: number) => Math.round(x * 1000) / 1000;
const rowsOf = (dt: string) => { try { return canReadType(dt) ? scopedList(dt) : null; } catch { return null; } };

/* ------------------------------------------------------------------ balance cards (H2-01 / H2-02 / H2-08) ------------------------------------------------------------------ */
export interface LedgerLine { name: string; kind: "allocation" | "leave" | "other"; from: string; to: string; days: number; ref: string }
export interface LeaveCard extends BalanceRow {
  /** days that can still be requested: remaining minus the requests waiting for a decision */
  available: number;
  /** the native leave ledger rows of the covering period and their sum (null = the ledger is not readable) */
  ledger: LedgerLine[] | null; ledgerBalance: number | null;
  carryForward: boolean; periodEnd: string;
}
/** One employee's balance per leave type on a date: the Core balance rule, the pending requests and the ledger behind it. */
export function leaveCards(employee: string, on: string): LeaveCard[] | null {
  const allocs = rowsOf("Leave Allocation"), apps = rowsOf("Leave Application");
  if (!allocs || !apps) return null;
  const mine = (r: Doc) => r["employee"] === employee;
  const bal = leaveBalances(allocs.filter(mine), apps.filter(mine), on).filter((b) => b.employee === employee);
  const types = new Map((rowsOf("Leave Type") ?? []).map((t) => [t.name, t]));
  const led = rowsOf("Leave Ledger Entry");
  return bal.map((b) => {
    const periods = allocs.filter((a) => b.allocations.includes(a.name));
    const end = periods.map((a) => d10(a["to_date"])).sort().pop() ?? "";
    let ledger: LedgerLine[] | null = null, ledgerBalance: number | null = null;
    if (led) {
      const es = led.filter((e) => e["employee"] === employee && e["leave_type"] === b.leaveType && Number(e.docstatus) === 1 && !n(e["is_cancelled"]));
      // get_leave_balance_on: allocation rows covering the date plus leave rows starting inside a covering allocation
      const al = es.filter((e) => s(e["transaction_type"]) !== "Leave Application" && d10(e["from_date"]) <= on && on <= (d10(e["to_date"]) || "9999"));
      const lv = es.filter((e) => s(e["transaction_type"]) === "Leave Application" && al.some((a) => d10(a["from_date"]) <= d10(e["from_date"]) && d10(e["from_date"]) <= (d10(a["to_date"]) || "9999")));
      ledger = [...al, ...lv].sort((x, y) => d10(x["from_date"]).localeCompare(d10(y["from_date"]))).map((e) => ({ name: e.name, kind: s(e["transaction_type"]) === "Leave Application" ? "leave" : s(e["transaction_type"]) === "Leave Allocation" ? "allocation" : "other", from: d10(e["from_date"]), to: d10(e["to_date"]), days: n(e["leaves"]), ref: s(e["transaction_name"]) }));
      ledgerBalance = ledger.length ? r3(ledger.reduce((t, x) => t + x.days, 0)) : null;
    }
    return { ...b, available: r3(b.balance - b.pending), ledger, ledgerBalance, carryForward: !!n(types.get(b.leaveType)?.["is_carry_forward"]), periodEnd: end };
  }).sort((x, y) => (x.leaveType === "Annual Leave" ? -1 : y.leaveType === "Annual Leave" ? 1 : y.allocated - x.allocated));
}
/** Employees who hold a leave allocation covering the date (the picker of the balance cards), names as stored. */
export function allocatedEmployees(on: string, company?: string): { id: string; name: string }[] {
  const allocs = rowsOf("Leave Allocation") ?? []; const emps = new Map((rowsOf("Employee") ?? []).map((e) => [e.name, e]));
  const ids = new Set(allocs.filter((a) => Number(a.docstatus) === 1 && d10(a["from_date"]) <= on && on <= (d10(a["to_date"]) || "9999")).map((a) => s(a["employee"])));
  return [...ids].map((id) => emps.get(id)).filter((e): e is Doc => !!e && (!company || e["company"] === company) && s(e["status"]) === "Active").map((e) => ({ id: e.name, name: s(e["employee_name"]) || e.name })).sort((a, b) => a.name.localeCompare(b.name, "ar"));
}

/* ------------------------------------------------------------------ year calendar (H2-03) ------------------------------------------------------------------ */
export interface YearSpan { name: string; type: string; status: "approved" | "open"; from: string; to: string; days: number }
export interface YearRow { employee: string; name: string; dept: string; spans: YearSpan[]; days: number }
/** Approved and requested leave of a calendar year, one row per employee (optionally one department), plus the team
 *  overlap: per day, how many people of the same department are away (≥ 2 = overlap). */
export function yearCalendar(year: string, opts: { company?: string | undefined; dept?: string | undefined; deptOf: (emp: Doc) => string }): { rows: YearRow[]; depts: { key: string; people: number }[]; overlap: number[] } | null {
  const apps = rowsOf("Leave Application"); if (!apps) return null;
  const emps = new Map((rowsOf("Employee") ?? []).map((e) => [e.name, e]));
  const y0 = `${year}-01-01`, y1 = `${year}-12-31`;
  const live = apps.filter((l) => (isApprovedLeave(l) || isOpenLeave(l)) && d10(l["from_date"]) <= y1 && (d10(l["to_date"]) || d10(l["from_date"])) >= y0);
  const by = new Map<string, YearRow>();
  for (const l of live) {
    const e = emps.get(s(l["employee"])); if (!e || (opts.company && e["company"] !== opts.company)) continue;
    const dept = opts.deptOf(e);
    const row = by.get(e.name) ?? { employee: e.name, name: s(e["employee_name"]) || e.name, dept, spans: [], days: 0 };
    const from = d10(l["from_date"]) < y0 ? y0 : d10(l["from_date"]), to = (d10(l["to_date"]) || from) > y1 ? y1 : d10(l["to_date"]) || from;
    row.spans.push({ name: l.name, type: s(l["leave_type"]), status: isApprovedLeave(l) ? "approved" : "open", from, to, days: n(l["total_leave_days"]) });
    row.days += n(l["total_leave_days"]); by.set(e.name, row);
  }
  const all = [...by.values()];
  const deptCount = new Map<string, number>(); for (const r of all) deptCount.set(r.dept, (deptCount.get(r.dept) ?? 0) + 1);
  const depts = [...deptCount].map(([key, people]) => ({ key, people })).sort((a, b) => b.people - a.people || a.key.localeCompare(b.key));
  const rows = (opts.dept ? all.filter((r) => r.dept === opts.dept) : all).sort((a, b) => a.dept.localeCompare(b.dept) || (a.spans[0]?.from ?? "").localeCompare(b.spans[0]?.from ?? ""));
  const len = Math.round((Date.parse(`${y1}T00:00:00Z`) - Date.parse(`${y0}T00:00:00Z`)) / 864e5) + 1;
  const overlap = Array.from({ length: len }, () => 0);
  // overlap = the largest number of people of ONE department away on the day (two in different departments are not an overlap)
  const perDept = new Map<string, number[]>();
  for (const r of rows) { const arr = perDept.get(r.dept) ?? Array.from({ length: len }, () => 0); for (const sp of r.spans) { const a = dayIndex(year, sp.from), b = dayIndex(year, sp.to); for (let i = a; i <= b; i++) arr[i]! += 1; } perDept.set(r.dept, arr); }
  for (const arr of perDept.values()) arr.forEach((v, i) => { if (v > overlap[i]!) overlap[i] = v; });
  return { rows, depts, overlap };
}
export const dayIndex = (year: string, iso: string) => Math.round((Date.parse(`${iso}T00:00:00Z`) - Date.parse(`${year}-01-01T00:00:00Z`)) / 864e5);

/* ------------------------------------------------------------------ balance to be lost (H2-04) ------------------------------------------------------------------ */
export interface LoseRow { employee: string; name: string; leaveType: string; remaining: number; pending: number; cap: number; lose: number; periodEnd: string; allocation: string }
/** Remaining days above the carry-forward cap at the end of the allocation period (pending requests counted as taken):
 *  the Leave Type's own maximum carried forward, else the company setting (Saudi default). Only carry-forward types. */
export function loseBalance(on: string, company?: string): { rows: LoseRow[]; within: number } | null {
  const allocs = rowsOf("Leave Allocation"), apps = rowsOf("Leave Application"); if (!allocs || !apps) return null;
  const types = new Map((rowsOf("Leave Type") ?? []).map((t) => [t.name, t]));
  const emps = new Map((rowsOf("Employee") ?? []).map((e) => [e.name, e]));
  const warn = policyValue("leave_lose_warn_days", on, company) ?? 90;
  const horizon = new Date(Date.parse(`${on}T00:00:00Z`) + warn * 864e5).toISOString().slice(0, 10);
  const out: LoseRow[] = [];
  for (const b of leaveBalances(allocs, apps, on)) {
    const t = types.get(b.leaveType); if (!t || !n(t["is_carry_forward"])) continue;
    const e = emps.get(b.employee); if (!e || s(e["status"]) !== "Active" || (company && e["company"] !== company)) continue;
    const end = allocs.filter((a) => b.allocations.includes(a.name)).map((a) => d10(a["to_date"])).sort().pop() ?? "";
    if (!end || end > horizon) continue;
    const own = n(t["maximum_carry_forwarded_leaves"]);
    const cap = own > 0 ? own : policyValue("leave_carry_forward_max_days", on, s(e["company"])) ?? 0;
    const left = r3(b.balance - b.pending); const lose = r3(Math.max(0, left - cap));
    if (lose > 0) out.push({ employee: b.employee, name: s(e["employee_name"]) || b.employee, leaveType: b.leaveType, remaining: b.balance, pending: b.pending, cap, lose, periodEnd: end, allocation: b.allocations[b.allocations.length - 1] ?? "" });
  }
  return { rows: out.sort((a, b) => b.lose - a.lose || a.name.localeCompare(b.name)), within: warn };
}
