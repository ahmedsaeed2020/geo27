/**
 * Local ports of the selling and buying Script / Query Reports DIGIT links to that had no runner
 * (erpnext/selling|buying|stock|accounts/report/<name>/<name>.py). Same filter fieldnames as the source .js.
 */
import { adapter, type Doc } from "./adapter";
import { C0, FROM, TO, S, between, col, companyCurrency, cur, daysBetween, fiscalYear, fl, flt, inMs, itemName, ms, n, partyName, periods, r2, r3, rows, sub, today, totalRow, withGroupTotals, type F, type Row, type RCol, type Runner } from "./reportKit";

const co = (f: F) => f["company"] || "";
const range = (f: F) => { const y = fiscalYear(f["fiscal_year"]); return { from: f["from_date"] || y.start, to: f["to_date"] || y.end }; };
const docs = (dt: string, f: F) => adapter.list(dt).filter((d) => sub(d) && (!co(f) || d["company"] === co(f)));
const item = (code: string) => adapter.get("Item", code);
const dateOf = (d: Doc) => S(d["posting_date"] ?? d["transaction_date"]);

/** delivered_items_to_be_billed.py / received_items_to_be_billed.py: submitted delivery/receipt rows not yet billed. */
function itemsToBeBilled(dt: "Delivery Note" | "Purchase Receipt"): Runner {
  const party = dt === "Delivery Note" ? "customer" : "supplier"; const P = dt === "Delivery Note" ? "Customer" : "Supplier"; const link = dt === "Delivery Note" ? "delivery_note" : "purchase_receipt";
  return {
    src: `erpnext/accounts/report/${dt === "Delivery Note" ? "delivered" : "received"}_items_to_be_billed/${dt === "Delivery Note" ? "delivered" : "received"}_items_to_be_billed.py`,
    filters: [C0, fl("posting_date", "As on Date", "Date", undefined, "__today"), fl(link, dt, "Link", dt)],
    run: (f) => {
      const asOf = f["posting_date"] || today(); const out: Row[] = [];
      for (const d of docs(dt, f)) {
        if (S(d["posting_date"]) > asOf || n(d["is_return"]) || S(d["status"]) === "Closed" || (f[link] && d.name !== f[link])) continue;
        for (const r of rows(d)) {
          const amount = n(r["base_net_amount"] ?? r["amount"]); const billed = n(r["billed_amt"]); const returned = n(r["returned_qty"]) * n(r["base_net_rate"] ?? r["rate"]);
          const pending = r2(amount - billed - returned); if (pending <= 0.005) continue;
          out.push({ name: d.name, date: d["posting_date"], [party]: d[party], [`${party}_name`]: d[`${party}_name`] ?? partyName(P, S(d[party])), item_code: r["item_code"], item_name: r["item_name"] ?? itemName(S(r["item_code"])), amount: r2(amount), billed_amount: r2(billed), returned_amount: r2(returned), pending_amount: pending, description: r["description"] ?? "", project: d["project"] ?? r["project"] ?? "", company: d["company"] });
        }
      }
      const keys = ["amount", "billed_amount", "returned_amount", "pending_amount"];
      return { columns: [col("name", dt, "Link", dt, 160), col("date", "Date", "Date", undefined, 100), col(party, P, "Link", P, 140), col(`${party}_name`, `${P} Name`, "Data", undefined, 170), col("item_code", "Item", "Link", "Item", 140), col("item_name", "Item Name", "Data", undefined, 160), cur("amount", "Amount"), cur("billed_amount", "Billed Amount"), cur("returned_amount", "Returned Amount"), cur("pending_amount", "Pending Amount"), col("description", "Description", "Data", undefined, 160), col("project", "Project", "Link", "Project", 110), col("company", "Company", "Link", "Company", 120)],
        rows: out.length ? [...out, totalRow(out, "name", keys)] : [] };
    },
  };
}

/** item_wise_sales_history.py / item_wise_purchase_history.py: every order row with delivered/received and billed values. */
function itemHistory(dt: "Sales Order" | "Purchase Order"): Runner {
  const party = dt === "Sales Order" ? "customer" : "supplier"; const P = dt === "Sales Order" ? "Customer" : "Supplier";
  return {
    src: `erpnext/${dt === "Sales Order" ? "selling/report/item_wise_sales_history/item_wise_sales_history.py" : "buying/report/item_wise_purchase_history/item_wise_purchase_history.py"}`,
    filters: [C0, FROM, TO, fl("item_group", "Item Group", "Link", "Item Group"), fl("item_code", "Item", "Link", "Item"), fl(party, P, "Link", P)],
    run: (f) => {
      const { from, to } = range(f); const out: Row[] = [];
      for (const d of docs(dt, f)) {
        if (!between(d["transaction_date"], from, to) || (f[party] && d[party] !== f[party])) continue;
        for (const r of rows(d)) {
          const it = item(S(r["item_code"])); const grp = S(r["item_group"] ?? it?.["item_group"]);
          if (f["item_code"] && r["item_code"] !== f["item_code"]) continue; if (f["item_group"] && grp !== f["item_group"]) continue;
          const p = adapter.get(P, S(d[party]));
          out.push({ item_code: r["item_code"], item_name: r["item_name"] ?? itemName(S(r["item_code"])), item_group: grp, description: r["description"] ?? "", quantity: n(r["qty"]), uom: r["uom"] ?? r["stock_uom"] ?? "", rate: n(r["base_rate"] ?? r["rate"]), amount: n(r["base_amount"] ?? r["amount"]), [dt === "Sales Order" ? "sales_order" : "purchase_order"]: d.name, transaction_date: d["transaction_date"], [party]: d[party], [`${party}_name`]: d[`${party}_name`] ?? partyName(P, S(d[party])), [`${party}_group`]: p?.[`${party}_group`] ?? "", ...(dt === "Sales Order" ? { territory: d["territory"] ?? p?.["territory"] ?? "" } : {}), project: d["project"] ?? r["project"] ?? "", [dt === "Sales Order" ? "delivered_quantity" : "received_quantity"]: n(r[dt === "Sales Order" ? "delivered_qty" : "received_qty"]), billed_amount: n(r["billed_amt"]), company: d["company"] });
        }
      }
      const so = dt === "Sales Order" ? "sales_order" : "purchase_order";
      return { columns: [col("item_code", "Item Code", "Link", "Item", 130), col("item_name", "Item Name", "Data", undefined, 160), col("item_group", "Item Group", "Link", "Item Group", 120), flt("quantity", "Quantity"), col("uom", "UOM", "Link", "UOM", 70), cur("rate", "Rate"), cur("amount", "Amount"), col(so, dt, "Link", dt, 150), col("transaction_date", "Transaction Date", "Date", undefined, 100), col(party, P, "Link", P, 130), col(`${party}_name`, `${P} Name`, "Data", undefined, 160), col(`${party}_group`, `${P} Group`, "Link", `${P} Group`, 120), ...(dt === "Sales Order" ? [col("territory", "Territory", "Link", "Territory", 100)] : []), col("project", "Project", "Link", "Project", 100), flt(dt === "Sales Order" ? "delivered_quantity" : "received_quantity", dt === "Sales Order" ? "Delivered Quantity" : "Received Quantity"), cur("billed_amount", "Billed Amount"), col("company", "Company", "Link", "Company", 120)],
        rows: out.length ? [...out, totalRow(out, "item_code", ["quantity", "amount", "billed_amount"])] : [] };
    },
  };
}

/** sales_order_analysis.py / purchase_order_analysis.py: per order row qty delivered/received, billed, pending and delay. */
function orderAnalysis(dt: "Sales Order" | "Purchase Order"): Runner {
  const S_ = dt === "Sales Order"; const party = S_ ? "customer" : "supplier"; const P = S_ ? "Customer" : "Supplier";
  const nameF = S_ ? "sales_order" : "name"; const done = S_ ? "delivered_qty" : "received_qty"; const due = S_ ? "delivery_date" : "schedule_date";
  return {
    src: `erpnext/${S_ ? "selling/report/sales_order_analysis/sales_order_analysis.py" : "buying/report/purchase_order_analysis/purchase_order_analysis.py"}`,
    filters: [C0, FROM, TO, ...(S_ ? [] : [fl("project", "Project", "Link", "Project")]), fl(nameF, dt, "MultiSelectList", dt), ...(S_ ? [fl("warehouse", "Warehouse", "Link", "Warehouse")] : []), fl("status", "Status", "MultiSelectList", S_ ? ["To Pay", "To Bill", "To Deliver", "To Deliver and Bill", "Completed"] : ["To Pay", "To Bill", "To Receive", "To Receive and Bill", "Completed"]), fl(S_ ? "group_by_so" : "group_by_po", `Group by ${dt}`, "Check"), fl("group_by_item", "Group by Item", "Check")],
    run: (f) => {
      const { from, to } = range(f); const out: Row[] = []; const statuses = ms(f["status"]);
      for (const d of docs(dt, f)) {
        if (!between(d["transaction_date"], from, to) || !inMs(d.name, f[nameF] ?? "") || S(d["status"]) === "Closed" || S(d["status"]) === "On Hold") continue;
        if (statuses.length && !statuses.includes(S(d["status"]))) continue; if (f["project"] && d["project"] !== f["project"]) continue;
        for (const r of rows(d)) {
          if (f["warehouse"] && (r["warehouse"] ?? d["set_warehouse"]) !== f["warehouse"]) continue;
          const qty = n(r["stock_qty"] ?? r["qty"]); const dq = n(r[done]); const amount = n(r["base_amount"] ?? r["amount"]); const rate = n(r["base_rate"] ?? r["rate"]);
          const billed = n(r["billed_amt"]); const billedQty = rate ? r3(billed / rate) : 0; const dueDate = S(r[due] ?? d[due]);
          const lastMove = S_ ? lastDate("Delivery Note", "against_sales_order", d.name) : lastDate("Purchase Receipt", "purchase_order", d.name);
          const delay = dueDate && dq < qty ? Math.max(daysBetween(dueDate, today()), 0) : 0;
          out.push({ date: d["transaction_date"], [S_ ? "sales_order" : "purchase_order"]: d.name, status: d["status"], [party]: d[party], item_code: r["item_code"], qty, [done]: dq, pending_qty: r3(Math.max(qty - dq, 0)), billed_qty: billedQty, qty_to_bill: r3(Math.max(qty - billedQty, 0)), amount, billed_amount: billed, pending_amount: r2(Math.max(amount - billed, 0)), [S_ ? "delivered_qty_amount" : "received_qty_amount"]: r2(dq * rate), [due]: dueDate, delay, time_taken: lastMove ? daysBetween(S(d["transaction_date"]), lastMove) : "", warehouse: r["warehouse"] ?? d["set_warehouse"] ?? "", company: d["company"] });
        }
      }
      const keys = ["qty", done, "pending_qty", "billed_qty", "qty_to_bill", "amount", "billed_amount", "pending_amount", S_ ? "delivered_qty_amount" : "received_qty_amount"];
      const gk = f[S_ ? "group_by_so" : "group_by_po"] === "1" ? (S_ ? "sales_order" : "purchase_order") : f["group_by_item"] === "1" ? "item_code" : "";
      const sorted = gk ? [...out].sort((a, b) => S(a[gk]).localeCompare(S(b[gk]))) : out;
      const cols: RCol[] = [col("date", "Date", "Date", undefined, 90), col(S_ ? "sales_order" : "purchase_order", dt, "Link", dt, 150), col("status", "Status", "Data", undefined, 110), col(party, P, "Link", P, 130), col("item_code", "Item Code", "Link", "Item", 120), flt("qty", "Qty"), flt(done, S_ ? "Delivered Qty" : "Received Qty"), flt("pending_qty", S_ ? "Qty to Deliver" : "Pending Qty"), flt("billed_qty", "Billed Qty"), flt("qty_to_bill", "Qty to Bill"), cur("amount", "Amount"), cur("billed_amount", "Billed Amount"), cur("pending_amount", "Pending Amount"), cur(S_ ? "delivered_qty_amount" : "received_qty_amount", S_ ? "Delivered Qty Amount" : "Received Qty Amount"), col(due, S_ ? "Delivery Date" : "Required By", "Date", undefined, 100), col("delay", "Delay (in Days)", "Int", undefined, 80), col("time_taken", S_ ? "Time Taken to Deliver" : "Time Taken to Receive", "Data", undefined, 90), col("warehouse", "Warehouse", "Link", "Warehouse", 130), col("company", "Company", "Link", "Company", 110)];
      return { columns: cols, rows: out.length ? [...(gk ? withGroupTotals(sorted, gk, keys) : sorted), totalRow(out, "date", keys)] : [],
        summary: [{ label: S_ ? "Total Amount to Bill" : "Total Pending Amount", value: r2(out.reduce((a, r) => a + n(r["pending_amount"]), 0)) }, { label: "Total Billed Amount", value: r2(out.reduce((a, r) => a + n(r["billed_amount"]), 0)) }] };
    },
  };
}
function lastDate(dt: string, field: string, order: string): string {
  let last = "";
  for (const d of adapter.list(dt)) if (sub(d) && rows(d).some((r) => r[field] === order) && dateOf(d) > last) last = dateOf(d);
  return last;
}

/** trends.py (sales_order_trends / purchase_order_trends / quotation_trends): qty and amount per period by a based-on dimension. */
function trends(dt: "Sales Order" | "Purchase Order" | "Quotation"): Runner {
  const selling = dt !== "Purchase Order"; const party = selling ? (dt === "Quotation" ? "party_name" : "customer") : "supplier";
  const BASED = selling ? ["Item", "Item Group", "Customer", "Customer Group", "Territory", "Project"] : ["Item", "Item Group", "Supplier", "Supplier Group", "Project"];
  return {
    src: `erpnext/${selling ? "selling" : "buying"}/report/${dt.toLowerCase().replace(/ /g, "_")}_trends/${dt.toLowerCase().replace(/ /g, "_")}_trends.py (controllers/trends.py)`,
    filters: [C0, fl("period", "Period", "Select", ["Monthly", "Quarterly", "Half-Yearly", "Yearly"], "Monthly"), fl("fiscal_year", "Fiscal Year", "Link", "Fiscal Year"), fl("based_on", "Based On", "Select", BASED, "Item"), fl("group_by", "Group By", "Select", ["", "Item", selling ? "Customer" : "Supplier"]), ...(dt === "Quotation" ? [] : [fl("include_closed_orders", "Include Closed Orders", "Check")])],
    run: (f) => {
      const y = fiscalYear(f["fiscal_year"]); const ps = periods(y.start, y.end, f["period"] || "Monthly"); const based = f["based_on"] || "Item"; const grp = f["group_by"] || "";
      if (grp && grp === based) return { columns: [], rows: [], error: "'Based On' and 'Group By' can not be same" };
      const keyOf = (d: Doc, r: Doc): string => {
        if (based === "Item") return S(r["item_code"]); if (based === "Item Group") return S(r["item_group"] ?? item(S(r["item_code"]))?.["item_group"]);
        if (based === "Customer" || based === "Supplier") return S(d[party]); if (based === "Project") return S(d["project"] ?? r["project"]) || "Not Set";
        if (based === "Territory") return S(d["territory"] ?? adapter.get("Customer", S(d[party]))?.["territory"]);
        const P = based.replace(" Group", ""); return S(d[`${P.toLowerCase()}_group`] ?? adapter.get(P, S(d[party]))?.[`${P.toLowerCase()}_group`]);
      };
      const subOf = (d: Doc, r: Doc) => (grp === "Item" ? S(r["item_code"]) : grp ? S(d[party]) : "");
      const by = new Map<string, Record<string, number>>();
      for (const d of docs(dt, f)) {
        const date = S(d["transaction_date"]); if (!between(date, y.start, y.end)) continue;
        if (dt !== "Quotation" && S(d["status"]) === "Closed" && f["include_closed_orders"] !== "1") continue;
        const p = ps.find((x) => between(date, x.from, x.to)); if (!p) continue;
        for (const r of rows(d)) {
          const k = `${keyOf(d, r)}\u0000${subOf(d, r)}`; const m = by.get(k) ?? {};
          m[`${p.key}_qty`] = (m[`${p.key}_qty`] ?? 0) + n(r["stock_qty"] ?? r["qty"]); m[`${p.key}_amt`] = (m[`${p.key}_amt`] ?? 0) + n(r["base_net_amount"] ?? r["amount"]);
          by.set(k, m);
        }
      }
      const fieldsP = ps.flatMap((p) => [`${p.key}_qty`, `${p.key}_amt`]);
      const list: Row[] = [...by.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([k, m]) => { const [a, b] = k.split("\u0000"); const q = ps.reduce((s, p) => s + (m[`${p.key}_qty`] ?? 0), 0); const am = ps.reduce((s, p) => s + (m[`${p.key}_amt`] ?? 0), 0);
        return { based_on: a, ...(grp ? { group_by: b } : {}), ...(based === "Item" ? { item_name: itemName(a!) } : {}), ...Object.fromEntries(fieldsP.map((x) => [x, r2(m[x] ?? 0)])), total_qty: r3(q), total_amt: r2(am) }; });
      const linkDt = based === "Project" ? "Project" : based;
      return { columns: [col("based_on", based, "Link", linkDt, 150), ...(based === "Item" ? [col("item_name", "Item Name", "Data", undefined, 150)] : []), ...(grp ? [col("group_by", grp, "Link", grp, 130)] : []), ...ps.flatMap((p) => [flt(`${p.key}_qty`, `${p.label} (Qty)`), cur(`${p.key}_amt`, `${p.label} (Amt)`)]), flt("total_qty", "Total(Qty)"), cur("total_amt", "Total(Amt)")],
        rows: list.length ? [...list, totalRow(list, "based_on", [...fieldsP, "total_qty", "total_amt"])] : [] };
    },
  };
}

/** sales_register.py / purchase_register.py: one row per invoice with income/expense account split, taxes and outstanding. */
function register(dt: "Sales Invoice" | "Purchase Invoice"): Runner {
  const sell = dt === "Sales Invoice"; const party = sell ? "customer" : "supplier"; const P = sell ? "Customer" : "Supplier"; const accF = sell ? "income_account" : "expense_account";
  return {
    src: `erpnext/accounts/report/${sell ? "sales" : "purchase"}_register/${sell ? "sales" : "purchase"}_register.py`,
    filters: [FROM, TO, fl(party, P, "Link", P), fl(`${party}_group`, `${P} Group`, "Link", `${P} Group`), C0, fl("mode_of_payment", "Mode of Payment", "Link", "Mode of Payment"), ...(sell ? [fl("owner", "Owner", "Link", "User")] : []), fl("cost_center", "Cost Center", "Link", "Cost Center"), fl("warehouse", "Warehouse", "Link", "Warehouse"), ...(sell ? [fl("brand", "Brand", "Link", "Brand")] : []), fl("item_group", "Item Group", "Link", "Item Group"), fl("include_payments", "Show Ledger View", "Check")],
    run: (f) => {
      const { from, to } = range(f); const accounts = new Set<string>(); const out: Row[] = [];
      for (const d of docs(dt, f)) {
        if (!between(d["posting_date"], from, to) || (f[party] && d[party] !== f[party]) || (f["owner"] && d["owner"] !== f["owner"])) continue;
        const p = adapter.get(P, S(d[party])); if (f[`${party}_group`] && p?.[`${party}_group`] !== f[`${party}_group`]) continue;
        if (f["mode_of_payment"] && !rows(d, "payments").some((x) => x["mode_of_payment"] === f["mode_of_payment"]) && d["mode_of_payment"] !== f["mode_of_payment"]) continue;
        const items = rows(d).filter((r) => (!f["cost_center"] || (r["cost_center"] ?? d["cost_center"]) === f["cost_center"]) && (!f["warehouse"] || r["warehouse"] === f["warehouse"]) && (!f["item_group"] || (r["item_group"] ?? item(S(r["item_code"]))?.["item_group"]) === f["item_group"]) && (!f["brand"] || (r["brand"] ?? item(S(r["item_code"]))?.["brand"]) === f["brand"]));
        if ((f["cost_center"] || f["warehouse"] || f["item_group"] || f["brand"]) && !items.length) continue;
        const split: Record<string, number> = {}; for (const r of items) { const a = S(r[accF]) || "Not Set"; accounts.add(a); split[a] = (split[a] ?? 0) + n(r["base_net_amount"] ?? r["amount"]); }
        const tax = n(d["base_total_taxes_and_charges"] ?? d["total_taxes_and_charges"]);
        out.push({ voucher_type: dt, invoice: d.name, posting_date: d["posting_date"], [party]: d[party], [`${party}_name`]: d[`${party}_name`] ?? partyName(P, S(d[party])), [`${party}_group`]: p?.[`${party}_group`] ?? "", ...(sell ? { territory: d["territory"] ?? p?.["territory"] ?? "" } : {}), tax_id: d["tax_id"] ?? p?.["tax_id"] ?? "", [sell ? "receivable_account" : "payable_account"]: d[sell ? "debit_to" : "credit_to"] ?? "", mode_of_payment: rows(d, "payments").map((x) => x["mode_of_payment"]).join(", ") || d["mode_of_payment"] || "", project: d["project"] ?? "", owner: d["owner"] ?? "", remarks: d["remarks"] ?? "",
          [sell ? "sales_order" : "purchase_order"]: [...new Set(items.map((r) => S(r[sell ? "sales_order" : "purchase_order"])).filter(Boolean))].join(", "), [sell ? "delivery_note" : "purchase_receipt"]: [...new Set(items.map((r) => S(r[sell ? "delivery_note" : "purchase_receipt"])).filter(Boolean))].join(", "),
          currency: companyCurrency(S(d["company"])), ...Object.fromEntries(Object.entries(split).map(([a, v]) => [`acc_${slug(a)}`, r2(v)])), net_total: n(d["base_net_total"] ?? d["net_total"]), tax_total: r2(tax), grand_total: n(d["base_grand_total"] ?? d["grand_total"]), rounded_total: n(d["base_rounded_total"] ?? d["rounded_total"] ?? d["grand_total"]), outstanding_amount: n(d["outstanding_amount"]) });
      }
      out.sort((a, b) => S(a["posting_date"]).localeCompare(S(b["posting_date"])) || S(a["invoice"]).localeCompare(S(b["invoice"])));
      const accCols = [...accounts].sort().map((a) => cur(`acc_${slug(a)}`, a));
      const keys = [...accCols.map((c) => c.fieldname), "net_total", "tax_total", "grand_total", "rounded_total", "outstanding_amount"];
      return { columns: [col("voucher_type", "Voucher Type", "Data", undefined, 0), col("invoice", "Invoice", "Link", dt, 150), col("posting_date", "Posting Date", "Date", undefined, 95), col(party, P, "Link", P, 130), col(`${party}_name`, `${P} Name`, "Data", undefined, 160), col(`${party}_group`, `${P} Group`, "Link", `${P} Group`, 110), ...(sell ? [col("territory", "Territory", "Link", "Territory", 100)] : []), col("tax_id", "Tax Id", "Data", undefined, 130), col(sell ? "receivable_account" : "payable_account", sell ? "Receivable Account" : "Payable Account", "Link", "Account", 150), col("mode_of_payment", "Payment Method", "Data", undefined, 100), col("project", "Project", "Link", "Project", 90), col(sell ? "sales_order" : "purchase_order", sell ? "Sales Order" : "Purchase Order", "Data", undefined, 130), col(sell ? "delivery_note" : "purchase_receipt", sell ? "Delivery Note" : "Purchase Receipt", "Data", undefined, 130), ...accCols, cur("net_total", "Net Total"), cur("tax_total", "Total Tax"), cur("grand_total", "Grand Total"), cur("rounded_total", "Rounded Total"), cur("outstanding_amount", "Outstanding Amount"), col("currency", "Currency", "Link", "Currency", 60)].map((c) => (c.width === 0 ? { ...c, width: 90, hidden: 1 } : c)),
        rows: out.length ? [...out, totalRow(out, "invoice", keys)] : [] };
    },
  };
}
const slug = (s: string) => s.replace(/[^a-zA-Z0-9\u0600-\u06FF]+/g, "_").toLowerCase();

/** item_wise_purchase_register.py: one row per purchase invoice item, optionally grouped by supplier / item / invoice. */
const itemWisePurchaseRegister: Runner = {
  src: "erpnext/accounts/report/item_wise_purchase_register/item_wise_purchase_register.py",
  filters: [FROM, TO, fl("item_code", "Item", "Link", "Item"), fl("item_group", "Item Group", "Link", "Item Group"), fl("supplier", "Supplier", "Link", "Supplier"), C0, fl("mode_of_payment", "Mode of Payment", "Link", "Mode of Payment"), fl("group_by", "Group By", "Select", ["", "Supplier", "Item", "Invoice"])],
  run: (f) => {
    const { from, to } = range(f); const out: Row[] = [];
    for (const d of docs("Purchase Invoice", f)) {
      if (!between(d["posting_date"], from, to) || (f["supplier"] && d["supplier"] !== f["supplier"])) continue;
      const items = rows(d); const net = items.reduce((a, r) => a + n(r["base_net_amount"] ?? r["amount"]), 0) || 1; const tax = n(d["base_total_taxes_and_charges"] ?? d["total_taxes_and_charges"]);
      for (const r of items) {
        const it = item(S(r["item_code"])); const grp = S(r["item_group"] ?? it?.["item_group"]);
        if (f["item_code"] && r["item_code"] !== f["item_code"]) continue; if (f["item_group"] && grp !== f["item_group"]) continue;
        const amt = n(r["base_net_amount"] ?? r["amount"]); const t = r2((amt / net) * tax);
        out.push({ item_code: r["item_code"], item_name: r["item_name"] ?? itemName(S(r["item_code"])), item_group: grp, invoice: d.name, posting_date: d["posting_date"], supplier: d["supplier"], supplier_name: d["supplier_name"] ?? partyName("Supplier", S(d["supplier"])), credit_to: d["credit_to"] ?? "", project: d["project"] ?? r["project"] ?? "", company: d["company"], purchase_order: r["purchase_order"] ?? "", purchase_receipt: r["purchase_receipt"] ?? "", expense_account: r["expense_account"] ?? "", stock_qty: n(r["stock_qty"] ?? r["qty"]), stock_uom: r["stock_uom"] ?? r["uom"] ?? "", rate: n(r["base_net_rate"] ?? r["rate"]), amount: amt, total_tax: t, total: r2(amt + t), currency: companyCurrency(S(d["company"])) });
      }
    }
    const gk = f["group_by"] === "Supplier" ? "supplier" : f["group_by"] === "Item" ? "item_code" : f["group_by"] === "Invoice" ? "invoice" : "";
    const sorted = gk ? [...out].sort((a, b) => S(a[gk]).localeCompare(S(b[gk]))) : out; const keys = ["stock_qty", "amount", "total_tax", "total"];
    return { columns: [col("item_code", "Item Code", "Link", "Item", 120), col("item_name", "Item Name", "Data", undefined, 150), col("item_group", "Item Group", "Link", "Item Group", 110), col("invoice", "Invoice", "Link", "Purchase Invoice", 150), col("posting_date", "Posting Date", "Date", undefined, 95), col("supplier", "Supplier", "Link", "Supplier", 130), col("supplier_name", "Supplier Name", "Data", undefined, 150), col("credit_to", "Payable Account", "Link", "Account", 140), col("project", "Project", "Link", "Project", 90), col("purchase_order", "Purchase Order", "Link", "Purchase Order", 130), col("purchase_receipt", "Purchase Receipt", "Link", "Purchase Receipt", 130), col("expense_account", "Expense Account", "Link", "Account", 140), flt("stock_qty", "Stock Qty"), col("stock_uom", "Stock UOM", "Link", "UOM", 70), cur("rate", "Rate"), cur("amount", "Amount"), cur("total_tax", "Total Tax"), cur("total", "Total"), col("currency", "Currency", "Link", "Currency", 60)],
      rows: out.length ? [...(gk ? withGroupTotals(sorted, gk, keys) : sorted), totalRow(out, "item_code", keys)] : [] };
  },
};

/** customer_acquisition_and_loyalty.py: new vs repeat customers and revenue per month (or territory). */
const customerAcquisition: Runner = {
  src: "erpnext/selling/report/customer_acquisition_and_loyalty/customer_acquisition_and_loyalty.py",
  filters: [fl("view_type", "View Type", "Select", ["Monthly", "Territory Wise"], "Monthly"), C0, FROM, TO],
  run: (f) => {
    const { from, to } = range(f); const inv = docs("Sales Invoice", f).filter((d) => !n(d["is_return"])).sort((a, b) => S(a["posting_date"]).localeCompare(S(b["posting_date"])));
    const first = new Map<string, string>(); for (const d of inv) if (!first.has(S(d["customer"]))) first.set(S(d["customer"]), S(d["posting_date"]));
    const terr = f["view_type"] === "Territory Wise"; const by = new Map<string, { nc: Set<string>; rc: Set<string>; nr: number; rr: number }>();
    for (const d of inv) {
      const date = S(d["posting_date"]); if (!between(date, from, to)) continue;
      const k = terr ? S(d["territory"] ?? adapter.get("Customer", S(d["customer"]))?.["territory"]) || "Not Set" : date.slice(0, 7);
      const m = by.get(k) ?? { nc: new Set(), rc: new Set(), nr: 0, rr: 0 }; const isNew = (first.get(S(d["customer"])) ?? "").slice(0, 7) === date.slice(0, 7);
      const amt = n(d["base_net_total"] ?? d["net_total"]);
      if (isNew) { m.nc.add(S(d["customer"])); m.nr += amt; } else { m.rc.add(S(d["customer"])); m.rr += amt; }
      by.set(k, m);
    }
    const list: Row[] = [...by.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([k, m]) => ({ [terr ? "territory" : "month"]: k, new_customers: m.nc.size, repeat_customers: m.rc.size, total: m.nc.size + m.rc.size, new_customer_revenue: r2(m.nr), repeat_customer_revenue: r2(m.rr), total_revenue: r2(m.nr + m.rr) }));
    const keys = ["new_customers", "repeat_customers", "total", "new_customer_revenue", "repeat_customer_revenue", "total_revenue"];
    return { columns: [terr ? col("territory", "Territory", "Link", "Territory", 150) : col("month", "Month", "Data", undefined, 100), { fieldname: "new_customers", label: "New Customers", fieldtype: "Int", width: 100 }, { fieldname: "repeat_customers", label: "Repeat Customers", fieldtype: "Int", width: 100 }, { fieldname: "total", label: "Total", fieldtype: "Int", width: 80 }, cur("new_customer_revenue", "New Customer Revenue"), cur("repeat_customer_revenue", "Repeat Customer Revenue"), cur("total_revenue", "Total Revenue")],
      rows: list.length ? [...list, totalRow(list, terr ? "territory" : "month", keys)] : [] };
  },
};

/** inactive_customers.py: customers whose last order/invoice is older than N days. */
const inactiveCustomers: Runner = {
  src: "erpnext/selling/report/inactive_customers/inactive_customers.py",
  filters: [fl("days_since_last_order", "Days Since Last Order", "Int", undefined, "60"), fl("doctype", "Doctype", "Select", ["Sales Order", "Sales Invoice"], "Sales Invoice")],
  run: (f) => {
    const days = n(f["days_since_last_order"]) || 60; if (days <= 0) return { columns: [], rows: [], error: "'Days Since Last Order' must be greater than or equal to zero" };
    const dt = f["doctype"] || "Sales Invoice"; const by = new Map<string, Doc[]>();
    for (const d of adapter.list(dt)) if (sub(d) && !n(d["is_return"])) by.set(S(d["customer"]), [...(by.get(S(d["customer"])) ?? []), d]);
    const out: Row[] = [];
    for (const c of adapter.list("Customer")) {
      if (n(c["disabled"])) continue; const ds = (by.get(c.name) ?? []).sort((a, b) => dateOf(b).localeCompare(dateOf(a)));
      const last = ds[0]; const since = last ? daysBetween(dateOf(last), today()) : Infinity; if (since < days) continue;
      out.push({ customer: c.name, customer_name: c["customer_name"] ?? c.name, territory: c["territory"] ?? "", customer_group: c["customer_group"] ?? "", number_of_orders: ds.length, total_order_value: r2(ds.reduce((a, d) => a + n(d["base_grand_total"] ?? d["grand_total"]), 0)), last_order_amount: last ? n(last["base_grand_total"] ?? last["grand_total"]) : 0, last_order_date: last ? dateOf(last) : "", days_since_last_order: Number.isFinite(since) ? since : "" });
    }
    return { columns: [col("customer", "Customer", "Link", "Customer", 140), col("customer_name", "Customer Name", "Data", undefined, 170), col("territory", "Territory", "Link", "Territory", 100), col("customer_group", "Customer Group", "Link", "Customer Group", 110), { fieldname: "number_of_orders", label: "Number of Order", fieldtype: "Int", width: 90 }, cur("total_order_value", "Total Order Value"), cur("last_order_amount", "Last Order Amount"), col("last_order_date", "Last Order Date", "Date", undefined, 100), { fieldname: "days_since_last_order", label: "Days Since Last Order", fieldtype: "Int", width: 100 }], rows: out };
  },
};

/** customer_wise_item_price.py: the customer's price list rate and the selling rate after pricing rules. */
const customerWiseItemPrice: Runner = {
  src: "erpnext/selling/report/customer_wise_item_price/customer_wise_item_price.py",
  filters: [fl("customer", "Customer", "Link", "Customer"), fl("item", "Item", "Link", "Item")],
  run: (f) => {
    if (!f["customer"]) return { columns: [], rows: [], error: "Please select a Customer" };
    const c = adapter.get("Customer", f["customer"]); const pl = S(c?.["default_price_list"]) || S(adapter.get("Selling Settings", "Selling Settings")?.["selling_price_list"]) || "Standard Selling";
    const out: Row[] = [];
    for (const p of adapter.list("Item Price")) {
      if (p["price_list"] !== pl || (f["item"] && p["item_code"] !== f["item"])) continue; if (p["customer"] && p["customer"] !== f["customer"]) continue;
      const rate = n(p["price_list_rate"]); const disc = pricingDiscount(S(p["item_code"]), f["customer"], c);
      const stock = adapter.list("Stock Ledger Entry").filter((e) => e["item_code"] === p["item_code"] && !n(e["is_cancelled"])).reduce((a, e) => a + n(e["actual_qty"]), 0);
      out.push({ item_code: p["item_code"], item_name: p["item_name"] ?? itemName(S(p["item_code"])), available_stock: r3(stock), price_list_rate: rate, selling_rate: r2(rate * (1 - disc / 100)), price_list: pl });
    }
    return { columns: [col("item_code", "Item", "Link", "Item", 130), col("item_name", "Item Name", "Data", undefined, 170), flt("available_stock", "Available Stock"), cur("price_list_rate", "Price List Rate"), cur("selling_rate", "Selling Rate"), col("price_list", "Price List", "Link", "Price List", 120)], rows: out };
  },
};
function pricingDiscount(code: string, customer: string, c: Doc | undefined): number {
  const day = today(); let best = 0;
  for (const r of adapter.list("Pricing Rule")) {
    if (n(r["disable"]) || !n(r["selling"] ?? 1) || (r["valid_from"] && S(r["valid_from"]) > day) || (r["valid_upto"] && S(r["valid_upto"]) < day)) continue;
    const on = S(r["apply_on"]); const it = adapter.get("Item", code);
    const hit = on === "Item Code" ? rows(r, "items").some((x) => x["item_code"] === code) : on === "Item Group" ? rows(r, "item_groups").some((x) => x["item_group"] === it?.["item_group"]) : on === "Transaction";
    if (!hit) continue;
    const at = S(r["applicable_for"]); if (at === "Customer" && r["customer"] !== customer) continue; if (at === "Customer Group" && r["customer_group"] !== c?.["customer_group"]) continue;
    if (n(r["min_qty"]) > 1) continue;
    best = Math.max(best, n(r["discount_percentage"]));
  }
  return best;
}

/** itemwise_recommended_reorder_level.py: reorder level = average daily outgoing × lead time + safety stock. */
const reorderLevel: Runner = {
  src: "erpnext/stock/report/itemwise_recommended_reorder_level/itemwise_recommended_reorder_level.py",
  filters: [FROM, TO, fl("item_group", "Item Group", "Link", "Item Group"), fl("brand", "Brand", "Link", "Brand")],
  run: (f) => {
    const { from, to } = range(f); const days = Math.max(daysBetween(from, to) + 1, 1); const out: Row[] = []; const consumed = new Map<string, number>();
    for (const e of adapter.list("Stock Ledger Entry")) if (!n(e["is_cancelled"]) && n(e["actual_qty"]) < 0 && between(e["posting_date"], from, to) && e["voucher_type"] !== "Stock Reconciliation") consumed.set(S(e["item_code"]), (consumed.get(S(e["item_code"])) ?? 0) - n(e["actual_qty"]));
    for (const it of adapter.list("Item")) {
      if (!n(it["is_stock_item"] ?? 1) || n(it["disabled"]) || (f["item_group"] && it["item_group"] !== f["item_group"]) || (f["brand"] && it["brand"] !== f["brand"])) continue;
      const c = consumed.get(it.name) ?? 0; const avg = c / days; const lead = n(it["lead_time_days"]); const safety = n(it["safety_stock"]);
      if (!c && !safety) continue;
      out.push({ item_code: it.name, item_name: it["item_name"] ?? it.name, item_group: it["item_group"] ?? "", brand: it["brand"] ?? "", description: it["description"] ?? "", safety_stock: safety, lead_time_days: lead, consumed: r3(c), delivered: r3(c), total_outgoing: r3(c), avg_daily_outgoing: r3(avg), reorder_level: r3(avg * lead + safety) });
    }
    return { columns: [col("item_code", "Item", "Link", "Item", 130), col("item_name", "Item Name", "Data", undefined, 160), col("item_group", "Item Group", "Link", "Item Group", 110), col("brand", "Brand", "Link", "Brand", 90), flt("safety_stock", "Safety Stock"), flt("lead_time_days", "Lead Time Days"), flt("total_outgoing", "Total Outgoing"), flt("avg_daily_outgoing", "Avg Daily Outgoing"), flt("reorder_level", "Reorder Level")], rows: out };
  },
};

/** material_requests_for_which_supplier_quotations_are_not_created (Query Report). */
const mrWithoutSq: Runner = {
  src: "erpnext/buying/report/material_requests_for_which_supplier_quotations_are_not_created/*.json (query)",
  filters: [C0],
  run: (f) => {
    const quoted = new Set<string>(); for (const q of adapter.list("Supplier Quotation")) if (n(q["docstatus"]) < 2) for (const r of rows(q)) if (r["material_request"]) quoted.add(`${r["material_request"]}\u0000${r["item_code"]}`);
    const out: Row[] = [];
    for (const d of docs("Material Request", f)) {
      if (d["material_request_type"] !== "Purchase" || S(d["status"]) === "Stopped") continue;
      for (const r of rows(d)) if (!quoted.has(`${d.name}\u0000${r["item_code"]}`)) out.push({ material_request: d.name, date: d["transaction_date"], item_code: r["item_code"], item_name: r["item_name"] ?? itemName(S(r["item_code"])), qty: n(r["qty"]), uom: r["uom"] ?? r["stock_uom"] ?? "", schedule_date: r["schedule_date"] ?? d["schedule_date"] ?? "", warehouse: r["warehouse"] ?? "" });
    }
    return { columns: [col("material_request", "Material Request", "Link", "Material Request", 150), col("date", "Date", "Date", undefined, 100), col("item_code", "Item Code", "Link", "Item", 130), col("item_name", "Item Name", "Data", undefined, 160), flt("qty", "Quantity"), col("uom", "UOM", "Link", "UOM", 70), col("schedule_date", "Required By", "Date", undefined, 100), col("warehouse", "Warehouse", "Link", "Warehouse", 130)], rows: out };
  },
};

/** procurement_tracker.py: material request → purchase order → receipt → invoice per item. */
const procurementTracker: Runner = {
  src: "erpnext/buying/report/procurement_tracker/procurement_tracker.py",
  filters: [C0, fl("cost_center", "Cost Center", "Link", "Cost Center"), fl("project", "Project", "Link", "Project"), FROM, TO, fl("show_completed_orders", "Show Completed Orders", "Check")],
  run: (f) => {
    const { from, to } = range(f); const out: Row[] = [];
    const pr = adapter.list("Purchase Receipt").filter(sub); const pi = adapter.list("Purchase Invoice").filter(sub);
    for (const po of docs("Purchase Order", f)) {
      if (!between(po["transaction_date"], from, to) || (f["project"] && po["project"] !== f["project"]) || (f["show_completed_orders"] !== "1" && S(po["status"]) === "Completed")) continue;
      for (const r of rows(po)) {
        if (f["cost_center"] && (r["cost_center"] ?? po["cost_center"]) !== f["cost_center"]) continue;
        const mr = adapter.get("Material Request", S(r["material_request"])); const mrRow = mr ? rows(mr).find((x) => x["item_code"] === r["item_code"]) : undefined;
        const recs = pr.filter((d) => rows(d).some((x) => x["purchase_order"] === po.name && x["item_code"] === r["item_code"]));
        const invs = pi.filter((d) => rows(d).some((x) => x["purchase_order"] === po.name && x["item_code"] === r["item_code"]));
        const actual = r2(invs.reduce((a, d) => a + rows(d).filter((x) => x["purchase_order"] === po.name && x["item_code"] === r["item_code"]).reduce((s, x) => s + n(x["base_net_amount"] ?? x["amount"]), 0), 0));
        out.push({ material_request_date: mr?.["transaction_date"] ?? "", material_request_no: mr?.name ?? "", cost_center: r["cost_center"] ?? po["cost_center"] ?? "", project: po["project"] ?? r["project"] ?? "", requesting_site: r["warehouse"] ?? po["set_warehouse"] ?? "", requestor: mr?.["owner"] ?? "", item_code: r["item_code"], quantity: n(r["qty"]), unit_of_measurement: r["uom"] ?? r["stock_uom"] ?? "", status: po["status"], purchase_order_date: po["transaction_date"], purchase_order: po.name, supplier: po["supplier"], estimated_cost: r2(n(mrRow?.["qty"] ?? r["qty"]) * n(adapter.get("Item", S(r["item_code"]))?.["valuation_rate"] ?? r["rate"])), actual_cost: actual, purchase_order_amt: n(r["amount"]), purchase_order_amt_in_company_currency: n(r["base_amount"] ?? r["amount"]), expected_delivery_date: r["schedule_date"] ?? po["schedule_date"] ?? "", actual_delivery_date: recs.map(dateOf).sort().slice(-1)[0] ?? "" });
      }
    }
    return { columns: [col("material_request_date", "Material Request Date", "Date", undefined, 110), col("material_request_no", "Material Request No", "Link", "Material Request", 150), col("cost_center", "Cost Center", "Link", "Cost Center", 120), col("project", "Project", "Link", "Project", 100), col("requesting_site", "Requesting Site", "Link", "Warehouse", 130), col("requestor", "Requestor", "Data", undefined, 120), col("item_code", "Item Code", "Link", "Item", 120), flt("quantity", "Quantity"), col("unit_of_measurement", "Unit of Measure", "Link", "UOM", 70), col("status", "Status", "Data", undefined, 100), col("purchase_order_date", "Purchase Order Date", "Date", undefined, 110), col("purchase_order", "Purchase Order", "Link", "Purchase Order", 150), col("supplier", "Supplier", "Link", "Supplier", 130), cur("estimated_cost", "Estimated Cost"), cur("actual_cost", "Actual Cost"), cur("purchase_order_amt", "Purchase Order Amount"), cur("purchase_order_amt_in_company_currency", "Purchase Order Amount (Company Currency)"), col("expected_delivery_date", "Expected Delivery Date", "Date", undefined, 110), col("actual_delivery_date", "Actual Delivery Date", "Date", undefined, 110)], rows: out };
  },
};

const addDaysIso = (d: string, k: number) => { const x = new Date(`${d.slice(0, 10)}T00:00:00Z`); x.setUTCDate(x.getUTCDate() + k); return x.toISOString().slice(0, 10); };
/** supplier_quotation_comparison.py: every quoted rate per item and supplier, lowest price flagged; lead time and the delivery
 *  date it implies sit beside the price so quotes compare on arrival as well as rate. */
const sqComparison: Runner = {
  src: "erpnext/buying/report/supplier_quotation_comparison/supplier_quotation_comparison.py",
  filters: [C0, FROM, TO, fl("item_code", "Item", "Link", "Item"), fl("supplier", "Supplier", "MultiSelectList", "Supplier"), fl("supplier_quotation", "Supplier Quotation", "MultiSelectList", "Supplier Quotation"), fl("request_for_quotation", "Request for Quotation", "Link", "Request for Quotation"), fl("categorize_by", "Categorize by", "Select", ["Categorize by Supplier", "Categorize by Item"], "Categorize by Supplier"), fl("include_expired", "Include Expired", "Check")],
  run: (f) => {
    const { from, to } = range(f); const out: Row[] = [];
    for (const q of docs("Supplier Quotation", f)) {
      if (!between(q["transaction_date"], from, to) || !inMs(q["supplier"], f["supplier"] ?? "") || !inMs(q.name, f["supplier_quotation"] ?? "")) continue;
      if (f["include_expired"] !== "1" && q["valid_till"] && S(q["valid_till"]) < today()) continue;
      for (const r of rows(q)) {
        if (f["item_code"] && r["item_code"] !== f["item_code"]) continue; if (f["request_for_quotation"] && r["request_for_quotation"] !== f["request_for_quotation"]) continue;
        const cf = n(r["conversion_factor"]) || 1;
        out.push({ item_code: r["item_code"], supplier_name: q["supplier"], supplier_quotation: q.name, quotation: q.name, qty: n(r["qty"]), uom: r["uom"] ?? "", stock_uom: r["stock_uom"] ?? r["uom"] ?? "", conversion_factor: cf, price: n(r["base_rate"] ?? r["rate"]), price_per_unit: r2(n(r["base_rate"] ?? r["rate"]) / cf), request_for_quotation: r["request_for_quotation"] ?? "", valid_till: q["valid_till"] ?? "", lead_time_days: n(r["lead_time_days"]), expected_delivery_date: r["expected_delivery_date"] || (n(r["lead_time_days"]) && q["transaction_date"] ? addDaysIso(S(q["transaction_date"]), n(r["lead_time_days"])) : ""), currency: q["currency"] ?? "SAR" });
      }
    }
    const best = new Map<string, number>(); for (const r of out) best.set(S(r["item_code"]), Math.min(best.get(S(r["item_code"])) ?? Infinity, n(r["price_per_unit"])));
    for (const r of out) r["lowest"] = n(r["price_per_unit"]) === best.get(S(r["item_code"])) ? "Yes" : "";
    const byItem = f["categorize_by"] === "Categorize by Item"; const gk = byItem ? "item_code" : "supplier_name";
    const sorted = [...out].sort((a, b) => S(a[gk]).localeCompare(S(b[gk])) || n(a["price_per_unit"]) - n(b["price_per_unit"]));
    const body: Row[] = []; let last = "";
    for (const r of sorted) { if (S(r[gk]) !== last) { last = S(r[gk]); body.push({ [gk]: last, indent: 0, bold: true }); } body.push({ ...r, indent: 1 }); }
    return { columns: [col("item_code", "Item", "Link", "Item", 130), col("supplier_name", "Supplier", "Link", "Supplier", 140), col("supplier_quotation", "Supplier Quotation", "Link", "Supplier Quotation", 150), flt("qty", "Quantity"), col("uom", "UOM", "Link", "UOM", 60), cur("price", "Price"), cur("price_per_unit", "Price per Unit (Stock UOM)"), col("stock_uom", "Stock UOM", "Link", "UOM", 70), col("lowest", "Lowest", "Data", undefined, 60), col("request_for_quotation", "Request for Quotation", "Link", "Request for Quotation", 150), col("valid_till", "Valid Till", "Date", undefined, 100), { fieldname: "lead_time_days", label: "Lead Time (Days)", fieldtype: "Int", width: 90 }, col("expected_delivery_date", "Expected Delivery Date", "Date", undefined, 110)],
      rows: body, summary: out.length ? [{ label: "Quotations compared", value: new Set(out.map((r) => r["supplier_quotation"])).size }] : [] };
  },
};

/** sales_person_wise_transaction_summary.py: each document row credited to its sales team member by allocated %. */
const salesPersonSummary: Runner = {
  src: "erpnext/selling/report/sales_person_wise_transaction_summary/sales_person_wise_transaction_summary.py",
  filters: [fl("sales_person", "Sales Person", "Link", "Sales Person"), fl("doc_type", "Document Type", "Select", ["Sales Order", "Delivery Note", "Sales Invoice"], "Sales Order"), FROM, TO, C0, fl("item_group", "Item Group", "Link", "Item Group"), fl("brand", "Brand", "Link", "Brand"), fl("customer", "Customer", "Link", "Customer"), fl("territory", "Territory", "Link", "Territory"), fl("show_return_entries", "Show Return Entries", "Check")],
  run: (f) => {
    const dt = f["doc_type"] || "Sales Order"; const { from, to } = range(f); const out: Row[] = [];
    for (const d of docs(dt, f)) {
      if (!between(dateOf(d), from, to) || (f["customer"] && d["customer"] !== f["customer"]) || (f["territory"] && d["territory"] !== f["territory"]) || (n(d["is_return"]) && f["show_return_entries"] !== "1")) continue;
      const team = rows(d, "sales_team").length ? rows(d, "sales_team") : salesTeamOf(S(d["customer"]));
      for (const t of team) {
        if (f["sales_person"] && t["sales_person"] !== f["sales_person"]) continue; const pct = n(t["allocated_percentage"]) || 100;
        for (const r of rows(d)) {
          const it = item(S(r["item_code"])); const grp = S(r["item_group"] ?? it?.["item_group"]); if (f["item_group"] && grp !== f["item_group"]) continue; if (f["brand"] && (r["brand"] ?? it?.["brand"]) !== f["brand"]) continue;
          const amt = n(r["base_net_amount"] ?? r["amount"]);
          out.push({ [dt.toLowerCase().replace(/ /g, "_")]: d.name, customer: d["customer"], territory: d["territory"] ?? "", warehouse: r["warehouse"] ?? "", posting_date: dateOf(d), item_code: r["item_code"], item_group: grp, brand: r["brand"] ?? it?.["brand"] ?? "", qty: n(r["stock_qty"] ?? r["qty"]), amount: amt, sales_person: t["sales_person"], contribution: pct, contribution_amt: r2((amt * pct) / 100), currency: companyCurrency(S(d["company"])) });
        }
      }
    }
    const key = dt.toLowerCase().replace(/ /g, "_"); const keys = ["qty", "amount", "contribution_amt"];
    return { columns: [col(key, dt, "Link", dt, 150), col("customer", "Customer", "Link", "Customer", 130), col("territory", "Territory", "Link", "Territory", 100), col("warehouse", "Warehouse", "Link", "Warehouse", 120), col("posting_date", "Posting Date", "Date", undefined, 95), col("item_code", "Item Code", "Link", "Item", 120), col("item_group", "Item Group", "Link", "Item Group", 110), col("brand", "Brand", "Link", "Brand", 80), flt("qty", "Qty"), cur("amount", "Amount"), col("sales_person", "Sales Person", "Link", "Sales Person", 130), { fieldname: "contribution", label: "Contribution %", fieldtype: "Percent", width: 90 }, cur("contribution_amt", "Contribution Amount")],
      rows: out.length ? [...out, totalRow(out, key, keys)] : [] };
  },
};
/** Customer.sales_team (default sales team copied to new documents by set_sales_team in selling_controller). */
const salesTeamOf = (customer: string) => rows(adapter.get("Customer", customer) ?? ({} as Doc), "sales_team");

/** territory_wise_sales.py: opportunity → quotation → order → billing amounts per territory. */
const territoryWiseSales: Runner = {
  src: "erpnext/selling/report/territory_wise_sales/territory_wise_sales.py",
  filters: [fl("transaction_date", "Transaction Date", "DateRange"), C0],
  run: (f) => {
    const [from, to] = (() => { const v = ms(f["transaction_date"]); if (v.length === 2) return v as [string, string]; const y = fiscalYear(); return [y.start, y.end]; })();
    const terrOf = (cust: string, d: Doc) => S(d["territory"] ?? adapter.get("Customer", cust)?.["territory"]) || "Not Set";
    const by = new Map<string, { opp: number; quo: number; so: number; bill: number }>();
    const add = (t: string, k: "opp" | "quo" | "so" | "bill", v: number) => { const m = by.get(t) ?? { opp: 0, quo: 0, so: 0, bill: 0 }; m[k] += v; by.set(t, m); };
    for (const o of adapter.list("Opportunity")) if ((!co(f) || o["company"] === co(f)) && between(o["transaction_date"], from, to)) add(terrOf(S(o["party_name"]), o), "opp", n(o["base_opportunity_amount"] ?? o["opportunity_amount"]));
    for (const q of docs("Quotation", f)) if (between(q["transaction_date"], from, to)) add(terrOf(S(q["party_name"]), q), "quo", n(q["base_grand_total"] ?? q["grand_total"]));
    for (const s of docs("Sales Order", f)) if (between(s["transaction_date"], from, to)) add(terrOf(S(s["customer"]), s), "so", n(s["base_grand_total"] ?? s["grand_total"]));
    for (const i of docs("Sales Invoice", f)) if (between(i["posting_date"], from, to) && !n(i["is_return"])) add(terrOf(S(i["customer"]), i), "bill", n(i["base_grand_total"] ?? i["grand_total"]));
    const list: Row[] = [...by.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([t, m]) => ({ territory: t, opportunity_amount: r2(m.opp), quotation_amount: r2(m.quo), order_amount: r2(m.so), billing_amount: r2(m.bill) }));
    const keys = ["opportunity_amount", "quotation_amount", "order_amount", "billing_amount"];
    return { columns: [col("territory", "Territory", "Link", "Territory", 150), cur("opportunity_amount", "Opportunity Amount"), cur("quotation_amount", "Quotation Amount"), cur("order_amount", "Order Amount"), cur("billing_amount", "Billing Amount")], rows: list.length ? [...list, totalRow(list, "territory", keys)] : [] };
  },
};

export const TRADE_RUNNERS: Record<string, Runner> = {
  "Delivered Items To Be Billed": itemsToBeBilled("Delivery Note"),
  "Received Items To Be Billed": itemsToBeBilled("Purchase Receipt"),
  "Item-wise Sales History": itemHistory("Sales Order"),
  "Item-wise Purchase History": itemHistory("Purchase Order"),
  "Sales Order Analysis": orderAnalysis("Sales Order"),
  "Purchase Order Analysis": orderAnalysis("Purchase Order"),
  "Sales Order Trends": trends("Sales Order"),
  "Purchase Order Trends": trends("Purchase Order"),
  "Quotation Trends": trends("Quotation"),
  "Sales Register": register("Sales Invoice"),
  "Purchase Register": register("Purchase Invoice"),
  "Item-wise Purchase Register": itemWisePurchaseRegister,
  "Customer Acquisition and Loyalty": customerAcquisition,
  "Inactive Customers": inactiveCustomers,
  "Customer-wise Item Price": customerWiseItemPrice,
  "Itemwise Recommended Reorder Level": reorderLevel,
  "Material Requests for which Supplier Quotations are not created": mrWithoutSq,
  "Procurement Tracker": procurementTracker,
  "Supplier Quotation Comparison": sqComparison,
  "Sales Person-wise Transaction Summary": salesPersonSummary,
  "Territory-wise Sales": territoryWiseSales,
};
