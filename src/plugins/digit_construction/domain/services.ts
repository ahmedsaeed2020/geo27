/**
 * DIGIT Construction write services ("Create From" transformations and policy-gated final actions).
 * Every transformation is idempotent (an existing live target is returned, never a second document), keeps stable
 * source line identities, writes only through the adapter (hooks validate) and leaves native ledger posting to
 * src/lib/posting.ts when the user submits the native Sales/Purchase Invoice. No GL/stock rows are written here.
 */
import { zipSync } from "fflate";
import { adapter, DocValidationError, type Doc } from "@/lib/adapter";
import { makePaymentEntry } from "@/lib/posting";
import { currentUser, hasPerm, userRoles } from "@/lib/session";
import { cachedMeta } from "@/lib/catalog";
import { updateDocument } from "@/lib/documentApi";
import { lineAmount, num, r2, sumBy, taxFromTemplate } from "./calc";
import { asSystem, latestForecast, list, policyDefined, POLICY_AFFECTS, rows, today } from "./data";
import { forecastDelta } from "./control";
import { asService, certifiedToDate, retentionAccount, riskChangeEvent } from "./hooks";
import { SCENARIO_MSG, scenarioSource } from "./mgt";
import { durationDays, handoverManifest, proposedBackcharges, SITE_MSG, fill, submittalRoot, type HandoverManifest } from "./site";
import * as TR from "./tendering";
import * as CM from "./commercial";
import * as SC from "./subcontract";
import * as CC from "./costControl";
import { availability, SUP_MSG } from "./supply";
import * as RS from "./resourcing";
import * as FN from "./finance";
import { queueEmail } from "@/lib/coreShared/providers";
type Row = Record<string, unknown>;

export interface Result { ok: boolean; doctype?: string; name?: string; existing?: boolean; errors: string[] }
const ok = (doctype: string, name: string, existing = false): Result => ({ ok: true, doctype, name, existing, errors: [] });
const fail = (...errors: string[]): Result => ({ ok: false, errors });
const inflight = new Set<string>();
/** Double-click guard + validation errors returned instead of thrown. */
function guarded(key: string, fn: () => Result): Result {
  if (inflight.has(key)) return fail("This action is already running — wait for it to finish.");
  inflight.add(key);
  try { return fn(); } catch (e) { return e instanceof DocValidationError ? fail(...e.errors) : fail((e as Error).message); } finally { inflight.delete(key); }
}
const live = (d: Doc | undefined) => !!d && num(d.docstatus) !== 2;
const policyBlock = (k: string) => `Blocked: policy ${k} (${POLICY_AFFECTS[k]?.[0]}) is not defined. Record the owner decision in Construction Settings → Policy Decisions.`;
const abbrOf = (company: unknown) => String(adapter.get("Company", String(company ?? ""))?.["abbr"] ?? "");

// ---------------------------------------------------------------- estimating
/** New estimate version: copy of the approved/base version (same line keys, base_version) or the tender items with blank rates. */
export function createEstimateVersion(tender: string, base?: string): Result {
  return guarded(`est:${tender}`, () => {
    const t = adapter.get("Digit Tender", tender); if (!t) return fail("Tender not found");
    if (["Won", "Lost", "Cancelled"].includes(String(t["status"]))) return fail(`Tender is ${String(t["status"])}; estimates are closed`);
    const gate = TR.goGate(t); if (gate) return fail(gate); // F03-02-2: no estimate before Go
    const open = list("Digit Estimate Version", (v) => v["tender"] === tender && ["Draft", "Returned"].includes(String(v["workflow_state"])));
    if (open[0]) return ok("Digit Estimate Version", open[0].name, true);
    const versions = list("Digit Estimate Version", (v) => v["tender"] === tender);
    const src = base ? adapter.get("Digit Estimate Version", base) : versions.filter((v) => v["workflow_state"] === "Approved")[0];
    const lines = src ? rows(src, "lines").map((l) => ({ ...l })) : rows(t, "items").map((i) => ({ line_key: i["item_key"], tender_item: i["item_key"], code: i["code"], description: i["description"], uom: i["uom"], qty: i["qty"], cost_rate: 0, selling_rate: 0 }));
    const d = adapter.insertDoc("Digit Estimate Version", { tender, project: t["project"] ?? "", company: t["company"], currency: t["currency"] ?? "SAR", version: Math.max(0, ...versions.map((v) => num(v["version"]))) + 1, workflow_state: "Draft", base_version: src?.name ?? "", revision_reason: src ? `Revision of ${src.name}` : "", lines });
    if (t["status"] === "Draft") adapter.update("Digit Tender", tender, { status: "Pricing" });
    return ok("Digit Estimate Version", d.name);
  });
}
/** ET-05: BOQ draft only from the tender's single approved estimate version; rates = explicit selling rates; lines keep estimate line keys. */
export function createBoqFromTender(tender: string): Result {
  return guarded(`boq:${tender}`, () => {
    const t = adapter.get("Digit Tender", tender); if (!t) return fail("Tender not found");
    const existing = t["boq"] ? adapter.get("Digit BOQ", String(t["boq"])) : list("Digit BOQ", (b) => b["tender"] === tender && live(b))[0];
    if (live(existing)) return ok("Digit BOQ", existing!.name, true);
    const approved = list("Digit Estimate Version", (v) => v["tender"] === tender && v["workflow_state"] === "Approved");
    if (approved.length !== 1) return fail(approved.length ? "More than one approved estimate version — supersede the older one first" : "The tender has no approved estimate version");
    const est = approved[0]!;
    const missing = rows(est, "lines").filter((l) => !(num(l["selling_rate"]) > 0));
    if (missing.length) return fail(...missing.map((l) => `${String(l["description"])}: selling rate is missing`));
    // DEC-041: the tender item's section code becomes the BOQ group (else the code prefix, as before)
    const section = (l: Row) => String(rows(t, "items").find((i) => i["item_key"] === l["tender_item"])?.["section_code"] ?? "").trim() || String(l["code"] ?? "").split(".")[0] || "GEN";
    const groups = [...new Set(rows(est, "lines").map(section))];
    const b = adapter.insertDoc("Digit BOQ", { title: `${String(t["title"])} — BOQ`, project: t["project"] ?? "", company: t["company"], tender, estimate_version: est.name, revision: 0, workflow_state: "Draft", currency: est["currency"] ?? "SAR",
      groups: groups.map((g, i) => ({ idx: i + 1, group_code: g, description: g })),
      items: rows(est, "lines").map((l, i) => ({ idx: i + 1, line_key: `B-${String(l["line_key"])}`, group_code: section(l), code: l["code"], description: l["description"], uom: l["uom"], qty: l["qty"], rate: l["selling_rate"], source_estimate_line: l["line_key"] })) });
    adapter.update("Digit Tender", tender, { boq: b.name });
    return ok("Digit BOQ", b.name);
  });
}

// ---------------------------------------------------------------- client contracts
/** `fromAward`: the tender award chain (F03-15-1) drafts the contract from the BOQ draft; activation still needs the approved BOQ. */
export function createContractFromBoq(boq: string, fromAward = false): Result {
  return guarded(`cc:${boq}`, () => {
    const b = adapter.get("Digit BOQ", boq); if (!b) return fail("BOQ not found");
    const ex = list("Digit Client Contract", (c) => c["boq"] === boq)[0]; if (ex) return ok("Digit Client Contract", ex.name, true);
    if (b["workflow_state"] !== "Approved" && !fromAward) return fail("Approve the BOQ before creating the client contract");
    if (!b["project"]) return fail("Set the BOQ project before creating the contract");
    const p = adapter.get("Project", String(b["project"]));
    const c = adapter.insertDoc("Digit Client Contract", { title: String(b["title"]).replace(/ — BOQ$/, ""), project: b["project"], customer: p?.["customer"] ?? adapter.get("Digit Tender", String(b["tender"] ?? ""))?.["customer"] ?? "", company: b["company"] || p?.["company"], boq, currency: b["currency"] ?? "SAR", workflow_state: "Draft",
      sov_lines: rows(b, "items").map((l, i) => ({ idx: i + 1, line_key: l["line_key"], boq_item: l["line_key"], description: l["description"], uom: l["uom"], qty: l["qty"], rate: l["rate"], origin: "Contract" })) });
    return ok("Digit Client Contract", c.name);
  });
}
/** Approve or reject a requested terms revision (row idx) — applied prospectively to future certificates. */
/**
 * CON-03 request a terms revision on a non-draft contract (a draft's terms are edited directly). Appends a Requested
 * row through the shared document API (Digit Client Contract write permission, hooks); the term itself changes only
 * when a director approves it (decideTermsRevision). One open request per term.
 */
export function requestTermsRevision(contract: string, term: string, toValue: number, reason: string, user = currentUser(), effectiveDate = ""): Result {
  return guarded(`terms-req:${contract}:${term}`, () => {
    const c = adapter.get("Digit Client Contract", contract); if (!c) return fail("Contract not found");
    if (!["advance_recovery_pct", "retention_pct", "retention_cap_pct", "payment_days"].includes(term)) return fail("This term cannot be revised");
    if (String(c["workflow_state"] ?? "Draft") === "Draft") return fail("A draft contract's terms are edited on the contract itself");
    if (["Closed"].includes(String(c["workflow_state"]))) return fail("A closed contract's terms cannot be revised");
    if (!Number.isFinite(toValue) || toValue < 0 || (term !== "payment_days" && toValue > 100)) return fail(term === "payment_days" ? "Payment days must be zero or more" : "Percentages must be between 0 and 100");
    if (term === "payment_days" && !Number.isInteger(toValue)) return fail("Payment days must be a whole number");
    if (Math.abs(num(c[term]) - toValue) < 1e-9) return fail("The new value equals the current term");
    if (!reason.trim()) return fail("A reason is required");
    const revs = rows(c, "terms_revisions");
    if (revs.some((r) => r["term"] === term && (r["status"] ?? "Requested") === "Requested")) return fail("This term already has an open revision request");
    if (effectiveDate && effectiveDate.slice(0, 10) < today()) return fail("The effective date cannot be in the past"); // DEC-055 prospective only
    const meta = cachedMeta("Digit Client Contract"); if (!meta) return fail("Digit Client Contract: metadata unavailable");
    const errs = updateDocument(meta, contract, { terms_revisions: [...revs, { term, to_value: String(toValue), reason: reason.trim(), status: "Requested", requested_by: user, from_value: String(num(c[term])), ...(effectiveDate ? { effective_date: effectiveDate.slice(0, 10) } : {}) }] }, user);
    return errs.length ? fail(...errs) : ok("Digit Client Contract", contract);
  });
}
/**
 * CON-03 decide a requested terms revision. Same authority as activating / suspending the contract (Digit Director;
 * Administrator / System Manager), never the requester; an approved value applies prospectively from today.
 */
export function decideTermsRevision(contract: string, idx: number, approve: boolean): Result {
  return guarded(`terms:${contract}:${idx}`, () => asService(() => {
    const u = currentUser();
    if (u !== "Administrator" && !userRoles(u).some((r) => r === "Digit Director" || r === "System Manager")) return fail("Only a Digit Director decides contract terms revisions");
    const c = adapter.get("Digit Client Contract", contract); if (!c) return fail("Contract not found");
    // the decision writes the contract as a service, so the decider's own write access (role + company) is checked first
    const meta = cachedMeta("Digit Client Contract"); if (!meta) return fail("Digit Client Contract: metadata unavailable");
    if (!hasPerm(meta, "write", c, u)) return fail("You do not have write access to this contract");
    const revs = rows(c, "terms_revisions"); const r = revs.find((x) => num(x["idx"]) === idx); if (!r) return fail("Revision row not found");
    if (r["status"] !== "Requested") return fail("This revision was already decided");
    if (approve && String(r["requested_by"] ?? "") === currentUser() && currentUser() !== "Administrator") return fail("Self-approval is not allowed: another user must decide this revision.");
    // DEC-055: a future effective date approves now and applies on that date (applyDueTermsRevisions / certificates dated from it)
    const due = !r["effective_date"] || String(r["effective_date"]).slice(0, 10) <= today();
    const next = revs.map((x) => (x === r ? { ...x, status: approve ? "Approved" : "Rejected", decided_by: currentUser(), decided_on: today(), applied: approve && due ? 1 : 0 } : x));
    adapter.update("Digit Client Contract", contract, { terms_revisions: next, ...(approve && due ? { [String(r["term"])]: num(r["to_value"]) } : {}) });
    return ok("Digit Client Contract", contract);
  }));
}
export function createClaim(contract: string): Result {
  return guarded(`claim:${contract}`, () => {
    const c = adapter.get("Digit Client Contract", contract); if (!c) return fail("Contract not found");
    if (c["workflow_state"] !== "Active") return fail("Claims are raised only against an active contract");
    const draft = list("Digit Client Claim", (x) => x["contract"] === contract && x["workflow_state"] === "Draft")[0]; if (draft) return ok("Digit Client Claim", draft.name, true);
    const d = adapter.insertDoc("Digit Client Claim", { contract, project: c["project"], customer: c["customer"], company: c["company"], workflow_state: "Draft", claim_date: today(), period_end: today() });
    return ok("Digit Client Claim", d.name);
  });
}
export function createCertificate(claim: string): Result {
  return guarded(`cert:${claim}`, () => {
    const cl = adapter.get("Digit Client Claim", claim); if (!cl) return fail("Claim not found");
    const ex = list("Digit Client Certificate", (x) => x["claim"] === claim && live(x))[0]; if (ex) return ok("Digit Client Certificate", ex.name, true);
    if (cl["workflow_state"] !== "Submitted") return fail("Certify only a submitted claim");
    const d = adapter.insertDoc("Digit Client Certificate", { claim, workflow_state: "Draft", cert_date: today() });
    return ok("Digit Client Certificate", d.name);
  });
}
/** CON-04: eligible Sales Invoice draft from a confirmed certificate (net certified amount; taxes from the contract's verified template; P9 gate). */
export function createSalesInvoice(cert: string): Result {
  return guarded(`si:${cert}`, () => {
    const c = adapter.get("Digit Client Certificate", cert); if (!c) return fail("Certificate not found");
    const ex = c["sales_invoice"] ? adapter.get("Sales Invoice", String(c["sales_invoice"])) : undefined; if (live(ex)) return ok("Sales Invoice", ex!.name, true);
    if (num(c.docstatus) !== 1) return fail("Confirm the certificate before invoicing");
    if (!policyDefined("P9")) return fail(policyBlock("P9"));
    const ct = adapter.get("Digit Client Contract", String(c["contract"]));
    // P9 (owner ruling W0-02): the contract's template, else the company's default (standard) sales tax template
    const tpl = ct?.["taxes_and_charges"] ? adapter.get("Sales Taxes and Charges Template", String(ct["taxes_and_charges"])) : companyDefaultTaxTemplate(c["company"]);
    if (!tpl) return fail("The contract has no verified Sales Taxes and Charges Template and the company has no default template; select one on the contract");
    const A = abbrOf(c["company"]); const net = r2(num(c["net_certified"]));
    const item = adapter.get("Item", `${A}-SVC-WORKS`); if (!item) return fail(`Service item ${A}-SVC-WORKS is missing for company ${String(c["company"])}`);
    const tax = taxFromTemplate(net, rows(tpl, "taxes")); if (tax === null) return fail("The tax template uses charge types other than On Net Total; create the invoice from the native form");
    const due = new Date(Date.parse(today()) + num(ct?.["payment_days"] || 30) * 86400000).toISOString().slice(0, 10);
    const grand = r2(net + tax);
    const si = adapter.insertDoc("Sales Invoice", { naming_series: "ACC-SINV-.YYYY.-", customer: c["customer"], customer_name: adapter.get("Customer", String(c["customer"]))?.["customer_name"] ?? c["customer"], company: c["company"], posting_date: today(), due_date: due, project: c["project"],
      currency: "SAR", conversion_rate: 1, selling_price_list: "Standard Selling", price_list_currency: "SAR", plc_conversion_rate: 1, debit_to: `Debtors - ${A}`, taxes_and_charges: tpl.name, digit_client_certificate: cert,
      items: [{ idx: 1, item_code: item.name, item_name: item["item_name"], description: `Progress certificate ${cert} — net of advance recovery ${num(c["advance_recovery"])} and retention ${num(c["retention"])}`, qty: 1, uom: "Nos", stock_uom: "Nos", conversion_factor: 1, rate: net, amount: net, net_rate: net, net_amount: net, income_account: `Contract Revenue - ${A}`, project: c["project"] }],
      taxes: rows(tpl, "taxes").map((t, i) => ({ idx: i + 1, charge_type: t["charge_type"], account_head: t["account_head"], description: t["description"], rate: t["rate"], tax_amount: r2(net * num(t["rate"]) / 100), total: r2(net + net * num(t["rate"]) / 100) })),
      total: net, net_total: net, base_net_total: net, total_taxes_and_charges: tax, grand_total: grand, base_grand_total: grand, rounded_total: Math.round(grand), outstanding_amount: grand, status: "Draft", docstatus: 0 });
    adapter.update("Digit Client Certificate", cert, { sales_invoice: si.name });
    return ok("Sales Invoice", si.name);
  });
}

/** P9 default: the company's default Sales Taxes and Charges Template (is_default), else its only enabled one. */
export function companyDefaultTaxTemplate(company: unknown): Doc | undefined {
  const tpls = adapter.list("Sales Taxes and Charges Template").filter((t) => t["company"] === company && Number(t["disabled"] ?? 0) !== 1);
  return tpls.find((t) => Number(t["is_default"] ?? 0) === 1) ?? (tpls.length === 1 ? tpls[0] : undefined);
}
/**
 * P2 (owner ruling W0-02): an approved retention release is billed by a native Sales Invoice draft for the released
 * amount, credited to the retention receivable account Finance names (the P2 value); idempotent per request.
 */
export function createRetentionInvoice(request: string): Result {
  return guarded(`ret:${request}`, () => {
    const r = adapter.get("Digit Retention Release Request", request); if (!r) return fail("Retention release request not found");
    const ex = r["sales_invoice"] ? adapter.get("Sales Invoice", String(r["sales_invoice"])) : undefined; if (live(ex)) return ok("Sales Invoice", ex!.name, true);
    if (r["workflow_state"] !== "Approved") return fail("Approve the retention release first");
    if (!policyDefined("P2")) return fail(policyBlock("P2"));
    const acct = retentionAccount(); if (!acct) return fail("Finance has not named the retention receivable account (policy P2 value); the release stays a draft");
    const ct = adapter.get("Digit Client Contract", String(r["contract"])); const company = r["company"] ?? ct?.["company"];
    const A = abbrOf(company); const amt = r2(num(r["requested_amount"]));
    const item = adapter.get("Item", `${A}-SVC-WORKS`); if (!item) return fail(`Service item ${A}-SVC-WORKS is missing for company ${String(company)}`);
    const si = adapter.insertDoc("Sales Invoice", { naming_series: "ACC-SINV-.YYYY.-", customer: r["customer"], customer_name: adapter.get("Customer", String(r["customer"]))?.["customer_name"] ?? r["customer"], company, posting_date: today(), due_date: today(), project: r["project"],
      currency: "SAR", conversion_rate: 1, selling_price_list: "Standard Selling", price_list_currency: "SAR", plc_conversion_rate: 1, debit_to: `Debtors - ${A}`,
      items: [{ idx: 1, item_code: item.name, item_name: item["item_name"], description: `Retention release ${request} (${String(r["release_type"] ?? "")}) on contract ${String(r["contract"])}`, qty: 1, uom: "Nos", stock_uom: "Nos", conversion_factor: 1, rate: amt, amount: amt, net_rate: amt, net_amount: amt, income_account: acct, project: r["project"] }],
      total: amt, net_total: amt, base_net_total: amt, grand_total: amt, base_grand_total: amt, rounded_total: Math.round(amt), outstanding_amount: amt, status: "Draft", docstatus: 0 });
    asService(() => adapter.update("Digit Retention Release Request", request, { sales_invoice: si.name }));
    return ok("Sales Invoice", si.name);
  });
}

/** P5 (owner ruling W0-02): the Procurement manager accepts a matching variance with a reason (one per order line). */
export function acceptMatchVariance(po: string, item: string, reason: string): Result {
  return guarded(`dma:${po}:${item}`, () => {
    if (!policyDefined("P5")) return fail(policyBlock("P5"));
    const ex = list("Digit Match Acceptance", (a) => a["purchase_order"] === po && a["item_code"] === item && num(a.docstatus) !== 2)[0]; if (ex) return ok("Digit Match Acceptance", ex.name, true);
    const d = adapter.insertDoc("Digit Match Acceptance", { purchase_order: po, item_code: item, reason });
    return ok("Digit Match Acceptance", d.name);
  });
}

// ---------------------------------------------------------------- subcontracting
export function createMeasurementBook(wo: string): Result {
  return guarded(`mb:${wo}`, () => {
    const w = adapter.get("Digit Subcontract Work Order", wo); if (!w) return fail("Work order not found");
    if (w["workflow_state"] !== "Active") return fail("Record measurements only against an active work order");
    const draft = list("Digit Measurement Book", (b) => b["work_order"] === wo && ["Draft", "Returned"].includes(String(b["workflow_state"])))[0]; if (draft) return ok("Digit Measurement Book", draft.name, true);
    const d = adapter.insertDoc("Digit Measurement Book", { work_order: wo, workflow_state: "Draft", mb_date: today(), entries: rows(w, "lines").map((l, i) => ({ idx: i + 1, wo_line_key: l["line_key"], description: l["scope"], quantity: 0 })) });
    return ok("Digit Measurement Book", d.name);
  });
}
export function createBill(wo: string, book?: string): Result {
  return guarded(`bill:${wo}:${book ?? ""}`, () => {
    const w = adapter.get("Digit Subcontract Work Order", wo); if (!w) return fail("Work order not found");
    if (book) { const ex = list("Digit Subcontractor Bill", (b) => b["measurement_book"] === book && live(b))[0]; if (ex) return ok("Digit Subcontractor Bill", ex.name, true); }
    const draft = list("Digit Subcontractor Bill", (b) => b["work_order"] === wo && b["workflow_state"] === "Draft")[0]; if (draft) return ok("Digit Subcontractor Bill", draft.name, true);
    const cert = certifiedToDate(wo); if (![...cert.values()].some((q) => q > 0)) return fail("No certified measurement exists for this work order yet");
    const d = adapter.insertDoc("Digit Subcontractor Bill", { work_order: wo, measurement_book: book ?? "", workflow_state: "Draft", bill_date: today() });
    if (!rows(d, "lines").length) { adapter.remove("Digit Subcontractor Bill", d.name); return fail("Everything certified on this work order is already billed"); }
    return ok("Digit Subcontractor Bill", d.name);
  });
}
/**
 * SUB-07: native Purchase Invoice draft from an approved bill, source-linked by digit_subcontractor_bill.
 * DEC-084 / DEC-122 / DEC-146 (owner ruling): the subcontract cost is the gross certified value — one line per cost
 * code at its gross share; retention is a payable, not a cost reduction, so it is a native "Deduct" row on the
 * Finance retention payable account (P2; empty = the row has no account and the invoice stays a draft); advance
 * recovery is a "Deduct" row on the supplier payable account it settles; agreed back charges and other deductions
 * are a "Deduct" cost recovery on the subcontract cost account. VAT is unchanged (bill net), so the payable is the same.
 */
export function createPurchaseInvoice(bill: string): Result {
  return guarded(`pi:${bill}`, () => {
    const b = adapter.get("Digit Subcontractor Bill", bill); if (!b) return fail("Bill not found");
    const ex = b["purchase_invoice"] ? adapter.get("Purchase Invoice", String(b["purchase_invoice"])) : list("Purchase Invoice", (p) => p["digit_subcontractor_bill"] === bill && live(p))[0];
    if (live(ex)) return ok("Purchase Invoice", ex!.name, true);
    if (num(b.docstatus) !== 1) return fail("Approve the bill before creating the purchase invoice");
    const A = abbrOf(b["company"]); const item = adapter.get("Item", `${A}-SVC-SUBCON`); if (!item) return fail(`Service item ${A}-SVC-SUBCON is missing`);
    const wo = adapter.get("Digit Subcontract Work Order", String(b["work_order"]));
    const gross = r2(num(b["gross_amount"])), net = r2(num(b["net_amount"]));
    const byCode = new Map<string, number>();
    for (const l of rows(b, "lines")) { const code = String(rows(wo, "lines").find((x) => x["line_key"] === l["wo_line_key"])?.["cost_code"] ?? ""); byCode.set(code, (byCode.get(code) ?? 0) + num(l["amount"])); }
    const codes = [...byCode.entries()]; let left = gross;
    const items = codes.map(([code, amt], i) => { const a = i === codes.length - 1 ? r2(left) : r2(amt); left = r2(left - a); return { idx: i + 1, item_code: item.name, item_name: item["item_name"], description: `Subcontract bill ${bill} RA-${num(b["ra_no"])} ${code}`.trim(), qty: 1, uom: "Nos", stock_uom: "Nos", conversion_factor: 1, rate: a, amount: a, net_rate: a, net_amount: a, base_net_amount: a, expense_account: `Subcontract Cost - ${A}`, project: b["project"], digit_cost_code: code }; });
    const tpl = b["taxes_and_charges"] ? adapter.get("Purchase Taxes and Charges Template", String(b["taxes_and_charges"])) : undefined;
    const tax = tpl ? taxFromTemplate(net, rows(tpl, "taxes")) : 0; if (tax === null) return fail("The purchase tax template uses unsupported charge types");
    const grand = r2(net + (tax ?? 0));
    const retention = r2(num(b["retention_amount"])), advance = r2(num(b["advance_recovery"])), other = r2(gross - net - retention - advance);
    const retAcct = String(adapter.get("Digit Construction Settings", "Digit Construction Settings")?.["retention_payable_account"] ?? "");
    const vatRows = tpl ? rows(tpl, "taxes").map((t) => ({ charge_type: t["charge_type"], account_head: t["account_head"], description: t["description"], rate: t["rate"], tax_amount: r2(net * num(t["rate"]) / 100), category: "Total", add_deduct_tax: "Add" })) : [];
    const deduct = (description: string, account_head: string, amt: number) => (amt > 0.005 ? [{ charge_type: "Actual", account_head, description, rate: 0, tax_amount: amt, category: "Total", add_deduct_tax: "Deduct" }] : []);
    let run = gross;
    const taxes = [...vatRows, ...deduct(`Retention held — bill ${bill}`, retAcct, retention), ...deduct(`Advance recovery — bill ${bill}`, `Creditors - ${A}`, advance), ...deduct(`Back charges and other deductions — bill ${bill}`, `Subcontract Cost - ${A}`, other)]
      .map((t, i) => { run = r2(run + (t.add_deduct_tax === "Deduct" ? -1 : 1) * t.tax_amount); return { idx: i + 1, ...t, tax_amount_after_discount_amount: t.tax_amount, total: run }; });
    // DEC-071: the work order's payment terms give the invoice its due date (same as the bill's expected payment date)
    const terms = wo?.["payment_terms_template"] ? adapter.get("Payment Terms Template", String(wo["payment_terms_template"])) : undefined;
    const due = terms ? new Date(Date.parse(today()) + SC.creditDays(terms) * 86400000).toISOString().slice(0, 10) : today();
    const pi = adapter.insertDoc("Purchase Invoice", { naming_series: "ACC-PINV-.YYYY.-", supplier: b["subcontractor"], supplier_name: adapter.get("Supplier", String(b["subcontractor"]))?.["supplier_name"] ?? b["subcontractor"], company: b["company"], posting_date: today(), bill_no: b["supplier_invoice_no"] || "", bill_date: b["bill_date"], due_date: due, ...(terms ? { payment_terms_template: terms.name } : {}),
      project: b["project"], currency: "SAR", conversion_rate: 1, buying_price_list: "Standard Buying", price_list_currency: "SAR", plc_conversion_rate: 1, credit_to: `Creditors - ${A}`, digit_subcontractor_bill: bill, items,
      ...(tpl ? { taxes_and_charges: tpl.name } : {}), taxes,
      total: gross, net_total: gross, base_net_total: gross, total_taxes_and_charges: r2(grand - gross), grand_total: grand, base_grand_total: grand, rounded_total: Math.round(grand), outstanding_amount: grand, status: "Draft", docstatus: 0 });
    adapter.update("Digit Subcontractor Bill", bill, { purchase_invoice: pi.name });
    return ok("Purchase Invoice", pi.name);
  });
}
/** Pay a submitted subcontractor Purchase Invoice from Construction (P3: payment accounts/methods). */
export function paySubcontractor(pi: string): Result {
  return guarded(`pay:${pi}`, () => {
    if (!policyDefined("P3")) return fail(policyBlock("P3"));
    const p = adapter.get("Purchase Invoice", pi); if (!p || num(p.docstatus) !== 1) return fail("Submit the purchase invoice first");
    if (!(num(p["outstanding_amount"]) > 0)) return fail("Nothing outstanding");
    const pe = makePaymentEntry("Purchase Invoice", pi); return ok("Payment Entry", pe.name);
  });
}

// ---------------------------------------------------------------- cost control
/** Budget draft from the project's approved estimate (cost side): one budget line per estimate line, BOQ cost codes kept. */
/** `boqName`: the award chain names its BOQ draft; otherwise the project's approved BOQ. Lines: cost code × resource type + contingency (tendering.ts). */
export function createBudget(project: string, boqName?: string): Result {
  return guarded(`bud:${project}`, () => {
    const draft = list("Digit Project Cost Budget", (b) => b["project"] === project && b["workflow_state"] === "Draft")[0]; if (draft) return ok("Digit Project Cost Budget", draft.name, true);
    const boq = boqName ? adapter.get("Digit BOQ", boqName) : list("Digit BOQ", (b) => b["project"] === project && b["workflow_state"] === "Approved")[0];
    const est = boq?.["estimate_version"] ? adapter.get("Digit Estimate Version", String(boq["estimate_version"])) : undefined;
    const versions = list("Digit Project Cost Budget", (b) => b["project"] === project);
    const approved = versions.filter((b) => b["workflow_state"] === "Approved")[0];
    const lines = approved ? rows(approved, "lines").map((l) => ({ ...l })) : est ? TR.budgetLinesFromEstimate(est, boq) : [];
    const p = adapter.get("Project", project);
    // lines copied from the approved estimate / budget keep their codes (F06-01-1 checks codes a user picks)
    const d = asService(() => adapter.insertDoc("Digit Project Cost Budget", { project, company: p?.["company"], version: Math.max(0, ...versions.map((v) => num(v["version"]))) + 1, source_boq: boq?.name ?? "", workflow_state: "Draft", effective_date: today(), lines }));
    return ok("Digit Project Cost Budget", d.name);
  });
}
export function createForecast(project: string): Result {
  return guarded(`fc:${project}`, () => {
    const draft = list("Digit Cost Forecast Snapshot", (f) => f["project"] === project && f["workflow_state"] === "Draft")[0]; if (draft) return ok("Digit Cost Forecast Snapshot", draft.name, true);
    const d = adapter.insertDoc("Digit Cost Forecast Snapshot", { project, period: today().slice(0, 7), cutoff_date: today(), workflow_state: "Draft", prepared_by: currentUser() });
    return ok("Digit Cost Forecast Snapshot", d.name);
  });
}

// ---------------------------------------------------------------- procurement (native documents, source-linked)
/** PROC-05 award: native Purchase Order draft from the chosen Supplier Quotation (keeps SQ + MR line identities). */
export function createPurchaseOrderFromQuotation(sq: string): Result {
  return guarded(`po:${sq}`, () => {
    const q = adapter.get("Supplier Quotation", sq); if (!q) return fail("Supplier quotation not found");
    if (num(q.docstatus) !== 1) return fail("Submit the supplier quotation before awarding");
    const ex = list("Purchase Order", (p) => live(p) && rows(p, "items").some((i) => i["supplier_quotation"] === sq))[0]; if (ex) return ok("Purchase Order", ex.name, true);
    return ok("Purchase Order", purchaseOrderFromQuotationLines(q, rows(q, "items")).name);
  });
}
/** Draft purchase order carrying the given quotation lines (quotation and material request references kept on every line). */
function purchaseOrderFromQuotationLines(q: Doc, src: Row[]): Doc {
  const sq = q.name;
  const items = src.map((i, k) => {
    const mr = i["material_request"] ? adapter.get("Material Request", String(i["material_request"])) : undefined; const mri = rows(mr, "items").find((x) => x["name"] === i["material_request_item"] || (x["item_code"] === i["item_code"]));
    return { idx: k + 1, item_code: i["item_code"], item_name: i["item_name"], description: i["description"], qty: i["qty"], uom: i["uom"], stock_uom: i["stock_uom"] ?? i["uom"], conversion_factor: 1, rate: i["rate"], amount: i["amount"], net_rate: i["rate"], net_amount: i["amount"],
      warehouse: mri?.["warehouse"] ?? i["warehouse"], schedule_date: mri?.["schedule_date"] ?? today(), supplier_quotation: sq, supplier_quotation_item: i["name"] ?? "", material_request: i["material_request"] ?? "", material_request_item: mri?.["name"] ?? i["material_request_item"] ?? "", project: mri?.["project"] ?? i["project"] ?? "", digit_cost_code: mri?.["digit_cost_code"] ?? "" };
  });
  const net = sumBy(items, (i) => num(i.amount));
  return adapter.insertDoc("Purchase Order", { naming_series: "PUR-ORD-.YYYY.-", supplier: q["supplier"], supplier_name: q["supplier_name"], company: q["company"], transaction_date: today(), schedule_date: items[0]?.schedule_date ?? today(), buying_price_list: "Standard Buying", currency: "SAR", conversion_rate: 1, taxes_and_charges: q["taxes_and_charges"] ?? "",
    taxes: rows(q, "taxes").map((t): Row => ({ ...t, tax_amount: r2(net * num(t["rate"]) / 100), total: r2(net * (1 + num(t["rate"]) / 100)) })), items, total: net, net_total: net, base_net_total: net, total_taxes_and_charges: r2(sumBy(rows(q, "taxes"), (t) => net * num(t["rate"]) / 100)),
    grand_total: r2(net + sumBy(rows(q, "taxes"), (t) => net * num(t["rate"]) / 100)), status: "Draft", docstatus: 0, per_received: 0, per_billed: 0 });
}
/**
 * Split award (owner interface round 2026-11-16, idea 5): a draft purchase order with only the chosen lines of one
 * quotation. A line already on a live purchase order from any quotation of the same request for quotation is refused,
 * so a line is never awarded twice; re-running for lines already on one order of this quotation returns that order.
 */
export function awardQuotationLines(sq: string, itemCodes: string[]): Result {
  const codes = [...new Set(itemCodes.map(String).filter(Boolean))].sort();
  return guarded(`po:${sq}:${codes.join(",")}`, () => {
    const q = adapter.get("Supplier Quotation", sq); if (!q) return fail("Supplier quotation not found");
    if (num(q.docstatus) !== 1) return fail("Submit the supplier quotation before awarding");
    if (!codes.length) return fail("Select at least one line to award");
    const lines = rows(q, "items").filter((i) => codes.includes(String(i["item_code"] ?? "")));
    const absent = codes.filter((c) => !lines.some((i) => i["item_code"] === c)); if (absent.length) return fail(`${absent.join(", ")} is not priced on ${sq}`);
    const rfqs = new Set(lines.map((i) => String(i["request_for_quotation"] ?? "")).filter(Boolean));
    const siblings = new Set([sq, ...list("Supplier Quotation", (s) => live(s) && rows(s, "items").some((i) => rfqs.has(String(i["request_for_quotation"] ?? "")))).map((s) => s.name)]);
    const onPo = (c: string) => list("Purchase Order", (p) => live(p) && rows(p, "items").some((i) => siblings.has(String(i["supplier_quotation"] ?? "")) && i["item_code"] === c))[0];
    const taken = codes.map((c) => ({ c, po: onPo(c) })).filter((x) => x.po);
    const own = [...new Set(taken.filter((x) => rows(x.po, "items").some((i) => i["supplier_quotation"] === sq && i["item_code"] === x.c)).map((x) => x.po!.name))];
    if (taken.length === codes.length && own.length === 1 && taken.every((x) => x.po!.name === own[0])) return ok("Purchase Order", own[0]!, true);
    if (taken.length) return fail(...taken.map((x) => `${x.c} is already awarded on purchase order ${x.po!.name}`));
    return ok("Purchase Order", purchaseOrderFromQuotationLines(q, lines).name);
  });
}

// ---------------------------------------------------------------- finance & closeout
export function createFinalAccount(contract: string): Result {
  return guarded(`fa:${contract}`, () => {
    const c = adapter.get("Digit Client Contract", contract); if (!c) return fail("Contract not found");
    const ex = list("Digit Final Account", (f) => f["contract"] === contract && live(f))[0]; if (ex) return ok("Digit Final Account", ex.name, true);
    const d = adapter.insertDoc("Digit Final Account", { contract, workflow_state: "Draft" }); return ok("Digit Final Account", d.name);
  });
}
export function createRetentionRelease(contract: string, type: "Partial" | "Final", amount: number): Result {
  return guarded(`rr:${contract}`, () => {
    const d = adapter.insertDoc("Digit Retention Release Request", { contract, release_type: type, requested_amount: amount, workflow_state: "Draft" }); return ok("Digit Retention Release Request", d.name);
  });
}
export const CLOSEOUT_TEMPLATE: [string, string][] = [
  ["Technical", "Practical completion certificate received"], ["Technical", "Snag list closed"], ["Technical", "As-built drawings handed over"], ["Technical", "O&M manuals and warranties handed over"],
  ["Commercial", "Client final account agreed"], ["Commercial", "All variations settled"], ["Commercial", "Subcontractor final accounts closed"], ["Commercial", "Retention release plan agreed"],
  ["Financial", "All certificates invoiced"], ["Financial", "Client receivables collected"], ["Financial", "Supplier and subcontractor payables settled"], ["Financial", "Project cost ledger reconciled"],
];
export function createCloseout(project: string): Result {
  return guarded(`clo:${project}`, () => {
    const ex = list("Digit Closeout Assessment", (c) => c["project"] === project && c["status"] !== "Completed")[0]; if (ex) return ok("Digit Closeout Assessment", ex.name, true);
    const d = adapter.insertDoc("Digit Closeout Assessment", { project, assessment_date: today(), rows: CLOSEOUT_TEMPLATE.map(([area, item], i) => ({ idx: i + 1, area, item, status: "Pending" })) });
    return ok("Digit Closeout Assessment", d.name);
  });
}
/** P4: approve a closeout row marked Not Applicable (a second user, policy-defined approver). */
export function approveNotApplicable(assessment: string, idx: number): Result {
  return guarded(`na:${assessment}:${idx}`, () => {
    if (!policyDefined("P4")) return fail(policyBlock("P4"));
    const a = adapter.get("Digit Closeout Assessment", assessment); if (!a) return fail("Assessment not found");
    const rs = rows(a, "rows"); const r = rs.find((x) => num(x["idx"]) === idx); if (!r || r["status"] !== "Not Applicable") return fail("Only rows marked Not Applicable need this approval");
    // P4 (owner ruling W0-02): a Digit Director other than the user who marked the row, with a recorded reason
    const me = currentUser();
    if (me !== "Administrator" && !userRoles(me).includes("Digit Director")) return fail("Only a Digit Director approves a Not Applicable closeout item (policy P4)");
    if (String(r["na_marked_by"] ?? "") && String(r["na_marked_by"]) === me) return fail("A different Digit Director must approve an item you marked Not Applicable (policy P4)");
    if (!String(r["na_reason"] ?? "").trim()) return fail("Record the reason the item is Not Applicable before approval (policy P4)");
    adapter.update("Digit Closeout Assessment", assessment, { rows: rs.map((x) => (x === r ? { ...x, na_approved_by: currentUser() } : x)) });
    return ok("Digit Closeout Assessment", assessment);
  });
}
/** P7: post an approved site expense as a Journal Entry draft (expense account = the defined P7 decision value). */
export function createExpenseJournal(expense: string): Result {
  return guarded(`je:${expense}`, () => {
    if (!policyDefined("P7")) return fail(policyBlock("P7"));
    const x = adapter.get("Digit Site Expense", expense); if (!x) return fail("Expense not found");
    if (x["workflow_state"] !== "Approved") return fail("Approve the expense first");
    const ex = x["journal_entry"] ? adapter.get("Journal Entry", String(x["journal_entry"])) : undefined; if (live(ex)) return ok("Journal Entry", ex!.name, true);
    // P7 (owner ruling W0-02): the expense account of the expense category in the project's company (mapping named by Finance)
    const p = adapter.get("Project", String(x["project"])); const A = abbrOf(p?.["company"]); const amt = num(x["amount"]);
    const map = adapter.list("Digit Expense Account").find((m) => m["company"] === p?.["company"] && m["expense_category"] === x["category"] && Number(m["disabled"] ?? 0) !== 1);
    const acct = String(map?.["account"] ?? "");
    if (!acct) return fail(`No expense account is mapped for category ${String(x["category"] ?? "")} in company ${String(p?.["company"] ?? "")} (Construction settings → Site expense accounts; named by Finance)`);
    if (!adapter.get("Account", acct)) return fail(`Mapped expense account ${acct} does not exist`);
    // P9 (owner ruling): a VAT-inclusive expense splits its VAT with the company's default purchase tax template; without one no journal is made
    const vatSplit = x["vat_status"] === "Inclusive";
    const tpl = vatSplit ? adapter.list("Purchase Taxes and Charges Template").filter((t) => t["company"] === p?.["company"] && Number(t["disabled"] ?? 0) !== 1).sort((a, b) => num(b["is_default"]) - num(a["is_default"]))[0] : undefined;
    const tax = rows(tpl, "taxes").find((r) => num(r["rate"]) > 0);
    if (vatSplit && (!tpl || !tax)) return fail(RS.fill(RS.RES_MSG.vatTemplate, String(p?.["company"] ?? "")));
    const net = tax ? r2(amt / (1 + num(tax["rate"]) / 100)) : amt, vat = r2(amt - net);
    const cc = map?.["cost_center"] || p?.["cost_center"] ? { cost_center: map?.["cost_center"] || p?.["cost_center"] } : {};
    const lines: Row[] = [{ idx: 1, account: acct, debit_in_account_currency: net, debit: net, credit_in_account_currency: 0, credit: 0, project: x["project"], digit_cost_code: x["cost_code"] ?? "", ...cc }];
    if (tax && vat) lines.push({ idx: 2, account: String(tax["account_head"] ?? ""), debit_in_account_currency: vat, debit: vat, credit_in_account_currency: 0, credit: 0 });
    lines.push({ idx: lines.length + 1, account: `Cash - ${A}`, debit_in_account_currency: 0, debit: 0, credit_in_account_currency: amt, credit: amt });
    const je = adapter.insertDoc("Journal Entry", { naming_series: "ACC-JV-.YYYY.-", voucher_type: "Journal Entry", company: p?.["company"], posting_date: x["expense_date"], user_remark: `Site expense ${expense}: ${String(x["description"] ?? "")}`,
      accounts: lines, total_debit: amt, total_credit: amt, docstatus: 0 });
    adapter.update("Digit Site Expense", expense, { journal_entry: je.name });
    return ok("Journal Entry", je.name);
  });
}

// ---------------------------------------------------------------- 01 management (FT-01-01 scenarios, FT-01-05 risks)
/**
 * F01-01-1 «Load current projects»: every active construction project of the scenario's company as a line (revised
 * contract value, EAC of the latest approved forecast else revised budget, probability 100%) plus the monthly cash from
 * Cashflow Forecast Items. Project lines and months are replaced; proposed lines (no project) are kept. Draft only.
 */
export function loadScenarioProjects(scenario: string): Result {
  return guarded(`scen:${scenario}`, () => {
    const sc = adapter.get("Digit Portfolio Scenario", scenario); if (!sc) return fail("Scenario not found");
    if (num(sc.docstatus) !== 0 || !["Draft", "", undefined].includes(sc["workflow_state"] as string)) return fail("Only a draft scenario can load projects");
    const src = scenarioSource({ company: (sc["company"] as string) || undefined });
    if (!src.lines.length) return fail(SCENARIO_MSG.noProjects);
    const proposed = rows(sc, "project_lines").filter((l) => !l["project"]);
    adapter.update("Digit Portfolio Scenario", scenario, { project_lines: [...src.lines, ...proposed].map((l, i) => ({ ...l, idx: i + 1 })), cash_months: src.months.map((m, i) => ({ ...m, idx: i + 1 })), source_cutoff: today() });
    return ok("Digit Portfolio Scenario", scenario);
  });
}
/** DEC-001: a shared scenario is never edited; a revision is a new draft based on it (existing open revision reused). */
export function reviseScenario(scenario: string): Result {
  return guarded(`scenrev:${scenario}`, () => {
    const sc = adapter.get("Digit Portfolio Scenario", scenario); if (!sc) return fail("Scenario not found");
    const open = list("Digit Portfolio Scenario", (d) => d["based_on"] === scenario && num(d.docstatus) === 0)[0];
    if (open) return ok("Digit Portfolio Scenario", open.name, true);
    const keep = (rs: Row[], f: string[]) => rs.map((r, i) => ({ idx: i + 1, ...Object.fromEntries(f.map((k) => [k, r[k]])) }));
    const d = adapter.insertDoc("Digit Portfolio Scenario", { title: String(sc["title"] ?? ""), plan_year: sc["plan_year"], company: sc["company"], workflow_state: "Draft", based_on: scenario, revision_no: num(sc["revision_no"]) + 1 || 2,
      owner_user: currentUser(), period_start: sc["period_start"], period_end: sc["period_end"], period_unit: sc["period_unit"],
      project_lines: keep(rows(sc, "project_lines"), ["project", "proposed_name", "include", "start_date", "end_date", "contract_value", "budget_cost", "probability_pct"]), cash_months: keep(rows(sc, "cash_months"), ["period", "inflow", "outflow"]) });
    return ok("Digit Portfolio Scenario", d.name);
  });
}
/** F01-05-3 from a screen button: the risk's draft change event (created once, then reused). */
export function changeEventFromRisk(risk: string): Result {
  return guarded(`riskce:${risk}`, () => {
    const r = adapter.get("Digit Risk", risk); if (!r) return fail("Risk not found");
    if (!["Active", "Impacted"].includes(String(r["workflow_state"]))) return fail("Only an active or impacted risk raises a change event");
    const had = r["change_event"] && adapter.get("Digit Change Event", String(r["change_event"]));
    const ce = asService(() => riskChangeEvent(r)); if (!ce) return fail("Change event could not be created");
    return ok("Digit Change Event", ce.name, !!had);
  });
}

// ---------------------------------------------------------------- department 02 (project, site and quality)
const firstContract = (project: unknown) => list("Digit Client Contract", (c) => c["project"] === project && num(c.docstatus) === 1)[0]?.name ?? "";
/** F02-03-1: snapshot of every dated task of the project (dates, inclusive duration, progress, weight). A second Project
 * baseline is refused by the hook; replaceProjectBaseline supersedes the active one first (the approval path). */
export function captureBaseline(project: string, type = "Project", title = "", replace = false): Result {
  return guarded(`baseline:${project}`, () => {
    const p = adapter.get("Project", project); if (!p) return fail("Project not found");
    const tasks = list("Task", (x) => x["project"] === project && !!x["exp_start_date"] && !!x["exp_end_date"]);
    if (!tasks.length) return fail("The project has no dated tasks to capture");
    if (replace) for (const b of list("Digit Schedule Baseline", (x) => x["project"] === project && x["baseline_type"] === "Project" && (x["status"] || "Active") === "Active"))
      asService(() => adapter.update("Digit Schedule Baseline", b.name, { status: "Superseded" }));
    const prev = list("Digit Schedule Baseline", (x) => x["project"] === project && x["baseline_type"] === type).sort((a, b) => String(b["captured_on"] ?? "").localeCompare(String(a["captured_on"] ?? "")))[0];
    const d = adapter.insertDoc("Digit Schedule Baseline", { project, company: p["company"], baseline_name: title || `${project} ${type} ${today()}`, baseline_type: type, status: "Active", captured_on: `${today()} 00:00:00`,
      based_on_revision: replace && prev ? prev.name : "", task_snapshots: tasks.map((x, i) => ({ idx: i + 1, task: x.name, task_subject: x["subject"] ?? "", baseline_start: String(x["exp_start_date"]).slice(0, 10), baseline_end: String(x["exp_end_date"]).slice(0, 10),
        duration_days: durationDays(String(x["exp_start_date"]), String(x["exp_end_date"])), progress_at_capture: num(x["progress"]), weight: num(x["task_weight"]) })) });
    return ok("Digit Schedule Baseline", d.name);
  });
}
/** F02-03-3: copies the baseline dates back to the tasks (all-or-nothing, as the session user) only after confirmation; each task keeps its Version history. */
export function restoreBaseline(baseline: string, confirmed: boolean, user = currentUser()): Result & { changed?: string[] } {
  if (!confirmed) return fail(SITE_MSG.confirm);
  const b = adapter.get("Digit Schedule Baseline", baseline); if (!b) return fail("Baseline not found");
  const meta = cachedMeta("Task"); if (!meta) return fail("Task metadata is not loaded");
  const plan = rows(b, "task_snapshots").map((r) => ({ task: String(r["task"]), start: String(r["baseline_start"] ?? "").slice(0, 10), end: String(r["baseline_end"] ?? "").slice(0, 10), t: adapter.get("Task", String(r["task"])) }))
    .filter((x) => x.t && x.start && x.end && (String(x.t["exp_start_date"] ?? "").slice(0, 10) !== x.start || String(x.t["exp_end_date"] ?? "").slice(0, 10) !== x.end));
  for (const x of plan) if (!hasPerm(meta, "write", x.t as Doc, user)) return fail(`No permission to write Task ${x.task}`);
  const done: typeof plan = [];
  for (const x of plan) {
    const e = updateDocument(meta, x.task, { exp_start_date: x.start, exp_end_date: x.end }, user);
    if (e.length) { for (const r of done.reverse()) updateDocument(meta, r.task, { exp_start_date: String(r.t!["exp_start_date"]).slice(0, 10), exp_end_date: String(r.t!["exp_end_date"]).slice(0, 10) }, user); return fail(...e.map((m) => `${x.task}: ${m}`)); }
    done.push(x);
  }
  adapter.insertDoc("Comment", { comment_type: "Info", reference_doctype: "Digit Schedule Baseline", reference_name: baseline, content: `Restored ${done.length} task date(s) from ${baseline} · استُعيدت تواريخ ${done.length} مهمة من ${baseline}` });
  return { ...ok("Digit Schedule Baseline", baseline), changed: done.map((x) => x.task) };
}
/** F02-04-1: every incomplete task that starts or continues inside the week window is added once. */
export function generateLookahead(lookahead: string): Result & { added?: string[] } {
  return guarded(`lookahead:${lookahead}`, () => {
    const la = adapter.get("Digit Lookahead", lookahead); if (!la) return fail("Lookahead not found");
    if (la["status"] && la["status"] !== "Draft") return fail("Only a draft lookahead can be generated");
    const from = String(la["week_start"] ?? "").slice(0, 10); if (!from) return fail("Set the week start first");
    const to = String(la["week_end"] ?? "").slice(0, 10) || new Date(Date.parse(from) + (7 * Math.max(1, num(la["weeks"])) - 1) * 86400000).toISOString().slice(0, 10);
    const have = new Set(rows(la, "lookahead_rows").map((r) => String(r["task"] ?? "")));
    const add = list("Task", (x) => x["project"] === la["project"] && x["status"] !== "Completed" && x["status"] !== "Cancelled" && num(x["progress"]) < 100 && !!x["exp_start_date"] && !!x["exp_end_date"]
      && String(x["exp_start_date"]).slice(0, 10) <= to && String(x["exp_end_date"]).slice(0, 10) >= from && !have.has(x.name));
    if (!add.length) return { ...ok("Digit Lookahead", lookahead, true), added: [] };
    adapter.update("Digit Lookahead", lookahead, { week_end: to, lookahead_rows: [...rows(la, "lookahead_rows"), ...add.map((x) => ({ task: x.name, description: x["subject"] ?? x.name, committed: 0, completed: 0,
      planned_from: String(x["exp_start_date"]).slice(0, 10) < from ? from : String(x["exp_start_date"]).slice(0, 10), planned_to: String(x["exp_end_date"]).slice(0, 10) > to ? to : String(x["exp_end_date"]).slice(0, 10) }))] });
    return { ...ok("Digit Lookahead", lookahead), added: add.map((x) => x.name) };
  });
}
/** F02-06-4: one change event per RFI (origin RFI); the linked live one is returned on a second click. */
export function createChangeEventFromRfi(rfi: string): Result {
  return guarded(`ce-rfi:${rfi}`, () => {
    const r = adapter.get("Digit RFI", rfi); if (!r) return fail("RFI not found");
    if (r["workflow_state"] === "Draft") return fail("Send the RFI before creating a change event from it");
    if (r["cost_impact"] === "No") return fail("The RFI is recorded with no cost impact");
    const linked = r["change_event"] ? adapter.get("Digit Change Event", String(r["change_event"])) : undefined;
    if (live(linked)) return ok("Digit Change Event", linked!.name, true);
    const found = list("Digit Change Event", (c) => c["rfi"] === rfi && live(c))[0];
    const ce = found ?? adapter.insertDoc("Digit Change Event", { title: String(r["subject"] || rfi), project: r["project"], company: r["company"], contract: firstContract(r["project"]), workflow_state: "Draft", scope: "Not Determined",
      origin_type: "RFI", rfi, source_rfi: rfi, origin_name_doctype: "Digit RFI", origin_name: rfi, description: String(r["question"] ?? ""), change_reason: r["rfi_type"] === "Design" ? "Design Error" : r["rfi_type"] === "Site" ? "Site Condition" : "Client Request" });
    asService(() => adapter.update("Digit RFI", rfi, { change_event: ce.name, change_event_status: "Raised" }));
    return ok("Digit Change Event", ce.name, !!found);
  });
}
/** F02-11-2: a site instruction flagged Possible Change raises one change event (origin Client Instruction). */
export function changeEventFromCorrespondence(name: string): Result {
  return guarded(`ce-corr:${name}`, () => {
    const c = adapter.get("Digit Correspondence", name); if (!c) return fail("Correspondence not found");
    if (c["corr_type"] !== "Site Instruction" || c["contractual_flag"] !== "Possible Change") return fail("Only a site instruction flagged Possible Change raises a change event");
    const linked = c["change_event"] ? adapter.get("Digit Change Event", String(c["change_event"])) : undefined;
    if (live(linked)) return ok("Digit Change Event", linked!.name, true);
    const found = list("Digit Change Event", (x) => x["origin_name_doctype"] === "Digit Correspondence" && x["origin_name"] === name && live(x))[0];
    const ce = found ?? adapter.insertDoc("Digit Change Event", { title: String(c["subject"] || name), project: c["project"], company: c["company"], contract: firstContract(c["project"]), workflow_state: "Draft", scope: "Not Determined",
      origin_type: "Client Instruction", origin_name_doctype: "Digit Correspondence", origin_name: name, change_reason: "Client Request", description: `${String(c["party"] ?? "")} ${String(c["ref_no"] ?? "")}`.trim() });
    asService(() => adapter.update("Digit Correspondence", name, { change_event: ce.name, change_event_status: "Raised" }));
    return ok("Digit Change Event", ce.name, !!found);
  });
}
/** F02-07-3: a C or D decision is resubmitted as the same number with revision + 1; the returned revision becomes read-only. */
export function resubmitSubmittal(name: string): Result {
  return guarded(`resub:${name}`, () => {
    const x = adapter.get("Digit Submittal", name); if (!x) return fail("Submittal not found");
    if (!["C", "D"].includes(String(x["decision_code"] ?? "").slice(0, 1))) return fail("Only a C or D decision is resubmitted as a new revision");
    const root = submittalRoot(name), rev = num(x["revision"]) + 1, next = `${root}-R${rev}`;
    const have = adapter.get("Digit Submittal", next); if (live(have)) return ok("Digit Submittal", next, true);
    const { name: _n, creation: _c, modified: _m, owner: _o, ...rest } = x; void _n; void _c; void _m; void _o;
    const d = adapter.insertDoc("Digit Submittal", { ...rest, name: next, revision: rev, revision_no: rev, workflow_state: "Draft", docstatus: 0, decision_code: "", final_response: "", actual_return: "", distribution_date: "",
      review_steps: rows(x, "review_steps").map((st, i) => ({ step: st["step"] ?? i + 1, reviewer: st["reviewer"], due: "", outcome: "", comment: "", done_on: "" })) });
    return ok("Digit Submittal", d.name);
  });
}
/** F02-14-3: the QS applies the proposed back-charges of the work order to this draft bill's other deductions (once per defect). */
export function applyBackcharges(bill: string): Result & { applied?: { defect: string; amount: number }[] } {
  return guarded(`backcharge:${bill}`, () => {
    const b = adapter.get("Digit Subcontractor Bill", bill); if (!b) return fail("Bill not found");
    if (num(b.docstatus) !== 0) return fail("Back-charges are applied to a draft bill only");
    const props = proposedBackcharges(String(b["work_order"] ?? ""));
    if (!props.length) return { ...ok("Digit Subcontractor Bill", bill, true), applied: [] };
    const total = r2(sumBy(props, (x) => x.amount));
    adapter.update("Digit Subcontractor Bill", bill, { other_deductions: r2(num(b["other_deductions"]) + total) });
    for (const x of props) asService(() => adapter.update("Digit Defect", x.defect, { backcharge_status: `Applied: ${bill}` }));
    return { ...ok("Digit Subcontractor Bill", bill), applied: props };
  });
}
/** F02-18-2 / DEC-026 / DEC-027: the handover package as ZIP (manifest + accepted files), internal download only; refused while a required item is missing. */
export function exportHandoverPackage(pkg: string): Result & { manifest?: HandoverManifest; zip?: Uint8Array } {
  const p = adapter.get("Digit Handover Package", pkg); if (!p) return fail("Handover package not found");
  const m = handoverManifest(p); if (!m.manifest) return fail(fill(SITE_MSG.missingReq, m.missing.join(", ")));
  const files: Record<string, Uint8Array> = { "manifest.json": new TextEncoder().encode(JSON.stringify(m.manifest, null, 2)) };
  for (const f of m.manifest.files) {
    const file = list("File", (x) => x["file_url"] === f.file || x["file_name"] === f.file)[0];
    const content = String(file?.["content"] ?? "");
    if (content.startsWith("data:")) { const b64 = content.split(",")[1] ?? ""; files[`${String(f.requirement).padStart(2, "0")}-${String(file?.["file_name"] ?? f.file).replace(/[\\/]/g, "_")}`] = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)); }
  }
  const zip = zipSync(files);
  asService(() => adapter.update("Digit Handover Package", pkg, { generated_at: `${today()} 00:00:00`, file_count: m.manifest!.files.length, version_no: num(p["version_no"]) + 1 }));
  return { ...ok("Digit Handover Package", pkg), manifest: m.manifest, zip };
}

// ---------------------------------------------------------------- department 03 estimating and tendering (tendering.ts)
/** F03-04-2: copy a reviewed takeoff's item totals into the tender items. */
export function transferTakeoff(sheet: string): Result & { changed?: { item_key: string; from: number; to: number }[] } {
  const r = guarded(`tko:${sheet}`, () => {
    const sh = adapter.get("Digit Takeoff Sheet", sheet); if (!sh) return fail("Takeoff sheet not found");
    if (sh["status"] !== "Reviewed") return fail(TR.TND_MSG.reviewFirst);
    const t = adapter.get("Digit Tender", String(sh["tender"] ?? "")); if (!t) return fail("Tender not found");
    const tot = TR.takeoffTotals(sh); const changed: { item_key: string; from: number; to: number }[] = [];
    const items = rows(t, "items").map((i) => { const k = String(i["item_key"] ?? ""); if (!tot.has(k) || num(i["qty"]) === tot.get(k)) return i; changed.push({ item_key: k, from: num(i["qty"]), to: tot.get(k)! }); return { ...i, qty: tot.get(k) }; });
    if (changed.length) adapter.update("Digit Tender", t.name, { items });
    return { ...ok("Digit Tender", t.name, !changed.length), changed } as Result;
  });
  return r;
}
/** F03-05-1 / DEC-036: import CSV rows as ready-quantity takeoff lines (re-import replaces rows with the same element id). */
export function importTakeoffCsv(sheet: string, text: string, fileName = ""): Result & { added?: number; replaced?: number } {
  return guarded(`tkcsv:${sheet}`, () => {
    const sh = adapter.get("Digit Takeoff Sheet", sheet); if (!sh) return fail("Takeoff sheet not found");
    const p = TR.takeoffCsvRows(text, fileName); if (p.errors.length) return fail(...p.errors);
    const ids = new Set(p.rows.map((r) => String(r["element_id"] ?? "")).filter(Boolean));
    const keep = rows(sh, "dimensions").filter((d) => !(d["element_id"] && ids.has(String(d["element_id"]))));
    adapter.update("Digit Takeoff Sheet", sh.name, { dimensions: [...keep, ...p.rows] });
    return { ...ok("Digit Takeoff Sheet", sh.name), added: p.rows.length, replaced: rows(sh, "dimensions").length - keep.length } as Result;
  });
}
/** F03-11-1: send invitations — every invitee needs an approved subcontractor profile (P8); one notification per invitee. */
export function sendBidInvitations(pkg: string): Result & { sent?: string[] } {
  return guarded(`inv:${pkg}`, () => {
    const p = adapter.get("Digit Bid Package", pkg); if (!p) return fail("Bid package not found");
    if (["Closed", "Awarded"].includes(String(p["status"]))) return fail(TR.TND_MSG.pkgClosed);
    const bad = rows(p, "invitees").filter((i) => !TR.approvedSubcontractor(i["supplier"])).map((i) => fill(TR.TND_MSG.notApproved, i["supplier"]));
    if (bad.length) return fail(...bad);
    const sent: string[] = [];
    const invitees = rows(p, "invitees").map((i) => { if (i["invited_on"] && i["response"]) return i; sent.push(String(i["supplier"])); return { ...i, invited_on: today(), response: i["response"] || "Pending" }; });
    adapter.update("Digit Bid Package", p.name, { invitees });
    for (const sup of sent) {
      const name = `BIDINV-${p.name}-${sup}`;
      if (!adapter.get("Notification Log", name)) adapter.insertDocQuiet("Notification Log", { name, subject: `Invitation to bid: ${p.name} (${String(p["trade"] ?? "")}) — due ${String(p["due_date"] ?? "")}`, subject_ar: `دعوة لتقديم عرض: ${p.name} — الموعد ${String(p["due_date"] ?? "")}`, for_user: currentUser(), type: "Alert", document_type: "Digit Bid Package", document_name: p.name, email_content: `Supplier ${sup}`, read: 0 });
    }
    return { ...ok("Digit Bid Package", p.name, !sent.length), sent } as Result;
  });
}
/** F03-11-2: close a package manually, or every open package whose deadline has passed. */
export function closeBidPackage(pkg: string): Result {
  return guarded(`close:${pkg}`, () => {
    const p = adapter.get("Digit Bid Package", pkg); if (!p) return fail("Bid package not found");
    if (p["status"] !== "Open") return ok("Digit Bid Package", p.name, true);
    adapter.update("Digit Bid Package", p.name, { status: "Closed" }); return ok("Digit Bid Package", p.name);
  });
}
export function closeExpiredPackages(now = new Date().toISOString().slice(0, 19).replace("T", " ")): string[] {
  const end = (v: unknown) => { const x = String(v ?? "").replace("T", " "); return x.length <= 10 ? `${x} 23:59:59` : x; };
  const due = list("Digit Bid Package", (p) => p["status"] === "Open" && !!p["due_date"] && end(p["due_date"]) < now);
  for (const p of due) adapter.update("Digit Bid Package", p.name, { status: "Closed" });
  return due.map((p) => p.name);
}
/** F03-12-1: open (or refresh) the package's leveling sheet — one per package. */
export function levelBids(pkg: string): Result {
  return guarded(`lev:${pkg}`, () => {
    const p = adapter.get("Digit Bid Package", pkg); if (!p) return fail("Bid package not found");
    const ex = list("Digit Bid Leveling", (l) => l["bid_package"] === pkg && num(l.docstatus) !== 2)[0];
    if (ex) { if (ex["workflow_state"] === "Draft") adapter.update("Digit Bid Leveling", ex.name, { cells: rows(ex, "cells") }); return ok("Digit Bid Leveling", ex.name, true); }
    const d = adapter.insertDoc("Digit Bid Leveling", { bid_package: pkg, workflow_state: "Draft", cells: [] });
    return ok("Digit Bid Leveling", d.name);
  });
}
/**
 * F03-15-1 / DEC-042 award chain («ترسية»): the Director's Won decision record, tender Won, BOQ draft from the approved
 * estimate, client contract draft (SOV from the BOQ) and the original budget draft (cost code × resource type +
 * contingency). Every step is idempotent, so pressing it twice returns the same documents.
 */
export function awardTender(tender: string, reason: string): Result & { boq?: string; contract?: string; budget?: string; decision?: string } {
  const r = guarded(`award:${tender}`, () => {
    const t = adapter.get("Digit Tender", tender); if (!t) return fail("Tender not found");
    const approved = list("Digit Estimate Version", (v) => v["tender"] === tender && v["workflow_state"] === "Approved");
    if (approved.length !== 1) return fail(approved.length ? "More than one approved estimate version — supersede the older one first" : TR.TND_MSG.noApproved);
    let dec = list("Digit Tender Award Decision", (a) => a["tender"] === tender && a["decision"] === "Won" && num(a.docstatus) === 1)[0];
    if (!dec) dec = adapter.insertDoc("Digit Tender Award Decision", { tender, decision: "Won", approved_estimate: approved[0]!.name, reason, docstatus: 1 });
    const b = createBoqFromTender(tender); if (!b.ok) return b;
    const c = createContractFromBoq(b.name!, true); if (!c.ok) return c;
    const proj = String(adapter.get("Digit BOQ", b.name!)?.["project"] ?? "");
    const exB = list("Digit Project Cost Budget", (x) => x["project"] === proj && x["source_boq"] === b.name && num(x.docstatus) !== 2)[0];
    const bud = exB ? ok("Digit Project Cost Budget", exB.name, true) : createBudget(proj, b.name);
    if (!bud.ok) return bud;
    return { ...ok("Digit Tender", tender, !!(b.existing && c.existing && exB)), boq: b.name, contract: c.name, budget: bud.name, decision: dec.name } as Result;
  });
  return r;
}
/** DEC-043: «Create revision» on the BOQ comparison page — the approved BOQ copied as the next revision draft (once). */
export function createBoqRevision(boq: string): Result {
  return guarded(`boqrev:${boq}`, () => {
    const b = adapter.get("Digit BOQ", boq); if (!b) return fail("BOQ not found");
    const ex = list("Digit BOQ", (x) => x["base_revision"] === boq && num(x.docstatus) !== 2)[0]; if (ex) return ok("Digit BOQ", ex.name, true);
    if (b["workflow_state"] !== "Approved") return fail(TR.TND_MSG.revisionApproved);
    const d = adapter.insertDoc("Digit BOQ", { title: b["title"], project: b["project"], company: b["company"], tender: b["tender"] ?? "", estimate_version: b["estimate_version"] ?? "", currency: b["currency"] ?? "SAR", revision: num(b["revision"]) + 1, base_revision: boq, workflow_state: "Draft",
      groups: rows(b, "groups").map((g) => ({ ...g })), items: rows(b, "items").map((i) => ({ ...i })) });
    return ok("Digit BOQ", d.name);
  });
}

// ---------------------------------------------------------------- department 04 commercial (domain/commercial.ts)
/** DEC-055: approved terms revisions whose effective date has arrived are applied to the contract (once). */
export function applyDueTermsRevisions(contract: string, on = today()): Result & { applied?: string[] } {
  return guarded(`terms-due:${contract}`, () => asService(() => {
    const c = adapter.get("Digit Client Contract", contract); if (!c) return fail("Contract not found");
    const revs = rows(c, "terms_revisions"); const done: string[] = []; const patch: Row = {};
    const next = revs.map((r) => {
      if (r["status"] !== "Approved" || num(r["applied"]) === 1 || !r["effective_date"] || String(r["effective_date"]).slice(0, 10) > on) return r;
      patch[String(r["term"])] = num(r["to_value"]); done.push(String(r["term"])); return { ...r, applied: 1 };
    });
    if (done.length) adapter.update("Digit Client Contract", contract, { terms_revisions: next, ...patch });
    return { ...ok("Digit Client Contract", contract), applied: done };
  }));
}
/**
 * F04-05-2 / FVAR-3: approved out-of-scope change events → one draft client variation with a line per event line (key
 * event-line, SOV key kept); every event is linked to it. Pressed again for the same events it returns that variation.
 */
export function variationFromEvents(names: string[]): Result {
  return guarded(`var-ce:${[...names].sort().join(",")}`, () => {
    const evs = names.map((n) => adapter.get("Digit Change Event", n)).filter((x): x is Doc => !!x);
    if (evs.length !== names.length || !evs.length) return fail(CM.COM_MSG.noEvents);
    const vn = new Set(evs.map((c) => String(c["variation"] || c["associated_variation"] || "")));
    const same = vn.size === 1 ? adapter.get("Digit Client Variation", [...vn][0]!) : undefined;
    if (live(same) && same!["workflow_state"] !== "Rejected") return ok("Digit Client Variation", same!.name, true);
    const errs = CM.bundleProblems(evs); if (errs.length) return fail(...errs);
    const ct = adapter.get("Digit Client Contract", String(evs[0]!["contract"] ?? "")); if (!ct) return fail("Select a client contract");
    const lines = CM.bundleLines(evs);
    const v = adapter.insertDoc("Digit Client Variation", { title: evs.length === 1 ? String(evs[0]!["title"] || evs[0]!.name) : `Change events ${names.join(", ")}`, contract: ct.name, project: ct["project"], company: ct["company"], customer: ct["customer"],
      change_kind: "Client Variation", source_change_event: evs.length === 1 ? evs[0]!.name : "", workflow_state: "Draft", requested_on: today(), lines,
      cost_rom: r2(sumBy(evs, (c) => num(c["total_cost_rom"]))), revenue_rom: r2(sumBy(evs, (c) => num(c["total_revenue_rom"]))), description: evs.map((c) => `${c.name}: ${String(c["title"] ?? "")}`).join("\n") });
    asService(() => { for (const c of evs) adapter.update("Digit Change Event", c.name, { variation: v.name, lines: rows(c, "lines").map((l) => ({ ...l, variation_line_key: `${c.name}-${String(l["line_key"])}` })) }); });
    return ok("Digit Client Variation", v.name);
  });
}
/** F04-08-2 button: the draft budget revision of an approved variation (cost per cost code of its change event lines); once. */
export function budgetRevisionFromVariation(variation: string): Result & { skipped?: string[] } {
  return guarded(`brv:${variation}`, () => {
    const v = adapter.get("Digit Client Variation", variation); if (!v) return fail("Variation not found");
    const ex = list("Digit Budget Revision", (b) => b["linked_variation"] === variation && live(b))[0]; if (ex) return ok("Digit Budget Revision", ex.name, true);
    const r = CM.budgetRevisionDraft(v); if (!r.doc) return fail(r.error ?? CM.COM_MSG.noCostLines);
    const d = adapter.insertDoc("Digit Budget Revision", r.doc);
    return { ...ok("Digit Budget Revision", d.name), skipped: r.skipped };
  });
}

// ---------------------------------------------------------------- department 05 subcontracting
/** F05-05: a subcontract change draft per work order from the approved change event's lines that name the work order (idempotent). */
export function subcontractChangeFromEvent(ce: string, wo: string): Result {
  return guarded(`sch:${ce}:${wo}`, () => {
    const ev = adapter.get("Digit Change Event", ce); if (!ev) return fail("Change event not found");
    if (!SC.isApprovedEvent(ev)) return fail(SC.fill(SC.SUB_MSG.ceNotApproved, ce));
    const w = adapter.get("Digit Subcontract Work Order", wo); if (!w) return fail("Work order not found");
    const ex = list("Digit Subcontract Change", (c) => c["change_event"] === ce && c["work_order"] === wo && live(c) && c["workflow_state"] !== "Rejected")[0];
    if (ex) return ok("Digit Subcontract Change", ex.name, true);
    const lines = rows(ev, "lines").filter((l) => !l["work_order"] || l["work_order"] === wo).map((l, i) => ({ idx: i + 1, change_type: "New Line", scope: l["description"] || l["line_key"], cost_code: l["cost_code"], uom: l["uom"] || "", revised_qty: num(l["qty"]) || 1, new_rate: num(l["unit_cost"]) }));
    const d = adapter.insertDoc("Digit Subcontract Change", { work_order: wo, change_event: ce, workflow_state: "Draft", change_date: today(), reason: `From change event ${ce}`, lines });
    return ok("Digit Subcontract Change", d.name);
  });
}
/** F05-08-2 / DEC-068: a delay-penalty back charge draft for the delay days (min(days × daily rate × value, cap)); one per work order and day count. */
export function delayPenaltyCharge(wo: string, days: number): Result & { amount?: number } {
  return guarded(`pen:${wo}:${days}`, () => {
    const w = adapter.get("Digit Subcontract Work Order", wo); if (!w) return fail("Work order not found");
    const p = SC.delayPenalty(w, days); if (!(p.amount > 0)) return fail("No delay penalty: set the daily penalty rate on the work order");
    const name = `BC-PEN-${wo}-${days}`;
    if (adapter.get("Digit Back Charge", name)) return { ...ok("Digit Back Charge", name, true), amount: p.amount };
    adapter.insertDoc("Digit Back Charge", { name, work_order: wo, source: "Delay Penalty", charge_type: "Delay Penalty", status: "Draft", workflow_state: "Draft", amount: p.amount, raised_by: currentUser(),
      description: `Delay penalty: ${days} days × ${num(w["delay_penalty_rate"])}% × ${num(w["total_value"])}${p.capped ? ` (capped at ${p.cap})` : ""}` });
    return { ...ok("Digit Back Charge", name), amount: p.amount };
  });
}
/** DEC-070: native Purchase Invoice draft releasing approved subcontract retention on the payable account Finance names. */
export function createSubRetentionInvoice(request: string): Result {
  return guarded(`srr:${request}`, () => {
    const r = adapter.get("Digit Subcontract Retention Release Request", request); if (!r) return fail("Release request not found");
    if (r["purchase_invoice"] && live(adapter.get("Purchase Invoice", String(r["purchase_invoice"])))) return ok("Purchase Invoice", String(r["purchase_invoice"]), true);
    if (num(r.docstatus) !== 1) return fail("Approve the release request first");
    const acct = String(adapter.get("Digit Construction Settings", "Digit Construction Settings")?.["retention_payable_account"] ?? ""); if (!acct) return fail(SC.SUB_MSG.srrAccount);
    const A = abbrOf(r["company"]); const item = adapter.get("Item", `${A}-SVC-SUBCON`); if (!item) return fail(`Service item ${A}-SVC-SUBCON is missing`);
    const amt = r2(num(r["requested_amount"]));
    const pi = adapter.insertDoc("Purchase Invoice", { naming_series: "ACC-PINV-.YYYY.-", supplier: r["subcontractor"], company: r["company"], posting_date: today(), due_date: today(), project: r["project"], currency: "SAR", conversion_rate: 1, credit_to: `Creditors - ${A}`,
      items: [{ idx: 1, item_code: item.name, item_name: item["item_name"], description: `Retention release ${request} (${String(r["work_order"])})`, qty: 1, uom: "Nos", stock_uom: "Nos", conversion_factor: 1, rate: amt, amount: amt, net_rate: amt, net_amount: amt, expense_account: acct, project: r["project"] }],
      taxes: [], total: amt, net_total: amt, base_net_total: amt, total_taxes_and_charges: 0, grand_total: amt, base_grand_total: amt, rounded_total: Math.round(amt), outstanding_amount: amt, status: "Draft", docstatus: 0 });
    asService(() => adapter.update("Digit Subcontract Retention Release Request", request, { purchase_invoice: pi.name }));
    return ok("Purchase Invoice", pi.name);
  });
}
/** F05-01-1 daily: re-read every profile's compliance status for the day (only changed ones are saved). */
export function refreshCompliance(on = today()): string[] {
  const changed: string[] = [];
  for (const p of adapter.list("Digit Subcontractor Profile")) {
    const st = SC.complianceOf(p, on).status;
    if (p["compliance_status"] !== st) { asService(() => adapter.update("Digit Subcontractor Profile", p.name, { compliance_status: st })); changed.push(p.name); }
  }
  return changed;
}

/**
 * F06-11-1: promote selected lines of a working (draft) forecast version — the candidate is a new draft copied from the
 * live (approved) forecast with only those lines taken from the working version; one candidate per working version and
 * selection; the rationale is required. The candidate is approved through its own workflow.
 */
export function promoteForecastLines(working: string, lineKeys: string[], rationale: string): Result & { delta?: number | null } {
  const w = adapter.get("Digit Cost Forecast Snapshot", working); if (!w) return fail("Forecast not found");
  if (num(w.docstatus) !== 0 || w["workflow_state"] !== "Draft") return fail(CC.COST_MSG.notWorking);
  const keys = [...new Set(lineKeys.map(String))].sort(); if (!keys.length) return fail(CC.COST_MSG.promoteNone);
  if (!rationale.trim()) return fail(CC.COST_MSG.rationale);
  const live = latestForecast(String(w["project"])); if (!live) return fail(CC.COST_MSG.noLive);
  const sel = keys.join(", ");
  const ex = list("Digit Cost Forecast Snapshot", (f) => f["promoted_from"] === w.name && f["promoted_lines"] === sel && num(f.docstatus) === 0)[0];
  if (ex) return { ...ok("Digit Cost Forecast Snapshot", ex.name, true), delta: forecastDelta(ex, live).delta };
  try {
    const d = adapter.insertDoc("Digit Cost Forecast Snapshot", { project: w["project"], budget: live["budget"], period: live["period"], cutoff_date: live["cutoff_date"], workflow_state: "Draft", visibility: "Shared",
      source_forecast: live.name, promoted_from: w.name, promoted_lines: sel, rationale, prepared_by: currentUser(), lines: CC.promotionLines(w, live, keys) });
    return { ...ok("Digit Cost Forecast Snapshot", d.name), delta: forecastDelta(adapter.get("Digit Cost Forecast Snapshot", d.name)!, live).delta };
  } catch (x) { return fail(...((x as { errors?: string[] }).errors ?? [String(x)])); }
}

// ---------------------------------------------------------------- department 07 procurement and stores (supply.ts)
const SHORT_ROLES = ["Digit Procurement Officer", "Digit Project Manager", "System Manager"];
const MR_COPY = ["item_code", "item_name", "description", "uom", "stock_uom", "conversion_factor", "warehouse", "schedule_date", "project", "digit_cost_code", "digit_task", "cost_center", "expense_account"];
/** F07-02-1 / DEC-179 / DEC-176: one native Purchase material request for the lines the project store cannot cover (to buy > 0); a repeat press returns the same live request. */
export function createShortageRequest(mr: string): Result {
  return guarded(`short:${mr}`, () => {
    const m = adapter.get("Material Request", mr); if (!m) return fail(SUP_MSG.mrMissing);
    if (num(m.docstatus) !== 1) return fail(SUP_MSG.mrSubmit);
    const user = currentUser(); if (user !== "Administrator" && !userRoles(user).some((r) => SHORT_ROLES.includes(r))) return fail(fill(SUP_MSG.shortageRole, user));
    // the role check above decides who may press; the stock figures and the existing request are read in full (DEC-178 / 180)
    const ex = asSystem(() => list("Material Request", (x) => live(x) && rows(x, "items").some((i) => String(i["digit_shortage_of"] ?? "").startsWith(`${mr}|`))))[0]; if (ex) return ok("Material Request", ex.name, true);
    const short = asSystem(() => availability(mr)).filter((a) => a.to_buy > 0); if (!short.length) return fail(SUP_MSG.noShortage);
    const src = rows(m, "items");
    const items = short.map((a, k) => { const r = src.find((x) => x["name"] === a.mr_item) ?? src[a.row - 1] ?? {}; const o: Record<string, unknown> = {}; for (const f of MR_COPY) if (r[f] !== undefined) o[f] = r[f]; return { ...o, idx: k + 1, qty: a.to_buy, stock_qty: a.to_buy, digit_shortage_of: `${mr}|${a.row}` }; });
    const d = adapter.insertDoc("Material Request", { naming_series: "MAT-MR-.YYYY.-", material_request_type: "Purchase", company: m["company"], transaction_date: today(), schedule_date: m["schedule_date"], set_warehouse: m["set_warehouse"], project: m["project"], items, status: "Draft", docstatus: 0 });
    return ok("Material Request", d.name);
  });
}
const PROMISE_ROLES = ["Digit Procurement Officer", "System Manager"];
/** F07-08-1 / DEC-175: procurement accepts the supplier's promised date — the order line's schedule date takes it and the acceptance is stamped. */
export function acceptPromisedDate(po: string, poItem: string): Result {
  const user = currentUser(); if (user !== "Administrator" && !userRoles(user).some((r) => PROMISE_ROLES.includes(r))) return fail(fill(SUP_MSG.promiseRole, user));
  const p = adapter.get("Purchase Order", po); const items = rows(p, "items"); const k = items.findIndex((r) => r["name"] === poItem);
  if (!p || k < 0) return fail(SUP_MSG.lineMissing);
  const line = items[k]!; if (!line["digit_promised_date"]) return fail(fill(SUP_MSG.noPromise, num(line["idx"]) || k + 1));
  const next = items.map((r, j) => (j === k ? { ...r, schedule_date: r["digit_promised_date"], digit_promise_accepted_by: user, digit_promise_accepted_on: today() } : r));
  asService(() => adapter.update("Purchase Order", po, { items: next }));
  return ok("Purchase Order", po, false);
}
const ISSUE_ROLES = ["Digit Store Keeper", "System Manager"];
/** DEC-224 / 228: the store keeper creates one complete native Stock Entry from an approved issue request (a return puts the stock back); a repeat press returns the same live entry. */
export function createIssueEntry(req: string): Result {
  return guarded(`issue:${req}`, () => {
    const q = adapter.get("Digit Issue Request", req); if (!q) return fail("Issue request not found");
    const user = currentUser(); if (user !== "Administrator" && !userRoles(user).some((r) => ISSUE_ROLES.includes(r))) return fail(fill(SUP_MSG.issueRole, user));
    if (num(q.docstatus) !== 1 || !["Approved", "Issued"].includes(String(q["workflow_state"]))) return fail(SUP_MSG.issueApproved);
    const ex = asSystem(() => list("Stock Entry", (x) => live(x) && x["digit_issue_request"] === req))[0]; if (ex) return ok("Stock Entry", ex.name, true);
    const ret = !!num(q["is_return"]), wh = q["warehouse"], purpose = ret ? "Material Receipt" : "Material Issue";
    const items = rows(q, "lines").map((l, k) => ({ idx: k + 1, item_code: l["item_code"], qty: l["qty"], transfer_qty: l["qty"], uom: l["uom"], stock_uom: l["uom"], conversion_factor: 1, ...(ret ? { t_warehouse: wh } : { s_warehouse: wh }),
      project: q["project"], digit_cost_code: l["cost_code"], digit_task: l["task"] ?? "", digit_issue_line: l["name"] ?? "" }));
    const se = adapter.insertDoc("Stock Entry", { naming_series: "MAT-STE-.YYYY.-", purpose, stock_entry_type: purpose, company: q["company"], project: q["project"], posting_date: today(), ...(ret ? { to_warehouse: wh } : { from_warehouse: wh }),
      digit_issue_request: req, ...(ret ? { digit_reason: "" } : {}), items, docstatus: 0 });
    return ok("Stock Entry", se.name);
  });
}
const RECEIPT_ROLES = ["Digit Store Keeper", "Digit Procurement Officer", "System Manager"];
/** DEC-215: Create From — one native Purchase Receipt draft with the open quantity of every order line, prepared by the store keeper or procurement and submitted through native permission; a repeat press returns the same live draft. */
export function createReceiptFromOrder(po: string): Result {
  return guarded(`pr:${po}`, () => {
    const p = adapter.get("Purchase Order", po); if (!p || num(p.docstatus) !== 1) return fail("Submit the purchase order first");
    const user = currentUser(); if (user !== "Administrator" && !userRoles(user).some((r) => RECEIPT_ROLES.includes(r))) return fail(fill(SUP_MSG.receiptRole, user));
    const ex = asSystem(() => list("Purchase Receipt", (x) => num(x.docstatus) === 0 && rows(x, "items").some((i) => i["purchase_order"] === po)))[0]; if (ex) return ok("Purchase Receipt", ex.name, true);
    const items = rows(p, "items").map((r) => ({ r, open: r2(num(r["qty"]) - num(r["received_qty"])) })).filter((x) => x.open > 0).map(({ r, open }, k) => ({ idx: k + 1, item_code: r["item_code"], item_name: r["item_name"], qty: open, received_qty: open, rejected_qty: 0,
      uom: r["uom"], stock_uom: r["stock_uom"] ?? r["uom"], conversion_factor: 1, rate: r["rate"], amount: r2(open * num(r["rate"])), warehouse: r["warehouse"], purchase_order: po, purchase_order_item: r["name"] ?? "", project: r["project"] || p["project"], digit_cost_code: r["digit_cost_code"] ?? "" }));
    if (!items.length) return fail(fill(SUP_MSG.receiptNothing, po));
    const d = adapter.insertDoc("Purchase Receipt", { naming_series: "MAT-PRE-.YYYY.-", supplier: p["supplier"], company: p["company"], posting_date: today(), set_warehouse: p["set_warehouse"], project: p["project"], items, docstatus: 0 });
    return ok("Purchase Receipt", d.name);
  });
}

// ---------------------------------------------------------------- 08 resources (domain/resourcing.ts)
const FILL_ROLES = ["Digit Site Engineer", "Digit Project Manager", "System Manager"];
/** F08-01-1 Mass Enter: a draft attendance sheet gets one Present line per active crew member (8 h, the crew's default task, the member's classification); members already on the sheet are skipped. */
export function fillAttendanceFromCrew(attendance: string): Result {
  return guarded(`fill:${attendance}`, () => {
    const user = currentUser(); if (user !== "Administrator" && !userRoles(user).some((r) => FILL_ROLES.includes(r))) return fail(RS.fill(RS.RES_MSG.fillRole, user));
    const a = adapter.get("Digit Field Attendance", attendance); if (!a) return fail(RS.RES_MSG.sheetMissing);
    if (num(a.docstatus) !== 0 || (a["workflow_state"] && a["workflow_state"] !== "Draft")) return fail(RS.RES_MSG.fillState);
    const crew = a["crew"] ? adapter.get("Digit Crew", String(a["crew"])) : undefined; if (!crew) return fail(RS.RES_MSG.fillCrew);
    const on = String(a["attendance_date"] ?? "").slice(0, 10); const have = new Set(rows(a, "employees").map((r) => String(r["employee"])));
    const add = rows(crew, "members").filter((m) => m["employee"] && !have.has(String(m["employee"])) && (!m["from_date"] || String(m["from_date"]) <= on) && (!m["to_date"] || String(m["to_date"]) >= on));
    if (!add.length) return fail(RS.RES_MSG.fillNothing);
    const next = [...rows(a, "employees"), ...add.map((m) => ({ employee: m["employee"], employee_name: m["employee_name"] ?? "", attendance: "Present", hours: RS.WORKDAY, overtime_hours: 0, task: crew["default_task"] ?? "", classification: m["classification"] ?? "" }))];
    adapter.update("Digit Field Attendance", attendance, { employees: next });
    return ok("Digit Field Attendance", attendance);
  });
}

// ---------------------------------------------------------------- department 09 finance and closeout (finance.ts)
const canCreate = (dt: string, user = currentUser()) => { const m = cachedMeta(dt); return user === "Administrator" || (!!m && hasPerm(m, "create", undefined, user)); };
/** F09-09-1: spread a total over monthly cash-flow lines by a curve (Σ % = 100); the same spread pressed twice returns the first lines. */
export function spreadCashflowCurve(a: { project: string; total: number; curve: number[]; start: string; direction?: "Inflow" | "Outflow"; category?: string }): Result & { names?: string[]; amounts?: number[] } {
  return guarded(`curve:${a.project}:${a.start}`, () => {
    if (!canCreate("Digit Cashflow Forecast Item")) return fail("You do not have permission to create cash-flow forecast lines");
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(a.start)) return fail("Enter the first month as YYYY-MM");
    if (!(num(a.total) > 0)) return fail("Amount must be greater than zero");
    const sp = FN.spreadByCurve(num(a.total), a.curve); if (sp.error) return fail(sp.error);
    const basis = `Curve ${a.curve.join("/")} of ${r2(num(a.total))} from ${a.start}`;
    const ex = list("Digit Cashflow Forecast Item", (d) => d["project"] === a.project && d["basis"] === basis).sort((x, y) => String(x["period"]).localeCompare(String(y["period"])));
    if (ex.length) return { ...ok("Digit Cashflow Forecast Item", ex[0]!.name, true), names: ex.map((x) => x.name), amounts: ex.map((x) => num(x["amount"])) };
    const names = adapter.batch(() => sp.amounts.map((amount, i) => adapter.insertDoc("Digit Cashflow Forecast Item", { project: a.project, period: FN.addMonths(a.start, i), direction: a.direction ?? "Outflow",
      category: a.category ?? "Other", amount, status: "Planned", basis }).name));
    return { ...ok("Digit Cashflow Forecast Item", names[0]!), names, amounts: sp.amounts };
  });
}
/** F09-10-1: freeze the project metrics as of a date; the same code again recreates the snapshot only with confirm. */
export function createJobSnapshot(project: string, asOf: string, code: string, confirm = false): Result {
  return guarded(`snap:${project}:${code}`, () => {
    if (!canCreate("Digit Job Snapshot")) return fail("You do not have permission to create job snapshots");
    if (!code.trim()) return fail("Enter the snapshot code");
    const metrics = FN.snapshotMetrics(project, asOf);
    const values = { project, as_of: asOf, snapshot_code: code.trim(), payload: JSON.stringify(metrics), created_by: currentUser(), posting_period: asOf, cost_source_state: metrics["actual"] ?? 0 };
    const ex = list("Digit Job Snapshot", (d) => d["project"] === project && String(d["snapshot_code"] ?? "").trim() === code.trim())[0];
    if (ex && !confirm) return { ...fail(FN.fill(FN.FIN_MSG.snapExists, code.trim(), project)), existing: true, doctype: "Digit Job Snapshot", name: ex.name };
    if (ex) { adapter.update("Digit Job Snapshot", ex.name, values); return ok("Digit Job Snapshot", ex.name, true); }
    return ok("Digit Job Snapshot", adapter.insertDoc("Digit Job Snapshot", values).name);
  });
}
/** F09-03-2: the remittance notice of a submitted supplier payment — paid invoices and deductions — queued for the e-mail provider. */
export function remittanceLines(pe: Doc) {
  const inv = rows(pe, "references").filter((r) => num(r["allocated_amount"]) > 0).map((r) => { const d = adapter.get(String(r["reference_doctype"]), String(r["reference_name"]));
    return { invoice: String(r["reference_name"]), bill_no: String(d?.["bill_no"] ?? ""), invoice_date: String(d?.["bill_date"] ?? d?.["posting_date"] ?? ""), total: num(r["total_amount"] ?? d?.["grand_total"]), paid: r2(num(r["allocated_amount"])) }; });
  const deductions = rows(pe, "deductions").map((r) => ({ account: String(r["account"] ?? ""), amount: r2(num(r["amount"])), description: String(r["description"] ?? "") }));
  return { invoices: inv, deductions, paid: r2(num(pe["paid_amount"])) };
}
export function remittanceAdvice(payment: string): Result & { body?: string } {
  return guarded(`remit:${payment}`, () => {
    const pe = adapter.get("Payment Entry", payment); if (!pe) return fail("Payment not found");
    if (num(pe.docstatus) !== 1) return fail("Submit the payment before sending its remittance notice");
    if (pe["party_type"] !== "Supplier") return fail("A remittance notice goes to a supplier payment only");
    const sup = adapter.get("Supplier", String(pe["party"] ?? ""));
    const to = String(sup?.["email_id"] ?? "").trim(); if (!to) return fail(`Supplier ${String(pe["party"] ?? "")} has no e-mail address for the remittance notice`);
    const l = remittanceLines(pe);
    const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const body = [`<p>Remittance notice — payment ${pe.name} of ${fmt(l.paid)} SAR on ${String(pe["posting_date"] ?? "")}.</p>`, "<table><tr><th>Invoice</th><th>Supplier invoice</th><th>Date</th><th>Invoice total</th><th>Paid</th></tr>",
      ...l.invoices.map((r) => `<tr><td>${r.invoice}</td><td>${r.bill_no}</td><td>${r.invoice_date}</td><td>${fmt(r.total)}</td><td>${fmt(r.paid)}</td></tr>`), "</table>",
      ...(l.deductions.length ? ["<p>Deductions</p><table><tr><th>Account</th><th>Description</th><th>Amount</th></tr>", ...l.deductions.map((d) => `<tr><td>${d.account}</td><td>${d.description}</td><td>${fmt(d.amount)}</td></tr>`), "</table>"] : [])].join("");
    const q = queueEmail({ to, subject: `Remittance notice ${pe.name}`, body, doctype: "Payment Entry", name: pe.name, company: String(pe["company"] ?? "") });
    return q.ok ? { ...ok("Payment Entry", pe.name), body } : fail(q.reason[0]);
  });
}
/** F09-HO2-1 / DEC-299 / DEC-300: the O&M manual — a text PDF index (system → location → asset, accepted documents only) and a manifest, in one ZIP. */
export async function exportOmManual(project: string): Promise<Result & { zip?: Uint8Array; index?: FN.ManualEntry[]; pdf?: Uint8Array }> {
  const m = FN.manualIndex(project);
  if (m.missing.length) return fail(FN.fill(FN.FIN_MSG.manualMissing, m.missing.join(", ")));
  if (!m.entries.length) return fail("Add the project's handover assets before compiling the manual");
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ unit: "mm", format: "a4" }); let y = 18;
  const line = (txt: string, size = 10, indent = 0) => { if (y > 280) { pdf.addPage(); y = 18; } pdf.setFontSize(size); pdf.text(txt, 14 + indent, y); y += size >= 12 ? 8 : 6; };
  line(`O&M manual index — ${project} (${today()})`, 14);
  let sys = "", loc = "";
  for (const e of m.entries) {
    if (e.system !== sys) { sys = e.system; loc = ""; line(e.system || "No system", 12); }
    if (e.location !== loc) { loc = e.location; line(e.location || "No location", 11, 4); }
    line(`${e.asset_tag} · ${e.manufacturer} ${e.model} · S/N ${e.serial_no}`, 10, 8);
    for (const d of e.documents) line(`- ${d.type}: ${d.description} (${d.package} #${d.row}) ${d.file}`, 9, 12);
  }
  const pdfBytes = new Uint8Array(pdf.output("arraybuffer"));
  const manifest = { project, generated_at: today(), assets: m.entries.length, documents: m.entries.reduce((n, e) => n + e.documents.length, 0), index: m.entries };
  const zip = zipSync({ "manual-index.pdf": pdfBytes, "manifest.json": new TextEncoder().encode(JSON.stringify(manifest, null, 2)) });
  return { ...ok("Project", project), zip, index: m.entries, pdf: pdfBytes };
}

/** ENTERPRISE_NEEDS #21: an unposted draft WIP adjustment takes its project's billed amount and earned revenue from the
 *  WIP Schedule figures (finance.ts wipRow); written through documentApi (permission + hooks), the user still reviews it. */
export function fillWipFromProject(adj: string): Result {
  const a = adapter.get("Digit WIP Adjustment", adj); if (!a) return fail("WIP adjustment not found");
  if (num(a.docstatus) !== 0 || (a["posted_unposted_status"] && a["posted_unposted_status"] !== "Unposted")) return fail("Only an unposted draft WIP adjustment can be filled");
  if (!a["project"]) return fail("Select the project first");
  const meta = cachedMeta("Digit WIP Adjustment"); if (!meta) return fail("WIP adjustment not found");
  const w = FN.wipRow(String(a["project"]));
  const errs = updateDocument(meta, adj, { billed: w.billed, earned_revenue: w.earned ?? 0 });
  return errs.length ? fail(...errs) : ok("Digit WIP Adjustment", adj);
}

// ---------------------------------------------------------------- journey links (owner round 2026-11-14)
const plusDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
// The five Create From steps the journeys walk: budget revision → purchase order, tender → takeoff sheet, drawing →
// transmittal, crew → machinery usage (change event → client variation reuses variationFromEvents). Each opens a draft
// once (a live draft is returned as «Already exists») and links back, so Connections show both directions.
/** J03: draft purchase order for the cost increases of an approved budget revision (supplier and items are picked on the draft). */
export function purchaseOrderFromBudgetRevision(revision: string): Result {
  return guarded(`po-brv:${revision}`, () => {
    const r = adapter.get("Digit Budget Revision", revision); if (!r) return fail("Budget revision not found");
    if (num(r.docstatus) !== 1 || r["workflow_state"] !== "Approved") return fail("Approve the budget revision before ordering against it");
    const ex = list("Purchase Order", (p) => p["digit_budget_revision"] === revision && live(p))[0]; if (ex) return ok("Purchase Order", ex.name, true);
    const bud = adapter.get("Digit Project Cost Budget", String(r["budget"] ?? ""));
    const lineOf = (k: unknown) => rows(bud, "lines").find((l) => l["line_key"] === k);
    const ups = rows(r, "deltas").filter((x) => num(x["delta_amount"]) > 0);
    if (!ups.length) return fail("The revision has no cost increase to order");
    const abbr = abbrOf(r["company"]);
    const items = ups.map((x, i) => { const l = lineOf(x["line_key"]); const cat = String(l?.["category"] ?? "");
      const svc = cat === "Subcontract" && adapter.get("Item", `${abbr}-SVC-SUBCON`) ? `${abbr}-SVC-SUBCON` : "";
      return { idx: i + 1, ...(svc ? { item_code: svc } : {}), item_name: String(l?.["description"] ?? x["cost_code"] ?? ""), description: String(x["reason"] || l?.["description"] || ""), qty: 1, uom: "Nos", stock_uom: "Nos", conversion_factor: 1,
        rate: num(x["delta_amount"]), amount: num(x["delta_amount"]), schedule_date: plusDays(today(), 14), project: r["project"], digit_cost_code: x["cost_code"], ...(cat ? { digit_cost_category: cat === "Materials" ? "Material" : cat } : {}) }; });
    const po = adapter.insertDoc("Purchase Order", { company: r["company"], project: r["project"], transaction_date: today(), schedule_date: plusDays(today(), 14), digit_budget_revision: revision, items, docstatus: 0, status: "Draft" });
    return ok("Purchase Order", po.name);
  });
}
/** J04: draft quantity take-off sheet of a tender (one dimension row per tender item, quantities to be measured). */
export function takeoffFromTender(tender: string): Result {
  return guarded(`tos:${tender}`, () => {
    const t = adapter.get("Digit Tender", tender); if (!t) return fail("Tender not found");
    if (["Lost", "Cancelled"].includes(String(t["status"]))) return fail(`Tender is ${String(t["status"])}; take-off is closed`);
    const ex = list("Digit Takeoff Sheet", (x) => x["tender"] === tender && x["status"] === "Draft" && live(x))[0]; if (ex) return ok("Digit Takeoff Sheet", ex.name, true);
    const d = adapter.insertDoc("Digit Takeoff Sheet", { tender, title: String(t["title"] ?? tender), status: "Draft", source_kind: "2D",
      dimensions: rows(t, "items").map((i, k) => ({ idx: k + 1, item_key: i["item_key"], description: i["description"], uom: i["uom"], nos: 1, length: 0, breadth: 0, depth: 0, quantity: 0 })) });
    return ok("Digit Takeoff Sheet", d.name);
  });
}
/** J07: draft transmittal carrying the drawing's current revision. */
export function transmittalFromDrawing(drawing: string): Result {
  return guarded(`trm:${drawing}`, () => {
    const g = adapter.get("Digit Drawing", drawing); if (!g) return fail("Drawing not found");
    const rev = String(g["current_revision"] || rows(g, "revisions").find((x) => num(x["is_current"]) === 1)?.["revision_code"] || "");
    const ex = list("Digit Transmittal", (x) => x["workflow_state"] === "Draft" && live(x) && rows(x, "items").some((i) => i["ref_doctype"] === "Digit Drawing" && i["ref_name"] === drawing && String(i["transmitted_revision"] ?? "") === rev))[0];
    if (ex) return ok("Digit Transmittal", ex.name, true);
    const d = adapter.insertDoc("Digit Transmittal", { project: g["project"], company: g["company"], drawing, purpose: "For Construction", workflow_state: "Draft", from_party: "Project team",
      items: [{ idx: 1, ref_doctype: "Digit Drawing", ref_name: drawing, transmitted_revision: rev, description: String(g["title"] ?? "") }] });
    // the drawing's current revision points at its transmittal (Connections on the drawing), unless it was already sent
    const revs = rows(g, "revisions");
    if (revs.some((x) => String(x["revision_code"] ?? "") === rev && !x["transmittal"])) asService(() => adapter.update("Digit Drawing", drawing, { revisions: revs.map((x) => (String(x["revision_code"] ?? "") === rev && !x["transmittal"] ? { ...x, transmittal: d.name } : x)) }));
    return ok("Digit Transmittal", d.name);
  });
}
/** J07: the draft inspection of the work a transmittal issued (same project; the transmittal is linked, so it lists the inspection). */
export function inspectionFromTransmittal(transmittal: string): Result {
  return guarded(`ins:${transmittal}`, () => {
    const t = adapter.get("Digit Transmittal", transmittal); if (!t) return fail("Transmittal not found");
    const ex = list("Digit Inspection", (x) => x["transmittal"] === transmittal && live(x) && num(x.docstatus) === 0)[0];
    if (ex) return ok("Digit Inspection", ex.name, true);
    const d = adapter.insertDoc("Digit Inspection", { project: t["project"], company: t["company"], transmittal, inspection_date: plusDays(new Date().toISOString().slice(0, 10), 1), workflow_state: "Draft" });
    return ok("Digit Inspection", d.name);
  });
}
/** J08: today's draft machinery usage for a crew (the crew's project, a machine deployed there, the crew's operator). */
export function machineryUsageFromCrew(crew: string): Result {
  return guarded(`mu-crew:${crew}`, () => {
    const c = adapter.get("Digit Crew", crew); if (!c) return fail("Crew not found");
    if (c["status"] !== "Active") return fail("The crew is not active");
    const project = String(c["project"] ?? ""); if (!project) return fail("Set the crew's project first");
    const ex = list("Digit Machinery Usage", (u) => u["crew"] === crew && u["usage_date"] === today() && num(u.docstatus) === 0)[0]; if (ex) return ok("Digit Machinery Usage", ex.name, true);
    const m = list("Digit Machinery", (x) => x["current_project"] === project && x["status"] === "Deployed")[0];
    const op = rows(c, "members").find((x) => x["crew_role"] === "Operator")?.["employee"];
    const d = adapter.insertDoc("Digit Machinery Usage", { project, company: c["company"] ?? adapter.get("Project", project)?.["company"], crew, usage_date: today(), status: "Draft", hours: 8,
      ...(m ? { machinery: m.name, rate: num(m["hourly_rate"]) } : {}), ...(op ? { operator: op } : {}) });
    return ok("Digit Machinery Usage", d.name);
  });
}
