/**
 * Owner notes X-01: English display of DIGIT CRM's Arabic sample values on English screens (display only, exact match).
 * Sources: each sample record's own `__name_en` alternates (leads, contacts, organizations, campaigns, deals), the seed
 * name maps (seedNameEn) and the CRM sample titles below; a value a user typed never matches, so it shows as typed.
 */
import { addSampleNameResolver, addSampleNameResolverEn } from "@/i18n";
import { adapter } from "@/lib/adapter";
import { arabicDisplay, seedNameEn } from "@/lib/seedNamesAr";

const s = (v: unknown) => String(v ?? "").trim();
/** CRM sample titles stored only in Arabic (tasks, notes) — their English wording. */
const TITLES_EN: Record<string, string> = {
  "إرسال الملف التعريفي": "Send company profile", "إرسال عرض مبدئي": "Send initial offer",
  "تمت مناقشة نطاق التوريد والجدول الزمني": "Supply scope and timeline discussed", "العميل يطلب خصمًا على الكميات": "Customer asks for a volume discount",
  "مدير المشتريات": "Procurement Manager", "المدير المالي": "Finance Manager", "مدير المشاريع": "Projects Manager",
  "تم إرسال العرض الفني والمالي": "Technical and commercial offer sent", "اجتماع مع لجنة المشتريات": "Meeting with the procurement committee", "طلب العميل زيارة موقع": "Customer requested a site visit",
};
const DTS = ["CRM Lead", "CRM Deal", "Contact", "CRM Organization", "Campaign", "Sales Person", "Employee"];
let ver = -1; let map = new Map<string, string>();
function build() {
  if (ver === adapter.version()) return map;
  const m = new Map<string, string>(Object.entries(TITLES_EN));
  for (const dt of DTS) for (const d of adapter.list(dt)) {
    const en = d["__name_en"] as Record<string, unknown> | undefined; if (!en || typeof en !== "object") continue;
    for (const [k, v] of Object.entries(en)) { const ar = s(d[k]), e = s(v); if (ar && e && ar !== e && !m.has(ar)) m.set(ar, e); }
    const fa = [s(d["first_name"]), s(d["last_name"])].filter(Boolean).join(" "), fe = [s(en["first_name"]), s(en["last_name"])].filter(Boolean).join(" ");
    if (fa && fe && fa !== fe && !m.has(fa)) m.set(fa, fe);
  }
  map = m; ver = adapter.version(); return map;
}
export function crmSampleEn(v: string): string | undefined { return build().get(v) ?? seedNameEn(v); }
let done = false;
/** Arabic screens: the English full names stored on the preview's own sample people (demo users, salespeople, leads,
 *  contacts, employees) shown in Arabic from the seed name maps; only names read from sample records are listed, so a
 *  person a user typed is shown as typed (owner closing round CR-01..03: no English names on Arabic screens). */
const PEOPLE: [dt: string, fields: string[]][] = [["User", ["full_name"]], ["Sales Person", ["sales_person_name"]], ["Lead", ["lead_name"]], ["CRM Lead", ["lead_name"]], ["Contact", ["full_name"]], ["Employee", ["employee_name"]]];
const SEEDED = /@(digit|ddt\.example|synthetic\.example|fsm\.example)\.test$/;
let verAr = -1; let mapAr = new Map<string, string>();
function buildAr() {
  if (verAr === adapter.version()) return mapAr;
  const m = new Map<string, string>();
  for (const [dt, fields] of PEOPLE) for (const d of adapter.list(dt)) {
    if (!(d["__synthetic"] || d["__sample"] || d["__demo"] || (dt === "User" && SEEDED.test(d.name)))) continue;
    for (const f of fields) { const v = s(d[f]); if (!v || !/^[A-Za-z]/.test(v) || m.has(v)) continue; const ar = arabicDisplay(v); if (ar) m.set(v, ar); }
  }
  mapAr = m; verAr = adapter.version(); return mapAr;
}
export function crmSampleAr(v: string): string | undefined { return buildAr().get(v); }
export function registerCrmSampleNamesEn() { if (done) return; done = true; addSampleNameResolverEn(crmSampleEn); addSampleNameResolver(crmSampleAr); }
