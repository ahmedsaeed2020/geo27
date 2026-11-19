/**
 * Round-2 payroll and reward features: PAY-11 payroll query, PAY-13 on-demand pay, PAY-07 trial payroll with re-run,
 * PAY-15 independent verification (four eyes), R02-05 multi-rate overtime, R02-13 bonus pool, CMP-02 compensation cycle
 * worksheet with the budget rule, CMP-03 approved proposals → draft Salary Structure Assignments, CMP-05 compa-ratio.
 * Reads go through the HR scoped readers; writes through ../write.ts (permission + Before Save rules). Nothing posts.
 */
import { adapter, type Doc } from "@/lib/adapter";
import { currentUser } from "@/lib/session";
import { scopedList, assertScoped } from "../../compat/scope";
import { policyValue } from "../../product/settings";
import { assignmentOf, monthEndOf, wageOf } from "../../product/payroll";
import { slipFor } from "../../product/payrollActions";
import { createDoc, updateDoc, guarded, ok, fail, s, n, d10, todayISO, nowISO, type ActionResult } from "../write";

const r2 = (x: number) => Math.round(x * 100) / 100;
const list = (dt: string, user = currentUser()): Doc[] => { try { return scopedList(dt, user); } catch { return []; } };

/* ------------------------------------------------------------------ PAY-11 payroll query */
export interface PayQuery { company?: string | undefined; from?: string | undefined; to?: string | undefined; department?: string | undefined; employee?: string | undefined; components?: string[] | undefined; groupBy?: "employee" | "department" | "month" | "designation" | undefined; includeDrafts?: boolean | undefined }
export interface QueryResult { columns: { key: string; label: [string, string]; numeric?: boolean }[]; rows: Record<string, unknown>[]; totals: Record<string, number>; slips: string[] }
const lines = (d: Doc, k: "earnings" | "deductions") => (Array.isArray(d[k]) ? (d[k] as Doc[]) : []);
/** Salary slips in the user's scope, one row per group, a column per salary component, gross / deductions / net, and totals. */
export function payrollQuery(q: PayQuery, user = currentUser()): QueryResult {
  const slips = list("Salary Slip", user).filter((d) => (q.includeDrafts ? Number(d.docstatus) !== 2 : Number(d.docstatus) === 1)
    && (!q.company || d["company"] === q.company) && (!q.department || d["department"] === q.department) && (!q.employee || d["employee"] === q.employee)
    && (!q.from || d10(d["start_date"]) >= q.from) && (!q.to || d10(d["end_date"] || d["start_date"]) <= q.to));
  const comps = q.components?.length ? q.components : [...new Set(slips.flatMap((d) => [...lines(d, "earnings"), ...lines(d, "deductions")].map((l) => s(l["salary_component"]))))].filter(Boolean).sort();
  const g = q.groupBy ?? "employee";
  const keyOf = (d: Doc) => (g === "employee" ? s(d["employee"]) : g === "department" ? s(d["department"]) || "—" : g === "designation" ? s(d["designation"]) || "—" : d10(d["start_date"]).slice(0, 7));
  const map = new Map<string, Record<string, unknown>>();
  for (const d of slips) {
    const k = keyOf(d); const row = map.get(k) ?? { key: k, label: g === "employee" ? s(d["employee_name"]) || k : k, slips: 0, gross: 0, deductions: 0, net: 0 };
    row["slips"] = n(row["slips"]) + 1; row["gross"] = r2(n(row["gross"]) + n(d["gross_pay"])); row["deductions"] = r2(n(row["deductions"]) + n(d["total_deduction"])); row["net"] = r2(n(row["net"]) + n(d["net_pay"]));
    for (const l of [...lines(d, "earnings"), ...lines(d, "deductions")]) { const c = s(l["salary_component"]); if (comps.includes(c)) row[c] = r2(n(row[c]) + n(l["amount"])); }
    map.set(k, row);
  }
  const rows = [...map.values()].sort((a, b) => s(a["label"]).localeCompare(s(b["label"])));
  const numKeys = ["slips", ...comps, "gross", "deductions", "net"];
  const totals = Object.fromEntries(numKeys.map((k) => [k, r2(rows.reduce((a, r) => a + n(r[k]), 0))]));
  const head: [string, string] = g === "employee" ? ["Employee", "الموظف"] : g === "department" ? ["Department", "الإدارة"] : g === "designation" ? ["Designation", "المسمى الوظيفي"] : ["Month", "الشهر"];
  return { columns: [{ key: "label", label: head }, { key: "slips", label: ["Slips", "القسائم"], numeric: true }, ...comps.map((c) => ({ key: c, label: [c, c] as [string, string], numeric: true })), { key: "gross", label: ["Gross", "الإجمالي"], numeric: true }, { key: "deductions", label: ["Deductions", "الاستقطاعات"], numeric: true }, { key: "net", label: ["Net", "الصافي"], numeric: true }], rows, totals, slips: slips.map((d) => d.name) };
}
/** Save a query as a DIGIT Saved HR Query (shared per the chosen audience). */
export function saveQuery(name: string, source: string, q: unknown, user = currentUser(), shared: "Only Me" | "My Role" | "Everyone" = "Only Me"): ActionResult {
  return guarded(() => { const d = createDoc("DIGIT Saved HR Query", { query_name: name, source_doctype: source, filters: JSON.stringify(q), columns: JSON.stringify((q as { components?: string[] }).components ?? []), group_by: s((q as { groupBy?: string }).groupBy), as_of: todayISO(), shared_with: shared }, user); return ok("Query saved.", "حُفظ الاستعلام.", { created: [["DIGIT Saved HR Query", d.name]] }); });
}
export function toCsv(r: { columns: { key: string; label: [string, string] }[]; rows: Record<string, unknown>[]; totals?: Record<string, number> }, ar = false): string {
  const esc = (v: unknown) => { const t = s(v); return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
  const head = r.columns.map((c) => esc(ar ? c.label[1] : c.label[0])).join(",");
  const body = r.rows.map((row) => r.columns.map((c) => esc(row[c.key])).join(","));
  const tot = r.totals ? [r.columns.map((c, i) => (i === 0 ? (ar ? "الإجمالي" : "Total") : r.totals![c.key] ?? "")).map(esc).join(",")] : [];
  return [head, ...body, ...tot].join("\n");
}

/* ------------------------------------------------------------------ PAY-13 on-demand pay */
export function earnedWage(employee: string, on = todayISO()) {
  const emp = adapter.get("Employee", employee); const co = s(emp?.["company"]);
  const enabled = (policyValue("earned_wage_enabled", on, co) ?? 1) > 0; const pct = policyValue("earned_wage_pct", on, co) ?? 50;
  const monthly = wageOf(employee, on).wage || n(assignmentOf(employee, on)?.["base"]);
  const dim = Number(monthEndOf(on.slice(0, 7)).slice(8, 10)); const day = Number(on.slice(8, 10));
  const earned = r2(monthly * Math.min(day, dim) / dim);
  const taken = r2(adapter.list("DIGIT Earned Wage Request").filter((d) => d["employee"] === employee && d10(d["request_date"]).slice(0, 7) === on.slice(0, 7) && s(d["approval_status"]) !== "Rejected").reduce((a, d) => a + n(d["amount"]), 0));
  const limit = Math.max(0, r2(earned * pct / 100 - taken));
  return { monthly, earned, taken, pct, limit, enabled };
}
export function requestEarnedWage(employee: string, amount: number, user = currentUser(), on = todayISO()): ActionResult {
  return guarded(() => {
    const w = earnedWage(employee, on); const emp = adapter.get("Employee", employee);
    if (!w.enabled) return fail("On-demand pay is switched off for this company.", "الأجر عند الطلب متوقف لهذه الشركة.");
    if (!emp) return fail("Employee not found.", "الموظف غير موجود.");
    const d = createDoc("DIGIT Earned Wage Request", { employee, employee_name: emp["employee_name"], company: emp["company"], request_date: on, amount, earned_to_date: w.earned, limit_amount: w.limit, approval_status: "Pending Approval" }, user);
    return ok(`Request for ${amount} sent for approval.`, `أُرسل طلب ${amount} للاعتماد.`, { created: [["DIGIT Earned Wage Request", d.name]] });
  });
}

/* ------------------------------------------------------------------ PAY-07 trial payroll + re-run */
function trialLine(company: string, ym: string, e: Doc) {
  const pe = { name: "TRIAL", doctype: "Payroll Entry", company, start_date: `${ym}-01`, end_date: monthEndOf(ym), posting_date: monthEndOf(ym) } as Doc;
  const r = slipFor(pe, e);
  const prev = adapter.list("Salary Slip").filter((d) => d["employee"] === e.name && Number(d.docstatus) === 1 && d10(d["start_date"]).slice(0, 7) < ym).sort((a, b) => d10(b["start_date"]).localeCompare(d10(a["start_date"])))[0];
  const gross = n(r.doc?.["gross_pay"]), net = n(r.doc?.["net_pay"]), pnet = n(prev?.["net_pay"]);
  return { employee: e.name, employee_name: e["employee_name"], gross: r2(gross), net: r2(net), previous_net: r2(pnet), change_pct: pnet ? r2((net - pnet) / pnet * 100) : 0, issue: r.errors.join("; ") };
}
/** Compute every active employee's slip for the month without writing slips, journals or ledgers. */
export function trialRun(company: string, ym: string, user = currentUser()): ActionResult {
  return guarded(() => {
    assertScoped("DIGIT Payroll Trial Run", "create", undefined, user);
    const emps = list("Employee", user).filter((e) => e["company"] === company && s(e["status"] || "Active") === "Active");
    const lim = policyValue("payroll_variance_pct", monthEndOf(ym), company) ?? 10;
    const rows = emps.map((e) => trialLine(company, ym, e));
    const lines2 = rows.map((r, i) => ({ idx: i + 1, ...r, issue: r.issue || (Math.abs(r.change_pct) >= lim && r.previous_net ? `Net change ${r.change_pct}%` : "") }));
    const errors = lines2.filter((l) => /structure|not found/.test(l.issue)).length; const warnings = lines2.filter((l) => l.issue && !/structure|not found/.test(l.issue)).length;
    const d = createDoc("DIGIT Payroll Trial Run", { company, period_month: `${ym}-01`, run_on: nowISO(), employees: rows.length, total_net: r2(rows.reduce((a, r) => a + r.net, 0)), errors, warnings, lines: lines2 }, user);
    return ok(`Trial run of ${rows.length} employees: ${errors} errors, ${warnings} warnings. Nothing was posted.`, `تشغيل تجريبي لـ ${rows.length} موظف: ${errors} أخطاء و${warnings} تنبيهات. لم يُرحّل شيء.`, { created: [["DIGIT Payroll Trial Run", d.name]] });
  });
}
/** Re-run only the chosen employees of a trial (after fixing their data); the other lines stay as they were. */
export function rerunTrial(name: string, employees: string[], user = currentUser()): ActionResult {
  return guarded(() => {
    const t = adapter.get("DIGIT Payroll Trial Run", name); if (!t) return fail("Trial run not found.", "التشغيل التجريبي غير موجود.");
    const ym = d10(t["period_month"]).slice(0, 7); const co = s(t["company"]);
    const next = (Array.isArray(t["lines"]) ? (t["lines"] as Doc[]) : []).map((l) => { if (!employees.includes(s(l["employee"]))) return l; const e = adapter.get("Employee", s(l["employee"])); return e ? { ...l, ...trialLine(co, ym, e), rerun: 1 } : l; });
    updateDoc("DIGIT Payroll Trial Run", name, { lines: next, total_net: r2(next.reduce((a, l) => a + n(l["net"]), 0)), errors: next.filter((l) => /structure|not found/.test(s(l["issue"]))).length, run_on: nowISO() }, user);
    return ok(`${employees.length} employees re-run.`, `أعيد تشغيل ${employees.length} موظف.`);
  });
}

/* ------------------------------------------------------------------ PAY-15 four eyes */
const preflightOf = (pe: string) => adapter.list("DIGIT Payroll Preflight").filter((d) => d["payroll_entry"] === pe).sort((a, b) => s(b.modified).localeCompare(s(a.modified)))[0];
/** Record an independent verification: the verifier must not be the person who prepared the payroll run. */
export function verifyPayroll(peName: string, note: string, user = currentUser()): ActionResult {
  return guarded(() => {
    const pe = adapter.get("Payroll Entry", peName); if (!pe) return fail("Payroll run not found.", "المسير غير موجود.");
    const pf = preflightOf(peName); if (!pf) return fail("Run the preflight first.", "شغّل الفحص المسبق أولًا.");
    const preparer = s(pe["digit_prepared_by"]) || s(pe["owner"]);
    if (preparer && preparer === user) return fail("The person who prepared the payroll cannot verify it.", "لا يمكن لمن أعد المسير أن يتحقق منه.", ["verified_by = Payroll Entry owner"]);
    updateDoc("DIGIT Payroll Preflight", pf.name, { verified_by: user, verified_on: nowISO(), verification_note: note }, user, { skipPerm: true });
    return ok("Verification recorded.", "سُجل التحقق.", { created: [["DIGIT Payroll Preflight", pf.name]] });
  });
}
/** Errors that stop posting while four eyes are required (Administrator is the platform account and is exempt). */
export function fourEyesErrors(pe: Doc, user = currentUser()): string[] {
  if (user === "Administrator") return [];
  if ((policyValue("payroll_four_eyes", d10(pe["end_date"]) || todayISO(), s(pe["company"])) ?? 1) <= 0) return [];
  const pf = preflightOf(pe.name); const by = s(pf?.["verified_by"]); const preparer = s(pe["digit_prepared_by"]) || s(pe["owner"]);
  if (!by) return ["An independent verification is required before posting."];
  if (by === preparer) return ["The verifier must be a different person than the preparer."];
  return [];
}

/* ------------------------------------------------------------------ R02-05 multi-rate overtime */
export type OtKind = "weekday" | "rest_day" | "holiday";
export function overtimePay(employee: string, hours: number, kind: OtKind, on = todayISO()) {
  const co = s(adapter.get("Employee", employee)?.["company"]);
  const wage = wageOf(employee, on).wage; const hpd = policyValue("work_hours_day", on, co) ?? 8;
  const rate = policyValue(kind === "weekday" ? "overtime_rate_pct" : kind === "rest_day" ? "rest_day_ot_rate_pct" : "holiday_ot_rate_pct", on, co) ?? 150;
  const hourly = wage / 30 / hpd;
  return { hourly: r2(hourly), rate, amount: r2(hourly * hours * rate / 100) };
}
export function recordOvertime(employee: string, hours: number, kind: OtKind, payrollDate: string, user = currentUser()): ActionResult {
  return guarded(() => {
    const p = overtimePay(employee, hours, kind, payrollDate); const e = adapter.get("Employee", employee);
    if (!e) return fail("Employee not found.", "الموظف غير موجود.");
    if (p.amount <= 0) return fail("No wage found for the employee.", "لا يوجد أجر للموظف.");
    const d = createDoc("Additional Salary", { employee, employee_name: e["employee_name"], company: e["company"], salary_component: "Overtime", amount: p.amount, payroll_date: payrollDate, overwrite_salary_structure_amount: 0, docstatus: 0, __ot: `${hours}h ${kind} @${p.rate}%` }, user);
    return ok(`Overtime ${hours} h at ${p.rate}% = ${p.amount} (draft additional salary).`, `عمل إضافي ${hours} ساعة بنسبة ${p.rate}% = ${p.amount} (راتب إضافي كمسودة).`, { created: [["Additional Salary", d.name]] });
  });
}

/* ------------------------------------------------------------------ R02-13 bonus pool */
export function distributePool(name: string, user = currentUser()): ActionResult {
  return guarded(() => {
    const p = adapter.get("DIGIT Bonus Pool Distribution", name); if (!p) return fail("Pool not found.", "المجمع غير موجود.");
    const shares = Array.isArray(p["shares"]) ? (p["shares"] as Doc[]) : []; if (!shares.length) return fail("Add the employees first.", "أضف الموظفين أولًا.");
    const on = d10(p["payroll_date"]) || todayISO();
    const w = shares.map((r) => { const e = s(r["employee"]); const base = s(p["basis"]) === "By Base Salary" ? wageOf(e, on).wage : 1; const rating = s(p["basis"]) === "By Rating" ? (n(adapter.list("Appraisal").filter((a) => a["employee"] === e).sort((a, b) => s(b.modified).localeCompare(s(a.modified)))[0]?.["final_score"]) || 1) : 1; return n(r["weight"]) || base * rating; });
    const total = w.reduce((a, x) => a + x, 0) || 1; const pool = n(p["pool_amount"]);
    const amounts = w.map((x) => r2(pool * x / total)); const diff = r2(pool - amounts.reduce((a, x) => a + x, 0)); if (amounts.length) amounts[0] = r2(amounts[0]! + diff);
    const approved = s(p["approval_status"]) === "Approved";
    const created: [string, string][] = [];
    const next = shares.map((r, i) => {
      if (!approved || r["additional_salary"]) return { ...r, weight: w[i], amount: amounts[i] };
      const e = adapter.get("Employee", s(r["employee"]));
      const as = createDoc("Additional Salary", { employee: r["employee"], employee_name: e?.["employee_name"], company: p["company"], salary_component: "Performance Bonus", amount: amounts[i], payroll_date: on, docstatus: 0 }, user);
      created.push(["Additional Salary", as.name]); return { ...r, weight: w[i], amount: amounts[i], additional_salary: as.name };
    });
    adapter.update("DIGIT Bonus Pool Distribution", name, { shares: next });
    return ok(approved ? `${created.length} bonus lines created as drafts (total ${pool}).` : `Shares calculated (total ${pool}); approve the pool to create the bonus lines.`, approved ? `أنشئ ${created.length} بند مكافأة كمسودات (الإجمالي ${pool}).` : `حُسبت الحصص (الإجمالي ${pool})؛ اعتمد المجمع لإنشاء بنود المكافأة.`, { created });
  });
}

/* ------------------------------------------------------------------ CMP-02 / CMP-03 / CMP-05 */
export function cycleBudget(cycle: string) {
  const c = adapter.get("DIGIT Compensation Review Cycle", cycle);
  const props = adapter.list("DIGIT Salary Change Proposal").filter((d) => d["cycle"] === cycle && s(d["status"]) !== "Rejected");
  const used = r2(props.reduce((a, d) => a + (n(d["proposed_base"]) - n(d["current_base"])) * 12, 0));
  const budget = n(c?.["budget_amount"]);
  return { budget, used, remaining: r2(budget - used), proposals: props.length };
}
/** Manager worksheet: the manager's team (or every employee of the company for HR), current base and proposal. */
export function worksheet(cycle: string, managerEmployee?: string, user = currentUser()) {
  const c = adapter.get("DIGIT Compensation Review Cycle", cycle); if (!c) return [];
  const on = d10(c["effective_date"]) || todayISO();
  const team = list("Employee", user).filter((e) => e["company"] === c["company"] && s(e["status"] || "Active") === "Active" && (!managerEmployee || e["reports_to"] === managerEmployee));
  const props = adapter.list("DIGIT Salary Change Proposal").filter((d) => d["cycle"] === cycle);
  return team.map((e) => { const p = props.find((x) => x["employee"] === e.name); const base = n(assignmentOf(e.name, on)?.["base"]); return { employee: e.name, employee_name: s(e["employee_name"]), current_base: base, proposal: p?.name ?? "", proposed_pct: n(p?.["proposed_increase_pct"]), proposed_base: n(p?.["proposed_base"]), status: s(p?.["status"]) }; });
}
export function proposeIncrease(cycle: string, employee: string, pct: number, user = currentUser()): ActionResult {
  return guarded(() => {
    const c = adapter.get("DIGIT Compensation Review Cycle", cycle); if (!c) return fail("Cycle not found.", "الدورة غير موجودة.");
    const on = d10(c["effective_date"]) || todayISO(); const base = n(assignmentOf(employee, on)?.["base"]); const e = adapter.get("Employee", employee);
    const proposed = r2(base * (1 + pct / 100));
    const prev = adapter.list("DIGIT Salary Change Proposal").find((d) => d["cycle"] === cycle && d["employee"] === employee);
    const vals = { cycle, employee, employee_name: e?.["employee_name"], company: c["company"], manager: e?.["reports_to"], current_base: base, proposed_increase_pct: pct, proposed_base: proposed, status: "Submitted" };
    const d = prev ? updateDoc("DIGIT Salary Change Proposal", prev.name, vals, user) : createDoc("DIGIT Salary Change Proposal", vals, user);
    const b = cycleBudget(cycle);
    return ok(`Proposal saved; ${b.remaining} of the budget remains.`, `حُفظ المقترح؛ المتبقي من الميزانية ${b.remaining}.`, { created: [["DIGIT Salary Change Proposal", d.name]], data: b });
  });
}
/** CMP-03: every approved proposal becomes one draft Salary Structure Assignment from the cycle's effective date. */
export function applyApproved(cycle: string, user = currentUser()): ActionResult {
  return guarded(() => {
    const c = adapter.get("DIGIT Compensation Review Cycle", cycle); if (!c) return fail("Cycle not found.", "الدورة غير موجودة.");
    const on = d10(c["effective_date"]) || todayISO(); const created: [string, string][] = [];
    adapter.batch(() => { for (const p of adapter.list("DIGIT Salary Change Proposal").filter((d) => d["cycle"] === cycle && s(d["status"]) === "Approved" && !d["salary_structure_assignment"])) {
      const cur = assignmentOf(s(p["employee"]), on);
      const ssa = createDoc("Salary Structure Assignment", { employee: p["employee"], employee_name: p["employee_name"], company: c["company"], salary_structure: cur?.["salary_structure"], from_date: on, base: p["proposed_base"], currency: "SAR", docstatus: 0 }, user);
      adapter.update("DIGIT Salary Change Proposal", p.name, { status: "Applied", salary_structure_assignment: ssa.name }); created.push(["Salary Structure Assignment", ssa.name]);
    } });
    return ok(`${created.length} draft salary structure assignments created; HR submits them.`, `أنشئ ${created.length} تعيين هيكل راتب كمسودة؛ تعتمدها الموارد البشرية.`, { created });
  });
}
export function compaRatio(employee: string, on = todayISO()) {
  const e = adapter.get("Employee", employee); const base = n(assignmentOf(employee, on)?.["base"]);
  const band = adapter.list("DIGIT Compensation Band").find((b) => (e?.["grade"] && b["grade"] === e["grade"]) || (b["job_profile"] && b["job_profile"] === e?.["digit_job_profile"]));
  const mid = n(band?.["midpoint"]); const ratio = mid ? r2(base / mid * 100) : null;
  const alert = policyValue("compa_ratio_alert_pct", on, s(e?.["company"])) ?? 120;
  return { base, band: band?.name ?? "", min: n(band?.["minimum"]), mid, max: n(band?.["maximum"]), market: n(band?.["market_median"]), ratio, flag: ratio !== null && ratio > alert, alert };
}
