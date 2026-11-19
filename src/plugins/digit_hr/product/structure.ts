/**
 * DIGIT HR product shape (owner brief 2026-11-15, skill digit-hr-product-build §3): 7 departments → 30 sections → exactly
 * three tabs (Overview · Documents & Work · Full Reports), plus HR Mission Control (role home) and the Hiring and
 * Separation boards. Names and section ids come from the existing HR navigation source (nav.ts / v5 data); this file adds
 * only the visible address segments, the department homes and the question each section answers.
 */
import NAV from "../nav";

export type Bi = [en: string, ar: string];
export type HrTab = "overview" | "documents" | "reports";
export const HR_TABS: readonly HrTab[] = ["overview", "documents", "reports"];
export const HR_TAB_LABEL: Record<HrTab, Bi> = { overview: ["Overview", "نظرة عامة"], documents: ["Documents & work", "المستندات والعمل"], reports: ["Full reports", "التقارير الكاملة"] };

export interface HrDept { id: string; slug: string; en: string; ar: string; home: Bi; question: Bi; chart: Bi }
/** Department address segments never equal a phone self-service page (/hr/home, /hr/settings, /hr/roster, …). */
export const HR_DEPTS: HrDept[] = [
  { id: "01", slug: "core-hr", en: "Core HR & Organization", ar: "الموارد البشرية الأساسية", home: ["HR Operations Center", "مركز عمليات الموارد البشرية"],
    question: ["Who works where, which records expire soon and which employee records are incomplete?", "من يعمل أين، وأي الوثائق تقترب من الانتهاء، وأي سجلات الموظفين ناقصة؟"], chart: ["Organization map with headcount and vacancies", "خريطة الهيكل بالعدد والشواغر"] },
  { id: "02", slug: "talent", en: "Talent", ar: "رأس المال البشري والمواهب", home: ["Talent Pipeline Control", "مركز التحكم بمسار المواهب"],
    question: ["Where is every candidate, which interviews and offers are due, and which reviews are late?", "أين يقف كل مرشح، وما المقابلات والعروض المستحقة، وأي التقييمات متأخرة؟"], chart: ["Recruiting funnel with conversion", "قمع التوظيف مع نسب العبور"] },
  { id: "03", slug: "workforce", en: "Workforce", ar: "إدارة القوى العاملة", home: ["Workforce Operations Control", "مركز التحكم بعمليات القوى العاملة"],
    question: ["Who is missing today, is every shift covered, and which leave and overtime need a decision?", "من الغائب اليوم، وهل كل وردية مغطاة، وأي إجازات وعمل إضافي ينتظر قرارًا؟"], chart: ["Attendance exceptions by site", "استثناءات الحضور حسب الموقع"] },
  { id: "04", slug: "payroll", en: "Payroll, Rewards & Saudi", ar: "الرواتب والمزايا والتشريعات", home: ["Payroll Preflight & Control", "مركز فحص الرواتب والتحكم بها"],
    question: ["Is this month's payroll ready, what changed against last month, and are WPS and GOSI ready?", "هل رواتب هذا الشهر جاهزة، وما الذي تغير عن الشهر الماضي، وهل حماية الأجور والتأمينات جاهزة؟"], chart: ["Payroll variance waterfall", "شلال فروقات الرواتب"] },
  { id: "05", slug: "experience", en: "Employee & Manager Experience", ar: "الخدمة الذاتية وتجربة الموظف", home: ["Service desk", "مكتب الخدمات"],
    question: ["What did I ask for, what waits for my approval, and which service cases are late?", "ماذا طلبت، وما الذي ينتظر اعتمادي، وأي حالات الخدمة متأخرة؟"], chart: ["Service cases by category and SLA", "حالات الخدمة حسب الفئة والمهلة"] },
  { id: "06", slug: "intelligence", en: "People Intelligence & Planning", ar: "ذكاء الموارد البشرية والتخطيط", home: ["People Analytics Command Center", "مركز قيادة تحليلات الموارد البشرية"],
    question: ["How is the workforce moving, where is turnover high and how does labour cost track the plan?", "كيف تتحرك القوى العاملة، وأين يرتفع الدوران، وكيف تسير تكلفة العمالة مقابل الخطة؟"], chart: ["Headcount trend with hires and exits", "اتجاه العدد مع التعيينات والمغادرات"] },
  { id: "07", slug: "governance", en: "Settings & Governance", ar: "الإعدادات والحوكمة", home: ["Setup & governance", "التأسيس والحوكمة"],
    question: ["Is setup complete, who can see what, and did any notification or integration fail?", "هل اكتمل التأسيس، ومن يرى ماذا، وهل فشل أي إشعار أو تكامل؟"], chart: ["Setup completeness steps", "خطوات اكتمال التأسيس"] },
];

/** Section address segments (English names, short and stable). */
export const HR_SECTION_SLUGS: Record<string, string> = {
  "01.1": "organization", "01.2": "job-architecture", "01.3": "positions-budgets", "01.4": "employees", "01.5": "employment-assignments", "01.6": "contracts-documents",
  "02.1": "talent-acquisition", "02.2": "onboarding", "02.3": "performance-goals", "02.4": "learning-skills", "02.5": "succession",
  "03.1": "leave", "03.2": "attendance", "03.3": "shifts-overtime", "03.4": "time-capture",
  "04.1": "payroll-operations", "04.2": "disbursement", "04.3": "saudi-localization", "04.4": "compensation-benefits", "04.5": "advances-expenses-loans",
  "05.1": "employee-self-service", "05.2": "manager-self-service", "05.3": "service-delivery",
  "06.1": "command-centers", "06.2": "workforce-planning", "06.3": "people-analytics",
  "07.1": "setup-policies", "07.2": "privacy-audit", "07.3": "templates-notifications", "07.4": "integrations",
};

export interface HrSection { id: string; dept: string; slug: string; en: string; ar: string }
export const HR_SECTIONS: HrSection[] = NAV.flatMap((m) => m.subs.map((s) => ({ id: s.id, dept: m.id, slug: HR_SECTION_SLUGS[s.id]!, en: s.en, ar: s.ar })));
export const deptById = (id: string) => HR_DEPTS.find((d) => d.id === id);
export const deptBySlug = (slug: string) => HR_DEPTS.find((d) => d.slug === slug);
export const sectionById = (id: string) => HR_SECTIONS.find((s) => s.id === id);
export const sectionBySlug = (dept: string, slug: string) => HR_SECTIONS.find((s) => s.dept === dept && s.slug === slug);
export const sectionsOf = (dept: string) => HR_SECTIONS.filter((s) => s.dept === dept);

/** Visible address of a section tab (/hr/<department>/<section>/<tab>). */
export function hrSectionPath(id: string, tab: HrTab = "overview"): string {
  const s = sectionById(id); const d = s ? deptById(s.dept) : undefined;
  return s && d ? `/hr/${d.slug}/${s.slug}/${tab}` : "/hr/mission-control";
}
export const hrDeptPath = (id: string) => `/hr/${deptById(id)?.slug ?? ""}`;

/**
 * Existing dedicated HR pages, shown at an address inside their section (the page stays one click from the section's
 * tabs). `board` pages sit under /hr/boards/… (Hiring, Separation).
 */
export const HR_PAGE_ADDRESSES: { internal: string; section?: string; visible: string }[] = [
  { internal: "organization", section: "01.1", visible: "explorer" },
  { internal: "employees", section: "01.4", visible: "directory" },
  { internal: "lifecycle", section: "01.5", visible: "lifecycle" },
  { internal: "documents", section: "01.6", visible: "renewals" },
  { internal: "talent", section: "02.3", visible: "talent-review" },
  { internal: "leave", section: "03.1", visible: "leave-desk" },
  { internal: "workforce", section: "03.2", visible: "roster" },
  { internal: "payroll", section: "04.1", visible: "payroll-cycle" },
  { internal: "compliance", section: "04.3", visible: "compliance" },
  { internal: "insights", section: "06.3", visible: "insights" },
  { internal: "reports", section: "06.3", visible: "report-center" },
  { internal: "hiring", visible: "/hr/boards/hiring" },
  { internal: "separation", visible: "/hr/boards/separation" },
];
/** Profile (360) pages: internal /digit-hr/<plural>/<name> ↔ visible /hr/<kind>/<name>. */
export const HR_PROFILE_ADDRESSES: [internal: string, visible: string][] = [["employees", "employee"], ["applicants", "applicant"], ["positions", "position"], ["contracts", "contract"], ["cases", "case"]];
