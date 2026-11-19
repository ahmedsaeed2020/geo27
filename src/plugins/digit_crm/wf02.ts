/**
 * DIGIT CRM — Wave 2 read selectors + ERP handoff on canonical records only.
 * Sources (SOURCE_VERIFIED_EXISTING): CRM Deal / CRM Deal Status (type Open|Ongoing|On Hold|Won|Lost, probability),
 * CRM Organization, Contact, CRM Task, FCRM Note, CRM Call Log (Frappe CRM); Customer, Quotation (ERPNext).
 * Handoff link field `crm_deal` on Customer/Quotation mirrors Frappe CRM's erpnext integration custom field (PROPOSED,
 * see docs/digit-app-builder/FRAPPE_EXPORT_GAPS.md). No GL/stock writes; quotations are created as Draft only.
 */
import { adapter, type Doc } from "@/lib/adapter";
import { activeDemoProfile } from "./dataContext";
import { scopedGet, scopedList } from "@/lib/scope";
import { SYN_COMPANY } from "@/lib/seed";
import { canUseCrm, isManager, scopedLeads, scopedTasks, bucketOf, isOpenLead, parseDue } from "./wf01";

export const dealStatusType = (s: unknown) => String(adapter.get("CRM Deal Status", String(s ?? ""))?.["type"] ?? "Open");
export const dealStages = () => adapter.list("CRM Deal Status").sort((a, b) => Number(a["position"] ?? 0) - Number(b["position"] ?? 0));
export const isOpenDeal = (d: Doc) => !["Won", "Lost"].includes(dealStatusType(d["status"]));
export const dealValue = (d: Doc) => Number([d["deal_value"], d["expected_deal_value"], d["net_total"]].find(v => v !== null && v !== undefined && v !== "") ?? 0);
/** Probability: deal's own value, else the stage default (CRM Deal Status.probability). */
export const dealProb = (d: Doc) => { const own = d["probability"]; return Number(own !== null && own !== undefined && own !== "" ? own : adapter.get("CRM Deal Status", String(d["status"] ?? ""))?.["probability"] ?? 0) || 0; };

export function scopedDeals(user: string): Doc[] {
  if (!canUseCrm(user)) return [];
  const all = activeDemoProfile() ? scopedList("CRM Deal", user) : adapter.list("CRM Deal");
  return isManager(user) ? all : all.filter((d) => d["deal_owner"] === user);
}
/** All CRM tasks (lead + deal references) visible to the user. */
export function scopedAllTasks(user: string): Doc[] {
  if (!canUseCrm(user)) return [];
  const all = activeDemoProfile() ? scopedList("CRM Task", user) : adapter.list("CRM Task");
  return isManager(user) ? all : all.filter((t) => t["assigned_to"] === user);
}

export type StageRow = { stage: string; type: string; color: string; count: number; value: number; weighted: number };
export function pipeline(user: string): StageRow[] {
  const deals = scopedDeals(user);
  return dealStages().map((s) => {
    const ds = deals.filter((d) => d["status"] === s.name);
    return { stage: s.name, type: String(s["type"] ?? ""), color: String(s["color"] ?? "gray"), count: ds.length,
      value: ds.reduce((a, d) => a + dealValue(d), 0), weighted: ds.reduce((a, d) => a + dealValue(d) * dealProb(d) / 100, 0) };
  });
}

export function homeKpis(user: string, now = new Date()) {
  const leads = scopedLeads(user), deals = scopedDeals(user), tasks = scopedAllTasks(user);
  const open = deals.filter(isOpenDeal);
  const won = deals.filter((d) => dealStatusType(d["status"]) === "Won"), lost = deals.filter((d) => dealStatusType(d["status"]) === "Lost");
  return {
    openLeads: leads.filter(isOpenLead).length,
    openDeals: open.length,
    pipelineValue: open.reduce((a, d) => a + dealValue(d), 0),
    weighted: open.reduce((a, d) => a + dealValue(d) * dealProb(d) / 100, 0),
    won: won.length, lost: lost.length,
    winRate: won.length + lost.length ? Math.round((won.length / (won.length + lost.length)) * 100) : null,
    overdueTasks: tasks.filter((t) => bucketOf(t, now) === "overdue").length,
    dueToday: tasks.filter((t) => bucketOf(t, now) === "today").length,
    convertedLeads: leads.filter((l) => Number(l["converted"])).length,
    totalLeads: leads.length,
  };
}

/** Forecast: open deals grouped by expected_closure_date month; undated deals are listed separately, never guessed. */
export function forecast(user: string) {
  const rows = new Map<string, { month: string; count: number; value: number; weighted: number }>();
  const undated: Doc[] = [];
  for (const d of scopedDeals(user).filter(isOpenDeal)) {
    const m = String(d["expected_closure_date"] ?? "").slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(m)) { undated.push(d); continue; }
    const r = rows.get(m) ?? { month: m, count: 0, value: 0, weighted: 0 };
    r.count++; r.value += dealValue(d); r.weighted += dealValue(d) * dealProb(d) / 100; rows.set(m, r);
  }
  return { months: [...rows.values()].sort((a, b) => a.month.localeCompare(b.month)), undated };
}

export function groupCount(docs: Doc[], key: string, empty = "Not set") {
  const m = new Map<string, number>();
  for (const d of docs) { const k = String(d[key] || "") || empty; m.set(k, (m.get(k) ?? 0) + 1); }
  return [...m.entries()].map(([k, n]) => ({ key: k, count: n })).sort((a, b) => b.count - a.count);
}

/** Source conversion: leads per source vs converted (CRM Lead.converted). */
export function sourceConversion(user: string) {
  const m = new Map<string, { source: string; leads: number; converted: number }>();
  for (const l of scopedLeads(user)) {
    const k = String(l["source"] || "") || "Not set";
    const r = m.get(k) ?? { source: k, leads: 0, converted: 0 }; r.leads++; if (Number(l["converted"])) r.converted++; m.set(k, r);
  }
  return [...m.values()].sort((a, b) => b.leads - a.leads);
}

export type Activity = { kind: "Task" | "Note" | "Call"; name: string; title: string; when: string; refDt: string; refName: string; status?: string; owner?: string };
/** Visible activities per user, rebuilt only after a record write (adapter.version), so boards and drills that ask
 *  repeatedly read one consistent list. Callers always receive a new array. */
const activityMemo = new Map<string, { version: number; rows: Activity[] }>();
export function activities(user: string, filter?: { refDt?: string; refNames?: string[] }): Activity[] {
  if (!canUseCrm(user)) return [];
  const version = adapter.version(); let hit = activityMemo.get(user);
  if (!hit || hit.version !== version) { hit = { version, rows: buildActivities(user) }; activityMemo.set(user, hit); }
  const f = filter?.refNames ? new Set(filter.refNames) : null;
  return hit.rows.filter((a) => !f || f.has(a.refName));
}
function buildActivities(user: string): Activity[] {
  const leadNames = new Set(scopedLeads(user).map((l) => l.name)), dealNames = new Set(scopedDeals(user).map((d) => d.name));
  const visible = (dt: unknown, n: unknown) => (dt === "CRM Lead" ? leadNames.has(String(n)) : dt === "CRM Deal" ? dealNames.has(String(n)) : isManager(user));
  const out: Activity[] = [];
  for (const t of adapter.list("CRM Task")) if (visible(t["reference_doctype"], t["reference_docname"]) || t["assigned_to"] === user)
    out.push({ kind: "Task", name: t.name, title: String(t["title"] ?? t.name), when: String(t["due_date"] ?? t["modified"] ?? ""), refDt: String(t["reference_doctype"] ?? ""), refName: String(t["reference_docname"] ?? ""), status: String(t["status"] ?? ""), owner: String(t["assigned_to"] ?? "") });
  for (const n of adapter.list("FCRM Note")) if (visible(n["reference_doctype"], n["reference_docname"]))
    out.push({ kind: "Note", name: n.name, title: String(n["title"] ?? n.name), when: String(n["modified"] ?? n["creation"] ?? ""), refDt: String(n["reference_doctype"] ?? ""), refName: String(n["reference_docname"] ?? "") });
  for (const c of adapter.list("CRM Call Log")) if (visible(c["reference_doctype"], c["reference_docname"]))
    out.push({ kind: "Call", name: c.name, title: `${c["type"] ?? "Call"} · ${c["from"] ?? ""} → ${c["to"] ?? ""}`, when: String(c["start_time"] ?? c["creation"] ?? ""), refDt: String(c["reference_doctype"] ?? ""), refName: String(c["reference_docname"] ?? ""), status: String(c["status"] ?? "") });
  const at = new Map(out.map((a) => [a, parseDue(a.when)?.getTime() ?? 0]));
  return out.sort((a, b) => (at.get(b) ?? 0) - (at.get(a) ?? 0));
}

/** Customer 360 for a CRM Organization: deals, leads (by organization name), contacts, activities, ERP Customer/Quotations. */
export function customer360(org: string, user: string) {
  const o = scopedGet("CRM Organization", org, user) ?? scopedList("CRM Organization", user).find((x) => x["organization_name"] === org);
  if (!o || !canUseCrm(user)) return null;
  const aliases = new Set([o.name, String(o["organization_name"] ?? ""), org].filter(Boolean).map((s) => s.trim().toLowerCase()));
  const matchesOrg = (v: unknown) => aliases.has(String(v ?? "").trim().toLowerCase());
  const readableDeals = new Set(scopedList("CRM Deal", user).map((d) => d.name));
  const readableLeads = new Set(scopedList("CRM Lead", user).map((d) => d.name));
  const deals = scopedDeals(user).filter((d) => readableDeals.has(d.name) && matchesOrg(d["organization"]));
  const leads = scopedLeads(user).filter((l) => readableLeads.has(l.name) && matchesOrg(l["organization"]));
  const contacts = scopedList("Contact", user).filter((c) => matchesOrg(c["company_name"]) || deals.some((d) => d["contact"] === c.name));
  // the company's canonical Customer (CRM Organization.customer), the Customer created from one of its won deals, or the same name
  const customers = scopedList("Customer", user).filter((c) => c.name === o["customer"] || deals.some((d) => c["crm_deal"] === d.name) || matchesOrg(c["customer_name"]));
  const custNames = new Set(customers.map((c) => c.name));
  const quotations = scopedList("Quotation", user).filter((q) => deals.some((d) => q["crm_deal"] === d.name) || custNames.has(String(q["party_name"])));
  const orders = scopedList("Sales Order", user).filter((s) => custNames.has(String(s["customer"])));
  const invoices = scopedList("Sales Invoice", user).filter((s) => custNames.has(String(s["customer"])) && Number(s["docstatus"]) === 1);
  const outstanding = invoices.reduce((a, s) => a + Number(s["outstanding_amount"] ?? 0), 0);
  const acts = activities(user, { refNames: [...deals.map((d) => d.name), ...leads.map((l) => l.name)] });
  return { org: o, deals, leads, contacts, customers, quotations, orders, invoices, outstanding, activities: acts,
    openValue: deals.filter(isOpenDeal).reduce((a, d) => a + dealValue(d), 0) };
}

type Result = { ok: true; name: string } | { ok: false; error: string };
const canEditDeal = (deal: Doc, user: string) => isManager(user) || deal["deal_owner"] === user;

/** Valid stage move: Lost requires lost_reason (source: CRM Deal validate + LostReasonModal). */
export function moveDeal(name: string, status: string, user: string, lost?: { reason: string; notes?: string }): Result {
  const d = adapter.get("CRM Deal", name);
  if (!d || !canEditDeal(d, user)) return { ok: false, error: "Not permitted" };
  const st = adapter.get("CRM Deal Status", status);
  if (!st) return { ok: false, error: "Unknown stage" };
  const patch: Record<string, unknown> = { status };
  if (st["type"] === "Lost") {
    if (!lost?.reason) return { ok: false, error: "Lost reason is required" };
    patch["lost_reason"] = lost.reason; if (lost.notes) patch["lost_notes"] = lost.notes;
  }
  if (st["type"] === "Won" || st["type"] === "Lost") patch["closed_date"] = new Date().toISOString().slice(0, 10);
  if (st["probability"] != null) patch["probability"] = Number(st["probability"]);
  adapter.update("CRM Deal", name, patch);
  return { ok: true, name };
}

export const customerForDeal = (deal: string) => adapter.list("Customer").find((c) => c["crm_deal"] === deal) ?? null;
export const quotationsForDeal = (deal: string) => adapter.list("Quotation").filter((q) => q["crm_deal"] === deal);

/** Frappe CRM erpnext_crm_settings.create_customer: Won deal → ERPNext Customer (idempotent, reuses same-name customer). */
export function createCustomerFromDeal(name: string, user: string): Result {
  const d = adapter.get("CRM Deal", name);
  if (!d || !canEditDeal(d, user)) return { ok: false, error: "Not permitted" };
  if (dealStatusType(d["status"]) !== "Won") return { ok: false, error: "Only Won deals can be handed off to a Customer" };
  const existing = customerForDeal(name);
  if (existing) return { ok: true, name: existing.name };
  const org = String(d["organization"] || d["organization_name"] || d["lead_name"] || "").trim();
  if (!org) return { ok: false, error: "Deal has no organization" };
  const same = adapter.list("Customer").find((c) => String(c["customer_name"]).toLowerCase() === org.toLowerCase());
  if (same) { adapter.update("Customer", same.name, { crm_deal: name }); return { ok: true, name: same.name }; }
  const c = adapter.insertDoc("Customer", { customer_name: org, customer_type: "Company", customer_group: adapter.get("Customer Group", "Commercial") ? "Commercial" : "",
    territory: String(d["territory"] || "") || (adapter.get("Territory", "Saudi Arabia") ? "Saudi Arabia" : ""), default_currency: String(d["currency"] || "SAR"), crm_deal: name, website: d["website"] ?? "" });
  return { ok: true, name: c.name };
}

/** Deal → Draft ERPNext Quotation: implemented in wf03 (item lines, price list, Prospect/Customer party, idempotent per deal). */
export { createQuotation as createQuotationFromDeal } from "./wf03";
