// @ts-nocheck -- DIGIT Pro/HR apps are switched off in the merged site build; their original /pro/* and /hr/* app routes are not in this route tree (re-enabling the app needs those routes, then remove this line)
/**
 * DIGIT Pro — SC-S-04 document lineage strip (Quotation / Sales Order / Delivery Note / Sales Invoice / Payment Entry)
 * and SC-S-02 Customer 360 header. Rendered above the full native form only in the DIGIT Pro experience; read-only,
 * every value comes from Core records and every chip opens the native document. Creation stays on the native Create menu.
 */
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import type { Doc } from "@/lib/adapter";
import { fmtCurrency, fmtDate } from "@/lib/format";
import { currentUser } from "@/lib/session";
import { useScopeMetas } from "@/lib/scope";
import { useLang } from "@/i18n";
import { BUYING } from "./docFlow";
import { slug, todayIso } from "./finance";
import { SourceState } from "./ProFrame";
import { customer360 } from "./salesFlow";
import { invoiceBanner, lineage, nextStep, partyOf, purchasePosition, salesPosition, quotationChecks, quotationComparison, revisionDiff, REVISION_FIELDS, REVISION_SPECS, specFor, supplier360, type FlowDoc } from "./docFlow";
import { QuoteBasisReview } from "./QuoteBasisReview";

const n = (v: unknown) => Number(v) || 0;
const tone = (d: FlowDoc) => d.docstatus === 2 ? "bg-destructive/10 text-destructive" : d.docstatus === 0 ? "bg-muted" : "bg-success/15 text-success-text";
const DocChip = ({ d, current }: { d: FlowDoc; current?: boolean }) => (
  <Link to="/app/$app/$doctype/$name" params={{ app: "erpnext", doctype: slug(d.doctype), name: d.name }}
    className={`block rounded-md border px-2 py-1 text-xs hover:bg-accent ${current ? "border-primary ring-1 ring-primary" : "border-border"}`} data-dp-flow-doc={d.name} aria-current={current ? "page" : undefined}>
    <bdi className="font-medium" data-no-i18n>{d.name}</bdi>
    <span className="mt-0.5 flex items-center gap-1"><span className={`chip px-1 py-0 text-[10px] ${tone(d)}`}>{d.docstatus === 0 ? "Draft" : d.docstatus === 2 ? "Cancelled" : d.status || "Submitted"}</span>{d.isReturn && d.status !== "Return" && <span className="chip bg-warning/20 px-1 py-0 text-[10px]" data-dp-flow-return>Return</span>}
      <span className="tabular-nums text-muted-foreground" data-no-i18n>{fmtCurrency(d.total)}</span></span>
  </Link>
);

export function DocFlowPanel({ doctype, doc }: { doctype: string; doc: Doc }) {
  const spec = specFor(doctype);
  useScopeMetas(spec?.stages ?? []);
  if (!spec) return null;
  const stages = lineage(spec, doctype, doc.name, currentUser());
  const next = nextStep(doctype, doc);
  const pct = (f: string, label: string) => doc.docstatus === 1 && doc[f] !== undefined && <span className="chip inline-flex gap-1 bg-muted text-xs" data-dp-per={f}><span>{label}</span><span data-no-i18n>{n(doc[f])}%</span></span>;
  const isInv = doctype === "Sales Invoice" || doctype === "Purchase Invoice";
  const ret = n(doc["is_return"]) ? String(doc["return_against"] ?? "") : "";
  return (
    <section className="panel mt-4 p-4" data-dp-sales-flow={spec.id === "selling" ? "" : undefined} data-dp-doc-flow={spec.id} aria-label="Document flow">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-sm font-semibold">Document flow</h2>
        {["Sales Order", "Purchase Order", "Material Request"].includes(doctype) && pct(doctype === "Material Request" ? "per_ordered" : doctype === "Sales Order" ? "per_delivered" : "per_received", doctype === "Material Request" ? "Order progress" : doctype === "Sales Order" ? "Delivered" : "Receipt progress")}
        {["Sales Order", "Delivery Note", "Purchase Order", "Purchase Receipt"].includes(doctype) && pct("per_billed", "Billed")}
        {isInv && doc.docstatus === 1 && <span className={`chip inline-flex gap-1 text-xs ${n(doc["outstanding_amount"]) > 0 ? "bg-warning/20" : "bg-success/15 text-success-text"}`}><span>Outstanding</span><span data-no-i18n>{fmtCurrency(n(doc["outstanding_amount"]))}</span></span>}
        {doc.docstatus === 2 && <span className="chip bg-destructive/10 text-xs text-destructive" data-dp-cancelled>Cancelled — kept for audit</span>}
        {ret && <span className="chip inline-flex gap-1 bg-warning/20 text-xs" data-dp-return-of={ret}><span>Return against</span>
          <Link to="/app/$app/$doctype/$name" params={{ app: "erpnext", doctype: slug(doctype), name: ret }} className="underline" data-no-i18n>{ret}</Link></span>}
        {next && <span className="ms-auto text-xs" data-dp-next-step={next}><span className="text-muted-foreground">Next step</span>: <b>{next}</b> <span className="text-muted-foreground">{next === "Submit" ? "" : "(Create menu)"}</span></span>}
      </div>
      <ol className={`mt-3 grid gap-2 grid-cols-2 sm:grid-cols-4 ${spec.stages.length > 5 ? "lg:grid-cols-7" : "lg:grid-cols-5"}`} data-dp-flow-stages>
        {stages.map((s) => (
          <li key={s.doctype} className="min-w-0" data-dp-stage={s.doctype}>
            <div className="mb-1 text-[11px] text-muted-foreground">{s.doctype}</div>
            {s.status !== "ok" ? <SourceState status={s.status} doctype={s.doctype} /> :
              !s.docs.length ? <div className="rounded-md border border-dashed border-border px-2 py-2 text-xs text-muted-foreground" data-dp-stage-empty>—</div> :
              <div className="space-y-1">{s.docs.slice(0, 4).map((d) => <DocChip key={d.name} d={d} current={d.doctype === doctype && d.name === doc.name} />)}
                {s.docs.length > 4 && <span className="text-[11px] text-muted-foreground" data-no-i18n>+{s.docs.length - 4}</span>}</div>}
          </li>
        ))}
      </ol>
    </section>
  );
}
export const SalesFlowPanel = DocFlowPanel;

/** SC-P-06/07/08 — ordered / received / returned / billed per item from submitted Core rows. Read-only diagnostic. */
export function PurchasePositionPanel({ doctype, doc }: { doctype: string; doc: Doc }) {
  const selling = ["Sales Order", "Delivery Note", "Sales Invoice"].includes(doctype);
  useScopeMetas(selling ? ["Sales Order", "Delivery Note", "Sales Invoice"] : ["Purchase Order", "Purchase Receipt", "Purchase Invoice"]);
  const p = (selling ? salesPosition : purchasePosition)(doctype, doc, currentUser());
  if (!p.rows.length) return null;
  return (
    <section className="panel mt-4 p-4" data-dp-purchase-position={selling ? undefined : ""} data-dp-sales-position={selling ? "" : undefined} aria-label="Quantity position">
      <div className="flex flex-wrap items-center gap-2"><h2 className="text-sm font-semibold">Quantity position</h2>
        <span className="text-xs text-muted-foreground">Read-only comparison of submitted documents — native validation decides what can be posted.</span></div>
      {!p.orders.length && <p className="mt-2 text-xs text-muted-foreground" data-dp-no-po>{selling ? "No source Sales Order on this document." : "No source Purchase Order on this document."}</p>}
      {p.uomMismatch.length > 0 && <p className="mt-2 text-xs text-destructive" data-dp-uom-mismatch>Unit differs from the order for: <span data-no-i18n>{p.uomMismatch.join(", ")}</span></p>}
      <div className="mt-2 overflow-x-auto"><table className="w-full text-xs">
        <thead><tr className="text-muted-foreground"><th className="py-1 text-start">Item</th><th className="text-start">UOM</th><th className="text-end">Ordered</th><th className="text-end">{selling ? "Delivered qty" : "Received qty"}</th><th className="text-end">Returned qty</th><th className="text-end">Billed qty</th><th className="text-end">{selling ? "Pending delivery" : "Pending receipt"}</th><th className="text-end">Pending billing</th></tr></thead>
        <tbody>{p.rows.map((r) => { const pr = Math.max(0, r.ordered - r.received + r.returned), pb = Math.max(0, r.received - r.returned - r.billed);
          return <tr key={r.item} className="border-t border-border" data-dp-pos-row={r.item}><td className="py-1"><bdi data-no-i18n>{r.item}</bdi></td><td data-no-i18n>{r.uom}</td>
            {[r.ordered, r.received, r.returned, r.billed].map((v, i) => <td key={i} className="text-end tabular-nums" data-no-i18n>{v}</td>)}
            <td className={`text-end tabular-nums ${pr ? "font-semibold text-destructive" : ""}`} data-dp-pending-receipt={pr} data-no-i18n>{pr}</td>
            <td className={`text-end tabular-nums ${pb ? "font-semibold text-destructive" : ""}`} data-dp-pending-billing={pb} data-no-i18n>{pb}</td></tr>; })}</tbody>
      </table></div>
    </section>
  );
}

export function Supplier360Panel({ doc }: { doc: Doc }) {
  useScopeMetas(BUYING.stages);
  const s = supplier360(doc.name, todayIso(), currentUser());
  const m = (v: number) => fmtCurrency(v, String(doc["default_currency"] ?? "") || undefined);
  const card = (k: string, label: string, value: string, sub?: React.ReactNode, warn = false) => (
    <div className="dp-card" data-dp-s360={k}><p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-1 text-lg font-semibold tabular-nums ${warn ? "text-destructive" : ""}`} data-no-i18n>{value}</p>{sub && <p className="text-xs text-muted-foreground">{sub}</p>}</div>
  );
  const list = (dt: string, extra: Record<string, string> = {}) => ({ to: "/app/$app/$doctype" as const, params: { app: "erpnext", doctype: slug(dt) }, search: { supplier: doc.name, ...extra } as never });
  return (
    <section className="panel mt-4 p-4" data-dp-supplier-360 aria-label="Supplier 360">
      <div className="flex flex-wrap items-center gap-2"><h2 className="text-sm font-semibold">Supplier 360</h2>
        <span className="ms-auto flex flex-wrap gap-1">
          <Link to="/pro/payables" search={{ party: doc.name } as never} className="btn-ghost py-0.5 text-xs">Accounts Payable</Link>
          <Link {...list("Purchase Order")} className="btn-ghost py-0.5 text-xs">Purchase Orders</Link>
          <Link {...list("Purchase Invoice")} className="btn-ghost py-0.5 text-xs">Purchase Invoices</Link>
        </span></div>
      {s.status !== "ok" ? <SourceState status={s.status} doctype="Purchase Invoice" /> : <>
        <div className="mt-3 grid gap-3 grid-cols-2 md:grid-cols-4">
          {card("outstanding", "Payable", m(s.invoices.outstanding), <><span>Unpaid invoices</span> <span data-no-i18n>{s.invoices.unpaid}</span> · <span>Overdue</span> <span data-no-i18n>{s.invoices.overdue}</span></>, s.invoices.overdue > 0)}
          {card("orders", "Open orders", s.orders.status === "ok" ? String(s.orders.open) : "—", <><span>To Receive</span> <span data-no-i18n>{s.orders.toReceive}</span> · <span>To Bill</span> <span data-no-i18n>{s.orders.toBill}</span></>)}
          {card("receipts", "Receipts to bill", s.receipts.status === "ok" ? String(s.receipts.toBill) : "—", <><span>Completed</span> <span data-no-i18n>{s.receipts.completed}</span> · <span>Returns</span> <span data-no-i18n>{s.receipts.returns}</span></>)}
          {card("payments", "Payments made", s.payments.status === "ok" ? m(s.payments.paid) : "—", <><span>Payment entries</span> <span data-no-i18n>{s.payments.count}</span> · <span>Debit notes</span> <span data-no-i18n>{s.invoices.debitNotes}</span></>)}
        </div>
        {s.orders.byStatus.length > 0 && <div className="mt-3 flex flex-wrap gap-1" data-dp-s360-status>{s.orders.byStatus.map((b) =>
          <Link key={b.status} {...list("Purchase Order", { status: b.status })} className="chip inline-flex gap-1 bg-muted text-xs hover:bg-accent"><span>{b.status}</span><span data-no-i18n>{b.count}</span></Link>)}</div>}
        {s.recent.length > 0 && <div className="mt-3 flex flex-wrap gap-2" data-dp-s360-recent>{s.recent.map((d) => <div key={d.doctype + d.name} className="w-44"><div className="text-[11px] text-muted-foreground">{d.doctype}</div><DocChip d={d} /></div>)}</div>}
      </>}
    </section>
  );
}

/** SC-P-03..05 — Supplier Quotations received for this Material Request / RFQ. Sorted by item then rate; no scoring. */
export function QuotationComparePanel({ doctype, doc }: { doctype: "Material Request" | "Request for Quotation"; doc: Doc }) {
  useScopeMetas(["Request for Quotation", "Supplier Quotation"]);
  const c = quotationComparison(doctype, doc.name, currentUser());
  return (
    <section className="panel mt-4 p-4" data-dp-quote-compare aria-label="Supplier quotation comparison">
      <div className="flex flex-wrap items-center gap-2"><h2 className="text-sm font-semibold">Supplier quotation comparison</h2>
        <span className="text-xs text-muted-foreground">Values as quoted; choosing a supplier stays your decision.</span></div>
      {c.status !== "ok" ? <SourceState status={c.status} doctype="Supplier Quotation" /> : !c.rows.length ? <p className="mt-2 text-xs text-muted-foreground" data-dp-no-quotes>No supplier quotations received yet.</p> :
        <div className="mt-2 overflow-x-auto"><table className="w-full text-xs">
          <thead><tr className="text-muted-foreground"><th className="py-1 text-start">Item</th><th className="text-start">Supplier</th><th className="text-start">Supplier Quotation</th><th className="text-end">Qty</th><th className="text-start">UOM</th><th className="text-end">Rate</th><th className="text-end">Amount</th><th className="text-start">Expected Delivery Date</th><th className="text-start">Taxes and Charges</th></tr></thead>
          <tbody>{c.rows.map((r, i) => <tr key={i} className="border-t border-border" data-dp-quote-row={r.quotation}>
            <td className="py-1"><bdi data-no-i18n>{r.item}</bdi></td><td data-no-i18n>{r.supplier}</td>
            <td><Link to="/app/$app/$doctype/$name" params={{ app: "erpnext", doctype: "supplier_quotation", name: r.quotation }} className="underline" data-no-i18n>{r.quotation}</Link>{r.docstatus === 0 && <span className="chip ms-1 bg-muted px-1 text-[10px]">Draft</span>}</td>
            <td className="text-end tabular-nums" data-no-i18n>{r.qty}</td><td data-no-i18n>{r.uom}</td>
            <td className="text-end tabular-nums" data-no-i18n>{fmtCurrency(r.rate, r.currency || undefined)}</td><td className="text-end tabular-nums" data-no-i18n>{fmtCurrency(r.amount, r.currency || undefined)}</td>
            <td data-no-i18n>{r.delivery || "—"}</td><td data-no-i18n>{r.taxes || "—"}</td></tr>)}</tbody>
        </table></div>}
      {c.status === "ok" && c.rows.length > 0 && <QuoteBasisReview rows={c.rows} />}
    </section>
  );
}

/** SC-S-03 — Quotation guidance: customer context + readiness checks. Native item/UOM/rate/tax rules still run in the form. */
export function QuotationGuidePanel({ doc }: { doc: Doc }) {
  const checks = quotationChecks(doc, todayIso());
  const party = String(doc["party_name"] ?? "");
  const isCust = String(doc["quotation_to"] ?? "Customer") === "Customer" && !!party;
  const c = isCust ? customer360(party, String(doc["company"] ?? ""), todayIso(), currentUser()) : null;
  const ready = checks.every((x) => x.ok);
  return (
    <section className="panel mt-4 p-4" data-dp-quote-guide aria-label="Quotation guidance">
      <div className="flex flex-wrap items-center gap-2"><h2 className="text-sm font-semibold">Quotation guidance</h2>
        <span className={`chip text-xs ${ready ? "bg-success/15 text-success-text" : "bg-warning/20"}`} data-dp-quote-ready={ready ? 1 : 0}>{ready ? "Ready to submit" : "Needs attention"}</span>
        {c && c.invoices.status === "ok" && <span className="ms-auto text-xs" data-dp-quote-customer><span className="text-muted-foreground">Outstanding</span> <b data-no-i18n>{fmtCurrency(c.outstanding)}</b>
          {c.creditLimit > 0 && <> · <span className="text-muted-foreground">Credit Limit</span> <b data-no-i18n>{fmtCurrency(c.creditLimit)}</b></>}
          {" · "}<span className="text-muted-foreground">Overdue</span> <b data-no-i18n className={c.invoices.overdue > 0 ? "text-destructive" : ""}>{c.invoices.overdue}</b>
          {" · "}<span className="text-muted-foreground">Open orders</span> <b data-no-i18n>{c.orders.open}</b></span>}
      </div>
      {n(doc.docstatus) === 0 && <ul className="mt-2 grid gap-1 sm:grid-cols-3" data-dp-quote-checks>{checks.map((x) =>
        <li key={x.id} className="flex items-center gap-1 text-xs" data-dp-check={x.id} data-ok={x.ok ? 1 : 0}><span aria-hidden className={x.ok ? "text-success-text" : "text-destructive"}>{x.ok ? "✓" : "✕"}</span><span>{x.label}</span></li>)}</ul>}
      <p className="mt-2 text-xs text-muted-foreground">Add items in the Items table below; price list rate, UOM conversion and taxes are applied by the native form. Convert with Create → Sales Order after submit.</p>
    </section>
  );
}

export function Customer360Panel({ doc }: { doc: Doc }) {
  const companies = [...new Set([String(doc["default_company"] ?? "")])].filter(Boolean);
  const c = customer360(doc.name, companies[0] ?? "", todayIso(), currentUser());
  const m = (v: number) => fmtCurrency(v, String(doc["default_currency"] ?? "") || undefined);
  const card = (k: string, label: string, value: string, sub?: React.ReactNode, warn = false) => (
    <div className="dp-card" data-dp-c360={k}><p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-1 text-lg font-semibold tabular-nums ${warn ? "text-destructive" : ""}`} data-no-i18n>{value}</p>{sub && <p className="text-xs text-muted-foreground">{sub}</p>}</div>
  );
  return (
    <section className="panel mt-4 p-4" data-dp-customer-360 aria-label="Customer 360">
      <div className="flex flex-wrap items-center gap-2"><h2 className="text-sm font-semibold">Customer 360</h2>
        <Link to="/pro/customer-360" search={{ customer: doc.name } as never} className="btn-ghost ms-auto py-0.5 text-xs" data-dp-open-c360>Open Customer 360</Link>
        <Link to="/pro/receivables" search={{ party: doc.name } as never} className="btn-ghost py-0.5 text-xs">Accounts Receivable</Link></div>
      {c.invoices.status !== "ok" ? <SourceState status={c.invoices.status} doctype="Sales Invoice" /> : <>
        <div className="mt-3 grid gap-3 grid-cols-2 md:grid-cols-4">
          {card("outstanding", "Outstanding", m(c.outstanding), c.creditLimit ? <><span>Credit Limit</span> <span data-no-i18n>{m(c.creditLimit)}</span></> : undefined, c.creditAvailable !== null && c.creditAvailable < 0)}
          {card("unpaid", "Unpaid invoices", String(c.invoices.unpaid), <><span>Overdue</span> <span data-no-i18n>{c.invoices.overdue}</span></>, c.invoices.overdue > 0)}
          {card("orders", "Open orders", c.orders.status === "ok" ? String(c.orders.open) : "—", <><span>To Deliver</span> <span data-no-i18n>{c.orders.toDeliver}</span> · <span>To Bill</span> <span data-no-i18n>{c.orders.toBill}</span></>)}
          {card("quotes", "Open Quotations", c.quotations.status === "ok" ? String(c.quotations.open) : "—")}
        </div>
        {c.recent.length > 0 && <div className="mt-3 flex flex-wrap gap-2" data-dp-c360-recent>{c.recent.map((d) => <div key={d.doctype + d.name} className="w-44"><div className="text-[11px] text-muted-foreground">{d.doctype}</div><DocChip d={d} /></div>)}</div>}
      </>}
    </section>
  );
}

/** SC-S-06 / purchase equivalent — invoice status banner from native outstanding_amount, due_date, Payment Entry references and returns. */
export function InvoiceBannerPanel({ doctype, doc }: { doctype: string; doc: Doc }) {
  useScopeMetas(["Payment Entry", doctype]);
  const b = invoiceBanner(doctype, doc, todayIso(), currentUser());
  const m = (v: number) => fmtCurrency(v, String(doc["currency"] ?? "") || undefined);
  const cls = { draft: "bg-muted", cancelled: "bg-destructive/10 text-destructive", paid: "bg-success/15 text-success-text", overdue: "bg-destructive/10 text-destructive", unpaid: "bg-warning/20", return: "bg-warning/20" }[b.state];
  const label = { draft: "Draft", cancelled: "Cancelled", paid: "Paid", overdue: "Overdue", unpaid: "Unpaid", return: "Return" }[b.state];
  const ar = doctype === "Sales Invoice";
  return (
    <section className={`panel mt-4 flex flex-wrap items-center gap-3 p-3 text-sm`} data-dp-invoice-banner={b.state} aria-label="Invoice status">
      <span className={`chip text-xs ${cls}`}>{label}</span>
      <span><span className="text-muted-foreground">Grand total</span> <b className="tabular-nums" data-no-i18n>{m(b.grand)}</b></span>
      {b.state !== "draft" && <span><span className="text-muted-foreground">Outstanding</span> <b className="tabular-nums" data-no-i18n>{m(b.outstanding)}</b></span>}
      {b.due && <span><span className="text-muted-foreground">Due date</span> <span data-no-i18n>{b.due}</span>{b.daysOverdue > 0 && b.outstanding > 0 && <> · <span className="text-destructive" data-dp-days-overdue={b.daysOverdue}><span data-no-i18n>{b.daysOverdue}</span> <span>days overdue</span></span></>}</span>}
      {b.payments.length > 0 && <span className="flex flex-wrap items-center gap-1"><span className="text-muted-foreground">Payments</span>{b.payments.map((d) => <Link key={d.name} to="/app/$app/$doctype/$name" params={{ app: "erpnext", doctype: "payment_entry", name: d.name }} className="underline" data-no-i18n>{d.name}</Link>)}</span>}
      {b.returns.length > 0 && <span className="flex flex-wrap items-center gap-1"><span className="text-muted-foreground">Returns</span>{b.returns.map((d) => <Link key={d.name} to="/app/$app/$doctype/$name" params={{ app: "erpnext", doctype: slug(doctype), name: d.name }} className="underline" data-no-i18n>{d.name}</Link>)}</span>}
      {(b.state === "unpaid" || b.state === "overdue") && <Link to={ar ? "/pro/receivables" : "/pro/payables"} search={{ party: String(doc[ar ? "customer" : "supplier"] ?? "") } as never} className="btn-ghost ms-auto py-0.5 text-xs" data-dp-collect>{ar ? "Open in Receivables" : "Open in Payables"}</Link>}
    </section>
  );
}

/** D9 — party mini panel (Business Central FactBox) on every customer / supplier transaction document: balance, credit
 *  and overdue of the document's party, from the same native sources as Customer 360 / Supplier 360. Read-only.
 *  Quotation keeps its own guide (same customer facts); Payment Entry takes the party from its native party_type/party. */
export function PartyMiniPanel({ doctype, doc }: { doctype: string; doc: Doc }) {
  const ar = useLang() === "ar"; const t = (en: string, a: string) => (ar ? a : en);
  const pr = partyOf(doctype, doc); const side = pr?.side;
  useScopeMetas(side === "Supplier" ? BUYING.stages : ["Sales Invoice", "Sales Order", "Quotation"]);
  const party = pr?.party ?? "";
  if (!side || !party) return null;
  const company = String(doc["company"] ?? "");
  const cur = String(doc["company_currency"] ?? doc["currency"] ?? "") || undefined;
  const m = (v: number) => fmtCurrency(v, cur);
  const cell = (k: string, label: string, value: string, warn = false, sub?: React.ReactNode) => <div className="min-w-[8rem] flex-1" data-dp-party-fact={k}>
    <p className="text-[11px] text-muted-foreground">{label}</p><p className={`text-sm font-semibold tabular-nums ${warn ? "text-destructive" : ""}`} data-no-i18n>{value}</p>{sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}</div>;
  if (side === "Customer") {
    const c = customer360(party, company, todayIso(), currentUser());
    return <section className="panel mt-4 p-3" data-dp-party-mini="Customer" aria-label={t("Customer at a glance", "العميل باختصار")}>
      <div className="flex flex-wrap items-center gap-2"><h2 className="text-sm font-semibold">{t("Customer at a glance", "العميل باختصار")}</h2><bdi className="text-xs text-muted-foreground" data-no-i18n>{party}</bdi>
        <Link to="/pro/customer-360" search={{ customer: party } as never} className="btn-ghost ms-auto py-0.5 text-xs" data-dp-party-open="Customer">{t("Open Customer 360", "فتح ملف العميل الشامل")}</Link></div>
      {c.invoices.status !== "ok" ? <SourceState status={c.invoices.status} doctype="Sales Invoice" /> : <div className="mt-2 flex flex-wrap gap-3">
        {cell("balance", t("Outstanding", "المستحق"), m(c.outstanding))}
        {cell("credit", t("Credit limit", "حد الائتمان"), c.creditLimit > 0 ? m(c.creditLimit) : "—", c.creditAvailable !== null && c.creditAvailable < 0,
          c.creditLimit > 0 && c.creditAvailable !== null ? <>{t("Available", "المتاح")} <bdi data-no-i18n>{m(c.creditAvailable)}</bdi></> : t("No limit set", "لا يوجد حد"))}
        {cell("overdue", t("Overdue invoices", "فواتير متأخرة"), String(c.invoices.overdue), c.invoices.overdue > 0, <>{t("Unpaid", "غير مدفوعة")} <bdi data-no-i18n>{c.invoices.unpaid}</bdi></>)}
        {cell("orders", t("Open orders", "طلبات مفتوحة"), c.orders.status === "ok" ? String(c.orders.open) : "—")}
      </div>}
      <p className="mt-2 text-[11px] text-muted-foreground">{t("Company", "الشركة")} <bdi data-no-i18n>{company || "—"}</bdi> · {t("submitted invoices and orders you can see", "الفواتير والطلبات المعتمدة المسموح لك برؤيتها")}</p>
    </section>;
  }
  const s = supplier360(party, todayIso(), currentUser());
  return <section className="panel mt-4 p-3" data-dp-party-mini="Supplier" aria-label={t("Supplier at a glance", "المورد باختصار")}>
    <div className="flex flex-wrap items-center gap-2"><h2 className="text-sm font-semibold">{t("Supplier at a glance", "المورد باختصار")}</h2><bdi className="text-xs text-muted-foreground" data-no-i18n>{party}</bdi>
      <span className="ms-auto flex flex-wrap gap-1">
        <Link to="/app/$app/$doctype/$name" params={{ app: "erpnext", doctype: "supplier", name: party }} className="btn-ghost py-0.5 text-xs" data-dp-party-open="Supplier">{t("Open Supplier 360", "فتح ملف المورد الشامل")}</Link>
        <Link to="/pro/payables" search={{ party } as never} className="btn-ghost py-0.5 text-xs">{t("Accounts Payable", "الذمم الدائنة")}</Link></span></div>
    {s.status !== "ok" ? <SourceState status={s.status} doctype="Purchase Invoice" /> : <div className="mt-2 flex flex-wrap gap-3">
      {cell("balance", t("Payable", "المستحق للمورد"), m(s.invoices.outstanding))}
      {cell("overdue", t("Overdue invoices", "فواتير متأخرة"), String(s.invoices.overdue), s.invoices.overdue > 0, <>{t("Unpaid", "غير مدفوعة")} <bdi data-no-i18n>{s.invoices.unpaid}</bdi></>)}
      {cell("orders", t("Open orders", "طلبات مفتوحة"), s.orders.status === "ok" ? String(s.orders.open) : "—", false, <>{t("To receive", "بانتظار الاستلام")} <bdi data-no-i18n>{s.orders.toReceive}</bdi></>)}
      {cell("credit", t("Credit limit", "حد الائتمان"), "—", false, t("Not tracked for suppliers in DIGIT", "لا يتتبعه النظام للموردين"))}
    </div>}
    <p className="mt-2 text-[11px] text-muted-foreground">{t("All companies · submitted documents you can see", "كل الشركات · المستندات المعتمدة المسموح لك برؤيتها")}</p>
  </section>;
}

const REV_DATES = new Set(["transaction_date", "valid_till"]);
const REV_MONEY = new Set(["net_total", "total_taxes_and_charges", "discount_amount", "grand_total"]);
/** SL3 — quotation revisions R1 / R2: what changed against the revision this quotation was amended from (native
 *  amended_from chain), header values and item lines side by side. Read-only; the native amend flow is unchanged. */
export function QuotationRevisionPanel({ doc }: { doc: Doc }) { return <RevisionPanel doctype="Quotation" doc={doc} />; }
const REV_TITLE: Record<string, [string, string, string]> = { "Quotation": ["Quotation revisions", "مراجعات عرض السعر", "quotation"], "Purchase Order": ["Purchase order revisions", "مراجعات أمر الشراء", "purchase_order"] };
const REV_DATES_PO = new Set(["transaction_date", "schedule_date"]);
/** PU5-b — the same revision view for an amended Purchase Order (what changed before it goes back for approval). */
export function RevisionPanel({ doctype, doc }: { doctype: "Quotation" | "Purchase Order"; doc: Doc }) {
  const ar = useLang() === "ar"; const t = (en: string, a: string) => (ar ? a : en);
  const [against, setAgainst] = useState<string | undefined>(undefined);
  const d = revisionDiff(doctype, doc, currentUser(), against);
  const label = Object.fromEntries((REVISION_SPECS[doctype] ?? REVISION_FIELDS).map(([f, en, a]) => [f, ar ? a : en]));
  const [titleEn, titleAr, slugName] = REV_TITLE[doctype]!;
  const isQ = doctype === "Quotation";
  const cur = String(doc["currency"] ?? "") || undefined;
  const num = (v: number | undefined) => (v === undefined ? "—" : v.toLocaleString("en-US", { maximumFractionDigits: 2 }));
  // header values in the same display format as the native form: system date format, document currency, grouped quantity
  const show = (field: string, v: string) => !v ? "—" : (isQ ? REV_DATES : REV_DATES_PO).has(field) ? fmtDate(v) : REV_MONEY.has(field) ? fmtCurrency(Number(v), cur) : field === "total_qty" ? num(Number(v)) : v;
  const tone = { added: "bg-success/15 text-success-text", removed: "bg-destructive/10 text-destructive", changed: "bg-warning/20", same: "bg-muted" } as const;
  const chg = { added: t("Added", "مضاف"), removed: t("Removed", "محذوف"), changed: t("Changed", "معدّل"), same: t("Unchanged", "دون تغيير") } as const;
  const rev = (name: string) => d.chain.length - d.chain.indexOf(name);
  return <section className="panel mt-4 p-4" {...(isQ ? { "data-dp-quote-revisions": d.chain.length } : { "data-dp-revisions": d.chain.length })} aria-label={t(titleEn, titleAr)}>
    <div className="flex flex-wrap items-center gap-2"><h2 className="text-sm font-semibold">{t(titleEn, titleAr)}</h2>
      <span className="chip bg-muted text-xs" data-no-i18n>R{d.chain.length}</span>
      {d.chain.length > 2 && <label className="ms-auto inline-flex items-center gap-1 text-xs">{t("Compare with", "مقارنة مع")}
        <select className="input h-7 py-0 text-xs" value={d.against} onChange={(e) => setAgainst(e.target.value)} data-dp-rev-against>
          {d.chain.slice(1).map((nm) => <option key={nm} value={nm} data-no-i18n>R{rev(nm)} · {nm}</option>)}</select></label>}
      {d.against && <Link to="/app/$app/$doctype/$name" params={{ app: "erpnext", doctype: slugName, name: d.against }} className={`btn-ghost py-0.5 text-xs ${d.chain.length > 2 ? "" : "ms-auto"}`} data-dp-rev-open={d.against}>
        {t("Open", "فتح")} <bdi data-no-i18n>R{rev(d.against)} · {d.against}</bdi></Link>}</div>
    {d.status === "denied_previous" ? <p className="mt-2 text-xs text-muted-foreground" data-dp-rev-denied>{t("The earlier revision exists but you are not permitted to read it.", "المراجعة السابقة موجودة لكن لا يُسمح لك بقراءتها.")}</p>
      : d.status !== "ok" ? (d.status === "empty" ? null : <SourceState status={d.status} doctype={doctype} />) : <>
      <p className="mt-1 text-xs text-muted-foreground"><bdi data-no-i18n>R{rev(d.against)} → R{d.chain.length}</bdi> · {d.fields.length + d.lines.filter((l) => l.change !== "same").length
        ? t(`${d.fields.length} header value(s) and ${d.lines.filter((l) => l.change !== "same").length} line(s) differ`, `${d.fields.length} قيمة في الرأس و${d.lines.filter((l) => l.change !== "same").length} بند مختلفة`) : t("No differences", "لا توجد فروق")}</p>
      {d.fields.length > 0 && <div className="mt-2 overflow-x-auto"><table className="w-full text-xs" data-dp-rev-fields>
        <thead><tr className="text-muted-foreground"><th className="py-1 text-start">{t("Field", "الحقل")}</th><th className="text-start" data-no-i18n>R{rev(d.against)}</th><th className="text-start" data-no-i18n>R{d.chain.length}</th></tr></thead>
        <tbody>{d.fields.map((f) => <tr key={f.field} className="border-t border-border" data-dp-rev-field={f.field}><td className="py-1">{label[f.field]}</td>
          <td className="text-muted-foreground line-through" data-no-i18n>{show(f.field, f.before)}</td><td className="font-medium" data-no-i18n>{show(f.field, f.after)}</td></tr>)}</tbody></table></div>}
      {d.lines.length > 0 && <div className="mt-2 overflow-x-auto"><table className="w-full text-xs" data-dp-rev-lines>
        <thead><tr className="text-muted-foreground"><th className="py-1 text-start">{t("Item", "الصنف")}</th><th className="text-start">{t("Change", "التغيير")}</th>
          <th className="text-end">{t("Qty", "الكمية")}</th><th className="text-end">{t("Rate", "السعر")}</th><th className="text-end">{t("Amount", "المبلغ")}</th></tr></thead>
        <tbody>{d.lines.map((l) => <tr key={l.key} className="border-t border-border" data-dp-rev-line={l.change}>
          <td className="py-1"><bdi data-no-i18n>{l.item}</bdi> <span className="text-muted-foreground" data-no-i18n>{l.uom}</span></td>
          <td><span className={`chip text-[11px] ${tone[l.change]}`}>{chg[l.change]}</span></td>
          {(["qty", "rate", "amount"] as const).map((k) => { const b = l.before?.[k], a = l.after?.[k]; const diff = b !== a;
            return <td key={k} className="text-end tabular-nums" data-no-i18n>{diff && b !== undefined && <span className="me-1 text-muted-foreground line-through">{k === "qty" ? num(b) : fmtCurrency(b, cur)}</span>}{a === undefined ? "—" : k === "qty" ? num(a) : fmtCurrency(a, cur)}</td>; })}
        </tr>)}</tbody></table></div>}
    </>}
  </section>;
}
