/**
 * Dept 07 P1 procurement controls (Blueprint 07, R19 evidence) — read models and the rules the hooks apply.
 *
 * - approvalLevelFor / levelProblem:  FT-07-05  PO approval levels (CMiC POAPPLV): the lowest level whose max covers the total
 * - overOrderProblems:                FT-07-02  a PO line may not draw more than its Material Request line has left
 * - matchExceptions:                 FT-07-12  three-way match variances (the P5 Finance tolerance check on invoice submit is hooks.ts p5InvoiceErrors)
 * - poChangeLine / applyPoChange:     FT-07-04  commitment change document (Acumatica PM308000) applied to the open order
 * - commitmentsRegister:              FT-07-13  one row per order: original, approved changes, revised, billed, remaining
 *
 * Every empty tolerance means "report / warn only". An undefined approval-level table blocks only the final action
 * (submitting the order). Nothing here posts to the ledger or the stock ledger.
 */
import { adapter, type Doc } from "@/lib/adapter";
import { userRoles } from "@/lib/session";
import { num, r2, sumBy } from "./calc";
import { isSubmitted, list, rows } from "./data";
import { matchingRows, type MatchRow } from "./matching";
import { constructionProjects, settings } from "./queues";

type Row = Record<string, unknown>;
const tolOf = (key: string): number | null => { const v = settings()?.[key]; return v === undefined || v === null || v === "" ? null : num(v); };
const projectOf = (po: Doc, it?: Row) => String(it?.["project"] || po["project"] || "");

// ---------------------------------------------------------------- FT-07-05 approval levels
export const levels = (): Doc[] => adapter.list("Digit PO Approval Level").filter((d) => !d["__synthetic"]).sort((a, b) => num(a["level"]) - num(b["level"]));
/** The level that must approve an order of `total`; null when no level is defined or none covers the amount. */
export function approvalLevelFor(total: number): Doc | null {
  // a blank or 0 maximum is "no limit" (Frappe stores an empty Currency as 0)
  return levels().find((l) => !num(l["max_amount"]) || num(l["max_amount"]) + 0.005 >= total) ?? null;
}
/** Why `user` may not approve an order of `total` (empty = allowed). The required level's role or any higher level's role qualifies. */
export function levelProblem(total: number, user: string): string {
  const all = levels();
  if (!all.length) return "PO approval levels are not defined (owner decision Q-7). Define Digit PO Approval Level records before submitting purchase orders.";
  const need = approvalLevelFor(total);
  if (!need) return `No approval level covers an order total of ${r2(total)}; add a higher level.`;
  if (user === "Administrator") return "";
  const roles = new Set(userRoles(user));
  const ok = all.filter((l) => num(l["level"]) >= num(need["level"])).some((l) => roles.has(String(l["role"])));
  return ok ? "" : `An order total of ${r2(total)} needs approval level ${num(need["level"])} (${String(need["role"])}) or higher.`;
}

// ---------------------------------------------------------------- FT-07-02 over-order against the Material Request
export interface OverOrder { mr: string; mr_item: string; item_code: string; requested: number; other: number; thisQty: number; limit: number | null; status: "OK" | "Warn" | "Block" }
export function overOrderCheck(po: Doc): OverOrder[] {
  const tol = tolOf("mr_over_order_pct"); const by = new Map<string, { mr: string; item: string; q: number }>();
  for (const it of rows(po, "items")) if (it["material_request_item"]) {
    const k = String(it["material_request_item"]); const e = by.get(k) ?? { mr: String(it["material_request"] ?? ""), item: String(it["item_code"] ?? ""), q: 0 };
    e.q = r2(e.q + num(it["stock_qty"] ?? it["qty"])); by.set(k, e);
  }
  const out: OverOrder[] = [];
  for (const [k, e] of by) {
    const mr = adapter.get("Material Request", e.mr); const line = rows(mr, "items").find((r) => r["name"] === k); if (!line) continue;
    const requested = num(line["stock_qty"] ?? line["qty"]);
    const other = r2(sumBy(list("Purchase Order", (p) => p.name !== po.name && isSubmitted(p)).flatMap((p) => rows(p, "items")).filter((r) => r["material_request_item"] === k), (r) => num(r["stock_qty"] ?? r["qty"])));
    const after = other + e.q, limit = tol === null ? null : r2(requested * (1 + tol / 100));
    const status = after <= requested + 1e-9 ? "OK" : limit !== null && after > limit + 1e-9 ? "Block" : "Warn";
    out.push({ mr: e.mr, mr_item: k, item_code: e.item, requested, other, thisQty: e.q, limit, status });
  }
  return out;
}

// ---------------------------------------------------------------- FT-07-12 match exceptions (the P5 submit check lives in hooks.ts p5InvoiceErrors)
export interface MatchException extends MatchRow { qtyPct: number | null; pricePct: number | null; overTolerance: boolean }
/** Match rows with a quantity or price variance; `overTolerance` only when a tolerance is set and exceeded. */
export function matchExceptions(project?: string): MatchException[] {
  const qt = tolOf("match_qty_tol_pct"), pt = tolOf("match_price_tol_pct");
  return matchingRows(project).filter((m) => m.invoiced > 0 && (Math.abs(m.qtyVar) > 1e-9 || (m.priceVar !== null && Math.abs(m.priceVar) > 0.005))).map((m) => {
    const qtyPct = m.received ? r2((m.qtyVar / m.received) * 100) : m.qtyVar ? 100 : 0;
    const pricePct = m.priceVar === null || !m.poRate ? null : r2((m.priceVar / m.poRate) * 100);
    return { ...m, qtyPct, pricePct, overTolerance: (qt !== null && qtyPct > qt + 1e-9) || (pt !== null && pricePct !== null && pricePct > pt + 1e-9) };
  });
}

// ---------------------------------------------------------------- FT-07-04 PO change
/** Fills current qty / rate from the order line and the amount change (new qty × new rate − current qty × current rate). */
export function poChangeLine(po: Doc | undefined, l: Row): Row {
  const cur = l["change_type"] === "Update" ? rows(po, "items").find((r) => r["name"] === l["po_item"]) : undefined;
  const oq = cur ? num(cur["qty"]) : 0, or = cur ? num(cur["rate"]) : 0;
  return { ...l, item_code: l["item_code"] || cur?.["item_code"], cost_code: l["cost_code"] || cur?.["digit_cost_code"] || "", old_qty: oq, old_rate: or, amount_change: r2(num(l["new_qty"]) * num(l["new_rate"]) - oq * or) };
}
/** Writes an approved change onto the order lines and totals (caller wraps it in asService). */
export function applyPoChange(ch: Doc): void {
  const po = adapter.get("Purchase Order", String(ch["purchase_order"])); if (!po) return;
  let items = rows(po, "items").map((r) => ({ ...r }));
  for (const l of rows(ch, "lines")) {
    const q = num(l["new_qty"]), rate = num(l["new_rate"]), amt = r2(q * rate);
    if (l["change_type"] === "Update") items = items.map((r) => (r["name"] === l["po_item"] ? { ...r, qty: q, stock_qty: q, rate, amount: amt, net_amount: amt, base_amount: amt, base_net_amount: amt } : r));
    else { const t = items[0] ?? {}; items.push({ doctype: t["doctype"] ?? "Purchase Order Item", idx: items.length + 1, item_code: l["item_code"], item_name: l["item_code"], uom: t["uom"], stock_uom: t["stock_uom"], conversion_factor: 1, warehouse: t["warehouse"], schedule_date: po["schedule_date"], qty: q, stock_qty: q, rate, amount: amt, net_amount: amt, base_amount: amt, base_net_amount: amt, received_qty: 0, billed_amt: 0, project: projectOf(po, t), digit_cost_code: l["cost_code"] ?? "" }); }
  }
  const net = r2(sumBy(items, (r) => num(r["net_amount"] ?? r["amount"]))), oldNet = num(po["net_total"]) || 1, ratio = num(po["grand_total"]) ? num(po["grand_total"]) / oldNet : 1;
  const billed = sumBy(items, (r) => num(r["billed_amt"])), recQ = sumBy(items, (r) => Math.min(num(r["received_qty"]), num(r["qty"]))), q = sumBy(items, (r) => num(r["qty"]));
  adapter.update("Purchase Order", po.name, { items, total: net, net_total: net, base_net_total: net, grand_total: r2(net * ratio), base_grand_total: r2(net * ratio), per_billed: net ? r2((billed / net) * 100) : 0, per_received: q ? r2((recQ / q) * 100) : 0 });
}

// ---------------------------------------------------------------- FT-07-13 commitments register
export interface Commitment { po: string; supplier: string; project: string; status: string; date: string; original: number; changes: number; revised: number; billed: number; remaining: number; open: boolean; pendingChange: number; changeDocs: Doc[] }
/** One row per submitted order of the project. remaining = revised × (1 − billed %) for open orders (the cost-position commitment rule). */
export function commitmentsRegister(project?: string): Commitment[] {
  const ps = new Set(project ? [project] : constructionProjects().map((p) => p.name));
  return list("Purchase Order", (p) => isSubmitted(p) && rows(p, "items").some((i) => ps.has(projectOf(p, i)))).map((po) => {
    const chg = list("Digit PO Change", (c) => c["purchase_order"] === po.name && num(c.docstatus) !== 2);
    const applied = r2(sumBy(chg.filter((c) => num(c["applied"])), (c) => num(c["total_change"])));
    const pending = r2(sumBy(chg.filter((c) => c["workflow_state"] === "Under Review"), (c) => num(c["total_change"])));
    const revised = num(po["net_total"]), billed = r2(revised * num(po["per_billed"]) / 100);
    const open = num(po["per_received"]) < 100 && !["Closed", "Cancelled", "Completed"].includes(String(po["status"]));
    return { po: po.name, supplier: String(po["supplier"] ?? ""), project: projectOf(po, rows(po, "items")[0]), status: String(po["status"] ?? ""), date: String(po["transaction_date"] ?? ""), original: r2(revised - applied), changes: applied, revised, billed, remaining: open ? r2(revised - billed) : 0, open, pendingChange: pending, changeDocs: chg };
  }).sort((a, b) => b.date.localeCompare(a.date));
}
