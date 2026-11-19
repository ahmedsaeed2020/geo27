// @ts-nocheck -- DIGIT Pro/HR apps are switched off in the merged site build; their original /pro/* and /hr/* app routes are not in this route tree (re-enabling the app needs those routes, then remove this line)
/** DIGIT Pro operational screens: SC-S-07 Collections, SC-I-03 Warehouses, SC-I-04 Stock Balance, SC-I-08 Stock Ledger, SC-A-04 Depreciation review. Read-only over native Core records. */
import { DevOnly } from "@/components/DevOnly";
import { EntTable } from "@/components/enterprise/kit/EntTable";
import { Link, useNavigate } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { adapter } from "@/lib/adapter";
import { fmtCurrency } from "@/lib/format";
import { makePaymentEntry } from "@/lib/posting";
import { useAssetLabels } from "./AssetUI";
import { scopedList } from "@/lib/scope";
import { can, financeContext, slug, sourceStatus } from "./finance";
import { ProFrame, SourceState } from "./ProFrame";
import { StockValueNotice } from "./StockValueRecon";
import { draftPaymentsFor } from "./paymentEntry";
import { useCallback, useState } from "react";
import { useLang } from "@/i18n";
import { SortTh, ViewToolbar, useRegister } from "./ViewToolbar";
import { COLLECTIONS_SPEC, STOCK_LEDGER_SPEC, STOCK_SPEC, sortRows } from "./viewSpecs";
import type { Search } from "./savedViews";
import { collections, depreciationPreview, type DepRow, depreciationReview, sortBins, stockBalance, stockLedger, warehouseTree, type CollBucket } from "./ops";
import { DateInput } from "@/components/form/DateInput";
import { Meter } from "@/components/enterprise/kit";

type Q = Record<string, string | undefined>;
/** URL search as strings: a hand-typed `?bucket=4` arrives as a number from the router's JSON parser and is kept as "4". */
export const searchStr = (v: unknown): string | undefined => (typeof v === "string" && v ? v : typeof v === "number" && Number.isFinite(v) ? String(v) : undefined);
export const strSearch = (keys: string[]) => (q: Record<string, unknown>): Q => Object.fromEntries(keys.map((k) => [k, searchStr(q[k])]));
const num = (v: number) => v.toLocaleString("en-US", { maximumFractionDigits: 3 });
export const DocA = ({ dt, name, className = "" }: { dt: string; name: string; className?: string }) => name
  ? <Link to="/app/$app/$doctype/$name" params={{ app: "erpnext", doctype: slug(dt), name }} className={`hover:underline ${className}`} data-no-i18n><bdi>{name}</bdi></Link> : <span>—</span>;

function useSet(to: string) {
  const nav = useNavigate();
  return (p: Q) => void nav({ to: to as never, search: ((prev: Q) => ({ ...prev, ...p })) as never, replace: true });
}
function Ctx({ company, companies, set, children, dept }: { company: string; companies: string[]; set: (p: Q) => void; children?: ReactNode; dept: string }) {
  return <section className="dp-context flex-wrap" data-dp-context>
    <label className="dp-ctx-item"><span>Company</span>
      <select className="field-input" value={company} onChange={(e) => set({ company: e.target.value })} data-no-i18n>{companies.map((c) => <option key={c}>{c}</option>)}</select></label>
    {children}
    <Link to="/pro/$dept" params={{ dept }} className="btn-ghost ms-auto">Workspace</Link>
  </section>;
}
const Field = ({ label, value, onChange, type = "text", list }: { label: string; value?: string | undefined; onChange: (v: string) => void; type?: string; list?: string[] }) => (
  <label className="dp-ctx-item"><span>{label}</span>
    {list ? <select className="field-input" value={value ?? ""} onChange={(e) => onChange(e.target.value)} data-no-i18n><option value="">—</option>{list.map((x) => <option key={x}>{x}</option>)}</select>
      : type === "date" ? <DateInput className="field-input" value={value ?? ""} onChange={(e) => onChange(e.target.value)} aria-label={label} />
      : <input className="field-input" type={type} value={value ?? ""} onChange={(e) => onChange(e.target.value)} />}
  </label>
);

/* ---------- SC-S-07 Collections ---------- */
const BUCKET_LABEL: Record<CollBucket, string> = { overdue: "Overdue", today: "Due today", week: "Due in 7 days", later: "Later" };
export function CollectionsPro({ search }: { search: Q }) {
  const set = useSet("/pro/collections"); const nav = useNavigate();
  const apply = useCallback((next: Search) => void nav({ to: "/pro/collections", search: ((prev: Q) => ({ ...prev, ...next })) as never, replace: true }), [nav]);
  const reg = useRegister(COLLECTIONS_SPEC, search);
  const ar = useLang() === "ar";
  return <ProFrame title="Collections" subtitle="Customer invoices to collect, prioritised — the same open invoices as Accounts Receivable." tabs={false}>
    {({ user }) => {
      const ctx = financeContext(search["company"], user);
      if (!ctx.companies.length) return <SourceState status={sourceStatus("Company", user) === "ok" ? "empty" : "denied"} doctype="Company" />;
      const c = collections(ctx.company, user);
      if (c.status !== "ok") return <SourceState status={c.status} doctype="Sales Invoice" />;
      const q = (search["q"] ?? "").toLowerCase(); const b = search["bucket"] as CollBucket | undefined;
      const owners = [...new Set(c.rows.map((r) => r.owner))].sort();
      const list = sortRows(c.rows.filter((r) => (!b || r.bucket === b) && (!search["owner"] || r.owner === search["owner"]) && (!search["customer"] || r.customer === search["customer"])
        && (!search["from"] || r.due >= search["from"]) && (!search["to"] || r.due <= search["to"]) && (!q || r.name.toLowerCase().includes(q) || r.customer_name.toLowerCase().includes(q))),
        reg.sort, (r, k) => (k === "days" ? r.days : k === "outstanding" ? r.outstanding : k === "due" ? r.due : r.customer_name));
      const colLabel = (k: string) => { const x = COLLECTIONS_SPEC.columns.find((y) => y.key === k)!; return ar ? x.ar : x.label; };
      const plain = (r: (typeof list)[number], k: string): string | number => ({ invoice: r.name, customer: r.customer_name, due: r.due, days: r.days > 0 ? r.days : 0, grand: r.grand, outstanding: r.outstanding, owner: r.owner, next: r.action } as Record<string, string | number>)[k] ?? "";
      const exporter = { doctype: "Sales Invoice", filename: `collections_${ctx.company}`, build: () => ({ columns: reg.cols.filter((k) => k !== "actions").map((k) => ({ fieldname: k, label: colLabel(k) })), rows: list.map((r) => Object.fromEntries(reg.cols.map((k) => [k, plain(r, k)]))) }) };
      const money = (v: number) => fmtCurrency(v, ctx.currency);
      const pes = adapter.list("Payment Entry"); const canPay = can("Payment Entry", "create");
      const receive = (inv: string) => { const d = makePaymentEntry("Sales Invoice", inv); void nav({ to: "/app/$app/$doctype/$name", params: { app: "erpnext", doctype: "payment_entry", name: d.name } }); };
      const VIEWS: [string, Q][] = [["All open", { bucket: undefined }], ["Overdue", { bucket: "overdue" }], ["Due today", { bucket: "today" }], ["Due in 7 days", { bucket: "week" }]];
      return <>
        <Ctx company={ctx.company} companies={ctx.companies} set={(p) => set({ ...p, customer: undefined })} dept="selling">
          <Field label="Search" value={search["q"]} onChange={(v) => set({ q: v || undefined })} />
          <Field label="Customer" value={search["customer"]} list={[...new Set(c.rows.map((r) => r.customer))].sort()} onChange={(v) => set({ customer: v || undefined })} />
          <Field label="Owner" value={search["owner"]} list={owners} onChange={(v) => set({ owner: v || undefined })} />
          <Field label="Due from" type="date" value={search["from"]} onChange={(v) => set({ from: v || undefined })} />
          <Field label="Due to" type="date" value={search["to"]} onChange={(v) => set({ to: v || undefined })} />
        </Ctx>
        <section className="mt-4 grid gap-3 grid-cols-2 md:grid-cols-4" data-dp-cards>
          {(Object.keys(BUCKET_LABEL) as CollBucket[]).map((k) => <button key={k} type="button" onClick={() => set({ bucket: b === k ? undefined : k })} aria-pressed={b === k}
            className={`dp-card text-start ${b === k ? "ring-2 ring-primary" : ""}`} data-dp-coll-bucket={k}>
            <p className="text-xs text-muted-foreground">{BUCKET_LABEL[k]}</p>
            <p className={`mt-1 text-lg font-semibold tabular-nums ${k === "overdue" && c.totals[k].count ? "text-destructive" : ""}`} data-no-i18n>{money(c.totals[k].amount)}</p>
            <p className="text-xs text-muted-foreground"><span data-no-i18n>{c.totals[k].count}</span> invoices</p></button>)}
        </section>
        <nav className="mt-4 flex flex-wrap gap-1" aria-label="Views" data-dp-coll-views>{VIEWS.map(([l, p]) => <button key={l} type="button" className={`chip ${(p["bucket"] ?? "") === (b ?? "") ? "bg-primary text-primary-foreground" : "bg-muted"}`} onClick={() => set(p)}>{l}</button>)}
</nav>
        <ViewToolbar spec={COLLECTIONS_SPEC} search={search} companies={ctx.companies} onApply={apply} exporter={exporter} />
        <section className="panel mt-3 overflow-x-auto" data-dp-coll-queue>
          {!list.length ? <SourceState status="empty" /> :
            <EntTable id="pro-collections" wrap views={false}><table className="w-full text-sm"><thead><tr className="text-xs text-muted-foreground">{reg.cols.map((k) => { const x = COLLECTIONS_SPEC.columns.find((y) => y.key === k)!; return <SortTh key={k} k={k} label={colLabel(k)} sort={reg.sort} sortable={COLLECTIONS_SPEC.sorts.includes(k)} align={x.align} onSort={(v) => apply({ ...search, sort: v })} />; })}</tr></thead>
              <tbody>{list.map((r) => { const drafts = draftPaymentsFor("Sales Invoice", r.name, pes); return <tr key={r.name} className="border-t border-border" data-dp-coll-row={r.name} data-bucket={r.bucket}>{reg.cols.map((k) => { switch (k) {
                case "invoice": return <td key={k} className={reg.cell}><DocA dt="Sales Invoice" name={r.name} className="font-medium" /></td>;
                case "customer": return <td key={k} className={reg.cell}><Link to="/app/$app/$doctype/$name" params={{ app: "erpnext", doctype: "customer", name: r.customer }} className="hover:underline" data-no-i18n>{r.customer_name}</Link></td>;
                case "due": return <td key={k} className={`${reg.cell} tabular-nums`} data-no-i18n>{r.due}</td>;
                case "days": return <td key={k} className={`${reg.cell} text-end tabular-nums ${r.days > 0 ? "text-destructive" : ""}`} data-no-i18n>{r.days > 0 ? r.days : "—"}</td>;
                case "grand": return <td key={k} className={`${reg.cell} text-end tabular-nums`} data-no-i18n>{money(r.grand)}</td>;
                case "outstanding": return <td key={k} className={`${reg.cell} text-end font-medium tabular-nums`} data-no-i18n>{money(r.outstanding)}</td>;
                case "owner": return <td key={k} className={`${reg.cell} text-xs`} data-no-i18n>{r.owner}</td>;
                case "next": return <td key={k} className={reg.cell}><span className={`chip text-xs ${r.bucket === "overdue" ? "bg-destructive/10 text-destructive" : r.bucket === "today" ? "bg-warning/20" : "bg-muted"}`}>{r.action}</span></td>;
                case "actions": return <td key={k} className={`${reg.cell} whitespace-nowrap text-end`}>
                  {drafts.length ? <DocA dt="Payment Entry" name={drafts[0]!} className="text-xs" /> : canPay && <button type="button" className="btn-primary text-xs" onClick={() => receive(r.name)} data-dp-coll-receive={r.name}>Receive Payment</button>}
                  {" "}<Link to="/pro/receivables" search={{ company: ctx.company, party: r.customer } as never} className="btn-ghost text-xs">Aging</Link></td>;
                default: return <td key={k} />;
              } })}</tr>; })}</tbody></table></EntTable>}
        </section>
        <section className="mt-3 flex flex-wrap gap-2 text-xs" data-dp-coll-reports>
          <span className="text-muted-foreground">Related reports:</span>
          {["Accounts Receivable", "Accounts Receivable Summary", "Customer Ledger Summary", "Payment Period Based On Invoice Date"].map((r) => <Link key={r} to="/report/$name" params={{ name: r }} className="chip bg-muted hover:underline">{r}</Link>)}
          <Link to="/app/$app/$doctype" params={{ app: "erpnext", doctype: "dunning" }} className="chip bg-muted hover:underline">Dunning</Link>
        </section>
      </>;
    }}
  </ProFrame>;
}

/* ---------- SC-I-08 Stock Ledger ---------- */
export function StockLedgerPro({ search }: { search: Q }) {
  const set = useSet("/pro/stock-ledger"); const nav = useNavigate();
  const apply = useCallback((next: Search) => void nav({ to: "/pro/stock-ledger", search: ((prev: Q) => ({ ...prev, ...next })) as never, replace: true }), [nav]);
  const reg = useRegister(STOCK_LEDGER_SPEC, search);
  const ar = useLang() === "ar";
  return <ProFrame title="Stock Ledger" subtitle="Posted stock movements with running balance and valuation — as written by Core posting." tabs={false} doctypes={['Stock Ledger Entry','Warehouse','Item']}>
    {({ user }) => {
      const ctx = financeContext(search["company"], user);
      const r = stockLedger({ company: ctx.company, item: search["item"], warehouse: search["warehouse"], from: search["from"], to: search["to"], voucher: search["voucher"] }, user);
      if (r.status !== "ok") return <SourceState status={r.status} doctype="Stock Ledger Entry" />;
      const whCompany = new Map(scopedList("Warehouse", user).map((w) => [w.name, String(w["company"] ?? "")]));
      // Filter choices come from the selected company's movements only (legacy rows without company resolve through their Warehouse).
      const all = scopedList("Stock Ledger Entry", user).filter((e) => (String(e["company"] ?? "") || whCompany.get(String(e["warehouse"] ?? "")) || "") === ctx.company);
      const opts = (f: string) => [...new Set(all.map((e) => String(e[f] ?? "")).filter(Boolean))].sort();
      const colLabel = (k: string) => { const x = STOCK_LEDGER_SPEC.columns.find((y) => y.key === k)!; return ar ? x.ar : x.label; };
      const F: Record<string, string> = { date: "posting_date", item: "item_code", warehouse: "warehouse", balance: "qty_after_transaction", rate: "valuation_rate", stock_value: "stock_value", value_change: "stock_value_difference" };
      const plain = (e: (typeof r.rows)[number], k: string): string | number => { const q = Number(e["actual_qty"]) || 0;
        return k === "voucher" ? `${String(e["voucher_type"] ?? "")} ${String(e["voucher_no"] ?? "")}` : k === "in" ? (q > 0 ? q : "") : k === "out" ? (q < 0 ? q : "") : ["balance", "rate", "stock_value", "value_change"].includes(k) ? Number(e[F[k]!]) || 0 : String(e[F[k]!] ?? ""); };
      const exporter = { doctype: "Stock Ledger Entry", filename: `stock_ledger_${ctx.company}`, build: () => ({ columns: reg.cols.map((k) => ({ fieldname: k, label: colLabel(k) })), rows: r.rows.map((e) => Object.fromEntries(reg.cols.map((k) => [k, plain(e, k)]))) }) };
      return <>
        <Ctx company={ctx.company} companies={ctx.companies} set={set} dept="inventory">
          <Field label="Item" value={search["item"]} list={opts("item_code")} onChange={(v) => set({ item: v || undefined })} />
          <Field label="Warehouse" value={search["warehouse"]} list={opts("warehouse")} onChange={(v) => set({ warehouse: v || undefined })} />
          <Field label="Voucher Type" value={search["voucher"]} list={opts("voucher_type")} onChange={(v) => set({ voucher: v || undefined })} />
          <Field label="From" type="date" value={search["from"]} onChange={(v) => set({ from: v || undefined })} />
          <Field label="To" type="date" value={search["to"]} onChange={(v) => set({ to: v || undefined })} />
        </Ctx>
        <ViewToolbar spec={STOCK_LEDGER_SPEC} search={search} companies={ctx.companies} onApply={apply} exporter={exporter} />
        <section className="mt-4 grid gap-3 grid-cols-3" data-dp-cards>
          <div className="ek-kpi-tile"><p className="text-xs text-muted-foreground">In qty</p><p className="mt-1 text-lg font-semibold tabular-nums" data-no-i18n>{num(r.inQty)}</p></div>
          <div className="ek-kpi-tile"><p className="text-xs text-muted-foreground">Out qty</p><p className="mt-1 text-lg font-semibold tabular-nums" data-no-i18n>{num(r.outQty)}</p></div>
          <div className="ek-kpi-tile"><p className="text-xs text-muted-foreground">Value change</p><p className="mt-1 text-lg font-semibold tabular-nums" data-no-i18n>{fmtCurrency(r.value, ctx.currency)}</p></div>
        </section>
        <section className="panel mt-4 overflow-x-auto" data-dp-stock-ledger>
          {!r.rows.length ? <SourceState status="empty" /> : <EntTable id="pro-stock-ledger" wrap views={false}><table className="w-full text-sm"><thead><tr className="text-xs text-muted-foreground">{reg.cols.map((k) => { const x = STOCK_LEDGER_SPEC.columns.find((y) => y.key === k)!; return <th key={k} scope="col" className={`whitespace-nowrap p-2 text-${x.align ?? "start"}`}>{colLabel(k)}</th>; })}</tr></thead>
            <tbody>{r.rows.map((e) => <tr key={e.name} className="border-t border-border" data-dp-sle={e.name}>{reg.cols.map((k) => { const q = Number(e["actual_qty"]); switch (k) {
              case "date": return <td key={k} className={`${reg.cell} tabular-nums`} data-no-i18n>{String(e["posting_date"] ?? "")}</td>;
              case "item": return <td key={k} className={reg.cell}><DocA dt="Item" name={String(e["item_code"] ?? "")} /></td>;
              case "warehouse": return <td key={k} className={`${reg.cell} text-xs`} data-no-i18n>{String(e["warehouse"] ?? "")}</td>;
              case "voucher": return <td key={k} className={reg.cell}><span className="text-xs text-muted-foreground">{String(e["voucher_type"])}</span> <DocA dt={String(e["voucher_type"])} name={String(e["voucher_no"] ?? "")} /></td>;
              case "in": return <td key={k} className={`${reg.cell} text-end tabular-nums text-success-text`} data-no-i18n>{q > 0 ? num(q) : ""}</td>;
              case "out": return <td key={k} className={`${reg.cell} text-end tabular-nums text-destructive`} data-no-i18n>{q < 0 ? num(q) : ""}</td>;
              case "balance": return <td key={k} className={`${reg.cell} text-end tabular-nums`} data-no-i18n>{num(Number(e["qty_after_transaction"]) || 0)}</td>;
              case "rate": return <td key={k} className={`${reg.cell} text-end tabular-nums`} data-no-i18n>{fmtCurrency(Number(e["valuation_rate"]) || 0, ctx.currency)}</td>;
              case "stock_value": return <td key={k} className={`${reg.cell} text-end tabular-nums`} data-no-i18n>{fmtCurrency(Number(e["stock_value"]) || 0, ctx.currency)}</td>;
              case "value_change": return <td key={k} className={`${reg.cell} text-end tabular-nums`} data-no-i18n data-dp-sle-value-change>{fmtCurrency(Number(e["stock_value_difference"]) || 0, ctx.currency)}</td>;
              default: return <td key={k} />;
            } })}</tr>)}</tbody></table></EntTable>}
        </section>
        {!search['voucher'] && <p className="mt-2 text-xs"><Link to="/report/$name" params={{ name: "Stock Ledger" }} search={{company:ctx.company,item_code:search['item'],warehouse:search['warehouse'],from_date:search['from']??'',to_date:search['to']} as never} className="hover:underline" data-dp-native-stock-report>Standard Stock Ledger report</Link></p>}
      </>;
    }}
  </ProFrame>;
}

/* ---------- SC-I-04 Stock Balance (RXP-01: warehouse distribution → register → Stock Ledger → voucher; Saved Views) ---------- */
export function StockBalancePro({ search }: { search: Q }) {
  const nav = useNavigate();
  const set = useCallback((p: Q) => void nav({ to: "/pro/stock-balance", search: ((prev: Q) => ({ ...prev, ...p })) as never, replace: true }), [nav]);
  const ar = useLang() === "ar", t = (en: string, arabic: string) => (ar ? arabic : en);
  const reg = useRegister(STOCK_SPEC, search);
  return <ProFrame title="Stock Balance" subtitle="Quantities per item and warehouse from native Bin records." tabs={false} doctypes={["Bin", "Item", "Warehouse", "Stock Ledger Entry"]}>
    {({ user }) => {
      const ctx = financeContext(search["company"], user);
      const r = stockBalance({ company: ctx.company, warehouse: search["warehouse"], q: search["q"], group: search["group"], item_group: search["item_group"], short: search["short"] }, user);
      if (r.status !== "ok") return <SourceState status={r.status} doctype="Bin" />;
      const ledger = (item: string, wh: string) => ({ company: ctx.company, item, warehouse: wh });
      const today = new Date().toISOString().slice(0, 10);
      const maxWh = Math.max(1, ...r.warehouses.map((w) => Math.abs(w.value)));
      const filtered = !!(search["warehouse"] || search["q"] || search["item_group"] || search["short"]);
      return <>
        <Ctx company={ctx.company} companies={ctx.companies} set={(p) => set({ ...p, warehouse: undefined })} dept="inventory">
          <Field label="Search" value={search["q"]} onChange={(v) => set({ q: v || undefined })} />
          <Field label="Warehouse" value={search["warehouse"]} list={r.warehouses.map((w) => w.warehouse)} onChange={(v) => set({ warehouse: v || undefined })} />
          <Field label="Item Group" value={search["item_group"]} list={r.itemGroups} onChange={(v) => set({ item_group: v || undefined })} />
          <label className="dp-ctx-item"><span>Group by</span><select className="field-input" value={search["group"] ?? ""} onChange={(e) => set({ group: e.target.value || undefined })}>
            <option value="">None</option><option value="warehouse">Warehouse</option><option value="item_group">Item Group</option></select></label>
          <label className="dp-ctx-item flex-row items-center gap-1"><input type="checkbox" checked={search["short"] === "1"} onChange={(e) => set({ short: e.target.checked ? "1" : undefined })} data-dp-short /><span>{t("Projected below zero", "المتوقع أقل من صفر")}</span></label>
          <div className="dp-ctx-item"><span>As of</span><b data-no-i18n>{today}</b></div>
        </Ctx>
        <ViewToolbar spec={STOCK_SPEC} search={search} companies={ctx.companies} onApply={set} exporter={{ doctype: "Bin", filename: `stock_balance_${ctx.company}`, build: () => {
          const F: Record<string, string> = { item: "item_code", warehouse: "warehouse", uom: "stock_uom", actual: "actual_qty", reserved: "reserved_qty", ordered: "ordered_qty", projected: "projected_qty", value: "stock_value" };
          const cols = reg.cols.filter((k) => k !== "ledger");
          return { columns: cols.map((k) => { const c = STOCK_SPEC.columns.find((x) => x.key === k)!; return { fieldname: k, label: ar ? c.ar : c.label }; }), rows: r.groups.flatMap(([, list]) => sortBins(list, reg.sort)).map(({ bin }) => Object.fromEntries(cols.map((k) => [k, bin[F[k]!] ?? ""]))) }; } }} />
        <section className="mt-4 grid gap-3 grid-cols-3" data-dp-cards>
          <div className="ek-kpi-tile"><p className="text-xs text-muted-foreground">{t("Item–warehouse balances", "أرصدة الصنف والمستودع")}</p><p className="mt-1 text-lg font-semibold tabular-nums" data-no-i18n>{r.totals.bins}</p></div>
          <div className="ek-kpi-tile"><p className="text-xs text-muted-foreground">{t("Stock value (balance records)", "قيمة المخزون (سجلات الأرصدة)")}</p><p className="mt-1 text-lg font-semibold tabular-nums" data-no-i18n>{fmtCurrency(r.totals.value, ctx.currency)}</p></div>
          <div className="ek-kpi-tile" data-tone={r.totals.short ? "bad" : undefined}><p className="text-xs text-muted-foreground">{t("Projected below zero", "المتوقع أقل من صفر")}</p><p className={`mt-1 text-lg font-semibold tabular-nums ${r.totals.short ? "text-destructive" : ""}`} data-no-i18n>{r.totals.short}</p></div>
        </section>
        <StockValueNotice company={ctx.company} currency={ctx.currency} className="mt-3" />
        {r.warehouses.length > 0 && <section className="mt-4" aria-label={t("Stock value by warehouse", "قيمة المخزون حسب المستودع")} data-dp-wh-dist>
          <h2 className="text-sm font-semibold">{t("Stock value by warehouse", "قيمة المخزون حسب المستودع")} <span className="text-xs font-normal text-muted-foreground"><DevOnly>· <bdi data-no-i18n>Bin.stock_value</bdi> </DevOnly>· {t("select a warehouse to filter the balances", "اختر مستودعًا لتصفية الأرصدة")}</span></h2>
          <div className="mt-2 grid gap-2 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">{r.warehouses.map((w) => { const on = search["warehouse"] === w.warehouse; return <button key={w.warehouse} type="button" className="dp-seg" aria-pressed={on} onClick={() => set({ warehouse: on ? undefined : w.warehouse })} data-dp-wh-seg={w.warehouse}>
            <span className="truncate text-xs text-muted-foreground" data-no-i18n>{w.warehouse}</span>
            <span className="text-base font-semibold tabular-nums" data-no-i18n>{fmtCurrency(w.value, ctx.currency)}</span>
            <span className="text-[11px] text-muted-foreground"><bdi data-no-i18n>{w.bins}</bdi> {t("items", "أصناف")}{w.short > 0 && <> · <span className="text-destructive"><bdi data-no-i18n>{w.short}</bdi> {t("short", "عجز")}</span></>}</span>
            <Meter value={w.value} max={maxWh} /></button>; })}</div>
        </section>}
        {!r.rows.length ? <div className="dp-card mt-4" data-dp-stock-empty={filtered ? "filtered" : "none"}>{filtered ? <p className="text-sm">{t("No balances match the active filters.", "لا توجد أرصدة تطابق الفلاتر النشطة.")}</p> : <SourceState status="empty" />}</div> : r.groups.map(([g, list]) => <section key={g || "all"} className="dp-reg mt-4" data-dp-stock-balance={g}>
          {g && <h2 className="p-2 text-sm font-semibold" data-no-i18n>{g}</h2>}
          <EntTable id="pro-stock-balance" wrap views={false}><table><thead><tr>{reg.cols.map((k) => { const c = STOCK_SPEC.columns.find((x) => x.key === k)!; return <SortTh key={k} k={k} label={ar ? c.ar : c.label} sort={reg.sort} sortable={STOCK_SPEC.sorts.includes(k)} align={c.align} onSort={(v) => set({ sort: v })} />; })}</tr></thead>
            <tbody>{sortBins(list, reg.sort).map(({ bin: b, item_name }) => <tr key={b.name} data-dp-bin={b.name}>{reg.cols.map((k) => {
              const qty = (f: string) => <td key={k} className={`${reg.cell} text-end tabular-nums ${f === "projected_qty" && Number(b[f]) < 0 ? "text-destructive" : ""}`} data-no-i18n>{num(Number(b[f]) || 0)}</td>;
              switch (k) {
                case "item": return <td key={k} className={reg.cell}><DocA dt="Item" name={String(b["item_code"])} /> <span className="text-xs text-muted-foreground" data-no-i18n>{item_name}</span></td>;
                case "warehouse": return <td key={k} className={`${reg.cell} text-xs`} data-no-i18n>{String(b["warehouse"])}</td>;
                case "uom": return <td key={k} className={`${reg.cell} text-xs`} data-no-i18n>{String(b["stock_uom"] ?? "")}</td>;
                case "actual": return qty("actual_qty"); case "reserved": return qty("reserved_qty"); case "ordered": return qty("ordered_qty"); case "projected": return qty("projected_qty");
                case "value": return <td key={k} className={`${reg.cell} whitespace-nowrap text-end tabular-nums`} data-no-i18n>{fmtCurrency(Number(b["stock_value"]) || 0, ctx.currency)}</td>;
                case "ledger": return <td key={k} className={reg.cell}><Link to="/pro/stock-ledger" search={ledger(String(b["item_code"]), String(b["warehouse"])) as never} className="btn-ghost text-xs" data-dp-bin-ledger={b.name}>Movements</Link></td>;
                default: return <td key={k} />;
              } })}</tr>)}</tbody></table></EntTable>
        </section>)}
        <p className="mt-2 text-xs text-muted-foreground">{t("Quantities and stock value are the current native Bin figures (valuation, never selling prices). For a past date use the standard Stock Balance report.", "الكميات وقيمة المخزون هي أرقام Bin الأصلية الحالية (بالتقييم وليس بسعر البيع). لتاريخ سابق استخدم تقرير رصيد المخزون القياسي.")} <Link to="/report/$name" params={{ name: "Stock Balance" }} search={{ company: ctx.company, warehouse: search["warehouse"] } as never} className="hover:underline" data-dp-native-stock-balance>{t("Standard Stock Balance report", "تقرير رصيد المخزون القياسي")}</Link></p>
      </>;
    }}
  </ProFrame>;
}

/* ---------- SC-I-03 Warehouses ---------- */
export function WarehousesPro({ search }: { search: Q }) {
  const set = useSet("/pro/warehouses");
  return <ProFrame title="Warehouses" subtitle="Native warehouse hierarchy with stock held, from Bin records." tabs={false}>
    {({ user }) => {
      const ctx = financeContext(search["company"], user);
      const t = warehouseTree(ctx.company, user);
      if (t.status !== "ok") return <SourceState status={t.status} doctype="Warehouse" />;
      const q = (search["q"] ?? "").toLowerCase();
      const keep = new Set<string>();
      if (q) for (const x of t.flat) if (x.doc.name.toLowerCase().includes(q)) { let p: string | undefined = x.doc.name; while (p && !keep.has(p)) { keep.add(p); p = String(t.flat.find((y) => y.doc.name === p)?.doc["parent_warehouse"] ?? "") || undefined; } }
      const shown = q ? t.flat.filter((x) => keep.has(x.doc.name)) : t.flat;
      // Default selection is the first warehouse that holds stock, so the page never opens on an empty group/finished-goods store.
      const sel = t.flat.find((x) => x.doc.name === search["wh"]) ?? shown.find((x) => x.value > 0 || x.qty > 0) ?? shown[0];
      const bins = sel ? scopedList("Bin", user).filter((b) => b["warehouse"] === sel.doc.name) : [];
      const moves = sel ? stockLedger({ warehouse: sel.doc.name }, user).rows.slice(-8).reverse() : [];
      return <>
        <StockValueNotice company={ctx.company} currency={ctx.currency} className="mb-3" />
        <Ctx company={ctx.company} companies={ctx.companies} set={set} dept="inventory"><Field label="Search" value={search["q"]} onChange={(v) => set({ q: v || undefined })} /></Ctx>
        <div className="mt-4 grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
          <section className="panel p-2" data-dp-wh-tree>{!shown.length ? <SourceState status="empty" /> : <ul role="tree">{shown.map((x) =>
            <li key={x.doc.name} role="treeitem" aria-selected={sel?.doc.name === x.doc.name} style={{ paddingInlineStart: `${x.depth * 16 + 4}px` }}>
              <button type="button" onClick={() => set({ wh: x.doc.name })} className={`flex w-full items-center gap-2 rounded px-2 py-1 text-sm hover:bg-accent ${sel?.doc.name === x.doc.name ? "bg-accent font-medium" : ""}`} data-dp-wh={x.doc.name}>
                <span aria-hidden>{Number(x.doc["is_group"]) ? "▸" : "·"}</span><span className="flex-1 truncate text-start" data-no-i18n>{x.doc.name}</span>
                {Number(x.doc["disabled"]) ? <span className="chip bg-muted text-[10px]">Disabled</span> : null}
                <span className="text-xs tabular-nums text-muted-foreground" data-no-i18n>{fmtCurrency(x.value, ctx.currency)}</span></button></li>)}</ul>}</section>
          {sel && <section className="panel p-4" data-dp-wh-detail={sel.doc.name}>
            <div className="flex flex-wrap items-center gap-2"><h2 className="font-semibold"><DocA dt="Warehouse" name={sel.doc.name} /></h2>
              <span className="chip bg-muted text-xs">{Number(sel.doc["is_group"]) ? "Group" : "Warehouse"}</span>
              {sel.doc["warehouse_type"] ? <span className="chip bg-muted text-xs" data-no-i18n>{String(sel.doc["warehouse_type"])}</span> : null}
              <Link to="/pro/stock-balance" search={{ company: ctx.company, warehouse: sel.doc.name } as never} className="btn-ghost ms-auto text-xs">Stock Balance</Link>
              <Link to="/pro/stock-ledger" search={{ company: ctx.company, warehouse: sel.doc.name } as never} className="btn-ghost text-xs">Stock Ledger</Link></div>
            <dl className="mt-2 grid grid-cols-2 gap-2 text-xs"><dt className="text-muted-foreground">Parent Warehouse</dt><dd data-no-i18n>{String(sel.doc["parent_warehouse"] ?? "—")}</dd>
              <dt className="text-muted-foreground">Account</dt><dd data-no-i18n>{String(sel.doc["account"] ?? "—")}</dd>
              <dt className="text-muted-foreground">Stock Value</dt><dd data-no-i18n>{fmtCurrency(sel.value, ctx.currency)}</dd></dl>
            <h3 className="mt-3 text-sm font-semibold">Items held</h3>
            {!bins.length ? <div data-dp-wh-empty><SourceState status="empty" /><p className="mt-1 text-xs text-muted-foreground">{Number(sel.doc["is_group"]) ? "This is a group warehouse; stock is held in the warehouses under it." : "No item currently has stock in this warehouse. Choose another warehouse or open Stock Balance for all warehouses."}</p></div> : <div className="dp-reg mt-1" data-dp-wh-bins={bins.length}><table className="dp-table"><thead><tr><th className="text-start">Item</th><th className="text-end">Actual Qty</th><th className="text-start">UOM</th><th className="text-end">Stock Value</th></tr></thead>
              <tbody>{bins.map((b) => <tr key={b.name}><td><DocA dt="Item" name={String(b["item_code"])} /></td><td className="text-end tabular-nums" data-no-i18n>{num(Number(b["actual_qty"]) || 0)}</td><td data-no-i18n>{String(b["stock_uom"] ?? "")}</td><td className="text-end tabular-nums" data-no-i18n>{b["stock_value"] != null ? fmtCurrency(Number(b["stock_value"]) || 0, ctx.currency) : "—"}</td></tr>)}</tbody></table></div>}
            <h3 className="mt-3 text-sm font-semibold">Recent movements</h3>
            {!moves.length ? <SourceState status="empty" /> : <div className="dp-reg mt-1" data-dp-wh-moves={moves.length}><table className="dp-table"><thead><tr><th className="text-start">Posting Date</th><th className="text-start">Voucher No</th><th className="text-start">Item</th><th className="text-end">Qty Change</th></tr></thead>
              <tbody>{moves.map((e) => <tr key={e.name}><td className="tabular-nums" data-no-i18n>{String(e["posting_date"])}</td><td><DocA dt={String(e["voucher_type"])} name={String(e["voucher_no"])} /></td><td><DocA dt="Item" name={String(e["item_code"])} /></td><td className={`text-end tabular-nums ${Number(e["actual_qty"]) < 0 ? "text-destructive" : ""}`} data-no-i18n>{num(Number(e["actual_qty"]))}</td></tr>)}</tbody></table></div>}
          </section>}
        </div>
      </>;
    }}
  </ProFrame>;
}

/* ---------- SC-A-04 Depreciation review ---------- */
export function DepreciationPro({ search }: { search: Q }) {
  const set = useSet("/pro/depreciation");
  const { display, label: assetLabel } = useAssetLabels();
  return <ProFrame title="Depreciation Review" subtitle="Submitted depreciation schedules — booked, due and upcoming rows. Booking runs on the DIGIT server." tabs={false} doctypes={["Asset", "Asset Category", "Asset Depreciation Schedule", "Finance Book", "Journal Entry"]}>
    {({ user }) => {
      const ctx = financeContext(search["company"], user);
      const r = depreciationReview(ctx.company, { from: search["from"], to: search["to"], state: search["state"], book: search["book"], asset: search["asset"] }, user);
      if (r.status !== "ok") return <SourceState status={r.status} doctype="Asset Depreciation Schedule" />;
      const money = (v: number) => fmtCurrency(v, ctx.currency);
      return <>
        <Ctx company={ctx.company} companies={ctx.companies} set={set} dept="assets">
          <Field label="From" type="date" value={search["from"]} onChange={(v) => set({ from: v || undefined })} />
          <Field label="To" type="date" value={search["to"]} onChange={(v) => set({ to: v || undefined })} />
          <Field label="Finance Book" value={search["book"]} list={scopedList("Finance Book", user).map(b => b.name)} onChange={v => set({book: v || undefined})} />
          <Field label="Asset" value={search["asset"]} list={scopedList("Asset", user).filter(a => a["company"] === ctx.company).map(a => a.name)} onChange={v => set({asset: v || undefined})} />
        </Ctx>
        <p className="mt-3 text-xs text-muted-foreground" data-no-i18n>{assetLabel("Journal references distinguish linked schedules from unposted rows; they are not verification of real DIGIT posting.", "تميز مراجع القيود صفوف الجداول المرتبطة عن الصفوف غير المقيّدة؛ ولا تثبت الترحيل الفعلي على خادم DIGIT.")}</p>
        <section className="mt-4 grid gap-3 grid-cols-2 md:grid-cols-4" data-dp-cards>
          {([["posted", "Posted (ledger verified)", "مُرحّل (متحقق من الأستاذ)", r.posted], ["reference", "Journal reference — posting not verified", "مرجع قيد — الترحيل غير متحقق", r.reference], ["due", "Due, not booked", "مستحق غير مقيّد", r.due], ["upcoming", "Upcoming", "قادم", r.upcoming]] as const).map(([k, en, arl, v]) =>
            <button key={k} type="button" aria-pressed={search["state"] === k} onClick={() => set({ state: search["state"] === k ? undefined : k })} className={`dp-card text-start ${search["state"] === k ? "ring-2 ring-primary" : ""}`} data-dp-dep-state={k}>
              <p className="text-xs text-muted-foreground" data-no-i18n>{assetLabel(en, arl)}</p><p className={`mt-1 text-lg font-semibold tabular-nums ${k === "due" && v ? "text-destructive" : k === "reference" && v ? "text-warning-text" : ""}`} data-no-i18n>{money(v)}</p></button>)}
        </section>
        <p className="mt-1 text-[11px] text-muted-foreground" data-no-i18n>{assetLabel("Posted means the journal entry is submitted and has ledger rows you can read. A journal link without ledger rows, or a row marked booked without a journal, stays a reference.", "المُرحّل يعني أن قيد اليومية معتمد وله صفوف في الأستاذ يمكنك قراءتها. رابط القيد بلا صفوف أستاذ، أو الصف المعلَّم كمقيد بلا قيد، يبقى مرجعًا.")}</p>
        <section className="panel mt-4 overflow-x-auto" data-dp-dep-table>
          {!r.rows.length ? <SourceState status="empty" /> : <EntTable id="pro-depreciation" wrap><table className="w-full text-sm"><thead><tr className="text-xs text-muted-foreground">
            <th className="p-2 text-start">Asset</th><th className="p-2 text-start">Asset Category</th><th className="p-2 text-start">Finance Book</th><th className="p-2 text-start">Schedule Date</th>
            <th className="p-2 text-end">Depreciation Amount</th><th className="p-2 text-end">Accumulated Depreciation Amount</th><th className="p-2 text-start">Journal Entry</th><th className="p-2 text-start">Status</th></tr></thead>
            <tbody>{r.rows.map((x, i) => <tr key={`${x.schedule}-${i}`} className="border-t border-border" data-dp-dep-row={x.state}>
              <td className="p-2"><DocA dt="Asset" name={x.asset} /> <span className="text-xs text-muted-foreground" data-no-i18n>{display(x.asset_name)}</span></td>
              <td className="p-2 text-xs" data-no-i18n>{display(x.category)}</td><td className="p-2 text-xs" data-no-i18n>{x.finance_book || "—"}</td>
              <td className="p-2 tabular-nums" data-no-i18n>{x.date}</td><td className="p-2 text-end tabular-nums" data-no-i18n>{money(x.amount)}</td><td className="p-2 text-end tabular-nums" data-no-i18n>{money(x.accumulated)}</td>
              <td className="p-2"><DocA dt="Journal Entry" name={x.je && adapter.get("Journal Entry", x.je) ? x.je : ""} /></td>
              <td className="p-2">{x.state === "booked" ? <span className={`chip text-xs ${x.posted ? "bg-success/15 text-success-text" : "bg-warning/20"}`} data-no-i18n data-dp-dep-posted={x.posted ? "1" : "0"}>{x.posted ? assetLabel("Posted", "مُرحّل") : assetLabel("Reference only", "مرجع فقط")}</span> : <span className={`chip text-xs ${x.state === "due" ? "bg-destructive/10 text-destructive" : "bg-muted"}`}>{x.state === "due" ? "Due, not booked" : "Upcoming"}</span>}</td></tr>)}</tbody></table></EntTable>}
        </section>
        <DepReviewStep key={`${ctx.company}|${search["book"]}|${search["asset"]}|${search["from"]}|${search["to"]}|${search["state"]}`} rows={r.rows.filter((x) => x.state !== "booked")} company={ctx.company} currency={ctx.currency} user={user} />
        <p className="mt-2 text-xs text-muted-foreground">Due rows are booked by the DIGIT scheduler (Runs on DIGIT server). <Link to="/report/$name" params={{ name: "Asset Depreciation Ledger" }} className="hover:underline">Asset Depreciation Ledger</Link></p>
      </>;
    }}
  </ProFrame>;
}

/* ---------- SC-A-06 review step before booking (never posts) ---------- */
function DepReviewStep({ rows, company, currency, user }: { rows: DepRow[]; company: string; currency: string; user: string }) {
  const key = (x: DepRow) => `${x.schedule}|${x.row}|${x.date}`; // row idx: Core demo schedules can repeat a date
  const [sel, setSel] = useState<Set<string> | null>(null);
  const chosen = sel ?? new Set(rows.filter((x) => x.state === "due").map(key));
  const picked = rows.filter((x) => chosen.has(key(x)));
  const p = depreciationPreview(picked, company, user);
  const money = (v: number) => fmtCurrency(v, currency);
  if (!rows.length) return null;
  const toggle = (k: string) => { const nx = new Set(chosen); if (nx.has(k)) nx.delete(k); else nx.add(k); setSel(nx); };
  return <section className="panel mt-4 p-4" data-dp-dep-review aria-label="Review before booking">
    <div className="flex flex-wrap items-center gap-2"><h2 className="text-sm font-semibold">Review before booking</h2><span className="chip bg-muted text-xs">Runs on DIGIT server</span>
      <span className="ms-auto text-xs"><span data-no-i18n>{picked.length}/{rows.length}</span> <span>selected</span></span></div>
    <ol className="mt-2 flex flex-wrap gap-2 text-xs" data-dp-dep-steps><li className="chip bg-primary/10">1 · <span>Select rows to book</span></li><li className="chip bg-primary/10">2 · <span>Check accounts and totals</span></li><li className="chip bg-muted">3 · <span>Book on the DIGIT server</span></li></ol>
    <ul className="mt-2 divide-y divide-border text-sm">{rows.map((x) => <li key={key(x)} className="flex items-center gap-2 py-1">
      <input type="checkbox" checked={chosen.has(key(x))} onChange={() => toggle(key(x))} aria-label={x.asset} data-dp-dep-pick={x.asset} />
      <DocA dt="Asset" name={x.asset} /><span className="flex-1 text-xs tabular-nums" data-no-i18n>{x.date}</span><span className={`chip text-[10px] ${x.state === "due" ? "bg-destructive/10 text-destructive" : "bg-muted"}`}>{x.state === "due" ? "Due, not booked" : "Upcoming"}</span><span className="tabular-nums" data-no-i18n>{money(x.amount)}</span></li>)}</ul>
    <h3 className="mt-3 text-xs font-semibold text-muted-foreground">Journal entry lines that DIGIT would create</h3>
    {!p.lines.length ? <SourceState status="empty" /> : <table className="w-full text-sm" data-dp-dep-lines><thead><tr className="text-xs text-muted-foreground"><th className="text-start">Account</th><th className="text-end">Debit</th><th className="text-end">Credit</th></tr></thead>
      <tbody>{p.lines.map((l) => <tr key={l.account} className="border-t border-border"><td className="text-xs" data-no-i18n>{l.account}</td><td className="text-end tabular-nums" data-no-i18n>{l.debit ? money(l.debit) : ""}</td><td className="text-end tabular-nums" data-no-i18n>{l.credit ? money(l.credit) : ""}</td></tr>)}
        <tr className="border-t-2 border-border font-semibold"><td>Total</td><td className="text-end tabular-nums" data-no-i18n>{money(p.debit)}</td><td className="text-end tabular-nums" data-no-i18n>{money(p.credit)}</td></tr></tbody></table>}
    {p.missing.length > 0 && <p className="mt-2 text-xs text-destructive" data-dp-dep-missing><span>Depreciation accounts are not set for</span> <span data-no-i18n>{p.missing.join(", ")}</span> <span>(Asset Category or Company)</span></p>}
    <p className="mt-2 text-xs text-muted-foreground">This review does not post. DIGIT books due depreciation with its scheduler or the native Depreciation Entry; open the asset to see the schedule.</p>
  </section>;
}
