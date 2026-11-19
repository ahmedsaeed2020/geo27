import { VISIT_DT } from "@/plugins/digit_fsm/schema";
/**
 * F4-01 / F4-02 technician day and work-pack readiness (owner FSM round F4, 2026-11-18). Pure readers:
 *  - myDay        the technician's visits of one day in time order with the site, the distance from the previous stop
 *                 (great-circle between the sites' coordinates; the first stop has none) and the visit facts.
 *  - workPack     one requirement per card — skill, certificate valid on the visit day, published template for every
 *                 system, parts reserved (requested and issued for repair work), site access contact — each «سليم» or
 *                 «ناقص N» with the fix the screen offers. The work-pack queue (N56) and the journey read the same result.
 * Lead / team come only from domain/visits.ts (visit facts), so the day board, the queues and the journey agree.
 */
import type { Doc } from "@/lib/adapter";
import { currentUser } from "@/lib/session";
import { list, raw, rows } from "./data";
import { daysBetween, s, today } from "./rules";
import { visitFacts, visitIndex, type VisitFacts } from "./visits";
import { activeTemplate, requiredSkill } from "./services";
import { partsFlow } from "./billing";
import { OPTION_AR } from "../schema";

const ar = (v: string) => OPTION_AR[v] ?? v;
/** The FSM Technician linked to the session user (User, or the Employee's user id). */
export function sessionTechnician(): Doc | undefined {
  const u = currentUser();
  return list("FSM Technician").find((t) => s(t["user"]) === u || (t["employee"] && s(raw("Employee", t["employee"])?.["user_id"]) === u));
}
/** Great-circle distance in km between two sites (null when either has no coordinates). */
export function siteKm(a: Doc | undefined, b: Doc | undefined): number | null {
  const la1 = Number(a?.["latitude"]), lo1 = Number(a?.["longitude"]), la2 = Number(b?.["latitude"]), lo2 = Number(b?.["longitude"]);
  if (![la1, lo1, la2, lo2].every((x) => Number.isFinite(x) && x !== 0)) return null;
  const R = 6371, rad = Math.PI / 180; const dLa = (la2 - la1) * rad, dLo = (lo2 - lo1) * rad;
  const h = Math.sin(dLa / 2) ** 2 + Math.cos(la1 * rad) * Math.cos(la2 * rad) * Math.sin(dLo / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.min(1, Math.sqrt(h))) * 10) / 10;
}
export interface DayStopFacts { visit: Doc; facts: VisitFacts; site: Doc | undefined; job: Doc | undefined; km: number | null; start: string; end: string; lead: boolean }
/** Visits of one technician (lead or team member) on a day, soonest first, with the distance from the previous stop. */
export function myDay(tech: string, day = today()): { stops: DayStopFacts[]; km: number; done: number; open: number } {
  const ix = visitIndex(); const out: DayStopFacts[] = [];
  for (const v of list(VISIT_DT)) {
    if (s(v["scheduled_start"]).slice(0, 10) !== day || s(v["workflow_state"]) === "Cancelled") continue;
    const f = visitFacts(v, ix); const lead = f.lead?.technician === tech;
    if (!lead && !f.team.some((p) => p.technician === tech)) continue;
    out.push({ visit: v, facts: f, site: raw("FSM Service Site", v["site"]), job: raw("FSM Job", v["job"]), km: null, start: s(v["scheduled_start"]), end: s(v["scheduled_end"]), lead });
  }
  out.sort((a, b) => a.start.localeCompare(b.start));
  for (let i = 1; i < out.length; i++) out[i]!.km = out[i - 1]!.site?.name === out[i]!.site?.name ? 0 : siteKm(out[i - 1]!.site, out[i]!.site);
  return { stops: out, km: Math.round(out.reduce((a, x) => a + (x.km ?? 0), 0) * 10) / 10, done: out.filter((x) => s(x.visit["workflow_state"]) === "Completed").length, open: out.filter((x) => ["Planned", "Dispatched", "On Site"].includes(s(x.visit["workflow_state"]))).length };
}

export type PackKey = "skill" | "cert" | "template" | "parts" | "access";
export interface PackFix { kind: "link" | "doctype" | "new"; to: string; label: [string, string]; defaults?: Record<string, unknown> | undefined }
export interface PackItem { key: PackKey; label: [string, string]; ok: boolean; warn?: boolean | undefined; missing: number; detail: [string, string]; fix?: PackFix | undefined }
/** Systems a visit works on: the job's obligations, its runs and the deficiency / request system. */
export function visitSystems(v: Doc): Doc[] {
  const j = raw("FSM Job", v["job"]); const ids = new Set<string>();
  for (const b of rows(j, "obligations")) if (b["system"]) ids.add(s(b["system"]));
  for (const r of list("FSM Inspection Run")) if (s(r["visit"]) === v.name || (s(r["job"]) === s(v["job"]) && !r["visit"])) if (r["system"]) ids.add(s(r["system"]));
  const d = raw("FSM Deficiency", j?.["deficiency"]); if (d?.["system"]) ids.add(s(d["system"]));
  const issue = list("Issue").find((i) => s(i["digit_fsm_job"]) === s(v["job"])); if (issue?.["digit_fsm_system"]) ids.add(s(issue["digit_fsm_system"]));
  return [...ids].map((x) => raw("FSM Service System", x)).filter((x): x is Doc => !!x);
}
/** Work-pack readiness of one visit (pure). */
export function workPack(visitName: string, asOf = today(), nameAr: (v: string) => string = (v) => v): { visit: Doc | undefined; items: PackItem[]; missing: number; ready: boolean } {
  const v = raw(VISIT_DT, visitName); if (!v) return { visit: undefined, items: [], missing: 0, ready: false };
  const ix = visitIndex(); const f = visitFacts(v, ix); const tech = raw("FSM Technician", f.lead?.technician ?? v["technician"]);
  const day = s(v["scheduled_start"]).slice(0, 10) || asOf; const skill = requiredSkill(v); const j = raw("FSM Job", v["job"]); const site = raw("FSM Service Site", v["site"]);
  const items: PackItem[] = [];
  const techName = s(tech?.["technician_name"]) || s(tech?.name);
  const skillRows = rows(tech, "skills").filter((r) => s(r["skill"]) === skill);
  // 1 skill
  if (!tech) items.push({ key: "skill", label: ["Skill", "المهارة"], ok: false, missing: 1, detail: ["No lead technician booked", "لا فني رئيسي محجوز"], fix: { kind: "link", to: `dispatch?visit=${encodeURIComponent(v.name)}`, label: ["Book a technician", "حجز فني"] } });
  else if (!skill) items.push({ key: "skill", label: ["Skill", "المهارة"], ok: true, missing: 0, detail: [`No special skill needed — ${techName}`, `لا تتطلب مهارة خاصة — ${nameAr(techName)}`] });
  else if (!skillRows.length) items.push({ key: "skill", label: ["Skill", "المهارة"], ok: false, missing: 1, detail: [`${techName} has no ${skill} skill`, `${nameAr(techName)} لا يملك مهارة ${ar(skill)}`], fix: { kind: "link", to: `dispatch?visit=${encodeURIComponent(v.name)}`, label: ["Re-book on a skilled technician", "إعادة الحجز على فني مؤهل"] } });
  else items.push({ key: "skill", label: ["Skill", "المهارة"], ok: true, missing: 0, detail: [`${techName} — ${skill}`, `${nameAr(techName)} — ${ar(skill)}`] });
  // 2 certificate
  if (tech && skill && skillRows.length) {
    const best = skillRows.map((r) => s(r["valid_until"])).sort().slice(-1)[0] ?? "";
    const left = best ? daysBetween(day, best) : null;
    if (left !== null && left < 0) items.push({ key: "cert", label: ["Certificate", "الشهادة"], ok: false, missing: 1, detail: [`${skill} certificate expired on ${best}`, `شهادة ${ar(skill)} انتهت في ${best}`], fix: { kind: "doctype", to: `FSM Technician|${tech.name}`, label: ["Update the certificate", "تحديث الشهادة"] } });
    else items.push({ key: "cert", label: ["Certificate", "الشهادة"], ok: true, warn: left !== null && left <= 30, missing: 0, detail: best ? [`Valid until ${best}${left !== null && left <= 30 ? ` (${left} days left)` : ""}`, `صالحة حتى ${best}${left !== null && left <= 30 ? ` (باقي ${left} يومًا)` : ""}`] : ["No expiry recorded", "بلا تاريخ انتهاء"] });
  } else items.push({ key: "cert", label: ["Certificate", "الشهادة"], ok: !!tech, missing: tech ? 0 : 1, detail: tech ? ["No certificate needed for this work", "لا تلزم شهادة لهذا العمل"] : ["Book a technician first", "احجز فنيًا أولًا"] });
  // 3 template
  const systems = visitSystems(v); const noTpl = systems.filter((x) => !activeTemplate(s(x["system_type"])));
  items.push({ key: "template", label: ["Inspection template", "قالب الفحص"], ok: noTpl.length === 0, missing: noTpl.length,
    detail: !systems.length ? ["No system on this visit", "لا نظام على هذه الزيارة"] : noTpl.length ? [`No published template for ${noTpl.map((x) => s(x["system_type"])).join(", ")}`, `لا قالب منشور لـ ${noTpl.map((x) => ar(s(x["system_type"]))).join("، ")}`] : [`${systems.length} system(s), each with a published template`, `${systems.length} نظام، لكل منها قالب منشور`],
    ...(noTpl.length ? { fix: { kind: "link" as const, to: "queue/templates", label: ["Publish the template", "نشر القالب"] as [string, string] } } : {}) });
  // 4 parts
  const repair = ["Repair", "Corrective", "Emergency"].includes(s(j?.["job_type"]));
  if (!repair) items.push({ key: "parts", label: ["Parts reserved", "القطع المحجوزة"], ok: true, missing: 0, detail: ["Planned inspection — no parts to reserve", "فحص مخطط — لا قطع للحجز"] });
  else {
    const flow = partsFlow(s(v["job"])); const short = flow.lines.filter((l) => l.requested > l.issued);
    // a repair of a recorded finding needs its parts requested; corrective / emergency call-outs may work from van stock
    if (!flow.lines.some((l) => l.requested > 0) && s(j?.["job_type"]) !== "Repair") items.push({ key: "parts", label: ["Parts reserved", "القطع المحجوزة"], ok: true, warn: true, missing: 0, detail: ["No parts requested — the technician works from van stock", "لا قطع مطلوبة — يعمل الفني من مخزون السيارة"], fix: { kind: "new", to: "Material Request", label: ["Request the parts", "طلب القطع"], defaults: { material_request_type: "Material Issue", digit_fsm_job: s(v["job"]), customer: j?.["customer"], company: j?.["company"] } } });
    else if (!flow.lines.some((l) => l.requested > 0)) items.push({ key: "parts", label: ["Parts reserved", "القطع المحجوزة"], ok: false, missing: 1, detail: ["No material request for this repair", "لا طلب مواد لهذا الإصلاح"], fix: { kind: "new", to: "Material Request", label: ["Request the parts", "طلب القطع"], defaults: { material_request_type: "Material Issue", digit_fsm_job: s(v["job"]), customer: j?.["customer"], company: j?.["company"] } } });
    else if (short.length) items.push({ key: "parts", label: ["Parts reserved", "القطع المحجوزة"], ok: false, missing: short.length, detail: [`${short.map((l) => `${l.item_name} ${l.requested - l.issued}`).join(", ")} not issued to the van`, `${short.map((l) => `${nameAr(l.item_name)} ${l.requested - l.issued}`).join("، ")} لم تُصرف للسيارة`], fix: { kind: "link", to: "ws/materials", label: ["Issue from stores", "الصرف من المستودع"] } });
    else items.push({ key: "parts", label: ["Parts reserved", "القطع المحجوزة"], ok: true, missing: 0, detail: [`${flow.issued} issued to the van`, `${flow.issued} مصروفة للسيارة`] });
  }
  // 5 site access contact
  const contact = rows(site, "contacts").find((c) => s(c["contact_role"]) === "Site Access" && s(c["phone"]));
  const miss = [!s(site?.["access_instructions"]) ? ["access instructions", "تعليمات الوصول"] : null, !contact ? ["site access contact", "جهة اتصال الوصول"] : null].filter(Boolean) as [string, string][];
  items.push({ key: "access", label: ["Site access contact", "جهة اتصال الوصول"], ok: miss.length === 0, warn: !!site?.["requires_permit"], missing: miss.length,
    detail: miss.length ? [`Missing ${miss.map((m) => m[0]).join(" and ")}`, `ينقص ${miss.map((m) => m[1]).join(" و")}`] : [`${s(contact?.["phone"])}${site?.["requires_permit"] ? " · work permit required" : ""}`, `${s(contact?.["phone"])}${site?.["requires_permit"] ? " · يتطلب تصريح عمل" : ""}`],
    ...(miss.length && site ? { fix: { kind: "doctype" as const, to: `FSM Service Site|${site.name}`, label: ["Complete the site", "استكمال الموقع"] as [string, string] } } : {}) });
  const missing = items.reduce((a, i) => a + (i.ok ? 0 : i.missing || 1), 0);
  return { visit: v, items, missing, ready: missing === 0 };
}
