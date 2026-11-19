import { isServerHosted } from "@/lib/serverHost";
/** Deterministic, explicit synthetic fixture. No external I/O or ledger writes. Generator: ./demoGenerator.ts. */
import { adapter } from "@/lib/adapter";
import { activeDemoProfile, CRM_DEMO_PROFILE, demoPartitionAvailable, markDemoFixture } from "./dataContext";
import { switchUser } from "@/lib/session";
import { setEnabled } from "../runtime";
import { currentUser } from "@/lib/session";
import { cleanDate, demoAsOf, demoCounts, seedEnterpriseDemo } from "./demoGenerator";
export { DEMO_COUNTS, DEMO_VERSION, demoAsOf, demoCompany, demoCounts, demoUser, demoVersion, seedEnterpriseDemo } from "./demoGenerator";
import { forgetSuspendedCrmDemo, rememberOwnRecords } from "./demoContext";


/** Explicit activation; no ordinary store copies, seed-on-read or network calls. An already stored demo is reused as is.
 *  The choice is saved for the activating user (User Settings app_data_context), so it survives refresh and browser restart. */
/** Final Core: the isolated demo partition is not imported (one shared store, gap CRM-G1); explicit activation reports it. */
export const DEMO_UNAVAILABLE = "The isolated CRM demo dataset is not available in the Final Core: DIGIT CRM works on the shared records.";
export function activateEnterpriseDemo(asOf = new Date().toISOString().slice(0, 10)): Record<string, number> {
  cleanDate(asOf);
  if (!demoPartitionAvailable) throw new Error(DEMO_UNAVAILABLE);
  return demoCounts();
}
/** Final Core: nothing to leave (shared records only). */
export function leaveEnterpriseDemo() { forgetSuspendedCrmDemo(); rememberOwnRecords(currentUser()); }
export function reseedEnterpriseDemo(asOf: string): Record<string, number> {
  cleanDate(asOf);
  if (!activeDemoProfile()) throw new Error(DEMO_UNAVAILABLE);
  return seedEnterpriseDemo(asOf);
}

/**
 * Test fixture (vitest only): seeds the source's deterministic enterprise demo generator into the in-memory shared store of
 * a test run (no browser storage quota, no partition), so the source's 80-widget reconciliation tests keep their corpus.
 */
export function seedEnterpriseDemoFixture(asOf: string) {
  if (isServerHosted()) return undefined as never;
  cleanDate(asOf); markDemoFixture(true); unboundedTestStorage();
  setEnabled("digit_crm", true); setEnabled("digit_crm_demo", true); switchUser("Administrator");
  if (demoAsOf()) return demoCounts();
  return adapter.batch(() => seedEnterpriseDemo(asOf));
}
/** The generated corpus (~15k records) exceeds a 5 MB browser storage quota — the reason it never enters the shared app
 *  store. A test run copies its storage into an unbounded in-memory Storage before seeding. */
function unboundedTestStorage() {
  const g = globalThis as unknown as { localStorage: Storage; __crmUnbounded?: boolean };
  if (g.__crmUnbounded) return;
  const mem = new Map<string, string>();
  try { for (let i = 0; i < g.localStorage.length; i++) { const k = g.localStorage.key(i); if (k != null) mem.set(k, g.localStorage.getItem(k) ?? ""); } } catch { /* none */ }
  g.localStorage = { get length() { return mem.size; }, key: (i: number) => [...mem.keys()][i] ?? null, getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => { mem.set(k, String(v)); }, removeItem: (k: string) => { mem.delete(k); }, clear: () => mem.clear() } as Storage;
  g.__crmUnbounded = true;
}
export function clearEnterpriseDemoFixture() { setEnabled("digit_crm_demo", false); markDemoFixture(false); switchUser("Administrator"); }
