/**
 * WF-09 — Salesperson action queue (Package B). One ranked list combining canonical CRM Task follow-ups,
 * newly assigned leads without a next action, open deals without a next action (high value first)
 * and deals whose expected close is near. Pure reads; no task engine of its own.
 */
import { adapter, type Doc } from "@/lib/adapter";
import { bucketOf, isOpenLead, OPEN_TASK, scopedLeads, scopedTasks } from "./wf01";
import { dealStatusType, dealValue, isOpenDeal, scopedDeals } from "./wf02";
import { dealBase, PIPE_RULES } from "./wf05";

export const QUEUE_RULES = { closeSoonDays: 7, newLeadDays: 3 } as const;
export type Reason = "overdue" | "today" | "high_no_next" | "close_soon" | "new_lead" | "no_next" | "upcoming";
/** Lower rank = more urgent. Order is the documented priority rule. */
export const REASON_RANK: Record<Reason, number> = { overdue: 1, today: 2, high_no_next: 3, close_soon: 4, new_lead: 5, no_next: 6, upcoming: 7 };
export type QueueItem = { key: string; reason: Reason; dt: string; name: string; title: string; action: string; due: string; amount: number | null; cur: string; owner: string; status: string; task?: string };

let openVersion = -1;
const openRefs = new Set<string>();
/** Records with an open CRM Task; index rebuilt only when the adapter version changes. */
const hasOpenTask = (name: string) => {
  if (openVersion !== adapter.version()) { openRefs.clear(); for (const t of adapter.list("CRM Task")) if (OPEN_TASK.includes(String(t["status"] ?? "Backlog"))) openRefs.add(String(t["reference_docname"])); openVersion = adapter.version(); }
  return openRefs.has(name);
};
const days = (a: number, b: string) => (Date.parse(b) - a) / 864e5;

export function actionQueue(user: string, now = new Date()): QueueItem[] {
  const t0 = now.getTime(), out: QueueItem[] = [];
  for (const t of scopedTasks(user)) {
    const b = bucketOf(t, now); if (b === "closed") continue;
    out.push({ key: `t:${t.name}`, reason: b === "overdue" ? "overdue" : b === "today" ? "today" : "upcoming", dt: String(t["reference_doctype"] || "CRM Task"), name: String(t["reference_docname"] || t.name),
      title: String(t["title"] || t.name), action: "Follow up", due: String(t["due_date"] ?? ""), amount: null, cur: "", owner: String(t["assigned_to"] ?? ""), status: String(t["status"] ?? ""), task: t.name });
  }
  for (const l of scopedLeads(user)) {
    if (!isOpenLead(l) || l["status"] !== "New" || hasOpenTask(l.name)) continue;
    const age = -days(t0, String(l["creation"] ?? "")); if (!(age <= QUEUE_RULES.newLeadDays)) continue;
    out.push({ key: `l:${l.name}`, reason: "new_lead", dt: "CRM Lead", name: l.name, title: String(l["lead_name"] || l.name), action: "First contact", due: "", amount: null, cur: "", owner: String(l["lead_owner"] ?? ""), status: String(l["status"] ?? "") });
  }
  for (const d of scopedDeals(user).filter(isOpenDeal)) {
    const base = dealBase(d), next = hasOpenTask(d.name), close = String(d["expected_closure_date"] ?? "");
    const toClose = close ? days(t0, close) : NaN;
    const reason: Reason | null = !next && base !== null && base >= PIPE_RULES.highValueBase ? "high_no_next" : toClose >= 0 && toClose <= QUEUE_RULES.closeSoonDays ? "close_soon" : !next ? "no_next" : null;
    if (!reason) continue;
    out.push({ key: `d:${d.name}`, reason, dt: "CRM Deal", name: d.name, title: String(d["organization"] || d.name), action: reason === "close_soon" ? "Confirm close" : "Schedule next action",
      due: close, amount: dealValue(d) || null, cur: String(d["currency"] || ""), owner: String(d["deal_owner"] ?? ""), status: String(d["status"] ?? "") });
  }
  return out.sort((a, b) => REASON_RANK[a.reason] - REASON_RANK[b.reason] || (a.due || "9").localeCompare(b.due || "9") || (b.amount ?? 0) - (a.amount ?? 0));
}

export type TeamRow = { owner: string; openTasks: number; overdue: number; compliance: number | null; openDeals: Doc[]; won: number; lost: number };
/** Team performance per salesperson. Compliance = open follow-ups not overdue ÷ open follow-ups (null with none). */
export function teamPerformance(user: string, now = new Date()): TeamRow[] {
  const m = new Map<string, TeamRow>();
  const row = (o: string) => m.get(o) ?? (m.set(o, { owner: o, openTasks: 0, overdue: 0, compliance: null, openDeals: [], won: 0, lost: 0 }), m.get(o)!);
  for (const t of scopedTasks(user)) { const b = bucketOf(t, now); if (b === "closed") continue; const r = row(String(t["assigned_to"] ?? "")); r.openTasks++; if (b === "overdue") r.overdue++; }
  for (const d of scopedDeals(user)) { const r = row(String(d["deal_owner"] ?? "")); if (isOpenDeal(d)) r.openDeals.push(d); else if (dealStatusType(d["status"]) === "Won") r.won++; else r.lost++; }
  for (const r of m.values()) r.compliance = r.openTasks ? Math.round(((r.openTasks - r.overdue) / r.openTasks) * 100) : null;
  return [...m.values()].sort((a, b) => b.overdue - a.overdue || b.openDeals.length - a.openDeals.length);
}
