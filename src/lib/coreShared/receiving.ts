/**
 * DIGIT shared Core receiving controls (Part B: PU7-b / PUR-008-b, INV-013-b / CF-15, IN4-b / INV-002-b / CF-11, PU10-b / PUR-011-b).
 *  - buying_controller validate_accepted_rejected_qty + validate_rejected_warehouse on every stock receipt (Purchase Receipt,
 *    Purchase Invoice with Update Stock), with the client rule received = accepted + rejected kept on edit (buying.js qty /
 *    rejected_qty), plus the company quarantine warehouse of the Control Policy.
 *  - putaway_rule.apply_putaway_rule before validate on Purchase Receipt and Stock Entry (Material Transfer / Receipt) when
 *    "Apply Putaway Rule" is set (priority, free space = stock capacity − balance), and stock_controller
 *    validate_putaway_capacity (over receipt into a rule's warehouse) on submit.
 *  - receiptChecks(): the per-row table the receipt form panel shows (quantities, warehouses, inspection, putaway rule).
 *  - landed-cost queue: receipts marked as awaiting charges (Core record) or from suppliers outside Saudi Arabia, until a
 *    submitted Landed Cost Voucher covers them — derived at read time, never stored.
 * Quality-inspection gates stay the native port in departments.ts (stock_controller.validate_inspection); this module reads it.
 */
import { adapter, registerDocHook, type Doc } from "@/lib/adapter";
import { cachedMeta } from "@/lib/catalog";
import { currentUser, hasPerm } from "@/lib/session";
import { qtyAt } from "@/lib/stock";
import { CORE_DT } from "./doctypes";
import { controlPolicy } from "./controls";
import { newVoucher } from "./finance";

export type Bi = [string, string];
const s = (v: unknown) => String(v ?? "");
const n = (v: unknown) => Number(v) || 0;
const r3 = (x: number) => Math.round(x * 1000) / 1000;
const r2 = (x: number) => Math.round(x * 100) / 100;
const rows = (d: Doc | undefined, f = "items") => (Array.isArray(d?.[f]) ? (d![f] as Doc[]) : []);
const today = () => new Date().toISOString().slice(0, 10);
const can = (dt: string, p: "read" | "write" | "create", user = currentUser(), d?: Doc) => { const m = cachedMeta(dt); return m ? hasPerm(m, p, d, user) : user === "Administrator"; };

/** A document that brings stock in and carries accepted / rejected quantities. */
export const isStockReceipt = (dt: string, d: Doc) => dt === "Purchase Receipt" || (dt === "Purchase Invoice" && !!n(d["update_stock"]));

/* ------------------------------------------------------------------ accepted / rejected / received ------------------------------------------------------------------ */
/** buying.js qty / rejected_qty: received = accepted + rejected whenever either changes (or received is still empty). */
export function syncReceived(d: Doc, before?: Doc): Doc[] | null {
  const prev = new Map(rows(before).map((r) => [s(r["name"]) || `#${n(r["idx"])}`, r]));
  let changed = false;
  const out = rows(d).map((r) => {
    const rej = n(r["rejected_qty"]); const rec = n(r["received_qty"]);
    if (!rej && !rec) return r;
    const p = prev.get(s(r["name"]) || `#${n(r["idx"])}`);
    const edited = !p || n(p["qty"]) !== n(r["qty"]) || n(p["rejected_qty"]) !== rej || !rec;
    const want = r3(n(r["qty"]) + rej);
    if (!edited || rec === want) return r;
    changed = true; return { ...r, received_qty: want, received_stock_qty: r3(want * (n(r["conversion_factor"]) || 1)) };
  });
  return changed ? out : null;
}

/** validate_accepted_rejected_qty + validate_rejected_warehouse + the company quarantine warehouse (submit only). */
export function receivingErrors(dt: string, d: Doc): string[] {
  if (!isStockReceipt(dt, d)) return [];
  const e: string[] = []; const pol = controlPolicy(s(d["company"])); const q = pol.quarantine_warehouse;
  const ret = !!n(d["is_return"]);
  for (const r of rows(d)) {
    const idx = n(r["idx"]) || 1; const item = s(r["item_code"]);
    if (!ret) for (const f of ["received_qty", "qty", "rejected_qty"]) if (n(r[f]) < 0) e.push(`Row #${idx}: ${f === "qty" ? "Accepted Qty" : f === "rejected_qty" ? "Rejected Qty" : "Received Qty"} cannot be negative for Item ${item}`);
    const rec = n(r["received_qty"]) || r3(n(r["qty"]) + n(r["rejected_qty"]));
    if (Math.abs(r3(n(r["qty"]) + n(r["rejected_qty"])) - r3(rec)) > 0.0005) e.push(`Row #${idx}: Received Qty must be equal to Accepted + Rejected Qty for Item ${item}`);
    const rejWh = s(r["rejected_warehouse"]) || s(d["rejected_warehouse"]);
    if (n(r["rejected_qty"]) && !rejWh) e.push(`Row #${idx}: Rejected Warehouse is mandatory for the rejected Item ${item}`);
    if (rejWh && rejWh === s(r["warehouse"])) e.push(`Row #${idx}: Accepted Warehouse and Rejected Warehouse cannot be same`);
    if (q && n(r["rejected_qty"]) && rejWh && rejWh !== q) e.push(`Row #${idx}: Rejected quantity of Item ${item} must go to the quarantine warehouse ${q}`);
    if (q && n(r["qty"]) && s(r["warehouse"]) === q) e.push(`Row #${idx}: The quarantine warehouse ${q} cannot receive accepted stock of Item ${item}`);
  }
  return e;
}

/* ------------------------------------------------------------------ putaway rules ------------------------------------------------------------------ */
export interface PutawayRule { name: string; warehouse: string; priority: number; capacity: number; stock_capacity: number; free: number }
/** get_ordered_putaway_rules: enabled rules of the item in the company with free space, by priority then most free space. */
export function orderedPutawayRules(item: string, company: string, sourceWarehouse?: string, date = "9999-12-31"): { atCapacity: boolean; rules: PutawayRule[] } {
  const all = adapter.list("Putaway Rule").filter((p) => p["item_code"] === item && s(p["company"]) === company && !n(p["disable"]) && (!sourceWarehouse || p["warehouse"] !== sourceWarehouse))
    .sort((a, b) => n(a["priority"]) - n(b["priority"]) || n(b["capacity"]) - n(a["capacity"]));
  if (!all.length) return { atCapacity: false, rules: [] };
  const vacant = all.map((p): PutawayRule => ({ name: p.name, warehouse: s(p["warehouse"]), priority: n(p["priority"]), capacity: n(p["capacity"]), stock_capacity: n(p["stock_capacity"]) || n(p["capacity"]) * (n(p["conversion_factor"]) || 1), free: 0 }))
    .map((p) => ({ ...p, free: r3(p.stock_capacity - qtyAt(item, p.warehouse, date)) })).filter((p) => p.free > 0)
    .sort((a, b) => a.priority - b.priority || b.free - a.free);
  return vacant.length ? { atCapacity: false, rules: vacant } : { atCapacity: true, rules: [] };
}

const isSE = (dt: string) => dt === "Stock Entry";
/** apply_putaway_rule: split each line over its rules' free space; what does not fit is reported and kept on the line's own warehouse. */
export function planPutaway(dt: string, d: Doc): { rows: Doc[]; unassigned: { item: string; qty: number }[]; changed: boolean } {
  const items = rows(d); const out: Doc[] = []; const unassigned: { item: string; qty: number }[] = [];
  const memo = new Map<string, PutawayRule[]>(); const company = s(d["company"]); const date = s(d["posting_date"]) || today();
  const add = (r: Doc, qty: number, wh: string, rule?: string) => {
    const cf = n(r["conversion_factor"]) || 1; const rate = n(r["rate"]); const row: Doc = { ...r, idx: out.length + 1, qty: r3(qty) } as Doc; delete (row as Record<string, unknown>)["name"];
    if (isSE(dt)) { row["t_warehouse"] = wh; row["transfer_qty"] = r3(qty * cf); }
    else { row["warehouse"] = wh; row["stock_qty"] = r3(qty * cf); row["rejected_qty"] = 0; row["received_qty"] = r3(qty); }
    if (rate) { row["amount"] = r2(qty * rate); if (r["base_rate"] !== undefined) row["base_amount"] = r2(qty * n(r["base_rate"])); if (r["net_rate"] !== undefined) row["net_amount"] = r2(qty * n(r["net_rate"])); if (r["base_net_rate"] !== undefined) row["base_net_amount"] = r2(qty * n(r["base_net_rate"])); }
    if (rule) row["putaway_rule"] = rule; out.push(row);
  };
  for (const r of items) {
    const src = isSE(dt) ? s(r["s_warehouse"]) : ""; const cf = n(r["conversion_factor"]) || 1;
    let pendingQty = n(r["qty"]); const item = s(r["item_code"]);
    let pendingStock = isSE(dt) ? n(r["transfer_qty"]) || pendingQty * cf : n(r["stock_qty"]) || pendingQty * cf;
    const whole = !!n(adapter.get("UOM", s(r["uom"]))?.["must_be_whole_number"]);
    if (!pendingQty || !item) { add(r, pendingQty, s(isSE(dt) ? r["t_warehouse"] : r["warehouse"])); continue; }
    const key = isSE(dt) && d["purpose"] === "Material Transfer" && src ? `${item}\u0000${src}` : item;
    if (!memo.has(key)) { const o = orderedPutawayRules(item, company, src || undefined, date); if (!o.rules.length) { if (o.atCapacity) unassigned.push({ item, qty: pendingQty }); else add(r, pendingQty, s(isSE(dt) ? r["t_warehouse"] : r["warehouse"])); continue; } memo.set(key, o.rules); }
    for (const rule of memo.get(key)!) {
      if (!(pendingStock > 0) || !(rule.free > 0)) continue;
      let stockQty = pendingStock >= rule.free ? rule.free : pendingStock; let qty = stockQty / cf;
      if (whole) { qty = Math.floor(qty); stockQty = qty * cf; }
      if (!qty) break;
      add(r, qty, rule.warehouse, rule.name);
      pendingStock = r3(pendingStock - stockQty); pendingQty = r3(pendingQty - qty); rule.free = r3(rule.free - stockQty);
      if (!(pendingStock > 0)) break;
    }
    // frappe drops the remainder with a message; here it stays on its own warehouse so nothing is lost, and submit is refused until it fits
    if (pendingStock > 0.0005) { unassigned.push({ item, qty: r3(pendingQty) }); add(r, pendingQty, s(isSE(dt) ? r["t_warehouse"] : r["warehouse"])); }
  }
  const sig = (xs: Doc[]) => JSON.stringify(xs.map((x) => [x["item_code"], n(x["qty"]), isSE(dt) ? x["t_warehouse"] : x["warehouse"], s(x["putaway_rule"])]));
  return { rows: out, unassigned, changed: sig(out) !== sig(items) };
}
const putawayApplies = (dt: string, d: Doc) => !!n(d["apply_putaway_rule"]) && !n(d["is_return"]) && (dt === "Purchase Receipt" || (isSE(dt) && ["Material Transfer", "Material Receipt"].includes(s(d["purpose"]))));

/** validate_putaway_capacity: without Apply Putaway Rule, a line put into a rule's warehouse may not exceed its free space. */
export function putawayCapacityErrors(dt: string, d: Doc): string[] {
  if (!(dt === "Purchase Receipt" || isSE(dt) || (dt === "Purchase Invoice" && n(d["update_stock"])))) return [];
  if (!adapter.list("Putaway Rule").length) return [];
  const put = new Map<string, { item: string; wh: string; qty: number; free: number }>(); const date = s(d["posting_date"]) || today();
  for (const r of rows(d)) {
    const wh = s(isSE(dt) ? r["t_warehouse"] : r["warehouse"]); if (!wh) continue;
    const rule = adapter.list("Putaway Rule").find((p) => p["item_code"] === r["item_code"] && p["warehouse"] === wh); if (!rule || n(rule["disable"])) continue;
    const q = isSE(dt) ? n(r["transfer_qty"]) || n(r["qty"]) * (n(r["conversion_factor"]) || 1) : n(r["stock_qty"]) || n(r["qty"]) * (n(r["conversion_factor"]) || 1);
    const cur = put.get(rule.name) ?? { item: s(r["item_code"]), wh, qty: 0, free: r3((n(rule["stock_capacity"]) || n(rule["capacity"])) - qtyAt(s(r["item_code"]), wh, date, d.name)) };
    cur.qty = r3(cur.qty + q); put.set(rule.name, cur);
  }
  return [...put.entries()].filter(([, v]) => v.qty > v.free + 0.0005).map(([rule, v]) => `Over Receipt: ${v.qty} units of Item ${v.item} put away in ${v.wh}, which has only ${Math.max(0, v.free)} free under Putaway Rule ${rule}`);
}

/* ------------------------------------------------------------------ the receipt check table ------------------------------------------------------------------ */
export type QiState = "Not required" | "Missing" | "Draft" | "Accepted" | "Rejected";
export interface ReceiptCheck { idx: number; item: string; accepted: number; rejected: number; received: number; warehouse: string; rejectedWarehouse: string; qi: QiState; qiName: string; putawayRule: string; problems: string[] }
export function receiptChecks(dt: string, d: Doc): ReceiptCheck[] {
  const errs = [...receivingErrors(dt, d), ...putawayCapacityErrors(dt, d)];
  return rows(d).map((r, i): ReceiptCheck => {
    const idx = n(r["idx"]) || i + 1; const item = s(r["item_code"]); const it = adapter.get("Item", item);
    const need = !!n(it?.["inspection_required_before_purchase"]); const q = s(r["quality_inspection"]) ? adapter.get("Quality Inspection", s(r["quality_inspection"])) : undefined;
    const qi: QiState = q ? (n(q.docstatus) !== 1 ? "Draft" : q["status"] === "Rejected" ? "Rejected" : "Accepted") : need ? "Missing" : "Not required";
    const mine = errs.filter((x) => x.startsWith(`Row #${idx}:`));
    if (need && qi === "Missing") mine.push(`Row #${idx}: Quality Inspection is required for Item ${item}`);
    return { idx, item, accepted: n(r["qty"]), rejected: n(r["rejected_qty"]), received: n(r["received_qty"]) || r3(n(r["qty"]) + n(r["rejected_qty"])), warehouse: s(r["warehouse"] ?? r["t_warehouse"]),
      rejectedWarehouse: s(r["rejected_warehouse"]) || s(d["rejected_warehouse"]), qi, qiName: q?.name ?? "", putawayRule: s(r["putaway_rule"]), problems: mine };
  });
}
/** The plan the "Apply putaway rules" action would write, for the panel preview. */
export const putawayPreview = (dt: string, d: Doc) => planPutaway(dt, { ...d, apply_putaway_rule: 1 });

/* ------------------------------------------------------------------ landed-cost queue ------------------------------------------------------------------ */
export interface LandedCostRow { receiptType: "Purchase Receipt" | "Purchase Invoice"; receipt: string; supplier: string; supplierName: string; postingDate: string; amount: number; days: number;
  reason: "marked" | "import"; expected: number; expectation?: string }
const coveredByLcv = () => { const c = new Set<string>(); for (const l of adapter.list("Landed Cost Voucher")) if (n(l.docstatus) === 1) for (const p of rows(l, "purchase_receipts")) c.add(`${s(p["receipt_document_type"]) || "Purchase Receipt"}\u0000${s(p["receipt_document"])}`); return c; };
const expectationOf = (type: string, receipt: string) => adapter.list(CORE_DT.landedCostExpect).find((x) => s(x["receipt_type"]) === type && s(x["receipt"]) === receipt);
const foreign = (supplier: string) => { const c = s(adapter.get("Supplier", supplier)?.["country"]); return !!c && !/^(saudi arabia|ksa|المملكة العربية السعودية|السعودية)$/i.test(c.trim()); };
/** Receipts still waiting for their landed costs (oldest first). */
export function landedCostQueue(company: string, asOf = today()): LandedCostRow[] {
  const pol = controlPolicy(company); const covered = coveredByLcv(); const out: LandedCostRow[] = [];
  for (const type of ["Purchase Receipt", "Purchase Invoice"] as const) for (const d of adapter.list(type)) {
    if (n(d.docstatus) !== 1 || s(d["company"]) !== company || n(d["is_return"]) || (type === "Purchase Invoice" && !n(d["update_stock"]))) continue;
    if (covered.has(`${type}\u0000${d.name}`)) continue;
    const x = expectationOf(type, d.name); if (x && x["status"] === "Not expected") continue;
    const reason = x ? "marked" : pol.landed_cost_foreign && foreign(s(d["supplier"])) ? "import" : null; if (!reason) continue;
    const date = s(d["posting_date"]);
    out.push({ receiptType: type, receipt: d.name, supplier: s(d["supplier"]), supplierName: s(d["supplier_name"]) || s(d["supplier"]), postingDate: date, amount: n(d["base_grand_total"] ?? d["grand_total"]),
      days: date ? Math.max(0, Math.round((Date.parse(`${asOf}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`)) / 864e5)) : 0, reason, expected: n(x?.["expected_amount"]), ...(x ? { expectation: x.name } : {}) });
  }
  return out.sort((a, b) => b.days - a.days || a.receipt.localeCompare(b.receipt));
}
function setExpectation(type: "Purchase Receipt" | "Purchase Invoice", receipt: string, status: "Expected" | "Not expected", amount: number, note: string, user: string): { ok: true; name: string } | { ok: false; reason: Bi } {
  const d = adapter.get(type, receipt); if (!d || n(d.docstatus) !== 1) return { ok: false, reason: ["Only a submitted receipt can wait for landed costs.", "لا ينتظر تكاليف الوصول إلا إيصال معتمد."] };
  if (!can(CORE_DT.landedCostExpect, "write", user) || !can(type, "read", user, d)) return { ok: false, reason: ["You are not permitted to change the landed-cost queue.", "لا تملك صلاحية تعديل قائمة تكاليف الوصول."] };
  if (status === "Not expected" && !note.trim()) return { ok: false, reason: ["Say why no landed costs are expected.", "اذكر سبب عدم توقع تكاليف وصول."] };
  const x = expectationOf(type, receipt); const vals = { status, expected_amount: amount || 0, note, recorded_by: user, company: d["company"], supplier: d["supplier"] };
  if (x) { adapter.update(CORE_DT.landedCostExpect, x.name, vals); return { ok: true, name: x.name }; }
  const doc = adapter.insertDoc(CORE_DT.landedCostExpect, { receipt_type: type, receipt, ...vals }); return { ok: true, name: doc.name };
}
export const expectLandedCost = (type: "Purchase Receipt" | "Purchase Invoice", receipt: string, amount: number, note = "", user = currentUser()) => setExpectation(type, receipt, "Expected", amount, note, user);
export const dismissLandedCost = (type: "Purchase Receipt" | "Purchase Invoice", receipt: string, note: string, user = currentUser()) => setExpectation(type, receipt, "Not expected", 0, note, user);
/** A draft Landed Cost Voucher for the receipt (its items come from the receipt); the user adds the charges and submits. */
export function startLandedCostVoucher(type: "Purchase Receipt" | "Purchase Invoice", receipt: string, user = currentUser()): { ok: true; name: string } | { ok: false; reason: Bi } {
  const d = adapter.get(type, receipt); if (!d || n(d.docstatus) !== 1) return { ok: false, reason: ["Only a submitted receipt can take landed costs.", "لا تُضاف تكاليف الوصول إلا لإيصال معتمد."] };
  const r = newVoucher("Landed Cost Voucher", { company: d["company"], posting_date: today(), distribute_charges_based_on: "Amount",
    purchase_receipts: [{ idx: 1, receipt_document_type: type, receipt_document: receipt, supplier: d["supplier"], posting_date: d["posting_date"], grand_total: d["grand_total"] }] }, { user });
  return r.name && !r.errors.length ? { ok: true, name: r.name } : { ok: false, reason: [r.errors.join("; ") || "Could not create the voucher.", r.errors.join("؛ ") || "تعذّر إنشاء القسيمة."] };
}

/* ------------------------------------------------------------------ hooks ------------------------------------------------------------------ */
let hooked = false;
export function registerReceivingHooks() {
  if (hooked) return; hooked = true;
  for (const dt of ["Purchase Receipt", "Purchase Invoice", "Stock Entry"]) registerDocHook(dt, (doc, before) => {
    let d = doc; const errors: string[] = [];
    const submitting = n(d.docstatus) === 1 && n(before?.docstatus) !== 1;
    if (n(d.docstatus) === 2 || (n(d.docstatus) === 1 && !submitting)) return { doc: d };
    if (dt !== "Stock Entry" && isStockReceipt(dt, d)) { const synced = syncReceived(d, before); if (synced) d = { ...d, items: synced }; }
    if (putawayApplies(dt, d)) {
      const p = planPutaway(dt, d); if (p.changed) d = { ...d, items: p.rows };
      if (submitting && p.unassigned.length) errors.push(...p.unassigned.map((u) => `Item ${u.item}: ${u.qty} could not be accommodated by its Putaway Rules`));
    }
    if (submitting) { errors.push(...receivingErrors(dt, d)); if (!n(d["apply_putaway_rule"])) errors.push(...putawayCapacityErrors(dt, d)); }
    return errors.length ? { doc: d, errors } : { doc: d };
  });
}
