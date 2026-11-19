/**
 * Insert-if-missing Insights records using source canonical names:
 * demo_data data source + table links (insights/setup/demo.py), the "Order Analysis"
 * sample workbook (insights/setup/sample_workbook.json) and Insights Settings defaults.
 */
import { isServerHosted } from "@/lib/serverHost";
import { adapter } from "./adapter";
import { deletedIndex, deletedKey } from "./deletedDocs";
import { DEMO, SITE, listTables, loadDemo } from "./insights";

const LINKS: [string, string, string, string][] = [
  ["customers", "orders", "customer_id", "customer_id"],
  ["geolocation", "customers", "geolocation_zip_code_prefix", "customer_zip_code_prefix"],
  ["geolocation", "sellers", "geolocation_zip_code_prefix", "seller_zip_code_prefix"],
  ["orders", "orderitems", "order_id", "order_id"],
  ["orders", "orderpayments", "order_id", "order_id"],
  ["orders", "orderreviews", "order_id", "order_id"],
  ["products", "orderitems", "product_id", "product_id"],
  ["sellers", "orderitems", "seller_id", "seller_id"],
];
const put = (dt: string, name: string, data: Record<string, unknown>) => { if (!adapter.get(dt, name) && !deletedIndex().has(deletedKey(dt, name))) adapter.insertDoc(dt, { ...data, name, __synthetic: 1 }); };
type Sample = { doc: { name: number; title: string }; dependencies: { queries: Record<string, Record<string, unknown>>; charts: Record<string, Record<string, unknown>>; dashboards: Record<string, Record<string, unknown>> } };


/** P12.7 — Sales / Purchasing / HR workbooks over Site DB (the shared synthetic records). */
function demoWorkbooks() {
  const src = (t: string) => ({ table: { data_source: SITE, table_name: `tab${t}`, type: "table" }, type: "source" });
  const col = (c: string) => ({ column_name: c, type: "column" });
  const bar = (x: string, m: string, agg = "sum", gran?: string) => ({ x_axis: { dimension: { column_name: x, data_type: gran ? "Date" : "String", dimension_name: x, granularity: gran, label: x, value: x } }, y_axis: { series: [{ measure: { aggregation: agg, column_name: m, data_type: "Decimal", label: m, measure_name: `${agg}_${m}` } }] }, filters: { filters: [], logical_operator: "And" }, limit: "100" });
  const num = (m: string, agg = "sum") => ({ number_columns: [{ aggregation: agg, column_name: m, data_type: "Decimal", label: m, measure_name: `${agg}_${m}` }], filters: { filters: [], logical_operator: "And" } });
  const books: [string, string, [string, string, Record<string, unknown>[]][], [string, string, string, Record<string, unknown>][]][] = [
    ["DDT-WB-SALES", "Sales (Digit Demo)", [["DDT-Q-SINV", "Sales Invoices", [src("Sales Invoice"), { type: "filter", filters: [{ column: col("docstatus"), operator: "=", value: 1 }] }]]],
      [["DDT-C-SALES-M", "Monthly Sales", "Bar", bar("posting_date", "base_net_total", "sum", "month")], ["DDT-C-SALES-ST", "Invoices by Status", "Donut", bar("status", "grand_total", "count")], ["DDT-C-SALES-T", "Total Net Sales", "Number", num("base_net_total")]]],
    ["DDT-WB-PURCH", "Purchasing (Digit Demo)", [["DDT-Q-PO", "Purchase Orders", [src("Purchase Order")]]],
      [["DDT-C-PO-M", "Monthly Purchases", "Bar", bar("transaction_date", "base_net_total", "sum", "month")], ["DDT-C-PO-SUP", "Purchases by Supplier", "Row", bar("supplier_name", "base_net_total")], ["DDT-C-PO-T", "Total Purchases", "Number", num("base_net_total")]]],
    ["DDT-WB-HR", "HR (Digit Demo)", [["DDT-Q-ATT", "Attendance", [src("Attendance")]], ["DDT-Q-SAL", "Salary Slips", [src("Salary Slip")]]],
      [["DDT-C-ATT-ST", "Attendance by Status", "Donut", bar("status", "name", "count")], ["DDT-C-SAL-M", "Net Pay by Month", "Bar", bar("end_date", "net_pay", "sum", "month")], ["DDT-C-HEAD", "Salary Slips", "Number", num("name", "count")]]],
  ];
  for (const [wb, title, queries, charts] of books) {
    put("Insights Workbook", wb, { title, is_standard: 0 });
    queries.forEach(([q, t, ops]) => put("Insights Query v3", q, { title: t, workbook: wb, operations: JSON.stringify(ops), use_live_connection: 1, is_builder_query: 0, is_script_query: 0, is_native_query: 0 }));
    charts.forEach(([c, t, type, cfg0], i) => { const cfg = type === "Donut" ? { label_column: (cfg0["x_axis"] as { dimension: unknown }).dimension, value_column: (cfg0["y_axis"] as { series: { measure: unknown }[] }).series[0]!.measure, filters: cfg0["filters"] } : cfg0; put("Insights Chart v3", c, { title: t, workbook: wb, query: c.startsWith("DDT-C-SAL") || c === "DDT-C-HEAD" ? "DDT-Q-SAL" : c.startsWith("DDT-C-ATT") ? "DDT-Q-ATT" : queries[0]![0], chart_type: type, config: JSON.stringify(cfg), visibility: "Private", sort_order: i }); });
    put("Insights Dashboard v3", `${wb}-DASH`, { title: `${title} Dashboard`, workbook: wb, items: JSON.stringify(charts.map(([c], i) => ({ type: "chart", chart: c, layout: { i: c, x: (i % 3) * 6, y: Math.floor(i / 3) * 8, w: 6, h: 8 } }))), visibility: "Private", vertical_compact_layout: 1 });
  }
}

/** 2026 Insights finance templates (U26F-21): AR / AP / cash and inventory workbooks over the Site DB, each query filtered to
 *  submitted source documents (filter_group), each chart naming its query, so every figure drills to the documents it sums. */
export const FINANCE_TEMPLATES = ["DDT-WB-FIN", "DDT-WB-INV"] as const;
function financeWorkbooks() {
  const src = (t: string) => ({ table: { data_source: SITE, table_name: `tab${t}`, type: "table" }, type: "source" });
  const col = (c: string) => ({ column_name: c, type: "column" });
  const where = (...f: [string, string, unknown][]) => ({ type: "filter_group", logical_operator: "And", filters: f.map(([c, op, v]) => ({ column: col(c), operator: op, value: v })) });
  const bar = (x: string, m: string, agg = "sum", gran?: string) => ({ x_axis: { dimension: { column_name: x, data_type: gran ? "Date" : "String", dimension_name: x, granularity: gran, label: x, value: x } }, y_axis: { series: [{ measure: { aggregation: agg, column_name: m, data_type: "Decimal", label: m, measure_name: `${agg}_${m}` } }] }, filters: { filters: [], logical_operator: "And" }, limit: "100" });
  const num = (m: string, agg = "sum") => ({ number_columns: [{ aggregation: agg, column_name: m, data_type: "Decimal", label: m, measure_name: `${agg}_${m}` }], filters: { filters: [], logical_operator: "And" } });
  const books: [string, string, [string, string, Record<string, unknown>[]][], [string, string, string, Record<string, unknown>, string][]][] = [
    ["DDT-WB-FIN", "Finance — Receivables, Payables and Cash (Digit Demo)", [
      ["DDT-Q-AR", "Open Receivables", [src("Sales Invoice"), where(["docstatus", "=", 1], ["outstanding_amount", ">", 0])]],
      ["DDT-Q-AP", "Open Payables", [src("Purchase Invoice"), where(["docstatus", "=", 1], ["outstanding_amount", ">", 0])]],
      ["DDT-Q-CASH-IN", "Money Received", [src("Payment Entry"), where(["docstatus", "=", 1], ["payment_type", "=", "Receive"])]],
      ["DDT-Q-CASH-OUT", "Money Paid", [src("Payment Entry"), where(["docstatus", "=", 1], ["payment_type", "=", "Pay"])]]],
      [["DDT-C-AR-T", "Total Receivables", "Number", num("outstanding_amount"), "DDT-Q-AR"], ["DDT-C-AR-CUST", "Receivables by Customer", "Row", bar("customer_name", "outstanding_amount"), "DDT-Q-AR"],
        ["DDT-C-AP-T", "Total Payables", "Number", num("outstanding_amount"), "DDT-Q-AP"], ["DDT-C-AP-SUP", "Payables by Supplier", "Row", bar("supplier_name", "outstanding_amount"), "DDT-Q-AP"],
        ["DDT-C-CASH-IN", "Money Received by Month", "Bar", bar("posting_date", "base_received_amount", "sum", "month"), "DDT-Q-CASH-IN"], ["DDT-C-CASH-OUT", "Money Paid by Month", "Bar", bar("posting_date", "base_paid_amount", "sum", "month"), "DDT-Q-CASH-OUT"]]],
    ["DDT-WB-INV", "Inventory (Digit Demo)", [["DDT-Q-SLE", "Stock Movements", [src("Stock Ledger Entry"), where(["is_cancelled", "!=", 1])]]],
      [["DDT-C-INV-T", "Stock Value", "Number", num("stock_value_difference"), "DDT-Q-SLE"], ["DDT-C-INV-WH", "Stock Value by Warehouse", "Row", bar("warehouse", "stock_value_difference"), "DDT-Q-SLE"],
        ["DDT-C-INV-M", "Stock Movements by Month", "Bar", bar("posting_date", "actual_qty", "count", "month"), "DDT-Q-SLE"]]],
  ];
  for (const [wb, title, queries, charts] of books) {
    put("Insights Workbook", wb, { title, is_standard: 0 });
    queries.forEach(([q, t, ops]) => put("Insights Query v3", q, { title: t, workbook: wb, operations: JSON.stringify(ops), use_live_connection: 1, is_builder_query: 0, is_script_query: 0, is_native_query: 0 }));
    charts.forEach(([c, t, type, cfg, q], i) => put("Insights Chart v3", c, { title: t, workbook: wb, query: q, chart_type: type, config: JSON.stringify(cfg), visibility: "Private", sort_order: i }));
    put("Insights Dashboard v3", `${wb}-DASH`, { title: `${title} Dashboard`, workbook: wb, items: JSON.stringify(charts.map(([c], i) => ({ type: "chart", chart: c, layout: { i: c, x: (i % 2) * 6, y: Math.floor(i / 2) * 8, w: 6, h: 8 } }))), visibility: "Private", vertical_compact_layout: 1 });
  }
}

let started = false;
export async function seedInsights() {
  if (isServerHosted()) return;
  if (started) return; started = true;
  // each synchronous segment persists once (adapter.batch) instead of once per row
  adapter.batch(() => {
  put("Insights Data Source v3", DEMO, { title: "Demo Data", status: "Active", database_type: "DuckDB", database_name: "insights_demo_data", type: "Database" });
  put("Insights Data Source v3", SITE, { title: "Site DB", status: "Active", database_type: "MariaDB", is_site_db: 1, is_frappe_db: 1, type: "Database" });
  LINKS.forEach(([l, r, lc, rc], i) => put("Insights Table Link v3", String(i + 1), { data_source: DEMO, left_table: l, right_table: r, left_column: lc, right_column: rc }));
  put("Insights Settings", "Insights Settings", { setup_complete: 1, onboarding_complete: 0, auto_execute_query: 1, query_result_expiry: 60, allow_subquery: 1, query_result_limit: 1000, enable_permissions: 0, allow_download: 1, max_export_rows: 10000, week_starts_on: "Monday", enable_data_store: 0, max_records_to_sync: 10000000, max_execution_time: 300 });
  demoWorkbooks();
  financeWorkbooks();
  });
  try {
    const s = (await fetch("/catalog/insights/sample_workbook.json").then((r) => r.json())) as Sample;
    adapter.batch(() => {
    const wb = String(s.doc.name);
    put("Insights Workbook", wb, { title: s.doc.title, is_standard: 0 });
    let i = 0;
    for (const q of Object.values(s.dependencies.queries)) put("Insights Query v3", String(q["name"]), { title: q["title"], workbook: wb, operations: JSON.stringify(q["operations"]), use_live_connection: q["use_live_connection"] ?? 1, is_script_query: q["is_script_query"] ?? 0, is_builder_query: q["is_builder_query"] ?? 0, is_native_query: q["is_native_query"] ?? 0, sort_order: i++ });
    i = 0;
    for (const c of Object.values(s.dependencies.charts)) put("Insights Chart v3", String(c["name"]), { title: c["title"], workbook: wb, query: c["query"], chart_type: c["chart_type"], config: JSON.stringify(c["config"]), visibility: "Private", sort_order: i++ });
    for (const d of Object.values(s.dependencies.dashboards)) put("Insights Dashboard v3", String(d["name"]), { title: d["title"], workbook: wb, items: JSON.stringify(d["items"]), visibility: "Private", vertical_compact_layout: 1 });
    });
  } catch { /* sample workbook unavailable */ }
  await loadDemo();
  adapter.batch(() => { for (const t of listTables(DEMO)) put("Insights Table v3", `${DEMO}_${t.table}`, { data_source: DEMO, table: t.table, label: t.table, estimated_row_count: t.rows, columns: JSON.stringify(t.columns.map((c) => ({ column: c.name, label: c.name, type: c.type }))), stored: 0 }); });
}
