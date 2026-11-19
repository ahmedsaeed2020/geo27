/**
 * Arabic / English display layer.
 * Base: upstream ar.po of frappe, erpnext, hrms, crm, insights (public/catalog/i18n/ar.json).
 * Overlay: Digit glossary (./glossary). Display-only — a DOM text translator swaps rendered
 * text nodes and a few attributes; stored data, fieldnames, option values and routes never change.
 * Elements (or ancestors) with [data-no-i18n] — record content, IDs, codes — are skipped.
 */
import { useSyncExternalStore } from "react";
import { GLOSSARY, REQUEST_DOCTYPES, SUBMIT_POSTING, SUBMIT_REQUEST } from "./glossary";
import { DIGIT, PREFIXES } from "./digit";
import { fieldTranslation, DIGIT_FIELDS_SOURCE } from "./fields";

export type Lang = "ar" | "en";
const KEY = "digit-virtual-core:lang";
const subs = new Set<() => void>();
const read = (): Lang => (typeof window === "undefined" ? "ar" : localStorage.getItem(KEY) === "en" ? "en" : "ar");

let dict: Record<string, string> | null = null;
let lower: Record<string, string> = {};
let loading: Promise<void> | null = null;
export function loadDict() {
  if (dict) return Promise.resolve();
  return (loading ??= Promise.all([fetch("/catalog/i18n/ar.json").then((r) => r.json()), fetch("/i18n/digit.json").then((r) => r.json()).catch(() => ({ strings: {} }))]).then(([d, g]: [Record<string, string>, { strings: Record<string, { ar: string }> }]) => { const cat: Record<string, string> = {}; for (const [k, v] of Object.entries(g.strings)) cat[k] = v.ar; const merged = { ...decodeUpstream(d), ...cat, ...DIGIT, ...GLOSSARY }; dict = merged; lower = {}; for (const [k, v] of Object.entries(merged)) lower[k.toLowerCase()] ??= v; }));
}

const ENTITIES: Record<string, string> = { amp: "&", quot: "\"", lt: "<", gt: ">", apos: "'", "#39": "'", nbsp: "\u00a0", copy: "©" };
/**
 * Upstream ar.po strings are partly HTML-escaped ("P &amp; L", "&quot;المستلمين&quot;"). The display layer writes text, not
 * HTML, so a value is unescaped when its English key has no entity of its own (keys that are themselves escaped HTML keep
 * their value untouched). The frozen catalog file is unchanged.
 */
export function decodeUpstream(d: Record<string, string>): Record<string, string> {
  const re = /&(amp|quot|lt|gt|apos|#39|nbsp|copy);/g;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(d)) out[k] = typeof v === "string" && v.includes("&") && !/&(amp|quot|lt|gt|apos|#39|nbsp|copy);/.test(k) ? v.replace(re, (_, e: string) => ENTITIES[e] ?? _) : v;
  return out;
}

/** SSR-safe translate: static dictionaries only (identical on server and client), so Arabic is in the first paint without hydration mismatch. */
export function useTs(): (s: string) => string {
  const lang = useLang();
  return (s: string) => (lang === "ar" ? GLOSSARY[s] ?? DIGIT[s] ?? s : s);
}
export function useLang(): Lang {
  return useSyncExternalStore((l) => { subs.add(l); return () => subs.delete(l); }, read, () => "ar");
}
const DKEY = "digit-virtual-core:digits";
export const arabicDigits = () => typeof window !== "undefined" && localStorage.getItem(DKEY) === "arabic";
export function setArabicDigits(on: boolean) { localStorage.setItem(DKEY, on ? "arabic" : "western"); subs.forEach((f) => f()); restoreNode(document.body); void applyLang(); }
const toIndic = (x: string) => x.replace(/[0-9]/g, (d) => "٠١٢٣٤٥٦٧٨٩"[Number(d)] ?? d);
export function setLang(l: Lang) { localStorage.setItem(KEY, l); subs.forEach((f) => f()); void applyLang(); }

/** Plain translate (for code paths that need it). Falls back to source text. */
export function t(s: string, doctype?: string): string {
  if (read() !== "ar") return s;
  const field = fieldTranslation(s);
  if (field !== undefined) return field;
  if (s in SUBMIT_POSTING) return (doctype && REQUEST_DOCTYPES.has(doctype) ? SUBMIT_REQUEST : SUBMIT_POSTING)[s as "Submit"];
  return pluginDict[s] ?? dict?.[s] ?? GLOSSARY[s] ?? s;
}

/** Label translation for attributes the DOM layer skips (inputs marked data-no-i18n): dictionary, composed labels, then label patterns such as "Debit (SAR)". */
export function tLabel(s: string): string {
  if (read() !== "ar") return s;
  return t(s) !== s ? t(s) : compose(s) ?? special(s) ?? s;
}
const trDt = (s: string) => translateTo(s, "ar");
/** "Sales Invoice ACC-SINV-1" → "<Arabic DocType> ACC-SINV-1": the longest leading word run that is a known label is the DocType (record names may contain spaces). */
function dtName(s: string): string {
  if (look(s)) return trDt(s);
  const w = s.split(" ");
  for (let i = Math.min(w.length - 1, 5); i >= 1; i--) { const dt = w.slice(0, i).join(" "); if (look(dt)) return `${trDt(dt)} ${w.slice(i).join(" ")}`; }
  return s;
}
/** Translate for an explicit language (print language), independent of the UI language. */
export function translateTo(s: string, lang: Lang): string {
  if (lang !== "ar") return s;
  return pluginDict[s] ?? fieldTranslation(s) ?? dict?.[s] ?? GLOSSARY[s] ?? lower[s.toLowerCase()] ?? s;
}

const orig = new WeakMap<Node, string>();
const origAttr = new WeakMap<Element, Record<string, string>>();
const ATTRS = ["placeholder", "title", "aria-label"];
const SKIP = new Set(["SCRIPT", "STYLE", "CODE", "PRE"]);
const noI18n = (el: Element | null) => !!el?.closest("[data-no-i18n],.font-mono,[contenteditable]");
const skipText = (el: Element) => SKIP.has(el.tagName) || el.tagName === "TEXTAREA" || (el.tagName === "OPTION" && (!el.hasAttribute("value") || !!el.closest("datalist")));

/** Plugin SDK translations (src/plugins): additive overlay, removed when a plugin is disabled. */
let pluginDict: Record<string, string> = {};
export function setPluginTranslations(m: Record<string, string>) { pluginDict = m; }
function look(s: string): string | undefined {
  return pluginDict[s] ?? fieldTranslation(s) ?? dict?.[s] ?? lower[s.toLowerCase()] ?? lower[s.replace(/-/g, " ").toLowerCase()];
}
function compose(s: string, depth = 0): string | undefined {
  const v = look(s);
  if (v || depth > 2) return v;
  for (const sep of [" › ", " · ", ": ", ":"]) {
    const i = s.indexOf(sep);
    if (i > 0) { const a = s.slice(0, i), b = s.slice(i + sep.length); const ta = compose(a, depth + 1) ?? (/^[a-z]+$/.test(a) || /[A-Z]{2,}/.test(a) ? a : undefined); const tb = compose(b, depth + 1); if (ta && tb) return ta + sep + tb; }
  }
  // a company-suffixed record name ("Goods In Transit - DDT"): the name part is translated, the company abbreviation kept
  const co = s.match(/^(.+) - ([A-Z0-9]{2,6})$/); if (co) { const h = compose(co[1]!, depth + 1); if (h) return `${h} - ${co[2]}`; }
  for (const [p, ar] of PREFIXES) if (s.startsWith(p)) { const rest = s.slice(p.length); const tr = compose(rest, depth + 1) ?? ((rest.match(/\b[a-z]{2,}\b/g)?.length ?? 0) >= 2 ? undefined : rest); if (tr) return ar + tr; }
  return undefined;
}
const UNITS: Record<string, [string, string, string, string]> = {
  min: ["دقيقة", "دقيقتين", "دقائق", "دقيقة"], minute: ["دقيقة", "دقيقتين", "دقائق", "دقيقة"], hour: ["ساعة", "ساعتين", "ساعات", "ساعة"],
  day: ["يوم", "يومين", "أيام", "يومًا"], week: ["أسبوع", "أسبوعين", "أسابيع", "أسبوعًا"], month: ["شهر", "شهرين", "أشهر", "شهرًا"], year: ["سنة", "سنتين", "سنوات", "سنة"],
};
/** Arabic plural rules: 1 → singular, 2 → dual, 3–10 → plural, 11+ → singular accusative. */
export function relTimeAr(n: number, unit: string) {
  const u = UNITS[unit.replace(/s$/, "")]; if (!u) return null;
  if (n === 1) return `منذ ${u[0]}`; if (n === 2) return `منذ ${u[1]}`;
  return `منذ ${n} ${n >= 3 && n <= 10 ? u[2] : u[3]}`;
}
export function fmtDateAr(iso: string) { const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/); if (!m) return iso; let out = `${m[3]}/${m[2]}/${m[1]}`; if (m[4]) { const h = Number(m[4]); out += ` ${((h + 11) % 12) + 1}:${m[5]} ${h < 12 ? "ص" : "م"}`; } return out; }
function special(s: string): string | undefined {
  const r = s.match(/^(\d+) (min|mins|minute|minutes|hour|hours|day|days|week|weeks|month|months|year|years) ago$/);
  if (r) return relTimeAr(Number(r[1]), r[2]!) ?? undefined;
  if (/^\d{4}-\d{2}-\d{2}( \d{2}:\d{2}(:\d{2})?)?$/.test(s)) return fmtDateAr(s);
  // report labels: _("Debit ({0})").format(currency) and quoted total rows ('Opening', 'Total', 'Closing (Opening + Total)')
  { const cc = s.match(/^(.+) \(([A-Z]{3})\)$/); if (cc) { const b = compose(cc[1]!); if (b) return `${b} (${cc[2] === "SAR" ? "\u20C1" : cc[2]})`; } }
  { const q = s.match(/^'(.+)'$/); if (q) { const b = look(q[1]!) ?? compose(q[1]!); if (b) return `'${b}'`; } }
  { const et = s.match(/^Execution Time: ([\d.]+) sec$/); if (et) return `وقت التنفيذ: ${et[1]} ثانية`; }
  { const ab = s.match(/^(\d+)-Above$/); if (ab) return `${ab[1]} فأكثر`; } // accounts_receivable.py aging range label
  { const mr = s.match(/^(\d+) more not shown$/); if (mr) return `${mr[1]} أخرى غير معروضة`; }
  // budget.py validate_expense_against_budget message
  const b = s.match(/^(Annual|Accumulated Monthly) Budget for Account (.+) against (Cost Center|Project) (.+) is ([\d,.]+)\. It will exceed by ([\d,.]+)$/);
  if (b) return `الميزانية ${b[1] === "Annual" ? "السنوية" : "الشهرية المتراكمة"} للحساب ${b[2]} مقابل ${b[3] === "Project" ? "المشروع" : "مركز التكلفة"} ${b[4]} هي ${b[5]}. سيتم تجاوزها بمقدار ${b[6]}`;
  // general_ledger.py check_freezing_date / accounting_period.py / validate_against_pcv
  const fz = s.match(/^You are not authorized to add or update entries before (.+)$/); if (fz) return `غير مصرح لك بإضافة أو تعديل قيود قبل ${fz[1]}`;
  const ap = s.match(/^You cannot create or cancel any accounting entries with in the closed Accounting Period (.+)$/); if (ap) return `لا يمكن إنشاء أو إلغاء قيود محاسبية داخل الفترة المحاسبية المقفلة ${ap[1]}`;
  if (s === "Opening Entry can not be created after Period Closing Voucher is created.") return "لا يمكن إنشاء قيد افتتاحي بعد إنشاء قيد إقفال الفترة.";
  // selling.ts (status_updater / customer.py / sales_order.py / document.py back links)
  const ol = s.match(/^This document is over limit by ([\d.,]+) for item (.+)\. Are you making another (.+) against the same (.+) (\S+)\? \((\w+) allowance ([\d.]+)%\)$/);
  if (ol) return `هذا المستند يتجاوز الحد بمقدار ${ol[1]} للصنف ${ol[2]}. هل تنشئ ${trDt(ol[3]!)} آخر مقابل ${trDt(ol[4]!)} ${ol[5]} نفسه؟ (نسبة السماح ${ol[7]}%)`;
  const cl = s.match(/^Credit limit has been crossed for customer (.+) \(([\d.,]+)\/([\d.,]+)\)$/); if (cl) return `تم تجاوز حد الائتمان للعميل ${cl[1]} (${cl[2]}/${cl[3]})`;
  const vq = s.match(/^Validity period of this quotation (.+) has ended\.$/); if (vq) return `انتهت فترة صلاحية عرض السعر ${vq[1]}.`;
  const zq = s.match(/^Row #(\d+): Quantity for Item (.+) cannot be zero\.$/); if (zq) return `الصف #${zq[1]}: لا يمكن أن تكون كمية الصنف ${zq[2]} صفرًا.`;
  const sh = s.match(/^Supplier (.+) is blocked so this transaction cannot proceed$/); if (sh) return `المورد ${sh[1]} موقوف، لذا لا يمكن متابعة هذه المعاملة`;
  const sp = s.match(/^Purchase Orders are not allowed for (.+) due to a scorecard standing of (.+)\.$/); if (sp) return `أوامر الشراء غير مسموحة للمورد ${sp[1]} بسبب تقييمه ${sp[2]}.`;
  const su = s.match(/^Supplier Invoice No exists in Purchase Invoice (.+)$/); if (su) return `رقم فاتورة المورد موجود في فاتورة الشراء ${su[1]}`;
  const rq = s.match(/^Purchase (Order|Receipt) Required for item (.+)$/); if (rq) return `${rq[1] === "Order" ? "أمر الشراء" : "إيصال الاستلام"} مطلوب للصنف ${rq[2]}`;
  { const R: [RegExp, (m: RegExpMatchArray) => string][] = [
    [/^Row #(\d+): Serial No is mandatory for Item (.+)$/, (m) => `الصف #${m[1]}: الرقم التسلسلي إلزامي للصنف ${m[2]}`],
    [/^Row #(\d+): ([\d.]+) Serial Numbers required for Item (.+)\. You have provided (\d+)\.$/, (m) => `الصف #${m[1]}: يلزم ${m[2]} رقمًا تسلسليًا للصنف ${m[3]}. أدخلت ${m[4]}.`],
    [/^Serial No (.+) is entered more than once$/, (m) => `الرقم التسلسلي ${m[1]} مُدخل أكثر من مرة`],
    [/^Serial No (.+) does not belong to Item (.+)$/, (m) => `الرقم التسلسلي ${m[1]} لا ينتمي إلى الصنف ${m[2]}`],
    [/^Serial No (.+) does not belong to Warehouse (.+)$/, (m) => `الرقم التسلسلي ${m[1]} لا ينتمي إلى المستودع ${m[2]}`],
    [/^Serial No (.+) already exists$/, (m) => `الرقم التسلسلي ${m[1]} موجود بالفعل`],
    [/^Row #(\d+): Item (.+) is not setup for Serial Nos$/, (m) => `الصف #${m[1]}: الصنف ${m[2]} غير مُعدّ للأرقام التسلسلية`],
    [/^Row #(\d+): Batch No is mandatory for Item (.+)$/, (m) => `الصف #${m[1]}: رقم الدفعة إلزامي للصنف ${m[2]}`],
    [/^Batch (.+) not found$/, (m) => `الدفعة ${m[1]} غير موجودة`],
    [/^Batch (.+) does not belong to Item (.+)$/, (m) => `الدفعة ${m[1]} لا تنتمي إلى الصنف ${m[2]}`],
    [/^Batch (.+) of Item (.+) is disabled\.$/, (m) => `الدفعة ${m[1]} للصنف ${m[2]} معطّلة.`],
    [/^Batch (.+) of Item (.+) has expired\.$/, (m) => `انتهت صلاحية الدفعة ${m[1]} للصنف ${m[2]}.`],
    [/^Row #(\d+): Item (.+) is not setup for Batch No$/, (m) => `الصف #${m[1]}: الصنف ${m[2]} غير مُعدّ لأرقام الدفعات`],
    [/^The batch (.+) has only ([\d.]+) qty in warehouse (.+)\. Please select another batch or reduce qty\.$/, (m) => `الدفعة ${m[1]} لديها ${m[2]} فقط في المستودع ${m[3]}. اختر دفعة أخرى أو قلّل الكمية.`],
    [/^Serial No (.+) has already been transacted, cannot cancel (.+)$/, (m) => `الرقم التسلسلي ${m[1]} تم التعامل عليه بالفعل، لا يمكن إلغاء ${m[2]}`],
  ]; for (const [re, f] of R) { const m = s.match(re); if (m) return f(m); } }
  const ns = s.match(/^([\d.]+) units of Item (.+) needed in Warehouse (.+) on (\S+) to complete this transaction\.$/); if (ns) return `يلزم ${ns[1]} وحدة من الصنف ${ns[2]} في المستودع ${ns[3]} بتاريخ ${ns[4]} لإتمام هذه المعاملة.`;
  const sw = s.match(/^Row #(\d+): (Source|Target) warehouse is mandatory for item (.+)$/); if (sw) return `الصف #${sw[1]}: ${sw[2] === "Source" ? "مستودع المصدر" : "المستودع المستهدف"} إلزامي للصنف ${sw[3]}`;
  const sm = s.match(/^Row #(\d+): Source and target warehouse cannot be same for row (\d+)$/); if (sm) return `الصف #${sm[1]}: لا يمكن أن يكون مستودع المصدر والمستودع المستهدف نفسه للصف ${sm[2]}`;
  const sx = s.match(/^Row #(\d+): (Source|Target) warehouse must not be set for (.+)$/); if (sx) return `الصف #${sx[1]}: يجب عدم تحديد ${sx[2] === "Source" ? "مستودع المصدر" : "المستودع المستهدف"} في ${trDt(sx[3]!)}`;
  if (s === "None of the items have any change in quantity or value.") return "لا يوجد أي تغيير في الكمية أو القيمة لأي من الأصناف.";
  if (s === "Please enter the Landed Cost charges") return "يرجى إدخال رسوم التكلفة الواصلة";
  if (s === "Please enter Receipt Document") return "يرجى إدخال مستند الاستلام";
  const rn = s.match(/^Row #(\d+): Negative (Quantity|Valuation Rate) is not allowed$/); if (rn) return `الصف #${rn[1]}: ${rn[2] === "Quantity" ? "الكمية السالبة" : "معدل التقييم السالب"} غير مسموح`;
  const oh = s.match(/^(Sales Order|Purchase Order|Material Request|Delivery Note|Purchase Receipt) (\S+) is (On Hold|Closed|Stopped)$/); if (oh) return `${trDt(oh[1]!)} ${oh[2]} ${trDt(oh[3]!)}`;
  if (s === "Reason for Hold is mandatory") return "سبب الإيقاف المؤقت إلزامي";
  const am = s.match(/^Row #(\d+): Item (.+) appears on more than one line of (.+?) (\S+); select the source line$/); if (am) return `الصف #${am[1]}: الصنف ${am[2]} موجود في أكثر من سطر في ${trDt(am[3]!)} ${am[4]}؛ اختر سطر المصدر`;
  if (s === "Please enable Allow Stock Reservation in Stock Settings") return "يرجى تفعيل السماح بحجز المخزون في إعدادات المخزون";
  if (s === "No stock available to reserve") return "لا يوجد مخزون متاح للحجز";
  const rv = s.match(/^Stock Reservation: (\S+) units of Item (.+) are reserved in Warehouse (.+) for other Sales Orders; only (\S+) available\.$/); if (rv) return `حجز المخزون: ${rv[1]} وحدة من الصنف ${rv[2]} محجوزة في المستودع ${rv[3]} لأوامر بيع أخرى؛ المتاح ${rv[4]} فقط.`;
  const nr = s.match(/^No reserved stock for Sales Order (\S+)$/); if (nr) return `لا يوجد مخزون محجوز لأمر البيع ${nr[1]}`;
  const ur2 = s.match(/^(\d+) Stock Reservation Entry cancelled$/); if (ur2) return `تم إلغاء ${ur2[1]} قيد حجز مخزون`;
  const rs = s.match(/^Stock Reservation Entry (.+)$/); if (rs) return `قيد حجز المخزون ${rs[1]}`;
  const cr = s.match(/^Cannot reserve stock for a (.+) Sales Order$/); if (cr) return `لا يمكن حجز المخزون لأمر بيع بحالة ${trDt(cr[1]!)}`;
  const ui = s.match(/^Update Items: quantity@rate per row, separated by ; \(current: (.*)\)$/); if (ui) return `تحديث الأصناف: الكمية@السعر لكل صف، مفصولة بـ ; (الحالي: ${ui[1]})`;
  const ur = s.match(/^(\d+) row\(s\) updated$/); if (ur) return `تم تحديث ${ur[1]} صف`;
  if (s === "No changes to update") return "لا توجد تغييرات للتحديث";
  const uq = s.match(/^Row #(\d+): (.+)$/);
  if (uq) { const m: Record<string, string> = { "Cannot set quantity less than delivered quantity": "لا يمكن تعيين كمية أقل من الكمية المسلّمة", "Cannot set quantity less than received quantity": "لا يمكن تعيين كمية أقل من الكمية المستلمة", "Cannot update rate as the item is already billed": "لا يمكن تحديث السعر لأن الصنف تمت فوترته", "Cannot set amount less than billed amount": "لا يمكن تعيين مبلغ أقل من المبلغ المفوتر", "Invalid quantity or rate": "كمية أو سعر غير صالح" }; if (m[uq[2]!]) return `الصف #${uq[1]}: ${m[uq[2]!]}`; }
  const uc = s.match(/^Cannot update items of a (.+) (Sales Order|Purchase Order)$/); if (uc) return `لا يمكن تحديث أصناف ${trDt(uc[2]!)} بحالة ${trDt(uc[1]!)}`;
  const ss = s.match(/^Status: (.+)$/); if (ss) return `الحالة: ${trDt(ss[1]!)}`;
  // delete_doc.py raise_link_exists_exception — record names may contain spaces, so the DocType is the longest known label prefix
  { const bl = s.match(/^Cannot delete or cancel because (.+) is linked with (.+?)(?: at Row: (\d+))?$/); if (bl) return `لا يمكن الحذف أو الإلغاء لأن ${dtName(bl[1]!)} مرتبط بـ ${dtName(bl[2]!)}${bl[3] ? ` في الصف ${bl[3]}` : ""}`; }
  { const m = s.match(/^You can disable this (.+) instead of deleting it\.$/); if (m) return `يمكنك تعطيل هذا السجل (${trDt(m[1]!)}) بدلًا من حذفه.`; }
  { const m = s.match(/^(.+): Submitted Record cannot be deleted\. You must Cancel it first\.$/); if (m) return `${dtName(m[1]!)}: لا يمكن حذف سجل معتمد. يجب إلغاؤه أولًا.`; }
  { const m = s.match(/^Cannot delete (.+) as it has child nodes$/); if (m) return `لا يمكن حذف ${m[1]} لأن له عقدًا فرعية`; }
  { const m = s.match(/^(.+): deleting requires the DIGIT server — its controller runs (.+)$/); if (m) return `${trDt(m[1]!)}: يتطلب الحذف خادم DIGIT — وحدة التحكم تنفّذ ${m[2]}`; }
  { const m = s.match(/^No permission to delete (.+)$/); if (m) return `لا توجد صلاحية لحذف ${trDt(m[1]!)}`; }
  { const m = s.match(/^Permanently delete (.+)\?$/); if (m) return `حذف ${m[1]} نهائيًا؟`; }
  { const m = s.match(/^Delete (\d+) items? permanently\?$/); if (m) return `حذف ${m[1]} ${m[1] === "1" ? "عنصر" : "عناصر"} نهائيًا؟`; }
  { const m = s.match(/^(Submit|Cancel) (\d+) documents\?$/); if (m) return `${m[1] === "Submit" ? "اعتماد" : "إلغاء"} ${m[2]} مستندات؟`; }
  { const m = s.match(/^Update (\d+) records$/); if (m) return `تحديث ${m[1]} سجلات`; }
  { const m = s.match(/^Copied (\d+) rows? to clipboard$/); if (m) return `تم نسخ ${m[1]} ${m[1] === "1" ? "صف" : "صفوف"} إلى الحافظة`; }
  { const m = s.match(/^Cannot (delete|submit|cancel|update) (.+?)(\.)?$/); if (m && !/ because | as it has /.test(s)) return `لا يمكن ${({ delete: "حذف", submit: "اعتماد", cancel: "إلغاء", update: "تحديث" } as Record<string, string>)[m[1]!]} ${m[2]}`; }
  { const m = s.match(/^You can only print upto (\d+) documents at a time$/); if (m) return `يمكنك طباعة ${m[1]} مستند كحد أقصى في المرة الواحدة`; }
  // frappe form/save.js check_mandatory table lines + stock_entry.py / stock_entry_detail.py / accounts_controller.py row messages (lib/stockEntryRows.ts)
  { const L = (x: string) => look(x) ?? compose(x) ?? x;
    const m = s.match(/^In (.+?), (.+) is required in (row|rows) (.+)\.$/); if (m) return `في ${L(m[1]!)}، ${L(m[2]!)} مطلوب في ${m[3] === "row" ? "الصف" : "الصفوف"} ${m[4]}.`;
    const e = s.match(/^In (.+?), (.+) is required in every row\.$/); if (e) return `في ${L(e[1]!)}، ${L(e[2]!)} مطلوب في كل صف.`;
    const ia = s.match(/^Item (.+) is not active or end of life has been reached$/); if (ia) return `البند ${ia[1]} غير نشط أو تم التوصل إلى نهاية الحياة`;
    const pq = s.match(/^Row (\d+): The item (.+), quantity must be a positive number$/); if (pq) return `الصف ${pq[1]}: البند ${pq[2]}، يجب أن تكون الكمية رقمًا موجبًا`;
    const zq = s.match(/^Row #(\d+): Quantity for Item (.+) cannot be zero\.$/); if (zq) return `الصف #${zq[1]}: لا يمكن أن تكون كمية البند ${zq[2]} صفرًا.`;
    const ns = s.match(/^(.+) is not a stock Item$/); if (ns) return `${ns[1]} ليس من نوع المخزون`;
    const dm = s.match(/^Error: Data missing in table (.+)$/); if (dm) return `خطأ: البيانات مفقودة في الجدول ${L(dm[1]!)}`; }
  return undefined;
}
function trText(raw: string): string | null {
  const s = raw.trim();
  const field = fieldTranslation(s);
  if (field !== undefined) return raw.replace(s, field);
  { const sp = special(s); if (sp) return raw.replace(s, sp); }
  if (!s || s.length > 240 || !/[A-Za-z]/.test(s)) return null;
  let v = compose(s);
  if (!v) { const m = s.match(/^(.*?)(\s*[:…→←›‹*(]+)$/); if (m?.[1]) { const b = compose(m[1]); if (b) v = b + (m[2] ?? ""); } }
  if (!v && s in SUBMIT_POSTING) v = SUBMIT_POSTING[s as "Submit"];
  if (!v) return null;
  return raw.replace(s, v);
}

/**
 * Hydration gate: server-rendered markup of a lazily loaded route hydrates after the root effect that starts this
 * layer. Rewriting such text before React claims it makes hydration fail ("server rendered text didn't match"),
 * so while the gate is on, nodes whose element React has not hydrated yet (no own `__reactFiber$…` key) are left
 * alone and picked up by a follow-up pass once hydrated.
 */
let gate = false;
let skippedUnhydrated = false;
const isHydrated = (el: Element) => Object.keys(el).some((k) => k.startsWith("__reactFiber$"));

/* ---------------------------------------------------------------- sample names (owner 2026-11-13) ----------------------------------------------------------------
 * Record content (data-no-i18n) is never translated — except the preview's own English SAMPLE values: the generic sample
 * generator's "<word> <field label> <n>" (adapter synthValue) and seeded English names ("Digit Synthetic Co", "Sara Synthetic",
 * "Synthetic Atlas Trading" …, resolver registered by lib/seedNamesAr.ts). Display only: the stored value never changes,
 * an exact match is required, and English shows the stored value. */
const SAMPLE_AR: Record<string, string> = { Atlas: "أطلس", Nadia: "نادية", Orion: "الجوزاء", Sahara: "الصحراء", Cedar: "الأرز", Falcon: "الصقر", Delta: "الدلتا", Noor: "نور", Harbor: "المرفأ", Zephyr: "النسيم" };
const SAMPLE_GEN = /^(Atlas|Nadia|Orion|Sahara|Cedar|Falcon|Delta|Noor|Harbor|Zephyr) (.+) (\d+)$/;
let sampleResolver: ((v: string) => string | undefined) | undefined;
/** Seeded English sample name → Arabic (registered by the seed name module, which reads the shared name maps). */
export function setSampleNameResolver(f: (v: string) => string | undefined) { sampleResolver = f; }
/** Apps add their own sample-value resolvers (Arabic display of their English sample masters), consulted after the seed one. */
const extraResolvers: ((v: string) => string | undefined)[] = [];
export function addSampleNameResolver(f: (v: string) => string | undefined) { if (!extraResolvers.includes(f)) extraResolvers.push(f); }
/** English display of Arabic sample values inside record content (apps register; exact match; stored value unchanged). */
const enResolvers: ((v: string) => string | undefined)[] = [];
export function addSampleNameResolverEn(f: (v: string) => string | undefined) {
  if (enResolvers.includes(f)) return; enResolvers.push(f);
  if (typeof document !== "undefined" && document.documentElement.hasAttribute("data-i18n") && read() === "en") startEnSamples();
}
/** English display of an Arabic sample value (registered resolvers, exact match), or undefined for real data. */
export function sampleNameEn(v: string): string | undefined { for (const f of enResolvers) { const en = f(v); if (en) return en; } return undefined; }
const AR_CHARS = /[\u0600-\u06FF]/;
function enText(node: Node) {
  // English screens hold no Arabic chrome, so any exact-match Arabic sample value is record content (marked or not)
  const p = node.parentElement; if (!p || p.closest("[contenteditable], script, style, textarea, [data-lang-switch]")) return;
  const cur = node.nodeValue ?? ""; const v = cur.trim(); if (v.length < 2 || !AR_CHARS.test(v)) return;
  let en: string | undefined; for (const f of enResolvers) { en = f(v); if (en) break; }
  // a value after a list separator ("· value") is still one exact sample value
  let key = v; if (!en) { const m = /^([·•|—–-]\s*)(.+)$/.exec(v); if (m) { key = m[2]!.trim(); for (const f of enResolvers) { en = f(key); if (en) break; } } }
  if (en) { if (!orig.has(node)) orig.set(node, cur); node.nodeValue = cur.replace(key, en); }
}
function enWalk(root: Node) {
  if (root.nodeType === 3) { enText(root); return; } if (root.nodeType !== 1) return;
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); for (let n = w.nextNode(); n; n = w.nextNode()) enText(n);
}
let enObserver: MutationObserver | null = null;
function startEnSamples() {
  if (!enResolvers.length || typeof MutationObserver === "undefined") return;
  enWalk(document.body);
  if (!enObserver) { enObserver = new MutationObserver((muts) => { for (const m of muts) { if (m.type === "characterData") enText(m.target); else m.addedNodes.forEach(enWalk); } }); enObserver.observe(document.body, { subtree: true, childList: true, characterData: true }); }
}
function stopEnSamples() { if (!enObserver) return; enObserver.disconnect(); enObserver = null; restoreNode(document.body); }
/** Arabic display of an English sample value, or undefined when the value is not a known sample (real data stays as typed). */
export function sampleNameAr(v: string): string | undefined {
  const hit = sampleResolver?.(v) ?? (v === "Digit Synthetic Co" ? DIGIT[v] : undefined) ?? extraResolvers.reduce<string | undefined>((h, f) => h ?? f(v), undefined); if (hit) return hit;
  const m = v.match(SAMPLE_GEN); if (!m) return undefined;
  const label = look(m[2]!) ?? compose(m[2]!);
  return `${SAMPLE_AR[m[1]!]} — ${label && !/[A-Za-z]/.test(label) ? label : "عيّنة"} ${m[3]}`;
}
function sampleOut(raw: string): string | null {
  const v = raw.trim(); if (v.length < 3 || !/[A-Za-z]/.test(v)) return null;
  const ar = sampleNameAr(v); return ar ? raw.replace(v, ar) : null;
}
function sampleText(node: Node) {
  const p = node.parentElement; if (!p || p.closest("[contenteditable]")) return;
  if (gate && !isHydrated(p)) { skippedUnhydrated = true; return; }
  const cur = node.nodeValue ?? ""; const base = orig.get(node) ?? cur;
  const src = orig.has(node) && cur !== sampleOut(base) && cur !== base ? cur : base;
  const out = sampleOut(src);
  if (out != null) { orig.set(node, src); if (cur !== out) node.nodeValue = out; }
}
function sampleWalk(el: Element) {
  if (el.closest("[contenteditable]")) return;
  const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let n = w.nextNode(); n; n = w.nextNode()) { const p = n.parentElement; if (p && !skipText(p)) sampleText(n); }
}

function translateNode(root: Node) {
  if (root.nodeType === 3) {
    const p = root.parentElement;
    if (!p || skipText(p)) return;
    if (noI18n(p)) { sampleText(root); return; }
    if (gate && !isHydrated(p)) { skippedUnhydrated = true; return; }
    const cur = root.nodeValue ?? "";
    const base = orig.get(root) ?? cur;
    // node changed by React after we translated → treat new value as source
    const src = orig.has(root) && cur !== trText(base) && cur !== base ? cur : base;
    let out = trText(src);
    if (arabicDigits() && /[0-9]/.test(out ?? src)) out = toIndic(out ?? src);
    if (out != null) { orig.set(root, src); if (cur !== out) root.nodeValue = out; }
    return;
  }
  if (root.nodeType !== 1) return;
  const el = root as Element;
  if (SKIP.has(el.tagName)) return;
  if (noI18n(el)) { sampleWalk(el); return; }
  const attrsOk = !gate || isHydrated(el);
  if (!attrsOk) skippedUnhydrated = true;
  for (const a of attrsOk ? ATTRS : []) {
    const v = el.getAttribute(a); if (!v) continue;
    const saved = origAttr.get(el) ?? {};
    const src = saved[a] && trText(saved[a]) === v ? saved[a] : v;
    const out = trText(src);
    if (out != null && out !== v) { saved[a] = src; origAttr.set(el, saved); el.setAttribute(a, out); }
  }
  if (el.tagName !== "TEXTAREA") el.childNodes.forEach(translateNode);
}
/**
 * Gated passes until every server-rendered node has hydrated (bounded), then the gate opens for good. The gate only
 * applies to a React-hydrated document (the <body> element carries a fiber); plain DOM (tests, non-React hosts) is
 * translated at once.
 */
function gatedPass(attempt = 0) {
  if (read() !== "ar") { gate = false; return; }
  gate = isHydrated(document.body); skippedUnhydrated = false;
  applying = true; translateNode(document.body); applying = false;
  if (skippedUnhydrated && attempt < 60) { setTimeout(() => gatedPass(attempt + 1), 100); return; }
  gate = false;
  if (skippedUnhydrated) { applying = true; translateNode(document.body); applying = false; }
}

/** Read-only scan evidence: original English and winning dictionary for eligible UI nodes. */
export function inspectTranslations(root: Element = document.body) {
  const rows: { english: string; displayed: string; source: string; kind: string }[] = [];
  const add = (english: string, displayed: string, kind: string) => {
    const s = english.trim();
    if (!s || !/[A-Za-z]/.test(s)) return;
    rows.push({ english: s, displayed: displayed.trim(), source: fieldTranslation(s) !== undefined ? DIGIT_FIELDS_SOURCE : trText(s) !== null ? "legacy" : "untranslated", kind });
  };
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const el = node.parentElement;
    if (!el || noI18n(el) || skipText(el) || el.closest("script,style,code,pre,textarea")) continue;
    if (el.tagName !== "OPTION" && !el.getClientRects().length) continue;
    add(orig.get(node) ?? node.nodeValue ?? "", node.nodeValue ?? "", el.tagName === "OPTION" ? "option" : "text");
  }
  for (const el of root.querySelectorAll("[placeholder],[title],[aria-label]")) {
    if (noI18n(el) || el.closest("script,style,code,pre")) continue;
    for (const a of ATTRS) {
      const value = el.getAttribute(a);
      if (value) add(origAttr.get(el)?.[a] ?? value, value, a);
    }
  }
  return rows;
}

function restoreNode(root: Node) {
  if (root.nodeType === 3) { const o = orig.get(root); if (o != null) { root.nodeValue = o; orig.delete(root); } return; }
  if (root.nodeType !== 1) return;
  const el = root as Element; const saved = origAttr.get(el);
  if (saved) { for (const [a, v] of Object.entries(saved)) el.setAttribute(a, v); origAttr.delete(el); }
  el.childNodes.forEach(restoreNode);
}

/* ---------------------------------------------------------------- browser tab title (owner work list AR-004 … AR-070) ----------------------------------------------------------------
 * The route head() writes an English tab title. On Arabic screens the tab shows the page's own (already translated) band
 * heading, else every " — " segment through the same dictionary (case-insensitive; "<doctype> list" → "قائمة <doctype>");
 * record names stay as stored. English restores the router's title. Display only. */
const BRAND_AR = "ديجيت";
const TITLE_BRANDS = new Set(["digit virtual core", "digit desk", "digit", "digit enterprise"]);
const APP_TITLE_AR: Record<string, string> = { "digit construction": "ديجيت للمقاولات", "digit pro": "ديجيت برو", "digit hr": "ديجيت للموارد البشرية", "digit crm": "ديجيت لإدارة العملاء", workspace: "مساحة العمل", report: "تقرير", reports: "التقارير", settings: "الإعدادات" };
function segAr(seg: string): string {
  const s = seg.trim(); const k = s.toLowerCase().replace(/_/g, " ").replace(/\s+/g, " ");
  if (TITLE_BRANDS.has(k)) return BRAND_AR;
  const ls = k.match(/^(.*) list$/); if (ls?.[1]) return `قائمة ${segAr(ls[1])}`;
  return (APP_TITLE_AR[k] ?? trText(s) ?? lower[k] ?? s).trim();
}
/** Arabic tab title: the translated page heading when it is Arabic, else the English title segment by segment. */
export function titleArOf(en: string, heading?: string | null): string {
  const h = heading?.replace(/\s+/g, " ").trim();
  if (h && /[\u0600-\u06FF]/.test(h)) return `${h} — ${BRAND_AR}`;
  const segs = en.split(" — ").map(segAr).filter(Boolean);
  return segs.filter((x, i) => segs.indexOf(x) === i).join(" — ");
}
let titleEn = "", titleAr = "", titleObserver: MutationObserver | null = null;
function syncTitle() {
  if (typeof document === "undefined") return;
  const cur = document.title;
  if (read() !== "ar") { if (titleAr && cur === titleAr && titleEn) document.title = titleEn; titleAr = ""; return; }
  if (cur !== titleAr) titleEn = cur;
  const next = titleArOf(titleEn, document.querySelector("[data-shell-main] h1, main h1")?.textContent);
  if (next && next !== cur) { titleAr = next; document.title = next; }
}

let observer: MutationObserver | null = null;
let applying = false;
export async function applyLang() {
  if (typeof document === "undefined") return;
  const lang = read();
  const html = document.documentElement;
  html.lang = lang; html.dir = lang === "ar" ? "rtl" : "ltr";
  html.dataset["i18n"] = "";
  if (lang === "en") { observer?.disconnect(); observer = null; titleObserver?.disconnect(); titleObserver = null; restoreNode(document.body); syncTitle(); startEnSamples(); return; }
  stopEnSamples();
  await loadDict();
  if (read() !== "ar") return;
  gatedPass();
  html.dataset["i18n"] = "ar";
  if (!observer) {
    observer = new MutationObserver((muts) => {
      if (applying) return;
      applying = true;
      for (const m of muts) {
        if (m.type === "characterData") translateNode(m.target);
        else if (m.type === "attributes") translateNode(m.target);
        else m.addedNodes.forEach(translateNode);
      }
      applying = false;
      syncTitle();
    });
    observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  }
  if (!titleObserver && document.head) { titleObserver = new MutationObserver(() => syncTitle()); titleObserver.observe(document.head, { subtree: true, childList: true, characterData: true }); }
  syncTitle();
}

/** Currency/number display: Western digits; Saudi Riyal = the official symbol left of the number (SAMA rules, format.ts riyal). */
export function fmtMoney(n: number, currency = "SAR") {
  const v = n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return currency === "SAR" ? `\u2066\u20C1 ${v}\u2069` : `${currency} ${v}`;
}
