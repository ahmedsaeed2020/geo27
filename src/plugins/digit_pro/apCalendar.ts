/**
 * RXP-02 / SC-F-07 AP payment calendar (CFO-AP-DUE). Pure selectors over the as-of AP register rows (aging.ts):
 *  - due windows relative to the as-of date — one predicate (`dueBandOf`) for band totals, register rows and drill;
 *  - PO commitments are a SEPARATE, current-only series (openPo.ts lines: order amount not yet billed, by expected
 *    delivery date) and are never added to payables; `dueBandRange` gives the identical inclusive window used by the
 *    Open Purchase Orders register (`inSchedule`), so a commitment figure and its destination rows reconcile;
 *  - supplier concentration per currency (mixed currencies are never summed);
 *  - review exceptions: active hold (native on_hold/release_date) and invoices without any PO or receipt link.
 * Read-only; no payment, allocation or hold release happens here.
 */
import { currencyTotals, type ArRow } from "./aging";
import type { OpenPoLine } from "./openPo";

export const DUE_BANDS = ["overdue", "w1", "w2", "w3", "w4", "later"] as const;
export type DueBand = (typeof DUE_BANDS)[number];
export const AP_EXCEPTIONS = ["hold", "nosource"] as const;
export type ApException = (typeof AP_EXCEPTIONS)[number];

const DAY = 864e5;
const r2 = (x: number) => Math.round(x * 100) / 100;
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
const at = (d: string) => Date.parse(`${d}T00:00:00Z`);
export const addDays = (d: string, k: number) => iso(at(d) + k * DAY);
const isBand = (v: string | undefined): v is DueBand => !!v && (DUE_BANDS as readonly string[]).includes(v);
const isEx = (v: string | undefined): v is ApException => !!v && (AP_EXCEPTIONS as readonly string[]).includes(v);

/** Overdue = due before the as-of date (same as "days overdue > 0"); W1 = as-of … +6, W2 = +7 … +13, …; Later ≥ +28. */
export function dueBandOf(due: string, asOf: string): DueBand {
  if (!due || due < asOf) return "overdue";
  const d = Math.round((at(due) - at(asOf)) / DAY);
  return d < 7 ? "w1" : d < 14 ? "w2" : d < 21 ? "w3" : d < 28 ? "w4" : "later";
}
/** Inclusive date window of a band — exactly the dates `dueBandOf` maps to that band. */
export function dueBandRange(b: DueBand, asOf: string): { from?: string; to?: string } {
  if (b === "overdue") return { to: addDays(asOf, -1) };
  if (b === "later") return { from: addDays(asOf, 28) };
  const i = Number(b.slice(1)) - 1;
  return { from: addDays(asOf, i * 7), to: addDays(asOf, i * 7 + 6) };
}

const BAND_EN: Record<DueBand, string> = { overdue: "Overdue", w1: "Week 1", w2: "Week 2", w3: "Week 3", w4: "Week 4", later: "Later" };
const BAND_AR: Record<DueBand, string> = { overdue: "متأخرة", w1: "الأسبوع 1", w2: "الأسبوع 2", w3: "الأسبوع 3", w4: "الأسبوع 4", later: "لاحقًا" };
export const dueBandLabel = (v: string, ar: boolean) => (isBand(v) ? (ar ? BAND_AR : BAND_EN)[v] : v);
const EX_EN: Record<ApException, string> = { hold: "On hold", nosource: "No purchase order or receipt" };
const EX_AR: Record<ApException, string> = { hold: "موقوفة عن السداد", nosource: "بدون أمر شراء أو إيصال استلام" };
export const apExceptionLabel = (v: string, ar: boolean) => (isEx(v) ? (ar ? EX_AR : EX_EN)[v] : v);

/** An invoice that is a liability (positive open balance); credits/debit notes are never scheduled for payment. */
export const isLiability = (r: ArRow) => r.outstanding > 0;
/** Direct invoice: no item row links a purchase order or receipt (returns reference the original invoice instead). */
export const isUnsourced = (r: ArRow) => isLiability(r) && !r.isReturn && !r.orders.length && !r.fulfilments.length;
export function matchesException(r: ArRow, ex: ApException): boolean {
  return ex === "hold" ? isLiability(r) && r.onHold : isUnsourced(r);
}

/** Calendar + exception predicates (applied after the shared aging filters). `ignoreBand` → the calendar distribution itself. */
export function filterAp(rows: ArRow[], f: { due_band?: string | undefined; ex?: string | undefined }, asOf: string, ignoreBand = false): ArRow[] {
  const band = !ignoreBand && isBand(f.due_band) ? f.due_band : undefined;
  const ex = isEx(f.ex) ? f.ex : undefined;
  if (!band && !ex) return rows;
  return rows.filter((r) => (!band || (isLiability(r) && dueBandOf(r.due, asOf) === band)) && (!ex || matchesException(r, ex)));
}

export interface CalendarBand { band: DueBand; from?: string | undefined; to?: string | undefined; count: number; totals: { currency: string; amount: number; count: number }[] }
export function dueCalendar(rows: ArRow[], asOf: string): { bands: CalendarBand[]; credits: number } {
  const open = rows.filter(isLiability);
  return {
    bands: DUE_BANDS.map((band) => { const rs = open.filter((r) => dueBandOf(r.due, asOf) === band); return { band, ...dueBandRange(band, asOf), count: rs.length, totals: currencyTotals(rs) }; }),
    credits: rows.length - open.length,
  };
}

export interface CommitmentBand { band: DueBand; lines: number; orders: number; totals: { currency: string; toBill: number }[] }
/** Order amount not yet billed, by expected delivery window. `lines` are Open Purchase Orders register lines (still to
 *  receive or bill), so a band's line count and "to bill" totals equal that register filtered to the same window.
 *  Lines without an expected date are counted, never placed. */
export function commitmentCalendar(lines: OpenPoLine[], asOf: string): { bands: CommitmentBand[]; undated: number } {
  const dated = lines.filter((l) => !!l.due);
  return {
    bands: DUE_BANDS.map((band) => {
      const ls = dated.filter((l) => dueBandOf(l.due, asOf) === band);
      const cur = [...new Set(ls.map((l) => l.currency))].sort();
      return { band, lines: ls.length, orders: new Set(ls.map((l) => l.po)).size, totals: cur.map((currency) => ({ currency, toBill: r2(ls.filter((l) => l.currency === currency).reduce((s, l) => s + l.toBill, 0)) })) };
    }),
    undated: lines.filter((l) => !l.due).length,
  };
}

export interface Concentration { currency: string; total: number; top: { party: string; partyName: string; amount: number; share: number; count: number }[]; others: { amount: number; share: number; parties: number } }
/** Share of the open payable per supplier within one currency (top `limit`, remainder aggregated). */
export function supplierConcentration(rows: ArRow[], limit = 5): Concentration[] {
  const byCur = new Map<string, Map<string, { party: string; partyName: string; amount: number; count: number }>>();
  for (const r of rows.filter(isLiability)) {
    const m = byCur.get(r.currency) ?? new Map(); const p = m.get(r.party) ?? { party: r.party, partyName: r.partyName, amount: 0, count: 0 };
    p.amount = r2(p.amount + r.outstanding); p.count++; m.set(r.party, p); byCur.set(r.currency, m);
  }
  return [...byCur].map(([currency, m]) => {
    const all = [...m.values()].sort((a, b) => b.amount - a.amount || a.party.localeCompare(b.party));
    const total = r2(all.reduce((s, p) => s + p.amount, 0));
    const share = (v: number) => (total ? Math.round((v / total) * 1000) / 10 : 0);
    const top = all.slice(0, limit).map((p) => ({ ...p, share: share(p.amount) }));
    const rest = all.slice(limit); const restAmt = r2(rest.reduce((s, p) => s + p.amount, 0));
    return { currency, total, top, others: { amount: restAmt, share: share(restAmt), parties: rest.length } };
  }).sort((a, b) => b.total - a.total);
}

export function exceptionCounts(rows: ArRow[]): Record<ApException, number> {
  return { hold: rows.filter((r) => matchesException(r, "hold")).length, nosource: rows.filter(isUnsourced).length };
}
