/**
 * Round-2 sample values in the screen language (display only, exact match, stored values unchanged): Arabic screens
 * show the HR sample departments, job titles and branches in Arabic, English screens show the Arabic-first sample
 * branches, departments and employee names in English (from the records' own __name_en / __name_ar alternates).
 * Registered once from ../boot.ts through the shared i18n layer; real data a user typed is never matched.
 */
import { adapter, type Doc } from "@/lib/adapter";
import { addSampleNameResolver, addSampleNameResolverEn } from "@/i18n";
import { FIRST_F, FIRST_M, LAST, CITIES } from "@/lib/volume/names";

const s = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v));
const BRANCH: [en: string, ar: string][] = [["Head Office", "المقر الرئيسي"], ["Branch A", "الفرع أ"], ["Jeddah Branch", "فرع جدة"], ["Riyadh Branch", "فرع الرياض"], ["Dammam Branch", "فرع الدمام"], ["R2 Riyadh", "فرع الرياض ٢"]];
const DESIG: [en: string, ar: string][] = [
  ["Customer Service Manager", "مدير خدمة العملاء"], ["Customer Service Agent", "موظف خدمة العملاء"], ["Logistics Manager", "مدير الخدمات اللوجستية"], ["Logistics Coordinator", "منسق لوجستي"],
  ["Procurement Manager", "مدير المشتريات"], ["Buyer", "مشترٍ"], ["Marketing Manager", "مدير التسويق"], ["Marketing Specialist", "أخصائي تسويق"], ["Legal Manager", "مدير الشؤون القانونية"],
  ["Legal Counsel", "مستشار قانوني"], ["Quality Manager", "مدير الجودة"], ["Quality Inspector", "مفتش جودة"], ["Accountant", "محاسب"], ["HR Manager", "مدير الموارد البشرية"], ["HR Officer", "أخصائي موارد بشرية"],
  ["Payroll Officer", "أخصائي رواتب"], ["Recruiter", "أخصائي توظيف"], ["Sales Manager", "مدير المبيعات"], ["Sales Executive", "مندوب مبيعات"], ["Site Engineer", "مهندس موقع"], ["Project Manager", "مدير مشروع"],
  ["Foreman", "مراقب عمال"], ["Mason", "بنّاء"], ["Steel Fixer", "حداد مسلح"], ["Electrician", "كهربائي"], ["Labourer", "عامل"], ["Safety Officer", "مسؤول سلامة"], ["Driver", "سائق"], ["Storekeeper", "أمين مستودع"],
  ["Software Developer", "مطور برمجيات"], ["IT Support", "دعم تقني"], ["Operations Manager", "مدير العمليات"], ["Finance Manager", "المدير المالي"], ["Administrative Assistant", "مساعد إداري"],
  ["Quantity Surveyor", "مهندس كميات"], ["Estimator", "مقدّر"], ["Procurement Officer", "مسؤول مشتريات"], ["Document Controller", "مراقب مستندات"], ["Field Technician", "فني ميداني"],
  ["Carpenter", "نجار"], ["Equipment Operator", "مشغّل معدات"], ["Painter", "دهّان"], ["Plasterer", "مبيّض"], ["Tile Fixer", "عامل بلاط"], ["Helper", "عامل مساعد"],
  ["Pipe Fitter", "عامل تركيب مواسير"], ["Surveyor", "مسّاح"], ["HVAC Technician", "فني تكييف"], ["Plumber", "سبّاك"], ["Gypsum Installer", "عامل جبس"], ["Asphalt Operator", "مشغّل أسفلت"],
];
/** Arabic-first sample department bases (Core sample employees carry e.g. "المبيعات - DDT"). */
const DEPT: [en: string, ar: string][] = [["Sales", "المبيعات"], ["Finance", "المالية"], ["Warehouse", "المستودعات"], ["Human Resources", "الموارد البشرية"], ["IT", "تقنية المعلومات"], ["Operations", "العمليات"], ["Purchasing", "المشتريات"]];
/** Job families, Core sample designations and plan titles the HR sample stores in English. */
const EXTRA: [en: string, ar: string][] = [["Commercial", "التجاري"], ["Operations", "العمليات"], ["Corporate", "الخدمات المؤسسية"], ["Engineering", "الهندسة"], ["Site Trades", "الحرف الميدانية"], ["Control", "الرقابة"],
  ["Warehouse Supervisor", "مشرف المستودع"], ["IT Manager", "مدير تقنية المعلومات"], ["Systems Engineer", "مهندس أنظمة"], ["Technician", "فني"], ["Site workforce plan 2026", "خطة القوى العاملة للمواقع 2026"]];
const YEARS = [2025, 2026, 2027];
const DEPT_SUFFIX = /^(.+) - ([A-Z0-9]{2,6})$/;
let stamp = -1; let toAr = new Map<string, string>(); let toEn = new Map<string, string>();
function build() {
  const k = adapter.version(); if (k === stamp) return; stamp = k; toAr = new Map(); toEn = new Map();
  const deps = adapter.list("Department"), emps = adapter.list("Employee");
  for (const [en, ar] of [...BRANCH, ...DESIG, ...DEPT, ...EXTRA]) { toAr.set(en, ar); toEn.set(ar, en); }
  // promotion targets ("Senior <title>") and the yearly position budget / workforce plan titles of the HR sample
  for (const [en, ar] of DESIG) { toAr.set(`Senior ${en}`, `${ar} أول`); toEn.set(`${ar} أول`, `Senior ${en}`); }
  for (const b of adapter.list("Digit Print Branding") as Doc[]) { const en = s(b["company_name_en"]); if (en && /[\u0600-\u06FF]/.test(b.name)) toEn.set(b.name, en); }
  for (const d of deps as Doc[]) { const ar = s(d["__name_ar"]); const en = s(d["department_name"]); if (!ar || !en) continue; const suf = d.name.startsWith(`${en} - `) ? d.name.slice(en.length) : "";
    toAr.set(en, ar); toEn.set(ar, en); if (suf) { toAr.set(d.name, `${ar}${suf}`); toEn.set(`${ar}${suf}`, d.name); }
    for (const y of YEARS) { toAr.set(`${en} positions ${y}`, `وظائف ${ar} ${y}`); toAr.set(`${en} workforce plan ${y}`, `خطة القوى العاملة — ${ar} ${y}`); } }
  // Construction demo projects carry their own English title; HR Employee 360 uses it on English screens without changing the record.
  for (const p of adapter.list("Project") as Doc[]) { const ar = s(p["project_name"]); const en = s(p["digit_name_en"]); if (!ar || !en) continue; toEn.set(ar, en); toAr.set(en, ar); }
  for (const e of emps as Doc[]) { const ar = s(e["employee_name"]); const en = s((e["__name_en"] as Record<string, unknown> | undefined)?.["employee_name"]); if (!ar) continue;
    if (en && ar !== en) toEn.set(ar, en); else if ((e["__sample"] || e["__synthetic"] || e["__demo"]) && /[\u0600-\u06FF]/.test(ar)) { const tk = byTokens(ar); if (tk) toEn.set(ar, tk); } }
}
export const hrSampleAr = (v: string): string | undefined => { build(); return toAr.get(v); };
/** Name tokens of the Arabic-only sample people (Construction and Core sample crews), applied only to sample records. */
const TOKENS: Record<string, string> = {
  "محمد": "Mohammed", "أحمد": "Ahmed", "عبدالرحمن": "Abdulrahman", "خالد": "Khalid", "سعيد": "Saeed", "علي": "Ali", "يوسف": "Yousef", "عمر": "Omar", "إبراهيم": "Ibrahim",
  "حسن": "Hassan", "سلمان": "Salman", "فهد": "Fahad", "ناصر": "Nasser", "طارق": "Tariq", "ماجد": "Majed", "راشد": "Rashed", "سلطان": "Sultan", "عادل": "Adel", "حمد": "Hamad",
  "بدر": "Badr", "رحمن": "Rahman", "إقبال": "Iqbal", "كومار": "Kumar", "أنور": "Anwar", "عرفان": "Irfan", "شاهد": "Shahid", "جوزيف": "Joseph", "سانتوس": "Santos", "رضا": "Reza",
  "عبدالقادر": "Abdulqader", "نورة": "Noura", "ريم": "Reem", "عبدالله": "Abdullah", "راجو": "Raju", "جون": "John", "ماثيو": "Mathew",
  "القحطاني": "Al-Qahtani", "العتيبي": "Al-Otaibi", "الشمري": "Al-Shammari", "الزهراني": "Al-Zahrani", "الغامدي": "Al-Ghamdi", "الحربي": "Al-Harbi", "المطيري": "Al-Mutairi",
  "الدوسري": "Al-Dosari", "السبيعي": "Al-Subaie", "العنزي": "Al-Anazi", "الشهري": "Al-Shehri", "البلوي": "Al-Balawi", "المالكي": "Al-Malki", "الجهني": "Al-Juhani", "حسين": "Hussain",
  "خان": "Khan", "سينغ": "Singh", "ميا": "Miah", "بابو": "Babu", "رضوان": "Rizwan", "قاسم": "Qasim", "نذير": "Nazir", "محمود": "Mahmoud", "الأنصاري": "Al-Ansari",
};
const byTokens = (v: string): string | undefined => { const parts = v.split(/\s+/); const en = parts.map((w) => TOKENS[w] ?? peopleEn().get(w)); return en.every(Boolean) ? en.join(" ") : undefined; };
/** Generated sample people (shared name lists: first × last, both languages) — Arabic full name → English full name. */
let people: Map<string, string> | null = null;
function peopleEn(): Map<string, string> {
  if (people) return people; people = new Map();
  for (const f of [...FIRST_M, ...FIRST_F]) { people.set(f[1], f[0]); for (const l of LAST) people.set(`${f[1]} ${l[1]}`, `${f[0]} ${l[0]}`); }
  for (const c of CITIES) people.set(c[1], c[0]);
  return people;
}
export const hrSampleEn = (v: string): string | undefined => {
  build(); const hit = toEn.get(v) ?? peopleEn().get(v); if (hit) return hit;
  const m = DEPT_SUFFIX.exec(v); const base = m ? toEn.get(m[1]!) : undefined; return base ? `${base} - ${m![2]}` : undefined;
};
let done = false;
export function registerHrSampleNames(): void { if (done) return; done = true; addSampleNameResolver(hrSampleAr); addSampleNameResolverEn(hrSampleEn); }
