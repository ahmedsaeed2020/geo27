import { relTimeAr } from "@/i18n";

/** Frappe list/timeline short relative time ("33 m", "2 h", "3 d"); Arabic form when lang is ar. */
export function relTime(iso: string, lang: string): string {
  const m = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
  if (!isFinite(m)) return "";
  const [n, unit, short] = m < 60 ? [m, "minute", "m"] : m < 1440 ? [Math.round(m / 60), "hour", "h"] : m < 43200 ? [Math.round(m / 1440), "day", "d"] : [Math.round(m / 43200), "month", "mo"];
  if (lang === "ar") return n === 0 ? "الآن" : relTimeAr(n as number, unit as string) ?? "";
  return n === 0 ? "now" : `${n} ${short}`;
}
