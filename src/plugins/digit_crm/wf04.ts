/**
 * WF-04 — topic-scoped CRM reports (Reports Center) and Customer 360 receivables.
 * Pure functions over scoped canonical records (scopedDeals / scopedLeads / activities), so every number is
 * reproducible from source rows and each report row drills to the exact records behind it (`drill` key).
 * Definitions (see docs/digit-app-builder/REPORT_REGISTRY.md):
 *  - Lead conversion % = converted CRM Leads / all CRM Leads in scope (CRM Lead.converted = 1).
 *  - Win rate %        = Won deals / (Won + Lost) closed deals — open deals are excluded (never mixed with conversion).
 * Date basis: document `creation` (deals/leads), task `due_date`; filter window is inclusive [from, to].
 */
import { eventSubjectNow } from "@/lib/activityFeed";
import { type Doc } from "@/lib/adapter";
import { scopedList } from "@/lib/scope";
import { currentUser } from "@/lib/session";
import { filterReportRows } from "@/lib/session";
import { bucketOf, isManager, isOpenLead, parseDue, scopedLeads, userLabel } from "./wf01";
import { accountHealth, dealsMoney, duplicateLeads, fmtMoney, forecastView, leadLastActivity, PIPE_RULES, qualification, receivablesSafe, scoreLead, dealFlags } from "./wf05";
import { stageAgeDays, stageHistory, stageMoves } from "./wf03";
import { activities, customer360, dealStatusType, isOpenDeal, scopedAllTasks, scopedDeals, type Activity } from "./wf02";
import { firstContactHours, firstContactStats, promiseWithoutFollowUp } from "./wf07";
import { demoEnabled, demoForecast, demoRows, demoWhatsApp } from "./demoAnalytics";
import { DEMO_TYPES } from "./demoSchema";
import { linkTitle } from "@/lib/linkTitle";

export type Topic = "pipeline" | "leads" | "activity" | "customers";
export const TOPICS: { id: Topic; label: string; hint: string }[] = [
  { id: "pipeline", label: "Sales Pipeline & Opportunity Performance", hint: "Stages, weighted value, win rate and lost reasons" },
  { id: "leads", label: "Leads, Sources & Conversion", hint: "Lead volume, conversion by source and status" },
  { id: "activity", label: "Salesperson Activities & Follow-up", hint: "Tasks, overdue follow-ups, notes and calls per owner" },
  { id: "customers", label: "Customer & Commercial Performance", hint: "Accounts, quotations, billed and unpaid value" },
];
export const isTopic = (v: unknown): v is Topic => TOPICS.some((t) => t.id === v);
/** Time-to-first-contact bands (R-005 hours, contacted open leads only; never-contacted leads stay a separate set). */
export const FC_BANDS = [
  { id: "h1", label: "Within 1 hour", max: 1 }, { id: "h4", label: "1–4 hours", max: 4 }, { id: "h24", label: "4–24 hours", max: 24 },
  { id: "d3", label: "1–3 days", max: 72 }, { id: "d3p", label: "Over 3 days", max: Number.POSITIVE_INFINITY },
] as const;
export type FcBand = (typeof FC_BANDS)[number]["id"];
export const fcBandOf = (hours: number): FcBand => (FC_BANDS.find((b) => hours <= b.max) ?? FC_BANDS[FC_BANDS.length - 1]!).id;
export type RFilter = { from?: string | undefined; to?: string | undefined; owner?: string | undefined };

const day = (v: unknown) => String(v ?? "").slice(0, 10);
const inWin = (v: unknown, f: RFilter) => { const d = day(v); return (!f.from || (d && d >= f.from)) && (!f.to || (d && d <= f.to)); };
const NOT_SET = "Not set";
/** Tables whose row labels are record values (people, accounts, lead sources): shown as stored, never translated.
 *  Fixed labels the report itself emits (Not set / Unassigned) are UI text and always translated. Mirrored by
 *  frappe_apps/digit_crm report_rules.RECORD_LABEL_TABLES / FIXED_LABELS. */
export const RECORD_LABEL_TABLES: ReadonlySet<string> = new Set(["owner", "followup", "compliance", "accounts", "source"]);
export const FIXED_LABELS: ReadonlySet<string> = new Set([NOT_SET, "Unassigned"]);
export const recordLabel = (table: string, label: string) => RECORD_LABEL_TABLES.has(table) && !FIXED_LABELS.has(label);

export function dealsIn(user: string, f: RFilter) { return scopedDeals(user).filter((d) => inWin(d["creation"], f) && (!f.owner || d["deal_owner"] === f.owner)); }
export function leadsIn(user: string, f: RFilter) { return scopedLeads(user).filter((l) => inWin(l["creation"], f) && (!f.owner || l["lead_owner"] === f.owner)); }

export type Row = { key: string; label: string; drill: string; cells: (number | string | null)[] };
export type Table = { id: string; rid?: string; title: string; note?: string; cols: string[]; rows: Row[]; total?: (number | string | null)[] };

/** win rate on closed deals only; null when nothing closed (shown as "—", never 0%). */
export function winRate(deals: Doc[]): number | null {
  const won = deals.filter((d) => dealStatusType(d["status"]) === "Won").length, lost = deals.filter((d) => dealStatusType(d["status"]) === "Lost").length;
  return won + lost ? Math.round((won / (won + lost)) * 100) : null;
}
export function leadConversion(leads: Doc[]): number | null { return leads.length ? Math.round((leads.filter((l) => Number(l["converted"])).length / leads.length) * 100) : null; }

function group<T>(xs: T[], key: (x: T) => string) { const m = new Map<string, T[]>(); for (const x of xs) { const k = key(x) || NOT_SET; const a = m.get(k); if (a) a.push(x); else m.set(k, [x]); } return m; }

export function topicTables(topic: Topic, user: string, f: RFilter): Table[] {
  const deals = dealsIn(user, f), leads = leadsIn(user, f);
  if (topic === "pipeline") {
    const stages = scopedList("CRM Deal Status", user).sort((a, b) => Number(a["position"] ?? 0) - Number(b["position"] ?? 0));
    const byStage: Row[] = stages.map((s) => { const ds = deals.filter((d) => d["status"] === s.name); return { key: s.name, label: s.name, drill: `stage:${s.name}`, cells: [ds.length, fmtMoney(dealsMoney(ds)), fmtMoney(dealsMoney(ds, true))] }; });
    const lost = group(deals.filter((d) => dealStatusType(d["status"]) === "Lost"), (d) => String(d["lost_reason"] ?? ""));
    const owners = group(deals, (d) => String(d["deal_owner"] ?? ""));
    return [
      { id: "stage", rid: "R-P1", title: "Pipeline by stage", cols: ["Stage", "Count", "Value", "Weighted"], rows: byStage, total: [deals.length, fmtMoney(dealsMoney(deals)), fmtMoney(dealsMoney(deals, true))] },
      { id: "owner", rid: "R-P2", title: "Win rate by owner", cols: ["Owner", "Open", "Won", "Lost", "Win Rate"], rows: [...owners].map(([k, ds]) => ({ key: k, label: k === NOT_SET ? k : userLabel(k), drill: `owner:${k}`, cells: [ds.filter(isOpenDeal).length, ds.filter((d) => dealStatusType(d["status"]) === "Won").length, ds.filter((d) => dealStatusType(d["status"]) === "Lost").length, pct(winRate(ds))] })), total: [deals.filter(isOpenDeal).length, deals.filter((d) => dealStatusType(d["status"]) === "Won").length, deals.filter((d) => dealStatusType(d["status"]) === "Lost").length, pct(winRate(deals))] },
      ...pipelineExtra(deals),
      territoryTable(deals),
      { id: "lost", rid: "R-P3", title: "Lost reasons", cols: ["Reason", "Count", "Value"], rows: [...lost].map(([k, ds]) => ({ key: k, label: k, drill: `lost:${k}`, cells: [ds.length, fmtMoney(dealsMoney(ds))] })) },
    ];
  }
  if (topic === "leads") {
    const src = group(leads, (l) => String(l["source"] ?? "")), st = group(leads, (l) => String(l["status"] ?? ""));
    const dealsBySrc = group(deals, (d) => String(d["source"] ?? ""));
    return [
      { id: "source", rid: "R-L1", title: "Lead source conversion", cols: ["Source", "Leads", "Converted", "Lead Conversion", "Deals", "Win Rate"], rows: [...src].map(([k, ls]) => ({ key: k, label: k, drill: `source:${k}`, cells: [ls.length, ls.filter((l) => Number(l["converted"])).length, pct(leadConversion(ls)), (dealsBySrc.get(k) ?? []).length, pct(winRate(dealsBySrc.get(k) ?? []))] })), total: [leads.length, leads.filter((l) => Number(l["converted"])).length, pct(leadConversion(leads)), deals.length, pct(winRate(deals))] },
      ...leadExtra(user, leads),
      { id: "status", rid: "R-L2", title: "Leads by status", cols: ["Status", "Leads"], rows: [...st].map(([k, ls]) => ({ key: k, label: k, drill: `lstatus:${k}`, cells: [ls.length] })), total: [leads.length] },
      campaignTable(user, leads, deals),
    ];
  }
  if (topic === "activity") {
    const acts = activities(user).filter((a) => inWin(a.when, f) && (!f.owner || a.owner === f.owner || a.kind !== "Task"));
    const tasks = acts.filter((a) => a.kind === "Task");
    const byOwner = group(tasks, (a) => a.owner ?? "");
    const isOver = (a: Activity) => bucketOf({ name: a.name, status: a.status, due_date: a.when } as never) === "overdue";
    const kinds = group(acts, (a) => a.kind);
    return [
      { id: "followup", rid: "R-A1", title: "Follow-up by salesperson", cols: ["Owner", "Open", "Overdue", "Done"], rows: [...byOwner].map(([k, ts]) => ({ key: k, label: k === NOT_SET ? "Unassigned" : userLabel(k), drill: `towner:${k}`, cells: [ts.filter((t) => !["Done", "Canceled"].includes(String(t.status))).length, ts.filter(isOver).length, ts.filter((t) => t.status === "Done").length] })), total: [tasks.filter((t) => !["Done", "Canceled"].includes(String(t.status))).length, tasks.filter(isOver).length, tasks.filter((t) => t.status === "Done").length] },
      compliance(tasks, isOver),
      { id: "kind", rid: "R-A2", title: "Activities by type", cols: ["Type", "Count"], rows: [...kinds].map(([k, xs]) => ({ key: k, label: k, drill: `kind:${k}`, cells: [xs.length] })), total: [acts.length] },
      ...channelTables(user),
    ];
  }
  const orgs = group(deals, (d) => String(d["organization"] ?? ""));
  const rows: Row[] = [...orgs].filter(([k]) => k !== NOT_SET).map(([k]) => { const c = customer360(k, user); const r = c && c.customers.length ? receivablesSafe(c.invoices) : null; return { key: k, label: linkTitle("CRM Organization", k), drill: `org:${k}`, cells: [c?.deals.filter(isOpenDeal).length ?? 0, c ? fmtMoney(dealsMoney(c.deals.filter(isOpenDeal))) : null, c?.quotations.length ?? 0, r && r.count ? fmtMoney(r.billed) : null, r && r.count ? fmtMoney(r.unpaid) : null] }; });
  return [handoffTable(user, f), healthTable(user), { id: "accounts", rid: "R-C1", note: "Billed/Unpaid per invoice currency, converted to base only with a verified rate; drafts, cancelled excluded; returns not counted as billed.", title: "Accounts — pipeline and billing", cols: ["Company", "Open Deals", "Open Value", "Quotations", "Billed", "Unpaid"], rows }];
}

/** Human label for every drill key prefix handled by drillRecords; keep in sync with its switch. */
export const DRILL_LABELS: Record<string, string> = {
  stage: "Deal stage", owner: "Deal owner", lost: "Lost reason", source: "Lead source", lstatus: "Lead status",
  towner: "Task owner", kind: "Activity type", org: "Deal organization", age: "Open deals in stage",
  hvnf: "High value without follow-up", staledeal: "Stale deals", unassigned: "Unassigned open leads", stalelead: "Stale leads",
  dup: "Possible duplicate leads", score: "Lead score band", qual: "Leads with qualification blockers", comp: "Overdue tasks by owner",
  firstcontact: "Open leads never contacted", fcall: "All open leads", promise: "Promised follow-up not scheduled",
  day: "Leads created on", week: "Leads created in the week ending", actday: "Activities on", terr: "Open deals by territory",
  camp: "Leads by campaign", funnel: "Funnel step", fcat: "Forecast category", frep: "Forecast by salesperson", health: "Account health",
  won: "Won deals", open: "All open deals", closed: "Closed deals", closemon: "Expected to close in", reached: "Deals that reached stage",
  move: "Deals that changed stage in the last 30 days", heat: "Stage and age bucket", newcust: "New customers (30 days)", neworgs: "New organizations (30 days)",
  overduear: "Overdue receivables", repeatcust: "Repeat customers", neglected: "Neglected leads and deals", chan: "Communication channel",
  calls: "All call logs", taskrate: "Tasks (excluding canceled)", taskoverdue: "Overdue follow-up tasks", ownerwon: "Won deals by owner", openowner: "Open deals by owner", emailrecv: "Records that received an email",
  "demo-forecast": "Closed forecast snapshots (simulated)", "demo-adjustment": "Forecast adjustments (simulated)",
  "demo-commission": "Held, rejected or reversed commissions (illustrative)", "demo-approval": "Commissions pending approval (illustrative)",
  "demo-wa-day": "WhatsApp messages on (simulated)", "demo-wa-open": "Open WhatsApp conversations (simulated)",
  "demo-wa-unassigned": "Unassigned WhatsApp conversations (simulated)", "demo-wa": "WhatsApp messages (simulated)",
  "demo-callback": "Pending callbacks (simulated)",
  contacts: "Contacts", orgsopen: "Accounts with open deals", callstatus: "Call logs by outcome", meetings: "Meetings",
  ownerstage: "Open deals by owner and stage", ownerlost: "Lost deals by owner", fcband: "Open leads by time to first contact",
  quotes: "Deal quotations by status", q2o: "Submitted deal quotations", dealorders: "Sales orders from deal quotations",
  dealinvoices: "Sales invoices from deal orders", tgtmonth: "Attributed sales orders in month", camppipe: "Open deals by lead campaign",
};
/** Values of multi-meaning drill keys, shown in the drill filter line (translated like any UI label). */
export const DRILL_VALUES: Record<string, Record<string, string>> = {
  contacts: { new: "Created in the last 30 days", linked: "Linked to an account", unlinked: "Not linked to an account", active: "Communication in the last 30 days", quiet: "No communication in the last 30 days" },
  meetings: { upcoming: "Upcoming", missed: "Missed" },
  q2o: { ordered: "Ordered", awaiting: "Awaiting order" },
  fcband: Object.fromEntries(FC_BANDS.map((b) => [b.id, b.label])),
};

/** Readable form of a drill key: known prefix → label; value keeps record content (stage names, dates) untranslated. */
export function drillLabel(key: string): { label: string; value: string; translatable?: boolean } {
  const [k = "", ...rest] = key.split(":"); const raw = rest.join(":");
  const people = k === "owner" || k === "towner" || k === "frep" || k === "ownerwon" || k === "openowner" || k === "ownerlost" || k === "comp";
  if (k === "ownerstage") { const [o = "", st = ""] = raw.split("|"); return { label: DRILL_LABELS[k] ?? "", value: `${o === NOT_SET ? o : userLabel(o) || o} · ${st}` }; }
  const value = raw === "*" ? "" : DRILL_VALUES[k]?.[raw] ?? (people && raw !== NOT_SET ? userLabel(raw) || raw : raw.split("|").join(" · "));
  const label = DRILL_LABELS[k];
  if (!label) return { label: "Selected filter", value: key };
  return DRILL_VALUES[k]?.[raw] ? { label, value, translatable: true } : { label, value };
}

/** Email responsiveness per referenced record: a record "received" an email when it has an inbound Email
 *  Communication, and is "replied" when it also has an outbound Email. Other channels never count. */
export function emailReplyStats(com: Doc[]) {
  const key = (c: Doc) => `${String(c["reference_doctype"] ?? "")}\u0000${String(c["reference_name"] ?? "")}`;
  const email = com.filter((c) => c["communication_medium"] === "Email" && c["reference_name"]);
  const sent = new Set(email.filter((c) => c["sent_or_received"] === "Sent").map(key));
  const received = new Map<string, Doc>();
  for (const c of email) if (c["sent_or_received"] === "Received") { const k = key(c), prev = received.get(k); if (!prev || String(c["communication_date"] ?? "") > String(prev["communication_date"] ?? "")) received.set(k, c); }
  const rows = [...received.entries()].map(([k, c]) => ({ dt: String(c["reference_doctype"] ?? ""), name: String(c["reference_name"] ?? ""), subject: String(c["subject"] ?? ""), replied: sent.has(k) }));
  return { received: rows.length, replied: rows.filter((r) => r.replied).length, rows };
}

/** Records behind a drill key, each opened by its authoritative form. */
export function drillRecords(user: string, f: RFilter, key: string): { dt: string; name: string; title: string; status: string }[] {
  const [k, ...rest] = key.split(":"); const v = rest.join(":");
  const deals = dealsIn(user, f), leads = leadsIn(user, f), eq = (x: unknown) => (String(x ?? "") || NOT_SET) === v;
  const D = (ds: Doc[]) => ds.map((d) => ({ dt: "CRM Deal", name: d.name, title: linkTitle("CRM Organization", d["organization"]), status: String(d["status"] ?? "") }));
  const L = (ls: Doc[]) => ls.map((l) => ({ dt: "CRM Lead", name: l.name, title: String(l["lead_name"] ?? l["first_name"] ?? ""), status: String(l["status"] ?? "") }));
  const A = (as: Activity[]) => as.map((a) => ({ dt: a.kind === "Task" ? "CRM Task" : a.kind === "Note" ? "FCRM Note" : "CRM Call Log", name: a.name, title: a.title, status: a.status ?? "" }));
  const O = (names: string[]) => names.map((n) => ({ dt: "CRM Organization", name: n, title: linkTitle("CRM Organization", n), status: "" }));
  const C = (cs: Doc[]) => cs.map((c) => ({ dt: "Customer", name: c.name, title: String(c["customer_name"] ?? c.name), status: "" }));
  const S = (ss: Doc[]) => ss.map((s) => ({ dt: "Sales Invoice", name: s.name, title: String(s["customer"] ?? ""), status: String(s["status"] ?? "") }));
  const M = (cs: Doc[]) => cs.map((c) => ({ dt: "Communication", name: c.name, title: String(c["subject"] ?? ""), status: String(c["sent_or_received"] ?? "") }));
  const CL = (cs: Doc[]) => cs.map((c) => ({ dt: "CRM Call Log", name: c.name, title: String(c["from"] ?? c.name), status: String(c["status"] ?? "") }));
  const CT = (cs: Doc[]) => cs.map((c) => ({ dt: "Contact", name: c.name, title: String(c["full_name"] ?? c["first_name"] ?? c.name), status: "" }));
  const EV = (es: Doc[]) => es.map((e) => ({ dt: "Event", name: e.name, title: eventSubjectNow(e), status: String(e["status"] ?? "") }));
  const Q = (qs: Doc[]) => qs.map((q) => ({ dt: "Quotation", name: q.name, title: String(q["party_name"] ?? q["customer_name"] ?? ""), status: quoteState(q) }));
  const SO = (os: Doc[]) => os.map((o) => ({ dt: "Sales Order", name: o.name, title: String(o["customer"] ?? ""), status: String(o["status"] ?? "") }));
  const wonD = (d: Doc) => dealStatusType(d["status"]) === "Won";
  if (demoEnabled() && k?.startsWith("demo-")) {
    const map = (rows: Doc[]) => rows.map(d => ({ dt: d.doctype, name: d.name, title: String(d["reason"] ?? d["subject"] ?? d["period"] ?? d.name), status: String(d["state"] ?? d["sent_or_received"] ?? "") }));
    if (k === "demo-forecast") return map(demoForecast(user, f).filter(row => row.closed).map(row => row.snapshot));
    if (k === "demo-adjustment") return map(demoRows(DEMO_TYPES.forecast, user, f).filter(d => Number(d["adjustment"])));
    if (k === "demo-commission") return map(demoRows(DEMO_TYPES.commission, user, f).filter(d => ["Held", "Rejected", "Reversed"].includes(String(d["state"]))));
    if (k === "demo-approval") return map(demoRows(DEMO_TYPES.commission, user, f).filter(d => d["state"] === "Pending"));
    if (k === "demo-wa-day") return map(demoRows("Communication", user, f).filter(d => d["custom_demo_channel"] === "WhatsApp" && day(d["communication_date"]) === v));
    if (k === "demo-wa-open") return map(demoWhatsApp(user).open);
    if (k === "demo-wa-unassigned") return map(demoWhatsApp(user).unassigned);
    if (k === "demo-wa") return map(demoWhatsApp(user).messages);
    if (k === "demo-callback") return map(demoRows("CRM Task", user, f).filter(d => Number(d["custom_demo_callback"]) && !["Done", "Canceled"].includes(String(d["status"])) && (v !== "overdue" || bucketOf(d) === "overdue")));
  }
  switch (k) {
    case "stage": return D(deals.filter((d) => d["status"] === v));
    case "owner": return D(deals.filter((d) => eq(d["deal_owner"])));
    case "lost": return D(deals.filter((d) => dealStatusType(d["status"]) === "Lost" && eq(d["lost_reason"])));
    case "source": return L(leads.filter((l) => eq(l["source"])));
    case "lstatus": return L(leads.filter((l) => eq(l["status"])));
    case "towner": return A(activities(user).filter((a) => a.kind === "Task" && inWin(a.when, f) && eq(a.owner)));
    // Same owner rule as the R-A2 table: an owner filter narrows tasks only (notes and calls carry no owner).
    case "kind": return A(activities(user).filter((a) => a.kind === v && inWin(a.when, f) && (!f.owner || a.owner === f.owner || a.kind !== "Task")));
    case "org": return D(deals.filter((d) => d["organization"] === v));
    case "age": return D(deals.filter((d) => isOpenDeal(d) && d["status"] === v));
    case "hvnf": return D(deals.filter((d) => dealFlags(d).highNoFollow));
    case "staledeal": return D(deals.filter((d) => dealFlags(d).stale && (v === "*" || d["status"] === v)));
    case "unassigned": return L(leads.filter((l) => isOpenLead(l) && !l["lead_owner"]));
    case "stalelead": return L(leads.filter((l) => isStaleLead(l)));
    case "dup": return L(duplicateLeads(user).filter((x) => leads.some((l) => l.name === x.lead.name)).flatMap((x) => [x.lead]));
    case "score": return L(leads.filter((l) => isOpenLead(l) && scoreLead(l).band === v));
    case "qual": return L(leads.filter((l) => isOpenLead(l) && qualification(l).blockers.length > 0));
    case "comp": return A(activities(user).filter((a) => a.kind === "Task" && inWin(a.when, f) && eq(a.owner) && bucketOf({ name: a.name, status: a.status, due_date: a.when } as never) === "overdue"));
    case "firstcontact": return L(leads.filter((l) => isOpenLead(l) && firstContactHours(l) === null));
    case "fcall": return L(leads.filter((l) => isOpenLead(l)));
    case "promise": return D(promiseWithoutFollowUp(deals));
    /* Dashboard drill keys (wf10 widgets) — each returns the exact records behind the clicked data point. */
    case "day": return L(leads.filter((l) => day(l["creation"]) === v));
    case "week": { const end = Date.parse(v) + 864e5 - 1; return L(leads.filter((l) => { const t = Date.parse(String(l["creation"] ?? "")); return Number.isFinite(t) && end - t >= 0 && end - t < 7 * 864e5; })); }
    case "actday": return A(activities(user).filter((a) => day(a.when) === v));
    case "terr": return D(deals.filter((d) => isOpenDeal(d) && eq(d["territory"])));
    case "camp": { const fld = demoEnabled() ? "custom_demo_campaign" : leads.some((l) => l["campaign"]) ? "campaign" : "utm_campaign"; return L(leads.filter((l) => eq(l[fld]))); }
    case "funnel": {
      const fc = firstContactStats(leads), no = new Set(fc.noContact.map((l) => l.name));
      if (v === "Contacted") return L(leads.filter((l) => !no.has(l.name)));
      if (v === "Qualified") return L(leads.filter((l) => l["status"] === "Qualified" || Number(l["converted"])));
      if (v === "Converted") return L(leads.filter((l) => Number(l["converted"])));
      return L(leads);
    }
    case "fcat": { const c = forecastView(user, {}).cats.find((x) => x.id === v); return D(c ? c.deals : []); }
    case "frep": return D(forecastView(user, {}).deals.filter((d) => eq(d["deal_owner"])));
    case "health": return O(accountHealth(user).filter((h) => h.state === v).map((h) => h.org));
    case "won": return D(deals.filter(wonD));
    case "open": return D(deals.filter(isOpenDeal));
    case "closed": return D(deals.filter((d) => ["Won", "Lost"].includes(dealStatusType(d["status"]))));
    case "closemon": return D(deals.filter((d) => isOpenDeal(d) && day(d["expected_closure_date"]).startsWith(v)));
    case "reached": return D(deals.filter((d) => d["status"] === v || stageHistory(d).some((h) => h.from === v || h.to === v)));
    case "move": return D(stageMoves(deals, new Date().toISOString().slice(0, 10), 30).deals);
    case "heat": {
      const [st, bk] = v.split("|"), bi = ["0–7", "8–14", "15–30", "30+"].indexOf(bk ?? "");
      const inB = (a: number | null) => a !== null && (bi === 0 ? a <= 7 : bi === 1 ? a > 7 && a <= 14 : bi === 2 ? a > 14 && a <= 30 : bi === 3 && a > 30);
      return D(deals.filter((d) => isOpenDeal(d) && d["status"] === st && inB(stageAgeDays(d))));
    }
    case "newcust": return C(scopedList("Customer", user).filter((c) => c["crm_deal"] && (daysAgo(c["creation"]) ?? 99) <= 30));
    case "neworgs": return O(scopedList("CRM Organization", user).filter((o) => (daysAgo(o["creation"]) ?? 99) <= 30).map((o) => o.name));
    case "overduear": { const t = new Date().toISOString().slice(0, 10); return S(filterReportRows(scopedList("Sales Invoice", user).filter((s) => Number(s["docstatus"]) === 1)).filter((s) => Number(s["outstanding_amount"] ?? 0) > 0 && s["due_date"] && day(s["due_date"]) < t)); }
    case "repeatcust": return C(scopedList("Customer", user).filter((c) => scopedList("Sales Invoice", user).filter((s) => s["customer"] === c.name && Number(s["docstatus"]) === 1 && !Number(s["is_return"])).length >= 2));
    case "neglected": return [...L(leads.filter((l) => isStaleLead(l))), ...D(deals.filter((d) => dealFlags(d).stale))];
    case "chan": return v === "Phone" ? CL(scopedList("CRM Call Log", user)) : M(scopedList("Communication", user).filter((c) => eq(c["communication_medium"])));
    case "calls": return CL(scopedList("CRM Call Log", user));
    // W-041 / W-077: the same set as managerExceptions().overdue — open tasks on permitted Leads and Deals whose due time passed.
    case "taskoverdue": return scopedAllTasks(user).filter((t) => bucketOf(t) === "overdue").map((t) => ({ dt: "CRM Task", name: t.name, title: String(t["title"] ?? t.name), status: String(t["status"] ?? "") }));
    case "taskrate": return scopedAllTasks(user).filter((t) => t["status"] !== "Canceled").map((t) => ({ dt: "CRM Task", name: t.name, title: String(t["title"] ?? t.name), status: String(t["status"] ?? "") }));
    case "ownerwon": return D(deals.filter((d) => wonD(d) && eq(d["deal_owner"])));
    case "openowner": return D(deals.filter((d) => isOpenDeal(d) && eq(d["deal_owner"])));
    case "emailrecv": return emailReplyStats(scopedList("Communication", user)).rows.map((r) => ({ dt: r.dt, name: r.name, title: r.subject, status: r.replied ? "Replied" : "Awaiting reply" }));
    /* Department-workspace drill keys (wf11 contextual metrics) — same permission scope, same record identity. */
    case "contacts": { const s = contactSets(user); const xs = v === "new" ? s.fresh : v === "linked" ? s.linked : v === "unlinked" ? s.unlinked : v === "active" ? s.active : v === "quiet" ? s.quiet : s.all; return CT(xs); }
    case "orgsopen": return O(accountHealth(user).filter((h) => h.open > 0).map((h) => h.org));
    case "callstatus": return CL(scopedList("CRM Call Log", user).filter((c) => eq(c["status"])));
    case "meetings": return EV(meetingSets(user)[v === "missed" ? "missed" : "upcoming"]);
    case "quotes": { const q = quoteChain(user, f).quotes; return Q(v === "*" ? q : q.filter((x) => quoteState(x) === v)); }
    case "q2o": { const c = quoteChain(user, f); return Q(c.submitted.filter((q) => (v === "ordered") === c.ordered.has(q.name))); }
    case "dealorders": return SO(quoteChain(user, f).orders);
    case "dealinvoices": return S(quoteChain(user, f).invoices);
    case "tgtmonth": return SO(attributedOrders(user).filter((o) => day(o["transaction_date"]).startsWith(v)));
    case "camppipe": { const byLead = campaignOfLead(user); return D(deals.filter((d) => isOpenDeal(d) && (byLead.get(String(d["lead"] ?? "")) || NOT_SET) === v)); }
    /* Command-center drill keys (wf11 C-PL-01 / C-ST-01 / C-LD-01) — same permission scope and filter as the deals/leads above. */
    case "ownerstage": { const [o = "", st = ""] = v.split("|"); return D(deals.filter((d) => isOpenDeal(d) && (String(d["deal_owner"] ?? "") || NOT_SET) === o && d["status"] === st)); }
    case "ownerlost": return D(deals.filter((d) => dealStatusType(d["status"]) === "Lost" && eq(d["deal_owner"])));
    case "fcband": { const b = FC_BANDS.find((x) => x.id === v); return b ? L(leads.filter((l) => { if (!isOpenLead(l)) return false; const h = firstContactHours(l); return h !== null && fcBandOf(h) === b.id; })) : []; }
  }
  return [];
}

/* ---------- Department-workspace record sets (shared by wf11 metrics and drillRecords) ---------- */
const kids = (v: unknown): Doc[] => (Array.isArray(v) ? (v as Doc[]) : []);
const mailOf = (v: unknown) => { const s = String(v ?? "").trim().toLowerCase(); const m = /<([^>]+)>/.exec(s); return m?.[1] ?? s; };
export const WORKSPACE_RULES = { contactActiveDays: 30, newDays: 30 } as const;
/** Permitted Contacts split by account link (Dynamic Link → CRM Organization, or company_name) and communication in the last
 *  30 days: a permitted Communication whose sender/recipients include the contact's email, or that references a permitted
 *  deal listing the contact (CRM Deal.contact / CRM Contacts child) — the same deal↔contact relation the native Contact page shows. */
export function contactSets(user: string) {
  const all = scopedList("Contact", user);
  const recentMail = new Set<string>(), recentRefs = new Set<string>();
  for (const c of scopedList("Communication", user)) {
    if ((daysAgo(c["communication_date"]) ?? 99999) > WORKSPACE_RULES.contactActiveDays) continue;
    for (const e of [c["sender"], ...String(c["recipients"] ?? "").split(",")]) { const k = mailOf(e); if (k) recentMail.add(k); }
    if (c["reference_doctype"] === "CRM Deal" && c["reference_name"]) recentRefs.add(String(c["reference_name"]));
  }
  const viaDeal = new Set<string>();
  for (const d of scopedDeals(user)) if (recentRefs.has(d.name)) { if (d["contact"]) viaDeal.add(String(d["contact"])); for (const r of kids(d["contacts"])) if (r["contact"]) viaDeal.add(String(r["contact"])); }
  const emails = (c: Doc) => [c["email_id"], ...kids(c["email_ids"]).map((r) => r["email_id"])].map(mailOf).filter(Boolean);
  const isLinked = (c: Doc) => kids(c["links"]).some((l) => l["link_doctype"] === "CRM Organization" && l["link_name"]) || Boolean(c["company_name"]);
  const isActive = (c: Doc) => viaDeal.has(c.name) || emails(c).some((e) => recentMail.has(e));
  return {
    all, fresh: all.filter((c) => (daysAgo(c["creation"]) ?? 99999) <= WORKSPACE_RULES.newDays),
    linked: all.filter(isLinked), unlinked: all.filter((c) => !isLinked(c)),
    active: all.filter(isActive), quiet: all.filter((c) => !isActive(c)),
  };
}
/** Permitted Events: upcoming = Open and starting today or later; missed = Open with a start date already passed (W-048 rule). */
export function meetingSets(user: string) {
  const today = new Date().toISOString().slice(0, 10), ev = scopedList("Event", user).filter((e) => e["status"] === "Open" && day(e["starts_on"]));
  return { upcoming: ev.filter((e) => day(e["starts_on"]) >= today), missed: ev.filter((e) => day(e["starts_on"]) < today) };
}
export const quoteState = (q: Doc) => (Number(q["docstatus"]) === 2 ? "Cancelled" : Number(q["docstatus"]) === 1 ? "Submitted" : "Draft");
/** Native handoff chain for the (filtered, permitted) deals: Quotation.crm_deal → Sales Order item prevdoc_docname →
 *  Sales Invoice item sales_order. Only submitted documents continue the chain; every document must be readable by the user. */
export function quoteChain(user: string, f: RFilter) {
  const dealNames = new Set(dealsIn(user, f).map((d) => d.name));
  const quotes = scopedList("Quotation", user).filter((q) => q["crm_deal"] && dealNames.has(String(q["crm_deal"])));
  const submitted = quotes.filter((q) => Number(q["docstatus"]) === 1), qset = new Set(submitted.map((q) => q.name));
  const orders = scopedList("Sales Order", user).filter((o) => Number(o["docstatus"]) === 1 && kids(o["items"]).some((i) => qset.has(String(i["prevdoc_docname"] ?? ""))));
  const ordered = new Set(orders.flatMap((o) => kids(o["items"]).map((i) => String(i["prevdoc_docname"] ?? ""))));
  const oset = new Set(orders.map((o) => o.name));
  const invoices = scopedList("Sales Invoice", user).filter((s) => Number(s["docstatus"]) === 1 && !Number(s["is_return"]) && kids(s["items"]).some((i) => oset.has(String(i["sales_order"] ?? ""))));
  return { quotes, submitted, ordered, orders, invoices };
}
/** Submitted, permitted Sales Orders with a sales_team row for a Sales Person whose targets the user may read (Targets basis). */
export function attributedOrders(user: string) {
  const people = new Set(scopedList("Sales Person", user).filter((p) => kids(p["targets"]).length).map((p) => p.name));
  return scopedList("Sales Order", user).filter((o) => Number(o["docstatus"]) === 1 && kids(o["sales_team"]).some((s) => people.has(String(s["sales_person"] ?? ""))));
}
/** Campaign of each permitted lead (same field choice as the W-031 campaign widget). */
export function campaignOfLead(user: string) {
  const leads = scopedLeads(user), fld = demoEnabled() ? "custom_demo_campaign" : leads.some((l) => l["campaign"]) ? "campaign" : "utm_campaign";
  return new Map(leads.map((l) => [l.name, String(l[fld] ?? "")]));
}

/** Total billed vs unpaid on submitted, non-return Sales Invoices; payments from submitted Payment Entries. */
export function receivables(invoices: Doc[]) {
  const inv = filterReportRows(invoices.filter((s) => Number(s["docstatus"]) === 1));
  const billed = inv.filter((s) => !Number(s["is_return"])).reduce((a, s) => a + Number(s["grand_total"] ?? s["rounded_total"] ?? 0), 0);
  const returns = inv.filter((s) => Number(s["is_return"])).reduce((a, s) => a + Number(s["grand_total"] ?? 0), 0);
  const unpaid = inv.reduce((a, s) => a + Number(s["outstanding_amount"] ?? 0), 0);
  const overdue = inv.filter((s) => Number(s["outstanding_amount"] ?? 0) > 0 && s["due_date"] && String(s["due_date"]) < new Date().toISOString().slice(0, 10)).reduce((a, s) => a + Number(s["outstanding_amount"] ?? 0), 0);
  return { billed, returns, unpaid, overdue, count: inv.length };
}
export function paymentsOf(customers: string[], user = currentUser()) {
  const set = new Set(customers);
  return scopedList("Payment Entry", user).filter((p) => p["party_type"] === "Customer" && set.has(String(p["party"])) && Number(p["docstatus"]) === 1);
}
const daysAgo = (v: unknown) => { const t = Date.parse(String(v ?? "")); return Number.isFinite(t) ? Math.floor((Date.now() - t) / 864e5) : null; };
export const isStaleLead = (l: Doc) => isOpenLead(l) && (daysAgo(leadLastActivity(l.name) || l["modified"]) ?? 0) > PIPE_RULES.staleLeadDays;

/** R-019 Stage Aging, R-020 High-value without follow-up, R-024 Stale opportunities (open deals only). */
function pipelineExtra(deals: Doc[]): Table[] {
  const open = deals.filter(isOpenDeal), fl = open.map((d) => dealFlags(d));
  const byStage = group(open, (d) => String(d["status"] ?? ""));
  const avg = (xs: (number | null)[]) => { const v = xs.filter((x): x is number => x !== null); return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null; };
  const hv = fl.filter((x) => x.highNoFollow).map((x) => x.deal), st = fl.filter((x) => x.stale);
  return [
    { id: "aging", rid: "R-019", title: "Stage aging (open opportunities)", note: "Days in current stage from CRM Deal.status_change_log; “—” when no open log row.", cols: ["Stage", "Open", "Avg Days", "Max Days", "Stale"],
      rows: [...byStage].map(([k, ds]) => { const ages = ds.map((d) => stageAgeDays(d)); return { key: k, label: k, drill: `age:${k}`, cells: [ds.length, avg(ages), ages.some((a) => a !== null) ? Math.max(...ages.filter((a): a is number => a !== null)) : null, ds.filter((d) => dealFlags(d).stale).length] }; }) },
    { id: "hvnf", rid: "R-020", title: "High-value opportunities without follow-up", note: `Open, value ≥ ${PIPE_RULES.highValueBase.toLocaleString("en-US")} in base currency, no open CRM Task. Unconvertible currencies are excluded.`, cols: ["Measure", "Deals", "Value"],
      rows: [{ key: "hvnf", label: "Without next activity", drill: "hvnf:", cells: [hv.length, fmtMoney(dealsMoney(hv))] }] },
    { id: "stale", rid: "R-024", title: "Stale opportunities", note: `Open, no activity for more than ${PIPE_RULES.staleDays} days.`, cols: ["Stage", "Stale", "Value"],
      rows: [...group(st.map((x) => x.deal), (d) => String(d["status"] ?? ""))].map(([k, ds]) => ({ key: k, label: k, drill: `staledeal:${k}`, cells: [ds.length, fmtMoney(dealsMoney(ds))] })),
      total: [st.length, fmtMoney(dealsMoney(st.map((x) => x.deal)))] },
    { id: "promise", rid: "R-039b", title: "Promised close without follow-up", note: "Open deals with an expected close date but no open follow-up task — any value (unlike R-020).", cols: ["Measure", "Deals", "Value"],
      rows: [{ key: "promise", label: "No open follow-up", drill: "promise:", cells: [promiseWithoutFollowUp(open).length, fmtMoney(dealsMoney(promiseWithoutFollowUp(open)))] }] },
  ];
}
/** R-006 Unassigned, R-007 Stale, R-008 Duplicate, R-010 Score distribution, qualification bottleneck. */
function leadExtra(user: string, leads: Doc[]): Table[] {
  const open = leads.filter(isOpenLead), dups = duplicateLeads(user).filter((x) => leads.some((l) => l.name === x.lead.name));
  const bands = ["Hot", "Warm", "Cold"].map((b) => ({ b, n: open.filter((l) => scoreLead(l).band === b).length }));
  const fc = firstContactStats(leads);
  return [
    { id: "firstcontact", rid: "R-005", title: "Lead first-contact time", note: "Hours from lead creation to the first logged email, call, meeting, task or note. Leads with no logged contact are never averaged in as zero.", cols: ["Measure", "Value"],
      rows: [
        { key: "avg", label: "Average hours to first contact", drill: "fcall:", cells: [fc.avgHours] },
        { key: "med", label: "Median hours to first contact", drill: "fcall:", cells: [fc.medianHours] },
        { key: "done", label: "Leads with a logged contact", drill: "fcall:", cells: [fc.contacted] },
        { key: "none", label: "Leads awaiting first contact", drill: "firstcontact:", cells: [fc.noContact.length] },
      ] },
    { id: "hygiene", rid: "R-006/007/008", title: "Lead hygiene", note: `Stale = no activity > ${PIPE_RULES.staleLeadDays} days. Duplicates match normalized email/phone; nothing is merged.`, cols: ["Check", "Leads"],
      rows: [
        { key: "u", label: "Unassigned leads (R-006)", drill: "unassigned:", cells: [open.filter((l) => !l["lead_owner"]).length] },
        { key: "s", label: "Stale leads (R-007)", drill: "stalelead:", cells: [open.filter(isStaleLead).length] },
        { key: "d", label: "Possible duplicate leads (R-008)", drill: "dup:", cells: [dups.length] },
        { key: "q", label: "Qualification blocked", drill: "qual:", cells: [open.filter((l) => qualification(l).blockers.length > 0).length] },
      ] },
    { id: "score", rid: "R-010", title: "Lead score distribution", note: "Rule-based score (Hot ≥ 60, Warm 30–59, Cold < 30); open leads only.", cols: ["Band", "Leads"],
      rows: bands.map(({ b, n }) => ({ key: b, label: b, drill: `score:${b}`, cells: [n] })), total: [open.length] },
  ];
}
/** R-031 Follow-up compliance = due tasks not currently overdue ÷ due tasks (due on/before today). Completion time is
 *  not captured by CRM Task, so on-time vs late completion cannot be separated (documented limitation). */
function compliance(tasks: Activity[], isOver: (a: Activity) => boolean): Table {
  const now = new Date().toISOString().slice(0, 10);
  const due = tasks.filter((t) => t.when && t.when.slice(0, 10) <= now && t.status !== "Canceled");
  const by = group(due, (a) => a.owner ?? "");
  const rate = (xs: Activity[]) => (xs.length ? `${Math.round((xs.filter((x) => !isOver(x)).length / xs.length) * 100)}%` : null);
  return { id: "compliance", rid: "R-031", title: "Follow-up compliance", note: "Due tasks not left overdue ÷ due tasks. Completion timestamps are not recorded, so late completion counts as compliant.", cols: ["Owner", "Due", "Overdue open", "Compliance"],
    rows: [...by].map(([k, xs]) => ({ key: k, label: k === NOT_SET ? "Unassigned" : userLabel(k), drill: `comp:${k}`, cells: [xs.length, xs.filter(isOver).length, rate(xs)] })), total: [due.length, due.filter(isOver).length, rate(due)] };
}
export const pct = (v: number | null) => (v === null ? null : `${v}%`);
export { isManager, parseDue };

/* ---------- Department report tables (current reports; research IDs are mapped in wf12, never assumed) ---------- */
function territoryTable(deals: Doc[]): Table {
  const by = group(deals, (d) => String(d["territory"] ?? ""));
  const won = (ds: Doc[]) => ds.filter((d) => dealStatusType(d["status"]) === "Won");
  return { id: "territory", rid: "R-P4", title: "Pipeline by territory", note: "Open column drills to the open deals of the territory.", cols: ["Territory", "Open", "Open Value", "Won", "Won Value"],
    rows: [...by].map(([k, ds]) => { const o = ds.filter(isOpenDeal); return { key: k, label: linkTitle("CRM Territory", k), drill: `terr:${k}`, cells: [o.length, fmtMoney(dealsMoney(o)), won(ds).length, fmtMoney(dealsMoney(won(ds)))] }; }),
    total: [deals.filter(isOpenDeal).length, fmtMoney(dealsMoney(deals.filter(isOpenDeal))), won(deals).length, fmtMoney(dealsMoney(won(deals)))] };
}
function campaignTable(user: string, leads: Doc[], deals: Doc[]): Table {
  const camp = campaignOfLead(user), by = group(leads, (l) => camp.get(l.name) ?? "");
  const openBy = group(deals.filter(isOpenDeal), (d) => camp.get(String(d["lead"] ?? "")) ?? "");
  return { id: "campaign", rid: "R-L3", title: "Campaign results", note: "Campaign of the lead; open deals are attributed through CRM Deal.lead. Spend and ROI are not shown: no spend source.", cols: ["Campaign", "Leads", "Converted", "Lead Conversion", "Open Deals"],
    rows: [...by].map(([k, ls]) => ({ key: k, label: linkTitle("Campaign", k), drill: `camp:${k}`, cells: [ls.length, ls.filter((l) => Number(l["converted"])).length, pct(leadConversion(ls)), (openBy.get(k) ?? []).length] })),
    total: [leads.length, leads.filter((l) => Number(l["converted"])).length, pct(leadConversion(leads)), deals.filter(isOpenDeal).length] };
}
function channelTables(user: string): Table[] {
  const com = group(scopedList("Communication", user), (c) => String(c["communication_medium"] ?? "")), calls = scopedList("CRM Call Log", user);
  const outcome = group(calls, (c) => String(c["status"] ?? ""));
  return [
    { id: "channel", rid: "R-A3", title: "Communication channel mix", note: "All dates. Phone = CRM Call Log; other channels = Communication medium.", cols: ["Channel", "Records"],
      rows: [...[...com].map(([k, xs]) => ({ key: k, label: k, drill: `chan:${k}`, cells: [xs.length] as (number | string | null)[] })), ...(calls.length ? [{ key: "Phone", label: "Phone", drill: "chan:Phone", cells: [calls.length] }] : [])],
      total: [[...com.values()].reduce((a, xs) => a + xs.length, 0) + calls.length] },
    { id: "calls", rid: "R-A4", title: "Calls by outcome", note: "All dates. Duration and outcome as logged on CRM Call Log.", cols: ["Outcome", "Calls"],
      rows: [...outcome].map(([k, xs]) => ({ key: k, label: k, drill: `callstatus:${k}`, cells: [xs.length] })), total: [calls.length] },
  ];
}
function healthTable(user: string): Table {
  const by = group(accountHealth(user), (h) => h.state);
  return { id: "health", rid: "R-C2", title: "Account health", note: "Permitted accounts only; state rules as on the Account Health board.", cols: ["State", "Accounts"],
    rows: [...by].map(([k, xs]) => ({ key: k, label: k, drill: `health:${k}`, cells: [xs.length] })), total: [[...by.values()].reduce((a, xs) => a + xs.length, 0)] };
}
function handoffTable(user: string, f: RFilter): Table {
  const c = quoteChain(user, f);
  const row = (label: string, drill: string, n: number): Row => ({ key: drill, label, drill, cells: [n] });
  return { id: "handoff", rid: "R-C3", title: "Quote-to-order handoff", note: "Native chain: Quotation.crm_deal → Sales Order item → Sales Invoice item. Read-only; documents keep their DIGIT lifecycle.", cols: ["Step", "Documents"],
    rows: [
      row("Draft", "quotes:Draft", c.quotes.filter((q) => quoteState(q) === "Draft").length),
      row("Submitted", "quotes:Submitted", c.submitted.length),
      row("Cancelled", "quotes:Cancelled", c.quotes.filter((q) => quoteState(q) === "Cancelled").length),
      row("Ordered", "q2o:ordered", c.submitted.filter((q) => c.ordered.has(q.name)).length),
      row("Awaiting order", "q2o:awaiting", c.submitted.filter((q) => !c.ordered.has(q.name)).length),
      row("Sales Orders", "dealorders:", c.orders.length),
      row("Sales Invoices", "dealinvoices:", c.invoices.length),
    ] };
}
