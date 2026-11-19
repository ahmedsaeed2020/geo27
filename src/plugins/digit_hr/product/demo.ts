/**
 * DIGIT HR rich demo (owner brief 2026-11-15 §7, skill demo spec): two companies — the trading company (existing 90 +
 * 80 new employees in six new departments → 12 departments, 3 branches) and the contracting company (its 80 crew
 * employees) = 250 employees — with identity documents expiring at 30/60/90 days, contracts, positions, budgets and plans,
 * leave, attendance of the last 12 months and check-ins of the last 14 days, shifts and overtime, six monthly payroll runs per company posted to
 * the ledger by component, cost center and project (labour cost reaches Construction projects), WPS files, GOSI,
 * provisions and period locks, the current month's run in progress, recruitment and onboarding pipelines, performance,
 * learning, succession, movements and exits, service cases with SLA, approvals with delegation and integration logs.
 *
 * Memory-only through the shared sample layer (src/lib/volume registerVolumeProvider): insert-if-missing under explicit
 * names, never stored, dates relative to the visit, every submitted journal posted by posting.ts. Salary slips are built
 * by the same payroll engine as the payroll screen (payrollActions.slipFor), so the demo and a user run agree.
 */
import { ensureLeaveLedger } from "@/lib/departments";
import { adapter, type Doc } from "@/lib/adapter";
import type { VolumeContext } from "@/lib/volume";
import { fullAr, fullEn, person } from "@/lib/volume/names";
import { rng } from "@/lib/volume/kit";
import { accrualJournal, bankAccount, identityIndex, monthEndOf, payrollAccount, payrollJournal, prevMonth, slipsOf, varianceRows, wpsFile, gosiShares, BASIC, HOUSING, preflight, preflightBlocked, type JournalLine } from "./payroll";
import { slipFor } from "./payrollActions";
import { DHPS } from "./settings";

const s = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v));
const n = (v: unknown) => Number(v) || 0;
const r2 = (x: number) => Math.round(x * 100) / 100;
const pad = (k: number, w = 3) => String(k).padStart(w, "0");
const d10 = (v: unknown) => s(v).slice(0, 10);
const addDays = (iso: string, k: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + k * 86400000).toISOString().slice(0, 10);
const isWork = (iso: string) => { const w = new Date(`${iso}T00:00:00Z`).getUTCDay(); return w !== 5 && w !== 6; };
const monthsBack = (on: string, k: number) => { const y = Number(on.slice(0, 4)), m = Number(on.slice(5, 7)); return Array.from({ length: k }, (_, i) => new Date(Date.UTC(y, m - 1 - (k - i), 1)).toISOString().slice(0, 7)); };
const at = (iso: string, h = 9, m = 0) => `${iso} ${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`;
const TAG = { __demo: 1, __plugin: "digit_hr" } as const;

const NEW_DEPTS: [en: string, ar: string, mgr: string, staff: string][] = [
  ["Customer Service", "خدمة العملاء", "Customer Service Manager", "Customer Service Agent"], ["Logistics", "الخدمات اللوجستية", "Logistics Manager", "Logistics Coordinator"],
  ["Procurement", "المشتريات", "Procurement Manager", "Buyer"], ["Marketing", "التسويق", "Marketing Manager", "Marketing Specialist"],
  ["Legal", "الشؤون القانونية", "Legal Manager", "Legal Counsel"], ["Quality", "الجودة", "Quality Manager", "Quality Inspector"],
];
const NATIONS = ["Egypt", "India", "Pakistan", "Philippines", "Jordan", "Sudan", "Bangladesh"] as const;
const NON_AR: [string, string][] = [["Rajesh Kumar", "راجيش كومار"], ["Mohammed Imran", "محمد عمران"], ["Jose Santos", "خوسيه سانتوس"], ["Anil Nair", "أنيل ناير"], ["Ramon Cruz", "رامون كروز"], ["Suresh Pillai", "سوريش بيلاي"], ["Imran Khan", "عمران خان"], ["Bilal Ahmed", "بلال أحمد"], ["Arjun Menon", "أرجون مينون"], ["Mark Reyes", "مارك رييس"], ["Rafiq Islam", "رفيق إسلام"], ["Kamal Hossain", "كمال حسين"]];
const BANKS: [code: string, name: string][] = [["80", "Al Rajhi Bank"], ["10", "Saudi National Bank"], ["20", "Riyad Bank"], ["05", "Alinma Bank"], ["45", "SAB"], ["15", "Bank Albilad"]];
const USERS: [email: string, first: string, roles: string[], emp?: string][] = [
  ["hr.manager@ddt.example.test", "نورة القحطاني", ["HR Manager", "HR User", "Employee"], "DDT-HR-001"], ["payroll@ddt.example.test", "خالد الشمري", ["HR User", "Employee"], "DDT-HR-002"],
  ["line.manager@ddt.example.test", "سلطان العنزي", ["Employee", "Leave Approver", "Expense Approver"], "DDT-HR-007"], ["employee@ddt.example.test", "ريم الحربي", ["Employee"], "DDT-HR-020"],
  ["site.hr@dcc.example.test", "فهد المطيري", ["HR User", "Employee"]],
];

export function hrProductVolume(ctx: VolumeContext): void {
  const T = new Date().toISOString().slice(0, 10); const day = (k: number) => addDays(T, k); const R = rng(20261115);
  const companies = adapter.list("Company"); const C1 = companies.find((c) => s(c["abbr"]) === "DDT")?.name; const C2 = companies.find((c) => s(c["abbr"]) === "DCC")?.name;
  if (!C1) return;
  const put = (dt: string, name: string, data: Record<string, unknown>) => ctx.put(dt, name, { ...data, ...TAG });
  const exists = (dt: string, name: string) => !!adapter.get(dt, name);

  /* ---------------------------------------------------------------- masters */
  for (const [k, t] of [["National ID", "الهوية الوطنية"], ["Iqama", "الإقامة"], ["Passport", "جواز السفر"], ["Work Visa", "تأشيرة العمل"], ["Medical Insurance", "التأمين الطبي"], ["Driving License", "رخصة القيادة"]] as const) put("Identification Document Type", k, { identification_document_type: k, __name_ar: t });
  for (const [nm, type, abbr] of [["Loan Repayment", "Deduction", "LOAN"], ["Performance Bonus", "Earning", "BON"], ["Overtime", "Earning", "OT"]] as const) put("Salary Component", nm, { salary_component: nm, salary_component_abbr: abbr, type, depends_on_payment_days: 0 });
  for (const sk of ["Customer Care", "Negotiation", "Excel", "Safety", "AutoCAD", "Leadership", "Contract Law", "Quality Audit", "Forklift", "Welding", "Scaffolding", "Arabic Writing"]) put("Skill", sk, { skill_name: sk });
  const branches = ["المقر الرئيسي", "الفرع أ", "Jeddah Branch"].filter((b) => exists("Branch", b));
  for (const [en, ar, mgr, staff] of NEW_DEPTS) { put("Department", `${en} - DDT`, { department_name: en, company: C1, parent_department: "All Departments", __name_ar: ar }); put("Designation", mgr, { designation_name: mgr }); put("Designation", staff, { designation_name: staff }); }
  for (const g of ["G1", "G2", "G3", "G4", "G5", "G6"]) put("Employee Grade", g, { default_base_pay: 3000 + Number(g.slice(1)) * 2500 });
  // payroll accounts the engine needs (insert-if-missing; existing names are kept)
  const group = (co: string, root: string, re: RegExp) => { const gs = adapter.list("Account").filter((a) => a["company"] === co && Number(a["is_group"]) && s(a["root_type"]) === root); return (gs.find((a) => re.test(a.name)) ?? gs[gs.length - 1])?.name; };
  const acct = (co: string, abbr: string, name: string, root: "Expense" | "Liability" | "Asset", extra: Record<string, unknown> = {}) => {
    const nm = `${name} - ${abbr}`; if (exists("Account", nm)) return nm;
    const parent = group(co, root, root === "Expense" ? /Indirect|غير المباشرة|Expenses|المصروفات/ : root === "Liability" ? /Current Liabilities|المطلوبات المتداولة|الخصوم المتداولة|Duties|Payable/ : /Current Assets|الأصول المتداولة|Loans and Advances/);
    put("Account", nm, { account_name: name, company: co, parent_account: parent, root_type: root, report_type: root === "Expense" ? "Profit and Loss" : "Balance Sheet", is_group: 0, account_currency: "SAR", ...extra }); return nm;
  };
  for (const [co, abbr] of [[C1, "DDT"], [C2, "DCC"]] as const) { if (!co) continue;
    if (!payrollAccount(co, "salary")) acct(co, abbr, "Salaries and Wages", "Expense");
    if (!payrollAccount(co, "payable")) acct(co, abbr, "Salary Payable", "Liability");
    acct(co, abbr, "GOSI Payable", "Liability"); acct(co, abbr, "GOSI Expense", "Expense"); acct(co, abbr, "End of Service Provision", "Liability"); acct(co, abbr, "End of Service Expense", "Expense");
    acct(co, abbr, "Leave Salary Provision", "Liability"); acct(co, abbr, "Leave Salary Expense", "Expense");
    if (!payrollAccount(co, "advance")) acct(co, abbr, "Employee Advances", "Asset", { account_type: "Receivable" });
  }
  if (C2) put("Salary Structure", "DCC Site Monthly 2026", { company: C2, payroll_frequency: "Monthly", currency: "SAR", is_active: "Yes", docstatus: 1,
    earnings: [{ idx: 1, salary_component: "Basic Salary", abbr: "BS", formula: "base * 0.6", amount_based_on_formula: 1 }, { idx: 2, salary_component: "Housing Allowance", abbr: "HA", formula: "base * 0.25", amount_based_on_formula: 1 }, { idx: 3, salary_component: "Transport Allowance", abbr: "TA", formula: "base * 0.15", amount_based_on_formula: 1 }],
    deductions: [{ idx: 1, salary_component: "GOSI Employee Share", abbr: "GOSI", formula: "(BS + HA) * 0.0975", amount_based_on_formula: 1 }] });
  // Saudi rule sets and policy settings (effective-dated; a draft change waits for approval)
  for (const [co, abbr] of [[C1, "DDT"], [C2, "DCC"]] as const) { if (!co) continue;
    ([["GOSI", "GOSI contributions", "Saudi 9.75% employee + 11.75% employer, non-Saudi 2% employer; wage = basic + housing, 1,500–45,000.", "GOSI Law (Royal Decree M/33) and the 2024 contribution schedule"], ["WPS", "Wage Protection", "Salaries paid through the bank file of the same payroll run; every paid employee needs an IBAN.", "MHRSD Wage Protection Program"], ["End of Service", "End of service award", "Half a month of wage per year for the first five years and a full month after; resignation thirds at 2/5/10 years.", "Labour Law arts. 84–85"], ["Saudization", "Nitaqat", "Saudi share by company size band and activity; red below 10%, green from the target.", "Nitaqat program"]] as const)
      .forEach(([area, title, text, src], i) => put("DIGIT Saudi Rule Set", `HRD-RS-${abbr}-${i + 1}`, { rule_title: `${title} — ${abbr}`, rule_area: area, company: co, effective_from: "2026-01-01", rule_status: "Approved", source_reference: src, rule_text: text, docstatus: 1 }));
  }
  const pol = (k: number, setting: string, co: string | undefined, value: number, status = "Approved", from = "2026-01-01", notes = "") => put(DHPS, `HRD-POL-${pad(k)}`, { setting, company: co, setting_status: status, effective_from: from, value, notes, source_reference: "Company HR policy", owner_user: "hr.manager@ddt.example.test" });
  pol(1, "overtime_budget_hours_month", C1, 300); if (C2) { pol(2, "overtime_budget_hours_month", C2, 900); pol(3, "saudization_target_pct", C2, 18, "Approved", "2026-01-01", "Construction activity band"); }
  pol(4, "payroll_variance_pct", C1, 8, "Draft", day(15), "Tighter variance review from next month"); pol(5, "air_ticket_accrual_month", undefined, 150, "Draft", day(1), "Economy return ticket accrual for non-Saudi staff");
  ([["Salary Certificate", "تعريف بالراتب", "HR Letter", 24], ["Experience Certificate", "شهادة خبرة", "HR Letter", 48], ["Payslip Query", "استفسار عن قسيمة الراتب", "Payroll Query", 24], ["Leave Balance Correction", "تصحيح رصيد الإجازات", "Leave Query", 48], ["Iqama Renewal", "تجديد الإقامة", "Document Request", 72], ["Exit / Re-entry Visa", "تأشيرة خروج وعودة", "Document Request", 48], ["System Access", "صلاحيات الأنظمة", "IT & Access", 8], ["Bank Letter", "خطاب للبنك", "HR Letter", 24], ["Medical Insurance Card", "بطاقة التأمين الطبي", "Document Request", 48], ["Confidential Matter", "مسألة سرية", "Confidential", 24]] as const)
    .forEach(([t, ar, cat, h], i) => put("DIGIT Service Catalog Item", `HRD-SCI-${pad(i + 1)}`, { service_title: t, title_ar: ar, category: cat, enabled: 1, default_severity: cat === "Confidential" ? "High" : "Medium", sla_hours: h, sort_order: i + 1 }));
  ([["Letters to HR officers", "HR Letter", "payroll@ddt.example.test"], ["Payroll queries", "Payroll Query", "payroll@ddt.example.test"], ["Leave queries", "Leave Query", "hr.manager@ddt.example.test"], ["Documents", "Document Request", "hr.manager@ddt.example.test"], ["Confidential to HR manager", "Confidential", "hr.manager@ddt.example.test"]] as const)
    .forEach(([nm, cat, to], i) => put("DIGIT HR Case Routing Rule", `HRD-DCR-${pad(i + 1)}`, { rule_name: nm, company: C1, enabled: 1, priority: i + 1, category: cat, assign_to: to, escalate_to: "hr.manager@ddt.example.test" }));
  for (const [email, full, roles] of USERS) put("User", email, { email, first_name: full.split(" ")[0], last_name: full.split(" ").slice(1).join(" "), full_name: full, enabled: 1, user_type: "System User", roles: roles.map((r, i) => ({ idx: i + 1, role: r })), language: "ar" });
  if (C2) put("User Permission", "HRD-UP-001", { user: "site.hr@dcc.example.test", allow: "Company", for_value: C2, apply_to_all_doctypes: 1, is_default: 1 });
  ([["Commercial", "التجاري"], ["Operations", "العمليات"], ["Corporate", "الخدمات المؤسسية"], ["Engineering", "الهندسة"], ["Site Trades", "الحرف الميدانية"], ["Control", "الرقابة"]] as const).forEach(([f, ar], i) => put("DIGIT Job Family", `HRD-DJF-${pad(i + 1)}`, { family_name: f, description: ar }));

  /* ---------------------------------------------------------------- people */
  type E = { id: string; ar: string; en: string; dept: string; desig: string; mgr: string; base: number; join: string; left?: string; saudi: boolean | null; nat: string; female: boolean; branch: string };
  const H: E[] = [];
  for (let i = 1; i <= 80; i++) {
    const di = (i - 1) % 6; const [den, , mgrD, staffD] = NEW_DEPTS[di]!; const isMgr = i <= 6; const saudi = i >= 78 ? null : i % 5 !== 1 && i % 5 !== 3;
    const nat = saudi === null ? "" : saudi ? "Saudi Arabia" : NATIONS[i % NATIONS.length]!; const southAsia = !saudi && ["India", "Pakistan", "Philippines", "Bangladesh"].includes(nat);
    const p = person(300 + i); const [en, ar] = southAsia ? NON_AR[i % NON_AR.length]! : [fullEn(p), fullAr(p)];
    const join = i <= 70 ? `20${14 + (i % 12)}-${pad(1 + (i % 12), 2)}-${pad(1 + (i % 27), 2)}` : i <= 77 ? day(-(10 + (i - 70) * 15)) : day(-((i - 77) * 3) + 0) > T ? T : `${T.slice(0, 7)}-0${i - 76}`;
    H.push({ id: `DDT-HR-${pad(i)}`, ar, en, dept: `${den} - DDT`, desig: isMgr ? mgrD : staffD, mgr: isMgr ? "DDT-EMP-001" : di === 0 && i !== 7 ? "DDT-HR-007" : `DDT-HR-${pad(di + 1)}` /* the demo line manager (DDT-HR-007) leads the rest of department 1 */, base: isMgr ? 18000 + di * 1500 : 5200 + ((i * 431) % 90) * 100, join: join > T ? T : join, ...(i === 33 ? { left: day(-40) } : i === 57 ? { left: day(-75) } : {}), saudi, nat, female: southAsia ? false : p.female, branch: branches[i % Math.max(1, branches.length)] ?? "" });
  }
  const iban = (k: number) => { const b = BANKS[k % BANKS.length]!; return { iban: `SA${pad((k * 7) % 97, 2)}${b[0]}${String(1e17 + k * 7919).slice(0, 18).padStart(18, "0")}`, bank_name: b[1] }; };
  H.forEach((e, i) => {
    const k = i + 1; const mail = `${e.en.toLowerCase().replace(/[^a-z]+/g, ".")}@ddt.example.test`;
    // owner HR-02: every active employee has a self-service user account (Employee role); the named demo users keep theirs
    const user = USERS.find((u) => u[3] === e.id)?.[0] ?? (e.left ? undefined : mail);
    if (user === mail) put("User", mail, { email: mail, first_name: e.ar.split(" ")[0], last_name: e.ar.split(" ").slice(1).join(" "), full_name: e.ar, enabled: 1, user_type: "System User", language: "ar", roles: [{ idx: 1, role: "Employee" }] });
    put("Employee", e.id, { first_name: e.ar.split(" ")[0], last_name: e.ar.split(" ").slice(1).join(" "), employee_name: e.ar, __name_en: { employee_name: e.en }, gender: e.female ? "Female" : "Male", company: C1, status: e.left ? "Left" : "Active", ...(e.left ? { relieving_date: e.left, reason_for_leaving: k === 33 ? "Resignation" : "End of contract" } : {}),
      date_of_birth: `19${70 + (k % 28)}-${pad(1 + (k % 12), 2)}-${pad(1 + (k % 27), 2)}`, date_of_joining: e.join, department: e.dept, designation: e.desig, reports_to: e.mgr, branch: e.branch, nationality: e.nat, employment_type: "Full-time", grade: `G${1 + ((k * 3) % 6)}`,
      holiday_list: adapter.list("Holiday List").find((h) => s(h.name).includes("DDT"))?.name, default_shift: k % 9 === 0 ? "Night Shift" : "Day Shift", cell_number: `05${String(50000000 + k * 7331).slice(0, 8)}`, company_email: mail,
      ...(k === 78 || k === 80 ? {} : iban(k)), ...(user ? { user_id: user } : {}), ctc: e.base * 12 });
  });
  const ddtAll = adapter.list("Employee").filter((e) => e["company"] === C1);
  const dccAll = C2 ? adapter.list("Employee").filter((e) => e["company"] === C2) : [];
  // identity documents: everyone without a recorded nationality gets a National ID or an Iqama; non-Saudis also a passport and medical insurance
  let rk = 0; const rn = () => `HRD-REN-${pad(++rk, 4)}`;
  const renew = (e: Doc, type: string, num: string, issue: string, exp: string) => put("DIGIT Document Renewal", rn(), { employee: e.name, employee_name: e["employee_name"], company: e["company"], document_type: type, document_number: num, issue_date: issue, expiry_date: exp, status: exp < T ? "Expired" : exp <= day(60) ? "Expiring" : "Valid" });
  [...ddtAll, ...dccAll].forEach((e, i) => {
    const hp = H.find((x) => x.id === e.name); if (hp && hp.saudi === null) return;
    const nat = s(e["nationality"]); const saudi = nat ? /saudi/i.test(nat) : e["company"] === C2 ? i % 10 < 3 : i % 3 !== 0;
    const exp = saudi ? addDays(T, 400 + ((i * 53) % 1800)) : addDays(T, ((i * 37) % 420) - 25);
    renew(e, saudi ? "National ID" : "Iqama", saudi ? `1${String(100000000 + i * 7177).slice(0, 9)}` : `2${String(300000000 + i * 6311).slice(0, 9)}`, addDays(exp, saudi ? -3650 : -365), exp);
    if (!saudi) { renew(e, "Passport", `P${String(5000000 + i * 911).slice(0, 7)}`, addDays(T, -900 - i), addDays(T, 900 + ((i * 71) % 1200) - (i % 17 === 0 ? 860 : 0))); renew(e, "Medical Insurance", `MI-${pad(i, 5)}`, addDays(T, -300), addDays(T, 65 - ((i * 29) % 120))); }
  });
  // contracting crews: bank accounts recorded through applied bank change requests (the employee records are Construction-owned)
  dccAll.filter((e) => !s(e["iban"]) && !s(e["bank_ac_no"])).forEach((e, i) => { const b = iban(900 + i); put("DIGIT Bank Change Request", `HRD-DBC-C${pad(i + 1)}`, { employee: e.name, employee_name: e["employee_name"], company: C2, request_status: "Applied", reason: "تسجيل الحساب البنكي لصرف الراتب عبر حماية الأجور", new_bank_name: b.bank_name, new_iban: b.iban, decided_by: "site.hr@dcc.example.test", applied_by: "site.hr@dcc.example.test", applied_on: "2026-01-05 10:00:00", creation: "2026-01-04T09:00:00.000Z" }); });
  // salary structure assignments (new employees; the two newest have none yet — a preflight blocker)
  H.forEach((e, i) => { if (i + 1 >= 79) return; put("Salary Structure Assignment", `HRD-SSA-${pad(i + 1)}`, { employee: e.id, employee_name: e.ar, __name_en: { employee_name: e.en }, salary_structure: "DDT Monthly 2026", from_date: e.join > "2026-01-01" ? e.join : "2026-01-01", base: e.base, currency: "SAR", company: C1, docstatus: 1 }); });
  dccAll.forEach((e, i) => put("Salary Structure Assignment", `HRD-SSA-C${pad(i + 1)}`, { employee: e.name, employee_name: e["employee_name"], salary_structure: "DCC Site Monthly 2026", from_date: d10(e["date_of_joining"]) > "2026-01-01" ? d10(e["date_of_joining"]) : "2026-01-01", base: /engineer|manager|مهندس|مدير/i.test(s(e["designation"])) ? 14000 + (i % 5) * 1500 : /foreman|supervisor|مشرف|ملاحظ/i.test(s(e["designation"])) ? 7800 + (i % 4) * 400 : 3600 + ((i * 263) % 30) * 100, currency: "SAR", company: C2, docstatus: 1 }));
  // contracts (fixed term for non-Saudis, some ending within 30/60/90 days)
  const docs0 = identityIndex();
  [...ddtAll, ...dccAll].forEach((e, i) => { if (s(e["status"]) !== "Active") return; const join = d10(e["date_of_joining"]) || "2024-01-01"; const nonSaudi = docs0.get(e.name) === "Iqama" || (!!s(e["nationality"]) && !/saudi/i.test(s(e["nationality"])));
    const end = nonSaudi ? addDays(T, ((i * 41) % 700) - 20) : ""; put("DIGIT Employment Contract", `HRD-DEC-${pad(i + 1, 4)}`, { employee: e.name, employee_name: e["employee_name"], company: e["company"], contract_type: daysBetween(join, T) < 90 ? "Probation" : nonSaudi ? "Fixed Term" : "Unlimited", start_date: nonSaudi ? addDays(end || T, -730) : join, end_date: end, contract_status: end && end < T ? "Expired" : "Active", probation_days: 90, notice_days: nonSaudi ? 30 : 60, docstatus: 1 }); });
  for (let i = 1; i <= 12; i++) put("DIGIT Contract Amendment", `HRD-DCA-${pad(i)}`, { contract: `HRD-DEC-${pad(i * 9, 4)}`, employee_name: "", effective_date: day(-i * 11), amendment_type: (["Extension", "Terms Change", "Role Change", "Extension"] as const)[i % 4], new_end_date: day(365 + i * 10), details: "تمديد العقد سنة إضافية بعد موافقة مدير القسم.", docstatus: i % 4 === 0 ? 0 : 1 });
  // positions, budgets, plans
  let pk = 0; const posOf = new Map<string, string>();
  for (const [en, , mgrD, staffD] of NEW_DEPTS) { const dept = `${en} - DDT`; const inDept = H.filter((e) => e.dept === dept && !e.left);
    for (const e of inDept) { pk++; const nm = `HRD-POS-${pad(pk)}`; posOf.set(e.id, nm); put("DIGIT Position", nm, { position_title: e.desig, company: C1, department: dept, designation: e.desig, position_status: "Filled", incumbent: e.id, reports_to: e.desig === mgrD ? "" : posOf.get(e.mgr) ?? "", effective_from: e.join }); }
    for (let v = 0; v < 2; v++) { pk++; put("DIGIT Position", `HRD-POS-${pad(pk)}`, { position_title: staffD, company: C1, department: dept, designation: staffD, position_status: v === 0 ? "Vacant" : pk % 3 === 0 ? "Frozen" : "Vacant", reports_to: posOf.get(inDept[0]?.id ?? "") ?? "", effective_from: day(-30 * (v + 1)) }); }
    put("DIGIT Position Budget", `HRD-DPB-${en.slice(0, 3).toUpperCase()}`, { budget_title: `${en} positions 2026`, company: C1, department: dept, from_date: "2026-01-01", to_date: "2026-12-31", approved_headcount: inDept.length + 2, approved_cost: (inDept.reduce((a, e) => a + e.base, 0) + 2 * 7000) * 12, budget_status: "Approved", docstatus: 1 });
    put("DIGIT Workforce Plan", `HRD-DWP-${en.slice(0, 3).toUpperCase()}`, { plan_title: `${en} workforce plan 2026`, company: C1, department: dept, from_date: "2026-01-01", to_date: "2026-12-31", current_headcount: inDept.length, planned_headcount: inDept.length + (en === "Customer Service" ? 4 : en === "Quality" ? -1 : 2), docstatus: 1 });
  }
  if (C2) put("DIGIT Workforce Plan", "HRD-DWP-DCC", { plan_title: "Site workforce plan 2026", company: C2, from_date: "2026-01-01", to_date: "2026-12-31", current_headcount: dccAll.length, planned_headcount: dccAll.length + 12, docstatus: 1 });
  H.forEach((e, i) => { put("DIGIT Assignment History", `HRD-DAH-${pad(i + 1)}`, { employee: e.id, company: C1, position: posOf.get(e.id) ?? "", department: e.dept, designation: e.desig, from_date: e.join, to_date: e.left ?? "", change_reason: "Hire" }); put("DIGIT Work Relationship", `HRD-DWR-${pad(i + 1)}`, { employee: e.id, company: C1, relationship_type: i % 23 === 5 ? "Secondment" : i % 31 === 7 ? "Intern" : "Employee", start_date: e.join, end_date: e.left ?? "" }); });
  dccAll.slice(0, 12).forEach((e, i) => put("DIGIT Work Relationship", `HRD-DWR-C${pad(i + 1)}`, { employee: e.name, company: C2, relationship_type: i % 3 === 0 ? "Contractor" : "Employee", start_date: d10(e["date_of_joining"]) || "2025-01-01" }));
  ([["Customer Service", "Customer Care"], ["Procurement", "Negotiation"], ["Legal", "Contract Law"], ["Quality", "Quality Audit"], ["Logistics", "Forklift"], ["Marketing", "Excel"]] as const).forEach(([dep, sk], i) => put("DIGIT Job Profile", `HRD-DJP-${pad(i + 1)}`, { profile_name: NEW_DEPTS.find((d) => d[0] === dep)![3], job_family: `HRD-DJF-${pad((i % 3) + 1)}`, designation: NEW_DEPTS.find((d) => d[0] === dep)![3], grade_band: "Professional", responsibilities: `مهام ${NEW_DEPTS.find((d) => d[0] === dep)![1]}`, competencies: sk }));

  /* ---------------------------------------------------------------- time: leave, attendance, check-ins, shifts, overtime */
  const active = [...H.filter((e) => !e.left).map((e) => ({ id: e.id, name: e.ar, en: e.en, co: C1, dept: e.dept, join: e.join, night: false })), ...dccAll.filter((e) => s(e["status"]) === "Active").map((e) => ({ id: e.name, name: s(e["employee_name"]), en: s((e["__name_en"] as Record<string, string> | undefined)?.["employee_name"]), co: C2!, dept: s(e["department"]), join: d10(e["date_of_joining"]) || "2024-01-01", night: false }))];
  active.forEach((e, i) => { (["Annual Leave", "Sick Leave"] as const).forEach((t, j) => put("Leave Allocation", `HRD-LAL-${pad(i + 1)}-${j}`, { employee: e.id, employee_name: e.name, leave_type: t, from_date: `${T.slice(0, 4)}-01-01`, to_date: `${T.slice(0, 4)}-12-31`, new_leaves_allocated: j ? 30 : 21 + (i % 10), total_leaves_allocated: j ? 30 : 21 + (i % 10), company: e.co, docstatus: 1 })); });
  let lk = 0; const leave = (e: (typeof active)[number], type: string, from: string, days: number, status: "Approved" | "Open" | "Rejected", approver = "line.manager@ddt.example.test") => { lk++; const to = addDays(from, days - 1); /* a pending request was sent 2–5 days ago (never months, never in the future) */ const asked = status === "Open" ? day(-(2 + (lk % 4))) : addDays(from, -7); put("Leave Application", `HRD-LAP-${pad(lk, 4)}`, { employee: e.id, employee_name: e.name, __name_en: { employee_name: e.en }, leave_type: type, from_date: from, to_date: to, total_leave_days: days, status, leave_approver: approver, posting_date: asked, company: e.co, docstatus: status === "Open" ? 0 : 1, creation: `${asked}T08:00:00.000Z` }); return `HRD-LAP-${pad(lk, 4)}`; };
  active.forEach((e, i) => {
    if (i % 3 === 0) leave(e, "Annual Leave", day(-110 + (i % 60)), 3 + (i % 8), "Approved");
    if (i % 7 === 2) leave(e, "Sick Leave", day(-45 + (i % 30)), 1 + (i % 3), "Approved");
    if (i % 9 === 4) leave(e, "Annual Leave", day(3 + (i % 18)), 4 + (i % 6), "Approved");
    if (i % 11 === 5) leave(e, "Annual Leave", day(1 + (i % 25)), 2 + (i % 5), "Open", e.co === C2 ? "site.hr@dcc.example.test" : "line.manager@ddt.example.test");
    if (i % 29 === 3) leave(e, "Leave Without Pay", `${monthsBack(T, 1)[0]}-1${i % 9}`, 2, "Approved");
    if (i % 41 === 8) leave(e, "Hajj Leave", day(-200), 10, "Approved");
  });
  // attendance of the 12 months before the last 8 weeks (round 2: a full year for absence, overtime and trend reports), same pattern, own names
  let hk = 0;
  active.forEach((e, i) => { for (let k = 365; k > 56; k--) { const ds = day(-k); if (!isWork(ds) || ds < e.join) continue; const x = (i * 31 + k * 7) % 41;
    const st = x === 0 || (e.co === C2 && x === 13) ? "Absent" : x === 1 ? "Half Day" : x === 2 && e.co === C1 ? "Work From Home" : "Present"; hk++;
    put("Attendance", `HRD-ATH-${pad(hk, 6)}`, { employee: e.id, employee_name: e.name, attendance_date: ds, status: st, company: e.co, department: e.dept, shift: "Day Shift", late_entry: x === 4 || x === 9 || (e.co === C2 && x === 17) ? 1 : 0, early_exit: x === 11 ? 1 : 0, docstatus: 1, creation: `${ds}T18:00:00.000Z` }); } });
  // attendance (last 8 weeks) and check-ins (14 days) for the new and contracting employees
  let ak = 0, ck = 0; const devices = ["ZK-RUH-01", "ZK-RUH-02", "ZK-JED-01", "SITE-GATE-A", "SITE-GATE-B"];
  const hm = (v: unknown, dflt: number) => { const m = /^(\d{1,2}):(\d{2})/.exec(String(v ?? "")); return m ? Number(m[1]) * 60 + Number(m[2]) : dflt; };
  const dayShift = adapter.get("Shift Type", "Day Shift"); const SHIFT_IN = hm(dayShift?.["start_time"], 8 * 60), SHIFT_OUT = hm(dayShift?.["end_time"], 17 * 60);
  active.forEach((e, i) => { for (let k = 56; k >= 1; k--) { const ds = day(-k); if (!isWork(ds) || ds < e.join) continue; const x = (i * 31 + k * 7) % 41;
      const st = x === 0 || (e.co === C2 && x === 13) ? "Absent" : x === 1 ? "Half Day" : x === 2 && e.co === C1 ? "Work From Home" : "Present"; ak++;
      put("Attendance", `HRD-ATT-${pad(ak, 5)}`, { employee: e.id, employee_name: e.name, attendance_date: ds, status: st, company: e.co, department: e.dept, shift: "Day Shift", late_entry: x === 4 || x === 9 || (e.co === C2 && x === 17) ? 1 : 0, early_exit: x === 11 ? 1 : 0, docstatus: 1, creation: `${ds}T18:00:00.000Z` });
      if (k <= 14 && (st === "Present" || st === "Half Day")) { const dev = e.co === C2 ? devices[3 + (i % 2)]! : devices[i % 3]!; const manual = (i + k) % 23 === 0;
        // owner round H2-05: punches follow the shift's own times (Shift Type start / end) and the day's attendance flags —
        // on time arrives 0–14 minutes early, a late entry 18–52 minutes after the start, an early exit leaves 40–95 minutes before the end
        const late = x === 4 || x === 9 || (e.co === C2 && x === 17), early = x === 11;
        const inMin = SHIFT_IN + (late ? 18 + ((i * 13 + k) % 35) : -((i * 7 + k) % 15));
        const outMin = st === "Half Day" ? SHIFT_IN + 240 + ((i * 11) % 25) : early ? SHIFT_OUT - (40 + ((i * 17 + k) % 56)) : SHIFT_OUT + ((i * 11 + k) % 26);
        ck++; put("Employee Checkin", `HRD-CHK-${pad(ck, 5)}`, { employee: e.id, employee_name: e.name, log_type: "IN", time: at(ds, Math.floor(inMin / 60), inMin % 60), device_id: manual ? "" : dev, shift: "Day Shift" });
        if ((i + k) % 31 !== 0) { ck++; put("Employee Checkin", `HRD-CHK-${pad(ck, 5)}`, { employee: e.id, employee_name: e.name, log_type: "OUT", time: at(ds, Math.floor(outMin / 60), outMin % 60), device_id: manual ? "" : dev, shift: "Day Shift" }); } } } });
  active.forEach((e, i) => { if (i % 13 === 6) put("Attendance Request", `HRD-ATR-${pad(i)}`, { employee: e.id, employee_name: e.name, from_date: day(-(i % 9) - 1), to_date: day(-(i % 9) - 1), reason: i % 2 ? "On Duty" : "Work From Home", explanation: "نسيت تسجيل البصمة عند الدخول", company: e.co, docstatus: i % 26 === 6 ? 1 : 0 }); });
  active.forEach((e, i) => put("Shift Assignment", `HRD-SAS-${pad(i + 1)}`, { employee: e.id, employee_name: e.name, shift_type: e.co === C2 && i % 5 === 0 ? "Night Shift" : "Day Shift", start_date: `${monthsBack(T, 1)[0]}-01`, end_date: day(i % 17 === 0 ? 3 : 45), status: "Active", company: e.co, department: e.dept, docstatus: 1 }));
  active.forEach((e, i) => { if (i % 19 === 7) put("Shift Request", `HRD-SRQ-${pad(i)}`, { employee: e.id, employee_name: e.name, shift_type: "Night Shift", from_date: day(2 + (i % 5)), to_date: day(8 + (i % 5)), status: "Draft", approver: e.co === C2 ? "site.hr@dcc.example.test" : "line.manager@ddt.example.test", company: e.co, docstatus: 0 }); });
  const months = monthsBack(T, 6); const cm = T.slice(0, 7);
  let ok = 0; active.filter((e) => e.co === C2).forEach((e, i) => { if (i % 3) return; for (const m of months.slice(-3)) { ok++; const hrs = 6 + ((i * 7 + ok) % 22); put("Overtime Slip", `HRD-OTS-${pad(ok, 4)}`, { employee: e.id, employee_name: e.name, company: e.co, posting_date: addDays(monthEndOf(m), -2), from_date: `${m}-01`, to_date: monthEndOf(m), total_overtime_duration: hrs * 3600, overtime_type: i % 2 ? "Concrete pour" : "Shutdown work", status: "Approved", docstatus: 1 }); }
    if (i % 6 === 0) { ok++; put("Overtime Slip", `HRD-OTS-${pad(ok, 4)}`, { employee: e.id, employee_name: e.name, company: e.co, posting_date: day(-2), from_date: `${cm}-01`, to_date: day(-1), total_overtime_duration: (8 + (i % 9)) * 3600, overtime_type: "Concrete pour", status: "Pending", docstatus: 0 }); } });

  /* ---------------------------------------------------------------- money before payroll: loans, bonuses, claims, advances, travel */
  let ad = 0; const loanees = active.filter((_, i) => i % 14 === 3);
  for (const e of loanees) for (const m of [...months, cm]) { ad++; put("Additional Salary", `HRD-ADS-${pad(ad, 4)}`, { employee: e.id, employee_name: e.name, company: e.co, salary_component: "Loan Repayment", type: "Deduction", amount: 500 + (ad % 4) * 250, payroll_date: `${m}-15`, overwrite_salary_structure_amount: 1, docstatus: m === cm ? 0 : 1 }); }
  active.filter((e, i) => e.co === C1 && i % 10 === 4).forEach((e) => { ad++; put("Additional Salary", `HRD-ADS-${pad(ad, 4)}`, { employee: e.id, employee_name: e.name, company: e.co, salary_component: "Performance Bonus", type: "Earning", amount: 2500 + (ad % 5) * 500, payroll_date: `${months[5]}-20`, docstatus: 1 }); });
  const expTypes = ["Travel", "Food", "Accommodation", "Fuel", "Mobile"];
  active.filter((e) => e.co === C1).forEach((e, i) => { if (i % 3) return; const dte = day(-((i * 13) % 150)); const amt = 180 + ((i * 97) % 2400); const draft = i % 4 === 0;
    put("Expense Claim", `HRD-EXP-${pad(i)}`, { employee: e.id, employee_name: e.name, company: e.co, posting_date: dte, expense_approver: "line.manager@ddt.example.test", approval_status: draft ? "Draft" : "Approved", status: draft ? "Draft" : i % 8 === 1 ? "Unpaid" : "Paid", total_claimed_amount: amt, total_sanctioned_amount: draft ? 0 : amt, total_amount_reimbursed: draft || i % 8 === 1 ? 0 : amt, expenses: [{ idx: 1, expense_date: dte, expense_type: expTypes[i % 5], amount: amt, sanctioned_amount: draft ? 0 : amt, description: "مصروفات عمل" }], docstatus: draft ? 0 : 1 }); });
  active.forEach((e, i) => { if (i % 9 !== 2) return; const pd = day(-((i * 17) % 160) - 3); const amt = 1500 + (i % 6) * 1000; const claimed = i % 4 === 2 ? amt : (i % 3) * 500; const draft = i % 27 === 2;
    put("Employee Advance", `HRD-ADV-${pad(i)}`, { employee: e.id, employee_name: e.name, company: e.co, posting_date: pd, purpose: "سلفة على الراتب", advance_amount: amt, paid_amount: draft ? 0 : amt, claimed_amount: draft ? 0 : claimed, return_amount: 0, pending_amount: draft ? 0 : amt - claimed, status: draft ? "Draft" : claimed >= amt ? "Claimed" : "Paid", currency: "SAR", exchange_rate: 1, docstatus: draft ? 0 : 1 }); });
  active.filter((e) => e.co === C1).slice(0, 8).forEach((e, i) => put("Travel Request", `HRD-TRQ-${pad(i + 1)}`, { employee: e.id, employee_name: e.name, company: e.co, travel_type: i % 3 ? "Domestic" : "International", purpose_of_travel: i % 2 ? "Client Meeting" : "Training", travel_funding: "Fully Sponsored", description: "رحلة عمل", docstatus: i % 3 === 0 ? 0 : 1 }));

  /* ---------------------------------------------------------------- payroll: six monthly runs per company, posted */
  const docs = identityIndex();
  const vMonths = new Set(adapter.list("Salary Slip").filter((d) => d["company"] === C1 && Number(d.docstatus) === 1).map((d) => d10(d["start_date"]).slice(0, 7)));
  const runs: { co: string; abbr: string; m: string; emps: Doc[]; current: boolean }[] = [];
  const hIds = new Set(H.map((e) => e.id));
  for (const m of [...months, cm]) {
    const end = monthEndOf(m); const live = (e: Doc) => d10(e["date_of_joining"]) <= end && (s(e["status"]) === "Active" || d10(e["relieving_date"]) >= `${m}-01`);
    runs.push({ co: C1, abbr: "DDT", m, emps: adapter.list("Employee").filter((e) => e["company"] === C1 && live(e) && (m === cm || !vMonths.has(m) || hIds.has(e.name))), current: m === cm });
    if (C2) runs.push({ co: C2, abbr: "DCC", m, emps: adapter.list("Employee").filter((e) => e["company"] === C2 && live(e)), current: m === cm });
  }
  let jk = 0; const je = (co: string, date: string, title: string, vt: string, lines: JournalLine[], remark: string, extra: Record<string, unknown> = {}) => {
    jk++; const name = `HRD-JV-${pad(jk, 4)}`; const accounts = lines.map((l, i) => ({ idx: i + 1, account: l.account, debit_in_account_currency: l.debit, credit_in_account_currency: l.credit, debit: l.debit, credit: l.credit, cost_center: l.cost_center, project: l.project, digit_cost_category: l.project ? "Labour" : undefined, user_remark: l.user_remark }));
    if (put("Journal Entry", name, { title, voucher_type: vt, company: co, posting_date: date, accounts, total_debit: r2(lines.reduce((a, l) => a + l.debit, 0)), total_credit: r2(lines.reduce((a, l) => a + l.credit, 0)), user_remark: remark, docstatus: 1,
      // salary transfers older than six weeks were cleared through Bank Clearance, as on a reconciled live site (PRO P1-03)
      ...(vt === "Bank Entry" && date <= addDays(new Date().toISOString().slice(0, 10), -42) ? { clearance_date: date } : {}), ...extra })) ctx.voucher("Journal Entry", name);
    return name;
  };
  let gk = 0, wk = 0, vk = 0, pfk = 0, lockk = 0;
  for (const r of runs) {
    const pe = `HRD-PAY-${r.abbr}-${r.m}`; const end = monthEndOf(r.m); const partial = r.co === C1 && vMonths.has(r.m) && !r.current;
    const cc = adapter.list("Cost Center").find((c) => c["company"] === r.co && /^Main - /.test(c.name))?.name;
    put("Payroll Entry", pe, { company: r.co, title: `${partial ? "رواتب الأقسام الجديدة" : "رواتب"} ${r.m}`, posting_date: end, start_date: `${r.m}-01`, end_date: end, payroll_frequency: "Monthly", currency: "SAR", exchange_rate: 1, payroll_payable_account: payrollAccount(r.co, "payable"), cost_center: cc, employees: r.emps.map((e, i) => ({ idx: i + 1, employee: e.name, employee_name: e["employee_name"], department: e["department"], designation: e["designation"] })), number_of_employees: r.emps.length, docstatus: 0, status: "Draft" });
    const ped = adapter.get("Payroll Entry", pe); if (!ped || Number(ped.docstatus) !== 0) continue;
    if (r.current && r.co === C1) { const ck0 = preflight(ped); pfk++; put("DIGIT Payroll Preflight", `HRD-DPP-${pad(pfk)}`, { company: r.co, payroll_entry: pe, checked_on: day(-1), preflight_status: preflightBlocked(ck0) ? "Blocked" : "Passed", missing_bank_details: ck0.find((c) => c.key === "bank")?.names.length ?? 0, missing_salary_structure: ck0.find((c) => c.key === "ssa")?.names.length ?? 0, pending_leave_approvals: ck0.find((c) => c.key === "leave")?.names.length ?? 0, findings: ck0.filter((c) => c.names.length).map((c) => `${c.blocking ? "BLOCK" : "WARN"} ${c.title[0]}: ${c.names.length}`).join("\n") }); continue; }
    const made: string[] = [];
    for (const e of r.emps) { const x = slipFor(ped, e, docs); if (!x.doc) continue; const nm = s(x.doc["name"]); if (put("Salary Slip", nm, { ...x.doc, docstatus: r.current ? 0 : 1, status: r.current ? "Draft" : "Submitted" })) made.push(nm); }
    const slips = made.map((nm) => adapter.get("Salary Slip", nm)!).filter(Boolean);
    adapter.insertDocQuiet("Payroll Entry", { ...ped, salary_slips_created: 1, number_of_employees: slips.length, __preview_gross: r2(slips.reduce((a, d) => a + n(d["gross_pay"]), 0)), __preview_net: r2(slips.reduce((a, d) => a + n(d["net_pay"]), 0)) });
    pfk++; put("DIGIT Payroll Preflight", `HRD-DPP-${pad(pfk)}`, { company: r.co, payroll_entry: pe, checked_on: addDays(end, r.current ? -10 : -3), preflight_status: "Passed", missing_bank_details: 0, missing_salary_structure: 0, pending_leave_approvals: 0, findings: "" });
    // variances above the setting: explained on posted runs, open on the run in progress
    const vr = varianceRows(r.co, r.m, slips).filter((v) => v.kind === "change" && v.pct !== null && Math.abs(v.pct) >= 10);
    vr.forEach((v, i) => { vk++; put("DIGIT Payroll Variance", `HRD-DPV-${pad(vk, 4)}`, { employee: v.employee, employee_name: v.employee_name, company: r.co, payroll_entry: pe, salary_slip: slips.find((x) => x["employee"] === v.employee)?.name, previous_net: v.previous, current_net: v.current, variance_amount: v.diff, variance_status: r.current ? (i % 4 === 3 ? "Escalated" : "Open") : "Explained", explanation: r.current ? "" : v.diff > 0 ? "Overtime / bonus approved in the month" : "Unpaid leave or absence deduction" }); });
    if (r.current) continue;
    // submit + post the accrual by component, cost center and project; pay; WPS; GOSI; lock
    for (const sl of slips) adapter.insertDocQuiet("Salary Slip", { ...sl, docstatus: 1, status: "Submitted" });
    const posted = slips.map((sl) => adapter.get("Salary Slip", sl.name)!);
    const j = payrollJournal(ped, posted); const acc = j.errors.length ? "" : je(r.co, end, `Payroll ${r.m} — ${r.abbr}`, "Journal Entry", j.lines, `Payroll accrual of ${pe}`, { payroll_entry: pe });
    adapter.insertDocQuiet("Payroll Entry", { ...adapter.get("Payroll Entry", pe)!, docstatus: 1, status: "Submitted", salary_slips_submitted: 1, journal_entry: acc });
    const last = r.m === months[5]; const net = r2(posted.reduce((a, d) => a + n(d["net_pay"]), 0)); const pay = payrollAccount(r.co, "payable", ped), bank = bankAccount(r.co);
    if (pay && bank && !(last && r.co === C2)) je(r.co, addDays(end, 4), `Salary transfer ${r.m} — ${r.abbr}`, "Bank Entry", [{ account: pay, debit: net, credit: 0 }, { account: bank, debit: 0, credit: net }], `WPS salary transfer of ${pe}`, { payroll_entry: pe });
    const f = wpsFile(ped, posted); wk++; put("DIGIT WPS Submission", `HRD-WPS-${pad(wk)}`, { company: r.co, payroll_entry: pe, period_month: `${r.m}-01`, employee_count: f.rows.length, total_amount: f.total, submission_status: last ? (r.co === C2 ? "Prepared" : "Submitted Externally") : "Accepted", external_reference: last && r.co === C2 ? "" : `MUDAD-${r.abbr}-${r.m.replace("-", "")}`, notes: `WPS file of ${f.rows.length} employees`, docstatus: last && r.co === C2 ? 0 : 1 });
    const rs = adapter.list("DIGIT Saudi Rule Set").find((x) => x["company"] === r.co && x["rule_area"] === "GOSI")?.name;
    if (rs) for (const sl of posted) { const e = adapter.get("Employee", s(sl["employee"])); if (!e) continue; const bh = ((sl["earnings"] as Doc[] | undefined) ?? []).filter((x) => BASIC.test(s(x["salary_component"])) || HOUSING.test(s(x["salary_component"]))).reduce((a, x) => a + n(x["default_amount"] ?? x["amount"]), 0); const g = gosiShares(e, bh, end, docs); if (!g) continue; gk++; put("DIGIT GOSI Assessment", `HRD-DGA-${pad(gk, 5)}`, { employee: e.name, employee_name: e["employee_name"], company: r.co, period_month: `${r.m}-01`, rule_set: rs, contributory_wage: g.wage, employee_share: g.employee, employer_share: g.employer, docstatus: 1 }); }
    const a = accrualJournal(r.co, r.m); if (!a.errors.length && a.lines.length) je(r.co, end, `HR provisions ${r.m} — ${r.abbr}`, "Journal Entry", a.lines, "End of service and leave salary provisions", { digit_hr_accrual: r.m });
    if (!last) { lockk++; put("DIGIT Payroll Period Lock", `HRD-DPL-${pad(lockk)}`, { company: r.co, from_date: `${r.m}-01`, to_date: end, lock_status: "Locked", locked_by: "payroll@ddt.example.test", locked_on: `${addDays(end, 6)} 10:00:00` }); }
  }
  // GOSI for the existing trading-company slips of the same months (one assessment per employee per month)
  const rs1 = adapter.list("DIGIT Saudi Rule Set").find((x) => x["company"] === C1 && x["rule_area"] === "GOSI")?.name;
  if (rs1) for (const sl of adapter.list("Salary Slip").filter((d) => d["company"] === C1 && Number(d.docstatus) === 1 && months.includes(d10(d["start_date"]).slice(0, 7)) && !s(d["payroll_entry"]).startsWith("HRD-"))) {
    const e = adapter.get("Employee", s(sl["employee"])); if (!e) continue; const bh = ((sl["earnings"] as Doc[] | undefined) ?? []).filter((x) => BASIC.test(s(x["salary_component"])) || HOUSING.test(s(x["salary_component"]))).reduce((a, x) => a + n(x["amount"]), 0); const g = gosiShares(e, bh, d10(sl["end_date"]), docs); if (!g) continue;
    gk++; put("DIGIT GOSI Assessment", `HRD-DGA-${pad(gk, 5)}`, { employee: e.name, employee_name: e["employee_name"], company: C1, period_month: `${d10(sl["start_date"]).slice(0, 7)}-01`, rule_set: rs1, contributory_wage: g.wage, employee_share: g.employee, employer_share: g.employer, docstatus: 1 }); }
  void prevMonth; void slipsOf;

  /* ---------------------------------------------------------------- talent: recruitment, onboarding, performance, learning, succession */
  const openings: string[] = [];
  NEW_DEPTS.slice(0, 4).forEach(([en, , , staff], i) => { const nm = `HRD-JOB-${pad(i + 1)}`; openings.push(nm); put("Job Opening", nm, { job_title: `${staff} — ${en}`, designation: staff, department: `${en} - DDT`, company: C1, status: "Open", posted_on: day(-40 + i * 6), closes_on: day(i === 3 ? -2 : 20 + i * 5), planned_vacancies: 2 + (i % 2), description: `${staff} role` }); });
  NEW_DEPTS.forEach(([en, , , staff], i) => put("Job Requisition", `HRD-JRQ-${pad(i + 1)}`, { designation: staff, department: `${en} - DDT`, company: C1, no_of_positions: 1 + (i % 3), expected_compensation: 8000 + i * 500, posting_date: day(-15 - i * 4), requested_by: `DDT-HR-${pad(i + 1)}`, status: i < 2 ? "Pending" : i < 5 ? "Open & Approved" : "Filled", description: "طلب توظيف لتغطية الخطة" }));
  const STAGES = ["Open", "Open", "Shortlisted", "Shortlisted", "Replied", "Hold", "Rejected", "Accepted"] as const; const SOURCES = ["Campaign", "Employee Referral", "Walk In", "Website Listing", "LinkedIn"];
  for (let i = 1; i <= 40; i++) { const p = person(600 + i); put("Job Applicant", `HRD-JA-${pad(i)}`, { applicant_name: fullAr(p), __name_en: { applicant_name: fullEn(p) }, email_id: `applicant${i}@mail.example.test`, job_title: openings[i % openings.length], designation: NEW_DEPTS[i % 4]![3], status: STAGES[i % STAGES.length], source: SOURCES[i % SOURCES.length], creation: `${day(-(i % 35) - 1)}T09:00:00.000Z` }); }
  for (let i = 1; i <= 14; i++) { const ja = `HRD-JA-${pad(i * 2)}`; const when = day(i <= 9 ? i - 3 : i); put("Interview", `HRD-INT-${pad(i)}`, { interview_round: "First Interview", job_applicant: ja, job_opening: adapter.get("Job Applicant", ja)?.["job_title"], scheduled_on: when, from_time: `${9 + (i % 6)}:00:00`, to_time: `${10 + (i % 6)}:00:00`, status: when < T ? (i % 3 ? "Cleared" : "Rejected") : "Pending", interview_details: [{ idx: 1, interviewer: "hr.manager@ddt.example.test" }] }); }
  ([["HRD-JA-008", "Accepted", -25], ["HRD-JA-016", "Accepted", -12], ["HRD-JA-024", "Awaiting Response", -3], ["HRD-JA-032", "Awaiting Response", -1], ["HRD-JA-040", "Rejected", -8], ["HRD-JA-004", "Accepted", -40]] as const).forEach(([ja, st, k], i) => put("Job Offer", `HRD-JOF-${pad(i + 1)}`, { job_applicant: ja, applicant_name: adapter.get("Job Applicant", ja)?.["applicant_name"], designation: adapter.get("Job Applicant", ja)?.["designation"], company: C1, offer_date: day(k), status: st }));
  H.filter((e) => e.join >= day(-120)).forEach((e, i) => { const b = e.join; put("Employee Onboarding", `HRD-EOB-${pad(i + 1)}`, { employee: e.id, employee_name: e.ar, company: C1, department: e.dept, designation: e.desig, date_of_joining: e.join, boarding_begins_on: addDays(b, -5), boarding_status: i % 4 === 3 ? "Completed" : i % 2 ? "In Process" : "Pending", job_offer: i < 3 ? `HRD-JOF-${pad([1, 2, 6][i]!)}` : undefined,
    activities: [["IT account and laptop", "System Manager", 0], ["Bank account and IBAN", "HR User", 3], ["Safety induction", "HR User", 5], ["Medical insurance enrolment", "HR User", 10]].map(([a, role, k], j) => ({ idx: j + 1, activity_name: a, role, due_date: addDays(b, Number(k)), completed: i % 4 === 3 || j === 0 || addDays(b, Number(k)) > T ? (i % 4 === 3 || j === 0 ? 1 : 0) : 0 })), docstatus: 1 });
    if (i < 3) put("DIGIT Onboarding Invite", `HRD-DOI-${pad(i + 1)}`, { employee_onboarding: `HRD-EOB-${pad(i + 1)}`, employee_name: e.ar, company: C1, invite_status: (["Active", "Submitted", "Applied"] as const)[i], expires_on: `${day(7 - i * 3)} 23:59:00`, personal_email: `new.joiner${i + 1}@mail.example.test` }); });
  H.filter((e) => !e.left).forEach((e, i) => { if (i % 4) return; ([["Customer satisfaction", 70], ["Process improvement", 40], ["Learning plan", 55]] as const).forEach(([g, prog], j) => put("Goal", `HRD-GOL-${pad(i)}-${j}`, { employee: e.id, employee_name: e.ar, company: C1, goal_name: g, kra: g, progress: Math.min(100, prog + (i % 5) * 10), status: prog + (i % 5) * 10 >= 100 ? "Completed" : "In Progress", start_date: `${T.slice(0, 4)}-01-01`, end_date: `${T.slice(0, 4)}-12-31`, is_group: 0 })); });
  const SK: Record<string, string[]> = { "Customer Service": ["Customer Care", "Arabic Writing"], Logistics: ["Forklift", "Excel"], Procurement: ["Negotiation", "Excel"], Marketing: ["Excel", "Arabic Writing"], Legal: ["Contract Law", "Arabic Writing"], Quality: ["Quality Audit", "Safety"] };
  const PROF = ["Beginner", "Intermediate", "Advanced", "Expert"] as const;
  H.filter((e) => !e.left).forEach((e, i) => { (SK[e.dept.replace(/ - DDT$/, "")] ?? ["Excel"]).forEach((sk, j) => put("DIGIT Skills Matrix", `HRD-DSM-${pad(i + 1)}-${j}`, { employee: e.id, employee_name: e.ar, company: C1, skill: sk, proficiency: PROF[(i + j * 2) % 4], assessed_on: day(-((i * 9) % 200)) })); });
  dccAll.slice(0, 40).forEach((e, i) => ["Safety", i % 2 ? "Welding" : "Scaffolding"].forEach((sk, j) => put("DIGIT Skills Matrix", `HRD-DSM-C${pad(i + 1)}-${j}`, { employee: e.name, employee_name: e["employee_name"], company: C2, skill: sk, proficiency: PROF[(i * 3 + j) % 4], assessed_on: day(-((i * 7) % 180)) })));
  ([["Customer Excellence", "تميز خدمة العملاء"], ["Negotiation Skills", "مهارات التفاوض"], ["Site Safety Induction", "التهيئة للسلامة في المواقع"], ["Saudi Labour Law Essentials", "أساسيات نظام العمل السعودي"], ["Leadership Foundations", "أسس القيادة"], ["Quality Auditing", "تدقيق الجودة"]] as const).forEach(([p, ar], i) => { put("Training Program", p, { training_program: p, description: ar, company: C1, status: "Scheduled" }); put("DIGIT Learning Path", `HRD-DLP-${pad(i + 1)}`, { path_name: `${p} path`, job_profile: `HRD-DJP-${pad((i % 6) + 1)}`, training_program: p, duration_days: 10 + i * 5, path_status: i === 5 ? "Draft" : "Published" }); });
  ([["Customer Excellence", -60, "Completed"], ["Site Safety Induction", -20, "Completed"], ["Saudi Labour Law Essentials", 9, "Scheduled"], ["Leadership Foundations", 21, "Scheduled"]] as const).forEach(([p, k, st], i) => put("Training Event", `HRD-TEV-${pad(i + 1)}`, { event_name: `${p} — ${day(k).slice(0, 7)}`, training_program: p, company: i === 1 && C2 ? C2 : C1, event_status: st, start_time: at(day(k), 9), end_time: at(day(k), 15), type: "Workshop", employees: (i === 1 ? dccAll.slice(0, 18).map((e) => ({ employee: e.name, employee_name: e["employee_name"] })) : H.filter((e) => !e.left).slice(i * 9, i * 9 + 12).map((e) => ({ employee: e.id, employee_name: e.ar }))).map((x, j) => ({ idx: j + 1, ...x, attendance: st === "Completed" ? (j % 7 === 3 ? "Absent" : "Present") : "Mandatory" })), docstatus: 1 }));
  [...posOf.entries()].slice(0, 14).forEach(([emp, pos], i) => { const successor = H.filter((e) => !e.left && e.id !== emp)[(i * 5 + 3) % 70]; if (successor) put("DIGIT Succession Plan", `HRD-DSP-${pad(i + 1)}`, { position: pos, successor: successor.id, successor_name: successor.ar, readiness: (["Ready Now", "1-2 Years", "3+ Years"] as const)[i % 3], risk_of_loss: (["Low", "Medium", "High"] as const)[(i * 2) % 3], development_notes: "خطة تطوير قيادية" }); });
  H.filter((e) => !e.left).slice(0, 18).forEach((e, i) => put("DIGIT Compensation Review", `HRD-DCR-${pad(i + 1)}`, { employee: e.id, employee_name: e.ar, company: C1, review_date: day(-(i * 6) - 2), review_reason: (["Annual", "Promotion", "Market Adjustment", "Correction"] as const)[i % 4], current_base: e.base, proposed_base: Math.round(e.base * (1 + [0.05, 0.12, 0.08, 0.03, 0.18][i % 5]!)), docstatus: i % 3 === 0 ? 0 : 1 }));

  /* ---------------------------------------------------------------- movements and exits */
  H.filter((e) => !e.left).slice(10, 16).forEach((e, i) => put("Employee Transfer", `HRD-ETR-${pad(i + 1)}`, { employee: e.id, employee_name: e.ar, company: C1, department: e.dept, transfer_date: day(-(i * 13) - 5), transfer_details: [{ idx: 1, property: "Branch", current: e.branch, new: branches[(i + 1) % Math.max(1, branches.length)] }], docstatus: 1 }));
  H.filter((e) => !e.left).slice(20, 26).forEach((e, i) => put("Employee Promotion", `HRD-EPR-${pad(i + 1)}`, { employee: e.id, employee_name: e.ar, company: C1, department: e.dept, promotion_date: day(-(i * 17) - 8), promotion_details: [{ idx: 1, property: "Designation", current: e.desig, new: `Senior ${e.desig}` }], docstatus: 1 }));
  H.filter((e) => e.left).forEach((e, i) => { const rel = e.left!; put("Employee Separation", `HRD-ESP-${pad(i + 1)}`, { employee: e.id, employee_name: e.ar, company: C1, department: e.dept, digit_separation_type: (["Voluntary", "Involuntary", "End of Contract", "Voluntary", "Retirement"] as const)[i % 5], digit_regretted: i % 3 === 0 ? 1 : 0, boarding_begins_on: addDays(rel, -30), resignation_letter_date: addDays(rel, -30), boarding_status: "Completed", exit_interview: "Done", docstatus: 1,
      activities: [["Return laptop and access card", "IT"], ["Close system accounts", "IT"], ["Return site PPE and tools", "Stock User"], ["Settle advances and petty cash", "Accounts User"], ["Hand over files and duties", "HR User"]].map(([a, r], k) => ({ idx: k + 1, activity_name: a, role: r })) });
    put("Exit Interview", `HRD-EXI-${pad(i + 1)}`, { employee: e.id, employee_name: e.ar, company: C1, date: addDays(rel, -3), status: "Completed", employee_status: i ? "Exit Confirmed" : "Exit Confirmed", reference_document_name: `HRD-ESP-${pad(i + 1)}` });
    const emp = adapter.get("Employee", e.id); if (emp) { const years = Math.max(0, daysBetween(e.join, rel) / 365.25); const wage = e.base * 0.85; const full = r2(wage * (Math.min(years, 5) * 0.5 + Math.max(years - 5, 0))); const share = i === 0 ? (years < 2 ? 0 : years < 5 ? 1 / 3 : years < 10 ? 2 / 3 : 1) : 1; put("Gratuity", `HRD-GRA-${pad(i + 1)}`, { employee: e.id, employee_name: e.ar, company: C1, posting_date: addDays(rel, 5), current_work_experience: Math.floor(years), amount: r2(full * share), status: "Paid", docstatus: 1 }); const eos = r2(full * share); const leaveDays = 6 + (i % 9); const leavePay = r2((wage / 30) * leaveDays); const lastSal = r2(e.base * 0.85 * 0.5); const adv = i % 2 ? 2500 : 0;
      put("Full and Final Statement", `HRD-FNF-${pad(i + 1)}`, { employee: e.id, employee_name: e.ar, company: C1, transaction_date: addDays(rel, 7), date_of_joining: e.join, relieving_date: rel, department: e.dept, status: "Paid", docstatus: 1,
        payables: [{ idx: 1, component: "Gratuity", reference_document_type: "Gratuity", reference_document: `HRD-GRA-${pad(i + 1)}`, amount: eos, status: "Settled" }, { idx: 2, component: "Leave Encashment", amount: leavePay, status: "Settled", remark: `${leaveDays} days` }, { idx: 3, component: "Salary (final month)", amount: lastSal, status: "Settled" }],
        receivables: adv ? [{ idx: 1, component: "Employee Advance", amount: adv, status: "Settled" }] : [], total_payable_amount: r2(eos + leavePay + lastSal), total_receivable_amount: adv }); } });
  H.filter((e) => !e.left).slice(40, 42).forEach((e, i) => put("Employee Separation", `HRD-ESP-${pad(10 + i)}`, { employee: e.id, employee_name: e.ar, company: C1, department: e.dept, digit_separation_type: "Voluntary", digit_regretted: i, boarding_begins_on: day(-5 + i * 3), resignation_letter_date: day(-12 + i * 2), boarding_status: "Pending", docstatus: 0 }));
  ([["Overtime not paid on time", "Open"], ["Manager conduct", "Investigated"], ["Housing allowance clarification", "Resolved"], ["Shift allocation fairness", "Open"], ["Workplace safety concern", "Resolved"]] as const).forEach(([sub, st], i) => { const e = active[(i * 17) % active.length]!; put("Employee Grievance", `HRD-EGR-${pad(i + 1)}`, { subject: sub, raised_by: e.id, employee_name: e.name, company: e.co, date: day(-(i * 9) - 2), grievance_against_party: "Department", status: st, description: sub }); });
  { const a = active[11]!, b = active[29]!; put("Employee Grievance", "HRD-EGR-006", { subject: "تكرار التأخر عن الدوام دون عذر", raised_by: a.id, employee_name: a.name, company: b.co, date: day(-20), grievance_against_party: "Employee", grievance_against: b.id, status: "Resolved", resolved_by: "hr.manager@ddt.example.test", resolution_date: day(-12),
    description: "تأخر الموظف عن بداية الدوام أكثر من 15 دقيقة في ست مناسبات خلال شهر دون عذر مقبول، وفق سجل الحضور.", resolution_detail: "بعد سماع أقوال الموظف تقرر توجيه إنذار كتابي أول وفق لائحة تنظيم العمل." }); }

  /* ---------------------------------------------------------------- service cases, bank changes, delegation, notifications, integrations */
  const CATS = ["HR Letter", "Payroll Query", "Leave Query", "Document Request", "IT & Access", "Confidential"] as const; const SEV = ["Low", "Medium", "Medium", "High", "Critical"] as const;
  for (let i = 1; i <= 60; i++) { const e = active[(i * 7) % active.length]!; const cat = CATS[i % 6]!; const opened = day(-((i * 11) % 120)); const sla = cat === "IT & Access" ? 1 : cat === "Document Request" ? 3 : 2; const due = addDays(opened, sla); const age = daysBetween(opened, T);
    const st = age > 20 ? (i % 6 === 0 ? "Closed" : "Resolved") : age > 6 ? (i % 3 ? "Resolved" : "In Progress") : (["Open", "Assigned", "In Progress"] as const)[i % 3]; const resolved = st === "Resolved" || st === "Closed" ? addDays(opened, sla + ((i % 5) - 2)) : "";
    put("DIGIT HR Service Case", `HRD-DSC-${pad(i)}`, { subject: `${cat} — ${e.name}`, employee: e.id, employee_name: e.name, company: e.co, category: cat, service_item: `HRD-SCI-${pad((i % 10) + 1)}`, severity: SEV[i % 5], case_status: st, opened_on: opened, due_at: `${due} 17:00:00`, assigned_to: st === "Open" && i % 2 ? "" : i % 2 ? "payroll@ddt.example.test" : "hr.manager@ddt.example.test", resolved_on: resolved, resolution_notes: resolved ? "تمت المعالجة وإبلاغ الموظف" : "", modified: resolved ? `${resolved}T12:00:00.000Z` : `${opened}T10:00:00.000Z` }); }
  H.filter((e) => !e.left).slice(30, 35).forEach((e, i) => put("DIGIT Bank Change Request", `HRD-DBC-${pad(i + 1)}`, { employee: e.id, employee_name: e.ar, company: C1, request_status: (["Submitted", "Submitted", "Submitted", "Approved", "Applied"] as const)[i], reason: "تغيير البنك المستلم للراتب", new_bank_name: BANKS[(i + 2) % BANKS.length]![1], new_iban: iban(500 + i).iban, previous_account_masked: "SA•• •••• •••• 4821", creation: `${day(-(i * 3) - 1)}T09:00:00.000Z` }));
  put("DIGIT HR Approval Delegation", "HRD-DAD-001", { delegator: "line.manager@ddt.example.test", delegate: "hr.manager@ddt.example.test", company: C1, from_date: day(-2), to_date: day(10), delegation_status: "Active", reason: "إجازة سنوية للمدير المباشر" });
  put("DIGIT HR Approval Delegation", "HRD-DAD-002", { delegator: "hr.manager@ddt.example.test", delegate: "payroll@ddt.example.test", company: C1, from_date: day(-60), to_date: day(-45), delegation_status: "Revoked", reason: "مهمة عمل خارجية" });
  for (let i = 1; i <= 24; i++) { const u = USERS[i % 4]![0]; const ref = i % 3 === 0 ? ["DIGIT HR Service Case", `HRD-DSC-${pad(i)}`] : i % 3 === 1 ? ["Leave Application", `HRD-LAP-${pad(i, 4)}`] : ["Payroll Entry", `HRD-PAY-DDT-${cm}`];
    put("Notification Log", `HRD-NTF-${pad(i)}`, { for_user: u, type: i % 4 ? "Alert" : "Assignment", subject: i % 3 === 0 ? "A service case was assigned to you" : i % 3 === 1 ? "A leave request waits for your approval" : "Payroll preflight found blockers", subject_ar: i % 3 === 0 ? "أُسندت إليك حالة خدمة" : i % 3 === 1 ? "طلب إجازة بانتظار اعتمادك" : "الفحص المسبق للرواتب وجد معوقات", document_type: ref[0], document_name: ref[1], read: i % 3 === 0 ? 1 : i % 5 === 0 ? 1 : 0, creation: `${day(-(i % 12))}T08:30:00.000Z` }); }
  ([["Salary certificate email", "hr.letters@ddt.example.test", "SMTP 550 mailbox unavailable"], ["Payslip email", "contractor.mail@external.example.test", "Recipient address rejected"], ["Leave approval email", "line.manager@ddt.example.test", "Connection timed out"]] as const).forEach(([sub, to, err], i) => put("Email Queue", `HRD-EQ-${pad(i + 1)}`, { subject: sub, sender: "hr@ddt.example.test", recipients: [{ idx: 1, recipient: to, status: "Error" }], message: sub, status: "Error", error: err, reference_doctype: "Employee", creation: `${day(-(i + 1))}T07:00:00.000Z` }));
  const INTS: [string, "Inbound" | "Outbound"][] = [["GOSI", "Outbound"], ["WPS / Mudad", "Outbound"], ["Qiwa contracts", "Outbound"], ["Muqeem Iqama", "Inbound"], ["Bank salary file", "Outbound"], ["Accounting posting", "Outbound"], ["Biometric devices", "Inbound"]];
  for (let i = 1; i <= 48; i++) { const [nm, dir] = INTS[i % INTS.length]!; const failed = i % 9 === 4 || (nm === "Muqeem Iqama" && i % 4 === 0); const queued = !failed && i % 17 === 0;
    put("DIGIT HR Integration Log", `HRD-DIL-${pad(i)}`, { integration: nm, direction: dir, log_status: failed ? "Failed" : queued ? "Queued" : "Success", logged_at: `${day(-((i * 5) % 29))} ${String(6 + (i % 12)).padStart(2, "0")}:15:00`, reference: nm === "GOSI" ? `HRD-PAY-DDT-${months[5]}` : nm === "Biometric devices" ? devices[i % 5] : `REF-${pad(i, 5)}`, message: failed ? (nm === "Muqeem Iqama" ? "Iqama number not found for 2 employees" : nm === "GOSI" ? "Contribution file rejected: wage below minimum for 1 employee" : "Remote service did not respond in 30 seconds") : queued ? "Waiting for the next transfer window" : "Accepted" }); }
  // owner round H1-05: saved changes of a few profiles (Version rows, old → new ending at today's value), so Employee 360
  // shows real edits; a row is added only when the record still holds the final value (an edited record is left alone)
  const ver = (n: number, dt: string, name: string, at0: string, owner: string, changed: [string, string, string][]) => {
    const doc = adapter.get(dt, name); if (!doc || changed.some(([f, , to]) => s(doc[f]) !== to)) return;
    put("Version", `HRD-VER-${pad(n, 4)}`, { ref_doctype: dt, docname: name, data: JSON.stringify({ changed }), owner, creation: at0, modified: at0 });
  };
  const e1 = adapter.get("Employee", "DCC-EMP-001");
  if (e1 && s(e1["cell_number"])) {
    ver(1, "Employee", "DCC-EMP-001", `${day(-41)}T08:12:00.000Z`, "site.hr@dcc.example.test", [["department", "", s(e1["department"])], ["reports_to", "", s(e1["reports_to"])], ["employment_type", "", s(e1["employment_type"])], ["nationality", "", s(e1["nationality"])], ["cell_number", "", "0501184420"]]);
    ver(2, "Employee", "DCC-EMP-001", `${day(-9)}T10:40:00.000Z`, "site.hr@dcc.example.test", [["cell_number", "0501184420", s(e1["cell_number"])]]);
  }
  H.filter((e) => !e.left).slice(4, 16).forEach((e, i) => { const d = adapter.get("Employee", e.id); if (!d) return; const cell = s(d["cell_number"]); const br = s(d["branch"]);
    const other = branches.find((b) => b && b !== br); const ch: [string, string, string][] = [["cell_number", `05${String(40000000 + i * 3571).slice(0, 8)}`, cell], ...(other && i % 2 === 0 ? [["branch", other, br] as [string, string, string]] : [])];
    ver(10 + i, "Employee", e.id, `${day(-(12 + i * 9))}T09:${pad(10 + i, 2)}:00.000Z`, "hr.manager@ddt.example.test", ch); });
  // the leave ledger of the sample allocations and approved applications through the native ledger path (memory-only here)
  ensureLeaveLedger();

}

const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
void rng;
