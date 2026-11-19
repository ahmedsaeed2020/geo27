/**
 * DIGIT Pro operational selectors (SC-S-07 Collections, SC-I-02..09 Inventory, SC-A-02..07 Fixed Assets).
 * Read-only views over native Core records through src/lib/scope.ts. Nothing here posts, values stock or depreciates:
 * outstanding_amount, Bin quantities, Stock Ledger Entry balances and Depreciation Schedule rows are Core-owned.
 */
import { adapter, type Doc } from "@/lib/adapter";
import { assetAccounts } from "@/lib/assets";
import { scopedList } from "@/lib/scope";
import { currentUser } from "@/lib/session";
import { sourceStatus, todayIso, type SourceStatus } from "./finance";
import { daysOverdue } from "./aging";
import { previousPeriod } from "./intelligence";
import { postedStockSources } from './stockSources';
import { postedJournalCheck } from './postedJournal';

const n = (v: unknown) => Number(v) || 0;
const r2 = (x: number) => Math.round(x * 100) / 100;
const s = (v: unknown) => String(v ?? "");
const rows = (d: Doc, f: string) => (Array.isArray(d[f]) ? (d[f] as Doc[]) : []);
const read = (dt: string, user: string, f: (d: Doc) => boolean = () => true) => (sourceStatus(dt, user) === "ok" ? scopedList(dt, user).filter(f) : []);
const addDays = (iso: string, k: number) => new Date(Date.parse(iso) + k * 864e5).toISOString().slice(0, 10);

/* ---------- SC-S-07 Collections ---------- */
export type CollBucket = "overdue" | "today" | "week" | "later";
export interface CollRow { name: string; customer: string; customer_name: string; company: string; posting: string; due: string; days: number; bucket: CollBucket; grand: number; outstanding: number; owner: string; priority: number; action: string; status: string }
export interface Collections { status: SourceStatus; rows: CollRow[]; totals: Record<CollBucket, { count: number; amount: number }> }

export function bucketFor(due: string, today: string): CollBucket {
  if (!due || due < today) return due ? "overdue" : "today";
  if (due === today) return "today";
  return due <= addDays(today, 7) ? "week" : "later";
}
export function nextAction(b: CollBucket, days: number): string {
  if (b === "overdue") return days > 30 ? "Escalate — send dunning" : "Follow up overdue";
  if (b === "today") return "Collect today";
  return b === "week" ? "Remind before due" : "Monitor";
}
/** Sales Invoice docstatus=1, outstanding_amount>0 — the same rows Accounts Receivable uses. Priority = days late × amount (overdue first). */
export function collectionsFrom(invoices: Doc[], company: string, today = todayIso()): Omit<Collections, "status"> {
  const out: CollRow[] = [];
  for (const d of invoices) {
    if (n(d.docstatus) !== 1 || n(d["outstanding_amount"]) <= 0 || (company && d["company"] !== company)) continue;
    const due = s(d["due_date"] || d["posting_date"]); const days = daysOverdue(due, today); const b = bucketFor(due, today);
    const team = rows(d, "sales_team").map((r) => s(r["sales_person"])).filter(Boolean);
    const o = n(d["outstanding_amount"]);
    out.push({ name: d.name, customer: s(d["customer"]), customer_name: s(d["customer_name"] || d["customer"]), company: s(d["company"]), posting: s(d["posting_date"]), due, days, bucket: b,
      grand: n(d["grand_total"]), outstanding: o, owner: team.join(", ") || s(d["owner"]), status: s(d["status"]),
      priority: r2((b === "overdue" ? 1e9 : b === "today" ? 1e8 : 0) + Math.max(days, 0) * o + o), action: nextAction(b, days) });
  }
  out.sort((a, b) => b.priority - a.priority);
  const totals = { overdue: { count: 0, amount: 0 }, today: { count: 0, amount: 0 }, week: { count: 0, amount: 0 }, later: { count: 0, amount: 0 } };
  for (const r of out) { totals[r.bucket].count++; totals[r.bucket].amount = r2(totals[r.bucket].amount + r.outstanding); }
  return { rows: out, totals };
}
export function collections(company: string, user = currentUser()): Collections {
  const st = sourceStatus("Sales Invoice", user);
  return { status: st, ...collectionsFrom(st === "ok" ? scopedList("Sales Invoice", user) : [], company) };
}

/* ---------- SC-S-03 quick item entry ---------- */
export interface ParsedLine { line: number; raw: string; item_code: string; qty: number; uom: string; ok: boolean; error?: string | undefined; item_name?: string | undefined; rate?: number }
/** Parses pasted "item_code<TAB|,|;>qty[<sep>uom]" lines against native Item records; rate from native Item Price of the given price list (never invented). */
export function parseItemLines(text: string, items: Doc[], prices: Doc[], priceList: string): ParsedLine[] {
  const byCode = new Map(items.map((i) => [i.name, i]));
  return text.split(/\r?\n/).map((raw, i) => ({ raw: raw.trim(), i })).filter((x) => x.raw).map(({ raw, i }) => {
    const [code = "", q = "1", uom = ""] = raw.split(/\t|,|;/).map((x) => x.trim());
    const it = byCode.get(code); const qty = Number(q);
    const base = { line: i + 1, raw, item_code: code, qty: Number.isFinite(qty) ? qty : 0, uom };
    if (!it) return { ...base, ok: false, error: "Item not found" };
    if (n(it["disabled"])) return { ...base, ok: false, error: "Item is disabled" };
    if (!(qty > 0)) return { ...base, ok: false, error: "Quantity must be above zero" };
    const p = prices.find((x) => x["item_code"] === code && x["price_list"] === priceList);
    return { ...base, uom: uom || s(it["sales_uom"] || it["stock_uom"]), item_name: s(it["item_name"] || code), ok: true, ...(p ? { rate: n(p["price_list_rate"]) } : {}) };
  });
}
/** Builds native Quotation Item rows (field names from the frozen catalog). conversion_factor only set to 1 when uom equals stock_uom. */
export function quotationRow(base: Doc, it: Doc, l: ParsedLine): Doc {
  const stock = s(it["stock_uom"]); const rate = l.rate ?? 0;
  return { ...base, item_code: l.item_code, item_name: l.item_name, description: s(it["description"] || l.item_name), item_group: s(it["item_group"]), qty: l.qty, uom: l.uom || stock, stock_uom: stock,
    ...(l.uom === stock || !l.uom ? { conversion_factor: 1, stock_qty: l.qty } : {}), price_list_rate: rate, rate, amount: r2(rate * l.qty), base_rate: rate, base_amount: r2(rate * l.qty), net_rate: rate, net_amount: r2(rate * l.qty) };
}

/* ---------- SC-I-02 Item 360 ---------- */
export interface Item360 { bins: { status: SourceStatus; rows: Doc[] }; moves: { status: SourceStatus; rows: Doc[] }; related: { group: "selling" | "buying" | "stock"; doctype: string; name: string; date: string; party: string; status: string }[]; reorder: Doc[]; batches: Doc[]; serials: Doc[] }
const ITEM_DOCS: [string, string, string][] = [["Sales Order", "items", "customer"], ["Sales Invoice", "items", "customer"], ["Delivery Note", "items", "customer"], ["Purchase Order", "items", "supplier"], ["Purchase Receipt", "items", "supplier"], ["Purchase Invoice", "items", "supplier"], ["Stock Entry", "items", "purpose"], ["Material Request", "items", "material_request_type"]];
export function item360(item: Doc, user = currentUser()): Item360 {
  const code = item.name;
  const related = ITEM_DOCS.flatMap(([dt, tf, pf]) => read(dt, user, (d) => rows(d, tf).some((r) => r["item_code"] === code))
    .map((d) => ({ group: (dt.startsWith("Sales") || dt === "Delivery Note" ? "selling" : dt.startsWith("Purchase") || dt === "Material Request" ? "buying" : "stock") as "selling" | "buying" | "stock", doctype: dt, name: d.name, date: s(d["posting_date"] || d["transaction_date"]), party: s(d[pf]), status: d.docstatus === 2 ? "Cancelled" : d.docstatus === 0 ? "Draft" : s(d["status"] || "Submitted") })))
    .sort((a, b) => b.date.localeCompare(a.date)).slice(0, 30);
  return {
    bins: { status: sourceStatus("Bin", user), rows: read("Bin", user, (b) => b["item_code"] === code) },
    moves: { status: sourceStatus("Stock Ledger Entry", user), rows: read("Stock Ledger Entry", user, (e) => e["item_code"] === code && !n(e["is_cancelled"])).sort((a, b) => s(b["posting_date"]).localeCompare(s(a["posting_date"]))).slice(0, 10) },
    related, reorder: rows(item, "reorder_levels"),
    batches: read("Batch", user, (b) => b["item"] === code), serials: read("Serial No", user, (x) => x["item_code"] === code).slice(0, 20),
  };
}

/* ---------- SC-I-08 Stock Ledger ---------- */
export interface LedgerFilter { company?: string | undefined; item?: string | undefined; warehouse?: string | undefined; from?: string | undefined; to?: string | undefined; voucher?: string | undefined }
export function stockLedger(f: LedgerFilter, user = currentUser()): { status: SourceStatus; rows: Doc[]; inQty: number; outQty: number; value: number } {
  const source = postedStockSources(f.company, user);
  const list = source.rows.filter((e) => (!f.item || e["item_code"] === f.item)
    && (!f.warehouse || e["warehouse"] === f.warehouse) && (!f.from || s(e["posting_date"]) >= f.from) && (!f.to || s(e["posting_date"]) <= f.to) && (!f.voucher || e["voucher_type"] === f.voucher))
    .sort((a, b) => (s(a["posting_date"]) + s(a["posting_time"]) + s(a["creation"])).localeCompare(s(b["posting_date"]) + s(b["posting_time"]) + s(b["creation"])));
  return { status: source.status, rows: list, inQty: r2(list.reduce((t, e) => t + Math.max(n(e["actual_qty"]), 0), 0)), outQty: r2(list.reduce((t, e) => t + Math.min(n(e["actual_qty"]), 0), 0)), value: r2(list.reduce((t, e) => t + n(e["stock_value_difference"]), 0)) };
}

/* ---------- SC-I-04 Stock Balance (Bin) ---------- */
export function stockBalance(f: { company?: string | undefined; item?: string | undefined; warehouse?: string | undefined; q?: string | undefined; group?: string | undefined; item_group?: string | undefined; short?: string | undefined }, user = currentUser()) {
  const st = sourceStatus("Bin", user);
  const items = new Map(read("Item", user).map((i) => [i.name, i]));
  const whs = new Map(read("Warehouse", user).map((w) => [w.name, w]));
  const q = (f.q ?? "").toLowerCase();
  // RXP-01 INV-STOCK-BALANCE: one predicate (company, warehouse, item group, search, projected < 0) for rows, totals and the
  // warehouse distribution (which ignores only the warehouse filter so every warehouse stays selectable).
  const base = read("Bin", user, (b) => (!f.company || (s(b["company"]) || s(whs.get(s(b["warehouse"]))?.["company"])) === f.company) && (!f.item || b["item_code"] === f.item)
    && (!q || s(b["item_code"]).toLowerCase().includes(q) || s(items.get(s(b["item_code"]))?.["item_name"]).toLowerCase().includes(q))
    && (!f.item_group || s(items.get(s(b["item_code"]))?.["item_group"]) === f.item_group) && (f.short !== "1" || n(b["projected_qty"]) < 0))
    .map((b) => ({ bin: b, item_name: s(items.get(s(b["item_code"]))?.["item_name"]), item_group: s(items.get(s(b["item_code"]))?.["item_group"]) }));
  const list = base.filter((r) => !f.warehouse || r.bin["warehouse"] === f.warehouse);
  const groups = new Map<string, typeof list>();
  for (const r of list) { const k = f.group === "warehouse" ? s(r.bin["warehouse"]) : f.group === "item_group" ? r.item_group : ""; groups.set(k, [...(groups.get(k) ?? []), r]); }
  const byWh = new Map<string, { warehouse: string; bins: number; value: number; short: number }>();
  for (const r of base) { const w = s(r.bin["warehouse"]); const x = byWh.get(w) ?? { warehouse: w, bins: 0, value: 0, short: 0 }; x.bins++; x.value = r2(x.value + n(r.bin["stock_value"])); if (n(r.bin["projected_qty"]) < 0) x.short++; byWh.set(w, x); }
  const itemGroups = [...new Set(read("Bin", user).map((b) => s(items.get(s(b["item_code"]))?.["item_group"])).filter(Boolean))].sort();
  return { status: st, rows: list, groups: [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0])), warehouses: [...byWh.values()].sort((a, b) => b.value - a.value || a.warehouse.localeCompare(b.warehouse)),
    totals: { bins: list.length, value: r2(list.reduce((t, r) => t + n(r.bin["stock_value"]), 0)), short: list.filter((r) => n(r.bin["projected_qty"]) < 0).length }, itemGroups };
}
export function sortBins<T extends { bin: Doc; item_name: string }>(rows: T[], sort: { field: string; dir: "asc" | "desc" } | null): T[] {
  if (!sort) return rows;
  const m = sort.dir === "asc" ? 1 : -1; const f = { actual: "actual_qty", projected: "projected_qty", value: "stock_value" }[sort.field as "actual"];
  return [...rows].sort((a, b) => (f ? (n(a.bin[f]) - n(b.bin[f])) : s(sort.field === "warehouse" ? a.bin["warehouse"] : a.bin["item_code"]).localeCompare(s(sort.field === "warehouse" ? b.bin["warehouse"] : b.bin["item_code"]))) * m || s(a.bin.name).localeCompare(s(b.bin.name)));
}

/* ---------- SC-I-03 Warehouse tree ---------- */
export interface WhNode { doc: Doc; children: WhNode[]; qty: number; value: number; depth: number }
export function warehouseTree(company: string, user = currentUser()): { status: SourceStatus; roots: WhNode[]; flat: WhNode[] } {
  const st = sourceStatus("Warehouse", user);
  const ws = read("Warehouse", user, (w) => !company || !w["company"] || w["company"] === company);
  const bins = read("Bin", user);
  const map = new Map<string, WhNode>(ws.map((w) => [w.name, { doc: w, children: [], qty: 0, value: 0, depth: 0 }]));
  for (const b of bins) { const node = map.get(s(b["warehouse"])); if (node) { node.qty = r2(node.qty + n(b["actual_qty"])); node.value = r2(node.value + n(b["stock_value"])); } }
  const roots: WhNode[] = [];
  for (const node of map.values()) { const p = map.get(s(node.doc["parent_warehouse"])); if (p && p !== node) p.children.push(node); else roots.push(node); }
  const flat: WhNode[] = [];
  const walk = (x: WhNode, d: number): [number, number] => { x.depth = d; flat.push(x); x.children.sort((a, b) => a.doc.name.localeCompare(b.doc.name)); for (const c of x.children) { const [q, v] = walk(c, d + 1); x.qty = r2(x.qty + q); x.value = r2(x.value + v); } return [x.qty, x.value]; };
  roots.sort((a, b) => a.doc.name.localeCompare(b.doc.name)).forEach((r) => walk(r, 0));
  return { status: st, roots, flat };
}

/* ---------- SC-I-05/06/07 document panels ---------- */
/** Stock Reconciliation variance per row: native current_qty (system) vs qty (counted). quantity_difference is used when Core has written it. */
export function reconVariance(doc: Doc) {
  return rows(doc, "items").map((r) => {
    const sys = n(r["current_qty"]); const cnt = n(r["qty"]);
    const dq = r["quantity_difference"] !== undefined && r["quantity_difference"] !== "" && n(doc.docstatus) === 1 ? n(r["quantity_difference"]) : r2(cnt - sys);
    const da = r["amount_difference"] !== undefined && n(doc.docstatus) === 1 ? n(r["amount_difference"]) : r2(cnt * n(r["valuation_rate"]) - n(r["current_amount"]));
    return { idx: n(r["idx"]), item: s(r["item_code"]), warehouse: s(r["warehouse"]), system: sys, counted: cnt, diffQty: dq, diffAmount: da };
  });
}
/** Stock Entry lines grouped by source → target warehouse pair; validation hints mirror native messages (Core still validates on submit). */
export function transferSummary(doc: Doc) {
  const purpose = s(doc["purpose"] || doc["stock_entry_type"]);
  const lines = rows(doc, "items").map((r) => ({ idx: n(r["idx"]), item: s(r["item_code"]), qty: n(r["qty"]), uom: s(r["uom"] || r["stock_uom"]), from: s(r["s_warehouse"] || doc["from_warehouse"]), to: s(r["t_warehouse"] || doc["to_warehouse"]) }));
  const needFrom = ["Material Issue", "Material Transfer", "Material Transfer for Manufacture", "Send to Subcontractor"].includes(purpose);
  const needTo = ["Material Receipt", "Material Transfer", "Material Transfer for Manufacture"].includes(purpose);
  const issues: { idx: number; msg: string }[] = [];
  for (const l of lines) {
    if (!l.item) issues.push({ idx: l.idx, msg: "Item Code is mandatory" });
    if (!(l.qty > 0)) issues.push({ idx: l.idx, msg: "Quantity must be above zero" });
    if (needFrom && !l.from) issues.push({ idx: l.idx, msg: "Source warehouse is mandatory" });
    if (needTo && !l.to) issues.push({ idx: l.idx, msg: "Target warehouse is mandatory" });
    if (l.from && l.from === l.to) issues.push({ idx: l.idx, msg: "Source and target warehouse cannot be same" });
  }
  const pairs = new Map<string, { from: string; to: string; lines: number; qty: number }>();
  for (const l of lines) { const k = `${l.from}→${l.to}`; const p = pairs.get(k) ?? { from: l.from, to: l.to, lines: 0, qty: 0 }; p.lines++; p.qty = r2(p.qty + l.qty); pairs.set(k, p); }
  return { purpose, lines, issues, pairs: [...pairs.values()] };
}
/** SC-I-05/06 line detail: per Stock Entry Detail row — UOM vs stock UOM, conversion factor and batch/serial tracking.
 * serial_no is a comma/newline separated list in ERPNext and is split into individual serials; nothing is edited. */
export function stockEntryLines(doc: Doc) {
  return rows(doc, "items").map((r) => {
    const factor = n(r["conversion_factor"]) || 1;
    const serialsRaw = s(r["serial_no"]);
    return {
      idx: n(r["idx"]),
      item: s(r["item_code"]),
      from: s(r["s_warehouse"] || doc["from_warehouse"]),
      to: s(r["t_warehouse"] || doc["to_warehouse"]),
      qty: n(r["transfer_qty"] || r["qty"]),
      qtyUom: s(r["uom"]),
      stockUom: s(r["stock_uom"]),
      factor,
      batch: s(r["batch_no"]),
      serials: serialsRaw ? serialsRaw.split(/[\n,]+/).map((x) => x.trim()).filter(Boolean) : [],
    };
  });
}
/** Native source links of a Stock Entry (header link fields + per-row material_request / against_stock_entry) and its native value totals. */
const SE_HEAD: [string, string][] = [["work_order", "Work Order"], ["purchase_order", "Purchase Order"], ["purchase_receipt_no", "Purchase Receipt"], ["delivery_note_no", "Delivery Note"], ["sales_invoice_no", "Sales Invoice"], ["outgoing_stock_entry", "Stock Entry"], ["subcontracting_order", "Subcontracting Order"], ["pick_list", "Pick List"], ["bom_no", "BOM"]];
export function stockEntryContext(doc: Doc) {
  const links: { doctype: string; name: string }[] = [];
  const add = (dt: string, nm: unknown) => { const v = s(nm); if (v && !links.some((l) => l.doctype === dt && l.name === v)) links.push({ doctype: dt, name: v }); };
  for (const [f, dt] of SE_HEAD) add(dt, doc[f]);
  for (const r of rows(doc, "items")) { add("Material Request", r["material_request"]); add("Stock Entry", r["against_stock_entry"]); }
  const qty = r2(rows(doc, "items").reduce((t, r) => t + n(r["transfer_qty"] || r["qty"]), 0));
  const status = n(doc.docstatus) === 2 ? "Cancelled" : n(doc.docstatus) === 1 ? "Submitted" : "Draft";
  return { links, qty, outgoing: n(doc["total_outgoing_value"]), incoming: n(doc["total_incoming_value"]), diff: n(doc["value_difference"]), status };
}
export function voucherLedger(doctype: string, name: string, user = currentUser()) {
  return { status: sourceStatus("Stock Ledger Entry", user), rows: read("Stock Ledger Entry", user, (e) => e["voucher_type"] === doctype && e["voucher_no"] === name && !n(e["is_cancelled"])) };
}

/** Core SLE rows may omit legacy batch/serial fields. Resolve those identifiers through readable native voucher rows,
 * matching both item and warehouse; never copy tracking data into the ledger or bypass document permissions. */
export function trackingMovements(doctype: "Batch" | "Serial No", doc: Doc, user = currentUser()) {
  const field = doctype === "Batch" ? "batch_no" : "serial_no";
  const item = s(doc[doctype === "Batch" ? "item" : "item_code"]);
  const matches = (v: unknown) => s(v).split(/[\n,]+/).map((x) => x.trim()).includes(doc.name);
  const vouchers = new Map<string, Doc>();
  for (const dt of ["Stock Entry", "Purchase Receipt", "Delivery Note"]) {
    for (const d of read(dt, user)) vouchers.set(`${dt}\0${d.name}`, d);
  }
  const ledger = stockLedger({ item }, user);
  return { status: ledger.status, rows: ledger.rows.filter((e) => {
    if (matches(e[field])) return true;
    const voucher = vouchers.get(`${s(e["voucher_type"])}\0${s(e["voucher_no"])}`);
    return !!voucher && rows(voucher, "items").some((r) => r["item_code"] === item && matches(r[field]) &&
      [r["warehouse"], r["s_warehouse"], r["t_warehouse"], voucher["set_warehouse"]].includes(e["warehouse"]));
  }) };
}

/* ---------- SC-A-02..07 Asset 360 + depreciation review ---------- */
export function asset360(a: Doc, user = currentUser()) {
  const schedules = read("Asset Depreciation Schedule", user, (d) => d["asset"] === a.name);
  const active = schedules.find((d) => n(d.docstatus) === 1) ?? schedules[0];
  const sched = active ? rows(active, "depreciation_schedule").map((r) => ({ date: s(r["schedule_date"]), amount: n(r["depreciation_amount"]), accumulated: n(r["accumulated_depreciation_amount"]), je: s(r["journal_entry"]) })) : [];
  const movements = read("Asset Movement", user, (m) => rows(m, "assets").some((r) => r["asset"] === a.name)).map((m) => ({ m, row: rows(m, "assets").find((r) => r["asset"] === a.name)! }));
  const repairs = read("Asset Repair", user, (r) => r["asset"] === a.name);
  const maint = read("Asset Maintenance", user, (r) => r["asset_name"] === a.name);
  const adjustments = read("Asset Value Adjustment", user, (r) => r["asset"] === a.name);
  const vouchers = new Set([a.name, ...sched.map((x) => x.je).filter(Boolean), s(a["purchase_invoice"]), s(a["journal_entry_for_scrap"])].filter(Boolean));
  const gl = read("GL Entry", user, (g) => !n(g["is_cancelled"]) && (vouchers.has(s(g["voucher_no"])) || (g["against_voucher"] === a.name)));
  const t = todayIso();
  return { schedule: { status: sourceStatus("Asset Depreciation Schedule", user), doc: active, rows: sched, booked: sched.filter((x) => x.je).length, nextDue: sched.find((x) => !x.je && x.date >= t) ?? sched.find((x) => !x.je) },
    movements, repairs, maint, adjustments, gl: { status: sourceStatus("GL Entry", user), rows: gl } };
}
/** `booked` = the row carries a journal reference; `posted` narrows it to references verified in the ledger
 * (postedJournalCheck in postedJournal.ts). Filter state "posted" / "reference" selects the two parts of booked. */
export interface DepRow { asset: string; asset_name: string; category: string; finance_book: string; date: string; amount: number; accumulated: number; je: string; state: "booked" | "due" | "upcoming"; posted: boolean; schedule: string; /** schedule child-row idx (two rows of one schedule may share a date) */ row: number }
export function depreciationReview(company: string, f: { from?: string | undefined; to?: string | undefined; state?: string | undefined; book?: string | undefined; asset?: string | undefined }, user = currentUser()) {
  const st = sourceStatus("Asset Depreciation Schedule", user); const t = todayIso();
  const assets = new Map(read("Asset", user).map((x) => [x.name, x]));
  const isPosted = postedJournalCheck(user);
  const out: DepRow[] = [];
  for (const d of read("Asset Depreciation Schedule", user, (x) => n(x.docstatus) === 1 && (!company || x["company"] === company))) {
    const a = assets.get(s(d["asset"]));
    if (!a || (f.asset && a.name !== f.asset) || (f.book && d["finance_book"] !== f.book)) continue;
    for (const r of rows(d, "depreciation_schedule")) {
      const date = s(r["schedule_date"]); const je = s(r["journal_entry"]);
      if (!date || r["depreciation_amount"] === undefined) continue;
      const state = je ? "booked" : date <= t ? "due" : "upcoming";
      const posted = state === "booked" && isPosted(je);
      const keep = f.state === "unbooked" ? !je : f.state === "posted" ? posted : f.state === "reference" ? state === "booked" && !posted : !f.state || f.state === state;
      if ((f.from && date < f.from) || (f.to && date > f.to) || !keep) continue;
      out.push({ asset: s(d["asset"]), asset_name: s(a?.["asset_name"]), category: s(a?.["asset_category"]), finance_book: s(d["finance_book"]), date, amount: n(r["depreciation_amount"]), accumulated: n(r["accumulated_depreciation_amount"]), je, state, posted, schedule: d.name, row: n(r["idx"]) });
    }
  }
  out.sort((a, b) => a.date.localeCompare(b.date));
  const sum = (k: DepRow["state"]) => r2(out.filter((x) => x.state === k).reduce((t2, x) => t2 + x.amount, 0));
  const posted = r2(out.filter((x) => x.posted).reduce((t2, x) => t2 + x.amount, 0));
  return { status: st, rows: out, booked: sum("booked"), posted, reference: r2(sum("booked") - posted), due: sum("due"), upcoming: sum("upcoming") };
}

/* ---------- SC-A-07 Asset register (native Asset fields, filters only) ---------- */
export interface RegRow { name: string; asset_name: string; category: string; location: string; status: string; purchase_date: string; cost: number; accumulated: number; book: number; docstatus: number; jes: string[] }
export function assetRegister(company: string, f: { category?: string | undefined; location?: string | undefined; status?: string | undefined; q?: string | undefined }, user = currentUser()) {
  const st = sourceStatus("Asset", user); const q = s(f.q).toLowerCase();
  const all = read("Asset", user, (a) => n(a.docstatus) !== 2 && (!company || a["company"] === company));
  const out: RegRow[] = all.filter((a) => (!f.category || a["asset_category"] === f.category) && (!f.location || a["location"] === f.location)
    && (!f.status || s(a["status"] || "Draft") === f.status) && (!q || `${a.name} ${s(a["asset_name"])} ${s(a["item_code"])}`.toLowerCase().includes(q)))
    .map((a) => { const cost = n(a["net_purchase_amount"] ?? a["gross_purchase_amount"]); const book = a["value_after_depreciation"] !== undefined && a["value_after_depreciation"] !== "" ? n(a["value_after_depreciation"]) : cost;
      const jes = read("Asset Depreciation Schedule", user, (d) => d["asset"] === a.name && n(d.docstatus) === 1).flatMap((d) => ((d["depreciation_schedule"] as Doc[] | undefined) ?? []).map((r) => s(r["journal_entry"])).filter((j) => j && j !== "preview"));
      return { jes, name: a.name, asset_name: s(a["asset_name"]), category: s(a["asset_category"]), location: s(a["location"]), status: s(a["status"] || "Draft"), purchase_date: s(a["purchase_date"]), cost, accumulated: r2(cost - book), book, docstatus: n(a.docstatus) }; })
    .sort((a, b) => a.name.localeCompare(b.name));
  const uniq = (k: string) => [...new Set(all.map((a) => s(a[k] || (k === "status" ? "Draft" : ""))).filter(Boolean))].sort();
  const fx = [...new Set(all.filter((a) => out.some((x) => x.name === a.name)).map((a) => assetAccounts(a).fixed).filter(Boolean))];
  const ax = [...new Set(all.filter((a) => out.some((x) => x.name === a.name)).map((a) => assetAccounts(a).accumulated).filter(Boolean))];
  const gl = sourceStatus("GL Entry", user) === "ok" ? read("GL Entry", user, (g) => !n(g["is_cancelled"]) && (!company || g["company"] === company)) : [];
  return { status: st, rows: out, options: { category: uniq("asset_category"), location: uniq("location"), status: uniq("status") },
    totals: { accAccounts: ax, fixedAccounts: fx, glCost: gl.filter((g) => fx.includes(s(g["account"]))).length, glAcc: gl.filter((g) => ax.includes(s(g["account"]))).length, cost: r2(out.reduce((t, x) => t + x.cost, 0)), accumulated: r2(out.reduce((t, x) => t + x.accumulated, 0)), book: r2(out.reduce((t, x) => t + x.book, 0)) } };
}

/* ---------- SC-A-06 Depreciation review step (preview of the native booking, never posts) ---------- */
/** Accounts come from the Core resolver (src/lib/assets.ts assetAccounts = ERPNext get_depreciation_accounts); never duplicated here. */
export function depreciationAccounts(asset: string, user = currentUser()) {
  const a = read("Asset", user, (x) => x.name === asset)[0];
  if (!a) return { expense: "", accumulated: "" };
  const acc = assetAccounts(a); const ok = (x: string) => !!x && !!adapter.get("Account", x);
  return { expense: ok(acc.expense) ? acc.expense : "", accumulated: ok(acc.accumulated) ? acc.accumulated : "" };
}
export function depreciationPreview(selected: DepRow[], _company: string, user = currentUser()) {
  const lines = new Map<string, { account: string; debit: number; credit: number }>();
  const missing: string[] = [];
  for (const x of selected) {
    const acc = depreciationAccounts(x.asset, user);
    if (!acc.expense || !acc.accumulated) { missing.push(x.asset); continue; }
    const add = (a: string, d: number, c: number) => { const l = lines.get(a) ?? { account: a, debit: 0, credit: 0 }; l.debit = r2(l.debit + d); l.credit = r2(l.credit + c); lines.set(a, l); };
    add(acc.expense, x.amount, 0); add(acc.accumulated, 0, x.amount);
  }
  const ls = [...lines.values()];
  return { lines: ls, missing, debit: r2(ls.reduce((t, l) => t + l.debit, 0)), credit: r2(ls.reduce((t, l) => t + l.credit, 0)) };
}

/* ---------- SC-I-05 purpose-driven fields + SC-I-06 availability review ---------- */
/** Native Stock Entry fields that matter for each purpose (labels as in the Core form). */
export const PURPOSE_FIELDS: Record<string, string[]> = {
  "Material Receipt": ["Default Target Warehouse", "Target Warehouse", "Basic Rate"],
  "Material Issue": ["Default Source Warehouse", "Source Warehouse"],
  "Material Transfer": ["Default Source Warehouse", "Default Target Warehouse", "Source Warehouse", "Target Warehouse"],
  "Material Transfer for Manufacture": ["Work Order", "Default Source Warehouse", "Default Target Warehouse"],
  "Manufacture": ["Work Order", "BOM No", "For Quantity", "Target Warehouse"],
  "Repack": ["Source Warehouse", "Target Warehouse", "Is Finished Item"],
  "Send to Subcontractor": ["Subcontracting Order", "Supplier", "Default Source Warehouse"],
};
export function stockAvailability(doc: Doc, user = currentUser()) {
  const bins = read("Bin", user);
  const need = new Map<string, { item: string; warehouse: string; qty: number }>();
  for (const r of rows(doc, "items")) {
    const wh = s(r["s_warehouse"] || doc["from_warehouse"]); if (!wh || !r["item_code"]) continue;
    const k = `${s(r["item_code"])}\0${wh}`; const x = need.get(k) ?? { item: s(r["item_code"]), warehouse: wh, qty: 0 };
    x.qty = r2(x.qty + n(r["transfer_qty"] || r["qty"]) ); need.set(k, x);
  }
  return { status: sourceStatus("Bin", user), rows: [...need.values()].map((x) => { const b = bins.find((y) => y["item_code"] === x.item && y["warehouse"] === x.warehouse); const have = n(b?.["actual_qty"]); return { ...x, have, short: r2(Math.max(0, x.qty - have)) }; }) };
}

/**
 * SC-I-05/06 single readiness verdict for a draft Stock Entry. Combines field checks, source-stock shortage
 * (respecting Stock Settings / Item allow_negative_stock), batch/serial requirements and submit permission,
 * so the panel can never show "ready" while a blocker exists. Native validation still decides on submit.
 */
export type Blocker = { kind: "field" | "shortage" | "batch" | "serial" | "permission" | "state"; idx?: number; item?: string; msg: string; required?: number; available?: number; shortfall?: number; next: string };
export function stockReadiness(doc: Doc, user = currentUser(), canSubmit = true) {
  const t = transferSummary(doc);
  const blockers: Blocker[] = [];
  if (n(doc.docstatus) !== 0) blockers.push({ kind: "state", msg: "Only draft documents can be submitted", next: "Open the document" });
  for (const x of t.issues) blockers.push({ kind: "field", idx: x.idx, msg: x.msg, next: "Correct the row in the Items table" });
  const ss = adapter.get("Stock Settings", "Stock Settings");
  const av = stockAvailability(doc, user);
  const unknownStock = av.status !== "ok";
  if (!unknownStock) for (const a of av.rows) {
    if (!a.short) continue;
    const negOk = n(ss?.["allow_negative_stock"]) || n(adapter.get("Item", a.item)?.["allow_negative_stock"]);
    if (!negOk) blockers.push({ kind: "shortage", item: a.item, msg: "Insufficient stock", required: a.qty, available: a.have, shortfall: a.short, next: "Reduce the quantity, choose another source warehouse, or receive stock first" });
  }
  for (const r of rows(doc, "items")) {
    const code = s(r["item_code"]); if (!code) continue;
    const it = adapter.get("Item", code);
    if (n(it?.["has_batch_no"]) && !s(r["batch_no"])) blockers.push({ kind: "batch", idx: n(r["idx"]), item: code, msg: "Batch No is mandatory", next: "Add Serial / Batch No on the row" });
    if (n(it?.["has_serial_no"])) { const cnt = s(r["serial_no"]).split(/[\n,]+/).filter((x) => x.trim()).length; if (cnt !== n(r["qty"])) blockers.push({ kind: "serial", idx: n(r["idx"]), item: code, msg: "Serial numbers must match the quantity", required: n(r["qty"]), available: cnt, next: "Add Serial / Batch No on the row" }); }
  }
  if (!canSubmit) blockers.push({ kind: "permission", msg: "You do not have permission to submit", next: "Ask a stock manager to submit" });
  const needsSource = t.lines.some((l) => l.from);
  return { purpose: t.purpose, lines: t.lines.length, blockers, unknownStock: unknownStock && needsSource, ready: t.lines.length > 0 && blockers.length === 0 && !(unknownStock && needsSource) };
}

/* ---------- SC-S-08 Sales Analytics drill-down (submitted native documents, same tree types as the source report) ---------- */
export type SaDoc = "Sales Order" | "Delivery Note" | "Sales Invoice";
export type SaTree = "Customer" | "Customer Group" | "Territory" | "Item" | "Item Group" | "Sales Person";
const SA_DATE: Record<SaDoc, string> = { "Sales Order": "transaction_date", "Delivery Note": "posting_date", "Sales Invoice": "posting_date" };
export function salesAnalytics(company: string, f: { doc: SaDoc; tree: SaTree; measure: "value" | "qty"; months: number; from?: string | undefined; to?: string | undefined }, user = currentUser(), today = todayIso()) {
  const st = sourceStatus(f.doc, user);
  const end = (previousPeriod(f.to || today,f.to || today) ? f.to || today : today).slice(0, 7); let months: string[] = [];
  for (let i = f.months - 1; i >= 0; i--) { const d = new Date(Date.UTC(+end.slice(0, 4), +end.slice(5, 7) - 1 - i, 1)); months.push(d.toISOString().slice(0, 7)); }
  const from=f.from || `${months[0]}-01`, to=f.to || today;
  const valid=previousPeriod(from,to);
  if (valid) {
    months=[]; let cursor=new Date(`${from.slice(0,7)}-01T00:00:00Z`);
    while(cursor.toISOString().slice(0,7)<=to.slice(0,7) && months.length<120) { months.push(cursor.toISOString().slice(0,7));cursor.setUTCMonth(cursor.getUTCMonth()+1); }
  } else months=[];
  const custs = new Map(read("Customer", user).map((c) => [c.name, c]));
  const items = new Map(read("Item",user).map(d=>[d.name,d]));
  const references = new Map<string,Set<string>>();
  let activeDoc="", allocationIssues=0;
  const acc = new Map<string, { key: string; cells: Record<string, number>; total: number }>();
  // RXP-01: per (group, month, document) contribution so a selected cell lists exactly the source documents that make it up
  const contrib = new Map<string, { key: string; month: string; doc: string; value: number; date: string; party: string }>();
  let activeDate = "", activeParty = "";
  const put = (key: string, m: string, v: number) => { const a = acc.get(key) ?? { key, cells: {}, total: 0 }; a.cells[m] = r2((a.cells[m] ?? 0) + v); a.total = r2(a.total + v); acc.set(key, a);const names=references.get(key) || new Set<string>();names.add(activeDoc);references.set(key,names);
    const ck = `${key}\u0000${m}\u0000${activeDoc}`; const c = contrib.get(ck) ?? { key, month: m, doc: activeDoc, value: 0, date: activeDate, party: activeParty }; c.value = r2(c.value + v); contrib.set(ck, c); };
  for (const d of read(f.doc, user, (x) => n(x.docstatus) === 1 && (!company || x["company"] === company))) {
    const date=s(d[SA_DATE[f.doc]]), m = date.slice(0, 7); if (!months.includes(m) || date<from || date>to) continue;
    activeDoc=d.name; activeDate=date; activeParty=s(d["customer"]);
    if (f.tree === "Item" || f.tree === "Item Group") { for (const r of rows(d, "items")) put(f.tree==="Item" ? s(r["item_code"]) : s(r["item_group"] || items.get(s(r["item_code"]))?.["item_group"]) || "—", m, f.measure === "qty" ? n(r["stock_qty"] ?? r["qty"]) : n(r["base_net_amount"] ?? r["net_amount"] ?? r["amount"])); continue; }
    if (f.tree === "Sales Person") { const v = f.measure === "qty" ? n(d["total_qty"]) : n(d["base_net_total"] ?? d["net_total"]); const team = rows(d, "sales_team").filter((r) => s(r["sales_person"]));
      const allocated=team.reduce((sum,r)=>sum+n(r["allocated_percentage"]),0);
      if (!team.length || Math.abs(allocated-100)>.005 || team.some(r=>n(r["allocated_percentage"])<0)) {put("—",m,v);if(team.length) allocationIssues++;}
      else for (const r of team) put(s(r["sales_person"]), m, v*n(r["allocated_percentage"])/100); continue; }
    const c = custs.get(s(d["customer"]));
    const key = f.tree === "Customer" ? s(d["customer"]) : f.tree === "Customer Group" ? s(d["customer_group"] || c?.["customer_group"]) : s(d["territory"] || c?.["territory"]);
    put(key || "—", m, f.measure === "qty" ? n(d["total_qty"]) : n(d["base_net_total"] ?? d["net_total"]));
  }
  const out = [...acc.values()].sort((a, b) => b.total - a.total);
  const colTotals = Object.fromEntries(months.map((m) => [m, r2(out.reduce((t, x) => t + (x.cells[m] ?? 0), 0))]));
  return { status: st, months, rows: out, colTotals, total: r2(out.reduce((t, x) => t + x.total, 0)), dateField: SA_DATE[f.doc],from,to,valid:!!valid,references,allocationIssues, lines: [...contrib.values()] };
}

/* ---------- SC-A-06b Asset disposal review (mirrors Core assets.ts disposeAsset; never posts) ---------- */
export function disposalPreview(asset: string, date: string, saleAmount: number, user = currentUser()) {
  const a = read("Asset", user, (x) => x.name === asset)[0];
  if (!a) return null;
  const blocked = n(a.docstatus) !== 1 ? "Asset must be submitted" : ["Sold", "Scrapped", "Capitalized"].includes(s(a["status"])) ? `Asset is already ${s(a["status"])}` : "";
  const acc = assetAccounts(a);
  // FA8-b: same figures assets.disposeAsset posts — the default book's schedule, its rows with a real Journal Entry
  // (booked) and every other row up to the disposal date (posted first by disposeAsset), cost = schedule net purchase
  // amount else the asset cost; without a schedule the asset's own value after depreciation is the book value.
  const sch = read("Asset Depreciation Schedule", user, (d) => d["asset"] === asset && n(d.docstatus) !== 2);
  const defFb = s(a["default_finance_book"]); const book = sch.find((d) => s(d["finance_book"]) === defFb) ?? sch[0];
  const assetCost = n(a["gross_purchase_amount"] ?? a["net_purchase_amount"]);
  const cost = book ? n(book["net_purchase_amount"] ?? assetCost) : assetCost;
  const realJe = (r: Doc) => !!s(r["journal_entry"]) && r["journal_entry"] !== "preview";
  const rowsB = book ? ((book["depreciation_schedule"] as Doc[] | undefined) ?? []) : [];
  const booked = book ? r2(n(book["opening_accumulated_depreciation"]) + rowsB.filter(realJe).reduce((t, r) => t + n(r["depreciation_amount"]), 0))
    : r2(cost - (a["value_after_depreciation"] !== undefined && a["value_after_depreciation"] !== "" ? n(a["value_after_depreciation"]) : cost));
  const unbooked = r2(rowsB.filter((r) => !realJe(r) && s(r["schedule_date"]) <= date).reduce((t, r) => t + n(r["depreciation_amount"]), 0));
  const accum = r2(booked + unbooked), nbv = r2(cost - accum), gainLoss = r2(saleAmount - nbv);
  const lines: { account: string; debit: number; credit: number }[] = [{ account: acc.fixed, debit: 0, credit: cost }];
  if (accum) lines.push({ account: acc.accumulated, debit: accum, credit: 0 });
  if (saleAmount) lines.push({ account: acc.bank, debit: r2(saleAmount), credit: 0 });
  if (gainLoss) lines.push({ account: acc.gainLoss, debit: gainLoss < 0 ? -gainLoss : 0, credit: gainLoss > 0 ? gainLoss : 0 });
  return { asset: a.name, asset_name: s(a["asset_name"]), status: s(a["status"]), blocked, cost, booked, unbooked, accum, nbv, gainLoss, lines,
    debit: r2(lines.reduce((t, l) => t + l.debit, 0)), credit: r2(lines.reduce((t, l) => t + l.credit, 0)) };
}

/** RXP-01 SAL-INVOICED drill: documents behind one selected group/month cell (undefined = all). The returned total equals the
 * clicked cell because both come from the same per-document contributions (salesperson allocation already applied once). */
export function salesSelection(lines: { key: string; month: string; doc: string; value: number; date: string; party: string }[], key: string | undefined, month: string | undefined) {
  const by = new Map<string, { doc: string; date: string; party: string; value: number; groups: Set<string> }>();
  for (const l of lines) {
    if ((key !== undefined && l.key !== key) || (month && l.month !== month)) continue;
    const x = by.get(l.doc) ?? { doc: l.doc, date: l.date, party: l.party, value: 0, groups: new Set<string>() };
    x.value = r2(x.value + l.value); x.groups.add(l.key); by.set(l.doc, x);
  }
  const rows = [...by.values()].sort((a, b) => b.date.localeCompare(a.date) || a.doc.localeCompare(b.doc)).map((x) => ({ ...x, groups: [...x.groups] }));
  return { rows, total: r2(rows.reduce((t, x) => t + x.value, 0)) };
}
