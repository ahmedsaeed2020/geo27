/**
 * Saudi Arabic-first demo names (owner screen review H). English names stay as the alternate (`__name_en`).
 * `arabizeSeed()` rewrites only seed-owned values (records flagged __synthetic whose value equals a known
 * seed English name), so user-entered data is never touched.
 */
import { adapter, type Doc } from "@/lib/adapter";
import { addSampleNameResolverEn, setSampleNameResolver } from "@/i18n";
import { volumeOrgEn } from "@/lib/volume/names";

export const CUSTOMERS_AR: Record<string, string> = {
  "Al-Rawabi Trading": "مؤسسة الروابي التجارية", "Najd Contracting": "شركة نجد للمقاولات", "Al-Waha Hospitals": "مستشفيات الواحة", "Red Sea Logistics": "البحر الأحمر للخدمات اللوجستية", "Al-Safwa Schools": "مدارس الصفوة", "Gulf Coast Hotels": "فنادق ساحل الخليج", "Al-Noor Pharmacies": "صيدليات النور", "Tihama Builders": "تهامة للبناء", "Al-Fajr Electronics": "الفجر للإلكترونيات", "Qassim Farms": "مزارع القصيم", "Al-Bayan Real Estate": "البيان العقارية", "Makkah Hospitality": "مكة للضيافة", "Al-Madinah Clinics": "عيادات المدينة", "Eastern Steel Works": "مصانع الشرقية للحديد", "Al-Khobar Marine": "الخبر للخدمات البحرية", "Al-Yamamah Offices": "مكاتب اليمامة", "Desert Rose Retail": "وردة الصحراء للتجزئة", "Al-Hijaz Transport": "الحجاز للنقل", "Jazan Agro": "جازان الزراعية", "Al-Ula Tourism": "العلا للسياحة", "Riyadh Data Center": "مركز بيانات الرياض", "Al-Masar Engineering": "المسار الهندسية", "Tabuk Cement": "أسمنت تبوك", "Al-Diyar Facilities": "الديار لإدارة المرافق", "Asir Water Co.": "شركة مياه عسير",
  "Al-Hijaz Steel": "حديد الحجاز", "Yanbu Petrochem Services": "ينبع لخدمات البتروكيماويات", "Abha Tourism Group": "مجموعة أبها السياحية", "Al-Jouf Olive Co.": "شركة زيتون الجوف", "Tabuk Agri Holdings": "تبوك القابضة الزراعية", "Hail Cement Works": "أسمنت حائل", "Al-Ahsa Dates Co.": "شركة تمور الأحساء", "Najran Marble": "رخام نجران", "Jazan Port Services": "خدمات ميناء جازان", "Al-Qurayyat Trading": "القريات التجارية",
  "Atlas Logistics": "أطلس اللوجستية", "Noor Health": "نور الصحية", "Cedar Build Co": "الأرز للبناء", "Falcon Retail": "الصقر للتجزئة", "Harbor Foods": "المرفأ للأغذية",
  "Atlas Trading": "أطلس التجارية", "Noor Clinics": "عيادات نور", "Cedar Homes": "منازل الأرز",
};
export const SUPPLIERS_AR: Record<string, string> = {
  "Al-Mutlaq Electrical Supply": "المطلق للتوريدات الكهربائية", "Saudi Cables Trading": "السعودية لتجارة الكابلات", "Al-Jazeera Hardware": "الجزيرة للعدد والأدوات", "Eastern Tools Est.": "مؤسسة الشرقية للأدوات", "Al-Rajhi Industrial (Demo)": "الراجحي الصناعية", "Jeddah Equipment House": "بيت جدة للمعدات", "Al-Fahad Consumables": "الفهد للمستهلكات", "Nawras Import": "النورس للاستيراد", "Al-Hamra Steel": "الحمراء للحديد", "Unified Office Supplies": "الموحدة للوازم المكتبية", "Al-Shams Lighting": "الشمس للإنارة", "Dammam Generators": "الدمام للمولدات", "Al-Qimma Safety": "القمة لمعدات السلامة", "Peninsula Logistics": "الجزيرة العربية للخدمات اللوجستية", "Al-Sahel Packaging": "الساحل للتغليف",
  "Falcon Metals": "الصقر للمعادن", "Harbor Cables": "المرفأ للكابلات",
};
/** Demo item names (seedDemo ITEM_NAMES): a Saudi trading company names its items in Arabic. */
export const ITEMS_AR: Record<string, string> = {
  "LED Panel 60x60": "لوحة إنارة 60×60", "Circuit Breaker 32A": "قاطع كهربائي 32 أمبير", "Copper Cable 4mm (100m)": "كابل نحاسي 4 مم (100 م)", "Distribution Board 12-way": "لوحة توزيع 12 خطًا", "Smart Switch": "مفتاح ذكي", "Floodlight 200W": "كشاف إنارة 200 واط", "Extension Socket": "مقبس تمديد", "Cable Tray 3m": "حامل كابلات 3 م", "Steel Bolt M12 (box)": "مسامير فولاذية مقاس 12 (علبة)", "Hinge Heavy Duty": "مفصلة للخدمة الشاقة", "Door Lock Set": "طقم قفل باب", "Anchor Bolt Kit": "طقم مسامير تثبيت", "Steel Bracket": "كتيفة فولاذية", "Pipe Clamp 2in": "مشبك أنابيب 2 بوصة", "Hand Drill": "مثقاب يدوي", "Tool Box": "صندوق عدة", "Installation Service (hour)": "خدمة تركيب (ساعة)", "Maintenance Contract (month)": "عقد صيانة (شهر)", "Site Survey": "مسح موقع", "Electrical Inspection": "فحص كهربائي", "Training Session": "جلسة تدريب", "Emergency Call-out": "استدعاء طارئ", "Consulting (day)": "استشارات (يوم)", "Annual Support Plan": "خطة دعم سنوية", "Insulation Tape": "شريط عازل", "Cable Ties (pack)": "أربطة كابلات (عبوة)", "Safety Gloves": "قفازات سلامة", "Cleaning Solvent 5L": "مذيب تنظيف 5 لترات", "Printer Paper A4 (box)": "ورق طباعة A4 (علبة)", "Marker Set": "طقم أقلام تحديد", "Lubricant Spray": "بخاخ تشحيم", "Face Masks (box)": "كمامات (علبة)", "Generator 20kVA": "مولد كهربائي 20 كيلوفولت أمبير", "Air Compressor": "ضاغط هواء", "Welding Machine": "ماكينة لحام", "Scissor Lift": "رافعة مقصية", "Pallet Jack": "رافعة طبليات يدوية", "Power Analyzer": "محلل طاقة", "Ladder 6m": "سلم 6 م", "Server Rack 42U": "خزانة خوادم 42 وحدة",
};
const FIRST_AR: Record<string, string> = { Huda: "هدى", Abdullah: "عبدالله", Ahmed: "أحمد", Mohammed: "محمد", Fahad: "فهد", Khalid: "خالد", Saad: "سعد", Faisal: "فيصل", Turki: "تركي", Nasser: "ناصر", Omar: "عمر", Yousef: "يوسف", Ali: "علي", Hamad: "حمد", Majed: "ماجد", Sultan: "سلطان", Bandar: "بندر", Noura: "نورة", Sara: "سارة", Reem: "ريم", Lama: "لمى", Hessa: "حصة", Maha: "مها", Abeer: "عبير", Dana: "دانة", Hind: "هند", Joud: "جود", Rawan: "روان", Shahad: "شهد", Asma: "أسماء", Latifa: "لطيفة", Mona: "منى" };
const LAST_AR: Record<string, string> = { "Al-Otaibi": "العتيبي", "Al-Qahtani": "القحطاني", "Al-Ghamdi": "الغامدي", "Al-Harbi": "الحربي", "Al-Zahrani": "الزهراني", "Al-Shehri": "الشهري", "Al-Dosari": "الدوسري", "Al-Mutairi": "المطيري", "Al-Anazi": "العنزي", "Al-Shammari": "الشمري", Synthetic: "" };

/** English seed value → Arabic display value. Handles "X (Synthetic)", "Synthetic X" and "First Last" employee names. */
/** CRM demo task/note titles and note bodies (seedCrm.ts / seedDemo.ts). */
const CRM_TITLES_AR: Record<string, string> = {
  "Call back": "معاودة الاتصال", "Send brochure": "إرسال الكتيّب التعريفي", "Qualify budget": "تأهيل الميزانية", "Book meeting": "حجز اجتماع", "Share references": "مشاركة المراجع",
  "Send proposal": "إرسال العرض", "Schedule demo": "جدولة عرض توضيحي", "Follow up call": "مكالمة متابعة", "Prepare contract": "إعداد العقد", "Site visit": "زيارة موقع",
};
function crmSeedText(v: string): string | undefined {
  if (CRM_TITLES_AR[v]) return CRM_TITLES_AR[v];
  let m = v.match(/^Meeting notes (\d+)$/); if (m) return `ملاحظات الاجتماع ${m[1]}`;
  m = v.match(/^Call summary (\d+)$/); if (m) return `ملخص المكالمة ${m[1]}`;
  if (v === "<p>Discussed scope and timeline with the client. Demo data.</p>") return "<p>نوقش النطاق والجدول الزمني مع العميل. بيانات تجريبية.</p>";
  m = v.match(/^<p>Discussed requirements and budget \(([\d.,]+) SAR\)\. Synthetic note\.<\/p>$/); if (m) return `<p>نوقشت المتطلبات والميزانية (${m[1]} ر.س). ملاحظة تجريبية.</p>`;
  // seedCrm.ts sample emails and mention comments (CRM C4 timelines show them as plain text)
  m = v.match(/^Re: Quotation request (\d+)$/); if (m) return `رد: طلب عرض سعر ${m[1]}`;
  m = v.match(/^Proposal for (.+)$/); if (m) return `عرض مقدّم إلى ${m[1]}`;
  const body = v.replace(/^<p>|<\/p>$/g, "");
  if (body === "Thank you, please share the updated price list.") return v.startsWith("<p>") ? "<p>شكرًا، نرجو مشاركة قائمة الأسعار المحدّثة.</p>" : "شكرًا، نرجو مشاركة قائمة الأسعار المحدّثة.";
  if (body === "Please find attached our proposal. Demo data.") return v.startsWith("<p>") ? "<p>تجدون عرضنا مرفقًا. بيانات تجريبية.</p>" : "تجدون عرضنا مرفقًا. بيانات تجريبية.";
  m = v.match(/^@(\S+) please follow up on this (lead|deal)\.$/); if (m) return `@${FIRST_AR[m[1]!] ?? m[1]} يرجى متابعة ${m[2] === "lead" ? "هذا العميل المحتمل" : "هذه الصفقة"}.`;
  return undefined;
}

export function arabicSeedName(v: string): string | undefined {
  const crm = crmSeedText(v); if (crm) return crm;
  const en = v.replace(/ \(Synthetic\)$/, "").replace(/^Synthetic /, "");
  if (CUSTOMERS_AR[en]) return CUSTOMERS_AR[en];
  if (SUPPLIERS_AR[en]) return SUPPLIERS_AR[en];
  if (ITEMS_AR[en]) return ITEMS_AR[en];
  const m = v.match(/^(\S+) (\S+)$/);
  if (m && FIRST_AR[m[1]!] && m[2]! in LAST_AR) return [FIRST_AR[m[1]!], LAST_AR[m[2]!]].filter(Boolean).join(" ");
  if (FIRST_AR[v]) return FIRST_AR[v];
  if (v in LAST_AR && LAST_AR[v]) return LAST_AR[v];
  return undefined;
}

const NAME_FIELDS = /(^|_)(customer_name|supplier_name|party_name|employee_name|first_name|last_name|title|contact_display|customer|supplier|content|item_name)$/;
function rewrite(d: Doc): Record<string, unknown> | null {
  let changed = false; const out: Record<string, unknown> = {}; const en: Record<string, string> = {};
  for (const [k, v] of Object.entries(d)) {
    if (typeof v === "string" && NAME_FIELDS.test(k) && !/^[A-Z]+-/.test(v)) { const ar = arabicSeedName(v); if (ar && ar !== v) { out[k] = ar; en[k] = v.replace(/ \(Synthetic\)$/, "").replace(/^Synthetic /, ""); changed = true; } }
    else if (Array.isArray(v)) { const rows = v.map((r) => (r && typeof r === "object" ? (rewrite(r as Doc) ? { ...(r as Doc), ...rewrite(r as Doc)! } : r) : r)); if (rows.some((r, i) => r !== v[i])) { out[k] = rows; changed = true; } }
  }
  if (changed && Object.keys(en).length) out["__name_en"] = { ...((d["__name_en"] as object) ?? {}), ...en };
  return changed ? out : null;
}

// v2 adds item names and Ahmed; the rewrite is idempotent (an Arabic value has no mapping), so a re-run only fills the new ones
const MKEY = "digit-virtual-core:seed-arabic-v2";
/** CRM pass: CRM demo rows can be inserted after the shell seed, so it runs once per CRM seed under its own key. */
export const CRM_MKEY = "digit-virtual-core:seed-arabic-crm-v1";
export function arabizeSeed(key = MKEY) {
  if (typeof window === "undefined" || localStorage.getItem(key)) return 0;
  let n = 0;
  for (const dt of adapter.doctypes()) for (const d of adapter.list(dt)) {
    if (!d["__synthetic"]) continue;
    const p = rewrite(d); if (p) { adapter.insertDocQuiet(dt, { ...d, ...p }); n++; }
  }
  localStorage.setItem(key, String(n));
  return n;
}

/** Seeded sample record names that are document keys (never rewritten), shown in Arabic by the display layer. */
const SAMPLE_KEYS_AR: Record<string, string> = {
  "Digit Synthetic Co": "شركة ديجيت الاصطناعية", "Operating - Al-Demo Bank": "الحساب التشغيلي - البنك التجريبي", "Payroll - Al-Demo Bank": "حساب الرواتب - البنك التجريبي", "Al-Demo Bank": "البنك التجريبي", "Synthetic Prospect One": "عميل محتمل — النخبة", "Synthetic Prospect Two": "عميل محتمل — الريادة", "Synthetic Prospect Three": "عميل محتمل — الأفق",
  "Salem Sales": "سالم المبيعات", "Synthetic Monthly Structure": "هيكل الرواتب الشهري", "Synthetic Warehouse Fit-out": "تجهيز المستودع", "Synthetic Forklift": "رافعة شوكية", "Noor Applicant": "نور الشمري",
  "Maintenance starter kit (bundle)": "طقم الصيانة الأساسي (حزمة)", "Maintenance starter kit": "طقم الصيانة الأساسي",
  "Food-grade lubricant (batches)": "شحم غذائي (بالدُفعات)", "Handheld barcode scanner (serials)": "قارئ باركود محمول (بالأرقام التسلسلية)",
  "Cable ties 300mm (counted)": "أربطة كابلات 300 مم (معدودة)", "Najd Contracting Est.": "مؤسسة نجد للمقاولات",
  "Volume discount 5% from 50 units": "خصم كمية 5% من 50 وحدة", "Corporate customers 3%": "عملاء الشركات 3%",
  "Office Furniture": "أثاث مكتبي", "Restricted Chemicals": "مواد كيميائية مقيدة",
  // seeded fixed assets (seedDemo.ts)
  "Delivery Van": "شاحنة التوصيل", "Forklift": "رافعة شوكية", "Server Rack": "خزانة الخوادم", "Office Furniture Set": "طقم أثاث مكتبي",
  "Generator 20kVA": "مولد كهربائي 20 كيلوفولت أمبير", "Laptops (10)": "أجهزة حاسب محمول (10)",
  // seeded item groups, units, stock entry types, journal titles and the system user (display only on Arabic screens)
  "All Item Groups": "كل مجموعات الأصناف", "Products": "المنتجات", "Electrical": "الكهربائيات", "Hardware": "العدد والأدوات", "Services": "الخدمات",
  "Consumables": "المستهلكات", "Equipment": "المعدات", "Construction Materials": "مواد البناء", "Construction Services": "خدمات البناء",
  "Raw Material": "المواد الخام", "Sub Assemblies": "التجميعات الفرعية",
  "Nos": "عدد", "Hour": "ساعة", "Unit": "وحدة", "Box": "صندوق", "Meter": "متر", "Kg": "كجم", "Litre": "لتر",
  "Material Receipt": "استلام مواد", "Material Issue": "صرف مواد", "Material Transfer": "تحويل مواد", "Material Transfer for Manufacture": "تحويل مواد للتصنيع",
  "Manufacture": "تصنيع", "Repack": "إعادة تعبئة", "Send to Subcontractor": "إرسال إلى مقاول الباطن",
  "Opening balances": "الأرصدة الافتتاحية", "Administrator": "المسؤول",
  "Net 30": "صافي 30 يومًا", "Net 15": "صافي 15 يومًا", "Net 60": "صافي 60 يومًا", "Due on Receipt": "مستحق عند الاستلام",
  "Saudi Arabia": "المملكة العربية السعودية", "All Territories": "كل المناطق", "All Customer Groups": "كل مجموعات العملاء", "Commercial": "تجاري", "Government": "حكومي", "Individual": "فرد",
};
/** Display-only Arabic for a seed value, including CRM organization names ("X — CRM"). */
export function arabicDisplay(v: string): string | undefined {
  if (SAMPLE_KEYS_AR[v]) return SAMPLE_KEYS_AR[v];
  const m = v.match(/^(.*) — CRM$/);
  if (m) { const a = arabicSeedName(m[1]!); return a ? a : undefined; }
  return arabicSeedName(v);
}
/** Display-layer lookup: seeded sample names only (seed name maps, "<First> Synthetic", CRM demo titles, sample keys) — never a
 *  bare first name or "First Last", so a person or party a user typed is shown exactly as typed. */
const DEFAULT_WH_AR: Record<string, string> = { "Goods In Transit": "بضائع في الطريق", "Work In Progress": "تحت التشغيل", "Finished Goods": "البضائع التامة", "Stores": "المخازن", "All Warehouses": "كل المستودعات" };
export function sampleDisplayAr(v: string): string | undefined {
  if (SAMPLE_KEYS_AR[v]) return SAMPLE_KEYS_AR[v];
  const net = v.match(/^Net (\d{1,3})$/); if (net) return `صافي ${net[1]} يومًا`;
  const wh = v.match(/^(.+) - ([A-Z0-9]{2,6})$/); if (wh && DEFAULT_WH_AR[wh[1]!]) return `${DEFAULT_WH_AR[wh[1]!]} - ${wh[2]}`;
  const org = v.match(/^(.*) — CRM$/); const base = org ? org[1]! : v;
  const en = base.replace(/ \(Synthetic\)$/, "").replace(/^Synthetic /, "");
  const hit = CUSTOMERS_AR[en] ?? SUPPLIERS_AR[en] ?? ITEMS_AR[en] ?? (org ? undefined : crmSeedText(v)); if (hit) return hit;
  const m = base.match(/^(\S+) Synthetic$/); return m && FIRST_AR[m[1]!] ? FIRST_AR[m[1]!] : undefined;
}
// the shared Arabic display layer shows seeded English sample names in Arabic inside record content (display only)
setSampleNameResolver(sampleDisplayAr);

/* English display of the Arabic seed values (owner notes X-01: no Arabic on English screens) — the exact reverse of the maps
 * above, used by app resolvers registered with addSampleNameResolverEn; stored values never change. */
let EN_REV: Map<string, string> | null = null;
const FIRST_EN_REV = new Map<string, string>(), LAST_EN_REV = new Map<string, string>();
function enRev(): Map<string, string> {
  if (EN_REV) return EN_REV;
  EN_REV = new Map();
  for (const m of [CUSTOMERS_AR, SUPPLIERS_AR, ITEMS_AR, CRM_TITLES_AR, SAMPLE_KEYS_AR]) for (const [en, ar] of Object.entries(m)) if (ar && !EN_REV.has(ar)) EN_REV.set(ar, en);
  for (const [en, ar] of Object.entries(FIRST_AR)) if (ar && !FIRST_EN_REV.has(ar)) FIRST_EN_REV.set(ar, en);
  for (const [en, ar] of Object.entries(LAST_AR)) if (ar && !LAST_EN_REV.has(ar)) LAST_EN_REV.set(ar, en);
  return EN_REV;
}
/** English of an Arabic seed value (names "First Last", customers, suppliers, items, CRM demo titles), or undefined. */
export function seedNameEn(v: string): string | undefined {
  const hit = enRev().get(v); if (hit) return hit;
  const m = v.match(/^(\S+) (\S+)$/);
  if (m && FIRST_EN_REV.has(m[1]!) && LAST_EN_REV.has(m[2]!)) return `${FIRST_EN_REV.get(m[1]!)} ${LAST_EN_REV.get(m[2]!)}`;
  return FIRST_EN_REV.get(v) ?? (LAST_EN_REV.get(v) || undefined);
}
/** Marketplace channel customers seeded by coreShared/seed.ts (Arabic stored names). */
const CHANNEL_EN: Record<string, string> = { "عملاء متجر سلة": "Salla customers", "عملاء متجر زد": "Zid customers", "عملاء أمازون السعودية": "Amazon.sa customers", "عملاء نون": "Noon customers" };
// English screens in every app: the exact seeded organisation / customer / supplier / item values (never person-name guesses)
addSampleNameResolverEn((v) => enRev().get(v) ?? CHANNEL_EN[v] ?? volumeOrgEn(v));

