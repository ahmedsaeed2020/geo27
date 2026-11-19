/**
 * Display labels for the Enterprise templates and chart kit: no internal codes on screen (owner 2026-11-12 §A).
 * Stored names never change — these helpers only shape what a chart axis, legend or tile shows.
 */
import { translateTo } from "@/i18n";
import { adapter } from "@/lib/adapter";
import { cachedMeta } from "@/lib/catalog";

/** "Jeddah - DDT" → "Jeddah": a company abbreviation appended to master names (cost centres, warehouses, accounts) is dropped. */
export function cleanLabel(s: string | null | undefined): string {
  const v = String(s ?? "").trim();
  if (!v) return v;
  return v.replace(/\s+-\s+[A-Z][A-Z0-9]{1,5}$/u, "").replace(/^[A-Z][A-Z0-9]{1,5}\s+-\s+/u, "").trim() || v;
}
/** Internal screen/metric codes (EXE-01, ACC-OPS, WS3-ACC-1, SC-F-02 …) never appear as visible text. */
export const INTERNAL_CODE = /\b(?:EXE|ACC|SEL|PUR|INV|AST|FIN|WS3|SC|OWN|RPT|RPL)-[A-Z0-9]+(?:-[A-Z0-9]+)*\b/u;
export function stripCodes(s: string): string { return s.replace(new RegExp(INTERNAL_CODE.source, "gu"), "").replace(/(?:\s*[·•|]\s*){2,}/gu, " · ").replace(/^\s*[·•|-]\s*|\s*[·•|-]\s*$/gu, "").replace(/\s{2,}/gu, " ").trim(); }
/** A DocType / report name in the UI language (the stored name stays English). */
export function docLabel(name: string, ar: boolean): string { return ar ? translateTo(name, "ar") : name; }

const TITLE_OF: Readonly<Record<string, string>> = { Customer: "customer_name", Supplier: "supplier_name", Item: "item_name", Employee: "employee_name", Project: "project_name", Asset: "asset_name", Task: "subject" };
/**
 * Readable title of a master record shown by its code (a party, item or employee named "DDT-V-CUST-005"): the record's title
 * field when a record of one of `doctypes` carries that name, else the value cleaned of a company suffix. Display only.
 */
export function recordLabel(value: string | null | undefined, doctypes: readonly string[] = ["Customer", "Supplier", "Item", "Employee"]): string {
  const v = String(value ?? "");
  if (!v) return v;
  for (const dt of doctypes) {
    const doc = adapter.get(dt, v); if (!doc) continue;
    const f = (cachedMeta(dt) as { title_field?: string } | undefined)?.title_field || TITLE_OF[dt];
    const t = f ? doc[f] : undefined;
    if (typeof t === "string" && t.trim()) return t.trim();
  }
  return cleanLabel(v);
}
