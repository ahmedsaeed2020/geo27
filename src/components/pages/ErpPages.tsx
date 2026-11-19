import { useState } from "react";
import { adapter, useStoreVersion, type Doc } from "@/lib/adapter";
import { DocLink, PageField, Tag, Toolbar, btnCls, inputCls, money, primaryCls } from "./kit";

const opts = (dt: string, label = (d: Doc) => d.name) => adapter.list(dt).map((d) => <option data-no-i18n key={d.name} value={d.name}>{label(d)}</option>);

/** erpnext/stock/page/stock_balance (Stock Summary) — Warehouse / Item / Item Group filters, item dashboard bars from Bin. */
export function StockBalance() {
  useStoreVersion();
  const [wh, setWh] = useState(""); const [item, setItem] = useState(""); const [sort, setSort] = useState("projected_qty");
  const bins = adapter.list("Bin").filter((b) => (!wh || b["warehouse"] === wh) && (!item || b["item_code"] === item)).sort((a, b) => Number(b[sort] ?? 0) - Number(a[sort] ?? 0));
  const max = Math.max(1, ...bins.map((b) => Number(b["actual_qty"] ?? 0) + Number(b["ordered_qty"] ?? 0)));
  return (
    <div>
      <Toolbar>
        <PageField label="Warehouse"><select className={inputCls} value={wh} onChange={(e) => setWh(e.target.value)}><option value="">All</option>{opts("Warehouse")}</select></PageField>
        <PageField label="Item"><select className={inputCls} value={item} onChange={(e) => setItem(e.target.value)}><option value="">All</option>{opts("Item", (d) => String(d["item_name"] ?? d.name))}</select></PageField>
        <PageField label="Sort by"><select className={inputCls} value={sort} onChange={(e) => setSort(e.target.value)}><option value="projected_qty">Projected Qty</option><option value="actual_qty">Actual Qty</option><option value="reserved_qty">Reserved Qty</option></select></PageField>
        <Tag kind="native">reads Bin records</Tag>
      </Toolbar>
      <div className="space-y-2">
        {bins.map((b) => { const a = Number(b["actual_qty"] ?? 0), o = Number(b["ordered_qty"] ?? 0), r = Number(b["reserved_qty"] ?? 0); return (
          <div key={b.name} className="grid grid-cols-[200px_200px_1fr_120px] items-center gap-3 border-b pb-2 text-sm">
            <DocLink doctype="Item" name={String(b["item_code"])} /><span className="text-muted-foreground">{String(b["warehouse"])}</span>
            <div className="flex h-4 overflow-hidden rounded bg-muted" title={`Actual ${a} · Ordered ${o} · Reserved ${r}`}><div className="bg-primary" style={{ width: `${(a / max) * 100}%` }} /><div className="bg-primary/40" style={{ width: `${(o / max) * 100}%` }} /></div>
            <span className="text-right">{a} <span className="text-muted-foreground">/ proj {String(b["projected_qty"] ?? 0)}</span></span>
          </div>); })}
        {!bins.length && <p className="text-sm text-muted-foreground">No stock for these filters.</p>}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">Legend: dark = actual qty, light = ordered qty. "Move"/"Add" stock buttons create Stock Entries on the server <Tag kind="server">stock posting</Tag></p>
    </div>
  );
}

/** erpnext/stock/page/warehouse_capacity_summary — Putaway Rule capacity vs Bin stock. */
export function WarehouseCapacity() {
  useStoreVersion();
  const [wh, setWh] = useState("");
  const rules = adapter.list("Putaway Rule").filter((r) => !wh || r["warehouse"] === wh);
  return (
    <div>
      <Toolbar><PageField label="Warehouse"><select className={inputCls} value={wh} onChange={(e) => setWh(e.target.value)}><option value="">All</option>{opts("Warehouse")}</select></PageField><Tag kind="native">Putaway Rule + Bin</Tag></Toolbar>
      <div className="grid gap-3 md:grid-cols-3">{rules.map((r) => { const qty = Number(adapter.list("Bin").find((b) => b["item_code"] === r["item_code"] && b["warehouse"] === r["warehouse"])?.["actual_qty"] ?? 0); const cap = Number(r["capacity"] ?? 1); const pct = Math.min(100, Math.round((qty / cap) * 100)); return (
        <div key={r.name} className="panel p-3 text-sm"><div className="font-medium"><DocLink doctype="Item" name={String(r["item_code"])} /></div><div className="text-xs text-muted-foreground">{String(r["warehouse"])}</div>
          <div className="mt-2 h-2 rounded bg-muted"><div className={`h-2 rounded ${pct > 90 ? "bg-destructive" : "bg-primary"}`} style={{ width: `${pct}%` }} /></div>
          <div className="mt-1 text-xs">{qty} / {cap} {String(r["stock_uom"] ?? "")} · {pct}% occupied</div></div>); })}</div>
      {!rules.length && <p className="text-sm text-muted-foreground">No Putaway Rules for this warehouse.</p>}
    </div>
  );
}

/** erpnext/manufacturing/page/bom_comparison_tool — two BOM selects, item-level diff. */
export function BomComparison() {
  useStoreVersion();
  const boms = adapter.list("BOM");
  const [a, setA] = useState(boms[1]?.name ?? ""); const [b, setB] = useState(boms[0]?.name ?? "");
  const ia = (adapter.get("BOM", a)?.["items"] as Record<string, unknown>[]) ?? [];
  const ib = (adapter.get("BOM", b)?.["items"] as Record<string, unknown>[]) ?? [];
  const codes = [...new Set([...ia, ...ib].map((r) => String(r["item_code"])))];
  return (
    <div>
      <Toolbar>
        <PageField label="BOM 1"><select className={inputCls} value={a} onChange={(e) => setA(e.target.value)}>{opts("BOM")}</select></PageField>
        <PageField label="BOM 2"><select className={inputCls} value={b} onChange={(e) => setB(e.target.value)}>{opts("BOM")}</select></PageField>
        <Tag kind="native">compares BOM Item rows</Tag>
      </Toolbar>
      <table className="w-full rounded-md border text-sm"><thead className="bg-muted text-left text-xs text-muted-foreground"><tr><th className="p-2">Item</th><th className="p-2">{a} qty</th><th className="p-2">{b} qty</th><th className="p-2">{a} rate</th><th className="p-2">{b} rate</th><th className="p-2">Change</th></tr></thead>
        <tbody>{codes.map((c) => { const x = ia.find((r) => r["item_code"] === c), y = ib.find((r) => r["item_code"] === c); const ch = !x ? "Added" : !y ? "Removed" : x["qty"] !== y["qty"] || x["rate"] !== y["rate"] ? "Changed" : "Same"; return (
          <tr key={c} className={`border-t ${ch !== "Same" ? "bg-accent/40" : ""}`}><td className="p-2"><DocLink doctype="Item" name={c} /></td><td className="p-2">{String(x?.["qty"] ?? "—")}</td><td className="p-2">{String(y?.["qty"] ?? "—")}</td><td className="p-2">{x ? money(x["rate"]) : "—"}</td><td className="p-2">{y ? money(y["rate"]) : "—"}</td><td className="p-2">{ch}</td></tr>); })}</tbody></table>
    </div>
  );
}

/** erpnext/manufacturing/page/production_plan_visualizer — Production Plan → Work Orders → Job Cards tree. */
export function ProductionPlanVisualizer() {
  useStoreVersion();
  const plans = adapter.list("Production Plan");
  const [p, setP] = useState(plans[0]?.name ?? "");
  const wos = [...new Set(adapter.list("Job Card").map((j) => String(j["work_order"])))];
  return (
    <div>
      <Toolbar><PageField label="Production Plan"><select className={inputCls} value={p} onChange={(e) => setP(e.target.value)}><option value="">(none)</option>{opts("Production Plan")}</select></PageField><Tag kind="native">tree from Job Card / Work Order links</Tag></Toolbar>
      <div className="panel p-4 text-sm">
        <div className="font-medium">{p || "Unplanned work orders"}</div>
        {wos.map((w) => <div key={w} className="ml-4 mt-2 border-l pl-3"><div>Work Order {w}</div>{adapter.related("Job Card", "work_order", w).map((j) => <div key={j.name} className="ml-4 mt-1 border-l pl-3 text-muted-foreground"><DocLink doctype="Job Card" name={j.name} /> · {String(j["operation"])} · {String(j["status"])}</div>)}</div>)}
      </div>
    </div>
  );
}

/** erpnext/manufacturing/page/shop_floor — job cards per workstation with start/complete actions. */
export function ShopFloor() {
  useStoreVersion();
  const [ws, setWs] = useState("");
  const jobs = adapter.list("Job Card").filter((j) => !ws || j["workstation"] === ws);
  const act = (j: Doc) => { const done = Number(j["total_completed_qty"] ?? 0) + 1; const full = done >= Number(j["for_quantity"] ?? 1); adapter.update("Job Card", j.name, { total_completed_qty: Math.min(done, Number(j["for_quantity"] ?? 1)), status: full ? "Completed" : "Work In Progress" }); };
  return (
    <div>
      <Toolbar><PageField label="Workstation"><select className={inputCls} value={ws} onChange={(e) => setWs(e.target.value)}><option value="">All</option>{opts("Workstation")}</select></PageField><Tag kind="simulated">updates Job Card qty/status; time logs not posted</Tag></Toolbar>
      <div className="grid gap-3 md:grid-cols-3">{jobs.map((j) => (
        <div key={j.name} className="panel p-3 text-sm"><div className="flex justify-between"><DocLink doctype="Job Card" name={j.name} /><span className="text-xs">{String(j["status"])}</span></div>
          <div className="text-muted-foreground">{String(j["operation"])} · {String(j["workstation"])}</div>
          <div className="mt-1">{String(j["total_completed_qty"] ?? 0)} / {String(j["for_quantity"])} {String(j["production_item"])}</div>
          <button className={`${primaryCls} mt-2`} disabled={j["status"] === "Completed"} onClick={() => act(j)}>{j["status"] === "Open" ? "Start" : "Complete 1"}</button></div>))}</div>
    </div>
  );
}

/** erpnext/manufacturing/page/visual_plant_floor — Plant Floor select, workstation status tiles. */
export function VisualPlantFloor() {
  useStoreVersion();
  const [pf, setPf] = useState(adapter.list("Plant Floor")[0]?.name ?? "");
  const wss = adapter.list("Workstation").filter((w) => !pf || w["plant_floor"] === pf);
  return (
    <div>
      <Toolbar><PageField label="Plant Floor"><select className={inputCls} value={pf} onChange={(e) => setPf(e.target.value)}>{opts("Plant Floor")}</select></PageField><Tag kind="native">Workstation.status</Tag></Toolbar>
      <div className="grid gap-3 md:grid-cols-4">{wss.map((w) => (
        <div key={w.name} className="panel p-3 text-sm"><div className="font-medium"><DocLink doctype="Workstation" name={w.name} /></div>
          <select aria-label={`${w.name} status`} className={`${inputCls} mt-2`} value={String(w["status"] ?? "Off")} onChange={(e) => adapter.update("Workstation", w.name, { status: e.target.value })}>{["Production", "Off", "Idle", "Problem", "Maintenance", "Setup"].map((s) => <option key={s} value={s}>{s}</option>)}</select>
          <div className="mt-1 text-xs text-muted-foreground">{adapter.related("Job Card", "workstation", w.name).length} job cards</div></div>))}</div>
    </div>
  );
}

/** erpnext/selling/page/sales_funnel — Sales Funnel / Opportunities by Sales Stage / Territory charts. */
export function SalesFunnel() {
  useStoreVersion();
  const [mode, setMode] = useState("sales_funnel");
  const funnel: [string, number][] = [["Active Leads", adapter.list("Lead").length], ["Opportunities", adapter.list("Opportunity").length], ["Quotations", adapter.list("Quotation").length], ["Converted", adapter.list("Sales Order").length]];
  const byStage = Object.entries(adapter.list("Opportunity").reduce<Record<string, number>>((m, o) => { const k = String(o["sales_stage"] ?? "—"); m[k] = (m[k] ?? 0) + Number(o["opportunity_amount"] ?? 0); return m; }, {}));
  const data = mode === "sales_funnel" ? funnel : byStage;
  const max = Math.max(1, ...data.map(([, v]) => v));
  return (
    <div>
      <Toolbar>
        <PageField label="Chart"><select className={inputCls} value={mode} onChange={(e) => setMode(e.target.value)}><option value="sales_funnel">Sales Funnel</option><option value="opp_by_stage">Opportunities by Sales Stage</option></select></PageField>
        <PageField label="Company"><select className={inputCls}>{opts("Company")}</select></PageField>
        <Tag kind="native">counts computed from shared records</Tag>
      </Toolbar>
      <div className="mx-auto max-w-xl space-y-2">{data.map(([k, v]) => <div key={k} className="mx-auto rounded bg-primary py-2 text-center text-sm text-primary-foreground" style={{ width: `${30 + (v / max) * 70}%` }}>{k}: {mode === "sales_funnel" ? v : money(v)}</div>)}</div>
    </div>
  );
}

/** erpnext/selling/page/point_of_sale — item selector, cart, customer, payment → POS Sales Invoice. */
export function PointOfSale() {
  useStoreVersion();
  const items = adapter.list("Item");
  const [cart, setCart] = useState<Record<string, number>>({});
  const [cust, setCust] = useState(adapter.list("Customer")[0]?.name ?? "");
  const [q, setQ] = useState(""); const [paid, setPaid] = useState<string | null>(null);
  const lines = Object.entries(cart).filter(([, n]) => n > 0).map(([c, n]) => { const it = adapter.get("Item", c)!; const rate = Number(it["standard_rate"] ?? 0); return { item_code: c, item_name: it["item_name"], qty: n, rate, amount: n * rate }; });
  const total = lines.reduce((s, l) => s + l.amount, 0);
  const pay = () => { const d = adapter.insertDoc("Sales Invoice", { customer: cust, is_pos: 1, posting_date: new Date().toISOString().slice(0, 10), items: lines.map((l, i) => ({ idx: i + 1, ...l })), grand_total: total, paid_amount: total, status: "Draft", update_stock: 1 }); setPaid(d.name); setCart({}); };
  return (
    <div className="grid gap-4 md:grid-cols-[1fr_360px]">
      <div>
        <Toolbar><input className={inputCls} placeholder="Search by item code or name" value={q} onChange={(e) => setQ(e.target.value)} /><Tag kind="simulated">no POS Opening Entry / stock posting</Tag></Toolbar>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{items.filter((i) => !q || JSON.stringify(i).toLowerCase().includes(q.toLowerCase())).map((i) => (
          <button key={i.name} className="panel p-3 text-left hover:shadow-md" onClick={() => setCart({ ...cart, [i.name]: (cart[i.name] ?? 0) + 1 })}>
            <div className="mb-2 flex h-14 items-center justify-center rounded bg-muted text-xl font-semibold">{String(i["item_name"] ?? i.name)[0]}</div>
            <div className="text-sm font-medium">{String(i["item_name"] ?? i.name)}</div><div className="text-xs text-muted-foreground">SAR {money(i["standard_rate"])}</div></button>))}</div>
      </div>
      <div className="panel flex flex-col p-3">
        <PageField label="Customer"><select className={inputCls} value={cust} onChange={(e) => setCust(e.target.value)}>{opts("Customer", (d) => String(d["customer_name"] ?? d.name))}</select></PageField>
        <div className="mt-3 flex-1 space-y-1">{lines.map((l) => <div key={l.item_code} className="flex items-center justify-between text-sm"><span>{String(l.item_name)}</span><span className="flex items-center gap-1"><button className={btnCls} onClick={() => setCart({ ...cart, [l.item_code]: l.qty - 1 })}>−</button>{l.qty}<button className={btnCls} onClick={() => setCart({ ...cart, [l.item_code]: l.qty + 1 })}>+</button><span className="w-20 text-right">{money(l.amount)}</span></span></div>)}{!lines.length && <p className="text-sm text-muted-foreground">Cart is empty — select items.</p>}</div>
        <div className="mt-3 flex justify-between border-t pt-2 font-semibold"><span>Grand Total</span><span>SAR {money(total)}</span></div>
        <button className={`${primaryCls} mt-2`} disabled={!lines.length || !cust} onClick={pay}>Checkout · Complete Order</button>
        {paid && <p className="mt-2 text-xs">Created POS invoice <DocLink doctype="Sales Invoice" name={paid} /> (draft, local).</p>}
      </div>
    </div>
  );
}

/** hrms/hr/page/organizational_chart — Employee tree by reports_to. */
export function OrgChart() {
  useStoreVersion();
  const emps = adapter.list("Employee");
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const kids = (id: string | null) => emps.filter((e) => (e["reports_to"] || null) === id);
  const Node = ({ e }: { e: Doc }) => { const ch = kids(e.name); return (
    <div className="flex flex-col items-center">
      <button className="panel w-48 p-3 text-center hover:shadow-md" onClick={() => setOpen({ ...open, [e.name]: !open[e.name] })}>
        <div className="mx-auto mb-1 flex h-9 w-9 items-center justify-center rounded-full bg-accent text-sm font-semibold">{String(e["employee_name"] ?? e.name)[0]}</div>
        <div className="text-sm font-medium">{String(e["employee_name"] ?? e.name)}</div><div className="text-xs text-muted-foreground">{String(e["designation"] || "—")}</div>
        {ch.length > 0 && <div className="mt-1 text-[10px] text-primary">{ch.length} report{ch.length > 1 ? "s" : ""} {open[e.name] ? "▲" : "▼"}</div>}
      </button>
      {open[e.name] && ch.length > 0 && <div className="mt-4 flex gap-4 border-t pt-4">{ch.map((c) => <Node key={c.name} e={c} />)}</div>}
    </div>); };
  return (
    <div>
      <Toolbar><PageField label="Company"><select className={inputCls}>{opts("Company")}</select></PageField><Tag kind="native">Employee.reports_to</Tag></Toolbar>
      <div className="flex flex-wrap justify-center gap-6">{kids(null).map((e) => <Node key={e.name} e={e} />)}</div>
    </div>
  );
}
