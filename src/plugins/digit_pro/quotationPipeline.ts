/**
 * RXP-03 / SC-S-03 — Quotation pipeline (/pro/quotation-pipeline). Read-only over native Quotation records.
 *
 * Outcome of each quotation comes from its native status and links only:
 *  - Ordered / Partly ordered: native status (written by Core's status updater from Sales Order Item.prevdoc_docname);
 *  - Lost / Expired: native status; lost reasons from the `lost_reasons` child table (plus the free-text note);
 *  - Open past validity: still Open/Replied while `valid_till` is before the as-of date (ERPNext's daily job would mark it
 *    Expired; the preview shows the gap instead of hiding it);
 *  - Draft: not submitted.
 * Linked orders are the submitted Sales Orders whose lines point at the quotation (`prevdoc_docname`).
 * Month cohorts are DOCUMENT COUNTS by quotation date — never a conversion probability or a value-weighted rate.
 */
import type { Doc } from "@/lib/adapter";
import { scopedList } from "@/lib/scope";
import { currentUser } from "@/lib/session";
import { companyScope } from "./closeReview";
import { todayIso, type SourceStatus } from "./finance";
import type { Bi, Filter } from "./command";
import { daysBetween, plusDays, totalsBy, type Totals } from "./orderFulfilment";

const n = (v: unknown) => Number(v) || 0;
const s = (v: unknown) => String(v ?? "");
const r2 = (x: number) => Math.round(x * 100) / 100;
const rows = (d: Doc, f = "items"): Doc[] => (Array.isArray(d[f]) ? (d[f] as Doc[]) : []);

export const OPEN_QTN = ["Open", "Replied", "Partially Ordered"];
export type Outcome = "ordered" | "partial" | "lost" | "expired" | "lapsed" | "open" | "draft";
export const OUTCOMES: Outcome[] = ["open", "lapsed", "partial", "ordered", "lost", "expired", "draft"];
export const OUTCOME_LABEL: Record<Outcome, Bi> = {
  open: ["Open", "مفتوح"], lapsed: ["Open past validity", "مفتوح بعد انتهاء الصلاحية"], partial: ["Partly ordered", "طُلب جزئيًا"], ordered: ["Ordered", "تم الطلب"],
  lost: ["Lost", "مفقود"], expired: ["Expired", "منتهي الصلاحية"], draft: ["Draft", "مسودة"],
};
export type ExpiryBin = "lapsed" | "d7" | "d30" | "later" | "none";
export const EXPIRY_BINS: ExpiryBin[] = ["lapsed", "d7", "d30", "later", "none"];
export const BIN_LABEL: Record<ExpiryBin, Bi> = {
  lapsed: ["Validity passed", "انتهت الصلاحية"], d7: ["Expires in 7 days", "تنتهي خلال 7 أيام"], d30: ["8–30 days", "من 8 إلى 30 يومًا"], later: ["Later", "لاحقًا"], none: ["No validity date", "بدون تاريخ صلاحية"],
};

export interface QuoteRow {
  name: string; customer: string; customerName: string; quotationTo: string; date: string; validTill: string; daysToExpiry: number | null;
  currency: string; amount: number; base: number; status: string; docstatus: number; outcome: Outcome; bin: ExpiryBin | null;
  orders: string[]; draftOrders: string[]; lostReasons: string[]; lostNote: string; items: number;
}

const outcomeOf = (d: Doc, asOf: string): Outcome => {
  if (n(d.docstatus) === 0) return "draft";
  const st = s(d["status"]);
  if (st === "Ordered") return "ordered";
  if (st === "Partially Ordered") return "partial";
  if (st === "Lost") return "lost";
  if (st === "Expired") return "expired";
  const vt = s(d["valid_till"]);
  return vt && vt < asOf ? "lapsed" : "open";
};
const binOf = (vt: string, asOf: string): ExpiryBin => !vt ? "none" : vt < asOf ? "lapsed" : vt <= plusDays(asOf, 7) ? "d7" : vt <= plusDays(asOf, 30) ? "d30" : "later";

/** Pure: company quotations (cancelled excluded) with outcome, expiry bin and linked Sales Orders. */
export function quotationRows(quotes: Doc[], orders: Doc[], company: string, asOf: string): QuoteRow[] {
  const linked = new Map<string, { sub: Set<string>; draft: Set<string> }>();
  for (const o of orders.filter((d) => d["company"] === company && n(d.docstatus) !== 2)) for (const r of rows(o)) {
    const q = s(r["prevdoc_docname"]); if (!q) continue;
    const e = linked.get(q) ?? linked.set(q, { sub: new Set(), draft: new Set() }).get(q)!;
    (n(o.docstatus) === 1 ? e.sub : e.draft).add(o.name);
  }
  return quotes.filter((d) => d["company"] === company && n(d.docstatus) !== 2).map((d) => {
    const outcome = outcomeOf(d, asOf); const vt = s(d["valid_till"]);
    const live = outcome === "open" || outcome === "lapsed" || outcome === "partial";
    return {
      name: d.name, customer: s(d["party_name"]), customerName: s(d["customer_name"] || d["party_name"]), quotationTo: s(d["quotation_to"] || "Customer"),
      date: s(d["transaction_date"]), validTill: vt, daysToExpiry: vt ? daysBetween(asOf, vt) : null,
      currency: s(d["currency"]), amount: r2(n(d["grand_total"])), base: r2(n(d["base_grand_total"]) || n(d["grand_total"])), status: s(d["status"]), docstatus: n(d.docstatus),
      outcome, bin: live ? binOf(vt, asOf) : null,
      orders: [...(linked.get(d.name)?.sub ?? [])].sort(), draftOrders: [...(linked.get(d.name)?.draft ?? [])].sort(),
      lostReasons: rows(d, "lost_reasons").map((r) => s(r["lost_reason"])).filter(Boolean), lostNote: s(d["order_lost_reason"]).trim(), items: rows(d).length,
    };
  }).sort((a, b) => (a.bin === null ? 1 : 0) - (b.bin === null ? 1 : 0) || (a.validTill || "9999").localeCompare(b.validTill || "9999") || b.date.localeCompare(a.date));
}

export interface PipelineSummary {
  byOutcome: Record<Outcome, { count: number; value: Totals }>;
  byBin: Record<ExpiryBin, { count: number; value: Totals }>;
  orderedWithoutLink: number;
}
export function pipelineSummary(rs: QuoteRow[]): PipelineSummary {
  const byOutcome = Object.fromEntries(OUTCOMES.map((o) => { const xs = rs.filter((r) => r.outcome === o); return [o, { count: xs.length, value: totalsBy(xs, (r) => r.currency, (r) => r.amount) }]; })) as PipelineSummary["byOutcome"];
  const byBin = Object.fromEntries(EXPIRY_BINS.map((b) => { const xs = rs.filter((r) => r.bin === b); return [b, { count: xs.length, value: totalsBy(xs, (r) => r.currency, (r) => r.amount) }]; })) as PipelineSummary["byBin"];
  return { byOutcome, byBin, orderedWithoutLink: rs.filter((r) => (r.outcome === "ordered" || r.outcome === "partial") && !r.orders.length).length };
}

export interface Cohort { month: string; total: number; counts: Record<Outcome, number> }
/** Submitted quotations grouped by quotation month (inclusive range), counted by current outcome. */
export function outcomeCohorts(rs: QuoteRow[], from: string, to: string): Cohort[] {
  const months: string[] = [];
  if (from && to && from <= to) { let [y, m] = from.slice(0, 7).split("-").map(Number) as [number, number]; const end = to.slice(0, 7); for (let k = 0; k < 36; k++) { const ym = `${y}-${String(m).padStart(2, "0")}`; months.push(ym); if (ym >= end) break; m++; if (m > 12) { m = 1; y++; } } }
  return months.map((month) => {
    const xs = rs.filter((r) => r.docstatus === 1 && r.date.slice(0, 7) === month && r.date >= from && r.date <= to);
    return { month, total: xs.length, counts: Object.fromEntries(OUTCOMES.map((o) => [o, xs.filter((r) => r.outcome === o).length])) as Record<Outcome, number> };
  });
}

/** Lost reasons of lost quotations dated in the range; quotations with no reason are counted under "" (shown as "No reason recorded"). */
export function lostReasons(rs: QuoteRow[], from: string, to: string): { reason: string; count: number; quotes: string[] }[] {
  const m = new Map<string, string[]>();
  for (const r of rs.filter((x) => x.outcome === "lost" && x.date >= from && x.date <= to)) for (const reason of r.lostReasons.length ? r.lostReasons : [""]) m.set(reason, [...(m.get(reason) ?? []), r.name]);
  return [...m].map(([reason, quotes]) => ({ reason, count: quotes.length, quotes })).sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason));
}

export interface QuoteFilter { outcome?: string | undefined; bin?: string | undefined; customer?: string | undefined; q?: string | undefined; from?: string | undefined; to?: string | undefined }
export function filterQuotes(rs: QuoteRow[], f: QuoteFilter): QuoteRow[] {
  const q = (f.q ?? "").trim().toLowerCase();
  return rs.filter((r) => (!f.outcome || r.outcome === f.outcome) && (!f.bin || r.bin === f.bin) && (!f.customer || r.customer === f.customer)
    && (!f.from || r.date >= f.from) && (!f.to || r.date <= f.to) && (!q || `${r.name} ${r.customer} ${r.customerName}`.toLowerCase().includes(q)));
}

/** Native Quotation list predicates that reproduce an outcome / bin (null when the native list cannot express it exactly). */
export function nativeQuoteFilter(company: string, asOf: string, k: { outcome?: Outcome | undefined; bin?: ExpiryBin | undefined }): Filter[] | null {
  const base: Filter[] = [["company", "=", company]];
  if (k.bin) {
    const open: Filter[] = [...base, ["docstatus", "=", 1], ["status", "in", OPEN_QTN]];
    if (k.bin === "lapsed") return [...open, ["valid_till", "<", asOf]];
    if (k.bin === "d7") return [...open, ["valid_till", "between", [asOf, plusDays(asOf, 7)]]];
    if (k.bin === "d30") return [...open, ["valid_till", "between", [plusDays(asOf, 8), plusDays(asOf, 30)]]];
    if (k.bin === "later") return [...open, ["valid_till", ">", plusDays(asOf, 30)]];
    return null; // "no validity date" needs an is-not-set operator the shared filter type does not carry
  }
  switch (k.outcome) {
    case "draft": return [...base, ["docstatus", "=", 0]];
    case "ordered": return [...base, ["docstatus", "=", 1], ["status", "=", "Ordered"]];
    case "partial": return [...base, ["docstatus", "=", 1], ["status", "=", "Partially Ordered"]];
    case "lost": return [...base, ["docstatus", "=", 1], ["status", "=", "Lost"]];
    case "expired": return [...base, ["docstatus", "=", 1], ["status", "=", "Expired"]];
    case "lapsed": return [...base, ["docstatus", "=", 1], ["status", "in", ["Open", "Replied"]], ["valid_till", "<", asOf]];
    case "open": return null; // open = Open/Replied with validity not passed OR no validity date — not one native predicate
    default: return [...base, ["docstatus", "!=", 2]];
  }
}

export interface QuotationPipeline { status: SourceStatus; orderStatus: SourceStatus; rows: QuoteRow[]; asOf: string }
/** Scoped wrapper; fails closed when any company quotation is hidden. Hidden Sales Orders only hide the order links. */
export function quotationPipeline(company: string, asOf = todayIso(), user = currentUser()): QuotationPipeline {
  const status = companyScope("Quotation", company, user);
  if (status !== "ok") return { status, orderStatus: status, rows: [], asOf };
  const orderStatus = companyScope("Sales Order", company, user);
  return { status, orderStatus, rows: quotationRows(scopedList("Quotation", user), orderStatus === "ok" ? scopedList("Sales Order", user) : [], company, asOf), asOf };
}
