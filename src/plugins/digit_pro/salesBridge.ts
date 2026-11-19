/**
 * SL12-b / SEL-014-b — revenue bridge (volume · price · mix) and salesperson target vs actual, from submitted
 * Sales Invoice lines and Sales Team rows (Sales Person "targets" = Target Detail), permission-scoped.
 * Bridge: price = Σ items sold in both periods q₁·(p₁ − p₀); volume = (Q₁ − Q₀)·(R₀ / Q₀); mix = the rest
 * (new / dropped items and the shift between items), so volume + price + mix = R₁ − R₀ exactly.
 */
import type { Doc } from "@/lib/adapter";
import { scopedList } from "@/lib/scope";
import { currentUser } from "@/lib/session";
import { sourceStatus, type SourceStatus } from "./finance";

const n = (v: unknown) => Number(v) || 0;
const r2 = (x: number) => Math.round(x * 100) / 100;
const rows = (d: Doc, f: string) => (Array.isArray(d[f]) ? (d[f] as Doc[]) : []);
const inRange = (d: Doc, from: string, to: string) => { const p = String(d["posting_date"] ?? ""); return p >= from && p <= to; };
const invoices = (company: string, from: string, to: string, user: string) =>
  scopedList("Sales Invoice", user).filter((d) => n(d["docstatus"]) === 1 && (!company || d["company"] === company) && inRange(d, from, to));

export type BridgeStatus = SourceStatus | "empty";
export interface Bridge { status: BridgeStatus; previous: number; current: number; volume: number; price: number; mix: number; qty: [number, number]; items: number }
export function revenueBridge(company: string, prev: { from: string; to: string }, cur: { from: string; to: string }, user = currentUser()): Bridge {
  const status = sourceStatus("Sales Invoice", user);
  const zero: Bridge = { status, previous: 0, current: 0, volume: 0, price: 0, mix: 0, qty: [0, 0], items: 0 };
  if (status !== "ok") return zero;
  const agg = (docs: Doc[]) => { const m = new Map<string, { q: number; r: number }>(); for (const d of docs) for (const l of rows(d, "items")) {
    const k = String(l["item_code"] ?? ""); const x = m.get(k) ?? { q: 0, r: 0 };
    x.q += n(l["stock_qty"] ?? l["qty"]); x.r += n(l["base_net_amount"] ?? l["net_amount"] ?? l["amount"]); m.set(k, x);
  } return m; };
  const a = agg(invoices(company, prev.from, prev.to, user)), b = agg(invoices(company, cur.from, cur.to, user));
  const tot = (m: Map<string, { q: number; r: number }>) => [...m.values()].reduce((s, x) => ({ q: s.q + x.q, r: s.r + x.r }), { q: 0, r: 0 });
  const A = tot(a), B = tot(b);
  let price = 0;
  for (const [k, x] of b) { const y = a.get(k); if (y && y.q && x.q) price += x.q * (x.r / x.q - y.r / y.q); }
  const volume = A.q ? (B.q - A.q) * (A.r / A.q) : 0;
  const mix = B.r - A.r - price - volume;
  return { status: (A.r || B.r) ? "ok" : "empty", previous: r2(A.r), current: r2(B.r), volume: r2(volume), price: r2(price), mix: r2(mix), qty: [r2(A.q), r2(B.q)], items: new Set([...a.keys(), ...b.keys()]).size };
}

export interface TargetRow { person: string; target: number | null; actual: number; pct: number | null }
/** Target vs actual per Sales Person for a fiscal year (Target Detail target_amount; actual = Sales Team allocated amount). */
export function salesTargets(company: string, fiscalYear: string, range: { from: string; to: string }, user = currentUser()): { status: BridgeStatus; rows: TargetRow[] } {
  const status = sourceStatus("Sales Person", user); if (status !== "ok") return { status, rows: [] };
  const actual = new Map<string, number>();
  if (sourceStatus("Sales Invoice", user) === "ok") for (const d of invoices(company, range.from, range.to, user)) for (const t of rows(d, "sales_team")) {
    const p = String(t["sales_person"] ?? ""); if (!p) continue;
    const amt = t["allocated_amount"] !== undefined && t["allocated_amount"] !== null && t["allocated_amount"] !== "" ? n(t["allocated_amount"]) : n(d["base_net_total"] ?? d["net_total"]) * n(t["allocated_percentage"]) / 100;
    actual.set(p, (actual.get(p) ?? 0) + amt);
  }
  const out: TargetRow[] = scopedList("Sales Person", user).filter((p) => !n(p["is_group"]) && n(p["enabled"] ?? 1)).map((p) => {
    const ts = rows(p, "targets").filter((t) => String(t["fiscal_year"] ?? "") === fiscalYear);
    const target = ts.length ? r2(ts.reduce((s, t) => s + n(t["target_amount"]), 0)) : null;
    const a = r2(actual.get(p.name) ?? 0);
    return { person: p.name, target, actual: a, pct: target ? Math.round((a / target) * 1000) / 10 : null };
  }).filter((r) => r.target !== null || r.actual > 0).sort((x, y) => (y.pct ?? -1) - (x.pct ?? -1) || y.actual - x.actual);
  return { status: out.length ? "ok" : "empty", rows: out };
}
