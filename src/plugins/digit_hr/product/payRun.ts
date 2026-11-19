/**
 * Payroll run views (owner round H3, 2026-11-17; rule: money moves only through Payroll Entry, Payment Entry and
 * Journal Entry). The 12-month run strip (posted = submitted with its accrual journal), the pay-run summary (structure
 * earnings, other earnings, gross, paid, remaining — and every slip row with an edited value above the struck-through
 * default), the review figures (employer cost, net, liabilities, files) and the net-pay bridge in five buckets
 * (headcount, increments, overtime, deductions, other). Read models only; the decisions run payrollActions.
 */
import type { Doc } from "@/lib/adapter";
import { canReadType, scopedList } from "../compat/scope";
import { accrualOf, BASIC, gosiShares, HOUSING, identityIndex, paymentOf, prevMonth, slipsOf, varianceBridge } from "./payroll";

const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));
const n = (v: unknown) => Number(v) || 0;
const d10 = (v: unknown) => s(v).slice(0, 10);
const r2 = (x: number) => Math.round(x * 100) / 100;
const rowsOf = (dt: string) => { try { return canReadType(dt) ? scopedList(dt) : null; } catch { return null; } };
export const ymOf = (pe: Doc) => d10(pe["start_date"]).slice(0, 7);
/** The twelve months ending with the month of `on`, oldest first ("2025-12" … "2026-11"). */
export function last12(on: string): string[] { const y = Number(on.slice(0, 4)), m = Number(on.slice(5, 7)); return Array.from({ length: 12 }, (_, i) => { const d = new Date(Date.UTC(y, m - 12 + i, 1)); return d.toISOString().slice(0, 7); }); }

/* ------------------------------------------------------------------ 12-month run strip (H3-01) ------------------------------------------------------------------ */
export type RunState = "posted" | "submitted" | "draft" | "none";
export interface RunCell { ym: string; state: RunState; run?: string | undefined; net: number; journal?: string | undefined }
/** Per company, the state of each month's payroll run: posted (submitted + accrual journal), submitted, draft or none. */
export function runStrip(on: string, company?: string): { months: string[]; rows: { company: string; cells: RunCell[] }[] } | null {
  const pes = rowsOf("Payroll Entry"); if (!pes) return null;
  const months = last12(on);
  const cos = [...new Set(pes.map((p) => s(p["company"])).filter(Boolean))].filter((c) => !company || c === company).sort();
  const slips = rowsOf("Salary Slip") ?? [];
  return { months, rows: cos.map((co) => ({ company: co, cells: months.map((ym): RunCell => {
    const runs = pes.filter((p) => p["company"] === co && ymOf(p) === ym && Number(p.docstatus) !== 2);
    const sub = runs.filter((p) => Number(p.docstatus) === 1); const posted = sub.find((p) => !!accrualOf(p));
    const pick = posted ?? sub[0] ?? runs[0];
    const net = r2(slips.filter((x) => runs.some((p) => p.name === x["payroll_entry"]) && Number(x.docstatus) !== 2).reduce((a, x) => a + n(x["net_pay"]), 0));
    return { ym, state: posted ? "posted" : sub.length ? "submitted" : runs.length ? "draft" : "none", run: pick?.name, net, journal: posted ? accrualOf(posted)?.name : undefined };
  }) })) };
}

/* ------------------------------------------------------------------ pay-run summary (H3-02 / H3-06) ------------------------------------------------------------------ */
export interface SlipLine { slip: string; employee: string; name: string; dept: string; structure: number; other: number; gross: number; deductions: number; net: number; defaultGross: number; edited: { component: string; amount: number; default: number }[]; paymentDays: number; workingDays: number }
export interface RunSummary { run: Doc; slips: SlipLine[]; structure: number; other: number; gross: number; deductions: number; net: number; paid: number; remaining: number; payment?: string | undefined }
const isOther = (r: Doc) => !!s(r["additional_salary"]) || /overtime|bonus|إضافي|مكافأة|commission|incentive|arrear/i.test(s(r["salary_component"]));
/** The five figures of a run from its own salary slips: structure earnings + other earnings = gross; gross − deductions = net;
 *  paid = net when the bank transfer journal exists; remaining = net − paid. Every slip row is listed with its edited components. */
export function runSummary(pe: Doc): RunSummary {
  const ss = canReadType("Salary Slip") ? slipsOf(pe.name).filter((d) => { try { return scopedList("Salary Slip").some((x) => x.name === d.name); } catch { return false; } }) : [];
  const lines: SlipLine[] = ss.map((d) => {
    const earn = ((d["earnings"] as Doc[] | undefined) ?? []); const ded = ((d["deductions"] as Doc[] | undefined) ?? []);
    const other = r2(earn.filter(isOther).reduce((a, r) => a + n(r["amount"]), 0)); const gross = r2(n(d["gross_pay"]) || earn.reduce((a, r) => a + n(r["amount"]), 0));
    const edited = earn.filter((r) => r["default_amount"] !== undefined && r["default_amount"] !== null && Math.abs(n(r["default_amount"]) - n(r["amount"])) >= 0.01).map((r) => ({ component: s(r["salary_component"]), amount: r2(n(r["amount"])), default: r2(n(r["default_amount"])) }));
    const defaultGross = r2(earn.reduce((a, r) => a + (r["default_amount"] !== undefined && r["default_amount"] !== null ? n(r["default_amount"]) : n(r["amount"])), 0));
    const deductions = r2(n(d["total_deduction"]) || ded.reduce((a, r) => a + n(r["amount"]), 0));
    return { slip: d.name, employee: s(d["employee"]), name: s(d["employee_name"]) || s(d["employee"]), dept: s(d["department"]), structure: r2(gross - other), other, gross, deductions, net: r2(n(d["net_pay"]) || gross - deductions), defaultGross, edited, paymentDays: n(d["payment_days"]), workingDays: n(d["total_working_days"]) };
  });
  const sum = (k: keyof Pick<SlipLine, "structure" | "other" | "gross" | "deductions" | "net">) => r2(lines.reduce((a, l) => a + l[k], 0));
  const pay = paymentOf(pe); const net = sum("net"); const paid = pay ? net : 0;
  return { run: pe, slips: lines.sort((a, b) => Number(b.edited.length > 0) - Number(a.edited.length > 0) || a.dept.localeCompare(b.dept) || a.name.localeCompare(b.name)), structure: sum("structure"), other: sum("other"), gross: sum("gross"), deductions: sum("deductions"), net, paid, remaining: r2(net - paid), ...(pay ? { payment: pay.name } : {}) };
}

/* ------------------------------------------------------------------ review figures (H3-03) ------------------------------------------------------------------ */
export interface RunReview { employerCost: number; employerGosi: number; employeeGosi: number; net: number; otherDeductions: number; liabilities: { key: string; en: string; ar: string; value: number }[]; missingNationality: number }
/** Employer cost = gross + the employer's GOSI share; liabilities = net salaries payable, GOSI (both shares) and the other deductions held. */
export function runReview(pe: Doc, sum = runSummary(pe)): RunReview {
  const emps = new Map((rowsOf("Employee") ?? []).map((e) => [e.name, e])); const docs = canReadType("DIGIT Document Renewal") ? identityIndex() : new Map<string, string>();
  let er = 0, ee = 0, miss = 0; const on = d10(pe["end_date"]);
  const slips = new Map((rowsOf("Salary Slip") ?? []).map((d) => [d.name, d]));
  for (const l of sum.slips) {
    const e = emps.get(l.employee); const d = slips.get(l.slip); if (!e || !d) continue;
    const earn = (d["earnings"] as Doc[] | undefined) ?? [];
    const bh = earn.filter((r) => BASIC.test(s(r["salary_component"])) || BASIC.test(s(r["abbr"])) || HOUSING.test(s(r["salary_component"])) || HOUSING.test(s(r["abbr"]))).reduce((a, r) => a + n(r["amount"]), 0);
    const g = gosiShares(e, bh, on, docs); if (!g) { miss++; continue; } er += g.employer;
    ee += ((d["deductions"] as Doc[] | undefined) ?? []).filter((r) => /gosi|تأمينات/i.test(s(r["salary_component"]))).reduce((a, r) => a + n(r["amount"]), 0);
  }
  er = r2(er); ee = r2(ee); const other = r2(sum.deductions - ee);
  return { employerCost: r2(sum.gross + er), employerGosi: er, employeeGosi: ee, net: sum.net, otherDeductions: other, missingNationality: miss,
    liabilities: [{ key: "net", en: "Net salaries payable", ar: "صافي الرواتب المستحقة", value: sum.remaining }, { key: "gosi", en: "GOSI payable (employee + employer)", ar: "التأمينات المستحقة (الموظف + صاحب العمل)", value: r2(ee + er) }, { key: "other", en: "Other deductions held (loans, advances)", ar: "استقطاعات أخرى محتجزة (قروض وسلف)", value: other }] };
}

/* ------------------------------------------------------------------ net-pay bridge (H3-05) ------------------------------------------------------------------ */
export interface BridgeBucket { key: "headcount" | "increments" | "overtime" | "deductions" | "other"; en: string; ar: string; value: number; slips: string[] }
const OT = /overtime|إضافي/i;
/** Last month's net → this month's in the owner's order: headcount (joiners − leavers), increments (structure earnings of
 *  stayers), overtime, deductions, and «other» (bonuses and other additions) only when it is not zero. Sums close exactly. */
export function netPayBridge(company: string, ym: string): { start: number; end: number; prevYm: string; buckets: BridgeBucket[] } {
  const b = varianceBridge(company, ym);
  const acc: Record<BridgeBucket["key"], { v: number; names: Set<string> }> = { headcount: { v: 0, names: new Set() }, increments: { v: 0, names: new Set() }, overtime: { v: 0, names: new Set() }, deductions: { v: 0, names: new Set() }, other: { v: 0, names: new Set() } };
  for (const st of b.steps) {
    const k: BridgeBucket["key"] = st.key === "joiners" || st.key === "leavers" ? "headcount" : st.key.startsWith("− ") ? "deductions" : OT.test(st.key) ? "overtime" : /^(Basic Salary|Housing Allowance|Transport Allowance|.*Allowance)$/i.test(st.key) ? "increments" : "other";
    acc[k].v += st.value; for (const x of st.names) acc[k].names.add(x);
  }
  // rounding of the sum of the steps lands in «other» so the bridge closes on the month's net exactly
  const sumSteps = Object.values(acc).reduce((a, x) => a + x.v, 0); const gap = r2(b.end - b.start - sumSteps); if (Math.abs(gap) >= 0.01) acc.other.v += gap;
  const label: Record<BridgeBucket["key"], [string, string]> = { headcount: ["Headcount", "عدد الموظفين"], increments: ["Increments", "الزيادات"], overtime: ["Overtime", "العمل الإضافي"], deductions: ["Deductions", "الاستقطاعات"], other: ["Other", "أخرى"] };
  const buckets = (Object.keys(acc) as BridgeBucket["key"][]).map((k) => ({ key: k, en: label[k][0], ar: label[k][1], value: r2(acc[k].v), slips: [...acc[k].names] })).filter((x) => x.key !== "other" || Math.abs(x.value) >= 0.01);
  return { start: b.start, end: b.end, prevYm: prevMonth(ym), buckets };
}
