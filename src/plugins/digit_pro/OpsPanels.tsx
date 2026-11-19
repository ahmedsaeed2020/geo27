// @ts-nocheck -- DIGIT Pro/HR apps are switched off in the merged site build; their original /pro/* and /hr/* app routes are not in this route tree (re-enabling the app needs those routes, then remove this line)
/**
 * DIGIT Pro panels on ORIGINAL native forms (DIGIT Pro experience only):
 * SC-S-03 Quotation quick item entry, SC-I-02 Item 360, SC-I-05/06 Stock Entry operation summary,
 * SC-I-07 Stock Reconciliation variance, SC-I-09 Batch/Serial history, SC-A-02..07 Asset 360.
 * Quick entry only appends native child rows through the form's own change handler — the form saves them.
 */
import { Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { adapter, type Doc } from "@/lib/adapter";
import { newChildRow } from "@/lib/documentApi";
import { cachedMeta } from "@/lib/catalog";
import { fmtCurrency } from "@/lib/format";
import { scopedList, useScopeMetas } from "@/lib/scope";
import { currentUser } from "@/lib/session";
import { can, slug } from "./finance";
import { SourceState } from "./ProFrame";
import { DocA } from "./OpsPro";
import { asset360, item360, stockEntryContext, stockEntryLines, parseItemLines, quotationRow, reconVariance, transferSummary, voucherLedger, stockLedger, trackingMovements, PURPOSE_FIELDS, stockAvailability, stockReadiness } from "./ops";
import { useLang } from "@/i18n";

const n = (v: unknown) => Number(v) || 0;
const num = (v: number) => v.toLocaleString("en-US", { maximumFractionDigits: 3 });
const Panel = ({ id, title, children, extra }: { id: string; title: string; children: React.ReactNode; extra?: React.ReactNode }) => (
  <section className="panel mt-4 p-4" {...{ [`data-dp-${id}`]: "" }} aria-label={title}>
    <div className="flex flex-wrap items-center gap-2"><h2 className="text-sm font-semibold">{title}</h2>{extra}</div>{children}
  </section>
);

/* ---------- SC-S-03 Quick item entry ---------- */
/** Documents with quick item entry: child DocType, price-list field, item flag and per-row native fields copied from the parent. */
export const QUICK_ITEM_DOCS: Record<string, { child: string; pl: string; flag: string; rowFrom: Record<string, string> }> = {
  "Quotation": { child: "Quotation Item", pl: "selling_price_list", flag: "is_sales_item", rowFrom: {} },
  "Sales Order": { child: "Sales Order Item", pl: "selling_price_list", flag: "is_sales_item", rowFrom: { delivery_date: "delivery_date", warehouse: "set_warehouse" } },
  "Sales Invoice": { child: "Sales Invoice Item", pl: "selling_price_list", flag: "is_sales_item", rowFrom: { warehouse: "set_warehouse" } },
  "Purchase Order": { child: "Purchase Order Item", pl: "buying_price_list", flag: "is_purchase_item", rowFrom: { schedule_date: "schedule_date", warehouse: "set_warehouse" } },
  "Purchase Invoice": { child: "Purchase Invoice Item", pl: "buying_price_list", flag: "is_purchase_item", rowFrom: { warehouse: "set_warehouse" } },
};
export function QuickItemsPanel({ doc, onChange, canWrite }: { doc: Doc; onChange: (p: Record<string, unknown>) => void; canWrite: boolean }) {
  const cfg = QUICK_ITEM_DOCS[String(doc.doctype)] ?? QUICK_ITEM_DOCS["Quotation"]!;
  useScopeMetas(["Item", "Item Price", cfg.child]);
  const [q, setQ] = useState(""); const [qty, setQty] = useState("1"); const [paste, setPaste] = useState(""); const [hi, setHi] = useState(0);
  const qtyRef = useRef<HTMLInputElement>(null);
  const items = scopedList("Item").filter((i) => !n(i["disabled"]) && n(i[cfg.flag] ?? 1));
  const prices = scopedList("Item Price");
  const pl = String(doc[cfg.pl] ?? "");
  const matches = useMemo(() => { const s = q.toLowerCase(); return s ? items.filter((i) => i.name.toLowerCase().includes(s) || String(i["item_name"] ?? "").toLowerCase().includes(s)).slice(0, 8) : []; }, [q, items]);
  const preview = paste ? parseItemLines(paste, items, prices, pl) : [];
  if (n(doc.docstatus) !== 0 || !canWrite) return null;
  const meta = cachedMeta(cfg.child);
  const append = (lines: ReturnType<typeof parseItemLines>) => {
    const cur = Array.isArray(doc["items"]) ? (doc["items"] as Doc[]).filter((r) => r["item_code"]) : [];
    const add = lines.filter((l) => l.ok).map((l, i) => quotationRow(meta ? newChildRow(meta, doc, "items", cur.length + i + 1) : { name: `row-${Math.random().toString(36).slice(2, 12)}`, doctype: cfg.child, docstatus: 0, idx: cur.length + i + 1 }, items.find((x) => x.name === l.item_code)!, l))
      .map((r) => ({ ...r, ...Object.fromEntries(Object.entries(cfg.rowFrom).filter(([, f]) => doc[f]).map(([k, f]) => [k, doc[f]])) }));
    if (add.length) onChange({ items: [...cur, ...add] });
  };
  const pick = (it: Doc) => { append(parseItemLines(`${it.name}\t${qty || "1"}`, items, prices, pl)); setQ(""); setQty("1"); setHi(0); };
  const okCount = preview.filter((l) => l.ok).length;
  return (
    <Panel id="quick-items" title="Quick item entry" extra={<span className="ms-auto text-xs text-muted-foreground">Price List <b data-no-i18n>{pl || "—"}</b></span>}>
      <div className="mt-2 grid gap-3 md:grid-cols-2">
        <div>
          <div className="flex gap-2">
            <input className="field-input flex-1" placeholder="Search item code or name" value={q} aria-label="Search item" data-dp-quick-search
              onChange={(e) => { setQ(e.target.value); setHi(0); }}
              onKeyDown={(e) => { if (e.key === "ArrowDown") { e.preventDefault(); setHi((h) => Math.min(h + 1, matches.length - 1)); } else if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); } else if (e.key === "Tab" && matches.length && !e.shiftKey) { e.preventDefault(); qtyRef.current?.focus(); } else if (e.key === "Enter" && matches[hi]) { e.preventDefault(); pick(matches[hi]!); } }} />
            <input ref={qtyRef} className="field-input w-20" type="number" min="0" step="any" value={qty} aria-label="Qty" onChange={(e) => setQty(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && matches[hi]) { e.preventDefault(); pick(matches[hi]!); } }} />
          </div>
          {!!matches.length && <ul role="listbox" className="mt-1 divide-y divide-border rounded border border-border" data-dp-quick-matches>{matches.map((it, i) => {
            const p = prices.find((x) => x["item_code"] === it.name && x["price_list"] === pl);
            return <li key={it.name} role="option" aria-selected={i === hi}><button type="button" onMouseEnter={() => setHi(i)} onClick={() => pick(it)} className={`flex w-full gap-2 px-2 py-1 text-start text-sm ${i === hi ? "bg-accent" : ""}`} data-dp-quick-item={it.name}>
              <b data-no-i18n>{it.name}</b><span className="flex-1 truncate text-muted-foreground" data-no-i18n>{String(it["item_name"] ?? "")}</span>
              <span className="text-xs" data-no-i18n>{String(it["stock_uom"] ?? "")}</span><span className="tabular-nums text-xs" data-no-i18n>{p ? fmtCurrency(n(p["price_list_rate"])) : "—"}</span></button></li>; })}</ul>}
          <p className="mt-1 text-xs text-muted-foreground">↑ ↓ to choose, Tab to quantity, Enter to add. Rows land in the native Items table below, where rate, discount and UOM stay editable.</p>
        </div>
        <div>
          <textarea className="field-input h-24 w-full text-xs" style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }} placeholder={"ITEM-CODE<TAB>qty<TAB>uom\n…"} value={paste} onChange={(e) => setPaste(e.target.value)} aria-label="Paste rows" data-dp-quick-paste />
          {!!preview.length && <table className="mt-1 w-full text-xs" data-dp-quick-preview><tbody>{preview.map((l) => <tr key={l.line} className={l.ok ? "" : "text-destructive"} data-ok={l.ok ? 1 : 0}>
            <td className="pe-2" data-no-i18n>{l.line}</td><td data-no-i18n>{l.item_code}</td><td className="text-end tabular-nums" data-no-i18n>{l.qty}</td><td data-no-i18n>{l.uom}</td>
            <td className="text-end tabular-nums" data-no-i18n>{l.rate !== undefined ? fmtCurrency(l.rate) : ""}</td><td>{l.error ?? (l.rate === undefined ? "No price in this price list" : "")}</td></tr>)}</tbody></table>}
          {!!preview.length && <button type="button" className="btn-primary mt-1 text-xs" disabled={!okCount} onClick={() => { append(preview); setPaste(""); }} data-dp-quick-add>Add <span data-no-i18n>{okCount}</span> <span>rows</span></button>}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-3 text-xs" data-dp-quick-totals><span><span className="text-muted-foreground">Total Quantity</span> <b data-no-i18n>{num(n(doc["total_qty"]))}</b></span>
        <span><span className="text-muted-foreground">Net Total</span> <b data-no-i18n>{fmtCurrency(n(doc["net_total"]))}</b></span>
        <span><span className="text-muted-foreground">Grand Total</span> <b data-no-i18n>{fmtCurrency(n(doc["grand_total"]))}</b></span></div>
    </Panel>
  );
}

/* ---------- SC-I-02 / SC-I-09 Item 360 ---------- */
export function Item360Panel({ doc }: { doc: Doc }) {
  useScopeMetas(["Bin", "Stock Ledger Entry", "Batch", "Serial No", "Sales Order", "Sales Invoice", "Delivery Note", "Purchase Order", "Purchase Receipt", "Purchase Invoice", "Stock Entry", "Material Request"]);
  const x = item360(doc, currentUser());
  const total = x.bins.rows.reduce((t, b) => t + n(b["actual_qty"]), 0);
  // Stock value = posted Stock Ledger Entry value differences for this item (Core posting), not Bin, which seeds leave without stock_value.
  const led = stockLedger({ item: doc.name }, currentUser()); const value = led.rows.length ? led.value : null;
  const nav = useNavigate(); const isNew = !!doc["__islocal"];
  /** Creates a native draft with this item as its first row; the user completes and saves it on the original form. */
  const make = (dt: string, childDt: string, extra: Record<string, unknown> = {}) => {
    const m = cachedMeta(dt); const cm = cachedMeta(childDt); if (!m) return;
    const d = adapter.insert(m);
    const row = { ...(cm ? newChildRow(cm, d, "items", 1) : { name: `row-${Math.random().toString(36).slice(2, 12)}`, doctype: childDt, docstatus: 0, idx: 1 }), item_code: doc.name, item_name: doc["item_name"], uom: doc["stock_uom"], stock_uom: doc["stock_uom"], qty: 1 };
    adapter.update(dt, d.name, { ...extra, items: [row] });
    void nav({ to: "/app/$app/$doctype/$name", params: { app: "erpnext", doctype: slug(dt), name: d.name } });
  };
  const ACTIONS: [string, string, string, Record<string, unknown>][] = [["Material Request", "Material Request", "Material Request Item", { material_request_type: "Purchase" }], ["Stock Entry", "Stock Entry", "Stock Entry Detail", { stock_entry_type: "Material Transfer", purpose: "Material Transfer" }], ["Purchase Order", "Purchase Order", "Purchase Order Item", {}], ["Quotation", "Quotation", "Quotation Item", {}]];
  const groups: ["buying" | "selling" | "stock", string][] = [["buying", "Purchasing"], ["selling", "Selling"], ["stock", "Stock"]];
  return <Panel id="item-360" title="Item 360" extra={<>
    <span className="text-sm font-medium" data-no-i18n>{String(doc["item_name"] ?? doc.name)}</span>
    <span className="chip bg-muted text-xs" data-no-i18n>{String(doc["item_group"] ?? "")}</span><span className="chip bg-muted text-xs" data-no-i18n>{String(doc["stock_uom"] ?? "")}</span>
    {n(doc["has_batch_no"]) ? <span className="chip bg-muted text-xs">Has Batch No</span> : null}{n(doc["has_serial_no"]) ? <span className="chip bg-muted text-xs">Has Serial No</span> : null}
    <Link to="/pro/stock-ledger" search={{ item: doc.name } as never} className="btn-ghost ms-auto text-xs">Stock Ledger</Link>
    <Link to="/pro/stock-balance" search={{ q: doc.name } as never} className="btn-ghost text-xs">Stock Balance</Link></>}>
    <dl className="mt-2 flex flex-wrap gap-4 text-xs" data-dp-item-facts>
      <div><dt className="text-muted-foreground">Stock Qty</dt><dd className="text-base font-semibold tabular-nums" data-no-i18n>{num(total)} {String(doc["stock_uom"] ?? "")}</dd></div>
      <div><dt className="text-muted-foreground">Stock Value</dt><dd className="text-base font-semibold tabular-nums" data-no-i18n>{value === null ? "—" : fmtCurrency(value)}</dd></div>
      <div><dt className="text-muted-foreground">Valuation Rate</dt><dd className="text-base font-semibold tabular-nums" data-no-i18n>{fmtCurrency(n(doc["valuation_rate"]))}</dd></div>
      {n(doc["disabled"]) ? <div><dd className="chip bg-destructive/10 text-destructive">Disabled</dd></div> : null}
    </dl>
    {!isNew && !n(doc["disabled"]) && <div className="mt-2 flex flex-wrap gap-2" data-dp-item-actions>{ACTIONS.filter(([, dt]) => can(dt, "create")).map(([l, dt, c, e]) => <button key={dt} type="button" className="btn-ghost text-xs" onClick={() => make(dt, c, e)} data-dp-item-make={dt}>+ <span>{l}</span></button>)}</div>}
    <div className="mt-2 grid gap-4 md:grid-cols-2">
      <div><h3 className="text-xs font-semibold text-muted-foreground">Stock by warehouse</h3>
        {x.bins.status !== "ok" ? <SourceState status={x.bins.status} doctype="Bin" /> : !x.bins.rows.length ? <SourceState status="empty" /> :
          <table className="w-full text-sm" data-dp-item-bins><thead><tr className="text-xs text-muted-foreground"><th className="text-start">Warehouse</th><th className="text-end">Actual Qty</th><th className="text-end">Reserved Qty</th><th className="text-end">Projected Qty</th></tr></thead>
            <tbody>{x.bins.rows.map((b) => <tr key={b.name} className="border-t border-border"><td><DocA dt="Warehouse" name={String(b["warehouse"])} className="text-xs" /></td>
              <td className="text-end tabular-nums" data-no-i18n>{num(n(b["actual_qty"]))}</td><td className="text-end tabular-nums" data-no-i18n>{num(n(b["reserved_qty"]))}</td><td className={`text-end tabular-nums ${n(b["projected_qty"]) < 0 ? "text-destructive" : ""}`} data-no-i18n>{num(n(b["projected_qty"]))}</td></tr>)}
              <tr className="border-t border-border font-semibold"><td>Total</td><td className="text-end tabular-nums" data-no-i18n>{num(total)}</td><td /><td /></tr></tbody></table>}
        <h3 className="mt-3 text-xs font-semibold text-muted-foreground">Reorder levels</h3>
        {!x.reorder.length ? <p className="text-xs text-muted-foreground">No reorder levels set on this item.</p> : <ul className="text-xs" data-dp-item-reorder>{x.reorder.map((r, i) => {
          const bin = x.bins.rows.find((b) => b["warehouse"] === r["warehouse"]); const low = bin && n(bin["projected_qty"]) <= n(r["warehouse_reorder_level"]);
          return <li key={i} className="flex gap-2"><span className="flex-1" data-no-i18n>{String(r["warehouse"] ?? "")}</span><span>Re-order Level</span> <b data-no-i18n>{num(n(r["warehouse_reorder_level"]))}</b><span>Re-order Qty</span> <b data-no-i18n>{num(n(r["warehouse_reorder_qty"]))}</b>
            {low && <Link to="/app/$app/$doctype" params={{ app: "erpnext", doctype: "material_request" }} className="chip bg-warning/20">Below reorder level</Link>}</li>; })}</ul>}
        {(!!x.batches.length || !!x.serials.length) && <><h3 className="mt-3 text-xs font-semibold text-muted-foreground">Batches and serial numbers</h3>
          <div className="flex flex-wrap gap-1" data-dp-item-batches>{x.batches.map((b) => <DocA key={b.name} dt="Batch" name={b.name} className="chip bg-muted text-xs" />)}{x.serials.map((b) => <DocA key={b.name} dt="Serial No" name={b.name} className="chip bg-muted text-xs" />)}</div></>}
      </div>
      <div><h3 className="text-xs font-semibold text-muted-foreground">Recent movements</h3>
        {x.moves.status !== "ok" ? <SourceState status={x.moves.status} doctype="Stock Ledger Entry" /> : !x.moves.rows.length ? <SourceState status="empty" /> :
          <ul className="divide-y divide-border text-sm" data-dp-item-moves>{x.moves.rows.map((e) => <li key={e.name} className="flex gap-2 py-1"><span className="text-xs tabular-nums" data-no-i18n>{String(e["posting_date"])}</span>
            <DocA dt={String(e["voucher_type"])} name={String(e["voucher_no"])} className="flex-1 text-xs" /><span className="text-xs text-muted-foreground" data-no-i18n>{String(e["warehouse"])}</span>
            <span className={`tabular-nums ${n(e["actual_qty"]) < 0 ? "text-destructive" : "text-success-text"}`} data-no-i18n>{num(n(e["actual_qty"]))}</span></li>)}</ul>}
        <h3 className="mt-3 text-xs font-semibold text-muted-foreground">Related documents</h3>
        {!x.related.length ? <SourceState status="empty" /> : groups.map(([g, gl]) => { const list = x.related.filter((d) => d.group === g).slice(0, 8); return !list.length ? null : <div key={g} data-dp-item-related={g}>
          <p className="mt-2 text-[11px] font-semibold uppercase text-muted-foreground">{gl}</p>
          <ul className="divide-y divide-border text-sm">{list.map((d) => <li key={`${d.doctype}-${d.name}`} className="flex gap-2 py-1">
          <span className="w-28 truncate text-xs text-muted-foreground">{d.doctype}</span><DocA dt={d.doctype} name={d.name} className="flex-1 text-xs" /><span className="text-xs tabular-nums" data-no-i18n>{d.date}</span><span className="text-xs" data-no-i18n>{d.party}</span><span className="chip bg-muted text-[10px]">{d.status}</span></li>)}</ul></div>; })}
      </div>
    </div>
  </Panel>;
}

/* ---------- SC-I-05/06 Stock Entry ---------- */
export function StockEntryPanel({ doc }: { doc: Doc }) {
  useScopeMetas(["Stock Ledger Entry", "Bin"]); const ar = useLang() === "ar";
  const t = transferSummary(doc); const led = voucherLedger("Stock Entry", doc.name, currentUser());
  const isNew = !!doc["__islocal"]; const c = stockEntryContext(doc);
  const rd = stockReadiness(doc, currentUser(), can("Stock Entry", "submit", doc));
  return <Panel id="stock-op" title="Stock operation" extra={<><span className="chip bg-muted text-xs">{t.purpose || "—"}</span>
    <span className={`chip text-xs ${c.status === "Cancelled" ? "bg-destructive/10 text-destructive" : c.status === "Submitted" ? "bg-success/15" : "bg-warning/20"}`} data-dp-stock-status>{c.status}</span></>}>
    <dl className="mt-2 flex flex-wrap gap-4 text-xs" data-dp-stock-totals>
      <div><dt className="text-muted-foreground">Total Quantity</dt><dd className="font-semibold tabular-nums" data-no-i18n>{num(c.qty)}</dd></div>
      <div><dt className="text-muted-foreground">Total Outgoing Value</dt><dd className="font-semibold tabular-nums" data-no-i18n>{fmtCurrency(c.outgoing)}</dd></div>
      <div><dt className="text-muted-foreground">Total Incoming Value</dt><dd className="font-semibold tabular-nums" data-no-i18n>{fmtCurrency(c.incoming)}</dd></div>
      <div><dt className="text-muted-foreground">Value Difference</dt><dd className="font-semibold tabular-nums" data-no-i18n>{fmtCurrency(c.diff)}</dd></div>
    </dl>
    {!!c.links.length && <div className="mt-2 flex flex-wrap items-center gap-2 text-xs" data-dp-stock-sources><span className="text-muted-foreground">Source documents</span>{c.links.map((l) => <span key={l.doctype + l.name} className="chip bg-muted"><span>{l.doctype}</span> <DocA dt={l.doctype} name={l.name} /></span>)}</div>}
    {!!t.pairs.length && <ul className="mt-2 flex flex-wrap gap-2" data-dp-stock-pairs>{t.pairs.map((p, i) => <li key={i} className="chip bg-muted text-xs"><bdi data-no-i18n>{p.from || "—"}</bdi> → <bdi data-no-i18n>{p.to || "—"}</bdi> · <span data-no-i18n>{p.lines}</span> <span>lines</span> · <span data-no-i18n>{num(p.qty)}</span></li>)}</ul>}
    {(() => { const lines = stockEntryLines(doc); if (!lines.length) return null;
      return <table className="mt-2 w-full text-xs" data-dp-stock-lines>
        <thead><tr className="text-muted-foreground"><th className="text-start">#</th><th className="text-start">Item</th><th className="text-start">Source Warehouse</th><th className="text-start">Target Warehouse</th><th className="text-end">Qty</th><th className="text-start">UOM</th><th className="text-end">Conversion Factor</th><th className="text-start">Batch No</th><th className="text-start">Serial No</th></tr></thead>
        <tbody>{lines.map((x) => <tr key={x.idx} data-dp-stock-line={x.idx} className="border-t border-border">
          <td data-no-i18n>{x.idx}</td>
          <td><DocA dt="Item" name={x.item} /></td>
          <td data-no-i18n>{x.from || "—"}</td>
          <td data-no-i18n>{x.to || "—"}</td>
          <td className="text-end tabular-nums" data-no-i18n>{num(x.qty)}</td>
          <td data-no-i18n>{x.qtyUom || x.stockUom || "—"}</td>
          <td className="text-end tabular-nums" data-no-i18n>{x.qtyUom && x.stockUom && x.qtyUom !== x.stockUom ? x.factor : "—"}</td>
          <td>{x.batch ? <DocA dt="Batch" name={x.batch} className="text-xs" /> : "—"}</td>
          <td>{x.serials.length ? <span className="flex flex-wrap gap-1" data-dp-line-serials>{x.serials.map((sn) => <DocA key={sn} dt="Serial No" name={sn} className="chip bg-muted text-xs" />)}</span> : "—"}</td>
        </tr>)}</tbody>
      </table>; })()}
    {n(doc.docstatus) === 0 && PURPOSE_FIELDS[t.purpose] && <div className="mt-2 flex flex-wrap items-center gap-2 text-xs" data-dp-stock-focus><span className="text-muted-foreground">Fields for this purpose</span>{PURPOSE_FIELDS[t.purpose]!.map((f) => <span key={f} className="chip bg-primary/10">{f}</span>)}</div>}
    {n(doc.docstatus) === 0 && (() => { const av = stockAvailability(doc, currentUser()); if (av.status !== "ok" || !av.rows.length) return null;
      return <table className="mt-2 w-full text-xs" data-dp-stock-avail><thead><tr className="text-muted-foreground"><th className="text-start">Item</th><th className="text-start">Source Warehouse</th><th className="text-end">Required</th><th className="text-end">Actual Qty</th><th className="text-start" /></tr></thead>
        <tbody>{av.rows.map((x) => <tr key={x.item + x.warehouse} className="border-t border-border" data-dp-avail-row={x.short ? "short" : "ok"}><td><DocA dt="Item" name={x.item} /></td><td data-no-i18n>{x.warehouse}</td><td className="text-end tabular-nums" data-no-i18n>{num(x.qty)}</td><td className="text-end tabular-nums" data-no-i18n>{num(x.have)}</td>
          <td>{x.short ? <span className="text-destructive"><span>Insufficient stock</span> <span data-no-i18n>({num(x.short)})</span></span> : <span className="text-success-text">✓</span>}</td></tr>)}</tbody></table>; })()}
    {n(doc.docstatus) === 0 && rd.lines > 0 && (rd.blockers.length ? <div className="mt-2 rounded border border-destructive/40 bg-destructive/5 p-2 text-xs" data-dp-stock-blocked>
      <p className="font-semibold text-destructive">✕ <span data-no-i18n>{ar ? "لا يمكن الاعتماد بعد" : "Cannot submit yet"}</span></p>
      <ul className="mt-1 space-y-1" data-dp-stock-issues>{rd.blockers.map((b, i) => <li key={i} data-dp-blocker={b.kind}>
        {b.idx ? <span data-no-i18n>#{b.idx} </span> : null}{b.item ? <bdi data-no-i18n>{b.item} </bdi> : null}<span className="text-destructive">{b.msg}</span>
        {b.kind === "shortage" && <> · <span>Required</span> <b data-no-i18n>{num(b.required!)}</b> · <span>Available</span> <b data-no-i18n>{num(b.available!)}</b> · <span>Shortfall</span> <b className="text-destructive" data-no-i18n>{num(b.shortfall!)}</b></>}
        <div className="text-muted-foreground"><span>Next step</span>: <span>{b.next}</span></div></li>)}</ul></div>
      : rd.unknownStock ? <p className="mt-2 text-xs text-warning-text" data-dp-stock-unknown>Source stock cannot be checked with your permissions; native validation decides on submit.</p>
      : <p className="mt-2 text-xs text-success-text" data-dp-stock-ok>✓ <span>Ready to submit</span></p>)}
    {!isNew && n(doc.docstatus) === 1 && <div className="mt-3"><h3 className="text-xs font-semibold text-muted-foreground">Stock ledger entries</h3>
      {led.status !== "ok" ? <SourceState status={led.status} doctype="Stock Ledger Entry" /> : !led.rows.length ? <SourceState status="empty" /> :
        <table className="w-full text-sm" data-dp-stock-sle><tbody>{led.rows.map((e) => <tr key={e.name} className="border-t border-border"><td><DocA dt="Item" name={String(e["item_code"])} className="text-xs" /></td><td className="text-xs" data-no-i18n>{String(e["warehouse"])}</td>
          <td className={`text-end tabular-nums ${n(e["actual_qty"]) < 0 ? "text-destructive" : "text-success-text"}`} data-no-i18n>{num(n(e["actual_qty"]))}</td><td className="text-end tabular-nums" data-no-i18n>{num(n(e["qty_after_transaction"]))}</td><td className="text-end tabular-nums" data-no-i18n>{fmtCurrency(n(e["stock_value_difference"]))}</td></tr>)}</tbody></table>}
      <Link to="/pro/stock-ledger" search={{ voucher: "Stock Entry" } as never} className="text-xs hover:underline">Stock Ledger</Link></div>}
    {n(doc.docstatus) === 0 && !isNew && rd.ready && <p className="mt-2 text-xs" data-dp-stock-next><span className="text-muted-foreground">Next step</span> · <span>Submit</span> <span className="text-muted-foreground">(native Submit button above)</span></p>}
    <p className="mt-2 text-xs text-muted-foreground">Native validation runs again on submit; this summary does not post anything.</p>
  </Panel>;
}

/* ---------- SC-I-07 Stock Reconciliation ---------- */
export function StockReconPanel({ doc }: { doc: Doc }) {
  const rows = reconVariance(doc);
  const totQ = rows.reduce((t, r) => t + r.diffQty, 0); const totA = rows.reduce((t, r) => t + r.diffAmount, 0);
  return <Panel id="stock-recon" title="Count variance" extra={<span className="ms-auto text-xs"><span className="text-muted-foreground">Quantity Difference</span> <b data-no-i18n>{num(totQ)}</b> · <span className="text-muted-foreground">Amount Difference</span> <b data-no-i18n>{fmtCurrency(totA)}</b></span>}>
    {!rows.length ? <SourceState status="empty" /> : <table className="mt-2 w-full text-sm" data-dp-recon><thead><tr className="text-xs text-muted-foreground"><th className="text-start">#</th><th className="text-start">Item</th><th className="text-start">Warehouse</th><th className="text-end">System qty</th><th className="text-end">Counted qty</th><th className="text-end">Quantity Difference</th><th className="text-end">Amount Difference</th></tr></thead>
      <tbody>{rows.map((r) => <tr key={r.idx} className="border-t border-border" data-dp-recon-row={r.item}><td data-no-i18n>{r.idx}</td><td><DocA dt="Item" name={r.item} className="text-xs" /></td><td className="text-xs" data-no-i18n>{r.warehouse}</td>
        <td className="text-end tabular-nums" data-no-i18n>{num(r.system)}</td><td className="text-end tabular-nums" data-no-i18n>{num(r.counted)}</td>
        <td className={`text-end tabular-nums ${r.diffQty < 0 ? "text-destructive" : r.diffQty > 0 ? "text-success-text" : ""}`} data-no-i18n>{num(r.diffQty)}</td><td className="text-end tabular-nums" data-no-i18n>{fmtCurrency(r.diffAmount)}</td></tr>)}</tbody></table>}
    <p className="mt-2 text-xs text-muted-foreground">System qty is the native Current Qty; after submit the posted differences are shown.</p>
  </Panel>;
}

/* ---------- SC-I-09 Batch / Serial No ---------- */
export function BatchSerialPanel({ doctype, doc }: { doctype: "Batch" | "Serial No"; doc: Doc }) {
  useScopeMetas(["Stock Ledger Entry", "Stock Entry", "Purchase Receipt", "Delivery Note"]);
  const item = String(doc[doctype === "Batch" ? "item" : "item_code"] ?? "");
  const history = trackingMovements(doctype, doc, currentUser());
  const moves = history.rows;
  return <Panel id="batch-serial" title="Movement history" extra={<><span className="text-xs text-muted-foreground">Item</span><DocA dt="Item" name={item} className="text-xs" />
    {doctype === "Batch" && doc["expiry_date"] ? <span className={`chip text-xs ${String(doc["expiry_date"]) < new Date().toISOString().slice(0, 10) ? "bg-destructive/10 text-destructive" : "bg-muted"}`}><span>Expiry Date</span> <span data-no-i18n>{String(doc["expiry_date"])}</span></span> : null}
    {doctype === "Serial No" && doc["warehouse"] ? <span className="chip bg-muted text-xs" data-no-i18n>{String(doc["warehouse"])}</span> : null}</>}>
    {history.status !== "ok" ? <SourceState status={history.status} doctype="Stock Ledger Entry" /> : !moves.length ? <p className="mt-2 text-xs text-muted-foreground">{doctype === "Batch" ? "No posted movements reference this batch directly." : "No posted movements reference this serial number directly."}</p> :
      <ul className="mt-2 divide-y divide-border text-sm" data-dp-bs-moves>{moves.map((e) => <li key={e.name} className="flex gap-2 py-1"><span className="text-xs" data-no-i18n>{String(e["posting_date"])}</span><DocA dt={String(e["voucher_type"])} name={String(e["voucher_no"])} className="flex-1 text-xs" /><span className="text-xs" data-no-i18n>{String(e["warehouse"])}</span><span className="tabular-nums" data-no-i18n>{num(n(e["actual_qty"]))}</span></li>)}</ul>}
  </Panel>;
}

/* ---------- SC-A-02..07 Asset 360 ---------- */
export { ConnectedAsset360 as Asset360Panel } from "./Asset360";

/** Shown on Asset forms only when the form needs the Purchase Invoice link resolved (kept for adapter readers). */
export const assetSourceInvoice = (a: Doc) => adapter.get("Purchase Invoice", String(a["purchase_invoice"] ?? ""));
export const docHref = (dt: string, name: string) => `/app/erpnext/${slug(dt)}/${encodeURIComponent(name)}`;
