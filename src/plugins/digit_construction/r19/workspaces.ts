/**
 * R19 — the 36 workspaces (9 departments × 4) of the owner design contract (r19/contract.generated.json, derived from
 * 04_GOLDEN_UX_V4/36_WORKSPACE_CONTRACT.json), each with EXACTLY three in-content tabs: Dashboard · Documents & work ·
 * Full reports. Documents, reports, feature ids, screen ids and figure names come from the contract; this file only
 * adds the English titles / questions and the existing app screens (tools) that serve each workspace, so a contract
 * change is a regeneration, not a hand edit. Older department pages (dept/<key>) and every older route stay as they are.
 */
import CONTRACT from "./contract.generated.json";
import type { Bi } from "@/lib/dashboards/views";
import type { Dept } from "../domain/queues";
import { DEPT_NAMES, wsRoute } from "./wsIndex";

type CWorkspace = { id: string; dept: string; dept_ar: string; title: string; roles: string; primary: { name: string; type: string; decision: string }; secondary: { name: string; type: string; decision: string }; docs: [string, string][]; reports: [string, string, string][]; feats: string[]; screen_ids: string; kpis: string[] };
type CScreen = { id: string; dept: string; ar: string; type: string; ws: string; tab: string; layout: string; ft: string[]; outputs: string; historical: string };
type CFeature = { id: string; dept: string; ar: string; en: string; status: string; wave: string; screens: string[]; doctypes: string[]; decision: string };
type CReport = { ft: string; dept: string; en: string; ar: string; grain: string; columns: string; filters: string; frappe_name: string };
const C = CONTRACT as unknown as { meta: Record<string, unknown>; workspaces: CWorkspace[]; screens: CScreen[]; features: CFeature[]; report_contracts: CReport[]; journeys: { id: string; ar: string; steps: Record<string, string>[] }[]; relations: { source: string; field: string; target: string; kind: string }[] };

export type DeptNo = "01" | "02" | "03" | "04" | "05" | "06" | "07" | "08" | "09";
/** Contract department → the app's module rail group (index.ts CONSTRUCTION_NAV) and department queue key. */
export const DEPT_NAV: Record<DeptNo, Dept> = { "01": "MGT", "02": "PRJ", "03": "ET", "04": "CON", "05": "SUB", "06": "CST", "07": "PROC", "08": "RSP", "09": "FIN" };
export const DEPT_TITLE: Record<DeptNo, Bi> = DEPT_NAMES as Record<DeptNo, Bi>;
/** Owner policy keys (domain/data.ts POLICY_TITLES) that gate final actions of the department (same as the dept/<key> pages). */
const DEPT_POLICIES: Record<DeptNo, string[]> = { "01": [], "02": [], "03": ["P6"], "04": ["P9"], "05": ["P3", "P5", "P8"], "06": ["P7"], "07": ["P5"], "08": ["P7"], "09": ["P1", "P2", "P3", "P4"] };

/** English title + the workspace's question (job to be done) + existing app screens that serve it ([path, en, ar]). */
const EN: Record<string, { title: string; q: Bi; tools?: [string, string, string][] }> = {
  "01-01": { title: "Portfolio & performance", q: ["Which projects earn their margin, and where is exposure building?", "ما المشاريع التي تحقق هامشها، وأين يتراكم التعرض؟"], tools: [["portfolio", "Project portfolio", "محفظة المشاريع"], ["hub", "Management hub", "مركز الإدارة"], ["projects", "Projects register", "سجل المشاريع"]] },
  "01-02": { title: "Risk & exposure", q: ["Which risks are open, how severe, and what change exposure is unpriced?", "ما المخاطر المفتوحة وما شدتها، وما تعرض التغييرات غير المسعّر؟"] },
  "01-03": { title: "Decisions & policies", q: ["What waits for a decision, for how long, and which owner policies are still undefined?", "ما الذي ينتظر قرارًا ومنذ متى، وما سياسات المالك غير المحددة بعد؟"], tools: [["inbox", "My approvals & tasks", "اعتماداتي ومهامي"], ["follow-up", "Decision follow-up", "متابعة القرارات"], ["settings/policies", "Policy decisions", "قرارات السياسات"]] },
  "01-04": { title: "Team & permissions", q: ["Who is assigned where, with what responsibility, and who is overloaded?", "من المكلف وأين وبأي مسؤولية، ومن عليه حمل زائد؟"], tools: [["team", "Project team & responsibilities", "فريق المشروع والمسؤوليات"]] },
  "02-01": { title: "Planning & scheduling", q: ["Is the programme on plan, and which tasks and dependencies slip?", "هل البرنامج وفق الخطة، وما المهام والاعتماديات المنزلقة؟"], tools: [["wbs", "WBS explorer", "مستكشف هيكل تجزئة العمل"], ["projects", "Projects register", "سجل المشاريع"]] },
  "02-02": { title: "Site & execution", q: ["What happened on site today, and which tasks are overdue?", "ماذا حدث في الموقع اليوم، وما المهام المتأخرة؟"] },
  "02-03": { title: "Technical documents", q: ["Which RFIs and submittals are open, overdue or holding the work?", "ما طلبات الاستيضاح والمقدمات المفتوحة أو المتأخرة أو التي توقف العمل؟"] },
  "02-04": { title: "Quality & handover", q: ["Which defects and inspections are open, and is handover ready?", "ما العيوب والفحوصات المفتوحة، وهل التسليم جاهز؟"] },
  "03-01": { title: "Rate library", q: ["Are our rates and assemblies current enough to price with?", "هل أسعارنا وتجميعاتنا حديثة بما يكفي للتسعير؟"] },
  "03-02": { title: "Quantities & estimating", q: ["How did the estimate move between versions, and what do the quantities say?", "كيف تغير التقدير بين النسخ، وماذا تقول الكميات؟"], tools: [["estimating/boq-compare", "BOQ revision comparison", "مقارنة مراجعات جدول الكميات"]] },
  "03-03": { title: "Tenders", q: ["Which tenders are due, priced, submitted or won?", "ما العطاءات المستحقة أو المسعّرة أو المقدمة أو الفائزة؟"] },
  "03-04": { title: "Subcontract bids & award", q: ["Which bid is best value per package, and what is awarded?", "ما العرض الأفضل قيمة لكل حزمة، وما الذي تمت ترسيته؟"] },
  "04-01": { title: "Client contracts", q: ["What is each contract worth now, and how much is certified and invoiced?", "كم تساوي كل عقود العملاء الآن، وكم المعتمد والمفوتر؟"], tools: [["contracts/versions", "Contract versions & terms", "إصدارات العقد وشروطه"]] },
  "04-02": { title: "Claims & certificates", q: ["What is claimed, certified, invoiced and collected?", "ما المطالب به والمعتمد والمفوتر والمحصل؟"] },
  "04-03": { title: "Changes", q: ["Which change events are unpriced or unapproved, and what is the exposure?", "ما أحداث التغيير غير المسعّرة أو غير المعتمدة، وما التعرض؟"] },
  "04-04": { title: "Contractual claims & retention", q: ["Which commercial claims are open, and what retention is held or due?", "ما المطالبات التجارية المفتوحة، وما المحتجزات المحتجزة أو المستحقة؟"], tools: [["fin/advances", "Advances & retention", "السلف والمحتجزات"]] },
  "05-01": { title: "Subcontractors", q: ["Which subcontractors are qualified, at risk or committed?", "أي مقاولي الباطن مؤهلون أو في خطر أو ملتزمون؟"] },
  "05-02": { title: "Work orders", q: ["What is committed to subcontractors, billed and still open?", "ما الملتزم به لمقاولي الباطن، والمستخلص، والمتبقي المفتوح؟"] },
  "05-03": { title: "Measurement", q: ["What has been measured and certified, and where are the exceptions?", "ما الذي تم قياسه واعتماده، وأين الاستثناءات؟"], tools: [["sub/review", "QS review & certification", "مراجعة الكميات والاعتماد"]] },
  "05-04": { title: "Subcontract bills", q: ["Which bills wait, and how does gross become net?", "ما المستخلصات المنتظرة، وكيف يصبح الإجمالي صافيًا؟"] },
  "06-01": { title: "Budgets", q: ["Which cost codes are over budget, and how did the budget move?", "ما رموز التكلفة المتجاوزة للموازنة، وكيف تحركت الموازنة؟"], tools: [["cost/sheet", "Cost sheet", "ورقة التكلفة"], ["cost/verify", "Cost source verifier", "محقق مصادر التكلفة"]] },
  "06-02": { title: "Cost codes & sources", q: ["Where does cost come from, and what is unmapped or at risk of double counting?", "من أين تأتي التكلفة، وما غير المربوط أو المعرض للاحتساب المزدوج؟"], tools: [["cost/verify", "Cost source verifier", "محقق مصادر التكلفة"], ["cost/sheet", "Cost sheet", "ورقة التكلفة"]] },
  "06-03": { title: "Forecasts", q: ["What will the project cost at completion, and is the margin fading?", "كم ستكلف المشاريع عند الإنجاز، وهل يتآكل الهامش؟"], tools: [["cost/sheet", "Cost sheet", "ورقة التكلفة"]] },
  "06-04": { title: "Cash flow & revenue", q: ["What cash comes in and goes out in the next 13 weeks, and which lines earn?", "ما النقد الداخل والخارج خلال 13 أسبوعًا، وأي البنود تحقق ربحًا؟"], tools: [["fin/cashflow", "Project cash flow", "التدفق النقدي للمشروع"]] },
  "07-01": { title: "Material requests", q: ["Which material requests are old or not yet ordered?", "ما طلبات المواد القديمة أو التي لم تُطلب بعد؟"], tools: [["proc/plan", "Procurement plan", "خطة المشتريات"]] },
  "07-02": { title: "Purchasing", q: ["Which orders are late, and which suppliers deliver on time?", "ما أوامر الشراء المتأخرة، وأي الموردين يوردون في الموعد؟"], tools: [["proc/comparison", "Quotation comparison", "مقارنة العروض"], ["proc/plan", "Procurement plan", "خطة المشتريات"]] },
  "07-03": { title: "Receiving & stock", q: ["What was received, returned and issued per project?", "ما الذي تم استلامه وإرجاعه وصرفه لكل مشروع؟"], tools: [["proc/materials", "Material position", "موقف المواد"]] },
  "07-04": { title: "Supplier invoices", q: ["Which receipts are not invoiced, and which invoices do not match?", "ما الاستلامات غير المفوترة، وما الفواتير غير المطابقة؟"], tools: [["proc/matching", "Invoice matching", "مطابقة الفواتير"]] },
  "08-01": { title: "Labour", q: ["Who is on site, and where is overtime building?", "من في الموقع، وأين يتراكم العمل الإضافي؟"] },
  "08-02": { title: "Equipment", q: ["Which machines work, idle or are under maintenance?", "أي المعدات تعمل أو متوقفة أو تحت الصيانة؟"] },
  "08-03": { title: "Site expenses", q: ["What was spent on site, and what lacks a receipt?", "ما المصروف في الموقع، وما الذي ينقصه إيصال؟"] },
  "08-04": { title: "Safety & compliance", q: ["Which compliance documents expire, and is the site permitted to work?", "ما وثائق الامتثال التي تنتهي، وهل الموقع مسموح له بالعمل؟"] },
  "09-01": { title: "Billing & collection", q: ["What is owed by clients, and how old is it?", "ما المستحق على العملاء، وما عمره؟"], tools: [["finance", "Financial position", "الموقف المالي"]] },
  "09-02": { title: "Retention & balances", q: ["What retention and advances are outstanding on both sides?", "ما المحتجزات والدفعات المقدمة القائمة على الطرفين؟"], tools: [["fin/advances", "Advances & retention", "السلف والمحتجزات"]] },
  "09-03": { title: "Closeout & final account", q: ["Which projects are ready to close, and what is unresolved?", "ما المشاريع الجاهزة للإغلاق، وما غير المحسوم؟"] },
  "09-04": { title: "Financial control", q: ["Do construction figures reconcile, and what needs audit attention?", "هل تتطابق أرقام المقاولات، وما الذي يحتاج انتباه التدقيق؟"], tools: [["outputs", "Controlled print outputs", "المخرجات المطبوعة المضبوطة"], ["governance", "Reporting governance & audit", "حوكمة التقارير والتدقيق"]] },
};

/** Arabic for the contract's "who uses it" role phrases (display only; the contract keeps the English). */
const ROLE_AR: Record<string, string> = {
  AP: "الذمم الدائنة", "AP-AR": "الذمم الدائنة والمدينة", CFO: "المدير المالي", "Contracts Manager": "مدير العقود", "Cost Controller": "مراقب التكاليف", Equipment: "المعدات",
  Estimator: "مقدّر التكاليف", "Executive Director": "المدير التنفيذي", Finance: "المالية", "Financial Controller": "المراقب المالي", "HR Operations": "عمليات الموارد البشرية",
  PM: "مدير المشروع", "Portfolio Manager": "مدير المحفظة", "Procurement Manager": "مدير المشتريات", "Project Manager": "مدير المشروع", QA: "ضبط الجودة", QS: "مهندس الكميات",
  "Site Admin": "إدارة الموقع", "Site Engineer": "مهندس الموقع", Storekeeper: "أمين المستودع", "Subcontracts Manager": "مدير عقود الباطن", "Tender Manager": "مدير العطاءات",
};
const rolesAr = (r: string) => r.split("/").map((x) => ROLE_AR[x.trim()] ?? x.trim()).join(" / ");
export interface R19Workspace {
  id: string; dept: DeptNo; nav: Dept; title: Bi; deptTitle: Bi; roles: string; rolesBi: Bi; question: Bi;
  docs: { doctype: string; ar: string }[]; reports: { name: string; ar: string; meaning: string }[];
  features: string[]; screens: string[]; kpiNames: string[]; visuals: { primary: { name: string; type: string; decision: string }; secondary: { name: string; type: string; decision: string } };
  tools: [string, string, string][]; policies: string[];
}
/**
 * Owner work list (Construction × Enterprise run): the sheet 16 BUILD documents and the reports behind KPI drills are
 * placed in the workspace whose question they answer, appended after the source rows (a source row is never replaced).
 */
const WS_EXTRA: Record<string, { docs?: { doctype: string; ar: string }[]; reports?: { name: string; ar: string; meaning: string }[] }> = {
  "02-04": { docs: [{ doctype: "Digit Commissioning Test", ar: "اختبار التشغيل" }, { doctype: "Digit Handover Asset", ar: "أصل التسليم" }],
    reports: [{ name: "Commissioning Test Register", ar: "سجل اختبارات التشغيل", meaning: "Commissioning tests by result" }, { name: "O&M Manual Index", ar: "فهرس دليل التشغيل والصيانة", meaning: "Handover assets and their accepted documents" }] },
  "06-04": { reports: [{ name: "WIP Schedule", ar: "جدول الأعمال تحت التنفيذ", meaning: "Earned revenue against billing (report only until P10)" }] },
  "08-01": { reports: [{ name: "Labour Cost (estimate)", ar: "تكلفة العمالة (تقديرية)", meaning: "Approved attendance priced at planning rates" }] },
  "08-02": { docs: [{ doctype: "Digit Maintenance Order", ar: "أمر الصيانة" }],
    reports: [{ name: "Maintenance Order Register", ar: "سجل أوامر الصيانة", meaning: "Maintenance orders by status and approval" }, { name: "Maintenance Due", ar: "الصيانة المستحقة", meaning: "Machines due for preventive maintenance" }] },
  "08-04": { reports: [{ name: "Work Permit Register", ar: "سجل تصاريح العمل", meaning: "Permits by validity" }, { name: "Site Induction Register", ar: "سجل التعريف بالموقع", meaning: "Inductions valid today" }] },
  "09-03": { docs: [{ doctype: "Digit Job Snapshot", ar: "لقطة المشروع" }], reports: [{ name: "Job Snapshot Comparison", ar: "مقارنة لقطات المشروع", meaning: "What changed between two frozen snapshots" }] },
  "09-04": { docs: [{ doctype: "Digit Override Log", ar: "سجل التجاوز" }],
    reports: [{ name: "WIP Schedule", ar: "جدول الأعمال تحت التنفيذ", meaning: "Over / under billing by project" }, { name: "Actuals vs GL", ar: "الفعلي مقابل دفتر الأستاذ", meaning: "Construction actuals reconciled to the ledger" },
      { name: "WIP Adjustment Register", ar: "سجل تسويات الأعمال تحت التنفيذ", meaning: "WIP adjustments (drafts until P10)" }, { name: "Override Log Register", ar: "سجل التجاوزات", meaning: "Who overrode which rule and why" }] },
};
export const R19_WORKSPACES: R19Workspace[] = C.workspaces.map((w) => {
  const dept = w.dept as DeptNo; const en = EN[w.id];
  return {
    id: w.id, dept, nav: DEPT_NAV[dept], title: [en?.title ?? w.title, w.title], deptTitle: DEPT_TITLE[dept], roles: w.roles, rolesBi: [w.roles, rolesAr(w.roles)], question: en?.q ?? [w.title, w.title],
    docs: [...w.docs.map(([doctype, ar]) => ({ doctype, ar })), ...(WS_EXTRA[w.id]?.docs ?? []).filter((d) => !w.docs.some(([x]) => x === d.doctype))],
    reports: [...w.reports.map(([name, ar, meaning]) => ({ name, ar, meaning })), ...(WS_EXTRA[w.id]?.reports ?? []).filter((r) => !w.reports.some(([x]) => x === r.name))],
    features: w.feats, screens: w.screen_ids.split(",").map((s) => s.trim()).filter(Boolean), kpiNames: w.kpis, visuals: { primary: w.primary, secondary: w.secondary },
    tools: en?.tools ?? [], policies: DEPT_POLICIES[dept],
  };
});
export const r19Workspace = (id: string) => R19_WORKSPACES.find((w) => w.id === id);
export const workspacesOfDept = (d: DeptNo) => R19_WORKSPACES.filter((w) => w.dept === d);
export const R19_DEPTS = Object.keys(DEPT_TITLE) as DeptNo[];
/** The workspace page path inside the app (<department>/<workspace>/<tab>, shown as /construction/…; owner ruling 2026-11-14). */
export const wsPath = (id: string, tab?: "work" | "reports") => wsRoute(id, tab === "work" ? "documents" : tab === "reports" ? "reports" : "overview");

/** Contract features / screens / report contracts of a workspace (traceability shown in the Full reports tab). */
export const featuresOf = (w: R19Workspace) => C.features.filter((f) => w.features.includes(f.id));
export const screensOf = (w: R19Workspace) => C.screens.filter((s) => w.screens.includes(s.id));
export const reportContractsOf = (w: R19Workspace) => C.report_contracts.filter((r) => w.features.includes(r.ft));
export const CONTRACT_META = C.meta;
export const CONTRACT_COUNTS = { workspaces: C.workspaces.length, screens: C.screens.length, features: C.features.length, report_contracts: C.report_contracts.length, journeys: C.journeys.length, relations: C.relations.length };
export const JOURNEYS = C.journeys;
