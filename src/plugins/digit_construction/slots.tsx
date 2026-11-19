/**
 * DIGIT Construction experience slots (Final Core enterprise shell): the shared module-rail navigation over the
 * manifest's nine owner-approved modules, the dock entry with the official Contracting icon, and the Enterprise Home
 * entry (modules + source-backed counts of permitted records). Display only — records, workflows and posting stay the
 * shared Core engines and the app's own domain services.
 */
import { useEffect } from "react";
import { useRouterState } from "@tanstack/react-router";
import type { EnterpriseIndicator, ExperienceSlots } from "../experienceSlots";
import { enterApp } from "../appShell";
import { setActiveExperience, useActiveExperience } from "../theme";
import { isEnabled } from "../runtime";
// guided setup: Construction steps and checks on the shared setup guide (registered once with the app frame)
import "./setupProvider";
import { ModuleRailShell } from "@/components/plugins/ModuleRailNav";
import { digitIconSrc } from "@/components/enterprise/DigitIcon";
import { CONSTRUCTION_MODULE_ICON, appIconFor } from "@/components/enterprise/iconMap";
import { railModules } from "../appModules";
import { CONSTRUCTION_NAV, digitConstruction } from "./index";
import { CONSTRUCTION_DOCTYPES } from "./schema";
import { ConstructionFormNotices } from "./ui/formNotices";

const OWNED = new Set<string>([...CONSTRUCTION_DOCTYPES.map((d) => d.name), ...CONSTRUCTION_NAV.flatMap((g) => g.items).filter((i) => i.to.startsWith("doctype:")).map((i) => i.to.slice(8))]);

/** Counts of permitted records (definitions = the app's own workflow states / number cards). */
const INDICATORS: EnterpriseIndicator[] = [
  { id: "con-projects-open", doctype: "Project", app: "erpnext", filters: [["status", "=", "Open"], ["digit_contract_type", "is", "set"]],
    label: { en: "Active construction projects", ar: "مشاريع المقاولات النشطة" },
    definition: { en: "Open Projects with a construction contract type", ar: "مشاريع مفتوحة لها نوع عقد مقاولات" } },
  { id: "con-claims-submitted", doctype: "Digit Client Claim", filters: [["workflow_state", "=", "Submitted"]], tone: "attention",
    label: { en: "Claims awaiting certificate", ar: "مستخلصات بانتظار الشهادة" },
    definition: { en: "Client claims in workflow state Submitted", ar: "مستخلصات العملاء بحالة مقدَّم" } },
  { id: "con-books-submitted", doctype: "Digit Measurement Book", filters: [["workflow_state", "=", "Submitted"]], tone: "attention",
    label: { en: "Measurement books awaiting QS", ar: "دفاتر قياس بانتظار مراجعة الكميات" },
    definition: { en: "Measurement books in workflow state Submitted", ar: "دفاتر القياس بحالة مقدَّم" } },
  { id: "con-tenders-open", doctype: "Digit Tender", filters: [["docstatus", "=", 0]],
    label: { en: "Tenders in preparation", ar: "عطاءات قيد الإعداد" },
    definition: { en: "Tenders saved but not submitted", ar: "عطاءات محفوظة ولم تُعتمد" } },
];

/** A visible /construction address (owner ruling: Construction opens under its own path) belongs to the Construction app frame. */
export const enterConstructionFrame = (visiblePath: string) => visiblePath === "/construction" || visiblePath.startsWith("/construction/");
/**
 * Mounted by every Shell: a /construction address opened directly (shared link, reload, new tab) enters the Construction
 * app and its frame (module rail, tabs, band), exactly as arriving from the dock does; other addresses are untouched.
 */
function useConstructionFrame() {
  const href = useRouterState({ select: (r) => r.location.href });
  const active = useActiveExperience();
  useEffect(() => {
    if (typeof window === "undefined" || !enterConstructionFrame(window.location.pathname) || !isEnabled("digit_construction")) return;
    enterApp("digit_construction");
    if (active !== "digit_construction") setActiveExperience("digit_construction");
  }, [href, active]);
}

export const digitConstructionSlots: ExperienceSlots = {
  Sidebar: (p) => <ModuleRailShell appName="digit_construction" {...p} />,
  useShellEffects: useConstructionFrame,
  FormPanels: (p) => <ConstructionFormNotices {...p} />,
  unsavedGuard: { except: [], message: { en: "You have unsaved changes. Leave without saving?", ar: "لديك تغييرات غير محفوظة. هل تريد المغادرة دون حفظ؟" } },
  dock: { icon: appIconFor("digit_construction", "dock")!, label: "DIGIT Construc\u00ADtion", label_ar: "ديجيت للمقاولات", short: "Construction", short_ar: "المقاولات", home: "/plugins/digit_construction", main: ["home", "digit_construction", "reports"] },
  enterprise: {
    description: { en: "Projects, estimating and tenders, contracts and claims, subcontracts, cost, procurement, resources and financial position on the shared DIGIT records.", ar: "المشاريع والتقدير والعطاءات والعقود والمستخلصات ومقاولو الباطن والتكلفة والمشتريات والموارد والموقف المالي على سجلات DIGIT المشتركة." },
    modules: () => railModules(digitConstruction).map((m) => {
      const t = m.overview?.to ?? "";
      const to = t.startsWith("doctype:") || t.startsWith("report:") || !t ? "/plugins/digit_construction" : `/plugins/digit_construction/${t}`;
      const icon = CONSTRUCTION_MODULE_ICON[m.icon ?? "module"] ?? "ui-dashboard";
      return { id: m.key, label: { en: m.label, ar: m.label_ar ?? m.label }, to, icon: digitIconSrc(icon, "dark") };
    }),
    indicators: INDICATORS,
    // owner ruling DEC-015 (2026-11-14): app access comes from the user's Construction role, never from an automatic Desk User
    roles: [...(digitConstruction.roles ?? []), "System Manager"],
    owns: (dt) => OWNED.has(dt),
  },
};
