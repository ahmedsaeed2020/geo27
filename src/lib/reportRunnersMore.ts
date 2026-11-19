/**
 * Local ports of the further selling / buying / stock Script and Query Reports that DIGIT workspace placements link to
 * (erpnext/<module>/report/<name>/<name>.py). Same filter fieldnames as the source .js; data = adapter records.
 */
import { adapter, type Doc } from "./adapter";
import { C0, FROM, TO, S, between, col, cur, fiscalYear, fl, flt, glOf, itemName, n, periods, r2, r3, rows, sleOf, sub, today, totalRow, withGroupTotals, type F, type Row, type Runner } from "./reportKit";

const co = (f: F) => f["company"] || "";
const range = (f: F) => { const y = fiscalYear(f["fiscal_year"]); return { from: f["from_date"] || y.start, to: f["to_date"] || y.end }; };
const docs = (dt: string, f: F) => adapter.list(dt).filter((d) => sub(d) && (!co(f) || d["company"] === co(f)));
const dateOf = (d: Doc) => S(d["posting_date"] ?? d["transaction_date"]);
const item = (code: string) => adapter.get("Item", code);

/** lost_quotations.py: lost quotations counted and valued by lost reason or competitor. */
const lostQuotations: Runner = {
  src: "erpnext/selling/report/lost_quotations/lost_quotations.py",
  filters: [C0, FROM, TO, fl("group_by", "Group By", "Select", ["Lost Reason", "Competitor"], "Lost Reason")],
  run: (f) => {
    const { from, to } = range(f); const byComp = f["group_by"] === "Competitor"; const lost = docs("Quotation", f).filter((q) => S(q["status"]) === "Lost" && between(q["transaction_date"], from, to));
    const by = new Map<string, { c: number; v: number }>();
    for (const q of lost) {
      const keys = byComp ? rows(q, "competitors").map((x) => S(x["competitor"])) : [...rows(q, "lost_reasons").map((x) => S(x["lost_reason"])), ...(rows(q, "lost_reasons").length ? [] : [S(q["order_lost_reason"])])];
      for (const k of (keys.filter(Boolean).length ? keys.filter(Boolean) : ["Not Set"])) { const m = by.get(k) ?? { c: 0, v: 0 }; m.c++; m.v += n(q["base_net_total"] ?? q["net_total"]); by.set(k, m); }
    }
    const tc = [...by.values()].reduce((a, m) => a + m.c, 0) || 1; const tv = [...by.values()].reduce((a, m) => a + m.v, 0) || 1;
    const k = byComp ? "competitor" : "lost_reason";
    const list: Row[] = [...by.entries()].sort((a, b) => b[1].v - a[1].v).map(([g, m]) => ({ [k]: g, lost_quotations: m.c, lost_quotations_pct: r2((m.c / tc) * 100), lost_value: r2(m.v), lost_value_pct: r2((m.v / tv) * 100) }));
    return { columns: [col(k, byComp ? "Competitor" : "Lost Reason", "Link", byComp ? "Competitor" : "Quotation Lost Reason", 200), { fieldname: "lost_quotations", label: "Lost Quotations", fieldtype: "Int", width: 110 }, { fieldname: "lost_quotations_pct", label: "Lost Quotations %", fieldtype: "Percent", width: 110 }, cur("lost_value", "Lost Value"), { fieldname: "lost_value_pct", label: "Lost Value %", fieldtype: "Percent", width: 100 }],
      rows: list.length ? [...list, totalRow(list, k, ["lost_quotations", "lost_value"])] : [] };
  },
};

/** customers_without_any_sales_transactions.py: customers with no sales order and no sales invoice. */
const customersWithoutSales: Runner = {
  src: "erpnext/selling/report/customers_without_any_sales_transactions/customers_without_any_sales_transactions.py",
  filters: [],
  run: () => {
    const active = new Set<string>(); for (const dt of ["Sales Order", "Sales Invoice"]) for (const d of adapter.list(dt)) if (n(d["docstatus"]) < 2) active.add(S(d["customer"]));
    const list: Row[] = adapter.list("Customer").filter((c) => !active.has(c.name)).sort((a, b) => a.name.localeCompare(b.name)).map((c) => ({ customer: c.name, customer_name: c["customer_name"] ?? c.name, territory: c["territory"] ?? "", customer_group: c["customer_group"] ?? "", customer_type: c["customer_type"] ?? "", creation: S(c["creation"]).slice(0, 10) }));
    return { columns: [col("customer", "Customer", "Link", "Customer", 150), col("customer_name", "Customer Name", "Data", undefined, 200), col("territory", "Territory", "Link", "Territory", 110), col("customer_group", "Customer Group", "Link", "Customer Group", 120), col("customer_type", "Customer Type", "Data", undefined, 100), col("creation", "Created On", "Date", undefined, 100)], rows: list };
  },
};

/** delivery_note_trends.py / purchase_receipt_trends.py (controllers/trends.py) over posting_date. */
function postingTrends(dt: "Delivery Note" | "Purchase Receipt"): Runner {
  const selling = dt === "Delivery Note"; const party = selling ? "customer" : "supplier";
  const BASED = selling ? ["Item", "Item Group", "Customer", "Customer Group", "Territory", "Project"] : ["Item", "Item Group", "Supplier", "Supplier Group", "Project"];
  return {
    src: `erpnext/${selling ? "stock/report/delivery_note_trends/delivery_note_trends.py" : "stock/report/purchase_receipt_trends/purchase_receipt_trends.py"} (controllers/trends.py)`,
    filters: [fl("period", "Period", "Select", ["Monthly", "Quarterly", "Half-Yearly", "Yearly"], "Monthly"), fl("based_on", "Based On", "Select", BASED, "Item"), fl("group_by", "Group By", "Select", ["", "Item", selling ? "Customer" : "Supplier"]), fl("fiscal_year", "Fiscal Year", "Link", "Fiscal Year"), C0],
    run: (f) => {
      const y = fiscalYear(f["fiscal_year"]); const ps = periods(y.start, y.end, f["period"] || "Monthly"); const based = f["based_on"] || "Item"; const grp = f["group_by"] || "";
      if (grp && grp === based) return { columns: [], rows: [], error: "'Based On' and 'Group By' can not be same" };
      const keyOf = (d: Doc, r: Doc): string => {
        if (based === "Item") return S(r["item_code"]); if (based === "Item Group") return S(r["item_group"] ?? item(S(r["item_code"]))?.["item_group"]);
        if (based === "Customer" || based === "Supplier") return S(d[party]); if (based === "Project") return S(d["project"] ?? r["project"]) || "Not Set";
        if (based === "Territory") return S(d["territory"] ?? adapter.get("Customer", S(d[party]))?.["territory"]);
        const P = based.replace(" Group", ""); return S(d[`${P.toLowerCase()}_group`] ?? adapter.get(P, S(d[party]))?.[`${P.toLowerCase()}_group`]);
      };
      const by = new Map<string, Record<string, number>>();
      for (const d of docs(dt, f)) {
        const date = dateOf(d); const p = ps.find((x) => between(date, x.from, x.to)); if (!p || n(d["is_return"])) continue;
        for (const r of rows(d)) { const k = `${keyOf(d, r)}\u0000${grp === "Item" ? S(r["item_code"]) : grp ? S(d[party]) : ""}`; const m = by.get(k) ?? {}; m[`${p.key}_qty`] = (m[`${p.key}_qty`] ?? 0) + n(r["stock_qty"] ?? r["qty"]); m[`${p.key}_amt`] = (m[`${p.key}_amt`] ?? 0) + n(r["base_net_amount"] ?? r["amount"]); by.set(k, m); }
      }
      const fields = ps.flatMap((p) => [`${p.key}_qty`, `${p.key}_amt`]);
      const list: Row[] = [...by.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([k, m]) => { const [a, b] = k.split("\u0000"); return { based_on: a, ...(grp ? { group_by: b } : {}), ...Object.fromEntries(fields.map((x) => [x, r2(m[x] ?? 0)])), total_qty: r3(ps.reduce((s, p) => s + (m[`${p.key}_qty`] ?? 0), 0)), total_amt: r2(ps.reduce((s, p) => s + (m[`${p.key}_amt`] ?? 0), 0)) }; });
      return { columns: [col("based_on", based, "Link", based, 150), ...(grp ? [col("group_by", grp, "Link", grp, 130)] : []), ...ps.flatMap((p) => [flt(`${p.key}_qty`, `${p.label} (Qty)`), cur(`${p.key}_amt`, `${p.label} (Amt)`)]), flt("total_qty", "Total(Qty)"), cur("total_amt", "Total(Amt)")],
        rows: list.length ? [...list, totalRow(list, "based_on", [...fields, "total_qty", "total_amt"])] : [] };
    },
  };
}

/** pending_so_items_for_purchase_request.py: sales order items with quantity not yet requested for purchase. */
const pendingSoItems: Runner = {
  src: "erpnext/selling/report/pending_so_items_for_purchase_request/pending_so_items_for_purchase_request.py",
  filters: [],
  run: () => {
    const req = new Map<string, number>(); for (const m of adapter.list("Material Request")) if (n(m["docstatus"]) === 1) for (const r of rows(m)) if (r["sales_order"]) { const k = `${r["sales_order"]}\u0000${r["item_code"]}`; req.set(k, (req.get(k) ?? 0) + n(r["stock_qty"] ?? r["qty"])); }
    const out: Row[] = [];
    for (const d of adapter.list("Sales Order")) {
      if (!sub(d) || ["Closed", "Completed", "On Hold"].includes(S(d["status"]))) continue;
      for (const r of rows(d)) {
        const so = n(r["stock_qty"] ?? r["qty"]) - n(r["delivered_qty"]); const mr = req.get(`${d.name}\u0000${r["item_code"]}`) ?? 0; const pend = r3(so - mr); if (pend <= 0) continue;
        out.push({ item_code: r["item_code"], item_name: r["item_name"] ?? itemName(S(r["item_code"])), description: r["description"] ?? "", so_qty: r3(so), mr_qty: r3(mr), pending_qty: pend, sales_order: d.name, customer: d["customer"], transaction_date: d["transaction_date"], delivery_date: r["delivery_date"] ?? d["delivery_date"] ?? "", warehouse: r["warehouse"] ?? d["set_warehouse"] ?? "" });
      }
    }
    return { columns: [col("item_code", "Item Code", "Link", "Item", 130), col("item_name", "Item Name", "Data", undefined, 160), flt("so_qty", "SO Pending Qty"), flt("mr_qty", "Requested Qty"), flt("pending_qty", "Pending Qty"), col("sales_order", "Sales Order", "Link", "Sales Order", 150), col("customer", "Customer", "Link", "Customer", 130), col("transaction_date", "Date", "Date", undefined, 100), col("delivery_date", "Delivery Date", "Date", undefined, 100), col("warehouse", "Warehouse", "Link", "Warehouse", 130)], rows: out };
  },
};

/** available_stock_for_packing_items.py: how many bundles each warehouse can pack from its component stock. */
const packingItems: Runner = {
  src: "erpnext/stock/report/available_stock_for_packing_items/available_stock_for_packing_items.py",
  filters: [],
  run: () => {
    const qty = new Map<string, number>(); for (const e of sleOf()) { const k = `${e["item_code"]}\u0000${e["warehouse"]}`; qty.set(k, (qty.get(k) ?? 0) + n(e["actual_qty"])); }
    const whs = [...new Set([...qty.keys()].map((k) => k.split("\u0000")[1]!))].sort(); const out: Row[] = [];
    for (const b of adapter.list("Product Bundle")) {
      if (n(b["disabled"])) continue; const comps = rows(b); if (!comps.length) continue;
      for (const w of whs) {
        const can = Math.min(...comps.map((c) => Math.floor((qty.get(`${c["item_code"]}\u0000${w}`) ?? 0) / (n(c["qty"]) || 1))));
        if (can > 0) out.push({ item_code: b["new_item_code"] ?? b.name, item_name: itemName(S(b["new_item_code"] ?? b.name)), description: b["description"] ?? "", stock_uom: item(S(b["new_item_code"] ?? b.name))?.["stock_uom"] ?? "Nos", warehouse: w, actual_qty: can, components: comps.map((c) => `${c["item_code"]} × ${n(c["qty"])}`).join(", ") });
      }
    }
    return { columns: [col("item_code", "Item Code", "Link", "Item", 140), col("item_name", "Item Name", "Data", undefined, 160), col("stock_uom", "UOM", "Link", "UOM", 60), col("warehouse", "Warehouse", "Link", "Warehouse", 140), flt("actual_qty", "Bundle Qty"), col("components", "Packed Items", "Data", undefined, 260)], rows: out };
  },
};

/** requested_items_to_order_and_receive.py: material request rows with ordered / received / pending quantities. */
const requestedToOrderReceive: Runner = {
  src: "erpnext/buying/report/requested_items_to_order_and_receive/requested_items_to_order_and_receive.py",
  filters: [C0, FROM, TO, fl("material_request", "Material Request", "Link", "Material Request"), fl("item_code", "Item", "Link", "Item"), fl("group_by_mr", "Group by Material Request", "Check")],
  run: (f) => {
    const { from, to } = range(f); const out: Row[] = [];
    for (const d of docs("Material Request", f)) {
      if (d["material_request_type"] !== "Purchase" || S(d["status"]) === "Stopped" || !between(d["transaction_date"], from, to) || (f["material_request"] && d.name !== f["material_request"])) continue;
      for (const r of rows(d)) {
        if (f["item_code"] && r["item_code"] !== f["item_code"]) continue; const q = n(r["stock_qty"] ?? r["qty"]); const o = n(r["ordered_qty"]) || (n(d["per_ordered"]) >= 100 ? q : 0); const rc = n(r["received_qty"]) || (n(d["per_received"]) >= 100 ? q : 0);
        if (rc >= q) continue;
        out.push({ material_request: d.name, date: d["transaction_date"], required_date: r["schedule_date"] ?? d["schedule_date"] ?? "", item_code: r["item_code"], item_name: r["item_name"] ?? itemName(S(r["item_code"])), warehouse: r["warehouse"] ?? "", stock_qty: r3(q), ordered_qty: r3(o), received_qty: r3(rc), qty_to_receive: r3(Math.max(o - rc, 0)), qty_to_order: r3(Math.max(q - o, 0)), company: d["company"] });
      }
    }
    const keys = ["stock_qty", "ordered_qty", "received_qty", "qty_to_receive", "qty_to_order"];
    return { columns: [col("material_request", "Material Request", "Link", "Material Request", 150), col("date", "Date", "Date", undefined, 95), col("required_date", "Required By", "Date", undefined, 95), col("item_code", "Item Code", "Link", "Item", 120), col("item_name", "Item Name", "Data", undefined, 150), col("warehouse", "Warehouse", "Link", "Warehouse", 130), flt("stock_qty", "Stock Qty"), flt("ordered_qty", "Ordered Qty"), flt("received_qty", "Received Qty"), flt("qty_to_receive", "Qty to Receive"), flt("qty_to_order", "Qty to Order"), col("company", "Company", "Link", "Company", 110)],
      rows: out.length ? [...(f["group_by_mr"] === "1" ? withGroupTotals(out, "material_request", keys) : out), totalRow(out, "material_request", keys)] : [] };
  },
};

/** billed_items_to_be_received.py: purchase invoice rows (without stock update) whose goods are not yet received. */
const billedToReceive: Runner = {
  src: "erpnext/accounts/report/billed_items_to_be_received/billed_items_to_be_received.py",
  filters: [C0, fl("posting_date", "As on Date", "Date", undefined, "__today"), fl("purchase_invoice", "Purchase Invoice", "Link", "Purchase Invoice")],
  run: (f) => {
    const asOf = f["posting_date"] || today(); const recv = new Map<string, number>();
    for (const pr of adapter.list("Purchase Receipt")) if (sub(pr)) for (const r of rows(pr)) { for (const k of [S(r["purchase_invoice"]), S(r["purchase_order"])]) if (k) recv.set(`${k}\u0000${r["item_code"]}`, (recv.get(`${k}\u0000${r["item_code"]}`) ?? 0) + n(r["stock_qty"] ?? r["qty"])); }
    const out: Row[] = [];
    for (const d of docs("Purchase Invoice", f)) {
      if (n(d["update_stock"]) || n(d["is_return"]) || S(d["posting_date"]) > asOf || (f["purchase_invoice"] && d.name !== f["purchase_invoice"])) continue;
      for (const r of rows(d)) {
        if (r["purchase_receipt"] || !n(item(S(r["item_code"]))?.["is_stock_item"] ?? 1)) continue;
        const q = n(r["stock_qty"] ?? r["qty"]); const got = Math.min(recv.get(`${d.name}\u0000${r["item_code"]}`) ?? recv.get(`${r["purchase_order"]}\u0000${r["item_code"]}`) ?? n(r["received_qty"]), q); const pend = r3(q - got); if (pend <= 0) continue;
        out.push({ name: d.name, posting_date: d["posting_date"], supplier: d["supplier"], supplier_name: d["supplier_name"] ?? "", item_code: r["item_code"], item_name: r["item_name"] ?? itemName(S(r["item_code"])), qty: r3(q), received_qty: r3(got), pending_qty: pend, rate: n(r["base_net_rate"] ?? r["rate"]), pending_amount: r2(pend * n(r["base_net_rate"] ?? r["rate"])), company: d["company"] });
      }
    }
    return { columns: [col("name", "Purchase Invoice", "Link", "Purchase Invoice", 150), col("posting_date", "Date", "Date", undefined, 95), col("supplier", "Supplier", "Link", "Supplier", 130), col("supplier_name", "Supplier Name", "Data", undefined, 150), col("item_code", "Item", "Link", "Item", 120), col("item_name", "Item Name", "Data", undefined, 150), flt("qty", "Billed Qty"), flt("received_qty", "Received Qty"), flt("pending_qty", "Pending Qty"), cur("rate", "Rate"), cur("pending_amount", "Pending Amount"), col("company", "Company", "Link", "Company", 110)],
      rows: out.length ? [...out, totalRow(out, "name", ["qty", "received_qty", "pending_qty", "pending_amount"])] : [] };
  },
};

/** Bin quantities (actual from ledger; ordered/reserved/requested from open documents), as erpnext/stock/stock_balance.py builds them. */
function bins(company = "") {
  const by = new Map<string, { actual: number; ordered: number; reserved: number; requested: number }>();
  const get = (code: string, wh: string) => { const k = `${code}\u0000${wh}`; const m = by.get(k) ?? { actual: 0, ordered: 0, reserved: 0, requested: 0 }; by.set(k, m); return m; };
  for (const e of sleOf(company)) get(S(e["item_code"]), S(e["warehouse"])).actual += n(e["actual_qty"]);
  const open = (d: Doc) => sub(d) && (!company || d["company"] === company) && !["Closed", "Completed", "On Hold", "Stopped"].includes(S(d["status"]));
  for (const d of adapter.list("Sales Order")) if (open(d)) for (const r of rows(d)) get(S(r["item_code"]), S(r["warehouse"] ?? d["set_warehouse"])).reserved += Math.max(n(r["stock_qty"] ?? r["qty"]) - n(r["delivered_qty"]), 0);
  for (const d of adapter.list("Purchase Order")) if (open(d)) for (const r of rows(d)) get(S(r["item_code"]), S(r["warehouse"] ?? d["set_warehouse"])).ordered += Math.max(n(r["stock_qty"] ?? r["qty"]) - n(r["received_qty"]), 0);
  for (const d of adapter.list("Material Request")) if (open(d) && d["material_request_type"] === "Purchase" && S(d["status"]) !== "Ordered") for (const r of rows(d)) get(S(r["item_code"]), S(r["warehouse"])).requested += Math.max(n(r["stock_qty"] ?? r["qty"]) - n(r["ordered_qty"]), 0);
  return by;
}

/** items_to_be_requested.py: bins whose projected quantity is below zero (to be requested for purchase). */
const itemsToBeRequested: Runner = {
  src: "erpnext/stock/report/items_to_be_requested/items_to_be_requested.py",
  filters: [],
  run: () => {
    const out: Row[] = [];
    for (const [k, m] of bins()) {
      const [code, wh] = k.split("\u0000") as [string, string]; if (!code || !wh) continue;
      const projected = r3(m.actual + m.ordered + m.requested - m.reserved); const reorder = n(rows(item(code) ?? ({} as Doc), "reorder_levels").find((x) => x["warehouse"] === wh)?.["warehouse_reorder_level"]);
      if (projected >= reorder && projected >= 0) continue;
      out.push({ item_code: code, item_name: itemName(code), warehouse: wh, actual_qty: r3(m.actual), ordered_qty: r3(m.ordered), planned_qty: 0, reserved_qty: r3(m.reserved), indented_qty: r3(m.requested), projected_qty: projected, reorder_level: reorder, qty_to_request: r3(Math.max(reorder - projected, -projected, 0)) });
    }
    out.sort((a, b) => n(a["projected_qty"]) - n(b["projected_qty"]));
    return { columns: [col("item_code", "Item Code", "Link", "Item", 130), col("item_name", "Item Name", "Data", undefined, 160), col("warehouse", "Warehouse", "Link", "Warehouse", 140), flt("actual_qty", "Actual"), flt("ordered_qty", "Ordered"), flt("planned_qty", "Planned"), flt("reserved_qty", "Reserved"), flt("indented_qty", "Requested"), flt("projected_qty", "Projected"), flt("reorder_level", "Re-order Level"), flt("qty_to_request", "Qty to Request")], rows: out };
  },
};

/** requested_items_to_be_transferred (Query Report): material-transfer requests not yet fully transferred. */
const requestedToTransfer: Runner = {
  src: "erpnext/stock/report/requested_items_to_be_transferred/requested_items_to_be_transferred.json (query)",
  filters: [],
  run: () => {
    const moved = new Map<string, number>(); for (const s of adapter.list("Stock Entry")) if (sub(s)) for (const r of rows(s)) if (r["material_request"]) { const k = `${r["material_request"]}\u0000${r["item_code"]}`; moved.set(k, (moved.get(k) ?? 0) + n(r["transfer_qty"] ?? r["qty"])); }
    const out: Row[] = [];
    for (const d of adapter.list("Material Request")) {
      if (!sub(d) || d["material_request_type"] !== "Material Transfer" || ["Stopped", "Transferred"].includes(S(d["status"]))) continue;
      for (const r of rows(d)) { const q = n(r["stock_qty"] ?? r["qty"]); const t = n(r["ordered_qty"]) || moved.get(`${d.name}\u0000${r["item_code"]}`) || 0; if (t >= q) continue;
        out.push({ material_request: d.name, date: d["transaction_date"], required_date: r["schedule_date"] ?? d["schedule_date"] ?? "", item_code: r["item_code"], warehouse: r["warehouse"] ?? "", qty: r3(q), transferred_qty: r3(t), qty_to_transfer: r3(q - t), description: r["description"] ?? itemName(S(r["item_code"])), company: d["company"] }); }
    }
    return { columns: [col("material_request", "Material Request", "Link", "Material Request", 150), col("date", "Date", "Date", undefined, 95), col("required_date", "Required Date", "Date", undefined, 100), col("item_code", "Item Code", "Link", "Item", 130), col("warehouse", "Warehouse", "Link", "Warehouse", 140), flt("qty", "Qty"), flt("transferred_qty", "Transferred Qty"), flt("qty_to_transfer", "Qty to Transfer"), col("description", "Description", "Data", undefined, 180), col("company", "Company", "Link", "Company", 110)], rows: out };
  },
};

/** negative_batch_report.py: batches whose running balance in a warehouse went below zero. */
const negativeBatch: Runner = {
  src: "erpnext/stock/report/negative_batch_report/negative_batch_report.py",
  filters: [C0, fl("item_code", "Item Code", "Link", "Item"), fl("warehouse", "Warehouse", "Link", "Warehouse")],
  run: (f) => {
    const moves: { date: string; dt: string; vn: string; item: string; wh: string; batch: string; qty: number }[] = [];
    for (const dt of ["Stock Entry", "Purchase Receipt", "Delivery Note"]) for (const d of adapter.list(dt)) if (sub(d) && (!co(f) || d["company"] === co(f))) for (const r of rows(d)) if (r["batch_no"]) {
      const q = n(r["transfer_qty"] ?? r["stock_qty"] ?? r["qty"]); const ret = n(d["is_return"]) ? -1 : 1;
      if (dt === "Stock Entry") { if (r["s_warehouse"]) moves.push({ date: dateOf(d), dt, vn: d.name, item: S(r["item_code"]), wh: S(r["s_warehouse"]), batch: S(r["batch_no"]), qty: -q }); if (r["t_warehouse"]) moves.push({ date: dateOf(d), dt, vn: d.name, item: S(r["item_code"]), wh: S(r["t_warehouse"]), batch: S(r["batch_no"]), qty: q }); }
      else moves.push({ date: dateOf(d), dt, vn: d.name, item: S(r["item_code"]), wh: S(r["warehouse"] ?? d["set_warehouse"]), batch: S(r["batch_no"]), qty: (dt === "Purchase Receipt" ? 1 : -1) * ret * q });
    }
    moves.sort((a, b) => a.date.localeCompare(b.date)); const bal = new Map<string, number>(); const out: Row[] = [];
    for (const m of moves) {
      if ((f["item_code"] && m.item !== f["item_code"]) || (f["warehouse"] && m.wh !== f["warehouse"])) continue;
      const k = `${m.batch}\u0000${m.wh}`; const b = r3((bal.get(k) ?? 0) + m.qty); bal.set(k, b);
      if (b < 0) out.push({ item_code: m.item, batch_no: m.batch, warehouse: m.wh, posting_date: m.date, actual_qty: m.qty, qty_after_transaction: b, voucher_type: m.dt, voucher_no: m.vn });
    }
    return { columns: [col("item_code", "Item Code", "Link", "Item", 130), col("batch_no", "Batch No", "Link", "Batch", 130), col("warehouse", "Warehouse", "Link", "Warehouse", 140), col("posting_date", "Posting Date", "Date", undefined, 100), flt("actual_qty", "Actual Qty"), flt("qty_after_transaction", "Batch Balance"), col("voucher_type", "Voucher Type", "Data", undefined, 120), col("voucher_no", "Voucher No", "Dynamic Link", "voucher_type", 160)], rows: out,
      checks: [{ label: "No batch goes negative", ok: out.length === 0, detail: `${bal.size} batch/warehouse balances replayed; ${out.length} negative points` }] };
  },
};

/** stock_ledger_invariant_check.py: replays one item/warehouse ledger and flags rows whose stored balance differs. */
const sleInvariant: Runner = {
  src: "erpnext/stock/report/stock_ledger_invariant_check/stock_ledger_invariant_check.py",
  filters: [fl("item_code", "Item", "Link", "Item"), fl("warehouse", "Warehouse", "Link", "Warehouse")],
  run: (f) => {
    const first = sleOf()[0]; const code = f["item_code"] || S(first?.["item_code"]); const wh = f["warehouse"] || S(sleOf().find((e) => e["item_code"] === code)?.["warehouse"]);
    if (!code || !wh) return { columns: [], rows: [], error: "Please select Item and Warehouse" };
    let qty = 0, val = 0; const out: Row[] = [];
    for (const e of sleOf().filter((x) => x["item_code"] === code && x["warehouse"] === wh)) {
      qty = r3(qty + n(e["actual_qty"])); val = r2(val + n(e["stock_value_difference"]));
      const dq = r3(n(e["qty_after_transaction"]) - qty); const dv = r2(n(e["stock_value"]) - val);
      out.push({ name: e.name, posting_date: e["posting_date"], voucher_type: e["voucher_type"], voucher_no: e["voucher_no"], actual_qty: n(e["actual_qty"]), qty_after_transaction: n(e["qty_after_transaction"]), expected_qty_after_transaction: qty, difference_in_qty: dq, stock_value: n(e["stock_value"]), expected_stock_value: val, stock_value_difference: dv, valuation_rate: n(e["valuation_rate"]), status: Math.abs(dq) > 0.0005 || Math.abs(dv) > 0.005 ? "Mismatch" : "OK" });
    }
    const bad = out.filter((r) => r["status"] === "Mismatch").length;
    return { columns: [col("name", "Stock Ledger Entry", "Link", "Stock Ledger Entry", 160), col("posting_date", "Posting Date", "Date", undefined, 95), col("voucher_type", "Voucher Type", "Data", undefined, 120), col("voucher_no", "Voucher No", "Dynamic Link", "voucher_type", 150), flt("actual_qty", "Qty Change"), flt("qty_after_transaction", "(A) Qty After Transaction"), flt("expected_qty_after_transaction", "(B) Expected Qty"), flt("difference_in_qty", "A - B"), cur("stock_value", "(C) Stock Value"), cur("expected_stock_value", "(D) Expected Stock Value"), cur("stock_value_difference", "C - D"), cur("valuation_rate", "Valuation Rate"), col("status", "Status", "Data", undefined, 80)], rows: out,
      checks: [{ label: "Ledger balances replay exactly", ok: bad === 0, detail: `${out.length} rows of ${code} in ${wh}; ${bad} mismatches` }] };
  },
};

/** stock_and_account_value_comparison.py: per voucher, stock value change vs the GL on the warehouse stock accounts. */
const stockAccountComparison: Runner = {
  src: "erpnext/stock/report/stock_and_account_value_comparison/stock_and_account_value_comparison.py",
  filters: [C0, fl("account", "Account", "Link", "Account"), fl("as_on_date", "As On Date", "Date", undefined, "__today")],
  run: (f) => {
    const asOf = f["as_on_date"] || today();
    const stockAcc = new Set(adapter.list("Account").filter((a) => (!co(f) || a["company"] === co(f)) && a["account_type"] === "Stock" && !n(a["is_group"])).map((a) => a.name));
    for (const w of adapter.list("Warehouse")) if (w["account"]) stockAcc.add(S(w["account"]));
    const pick = f["account"] ? new Set([f["account"]]) : stockAcc;
    const sv = new Map<string, number>(); for (const e of sleOf(co(f))) if (S(e["posting_date"]) <= asOf) { const k = `${e["voucher_type"]}\u0000${e["voucher_no"]}`; sv.set(k, (sv.get(k) ?? 0) + n(e["stock_value_difference"])); }
    const av = new Map<string, number>(); for (const g of glOf(co(f))) if (S(g["posting_date"]) <= asOf && pick.has(S(g["account"]))) { const k = `${g["voucher_type"]}\u0000${g["voucher_no"]}`; av.set(k, (av.get(k) ?? 0) + n(g["debit"]) - n(g["credit"])); }
    const out: Row[] = [];
    for (const k of new Set([...sv.keys(), ...av.keys()])) { const s = r2(sv.get(k) ?? 0), a = r2(av.get(k) ?? 0); if (Math.abs(s - a) < 0.01) continue; const [vt, vn] = k.split("\u0000"); out.push({ voucher_type: vt, voucher_no: vn, stock_value: s, account_value: a, difference_value: r2(s - a), ledger_type: sv.has(k) && av.has(k) ? "Both" : sv.has(k) ? "Stock Ledger Entry" : "General Ledger" }); }
    const ts = r2([...sv.values()].reduce((x, y) => x + y, 0)), ta = r2([...av.values()].reduce((x, y) => x + y, 0));
    return { columns: [col("voucher_type", "Voucher Type", "Data", undefined, 130), col("voucher_no", "Voucher No", "Dynamic Link", "voucher_type", 170), cur("stock_value", "Stock Value"), cur("account_value", "Account Value"), cur("difference_value", "Difference Value"), col("ledger_type", "Ledger Type", "Data", undefined, 130)], rows: out,
      summary: [{ label: "Stock value", value: ts }, { label: "Account value", value: ta }, { label: "Difference", value: r2(ts - ta) }] };
  },
};

export const MORE_RUNNERS: Record<string, Runner> = {
  "Lost Quotations": lostQuotations,
  "Customers Without Any Sales Transactions": customersWithoutSales,
  "Delivery Note Trends": postingTrends("Delivery Note"),
  "Purchase Receipt Trends": postingTrends("Purchase Receipt"),
  "Pending SO Items For Purchase Request": pendingSoItems,
  "Available Stock for Packing Items": packingItems,
  "Requested Items to Order and Receive": requestedToOrderReceive,
  "Billed Items To Be Received": billedToReceive,
  "Items To Be Requested": itemsToBeRequested,
  "Requested Items To Be Transferred": requestedToTransfer,
  "Negative Batch Report": negativeBatch,
  "Stock Ledger Invariant Check": sleInvariant,
  "Stock and Account Value Comparison": stockAccountComparison,
};
void FROM; void TO;
