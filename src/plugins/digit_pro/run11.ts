/**
 * DIGIT Pro Run11.1 — Golden UX first slice contract (owner brief 2026-11-08, Phase 2).
 *
 * All 20 workspaces render the Run11.1 three-tab composition (Dashboard · Documents & work · Full reports) — owner
 * 2026-11-09 "fix every Pro problem" (audit G13 / G09): the five-tab panels are re-homed, none removed. RUN11_SLICE stays
 * the first slice whose 46 placements are mapped below; the other 18 workspaces are crosswalked in run11Rollout.ts (owner
 * closeout brief 2026-11-10 §B1), so all 448 placements resolve to an active element or a typed reason.
 * Every target placement of the slice (PLACEMENTS_448_RUN11_1.csv, 23 per workspace) is listed here with:
 *  - impl: the implementation class from the brief §8 (never collapsed to DONE / NOT DONE);
 *  - binds: the EXISTING on-page element that serves it (KPI / chart / queue / extra / doc ids from sections.ts and
 *    SectionExtras.tsx), so nothing is computed twice and no second definition appears;
 *  - pending placements (proposed formulas, owner policy, server-only methods) carry their reason and candidate existing
 *    figures — they are shown as pending, never with an invented value.
 * Server-only Pro capabilities (digit_pro-main source, inspected 2026-11-08) are typed contracts marked NOT_CONNECTED in
 * this preview: the browser never claims to run Frappe Python.
 */
import type { Bi } from "./command";
import type { DocDef, Filter, QueueDef, SectionCtx } from "./sections";
import { ROLLOUT_ACTIONS, ROLLOUT_PLACEMENTS, ROLLOUT_QUEUES } from "./run11Rollout";
import { applyAction, applyFormula, formulaQueues } from "./run11Formulas";
import { insightIdsFor } from "./run11Insights";

export const RUN11_SLICE: ReadonlySet<string> = new Set(["ACC-DUES", "SEL-SALES"]);
export const RUN11_VERSION = "run11.1-golden-slice-1 (2026-11-08)";
/** Three-tab contract on every section workspace (owner 2026-11-09). */
export const RUN11_ROLLOUT = "run11.1-three-tab-all-20 (2026-11-09)";

/**
 * User-facing wording of a slice note (audit G08): internal insight ids (ACC-DUES-BI-05) and server method names
 * (digit_pro.ops_models.get_quote_funnel, get_line_availability) are removed; the plain-language basis stays.
 * Developer mode shows the full note.
 */
export function plainNote(text: string): string {
  return text
    .replace(/\(\s*(?:[a-z_]+\.)*get_[a-z_]+\s*\)/g, "")
    .replace(/(?:[a-z_]+\.)+get_[a-z_]+\s*:\s*/g, "")
    .replace(/\s*(?:[a-z_]+\.)*\bget_[a-z_]+\b/g, "")
    .replace(/\s*\b[A-Z]{2,4}-[A-Z]+-(?:BI|EX|ACT)-\d+\b/g, "")
    .replace(/\(\s*\)/g, "")
    .replace(/\s+([.,:;،؛)])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export const RUN11_TABS = ["overview", "documents", "reports"] as const;
export type Run11Tab = (typeof RUN11_TABS)[number];
/** Same wording the Enterprise host already serves (digit_enterprise/public/js/pro-sections.js TAB_LABEL). */
export const RUN11_TAB_LABEL: Record<Run11Tab, Bi> = { overview: ["Dashboard", "لوحة المعلومات"], documents: ["Documents & work", "المستندات والعمليات"], reports: ["Full reports", "التقارير الكاملة"] };
/** Legacy five-tab links keep working: Work → Documents & work, Details → Full reports (definitions live there). */
export function run11Tab(raw: string | undefined): Run11Tab {
  if (raw === "work") return "documents";
  if (raw === "details") return "reports";
  return (RUN11_TABS as readonly string[]).includes(raw ?? "") ? (raw as Run11Tab) : "overview";
}
export const isLegacyTab = (raw: string | undefined) => raw === "work" || raw === "details";

/* ------------------------------------------------------------------ implementation / evidence classes ------------------------------------------------------------------ */
export type Impl = "PRESERVE_EXISTING" | "FRONTEND_PRESENT" | "BACKEND_SOURCE_ONLY" | "NATIVE_AVAILABLE" | "PARTIAL" | "FORMULA_PENDING_REVIEW" | "OWNER_POLICY_REQUIRED" | "INTEGRATION_MISSING" | "CONFIGURATION_REQUIRED";
export const PENDING: ReadonlySet<Impl> = new Set(["FORMULA_PENDING_REVIEW", "OWNER_POLICY_REQUIRED", "BACKEND_SOURCE_ONLY", "INTEGRATION_MISSING"]);
export const IMPL_LABEL: Record<Impl, Bi> = {
  PRESERVE_EXISTING: ["Existing, kept", "قائم ومحفوظ"], FRONTEND_PRESENT: ["Shown in this preview", "معروض في المعاينة"],
  BACKEND_SOURCE_ONLY: ["Pro server only — not connected here", "على خادم برو فقط — غير متصل هنا"], NATIVE_AVAILABLE: ["Native DIGIT action", "إجراء أصلي في النظام"],
  PARTIAL: ["Partly covered", "مغطى جزئيًا"], FORMULA_PENDING_REVIEW: ["Formula pending review", "المعادلة بانتظار المراجعة"],
  OWNER_POLICY_REQUIRED: ["Needs an owner decision", "يتطلب قرار المالك"], INTEGRATION_MISSING: ["Not available yet", "غير متاح بعد"],
  CONFIGURATION_REQUIRED: ["Needs configuration", "يتطلب إعدادًا"],
};

export type PlacementType = "KPI" | "CHART" | "QUEUE" | "DOCUMENT" | "ACTION" | "REPORT";
export interface Placement {
  id: string; type: PlacementType; ws: string; label: Bi; impl: Impl; tab: Run11Tab;
  /** existing element keys this placement is served by: kpi:<id> chart:<id> queue:<id> dues:<card> ageing:<side> extra:<id> doc:<DocType> action:<id> report:<name> pro:<route> run11q:<id> */
  binds: string[];
  note?: Bi;
  /** Pro server method that owns the figure when not computable from the shared preview adapter */
  server?: string;
}

const P = (id: string, type: PlacementType, ws: string, label: Bi, impl: Impl, tab: Run11Tab, binds: string[], note?: Bi, server?: string): Placement =>
  ({ id, type, ws, label, impl, tab, binds, ...(note ? { note } : {}), ...(server ? { server } : {}) });

const PROPOSED: Bi = ["The Run11.1 placement carries a proposed definition only; the owner has not approved a formula.", "يحمل الموضع تعريفًا مقترحًا فقط؛ لم يعتمد المالك معادلة بعد."];

const SLICE_PLACEMENTS: Placement[] = [
  /* ---------------- ACC-DUES · Receivables & Payables ---------------- */
  P("KPI-ACC-DUES-01", "KPI", "ACC-DUES", ["Overdue receivables", "ذمم مدينة متأخرة"], "PRESERVE_EXISTING", "overview", ["dues:ar-overdue"],
    ["Same basis as the placement: outstanding of unpaid invoices with due date before the as-of date, credits shown separately.", "نفس أساس الموضع: المتبقي من الفواتير غير المدفوعة المستحقة قبل تاريخ التقرير، والأرصدة الدائنة منفصلة."]),
  P("KPI-ACC-DUES-02", "KPI", "ACC-DUES", ["Due payables", "ذمم دائنة مستحقة"], "FORMULA_PENDING_REVIEW", "overview", ["dues:ap", "dues:ap-overdue", "dues:ap-7"], PROPOSED),
  P("KPI-ACC-DUES-03", "KPI", "ACC-DUES", ["Unallocated receipts", "مقبوضات غير مخصصة"], "FORMULA_PENDING_REVIEW", "overview", ["kpi:pe-unalloc"],
    ["Candidate: the existing 'Payments with unallocated amount' figure counts receipts AND payments; a receipts-only rule needs approval.", "المرشح: رقم «مدفوعات بمبالغ غير مخصصة» الحالي يشمل المقبوضات والمدفوعات معًا؛ قاعدة المقبوضات فقط تحتاج اعتمادًا."]),
  P("KPI-ACC-DUES-04", "KPI", "ACC-DUES", ["Invoices due soon", "فواتير قريبة الاستحقاق"], "FORMULA_PENDING_REVIEW", "overview", ["dues:ar-7", "dues:ap-7"], PROPOSED),
  P("KPI-ACC-DUES-05", "KPI", "ACC-DUES", ["Disputed invoices", "فواتير متنازع عليها"], "OWNER_POLICY_REQUIRED", "overview", [],
    ["DIGIT has no native dispute field or status on invoices; a dispute source must be decided before this figure can exist.", "لا يوجد في النظام حقل أو حالة أصلية للنزاع على الفواتير؛ يجب تحديد مصدر النزاع قبل وجود هذا الرقم."]),
  P("CH-ACC-DUES-01", "CHART", "ACC-DUES", ["AR ageing buckets", "فئات تقادم الذمم المدينة"], "PRESERVE_EXISTING", "overview", ["ageing:receivable"]),
  P("CH-ACC-DUES-02", "CHART", "ACC-DUES", ["AP due calendar", "تقويم استحقاق الذمم الدائنة"], "PARTIAL", "overview", ["ageing:payable", "pro:/pro/payables"],
    ["The workspace shows payables by age; the full due-window calendar (weeks ahead, PO commitments) is the existing Payables screen.", "تعرض مساحة العمل الذمم الدائنة حسب العمر؛ تقويم نوافذ الاستحقاق الكامل (الأسابيع القادمة والالتزامات) في شاشة الذمم الدائنة القائمة."]),
  P("Q-ACC-DUES-01", "QUEUE", "ACC-DUES", ["Overdue customers", "عملاء متأخرون"], "PRESERVE_EXISTING", "documents", ["extra:dues-work:receivable:overdue"]),
  P("Q-ACC-DUES-02", "QUEUE", "ACC-DUES", ["Unallocated payments", "دفعات غير مخصصة"], "FRONTEND_PRESENT", "documents", ["run11q:pe-unalloc"],
    ["Same predicate as the existing KPI and Pro insight ACC-DUES-BI-05: submitted Payment Entry with unallocated amount above zero.", "نفس شرط الرقم القائم ومؤشر برو ACC-DUES-BI-05: سند دفع معتمد بمبلغ غير مخصص أكبر من صفر."]),
  P("Q-ACC-DUES-03", "QUEUE", "ACC-DUES", ["Supplier invoices requiring attention", "فواتير موردين تحتاج متابعة"], "PARTIAL", "documents", ["run11q:pi-hold", "extra:dues-work:payable:overdue"],
    ["Shown: supplier invoices on hold (native on_hold) and overdue payables. Any wider 'attention' rule needs an owner definition.", "المعروض: فواتير الموردين الموقوفة (الإيقاف الأصلي) والذمم الدائنة المتأخرة. أي قاعدة «متابعة» أوسع تحتاج تعريفًا من المالك."]),
  P("DOC-ACC-DUES-01", "DOCUMENT", "ACC-DUES", ["Sales Invoice", "فاتورة المبيعات"], "PRESERVE_EXISTING", "documents", ["doc:Sales Invoice"]),
  P("DOC-ACC-DUES-02", "DOCUMENT", "ACC-DUES", ["Purchase Invoice", "فاتورة المشتريات"], "PRESERVE_EXISTING", "documents", ["doc:Purchase Invoice"]),
  P("DOC-ACC-DUES-03", "DOCUMENT", "ACC-DUES", ["Payment Entry", "سند الدفع"], "PRESERVE_EXISTING", "documents", ["doc:Payment Entry"]),
  P("DOC-ACC-DUES-04", "DOCUMENT", "ACC-DUES", ["Customer", "العميل"], "PRESERVE_EXISTING", "documents", ["doc:Customer"]),
  P("DOC-ACC-DUES-05", "DOCUMENT", "ACC-DUES", ["Supplier", "المورد"], "PRESERVE_EXISTING", "documents", ["doc:Supplier"]),
  P("ACT-ACC-DUES-01", "ACTION", "ACC-DUES", ["Open invoice", "فتح الفاتورة"], "NATIVE_AVAILABLE", "documents", ["action:ACT-ACC-DUES-01"]),
  P("ACT-ACC-DUES-02", "ACTION", "ACC-DUES", ["Create permitted Payment Entry", "إنشاء سند دفع مسموح"], "NATIVE_AVAILABLE", "documents", ["action:ACT-ACC-DUES-02"]),
  P("ACT-ACC-DUES-03", "ACTION", "ACC-DUES", ["Allocate against invoice", "التخصيص مقابل الفاتورة"], "NATIVE_AVAILABLE", "documents", ["action:ACT-ACC-DUES-03"],
    ["Allocation happens inside the native Payment Entry (outstanding invoices table) or the Payment Reconciliation tool; ledger rows are written only on submit.", "يتم التخصيص داخل سند الدفع الأصلي (جدول الفواتير القائمة) أو أداة تسوية المدفوعات؛ لا تُكتب قيود الأستاذ إلا عند الاعتماد."]),
  P("ACT-ACC-DUES-04", "ACTION", "ACC-DUES", ["Open ageing report", "فتح تقرير التقادم"], "PRESERVE_EXISTING", "documents", ["action:ACT-ACC-DUES-04"]),
  P("RPL-ACC-DUES-01", "REPORT", "ACC-DUES", ["Accounts Receivable", "الذمم المدينة"], "FRONTEND_PRESENT", "reports", ["report:Accounts Receivable"]),
  P("RPL-ACC-DUES-02", "REPORT", "ACC-DUES", ["Accounts Payable", "الذمم الدائنة"], "FRONTEND_PRESENT", "reports", ["report:Accounts Payable"]),
  P("RPL-ACC-DUES-03", "REPORT", "ACC-DUES", ["Accounts Receivable Summary", "ملخص الذمم المدينة"], "FRONTEND_PRESENT", "reports", ["report:Accounts Receivable Summary"]),
  P("RPL-ACC-DUES-04", "REPORT", "ACC-DUES", ["Accounts Payable Summary", "ملخص الذمم الدائنة"], "FRONTEND_PRESENT", "reports", ["report:Accounts Payable Summary"]),

  /* ---------------- SEL-SALES · Quotations & Orders ---------------- */
  P("KPI-SEL-SALES-01", "KPI", "SEL-SALES", ["Open quotations", "عروض أسعار مفتوحة"], "PARTIAL", "overview", ["kpi:q-open", "kpi:q-lapsed"],
    ["Definition difference kept visible: the existing figure counts Open / Replied / Partially Ordered including quotations past validity (shown separately); the placement and Pro insight SEL-SALES-BI-01 exclude expired ones.", "فرق تعريف ظاهر: الرقم القائم يعدّ المفتوحة والمردود عليها والمطلوبة جزئيًا بما فيها المنتهية الصلاحية (تُعرض منفصلة)؛ الموضع ومؤشر برو SEL-SALES-BI-01 يستبعدان المنتهية."]),
  P("KPI-SEL-SALES-02", "KPI", "SEL-SALES", ["Quotations expiring (valid till)", "عروض قرب انتهاء الصلاحية"], "PRESERVE_EXISTING", "overview", ["kpi:q-exp"],
    ["Same basis: open quotations with valid till inside the next 7 days; quotations without a valid-till date are excluded.", "نفس الأساس: عروض مفتوحة تنتهي صلاحيتها خلال 7 أيام؛ العروض بلا تاريخ صلاحية مستبعدة."]),
  P("KPI-SEL-SALES-03", "KPI", "SEL-SALES", ["Open sales orders", "أوامر بيع مفتوحة"], "FORMULA_PENDING_REVIEW", "overview", ["kpi:so-deliver"],
    ["Candidate: the existing 'Orders to deliver' figure (To Deliver / To Deliver and Bill). Pro insight SEL-SALES-BI-03 also counts To Bill; the owner must choose one.", "المرشح: رقم «طلبات بانتظار التسليم» القائم. مؤشر برو SEL-SALES-BI-03 يضيف «بانتظار الفوترة»؛ على المالك اختيار تعريف واحد."]),
  P("KPI-SEL-SALES-04", "KPI", "SEL-SALES", ["Quote conversion rate", "نسبة تحويل العروض"], "BACKEND_SOURCE_ONLY", "overview", ["pro:/pro/quotation-pipeline"],
    ["Pro computes it on the server (digit_pro.ops_models.get_quote_funnel: quotation-month cohort, converted = Ordered / Partially Ordered). This preview shows cohort counts on the Quotation Pipeline, not a rate.", "يحسبها برو على الخادم (get_quote_funnel: مجموعة شهر العرض، المحوّل = مطلوب أو مطلوب جزئيًا). تعرض المعاينة أعداد المجموعات في خط العروض، وليس نسبة."],
    "digit_pro.ops_models.get_quote_funnel"),
  P("KPI-SEL-SALES-05", "KPI", "SEL-SALES", ["Orders at fulfilment risk", "طلبات معرضة لتعثر التنفيذ"], "FORMULA_PENDING_REVIEW", "overview", ["pro:/pro/order-fulfilment"],
    ["Candidate: late and due lines on the existing Order Fulfilment screen; stock shortage per line is a Pro server method (get_line_availability).", "المرشح: البنود المتأخرة والمستحقة في شاشة تنفيذ الطلبات القائمة؛ عجز المخزون لكل بند طريقة على خادم برو."]),
  P("CH-SEL-SALES-01", "CHART", "SEL-SALES", ["Quotation-to-order funnel", "مسار العرض إلى الطلب"], "PARTIAL", "overview", ["chart:q-status"],
    ["Shown as quotations by native status (Open → Ordered / Lost / Expired); the cohort funnel is the server method get_quote_funnel.", "يُعرض كعروض حسب الحالة الأصلية؛ مسار المجموعات طريقة على الخادم get_quote_funnel."]),
  P("CH-SEL-SALES-02", "CHART", "SEL-SALES", ["Sales orders trend", "اتجاه أوامر البيع"], "PRESERVE_EXISTING", "overview", ["chart:so-month"]),
  P("Q-SEL-SALES-01", "QUEUE", "SEL-SALES", ["Quotes nearing expiration", "عروض قرب الانتهاء"], "PRESERVE_EXISTING", "documents", ["queue:q-follow"]),
  P("Q-SEL-SALES-02", "QUEUE", "SEL-SALES", ["Unconfirmed orders", "طلبات غير مؤكدة"], "PRESERVE_EXISTING", "documents", ["queue:so-draft"]),
  P("Q-SEL-SALES-03", "QUEUE", "SEL-SALES", ["Orders blocked by stock or credit", "طلبات متوقفة بسبب المخزون أو الائتمان"], "PARTIAL", "documents", ["run11q:so-hold"],
    ["Shown: submitted orders on hold (native status — the same rows as Pro's credit-hold queue). Customers over credit limit and line stock shortages are Pro server methods.", "المعروض: الطلبات المعتمدة الموقوفة (حالة أصلية — نفس صفوف قائمة إيقاف الائتمان في برو). العملاء المتجاوزون للحد الائتماني وعجز المخزون طرق على خادم برو."],
    "digit_pro.ops_models.get_credit_hold_queue"),
  P("DOC-SEL-SALES-01", "DOCUMENT", "SEL-SALES", ["Quotation", "عرض السعر"], "PRESERVE_EXISTING", "documents", ["doc:Quotation"]),
  P("DOC-SEL-SALES-02", "DOCUMENT", "SEL-SALES", ["Sales Order", "طلب البيع"], "PRESERVE_EXISTING", "documents", ["doc:Sales Order"]),
  P("DOC-SEL-SALES-03", "DOCUMENT", "SEL-SALES", ["Customer", "العميل"], "PRESERVE_EXISTING", "documents", ["doc:Customer"]),
  P("DOC-SEL-SALES-04", "DOCUMENT", "SEL-SALES", ["Item", "الصنف"], "PRESERVE_EXISTING", "documents", ["doc:Item"]),
  P("DOC-SEL-SALES-05", "DOCUMENT", "SEL-SALES", ["Price List", "قائمة الأسعار"], "FRONTEND_PRESENT", "documents", ["doc:Price List"],
    ["Added as a register card for this workspace; Price List stays owned by Customers & Pricing.", "أضيفت كبطاقة سجل لهذه المساحة؛ تبقى قائمة الأسعار ملكًا لقسم العملاء والتسعير."]),
  P("ACT-SEL-SALES-01", "ACTION", "SEL-SALES", ["New quotation", "عرض سعر جديد"], "PRESERVE_EXISTING", "documents", ["action:ACT-SEL-SALES-01"]),
  P("ACT-SEL-SALES-02", "ACTION", "SEL-SALES", ["Create order from source", "إنشاء طلب من المصدر"], "NATIVE_AVAILABLE", "documents", ["action:ACT-SEL-SALES-02"],
    ["From a submitted quotation use Create → Sales Order in the native form; the order keeps the quotation link.", "من عرض سعر معتمد استخدم إنشاء ← طلب بيع في النموذج الأصلي؛ يحتفظ الطلب بربط العرض."]),
  P("ACT-SEL-SALES-03", "ACTION", "SEL-SALES", ["Open order 360", "فتح الطلب 360"], "PRESERVE_EXISTING", "documents", ["action:ACT-SEL-SALES-03"]),
  P("ACT-SEL-SALES-04", "ACTION", "SEL-SALES", ["Preview available-to-promise", "معاينة الكمية المتاحة للوعد"], "BACKEND_SOURCE_ONLY", "documents", ["action:ACT-SEL-SALES-04"],
    ["Pro server method digit_pro.ops_models.get_line_availability (Bin: actual, reserved, projected; earliest open PO supply). Not connected in this preview.", "طريقة على خادم برو get_line_availability (الكميات الفعلية والمحجوزة والمتوقعة وأقرب توريد). غير متصلة في هذه المعاينة."],
    "digit_pro.ops_models.get_line_availability"),
  P("RPL-SEL-SALES-01", "REPORT", "SEL-SALES", ["Quotation Trends", "اتجاهات عروض الأسعار"], "NATIVE_AVAILABLE", "reports", ["report:Quotation Trends"]),
  P("RPL-SEL-SALES-02", "REPORT", "SEL-SALES", ["Sales Order Analysis", "تحليل أوامر البيع"], "NATIVE_AVAILABLE", "reports", ["report:Sales Order Analysis"]),
  P("RPL-SEL-SALES-03", "REPORT", "SEL-SALES", ["Sales Order Trends", "اتجاهات أوامر البيع"], "NATIVE_AVAILABLE", "reports", ["report:Sales Order Trends"]),
  P("RPL-SEL-SALES-04", "REPORT", "SEL-SALES", ["Lost Quotations", "العروض المفقودة"], "NATIVE_AVAILABLE", "reports", ["report:Lost Quotations"]),
];
/** All 448 Run11.1 placements: the first slice above plus the crosswalked rollout (run11Rollout.ts). */
/** All 448 Run11.1 placements with their defined formulas applied (run11Formulas.ts, owner decision 2026-11-11). */
export const PLACEMENTS: Placement[] = [...SLICE_PLACEMENTS, ...ROLLOUT_PLACEMENTS].map(applyFormula);
export const placementsOf = (ws: string, type?: PlacementType) => PLACEMENTS.filter((p) => p.ws === ws && (!type || p.type === type));
/**
 * Owner decision 2026-11-10: the original Run11.1 report placement IDs (RPT-*) are canonical; the RPL-* IDs carried by
 * docs/run11_1/source and this catalog stay as backward-compatible aliases. Same workspace, name and number — run11Ids.test.ts
 * checks all 72 against the original 448 placement sheet (docs/experience/history_reference), so no ID is invented.
 */
export function canonicalPlacementId(id: string): string { return id.startsWith("RPL-") ? `RPT-${id.slice(4)}` : id; }
/** Placement by its canonical (RPT-*) or alias (RPL-*) ID. */
export function placementByAnyId(id: string): Placement | undefined {
  const own = id.startsWith("RPT-") ? `RPL-${id.slice(4)}` : id;
  return PLACEMENTS.find((p) => p.id === own);
}
/** Placement ids served by an existing element key (for data-run11-placement attributes). */
export function placementIds(ws: string, key: string): string | undefined {
  const ids = PLACEMENTS.filter((p) => p.ws === ws && p.binds.includes(key)).map((p) => p.id);
  // Run11.1 Part C insights served by the same element ride on the same attribute (run11Insights.ts), so each is traceable on screen
  const all = [...ids, ...insightIdsFor(ws, ids, key)];
  return all.length ? all.join(" ") : undefined;
}

/* ------------------------------------------------------------------ slice-only queues and register cards ------------------------------------------------------------------ */
const co = (c: SectionCtx): Filter => ["company", "=", c.company];
const SUB: Filter = ["docstatus", "=", 1];
/** Queues the placements need that the section spec does not carry. Predicates reuse existing native fields only and are
 *  slice-local, so the exported section contract (config/sections.json) is unchanged. */
const BASE_QUEUES: Record<string, (c: SectionCtx) => QueueDef[]> = {
  ...ROLLOUT_QUEUES,
  "ACC-DUES": (c) => [
    { id: "pe-unalloc", label: ["Unallocated payments", "دفعات غير مخصصة"], doctype: "Payment Entry", filters: [co(c), SUB, ["unallocated_amount", ">", 0]], date: "posting_date", party: "party", amount: "unallocated_amount", cur: "paid_from_account_currency", order: "asc", action: ["Allocate against open invoices", "خصصها مقابل الفواتير المفتوحة"], severity: "high" },
    { id: "pi-hold", label: ["Supplier invoices on hold", "فواتير موردين موقوفة"], doctype: "Purchase Invoice", filters: [co(c), SUB, ["on_hold", "=", 1], ["outstanding_amount", ">", 0]], date: "due_date", party: "supplier", amount: "outstanding_amount", cur: "currency", order: "asc", action: ["Review the hold reason and release date", "راجع سبب الإيقاف وتاريخ الرفع"], severity: "medium", overdueFrom: c.asOf },
  ],
  "SEL-SALES": (c) => [
    { id: "so-hold", label: ["Sales orders on hold", "أوامر بيع موقوفة"], doctype: "Sales Order", filters: [co(c), SUB, ["status", "=", "On Hold"]], date: "transaction_date", party: "customer", amount: "grand_total", order: "asc", action: ["Resolve the hold, then resume in the native order", "عالج سبب الإيقاف ثم استأنف في الطلب الأصلي"], severity: "high" },
  ],
};
/** Queues of every workspace: the slice/rollout queues plus the defined-formula queues (run11Formulas.ts). */
export const RUN11_QUEUES: Record<string, (c: SectionCtx) => QueueDef[]> = Object.fromEntries(
  [...new Set([...Object.keys(BASE_QUEUES), ...ROLLOUT_PLACEMENTS.map((p) => p.ws), ...RUN11_SLICE])].map((ws) => [ws, (c: SectionCtx) => [...(BASE_QUEUES[ws]?.(c) ?? []), ...formulaQueues(ws, c)]]),
);
export const RUN11_DOCS: Record<string, DocDef[]> = {
  "SEL-SALES": [{ doctype: "Price List", owner: "selling", role: ["Selling price lists used on quotations", "قوائم أسعار البيع المستخدمة في العروض"] }],
};

/* ------------------------------------------------------------------ contextual actions ------------------------------------------------------------------ */
export interface Run11Action {
  id: string; label: Bi; how: Bi;
  /** native-new: open the empty native form · list: open a filtered native list · tool: open a single (tool) DocType form ·
   *  pro: an existing Pro screen · report: report viewer · tab: another tab of this workspace (to = tab key) ·
   *  server: Pro server only · policy: waits for an owner decision · missing: no source exists for it */
  kind: "native-new" | "list" | "tool" | "pro" | "report" | "tab" | "server" | "policy" | "missing";
  doctype?: string; filters?: (c: SectionCtx) => Filter[]; to?: string; report?: string; server?: string;
}
const BASE_ACTIONS: Record<string, Run11Action[]> = {
  ...ROLLOUT_ACTIONS,
  "ACC-DUES": [
    { id: "ACT-ACC-DUES-01", label: ["Open invoice", "فتح الفاتورة"], how: ["Every invoice number in the register opens its native form.", "كل رقم فاتورة في السجل يفتح نموذجها الأصلي."], kind: "list", doctype: "Sales Invoice", filters: (c) => [co(c), SUB, ["outstanding_amount", ">", 0]] },
    { id: "ACT-ACC-DUES-02", label: ["Create Payment Entry", "إنشاء سند دفع"], how: ["Opens the native form; only roles allowed to create Payment Entry see it.", "يفتح النموذج الأصلي؛ يظهر فقط للأدوار المسموح لها بإنشاء سند دفع."], kind: "native-new", doctype: "Payment Entry" },
    { id: "ACT-ACC-DUES-03", label: ["Allocate against invoice", "التخصيص مقابل الفاتورة"], how: ["Open an unallocated payment and allocate in its outstanding-invoices table, then submit.", "افتح دفعة غير مخصصة وخصصها في جدول الفواتير القائمة ثم اعتمدها."], kind: "list", doctype: "Payment Entry", filters: (c) => [co(c), SUB, ["unallocated_amount", ">", 0]] },
    { id: "ACT-ACC-DUES-04", label: ["Open ageing report", "فتح تقرير التقادم"], how: ["Accounts Receivable report with the same company and as-of date.", "تقرير الذمم المدينة بنفس الشركة والتاريخ."], kind: "report", report: "Accounts Receivable" },
  ],
  "SEL-SALES": [
    { id: "ACT-SEL-SALES-01", label: ["New quotation", "عرض سعر جديد"], how: ["Opens the native Quotation form when your role may create it.", "يفتح نموذج عرض السعر الأصلي عندما يسمح دورك بالإنشاء."], kind: "native-new", doctype: "Quotation" },
    { id: "ACT-SEL-SALES-02", label: ["Create order from a quotation", "إنشاء طلب من عرض سعر"], how: ["Open a submitted open quotation and use Create → Sales Order.", "افتح عرض سعر معتمدًا مفتوحًا واستخدم إنشاء ← طلب بيع."], kind: "list", doctype: "Quotation", filters: (c) => [co(c), SUB, ["status", "in", ["Open", "Replied", "Partially Ordered"]]] },
    { id: "ACT-SEL-SALES-03", label: ["Open order 360", "فتح الطلب 360"], how: ["Line-level delivery, return and billing progress of every open order.", "تقدم التسليم والمرتجع والفوترة لكل بند في الطلبات المفتوحة."], kind: "pro", to: "/pro/order-fulfilment" },
    { id: "ACT-SEL-SALES-04", label: ["Preview available-to-promise", "معاينة الكمية المتاحة للوعد"], how: ["Runs on the DIGIT Pro server for one quotation or order; not connected in this preview.", "تعمل على خادم ديجيت برو لعرض أو طلب واحد؛ غير متصلة في هذه المعاينة."], kind: "server", server: "digit_pro.ops_models.get_line_availability" },
  ],
};
/** Contextual actions with their defined targets (run11Formulas.ts): none waits on a policy, server or missing source. */
export const RUN11_ACTIONS: Record<string, Run11Action[]> = Object.fromEntries(Object.entries(BASE_ACTIONS).map(([ws, as]) => [ws, as.map(applyAction)]));

/* ------------------------------------------------------------------ competitor-feature capabilities (digit_pro/product.py FEATURES) ------------------------------------------------------------------ */
/** Status strings are Pro's own registry statuses (digit_pro-main, inspected 2026-11-08); the preview only states them. */
export interface Capability { id: string; label: Bi; status: Impl; detail: Bi; server?: string }
export const RUN11_CAPS: Record<string, Capability[]> = {
  "SEL-SALES": [
    { id: "CF-02", label: ["Sales inbox to quotation", "من البريد الوارد إلى عرض السعر"], status: "CONFIGURATION_REQUIRED", detail: ["Blocked by setup: no inbound mailbox and no AI provider are configured.", "متوقف على الإعداد: لا يوجد صندوق بريد وارد ولا مزود ذكاء اصطناعي."] },
    { id: "CF-04", label: ["Substitute item advisor", "مستشار الأصناف البديلة"], status: "BACKEND_SOURCE_ONLY", detail: ["Advisor API built in Pro; no DIGIT screen yet (owner decision) and no Item Alternative configured.", "واجهة المستشار مبنية في برو؛ لا توجد شاشة بعد (قرار المالك) ولا بدائل أصناف معرّفة."], server: "digit_pro.composer.get_substitutes" },
    { id: "CF-05", label: ["Assisted sales line composer", "مكوِّن سطور البيع المساعد"], status: "BACKEND_SOURCE_ONLY", detail: ["Deterministic, non-AI composer API built in Pro; no DIGIT screen yet (owner decision).", "واجهة تكوين محددة بدون ذكاء اصطناعي مبنية في برو؛ لا توجد شاشة بعد (قرار المالك)."], server: "digit_pro.composer.compose_lines" },
  ],
};

/* ------------------------------------------------------------------ Pro insight contracts (digit_pro/insights.py) ------------------------------------------------------------------ */
/** The six Run11.1 Part C insights per workspace as Pro defines them. `binds` names the existing on-page figure with the same
 *  basis; an insight without one is served only by Pro (digit_pro.insights.get_workspace_insights, flag digit_run11_insights). */
export interface Insight { id: string; ws: string; title: Bi; archetype: string; formula: Bi; source: string; binds: string[]; parity: "SAME_BASIS" | "DIFFERENT_BASIS" | "SERVER_ONLY"; note?: Bi }
const I = (id: string, ws: string, title: Bi, archetype: string, formula: Bi, source: string, binds: string[], parity: Insight["parity"], note?: Bi): Insight => ({ id, ws, title, archetype, formula, source, binds, parity, ...(note ? { note } : {}) });
export const INSIGHTS: Insight[] = [
  I("ACC-DUES-BI-01", "ACC-DUES", ["Open receivables", "الذمم المدينة المفتوحة"], "kpi", ["Net receivable as of the end date on the native Accounts Receivable basis (Payment Ledger Entry, Receivable, not delinked).", "صافي الذمم المدينة حتى تاريخ النهاية على أساس تقرير الذمم المدينة الأصلي."], "Accounts Receivable", ["dues:ar"], "SAME_BASIS"),
  I("ACC-DUES-BI-02", "ACC-DUES", ["Open payables", "الذمم الدائنة المفتوحة"], "kpi", ["Net payable as of the end date on the native Accounts Payable basis.", "صافي الذمم الدائنة حتى تاريخ النهاية على أساس تقرير الذمم الدائنة الأصلي."], "Accounts Payable", ["dues:ap"], "SAME_BASIS"),
  I("ACC-DUES-BI-03", "ACC-DUES", ["Receivables by age", "ديون متأخرة حسب العمر"], "stacked_bar", ["Outstanding of submitted Sales Invoices by days past due (current, 0-30, 31-60, 61-90, 91+).", "المتبقي من فواتير المبيعات حسب أيام التأخر عن الاستحقاق."], "Accounts Receivable", ["ageing:receivable"], "SAME_BASIS"),
  I("ACC-DUES-BI-04", "ACC-DUES", ["Supplier dues by week", "استحقاقات الموردين أسبوعيًا"], "timeline", ["Outstanding of submitted Purchase Invoices allocated to payment terms, by due week (overdue / 8 weeks / later).", "أقساط فواتير الموردين المفتوحة حسب أسبوع الاستحقاق."], "Accounts Payable", ["pro:/pro/payables"], "DIFFERENT_BASIS",
    ["The Payables screen groups by due window per invoice due date; Pro splits by payment-term instalment.", "شاشة الذمم الدائنة تجمع حسب تاريخ استحقاق الفاتورة؛ برو يقسم حسب أقساط شروط الدفع."]),
  I("ACC-DUES-BI-05", "ACC-DUES", ["Unallocated payments", "دفعات غير مخصصة"], "queue", ["Submitted Payment Entries with unallocated amount above zero.", "سندات دفع معتمدة بمبالغ غير مخصصة."], "Payment Entry", ["kpi:pe-unalloc", "run11q:pe-unalloc"], "SAME_BASIS"),
  I("ACC-DUES-BI-06", "ACC-DUES", ["Customers with the largest exposure", "أكبر العملاء تعرضًا"], "ranked_bar", ["Top 10 customers by outstanding of submitted Sales Invoices (company currency).", "أعلى 10 عملاء حسب المتبقي من الفواتير."], "Accounts Receivable", ["pro:/pro/receivables"], "DIFFERENT_BASIS", ["The existing Receivables screen lists every customer's outstanding by age; the ranked top-10 view is defined on the DIGIT Pro server.", "تعرض شاشة الذمم المدينة القائمة المتبقي لكل عميل حسب العمر؛ أما ترتيب أعلى 10 عملاء فمعرّف على خادم ديجيت برو."]),
  I("SEL-SALES-BI-01", "SEL-SALES", ["Open quotations", "العروض المفتوحة"], "kpi", ["Submitted Open / Replied / Partially Ordered quotations whose validity has not passed; value = base grand total.", "عروض معتمدة مفتوحة لم تنته صلاحيتها؛ القيمة = الإجمالي."], "Quotation", ["kpi:q-open"], "DIFFERENT_BASIS",
    ["The existing figure includes quotations past validity and shows them again separately.", "الرقم القائم يشمل العروض المنتهية ويعرضها منفصلة أيضًا."]),
  I("SEL-SALES-BI-02", "SEL-SALES", ["Quotations expiring in 7 days", "العروض قرب انتهاء الصلاحية"], "queue", ["Open quotations with valid till between the end date and 7 days later.", "عروض مفتوحة تنتهي صلاحيتها خلال 7 أيام."], "Quotation", ["kpi:q-exp"], "SAME_BASIS"),
  I("SEL-SALES-BI-03", "SEL-SALES", ["Open sales orders", "الطلبات المفتوحة"], "kpi", ["Submitted Sales Orders To Deliver and Bill / To Deliver / To Bill.", "أوامر بيع مفتوحة للتسليم أو الفوترة."], "Sales Order Analysis", ["kpi:so-deliver"], "DIFFERENT_BASIS",
    ["The existing figure leaves out orders only waiting for billing.", "الرقم القائم لا يشمل الطلبات المنتظرة للفوترة فقط."]),
  I("SEL-SALES-BI-04", "SEL-SALES", ["Sales order value by month", "قيمة الطلبات حسب الشهر"], "bar", ["Sum of base net total of submitted Sales Orders per transaction month.", "مجموع صافي أوامر البيع المعتمدة لكل شهر."], "Sales Order Analysis", ["chart:so-month"], "DIFFERENT_BASIS",
    ["The existing chart sums grand total (with taxes); Pro sums net total.", "الرسم القائم يجمع الإجمالي شاملًا الضريبة؛ برو يجمع الصافي."]),
  I("SEL-SALES-BI-05", "SEL-SALES", ["Sales orders awaiting approval", "طلبات تحتاج اعتماد"], "queue", ["Open Workflow Actions on Sales Order the reader may act on (needs an active Sales Order workflow).", "إجراءات اعتماد مفتوحة على أوامر البيع (تتطلب مسار اعتماد مفعّل)."], "Workflow Action", [], "SERVER_ONLY"),
  I("SEL-SALES-BI-06", "SEL-SALES", ["Quotation to order conversion", "نسبة تحويل العرض إلى طلب"], "funnel", ["Quotation-month cohort; converted = Ordered / Partially Ordered; share of submitted.", "مجموعة شهر العرض؛ المحوّل = مطلوب أو مطلوب جزئيًا؛ من المعتمدة."], "Quotation", ["pro:/pro/quotation-pipeline"], "SERVER_ONLY"),
];
export const insightsOf = (ws: string) => INSIGHTS.filter((i) => i.ws === ws);

/* ------------------------------------------------------------------ server contracts (NOT_CONNECTED in this preview) ------------------------------------------------------------------ */
/** Typed shapes of the Pro methods the slice names (copied from digit_pro-main/digit_pro/ops_models.py and insights.py). */
export interface QuoteFunnel { company: string; currency: string; period: { from: string; to: string }; stages: { status: string; count: number; value: number }[]; cohorts: { month: string; submitted: number; ordered: number; conversion_pct: number | null }[]; formula: string }
export interface LineAvailability { doctype: string; name: string; rows: { idx: number; item_code: string; warehouse: string | null; line_qty: number; open_qty?: number; available_for_line?: number; shortage?: number; state: "ok" | "denied" | "no_warehouse" | "no_bin"; supply?: { state?: string; earliest_date?: string; after_promised_date?: boolean } }[]; source: string }
export interface CreditHoldQueue { company: string; currency: string; orders_on_hold: { name: string; customer: string; base_grand_total: number; transaction_date: string }[]; customers_over_limit: { customer: string; credit_limit: number; exposure: number; excess: number; bypass: boolean }[]; state: "ok" | "denied" | "NOT_CONFIGURED" }
export type ServerResult<T> = { state: "NOT_CONNECTED"; method: string } | { state: "ok"; data: T };
/** The preview has no Frappe server: every Pro method resolves NOT_CONNECTED (never a fake success). */
export function proServer<T>(method: string): ServerResult<T> { return { state: "NOT_CONNECTED", method }; }
