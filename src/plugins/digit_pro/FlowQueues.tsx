/** Phase 2 document-flow queues, fulfilment progress and supplier quote comparison for Selling / Purchasing. */
import { Link } from "@tanstack/react-router";
import { masterName } from "@/lib/coreShared/masterName";
import { useState } from "react";
import { toast } from "sonner";
import { useScopeMetas } from "@/lib/scope";
import { t as tr } from "@/i18n";
import { awardPlan, createAwardOrders, type AwardResult } from "./award";
import { fmtCurrency, fmtDate } from "@/lib/format";
import { can, slug } from "./finance";
import { SourceState } from "./ProFrame";
import { flowStages, partialOrders, quoteComparison, type StageDef } from "./flowStages";
import { Meter } from "@/components/enterprise/kit";
import { openCreate } from "@/components/enterprise/CreatePanel";

const CREATE_LABEL: Record<string, string> = { "Sales Order": "Create Sales Order", "Pick List": "Create Pick List", "Delivery Note": "Create Delivery Note", "Packing Slip": "Create Packing Slip", "Delivery Trip": "Create Delivery Trip" };

export function FlowQueues({ defs, company, currency, user, title }: { defs: StageDef[]; company: string; currency: string; user: string; title: string }) {
  const stages = flowStages(defs, company, user);
  return <section className="dp-card mt-4" data-dp-flow>
    <h2 className="font-semibold">{title}</h2>
    <ol className="mt-3 grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
      {stages.map((s, i) => {
        const body = <>
          <span className="text-xs text-muted-foreground"><span data-no-i18n>{i + 1}.</span> {s.label}</span>
          {s.status !== "ok" ? <SourceState status={s.status} doctype={s.doctype} /> : <>
            <b className={`text-xl tabular-nums ${s.id.includes("overdue") && s.count ? "text-destructive" : ""}`} data-no-i18n>{s.count}</b>
            {s.amount && s.count > 0 && <span className="text-xs tabular-nums" data-no-i18n>{fmtCurrency(s.total, currency)}</span>}
            {s.count > 0 && <span className="mt-1 text-xs text-primary">→ {s.next}</span>}
            {s.count === 0 && <span className="mt-1 text-xs text-muted-foreground" data-dp-stage-empty>{s.empty ?? "Nothing at this step right now"}</span>}</>}
        </>;
        // owner notes B-06: an empty step says why and offers its first document instead of a silent zero
        if (s.status === "ok" && s.count === 0) return <li key={s.id} data-dp-stage={s.id} data-dp-stage-zero>
          <div className="flex h-full flex-col gap-0.5 rounded-md border border-dashed border-border p-2">{body}
            {s.create && can(s.create, "create") && <button type="button" className="btn-ghost mt-auto self-start px-2 py-0.5 text-xs text-primary" onClick={() => openCreate(s.create!)} data-dp-stage-create={s.create}>+ {CREATE_LABEL[s.create] ?? `Create ${s.create}`}</button>}</div></li>;
        return <li key={s.id} data-dp-stage={s.id}>{s.status === "ok"
          ? <Link to="/app/$app/$doctype" params={{ app: "erpnext", doctype: slug(s.doctype) }} search={{ filters: JSON.stringify(s.filters) } as never} className="flex h-full flex-col gap-0.5 rounded-md border border-border p-2 hover:ring-1 hover:ring-primary">{body}</Link>
          : <div className="flex h-full flex-col gap-0.5 rounded-md border border-border p-2">{body}</div>}</li>;
      })}
    </ol>
    <p className="mt-2 text-xs text-muted-foreground">Each step opens the native list with the same filters; next actions run from the native document.</p>
  </section>;
}

export function Fulfilment({ doctype, company, currency, user }: { doctype: "Sales Order" | "Purchase Order"; company: string; currency: string; user: string }) {
  const f = partialOrders(doctype, company, user);
  const bar = (v: number) => <span className="inline-block w-16 align-middle"><Meter size="sm" value={Math.min(100, v)} max={100} /></span>;
  return <section className="dp-card mt-4" data-dp-fulfil>
    <h2 className="font-semibold">{doctype === "Sales Order" ? "Order fulfilment" : "Order receipt progress"}</h2>
    {f.status !== "ok" ? <SourceState status={f.status} doctype={doctype} /> : !f.rows.length ? <SourceState status="empty" /> :
      <div className="mt-2 overflow-x-auto"><table className="w-full text-sm [&_td]:whitespace-nowrap [&_td]:px-1"><thead className="text-xs text-muted-foreground"><tr>
        <th className="text-start">{doctype}</th><th className="text-start">{doctype === "Sales Order" ? "Customer" : "Supplier"}</th><th className="text-start">Due</th>
        <th className="text-start">{doctype === "Sales Order" ? "Delivered" : "Received"}</th><th className="text-start">Billed</th><th className="text-end">Grand Total</th></tr></thead>
        <tbody className="divide-y divide-border">{f.rows.map((r) => <tr key={r.name}>
          <td className="py-1.5"><Link to="/app/$app/$doctype/$name" params={{ app: "erpnext", doctype: slug(doctype), name: r.name }} className="font-medium hover:underline" data-no-i18n>{r.name}</Link></td>
          <td className="truncate" data-no-i18n title={r.customer}>{masterName(doctype === "Sales Order" ? "Customer" : "Supplier", r.customer)}</td><td className="tabular-nums" data-no-i18n>{r.date ? fmtDate(r.date) : "—"}</td>
          <td>{bar(r.delivered)} <span className="text-xs tabular-nums" data-no-i18n>{r.delivered}%</span></td>
          <td>{bar(r.billed)} <span className="text-xs tabular-nums" data-no-i18n>{r.billed}%</span></td>
          <td className="text-end tabular-nums" data-no-i18n>{fmtCurrency(r.total, currency)}</td></tr>)}</tbody></table></div>}
  </section>;
}

const AWARD_METAS = ["Supplier Quotation", "Supplier Quotation Item", "Purchase Order", "Purchase Order Item", "Pricing Rule Detail", "Purchase Taxes and Charges", "Item Wise Tax Detail", "Payment Schedule"];
export function QuoteCompare({ company, currency, user }: { company: string; currency: string; user: string }) {
  useScopeMetas(AWARD_METAS);
  const q = quoteComparison(company, user);
  const [pick, setPick] = useState<Record<string, string>>({});
  const [made, setMade] = useState<AwardResult | null>(null);
  const shown = q.items.slice(0, 8);
  // PU3-b: award per line — default winner is the lowest comparable rate, else the first quotation
  const winner = (g: (typeof shown)[number]) => pick[g.item] ?? (g.rows.find((r) => r.best) ?? g.rows[0])?.sq ?? "";
  const canAward = can("Purchase Order", "create", undefined, user) && shown.length > 0;
  const award = () => {
    const r = createAwardOrders(awardPlan(shown.map((g) => ({ item: g.item, sq: winner(g) })).filter((a) => a.sq)), undefined, user);
    setMade(r);
    if (r.errors.length) toast.error(r.errors.map((x) => tr(x)).join("\n")); else toast.success(tr("Purchase orders created as drafts"));
  };
  return <section className="dp-card mt-4" data-dp-quotes>
    <h2 className="font-semibold">Supplier quotation comparison</h2>
    <p className="text-xs text-muted-foreground">Actual quoted rate, quantity and delivery date per item. Lowest rate is marked only between quotations in the same unit and currency. No weighted score.</p>
    {q.status !== "ok" ? <SourceState status={q.status} doctype="Supplier Quotation" /> : !q.items.length ? <SourceState status="empty" doctype="Supplier Quotation" /> : <>
      <div className="mt-2 overflow-x-auto"><table className="w-full text-sm [&_td]:whitespace-nowrap [&_td]:px-1"><thead className="text-xs text-muted-foreground"><tr>
        {canAward && <th className="whitespace-nowrap pe-1 text-start">Award</th>}<th className="text-start">Item</th><th className="text-start">Supplier</th><th className="text-start">Supplier Quotation</th><th className="text-end">Rate</th><th className="text-end">Quantity</th><th className="text-start">Delivery</th></tr></thead>
        <tbody className="divide-y divide-border">{shown.flatMap((g) => g.rows.map((r, i) => <tr key={`${g.item}-${r.sq}-${i}`} data-dp-best={r.best || undefined} data-dp-award-row={`${g.item}:${r.sq}`}>
          {canAward && <td><input type="radio" name={`award-${g.item}`} aria-label={`${tr("Award")} ${g.item} · ${r.supplier}`} checked={winner(g) === r.sq} onChange={() => setPick({ ...pick, [g.item]: r.sq })} /></td>}
          <td className="py-1.5" data-no-i18n>{i === 0 ? g.item : ""}</td><td data-no-i18n>{r.supplier}</td>
          <td><Link to="/app/$app/$doctype/$name" params={{ app: "erpnext", doctype: "supplier_quotation", name: r.sq }} className="hover:underline" data-no-i18n>{r.sq}</Link></td>
          <td className="text-end tabular-nums"><span data-no-i18n>{fmtCurrency(r.rate, r.currency || currency)}</span>{r.best && <span className="chip ms-1 bg-success/15 text-xs">Lowest</span>}{!r.comparable && g.rows.length > 1 && <span className="chip ms-1 bg-muted text-xs" title="Different unit or currency">Not comparable</span>}</td>
          <td className="text-end tabular-nums" data-no-i18n>{r.qty} {r.uom}</td><td className="tabular-nums" data-no-i18n>{r.date || "—"}</td></tr>))}</tbody></table></div>
      {canAward && <div className="mt-2 flex flex-wrap items-center gap-2">
        <button type="button" className="btn-primary" onClick={award} data-dp-award-create>Create purchase orders for the awarded lines</button>
        <span className="text-xs text-muted-foreground">One draft purchase order per winning supplier; approve and submit it as usual.</span>
      </div>}
      {made && made.created.length > 0 && <ul className="mt-2 grid gap-1 text-xs" data-dp-award-created={made.created.length}>{made.created.map((c) => <li key={c.name}>
        <Link to="/app/$app/$doctype/$name" params={{ app: "erpnext", doctype: "purchase_order", name: c.name }} className="font-medium text-primary hover:underline" data-no-i18n>{c.name}</Link> · <span data-no-i18n>{c.supplier}</span> · <span data-no-i18n>{c.lines}</span> {tr(c.lines === 1 ? "line" : "lines")}</li>)}</ul>}
    </>}
  </section>;
}
