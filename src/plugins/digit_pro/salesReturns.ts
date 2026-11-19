/**
 * RXP-03 / SC-S-06 — Sales returns and credit notes (/pro/sales-returns). Read-only over native records.
 *
 *  - Credit notes  = Sales Invoice with is_return = 1 (financial return; GL written by Core posting, never here);
 *  - Delivery returns = Delivery Note with is_return = 1 (physical return to stock).
 * Each return shows the document it reverses (`return_against`). Exceptions are exact link facts:
 *  - draft (not submitted);
 *  - no original reference (return_against empty);
 *  - unapplied credit: a submitted credit note whose native outstanding_amount is still negative;
 *  - no linked credit note: no non-cancelled credit note row points at the return Delivery Note
 *    (Sales Invoice Item.delivery_note). A credit note raised against the original invoice instead carries no such link,
 *    so this is a "check" item, not a claim that the customer was never credited.
 * Monthly comparison uses company-currency amounts (base_grand_total) of submitted documents only; the credit share is
 * credit notes ÷ invoices of the same month, shown only when that month has invoices.
 */
import type { Doc } from "@/lib/adapter";
import { scopedList } from "@/lib/scope";
import { currentUser } from "@/lib/session";
import { companyScope } from "./closeReview";
import { todayIso, type SourceStatus } from "./finance";
import type { Bi, Filter } from "./command";
import { totalsBy, type Totals } from "./orderFulfilment";

const n = (v: unknown) => Number(v) || 0;
const s = (v: unknown) => String(v ?? "");
const r2 = (x: number) => Math.round(x * 100) / 100;
const q6 = (x: number) => Math.round(x * 1e6) / 1e6;
const rows = (d: Doc): Doc[] => (Array.isArray(d["items"]) ? (d["items"] as Doc[]) : []);
const base = (d: Doc) => Math.abs(n(d["base_grand_total"]) || n(d["grand_total"]));

export type ReturnDoctype = "Sales Invoice" | "Delivery Note";
export type ReturnFlag = "draft" | "no-original" | "unapplied" | "not-credited";
export const FLAGS: ReturnFlag[] = ["draft", "no-original", "unapplied", "not-credited"];
export const FLAG_LABEL: Record<ReturnFlag, Bi> = {
  draft: ["Draft — not submitted", "مسودة — غير معتمدة"], "no-original": ["No original document", "بدون مستند أصلي"],
  unapplied: ["Credit not yet applied", "رصيد دائن غير مستخدم"], "not-credited": ["No credit note linked to this return", "لا يوجد إشعار دائن مرتبط بهذا المرتجع"],
};
export const FLAG_ACTION: Record<ReturnFlag, Bi> = {
  draft: ["Review and submit", "راجع واعتمد"], "no-original": ["Check which invoice or delivery it reverses", "تحقق من الفاتورة أو التسليم الذي يعكسه"],
  unapplied: ["Allocate to an invoice or refund", "خصّصه لفاتورة أو أعد المبلغ"], "not-credited": ["Check the customer was credited; create the credit note from the return if not", "تحقق من إضافة الرصيد للعميل، وأنشئ إشعار الدائن من المرتجع إن لم يتم"],
};

export interface ReturnLine { item: string; itemName: string; uom: string; qty: number; amount: number }
export interface ReturnRow {
  doctype: ReturnDoctype; name: string; date: string; customer: string; customerName: string; currency: string; amount: number; baseAmount: number;
  docstatus: number; status: string; against: string; againstDate: string; againstAmount: number | null; againstFound: boolean;
  unapplied: number; creditNotes: string[]; lines: ReturnLine[]; flags: ReturnFlag[];
}

/** Pure: company returns (cancelled excluded) dated within [from, to]. `creditsKnown` = every company credit note was readable,
 *  so a delivery return without one can be flagged (never flagged from a partial view). */
export function returnRows(invoices: Doc[], deliveries: Doc[], company: string, from: string, to: string, creditsKnown = true): ReturnRow[] {
  const live = (d: Doc) => d["company"] === company && n(d.docstatus) !== 2;
  const inRange = (d: Doc) => { const p = s(d["posting_date"]); return !!p && (!from || p >= from) && (!to || p <= to); };
  const creditFor = new Map<string, Set<string>>();
  for (const d of invoices.filter((x) => live(x) && n(x["is_return"]))) for (const r of rows(d)) {
    const dn = s(r["delivery_note"]); if (dn) (creditFor.get(dn) ?? creditFor.set(dn, new Set()).get(dn)!).add(d.name);
  }
  const make = (dt: ReturnDoctype, list: Doc[]) => list.filter((d) => live(d) && n(d["is_return"]) && inRange(d)).map<ReturnRow>((d) => {
    const against = s(d["return_against"]); const orig = against ? list.find((x) => x.name === against) : undefined;
    const unapplied = dt === "Sales Invoice" && n(d.docstatus) === 1 && n(d["outstanding_amount"]) < -0.004 ? r2(-n(d["outstanding_amount"])) : 0;
    const creditNotes = dt === "Delivery Note" ? [...(creditFor.get(d.name) ?? [])].sort() : [];
    const flags: ReturnFlag[] = [];
    if (n(d.docstatus) === 0) flags.push("draft");
    if (!against) flags.push("no-original");
    if (unapplied > 0) flags.push("unapplied");
    if (creditsKnown && dt === "Delivery Note" && n(d.docstatus) === 1 && !creditNotes.length) flags.push("not-credited");
    return {
      doctype: dt, name: d.name, date: s(d["posting_date"]), customer: s(d["customer"]), customerName: s(d["customer_name"] || d["customer"]), currency: s(d["currency"]),
      amount: r2(Math.abs(n(d["grand_total"]))), baseAmount: r2(base(d)), docstatus: n(d.docstatus), status: s(d["status"]),
      against, againstDate: s(orig?.["posting_date"]), againstAmount: orig ? r2(Math.abs(n(orig["grand_total"]))) : null, againstFound: !!orig,
      unapplied, creditNotes,
      lines: rows(d).map((r) => ({ item: s(r["item_code"]), itemName: s(r["item_name"] || r["item_code"]), uom: s(r["uom"] || r["stock_uom"]), qty: q6(Math.abs(n(r["qty"]))), amount: r2(Math.abs(n(r["amount"] ?? n(r["qty"]) * n(r["rate"])))) })),
      flags,
    };
  });
  return [...make("Sales Invoice", invoices), ...make("Delivery Note", deliveries)].sort((a, b) => b.date.localeCompare(a.date) || a.name.localeCompare(b.name));
}

export interface ReturnMonth { month: string; invoiced: number; invoices: number; credited: number; credits: number; share: number | null }
/** Submitted invoices vs submitted credit notes per month (company currency). */
export function returnTrend(invoices: Doc[], company: string, months: string[]): ReturnMonth[] {
  const sub = invoices.filter((d) => d["company"] === company && n(d.docstatus) === 1);
  return months.map((month) => {
    const xs = sub.filter((d) => s(d["posting_date"]).slice(0, 7) === month);
    const inv = xs.filter((d) => !n(d["is_return"])), cr = xs.filter((d) => n(d["is_return"]));
    const invoiced = r2(inv.reduce((a, d) => a + base(d), 0)), credited = r2(cr.reduce((a, d) => a + base(d), 0));
    return { month, invoiced, invoices: inv.length, credited, credits: cr.length, share: invoiced > 0 ? Math.round((credited / invoiced) * 1000) / 10 : null };
  });
}

export interface ItemReturn { item: string; itemName: string; uom: string; invoicedQty: number; creditedQty: number; returnedQty: number; creditShare: number | null }
/** Per item + unit: invoiced vs credited qty (Sales Invoice) and physically returned qty (Delivery Note) in the range, submitted only. */
export function itemReturns(invoices: Doc[], deliveries: Doc[], company: string, from: string, to: string): ItemReturn[] {
  const ok = (d: Doc) => d["company"] === company && n(d.docstatus) === 1 && s(d["posting_date"]) >= from && s(d["posting_date"]) <= to;
  const m = new Map<string, ItemReturn>();
  const get = (r: Doc) => { const item = s(r["item_code"]), uom = s(r["uom"] || r["stock_uom"]); const k = `${item}\u0000${uom}`; return m.get(k) ?? m.set(k, { item, itemName: s(r["item_name"] || item), uom, invoicedQty: 0, creditedQty: 0, returnedQty: 0, creditShare: null }).get(k)!; };
  for (const d of invoices.filter(ok)) for (const r of rows(d)) { const e = get(r); if (n(d["is_return"])) e.creditedQty += Math.abs(n(r["qty"])); else e.invoicedQty += n(r["qty"]); }
  for (const d of deliveries.filter((x) => ok(x) && n(x["is_return"]))) for (const r of rows(d)) get(r).returnedQty += Math.abs(n(r["qty"]));
  return [...m.values()].filter((e) => e.creditedQty > 0 || e.returnedQty > 0)
    .map((e) => ({ ...e, invoicedQty: q6(e.invoicedQty), creditedQty: q6(e.creditedQty), returnedQty: q6(e.returnedQty), creditShare: e.invoicedQty > 0 ? Math.round((e.creditedQty / e.invoicedQty) * 1000) / 10 : null }))
    .sort((a, b) => b.creditedQty + b.returnedQty - (a.creditedQty + a.returnedQty) || a.item.localeCompare(b.item));
}

export interface ReturnsSummary { credits: number; creditValue: Totals; deliveries: number; flags: Record<ReturnFlag, number>; customers: { customer: string; customerName: string; count: number; value: number }[] }
export function returnsSummary(rs: ReturnRow[]): ReturnsSummary {
  const cr = rs.filter((r) => r.doctype === "Sales Invoice" && r.docstatus === 1);
  const byCust = new Map<string, { customer: string; customerName: string; count: number; value: number }>();
  for (const r of cr) { const e = byCust.get(r.customer) ?? byCust.set(r.customer, { customer: r.customer, customerName: r.customerName, count: 0, value: 0 }).get(r.customer)!; e.count++; e.value = r2(e.value + r.baseAmount); }
  return {
    credits: cr.length, creditValue: totalsBy(cr, (r) => r.currency, (r) => r.amount), deliveries: rs.filter((r) => r.doctype === "Delivery Note" && r.docstatus === 1).length,
    flags: Object.fromEntries(FLAGS.map((f) => [f, rs.filter((r) => r.flags.includes(f)).length])) as Record<ReturnFlag, number>,
    customers: [...byCust.values()].sort((a, b) => b.value - a.value),
  };
}

export interface ReturnFilter { type?: string | undefined; flag?: string | undefined; customer?: string | undefined; q?: string | undefined }
export function filterReturns(rs: ReturnRow[], f: ReturnFilter): ReturnRow[] {
  const q = (f.q ?? "").trim().toLowerCase();
  return rs.filter((r) => (!f.type || (f.type === "credit" ? r.doctype === "Sales Invoice" : r.doctype === "Delivery Note")) && (!f.flag || r.flags.includes(f.flag as ReturnFlag))
    && (!f.customer || r.customer === f.customer) && (!q || `${r.name} ${r.against} ${r.customer} ${r.customerName} ${r.lines.map((l) => l.item).join(" ")}`.toLowerCase().includes(q)));
}

/** Native list predicate for the same return population of one doctype in the range. */
export const nativeReturnFilter = (company: string, from: string, to: string, extra: Filter[] = []): Filter[] =>
  [["company", "=", company], ["is_return", "=", 1], ["docstatus", "!=", 2], ["posting_date", "between", [from, to]], ...extra];

export interface SalesReturns { creditStatus: SourceStatus; deliveryStatus: SourceStatus; rows: ReturnRow[]; invoices: Doc[]; deliveries: Doc[] }
/** Scoped wrapper: each source fails closed on its own; a hidden source is reported, never shown as zero. */
export function salesReturns(company: string, from: string, to: string, user = currentUser(), _today = todayIso()): SalesReturns {
  const creditStatus = companyScope("Sales Invoice", company, user), deliveryStatus = companyScope("Delivery Note", company, user);
  const invoices = creditStatus === "ok" ? scopedList("Sales Invoice", user) : [];
  const deliveries = deliveryStatus === "ok" ? scopedList("Delivery Note", user) : [];
  return { creditStatus, deliveryStatus, rows: returnRows(invoices, deliveries, company, from, to, creditStatus === "ok"), invoices, deliveries };
}
