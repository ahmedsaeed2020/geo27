/**
 * Department 07 procurement and stores (owner test list, FT-07-01 … FT-07-15): the save rules the native hooks apply
 * (receipts, stock movements, purchase-order approval level) and the read models behind the procurement screens and
 * reports. Server twin: rules/supply.py (same messages). Nothing here writes a ledger row; quantities come from the
 * native documents and the stock ledger, cost stays on invoices (DEC-246 option a).
 *
 * - mrOrderBy / orderBy:  F07-01-1 order by = date needed − lead days (Material Request Item digit_lead_days, else Item lead time)
 * - receiptRule:          F07-10-1 over-receipt (allowance: Item / Stock Settings, blank = 0), F07-09-1 claim gap + rejection reason
 * - stockEntryRule:       F07-12-1 cost code on a material issue, F07-13-1 reason for a cross-project transfer / write-off (needs_approval → PM / DIR)
 * - poLevelErrors:        F07-06-1 approval level of the order net total (procControl.ts levelProblem, DEC-248 demo levels)
 * - availability:         F07-02-1 on hand − reserved for other requests, to buy, incoming not guaranteed (DEC-177 / 178)
 * - expediteRows:         F07-07-1 Late / At Risk / On Track per open order line
 * - quoteComparison:      F07-04-1 net, base currency, a missing item plugged at the highest other price, exclusions with reason
 * - stockBalance:         F07-11-1 on hand = Σ actual_qty, value = Σ stock_value_difference (stock ledger)
 * - report rows:          RPT-N20 … N25
 */
import { adapter, type Doc } from "@/lib/adapter";
import { currentUser, userRoles } from "@/lib/session";
import { daysBetween, num, r2, r3, sumBy } from "./calc";
import { isSubmitted, list, rows, today } from "./data";
import { commitmentsRegister, levelProblem, matchExceptions } from "./procControl";
import { addWorkingDays } from "./commercial";
import { constructionProjects } from "./queues";

type Row = Record<string, unknown>;
const s = (v: unknown) => (v === undefined || v === null ? "" : String(v));
export const fill = (t: string, ...a: unknown[]) => a.reduce<string>((o, v, i) => o.split(`{${i}}`).join(String(v)), t);
const idxOf = (r: Row, i: number) => num(r["idx"]) || i + 1;
const qtyOf = (r: Row) => num(r["stock_qty"] ?? r["qty"]);

export const SUP_MSG = {
  noOrder: "Row {0}: a receipt on a construction project needs a purchase order line",
  zeroPrice: "Row {0}: a zero price is allowed only on a documented free item reviewed by the project manager",
  rfqCancel: "A cancelled request for quotation needs a cancellation reason",
  qtyPositive: "Row {0}: the quantity must be more than 0",
  returnSource: "A return needs the issued request it reverses",
  returnReason: "A return needs a reason",
  returnOver: "Row {0}: returning {1} is more than the {2} issued on {3}",
  storeProject: "Store {0} belongs to project {1}, not {2}",
  issueRole: "Only the store keeper creates the stock movement, not {0}",
  issueApproved: "Approve the issue request before issuing",
  selfPo: "The purchase order must be approved by someone other than its author ({0})",
  lineIdentity: "{0}: an update keeps the order line's item ({1}); add a new line for a different item",
  receiptRole: "Only the store keeper or procurement creates the receipt, not {0}",
  receiptNothing: "Everything on {0} is already received",
  overReceipt: "Row {0}: receiving {1} brings the received quantity to {2} against the ordered {3} (allowance {4}%) — the receipt exceeds the order",
  rejectReason: "Row {0}: a rejection reason is required for the rejected quantity",
  issueCode: "Row {0}: a cost code is required on a material issue",
  moveReason: "A reason is required for a transfer between projects or a write-off",
  reasonApproval: "Reason {0} needs project manager approval — a project manager or director submits this movement",
  quoteExcluded: "An excluded quotation needs an exclusion reason",
  shortageRole: "Only procurement or the project manager creates the shortage request, not {0}",
  noShortage: "Every line is available in the project store — nothing to buy",
  mrSubmit: "Submit the material request before checking stock",
  mrMissing: "Material request not found",
  promiseRole: "Only procurement accepts a supplier date, not {0}",
  noPromise: "Row {0} has no supplier promised date",
  lineMissing: "Purchase order line not found",
};
/** F07-04-1: an excluded quotation keeps its reason. */
export const quoteRule = (doc: Doc): string[] => (num(doc["digit_excluded"]) && !s(doc["digit_exclusion_reason"]).trim() ? [SUP_MSG.quoteExcluded] : []);
const PM_ROLES = ["Digit Project Manager", "Digit Director", "System Manager"];
const LINKED_DT = ["Digit Client Contract", "Digit Tender", "Digit Project Cost Budget", "Digit Subcontract Work Order", "Digit Work Package"];
/** A construction project (contract type or a linked construction record — queues.ts constructionProjects, unscoped): the department 07 rules apply only to its rows, so other apps' purchasing is untouched. */
export function isConstructionProject(p: unknown): boolean {
  const n = s(p); if (!n) return false; const d = adapter.get("Project", n); if (!d) return false;
  return !!d["digit_contract_type"] || LINKED_DT.some((dt) => adapter.list(dt).some((x) => x["project"] === n));
}
const conRow = (doc: Doc, r: Row) => isConstructionProject(r["project"] || doc["project"]);

// ---------------------------------------------------------------- FT-07-09 / FT-07-10 purchase receipt
/** Receipt allowance in % (DEC-211): the item's native over-delivery allowance, else the Stock Settings one, else 0 (block). */
export function receiptAllowance(item: string): number {
  const it = adapter.get("Item", item); const st = adapter.get("Stock Settings", "Stock Settings");
  const a = num(it?.["over_delivery_receipt_allowance"]); return a > 0 ? a : Math.max(0, num(st?.["over_delivery_receipt_allowance"]));
}
/** Accepted quantity already received on an order line by other submitted receipts (returns subtract). */
export function receivedOnLine(poItem: string, except = ""): number {
  return r3(sumBy(list("Purchase Receipt", (p) => p.name !== except && isSubmitted(p)).flatMap((p) => rows(p, "items").filter((r) => r["purchase_order_item"] === poItem).map((r) => ({ q: num(r["qty"]), ret: !!num(p["is_return"]) }))), (x) => (x.ret ? -Math.abs(x.q) : x.q)));
}
export function receiptRule(doc: Doc, before: Doc | undefined): { doc: Doc; errors: string[] } {
  // F07-09-1: claim gap = supplier's claimed quantity − (accepted + rejected)
  const items = rows(doc, "items").map((r) => (s(r["digit_claimed_qty"]) === "" || num(r["digit_claimed_qty"]) === 0 ? r : { ...r, digit_claim_gap: r3(num(r["digit_claimed_qty"]) - (num(r["qty"]) + num(r["rejected_qty"]))) }));
  const d: Doc = rows(doc, "items").length ? { ...doc, items } : doc;
  const submitting = num(doc.docstatus) === 1 && num(before?.docstatus) !== 1;
  if (!submitting) return { doc: d, errors: [] };
  const e: string[] = [];
  items.forEach((r, i) => { if (conRow(doc, r) && num(r["rejected_qty"]) > 0 && !s(r["digit_rejection_reason"]).trim()) e.push(fill(SUP_MSG.rejectReason, idxOf(r, i))); });
  if (!num(doc["is_return"])) items.forEach((r, i) => {
    if (!conRow(doc, r)) return;
    // DEC-213: no receipt without an order on a construction project
    const poi = s(r["purchase_order_item"]); if (!poi) { e.push(fill(SUP_MSG.noOrder, idxOf(r, i))); return; }
    const po = adapter.get("Purchase Order", s(r["purchase_order"])); const line = rows(po, "items").find((x) => x["name"] === poi); if (!line) return;
    const ordered = num(line["qty"]), allow = receiptAllowance(s(r["item_code"] || line["item_code"]));
    const after = r3(receivedOnLine(poi, doc.name) + num(r["qty"]));
    if (after > r3(ordered * (1 + allow / 100)) + 1e-9) e.push(fill(SUP_MSG.overReceipt, idxOf(r, i), num(r["qty"]), after, ordered, allow));
  });
  return { doc: d, errors: e };
}

// ---------------------------------------------------------------- FT-07-12 / FT-07-13 stock entry
const purposeOf = (d: Doc) => s(d["purpose"] || d["stock_entry_type"]);
const whProject = (w: unknown) => s(adapter.get("Warehouse", s(w))?.["digit_project"]);
/** True when the movement needs a reason: a transfer between two projects' stores, or a write-off (DEC-250). */
export function needsReason(doc: Doc): boolean {
  if (num(doc["digit_write_off"])) return true;
  if (purposeOf(doc) !== "Material Transfer") return false;
  return rows(doc, "items").some((r) => { const a = whProject(r["s_warehouse"] || doc["from_warehouse"]), b = whProject(r["t_warehouse"] || doc["to_warehouse"]); return !!a && !!b && a !== b; });
}
export function stockEntryRule(doc: Doc, before: Doc | undefined, user = currentUser()): string[] {
  if (!(num(doc.docstatus) === 1 && num(before?.docstatus) !== 1)) return [];
  const e: string[] = [];
  if (purposeOf(doc) === "Material Issue") rows(doc, "items").forEach((r, i) => { if (conRow(doc, r) && !s(r["digit_cost_code"]).trim()) e.push(fill(SUP_MSG.issueCode, idxOf(r, i))); });
  if (needsReason(doc)) {
    const rs = s(doc["digit_reason"]).trim();
    if (!rs) e.push(SUP_MSG.moveReason);
    else { const rd = adapter.get("Digit Adjustment Reason", rs); if (num(rd?.["needs_approval"]) && user !== "Administrator" && !userRoles(user).some((x) => PM_ROLES.includes(x))) e.push(fill(SUP_MSG.reasonApproval, s(rd?.["reason_en"] || rd?.["code"] || rs))); }
  }
  return e;
}

// ---------------------------------------------------------------- FT-07-06 purchase order approval level
/** The order's net total (after line discount, before recoverable tax — DEC-193). */
export const poNet = (po: Doc) => num(po["net_total"]) || r2(sumBy(rows(po, "items"), (r) => num(r["net_amount"] ?? r["amount"])));
export function poLevelErrors(po: Doc, user = currentUser()): string[] {
  if (!rows(po, "items").some((r) => conRow(po, r))) return [];
  const e: string[] = []; const p = levelProblem(poNet(po), user); if (p) e.push(p);
  // DEC-192: the author of a construction purchase order does not approve (submit) it
  if (user !== "Administrator" && s(po["owner"]) === user) e.push(fill(SUP_MSG.selfPo, user));
  // DEC-195: a zero price only on a documented free item, reviewed by the project manager (or director)
  const pm = user === "Administrator" || userRoles(user).some((x) => PM_ROLES.includes(x));
  rows(po, "items").forEach((r, i) => { if (conRow(po, r) && num(r["rate"]) <= 0 && !(num(r["is_free_item"]) && pm)) e.push(fill(SUP_MSG.zeroPrice, idxOf(r, i))); });
  return e;
}
/** DEC-186: a sent request for quotation is cancelled, never deleted, and the cancellation keeps its reason. */
export const rfqRule = (doc: Doc, before: Doc | undefined): string[] => (num(doc.docstatus) === 2 && num(before?.docstatus) !== 2 && !s(doc["digit_cancel_reason"]).trim() ? [SUP_MSG.rfqCancel] : []);

// ---------------------------------------------------------------- DEC-224 / 226 / 228 issue request
/** Lines need a quantity and a cost code; a return names the issued request it reverses, a reason, and never returns more than was issued; the store belongs to the project. */
export function issueRequestRule(doc: Doc): string[] {
  const e: string[] = []; const lines = rows(doc, "lines");
  lines.forEach((l, i) => { if (num(l["qty"]) <= 0) e.push(fill(SUP_MSG.qtyPositive, idxOf(l, i))); if (!s(l["cost_code"]).trim()) e.push(fill(SUP_MSG.issueCode, idxOf(l, i))); });
  const wp = whProject(doc["warehouse"]); if (wp && wp !== s(doc["project"])) e.push(fill(SUP_MSG.storeProject, s(doc["warehouse"]), wp, s(doc["project"])));
  if (num(doc["is_return"])) {
    const src = adapter.get("Digit Issue Request", s(doc["return_against"]));
    if (!src || src["workflow_state"] !== "Issued") e.push(SUP_MSG.returnSource);
    if (!s(doc["reason"]).trim()) e.push(SUP_MSG.returnReason);
    if (src) lines.forEach((l, i) => { const issued = r3(sumBy(rows(src, "lines").filter((x) => x["item_code"] === l["item_code"]), (x) => num(x["issued_qty"]))); if (num(l["qty"]) > issued + 1e-9) e.push(fill(SUP_MSG.returnOver, idxOf(l, i), num(l["qty"]), issued, src.name)); });
  }
  return e;
}
/** When the stock movement of an issue request is submitted the request becomes Issued with the issued quantity per line (digit_issue_line). */
export function issueCascade(se: Doc): void {
  const req = adapter.get("Digit Issue Request", s(se["digit_issue_request"])); if (!req || num(req.docstatus) !== 1) return;
  const by = new Map<string, number>(); for (const r of rows(se, "items")) { const k = s(r["digit_issue_line"]); if (k) by.set(k, r3((by.get(k) ?? 0) + num(r["qty"]))); }
  adapter.update("Digit Issue Request", req.name, { workflow_state: "Issued", stock_entry: se.name, lines: rows(req, "lines").map((l) => ({ ...l, issued_qty: by.get(s(l["name"])) ?? num(l["issued_qty"]) })) });
}

// ---------------------------------------------------------------- FT-07-01 order-by date
/** F07-01-1: order by = date needed − the item's lead time (calendar days). */
export function orderBy(requiredBy: string, item: string, leadDays?: unknown): string {
  if (!requiredBy) return "";
  const lead = num(leadDays) || num(adapter.get("Item", item)?.["lead_time_days"]);
  return new Date(Date.parse(requiredBy.slice(0, 10)) - lead * 86400000).toISOString().slice(0, 10);
}

/** F07-01-1 on save: each request line stores digit_order_by from its date needed and lead days (digit_lead_days, else the item's lead time). */
export function mrOrderBy(doc: Doc): Doc {
  if (!rows(doc, "items").length) return doc;
  return { ...doc, items: rows(doc, "items").map((r) => { const ob = orderBy(s(r["schedule_date"] || doc["schedule_date"]), s(r["item_code"]), r["digit_lead_days"]); return ob ? { ...r, digit_order_by: ob } : r; }) };
}

// ---------------------------------------------------------------- FT-07-02 availability
export interface AvailRow { mr: string; mr_item: string; row: number; item_code: string; warehouse: string; requested: number; on_hand: number; reserved: number; available: number; to_buy: number; incoming: number; incoming_orders: string[] }
/** Stock ledger on hand of an item in a warehouse up to a date. */
export function stockBalance(item: string, warehouse: string, asOf = today()): { qty: number; value: number; rows: number } {
  const sle = list("Stock Ledger Entry", (x) => x["item_code"] === item && x["warehouse"] === warehouse && num(x["is_cancelled"]) !== 1 && s(x["posting_date"]) <= asOf);
  return { qty: r3(sumBy(sle, (x) => num(x["actual_qty"]))), value: r2(sumBy(sle, (x) => num(x["stock_value_difference"]))), rows: sle.length };
}
/** Open quantity other submitted issue / transfer requests hold on the same item and store (requested − issued). */
function reservedFor(item: string, warehouse: string, exceptMr: string): number {
  return r3(sumBy(list("Material Request", (m) => m.name !== exceptMr && isSubmitted(m) && ["Material Issue", "Material Transfer"].includes(s(m["material_request_type"])) && !["Stopped", "Cancelled", "Issued", "Transferred"].includes(s(m["status"])))
    .flatMap((m) => rows(m, "items").filter((r) => r["item_code"] === item && s(r["warehouse"] || m["set_warehouse"]) === warehouse)), (r) => Math.max(0, qtyOf(r) - num(r["ordered_qty"]))));
}
/** F07-02-1: per request line, available = on hand − reserved for other requests; to buy = max(0, requested − available); incoming orders shown, never counted (DEC-177). */
export function availability(mrName: string, on = today()): AvailRow[] {
  const mr = adapter.get("Material Request", mrName); if (!mr) return [];
  return rows(mr, "items").map((r, i) => {
    const item = s(r["item_code"]), wh = s(r["warehouse"] || mr["set_warehouse"]), need = s(r["schedule_date"] || mr["schedule_date"]);
    const b = stockBalance(item, wh, on), reserved = reservedFor(item, wh, mr.name), available = r3(Math.max(0, b.qty - reserved)), requested = qtyOf(r);
    const inc = list("Purchase Order", (p) => isSubmitted(p) && !["Closed", "Cancelled", "Completed"].includes(s(p["status"]))).flatMap((p) => rows(p, "items").filter((x) => x["item_code"] === item && s(x["warehouse"]) === wh && qtyOf(x) - num(x["received_qty"]) > 0 && (!need || s(x["schedule_date"]) <= need)).map((x) => ({ po: p.name, q: qtyOf(x) - num(x["received_qty"]) })));
    return { mr: mr.name, mr_item: s(r["name"]), row: idxOf(r, i), item_code: item, warehouse: wh, requested, on_hand: b.qty, reserved, available, to_buy: r3(Math.max(0, requested - available)), incoming: r3(sumBy(inc, (x) => x.q)), incoming_orders: [...new Set(inc.map((x) => x.po))] };
  });
}

// ---------------------------------------------------------------- FT-07-07 expediting
export const DUE_SOON_DAYS = 7;
export type ExpediteStatus = "Late" | "At Risk" | "On Track";
export interface ExpediteRow { po: string; row: number; po_item: string; supplier: string; project: string; item_code: string; qty: number; received: number; supplier_date: string; need_by: string; status: ExpediteStatus; days: number; due_soon: boolean }
/** F07-07-1: Late when the supplier date has passed with the line not fully received; At Risk when the supplier date is after the date needed. */
export function expediteRows(project?: string, on = today()): ExpediteRow[] {
  const ps = new Set(project ? [project] : constructionProjects().map((p) => p.name));
  return list("Purchase Order", (p) => isSubmitted(p) && !["Closed", "Cancelled", "Completed"].includes(s(p["status"]))).flatMap((po) => rows(po, "items").map((r, i): ExpediteRow | null => {
    const prj = s(r["project"] || po["project"]); if (!ps.has(prj)) return null;
    const mr = r["material_request"] ? adapter.get("Material Request", s(r["material_request"])) : undefined; const mri = rows(mr, "items").find((x) => x["name"] === r["material_request_item"]);
    const supplier_date = s(r["schedule_date"] || po["schedule_date"]), need_by = s(mri?.["schedule_date"] || r["digit_need_by"] || ""), qty = qtyOf(r), received = num(r["received_qty"]);
    const late = !!supplier_date && supplier_date < on && received < qty - 1e-9, risk = !late && !!need_by && !!supplier_date && supplier_date > need_by;
    return { po: po.name, row: idxOf(r, i), po_item: s(r["name"]), supplier: s(po["supplier"]), project: prj, item_code: s(r["item_code"]), qty, received, supplier_date, need_by, status: late ? "Late" : risk ? "At Risk" : "On Track", days: late ? daysBetween(supplier_date, on) : risk ? daysBetween(need_by, supplier_date) : 0,
      // DEC-240: due soon = the supplier date within the next 7 calendar days, line still open
      due_soon: !late && received < qty - 1e-9 && !!supplier_date && supplier_date >= on && daysBetween(on, supplier_date) <= DUE_SOON_DAYS };
  }).filter((x): x is ExpediteRow => !!x));
}

// ---------------------------------------------------------------- FT-07-09 receipt claims
export function receiptClaims(project?: string): Row[] {
  const ps = new Set(project ? [project] : constructionProjects().map((p) => p.name));
  return list("Purchase Receipt", isSubmitted).flatMap((pr) => rows(pr, "items").filter((r) => ps.has(s(r["project"] || pr["project"])) && s(r["digit_claimed_qty"]) !== "").map((r, i) => ({
    receipt: pr.name, row: idxOf(r, i), supplier: pr["supplier"] ?? "", item_code: r["item_code"] ?? "", claimed: num(r["digit_claimed_qty"]), received: num(r["qty"]), rejected: num(r["rejected_qty"]),
    claim_gap: r3(num(r["digit_claimed_qty"]) - (num(r["qty"]) + num(r["rejected_qty"]))), rejection_reason: r["digit_rejection_reason"] ?? "" })));
}

// ---------------------------------------------------------------- FT-07-04 quotation comparison
export interface QuoteCell { item_code: string; qty: number; rate: number | null; amount: number; plugged: boolean }
export interface QuoteCol { quotation: string; supplier: string; excluded: boolean; reason: string; cells: QuoteCell[]; total: number; plugs: number; rank: number | null }
/** F07-04-1: every submitted quotation of the RFQ on net, base-currency amounts; an item a supplier did not price is plugged at the highest other price (conservative); excluded quotations keep their reason and are not ranked. */
export function quoteComparison(rfq: string): { items: { item_code: string; qty: number }[]; columns: QuoteCol[] } {
  const r = adapter.get("Request for Quotation", rfq); const items = rows(r, "items").map((x) => ({ item_code: s(x["item_code"]), qty: qtyOf(x) }));
  const qs = list("Supplier Quotation", (q) => isSubmitted(q) && rows(q, "items").some((x) => x["request_for_quotation"] === rfq));
  const rateOf = (q: Doc, item: string) => { const x = rows(q, "items").find((y) => y["item_code"] === item && (y["request_for_quotation"] === rfq || !y["request_for_quotation"])); if (!x) return null; const conv = num(q["conversion_rate"]) || 1; return r2((x["base_net_rate"] !== undefined ? num(x["base_net_rate"]) : num(x["net_rate"] ?? x["rate"]) * conv)); };
  const ranked = qs.filter((q) => !num(q["digit_excluded"]));
  const cols = qs.map((q): QuoteCol => {
    const cells = items.map((it) => { const rate = rateOf(q, it.item_code); if (rate !== null) return { ...it, rate, amount: r2(rate * it.qty), plugged: false };
      const hi = Math.max(0, ...ranked.filter((o) => o.name !== q.name).map((o) => rateOf(o, it.item_code) ?? 0)); return { ...it, rate: null, amount: r2(hi * it.qty), plugged: true }; });
    return { quotation: q.name, supplier: s(q["supplier"]), excluded: !!num(q["digit_excluded"]), reason: s(q["digit_exclusion_reason"]), cells, total: r2(sumBy(cells, (c) => c.amount)), plugs: cells.filter((c) => c.plugged).length, rank: null };
  });
  [...cols].filter((c) => !c.excluded).sort((a, b) => a.total - b.total || a.quotation.localeCompare(b.quotation)).forEach((c, i) => { c.rank = i + 1; });
  return { items, columns: cols };
}

// ---------------------------------------------------------------- reports RPT-N20 … N25
type F = Record<string, unknown>;
const scope = (f: F) => new Set(f["project"] ? [s(f["project"])] : constructionProjects().map((p) => p.name));
const inRange = (d: string, f: F) => (!f["from_date"] || d >= s(f["from_date"])) && (!f["to_date"] || d <= s(f["to_date"]));
/** RPT-N20: submitted stock movements that carry a reason, by reason. */
export function adjustmentsByReason(f: F = {}): Row[] {
  const ps = scope(f); const by = new Map<string, { reason: string; movements: Set<string>; qty: number; value: number; projects: Set<string> }>();
  for (const se of list("Stock Entry", (x) => isSubmitted(x) && !!s(x["digit_reason"]) && inRange(s(x["posting_date"]), f))) {
    const prj = [...new Set(rows(se, "items").map((r) => s(r["project"] || se["project"])).filter(Boolean))]; if (!prj.some((p) => ps.has(p))) continue;
    const k = s(se["digit_reason"]); const e = by.get(k) ?? { reason: k, movements: new Set<string>(), qty: 0, value: 0, projects: new Set<string>() };
    e.movements.add(se.name); e.qty = r3(e.qty + sumBy(rows(se, "items"), (r) => qtyOf(r))); e.value = r2(e.value + sumBy(rows(se, "items"), (r) => num(r["amount"] ?? r["basic_amount"]))); prj.forEach((p) => e.projects.add(p)); by.set(k, e);
  }
  return [...by.values()].map((e) => ({ reason: e.reason, movements: e.movements.size, qty: e.qty, value: e.value, projects: [...e.projects].sort().join(", "), documents: [...e.movements].sort() })).sort((a, b) => a.reason.localeCompare(b.reason));
}
/** RPT-N21: procControl.ts commitmentsRegister (original, approved changes, revised, billed, remaining, pending change). */
export const commitmentRows = (f: F = {}): Row[] => commitmentsRegister(f["project"] ? s(f["project"]) : undefined).filter((c) => !f["supplier"] || c.supplier === f["supplier"]).map(({ changeDocs: _c, ...c }) => ({ ...c, pending_change: c.pendingChange }));
/** RPT-N22: one row per PO change line. */
export function poChangeLog(f: F = {}): Row[] {
  const ps = scope(f);
  return list("Digit PO Change", (c) => num(c.docstatus) !== 2 && ps.has(s(c["project"]))).flatMap((c) => rows(c, "lines").map((l) => {
    const before = r2(num(l["old_qty"]) * num(l["old_rate"])), change = num(l["amount_change"]);
    return { change: c.name, purchase_order: c["purchase_order"] ?? "", reason: c["reason"] ?? c["change_reason"] ?? "", status: c["workflow_state"] ?? "", item_code: l["item_code"] ?? "", before, amount_change: change, after: r2(before + change), approved_by: c["approved_by"] ?? "" };
  }));
}
/** RPT-N23: project order lines by cost code. */
export function poByCostCode(f: F = {}): Row[] {
  const ps = scope(f);
  return list("Purchase Order", (p) => isSubmitted(p) && p["status"] !== "Cancelled").flatMap((po) => rows(po, "items").filter((r) => ps.has(s(r["project"] || po["project"]))).map((r) => ({
    cost_code: s(r["digit_cost_code"]) || "—", purchase_order: po.name, item_code: r["item_code"] ?? "", qty: qtyOf(r), rate: num(r["rate"]), amount: num(r["net_amount"] ?? r["amount"]), received: num(r["received_qty"]), billed: num(r["billed_amt"]) })))
    .sort((a, b) => a.cost_code.localeCompare(b.cost_code) || a.purchase_order.localeCompare(b.purchase_order));
}
/** RPT-N24: procControl.ts matchExceptions (over tolerance only when a Finance tolerance is set — DEC-247). */
export const matchRows = (f: F = {}): Row[] => matchExceptions(f["project"] ? s(f["project"]) : undefined).map((m) => ({ ...m }) as unknown as Row);
/**
 * ENT-NEED-18 (owner ruling 2026-11-14): the supplier score weights are Construction Settings values
 * (score_weight_on_time / score_weight_quality / score_weight_price). No weight set = equal weights (the plain average);
 * once any weight is set, an unset one counts 0. A criterion without data for the supplier is left out and the remaining
 * weights are rescaled, so a missing measure never lowers the score.
 */
export const SCORE_WEIGHT_KEYS = ["score_weight_on_time", "score_weight_quality", "score_weight_price"] as const;
export function scoreWeights(): [number, number, number] {
  const st = adapter.get("Digit Construction Settings", "Digit Construction Settings");
  const w = SCORE_WEIGHT_KEYS.map((k) => Math.max(0, num(st?.[k])));
  return (w.some((x) => x > 0) ? w : [1, 1, 1]) as [number, number, number];
}
export function weightedScore(parts: (number | null)[], weights: number[] = scoreWeights()): number | null {
  let tw = 0, tv = 0;
  parts.forEach((v, i) => { const wt = weights[i] ?? 0; if (v === null || !(wt > 0)) return; tw += wt; tv += v * wt; });
  return tw > 0 ? r2(tv / tw) : null;
}
/** RPT-N25: per supplier — orders, on-time %, rejected %, price variance %, score = the weighted average (scoreWeights) of on-time %, 100 − rejected % and 100 − |price variance %|. */
export function supplierScorecard(f: F, onTime: (f: F) => Row[]): Row[] {
  const pos = list("Purchase Order", (p) => isSubmitted(p) && p["status"] !== "Cancelled" && inRange(s(p["transaction_date"]), f));
  const sup = [...new Set(pos.map((p) => s(p["supplier"])))].sort();
  const wts = scoreWeights(); const del = onTime(f); const prs = list("Purchase Receipt", (p) => isSubmitted(p) && !num(p["is_return"]) && inRange(s(p["posting_date"]), f)); const mx = matchExceptions();
  return sup.map((sp) => {
    const d = del.filter((x) => x["supplier"] === sp && ["On time", "Late"].includes(s(x["delivery_status"])));
    const ot = d.length ? r2((d.filter((x) => x["delivery_status"] === "On time").length / d.length) * 100) : null;
    const pr = prs.filter((p) => p["supplier"] === sp).flatMap((p) => rows(p, "items")); const tot = sumBy(pr, (r) => num(r["qty"]) + num(r["rejected_qty"]));
    const rej = tot ? r2((sumBy(pr, (r) => num(r["rejected_qty"])) / tot) * 100) : null;
    const pm = mx.filter((m) => m.supplier === sp && m.pricePct !== null); const pv = pm.length ? r2(sumBy(pm, (m) => Math.abs(num(m.pricePct))) / pm.length) : null;
    return { supplier: sp, orders: pos.filter((p) => p["supplier"] === sp).length, on_time_pct: ot, rejected_pct: rej, price_variance_pct: pv, score: weightedScore([ot, rej === null ? null : 100 - rej, pv === null ? null : 100 - pv], wts) };
  });
}

/** DEC-190: an Update line keeps the order line's identity (item); a different item is a new Add line. */
export function lineIdentityErrors(po: Doc | undefined, lines: Row[]): string[] {
  const e: string[] = [];
  for (const l of lines) { if (l["change_type"] !== "Update") continue; const cur = rows(po, "items").find((r) => r["name"] === l["po_item"]); if (cur && s(l["item_code"]) && s(l["item_code"]) !== s(cur["item_code"])) e.push(fill(SUP_MSG.lineIdentity, s(l["item_code"]), s(cur["item_code"]))); }
  return e;
}

// ---------------------------------------------------------------- DEC-218 store balances
/** Item × store balances of the project's stores (Warehouse.digit_project) from the stock ledger; zero balances hidden unless asked for (a zero balance still has movement history). */
export function storeBalances(project: string, includeZero = false, asOf = today()): Row[] {
  const whs = new Set(adapter.list("Warehouse").filter((w) => w["digit_project"] === project).map((w) => w.name));
  const m = new Map<string, { item_code: string; warehouse: string; qty: number; value: number; movements: number }>();
  for (const x of list("Stock Ledger Entry", (e) => whs.has(s(e["warehouse"])) && num(e["is_cancelled"]) !== 1 && s(e["posting_date"]) <= asOf)) {
    const k = `${s(x["item_code"])}|${s(x["warehouse"])}`; const r = m.get(k) ?? { item_code: s(x["item_code"]), warehouse: s(x["warehouse"]), qty: 0, value: 0, movements: 0 };
    r.qty = r3(r.qty + num(x["actual_qty"])); r.value = r2(r.value + num(x["stock_value_difference"])); r.movements += 1; m.set(k, r);
  }
  return [...m.values()].filter((r) => includeZero || Math.abs(r.qty) > 1e-9).sort((a, b) => a.warehouse.localeCompare(b.warehouse) || a.item_code.localeCompare(b.item_code));
}

// ---------------------------------------------------------------- DEC-198 / 207 / 227 procurement follow-up
export const PROC_SLA = {
  "Digit PO Change": { reminder: 1, escalate: 3, to: "Digit Director", ruling: "DEC-198" },
  "Digit Issue Request": { reminder: 3, escalate: null, to: "", ruling: "DEC-227" },
} as const;
/** Pending procurement decisions (working days on the company calendar) and Late / At Risk order lines (daily reminder to procurement, escalated to the project manager — DEC-207). Internal list only (DEC-200 / 234). */
export function procFollowUpRows(f: F = {}, on = today()): Row[] {
  const ps = scope(f); const out: Row[] = [];
  const pend: [keyof typeof PROC_SLA, (d: Doc) => boolean][] = [["Digit PO Change", (d) => d["workflow_state"] === "Under Review"], ["Digit Issue Request", (d) => d["workflow_state"] === "Pending Approval"]];
  for (const [dt, p] of pend) for (const d of list(dt, (x) => num(x.docstatus) === 0 && p(x) && ps.has(s(x["project"])))) {
    const sla = PROC_SLA[dt]; const from = s(d["modified"] ?? d["creation"]).slice(0, 10) || on; const company = d["company"] ?? adapter.get("Project", s(d["project"]))?.["company"];
    const remind = addWorkingDays(company, from, sla.reminder), esc = sla.escalate === null ? null : addWorkingDays(company, from, sla.escalate);
    const state = esc && on > esc ? "Escalated" : on > remind ? "Reminder due" : "Within review time";
    out.push({ doctype: dt, document: d.name, project: d["project"] ?? "", since: from, reminder_on: remind, escalate_on: esc, escalate_to: state === "Escalated" ? sla.to : "", state, ruling: sla.ruling });
  }
  for (const x of expediteRows(f["project"] ? s(f["project"]) : undefined, on).filter((r) => r.status !== "On Track"))
    out.push({ doctype: "Purchase Order", document: x.po, project: x.project, since: x.status === "Late" ? x.supplier_date : x.need_by, reminder_on: on, escalate_on: x.status === "Late" ? on : null, escalate_to: x.status === "Late" ? "Digit Project Manager" : "", state: x.status === "Late" ? "Critical — daily reminder" : "High — daily reminder", ruling: "DEC-207", row: x.row });
  return out.sort((a, b) => s(a["since"]).localeCompare(s(b["since"])) || s(a["document"]).localeCompare(s(b["document"])));
}
