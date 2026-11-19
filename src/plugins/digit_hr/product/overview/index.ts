/**
 * The 30 section overviews and 7 department homes of DIGIT HR (owner brief 2026-11-15 §2). A department home composes
 * figures and charts that already belong to its sections (by reference, never recomputed), so a figure keeps one
 * formula and one drill wherever it is shown.
 */
import { D01 } from "./d01";
import { D02 } from "./d02";
import { D03 } from "./d03";
import { D04 } from "./d04";
import { D05 } from "./d05";
import { D06 } from "./d06";
import { D07 } from "./d07";
import type { ChartSpec, DecisionItem, Insight, KpiSpec, SectionSpec } from "./kit";
import type { Width } from "@/lib/dashboards/registry";

import { R3_EXTRA } from "./r3charts";

// visual round R3: the new HR charts join their sections after the section's own charts (additive blocks)
export const SECTION_SPECS: Record<string, SectionSpec> = Object.fromEntries([...D01, ...D02, ...D03, ...D04, ...D05, ...D06, ...D07].map((s) => [s.id, R3_EXTRA[s.id] ? { ...s, extra: [...(s.extra ?? []), ...R3_EXTRA[s.id]!] } : s]));
export const sectionSpec = (id: string): SectionSpec | undefined => SECTION_SPECS[id];

/** Department home composition: "section:id" references to section figures and charts (with the width on the home). */
export const DEPT_COMPOSE: Record<string, { kpis: string[]; charts: [ref: string, w: Width][] }> = {
  "01": { kpis: ["01.1:active", "01.4:joiners", "01.3:vacant", "01.6:exp30"], charts: [["01.1:org-tree", 8], ["01.4:completeness-gauge", 4], ["01.6:expiry-timeline", 12]] },
  "02": { kpis: ["02.1:openings", "02.1:applicants", "02.2:inprog", "02.3:avg"], charts: [["02.1:funnel", 8], ["02.1:offer-acceptance", 4], ["02.1:interview-calendar", 12], ["02.3:nine-box", 6], ["02.4:skills-heatmap", 6]] },
  "03": { kpis: ["03.1:onleave", "03.2:present", "03.3:ot", "03.1:open"], charts: [["03.2:exceptions-site", 8], ["03.3:ot-budget", 4], ["03.3:coverage", 6], ["03.1:leave-overlap", 6]] },
  "04": { kpis: ["04.1:net", "04.1:variances", "04.2:wps", "04.3:saudization"], charts: [["04.1:preflight", 8], ["04.1:variance-bridge", 4], ["04.1:cost-dept", 8], ["04.2:filing-status", 4], ["04.3:nitaqat", 12]] },
  "05": { kpis: ["05.2:waiting", "05.2:late", "05.3:open", "05.3:breach"], charts: [["05.1:my-requests", 8], ["05.2:by-type", 4], ["05.2:team-approvals", 6], ["05.3:category-sla", 6]] },
  "06": { kpis: ["06.1:headcount", "06.1:turnover", "06.3:absent", "06.2:gap"], charts: [["06.1:headcount-trend", 8], ["06.3:absent-month", 4], ["06.3:turnover-tenure", 6], ["06.2:labour-project", 6], ["06.2:plan-actual", 12]] },
  "07": { kpis: ["07.1:setup", "07.2:exceptions", "07.3:failed", "07.4:failed"], charts: [["07.1:setup-steps", 8], ["07.4:status-matrix", 4], ["07.2:exceptions", 6], ["07.3:failed-list", 6]] },
};
const chartsOf = (s: SectionSpec): ChartSpec[] => [s.primary, ...(s.secondary ? [s.secondary] : []), ...(s.extra ?? [])];
export function resolveKpi(ref: string): { section: SectionSpec; kpi: KpiSpec } | undefined { const [sid, id] = ref.split(":"); const s = SECTION_SPECS[sid!]; const k = s?.kpis.find((x) => x.id === id); return s && k ? { section: s, kpi: k } : undefined; }
export function resolveChart(ref: string): { section: SectionSpec; chart: ChartSpec } | undefined { const [sid, id] = ref.split(":"); const s = SECTION_SPECS[sid!]; const c = s ? chartsOf(s).find((x) => x.id === id) : undefined; return s && c ? { section: s, chart: c } : undefined; }

/** A department home as one overview: the referenced figures (ids prefixed by their section), charts at the home width, and the sections' insights and decisions merged (risks first). */
export function deptSpec(dept: string): SectionSpec | undefined {
  const comp = DEPT_COMPOSE[dept]; if (!comp) return undefined;
  const secs = Object.values(SECTION_SPECS).filter((s) => s.id.startsWith(`${dept}.`));
  const kpis = comp.kpis.map(resolveKpi).filter((x): x is NonNullable<typeof x> => !!x).map(({ section, kpi }) => ({ ...kpi, id: `${section.id}-${kpi.id}` }));
  const charts = comp.charts.map(([r, w]) => { const x = resolveChart(r); return x ? { ...x.chart, id: `${x.section.id}-${x.chart.id}`, size: { w } } : undefined; }).filter((x): x is ChartSpec => !!x);
  if (!charts.length) return undefined;
  const rank = { risk: 0, info: 1, good: 2 } as const;
  return { id: dept, kpis, primary: charts[0]!, secondary: charts[1], extra: charts.slice(2),
    insights: (c) => { const all: Insight[] = secs.flatMap((s) => { try { return s.insights(c).map((i) => ({ ...i, key: `${s.id}-${i.key}` })); } catch { return []; } }); const risky = all.filter((i) => i.tone !== "good"); return (risky.length ? risky : all.slice(0, 1)).sort((a, b) => rank[a.tone] - rank[b.tone]).slice(0, 8); },
    decisions: (c) => { const seen = new Set<string>(); const all: DecisionItem[] = []; for (const s of secs) { let ds: DecisionItem[] = []; try { ds = s.decisions(c); } catch { /* source not readable */ } for (const d of ds) { const k = `${d.doctype}|${d.name}`; if (!seen.has(k)) { seen.add(k); all.push(d); } } } return all.sort((a, b) => (a.kind === "approve" ? 0 : 1) - (b.kind === "approve" ? 0 : 1) || b.age - a.age).slice(0, 20); } };
}
export type { SectionSpec };
