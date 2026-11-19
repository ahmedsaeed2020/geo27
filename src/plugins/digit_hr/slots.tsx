import type { EnterpriseIndicator, ExperienceSlots } from "../experienceSlots";
import { HrShellNav } from "@/components/digithr/HrShellNav";
import { HrR9Panels } from "@/components/digithr/R9Panels";
import { HrR10Panels } from "@/components/digithr/R10Panels";
import { HR_ROLE_NAMES } from "./r10/roles";
import { HrReleaseNotes } from "@/components/digithr/R9Extras";
import { useHrContextReset } from "@/components/digithr/HrNav";
import { digitIconSrc } from "@/components/enterprise/DigitIcon";
import { HR_MODULE_ICON, appIconFor } from "@/components/enterprise/iconMap";
import { MODULES } from "./v5/data";
import NATIVE_MAP from "./nativeMap";

const HR_OWNED = new Set<string>(Object.values(NATIVE_MAP).flat().map((t) => t.doctype));

/** Source-backed DIGIT HR indicators (counts of permitted HRMS records; drill = native list with the same filters). */
const HR_INDICATORS: EnterpriseIndicator[] = [
  { id: "hr-emp-active", doctype: "Employee", filters: [["status", "=", "Active"]],
    label: { en: "Active employees", ar: "الموظفون النشطون" },
    definition: { en: "Employee records with status Active", ar: "سجلات الموظفين بحالة نشط" } },
  { id: "hr-leave-open", doctype: "Leave Application", filters: [["status", "=", "Open"], ["docstatus", "=", 0]], tone: "attention",
    label: { en: "Open leave applications", ar: "طلبات إجازة مفتوحة" },
    definition: { en: "Leave Applications with status Open, awaiting a decision", ar: "طلبات إجازة بحالة مفتوح بانتظار القرار" } },
  { id: "hr-job-open", doctype: "Job Opening", filters: [["status", "=", "Open"]],
    label: { en: "Open job openings", ar: "وظائف شاغرة مفتوحة" },
    definition: { en: "Job Openings with status Open", ar: "الوظائف الشاغرة بحالة مفتوحة" } },
  { id: "hr-slip-draft", doctype: "Salary Slip", filters: [["docstatus", "=", 0]],
    label: { en: "Draft salary slips", ar: "قسائم رواتب مسودة" },
    definition: { en: "Salary Slips saved but not yet submitted (visible only with salary permission)", ar: "قسائم رواتب محفوظة ولم تُعتمد (تظهر فقط لمن لديه صلاحية الرواتب)" } },
];

export const digitHrSlots: ExperienceSlots = {
  Sidebar: (p) => <HrShellNav {...p} />,
  useShellEffects: () => useHrContextReset(),
  // HR R9 actions on native forms (delegation, parallel approval, service catalog, bank change, routing, payroll lock, invites)
  FormPanels: (p) => <><HrR9Panels {...p} /><HrR10Panels {...p} /></>,
  HelpExtras: HrReleaseNotes,
  unsavedGuard: { except: [], message: { en: "You have unsaved changes. Leave without saving?", ar: "لديك تغييرات غير محفوظة. هل تريد المغادرة دون حفظ؟" } },
  dock: { icon: appIconFor("digit_hr", "dock")!, label: "DIGIT HR", label_ar: "ديجيت للموارد البشرية", short: "HR", short_ar: "الموارد البشرية", home: "/digit-hr", main: ["home", "digit_hr", "hrms", "crm", "insights", "reports"] },
  enterprise: {
    description: { en: "Core HR, talent, workforce, payroll and employee services on the shared DIGIT HR records.", ar: "الموارد البشرية الأساسية والمواهب والقوى العاملة والرواتب وخدمات الموظفين على سجلات DIGIT HR المشتركة." },
    modules: () => MODULES.map((m) => ({ id: m.id, label: { en: m.en, ar: m.ar }, to: `/digit-hr/m/${m.id}`, ...(HR_MODULE_ICON[m.id] ? { icon: digitIconSrc(HR_MODULE_ICON[m.id]!, "dark") } : {}) })),
    indicators: HR_INDICATORS,
    // owner ruling DEC-015 (2026-11-14): app access comes from the user's HR role (employee self-service included)
    roles: [...new Set(["HR Manager", "HR User", "Employee", "Leave Approver", "Expense Approver", "Interviewer", "System Manager", ...HR_ROLE_NAMES])],
    owns: (dt) => HR_OWNED.has(dt),
  },
};
