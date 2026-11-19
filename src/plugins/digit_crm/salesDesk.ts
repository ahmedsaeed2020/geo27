/**
 * DIGIT CRM C1–C3 read models (owner 2026-11-17): pipeline board and funnel, salesperson daily work and Customer 360 focus.
 * Read only except createDealTask / bulkReschedule / saveCrmRules, which write through the same task and settings records
 * every CRM screen reads. Figures come from the canonical CRM Deal / CRM Task / Sales Person / Customer records:
 *  - C1-01 / C1-04 stage columns: count, stage probability, total and weighted (the same dealsMoney the deal list uses), so
 *    the column totals add up to the scoped deal list; «لا نشاط منذ N أيام» from the deal's last activity against the
 *    working rule (default 3 days); close date red when it has passed on an open deal.
 *  - C1-02 funnel: deals that reached each open stage (current stage or any earlier stage in the deal's own stage log; a won
 *    deal reached every stage), conversion = reached(next) ÷ reached(this), win rate = won ÷ (won + lost).
 *  - C2 queue = the shared action queue (wf09); upcoming = my open follow-ups and expected closes from today through today +
 *    window; «المتبقي للهدف» = this fiscal year's Sales Person targets − attributed submitted Sales Orders (same attainment
 *    the Targets page shows), pace against the share of the year elapsed.
 *  - C3 focus now on a company: overdue / today follow-ups, passed or near closes, open deals without a next action, open
 *    quotations that expire soon and (finance permission only) overdue invoices.
 * Finance-only figures (balances, aging, payment score) need a finance role (working rule, default Accounts User / Accounts
 * Manager / System Manager); Administrator always passes.
 */
import { adapter, type Doc } from "@/lib/adapter";
import { ADMIN, userRoles } from "@/lib/session";
import { bucketOf, isManager, myWorkTasks, parseDue, rescheduleTask, toDatetime } from "./wf01";
import { customer360, dealProb, dealStages, dealStatusType, dealValue, isOpenDeal, scopedDeals } from "./wf02";
import { attainment, lastActivity, nextAction, salesPersonOf, stageHistory, targets } from "./wf03";
import { dealsMoney, type MoneySum } from "./wf05";

const s = (v: unknown) => String(v ?? "");
const d10 = (v: unknown) => s(v).slice(0, 10);
const pad = (n: number) => String(n).padStart(2, "0");
/** Local calendar date (follow-up due times are local, as bucketOf reads them). */
export const localDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const dayDiff = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 864e5);
const daysSince = (v: unknown, now = Date.now()) => { const t = Date.parse(String(v ?? "")); return Number.isFinite(t) ? Math.max(0, Math.floor((now - t) / 864e5)) : null; };
const addDays = (iso: string, n: number) => { const x = new Date(`${iso}T00:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };

/* ------------------------------------------------------------------ working rules (FCRM Settings) ------------------------------------------------------------------ */
export const RULE_DEFAULTS = { inactivityDays: 3, financeRoles: ["Accounts User", "Accounts Manager", "System Manager"] } as const;
const SETTINGS = "FCRM Settings";
export interface CrmRules { inactivityDays: number; financeRoles: string[] }
export function crmRules(): CrmRules {
  const st = adapter.get(SETTINGS, SETTINGS);
  const days = Number(st?.["custom_inactivity_warning_days"]);
  const roles = s(st?.["custom_finance_roles"]).split(/[\n,]/).map((x) => x.trim()).filter(Boolean);
  return { inactivityDays: Number.isFinite(days) && days >= 1 ? Math.floor(days) : RULE_DEFAULTS.inactivityDays, financeRoles: roles.length ? roles : [...RULE_DEFAULTS.financeRoles] };
}
export function saveCrmRules(p: Partial<CrmRules>, user: string): { ok: true } | { ok: false; error: string } {
  if (!isManager(user)) return { ok: false, error: "Only a Sales Manager can change the working rules" };
  if (p.inactivityDays !== undefined && !(Number.isInteger(p.inactivityDays) && p.inactivityDays >= 1 && p.inactivityDays <= 90)) return { ok: false, error: "Enter whole days between 1 and 90" };
  if (p.financeRoles !== undefined && !p.financeRoles.filter(Boolean).length) return { ok: false, error: "Keep at least one finance role" };
  const patch: Record<string, unknown> = {};
  if (p.inactivityDays !== undefined) patch["custom_inactivity_warning_days"] = p.inactivityDays;
  if (p.financeRoles !== undefined) patch["custom_finance_roles"] = p.financeRoles.filter(Boolean).join("\n");
  if (adapter.get(SETTINGS, SETTINGS)) adapter.update(SETTINGS, SETTINGS, patch); else adapter.insertDoc(SETTINGS, { name: SETTINGS, ...patch });
  return { ok: true };
}
/** Balances, aging and the payment score need the finance permission (CRM rule 3). */
export const canSeeFinance = (user: string) => user === ADMIN || userRoles(user).some((r) => crmRules().financeRoles.includes(r));

/* ------------------------------------------------------------------ C1 pipeline ------------------------------------------------------------------ */
export interface DealView { deal: Doc; value: MoneySum; prob: number; close: string; closeLate: boolean; inactive: number | null; next?: Doc | undefined; lastAt: string; stageAge: number | null }
export interface StageView { key: string; type: string; color: string; position: number; prob: number; count: number; total: MoneySum; weighted: MoneySum; deals: DealView[] }
export function dealView(d: Doc, rules = crmRules(), now = new Date()): DealView {
  const open = isOpenDeal(d), close = d10(d["expected_closure_date"]), today = localDay(now);
  const lastAt = lastActivity(d.name) || s(d["modified"]); const idle = daysSince(lastAt, now.getTime());
  const log = stageHistory(d).filter((r) => !r.to).pop(); const since = log ? Date.parse(log.from_date) : NaN;
  return { deal: d, value: dealsMoney([d]), prob: dealProb(d), close, closeLate: open && !!close && close < today,
    inactive: open && idle !== null && idle >= rules.inactivityDays ? idle : null, next: nextAction(d.name), lastAt, stageAge: Number.isFinite(since) ? Math.max(0, Math.floor((now.getTime() - since) / 864e5)) : null };
}
/** Board columns in stage order; cards late first, then by value. */
export function pipelineStages(user: string, now = new Date()): StageView[] {
  const deals = scopedDeals(user), rules = crmRules();
  return dealStages().map((st) => {
    const ds = deals.filter((d) => d["status"] === st.name);
    const views = ds.map((d) => dealView(d, rules, now)).sort((a, b) => Number(b.closeLate) - Number(a.closeLate) || (b.value.base ?? 0) - (a.value.base ?? 0) || a.deal.name.localeCompare(b.deal.name));
    return { key: st.name, type: s(st["type"]) || "Open", color: s(st["color"]) || "gray", position: Number(st["position"] ?? 0), prob: Number(st["probability"] ?? 0) || 0, count: ds.length, total: dealsMoney(ds), weighted: dealsMoney(ds, true), deals: views };
  });
}
/** C1-04: the board's column totals against the scoped deal list (the Deals register reads the same canonical deals). */
export function boardCheck(user: string) {
  const cols = pipelineStages(user), deals = scopedDeals(user), list = dealsMoney(deals);
  const colCount = cols.reduce((a, c) => a + c.count, 0), colBase = cols.reduce((a, c) => a + (c.total.base ?? 0), 0);
  const r2 = (v: number) => Math.round(v * 100) / 100;
  return { colCount, listCount: deals.length, colTotal: r2(colBase), listTotal: r2(list.base ?? 0), ok: colCount === deals.length && Math.abs(colBase - (list.base ?? 0)) < 0.01,
    perStage: cols.map((c) => ({ stage: c.key, count: c.count, total: r2(c.total.base ?? 0), weighted: r2(c.weighted.base ?? 0), prob: c.prob })) };
}
export interface FunnelStep { key: string; label: string; color: string; reached: number; conversion: number | null }
/** C1-02 funnel of the scoped deals and the win rate (won ÷ closed). */
export function winFunnel(user: string) {
  const stages = dealStages(), deals = scopedDeals(user);
  const pos = new Map(stages.map((x) => [x.name, Number(x["position"] ?? 0)])), type = new Map(stages.map((x) => [x.name, s(x["type"]) || "Open"]));
  const open = stages.filter((x) => !["Won", "Lost"].includes(type.get(x.name)!)), won = stages.filter((x) => type.get(x.name) === "Won");
  const top = Math.max(0, ...stages.map((x) => Number(x["position"] ?? 0)));
  const furthest = (d: Doc) => {
    if (type.get(s(d["status"])) === "Won") return top + 1;
    const seen = [s(d["status"]), ...stageHistory(d).flatMap((h) => [h.from, h.to])].filter((x) => x && type.get(x) !== "Lost" && pos.has(x));
    return seen.length ? Math.max(...seen.map((x) => pos.get(x)!)) : Math.min(...open.map((x) => pos.get(x.name)!));
  };
  const far = deals.map(furthest);
  const steps: FunnelStep[] = [...open, ...won].map((st) => ({ key: st.name, label: st.name, color: s(st["color"]) || "gray", reached: type.get(st.name) === "Won" ? deals.filter((d) => d["status"] === st.name).length : far.filter((f) => f >= pos.get(st.name)!).length, conversion: null }));
  steps.forEach((x, i) => { const prev = steps[i - 1]; x.conversion = prev && prev.reached > 0 ? Math.round((x.reached / prev.reached) * 1000) / 10 : null; });
  const nWon = deals.filter((d) => type.get(s(d["status"])) === "Won").length, nLost = deals.filter((d) => type.get(s(d["status"])) === "Lost").length;
  return { steps, won: nWon, lost: nLost, total: deals.length, winRate: nWon + nLost ? Math.round((nWon / (nWon + nLost)) * 100) : null };
}

/* ------------------------------------------------------------------ C2 salesperson daily work ------------------------------------------------------------------ */
type TaskResult = { ok: true; name: string } | { ok: false; error: string };
/** Next step on a deal: an open CRM Task on the deal (owner or manager), so the deal leaves «بدون إجراء تالٍ». */
export function createDealTask(deal: string, input: { title: string; due: string }, user: string): TaskResult {
  const d = scopedDeals(user).find((x) => x.name === deal);
  if (!d || !(isManager(user) || d["deal_owner"] === user)) return { ok: false, error: "Not permitted" };
  if (!isOpenDeal(d)) return { ok: false, error: "The deal is closed" };
  if (!input.title.trim()) return { ok: false, error: "Title is required" };
  const due = parseDue(input.due.replace("T", " "));
  if (!due) return { ok: false, error: "Due date and time are required" };
  const n = Math.max(0, ...adapter.list("CRM Task").map((t) => Number(/(\d+)$/.exec(t.name)?.[1] ?? 0))) + 1;
  const t = adapter.insertDoc("CRM Task", { name: `CRM-TASK-${String(n).padStart(5, "0")}`, title: input.title.trim(), priority: "Medium", status: "Todo", due_date: toDatetime(due),
    assigned_to: s(d["deal_owner"]) || user, reference_doctype: "CRM Deal", reference_docname: deal });
  return { ok: true, name: t.name };
}
/** C2-02 bulk reschedule: every selected follow-up to one new due time; refusals are returned per task. */
export function bulkReschedule(names: string[], due: string, user: string): { moved: string[]; refused: { name: string; error: string }[] } {
  const moved: string[] = [], refused: { name: string; error: string }[] = [];
  for (const n of names) { const r = rescheduleTask(n, due, user); if (r.ok) moved.push(n); else refused.push({ name: n, error: Object.values(r.errors)[0] ?? "Not permitted" }); }
  return { moved, refused };
}
/** Date + time `days` from now at the same clock time (datetime-local value). */
export function shiftDue(due: unknown, days: number, now = new Date()): string {
  const base = parseDue(due) ?? now; const x = new Date(Math.max(base.getTime(), now.getTime())); x.setDate(x.getDate() + days);
  return `${localDay(x)}T${pad(x.getHours())}:${pad(x.getMinutes())}`;
}
export interface UpcomingWork { key: string; kind: "task" | "close"; date: string; days: number; title: string; sub: string; dt: string; name: string; task?: string | undefined; amount: MoneySum | null; owner: string }
/** C2-04 my open follow-ups due and my open deals closing from today through today + window (0 = today only). */
export function upcomingWork(user: string, window: number, now = new Date()): UpcomingWork[] {
  const today = localDay(now), end = addDays(today, window), out: UpcomingWork[] = [];
  for (const t of myWorkTasks(user)) {
    const b = bucketOf(t, now); if (b !== "today" && b !== "upcoming") continue;
    const at = parseDue(t["due_date"]); if (!at) continue; const day = localDay(at); if (day > end) continue;
    const lead = adapter.get("CRM Lead", s(t["reference_docname"]));
    out.push({ key: `t:${t.name}`, kind: "task", date: day, days: dayDiff(today, day), title: s(t["title"]) || t.name, sub: s(lead?.["lead_name"]) || s(t["reference_docname"]), dt: s(t["reference_doctype"]), name: s(t["reference_docname"]), task: t.name, amount: null, owner: s(t["assigned_to"]) });
  }
  const mgr = isManager(user);
  for (const d of scopedDeals(user)) {
    if (!isOpenDeal(d) || (!mgr && d["deal_owner"] !== user)) continue;
    const c = d10(d["expected_closure_date"]); if (!c || c < today || c > end) continue;
    out.push({ key: `d:${d.name}`, kind: "close", date: c, days: dayDiff(today, c), title: s(d["organization"]) || d.name, sub: d.name, dt: "CRM Deal", name: d.name, amount: dealsMoney([d]), owner: s(d["deal_owner"]) });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || (a.kind === b.kind ? 0 : a.kind === "task" ? -1 : 1) || a.title.localeCompare(b.title));
}
export interface TargetPos { scope: "mine" | "team" | "none"; who: string; fiscalYear: string; target: number; achieved: number; remaining: number; over: number; pct: number | null; expected: number; level: "ok" | "warn" | "over"; people: number; attributed: boolean; yearShare: number }
/** C2-03 «المتبقي للهدف»: this fiscal year's targets of my Sales Person (a manager without one sees the whole team). */
/** `of`: another salesperson's position as `user` sees it (owner notes C-03 team cards) — the viewer's readable targets and
 *  attribution, the same rule as the viewer's own ring. */
export function targetPosition(user: string, now = new Date(), of?: string): TargetPos {
  const today = localDay(now);
  const fy = adapter.list("Fiscal Year").find((f) => d10(f["year_start_date"]) <= today && today <= d10(f["year_end_date"]));
  const none: TargetPos = { scope: "none", who: "", fiscalYear: fy?.name ?? "", target: 0, achieved: 0, remaining: 0, over: 0, pct: null, expected: 0, level: "ok", people: 0, attributed: false, yearShare: 0 };
  if (!fy) return none;
  const me = salesPersonOf(of ?? user), all = targets(user).filter((t) => t.fiscalYear === fy.name);
  const rows = me ? all.filter((t) => t.salesPerson === me.name) : !of && isManager(user) ? all : [];
  if (!rows.length) return { ...none, who: me?.name ?? "" };
  const target = rows.reduce((a, t) => a + t.amount, 0);
  let achieved = 0, attributed = false;
  for (const t of rows) { const a = attainment(t, user).achieved; if (a !== null) { attributed = true; achieved += a; } }
  const start = Date.parse(`${d10(fy["year_start_date"])}T00:00:00Z`), end = Date.parse(`${d10(fy["year_end_date"])}T23:59:59Z`);
  const yearShare = Math.min(1, Math.max(0, (Date.parse(`${today}T12:00:00Z`) - start) / (end - start)));
  const expected = target * yearShare;
  const r2 = (v: number) => Math.round(v * 100) / 100;
  return { scope: me ? "mine" : "team", who: me?.name ?? "", fiscalYear: fy.name, target: r2(target), achieved: r2(achieved), remaining: r2(Math.max(0, target - achieved)), over: r2(Math.max(0, achieved - target)),
    pct: target ? Math.round((achieved / target) * 100) : null, expected: r2(expected), level: achieved >= expected ? "ok" : achieved >= expected * 0.8 ? "warn" : "over", people: new Set(rows.map((t) => t.salesPerson)).size, attributed, yearShare };
}

/* ------------------------------------------------------------------ C3 Customer 360 ------------------------------------------------------------------ */
export type FocusKind = "task" | "deal" | "quote" | "invoice";
export type FocusReason = "task_overdue" | "task_today" | "close_passed" | "close_soon" | "no_next" | "quote_expired" | "quote_expiring" | "invoice_overdue";
export interface FocusItem { key: string; kind: FocusKind; reason: FocusReason; tone: "bad" | "warn" | "info"; title: string; sub: string; date: string; days: number; dt: string; name: string }
const TONE: Record<FocusReason, FocusItem["tone"]> = { task_overdue: "bad", close_passed: "bad", quote_expired: "bad", invoice_overdue: "bad", task_today: "warn", close_soon: "warn", quote_expiring: "warn", no_next: "info" };
/** C3-02 what needs action on one company now (most urgent first). Overdue invoices only with the finance permission. */
export function focusNow(c: NonNullable<ReturnType<typeof customer360>>, user: string, now = new Date()): FocusItem[] {
  const today = localDay(now), soon = addDays(today, 7), out: FocusItem[] = [];
  const titleOf = (dt: string, n: string) => dt === "CRM Deal" ? s(c.deals.find((d) => d.name === n)?.["organization"]) || n : s(c.leads.find((l) => l.name === n)?.["lead_name"]) || n;
  for (const a of c.activities) {
    if (a.kind !== "Task") continue; const t = adapter.get("CRM Task", a.name); if (!t) continue;
    const b = bucketOf(t, now); if (b !== "overdue" && b !== "today") continue;
    const at = parseDue(t["due_date"]); const day = at ? localDay(at) : today;
    out.push({ key: `t:${t.name}`, kind: "task", reason: b === "overdue" ? "task_overdue" : "task_today", tone: TONE[b === "overdue" ? "task_overdue" : "task_today"], title: s(t["title"]) || t.name, sub: titleOf(s(t["reference_doctype"]), s(t["reference_docname"])), date: day, days: dayDiff(day, today), dt: "CRM Task", name: t.name });
  }
  for (const d of c.deals.filter(isOpenDeal)) {
    const close = d10(d["expected_closure_date"]);
    const reason: FocusReason | null = close && close < today ? "close_passed" : close && close <= soon ? "close_soon" : !nextAction(d.name) ? "no_next" : null;
    if (reason) out.push({ key: `d:${d.name}`, kind: "deal", reason, tone: TONE[reason], title: s(d["status"]), sub: d.name, date: close, days: close ? dayDiff(close, today) : 0, dt: "CRM Deal", name: d.name });
  }
  for (const q of c.quotations) {
    if (Number(q.docstatus) !== 1 || !["Open", "Replied", "Partially Ordered"].includes(s(q["status"]) || "Open")) continue;
    const v = d10(q["valid_till"]); if (!v || v > soon) continue;
    const reason: FocusReason = v < today ? "quote_expired" : "quote_expiring";
    out.push({ key: `q:${q.name}`, kind: "quote", reason, tone: TONE[reason], title: q.name, sub: s(q["grand_total"]), date: v, days: dayDiff(v, today), dt: "Quotation", name: q.name });
  }
  if (canSeeFinance(user)) for (const inv of c.invoices) {
    const due = d10(inv["due_date"]); if (Number(inv.docstatus) !== 1 || !(Number(inv["outstanding_amount"]) > 0.005) || !due || due >= today) continue;
    out.push({ key: `i:${inv.name}`, kind: "invoice", reason: "invoice_overdue", tone: "bad", title: inv.name, sub: s(inv["outstanding_amount"]), date: due, days: dayDiff(due, today), dt: "Sales Invoice", name: inv.name });
  }
  const rank = { bad: 0, warn: 1, info: 2 } as const;
  return out.sort((a, b) => rank[a.tone] - rank[b.tone] || b.days - a.days || a.key.localeCompare(b.key));
}
/** The deal's stage log as change-log entries (status old → new on the day it changed), for the Customer 360 activity log. */
export function stageLogEntries(d: Doc): { key: string; at: string; who: string; changes: { field: string; label: string; from: string; to: string; select: boolean }[]; added: number; removed: number }[] {
  return stageHistory(d).filter((h) => h.to && h.to_date).map((h, i) => ({ key: `stage:${d.name}:${i}`, at: s(h.to_date).replace(" ", "T"), who: h.owner || s(d["deal_owner"]), changes: [{ field: "status", label: "Status", from: h.from, to: h.to, select: true }], added: 0, removed: 0 }));
}
/** Open deals of the company with their stage index on the open stages + Won (C3-03). */
export function openDealStages(c: NonNullable<ReturnType<typeof customer360>>) {
  const stages = dealStages().filter((x) => dealStatusType(x.name) !== "Lost");
  return { stages, deals: c.deals.filter(isOpenDeal).map((d) => ({ deal: d, index: Math.max(0, stages.findIndex((x) => x.name === d["status"])), value: dealsMoney([d]), weighted: dealValue(d) * dealProb(d) / 100 })) };
}
