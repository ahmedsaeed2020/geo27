/**
 * DIGIT HR payroll and Saudi rules (owner brief 2026-11-15 §3): one read model used by the payroll cycle screen, the
 * overview figures, the reports, the demo builder and the tests. Every rate comes from product/settings.ts (effective-
 * dated, Saudi default); nothing here writes — payrollActions.ts writes through the scoped adapter and posting.ts.
 *
 * - Salary formulas of the native Salary Structure are evaluated by a small arithmetic reader (numbers, component
 *   abbreviations, base, + − × ÷ and brackets), never eval.
 * - GOSI: contributory wage = basic + housing, bounded by the minimum / maximum settings; Saudi employee and employer
 *   shares and the non-Saudi hazards share come from settings, so a rate change applies from its own date.
 * - Nationality: Employee.nationality, else the identity document on file (National ID = Saudi, Iqama = non-Saudi);
 *   nothing is assumed when neither is recorded.
 * - End of service: half a month of wage per year for the first five years, a full month after (settings), with the
 *   resignation tiers; wage = basic + housing of the latest salary slip, else of the salary structure assignment.
 */
import { adapter, type Doc } from "@/lib/adapter";
import { policyValue } from "./settings";

const s = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v));
const n = (v: unknown) => Number(v) || 0;
const r2 = (x: number) => Math.round(x * 100) / 100;
const d10 = (v: unknown) => s(v).slice(0, 10);
const list = (dt: string): Doc[] => { try { return adapter.list(dt); } catch { return []; } };
export const monthStart = (ym: string) => `${ym}-01`;
export const monthEndOf = (ym: string) => new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0)).toISOString().slice(0, 10);
export const prevMonth = (ym: string) => { const d = new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)) - 2, 1)); return d.toISOString().slice(0, 7); };

/* ------------------------------------------------------------------ formulas ------------------------------------------------------------------ */
/** Arithmetic of a Salary Structure formula: numbers, variables, + - * / and brackets. Unknown names or syntax → null. */
export function evalFormula(src: string, vars: Record<string, number>): number | null {
  const t = src.replace(/\s+/g, ""); let i = 0;
  const num = (): number | null => {
    if (t[i] === "(") { i++; const v = expr(); if (t[i] !== ")") return null; i++; return v; }
    if (t[i] === "-") { i++; const v = num(); return v === null ? null : -v; }
    const m = /^(\d+(?:\.\d+)?|[A-Za-z_][A-Za-z0-9_]*)/.exec(t.slice(i)); if (!m) return null; i += m[0].length;
    if (/^\d/.test(m[0])) return Number(m[0]); return m[0] in vars ? vars[m[0]]! : null;
  };
  const term = (): number | null => { let v = num(); while (v !== null && (t[i] === "*" || t[i] === "/")) { const op = t[i++]; const r = num(); if (r === null) return null; v = op === "*" ? v * r : r === 0 ? null : v / r; } return v; };
  const expr = (): number | null => { let v = term(); while (v !== null && (t[i] === "+" || t[i] === "-")) { const op = t[i++]; const r = term(); if (r === null) return null; v = op === "+" ? v + r : v - r; } return v; };
  const v = expr(); return v !== null && i === t.length && Number.isFinite(v) ? v : null;
}

/* ------------------------------------------------------------------ people ------------------------------------------------------------------ */
const SAUDI_WORDS = new Set(["saudi arabia", "saudi", "ksa", "السعودية", "سعودي", "المملكة العربية السعودية"]);
/** Saudi / non-Saudi from the employee record, else from the identity document on file; "" = not recorded. */
export function nationalityOf(e: Doc, docs?: Map<string, string>): "Saudi" | "Non-Saudi" | "" {
  const nat = s(e["nationality"]).trim().toLowerCase();
  if (nat) return SAUDI_WORDS.has(nat) ? "Saudi" : "Non-Saudi";
  const t = (docs ?? identityIndex()).get(e.name);
  return t === "National ID" ? "Saudi" : t === "Iqama" ? "Non-Saudi" : "";
}
/** Employee → identity document type on file (National ID or Iqama, the latest record). */
export function identityIndex(): Map<string, string> {
  const m = new Map<string, string>();
  for (const d of list("DIGIT Document Renewal").sort((a, b) => d10(a["issue_date"]).localeCompare(d10(b["issue_date"])))) { const t = s(d["document_type"]); if (t === "National ID" || t === "Iqama") m.set(s(d["employee"]), t); }
  return m;
}
/** Latest submitted salary structure assignment on or before `on`. */
export function assignmentOf(emp: string, on: string): Doc | undefined {
  return list("Salary Structure Assignment").filter((d) => d["employee"] === emp && Number(d.docstatus) === 1 && d10(d["from_date"]) <= on).sort((a, b) => d10(b["from_date"]).localeCompare(d10(a["from_date"])))[0];
}
const comp = (rowsOf: unknown, re: RegExp) => ((rowsOf as Doc[] | undefined) ?? []).filter((r) => re.test(s(r["salary_component"])) || re.test(s(r["abbr"]))).reduce((a, r) => a + n(r["amount"]), 0);
export const BASIC = /^(Basic Salary|BS)$/i, HOUSING = /^(Housing Allowance|HA)$/i;
/** Monthly wage for GOSI / end of service: basic + housing of the latest slip on or before `on`, else of the assignment. */
export function wageOf(emp: string, on: string): { wage: number; from: string } {
  const slip = list("Salary Slip").filter((d) => d["employee"] === emp && Number(d.docstatus) === 1 && d10(d["end_date"]) <= on).sort((a, b) => d10(b["end_date"]).localeCompare(d10(a["end_date"])))[0];
  if (slip) { const w = comp(slip["earnings"], BASIC) + comp(slip["earnings"], HOUSING); const f = n(slip["payment_days"]) && n(slip["total_working_days"]) ? n(slip["total_working_days"]) / n(slip["payment_days"]) : 1; return { wage: r2(w * f), from: slip.name }; }
  const a = assignmentOf(emp, on); if (!a) return { wage: 0, from: "" };
  const st = adapter.get("Salary Structure", s(a["salary_structure"]));
  const sl = st ? structureLines(st, n(a["base"]), formulaVars(adapter.get("Employee", emp), a)) : undefined;
  return { wage: sl ? r2(sl.earnings.filter((x) => BASIC.test(x.component) || BASIC.test(x.abbr) || HOUSING.test(x.component) || HOUSING.test(x.abbr)).reduce((t, x) => t + x.amount, 0)) : r2(n(a["base"]) * 0.85), from: a.name };
}

/* ------------------------------------------------------------------ salary lines ------------------------------------------------------------------ */
export interface Line { component: string; abbr: string; amount: number }
/** Earnings and deductions of a native Salary Structure for a base, in the structure's order (formulas or fixed amounts). */
/** Formula variables a native Salary Structure may read besides `base`: numeric custom fields (custom_* / digit_*) of the
 *  Employee and of the Salary Structure Assignment, and `variable` of the assignment, as frappe salary_slip does (CQ-HRMS-5057). */
export function formulaVars(emp: Doc | undefined, ssa: Doc | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  for (const d of [emp, ssa]) for (const [k, v] of Object.entries(d ?? {})) if (/^(custom_|digit_)/.test(k) && v !== "" && v !== null && typeof v !== "boolean" && Number.isFinite(Number(v))) out[k] = Number(v);
  if (ssa && ssa["variable"] !== undefined) out["variable"] = n(ssa["variable"]);
  return out;
}
export function structureLines(st: Doc, base: number, extra: Record<string, number> = {}): { earnings: Line[]; deductions: Line[]; errors: string[] } {
  const vars: Record<string, number> = { ...extra, base }; const errors: string[] = [];
  const read = (rowsOf: unknown) => ((rowsOf as Doc[] | undefined) ?? []).map((r) => {
    const abbr = s(r["abbr"]) || s(adapter.get("Salary Component", s(r["salary_component"]))?.["salary_component_abbr"]) || s(r["salary_component"]);
    let amount = n(r["amount"]); const f = s(r["formula"]);
    if (f) { const v = evalFormula(f, vars); if (v === null) { errors.push(`${s(r["salary_component"])}: formula "${f}" cannot be read`); amount = 0; } else amount = r2(v); }
    vars[abbr] = amount; return { component: s(r["salary_component"]), abbr, amount };
  });
  const earnings = read(st["earnings"]); const deductions = read(st["deductions"]);
  return { earnings, deductions, errors };
}
export const isGosiComponent = (l: Pick<Line, "component" | "abbr">) => /gosi/i.test(l.component) || /^gosi$/i.test(l.abbr);

/* ------------------------------------------------------------------ GOSI ------------------------------------------------------------------ */
export interface Gosi { wage: number; employee: number; employer: number; saudi: "Saudi" | "Non-Saudi" | ""; rateEmployee: number; rateEmployer: number }
/** GOSI shares for a month from the rates in force on `on`; an unrecorded nationality gives null shares (preflight blocker). */
export function gosiShares(e: Doc, basicHousing: number, on: string, docs?: Map<string, string>): Gosi | null {
  const nat = nationalityOf(e, docs); if (!nat) return null; const co = s(e["company"]);
  const cap = policyValue("gosi_wage_cap", on, co) ?? Infinity, min = policyValue("gosi_wage_min", on, co) ?? 0;
  const wage = r2(Math.min(Math.max(basicHousing, min), cap));
  const re = nat === "Saudi" ? policyValue("gosi_saudi_employee_pct", on, co) ?? 0 : 0;
  const rr = nat === "Saudi" ? policyValue("gosi_saudi_employer_pct", on, co) ?? 0 : policyValue("gosi_non_saudi_employer_pct", on, co) ?? 0;
  return { wage, employee: r2((wage * re) / 100), employer: r2((wage * rr) / 100), saudi: nat, rateEmployee: re, rateEmployer: rr };
}

/* ------------------------------------------------------------------ end of service ------------------------------------------------------------------ */
export interface Eos { years: number; wage: number; full: number; share: number; award: number; reason: "termination" | "resignation"; note: [string, string] }
/** End-of-service award on `on` (Labour Law arts. 84–85 with the settings in force). */
export function eosAward(e: Doc, on: string, reason: "termination" | "resignation" = "termination", wageOverride?: number): Eos {
  const co = s(e["company"]); const join = d10(e["date_of_joining"]);
  const years = join ? Math.max(0, (Date.parse(`${on}T00:00:00Z`) - Date.parse(`${join}T00:00:00Z`)) / (365.25 * 86400000)) : 0;
  const wage = wageOverride ?? wageOf(e.name, on).wage;
  const a = policyValue("eos_months_first5", on, co) ?? 0.5, b = policyValue("eos_months_after5", on, co) ?? 1;
  const full = r2(wage * (Math.min(years, 5) * a + Math.max(years - 5, 0) * b));
  let share = 1; let note: [string, string] = ["Full award (end of contract or termination)", "مكافأة كاملة (انتهاء العقد أو إنهاء من صاحب العمل)"];
  if (reason === "resignation") {
    if (years < 2) { share = 0; note = ["Resignation under 2 years: no award", "استقالة قبل سنتين: لا مكافأة"]; }
    else if (years < 5) { share = (policyValue("eos_resign_2_5_pct", on, co) ?? 33.33) / 100; note = ["Resignation 2–5 years: one third", "استقالة من 2 إلى 5 سنوات: الثلث"]; }
    else if (years < 10) { share = (policyValue("eos_resign_5_10_pct", on, co) ?? 66.67) / 100; note = ["Resignation 5–10 years: two thirds", "استقالة من 5 إلى 10 سنوات: الثلثان"]; }
    else { share = (policyValue("eos_resign_10_pct", on, co) ?? 100) / 100; note = ["Resignation 10 years or more: full award", "استقالة بعد 10 سنوات فأكثر: مكافأة كاملة"]; }
  }
  return { years: Math.round(years * 100) / 100, wage, full, share, award: r2(full * share), reason, note };
}

/* ------------------------------------------------------------------ Saudization ------------------------------------------------------------------ */
export type Band = "Platinum" | "Green" | "Yellow" | "Red" | "Unknown";
export interface Saudization { company: string; active: number; saudi: number; nonSaudi: number; unknown: number; pct: number; band: Band; target: number; platinum: number; red: number; saudiIds: string[]; nonSaudiIds: string[]; unknownIds: string[] }
export function saudization(company: string, on: string, emps?: Doc[]): Saudization {
  const docs = identityIndex();
  const act = (emps ?? list("Employee")).filter((e) => e["company"] === company && s(e["status"]) === "Active" && (!d10(e["date_of_joining"]) || d10(e["date_of_joining"]) <= on));
  const by = { Saudi: [] as string[], "Non-Saudi": [] as string[], "": [] as string[] };
  for (const e of act) by[nationalityOf(e, docs)].push(e.name);
  const known = by.Saudi.length + by["Non-Saudi"].length; const pct = known ? Math.round((by.Saudi.length / known) * 1000) / 10 : 0;
  const target = policyValue("saudization_target_pct", on, company) ?? 0, platinum = policyValue("saudization_platinum_pct", on, company) ?? 100, red = policyValue("saudization_red_pct", on, company) ?? 0;
  const band: Band = !known ? "Unknown" : pct >= platinum ? "Platinum" : pct >= target ? "Green" : pct >= red ? "Yellow" : "Red";
  return { company, active: act.length, saudi: by.Saudi.length, nonSaudi: by["Non-Saudi"].length, unknown: by[""].length, pct, band, target, platinum, red, saudiIds: by.Saudi, nonSaudiIds: by["Non-Saudi"], unknownIds: by[""] };
}

/* ------------------------------------------------------------------ bank details ------------------------------------------------------------------ */
/** The IBAN salaries are paid to: the employee record, else the latest applied bank change request (the audited source of a bank change). */
export function ibanOf(e: Doc, applied?: Map<string, string>): string {
  const own = s(e["iban"]) || s(e["bank_ac_no"]); if (own) return own;
  return (applied ?? appliedIbans()).get(e.name) ?? "";
}
export function appliedIbans(): Map<string, string> {
  const m = new Map<string, string>();
  for (const d of list("DIGIT Bank Change Request").filter((x) => s(x["request_status"]) === "Applied" && s(x["new_iban"])).sort((a, b) => s(a["applied_on"] ?? a["modified"]).localeCompare(s(b["applied_on"] ?? b["modified"])))) m.set(s(d["employee"]), s(d["new_iban"]));
  return m;
}

/* ------------------------------------------------------------------ period lock ------------------------------------------------------------------ */
export function lockOn(company: string, date: string): Doc | undefined {
  return list("DIGIT Payroll Period Lock").find((d) => d["company"] === company && s(d["lock_status"]) === "Locked" && d10(d["from_date"]) <= date && d10(d["to_date"]) >= date);
}

/* ------------------------------------------------------------------ preflight ------------------------------------------------------------------ */
export interface Check { key: string; title: [string, string]; blocking: boolean; doctype: string; names: string[]; hint: [string, string] }
/** Employees a payroll entry covers: its employees table, else active employees of the company (and branch) in the period. */
export function payrollEmployees(pe: Doc): Doc[] {
  const ids = ((pe["employees"] as Doc[] | undefined) ?? []).map((r) => s(r["employee"])).filter(Boolean);
  const to = d10(pe["end_date"]), from = d10(pe["start_date"]);
  if (ids.length) return ids.map((i) => adapter.get("Employee", i)).filter((e): e is Doc => !!e);
  return list("Employee").filter((e) => e["company"] === pe["company"] && (!pe["branch"] || e["branch"] === pe["branch"]) && d10(e["date_of_joining"]) <= to && (s(e["status"]) === "Active" || d10(e["relieving_date"]) >= from));
}
/** The payroll preflight: blockers stop the run, warnings are listed for review (preflight checklist of the payroll cycle). */
export function preflight(pe: Doc): Check[] {
  const co = s(pe["company"]); const from = d10(pe["start_date"]), to = d10(pe["end_date"]);
  const emps = payrollEmployees(pe); const ids = new Set(emps.map((e) => e.name)); const docs = identityIndex();
  const inPeriod = (d: Doc, a: string, b: string) => d10(d[a]) <= to && d10(d[b] ?? d[a]) >= from;
  const noSsa = emps.filter((e) => !assignmentOf(e.name, to)).map((e) => e.name);
  const ib = appliedIbans(); const noBank = emps.filter((e) => !ibanOf(e, ib)).map((e) => e.name);
  const noNat = emps.filter((e) => !nationalityOf(e, docs)).map((e) => e.name);
  const leave = list("Leave Application").filter((d) => ids.has(s(d["employee"])) && Number(d.docstatus ?? 0) === 0 && s(d["status"]) === "Open" && inPeriod(d, "from_date", "to_date")).map((d) => d.name);
  const att = list("Attendance Request").filter((d) => ids.has(s(d["employee"])) && Number(d.docstatus ?? 0) === 0 && inPeriod(d, "from_date", "to_date")).map((d) => d.name);
  const ot = list("Overtime Slip").filter((d) => ids.has(s(d["employee"])) && Number(d.docstatus ?? 0) === 0 && d10(d["posting_date"]) >= from && d10(d["posting_date"]) <= to).map((d) => d.name);
  const adds = list("Additional Salary").filter((d) => ids.has(s(d["employee"])) && Number(d.docstatus ?? 0) === 0 && d10(d["payroll_date"]) >= from && d10(d["payroll_date"]) <= to).map((d) => d.name);
  const iq = list("DIGIT Document Renewal").filter((d) => ids.has(s(d["employee"])) && s(d["document_type"]) === "Iqama" && s(d["status"]) !== "Renewed" && d10(d["expiry_date"]) < to).map((d) => d.name);
  const lock = lockOn(co, to);
  const out: Check[] = [
    { key: "lock", title: ["Payroll period open", "فترة الرواتب مفتوحة"], blocking: true, doctype: "DIGIT Payroll Period Lock", names: lock ? [lock.name] : [], hint: ["A locked period must be reopened (with a reason) before a new run.", "يجب إعادة فتح الفترة المقفلة (مع السبب) قبل تشغيل جديد."] },
    { key: "ssa", title: ["Salary structure assigned", "هيكل راتب مسند"], blocking: true, doctype: "Employee", names: noSsa, hint: ["Assign a salary structure effective in the period.", "أسند هيكل راتب ساريًا في الفترة."] },
    { key: "nationality", title: ["Nationality known for GOSI", "الجنسية معروفة للتأمينات"], blocking: true, doctype: "Employee", names: noNat, hint: ["Record nationality or the National ID / Iqama on file.", "سجّل الجنسية أو الهوية الوطنية / الإقامة."] },
    { key: "bank", title: ["Bank account (IBAN) for WPS", "الحساب البنكي (آيبان) لحماية الأجور"], blocking: true, doctype: "Employee", names: noBank, hint: ["WPS needs an IBAN for every paid employee.", "يحتاج نظام حماية الأجور إلى آيبان لكل موظف."] },
    { key: "leave", title: ["Leave requests decided", "طلبات الإجازة محسومة"], blocking: false, doctype: "Leave Application", names: leave, hint: ["Undecided leave in the period changes payment days.", "الإجازات غير المحسومة في الفترة تغير أيام الدفع."] },
    { key: "attendance", title: ["Attendance corrections decided", "تصحيحات الحضور محسومة"], blocking: false, doctype: "Attendance Request", names: att, hint: ["Decide attendance requests before the cut-off.", "احسم طلبات الحضور قبل الإقفال."] },
    { key: "overtime", title: ["Overtime approved", "العمل الإضافي معتمد"], blocking: false, doctype: "Overtime Slip", names: ot, hint: ["Draft overtime is not paid in this run.", "العمل الإضافي المسودة لا يُصرف في هذا التشغيل."] },
    { key: "additional", title: ["Additional salary approved", "الرواتب الإضافية معتمدة"], blocking: false, doctype: "Additional Salary", names: adds, hint: ["Draft additions and deductions are not included.", "الإضافات والاستقطاعات المسودة لا تُحتسب."] },
    { key: "iqama", title: ["Iqamas valid", "الإقامات سارية"], blocking: false, doctype: "DIGIT Document Renewal", names: iq, hint: ["Expired Iqamas risk WPS rejection.", "الإقامات المنتهية قد تسبب رفض ملف حماية الأجور."] },
  ];
  return out;
}
export const preflightBlocked = (c: Check[]) => c.some((x) => x.blocking && x.names.length > 0);

/* ------------------------------------------------------------------ slips & variance ------------------------------------------------------------------ */
export const slipsOf = (pe: string) => list("Salary Slip").filter((d) => d["payroll_entry"] === pe && Number(d.docstatus) !== 2);
export interface VarRow { employee: string; employee_name: string; previous: number; current: number; diff: number; pct: number | null; kind: "joiner" | "leaver" | "change" | "same" }
/** Net pay per employee against the previous month's submitted slips of the same company. */
export function varianceRows(company: string, ym: string, current?: Doc[]): VarRow[] {
  const slips = list("Salary Slip").filter((d) => d["company"] === company && Number(d.docstatus) === 1);
  const cur = current ?? slips.filter((d) => d10(d["start_date"]).slice(0, 7) === ym); const prev = slips.filter((d) => d10(d["start_date"]).slice(0, 7) === prevMonth(ym));
  const pm = new Map<string, Doc>(); for (const d of prev) pm.set(s(d["employee"]), d); const cm = new Map<string, Doc>(); for (const d of cur) cm.set(s(d["employee"]), d);
  const out: VarRow[] = [];
  for (const id of new Set([...pm.keys(), ...cm.keys()])) {
    const p = n(pm.get(id)?.["net_pay"]), c = n(cm.get(id)?.["net_pay"]); const nm = s((cm.get(id) ?? pm.get(id))?.["employee_name"]);
    out.push({ employee: id, employee_name: nm, previous: r2(p), current: r2(c), diff: r2(c - p), pct: p ? Math.round(((c - p) / p) * 1000) / 10 : null, kind: !pm.has(id) ? "joiner" : !cm.has(id) ? "leaver" : Math.abs(c - p) < 0.01 ? "same" : "change" });
  }
  return out.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
}
/** Bridge from last month's net to this month's: joiners, leavers, then the change of each earning / deduction for stayers. */
export function varianceBridge(company: string, ym: string): { start: number; end: number; steps: { key: string; en: string; ar: string; value: number; names: string[] }[] } {
  const slips = list("Salary Slip").filter((d) => d["company"] === company && Number(d.docstatus) === 1);
  const cur = slips.filter((d) => d10(d["start_date"]).slice(0, 7) === ym), prev = slips.filter((d) => d10(d["start_date"]).slice(0, 7) === prevMonth(ym));
  const pm = new Map(prev.map((d) => [s(d["employee"]), d])), cm = new Map(cur.map((d) => [s(d["employee"]), d]));
  const start = r2(prev.reduce((a, d) => a + n(d["net_pay"]), 0)), end = r2(cur.reduce((a, d) => a + n(d["net_pay"]), 0));
  const joiners = cur.filter((d) => !pm.has(s(d["employee"]))), leavers = prev.filter((d) => !cm.has(s(d["employee"])));
  const stay = cur.filter((d) => pm.has(s(d["employee"])));
  const byComp = new Map<string, { v: number; names: Set<string> }>();
  const addC = (k: string, v: number, nm: string) => { if (Math.abs(v) < 0.005) return; const x = byComp.get(k) ?? { v: 0, names: new Set<string>() }; x.v += v; x.names.add(nm); byComp.set(k, x); };
  for (const d of stay) { const p = pm.get(s(d["employee"]))!;
    const sumBy = (doc: Doc, f: string) => { const m = new Map<string, number>(); for (const r of (doc[f] as Doc[] | undefined) ?? []) m.set(s(r["salary_component"]), (m.get(s(r["salary_component"])) ?? 0) + n(r["amount"])); return m; };
    const ce = sumBy(d, "earnings"), pe = sumBy(p, "earnings"), cd = sumBy(d, "deductions"), pd = sumBy(p, "deductions");
    for (const k of new Set([...ce.keys(), ...pe.keys()])) addC(k, (ce.get(k) ?? 0) - (pe.get(k) ?? 0), d.name);
    for (const k of new Set([...cd.keys(), ...pd.keys()])) addC(`− ${k}`, -((cd.get(k) ?? 0) - (pd.get(k) ?? 0)), d.name);
  }
  const steps = [
    { key: "joiners", en: "Joiners", ar: "المنضمون", value: r2(joiners.reduce((a, d) => a + n(d["net_pay"]), 0)), names: joiners.map((d) => d.name) },
    { key: "leavers", en: "Leavers", ar: "المغادرون", value: -r2(leavers.reduce((a, d) => a + n(d["net_pay"]), 0)), names: leavers.map((d) => d.name) },
    ...[...byComp].map(([k, x]) => ({ key: k, en: k, ar: k, value: r2(x.v), names: [...x.names] })),
  ].filter((x) => Math.abs(x.value) >= 0.01);
  return { start, end, steps };
}

/* ------------------------------------------------------------------ labour cost by project ------------------------------------------------------------------ */
export interface Alloc { employee: string; employee_name: string; project: string; share: number; gross: number; amount: number; basis: "timesheet" | "crew" }
/** Gross pay of a month split to projects: timesheet hours on projects first, else the employee's active crew project. */
export function labourAllocation(company: string, ym: string): Alloc[] {
  const from = monthStart(ym), to = monthEndOf(ym); const out: Alloc[] = [];
  const slips = list("Salary Slip").filter((d) => d["company"] === company && Number(d.docstatus) === 1 && d10(d["start_date"]).slice(0, 7) === ym);
  const ts = list("Timesheet").filter((d) => Number(d.docstatus) === 1 && d10(d["start_date"]) >= from && d10(d["start_date"]) <= to && s(d["parent_project"]));
  const crews = list("Digit Crew").filter((c) => s(c["status"]) === "Active" && s(c["project"]));
  for (const sl of slips) {
    const e = s(sl["employee"]); const gross = n(sl["gross_pay"]);
    const hours = new Map<string, number>(); for (const t of ts.filter((x) => x["employee"] === e)) hours.set(s(t["parent_project"]), (hours.get(s(t["parent_project"])) ?? 0) + n(t["total_hours"]));
    const total = [...hours.values()].reduce((a, b) => a + b, 0);
    if (total > 0) { for (const [p, h] of hours) out.push({ employee: e, employee_name: s(sl["employee_name"]), project: p, share: h / total, gross, amount: r2((gross * h) / total), basis: "timesheet" }); continue; }
    const mine = crews.filter((c) => ((c["members"] as Doc[] | undefined) ?? []).some((m) => m["employee"] === e)).map((c) => s(c["project"]));
    const ps = [...new Set(mine)]; for (const p of ps) out.push({ employee: e, employee_name: s(sl["employee_name"]), project: p, share: 1 / ps.length, gross, amount: r2(gross / ps.length), basis: "crew" });
  }
  return out;
}

/* ------------------------------------------------------------------ accounts & journal ------------------------------------------------------------------ */
const ACC: Record<string, RegExp> = {
  salary: /^(Salary|Salaries|Salaries and Wages|الرواتب|الرواتب والأجور) - /i, payable: /^(Salary Payable|Payroll Payable|رواتب مستحقة) - /i,
  gosi_payable: /^(GOSI Payable|التأمينات الاجتماعية المستحقة) - /i, gosi_expense: /^(GOSI Expense|مصروف التأمينات الاجتماعية) - /i,
  eos_expense: /^(End of Service Expense|مصروف مكافأة نهاية الخدمة) - /i, eos_provision: /^(End of Service Provision|مخصص مكافأة نهاية الخدمة) - /i,
  leave_expense: /^(Leave Salary Expense|مصروف رواتب الإجازات) - /i, leave_provision: /^(Leave Salary Provision|مخصص رواتب الإجازات) - /i,
  ticket_expense: /^(Air Ticket Expense|مصروف تذاكر السفر) - /i, ticket_provision: /^(Air Ticket Provision|مخصص تذاكر السفر) - /i,
  advance: /^(Employee Advances|سلف الموظفين) - /i,
};
export type AccKind = keyof typeof ACC;
/** The company's account for a payroll purpose (native Company / Payroll Entry fields first, then by account name). */
export function payrollAccount(company: string, kind: AccKind, pe?: Doc): string | undefined {
  if (kind === "payable") { const v = s(pe?.["payroll_payable_account"]) || s(adapter.get("Company", company)?.["default_payroll_payable_account"]); if (v) return v; }
  if (kind === "advance") { const v = s(adapter.get("Company", company)?.["default_employee_advance_account"]); if (v) return v; }
  return list("Account").find((a) => a["company"] === company && !Number(a["is_group"]) && ACC[kind]!.test(a.name))?.name;
}
export function bankAccount(company: string): string | undefined {
  return s(adapter.get("Company", company)?.["default_bank_account"]) || list("Account").find((a) => a["company"] === company && !Number(a["is_group"]) && s(a["account_type"]) === "Bank")?.name;
}
export function costCenterOf(e: Doc, company: string): string {
  const br = s(e["branch"]); const cc = list("Cost Center").filter((c) => c["company"] === company && !Number(c["is_group"]));
  const hit = br ? cc.find((c) => s(c["cost_center_name"]) === br || c.name.startsWith(`${br} - `)) : undefined;
  return hit?.name || s(e["payroll_cost_center"]) || s(adapter.get("Company", company)?.["cost_center"]) || cc.find((c) => /^Main - /.test(c.name))?.name || "";
}
export interface JournalLine { account: string; debit: number; credit: number; cost_center?: string | undefined; project?: string | undefined; digit_cost_category?: string | undefined; party_type?: string | undefined; party?: string | undefined; user_remark?: string | undefined }
/**
 * Accrual journal of a payroll run: gross pay by cost center and project (labour allocation), employee GOSI and other
 * deductions to their accounts, net pay to salary payable, and the employer GOSI share (expense / payable).
 */
export function payrollJournal(pe: Doc, slips: Doc[]): { lines: JournalLine[]; errors: string[] } {
  const co = s(pe["company"]); const errors: string[] = []; const need = (k: AccKind) => { const a = payrollAccount(co, k, pe); if (!a) errors.push(`Account for ${k.replace(/_/g, " ")} is missing for ${co}`); return a ?? ""; };
  const salary = need("salary"), payable = need("payable"); const ym = d10(pe["start_date"]).slice(0, 7);
  const alloc = new Map<string, Alloc[]>(); for (const a of labourAllocation(co, ym)) { const l = alloc.get(a.employee); if (l) l.push(a); else alloc.set(a.employee, [a]); }
  const grossBy = new Map<string, number>(); let gosiEmp = 0, otherDed = 0, net = 0, gosiEr = 0; const docs = identityIndex();
  for (const sl of slips) {
    const e = adapter.get("Employee", s(sl["employee"])); const cc = e ? costCenterOf(e, co) : ""; const g = n(sl["gross_pay"]);
    const parts = alloc.get(s(sl["employee"])); if (parts?.length) for (const p of parts) { const k = `${cc}|${p.project}`; grossBy.set(k, (grossBy.get(k) ?? 0) + (g * p.share)); } else { const k = `${cc}|`; grossBy.set(k, (grossBy.get(k) ?? 0) + g); }
    for (const r of (sl["deductions"] as Doc[] | undefined) ?? []) { if (isGosiComponent({ component: s(r["salary_component"]), abbr: s(r["abbr"]) })) gosiEmp += n(r["amount"]); else otherDed += n(r["amount"]); }
    net += n(sl["net_pay"]);
    if (e) { const bh = comp(sl["earnings"], BASIC) + comp(sl["earnings"], HOUSING); const f = n(sl["payment_days"]) && n(sl["total_working_days"]) ? n(sl["total_working_days"]) / n(sl["payment_days"]) : 1; const gz = gosiShares(e, bh * f, d10(sl["end_date"]), docs); if (gz) gosiEr += gz.employer; }
  }
  const lines: JournalLine[] = [];
  for (const [k, v] of grossBy) { const [cc, project] = k.split("|"); lines.push({ account: salary, debit: r2(v), credit: 0, cost_center: cc || undefined, project: project || undefined }); }
  // rounding from the project split goes to the first gross line
  const gross = r2(slips.reduce((a, d) => a + n(d["gross_pay"]), 0)); const dr = r2(lines.reduce((a, l) => a + l.debit, 0)); if (lines[0] && Math.abs(gross - dr) >= 0.005) lines[0].debit = r2(lines[0].debit + gross - dr);
  if (gosiEmp) lines.push({ account: need("gosi_payable"), debit: 0, credit: r2(gosiEmp), user_remark: "GOSI employee share" });
  if (otherDed) lines.push({ account: need("advance"), debit: 0, credit: r2(otherDed), user_remark: "Advance and loan recoveries" });
  lines.push({ account: payable, debit: 0, credit: r2(net), user_remark: "Net pay" });
  if (gosiEr) { lines.push({ account: need("gosi_expense"), debit: r2(gosiEr), credit: 0, cost_center: costCenterOf({ name: "", doctype: "Employee", company: co }, co) || undefined, user_remark: "GOSI employer share" }); lines.push({ account: need("gosi_payable"), debit: 0, credit: r2(gosiEr), user_remark: "GOSI employer share" }); }
  return { lines: lines.filter((l) => l.debit || l.credit), errors: [...new Set(errors)] };
}

const PAYABLE = /^(Salary Payable|Payroll Payable|رواتب مستحقة) - /i;
const touchesPayable = (j: Doc, side: "debit" | "credit") => ((j["accounts"] as Doc[] | undefined) ?? []).some((a) => PAYABLE.test(s(a["account"])) && n(a[side] ?? a[`${side}_in_account_currency`]) > 0);
const near = (a: string, b: string, days: number) => { const x = (Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86400000; return x >= 0 && x <= days; };
/** The accrual journal of a run: linked by payroll_entry / journal_entry, else the company's salary-payable credit dated at the run's end. */
export function accrualOf(pe: Doc): Doc | undefined {
  const js = list("Journal Entry").filter((j) => Number(j.docstatus) === 1 && j["company"] === pe["company"]);
  return js.find((j) => j.name === pe["journal_entry"] || (j["payroll_entry"] === pe.name && s(j["voucher_type"]) !== "Bank Entry")) ?? js.find((j) => !j["payroll_entry"] && s(j["voucher_type"]) !== "Bank Entry" && touchesPayable(j, "credit") && near(d10(j["posting_date"]), d10(pe["end_date"]), 3));
}
/** The salary transfer of a run: a bank entry linked by payroll_entry, else the company's salary-payable debit within 15 days after the run's end. */
export function paymentOf(pe: Doc): Doc | undefined {
  const js = list("Journal Entry").filter((j) => Number(j.docstatus) === 1 && j["company"] === pe["company"] && s(j["voucher_type"]) === "Bank Entry");
  return js.find((j) => j["payroll_entry"] === pe.name) ?? js.find((j) => !j["payroll_entry"] && touchesPayable(j, "debit") && near(d10(j["posting_date"]), d10(pe["end_date"]), 15));
}

/* ------------------------------------------------------------------ WPS ------------------------------------------------------------------ */
/** WPS / Mudad salary file rows (one per paid employee) and the file text (CSV, UTF-8) for upload through the bank. */
export function wpsFile(pe: Doc, slips: Doc[]): { rows: Record<string, string | number>[]; text: string; errors: string[]; total: number } {
  const errors: string[] = []; const docs = list("DIGIT Document Renewal");
  const idOf = (e: string) => s(docs.filter((d) => d["employee"] === e && (d["document_type"] === "National ID" || d["document_type"] === "Iqama")).sort((a, b) => d10(b["issue_date"]).localeCompare(d10(a["issue_date"])))[0]?.["document_number"]);
  const ib = appliedIbans();
  const rows = slips.map((sl) => { const e = adapter.get("Employee", s(sl["employee"])) ?? ({ name: s(sl["employee"]) } as Doc); const iban = ibanOf(e, ib); if (!iban) errors.push(`${s(sl["employee_name"])}: no IBAN`);
    const basic = comp(sl["earnings"], BASIC), housing = comp(sl["earnings"], HOUSING), other = r2(n(sl["gross_pay"]) - basic - housing);
    return { employee_id: idOf(s(sl["employee"])) || s(sl["employee"]), employee_name: s((sl["__name_en"] as Record<string, string> | undefined)?.["employee_name"]) || s(sl["employee_name"]), bank: s(e["bank_name"]) || s(list("DIGIT Bank Change Request").find((x) => x["employee"] === e.name && s(x["request_status"]) === "Applied")?.["new_bank_name"]), iban, basic: r2(basic), housing: r2(housing), other, deductions: r2(n(sl["total_deduction"])), net: r2(n(sl["net_pay"])), period: d10(sl["start_date"]).slice(0, 7) }; });
  const head = ["employee_id", "employee_name", "bank", "iban", "basic", "housing", "other", "deductions", "net", "period"];
  const esc = (v: unknown) => { const t = String(v ?? ""); return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
  const text = [head.join(","), ...rows.map((r) => head.map((h) => esc(r[h as keyof typeof r])).join(","))].join("\n");
  return { rows, text, errors, total: r2(rows.reduce((a, r) => a + Number(r.net), 0)) };
}

/* ------------------------------------------------------------------ accruals ------------------------------------------------------------------ */
/** Month-end provisions: end of service (change of the termination-basis award since last month), leave salary (unused balance × daily wage), air tickets (setting). */
export function accruals(company: string, ym: string): { eos: number; leave: number; ticket: number; employees: number; notes: [string, string][] } {
  const end = monthEndOf(ym), prevEnd = monthEndOf(prevMonth(ym)); const emps = list("Employee").filter((e) => e["company"] === company && s(e["status"]) === "Active" && d10(e["date_of_joining"]) <= end);
  let eos = 0, leave = 0; const notes: [string, string][] = [];
  for (const e of emps) { const w = wageOf(e.name, end).wage; eos += eosAward(e, end, "termination", w).full - (d10(e["date_of_joining"]) <= prevEnd ? eosAward(e, prevEnd, "termination", w).full : 0); }
  if (policyValue("leave_salary_accrual", end, company)) {
    const alloc = list("Leave Allocation").filter((d) => d["company"] === company && Number(d.docstatus) === 1 && s(d["leave_type"]) === "Annual Leave");
    for (const e of emps) { const days = (policyValue("annual_leave_days", end, company) ?? 21) / 12; const daily = wageOf(e.name, end).wage / 30; if (alloc.some((a) => a["employee"] === e.name)) leave += days * daily; }
  } else notes.push(["Leave salary accrual is switched off in the settings.", "استحقاق راتب الإجازة متوقف في الإعدادات."]);
  const t = policyValue("air_ticket_accrual_month", end, company); const ticket = t === null ? 0 : t * emps.filter((e) => !!nationalityOf(e) && nationalityOf(e) === "Non-Saudi").length;
  if (t === null) notes.push(["Air ticket accrual needs the monthly amount in the settings.", "استحقاق تذاكر السفر يحتاج إلى المبلغ الشهري في الإعدادات."]);
  return { eos: r2(eos), leave: r2(leave), ticket: r2(ticket), employees: emps.length, notes };
}
export function accrualJournal(company: string, ym: string): { lines: JournalLine[]; errors: string[] } {
  const a = accruals(company, ym); const errors: string[] = []; const lines: JournalLine[] = [];
  const pair = (amt: number, ex: AccKind, pv: AccKind, remark: string) => { if (amt <= 0) return; const e = payrollAccount(company, ex), p = payrollAccount(company, pv); if (!e || !p) { errors.push(`Accounts for ${remark} are missing for ${company}`); return; } lines.push({ account: e, debit: amt, credit: 0, user_remark: remark }, { account: p, debit: 0, credit: amt, user_remark: remark }); };
  pair(a.eos, "eos_expense", "eos_provision", "End of service provision"); pair(a.leave, "leave_expense", "leave_provision", "Leave salary provision"); pair(a.ticket, "ticket_expense", "ticket_provision", "Air ticket provision");
  return { lines, errors };
}
