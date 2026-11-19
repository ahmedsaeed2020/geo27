/**
 * Comparison boards (owner interface round 2026-11-16, idea 5 «مقارنة العروض كأعمدة»): read models behind the shared
 * Enterprise ComparisonColumns on the procurement comparison page (RFQ ↔ Supplier Quotations, WS-07-02) and on the
 * bid leveling form (bid package ↔ subcontract bids, WS-03-04). Ranking reuses the department rules — supply.ts
 * quoteComparison (net, base currency, a missing item plugged at the highest other price) and tendering.ts
 * levelingCells / levelingSummary — so the column marked cheapest is the one the rules rank first among qualified offers.
 * Read only: awards go through services.ts (purchase orders) and the workflow engine (bid leveling).
 */
import { adapter, type Doc } from "@/lib/adapter";
import { num, r2, sumBy } from "./calc";
import { list, rows, today } from "./data";
import { quoteComparison } from "./supply";
import { levelingCells, levelingSummary } from "./tendering";
import { complianceOf, profileOf } from "./subcontract";

const s = (v: unknown) => (v === undefined || v === null ? "" : String(v));
const live = (d: Doc | undefined) => !!d && num(d.docstatus) !== 2;
const addDays = (d: string, n: number) => new Date(Date.parse(`${d.slice(0, 10)}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

// ---------------------------------------------------------------- RFQ ↔ supplier quotations
export type MuteReason = "draft" | "excluded" | "expired" | "hold" | "no-offer" | "non-compliant" | "no-profile";
export interface RfqLine { item_code: string; item_name: string; qty: number; awarded?: { po: string; quotation: string } | undefined; pick?: string | undefined }
export interface RfqCol {
  quotation: string; supplier: string; supplier_name: string; submitted: boolean; excluded: boolean; exclusion_reason: string;
  valid_till: string; expired: boolean; hold: boolean; qualified: boolean; mute?: MuteReason | undefined;
  /** Σ amount of the lines this quotation priced (as quoted) */
  quoted: number; complete: boolean; plugs: number;
  /** quoteComparison total (net, base currency, plugs at the highest other price); null for drafts */
  leveled: number | null; rank: number | null; cheapest: boolean;
  /** the purchase order created from this quotation (full or partial award) */
  pos: string[];
}
export interface RfqCell { rate: number | null; amount: number; plugged: boolean; best: boolean; awardedHere: boolean }
export interface RfqBoard { rfq: string; lines: RfqLine[]; cols: RfqCol[]; cells: Map<string, RfqCell>; anyAwarded: boolean }
export const cellKey = (item: string, q: string) => `${item}\u0000${q}`;

/** Every non-cancelled quotation that references the RFQ, as columns; qualified = submitted, not excluded, not expired, supplier not on hold. */
export function rfqBoard(rfq: string, on = today()): RfqBoard {
  const r = adapter.get("Request for Quotation", rfq);
  const sqs = list("Supplier Quotation", (q) => live(q) && rows(q, "items").some((i) => i["request_for_quotation"] === rfq));
  const lineOf = (q: Doc, item: string) => rows(q, "items").find((i) => s(i["item_code"]) === item && i["request_for_quotation"] === rfq);
  const cmp = quoteComparison(rfq); const lev = new Map(cmp.columns.map((c) => [c.quotation, c]));
  const names = new Set(sqs.map((q) => q.name));
  // awarded lines: a live purchase order line that came from one of this RFQ's quotations
  const awarded = new Map<string, { po: string; quotation: string }>();
  const posBy = new Map<string, Set<string>>();
  for (const po of list("Purchase Order", live)) for (const i of rows(po, "items")) {
    const q = s(i["supplier_quotation"]); if (!names.has(q)) continue;
    if (!awarded.has(s(i["item_code"]))) awarded.set(s(i["item_code"]), { po: po.name, quotation: q });
    posBy.set(q, new Set([...(posBy.get(q) ?? []), po.name]));
  }
  const items = rows(r, "items").map((i) => ({ item_code: s(i["item_code"]), item_name: s(i["item_name"]), qty: num(i["stock_qty"] ?? i["qty"]) || num(i["qty"]) }));
  const cols: RfqCol[] = sqs.map((q) => {
    const submitted = num(q.docstatus) === 1, excluded = !!num(q["digit_excluded"]);
    const vt = s(q["valid_till"]).slice(0, 10), expired = !!vt && vt < on;
    const sup = adapter.get("Supplier", s(q["supplier"])); const hold = !!num(sup?.["on_hold"]) || !!num(sup?.["disabled"]);
    const priced = items.filter((it) => lineOf(q, it.item_code));
    const lc = lev.get(q.name);
    const mute: MuteReason | undefined = !submitted ? "draft" : excluded ? "excluded" : expired ? "expired" : hold ? "hold" : undefined;
    return { quotation: q.name, supplier: s(q["supplier"]), supplier_name: s(q["supplier_name"] || sup?.["supplier_name"] || q["supplier"]), submitted, excluded, exclusion_reason: s(q["digit_exclusion_reason"]),
      valid_till: vt, expired, hold, qualified: !mute, mute, quoted: sumBy(priced, (it) => num(lineOf(q, it.item_code)?.["amount"])), complete: priced.length === items.length, plugs: items.length - priced.length,
      leveled: submitted && lc ? lc.total : null, rank: null, cheapest: false, pos: [...(posBy.get(q.name) ?? [])].sort() };
  });
  [...cols].filter((c) => c.qualified && c.leveled !== null).sort((a, b) => (a.leveled as number) - (b.leveled as number) || a.quotation.localeCompare(b.quotation)).forEach((c, i) => { c.rank = i + 1; c.cheapest = i === 0; });
  const cells = new Map<string, RfqCell>();
  const qual = cols.filter((c) => c.qualified);
  for (const it of items) {
    const rateOf = (c: RfqCol) => { const l = lineOf(sqs.find((q) => q.name === c.quotation)!, it.item_code); return l ? num(l["rate"]) : null; };
    const pool = (qual.length ? qual : cols).map(rateOf).filter((x): x is number => x !== null);
    const low = pool.length ? Math.min(...pool) : null;
    for (const c of cols) {
      const rate = rateOf(c); const lc = lev.get(c.quotation)?.cells.find((x) => x.item_code === it.item_code);
      cells.set(cellKey(it.item_code, c.quotation), { rate, amount: rate !== null ? r2(num(lineOf(sqs.find((q) => q.name === c.quotation)!, it.item_code)?.["amount"])) : r2(lc?.amount ?? 0),
        plugged: rate === null && !!lc?.plugged && c.submitted, best: rate !== null && low !== null && rate === low && (c.qualified || !qual.length), awardedHere: awarded.get(it.item_code)?.quotation === c.quotation });
    }
  }
  const lines: RfqLine[] = items.map((it) => {
    const aw = awarded.get(it.item_code);
    // split-award default: the cheapest qualified quotation that priced the line
    const pick = aw ? undefined : qual.map((c) => ({ c, x: cells.get(cellKey(it.item_code, c.quotation))! })).filter((y) => y.x.rate !== null).sort((a, b) => (a.x.rate as number) - (b.x.rate as number) || a.c.quotation.localeCompare(b.c.quotation))[0]?.c.quotation;
    return { ...it, awarded: aw, pick };
  });
  return { rfq, lines, cols, cells, anyAwarded: awarded.size > 0 };
}
/** Lines of one quotation a split award would put on its purchase order: the picked lines not awarded yet. */
export function splitPlan(board: RfqBoard, picks: Record<string, string>): { quotation: string; items: string[]; amount: number }[] {
  const by = new Map<string, string[]>();
  for (const l of board.lines) { if (l.awarded) continue; const q = picks[l.item_code] ?? l.pick; if (!q) continue; const c = board.cells.get(cellKey(l.item_code, q)); if (!c || c.rate === null) continue; by.set(q, [...(by.get(q) ?? []), l.item_code]); }
  return [...by].map(([quotation, items]) => ({ quotation, items, amount: r2(sumBy(items, (i) => board.cells.get(cellKey(i, quotation))!.amount)) })).sort((a, b) => a.quotation.localeCompare(b.quotation));
}

// ---------------------------------------------------------------- bid package ↔ subcontract bids
export interface BidCol { supplier: string; bid: string; submitted_total: number; leveled: number | null; plugs: number; rank: number | null; cheapest: boolean; compliance: string; valid_until: string; mute?: MuteReason | undefined; awarded: boolean }
export interface BidLine { item_key: string; description: string; qty: number; uom: string }
export interface BidCell { amount: number; plugged: boolean; override: boolean; best: boolean; missing: boolean }
export interface BidBoard { pkg: string; lines: BidLine[]; cols: BidCol[]; cells: Map<string, BidCell> }
/** Leveled cells of the bid leveling (levelingCells — the same cells the save hook stores) as columns; invitees without a bid are greyed «no offer»; qualified = a subcontractor profile that is not non-compliant and a bid inside its validity. */
export function bidBoard(lev: Doc, on = today()): BidBoard {
  const pkgName = s(lev["bid_package"]); const pkg = adapter.get("Digit Bid Package", pkgName);
  const cells0 = levelingCells(pkgName, rows(lev, "cells"));
  const sum = levelingSummary(cells0, pkgName);
  const bids = list("Digit Subcontract Bid", (b) => b["bid_package"] === pkgName && live(b));
  const lines: BidLine[] = rows(pkg, "items").map((i) => ({ item_key: s(i["item_key"]), description: s(i["description"]), qty: num(i["qty"]), uom: s(i["uom"]) }));
  const sups = [...sum.map((x) => x.supplier), ...rows(pkg, "invitees").map((i) => s(i["supplier"])).filter((x) => x && !sum.some((y) => y.supplier === x))];
  const awardedTo = lev["workflow_state"] === "Awarded" ? s(lev["awarded_supplier"]) : "";
  const cols: BidCol[] = sups.map((sp) => {
    const r = sum.find((x) => x.supplier === sp); const b = bids.find((x) => x["supplier"] === sp);
    const prof = profileOf(sp); const comp = prof ? complianceOf(prof, on).status : "";
    const vu = b && b["submitted_on"] && num(b["validity_days"]) ? addDays(s(b["submitted_on"]), num(b["validity_days"])) : "";
    const mute: MuteReason | undefined = !r ? "no-offer" : !prof ? "no-profile" : comp === "Non-compliant" ? "non-compliant" : vu && vu < on ? "expired" : undefined;
    return { supplier: sp, bid: b?.name ?? "", submitted_total: r?.submitted_total ?? 0, leveled: r ? r.leveled_total : null, plugs: r ? cells0.filter((c) => c["supplier"] === sp && num(c["plug"])).length : 0,
      rank: null, cheapest: false, compliance: comp, valid_until: vu, mute, awarded: awardedTo === sp };
  });
  [...cols].filter((c) => !c.mute && c.leveled !== null).sort((a, b) => (a.leveled as number) - (b.leveled as number) || a.supplier.localeCompare(b.supplier)).forEach((c, i) => { c.rank = i + 1; c.cheapest = i === 0; });
  const cells = new Map<string, BidCell>();
  const qual = new Set(cols.filter((c) => !c.mute).map((c) => c.supplier));
  for (const l of lines) {
    const mine = cells0.filter((c) => c["item_key"] === l.item_key);
    const val = (c: Record<string, unknown>) => (num(c["override_amount"]) ? num(c["override_amount"]) : num(c["amount"]));
    const pool = mine.filter((c) => num(c["included"]) && (qual.size ? qual.has(s(c["supplier"])) : true)).map(val);
    const low = pool.length ? Math.min(...pool) : null;
    for (const c of cols) {
      const x = mine.find((y) => y["supplier"] === c.supplier);
      cells.set(cellKey(l.item_key, c.supplier), x ? { amount: r2(val(x)), plugged: !!num(x["plug"]), override: !!num(x["override_amount"]), best: !!num(x["included"]) && low !== null && val(x) === low && (qual.has(c.supplier) || !qual.size), missing: false }
        : { amount: 0, plugged: false, override: false, best: false, missing: true });
    }
  }
  return { pkg: pkgName, lines, cols, cells };
}
