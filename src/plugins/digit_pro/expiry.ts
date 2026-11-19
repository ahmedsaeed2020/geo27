/**
 * IN9-b / INV-012-b — near-expiry timeline: batches with stock on hand grouped by how soon they expire
 * (expired, then month by month for six months, then later). Balance per batch = submitted Stock Entry /
 * Purchase Receipt / Delivery Note batch lines (serialBatch.sbLines, the same rows batchQty reads). Read-only.
 */
import { adapter, type Doc } from "@/lib/adapter";
import { SB_DOCTYPES, sbLines } from "@/lib/serialBatch";
import { scopedList } from "@/lib/scope";
import { currentUser } from "@/lib/session";
import { sourceStatus, type SourceStatus } from "./finance";

export interface ExpiryBucket { key: string; label: [string, string]; from?: string; to?: string; qty: number; batches: { name: string; item: string; expiry: string; qty: number }[] }
export interface ExpiryTimeline { status: SourceStatus; buckets: ExpiryBucket[]; total: number }

const AR_MONTHS = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
const EN_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const iso = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d)).toISOString().slice(0, 10);

/** Batch balance across warehouses from submitted voucher batch lines. */
export function batchBalances(): Map<string, number> {
  const out = new Map<string, number>();
  for (const dt of SB_DOCTYPES) for (const d of adapter.list(dt)) {
    if (Number(d["docstatus"]) !== 1) continue;
    for (const l of sbLines(dt, d)) if (l.batch) out.set(l.batch, (out.get(l.batch) ?? 0) + l.qty);
  }
  return out;
}

export function expiryTimeline(asOf: string, user = currentUser(), months = 6): ExpiryTimeline {
  const st = sourceStatus("Batch", user);
  if (st !== "ok") return { status: st, buckets: [], total: 0 };
  const [y, m] = asOf.split("-").map(Number) as [number, number];
  const buckets: ExpiryBucket[] = [{ key: "expired", label: ["Expired", "منتهية"], to: asOf, qty: 0, batches: [] }];
  for (let i = 0; i < months; i++) {
    const from = i === 0 ? asOf : iso(y, m - 1 + i, 1), to = iso(y, m + i, 0);
    const mm = (m - 1 + i) % 12, yy = y + Math.floor((m - 1 + i) / 12);
    buckets.push({ key: to.slice(0, 7), label: [`${EN_MONTHS[mm]} ${yy}`, `${AR_MONTHS[mm]} ${yy}`], from, to, qty: 0, batches: [] });
  }
  const later = iso(y, m - 1 + months, 1);
  buckets.push({ key: "later", label: ["Later", "لاحقًا"], from: later, qty: 0, batches: [] });
  const bal = batchBalances();
  for (const b of scopedList("Batch", user) as Doc[]) {
    const exp = String(b["expiry_date"] ?? "").slice(0, 10); if (!exp || Number(b["disabled"] ?? 0)) continue;
    const qty = Math.round((bal.get(b.name) ?? 0) * 1000) / 1000; if (qty <= 0.0001) continue;
    const k = exp < asOf ? buckets[0]! : buckets.find((x) => x.from && x.to && exp >= x.from && exp <= x.to) ?? buckets[buckets.length - 1]!;
    k.qty += qty; k.batches.push({ name: b.name, item: String(b["item"] ?? ""), expiry: exp, qty });
  }
  for (const k of buckets) { k.qty = Math.round(k.qty * 1000) / 1000; k.batches.sort((a, b) => a.expiry.localeCompare(b.expiry)); }
  return { status: "ok", buckets, total: buckets.reduce((a, k) => a + k.batches.length, 0) };
}
