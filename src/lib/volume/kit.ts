/**
 * Shared helpers for the memory-only sample layer (src/lib/volume): deterministic random numbers, sample dates, money
 * rounding and master-name resolution. Every generator is a pure function of its seed, so the same records (same
 * names, same values) are rebuilt on every visit.
 */
import { adapter, type Doc } from "@/lib/adapter";
import { resolveName } from "@/lib/rename";

export type Rec = [doctype: string, name: string, data: Record<string, unknown>];

/** mulberry32 — small, fast, deterministic. */
export function rng(seed: number) {
  let a = seed >>> 0;
  const next = () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  return {
    next,
    int: (lo: number, hi: number) => lo + Math.floor(next() * (hi - lo + 1)),
    pick: <T,>(xs: readonly T[]): T => xs[Math.floor(next() * xs.length)]!,
    chance: (p: number) => next() < p,
  };
}
export type Rng = ReturnType<typeof rng>;

export const pad = (n: number, w = 4) => String(n).padStart(w, "0");
export const r2 = (x: number) => Math.round(x * 100) / 100;

/**
 * Sample window (owner rule 2026-11-16: demo dates are relative to today, so nothing looks overdue by hundreds of days):
 * the layer always ends TODAY and covers the eleven calendar months up to and including the current one. Generators
 * address months by their position in the window (1 = first month, LAST = the current, partial month), so the same
 * shape — closed months, open last weeks, unpaid recent invoices — is rebuilt relative to the visit date.
 */
export const CUTOFF = new Date().toISOString().slice(0, 10);
/** Number of months in the window; the last one is the current month (activity up to CUTOFF). */
export const LAST = 11;
const DAY = 86400000;
export const addDays = (d: string, k: number) => new Date(Date.parse(`${d}T00:00:00Z`) + k * DAY).toISOString().slice(0, 10);
export const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY);
export const minDate = (a: string, b: string) => (a < b ? a : b);
/** Calendar [year, month] of window month m (m may run before 1 or past LAST for dates outside the window). */
export function calMonth(m: number): [number, number] {
  const t = Number(CUTOFF.slice(0, 4)) * 12 + (Number(CUTOFF.slice(5, 7)) - 1) - (LAST - m);
  return [Math.floor(t / 12), (t % 12) + 1];
}
/** Date of day d (clipped to 1..28) in window month m. */
export const ymd = (m: number, d: number) => { const [y, mo] = calMonth(m); return `${y}-${pad(mo, 2)}-${pad(Math.max(1, Math.min(d, 28)), 2)}`; };
/** First day of the window. */
export const START = ymd(1, 1);
export const iso = (date: string, hour = 9) => `${date}T${pad(hour, 2)}:00:00.000Z`;
/** Saudi working week (Sunday–Thursday). */
export const isWorkday = (d: string) => { const w = new Date(`${d}T00:00:00Z`).getUTCDay(); return w !== 5 && w !== 6; };
export function workdays(from: string, to: string): string[] {
  const out: string[] = []; for (let d = from; d <= to; d = addDays(d, 1)) if (isWorkday(d)) out.push(d); return out;
}
/** Last calendar day of window month m. */
export const monthEnd = (m: number) => { const [y, mo] = calMonth(m); return new Date(Date.UTC(y, mo, 0)).toISOString().slice(0, 10); };
/** Window months 1..LAST (LAST = the current month, up to the cut-off). */
export const MONTHS: readonly number[] = Array.from({ length: LAST }, (_, i) => i + 1);
/** Fiscal year name of a date (the demo fiscal years are calendar years). */
export const fyOf = (d: string) => d.slice(0, 4);
/** Day-of-month clipped so a date in the current month never passes the cut-off. */
export const inMonth = (m: number, d: number) => minDate(ymd(m, d), CUTOFF);

/** Current name of a seed master (renames cascade; English seed names may have become Arabic). */
export const R = (doctype: string, name: string) => resolveName(doctype, name);
export const exists = (doctype: string, name: string) => !!adapter.get(doctype, name);

/** Demo stock / service items of the trading company, read from the store (rates follow the item master). */
export interface Item { code: string; name: string; group: string; rate: number; buy: number; stock: boolean }
export function demoItems(prefix: string): Item[] {
  return adapter.list("Item").filter((i) => i.name.startsWith(prefix) && !Number(i["disabled"] ?? 0)).sort((a, b) => a.name.localeCompare(b.name)).map((i: Doc) => {
    const rate = Number(i["standard_rate"]) || 100;
    return { code: i.name, name: String(i["item_name"] ?? i.name), group: String(i["item_group"] ?? ""), rate, buy: r2(Number(i["valuation_rate"]) || rate * 0.7), stock: Number(i["is_stock_item"] ?? 1) === 1 };
  });
}
