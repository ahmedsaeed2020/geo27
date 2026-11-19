/**
 * HR reports hub (visual round R3 §3.7): category grouping (Employees / Attendance / Payroll / Tax), per-user favourites and
 * a per-user run log (last run date and how often the user opened a report). Preferences live in this browser per
 * simulated user (as lensDefault.ts), so they never change a report, a figure or another user's screen.
 */
import { useSyncExternalStore } from "react";

export type ReportCategory = "employees" | "attendance" | "payroll" | "tax";
export const CATEGORY_ORDER: ReportCategory[] = ["employees", "attendance", "payroll", "tax"];
export const CATEGORY_LABEL: Record<ReportCategory, [en: string, ar: string]> = {
  employees: ["Employees", "الموظفين"], attendance: ["Attendance", "الحضور"], payroll: ["Payroll", "الرواتب"], tax: ["Tax & GOSI", "الضرائب"],
};
const TAX = /\b(tax|gosi|zakat|wps|mudad|saudi[sz]ation|nitaqat|qiwa|vat)\b/i;
const PAY = /\b(salary|payroll|pay|wage|cost|loan|advance|expense|gratuity|eos|end of service|compensation|benefit|bonus|allowance|incentive|accrual|budget)\b/i;
const ATT = /\b(attendance|check-?in|leave|shift|timesheet|overtime|holiday|absen\w*|late|roster)\b/i;
/** The hub group of a report from its name and reference DocType (tax before payroll, payroll before attendance). */
export function reportCategory(name: string, ref: string): ReportCategory {
  const s = `${name} ${ref}`;
  if (TAX.test(s)) return "tax";
  if (PAY.test(s)) return "payroll";
  if (ATT.test(s)) return "attendance";
  return "employees";
}

/* ---------------------------------------------------------------- per-user preferences ---------------------------------------------------------------- */
const KEY = "digit-hr:report-hub:v1";
interface Prefs { fav: string[]; runs: Record<string, { last: string; n: number }> }
type Store = Record<string, Prefs>;
const subs = new Set<() => void>();
let cache: Store | null = null;
function read(): Store {
  if (cache) return cache;
  try { cache = typeof localStorage === "undefined" ? {} : (JSON.parse(localStorage.getItem(KEY) ?? "{}") as Store); } catch { cache = {}; }
  return cache!;
}
function write(s: Store) { cache = s; try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage unavailable */ } subs.forEach((f) => f()); }
const empty: Prefs = { fav: [], runs: {} };
export const prefsOf = (user: string): Prefs => read()[user] ?? empty;
export function toggleFavourite(user: string, report: string) {
  const s = { ...read() }; const p = s[user] ?? { fav: [], runs: {} };
  s[user] = { ...p, fav: p.fav.includes(report) ? p.fav.filter((x) => x !== report) : [...p.fav, report] }; write(s);
}
/** Records that the user ran / opened a report now (same-day repeats count once). */
export function recordRun(user: string, report: string, on = new Date().toISOString().slice(0, 10)) {
  const s = { ...read() }; const p = s[user] ?? { fav: [], runs: {} }; const r = p.runs[report];
  if (r && r.last === on) return;
  s[user] = { ...p, runs: { ...p.runs, [report]: { last: on, n: (r?.n ?? 0) + 1 } } }; write(s);
}
const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
let snap = ""; let snapVal: Prefs = empty;
export function useReportPrefs(user: string): Prefs {
  return useSyncExternalStore(subscribe, () => { const v = prefsOf(user); const k = `${user}|${JSON.stringify(v)}`; if (k !== snap) { snap = k; snapVal = v; } return snapVal; }, () => empty);
}
/** Test hook: forget the in-memory copy so the next read comes from storage. */
export const _resetReportPrefsCache = () => { cache = null; };
