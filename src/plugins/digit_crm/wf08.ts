/**
 * WF-08 — Register intelligence (Leads & Deals registers). Pure, live computations on canonical rows.
 * Three separate lead dimensions: lifecycle status (stored, unchanged), quality (explainable score, wf05)
 * and action urgency (from open CRM Tasks). SLA_HOURS is a working default, not approved policy.
 */
import { adapter, type Doc } from "@/lib/adapter";
import { bucketOf, isOpenLead, OPEN_TASK } from "./wf01";
import { dealProb, dealValue, isOpenDeal } from "./wf02";
import { dealFlags, duplicatesOf, leadLastActivity, scoreLead } from "./wf05";
import { firstContactHours } from "./wf07";

export const REGISTER_RULES = { slaHours: 24 } as const;
export type Urgency = "overdue" | "today" | "scheduled" | "none" | "clear";

let taskVersion = -1;
const tasksByReference = new Map<string, Doc[]>();
const openTasks = (name: string) => {
  if (taskVersion !== adapter.version()) {
    tasksByReference.clear();
    for (const task of adapter.list("CRM Task")) if (OPEN_TASK.includes(String(task["status"] ?? "Backlog"))) {
      const key = String(task["reference_docname"]), rows = tasksByReference.get(key) ?? []; rows.push(task); tasksByReference.set(key, rows);
    }
    taskVersion = adapter.version();
  }
  return tasksByReference.get(name) ?? [];
};
const byDue = (a: Doc, b: Doc) => String(a["due_date"] ?? "9").localeCompare(String(b["due_date"] ?? "9"));

export function nextTask(name: string): Doc | undefined { return openTasks(name).sort(byDue)[0]; }

/** Urgency of a record's open follow-ups. Closed leads/deals have no urgency ("clear"). */
export function urgencyOf(name: string, open: boolean, now = new Date()): Urgency {
  if (!open) return "clear";
  const ts = openTasks(name);
  if (!ts.length) return "none";
  const b = ts.map((t) => bucketOf(t, now));
  return b.includes("overdue") ? "overdue" : b.includes("today") ? "today" : "scheduled";
}

export type Sla = { state: "met" | "pending" | "breached" | "na"; hours: number | null; missingContact?: boolean };
/** First-response SLA: met when first contact ≤ slaHours; breached when later or still uncontacted past slaHours. */
export function slaOf(l: Doc, now = Date.now()): Sla {
  const h = firstContactHours(l);
  if (h !== null) return { state: h <= REGISTER_RULES.slaHours ? "met" : "breached", hours: h };
  const c = Date.parse(String(l["creation"] ?? ""));
  if (!Number.isFinite(c)) return { state: "na", hours: null };
  if (!isOpenLead(l)) return { state: "na", hours: null };
  const age = Math.round(((now - c) / 36e5) * 10) / 10;
  return { state: age > REGISTER_RULES.slaHours ? "breached" : "pending", hours: Math.max(0, age - REGISTER_RULES.slaHours), missingContact: true };
}

export function leadRow(l: Doc, now = new Date()) {
  const s = scoreLead(l, now.getTime());
  return { score: s.score, band: s.band, factors: s.factors, urgency: urgencyOf(l.name, isOpenLead(l), now), next: nextTask(l.name), last: leadLastActivity(l.name), sla: slaOf(l, now.getTime()) };
}

export const LEAD_HIGHLIGHTS = ["new", "unassigned", "qualified", "sla", "nofollow", "dupes"] as const;
export function leadMatches(id: string, l: Doc, now = new Date()): boolean {
  switch (id) {
    case "new": return l["status"] === "New";
    case "unassigned": return isOpenLead(l) && !l["lead_owner"];
    case "qualified": return l["status"] === "Qualified";
    case "sla": return isOpenLead(l) && firstContactHours(l) === null && slaOf(l, now.getTime()).state === "breached";
    case "nofollow": return urgencyOf(l.name, isOpenLead(l), now) === "none";
    case "dupes": return duplicatesOf({ name: l.name, email: l["email"], mobile_no: l["mobile_no"], phone: l["phone"] }).some((m) => m.dt === "CRM Lead");
    default: return true;
  }
}

export const DEAL_HIGHLIGHTS = ["stale", "nonext", "overdueclose", "highnofollow"] as const;
export function dealMatches(id: string, d: Doc, now = Date.now()): boolean {
  if (!isOpenDeal(d)) return false;
  const f = dealFlags(d, now);
  return id === "stale" ? f.stale : id === "nonext" ? f.noNext : id === "overdueclose" ? f.overdueClose : id === "highnofollow" ? f.highNoFollow : true;
}
/** Weighted value in the deal's own currency (value × probability); null without a value. */
export const weightedOf = (d: Doc) => ([d["deal_value"], d["expected_deal_value"], d["net_total"]].some(v => v !== null && v !== undefined && v !== "") ? Math.round(dealValue(d) * dealProb(d)) / 100 : null);
export const dealAgeDays = (d: Doc, now = Date.now()) => { const c = Date.parse(String(d["creation"] ?? "")); return Number.isFinite(c) ? Math.floor((now - c) / 864e5) : null; };
