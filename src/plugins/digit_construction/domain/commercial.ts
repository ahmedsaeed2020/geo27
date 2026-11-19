/**
 * Department 04 (commercial) — save rules and read models for change pricing requests to subcontractors, commercial
 * claims (notice period, agreement → variation / time extension, disputes into the final account), time extensions
 * (union of excusable delay days, grant → new completion date), bundling change events into one client variation,
 * the budget revision drafted from an approved variation, reduction variations, contract close-out by a non-creator,
 * stored materials and claim periods on client claims, prospective terms revisions, change exposure stages and the
 * RFI → change event → variation → budget revision chain (owner spec catalog FT-04-01 … FT-04-15, FT-VAR-CE,
 * decisions DEC-045 … DEC-063). Rules are pure functions of (doc, before, store) registered as adapter hooks by
 * hooks.ts; rules/commercial.py is the server twin with the same messages and derived fields. Reads go through
 * asSystem so a rule never depends on what the session user may read.
 */
import { adapter, type Doc } from "@/lib/adapter";
import { currentUser } from "@/lib/session";
import { lineAmount, num, r2 } from "./calc";
import { approvedBudget, asSystem, list, rows, today } from "./data";

type Row = Record<string, unknown>;
export type ComRes = { doc: Doc; errors: string[] };
const s = (v: unknown) => (v === undefined || v === null ? "" : String(v));
const day = (v: unknown) => s(v).slice(0, 10);
const live = (d: Doc | undefined) => !!d && num(d.docstatus) !== 2;
const changedTo = (doc: Doc, before: Doc | undefined, f: string, v: string) => doc[f] === v && before?.[f] !== v;
const all = (dt: string, pred?: (d: Doc) => boolean) => asSystem(() => list(dt, pred));
const get = (dt: string, n: unknown) => (n ? asSystem(() => adapter.get(dt, s(n))) : undefined);
const idx = (rs: Row[]) => rs.map((r, i): Row => ({ ...r, idx: i + 1 }));
export const plusDays = (d: string, n: number) => new Date(Date.parse(d.slice(0, 10)) + n * 86400000).toISOString().slice(0, 10);
export const daysDiff = (a: string, b: string) => Math.round((Date.parse(b.slice(0, 10)) - Date.parse(a.slice(0, 10))) / 86400000);
export const fill = (t: string, ...a: unknown[]) => t.replace(/\{(\d+)\}/g, (_m, i: string) => s(a[Number(i)]));

export const COM_MSG = {
  noticeLate: "Late notice may forfeit the entitlement: notice given {0} days after the event (contract notice period {1} days)",
  agreedAmount: "The agreed amount is required",
  delayEvidence: "Row {0}: the delay event has no daily site report as evidence",
  grantedOver: "Granted days ({0}) exceed the requested days ({1})",
  rfqLocked: "The change event is approved and locked",
  noEvents: "Select at least one change event",
  ceNotApproved: "{0}: only an approved change event goes into a variation",
  inScope: "{0}: the change event is in scope — cost exposure only",
  linked: "{0} is already linked to variation {1}",
  contracts: "The change events belong to different contracts",
  reduction: "A reduction variation (negative lines) cannot be approved until the owner approves the value-limit policy (DEC-046)",
  closeSelf: "No self-approval: the contract's creator cannot close it (DEC-048)",
  storedNotAllowed: "Row {0}: this contract does not claim stored materials",
  storedNoReceipt: "Row {0}: stored materials have no goods receipt",
  storedOver: "Row {0}: stored materials {1} exceed the goods receipt value {2}",
  periodOverlap: "The claim period overlaps claim {0} ({1} – {2})",
  noBudget: "The project has no approved budget to revise",
  varNotApproved: "Approve the variation before revising the budget",
  noCostLines: "The variation has no costed change event lines to carry into the budget",
} as const;

/** DEC-052: contract claim notice period, default 28 days. DEC-051: working days Sunday–Thursday. */
export const CLAIM_NOTICE_DEFAULT = 28;
export const RFQ_WORKING_DAYS = 7;
const WEEKEND = new Set([5, 6]); // Friday, Saturday (getUTCDay)
export const CLAIM_CLOSED = ["Agreed", "Partially Agreed", "Rejected", "Withdrawn"];

/** The company's native Holiday List dates (Company.default_holiday_list), on top of the Friday / Saturday weekend. */
export function companyHolidays(company: unknown): Set<string> {
  const c = get("Company", company); const hl = c?.["default_holiday_list"] ? get("Holiday List", c["default_holiday_list"]) : undefined;
  return new Set(rows(hl, "holidays").map((h) => day(h["holiday_date"])).filter(Boolean));
}
/** DEC-051: n working days after `start` (Sunday–Thursday, company holidays skipped). */
export function addWorkingDays(company: unknown, start: string, n: number): string {
  const off = companyHolidays(company);
  let d = day(start), k = 0;
  while (k < n) { d = plusDays(d, 1); if (WEEKEND.has(new Date(`${d}T00:00:00Z`).getUTCDay()) || off.has(d)) continue; k++; }
  return d;
}

// ---------------------------------------------------------------- FT-04-07 change pricing request to a subcontractor
/** F04-07-1: lines copy the change event lines; issuing sets the due date (+7 working days); accepting reprices the event. */
export function changeRfqRule(doc: Doc, before: Doc | undefined): ComRes & { accept: boolean } {
  const e: string[] = [];
  const ce = get("Digit Change Event", doc["change_event"]);
  const own = rows(doc, "lines");
  const lines = idx(own.length ? own : rows(ce, "lines").map((l) => ({ line_key: l["line_key"], description: l["description"], qty: l["qty"], unit_cost: l["unit_cost"] })));
  const quoted = lines.filter((l) => num(l["quoted_amount"]) !== 0);
  let d: Doc = { ...doc, lines, status: doc["status"] || "Draft", quote_amount: quoted.length ? r2(quoted.reduce((a, l) => a + num(l["quoted_amount"]), 0)) : doc["quote_amount"] };
  if (changedTo(doc, before, "status", "Out for Pricing")) {
    const issued = day(doc["issued_on"]) || today();
    d = { ...d, issued_on: issued, due_date: doc["due_date"] || addWorkingDays(ce?.["company"], issued, RFQ_WORKING_DAYS) };
  }
  let accept = false;
  if (changedTo(doc, before, "status", "Accepted")) {
    if (ce && (ce["workflow_state"] === "Approved" || num(ce.docstatus) === 1)) e.push(COM_MSG.rfqLocked);
    else { accept = !!ce; d = { ...d, approved_amount: d["quote_amount"] }; }
  }
  return { doc: d, errors: e, accept };
}
/** Accepted quote → the event lines take the quoted unit cost and the work order whose commitment the change adjusts. */
export function rfqAcceptPatch(rfq: Doc): Row[] | undefined {
  const ce = get("Digit Change Event", rfq["change_event"]); if (!ce) return undefined;
  const q = new Map(rows(rfq, "lines").filter((l) => num(l["quoted_amount"]) !== 0).map((l) => [s(l["line_key"]), l]));
  return rows(ce, "lines").map((l) => {
    const r = q.get(s(l["line_key"])); if (!r) return l;
    const qty = num(l["qty"]) || num(r["qty"]);
    return { ...l, unit_cost: qty ? r2(num(r["quoted_amount"]) / qty) : num(r["quoted_amount"]), work_order: rfq["work_order"] || l["work_order"] || "" };
  });
}

// ---------------------------------------------------------------- FT-04-10 commercial claims
export function noticeGap(doc: Doc, contract: Doc | undefined): { gap: number; limit: number } | undefined {
  const ev = day(doc["event_date"]), nt = day(doc["notice_date"]); if (!ev || !nt) return undefined;
  return { gap: daysDiff(ev, nt), limit: num(contract?.["claim_notice_days"]) || CLAIM_NOTICE_DEFAULT };
}
/** F04-10-1 warning text (non-blocking; the claim keeps notice_late = 1). */
export function claimNoticeWarning(doc: Doc): string | undefined {
  const g = noticeGap(doc, get("Digit Client Contract", doc["contract"]));
  return g && g.gap > g.limit ? fill(COM_MSG.noticeLate, g.gap, g.limit) : undefined;
}
export function commercialClaimRule(doc: Doc, before: Doc | undefined): ComRes & { agree: boolean } {
  const e: string[] = [];
  const c = get("Digit Client Contract", doc["contract"]);
  let d: Doc = { ...doc, project: doc["project"] || c?.["project"] || "", company: doc["company"] || c?.["company"] || "", customer: doc["customer"] || c?.["customer"] || "" };
  const g = noticeGap(doc, c);
  if (g) d = { ...d, notice_late: g.gap > g.limit ? 1 : 0 };
  let agree = false;
  for (const st of ["Agreed", "Partially Agreed"]) if (before && changedTo(doc, before, "workflow_state", st)) { // a transition (records inserted in a state are left as they are)
    if (!(num(doc["agreed_amount"]) > 0)) e.push(COM_MSG.agreedAmount); else agree = true;
    d = { ...d, decided_by: currentUser(), decided_on: today() };
  }
  if (changedTo(doc, before, "workflow_state", "Disputed")) d = { ...d, disputed_amount: r2(Math.max(0, num(doc["claimed_amount"]) - num(doc["offered_amount"]))) };
  return { doc: d, errors: e, agree };
}
/** F04-10-2: the agreed claim drafts one client variation for the agreed amount and, with agreed days, one time extension. */
export function claimAgreeDrafts(claim: Doc): { variation: Doc; eot?: Doc } {
  const c = get("Digit Client Contract", claim["contract"]);
  const title = `Commercial claim ${claim.name}`;
  const variation: Doc = { name: `VAR-${claim.name}`, doctype: "Digit Client Variation", title, contract: claim["contract"], project: claim["project"], company: claim["company"], customer: claim["customer"], change_kind: "Client Variation",
    workflow_state: "Draft", docstatus: 0, requested_on: today(), time_days: num(claim["agreed_days"]), description: s(claim["basis"]) || title,
    lines: [{ idx: 1, line_key: "VL-1", description: `Agreed amount of commercial claim ${claim.name}`, qty: 1, rate: r2(num(claim["agreed_amount"])), amount: r2(num(claim["agreed_amount"])) }], amount: r2(num(claim["agreed_amount"])) } as Doc;
  const eot = num(claim["agreed_days"]) > 0 ? ({ name: `EOT-${claim.name}`, doctype: "Digit EOT", title, contract: claim["contract"], project: claim["project"], company: claim["company"], eot_date: today(), workflow_state: "Draft", docstatus: 0,
    requested_days: num(claim["agreed_days"]), original_completion_date: day(c?.["end_date"]), basis: `Agreed with commercial claim ${claim.name}`, costs_claimed: 1, delay_events: [] } as Doc) : undefined;
  return eot ? { variation, eot } : { variation };
}

// ---------------------------------------------------------------- FT-04-11 time extensions
/** F04-11-1: days = to − from + 1; requested = union of the excusable event periods (overlap counted once). */
export function unionDays(periods: [string, string][]): number {
  const ps = periods.filter(([a, b]) => a && b && b >= a).sort((x, y) => x[0].localeCompare(y[0]));
  let total = 0, cs = "", ce = "";
  for (const [a, b] of ps) {
    if (!cs) { cs = a; ce = b; continue; }
    if (a <= plusDays(ce, 1)) { if (b > ce) ce = b; } else { total += daysDiff(cs, ce) + 1; cs = a; ce = b; }
  }
  return cs ? total + daysDiff(cs, ce) + 1 : 0;
}
export function eotRule(doc: Doc, before: Doc | undefined): ComRes & { grant: boolean } {
  const e: string[] = [];
  const c = get("Digit Client Contract", doc["contract"]);
  const ev = idx(rows(doc, "delay_events")).map((x): Row => {
    const a = day(x["start_date"]), b = day(x["end_date"]);
    return a && b ? { ...x, days_affected: b >= a ? daysDiff(a, b) + 1 : 0 } : x;
  });
  const exc = ev.filter((x) => num(x["excusable"]) === 1);
  // records without any event marked excusable keep the requested days entered on them
  const requested = exc.length ? unionDays(exc.map((x) => [day(x["start_date"]), day(x["end_date"])])) : num(doc["requested_days"]);
  const original = day(doc["original_completion_date"]) || day(c?.["end_date"]);
  let d: Doc = { ...doc, delay_events: ev, requested_days: requested, original_completion_date: original, project: doc["project"] || c?.["project"] || "", company: doc["company"] || c?.["company"] || "" };
  // DEC-053: the contract's delay notice period (blank = no check) flags a late notice; it never blocks
  const lim = num(c?.["delay_notice_days"]); const first = ev.map((x) => day(x["start_date"])).filter(Boolean).sort()[0];
  if (lim > 0 && first && day(doc["eot_date"])) d = { ...d, notice_late: daysDiff(first, day(doc["eot_date"])) > lim ? 1 : 0 };
  if (changedTo(doc, before, "workflow_state", "Submitted")) for (const x of exc) if (!x["site_report"]) e.push(fill(COM_MSG.delayEvidence, x["idx"]));
  let grant = false;
  for (const st of ["Granted", "Partially Granted"]) if (before && changedTo(doc, before, "workflow_state", st)) {
    const g = st === "Granted" && !num(doc["granted_days"]) ? requested : num(doc["granted_days"]);
    if (g > requested) e.push(fill(COM_MSG.grantedOver, g, requested));
    else { grant = true; d = { ...d, granted_days: g, revised_completion_date: original ? plusDays(original, g) : "", decided_by: currentUser(), decided_on: today() }; }
  }
  return { doc: d, errors: e, grant };
}
/** F04-11-2: the contract end date and its completion milestone (contract milestone locked on the old completion date) move. */
export function eotGrantTargets(eot: Doc): { contract?: Doc | undefined; tasks: Doc[]; from: string; to: string } {
  const c = get("Digit Client Contract", eot["contract"]);
  const from = day(eot["original_completion_date"]), to = day(eot["revised_completion_date"]);
  const tasks = from ? all("Task", (t) => t["project"] === eot["project"] && num(t["digit_contract_milestone"]) === 1 && day(t["digit_locked_deadline"]) === from) : [];
  return { contract: c, tasks, from, to };
}

// ---------------------------------------------------------------- contract, variation, change event, claim, certificate, final account extras
/** DEC-052 default notice period; DEC-048 a contract is closed by someone other than its creator. */
export function contractExtras(doc: Doc, before: Doc | undefined, service: boolean): ComRes {
  const e: string[] = [];
  const u = currentUser();
  if (!service && changedTo(doc, before, "workflow_state", "Closed") && u !== "Administrator" && s(doc["owner"]) === u) e.push(COM_MSG.closeSelf);
  return { doc: num(doc["claim_notice_days"]) ? doc : { ...doc, claim_notice_days: CLAIM_NOTICE_DEFAULT }, errors: e };
}
/** DEC-046: reduction lines are allowed; approving a reduction waits for the value-limit policy. */
export function variationExtras(doc: Doc, before: Doc | undefined, lines: Row[]): string[] {
  return changedTo(doc, before, "workflow_state", "Approved") && lines.some((l) => num(l["amount"]) < 0) ? [COM_MSG.reduction] : [];
}
/** FVAR-3: a rejected or cancelled variation releases its change events. */
export const variationReleased = (doc: Doc, before: Doc | undefined) => !!before && (changedTo(doc, before, "workflow_state", "Rejected") || (num(doc.docstatus) === 2 && num(before.docstatus) !== 2));
export const eventsOf = (variation: string) => all("Digit Change Event", (c) => live(c) && (c["variation"] === variation || c["associated_variation"] === variation)).sort((a, b) => a.name.localeCompare(b.name));
/** FVAR-2: returning a change event under review needs a decision note. */
export const ceReturnError = (doc: Doc, before: Doc | undefined) => doc["workflow_state"] === "Priced" && before?.["workflow_state"] === "Under Review" && !s(doc["decision_note"]).trim() ? [fill("Decision Note is required ({0})", "Returned")] : [];

/** F04-13-1 / DEC-054 stored materials (checked on lines whose stored amount changed); DEC-056 no overlapping claim periods (checked when the period is set or changed). */
export function claimExtras(doc: Doc, before: Doc | undefined, contract: Doc, lines: Row[]): { lines: Row[]; errors: string[] } {
  const e: string[] = [];
  const prev = new Map(rows(before, "lines").map((l) => [s(l["sov_line_key"]), l]));
  const out = lines.map((l, i) => {
    const stored = num(l["materials_stored"]);
    const p = prev.get(s(l["sov_line_key"]));
    if (stored > 0 && (!p || num(p["materials_stored"]) !== stored || s(p["material_receipt"]) !== s(l["material_receipt"]))) {
      const pr = get("Purchase Receipt", l["material_receipt"]);
      if (num(contract["claims_stored_materials"]) !== 1) e.push(fill(COM_MSG.storedNotAllowed, i + 1));
      else if (!pr || num(pr.docstatus) !== 1) e.push(fill(COM_MSG.storedNoReceipt, i + 1));
      else {
        const v = r2(rows(pr, "items").filter((it) => s(it["project"] || pr["project"]) === s(contract["project"])).reduce((a, it) => a + num(it["amount"]), 0));
        if (stored > v + 0.005) e.push(fill(COM_MSG.storedOver, i + 1, r2(stored), v));
      }
    }
    return { ...l, total_completed_stored: r2(lineAmount(l["cumulative_qty"], l["rate"]) + stored) };
  });
  const a = day(doc["period_start"]), b = day(doc["period_end"]);
  if (a && b && (!before || day(before["period_start"]) !== a || day(before["period_end"]) !== b)) {
    const o = all("Digit Client Claim", (x) => x.name !== doc.name && x["contract"] === contract.name && live(x) && x["workflow_state"] !== "Rejected" && !!day(x["period_start"]) && !!day(x["period_end"]) && day(x["period_start"]) <= b && a <= day(x["period_end"]))
      .sort((x, y) => x.name.localeCompare(y.name))[0];
    if (o) e.push(fill(COM_MSG.periodOverlap, o.name, day(o["period_start"]), day(o["period_end"])));
  }
  return { lines: out, errors: e };
}
export const TERM_FIELDS = ["advance_amount", "advance_recovery_pct", "retention_pct", "retention_cap_pct", "payment_days"];
/** DEC-055: contract terms on a date = the contract values + approved revisions whose future effective date has arrived. */
export function effectiveTerms(c: Doc, on: string): Row {
  const t: Row = Object.fromEntries(TERM_FIELDS.map((k) => [k, c[k]]));
  for (const r of rows(c, "terms_revisions").filter((x) => x["status"] === "Approved" && num(x["applied"]) !== 1 && day(x["effective_date"]) && day(x["effective_date"]) <= day(on)).sort((x, y) => day(x["effective_date"]).localeCompare(day(y["effective_date"]))))
    t[s(r["term"])] = num(r["to_value"]);
  return t;
}
/** F04-10-3: disputed commercial claims of the contract appear as open final-account disputes (claimed / offered). */
export function finalAccountDisputes(contract: string, disputes: Row[]): Row[] {
  const have = new Set(disputes.map((x) => s(x["item"])));
  const add = all("Digit Commercial Claim", (x) => x["contract"] === contract && live(x) && x["workflow_state"] === "Disputed" && !have.has(x.name))
    .sort((x, y) => x.name.localeCompare(y.name))
    .map((x): Row => ({ item: x.name, claimed_amount: num(x["claimed_amount"]), offered_amount: num(x["offered_amount"]), status: "Open", note: s(x["title"]) || `Commercial claim ${x.name}` }));
  return idx([...disputes, ...add]);
}

// ---------------------------------------------------------------- FT-04-05 / FT-04-08 bundling and budget revision
/** F04-05-2 / FVAR-3 checks before events go into one variation. */
export function bundleProblems(events: Doc[]): string[] {
  const e: string[] = [];
  if (!events.length) return [COM_MSG.noEvents];
  for (const c of events) {
    if (c["workflow_state"] !== "Approved") e.push(fill(COM_MSG.ceNotApproved, c.name));
    else if (c["scope"] !== "Out of Scope") e.push(fill(COM_MSG.inScope, c.name));
    const vn = s(c["variation"] || c["associated_variation"]); const v = vn ? get("Digit Client Variation", vn) : undefined;
    if (v && live(v) && v["workflow_state"] !== "Rejected") e.push(fill(COM_MSG.linked, c.name, v.name));
  }
  if (new Set(events.map((c) => s(c["contract"]))).size > 1) e.push(COM_MSG.contracts);
  return e;
}
/** One variation line per event line (stable key event-line), quantity × the line's selling rate = its revenue. */
export function bundleLines(events: Doc[]): Row[] {
  const out: Row[] = [];
  for (const c of events) for (const l of rows(c, "lines")) {
    const qty = num(l["qty"]); const rev = num(l["revenue_amount"]) || num(l["amount"]);
    out.push({ line_key: `${c.name}-${s(l["line_key"])}`, sov_line_key: s(l["boq_line_key"]), description: l["description"], uom: s(l["uom"]), qty: qty || 1, rate: qty ? r2(rev / qty) : r2(rev) });
  }
  return idx(out);
}
/** F04-08-2 / DEC-045: draft budget revision of an approved variation — the cost of its change event lines per cost code. */
export function budgetRevisionDraft(v: Doc): { doc?: Doc; skipped: string[]; error?: string } {
  if (v["workflow_state"] !== "Approved") return { skipped: [], error: COM_MSG.varNotApproved };
  const b = asSystem(() => approvedBudget(s(v["project"]))); if (!b) return { skipped: [], error: COM_MSG.noBudget };
  const by = new Map<string, number>();
  for (const c of eventsOf(v.name)) for (const l of rows(c, "lines")) { const cc = s(l["cost_code"]); if (cc && num(l["cost_amount"])) by.set(cc, r2((by.get(cc) ?? 0) + num(l["cost_amount"]))); }
  if (!by.size) return { skipped: [], error: COM_MSG.noCostLines };
  const skipped: string[] = []; const deltas: Row[] = [];
  for (const [cc, amt] of [...by].sort(([a], [b]) => a.localeCompare(b))) { const bl = rows(b, "lines").find((l) => l["cost_code"] === cc || l["line_key"] === cc); if (!bl) { skipped.push(cc); continue; } deltas.push({ line_key: bl["line_key"], cost_code: cc, delta_amount: amt, reason: `Variation ${v.name}` }); }
  if (!deltas.length) return { skipped, error: COM_MSG.noCostLines };
  return { doc: { name: `BRV-${v.name}`, doctype: "Digit Budget Revision", budget: b.name, project: v["project"], company: v["company"] ?? b["company"], linked_variation: v.name, workflow_state: "Draft", docstatus: 0, reason: `Approved variation ${v.name}`, deltas: idx(deltas) } as Doc, skipped };
}

// ---------------------------------------------------------------- FT-04-09 chain (FT-04-05 stages: changes.ts eventStage)
export interface ChainNode { indent: number; doctype: string; document: string; state: string; amount: number; measure: string }
/** F04-09-2: RFI → change event → variation → budget revision, with the figure at each step. */
export function changeChain(ceName: string): ChainNode[] {
  const ce = get("Digit Change Event", ceName); if (!ce) return [];
  const out: ChainNode[] = [];
  const rfi = get("Digit RFI", ce["rfi"] || ce["source_rfi"]);
  if (rfi) out.push({ indent: 0, doctype: "Digit RFI", document: rfi.name, state: s(rfi["workflow_state"]), amount: 0, measure: `Cost impact ${s(rfi["cost_impact"]) || "—"}` });
  out.push({ indent: out.length, doctype: "Digit Change Event", document: ce.name, state: s(ce["workflow_state"]), amount: num(ce["total_cost_rom"]), measure: `Cost ROM ${r2(num(ce["total_cost_rom"]))} · Revenue ROM ${r2(num(ce["total_revenue_rom"]))}` });
  const v = get("Digit Client Variation", ce["variation"] || ce["associated_variation"]);
  if (v) {
    out.push({ indent: out.length, doctype: "Digit Client Variation", document: v.name, state: s(v["workflow_state"]), amount: num(v["amount"]), measure: `Variation ${r2(num(v["amount"]))}` });
    const br = all("Digit Budget Revision", (x) => x["linked_variation"] === v.name && live(x))[0];
    if (br) out.push({ indent: out.length, doctype: "Digit Budget Revision", document: br.name, state: s(br["workflow_state"]), amount: num(br["net_change"]), measure: `Budget change ${r2(num(br["net_change"]))}` });
  }
  return out;
}
