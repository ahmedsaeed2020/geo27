/**
 * Module 07 check-based setup findings over PRE-SCOPED rows. Each check names its source DocType/field rule and the
 * concrete consequence documented by the source behaviour. A check whose sources are not ready (loading, denied,
 * unavailable, error) or whose inference would need rows hidden from the reader is NOT_EVALUATED — never PASS.
 * Findings are review evidence, not compliance verdicts; nothing here writes configuration.
 */
import { holidayListFor, holidayOn } from './attendanceEligibility';
import { orgExceptions } from './orgFacts';

type Row = Record<string, unknown>;
const s = (v: unknown) => (v == null ? '' : String(v));
const active = (e: Row) => s(e['status'] || 'Active') === 'Active';

export type CheckStatus = 'PASS' | 'FINDING' | 'INFO' | 'NOT_EVALUATED';
export type CheckArea = 'calendar' | 'leave' | 'approval' | 'payroll' | 'identity' | 'organization' | 'shift';
export type SetupCheck = {
  id: string; area: CheckArea; ar: string; en: string; ruleAr: string; ruleEn: string; source: string;
  status: CheckStatus; evidence: { doctype: string; names: string[] }; missing: string[]; reasonAr?: string; reasonEn?: string;
};
export type CheckCtx = {
  /** rows when the source is ready (possibly empty), null when it is loading/denied/unavailable/failed */
  rows(dt: string): Row[] | null;
  today: string;
  /** reader sees every row of payroll/leave sources (HR administrator); otherwise absence is not inferred */
  fullScope: boolean;
  exists(doctype: string, name: string): boolean;
};

const NOT_INFERRED: [string, string] = ['لا يُستنتج الغياب لأن رؤيتك لهذه السجلات مقيّدة بنطاقك.', 'Absence is not inferred because your view of these records is scope-limited.'];

export function setupChecks(ctx: CheckCtx): SetupCheck[] {
  const out: SetupCheck[] = [];
  const add = (c: Omit<SetupCheck, 'status' | 'evidence' | 'missing'>, need: string[], run: (r: Record<string, Row[]>) => { status: CheckStatus; doctype: string; names: string[] }, scopeLimited = false) => {
    const got: Record<string, Row[]> = {}; const missing: string[] = [];
    for (const dt of need) { const r = ctx.rows(dt); if (r === null) missing.push(dt); else got[dt] = r; }
    if (missing.length) { out.push({ ...c, status: 'NOT_EVALUATED', evidence: { doctype: need[0] ?? '', names: [] }, missing }); return; }
    if (scopeLimited && !ctx.fullScope) { out.push({ ...c, status: 'NOT_EVALUATED', evidence: { doctype: need[0] ?? '', names: [] }, missing: [], reasonAr: NOT_INFERRED[0], reasonEn: NOT_INFERRED[1] }); return; }
    const res = run(got);
    out.push({ ...c, status: res.status, evidence: { doctype: res.doctype, names: res.names }, missing: [] });
  };
  const t = ctx.today;
  const emps = (r: Record<string, Row[]>) => (r['Employee'] ?? []).filter(active);

  add({ id: 'holiday-calendar', area: 'calendar', ar: 'تقويم عطلات يغطي اليوم', en: 'Holiday calendar covers today', ruleAr: 'قائمة عطلات يقع اليوم بين تاريخ بدايتها وتاريخ نهايتها.', ruleEn: 'Holiday List: from_date ≤ today ≤ to_date', source: 'Holiday List.from_date/to_date' },
    ['Holiday List'], (r) => { const cover = (r['Holiday List'] ?? []).filter((l) => s(l['from_date']) <= t && (!s(l['to_date']) || s(l['to_date']) >= t)); return cover.length ? { status: 'PASS', doctype: 'Holiday List', names: cover.map((l) => s(l['name'])) } : { status: 'FINDING', doctype: 'Holiday List', names: [] }; });

  add({ id: 'holiday-resolution', area: 'calendar', ar: 'موظفون بلا تقويم عطلات', en: 'Employees without a holiday list', ruleAr: 'إسناد قائمة عطلات معتمد للموظف أو لشركته (أو الحقول السابقة للإصدار 16) — بدونه يتعذر احتساب العطلات في الحضور والإجازات.', ruleEn: 'A submitted Holiday List Assignment for the employee or their company (or the pre-v16 Employee/Company fields) — without one, holidays cannot be applied to attendance and leave.', source: 'Holiday List Assignment.assigned_to/from_date, Employee.holiday_list, Company.default_holiday_list' },
    ['Employee', 'Company', 'Holiday List Assignment'], (r) => { const names = emps(r).filter((e) => !holidayListFor(e, r['Company'] ?? [], r['Holiday List Assignment'], t)).map((e) => s(e['name'])); return { status: names.length ? 'FINDING' : 'PASS', doctype: 'Employee', names }; });

  add({ id: 'holiday-coverage', area: 'calendar', ar: 'تقويم الموظف لا يغطي اليوم', en: "Employee's holiday list does not cover today", ruleAr: 'التقويم المُسند يجب أن يغطي التاريخ الحالي.', ruleEn: 'The resolved holiday list must cover the current date.', source: 'Holiday List.from_date/to_date via Holiday List Assignment / Employee / Company' },
    ['Employee', 'Company', 'Holiday List', 'Holiday List Assignment'], (r) => { const names = emps(r).filter((e) => { const l = holidayListFor(e, r['Company'] ?? [], r['Holiday List Assignment'], t); return !!l && (r['Holiday List'] ?? []).some((x) => s(x['name']) === l) && !holidayOn(l, r['Holiday List'] ?? [], t).known; }).map((e) => s(e['name'])); return { status: names.length ? 'FINDING' : 'PASS', doctype: 'Employee', names }; });

  add({ id: 'leave-allocation', area: 'leave', ar: 'موظفون بلا رصيد إجازة ساري', en: 'Employees without a current leave allocation', ruleAr: 'تخصيص إجازة معتمد يغطي اليوم — بدونه يرفض النظام طلبات الإجازة المدفوعة.', ruleEn: 'A submitted Leave Allocation covering today — without one, paid leave applications are refused.', source: 'Leave Allocation.employee/from_date/to_date/docstatus' },
    ['Employee', 'Leave Allocation'], (r) => { const has = new Set((r['Leave Allocation'] ?? []).filter((a) => Number(a['docstatus']) === 1 && s(a['from_date']) <= t && (!s(a['to_date']) || s(a['to_date']) >= t)).map((a) => s(a['employee']))); const names = emps(r).filter((e) => !has.has(s(e['name']))).map((e) => s(e['name'])); return { status: names.length ? 'FINDING' : 'PASS', doctype: 'Employee', names }; }, true);

  const settings = (r: Record<string, Row[]>) => (r['HR Settings'] ?? [])[0];
  add({ id: 'leave-approver', area: 'approval', ar: 'طلبات إجازة مفتوحة بلا معتمد', en: 'Open leave applications without an approver', ruleAr: 'عند تفعيل إلزامية معتمد الإجازة في إعدادات الموارد البشرية يجب تحديد معتمد لكل طلب إجازة.', ruleEn: 'When HR Settings.leave_approver_mandatory_in_leave_application is on, leave_approver is required.', source: 'HR Settings, Leave Application.leave_approver' },
    ['HR Settings', 'Leave Application'], (r) => { const open = (r['Leave Application'] ?? []).filter((l) => Number(l['docstatus'] ?? 0) === 0 && s(l['status'] || 'Open') === 'Open' && !s(l['leave_approver'])).map((l) => s(l['name'])); if (!Number(settings(r)?.['leave_approver_mandatory_in_leave_application'] ?? 0)) return { status: 'INFO', doctype: 'Leave Application', names: open }; return { status: open.length ? 'FINDING' : 'PASS', doctype: 'Leave Application', names: open }; });

  add({ id: 'expense-approver', area: 'approval', ar: 'مطالبات مسودة بلا معتمد', en: 'Draft expense claims without an approver', ruleAr: 'عند تفعيل إلزامية معتمد المصروفات في إعدادات الموارد البشرية يجب تحديد معتمد لكل مطالبة.', ruleEn: 'When HR Settings.expense_approver_mandatory_in_expense_claim is on, expense_approver is required.', source: 'HR Settings, Expense Claim.expense_approver' },
    ['HR Settings', 'Expense Claim'], (r) => { const open = (r['Expense Claim'] ?? []).filter((l) => Number(l['docstatus'] ?? 0) === 0 && !s(l['expense_approver'])).map((l) => s(l['name'])); if (!Number(settings(r)?.['expense_approver_mandatory_in_expense_claim'] ?? 0)) return { status: 'INFO', doctype: 'Expense Claim', names: open }; return { status: open.length ? 'FINDING' : 'PASS', doctype: 'Expense Claim', names: open }; });

  add({ id: 'structure-draft', area: 'payroll', ar: 'هياكل رواتب غير معتمدة', en: 'Salary structures not submitted', ruleAr: 'لا يُسند هيكل راتب ولا تُنشأ قسيمة منه قبل اعتماده.', ruleEn: 'A salary structure cannot be assigned or used for slips until it is submitted.', source: 'Salary Structure.docstatus' },
    ['Salary Structure'], (r) => { const names = (r['Salary Structure'] ?? []).filter((x) => Number(x['docstatus'] ?? 0) === 0).map((x) => s(x['name'])); return { status: names.length ? 'FINDING' : 'PASS', doctype: 'Salary Structure', names }; });

  add({ id: 'salary-assignment', area: 'payroll', ar: 'موظفون بلا إسناد راتب ساري', en: 'Employees without an effective salary assignment', ruleAr: 'إسناد هيكل راتب معتمد يبدأ في اليوم أو قبله — بدونه لا تُنشأ قسيمة راتب.', ruleEn: 'A submitted Salary Structure Assignment with from_date ≤ today — without one, no salary slip is created.', source: 'Salary Structure Assignment.employee/from_date/docstatus' },
    ['Employee', 'Salary Structure Assignment'], (r) => { const has = new Set((r['Salary Structure Assignment'] ?? []).filter((a) => Number(a['docstatus']) === 1 && s(a['from_date']) <= t).map((a) => s(a['employee']))); const names = emps(r).filter((e) => !has.has(s(e['name']))).map((e) => s(e['name'])); return { status: names.length ? 'FINDING' : 'PASS', doctype: 'Employee', names }; }, true);

  add({ id: 'identity-mapping', area: 'identity', ar: 'مستخدم مرتبط بأكثر من موظف نشط', en: 'User linked to more than one active employee', ruleAr: 'حساب المستخدم يجب أن يرتبط بموظف نشط واحد فقط، وإلا تتعطل الخدمة الذاتية لذلك المستخدم.', ruleEn: 'Employee.user_id must be unique among active employees, otherwise self-service is blocked for that user.', source: 'Employee.user_id' },
    ['Employee'], (r) => { const by = new Map<string, string[]>(); for (const e of emps(r)) { const u = s(e['user_id']); if (u) by.set(u, [...(by.get(u) ?? []), s(e['name'])]); } const names = [...by.values()].filter((v) => v.length > 1).flat(); return { status: names.length ? 'FINDING' : 'PASS', doctype: 'Employee', names }; });

  add({ id: 'department-links', area: 'organization', ar: 'قسم الموظف غير موجود', en: "Employee's department record not found", ruleAr: 'قسم الموظف يجب أن يشير إلى سجل قسم قائم.', ruleEn: 'Employee.department must reference an existing Department record.', source: 'Employee.department → Department' },
    ['Employee', 'Department'], (r) => { const names = [...new Set(orgExceptions(emps(r), r['Department'] ?? [], ctx.exists).rows.filter((x) => x.kind === 'dept-missing').map((x) => x.employee))]; return { status: names.length ? 'FINDING' : 'PASS', doctype: 'Employee', names }; });

  add({ id: 'shift-unassigned', area: 'shift', ar: 'أنواع ورديات بلا إسناد ساري', en: 'Shift types with no active assignment today', ruleAr: 'إسناد وردية معتمد ونشط يغطي اليوم.', ruleEn: 'A submitted, active Shift Assignment covering today.', source: 'Shift Type, Shift Assignment' },
    ['Shift Type', 'Shift Assignment'], (r) => { const used = new Set((r['Shift Assignment'] ?? []).filter((a) => Number(a['docstatus']) === 1 && s(a['status']) === 'Active' && s(a['start_date']) <= t && (!s(a['end_date']) || s(a['end_date']) >= t)).map((a) => s(a['shift_type']))); const names = (r['Shift Type'] ?? []).filter((x) => !used.has(s(x['name']))).map((x) => s(x['name'])); return { status: names.length ? 'INFO' : 'PASS', doctype: 'Shift Type', names }; });

  return out;
}
