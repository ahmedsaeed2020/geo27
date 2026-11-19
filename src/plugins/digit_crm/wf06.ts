import { isServerHosted } from "@/lib/serverHost";
/**
 * WF-06 — Sales organization & communication on canonical records (adapter only, no ledger writes).
 * Sales Teams: Sales Person tree (parent_sales_person) with per-person open/won deal stats and targets.
 * Territories: Territory tree with deal/lead counts per node (deals matched by territory field, leads by territory or country).
 * Communication Timeline: one chronological feed merging Communication, Email Queue, CRM Task, FCRM Note and
 *   CRM Call Log rows that reference a record — read-only; replies still go through crmEmail (Wave 2).
 * CRM Dashboards: widget grid computed live from the same wf02/wf05 helpers — no stored aggregates.
 * Demo Sales Person / Territory rows are insert-if-missing with explicit names; user records are never overwritten.
 */
import { eventSubjectNow } from "@/lib/activityFeed";
import { adapter, type Doc } from "@/lib/adapter";
import { scopedGet, scopedList } from "@/lib/scope";
import { currentUser } from "@/lib/session";
import { messageText } from "@/components/crm/messageContent";
import { linkTitle } from "@/lib/linkTitle";
import { scopedLeads } from "./wf01";
import { dealStatusType, isOpenDeal, scopedDeals } from "./wf02";
import { attainment, salesPersonUser, targets } from "./wf03";
import { dealsMoney, fmtMoney, type MoneySum } from "./wf05";

const day = (v: unknown) => String(v ?? "").slice(0, 10);
const r2 = (x: number) => Math.round(x * 100) / 100;

/* ================= Demo seed (insert-if-missing, explicit names) ================= */
let seeded = false;
export function seedSalesOrg() {
  if (isServerHosted()) return undefined as never;
  if (seeded) return; seeded = true;
  const put = (dt: string, name: string, data: Record<string, unknown>) => { if (!adapter.get(dt, name)) adapter.insertDoc(dt, { name, ...data }); };
  put("Territory", "All Territories", { territory_name: "All Territories", is_group: 1, parent_territory: "" });
  put("Territory", "Saudi Arabia", { territory_name: "Saudi Arabia", is_group: 1, parent_territory: "All Territories" });
  put("Territory", "Riyadh", { territory_name: "Riyadh", is_group: 0, parent_territory: "Saudi Arabia" });
  put("Territory", "Jeddah", { territory_name: "Jeddah", is_group: 0, parent_territory: "Saudi Arabia" });
  put("Sales Person", "Sales Team", { sales_person_name: "Sales Team", is_group: 1, parent_sales_person: "", enabled: 1 });
  put("Sales Person", "Salem Sales", { sales_person_name: "Salem Sales", is_group: 0, parent_sales_person: "Sales Team", employee: "", enabled: 1 });
  put("Sales Person", "Noura Sales", { sales_person_name: "Noura Sales", is_group: 0, parent_sales_person: "Sales Team", employee: "", enabled: 1 });
}

/* ================= Sales Teams ================= */
export type PersonNode = { doc: Doc; children: PersonNode[]; stats: PersonStats };
export type PersonStats = { open: number; won: number; pipeline: MoneySum; wonSum: MoneySum; target: number; achieved: number };

/** Deals credited to a sales person: deal_owner is the person (name or linked login user), or the person is in the
 *  sales_team child table. `person` may be a name or the Sales Person record (resolves its native employee user). */
export const dealsOfPerson = (person: string | Doc, deals: Doc[]) => {
  const sp = typeof person === "string" ? undefined : person;
  const owners = new Set([typeof person === "string" ? person : String(sp?.["sales_person_name"] ?? sp?.name ?? ""), salesPersonUser(sp)].filter(Boolean));
  const members = new Set([typeof person === "string" ? person : String(sp?.name ?? ""), String(sp?.["sales_person_name"] ?? "")].filter(Boolean));
  return deals.filter((d) => owners.has(String(d["deal_owner"] ?? "")) || ((d["sales_team"] as Doc[] | undefined) ?? []).some((r) => members.has(String(r["sales_person"] ?? ""))));
};

/** Target and achieved use the current fiscal year and the shared attainment basis (submitted Sales Orders' sales team),
 *  so the Sales Teams column equals the Targets page and the dashboard target widgets. */
export function personStats(person: string | Doc, user: string, today = new Date().toISOString().slice(0, 10)): PersonStats {
  const ds = dealsOfPerson(person, scopedDeals(user));
  const open = ds.filter(isOpenDeal), won = ds.filter((d) => dealStatusType(d["status"]) === "Won");
  const code = typeof person === "string" ? person : person.name;
  const fy = adapter.list("Fiscal Year").find((f) => String(f["year_start_date"] ?? "").slice(0, 10) <= today && today <= String(f["year_end_date"] ?? "").slice(0, 10))?.name;
  const tg = targets(user).filter((t) => t.salesPerson === code && t.fiscalYear === fy);
  const target = tg.reduce((s, t) => s + t.amount, 0);
  const achieved = r2(tg.reduce((s, t) => s + (attainment(t, user).achieved ?? 0), 0));
  return { open: open.length, won: won.length, pipeline: dealsMoney(open), wonSum: dealsMoney(won), target, achieved };
}

export function salesPersonTree(user: string): PersonNode[] {
  const all = adapter.list("Sales Person").filter((p) => Number(p["enabled"] ?? 1) === 1);
  const kids = new Map<string, Doc[]>();
  for (const p of all) { const par = String(p["parent_sales_person"] ?? ""); kids.set(par, [...(kids.get(par) ?? []), p]); }
  const build = (d: Doc): PersonNode => ({ doc: d, children: (kids.get(d.name) ?? []).map(build), stats: personStats(d, user) });
  return (kids.get("") ?? []).map(build);
}

/* ================= Territories ================= */
export type TerritoryNode = { doc: Doc; children: TerritoryNode[]; stats: TerritoryStats };
export type TerritoryStats = { open: number; won: number; leads: number; pipeline: MoneySum };

export function territoryStats(territory: string, user: string): TerritoryStats {
  const ds = scopedDeals(user).filter((d) => String(d["territory"] ?? "") === territory);
  const ls = scopedLeads(user).filter((l) => String(l["territory"] ?? "") === territory);
  const open = ds.filter(isOpenDeal), won = ds.filter((d) => dealStatusType(d["status"]) === "Won");
  return { open: open.length, won: won.length, leads: ls.length, pipeline: dealsMoney(open) };
}

export function territoryTree(user: string): TerritoryNode[] {
  const all = adapter.list("Territory");
  const kids = new Map<string, Doc[]>();
  for (const t of all) { const par = String(t["parent_territory"] ?? ""); kids.set(par, [...(kids.get(par) ?? []), t]); }
  const build = (d: Doc): TerritoryNode => ({ doc: d, children: (kids.get(d.name) ?? []).map(build), stats: territoryStats(d.name, user) });
  return (kids.get("") ?? []).map(build);
}

/** Territories with no open deals and no leads — coverage gaps for managers. */
export function territoryGaps(user: string): { name: string; isGroup: boolean }[] {
  return adapter.list("Territory")
    .filter((t) => !Number(t["is_group"]))
    .map((t) => ({ name: t.name, isGroup: false, s: territoryStats(t.name, user) }))
    .filter((x) => x.s.open === 0 && x.s.leads === 0)
    .map((x) => ({ name: x.name, isGroup: x.isGroup }));
}

/* ================= Communication Timeline (WF-04) ================= */
export type TimelineKind = "email" | "call" | "meeting" | "note" | "task" | "system";
export type TimelineItem = { id: string; kind: TimelineKind; when: string; title: string; body: string; from?: string | undefined; to?: string | undefined; status?: string | undefined; dt: string; name: string };

const KIND_LABEL: Record<TimelineKind, string> = { email: "Email", call: "Call", meeting: "Meeting", note: "Note", task: "Task", system: "System" };
export const kindLabel = (k: TimelineKind) => KIND_LABEL[k];

const refs = (x: Doc, doctype: string, name: string) =>
  (x["reference_doctype"] ?? x["reference_type"]) === doctype && (x["reference_docname"] ?? x["reference_name"]) === name;

/** Unified chronological feed for one CRM record (lead or deal). Permission-filtered; read-only. */
export function timelineOf(doctype: string, name: string, user = currentUser(), includeDocuments = false): TimelineItem[] {
  const source = scopedGet(doctype, name, user); if (!source) return [];
  const items: TimelineItem[] = [];
  for (const c of scopedList("Communication", user).filter((x) => refs(x, doctype, name))) {
    const medium = String(c["communication_medium"] ?? "Email");
    items.push({
      id: `C:${c.name}`, kind: medium === "Phone" ? "call" : medium === "Meeting" ? "meeting" : "email",
      when: String(c["communication_date"] ?? c["creation"] ?? ""), title: String(c["subject"] ?? "(no subject)"),
      body: messageText(c["content"]).slice(0, 240),
      from: String(c["sender"] ?? "") || undefined, to: String(c["recipients"] ?? "") || undefined,
      status: String(c["sent_or_received"] ?? "") || undefined, dt: "Communication", name: c.name,
    });
  }
  for (const q of scopedList("Email Queue", user).filter((x) => refs(x, doctype, name)))
    items.push({ id: `Q:${q.name}`, kind: "email", when: String(q["creation"] ?? ""), title: String(q["subject"] ?? "(no subject)"), body: "", status: String(q["status"] ?? ""), dt: "Email Queue", name: q.name });
  for (const t of scopedList("CRM Task", user).filter((x) => refs(x, doctype, name)))
    items.push({ id: `T:${t.name}`, kind: "task", when: String(t["start_date"] ?? t["creation"] ?? ""), title: String(t["title"] ?? t.name), body: String(t["description"] ?? ""), status: String(t["status"] ?? ""), dt: "CRM Task", name: t.name });
  for (const n of scopedList("FCRM Note", user).filter((x) => refs(x, doctype, name)))
    items.push({ id: `N:${n.name}`, kind: "note", when: String(n["creation"] ?? ""), title: String(n["title"] ?? "Note"), body: String(n["content"] ?? ""), dt: "FCRM Note", name: n.name });
  for (const c of scopedList("CRM Call Log", user).filter((x) => refs(x, doctype, name)))
    items.push({ id: `L:${c.name}`, kind: "call", when: String(c["start_time"] ?? c["creation"] ?? ""), title: String(c["type"] ?? "Call"), body: String(c["summary"] ?? ""), from: String(c["from"] ?? "") || undefined, to: String(c["to"] ?? "") || undefined, status: String(c["status"] ?? "") || undefined, dt: "CRM Call Log", name: c.name });
  for (const e of scopedList("Event", user).filter((x) => refs(x, doctype, name) || (Array.isArray(x["event_participants"]) && (x["event_participants"] as Doc[]).some((p) => refs(p, doctype, name)))))
    items.push({ id: `E:${e.name}`, kind: "meeting", when: String(e["starts_on"] ?? e["creation"] ?? ""), title: eventSubjectNow(e), body: messageText(e["description"]), dt: "Event", name: e.name, status: String(e["status"] ?? "") });
  if (includeDocuments && source["creation"]) items.push({ id: `D:${doctype}:${name}`, kind: "system", when: String(source["creation"]), title: linkTitle(doctype, name), body: "", dt: doctype, name });
  return items.sort((a, b) => day(b.when).localeCompare(day(a.when)) || b.when.localeCompare(a.when));
}

/* ================= CRM Dashboard widgets ================= */
export type Widget = { id: string; title: string; kind: "kpi" | "bar"; value?: string; hint?: string; to?: string; bars?: { label: string; value: number; max: number }[] };

/** Live widget set for the CRM Dashboards screen — every number recomputed from current rows (never stored). */
export function dashboardWidgets(user: string): Widget[] {
  const ds = scopedDeals(user), ls = scopedLeads(user);
  const open = ds.filter(isOpenDeal), won = ds.filter((d) => dealStatusType(d["status"]) === "Won");
  const pipeline = dealsMoney(open), weighted = dealsMoney(open, true), wonSum = dealsMoney(won);
  const byStage = new Map<string, number>();
  for (const d of open) byStage.set(String(d["status"] ?? "?"), (byStage.get(String(d["status"] ?? "?")) ?? 0) + 1);
  const maxStage = Math.max(1, ...byStage.values());
  const conv = ls.length ? r2((ls.filter((l) => String(l["status"]) === "Converted").length / ls.length) * 100) : 0;
  return [
    { id: "pipeline", title: "Open Pipeline", kind: "kpi", value: fmtMoney(pipeline), hint: `${open.length} open deals`, to: "/digit-crm/pipeline" },
    { id: "weighted", title: "Weighted Pipeline", kind: "kpi", value: fmtMoney(weighted), hint: "probability-weighted", to: "/digit-crm/forecast" },
    { id: "won", title: "Won", kind: "kpi", value: fmtMoney(wonSum), hint: `${won.length} deals won`, to: "/digit-crm/reports?cat=pipeline" },
    { id: "leads", title: "Open Leads", kind: "kpi", value: String(ls.filter((l) => String(l["status"]) !== "Converted").length), hint: `${conv}% converted overall`, to: "/crm/leads" },
    { id: "stages", title: "Deals by Stage", kind: "bar", bars: [...byStage.entries()].map(([label, value]) => ({ label, value, max: maxStage })) },
  ];
}
