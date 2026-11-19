/**
 * RXP-03 / SC-S-02 — Customer 360 (/pro/customer-360). Read-only profile over native Core records; no CRM or balance copy.
 *
 *  - Identity from the native Customer (+ linked Contact / Address through their `links` child rows).
 *  - Receivable position from the shared as-of AR register (aging.ts) — the same rows as /pro/receivables, per currency.
 *  - Credit exposure uses Core's check_credit_limit basis (src/lib/selling.ts customerOutstanding: ledger balance + open
 *    order value not yet billed + unbilled deliveries without an order), shown only when those sources are readable.
 *  - Quotations / Orders / Deliveries / Invoices / Payments / Returns tabs list the customer's native documents of the
 *    selected company. Each tab fails closed on its own: if any of the customer's documents of that type is hidden from
 *    the user, the tab says Not Permitted rather than showing a partial history.
 */
import { adapter, type Doc } from "@/lib/adapter";
import { scopedList } from "@/lib/scope";
import { currentUser } from "@/lib/session";
import { creditLimit, customerOutstanding } from "@/lib/selling";
import { arRegister, CREDIT_SEGMENT, type ArRow } from "./aging";
import { companyScope } from "./closeReview";
import { sourceStatus, todayIso, type SourceStatus } from "./finance";
import type { Bi, Filter } from "./command";
import { fulfilmentLines, OPEN_ORDER, totalsBy, type FulfilLine, type Totals } from "./orderFulfilment";
import { OPEN_QTN } from "./quotationPipeline";

const n = (v: unknown) => Number(v) || 0;
const s = (v: unknown) => String(v ?? "");
const r2 = (x: number) => Math.round(x * 100) / 100;
const base = (d: Doc) => Math.abs(n(d["base_grand_total"]) || n(d["grand_total"]));

export type CustTab = "quotations" | "orders" | "deliveries" | "invoices" | "payments" | "returns";
export const CUST_TABS: CustTab[] = ["quotations", "orders", "deliveries", "invoices", "payments", "returns"];
export const CUST_TAB_LABEL: Record<CustTab, Bi> = {
  quotations: ["Quotations", "عروض الأسعار"], orders: ["Sales orders", "أوامر البيع"], deliveries: ["Deliveries", "التسليمات"],
  invoices: ["Invoices", "الفواتير"], payments: ["Payments", "المدفوعات"], returns: ["Returns", "المرتجعات"],
};

export interface CustDoc { doctype: string; name: string; date: string; status: string; docstatus: number; amount: number; currency: string; outstanding: number | null; info: string; due: string }
export interface CustTabData { tab: CustTab; status: SourceStatus; doctypes: string[]; docs: CustDoc[]; list: { doctype: string; filters: Filter[] }[] }

/** Tab population predicates (company + customer link field of each native DocType). */
const TAB_SPEC: Record<CustTab, { doctype: string; party: string; extra?: (d: Doc) => boolean; filters: Filter[] }[]> = {
  quotations: [{ doctype: "Quotation", party: "party_name", extra: (d) => s(d["quotation_to"] || "Customer") === "Customer", filters: [["quotation_to", "=", "Customer"]] }],
  orders: [{ doctype: "Sales Order", party: "customer", filters: [] }],
  deliveries: [{ doctype: "Delivery Note", party: "customer", extra: (d) => !n(d["is_return"]), filters: [["is_return", "=", 0]] }],
  invoices: [{ doctype: "Sales Invoice", party: "customer", extra: (d) => !n(d["is_return"]), filters: [["is_return", "=", 0]] }],
  payments: [{ doctype: "Payment Entry", party: "party", extra: (d) => d["party_type"] === "Customer", filters: [["party_type", "=", "Customer"]] }],
  returns: [{ doctype: "Sales Invoice", party: "customer", extra: (d) => !!n(d["is_return"]), filters: [["is_return", "=", 1]] }, { doctype: "Delivery Note", party: "customer", extra: (d) => !!n(d["is_return"]), filters: [["is_return", "=", 1]] }],
};

/** Customer + company population of a DocType is fully readable (cancelled documents included in the check). */
export function partyStatus(dt: string, match: (d: Doc) => boolean, user = currentUser()): SourceStatus {
  const st = sourceStatus(dt, user); if (st !== "ok") return st;
  const readable = new Set(scopedList(dt, user).map((d) => d.name));
  return adapter.list(dt).some((d) => match(d) && !readable.has(d.name)) ? "denied" : "ok";
}

const docOf = (dt: string, d: Doc): CustDoc => {
  const date = s(d["posting_date"] || d["transaction_date"]);
  const amount = r2(Math.abs(n(dt === "Payment Entry" ? d["paid_amount"] : d["grand_total"])));
  const currency = s(dt === "Payment Entry" ? d["paid_from_account_currency"] || d["paid_to_account_currency"] : d["currency"]);
  const info = dt === "Quotation" ? s(d["valid_till"])
    : dt === "Sales Order" ? `${n(d["per_delivered"])}% · ${n(d["per_billed"])}%`
    : n(d["is_return"]) ? s(d["return_against"])
    : dt === "Payment Entry" ? s(d["mode_of_payment"] || d["reference_no"])
    : dt === "Delivery Note" ? `${n(d["per_billed"])}%` : "";
  return { doctype: dt, name: d.name, date, status: n(d.docstatus) === 0 ? "Draft" : n(d.docstatus) === 2 ? "Cancelled" : s(d["status"]) || "Submitted", docstatus: n(d.docstatus), amount, currency,
    outstanding: dt === "Sales Invoice" && n(d.docstatus) === 1 ? r2(n(d["outstanding_amount"])) : null, info, due: s(d["due_date"]) };
};

export function customerTabs(customer: string, company: string, user = currentUser()): CustTabData[] {
  return CUST_TABS.map((tab) => {
    const specs = TAB_SPEC[tab];
    let status: SourceStatus = "ok"; const docs: CustDoc[] = [];
    for (const sp of specs) {
      const match = (d: Doc) => d[sp.party] === customer && d["company"] === company && (!sp.extra || sp.extra(d));
      const st = partyStatus(sp.doctype, match, user);
      if (st !== "ok") { status = status === "denied" ? status : st; continue; }
      docs.push(...scopedList(sp.doctype, user).filter((d) => match(d) && n(d.docstatus) !== 2).map((d) => docOf(sp.doctype, d)));
    }
    return { tab, status, doctypes: specs.map((x) => x.doctype), docs: status === "ok" ? docs.sort((a, b) => b.date.localeCompare(a.date) || b.name.localeCompare(a.name)) : [],
      list: specs.map((sp) => ({ doctype: sp.doctype, filters: [["company", "=", company], [sp.party, "=", customer], ...sp.filters] as Filter[] })) };
  });
}

export interface Identity {
  name: string; customerName: string; group: string; territory: string; type: string; currency: string; priceList: string; paymentTerms: string; taxId: string; disabled: boolean;
  contact: { name: string; person: string; email: string; phone: string } | null; address: { name: string; text: string } | null;
}
const linked = (dt: string, customer: string, user: string) => (sourceStatus(dt, user) === "ok" ? scopedList(dt, user).filter((d) => (Array.isArray(d["links"]) ? (d["links"] as Doc[]) : []).some((l) => l["link_doctype"] === "Customer" && l["link_name"] === customer)) : []);
/** Owner notes B-08: payment terms as ERPNext resolves them for a new invoice — the customer's own template, else its
 *  Customer Group's; when neither is set, the terms the customer's latest submitted invoice carried. Empty only when none exists. */
function termsOf(c: Doc, user: string): string {
  const own = s(c["payment_terms"]); if (own) return own;
  const grp = s(c["customer_group"]) ? s(adapter.get("Customer Group", s(c["customer_group"]))?.["payment_terms"]) : ""; if (grp) return grp;
  if (sourceStatus("Sales Invoice", user) !== "ok") return "";
  const last = scopedList("Sales Invoice", user).filter((d) => d["customer"] === c.name && n(d.docstatus) === 1 && !n(d["is_return"])).sort((a, b) => s(b["posting_date"]).localeCompare(s(a["posting_date"])))[0];
  if (!last) return "";
  if (s(last["payment_terms_template"])) return s(last["payment_terms_template"]);
  // no template anywhere: the credit days the latest invoice was issued with (due date − posting date)
  const d = s(last["due_date"]) && s(last["posting_date"]) ? Math.round((Date.parse(s(last["due_date"])) - Date.parse(s(last["posting_date"]))) / 86400000) : NaN;
  return Number.isFinite(d) ? (d <= 0 ? "Due on Receipt" : `Net ${d}`) : "";
}
export function customerIdentity(c: Doc, user = currentUser()): Identity {
  const contacts = linked("Contact", c.name, user); const ct = contacts.find((x) => x.name === c["customer_primary_contact"]) ?? contacts.find((x) => n(x["is_primary_contact"])) ?? contacts[0];
  const addrs = linked("Address", c.name, user); const ad = addrs.find((x) => n(x["is_primary_address"])) ?? addrs.find((x) => x["address_type"] === "Billing") ?? addrs[0];
  return {
    name: c.name, customerName: s(c["customer_name"] || c.name), group: s(c["customer_group"]), territory: s(c["territory"]), type: s(c["customer_type"]), currency: s(c["default_currency"]),
    priceList: s(c["default_price_list"]), paymentTerms: termsOf(c, user), taxId: s(c["tax_id"]), disabled: !!n(c["disabled"]),
    contact: ct ? { name: ct.name, person: [s(ct["first_name"]), s(ct["last_name"])].filter(Boolean).join(" "), email: s(ct["email_id"] || c["email_id"]), phone: s(ct["mobile_no"] || ct["phone"] || c["mobile_no"]) } : null,
    address: ad ? { name: ad.name, text: [s(ad["address_line1"]), s(ad["city"]), s(ad["country"])].filter(Boolean).join("، ") } : null,
  };
}

export interface AgeBand { bucket: number; count: number; totals: Totals }
export interface Receivable { status: SourceStatus; rows: ArRow[]; outstanding: Totals; overdue: Totals; overdueCount: number; bands: AgeBand[] }
export function customerReceivable(customer: string, company: string, asOf: string, user = currentUser()): Receivable {
  const reg = arRegister("receivable", company, asOf, user, todayIso());
  const st = reg.status === "ok" ? partyStatus("Sales Invoice", (d) => d["customer"] === customer && d["company"] === company && n(d.docstatus) === 1, user) : reg.status;
  const rows = st === "ok" ? reg.rows.filter((r) => r.party === customer) : [];
  const open = rows.filter((r) => Math.abs(r.outstanding) > 0.004);
  return {
    status: st, rows: open, outstanding: totalsBy(open, (r) => r.currency, (r) => r.outstanding), overdue: totalsBy(open.filter((r) => r.days > 0), (r) => r.currency, (r) => r.outstanding),
    overdueCount: open.filter((r) => r.days > 0 && r.outstanding > 0).length,
    bands: [0, 1, 2, 3, 4, CREDIT_SEGMENT].map((b) => { const xs = open.filter((r) => r.bucket === b); return { bucket: b, count: xs.length, totals: totalsBy(xs, (r) => r.currency, (r) => r.outstanding) }; }),
  };
}

export interface Credit { status: SourceStatus; limit: number; exposure: number; available: number | null; bypass: boolean }
export function customerCredit(customer: string, company: string, user = currentUser()): Credit {
  // customerOutstanding reads the company's GL, open orders and unbilled deliveries — every one must be fully readable.
  const st = ["GL Entry", "Sales Order", "Delivery Note"].map((dt) => companyScope(dt, company, user)).find((x) => x !== "ok") ?? "ok";
  if (st !== "ok") return { status: st, limit: 0, exposure: 0, available: null, bypass: false };
  const lim = creditLimit(customer, company); const exposure = customerOutstanding(customer, company);
  return { status: "ok", limit: lim.limit, exposure, available: lim.limit ? r2(lim.limit - exposure) : null, bypass: lim.bypass };
}

export interface TrendMonth { month: string; invoiced: number; credited: number; invoices: number }
export function customerTrend(invoices: Doc[], customer: string, company: string, months: string[]): TrendMonth[] {
  const sub = invoices.filter((d) => d["customer"] === customer && d["company"] === company && n(d.docstatus) === 1);
  return months.map((month) => { const xs = sub.filter((d) => s(d["posting_date"]).slice(0, 7) === month); const inv = xs.filter((d) => !n(d["is_return"]));
    return { month, invoiced: r2(inv.reduce((a, d) => a + base(d), 0)), credited: r2(xs.filter((d) => n(d["is_return"])).reduce((a, d) => a + base(d), 0)), invoices: inv.length }; });
}

export function lastMonthsTo(asOf: string, k = 12): string[] {
  const [y, m] = asOf.split("-").map(Number) as [number, number];
  return Array.from({ length: k }, (_, i) => new Date(Date.UTC(y, m - 1 - (k - 1 - i), 1)).toISOString().slice(0, 7));
}

export interface CustomerProfile {
  status: SourceStatus | "missing"; identity: Identity | null; receivable: Receivable; credit: Credit; tabs: CustTabData[];
  lines: FulfilLine[]; lineStatus: SourceStatus; trend: TrendMonth[]; trendStatus: SourceStatus;
  quotes: { open: number; openValue: Totals; lapsed: number };
}
const EMPTY_AR: Receivable = { status: "denied", rows: [], outstanding: [], overdue: [], overdueCount: 0, bands: [] };
export function customerProfile(customer: string, company: string, asOf = todayIso(), user = currentUser()): CustomerProfile {
  const cst = sourceStatus("Customer", user);
  const c = cst === "ok" ? scopedList("Customer", user).find((d) => d.name === customer) : undefined;
  const empty = { identity: null, receivable: EMPTY_AR, credit: { status: "denied" as SourceStatus, limit: 0, exposure: 0, available: null, bypass: false }, tabs: [], lines: [], lineStatus: "denied" as SourceStatus, trend: [], trendStatus: "denied" as SourceStatus, quotes: { open: 0, openValue: [], lapsed: 0 } };
  if (cst !== "ok") return { status: cst, ...empty };
  if (!c) return { status: adapter.get("Customer", customer) ? "denied" : "missing", ...empty };
  const tabs = customerTabs(customer, company, user);
  const tabOf = (t: CustTab) => tabs.find((x) => x.tab === t)!;
  const ord = tabOf("orders"); const inv = tabOf("invoices"); const ret = tabOf("returns");
  const lineStatus = ord.status;
  const mine = (d: Doc) => d["customer"] === customer;
  // Linked deliveries/invoices are read only when all of this customer's documents of that type are readable.
  const dnOk = tabOf("deliveries").status === "ok" && ret.status === "ok", siOk = inv.status === "ok" && ret.status === "ok";
  const lines = lineStatus === "ok" ? fulfilmentLines(scopedList("Sales Order", user).filter(mine), dnOk ? scopedList("Delivery Note", user).filter(mine) : [], siOk ? scopedList("Sales Invoice", user).filter(mine) : [], company, asOf, dnOk && siOk) : [];
  const trendStatus: SourceStatus = inv.status !== "ok" ? inv.status : ret.status !== "ok" ? ret.status : "ok";
  const trend = trendStatus === "ok" ? customerTrend(scopedList("Sales Invoice", user), customer, company, lastMonthsTo(asOf)) : [];
  const q = tabOf("quotations").docs.filter((d) => d.docstatus === 1 && OPEN_QTN.includes(d.status));
  return {
    status: "ok", identity: customerIdentity(c, user), receivable: customerReceivable(customer, company, asOf, user), credit: customerCredit(customer, company, user), tabs,
    lines, lineStatus, trend, trendStatus,
    quotes: { open: q.filter((d) => !d.info || d.info >= asOf).length, openValue: totalsBy(q.filter((d) => !d.info || d.info >= asOf), (d) => d.currency, (d) => d.amount), lapsed: q.filter((d) => d.info && d.info < asOf).length },
  };
}

/* ---------------- Directory (no customer selected) ---------------- */
export interface DirRow { customer: string; customerName: string; group: string; territory: string; disabled: boolean; outstanding: Totals; overdue: Totals; openOrders: number; lastInvoice: string; invoiced12: number }
export interface Directory { status: SourceStatus; arStatus: SourceStatus; orderStatus: SourceStatus; rows: DirRow[] }
export function customerDirectory(company: string, asOf = todayIso(), user = currentUser()): Directory {
  const status = sourceStatus("Customer", user);
  if (status !== "ok") return { status, arStatus: status, orderStatus: status, rows: [] };
  const reg = arRegister("receivable", company, asOf, user, todayIso());
  const arStatus = reg.status === "ok" ? companyScope("Sales Invoice", company, user) : reg.status;
  const orderStatus = companyScope("Sales Order", company, user);
  const from12 = `${lastMonthsTo(asOf)[0]}-01`;
  const sis = arStatus === "ok" ? scopedList("Sales Invoice", user).filter((d) => d["company"] === company && n(d.docstatus) === 1) : [];
  const sos = orderStatus === "ok" ? scopedList("Sales Order", user).filter((d) => d["company"] === company && n(d.docstatus) === 1 && OPEN_ORDER.includes(s(d["status"]))) : [];
  const rows = scopedList("Customer", user).map<DirRow>((c) => {
    const ar = arStatus === "ok" ? reg.rows.filter((r) => r.party === c.name && Math.abs(r.outstanding) > 0.004) : [];
    const mine = sis.filter((d) => d["customer"] === c.name);
    return {
      customer: c.name, customerName: s(c["customer_name"] || c.name), group: s(c["customer_group"]), territory: s(c["territory"]), disabled: !!n(c["disabled"]),
      outstanding: totalsBy(ar, (r) => r.currency, (r) => r.outstanding), overdue: totalsBy(ar.filter((r) => r.days > 0), (r) => r.currency, (r) => r.outstanding),
      openOrders: sos.filter((d) => d["customer"] === c.name).length, lastInvoice: mine.filter((d) => !n(d["is_return"])).map((d) => s(d["posting_date"])).sort().pop() ?? "",
      invoiced12: r2(mine.filter((d) => s(d["posting_date"]) >= from12 && s(d["posting_date"]) <= asOf).reduce((a, d) => a + (n(d["is_return"]) ? -base(d) : base(d)), 0)),
    };
  });
  const primary = (t: Totals) => t[0]?.amount ?? 0;
  return { status, arStatus, orderStatus, rows: rows.sort((a, b) => primary(b.outstanding) - primary(a.outstanding) || b.invoiced12 - a.invoiced12 || a.customerName.localeCompare(b.customerName)) };
}
