/**
 * DIGIT Construction — rich sample layer (owner 2026-10-19). Six more fictional DCC projects run the same chains as the
 * connected demo (tender → estimate → BOQ → contract → monthly claims → certificates → sales invoices → collections,
 * subcontract work orders → measurement books → bills → purchase invoices, material POs → receipts → invoices, budgets,
 * tasks, site diaries, machinery, crews, petty cash, cash-flow forecasts) plus a tender pipeline.
 * Runs inside the Core volume layer (src/lib/volume): memory only, never saved, insert-if-missing, and every app
 * document goes through the same controller hooks (computeDoc) while ledgers come only from posting.ts.
 */
import { adapter, type Doc } from "@/lib/adapter";
import type { VolumeContext } from "@/lib/volume";
import { asSystem } from "./domain/data";
import { computeDoc } from "./domain/hooks";
import { lineAmount, r2 } from "./domain/calc";
import { DEMO_COMPANY } from "./seed";
import { PROJECT_COMPANY_TYPES } from "./domain/companyScope";
import { materialBudget, portfolioActivity, portfolioMasters, subFor, type ProjectFacts } from "./demoPortfolio";
import { freshenPendingApprovals } from "./demoPending";

type Row = Record<string, unknown>;
const A = "DCC";
const C = DEMO_COMPANY;
const acct = (n: string) => `${n} - ${A}`;
const WH = `المستودع المركزي - ${A}`;
const CUTOFF = "2026-11-12"; // demo as-of date (owner round 2026-11-14: history June 2025 → November 2026)
const iso = (d: string) => `${d} 09:00:00`;
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const monthEnd = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); // m = 1..12
const days = (a: string, b: string) => (Date.parse(b) - Date.parse(a)) / 86400000;
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const pad = (n: number, w = 2) => String(n).padStart(w, "0");

/** BOQ line: code, description, uom, qty, cost rate, selling rate, cost code, phase window (share of overall progress). */
type L = [code: string, desc: string, uom: string, qty: number, cost: number, sell: number, cc: string, from: number, to: number];
const TPL: Record<string, L[]> = {
  tower: [["01.01", "أعمال الحفر والردم", "m³", 5200, 27, 34, "CC-01.01", 0, 0.12], ["02.01", "خرسانة مسلحة للأساسات", "m³", 1400, 815, 975, "CC-02.01", 0.06, 0.25], ["02.02", "خرسانة مسلحة للأعمدة والأسقف", "m³", 3100, 895, 1075, "CC-02.02", 0.18, 0.62],
    ["03.01", "جدران بلوك 20 سم", "m²", 9400, 61, 77, "CC-03.01", 0.4, 0.82], ["04.01", "أعمال كهروميكانيكية", "LS", 1, 1850000, 2190000, "CC-04.01", 0.3, 1], ["05.01", "لياسة ودهان", "m²", 11000, 37, 47, "CC-05.01", 0.65, 1]],
  warehouse: [["01.01", "تسوية وأعمال ترابية", "m³", 14000, 24, 30, "CC-01.01", 0, 0.15], ["02.01", "أرضيات خرسانية صناعية", "m²", 21000, 140, 168, "CC-02.01", 0.1, 0.55], ["08.01", "هيكل معدني للمستودعات", "Ton", 720, 6800, 7900, "CC-08.01", 0.3, 0.8],
    ["04.01", "أعمال كهروميكانيكية", "LS", 1, 980000, 1160000, "CC-04.01", 0.45, 1], ["07.01", "طرق وساحات خارجية", "m²", 9000, 62, 78, "CC-07.01", 0.75, 1]],
  villas: [["01.01", "البنية التحتية والحفر", "m³", 4100, 29, 36, "CC-01.01", 0, 0.14], ["02.01", "أساسات الفلل", "m³", 1050, 825, 985, "CC-02.01", 0.07, 0.3], ["02.02", "هياكل الفلل", "m³", 1900, 905, 1085, "CC-02.02", 0.2, 0.6],
    ["03.01", "جدران البلوك", "m²", 11200, 59, 75, "CC-03.01", 0.4, 0.78], ["06.01", "تشطيبات داخلية", "m²", 10400, 118, 148, "CC-06.01", 0.6, 1], ["07.01", "أعمال خارجية وتنسيق", "m²", 6200, 54, 69, "CC-07.01", 0.82, 1]],
  school: [["01.01", "أعمال الموقع العام", "m³", 2300, 30, 38, "CC-01.01", 0, 0.12], ["02.01", "الهيكل الخرساني", "m³", 1750, 875, 1045, "CC-02.01", 0.08, 0.5], ["03.01", "جدران وقواطع", "m²", 6400, 63, 79, "CC-03.01", 0.35, 0.75],
    ["06.01", "تشطيبات المدرسة", "m²", 7300, 113, 140, "CC-06.01", 0.55, 1], ["07.01", "ملاعب وأعمال خارجية", "m²", 5100, 53, 68, "CC-07.01", 0.8, 1]],
  hospital: [["01.01", "أعمال الحفر والسند", "m³", 6100, 32, 40, "CC-01.01", 0, 0.12], ["02.01", "خرسانة الأساسات واللبشة", "m³", 1900, 840, 1005, "CC-02.01", 0.06, 0.28], ["02.02", "الهيكل الخرساني", "m³", 3600, 920, 1100, "CC-02.02", 0.2, 0.6],
    ["04.01", "أنظمة كهروميكانيكية طبية", "LS", 1, 4200000, 4950000, "CC-04.01", 0.3, 1], ["06.01", "تشطيبات طبية", "m²", 9800, 305, 368, "CC-06.01", 0.62, 1]],
  office: [["01.01", "أعمال الحفر والردم", "m³", 3800, 28, 35, "CC-01.01", 0, 0.14], ["02.01", "خرسانة الأساسات", "m³", 980, 830, 990, "CC-02.01", 0.07, 0.3], ["02.02", "خرسانة الهيكل", "m³", 2200, 900, 1080, "CC-02.02", 0.2, 0.62],
    ["03.01", "جدران بلوك", "m²", 7200, 62, 78, "CC-03.01", 0.42, 0.82], ["09.01", "واجهات زجاجية", "m²", 4600, 410, 495, "CC-09.01", 0.7, 1]],
  // owner round 2026-11-14: infrastructure, MEP, fit-out and road projects
  infra: [["01.01", "حفر خنادق الشبكات والردم", "m³", 38000, 22, 28, "CC-01.01", 0, 0.7], ["11.01", "توريد وتمديد مواسير مياه HDPE", "m", 24000, 145, 178, "CC-11.01", 0.05, 0.8],
    ["11.02", "مواسير صرف صحي GRP وغرف تفتيش", "m", 18000, 260, 318, "CC-11.02", 0.1, 0.85], ["11.03", "توصيلات منزلية للمياه والصرف", "Nos", 1400, 1450, 1780, "CC-11.01", 0.3, 0.95],
    ["10.01", "إعادة السفلتة فوق الخنادق", "m²", 52000, 48, 59, "CC-10.01", 0.4, 1]],
  mep: [["04.02", "مجاري هواء معزولة", "m²", 16000, 165, 198, "CC-04.02", 0, 0.75], ["04.05", "وحدات مناولة هواء ووحدات ملف مروحة", "Nos", 420, 6800, 8100, "CC-04.02", 0.2, 0.9],
    ["04.03", "تمديدات السباكة ومكافحة الحريق", "m", 21000, 92, 112, "CC-04.03", 0.05, 0.85], ["04.04", "كابلات وتمديدات الجهد المنخفض", "m", 64000, 38, 46, "CC-04.04", 0.1, 0.9],
    ["04.06", "لوحات التوزيع ووحدات الإنارة", "Nos", 1900, 1250, 1510, "CC-04.04", 0.35, 1], ["04.07", "الاختبار والتشغيل", "LS", 1, 950000, 1150000, "CC-04.01", 0.8, 1]],
  // fit-out priced close to cost (the low-margin project the dashboards flag)
  fitout: [["06.02", "أسقف مستعارة وقواطع جبسية", "m²", 14000, 118, 124, "CC-06.02", 0, 0.6], ["06.01", "أرضيات بورسلان ورخام", "m²", 11500, 205, 214, "CC-06.01", 0.15, 0.75],
    ["05.01", "دهانات داخلية", "m²", 38000, 24, 25.5, "CC-05.01", 0.3, 0.9], ["06.03", "أعمال نجارة وأبواب", "Nos", 620, 2900, 3020, "CC-06.03", 0.4, 1],
    ["09.01", "واجهات وقواطع زجاجية داخلية", "m²", 2600, 520, 545, "CC-09.01", 0.5, 1], ["04.04", "تمديدات كهربائية للمكاتب", "m²", 16000, 68, 71, "CC-04.04", 0.1, 0.85]],
  road: [["01.01", "أعمال الحفر والردم والتسوية", "m³", 125000, 14, 18, "CC-01.01", 0, 0.4], ["10.02", "طبقة الأساس والأساس المساعد", "m²", 96000, 38, 47, "CC-10.02", 0.15, 0.6],
    ["10.01", "خلطة إسفلتية — طبقتان", "m²", 96000, 72, 88, "CC-10.01", 0.35, 0.85], ["10.04", "عبارات وتصريف مياه السيول", "m", 3200, 1850, 2240, "CC-11.02", 0.1, 0.7],
    ["10.03", "أرصفة وبردورات وعلامات طرق", "m", 14000, 95, 118, "CC-10.03", 0.6, 1], ["10.05", "إنارة الطريق", "Nos", 420, 7400, 8950, "CC-04.04", 0.55, 1]],
};
/** Zone / floor / chainage labels a template's detailed BOQ items are split over (one detailed item per section × zone). */
const ZONES: Record<string, string[]> = {
  tower: ["القبو الثاني", "القبو الأول", "الأرضي", "الميزانين", ...Array.from({ length: 24 }, (_, i) => `الدور ${i + 1}`), "السطح"],
  warehouse: Array.from({ length: 12 }, (_, i) => `المستودع ${i + 1}`),
  villas: [...Array.from({ length: 24 }, (_, i) => `فيلا A-${String(i + 1).padStart(2, "0")}`), ...Array.from({ length: 16 }, (_, i) => `فيلا B-${String(i + 1).padStart(2, "0")}`)],
  school: ["المبنى A", "المبنى B", "المبنى C", "الصالة الرياضية", "المصلى", "الملاعب", "السور والبوابات"],
  hospital: ["الجناح A", "الجناح B", "الجناح C", "مبنى الطوارئ"].flatMap((w) => ["القبو", "الأرضي", ...Array.from({ length: 6 }, (_, i) => `الدور ${i + 1}`)].map((f) => `${w} — ${f}`)),
  office: ["الأرضي", ...Array.from({ length: 12 }, (_, i) => `الدور ${i + 1}`)].flatMap((f) => [`${f} — الجناح الشرقي`, `${f} — الجناح الغربي`]),
  infra: Array.from({ length: 40 }, (_, i) => `القطاع ${i + 1} — حي الياقوت`),
  mep: ["القبو", "الأرضي", "الميزانين", ...Array.from({ length: 16 }, (_, i) => `الدور ${i + 1}`), "السطح"].flatMap((f) => [`${f} — الجناح الشمالي`, `${f} — الجناح الجنوبي`]),
  fitout: ["الأرضي", ...Array.from({ length: 12 }, (_, i) => `الدور ${i + 1}`)].flatMap((f) => [`${f} — المكاتب`, `${f} — الخدمات`]),
  road: Array.from({ length: 48 }, (_, i) => `كم ${Math.floor(i / 4)}+${String((i % 4) * 250).padStart(3, "0")}`),
};
const CC_LABEL: Record<string, [string, string]> = {
  "CC-01.01": ["الحفر والأعمال الترابية", "Subcontract"], "CC-02.01": ["خرسانة الأساسات", "Material"], "CC-02.02": ["خرسانة الهيكل", "Material"], "CC-03.01": ["البلوك", "Subcontract"],
  "CC-04.01": ["الكهروميكانيك", "Subcontract"], "CC-05.01": ["اللياسة والدهان", "Subcontract"], "CC-06.01": ["التشطيبات", "Subcontract"], "CC-07.01": ["الأعمال الخارجية", "Subcontract"],
  "CC-08.01": ["الهيكل المعدني", "Material"], "CC-09.01": ["الواجهات", "Subcontract"], "CC-90": ["مصاريف الموقع العامة", "Overhead"],
  "CC-04.02": ["التكييف والتهوية", "Subcontract"], "CC-04.03": ["السباكة ومكافحة الحريق", "Subcontract"], "CC-04.04": ["الكهرباء والجهد المنخفض", "Subcontract"],
  "CC-06.02": ["الأسقف والقواطع", "Subcontract"], "CC-06.03": ["النجارة والأبواب", "Subcontract"], "CC-10.01": ["الأسفلت", "Subcontract"], "CC-10.02": ["طبقات الأساس", "Material"],
  "CC-10.03": ["الأرصفة وأثاث الطريق", "Subcontract"], "CC-11.01": ["شبكات المياه", "Subcontract"], "CC-11.02": ["شبكات الصرف والتصريف", "Subcontract"],
};

interface VP { id: string; title: string; en: string; city: string; cust: string; pm: string; site: string; start: string; end: string; pct: number; tpl: keyof typeof TPL; type: string; priority: string; done?: boolean;
  /** detailed BOQ items (owner round 2026-11-14: 150–400 lines per generated project) */ boq: number;
  /** on hold since this date (progress frozen, no claims after it) */ hold?: string;
  /** works complete, contract in closeout (final account, retention and closeout checks open) */ closeout?: boolean }
// owner round 2026-11-14: one portfolio covering every state — with the connected demo A (building), B (villas) and C (closed with
// a final account): 7 active (A, B, V02 infrastructure, V03 MEP, V05 hospital, V06 fit-out, V07 road), V01 on hold, V04 in closeout,
// plus the two tender projects of demoPortfolio.ts (won / lost).
const PROJECTS: VP[] = [
  { id: "V01", title: "برج الريان السكني", en: "Al-Rayyan Residential Tower", city: "الرياض", cust: `${A}-CUST-01`, pm: `${A}-EMP-001`, site: `${A}-EMP-003`, start: "2025-06-15", end: "2027-03-31", pct: 41, tpl: "tower", type: "Lump Sum", priority: "Medium", boq: 320, hold: "2026-08-20" },
  { id: "V02", title: "شبكات المياه والصرف — حي الياقوت", en: "Al-Yaqout District Water & Sewer Networks", city: "الدمام", cust: `${A}-CUST-04`, pm: `${A}-EMP-004`, site: `${A}-EMP-006`, start: "2026-01-15", end: "2027-01-31", pct: 61, tpl: "infra", type: "Re-measured", priority: "High", boq: 190 },
  { id: "V03", title: "الأعمال الكهروميكانيكية — فندق الشاطئ", en: "Al-Shati Hotel MEP Works", city: "جدة", cust: `${A}-CUST-02`, pm: `${A}-EMP-004`, site: `${A}-EMP-006`, start: "2025-09-01", end: "2026-12-31", pct: 78, tpl: "mep", type: "Lump Sum", priority: "Medium", boq: 260 },
  { id: "V04", title: "مدرسة رواد الدمام — المرحلة الثانية", en: "Ruwad Dammam School — Phase 2", city: "الدمام", cust: `${A}-CUST-03`, pm: `${A}-EMP-001`, site: `${A}-EMP-003`, start: "2025-06-01", end: "2026-08-31", pct: 100, tpl: "school", type: "Lump Sum", priority: "Low", done: true, closeout: true, boq: 160 },
  { id: "V05", title: "مركز الخبر الطبي التخصصي", en: "Al-Khobar Specialist Medical Center", city: "الخبر", cust: `${A}-V-CUST-05`, pm: `${A}-EMP-001`, site: `${A}-EMP-003`, start: "2026-04-01", end: "2027-08-31", pct: 27, tpl: "hospital", type: "Lump Sum", priority: "High", boq: 380 },
  { id: "V06", title: "تشطيبات مقر أم القرى الإداري", en: "Umm Al-Qura Head Office Fit-out", city: "مكة المكرمة", cust: `${A}-V-CUST-06`, pm: `${A}-EMP-004`, site: `${A}-EMP-006`, start: "2026-05-15", end: "2027-02-28", pct: 34, tpl: "fitout", type: "Re-measured", priority: "Medium", boq: 170 },
  { id: "V07", title: "طريق الوصول إلى المنطقة اللوجستية — أبها", en: "Abha Logistics Zone Access Road", city: "أبها", cust: `${A}-CUST-04`, pm: `${A}-EMP-001`, site: `${A}-EMP-003`, start: "2026-02-01", end: "2027-04-30", pct: 46, tpl: "road", type: "Re-measured", priority: "High", boq: 230 },
];
/** Certificates with special outcomes (owner round 2026-11-14): partial approval, disputed and deferred lines. Key = project-certificate no. */
const CERT_CASE: Record<string, "partial" | "disputed" | "deferred"> = { "V03-3": "partial", "V06-2": "partial", "V05-2": "disputed", "V02-4": "disputed", "V07-3": "deferred" };
const CASE_REASON = { partial: "كمية غير مثبتة بالقياس المشترك — تُعاد في المطالبة التالية", disputed: "خلاف على التصنيف — يرى الاستشاري أن البند مشمول في السعر", deferred: "مؤجل للشهادة التالية — بانتظار نتائج اختبار الكثافة" } as const;
/** Detailed BOQ: each section line split over the template's zones (quantities and amounts sum to the section; each item has its own
 * window inside the section's window, so progress moves zone by zone). `par[i]` is the section index of item i. */
function expandBoq(p: VP, parents: L[]): { lines: L[]; par: number[] } {
  const zones = ZONES[p.tpl] ?? ["المنطقة 1"]; const total = parents.reduce((s, l) => s + l[3] * l[5], 0);
  const lines: L[] = []; const par: number[] = [];
  parents.forEach((l, pi) => {
    const share = (l[3] * l[5]) / total; const k = Math.max(4, Math.min(zones.length * 3, Math.round(p.boq * (0.5 / parents.length + 0.5 * share))));
    const w = Array.from({ length: k }, (_, j) => 0.75 + (((j * 37 + pi * 11 + p.id.charCodeAt(2)) % 50) / 100)); const ws = w.reduce((a, b) => a + b, 0);
    const span = l[8] - l[7];
    const spec = ["", " — نوع أ", " — نوع ب"];
    for (let j = 0; j < k; j++) {
      const z = zones[j % zones.length]!; const sp = spec[Math.floor(j / zones.length) % spec.length]!;
      const qty = l[2] === "LS" ? 1 : Math.max(1, Math.round((l[3] * w[j]!) / ws));
      const rf = l[2] === "LS" ? w[j]! / ws : 1 + (((j * 13 + pi) % 9) - 4) / 100; // ±4% rate spread, LS split by weight
      const from = l[7] + span * 0.7 * (j / k), to = Math.min(l[8], from + span * (0.3 + 0.7 / k));
      lines.push([`${l[0]}.${String(j + 1).padStart(3, "0")}`, `${l[1]}${sp} — ${z}`, l[2], qty, r2(l[4] * rf), r2(l[5] * rf), l[6], r2(from), r2(to)]);
      par.push(pi);
    }
  });
  return { lines, par };
}

const NEW_CUSTOMERS: [string, string, string, string][] = [
  [`${A}-V-CUST-05`, "شركة الرعاية المتقدمة الطبية", "Advanced Care Medical Co.", "الخبر"],
  [`${A}-V-CUST-06`, "شركة أم القرى للاستثمار العقاري", "Umm Al-Qura Real Estate Investment", "مكة المكرمة"],
];
const SUP = { steel: [`${A}-SUP-STEEL`, "مصنع الصلب الوطني"], rmc: [`${A}-SUP-RMC`, "شركة الخرسانة الحديثة"], block: [`${A}-SUB-BLOCK`, "مؤسسة البناء المتين للمقاولات"], mep: [`${A}-SUB-MEP`, "شركة الطاقة المتكاملة للأعمال الكهروميكانيكية"], fin: [`${A}-SUB-FIN`, "مؤسسة اللمسة الأخيرة للتشطيبات"] } as const;

/** Overall completed share (0..1) of a project at a date (S-curve to `pct` at the cutoff, or to 1 at the end date for closed projects). */
function overall(p: VP, d: string): number {
  const endRef = p.done ? p.end : p.hold ?? CUTOFF;
  const t = clamp01(days(p.start, p.hold && d > p.hold ? p.hold : d) / Math.max(1, days(p.start, endRef)));
  const s = t * t * (3 - 2 * t); // smoothstep
  return (p.done ? 1 : p.pct / 100) * s;
}
const lineFrac = (l: L, f: number) => clamp01((f - l[7]) / (l[8] - l[7]));
const cumQty = (l: L, f: number) => (l[2] === "LS" ? Math.round(lineFrac(l, f) * 100) / 100 : Math.round(l[3] * lineFrac(l, f)));

export function constructionVolume(ctx: VolumeContext): void {
  if (!adapter.get("Company", C) || !adapter.get("Customer", `${A}-CUST-01`)) return; // connected demo not installed
  asSystem(() => {
    // every project-linked app document carries the project's company (companyScope rule), set up front
    const put = (dt: string, name: string, data: Row) => ctx.put(dt, name, { owner: "Administrator", creation: iso("2026-10-01"), ...(PROJECT_COMPANY_TYPES[dt] && !data["company"] ? { company: C } : {}), ...data, __plugin: "digit_construction" });
    const putC = (dt: string, name: string, data: Row, final: Row = {}) => {
      if (adapter.get(dt, name)) return false;
      const res = computeDoc(dt, { ...data, name, doctype: dt, owner: String(data["owner"] ?? "Administrator") } as Doc);
      if (res.errors?.length && import.meta.env?.DEV) console.warn(`[construction volume] ${dt} ${name}:`, res.errors);
      return put(dt, name, { ...res.doc, ...final });
    };
    const re = (dt: string, name: string, patch: Row) => { const d = adapter.get(dt, name); if (d && d["__sample"]) adapter.insertDocQuiet(dt, { ...d, ...patch }); };

    portfolioMasters({ put, putC, re, voucher: ctx.voucher });
    const facts: ProjectFacts[] = [];
    for (const [id, name, en, city] of NEW_CUSTOMERS) put("Customer", id, { customer_name: name, digit_customer_name_en: en, customer_type: "Company", customer_group: "Commercial", territory: "Saudi Arabia", default_currency: "SAR", tax_id: `31000000${id.slice(-2)}0003`, __city: city });
    const custName = (id: string) => String(adapter.get("Customer", id)?.["customer_name"] ?? id);
    let sinv = 0, pinv = 0, pe = 0, po = 0;

    for (const p of PROJECTS) {
      const parents = TPL[p.tpl]!; const { lines, par } = expandBoq(p, parents);
      const prj = `${A}-${p.id}-PRJ`, tender = `TND-2026-${p.id}`, est = `EST-2026-${p.id}`, boq = `BOQ-2026-${p.id}`, cc = `CC-2026-${p.id}`, bud = `BUD-2026-${p.id}`;
      const lk = (code: string) => `${p.id}-${code}`;
      const sk = (code: string) => `B-${p.id}-${code}`;
      const value = lines.reduce((s, l) => s + l[3] * l[5], 0);
      const cost = lines.reduce((s, l) => s + l[3] * l[4], 0);
      const award = addDays(p.start, -40);
      const fNow = overall(p, CUTOFF);

      // ---------------- pre-contract
      putC("Digit Tender", tender, { title: p.title, customer: p.cust, company: C, project: prj, issuing_body: custName(p.cust), tender_reference: `RFP-${p.id}-2025`, submission_deadline: addDays(award, -30), status: "Won", currency: "SAR", margin_percent: 15,
        emd_amount: Math.round(value * 0.01 / 1000) * 1000, emd_valid_until: addDays(award, 60), performance_guarantee_percent: 5, approved_estimate: est, boq, owner: "estimator@dcc.test", creation: iso(addDays(award, -60)),
        items: lines.map(([code, desc, uom, qty], i) => ({ idx: i + 1, item_key: lk(code), code, description: desc, uom, qty })) }, { est_cost: cost, est_selling: value });
      // first pricing (rates 4% higher), returned and superseded by the approved version 2
      putC("Digit Estimate Version", `${est}-V1`, { tender, project: prj, company: C, version: 1, currency: "SAR", workflow_state: "Superseded", docstatus: 1, submitted_on: addDays(award, -52), owner: "estimator@dcc.test", creation: iso(addDays(award, -55)),
        revision_reason: "التسعير الأول قبل مراجعة أسعار الموردين", lines: lines.map(([code, desc, uom, qty, c0, s0], i) => ({ idx: i + 1, line_key: lk(code), tender_item: lk(code), code, description: desc, uom, qty, cost_rate: r2(c0 * 1.04), selling_rate: r2(s0 * 1.04) })) }, { workflow_state: "Superseded" });
      putC("Digit Estimate Version", est, { tender, project: prj, company: C, version: 2, base_version: `${est}-V1`, revision_reason: "تحديث أسعار الحديد والخرسانة وفق عروض الموردين", currency: "SAR", workflow_state: "Approved", docstatus: 1, approved_by: "director@dcc.test", approved_on: addDays(award, -35), owner: "estimator@dcc.test", creation: iso(addDays(award, -50)),
        lines: lines.map(([code, desc, uom, qty, c0, s0], i) => ({ idx: i + 1, line_key: lk(code), tender_item: lk(code), code, description: desc, uom, qty, cost_rate: c0, selling_rate: s0 })) }, { approved_by: "director@dcc.test", approved_on: addDays(award, -35) });
      putC("Digit BOQ", boq, { title: `${p.title} — جدول الكميات`, project: prj, company: C, tender, estimate_version: est, revision: 0, workflow_state: "Approved", docstatus: 1, currency: "SAR", approved_by: "pm@dcc.test", approved_on: addDays(award, 10), owner: "qs@dcc.test", creation: iso(award),
        groups: [...new Set(lines.map((l) => l[0].split(".")[0]!))].map((g, i) => ({ idx: i + 1, group_code: g, description: `القسم ${g}` })),
        items: lines.map(([code, desc, uom, qty, , s0, ccode], i) => ({ idx: i + 1, line_key: sk(code), group_code: code.split(".")[0], code, description: desc, uom, qty, rate: s0, source_estimate_line: lk(code), cost_code: ccode })) }, { approved_by: "pm@dcc.test", approved_on: addDays(award, 10) });
      putC("Digit Client Contract", cc, { title: `عقد ${p.title}`, project: prj, customer: p.cust, company: C, reference: `CTR-${p.id}-001`, boq, currency: "SAR", start_date: p.start, end_date: p.end, payment_days: p.id === "V02" || p.id === "V07" ? 45 : 30, taxes_and_charges: `KSA VAT 15% - ${A}`,
        ...(p.id === "V02" || p.id === "V07" ? { terms_revisions: [{ idx: 1, term: "payment_days", from_value: "30", to_value: "45", status: "Approved", requested_by: "qs@dcc.test", decided_by: "director@dcc.test", decided_on: addDays(p.start, 20), reason: "طلب العميل تمديد مدة السداد مقابل تقليل الدفعة المقدمة", effective_date: addDays(p.start, 30), applied: 1 }] } : {}),
        advance_amount: Math.round(value * 0.1 / 1000) * 1000, advance_recovery_pct: 10, retention_pct: 10, retention_cap_pct: 5, workflow_state: "Active", owner: "qs@dcc.test", creation: iso(addDays(award, 20)),
        sov_lines: lines.map(([code, desc, uom, qty, , s0], i) => ({ idx: i + 1, line_key: sk(code), boq_item: sk(code), description: desc, uom, qty, rate: s0, origin: "Contract" })) });

      // ---------------- project, team, packages, tasks
      const m = (idx: number, employee: string, project_role: string, user: string | undefined) => ({ idx, employee, project_role, ...(user ? { user } : {}), from_date: p.start, ...(p.done ? { to_date: p.end } : {}), responsibility: "Whole Project", is_primary: 1 });
      put("Project", prj, { naming_series: "PROJ-.####", project_name: p.title.includes(p.city) ? p.title : `${p.title} — ${p.city}`, digit_name_en: p.en, digit_city: p.city, digit_contract_type: p.type, digit_project_manager: p.pm, status: p.hold ? "On hold" : p.done && !p.closeout ? "Completed" : "Open", is_active: p.done && !p.closeout ? "No" : "Yes", company: C, customer: p.cust,
        expected_start_date: p.start, expected_end_date: p.end, actual_start_date: p.start, ...(p.done ? { actual_end_date: p.end } : {}), percent_complete_method: "Manual", percent_complete: p.done ? 100 : p.pct, priority: p.priority, cost_center: acct("Projects"), estimated_costing: cost,
        digit_team: [m(1, p.pm, "Project Manager", "pm@dcc.test"), m(2, `${A}-EMP-002`, "QS", "qs@dcc.test"), m(3, p.site, "Site Engineer", "site@dcc.test"), m(4, `${A}-EMP-005`, "Accountant", "finance@dcc.test"), m(5, `${A}-EMP-008`, "Procurement", "procurement@dcc.test"), m(6, `${A}-EMP-078`, "Safety", "site@dcc.test")], creation: iso(p.start) });
      const span = days(p.start, p.end);
      const at = (f: number) => addDays(p.start, Math.round(span * f));
      const wps: [string, string, number, number][] = [["WP-01", "الأعمال الإنشائية", 0, 0.62], ["WP-02", "الغلاف والأعمال الكهروميكانيكية", 0.3, 1], ["WP-03", "التشطيبات والأعمال الخارجية", 0.6, 1]];
      wps.forEach(([code, title, a, b], i) => {
        const s = at(a * 0.95), e = at(b), f = clamp01((fNow - a) / (b - a));
        putC("Digit Work Package", `WP-${p.id}-${i + 1}`, { project: prj, company: C, code, work_package_name: title, status: f >= 1 ? "Completed" : f > 0 ? "In Progress" : "Not Started", start_date: s, end_date: e, owner: "pm@dcc.test" });
      });
      parents.forEach((l, i) => {
        const prog = Math.round(lineFrac(l, fNow) * 100);
        const s = at(l[7] * 0.95), e = at(Math.min(1, l[8] * 0.98));
        const status = prog >= 100 ? "Completed" : prog > 0 ? (e < CUTOFF ? "Overdue" : "Working") : "Open";
        const wp = l[8] <= 0.62 ? 1 : l[7] >= 0.6 ? 3 : 2;
        put("Task", `${A}-TASK-${p.id}-${pad(i + 1)}`, { subject: l[1], project: prj, company: C, status, priority: "Medium", exp_start_date: s, exp_end_date: e, progress: prog, digit_work_package: `WP-${p.id}-${wp}`, digit_wbs_code: `${wp}.${i + 1}`, is_group: 0,
          ...(status === "Completed" ? { completed_on: e, act_end_date: e } : {}), creation: iso(s) });
      });
      const task = (i: number) => `${A}-TASK-${p.id}-${pad(i + 1)}`;
      const working = parents.map((l, i) => [l, i] as const).filter(([l]) => { const f = lineFrac(l, fNow); return f > 0 && f < 1; }).map(([, i]) => i);

      // ---------------- budget
      const byCC = new Map<string, number>();
      for (const l of lines) byCC.set(l[6], (byCC.get(l[6]) ?? 0) + l[3] * l[4] * 1.03);
      byCC.set("CC-90", Math.round(cost * 0.04));
      // direct material purchases of the template (demoPortfolio.ts) get their own Material lines (cost code + category unique)
      const matLines: [string, number][] = [];
      for (const mb of materialBudget(p.tpl)) {
        if ((CC_LABEL[mb.cc]?.[1] ?? "") === "Material" && byCC.has(mb.cc)) { byCC.set(mb.cc, byCC.get(mb.cc)! + mb.amount); continue; }
        const at0 = matLines.find((x) => x[0] === mb.cc); if (at0) at0[1] += mb.amount; else matLines.push([mb.cc, mb.amount]);
      }
      putC("Digit Project Cost Budget", bud, { project: prj, company: C, version: 1, source_boq: boq, workflow_state: "Approved", docstatus: 0, effective_date: p.start, approved_by: "director@dcc.test", approved_on: p.start, owner: "qs@dcc.test",
        lines: [...[...byCC.entries()].map(([code, amt]) => ({ line_key: `${p.id}-${code}`, cost_code: code, description: CC_LABEL[code]?.[0] ?? code, category: CC_LABEL[code]?.[1] ?? "Material", original_amount: Math.round(amt) })),
          ...matLines.map(([code, amt]) => ({ line_key: `${p.id}-${code}-M`, cost_code: code, description: `${CC_LABEL[code]?.[0] ?? code} — مواد`, category: "Material", original_amount: amt }))].map((l, i) => ({ idx: i + 1, ...l })) }, { docstatus: 1, approved_by: "director@dcc.test", approved_on: p.start });

      // ---------------- monthly claims → certificates → invoices → collections
      const sY = Number(p.start.slice(0, 4)), sM = Number(p.start.slice(5, 7));
      const ends: string[] = [];
      for (let k = 1; k < 40; k++) {
        const y = sY + Math.floor((sM - 1 + k) / 12), mo = ((sM - 1 + k) % 12) + 1;
        const e = monthEnd(y, mo);
        if (e > (p.done ? p.end : p.hold ?? "2026-10-31")) break;
        if (k % (p.done ? 2 : 1) === 0 || !p.done) ends.push(e);
      }
      let claimNo = 0; const claimNames: string[] = [];
      let prevF = 0;
      for (const e of ends) {
        const f = overall(p, e);
        if (f - prevF < 0.02 && e !== ends[ends.length - 1]) continue;
        const cum = lines.map((l) => [sk(l[0]), cumQty(l, f)] as const).filter(([, q]) => q > 0);
        if (!cum.length) continue;
        prevF = f; claimNo++;
        const name = `CLM-2026-${p.id}-${pad(claimNo)}`;
        const isLast = e === ends[ends.length - 1] && !p.done && !p.hold;
        const final = isLast ? { workflow_state: "Submitted", docstatus: 1 } : { workflow_state: "Certified", docstatus: 1 };
        if (putC("Digit Client Claim", name, { contract: cc, claim_no: claimNo, period_end: e, claim_date: e, workflow_state: "Submitted", docstatus: 0, owner: "qs@dcc.test", creation: iso(e), lines: cum.map(([key, q], i) => ({ idx: i + 1, sov_line_key: key, cumulative_qty: q })) }, final)) claimNames.push(name);
      }
      const pooled: { si: string; rounded: number; paid: number; date: string }[] = [];
      const certifiable = claimNames.filter((n) => adapter.get("Digit Client Claim", n)?.["workflow_state"] === "Certified");
      certifiable.forEach((clName, i) => {
        const claim = adapter.get("Digit Client Claim", clName)!;
        const certName = `CERT-2026-${p.id}-${pad(i + 1)}`;
        const certDate = addDays(String(claim["period_end"]), 12);
        const special = CERT_CASE[`${p.id}-${i + 1}`];
        const ln = (claim["lines"] as Row[]).filter((l) => Number(l["this_period_qty"]) !== 0).map((l, j) => {
          const q = Number(l["this_period_qty"]);
          if (!special || j % 4 !== 1) return { sov_line_key: l["sov_line_key"], accepted_qty: q, rejected_qty: 0, disputed_qty: 0, reason: "" };
          const acc = special === "deferred" ? 0 : r2(q * (special === "partial" ? 0.8 : 0.7));
          return { sov_line_key: l["sov_line_key"], accepted_qty: acc, rejected_qty: special === "disputed" ? 0 : r2(q - acc), disputed_qty: special === "disputed" ? r2(q - acc) : 0, reason: CASE_REASON[special] };
        });
        if (!ln.length) return;
        re("Digit Client Claim", clName, { workflow_state: "Submitted" });
        const ok = putC("Digit Client Certificate", certName, { claim: clName, cert_date: certDate, workflow_state: "Draft", docstatus: 0, reviewer: "استشاري المشروع", owner: "qs@dcc.test", creation: iso(certDate), lines: ln }, { docstatus: 1, workflow_state: "Confirmed" });
        re("Digit Client Claim", clName, { workflow_state: special ? "Partly Certified" : "Certified" });
        if (!ok) return;
        const cert = adapter.get("Digit Client Certificate", certName)!;
        const net = Number(cert["net_certified"]); if (!(net > 0)) return;
        const date = addDays(certDate, 3), due = addDays(date, 30);
        const age = days(date, CUTOFF);
        const share = p.done ? (i === certifiable.length - 1 ? 0.7 : 1) : age > 75 ? 1 : age > 40 ? 0.5 : 0;
        // owner round 2026-11-14: one certificate invoiced in two parts (the client pays from two budget heads)
        const parts = p.id === "V03" && i === 1 ? [0.6, 0.4] : [1];
        parts.forEach((part, pi2) => {
          const pnet = pi2 === parts.length - 1 ? r2(net - parts.slice(0, -1).reduce((s0, x) => s0 + r2(net * x), 0)) : r2(net * part);
          const tax = r2(pnet * 0.15), grand = r2(pnet + tax), rounded = Math.round(grand);
          const paid = r2(rounded * share);
          const si = `${A}-${p.id}-SINV-${pad(i + 1)}${parts.length > 1 ? String.fromCharCode(65 + pi2) : ""}`;
          put("Sales Invoice", si, { naming_series: "ACC-SINV-.YYYY.-", customer: p.cust, customer_name: custName(p.cust), company: C, posting_date: date, due_date: due, project: prj, currency: "SAR", conversion_rate: 1, selling_price_list: "Standard Selling", price_list_currency: "SAR", plc_conversion_rate: 1,
            debit_to: acct("Debtors"), taxes_and_charges: `KSA VAT 15% - ${A}`, digit_client_certificate: certName, cost_center: acct("Projects"),
            ...(parts.length > 1 ? { remarks: `الجزء ${pi2 + 1} من ${parts.length} لشهادة ${certName} — حسب بند تمويل العميل` } : {}),
            items: [{ idx: 1, item_code: `${A}-SVC-WORKS`, item_name: "أعمال مقاولات حسب الشهادة", description: `Progress certificate ${certName} — net of advance recovery and retention${parts.length > 1 ? ` (part ${pi2 + 1} of ${parts.length})` : ""}`, qty: 1, uom: "Nos", stock_uom: "Nos", conversion_factor: 1, rate: pnet, amount: pnet, net_rate: pnet, net_amount: pnet, income_account: acct("Contract Revenue"), cost_center: acct("Projects"), project: prj }],
            taxes: [{ idx: 1, charge_type: "On Net Total", account_head: acct("VAT 15% Output"), description: "VAT 15%", rate: 15, net_amount: pnet, base_net_amount: pnet, tax_amount: tax, base_tax_amount: tax, total: grand, base_total: grand }],
            total: pnet, net_total: pnet, base_net_total: pnet, total_taxes_and_charges: tax, grand_total: grand, base_grand_total: grand, rounded_total: rounded, base_rounded_total: rounded, rounding_adjustment: r2(rounded - grand),
            outstanding_amount: r2(rounded - paid), status: paid >= rounded ? "Paid" : paid > 0 ? "Partly Paid" : due < CUTOFF ? "Overdue" : "Unpaid", docstatus: 1, creation: iso(date) });
          ctx.voucher("Sales Invoice", si); sinv++;
          if (pi2 === 0) re("Digit Client Certificate", certName, { sales_invoice: si, workflow_state: "Invoiced" });
          if (!(paid > 0)) return;
          // owner round 2026-11-14: one client receipt allocated to the first three invoices of V02
          if (p.id === "V02" && i < 3) { pooled.push({ si, rounded, paid, date }); if (i < 2) return;
            const pn = `${A}-V02-PE-R-ALLOC`; const pd = addDays(date, 28); const total = r2(pooled.reduce((s0, x) => s0 + x.paid, 0));
            put("Payment Entry", pn, { naming_series: "ACC-PAY-.YYYY.-", payment_type: "Receive", party_type: "Customer", party: p.cust, party_name: custName(p.cust), company: C, posting_date: pd > CUTOFF ? CUTOFF : pd,
              paid_from: acct("Debtors"), paid_to: acct("Al-Rajhi Demo Bank"), paid_amount: total, received_amount: total, mode_of_payment: "Bank Transfer", reference_no: "RCV-V02-ALLOC", reference_date: date, project: prj,
              remarks: "تحويل واحد من العميل موزع على ثلاث فواتير", references: pooled.map((x, k) => ({ idx: k + 1, reference_doctype: "Sales Invoice", reference_name: x.si, total_amount: x.rounded, outstanding_amount: x.rounded, allocated_amount: x.paid })), unallocated_amount: 0, status: "Submitted", docstatus: 1, creation: iso(date) });
            ctx.voucher("Payment Entry", pn); pe++; return;
          }
          const pn = `${A}-${p.id}-PE-R-${pad(i + 1)}${parts.length > 1 ? String.fromCharCode(65 + pi2) : ""}`; const pd = addDays(date, 28);
          put("Payment Entry", pn, { naming_series: "ACC-PAY-.YYYY.-", payment_type: "Receive", party_type: "Customer", party: p.cust, party_name: custName(p.cust), company: C, posting_date: pd > CUTOFF ? CUTOFF : pd,
            paid_from: acct("Debtors"), paid_to: acct("Al-Rajhi Demo Bank"), paid_amount: paid, received_amount: paid, mode_of_payment: "Bank Transfer", reference_no: `RCV-${p.id}-${pad(i + 1)}`, reference_date: date, project: prj,
            references: [{ idx: 1, reference_doctype: "Sales Invoice", reference_name: si, total_amount: rounded, outstanding_amount: rounded, allocated_amount: paid }], unallocated_amount: 0, status: "Submitted", docstatus: 1, creation: iso(date) });
          ctx.voucher("Payment Entry", pn); pe++;
        });
      });
      // advance payment received before mobilisation (recovered through the certificates' advance recovery)
      const adv = Number(adapter.get("Digit Client Contract", cc)?.["advance_amount"] ?? 0);
      if (adv > 0 && adapter.get("Digit Client Contract", cc)?.["__sample"]) {
        const pn = `${A}-${p.id}-PE-ADV`; const pd = addDays(p.start, -7);
        put("Payment Entry", pn, { naming_series: "ACC-PAY-.YYYY.-", payment_type: "Receive", party_type: "Customer", party: p.cust, party_name: custName(p.cust), company: C, posting_date: pd, paid_from: acct("Debtors"), paid_to: acct("Al-Rajhi Demo Bank"),
          paid_amount: adv, received_amount: adv, mode_of_payment: "Bank Transfer", reference_no: `ADV-${p.id}`, reference_date: pd, project: prj, remarks: `دفعة مقدمة حسب العقد ${cc} — تُسترد من الشهادات`, references: [], unallocated_amount: adv, status: "Submitted", docstatus: 1, creation: iso(pd) });
        ctx.voucher("Payment Entry", pn); pe++;
      }
      if (p.done) re("Digit Client Contract", cc, { workflow_state: "Completed" });
      if (p.hold) re("Digit Client Contract", cc, { workflow_state: "Suspended" });

      // ---------------- subcontract: one work order per subcontracted section, its SOV = the section's detailed items (owner round 2026-11-14)
      //                  → monthly measurement books → bills → purchase invoices → payments
      const SUB_CC = new Set(["CC-01.01", "CC-03.01", "CC-04.01", "CC-04.02", "CC-04.03", "CC-04.04", "CC-05.01", "CC-06.01", "CC-06.02", "CC-06.03", "CC-07.01", "CC-09.01", "CC-10.01", "CC-10.03", "CC-11.01", "CC-11.02"]);
      const subSecs = parents.map((l, pi) => [l, pi] as const).filter(([l]) => SUB_CC.has(l[6]));
      subSecs.forEach(([l, pi], w) => {
        const sub = subFor(l[6], p.id, w);
        const items = lines.map((x, i) => [x, i] as const).filter(([, i]) => par[i] === pi).slice(0, 40);
        const woName = `SWO-2026-${p.id}-${w + 1}`;
        const woDate = at(Math.max(0, l[7] * 0.9));
        if (woDate > CUTOFF) return;
        const keyOf = (j: number) => `${p.id}W${w + 1}-${j + 1}`;
        putC("Digit Subcontract Work Order", woName, { subcontractor: sub[0], project: prj, company: C, wo_date: woDate, workflow_state: "Active", docstatus: 1, retention_percent: 10, advance_amount: 0, advance_recovery_pct: 0, owner: "procurement@dcc.test", creation: iso(woDate),
          terms: "الدفع خلال 30 يوماً من اعتماد المستخلص؛ محتجز 10% يُفرج عنه نصفه عند الاستلام الابتدائي والباقي بعد سنة الضمان.",
          lines: items.map(([x], j) => ({ idx: j + 1, line_key: keyOf(j), scope: `مصنعية ${x[1]}`, uom: x[2], qty: x[3], rate: r2(x[4] * 0.84), cost_code: x[6], cost_category: "Subcontract", boq_item: sk(x[0]) })) });
        const prevQ = items.map(() => 0); let n = 0;
        for (const e of ends) {
          const fE = overall(p, e);
          const deltas = items.map(([x], j) => { const q = x[2] === "LS" ? Math.round(lineFrac(x, fE) * 100) / 100 : Math.round(x[3] * lineFrac(x, fE) * 0.95); const d = Math.round((q - prevQ[j]!) * 1000) / 1000; return [j, q, d] as const; })
            .filter(([, , d]) => d > 0 && (items[0]![0][2] === "LS" || d >= 1));
          if (!deltas.length) continue;
          n++; for (const [j, q] of deltas) prevQ[j] = q;
          const mbDate = addDays(e, -2), mb = `MB-2026-${p.id}-${w + 1}-${pad(n)}`;
          const isLast = e === ends[ends.length - 1] && !p.done && !p.hold;
          const entries = deltas.map(([j, , d], k) => ({ idx: k + 1, wo_line_key: keyOf(j), nos: 0, length: 0, breadth: 0, depth: 0, quantity: d, location: items[j]![0][1].split(" — ").pop() }));
          putC("Digit Measurement Book", mb, { work_order: woName, mb_date: mbDate, workflow_state: isLast ? "Submitted" : "Certified", docstatus: 0, measured_by: p.site, owner: "site@dcc.test", creation: iso(mbDate), entries }, isLast ? {} : { docstatus: 1 });
          if (isLast) continue;
          const got = (adapter.get("Digit Measurement Book", mb)?.["entries"] as Row[] | undefined) ?? [];
          const billName = `SCB-2026-${p.id}-${w + 1}-${pad(n)}`, billDate = addDays(e, 6);
          const ok = putC("Digit Subcontractor Bill", billName, { work_order: woName, measurement_book: mb, bill_date: billDate, workflow_state: "Approved", docstatus: 0, supplier_invoice_no: `${sub[0].slice(-3)}-${p.id}-${w + 1}${pad(n)}`, taxes_and_charges: `KSA VAT 15% Input - ${A}`, owner: "qs@dcc.test", creation: iso(billDate),
            lines: entries.map((en, k) => ({ idx: k + 1, wo_line_key: en.wo_line_key, this_period_qty: Number(got[k]?.["quantity"] ?? en.quantity) })) }, { docstatus: 1, workflow_state: "Invoiced" });
          if (!ok) continue;
          const b = adapter.get("Digit Subcontractor Bill", billName)!;
          const net = Number(b["net_amount"]); if (!(net > 0)) continue;
          const tax = r2(net * 0.15), grand = r2(net + tax), rounded = Math.round(grand);
          const pdate = addDays(billDate, 2), age = days(pdate, CUTOFF);
          const share = age > 60 ? 1 : age > 30 ? 0.6 : 0, paid = r2(rounded * share);
          const pi = `${A}-${p.id}-PINV-S${w + 1}${pad(n)}`;
          put("Purchase Invoice", pi, { naming_series: "ACC-PINV-.YYYY.-", supplier: sub[0], supplier_name: sub[1], company: C, posting_date: pdate, bill_no: b["supplier_invoice_no"], bill_date: billDate, due_date: addDays(pdate, 30), project: prj, currency: "SAR", conversion_rate: 1,
            buying_price_list: "Standard Buying", credit_to: acct("Creditors"), digit_subcontractor_bill: billName, taxes_and_charges: `KSA VAT 15% Input - ${A}`,
            items: [{ idx: 1, item_code: `${A}-SVC-SUBCON`, item_name: "أعمال مقاولي الباطن حسب المستخلص", description: `Subcontract bill ${billName}`, qty: 1, uom: "Nos", stock_uom: "Nos", conversion_factor: 1, rate: net, amount: net, net_rate: net, net_amount: net, expense_account: acct("Subcontract Cost"), cost_center: acct("Projects"), project: prj, digit_cost_code: l[6], digit_cost_category: "Subcontract" }],
            taxes: [{ idx: 1, charge_type: "On Net Total", account_head: acct("VAT 15% Input"), description: "VAT 15%", rate: 15, net_amount: net, base_net_amount: net, tax_amount: tax, base_tax_amount: tax, total: grand, base_total: grand, category: "Total", add_deduct_tax: "Add" }],
            total: net, net_total: net, base_net_total: net, total_taxes_and_charges: tax, grand_total: grand, base_grand_total: grand, rounded_total: rounded, base_rounded_total: rounded, rounding_adjustment: r2(rounded - grand),
            outstanding_amount: r2(rounded - paid), status: paid >= rounded ? "Paid" : paid > 0 ? "Partly Paid" : "Unpaid", docstatus: 1, creation: iso(pdate) });
          ctx.voucher("Purchase Invoice", pi); pinv++;
          re("Digit Subcontractor Bill", billName, { purchase_invoice: pi });
          if (paid > 0) {
            const pn = `${A}-${p.id}-PE-P-S${w + 1}${pad(n)}`;
            put("Payment Entry", pn, { naming_series: "ACC-PAY-.YYYY.-", payment_type: "Pay", party_type: "Supplier", party: sub[0], party_name: sub[1], company: C, posting_date: addDays(pdate, 25) > CUTOFF ? CUTOFF : addDays(pdate, 25),
              paid_from: acct("Al-Rajhi Demo Bank"), paid_to: acct("Creditors"), paid_amount: paid, received_amount: paid, mode_of_payment: "Bank Transfer", reference_no: `TRF-${p.id}${w + 1}${pad(n)}`, reference_date: pdate, project: prj,
              references: [{ idx: 1, reference_doctype: "Purchase Invoice", reference_name: pi, total_amount: rounded, outstanding_amount: rounded, allocated_amount: paid }], unallocated_amount: 0, status: "Submitted", docstatus: 1, creation: iso(pdate) });
            ctx.voucher("Payment Entry", pn); pe++;
          }
        }
        if (p.done) re("Digit Subcontract Work Order", woName, { workflow_state: "Completed" });
      });

      // ---------------- materials: quarterly steel PO → receipt → invoice, ready-mix invoiced on delivery
      const frame = parents.find((l) => l[6] === "CC-02.02") ?? parents.find((l) => l[6] === "CC-02.01");
      const slab = frame?.[2] === "m²"; // industrial floors: mesh + thinner concrete per m²
      const quarters = ends.filter((_, i) => i % 3 === 2);
      let prevFrame = 0;
      if (frame) quarters.forEach((e, qi) => {
        const fq = lineFrac(frame, overall(p, e)); const dq = (fq - prevFrame) * frame[3]; prevFrame = fq;
        if (dq < 20) return;
        po++;
        const steel = Math.max(1, Math.round(dq * (slab ? 0.012 : 0.12)));
        const steelRate = 2720;
        const odate = addDays(e, -60), rdate = addDays(e, -45), idate = addDays(e, -40);
        const item = (extra: Row = {}) => ({ idx: 1, item_code: `${A}-MAT-REBAR`, item_name: "حديد تسليح 16 مم", description: "حديد تسليح 16 مم", qty: steel, uom: "Ton", stock_uom: "Ton", conversion_factor: 1, stock_qty: steel, rate: steelRate, amount: lineAmount(steel, steelRate), net_rate: steelRate, net_amount: lineAmount(steel, steelRate), project: prj, digit_cost_code: frame[6], warehouse: WH, ...extra });
        const net = lineAmount(steel, steelRate); const tax = r2(net * 0.15);
        const tot = { total: net, net_total: net, base_net_total: net, total_taxes_and_charges: tax, grand_total: r2(net + tax), base_grand_total: r2(net + tax), rounded_total: r2(net + tax), disable_rounded_total: 1, currency: "SAR", conversion_rate: 1 };
        const taxes = [{ idx: 1, charge_type: "On Net Total", account_head: acct("VAT 15% Input"), description: "VAT 15%", rate: 15, net_amount: net, base_net_amount: net, tax_amount: tax, base_tax_amount: tax, total: r2(net + tax), base_total: r2(net + tax), category: "Total", add_deduct_tax: "Add" }];
        const base = { company: C, supplier: SUP.steel[0], supplier_name: SUP.steel[1], buying_price_list: "Standard Buying", taxes_and_charges: `KSA VAT 15% Input - ${A}` };
        const poN = `${A}-${p.id}-PO-${pad(qi + 1)}`, prN = `${A}-${p.id}-PR-${pad(qi + 1)}`, piN = `${A}-${p.id}-PINV-M${pad(qi + 1)}`;
        const poRow = `${poN}-1`;
        const poItem = item({ name: poRow, schedule_date: rdate, received_qty: steel, billed_amt: net });
        put("Purchase Order", poN, { naming_series: "PUR-ORD-.YYYY.-", ...base, transaction_date: odate, schedule_date: rdate, set_warehouse: WH, project: prj, items: [poItem], ...tot, taxes, status: "Completed", per_received: 100, per_billed: 100, docstatus: 1, owner: "procurement@dcc.test", creation: iso(odate) });
        put("Purchase Receipt", prN, { naming_series: "MAT-PRE-.YYYY.-", ...base, posting_date: rdate, set_warehouse: WH, project: prj, items: [item({ name: `${prN}-1`, purchase_order: poN, purchase_order_item: poRow, received_qty: steel, valuation_rate: steelRate })], ...tot, taxes, status: "Completed", per_billed: 100, docstatus: 1, creation: iso(rdate) });
        ctx.voucher("Purchase Receipt", prN);
        const age = days(idate, CUTOFF), paidAll = age > 50;
        put("Purchase Invoice", piN, { naming_series: "ACC-PINV-.YYYY.-", ...base, posting_date: idate, bill_no: `NSF-${p.id}-${pad(qi + 1)}`, due_date: addDays(idate, 30), credit_to: acct("Creditors"), project: prj,
          items: [item({ name: `${piN}-1`, purchase_order: poN, po_detail: poRow, purchase_receipt: prN, expense_account: acct("Construction Materials"), cost_center: acct("Projects") })], ...tot, taxes, outstanding_amount: paidAll ? 0 : tot.grand_total, status: paidAll ? "Paid" : addDays(idate, 30) < CUTOFF ? "Overdue" : "Unpaid", docstatus: 1, creation: iso(idate) });
        ctx.voucher("Purchase Invoice", piN); pinv++;
        if (paidAll) {
          const pn = `${A}-${p.id}-PE-P-M${pad(qi + 1)}`;
          put("Payment Entry", pn, { naming_series: "ACC-PAY-.YYYY.-", payment_type: "Pay", party_type: "Supplier", party: SUP.steel[0], party_name: SUP.steel[1], company: C, posting_date: addDays(idate, 30), paid_from: acct("Al-Rajhi Demo Bank"), paid_to: acct("Creditors"), paid_amount: tot.grand_total, received_amount: tot.grand_total, mode_of_payment: "Bank Transfer", reference_no: `TRF-M${p.id}${pad(qi + 1)}`, reference_date: addDays(idate, 30), project: prj,
            references: [{ idx: 1, reference_doctype: "Purchase Invoice", reference_name: piN, total_amount: tot.grand_total, outstanding_amount: tot.grand_total, allocated_amount: tot.grand_total }], unallocated_amount: 0, status: "Submitted", docstatus: 1, creation: iso(addDays(idate, 30)) });
          ctx.voucher("Payment Entry", pn); pe++;
        }
        {
          const rmc = Math.round(dq * (slab ? 0.2 : 1.02)), rr = 264, rn = lineAmount(rmc, rr), rt = r2(rn * 0.15);
          const rN = `${A}-${p.id}-PINV-R${pad(qi + 1)}`; const rd = addDays(e, -5);
          put("Purchase Invoice", rN, { naming_series: "ACC-PINV-.YYYY.-", company: C, supplier: SUP.rmc[0], supplier_name: SUP.rmc[1], buying_price_list: "Standard Buying", taxes_and_charges: `KSA VAT 15% Input - ${A}`, posting_date: rd, bill_no: `MC-${p.id}-${pad(qi + 1)}`, due_date: addDays(rd, 30), credit_to: acct("Creditors"), project: prj,
            items: [{ idx: 1, item_code: `${A}-MAT-RMC`, item_name: "خرسانة جاهزة C40", description: "خرسانة جاهزة C40 — مستلمة ومصبوبة", qty: rmc, uom: "m³", stock_uom: "m³", conversion_factor: 1, rate: rr, amount: rn, net_rate: rr, net_amount: rn, project: prj, digit_cost_code: frame[6], expense_account: acct("Construction Materials"), cost_center: acct("Projects") }],
            total: rn, net_total: rn, base_net_total: rn, total_taxes_and_charges: rt, grand_total: r2(rn + rt), base_grand_total: r2(rn + rt), rounded_total: r2(rn + rt), disable_rounded_total: 1, currency: "SAR", conversion_rate: 1,
            taxes: [{ idx: 1, charge_type: "On Net Total", account_head: acct("VAT 15% Input"), description: "VAT 15%", rate: 15, net_amount: rn, base_net_amount: rn, tax_amount: rt, base_tax_amount: rt, total: r2(rn + rt), base_total: r2(rn + rt), category: "Total", add_deduct_tax: "Add" }],
            outstanding_amount: r2(rn + rt), status: addDays(rd, 30) < CUTOFF ? "Overdue" : "Unpaid", docstatus: 1, creation: iso(rd) });
          ctx.voucher("Purchase Invoice", rN); pinv++;
        }
      });

      // owner round 2026-11-14: facts the portfolio module (demoPortfolio.ts) builds the site, procurement, change and forecast records on
      facts.push({ id: p.id, project: prj, title: p.title, city: p.city, cust: p.cust, contract: cc, budget: bud, boq, tender, start: p.start, end: p.end, pct: p.pct, tpl: p.tpl, value, cost,
        hold: p.hold, done: !!p.done, closeout: !!p.closeout, site: p.site, pm: p.pm, tasks: parents.map((l, i) => ({ task: task(i), subject: l[1], cc: l[6], uom: l[2], qty: l[3], frac: lineFrac(l, fNow), from: at(l[7] * 0.95), to: at(Math.min(1, l[8] * 0.98)) })),
        wos: subSecs.map(([l], w) => ({ wo: `SWO-2026-${p.id}-${w + 1}`, cc: l[6], sub: subFor(l[6], p.id, w)[0] })).filter((x) => adapter.get("Digit Subcontract Work Order", x.wo)),
        budgetLines: [...[...byCC.keys()].map((code) => `${p.id}-${code}`), ...matLines.map(([code]) => `${p.id}-${code}-M`)], monthly: ends.map((e) => ({ e, f: overall(p, e) })) });
      if (p.done || p.hold) continue;
      // ---------------- execution diary (active projects): monthly progress updates per working section, petty cash, cash flow
      // (daily site reports, attendance and machinery usage for the last 90 days come from demoPortfolio.ts)
      working.forEach((ti, i) => {
        const l = parents[ti]!;
        for (let k = 0; k < 3; k++) {
          const e = addDays(CUTOFF, -2 - k * 30); const f = lineFrac(l, overall(p, e));
          if (!(f > 0)) continue;
          putC("Digit Progress Update", `PRG-2026-${p.id}-${i + 1}${k ? `-${k}` : ""}`, { project: prj, update_date: e, task: task(ti), progress_pct: Math.round(f * 100), qty_done: l[2] === "LS" ? 0 : Math.round(l[3] * f), workflow_state: k ? "Reviewed" : "Submitted", docstatus: k ? 1 : 0, reported_by: p.site, owner: "site@dcc.test", creation: iso(e), notes: `تقدم ${l[1]} حسب الخطة الشهرية.` }, k ? { docstatus: 1, workflow_state: "Reviewed" } : {});
        }
      });
      const fund = `PCF-${p.id}`;
      putC("Digit Petty Cash Fund", fund, { fund_name: `عهدة موقع ${p.title}`, project: prj, company: C, custodian: p.site, fund_limit: 15000, status: "Open", opened_on: addDays(CUTOFF, -60), owner: "finance@dcc.test" });
      const exps: [string, string, number, string][] = [["Fuel", "ديزل للمولد والمعدات", 1650, "Approved"], ["Consumables", "مستهلكات لحام وقص", 820, "Approved"], ["Transport", "نقل مواد من المستودع المركزي", 1400, "Approved"], ["Site Services", "شفط مياه وتنظيف موقع", 1100, "Submitted"], ["Meals", "وجبات عمل إضافي", 950, "Draft"]];
      exps.forEach(([cat, desc, amt, st], i) => {
        const date = addDays(CUTOFF, -40 + i * 8);
        putC("Digit Site Expense", `EXP-2026-${p.id}-${pad(i + 1)}`, { project: prj, fund, expense_date: date, category: cat, description: desc, amount: amt, vat_status: "Not Determined", workflow_state: st, docstatus: st === "Approved" ? 1 : 0, receipt_ref: `RC-${p.id}${i + 1}`, ...(st === "Draft" ? {} : { receipts: `إيصال RC-${p.id}${i + 1} (صورة مرفقة — تجريبي)` }), owner: "site@dcc.test", creation: iso(date) });
      });
      const f = adapter.get("Digit Petty Cash Fund", fund); if (f?.["__sample"]) adapter.insertDocQuiet("Digit Petty Cash Fund", computeDoc("Digit Petty Cash Fund", f).doc);
      const monthly = value * 0.07;
      [["2026-11", "Inflow", "Client Collection", 1], ["2026-11", "Outflow", "Subcontractor Payment", 0.45], ["2026-12", "Inflow", "Client Collection", 1.1], ["2026-12", "Outflow", "Supplier Payment", 0.4]].forEach(([period, dir, cat, k], i) => {
        putC("Digit Cashflow Forecast Item", `CFI-${p.id}-${i + 1}`, { project: prj, period, direction: dir, category: cat, amount: Math.round(monthly * Number(k) / 1000) * 1000, status: i % 2 ? "Committed" : "Planned", basis: dir === "Inflow" ? "Next certificate per programme" : "Committed work orders and POs", owner: "finance@dcc.test" });
      });
    }

    // ---------------- tender pipeline (no project yet)
    const pipe: [string, string, string, string, string, [string, string, string, number][]][] = [
      ["TND-2026-V11", "مجمع تجاري — حي النرجس", `${A}-CUST-01`, "Pricing", "2026-11-20", [["02.02", "الهيكل الخرساني", "m³", 4200], ["03.01", "جدران بلوك", "m²", 12000]]],
      ["TND-2026-V12", "فندق ثلاث نجوم — جدة", `${A}-CUST-02`, "Pricing", "2026-12-05", [["02.02", "الهيكل الخرساني", "m³", 3300], ["06.01", "تشطيبات فندقية", "m²", 14000]]],
      ["TND-2026-V13", "مستودع تبريد — الدمام", `${A}-CUST-04`, "Submitted", "2026-10-10", [["08.01", "هيكل معدني", "Ton", 410], ["02.01", "أرضيات صناعية", "m²", 9000]]],
      ["TND-2026-V14", "عيادات خارجية — الخبر", `${A}-V-CUST-05`, "Submitted", "2026-09-28", [["02.02", "الهيكل الخرساني", "m³", 1600], ["04.01", "أنظمة طبية", "LS", 1]]],
      ["TND-2026-V15", "مدرسة ابتدائية — الأحساء", `${A}-CUST-03`, "Submitted", "2026-10-05", [["02.01", "الهيكل الخرساني", "m³", 1400], ["06.01", "تشطيبات", "m²", 5200]]],
      ["TND-2026-V16", "برج مكاتب — مكة المكرمة", `${A}-V-CUST-06`, "Lost", "2026-07-15", [["02.02", "الهيكل الخرساني", "m³", 5100]]],
      ["TND-2026-V17", "إسكان موظفين — ينبع", `${A}-CUST-02`, "Lost", "2026-05-30", [["02.02", "هياكل الفلل", "m³", 2600], ["03.01", "جدران بلوك", "m²", 15000]]],
      ["TND-2026-V18", "توسعة مستودعات الخرج", `${A}-CUST-04`, "Pricing", "2026-12-20", [["01.01", "أعمال ترابية", "m³", 9000], ["08.01", "هيكل معدني", "Ton", 380]]],
    ];
    for (const [name, title, cust, status, deadline, items] of pipe) {
      putC("Digit Tender", name, { title, customer: cust, company: C, issuing_body: custName(cust), submission_deadline: deadline, status, currency: "SAR", margin_percent: 14, emd_amount: 60000, emd_valid_until: addDays(deadline, 90), owner: "estimator@dcc.test", creation: iso(addDays(deadline, -45)),
        items: items.map(([code, d, u, q], i) => ({ idx: i + 1, item_key: `${name}-${code}`, code, description: d, uom: u, qty: q })), ...(status === "Lost" ? { notes: "Lost on price — 4–7% above the winning bid." } : {}) });
    }
    // daily site layer, masters, procurement, changes, quality, forecasts and the tender projects (owner round 2026-11-14)
    portfolioActivity({ put, putC, re, voucher: ctx.voucher }, facts);
    // pending demo approvals wait 2–5 days counted from today (connected demo and this layer alike)
    freshenPendingApprovals();
    void sinv; void pinv; void pe; void po;
  });
}
