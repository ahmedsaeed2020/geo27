/**
 * RXP-03 / SC-S-04 + SC-S-05 — Sales Order fulfilment at LINE grain (/pro/order-fulfilment). Read-only.
 *
 * Every open Sales Order line (Sales Order Item child row) with:
 *  - ordered qty and rate from the line itself;
 *  - delivered qty = the native `delivered_qty` that Core's status updater writes (src/lib/posting.ts refreshPrev);
 *    the submitted Delivery Note rows behind it are found with the SAME Core rule (src/lib/selling.ts rowMatch:
 *    `so_detail` row link, else the item when it is on exactly one order line). When the linked rows do not add up to
 *    the stored figure, or a legacy row cannot be attributed to one line, the line is flagged for review — never guessed;
 *  - returned qty = submitted return Delivery Note rows matched to the line;
 *  - invoiced qty / amount from submitted Sales Invoice rows matched the same way (credit notes net off);
 *  - promised date = the line's `delivery_date`, else the order's (the source is shown).
 * Nothing is written. Mixed currencies are never summed together.
 */
import type { Doc } from "@/lib/adapter";
import { scopedList } from "@/lib/scope";
import { currentUser } from "@/lib/session";
import { ambiguousRow, rowMatch } from "@/lib/selling";
import { companyScope } from "./closeReview";
import { todayIso, type SourceStatus } from "./finance";
import type { Bi, Filter } from "./command";

const n = (v: unknown) => Number(v) || 0;
const s = (v: unknown) => String(v ?? "");
const q6 = (x: number) => Math.round(x * 1e6) / 1e6;
const r2 = (x: number) => Math.round(x * 100) / 100;
const rows = (d: Doc): Doc[] => (Array.isArray(d["items"]) ? (d["items"] as Doc[]) : []);
const DAY = 864e5;
const at = (d: string) => Date.parse(`${d}T00:00:00Z`);
export const daysBetween = (a: string, b: string) => Math.round((at(b) - at(a)) / DAY);
export const plusDays = (d: string, k: number) => new Date(at(d) + k * DAY).toISOString().slice(0, 10);

/** Native Sales Order statuses that still have something to deliver or bill (Completed / Closed / Cancelled excluded). */
export const OPEN_ORDER = ["To Deliver and Bill", "To Deliver", "To Bill", "On Hold"];
export type LineState = "late" | "due" | "partial" | "open" | "to-bill" | "held" | "done";
export const LINE_STATES: LineState[] = ["late", "due", "partial", "open", "to-bill", "held"];
export const STATE_LABEL: Record<LineState, Bi> = {
  late: ["Late", "متأخر"], due: ["Due in 7 days", "مستحق خلال 7 أيام"], partial: ["Partly delivered", "مسلّم جزئيًا"], open: ["Not started", "لم يبدأ التسليم"],
  "to-bill": ["Delivered, to invoice", "مسلّم بانتظار الفوترة"], held: ["On hold", "معلّق"], done: ["Complete", "مكتمل"],
};
export type DueBucket = "overdue" | "d7" | "d30" | "later" | "none";
export const DUE_BUCKETS: DueBucket[] = ["overdue", "d7", "d30", "later", "none"];
export const BUCKET_LABEL: Record<DueBucket, Bi> = {
  overdue: ["Past promised date", "تجاوز تاريخ التسليم"], d7: ["Next 7 days", "خلال 7 أيام"], d30: ["8–30 days", "من 8 إلى 30 يومًا"], later: ["Later", "لاحقًا"], none: ["No promised date", "بدون تاريخ تسليم"],
};
export type Review = "progress-differs" | "ambiguous" | "uom";
export const REVIEW_LABEL: Record<Review, Bi> = {
  "progress-differs": ["Stored delivered quantity differs from linked deliveries", "الكمية المسلّمة المخزنة تختلف عن أذونات التسليم المرتبطة"],
  ambiguous: ["A delivery or invoice row could not be tied to one line", "بند تسليم أو فاتورة لا يمكن ربطه ببند واحد"],
  uom: ["Linked row uses a different unit", "البند المرتبط بوحدة مختلفة"],
};

export interface LinkedDoc { doctype: "Delivery Note" | "Sales Invoice"; name: string; docstatus: number; isReturn: boolean; date: string; qty: number }
export interface FulfilLine {
  key: string; order: string; row: string; idx: number; customer: string; customerName: string; orderDate: string; orderStatus: string; currency: string;
  item: string; itemName: string; uom: string; warehouse: string; rate: number; amount: number;
  ordered: number; delivered: number; returned: number; billedQty: number; billedAmt: number; billingKnown: boolean; linksChecked: boolean;
  remaining: number; remainingValue: number; unbilledQty: number;
  due: string; dueSource: "line" | "order" | "none"; daysLate: number; bucket: DueBucket | null; state: LineState;
  review: Review[]; docs: LinkedDoc[];
}

const bucketOf = (due: string, asOf: string): DueBucket => !due ? "none" : due < asOf ? "overdue" : due <= plusDays(asOf, 7) ? "d7" : due <= plusDays(asOf, 30) ? "d30" : "later";

/** Pure: lines of the company's open submitted Sales Orders, attributed with the Core row rule. */
export function fulfilmentLines(orders: Doc[], deliveries: Doc[], invoices: Doc[], company: string, asOf: string, checkLinks = true): FulfilLine[] {
  const live = (d: Doc) => n(d.docstatus) !== 2 && d["company"] === company;
  const dns = deliveries.filter(live), sis = invoices.filter(live);
  const out: FulfilLine[] = [];
  for (const o of orders.filter((d) => d["company"] === company && n(d.docstatus) === 1 && OPEN_ORDER.includes(s(d["status"])))) {
    const lines = rows(o);
    const dnRows = dns.flatMap((d) => rows(d).filter((r) => r["against_sales_order"] === o.name).map((r) => ({ d, r })));
    const siRows = sis.flatMap((d) => rows(d).filter((r) => r["sales_order"] === o.name).map((r) => ({ d, r })));
    const ambiguousItems = new Set([...dnRows.filter(({ r }) => ambiguousRow("Sales Order", "Delivery Note", r, lines)), ...siRows.filter(({ r }) => ambiguousRow("Sales Order", "Sales Invoice", r, lines))].map(({ r }) => s(r["item_code"])));
    lines.forEach((r, i) => {
      if (n(r["closed"])) return;
      const item = s(r["item_code"]), uom = s(r["uom"] || r["stock_uom"]);
      const review = new Set<Review>();
      const docs = new Map<string, LinkedDoc>();
      const add = (dt: LinkedDoc["doctype"], d: Doc, qty: number) => {
        const k = `${dt}|${d.name}`; const prev = docs.get(k);
        docs.set(k, { doctype: dt, name: d.name, docstatus: n(d.docstatus), isReturn: !!n(d["is_return"]), date: s(d["posting_date"]), qty: q6((prev?.qty ?? 0) + qty) });
      };
      let linked = 0, returned = 0, billedQty = 0, billedAmtLinked = 0;
      for (const { d, r: x } of dnRows) {
        if (!rowMatch("Sales Order", "Delivery Note", r, x, lines)) continue;
        const ret = !!n(d["is_return"]); const q = ret ? -Math.abs(n(x["qty"])) : n(x["qty"]);
        add("Delivery Note", d, q);
        if (n(d.docstatus) !== 1) continue;
        if (uom && x["uom"] && s(x["uom"]) !== uom) review.add("uom");
        linked += q; if (ret) returned += Math.abs(n(x["qty"]));
      }
      for (const { d, r: x } of siRows) {
        if (!rowMatch("Sales Order", "Sales Invoice", r, x, lines)) continue;
        const ret = !!n(d["is_return"]); const q = ret ? -Math.abs(n(x["qty"])) : n(x["qty"]);
        add("Sales Invoice", d, q);
        if (n(d.docstatus) !== 1) continue;
        if (uom && x["uom"] && s(x["uom"]) !== uom) review.add("uom");
        billedQty += q;
        const a = Math.abs(n(x["amount"] ?? n(x["qty"]) * n(x["rate"])));
        billedAmtLinked += ret ? -a : a;
      }
      if (checkLinks && ambiguousItems.has(item)) review.add("ambiguous");
      const stored = r["delivered_qty"];
      const delivered = stored === undefined || stored === null || stored === "" ? q6(linked) : q6(n(stored));
      if (checkLinks && Math.abs(delivered - q6(linked)) > 1e-6) review.add("progress-differs");
      const ordered = n(r["qty"]), rate = n(r["rate"]);
      const amount = r2(n(r["amount"]) || ordered * rate);
      // Invoiced basis: the native billed_amt on the order line (what ERPNext's per_billed / "To Bill" status uses); without it,
      // the linked invoice rows — only when every company invoice is readable. Otherwise billing is unknown, never assumed.
      const hasStored = !(r["billed_amt"] === undefined || r["billed_amt"] === null || r["billed_amt"] === "");
      const billingKnown = hasStored || checkLinks;
      const billedAmt = hasStored ? r2(n(r["billed_amt"])) : checkLinks ? r2(billedAmtLinked) : 0;
      const remaining = Math.max(q6(ordered - delivered), 0);
      const unbilledQty = checkLinks ? Math.max(q6(delivered - billedQty), 0) : 0;
      const toBill = hasStored ? amount - billedAmt > 0.005 : checkLinks && (unbilledQty > 0 || amount - billedAmt > 0.005);
      const lineDue = s(r["delivery_date"]), orderDue = s(o["delivery_date"]);
      const due = lineDue || orderDue;
      const held = s(o["status"]) === "On Hold";
      const bucket = remaining > 0 ? bucketOf(due, asOf) : null;
      const state: LineState = held ? "held"
        : remaining > 0 ? (bucket === "overdue" ? "late" : bucket === "d7" ? "due" : delivered > 0 ? "partial" : "open")
        : toBill ? "to-bill" : "done";
      out.push({
        key: `${o.name}|${s(r["name"]) || i + 1}`, order: o.name, row: s(r["name"]), idx: n(r["idx"]) || i + 1,
        customer: s(o["customer"]), customerName: s(o["customer_name"] || o["customer"]), orderDate: s(o["transaction_date"]), orderStatus: s(o["status"]), currency: s(o["currency"]),
        item, itemName: s(r["item_name"] || item), uom, warehouse: s(r["warehouse"] || o["set_warehouse"]), rate, amount,
        ordered: q6(ordered), delivered, returned: q6(returned), billedQty: checkLinks ? q6(billedQty) : 0, billedAmt, billingKnown, linksChecked: checkLinks,
        remaining, remainingValue: r2(remaining * rate), unbilledQty,
        due, dueSource: lineDue ? "line" : orderDue ? "order" : "none", daysLate: remaining > 0 && due && due < asOf ? daysBetween(due, asOf) : 0, bucket, state,
        review: [...review], docs: [...docs.values()].sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name)),
      });
    });
  }
  return out.sort((a, b) => (a.due || "9999").localeCompare(b.due || "9999") || a.order.localeCompare(b.order) || a.idx - b.idx);
}

export type Totals = { currency: string; amount: number }[];
export function totalsBy<T>(xs: T[], cur: (x: T) => string, amt: (x: T) => number): Totals {
  const m = new Map<string, number>(); for (const x of xs) { const c = cur(x) || "—"; m.set(c, r2((m.get(c) ?? 0) + amt(x))); }
  return [...m].map(([currency, amount]) => ({ currency, amount })).filter((t) => Math.abs(t.amount) > 0.004).sort((a, b) => b.amount - a.amount);
}

export interface FulfilSummary {
  lines: number; orders: number; customers: number; review: number;
  byState: Record<LineState, { lines: number; orders: number; value: Totals }>;
  byBucket: Record<DueBucket, { lines: number; value: Totals }>;
}
/** Counts and remaining value per state and per promised-date bucket. "to-bill" value is the line amount not yet invoiced. */
export function fulfilmentSummary(lines: FulfilLine[]): FulfilSummary {
  const byState = Object.fromEntries([...LINE_STATES, "done"].map((k) => {
    const ls = lines.filter((l) => l.state === k);
    return [k, { lines: ls.length, orders: new Set(ls.map((l) => l.order)).size, value: totalsBy(ls, (l) => l.currency, (l) => (k === "to-bill" ? Math.max(l.amount - l.billedAmt, 0) : l.remainingValue)) }];
  })) as FulfilSummary["byState"];
  const byBucket = Object.fromEntries(DUE_BUCKETS.map((b) => { const ls = lines.filter((l) => l.bucket === b && l.state !== "held"); return [b, { lines: ls.length, value: totalsBy(ls, (l) => l.currency, (l) => l.remainingValue) }]; })) as FulfilSummary["byBucket"];
  return { lines: lines.length, orders: new Set(lines.map((l) => l.order)).size, customers: new Set(lines.map((l) => l.customer)).size, review: lines.filter((l) => l.review.length).length, byState, byBucket };
}

export interface OrderProgress { order: string; customer: string; customerName: string; currency: string; due: string; amount: number; deliveredValue: number; remainingValue: number; billedAmt: number; lines: number; late: number; worst: LineState }
const RANK: Record<LineState, number> = { late: 0, held: 1, due: 2, partial: 3, open: 4, "to-bill": 5, done: 6 };
/** Per-order roll-up of the same lines: delivered vs remaining value (line rate × qty), invoiced amount, worst line state. */
export function orderProgress(lines: FulfilLine[]): OrderProgress[] {
  const m = new Map<string, FulfilLine[]>(); for (const l of lines) m.set(l.order, [...(m.get(l.order) ?? []), l]);
  return [...m].map(([order, ls]) => {
    const f = ls[0]!;
    return {
      order, customer: f.customer, customerName: f.customerName, currency: f.currency, due: ls.map((l) => l.due).filter(Boolean).sort()[0] ?? "",
      amount: r2(ls.reduce((a, l) => a + l.amount, 0)), deliveredValue: r2(ls.reduce((a, l) => a + Math.min(l.delivered, l.ordered) * l.rate, 0)),
      remainingValue: r2(ls.reduce((a, l) => a + l.remainingValue, 0)), billedAmt: r2(ls.reduce((a, l) => a + l.billedAmt, 0)), lines: ls.length,
      late: ls.filter((l) => l.state === "late").length, worst: ls.reduce<LineState>((w, l) => (RANK[l.state] < RANK[w] ? l.state : w), "done"),
    };
  }).sort((a, b) => RANK[a.worst] - RANK[b.worst] || b.remainingValue - a.remainingValue);
}

export interface FulfilFilter { state?: string | undefined; bucket?: string | undefined; customer?: string | undefined; q?: string | undefined; review?: string | undefined; order?: string | undefined }
export function filterLines(lines: FulfilLine[], f: FulfilFilter): FulfilLine[] {
  const q = (f.q ?? "").trim().toLowerCase();
  return lines.filter((l) => (!f.state || l.state === f.state) && (!f.bucket || l.bucket === f.bucket) && (!f.customer || l.customer === f.customer) && (!f.order || l.order === f.order)
    && (f.review !== "1" || l.review.length > 0) && (!q || `${l.order} ${l.customer} ${l.customerName} ${l.item} ${l.itemName} ${l.warehouse}`.toLowerCase().includes(q)));
}

/** Native Sales Order list predicate for the same open-order population (order grain). */
export const openOrdersFilter = (company: string): Filter[] => [["company", "=", company], ["docstatus", "=", 1], ["status", "in", OPEN_ORDER]];

export interface OrderFulfilment { status: SourceStatus; linkStatus: SourceStatus; lines: FulfilLine[]; asOf: string }
/**
 * Scoped wrapper. Company headline fails closed: if the user cannot read every submitted Sales Order of the company the
 * screen shows Not Permitted instead of a partial backlog. Partly hidden Delivery Notes / Sales Invoices are not read
 * (`linkStatus`): the stored delivered/billed figures on the order lines remain the source and link checks are skipped.
 */
export function orderFulfilment(company: string, asOf = todayIso(), user = currentUser()): OrderFulfilment {
  const status = companyScope("Sales Order", company, user);
  if (status !== "ok") return { status, linkStatus: status, lines: [], asOf };
  const dn = companyScope("Delivery Note", company, user), si = companyScope("Sales Invoice", company, user);
  const linkStatus: SourceStatus = dn === "denied" || si === "denied" ? "denied" : dn !== "ok" || si !== "ok" ? "unavailable" : "ok";
  // A partly visible linked source is not read at all (its rows would understate deliveries/billing).
  return { status, linkStatus, lines: fulfilmentLines(scopedList("Sales Order", user), dn === "ok" ? scopedList("Delivery Note", user) : [], si === "ok" ? scopedList("Sales Invoice", user) : [], company, asOf, linkStatus === "ok"), asOf };
}
