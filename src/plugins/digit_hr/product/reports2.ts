/**
 * DIGIT HR report library R26–R42 (round 2, sheet 05 KPIC / KPIR rows and INT-15): Script Reports on the shared report
 * page like R01–R25. Each runner reads permission-scoped records with the KPI contract's formula, returns the cards as
 * `summary` (the same totals the table adds up, so card = table total = drill), and names a chart column pair the
 * section's Full reports preview draws. Undated or unclassified records are shown as such, never estimated.
 */
import type { Doc } from "@/lib/adapter";
import { col, cur, flt, type F, type RFilter, type RResult, type Row } from "@/lib/reportKit";
import { scopedList } from "../compat/scope";
import { ibanOf, identityIndex, nationalityOf, wageOf } from "./payroll";
import { policyValue } from "./settings";
import type { HrReport } from "./reports";

const s = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v));
const n = (v: unknown) => Number(v) || 0;
const r2 = (x: number) => Math.round(x * 100) / 100;
const r1 = (x: number) => Math.round(x * 10) / 10;
const d10 = (v: unknown) => s(v).slice(0, 10);
const today = () => new Date().toISOString().slice(0, 10);
const addDays = (iso: string, k: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + k * 86400000).toISOString().slice(0, 10);
const days = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
const pct = (a: number, b: number) => (b > 0 ? r2((a / b) * 100) : 0);
const L = (dt: string): Doc[] => { try { return scopedList(dt); } catch { return []; } };
const byCo = (r: Doc[], f: F) => (f["company"] ? r.filter((d) => !s(d["company"]) || d["company"] === f["company"]) : r);
const inRange = (v: unknown, from: string, to: string) => { const x = d10(v); return !!x && x >= from && x <= to; };
const activeOn = (e: Doc, on: string) => !!d10(e["date_of_joining"]) && d10(e["date_of_joining"]) <= on && (!d10(e["relieving_date"]) || d10(e["relieving_date"]) > on) && (s(e["status"]) !== "Left" || !!d10(e["relieving_date"]));
const total = (rows: Row[], keys: string[], label: Record<string, unknown>): Row => ({ ...label, is_total: true, bold: true, ...Object.fromEntries(keys.map((k) => [k, r2(rows.reduce((a, x) => a + n(x[k]), 0))])) });
const weekend = (iso: string) => { const d = new Date(`${iso}T00:00:00Z`).getUTCDay(); return d === 5 || d === 6; };
const ym = (iso: string) => iso.slice(0, 7);
const range = (f: F, back = 364) => ({ from: f["from_date"] || addDays(today(), -back), to: f["to_date"] || today() });
const median = (xs: number[]) => { if (!xs.length) return 0; const a = [...xs].sort((x, y) => x - y); const m = Math.floor(a.length / 2); return a.length % 2 ? a[m]! : r1((a[m - 1]! + a[m]!) / 2); };

const CO: RFilter = { fieldname: "company", label: "Company", fieldtype: "Link", options: "Company" };
const DEPT: RFilter = { fieldname: "department", label: "Department", fieldtype: "Link", options: "Department" };
const FROM: RFilter = { fieldname: "from_date", label: "From Date", fieldtype: "Date", default: "__fy_start" };
const TO: RFilter = { fieldname: "to_date", label: "To Date", fieldtype: "Date", default: "__today" };
const ASOF: RFilter = { fieldname: "as_of_date", label: "As of Date", fieldtype: "Date", default: "__today" };
const PE: RFilter = { fieldname: "payroll_entry", label: "Payroll Entry", fieldtype: "Link", options: "Payroll Entry" };
const HR = ["HR Manager", "HR User", "CHRO", "HR Business Partner", "System Manager"], PAY = ["HR Manager", "Payroll Manager", "Payroll Officer", "Finance Controller", "System Manager"], FIN = [...PAY, "CHRO"];

type Card = { label: string; ar: string; kind: "Int" | "Currency" | "Percent" | "Float" };
export type HrReport2 = HrReport & { cards: Card[]; chart?: { label: string; value: string } };
const cards = (c: Card[], vals: number[]): { label: string; value: number }[] => c.map((x, i) => ({ label: x.label, value: vals[i] ?? 0 }));
const empIndex = () => new Map(L("Employee").map((e) => [e.name, e]));
/** Separation date of a leaver: relieving date, else the separation record's dates. */
const leftOn = (e: Doc, sep?: Doc) => d10(e["relieving_date"]) || d10(sep?.["boarding_begins_on"]) || d10(sep?.["resignation_letter_date"]);
/** Leave ledger balance of an employee and leave type up to a date (allocations + adjustments − consumption − expiry). */
const ledger = (rows: Doc[], on: string) => rows.filter((l) => d10(l["from_date"]) <= on && Number(l.docstatus ?? 1) !== 2);

const C26: Card[] = [{ label: "Active headcount", ar: "العدد النشط", kind: "Int" }, { label: "Saudi %", ar: "نسبة السعوديين", kind: "Percent" }, { label: "Female %", ar: "نسبة الإناث", kind: "Percent" }];
const C27: Card[] = [{ label: "Approved positions", ar: "المناصب المعتمدة", kind: "Int" }, { label: "Vacant positions", ar: "المناصب الشاغرة", kind: "Int" }, { label: "Vacancy rate %", ar: "نسبة الشغور", kind: "Percent" }, { label: "Open FTE", ar: "المقاعد المفتوحة", kind: "Float" }];
const C28: Card[] = [{ label: "Turnover %", ar: "نسبة الدوران", kind: "Percent" }, { label: "Voluntary %", ar: "الطوعي %", kind: "Percent" }, { label: "Involuntary %", ar: "غير الطوعي %", kind: "Percent" }, { label: "Regretted attrition %", ar: "الفقد غير المرغوب %", kind: "Percent" }];
const C29: Card[] = [{ label: "Employees", ar: "الموظفون", kind: "Int" }, { label: "Balance days", ar: "أيام الرصيد", kind: "Float" }, { label: "Days taken", ar: "الأيام المأخوذة", kind: "Float" }];
const C30: Card[] = [{ label: "Exceptions", ar: "الاستثناءات", kind: "Int" }, { label: "Employees checked", ar: "الموظفون المفحوصون", kind: "Int" }];
const C31: Card[] = [{ label: "Absence rate %", ar: "نسبة الغياب", kind: "Percent" }, { label: "Absent days", ar: "أيام الغياب", kind: "Float" }, { label: "Scheduled days", ar: "الأيام المجدولة", kind: "Int" }];
const C32: Card[] = [{ label: "Gross pay", ar: "إجمالي الرواتب", kind: "Currency" }, { label: "Net pay", ar: "صافي الرواتب", kind: "Currency" }, { label: "Posted to ledger", ar: "المرحّل للدفاتر", kind: "Currency" }, { label: "Not yet posted", ar: "غير مرحّل", kind: "Currency" }];
const C33: Card[] = [{ label: "Hires", ar: "التعيينات", kind: "Int" }, { label: "Average days to hire", ar: "متوسط أيام التعيين", kind: "Float" }, { label: "Median days to hire", ar: "وسيط أيام التعيين", kind: "Float" }];
const C34: Card[] = [{ label: "Submitted", ar: "المقدمة", kind: "Int" }, { label: "Accepted", ar: "المقبولة", kind: "Int" }, { label: "Acceptance %", ar: "نسبة القبول", kind: "Percent" }];
const C35: Card[] = [{ label: "Current net", ar: "الصافي الحالي", kind: "Currency" }, { label: "Prior net", ar: "الصافي السابق", kind: "Currency" }, { label: "Variance", ar: "الفرق", kind: "Currency" }, { label: "Population effect", ar: "أثر تغير العدد", kind: "Currency" }];
const C36: Card[] = [{ label: "Eligible employees", ar: "الموظفون المؤهلون", kind: "Int" }, { label: "Ready", ar: "الجاهزون", kind: "Int" }, { label: "Readiness %", ar: "نسبة الجاهزية", kind: "Percent" }];
const C37: Card[] = [{ label: "Labour cost", ar: "تكلفة العمالة", kind: "Currency" }, { label: "Average FTE", ar: "متوسط العدد المكافئ", kind: "Float" }, { label: "Cost per FTE", ar: "التكلفة لكل موظف", kind: "Currency" }];
const C38: Card[] = [{ label: "Leave liability", ar: "التزام الإجازات", kind: "Currency" }, { label: "Unused paid days", ar: "الأيام المدفوعة غير المستخدمة", kind: "Float" }, { label: "Employees", ar: "الموظفون", kind: "Int" }];
const C39: Card[] = [{ label: "New joiners", ar: "المنضمون الجدد", kind: "Int" }, { label: "Ready before start", ar: "الجاهزون قبل المباشرة", kind: "Int" }, { label: "Ready %", ar: "نسبة الجاهزية", kind: "Percent" }];
const C40: Card[] = [{ label: "Applicable employees", ar: "الموظفون المعنيون", kind: "Int" }, { label: "Compliant", ar: "الملتزمون", kind: "Int" }, { label: "Compliance %", ar: "نسبة الالتزام", kind: "Percent" }, { label: "Expired certifications", ar: "الشهادات المنتهية", kind: "Int" }];
const C41: Card[] = [{ label: "Managers", ar: "المديرون", kind: "Int" }, { label: "Average span", ar: "متوسط النطاق", kind: "Float" }, { label: "Above the limit", ar: "فوق الحد", kind: "Int" }];
const C42: Card[] = [{ label: "Labour budget", ar: "ميزانية العمالة", kind: "Currency" }, { label: "Actual labour cost", ar: "تكلفة العمالة الفعلية", kind: "Currency" }, { label: "Variance", ar: "الفرق", kind: "Currency" }];

export const HR_REPORTS_R2: HrReport2[] = [
  { id: "R26", name: "HR Active Headcount", ar: "العدد النشط للموظفين", section: "06.1", ref: "Employee", roles: HR, filters: [CO, DEPT, ASOF], cards: C26, chart: { label: "department", value: "headcount" },
    run: (f) => { const on = f["as_of_date"] || today(); const ids = identityIndex(); const g = new Map<string, Row>();
      const act = byCo(L("Employee"), f).filter((e) => activeOn(e, on) && (!f["department"] || e["department"] === f["department"]));
      for (const e of act) { const k = `${s(e["company"])}|${s(e["department"]) || "—"}`; const r = g.get(k) ?? { company: e["company"], department: s(e["department"]) || "—", headcount: 0, saudi: 0, non_saudi: 0, female: 0 }; r["headcount"] = n(r["headcount"]) + 1; if (nationalityOf(e, ids) === "Saudi") r["saudi"] = n(r["saudi"]) + 1; else r["non_saudi"] = n(r["non_saudi"]) + 1; if (s(e["gender"]) === "Female") r["female"] = n(r["female"]) + 1; g.set(k, r); }
      const rows = [...g.values()].sort((a, b) => n(b["headcount"]) - n(a["headcount"])); const t = total(rows, ["headcount", "saudi", "non_saudi", "female"], { company: "Total" });
      return { columns: [col("company", "Company", "Link", "Company"), col("department", "Department", "Link", "Department"), col("headcount", "Headcount", "Int", undefined, 100), col("saudi", "Saudi", "Int", undefined, 90), col("non_saudi", "Non-Saudi", "Int", undefined, 100), col("female", "Female", "Int", undefined, 90)], rows: rows.length ? [...rows, t] : [],
        summary: cards(C26, [act.length, pct(n(t["saudi"]), act.length), pct(n(t["female"]), act.length)]) }; } },
  { id: "R27", name: "HR Position Vacancy", ar: "شغور المناصب", section: "01.3", ref: "DIGIT Position", roles: HR, filters: [CO, DEPT], cards: C27, chart: { label: "department", value: "vacant" },
    run: (f) => { const g = new Map<string, Row>(); const pos = byCo(L("DIGIT Position"), f).filter((p) => (!f["department"] || p["department"] === f["department"]) && (s(p["approval_status"]) || "Approved") === "Approved" && s(p["position_status"]) !== "Closed");
      for (const p of pos) { const k = s(p["department"]) || "—"; const r = g.get(k) ?? { department: k, approved: 0, filled: 0, vacant: 0, frozen: 0 }; r["approved"] = n(r["approved"]) + 1; const st = s(p["position_status"]) || (p["incumbent"] ? "Filled" : "Vacant"); if (st === "Filled" || s(p["incumbent"])) r["filled"] = n(r["filled"]) + 1; else if (st === "Frozen") r["frozen"] = n(r["frozen"]) + 1; else r["vacant"] = n(r["vacant"]) + 1; g.set(k, r); }
      const rows = [...g.values()].map((r): Row => ({ ...r, vacancy_pct: pct(n(r["vacant"]), n(r["approved"])) })).sort((a, b) => n(b["vacant"]) - n(a["vacant"])); const t = total(rows, ["approved", "filled", "vacant", "frozen"], { department: "Total" }); t["vacancy_pct"] = pct(n(t["vacant"]), n(t["approved"]));
      return { columns: [col("department", "Department", "Link", "Department"), col("approved", "Approved Positions", "Int", undefined, 130), col("filled", "Filled", "Int", undefined, 90), col("vacant", "Vacant", "Int", undefined, 90), col("frozen", "Frozen", "Int", undefined, 90), col("vacancy_pct", "Vacancy %", "Percent", undefined, 100)], rows: rows.length ? [...rows, t] : [],
        summary: cards(C27, [n(t["approved"]), n(t["vacant"]), n(t["vacancy_pct"]), n(t["approved"]) - n(t["filled"])]) }; } },
  { id: "R28", name: "HR Attrition Analysis", ar: "تحليل الدوران والفقد", section: "06.3", ref: "Employee Separation", roles: HR, filters: [CO, FROM, TO], cards: C28, chart: { label: "department", value: "separations" },
    run: (f) => { const { from, to } = range(f); const seps = new Map(byCo(L("Employee Separation"), f).filter((x) => Number(x.docstatus) !== 2).map((x) => [s(x["employee"]), x]));
      const minScore = policyValue("regretted_min_score", to, f["company"]) ?? 4; const lastScore = new Map<string, number>(); for (const a of L("Appraisal").filter((x) => Number(x.docstatus) === 1).sort((x, y) => d10(x["end_date"] ?? x["modified"]).localeCompare(d10(y["end_date"] ?? y["modified"])))) lastScore.set(s(a["employee"]), n(a["final_score"] ?? a["total_score"]));
      const emps = byCo(L("Employee"), f); const g = new Map<string, Row>(); const leavers: Row[] = [];
      for (const e of emps) { const k = s(e["department"]) || "—"; const r = g.get(k) ?? { department: k, opening: 0, closing: 0, separations: 0, voluntary: 0, involuntary: 0, unclassified: 0, regretted: 0 }; if (activeOn(e, from)) r["opening"] = n(r["opening"]) + 1; if (activeOn(e, to)) r["closing"] = n(r["closing"]) + 1;
        const sep = seps.get(e.name); const on = leftOn(e, sep);
        if ((s(e["status"]) === "Left" || d10(e["relieving_date"])) && on && on >= from && on <= to) { r["separations"] = n(r["separations"]) + 1; const ty = s(sep?.["digit_separation_type"]); const vol = ty === "Voluntary"; if (vol) r["voluntary"] = n(r["voluntary"]) + 1; else if (ty) r["involuntary"] = n(r["involuntary"]) + 1; else r["unclassified"] = n(r["unclassified"]) + 1;
          const reg = Number(sep?.["digit_regretted"]) === 1 || (vol && (lastScore.get(e.name) ?? 0) >= minScore); if (reg) r["regretted"] = n(r["regretted"]) + 1; leavers.push({ employee: e.name, on, type: ty || "Unclassified", regretted: reg ? 1 : 0 }); }
        g.set(k, r); }
      const rows = [...g.values()].filter((r) => n(r["opening"]) || n(r["closing"]) || n(r["separations"])).map((r): Row => { const avg = (n(r["opening"]) + n(r["closing"])) / 2; return { ...r, average_headcount: r1(avg), turnover_pct: pct(n(r["separations"]), avg), regretted_pct: pct(n(r["regretted"]), avg) }; }).sort((a, b) => n(b["separations"]) - n(a["separations"]));
      const t = total(rows, ["opening", "closing", "separations", "voluntary", "involuntary", "unclassified", "regretted"], { department: "Total" }); const avg = (n(t["opening"]) + n(t["closing"])) / 2; t["average_headcount"] = r1(avg); t["turnover_pct"] = pct(n(t["separations"]), avg); t["regretted_pct"] = pct(n(t["regretted"]), avg);
      return { columns: [col("department", "Department", "Link", "Department"), col("average_headcount", "Average Headcount", "Float", undefined, 130), col("separations", "Separations", "Int", undefined, 100), col("voluntary", "Voluntary", "Int", undefined, 90), col("involuntary", "Involuntary", "Int", undefined, 100), col("unclassified", "Unclassified", "Int", undefined, 100), col("regretted", "Regretted", "Int", undefined, 90), col("turnover_pct", "Turnover %", "Percent", undefined, 100), col("regretted_pct", "Regretted %", "Percent", undefined, 100)], rows: rows.length ? [...rows, t] : [],
        summary: cards(C28, [n(t["turnover_pct"]), pct(n(t["voluntary"]), avg), pct(n(t["involuntary"]), avg), n(t["regretted_pct"])]), checks: [{ label: "Every leaver classified as voluntary or involuntary", ok: n(t["unclassified"]) === 0, detail: `${n(t["unclassified"])} unclassified` }] }; } },
  { id: "R29", name: "HR Leave Balance", ar: "رصيد الإجازات", section: "03.1", ref: "Leave Ledger Entry", roles: [...HR, "Employee", "Line Manager"], filters: [CO, DEPT, { fieldname: "leave_type", label: "Leave Type", fieldtype: "Link", options: "Leave Type" }, ASOF], cards: C29, chart: { label: "leave_type", value: "balance" },
    run: (f) => { const on = f["as_of_date"] || today(); const emps = empIndex(); const g = new Map<string, Row>();
      for (const l of ledger(byCo(L("Leave Ledger Entry"), f), on)) { const e = emps.get(s(l["employee"])); if (!e || (f["department"] && e["department"] !== f["department"]) || (f["leave_type"] && l["leave_type"] !== f["leave_type"])) continue;
        const k = `${e.name}|${s(l["leave_type"])}`; const r = g.get(k) ?? { employee: e.name, employee_name: e["employee_name"], leave_type: l["leave_type"], allocated: 0, taken: 0, adjusted: 0, expired: 0, balance: 0 }; const q = n(l["leaves"]); const ty = s(l["transaction_type"]);
        // a Leave Adjustment (+ or −) is its own column and always moves the balance (CQ-HRMS-4490)
        if (Number(l["is_expired"]) === 1) r["expired"] = r2(n(r["expired"]) - q); else if (ty === "Leave Adjustment") r["adjusted"] = r2(n(r["adjusted"]) + q); else if (ty === "Leave Application" || q < 0) r["taken"] = r2(n(r["taken"]) - q); else r["allocated"] = r2(n(r["allocated"]) + q); r["balance"] = r2(n(r["balance"]) + q); g.set(k, r); }
      const rows = [...g.values()].sort((a, b) => s(a["employee_name"]).localeCompare(s(b["employee_name"]))); const t = total(rows, ["allocated", "taken", "adjusted", "expired", "balance"], { employee_name: "Total" });
      return { columns: [col("employee", "Employee", "Link", "Employee"), col("employee_name", "Employee Name"), col("leave_type", "Leave Type", "Link", "Leave Type"), flt("allocated", "Allocated", 100), flt("taken", "Taken", 90), flt("adjusted", "Adjusted", 90), flt("expired", "Expired", 90), flt("balance", "Balance", 100)], rows: rows.length ? [...rows, t] : [],
        summary: cards(C29, [new Set(rows.map((r) => r["employee"])).size, n(t["balance"]), n(t["taken"])]) }; } },
  { id: "R30", name: "HR Leave Balance Exceptions", ar: "استثناءات أرصدة الإجازات", section: "03.1", ref: "Leave Ledger Entry", roles: [...HR, ...PAY], filters: [CO, ASOF], cards: C30,
    run: (f) => { const on = f["as_of_date"] || today(); const emps = empIndex(); const led = ledger(byCo(L("Leave Ledger Entry"), f), on); const rows: Row[] = []; const seen = new Set<string>();
      for (const a of byCo(L("Leave Allocation"), f).filter((x) => Number(x.docstatus) === 1 && d10(x["from_date"]) <= on && d10(x["to_date"]) >= on)) {
        const e = emps.get(s(a["employee"])); if (!e) continue; seen.add(e.name);
        const lines = led.filter((l) => l["employee"] === e.name && l["leave_type"] === a["leave_type"] && d10(l["from_date"]) >= d10(a["from_date"]) && d10(l["from_date"]) <= d10(a["to_date"]));
        const ledgerBal = r2(lines.reduce((x, l) => x + n(l["leaves"]), 0));
        const taken = L("Leave Application").filter((x) => x["employee"] === e.name && x["leave_type"] === a["leave_type"] && Number(x.docstatus) === 1 && s(x["status"]) === "Approved" && d10(x["from_date"]) >= d10(a["from_date"]) && d10(x["from_date"]) <= on).reduce((x, l) => x + n(l["total_leave_days"]), 0);
        const shown = r2(n(a["total_leaves_allocated"] ?? a["new_leaves_allocated"]) - taken);
        const issue = !lines.length ? "No ledger entries for the allocation" : Math.abs(ledgerBal - shown) > 0.01 ? "Ledger differs from the displayed balance" : ledgerBal < 0 ? "Negative balance" : "";
        if (issue) rows.push({ employee: e.name, employee_name: e["employee_name"], leave_type: a["leave_type"], ledger_balance: ledgerBal, displayed_balance: shown, difference: r2(ledgerBal - shown), issue });
      }
      return { columns: [col("employee", "Employee", "Link", "Employee"), col("employee_name", "Employee Name"), col("leave_type", "Leave Type", "Link", "Leave Type"), flt("ledger_balance", "Ledger Balance", 120), flt("displayed_balance", "Displayed Balance", 130), flt("difference", "Difference", 100), col("issue", "Issue", "Data", undefined, 260)], rows,
        summary: cards(C30, [rows.length, seen.size]), checks: [{ label: "Zero exceptions before the payroll lock", ok: rows.length === 0, detail: `${rows.length} exception(s)` }] }; } },
  { id: "R31", name: "HR Absence Rate", ar: "نسبة الغياب", section: "03.2", ref: "Attendance", roles: [...HR, "Timekeeper", "Line Manager"], filters: [CO, DEPT, { ...FROM, default: "__month_ago" }, TO], cards: C31, chart: { label: "department", value: "absence_pct" },
    run: (f) => { const { from, to } = range(f, 30); const emps = empIndex(); const g = new Map<string, Row>();
      for (const a of byCo(L("Attendance"), f).filter((x) => Number(x.docstatus) === 1 && inRange(x["attendance_date"], from, to) && !weekend(d10(x["attendance_date"])))) {
        const e = emps.get(s(a["employee"])); if (!e || (f["department"] && e["department"] !== f["department"])) continue; const st = s(a["status"]); if (st === "On Leave") continue;
        const k = s(e["department"]) || "—"; const r = g.get(k) ?? { department: k, scheduled: 0, absent: 0 }; r["scheduled"] = n(r["scheduled"]) + 1; if (st === "Absent") r["absent"] = n(r["absent"]) + 1; else if (st === "Half Day") r["absent"] = n(r["absent"]) + 0.5; g.set(k, r); }
      const alert = policyValue("absence_alert_pct", to, f["company"]) ?? 5;
      const rows = [...g.values()].map((r) => ({ ...r, absence_pct: pct(n(r["absent"]), n(r["scheduled"])) })).map((r) => ({ ...r, flag: r.absence_pct > alert ? "Above alert" : "" })).sort((a, b) => b.absence_pct - a.absence_pct);
      const t = total(rows, ["scheduled", "absent"], { department: "Total" }); t["absence_pct"] = pct(n(t["absent"]), n(t["scheduled"]));
      return { columns: [col("department", "Department", "Link", "Department"), col("scheduled", "Scheduled Days", "Int", undefined, 120), flt("absent", "Absent Days", 110), col("absence_pct", "Absence %", "Percent", undefined, 100), col("flag", "Flag", "Data", undefined, 110)], rows: rows.length ? [...rows, t] : [],
        summary: cards(C31, [n(t["absence_pct"]), n(t["absent"]), n(t["scheduled"])]) }; } },
  { id: "R32", name: "HR Payroll Cost", ar: "تكلفة الرواتب", section: "04.1", ref: "Salary Slip", roles: FIN, filters: [CO, FROM, TO], cards: C32, chart: { label: "month", value: "gross_pay" },
    run: (f) => { const { from, to } = range(f); const g = new Map<string, Row>();
      for (const x of byCo(L("Salary Slip"), f).filter((d) => Number(d.docstatus) === 1 && inRange(d["start_date"], from, to))) { const k = `${s(x["company"])}|${ym(d10(x["start_date"]))}`; const r = g.get(k) ?? { company: x["company"], month: ym(d10(x["start_date"])), slips: 0, gross_pay: 0, deductions: 0, net_pay: 0, posted: 0 }; r["slips"] = n(r["slips"]) + 1; r["gross_pay"] = r2(n(r["gross_pay"]) + n(x["gross_pay"])); r["deductions"] = r2(n(r["deductions"]) + n(x["total_deduction"])); r["net_pay"] = r2(n(r["net_pay"]) + n(x["net_pay"])); g.set(k, r); }
      const pes = new Map(L("Payroll Entry").map((p) => [p.name, p]));
      for (const je of byCo(L("Journal Entry"), f).filter((j) => Number(j.docstatus) === 1 && s(j["payroll_entry"]) && pes.has(s(j["payroll_entry"])))) { const pe = pes.get(s(je["payroll_entry"]))!; const k = `${s(je["company"])}|${ym(d10(pe["start_date"]))}`; const r = g.get(k); if (r && /accrual/i.test(s(je["user_remark"]) || "accrual")) r["posted"] = r2(n(r["posted"]) + n(je["total_debit"])); }
      const rows = [...g.values()].map((r): Row => ({ ...r, not_posted: r2(Math.max(0, n(r["gross_pay"]) - n(r["posted"]))) })).sort((a, b) => s(a["month"]).localeCompare(s(b["month"])));
      const t = total(rows, ["slips", "gross_pay", "deductions", "net_pay", "posted", "not_posted"], { company: "Total" });
      return { columns: [col("company", "Company", "Link", "Company"), col("month", "Month", "Data", undefined, 90), col("slips", "Slips", "Int", undefined, 80), cur("gross_pay", "Gross Pay"), cur("deductions", "Deductions"), cur("net_pay", "Net Pay"), cur("posted", "Posted to Ledger"), cur("not_posted", "Not Yet Posted")], rows: rows.length ? [...rows, t] : [],
        summary: cards(C32, [n(t["gross_pay"]), n(t["net_pay"]), n(t["posted"]), n(t["not_posted"])]), checks: [{ label: "Submitted slips reconcile with the posted payroll journal", ok: n(t["not_posted"]) === 0, detail: `${n(t["not_posted"])} not posted` }] }; } },
  { id: "R33", name: "HR Time to Hire", ar: "مدة التعيين", section: "02.1", ref: "Job Offer", roles: [...HR, "Recruiter"], filters: [CO, FROM, TO], cards: C33, chart: { label: "designation", value: "days_to_hire" },
    run: (f) => { const { from, to } = range(f); const apps = new Map(L("Job Applicant").map((a) => [a.name, a])); const opens = new Map(L("Job Opening").map((o) => [o.name, o])); const reqs = new Map(L("Job Requisition").map((r) => [r.name, r])); const rows: Row[] = [];
      for (const o of byCo(L("Job Offer"), f).filter((x) => s(x["status"]) === "Accepted")) { const accepted = d10(o["digit_accepted_on"]) || d10(o["modified"]) || d10(o["offer_date"]); if (!inRange(accepted, from, to)) continue;
        const ap = apps.get(s(o["job_applicant"])); const op = opens.get(s(ap?.["job_title"])); const rq = reqs.get(s(op?.["job_requisition"])); const start = d10(rq?.["digit_approved_on"]) || d10(rq?.["posting_date"]); if (!rq || !start) continue; // eligible hires only: a requisition clock start
        rows.push({ job_offer: o.name, applicant_name: o["applicant_name"], designation: o["designation"], job_requisition: rq.name, approved_on: start, accepted_on: accepted, days_to_hire: Math.max(0, days(start, accepted)) }); }
      rows.sort((a, b) => s(b["accepted_on"]).localeCompare(s(a["accepted_on"]))); const ds = rows.map((r) => n(r["days_to_hire"]));
      return { columns: [col("job_offer", "Job Offer", "Link", "Job Offer"), col("applicant_name", "Applicant"), col("designation", "Designation", "Link", "Designation"), col("job_requisition", "Job Requisition", "Link", "Job Requisition"), col("approved_on", "Requisition Approved", "Date"), col("accepted_on", "Offer Accepted", "Date"), col("days_to_hire", "Days to Hire", "Int", undefined, 100)], rows,
        summary: cards(C33, [rows.length, ds.length ? r1(ds.reduce((a, x) => a + x, 0) / ds.length) : 0, median(ds)]) }; } },
  { id: "R34", name: "HR WPS Acceptance", ar: "قبول ملفات حماية الأجور", section: "04.2", ref: "DIGIT WPS Submission", roles: FIN, filters: [CO, FROM, TO], cards: C34, chart: { label: "month", value: "accepted" },
    run: (f) => { const { from, to } = range(f); const g = new Map<string, Row>();
      for (const w of byCo(L("DIGIT WPS Submission"), f).filter((x) => inRange(x["period_month"], from, to))) { const st = s(w["submission_status"]); if (!["Submitted Externally", "Accepted", "Rejected"].includes(st)) continue; // generated files are not submissions
        const k = `${s(w["company"])}|${ym(d10(w["period_month"]))}`; const r = g.get(k) ?? { company: w["company"], month: ym(d10(w["period_month"])), submitted: 0, accepted: 0, rejected: 0, employees: 0 }; r["submitted"] = n(r["submitted"]) + 1; if (st === "Accepted" && s(w["external_reference"])) r["accepted"] = n(r["accepted"]) + 1; if (st === "Rejected") r["rejected"] = n(r["rejected"]) + 1; r["employees"] = n(r["employees"]) + n(w["employee_count"]); g.set(k, r); }
      const rows = [...g.values()].map((r): Row => ({ ...r, acceptance_pct: pct(n(r["accepted"]), n(r["submitted"])) })).sort((a, b) => s(a["month"]).localeCompare(s(b["month"]))); const t = total(rows, ["submitted", "accepted", "rejected", "employees"], { company: "Total" }); t["acceptance_pct"] = pct(n(t["accepted"]), n(t["submitted"]));
      return { columns: [col("company", "Company", "Link", "Company"), col("month", "Month", "Data", undefined, 90), col("submitted", "Submitted", "Int", undefined, 100), col("accepted", "Accepted", "Int", undefined, 100), col("rejected", "Rejected", "Int", undefined, 90), col("employees", "Employees", "Int", undefined, 100), col("acceptance_pct", "Acceptance %", "Percent", undefined, 110)], rows: rows.length ? [...rows, t] : [],
        summary: cards(C34, [n(t["submitted"]), n(t["accepted"]), n(t["acceptance_pct"])]) }; } },
  { id: "R35", name: "HR Payroll Variance by Employee", ar: "فروقات الرواتب حسب الموظف", section: "04.1", ref: "Salary Slip", roles: PAY, filters: [CO, PE], cards: C35, chart: { label: "employee_name", value: "variance" },
    run: (f) => { const pes = byCo(L("Payroll Entry"), f).filter((p) => Number(p.docstatus) !== 2).sort((a, b) => d10(b["start_date"]).localeCompare(d10(a["start_date"])));
      const pe = pes.find((p) => p.name === f["payroll_entry"]) ?? pes[0]; if (!pe) return { columns: [], rows: [], summary: cards(C35, [0, 0, 0, 0]) };
      const slips = L("Salary Slip").filter((x) => Number(x.docstatus) !== 2); const cur0 = slips.filter((x) => x["payroll_entry"] === pe.name || (!x["payroll_entry"] && x["company"] === pe["company"] && d10(x["start_date"]) === d10(pe["start_date"])));
      const startPrev = ym(addDays(d10(pe["start_date"]), -1)); const prev = slips.filter((x) => Number(x.docstatus) === 1 && x["company"] === pe["company"] && ym(d10(x["start_date"])) === startPrev);
      const P = new Map(prev.map((x) => [s(x["employee"]), x])); const C = new Map(cur0.map((x) => [s(x["employee"]), x])); const rows: Row[] = []; let pop = 0;
      for (const id of new Set([...P.keys(), ...C.keys()])) { const a = n(P.get(id)?.["net_pay"]), b = n(C.get(id)?.["net_pay"]); const cause = !P.has(id) ? "New in this run" : !C.has(id) ? "Not in this run (leaver or hold)" : Math.abs(b - a) < 0.01 ? "" : "Rate or component change"; if (!cause) continue; if (!P.has(id) || !C.has(id)) pop += b - a;
        rows.push({ employee: id, employee_name: (C.get(id) ?? P.get(id))?.["employee_name"], prior_net: r2(a), current_net: r2(b), variance: r2(b - a), variance_pct: a ? r2(((b - a) / a) * 100) : 0, cause }); }
      rows.sort((x, y) => Math.abs(n(y["variance"])) - Math.abs(n(x["variance"]))); const ct = r2(cur0.reduce((x, d) => x + n(d["net_pay"]), 0)), pt = r2(prev.reduce((x, d) => x + n(d["net_pay"]), 0));
      return { columns: [col("employee", "Employee", "Link", "Employee"), col("employee_name", "Employee Name"), cur("prior_net", "Prior Net"), cur("current_net", "Current Net"), cur("variance", "Variance"), col("variance_pct", "Variance %", "Percent", undefined, 100), col("cause", "Cause", "Data", undefined, 220)], rows,
        summary: cards(C35, [ct, pt, r2(ct - pt), r2(pop)]) }; } },
  { id: "R36", name: "HR Payroll Readiness", ar: "جاهزية الرواتب", section: "04.1", ref: "Employee", roles: PAY, filters: [CO, ASOF], cards: C36, chart: { label: "check", value: "employees" },
    run: (f) => { const on = f["as_of_date"] || today(); const ids = identityIndex(); const ssa = L("Salary Structure Assignment").filter((x) => Number(x.docstatus) === 1 && d10(x["from_date"]) <= on);
      const pendingLeave = new Set(L("Leave Application").filter((x) => Number(x.docstatus) === 0 && s(x["status"]) === "Open" && ym(d10(x["from_date"])) <= ym(on)).map((x) => s(x["employee"])));
      const elig = byCo(L("Employee"), f).filter((e) => activeOn(e, on)); const rows: Row[] = []; let ready = 0;
      for (const e of elig) { const miss: string[] = []; if (!ssa.some((a) => a["employee"] === e.name)) miss.push("Salary structure assignment"); if (!ibanOf(e)) miss.push("Bank IBAN"); if (!ids.get(e.name) && !s(e["digit_national_id"]) && !s(e["digit_iqama_number"])) miss.push("National ID / Iqama"); if (pendingLeave.has(e.name)) miss.push("Leave awaiting approval");
        if (!miss.length) { ready++; continue; } for (const m of miss) rows.push({ employee: e.name, employee_name: e["employee_name"], company: e["company"], check: m, status: "Missing" }); }
      return { columns: [col("employee", "Employee", "Link", "Employee"), col("employee_name", "Employee Name"), col("company", "Company", "Link", "Company"), col("check", "Mandatory Check", "Data", undefined, 220), col("status", "Status", "Data", undefined, 100)], rows,
        summary: cards(C36, [elig.length, ready, pct(ready, elig.length)]) }; } },
  { id: "R37", name: "HR Labour Cost per FTE", ar: "تكلفة العمالة لكل موظف", section: "06.2", ref: "Salary Slip", roles: FIN, filters: [CO, FROM, TO], cards: C37, chart: { label: "department", value: "cost_per_fte" },
    run: (f) => { const { from, to } = range(f); const emps = empIndex(); const months: string[] = []; for (let m = ym(from); m <= ym(to) && months.length < 36; m = ym(addDays(`${m}-28`, 7))) months.push(m);
      const g = new Map<string, Row>(); const dep = (id: string) => s(emps.get(id)?.["department"]) || "—";
      for (const x of byCo(L("Salary Slip"), f).filter((d) => Number(d.docstatus) === 1 && inRange(d["start_date"], from, to))) { const k = dep(s(x["employee"])); const r = g.get(k) ?? { department: k, labour_cost: 0, fte_months: 0 }; r["labour_cost"] = r2(n(r["labour_cost"]) + n(x["gross_pay"])); g.set(k, r); }
      for (const e of byCo(L("Employee"), f)) for (const m of months) if (activeOn(e, `${m}-15`)) { const k = dep(e.name); const r = g.get(k) ?? { department: k, labour_cost: 0, fte_months: 0 }; r["fte_months"] = n(r["fte_months"]) + 1; g.set(k, r); }
      const rows = [...g.values()].map((r) => { const fte = months.length ? r1(n(r["fte_months"]) / months.length) : 0; return { department: r["department"], labour_cost: r["labour_cost"], average_fte: fte, cost_per_fte: fte ? r2(n(r["labour_cost"]) / fte) : 0 }; }).filter((r) => r.average_fte || n(r.labour_cost)).sort((a, b) => b.cost_per_fte - a.cost_per_fte);
      const cost = r2(rows.reduce((a, r) => a + n(r.labour_cost), 0)), fte = r1(rows.reduce((a, r) => a + r.average_fte, 0));
      return { columns: [col("department", "Department", "Link", "Department"), cur("labour_cost", "Labour Cost"), flt("average_fte", "Average FTE", 110), cur("cost_per_fte", "Cost per FTE")], rows: rows.length ? [...rows, { department: "Total", is_total: true, bold: true, labour_cost: cost, average_fte: fte, cost_per_fte: fte ? r2(cost / fte) : 0 }] : [],
        summary: cards(C37, [cost, fte, fte ? r2(cost / fte) : 0]) }; } },
  { id: "R38", name: "HR Leave Liability", ar: "التزام الإجازات", section: "04.1", ref: "Leave Ledger Entry", roles: FIN, filters: [CO, ASOF], cards: C38, chart: { label: "department", value: "liability" },
    run: (f) => { const on = f["as_of_date"] || today(); const emps = empIndex(); const bal = new Map<string, number>();
      for (const l of ledger(byCo(L("Leave Ledger Entry"), f), on)) if (s(l["leave_type"]) === "Annual Leave" && Number(l["is_lwp"] ?? 0) !== 1) bal.set(s(l["employee"]), r2((bal.get(s(l["employee"])) ?? 0) + n(l["leaves"])));
      const rows: Row[] = []; for (const [id, d] of bal) { const e = emps.get(id); if (!e || d <= 0 || !activeOn(e, on)) continue; const w = wageOf(id, on).wage; const rate = r2(w / 30); rows.push({ employee: id, employee_name: e["employee_name"], department: e["department"], unused_days: d, daily_rate: rate, liability: r2(d * rate) }); }
      rows.sort((a, b) => n(b["liability"]) - n(a["liability"])); const t = total(rows, ["unused_days", "liability"], { employee_name: "Total" });
      return { columns: [col("employee", "Employee", "Link", "Employee"), col("employee_name", "Employee Name"), col("department", "Department", "Link", "Department"), flt("unused_days", "Unused Paid Days", 130), cur("daily_rate", "Daily Rate (Basic + Housing ÷ 30)"), cur("liability", "Liability")], rows: rows.length ? [...rows, t] : [],
        summary: cards(C38, [n(t["liability"]), n(t["unused_days"]), rows.length]) }; } },
  { id: "R39", name: "HR Onboarding Readiness", ar: "جاهزية التهيئة", section: "02.2", ref: "Employee Onboarding", roles: [...HR, "HR Operations"], filters: [CO, { ...FROM, default: "__month_ago" }, { ...TO, default: "" }], cards: C39, chart: { label: "employee_name", value: "open_tasks" },
    run: (f) => { const from = f["from_date"] || addDays(today(), -30), to = f["to_date"] || addDays(today(), 60); const rows: Row[] = []; let joiners = 0, ready = 0;
      for (const b of byCo(L("Employee Onboarding"), f).filter((x) => Number(x.docstatus) !== 2 && inRange(x["date_of_joining"] || x["boarding_begins_on"], from, to))) { joiners++; const start = d10(b["date_of_joining"] || b["boarding_begins_on"]);
        const open = ((b["activities"] as Doc[] | undefined) ?? []).filter((x) => !Number(x["completed"]) && (!d10(x["due_date"]) || d10(x["due_date"]) <= start)); // critical = due on or before the start date
        if (!open.length) { ready++; continue; }
        rows.push({ onboarding: b.name, employee_name: b["employee_name"], start_date: start, open_tasks: open.length, first_task: s(open[0]?.["activity_name"] ?? open[0]?.["title"]), days_to_start: days(today(), start) }); }
      rows.sort((a, b) => n(a["days_to_start"]) - n(b["days_to_start"]));
      return { columns: [col("onboarding", "Onboarding", "Link", "Employee Onboarding"), col("employee_name", "Employee Name"), col("start_date", "Start Date", "Date"), col("open_tasks", "Open Critical Tasks", "Int", undefined, 130), col("first_task", "First Open Task", "Data", undefined, 220), col("days_to_start", "Days to Start", "Int", undefined, 100)], rows,
        summary: cards(C39, [joiners, ready, pct(ready, joiners)]) }; } },
  { id: "R40", name: "HR Learning Compliance", ar: "الالتزام بالشهادات والتعلم", section: "02.4", ref: "DIGIT Certification", roles: [...HR, "HR Talent"], filters: [CO, DEPT, ASOF], cards: C40, chart: { label: "certification_name", value: "expired" },
    run: (f) => { const on = f["as_of_date"] || today(); const emps = empIndex(); const per = new Map<string, Doc[]>();
      for (const c of byCo(L("DIGIT Certification"), f)) { const e = emps.get(s(c["employee"])); if (!e || !activeOn(e, on) || (f["department"] && e["department"] !== f["department"])) continue; const a = per.get(e.name); if (a) a.push(c); else per.set(e.name, [c]); }
      const rows: Row[] = []; let compliant = 0, expired = 0;
      for (const [id, cs] of per) { const bad = cs.filter((c) => d10(c["expiry_date"]) && d10(c["expiry_date"]) < on); expired += bad.length; if (!bad.length) { compliant++; continue; } for (const c of bad) rows.push({ employee: id, employee_name: emps.get(id)?.["employee_name"], certification_name: c["certification_name"], expiry_date: d10(c["expiry_date"]), days_expired: days(d10(c["expiry_date"]), on) }); }
      rows.sort((a, b) => n(b["days_expired"]) - n(a["days_expired"]));
      return { columns: [col("employee", "Employee", "Link", "Employee"), col("employee_name", "Employee Name"), col("certification_name", "Certification", "Data", undefined, 200), col("expiry_date", "Expired On", "Date"), col("days_expired", "Days Expired", "Int", undefined, 100)], rows,
        summary: cards(C40, [per.size, compliant, pct(compliant, per.size), expired]) }; } },
  { id: "R41", name: "HR Span of Control", ar: "نطاق الإشراف", section: "01.1", ref: "Employee", roles: HR, filters: [CO, ASOF], cards: C41, chart: { label: "manager_name", value: "direct_reports" },
    run: (f) => { const on = f["as_of_date"] || today(); const emps = empIndex(); const act = byCo(L("Employee"), f).filter((e) => activeOn(e, on)); const g = new Map<string, number>();
      for (const e of act) { const m = s(e["reports_to"]); if (m && m !== e.name) g.set(m, (g.get(m) ?? 0) + 1); }
      const max = policyValue("span_of_control_max", on, f["company"]) ?? 12;
      const rows: Row[] = [...g].map(([m, k]) => ({ manager: m, manager_name: emps.get(m)?.["employee_name"] ?? m, department: emps.get(m)?.["department"], direct_reports: k, flag: k > max ? `Above ${max}` : k === 1 ? "Single report" : "" })).sort((a, b) => n(b["direct_reports"]) - n(a["direct_reports"]));
      const tot = rows.reduce((a, r) => a + n(r["direct_reports"]), 0);
      return { columns: [col("manager", "Manager", "Link", "Employee"), col("manager_name", "Manager Name"), col("department", "Department", "Link", "Department"), col("direct_reports", "Direct Reports", "Int", undefined, 110), col("flag", "Flag", "Data", undefined, 120)], rows: rows.length ? [...rows, { manager_name: "Total", is_total: true, bold: true, direct_reports: tot }] : [],
        summary: cards(C41, [rows.length, rows.length ? r1(tot / rows.length) : 0, rows.filter((r) => n(r["direct_reports"]) > max).length]) }; } },
  { id: "R42", name: "HR Labour Cost vs Budget by Project", ar: "تكلفة العمالة مقابل ميزانية المشروع", section: "06.2", ref: "DIGIT Site Worker Assignment", roles: FIN, filters: [CO, FROM, TO], cards: C42, chart: { label: "project", value: "actual" },
    run: (f) => { const { from, to } = range(f); const slips = L("Salary Slip").filter((x) => Number(x.docstatus) === 1 && inRange(x["start_date"], from, to)); const g = new Map<string, Row>();
      const get = (p: string) => g.get(p) ?? { project: p, budget: 0, actual: 0, workers: 0 };
      for (const b of byCo(L("DIGIT Labor Cost Budget"), f).filter((x) => s(x["project"]))) { const r = get(s(b["project"])); const lines = (b["lines"] as Doc[] | undefined) ?? []; r["budget"] = r2(n(r["budget"]) + (n(b["total_budget"]) || lines.reduce((a, l) => a + (n(l["annual_amount"]) || n(l["monthly_amount"]) * 12), 0))); g.set(s(b["project"]), r); }
      const workers = new Map<string, Set<string>>();
      for (const a of byCo(L("DIGIT Site Worker Assignment"), f).filter((x) => s(x["project"]) && s(x["status"]) !== "Planned")) { const p = s(a["project"]); const af = d10(a["from_date"]) || from, at = d10(a["to_date"]) || to; const r = get(p); (workers.get(p) ?? workers.set(p, new Set()).get(p)!).add(s(a["employee"]));
        for (const sl of slips.filter((x) => x["employee"] === a["employee"])) { const ss = d10(sl["start_date"]), se = d10(sl["end_date"]) || ss; const o1 = af > ss ? af : ss, o2 = at < se ? at : se; if (o2 < o1) continue; const share = (days(o1, o2) + 1) / Math.max(1, days(ss, se) + 1); r["actual"] = r2(n(r["actual"]) + n(sl["gross_pay"]) * share); }
        g.set(p, r); }
      const rows = [...g.values()].map((r) => ({ ...r, workers: workers.get(s(r["project"]))?.size ?? 0, variance: r2(n(r["budget"]) - n(r["actual"])), used_pct: pct(n(r["actual"]), n(r["budget"])) })).sort((a, b) => b.used_pct - a.used_pct);
      const t = total(rows, ["budget", "actual", "workers", "variance"], { project: "Total" }); t["used_pct"] = pct(n(t["actual"]), n(t["budget"]));
      return { columns: [col("project", "Project", "Link", "Project"), col("workers", "Workers", "Int", undefined, 90), cur("budget", "Labour Budget"), cur("actual", "Actual Labour Cost"), cur("variance", "Remaining"), col("used_pct", "Used %", "Percent", undefined, 90)], rows: rows.length ? [...rows, t] : [],
        summary: cards(C42, [n(t["budget"]), n(t["actual"]), n(t["variance"])]) }; } },
];
export const R2_REPORT_TITLES_AR: Record<string, string> = Object.fromEntries(HR_REPORTS_R2.map((r) => [r.name, r.ar]));
export const R2_CARD_AR: Record<string, string> = Object.fromEntries(HR_REPORTS_R2.flatMap((r) => r.cards.map((c) => [c.label, c.ar])));
