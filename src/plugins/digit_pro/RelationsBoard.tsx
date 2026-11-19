/**
 * OWN-25 / OWN-62 — "Across departments" on the executive dashboard: one row of relations between sales, branches,
 * customers, assets, stock and suppliers, each computed from submitted records at render time (sections.ts evalChart,
 * company-scoped and permission-checked) and drawn with the shared workspace ChartPanel (columns, donut or bars).
 * A chart the user may not read is left out instead of showing zero.
 */
import { adapter, type Doc } from "@/lib/adapter";
import { ChartPanel } from "./SectionWorkspace";
import { evalChart, listDrill, sectionCtx, type ChartDef, type SectionCtx } from "./sections";
import { SECTION_PAGES } from "./nav";

type Filter = ChartDef["filters"][number];
const co = (c: SectionCtx): Filter => ["company", "=", c.company];
const SUB: Filter = ["docstatus", "=", 1];
const n = (v: unknown) => Number(v) || 0;
const s = (v: unknown) => (v == null ? "" : String(v));
const r2 = (x: number) => Math.round(x * 100) / 100;

/** Eight cross-department relations (last 12 months for flows, current balances for stock and assets). */
export function relationCharts(c: SectionCtx): ChartDef[] {
  const year: Filter = ["posting_date", ">=", c.from12];
  const whs = adapter.list("Warehouse").filter((w) => w["company"] === c.company && !n(w["is_group"])).map((w) => w.name);
  const custNames = Object.fromEntries(adapter.list("Customer").map((d) => [d.name, [s(d["customer_name"]) || d.name, s(d["customer_name"]) || d.name] as [string, string]]));
  const supGroup = new Map(adapter.list("Supplier").map((d) => [d.name, s(d["supplier_group"])]));
  return [
    { id: "rel-top-items", kind: "field", doctype: "Sales Invoice", filters: [co(c), SUB, year, ["is_return", "=", 0]], field: "name",
      label: ["Best-selling items (net sales, 12 months)", "الأصناف الأكثر مبيعًا (صافي المبيعات، 12 شهرًا)"],
      fn: (ctx) => {
        const m = new Map<string, { label: string; value: number; docs: Set<string> }>();
        const sis = adapter.list("Sales Invoice").filter((d) => d["company"] === ctx.company && n(d["docstatus"]) === 1 && !n(d["is_return"]) && s(d["posting_date"]) >= ctx.from12);
        for (const d of sis) for (const r of (d["items"] as Doc[] | undefined) ?? []) {
          const k = s(r["item_code"]); if (!k) continue;
          const e = m.get(k) ?? { label: s(r["item_name"]) || k, value: 0, docs: new Set<string>() };
          e.value += n(r["base_net_amount"] ?? r["net_amount"] ?? r["amount"]); e.docs.add(d.name); m.set(k, e);
        }
        return [...m.entries()].sort((a, b) => b[1].value - a[1].value).slice(0, 8).map(([k, e]) => ({ key: k, label: e.label, count: e.docs.size, value: r2(e.value),
          drill: listDrill("Sales Invoice", [co(ctx), SUB, ["posting_date", ">=", ctx.from12], ["name", "in", [...e.docs]]]) }));
      } },
    { id: "rel-sales-trend", kind: "month", doctype: "Sales Invoice", filters: [co(c), SUB, year, ["is_return", "=", 0]], field: "posting_date", measure: "base_net_total", view: "area",
      label: ["Net sales by month (12 months)", "صافي المبيعات حسب الشهر (12 شهرًا)"] },
    { id: "rel-top-salespeople", kind: "field", doctype: "Sales Invoice", filters: [co(c), SUB, year, ["is_return", "=", 0]], field: "name",
      label: ["Top salespeople (allocated sales, 12 months)", "أفضل مندوبي المبيعات (المبيعات المخصصة، 12 شهرًا)"],
      // selling_controller sales_team: each person's allocated_amount (or allocated % of the net total)
      fn: (ctx) => {
        const m = new Map<string, { value: number; docs: Set<string> }>();
        const sis = adapter.list("Sales Invoice").filter((d) => d["company"] === ctx.company && n(d["docstatus"]) === 1 && !n(d["is_return"]) && s(d["posting_date"]) >= ctx.from12);
        for (const d of sis) for (const r of (d["sales_team"] as Doc[] | undefined) ?? []) {
          const k = s(r["sales_person"]); if (!k) continue;
          const e = m.get(k) ?? { value: 0, docs: new Set<string>() };
          e.value += r["allocated_amount"] != null ? n(r["allocated_amount"]) : (n(d["base_net_total"]) * n(r["allocated_percentage"])) / 100; e.docs.add(d.name); m.set(k, e);
        }
        return [...m.entries()].sort((a, b) => b[1].value - a[1].value).slice(0, 8).map(([k, e]) => ({ key: k, label: k, count: e.docs.size, value: r2(e.value),
          drill: listDrill("Sales Invoice", [co(ctx), SUB, ["posting_date", ">=", ctx.from12], ["name", "in", [...e.docs]]]) }));
      } },
    { id: "rel-branch-sales", kind: "field", rank: "value", doctype: "Sales Invoice", filters: [co(c), SUB, year, ["is_return", "=", 0]], field: "cost_center", measure: "base_net_total",
      label: ["Sales by branch (cost center)", "المبيعات حسب الفرع (مركز التكلفة)"] },
    { id: "rel-top-customers", kind: "field", rank: "value", doctype: "Sales Invoice", filters: [co(c), SUB, year, ["is_return", "=", 0]], field: "customer", measure: "base_net_total", labels: custNames,
      label: ["Customers by sales (12 months)", "العملاء حسب المبيعات (12 شهرًا)"] },
    { id: "rel-asset-location", kind: "field", rank: "value", doctype: "Asset", filters: [co(c), SUB], field: "location", measure: "gross_purchase_amount",
      label: ["Assets by location (purchase value)", "الأصول حسب الموقع (قيمة الشراء)"] },
    { id: "rel-stock-warehouse", kind: "field", rank: "value", doctype: "Bin", filters: [["warehouse", "in", whs], ["actual_qty", ">", 0]], field: "warehouse", measure: "stock_value",
      label: ["Stock value by warehouse", "قيمة المخزون حسب المستودع"] },
    { id: "rel-supplier-groups", kind: "field", doctype: "Purchase Invoice", filters: [co(c), SUB, year, ["is_return", "=", 0]], field: "supplier", measure: "base_net_total",
      bucket: (d) => supGroup.get(s(d["supplier"])) || "",
      label: ["Purchases by supplier group (12 months)", "المشتريات حسب مجموعة الموردين (12 شهرًا)"] },
  ];
}

/** `only` picks the relations a page shows (Executive › Performance takes the sales relations, › Dimensions the branch/location/warehouse ones). */
export function RelationsBoard({ company, currency, asOf, ar, only, title }: { company: string; currency: string; asOf: string; ar: boolean; only?: string[]; title?: [string, string] }) {
  const ctx = sectionCtx(company, currency, asOf);
  const page = SECTION_PAGES[0]!;
  const charts = relationCharts(ctx).filter((d) => !only || only.includes(d.id)).map((d) => evalChart(d, ctx, undefined, d.kind === "month" ? { months: 12 } : {})).filter((r) => r.status === "ok" && r.bars.length > 0);
  if (!charts.length) return null;
  return <section className="ek-stack-sm" data-dp-relations={charts.length}>
    <h2 className="ek-zone-title">{title ? (ar ? title[1] : title[0]) : ar ? "عبر الأقسام" : "Across departments"}</h2>
    <div className="ek-chart-row" data-cols="2">{charts.map((c) => <ChartPanel key={c.id} c={c} page={page} ar={ar} currency={currency} />)}</div>
  </section>;
}
