/**
 * The company the shared Core demo data belongs to: the trading demo company (abbr DDT) — the one that holds the demo
 * vouchers and that every screen opens on (Global Defaults / session default) — else the first synthetic company.
 * Owner 2026-11-13: the preview's set-up company "Digit Synthetic Co" is created first, so picking "the first synthetic
 * company" put the controls, close tasks, policies and dock samples on a company no screen opens.
 */
import { adapter, type Doc } from "@/lib/adapter";

export function pickDemoCompany(all: Doc[]): Doc | undefined {
  const syn = all.filter((c) => c["__synthetic"]);
  return syn.find((c) => String(c["abbr"] ?? "") === "DDT") ?? syn[0] ?? all[0];
}
export const demoCompany = (): Doc | undefined => pickDemoCompany(adapter.list("Company"));

/** Abbreviation of the company earlier builds seeded the shared samples under, when it is not the demo company. */
export function legacyDemoAbbr(): string {
  const first = adapter.list("Company").find((c) => c["__synthetic"]); const demo = demoCompany();
  return first && demo && first.name !== demo.name ? String(first["abbr"] ?? "") : "";
}
/** Company-independent samples (screen reports, supplier bank accounts, item alternatives, item-group emission factors) are
 *  inserted once: a browser that already holds the earlier copy keeps it instead of getting a twin. */
export function hasLegacyTwin(dt: string, name: string, data: Record<string, unknown>, abbr: string): boolean {
  const old = legacyDemoAbbr(); if (!old || !name.startsWith(`${abbr}-`)) return false;
  const global = dt === "Issue" || dt === "Bank Account" || dt === "Item Alternative" || (dt === "Digit Emission Factor" && data["basis"] === "Item Group");
  return global && !!adapter.get(dt, `${old}-${name.slice(abbr.length + 1)}`);
}
