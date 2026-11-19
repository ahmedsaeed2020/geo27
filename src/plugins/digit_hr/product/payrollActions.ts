/**
 * DIGIT HR payroll cycle writes (brief §3): preflight → salary slips → variance review → submit and post → WPS file →
 * GOSI → bank payment → period lock. Every step checks the session's permission (HR scope), refuses on a locked period,
 * and posts only through the native posting engine (Journal Entry submit), so ledgers stay Core-owned.
 */
import { fourEyesErrors } from "../r10/features/payroll";
import { adapter, type Doc } from "@/lib/adapter";
import { submit as postSubmit, submitErrors } from "@/lib/posting";
import { currentUser } from "@/lib/session";
import { assertScoped } from "../compat/scope";
import { policyValue } from "./settings";
import { formulaVars,
  assignmentOf, BASIC, HOUSING, gosiShares, identityIndex, isGosiComponent, lockOn, monthEndOf, payrollEmployees, payrollJournal,
  preflight, preflightBlocked, slipsOf, accrualOf, paymentOf, structureLines, varianceRows, wpsFile, bankAccount, payrollAccount, accrualJournal, type Check, type JournalLine,
} from "./payroll";

export interface StepResult { ok: boolean; errors: string[]; message: [string, string]; created: [string, string][] }
const s = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v));
const n = (v: unknown) => Number(v) || 0;
const r2 = (x: number) => Math.round(x * 100) / 100;
const d10 = (v: unknown) => s(v).slice(0, 10);
const fail = (errors: string[], en = "The step was not run.", ar = "لم تُنفذ الخطوة."): StepResult => ({ ok: false, errors, message: [en, ar], created: [] });
function guard(fn: () => StepResult): StepResult {
  try { return fn(); } catch (e) { return fail([e instanceof Error ? e.message : String(e)]); }
}
const peOf = (name: string) => { const pe = adapter.get("Payroll Entry", name); if (!pe) throw new Error(`Payroll Entry ${name} not found`); return pe; };
const ymOf = (pe: Doc) => d10(pe["start_date"]).slice(0, 7);
const workdays = (from: string, to: string, holidays: Set<string>) => { let k = 0; for (let t = Date.parse(`${from}T00:00:00Z`); t <= Date.parse(`${to}T00:00:00Z`); t += 86400000) { const d = new Date(t); const w = d.getUTCDay(); const iso = d.toISOString().slice(0, 10); if (w !== 5 && w !== 6 && !holidays.has(iso)) k++; } return k; };
function holidaysOf(company: string): Set<string> {
  const hl = s(adapter.get("Company", company)?.["default_holiday_list"]); const h = hl ? adapter.get("Holiday List", hl) : undefined;
  return new Set(((h?.["holidays"] as Doc[] | undefined) ?? []).map((x) => d10(x["holiday_date"])));
}
const overlapDays = (a1: string, a2: string, b1: string, b2: string) => { const x = a1 > b1 ? a1 : b1, y = a2 < b2 ? a2 : b2; return x > y ? 0 : Math.round((Date.parse(y) - Date.parse(x)) / 86400000) + 1; };

/** Step 1 — record the preflight for a payroll entry (one record per entry, refreshed on every run). */
export function runPreflight(peName: string, user = currentUser()): StepResult & { checks: Check[] } {
  let checks: Check[] = [];
  const r = guard(() => {
    const pe = peOf(peName); assertScoped("Payroll Entry", "read", pe, user); assertScoped("DIGIT Payroll Preflight", "create", undefined, user);
    checks = preflight(pe); const blocked = preflightBlocked(checks);
    const findings = checks.filter((c) => c.names.length).map((c) => `${c.blocking ? "BLOCK" : "WARN"} ${c.title[0]}: ${c.names.length}`).join("\n");
    const prev = adapter.list("DIGIT Payroll Preflight").find((d) => d["payroll_entry"] === peName && s(d["preflight_status"]) !== "Passed");
    const vals = { company: pe["company"], payroll_entry: peName, checked_on: new Date().toISOString().slice(0, 10), preflight_status: blocked ? "Blocked" : "Passed",
      missing_bank_details: checks.find((c) => c.key === "bank")?.names.length ?? 0, missing_salary_structure: checks.find((c) => c.key === "ssa")?.names.length ?? 0,
      pending_leave_approvals: checks.find((c) => c.key === "leave")?.names.length ?? 0, findings };
    let name: string;
    if (prev) { adapter.update("DIGIT Payroll Preflight", prev.name, vals); name = prev.name; } else name = adapter.insertDoc("DIGIT Payroll Preflight", vals).name;
    return { ok: !blocked, errors: blocked ? checks.filter((c) => c.blocking && c.names.length).map((c) => `${c.title[0]}: ${c.names.length}`) : [], message: blocked ? ["Preflight blocked — fix the listed items.", "الفحص المسبق متوقف — عالج البنود المذكورة."] : ["Preflight passed.", "اجتاز الفحص المسبق."], created: [["DIGIT Payroll Preflight", name]] };
  });
  return { ...r, checks };
}

/** Lines of one employee's slip for the period (structure, proration, approved additional salary and overtime, GOSI from the settings). */
export function slipFor(pe: Doc, emp: Doc, docs = identityIndex()): { doc?: Record<string, unknown>; errors: string[] } {
  const from = d10(pe["start_date"]), to = d10(pe["end_date"]); const co = s(pe["company"]);
  const ssa = assignmentOf(emp.name, to); if (!ssa) return { errors: [`${s(emp["employee_name"])}: no salary structure`] };
  const st = adapter.get("Salary Structure", s(ssa["salary_structure"])); if (!st) return { errors: [`${s(ssa["salary_structure"])}: structure not found`] };
  const lines = structureLines(st, n(ssa["base"]), formulaVars(emp, ssa)); if (lines.errors.length) return { errors: lines.errors };
  const hol = holidaysOf(co); const total = workdays(from, to, hol);
  const join = d10(emp["date_of_joining"]), rel = d10(emp["relieving_date"]);
  const activeFrom = join > from ? join : from, activeTo = rel && rel < to ? rel : to;
  const lwp = adapter.list("Leave Application").filter((d) => d["employee"] === emp.name && Number(d.docstatus) === 1 && s(d["status"]) === "Approved" && /without pay/i.test(s(d["leave_type"]))).reduce((a, d) => a + overlapDays(d10(d["from_date"]), d10(d["to_date"]), from, to), 0);
  const absent = adapter.list("Attendance").filter((d) => d["employee"] === emp.name && Number(d.docstatus) === 1 && s(d["status"]) === "Absent" && d10(d["attendance_date"]) >= from && d10(d["attendance_date"]) <= to).length;
  const payDays = Math.max(0, workdays(activeFrom, activeTo, hol) - lwp - absent); const f = total ? payDays / total : 0;
  const earnings = lines.earnings.map((l) => ({ salary_component: l.component, abbr: l.abbr, amount: r2(l.amount * f), default_amount: l.amount }));
  const deductions = lines.deductions.filter((l) => !isGosiComponent(l)).map((l) => ({ salary_component: l.component, abbr: l.abbr, amount: r2(l.amount * f), default_amount: l.amount }));
  for (const a of adapter.list("Additional Salary").filter((d) => d["employee"] === emp.name && Number(d.docstatus) === 1 && d10(d["payroll_date"]) >= from && d10(d["payroll_date"]) <= to)) {
    const c = adapter.get("Salary Component", s(a["salary_component"])); const row = { salary_component: s(a["salary_component"]), abbr: s(c?.["salary_component_abbr"]) || s(a["salary_component"]), amount: r2(n(a["amount"])), default_amount: r2(n(a["amount"])), additional_salary: a.name };
    (s(a["type"] || c?.["type"]) === "Deduction" ? deductions : earnings).push(row);
  }
  const otH = adapter.list("Overtime Slip").filter((d) => d["employee"] === emp.name && Number(d.docstatus) === 1 && d10(d["posting_date"]) >= from && d10(d["posting_date"]) <= to).reduce((a, d) => a + n(d["total_overtime_duration"]) / 3600, 0);
  if (otH > 0) { const basic = lines.earnings.filter((l) => BASIC.test(l.component) || BASIC.test(l.abbr)).reduce((a, l) => a + l.amount, 0); const hourly = basic / 30 / (policyValue("work_hours_day", to, co) ?? 8); earnings.push({ salary_component: "Overtime", abbr: "OT", amount: r2(otH * hourly * ((policyValue("overtime_rate_pct", to, co) ?? 150) / 100)), default_amount: 0 }); }
  const bh = earnings.filter((e) => BASIC.test(e.salary_component) || BASIC.test(e.abbr) || HOUSING.test(e.salary_component) || HOUSING.test(e.abbr)).reduce((a, e) => a + n(e.default_amount), 0);
  const g = gosiShares(emp, bh, to, docs); if (!g) return { errors: [`${s(emp["employee_name"])}: nationality not recorded (GOSI)`] };
  if (g.employee) deductions.unshift({ salary_component: "GOSI Employee Share", abbr: "GOSI", amount: r2(g.employee * f), default_amount: g.employee });
  const gross = r2(earnings.reduce((a, e) => a + e.amount, 0)), ded = r2(deductions.reduce((a, e) => a + e.amount, 0));
  return { errors: [], doc: { name: `SAL-${ymOf(pe)}-${emp.name}`, employee: emp.name, employee_name: emp["employee_name"], department: emp["department"], designation: emp["designation"], branch: emp["branch"], company: co,
    posting_date: to, start_date: from, end_date: to, currency: "SAR", payroll_frequency: "Monthly", salary_structure: st.name, payroll_entry: pe.name, status: "Draft",
    earnings: earnings.map((e, i) => ({ idx: i + 1, ...e })), deductions: deductions.map((e, i) => ({ idx: i + 1, ...e })), gross_pay: gross, base_gross_pay: gross, total_deduction: ded, net_pay: r2(gross - ded), base_net_pay: r2(gross - ded), rounded_total: Math.round(gross - ded),
    payment_days: payDays, total_working_days: total, leave_without_pay: lwp, absent_days: absent, __name_en: emp["__name_en"] } };
}

/** Step 2 — create (or refresh) the draft salary slips of the payroll entry. */
export function makeSlips(peName: string, user = currentUser()): StepResult {
  return guard(() => {
    const pe = peOf(peName); assertScoped("Payroll Entry", "write", pe, user); assertScoped("Salary Slip", "create", undefined, user);
    if (Number(pe.docstatus) !== 0) return fail(["The payroll entry is already submitted."]);
    if (lockOn(s(pe["company"]), d10(pe["end_date"]))) return fail(["The payroll period is locked."]);
    const docs = identityIndex(); const errors: string[] = []; const created: [string, string][] = [];
    adapter.batch(() => {
      for (const d of slipsOf(peName).filter((x) => Number(x.docstatus) === 0)) adapter.remove("Salary Slip", d.name);
      for (const e of payrollEmployees(pe)) { const r = slipFor(pe, e, docs); if (r.doc) { adapter.insertDoc("Salary Slip", r.doc); created.push(["Salary Slip", s(r.doc["name"])]); } else errors.push(...r.errors); }
      const slips = slipsOf(peName);
      adapter.update("Payroll Entry", peName, { salary_slips_created: 1, number_of_employees: slips.length, __preview_gross: r2(slips.reduce((a, d) => a + n(d["gross_pay"]), 0)), __preview_net: r2(slips.reduce((a, d) => a + n(d["net_pay"]), 0)) });
    });
    return { ok: !errors.length, errors, message: [`${created.length} salary slips ready.`, `${created.length} قسيمة راتب جاهزة.`], created };
  });
}

/** Step 3 — record the variances above the setting against last month (Open until HR explains them). */
export function recordVariances(peName: string, user = currentUser()): StepResult {
  return guard(() => {
    const pe = peOf(peName); assertScoped("DIGIT Payroll Variance", "create", undefined, user);
    const limit = policyValue("payroll_variance_pct", d10(pe["end_date"]), s(pe["company"])) ?? 10; const slips = slipsOf(peName);
    const rows = varianceRows(s(pe["company"]), ymOf(pe), slips).filter((r) => r.kind === "change" && r.pct !== null && Math.abs(r.pct) >= limit);
    const created: [string, string][] = [];
    adapter.batch(() => { for (const r of rows) { if (adapter.list("DIGIT Payroll Variance").some((v) => v["payroll_entry"] === peName && v["employee"] === r.employee)) continue;
      const v = adapter.insertDoc("DIGIT Payroll Variance", { employee: r.employee, employee_name: r.employee_name, company: pe["company"], payroll_entry: peName, salary_slip: slips.find((x) => x["employee"] === r.employee)?.name, previous_net: r.previous, current_net: r.current, variance_amount: r.diff, variance_status: "Open" }); created.push(["DIGIT Payroll Variance", v.name]); } });
    return { ok: true, errors: [], message: [`${created.length} variances above ${limit}% recorded.`, `سُجّلت ${created.length} فروقات تتجاوز ${limit}%.`], created };
  });
}
export const openVariances = (peName: string) => adapter.list("DIGIT Payroll Variance").filter((v) => v["payroll_entry"] === peName && s(v["variance_status"]) !== "Explained");

function journal(company: string, date: string, title: string, voucher_type: string, lines: JournalLine[], remark: string, refs: Record<string, unknown> = {}): { name: string; errors: string[] } {
  const accounts = lines.map((l, i) => ({ idx: i + 1, account: l.account, debit_in_account_currency: l.debit, credit_in_account_currency: l.credit, debit: l.debit, credit: l.credit, cost_center: l.cost_center, project: l.project, digit_cost_category: l.project ? "Labour" : undefined, user_remark: l.user_remark, party_type: l.party_type, party: l.party }));
  const je = adapter.insertDoc("Journal Entry", { title, voucher_type, company, posting_date: date, accounts, total_debit: r2(lines.reduce((a, l) => a + l.debit, 0)), total_credit: r2(lines.reduce((a, l) => a + l.credit, 0)), user_remark: remark, ...refs });
  const errors = postSubmit("Journal Entry", je.name); if (errors.length) adapter.remove("Journal Entry", je.name);
  return { name: je.name, errors };
}

/** Step 4 — submit the slips and the payroll entry, and post the accrual journal by component, cost center and project. */
export function submitPayroll(peName: string, user = currentUser()): StepResult {
  return guard(() => {
    const pe = peOf(peName); assertScoped("Payroll Entry", "submit", pe, user); assertScoped("Journal Entry", "create", undefined, user);
    if (Number(pe.docstatus) !== 0) return fail(["The payroll entry is already submitted."]);
    const co = s(pe["company"]); if (lockOn(co, d10(pe["end_date"]))) return fail(["The payroll period is locked."]);
    const checks = preflight(pe); if (preflightBlocked(checks)) return fail(checks.filter((c) => c.blocking && c.names.length).map((c) => `${c.title[0]}: ${c.names.length}`), "Preflight is blocked.", "الفحص المسبق متوقف.");
    const slips = slipsOf(peName).filter((d) => Number(d.docstatus) === 0); if (!slips.length) return fail(["Create the salary slips first."]);
    // HR round 2 PAY-15: four eyes — an independent verifier (not the preparer) before posting, while the setting requires it
    const fe = fourEyesErrors(pe, user); if (fe.length) return fail(fe, "Independent verification is required.", "التحقق المستقل مطلوب.");
    const ov = openVariances(peName); if (ov.length) return fail([`${ov.length} variances are not explained.`], "Explain the open variances first.", "فسّر الفروقات المفتوحة أولًا.");
    const j = payrollJournal(pe, slips); if (j.errors.length) return fail(j.errors);
    let res: StepResult = fail(["not run"]);
    adapter.batch(() => {
      const checks = [...slips.flatMap(d => submitErrors("Salary Slip", d)), ...submitErrors("Payroll Entry", pe)];
      if (checks.length) { res = fail(checks); return; }
      const p = journal(co, d10(pe["posting_date"]) || d10(pe["end_date"]), `Payroll ${ymOf(pe)} — ${s(pe["title"]) || pe.name}`, "Journal Entry", j.lines, `Payroll accrual of ${pe.name}`, { payroll_entry: pe.name });
      if (p.errors.length) { res = fail(p.errors); return; }
      for (const d of slips) { const errors = postSubmit("Salary Slip", d.name); if (errors.length) throw new Error(errors.join("; ")); }
      const errors = postSubmit("Payroll Entry", peName); if (errors.length) throw new Error(errors.join("; "));
      adapter.update("Payroll Entry", peName, { salary_slips_submitted: 1, journal_entry: p.name });
      res = { ok: true, errors: [], message: [`Payroll posted (${slips.length} slips).`, `رُحّل المسير (${slips.length} قسيمة).`], created: [["Journal Entry", p.name]] };
    });
    return res;
  });
}

/** Step 5 — prepare the WPS salary file from the same run (status Prepared; sending stays with the bank / Mudad). */
export function makeWps(peName: string, user = currentUser()): StepResult & { text?: string | undefined } {
  let text: string | undefined;
  const r = guard(() => {
    const pe = peOf(peName); assertScoped("DIGIT WPS Submission", "create", undefined, user);
    if (Number(pe.docstatus) !== 1) return fail(["Submit the payroll entry first."], "Submit the payroll first.", "رحّل المسير أولًا.");
    const slips = slipsOf(peName).filter((d) => Number(d.docstatus) === 1); const f = wpsFile(pe, slips); text = f.text;
    if (f.errors.length) return fail(f.errors);
    const ex = adapter.list("DIGIT WPS Submission").find((d) => d["payroll_entry"] === peName && Number(d.docstatus) !== 2);
    if (ex) return { ok: true, errors: [], message: ["The WPS file was already prepared.", "ملف حماية الأجور مُعد مسبقًا."], created: [["DIGIT WPS Submission", ex.name]] };
    const w = adapter.insertDoc("DIGIT WPS Submission", { company: pe["company"], payroll_entry: peName, period_month: `${ymOf(pe)}-01`, employee_count: f.rows.length, total_amount: f.total, submission_status: "Prepared", notes: `WPS file of ${f.rows.length} employees` });
    return { ok: true, errors: [], message: [`WPS file prepared: ${f.rows.length} employees.`, `أُعد ملف حماية الأجور: ${f.rows.length} موظفًا.`], created: [["DIGIT WPS Submission", w.name]] };
  });
  return { ...r, text };
}

/** Step 6 — record the GOSI contribution of every slip of the run under the approved GOSI rule set. */
export function makeGosi(peName: string, user = currentUser()): StepResult {
  return guard(() => {
    const pe = peOf(peName); assertScoped("DIGIT GOSI Assessment", "create", undefined, user); const co = s(pe["company"]); const to = d10(pe["end_date"]);
    const rs = adapter.list("DIGIT Saudi Rule Set").filter((d) => d["company"] === co && s(d["rule_area"]) === "GOSI" && s(d["rule_status"]) === "Approved" && d10(d["effective_from"]) <= to && (!d10(d["effective_to"]) || d10(d["effective_to"]) >= to))[0];
    if (!rs) return fail(["Approve a GOSI rule set for the company first."], "No approved GOSI rule set.", "لا توجد قواعد تأمينات معتمدة.");
    const docs = identityIndex(); const created: [string, string][] = []; const pm = `${ymOf(pe)}-01`;
    adapter.batch(() => { for (const sl of slipsOf(peName).filter((d) => Number(d.docstatus) === 1)) {
      if (adapter.list("DIGIT GOSI Assessment").some((g) => g["employee"] === sl["employee"] && d10(g["period_month"]) === pm)) continue;
      const e = adapter.get("Employee", s(sl["employee"])); if (!e) continue;
      const bh = ((sl["earnings"] as Doc[] | undefined) ?? []).filter((x) => BASIC.test(s(x["salary_component"])) || HOUSING.test(s(x["salary_component"]))).reduce((a, x) => a + n(x["default_amount"] ?? x["amount"]), 0);
      const g = gosiShares(e, bh, to, docs); if (!g) continue;
      const d = adapter.insertDoc("DIGIT GOSI Assessment", { employee: e.name, employee_name: e["employee_name"], company: co, period_month: pm, rule_set: rs.name, contributory_wage: g.wage, employee_share: g.employee, employer_share: g.employer, docstatus: 1 }); created.push(["DIGIT GOSI Assessment", d.name]);
    } });
    return { ok: true, errors: [], message: [`${created.length} GOSI assessments recorded.`, `سُجّل ${created.length} تقييم تأمينات.`], created };
  });
}

/** Step 7 — pay the net salaries from the bank (clears salary payable). */
export function payBank(peName: string, user = currentUser()): StepResult {
  return guard(() => {
    const pe = peOf(peName); assertScoped("Journal Entry", "create", undefined, user); const co = s(pe["company"]);
    if (Number(pe.docstatus) !== 1) return fail(["Submit the payroll entry first."]);
    if (paymentOf(pe)) return fail(["Salaries of this run are already paid."]);
    const net = r2(slipsOf(peName).filter((d) => Number(d.docstatus) === 1).reduce((a, d) => a + n(d["net_pay"]), 0));
    const payable = payrollAccount(co, "payable", pe), bank = bankAccount(co); if (!payable || !bank) return fail([`Salary payable or bank account is missing for ${co}`]);
    let res: StepResult = fail(["not run"]);
    adapter.batch(() => { const p = journal(co, new Date().toISOString().slice(0, 10), `Salary transfer ${ymOf(pe)}`, "Bank Entry", [{ account: payable, debit: net, credit: 0 }, { account: bank, debit: 0, credit: net }], `WPS salary transfer of ${pe.name}`, { payroll_entry: pe.name });
      res = p.errors.length ? fail(p.errors) : { ok: true, errors: [], message: ["Salary transfer posted.", "رُحّل تحويل الرواتب."], created: [["Journal Entry", p.name]] }; });
    return res;
  });
}

/** Month-end provisions journal (end of service, leave salary, air tickets per the settings). */
export function postAccruals(company: string, ym: string, user = currentUser()): StepResult {
  return guard(() => {
    assertScoped("Journal Entry", "create", undefined, user);
    if (adapter.list("Journal Entry").some((j) => j["company"] === company && s(j["digit_hr_accrual"]) === ym && Number(j.docstatus) === 1)) return fail(["Provisions of this month are already posted."]);
    const j = accrualJournal(company, ym); if (j.errors.length) return fail(j.errors); if (!j.lines.length) return fail(["Nothing to provide for this month."]);
    let res: StepResult = fail(["not run"]);
    adapter.batch(() => { const p = journal(company, monthEndOf(ym), `HR provisions ${ym}`, "Journal Entry", j.lines, "End of service, leave salary and air ticket provisions", { digit_hr_accrual: ym }); res = p.errors.length ? fail(p.errors) : { ok: true, errors: [], message: ["Provisions posted.", "رُحّلت المخصصات."], created: [["Journal Entry", p.name]] }; });
    return res;
  });
}

/** Step 8 — lock the payroll period (a reopen needs a reason on the lock record). */
export function lockPeriod(company: string, ym: string, user = currentUser()): StepResult {
  return guard(() => {
    assertScoped("DIGIT Payroll Period Lock", "create", undefined, user);
    if (lockOn(company, monthEndOf(ym))) return fail(["The period is already locked."]);
    const d = adapter.insertDoc("DIGIT Payroll Period Lock", { company, from_date: `${ym}-01`, to_date: monthEndOf(ym), lock_status: "Locked", locked_by: user, locked_on: new Date().toISOString().slice(0, 10) });
    return { ok: true, errors: [], message: ["Payroll period locked.", "أُقفلت فترة الرواتب."], created: [["DIGIT Payroll Period Lock", d.name]] };
  });
}

/** Where a payroll entry stands in the cycle (for the stage strip of the payroll screen). */
export function cycleState(peName: string): { stage: number; steps: { key: string; en: string; ar: string; done: boolean; ref?: string | undefined }[] } {
  const pe = adapter.get("Payroll Entry", peName); if (!pe) return { stage: 0, steps: [] };
  const pf = adapter.list("DIGIT Payroll Preflight").filter((d) => d["payroll_entry"] === peName).sort((a, b) => s(b.modified).localeCompare(s(a.modified)))[0];
  const slips = slipsOf(peName); const wps = adapter.list("DIGIT WPS Submission").find((d) => d["payroll_entry"] === peName);
  const ym = ymOf(pe); const gosi = adapter.list("DIGIT GOSI Assessment").some((g) => g["company"] === pe["company"] && d10(g["period_month"]) === `${ym}-01`);
  const paid = paymentOf(pe);
  const lock = lockOn(s(pe["company"]), d10(pe["end_date"]));
  const steps = [
    { key: "preflight", en: "Preflight", ar: "الفحص المسبق", done: s(pf?.["preflight_status"]) === "Passed", ref: pf?.name },
    { key: "slips", en: "Salary slips", ar: "قسائم الرواتب", done: slips.length > 0 },
    { key: "variance", en: "Variance review", ar: "مراجعة الفروقات", done: slips.length > 0 && openVariances(peName).length === 0 },
    { key: "post", en: "Submit & post", ar: "الاعتماد والترحيل", done: Number(pe.docstatus) === 1, ref: accrualOf(pe)?.name },
    { key: "wps", en: "WPS file", ar: "ملف حماية الأجور", done: !!wps, ref: wps?.name },
    { key: "gosi", en: "GOSI", ar: "التأمينات", done: gosi },
    { key: "pay", en: "Bank payment", ar: "التحويل البنكي", done: !!paid, ref: paid?.name },
    { key: "lock", en: "Period lock", ar: "إقفال الفترة", done: !!lock, ref: lock?.name },
  ];
  const stage = steps.findIndex((x) => !x.done); return { stage: stage < 0 ? steps.length : stage, steps };
}
