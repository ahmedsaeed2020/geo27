/**
 * WF-05 — Sales intelligence on canonical records (adapter only, no ledger writes).
 * Currency rule (P0): amounts are never added across currencies. A value converts to the company base currency only
 *   1) when it is already in base currency (rate 1), 2) with the document's own exchange_rate field (CRM Deal.exchange_rate,
 *   Sales Invoice.conversion_rate) or 3) with the latest Currency Exchange row dated on/before the value date.
 *   Otherwise the total stays split per currency and the consolidated amount is unavailable (null) with its reason.
 * Scoring, duplicate checks, pipeline exceptions and forecast categories are transparent rule sets (no AI predictions),
 * computed live from current source rows, so they can never be stale.
 */
import { adapter, type Doc } from "@/lib/adapter";
import { crmActivityRows, lastCrmActivity } from "@/lib/crmActivity";
import { SCORE_DEFAULTS, scoreFromFacts } from "./leadRules";
import { filterReportRows } from "@/lib/session";
import { scopedList } from "@/lib/scope";
import { bucketOf, isOpenLead, scopedLeads, userLabel } from "./wf01";
import { dealProb, dealStatusType, dealValue, isOpenDeal, scopedAllTasks, scopedDeals } from "./wf02";
import { handoffCompany, lastActivity, nextAction, stageAgeDays, targets } from "./wf03";

const today = () => new Date().toISOString().slice(0, 10);
const day = (v: unknown) => String(v ?? "").slice(0, 10);
const r2 = (x: number) => Math.round(x * 100) / 100;
const daysSince = (v: unknown, now = Date.now()) => { const t = Date.parse(String(v ?? "")); return Number.isFinite(t) ? Math.max(0, Math.floor((now - t) / 864e5)) : null; };

/* ================= Currency-safe money ================= */
export const baseCurrency = () => String(adapter.get("Company", handoffCompany())?.["default_currency"] || "SAR");
export type Rate = { rate: number; source: string; date?: string };
export function rateFor(cur: string, date: string, docRate?: unknown): Rate | null {
  const base = baseCurrency();
  if (!cur || cur === base) return { rate: 1, source: "base currency" };
  const dr = Number(docRate);
  if (dr > 0 && dr !== 1) return { rate: dr, source: "document exchange rate" };
  const ex = adapter.list("Currency Exchange").filter((x) => x["from_currency"] === cur && x["to_currency"] === base && Number(x["exchange_rate"]) > 0 && day(x["date"]) <= (date || today()))
    .sort((a, b) => day(b["date"]).localeCompare(day(a["date"])))[0];
  return ex ? { rate: Number(ex["exchange_rate"]), source: `Currency Exchange ${ex.name}`, date: day(ex["date"]) } : null;
}
export type Amt = { cur: string; amt: number; date: string; docRate?: unknown; key: string };
export type MoneySum = { baseCur: string; byCur: Record<string, number>; base: number | null; reason?: string; rates: Record<string, string>; count: number };
/** Sum amounts once per key (no duplicate documents), per currency, and in base currency when every rate is verified. */
export function sumMoney(items: Amt[]): MoneySum {
  const baseCur = baseCurrency(), seen = new Set<string>(), byCur: Record<string, number> = {}, rates: Record<string, string> = {}, missing = new Set<string>();
  let base = 0;
  for (const i of items) {
    if (seen.has(i.key)) continue; seen.add(i.key);
    const cur = i.cur || baseCur; byCur[cur] = r2((byCur[cur] ?? 0) + i.amt);
    const r = rateFor(cur, i.date, i.docRate);
    if (!r) { missing.add(cur); continue; }
    base += i.amt * r.rate; if (cur !== baseCur) rates[cur] = `${r.rate} (${r.source}${r.date ? ` ${r.date}` : ""})`;
  }
  const out: MoneySum = { baseCur, byCur, base: missing.size ? null : r2(base), rates, count: seen.size };
  if (missing.size) out.reason = `No verified ${[...missing].join(", ")}→${baseCur} rate`;
  return out;
}
const NUM = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
const fmtN = (n: number) => NUM.format(n);
/** Display string: consolidated base amount when valid, else separated currency totals — never an unqualified sum. */
export function fmtMoney(s: MoneySum): string {
  const curs = Object.keys(s.byCur);
  if (!curs.length) return `${s.baseCur} 0`;
  if (s.base !== null) return `${s.baseCur} ${fmtN(s.base)}`;
  return curs.map((c) => `${c} ${fmtN(s.byCur[c] ?? 0)}`).join(" · ");
}
export const dealAmt = (d: Doc, weighted = false): Amt => ({ cur: String(d["currency"] || ""), amt: weighted ? dealValue(d) * dealProb(d) / 100 : dealValue(d), date: day(d["creation"]) || today(), docRate: d["exchange_rate"], key: `D:${d.name}` });
export const dealsMoney = (ds: Doc[], weighted = false) => sumMoney(ds.map((d) => dealAmt(d, weighted)));
export const dealBase = (d: Doc) => sumMoney([dealAmt(d)]).base;

/** Receivables per currency. Billed = submitted non-return grand_total; returns separate; unpaid = outstanding_amount.
 *  Drafts (docstatus 0) and cancelled (2) are excluded; permission rules applied via filterReportRows. */
export function receivablesSafe(invoices: Doc[], now = today()) {
  const inv = filterReportRows(invoices.filter((s) => Number(s["docstatus"]) === 1));
  const a = (s: Doc, v: number, tag: string): Amt => ({ cur: String(s["currency"] || ""), amt: v, date: day(s["posting_date"]), docRate: s["conversion_rate"], key: `${tag}:${s.name}` });
  const billed = sumMoney(inv.filter((s) => !Number(s["is_return"])).map((s) => a(s, Number(s["grand_total"] ?? 0), "B")));
  const returns = sumMoney(inv.filter((s) => Number(s["is_return"])).map((s) => a(s, Number(s["grand_total"] ?? 0), "R")));
  const unpaid = sumMoney(inv.map((s) => a(s, Number(s["outstanding_amount"] ?? 0), "U")));
  const overdue = sumMoney(inv.filter((s) => Number(s["outstanding_amount"] ?? 0) > 0 && s["due_date"] && day(s["due_date"]) < now).map((s) => a(s, Number(s["outstanding_amount"]), "O")));
  return { billed, returns, unpaid, overdue, count: inv.length, excluded: invoices.length - inv.length };
}

/* ================= Lead scoring (explainable rules) ================= */
export type Factor = { id: string; label: string; points: number; kind: "positive" | "negative" | "missing"; evidence?: { dt: string; name: string } | undefined; group?: string | undefined; labelAr?: string | undefined };
/** CRM C4 (owner 2026-11-17): the score is the settings-driven rule set in leadRules.ts (source · company size · engagement ·
 *  budget, FCRM Settings custom_score_rules), so the lead list, the record, reports and the register show one score.
 *  SCORE_RULES lists the engagement points for the older score panel. */
export const SCORE_RULES = SCORE_DEFAULTS.engagement;
let scoreTaskVersion = -1;
const scoreTasks = new Map<string, Doc[]>();
const tasksOf = (name: string) => {
  if (scoreTaskVersion !== adapter.version()) {
    scoreTasks.clear();
    for (const task of adapter.list("CRM Task")) { const key = String(task["reference_docname"]), rows = scoreTasks.get(key) ?? []; rows.push(task); scoreTasks.set(key, rows); }
    scoreTaskVersion = adapter.version();
  }
  return scoreTasks.get(name) ?? [];
};
export const leadTasks = tasksOf;
export function leadLastActivity(name: string) { return lastCrmActivity("CRM Lead", name); }

export function scoreLead(l: Doc, now = Date.now()): { score: number; band: "Hot" | "Warm" | "Cold"; factors: Factor[]; basis: string } {
  const last = leadLastActivity(l.name), age = daysSince(last, now);
  const open = tasksOf(l.name).filter((t) => !["Done", "Canceled"].includes(String(t["status"])));
  const over = open.find((t) => bucketOf(t) === "overdue"), next = open.find((t) => bucketOf(t) !== "overdue");
  const completedCall = crmActivityRows("CRM Lead", l.name).some((r) => r.doc.doctype === "CRM Call Log" && r.doc["status"] === "Completed" && Date.parse(r.when) <= now);
  const r = scoreFromFacts(l, { lastAge: age, completedCall, next, overdue: over });
  return { score: r.score, band: r.band, factors: r.factors, basis: String(l["modified"] ?? "") };
}

/* ================= Qualification ================= */
export type Check = { id: string; label: string; ok: boolean; blocking: boolean };
export function qualification(l: Doc) {
  const open = tasksOf(l.name).filter((t) => !["Done", "Canceled"].includes(String(t["status"])));
  const checks: Check[] = [
    { id: "name", label: "Contact name", ok: !!(l["first_name"] || l["lead_name"]), blocking: true },
    { id: "reach", label: "Email or mobile", ok: !!(l["email"] || l["mobile_no"] || l["phone"]), blocking: true },
    { id: "org", label: "Company", ok: !!l["organization"], blocking: false },
    { id: "source", label: "Lead source", ok: !!l["source"], blocking: false },
    { id: "owner", label: "Owner", ok: !!l["lead_owner"], blocking: true },
    { id: "next", label: "Next action scheduled", ok: open.length > 0, blocking: false },
  ];
  const done = checks.filter((c) => c.ok).length;
  return { checks, completeness: Math.round((done / checks.length) * 100), blockers: checks.filter((c) => c.blocking && !c.ok).map((c) => c.label), next: open.sort((a, b) => String(a["due_date"] ?? "9").localeCompare(String(b["due_date"] ?? "9")))[0] };
}
type Res = { ok: true; name: string } | { ok: false; error: string };
const canEditLead = (l: Doc, user: string) => scopedLeads(user).some((x) => x.name === l.name);
/** Qualify / disqualify via existing CRM Lead Status records only (no invented statuses). */
export function setLeadQualification(name: string, to: "Qualified" | "Unqualified", user: string): Res {
  const l = adapter.get("CRM Lead", name);
  if (!l || !canEditLead(l, user)) return { ok: false, error: "Not permitted" };
  if (Number(l["converted"])) return { ok: false, error: "Lead is already converted" };
  if (!adapter.get("CRM Lead Status", to)) return { ok: false, error: `Lead status "${to}" is not configured` };
  if (to === "Qualified") { const b = qualification(l).blockers; if (b.length) return { ok: false, error: `Complete first: ${b.join(", ")}` }; }
  if (l["status"] === to) return { ok: true, name };
  adapter.update("CRM Lead", name, { status: to });
  return { ok: true, name };
}

/* ================= Duplicate detection (warn only) ================= */
export const normEmail = (v: unknown) => String(v ?? "").trim().toLowerCase();
export const normPhone = (v: unknown) => { const d = String(v ?? "").replace(/\D/g, ""); return d.length >= 7 ? d.slice(-9) : ""; };
export type Match = { dt: string; name: string; title: string; on: string };
let duplicateVersion = -1;
const duplicateIndex = new Map<string, { dt: string; doc: Doc; title: string }[]>();
function indexedDuplicates() {
  if (duplicateVersion === adapter.version()) return duplicateIndex;
  duplicateIndex.clear();
  for (const dt of ["CRM Lead", "Contact", "Customer"]) for (const doc of adapter.list(dt)) {
    const title = String(doc[dt === "CRM Lead" ? "lead_name" : dt === "Contact" ? "full_name" : "customer_name"] || doc["first_name"] || doc.name);
    const keys = [normEmail(doc[dt === "CRM Lead" ? "email" : "email_id"]), normPhone(doc["mobile_no"]), dt === "Customer" ? "" : normPhone(doc["phone"])];
    for (const key of new Set(keys.map((v, i) => v ? `${i === 0 ? "email" : "phone"}:${v}` : "").filter(Boolean))) {
      const rows = duplicateIndex.get(key) ?? []; rows.push({ dt, doc, title }); duplicateIndex.set(key, rows);
    }
  }
  duplicateVersion = adapter.version(); return duplicateIndex;
}
export function duplicatesOf(input: { name?: string; email?: unknown; mobile_no?: unknown; phone?: unknown; organization?: unknown }): Match[] {
  const index = indexedDuplicates(), out = new Map<string, Match>();
  const email = normEmail(input.email), phones = [normPhone(input.mobile_no), normPhone(input.phone)];
  for (const key of new Set([email ? `email:${email}` : "", ...phones.filter(Boolean).map(p => `phone:${p}`)].filter(Boolean))) for (const row of index.get(key) ?? []) {
    if (row.dt === "CRM Lead" && row.doc.name === input.name) continue;
    const id = `${row.dt}:${row.doc.name}`, on = key.startsWith("email:") ? "email" : "phone", prior = out.get(id);
    if (prior && !prior.on.includes(on)) prior.on += ` + ${on}`;
    else if (!prior) out.set(id, { dt: row.dt, name: row.doc.name, title: row.title, on });
  }
  return [...out.values()];
}
/** R-008 groups: each open lead with ≥1 matching lead, keyed by the lead itself. */
export function duplicateLeads(user: string) {
  return scopedLeads(user).map((l) => ({ lead: l, matches: duplicatesOf({ name: l.name, email: l["email"], mobile_no: l["mobile_no"], phone: l["phone"] }).filter((m) => m.dt === "CRM Lead") })).filter((x) => x.matches.length);
}

/* ================= Pipeline discipline ================= */
export const PIPE_RULES = { staleDays: 14, highValueBase: 50000, staleLeadDays: 14 } as const;
export type DealFlags = { deal: Doc; stageAge: number | null; next?: Doc | undefined; last: string; lastAge: number | null; overdueClose: boolean; stale: boolean; highNoFollow: boolean; noNext: boolean; base: number | null };
export function dealFlags(d: Doc, now = Date.now()): DealFlags {
  const next = nextAction(d.name), last = lastActivity(d.name), lastAge = daysSince(last || d["modified"], now), stageAge = stageAgeDays(d, now);
  const open = isOpenDeal(d), base = dealBase(d);
  const ec = day(d["expected_closure_date"]);
  return { deal: d, stageAge, next, last, lastAge, base,
    overdueClose: open && !!ec && ec < new Date(now).toISOString().slice(0, 10),
    stale: open && (lastAge ?? 0) > PIPE_RULES.staleDays,
    noNext: open && !next,
    highNoFollow: open && !next && base !== null && base >= PIPE_RULES.highValueBase };
}
export const openDealFlags = (user: string) => scopedDeals(user).filter(isOpenDeal).map((d) => dealFlags(d));
/** Stage guidance (warnings only — stage-blocking policy is not approved, legal transitions stay unchanged). */
export function stageGuidance(d: Doc): string[] {
  const w: string[] = [], type = dealStatusType(d["status"]);
  if (!d["organization"]) w.push("Link a company");
  if (!d["contact"]) w.push("Add a contact");
  if (!(dealValue(d) > 0)) w.push("Set a deal value");
  if (!d["expected_closure_date"]) w.push("Set an expected close date");
  if (type !== "Open" && !(Array.isArray(d["products"]) && d["products"].length)) w.push("Add product lines before proposal");
  if (!nextAction(d.name) && isOpenDeal(d)) w.push("Schedule the next activity");
  return w;
}

/* ================= Forecast categories ================= */
/** DIGIT working definitions by stage probability — explicit, not approved business policy. */
export const FORECAST_CATS = [
  { id: "commit", label: "Commit (forecast)", rule: "probability ≥ 70%", test: (p: number) => p >= 70 },
  { id: "best", label: "Best Case", rule: "40% ≤ probability < 70%", test: (p: number) => p >= 40 && p < 70 },
  { id: "pipeline", label: "Pipeline", rule: "probability < 40%", test: (p: number) => p < 40 },
] as const;
export type FFilter = { owner?: string | undefined; from?: string | undefined; to?: string | undefined };
export function forecastDeals(user: string, f: FFilter) {
  return scopedDeals(user).filter((d) => isOpenDeal(d) && (!f.owner || d["deal_owner"] === f.owner)
    && (!f.from || day(d["expected_closure_date"]) >= f.from) && (!f.to || (day(d["expected_closure_date"]) && day(d["expected_closure_date"]) <= f.to)));
}
/** Forecast per user and filter, rebuilt after a record write or when the minute changes (flags are date-relative). */
const forecastMemo = new Map<string, { stamp: string; view: ReturnType<typeof buildForecastView> }>();
export function forecastView(user: string, f: FFilter) {
  const key = `${user}\u0000${f.owner ?? ""}\u0000${f.from ?? ""}\u0000${f.to ?? ""}`, stamp = `${adapter.version()}:${Math.floor(Date.now() / 60000)}`;
  const hit = forecastMemo.get(key); if (hit && hit.stamp === stamp) return hit.view;
  const view = buildForecastView(user, f); forecastMemo.set(key, { stamp, view }); return view;
}
function buildForecastView(user: string, f: FFilter) {
  const ds = forecastDeals(user, f);
  const cats = FORECAST_CATS.map((c) => { const xs = ds.filter((d) => c.test(dealProb(d))); return { id: c.id, label: c.label, rule: c.rule, deals: xs, value: dealsMoney(xs), weighted: dealsMoney(xs, true) }; });
  const slipped = ds.filter((d) => dealFlags(d).overdueClose), undated = ds.filter((d) => !d["expected_closure_date"]);
  const atRisk = ds.filter((d) => { const fl = dealFlags(d); return fl.overdueClose || fl.stale || fl.noNext; });
  return { deals: ds, cats, weighted: dealsMoney(ds, true), value: dealsMoney(ds), slipped, undated, atRisk };
}
/** Target vs weighted forecast in base currency, by fiscal year (targets are Sales Person.targets in company currency). */
export function targetGap(user: string, fiscalYear: string, f: FFilter) {
  const fy = adapter.get("Fiscal Year", fiscalYear);
  const ts = targets(user).filter((t) => t.fiscalYear === fiscalYear);
  const target = ts.reduce((a, t) => a + t.amount, 0);
  const from = day(fy?.["year_start_date"]), to = day(fy?.["year_end_date"]);
  const w = forecastView(user, { ...f, ...(from ? { from } : {}), ...(to ? { to } : {}) }).weighted;
  return { fiscalYear, target, targets: ts.length, weighted: w, gap: w.base === null || !ts.length ? null : r2(target - w.base), period: from && to ? `${from} → ${to}` : "" };
}

/* ================= Manager exceptions ================= */
export function managerExceptions(user: string) {
  const fl = openDealFlags(user), leads = scopedLeads(user).filter(isOpenLead);
  const tasks = scopedAllTasks(user);
  return {
    unassigned: leads.filter((l) => !l["lead_owner"]),
    overdue: tasks.filter((t) => bucketOf(t) === "overdue"),
    highNoFollow: fl.filter((x) => x.highNoFollow).map((x) => x.deal),
    stale: fl.filter((x) => x.stale).map((x) => x.deal),
    pastClose: fl.filter((x) => x.overdueClose).map((x) => x.deal),
    qualBlocked: leads.filter((l) => qualification(l).blockers.length > 0),
    staleLeads: leads.filter((l) => (daysSince(leadLastActivity(l.name) || l["modified"]) ?? 0) > PIPE_RULES.staleLeadDays),
  };
}
export const ownerName = (u: unknown) => (u ? userLabel(u) : "Unassigned");

/* ================= Account health ================= */
export const SILENT_DAYS = 30;
/** Latest activity timestamp across tasks, notes, calls and communications referencing any of the given records. */
let touchVersion = -1;
const touchByRef = new Map<string, string>();
/** Latest activity timestamp across referenced records; index rebuilt only when the adapter version changes. */
function lastTouch(names: string[]): string {
  if (touchVersion !== adapter.version()) {
    touchByRef.clear();
    for (const x of [...adapter.list("CRM Task"), ...adapter.list("FCRM Note"), ...adapter.list("CRM Call Log"), ...adapter.list("Communication")]) {
      const k = String(x["reference_docname"] ?? x["reference_name"] ?? ""), v = String(x["modified"] ?? x["creation"] ?? "");
      if (v > (touchByRef.get(k) ?? "")) touchByRef.set(k, v);
    }
    touchVersion = adapter.version();
  }
  return names.reduce((best, n) => { const v = touchByRef.get(n) ?? ""; return v > best ? v : best; }, "");
}
/** Account health — explicit rule: At risk = overdue ERP receivable; Silent = no CRM activity in SILENT_DAYS; else Healthy.
 *  Shared by the Health/Exec boards (wf10) and the reports drill-down (wf04), so a widget and its source records never drift. */
export function accountHealth(user: string, now = Date.now()) {
  const deals = scopedDeals(user), todayD = new Date(now).toISOString().slice(0, 10);
  // Accounts, customers and invoices come from the user's permitted rows only (same engine as lists and Customer 360),
  // so a dashboard never counts or links another company's accounts or receivables.
  const orgDocs = scopedList("CRM Organization", user), orgByName = new Map(orgDocs.map((o) => [o.name, o]));
  const orgs = [...new Set([...deals.map((d) => String(d["organization"] ?? "")).filter((o) => orgByName.has(o) || !adapter.get("CRM Organization", o)), ...orgDocs.map((o) => o.name)].filter(Boolean))];
  const dealsByOrg = new Map<string, Doc[]>(), customers = scopedList("Customer", user), invByCustomer = new Map<string, Doc[]>();
  for (const d of deals) { const k = String(d["organization"] ?? ""); dealsByOrg.set(k, [...(dealsByOrg.get(k) ?? []), d]); }
  for (const s of scopedList("Sales Invoice", user)) { const k = String(s["customer"] ?? ""); invByCustomer.set(k, [...(invByCustomer.get(k) ?? []), s]); }
  return orgs.map((org) => {
    const ds = dealsByOrg.get(org) ?? [], dealNames = new Set(ds.map((d) => d.name));
    const aliases = new Set([org, String(orgByName.get(org)?.["organization_name"] ?? "")].filter(Boolean).map((v) => v.trim().toLowerCase()));
    const custs = customers.filter((c) => aliases.has(String(c["customer_name"] ?? "").trim().toLowerCase()) || dealNames.has(String(c["crm_deal"] ?? ""))).map((c) => c.name);
    const inv = custs.flatMap((c) => invByCustomer.get(c) ?? []);
    const r = receivablesSafe(inv, todayD);
    const last = lastTouch([org, ...ds.map((d) => d.name)]), silentFor = daysSince(last, now);
    // Any submitted invoice with an outstanding balance past its due date puts the account at risk, in any currency:
    // a missing exchange rate must not hide an overdue receivable (base stays null only for the money total).
    const overdue = r.overdue.count > 0;
    const state = overdue ? "At risk" : silentFor === null || silentFor > SILENT_DAYS ? "Silent" : "Healthy";
    return { org, state, deals: ds, open: ds.filter(isOpenDeal).length, won: ds.filter((d) => dealStatusType(d["status"]) === "Won"), invoices: inv.filter((s) => Number(s["docstatus"]) === 1).length, overdue: r.overdue, last };
  });
}
