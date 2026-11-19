import { VISIT_DT } from "@/plugins/digit_fsm/schema";
/**
 * DIGIT FSM + ITM experience slots: the shared module-rail navigation over the nine manifest groups (Navigation V2), the dock entry with
 * the official Maintenance service icon, the unsaved-changes guard and the Enterprise Home entry (modules + counts of
 * permitted records). Display only — records, workflows and validation stay in the shared Core engines and the app's
 * own domain services / hooks.
 */
import type { EnterpriseIndicator, ExperienceSlots } from "../experienceSlots";
import { ModuleRailShell } from "@/components/plugins/ModuleRailNav";
import { digitIconSrc } from "@/components/enterprise/DigitIcon";
import { FSM_MODULE_ICON, appIconFor } from "@/components/enterprise/iconMap";
import { railModules } from "../appModules";
import { FSM_NAV, digitFsm } from "./index";
import { FSM_DOCTYPES } from "./schema";

const OWNED = new Set<string>(FSM_DOCTYPES.map((d) => d.name));
void FSM_NAV;

/** Counts of permitted records; definitions are the app's own workflow states. */
const INDICATORS: EnterpriseIndicator[] = [
  { id: "fsm-critical-open", doctype: "FSM Deficiency", filters: [["severity", "=", "Critical"], ["workflow_state", "in", ["Open", "Quoted", "Approved for Repair", "Retest Pending", "Disputed"]]], tone: "attention",
    label: { en: "Critical open findings", ar: "ملاحظات حرجة مفتوحة" }, definition: { en: "Findings of severity Critical not yet verified closed", ar: "ملاحظات بخطورة حرجة لم تُغلق بعد التحقق" } },
  { id: "fsm-review", doctype: "FSM Inspection Run", filters: [["workflow_state", "=", "Submitted for Review"]], tone: "attention",
    label: { en: "Inspections awaiting review", ar: "فحوص بانتظار المراجعة" }, definition: { en: "Inspection runs in workflow state Submitted for Review", ar: "تشغيلات فحص بحالة مقدّم للمراجعة" } },
  { id: "fsm-unscheduled", doctype: VISIT_DT, filters: [["workflow_state", "=", "Unscheduled"]],
    label: { en: "Unscheduled visits", ar: "زيارات غير مجدولة" }, definition: { en: "Visits without technician or time", ar: "زيارات بلا فني أو موعد" } },
  { id: "fsm-agreements", doctype: "FSM Service Agreement", filters: [["workflow_state", "=", "Active"]],
    label: { en: "Active service agreements", ar: "اتفاقيات خدمة نشطة" }, definition: { en: "Agreements in workflow state Active", ar: "اتفاقيات بحالة نشطة" } },
];

export const digitFsmSlots: ExperienceSlots = {
  Sidebar: (p) => <ModuleRailShell appName="digit_fsm" {...p} />,
  unsavedGuard: { except: [], message: { en: "You have unsaved changes. Leave without saving?", ar: "لديك تغييرات غير محفوظة. هل تريد المغادرة دون حفظ؟" } },
  dock: { icon: appIconFor("digit_fsm", "dock")!, label: "DIGIT FSM + ITM", label_ar: "ديجيت للخدمات الميدانية", short: "FSM", short_ar: "الخدمات", home: "/plugins/digit_fsm", main: ["home", "digit_fsm", "reports"] },
  enterprise: {
    description: { en: "Service sites, systems and devices; agreements and recurring obligations; jobs, visits and dispatch; inspections, findings, quotes, repairs and retests on the shared DIGIT records.", ar: "مواقع الخدمة والأنظمة والأجهزة؛ العقود والالتزامات الدورية؛ أوامر العمل والزيارات والجدولة؛ الفحوص والملاحظات والعروض والإصلاحات وإعادة الفحص على سجلات DIGIT المشتركة." },
    modules: () => railModules(digitFsm).map((m) => {
      const t = m.overview?.to ?? "";
      const to = t.startsWith("doctype:") || t.startsWith("report:") || !t ? "/plugins/digit_fsm" : `/plugins/digit_fsm/${t}`;
      return { id: m.key, label: { en: m.label, ar: m.label_ar ?? m.label }, to, icon: digitIconSrc(FSM_MODULE_ICON[m.icon ?? ""] ?? "ui-dashboard", "dark") };
    }),
    indicators: INDICATORS,
    owns: (dt) => OWNED.has(dt),
  },
};
