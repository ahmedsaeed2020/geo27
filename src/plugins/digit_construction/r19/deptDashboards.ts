/**
 * Department dashboards (owner UX depth round 2026-11-14): the approved prototype composition of each of the nine
 * departments (DIGIT_CONSTRUCTION_PRODUCT_UX README §2 + 01_UX_PROTOTYPE_FOR_APPROVAL.html) as data — four headline
 * figures (vision, with change), the chosen charts (understanding), computed insight sentences and the decision list
 * (actions), then the department's four workspaces. Figures are the workspace KPIs (r19/metrics.ts) and charts are the
 * workspace visuals plus the department visuals (r19/visuals.ts DEPT_VISUALS), so a department number always equals the
 * workspace card it comes from. Rendered by ui/r19Workspace.tsx R19DeptPage on the shared Dashboard Designer.
 */
import type { Width } from "@/lib/dashboards/registry";
import type { Bi } from "@/lib/dashboards/views";
import type { DeptNo } from "./workspaces";

export type DeptBlockId = string; // a workspace visual ("01-01:primary"), a department visual ("D01:revcol"), or "insights" | "decisions" | "workspaces"
export interface DeptComposition { approved: Bi; question: Bi; kpis: string[]; blocks: [DeptBlockId, Width][] }
const k = (ws: string, n: number) => `UXKPI-${ws}-0${n}`;

export const DEPT_COMPOSITION: Record<DeptNo, DeptComposition> = {
  "01": { approved: ["Portfolio bubbles + exposure waterfall", "فقاعات المحفظة + شلال التعرض"], question: ["Where do the projects stand, where is the money exposed, and what needs my decision?", "أين تقف المشاريع، وأين يتعرض المال، وما الذي ينتظر قراري؟"],
    kpis: [k("01-01", 1), k("01-01", 2), k("01-02", 1), k("01-03", 1)],
    blocks: [["01-01:primary", 8], ["insights", 4], ["scorecard", 12], ["decisions", 6], ["01-01:secondary", 6], ["01-02:primary", 6], ["D01:revcol", 6], ["workspaces", 12]] },
  "02": { approved: ["S-curve + constrained look-ahead", "منحنى S + الأسابيع القادمة بالقيود"], question: ["Is the work on plan, and what blocks the next weeks?", "هل العمل على الخطة، وما الذي يعيق الأسابيع القادمة؟"],
    kpis: [k("02-01", 1), k("02-01", 3), k("02-03", 2), k("02-04", 2)],
    blocks: [["02-01:primary", 8], ["insights", 4], ["D02:lookahead", 12], ["02-03:primary", 6], ["02-04:primary", 6], ["decisions", 12], ["workspaces", 12]] },
  "03": { approved: ["Tender funnel + bid leveling", "قمع العطاءات + مقارنة العروض"], question: ["Which opportunities are worth pricing, and which bid wins on value?", "أي الفرص تستحق التسعير، وأي العروض يفوز بالقيمة؟"],
    kpis: [k("03-03", 2), k("03-03", 3), k("03-03", 4), k("03-02", 3)],
    blocks: [["03-03:primary", 6], ["03-01:secondary", 6], ["03-04:primary", 8], ["03-01:primary", 4], ["03-02:primary", 8], ["insights", 4], ["decisions", 12], ["workspaces", 12]] },
  "04": { approved: ["SOV progress + pay cycle + change Kanban", "تقدم جدول القيم + دورة الدفعة + لوحة التغييرات"], question: ["How far is each contract billed, where is this month's payment cycle, and which changes are not yet in the contract?", "إلى أين وصلت فوترة كل عقد، وأين دورة الدفعة هذا الشهر، وما التغييرات التي لم تدخل العقد بعد؟"],
    kpis: [k("04-01", 1), k("04-02", 1), k("04-03", 2), k("04-01", 4)],
    blocks: [["04-01:primary", 8], ["04-02:primary", 4], ["04-03:primary", 12], ["04-04:primary", 6], ["04-02:secondary", 6], ["insights", 6], ["decisions", 6], ["workspaces", 12]] },
  "05": { approved: ["Stacked commitments + measured vs BOQ + score heat map", "التزامات مكدسة + القياس مقابل الكميات + تقييم حراري"], question: ["What is committed and still open per subcontractor, is measurement within the BOQ, and who performs?", "ما الملتزم والمتبقي لكل مقاول، وهل القياس ضمن الكميات، ومن يؤدي جيدًا؟"],
    kpis: [k("05-02", 2), k("05-02", 4), k("05-04", 2), k("09-02", 2)],
    blocks: [["05-02:primary", 8], ["D05:mvb", 4], ["D05:heat", 6], ["05-04:primary", 6], ["insights", 6], ["decisions", 6], ["workspaces", 12]] },
  "06": { approved: ["Bullet per cost code + margin fade + budget→EAC waterfall", "مؤشر لكل رمز تكلفة + تآكل الهامش + شلال الموازنة إلى EAC"], question: ["Which cost codes run over, is the margin fading, and how does the budget become the EAC?", "أي رموز التكلفة تتجاوز، وهل يتآكل الهامش، وكيف تصبح الموازنة تكلفة متوقعة؟"],
    kpis: [k("06-01", 1), k("06-03", 1), k("06-03", 2), k("01-01", 2)],
    blocks: [["06-01:primary", 8], ["06-03:secondary", 4], ["D06:b2e", 8], ["insights", 4], ["06-02:secondary", 6], ["decisions", 6], ["workspaces", 12]] },
  "07": { approved: ["MR→PI chain + three-way match + long-lead materials", "سلسلة طلب المواد إلى الفاتورة + المطابقة الثلاثية + المواد طويلة التوريد"], question: ["Where is each purchase waiting, what does not match, and which long-lead material is at risk?", "أين ينتظر كل شراء، وما الذي لا يتطابق، وأي مادة طويلة التوريد في خطر؟"],
    kpis: [k("07-01", 1), k("07-02", 1), k("07-02", 4), k("07-04", 3)],
    blocks: [["D07:chain", 12], ["07-04:primary", 6], ["07-03:secondary", 6], ["07-02:secondary", 6], ["insights", 6], ["decisions", 12], ["workspaces", 12]] },
  "08": { approved: ["Attendance heat map + equipment utilisation", "الحضور الحراري + استغلال المعدات"], question: ["Who is on site, is the equipment working, and what is the site spending?", "من في الموقع، وهل تعمل المعدات، وكم يصرف الموقع؟"],
    kpis: [k("08-01", 1), k("08-01", 2), k("08-02", 1), k("08-03", 1)],
    blocks: [["08-01:primary", 8], ["D08:util", 4], ["08-03:primary", 6], ["08-04:secondary", 6], ["insights", 6], ["decisions", 6], ["workspaces", 12]] },
  "09": { approved: ["Stacked ageing + cash in/out + close readiness", "أعمار الذمم المكدسة + التدفق داخل/خارج + جاهزية الإغلاق"], question: ["Who owes us and for how long, will cash cover the next weeks, and which project is ready to close?", "من يدين لنا ومنذ متى، وهل يكفي النقد للأسابيع القادمة، وأي مشروع جاهز للإغلاق؟"],
    kpis: [k("09-01", 1), k("09-01", 2), k("09-01", 3), k("06-04", 1)],
    blocks: [["09-01:primary", 6], ["D09:cash", 6], ["09-03:primary", 8], ["insights", 4], ["09-01:secondary", 6], ["decisions", 6], ["workspaces", 12]] },
};
