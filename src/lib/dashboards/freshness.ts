/**
 * Card freshness (Enterprise Visual Round 1 §5): «آخر تحديث منذ 17 دقيقة» — the latest change among the records a card
 * reads (their `modified`, else `creation`), cached per store version so a page of cards scans each source once.
 */
import { adapter } from "@/lib/adapter";

let cacheV = -1; const cache = new Map<string, string>();
/** Latest change (ISO datetime, "" when the sources hold no record) among the records of these DocTypes. */
export function lastChange(doctypes: readonly string[]): string {
  const v = adapter.version();
  if (v !== cacheV) { cache.clear(); cacheV = v; }
  let best = "";
  for (const dt of doctypes) {
    let hit = cache.get(dt);
    if (hit === undefined) {
      hit = "";
      try { for (const d of adapter.list(dt)) { const m = String(d.modified ?? d["creation"] ?? ""); if (m > hit) hit = m; } } catch { hit = ""; }
      cache.set(dt, hit);
    }
    if (hit > best) best = hit;
  }
  return best;
}

/** «منذ 17 دقيقة» / "17 minutes ago" between a stored datetime and now; a future or missing time reads as "just now". */
export function agoText(iso: string, ar: boolean, now = Date.now()): string {
  const t = Date.parse(iso.includes("T") || iso.length <= 10 ? iso : iso.replace(" ", "T"));
  const min = Number.isFinite(t) ? Math.max(0, Math.floor((now - t) / 60000)) : 0;
  if (min < 1) return ar ? "الآن" : "just now";
  if (min < 60) return ar ? `منذ ${min} ${min === 1 ? "دقيقة" : min === 2 ? "دقيقتين" : min <= 10 ? "دقائق" : "دقيقة"}` : `${min} minute${min === 1 ? "" : "s"} ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return ar ? `منذ ${h} ${h === 1 ? "ساعة" : h === 2 ? "ساعتين" : h <= 10 ? "ساعات" : "ساعة"}` : `${h} hour${h === 1 ? "" : "s"} ago`;
  const d = Math.floor(h / 24);
  return ar ? `منذ ${d} ${d === 1 ? "يوم" : d === 2 ? "يومين" : d <= 10 ? "أيام" : "يومًا"}` : `${d} day${d === 1 ? "" : "s"} ago`;
}
/** The freshness line of a card. */
export function freshnessLine(iso: string, ar: boolean, now = Date.now()): string {
  return `${ar ? "آخر تحديث" : "Updated"} ${agoText(iso, ar, now)}`;
}
