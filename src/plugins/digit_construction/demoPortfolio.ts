/**
 * DIGIT Construction — portfolio demo (owner round 2026-11-14 "Demo data + print + research evaluation").
 * Completes the memory-only sample layer (volume.ts) into one believable Saudi contractor: masters (20 suppliers,
 * 15 subcontractors with valid / expiring / expired compliance, 80 employees in 8 crews, 25 machines, a cost-code
 * tree, rate master, site warehouses, long-lead items), then per project: procurement chains (MR → RFQ → 3 quotations →
 * awarded PO → receipts with rejection → issues / returns → 3-way-matched invoices, one held), changes (RFIs, change
 * events through pricing → client variations → budget revisions, claims, EOTs), site and quality records, a
 * 90-working-day site diary (Sunday–Thursday: site reports, crew attendance, machinery usage with fuel and downtime),
 * monthly forecast snapshots (margin fade), cash forecast, the two tender projects and the closeout documents.
 * Everything is insert-if-missing with explicit names, app documents pass the controller hooks (putC → computeDoc)
 * and ledgers come only from posting.ts (ctx.voucher), so no figure is written directly.
 */
import { adapter, type Doc } from "@/lib/adapter";
import { computeDoc } from "./domain/hooks";
import { lineAmount, r2 } from "./domain/calc";
import { DEMO_COMPANY, staffProfile } from "./seed";
import { costVerification, EXCEPTION_LABEL } from "./domain/costVerify";
import { approvedBudget, asSystem, costSourceRows, rows } from "./domain/data";
import { snapshotMetrics } from "./domain/finance";

type Row = Record<string, unknown>;
export interface PortfolioCtx {
  put: (dt: string, name: string, data: Row) => unknown;
  putC: (dt: string, name: string, data: Row, final?: Row) => unknown;
  re: (dt: string, name: string, patch: Row) => void;
  voucher: (dt: string, name: string) => void;
}
export interface FactTask { task: string; subject: string; cc: string; uom: string; qty: number; frac: number; from: string; to: string }
export interface ProjectFacts {
  id: string; project: string; title: string; city: string; cust: string; contract: string; budget: string; boq: string; tender: string;
  start: string; end: string; pct: number; tpl: string; value: number; cost: number; hold?: string | undefined; done: boolean; closeout: boolean;
  site: string; pm: string; tasks: FactTask[]; wos: { wo: string; cc: string; sub: string }[]; budgetLines: string[]; monthly: { e: string; f: number }[];
}

const A = "DCC";
const C = DEMO_COMPANY;
const acct = (n: string) => `${n} - ${A}`;
const CUTOFF = "2026-11-12";
const WH_C = `المستودع المركزي - ${A}`;
const iso = (d: string) => `${d} 09:00:00`;
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const days = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
const pad = (n: number, w = 2) => String(n).padStart(w, "0");
const ymd = (d: string) => d.replaceAll("-", "");
const rowsOf = (x: unknown) => (Array.isArray(x) ? (x as Row[]) : []);
const num = (x: unknown) => { const n = Number(x); return Number.isFinite(n) ? n : 0; };
/** deterministic 0..1 from a string (FNV-1a), so the generated portfolio is identical on every visit */
const h = (s: string) => { let x = 2166136261; for (let i = 0; i < s.length; i++) x = Math.imul(x ^ s.charCodeAt(i), 16777619); return (x >>> 0) / 4294967296; };
/** h over the reversed key: FNV-1a barely moves on a change in the last characters (a date, a member index), so keys whose varying part ends the string use hv. */
const hv = (s: string) => h([...s].reverse().join(""));
const today = () => new Date().toISOString().slice(0, 10);
const CR_CITY: Record<string, string> = { "الرياض": "1010", "جدة": "4030", "الدمام": "2050", "مكة المكرمة": "4031", "أبها": "5850", "الخبر": "2051" };
const demoVat = (id: string) => `3${String(1000000000000 + Math.floor(h(`vat${id}`) * 8999999999999)).slice(0, 13)}3`;
const demoCr = (id: string, city: string) => `${CR_CITY[city] ?? "1010"}${String(100000 + Math.floor(h(`cr${id}`) * 899999))}`;

// ------------------------------------------------------------------------------------------------ masters
/** 16 material / service suppliers (with the connected demo's 4 = 20) — [id, name, English, group, city] */
export const NEW_SUPPLIERS: [string, string, string, string, string][] = [
  [`${A}-SUP-PIPE`, "شركة الأنابيب المتحدة", "United Pipes Co.", "Raw Material", "الدمام"],
  [`${A}-SUP-ASPH`, "مصنع الإسفلت الجنوبي", "Southern Asphalt Plant", "Raw Material", "أبها"],
  [`${A}-SUP-CABLE`, "شركة الكابلات السعودية الحديثة", "Modern Saudi Cables", "Raw Material", "الرياض"],
  [`${A}-SUP-HVAC`, "شركة التبريد المركزي للتجارة", "Central Cooling Trading", "Raw Material", "جدة"],
  [`${A}-SUP-ELEV`, "شركة المصاعد الحديثة", "Modern Elevators Co.", "Raw Material", "الرياض"],
  [`${A}-SUP-SWG`, "شركة اللوحات الكهربائية المتقدمة", "Advanced Switchgear Co.", "Raw Material", "الدمام"],
  [`${A}-SUP-GYP`, "مصنع الجبس الوطني", "National Gypsum Factory", "Raw Material", "الرياض"],
  [`${A}-SUP-TILE`, "معرض السيراميك والرخام", "Ceramic & Marble House", "Raw Material", "جدة"],
  [`${A}-SUP-PAINT`, "شركة الدهانات العربية", "Arabian Paints Co.", "Raw Material", "الدمام"],
  [`${A}-SUP-DOOR`, "مصنع الأبواب الخشبية", "Wooden Doors Factory", "Raw Material", "مكة المكرمة"],
  [`${A}-SUP-GLASS`, "شركة الزجاج والألمنيوم", "Glass & Aluminium Co.", "Raw Material", "جدة"],
  [`${A}-SUP-SAFE`, "مؤسسة معدات السلامة", "Safety Equipment Est.", "Services", "الرياض"],
  [`${A}-SUP-FUEL`, "شركة الوقود والزيوت", "Fuel & Lubricants Co.", "Services", "الدمام"],
  [`${A}-SUP-RENT2`, "شركة الجنوب لتأجير المعدات", "Southern Equipment Rental", "Services", "أبها"],
  [`${A}-SUP-AGG`, "كسارات الشرقية للركام", "Eastern Aggregates Crushers", "Raw Material", "الدمام"],
  [`${A}-SUP-GEN`, "شركة المولدات والطاقة", "Generators & Power Co.", "Raw Material", "جدة"],
];
type Compliance = "valid" | "expiring" | "expired-cr" | "expired-ins";
/** 12 subcontractors (with the connected demo's 3 = 15) — [id, name, English, trade, grade, city, compliance] */
export const NEW_SUBCONTRACTORS: [string, string, string, string, string, string, Compliance][] = [
  [`${A}-SUB-EARTH`, "مؤسسة الحفريات الحديثة", "Modern Excavation Est.", "Civil", "3rd", "الرياض", "valid"],
  [`${A}-SUB-EARTH2`, "شركة الأرض الصلبة للمقاولات", "Solid Ground Contracting", "Civil", "4th", "أبها", "expired-cr"],
  [`${A}-SUB-HVAC`, "شركة الهواء النقي للتكييف", "Pure Air HVAC Co.", "MEP", "2nd", "جدة", "valid"],
  [`${A}-SUB-PLUMB`, "مؤسسة الينابيع للسباكة", "Al-Yanabee Plumbing Est.", "MEP", "4th", "الدمام", "expiring"],
  [`${A}-SUB-ELEC`, "شركة النور للأعمال الكهربائية", "Al-Noor Electrical Works", "MEP", "2nd", "الرياض", "valid"],
  [`${A}-SUB-PAINT`, "مؤسسة الألوان للدهانات", "Al-Alwan Painting Est.", "Finishing", "5th", "مكة المكرمة", "valid"],
  [`${A}-SUB-CEIL`, "شركة الأسقف المعلقة", "Suspended Ceilings Co.", "Finishing", "4th", "مكة المكرمة", "expiring"],
  [`${A}-SUB-JOIN`, "ورشة النجارة الفنية", "Fine Joinery Workshop", "Finishing", "5th", "جدة", "valid"],
  [`${A}-SUB-FACADE`, "شركة الواجهات الزجاجية المتطورة", "Advanced Glass Facades", "Finishing", "2nd", "الرياض", "expired-ins"],
  [`${A}-SUB-ROAD`, "شركة الطرق والجسور السعودية", "Saudi Roads & Bridges", "Civil", "1st", "أبها", "valid"],
  [`${A}-SUB-NET`, "شركة شبكات المياه المتحدة", "United Water Networks", "Civil", "2nd", "الدمام", "valid"],
  [`${A}-SUB-LAND`, "مؤسسة الواحة الخضراء للتشجير", "Green Oasis Landscaping", "Landscaping", "5th", "الرياض", "expiring"],
];
const SUB_NAMES: Record<string, string> = {
  [`${A}-SUB-BLOCK`]: "مؤسسة البناء المتين للمقاولات", [`${A}-SUB-MEP`]: "شركة الأنظمة الكهروميكانيكية المتكاملة", [`${A}-SUB-FIN`]: "مؤسسة اللمسة النهائية للتشطيبات",
  ...Object.fromEntries(NEW_SUBCONTRACTORS.map(([id, name]) => [id, name])),
};
const subName = (id: string) => String(adapter.get("Supplier", id)?.["supplier_name"] ?? SUB_NAMES[id] ?? id);
const SUB_BY_CC: Record<string, string[]> = {
  // subcontractors whose registration or insurance has lapsed (EARTH2, FACADE, and the connected demo's MEP) get no new orders —
  // the work-order rule refuses them; they show on the compliance screens instead
  "CC-01.01": ["EARTH"], "CC-03.01": ["BLOCK"], "CC-04.01": ["ELEC"], "CC-04.02": ["HVAC"], "CC-04.03": ["PLUMB"], "CC-04.04": ["ELEC"],
  "CC-05.01": ["PAINT", "FIN"], "CC-06.01": ["FIN"], "CC-06.02": ["CEIL"], "CC-06.03": ["JOIN"], "CC-07.01": ["LAND"], "CC-09.01": ["FIN"],
  "CC-10.01": ["ROAD"], "CC-10.03": ["ROAD"], "CC-11.01": ["NET"], "CC-11.02": ["NET"],
};
/** The subcontractor a project section is let to — [supplier id, name]; deterministic per project and section. */
export function subFor(cc: string, pid: string, w: number): [string, string] {
  const pool = SUB_BY_CC[cc] ?? ["FIN"];
  const id = `${A}-SUB-${pool[(pid.charCodeAt(pid.length - 1) + w) % pool.length]}`;
  return [id, subName(id)];
}

const FIRST = ["محمد", "أحمد", "عبدالرحمن", "خالد", "سعيد", "علي", "يوسف", "عمر", "إبراهيم", "حسن", "سلمان", "فهد", "ناصر", "طارق", "ماجد", "راشد", "سلطان", "عادل", "حمد", "بدر", "رحمن", "إقبال", "كومار", "أنور", "عرفان", "شاهد", "جوزيف", "سانتوس", "رضا", "عبدالقادر"];
const LAST = ["القحطاني", "العتيبي", "الشمري", "الزهراني", "الغامدي", "الحربي", "المطيري", "الدوسري", "السبيعي", "العنزي", "الشهري", "البلوي", "المالكي", "الجهني", "حسين", "خان", "سينغ", "ميا", "بابو", "رضوان", "قاسم", "نذير", "محمود", "الأنصاري"];
/** the six new crews (with CREW-0001 / CREW-0002 = 8) — [id, name, project, trade, member designations] */
const CREWS: [string, string, string, string, string[]][] = [
  ["CREW-A2", "طاقم التشطيبات — برج الياسمين", `${A}-PRJ-A`, "Finishing", ["Foreman", "Tile Fixer", "Tile Fixer", "Painter", "Painter", "Plasterer", "Plasterer", "Helper", "Helper", "Equipment Operator"]],
  ["CREW-V02", "طاقم الشبكات — حي الياقوت", `${A}-V02-PRJ`, "Civil", ["Foreman", "Pipe Fitter", "Pipe Fitter", "Pipe Fitter", "Mason", "Equipment Operator", "Equipment Operator", "Driver", "Helper", "Helper", "Helper", "Surveyor"]],
  ["CREW-V03", "طاقم الكهروميكانيك — فندق الشاطئ", `${A}-V03-PRJ`, "MEP", ["Foreman", "HVAC Technician", "HVAC Technician", "Electrician", "Electrician", "Electrician", "Plumber", "Plumber", "Helper", "Equipment Operator"]],
  ["CREW-V05", "طاقم الهيكل — مركز الخبر الطبي", `${A}-V05-PRJ`, "Structural", ["Foreman", "Steel Fixer", "Steel Fixer", "Steel Fixer", "Carpenter", "Carpenter", "Carpenter", "Mason", "Equipment Operator", "Equipment Operator", "Helper", "Helper"]],
  ["CREW-V06", "طاقم التشطيبات — مقر أم القرى", `${A}-V06-PRJ`, "Finishing", ["Foreman", "Gypsum Installer", "Gypsum Installer", "Carpenter", "Painter", "Painter", "Tile Fixer", "Helper", "Equipment Operator"]],
  ["CREW-V07", "طاقم الطرق — طريق أبها", `${A}-V07-PRJ`, "Civil", ["Foreman", "Asphalt Operator", "Asphalt Operator", "Equipment Operator", "Equipment Operator", "Equipment Operator", "Driver", "Driver", "Surveyor", "Helper"]],
];
const DAILY_COST: Record<string, number> = { Foreman: 420, Surveyor: 380, "Equipment Operator": 320, Driver: 230, Helper: 160 };
const crewRole = (d: string) => (d === "Foreman" ? "Foreman" : d === "Helper" ? "Helper" : d === "Equipment Operator" || d === "Driver" ? "Operator" : "Skilled");
/** 20 new machines (with the connected demo's 5 = 25) — [code, name, type, ownership, rate, status, project, supplier, fuel L/h] */
const MACHINES: [string, string, string, string, number, string, string, string, number][] = [
  ["MCH-EXC-02", "حفار كاتربلر 320", "Excavator", "Owned", 210, "Deployed", "V02", "", 17],
  ["MCH-EXC-03", "حفار كوماتسو PC210", "Excavator", "Rented", 230, "Deployed", "V07", `${A}-SUP-RENT2`, 16],
  ["MCH-EXC-04", "حفار صغير بوبكات E35", "Excavator", "Owned", 120, "Deployed", "V03", "", 6],
  ["MCH-EXC-05", "حفار هيونداي 300", "Excavator", "Rented", 240, "Deployed", "V05", `${A}-SUP-RENT`, 19],
  ["MCH-CRN-02", "رافعة برجية ليبهير 150", "Crane", "Rented", 420, "Deployed", "V05", `${A}-SUP-RENT`, 12],
  ["MCH-CRN-03", "رافعة متحركة 50 طن", "Crane", "Rented", 380, "Deployed", "V03", `${A}-SUP-RENT2`, 14],
  ["MCH-CRN-04", "رافعة برجية بوتين", "Crane", "Owned", 350, "Deployed", "V01", "", 11],
  ["MCH-LDR-02", "لودر كاتربلر 950", "Loader", "Owned", 170, "Deployed", "V07", "", 15],
  ["MCH-LDR-03", "لودر بوبكات S650", "Loader", "Owned", 110, "Deployed", "V06", "", 7],
  ["MCH-LDR-04", "لودر فولفو L120", "Loader", "Rented", 190, "Deployed", "V02", `${A}-SUP-RENT2`, 15],
  ["MCH-TRK-01", "قلاب مرسيدس أكتروس 1", "Truck", "Owned", 140, "Deployed", "V07", "", 12],
  ["MCH-TRK-02", "قلاب مرسيدس أكتروس 2", "Truck", "Owned", 140, "Deployed", "V02", "", 12],
  ["MCH-TRK-03", "قلاب فولفو FMX", "Truck", "Owned", 145, "Deployed", "V05", "", 12],
  ["MCH-TRK-04", "قلاب مان TGS", "Truck", "Owned", 135, "Deployed", "A", "", 11],
  ["MCH-TRK-05", "قلاب إيسوزو", "Truck", "Owned", 110, "Deployed", "V06", "", 9],
  ["MCH-PMP-02", "مضخة خرسانة شوينغ 47م", "Concrete Pump", "Rented", 450, "Deployed", "V05", `${A}-SUP-RENT`, 20],
  ["MCH-PMP-03", "مضخة خرسانة أرضية", "Concrete Pump", "Owned", 260, "Deployed", "B", "", 14],
  ["MCH-GEN-02", "مولد كهرباء 250 ك.ف.أ", "Generator", "Owned", 60, "Deployed", "V07", "", 22],
  ["MCH-GEN-03", "مولد كهرباء 100 ك.ف.أ", "Generator", "Owned", 45, "Deployed", "V06", "", 10],
  ["MCH-GEN-04", "مولد كهرباء 500 ك.ف.أ", "Generator", "Rented", 95, "Under Maintenance", "", `${A}-SUP-GEN`, 38],
];
const prjOf = (key: string) => (key === "A" || key === "B" ? `${A}-PRJ-${key}` : `${A}-${key}-PRJ`);
const SITE_WH: Record<string, string> = { V01: "موقع برج الريان", V02: "موقع حي الياقوت", V03: "موقع فندق الشاطئ", V05: "موقع مركز الخبر الطبي", V06: "موقع مقر أم القرى", V07: "موقع طريق أبها" };
export const siteWarehouse = (id: string) => (SITE_WH[id] ? `${SITE_WH[id]} - ${A}` : WH_C);
/** cost-code tree: groups (with the codes the budgets use as children) and a retired code */
const CC_GROUPS: [string, string, string][] = [
  ["CC-01", "Site works", "أعمال الموقع والحفر"], ["CC-02", "Concrete works", "الأعمال الخرسانية"], ["CC-03", "Masonry", "أعمال البناء"], ["CC-04", "MEP works", "الأعمال الكهروميكانيكية"],
  ["CC-05", "Painting", "الدهانات واللياسة"], ["CC-06", "Finishes", "التشطيبات"], ["CC-07", "External works", "الأعمال الخارجية"], ["CC-08", "Metal works", "الأعمال المعدنية"],
  ["CC-09", "Facades", "الواجهات"], ["CC-10", "Road works", "أعمال الطرق"], ["CC-11", "Utility networks", "شبكات المرافق"],
];
const CC_CHILDREN: [string, string, string, string][] = [
  ["CC-04.02", "HVAC and ventilation", "التكييف والتهوية", "Subcontract"], ["CC-04.03", "Plumbing and fire fighting", "السباكة ومكافحة الحريق", "Subcontract"], ["CC-04.04", "Electrical and low current", "الكهرباء والجهد المنخفض", "Subcontract"],
  ["CC-06.02", "Ceilings and partitions", "الأسقف والقواطع", "Subcontract"], ["CC-06.03", "Joinery and doors", "النجارة والأبواب", "Subcontract"], ["CC-08.01", "Structural steel", "الحديد الإنشائي", "Materials"],
  ["CC-09.01", "Glazed facade", "الواجهات الزجاجية", "Subcontract"], ["CC-10.01", "Asphalt", "الأسفلت", "Subcontract"], ["CC-10.02", "Base courses", "طبقات الأساس", "Materials"], ["CC-10.03", "Kerbs and road furniture", "الأرصفة وأثاث الطريق", "Subcontract"],
  ["CC-11.01", "Water networks", "شبكات المياه", "Subcontract"], ["CC-11.02", "Sewer and drainage", "شبكات الصرف والتصريف", "Subcontract"],
];
/** materials bought directly per project template — [item, name, uom, qty, rate, cost code, 3 bidders, lead days, long lead] */
type Mat = [string, string, string, number, number, string, [string, string, string], number, boolean];
const MATS: Record<string, Mat[]> = {
  infra: [[`${A}-MAT-HDPE`, "أنابيب HDPE قطر 315 مم", "m", 3200, 185, "CC-11.01", ["PIPE", "BUILD", "AGG"], 21, false], [`${A}-MAT-GRP`, "أنابيب GRP قطر 800 مم", "m", 1400, 620, "CC-11.02", ["PIPE", "BUILD", "STEEL"], 35, false],
    [`${A}-MAT-SWGR`, "لوحة توزيع رئيسية لمحطة الرفع", "Nos", 2, 265000, "CC-11.02", ["SWG", "CABLE", "GEN"], 120, true]],
  mep: [[`${A}-MAT-DUCT`, "صاج مجاري هواء مجلفن", "m²", 5200, 96, "CC-04.02", ["HVAC", "BUILD", "STEEL"], 25, false], [`${A}-MAT-CABLE`, "كابلات نحاس 4×16 مم²", "m", 18000, 42, "CC-04.04", ["CABLE", "SWG", "BUILD"], 18, false],
    [`${A}-MAT-CHILLER`, "مبرد مياه 400 طن تبريد", "Nos", 2, 1450000, "CC-04.02", ["HVAC", "GEN", "SWG"], 180, true]],
  hospital: [[`${A}-MAT-TILE`, "بلاط فينيل طبي مضاد للبكتيريا", "m²", 6200, 145, "CC-06.01", ["TILE", "BUILD", "PAINT"], 30, false], [`${A}-MAT-CABLE`, "كابلات نحاس 4×16 مم²", "m", 26000, 42, "CC-04.01", ["CABLE", "SWG", "BUILD"], 18, false],
    [`${A}-MAT-ELEV`, "مصعد مرضى 2500 كجم", "Nos", 6, 385000, "CC-04.01", ["ELEV", "SWG", "GEN"], 200, true]],
  fitout: [[`${A}-MAT-GYPSUM`, "ألواح جبس مقاومة للرطوبة", "m²", 14000, 38, "CC-06.02", ["GYP", "BUILD", "PAINT"], 14, false], [`${A}-MAT-TILE`, "بلاط بورسلان 60×120", "m²", 5200, 118, "CC-06.01", ["TILE", "BUILD", "GLASS"], 30, false],
    [`${A}-MAT-DOOR`, "أبواب خشبية مقاومة للحريق", "Nos", 260, 1650, "CC-06.03", ["DOOR", "GLASS", "BUILD"], 60, true]],
  road: [[`${A}-MAT-ASPH`, "خلطة إسفلتية ساخنة", "Ton", 9000, 265, "CC-10.01", ["ASPH", "AGG", "BUILD"], 14, false], [`${A}-MAT-BASE`, "طبقة أساس مدرج", "m³", 14000, 62, "CC-10.02", ["AGG", "ASPH", "BUILD"], 10, false],
    [`${A}-MAT-KERB`, "بردورات خرسانية مسبقة الصب", "m", 9000, 48, "CC-10.03", ["BUILD", "AGG", "RMC"], 45, true]],
};
const LONG_LEAD_ITEMS: [string, string, string, number][] = [[`${A}-MAT-SWGR`, "لوحة توزيع رئيسية لمحطة الرفع", "Nos", 120], [`${A}-MAT-CHILLER`, "مبرد مياه 400 طن تبريد", "Nos", 180], [`${A}-MAT-ELEV`, "مصعد مرضى 2500 كجم", "Nos", 200],
  [`${A}-MAT-DOOR`, "أبواب خشبية مقاومة للحريق", "Nos", 60], [`${A}-MAT-KERB`, "بردورات خرسانية مسبقة الصب", "m", 45], [`${A}-MAT-GENSET`, "مولد احتياطي 1500 ك.ف.أ", "Nos", 140]];
/** Material budget lines a template's direct purchases need (volume.ts adds them to the project budget). The fit-out
 *  gypsum line is budgeted below its order on purpose: it is the portfolio's over-budget cost code. */
export function materialBudget(tpl: string): { cc: string; amount: number }[] {
  return (MATS[tpl] ?? []).map(([item, , , qty, rate, cc]) => ({ cc, amount: Math.round(qty * rate * (item === `${A}-MAT-GYPSUM` ? 0.62 : 1.06)) }));
}

export function portfolioMasters(ctx: PortfolioCtx): void {
  const { put } = ctx;
  const T = today();
  for (const [id, name, en, group, city] of NEW_SUPPLIERS) {
    const cr = demoCr(id, city), vat = demoVat(id);
    put("Supplier", id, { supplier_name: name, digit_supplier_name_en: en, supplier_group: group, supplier_type: "Company", country: "Saudi Arabia", default_currency: "SAR", tax_id: vat,
      supplier_details: `السجل التجاري ${cr} · الرقم الضريبي ${vat} · ${city} — أرقام تجريبية للعرض`, owner: "procurement@dcc.test" });
  }
  NEW_SUBCONTRACTORS.forEach(([id, name, en, trade, grade, city, comp], i) => {
    const cr = demoCr(id, city), vat = demoVat(id);
    put("Supplier", id, { supplier_name: name, digit_supplier_name_en: en, supplier_group: "Subcontractor", supplier_type: "Company", country: "Saudi Arabia", default_currency: "SAR", tax_id: vat,
      supplier_details: `السجل التجاري ${cr} · الرقم الضريبي ${vat} · ${city} — أرقام تجريبية للعرض`, owner: "procurement@dcc.test" });
    const crExp = comp === "expired-cr" ? addDays(T, -35) : addDays(T, 300 + i * 17);
    const insExp = comp === "expired-ins" ? addDays(T, -12) : comp === "expiring" ? addDays(T, 18 + i) : addDays(T, 160 + i * 11);
    const lapsed = comp === "expired-cr" || comp === "expired-ins";
    ctx.putC("Digit Subcontractor Profile", `SCP-V${pad(i + 1)}`, { supplier: id, trade, classification_grade: grade, workflow_state: lapsed ? "Suspended" : "Approved",
      compliance_documents: [{ idx: 1, doc_type: "CR", number: cr, expiry: crExp }, { idx: 2, doc_type: "VAT", number: vat, expiry: addDays(T, 365 + i * 5) }, { idx: 3, doc_type: "Insurance", number: `INS-${pad(i + 1)}-2026`, expiry: insExp }, { idx: 4, doc_type: "Safety", number: `HSE-${pad(i + 1)}-2026`, expiry: addDays(T, 200 + i * 9) }], cr_number: cr, cr_expiry: crExp, vat_number: vat, insurance_expiry: insExp,
      score: [4, 3, 5, 3, 4, 4, 3, 4, 2, 5, 4, 3][i], max_contract_value: [8e6, 4e6, 15e6, 5e6, 12e6, 3e6, 4e6, 2.5e6, 10e6, 30e6, 18e6, 2e6][i], approved_by: "director@dcc.test",
      compliance_status: comp === "valid" ? "Compliant" : comp === "expiring" ? "Expiring" : "Non-compliant", notes: "أرقام السجل والضريبة تجريبية للعرض", owner: "procurement@dcc.test", creation: iso(addDays(CUTOFF, -400 + i * 9)) });
  });
  // employees DCC-EMP-015 … 080: crew members, then three site staff
  let e = 15;
  const empName = (n: number) => [FIRST[(n * 7) % FIRST.length]!, LAST[(n * 11) % LAST.length]!] as const;
  const emp = (desig: string, manager = "003") => {
    const id = `${A}-EMP-${String(e).padStart(3, "0")}`; const [first, last] = empName(e);
    put("Employee", id, { first_name: first, last_name: last, employee_name: `${first} ${last}`, company: C, status: "Active", gender: "Male", designation: desig, date_of_joining: `202${2 + (e % 4)}-${pad(1 + (e % 12))}-0${1 + (e % 9)}`,
      ...staffProfile(id, desig), reports_to: manager.includes("-EMP-") ? manager : `${A}-EMP-${manager}` /* a crew member reports to its foreman's full employee id */, nationality: e % 4 === 0 ? "India" : e % 7 === 0 ? "Pakistan" : "Saudi Arabia",
      date_of_birth: `19${78 + (e % 20)}-${pad(1 + (e % 12))}-1${e % 9}`, owner: "Administrator" });
    e++; return { id, name: `${first} ${last}`, desig };
  };
  for (const [crew, cname, project, trade, desigs] of CREWS) {
    const foreman = `${A}-EMP-${String(e).padStart(3, "0")}`;
    const members = desigs.map((desig, i) => emp(desig, i === 0 ? "003" : foreman));
    put("Digit Crew", crew, { crew_name: cname, project, company: C, trade, foreman: members[0]!.id, status: "Active", currency: "SAR", owner: "site@dcc.test", creation: iso("2026-02-01"),
      members: members.map((m, i) => ({ idx: i + 1, employee: m.id, employee_name: m.name, crew_role: crewRole(m.desig), planned_daily_cost: DAILY_COST[m.desig] ?? 260 })) });
  }
  emp("Safety Officer"); emp("Storekeeper"); emp("Document Controller");
  // machines and their assignments
  for (const [code, name, type, own, rate, status, key, supplier, fuel] of MACHINES) {
    const project = key ? prjOf(key) : "";
    put("Digit Machinery", code, { machine_code: code, machine_name: name, machine_type: type, ownership: own, supplier, status, current_project: project, hourly_rate: rate, pm_interval_hours: 250, ...(own === "Owned" ? { serial_no: `SN-${code.slice(4)}-${2019 + Math.floor(h(`y${code}`) * 6)}` } : {}), last_meter: 1200 + Math.round(h(code) * 6000), fuel_rate: fuel, company: C, owner: "pm@dcc.test" });
    if (project) put("Digit Equipment Assignment", `EQA-${code}`, { machinery: code, project, company: C, from_date: addDays(T, -150 - Math.round(h(`f${code}`) * 60)), to_date: addDays(T, 120), status: "Active", note: own === "Rented" ? "مستأجرة بعقد شهري" : "", owner: "pm@dcc.test" });
  }
  // cost-code tree (groups, missing children, one retired code) — the connected demo's codes are filed under their group once
  for (const [code, en, ar] of CC_GROUPS) put("Digit Cost Code", code, { code, description: en, description_ar: ar, category: "Other", is_group: 1, is_active: "Yes", owner: "Administrator" });
  for (const [code, en, ar, category] of CC_CHILDREN) if (!adapter.get("Digit Cost Code", code)) put("Digit Cost Code", code, { code, description: en, description_ar: ar, category, parent_cost_code: code.slice(0, 5), is_group: 0, is_active: "Yes", owner: "Administrator" });
  put("Digit Cost Code", "CC-02.09", { code: "CC-02.09", description: "Precast concrete (retired)", description_ar: "خرسانة سابقة الصب (موقوف)", category: "Materials", parent_cost_code: "CC-02", is_group: 0, is_active: "No", notes: "أوقف بعد توحيد بنود الخرسانة — لا يُستخدم في الموازنات أو أوامر الشراء", owner: "Administrator" });
  for (const d of adapter.list("Digit Cost Code")) {
    const code = String(d["code"] ?? d.name);
    if (/^CC-\d\d\.\d\d$/.test(code) && !d["parent_cost_code"] && String(d["owner"] ?? "Administrator") === "Administrator" && adapter.get("Digit Cost Code", code.slice(0, 5))) adapter.insertDocQuiet("Digit Cost Code", { ...d, parent_cost_code: code.slice(0, 5) });
  }
  // rate master (valid and expired)
  const RATES: [string, string, string, string, number, number][] = [
    ["RT-LAB-MASON", "عامل بناء — يومية", "Labour", "Day", 260, 200], ["RT-LAB-HELPER", "عامل مساعد — يومية", "Labour", "Day", 160, 200], ["RT-LAB-ELEC", "فني كهرباء — يومية", "Labour", "Day", 320, 150],
    ["RT-LAB-OPR", "مشغل معدات — يومية", "Labour", "Day", 320, -20], ["RT-EQ-EXC", "حفار 20 طن — ساعة", "Equipment", "Hour", 230, 120], ["RT-EQ-CRN", "رافعة متحركة 50 طن — ساعة", "Equipment", "Hour", 380, -45],
    ["RT-EQ-TRK", "قلاب 20 م³ — ساعة", "Equipment", "Hour", 140, 90], ["RT-MAT-HDPE", "أنابيب HDPE 315 مم — متر", "Material", "m", 185, 60], ["RT-MAT-ASPH", "خلطة إسفلتية — طن", "Material", "Ton", 265, -10],
    ["RT-MAT-GYP", "ألواح جبس — م²", "Material", "m²", 38, 75], ["RT-MAT-TILE", "بلاط بورسلان — م²", "Material", "m²", 118, -60], ["RT-MAT-CABLE", "كابلات نحاس 4×16 — متر", "Material", "m", 42, 30],
    ["RT-SUB-PAINT", "دهان داخلي مصنعية — م²", "Subcontract", "m²", 14, 180], ["RT-SUB-CEIL", "أسقف معلقة مصنعية — م²", "Subcontract", "m²", 46, -90], ["RT-SUB-DUCT", "تركيب مجاري هواء — م²", "Subcontract", "m²", 58, 140],
    ["RT-SUB-NET", "تمديد أنابيب شبكات — متر", "Subcontract", "m", 41, 100], ["RT-OH-SITE", "مصاريف موقع شهرية", "Overhead", "LS", 85000, 240], ["RT-OH-CAMP", "سكن العمالة — شهري", "Overhead", "LS", 42000, -5],
    ["RT-EQ-GEN", "مولد 250 ك.ف.أ — يوم", "Equipment", "Day", 480, 60], ["RT-MAT-BASE", "طبقة أساس مدرج — م³", "Material", "m³", 62, 45],
  ];
  RATES.forEach(([code, name, category, uom, rate, validDays], i) => ctx.putC("Digit Construction Rate", code, { rate_code: code, rate_name: name, category, uom, current_rate: rate, currency: "SAR", effective_date: addDays(T, -300 + i * 5),
    valid_until: addDays(T, validDays), validity_reference: validDays < 0 ? "انتهت صلاحية السعر — يلزم تحديثه قبل التسعير" : "عرض سعر معتمد", disabled: 0, owner: "estimator@dcc.test" }));
  // site warehouses and the long-lead / direct-purchase items
  for (const wh of Object.values(SITE_WH)) put("Warehouse", `${wh} - ${A}`, { warehouse_name: wh, company: C, is_group: 0, parent_warehouse: "", owner: "Administrator" });
  const items = new Map<string, [string, string, number]>();
  for (const list of Object.values(MATS)) for (const [code, name, uom, , , , , lead] of list) items.set(code, [name, uom, lead]);
  for (const [code, name, uom, lead] of LONG_LEAD_ITEMS) items.set(code, [name, uom, lead]);
  for (const [code, [name, uom, lead]] of items) if (!adapter.get("Item", code)) put("Item", code, { item_code: code, item_name: name, item_group: "Construction Materials", stock_uom: uom, is_stock_item: 1, is_purchase_item: 1, lead_time_days: lead, description: name, disabled: 0, uoms: [{ idx: 1, uom, conversion_factor: 1 }] });
}

// ------------------------------------------------------------------------------------------------ activity
const purchaseTaxes = (net: number) => { const tax = r2(net * 0.15); return { tax, rows: [{ idx: 1, charge_type: "On Net Total", account_head: acct("VAT 15% Input"), description: "VAT 15%", rate: 15, net_amount: net, base_net_amount: net, tax_amount: tax, base_tax_amount: tax, total: r2(net + tax), base_total: r2(net + tax), category: "Total", add_deduct_tax: "Add" }] }; };
const totals = (net: number, tax: number) => ({ total: net, net_total: net, base_net_total: net, total_taxes_and_charges: tax, grand_total: r2(net + tax), base_grand_total: r2(net + tax), rounded_total: r2(net + tax), disable_rounded_total: 1, currency: "SAR", conversion_rate: 1 });
const supName = (id: string) => String(adapter.get("Supplier", id)?.["supplier_name"] ?? id);
const recompute = (dt: string, name: string) => { const d = adapter.get(dt, name); if (!d || !d["__sample"]) return; const res = computeDoc(dt, d, d); adapter.insertDocQuiet(dt, { ...d, ...res.doc }); };
const comment = (ctx: PortfolioCtx, name: string, dt: string, ref: string, content: string, user: string, date: string, type = "Workflow") =>
  ctx.put("Comment", name, { comment_type: type, reference_doctype: dt, reference_name: ref, content, comment_email: user, owner: user, creation: iso(date) });

function procurement(ctx: PortfolioCtx, f: ProjectFacts): void {
  const mats = MATS[f.tpl] ?? []; if (!mats.length) return;
  const WH = siteWarehouse(f.id);
  mats.forEach(([item, iname, uom, qty, rate, cc, bidders, lead, long], mi) => {
    const k = `${A}-${f.id}`; const sups = bidders.map((b) => `${A}-SUP-${b}`);
    const d0 = [addDays(CUTOFF, -150), addDays(CUTOFF, -75), addDays(CUTOFF, -60)][mi]! < addDays(f.start, 20) ? addDays(f.start, 20 + mi * 15) : [addDays(CUTOFF, -150), addDays(CUTOFF, -75), addDays(CUTOFF, -60)][mi]!;
    const mr = `${k}-MR-${mi + 1}`, rfq = `${k}-RFQ-${mi + 1}`, po = `${k}-PO-D${mi + 1}`;
    const mrDate = addDays(d0, -14), need = addDays(d0, lead);
    const base = { item_code: item, item_name: iname, description: iname, uom, stock_uom: uom, conversion_factor: 1, project: f.project, digit_cost_code: cc };
    ctx.put("Material Request", mr, { naming_series: "MAT-MR-.YYYY.-", material_request_type: "Purchase", transaction_date: mrDate, schedule_date: need, company: C, set_warehouse: WH, project: f.project, status: "Ordered", per_ordered: 100, docstatus: 1, owner: "site@dcc.test", creation: iso(mrDate),
      items: [{ idx: 1, name: `${mr}-1`, ...base, qty, stock_qty: qty, schedule_date: need, warehouse: WH, ordered_qty: qty }] });
    ctx.put("Request for Quotation", rfq, { naming_series: "PUR-RFQ-.YYYY.-", transaction_date: addDays(mrDate, 3), company: C, status: "Submitted", docstatus: 1, owner: "procurement@dcc.test", creation: iso(addDays(mrDate, 3)),
      message_for_supplier: `نرجو تقديم عرض سعر لتوريد ${iname} إلى ${SITE_WH[f.id] ?? "الموقع"} خلال ${lead} يوماً.`,
      suppliers: sups.map((s, i) => ({ idx: i + 1, supplier: s, supplier_name: supName(s), quote_status: "Received" })),
      items: [{ idx: 1, name: `${rfq}-1`, ...base, qty, schedule_date: need, warehouse: WH, material_request: mr, material_request_item: `${mr}-1` }] });
    const factors = [1.05, 0.98, 1.03];
    sups.forEach((s, i) => {
      const r0 = r2(rate * factors[i]!), net = lineAmount(qty, r0), t = purchaseTaxes(net);
      ctx.put("Supplier Quotation", `${k}-SQ-${mi + 1}${i + 1}`, { naming_series: "PUR-SQTN-.YYYY.-", supplier: s, supplier_name: supName(s), transaction_date: addDays(mrDate, 8 + i), valid_till: addDays(mrDate, 40), company: C, buying_price_list: "Standard Buying", taxes_and_charges: `KSA VAT 15% Input - ${A}`,
        items: [{ idx: 1, name: `${k}-SQ-${mi + 1}${i + 1}-1`, ...base, qty, rate: r0, amount: net, net_rate: r0, net_amount: net, lead_time_days: lead + (i - 1) * 7, request_for_quotation: rfq, request_for_quotation_item: `${rfq}-1`, material_request: mr, material_request_item: `${mr}-1`, warehouse: WH }],
        ...totals(net, t.tax), taxes: t.rows, status: i === 1 ? "Ordered" : "Submitted", docstatus: 1, owner: "procurement@dcc.test", creation: iso(addDays(mrDate, 8 + i)) });
    });
    const win = sups[1]!, wrate = r2(rate * factors[1]!);
    // received share at the cut-off: long lead not yet delivered; first material 60 % (partly received); second late (due, nothing in)
    const recvShare = long ? 0 : mi === 0 ? 0.6 : 0.25;
    const late = !long && mi === 1;
    const sched = late ? addDays(CUTOFF, -18) : long ? addDays(d0, lead) : addDays(d0, lead);
    const recvQty = Math.round(qty * recvShare), rej = mi === 0 ? Math.max(1, Math.round(recvQty * 0.03)) : 0, acc = recvQty - rej;
    const net = lineAmount(qty, wrate), t = purchaseTaxes(net);
    const poRow = `${po}-1`;
    ctx.put("Purchase Order", po, { naming_series: "PUR-ORD-.YYYY.-", company: C, supplier: win, supplier_name: supName(win), buying_price_list: "Standard Buying", taxes_and_charges: `KSA VAT 15% Input - ${A}`, transaction_date: d0, schedule_date: sched, set_warehouse: WH, project: f.project,
      items: [{ idx: 1, name: poRow, ...base, qty, stock_qty: qty, rate: wrate, amount: net, net_rate: wrate, net_amount: net, schedule_date: sched, warehouse: WH, received_qty: acc, billed_amt: lineAmount(acc, wrate), digit_cost_category: "Material",
        material_request: mr, material_request_item: `${mr}-1`, supplier_quotation: `${k}-SQ-${mi + 1}2`, supplier_quotation_item: `${k}-SQ-${mi + 1}2-1`, lead_time_days: lead }],
      ...totals(net, t.tax), taxes: t.rows, status: "To Receive and Bill", per_received: r2((acc / qty) * 100), per_billed: r2((acc / qty) * 100), docstatus: 1, owner: "procurement@dcc.test", creation: iso(d0),
      ...(long ? { digit_long_lead: 1 } : {}), ...(late ? { remarks: "تأخر المورد عن موعد التسليم — تمت المطالبة كتابياً" } : {}) });
    comment(ctx, `${po}-WF`, "Purchase Order", po, "Approved", "pm@dcc.test", addDays(d0, 1));
    if (!(recvQty > 0)) return;
    const pr = `${k}-PR-D${mi + 1}`, rdate = addDays(d0, Math.min(lead, Math.max(5, days(d0, CUTOFF) - 10)));
    const rnet = lineAmount(acc, wrate), rt = purchaseTaxes(rnet);
    ctx.put("Purchase Receipt", pr, { naming_series: "MAT-PRE-.YYYY.-", company: C, supplier: win, supplier_name: supName(win), buying_price_list: "Standard Buying", taxes_and_charges: `KSA VAT 15% Input - ${A}`, posting_date: rdate, set_warehouse: WH, project: f.project,
      items: [{ idx: 1, name: `${pr}-1`, ...base, qty: acc, received_qty: recvQty, rejected_qty: rej, stock_qty: acc, rate: wrate, amount: rnet, net_rate: wrate, net_amount: rnet, valuation_rate: wrate, warehouse: WH, ...(rej ? { rejected_warehouse: WH_C, digit_rejection_reason: "تلف في التغليف أثناء النقل — أعيد للمورد" } : {}),
        purchase_order: po, purchase_order_item: poRow }],
      ...totals(rnet, rt.tax), taxes: rt.rows, status: "To Bill", per_billed: 100, docstatus: 1, owner: "site@dcc.test", creation: iso(rdate) });
    ctx.voucher("Purchase Receipt", pr);
    // three-way match: the fit-out tile invoice is billed 6 % above the order and held for matching
    const hold = f.id === "V06" && mi === 1;
    const irate = hold ? r2(wrate * 1.06) : wrate, inet = lineAmount(acc, irate), it = purchaseTaxes(inet), idate = addDays(rdate, 4);
    const pi = `${k}-PINV-D${mi + 1}`, paid = !hold && days(idate, CUTOFF) > 45;
    ctx.put("Purchase Invoice", pi, { naming_series: "ACC-PINV-.YYYY.-", company: C, supplier: win, supplier_name: supName(win), buying_price_list: "Standard Buying", taxes_and_charges: `KSA VAT 15% Input - ${A}`, posting_date: idate, bill_no: `${win.slice(-4)}-${f.id}${mi + 1}`, bill_date: idate,
      due_date: addDays(idate, 30), credit_to: acct("Creditors"), project: f.project,
      items: [{ idx: 1, name: `${pi}-1`, ...base, qty: acc, rate: irate, amount: inet, net_rate: irate, net_amount: inet, purchase_order: po, po_detail: poRow, purchase_receipt: pr, pr_detail: `${pr}-1`, expense_account: acct("Construction Materials"), cost_center: acct("Projects"), digit_cost_category: "Material" }],
      ...totals(inet, it.tax), taxes: it.rows, outstanding_amount: paid ? 0 : r2(inet + it.tax), status: paid ? "Paid" : hold ? "Unpaid" : addDays(idate, 30) < CUTOFF ? "Overdue" : "Unpaid", docstatus: 1, owner: "finance@dcc.test", creation: iso(idate),
      ...(hold ? { on_hold: 1, hold_comment: "فرق سعر 6% عن أمر الشراء — موقوف حتى المطابقة الثلاثية", release_date: addDays(CUTOFF, 20) } : {}) });
    ctx.voucher("Purchase Invoice", pi);
    if (paid) {
      const pn = `${k}-PE-D${mi + 1}`, pd = addDays(idate, 30);
      ctx.put("Payment Entry", pn, { naming_series: "ACC-PAY-.YYYY.-", payment_type: "Pay", party_type: "Supplier", party: win, party_name: supName(win), company: C, posting_date: pd, paid_from: acct("Al-Rajhi Demo Bank"), paid_to: acct("Creditors"), paid_amount: r2(inet + it.tax), received_amount: r2(inet + it.tax),
        mode_of_payment: "Bank Transfer", reference_no: `TRF-${f.id}D${mi + 1}`, reference_date: pd, project: f.project, references: [{ idx: 1, reference_doctype: "Purchase Invoice", reference_name: pi, total_amount: r2(inet + it.tax), outstanding_amount: r2(inet + it.tax), allocated_amount: r2(inet + it.tax) }],
        unallocated_amount: 0, status: "Submitted", docstatus: 1, creation: iso(pd) });
      ctx.voucher("Payment Entry", pn);
    }
    // site issue to the works (70 % of what was accepted) and, for the first material, a return of unused stock
    const issue = Math.round(acc * 0.7);
    if (issue > 0) {
      const task = f.tasks.find((t) => t.cc === cc)?.task ?? f.tasks[0]?.task;
      const se = `${k}-STE-I${mi + 1}`, sd = addDays(rdate, 6);
      ctx.put("Stock Entry", se, { naming_series: "MAT-STE-.YYYY.-", stock_entry_type: "Material Issue", purpose: "Material Issue", company: C, posting_date: sd, posting_time: "10:00:00", project: f.project, from_warehouse: WH, remarks: `صرف ${iname} للأعمال`, docstatus: 1, owner: "site@dcc.test", creation: iso(sd),
        items: [{ idx: 1, s_warehouse: WH, item_code: item, item_name: iname, qty: issue, transfer_qty: issue, uom, stock_uom: uom, conversion_factor: 1, basic_rate: wrate, valuation_rate: wrate, basic_amount: lineAmount(issue, wrate), amount: lineAmount(issue, wrate), project: f.project, digit_cost_code: cc, digit_task: task, cost_center: acct("Projects") }] });
      ctx.voucher("Stock Entry", se);
      if (mi === 0) {
        const back = Math.max(1, Math.round(issue * 0.05)), sr = `${k}-STE-R${mi + 1}`, rd = addDays(sd, 9);
        ctx.put("Stock Entry", sr, { naming_series: "MAT-STE-.YYYY.-", stock_entry_type: "Material Receipt", purpose: "Material Receipt", company: C, posting_date: rd, posting_time: "15:00:00", project: f.project, to_warehouse: WH, remarks: `مرتجع ${iname} غير مستخدم من الموقع`, docstatus: 1, owner: "site@dcc.test", creation: iso(rd),
          items: [{ idx: 1, t_warehouse: WH, item_code: item, item_name: iname, qty: back, transfer_qty: back, uom, stock_uom: uom, conversion_factor: 1, basic_rate: wrate, valuation_rate: wrate, basic_amount: lineAmount(back, wrate), amount: lineAmount(back, wrate), project: f.project, digit_cost_code: cc, cost_center: acct("Projects") }] });
        ctx.voucher("Stock Entry", sr);
      }
    }
  });
  // an order closed with open quantity — approved by the Project Manager (DEC-112) and stamped on the order
  const [item, iname, uom, qty, rate, cc] = mats[0]!;
  const po = `${A}-${f.id}-PO-C1`, d = addDays(CUTOFF, -120) < f.start ? addDays(f.start, 25) : addDays(CUTOFF, -120), q = Math.round(qty * 0.1), rcv = Math.round(q * 0.85);
  const net = lineAmount(q, rate), t = purchaseTaxes(net), sup = `${A}-SUP-${MATS[f.tpl]![0]![6][0]}`;
  ctx.put("Purchase Order", po, { naming_series: "PUR-ORD-.YYYY.-", company: C, supplier: sup, supplier_name: supName(sup), buying_price_list: "Standard Buying", taxes_and_charges: `KSA VAT 15% Input - ${A}`, transaction_date: d, schedule_date: addDays(d, 14), set_warehouse: siteWarehouse(f.id), project: f.project,
    items: [{ idx: 1, name: `${po}-1`, item_code: item, item_name: iname, description: iname, uom, stock_uom: uom, conversion_factor: 1, qty: q, stock_qty: q, rate, amount: net, net_rate: rate, net_amount: net, received_qty: rcv, billed_amt: lineAmount(rcv, rate), project: f.project, digit_cost_code: cc, digit_cost_category: "Material", warehouse: siteWarehouse(f.id) }],
    ...totals(net, t.tax), taxes: t.rows, status: "Closed", per_received: 85, per_billed: 85, docstatus: 1, digit_close_approved_by: "pm@dcc.test", digit_close_approved_on: addDays(d, 40), owner: "procurement@dcc.test", creation: iso(d),
    remarks: "أغلق بكمية مفتوحة 15% بعد تغيير المواصفة — باعتماد مدير المشروع" });
  comment(ctx, `${po}-WF`, "Purchase Order", po, "Closed", "pm@dcc.test", addDays(d, 40));
}

const RFI_POOL: [string, string, string][] = [
  ["تعارض منسوب الصرف مع خط المياه القائم", "يظهر في الموقع خط مياه قائم على منسوب أعلى من المذكور في المخطط. نرجو تأكيد المنسوب المعتمد.", "إعادة توجيه خط الصرف بمسافة 1.5 م حسب المقطع المرفق."],
  ["اعتماد بديل لمادة العزل المائي", "المادة المحددة غير متوفرة محلياً قبل 10 أسابيع. هل يُقبل البديل المكافئ المرفق؟", "يُقبل البديل بشرط تقديم شهادة المطابقة."],
  ["تفاصيل تثبيت الأسقف المعلقة في المناطق الرطبة", "لم تُذكر طريقة التثبيت في دورات المياه. نرجو التوضيح.", "تُستخدم علاقات مجلفنة كل 60 سم حسب التفصيلة D-14."],
  ["تنسيق مسارات مجاري الهواء مع الرشاشات", "تعارض بين مجاري الهواء ورؤوس الرشاشات في الممر الرئيسي.", "تُخفض مجاري الهواء 15 سم ويُعاد توزيع الرشاشات."],
  ["تأكيد سماكة طبقة الإسفلت عند التقاطعات", "المخطط يذكر 5 سم والمواصفة 7 سم عند التقاطعات. أيهما يُطبّق؟", "تُطبّق 7 سم عند التقاطعات حسب المواصفة."],
  ["موقع غرفة الكهرباء الفرعية", "الموقع المقترح يتعارض مع مسار الخدمات الأرضية.", ""],
  ["نوع الدهان في الممرات الطبية", "هل يُطلب دهان مضاد للبكتيريا في جميع الممرات أم في غرف العمليات فقط؟", ""],
  ["تصريف مياه السطح عند الفواصل", "لا توجد تفاصيل لتصريف المياه عند فواصل التمدد.", ""],
];
function changes(ctx: PortfolioCtx, f: ProjectFacts): void {
  const T = today(); const k = f.id;
  const states: [string, number, number, boolean][] = [["Open", -5, 6, false], ["Open", -26, -12, false], ["Answered", -40, -30, true], ["Closed", -70, -60, true], ["Answered", -35, -25, true], ["Draft", 0, 10, false]];
  states.forEach(([state, sent, due, answered], i) => {
    const [subject, question, response] = RFI_POOL[(i + k.charCodeAt(2)) % RFI_POOL.length]!;
    ctx.putC("Digit RFI", `RFI-${k}-${pad(i + 1)}`, { project: f.project, company: C, subject, question, workflow_state: state, ...(state === "Draft" ? {} : { sent_on: addDays(T, sent) }), due_date: addDays(T, due), ball_in_court: answered ? "pm@dcc.test" : "consultant@dcc.test",
      rfi_type: i % 2 ? "Design" : "Technical", priority: i === 1 ? "High" : "Medium", cost_impact: i === 4 ? "Yes" : i === 2 || i === 3 ? "No" : "TBD",
      ...(answered ? { answered_on: addDays(T, due - 3), answered_by: "consultant@dcc.test", official_response: response || "يُنفّذ حسب المخطط المعتمد." } : {}), owner: "site@dcc.test", creation: iso(addDays(T, sent - 1)) });
  });
  const scc = f.wos[0]?.cc ?? f.tasks[0]?.cc ?? "CC-90";
  const sub1 = f.wos[0]?.sub ?? `${A}-SUB-FIN`, sub2 = f.wos[1]?.sub ?? `${A}-SUB-MEP`;
  const amt = (x: number) => Math.round((f.value * x) / 1000) * 1000;
  const CE: [string, string, string, number, number, string][] = [
    ["إعادة توجيه الأعمال حسب رد الاستفسار", "RFI", "Approved", amt(0.012), 12, `RFI-${k}-05`],
    ["أعمال إضافية بطلب المالك — توسعة المدخل الرئيسي", "Owner Request", "Approved", amt(0.018), 20, ""],
    ["تعديل تصميمي على المسارات الفنية", "Design Change", "Pricing Requested", amt(0.008), 7, ""],
    ["ظروف موقع غير متوقعة — تربة ضعيفة", "Site Condition", "Under Review", amt(0.006), 10, ""],
  ];
  if (k === "V06") CE.push(["طلب ترقية مواصفة الأرضيات", "Owner Request", "Rejected", amt(0.01), 0, ""]);
  CE.forEach(([title, source, state, cost, dd, rfi], i) => {
    const name = `CE-${k}-${pad(i + 1)}`, d = addDays(T, -75 + i * 14);
    ctx.putC("Digit Change Event", name, { title, project: f.project, company: C, contract: f.contract, ce_date: d, source_type: source, ...(rfi ? { source_rfi: rfi } : {}), workflow_state: state, scope: "Out of Scope", cost_impact: cost, time_impact_days: dd, raised_by: "qs@dcc.test",
      description: `${title} — ${f.title}`, ...(state === "Approved" || state === "Rejected" ? { decided_by: "pm@dcc.test", decided_on: addDays(d, 9) } : {}),
      ...(state === "Rejected" ? { decision_note: "خارج نطاق العقد — يُعالج كطلب ترقية على حساب المالك بعد التسعير" } : {}),
      ...(state === "Pricing Requested" ? { pricing_sent_on: addDays(d, 2), pricing_due_on: addDays(T, 5) } : {}),
      pricing_responses: state === "Under Review" ? [] : [
        { idx: 1, supplier: sub1, status: "Received", requested_on: addDays(d, 2), due_on: addDays(d, 12), received_on: addDays(d, 8), quoted_amount: Math.round(cost * 0.78), quoted_days: dd },
        { idx: 2, supplier: sub2, status: state === "Pricing Requested" ? "Requested" : "Received", requested_on: addDays(d, 2), due_on: state === "Pricing Requested" ? addDays(T, 5) : addDays(d, 12), ...(state === "Pricing Requested" ? {} : { received_on: addDays(d, 10), quoted_amount: Math.round(cost * 0.83), quoted_days: dd + 3 }) }],
      lines: [{ idx: 1, line_key: "L1", description: title.slice(0, 120), cost_code: scc, direction: "Addition", amount: cost }], owner: "qs@dcc.test", creation: iso(d) });
    if (rfi) ctx.re("Digit RFI", rfi, { change_event: name, change_event_status: state });
  });
  // client variations from the two approved events, then the budget revisions they drive
  [[1, "Approved", "Client Instruction"], [2, "Submitted", "Client Instruction"]].forEach(([i, state, origin]) => {
    const ce = `CE-${k}-${pad(Number(i))}`, ced = adapter.get("Digit Change Event", ce); if (!ced) return;
    const cost = num(ced["cost_impact"]), rev = Math.round((cost * 1.18) / 1000) * 1000, d = addDays(String(ced["ce_date"]), 14), name = `VO-${k}-${pad(Number(i))}`;
    ctx.putC("Digit Client Variation", name, { title: String(ced["title"]), contract: f.contract, project: f.project, company: C, customer: f.cust, change_kind: "Client Variation", origin, source_change_event: ce, workflow_state: state, requested_on: d,
      ...(state === "Approved" ? { approved_on: addDays(d, 12), approved_by: "client.rep@dcc.test", docstatus: 1 } : {}), time_days: num(ced["time_impact_days"]), cost_rom: cost, revenue_rom: rev, expect_revenue: 1,
      lines: [{ idx: 1, line_key: `${name}-1`, description: String(ced["title"]).slice(0, 120), uom: "LS", qty: 1, rate: rev }], owner: "qs@dcc.test", creation: iso(d) }, state === "Approved" ? { docstatus: 1 } : {});
    ctx.re("Digit Change Event", ce, { associated_variation: name });
  });
  recompute("Digit Client Contract", f.contract);
  const vo = adapter.get("Digit Client Variation", `VO-${k}-01`);
  const line = (code: string) => f.budgetLines.find((x) => x === `${k}-${code}`) ?? f.budgetLines[0]!;
  if (vo) ctx.putC("Digit Budget Revision", `BREV-${k}-1`, { budget: f.budget, project: f.project, company: C, linked_variation: vo.name, workflow_state: "Approved", approved_by: "director@dcc.test", approved_on: String(vo["approved_on"] ?? T), reason: `زيادة الموازنة مقابل الأمر التغييري ${vo.name}`,
    deltas: [{ idx: 1, line_key: line(scc), cost_code: scc, delta_amount: num(adapter.get("Digit Change Event", `CE-${k}-01`)?.["cost_impact"]), reason: "تكلفة التغيير المعتمد" }], owner: "qs@dcc.test", creation: iso(String(vo["approved_on"] ?? T)) }, { docstatus: 1, workflow_state: "Approved", approved_by: "director@dcc.test" });
  // J03: the second material order of the job was raised from the approved budget revision (Create From link on the order)
  if (vo && adapter.get("Purchase Order", `${A}-${k}-PO-D2`)) ctx.re("Purchase Order", `${A}-${k}-PO-D2`, { digit_budget_revision: `BREV-${k}-1` });
  const move = Math.round((f.cost * 0.004) / 1000) * 1000;
  const second = f.id === "V06" ? "Submitted" : "Approved";
  ctx.putC("Digit Budget Revision", `BREV-${k}-2`, { budget: f.budget, project: f.project, company: C, workflow_state: second, ...(second === "Approved" ? { approved_by: "director@dcc.test", approved_on: addDays(T, -20) } : {}), reason: "إعادة توزيع من مصاريف الموقع العامة إلى بند التنفيذ",
    deltas: [{ idx: 1, line_key: line("CC-90"), cost_code: "CC-90", delta_amount: -move, reason: "تحويل من الاحتياطي" }, { idx: 2, line_key: line(scc), cost_code: scc, delta_amount: move, reason: "تغطية زيادة الكميات" }], owner: "qs@dcc.test", creation: iso(addDays(T, second === "Approved" ? -24 : -33)) },
    second === "Approved" ? { docstatus: 1, workflow_state: "Approved", approved_by: "director@dcc.test" } : {});
  recompute("Digit Project Cost Budget", f.budget);
  // commercial claim and extension of time
  const CL: Record<string, [string, string, number, number, number]> = { V02: ["Payment Delay", "Disputed", 0.006, 0, 0], V03: ["Delay and Disruption", "Partially Agreed", 0.01, 0.6, 0.45], V05: ["Changed Conditions", "Submitted", 0.012, 0, 0], V06: ["Additional Work", "Draft", 0.005, 0, 0], V07: ["Additional Work", "Under Assessment", 0.009, 0, 0] };
  const cl = CL[k]; if (cl) {
    const [cat, st, x, ass, agr] = cl, claimed = amt(x);
    ctx.putC("Digit Commercial Claim", `CCL-${k}-1`, { title: cat === "Payment Delay" ? "مطالبة تأخر صرف المستخلصات" : cat === "Changed Conditions" ? "مطالبة تغير ظروف الموقع — التربة" : cat === "Delay and Disruption" ? "مطالبة تكاليف إطالة المدة" : "مطالبة أعمال إضافية خارج النطاق",
      contract: f.contract, project: f.project, company: C, customer: f.cust, claim_category: cat, workflow_state: st, event_date: addDays(T, -80), notice_date: addDays(T, -70), claimed_amount: claimed, time_claimed_days: cat === "Payment Delay" ? 0 : 25,
      ...(ass ? { assessed_amount: Math.round(claimed * ass), agreed_amount: Math.round(claimed * agr), decided_by: "pm@dcc.test", decided_on: addDays(T, -15), decision_note: "قُبلت تكاليف المعدات؛ رُفضت المصاريف العامة" } : {}),
      ...(st === "Disputed" ? { disputed_amount: claimed } : {}), source_change_event: `CE-${k}-04`, basis: "حسب المراسلات والمحاضر الموقعة مع ممثل العميل", owner: "qs@dcc.test", creation: iso(addDays(T, -70)) });
  }
  const EOT: Record<string, [string, number, number]> = { V02: ["Submitted", 20, 0], V03: ["Granted", 30, 30], V05: ["Under Review", 45, 0], V06: ["Draft", 15, 0], V07: ["Partially Granted", 40, 25] };
  const eo = EOT[k]; if (eo) {
    const [st, req, gr] = eo;
    ctx.putC("Digit EOT", `EOT-${k}-1`, { title: `تمديد مدة — ${f.title}`, contract: f.contract, project: f.project, company: C, eot_date: addDays(T, -50), workflow_state: st, requested_days: req, granted_days: gr, original_completion_date: f.end, ...(gr ? { revised_completion_date: addDays(f.end, gr), decided_by: "pm@dcc.test", decided_on: addDays(T, -20) } : {}),
      ...(st === "Partially Granted" ? { partial_grant_note: `منحت ${gr} يوماً من ${req}؛ الباقي متزامن مع تأخر المقاول` } : {}), raised_by: "qs@dcc.test", basis: `تأخر اعتماد ${`CE-${k}-02`} وأعمال المالك الإضافية`,
      delay_events: [{ idx: 1, event_ref: "DE-01", description: "انتظار اعتماد الأعمال الإضافية", delay_category: "Employer Risk", start_date: addDays(T, -110), end_date: addDays(T, -110 + req), days_affected: req }], owner: "qs@dcc.test", creation: iso(addDays(T, -50)) });
  }
}

const DISC: Record<string, [string, string][]> = {
  infra: [["Civil", "مقاطع طولية لخط الصرف"], ["Civil", "تفاصيل غرف التفتيش"], ["Civil", "مخطط عام لشبكة المياه"], ["MEP", "محطة الرفع — المخطط الكهربائي"], ["Survey", "رفع مساحي للقطاعات"], ["Civil", "تفاصيل التوصيلات المنزلية"]],
  mep: [["MEP", "مخطط مجاري الهواء — الأدوار النموذجية"], ["MEP", "مخطط السباكة — الأدوار النموذجية"], ["MEP", "مخطط الإنارة والقوى"], ["MEP", "مخطط مكافحة الحريق"], ["Architecture", "مخطط الأسقف المنسقة"], ["MEP", "مخطط غرفة المضخات"]],
  hospital: [["Structure", "مخطط الأساسات"], ["Structure", "تسليح الأسقف — الجناح A"], ["Architecture", "مخطط غرف العمليات"], ["MEP", "مخطط الغازات الطبية"], ["MEP", "مخطط التكييف — العزل"], ["Architecture", "تفاصيل الأرضيات الطبية"]],
  fitout: [["Architecture", "مخطط القواطع — الأدوار المكتبية"], ["Architecture", "مخطط الأسقف المعلقة"], ["Architecture", "جدول الأبواب"], ["Architecture", "مخطط الأرضيات"], ["MEP", "مخطط الإنارة المعدل"], ["Architecture", "تفاصيل دورات المياه"]],
  road: [["Civil", "المقطع الطولي للطريق"], ["Civil", "المقاطع العرضية النموذجية"], ["Civil", "تفاصيل العبارات"], ["Civil", "مخطط الإشارات والعلامات"], ["Survey", "رفع مساحي للمسار"], ["Civil", "تفاصيل التقاطعات"]],
};
function siteDocs(ctx: PortfolioCtx, f: ProjectFacts): void {
  const T = today(), k = f.id, list = DISC[f.tpl] ?? DISC["mep"]!;
  const trm = (i: number) => (i < 3 ? `TRM-${k}-1` : `TRM-${k}-2`);
  list.forEach(([discipline, title], i) => {
    const three = i < 2, cur = three ? "C" : "B";
    const revs = (three ? ["A", "B", "C"] : ["A", "B"]).map((r, j, arr) => ({ idx: j + 1, revision_code: r, issue_date: addDays(T, -150 + j * 45 + i * 3), purpose: j === arr.length - 1 ? "IFC" : j === 0 ? "IFR" : "For Information", is_current: j === arr.length - 1 ? 1 : 0, ...(j === arr.length - 1 ? { transmittal: trm(i) } : {}) }));
    ctx.putC("Digit Drawing", `DRW-${k}-${pad(i + 1)}`, { project: f.project, company: C, drawing_no: `${k}-${discipline.slice(0, 2).toUpperCase()}-${100 + i}`, title, discipline, current_revision: cur, status: "For Construction", drawing_status: "For Construction", revisions: revs, owner: "site@dcc.test", creation: iso(addDays(T, -150 + i * 3)) });
  });
  [[1, "Acknowledged", -40], [2, "Sent", -6]].forEach(([n, st, d]) => {
    const idx = Number(n) === 1 ? [0, 1, 2] : [3, 4, 5];
    ctx.putC("Digit Transmittal", `TRM-${k}-${n}`, { project: f.project, company: C, drawing: `DRW-${k}-${pad(idx[0]! + 1)}`, to_party: "الاستشاري المشرف", from_party: "إدارة المشروع", purpose: "For Construction", workflow_state: st, sent_on: addDays(T, Number(d)), response_due: addDays(T, Number(d) + 7), ...(st === "Acknowledged" ? { acknowledged_on: addDays(T, Number(d) + 2) } : {}),
      items: idx.map((i, j) => ({ idx: j + 1, ref_doctype: "Digit Drawing", ref_name: `DRW-${k}-${pad(i + 1)}`, transmitted_revision: i < 2 ? "C" : "B", description: list[i]![1] })), owner: "site@dcc.test", creation: iso(addDays(T, Number(d))) });
  });
  const longPo = `${A}-${k}-PO-D3`;
  [["Submitted", "Shop Drawing", 4, ""], ["Under Review", "Material", -6, longPo], ["Returned", "Method Statement", -15, ""], ["Closed", "Sample", -45, ""]].forEach(([st, type, ret, po], i) =>
    ctx.putC("Digit Submittal", `SBM-${k}-${i + 1}`, { project: f.project, company: C, title: `${type === "Material" ? "اعتماد مادة" : type === "Sample" ? "عينة" : type === "Method Statement" ? "طريقة تنفيذ" : "مخططات تنفيذية"} — ${list[i]![1]}`, submittal_type: type, spec_section: `0${3 + i}-${200 + i * 10}`, revision: st === "Returned" ? 1 : 0,
      workflow_state: st, ball_in_court: st === "Returned" ? "site@dcc.test" : "consultant@dcc.test", required_on_site: addDays(T, Math.max(10, Number(ret) + (type === "Material" ? 130 : 30))), lead_time_days: type === "Material" ? 120 : 14, review_days: 14,
      ...(st === "Returned" || st === "Closed" ? { review_steps: [{ idx: 1, reviewer: "consultant@dcc.test", outcome: st === "Returned" ? "C" : "A", reviewed_on: addDays(T, Number(ret)), comments: st === "Returned" ? "يُعاد التقديم بعد تعديل التسلسل" : "معتمد" }] } : {}),
      ...(st === "Closed" ? { decision_code: "A", final_response: "Approved", actual_return: addDays(T, Number(ret)) } : st === "Returned" ? { decision_code: "C", actual_return: addDays(T, Number(ret)) } : {}), ...(po && adapter.get("Purchase Order", String(po)) ? { linked_purchase_order: po } : {}),
      owner: "site@dcc.test", creation: iso(addDays(T, Number(ret) - 20)) }));
  [["Issued", "Hot Work", 0], ["Closed", "Excavation", -1], ["Requested", "Work at Height", 1]].forEach(([st, type, d], i) =>
    ctx.putC("Digit Work Permit", `PTW-${k}-${i + 1}`, { project: f.project, company: C, permit_type: type, location: f.tasks[i]?.subject.split(" — ").pop() ?? "الموقع", valid_from: `${addDays(T, Number(d))} 07:00:00`, valid_to: `${addDays(T, Number(d))} 17:00:00`, issuer: "site@dcc.test", receiver: "مشرف الطاقم", status: st,
      precautions: [{ idx: 1, precaution: "عزل منطقة العمل ووضع اللوحات التحذيرية", checked: st === "Requested" ? 0 : 1 }, { idx: 2, precaution: "توفر طفاية حريق ومراقب سلامة", checked: st === "Requested" ? 0 : 1 }, { idx: 3, precaution: "فحص المعدات قبل الاستخدام", checked: st === "Requested" ? 0 : 1 }], owner: "site@dcc.test", creation: iso(addDays(T, Number(d) - 1)) }));
  const work = f.tasks.filter((t) => t.frac > 0);
  [["Pass", "Submitted", -20], ["Fail", "Submitted", -9], ["Partial", "Submitted", -4], ["Pass", "Draft", 0]].forEach(([outcome, st, d], i) =>
    ctx.putC("Digit Inspection", `INS-${k}-${i + 1}`, { project: f.project, company: C, ...(i === 1 ? { transmittal: `TRM-${k}-1` } : {}), task: work[i % Math.max(1, work.length)]?.task, inspection_date: addDays(T, Number(d)), inspector: "site@dcc.test", workflow_state: st, outcome, result: outcome, location: work[i % Math.max(1, work.length)]?.subject.split(" — ").pop(), owner: "site@dcc.test", creation: iso(addDays(T, Number(d))) }));
  const wo = f.wos[0];
  ctx.putC("Digit Defect", `DEF-${k}-1`, { project: f.project, company: C, task: work[1]?.task, title: "عيوب في التنفيذ ظهرت في الفحص", description: "ملاحظات الفحص الفاشل: انحراف عن التفاصيل المعتمدة يتطلب إعادة التنفيذ.", severity: "Major", category: "NCR", defect_type: "NCR", status: "Open", workflow_state: "Open", origin_inspection: `INS-${k}-2`, due_date: addDays(T, 5), assigned_to: "site@dcc.test", detected_on: addDays(T, -9), responsible_party: wo ? "Subcontractor" : "Own Forces", owner: "site@dcc.test", creation: iso(addDays(T, -9)) });
  ctx.putC("Digit Defect", `DEF-${k}-2`, { project: f.project, company: C, task: work[0]?.task, title: "إصلاح أعمال مقاول الباطن على حسابه", description: "تلف في الأعمال المنفذة بسبب سوء الحماية — يُخصم على مقاول الباطن.", severity: "Minor", category: "Defect", defect_type: "Defect", status: "In Progress", workflow_state: "In Progress", due_date: addDays(T, -2), assigned_to: "site@dcc.test", detected_on: addDays(T, -18), responsible_party: "Subcontractor", ...(wo ? { work_order: wo.wo, backcharge: 1, cost_to_fix: 12500, backcharge_status: "Approved" } : {}), owner: "site@dcc.test", creation: iso(addDays(T, -18)) });
  ctx.putC("Digit Defect", `DEF-${k}-3`, { project: f.project, company: C, task: work[0]?.task, title: "تسرب بسيط عند الفاصل", description: "تمت المعالجة وإعادة الفحص بنجاح.", severity: "Minor", category: "Defect", defect_type: "Defect", status: "Closed", workflow_state: "Closed", due_date: addDays(T, -30), detected_on: addDays(T, -40), verified_by: "pm@dcc.test", after_photo: "/demo/site-evidence.jpg", corrective_action: "إعادة العزل وإغلاق الفاصل ثم إعادة الفحص", owner: "site@dcc.test", creation: iso(addDays(T, -40)) });
  if (wo) ctx.putC("Digit Back Charge", `BC-${k}-1`, { project: f.project, company: C, work_order: wo.wo, subcontractor: wo.sub, charge_type: "Defect Rectification", workflow_state: "Approved", defect: `DEF-${k}-2`, description: "تكلفة إصلاح التلف على حساب مقاول الباطن", amount: 12500, deduction_date: addDays(T, 10), cost_code: wo.cc, raised_by: "qs@dcc.test", approved_by: "pm@dcc.test", approved_on: addDays(T, -12), owner: "qs@dcc.test", creation: iso(addDays(T, -14)) });
  if (k === "V07" && f.wos[1]) ctx.putC("Digit Back Charge", `BC-${k}-2`, { project: f.project, company: C, work_order: f.wos[1].wo, subcontractor: f.wos[1].sub, charge_type: "Delay Penalty", source: "Delay Penalty", workflow_state: "Approved", description: "غرامة تأخير 12 يوماً عن البرنامج المعتمد (0.1% يومياً)", amount: 38400, deduction_date: addDays(T, 15), cost_code: f.wos[1].cc, raised_by: "qs@dcc.test", approved_by: "pm@dcc.test", approved_on: addDays(T, -6), owner: "qs@dcc.test", creation: iso(addDays(T, -8)) });
  [["Open", "Major", -3], ["Open", "Minor", 2], ["Ready for Review", "Minor", -1], ["Closed", "Minor", -12], ["Closed", "Major", -20]].forEach(([st, sev, d], i) =>
    ctx.putC("Digit Punch Item", `PUN-${k}-${i + 1}`, { project: f.project, company: C, location: work[i % Math.max(1, work.length)]?.subject.split(" — ").pop() ?? "الموقع", description: ["تشطيب حواف غير منتظم", "تنظيف بقايا المواد", "استكمال العلامات الإرشادية", "إصلاح خدوش الدهان", "تثبيت الأغطية المعدنية"][i], severity: sev, status: st,
      due_date: addDays(T, Number(d) + 7), assigned_to: "site@dcc.test", ...(st === "Closed" || st === "Ready for Review" ? { evidence: "/demo/site-evidence.jpg", evidence_count: 1 } : {}), ...(st === "Closed" ? { closer: "pm@dcc.test", closed_on: addDays(T, Number(d)) } : {}), trade: f.tpl === "mep" ? "MEP" : f.tpl === "fitout" ? "Finishing" : "Civil", owner: "site@dcc.test", creation: iso(addDays(T, Number(d) - 5)) }));
  // weekly look-ahead (last three weeks closed / submitted with PPC, this week draft) and the schedule baseline
  const sunday = (d: string) => addDays(d, -new Date(`${d}T00:00:00Z`).getUTCDay());
  const crew = CREWS.find((c) => c[2] === f.project)?.[0];
  [-21, -14, -7, 0].forEach((off, w) => {
    const ws = sunday(addDays(T, off)), rows = work.slice(0, 4).map((t, j) => { const done = w < 3 && h(`${k}${w}${j}`) > 0.22; const miss = w < 3 && !done;
      return { idx: j + 1, task: t.task, description: t.subject, crew, committed: 1, completed: done ? 1 : 0, planned_from: ws, planned_to: addDays(ws, 4), ...(miss ? { miss_reason: ["Material", "Drawing", "RFI", "Equipment"][j % 4], missed_reason: "تأخر المتطلبات السابقة", constraint: ["Material", "Drawing", "RFI", "Equipment"][j % 4] } : { constraint: "None" }) }; });
    ctx.putC("Digit Lookahead", `LAH-${k}-W${w + 1}`, { project: f.project, company: C, week_start: ws, week_end: addDays(ws, 6), status: w < 2 ? "Closed" : w === 2 ? "Submitted" : "Draft", lookahead_rows: rows, owner: "site@dcc.test", creation: iso(addDays(ws, -2)) });
  });
  ctx.putC("Digit Schedule Baseline", `BSL-${k}`, { project: f.project, company: C, baseline_name: `خط الأساس المعتمد — ${f.title}`, baseline_type: "Project", status: "Active", captured_on: `${addDays(f.start, 10)} 10:00:00`,
    task_snapshots: f.tasks.map((t, i) => ({ idx: i + 1, task: t.task, task_subject: t.subject, baseline_start: t.from, baseline_end: addDays(t.to, -7), duration_days: days(t.from, t.to), progress_at_capture: 0, weight: 1 })), owner: "pm@dcc.test", creation: iso(addDays(f.start, 10)) });
  const RISKS: [string, string, number, number, number, number, string][] = [["تأخر توريد المواد طويلة التوريد", "Supply", 4, 3, 0.01, 35, "Mitigate"], ["نقص العمالة الفنية في ذروة الأعمال", "Schedule", 3, 4, 0.006, 40, "Transfer"], ["ارتفاع أسعار المواد", "Commercial", 3, 3, 0.008, 30, "Accept"]];
  RISKS.forEach(([title, cat, imp, prob, x, pct, resp], i) => ctx.putC("Digit Risk", `RISK-${k}-${i + 1}`, { title, project: f.project, company: C, category: cat, impact_score: String(imp), probability_score: String(prob), risk_score: imp * prob, potential_cost: Math.round(f.value * x), probability_pct: pct,
    cost_exposure: Math.round((f.value * x * pct) / 100), time_days: 10 + i * 10, response: resp, mitigation: "متابعة أسبوعية في اجتماع المشروع", workflow_state: "Active", owner_user: "pm@dcc.test", due_date: addDays(T, 20 + i * 10), owner: "pm@dcc.test" }));
  // quantity take-off from the tender (first five tender items) on the first drawing
  const tender = adapter.get("Digit Tender", f.tender);
  const tItems = rowsOf(tender?.["items"]).slice(0, 5);
  if (tItems.length) ctx.putC("Digit Takeoff Sheet", `TOS-${k}-1`, { tender: f.tender, title: `حصر كميات — ${f.title}`, drawing: `DRW-${k}-01`, drawing_revision: "A", status: "Reviewed", reviewed: 1, reviewed_by: "estimator@dcc.test", reviewed_on: addDays(f.start, -70), source_kind: "2D", measurement_method: "Volume", unit: "m",
    dimensions: tItems.map((it, i) => ({ idx: i + 1, item_key: it["item_key"], description: it["description"], nos: 1, length: 0, breadth: 0, depth: 0, uom: it["uom"], quantity: num(it["qty"]) })), owner: "estimator@dcc.test", creation: iso(addDays(f.start, -80)) });
}

/** monthly forecast snapshots (latest approved, earlier superseded); the fit-out and MEP hotel forecasts show margin fade */
function forecasts(ctx: PortfolioCtx, f: ProjectFacts): void {
  const months = f.monthly.map((m) => m.e).filter((e) => e >= addDays(f.start, 45)).slice(-12);
  const fade = f.id === "V06" || f.id === "V03";
  months.forEach((cut, i) => {
    const last = i === months.length - 1, name = `FCS-${f.id}-${cut.slice(0, 7).replace("-", "")}`;
    const data: Row = { project: f.project, company: C, budget: f.budget, period: cut.slice(0, 7), cutoff_date: cut, workflow_state: "Approved", visibility: "Shared", prepared_by: "qs@dcc.test", currency: "SAR", version: i + 1, owner: "qs@dcc.test", creation: iso(addDays(cut, 3)), lines: [] };
    if (fade) {
      const pre = computeDoc("Digit Cost Forecast Snapshot", { ...data, name, doctype: "Digit Cost Forecast Snapshot" } as Doc);
      data["lines"] = rowsOf(pre.doc["lines"]).map((l) => ({ line_key: l["line_key"], cost_code: l["cost_code"], method: "Manual ETC", manual_etc: r2(Math.max(0, num(l["revised_budget"]) - num(l["actual"])) * (1 + 0.018 * (i + 1))), confidence: i > 8 ? "Low" : "Medium", note: "زيادة تكلفة العمالة والمواد المتبقية" }));
    }
    ctx.putC("Digit Cost Forecast Snapshot", name, data, { docstatus: 1, workflow_state: last ? "Approved" : "Superseded", approved_by: "director@dcc.test" });
  });
}

function cashForecast(ctx: PortfolioCtx, f: ProjectFacts): void {
  const rest = Math.max(0, f.value * (1 - f.pct / 100)), monthly = rest / Math.max(3, Math.round(days(CUTOFF, f.end) / 30));
  ["2027-01", "2027-02", "2027-03", "2027-04"].forEach((period, i) =>
    ([["Inflow", "Client Collection", 1, "Next certificate per programme"], ["Outflow", "Subcontractor", 0.55, "Committed work orders"], ["Outflow", "Supplier", 0.2, "Open purchase orders"], ["Outflow", "Labour", 0.08, "Crew plan"]] as const).forEach(([dir, cat, x, basis], j) =>
      ctx.putC("Digit Cashflow Forecast Item", `CFI-${f.id}-${period.replace("-", "")}-${j + 1}`, { project: f.project, company: C, period, direction: dir, category: cat, amount: Math.round((monthly * x * (1 - i * 0.05)) / 1000) * 1000, status: i === 0 ? "Committed" : "Planned", basis, owner: "finance@dcc.test" })));
}

/** the last 90 days, Sunday–Thursday: site report per project, attendance per crew, machinery usage per deployed machine (60 days) */
function siteDiary(ctx: PortfolioCtx, facts: ProjectFacts[]): void {
  const T = today();
  const seen = (dt: string, a: string, b: string) => new Set(adapter.list(dt).map((d) => `${String(d[a])}|${String(d[b])}`));
  const sarSeen = seen("Digit Site Activity Report", "project", "report_date"), attSeen = seen("Digit Field Attendance", "crew", "attendance_date"), muSeen = seen("Digit Machinery Usage", "machinery", "usage_date");
  const active = [`${A}-PRJ-A`, `${A}-PRJ-B`, ...facts.filter((f) => !f.done && !f.hold).map((f) => f.project)];
  const city = (p: string) => facts.find((f) => f.project === p)?.city ?? "الرياض";
  const tasksOf = (p: string) => adapter.list("Task").filter((t) => t["project"] === p && !t["is_group"] && t["status"] !== "Completed" && t["status"] !== "Cancelled").slice(0, 6);
  const crewsOf = (p: string) => adapter.list("Digit Crew").filter((c) => c["project"] === p && c["status"] === "Active");
  const machinesOf = (p: string) => adapter.list("Digit Machinery").filter((m) => m["current_project"] === p && m["status"] === "Deployed");
  const workdays: string[] = [];
  for (let i = 0; i < 90; i++) { const d = addDays(T, -i); if (new Date(`${d}T00:00:00Z`).getUTCDay() <= 4) workdays.push(d); }
  workdays.reverse();
  for (const p of active) {
    const tasks = tasksOf(p), crews = crewsOf(p), machines = machinesOf(p), key = p.replace(`${A}-`, "").replace("-PRJ", "");
    const meters = new Map(machines.map((m) => [m.name, num(m["last_meter"])]));
    const operator = crews.flatMap((c) => rowsOf(c["members"])).find((m) => m["crew_role"] === "Operator")?.["employee"];
    workdays.forEach((d, di) => {
      const isToday = d === T, mo = Number(d.slice(5, 7));
      const r = h(`w${p}${d}`), rain = city(p) === "أبها" && r < 0.12 && (mo >= 7 || mo <= 3);
      const weather = rain ? "Rain" : mo >= 6 && mo <= 9 ? "Hot" : mo === 10 ? (r < 0.6 ? "Hot" : "Dusty") : r < 0.45 ? "Clear" : r < 0.75 ? "Windy" : "Dusty";
      const incident = h(`i${p}${d}`) < 0.025;
      const delayH = rain ? 3 : h(`d${p}${d}`) < 0.08 ? 2 : 0;
      let present = 0;
      for (const c of crews) {
        if (attSeen.has(`${c.name}|${d}`)) continue;
        const emps = rowsOf(c["members"]).map((m, j) => { const x = hv(`a|${c.name}|${d}|${j}`); const att = x < 0.04 ? "Absent" : x < 0.07 ? "On Leave" : x < 0.1 ? "Half Day" : "Present";
          if (att === "Present" || att === "Half Day") present++;
          return { idx: j + 1, employee: m["employee"], employee_name: m["employee_name"], attendance: att, hours: att === "Present" ? 8 : att === "Half Day" ? 4 : 0, overtime_hours: att === "Present" && hv(`o|${c.name}|${d}|${j}`) < 0.22 ? 2 : 0, task: tasks[(j + di) % Math.max(1, tasks.length)]?.name }; });
        const wf = isToday ? "Draft" : di === workdays.length - 2 ? "Reviewed" : "Approved";
        ctx.putC("Digit Field Attendance", `FATT-${c.name}-${ymd(d)}`, { project: p, company: C, attendance_date: d, crew: c.name, shift: "Day", employees: emps, workflow_state: wf, status: isToday ? "Draft" : "Submitted", ...(wf === "Approved" ? { reviewed_by: "site@dcc.test", approved_by: "pm@dcc.test", approved_on: d } : {}), owner: "site@dcc.test", creation: iso(d) },
          isToday ? {} : { docstatus: 1 });
      }
      if (!sarSeen.has(`${p}|${d}`)) {
        const acts = tasks.slice(0, 3).map((t, j) => ({ idx: j + 1, activity: String(t["subject"] ?? t.name), task: t.name, crew: crews[j % Math.max(1, crews.length)]?.name, hours: delayH ? 8 - delayH : 8, qty: Math.round(5 + h(`q${t.name}${d}`) * 40), uom: "m²" }));
        ctx.putC("Digit Site Activity Report", `SAR-${key}-${ymd(d)}`, { project: p, company: C, report_date: d, weather, prepared_by: "site@dcc.test", status: isToday ? "Draft" : "Submitted", manpower_count: present + 12 + Math.round(h(`m${p}${d}`) * 30), equipment_count: machines.length,
          safety_incidents: incident ? 1 : 0, activities: acts, issues: incident ? "إصابة طفيفة لعامل أثناء مناولة المواد — تم الإسعاف في الموقع وتسجيل الحادثة ومراجعة إجراءات الرفع" : delayH ? (rain ? "توقف جزئي بسبب الأمطار" : "انتظار وصول مواد من المورد") : "",
          delay_hours: delayH, ...(delayH ? { delay_cause: rain ? "Weather" : "Supply" } : {}), shift: "Day", owner: "site@dcc.test", creation: iso(d) }, isToday ? {} : { docstatus: 1 });
      }
      if (di < workdays.length - 43) return; // machinery: the last 60 days
      for (const m of machines) {
        if (muSeen.has(`${m.name}|${d}`) || isToday) continue;
        if (m.name === "MCH-TRK-05" && d > addDays(T, -35)) continue; // idle on the fit-out site for five weeks
        const x = hv(`u|${m.name}|${d}`); if (x < 0.08) continue;
        const breakdown = x > 0.95, waiting = !breakdown && x > 0.88;
        const hh = hv(`hh|${m.name}|${d}`); const hours = breakdown ? 4 : waiting ? 5 : hh > 0.88 ? 9 + Math.round(hv(`hx|${m.name}|${d}`)) : 6 + Math.round(hh * 2.3); // about one machine-day in eight runs past the 8-hour day
        const rate = num(m["hourly_rate"]), litres = r2(hours * num(m["fuel_rate"]) * (0.9 + h(`f${m.name}${d}`) * 0.25)), start = meters.get(m.name) ?? 0;
        meters.set(m.name, start + hours);
        ctx.putC("Digit Machinery Usage", `MU-${m.name}-${ymd(d)}`, { machinery: m.name, project: p, company: C, task: tasks[di % Math.max(1, tasks.length)]?.name, usage_date: d, status: "Submitted", hours, rate, fuel_litres: litres, fuel_cost: r2(litres * 1.66), operator, crew: crews[0]?.name,
          meter_start: start, meter_end: start + hours, idle_hours: waiting ? 3 : h(`id${m.name}${d}`) < 0.3 ? 1 : 0, downtime_hours: breakdown ? 4 : 0, downtime_reason: breakdown ? "Breakdown" : waiting ? "Waiting for Work" : "Not Applicable", currency: "SAR", owner: "site@dcc.test", creation: iso(d) }, { docstatus: 1 });
      }
    });
  }
}

const TENDER_LINES: [string, string, string, number, number, number][] = [
  ["01.01", "أعمال الحفر والردم", "m³", 8200, 26, 33], ["02.01", "خرسانة الأساسات", "m³", 2100, 820, 985], ["02.02", "الهيكل الخرساني", "m³", 4600, 905, 1080], ["03.01", "جدران بلوك", "m²", 21000, 60, 76],
  ["04.01", "الأعمال الكهروميكانيكية", "LS", 1, 3900000, 4620000], ["05.01", "لياسة ودهان", "m²", 46000, 36, 46], ["06.01", "التشطيبات الداخلية", "m²", 12500, 240, 290], ["07.01", "الأعمال الخارجية والتنسيق", "m²", 9000, 120, 150],
];
function tenderProjects(ctx: PortfolioCtx): void {
  const T = today();
  ([["V08", "مجمع أبها السكني — المرحلة الأولى", "Abha Residential Compound — Phase 1", "أبها", `${A}-CUST-04`, "Won", 1], ["V09", "توسعة مستشفى مكة التخصصي", "Makkah Specialist Hospital Extension", "مكة المكرمة", "V-CUST-06", "Lost", 1.35]] as const).forEach(([id, title, en, city, cust, result, scale]) => {
    const prj = `${A}-${id}-PRJ`, tender = `TND-2026-${id}`, est = `EST-2026-${id}`, boq = `BOQ-2026-${id}`;
    const lines = TENDER_LINES.map(([c, d, u, q, cr, sr]) => [c, d, u, Math.round(q * scale) || 1, cr, sr] as const);
    const value = lines.reduce((s, l) => s + l[3] * l[5], 0), cost = lines.reduce((s, l) => s + l[3] * l[4], 0);
    const cname = String(adapter.get("Customer", cust)?.["customer_name"] ?? cust);
    ctx.put("Project", prj, { naming_series: "PROJ-.####", project_name: `${title} — ${city}`, digit_name_en: en, digit_city: city, digit_contract_type: "Lump Sum", digit_project_manager: `${A}-EMP-004`, status: result === "Won" ? "Open" : "Cancelled", is_active: result === "Won" ? "Yes" : "No",
      expected_start_date: addDays(T, 45), expected_end_date: addDays(T, 45 + 540), percent_complete_method: "Manual", percent_complete: 0, priority: "High", company: C, customer: cust, estimated_costing: Math.round(cost), owner: "Administrator", creation: iso(addDays(T, -120)),
      notes: result === "Won" ? "تمت الترسية — العقد بانتظار التوقيع" : "لم تتم الترسية — السعر أعلى من المنافس الفائز بـ 6.8%" });
    ctx.putC("Digit Tender", tender, { title, customer: cust, company: C, project: prj, issuing_body: cname, tender_reference: `RFP-${id}-2026`, submission_deadline: addDays(T, -60), status: result, currency: "SAR", margin_percent: 16, emd_amount: Math.round((value * 0.01) / 1000) * 1000, emd_valid_until: addDays(T, 30),
      performance_guarantee_percent: 5, approved_estimate: est, boq, owner: "estimator@dcc.test", creation: iso(addDays(T, -120)), ...(result === "Lost" ? { loss_reason: "السعر", competitor: "شركة منافسة (تجريبية)", notes: "الفرق مع الفائز 6.8% — مراجعة أسعار التشطيبات" } : {}),
      items: lines.map(([code, desc, uom, qty], i) => ({ idx: i + 1, item_key: `${id}-${code}`, code, description: desc, uom, qty })) }, { est_cost: Math.round(cost), est_selling: Math.round(value) });
    ctx.putC("Digit Estimate Version", est, { tender, project: prj, company: C, version: 1, currency: "SAR", workflow_state: "Approved", docstatus: 1, approved_by: "director@dcc.test", approved_on: addDays(T, -65), owner: "estimator@dcc.test", creation: iso(addDays(T, -90)),
      lines: lines.map(([code, desc, uom, qty, c0, s0], i) => ({ idx: i + 1, line_key: `${id}-${code}`, tender_item: `${id}-${code}`, code, description: desc, uom, qty, cost_rate: c0, selling_rate: s0 })) }, { approved_by: "director@dcc.test" });
    ctx.putC("Digit Takeoff Sheet", `TOS-${id}-1`, { tender, title: `حصر كميات — ${title}`, status: result === "Won" ? "Reviewed" : "Draft", reviewed: result === "Won" ? 1 : 0, source_kind: "2D", measurement_method: "Area", unit: "m",
      dimensions: lines.slice(0, 5).map(([code, desc, uom, qty], i) => ({ idx: i + 1, item_key: `${id}-${code}`, description: desc, nos: 1, length: 0, breadth: 0, depth: 0, uom, quantity: qty })), owner: "estimator@dcc.test", creation: iso(addDays(T, -100)) });
    if (result !== "Won") return;
    ctx.putC("Digit BOQ", boq, { title: `${title} — جدول الكميات`, project: prj, company: C, tender, estimate_version: est, revision: 0, workflow_state: "Approved", docstatus: 1, currency: "SAR", approved_by: "pm@dcc.test", approved_on: addDays(T, -40), owner: "qs@dcc.test",
      groups: [...new Set(lines.map((l) => l[0].split(".")[0]!))].map((g, i) => ({ idx: i + 1, group_code: g, description: `القسم ${g}` })),
      items: lines.map(([code, desc, uom, qty, , s0], i) => ({ idx: i + 1, line_key: `B-${id}-${code}`, group_code: code.split(".")[0], code, description: desc, uom, qty, rate: s0, source_estimate_line: `${id}-${code}`, cost_code: `CC-${code}` })) }, { approved_by: "pm@dcc.test" });
    ctx.putC("Digit Client Contract", `CC-2026-${id}`, { title: `عقد ${title}`, project: prj, customer: cust, company: C, reference: `CTR-${id}-001`, boq, currency: "SAR", start_date: addDays(T, 45), end_date: addDays(T, 585), payment_days: 45, taxes_and_charges: `KSA VAT 15% - ${A}`,
      advance_amount: Math.round((value * 0.1) / 1000) * 1000, advance_recovery_pct: 10, retention_pct: 10, retention_cap_pct: 5, workflow_state: "Draft", owner: "qs@dcc.test", creation: iso(addDays(T, -20)),
      sov_lines: lines.map(([code, desc, uom, qty, , s0], i) => ({ idx: i + 1, line_key: `B-${id}-${code}`, boq_item: `B-${id}-${code}`, description: desc, uom, qty, rate: s0, origin: "Contract" })) });
  });
}

function closeout(ctx: PortfolioCtx, f: ProjectFacts): void {
  const T = today();
  ctx.putC("Digit Final Account", `FA-${f.id}`, { contract: f.contract, project: f.project, company: C, customer: f.cust, workflow_state: "Under Negotiation", currency: "SAR", owner: "qs@dcc.test", creation: iso(addDays(f.end, 30)),
    adjustments: [{ idx: 1, description: "تسوية كميات الأعمال الخارجية بعد إعادة القياس", amount: -42000 }], disputes: [{ idx: 1, description: "خصم العميل لتأخير التسليم 10 أيام", amount: 65000 }] });
  const rrr: Row = { contract: f.contract, project: f.project, company: C, customer: f.cust, release_type: "Partial", workflow_state: "Draft" };
  const held = num(computeDoc("Digit Retention Release Request", { ...rrr, name: `RRR-${f.id}-1`, doctype: "Digit Retention Release Request" } as Doc).doc["held_amount"]);
  ctx.putC("Digit Retention Release Request", `RRR-${f.id}-1`, { ...rrr, requested_amount: r2(held / 2), basis: "الاستلام الابتدائي — يُفرج عن نصف المحتجز؛ فاتورة الإفراج تبقى مسودة حتى تحدد المالية حساب المحتجزات", owner: "qs@dcc.test", creation: iso(addDays(f.end, 20)) });
  ctx.putC("Digit Closeout Assessment", `CLA-${f.id}`, { project: f.project, company: C, assessment_date: addDays(T, -10), status: "In Progress", owner: "pm@dcc.test", creation: iso(addDays(T, -10)),
    rows: [["Technical", "شهادة الاستلام الابتدائي", "Done", "محضر الاستلام"], ["Technical", "مخططات التنفيذ الفعلية As-Built", "Done", "TRM مرسلة"], ["Technical", "إغلاق قائمة الملاحظات", "Pending", ""], ["Commercial", "الحساب الختامي مع العميل", "Pending", ""],
      ["Commercial", "الحسابات الختامية لمقاولي الباطن", "Done", ""], ["Financial", "تحصيل المستحقات", "Pending", ""], ["Financial", "إفراج المحتجزات", "Pending", "بانتظار حساب المحتجزات"]].map(([area, item, status, evidence], i) => ({ idx: i + 1, area, item, status, evidence })) });
  const wo = f.wos[f.wos.length - 1];
  if (wo) {
    ctx.putC("Digit Subcontract Final Account", `SFA-${f.id}-1`, { work_order: wo.wo, project: f.project, subcontractor: wo.sub, company: C, workflow_state: "Agreed", settlement_note: "اتفق على الحساب الختامي بعد خصم الإصلاحات", owner: "qs@dcc.test", creation: iso(addDays(f.end, 25)) });
    const srr: Row = { work_order: wo.wo, project: f.project, company: C, release_type: "Partial", workflow_state: "Draft" };
    const sheld = computeDoc("Digit Subcontract Retention Release Request", { ...srr, name: `SRR-${f.id}-1`, doctype: "Digit Subcontract Retention Release Request" } as Doc).doc;
    ctx.putC("Digit Subcontract Retention Release Request", `SRR-${f.id}-1`, { ...srr, requested_amount: r2(num(sheld["held_amount"] ?? sheld["retention_held"]) / 2), basis: "الاستلام الابتدائي لأعمال مقاول الباطن", owner: "qs@dcc.test", creation: iso(addDays(f.end, 22)) });
  }
}

// ------------------------------------------------------------------------------------------------ remaining documents
/**
 * One believable record of every remaining transaction document (locations, issue requests, correspondence, field
 * tasks, change pricing, subcontract changes, inductions, WIP drafts, tender addendum / award decisions, bid leveling,
 * maintenance orders, a matching acceptance), so every document type has a record to open and print. Time-relative
 * fields that were valid when the document was issued (a past addendum deadline) go in putC's `final`.
 */
function otherDocuments(ctx: PortfolioCtx, facts: ProjectFacts[]): void {
  const T = today();
  ctx.put("Digit Equipment Location", "ساحة المعدات الرئيسية — الرياض", { location_name: "ساحة المعدات الرئيسية — الرياض", company: C, location_type: "Yard", warehouse: WH_C });
  ctx.put("Digit Equipment Location", "ورشة الصيانة — الدمام", { location_name: "ورشة الصيانة — الدمام", company: C, location_type: "Workshop" });
  for (const f of facts) {
    if (f.hold || f.done) continue;
    const k = f.id; const WH = siteWarehouse(f.id); const site = `${f.title} — منطقة العمل الرئيسية`;
    ctx.put("Digit Site Location", site, { location_name: site, company: C, project: f.project, warehouse: WH, description: `منطقة العمل الرئيسية ومخزن الموقع — ${f.city}` });
    ctx.put("Digit Equipment Location", `${f.title} — موقف المعدات`, { location_name: `${f.title} — موقف المعدات`, company: C, project: f.project, warehouse: WH, location_type: "Site" });
    const mat = (MATS[f.tpl] ?? [])[0];
    if (mat) {
      const [item, , uom, qty, , cc] = mat;
      ctx.putC("Digit Issue Request", `MIR-${k}-1`, { project: f.project, company: C, warehouse: WH, required_on: addDays(T, 3), location: site, workflow_state: "Pending Approval", owner: "site@dcc.test", creation: iso(addDays(T, -2)), reason: "صرف للأعمال الجارية هذا الأسبوع",
        lines: [{ idx: 1, item_code: item, qty: Math.max(1, Math.round(qty * 0.08)), uom, cost_code: cc, task: f.tasks[1]?.task ?? f.tasks[0]?.task }] });
      ctx.putC("Digit Issue Request", `MIR-${k}-2`, { project: f.project, company: C, warehouse: WH, required_on: addDays(T, -20), location: site, workflow_state: "Approved", docstatus: 1, approved_by: "pm@dcc.test", owner: "site@dcc.test", creation: iso(addDays(T, -24)), reason: "صرف مواد الأسبوع",
        lines: [{ idx: 1, item_code: item, qty: Math.max(1, Math.round(qty * 0.05)), uom, cost_code: cc, task: f.tasks[0]?.task }] });
    }
    ([["Incoming", "Letter", "إشعار المالك بتعديل مواعيد الدخول إلى الموقع", "Possible EOT", -40, 1], ["Outgoing", "Site Instruction", "تعليمات موقع — حماية الأعمال المنفذة قبل موسم الأمطار", "None", -25, 0], ["Incoming", "Minutes", "محضر اجتماع التقدم الشهري مع الاستشاري", "Possible Change", -9, 1]] as const)
      .forEach(([dir, type, subject, flag, d, resp], i) => ctx.putC("Digit Correspondence", `COR-${k}-${i + 1}`, { project: f.project, company: C, direction: dir, corr_type: type, subject, party: dir === "Incoming" ? "الاستشاري المشرف" : String(adapter.get("Customer", f.cust)?.["customer_name"] ?? ""), ref_no: `${k}/${type === "Letter" ? "L" : type === "Minutes" ? "M" : "SI"}/${pad(i + 7, 3)}`, date: addDays(T, d), response_required: resp, ...(resp ? { response_due: addDays(T, d + 10) } : {}), contractual_flag: flag, owner_user: "pm@dcc.test", owner: "pm@dcc.test", creation: iso(addDays(T, d)), execution_stage: "Execution" }));
    ([["Open", "Quality", "إصلاح تشققات شعرية في اللياسة — الدور الثاني", -6], ["Tracked", "Safety", "تركيب حواجز حماية عند فتحات السلالم", -12], ["Tracked", "Coordination", "تنسيق مسار التمديدات مع أعمال السقف المستعار", -18]] as const)
      .forEach(([st, cat, title, d], i) => ctx.putC("Digit Field Task", `FTK-${k}-${i + 1}`, { project: f.project, company: C, task: f.tasks[i % Math.max(1, f.tasks.length)]?.task, location: site, assigned_to: "site@dcc.test", status: "Open", title, description: `${title} — ${f.title}`, category: cat, due_date: addDays(T, d + 14), owner: "site@dcc.test", owner_user: "site@dcc.test", creation: iso(addDays(T, d)), pin_x: 0.2 + i * 0.25, pin_y: 0.3 + i * 0.15, execution_stage: "Execution" }, { status: st }));
    const ceUnder = (adapter.list("Digit Change Event") as Row[]).find((c) => c["project"] === f.project && c["workflow_state"] === "Under Review");
    const wo = f.wos[0];
    if (ceUnder && wo) ctx.putC("Digit Change RFQ", `CR-${k}-1`, { change_event: ceUnder["name"], work_order: wo.wo, subcontractor: wo.sub, status: "Under Review", due_date: addDays(T, 4), issued_on: addDays(T, -6), origin_document: String(ceUnder["name"]), change_no: `${k}-CO-1`, schedule_impact_days: 6, owner: "qs@dcc.test", creation: iso(addDays(T, -6)),
      lines: [{ idx: 1, line_key: `${k}-RFQL-1`, description: `${String(ceUnder["title"] ?? "تغيير")} — أعمال إضافية`, qty: 1, unit_cost: Math.round(num(ceUnder["cost_impact"]) * 0.7), quoted_amount: Math.round(num(ceUnder["cost_impact"]) * 0.74) }] });
    if (wo) ctx.putC("Digit Subcontract Change", `SCC-${k}-1`, { work_order: wo.wo, project: f.project, company: C, subcontractor: wo.sub, change_date: addDays(T, -5), workflow_state: "Under Review", reason: "زيادة الكميات وفق المخططات المعدلة المعتمدة", time_days: 5, owner: "qs@dcc.test", creation: iso(addDays(T, -5)),
      lines: [{ idx: 1, wo_line_key: `${k}W1-1`, change_type: "Update", qty_delta: 12 }, { idx: 2, change_type: "New Line", scope: "أعمال إضافية ضمن نطاق مقاول الباطن", uom: "m2", cost_code: wo.cc, qty_delta: 40, rate: 85 }] });
    ([[`${A}-EMP-0${30 + Number(k.slice(1)) % 40}`, -60, 305], [`${A}-EMP-0${45 + Number(k.slice(1)) % 30}`, -200, 180]] as const).forEach(([emp, d, valid], i) =>
      ctx.putC("Digit Site Induction", `SI-${k}-${i + 1}`, { project: f.project, company: C, employee: emp, person: String(adapter.get("Employee", emp)?.["employee_name"] ?? emp), company_name: "شركة ديجيت للمقاولات (تجريبية)", inducted_on: addDays(T, d), valid_until: addDays(T, d + valid), inductor: `${A}-EMP-078`, work_date: addDays(T, d), approval_status: "Approved", owner: "site@dcc.test", creation: iso(addDays(T, d)) }));
    const month = addDays(CUTOFF, -20).slice(0, 7);
    ctx.putC("Digit WIP Adjustment", `WA-${k}-${month.replace("-", "")}`, { project: f.project, company: C, period: month, billed: Math.round(f.value * f.pct * 0.92), unposted_billings: 0, earned_revenue: Math.round(f.value * f.pct), posted_unposted_status: "Unposted", owner: "finance@dcc.test", creation: iso(addDays(CUTOFF, -2)) });
  }
  // machinery maintenance: the generator under maintenance and a completed preventive service
  ctx.putC("Digit Maintenance Order", "MO-MCH-GEN-04-1", { machinery: "MCH-GEN-04", order_type: "Corrective", meter_at: 3120, status: "In Progress", downtime_hours: 38, cost: 6400, work_date: addDays(T, -3), next_due_date: addDays(T, 60), approval_status: "Approved", employee_or_crew: `${A}-EMP-061`, owner: "site@dcc.test", creation: iso(addDays(T, -4)) });
  ctx.putC("Digit Maintenance Order", "MO-MCH-EXC-01-1", { machinery: "MCH-EXC-01", order_type: "Preventive", meter_at: 2500, status: "Done", downtime_hours: 6, cost: 2150, work_date: addDays(T, -21), next_due_meter: 2750, next_due_date: addDays(T, 40), approval_status: "Approved", employee_or_crew: `${A}-EMP-061`, owner: "site@dcc.test", creation: iso(addDays(T, -22)) });
  // tenders: the addendum before submission and the award decisions of the won and lost tenders
  ctx.putC("Digit Tender Addendum", "TND-ADD-V08-1", { tender: "TND-2026-V08", addendum_no: 1, issued_on: addDays(T, -80), summary: "ملحق رقم 1: تمديد موعد التقديم أسبوعين وتوضيح مواصفات العزل المائي للأسطح", items: [], owner: "estimator@dcc.test", creation: iso(addDays(T, -80)) },
    { new_deadline: addDays(T, -60), applied: 1, applied_on: addDays(T, -79) });
  ([["V08", "Won", "أفضل سعر فني ومالي بعد التفاوض — هامش 16%"], ["V09", "Lost", "السعر أعلى من المنافس الفائز بـ 6.8%"]] as const).forEach(([id, dec, reason]) =>
    ctx.putC("Digit Tender Award Decision", `TAD-${id}`, { tender: `TND-2026-${id}`, decision: dec, approved_estimate: `EST-2026-${id}`, reason, docstatus: 1, owner: "director@dcc.test", creation: iso(addDays(T, -50)) }, { decided_by: "director@dcc.test", decided_on: addDays(T, -50) }));
  // bid leveling of the finishing package (two submitted bids), recommended and waiting for the award
  if (adapter.get("Digit Bid Package", "BPK-2026-0001")) ctx.putC("Digit Bid Leveling", "BLV-2026-0001", { bid_package: "BPK-2026-0001", workflow_state: "Recommended", owner: "procurement@dcc.test", creation: iso(addDays(T, -8)) }, { recommended_by: "procurement@dcc.test" });
  // a recorded matching variance (freight difference accepted by the procurement manager)
  const v03 = facts.find((f) => f.id === "V03"); const m3 = v03 ? (MATS[v03.tpl] ?? [])[0] : undefined;
  if (v03 && m3 && adapter.get("Purchase Order", `${A}-V03-PO-D1`)) ctx.putC("Digit Match Acceptance", `DMA-V03-1`, { purchase_order: `${A}-V03-PO-D1`, item_code: m3[0], project: v03.project, company: C, reason: "فرق النقل إلى الموقع مقبول وفق عرض المورد المعتمد", accepted_by: "procurement@dcc.test", accepted_on: addDays(T, -30), owner: "procurement@dcc.test", creation: iso(addDays(T, -30)) });
  // cost control (after every cost document exists): the attribution snapshot of the MEP job, a proposed allocation
  // of one out-of-budget row and the review of one open exception; the other exceptions stay open for the user
  if (v03) ctx.putC("Digit Actual Cost Attribution", "ACA-V03-1", { project: v03.project, company: C, as_of: CUTOFF, currency: "SAR", docstatus: 1, owner: "finance@dcc.test", creation: iso(CUTOFF) });
  const v06 = facts.find((f) => f.id === "V06");
  if (v06) {
    const ver = costVerification(v06.project); const budget = approvedBudget(v06.project);
    const ex = ver.exceptions.filter((x) => x.code === "CODE_NOT_IN_BUDGET" || x.code === "UNMAPPED");
    const line = rows(budget, "lines").find((l) => l["category"] === "Material") ?? rows(budget, "lines")[0];
    if (ex[0] && line) ctx.putC("Digit Cost Allocation", "CAL-V06-1", { project: v06.project, company: C, source_doctype: ex[0].source_doctype, source_name: ex[0].source_name, source_row: ex[0].row, budget_line: line["line_key"], allocation_basis: "Amount",
      reason: "البند يخص أعمال التشطيبات المعتمدة في الموازنة — اقتراح تحميله على بند المواد", owner: "qs@dcc.test", creation: iso(addDays(CUTOFF, -1)) });
    else {
      // no unmapped row on this job: a proposed split of one shared invoice line across two budget lines (F06-07-1)
      const src = costSourceRows(v06.project).find((x) => x.kind === "actual" && x.doctype === "Purchase Invoice");
      const two = rows(budget, "lines").filter((l) => l["category"] === "Material" || l["category"] === "Subcontract").slice(0, 2);
      if (src && two.length === 2) ctx.putC("Digit Cost Allocation", "CAL-V06-1", { project: v06.project, company: C, source_doctype: src.doctype, source_name: src.name, source_row: src.row, allocation_basis: "Percent",
        allocation_splits: [{ idx: 1, budget_line: two[0]!["line_key"], percent: 60 }, { idx: 2, budget_line: two[1]!["line_key"], percent: 40 }],
        reason: "فاتورة مشتركة لأعمال الجبس والأسقف — توزيع 60/40 بين بندي الموازنة حسب محضر الاستلام", owner: "qs@dcc.test", creation: iso(addDays(CUTOFF, -1)) });
    }
    const other = ver.exceptions.find((x) => x !== ex[0] && (x.code === "BILL_NOT_INVOICED" || x.code === "BILLED_MISMATCH" || x.code === "EXPENSE_NOT_POSTED")) ?? ex[1];
    if (other) ctx.putC("Digit Cost Exception Review", "CXR-V06-1", { project: v06.project, company: C, exception: EXCEPTION_LABEL[other.code], source_doctype: other.source_doctype, source_name: other.source_name, source_row: other.row, resolution: "Correction Requested",
      note: "طُلب من المشتريات تصحيح المستند المصدر قبل إقفال الشهر", owner: "finance@dcc.test", creation: iso(CUTOFF) });
  }
  reportDocuments(ctx, facts);
}

/**
 * Records the remaining reports read (round 2026-11-14): milestones on the job tasks, a review workflow on a submittal,
 * two job snapshots, a takeoff revision B, reasons on stock adjustments and one invoice line on an unregistered cost
 * code, so Milestone Summary, Workflow Review Status, Job Snapshot Comparison, Takeoff Revision Comparison, Stock
 * Adjustments by Reason and Unregistered Cost Codes open with rows (all through the document rules, except the
 * re-tags of seeded sample records).
 */
function reportDocuments(ctx: PortfolioCtx, facts: ProjectFacts[]): void {
  const T = today();
  for (const f of facts) {
    if (f.hold || f.done) continue;
    const k = f.id;
    const ts = adapter.list("Task").filter((t) => t["project"] === f.project && t["exp_end_date"]).sort((a, b) => String(a["exp_end_date"]).localeCompare(String(b["exp_end_date"])) || a.name.localeCompare(b.name));
    [ts[Math.floor(ts.length / 3)], ts[Math.floor((2 * ts.length) / 3)], ts[ts.length - 1]].forEach((t, i) => {
      if (!t) return; const end = String(t["exp_end_date"]).slice(0, 10);
      // the middle milestone of a running job is late against its locked contract deadline
      ctx.re("Task", t.name, { is_milestone: 1, ...(i > 0 ? { digit_contract_milestone: 1 } : {}), digit_locked_deadline: i === 1 && f.pct < 100 ? addDays(end, -10) : end });
    });
    const sub = adapter.list("Digit Submittal").filter((x) => x["project"] === f.project).sort((a, b) => a.name.localeCompare(b.name))[0];
    if (sub) ctx.putC("Digit Review Workflow", `RWF-${k}-1`, { project: f.project, company: C, ref_doctype: "Digit Submittal", ref_name: sub.name, title: `مراجعة ${String(sub["title"] ?? sub.name)}`,
      workflow_state: "Active", status: "In Progress", deadline: addDays(T, 10), owner: "qs@dcc.test", creation: iso(addDays(T, -30)), steps: [
        { idx: 1, seq: 1, reviewer: "qs@dcc.test", due: addDays(T, -20), outcome: "B", completed_on: `${addDays(T, -22)} 10:00:00`, comment: "ملاحظات بسيطة — يُعاد التقديم مع التعديل" },
        { idx: 2, seq: 2, reviewer: "pm@dcc.test", due: addDays(T, -3) },
        { idx: 3, seq: 3, reviewer: "director@dcc.test", due: addDays(T, 7), duration_days: 5 }] });
    for (const [i, d] of [[1, addDays(CUTOFF, -30)], [2, CUTOFF]] as const) {
      const m = asSystem(() => snapshotMetrics(f.project, d));
      ctx.putC("Digit Job Snapshot", `JS-${k}-${i}`, { project: f.project, company: C, as_of: d, snapshot_code: `${k}-${d.slice(0, 7)}`, payload: JSON.stringify(m), created_by: "finance@dcc.test", posting_period: d, cost_source_state: m["actual"] ?? 0, owner: "finance@dcc.test", creation: iso(d) });
    }
    const t1 = adapter.get("Digit Takeoff Sheet", `TOS-${k}-1`);
    if (t1) ctx.putC("Digit Takeoff Sheet", `TOS-${k}-2`, { tender: t1["tender"], title: `${String(t1["title"] ?? "")} — مراجعة الرسم B`, drawing: t1["drawing"], drawing_revision: "B", status: "Draft", reviewed: 0,
      source_kind: t1["source_kind"], measurement_method: t1["measurement_method"], unit: t1["unit"], owner: "estimator@dcc.test", creation: iso(addDays(f.start, -65)),
      dimensions: rows(t1, "dimensions").map((x, i) => ({ ...x, quantity: i % 3 === 0 ? Math.round(Number(x["quantity"] ?? 0) * 108) / 100 : i % 5 === 1 ? Math.round(Number(x["quantity"] ?? 0) * 95) / 100 : x["quantity"] })) });
    // reasons on stock adjustments: a damaged-material write-off and a transfer between sites
    if (["V02", "V03", "V05"].includes(k)) {
      const se = adapter.list("Stock Entry").filter((x) => Number(x.docstatus) === 1 && (x["project"] === f.project || rows(x, "items").some((r) => r["project"] === f.project))).sort((a, b) => a.name.localeCompare(b.name));
      const issue = se.find((x) => String(x["stock_entry_type"] ?? x["purpose"]) === "Material Issue"); const move = se.find((x) => String(x["stock_entry_type"] ?? x["purpose"]) === "Material Transfer");
      if (issue) ctx.re("Stock Entry", issue.name, { digit_reason: "AR-2026-0002" });
      if (move) ctx.re("Stock Entry", move.name, { digit_reason: "AR-2026-0001" });
    }
    // one supplier invoice line on a code missing from the cost code master (Unregistered Cost Codes / Cost Source Exceptions)
    if (k === "V05") {
      const pi = adapter.list("Purchase Invoice").filter((x) => x["project"] === f.project && Number(x.docstatus) === 1).sort((a, b) => a.name.localeCompare(b.name))[0];
      if (pi) ctx.re("Purchase Invoice", pi.name, { items: rows(pi, "items").map((r, i) => (i === 0 ? { ...r, digit_cost_code: "02.99.900" } : r)) });
      // the audit trail of rule overrides (Exceptions & audit trail): who accepted which warning, when and why
      if (pi) ctx.putC("Digit Override Log", `OL-${k}-1`, { ref_doctype: "Purchase Invoice", ref_name_doctype: "Purchase Invoice", ref_name: pi.name, rule: "Unregistered cost code",
        message: "بند الفاتورة على رمز تكلفة غير مسجل في شجرة الرموز (02.99.900)", user: "director@dcc.test", reason: "قُبلت الفاتورة لسداد المورد في موعده؛ يُعاد تصنيف البند بتوزيع تكلفة بعد تسجيل الرمز", owner: "director@dcc.test" });
    }
    if (k === "V03" && adapter.get("Purchase Order", `${A}-${k}-PO-D2`)) ctx.putC("Digit Override Log", `OL-${k}-1`, { ref_doctype: "Purchase Order", ref_name_doctype: "Purchase Order", ref_name: `${A}-${k}-PO-D2`,
      rule: "Budget limit (warning)", message: "أمر الشراء يتجاوز المتبقي من موازنة الرمز؛ لا يوجد حد معتمد فالتنبيه للعلم فقط", user: "director@dcc.test", reason: `اعتُمد مع رفع مراجعة الموازنة BREV-${k}-1`, owner: "director@dcc.test" });
  }
}

/**
 * One open request for quotation (owner interface round 2026-11-16, comparison columns): three lines, three suppliers —
 * one leaves a line unpriced (compared at the highest other price), one quotation has expired — and nothing awarded yet,
 * so the comparison shows the cheapest qualified column, the greyed expired column and a split award by line.
 */
function openRfq(ctx: PortfolioCtx, facts: ProjectFacts[]): void {
  const f = facts.find((x) => !x.done && !x.hold && !x.closeout && (MATS[x.tpl] ?? []).length >= 3); if (!f) return;
  const T = today(); const k = `${A}-${f.id}`; const WH = siteWarehouse(f.id);
  const mats = (MATS[f.tpl] ?? []).slice(0, 3); const sups = mats[0]![6].map((b) => `${A}-SUP-${b}`);
  const mr = `${k}-MR-OPEN`, rfq = `${k}-RFQ-OPEN`, need = addDays(T, 30);
  const base = (m: Mat, i: number) => { const [item, iname, uom, qty, , cc] = m; const q = Math.max(1, Math.round(qty * 0.2)); return { idx: i + 1, item_code: item, item_name: iname, description: iname, uom, stock_uom: uom, conversion_factor: 1, qty: q, stock_qty: q, project: f.project, digit_cost_code: cc, warehouse: WH, schedule_date: need }; };
  ctx.put("Material Request", mr, { naming_series: "MAT-MR-.YYYY.-", material_request_type: "Purchase", transaction_date: addDays(T, -16), schedule_date: need, company: C, set_warehouse: WH, project: f.project, status: "Pending", per_ordered: 0, docstatus: 1, owner: "site@dcc.test", creation: iso(addDays(T, -16)),
    items: mats.map((m, i) => ({ ...base(m, i), name: `${mr}-${i + 1}`, ordered_qty: 0 })) });
  ctx.put("Request for Quotation", rfq, { naming_series: "PUR-RFQ-.YYYY.-", transaction_date: addDays(T, -14), company: C, status: "Submitted", docstatus: 1, owner: "procurement@dcc.test", creation: iso(addDays(T, -14)),
    message_for_supplier: `نرجو تقديم عرض سعر للدفعة الثانية من مواد ${f.title} خلال 10 أيام.`,
    suppliers: sups.map((sp, i) => ({ idx: i + 1, supplier: sp, supplier_name: supName(sp), quote_status: "Received" })),
    items: mats.map((m, i) => ({ ...base(m, i), name: `${rfq}-${i + 1}`, material_request: mr, material_request_item: `${mr}-${i + 1}` })) });
  // [supplier factor per line (null = not priced), quoted on, valid till, status]
  const offers: [(number | null)[], number, number, string][] = [[[0.95, 1.04, null], -4, 25, "Submitted"], [[1, 0.97, 1], -3, 27, "Submitted"], [[0.93, 0.95, 0.96], -12, -2, "Expired"]];
  offers.forEach(([fs, on, valid, status], si) => {
    const sp = sups[si]; if (!sp) return; const sq = `${k}-SQ-OPEN-${"ABC"[si]}`;
    const items = mats.map((m, i) => ({ m, i, fct: fs[i] })).filter((x): x is { m: Mat; i: number; fct: number } => x.fct !== null && x.fct !== undefined).map(({ m, i, fct }, n) => {
      const b = base(m, i); const rate = r2(m[4] * fct), amt = lineAmount(b.qty, rate);
      return { ...b, idx: n + 1, name: `${sq}-${n + 1}`, rate, amount: amt, net_rate: rate, net_amount: amt, base_net_rate: rate, lead_time_days: m[7], request_for_quotation: rfq, request_for_quotation_item: `${rfq}-${i + 1}`, material_request: mr, material_request_item: `${mr}-${i + 1}` };
    });
    const net = r2(items.reduce((a, x) => a + x.amount, 0)), t = purchaseTaxes(net);
    ctx.put("Supplier Quotation", sq, { naming_series: "PUR-SQTN-.YYYY.-", supplier: sp, supplier_name: supName(sp), transaction_date: addDays(T, on), valid_till: addDays(T, valid), company: C, buying_price_list: "Standard Buying", taxes_and_charges: `KSA VAT 15% Input - ${A}`,
      items, ...totals(net, t.tax), taxes: t.rows, status, docstatus: 1, owner: "procurement@dcc.test", creation: iso(addDays(T, on)) });
  });
}

export function portfolioActivity(ctx: PortfolioCtx, facts: ProjectFacts[]): void {
  for (const f of facts) {
    if (f.closeout) { closeout(ctx, f); continue; }
    if (f.done) continue;
    if (f.hold) {
      ctx.putC("Digit Commercial Claim", `CCL-${f.id}-1`, { title: "مطالبة تكاليف إيقاف الأعمال", contract: f.contract, project: f.project, company: C, customer: f.cust, claim_category: "Suspension", workflow_state: "Submitted", event_date: f.hold, notice_date: addDays(f.hold, 7), claimed_amount: Math.round((f.value * 0.007) / 1000) * 1000, time_claimed_days: 60,
        basis: "إيقاف الأعمال بطلب المالك لحين استكمال التمويل — تكاليف حراسة الموقع والمعدات المتوقفة", owner: "qs@dcc.test", creation: iso(addDays(f.hold, 7)) });
      continue;
    }
    procurement(ctx, f); changes(ctx, f); siteDocs(ctx, f); forecasts(ctx, f); cashForecast(ctx, f);
  }
  tenderProjects(ctx);
  siteDiary(ctx, facts);
  otherDocuments(ctx, facts);
  openRfq(ctx, facts);
}
