/**
 * ADM-01 Construction settings — the editable settings, their validation, where each one is used, the setting gaps
 * the research names but no verified metadata supports, and the change history (Framework `Version` records).
 *
 * Only fields that exist on `Digit Construction Settings` and are read by the app are editable; every other setting
 * the contract proposes is listed as a gap ("Not provided — needs target metadata or an owner decision"), never as a
 * guessed field. Saving re-checks the record revision first (stale edit → conflict, nothing written), validates, and
 * writes through the document API so permissions and the validation hook apply; the read-back is the stored record.
 */
import { adapter, DocValidationError, type Doc } from "@/lib/adapter";
import { cachedMeta } from "@/lib/catalog";
import { updateDocument } from "@/lib/documentApi";
import { currentUser, hasPerm } from "@/lib/session";
import { parseJSON } from "@/lib/insights";

export const SETTINGS = "Digit Construction Settings";
export type Family = "project" | "finance" | "access" | "workflows" | "reports" | "print" | "notifications";
export const FAMILIES: { key: Family; en: string; ar: string }[] = [
  { key: "project", en: "Project defaults", ar: "افتراضيات المشاريع" }, { key: "finance", en: "Finance references", ar: "المراجع المالية" },
  { key: "access", en: "Access & policies", ar: "الصلاحيات والسياسات" }, { key: "workflows", en: "Workflows", ar: "مسارات العمل" },
  { key: "reports", en: "Reports & freshness", ar: "التقارير والحداثة" }, { key: "print", en: "Templates & print", ar: "القوالب والطباعة" },
  { key: "notifications", en: "Notifications & integration", ar: "التنبيهات والتكامل" },
];
export interface SettingDef { key: string; family: Family; en: string; ar: string; kind: "company" | "pct" | "days" | "grace" | "months" | "amount" | "hours" | "choice"; options?: { value: string; en: string; ar: string }[]; fallback: string; usedBy: { en: string; ar: string; to: string }[] }
/** Editable settings: each is read by the screens listed in usedBy (verified call sites), with the fallback the code applies when unset. */
export const SETTING_DEFS: SettingDef[] = [
  { key: "default_company", family: "project", en: "Default company", ar: "الشركة الافتراضية", kind: "company", fallback: "", usedBy: [{ en: "Management home — company filter and new projects", ar: "الصفحة الرئيسية للإدارة — مرشح الشركة والمشاريع الجديدة", to: "" }] },
  { key: "stale_forecast_days", family: "project", en: "Stale forecast after (days)", ar: "تقادم التوقع بعد (أيام)", kind: "days", fallback: "45", usedBy: [{ en: "Budget & cost queue — projects with a stale forecast", ar: "قائمة الموازنة والتكلفة — مشاريع بتوقع متقادم", to: "dept/cst" }] },
  { key: "rate_expiry_warning_days", family: "finance", en: "Rate expiry warning (days)", ar: "تنبيه انتهاء الأسعار (أيام)", kind: "days", fallback: "30", usedBy: [{ en: "Rate Validity report", ar: "تقرير صلاحية الأسعار", to: "reports/Rate%20Validity" }] },
  { key: "overrun_alert_pct", family: "finance", en: "Overrun alert (%)", ar: "تنبيه التجاوز (%)", kind: "pct", fallback: "0", usedBy: [{ en: "Project risk rating (portfolio status)", ar: "تصنيف مخاطر المشاريع (حالة المحفظة)", to: "reports/Construction%20Portfolio%20Status" }] },
  // OLD base (DOC-078) owner values: blank = warn / report only, never a block and never an invented default
  { key: "budget_block_pct", family: "finance", en: "Block commitments above budget by (%)", ar: "منع الالتزام فوق الموازنة بنسبة (%)", kind: "pct", fallback: "", usedBy: [{ en: "Budget check on new commitments (blank = warning only)", ar: "فحص الموازنة على الالتزامات الجديدة (فارغ = تحذير فقط)", to: "dept/cst" }] },
  // owner ruling (replaces the fixed 3 months / 5 %): the warning-only grace period is a Finance value too; empty = no grace (the limit, when set, applies at once)
  { key: "budget_grace_months", family: "finance", en: "Budget warning-only grace period (months)", ar: "مهلة التحذير فقط للموازنة (أشهر)", kind: "months", fallback: "", usedBy: [{ en: "Budget check on new commitments (within the grace period = warning only)", ar: "فحص الموازنة على الالتزامات الجديدة (خلال المهلة = تحذير فقط)", to: "dept/cst" }] },
  // DEC-099 / DEC-151 (owner ruling): budget approval value cap; empty = the Director approves every budget
  { key: "budget_pm_approval_cap", family: "finance", en: "Project Manager budget approval cap (amount)", ar: "سقف اعتماد مدير المشروع للموازنة (مبلغ)", kind: "amount", fallback: "", usedBy: [{ en: "Budget approval (blank = Director approves all budgets)", ar: "اعتماد الموازنة (فارغ = المدير يعتمد كل الموازنات)", to: "dept/cst" }] },
  { key: "budget_warn_pct", family: "finance", en: "Budget use alert (%)", ar: "نسبة تنبيه استهلاك الموازنة (%)", kind: "pct", fallback: "80", usedBy: [{ en: "Budget sheet use lines, ranked cost codes and budget bars turn amber (blank = 80 %)", ar: "خطوط الاستهلاك في ورقة الموازنة ورموز التكلفة وأشرطة الموازنة تصبح كهرمانية (فارغ = 80%)", to: "dept/cst" }] },
  { key: "budget_over_pct", family: "finance", en: "Budget use limit (%)", ar: "حد استهلاك الموازنة (%)", kind: "pct", fallback: "100", usedBy: [{ en: "Past this share a line turns red (blank = 100 %)", ar: "بعد هذه النسبة يصبح البند أحمر (فارغ = 100%)", to: "dept/cst" }] },
  { key: "mr_over_order_pct", family: "finance", en: "Allowed over-order on material requests (%)", ar: "الزيادة المسموحة على طلبات المواد (%)", kind: "pct", fallback: "", usedBy: [{ en: "Purchase order approval against the material request (blank = warning only)", ar: "اعتماد أمر الشراء مقابل طلب المواد (فارغ = تحذير فقط)", to: "dept/proc" }] },
  { key: "match_qty_tol_pct", family: "finance", en: "Matching quantity tolerance (%) — Finance value, policy P5", ar: "حد سماح الكمية في المطابقة (%) — قيمة المالية، السياسة P5", kind: "pct", fallback: "", usedBy: [{ en: "Invoice matching (blank = report only)", ar: "مطابقة الفواتير (فارغ = تقرير فقط)", to: "proc/matching" }] },
  { key: "match_price_tol_pct", family: "finance", en: "Matching price tolerance (%) — Finance value, policy P5", ar: "حد سماح السعر في المطابقة (%) — قيمة المالية، السياسة P5", kind: "pct", fallback: "", usedBy: [{ en: "Invoice matching (blank = report only)", ar: "مطابقة الفواتير (فارغ = تقرير فقط)", to: "proc/matching" }] },
  { key: "match_abs_cap", family: "finance", en: "Matching variance cap (amount) — Finance value, policy P5", ar: "سقف مبلغ فرق المطابقة — قيمة المالية، السياسة P5", kind: "amount", fallback: "", usedBy: [{ en: "Invoice matching (blank = no amount cap)", ar: "مطابقة الفواتير (فارغ = بلا سقف للمبلغ)", to: "proc/matching" }] },
  // department 03 estimating thresholds (owner rulings): DEC-035 default 60 %; blank margin floor / BOQ flag = not applied
  { key: "gng_threshold_pct", family: "project", en: "Go / No-Go threshold (%)", ar: "حد قرار التقدم (%)", kind: "pct", fallback: "60", usedBy: [{ en: "Tender Go decision (below = justification required)", ar: "قرار التقدم في العطاء (أقل منه = مبرر مطلوب)", to: "" }] },
  { key: "min_margin_pct", family: "project", en: "Minimum estimate margin (%)", ar: "الحد الأدنى لهامش التقدير (%)", kind: "pct", fallback: "", usedBy: [{ en: "Estimate approval (blank = no floor)", ar: "اعتماد التقدير (فارغ = بلا حد أدنى)", to: "" }] },
  { key: "boq_flag_pct", family: "project", en: "BOQ difference flag (%)", ar: "حد تمييز فرق جدول الكميات (%)", kind: "pct", fallback: "", usedBy: [{ en: "BOQ against estimate (blank = plain differences)", ar: "جدول الكميات مقابل التقدير (فارغ = فروق فقط)", to: "" }] },
  { key: "boq_flag_amount", family: "project", en: "BOQ difference flag (amount)", ar: "حد تمييز فرق جدول الكميات (مبلغ)", kind: "amount", fallback: "", usedBy: [{ en: "BOQ against estimate (lower of percent and amount)", ar: "جدول الكميات مقابل التقدير (الأقل من النسبة والمبلغ)", to: "" }] },
  // department 06: DEC-152 one company-wide delivery grace period
  { key: "delivery_grace_days", family: "project", en: "Delivery grace period (days)", ar: "مهلة السماح في التوريد (أيام)", kind: "grace", fallback: "0", usedBy: [{ en: "Supplier on-time delivery (due date + grace)", ar: "التوريد في الموعد (تاريخ الاستحقاق + المهلة)", to: "" }] },
  // research questions (owner work list Q*): documented best practice as changeable settings; blank = the stated fallback
  { key: "approval_sla_days", family: "workflows", en: "Approval service level (days)", ar: "مستوى خدمة الاعتماد (أيام)", kind: "days", fallback: "3", usedBy: [{ en: "Decisions & policies — approvals over the service level", ar: "القرارات والسياسات — الاعتمادات المتجاوزة لمستوى الخدمة", to: "management/decisions-policies/overview" }] },
  { key: "slow_moving_days", family: "project", en: "Slow-moving material period (days)", ar: "فترة ركود المواد (أيام)", kind: "days", fallback: "90", usedBy: [{ en: "Receipts & stock — slow-moving materials", ar: "الاستلام والمخزون — المواد الراكدة", to: "procurement/receipts-stock/overview" }] },
  { key: "machine_available_hours", family: "project", en: "Machine available hours per day", ar: "ساعات المعدة المتاحة يوميًا", kind: "hours", fallback: "8", usedBy: [{ en: "Equipment — utilisation", ar: "المعدات — نسبة الاستخدام", to: "resources/equipment/overview" }] },
  // ENT-NEED-18 (owner ruling 2026-11-14): supplier score weights; all blank = equal weights (the plain average)
  { key: "score_weight_on_time", family: "reports", en: "Supplier score weight — on time", ar: "وزن تقييم المورد — التوريد في الموعد", kind: "amount", fallback: "", usedBy: [{ en: "Supplier Scorecard (all blank = equal weights)", ar: "بطاقة أداء الموردين (كلها فارغة = أوزان متساوية)", to: "reports/Supplier%20Scorecard" }] },
  { key: "score_weight_quality", family: "reports", en: "Supplier score weight — quality", ar: "وزن تقييم المورد — الجودة", kind: "amount", fallback: "", usedBy: [{ en: "Supplier Scorecard (all blank = equal weights)", ar: "بطاقة أداء الموردين (كلها فارغة = أوزان متساوية)", to: "reports/Supplier%20Scorecard" }] },
  { key: "score_weight_price", family: "reports", en: "Supplier score weight — price", ar: "وزن تقييم المورد — السعر", kind: "amount", fallback: "", usedBy: [{ en: "Supplier Scorecard (all blank = equal weights)", ar: "بطاقة أداء الموردين (كلها فارغة = أوزان متساوية)", to: "reports/Supplier%20Scorecard" }] },
  { key: "award_saving_basis", family: "project", en: "Award saving basis", ar: "أساس وفر الترسية", kind: "choice", options: [{ value: "Average bid", en: "Average bid", ar: "متوسط العروض" }, { value: "Second lowest bid", en: "Second lowest bid", ar: "ثاني أقل عرض" }, { value: "Budget", en: "Package budget", ar: "موازنة الحزمة" }], fallback: "Average bid", usedBy: [{ en: "Bid packages — award saving", ar: "حزم العروض — وفر الترسية", to: "estimating-tenders/bid-packages/overview" }] },
];
/**
 * Settings fields that came with the supplied source snapshot (R19 merge) and are read only by the Frappe server
 * (Python rules), not by any screen here: shown as "needs the Frappe server", never edited in the preview. The
 * source's hidden `…_is_set` flags (a number is known; blank is not zero) are server bookkeeping and are not listed.
 */
export const SETTING_SERVER: { key: string; family: Family; en: string; ar: string; why_en: string; why_ar: string }[] = [
  { key: "retention_payable_account", family: "finance", en: "Subcontract retention payable account", ar: "حساب محتجزات الباطن المستحقة", why_en: "Used by the server's subcontract retention posting; this preview never posts ledger entries.", why_ar: "يستخدمه الخادم عند ترحيل محتجزات الباطن؛ هذه المعاينة لا ترحّل قيودًا." },
];
export const isServerFlag = (fieldname: string | undefined) => !!fieldname && fieldname.endsWith("_is_set");
/** Settings the research proposes that have no verified target metadata here (shown, never editable). */
export const SETTING_GAPS: { key: string; family: Family; en: string; ar: string; why_en: string; why_ar: string }[] = [
  { key: "project_naming", family: "project", en: "Project naming", ar: "تسمية المشروع", why_en: "Native Project naming is the Project DocType's own series; a construction override needs target metadata.", why_ar: "تسمية المشروع الأصلية هي سلسلة نوع المستند نفسه؛ أي تجاوز يحتاج بيانات وصفية مستهدفة." },
  { key: "multi_company_enabled", family: "project", en: "Enable company awareness", ar: "تفعيل وعي الشركات", why_en: "Company scope already follows each record's company and User Permissions; a switch needs a verified effect.", why_ar: "نطاق الشركة يتبع شركة كل سجل وصلاحيات المستخدم؛ المفتاح يحتاج أثرًا متحققًا منه." },
  { key: "tab_defaults", family: "project", en: "Project page tab defaults", ar: "إعدادات تبويبات المشروع", why_en: "Project 360 keeps the eight source tab groups; per-company tab visibility needs an owner decision.", why_ar: "يحافظ المشروع 360 على مجموعات التبويب الثماني؛ إخفاء التبويبات حسب الشركة يحتاج قرار المالك." },
  { key: "default_subcontractor_expense_account", family: "finance", en: "Default subcontractor expense account", ar: "حساب مصروف الباطن الافتراضي", why_en: "Accounts come from the native item / company defaults on the Purchase Invoice; an app default needs company account eligibility rules.", why_ar: "الحسابات تأتي من افتراضيات الصنف والشركة في فاتورة المشتريات؛ أي افتراضي للتطبيق يحتاج قواعد أهلية الحساب." },
  { key: "default_petty_cash_account", family: "finance", en: "Default petty cash account", ar: "حساب العهدة الافتراضي", why_en: "Petty cash funds carry their own account; site expense posting is blocked by policy P7.", why_ar: "صناديق العهدة تحمل حسابها؛ وترحيل مصروفات الموقع موقوف بالسياسة P7." },
  { key: "rate_master_update_threshold", family: "finance", en: "Rate master update threshold", ar: "حد تحديث مرجع السعر", why_en: "No rule says when a rate change must update the master; range and owner unknown.", why_ar: "لا توجد قاعدة تحدد متى يحدّث تغيّر السعر المرجع؛ النطاق والمالك غير معروفين." },
  { key: "workflow_policy_reference", family: "workflows", en: "Workflow policy reference", ar: "مرجع سياسة الاعتماد", why_en: "Approval rules are the exported Workflow fixtures; a separate policy reference needs verified workflow metadata on the target site.", why_ar: "قواعد الاعتماد هي مسارات العمل المصدّرة؛ أي مرجع منفصل يحتاج بيانات مسار عمل متحققًا منها." },
  { key: "report_freshness_policy", family: "reports", en: "Report freshness policy", ar: "سياسة حداثة التقرير", why_en: "Reports compute live at open; freshness thresholds and their owner are not defined.", why_ar: "تُحسب التقارير مباشرة عند الفتح؛ حدود الحداثة ومالكها غير محددة." },
  { key: "report_scope_policy", family: "reports", en: "Report scope policy", ar: "سياسة نطاق التقارير", why_en: "Report scope is the user's permissions plus construction-project scope; a policy may never bypass them.", why_ar: "نطاق التقارير هو صلاحيات المستخدم مع نطاق مشاريع المقاولات؛ ولا يجوز لأي سياسة تجاوزها." },
  { key: "cost_code_mapping_reference", family: "reports", en: "Cost-code mapping reference", ar: "مرجع ربط رموز التكلفة", why_en: "A cost-code master and its versioning are an open scope decision.", why_ar: "سجل رموز التكلفة وإصداراته قرار نطاق مفتوح." },
  { key: "print_template_reference", family: "print", en: "Print template reference", ar: "مرجع قالب الطباعة", why_en: "Templates are versioned by fingerprint below; choosing a mandatory template per company needs an owner decision.", why_ar: "القوالب مؤرخة ببصمتها أدناه؛ فرض قالب لكل شركة يحتاج قرار المالك." },
  { key: "notification_reference", family: "notifications", en: "Notification reference", ar: "مرجع التنبيهات", why_en: "Channel, recipients beyond the declared roles, and retention are not defined.", why_ar: "القناة والمستلمون خارج الأدوار المعلنة ومدة الاحتفاظ غير محددة." },
];

export const settingsDoc = (): Doc | undefined => adapter.get(SETTINGS, SETTINGS);
export const effective = (d: Doc | undefined, s: SettingDef): string => { const v = d?.[s.key]; return v === undefined || v === null || v === "" ? s.fallback : String(v); };

/** Field-level validation (also the hook for native form edits). */
export function settingsErrors(values: Record<string, unknown>): Record<string, string> {
  const e: Record<string, string> = {};
  for (const s of SETTING_DEFS) {
    if (!(s.key in values)) continue;
    const raw = values[s.key]; const v = raw === null || raw === undefined ? "" : String(raw).trim();
    if (s.kind === "company") { if (v && !adapter.get("Company", v)) e[s.key] = `Company ${v} does not exist`; continue; }
    if (s.kind === "choice") { if (v && !(s.options ?? []).some((o) => o.value === v)) e[s.key] = `${s.en} must be one of ${(s.options ?? []).map((o) => o.value).join(", ")}`; continue; }
    if (v === "") continue;
    const n = Number(v);
    if (!Number.isFinite(n)) { e[s.key] = `${s.en} must be a number`; continue; }
    if (s.kind === "pct" && (n < 0 || n > 100)) e[s.key] = `${s.en} must be between 0 and 100`;
    if (s.kind === "amount" && n < 0) e[s.key] = `${s.en} must not be negative`;
    if (s.kind === "days" && (!Number.isInteger(n) || n < 1 || n > 365)) e[s.key] = `${s.en} must be a whole number of days from 1 to 365`;
    if (s.kind === "grace" && (!Number.isInteger(n) || n < 0 || n > 365)) e[s.key] = `${s.en} must be a whole number of days from 0 to 365`;
    if (s.kind === "months" && (!Number.isInteger(n) || n < 0 || n > 120)) e[s.key] = `${s.en} must be a whole number of months from 0 to 120`;
    if (s.kind === "hours" && (n <= 0 || n > 24)) e[s.key] = `${s.en} must be more than 0 and at most 24`;
  }
  return e;
}
export interface Change { key: string; before: string; after: string }
export function settingsDiff(before: Doc | undefined, draft: Record<string, string>): Change[] {
  return SETTING_DEFS.filter((s) => s.key in draft).map((s) => ({ key: s.key, before: String(before?.[s.key] ?? ""), after: String(draft[s.key] ?? "").trim() })).filter((c) => c.before !== c.after);
}
const normalise = (s: SettingDef, v: string): unknown => (v === "" ? (s.kind === "company" ? "" : null) : s.kind === "company" ? v : Number(v));
export interface SaveResult { ok: boolean; errors: string[]; fieldErrors?: Record<string, string>; conflict?: boolean; changes?: Change[] }
/** Save after review: revision check (stale → conflict), permission, validation, then one write through the document API. */
export function saveSettings(draft: Record<string, string>, baseModified: string, user = currentUser()): SaveResult {
  const meta = cachedMeta(SETTINGS); if (!meta) return { ok: false, errors: [`${SETTINGS}: metadata unavailable`] };
  const cur = settingsDoc();
  if (String(cur?.["modified"] ?? "") !== baseModified) return { ok: false, conflict: true, errors: ["The settings were changed by someone else after you started editing. Reload them and apply your change again."] };
  const changes = settingsDiff(cur, draft);
  if (!changes.length) return { ok: true, errors: [], changes };
  const fieldErrors = settingsErrors(Object.fromEntries(changes.map((c) => [c.key, c.after])));
  if (Object.keys(fieldErrors).length) return { ok: false, errors: Object.values(fieldErrors), fieldErrors };
  const patch = Object.fromEntries(changes.map((c) => [c.key, normalise(SETTING_DEFS.find((s) => s.key === c.key)!, c.after)]));
  if (!cur) {
    if (!hasPerm(meta, "create", undefined, user) || !hasPerm(meta, "write", undefined, user)) return { ok: false, errors: [`No permission to write ${SETTINGS}`] };
    // create the empty record first, then apply the change as an update, so the history shows who set which value
    try { adapter.insertDoc(SETTINGS, { name: SETTINGS, owner: user }); } catch (e) { if (e instanceof DocValidationError) return { ok: false, errors: e.errors }; throw e; }
  }
  const errs = updateDocument(meta, SETTINGS, patch, user);
  return errs.length ? { ok: false, errors: errs } : { ok: true, errors: [], changes };
}

export interface HistoryEntry { name: string; at: string; by: string; created: boolean; changes: [string, unknown, unknown][] }
/** Change log of the settings record (Framework Version shape: data.changed = [field, old, new]); actor from modified_by. */
export function settingsHistory(): HistoryEntry[] {
  return adapter.list("Version").filter((v) => v["ref_doctype"] === SETTINGS && v["docname"] === SETTINGS).map((v) => {
    const data = parseJSON<{ changed?: [string, unknown, unknown][]; created?: boolean }>(v["data"], {});
    const ch = data.changed ?? [];
    const by = ch.find((c) => c[0] === "modified_by")?.[2];
    return { name: v.name, at: String(v["creation"] ?? ""), by: String(by ?? ""), created: !!data.created, changes: ch.filter((c) => c[0] !== "modified_by" && c[0] !== "modified") };
  }).filter((h) => h.created || h.changes.length).sort((a, b) => b.at.localeCompare(a.at) || b.name.localeCompare(a.name));
}
