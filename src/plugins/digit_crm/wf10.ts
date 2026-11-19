/**
 * WF-10 — Research dashboard catalog (Package C): 10 boards × 8 widgets (W-001…W-080).
 * Every widget is computed live from canonical records via the existing wf01–wf09 helpers (adapter only,
 * no stored aggregates, no parallel record store). Each widget carries its source and calculation so it is
 * auditable; widgets whose data source or business policy does not exist return kind "blocked" with the reason
 * and are never counted as operational metrics. Thresholds are DIGIT working defaults, not approved policy.
 */
import { adapter, type Doc } from "@/lib/adapter";
import { canReadType, scopedList } from "@/lib/scope";
import { bucketOf, isOpenLead, scopedLeads, scopedTasks, userLabel } from "./wf01";
import { activities, customerForDeal, dealProb, dealStatusType, groupCount, isOpenDeal, pipeline, scopedAllTasks, scopedDeals } from "./wf02";
import { attainment, salesPersonOf, stageAgeDays, stageHistory, stageMoves, targets } from "./wf03";
import { accountHealth, dealFlags, dealsMoney, duplicateLeads, fmtMoney, forecastView, managerExceptions, receivablesSafe } from "./wf05";
import { firstContactStats } from "./wf07";
import { slaOf } from "./wf08";
import { teamPerformance } from "./wf09";
import { dealsIn, emailReplyStats, leadsIn, type RFilter } from "./wf04";
import { demoEnabled, demoRows, demoWhatsApp, forecastAccuracyDetail } from "./demoAnalytics";
import { DEMO_TYPES } from "./demoSchema";
import { linkTitle } from "@/lib/linkTitle";

/** `rec`: the label is record content (a person, territory, account or campaign name) and is never translated. */
export type Bar = { label: string; value: number; display?: string; to?: string; search?: Record<string, string>; rec?: boolean };
export type Row = { label: string; sub?: string; value?: string; to: string; search?: Record<string, string> };
export type Widget = {
  id: string; title: string; kind: "kpi" | "bars" | "list" | "progress" | "heat" | "blocked";
  source: string; calc: string; value?: string; hint?: string; to?: string; search?: Record<string, string>;
  /** Fixed explanation shown under a KPI (translated UI text, so no numbers); `unit` follows the value (translated). */
  note?: string; unit?: string;
  bars?: Bar[]; rows?: Row[]; pct?: number; heat?: { rows: string[]; cols: string[]; cells: number[][]; /** rows are people / records: never translated */ recRows?: boolean }; reason?: string;
  /** heat widgets: drill destination for one cell (row label × column label). */
  heatCell?: (row: string, col: string) => { to: string; search: Record<string, string> };
  /** Set only while an owner/period filter is active: "filtered" widgets honor it (and their drills carry it), "all" widgets show every permitted record. */
  scope?: "filtered" | "all";
};
export type Board = { id: string; title: string; audience: string; purpose: string; widgets: Widget[] };
export const BOARD_IDS = ["exec", "mgr", "rep", "lead", "pipe", "act", "fcb", "health", "comm", "ops"] as const;
export type BoardId = (typeof BOARD_IDS)[number];
export const BOARD_RULES = { recentDays: 30, silentDays: 30, hotProbability: 70 } as const;
/** Board filter = the Reports Center filter (deal/lead creation window, deal/lead owner), so filtered drills reconcile. */
export type BoardFilter = RFilter;
/** Widgets computed only from creation-dated, owner-attributed deals/leads whose drill keys apply the same RFilter in
 *  wf04 drillRecords. Every other widget keeps its own window/scope and is labelled "all permitted records". */
export const FILTERABLE = new Set(["W-001", "W-002", "W-004", "W-006", "W-009", "W-012", "W-019", "W-025", "W-026", "W-027", "W-030", "W-031", "W-033", "W-034", "W-035", "W-036", "W-038", "W-039", "W-040"]);
export const filterActive = (f: BoardFilter) => Boolean(f.from || f.to || f.owner);
export const filterSearch = (f: BoardFilter): Record<string, string> => ({ ...(f.from ? { from: f.from } : {}), ...(f.to ? { to: f.to } : {}), ...(f.owner ? { owner: f.owner } : {}) });
/** Board containing a widget id (W-001…W-080 → 8 per board in BOARD_IDS order). */
export const boardOfWidget = (wid: string): BoardId | undefined => BOARD_IDS[Math.floor((Number(wid.replace(/\D/g, "")) - 1) / 8)];

const DAY = 864e5;
const day = (v: unknown) => String(v ?? "").slice(0, 10);
const ageDays = (v: unknown, now: number) => { const t = Date.parse(String(v ?? "")); return Number.isFinite(t) ? (now - t) / DAY : null; };
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : null);
const dealTo = (d: Doc): Row => ({ label: linkTitle("CRM Organization", d["organization"]) || d.name, sub: d.name, value: fmtMoney(dealsMoney([d])), to: `/digit-crm/deals/${d.name}` });
const leadTo = (l: Doc): Row => ({ label: String(l["lead_name"] || l.name), sub: l.name, to: `/crm/leads/${l.name}` });
const orgTo = (o: string, value?: string): Row => ({ label: linkTitle("CRM Organization", o), ...(value ? { value } : {}), to: `/digit-crm/customers/${o}` });
const blocked = (id: string, title: string, source: string, reason: string): Widget => ({ id, title, kind: "blocked", source, calc: "—", reason });
const won = (d: Doc) => dealStatusType(d["status"]) === "Won";
const lost = (d: Doc) => dealStatusType(d["status"]) === "Lost";

/** Fiscal year containing `today`. Like erpnext get_fiscal_year this is a configuration lookup, not a permissioned read:
 *  a Sales Manager without Fiscal Year read access still sees their permitted targets for the current year. */
export function currentFiscalYear(today: string, _user: string): string | null {
  const fy = adapter.list("Fiscal Year").find((f) => day(f["year_start_date"]) <= today && today <= day(f["year_end_date"]));
  return fy?.name ?? null;
}
/** Permitted targets for the current fiscal year in company currency with their attained value (Targets page basis:
 *  submitted Sales Orders' sales team in the fiscal year); null when no Sales Person target exists. */
function targetNow(today: string, user: string, person?: string) {
  const fy = currentFiscalYear(today, user); if (!fy) return null;
  const ts = targets(user).filter((t) => t.fiscalYear === fy && (!person || t.salesPerson === person));
  return ts.length ? { fy, amount: ts.reduce((a, t) => a + t.amount, 0), achieved: ts.reduce((a, t) => a + (attainment(t, user).achieved ?? 0), 0) } : null;
}
/** Drill destination inside the CRM shell: the Reports Center opens the exact source records for `drill`. */
const R = (cat: string, drill: string) => ({ to: "/digit-crm/reports", search: { cat, drill } });
/** Account health lives in wf05 (shared with the reports drill-down); re-exported here for existing importers. */
export { accountHealth } from "./wf05";

/** Adds the active filter to every Reports Center drill of a filtered widget, so the drill panel lists the same records. */
function withFilter(w: Widget, fs: Record<string, string>): Widget {
  const add = <T extends { to?: string | undefined; search?: Record<string, string> | undefined }>(x: T): T => (x.to === "/digit-crm/reports" ? { ...x, search: { ...(x.search ?? {}), ...fs } } : x);
  const heatCell = w.heatCell; const out: Widget = { ...add(w), scope: "filtered" };
  if (w.bars) out.bars = w.bars.map(add);
  if (w.rows) out.rows = w.rows.map(add);
  if (heatCell) out.heatCell = (r, c) => { const x = heatCell(r, c); return { ...x, search: { ...x.search, ...fs } }; };
  return out;
}

/** One board. With an owner/period filter, FILTERABLE widgets are computed from the filtered deals/leads (drills carry the
 *  filter); every other widget is the unfiltered computation, flagged scope "all" — never a silently mixed number. */
export function buildBoard(id: BoardId, user: string, nowD = new Date(), f: BoardFilter = {}, memo?: BoardMemo): Board {
  if (!filterActive(f)) return buildCore(id, user, nowD, {}, ctxFor(memo, user, nowD, {}));
  const all = buildCore(id, user, nowD, {}, ctxFor(memo, user, nowD, {})), sub = buildCore(id, user, nowD, f, ctxFor(memo, user, nowD, f)), fs = filterSearch(f);
  return { ...all, widgets: all.widgets.map((w, i) => { const s = sub.widgets[i]; return FILTERABLE.has(w.id) && s ? withFilter(s, fs) : { ...w, scope: "all" as const }; }) };
}

/** Inputs shared by every board for one user, time and filter. Computed once per resolve call and reused across boards,
 *  so composing widgets from several boards (department workspaces) does not repeat the scoped reads. */
function boardContext(user: string, nowD: Date, f: BoardFilter) {
  const now = nowD.getTime(), today = nowD.toISOString().slice(0, 10);
  const deals = filterActive(f) ? dealsIn(user, f) : scopedDeals(user), open = deals.filter(isOpenDeal), leads = filterActive(f) ? leadsIn(user, f) : scopedLeads(user);
  const openMoney = dealsMoney(open), weighted = dealsMoney(open, true);
  const tgt = targetNow(today, user);
  const team = teamPerformance(user, nowD);
  const ex = managerExceptions(user);
  const fl = open.map((d) => dealFlags(d, now));
  const tasks = scopedAllTasks(user);
  const acts = activities(user);
  const fv = forecastView(user, {});
  const dupes = duplicateLeads(user);
  const fc = firstContactStats(leads);
  const sla = leads.filter(isOpenLead).filter((l) => slaOf(l, now).state === "breached");
  return { now, today, deals, open, leads, openMoney, weighted, tgt, team, ex, fl, tasks, acts, fv, dupes, fc, sla };
}
export type BoardMemo = Map<string, ReturnType<typeof boardContext>>;
function ctxFor(memo: BoardMemo | undefined, user: string, nowD: Date, f: BoardFilter) {
  if (!memo) return boardContext(user, nowD, f);
  const k = `${user}|${nowD.getTime()}|${f.from ?? ""}|${f.to ?? ""}|${f.owner ?? ""}`;
  let c = memo.get(k); if (!c) { c = boardContext(user, nowD, f); memo.set(k, c); }
  return c;
}

function buildCore(id: BoardId, user: string, nowD: Date, f: BoardFilter, ctx?: ReturnType<typeof boardContext>): Board {
  const { now, today, deals, open, leads, openMoney, weighted, tgt, team, ex, fl, tasks, acts, fv, dupes, fc, sla } = ctx ?? boardContext(user, nowD, f);
  const coverage = (): Widget => {
    const remaining = tgt && openMoney.base !== null ? tgt.amount - tgt.achieved : null;
    return !tgt ? blocked("", "Pipeline Coverage Ratio", "Sales Person.targets", "No sales target recorded for the current fiscal year")
      : { id: "", title: "Pipeline Coverage Ratio", kind: "kpi", source: "CRM Deal + Sales Person.targets + Sales Order.sales_team", calc: "open pipeline ÷ (target − attained this fiscal year)", value: remaining && remaining > 0 ? `${Math.round(((openMoney.base ?? 0) / remaining) * 10) / 10}×` : "—", hint: tgt.fy, to: "/digit-crm/forecast" };
  };
  /** Stage list from CRM Deal Status (position order); counts and values from the (possibly filtered) deals. */
  const stagesBars = (weightedV: boolean): Bar[] => pipeline(user).filter((s) => s.type !== "Lost").map((s) => { const xs = deals.filter((d) => d["status"] === s.stage); const m = dealsMoney(xs, weightedV); return { label: s.stage, value: weightedV ? m.base ?? 0 : xs.length, display: weightedV ? fmtMoney(m) : String(xs.length), to: "/digit-crm/reports", search: { cat: "pipeline", drill: `stage:${s.stage}` } }; });
  /** Leads per source and converted per source (same rule as wf02 sourceConversion, over the board's leads). */
  const sc = (() => { const m = new Map<string, { source: string; leads: number; converted: number }>(); for (const l of leads) { const k = String(l["source"] || "") || "Not set"; const r = m.get(k) ?? { source: k, leads: 0, converted: 0 }; r.leads++; if (Number(l["converted"])) r.converted++; m.set(k, r); } return [...m.values()].sort((a, b) => b.leads - a.leads); })();
  /** Open deals per expected-close month (same rule as wf02 forecast().months, over the board's open deals). */
  const closeMonths = (() => { const m = new Map<string, number>(); for (const d of open) { const k = String(d["expected_closure_date"] ?? "").slice(0, 7); if (/^\d{4}-\d{2}$/.test(k)) m.set(k, (m.get(k) ?? 0) + 1); } return [...m.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, count]) => ({ month, count })); })();
  const actDays = (n: number): Bar[] => Array.from({ length: n }, (_, i) => { const d = new Date(now - (n - 1 - i) * DAY).toISOString().slice(0, 10); return { label: d.slice(5), value: acts.filter((a) => day(a.when) === d).length, ...R("activity", `actday:${d}`) }; });
  let W: Omit<Widget, "id">[] = [];
  let meta: Omit<Board, "widgets" | "id">;

  switch (id) {
    case "exec": {
      const w = deals.filter(won), l = deals.filter(lost);
      const newCust = scopedList("Customer", user).filter((c) => c["crm_deal"] && (ageDays(c["creation"], now) ?? 99) <= BOARD_RULES.recentDays);
      const health = groupCount(accountHealth(user, now).map((h) => ({ name: h.org, state: h.state }) as unknown as Doc), "state");
      meta = { title: "Executive CRM Board", audience: "Executives", purpose: "Commercial health, forecast and growth." };
      W = [
        { title: "Total Open Pipeline", kind: "kpi", source: "CRM Deal (open stages)", calc: "Σ deal value", value: fmtMoney(openMoney), hint: `${open.length}`, ...R("pipeline", "open:") },
        { title: "Weighted Pipeline", kind: "kpi", source: "CRM Deal (open stages)", calc: "Σ value × probability", value: fmtMoney(weighted), ...R("pipeline", "open:") },
        tgt ? { title: "Forecast vs Target", kind: "progress", source: "CRM Deal + Sales Person.targets", calc: "weighted forecast ÷ target", pct: pct(weighted.base ?? 0, tgt.amount) ?? 0, value: `${fmtMoney(weighted)} / ${tgt.amount.toLocaleString("en-US")}`, hint: tgt.fy, to: "/digit-crm/targets" }
          : { ...blocked("", "Forecast vs Target", "Sales Person.targets", "No sales target recorded for the current fiscal year") },
        { title: "Win Rate", kind: "kpi", source: "CRM Deal (Won/Lost)", calc: "won ÷ (won + lost) — deals, not lead conversion", value: w.length + l.length ? `${pct(w.length, w.length + l.length)}%` : "—", hint: `${w.length} / ${l.length}`, ...R("pipeline", "closed:") },
        { title: "New Customers", kind: "kpi", source: "Customer created from a CRM deal", calc: `count, last ${BOARD_RULES.recentDays} days`, value: String(newCust.length), ...R("customers", "newcust:") },
        { title: "Won Revenue", kind: "kpi", source: "CRM Deal (Won)", calc: "Σ deal value — not invoiced or collected", value: fmtMoney(dealsMoney(w)), ...R("pipeline", "won:") },
        { title: "Portfolio Health Split", kind: "bars", source: "CRM Organization + Sales Invoice + activities", calc: "At risk = overdue receivable; Silent = no activity 30 days", bars: health.map((h) => ({ label: h.key, value: h.count, ...R("customers", `health:${h.key}`) })) },
        coverage(),
      ];
      break;
    }
    case "mgr": {
      const owners = new Map<string, Doc[]>(); for (const d of open) { const o = String(d["deal_owner"] ?? ""); owners.set(o, [...(owners.get(o) ?? []), d]); }
      const stages = pipeline(user).filter((s) => s.type === "Open" || s.type === "Ongoing" || !["Won", "Lost"].includes(s.type));
      const buckets = ["0–7", "8–14", "15–30", "30+"], bk = (a: number | null) => (a === null ? -1 : a <= 7 ? 0 : a <= 14 ? 1 : a <= 30 ? 2 : 3);
      const tg = targets(user).filter((t) => t.fiscalYear === currentFiscalYear(today, user));
      meta = { title: "Sales Manager Board", audience: "Sales managers", purpose: "Intervention and accountability." };
      W = [
        { title: "Pipeline by Representative", kind: "bars", source: "CRM Deal (open)", calc: "Σ value by deal owner", bars: [...owners.entries()].map(([o, ds]) => ({ rec: !!userLabel(o), label: userLabel(o) || "Unassigned", value: dealsMoney(ds).base ?? 0, display: fmtMoney(dealsMoney(ds)), ...R("pipeline", `openowner:${o || "Not set"}`) })) },
        { title: "Follow-up Compliance", kind: "list", source: "CRM Task (open)", calc: "open not overdue ÷ open", rows: team.map((r) => ({ label: userLabel(r.owner) || "Unassigned", value: r.compliance === null ? "—" : `${r.compliance}%`, to: "/digit-crm/follow-ups", search: { tab: "overdue", ...(r.owner ? { owner: r.owner } : {}) } })) },
        { title: "Stale Deals", kind: "list", source: "CRM Deal + activities", calc: "open, no activity > 14 days", rows: ex.stale.map(dealTo), ...R("pipeline", "staledeal:*") },
        { title: "Stage Aging Heatmap", kind: "heat", source: "CRM Deal.status_change_log", calc: "deals per stage × days in stage", heat: { rows: stages.map((s) => s.stage), cols: buckets, cells: stages.map((s) => buckets.map((_, i) => open.filter((d) => d["status"] === s.stage && bk(stageAgeDays(d, now)) === i).length)) }, heatCell: (r, c) => R("pipeline", `heat:${r}|${c}`) },
        tg.length ? { title: "Team Target Attainment", kind: "list", source: "Sales Person.targets + Sales Order.sales_team", calc: "attributed submitted orders this fiscal year ÷ target (Targets page basis)", rows: tg.map((t) => { const a = attainment(t, user); return { label: userLabel(t.user) || t.label, sub: t.salesPerson, value: a.pct === null ? "—" : `${a.pct}%`, to: "/digit-crm/targets" }; }) }
          : blocked("", "Team Target Attainment", "Sales Person.targets", "No sales target recorded for the current fiscal year"),
        { title: "Representative Leaderboard", kind: "list", source: "CRM Deal (Won)", calc: "ranked by won deals", rows: [...team].sort((a, b) => b.won - a.won).map((r) => ({ label: userLabel(r.owner) || "Unassigned", value: String(r.won), ...R("pipeline", `ownerwon:${r.owner || "Not set"}`) })) },
        { title: "High-Value Deals Without Follow-up", kind: "list", source: "CRM Deal + CRM Task", calc: "open, ≥ 50,000 base, no open task", rows: ex.highNoFollow.map(dealTo), to: "/crm/deals", search: { hl: "highnofollow" } },
        blocked("", "Approval Queue", "Workflow", "No approval workflow is defined for CRM records"),
      ];
      break;
    }
    case "rep": {
      const mine = scopedTasks(user), hot = open.filter((d) => dealProb(d) >= BOARD_RULES.hotProbability);
      const mySp = salesPersonOf(user), myT = mySp ? targetNow(today, user, mySp.name) : null;
      meta = { title: "Salesperson Board", audience: "Salespeople", purpose: "Today's work and direct actions." };
      W = [
        { title: "My Due Today", kind: "kpi", source: "CRM Task (assigned to me)", calc: "open, due today", value: String(mine.filter((t) => bucketOf(t, nowD) === "today").length), to: "/digit-crm/follow-ups", search: { tab: "today" } },
        { title: "My Overdue", kind: "kpi", source: "CRM Task (assigned to me)", calc: "open, past due", value: String(mine.filter((t) => bucketOf(t, nowD) === "overdue").length), to: "/digit-crm/follow-ups", search: { tab: "overdue" } },
        { title: "My Hot Deals", kind: "list", source: "CRM Deal (open)", calc: `probability ≥ ${BOARD_RULES.hotProbability}%`, rows: hot.map(dealTo) },
        myT ? { title: "My Target Progress", kind: "progress", source: "Sales Person.targets + Sales Order.sales_team", calc: "attributed submitted orders this fiscal year ÷ target (Targets page basis)", pct: pct(myT.achieved, myT.amount) ?? 0, value: `${myT.achieved.toLocaleString("en-US", { maximumFractionDigits: 0 })} / ${myT.amount.toLocaleString("en-US")}`, hint: myT.fy, to: "/digit-crm/targets" }
          : blocked("", "My Target Progress", "Sales Person.targets", "No sales target recorded for you this fiscal year"),
        { title: "My New Leads", kind: "list", source: "CRM Lead", calc: "status New, last 7 days", rows: leads.filter((l) => l["status"] === "New" && (ageDays(l["creation"], now) ?? 99) <= 7).map(leadTo), to: "/crm/leads", search: { hl: "new" } },
        { title: "My Weekly Activity", kind: "bars", source: "CRM Task, FCRM Note, CRM Call Log", calc: "activities per day, last 7 days", bars: actDays(7) },
        blocked("", "My Promised Callbacks", "CRM Call Log", "CRM Call Log has no callback-promise field"),
        blocked("", "My Open WhatsApp", "WhatsApp", "Needs a connected WhatsApp Business account"),
      ];
      break;
    }
    case "lead": {
      const weeks = Array.from({ length: 8 }, (_, i) => { const end = Date.parse(today) + DAY - 1 - (7 - i) * 7 * DAY; const n = leads.filter((l) => { const a = ageDays(l["creation"], end); return a !== null && a >= 0 && a < 7; }).length; return { label: new Date(end).toISOString().slice(5, 10), value: n, ...R("leads", `week:${new Date(end).toISOString().slice(0, 10)}`) }; });
      const hasCampaign = leads.some((l) => l["campaign"] || l["utm_campaign"]);
      const fun = [["All", leads.length], ["Contacted", leads.length - fc.noContact.length], ["Qualified", leads.filter((l) => l["status"] === "Qualified" || Number(l["converted"])).length], ["Converted", leads.filter((l) => Number(l["converted"])).length]] as const;
      meta = { title: "Lead Acquisition Board", audience: "Marketing and sales managers", purpose: "Acquisition quality and lead handling." };
      W = [
        { title: "New Leads Trend", kind: "bars", source: "CRM Lead.creation", calc: "leads per week, last 8 weeks", bars: weeks },
        { title: "Leads by Source", kind: "bars", source: "CRM Lead.source", calc: "count by source", bars: sc.map((s) => ({ label: s.source, value: s.leads, ...R("leads", `source:${s.source || "Not set"}`) })) },
        { title: "Conversion by Source", kind: "bars", source: "CRM Lead.converted", calc: "converted ÷ leads — lead conversion, not deal win rate", bars: sc.map((s) => ({ label: s.source, value: pct(s.converted, s.leads) ?? 0, display: `${pct(s.converted, s.leads) ?? 0}%`, ...R("leads", `source:${s.source || "Not set"}`) })) },
        { title: "Speed-to-Lead", kind: "kpi", source: "CRM Lead + first completed call or sent message", calc: "median hours from lead creation to first contact, open leads that were contacted; never-contacted leads are counted separately, never as 0 hours", value: fc.medianHours === null ? "—" : fc.medianHours.toFixed(1), ...(fc.medianHours === null ? {} : { unit: "hours" }), hint: `${fc.contacted} / ${fc.noContact.length}`, note: "contacted leads (median) / never contacted (excluded)", to: "/crm/leads", search: { hl: "sla" } },
        { title: "Unassigned Leads", kind: "kpi", source: "CRM Lead.lead_owner", calc: "open, no owner", value: String(leads.filter((l) => isOpenLead(l) && !l["lead_owner"]).length), to: "/crm/leads", search: { hl: "unassigned" } },
        { title: "Qualification Funnel", kind: "bars", source: "CRM Lead.status / converted", calc: "all → contacted → qualified → converted", bars: fun.map(([k, v]) => ({ label: k, value: v, ...R("leads", `funnel:${k}`) })) },
        hasCampaign ? { title: "Leads by Campaign", kind: "bars", source: "CRM Lead.campaign", calc: "count by campaign", bars: groupCount(leads, leads.some((l) => l["campaign"]) ? "campaign" : "utm_campaign").map((g) => ({ rec: true, label: linkTitle("Campaign", g.key), value: g.count, ...R("leads", `camp:${g.key}`) })) }
          : blocked("", "Leads by Campaign", "CRM Lead.campaign", "No lead records a campaign yet"),
        { title: "Duplicate Leads", kind: "list", source: "CRM Lead email/phone match", calc: "open leads with a matching lead", rows: dupes.map((d) => leadTo(d.lead)), to: "/crm/leads", search: { hl: "dupes" } },
      ];
      break;
    }
    case "pipe": {
      const m = closeMonths, terr = groupCount(open, "territory");
      const moves = stageMoves(deals, today, BOARD_RULES.recentDays);
      const reached = (st: string) => deals.filter((d) => d["status"] === st || stageHistory(d).some((h) => h.from === st || h.to === st)).length;
      const st = pipeline(user).filter((s) => s.type !== "Lost");
      meta = { title: "Pipeline Board", audience: "Sales managers", purpose: "Stage movement, bottlenecks and upcoming closings." };
      W = [
        { title: "Stage Funnel", kind: "bars", source: "CRM Deal.status", calc: "deals per stage", bars: stagesBars(false) },
        { title: "Weighted Value by Stage", kind: "bars", source: "CRM Deal", calc: "Σ value × probability per stage", bars: stagesBars(true) },
        { title: "Stage Aging", kind: "bars", source: "CRM Deal.status_change_log", calc: "average days in current stage", bars: st.map((s) => { const a = open.filter((d) => d["status"] === s.stage).map((d) => stageAgeDays(d, now)).filter((x): x is number => x !== null); return { label: s.stage, value: a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : 0, ...R("pipeline", `age:${s.stage}`) }; }) },
        { title: "Expected Closings", kind: "bars", source: "CRM Deal.expected_closure_date", calc: "open deals per close month", bars: m.map((x) => ({ label: x.month, value: x.count, ...R("pipeline", `closemon:${x.month}`) })) },
        { title: "Stale Opportunities", kind: "list", source: "CRM Deal + activities", calc: "open, no activity > 14 days", rows: ex.stale.map(dealTo), ...R("pipeline", "staledeal:*") },
        { title: "Pipeline by Territory", kind: "bars", source: "CRM Deal.territory", calc: "open deals per territory", bars: terr.map((t) => ({ rec: true, label: linkTitle("CRM Territory", t.key), value: t.count, ...R("pipeline", `terr:${t.key}`) })) },
        { title: "Pipeline Movement", kind: "kpi", source: "CRM Deal.status_change_log (to, to_date)", calc: `distinct deals with at least one stage change in the last ${BOARD_RULES.recentDays} days (creation is not a change); the drill lists the same deals`, value: String(moves.deals.length), hint: `${moves.forward} / ${moves.backward} / ${moves.lost}`, note: "stage moves: forward / backward / to lost", ...R("pipeline", "move:") },
        { title: "Stage Conversion Rates", kind: "bars", source: "CRM Deal.status_change_log", calc: "deals that reached each stage ÷ all deals", bars: st.map((s) => ({ label: s.stage, value: pct(reached(s.stage), deals.length) ?? 0, display: `${pct(reached(s.stage), deals.length) ?? 0}%`, ...R("pipeline", `reached:${s.stage}`) })) },
      ];
      break;
    }
    case "act": {
      const silent = accountHealth(user, now).filter((h) => h.state === "Silent");
      const done = tasks.filter((t) => t["status"] === "Done").length, counted = tasks.filter((t) => t["status"] !== "Canceled").length;
      const ev = scopedList("Event", user).filter((e) => e["status"] === "Open" && day(e["starts_on"]) && day(e["starts_on"]) < today);
      meta = { title: "Activity & Follow-up Board", audience: "Sales managers", purpose: "Follow-up discipline." };
      W = [
        { title: "Team Overdue Follow-ups", kind: "kpi", source: "CRM Task (Lead and Deal)", calc: "open, past due", value: String(ex.overdue.length), ...R("activity", "taskoverdue:") },
        { title: "Activity Mix", kind: "bars", source: "CRM Task, FCRM Note, CRM Call Log", calc: "count by type", bars: groupCount(acts as unknown as Doc[], "kind").map((g) => ({ label: g.key, value: g.count, ...R("activity", `kind:${g.key}`) })) },
        { title: "No-Activity Accounts", kind: "list", source: "CRM Organization + activities", calc: `no activity in ${BOARD_RULES.silentDays} days`, rows: silent.map((h) => orgTo(h.org)) },
        { title: "Task Completion Rate", kind: "kpi", source: "CRM Task.status", calc: "Done ÷ non-cancelled", value: counted ? `${pct(done, counted)}%` : "—", hint: `${done} / ${counted}`, ...R("activity", "taskrate:") },
        { title: "Response-Time SLA", kind: "kpi", source: "CRM Lead + first activity", calc: "open leads past 24 h without first contact", value: String(sla.length), to: "/crm/leads", search: { hl: "sla" } },
        blocked("", "Overdue Promised Callbacks", "CRM Call Log", "CRM Call Log has no callback-promise field"),
        { title: "Daily Activity Volume", kind: "bars", source: "CRM Task, FCRM Note, CRM Call Log", calc: "activities per day, last 14 days", bars: actDays(14) },
        { title: "Missed Meetings", kind: "list", source: "Event", calc: "status Open, start date passed", rows: ev.map((e) => ({ label: String(e["subject"] || e.name), sub: e.name, to: `/app/frappe/event/${e.name}` })), to: "/app/frappe/event" },
      ];
      break;
    }
    case "fcb": {
      const cat = (k: string) => fv.cats.find((c) => c.id === k)!;
      const owners = new Map<string, Doc[]>(); for (const d of fv.deals) { const o = String(d["deal_owner"] ?? ""); owners.set(o, [...(owners.get(o) ?? []), d]); }
      meta = { title: "Forecast Board", audience: "Executives and sales managers", purpose: "Forecast categories, gap and coverage." };
      W = [
        { title: "Commit Forecast", kind: "kpi", source: "CRM Deal (open)", calc: cat("commit").rule, value: fmtMoney(cat("commit").value), hint: `${cat("commit").deals.length}`, ...R("pipeline", "fcat:commit") },
        { title: "Best Case", kind: "kpi", source: "CRM Deal (open)", calc: cat("best").rule, value: fmtMoney(cat("best").value), hint: `${cat("best").deals.length}`, ...R("pipeline", "fcat:best") },
        tgt ? { title: "Gap to Target", kind: "kpi", source: "Sales Person.targets + weighted forecast", calc: "target − weighted forecast", value: weighted.base === null ? "—" : (tgt.amount - weighted.base).toLocaleString("en-US", { maximumFractionDigits: 0 }), hint: tgt.fy, to: "/digit-crm/targets" }
          : blocked("", "Gap to Target", "Sales Person.targets", "No sales target recorded for the current fiscal year"),
        { title: "Weighted Forecast", kind: "kpi", source: "CRM Deal (open)", calc: "Σ value × probability", value: fmtMoney(fv.weighted), ...R("pipeline", "open:") },
        blocked("", "Forecast Accuracy", "Forecast snapshots", "No historical forecast snapshots are recorded"),
        { title: "Forecast by Representative", kind: "bars", source: "CRM Deal (open)", calc: "weighted value by owner", bars: [...owners.entries()].map(([o, ds]) => ({ rec: !!userLabel(o), label: userLabel(o) || "Unassigned", value: dealsMoney(ds, true).base ?? 0, display: fmtMoney(dealsMoney(ds, true)), ...R("pipeline", `frep:${o || "Not set"}`) })) },
        blocked("", "Manager Adjustments", "Forecast adjustments", "No manager adjustment records exist"),
        coverage(),
      ];
      break;
    }
    case "health": {
      const h = accountHealth(user, now);
      const repeat = scopedList("Customer", user).filter((c) => scopedList("Sales Invoice", user).filter((s) => s["customer"] === c.name && Number(s["docstatus"]) === 1 && !Number(s["is_return"])).length >= 2);
      const r = receivablesSafe(scopedList("Sales Invoice", user), today);
      meta = { title: "Customer Health Board", audience: "Account managers", purpose: "Account risk, silence and value." };
      W = [
        { title: "Health Distribution", kind: "bars", source: "CRM Organization + Sales Invoice + activities", calc: "At risk = overdue receivable; Silent = no activity 30 days; else Healthy", bars: groupCount(h.map((x) => ({ name: x.org, state: x.state }) as unknown as Doc), "state").map((g) => ({ label: g.key, value: g.count, ...R("customers", `health:${g.key}`) })) },
        { title: "At-Risk Accounts", kind: "list", source: "Sales Invoice (submitted)", calc: "has overdue outstanding", rows: h.filter((x) => x.state === "At risk").map((x) => orgTo(x.org, fmtMoney(x.overdue))) },
        { title: "Silent Accounts", kind: "list", source: "Activities", calc: `no activity in ${BOARD_RULES.silentDays} days`, rows: h.filter((x) => x.state === "Silent").map((x) => orgTo(x.org)) },
        // a user without Sales Invoice read sees "Not permitted", never a zero (owner acceptance: denied = hidden, not 0)
        canReadType("Sales Invoice", user) ? { title: "Overdue ERP Receivables", kind: "kpi", source: "Sales Invoice (submitted, permitted)", calc: "Σ outstanding past due date", value: fmtMoney(r.overdue), ...R("customers", "overduear:") }
          : blocked("", "Overdue ERP Receivables", "Sales Invoice (submitted, permitted)", "Not permitted"),
        canReadType("Sales Invoice", user) ? { title: "Repeat Customers", kind: "kpi", source: "Sales Invoice (submitted, not return)", calc: "customers with ≥ 2 invoices", value: String(repeat.length), ...R("customers", "repeatcust:") }
          : blocked("", "Repeat Customers", "Sales Invoice (submitted, not return)", "Not permitted"),
        { title: "New Accounts", kind: "kpi", source: "CRM Organization.creation", calc: `last ${BOARD_RULES.recentDays} days`, value: String(scopedList("CRM Organization", user).filter((o) => (ageDays(o["creation"], now) ?? 99) <= BOARD_RULES.recentDays).length), ...R("customers", "neworgs:") },
        { title: "Open Opportunities per Account", kind: "bars", source: "CRM Deal (open)", calc: "open deals per organization", bars: h.filter((x) => x.open).sort((a, b) => b.open - a.open).slice(0, 8).map((x) => ({ rec: true, label: linkTitle("CRM Organization", x.org), value: x.open, to: `/digit-crm/customers/${x.org}` })) },
        { title: "Top Accounts by Value", kind: "list", source: "CRM Deal (Won)", calc: "Σ won deal value", rows: h.filter((x) => x.won.length).sort((a, b) => (dealsMoney(b.won).base ?? 0) - (dealsMoney(a.won).base ?? 0)).slice(0, 8).map((x) => orgTo(x.org, fmtMoney(dealsMoney(x.won)))) },
      ];
      break;
    }
    case "comm": {
      const com = scopedList("Communication", user), calls = scopedList("CRM Call Log", user);
      const mail = emailReplyStats(com);
      const ch = groupCount(com, "communication_medium").map((g) => ({ label: g.key, value: g.count }));
      if (calls.length) ch.push({ label: "Phone", value: calls.length });
      const wa = "Needs a connected WhatsApp Business account";
      meta = { title: "Communication Board", audience: "Sales and service teams", purpose: "Channel volume and responsiveness." };
      W = [
        blocked("", "Open WhatsApp Threads", "WhatsApp", wa), blocked("", "WhatsApp Response Time", "WhatsApp", wa),
        { title: "Messages by Channel", kind: "bars", source: "Communication + CRM Call Log", calc: "count by medium", bars: ch.map((b) => ({ ...b, ...R("activity", `chan:${b.label}`) })) },
        blocked("", "Daily WhatsApp Volume", "WhatsApp", wa), blocked("", "Unassigned Conversations", "WhatsApp", wa),
        { title: "Email Reply Rate", kind: "kpi", source: "Communication", calc: "records with a received email that also have a sent email", value: mail.received ? `${pct(mail.replied, mail.received)}%` : "—", hint: `${mail.replied} / ${mail.received}`, ...R("activity", "emailrecv:") },
        { title: "Call Connect Rate", kind: "kpi", source: "CRM Call Log.status", calc: "Completed ÷ all calls", value: calls.length ? `${pct(calls.filter((c) => c["status"] === "Completed").length, calls.length)}%` : "—", ...R("activity", "calls:") },
        blocked("", "Top Templates Used", "Email Template", "Template usage is not recorded on Communication"),
      ];
      break;
    }
    case "ops": {
      const handoff = deals.filter((d) => won(d) && !customerForDeal(d.name));
      meta = { title: "Operations Exceptions Board", audience: "Sales operations", purpose: "Records needing action now." };
      W = [
        { title: "Unassigned Leads", kind: "list", source: "CRM Lead.lead_owner", calc: "open, no owner", rows: ex.unassigned.map(leadTo), to: "/crm/leads", search: { hl: "unassigned" } },
        { title: "High-Value Deals Without Follow-up", kind: "list", source: "CRM Deal + CRM Task", calc: "open, ≥ 50,000 base, no open task", rows: ex.highNoFollow.map(dealTo), to: "/crm/deals", search: { hl: "highnofollow" } },
        { title: "CRM-to-ERP Handoff Exceptions", kind: "list", source: "CRM Deal (Won) + Customer.crm_deal", calc: "won deals without a customer", rows: handoff.map(dealTo) },
        { title: "Duplicate Records", kind: "kpi", source: "CRM Lead email/phone match", calc: "open leads with a match", value: String(dupes.length), to: "/crm/leads", search: { hl: "dupes" } },
        { title: "Overdue Follow-ups", kind: "kpi", source: "CRM Task (Lead and Deal)", calc: "open, past due", value: String(ex.overdue.length), ...R("activity", "taskoverdue:") },
        { title: "Neglected Records", kind: "kpi", source: "CRM Lead + CRM Deal activities", calc: "open, no activity > 14 days", value: String(ex.staleLeads.length + ex.stale.length), hint: `${ex.staleLeads.length} / ${ex.stale.length}`, ...R("leads", "neglected:") },
        blocked("", "Commission Exceptions", "Commission policy", "Commission policy not approved"),
        { title: "Response SLA Breaches", kind: "list", source: "CRM Lead + first activity", calc: "first contact later than 24 h or still missing", rows: sla.map(leadTo), to: "/crm/leads", search: { hl: "sla" } },
      ];
      break;
    }
  }
  void fl;
  if (demoEnabled()) {
    const wa = demoWhatsApp(user), commissions = demoRows(DEMO_TYPES.commission, user), snapshots = demoRows(DEMO_TYPES.forecast, user);
    const metric = (index: number, source: string, calc: string, value: string, drill: string, cat = "activity") => { const previous = W[index]; if (previous) W[index] = { title: previous.title, kind: "kpi", source, calc, value, ...R(cat, drill) }; };
    if (id === "fcb") {
      const fa = forecastAccuracyDetail(user);
      metric(4, `${DEMO_TYPES.forecast} + CRM Deal.closed_date`, "Synthetic: 1 − Σ|adjusted forecast − won value| ÷ Σ won value per salesperson and closed month; shown as — when the error exceeds the won value (never clamped to 0%)", fa.accuracy === null ? "—" : `${fa.accuracy}%`, "demo-forecast:", "pipeline");
      if (W[4]) W[4] = { ...W[4], hint: `\u2066\u20C1 ${Math.round(fa.forecast).toLocaleString("en-US")}\u2069 / \u2066\u20C1 ${Math.round(fa.actual).toLocaleString("en-US")}\u2069`, note: fa.reason === "error-exceeds-won-value" ? "adjusted forecast / won value — the forecast error is larger than the won value, so accuracy is not meaningful" : fa.reason ? "no closed months with won value yet" : "adjusted forecast / won value, closed months" };
      metric(6, DEMO_TYPES.forecast, "Synthetic: sum of manager adjustments, SAR", `\u2066\u20C1 ${snapshots.reduce((sum, d) => sum + Number(d["adjustment"]), 0).toLocaleString("en-US")}\u2069`, "demo-adjustment:", "pipeline");
    }
    if (id === "comm" || id === "rep") {
      if (id === "rep") metric(7, "Communication", "Synthetic: last event in thread is inbound", String(wa.open.length), "demo-wa-open:");
      else {
        metric(0, "Communication", "Synthetic: last event in thread is inbound", String(wa.open.length), "demo-wa-open:");
        metric(1, "Communication.communication_date", "Synthetic: mean hours from an inbound WhatsApp message to the next outbound message on the same record and thread", wa.responseHours.length ? (wa.responseHours.reduce((sum, h) => sum + h, 0) / wa.responseHours.length).toFixed(1) : "—", "demo-wa:");
        if (W[1]) W[1] = { ...W[1], ...(wa.responseHours.length ? { unit: "hours" } : {}), hint: `${wa.repliedThreads} / ${wa.inboundThreads}`, note: wa.responseHours.length ? "threads with a reply / threads with an inbound message" : "threads with a reply / threads with an inbound message — no outbound reply follows an inbound message on the same record and thread, so response time cannot be calculated" };
        const groups = new Map<string, number>(); for (const c of wa.messages) { const date = day(c["communication_date"]); groups.set(date, (groups.get(date) ?? 0) + 1); }
        const previous = W[3]; if (previous) W[3] = { title: previous.title, kind: "bars", source: "Communication.custom_demo_channel + communication_date", calc: "Synthetic messages per day, latest 14 active dates", bars: [...groups].sort(([a], [b]) => b.localeCompare(a)).slice(0, 14).reverse().map(([date, value]) => ({ label: date, value, ...R("activity", `demo-wa-day:${date}`) })) };
        metric(4, "Communication.custom_demo_assigned_to", "Synthetic: open inbound threads with no assignee", String(wa.unassigned.length), "demo-wa-unassigned:");
      }
    }
    if (id === "ops") metric(6, DEMO_TYPES.commission, "Demo policy only: held, rejected or reversed records", String(commissions.filter(c => ["Held", "Rejected", "Reversed"].includes(String(c["state"]))).length), "demo-commission:", "pipeline");
    if (id === "mgr") metric(7, DEMO_TYPES.commission, "Demo-only pending commission approvals; no payroll or financial liability", String(commissions.filter(c => c["state"] === "Pending").length), "demo-approval:", "pipeline");
    if (id === "rep") metric(6, "CRM Task.custom_demo_callback", "Synthetic open promised callbacks", String(demoRows("CRM Task", user).filter(t => Number(t["custom_demo_callback"]) && !["Done", "Canceled"].includes(String(t["status"]))).length), "demo-callback:");
    if (id === "act") metric(5, "CRM Task.custom_demo_callback", "Synthetic open promised callbacks past due", String(demoRows("CRM Task", user).filter(t => Number(t["custom_demo_callback"]) && bucketOf(t, nowD) === "overdue").length), "demo-callback:overdue");
    if (id === "lead") { const groups = groupCount(leads, "custom_demo_campaign"); const previous = W[6]; if (previous) W[6] = { title: previous.title, kind: "bars", source: "CRM Lead.custom_demo_campaign", calc: "Synthetic leads by linked campaign", bars: groups.slice(0, 10).map(g => ({ label: linkTitle("Campaign", g.key), value: g.count, ...R("leads", `camp:${g.key}`) })) }; }
  }
  const base = BOARD_IDS.indexOf(id) * 8;
  return { id, ...meta!, widgets: W.map((w, i) => ({ ...w, id: `W-${String(base + i + 1).padStart(3, "0")}` }) as Widget) };
}
