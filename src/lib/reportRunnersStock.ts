/**
 * Local ports of the stock, asset and access Script Reports DIGIT links to that had no runner
 * (erpnext/stock|assets/report/…, frappe/core/report/permitted_documents_for_user). Same filter fieldnames as the source .js.
 */
import { adapter, type Doc } from "./adapter";
import { accumulated, bookValue } from "./assets";
import { cachedMeta } from "./catalog";
import { filterReadable, userRoles } from "./session";
import { SB_DOCTYPES, sbLines } from "./serialBatch";
import { C0, FROM, TO, S, between, col, cur, daysBetween, fiscalYear, fl, flt, inMs, itemName, ms, n, periods, r2, r3, rows, sleOf, sub, today, totalRow, withGroupTotals, type F, type Row, type Runner } from "./reportKit";

const co = (f: F) => f["company"] || "";
const range = (f: F) => { const y = fiscalYear(f["fiscal_year"]); return { from: f["from_date"] || y.start, to: f["to_date"] || y.end }; };
const item = (code: string) => adapter.get("Item", code);
const whType = (w: string) => S(adapter.get("Warehouse", w)?.["warehouse_type"]);
const whOk = (w: unknown, f: F) => (!f["warehouse"] || inMs(w, f["warehouse"])) && (!f["warehouse_type"] || whType(S(w)) === f["warehouse_type"]);

/** Batch movements from submitted vouchers (serial_and_batch_bundle rows → sbLines). */
function batchMoves(company?: string) {
  const out: { date: string; voucher_type: string; voucher_no: string; item_code: string; warehouse: string; batch: string; serials: string[]; qty: number }[] = [];
  for (const dt of SB_DOCTYPES) for (const d of adapter.list(dt)) if (sub(d) && (!company || d["company"] === company)) for (const l of sbLines(dt, d)) out.push({ date: S(d["posting_date"]), voucher_type: dt, voucher_no: d.name, item_code: l.item_code, warehouse: l.warehouse, batch: l.batch, serials: l.serials, qty: l.qty });
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/** batch_item_expiry_status.py: batches of batch-tracked items with balance and days to expiry. */
const batchExpiry: Runner = {
  src: "erpnext/stock/report/batch_item_expiry_status/batch_item_expiry_status.py",
  filters: [FROM, TO, fl("item", "Item", "Link", "Item")],
  run: (f) => {
    const { from, to } = range(f); const bal = new Map<string, number>(); for (const m of batchMoves()) if (m.batch) bal.set(m.batch, (bal.get(m.batch) ?? 0) + m.qty);
    const out: Row[] = adapter.list("Batch").filter((b) => (!f["item"] || b["item"] === f["item"]) && between(S(b["creation"] ?? b["manufacturing_date"]).slice(0, 10), from, to) && (bal.get(b.name) ?? n(b["batch_qty"])) > 0 && n(b["disabled"]) === 0)
      .map((b) => ({ item: b["item"], item_name: b["item_name"] ?? itemName(S(b["item"])), batch: b.name, stock_uom: b["stock_uom"] ?? item(S(b["item"]))?.["stock_uom"] ?? "", quantity: r3(bal.get(b.name) ?? n(b["batch_qty"])), expires_on: b["expiry_date"] ?? "", expiry_in_days: b["expiry_date"] ? daysBetween(today(), S(b["expiry_date"])) : "" }));
    return { columns: [col("item", "Item", "Link", "Item", 130), col("item_name", "Item Name", "Data", undefined, 170), col("batch", "Batch", "Link", "Batch", 140), col("stock_uom", "UOM", "Link", "UOM", 60), flt("quantity", "Quantity"), col("expires_on", "Expires On", "Date", undefined, 100), { fieldname: "expiry_in_days", label: "Expiry (In Days)", fieldtype: "Int", width: 100 }], rows: out };
  },
};

/** batch_wise_balance_history.py: opening, in, out and balance per item / warehouse / batch. */
const batchBalance: Runner = {
  src: "erpnext/stock/report/batch_wise_balance_history/batch_wise_balance_history.py",
  filters: [C0, FROM, TO, fl("item_code", "Item Code", "Link", "Item"), fl("warehouse_type", "Warehouse Type", "Link", "Warehouse Type"), fl("warehouse", "Warehouse", "Link", "Warehouse"), fl("batch_no", "Batch No", "Link", "Batch")],
  run: (f) => {
    const { from, to } = range(f); const by = new Map<string, { item: string; wh: string; batch: string; o: number; i: number; out: number }>();
    for (const m of batchMoves(co(f))) {
      if (!m.batch || m.date > to || (f["item_code"] && m.item_code !== f["item_code"]) || (f["batch_no"] && m.batch !== f["batch_no"]) || !whOk(m.warehouse, f)) continue;
      const k = `${m.item_code}\u0000${m.warehouse}\u0000${m.batch}`; const r = by.get(k) ?? { item: m.item_code, wh: m.warehouse, batch: m.batch, o: 0, i: 0, out: 0 };
      if (m.date < from) r.o += m.qty; else if (m.qty > 0) r.i += m.qty; else r.out -= m.qty; by.set(k, r);
    }
    const list: Row[] = [...by.values()].map((r) => ({ item: r.item, item_name: itemName(r.item), description: item(r.item)?.["description"] ?? "", warehouse: r.wh, batch: r.batch, opening_qty: r3(r.o), in_qty: r3(r.i), out_qty: r3(r.out), bal_qty: r3(r.o + r.i - r.out), stock_uom: item(r.item)?.["stock_uom"] ?? "" }));
    const keys = ["opening_qty", "in_qty", "out_qty", "bal_qty"];
    return { columns: [col("item", "Item", "Link", "Item", 130), col("item_name", "Item Name", "Data", undefined, 170), col("warehouse", "Warehouse", "Link", "Warehouse", 140), col("batch", "Batch", "Link", "Batch", 140), flt("opening_qty", "Opening Qty"), flt("in_qty", "In Qty"), flt("out_qty", "Out Qty"), flt("bal_qty", "Balance Qty"), col("stock_uom", "UOM", "Link", "UOM", 60)], rows: list.length ? [...list, totalRow(list, "item", keys)] : [] };
  },
};

/** serial_no_ledger.py: every movement of one item's serial numbers up to a date. */
const serialLedger: Runner = {
  src: "erpnext/stock/report/serial_no_ledger/serial_no_ledger.py",
  filters: [fl("item_code", "Item", "Link", "Item"), fl("warehouse", "Warehouse", "Link", "Warehouse"), fl("serial_no", "Serial No", "Link", "Serial No"), fl("posting_date", "Posting Date", "Date", undefined, "__today")],
  run: (f) => {
    const asOf = f["posting_date"] || today(); const out: Row[] = [];
    for (const m of batchMoves()) {
      if (!m.serials.length || m.date > asOf || (f["item_code"] && m.item_code !== f["item_code"]) || (f["warehouse"] && m.warehouse !== f["warehouse"])) continue;
      for (const s of m.serials) if (!f["serial_no"] || s === f["serial_no"]) out.push({ posting_date: m.date, serial_no: s, item_code: m.item_code, item_name: itemName(m.item_code), warehouse: m.warehouse, voucher_type: m.voucher_type, voucher_no: m.voucher_no, qty: m.qty > 0 ? 1 : -1, direction: m.qty > 0 ? "Inward" : "Outward", status: adapter.get("Serial No", s)?.["status"] ?? "" });
    }
    return { columns: [col("posting_date", "Posting Date", "Date", undefined, 100), col("serial_no", "Serial No", "Link", "Serial No", 150), col("item_code", "Item Code", "Link", "Item", 130), col("item_name", "Item Name", "Data", undefined, 160), col("warehouse", "Warehouse", "Link", "Warehouse", 140), col("voucher_type", "Voucher Type", "Data", undefined, 120), col("voucher_no", "Voucher No", "Dynamic Link", "voucher_type", 160), { fieldname: "qty", label: "Qty", fieldtype: "Int", width: 60 }, col("direction", "Direction", "Data", undefined, 90), col("status", "Status", "Data", undefined, 90)], rows: out };
  },
};

/** serial_no_and_batch_traceability.py: documents a batch / serial moved through, backward (source) and/or forward (use). */
const traceability: Runner = {
  src: "erpnext/stock/report/serial_no_and_batch_traceability/serial_no_and_batch_traceability.py",
  filters: [fl("item_code", "Item Code", "Link", "Item"), fl("batches", "Batch No", "MultiSelectList", "Batch"), fl("serial_nos", "Serial No", "MultiSelectList", "Serial No"), fl("traceability_direction", "Tracebility Direction", "Select", ["Backward", "Forward", "Both"], "Backward")],
  run: (f) => {
    const batches = ms(f["batches"]); const serials = ms(f["serial_nos"]); const dir = f["traceability_direction"] || "Backward";
    if (!batches.length && !serials.length && !f["item_code"]) return { columns: [], rows: [], error: "Please select Item Code, Batch No or Serial No" };
    const moves = batchMoves(); const out: Row[] = [];
    const keys = [...batches.map((b) => ({ kind: "Batch", v: b })), ...serials.map((s) => ({ kind: "Serial No", v: s }))];
    if (!keys.length) for (const m of moves) if (m.item_code === f["item_code"]) { if (m.batch && !keys.some((k) => k.v === m.batch)) keys.push({ kind: "Batch", v: m.batch }); for (const s of m.serials) if (!keys.some((k) => k.v === s)) keys.push({ kind: "Serial No", v: s }); }
    for (const k of keys) {
      const hits = moves.filter((m) => (k.kind === "Batch" ? m.batch === k.v : m.serials.includes(k.v)) && (!f["item_code"] || m.item_code === f["item_code"]));
      const pick = hits.filter((m) => dir === "Both" || (dir === "Backward" ? m.qty > 0 : m.qty < 0)); if (!pick.length) continue;
      out.push({ reference: k.v, reference_doctype: k.kind, item_code: pick[0]!.item_code, indent: 0, bold: true });
      for (const m of pick) out.push({ reference: m.voucher_no, reference_doctype: m.voucher_type, item_code: m.item_code, item_name: itemName(m.item_code), batch_no: m.batch, serial_no: k.kind === "Serial No" ? k.v : "", qty: m.qty, warehouse: m.warehouse, posting_date: m.date, direction: m.qty > 0 ? "Backward (received)" : "Forward (issued)", indent: 1 });
    }
    return { columns: [col("reference", "Reference", "Dynamic Link", "reference_doctype", 180), col("reference_doctype", "Reference Type", "Data", undefined, 120), col("item_code", "Item Code", "Link", "Item", 130), col("item_name", "Item Name", "Data", undefined, 160), col("batch_no", "Batch No", "Link", "Batch", 120), col("serial_no", "Serial No", "Link", "Serial No", 120), flt("qty", "Qty"), col("warehouse", "Warehouse", "Link", "Warehouse", 130), col("posting_date", "Posting Date", "Date", undefined, 100), col("direction", "Direction", "Data", undefined, 140)], rows: out };
  },
};

/** FIFO queue per item / warehouse from the stock ledger (stock_ageing.py FIFOSlots). */
function fifo(f: F, to: string) {
  const q = new Map<string, { item: string; wh: string; slots: [number, string, number][] }>();
  for (const e of sleOf(co(f))) {
    if (S(e["posting_date"]) > to || !whOk(e["warehouse"], f)) continue;
    const k = f["show_warehouse_wise_stock"] === "1" ? `${e["item_code"]}\u0000${e["warehouse"]}` : `${e["item_code"]}\u0000`;
    const m = q.get(k) ?? { item: S(e["item_code"]), wh: f["show_warehouse_wise_stock"] === "1" ? S(e["warehouse"]) : "", slots: [] };
    let qty = n(e["actual_qty"]); const rate = n(e["valuation_rate"]) || n(e["incoming_rate"]);
    if (qty > 0) m.slots.push([qty, S(e["posting_date"]), rate]);
    else { qty = -qty; while (qty > 0 && m.slots.length) { const s = m.slots[0]!; if (s[0] <= qty) { qty -= s[0]; m.slots.shift(); } else { s[0] -= qty; qty = 0; } } }
    q.set(k, m);
  }
  return [...q.values()];
}

/** stock_ageing.py: balance, average age and age buckets per item (optionally per warehouse). */
const stockAgeing: Runner = {
  src: "erpnext/stock/report/stock_ageing/stock_ageing.py",
  filters: [C0, fl("to_date", "As On Date", "Date", undefined, "__today"), fl("warehouse_type", "Warehouse Type", "Link", "Warehouse Type"), fl("warehouse", "Warehouse", "Link", "Warehouse"), fl("item_code", "Item", "Link", "Item"), fl("brand", "Brand", "Link", "Brand"), fl("range", "Ageing Range", "Data", undefined, "30, 60, 90"), fl("show_warehouse_wise_stock", "Show Warehouse-wise Stock", "Check")],
  run: (f) => {
    const to = f["to_date"] || today(); const rng = (f["range"] || "30, 60, 90").split(",").map((x) => n(x.trim())).filter((x) => x > 0).sort((a, b) => a - b);
    const labels = [...rng.map((x, i) => `${i ? rng[i - 1]! + 1 : 0}-${x}`), `${(rng[rng.length - 1] ?? 0) + 1}-Above`];
    const out: Row[] = [];
    for (const m of fifo(f, to)) {
      const it = item(m.item); if ((f["item_code"] && m.item !== f["item_code"]) || (f["brand"] && it?.["brand"] !== f["brand"])) continue;
      const qty = m.slots.reduce((a, s) => a + s[0], 0); if (qty <= 0.0005) continue;
      const val = m.slots.reduce((a, s) => a + s[0] * s[2], 0); const ages = m.slots.map((s) => daysBetween(s[1], to));
      const avg = qty ? m.slots.reduce((a, s, i) => a + s[0] * ages[i]!, 0) / qty : 0;
      const buckets = labels.map(() => ({ q: 0, v: 0 })); m.slots.forEach((s, i) => { const a = ages[i]!; let b = rng.findIndex((x) => a <= x); if (b < 0) b = rng.length; buckets[b]!.q += s[0]; buckets[b]!.v += s[0] * s[2]; });
      out.push({ item_code: m.item, item_name: it?.["item_name"] ?? m.item, description: it?.["description"] ?? "", item_group: it?.["item_group"] ?? "", brand: it?.["brand"] ?? "", ...(m.wh ? { warehouse: m.wh } : {}), qty: r3(qty), val: r2(val), avg_age: r2(avg), ...Object.fromEntries(buckets.flatMap((b, i) => [[`r${i}_qty`, r3(b.q)], [`r${i}_val`, r2(b.v)]])), earliest_age: Math.max(...ages), latest_age: Math.min(...ages), stock_uom: it?.["stock_uom"] ?? "" });
    }
    const keys = ["qty", "val", ...labels.flatMap((_, i) => [`r${i}_qty`, `r${i}_val`])];
    return { columns: [col("item_code", "Item Code", "Link", "Item", 120), col("item_name", "Item Name", "Data", undefined, 150), col("item_group", "Item Group", "Link", "Item Group", 110), col("brand", "Brand", "Link", "Brand", 80), ...(f["show_warehouse_wise_stock"] === "1" ? [col("warehouse", "Warehouse", "Link", "Warehouse", 130)] : []), flt("qty", "Available Qty"), cur("val", "Available Value"), flt("avg_age", "Average Age"), ...labels.flatMap((l, i) => [flt(`r${i}_qty`, `Age (${l})`), cur(`r${i}_val`, `Value (${l})`)]), { fieldname: "earliest_age", label: "Earliest", fieldtype: "Int", width: 70 }, { fieldname: "latest_age", label: "Latest", fieldtype: "Int", width: 70 }, col("stock_uom", "UOM", "Link", "UOM", 60)],
      rows: out.length ? [...out, totalRow(out, "item_code", keys)] : [] };
  },
};

/** stock_analytics.py: balance quantity or value per item at the end of each period. */
const stockAnalytics: Runner = {
  src: "erpnext/stock/report/stock_analytics/stock_analytics.py",
  filters: [fl("item_group", "Item Group", "Link", "Item Group"), fl("item_code", "Item", "Link", "Item"), fl("value_quantity", "Value Or Qty", "Select", ["Value", "Quantity"], "Value"), fl("brand", "Brand", "Link", "Brand"), C0, fl("warehouse", "Warehouse", "Link", "Warehouse"), FROM, TO, fl("range", "Range", "Select", ["Weekly", "Monthly", "Quarterly", "Yearly"], "Monthly")],
  run: (f) => {
    const { from, to } = range(f); const ps = periods(from, to, f["range"] || "Monthly"); const val = (f["value_quantity"] || "Value") === "Value";
    const by = new Map<string, Record<string, number>>();
    for (const e of sleOf(co(f))) {
      if (S(e["posting_date"]) > to || (f["warehouse"] && e["warehouse"] !== f["warehouse"])) continue;
      const it = item(S(e["item_code"])); if ((f["item_code"] && e["item_code"] !== f["item_code"]) || (f["item_group"] && it?.["item_group"] !== f["item_group"]) || (f["brand"] && it?.["brand"] !== f["brand"])) continue;
      const m = by.get(S(e["item_code"])) ?? {}; const d = val ? n(e["stock_value_difference"]) : n(e["actual_qty"]);
      for (const p of ps) if (S(e["posting_date"]) <= p.to) m[p.key] = (m[p.key] ?? 0) + d;
      by.set(S(e["item_code"]), m);
    }
    const list: Row[] = [...by.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([code, m]) => ({ name: code, item_name: itemName(code), stock_uom: item(code)?.["stock_uom"] ?? "", ...Object.fromEntries(ps.map((p) => [p.key, val ? r2(m[p.key] ?? 0) : r3(m[p.key] ?? 0)])) }));
    return { columns: [col("name", "Item", "Link", "Item", 130), col("item_name", "Item Name", "Data", undefined, 160), col("stock_uom", "UOM", "Link", "UOM", 60), ...ps.map((p) => (val ? cur(p.key, p.label) : flt(p.key, p.label)))], rows: list.length ? [...list, totalRow(list, "name", ps.map((p) => p.key))] : [] };
  },
};

/** total_stock_summary.py: current quantity per item grouped by warehouse or company. */
const totalStockSummary: Runner = {
  src: "erpnext/stock/report/total_stock_summary/total_stock_summary.py",
  filters: [fl("group_by", "Group By", "Select", ["Warehouse", "Company"], "Warehouse"), C0],
  run: (f) => {
    const g = f["group_by"] || "Warehouse"; const by = new Map<string, number>();
    for (const e of sleOf(co(f))) { const k = `${g === "Company" ? e["company"] : e["warehouse"]}\u0000${e["item_code"]}`; by.set(k, (by.get(k) ?? 0) + n(e["actual_qty"])); }
    const list: Row[] = [...by.entries()].filter(([, q]) => Math.abs(q) > 0.0005).sort((a, b) => a[0].localeCompare(b[0])).map(([k, q]) => { const [grp, code] = k.split("\u0000"); return { [g.toLowerCase()]: grp, item: code, item_name: itemName(code!), description: item(code!)?.["description"] ?? "", current_qty: r3(q) }; });
    const gk = g.toLowerCase();
    return { columns: [col(gk, g, "Link", g, 150), col("item", "Item", "Link", "Item", 130), col("item_name", "Item Name", "Data", undefined, 160), col("description", "Description", "Data", undefined, 160), flt("current_qty", "Current Qty")], rows: withGroupTotals(list, gk, ["current_qty"]) };
  },
};

/** warehouse_wise_item_balance_age_and_value.py: total qty/value per item with a quantity column per warehouse and stock age. */
const whBalanceAge: Runner = {
  src: "erpnext/stock/report/warehouse_wise_item_balance_age_and_value/warehouse_wise_item_balance_age_and_value.py",
  filters: [C0, FROM, TO, fl("item_group", "Item Group", "Link", "Item Group"), fl("item_code", "Item", "MultiSelectList", "Item"), fl("warehouse", "Warehouse", "MultiSelectList", "Warehouse"), fl("filter_total_zero_qty", "Filter Total Zero Qty", "Check", undefined, "1")],
  run: (f) => {
    const { to } = range(f); const whs = new Set<string>(); const by = new Map<string, { q: Record<string, number>; v: number; first: string }>();
    for (const e of sleOf(co(f))) {
      if (S(e["posting_date"]) > to || !inMs(e["warehouse"], f["warehouse"] ?? "") || !inMs(e["item_code"], f["item_code"] ?? "")) continue;
      if (f["item_group"] && item(S(e["item_code"]))?.["item_group"] !== f["item_group"]) continue;
      const m = by.get(S(e["item_code"])) ?? { q: {}, v: 0, first: S(e["posting_date"]) };
      m.q[S(e["warehouse"])] = (m.q[S(e["warehouse"])] ?? 0) + n(e["actual_qty"]); m.v += n(e["stock_value_difference"]); whs.add(S(e["warehouse"])); by.set(S(e["item_code"]), m);
    }
    const W = [...whs].sort(); const wk = (w: string) => `wh_${w.replace(/[^a-zA-Z0-9\u0600-\u06FF]+/g, "_").toLowerCase()}`;
    const list: Row[] = [...by.entries()].map(([code, m]) => { const total = Object.values(m.q).reduce((a, x) => a + x, 0); const it = item(code);
      return { item: code, item_name: it?.["item_name"] ?? code, item_group: it?.["item_group"] ?? "", brand: it?.["brand"] ?? "", uom: it?.["stock_uom"] ?? "", total_qty: r3(total), total_value: r2(m.v), age: daysBetween(m.first, to), ...Object.fromEntries(W.map((w) => [wk(w), r3(m.q[w] ?? 0)])) }; })
      .filter((r) => f["filter_total_zero_qty"] !== "1" || Math.abs(r.total_qty) > 0.0005).sort((a, b) => a.item.localeCompare(b.item));
    const keys = ["total_qty", "total_value", ...W.map(wk)];
    return { columns: [col("item", "Item", "Link", "Item", 130), col("item_name", "Item Name", "Data", undefined, 150), col("item_group", "Item Group", "Link", "Item Group", 110), col("brand", "Brand", "Link", "Brand", 80), col("uom", "UOM", "Link", "UOM", 60), flt("total_qty", "Total Qty"), cur("total_value", "Total Value"), { fieldname: "age", label: "Age", fieldtype: "Int", width: 60 }, ...W.map((w) => flt(wk(w), w))], rows: list.length ? [...list, totalRow(list, "item", keys)] : [] };
  },
};

/** item_shortage_report.py: bins whose projected quantity (actual + ordered − reserved) is negative. */
const itemShortage: Runner = {
  src: "erpnext/stock/report/item_shortage_report/item_shortage_report.py",
  filters: [C0, fl("warehouse", "Warehouse", "MultiSelectList", "Warehouse")],
  run: (f) => {
    const by = new Map<string, { actual: number; ordered: number; reserved: number; requested: number }>();
    const get = (code: string, wh: string) => { const k = `${wh}\u0000${code}`; const m = by.get(k) ?? { actual: 0, ordered: 0, reserved: 0, requested: 0 }; by.set(k, m); return m; };
    for (const e of sleOf(co(f))) get(S(e["item_code"]), S(e["warehouse"])).actual += n(e["actual_qty"]);
    for (const d of adapter.list("Sales Order")) if (sub(d) && (!co(f) || d["company"] === co(f)) && !["Closed", "Completed", "On Hold"].includes(S(d["status"]))) for (const r of rows(d)) get(S(r["item_code"]), S(r["warehouse"] ?? d["set_warehouse"])).reserved += Math.max(n(r["stock_qty"] ?? r["qty"]) - n(r["delivered_qty"]), 0);
    for (const d of adapter.list("Purchase Order")) if (sub(d) && (!co(f) || d["company"] === co(f)) && !["Closed", "Completed", "On Hold"].includes(S(d["status"]))) for (const r of rows(d)) get(S(r["item_code"]), S(r["warehouse"] ?? d["set_warehouse"])).ordered += Math.max(n(r["stock_qty"] ?? r["qty"]) - n(r["received_qty"]), 0);
    for (const d of adapter.list("Material Request")) if (sub(d) && (!co(f) || d["company"] === co(f)) && d["material_request_type"] === "Purchase" && !["Stopped", "Ordered", "Received"].includes(S(d["status"]))) for (const r of rows(d)) get(S(r["item_code"]), S(r["warehouse"])).requested += Math.max(n(r["stock_qty"] ?? r["qty"]) - n(r["ordered_qty"]), 0);
    const list: Row[] = [];
    for (const [k, m] of by) {
      const [wh, code] = k.split("\u0000") as [string, string]; if (!code || !wh || !inMs(wh, f["warehouse"] ?? "")) continue;
      const projected = r3(m.actual + m.ordered + m.requested - m.reserved); if (projected >= 0) continue;
      list.push({ warehouse: wh, item_code: code, item_name: itemName(code), actual_qty: r3(m.actual), ordered_qty: r3(m.ordered), indented_qty: r3(m.requested), planned_qty: 0, reserved_qty: r3(m.reserved), reserved_qty_for_production: 0, projected_qty: projected, company: co(f) || S(adapter.get("Warehouse", wh)?.["company"]) });
    }
    list.sort((a, b) => n(a["projected_qty"]) - n(b["projected_qty"]));
    return { columns: [col("warehouse", "Warehouse", "Link", "Warehouse", 140), col("item_code", "Item", "Link", "Item", 130), col("item_name", "Item Name", "Data", undefined, 160), flt("actual_qty", "Actual Qty"), flt("ordered_qty", "Ordered Qty"), flt("indented_qty", "Requested Qty"), flt("planned_qty", "Planned Qty"), flt("reserved_qty", "Reserved Qty"), flt("reserved_qty_for_production", "Reserved for Production"), flt("projected_qty", "Projected Qty"), col("company", "Company", "Link", "Company", 120)], rows: list };
  },
};

/** fixed_asset_register.py: each asset's cost, accumulated depreciation and book value (grouped by category or location). */
const fixedAssetRegister: Runner = {
  src: "erpnext/assets/report/fixed_asset_register/fixed_asset_register.py",
  filters: [C0, fl("status", "Status", "Select", ["In Location", "Disposed"], "In Location"), fl("asset_category", "Asset Category", "Link", "Asset Category"), fl("cost_center", "Cost Center", "Link", "Cost Center"), fl("group_by", "Group By", "Select", ["", "Asset Category", "Location"]), fl("only_existing_assets", "Only existing assets", "Check"), fl("finance_book", "Finance Book", "Link", "Finance Book"), fl("filter_based_on", "Period Based On", "Select", ["Fiscal Year", "Date Range"], "Fiscal Year"), FROM, TO, fl("date_based_on", "Date Based On", "Select", ["Purchase Date", "Available For Use Date"], "Purchase Date")],
  run: (f) => {
    const disposed = (a: Doc) => ["Sold", "Scrapped"].includes(S(a["status"])); const want = f["status"] || "In Location";
    const dateKey = f["date_based_on"] === "Available For Use Date" ? "available_for_use_date" : "purchase_date";
    const { from, to } = f["filter_based_on"] === "Date Range" ? range(f) : { from: "", to: "" };
    const list: Row[] = adapter.list("Asset").filter((a) => sub(a) && (!co(f) || a["company"] === co(f)) && (want === "Disposed" ? disposed(a) : !disposed(a)) && (!f["asset_category"] || a["asset_category"] === f["asset_category"]) && (!f["cost_center"] || a["cost_center"] === f["cost_center"]) && (f["only_existing_assets"] !== "1" || n(a["is_existing_asset"])) && between(a[dateKey], from, to))
      .map((a) => { const cost = n(a["gross_purchase_amount"]); let acc = 0, bv = cost; try { acc = accumulated(a.name, f["finance_book"] || undefined); bv = bookValue(a.name, f["finance_book"] || undefined); } catch { acc = r2(cost - n(a["value_after_depreciation"])); bv = n(a["value_after_depreciation"]); }
        return { asset_id: a.name, asset_name: a["asset_name"] ?? a.name, asset_category: a["asset_category"] ?? "", status: a["status"] ?? "", purchase_date: a["purchase_date"] ?? "", available_for_use_date: a["available_for_use_date"] ?? "", cost_center: a["cost_center"] ?? "", location: a["location"] ?? "", gross_purchase_amount: cost, opening_accumulated_depreciation: n(a["opening_accumulated_depreciation"]), depreciated_amount: r2(acc), asset_value: r2(bv), vendor_name: a["supplier"] ?? "", disposal_date: a["disposal_date"] ?? "", company: a["company"] }; });
    const keys = ["gross_purchase_amount", "opening_accumulated_depreciation", "depreciated_amount", "asset_value"];
    if (f["group_by"]) {
      const gk = f["group_by"] === "Location" ? "location" : "asset_category"; const by = new Map<string, Row>();
      for (const r of list) { const k = S(r[gk]); const m = by.get(k) ?? { [gk]: k, ...Object.fromEntries(keys.map((x) => [x, 0])) }; for (const x of keys) m[x] = r2(n(m[x]) + n(r[x])); by.set(k, m); }
      const g = [...by.values()];
      return { columns: [col(gk, f["group_by"], "Link", f["group_by"], 180), ...keys.map((k) => cur(k, k === "gross_purchase_amount" ? "Gross Purchase Amount" : k === "opening_accumulated_depreciation" ? "Opening Accumulated Depreciation" : k === "depreciated_amount" ? "Depreciated Amount" : "Asset Value"))], rows: g.length ? [...g, totalRow(g, gk, keys)] : [] };
    }
    return { columns: [col("asset_id", "Asset ID", "Link", "Asset", 140), col("asset_name", "Asset Name", "Data", undefined, 170), col("asset_category", "Asset Category", "Link", "Asset Category", 130), col("status", "Status", "Data", undefined, 100), col("purchase_date", "Purchase Date", "Date", undefined, 100), col("available_for_use_date", "Available For Use Date", "Date", undefined, 100), col("cost_center", "Cost Center", "Link", "Cost Center", 120), col("location", "Location", "Link", "Location", 100), cur("gross_purchase_amount", "Gross Purchase Amount"), cur("opening_accumulated_depreciation", "Opening Accumulated Depreciation"), cur("depreciated_amount", "Depreciated Amount"), cur("asset_value", "Asset Value"), col("vendor_name", "Vendor Name", "Data", undefined, 130), col("disposal_date", "Disposal Date", "Date", undefined, 100)],
      rows: list.length ? [...list, totalRow(list, "asset_id", keys)] : [] };
  },
};

/** Asset Activity (asset_activity.json report over add_asset_activity rows): asset events read from the asset's own records. */
const assetActivity: Runner = {
  src: "erpnext/assets/report/asset_activity (Asset Activity rows written by asset/movement/repair/depreciation controllers)",
  filters: [fl("asset", "Asset", "Link", "Asset"), FROM, TO],
  run: (f) => {
    const { from, to } = range(f); const out: Row[] = [];
    const push = (asset: string, date: string, user: string, subject: string, ref?: [string, string]) => { if ((!f["asset"] || asset === f["asset"]) && between(date, from, to)) out.push({ asset, date, user: user || "Administrator", subject, reference_doctype: ref?.[0] ?? "", reference_name: ref?.[1] ?? "" }); };
    for (const a of adapter.list("Asset")) {
      if (n(a["docstatus"]) >= 1) push(a.name, S(a["available_for_use_date"] ?? a["purchase_date"]), S(a["owner"]), "Asset submitted", ["Asset", a.name]);
      for (const s of rows(a, "schedules")) if (s["journal_entry"]) push(a.name, S(s["schedule_date"]), S(a["owner"]), `Depreciation posted: ${r2(n(s["depreciation_amount"]))}`, ["Journal Entry", S(s["journal_entry"])]);
      if (a["disposal_date"]) push(a.name, S(a["disposal_date"]), S(a["modified_by"] ?? a["owner"]), `Asset ${S(a["status"]).toLowerCase() || "disposed"}`, ["Asset", a.name]);
    }
    for (const s of adapter.list("Asset Depreciation Schedule")) for (const r of rows(s, "depreciation_schedule")) if (r["journal_entry"]) push(S(s["asset"]), S(r["schedule_date"]), S(s["owner"]), `Depreciation posted: ${r2(n(r["depreciation_amount"]))}`, ["Journal Entry", S(r["journal_entry"])]);
    for (const m of adapter.list("Asset Movement")) if (sub(m)) for (const r of rows(m, "assets")) push(S(r["asset"]), S(m["transaction_date"]).slice(0, 10), S(m["owner"]), `${m["purpose"] ?? "Movement"}: ${S(r["source_location"]) || "—"} → ${S(r["target_location"]) || S(r["to_employee"]) || "—"}`, ["Asset Movement", m.name]);
    for (const r of adapter.list("Asset Repair")) if (sub(r)) push(S(r["asset"]), S(r["completion_date"] ?? r["failure_date"]).slice(0, 10), S(r["owner"]), `Repair ${S(r["repair_status"]) || "completed"}`, ["Asset Repair", r.name]);
    for (const v of adapter.list("Asset Value Adjustment")) if (sub(v)) push(S(v["asset"]), S(v["date"]), S(v["owner"]), `Value adjusted to ${r2(n(v["new_asset_value"]))}`, ["Asset Value Adjustment", v.name]);
    out.sort((a, b) => S(b["date"]).localeCompare(S(a["date"])));
    return { columns: [col("asset", "Asset", "Link", "Asset", 140), col("date", "Date", "Date", undefined, 100), col("user", "User", "Link", "User", 130), col("subject", "Subject", "Data", undefined, 260), col("reference_doctype", "Reference Type", "Data", undefined, 120), col("reference_name", "Reference", "Dynamic Link", "reference_doctype", 160)], rows: out };
  },
};

/** permitted_documents_for_user.py: documents of a DocType the selected user may read, with their permission flags. */
const permittedDocs: Runner = {
  src: "frappe/core/report/permitted_documents_for_user/permitted_documents_for_user.py",
  filters: [fl("user", "User", "Link", "User", "Administrator"), fl("doctype", "DocType", "Link", "DocType", "Sales Invoice"), fl("show_permissions", "Show Permissions", "Check")],
  run: (f) => {
    const user = f["user"] || "Administrator"; const dt = f["doctype"] || "Sales Invoice"; const meta = cachedMeta(dt);
    if (!meta) return { columns: [], rows: [], error: `Open ${dt} once so its definition is loaded, then run this report again.` };
    const roles = new Set(userRoles(user)); const perms = ((meta.permissions ?? []) as unknown as Record<string, unknown>[]).filter((p) => roles.has(String(p["role"])) && !n(p["permlevel"]));
    const flag = (k: string) => (perms.some((p) => n(p[k])) ? 1 : 0);
    const list: Row[] = filterReadable(meta, adapter.list(dt), user).map((d) => ({ name: d.name, title: d[String(meta.title_field ?? "")] ?? "", modified: S(d["modified"] ?? d["creation"]).slice(0, 10), ...(f["show_permissions"] === "1" ? { read: flag("read"), write: flag("write"), create: flag("create"), delete: flag("delete"), submit: flag("submit"), cancel: flag("cancel"), amend: flag("amend"), print: flag("print"), email: flag("email"), report: flag("report"), export: flag("export"), share: flag("share") } : {}) }));
    const pc = ["read", "write", "create", "delete", "submit", "cancel", "amend", "print", "email", "report", "export", "share"];
    return { columns: [col("name", "Name", "Link", dt, 170), col("title", "Title", "Data", undefined, 170), col("modified", "Last Modified", "Date", undefined, 100), ...(f["show_permissions"] === "1" ? pc.map((k) => ({ fieldname: k, label: k[0]!.toUpperCase() + k.slice(1), fieldtype: "Int" as const, width: 60 })) : [])], rows: list,
      summary: [{ label: "Permitted documents", value: list.length }] };
  },
};

export const STOCK_RUNNERS: Record<string, Runner> = {
  "Batch Item Expiry Status": batchExpiry,
  "Batch-Wise Balance History": batchBalance,
  "Serial No Ledger": serialLedger,
  "Serial No and Batch Traceability": traceability,
  "Stock Ageing": stockAgeing,
  "Stock Analytics": stockAnalytics,
  "Total Stock Summary": totalStockSummary,
  "Warehouse wise Item Balance Age and Value": whBalanceAge,
  "Item Shortage Report": itemShortage,
  "Fixed Asset Register": fixedAssetRegister,
  "Asset Activity": assetActivity,
  "Permitted Documents For User": permittedDocs,
};
