/** The Executive's seven pages (owner 2026-11-12): Overview + six CFO boards, each its own route listed in the Executive sidebar. Data only. */
export interface ExecPage { slug: string; board: string; to: "/pro/executive/financial-position" | "/pro/executive/performance" | "/pro/executive/cash-liquidity" | "/pro/executive/receivables" | "/pro/executive/closing-control" | "/pro/executive/dimensions-budget"; label: [string, string]; question: [string, string] }
export const EXEC_OVERVIEW_LABEL: [string, string] = ["Overview", "النظرة العامة"];
export const EXEC_PAGES: ExecPage[] = [
  { slug: "financial-position", board: "cfo-01", to: "/pro/executive/financial-position", label: ["Financial position & leadership", "الموقف المالي والقيادة"], question: ["Where does the company stand today, and what needs a leadership decision?", "أين تقف الشركة اليوم، وما الذي يحتاج قرار القيادة؟"] },
  { slug: "performance", board: "cfo-02", to: "/pro/executive/performance", label: ["Performance & profitability", "الأداء والربحية"], question: ["Are we growing profitably, and what drives the result?", "هل ننمو بربحية، وما الذي يحرك النتيجة؟"] },
  { slug: "cash-liquidity", board: "cfo-03", to: "/pro/executive/cash-liquidity", label: ["Cash & liquidity", "النقد والسيولة"], question: ["How much cash do we have, and when does it come in and go out?", "كم لدينا من النقد، ومتى يدخل ويخرج؟"] },
  { slug: "receivables", board: "cfo-04", to: "/pro/executive/receivables", label: ["Receivables & collection", "الذمم والتحصيل"], question: ["Who owes us, who do we owe, and what is overdue?", "من يدين لنا، ولمن ندين، وما المتأخر؟"] },
  { slug: "closing-control", board: "cfo-05", to: "/pro/executive/closing-control", label: ["Closing, taxes & control", "الإقفال والضرائب والرقابة"], question: ["Is the period ready to close, and are tax and controls in order?", "هل الفترة جاهزة للإقفال، وهل الضرائب والرقابة سليمة؟"] },
  { slug: "dimensions-budget", board: "cfo-06", to: "/pro/executive/dimensions-budget", label: ["Dimensions & budget", "الأبعاد والموازنات"], question: ["How do branches, cost centres and projects perform against budget?", "كيف تؤدي الفروع ومراكز التكلفة والمشاريع مقارنة بالموازنة؟"] },
];
export const execPageOfBoard = (cfo: string | undefined) => EXEC_PAGES.find((p) => p.board === `cfo-${cfo}`);

/**
 * Design contract §B (owner 2026-11-12): the six CFO boards keep their figures and drills, but each page draws them in a
 * DIFFERENT visual archetype — the chart type follows the page's business question (trend → line, composition/ageing →
 * stacked bar, contribution → treemap, split ≤ 5 → donut). Block types not listed keep the board's own view.
 */
export type BoardView = "stacked" | "line" | "area" | "bar" | "donut" | "treemap" | "funnel";
export const BOARD_VIEWS: Record<string, Partial<Record<string, BoardView>>> = {
  "cfo-01": { aging: "stacked", insight: "line" },
  "cfo-02": { dimension_cost_centers: "treemap", ranking: "bar" },
  "cfo-03": { week: "area", chart: "donut", insight: "line" },
  "cfo-04": { aging: "stacked", week: "line", states: "donut" },
  "cfo-05": { states: "funnel" },
  "cfo-06": { dimension_cost_centers: "bar" },
};
export const EXEC_ARCHETYPE: Record<string, [string, string]> = {
  "cfo-01": ["Position and decisions: ageing as stacked bars, risks first", "الموقف والقرارات: الأعمار كأشرطة مكدسة والمخاطر أولًا"],
  "cfo-02": ["Profit bridge: waterfall, period table and contribution map", "جسر الربح: الشلال وجدول الفترات وخريطة المساهمة"],
  "cfo-03": ["Cash timing: receipts against payments, weekly dues as areas", "توقيت النقد: المقبوضات مقابل المدفوعات والاستحقاقات الأسبوعية"],
  "cfo-04": ["Collection board: ageing stacked, dues trend, allocation split", "لوحة التحصيل: أعمار مكدسة واتجاه الاستحقاق وتوزيع التخصيص"],
  "cfo-05": ["Close checklist: readiness, statements and posting stages", "قائمة الإقفال: الجاهزية والقوائم ومراحل الترحيل"],
  "cfo-06": ["Dimensions: budget against actual by cost centre and project", "الأبعاد: الموازنة مقابل الفعلي حسب مركز التكلفة والمشروع"],
};
