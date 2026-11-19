/**
 * Owner notes C-01 / C-02 / C-03 read models for CRM Home «لوحة علاقات العملاء», «عملي اليوم» and «منضدة المدير».
 * Every figure is computed at render time from the same scoped rows the lists and boards read (scopedDeals / scopedLeads,
 * activityDesk.activityRows, salesDesk.pipelineStages / targetPosition, wf05.forecastView / managerExceptions,
 * wf09.teamPerformance / actionQueue), so a card and its drill always show the same records. Read-only.
 */
import { activityRows, ACT_KINDS, type ActKind, type ActRow } from "./activityDesk";
import { pipelineStages, targetPosition, type TargetPos } from "./salesDesk";
import { dealsMoney, dealFlags, forecastView, managerExceptions } from "./wf05";
import { teamPerformance } from "./wf09";
import { dealStatusType, dealValue, isOpenDeal, scopedDeals } from "./wf02";
import { isManager, parseDue, scopedLeads } from "./wf01";
import { leadRows } from "./leadDesk";

const s = (v: unknown) => String(v ?? "");
const DAY = 864e5;
export interface Change { cur: number; prev: number; pct: number | null }
export const change = (cur: number, prev: number): Change => ({ cur, prev, pct: prev ? Math.round(((cur - prev) / Math.abs(prev)) * 1000) / 10 : null });
const ts = (v: unknown) => { const d = parseDue(s(v)); return d ? d.getTime() : NaN; };
/** [now − n days, now) and the n days before it. */
const inWin = (t: number, now: number, n: number, back = 0) => Number.isFinite(t) && t < now - back * n * DAY && t >= now - (back + 1) * n * DAY;

export interface HomeFigures {
  openCount: number; openValue: number; openValueAdded: Change;
  newLeads: Change; wonValue: Change; wonCount: Change; winRate: { pct: number | null; won: number; decided: number };
  activities7: Change; overdue: number;
}
/** C-01 KPI cards: each with its change against the previous period of the same length (30 days; activities 7 days). */
export function homeFigures(user: string, nowD = new Date()): HomeFigures {
  const now = nowD.getTime(), deals = scopedDeals(user), leads = scopedLeads(user), acts = activityRows(user, nowD);
  const open = deals.filter(isOpenDeal), won = deals.filter((d) => dealStatusType(d["status"]) === "Won"), lost = deals.filter((d) => dealStatusType(d["status"]) === "Lost");
  const created = (d: Record<string, unknown>) => ts(d["creation"]);
  const closed = (d: Record<string, unknown>) => ts(d["closed_date"] || d["modified"]);
  const sum = (xs: Record<string, unknown>[]) => Math.round(xs.reduce((a, d) => a + dealValue(d as never), 0) * 100) / 100;
  return {
    openCount: open.length, openValue: sum(open),
    openValueAdded: change(sum(open.filter((d) => inWin(created(d), now, 30))), sum(deals.filter((d) => inWin(created(d), now, 30, 1)))),
    newLeads: change(leads.filter((l) => inWin(ts(l["creation"]), now, 30)).length, leads.filter((l) => inWin(ts(l["creation"]), now, 30, 1)).length),
    wonValue: change(sum(won.filter((d) => inWin(closed(d), now, 30))), sum(won.filter((d) => inWin(closed(d), now, 30, 1)))),
    wonCount: change(won.filter((d) => inWin(closed(d), now, 30)).length, won.filter((d) => inWin(closed(d), now, 30, 1)).length),
    winRate: { won: won.length, decided: won.length + lost.length, pct: won.length + lost.length ? Math.round((won.length / (won.length + lost.length)) * 100) : null },
    activities7: change(acts.filter((a) => a.bucket !== "upcoming" && a.bucket !== "undated" && inWin(ts(a.when), now, 7)).length, acts.filter((a) => a.bucket !== "upcoming" && a.bucket !== "undated" && inWin(ts(a.when), now, 7, 1)).length),
    overdue: acts.filter((a) => a.bucket === "overdue").length,
  };
}

/** Open pipeline per stage (count · value) for the stacked bar; won / lost stages excluded. */
export function pipelineByStage(user: string) {
  return pipelineStages(user).filter((st) => st.type !== "Won" && st.type !== "Lost").map((st) => ({ key: st.key, count: st.count, value: st.total.base ?? 0, weighted: st.weighted.base ?? 0 }));
}

/** C-01 activity volume by type over the last `days` days (logged / done / held — not future plans), with the previous window. */
export function activityVolume(user: string, days = 30, nowD = new Date()) {
  const now = nowD.getTime(), rows = activityRows(user, nowD).filter((a) => a.bucket !== "upcoming" && a.bucket !== "undated");
  return ACT_KINDS.map((k) => { const xs = rows.filter((a) => a.kind === k); return { kind: k, ...change(xs.filter((a) => inWin(ts(a.when), now, days)).length, xs.filter((a) => inWin(ts(a.when), now, days, 1)).length) }; });
}

/** C-01 / C-03 forecast against target: achieved (orders) + commit + best case around the gap to this fiscal year's target. */
export function forecastPosition(user: string, nowD = new Date()) {
  const t: TargetPos = targetPosition(user, nowD), fv = forecastView(user, {});
  const cat = (id: string) => fv.cats.find((c) => c.id === id);
  const commit = cat("commit")?.value.base ?? 0, best = cat("best")?.value.base ?? 0, pipeline = cat("pipeline")?.value.base ?? 0;
  const gap = Math.max(0, t.target - t.achieved - commit - best);
  const covered = t.target ? Math.round(((t.achieved + commit) / t.target) * 100) : null;
  return { target: t, commit, best, pipeline, gap, covered, commitCount: cat("commit")?.deals.length ?? 0, bestCount: cat("best")?.deals.length ?? 0, weighted: fv.weighted.base ?? 0 };
}

/** C-03 forecast trend: commit / best case per expected-close month for the next `months` months, with the monthly target pace. */
export function forecastTrend(user: string, months = 6, nowD = new Date()) {
  const fv = forecastView(user, {}), t = targetPosition(user, nowD);
  const start = new Date(nowD.getFullYear(), nowD.getMonth(), 1);
  const keys = Array.from({ length: months }, (_, i) => { const d = new Date(start.getFullYear(), start.getMonth() + i, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; });
  const of = (id: string, m: string) => { const xs = fv.cats.find((c) => c.id === id)?.deals.filter((d) => s(d["expected_closure_date"]).slice(0, 7) === m) ?? []; return dealsMoney(xs).base ?? 0; };
  return { months: keys, commit: keys.map((m) => of("commit", m)), best: keys.map((m) => of("best", m)), pace: keys.map(() => (t.target ? Math.round(t.target / 12) : 0)), target: t.target, fiscalYear: t.fiscalYear };
}

export interface TeamCard { owner: string; openDeals: number; openValue: number; overdue: number; openTasks: number; stale: number; pastClose: number; won: number; lost: number; target: number; achieved: number; pct: number | null }
/** C-03 team cards / C-01 leaders: one row per salesperson owning deals or follow-ups; attainment is that person's own target position. */
export function teamCards(user: string, nowD = new Date()): TeamCard[] {
  return teamPerformance(user, nowD).filter((r) => r.owner).map((r) => {
    const flags = r.openDeals.map((d) => dealFlags(d, nowD.getTime()));
    const t = targetPosition(user, nowD, r.owner);
    return { owner: r.owner, openDeals: r.openDeals.length, openValue: Math.round(r.openDeals.reduce((a, d) => a + dealValue(d), 0) * 100) / 100, overdue: r.overdue, openTasks: r.openTasks,
      stale: flags.filter((f) => f.stale).length, pastClose: flags.filter((f) => f.overdueClose).length, won: r.won, lost: r.lost,
      target: t.scope === "mine" ? t.target : 0, achieved: t.scope === "mine" ? t.achieved : 0, pct: t.scope === "mine" ? t.pct : null };
  });
}
/** Leaders: highest attainment first, then wins. */
export const leaders = (cards: TeamCard[], n = 5) => [...cards].sort((a, b) => (b.pct ?? -1) - (a.pct ?? -1) || b.won - a.won || b.openValue - a.openValue).slice(0, n);

/** C-01 critical exceptions with counts; each opens the list that holds exactly those records. */
export function homeExceptions(user: string, nowD = new Date()) {
  const x = managerExceptions(user);
  const breached = leadRows(user, nowD).filter((r) => r.open && r.sla.state === "breached").length;
  return { unassigned: x.unassigned.length, overdue: x.overdue.length, breached, highNoFollow: x.highNoFollow.length, stale: x.stale.length, pastClose: x.pastClose.length, qualBlocked: x.qualBlocked.length, manager: isManager(user) };
}

/** C-02 today's timeline: my activities dated today in time order (a manager without own rows sees the team's). */
export function todayTimeline(user: string, nowD = new Date()): ActRow[] {
  const today = `${nowD.getFullYear()}-${String(nowD.getMonth() + 1).padStart(2, "0")}-${String(nowD.getDate()).padStart(2, "0")}`;
  const all = activityRows(user, nowD).filter((a) => a.day === today);
  const own = all.filter((a) => a.owner === user);
  const rows = own.length || !isManager(user) ? own : all;
  return rows.sort((a, b) => ts(a.when) - ts(b.when));
}
/** C-02 «منجز اليوم»: tasks completed today against today's workload (completed today + still open due today or overdue). */
export function doneToday(user: string, nowD = new Date()) {
  const today = `${nowD.getFullYear()}-${String(nowD.getMonth() + 1).padStart(2, "0")}-${String(nowD.getDate()).padStart(2, "0")}`;
  const all = activityRows(user, nowD).filter((a) => a.kind === "task");
  const own = all.filter((a) => a.owner === user); const rows = own.length || !isManager(user) ? own : all;
  const done = rows.filter((a) => a.bucket === "done" && s(a.doc?.["modified"]).slice(0, 10) === today).length;
  const dueToday = rows.filter((a) => a.bucket === "today").length, overdue = rows.filter((a) => a.bucket === "overdue").length;
  const logged = activityRows(user, nowD).filter((a) => (a.kind === "call" || a.kind === "note" || a.kind === "email" || a.kind === "whatsapp") && a.day === today && (a.owner === user || (!own.length && isManager(user)))).length;
  return { done, dueToday, overdue, planned: done + dueToday + overdue, logged };
}
export const kindCount = (rows: ActRow[], k: ActKind) => rows.filter((r) => r.kind === k).length;
