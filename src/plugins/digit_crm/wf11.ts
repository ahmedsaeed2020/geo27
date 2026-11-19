/**
 * WF-11 — Contextual department metrics (C-xxx) for research IA nodes that the 80 board widgets (W-xxx) do not cover:
 * Contacts, Accounts, Call outcomes, Meetings, Quotation → Sales Order → Sales Invoice handoff, Target month history and
 * campaign pipeline. Every value is the record count of its own drill key in the shared wf04 drillRecords contract, so a
 * displayed number always equals the records opened by clicking it (same permission scope, same filter).
 * Contextual metrics never replace the board catalog; department workspaces compose W- and C- ids (workspaces.ts).
 */
import { campaignOfLead, dealsIn, drillRecords, FC_BANDS, fcBandOf, leadsIn, type RFilter } from "./wf04";
import { dealStatusType, isOpenDeal, pipeline } from "./wf02";
import { isOpenLead, userLabel } from "./wf01";
import { firstContactHours } from "./wf07";
import { scopedList } from "@/lib/scope";
import { currentFiscalYear } from "./wf10";
import { adapter, type Doc } from "@/lib/adapter";
import type { Bar, Widget } from "./wf10";

export const CTX_IDS = [
  "C-GH-01", "C-AC-01", "C-CT-01", "C-CT-02", "C-CT-03", "C-CT-04", "C-CL-01", "C-MT-01", "C-MT-02",
  "C-QH-01", "C-QH-02", "C-SO-01", "C-SI-01", "C-TG-01", "C-CMP-01",
  // Command-center compositions (owner × stage, outcomes by representative, time to first contact)
  "C-PL-01", "C-ST-01", "C-LD-01",
] as const;
export type CtxId = (typeof CTX_IDS)[number];
/** Contextual metrics computed from creation-dated, owner-attributed deals (dealsIn) — they honor the workspace filter. */
export const CTX_FILTERABLE = new Set<string>(["C-QH-01", "C-QH-02", "C-SO-01", "C-SI-01", "C-CMP-01", "C-PL-01", "C-ST-01", "C-LD-01"]);
export const isCtxId = (id: string): id is CtxId => (CTX_IDS as readonly string[]).includes(id);

const R = (cat: string, drill: string) => ({ to: "/digit-crm/reports", search: { cat, drill } });
const day = (v: unknown) => String(v ?? "").slice(0, 10);

type Def = { title: string; source: string; calc: string; build: (user: string, f: RFilter, today: string) => Partial<Widget> };
const count = (user: string, f: RFilter, key: string) => drillRecords(user, f, key).length;
const kpi = (cat: string, key: string, hint?: string) => (user: string, f: RFilter): Partial<Widget> => ({ kind: "kpi", value: String(count(user, f, key)), ...(hint ? { hint } : {}), ...R(cat, key) });
const bars = (cat: string, items: { label: string; key: string }[], user: string, f: RFilter): Partial<Widget> =>
  ({ kind: "bars", bars: items.map((x): Bar => ({ label: x.label, value: count(user, f, x.key), ...R(cat, x.key) })) });

const DEFS: Record<CtxId, Def> = {
  "C-GH-01": { title: "Activities Today", source: "CRM Task.due_date, FCRM Note, CRM Call Log", calc: "permitted activities dated today (activity date)", build: (u, _f, today) => kpi("activity", `actday:${today}`)(u, {}) },
  "C-AC-01": { title: "Accounts with Open Deals", source: "CRM Organization ← CRM Deal.organization", calc: "permitted accounts with at least one permitted open deal", build: (u) => kpi("customers", "orgsopen:")(u, {}) },
  "C-CT-01": { title: "Contacts", source: "Contact", calc: "permitted contacts", build: (u) => kpi("customers", "contacts:*")(u, {}) },
  "C-CT-02": { title: "New Contacts (30 days)", source: "Contact.creation", calc: "created in the last 30 days", build: (u) => kpi("customers", "contacts:new")(u, {}) },
  "C-CT-03": { title: "Contact Communication", source: "Communication.sender/recipients/reference → Contact, CRM Deal.contacts", calc: "contact emailed, or on a deal with communication, in the last 30 days", build: (u) => bars("customers", [{ label: "Active", key: "contacts:active" }, { label: "Quiet", key: "contacts:quiet" }], u, {}) },
  "C-CT-04": { title: "Contacts by Account Link", source: "Contact.links (Dynamic Link → CRM Organization), Contact.company_name", calc: "linked vs not linked to an account", build: (u) => bars("customers", [{ label: "Linked", key: "contacts:linked" }, { label: "Not linked", key: "contacts:unlinked" }], u, {}) },
  "C-CL-01": { title: "Calls by Outcome", source: "CRM Call Log.status", calc: "permitted call logs grouped by status", build: (u) => {
    const st = new Map<string, number>(); for (const c of scopedList("CRM Call Log", u)) { const k = String(c["status"] || "") || "Not set"; st.set(k, (st.get(k) ?? 0) + 1); }
    return bars("activity", [...st.entries()].sort((a, b) => b[1] - a[1]).map(([label]) => ({ label, key: `callstatus:${label}` })), u, {});
  } },
  "C-MT-01": { title: "Upcoming Meetings", source: "Event.starts_on/status", calc: "open events starting today or later", build: (u) => kpi("activity", "meetings:upcoming")(u, {}) },
  "C-MT-02": { title: "Missed Meetings", source: "Event.starts_on/status", calc: "open events whose start date passed (W-048 rule)", build: (u) => kpi("activity", "meetings:missed")(u, {}) },
  "C-QH-01": { title: "Deal Quotations by Status", source: "Quotation.crm_deal/docstatus", calc: "quotations linked to permitted deals, by document status", build: (u, f) => bars("customers", ["Draft", "Submitted", "Cancelled"].map((s) => ({ label: s, key: `quotes:${s}` })), u, f) },
  "C-QH-02": { title: "Quote-to-Order", source: "Quotation → Sales Order Item.prevdoc_docname", calc: "submitted deal quotations with / without a submitted sales order", build: (u, f) => bars("customers", [{ label: "Ordered", key: "q2o:ordered" }, { label: "Awaiting order", key: "q2o:awaiting" }], u, f) },
  "C-SO-01": { title: "Sales Orders from Deals", source: "Sales Order Item.prevdoc_docname → Quotation.crm_deal", calc: "submitted sales orders from deal quotations", build: (u, f) => kpi("customers", "dealorders:")(u, f) },
  "C-SI-01": { title: "Invoices from Deal Orders", source: "Sales Invoice Item.sales_order", calc: "submitted, non-return invoices from those orders; drill shows outstanding", build: (u, f) => kpi("customers", "dealinvoices:")(u, f) },
  "C-TG-01": { title: "Attributed Orders by Month", source: "Sales Order.sales_team (Targets basis)", calc: "submitted orders attributed to target holders, per month of the current fiscal year", build: (u, _f, today) => {
    const fy = currentFiscalYear(today, u), rec = fy ? adapter.get("Fiscal Year", fy) : undefined;
    if (!rec) return { kind: "blocked", reason: "No fiscal year covers today" };
    const from = day(rec["year_start_date"]).slice(0, 7), to = today.slice(0, 7), months: string[] = [];
    for (let m = from; m && m <= to && months.length < 24; m = nextMonth(m)) months.push(m);
    return bars("pipeline", months.map((m) => ({ label: m, key: `tgtmonth:${m}` })), u, {});
  } },
  "C-CMP-01": { title: "Open Pipeline by Campaign", source: "CRM Deal.lead → CRM Lead campaign", calc: "open deals grouped by the campaign of their source lead", build: (u, f) => {
    const camp = campaignOfLead(u), byCamp = new Map<string, number>();
    for (const d of dealsIn(u, f)) if (isOpenDeal(d)) { const c = camp.get(String(d["lead"] ?? "")) || "Not set"; byCamp.set(c, (byCamp.get(c) ?? 0) + 1); }
    return bars("leads", [...byCamp.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([label]) => ({ label, key: `camppipe:${label}` })), u, f);
  } },
  "C-PL-01": { title: "Open Pipeline by Owner and Stage", source: "CRM Deal.deal_owner × CRM Deal.status (open stages)", calc: "open deals per owner, split by current stage", build: (u, f) => {
    const stages = pipeline(u).filter((s) => s.type !== "Won" && s.type !== "Lost").map((s) => s.stage);
    return ownerMatrix(dealsIn(u, f).filter(isOpenDeal), stages, (d) => String(d["status"] ?? ""), (o, c) => `ownerstage:${o}|${c}`);
  } },
  "C-ST-01": { title: "Deal Outcomes by Representative", source: "CRM Deal.deal_owner × CRM Deal Status.type", calc: "deals per owner: open, won and lost", build: (u, f) => {
    const kind = (d: Doc) => (isOpenDeal(d) ? "Open" : dealStatusType(d["status"]) === "Won" ? "Won" : dealStatusType(d["status"]) === "Lost" ? "Lost" : "");
    const key: Record<string, string> = { Open: "openowner", Won: "ownerwon", Lost: "ownerlost" };
    return ownerMatrix(dealsIn(u, f), ["Open", "Won", "Lost"], kind, (o, c) => `${key[c]}:${o}`);
  } },
  "C-LD-01": { title: "Time to First Contact", source: "CRM Lead.creation → first completed call or sent message (R-005)", calc: "open leads by hours to first contact; never-contacted leads shown separately", build: (u, f) => {
    const n = new Map<string, number>(); let never = 0;
    for (const l of leadsIn(u, f)) { if (!isOpenLead(l)) continue; const h = firstContactHours(l); if (h === null) never++; else { const b = fcBandOf(h); n.set(b, (n.get(b) ?? 0) + 1); } }
    return { kind: "bars", bars: [...FC_BANDS.map((b): Bar => ({ label: b.label, value: n.get(b.id) ?? 0, ...R("leads", `fcband:${b.id}`) })), { label: "Never contacted", value: never, ...R("leads", "firstcontact:") }] };
  } },
};
/** Owner × category matrix (heat widget): rows are owners by total, cells count deals; a cell opens exactly its deals. */
function ownerMatrix(deals: Doc[], cols: string[], colOf: (d: Doc) => string, drill: (owner: string, col: string) => string): Partial<Widget> {
  const NOT_SET = "Not set", m = new Map<string, number[]>();
  for (const d of deals) { const c = cols.indexOf(colOf(d)); if (c < 0) continue; const o = String(d["deal_owner"] ?? "") || NOT_SET; const row = m.get(o) ?? cols.map(() => 0); row[c] = (row[c] ?? 0) + 1; m.set(o, row); }
  const owners = [...m.entries()].sort((a, b) => b[1].reduce((x, y) => x + y, 0) - a[1].reduce((x, y) => x + y, 0));
  const label = (o: string) => (o === NOT_SET ? "Unassigned" : userLabel(o) || o);
  const byLabel = new Map(owners.map(([o]) => [label(o), o]));
  return { kind: "heat", heat: { rows: owners.map(([o]) => label(o)), cols, cells: owners.map(([, r]) => r), recRows: true },
    heatCell: (row, col) => ({ to: "/digit-crm/reports", search: { cat: "pipeline", drill: drill(byLabel.get(row) ?? row, col) } }) };
}
function nextMonth(m: string) { const [y, mo] = m.split("-").map(Number); const d = new Date(Date.UTC(y ?? 2000, mo ?? 1, 1)); return d.toISOString().slice(0, 7); }

/** One contextual metric. With an active filter only CTX_FILTERABLE metrics apply it (and their drills carry it). */
export function contextWidget(id: CtxId, user: string, f: RFilter = {}, nowD = new Date()): Widget {
  const d = DEFS[id], active = Boolean(f.from || f.to || f.owner), use = active && CTX_FILTERABLE.has(id) ? f : {};
  const w = { id, title: d.title, source: d.source, calc: d.calc, kind: "kpi" as Widget["kind"], ...d.build(user, use, nowD.toISOString().slice(0, 10)) } as Widget;
  if (!active) return w;
  if (!CTX_FILTERABLE.has(id)) return { ...w, scope: "all" };
  const fs: Record<string, string> = { ...(f.from ? { from: f.from } : {}), ...(f.to ? { to: f.to } : {}), ...(f.owner ? { owner: f.owner } : {}) };
  const add = <T extends { to?: string | undefined; search?: Record<string, string> | undefined }>(x: T): T => (x.to === "/digit-crm/reports" ? { ...x, search: { ...(x.search ?? {}), ...fs } } : x);
  const cell = w.heatCell;
  return { ...add(w), scope: "filtered", ...(w.bars ? { bars: w.bars.map(add) } : {}), ...(cell ? { heatCell: (r: string, c: string) => add(cell(r, c)) } : {}) };
}
export const contextTitle = (id: CtxId) => DEFS[id].title;
