/**
 * DIGIT CRM C4 working rules (owner 2026-11-17), stored as FCRM Settings custom fields so one setting drives every CRM
 * screen (see docs/crm/FRAPPE_DEVELOPER_GUIDE.md §C4):
 *  - custom_score_rules (JSON)          lead score points per source, company size, engagement and budget band + Hot/Warm bands
 *  - custom_unqualified_reasons (lines) reasons offered (and required) when a lead leaves the path as «غير مؤهل»
 *  - custom_stage_requirements (JSON)   fields a deal must carry before it enters a stage (e.g. a sent quotation before
 *                                       Negotiation) and whether a missing one blocks or only warns
 *  - custom_first_response_hours / custom_sla_risk_pct   first-response promise for a new lead and the «معرّض للتأخر» point
 *  - custom_ai_summary (Check, default 0) the record summary stays rule-based unless switched on
 *  - custom_pipelines (lines)           pipelines a converted deal can join
 * Pure reads/writes of the one settings record; no other module stores these values. The defaults are the DIGIT working
 * defaults (best practice), editable by a Sales Manager.
 */
import { adapter, type Doc } from "@/lib/adapter";
import { isManager } from "./wf01";

const SETTINGS = "FCRM Settings";
const s = (v: unknown) => String(v ?? "");
export interface ScoreRules {
  source: Record<string, number>; sourceOther: number;
  size: Record<string, number>;
  engagement: { contact: number; company: number; recent7: number; recent30: number; stale: number; completedCall: number; nextStep: number; overdue: number; qualified: number };
  budget: { min: number; points: number }[];
  bands: { hot: number; warm: number };
}
export const SCORE_DEFAULTS: ScoreRules = {
  source: { Reference: 25, Exhibition: 20, Website: 15, Campaign: 12, Advertisement: 8, "Cold Calling": 4 }, sourceOther: 4,
  size: { "1-10": 3, "11-50": 6, "51-200": 10, "201-500": 12, "501-1000": 15, "1000+": 15 },
  engagement: { contact: 5, company: 5, recent7: 15, recent30: 8, stale: -10, completedCall: 5, nextStep: 10, overdue: -10, qualified: 10 },
  budget: [{ min: 1000000, points: 20 }, { min: 250000, points: 14 }, { min: 50000, points: 8 }, { min: 1, points: 3 }],
  bands: { hot: 60, warm: 30 },
};
export const UNQUALIFIED_DEFAULTS = ["No budget", "No current need", "Not the decision maker", "Wrong contact details", "Chose a competitor", "Outside our service area", "Duplicate record", "Other"];
export const UNQUALIFIED_AR: Record<string, string> = {
  "No budget": "لا توجد ميزانية", "No current need": "لا توجد حاجة حالية", "Not the decision maker": "ليس صاحب القرار", "Wrong contact details": "بيانات تواصل خاطئة",
  "Chose a competitor": "اختار منافسًا", "Outside our service area": "خارج نطاق خدمتنا", "Duplicate record": "سجل مكرر", Other: "أخرى",
};
export type StageNeed = "value" | "products" | "close_date" | "contact" | "decision_maker" | "quote_sent" | "next_step";
export const STAGE_NEED_LABEL: Record<StageNeed, [string, string]> = {
  value: ["Deal value", "قيمة الصفقة"], products: ["Products", "المنتجات"], close_date: ["Expected close date", "تاريخ الإغلاق المتوقع"], contact: ["A contact", "جهة اتصال"],
  decision_maker: ["A decision maker among the contacts", "صاحب قرار ضمن جهات الاتصال"], quote_sent: ["A sent quotation", "عرض سعر مُرسل"], next_step: ["A next step", "الخطوة التالية"],
};
export interface StageRules { mode: "block" | "warn"; needs: Record<string, StageNeed[]> }
export const STAGE_DEFAULTS: StageRules = { mode: "block", needs: {
  "Demo/Making": ["value", "contact"], "Proposal/Quotation": ["value", "products", "close_date"], Negotiation: ["quote_sent", "decision_maker"],
  "Ready to Close": ["quote_sent", "close_date", "next_step"], Won: ["quote_sent"],
} };
export const PIPELINE_DEFAULTS = ["Standard sales", "Projects", "Renewals"];
export const PIPELINE_AR: Record<string, string> = { "Standard sales": "المبيعات العامة", Projects: "المشاريع", Renewals: "التجديدات" };
export interface LeadRules { score: ScoreRules; unqualified: string[]; stages: StageRules; slaHours: number; slaRiskPct: number; aiSummary: boolean; pipelines: string[] }

const json = <T,>(v: unknown, fb: T): T => { if (!v) return fb; try { const x = typeof v === "string" ? JSON.parse(v) : v; return x && typeof x === "object" ? x as T : fb; } catch { return fb; } };
const lines = (v: unknown) => s(v).split(/\n/).map((x) => x.trim()).filter(Boolean);
/** The SLA record named for leads ("Lead Response — 4h") gives the first-response promise when the setting is empty. */
function slaRecordHours(): number | null {
  const sla = adapter.list("CRM Service Level Agreement").find((x) => x["apply_on"] === "CRM Lead" && Number(x["enabled"] ?? 1) && Number(x["default"]));
  const p = ((sla?.["priorities"] as Doc[] | undefined) ?? []).find((r) => Number(r["default_priority"])) ?? ((sla?.["priorities"] as Doc[] | undefined) ?? [])[0];
  const secs = Number(p?.["first_response_time"]); if (Number.isFinite(secs) && secs > 0) return Math.round((secs / 3600) * 10) / 10;
  const m = /(\d+)\s*h/i.exec(s(sla?.name)); return m ? Number(m[1]) : null;
}
export function leadRules(): LeadRules {
  const st = adapter.get(SETTINGS, SETTINGS);
  const sc = json<Partial<ScoreRules>>(st?.["custom_score_rules"], {});
  const score: ScoreRules = { ...SCORE_DEFAULTS, ...sc, engagement: { ...SCORE_DEFAULTS.engagement, ...(sc.engagement ?? {}) }, bands: { ...SCORE_DEFAULTS.bands, ...(sc.bands ?? {}) },
    source: { ...SCORE_DEFAULTS.source, ...(sc.source ?? {}) }, size: { ...SCORE_DEFAULTS.size, ...(sc.size ?? {}) }, budget: Array.isArray(sc.budget) && sc.budget.length ? sc.budget : SCORE_DEFAULTS.budget };
  const stg = json<Partial<StageRules>>(st?.["custom_stage_requirements"], {});
  const hours = Number(st?.["custom_first_response_hours"]), risk = Number(st?.["custom_sla_risk_pct"]);
  const un = lines(st?.["custom_unqualified_reasons"]), pl = lines(st?.["custom_pipelines"]);
  return {
    score, unqualified: un.length ? un : [...UNQUALIFIED_DEFAULTS],
    stages: { mode: stg.mode === "warn" ? "warn" : "block", needs: stg.needs && typeof stg.needs === "object" ? stg.needs : STAGE_DEFAULTS.needs },
    slaHours: Number.isFinite(hours) && hours > 0 ? hours : slaRecordHours() ?? 4, slaRiskPct: Number.isFinite(risk) && risk >= 10 && risk <= 95 ? risk : 75,
    aiSummary: Number(st?.["custom_ai_summary"] ?? 0) === 1, pipelines: pl.length ? pl : [...PIPELINE_DEFAULTS],
  };
}
export type RulesPatch = Partial<{ score: ScoreRules; unqualified: string[]; stages: StageRules; slaHours: number; slaRiskPct: number; aiSummary: boolean; pipelines: string[] }>;
export function saveLeadRules(p: RulesPatch, user: string): { ok: true } | { ok: false; error: string } {
  if (!isManager(user)) return { ok: false, error: "Only a Sales Manager can change the working rules" };
  if (p.slaHours !== undefined && !(p.slaHours > 0 && p.slaHours <= 168)) return { ok: false, error: "Enter first-response hours between 1 and 168" };
  if (p.slaRiskPct !== undefined && !(p.slaRiskPct >= 10 && p.slaRiskPct <= 95)) return { ok: false, error: "Enter an at-risk point between 10% and 95%" };
  if (p.unqualified !== undefined && !p.unqualified.filter(Boolean).length) return { ok: false, error: "Keep at least one unqualified reason" };
  if (p.pipelines !== undefined && !p.pipelines.filter(Boolean).length) return { ok: false, error: "Keep at least one pipeline" };
  if (p.score && !(p.score.bands.hot > p.score.bands.warm && p.score.bands.warm > 0 && p.score.bands.hot <= 100)) return { ok: false, error: "Hot must be above Warm, both between 1 and 100" };
  const patch: Record<string, unknown> = {};
  if (p.score) patch["custom_score_rules"] = JSON.stringify(p.score);
  if (p.unqualified) patch["custom_unqualified_reasons"] = p.unqualified.filter(Boolean).join("\n");
  if (p.stages) patch["custom_stage_requirements"] = JSON.stringify(p.stages);
  if (p.slaHours !== undefined) patch["custom_first_response_hours"] = p.slaHours;
  if (p.slaRiskPct !== undefined) patch["custom_sla_risk_pct"] = p.slaRiskPct;
  if (p.aiSummary !== undefined) patch["custom_ai_summary"] = p.aiSummary ? 1 : 0;
  if (p.pipelines) patch["custom_pipelines"] = p.pipelines.filter(Boolean).join("\n");
  if (adapter.get(SETTINGS, SETTINGS)) adapter.update(SETTINGS, SETTINGS, patch); else adapter.insertDoc(SETTINGS, { name: SETTINGS, ...patch });
  return { ok: true };
}

/* ------------------------------------------------------------------ score (pure over the facts) ------------------------------------------------------------------ */
export type ScoreGroup = "source" | "company" | "engagement" | "budget";
export interface ScoreFact { id: string; group: ScoreGroup; label: string; labelAr: string; points: number; kind: "positive" | "negative" | "missing"; evidence?: { dt: string; name: string } | undefined }
export interface LeadFacts { lastAge: number | null; completedCall: boolean; next?: Doc | undefined; overdue?: Doc | undefined }
/** C-07: score 0–100 from the four rule groups; missing data scores 0 (never negative). */
export function scoreFromFacts(l: Doc, f: LeadFacts, R: ScoreRules = leadRules().score) {
  const out: ScoreFact[] = [];
  const add = (x: ScoreFact) => out.push(x);
  const src = s(l["source"]);
  if (!src) add({ id: "source", group: "source", label: "Lead source not recorded", labelAr: "المصدر غير مسجّل", points: 0, kind: "missing" });
  else add({ id: "source", group: "source", label: `Source: ${src}`, labelAr: `المصدر: ${src}`, points: R.source[src] ?? R.sourceOther, kind: "positive" });
  add(l["organization"] ? { id: "organization", group: "company", label: "Company named", labelAr: "الشركة محددة", points: R.engagement.company, kind: "positive" } : { id: "organization", group: "company", label: "Company not named", labelAr: "الشركة غير محددة", points: 0, kind: "missing" });
  const size = s(l["no_of_employees"]);
  add(size ? { id: "size", group: "company", label: `Company size ${size}`, labelAr: `حجم الشركة ${size}`, points: R.size[size] ?? 0, kind: "positive" } : { id: "size", group: "company", label: "Company size not recorded", labelAr: "حجم الشركة غير مسجّل", points: 0, kind: "missing" });
  add(l["email"] || l["mobile_no"] || l["phone"] ? { id: "contact", group: "engagement", label: "Email or mobile on record", labelAr: "بريد أو جوال مسجّل", points: R.engagement.contact, kind: "positive" } : { id: "contact", group: "engagement", label: "No email or mobile", labelAr: "لا بريد ولا جوال", points: 0, kind: "missing" });
  const a = f.lastAge;
  if (a === null) add({ id: "activity", group: "engagement", label: "No logged activity yet", labelAr: "لا يوجد نشاط مسجّل بعد", points: 0, kind: "missing" });
  else if (a <= 7) add({ id: "activity", group: "engagement", label: a === 0 ? "Activity today" : `Activity ${a} day(s) ago`, labelAr: a === 0 ? "نشاط اليوم" : a === 1 ? "نشاط أمس" : `نشاط قبل ${a} أيام`, points: R.engagement.recent7, kind: "positive" });
  else if (a <= 30) add({ id: "activity", group: "engagement", label: `Activity ${a} days ago`, labelAr: `نشاط قبل ${a} يومًا`, points: R.engagement.recent30, kind: "positive" });
  else add({ id: "activity", group: "engagement", label: `No activity for ${a} days`, labelAr: `لا نشاط منذ ${a} يومًا`, points: R.engagement.stale, kind: "negative" });
  if (f.completedCall) add({ id: "call", group: "engagement", label: "A call was answered", labelAr: "تم الرد على مكالمة", points: R.engagement.completedCall, kind: "positive" });
  add(f.next ? { id: "next", group: "engagement", label: "Next step scheduled", labelAr: "الخطوة التالية مجدولة", points: R.engagement.nextStep, kind: "positive", evidence: { dt: "CRM Task", name: f.next.name } } : { id: "next", group: "engagement", label: "No next step scheduled", labelAr: "لا توجد خطوة تالية", points: 0, kind: "missing" });
  if (f.overdue) add({ id: "overdue", group: "engagement", label: "Overdue follow-up", labelAr: "متابعة متأخرة", points: R.engagement.overdue, kind: "negative", evidence: { dt: "CRM Task", name: f.overdue.name } });
  if (l["status"] === "Qualified") add({ id: "qualified", group: "engagement", label: "Status is Qualified", labelAr: "الحالة: مؤهل", points: R.engagement.qualified, kind: "positive" });
  const v = Number(l["custom_estimated_value"]);
  const band = Number.isFinite(v) && v > 0 ? [...R.budget].sort((x, y) => y.min - x.min).find((b) => v >= b.min) : undefined;
  add(band ? { id: "budget", group: "budget", label: `Estimated value ${v.toLocaleString("en-US")}`, labelAr: `القيمة التقديرية ${v.toLocaleString("en-US")}`, points: band.points, kind: "positive" } : { id: "budget", group: "budget", label: "No estimated value", labelAr: "لا توجد قيمة تقديرية", points: 0, kind: "missing" });
  const score = Math.max(0, Math.min(100, out.reduce((x, y) => x + y.points, 0)));
  return { score, band: (score >= R.bands.hot ? "Hot" : score >= R.bands.warm ? "Warm" : "Cold") as "Hot" | "Warm" | "Cold", factors: out };
}

/** Arabic display labels for the CRM Lead Source values (display only; stored values stay as entered). */
export const SOURCE_AR: Record<string, string> = { Website: "الموقع الإلكتروني", "Cold Calling": "اتصال مباشر", Exhibition: "معرض", Reference: "توصية", Advertisement: "إعلان", Campaign: "حملة", WhatsApp: "واتساب", "Business card": "بطاقة عمل" };
