/**
 * DIGIT HR roles (round-2 ruling 3): every role the definition names is its own Frappe Role with the permission matrix of
 * 12_ROLE_PERMISSION_MATRIX.csv (R = read, C = create/edit, A = approve) per HR section, plus the roles the module specs
 * name (HR Operations, CHRO, Payroll Specialist, Integration Admin, HR Talent, HR Business Partner). The matrix becomes
 * DocPerm rows on every DocType of the section (app DocTypes in their own definition, native DocTypes as app DocPerm rows
 * appended by the plugin runtime), and the record scope column becomes a narrowing rule in ./scope.ts. Self/team roles
 * (Employee, Line Manager) only receive create/approve on documents that carry an employee, so a matrix letter never lets
 * an employee edit a setup document.
 */
export interface HrRole { role: string; ar: string; scope: [string, string]; letters: Record<string, "R" | "C" | "A"> }
export const SECTION_IDS = ["01.1", "01.2", "01.3", "01.4", "01.5", "01.6", "02.1", "02.2", "02.3", "02.4", "02.5", "03.1", "03.2", "03.3", "03.4", "04.1", "04.2", "04.3", "04.4", "04.5", "05.1", "05.2", "05.3", "06.1", "06.2", "06.3", "07.1", "07.2", "07.3", "07.4"] as const;

/** One matrix row: letters in SECTION_IDS order, "." = no access. */
const row = (s: string): Record<string, "R" | "C" | "A"> => {
  const cells = s.split(" "); const out: Record<string, "R" | "C" | "A"> = {};
  SECTION_IDS.forEach((id, i) => { const c = cells[i]; if (c === "R" || c === "C" || c === "A") out[id] = c; });
  return out;
};
//                              01.1-01.6   02.1-02.5 03.1-03.4 04.1-04.5 05.1-05.3 06.1-06.3 07.1-07.4
export const HR_ROLES: HrRole[] = [
  { role: "Employee", ar: "الموظف", scope: ["Own records only (Employee.user_id = user)", "سجلاته فقط (المستخدم المرتبط بالموظف)"],
    letters: row(". . . R . R . . C R . C C C . R . . R C C . C . . . . . . .") },
  { role: "Line Manager", ar: "المدير المباشر", scope: ["Own team through reports_to (all levels), without salary, IBAN or GOSI", "فريقه عبر التبعية الإدارية بكل مستوياتها، دون الراتب والآيبان والتأمينات"],
    letters: row(". . . R C . C R A R R A A A . . . . C A . A C R . R . . . .") },
  { role: "HR User", ar: "مستخدم الموارد البشرية", scope: ["Permitted companies (User Permission: Company), without permission-level-1 fields", "الشركات المصرح بها، دون الحقول الحساسة"],
    letters: row("C C C C C C C C C C C C C C C . . . . . C C C C . C . . C .") },
  { role: "HR Manager", ar: "مدير الموارد البشرية", scope: ["Permitted companies with sensitive fields", "الشركات المصرح بها مع الحقول الحساسة"],
    letters: row("A A A A A A A A A A A A A A A A A A A A A A A A A A A R A A") },
  { role: "Payroll Officer", ar: "مسؤول الرواتب", scope: ["Permitted companies; salary and IBAN", "الشركات المصرح بها؛ الراتب والآيبان"],
    letters: row(". . . R . . . . . . . R R . . C C C R R . . . . . R . . . .") },
  { role: "Payroll Manager", ar: "مدير الرواتب", scope: ["As Payroll Officer plus approval and period lock", "كمسؤول الرواتب مع الاعتماد وقفل الفترة"],
    letters: row(". . . R . . . . . . . . . . . A A A R R . . . R . R . . . .") },
  { role: "Recruiter", ar: "مسؤول التوظيف", scope: ["Assigned job openings within permitted companies", "الوظائف الشاغرة المسندة إليه ضمن الشركات المصرح بها"],
    letters: row(". . R . . . C C . . . . . . . . . . . . . . . . . R . . . .") },
  { role: "Interviewer", ar: "المقيّم", scope: ["Assigned interviews only", "المقابلات المسندة إليه فقط"],
    letters: row(". . . . . . C . . . . . . . . . . . . . . . . . . . . . . .") },
  { role: "HR Service Agent", ar: "وكيل خدمات الموارد البشرية", scope: ["Cases in the routing pool; never confidential cases", "الحالات في مجموعة التوجيه؛ دون الحالات السرية"],
    letters: row(". . . R . . . . . . . . . . . . . . . . . . C . . R . . . .") },
  { role: "Employee Relations Specialist", ar: "أخصائي علاقات الموظفين", scope: ["Confidential cases and grievances", "الحالات والتظلمات السرية"],
    letters: row(". . . R . . . . . . . . . . . . . . . . . . A . . . . . . .") },
  { role: "Timekeeper", ar: "مسؤول الوقت", scope: ["Permitted branches (User Permission: Branch)", "الفروع المصرح بها"],
    letters: row(". . . . . . . . . . . . A A C . . . . . . . . . . R . . . .") },
  { role: "Finance Controller", ar: "المالية", scope: ["Permitted companies; payroll totals without unneeded personal detail", "الشركات المصرح بها؛ مجاميع الرواتب دون تفاصيل شخصية غير لازمة"],
    letters: row(". . A . . . . . . . . . . . . R A . . A . . . . R R . . . .") },
  { role: "Compliance Officer", ar: "الامتثال والقانوني", scope: ["Statutory rules and statutory reports", "القواعد والتقارير النظامية"],
    letters: row(". . . . . . . . . . . . . . . . . A . . . . . . . R . R . .") },
  { role: "Executive Leadership", ar: "المدير التنفيذي", scope: ["Totals only; no individual sensitive records", "مجاميع فقط دون سجلات فردية حساسة"],
    letters: row(". . . . . . . . . . . . . . . . . . . . . . . R A R . . . .") },
  { role: "HR Auditor", ar: "مدقق الموارد البشرية", scope: ["Read only; every change is logged", "قراءة فقط؛ كل التعديلات مسجلة"],
    letters: row("R R R R R R R R R R R R R R R R R R R R R R R R R R R R R R") },
  { role: "HR Admin", ar: "مسؤول النظام", scope: ["Settings and permissions; no payroll data by default", "الإعدادات والصلاحيات؛ دون بيانات الرواتب افتراضيًا"],
    letters: row(". . . . . . . . . . . . . . . . . . . . . . . . . . A A A A") },
  { role: "HR Operations", ar: "عمليات الموارد البشرية", scope: ["Permitted companies; operational HR documents", "الشركات المصرح بها؛ مستندات العمليات"],
    letters: row("C C C C C C C C C C . C C C C . . . . C C C C R . R . . . .") },
  { role: "CHRO", ar: "الرئيس التنفيذي للموارد البشرية", scope: ["All permitted companies with sensitive fields and approvals", "كل الشركات المصرح بها مع الحقول الحساسة والاعتمادات"],
    letters: row("A A A A A A A A A A A A A A A R R R A R A A A A A A A R R R") },
  { role: "Payroll Specialist", ar: "أخصائي الرواتب", scope: ["Payroll preparation in permitted companies", "إعداد الرواتب في الشركات المصرح بها"],
    letters: row(". . . R . . . . . . . R R . . C C R R C . . . . . R . . . .") },
  { role: "Integration Admin", ar: "مسؤول التكاملات", scope: ["Integrations, providers and exchange logs", "التكاملات والمزودون وسجلات التبادل"],
    letters: row(". . . . . . . . . . . . . . R . . . . . . . . . . . . . R A") },
  { role: "HR Talent", ar: "أخصائي المواهب", scope: ["Talent, learning and succession documents", "مستندات المواهب والتعلم والتعاقب"],
    letters: row(". . R R . . C C A A A . . . . . . . . . . . . . . R . . . .") },
  { role: "HR Business Partner", ar: "شريك أعمال الموارد البشرية", scope: ["Permitted departments (User Permission: Department)", "الإدارات المصرح بها"],
    letters: row(". . R R C . C R A R R R R R . . . . R . R A C R R R . . . .") },
];

export const HR_ROLE_NAMES = HR_ROLES.map((r) => r.role);
export const HR_ROLE_AR: Record<string, string> = Object.fromEntries(HR_ROLES.map((r) => [r.role, r.ar]));
/** Roles whose record scope is the person's own record or team (identityScope self/team rule). */
export const SELF_SCOPED = new Set(["Employee", "Line Manager"]);

export type PermRow = Record<string, string | number>;
/** DocPerm row for one letter. `hasEmployee` = the DocType carries an employee link (self/team roles may write only those). */
export function permRow(role: string, letter: "R" | "C" | "A", opts: { submittable?: boolean; hasEmployee?: boolean } = {}): PermRow | null {
  let l = letter;
  if (SELF_SCOPED.has(role) && l !== "R" && !opts.hasEmployee) l = "R";
  if (role === "HR Auditor") l = "R";
  const r: PermRow = { role, permlevel: 0, read: 1, report: 1, print: 1 };
  if (role === "HR Auditor" || role === "HR Manager" || role === "CHRO") r["export"] = 1;
  if (l === "C" || l === "A") Object.assign(r, { write: 1, create: 1 });
  if (l === "A") Object.assign(r, { delete: SELF_SCOPED.has(role) ? 0 : 1, share: 1, ...(opts.submittable ? { submit: 1, cancel: 1, amend: 1 } : {}) });
  if (SELF_SCOPED.has(role) && l === "C") r["if_owner"] = 0;
  return r;
}
/** Every role's DocPerm rows for a DocType placed in `section`. */
export function sectionPerms(section: string, opts: { submittable?: boolean; hasEmployee?: boolean } = {}): PermRow[] {
  const out: PermRow[] = [];
  for (const r of HR_ROLES) { const l = r.letters[section]; if (l) { const p = permRow(r.role, l, opts); if (p) out.push(p); } }
  if (!out.some((p) => p["role"] === "System Manager")) out.push({ role: "System Manager", permlevel: 0, read: 1, write: 1, create: 1, delete: 1, report: 1, print: 1, export: 1, share: 1, ...(opts.submittable ? { submit: 1, cancel: 1, amend: 1 } : {}) });
  return out;
}
/** Roles allowed to approve (A) in a section — the workflow approvers. */
export const approversOf = (section: string) => HR_ROLES.filter((r) => r.letters[section] === "A" && r.role !== "HR Auditor").map((r) => r.role);
/** Roles allowed to create (C or A) in a section — the workflow requesters. */
export const requestersOf = (section: string) => HR_ROLES.filter((r) => r.letters[section] === "C" || r.letters[section] === "A").map((r) => r.role).filter((r) => r !== "HR Auditor");
/** Roles that may read permission-level-1 Employee fields (salary, bank, GOSI wage). */
export const LEVEL1_ROLES = ["HR Manager", "CHRO", "Payroll Officer", "Payroll Manager", "Payroll Specialist"];
