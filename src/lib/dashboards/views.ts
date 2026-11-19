/**
 * Universal Dashboard Designer — visualization families and the data-shape compatibility rules
 * (DIGIT-CORE-PRO-UX-006 §9 "Chart type switching"). A widget declares the SHAPE of the data its source produces; a view
 * may render it only when the shape supports that view without changing the metric's meaning. Every switch request is
 * checked here, so the composer, saved layouts and templates all reject the same invalid combinations with one reason.
 */
export type Bi = [string, string];

export const VIEW_KINDS = ["kpi", "line", "area", "bar", "stacked-bar", "donut", "pie", "funnel", "table", "pivot", "timeline", "calendar", "status", "queue", "panel",
  // additive (DIGIT Construction R19): offered only to widgets that declare one of the matching shapes below
  "waterfall", "bullet", "heatmap", "scurve", "bubble", "radar", "gantt", "treemap", "kanban",
  // additive (Enterprise Visual Round 1 §8): split card — solid posted / hatched pending bars under one headline figure
  "split"] as const;
export type ViewKind = (typeof VIEW_KINDS)[number];

/**
 * - number: one aggregate (count / sum) — KPI card only.
 * - time-series: one value per ordered period.
 * - category: one value per category of a single dimension (parts of a whole when values are non-negative).
 * - multi-series: values by two dimensions (category × series).
 * - ordered-stages: values per ordered process stage (stage order is meaningful).
 * - rows: record rows without a usable date.
 * - dated-rows: record rows with a date (queue / timeline / calendar).
 * - panel: an application-rendered composite panel (fixed presentation).
 * Additive shapes (their views never appear on widgets of the shapes above, so existing dashboards are unchanged):
 * - bridge: signed steps from a start value to an end value (waterfall); the step order is the meaning.
 * - target: an actual against a target per category (bullet).
 * - grid: values by two dimensions where the cell intensity matters (heatmap).
 * - cumulative: a running total over ordered periods, optionally against a planned running total (S-curve).
 * - xy: records placed by two measures, sized by a third (bubble).
 * - profile: several scores of one subject on the same scale (radar).
 * - schedule: records with a start and an end date (gantt).
 * - hierarchy: non-negative parts of one whole by category (treemap).
 * - board: records grouped by their workflow lane (kanban).
 */
export const DATA_SHAPES = ["number", "time-series", "category", "multi-series", "ordered-stages", "rows", "dated-rows", "panel",
  "bridge", "target", "grid", "cumulative", "xy", "profile", "schedule", "hierarchy", "board", "split"] as const;
export type DataShape = (typeof DATA_SHAPES)[number];

export const COMPATIBLE: Record<DataShape, readonly ViewKind[]> = {
  number: ["kpi"],
  "time-series": ["bar", "line", "area", "table"],
  category: ["bar", "donut", "pie", "status", "table"],
  "multi-series": ["stacked-bar", "line", "area", "pivot", "table"],
  "ordered-stages": ["funnel", "bar", "status", "table"],
  rows: ["table", "queue"],
  "dated-rows": ["queue", "table", "timeline", "calendar"],
  panel: ["panel"],
  bridge: ["waterfall", "table"],
  target: ["bullet", "bar", "table"],
  grid: ["heatmap", "pivot", "table"],
  cumulative: ["scurve", "line", "area", "table"],
  xy: ["bubble", "table"],
  profile: ["radar", "bar", "table"],
  schedule: ["gantt", "timeline", "table"],
  hierarchy: ["treemap", "bar", "donut", "table"],
  board: ["kanban", "queue", "table"],
  split: ["split", "bar", "table"],
};

export const VIEW_LABEL: Record<ViewKind, Bi> = {
  kpi: ["KPI card", "بطاقة مؤشر"], line: ["Line", "خطي"], area: ["Area", "مساحي"], bar: ["Bar", "أعمدة"], "stacked-bar": ["Stacked bar", "أعمدة مكدسة"],
  donut: ["Donut", "حلقي"], pie: ["Pie", "دائري"], funnel: ["Funnel", "قمعي"], table: ["Table", "جدول"], pivot: ["Pivot", "جدول محوري"],
  timeline: ["Timeline", "خط زمني"], calendar: ["Calendar", "تقويم"], status: ["Status distribution", "توزيع الحالات"], queue: ["Work queue", "قائمة عمل"], panel: ["Panel", "لوحة"],
  waterfall: ["Waterfall", "شلالي"], bullet: ["Bullet (actual vs target)", "نقطي (الفعلي مقابل المستهدف)"], heatmap: ["Heatmap", "خريطة حرارية"], scurve: ["S-curve", "منحنى S"],
  bubble: ["Bubble", "فقاعي"], radar: ["Radar", "راداري"], gantt: ["Gantt", "مخطط جانت"], treemap: ["Treemap", "خريطة شجرية"], kanban: ["Kanban board", "لوحة كانبان"],
  split: ["Split bars (posted · pending)", "أعمدة مقسومة (مرحّل · بانتظار)"],
};

const SHAPE_LABEL: Record<DataShape, Bi> = {
  number: ["a single figure", "رقم واحد"], "time-series": ["values over time", "قيم عبر الزمن"], category: ["values by one category", "قيم حسب فئة واحدة"],
  "multi-series": ["values by two dimensions", "قيم حسب بعدين"], "ordered-stages": ["ordered process stages", "مراحل عملية مرتبة"],
  rows: ["a list of records", "قائمة سجلات"], "dated-rows": ["a list of dated records", "قائمة سجلات مؤرخة"], panel: ["a composite panel", "لوحة مركبة"],
  bridge: ["ordered signed steps", "خطوات موجبة وسالبة مرتبة"], target: ["actuals against targets", "قيم فعلية مقابل مستهدفات"], grid: ["a two-dimension intensity grid", "شبكة شدة ببعدين"],
  cumulative: ["a running total over time", "مجموع تراكمي عبر الزمن"], xy: ["records placed by two measures", "سجلات موزعة بمقياسين"], profile: ["scores of one subject", "درجات لموضوع واحد"],
  schedule: ["records with start and end dates", "سجلات بتاريخ بداية ونهاية"], hierarchy: ["parts of one whole", "أجزاء من كلٍّ واحد"], board: ["records by workflow lane", "سجلات حسب مسار العمل"],
  split: ["posted and pending parts of two or more totals", "أجزاء مرحّلة وأخرى بانتظار الاعتماد لإجماليين أو أكثر"],
};

/** Optional data facts that further restrict views (declared by the widget or observed in the current data). */
export interface ShapeFacts { signed?: boolean | undefined; orderedStages?: boolean | undefined }

export type ViewCheck = { ok: true } | { ok: false; reason: Bi };

/** Whether `view` may render data of `shape` (and the widget's own allowed list); the reason is shown to the user. */
export function checkView(shape: DataShape, view: string, allowed?: readonly ViewKind[], facts: ShapeFacts = {}): ViewCheck {
  if (!(VIEW_KINDS as readonly string[]).includes(view)) return { ok: false, reason: [`"${view}" is not a known visualization.`, `"${view}" ليس نوع عرض معروفًا.`] };
  const v = view as ViewKind;
  const s = SHAPE_LABEL[shape]; const l = VIEW_LABEL[v];
  if (!COMPATIBLE[shape].includes(v)) {
    if (shape === "number") return { ok: false, reason: [`This widget is ${s[0]}; a ${l[0].toLowerCase()} needs several values, so only the KPI card keeps its meaning.`, `هذه الأداة ${s[1]}؛ عرض «${l[1]}» يحتاج عدة قيم، لذا تبقى بطاقة المؤشر فقط محافظة على المعنى.`] };
    if (v === "funnel") return { ok: false, reason: ["A funnel needs ordered process stages; these categories have no stage order.", "العرض القمعي يحتاج مراحل عملية مرتبة؛ هذه الفئات بلا ترتيب مراحل."] };
    if (v === "pie" || v === "donut" || v === "treemap") return { ok: false, reason: [`A ${l[0].toLowerCase()} shows parts of one whole; this widget shows ${s[0]}.`, `العرض «${l[1]}» يبين أجزاء من كلٍّ واحد؛ وهذه الأداة تعرض ${s[1]}.`] };
    if (v === "waterfall") return { ok: false, reason: ["A waterfall needs ordered signed steps from a start to an end value.", "العرض الشلالي يحتاج خطوات موجبة وسالبة مرتبة من قيمة بداية إلى قيمة نهاية."] };
    if (v === "bullet") return { ok: false, reason: ["A bullet chart needs a target for every actual.", "المخطط النقطي يحتاج مستهدفًا لكل قيمة فعلية."] };
    if (v === "scurve") return { ok: false, reason: ["An S-curve needs a running total over ordered periods.", "منحنى S يحتاج مجموعًا تراكميًا عبر فترات مرتبة."] };
    if (v === "gantt") return { ok: false, reason: ["A Gantt chart needs records with a start and an end date.", "مخطط جانت يحتاج سجلات بتاريخ بداية ونهاية."] };
    if (v === "kanban") return { ok: false, reason: ["A Kanban board needs records grouped by workflow lane.", "لوحة كانبان تحتاج سجلات مجمعة حسب مسار العمل."] };
    if (v === "bubble" || v === "heatmap" || v === "radar") return { ok: false, reason: [`A ${l[0].toLowerCase()} needs ${v === "bubble" ? "two measures per record" : v === "heatmap" ? "values by two dimensions" : "several scores of one subject"}; this widget shows ${s[0]}.`, `العرض «${l[1]}» يحتاج ${v === "bubble" ? "مقياسين لكل سجل" : v === "heatmap" ? "قيمًا حسب بعدين" : "عدة درجات لموضوع واحد"}؛ وهذه الأداة تعرض ${s[1]}.`] };
    if (v === "kpi") return { ok: false, reason: [`A KPI card shows one figure; this widget shows ${s[0]}.`, `بطاقة المؤشر تعرض رقمًا واحدًا؛ وهذه الأداة تعرض ${s[1]}.`] };
    return { ok: false, reason: [`A ${l[0].toLowerCase()} cannot show ${s[0]} without changing what the widget means.`, `لا يمكن لعرض «${l[1]}» إظهار ${s[1]} دون تغيير معنى الأداة.`] };
  }
  if (allowed && !allowed.includes(v)) return { ok: false, reason: [`The widget owner did not approve the ${l[0].toLowerCase()} view for this metric.`, `لم يعتمد مالك الأداة عرض «${l[1]}» لهذا المؤشر.`] };
  if ((v === "pie" || v === "donut" || v === "treemap") && facts.signed) return { ok: false, reason: ["Negative values cannot be shown as parts of a whole.", "لا يمكن عرض القيم السالبة كأجزاء من كلٍّ واحد."] };
  if (v === "funnel" && facts.orderedStages === false) return { ok: false, reason: ["A funnel needs ordered process stages.", "العرض القمعي يحتاج مراحل عملية مرتبة."] };
  return { ok: true };
}

/** Views a widget may switch to (shape ∩ owner-approved list), default view first. */
export function viewsFor(shape: DataShape, defaultView: ViewKind, allowed?: readonly ViewKind[], facts: ShapeFacts = {}): ViewKind[] {
  const vs = COMPATIBLE[shape].filter((v) => checkView(shape, v, allowed, facts).ok);
  return [defaultView, ...vs.filter((v) => v !== defaultView)];
}
