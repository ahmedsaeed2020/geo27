/**
 * Serial No / Batch No (ERPNext serial_batch_bundle.py with use_serial_batch_fields: row serial_no newline list + batch_no).
 * Validations on submit and Serial No state on submit/cancel; batch balances are derived from submitted voucher rows.
 * Synthetic port: no Serial and Batch Bundle documents are created.
 */
import { adapter, type Doc } from "./adapter";

const n = (v: unknown) => Number(v ?? 0) || 0;
const rows = (d: Doc, f = "items") => (Array.isArray(d[f]) ? (d[f] as Record<string, unknown>[]) : []);
export const SB_DOCTYPES = ["Stock Entry", "Purchase Receipt", "Delivery Note"];
export type SbLine = { idx: number; item_code: string; warehouse: string; qty: number; serials: string[]; batch: string };

export const parseSerials = (v: unknown) => String(v ?? "").split(/[\n,]+/).map((s) => s.trim()).filter(Boolean);
const item = (code: string) => adapter.get("Item", code);
export const hasSerial = (code: string) => n(item(code)?.["has_serial_no"]) === 1;
export const hasBatch = (code: string) => n(item(code)?.["has_batch_no"]) === 1;

export function sbLines(dt: string, d: Doc): SbLine[] {
  const L: SbLine[] = []; const ret = n(d["is_return"]) ? -1 : 1;
  for (const x of rows(d)) {
    const code = String(x["item_code"] ?? ""); const q = n(x["transfer_qty"] ?? x["stock_qty"] ?? x["qty"]) || n(x["qty"]); if (!code || !q) continue;
    const base = { idx: n(x["idx"]) || L.length + 1, item_code: code, serials: parseSerials(x["serial_no"]), batch: String(x["batch_no"] ?? "") };
    if (dt === "Stock Entry") {
      if (x["s_warehouse"]) L.push({ ...base, warehouse: String(x["s_warehouse"]), qty: -q });
      if (x["t_warehouse"]) L.push({ ...base, warehouse: String(x["t_warehouse"]), qty: q });
    } else if (dt === "Purchase Receipt") L.push({ ...base, warehouse: String(x["warehouse"] || d["set_warehouse"]), qty: ret * q });
    else if (dt === "Delivery Note") L.push({ ...base, warehouse: String(x["warehouse"] || d["set_warehouse"]), qty: -ret * q });
  }
  return L;
}

/** Batch balance in a warehouse from submitted vouchers (get_batch_qty), optionally excluding one voucher. */
export function batchQty(batch: string, wh: string, exclude?: string): number {
  let q = 0;
  for (const dt of SB_DOCTYPES) for (const d of adapter.list(dt)) {
    if (n(d["docstatus"]) !== 1 || d.name === exclude) continue;
    for (const l of sbLines(dt, d)) if (l.batch === batch && l.warehouse === wh) q += l.qty;
  }
  return Math.round(q * 1000) / 1000;
}

export function serialBatchErrors(dt: string, d: Doc): string[] {
  if (!SB_DOCTYPES.includes(dt)) return [];
  const e: string[] = []; const date = String(d["posting_date"] ?? new Date().toISOString().slice(0, 10));
  const lines = sbLines(dt, d); const seen = new Set<string>(); const outBatch = new Map<string, number>();
  const ownSo = new Set(rows(d).map((r) => String(r["against_sales_order"] ?? "")).filter(Boolean)); const held = dt === "Delivery Note" || dt === "Stock Entry" ? reservedSerials(ownSo) : new Map<string, string>();
  for (const l of lines) {
    const out = l.qty < 0;
    if (hasSerial(l.item_code)) {
      if (!l.serials.length) { e.push(`Row #${l.idx}: Serial No is mandatory for Item ${l.item_code}`); continue; }
      if (l.serials.length !== Math.abs(l.qty)) e.push(`Row #${l.idx}: ${Math.abs(l.qty)} Serial Numbers required for Item ${l.item_code}. You have provided ${l.serials.length}.`);
      for (const s of l.serials) {
        const k = `${s}\u0000${out ? "o" : "i"}`; if (seen.has(k)) e.push(`Serial No ${s} is entered more than once`); seen.add(k);
        const sn = adapter.get("Serial No", s);
        if (sn && sn["item_code"] && sn["item_code"] !== l.item_code) { e.push(`Serial No ${s} does not belong to Item ${l.item_code}`); continue; }
        if (out) { if (!sn || sn["status"] !== "Active" || sn["warehouse"] !== l.warehouse) e.push(`Serial No ${s} does not belong to Warehouse ${l.warehouse}`); else if (held.has(s)) e.push(`Serial No ${s} is reserved for Sales Order ${held.get(s)}`); }
        else if (sn && sn["status"] === "Active" && sn["warehouse"] && !lines.some((o) => o.qty < 0 && o.serials.includes(s))) e.push(`Serial No ${s} already exists`);
      }
    } else if (l.serials.length) e.push(`Row #${l.idx}: Item ${l.item_code} is not setup for Serial Nos`);
    if (hasBatch(l.item_code)) {
      if (!l.batch) { e.push(`Row #${l.idx}: Batch No is mandatory for Item ${l.item_code}`); continue; }
      const b = adapter.get("Batch", l.batch);
      if (!b && (out || !n(item(l.item_code)?.["create_new_batch"]))) { e.push(`Batch ${l.batch} not found`); continue; }
      if (b && String(b["item"] ?? l.item_code) !== l.item_code) { e.push(`Batch ${l.batch} does not belong to Item ${l.item_code}`); continue; }
      if (b && n(b["disabled"])) e.push(`Batch ${l.batch} of Item ${l.item_code} is disabled.`);
      if (out && b?.["expiry_date"] && String(b["expiry_date"]) < date) e.push(`Batch ${l.batch} of Item ${l.item_code} has expired.`);
      if (out) { const k = `${l.batch}\u0000${l.warehouse}`; outBatch.set(k, (outBatch.get(k) ?? 0) - l.qty); }
    } else if (l.batch) e.push(`Row #${l.idx}: Item ${l.item_code} is not setup for Batch No`);
  }
  for (const [k, need] of outBatch) {
    const [b, wh] = k.split("\u0000"); const have = batchQty(b!, wh!, d.name) - reservedBatchQty(b!, wh!, ownSo);
    // v15 compatibility: batch stock may go negative only when BOTH global allow_negative_stock and allow_negative_stock_for_batch are on, and never for serialized items
    const bItem = String(adapter.get("Batch", b!)?.["item"] ?? ""); const st = adapter.get("Stock Settings", "Stock Settings");
    const negOk = n(st?.["allow_negative_stock"]) && n(st?.["allow_negative_stock_for_batch"]) && !hasSerial(bItem);
    if (need > have + 1e-9 && !negOk) e.push(`The batch ${b} has only ${have} qty in warehouse ${wh}. Please select another batch or reduce qty.`);
  }
  return e;
}

/** Apply Serial No / Batch state for a submitted (sign 1) or cancelled (sign -1) voucher. */
export function applySerialBatch(dt: string, d: Doc, sign: 1 | -1) {
  if (!SB_DOCTYPES.includes(dt)) return;
  const lines = sbLines(dt, d);
  // outgoing first, then incoming, so a transfer ends in the target warehouse (reverse order on cancel)
  const order = sign === 1 ? [...lines.filter((l) => l.qty < 0), ...lines.filter((l) => l.qty > 0)] : [...lines.filter((l) => l.qty > 0), ...lines.filter((l) => l.qty < 0)];
  for (const l of order) {
    if (hasBatch(l.item_code) && l.batch && l.qty > 0 && sign === 1 && !adapter.get("Batch", l.batch))
      adapter.insertDoc("Batch", { name: l.batch, batch_id: l.batch, item: l.item_code, reference_doctype: dt, reference_name: d.name, manufacturing_date: d["posting_date"] });
    if (!hasSerial(l.item_code)) continue;
    const incoming = (l.qty > 0) === (sign === 1);
    for (const s of l.serials) {
      const sn = adapter.get("Serial No", s);
      const patch = incoming
        ? { status: "Active", warehouse: l.warehouse, ...(l.batch ? { batch_no: l.batch } : {}), ...(sign === 1 && dt === "Purchase Receipt" ? { purchase_document_no: d.name, supplier: d["supplier"] } : {}) }
        : { status: dt === "Delivery Note" && sign === 1 ? "Delivered" : sign === 1 ? "Consumed" : "Inactive", warehouse: "", ...(dt === "Delivery Note" && sign === 1 ? { delivery_document_no: d.name, customer: d["customer"] } : {}) };
      if (sn) adapter.update("Serial No", s, patch);
      else if (incoming) adapter.insertDoc("Serial No", { name: s, serial_no: s, item_code: l.item_code, company: d["company"], ...patch });
    }
  }
}

/** Cancel guard: serials received by this voucher must still sit in its warehouse. */
export function serialCancelErrors(dt: string, d: Doc): string[] {
  if (!SB_DOCTYPES.includes(dt)) return [];
  const e: string[] = [];
  for (const l of sbLines(dt, d)) if (l.qty > 0 && hasSerial(l.item_code)) for (const s of l.serials) { const sn = adapter.get("Serial No", s); if (sn && (sn["status"] !== "Active" || sn["warehouse"] !== l.warehouse)) e.push(`Serial No ${s} has already been transacted, cannot cancel ${dt} ${d.name}`); }
  return e;
}

/** Next names for a naming series like "SN-.#####" (frappe make_autoname hash counter), skipping existing docs. */
export function seriesNames(dt: string, series: string, count: number): string[] {
  const m = series.match(/^(.*?)\.?(#+)$/); const prefix = m ? m[1]! : series; const width = m ? m[2]!.length : 5;
  const used = new Set(adapter.list(dt).map((x) => x.name)); const out: string[] = []; let i = 1;
  for (const nme of used) if (nme.startsWith(prefix)) { const k = Number(nme.slice(prefix.length)); if (Number.isFinite(k) && k >= i) i = k + 1; }
  while (out.length < count) { const nm = prefix + String(i++).padStart(width, "0"); if (!used.has(nm)) out.push(nm); }
  return out;
}

/** Incoming rows with no serial/batch get names from the item's serial_no_series / batch_number_series (auto_make_serial_nos). */
export function autoSerialBatch(dt: string, d: Doc): Doc {
  if (!SB_DOCTYPES.includes(dt) || n(d["is_return"])) return d;
  let changed = false;
  const items = rows(d).map((x) => {
    const code = String(x["item_code"] ?? ""); const it = item(code); if (!it) return x;
    const incoming = dt === "Purchase Receipt" || (dt === "Stock Entry" && x["t_warehouse"] && !x["s_warehouse"]); if (!incoming) return x;
    const r = { ...x }; const q = Math.abs(n(x["transfer_qty"] ?? x["stock_qty"] ?? x["qty"]) || n(x["qty"]));
    if (n(it["has_serial_no"]) && it["serial_no_series"] && !parseSerials(x["serial_no"]).length && q) { r["serial_no"] = seriesNames("Serial No", String(it["serial_no_series"]), q).join("\n"); changed = true; }
    if (n(it["has_batch_no"]) && n(it["create_new_batch"]) && it["batch_number_series"] && !x["batch_no"]) { r["batch_no"] = seriesNames("Batch", String(it["batch_number_series"]), 1)[0]; changed = true; }
    return r;
  });
  if (!changed) return d;
  adapter.update(dt, d.name, { items }); return adapter.get(dt, d.name)!;
}

const ss = () => adapter.get("Stock Settings", "Stock Settings") ?? ({} as Doc);
const setting = (f: string, dflt: number) => { const v = ss()[f]; return v === undefined || v === null || v === "" ? dflt : n(v); };

/** Serial/batch held by open Stock Reservation Entries (reservation_based_on "Serial and Batch"), excluding given Sales Orders. */
type SbEntry = { serial_no?: string; batch_no?: string; qty: number; delivered_qty?: number };
const openSre = (excludeSo: Set<string>) => adapter.list("Stock Reservation Entry").filter((x) => n(x["docstatus"]) === 1 && x["status"] !== "Delivered" && !excludeSo.has(String(x["voucher_no"])));
const sbEntries = (x: Doc) => (Array.isArray(x["sb_entries"]) ? (x["sb_entries"] as SbEntry[]) : []);
export function reservedSerials(excludeSo: Set<string> = new Set()): Map<string, string> {
  const m = new Map<string, string>();
  for (const x of openSre(excludeSo)) for (const e of sbEntries(x)) if (e.serial_no && n(e.delivered_qty) < n(e.qty)) m.set(e.serial_no, String(x["voucher_no"]));
  return m;
}
export function reservedBatchQty(batch: string, wh: string, excludeSo: Set<string> = new Set()): number {
  let q = 0;
  for (const x of openSre(excludeSo)) if (x["warehouse"] === wh) for (const e of sbEntries(x)) if (e.batch_no === batch && !e.serial_no) q += Math.max(n(e.qty) - n(e.delivered_qty), 0);
  return q;
}
/** Pick serials/batches to reserve for a Sales Order row (stock_reservation_entry.py based_on "Serial and Batch"). */
export function pickForReservation(code: string, wh: string, qty: number): SbEntry[] {
  const out: SbEntry[] = [];
  if (hasSerial(code)) {
    const held = reservedSerials();
    const sns = adapter.list("Serial No").filter((s) => s["item_code"] === code && s["status"] === "Active" && s["warehouse"] === wh && !held.has(s.name)).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    for (const s of sns.slice(0, Math.floor(qty))) out.push({ serial_no: s.name, ...(s["batch_no"] ? { batch_no: String(s["batch_no"]) } : {}), qty: 1, delivered_qty: 0 });
    return out;
  }
  if (hasBatch(code)) {
    let left = qty;
    for (const b of adapter.list("Batch").filter((b) => b["item"] === code && !n(b["disabled"])).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))) {
      if (left <= 1e-9) break; const free = batchQty(b.name, wh) - reservedBatchQty(b.name, wh); if (free <= 1e-9) continue;
      const q = Math.min(free, left); out.push({ batch_no: b.name, qty: q, delivered_qty: 0 }); left -= q;
    }
  }
  return out;
}

/** Outgoing rows with no serial/batch are picked from stock (auto_create_serial_and_batch_bundle_for_outward, pick_serial_and_batch_based_on). */
export function autoPickOutward(dt: string, d: Doc): Doc {
  if (!SB_DOCTYPES.includes(dt) || !setting("auto_create_serial_and_batch_bundle_for_outward", 1)) return d;
  const basis = String(ss()["pick_serial_and_batch_based_on"] || "FIFO"); const date = String(d["posting_date"] ?? new Date().toISOString().slice(0, 10));
  const order = <T extends Doc>(xs0: T[], exp: (x: T) => string) => { const xs = [...xs0].sort((a, b) => String(a["creation"] ?? "").localeCompare(String(b["creation"] ?? "")) || a.name.localeCompare(b.name, undefined, { numeric: true })); return basis === "LIFO" ? xs.reverse() : basis === "Expiry" ? [...xs].sort((a, b) => (exp(a) || "9999").localeCompare(exp(b) || "9999")) : xs; };
  const taken = new Set<string>(); const usedBatch = new Map<string, number>(); let changed = false;
  const items = rows(d).flatMap((x): Record<string, unknown>[] => {
    const code = String(x["item_code"] ?? ""); const it = item(code); if (!it) return [x];
    const out = dt === "Delivery Note" ? !n(d["is_return"]) : dt === "Stock Entry" ? !!x["s_warehouse"] : !!n(d["is_return"]);
    if (!out) return [x];
    const wh = String(x["s_warehouse"] || x["warehouse"] || d["set_warehouse"] || ""); const q = Math.abs(n(x["transfer_qty"] ?? x["stock_qty"] ?? x["qty"]) || n(x["qty"])); if (!q) return [x];
    const so = String(x["against_sales_order"] ?? ""); const ownSo = new Set(so ? [so] : []); const held = reservedSerials(ownSo);
    const mineRes = so ? adapter.list("Stock Reservation Entry").filter((s) => n(s["docstatus"]) === 1 && s["voucher_no"] === so && s["item_code"] === code && s["warehouse"] === wh).flatMap(sbEntries) : [];
    const r = { ...x };
    if (n(it["has_batch_no"]) && !x["batch_no"] && !n(it["has_serial_no"])) {
      const avail = (b: Doc) => batchQty(b.name, wh, d.name) - reservedBatchQty(b.name, wh, ownSo) - (usedBatch.get(b.name + wh) ?? 0);
      let bs = order(adapter.list("Batch").filter((b) => b["item"] === code && !n(b["disabled"]) && !(b["expiry_date"] && String(b["expiry_date"]) < date)), (b) => String(b["expiry_date"] ?? ""));
      const resB = new Set(mineRes.map((e) => e.batch_no).filter(Boolean)); bs = [...bs.filter((b) => resB.has(b.name)), ...bs.filter((b) => !resB.has(b.name))];
      const one = bs.find((b) => avail(b) >= q - 1e-9);
      if (one) { r["batch_no"] = one.name; usedBatch.set(one.name + wh, (usedBatch.get(one.name + wh) ?? 0) + q); changed = true; return [r]; }
      // multi-batch fulfilment: split the row across batches (one row per batch, as serial_batch_fields allow one batch per row)
      const parts: [string, number][] = []; let left = q;
      for (const b of bs) { if (left <= 1e-9) break; const a = avail(b); if (a <= 1e-9) continue; const t = Math.min(a, left); parts.push([b.name, t]); left -= t; }
      if (left > 1e-9 || parts.length < 2) return [r];
      changed = true; const rate = n(x["rate"]); const ratio = n(x["conversion_factor"]) || 1;
      // split rows keep every source link (against_sales_order, so_detail, ...) and record split_from_row; the last part absorbs rounding so qty/amount totals are preserved
      const tq = n(x["qty"]); const tAmt = n(x["amount"]) || Math.round(tq * rate * 100) / 100; let qSum = 0, aSum = 0;
      return parts.map(([b, t], i) => { usedBatch.set(b + wh, (usedBatch.get(b + wh) ?? 0) + t); const last = i === parts.length - 1;
        const qq = last ? Math.round((tq - qSum) * 1000) / 1000 : Math.round((t / ratio) * 1000) / 1000; const am = last ? Math.round((tAmt - aSum) * 100) / 100 : Math.round(qq * rate * 100) / 100; qSum += qq; aSum += am;
        return { ...x, ...(i ? { name: `${String(x["name"] ?? "row")}-b${i}`, split_from_row: x["name"] } : {}), batch_no: b, qty: qq, ...(x["stock_qty"] !== undefined ? { stock_qty: t } : {}), ...(x["transfer_qty"] !== undefined ? { transfer_qty: t } : {}), ...(rate || x["amount"] !== undefined ? { amount: am } : {}) }; });
    }
    if (n(it["has_batch_no"]) && !x["batch_no"]) {
      const bs = order(adapter.list("Batch").filter((b) => b["item"] === code && !n(b["disabled"]) && !(b["expiry_date"] && String(b["expiry_date"]) < date)), (b) => String(b["expiry_date"] ?? ""));
      const b = bs.find((b) => batchQty(b.name, wh, d.name) - reservedBatchQty(b.name, wh, ownSo) - (usedBatch.get(b.name + wh) ?? 0) >= q - 1e-9);
      if (b) { r["batch_no"] = b.name; usedBatch.set(b.name + wh, (usedBatch.get(b.name + wh) ?? 0) + q); changed = true; }
    }
    if (n(it["has_serial_no"]) && !parseSerials(x["serial_no"]).length) {
      const batch = String(r["batch_no"] ?? ""); const resS = new Set(mineRes.map((e) => e.serial_no).filter(Boolean));
      let sns = order(adapter.list("Serial No").filter((s) => s["item_code"] === code && s["status"] === "Active" && s["warehouse"] === wh && !taken.has(s.name) && !held.has(s.name) && (!batch || !s["batch_no"] || s["batch_no"] === batch)), (s) => String(adapter.get("Batch", String(s["batch_no"] ?? ""))?.["expiry_date"] ?? ""));
      sns = [...sns.filter((s) => resS.has(s.name)), ...sns.filter((s) => !resS.has(s.name))];
      if (sns.length >= q) { const pick = sns.slice(0, q).map((s) => s.name); pick.forEach((s) => taken.add(s)); r["serial_no"] = pick.join("\n"); changed = true; }
    }
    return [r];
  });
  if (!changed) return d;
  adapter.update(dt, d.name, { items }); return adapter.get(dt, d.name)!;
}
