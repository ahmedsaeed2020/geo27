/**
 * Entries of a section workspace's "Full reports" tab — the source-owned replacement of the Enterprise host patch
 * digit_enterprise/public/js/pro-sections.js reportKey / clearLabel / relabel / dedupeReportsTab (Frappe host only,
 * lazy-loaded by screen-assets.js on Pro routes; registered in src/plugins/experience/legacyPatches.ts):
 *
 *  - one entry per destination across the whole tab: placement reports first, then DIGIT Pro screens, then native
 *    reports, so the same report never appears twice under two labels;
 *  - a clarified bilingual label where the shared translation of a report name is ambiguous (the standard Arabic of
 *    both "Customer Ledger Summary" and "Supplier Ledger Summary" is "ملخص دفتر الأستاذ"; the statements hub is a
 *    center, not one statement).
 *
 * Pure: the tab renders exactly what this returns, so the rule is testable without a browser.
 */
import type { Bi } from "./command";
import type { NavItem, NavTarget, SectionPage } from "./nav";
import { pageItems } from "./nav";

/** Destination identity of a Reports-tab target (report names compare case-insensitively, Pro screens keep their search). */
export function destinationKey(t: NavTarget): string {
  if (t.kind === "report") return `report:${t.report.trim().toLowerCase()}`;
  if (t.kind === "pro") {
    const q = Object.entries(t.search ?? {}).filter(([, v]) => v !== undefined && v !== "").sort(([a], [b]) => a.localeCompare(b));
    return `pro:${t.to}${q.length ? `?${q.map(([k, v]) => `${k}=${v}`).join("&")}` : ""}`;
  }
  if (t.kind === "page") return `page:${t.page}`;
  return `${t.kind}:${JSON.stringify(t)}`;
}

/** Clarified labels keyed by destination; `when` = the source labels the clarification replaces (any other label stays). */
export const CLEAR_LABEL: Record<string, { when: string[]; label: Bi }> = {
  "report:customer ledger summary": { when: ["Customer Ledger Summary"], label: ["Customer Ledger Summary", "ملخص دفتر أستاذ العملاء"] },
  "report:supplier ledger summary": { when: ["Supplier Ledger Summary"], label: ["Supplier Ledger Summary", "ملخص دفتر أستاذ الموردين"] },
  "pro:/pro/statements": { when: ["Financial Statements"], label: ["Financial statements center", "مركز القوائم المالية"] },
};
export function clearLabel(key: string, label: string): Bi | undefined {
  const c = CLEAR_LABEL[key];
  return c && c.when.includes(label) ? c.label : undefined;
}

export interface ReportEntry { item: NavItem; key: string; clear?: Bi | undefined }
export interface ReportTab {
  /** Placement report names (PLACEMENTS_448 REPORT rows of this workspace), in placement order, each with its clarified label. */
  placements: { name: string; key: string; clear?: Bi | undefined }[];
  pro: ReportEntry[];
  native: ReportEntry[];
  /** Owner-research capabilities this Core does not have (never linked). */
  gaps: NavItem[];
}

export function reportTabEntries(page: SectionPage, placementReports: readonly string[] = []): ReportTab {
  const seen = new Set<string>();
  const placements = placementReports.flatMap((name) => {
    const key = destinationKey({ kind: "report", report: name });
    if (seen.has(key)) return [];
    seen.add(key);
    return [{ name, key, clear: clearLabel(key, name) }];
  });
  const items = pageItems(page);
  const entries: ReportEntry[] = [];
  for (const item of items) {
    const k = item.target.kind;
    if (k !== "report" && k !== "pro" && k !== "page") continue;
    const key = destinationKey(item.target);
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push({ item, key, clear: clearLabel(key, item.label) });
  }
  const gapSeen = new Set<string>();
  const gaps = items.filter((i) => {
    if (i.target.kind !== "missing") return false;
    const g = `${i.label}|${JSON.stringify(i.target)}`;
    if (gapSeen.has(g)) return false;
    gapSeen.add(g); return true;
  });
  return { placements, pro: entries.filter((e) => e.item.target.kind === "pro"), native: entries.filter((e) => e.item.target.kind !== "pro"), gaps };
}
