/** V6 smart sidebar + employee lifecycle config (owner decision 2026-10-15). Destinations resolve only through nativeMap.ts, so nothing links to an unverified screen. */
import NATIVE, { type NativeTarget } from "@/plugins/digit_hr/nativeMap";

/** Four featured native registers per module (V6 registry `featured`). */
export const FEATURED: Record<string, string[]> = {
  "01": ["Employee", "Employee Transfer", "Employee Promotion", "Department"],
  "02": ["Job Requisition", "Job Applicant", "Interview", "Job Offer"],
  "03": ["Employee Checkin", "Attendance", "Shift Assignment", "Leave Application"],
  "04": ["Payroll Entry", "Salary Slip", "Salary Structure Assignment", "Full and Final Statement"],
  "05": ["Leave Application", "Expense Claim", "Employee Advance", "Employee"],
  "06": ["Employee", "Department", "Attendance", "Job Opening"],
  "07": ["HR Settings", "Role", "User Permission", "Notification"],
};

export type Placed = NativeTarget & { sub: string };

/** Native target for a DocType, preferring a section inside the given module (keeps HR context on the right section). */
export function placeDoc(doctype: string, module?: string): Placed | null {
  const ids = Object.keys(NATIVE).sort((a, b) => Number(!module || !a.startsWith(module + ".")) - Number(!module || !b.startsWith(module + ".")));
  for (const sub of ids) { const t = (NATIVE[sub] ?? []).find((x) => x.doctype === doctype); if (t) return { ...t, sub }; }
  return null;
}

export const quickDocs = (module: string) => (FEATURED[module] ?? []).map((d) => placeDoc(d, module)).filter((x): x is Placed => !!x);

/** V6 12-step employee journey. Sources are DocType names; unmapped ones render as source gaps, never fake links. */
export const LIFECYCLE: { step: string; ar: string; en: string; section: string; docs: string[] }[] = [
  { step: "01", ar: "الاحتياج الوظيفي", en: "Workforce need", section: "02.1", docs: ["Job Requisition", "Job Opening", "Staffing Plan"] },
  { step: "02", ar: "الاستقطاب والمتقدمون", en: "Sourcing & applicants", section: "02.1", docs: ["Job Applicant", "Job Opening"] },
  { step: "03", ar: "المقابلات والتقييم", en: "Interviews & feedback", section: "02.1", docs: ["Interview", "Interview Feedback"] },
  { step: "04", ar: "العروض والقبول", en: "Offers & acceptance", section: "02.1", docs: ["Job Offer", "Job Applicant"] },
  { step: "05", ar: "التهيئة ومباشرة العمل", en: "Onboarding", section: "02.2", docs: ["Employee Onboarding", "Employee", "Employee Onboarding Template"] },
  { step: "06", ar: "إدارة ملف الموظف", en: "Employee record", section: "01.4", docs: ["Employee", "Employee Transfer", "Employee Promotion"] },
  { step: "07", ar: "الحضور والورديات والإجازات", en: "Attendance, shifts & leave", section: "03.1", docs: ["Employee Checkin", "Attendance", "Shift Assignment", "Leave Application"] },
  { step: "08", ar: "الرواتب والمزايا", en: "Payroll & benefits", section: "04.1", docs: ["Salary Structure Assignment", "Payroll Entry", "Salary Slip", "Additional Salary"] },
  { step: "09", ar: "الأداء والتعلم", en: "Performance & learning", section: "02.3", docs: ["Goal", "Appraisal", "Training Event", "Employee Skill Map"] },
  { step: "10", ar: "النقل والترقية وتغيير العلاقة", en: "Transfer & promotion", section: "01.5", docs: ["Employee Transfer", "Employee Promotion", "Employee"] },
  { step: "11", ar: "الاستقالة والخروج وتسليم العهد", en: "Separation & exit", section: "01.5", docs: ["Employee Separation", "Exit Interview", "Employee", "Asset Movement"] },
  { step: "12", ar: "التصفية ونهاية الخدمة", en: "Final settlement & EOSB", section: "04.3", docs: ["Gratuity", "Full and Final Statement", "Salary Slip", "Payment Entry"] },
];
