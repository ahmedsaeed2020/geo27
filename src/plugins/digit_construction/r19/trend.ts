/**
 * Trend and change of a workspace figure (Overview layer 1: KPI with delta and sparkline). The figure is recomputed by
 * its own formula over the records as they stood at earlier dates (domain/data.ts asOfRecords), so the trend uses the
 * same source rows as the card; nothing is stored. Points: the last five month-ends and today; the delta compares today
 * with 30 days earlier. Cached per adapter revision.
 */
import { adapter } from "@/lib/adapter";
import type { Bi } from "@/lib/dashboards/views";
import { asOfRecords } from "../domain/data";
import type { Fig, KpiDef, Scope, Unit } from "./metrics";

const cache = new Map<string, number | null>();
let seen = -1;
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
/** Month-end dates of the `n − 1` months before `on`, then `on` itself (oldest first). */
export function trendDates(on: string, n = 6): string[] {
  const [y, m] = on.split("-").map(Number) as [number, number];
  const out: string[] = [];
  for (let i = n - 1; i >= 1; i--) out.push(new Date(Date.UTC(y, m - i, 0)).toISOString().slice(0, 10)); // day 0 of month m−i+1 = last day of month m−i
  return [...out, on];
}
const valueOf = (f: Fig) => (f.status && f.status !== "ok" ? null : f.value);
export function figAt(k: KpiDef, s: Scope, on: string): number | null {
  if (adapter.version() !== seen) { cache.clear(); seen = adapter.version(); }
  const key = `${k.id}|${s.company ?? ""}|${s.project ?? ""}|${on}`;
  if (cache.has(key)) return cache.get(key)!;
  let v: number | null = null;
  try { v = valueOf(asOfRecords(on, () => k.fig({ ...s, on }))); } catch { v = null; }
  cache.set(key, v);
  return v;
}
/** Which direction is good for a figure (from what it measures); "none" when neither is better. */
export function betterOf(k: KpiDef): "up" | "down" | "none" {
  const t = k.title[0].toLowerCase();
  if (/overdue|slip|over sla|exposure|risk|defect|aging|age\b|downtime|absence|dso|difference|unadjusted|slow|outstanding|waiting|blocked|expir|overrun|shortage|late|lost|incident|unmapped|unallocated|exception|variance|backlog|open|pending|retention held|cost this week/.test(t)) return "down";
  if (/progress|margin|win rate|ppc|on-time|valid|readiness|first-pass|collected|saving|score|utilisation|earned|certified|inducted|induction|approved|accepted|complete/.test(t)) return "up";
  return "none";
}
export interface Trend { spark?: number[] | undefined; delta?: { pct: number; better?: "up" | "down" | undefined; label?: string | undefined } | undefined }
/** Six points evenly spaced over a block window ending at `to` (oldest first). */
export function windowDates(from: string, to: string, n = 6): string[] {
  const a = Date.parse(`${from}T00:00:00Z`), b = Date.parse(`${to}T00:00:00Z`);
  if (!(b > a)) return [to];
  return Array.from({ length: n }, (_, i) => new Date(a + ((b - a) * i) / (n - 1)).toISOString().slice(0, 10));
}
/**
 * `opts.from`: the block window start (points spread over the window instead of month-ends); `opts.cmp`: the comparison
 * date (previous period end, same date last year or a baseline) with its label; default 30 days earlier.
 */
export function trendOf(k: KpiDef, s: Scope, current: number | null, ar: boolean, opts: { from?: string | undefined; cmp?: { date: string; label: string } | null | undefined } = {}): Trend {
  if (current === null) return {};
  const dates = opts.from ? windowDates(opts.from, s.on) : trendDates(s.on);
  const pts = dates.map((d) => (d === s.on ? current : figAt(k, s, d)));
  const spark = pts.every((v) => v !== null) ? (pts as number[]) : undefined;
  if (opts.cmp === null) return spark && new Set(spark).size > 1 ? { spark } : {};
  const prev = figAt(k, s, opts.cmp?.date ?? addDays(s.on, -30));
  const b = betterOf(k);
  const pct = prev === null ? null : prev === 0 ? (current === 0 ? 0 : null) : ((current - prev) / Math.abs(prev)) * 100;
  return { ...(spark && new Set(spark).size > 1 ? { spark } : {}), ...(pct !== null ? { delta: { pct: Math.round(pct * 10) / 10, ...(b !== "none" ? { better: b } : {}), label: opts.cmp?.label ?? (ar ? "عن 30 يومًا" : "vs 30 days") } } : {}) };
}
export const UNIT_WORDS: Record<Unit, Bi> = { count: ["Count", "عدد"], money: ["SAR", "ريال سعودي"], pct: ["Percent", "نسبة مئوية"], days: ["Days", "أيام"], hours: ["Hours", "ساعات"], qty: ["Quantity", "كمية"] };
