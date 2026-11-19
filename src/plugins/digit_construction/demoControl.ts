/**
 * "Remove demo data" / "Load demo data" (owner round 2026-11-14, Construction Settings). The connected demo (seed.ts,
 * persisted, marked __demo) and the sample layer (volume.ts + demoPortfolio.ts, memory only, marked __sample) both carry
 * __plugin = digit_construction, so one switch removes every demo document of the app together with the ledger rows
 * posting.ts wrote for them, and keeps the setup the app needs (company, chart of accounts, warehouses, users and
 * their permissions, policy decisions, settings, print branding, saved views). Records the user created are never
 * marked and are never removed. Loading again re-runs the same insert-if-missing installers.
 */
import { adapter, type Doc } from "@/lib/adapter";
import { runVolumeProvider } from "@/lib/volume";

const FLAG = "digit-construction:demo-data";
const APP = "digit_construction";
/** setup records the app needs even without demo documents */
const KEEP = new Set(["Company", "Account", "Cost Center", "Warehouse", "UOM", "Item Group", "Customer Group", "Supplier Group", "Territory", "Price List", "Fiscal Year", "Mode of Payment",
  "Sales Taxes and Charges Template", "Purchase Taxes and Charges Template", "Item Tax Template", "Tax Category", "User", "User Permission", "Role", "Role Profile", "Designation", "Department",
  "Digit Policy Decision", "Digit Construction Settings", "Digit Print Branding", "Digit Saved View", "Digit Dashboard Layout", "Kanban Board", "Report", "Workflow", "Workflow State",
  "Number Card", "Dashboard Chart", "Print Format", "Letter Head", "Notification", "Custom Field", "Property Setter", "Holiday List"]);
const LEDGERS = new Set(["GL Entry", "Stock Ledger Entry", "Payment Ledger Entry"]);

/** Whether the app's demo data is switched on for this browser (default on). */
export function demoDataOn(): boolean {
  try { return typeof localStorage === "undefined" || localStorage.getItem(FLAG) !== "off"; } catch { return true; }
}
const isDemo = (dt: string, d: Doc) => d["__plugin"] === APP && (!!d["__demo"] || !!d["__sample"]) && !KEEP.has(dt);
/** Demo documents of the app currently present (persisted and memory-only). */
export function demoRecordCount(): { documents: number; doctypes: number } {
  let documents = 0; const dts = new Set<string>();
  for (const dt of adapter.doctypes()) for (const d of adapter.list(dt)) if (isDemo(dt, d)) { documents++; dts.add(dt); }
  return { documents, doctypes: dts.size };
}
/** Remove every demo document of the app and the ledger rows posted for them; returns the number of records removed. */
export function removeConstructionDemo(): number {
  const gone = new Set<string>();
  for (const dt of adapter.doctypes()) for (const d of adapter.list(dt)) if (isDemo(dt, d)) gone.add(`${dt}|${d.name}`);
  const n = adapter.purge((dt, d) => gone.has(`${dt}|${d.name}`) || (LEDGERS.has(dt) && gone.has(`${String(d["voucher_type"] ?? "")}|${String(d["voucher_no"] ?? "")}`)));
  try { localStorage.setItem(FLAG, "off"); } catch { /* storage blocked */ }
  return n;
}
/** Switch demo data on again and run the installers (the connected demo through `install`, then the sample layer). */
export function loadConstructionDemo(install: () => number): number {
  try { localStorage.setItem(FLAG, "on"); } catch { /* storage blocked */ }
  return install() + runVolumeProvider(APP).inserted;
}
