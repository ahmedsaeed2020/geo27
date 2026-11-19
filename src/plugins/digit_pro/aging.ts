/** SC-F-05 aging selector: groups submitted Core invoices with outstanding_amount > 0 by party and due-date age. Read-only. */
import type { Doc } from "@/lib/adapter";
import { scopedList } from "@/lib/scope";
import { currentUser } from "@/lib/session";
import { sourceStatus, todayIso, type SourceStatus } from "./finance";

export const BUCKETS = ["Not due", "0–30 days", "31–60 days", "61–90 days", "Over 90 days"] as const;
export type Side = "receivable" | "payable";
export const sideDoctype = (s: Side) => (s === "receivable" ? "Sales Invoice" : "Purchase Invoice");
export const sidePartyField = (s: Side) => (s === "receivable" ? "customer" : "supplier");
const n = (v: unknown) => Number(v) || 0;
const r2 = (x: number) => Math.round(x * 100) / 100;

export function daysOverdue(due: string, today = todayIso()): number {
  if (!due) return 0;
  return Math.floor((Date.parse(today) - Date.parse(due)) / 86400000);
}
export function bucketOf(days: number): number { return days <= 0 ? 0 : days <= 30 ? 1 : days <= 60 ? 2 : days <= 90 ? 3 : 4; }

export interface AgingInvoice { doc: Doc; name: string; party: string; due: string; days: number; bucket: number; outstanding: number }
export interface AgingParty { party: string; buckets: number[]; total: number; invoices: AgingInvoice[] }
export interface Aging { status: SourceStatus; doctype: string; parties: AgingParty[]; totals: number[]; total: number }

export function agingFrom(rows: Doc[], side: Side, company: string, today = todayIso()): Omit<Aging, "status" | "doctype"> {
  const pf = sidePartyField(side);
  const m = new Map<string, AgingParty>();
  for (const d of rows) {
    if (n(d.docstatus) !== 1 || n(d["outstanding_amount"]) <= 0 || (company && d["company"] !== company)) continue;
    const due = String(d["due_date"] ?? d["posting_date"] ?? ""); const days = daysOverdue(due, today); const b = bucketOf(days);
    const party = String(d[pf] ?? ""); const p = m.get(party) ?? { party, buckets: [0, 0, 0, 0, 0], total: 0, invoices: [] };
    const o = n(d["outstanding_amount"]);
    p.buckets[b] = r2(p.buckets[b]! + o); p.total = r2(p.total + o);
    p.invoices.push({ doc: d, name: d.name, party, due, days, bucket: b, outstanding: o });
    m.set(party, p);
  }
  const parties = [...m.values()].sort((a, b) => b.total - a.total);
  for (const p of parties) p.invoices.sort((a, b) => b.days - a.days);
  const totals = [0, 1, 2, 3, 4].map((i) => r2(parties.reduce((s, p) => s + p.buckets[i]!, 0)));
  return { parties, totals, total: r2(totals.reduce((s, x) => s + x, 0)) };
}

export function aging(side: Side, company: string, user = currentUser()): Aging {
  const dt = sideDoctype(side); const status = sourceStatus(dt, user);
  if (status !== "ok") return { status, doctype: dt, parties: [], totals: [0, 0, 0, 0, 0], total: 0 };
  return { status, doctype: dt, ...agingFrom(scopedList(dt, user), side, company) };
}

/* ---------- RXP-01 as-of receivable/payable register (CFO-AR-AGING / CFO-AP-DUE) ----------
 * Same method as the Core "Accounts Receivable"/"Accounts Payable" runner check: an invoice's open balance on the
 * as-of date is its current outstanding_amount with posted ledger movements dated AFTER the as-of date taken back out
 * (payments, credit notes and journal allocations against the invoice). Invoices posted after the as-of date are
 * excluded. Negative balances (credit notes / over-allocation) are a separate "Unallocated credits" segment and are
 * never aged. Read-only; no payment is created or allocated here. */
export const SEGMENTS = [...BUCKETS, "Unallocated credits"] as const;
export const SEGMENTS_AR = ["غير مستحق", "0–30 يومًا", "31–60 يومًا", "61–90 يومًا", "أكثر من 90 يومًا", "أرصدة دائنة غير مخصصة"] as const;
export const CREDIT_SEGMENT = 5;
export type ArStatus = "Unpaid" | "Partly paid" | "Credit note" | "Unallocated credit";
/** `adjusted` = ledger movements dated after the as-of date that were taken back out of the stored outstanding (e.g. a future-dated payment).
 *  `orders`/`fulfilments` = distinct native child-row links (purchase_order/purchase_receipt or sales_order/delivery_note).
 *  `onHold` = Purchase Invoice on_hold still active on the as-of date (no release_date, or release_date after it) — ERPNext
 *  refuses payment of such invoices (get_outstanding_reference_documents), so no payment action is offered. */
export interface ArRow { name: string; party: string; partyName: string; company: string; posting: string; due: string; days: number; bucket: number; outstanding: number; grand: number; currency: string; status: ArStatus; isReturn: boolean; adjusted: number; orders: string[]; fulfilments: string[]; onHold: boolean; releaseDate: string; holdNote: string }
export interface ArRegister { status: SourceStatus; doctype: string; asOf: string; historical: boolean; reason?: "gl" | undefined; /** false = ledger unreadable, so future-dated movements could not be taken out */ glChecked: boolean; rows: ArRow[] }
export interface ArFilter { bucket?: string | undefined; party?: string | undefined; q?: string | undefined; overdue?: string | undefined }
const validIso = (v: string | undefined) => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v;
export const asOfOf = (v: string | undefined, today = todayIso()) => (validIso(v) ? v! : today);

export function arRegisterFrom(invoices: Doc[], gl: Doc[], side: Side, company: string, asOf: string): ArRow[] {
  const pf = sidePartyField(side); const dt = sideDoctype(side); const partyType = side === "receivable" ? "Customer" : "Supplier";
  const sg = side === "receivable" ? 1 : -1;
  const later = new Map<string, number>();
  for (const e of gl) {
    if (n(e["is_cancelled"]) || e["party_type"] !== partyType || String(e["posting_date"] ?? "") <= asOf) continue;
    if (e["against_voucher_type"] && e["against_voucher_type"] !== dt) continue;
    const inv = String(e["against_voucher"] ?? ""); if (!inv) continue;
    later.set(inv, (later.get(inv) ?? 0) + sg * (n(e["debit"]) - n(e["credit"])));
  }
  const out: ArRow[] = [];
  for (const d of invoices) {
    if (n(d.docstatus) !== 1 || (company && d["company"] !== company) || String(d["posting_date"] ?? "") > asOf) continue;
    const adjusted = r2(-(later.get(d.name) ?? 0)) || 0; // `|| 0` normalises -0
    const bal = r2(n(d["outstanding_amount"]) + adjusted);
    if (Math.abs(bal) < 0.005) continue;
    const due = String(d["due_date"] || d["posting_date"] || ""); const isReturn = !!n(d["is_return"]);
    const credit = bal < 0; const days = credit ? 0 : daysOverdue(due, asOf);
    const total = n(d["base_rounded_total"]) || n(d["base_grand_total"]) || n(d["rounded_total"]) || n(d["grand_total"]);
    const items = Array.isArray(d["items"]) ? (d["items"] as Record<string, unknown>[]) : [];
    const links = (f: string) => [...new Set(items.map((i) => String(i[f] ?? "")).filter(Boolean))].sort();
    const releaseDate = String(d["release_date"] ?? "");
    out.push({ name: d.name, party: String(d[pf] ?? ""), partyName: String(d[`${pf}_name`] || d[pf] || ""), company: String(d["company"] ?? ""), posting: String(d["posting_date"] ?? ""), due, days,
      bucket: credit ? CREDIT_SEGMENT : bucketOf(days), outstanding: bal, grand: r2(total), currency: String(d["party_account_currency"] || d["currency"] || ""),
      status: credit ? (isReturn ? "Credit note" : "Unallocated credit") : bal >= total - 0.005 ? "Unpaid" : "Partly paid", isReturn, adjusted,
      orders: links(side === "payable" ? "purchase_order" : "sales_order"), fulfilments: links(side === "payable" ? "purchase_receipt" : "delivery_note"),
      onHold: side === "payable" && !!n(d["on_hold"]) && (!releaseDate || releaseDate > asOf), releaseDate, holdNote: String(d["hold_comment"] ?? "") });
  }
  return out;
}

export function arRegister(side: Side, company: string, asOfRaw: string | undefined, user = currentUser(), today = todayIso()): ArRegister {
  const dt = sideDoctype(side); const asOf = asOfOf(asOfRaw, today); const historical = asOf < today;
  const status = sourceStatus(dt, user);
  if (status !== "ok") return { status, doctype: dt, asOf, historical, glChecked: false, rows: [] };
  // Ledger movements dated after the as-of date (payments, credit notes — including future-dated ones) are taken back out.
  // A past date without ledger access fails closed instead of showing current balances as historical.
  const g = sourceStatus("GL Entry", user);
  if (historical && g !== "ok") return { status: g, doctype: "GL Entry", asOf, historical, reason: "gl", glChecked: false, rows: [] };
  const gl: Doc[] = g === "ok" ? scopedList("GL Entry", user) : [];
  return { status, doctype: dt, asOf, historical, glChecked: g === "ok", rows: arRegisterFrom(scopedList(dt, user), gl, side, company, asOf) };
}

/** Same predicate for rows AND totals. `bucket` is a segment index 0..5; overdue = days past due > 0. */
export function filterAr(rows: ArRow[], f: ArFilter, ignoreBucket = false): ArRow[] {
  const q = (f.q ?? "").trim().toLowerCase(); const b = f.bucket !== undefined && f.bucket !== "" && !ignoreBucket ? Number(f.bucket) : undefined;
  return rows.filter((r) => (b === undefined || r.bucket === b) && (!f.party || r.party === f.party) && (f.overdue !== "1" || r.days > 0)
    && (!q || r.party.toLowerCase().includes(q) || r.partyName.toLowerCase().includes(q) || r.name.toLowerCase().includes(q)));
}
/** Totals per currency — mixed currencies are never summed together. */
export function currencyTotals(rows: ArRow[]): { currency: string; amount: number; count: number }[] {
  const m = new Map<string, { currency: string; amount: number; count: number }>();
  for (const r of rows) { const x = m.get(r.currency) ?? { currency: r.currency, amount: 0, count: 0 }; x.amount = r2(x.amount + r.outstanding); x.count++; m.set(r.currency, x); }
  return [...m.values()].sort((a, b) => b.count - a.count || a.currency.localeCompare(b.currency));
}
export function segmentTotals(rows: ArRow[]): { bucket: number; count: number; totals: { currency: string; amount: number; count: number }[] }[] {
  return SEGMENTS.map((_, i) => { const rs = rows.filter((r) => r.bucket === i); return { bucket: i, count: rs.length, totals: currencyTotals(rs) }; });
}
export function sortAr(rows: ArRow[], sort: { field: string; dir: "asc" | "desc" } | null): ArRow[] {
  if (!sort) return rows;
  const k = sort.field; const m = sort.dir === "asc" ? 1 : -1;
  const v = (r: ArRow): string | number => k === "days" ? r.days : k === "outstanding" ? r.outstanding : k === "due_date" ? r.due : k === "posting_date" ? r.posting : k === "party" ? r.partyName : r.name;
  return [...rows].sort((a, b) => { const x = v(a), y = v(b); return (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y))) * m || a.name.localeCompare(b.name); });
}

/**
 * Owner OWN-57 — the native Accounts Receivable / Payable reports show unallocated party payments ("advances") next to
 * invoice outstanding. Three lines per company (and optionally one party): invoice outstanding (the register rows),
 * unallocated payments (submitted Payment Entries of the party type with an unallocated amount, posted on or before the
 * as-of date) and the net balance = outstanding − unallocated.
 */
export interface BalanceLines { outstanding: number; unallocated: number; net: number; payments: string[]; status: SourceStatus }
export function balanceLines(side: Side, rows: ArRow[], company: string, asOf: string, user = currentUser(), party?: string): BalanceLines {
  const outstanding = r2(rows.filter((x) => !party || x.party === party).reduce((s, x) => s + x.outstanding, 0));
  const st = sourceStatus("Payment Entry", user);
  if (st !== "ok") return { outstanding, unallocated: 0, net: outstanding, payments: [], status: st };
  const partyType = side === "receivable" ? "Customer" : "Supplier"; const type = side === "receivable" ? "Receive" : "Pay";
  const pes = scopedList("Payment Entry", user).filter((p) => n(p.docstatus) === 1 && p["party_type"] === partyType && p["payment_type"] === type && (!company || p["company"] === company)
    && String(p["posting_date"] ?? "") <= asOf && n(p["unallocated_amount"]) > 0.005 && (!party || p["party"] === party));
  const unallocated = r2(pes.reduce((s, p) => s + n(p["unallocated_amount"]), 0));
  return { outstanding, unallocated, net: r2(outstanding - unallocated), payments: pes.map((p) => p.name).sort(), status: "ok" };
}
