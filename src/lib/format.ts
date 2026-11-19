/**
 * Field value formatting per System Settings (frappe/public/js/frappe/form/formatters.js).
 * Saudi defaults: number format #,###.##, date format dd/mm/yyyy (owner visual round R3: the stored dd-mm-yyyy default reads
 * with slashes), company currency SAR.
 * Used by form read-only fields, child grids and list cells so every view formats the same way.
 */
import { adapter, type Doc } from "@/lib/adapter";

export interface SysFormat { date_format: string; number_format: string; currency: string; float_precision: number; currency_precision: number }

export function sysFormat(): SysFormat {
  const s = (typeof window !== "undefined" ? adapter.get("System Settings", "System Settings") : undefined) as Doc | undefined;
  return {
    date_format: String(s?.["date_format"] || "dd-mm-yyyy"),
    number_format: String(s?.["number_format"] || "#,###.##"),
    currency: String(s?.["currency"] || "SAR"),
    float_precision: Number(s?.["float_precision"] || 2),
    currency_precision: Number(s?.["currency_precision"] || 2),
  };
}

const lang = () => (typeof window !== "undefined" && localStorage.getItem("digit-virtual-core:lang") === "ar" ? "ar" : "en");

export function fmtNumber(n: number, prec: number, nf = "#,###.##") {
  const neg = n < 0; const fixed = Math.abs(n).toFixed(prec);
  let [i, d] = fixed.split(".");
  const [grp, dec] = nf === "#.###,##" ? [".", ","] : nf === "# ###.##" ? [" ", "."] : nf === "#,##,###.##" ? [",", "."] : [",", "."];
  i = i!.replace(/\B(?=(\d{3})+(?!\d))/g, grp);
  return (neg ? "-" : "") + i + (d ? dec + d : "");
}

/** U+20C1 SAUDI RIYAL SIGN — drawn by the "DIGIT Riyal" font (styles.css, scripts/build-riyal-font.py). */
export const RIYAL = "\u20C1";
/** Left-to-right isolate: keeps "symbol, space, sign, number" in that visual order inside Arabic text (SAMA rules 1, 2, 4). */
const LRI = "\u2066", PDI = "\u2069";
/**
 * Amount for display. Saudi Riyal shows the official symbol to the left of the number in every language, with a space,
 * and to the left of a minus sign (SAMA usage rules 1, 2 and 4); other currencies keep their ISO code. Stored values,
 * exports and server payloads keep "SAR" — use `fmtCurrencyPlain` there (and in print, where the glyph may not embed).
 */
export function fmtCurrency(n: number, currency?: string) {
  const s = sysFormat(); const cur = currency || s.currency;
  const v = fmtNumber(Number(n) || 0, s.currency_precision, s.number_format);
  return cur === "SAR" ? riyal(v) : `${cur} ${v}`;
}
/** Display amount with the Riyal symbol in a string written for export, mail or clipboard → "SAR 1,250.00". */
export function plainMoney(s: string): string { return s.replace(/\u2066\u20C1 ([^\u2069]*)\u2069/g, "SAR $1").replace(/\u20C1/g, "SAR"); }
/** Saudi Riyal display shared by every formatter: LTR-isolated "⃁ 1,250.00". */
export function riyal(v: string): string { return `${LRI}${RIYAL} ${v}${PDI}`; }
/** A figure an app passes as text ("SAR 8,525,000") shown with the Riyal sign like every other amount; other text is unchanged. */
export function sarText(t: string): string { return t.replace(/\bSAR ([-\u2212]?[\d.,]+[KMB]?)/g, (_m, n: string) => riyal(n)); }
/** Amount with the ISO code ("SAR 1,250.00", every language): print/PDF fallback and text that leaves the screen (OWN-66: SAR stays in data/exports). */
export function fmtCurrencyPlain(n: number, currency?: string) {
  const s = sysFormat(); const cur = currency || s.currency;
  const v = fmtNumber(Number(n) || 0, s.currency_precision, s.number_format);
  return `${cur} ${v}`;
}

let calendar: "Gregorian" | "Hijri" | "Both" = "Gregorian";
/** S9: set from the user's preference (userSettings.ts); display only, stored dates stay Gregorian ISO. */
export function setDisplayCalendar(c: "Gregorian" | "Hijri" | "Both" | undefined) { calendar = c ?? "Gregorian"; }
const isArDoc = () => typeof document !== "undefined" && document.documentElement.lang === "ar";
/** Umm al-Qura date of an ISO date, "dd-mm-yyyy هـ" / "dd-mm-yyyy AH". */
export function hijriDate(iso: string, ar = isArDoc()): string {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`); if (Number.isNaN(d.getTime())) return iso;
  const parts = new Intl.DateTimeFormat("en-u-ca-islamic-umalqura-nu-latn", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" }).formatToParts(d);
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${g("day")}-${g("month")}-${g("year").replace(/\D/g, "")} ${ar ? "هـ" : "AH"}`;
}
export function fmtDate(v: unknown, cal = calendar) {
  const m = String(v ?? "").match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/);
  if (!m) return String(v ?? "");
  const f = sysFormat().date_format.replace(/^dd-mm-yyyy$/, "dd/mm/yyyy");
  const g = f.replace("dd", m[3]!).replace("mm", m[2]!).replace("yyyy", m[1]!);
  const h = cal === "Gregorian" ? "" : hijriDate(m[0].slice(0, 10));
  const d = cal === "Hijri" ? h : cal === "Both" ? `${g} (${h})` : g;
  return m[4] ? `${d} ${m[4]}:${m[5]}` : d;
}

/** Display text for a value of a given fieldtype; `doc` resolves the currency option (e.g. "currency" or "Company:company:default_currency"). */
export function formatValue(fieldtype: string, v: unknown, opts: { options?: string | undefined; doc?: Doc | undefined } = {}): string {
  if (v === undefined || v === null || v === "") return fieldtype === "Currency" || fieldtype === "Float" || fieldtype === "Int" ? formatValue(fieldtype, 0, opts) : "";
  const s = sysFormat();
  switch (fieldtype) {
    case "Currency": {
      const o = opts.options ?? ""; let cur = "";
      if (o && !o.includes(":") && opts.doc) cur = String(opts.doc[o] ?? "");
      return fmtCurrency(Number(v), cur || String(opts.doc?.["currency"] || "") || s.currency);
    }
    case "Float": return fmtNumber(Number(v), s.float_precision, s.number_format);
    case "Int": return fmtNumber(Number(v), 0, s.number_format);
    case "Percent": return fmtNumber(Number(v), s.float_precision, s.number_format) + "%";
    case "Date": return fmtDate(v);
    case "Datetime": return fmtDate(v);
    default: return String(v);
  }
}

export const NUMERIC = new Set(["Currency", "Float", "Int", "Percent"]);
