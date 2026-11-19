/**
 * Round-2 sample records for the new DIGIT documents, added to the HR sample layer after product/demo.ts (memory-only,
 * insert-if-missing, explicit names, dates relative to the visit): site worker assignments of the contracting crews on
 * their company's projects with labour budgets per project, certifications (some expired / expiring), recognition,
 * job postings per channel, a benefits plan set with an open enrolment window and elections, pending workers from
 * accepted offers, on-demand pay requests and access provisioning. Every figure on a round-2 screen comes from these
 * records or the round-1 sample, never from a constant on the screen.
 */
import { adapter, type Doc } from "@/lib/adapter";
import type { VolumeContext } from "@/lib/volume";

const s = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v));
const pad = (k: number, w = 3) => String(k).padStart(w, "0");
const addDays = (iso: string, k: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + k * 86400000).toISOString().slice(0, 10);
const TAG = { __demo: 1, __plugin: "digit_hr" } as const;

export function hrRound2Volume(ctx: VolumeContext): void {
  const T = new Date().toISOString().slice(0, 10); const day = (k: number) => addDays(T, k); const Y = T.slice(0, 4);
  const companies = adapter.list("Company"); const C1 = companies.find((c) => s(c["abbr"]) === "DDT")?.name; const C2 = companies.find((c) => s(c["abbr"]) === "DCC")?.name;
  if (!C1) return;
  const put = (dt: string, name: string, data: Record<string, unknown>) => ctx.put(dt, name, { ...data, ...TAG });
  const active = (co?: string) => adapter.list("Employee").filter((e) => s(e["status"]) === "Active" && (!co || e["company"] === co)).sort((a, b) => a.name.localeCompare(b.name));
  const e1 = active(C1), e2 = C2 ? active(C2) : [];

  /* INT-10 / INT-15: crews on projects, labour budgets per project */
  const projects = adapter.list("Project").filter((p) => C2 && p["company"] === C2 && !["Cancelled", "Completed"].includes(s(p["status"]))).slice(0, 6);
  const roles: [string, string][] = [["Foreman", "مراقب عمال"], ["Mason", "بنّاء"], ["Steel fixer", "حداد مسلح"], ["Electrician", "كهربائي"], ["Labourer", "عامل"], ["Safety officer", "مسؤول سلامة"]];
  if (projects.length) e2.forEach((e, i) => { const p = projects[i % projects.length]!; const ended = i % 11 === 0; const r = roles[i % roles.length]!;
    put("DIGIT Site Worker Assignment", `HRD-SWA-${pad(i + 1)}`, { employee: e.name, employee_name: e["employee_name"], company: C2, project: p.name, branch: e["branch"] ?? "", from_date: day(-300 + (i % 60)), to_date: ended ? day(-20 - (i % 30)) : "", role_on_site: r[0], status: ended ? "Ended" : "Active", docstatus: 0 }); });
  projects.forEach((p, i) => { const crew = e2.filter((_, k) => k % projects.length === i).length; const monthly = crew * 6500;
    put("DIGIT Labor Cost Budget", `HRD-LCB-${pad(i + 1)}`, { title: `${s(p["project_name"]) || p.name} — labour ${Y}`, company: C2, fiscal_year: Number(Y), project: p.name, total_budget: monthly * 12, approval_status: "Approved",
      lines: [["Basic Salary", "5101", 0.6], ["Housing Allowance", "5102", 0.25], ["Transport Allowance", "5103", 0.1], ["Other Allowance", "5109", 0.05]].map(([c, code, w], k) => ({ idx: k + 1, salary_component: c, cost_code: code, monthly_amount: Math.round(monthly * Number(w)), annual_amount: Math.round(monthly * Number(w)) * 12 })) }); });

  /* certifications (02.4 learning compliance) */
  const CERTS: [string, string][] = [["First Aid", "Saudi Red Crescent"], ["Site Safety Induction", "DIGIT Safety"], ["Forklift Operation", "TVTC"], ["Fire Warden", "Civil Defense"]];
  [...e1.slice(0, 40), ...e2.slice(0, 60)].forEach((e, i) => { const c = CERTS[i % CERTS.length]!; const exp = day(i % 9 === 0 ? -(10 + i) : i % 7 === 0 ? 20 + i : 200 + i * 3);
    put("DIGIT Certification", `HRD-CER-${pad(i + 1)}`, { employee: e.name, employee_name: e["employee_name"], company: e["company"], certification_name: c[0], issuer: c[1], issue_date: addDays(exp, -730), expiry_date: exp, status: exp < T ? "Expired" : exp <= day(60) ? "Expiring" : "Valid" }); });

  /* recognition feed (ENG-01) */
  const AW = ["Thank You", "Teamwork", "Safety Star", "Customer Hero", "Innovation"]; const MSG: [string, string][] = [["Thank you for covering the night shift.", "شكرًا لتغطيتك الوردية الليلية."], ["Great teamwork on the month-end close.", "عمل جماعي رائع في إقفال نهاية الشهر."], ["Zero incidents on site this quarter.", "صفر حوادث في الموقع هذا الربع."], ["The customer thanked you by name.", "شكرك العميل بالاسم."], ["Your idea cut the onboarding time.", "فكرتك اختصرت وقت التهيئة."]];
  for (let i = 0; i < 24; i++) { const pool = i % 3 === 2 && e2.length ? e2 : e1; const a = pool[(i * 7) % pool.length]!, b = pool[(i * 7 + 3) % pool.length]!; if (a.name === b.name) continue; const m = MSG[i % MSG.length]!;
    put("DIGIT Recognition Award", `HRD-REC-${pad(i + 1)}`, { from_employee: a.name, to_employee: b.name, award_type: AW[i % AW.length], posted_on: `${day(-(i * 3))} 10:${pad(i % 60, 2)}:00`, company: a["company"], message: m[0], likes: (i * 5) % 17, visibility: i % 4 === 3 ? "Department" : "Company" }); }

  /* job postings per channel (REC-05) */
  const openings = adapter.list("Job Opening").filter((o) => s(o["status"]) === "Open").slice(0, 8); const CH = ["LinkedIn", "Bayt", "Career Site", "Indeed", "Tanqeeb"];
  openings.forEach((o, i) => CH.slice(0, 2 + (i % 3)).forEach((c, k) => put("DIGIT Job Posting", `HRD-JPS-${pad(i + 1)}-${k}`, { job_opening: o.name, channel: c, posted_on: `${day(-(i * 4 + k))} 09:00:00`, status: (i + k) % 9 === 4 ? "Failed" : "Posted", external_url: `https://jobs.example.test/${encodeURIComponent(o.name)}/${c.toLowerCase().replace(/\s+/g, "-")}`, applicants_received: (i * 3 + k * 5) % 23 })));

  /* benefits: plans, an open window, elections (BEN-01..05) */
  const PLANS: [string, string, number, number, number][] = [["Medical — Class A", "Medical", 0, 350, 100], ["Medical — Class B", "Medical", 0, 220, 100], ["Life cover", "Life", 0, 0, 100], ["Dental", "Dental", 45, 30, 50], ["Transport card", "Transport", 0, 0, 100]];
  PLANS.forEach(([nm, ty, ep, dp, sh], i) => put("DIGIT Benefits Plan", `HRD-BPL-${i + 1}`, { plan_name: nm, plan_type: ty, provider: ty === "Medical" ? "Bupa Arabia" : ty === "Life" ? "Tawuniya" : "DIGIT", company: C1, employee_premium: ep, dependent_premium: dp, employer_share_pct: sh, coverage: ty === "Medical" ? "Inpatient, outpatient, maternity, chronic" : "", max_dependents: ty === "Medical" ? 4 : 0 }));
  put("DIGIT Benefits Enrollment Window", "HRD-BEW-1", { title: `Benefits enrolment ${Y}`, company: C1, opens_on: day(-10), closes_on: day(20), status: "Open" });
  e1.slice(0, 60).forEach((e, i) => { const plan = i % 4 === 0 ? "HRD-BPL-1" : "HRD-BPL-2"; const elected = i % 9 !== 5; const deps = elected ? i % 4 : 0;
    put("DIGIT Benefit Enrollment", `HRD-BEN-${pad(i + 1)}`, { employee: e.name, employee_name: e["employee_name"], company: C1, plan, window: "HRD-BEW-1", election: elected ? "Elected" : "Declined", dependents: deps ? `${deps} dependents` : "", employee_cost: 0, employer_cost: elected ? (plan === "HRD-BPL-1" ? 350 : 220) * (1 + deps) : 0, acknowledged: elected ? 1 : 0 }); });

  /* pending workers from accepted offers (HIR-02) */
  adapter.list("Job Offer").filter((o) => s(o["status"]) === "Accepted").slice(0, 6).forEach((o, i) => put("DIGIT Pending Worker", `HRD-PWK-${pad(i + 1)}`, { full_name: s(o["applicant_name"]) || o.name, company: s(o["company"]) || C1, job_offer: o.name, designation: o["designation"], expected_start: day(5 + i * 4), status: i % 3 === 0 ? "Ready" : "Pending" }));

  /* on-demand pay (PAY-13) and access provisioning (ONB-06) */
  e1.slice(5, 17).forEach((e, i) => put("DIGIT Earned Wage Request", `HRD-EWR-${pad(i + 1)}`, { employee: e.name, employee_name: e["employee_name"], company: C1, request_date: day(-(i % 12)), amount: 500 + (i % 5) * 250, earned_to_date: 4000 + i * 120, limit_amount: 2000 + i * 60, approval_status: i % 4 === 0 ? "Pending" : "Approved" }));
  const SYS = ["Email", "ERP", "VPN", "Badge", "Payroll Portal"];
  e1.slice(-8).forEach((e, i) => SYS.slice(0, 3 + (i % 3)).forEach((sy, k) => put("DIGIT Access Provision Request", `HRD-APR-${pad(i + 1)}-${k}`, { employee: e.name, employee_name: e["employee_name"], company: C1, action: "Grant", system: sy, scheduled_for: day(-(i + 1)), status: (i + k) % 7 === 3 ? "Failed" : "Done", source_doctype: "Employee Onboarding" })));
  adapter.list("Employee").filter((e) => s(e["status"]) === "Left" && s(e["company"]) === C1).slice(0, 4).forEach((e: Doc, i) => SYS.slice(0, 3).forEach((sy, k) => put("DIGIT Access Provision Request", `HRD-APX-${pad(i + 1)}-${k}`, { employee: e.name, employee_name: e["employee_name"], company: C1, action: "Revoke", system: sy, scheduled_for: s(e["relieving_date"]).slice(0, 10) || day(-30), status: "Done", source_doctype: "Employee Separation" })));
}
