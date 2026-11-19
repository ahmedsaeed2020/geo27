/**
 * Memory-only HR sample volume for the trading demo company (DDT): 60 more employees across the six departments,
 * attendance and check-ins, leave, expenses, advances, requests, payroll January–September, recruitment, appraisals and
 * training. Payroll accrual journals are written by the ERP layer from the monthly gross returned here, so salary
 * slips and the ledger agree.
 */
import { adapter } from "@/lib/adapter";
import { addDays, CUTOFF, daysBetween, exists, fyOf, iso, LAST, monthEnd, pad, R, r2, START, workdays, ymd, type Rec } from "./kit";
import { fullAr, fullEn, person, type Person } from "./names";

const A = "DDT";
const V = `${A}-V`;
const tag = { __synthetic: 1, __sample: "volume" } as const;
const DEPTS = ["Sales", "Finance", "Warehouse", "HR", "IT", "Operations"] as const;
const DESIG: Record<string, [string, string]> = { Sales: ["Sales Manager", "Sales Executive"], Finance: ["Finance Manager", "Accountant"], Warehouse: ["Warehouse Supervisor", "Storekeeper"], HR: ["HR Manager", "HR Officer"], IT: ["IT Manager", "Systems Engineer"], Operations: ["Operations Manager", "Technician"] };
const HOLIDAYS = new Set(["2026-02-22", "2026-03-20", "2026-03-21", "2026-03-22", "2026-05-26", "2026-05-27", "2026-05-28", "2026-09-23"]);

interface Emp { id: string; nameAr: string; nameEn: string; dept: string; base: number; join: string; night: boolean; p: Person | null }

const slipFor = (base: number) => { const bs = base * 0.6, ha = base * 0.25, ta = base * 0.15; const gosi = r2((bs + ha) * 0.0975); const gross = r2(bs + ha + ta); return { bs, ha, ta, gosi, gross, net: r2(gross - gosi) }; };

export interface HrVolume { records: Rec[]; payroll: Map<number, number> }
export function hrVolume(): HrVolume {
  const out: Rec[] = []; const payroll = new Map<number, number>();
  const C = R("Company", "Digit Demo Trading Co."); if (!exists("Company", C)) return { records: out, payroll };
  const dept = (d: string) => `${d} - ${A}`;
  const holidayList = R("Holiday List", `KSA 2026 - ${A}`);
  const branches = ["الفرع أ", "المقر الرئيسي"].filter((b) => exists("Branch", b));

  // ---------------------------------------------------------------- employees
  const base: Emp[] = [];
  for (let i = 1; i <= 30; i++) {
    const id = `${A}-EMP-${pad(i, 3)}`; const d = adapter.get("Employee", id); if (!d || d["status"] !== "Active") continue;
    const en = (d["__name_en"] as Record<string, string> | undefined)?.["employee_name"] ?? String(d["employee_name"]);
    base.push({ id, nameAr: String(d["employee_name"] ?? id), nameEn: en, dept: DEPTS[(i - 1) % 6]!, base: 8000 + i * 650, join: String(d["date_of_joining"] ?? "2020-01-01"), night: i % 5 === 0, p: null });
  }
  const fresh: Emp[] = [];
  for (let i = 1; i <= 60; i++) {
    const p = person(i); const dpt = DEPTS[(i * 5) % 6]!; const join = i <= 46 ? `20${19 + (i % 7)}-${pad(1 + (i % 12), 2)}-01` : ymd(1 + ((i - 47) % 9), 1);
    fresh.push({ id: `${V}-EMP-${pad(i, 3)}`, nameAr: fullAr(p), nameEn: fullEn(p), dept: dpt, base: 4800 + ((i * 397) % 58) * 100, join: join > CUTOFF ? START : join, night: i % 6 === 0, p });
  }
  const left = new Set([`${V}-EMP-017`, `${V}-EMP-039`]);
  fresh.forEach((e, i) => {
    const p = e.p!; const mgr = `${A}-EMP-${pad(DEPTS.indexOf(e.dept as (typeof DEPTS)[number]) + 1, 3)}`;
    out.push(["Employee", e.id, { first_name: p.first[1], last_name: p.last[1], employee_name: e.nameAr, company: C, status: left.has(e.id) ? "Left" : "Active", ...(left.has(e.id) ? { relieving_date: monthEnd(LAST - 3), reason_for_leaving: "استقالة" } : {}), gender: p.female ? "Female" : "Male", date_of_birth: `19${78 + (i % 22)}-${pad(1 + (i % 12), 2)}-${pad(1 + (i % 27), 2)}`, date_of_joining: e.join, department: dept(e.dept), designation: DESIG[e.dept]![1], reports_to: exists("Employee", mgr) ? mgr : "", holiday_list: holidayList, default_shift: e.night ? "Night Shift" : "Day Shift", ...(branches.length ? { branch: branches[i % branches.length] } : {}), company_email: `${p.first[0].toLowerCase()}.${p.last[0].toLowerCase().replace(/[^a-z]/g, "")}${i}@ddt.example.test`, ...(left.has(e.id) ? {} : { user_id: `${p.first[0].toLowerCase()}.${p.last[0].toLowerCase().replace(/[^a-z]/g, "")}${i}@ddt.example.test` }), cell_number: `+96656${pad(4100000 + i * 5113, 7)}`, iban: `SA${pad(40 + i, 2)}8000000060801099${pad(i, 4)}`, ctc: e.base * 12, employment_type: i % 9 === 0 ? "Contract" : "Full-time", nationality: i % 4 === 0 ? "" : "Saudi Arabia", creation: iso(e.join < START ? ymd(1, 2) : e.join), __name_en: { employee_name: e.nameEn, first_name: p.first[0], last_name: p.last[0] }, ...tag }]);
    // owner HR-02: active sample employees have their self-service user account (Employee role), linked through user_id
    if (!left.has(e.id)) out.push(["User", `${p.first[0].toLowerCase()}.${p.last[0].toLowerCase().replace(/[^a-z]/g, "")}${i}@ddt.example.test`, { email: `${p.first[0].toLowerCase()}.${p.last[0].toLowerCase().replace(/[^a-z]/g, "")}${i}@ddt.example.test`, first_name: p.first[1], last_name: p.last[1], full_name: e.nameAr, enabled: 1, user_type: "System User", language: "ar", roles: [{ idx: 1, role: "Employee" }], ...tag }]);
  });
  const active = fresh.filter((e) => !left.has(e.id));
  const all = [...base, ...active];
  const empRow = (e: Emp) => ({ employee: e.id, employee_name: e.nameAr, __name_en: { employee_name: e.nameEn } });

  // ---------------------------------------------------------------- shifts, attendance, check-ins
  active.forEach((e, i) => out.push(["Shift Assignment", `${V}-SAS-${pad(i + 1, 3)}`, { ...empRow(e), shift_type: e.night ? "Night Shift" : "Day Shift", start_date: ymd(LAST, 1), end_date: monthEnd(LAST), status: "Active", docstatus: 1, company: C, department: dept(e.dept), ...tag }]));
  let att = 0, chk = 0;
  const mark = (e: Emp, from: string, i: number, withCheckins: boolean) => {
    for (const ds of workdays(from < e.join ? e.join : from, CUTOFF)) {
      if (HOLIDAYS.has(ds)) continue;
      const x = (i * 31 + Number(ds.slice(8)) * 7 + Number(ds.slice(5, 7))) % 37;
      const status = x === 0 ? "Absent" : x === 1 ? "On Leave" : x === 2 ? "Half Day" : x === 3 ? "Work From Home" : "Present";
      att++; out.push(["Attendance", `${V}-ATT-${pad(att, 5)}`, { ...empRow(e), attendance_date: ds, status, company: C, department: dept(e.dept), shift: e.night ? "Night Shift" : "Day Shift", late_entry: x === 4 || x === 9 ? 1 : 0, early_exit: x === 11 ? 1 : 0, docstatus: 1, creation: iso(ds, 18), ...tag }]);
      if (withCheckins && (status === "Present" || status === "Half Day")) {
        chk++; const inM = 30 + (x % 25); const outH = e.night ? (status === "Half Day" ? 1 : 6) : status === "Half Day" ? 12 : 17;
        const inH = e.night ? 21 : inM >= 60 ? 9 : 7; const outDay = e.night ? addDays(ds, 1) : ds;
        out.push(["Employee Checkin", `${V}-CHK-${pad(chk, 5)}-I`, { ...empRow(e), log_type: "IN", time: `${ds} ${String(inH).padStart(2, "0")}:${pad(inM % 60, 2)}:00`, device_id: x % 3 ? "BIO-KHOBAR-01" : "PWA-SIM", shift: e.night ? "Night Shift" : "Day Shift", ...tag }]);
        out.push(["Employee Checkin", `${V}-CHK-${pad(chk, 5)}-O`, { ...empRow(e), log_type: "OUT", time: `${outDay} ${String(outH).padStart(2, "0")}:${pad(5 + (x % 50), 2)}:00`, device_id: x % 3 ? "BIO-KHOBAR-01" : "PWA-SIM", shift: e.night ? "Night Shift" : "Day Shift", ...tag }]);
      }
    }
  };
  base.forEach((e, i) => mark(e, ymd(LAST - 1, 1), i, i < 6));
  active.forEach((e, i) => mark(e, ymd(LAST - 2, 1), 100 + i, i < 18));

  // ---------------------------------------------------------------- leave
  active.forEach((e, i) => ["Annual Leave", "Sick Leave"].forEach((t, j) => out.push(["Leave Allocation", `${V}-LAL-${pad(i + 1, 3)}-${j}`, { ...empRow(e), leave_type: t, from_date: `${fyOf(CUTOFF)}-01-01`, to_date: `${fyOf(CUTOFF)}-12-31`, new_leaves_allocated: j ? 30 : 21 + (i % 9), total_leaves_allocated: j ? 30 : 21 + (i % 9), company: C, docstatus: 1, ...tag }])));
  for (let k = 1; k <= 130; k++) {
    const e = all[(k * 7) % all.length]!; const from = addDays(ymd(1, 11), Math.floor((k / 130) * daysBetween(ymd(1, 11), addDays(CUTOFF, 20)))); const len = 1 + (k % 6);
    const future = from > CUTOFF; const st = future ? (k % 3 ? "Open" : "Approved") : ["Approved", "Approved", "Approved", "Rejected", "Cancelled", "Approved"][k % 6]!;
    // a pending request was sent two to five days ago (owner rule: no request waits for months); decided ones a week before the leave
    const asked = st === "Open" ? addDays(CUTOFF, -(2 + (k % 4))) : addDays(from, -7) > CUTOFF ? CUTOFF : addDays(from, -7);
    out.push(["Leave Application", `${V}-LAP-${pad(k, 3)}`, { ...empRow(e), leave_type: ["Annual Leave", "Sick Leave", "Casual Leave", "Annual Leave", "Hajj Leave"][k % 5], from_date: from, to_date: addDays(from, len - 1), total_leave_days: len, status: st, docstatus: st === "Open" ? 0 : st === "Cancelled" ? 2 : 1, leave_approver: "hr.manager@ddt.example.test", description: ["إجازة سنوية مع العائلة", "مراجعة طبية", "ظرف عائلي طارئ", "سفر", "أداء فريضة الحج"][k % 5], company: C, department: dept(e.dept), posting_date: asked, creation: iso(asked), modified: iso(asked), ...tag }]);
  }

  // ---------------------------------------------------------------- expenses, advances, requests
  const TYPES = ["Travel", "Accommodation", "Meals", "Fuel", "Telecom"];
  const DESC = ["تذاكر سفر لزيارة عميل", "إقامة فندقية أثناء التركيب", "وجبات فريق العمل", "وقود سيارة المبيعات", "باقة اتصالات شهرية"];
  for (let k = 1; k <= 110; k++) {
    const e = all[(k * 5) % all.length]!; const d = addDays(ymd(1, 8), Math.floor((k / 110) * daysBetween(ymd(1, 8), CUTOFF))); const amt = 120 + ((k * 337) % 2900); const age = daysBetween(d, CUTOFF);
    const ap = age < 6 ? "Draft" : ["Approved", "Approved", "Rejected", "Approved", "Approved"][k % 5]!;
    out.push(["Expense Claim", `${V}-EXC-${pad(k, 3)}`, { ...empRow(e), posting_date: d, approval_status: ap, status: ap === "Rejected" ? "Rejected" : ap === "Approved" ? (age > 20 ? "Paid" : "Unpaid") : "Draft", docstatus: ap === "Draft" ? 0 : 1, currency: "SAR", department: dept(e.dept), expenses: [{ idx: 1, expense_type: TYPES[k % 5], description: DESC[k % 5], amount: amt, sanctioned_amount: ap === "Approved" ? amt : 0, expense_date: addDays(d, -2) }], total_claimed_amount: amt, total_sanctioned_amount: ap === "Approved" ? amt : 0, grand_total: ap === "Approved" ? amt : 0, total_amount_reimbursed: ap === "Approved" && age > 20 ? amt : 0, company: C, expense_approver: "finance.manager@ddt.example.test", creation: iso(d), ...tag }]);
  }
  for (let k = 1; k <= 26; k++) {
    const e = all[(k * 11) % all.length]!; const d = addDays(ymd(1, 15), k * 10); if (d > CUTOFF) break; const amt = 1500 + (k % 6) * 1000;
    out.push(["Employee Advance", `${V}-EAD-${pad(k, 3)}`, { ...empRow(e), posting_date: d, currency: "SAR", purpose: ["سلفة سفر", "سلفة سكن", "رسوم دورة تدريبية", "سلفة علاج", "سلفة طارئة"][k % 5], advance_amount: amt, paid_amount: k % 4 ? amt : 0, claimed_amount: k % 3 === 0 ? amt : 0, pending_amount: k % 4 ? (k % 3 === 0 ? 0 : amt) : amt, status: k % 4 === 0 ? "Unpaid" : k % 3 === 0 ? "Claimed" : "Paid", docstatus: 1, company: C, department: dept(e.dept), creation: iso(d), ...tag }]);
  }
  for (let k = 1; k <= 22; k++) {
    const e = active[(k * 3) % active.length]!; const d = addDays(CUTOFF, -47 + k * 2); if (d > CUTOFF) break;
    out.push(["Attendance Request", `${V}-ATR-${pad(k, 3)}`, { ...empRow(e), from_date: d, to_date: addDays(d, k % 3), reason: ["Work From Home", "On Duty"][k % 2], explanation: ["زيارة موقع عميل", "عمل عن بعد لظرف خاص", "مهمة رسمية خارج المكتب"][k % 3], docstatus: k % 4 ? 1 : 0, company: C, department: dept(e.dept), creation: iso(d), ...tag }]);
    out.push(["Shift Request", `${V}-SHR-${pad(k, 3)}`, { ...empRow(e), shift_type: k % 2 ? "Night Shift" : "Day Shift", from_date: addDays(d, 5), to_date: addDays(d, 9), status: ["Draft", "Approved", "Approved", "Rejected"][k % 4], docstatus: k % 4 === 0 ? 0 : 1, company: C, department: dept(e.dept), approver: "hr.manager@ddt.example.test", creation: iso(d), ...tag }]);
  }

  // ---------------------------------------------------------------- payroll (HQ = existing staff Jan–Jul, branches = new staff Jan–Sep)
  const structure = "DDT Monthly 2026";
  active.forEach((e, i) => out.push(["Salary Structure Assignment", `${V}-SSA-${pad(i + 1, 3)}`, { ...empRow(e), salary_structure: structure, from_date: e.join > START ? e.join : START, base: e.base, currency: "SAR", company: C, docstatus: 1, ...tag }]));
  const leftOn = (e: Emp) => (left.has(e.id) ? monthEnd(LAST - 3) : "");
  for (let m = 1; m <= LAST - 2; m++) { // closed months; the HR product demo runs the latest payrolls
    const end = monthEnd(m); const start = ymd(m, 1);
    for (const [key, group, label] of [["HQ", m <= LAST - 4 ? base : [], "المقر الرئيسي"], ["BR", fresh, "الفروع"]] as const) {
      const emps = (group as readonly Emp[]).filter((e) => e.join <= end && (!leftOn(e) || leftOn(e) >= start)); if (!emps.length) continue;
      const pe = `${V}-PAY-${key}-${ymd(m, 1).slice(0, 7)}`; let gross = 0, net = 0;
      emps.forEach((e) => {
        const s = slipFor(e.base); const days = e.join > start ? Math.max(1, 22 - Math.round(daysBetween(start, e.join) * 22 / 30)) : 22; const f = days / 22;
        const g = r2(s.gross * f), d = r2(s.gosi * f), nt = r2(g - d); gross += g; net += nt;
        out.push(["Salary Slip", `${V}-SAL-${ymd(m, 1).slice(0, 7)}-${e.id.replace(/^DDT-/, "")}`, { ...empRow(e), department: dept(e.dept), designation: DESIG[e.dept]![e.id.startsWith(V) ? 1 : 0], posting_date: end, start_date: start, end_date: end, currency: "SAR", payroll_frequency: "Monthly", salary_structure: structure, payroll_entry: pe, status: "Submitted", docstatus: 1, earnings: [{ idx: 1, salary_component: "Basic Salary", abbr: "BS", amount: r2(s.bs * f) }, { idx: 2, salary_component: "Housing Allowance", abbr: "HA", amount: r2(s.ha * f) }, { idx: 3, salary_component: "Transport Allowance", abbr: "TA", amount: r2(s.ta * f) }], deductions: [{ idx: 1, salary_component: "GOSI Employee Share", abbr: "GOSI", amount: d }], gross_pay: g, base_gross_pay: g, total_deduction: d, net_pay: nt, base_net_pay: nt, rounded_total: Math.round(nt), payment_days: days, total_working_days: 22, company: C, creation: iso(end, 20), ...tag }]);
      });
      if (key === "BR") payroll.set(m, r2(gross));
      out.push(["Payroll Entry", pe, { company: C, posting_date: end, payroll_frequency: "Monthly", start_date: start, end_date: end, currency: "SAR", payroll_payable_account: R("Account", `Salary Payable - ${A}`), cost_center: R("Cost Center", `Main - ${A}`), ...(key === "BR" && branches.length ? { branch: branches[0] } : {}), number_of_employees: emps.length, employees: emps.map((e, i) => ({ idx: i + 1, ...empRow(e), department: dept(e.dept) })), status: "Submitted", docstatus: 1, salary_slips_created: 1, salary_slips_submitted: 1, __preview_gross: r2(gross), __preview_net: r2(net), title: `رواتب ${label} — ${start.slice(0, 7)}`, creation: iso(end, 21), ...tag }]);
    }
  }

  // ---------------------------------------------------------------- recruitment
  const ITYPES: [string, string][] = [[`${V}-INT-TECH`, "مقابلة فنية"], [`${V}-INT-HR`, "مقابلة الموارد البشرية"]];
  ITYPES.forEach(([n, t]) => out.push(["Interview Type", n, { name: n, description: t, ...tag }]));
  const OPENINGS: [string, string, string][] = [["محاسب أول", "Accountant", "Finance"], ["مندوب مبيعات — جدة", "Sales Executive", "Sales"], ["أمين مستودع — الخبر", "Storekeeper", "Warehouse"], ["مهندس أنظمة", "Systems Engineer", "IT"], ["فني كهرباء", "Technician", "Operations"], ["أخصائي موارد بشرية", "HR Officer", "HR"], ["مشرف مستودع — مكة", "Warehouse Supervisor", "Warehouse"], ["مندوب مبيعات — الدمام", "Sales Executive", "Sales"], ["محلل بيانات", "Systems Engineer", "IT"], ["فني صيانة معدات", "Technician", "Operations"]];
  const SOURCES = ["Campaign", "Employee Referral", "Walk In", "Website Listing"];
  let ja = 0, iv = 0, jo = 0;
  OPENINGS.forEach(([title, desig, dpt], i) => {
    const id = `${V}-OPN-${pad(i + 1, 3)}`; const posted = ymd(1 + i, 5); const closed = i < 5;
    out.push(["Job Opening", id, { job_title: title, designation: desig, status: closed ? "Closed" : "Open", posted_on: `${posted} 09:00:00`, closes_on: addDays(posted, 45), ...(closed ? { closed_on: addDays(posted, 40) } : {}), company: C, department: dept(dpt), vacancies: 1 + (i % 3), planned_vacancies: 1 + (i % 3), publish: 1, currency: "SAR", lower_range: 6000 + i * 500, upper_range: 9000 + i * 700, salary_per: "Month", description: `<p>نبحث عن ${title} للانضمام إلى فريق ${dpt === "Sales" ? "المبيعات" : "العمل"}.</p>`, creation: iso(posted), ...tag }]);
    for (let j = 0; j < 9; j++) {
      ja++; const p = person(700 + ja); const applied = addDays(posted, 2 + j * 3); if (applied > CUTOFF) break; const age = daysBetween(applied, CUTOFF);
      const st = j === 0 && closed ? "Accepted" : age < 8 ? "Open" : ["Replied", "Rejected", "Hold", "Shortlisted", "Rejected", "Open", "Replied", "Rejected", "Shortlisted"][j]!;
      const aid = `${V}-APP-${pad(ja, 4)}`;
      out.push(["Job Applicant", aid, { applicant_name: fullAr(p), email_id: `${p.first[0].toLowerCase()}.${ja}@candidate.example.test`, phone_number: `+96655${pad(5200000 + ja * 2311, 7)}`, job_title: id, designation: desig, status: st, applicant_rating: [0.6, 0.8, 0.4, 1, 0.6][ja % 5], source: SOURCES[ja % 4], country: "Saudi Arabia", currency: "SAR", lower_range: 6000 + i * 500, upper_range: 9000 + i * 700, creation: iso(applied), __name_en: { applicant_name: fullEn(p) }, ...tag }]);
      if (j < 5 && age >= 5) {
        for (const [ti, [itype]] of ITYPES.entries()) {
          if (ti === 1 && j > 2) continue;
          iv++; const sched = addDays(applied, 5 + ti * 4) > CUTOFF ? CUTOFF : addDays(applied, 5 + ti * 4); const done = sched < CUTOFF;
          const ist = !done ? "Pending" : st === "Rejected" ? "Rejected" : st === "Accepted" || st === "Shortlisted" ? "Cleared" : "Under Review";
          out.push(["Interview", `${V}-INT-${pad(iv, 4)}`, { interview_type: itype, job_applicant: aid, job_opening: id, designation: desig, status: ist, scheduled_on: sched, from_time: `${pad(10 + ti * 2, 2)}:00:00`, to_time: `${pad(11 + ti * 2, 2)}:00:00`, expected_average_rating: 0.8, average_rating: ist === "Cleared" ? 0.85 : ist === "Rejected" ? 0.4 : 0.6, interview_summary: ist === "Cleared" ? "مرشح مناسب ويوصى بالمرحلة التالية" : ist === "Rejected" ? "لا يستوفي متطلبات الوظيفة" : "", interview_details: [{ idx: 1, interviewer: "hr.manager@ddt.example.test" }], docstatus: ist === "Cleared" || ist === "Rejected" ? 1 : 0, creation: iso(sched), ...tag }]);
        }
      }
      if ((st === "Accepted" || (st === "Shortlisted" && j === 3)) && age > 14) {
        jo++; const od = addDays(applied, 18) > CUTOFF ? CUTOFF : addDays(applied, 18);
        const ost = st === "Accepted" ? "Accepted" : age > 40 ? "Rejected" : "Awaiting Response";
        out.push(["Job Offer", `${V}-JOF-${pad(jo, 3)}`, { job_applicant: aid, applicant_name: fullAr(p), applicant_email: `${p.first[0].toLowerCase()}.${ja}@candidate.example.test`, offer_date: od, designation: desig, company: C, status: ost, docstatus: ost === "Awaiting Response" ? 0 : 1, offer_terms: [{ idx: 1, offer_term: "Probation", value: "90 يومًا" }, { idx: 2, offer_term: "Salary", value: `${7000 + i * 600} ر.س شهريًا` }], creation: iso(od), __name_en: { applicant_name: fullEn(p) }, ...tag }]);
        if (ost === "Accepted") out.push(["Employee Onboarding", `${V}-ONB-${pad(jo, 3)}`, { job_offer: `${V}-JOF-${pad(jo, 3)}`, job_applicant: aid, company: C, boarding_status: daysBetween(od, CUTOFF) > 60 ? "Completed" : "In Process", employee_name: fullAr(p), department: dept(dpt), designation: desig, holiday_list: holidayList, date_of_joining: addDays(od, 30) > CUTOFF ? CUTOFF : addDays(od, 30), boarding_begins_on: addDays(od, 20) > CUTOFF ? CUTOFF : addDays(od, 20), activities: [{ idx: 1, activity_name: "تجهيز الحاسب والبريد", user: "it@ddt.example.test", required_for_employee_creation: 0 }, { idx: 2, activity_name: "توقيع العقد وتسليم بطاقة العمل", user: "hr.manager@ddt.example.test" }, { idx: 3, activity_name: "برنامج التعريف بالشركة", user: "hr.manager@ddt.example.test" }], docstatus: 1, creation: iso(od), __name_en: { employee_name: fullEn(p) }, ...tag }]);
      }
    }
  });

  // ---------------------------------------------------------------- appraisals and training
  out.push(["Appraisal Cycle", `${V}-CYCLE-H1`, { cycle_name: `تقييم النصف الأول ${ymd(1, 1).slice(0, 4)}`, company: C, status: "Completed", start_date: ymd(1, 1), end_date: monthEnd(6), kra_evaluation_method: "Manual Rating", ...tag }]);
  out.push(["Appraisal Cycle", `${V}-CYCLE-H2`, { cycle_name: `تقييم النصف الثاني ${ymd(7, 1).slice(0, 4)}`, company: C, status: "In Progress", start_date: ymd(7, 1), end_date: monthEnd(12), kra_evaluation_method: "Manual Rating", ...tag }]);
  all.forEach((e, i) => {
    if (e.join > ymd(3, 1)) return;
    const score = r2(2.6 + ((i * 37) % 24) / 10); const self = r2(Math.min(5, score + 0.3));
    out.push(["Appraisal", `${V}-APR-H1-${pad(i + 1, 3)}`, { naming_series: "HR-APR-.YYYY.-", ...empRow(e), company: C, department: dept(e.dept), appraisal_cycle: `${V}-CYCLE-H1`, start_date: ymd(1, 1), end_date: monthEnd(6), final_score: score, total_score: score, self_score: self, avg_feedback_score: r2(score - 0.1), goal_score_percentage: Math.round(score * 20), rate_goals_manually: 1, appraisal_kra: [{ idx: 1, kra: "تحقيق المستهدفات", per_weightage: 60, goal_score: r2(score * 0.6) }, { idx: 2, kra: "جودة العمل", per_weightage: 40, goal_score: r2(score * 0.4) }], remarks: score >= 4 ? "أداء متميز" : score >= 3.2 ? "أداء جيد" : "يحتاج إلى خطة تطوير", docstatus: 1, creation: iso(ymd(7, 10)), ...tag }]);
    if (i % 3 === 0) out.push(["Appraisal", `${V}-APR-H2-${pad(i + 1, 3)}`, { naming_series: "HR-APR-.YYYY.-", ...empRow(e), company: C, department: dept(e.dept), appraisal_cycle: `${V}-CYCLE-H2`, start_date: ymd(7, 1), end_date: monthEnd(12), self_score: r2(3 + (i % 15) / 10), rate_goals_manually: 1, docstatus: 0, creation: iso(ymd(LAST - 1, 5)), ...tag }]);
  });
  const TRAIN: [string, string, string][] = [["السلامة في مواقع التركيب", "Workshop", "قاعة التدريب — الرياض"], ["خدمة العملاء المتميزة", "Seminar", "عن بُعد"], ["إدارة المخزون في DIGIT", "Workshop", "مستودع الخبر"], ["أساسيات ضريبة القيمة المضافة", "Seminar", "قاعة التدريب — الرياض"], ["مهارات التفاوض للمبيعات", "Workshop", "فرع جدة"], ["الإسعافات الأولية", "Theory", "مستودع مكة"], ["أمن المعلومات", "Seminar", "عن بُعد"], ["القيادة للمشرفين", "Conference", "فندق الرياض"]];
  TRAIN.forEach(([t, type, loc], i) => {
    const d = ymd(2 + i, 10 + (i % 3)); const done = d < CUTOFF; const emps = all.filter((_, j) => (j + i) % 9 === 0).slice(0, 8);
    out.push(["Training Event", `${V}-TRN-${pad(i + 1, 3)}`, { event_name: t, event_status: done ? "Completed" : "Scheduled", type, level: ["Beginner", "Intermediate", "Advance"][i % 3], company: C, trainer_name: ["د. سامي الحربي", "أ. نوف القحطاني", "م. خالد العمري"][i % 3], location: loc, start_time: `${d} 09:00:00`, end_time: `${d} 14:00:00`, introduction: `<p>برنامج تدريبي: ${t}.</p>`, has_certificate: i % 2, employees: emps.map((e, j) => ({ idx: j + 1, ...empRow(e), attendance: done ? (j % 6 ? "Present" : "Absent") : "Mandatory", status: done ? "Completed" : "Open" })), docstatus: done ? 1 : 0, creation: iso(addDays(d, -20)), ...tag }]);
  });
  return { records: out, payroll };
}
