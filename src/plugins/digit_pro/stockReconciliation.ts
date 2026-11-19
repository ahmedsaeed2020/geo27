/**
 * EQ-01 P4 — read-only stock value reconciliation: Bin snapshot vs posted Stock Ledger Entry vs stock GL.
 *
 * Basis (stated on screen and in the CSV):
 *  - Bin: undated snapshot per item × warehouse (actual_qty, stock_value, valuation_rate) — the figure Stock Balance shows.
 *  - Stock Ledger: submitted, non-cancelled rows of company warehouses with posting_date ≤ as-of, replayed in posting order
 *    (posting_date, posting_time, creation, name); quantity = Σ actual_qty, value = Σ stock_value_difference.
 *  - Stock GL: posted GL Entry rows on the company's non-group accounts of type "Stock" (debit − credit), company level only.
 * Classification uses only these facts — it never guesses an engine defect:
 *  - match: same quantity and value.
 *  - stale-snapshot: the Bin quantity equals the ledger balance after an earlier voucher; later vouchers are not in the Bin.
 *  - not-from-ledger: the Bin quantity equals no ledger balance at any point (fixture/import/opening outside the ledger).
 *  - value-basis: same quantity, different value (valuation rate basis differs).
 *  - bin-only / ledger-only: one side has no record for the pair.
 *  - ledger-inconsistent: the ledger's own running balance (qty_after_transaction / stock_value on the last row) disagrees
 *    with the sum of its movements — the only class that points at posting itself, flagged for a proposal, never corrected.
 * Nothing here writes Bin, Stock Ledger Entry, GL Entry or valuation. A source the user cannot fully read → "denied".
 */
import type { Doc } from "@/lib/adapter";
import { scopedList } from "@/lib/scope";
import { currentUser } from "@/lib/session";
import type { Bi } from "./command";
import { companyScope } from "./closeReview";
import { sourceStatus, todayIso, type SourceStatus } from "./finance";
import { binScope } from "./inventoryCommand";
import { postedStockSources } from "./stockSources";

const n = (v: unknown) => Number(v) || 0;
const s = (v: unknown) => String(v ?? "");
const r2 = (x: number) => Math.round(x * 100) / 100;
const QTY_EPS = 1e-6, VAL_EPS = 0.005;

export type ReconClass = "match" | "stale-snapshot" | "not-from-ledger" | "value-basis" | "bin-only" | "ledger-only" | "ledger-inconsistent";
export const RECON_CLASSES: ReconClass[] = ["ledger-inconsistent", "not-from-ledger", "stale-snapshot", "value-basis", "bin-only", "ledger-only", "match"];
export const CLASS_LABEL: Record<ReconClass, Bi> = {
  match: ["Agree", "متطابق"],
  "stale-snapshot": ["Bin behind the ledger", "الرصيد متأخر عن الدفتر"],
  "not-from-ledger": ["Bin not derived from the ledger", "الرصيد غير مشتق من الدفتر"],
  "value-basis": ["Same quantity, different value", "نفس الكمية بقيمة مختلفة"],
  "bin-only": ["Bin without ledger rows", "رصيد بلا قيود دفتر"],
  "ledger-only": ["Ledger rows without a Bin", "قيود دفتر بلا رصيد"],
  "ledger-inconsistent": ["Ledger running balance inconsistent", "رصيد الدفتر الجاري غير متسق"],
};
export const CLASS_CAUSE: Record<ReconClass, Bi> = {
  match: ["Both sources agree for this pair.", "المصدران متطابقان لهذا الزوج."],
  "stale-snapshot": ["The Bin quantity equals the ledger balance after an earlier voucher; later posted vouchers are not reflected in the Bin snapshot.", "كمية الرصيد تساوي رصيد الدفتر بعد مستند سابق؛ المستندات المرحّلة بعده غير منعكسة في لقطة الرصيد."],
  "not-from-ledger": ["The Bin quantity matches no ledger balance at any point, so it was set outside posted movements (fixture, import or an opening not posted through the ledger).", "كمية الرصيد لا تطابق أي رصيد في الدفتر في أي وقت، أي أنها وُضعت خارج الحركات المرحّلة (بيانات تأسيسية أو استيراد أو رصيد افتتاحي لم يُرحّل عبر الدفتر)."],
  "value-basis": ["Quantities agree; the Bin valuation rate differs from the ledger's latest valuation rate.", "الكميات متطابقة؛ معدل تقييم الرصيد يختلف عن آخر معدل تقييم في الدفتر."],
  "bin-only": ["A Bin exists with no posted ledger rows up to the as-of date.", "يوجد رصيد بلا قيود دفتر مرحّلة حتى التاريخ المحدد."],
  "ledger-only": ["Posted ledger rows exist but no Bin row was found for the pair.", "توجد قيود دفتر مرحّلة ولا يوجد صف رصيد لهذا الزوج."],
  "ledger-inconsistent": ["The ledger's last running balance differs from the sum of its own movements — review the posting before relying on either figure.", "آخر رصيد جارٍ في الدفتر يختلف عن مجموع حركاته — راجع الترحيل قبل الاعتماد على أي رقم."],
};

export interface VoucherRef { voucherType: string; voucherNo: string; date: string; sle: string }
export interface ReconRow {
  item: string; warehouse: string; uom: string; bin: string | null;
  binQty: number | null; binValue: number | null; binRate: number | null;
  sleQty: number; sleValue: number; sleRows: number; lastRate: number | null; firstDate: string; lastDate: string;
  qtyDiff: number; valueDiff: number;
  cls: ReconClass;
  /** Bin equals the ledger balance right after this voucher (null = before the first row or not identifiable). */
  matchedAfter: VoucherRef | null;
  /** First voucher whose effect is missing from the Bin, when identifiable from the replay. */
  firstDivergent: VoucherRef | null;
  cancelledRows: number; laterRows: number; uomMismatch: boolean; binInternalGap: number;
  ledgerQtyAfter: number | null; ledgerValueAfter: number | null;
}
export interface ReconResult {
  status: SourceStatus; company: string; asOf: string;
  rows: ReconRow[];
  totals: { bin: number; sle: number; diff: number; pairs: number; mismatched: number; gl: number | null; glStatus: SourceStatus; glDiff: number | null; glAccounts: string[] };
  byClass: { cls: ReconClass; count: number; valueDiff: number; qtyPairs: number }[];
}

const order = (a: Doc, b: Doc) => s(a["posting_date"]).localeCompare(s(b["posting_date"])) || s(a["posting_time"]).localeCompare(s(b["posting_time"]))
  || s(a["creation"]).localeCompare(s(b["creation"])) || s(a.name).localeCompare(s(b.name));
const ref = (e: Doc): VoucherRef => ({ voucherType: s(e["voucher_type"]), voucherNo: s(e["voucher_no"]), date: s(e["posting_date"]), sle: e.name });
const pairKey = (item: string, wh: string) => JSON.stringify([item, wh]);

/** Pure classification of one item × warehouse pair from its Bin (or none) and its posted ledger rows (already in scope). */
export function reconcilePair(item: string, warehouse: string, bin: Doc | undefined, ledger: Doc[], opts: { uom?: string | undefined; cancelledRows?: number; laterRows?: number } = {}): ReconRow {
  const rows = [...ledger].sort(order);
  let q = 0, v = 0; const runQ: number[] = [];
  for (const e of rows) { q += n(e["actual_qty"]); v += n(e["stock_value_difference"]); runQ.push(q); }
  const sleQty = r2(q * 1e6) / 1e6, sleValue = r2(v);
  const last = rows[rows.length - 1];
  const binQty = bin ? n(bin["actual_qty"]) : null;
  const binRate = bin && bin["valuation_rate"] !== undefined && bin["valuation_rate"] !== null ? n(bin["valuation_rate"]) : null;
  const binValue = bin ? (bin["stock_value"] !== undefined && bin["stock_value"] !== null ? r2(n(bin["stock_value"])) : binRate !== null ? r2(n(bin["actual_qty"]) * binRate) : 0) : null;
  const ledgerQtyAfter = last && last["qty_after_transaction"] !== undefined ? n(last["qty_after_transaction"]) : null;
  const ledgerValueAfter = last && last["stock_value"] !== undefined ? r2(n(last["stock_value"])) : null;
  const uom = opts.uom ?? s(bin?.["stock_uom"]);
  const base: ReconRow = {
    item, warehouse, uom, bin: bin?.name ?? null, binQty, binValue, binRate,
    sleQty, sleValue, sleRows: rows.length, lastRate: last && last["valuation_rate"] !== undefined ? n(last["valuation_rate"]) : null,
    firstDate: s(rows[0]?.["posting_date"]), lastDate: s(last?.["posting_date"]),
    qtyDiff: r2((sleQty - (binQty ?? 0)) * 1e6) / 1e6, valueDiff: r2(sleValue - (binValue ?? 0)),
    cls: "match", matchedAfter: null, firstDivergent: null,
    cancelledRows: opts.cancelledRows ?? 0, laterRows: opts.laterRows ?? 0,
    uomMismatch: !!bin && !!opts.uom && !!bin["stock_uom"] && s(bin["stock_uom"]) !== opts.uom,
    binInternalGap: bin && binRate !== null && bin["stock_value"] !== undefined ? r2(n(bin["stock_value"]) - n(bin["actual_qty"]) * binRate) : 0,
    ledgerQtyAfter, ledgerValueAfter,
  };
  if (rows.length && ((ledgerQtyAfter !== null && Math.abs(ledgerQtyAfter - sleQty) > 1e-4) || (ledgerValueAfter !== null && Math.abs(ledgerValueAfter - sleValue) > 0.01)))
    return { ...base, cls: "ledger-inconsistent" };
  if (!bin) return { ...base, cls: rows.length ? "ledger-only" : "match" };
  if (!rows.length) return { ...base, cls: Math.abs(binQty!) < QTY_EPS && Math.abs(binValue!) < VAL_EPS ? "match" : "bin-only" };
  const qtyAgrees = Math.abs(base.qtyDiff) < QTY_EPS;
  if (qtyAgrees) return { ...base, cls: Math.abs(base.valueDiff) < VAL_EPS ? "match" : "value-basis", matchedAfter: ref(last!) };
  // Latest point in the replay where the ledger balance equalled the Bin quantity (index −1 = before the first movement).
  let k = -2;
  for (let i = runQ.length - 1; i >= 0; i--) if (Math.abs(runQ[i]! - binQty!) < QTY_EPS) { k = i; break; }
  if (k === -2 && Math.abs(binQty!) < QTY_EPS) k = -1;
  if (k === -2) return { ...base, cls: "not-from-ledger" };
  return { ...base, cls: "stale-snapshot", matchedAfter: k >= 0 ? ref(rows[k]!) : null, firstDivergent: ref(rows[k + 1]!) };
}

/** Company reconciliation for the session user (read-only). */
export function stockReconciliation(company: string, asOf = todayIso(), user = currentUser()): ReconResult {
  const empty = (status: SourceStatus): ReconResult => ({ status, company, asOf, rows: [], byClass: [],
    totals: { bin: 0, sle: 0, diff: 0, pairs: 0, mismatched: 0, gl: null, glStatus: status, glDiff: null, glAccounts: [] } });
  const sc = binScope(company, user);
  if (sc.status !== "ok") return empty(sc.status);
  const led = postedStockSources(company, user);
  if (led.status !== "ok") return empty(led.status);
  const whs = new Set(scopedList("Warehouse", user).filter((w) => w["company"] === company).map((w) => w.name));
  const sle = new Map<string, Doc[]>(), later = new Map<string, number>(), cancelled = new Map<string, number>();
  for (const e of led.rows) {
    const k = pairKey(s(e["item_code"]), s(e["warehouse"]));
    if (s(e["posting_date"]) > asOf) { later.set(k, (later.get(k) ?? 0) + 1); continue; }
    (sle.get(k) ?? sle.set(k, []).get(k)!).push(e);
  }
  for (const e of scopedList("Stock Ledger Entry", user)) if (whs.has(s(e["warehouse"])) && (n(e["is_cancelled"]) || n(e.docstatus) === 2)) {
    const k = pairKey(s(e["item_code"]), s(e["warehouse"])); cancelled.set(k, (cancelled.get(k) ?? 0) + 1);
  }
  const bins = new Map(sc.bins.map((b) => [pairKey(s(b["item_code"]), s(b["warehouse"])), b]));
  const keys = [...new Set([...bins.keys(), ...sle.keys()])];
  const rows = keys.map((k) => {
    const [item, wh] = JSON.parse(k) as [string, string];
    return reconcilePair(item, wh, bins.get(k), sle.get(k) ?? [], { uom: s(sc.items.get(item)?.["stock_uom"]) || undefined, cancelledRows: cancelled.get(k) ?? 0, laterRows: later.get(k) ?? 0 });
  }).filter((r) => r.bin || r.sleRows)
    .sort((a, b) => RECON_CLASSES.indexOf(a.cls) - RECON_CLASSES.indexOf(b.cls) || Math.abs(b.valueDiff) - Math.abs(a.valueDiff) || a.item.localeCompare(b.item) || a.warehouse.localeCompare(b.warehouse));
  const bin = r2(rows.reduce((t, r) => t + (r.binValue ?? 0), 0)), sleTotal = r2(rows.reduce((t, r) => t + r.sleValue, 0));
  // Stock GL: company stock accounts (non-group, account_type Stock), posted rows up to as-of.
  let gl: number | null = null, glStatus: SourceStatus = companyScope("GL Entry", company, user);
  if (glStatus === "ok") glStatus = sourceStatus("Account", user);
  const accts = glStatus === "ok" ? scopedList("Account", user).filter((a) => a["company"] === company && !n(a["is_group"]) && s(a["account_type"]) === "Stock").map((a) => a.name) : [];
  if (glStatus === "ok") {
    const set = new Set(accts);
    gl = r2(scopedList("GL Entry", user).filter((g) => g["company"] === company && n(g.docstatus) === 1 && !n(g["is_cancelled"]) && set.has(s(g["account"])) && s(g["posting_date"]) <= asOf)
      .reduce((t, g) => t + n(g["debit"]) - n(g["credit"]), 0));
  }
  const byClass = RECON_CLASSES.map((cls) => { const xs = rows.filter((r) => r.cls === cls); return { cls, count: xs.length, valueDiff: r2(xs.reduce((t, r) => t + r.valueDiff, 0)), qtyPairs: xs.filter((r) => Math.abs(r.qtyDiff) >= QTY_EPS).length }; }).filter((c) => c.count);
  return { status: "ok", company, asOf, rows, byClass,
    totals: { bin, sle: sleTotal, diff: r2(sleTotal - bin), pairs: rows.length, mismatched: rows.filter((r) => r.cls !== "match").length, gl, glStatus, glDiff: gl === null ? null : r2(gl - sleTotal), glAccounts: accts.sort() } };
}

/** Company-level Bin vs ledger comparison for disclosure next to Bin-based figures (null when either side is unreadable). */
export function stockValueGap(company: string, asOf = todayIso(), user = currentUser()): { bin: number; sle: number; diff: number; mismatched: number; pairs: number } | null {
  const r = stockReconciliation(company, asOf, user);
  if (r.status !== "ok" || Math.abs(r.totals.diff) < 0.5) return null;
  return { bin: r.totals.bin, sle: r.totals.sle, diff: r.totals.diff, mismatched: r.totals.mismatched, pairs: r.totals.pairs };
}

export const RECON_CSV_COLUMNS = ["company", "as_of", "item_code", "warehouse", "stock_uom", "bin", "bin_actual_qty", "bin_valuation_rate", "bin_stock_value",
  "sle_rows", "sle_qty", "sle_value", "sle_last_valuation_rate", "sle_first_date", "sle_last_date", "qty_diff_sle_minus_bin", "value_diff_sle_minus_bin",
  "class", "bin_matches_balance_after_voucher", "first_divergent_voucher", "first_divergent_date", "first_divergent_sle", "cancelled_sle_rows", "sle_rows_after_as_of",
  "uom_mismatch", "bin_value_minus_qty_x_rate", "ledger_qty_after_last_row", "ledger_value_after_last_row"] as const;

/** Deterministic CSV (stable order, "." decimals, ISO dates). */
export function reconciliationCsv(r: ReconResult): string {
  const esc = (v: unknown) => { const x = v === null || v === undefined ? "" : String(v); return /[",\n]/.test(x) ? `"${x.replace(/"/g, '""')}"` : x; };
  const vr = (x: VoucherRef | null) => (x ? `${x.voucherType} ${x.voucherNo}` : "");
  const lines = [RECON_CSV_COLUMNS.join(",")];
  for (const x of r.rows) lines.push([r.company, r.asOf, x.item, x.warehouse, x.uom, x.bin, x.binQty, x.binRate, x.binValue, x.sleRows, x.sleQty, x.sleValue, x.lastRate, x.firstDate, x.lastDate,
    x.qtyDiff, x.valueDiff, x.cls, vr(x.matchedAfter), vr(x.firstDivergent), x.firstDivergent?.date ?? "", x.firstDivergent?.sle ?? "", x.cancelledRows, x.laterRows,
    x.uomMismatch ? 1 : 0, x.binInternalGap, x.ledgerQtyAfter, x.ledgerValueAfter].map(esc).join(","));
  return lines.join("\n") + "\n";
}
