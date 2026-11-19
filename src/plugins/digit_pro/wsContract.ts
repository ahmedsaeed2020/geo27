/**
 * DIGIT Pro design contract (docs: DIGIT_PRO_DESIGN_CONTRACT_RUN11_1 §C, owner 2026-11-12): the Overview composition of each
 * of the 20 section workspaces — page archetype, floorplan and the two mandatory charts with the chart type the contract
 * names for that business question. Data only: proDashboards.tsx turns it into the workspace's DEFAULT designer layout
 * (users and admins can still add, remove, reorder and resize), SectionWorkspace's ChartPanel draws the named type.
 * No figure is added or moved here — every slot points at a widget the workspace already has.
 */
export type ContractChart = "ranked" | "stacked" | "line" | "waterfall" | "funnel" | "columns" | "donut" | "treemap";
export type Bi = [string, string];
/** A slot of the floorplan in reading order (RTL: the first slot sits on the right). w = 12-column width, tall = spans two rows. */
export interface Slot { at: "c0" | "c1" | "queue" | "lead" | "rest"; w: 4 | 6 | 8 | 12; tall?: boolean }
export interface WsContract { archetype: Bi; charts: [string, ContractChart][]; floor: Slot[] }

const s = (at: Slot["at"], w: Slot["w"], tall?: boolean): Slot => (tall ? { at, w, tall } : { at, w });

export const WS_CONTRACT: Record<string, WsContract> = {
  // ------------------------------------------------------------------ Accounting
  "ACC-OPS": { archetype: ["Transaction desk: dense voucher list beside the posting picture", "مكتب المعاملات: قائمة قيود كثيفة بجوار صورة الترحيل"],
    charts: [["r11-ch-acc-ops-01", "ranked"], ["r11-ch-acc-ops-02", "ranked"]], floor: [s("queue", 8, true), s("c0", 4), s("c1", 4)] },
  "ACC-DUES": { archetype: ["Receivables and payables in two columns with ageing first", "الذمم المدينة والدائنة في عمودين والأعمار أولًا"],
    charts: [["r11-ch-acc-dues-02", "ranked"]], floor: [s("lead", 12), s("c0", 4), s("queue", 8)] },
  "ACC-CASH": { archetype: ["Real cash band, secured matching, forecast kept apart", "شريط النقد الفعلي والمطابقة المؤمّنة والتوقع منفصل"],
    charts: [["r11-ch-acc-cash-01", "ranked"], ["r11-ch-acc-cash-02", "ranked"]], floor: [s("lead", 12), s("c0", 6), s("c1", 6), s("queue", 12)] },
  "ACC-REPORT": { archetype: ["Statements and close control: trend first, blockers next", "القوائم ورقابة الإقفال: الاتجاه أولًا ثم المعوقات"],
    charts: [["r11-ch-acc-report-01", "line"], ["r11-ch-acc-report-02", "ranked"]], floor: [s("c0", 8), s("c1", 4), s("rest", 12), s("queue", 12)] },
  // ------------------------------------------------------------------ Selling
  "SEL-SALES": { archetype: ["Conversion funnel beside the quotation and order list", "قمع التحويل بجوار قائمة العروض والطلبات"],
    charts: [["r11-ch-sel-sales-01", "stacked"], ["r11-sel-sales-bi-04", "line"]], floor: [s("c0", 4), s("queue", 8, true), s("c1", 4)] },
  "SEL-CUSTOMER": { archetype: ["Customer 360: cohorts and exposure against credit", "العميل 360: الشرائح والتعرض مقابل حد الائتمان"],
    charts: [["r11-ch-sel-customer-01", "ranked"], ["r11-ch-sel-customer-02", "ranked"]], floor: [s("c0", 6), s("c1", 6), s("rest", 12), s("queue", 12)] },
  "SEL-FULFILL": { archetype: ["Fulfilment timeline: order to delivery to bill", "خط التنفيذ: من الطلب إلى التسليم إلى الفوترة"],
    charts: [["r11-ch-sel-fulfill-02", "stacked"], ["r11-ch-sel-fulfill-01", "line"]], floor: [s("c0", 12), s("c1", 8), s("rest", 4), s("queue", 12)] },
  "SEL-INTEL": { archetype: ["Sales analysis: the bridge first, territory and margin beside it", "تحليل المبيعات: الجسر أولًا والمناطق والهامش بجواره"],
    charts: [["r11-ch-sel-intel-01", "ranked"], ["r11-ch-sel-intel-02", "ranked"]], floor: [s("rest", 8, true), s("c0", 4), s("c1", 4), s("queue", 12)] },
  // ------------------------------------------------------------------ Purchasing
  "PUR-SOURCE": { archetype: ["Side-by-side quote comparison with request ageing", "مقارنة العروض جنبًا إلى جنب مع أعمار الطلبات"],
    charts: [["r11-ch-pur-source-01", "ranked"], ["r11-ch-pur-source-02", "stacked"]], floor: [s("c0", 8), s("c1", 4), s("queue", 12)] },
  "PUR-ORDERS": { archetype: ["Purchase order 360: commitments over time, ageing by supplier", "أمر الشراء 360: الالتزامات عبر الزمن والأعمار حسب المورد"],
    charts: [["r11-ch-pur-orders-02", "line"], ["r11-ch-pur-orders-01", "stacked"]], floor: [s("c0", 12), s("c1", 6), s("queue", 6)] },
  "PUR-RECEIVE": { archetype: ["Three-way match per line beside the receiving list", "المطابقة الثلاثية لكل بند بجوار قائمة الاستلام"],
    charts: [["r11-ch-pur-receive-01", "ranked"], ["r11-ch-pur-receive-02", "ranked"]], floor: [s("queue", 8, true), s("c0", 4), s("c1", 4), s("rest", 12)] },
  "PUR-SUPPLIER": { archetype: ["Supplier card: reliability first, score and spend beside", "بطاقة المورد: الموثوقية أولًا ثم التقييم والإنفاق"],
    charts: [["r11-ch-pur-supplier-01", "ranked"], ["r11-ch-pur-supplier-02", "ranked"]], floor: [s("rest", 12), s("c0", 6), s("c1", 6), s("queue", 12)] },
  // ------------------------------------------------------------------ Inventory
  "INV-MASTER": { archetype: ["Item 360 browser: stock by place and group, then the heat map", "متصفح الصنف 360: المخزون حسب المكان والمجموعة ثم الخريطة الحرارية"],
    charts: [["r11-ch-inv-master-01", "ranked"], ["r11-ch-inv-master-02", "ranked"]], floor: [s("c0", 6), s("c1", 6), s("rest", 12), s("queue", 12)] },
  "INV-MOVE": { archetype: ["Operations queue with movement by day and transfer flow", "قائمة العمليات مع الحركة اليومية وتدفق التحويل"],
    charts: [["r11-ch-inv-move-01", "ranked"], ["r11-ch-inv-move-02", "ranked"]], floor: [s("queue", 8, true), s("c0", 4), s("c1", 4)] },
  "INV-CONTROL": { archetype: ["Control desk: variance and expiry around the review queue", "مكتب الرقابة: الفروقات والصلاحية حول قائمة المراجعة"],
    charts: [["r11-ch-inv-control-01", "ranked"], ["r11-ch-inv-control-02", "ranked"]], floor: [s("c0", 6), s("queue", 6, true), s("c1", 6), s("rest", 12)] },
  "INV-REPORT": { archetype: ["Ledger-backed stock picture: ageing first, valuation and sources", "صورة المخزون من الدفتر: الأعمار أولًا ثم التقييم والمصادر"],
    charts: [["r11-ch-inv-report-01", "stacked"], ["r11-ch-inv-report-02", "ranked"]], floor: [s("c0", 12), s("c1", 6), s("rest", 6), s("queue", 12)] },
  // ------------------------------------------------------------------ Fixed assets
  "AST-REGISTER": { archetype: ["Asset 360: lifecycle beside acquisitions and categories", "الأصل 360: دورة الحياة بجوار الإضافات والفئات"],
    charts: [["r11-ch-ast-register-01", "ranked"], ["ast-cat", "ranked"]], floor: [s("rest", 8, true), s("c0", 4), s("c1", 4), s("queue", 12)] },
  "AST-CUSTODY": { archetype: ["Custody timeline: who holds what, transfers by period", "خط العهدة: من يحمل ماذا والتحويلات حسب الفترة"],
    charts: [["r11-ch-ast-custody-01", "ranked"], ["r11-ch-ast-custody-02", "ranked"]], floor: [s("queue", 6, true), s("c0", 6), s("c1", 6)] },
  "AST-DEP": { archetype: ["Depreciation preflight: the roll-forward bridge and monthly run", "فحص الإهلاك المسبق: جسر الحركة والتشغيل الشهري"],
    charts: [["r11-ch-ast-dep-02", "waterfall"], ["je-dep", "ranked"]], floor: [s("c0", 8), s("c1", 4), s("rest", 12)] },
  "AST-SERVICE": { archetype: ["Service timeline and repair-or-replace decision sheet", "خط الصيانة وورقة قرار الإصلاح أو الاستبدال"],
    charts: [["r11-ch-ast-service-01", "ranked"], ["r11-ch-ast-service-02", "line"]], floor: [s("rest", 12), s("c0", 6), s("c1", 6), s("queue", 12)] },
};

/** The forced chart type of a workspace chart, if the contract names it. */
export const contractChartType = (pageId: string, chartId: string): ContractChart | undefined => WS_CONTRACT[pageId]?.charts.find(([id]) => id === chartId)?.[1];
/** A composition fingerprint (slots, widths, chart types) — two workspaces of one department never share one. */
export const compositionOf = (k: WsContract) => `${k.floor.map((x) => `${x.at}${x.w}${x.tall ? "t" : ""}`).join("|")}#${k.charts.map(([, t]) => t).join("+")}`;

/**
 * Owner 2026-11-13 §2.2 (every block a different visual idea): the chart type of EVERY chart on a workspace Overview. The
 * first contract chart keeps its contract type; the second keeps it unless the first already uses it; every further chart
 * takes the first visual its data allows that the page has not used yet (months → line / columns / stacked; ordered bands →
 * columns / stacked / ranked; categories → ranked / treemap / donut / columns / stacked).
 */
export function pageChartTypes(pageId: string, charts: { id: string; month: boolean; bucket: boolean }[]): Record<string, ContractChart> {
  const k = WS_CONTRACT[pageId]; const out: Record<string, ContractChart> = {}; const used = new Set<ContractChart>();
  const cands = (c: { month: boolean; bucket: boolean }): ContractChart[] => (c.month ? ["line", "columns", "stacked"] : c.bucket ? ["columns", "stacked", "ranked", "treemap"] : ["ranked", "treemap", "donut", "columns", "stacked"]);
  const order = [...(k?.charts.map(([id]) => id) ?? []), ...charts.map((c) => c.id).filter((id) => !k?.charts.some(([x]) => x === id))];
  order.forEach((id, i) => {
    const c = charts.find((x) => x.id === id); if (!c) return;
    const want = k?.charts.find(([x]) => x === id)?.[1];
    const pick = want && (i === 0 || !used.has(want)) ? want : cands(c).find((t) => !used.has(t)) ?? want ?? cands(c)[0]!;
    out[id] = pick; used.add(pick);
  });
  return out;
}
