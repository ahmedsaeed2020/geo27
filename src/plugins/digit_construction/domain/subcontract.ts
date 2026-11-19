/**
 * Department 05 (subcontracting and measurement) — save rules and read models for subcontractor compliance (status
 * from the compliance documents, the guard on activating a work order: expired documents, the subcontractor's value
 * limit, the budget per cost code), the work-order line lock, subcontract changes (pricing new qty × new rate − old,
 * not below the certified measurement, an approved change event, value approval levels, applying the change to the
 * work order with new line keys), back charges (notified before deduction, deducted once in a bill), delay penalties
 * (daily rate × value, capped), measurement evidence (DEC-069), the subcontract final account (final value, balance,
 * open defects / disputed back charges block it, approval closes the work order and its open commitment), the
 * subcontract retention release (DEC-070) and payment terms on the work order (DEC-071). Owner spec catalog
 * FT-05-01 … FT-05-12, decisions DEC-064 … DEC-078. Rules are pure functions of (doc, before, store) registered as
 * adapter hooks by hooks.ts; rules/subcontract.py is the server twin with the same messages and derived fields.
 * Reads go through asSystem so a rule never depends on what the session user may read.
 */
import { adapter, type Doc } from "@/lib/adapter";
import { currentUser, userRoles } from "@/lib/session";
import { effectiveQty, lineAmount, num, P8_CHECKLIST, p8Missing, r2, r3, sumBy } from "./calc";
import { asSystem, list, rows, today } from "./data";
import { budgetCheck } from "./control";

type Row = Record<string, unknown>;
export type SubRes = { doc: Doc; errors: string[] };
const s = (v: unknown) => (v === undefined || v === null ? "" : String(v));
const day = (v: unknown) => s(v).slice(0, 10);
const live = (d: Doc | undefined) => !!d && num(d.docstatus) !== 2;
const changedTo = (doc: Doc, before: Doc | undefined, f: string, v: string) => doc[f] === v && before?.[f] !== v;
const all = (dt: string, pred?: (d: Doc) => boolean) => asSystem(() => list(dt, pred));
const get = (dt: string, n: unknown) => (n ? asSystem(() => adapter.get(dt, s(n))) : undefined);
const plusDays = (d: string, n: number) => new Date(Date.parse(d.slice(0, 10)) + n * 86400000).toISOString().slice(0, 10);
export const fill = (t: string, ...a: unknown[]) => t.replace(/\{(\d+)\}/g, (_m, i: string) => s(a[Number(i)]));
const fmt = (n: number) => String(r2(n));

export const SUB_MSG = {
  expiryRequired: "Row {0}: {1} needs an expiry date",
  expired: "Compliance documents expired: {0}",
  overLimit: "The work order value {0} exceeds the subcontractor's limit {1}",
  budget: "Budget insufficient for cost code {0}: committed + actual would reach {1} against a limit of {2}",
  locked: "The work order lines are locked once active — use a subcontract change",
  woNotActive: "A subcontract change applies only to an active work order",
  notLine: "Row {0}: {1} is not a line of work order {2}",
  negative: "Row {0}: quantity and rate cannot be negative",
  newLine: "Row {0}: a new line needs a scope and a cost code",
  belowMeasured: "{0}: the new quantity {1} is below the certified measurement {2}",
  noLines: "Add at least one line before review",
  ceRequired: "A subcontract change needs an approved change event",
  ceNotApproved: "Change event {0} is not approved",
  level: "A change of {0} needs approval level {1} ({2}) or higher",
  bcAmount: "The back charge amount must be greater than zero",
  bcNotified: "Notify the subcontractor before the deduction (Notified On)",
  bcDefect: "Select the defect for a defect-repair back charge",
  bcStock: "Select the material issue (Stock Entry) for a materials back charge",
  bcLocked: "Back charge {0} is deducted in bill {1} and cannot change",
  evidenceFile: "Row {0}: attach the evidence before accepting it",
  evidenceRole: "Row {0}: only a Quantity Surveyor accepts measurement evidence",
  faDefects: "Open defects on the subcontractor: {0}",
  faDisputed: "Disputed back charges: {0}",
  srrAmount: "Requested amount must be greater than zero",
  srrOver: "Requested amount exceeds the retention eligible for release ({0})",
  srrAccount: "Finance has not named the subcontract retention payable account; the release stays a draft",
};
export const COMPLIANCE_WARN_DAYS = 30;

// ---------------------------------------------------------------- FT-05-01 compliance
export type Compliance = { status: "Compliant" | "Expiring" | "Non-compliant"; expired: string[]; expiring: string[] };
/** F05-01-1: Non-compliant when any compliance document has expired; Expiring when one expires within 30 days; else Compliant. */
export function complianceOf(profile: Doc | undefined, on = today()): Compliance {
  const docs: { label: string; expiry: string }[] = rows(profile, "compliance_documents").filter((d) => day(d["expiry"])).map((d) => ({ label: s(d["doc_type"]) || "Document", expiry: day(d["expiry"]) }));
  if (day(profile?.["cr_expiry"]) && !docs.some((d) => d.label === "CR")) docs.push({ label: "CR", expiry: day(profile?.["cr_expiry"]) });
  if (day(profile?.["insurance_expiry"]) && !docs.some((d) => d.label === "Insurance")) docs.push({ label: "Insurance", expiry: day(profile?.["insurance_expiry"]) });
  const soon = plusDays(on, COMPLIANCE_WARN_DAYS);
  const expired = docs.filter((d) => d.expiry < on).map((d) => d.label), expiring = docs.filter((d) => d.expiry >= on && d.expiry <= soon).map((d) => d.label);
  return { status: expired.length ? "Non-compliant" : expiring.length ? "Expiring" : "Compliant", expired, expiring };
}
/** P8 prequalification checklist as requirement items (same check as the profile hook, p8Missing), with expiring documents as warnings. */
export interface PrequalRequirement { key: string; en: string; ar: string; state: "ok" | "missing" | "warn"; expiry?: string | undefined }
export function prequalRequirements(profile: Doc, on = today()): PrequalRequirement[] {
  const missing = new Set(p8Missing(profile, rows(profile, "compliance_documents"), on));
  const comp = complianceOf(profile, on);
  const exp = (k: string) => [...rows(profile, "compliance_documents").filter((d) => d["doc_type"] === k).map((d) => day(d["expiry"])), k === "CR" ? day(profile["cr_expiry"]) : k === "Insurance" ? day(profile["insurance_expiry"]) : ""].filter(Boolean).sort().pop();
  return P8_CHECKLIST.map(([k, en, ar]) => ({ key: k, en, ar, state: missing.has(en) ? "missing" : comp.expiring.includes(k) ? "warn" : "ok", expiry: exp(k) }));
}
export function profileRule(doc: Doc, on = today()): SubRes {
  const e: string[] = [];
  rows(doc, "compliance_documents").forEach((d, i) => { if (!day(d["expiry"])) e.push(fill(SUB_MSG.expiryRequired, i + 1, s(d["doc_type"]) || "Document")); });
  return { doc: { ...doc, compliance_status: complianceOf(doc, on).status }, errors: e };
}
export const profileOf = (supplier: unknown) => all("Digit Subcontractor Profile", (p) => p["supplier"] === supplier).sort((a, b) => a.name.localeCompare(b.name))[0];

// ---------------------------------------------------------------- FT-05-02 / 05-03 / 05-04 work order
const lineSig = (rs: Row[]) => JSON.stringify(rs.map((l) => [s(l["line_key"]), num(l["qty"]), num(l["rate"]), s(l["cost_code"]), s(l["scope"])]));
export const byCode = (lines: Row[], amount: (l: Row) => number) => {
  const m = new Map<string, number>();
  for (const l of lines) { const c = s(l["cost_code"]); const a = amount(l); if (c && a > 0) m.set(c, r2((m.get(c) ?? 0) + a)); }
  return new Map([...m].sort(([a], [b]) => a.localeCompare(b)));
};
/** Budget lines the amounts would push past the Construction Settings limit (budget_block_pct; blank = never blocks). */
export const budgetErrors = (project: unknown, amounts: Map<string, number>) =>
  amounts.size ? budgetCheck(s(project), amounts).filter((r) => r.status === "Block").map((r) => fill(SUB_MSG.budget, r.cost_code, fmt(r.after), fmt(num(r.limit)))) : [];
/** F05-01-2 / F05-02-1 / F05-04-1 / DEC-068 on the work order (after lines and total are computed). */
export function workOrderExtras(doc: Doc, before: Doc | undefined, service: boolean, on = today()): string[] {
  const e: string[] = [];
  if (!service && before && num(before.docstatus) === 1 && lineSig(rows(before, "lines")) !== lineSig(rows(doc, "lines"))) e.push(SUB_MSG.locked);
  if (changedTo(doc, before, "workflow_state", "Active")) {
    const c = complianceOf(profileOf(doc["subcontractor"]), on);
    if (c.status === "Non-compliant") e.push(fill(SUB_MSG.expired, c.expired.join(", ")));
    const max = num(profileOf(doc["subcontractor"])?.["max_contract_value"]);
    if (max > 0 && num(doc["total_value"]) > max + 0.005) e.push(fill(SUB_MSG.overLimit, fmt(num(doc["total_value"])), fmt(max)));
    e.push(...budgetErrors(doc["project"], byCode(rows(doc, "lines"), (l) => num(l["amount"]))));
  }
  return e;
}
/** F05-08-2 / DEC-068: penalty = min(delay days × daily rate × work-order value, cap × value); the cap defaults to 10 %. */
export function delayPenalty(wo: Doc | undefined, days: number) {
  const value = num(wo?.["total_value"]), rate = num(wo?.["delay_penalty_rate"]);
  const capPct = wo?.["delay_penalty_cap"] === undefined || wo?.["delay_penalty_cap"] === null || wo?.["delay_penalty_cap"] === "" ? 10 : num(wo?.["delay_penalty_cap"]);
  const raw = r2(Math.max(0, days) * rate / 100 * value), cap = r2(capPct / 100 * value);
  return { amount: Math.min(raw, cap), raw, cap, capped: raw > cap };
}
/** DEC-071: credit days of the work order's payment terms template (the longest term). */
export const creditDays = (tpl: Doc | undefined) => Math.max(0, ...rows(tpl, "terms").map((t) => num(t["credit_days"])));
export function expectedPaymentDate(wo: Doc | undefined, billDate: unknown) {
  const tpl = get("Payment Terms Template", wo?.["payment_terms_template"]);
  return tpl && day(billDate) ? plusDays(day(billDate), creditDays(tpl)) : "";
}

// ---------------------------------------------------------------- FT-05-05 subcontract change
/** Certified quantity per work-order line across certified measurement books. */
export function certifiedQty(wo: string) {
  const m = new Map<string, number>();
  for (const b of all("Digit Measurement Book", (x) => x["work_order"] === wo && x["workflow_state"] === "Certified"))
    for (const en of rows(b, "entries")) m.set(s(en["wo_line_key"]), r3((m.get(s(en["wo_line_key"])) ?? 0) + effectiveQty(en)));
  return m;
}
export const isApprovedEvent = (ce: Doc | undefined) => !!ce && live(ce) && (ce["workflow_state"] === "Approved" || ce["workflow_state"] === "Closed" && !!(ce["variation"] || ce["associated_variation"]));
const levelsOf = () => all("Digit PO Approval Level").sort((a, b) => num(a["level"]) - num(b["level"]));
/** Value approval levels (the commitment approval level table): empty when no level is defined or the user qualifies. */
export function levelError(amount: number, user: string): string {
  const ls = levelsOf(); if (!ls.length || user === "Administrator") return "";
  const need = ls.find((l) => l["max_amount"] === undefined || l["max_amount"] === null || l["max_amount"] === "" || num(l["max_amount"]) + 0.005 >= amount);
  if (!need) return fill(SUB_MSG.level, fmt(amount), "—", "—");
  const roles = new Set(userRoles(user));
  return ls.filter((l) => num(l["level"]) >= num(need["level"])).some((l) => roles.has(s(l["role"]))) ? "" : fill(SUB_MSG.level, fmt(amount), num(need["level"]), s(need["role"]));
}
export function changeRule(doc: Doc, before: Doc | undefined, user = currentUser()): SubRes & { apply: boolean } {
  // an approved change is frozen (the submit that follows the approval must not re-price it against the changed work order)
  if (before && (num(before.docstatus) >= 1 || before["workflow_state"] === "Approved")) return { doc, errors: [], apply: false };
  const wo = get("Digit Subcontract Work Order", doc["work_order"]);
  if (!wo) return { doc, errors: ["Select a work order"], apply: false };
  const e: string[] = []; const wl = rows(wo, "lines"); const cert = certifiedQty(wo.name);
  const toReview = changedTo(doc, before, "workflow_state", "Under Review") || changedTo(doc, before, "workflow_state", "Submitted");
  const deciding = toReview || changedTo(doc, before, "workflow_state", "Approved"); // a draft may hold incomplete lines
  const lines = rows(doc, "lines").map((x, i): Row => {
    const w = wl.find((l) => l["line_key"] === x["wo_line_key"]);
    const type = s(x["change_type"]) || (x["wo_line_key"] && w ? "Update" : "New Line");
    const cur = type === "Update" ? num(w?.["qty"]) : 0, oldRate = type === "Update" ? num(w?.["rate"]) : 0;
    // a blank (or 0, as Frappe stores an empty Currency) new rate keeps the current rate
    const newRate = num(x["new_rate"]) !== 0 ? num(x["new_rate"]) : num(x["rate"]) !== 0 ? num(x["rate"]) : oldRate;
    const rev = x["revised_qty"] !== undefined && x["revised_qty"] !== null && x["revised_qty"] !== "" ? num(x["revised_qty"]) : r3(cur + num(x["qty_delta"]));
    const certified = type === "Update" ? cert.get(s(x["wo_line_key"])) ?? 0 : 0;
    if (deciding && type === "Update" && !w) e.push(fill(SUB_MSG.notLine, i + 1, s(x["wo_line_key"]), wo.name));
    if (deciding && type === "New Line" && (!s(x["scope"]).trim() || !s(x["cost_code"]).trim())) e.push(fill(SUB_MSG.newLine, i + 1));
    if (rev < 0 || newRate < 0) e.push(fill(SUB_MSG.negative, i + 1));
    if (type === "Update" && rev < certified - 1e-9) e.push(fill(SUB_MSG.belowMeasured, s(w?.["scope"]) || s(x["wo_line_key"]), rev, certified));
    return { ...x, idx: i + 1, change_type: type, scope: x["scope"] || w?.["scope"] || "", uom: x["uom"] || w?.["uom"] || "", cost_code: x["cost_code"] || w?.["cost_code"] || "",
      current_qty: cur, certified_qty: certified, revised_qty: rev, qty_delta: r3(rev - cur), old_rate: oldRate, new_rate: newRate, rate: newRate, amount_delta: r2(lineAmount(rev, newRate) - lineAmount(cur, oldRate)) };
  });
  const total = r2(sumBy(lines, (l) => num(l["amount_delta"])));
  let d: Doc = { ...doc, project: doc["project"] || wo["project"], company: doc["company"] || wo["company"], subcontractor: doc["subcontractor"] || wo["subcontractor"], lines,
    current_wo_value: num(wo["total_value"]), total_delta: total, revised_wo_value: r2(num(wo["total_value"]) + total) };
  if (toReview && !lines.length) e.push(SUB_MSG.noLines);
  let apply = false;
  if (changedTo(doc, before, "workflow_state", "Approved")) {
    if (wo["workflow_state"] !== "Active") e.push(SUB_MSG.woNotActive);
    const ce = get("Digit Change Event", doc["change_event"]);
    if (!doc["change_event"]) e.push(SUB_MSG.ceRequired); else if (!isApprovedEvent(ce)) e.push(fill(SUB_MSG.ceNotApproved, s(doc["change_event"])));
    const lv = levelError(Math.abs(total), user); if (lv) e.push(lv);
    e.push(...budgetErrors(d["project"], byCode(lines, (l) => num(l["amount_delta"]))));
    d = { ...d, approved_by: user, approved_on: today() };
    apply = !e.length;
  }
  return { doc: d, errors: e, apply };
}
/** F05-05-2: the work order lines after an approved change — updated lines in place, new lines with a new key. */
export function appliedLines(change: Doc, wo: Doc): Row[] {
  const out = rows(wo, "lines").map((l) => ({ ...l }));
  let n = 0;
  for (const x of rows(change, "lines")) {
    if (x["change_type"] === "Update") { const l = out.find((y) => y["line_key"] === x["wo_line_key"]); if (l) { l["qty"] = num(x["revised_qty"]); l["rate"] = num(x["new_rate"]); } }
    else out.push({ idx: out.length + 1, line_key: `${change.name}-${++n}`, scope: x["scope"], uom: x["uom"] || "", cost_code: x["cost_code"], qty: num(x["revised_qty"]), rate: num(x["new_rate"]) });
  }
  return out.map((l, i) => ({ ...l, idx: i + 1 }));
}
export function changeTargets(change: Doc) {
  const wo = get("Digit Subcontract Work Order", change["work_order"]); if (!wo) return undefined;
  return { wo: wo.name, patch: { lines: appliedLines(change, wo), approved_changes: num(wo["approved_changes"]) + 1, baseline_wo: num(wo["baseline_wo"]) || num(wo["total_value"]), change_ref: change.name, net_delta: r2(num(wo["net_delta"]) + num(change["total_delta"])) } };
}

// ---------------------------------------------------------------- FT-05-08 back charges, DEC-068 penalty
const bcAgreed = (b: Doc) => s(b["status"]) === "Agreed" || s(b["workflow_state"]) === "Approved" && !["Draft", "Notified", "Disputed", "Deducted"].includes(s(b["status"]));
const billLive = (n: unknown) => { const b = get("Digit Subcontractor Bill", n); return !!b && num(b.docstatus) !== 2; };
/** Agreed back charges of the work order, notified to the subcontractor, not deducted in another live bill (each is deducted once). */
export function deductibleBackCharges(wo: string, bill = "") {
  return all("Digit Back Charge", (b) => b["work_order"] === wo && bcAgreed(b) && !!day(b["notified_on"]) && num(b["amount"]) > 0
    && (!b["deducted_in_bill"] || b["deducted_in_bill"] === bill || !billLive(b["deducted_in_bill"]))).sort((a, b) => a.name.localeCompare(b.name));
}
export function backChargeRule(doc: Doc, before: Doc | undefined, service: boolean): SubRes {
  const e: string[] = [];
  const wo = get("Digit Subcontract Work Order", doc["work_order"]);
  const defect = get("Digit Defect", doc["defect"]);
  let d: Doc = { ...doc, project: doc["project"] || wo?.["project"] || "", company: doc["company"] || wo?.["company"] || "", subcontractor: doc["subcontractor"] || wo?.["subcontractor"] || "" };
  if (!(num(d["amount"]) > 0) && defect && num(defect["cost_to_fix"]) > 0) d = { ...d, amount: r2(num(defect["cost_to_fix"])) };
  if (!service && before?.["deducted_in_bill"] && billLive(before["deducted_in_bill"]) && num(before["amount"]) !== num(d["amount"])) e.push(fill(SUB_MSG.bcLocked, doc.name, s(before["deducted_in_bill"])));
  if (!(num(d["amount"]) > 0)) e.push(SUB_MSG.bcAmount);
  if (d["source"] === "Defect Repair" && !d["defect"]) e.push(SUB_MSG.bcDefect);
  if (d["source"] === "Materials Issued" && !d["stock_entry"]) e.push(SUB_MSG.bcStock);
  if (changedTo(d, before, "status", "Agreed") && !day(d["notified_on"])) e.push(SUB_MSG.bcNotified);
  return { doc: d, errors: e };
}

// ---------------------------------------------------------------- FT-05-07 bill extras
export function billExtras(doc: Doc, wo: Doc, priorGross: number, gross: number) {
  const bcs = num(doc.docstatus) === 0 ? deductibleBackCharges(wo.name, doc.name) : [];
  return { backCharges: bcs, back_charge_amount: r2(sumBy(bcs, (b) => num(b["amount"]))), balance_to_finish: r2(num(wo["total_value"]) - priorGross - gross), expected_payment_date: expectedPaymentDate(wo, doc["bill_date"]) };
}
/** Bill approved → its back charges are deducted (once); bill cancelled → they are free again. */
export function billBackChargeWrites(bill: Doc, approved: boolean): { name: string; patch: Row }[] {
  if (approved) return deductibleBackCharges(s(bill["work_order"]), bill.name).map((b) => ({ name: b.name, patch: { deducted_in_bill: bill.name, status: "Deducted", settled_on: day(bill["bill_date"]) || today() } }));
  return all("Digit Back Charge", (b) => b["deducted_in_bill"] === bill.name).sort((a, b) => a.name.localeCompare(b.name)).map((b) => ({ name: b.name, patch: { deducted_in_bill: "", status: "Agreed", settled_on: "" } }));
}

// ---------------------------------------------------------------- DEC-069 measurement evidence
export function evidenceRule(entries: Row[], beforeEntries: Row[], user = currentUser()): { entries: Row[]; errors: string[] } {
  const e: string[] = []; const qs = user === "Administrator" || userRoles(user).includes("Digit QS");
  const out = entries.map((x, i) => {
    const was = beforeEntries[i];
    if (x["evidence_status"] !== "Accepted" || was?.["evidence_status"] === "Accepted") return x;
    if (!s(x["evidence_file"])) e.push(fill(SUB_MSG.evidenceFile, i + 1));
    if (!qs) e.push(fill(SUB_MSG.evidenceRole, i + 1));
    return { ...x, evidence_by: user };
  });
  return { entries: out, errors: e };
}
export function evidenceCounts(book: Doc) {
  const en = rows(book, "entries");
  return { entries: en.length, accepted: en.filter((x) => x["evidence_status"] === "Accepted").length, rejected: en.filter((x) => x["evidence_status"] === "Rejected").length,
    missing: en.filter((x) => !s(x["evidence_file"])).length, pending: en.filter((x) => !x["evidence_status"] || x["evidence_status"] === "Pending").length };
}

// ---------------------------------------------------------------- FT-05-12 final account, DEC-070 retention release
const submittedBills = (wo: string) => all("Digit Subcontractor Bill", (b) => b["work_order"] === wo && num(b.docstatus) === 1);
export const approvedChanges = (wo: string) => all("Digit Subcontract Change", (c) => c["work_order"] === wo && c["workflow_state"] === "Approved" && num(c.docstatus) !== 2);
export function retentionHeld(wo: string, except = "") {
  const held = r2(sumBy(submittedBills(wo), (b) => num(b["retention_amount"])));
  const released = r2(sumBy(all("Digit Subcontract Retention Release Request", (r) => r["work_order"] === wo && r.name !== except && r["workflow_state"] === "Approved"), (r) => num(r["requested_amount"])));
  return r2(held - released);
}
export const hasApprovedFinalAccount = (wo: string) => all("Digit Subcontract Final Account", (f) => f["work_order"] === wo && f["workflow_state"] === "Approved").length > 0;
export function finalAccountRule(doc: Doc, before: Doc | undefined, user = currentUser()): SubRes & { close: boolean } {
  if (before && before["workflow_state"] === "Approved" && doc["workflow_state"] === "Approved") return { doc, errors: [], close: false };
  const wo = get("Digit Subcontract Work Order", doc["work_order"]);
  if (!wo) return { doc, errors: ["Select a work order"], close: false };
  const changes = r2(sumBy(approvedChanges(wo.name), (c) => num(c["total_delta"])));
  const original = num(wo["baseline_wo"]) || r2(num(wo["total_value"]) - changes);
  const bcs = all("Digit Back Charge", (b) => b["work_order"] === wo.name && num(b["amount"]) > 0);
  const counted = bcs.filter((b) => bcAgreed(b) || b["status"] === "Deducted"), disputed = bcs.filter((b) => b["status"] === "Disputed");
  const bills = submittedBills(wo.name);
  const certified = r2(sumBy(bills, (b) => num(b["gross_amount"]))), held = retentionHeld(wo.name);
  const finalValue = r2(original + changes - sumBy(counted, (b) => num(b["amount"])));
  const release = num(doc["release_retention"]) === 1;
  let d: Doc = { ...doc, project: doc["project"] || wo["project"], company: doc["company"] || wo["company"], subcontractor: doc["subcontractor"] || wo["subcontractor"],
    total_wo_value: original, approved_changes: changes, back_charges_total: r2(sumBy(counted, (b) => num(b["amount"]))), pending_back_charges: r2(sumBy(disputed, (b) => num(b["amount"]))),
    total_billed: certified, retention_held: held, advance_unrecovered: r2(Math.max(0, num(wo["advance_amount"]) - sumBy(bills, (b) => num(b["advance_recovery"])))),
    final_amount: finalValue, outstanding_balance: r2(finalValue - certified + (release ? held : 0)) };
  const e: string[] = [];
  const closing = changedTo(doc, before, "workflow_state", "Agreed") || changedTo(doc, before, "workflow_state", "Approved");
  if (closing) {
    const open = all("Digit Defect", (x) => x["work_order"] === wo.name && !["Closed"].includes(s(x["workflow_state"] || x["status"]))).map((x) => x.name).sort();
    if (open.length) e.push(fill(SUB_MSG.faDefects, open.join(", ")));
    if (disputed.length) e.push(fill(SUB_MSG.faDisputed, disputed.map((b) => b.name).sort().join(", ")));
  }
  if (changedTo(doc, before, "workflow_state", "Agreed")) d = { ...d, agreed_by: user, agreed_on: today() };
  if (changedTo(doc, before, "workflow_state", "Approved")) d = { ...d, settled_on: today() };
  return { doc: d, errors: e, close: changedTo(doc, before, "workflow_state", "Approved") && !e.length };
}
/** DEC-070: eligible = retention withheld on the work order's bills − approved releases − other pending requests. */
export function subRetentionRule(doc: Doc, before: Doc | undefined, account: string): SubRes {
  const wo = get("Digit Subcontract Work Order", doc["work_order"]);
  if (!wo) return { doc, errors: ["Select a work order"] };
  if (num(doc.docstatus) >= 1 && before && num(before.docstatus) >= 1) return { doc, errors: [] };
  const held = retentionHeld(wo.name, doc.name);
  const reserved = r2(sumBy(all("Digit Subcontract Retention Release Request", (r) => r["work_order"] === wo.name && r.name !== doc.name && r["workflow_state"] === "Pending Approval"), (r) => num(r["requested_amount"])));
  const eligible = r2(Math.max(0, held - reserved));
  const e: string[] = [];
  if (!(num(doc["requested_amount"]) > 0)) e.push(SUB_MSG.srrAmount);
  if (num(doc["requested_amount"]) > eligible + 0.005) e.push(fill(SUB_MSG.srrOver, fmt(eligible)));
  if (changedTo(doc, before, "workflow_state", "Approved") && !account) e.push(SUB_MSG.srrAccount);
  return { doc: { ...doc, project: wo["project"], company: wo["company"], subcontractor: wo["subcontractor"], held_amount: held, reserved_other: reserved, eligible_amount: eligible }, errors: e };
}

// ---------------------------------------------------------------- FT-05-11 payables position
/** paid = Σ allocated from submitted Payment Entries; outstanding = Σ outstanding_amount of the submitted invoices. */
export function payables(pis: Doc[]) {
  const names = new Set(pis.map((p) => p.name));
  const paid = r2(sumBy(all("Payment Entry", (p) => num(p.docstatus) === 1).flatMap((p) => rows(p, "references")).filter((r) => r["reference_doctype"] === "Purchase Invoice" && names.has(s(r["reference_name"]))), (r) => num(r["allocated_amount"])));
  return { paid, outstanding: r2(sumBy(pis, (p) => num(p["outstanding_amount"]))) };
}
