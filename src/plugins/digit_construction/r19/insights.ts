/**
 * Overview layer 4 — computed insight sentences with their cause, for one workspace and scope. Every sentence is read
 * from the same figures the cards show (r19/metrics.ts, r19/trend.ts) and the same work queues (domain/queues.ts): a
 * figure that moved by 5% or more in 30 days names the project that moved most; the oldest waiting item names its
 * queue; a figure that cannot be shown says why. Nothing is stored and no number is invented.
 */
import type { Bi } from "@/lib/dashboards/views";
import { fmtNumber } from "@/lib/format";
import { projectTitle } from "../domain/data";
import { kpisOf, projectsOf, type Fig, type KpiDef, type Scope } from "./metrics";
import { betterOf, figAt } from "./trend";

export interface Insight { key: string; tone: "good" | "risk" | "info"; text: Bi; drill?: unknown }
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const val = (f: Fig) => (f.status && f.status !== "ok" ? null : f.value);
const show = (v: number, unit: Fig["unit"]) => unit === "pct" ? `${fmtNumber(v, 1)}%` : unit === "money" ? `${fmtNumber(v, 0)} SAR` : fmtNumber(v, Number.isInteger(v) ? 0 : 1);
const showAr = (v: number, unit: Fig["unit"]) => unit === "pct" ? `${fmtNumber(v, 1)}%` : unit === "money" ? `${fmtNumber(v, 0)} ريال` : fmtNumber(v, Number.isInteger(v) ? 0 : 1);

/** The project whose own figure moved most between the two dates (the cause of a portfolio change), when more than one project is in scope. */
export function causeOf(k: KpiDef, s: Scope, before: string): { project: string; title: Bi; from: number; to: number } | undefined {
  if (s.project) return undefined;
  const ps = projectsOf(s);
  if (ps.length < 2) return undefined;
  let best: { project: string; title: Bi; from: number; to: number } | undefined;
  for (const p of ps) {
    const ps_ = { ...s, project: p.name };
    const to = figAt(k, ps_, s.on), from = figAt(k, ps_, before);
    if (to === null || from === null || to === from) continue;
    if (!best || Math.abs(to - from) > Math.abs(best.to - best.from)) best = { project: p.name, title: [projectTitle(p, true), projectTitle(p)], from, to };
  }
  return best;
}

export function workspaceInsights(ws: string, s: Scope, waiting: { title: Bi; name: string; days: number; drill?: unknown }[] = []): Insight[] {
  return insightsOf(kpisOf(ws), s, waiting);
}
/** Department dashboards: the same sentences over the department's headline figures, strongest change first (max sentences). */
export function deptInsights(ks: KpiDef[], s: Scope, waiting: { title: Bi; name: string; days: number; drill?: unknown }[] = [], max = 6): Insight[] {
  return insightsOf(ks, s, waiting).slice(0, max);
}
export function insightsOf(ks: KpiDef[], s: Scope, waiting: { title: Bi; name: string; days: number; drill?: unknown }[] = []): Insight[] {
  const out: Insight[] = [];
  const before = addDays(s.on, -30);
  for (const k of ks) {
    let f: Fig; try { f = k.fig(s); } catch { continue; }
    const now = val(f);
    if (now === null) {
      if (f.status === "unconfigured" || f.status === "pending") out.push({ key: `${k.id}:na`, tone: "info", text: [`${k.title[0]} is not shown: ${f.reason?.[0] ?? "it needs a setting."}`, `«${k.title[1]}» غير معروض: ${f.reason?.[1] ?? "يحتاج إلى إعداد."}`] });
      continue;
    }
    const prev = figAt(k, s, before);
    if (prev === null || prev === now) continue;
    const pct = prev === 0 ? 100 : ((now - prev) / Math.abs(prev)) * 100;
    if (Math.abs(pct) < 5) continue;
    const up = now > prev, b = betterOf(k);
    const tone = b === "none" ? "info" : (b === "up") === up ? "good" : "risk";
    const c = causeOf(k, s, before);
    const why: Bi = c ? [`; the largest change is on ${c.title[0]} (${show(c.from, f.unit)} → ${show(c.to, f.unit)})`, `؛ وأكبر تغير في ${c.title[1]} (${showAr(c.from, f.unit)} ← ${showAr(c.to, f.unit)})`] : ["", ""];
    out.push({ key: k.id, tone, drill: f.drill,
      text: [`${k.title[0]} ${up ? "rose" : "fell"} ${fmtNumber(Math.abs(pct), 1)}% in 30 days (${show(prev, f.unit)} → ${show(now, f.unit)})${why[0]}.`,
        `${up ? "ارتفع" : "انخفض"} «${k.title[1]}» بنسبة ${fmtNumber(Math.abs(pct), 1)}% خلال 30 يومًا (${showAr(prev, f.unit)} ← ${showAr(now, f.unit)})${why[1]}.`] });
  }
  const oldest = [...waiting].sort((a, b) => b.days - a.days)[0];
  if (oldest) out.push({ key: "oldest", tone: oldest.days > 7 ? "risk" : "info", drill: oldest.drill,
    text: [`${waiting.length} item${waiting.length === 1 ? "" : "s"} waiting here; the oldest is ${oldest.name} (${oldest.title[0]}), waiting ${oldest.days} days.`,
      `${waiting.length} بندًا بانتظار الإجراء هنا؛ أقدمها ${oldest.name} (${oldest.title[1]}) منذ ${oldest.days} يومًا.`] });
  if (!out.length) out.push({ key: "steady", tone: "info", text: ["No figure in this workspace moved by 5% or more in the last 30 days, and nothing is waiting.", "لم يتغير أي رقم في مساحة العمل هذه بنسبة 5% أو أكثر خلال آخر 30 يومًا، ولا شيء بانتظار الإجراء."] });
  return out;
}
