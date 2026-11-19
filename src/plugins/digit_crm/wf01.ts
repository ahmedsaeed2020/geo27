/**
 * DIGIT CRM — WF-01 operational lead & follow-up engine.
 * Canonical records (SOURCE_VERIFIED_EXISTING, public/catalog/crm/*.json): CRM Lead (Frappe CRM) and CRM Task
 * (reference_doctype/reference_docname Dynamic Link, assigned_to, due_date, status Backlog|Todo|In Progress|Done|Canceled).
 * No parallel store: every read/write goes through the shared adapter. CRM Lead has no company field → company scope is
 * SOURCE_VERIFIED_GAP; scope is owner/role only. One definition of overdue/today/upcoming is shared by counts and lists.
 */
import { adapter, type Doc } from "@/lib/adapter";
import { activeDemoProfile } from "./dataContext";
import { scopedList } from "@/lib/scope";
import { ADMIN, userRoles } from "@/lib/session";

export const CRM_ROLES = ["Sales User", "Sales Manager", "System Manager"];
export const MANAGER_ROLES = ["Sales Manager", "System Manager"];
export const OPEN_TASK = ["Backlog", "Todo", "In Progress"];
export const PRIORITIES = ["Low", "Medium", "High"];
const PRI: Record<string, number> = { High: 0, Medium: 1, Low: 2 };

export const canUseCrm = (user: string) => user === ADMIN || userRoles(user).some((r) => CRM_ROLES.includes(r));
export const isManager = (user: string) => user === ADMIN || userRoles(user).some((r) => MANAGER_ROLES.includes(r));

/** Frappe Datetime "YYYY-MM-DD HH:mm:ss" read as the user's local time (browser timezone; site tz is FRAPPE_SERVER_REQUIRED). */
export function parseDue(v: unknown): Date | null {
  if (typeof v !== "string" || !v) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(v);
  if (!m) return null;
  return new Date(+m[1]!, +m[2]! - 1, +m[3]!, +(m[4] ?? 23), +(m[5] ?? 59), +(m[6] ?? 0));
}
export const toDatetime = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:00`;
};

export type Bucket = "overdue" | "today" | "upcoming" | "undated" | "closed";
/** overdue = open and due < now; today = open, due ≥ now and before local midnight; upcoming = after today. */
export function bucketOf(t: Doc, now = new Date()): Bucket {
  if (!OPEN_TASK.includes(String(t["status"] ?? "Backlog"))) return "closed";
  const d = parseDue(t["due_date"]);
  if (!d) return "undated";
  if (d < now) return "overdue";
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return d < end ? "today" : "upcoming";
}

const leadStatusType = (s: unknown) => String(adapter.get("CRM Lead Status", String(s ?? ""))?.["type"] ?? "");
export const isOpenLead = (l: Doc) => !Number(l["converted"]) && leadStatusType(l["status"]) !== "Lost";

export function scopedLeads(user: string): Doc[] {
  if (!canUseCrm(user)) return [];
  const all = activeDemoProfile() ? scopedList("CRM Lead", user) : adapter.list("CRM Lead");
  return isManager(user) ? all : all.filter((l) => l["lead_owner"] === user);
}
export function scopedTasks(user: string): Doc[] {
  if (!canUseCrm(user)) return [];
  const all = (activeDemoProfile() ? scopedList("CRM Task", user) : adapter.list("CRM Task")).filter((t) => t["reference_doctype"] === "CRM Lead");
  return isManager(user) ? all : all.filter((t) => t["assigned_to"] === user);
}
/** My Work source: a manager's own tasks when they have any, else every visible task; a rep sees own tasks. */
export function myWorkTasks(user: string): Doc[] {
  const all = scopedTasks(user); const own = all.filter((t) => t["assigned_to"] === user);
  return isManager(user) && own.length ? own : all;
}
/** My Work ranking: overdue → today → upcoming → undated, then priority High→Low, then due ascending. */
export function rankQueue(tasks: Doc[], now = new Date()): Doc[] {
  const ord: Record<Bucket, number> = { overdue: 0, today: 1, upcoming: 2, undated: 3, closed: 4 };
  return tasks.filter((t) => bucketOf(t, now) !== "closed").sort((a, b) =>
    ord[bucketOf(a, now)] - ord[bucketOf(b, now)] || (PRI[String(a["priority"])] ?? 1) - (PRI[String(b["priority"])] ?? 1)
    || (parseDue(a["due_date"])?.getTime() ?? Infinity) - (parseDue(b["due_date"])?.getTime() ?? Infinity));
}
/** R-006 Unassigned Leads (open, no lead_owner). */
export const unassignedLeads = (user: string) => (isManager(user) ? scopedLeads(user).filter((l) => isOpenLead(l) && !l["lead_owner"]) : []);
export const counts = (tasks: Doc[], now = new Date()) => {
  const c = { overdue: 0, today: 0, upcoming: 0, undated: 0 };
  for (const t of tasks) { const b = bucketOf(t, now); if (b !== "closed") c[b]++; }
  return c;
};

export function crmUsers(): Doc[] {
  return adapter.list("User").filter((u) => Number(u["enabled"] ?? 1) && userRoles(u.name).some((r) => r === "Sales User" || r === "Sales Manager"));
}
export const userLabel = (u: unknown) => String(adapter.get("User", String(u ?? ""))?.["full_name"] ?? u ?? "");

type Result = { ok: true; name: string } | { ok: false; errors: Record<string, string> };
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function createLead(input: { first_name?: string; last_name?: string; organization?: string; email?: string; mobile_no?: string; source?: string; lead_owner?: string }, user: string): Result {
  if (!canUseCrm(user)) return { ok: false, errors: { _: "Not permitted" } };
  const errors: Record<string, string> = {};
  const first = (input.first_name ?? "").trim();
  if (!first) errors["first_name"] = "First Name is required";
  if (input.email && !EMAIL.test(input.email.trim())) errors["email"] = "Invalid email address";
  let owner = input.lead_owner || "";
  if (!isManager(user)) owner = user; // reps own what they create
  else if (owner && !crmUsers().some((u) => u.name === owner)) errors["lead_owner"] = "Owner must be an enabled sales user";
  if (Object.keys(errors).length) return { ok: false, errors };
  const last = (input.last_name ?? "").trim();
  const status = adapter.get("CRM Lead Status", "New") ? "New" : String(adapter.list("CRM Lead Status")[0]?.name ?? "New");
  const d = adapter.insertDoc("CRM Lead", {
    naming_series: "CRM-LEAD-.YYYY.-", first_name: first, last_name: last, lead_name: [first, last].filter(Boolean).join(" "),
    organization: input.organization?.trim() || "", email: input.email?.trim() || "", mobile_no: input.mobile_no?.trim() || "",
    source: input.source || "", status, lead_owner: owner, converted: 0,
  });
  return { ok: true, name: d.name };
}

export function assignLead(lead: string, owner: string, user: string): Result {
  if (!isManager(user)) return { ok: false, errors: { _: "Only a Sales Manager can assign leads" } };
  const l = adapter.get("CRM Lead", lead);
  if (!l) return { ok: false, errors: { _: "Lead not found" } };
  if (!crmUsers().some((u) => u.name === owner)) return { ok: false, errors: { lead_owner: "Owner must be an enabled sales user" } };
  adapter.update("CRM Lead", lead, { lead_owner: owner });
  // open tasks follow the lead owner only when unassigned — existing assignments are never overwritten silently
  for (const t of adapter.list("CRM Task")) if (t["reference_docname"] === lead && !t["assigned_to"] && OPEN_TASK.includes(String(t["status"]))) adapter.update("CRM Task", t.name, { assigned_to: owner });
  return { ok: true, name: lead };
}

export function createTask(input: { lead: string; title?: string | undefined; due?: string | undefined; priority?: string | undefined; assigned_to?: string | undefined }, user: string): Result {
  const errors: Record<string, string> = {};
  const l = scopedLeads(user).find((x) => x.name === input.lead);
  if (!l) errors["lead"] = "Select a lead you can access";
  if (!(input.title ?? "").trim()) errors["title"] = "Title is required";
  const due = input.due ? parseDue(input.due.replace("T", " ")) : null;
  if (!due) errors["due"] = "Due date and time are required";
  const assignee = isManager(user) ? (input.assigned_to || String(l?.["lead_owner"] ?? "") || user) : user;
  if (Object.keys(errors).length) return { ok: false, errors };
  const n = Math.max(0, ...adapter.list("CRM Task").map((t) => Number(/(\d+)$/.exec(t.name)?.[1] ?? 0))) + 1;
  const d = adapter.insertDoc("CRM Task", {
    name: `CRM-TASK-${String(n).padStart(5, "0")}`, title: input.title!.trim(), priority: PRIORITIES.includes(input.priority ?? "") ? input.priority : "Medium",
    status: "Todo", due_date: toDatetime(due!), assigned_to: assignee, reference_doctype: "CRM Lead", reference_docname: input.lead,
  });
  return { ok: true, name: d.name };
}

function editableTask(name: string, user: string): Doc | string {
  const t = adapter.get("CRM Task", name);
  if (!t) return "Task not found";
  if (!(isManager(user) || t["assigned_to"] === user)) return "Not permitted";
  if (!OPEN_TASK.includes(String(t["status"]))) return "Task is already closed";
  return t;
}
export function completeTask(name: string, user: string): Result {
  const t = editableTask(name, user);
  if (typeof t === "string") return { ok: false, errors: { _: t } };
  adapter.update("CRM Task", name, { status: "Done" });
  return { ok: true, name };
}
export function rescheduleTask(name: string, due: string, user: string): Result {
  const t = editableTask(name, user);
  if (typeof t === "string") return { ok: false, errors: { _: t } };
  const d = parseDue(due.replace("T", " "));
  if (!d) return { ok: false, errors: { due: "Due date and time are required" } };
  adapter.update("CRM Task", name, { due_date: toDatetime(d) });
  return { ok: true, name };
}
export function reassignTask(name: string, owner: string, user: string): Result {
  if (!isManager(user)) return { ok: false, errors: { _: "Only a Sales Manager can reassign" } };
  const t = editableTask(name, user);
  if (typeof t === "string") return { ok: false, errors: { _: t } };
  if (!crmUsers().some((u) => u.name === owner)) return { ok: false, errors: { assigned_to: "Owner must be an enabled sales user" } };
  adapter.update("CRM Task", name, { assigned_to: owner });
  return { ok: true, name };
}

/** Owner filter choices: managers see every CRM user, salespeople only themselves (same scope as list data). */
export const ownerChoices = (user: string): Doc[] => isManager(user) ? crmUsers() : crmUsers().filter((u) => u.name === user);
