/**
 * DIGIT Construction controller hooks (virtual port of the proposed Python controllers' validate/on_update logic).
 * Registered on the shared adapter (registerDocHook), so the generic Desk form, the Construction screens, services and
 * tests run ONE rule set on every save. Active only while digit_construction is enabled. Server-side Frappe parity is
 * NOT claimed: the exported controllers must be implemented and staged separately (FRAPPE_EXPORT_GAPS.md).
 */
import { adapter, registerDocHook, type Doc } from "@/lib/adapter";
import { teamIssues } from "./team";
import { delegatedFor, onBehalfText } from "./teamModel";
import * as SR from "./site";
import * as TR from "./tendering";
import * as CM from "./commercial";
import * as SC from "./subcontract";
import * as CC from "./costControl";
import "./companyScope";
import { currentUser, hasPerm, userRoles } from "@/lib/session";
import { isEnabled } from "@/plugins/runtime";
import { matchTolerance, p8Missing, areaGate, billTotals, certLineProblem, certMoney, claimLineProblem, contractValues, effectiveQty, entryQuantity, estimateTotals, eac, lineAmount, lineEtc, burnDays, margin, num, r2, r3, retentionEligible, reviewProblem, sumBy, transferProblems, validityState, vac, type EtcMethod } from "./calc";
import { checkAllocation, checkReview } from "./costVerify";
import { checkLayout, checkView } from "./layouts";
import { checkArtifact } from "./print";
import { SETTINGS, settingsErrors } from "./settingsAdmin";
import { cachedMeta } from "@/lib/catalog";
import { APP, asSystem, contractPosition, costPosition, list, policyDefined, POLICY_AFFECTS, retentionAccount, rows, today } from "./data";
import { budgetCheck, budgetKey } from "./control";
import { bookingOverlaps } from "./resources";
import { applyPoChange, levelProblem, overOrderCheck, poChangeLine } from "./procControl";
import { issueCascade, issueRequestRule, lineIdentityErrors, mrOrderBy, poLevelErrors, quoteRule, receiptRule, rfqRule, stockEntryRule } from "./supply";
import * as RS from "./resourcing";
import * as FN from "./finance";
import { activationMissing, RISK_MSG, riskFigures, SCENARIO_MSG, scenarioTotals } from "./mgt";

type Row = Record<string, unknown>;
let serviceDepth = 0;
/** Service-originated writes (variations applied to the SOV, approved term revisions) may change locked contract data. */
export function asService<T>(fn: () => T): T { serviceDepth++; try { return fn(); } finally { serviceDepth--; } }
const enabled = () => isEnabled(APP);
const changedTo = (doc: Doc, before: Doc | undefined, field: string, value: string) => doc[field] === value && before?.[field] !== value;
const keyed = (rs: Row[], prefix: string): Row[] => rs.map((r, i): Row => ({ ...r, idx: i + 1, line_key: r["line_key"] || `${prefix}-${Date.now().toString(36)}-${i + 1}` }));
const sig = (rs: Row[], fields: string[]) => JSON.stringify(rs.map((r) => fields.map((f) => r[f] ?? null)));
const stamp = (doc: Doc, by: string, on: string) => ({ ...doc, [by]: currentUser(), [on]: today() });
const blocked = (key: string) => `Policy ${key} is not defined (${POLICY_AFFECTS[key]?.[0]}). Record the owner decision in Construction Settings → Policy Decisions; drafts and calculations remain available.`;
/** P2 value: the retention receivable account Finance names (must be an existing Account). */
export { retentionAccount } from "./data";
type Res = { doc: Doc; errors?: string[] | undefined; after?: ((d: Doc) => void) | undefined };
const HOOKS: Record<string, (doc: Doc, before: Doc | undefined) => Res> = {};
const on = (dt: string, h: (doc: Doc, before: Doc | undefined) => Res) => { HOOKS[dt] = h; };

/** Same computation without saving (seed/tests/preview). */
export function computeDoc(dt: string, doc: Doc, before?: Doc): Res { const h = HOOKS[dt]; return h ? h(doc, before) : { doc }; }
/** A DocType with a department rule hook (the form panel checks its values while typing). */
export const hasHook = (dt: string) => !!HOOKS[dt];

// ---------------------------------------------------------------- estimating
on("Digit Construction Rate", (doc, before) => {
  const e: string[] = [];
  if (num(doc["current_rate"]) < 0) e.push("Current Rate cannot be negative");
  let d = doc;
  if (before && num(before["current_rate"]) !== num(doc["current_rate"]) && before["current_rate"] !== undefined) {
    const hist = rows(doc, "rate_history").filter((h) => !(num(h["rate"]) === num(before["current_rate"]) && h["effective_to"] === today()));
    d = { ...doc, rate_history: [...hist, { idx: hist.length + 1, rate: num(before["current_rate"]), effective_from: before["effective_date"] ?? "", effective_to: today(), reason: "Superseded by rate change" }], effective_date: doc["effective_date"] === before["effective_date"] ? today() : doc["effective_date"] };
  }
  return { doc: d, errors: e };
});
on("Digit Assembly", (doc) => {
  // F03-08-1: labour / equipment coefficient = 1 ÷ productivity; unit rate defaults to the rate master (tendering.ts)
  const comps = TR.assemblyComponents(rows(doc, "components"));
  return { doc: { ...doc, components: comps, unit_cost: sumBy(comps, (c) => num(c["amount"])) } };
});
on("Digit Tender", (doc, before) => {
  const items = keyed(rows(doc, "items"), "TI");
  const est = doc["approved_estimate"] ? adapter.get("Digit Estimate Version", String(doc["approved_estimate"])) : undefined;
  const e: string[] = [];
  if (doc["emd_valid_until"] && doc["submission_deadline"] && String(doc["emd_valid_until"]) < String(doc["submission_deadline"])) e.push("Bid bond expires before the submission deadline");
  const g = TR.tenderRule(doc, before); // F03-02: Go / No-Go score and decision
  return { doc: { ...g.doc, items, items_count: items.length, est_cost: est ? num(est["total_cost"]) : doc["est_cost"] ?? null, est_selling: est ? num(est["total_selling"]) : doc["est_selling"] ?? null }, errors: [...e, ...g.errors] };
});
on("Digit Estimate Version", (doc, before) => {
  if (before && num(before.docstatus) === 1 && num(doc.docstatus) === 1 && sig(rows(before, "lines"), ["qty", "cost_rate", "selling_rate"]) !== sig(rows(doc, "lines"), ["qty", "cost_rate", "selling_rate"]))
    return { doc, errors: ["Approved estimate versions are frozen; create a revision from this version instead."] };
  const br = TR.estimateLines(keyed(rows(doc, "lines"), "EL"), rows(before, "lines")); // F03-10-1 resource breakdown
  const lines = br.lines.map((l): Row => ({ ...l, cost_amount: lineAmount(l["qty"], l["cost_rate"]), selling_amount: lineAmount(l["qty"], l["selling_rate"]) }));
  const t = estimateTotals(lines);
  let d: Doc = { ...doc, lines, total_cost: t.cost, total_selling: t.selling, margin_amount: t.margin, margin_pct: t.marginPct ?? 0, ...TR.contingency(doc, t.cost, t.selling) };
  const e: string[] = [...br.errors];
  if (changedTo(doc, before, "workflow_state", "Submitted")) { if (!lines.length) e.push("Add at least one estimate line before submitting"); d = { ...d, submitted_on: today() }; }
  if (changedTo(doc, before, "workflow_state", "Returned") && !String(doc["return_reason"] ?? "").trim()) e.push("Return Reason is required when returning an estimate");
  let after: Res["after"];
  if (changedTo(doc, before, "workflow_state", "Approved")) {
    if (!lines.length || lines.some((l) => !(num(l["selling_rate"]) > 0))) e.push("Every estimate line needs a selling rate before approval");
    const mErr = TR.marginError(t.marginPct ?? 0); if (mErr) e.push(mErr); // F03-14-1 margin floor (Construction Settings)
    const expired = lines.flatMap((l) => (l["assembly"] ? rows(adapter.get("Digit Assembly", String(l["assembly"])), "components") : [])).map((c) => adapter.get("Digit Construction Rate", String(c["rate"])))
      .filter((r) => r && validityState(r["valid_until"], today()) === "expired");
    // P6 (owner ruling W0-02): the Digit Director overrides an expired rate with a recorded reason
    if (expired.length && !policyDefined("P6")) e.push(`${expired.length} assembly rate(s) are expired. ${blocked("P6")}`);
    else if (expired.length && currentUser() !== "Administrator" && !userRoles(currentUser()).includes("Digit Director")) e.push(`${expired.length} assembly rate(s) are expired; only the Digit Director may approve with expired rates (policy P6)`);
    else if (expired.length && !String(doc["expired_rate_reason"] ?? "").trim()) e.push(`${expired.length} assembly rate(s) are expired; record the override reason before approval (policy P6)`);
    d = stamp(d, "approved_by", "approved_on");
    after = (x) => {
      for (const o of list("Digit Estimate Version", (v) => v["tender"] === x["tender"] && v.name !== x.name && v["workflow_state"] === "Approved")) adapter.update("Digit Estimate Version", o.name, { workflow_state: "Superseded" });
      const t0 = adapter.get("Digit Tender", String(x["tender"])); if (t0) adapter.update("Digit Tender", t0.name, { approved_estimate: x.name, est_cost: x["total_cost"], est_selling: x["total_selling"] });
    };
  }
  return { doc: d, errors: e, after };
});
on("Digit BOQ", (doc, before) => {
  const items = keyed(rows(doc, "items"), "BQ").map((l): Row => ({ ...l, amount: lineAmount(l["qty"], l["rate"]) }));
  let d: Doc = { ...doc, items, total_amount: sumBy(items, (l) => num(l["amount"])) };
  const e: string[] = [];
  if (changedTo(doc, before, "workflow_state", "Approved")) { if (!items.length) e.push("A BOQ needs at least one item before approval"); d = stamp(d, "approved_by", "approved_on"); }
  return { doc: d, errors: e };
});

// department 03 (tendering.ts): addenda, takeoff, bid packages / bids / leveling, award decisions
on("Digit Tender Addendum", (doc, before) => {
  const r = TR.addendumRule(doc, before);
  return { doc: r.doc, errors: r.errors, after: r.apply ? (x) => { const fx = TR.addendumEffects(x); if (fx.tender) adapter.update("Digit Tender", fx.tender.name, fx.tender.patch); for (const v of fx.estimates) adapter.update("Digit Estimate Version", v.name, { lines: v.lines }); } : undefined };
});
on("Digit Takeoff Sheet", (doc, before) => TR.takeoffRule(doc, before));
on("Digit Bid Package", (doc, before) => TR.bidPackageRule(doc, before));
on("Digit Subcontract Bid", (doc, before) => TR.subcontractBidRule(doc, before));
on("Digit Bid Leveling", (doc, before) => {
  const r = TR.levelingRule(doc, before);
  return { doc: r.doc, errors: r.errors, after: r.award ? (x) => {
    const wo = TR.awardWorkOrder(x); if (!wo) return;
    const name = `SWO-${x.name}`; // one work order per award (DEC-033), same name on the server twin
    if (!adapter.get("Digit Subcontract Work Order", name)) adapter.insertDoc("Digit Subcontract Work Order", { ...wo, name });
    const pkg = adapter.get("Digit Bid Package", String(x["bid_package"] ?? "")); if (pkg && pkg["status"] !== "Awarded") adapter.update("Digit Bid Package", pkg.name, { status: "Awarded" });
  } : undefined };
});
on("Digit Tender Award Decision", (doc, before) => {
  const r = TR.awardDecisionRule(doc, before);
  return { doc: r.doc, errors: r.errors, after: r.submitted ? (x) => { const t = adapter.get("Digit Tender", String(x["tender"] ?? "")); const st = TR.DECISION_STATUS[String(x["decision"])]; if (t && st && t["status"] !== st) adapter.update("Digit Tender", t.name, { status: st }); } : undefined };
});

// ---------------------------------------------------------------- client contract & claims
const TERMS = ["advance_amount", "advance_recovery_pct", "retention_pct", "retention_cap_pct", "payment_days"];
on("Digit Client Contract", (doc, before) => {
  const sov = keyed(rows(doc, "sov_lines"), "SOV").map((l): Row => ({ ...l, origin: l["origin"] || "Contract", amount: lineAmount(l["qty"], l["rate"]) }));
  const v = contractValues(sov);
  const e: string[] = [];
  const locked = before && before["workflow_state"] !== "Draft" && serviceDepth === 0;
  if (locked && sig(rows(before, "sov_lines"), ["line_key", "qty", "rate", "description"]) !== sig(sov, ["line_key", "qty", "rate", "description"])) e.push("The schedule of values of an active contract changes only through approved variations.");
  if (locked && TERMS.some((t) => num(before[t]) !== num(doc[t]))) e.push("Advance/retention terms of an active contract change only through an approved terms revision.");
  if (num(doc["retention_pct"]) < 0 || num(doc["retention_pct"]) > 100 || num(doc["advance_recovery_pct"]) < 0 || num(doc["advance_recovery_pct"]) > 100) e.push("Percentages must be between 0 and 100");
  let d: Doc = { ...doc, sov_lines: sov, original_value: v.original, approved_variations: v.variations, revised_value: v.revised, sov_version: num(doc["sov_version"]) || 1 };
  if (changedTo(doc, before, "workflow_state", "Active")) { if (!sov.length) e.push("Add the schedule of values before activating the contract"); if (!doc["customer"] || !doc["project"]) e.push("Customer and Project are required to activate"); }
  const revs = rows(doc, "terms_revisions").map((r, i): Row => ({ ...r, idx: i + 1, status: r["status"] || "Requested", requested_by: r["requested_by"] || currentUser(), from_value: r["from_value"] ?? String(doc[String(r["term"])] ?? "") }));
  d = { ...d, terms_revisions: revs };
  const cx = CM.contractExtras(d, before, serviceDepth > 0); // DEC-052 notice period default, DEC-048 close by a non-creator
  e.push(...cx.errors);
  return { doc: cx.doc, errors: e };
});
on("Digit Client Variation", (doc, before) => {
  const lines = keyed(rows(doc, "lines"), "VL").map((l): Row => ({ ...l, amount: lineAmount(l["qty"], l["rate"]) }));
  let d: Doc = { ...doc, lines, amount: sumBy(lines, (l) => num(l["amount"])) };
  const e: string[] = [];
  const c = adapter.get("Digit Client Contract", String(doc["contract"] ?? ""));
  if (changedTo(doc, before, "workflow_state", "Submitted") && !lines.length) e.push("Add variation lines before submitting");
  if (changedTo(doc, before, "workflow_state", "Rejected") && !String(doc["decision_note"] ?? "").trim()) e.push("Decision Note is required when rejecting a variation");
  e.push(...CM.variationExtras(doc, before, lines)); // DEC-046 reductions wait for the value-limit policy
  const steps: ((x: Doc) => void)[] = [];
  if (changedTo(doc, before, "workflow_state", "Approved")) {
    if (!c || c["workflow_state"] !== "Active") e.push("Variations are approved only against an active contract");
    d = stamp(d, "approved_by", "approved_on");
    if (doc["change_kind"] === "Client Variation") steps.push((x) => asService(() => {
      const ct = adapter.get("Digit Client Contract", String(x["contract"])); if (!ct || rows(ct, "sov_lines").some((s) => s["variation"] === x.name)) return; // idempotent
      const add = rows(x, "lines").map((l) => ({ line_key: `${x.name}-${l["line_key"]}`, boq_item: l["sov_line_key"] ?? "", description: l["description"], uom: l["uom"], qty: l["qty"], rate: l["rate"], origin: "Variation", variation: x.name }));
      adapter.update("Digit Client Contract", ct.name, { sov_lines: [...rows(ct, "sov_lines"), ...add], sov_version: num(ct["sov_version"]) + 1 });
    }));
    // F04-08-2 / TC-04-08-01 / DEC-045: the approved variation drafts one budget revision at the cost of its change event lines
    steps.push((x) => asService(() => { if (asSystem(() => list("Digit Budget Revision", (b) => b["linked_variation"] === x.name && num(b.docstatus) !== 2)).length) return; const r = CM.budgetRevisionDraft(x); if (r.doc) adapter.insertDoc("Digit Budget Revision", r.doc); }));
  }
  // FVAR-3: a rejected or cancelled variation releases its change events
  if (CM.variationReleased(doc, before)) steps.push((x) => asService(() => { for (const ce of CM.eventsOf(x.name)) adapter.update("Digit Change Event", ce.name, { variation: "", associated_variation: "", lines: rows(ce, "lines").map((l) => ({ ...l, variation_line_key: "" })) }); }));
  const after: Res["after"] = steps.length ? (x) => { for (const f of steps) f(x); } : undefined;
  return { doc: d, errors: e, after };
});
// ---------------------------------------------------------------- RFI & change events (FT-02-06, FT-VAR-CE, FT-04-05/06) — ported from reference_prototype
const plusDays = (d: string, n: number) => new Date(Date.parse(d) + n * 86400000).toISOString().slice(0, 10);
/** D-R12-RFI-02 default: 7 calendar days, editable; overdue never escalates automatically. */
export const RFI_DEFAULT_DAYS = 7;
const RFI_COST_SET = ["Yes", "No"];
on("Digit RFI", (doc, before) => {
  const e: string[] = [];
  const refs = rows(doc, "references").map((r, i): Row => ({ ...r, idx: i + 1 }));
  let d: Doc = { ...doc, references: refs, time_impact: doc["time_impact"] || "Not Determined" };
  if (changedTo(doc, before, "workflow_state", "Open")) {
    if (!String(doc["question"] ?? "").trim()) e.push("Write the question before sending the RFI");
    if (!doc["ball_in_court"]) e.push("Select who must answer (Ball in Court) before sending");
    const reopen = before?.["workflow_state"] === "Answered";
    const sent = reopen ? String(before?.["sent_on"] || today()) : !before && doc["sent_on"] ? String(doc["sent_on"]) : today();
    d = { ...d, sent_on: sent, due_date: doc["due_date"] || plusDays(sent, RFI_DEFAULT_DAYS), reopen_reason: reopen ? doc["reopen_reason"] : "" };
    if (reopen && !String(doc["reopen_reason"] ?? "").trim()) e.push("Reopen Reason is required when reopening an RFI");
  }
  if (changedTo(doc, before, "workflow_state", "Answered")) {
    if (!String(doc["official_response"] ?? "").trim()) e.push("Official Response is required to answer the RFI");
    if (before) d = stamp(d, "answered_by", "answered_on");
  }
  if (changedTo(doc, before, "workflow_state", "Closed")) {
    if (!RFI_COST_SET.includes(String(d["cost_impact"] ?? ""))) e.push("Set Cost Impact (Yes / No) before closing the RFI");
    if (before) d = { ...d, closed_on: today() };
  }
  if (before && ["Answered", "Closed"].includes(String(before["workflow_state"])) && doc["workflow_state"] === before["workflow_state"] && String(before["official_response"] ?? "") !== String(doc["official_response"] ?? ""))
    e.push("The official response is frozen once given; reopen the RFI to change it.");
  if (doc["due_date"] && d["sent_on"] && String(doc["due_date"]) < String(d["sent_on"])) e.push("Due Date cannot be before the date the RFI was sent");
  return { doc: d, errors: e };
});
/** Line money: revenue uses the explicit unit price, else unit cost × (1 + markup). Negative quantities are deductions (D-R12-CE-02). */
export const effectivePrice = (l: Row) => (l["unit_price"] !== undefined && l["unit_price"] !== null && l["unit_price"] !== "" && num(l["unit_price"]) !== 0 ? num(l["unit_price"]) : r2(num(l["unit_cost"]) * (1 + num(l["markup_pct"]) / 100)));
/** Priced lines (quantity × unit cost) get their cost and revenue; lump-sum lines (amount only, R19 source) stay as entered. */
export function changeLine(l: Row): Row {
  // 0 = not entered (Frappe stores numbers NOT NULL): an amount-only line (no quantity, no unit cost) keeps its amounts
  const priced = num(l["qty"]) !== 0 || num(l["unit_cost"]) !== 0;
  return priced ? { ...l, cost_amount: lineAmount(l["qty"], l["unit_cost"]), revenue_amount: lineAmount(l["qty"], effectivePrice(l)) } : l;
}
const CE_LOCK = ["line_key", "qty", "unit_cost", "unit_price", "boq_line_key", "cost_code"];
on("Digit Change Event", (doc, before) => {
  const e: string[] = [];
  const lines = keyed(rows(doc, "lines"), "CEL").map(changeLine);
  let d: Doc = { ...doc, lines, total_cost_rom: r2(sumBy(lines, (l) => num(l["cost_amount"]))), total_revenue_rom: r2(sumBy(lines, (l) => num(l["revenue_amount"]))), scope: doc["scope"] || "Not Determined" };
  const frozen = !!before && (num(before.docstatus) === 1 || before["workflow_state"] === "Approved") && serviceDepth === 0;
  if (frozen && sig(rows(before, "lines"), CE_LOCK) !== sig(lines, CE_LOCK)) e.push("Lines of an approved change event are locked (D-R14-0406-01); record a new change event instead.");
  if (doc["origin_type"] === "RFI" && doc["rfi"]) { const rfi = adapter.get("Digit RFI", String(doc["rfi"])); if (rfi && rfi["project"] !== doc["project"]) e.push("The source RFI belongs to another project"); }
  const c = adapter.get("Digit Client Contract", String(doc["contract"] ?? ""));
  if (c && doc["project"] && c["project"] !== doc["project"]) e.push("The client contract belongs to another project");
  if (changedTo(doc, before, "workflow_state", "Priced")) {
    if (!lines.length) e.push("Add at least one line before pricing");
    for (const l of lines) if (!(num(l["unit_cost"]) > 0)) e.push(`${String(l["description"] || "Line")}: unit cost is required`);
  }
  if (changedTo(doc, before, "workflow_state", "Under Review") && d["scope"] === "Not Determined") e.push("Set Scope (in scope / out of scope) before submitting for review");
  if (changedTo(doc, before, "workflow_state", "Approved")) {
    if (!c || c["workflow_state"] !== "Active") e.push("Change events are approved only against an active contract");
    if (before) d = stamp(d, "approved_by", "approved_on");
  }
  for (const st of ["Rejected", "Closed"]) if (changedTo(doc, before, "workflow_state", st) && !String(doc["decision_note"] ?? "").trim()) e.push(`Decision Note is required (${st})`);
  e.push(...CM.ceReturnError(doc, before)); // FVAR-2: returning an event under review needs a decision note
  if (before && ((num(doc.docstatus) === 2 && num(before.docstatus) !== 2) || changedTo(doc, before, "workflow_state", "Cancelled"))) {
    const vn = doc["variation"] || doc["associated_variation"];
    const v = vn ? adapter.get("Digit Client Variation", String(vn)) : undefined;
    if (v && num(v.docstatus) !== 2 && v["workflow_state"] !== "Rejected") e.push(`Cancel or reject Client Variation ${v.name} before cancelling this change event`);
  }
  return { doc: d, errors: e };
});
// FT-07-04/05 commitment change: lines priced against the open order, locked once approved, applied to the order by the system.
const POC_LOCK = ["change_type", "po_item", "item_code", "new_qty", "new_rate"];
// DEC-224 / 226 / 228: issue request lines (quantity, cost code), store of the project, returns against an issued request
on("Digit Issue Request", (doc) => ({ doc, errors: issueRequestRule(doc) }));
on("Digit PO Change", (doc, before) => {
  const e: string[] = [];
  const po = adapter.get("Purchase Order", String(doc["purchase_order"] ?? ""));
  const lines = rows(doc, "lines").map((l, i): Row => ({ ...poChangeLine(po, l), idx: i + 1 }));
  const change = r2(sumBy(lines, (l) => num(l["amount_change"])));
  let d: Doc = { ...doc, lines, supplier: po?.["supplier"] ?? "", old_total: num(po?.["net_total"]), total_change: change, new_total: r2(num(po?.["net_total"]) + change) };
  const frozen = !!before && (num(before.docstatus) === 1 || before["workflow_state"] === "Approved") && serviceDepth === 0;
  if (frozen) {
    if (sig(rows(before, "lines"), POC_LOCK) !== sig(lines, POC_LOCK)) e.push("Lines of an approved PO change are locked; raise a new PO change.");
    return { doc: { ...d, old_total: before["old_total"], total_change: before["total_change"], new_total: before["new_total"] }, errors: e };
  }
  if (!po || num(po.docstatus) !== 1) e.push("A PO change needs a submitted Purchase Order");
  else {
    if (["Closed", "Completed", "Cancelled"].includes(String(po["status"]))) e.push(`Purchase Order ${po.name} is ${String(po["status"])}; it can no longer be changed`);
    if (!rows(po, "items").some((i) => String(i["project"] || po["project"] || "") === doc["project"])) e.push("The Purchase Order has no line on this project");
  }
  for (const l of lines) {
    const nm = String(l["item_code"] || "Line");
    if (num(l["new_qty"]) < 0 || num(l["new_rate"]) < 0) e.push(`${nm}: quantity and rate cannot be negative`);
    if (l["change_type"] === "Update") {
      const cur = rows(po, "items").find((r) => r["name"] === l["po_item"]);
      if (!cur) e.push(`${nm}: PO line ${String(l["po_item"] ?? "")} is not on ${String(doc["purchase_order"] ?? "")}`);
      else if (num(l["new_qty"]) < num(cur["received_qty"])) e.push(`${nm}: new quantity ${num(l["new_qty"])} is below the received quantity ${num(cur["received_qty"])}`);
    } else if (!String(l["cost_code"] ?? "").trim()) e.push(`${nm}: a new line needs a cost code`);
  }
  e.push(...lineIdentityErrors(po, lines));
  if (changedTo(doc, before, "workflow_state", "Under Review") && !lines.length) e.push("Add at least one line before review");
  if (changedTo(doc, before, "workflow_state", "Rejected") && !String(doc["decision_note"] ?? "").trim()) e.push("Decision Note is required (Rejected)");
  if (changedTo(doc, before, "workflow_state", "Approved") && po) {
    const by = new Map<string, number>();
    for (const l of lines) { const cc = String(l["cost_code"] ?? ""); if (cc && num(l["amount_change"]) > 0) by.set(cc, r2((by.get(cc) ?? 0) + num(l["amount_change"]))); }
    for (const r of budgetCheck(String(doc["project"]), by)) if (r.status === "Block") e.push(`Budget line ${r.cost_code}: committed + actual would reach ${r.after} against a limit of ${r.limit}.`);
    // F07-05-2 / DEC-187: the approver holds the approval level of the new order total
    if (num(d["total_change"]) > 0) { const lp = levelProblem(num(d["new_total"]), currentUser()); if (lp) e.push(lp); }
    if (before) d = { ...stamp(d, "approved_by", "approved_on"), applied: 1 };
    if (!e.length && before) return { doc: d, errors: e, after: (x) => asService(() => applyPoChange(x)) };
  }
  return { doc: d, errors: e };
});
/** Previous cumulative qty per SOV line from earlier claims that left Draft (Submitted/Certified/Partly Certified). */
function previousClaimed(contract: string, claimNo: number, except: string) {
  const prev = list("Digit Client Claim", (c) => c["contract"] === contract && c.name !== except && num(c["claim_no"]) < claimNo && ["Submitted", "Certified", "Partly Certified"].includes(String(c["workflow_state"])));
  const m = new Map<string, number>();
  for (const c of prev) for (const l of rows(c, "lines")) m.set(String(l["sov_line_key"]), Math.max(m.get(String(l["sov_line_key"])) ?? 0, num(l["cumulative_qty"])));
  return m;
}
on("Digit Client Claim", (doc, before) => {
  const c = adapter.get("Digit Client Contract", String(doc["contract"] ?? ""));
  if (!c) return { doc, errors: ["Select a client contract"] };
  const e: string[] = [];
  if (c["workflow_state"] !== "Active" && !before) e.push("Claims are raised only against an active contract");
  const claimNo = num(doc["claim_no"]) || list("Digit Client Claim", (x) => x["contract"] === c.name && x.name !== doc.name).length + 1;
  if (num(doc.docstatus) === 1 && before && num(before.docstatus) === 1) return { doc: { ...doc, claim_no: claimNo } }; // submitted claims keep their figures
  const prev = previousClaimed(c.name, claimNo, doc.name);
  const sov = rows(c, "sov_lines");
  const base: Row[] = rows(doc, "lines").length ? rows(doc, "lines") : sov.map((s) => ({ sov_line_key: s["line_key"], cumulative_qty: prev.get(String(s["line_key"])) ?? 0 }));
  const lines = base.map((l, i) => {
    const s = sov.find((x) => x["line_key"] === l["sov_line_key"]);
    const previous = prev.get(String(l["sov_line_key"])) ?? 0, cum = num(l["cumulative_qty"]);
    const row: Row & { description: unknown; contract_qty: number } = { ...l, idx: i + 1, description: s?.["description"] ?? l["description"], uom: s?.["uom"] ?? l["uom"], contract_qty: num(s?.["qty"]), rate: num(s?.["rate"]), previous_qty: previous, this_period_qty: r3(cum - previous), amount: lineAmount(r3(cum - previous), s?.["rate"]) };
    if (!s) e.push(`Row #${i + 1}: SOV line ${String(l["sov_line_key"])} is not in contract ${c.name}`);
    const p = claimLineProblem(row);
    const label = String(row.description ?? "") || String(l["sov_line_key"] ?? ""); // a line not in the contract has no description
    if (p === "below_previous") e.push(`Row #${i + 1} ${label}: cumulative quantity cannot be below the previously claimed ${previous}`);
    if (p === "exceeds_contract") e.push(`Row #${i + 1} ${label}: cumulative quantity exceeds the contract quantity ${row.contract_qty}`);
    return row;
  });
  const cx = CM.claimExtras(doc, before, c, lines); // F04-13-1 stored materials, DEC-056 claim periods
  e.push(...cx.errors);
  const d: Doc = { ...doc, claim_no: claimNo, project: doc["project"] || c["project"], customer: doc["customer"] || c["customer"], company: doc["company"] || c["company"], lines: cx.lines,
    gross_to_date: sumBy(lines, (l) => lineAmount(l["cumulative_qty"], l["rate"])), previous_claimed: sumBy(lines, (l) => lineAmount(l["previous_qty"], l["rate"])), this_claim: sumBy(lines, (l) => num(l["amount"])) };
  if (changedTo(doc, before, "workflow_state", "Submitted") && !(num(d["this_claim"]) > 0)) e.push("A claim needs a positive amount for this period before submission");
  return { doc: d, errors: e };
});
on("Digit Client Certificate", (doc, before) => {
  const claim = adapter.get("Digit Client Claim", String(doc["claim"] ?? ""));
  if (!claim) return { doc, errors: ["Select a submitted client claim"] };
  const c = adapter.get("Digit Client Contract", String(claim["contract"]));
  if (!c) return { doc, errors: ["The claim's contract was not found"] };
  if (num(doc.docstatus) === 2 && doc["sales_invoice"] && num(adapter.get("Sales Invoice", String(doc["sales_invoice"]))?.docstatus) === 1)
    return { doc, errors: [`Cancel Sales Invoice ${String(doc["sales_invoice"])} before cancelling this certificate`] };
  let after: Res["after"];
  if (num(doc.docstatus) === 2 && before && num(before.docstatus) !== 2) after = (x) => { const cl = adapter.get("Digit Client Claim", String(x["claim"])); if (cl) adapter.update("Digit Client Claim", cl.name, { workflow_state: "Submitted" }); };
  if (doc["approved_snapshot"] || num(doc.docstatus) >= 1) return { doc: { ...doc, workflow_state: num(doc.docstatus) === 2 ? "Cancelled" : doc["workflow_state"] }, after }; // frozen once confirmed
  const e: string[] = [];
  if (!before && !["Submitted"].includes(String(claim["workflow_state"]))) e.push("Certificates are created only from a submitted claim");
  const sov = rows(c, "sov_lines");
  const base: Row[] = rows(doc, "lines").length ? rows(doc, "lines") : rows(claim, "lines").filter((l) => num(l["this_period_qty"]) !== 0).map((l) => ({ sov_line_key: l["sov_line_key"], accepted_qty: l["this_period_qty"], rejected_qty: 0, disputed_qty: 0 }));
  const lines = base.map((l, i) => {
    const cl = rows(claim, "lines").find((x) => x["sov_line_key"] === l["sov_line_key"]); const s = sov.find((x) => x["line_key"] === l["sov_line_key"]);
    const row = { ...l, idx: i + 1, description: s?.["description"] ?? "", claimed_qty: num(cl?.["this_period_qty"]), rate: num(s?.["rate"]), amount: lineAmount(l["accepted_qty"], s?.["rate"]) };
    const p = certLineProblem(row);
    if (p === "negative") e.push(`Row #${i + 1}: quantities cannot be negative`);
    if (p === "reconcile") e.push(`Row #${i + 1} ${String(row.description)}: accepted + rejected + disputed must equal the claimed ${row.claimed_qty}`);
    if (p === "reason") e.push(`Row #${i + 1} ${String(row.description)}: a reason is required for rejected or disputed quantity`);
    return row;
  });
  const gross = sumBy(lines, (l) => num(l["amount"]));
  const prior = list("Digit Client Certificate", (x) => x["contract"] === c.name && x.name !== doc.name && num(x.docstatus) === 1).sort((a, b) => String(a["cert_date"]).localeCompare(String(b["cert_date"]))).map((x) => ({ gross: num(x["gross_this"]) }));
  const tm = CM.effectiveTerms(c, String(doc["cert_date"] || today()).slice(0, 10)); // DEC-055: approved revisions whose effective date has arrived
  const m = certMoney({ advance_amount: num(tm["advance_amount"]), advance_recovery_pct: num(tm["advance_recovery_pct"]), retention_pct: num(tm["retention_pct"]), retention_cap_pct: num(tm["retention_cap_pct"]), revised_value: num(c["revised_value"]) }, gross, prior, num(doc["other_deductions"]));
  let d: Doc = { ...doc, contract: c.name, project: claim["project"], customer: claim["customer"], company: claim["company"], lines, gross_this: m.gross, gross_previous: m.previousGross, gross_cumulative: m.cumulativeGross, advance_recovery: m.recovery, retention: m.retention, net_certified: m.net };
  if (changedTo(doc, before, "workflow_state", "Confirmed")) {
    if (!(gross > 0)) e.push("A certificate needs a positive accepted amount before confirmation");
    d = { ...d, reviewer: d["reviewer"] || currentUser(), approved_snapshot: JSON.stringify({ at: today(), by: currentUser(), gross: m.gross, recovery: m.recovery, retention: m.retention, other: m.other, net: m.net, terms: TERMS.map((t) => [t, tm[t]]) }) };
    after = (x) => { const cl = adapter.get("Digit Client Claim", String(x["claim"])); if (cl) adapter.update("Digit Client Claim", cl.name, { workflow_state: rows(x, "lines").some((l) => num(l["rejected_qty"]) + num(l["disputed_qty"]) > 0) ? "Partly Certified" : "Certified" }); };
  }
  return { doc: d, errors: e, after };
});

// ---------------------------------------------------------------- department 04 commercial (domain/commercial.ts)
on("Digit Change RFQ", (doc, before) => {
  const r = CM.changeRfqRule(doc, before);
  // F04-07-1: the accepted quote reprices the change event lines and ties them to the work order
  return { doc: r.doc, errors: r.errors, after: r.accept ? (x) => asService(() => { const l = CM.rfqAcceptPatch(x); if (l) adapter.update("Digit Change Event", String(x["change_event"]), { lines: l }); }) : undefined };
});
on("Digit Commercial Claim", (doc, before) => {
  const r = CM.commercialClaimRule(doc, before);
  const steps: ((x: Doc) => void)[] = [];
  // F04-10-2: agreement drafts one client variation (agreed amount) and, with agreed days, one time extension
  if (r.agree) steps.push((x) => asService(() => {
    const dr = CM.claimAgreeDrafts(x); const patch: Row = {};
    if (!adapter.get("Digit Client Variation", dr.variation.name)) adapter.insertDoc("Digit Client Variation", dr.variation);
    if (x["associated_variation"] !== dr.variation.name) patch["associated_variation"] = dr.variation.name;
    if (dr.eot) { if (!adapter.get("Digit EOT", dr.eot.name)) adapter.insertDoc("Digit EOT", dr.eot); if (x["eot"] !== dr.eot.name) patch["eot"] = dr.eot.name; }
    if (Object.keys(patch).length) adapter.update("Digit Commercial Claim", x.name, patch);
  }));
  // F04-10-3: a disputed claim is carried into the contract's open final account
  if (changedTo(doc, before, "workflow_state", "Disputed")) steps.push((x) => asService(() => {
    const fa = asSystem(() => list("Digit Final Account", (f) => f["contract"] === x["contract"] && num(f.docstatus) === 0))[0]; if (!fa) return;
    adapter.update("Digit Final Account", fa.name, {});
    if (x["dispute_transfer_fa"] !== fa.name) adapter.update("Digit Commercial Claim", x.name, { dispute_transfer_fa: fa.name });
  }));
  return { doc: r.doc, errors: r.errors, after: steps.length ? (x) => { for (const f of steps) f(x); } : undefined };
});
on("Digit EOT", (doc, before) => {
  const r = CM.eotRule(doc, before);
  // F04-11-2: the grant moves the contract end date and its completion milestone
  return { doc: r.doc, errors: r.errors, after: r.grant ? (x) => asService(() => {
    const g = CM.eotGrantTargets(x); if (!g.to) return;
    if (g.contract && String(g.contract["end_date"] ?? "").slice(0, 10) !== g.to) adapter.update("Digit Client Contract", g.contract.name, { end_date: g.to });
    for (const t of g.tasks) adapter.update("Task", t.name, { digit_locked_deadline: g.to });
  }) : undefined };
});

// ---------------------------------------------------------------- subcontracting
on("Digit Subcontractor Profile", (doc, before) => {
  const pr = SC.profileRule(doc); // F05-01-1 compliance status from the compliance documents
  const e: string[] = [...pr.errors]; let d = pr.doc;
  if (changedTo(doc, before, "workflow_state", "Approved")) {
    if (!policyDefined("P8")) e.push(blocked("P8"));
    else for (const m of p8Missing(doc, rows(doc, "compliance_documents"), today())) e.push(`The subcontractor approval checklist (policy P8) is missing the ${m}`);
    d = { ...d, approved_by: currentUser() };
  }
  return { doc: d, errors: e };
});
on("Digit Subcontract Work Order", (doc, before) => {
  const lines = keyed(rows(doc, "lines"), "WL").map((l): Row => ({ ...l, amount: lineAmount(l["qty"], l["rate"]) }));
  const profile = list("Digit Subcontractor Profile", (p) => p["supplier"] === doc["subcontractor"])[0];
  const e: string[] = [];
  if (changedTo(doc, before, "workflow_state", "Active") && !lines.length) e.push("Add schedule-of-values lines before activating the work order");
  if (num(doc["retention_percent"]) < 0 || num(doc["retention_percent"]) > 100) e.push("Retention % must be between 0 and 100");
  const d: Doc = { ...doc, lines, total_value: sumBy(lines, (l) => num(l["amount"])), profile: profile?.name ?? doc["profile"] ?? "" };
  e.push(...SC.workOrderExtras(d, before, serviceDepth > 0)); // F05-01-2 compliance / value limit, F05-02-1 budget, F05-04-1 line lock
  return { doc: d, errors: e };
});
/** Certified quantity per work-order line across certified books (excluding one book). */
export function certifiedToDate(wo: string, except?: string) {
  const m = new Map<string, number>();
  for (const b of list("Digit Measurement Book", (x) => x["work_order"] === wo && x.name !== except && x["workflow_state"] === "Certified"))
    for (const e of rows(b, "entries")) m.set(String(e["wo_line_key"]), r3((m.get(String(e["wo_line_key"])) ?? 0) + effectiveQty(e)));
  return m;
}
on("Digit Measurement Book", (doc, before) => {
  const wo = adapter.get("Digit Subcontract Work Order", String(doc["work_order"] ?? ""));
  if (!wo) return { doc, errors: ["Select a work order"] };
  if (num(doc.docstatus) === 1 && before && num(before.docstatus) === 1) return { doc };
  const e: string[] = [];
  if (!before && wo["workflow_state"] !== "Active") e.push("Measurements are recorded only against an active work order");
  const certifying = changedTo(doc, before, "workflow_state", "Certified");
  const wl = rows(wo, "lines");
  const entries = rows(doc, "entries").map((x, i) => {
    const q = entryQuantity(x);
    let r: Row = { ...x, idx: i + 1, quantity: q, description: x["description"] || wl.find((l) => l["line_key"] === x["wo_line_key"])?.["scope"] || "" };
    if (!wl.some((l) => l["line_key"] === x["wo_line_key"])) e.push(`Row #${i + 1}: ${String(x["wo_line_key"] ?? "")} is not a line of work order ${wo.name}`);
    if (certifying && (x["accepted_qty"] === undefined || x["accepted_qty"] === null || x["accepted_qty"] === "")) r = { ...r, accepted_qty: Math.abs(q), rejected_qty: num(x["rejected_qty"]) };
    if (certifying || x["accepted_qty"] !== undefined && x["accepted_qty"] !== null && x["accepted_qty"] !== "") {
      const p = reviewProblem(q, num(r["accepted_qty"]), num(r["rejected_qty"]), r["reject_reason"]);
      if (p === "negative") e.push(`Row #${i + 1}: accepted/rejected quantities cannot be negative`);
      if (p === "reconcile") e.push(`Row #${i + 1}: accepted + rejected must equal the measured ${Math.abs(q)}`);
      if (p === "reason") e.push(`Row #${i + 1}: a reject reason is required for rejected quantity`);
    }
    return r;
  });
  if (certifying) {
    const done = certifiedToDate(wo.name, doc.name);
    for (const l of wl) {
      const add = sumBy(entries.filter((x) => x["wo_line_key"] === l["line_key"]), (x) => effectiveQty(x));
      const total = r3((done.get(String(l["line_key"])) ?? 0) + add);
      if (total > num(l["qty"]) + 1e-9) e.push(`${String(l["scope"])}: certified quantity ${total} would exceed the work-order quantity ${num(l["qty"])} (remaining ${r3(num(l["qty"]) - (done.get(String(l["line_key"])) ?? 0))})`);
    }
    if (!entries.length) e.push("A measurement book needs at least one entry before certification");
  }
  if (changedTo(doc, before, "workflow_state", "Returned") && !String(doc["return_reason"] ?? "").trim()) e.push("Return Reason is required when returning a measurement book");
  const ev = SC.evidenceRule(entries, rows(before, "entries")); e.push(...ev.errors); entries.splice(0, entries.length, ...ev.entries); // DEC-069
  const rate = (k: unknown) => num(wl.find((l) => l["line_key"] === k)?.["rate"]);
  let d: Doc = { ...doc, project: doc["project"] || wo["project"], subcontractor: doc["subcontractor"] || wo["subcontractor"], company: doc["company"] || wo["company"], entries,
    measured_total: r3(entries.reduce((s, x) => s + num(x["quantity"]), 0)), accepted_value: sumBy(entries, (x) => lineAmount(effectiveQty(x), rate(x["wo_line_key"]))) };
  if (certifying) d = { ...d, reviewed_by: currentUser() };
  return { doc: d, errors: e };
});
on("Digit Subcontractor Bill", (doc, before) => {
  const wo = adapter.get("Digit Subcontract Work Order", String(doc["work_order"] ?? ""));
  if (!wo) return { doc, errors: ["Select a work order"] };
  if (num(doc.docstatus) === 2 && doc["purchase_invoice"] && num(adapter.get("Purchase Invoice", String(doc["purchase_invoice"]))?.docstatus) === 1) return { doc, errors: [`Cancel Purchase Invoice ${String(doc["purchase_invoice"])} before cancelling this bill`] };
  const bcWrites = (x: Doc, approved: boolean) => asService(() => { for (const w of SC.billBackChargeWrites(x, approved)) adapter.update("Digit Back Charge", w.name, w.patch); });
  if (num(doc.docstatus) >= 1 && before && num(before.docstatus) >= 1)
    return { doc: { ...doc, workflow_state: num(doc.docstatus) === 2 ? "Cancelled" : doc["workflow_state"] }, after: num(doc.docstatus) === 2 && num(before.docstatus) === 1 ? (x) => bcWrites(x, false) : undefined };
  const e: string[] = [];
  const prior = list("Digit Subcontractor Bill", (b) => b["work_order"] === wo.name && b.name !== doc.name && num(b.docstatus) === 1);
  const prevQty = (k: unknown) => sumBy(prior.flatMap((b) => rows(b, "lines")).filter((l) => l["wo_line_key"] === k), (l) => num(l["this_period_qty"]));
  const certified = certifiedToDate(wo.name);
  const wl = rows(wo, "lines");
  const base = rows(doc, "lines").length ? rows(doc, "lines") : wl.map((l) => ({ wo_line_key: l["line_key"], this_period_qty: r3(Math.max(0, (certified.get(String(l["line_key"])) ?? 0) - prevQty(l["line_key"]))) })).filter((l) => num(l.this_period_qty) > 0);
  const lines = base.map((l, i) => {
    const w = wl.find((x) => x["line_key"] === l["wo_line_key"]); const prev = prevQty(l["wo_line_key"]); const cum = r3(prev + num(l["this_period_qty"]));
    if (!w) e.push(`Row #${i + 1}: ${String(l["wo_line_key"])} is not a line of ${wo.name}`);
    if (num(l["this_period_qty"]) < 0) e.push(`Row #${i + 1}: this period quantity cannot be negative`);
    const cert = certified.get(String(l["wo_line_key"])) ?? 0;
    if (cum > cert + 1e-9) e.push(`Row #${i + 1} ${String(w?.["scope"] ?? "")}: billed to date ${cum} exceeds the certified measurement ${cert}`);
    return { ...l, idx: i + 1, scope: w?.["scope"] ?? "", uom: w?.["uom"] ?? "", rate: num(w?.["rate"]), previous_qty: prev, cumulative_qty: cum, amount: lineAmount(l["this_period_qty"], w?.["rate"]) };
  });
  const priorRecovered = sumBy(prior, (b) => num(b["advance_recovery"]));
  // F05-08-1 agreed back charges deducted once, F05-07-1 balance to finish, DEC-071 expected payment date
  const bx = SC.billExtras(doc, wo, sumBy(prior, (b) => num(b["gross_amount"])), sumBy(lines, (l) => num(l["amount"])));
  const t = billTotals({ gross: sumBy(lines, (l) => num(l["amount"])), retentionPct: num(wo["retention_percent"]), advanceAmount: num(wo["advance_amount"]), advanceRecoveryPct: num(wo["advance_recovery_pct"]), priorRecovered, other: num(doc["other_deductions"]) + bx.back_charge_amount });
  const inv = String(doc["supplier_invoice_no"] ?? "").trim();
  if (inv && list("Digit Subcontractor Bill", (b) => b.name !== doc.name && b["subcontractor"] === (doc["subcontractor"] || wo["subcontractor"]) && String(b["supplier_invoice_no"] ?? "").trim() === inv && num(b.docstatus) !== 2).length)
    e.push(`Supplier invoice ${inv} is already used on another bill of this subcontractor (duplicate bill)`);
  if (changedTo(doc, before, "workflow_state", "Approved") && !(t.gross > 0)) e.push("A bill needs a positive gross amount before approval");
  return { doc: { ...doc, subcontractor: doc["subcontractor"] || wo["subcontractor"], project: doc["project"] || wo["project"], company: doc["company"] || wo["company"], ra_no: num(doc["ra_no"]) || prior.length + 1, lines,
    gross_amount: t.gross, retention_amount: t.retention, advance_recovery: t.advance, net_amount: t.net, back_charge_amount: bx.back_charge_amount, balance_to_finish: bx.balance_to_finish, expected_payment_date: bx.expected_payment_date }, errors: e,
    after: num(doc.docstatus) === 1 && num(before?.docstatus) !== 1 && !e.length ? (x) => bcWrites(x, true) : undefined };
});
// department 05 (subcontract.ts): subcontract changes, back charges, final account, retention release
on("Digit Subcontract Change", (doc, before) => {
  const r = SC.changeRule(doc, before);
  return { doc: r.doc, errors: r.errors, after: r.apply ? (x) => asService(() => { const t = SC.changeTargets(x); if (t) adapter.update("Digit Subcontract Work Order", t.wo, t.patch); }) : undefined };
});
on("Digit Back Charge", (doc, before) => SC.backChargeRule(doc, before, serviceDepth > 0));
on("Digit Subcontract Final Account", (doc, before) => {
  const r = SC.finalAccountRule(doc, before);
  return { doc: r.doc, errors: r.errors, after: r.close ? (x) => asService(() => { const w = adapter.get("Digit Subcontract Work Order", String(x["work_order"] ?? "")); if (w && w["workflow_state"] === "Active") adapter.update("Digit Subcontract Work Order", w.name, { workflow_state: "Completed" }); }) : undefined };
});
on("Digit Subcontract Retention Release Request", (doc, before) => {
  const r = SC.subRetentionRule(doc, before, String(adapter.get(SETTINGS, SETTINGS)?.["retention_payable_account"] ?? ""));
  if (changedTo(doc, before, "workflow_state", "Approved") && !policyDefined("P2")) return { doc: r.doc, errors: [blocked("P2"), ...r.errors.filter((m) => m !== SC.SUB_MSG.srrAccount)] };
  return r;
});

// ---------------------------------------------------------------- cost control
on("Digit Project Cost Budget", (doc, before) => {
  if (before && num(before.docstatus) === 1 && sig(rows(before, "lines"), ["original_amount"]) !== sig(rows(doc, "lines"), ["original_amount"])) return { doc, errors: ["An approved budget is immutable; record changes as a Budget Revision or Transfer."] };
  const lines = keyed(rows(doc, "lines"), "BL"); const e: string[] = [];
  // owner ruling: lines are cost code × category (no code suffix), so the pair is unique, not the code alone
  const codes = lines.map((l) => String(l["cost_code"])); const pairs = lines.map((l) => `${String(l["cost_code"])}|${String(l["category"] ?? "")}`);
  if (new Set(pairs).size !== pairs.length) e.push("Each cost code and category may appear only once in a budget");
  // DEC-031: a newly picked code the cost-code master has retired is refused (site.ts retiredCodeErrors)
  const had = new Set(rows(before, "lines").map((l) => String(l["cost_code"]))); e.push(...SR.retiredCodeErrors(codes.filter((c) => !had.has(c))));
  let d: Doc = { ...doc, lines, total_original: sumBy(lines, (l) => num(l["original_amount"])) };
  // F06-01-1 codes against the master, DEC-156 pay-item links (costControl.ts budgetExtras)
  const bx = CC.budgetExtras(d, before, serviceDepth > 0); d = bx.doc; e.push(...bx.errors);
  let after: Res["after"];
  if (changedTo(doc, before, "workflow_state", "Approved")) {
    if (!lines.length) e.push("A budget needs lines before approval");
    // DEC-099 / DEC-151 (owner ruling): the Project Manager approves up to the Finance cap; empty cap = the Director approves every budget
    e.push(...CC.budgetCapErrors(num(d["total_original"]), currentUser(), userRoles(currentUser()), adapter.get(SETTINGS, SETTINGS)?.["budget_pm_approval_cap"]));
    d = stamp(d, "approved_by", "approved_on");
    after = (x) => { for (const o of list("Digit Project Cost Budget", (b) => b["project"] === x["project"] && b.name !== x.name && b["workflow_state"] === "Approved")) adapter.update("Digit Project Cost Budget", o.name, { workflow_state: "Superseded" }); };
  }
  return { doc: d, errors: e, after };
});
on("Digit Budget Revision", (doc, before) => {
  const b = adapter.get("Digit Project Cost Budget", String(doc["budget"] ?? ""));
  const e: string[] = []; if (!b) return { doc, errors: ["Select a budget"] };
  if (num(b.docstatus) !== 1) e.push("Revisions apply only to an approved budget");
  const bl = rows(b, "lines");
  const deltas = rows(doc, "deltas").map((x, i): Row => { const l = bl.find((y) => y["line_key"] === x["line_key"] || y["cost_code"] === x["line_key"]); if (!l) e.push(`Row #${i + 1}: ${String(x["line_key"])} is not a line of ${b.name}`); return { ...x, idx: i + 1, line_key: l?.["line_key"] ?? x["line_key"], cost_code: l?.["cost_code"] ?? "" }; });
  let d: Doc = { ...doc, project: b["project"], deltas, net_change: sumBy(deltas, (x) => num(x["delta_amount"])) };
  if (changedTo(doc, before, "workflow_state", "Approved")) d = stamp(d, "approved_by", "approved_on");
  return { doc: d, errors: e };
});
on("Digit Budget Transfer", (doc, before) => {
  const b = adapter.get("Digit Project Cost Budget", String(doc["budget"] ?? ""));
  if (!b) return { doc, errors: ["Select a budget"] };
  if (num(doc.docstatus) >= 1 && before && num(before.docstatus) >= 1) return { doc };
  const bl = rows(b, "lines");
  const resolve = (k: unknown) => String(bl.find((y) => y["line_key"] === k || y["cost_code"] === k)?.["line_key"] ?? k ?? "");
  const d: Doc = { ...doc, project: b["project"], from_line: resolve(doc["from_line"]), to_line: resolve(doc["to_line"]) };
  const pos = costPosition(String(b["project"])).lines.find((l) => l.line_key === d["from_line"]);
  const available = pos ? r2(pos.revised - pos.committed - pos.actual) : 0;
  const e = transferProblems({ from_line: String(d["from_line"]), to_line: String(d["to_line"]), amount: num(d["amount"]) }, bl.map((l) => String(l["line_key"])), available);
  const ct = TR.contingencyTransfer(d, bl.find((l) => l["line_key"] === d["from_line"]), available); // F03-13-2 contingency drawdown
  e.push(...ct.errors);
  const d2: Doc = ct.balance === undefined ? d : { ...d, contingency_balance: ct.balance };
  return { doc: changedTo(doc, before, "workflow_state", "Approved") ? { ...d2, approved_by: currentUser() } : d2, errors: e };
});
// submitted / cancelled allocations and reviews are immutable (cancel restores the source attribution / reopens the exception)
on("Digit Actual Cost Attribution", (doc, before) => CC.attributionRule(doc, before)); // DEC-117
on("Digit Cost Allocation", (doc, before) => {
  if (before && num(before.docstatus) >= 1) return { doc };
  const r = checkAllocation(doc);
  // DEC-124: only an accountant, project manager or director submits an allocation, so a QS-authored draft is approved by another person
  const u = currentUser();
  if (num(doc.docstatus) === 1 && u !== "Administrator" && !userRoles(u).some((x) => CC.ALLOC_APPROVERS.includes(x))) return { doc: r.doc, errors: [...r.errors, CC.fill(CC.COST_MSG.allocSelf, u)] };
  return r;
});
on("Digit Cost Exception Review", (doc, before) => (before && num(before.docstatus) >= 1 ? { doc } : checkReview(doc)));
// FIN-05: dashboard layouts (known items, one record per level target, defaults by System Manager / Director) and personal saved report views
on("Digit Dashboard Layout", (doc) => { const lv = doc["level"]; const d = { ...doc, for_user: lv === "User" ? doc["for_user"] || doc["owner"] || currentUser() : "", for_role: lv === "Role" ? doc["for_role"] ?? "" : "", for_company: lv === "Company" ? doc["for_company"] ?? "" : "" }; return { doc: d, errors: checkLayout(d) }; });
on("Digit Saved View", (doc, before) => checkView(doc, before));
on("Digit Cost Forecast Snapshot", (doc, before) => {
  if (num(doc.docstatus) === 1 && before && num(before.docstatus) === 1) return { doc };
  const project = String(doc["project"] ?? ""); if (!project) return { doc, errors: ["Select a project"] };
  const pos = costPosition(project, String(doc["cutoff_date"] || today()));
  const prev = rows(doc, "lines");
  const pj = adapter.get("Project", project); const projStart = pj?.["actual_start_date"] || pj?.["expected_start_date"] || "";
  const lines = pos.lines.map((l, i) => {
    const p = prev.find((x) => x["line_key"] === l.line_key) ?? {};
    const method = (p["method"] as EtcMethod) || "Budget Remaining";
    const etc = lineEtc(method, { revised: l.revised, committed: l.committed, actual: l.actual, uncommitted: p["uncommitted_remaining"], manual: p["manual_etc"], qtyBudget: p["qty_budget"], qtyInstalled: p["qty_installed"], unitRate: p["unit_rate"],
      pctComplete: p["pct_complete"], burn: burnDays(projStart, doc["cutoff_date"] || today(), p["planned_finish"]) });
    const e = eac(l.actual, etc);
    return { ...p, idx: i + 1, line_key: l.line_key, cost_code: l.cost_code, revised_budget: l.revised, committed: l.committed, actual: l.actual, method, etc, eac: e, variance: vac(l.revised, e), confidence: p["confidence"] || "Medium" };
  });
  const known = lines.every((l) => l.etc !== null);
  const unalloc = sumBy(pos.unallocated, (u) => u.committed + u.actual);
  const totalEac = known ? r2(sumBy(lines, (l) => num(l.eac)) + unalloc) : null;
  const m = margin(pos.revenue, totalEac);
  const e: string[] = CC.forecastErrors({ ...doc, lines });
  if (!pos.budget) e.push("The project has no approved budget; approve a budget before forecasting");
  if (changedTo(doc, before, "workflow_state", "Approved") && !known) e.push("Every forecast line needs an ETC (manual or uncommitted estimate) before approval");
  const version = num(doc["version"]) || list("Digit Cost Forecast Snapshot", (f) => f["project"] === project && f.name !== doc.name).length + 1;
  let d: Doc = { ...doc, budget: pos.budget?.name ?? doc["budget"], version, lines, total_revised: pos.revised, total_committed: pos.committed, total_actual: pos.actual,
    total_etc: known ? r2(sumBy(lines, (l) => num(l.etc)) + sumBy(pos.unallocated, (u) => u.committed)) : null, total_eac: totalEac, total_variance: totalEac === null ? null : r2(pos.revised - totalEac), contract_revenue: pos.revenue, forecast_margin: m.marginPct };
  let after: Res["after"];
  if (changedTo(doc, before, "workflow_state", "Approved")) { d = { ...d, approved_by: currentUser(), previous_snapshot: CC.previousLive(doc) || d["previous_snapshot"] || "" }; after = (x) => { for (const o of list("Digit Cost Forecast Snapshot", (f) => f["project"] === x["project"] && f.name !== x.name && f["workflow_state"] === "Approved")) adapter.update("Digit Cost Forecast Snapshot", o.name, { workflow_state: "Superseded" }); }; }
  return { doc: d, errors: e, after };
});

// ---------------------------------------------------------------- execution & field
on("Digit Stage Planning", (doc, before) => {
  const ts = rows(doc, "stage_planning_tasks").map((t, i): Row => ({ ...t, idx: i + 1 }));
  const prog = ts.map((t) => num(adapter.get("Task", String(t["task"]))?.["progress"]));
  const e: string[] = [];
  if (doc["planned_start"] && doc["planned_end"] && String(doc["planned_end"]) < String(doc["planned_start"])) e.push("Planned End cannot be before Planned Start");
  if (changedTo(doc, before, "workflow_state", "Rejected") && !String(doc["reject_reason"] ?? "").trim()) e.push("Reject Reason is required when rejecting a stage plan");
  for (const t of ts) if (t["planned_start"] && t["planned_end"] && String(t["planned_end"]) < String(t["planned_start"])) e.push(`Task ${String(t["task"])}: planned end before planned start`);
  return { doc: { ...doc, stage_planning_tasks: ts, planned_task_count: ts.length, mean_progress: prog.length ? r2(prog.reduce((a, b) => a + b, 0) / prog.length) : 0 }, errors: e };
});
on("Digit Work Package", (doc) => {
  const ts = list("Task", (t) => t["digit_work_package"] === doc.name);
  return { doc: { ...doc, progress: ts.length ? r2(ts.reduce((a, t) => a + num(t["progress"]), 0) / ts.length) : num(doc["progress"]) } };
});
on("Digit Task Dependency", (doc) => {
  const e: string[] = [];
  if (doc["task"] && doc["task"] === doc["predecessor"]) e.push("A task cannot depend on itself");
  // cycle check over existing dependencies (predecessor chain must not reach the task)
  const deps = list("Digit Task Dependency", (d) => d.name !== doc.name);
  const seen = new Set<string>(); const stack = [String(doc["predecessor"] ?? "")];
  while (stack.length) { const t = stack.pop()!; if (t === doc["task"]) { e.push("This dependency would create a cycle"); break; } if (seen.has(t)) continue; seen.add(t); deps.filter((d) => d["task"] === t).forEach((d) => stack.push(String(d["predecessor"]))); }
  return { doc, errors: e };
});
on("Digit Progress Update", (doc, before) => {
  const e: string[] = [];
  if (num(doc["progress_pct"]) < 0 || num(doc["progress_pct"]) > 100) e.push("Reported progress must be between 0 and 100");
  if (changedTo(doc, before, "workflow_state", "Returned") && !String(doc["review_note"] ?? "").trim()) e.push("Review Note is required when returning a progress update");
  // F02-15-1 hold point, F02-16-1 lower progress needs a reason
  e.push(...SR.progressErrors(doc, before));
  let after: Res["after"];
  if (changedTo(doc, before, "workflow_state", "Reviewed") && doc["task"]) after = (x) => {
    const t = adapter.get("Task", String(x["task"])); if (!t) return;
    adapter.update("Task", t.name, { progress: num(x["progress_pct"]), ...(num(x["progress_pct"]) >= 100 ? { status: "Completed" } : t["status"] === "Open" ? { status: "Working" } : {}) });
    const wp = t["digit_work_package"]; if (wp && adapter.get("Digit Work Package", String(wp))) adapter.update("Digit Work Package", String(wp), {});
  };
  return { doc, errors: e, after };
});
const fieldStatus = (doc: Doc) => ({ ...doc, status: num(doc.docstatus) === 1 ? "Submitted" : num(doc.docstatus) === 2 ? "Cancelled" : "Draft" });
on("Digit Site Activity Report", (doc) => ({ doc: fieldStatus({ ...doc, activities: rows(doc, "activities").map((a, i): Row => ({ ...a, idx: i + 1 })) }),
  // F02-05-1 / DEC-032: one diary per project, date and shift; activity quantities are never negative
  errors: [...(num(doc["manpower_count"]) < 0 ? ["Manpower cannot be negative"] : []), ...SR.siteReportErrors(doc)] }));
// ---------------------------------------------------------------- department 02 (domain/site.ts; server twin rules/site.py)
on("Digit WBS Version", SR.wbsVersionRule);
on("Digit Schedule Baseline", SR.scheduleBaselineRule);
on("Digit Lookahead", SR.lookaheadRule);
on("Digit Submittal", SR.submittalRule);
on("Digit Drawing", SR.drawingRule);
on("Digit Transmittal", SR.transmittalRule);
on("Digit Review Workflow", SR.reviewWorkflowRule);
on("Digit Field Task", SR.fieldTaskRule);
on("Digit Inspection", (doc, before) => {
  const r = SR.inspectionRule(doc, before);
  return { doc: r.doc, errors: r.errors, ...(r.defects ? { after: (x: Doc) => asService(() => inspectionDefects(x)) } : {}) };
});
on("Digit Defect", (doc, before) => SR.defectRule(doc, before));
// department 09 finance and closeout (finance.ts): WIP adjustment, commissioning, handover assets
on("Digit WIP Adjustment", (doc, before) => FN.wipRule(doc, before));
on("Digit Override Log", (doc, before) => ({ doc, errors: FN.overrideLogRule(doc, before) }));
on("Digit Commissioning Test", (doc, before) => { const r = FN.commissioningRule(doc, before); return { doc: r.doc, errors: r.errors, ...(r.defect ? { after: (x: Doc) => asService(() => FN.commissioningDefect(x)) } : {}) }; });
on("Digit Handover Asset", (doc, before) => { const r = FN.assetRule(doc, before); return { doc: r.doc, errors: r.errors, ...(r.task ? { after: (x: Doc) => asService(() => FN.returnTask(x)) } : {}) }; });
on("Digit Punch Item", (doc, before) => SR.punchRule(doc, before));
on("Digit Cost Code", (doc, before) => { const r = SR.costCodeRule(doc); return { doc: r.doc, errors: [...r.errors, ...CC.codeChangeErrors(doc, before)] }; }); // + F06-01-2
on("Digit Handover Package", (doc) => SR.handoverRule(doc));
/** F02-13-2: one draft defect per Not OK line, named after the inspection line, so submitting twice never adds a second. */
export function inspectionDefects(insp: Doc): string[] {
  const made: string[] = []; let changed = false;
  const lines = rows(insp, "lines").map((l): Row => {
    if (l["outcome"] !== "Not OK" || l["defect"]) return l;
    const name = SR.defectName(insp.name, l["item_no"]);
    if (!adapter.get("Digit Defect", name)) {
      adapter.insertDoc("Digit Defect", { name, title: String(l["description"] || name), project: insp["project"], company: insp["company"], task: insp["task"] || "", location: insp["location"] || "",
        description: String(l["description"] ?? "") + (String(l["comment"] ?? "") ? ` — ${String(l["comment"])}` : ""), origin_inspection: insp.name, origin_line_no: num(l["item_no"]), workflow_state: "Open", status: "Open", defect_type: "Defect" });
      made.push(name);
    }
    changed = true; return { ...l, defect: name };
  });
  if (changed) adapter.update("Digit Inspection", insp.name, { lines });
  return made;
}
on("Digit Machinery Usage", (doc0) => {
  // DEC-266 / 268 one record per machine, project and day; F08-08-2 fuel cost, litres per hour and anomaly (domain/resourcing.ts)
  const u = RS.usageRule(doc0); const doc: Doc = { ...doc0, ...u.patch };
  const e: string[] = [...u.errors]; if (!(num(doc["hours"]) > 0) || num(doc["hours"]) > 24) e.push("Hours must be between 0 and 24");
  // FT-08-07/08: meters, idle and downtime on the same daily record
  const ms = doc["meter_start"], me = doc["meter_end"];
  for (const f of ["meter_start", "meter_end", "idle_hours", "downtime_hours", "fuel_litres"]) if (num(doc[f]) < 0) e.push(`${f.replace(/_/g, " ")} cannot be negative`);
  // a meter end of 0 is "not recorded" (Frappe stores numbers NOT NULL), so the meter checks run once an end reading is entered
  if (ms != null && ms !== "" && me != null && me !== "" && num(me) > 0) { if (num(me) < num(ms)) e.push("Meter End cannot be less than Meter Start"); else if (num(doc["hours"]) > r2(num(me) - num(ms)) + 0.005) e.push("Operating hours cannot exceed the meter difference"); }
  if (num(doc["hours"]) + num(doc["idle_hours"]) + num(doc["downtime_hours"]) > 24) e.push("Operating + idle + downtime hours cannot exceed 24 in one day");
  if (num(doc["downtime_hours"]) > 0 && (!doc["downtime_reason"] || doc["downtime_reason"] === "Not Applicable")) e.push("Select a downtime reason when downtime hours are recorded");
  return { doc: fieldStatus({ ...doc, total: r2(num(doc["hours"]) * num(doc["rate"]) + num(doc["fuel_cost"])) }), errors: e };
});
on("Digit Field Attendance", (doc, before) => {
  const emps = rows(doc, "employees").map((x, i): Row => ({ ...x, idx: i + 1 })); const e: string[] = [];
  const ids = emps.map((x) => String(x["employee"])); if (new Set(ids).size !== ids.length) e.push("An employee appears more than once in the same attendance sheet");
  for (const x of emps) if (num(x["overtime_hours"]) < 0 || num(x["overtime_hours"]) > 12) e.push(`${String(x["employee"])}: overtime hours must be between 0 and 12`);
  if (doc["project"] && doc["attendance_date"] && list("Digit Field Attendance", (a) => a.name !== doc.name && a["project"] === doc["project"] && a["attendance_date"] === doc["attendance_date"] && (a["crew"] ?? "") === (doc["crew"] ?? "") && num(a.docstatus) !== 2).length)
    e.push("An attendance sheet already exists for this project, crew and date");
  // FT-08-03 review then PM approval (Procore Reviewed → Approved)
  let x: Doc = doc;
  if (changedTo(doc, before, "workflow_state", "Reviewed")) {
    if (before) x = { ...x, reviewed_by: currentUser() };
    if (!emps.some((r) => ["Present", "Half Day"].includes(String(r["attendance"])))) e.push("Nobody is marked present; nothing to review");
  }
  if (changedTo(doc, before, "workflow_state", "Approved") && before) x = stamp(x, "approved_by", "approved_on");
  if (before?.["workflow_state"] === "Reviewed" && doc["workflow_state"] === "Draft" && !String(doc["return_reason"] ?? "").trim()) e.push("Return Reason is required (Return)");
  // F08-13-1 induction note, DEC-252 active employees only, DEC-254 no second approved sheet of another project (domain/resourcing.ts)
  const ar = RS.attendanceRule(doc, before); e.push(...ar.errors); x = { ...x, ...ar.patch };
  return { doc: fieldStatus({ ...x, employees: emps, present_count: emps.filter((r) => r["attendance"] === "Present").length + emps.filter((r) => r["attendance"] === "Half Day").length * 0.5, overtime_hours: sumBy(emps, (r) => num(r["overtime_hours"])) }), errors: e };
});
// FT-08-06 equipment bookings: valid period, no overlapping live booking of the same machine (Q-10); the machine record follows the booking
on("Digit Equipment Assignment", (doc, before) => {
  const e: string[] = []; const d: Doc = { ...doc, status: doc["status"] || "Planned" };
  if (d["to_date"] && String(d["to_date"]) < String(d["from_date"] ?? "")) e.push("To date cannot be before From date");
  e.push(...RS.assignmentRule(d, before)); // DEC-262 / 269
  if (d["status"] !== "Released") for (const o of bookingOverlaps(d)) e.push(`${String(d["machinery"])} is already booked on ${String(o["project"])} from ${String(o["from_date"])} to ${String(o["to_date"] || "open")} (${o.name})`);
  return { doc: d, errors: e, after: (x) => {
    const on = today(); const m = adapter.get("Digit Machinery", String(x["machinery"])); if (!m || m["status"] === "Retired") return;
    const covers = x["status"] === "Active" && String(x["from_date"]) <= on && String(x["to_date"] || "9999") >= on;
    if (covers) { if (m["current_project"] !== x["project"] || m["status"] === "Available") asService(() => adapter.update("Digit Machinery", m.name, { current_project: x["project"], status: m["status"] === "Under Maintenance" ? m["status"] : "Deployed" })); }
    else if (x["status"] === "Released" && m["current_project"] === x["project"]) asService(() => adapter.update("Digit Machinery", m.name, { current_project: "", status: m["status"] === "Deployed" ? "Available" : m["status"] }));
  } };
});
const EQ_RATES = ["hourly_rate", "daily_rate", "weekly_rate", "monthly_rate"];
on("Digit Equipment Rate", (doc) => {
  const e: string[] = [];
  if (!doc["machinery"] && !doc["machine_type"]) e.push("Set a machine or a machine type");
  if (!EQ_RATES.some((f) => num(doc[f]) > 0)) e.push("Enter at least one rate");
  for (const f of EQ_RATES) if (num(doc[f]) < 0) e.push(`${f.replace(/_/g, " ")} cannot be negative`);
  return { doc, errors: e };
});
on("Digit Labor Rate", (doc) => {
  const of = doc["overtime_factor"] === undefined || doc["overtime_factor"] === null || doc["overtime_factor"] === "" ? 1.5 : doc["overtime_factor"];
  return { doc: { ...doc, overtime_factor: of }, errors: !(num(doc["hourly_rate"]) > 0) ? ["Hourly rate must be greater than zero"] : num(of) < 1 ? ["Overtime factor cannot be below 1"] : [] };
});
on("Digit Crew", (doc) => {
  const ms = rows(doc, "members").map((x, i): Row => ({ ...x, idx: i + 1, employee_name: x["employee_name"] || adapter.get("Employee", String(x["employee"]))?.["employee_name"] || "" }));
  const ids = ms.map((x) => String(x["employee"]));
  return { doc: { ...doc, members: ms }, errors: new Set(ids).size !== ids.length ? ["An employee appears more than once in the crew"] : [] };
});
on("Digit Petty Cash Fund", (doc) => {
  const spent = sumBy(list("Digit Site Expense", (x) => x["fund"] === doc.name && x["workflow_state"] === "Approved"), (x) => num(x["amount"]));
  return { doc: { ...doc, spent, balance: r2(num(doc["fund_limit"]) - spent) }, errors: num(doc["fund_limit"]) < 0 ? ["Fund limit cannot be negative"] : [] };
});
on("Digit Site Expense", (doc, before) => {
  const e: string[] = [];
  if (!(num(doc["amount"]) > 0)) e.push("Amount must be greater than zero");
  const fund = doc["fund"] ? adapter.get("Digit Petty Cash Fund", String(doc["fund"])) : undefined;
  if (fund && fund["project"] !== doc["project"]) e.push(`Fund ${fund.name} belongs to another project`);
  if (fund && fund["status"] === "Closed" && changedTo(doc, before, "workflow_state", "Submitted")) e.push(`Fund ${fund.name} is closed`);
  if (fund && (changedTo(doc, before, "workflow_state", "Submitted") || changedTo(doc, before, "workflow_state", "Approved"))) {
    const used = sumBy(list("Digit Site Expense", (x) => x["fund"] === fund.name && x.name !== doc.name && ["Approved", "Submitted"].includes(String(x["workflow_state"]))), (x) => num(x["amount"]));
    if (num(doc["amount"]) > r2(num(fund["fund_limit"]) - used) + 0.005) e.push(`Amount exceeds the remaining fund balance ${r2(num(fund["fund_limit"]) - used)}`);
  }
  if (changedTo(doc, before, "workflow_state", "Rejected") && !String(doc["reject_reason"] ?? "").trim()) e.push("Reject Reason is required when rejecting an expense");
  e.push(...RS.expenseRule(doc, before)); // DEC-274
  return { doc, errors: e, after: (x) => { if (x["fund"] && adapter.get("Digit Petty Cash Fund", String(x["fund"]))) adapter.update("Digit Petty Cash Fund", String(x["fund"]), {}); } };
});
// F08-13-2 work permit issue; DEC-261 owned machine serial (domain/resourcing.ts)
on("Digit Work Permit", (doc, before) => ({ doc, errors: RS.permitRule(doc, before) }));
on("Digit Machinery", (doc, before) => ({ doc, errors: RS.machineryRule(doc, before) }));
// sheet 16 MISS-MaintenanceOrder / MISS-SiteInduction (domain/resourcing.ts; twin rules/resourcing.py)
on("Digit Maintenance Order", (doc, before) => ({ doc, errors: RS.maintenanceRule(doc, before) }));
on("Digit Site Induction", (doc, before) => ({ doc, errors: RS.inductionRule(doc, before) }));

// ---------------------------------------------------------------- finance & closeout
on("Digit Retention Release Request", (doc, before) => {
  const c = adapter.get("Digit Client Contract", String(doc["contract"] ?? ""));
  if (!c) return { doc, errors: ["Select a client contract"] };
  if (num(doc.docstatus) >= 1 && before && num(before.docstatus) >= 1) return { doc };
  const held = contractPosition(c).retentionHeld;
  const others = list("Digit Retention Release Request", (r) => r["contract"] === c.name && r.name !== doc.name && ["Pending Approval", "Approved"].includes(String(r["workflow_state"])));
  const reserved = sumBy(others, (r) => num(r["requested_amount"]));
  const eligible = retentionEligible(held, 0, reserved);
  const e: string[] = [];
  if (!(num(doc["requested_amount"]) > 0)) e.push("Requested amount must be greater than zero");
  if (num(doc["requested_amount"]) > eligible + 0.005) e.push(`Requested amount exceeds the retention eligible for release (${eligible})`);
  if (changedTo(doc, before, "workflow_state", "Approved") && !policyDefined("P2")) e.push(blocked("P2"));
  // P2 (owner ruling W0-02): the release is billed on the retention receivable account Finance names (the P2 value); until then it stays a draft
  else if (changedTo(doc, before, "workflow_state", "Approved") && !retentionAccount()) e.push("Finance has not named the retention receivable account (policy P2 value); the release stays a draft");
  return { doc: { ...doc, project: c["project"], customer: c["customer"], held_amount: held, reserved_other: reserved, eligible_amount: eligible }, errors: e };
});
on("Digit Final Account", (doc, before) => {
  const c = adapter.get("Digit Client Contract", String(doc["contract"] ?? ""));
  if (!c) return { doc, errors: ["Select a client contract"] };
  if (num(doc.docstatus) >= 1 && before && num(before.docstatus) >= 1) return { doc };
  const p = contractPosition(c);
  const adj = rows(doc, "adjustments").map((a, i): Row => ({ ...a, idx: i + 1 }));
  const adjTotal = sumBy(adj, (a) => (a["adjustment_type"] === "Deduction" ? -Math.abs(num(a["amount"])) : num(a["amount"])));
  const disputes = CM.finalAccountDisputes(c.name, rows(doc, "disputes")); // F04-10-3 disputed commercial claims appear as open disputes
  const open = sumBy(disputes.filter((x) => (x["status"] ?? "Open") === "Open"), (x) => num(x["claimed_amount"]) - num(x["offered_amount"]));
  const e: string[] = [];
  const anyOpen = disputes.some((x) => (x["status"] ?? "Open") === "Open");
  if ((changedTo(doc, before, "workflow_state", "Agreed") || changedTo(doc, before, "workflow_state", "Approved")) && anyOpen) e.push("Resolve or withdraw every open dispute before marking the final account agreed");
  if (changedTo(doc, before, "workflow_state", "Approved") && !policyDefined("P1")) e.push(blocked("P1"));
  // F04-15-2: the approved final account closes the contract
  const after: Res["after"] = changedTo(doc, before, "workflow_state", "Approved") ? (x) => asService(() => { const ct = adapter.get("Digit Client Contract", String(x["contract"] ?? "")); if (ct && ct["workflow_state"] !== "Closed") adapter.update("Digit Client Contract", ct.name, { workflow_state: "Closed" }); }) : undefined;
  return { doc: { ...doc, project: c["project"], customer: c["customer"], adjustments: adj, disputes, original_value: p.original, approved_variations: p.variations, certified_to_date: p.certifiedGross, adjustments_total: adjTotal, final_value: r2(p.revised + adjTotal), open_disputes: open }, errors: e, after };
});
on("Digit Closeout Assessment", (doc) => {
  // P4: who marked a row Not Applicable is kept, so a different Director approves it
  const rs = rows(doc, "rows").map((x, i): Row => ({ ...x, idx: i + 1, na_approved_by: x["status"] === "Not Applicable" ? x["na_approved_by"] ?? "" : "", na_marked_by: x["status"] === "Not Applicable" ? x["na_marked_by"] || currentUser() : "" }));
  const g = (a: string) => { const r = areaGate(rs.filter((x) => x["area"] === a)); return r.gate === "Pending" ? `Pending (${r.open})` : r.gate; };
  const t = g("Technical"), c = g("Commercial"), f = g("Financial");
  const all = [t, c, f]; const status = all.every((x) => x === "Complete") ? "Completed" : all.every((x) => x === "Not Started") ? "Draft" : "In Progress";
  return { doc: { ...doc, rows: rs, technical_status: t, commercial_status: c, financial_status: f, status } };
});
// P7: one expense account per expense category per company
on("Digit Expense Account", (doc) => {
  const dup = list("Digit Expense Account", (m) => m.name !== doc.name && m["company"] === doc["company"] && m["expense_category"] === doc["expense_category"] && Number(m["disabled"] ?? 0) !== 1);
  return { doc, errors: Number(doc["disabled"] ?? 0) !== 1 && dup.length ? [`Category ${String(doc["expense_category"] ?? "")} already has an expense account in company ${String(doc["company"] ?? "")} (${dup[0]!.name})`] : [] };
});
// P5: the Procurement manager accepts a variance with a reason (one live acceptance per order line)
on("Digit Match Acceptance", (doc, before) => {
  const e: string[] = []; const me = currentUser();
  if (!before && me !== "Administrator" && !userRoles(me).includes("Digit Procurement Officer")) e.push("Only the Procurement manager accepts a matching variance (policy P5)");
  if (!String(doc["reason"] ?? "").trim()) e.push("Record the reason for accepting the matching variance (policy P5)");
  if (list("Digit Match Acceptance", (a) => a.name !== doc.name && a["purchase_order"] === doc["purchase_order"] && a["item_code"] === doc["item_code"] && num(a.docstatus) !== 2).length) e.push("This order line already has an accepted variance");
  const po = adapter.get("Purchase Order", String(doc["purchase_order"] ?? ""));
  const line = rows(po, "items").find((i) => i["item_code"] === doc["item_code"]);
  return { doc: { ...doc, project: doc["project"] || line?.["project"] || po?.["project"] || "", accepted_by: before?.["accepted_by"] || me, accepted_on: before?.["accepted_on"] || today() }, errors: e };
});
/** P5: on Purchase Invoice submit, each order line it bills must be within the Finance tolerance or accepted. */
function p5InvoiceErrors(doc: Doc): string[] {
  const tol = { qtyPct: nn(SETT()?.["match_qty_tol_pct"]), pricePct: nn(SETT()?.["match_price_tol_pct"]), cap: nn(SETT()?.["match_abs_cap"]) };
  if (tol.qtyPct === null && tol.pricePct === null) return []; // empty = report only (owner ruling)
  const e: string[] = [];
  const keys = new Set(rows(doc, "items").filter((i) => i["purchase_order"]).map((i) => `${String(i["purchase_order"])}\u0001${String(i["item_code"])}`));
  for (const k of keys) {
    const [po, item] = k.split("\u0001") as [string, string];
    const p = adapter.get("Purchase Order", po); const line = rows(p, "items").find((i) => i["item_code"] === item); if (!line) continue;
    const rec = sumBy(list("Purchase Receipt", (r) => num(r.docstatus) === 1).flatMap((r) => rows(r, "items")).filter((i) => i["purchase_order"] === po && i["item_code"] === item), (i) => num(i["qty"]));
    const inv = [...list("Purchase Invoice", (r) => num(r.docstatus) === 1 && r.name !== doc.name).flatMap((r) => rows(r, "items")), ...rows(doc, "items")].filter((i) => i["purchase_order"] === po && i["item_code"] === item);
    const q = sumBy(inv, (i) => num(i["qty"])); const rate = q ? r2(sumBy(inv, (i) => num(i["amount"])) / q) : null;
    if (matchTolerance(rec, q, num(line["rate"]), rate, tol) === "beyond" && !list("Digit Match Acceptance", (a) => a["purchase_order"] === po && a["item_code"] === item && num(a.docstatus) !== 2).length)
      e.push(`The matching variance on ${po} / ${item} is beyond the Finance tolerance (policy P5); the Procurement manager accepts it with a reason first`);
  }
  return e;
}
const nn = (v: unknown): number | null => (v === null || v === undefined || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);
const SETT = () => adapter.get(SETTINGS, SETTINGS);
on("Digit Policy Decision", (doc) => {
  const e: string[] = [];
  if (doc["status"] === "Defined" && (!String(doc["decision"] ?? "").trim() || !String(doc["authority"] ?? "").trim() || !doc["effective_date"])) e.push("A defined policy needs the decision, the decision authority and an effective date");
  return { doc: { ...doc, affects: POLICY_AFFECTS[String(doc["policy_key"] ?? doc.name)]?.[0] ?? doc["affects"] ?? "" }, errors: e };
});
on("Digit Cashflow Forecast Item", (doc) => ({ doc, errors: !(num(doc["amount"]) > 0) ? ["Amount must be greater than zero"] : !/^\d{4}-\d{2}$/.test(String(doc["period"] ?? "")) ? ["Period must be YYYY-MM"] : [] }));

// ---------------------------------------------------------------- 01 management: portfolio scenario (FT-01-01) and risk register (FT-01-05)
on("Digit Portfolio Scenario", (doc, before) => {
  const base = doc["based_on"] ? adapter.get("Digit Portfolio Scenario", String(doc["based_on"])) : undefined;
  const x = scenarioTotals(doc, base);
  const { problems, ...totals } = x;
  const e: string[] = [...problems];
  const content = (d: Doc | undefined) => JSON.stringify([d?.["title"], d?.["plan_year"], d?.["company"], d?.["based_on"], sig(rows(d, "project_lines"), ["project", "proposed_name", "include", "start_date", "end_date", "contract_value", "budget_cost", "probability_pct"]),
    sig(rows(d, "cash_months"), ["period", "inflow", "outflow"])]);
  // F01-01-3 / DEC-001: a shared scenario is a frozen snapshot; any change is a new revision based on it
  if (before && num(before.docstatus) === 1 && num(doc.docstatus) === 1 && serviceDepth === 0 && content(doc) !== content(before)) e.push(SCENARIO_MSG.frozen);
  const revision_no = num(doc["revision_no"]) || (base ? num(base["revision_no"]) + 1 || 2 : 1);
  return { doc: { ...doc, ...totals, revision_no }, errors: e };
});
on("Digit Risk", (doc, before) => {
  const e: string[] = [];
  const p = num(doc["probability_pct"]);
  if (p < 0 || p > 100) e.push(RISK_MSG.probability);
  if (changedTo(doc, before, "workflow_state", "Active")) e.push(...activationMissing(doc));
  const d = { ...doc, ...riskFigures(doc) };
  // F01-05-3: impact occurred → one draft change event (origin Risk) carrying the potential cost; idempotent
  const impacted = changedTo(doc, before, "workflow_state", "Impacted") && !!before;
  return { doc: d, errors: e, ...(impacted && !e.length ? { after: (x: Doc) => asService(() => { riskChangeEvent(x); }) } : {}) };
});
/** The draft change event of an impacted risk (existing live one reused, so a second "impact" never adds another). */
export function riskChangeEvent(risk: Doc): Doc | undefined {
  const linked = risk["change_event"] ? adapter.get("Digit Change Event", String(risk["change_event"])) : undefined;
  if (linked && num(linked.docstatus) !== 2) return linked;
  const found = asSystem(() => list("Digit Change Event", (c) => c["origin_name_doctype"] === "Digit Risk" && c["origin_name"] === risk.name && num(c.docstatus) !== 2))[0];
  // explicit name (one event per risk), so the server twin creates the same record
  let nm = `CE-${risk.name}`; for (let k = 2; adapter.get("Digit Change Event", nm); k++) nm = `CE-${risk.name}-${k}`;
  const ce = found ?? adapter.insertDoc("Digit Change Event", {
    name: nm, title: String(risk["title"] || risk.name), project: risk["project"], company: risk["company"], workflow_state: "Draft", scope: "Not Determined",
    origin_type: "Risk", origin_name_doctype: "Digit Risk", origin_name: risk.name,
    contract: asSystem(() => list("Digit Client Contract", (c) => c["project"] === risk["project"] && num(c.docstatus) === 1))[0]?.name ?? "",
    lines: [{ idx: 1, line_key: `${risk.name}-1`, description: `Estimated impact of risk ${risk.name}: ${String(risk["title"] ?? "")}`, qty: 1, unit_cost: num(risk["potential_cost"]), markup_pct: 0 }],
  });
  if (risk["change_event"] !== ce.name) adapter.update("Digit Risk", risk.name, { change_event: ce.name });
  return ce;
}

// ---------------------------------------------------------------- native back-links (invoice status → certificate / bill state)
const NATIVE: Record<string, (doc: Doc, before: Doc | undefined) => Res> = {
  // FT-06-04 budget control: on submit, each project / cost code is checked against the approved revised budget.
  // Empty tolerance (default) = warn only; a set tolerance blocks commitments above revised × (1 + %).
  // FT-07-02 over-order against the Material Request line (empty tolerance = warn only).
  // DEC-153: the optional task on a material request / stock entry row belongs to the row's project
  // F07-01-1: order-by date on every request line (supply.ts mrOrderBy)
  "Material Request": (doc) => ({ doc: mrOrderBy(doc), errors: CC.taskProjectErrors(doc) }),
  // F07-12-1 / F07-13-1: cost code on a material issue; reason on a cross-project transfer or write-off (supply.ts)
  "Stock Entry": (doc, before) => {
    const errors = [...CC.taskProjectErrors(doc), ...stockEntryRule(doc, before)];
    // DEC-228: submitting the movement of an issue request marks the request Issued with the issued quantities
    const cascade = !!doc["digit_issue_request"] && num(doc.docstatus) === 1 && num(before?.docstatus) !== 1;
    return cascade ? { doc, errors, after: (x) => asService(() => issueCascade(x)) } : { doc, errors };
  },
  "Request for Quotation": (doc, before) => ({ doc, errors: rfqRule(doc, before) }),
  // F07-09-1 / F07-10-1: claim gap, rejection reason, over-receipt against the order line (supply.ts)
  "Purchase Receipt": (doc, before) => receiptRule(doc, before),
  "Supplier Quotation": (doc) => ({ doc, errors: quoteRule(doc) }),
  "Purchase Order": (doc, before) => {
    // DEC-112 (owner ruling): closing an order with open quantity or amount needs the Project Manager; a fully received and billed order closes freely
    if (num(doc.docstatus) === 1 && num(before?.docstatus) === 1) { const c = FN.poCloseCheck(doc, before, currentUser(), userRoles(currentUser())); return { doc: c.doc, errors: [...CC.taskProjectErrors(doc), ...c.errors] }; }
    // owner ruling: a retired or unknown cost code on a purchase order is refused (newly picked codes on a draft, every code on submit)
    if (num(doc.docstatus) !== 1 || num(before?.docstatus) === 1) return { doc, errors: [...CC.taskProjectErrors(doc), ...(num(doc.docstatus) === 0 ? CC.poCodeErrors(doc, before) : [])] };
    const by = new Map<string, Map<string, number>>();
    for (const it of rows(doc, "items")) {
      const p = String(it["project"] || doc["project"] || ""), c = String(it["digit_cost_code"] ?? ""); if (!p || !c) continue;
      const k = budgetKey(c, it["digit_cost_category"]);
      const m = by.get(p) ?? new Map<string, number>(); m.set(k, r2((m.get(k) ?? 0) + num(it["net_amount"] ?? it["amount"]))); by.set(p, m);
    }
    const e: string[] = [...CC.poCodeErrors(doc, before)];
    for (const [p, m] of by) for (const r of budgetCheck(p, m)) if (r.status === "Block") e.push(`Budget line ${r.cost_code} on ${p}: committed + actual would reach ${r.after} against a limit of ${r.limit} (revised ${r.revised}). Revise or transfer budget first.`);
    e.push(...CC.taskProjectErrors(doc));
    for (const o of overOrderCheck(doc)) if (o.status === "Block") e.push(`${o.item_code}: ordering ${o.thisQty} on top of ${o.other} exceeds Material Request ${o.mr} quantity ${o.requested} + tolerance (limit ${o.limit}).`);
    // F07-06-1 / DEC-248: the submitter holds the approval level of the order's net total (or a higher one)
    e.push(...poLevelErrors(doc));
    // F09-14-1: an order submitted over its revised budget (a warning, not a block) is written to the override log
    const warn = e.length ? [] : FN.poBudgetWarnings(doc);
    return { doc, errors: e, ...(warn.length ? { after: (x: Doc) => asService(() => FN.logOverrides("Purchase Order", x.name, "Budget", warn, String(x["digit_override_reason"] ?? ""))) } : {}) };
  },
  // F09-03-1 no payment to an invoice on hold; DEC-064 a non-compliant subcontractor is paid with a logged warning (F09-14-1)
  "Payment Entry": (doc, before) => {
    if (num(doc.docstatus) !== 1 || num(before?.docstatus) === 1) return { doc };
    const e = [...FN.paymentHoldErrors(doc), ...FN.paymentAllocationErrors(doc)]; if (e.length) return { doc, errors: e };
    const warn = FN.paymentComplianceWarnings(doc);
    return { doc, ...(warn.length ? { after: (x: Doc) => asService(() => FN.logOverrides("Payment Entry", x.name, "Compliance", warn, String(x["remarks"] ?? ""))) } : {}) };
  },
  // PRJ-TEAM-EXT: the same team rules on the native Project form and the team screen (unchanged legacy rows are not re-checked)
  // F09-16-1: a construction project is completed only through its closeout gates
  Project: (doc, before) => ({ doc, errors: [...teamIssues(doc, before).map((e) => e.en), ...(FN.closingProject(doc, before) ? FN.closeGateErrors(doc.name) : [])] }),
  "Sales Invoice": (doc, before) => {
    const cert = doc["digit_client_certificate"]; if (!cert || num(doc.docstatus) === num(before?.docstatus)) return { doc };
    return { doc, after: (x) => { const c = adapter.get("Digit Client Certificate", String(cert)); if (!c || num(c.docstatus) !== 1) return; adapter.update("Digit Client Certificate", c.name, { workflow_state: num(x.docstatus) === 1 ? "Invoiced" : "Confirmed", ...(num(x.docstatus) === 2 ? { sales_invoice: "" } : {}) }); } };
  },
  "Purchase Invoice": (doc, before) => {
    // P5 three-way match + F09-02-1 approval level (no purchase order) + F09-02-2 subcontractor compliance
    if (num(doc.docstatus) === 1 && num(before?.docstatus) === 0) { const e = [...FN.taxAccountErrors(doc), ...p5InvoiceErrors(doc), ...FN.invoiceErrors(doc)]; if (e.length) return { doc, errors: e }; }
    const bill = doc["digit_subcontractor_bill"]; if (!bill || num(doc.docstatus) === num(before?.docstatus)) return { doc };
    return { doc, after: (x) => { const b = adapter.get("Digit Subcontractor Bill", String(bill)); if (!b || num(b.docstatus) !== 1) return; adapter.update("Digit Subcontractor Bill", b.name, { workflow_state: num(x.docstatus) === 1 ? "Invoiced" : "Approved", ...(num(x.docstatus) === 2 ? { purchase_invoice: "" } : {}) }); } };
  },
};

on("Digit Print Artifact", (doc, before) => {
  const user = currentUser();
  const src = adapter.get(String(doc["source_doctype"] ?? ""), String(doc["source_name"] ?? ""));
  const sm = cachedMeta(String(doc["source_doctype"] ?? ""));
  return checkArtifact(doc, before, user, { source: src, canRead: !!src && !!sm && hasPerm(sm, "read", src, user), roles: userRoles(user) });
});

on(SETTINGS, (doc) => ({ doc, errors: Object.values(settingsErrors(doc)) }));

/** Native-document rule without saving (tests / server-twin evidence): the same function the adapter hook runs. */
export function computeNative(dt: string, doc: Doc, before?: Doc): Res { const h = NATIVE[dt]; return h ? h(doc, before) : { doc }; }

for (const [dt, h] of Object.entries({ ...HOOKS, ...NATIVE })) registerDocHook(dt, (doc, before) => {
  // demo records skip the rules while they are seeded and posted, but a workflow decision taken on one is a user action:
  // its rules (reasons, no self-approval) and follow-ups (e.g. the award's work order) apply as on any record
  const decision = !!before && doc["workflow_state"] !== undefined && doc["workflow_state"] !== before["workflow_state"];
  if (!enabled() || (doc["__synthetic"] && !decision)) return { doc };
  const r = h(doc, before);
  let after = r.after;
  // F01-02-2: a workflow decision by a member's delegate is recorded «on behalf of» the member
  if (before && !r.errors?.length && doc["workflow_state"] !== undefined && doc["workflow_state"] !== before["workflow_state"] && dt !== "Project") {
    const members = delegatedFor(String(r.doc["project"] ?? ""), currentUser());
    if (members.length) { const prev = after; const from = String(before["workflow_state"] ?? ""), to = String(r.doc["workflow_state"] ?? "");
      after = (x) => { prev?.(x); adapter.insertDoc("Comment", { comment_type: "Info", reference_doctype: dt, reference_name: x.name, comment_email: currentUser(), content: onBehalfText(members, from, to) }); }; }
  }
  return { doc: r.doc, ...(r.errors?.length ? { errors: r.errors } : {}), ...(after ? { after } : {}) };
});
