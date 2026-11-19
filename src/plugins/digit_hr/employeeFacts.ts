/**
 * Section 01.4 employee master facts over PRE-SCOPED Employee rows (presentation only).
 * Each profile field is listed with the source behaviour that depends on it, so a gap names its consequence.
 */
import { adapter, type Doc } from '@/lib/adapter';
import { accountNeed, approverSet } from './userAccounts';
type Row = Record<string, unknown>;
const s = (v: unknown) => (v == null ? '' : String(v));

export const PROFILE_FIELDS: { field: string; ar: string; en: string; whyAr: string; whyEn: string }[] = [
  { field: 'department', ar: 'القسم', en: 'Department', whyAr: 'مرشحات دورة الرواتب والهيكل التنظيمي.', whyEn: 'Payroll Entry filters and the department tree.' },
  { field: 'designation', ar: 'المسمى', en: 'Designation', whyAr: 'مرشحات دورة الرواتب وخطط التوظيف.', whyEn: 'Payroll Entry filters and staffing plans.' },
  { field: 'date_of_joining', ar: 'تاريخ الالتحاق', en: 'Date of joining', whyAr: 'أهلية الحضور والرواتب والإجازات.', whyEn: 'Attendance, payroll and leave eligibility.' },
  { field: 'reports_to', ar: 'المدير المباشر', en: 'Reports to', whyAr: 'فريق المدير ومعتمد الإجازة الافتراضي.', whyEn: "Manager's team and the default leave approver." },
  { field: 'user_id', ar: 'حساب المستخدم', en: 'User account', whyAr: 'الخدمة الذاتية للموظف.', whyEn: 'Employee self-service.' },
  { field: 'employment_type', ar: 'نوع التوظيف', en: 'Employment type', whyAr: 'تحليلات القوى العاملة حسب نوع التوظيف.', whyEn: 'Workforce mix analytics.' },
];

export type ProfileGap = { employee: string; employeeName: string; company: string; department: string; missing: string[]; score: number };

/** Active employees with the profile fields they lack; score = share of PROFILE_FIELDS present (0–100). */
export function profileGaps(emps: Row[], fields = PROFILE_FIELDS.map((f) => f.field)): ProfileGap[] {
  const ap = approverSet(adapter.list('Employee'));
  return emps.filter((e) => s(e['status'] || 'Active') === 'Active').map((e) => {
    // DEC-015: a missing user account is a gap only for employees who need one (site workers do not)
    const own = fields.filter((f) => f !== 'user_id' || accountNeed(e as Doc, ap).needs);
    const missing = own.filter((f) => !s(e[f]));
    return { employee: s(e['name']), employeeName: s(e['employee_name']) || s(e['name']), company: s(e['company']), department: s(e['department']), missing, score: Math.round(((own.length - missing.length) / own.length) * 100) };
  }).sort((a, b) => a.score - b.score || a.employeeName.localeCompare(b.employeeName));
}

/** Count of active employees missing each field (for the field coverage strip). */
export function fieldCoverage(gaps: ProfileGap[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const f of PROFILE_FIELDS) out[f.field] = gaps.filter((g) => g.missing.includes(f.field)).map((g) => g.employee);
  return out;
}

/** Most recently modified employees (record `modified`, else `creation`), newest first. */
export function recentlyUpdated(emps: Row[], limit = 8): Row[] {
  const at = (e: Row) => s(e['modified'] || e['creation']);
  return [...emps].filter((e) => at(e)).sort((a, b) => at(b).localeCompare(at(a))).slice(0, limit);
}
